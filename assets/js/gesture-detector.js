/**
 * gesture-detector.js
 *
 * Converts raw MediaPipe hand landmarks (from gesture-hand-tracker.js) into
 * named gestures with confidence scores and debounced state.
 *
 * Recognized gestures:
 *   OPEN_HAND  — all fingers extended (disperse particles)
 *   FIST       — all fingers curled   (attract particles)
 *   PINCH      — thumb + index close  (attract particles, precise)
 *   VICTORY    — index + middle up, others down (morph shape)
 *   POINT      — index only extended  (direct/cursor mode)
 *   NONE       — no recognizable gesture
 *
 * Design notes:
 *   - Geometry is done on world landmarks (metric) so results are
 *     independent of hand distance from the camera.
 *   - A GestureState object holds temporal history so gestures must hold
 *     for DEBOUNCE_FRAMES consecutive frames before being emitted.
 *   - Each hand is analysed independently; both results are emitted.
 *
 * Usage:
 *   const detector = new GestureDetector({ onGesture: handleGesture });
 *   // In your tracker callback:
 *   detector.update(trackerResults);
 */

'use strict';

// ---------------------------------------------------------------------------
// Landmark index constants (MediaPipe Hands spec)
// ---------------------------------------------------------------------------

const LM = {
  WRIST:           0,
  THUMB_CMC:       1,
  THUMB_MCP:       2,
  THUMB_IP:        3,
  THUMB_TIP:       4,
  INDEX_MCP:       5,
  INDEX_PIP:       6,
  INDEX_DIP:       7,
  INDEX_TIP:       8,
  MIDDLE_MCP:      9,
  MIDDLE_PIP:      10,
  MIDDLE_DIP:      11,
  MIDDLE_TIP:      12,
  RING_MCP:        13,
  RING_PIP:        14,
  RING_DIP:        15,
  RING_TIP:        16,
  PINKY_MCP:       17,
  PINKY_PIP:       18,
  PINKY_DIP:       19,
  PINKY_TIP:       20,
};

// ---------------------------------------------------------------------------
// Gesture identifiers
// ---------------------------------------------------------------------------

const GESTURE = {
  OPEN_HAND: 'OPEN_HAND',
  FIST:      'FIST',
  PINCH:     'PINCH',
  VICTORY:   'VICTORY',
  POINT:     'POINT',
  NONE:      'NONE',
};

// ---------------------------------------------------------------------------
// Configuration defaults
// ---------------------------------------------------------------------------

const DETECTOR_DEFAULTS = {
  // Minimum hand detection confidence from tracker to bother analysing
  minHandConfidence: 0.7,

  // A candidate gesture must hold for this many consecutive frames before
  // being emitted via onGesture. At 60fps, 4 frames = ~67ms debounce.
  // Increase to reduce jitter; decrease for faster response.
  debounceFrames: 4,

  // Minimum classifier confidence (0-1) for a gesture to be considered valid
  minGestureConfidence: 0.80,

  // Distance (in world-landmark metres) below which thumb+index = pinch
  pinchThreshold: 0.04,   // ~4cm

  // Fraction of finger length: if tip is this fraction below MCP, finger = curled
  curlThreshold: 0.4,

  // Called when a stable gesture change occurs.
  // Signature: onGesture({ hand, gesture, confidence, landmarks, position })
  onGesture: null,

  // Called every frame with raw per-hand results (before debounce).
  // Useful for driving continuous effects like force field strength.
  onRawGesture: null,
};

// ---------------------------------------------------------------------------
// GestureState — temporal accumulator for one hand
// ---------------------------------------------------------------------------

/**
 * Tracks gesture history for a single hand slot ('Left' or 'Right').
 * Handles debounce: a gesture must be consistent for N frames before commit.
 */
