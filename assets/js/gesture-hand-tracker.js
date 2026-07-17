/**
 * gesture-hand-tracker.js
 *
 * Handles webcam setup and raw landmark delivery.
 * MediaPipe inference runs inside gesture-worker.js (Web Worker) so the
 * main thread is never blocked during rendering.
 *
 * Falls back to running MediaPipe on the main thread if:
 *   - Web Workers are unsupported
 *   - Worker script fails to load
 *   - OffscreenCanvas / createImageBitmap are unavailable
 *
 * Public API is identical to the pre-worker version — downstream code
 * (gesture-detector.js, particle-gesture-controller.js) requires no changes.
 *
 * Dependencies (loaded in <head> before this script):
 *   https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js
 *   https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js
 *
 * Usage:
 *   const tracker = new GestureHandTracker({ onResults: handleResults });
 *   await tracker.init();
 *   tracker.start();
 *   tracker.stop();   // pause (webcam stays open)
 *   tracker.destroy(); // full teardown
 */

'use strict';

// ---------------------------------------------------------------------------
// Auto-detect this script's directory so gesture-worker.js can be found
// without hardcoding theme-specific paths. Works whether Ghost serves
// assets at /assets/js/, /content/themes/foo/assets/js/, or any CDN URL.
// ---------------------------------------------------------------------------

