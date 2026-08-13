/**
 * gesture-worker.js
 *
 * Web Worker that owns the MediaPipe Hands inference loop.
 * Runs entirely off the main thread so rendering is never blocked.
 *
 * Message protocol (main → worker):
 *   { type: 'INIT',  config: { ... } }
 *   { type: 'FRAME', bitmap: ImageBitmap, timestamp: number }
 *   { type: 'STOP' }
 *
 * Message protocol (worker → main):
 *   { type: 'READY' }
 *   { type: 'RESULTS', hands: [...], timestamp: number, frame: number }
 *   { type: 'ERROR',  message: string }
 *   { type: 'FPS',    fps: number }         — emitted every 60 frames
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKER_DEFAULTS = {
  maxNumHands:            1,
  modelComplexity:        0,     // lite model — fastest path
  minDetectionConfidence: 0.35,
  minTrackingConfidence:  0.30,
  flipHorizontal:         true,

  // Lerp alpha applied to landmark positions each frame.
  // 0 = never moves (fully smoothed), 1 = raw (no smoothing).
  // 0.45 blends 2-3 frames, giving silky motion without noticeable lag.
  lerpAlpha: 0.45,

  // Target output frame-rate (30fps = half CPU load, still smooth to eye).
  // The camera still runs at its native rate; we just drop frames here.
  targetFps: 30,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let hands        = null;   // MediaPipe Hands instance
let config       = null;   // Merged config
let frameCount   = 0;      // Total frames processed
let busy         = false;  // True while MediaPipe is running inference
let running      = false;  // False after STOP received

// Per-landmark smoothed positions.
// Indexed as prevLandmarks[handIndex][landmarkIndex] = {x, y, z}
// We track a single hand (index 0) per WORKER_DEFAULTS.maxNumHands:1.
let prevLandmarks = null;

// FPS tracking
let fpsFrameCount  = 0;
let fpsWindowStart = 0;

// Frame-rate throttle: track when last frame was emitted
let lastEmitTime = 0;

// ---------------------------------------------------------------------------
// Lerp utility
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Blend a fresh set of landmarks into the smoothed set.
 * Operates in-place to avoid GC pressure in the hot loop.
 *
 * @param {Array<{x,y,z}>} prev   - Previous smoothed landmarks (may be null)
 * @param {Array<{x,y,z}>} fresh  - Raw landmarks from MediaPipe
 * @param {number}          alpha  - Lerp factor (0 = frozen, 1 = raw)
 * @returns {Array<{x,y,z}>} smoothed landmarks (new array first call, reused after)
 */
function blendLandmarks(prev, fresh, alpha) {
  if (!prev || prev.length !== fresh.length) {
    // First frame for this hand — initialize directly from raw data
    return fresh.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }));
  }

  const out = [];
  for (let i = 0; i < fresh.length; i++) {
    out.push({
      x: lerp(prev[i].x, fresh[i].x, alpha),
      y: lerp(prev[i].y, fresh[i].y, alpha),
      z: lerp(prev[i].z, fresh[i].z, alpha),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// MediaPipe bootstrap
// ---------------------------------------------------------------------------

/**
 * Load MediaPipe inside the worker via importScripts.
 * Workers cannot access the DOM so we pull from CDN directly.
 */
function loadMediaPipe() {
  try {
    importScripts(
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'
    );
    return true;
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: `importScripts failed: ${err.message}` });
    return false;
  }
}

/**
 * Build and configure the MediaPipe Hands instance.
 * Resolves when the model is loaded (first send warms the pipeline).
 */
function initHands(cfg) {
  return new Promise((resolve, reject) => {
    if (typeof Hands === 'undefined') {
      reject(new Error('MediaPipe Hands not available in worker scope'));
      return;
    }

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands:            cfg.maxNumHands,
      modelComplexity:        cfg.modelComplexity,
      minDetectionConfidence: cfg.minDetectionConfidence,
      minTrackingConfidence:  cfg.minTrackingConfidence,

      // Request GPU delegate where available (WebGL in the worker).
      // Falls back to WASM automatically if GPU is unavailable.
      useCpuInference: false,
    });

    hands.onResults((results) => {
      processResults(results);
      busy = false;
    });

    // MediaPipe initializes lazily — resolve immediately.
    // The pipeline warms on the first real frame.
    resolve();
  });
}

// ---------------------------------------------------------------------------
// Per-frame processing
// ---------------------------------------------------------------------------

/**
 * Normalizes raw MediaPipe results:
 *   - Flips x coordinates when flipHorizontal is true
 *   - Corrects the Left/Right label swap caused by mirroring
 *   - Applies Lerp smoothing to landmark positions
 *
 * Sends a RESULTS message to the main thread.
 */