class GestureState {
  constructor(side, debounceFrames) {
    this.side           = side;
    this.debounceFrames = debounceFrames;

    // Currently committed (stable, debounced) gesture
    this.current    = GESTURE.NONE;
    this.confidence = 0;

    // Candidate being evaluated
    this._candidate      = GESTURE.NONE;
    this._candidateCount = 0;

    // True for one frame when gesture transitions
    this.justChanged = false;

    // Smoothed palm position [0-1 normalized, x, y]
    this.palmPosition = { x: 0.5, y: 0.5 };

    // Smoothed palm position velocity (used by particle controller)
    this.palmVelocity = { x: 0, y: 0 };
    this._prevPalmPosition = null;
  }

  /**
   * Feed a new frame's gesture candidate. Returns true if stable gesture changed.
   *
   * @param {string} candidate - GESTURE constant
   * @param {number} confidence - 0-1
   * @param {{x,y}} palmPos - normalized screen position
   */
  update(candidate, confidence, palmPos) {
    this.justChanged = false;

    // Update smoothed palm position (exponential moving average)
    const alpha = 0.35; // higher = more responsive, lower = smoother
    this.palmPosition.x = lerp(this.palmPosition.x, palmPos.x, alpha);
    this.palmPosition.y = lerp(this.palmPosition.y, palmPos.y, alpha);

    // Compute velocity
    if (this._prevPalmPosition) {
      this.palmVelocity.x = this.palmPosition.x - this._prevPalmPosition.x;
      this.palmVelocity.y = this.palmPosition.y - this._prevPalmPosition.y;
    }
    this._prevPalmPosition = { ...this.palmPosition };

    // Debounce: candidate must match for N consecutive frames
    if (candidate === this._candidate) {
      this._candidateCount++;
    } else {
      this._candidate      = candidate;
      this._candidateCount = 1;
    }

    if (
      this._candidateCount >= this.debounceFrames &&
      this._candidate !== this.current
    ) {
      this.current    = this._candidate;
      this.confidence = confidence;
      this.justChanged = true;
      return true;
    }

    return false;
  }

  /**
   * Mark this hand as absent (not detected in current frame).
   */
  markAbsent() {
    this.update(GESTURE.NONE, 0, { x: 0.5, y: 0.5 });
  }
}

// ---------------------------------------------------------------------------
// GestureDetector
// ---------------------------------------------------------------------------