const _SCRIPT_DIR = (() => {
  // currentScript is set while this script is first parsed
  const src = document.currentScript && document.currentScript.src;
  if (src) {
    return src.substring(0, src.lastIndexOf('/') + 1);
  }
  // Fallback: scan all loaded scripts for our filename
  const scripts = document.querySelectorAll('script[src]');
  for (const s of scripts) {
    if (s.src.includes('gesture-hand-tracker')) {
      return s.src.substring(0, s.src.lastIndexOf('/') + 1);
    }
  }
  // Last resort: assume same directory as the page
  return window.location.origin + '/assets/js/';
})();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACKER_DEFAULTS = {
  // Single hand — halves MediaPipe workload
  maxNumHands: 1,

  // 0 = lite model (fastest). Drop to 0 when running in worker.
  modelComplexity: 0,

  // Lower thresholds = faster detection + slightly noisier tracking.
  // The Lerp smoothing in the worker compensates for the noise.
  minDetectionConfidence: 0.35,
  minTrackingConfidence:  0.30,

  // Camera resolution: 640×480 is MediaPipe's sweet spot.
  cameraWidth:  640,
  cameraHeight: 480,

  // Camera FPS fed to MediaPipe Camera utility.
  // Worker throttles its own output to 30fps; full-rate input ensures
  // the worker always has a fresh frame ready when it finishes inference.
  cameraFps: 30,

  // Mirror the feed so left/right feel natural
  flipHorizontal: true,

  // CSS selector for the hidden <video> element
  videoSelector: '#gesture-video',

  // Optional debug canvas selector (null = disabled)
  debugCanvasSelector: null,

  // Full URL to gesture-worker.js — auto-resolved from this script's location.
  // Override via trackerConfig.workerPath if needed.
  workerPath: `${_SCRIPT_DIR}gesture-worker.js`,

  // Lerp smoothing alpha forwarded to worker (0 = frozen, 1 = raw)
  lerpAlpha: 0.45,

  // Worker output frame-rate target
  targetFps: 30,
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Detect worker + ImageBitmap support in one place
function workerSupported() {
  return (
    typeof Worker !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

// ---------------------------------------------------------------------------
// GestureHandTracker
// ---------------------------------------------------------------------------

class GestureHandTracker {
  /**
   * @param {object} options
   * @param {function} options.onResults  - Called every frame with:
   *   { hands: Array<HandObject>, timestamp: number, frame: number }
   * @param {function} [options.onReady]  - Called once webcam + model are live
   * @param {function} [options.onError]  - Called with an Error on failure
   * @param {object}   [options.config]   - Overrides for TRACKER_DEFAULTS
   */
  constructor(options = {}) {
    this._onResults = options.onResults || null;
    this._onReady   = options.onReady   || null;
    this._onError   = options.onError   || null;
    this._config    = Object.assign({}, TRACKER_DEFAULTS, options.config || {});

    // Worker-mode state
    this._worker          = null;   // Web Worker instance
    this._workerReady     = false;  // True after READY message received
    this._useWorker       = false;  // Set during init()

    // Fallback (main-thread) state
    this._hands           = null;   // MediaPipe Hands (fallback only)

    // Shared state
    this._camera          = null;   // MediaPipe Camera instance
    this._videoEl         = null;   // HTMLVideoElement
    this._debugCtx        = null;   // CanvasRenderingContext2D | null
    this._running         = false;
    this._frameCount      = 0;

    // FPS display (populated by worker FPS messages)
    this._currentFps      = 0;

    // Last delivered results (poll synchronously if needed)
    this.lastResults      = null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load MediaPipe model and prepare the webcam.
   * Returns a Promise that resolves when ready to call start().
   */
  async init() {
    this._videoEl  = this._getVideoElement();
    this._debugCtx = this._getDebugContext();

    if (workerSupported()) {
      this._useWorker = true;
      await this._initWorker();
    } else {
      console.warn('[hand-tracker] Web Workers not supported — falling back to main thread.');
      this._useWorker = false;
      this._validateMainThreadDependencies();
      await this._initMainThreadHands();
    }

    await this._initCamera();

    if (this._onReady) this._onReady();
  }

  /**
   * Begin processing frames. Call after init() resolves.
   */
  start() {
    if (!this._camera) {
      throw new Error('GestureHandTracker: call init() before start()');
    }
    if (this._running) return;

    this._running = true;
    this._camera.start().catch((err) => {
      this._running = false;
      this._emitError(new Error(`Camera start failed: ${err.message}`));
    });
  }

  /**
   * Pause frame processing. Webcam stream stays open.
   * Resume with start() — no re-init required.
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._camera) this._camera.stop();
  }

  /**
   * Full teardown: stop camera, terminate worker, release MediaPipe.
   */
  destroy() {
    this.stop();

    if (this._worker) {
      this._worker.postMessage({ type: 'STOP' });
      // Give worker 500ms to clean up then force-terminate
      setTimeout(() => {
        if (this._worker) {
          this._worker.terminate();
          this._worker = null;
        }
      }, 500);
    }

    if (this._hands) {
      this._hands.close();
      this._hands = null;
    }

    this._camera   = null;
    this._videoEl  = null;
    this._debugCtx = null;
  }

  /** True if the tracker is actively capturing frames. */
  get isRunning() { return this._running; }

  /** Total frames captured since start(). */
  get frameCount() { return this._frameCount; }

  /** Last reported worker FPS (0 in fallback mode). */
  get currentFps() { return this._currentFps; }

  /** True if running in worker mode (false = main-thread fallback). */
  get usingWorker() { return this._useWorker; }

  // -------------------------------------------------------------------------
  // Private — worker setup
  // -------------------------------------------------------------------------

  _initWorker() {
    return new Promise((resolve, reject) => {
      const workerUrl = this._resolveWorkerPath(this._config.workerPath);

      try {
        this._worker = new Worker(workerUrl);
      } catch (err) {
        this._useWorker = false;
        console.warn(`[hand-tracker] Worker failed to construct: ${err.message}. Falling back.`);
        this._validateMainThreadDependencies();
        return this._initMainThreadHands().then(resolve).catch(reject);
      }

      // Timeout: if worker doesn't report READY within 10s, fall back
      const timeout = setTimeout(() => {
        console.warn('[hand-tracker] Worker READY timeout — falling back to main thread.');
        this._teardownWorker();
        this._useWorker = false;
        this._validateMainThreadDependencies();
        this._initMainThreadHands().then(resolve).catch(reject);
      }, 10_000);

      this._worker.onmessage = (event) => {
        const { type } = event.data;

        if (type === 'WORKER_READY') {
          // Worker script loaded — send config to start MediaPipe init
          this._worker.postMessage({
            type: 'INIT',
            config: {
              maxNumHands:            this._config.maxNumHands,
              modelComplexity:        this._config.modelComplexity,
              minDetectionConfidence: this._config.minDetectionConfidence,
              minTrackingConfidence:  this._config.minTrackingConfidence,
              flipHorizontal:         this._config.flipHorizontal,
              lerpAlpha:              this._config.lerpAlpha,
              targetFps:              this._config.targetFps,
            },
          });
          return;
        }

        if (type === 'READY') {
          clearTimeout(timeout);
          this._workerReady = true;
          console.log('[hand-tracker] Worker ready — MediaPipe running off-thread.');
          resolve();
          return;
        }

        if (type === 'RESULTS') {
          this._handleWorkerResults(event.data);
          return;
        }

        if (type === 'FPS') {
          this._currentFps = event.data.fps;
          return;
        }

        if (type === 'ERROR') {
          console.error('[hand-tracker] Worker error:', event.data.message);
          this._emitError(new Error(event.data.message));
          return;
        }

        if (type === 'STOPPED') {
          console.log('[hand-tracker] Worker stopped cleanly.');
          return;
        }
      };

      this._worker.onerror = (err) => {
        clearTimeout(timeout);
        console.warn(`[hand-tracker] Worker onerror: ${err.message}. Falling back.`);
        this._teardownWorker();
        this._useWorker = false;
        this._validateMainThreadDependencies();
        this._initMainThreadHands().then(resolve).catch(reject);
      };
    });
  }

  _teardownWorker() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
      this._workerReady = false;
    }
  }

  _resolveWorkerPath(path) {
    // If it already looks like an absolute URL, use it as-is
    if (path.startsWith('http') || path.startsWith('//')) return path;
    // Otherwise resolve relative path against current page URL
    return new URL(path, window.location.href).href;
  }

  // -------------------------------------------------------------------------
  // Private — main-thread fallback setup
  // -------------------------------------------------------------------------

  _validateMainThreadDependencies() {
    if (typeof Hands === 'undefined') {
      throw new Error(
        'GestureHandTracker: MediaPipe Hands not found. ' +
        'Load https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js before this script.'
      );
    }
    if (typeof Camera === 'undefined') {
      throw new Error(
        'GestureHandTracker: MediaPipe Camera Utils not found. ' +
        'Load https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js before this script.'
      );
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'GestureHandTracker: getUserMedia not available. Requires HTTPS or localhost.'
      );
    }
  }

  async _initMainThreadHands() {
    const cfg = this._config;

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands:            cfg.maxNumHands,
      modelComplexity:        cfg.modelComplexity,
      minDetectionConfidence: cfg.minDetectionConfidence,
      minTrackingConfidence:  cfg.minTrackingConfidence,
    });

    this._hands.onResults((results) => this._handleMainThreadResults(results));
  }

  // -------------------------------------------------------------------------
  // Private — camera setup (shared by both modes)
  // -------------------------------------------------------------------------

  _getVideoElement() {
    const el = document.querySelector(this._config.videoSelector);
    if (!el) {
      const video = document.createElement('video');
      video.id = 'gesture-video';
      video.setAttribute('playsinline', '');
      video.style.cssText =
        'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(video);
      console.warn(
        `GestureHandTracker: ${this._config.videoSelector} not found — auto-created hidden video element.`
      );
      return video;
    }
    return el;
  }

  _getDebugContext() {
    if (!this._config.debugCanvasSelector) return null;
    const canvas = document.querySelector(this._config.debugCanvasSelector);
    if (!canvas) return null;
    canvas.width  = this._config.cameraWidth;
    canvas.height = this._config.cameraHeight;
    return canvas.getContext('2d');
  }

  async _initCamera() {
    const cfg = this._config;

    this._camera = new Camera(this._videoEl, {
      onFrame: async () => {
        if (!this._running) return;

        if (this._useWorker) {
          await this._sendFrameToWorker();
        } else {
          // Main-thread fallback: send directly to MediaPipe
          await this._hands.send({ image: this._videoEl });
          this._frameCount++;
        }
      },
      width:      cfg.cameraWidth,
      height:     cfg.cameraHeight,
      facingMode: 'user',
    });
  }

  // -------------------------------------------------------------------------
  // Private — worker frame dispatch
  // -------------------------------------------------------------------------

  /**
   * Captures the current video frame as an ImageBitmap and transfers it
   * (zero-copy) to the worker.
   *
   * createImageBitmap is non-blocking on the main thread; the actual pixel
   * copy happens asynchronously before transfer, so the main thread is
   * only blocked for the few microseconds of the createImageBitmap call.
   */
  async _sendFrameToWorker() {
    if (!this._workerReady || !this._worker) return;

    let bitmap;
    try {
      bitmap = await createImageBitmap(this._videoEl);
    } catch (err) {
      // Video not ready yet (e.g. first few frames after camera start)
      return;
    }

    this._frameCount++;

    // Transfer bitmap ownership to worker (avoids copy)
    this._worker.postMessage(
      { type: 'FRAME', bitmap, timestamp: performance.now() },
      [bitmap]
    );
  }

  // -------------------------------------------------------------------------
  // Private — result handlers
  // -------------------------------------------------------------------------

  /**
   * Handles RESULTS messages from the worker.
   * The worker has already applied flipping, label correction, and Lerp.
   * We just need to emit onResults in the expected shape.
   */
  _handleWorkerResults({ hands, timestamp, frame }) {
    this.lastResults = { hands, timestamp, frame };

    if (this._debugCtx && hands.length > 0) {
      this._drawDebugOverlay(hands);
    }

    if (frame % 60 === 0) {
      console.log(
        `[hand-tracker] Frame ${frame}: ${hands.length} hand(s) — ` +
        `worker mode, ~${this._currentFps}fps output`
      );
    }

    if (this._onResults) {
      this._onResults({ hands, timestamp, frame });
    }
  }

  /**
   * Handles raw MediaPipe results in main-thread fallback mode.
   * Mirrors the normalization logic from the original implementation.
   */
  _handleMainThreadResults(rawResults) {
    const cfg = this._config;
    const processedHands = [];

    const landmarks      = rawResults.multiHandLandmarks      || [];
    const handedness     = rawResults.multiHandedness         || [];
    const worldLandmarks = rawResults.multiHandWorldLandmarks || [];

    for (let i = 0; i < landmarks.length; i++) {
      const side  = handedness[i];
      const label = cfg.flipHorizontal
        ? (side.label === 'Left' ? 'Right' : 'Left')
        : side.label;

      processedHands.push({
        side:       label,
        confidence: side.score,
        landmarks:  landmarks[i].map((lm) => ({
          x: cfg.flipHorizontal ? 1 - lm.x : lm.x,
          y: lm.y,
          z: lm.z,
        })),
        worldLandmarks: worldLandmarks[i] || [],
      });
    }

    processedHands.sort((a, b) => (a.side === 'Right' ? -1 : 1));

    if (this._debugCtx && processedHands.length > 0) {
      this._drawDebugOverlay(processedHands);
    }

    if (this._frameCount % 30 === 0) {
      console.log(
        `[hand-tracker] Frame ${this._frameCount}: ${processedHands.length} hand(s) ` +
        `— main-thread fallback mode`
      );
    }

    this.lastResults = {
      hands:     processedHands,
      timestamp: performance.now(),
      frame:     this._frameCount,
    };

    if (this._onResults) this._onResults(this.lastResults);
  }

  // -------------------------------------------------------------------------
  // Private — debug overlay
  // -------------------------------------------------------------------------

  _drawDebugOverlay(hands) {
    const ctx = this._debugCtx;
    const w   = this._config.cameraWidth;
    const h   = this._config.cameraHeight;

    ctx.clearRect(0, 0, w, h);

    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17],
    ];

    for (const hand of hands) {
      const lms   = hand.landmarks;
      const color = hand.side === 'Right' ? '#00ff88' : '#ff4488';

      // Mode badge
      const modeTag = this._useWorker ? 'W' : 'F';

      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      for (const [a, b] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lms[a].x * w, lms[a].y * h);
        ctx.lineTo(lms[b].x * w, lms[b].y * h);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      for (const lm of lms) {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.font      = '14px monospace';
      ctx.fillText(
        `${hand.side} (${(hand.confidence * 100).toFixed(0)}%) [${modeTag}]`,
        lms[0].x * w + 8,
        lms[0].y * h - 8
      );
    }
  }

  // -------------------------------------------------------------------------
  // Private — error handling
  // -------------------------------------------------------------------------

  _emitError(error) {
    console.error('GestureHandTracker:', error);
    if (this._onError) this._onError(error);
  }
}