function processResults(rawResults) {
  const now = performance.now();

  // Throttle: drop frames to hit targetFps
  const minInterval = 1000 / config.targetFps;
  if (now - lastEmitTime < minInterval) {
    return; // Frame dropped — within throttle window
  }
  lastEmitTime = now;

  const rawLandmarks     = rawResults.multiHandLandmarks     || [];
  const rawHandedness    = rawResults.multiHandedness        || [];
  const rawWorldLandmarks = rawResults.multiHandWorldLandmarks || [];

  const processedHands = [];

  for (let i = 0; i < rawLandmarks.length; i++) {
    const side = rawHandedness[i];

    // MediaPipe swaps Left/Right when the feed is mirrored — correct it
    const label = config.flipHorizontal
      ? (side.label === 'Left' ? 'Right' : 'Left')
      : side.label;

    // Flip x if mirrored
    const flippedLandmarks = rawLandmarks[i].map((lm) => ({
      x: config.flipHorizontal ? 1 - lm.x : lm.x,
      y: lm.y,
      z: lm.z,
    }));

    // Lerp smoothing — blend into previous frame
    const smoothed = blendLandmarks(
      prevLandmarks ? prevLandmarks[i] : null,
      flippedLandmarks,
      config.lerpAlpha
    );

    // Store for next frame
    if (!prevLandmarks) prevLandmarks = [];
    prevLandmarks[i] = smoothed;

    processedHands.push({
      side:          label,
      confidence:    side.score,
      landmarks:     smoothed,
      worldLandmarks: rawWorldLandmarks[i] || [],
    });
  }

  // If no hands detected this frame, clear smoothing history
  if (rawLandmarks.length === 0) {
    prevLandmarks = null;
  }

  // Sort: dominant (Right) hand first
  processedHands.sort((a, b) => (a.side === 'Right' ? -1 : 1));

  // FPS counter
  fpsFrameCount++;
  if (fpsFrameCount % 60 === 0) {
    const elapsed = now - fpsWindowStart;
    const fps = Math.round((60 / elapsed) * 1000);
    fpsWindowStart = now;
    self.postMessage({ type: 'FPS', fps });
  }

  // Emit to main thread
  self.postMessage({
    type:      'RESULTS',
    hands:     processedHands,
    timestamp: now,
    frame:     frameCount,
  });
}

// ---------------------------------------------------------------------------
// Frame dispatch
// ---------------------------------------------------------------------------

/**
 * Send an ImageBitmap into MediaPipe for inference.
 * ImageBitmap is transferable: main thread already transferred ownership.
 *
 * We skip frames while MediaPipe is still busy from the last send
 * (prevents queue buildup under heavy load).
 */
async function sendFrame(bitmap, timestamp) {
  if (!hands || !running) {
    bitmap.close();
    return;
  }

  if (busy) {
    // Drop frame — inference is still running from last send
    bitmap.close();
    return;
  }

  frameCount++;
  busy = true;

  try {
    await hands.send({ image: bitmap });
    // Note: busy is reset to false inside the onResults callback.
    // If onResults is never called (e.g. model error), the finally block
    // below ensures bitmap is still released, but busy remains true which
    // will naturally throttle subsequent sends until the worker recovers.
  } catch (err) {
    // hands.send threw synchronously — reset busy so the next frame can proceed
    busy = false;
    self.postMessage({ type: 'ERROR', message: `hands.send failed: ${err.message}` });
  } finally {
    // ImageBitmap must be released after use regardless of outcome
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async function handleMessage(event) {
  const { type, config: cfg, bitmap, timestamp } = event.data;

  switch (type) {
    // -----------------------------------------------------------------------
    case 'INIT': {
      config = Object.assign({}, WORKER_DEFAULTS, cfg || {});
      fpsWindowStart = performance.now();

      const loaded = loadMediaPipe();
      if (!loaded) return;

      try {
        await initHands(config);
        running = true;
        self.postMessage({ type: 'READY' });
      } catch (err) {
        self.postMessage({ type: 'ERROR', message: `Init failed: ${err.message}` });
      }
      break;
    }

    // -----------------------------------------------------------------------
    case 'FRAME': {
      if (!running) {
        if (bitmap) bitmap.close();
        break;
      }
      await sendFrame(bitmap, timestamp);
      break;
    }

    // -----------------------------------------------------------------------
    case 'STOP': {
      running = false;
      if (hands) {
        hands.close();
        hands = null;
      }
      prevLandmarks = null;
      self.postMessage({ type: 'STOPPED' });
      break;
    }

    // -----------------------------------------------------------------------
    default:
      self.postMessage({ type: 'ERROR', message: `Unknown message type: ${type}` });
  }
};

// Notify any diagnostics that the worker script itself parsed cleanly
self.postMessage({ type: 'WORKER_READY' });