class GestureDetector {
  /**
   * @param {object} options - See DETECTOR_DEFAULTS
   */
  constructor(options = {}) {
    this._config = Object.assign({}, DETECTOR_DEFAULTS, options);

    // One GestureState per hand side
    this._states = {
      Right: new GestureState('Right', this._config.debounceFrames),
      Left:  new GestureState('Left',  this._config.debounceFrames),
    };

    this._frameCount = 0;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Process one frame of tracker results.
   * Call this inside your tracker's onResults callback.
   *
   * @param {object} trackerResults - Output from GestureHandTracker
   */
  update(trackerResults) {
    this._frameCount++;
    const { hands = [] } = trackerResults;

    // Track which sides were seen this frame
    const seenSides = new Set();

    for (const hand of hands) {
      if (hand.confidence < this._config.minHandConfidence) continue;

      seenSides.add(hand.side);
      const state = this._states[hand.side];
      if (!state) continue;

      // Classify gesture from landmarks
      const { gesture, confidence } = this._classify(hand);

      // Palm position from wrist landmark (index 0) in normalized screen space
      const wrist = hand.landmarks[LM.WRIST];
      const palmPos = { x: wrist.x, y: wrist.y };

      // Emit raw gesture every frame (for continuous effects)
      if (this._config.onRawGesture) {
        this._config.onRawGesture({
          hand:       hand.side,
          gesture,
          confidence,
          landmarks:  hand.landmarks,
          worldLandmarks: hand.worldLandmarks,
          position:   palmPos,
          velocity:   state.palmVelocity,
        });
      }

      // Update debounce state
      const changed = state.update(gesture, confidence, palmPos);

      // Log gesture changes
      if (this._frameCount % 30 === 0) {
        console.log(`[gesture-detector] ${hand.side}: ${gesture} (confidence: ${confidence.toFixed(2)})`);
      }

      if (changed && this._config.onGesture) {
        console.log(`[gesture-detector] ✅ GESTURE CHANGE: ${hand.side} → ${state.current}`);
        this._config.onGesture({
          hand:       hand.side,
          gesture:    state.current,
          confidence: state.confidence,
          landmarks:  hand.landmarks,
          worldLandmarks: hand.worldLandmarks,
          position:   state.palmPosition,
          velocity:   state.palmVelocity,
        });
      }
    }

    // Mark absent hands
    for (const side of ['Right', 'Left']) {
      if (!seenSides.has(side)) {
        this._states[side].markAbsent();
      }
    }
  }

  /**
   * Returns the current stable gesture state for a hand.
   * @param {'Right'|'Left'} side
   * @returns {GestureState}
   */
  getState(side) {
    return this._states[side] || null;
  }

  /**
   * Returns true if any tracked hand currently holds the given gesture.
   * @param {string} gestureKey - GESTURE constant
   */
  hasGesture(gestureKey) {
    return Object.values(this._states).some((s) => s.current === gestureKey);
  }

  // -------------------------------------------------------------------------
  // Private — gesture classification
  // -------------------------------------------------------------------------

  /**
   * Run all gesture tests in priority order and return the best match.
   *
   * Priority matters: PINCH is a subset of "index extended" so test it
   * before POINT. FIST is tested before OPEN_HAND.
   *
   * @param {object} hand - Normalized hand object from tracker
   * @returns {{ gesture: string, confidence: number }}
   */
  _classify(hand) {
    // Use world landmarks for distance calculations (scale-independent)
    const wl = hand.worldLandmarks;

    // Determine which fingers are extended (using screen landmarks for
    // direction, world landmarks for distance ratios)
    const fingerStates = this._getFingerExtensionStates(hand.landmarks, wl);

    const minConf = this._config.minGestureConfidence;

    // 1. PINCH — thumb and index close together
    const pinchConf = this._scorePinch(wl);
    if (pinchConf >= minConf) {
      return { gesture: GESTURE.PINCH, confidence: pinchConf };
    }

    // 2. FIST — no fingers extended
    const fistConf = this._scoreFist(fingerStates);
    if (fistConf >= minConf) {
      return { gesture: GESTURE.FIST, confidence: fistConf };
    }

    // 3. OPEN_HAND — all fingers extended
    const openConf = this._scoreOpenHand(fingerStates);
    if (openConf >= minConf) {
      return { gesture: GESTURE.OPEN_HAND, confidence: openConf };
    }

    // 4. VICTORY — index + middle up, ring + pinky down
    const victoryConf = this._scoreVictory(fingerStates);
    if (victoryConf >= minConf) {
      return { gesture: GESTURE.VICTORY, confidence: victoryConf };
    }

    // 5. POINT — index up, others down
    const pointConf = this._scorePoint(fingerStates);
    if (pointConf >= minConf) {
      return { gesture: GESTURE.POINT, confidence: pointConf };
    }

    return { gesture: GESTURE.NONE, confidence: 0 };
  }

  /**
   * Computes a boolean + curl-ratio for each of the 5 fingers.
   *
   * Strategy: a finger is "extended" if its tip is farther from the wrist
   * than its MCP joint, using normalized screen landmarks.
   *
   * The thumb uses a different axis (horizontal spread vs vertical raise).
   *
   * Returns an array of 5 objects:
   *   { extended: bool, curlRatio: number }
   * Index: 0=thumb, 1=index, 2=middle, 3=ring, 4=pinky
   */
  _getFingerExtensionStates(lms, wlms) {
    const wrist = lms[LM.WRIST];

    const fingers = [
      // Thumb: tip vs IP (not MCP — thumb bends differently)
      {
        tip:  lms[LM.THUMB_TIP],
        mid:  lms[LM.THUMB_IP],
        mcp:  lms[LM.THUMB_MCP],
        base: wrist,
      },
      {
        tip:  lms[LM.INDEX_TIP],
        mid:  lms[LM.INDEX_DIP],
        mcp:  lms[LM.INDEX_MCP],
        base: wrist,
      },
      {
        tip:  lms[LM.MIDDLE_TIP],
        mid:  lms[LM.MIDDLE_DIP],
        mcp:  lms[LM.MIDDLE_MCP],
        base: wrist,
      },
      {
        tip:  lms[LM.RING_TIP],
        mid:  lms[LM.RING_DIP],
        mcp:  lms[LM.RING_MCP],
        base: wrist,
      },
      {
        tip:  lms[LM.PINKY_TIP],
        mid:  lms[LM.PINKY_DIP],
        mcp:  lms[LM.PINKY_MCP],
        base: wrist,
      },
    ];

    return fingers.map((f, i) => {
      if (i === 0) {
        // Thumb: use horizontal spread from palm centroid
        // If thumb tip x is far from index MCP x, thumb is "out"
        const spread = Math.abs(f.tip.x - lms[LM.INDEX_MCP].x);
        const extended = spread > 0.08; // empirically tuned
        return { extended, curlRatio: 1 - Math.min(spread / 0.15, 1) };
      }

      // Fingers: compare y-position of tip vs MCP
      // In screen space, y increases downward; a raised finger has lower y
      const mcpY  = f.mcp.y;
      const tipY  = f.tip.y;
      const midY  = f.mid.y;

      // Extended: tip is above (lower y) than MCP
      const extended = tipY < mcpY - 0.04;

      // Curl ratio: 0 = fully extended, 1 = fully curled
      // Computed as how much the mid joint has dropped below MCP
      const fingerHeight = Math.abs(lms[LM.WRIST].y - mcpY) || 0.1;
      const curlRatio    = Math.min(Math.max((midY - mcpY) / fingerHeight, 0), 1);

      return { extended, curlRatio };
    });
  }

  // -------------------------------------------------------------------------
  // Gesture scorers — each returns a confidence 0-1
  // -------------------------------------------------------------------------

  /**
   * PINCH: thumb tip close to index tip in world space (metres).
   */
  _scorePinch(wlms) {
    if (!wlms || wlms.length < 9) return 0;

    const thumbTip = wlms[LM.THUMB_TIP];
    const indexTip = wlms[LM.INDEX_TIP];

    const dist = dist3d(thumbTip, indexTip);
    const threshold = this._config.pinchThreshold;

    if (dist > threshold * 2) return 0;

    // Confidence: full at 0 distance, zero at threshold*2
    return Math.max(0, 1 - dist / (threshold * 2));
  }

  /**
   * FIST: all four fingers curled (thumb state is permissive).
   */
  _scoreFist(states) {
    // states[0] = thumb (skip — thumb position is ambiguous in a fist)
    const fingersCurled = states.slice(1).filter((s) => !s.extended).length;
    // Each curled finger contributes; need all 4 for high confidence
    return fingersCurled / 4;
  }

  /**
   * OPEN_HAND: all five fingers extended.
   */
  _scoreOpenHand(states) {
    const extended = states.filter((s) => s.extended).length;
    return extended / 5;
  }

  /**
   * VICTORY: index + middle extended, ring + pinky curled.
   * Thumb is permissive.
   */
  _scoreVictory(states) {
    // states: [thumb, index, middle, ring, pinky]
    const indexUp  = states[1].extended;
    const middleUp = states[2].extended;
    const ringDown = !states[3].extended;
    const pinkyDown = !states[4].extended;

    let score = 0;
    if (indexUp)   score += 0.30;
    if (middleUp)  score += 0.30;
    if (ringDown)  score += 0.20;
    if (pinkyDown) score += 0.20;

    return score;
  }

  /**
   * POINT: index up, middle + ring + pinky curled.
   */
  _scorePoint(states) {
    const indexUp   = states[1].extended;
    const middleDown = !states[2].extended;
    const ringDown   = !states[3].extended;
    const pinkyDown  = !states[4].extended;

    let score = 0;
    if (indexUp)    score += 0.40;
    if (middleDown) score += 0.20;
    if (ringDown)   score += 0.20;
    if (pinkyDown)  score += 0.20;

    return score;
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function dist3d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

window.GestureDetector = GestureDetector;
window.GESTURE         = GESTURE;
window.LM              = LM;

console.log('[gesture-detector] ✅ Loaded');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GestureDetector, GESTURE, LM };
}