// ---------------------------------------------------------------------------
// Factory helper with graceful error messaging
// ---------------------------------------------------------------------------

/**
 * Creates and initializes a tracker with automatic fallback messaging
 * if the webcam is unavailable or permission is denied.
 *
 * @param {object} options - Same as GestureHandTracker constructor options
 * @returns {Promise<GestureHandTracker|null>} null if webcam unavailable
 */
async function createHandTracker(options = {}) {
  const tracker = new GestureHandTracker({
    ...options,
    onError: (err) => {
      const msg = err.message || String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        console.warn('GestureHandTracker: Webcam permission denied — gesture control disabled.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        console.warn('GestureHandTracker: No webcam found — gesture control disabled.');
      } else {
        console.error('GestureHandTracker error:', err);
      }
      if (options.onError) options.onError(err);
    },
  });

  try {
    await tracker.init();
    console.log(
      `[hand-tracker] Ready — mode: ${tracker.usingWorker ? 'Web Worker (off-thread)' : 'main-thread fallback'}`
    );
    return tracker;
  } catch (err) {
    tracker._emitError(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

window.GestureHandTracker = GestureHandTracker;
window.createHandTracker  = createHandTracker;

console.log('[gesture-hand-tracker] Loaded — Worker support:', workerSupported());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GestureHandTracker, createHandTracker };
}
