/**
 * particle-gesture-controller.js
 *
 * Maps recognized hand gestures and palm positions to particle system
 * behavior. Bridges gesture-detector.js output to the existing Three.js
 * particle system (particle-morph-system.js).
 *
 * Particle system interface expected on window.particleSystem:
 *   morphTo(shapeKey: string, duration: number) — morph particles to a shape
 *
 * Valid shape keys (must exist in stateRegistry):
 *   dispersed, helix, mobile, note, clapper, diamond, globe,
 *   game, chart, email, genie, camera, footer
 *
 * Gesture → morph mapping:
 *   FIST      → morphTo('globe', ...)
 *   VICTORY   → morphTo('helix', ...)
 *   OPEN_HAND → morphTo('dispersed', ...)
 *
 * No-hand fallback:
 *   When no hand is detected for > HAND_ABSENT_TIMEOUT ms, the controller
 *   reads the current scroll position and morphs back to whatever shape the
 *   scroll-trigger logic would have chosen. The card-observer and scroll
 *   triggers in main.js / particle-morph.hbs are NOT modified — this only
 *   calls morphTo() once on hand-exit, then hands control back to the page.
 *
 * Debugging:
 *   Extensive console.log output is intentional; filter by "[GestureController]"
 *
 * Usage:
 *   const controller = new ParticleGestureController({
 *     particleSystem: window.particleSystem,
 *   });
 *   controller.start();
 *   detector = new GestureDetector({
 *     onGesture:    (e) => controller.onGesture(e),
 *     onRawGesture: (e) => controller.onRawGesture(e),
 *   });
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration defaults
// ---------------------------------------------------------------------------

const CONTROLLER_DEFAULTS = {
  // Reference to the particle system object (can set later via setParticleSystem)
  particleSystem: null,

  // Force field strength multipliers
  attractStrength: 0.0018,   // FIST / PINCH pull
  repelStrength:   0.0022,   // OPEN_HAND push

  // Force field influence radius in normalized screen units (0-1)
  forceRadius: 0.35,

  // Point gesture: strength of directional nudge
  pointStrength: 0.0008,

  // Maximum velocity a particle can gain per frame from gesture forces
  maxForcePerFrame: 0.004,

  // Damping applied to existing particle velocity each frame (0-1)
  velocityDamping: 0.94,

  // After a gesture force stops, particles return to their morph target.
  // This is the lerp factor toward rest each frame.
  restoreStrength: 0.025,

  // ── Gesture → shape mappings (must be valid stateRegistry keys) ──────────
  // 'sphere', 'torus', 'wave' etc. do NOT exist — only shapes from shape-definitions.js
  fistShape:    'globe',      // FIST → compact globe
  victoryShape: 'helix',     // VICTORY → helix
  openShape:    'dispersed', // OPEN_HAND → burst state (sphere → dispersed → helix sequence)

  // Duration (ms) for morphTo transitions
  morphDuration: 1200,

  // Duration (ms) for OPEN_HAND burst (fast, snappy)
  burstDuration: 300,

  // Minimum time (ms) between morph triggers to prevent rapid cycling
  morphCooldown: 2000,

  // How long (ms) after the last detected hand before falling back to scroll shape
  handAbsentTimeout: 1000,

  // Two-hand mode: if both hands are active simultaneously, use combined gesture.
  dualHandMode: true,

  // Custom gesture handlers: { GESTURE_NAME: function(event, controller) {} }
  customHandlers: {},
};

// ---------------------------------------------------------------------------
// Scroll-position → shape resolver
// ---------------------------------------------------------------------------

/**
 * Returns the shape key that the scroll-trigger logic would use at the
 * current scroll position. Matches the stateSequence defined in particle-morph.hbs
 * and the card-observer logic in main.js.
 *
 * Priority (top → bottom of page):
 *   hero / above cards  → 'dispersed'
 *   helix section       → 'helix'
 *   card visible        → card's data-cardid shape
 *   footer              → 'helix'
 *
 * @returns {string} shapeKey
 */
function resolveScrollShape() {
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // 1. Footer visible → helix
  const footerEl = document.getElementById('footer') || document.querySelector('.gh-footer');
  if (footerEl) {
    const rect = footerEl.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      console.log('[GestureController] resolveScrollShape → helix (footer visible)');
      return 'helix';
    }
  }

  // 2. Check if any post-card is more than 10% in view — use its cardid
  const cards = Array.from(document.querySelectorAll('.post-card[data-cardid]'));
  let bestCard = null;
  let bestRatio = 0;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const visible = Math.max(0,
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
    );
    const ratio = visible / rect.height;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestCard = card;
    }
  }
  if (bestCard && bestRatio > 0.1) {
    const cardId = bestCard.dataset.cardid;
    // Validate that the state is actually loaded
    const ps = window.particleSystem;
    if (ps && ps.stateRegistry && ps.stateRegistry.get(cardId)) {
      console.log('[GestureController] resolveScrollShape → ' + cardId + ' (card visible, ratio ' + bestRatio.toFixed(2) + ')');
      return cardId;
    }
  }

  // 3. Helix section visible
  const helixEl = document.getElementById('helix') || document.querySelector('.statement-slide-main');
  if (helixEl) {
    const rect = helixEl.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (visible) {
      console.log('[GestureController] resolveScrollShape → helix (helix section visible)');
      return 'helix';
    }
  }

  // 4. Default: hero / top of page → dispersed
  console.log('[GestureController] resolveScrollShape → dispersed (scrollY=' + scrollY + ')');
  return 'dispersed';
}

// ---------------------------------------------------------------------------
// ParticleGestureController
// ---------------------------------------------------------------------------

class ParticleGestureController {
  /**
   * @param {object} options - See CONTROLLER_DEFAULTS
   */
  constructor(options = {}) {
    this._config = Object.assign({}, CONTROLLER_DEFAULTS, options);

    // Particle system ref — may be null at construction time, set via setParticleSystem()
    this._ps = null;

    // Accept the passed particleSystem but always prefer window.particleSystem
    // (which may be set later). We resolve it lazily in _getPS().
    this._psOverride = this._config.particleSystem || null;

    this._running     = false;
    this._rafId       = null;

    // Gesture state (per hand) — keyed by 'Right' | 'Left'
    this._gestureState = {
      Right: { gesture: 'NONE', position: { x: 0.5, y: 0.5 }, velocity: { x: 0, y: 0 } },
      Left:  { gesture: 'NONE', position: { x: 0.5, y: 0.5 }, velocity: { x: 0, y: 0 } },
    };

    // Per-particle displacement vectors (Float32Array, interleaved xy)
    this._displacement  = null;
    this._particleCount = 0;

    // Morph cycling state
    this._lastMorphTime = 0;

    // Frame counter for throttling
    this._frameCount = 0;

    // Active force fields this frame
    this._activeFields = [];

    // Hand presence tracking for fallback
    this._lastHandsDetected = 0;    // timestamp of last frame with any hand
    this._handPresent       = false; // true while at least one hand is visible
    this._fallbackPending   = false; // true while waiting to fire the scroll-fallback

    // Bind the loop
    this._loop     = this._loop.bind(this);
    // Fix 3: callback variant — no timestamp arg, no self-re-schedule
    this._loopTick = this._loopTick.bind(this);

    console.log('[GestureController] Constructed. ps-override:', !!this._psOverride);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attach a particle system at runtime (if not passed in constructor).
   */
  setParticleSystem(ps) {
    this._psOverride = ps;
    this._ps = ps;
    this._displacement = null; // reset displacement buffer
    console.log('[GestureController] setParticleSystem() called, morphTo available:',
      typeof ps?.morphTo === 'function');
  }

  /**
   * Start the per-frame force application loop.
   * Fix 3: if a ParticleAnimationLoop instance is available via window.particleSystem,
   * register as a callback on its RAF instead of starting a separate one.
   * Safe to call multiple times (idempotent).
   */
  start() {
    if (this._running) return;
    this._running = true;

    // Fix 3: try to piggyback on the animation loop's RAF
    const loop = this._getAnimationLoop();
    if (loop && loop._rafCallbacks) {
      if (!loop._rafCallbacks.includes(this._loopTick)) {
        loop._rafCallbacks.push(this._loopTick);
      }
      console.log('[GestureController] Started (synced to ParticleAnimationLoop RAF)');
    } else {
      // Fallback: own RAF when animation loop not yet available
      this._rafId = requestAnimationFrame(this._loop);
      console.log('[GestureController] Started (own RAF)');
    }
  }

  /**
   * Stop the force loop.
   */
  stop() {
    if (!this._running) return;
    this._running = false;

    // Remove from animation loop callbacks if registered there
    const loop = this._getAnimationLoop();
    if (loop && loop._rafCallbacks) {
      const idx = loop._rafCallbacks.indexOf(this._loopTick);
      if (idx !== -1) loop._rafCallbacks.splice(idx, 1);
    }

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Lazily resolve the particle system reference.
   * Prefers _psOverride, then window.particleSystem.
   * Logs a warning the first time it can't be found.
   */
  _getPS() {
    if (this._ps) return this._ps;

    const ps = this._psOverride || window.particleSystem || null;
    if (ps) {
      this._ps = ps;
      console.log('[GestureController] Resolved particle system. morphTo:', typeof ps.morphTo,
        'disperse:', typeof ps.disperse,
        'stateRegistry:', !!ps.stateRegistry);
    }
    return ps;
  }

  /**
   * Called by GestureDetector.onGesture — stable (debounced) gesture change.
   */
  onGesture(event) {
    const { hand, gesture, confidence, position, velocity } = event;

    console.log('[GestureController] onGesture() called:', hand, gesture,
      'confidence:', confidence?.toFixed(2),
      'ps available:', !!this._getPS());

    // Update internal state
    if (this._gestureState[hand]) {
      this._gestureState[hand].gesture  = gesture;
      this._gestureState[hand].position = position;
      this._gestureState[hand].velocity = velocity || { x: 0, y: 0 };
    }

    // Mark hand as present (resets absent timer)
    this._markHandPresent();

    // Dispatch to gesture-specific handler
    const handler = this._handlers[gesture] || this._handlers['NONE'];
    if (handler) handler.call(this, event);

    // Custom handler override
    const custom = this._config.customHandlers[gesture];
    if (custom) custom(event, this);
  }

  /**
   * Called by GestureDetector.onRawGesture — every frame, pre-debounce.
   */
  onRawGesture(event) {
    const { hand, gesture, position, velocity } = event;

    if (!this._gestureState[hand]) return;

    // Always update position/velocity from raw stream for smooth tracking
    this._gestureState[hand].position = position;
    this._gestureState[hand].velocity = velocity || { x: 0, y: 0 };

    // If any hand is visible (even NONE = transitioning), it's still "present"
    if (gesture !== 'NONE') {
      this._markHandPresent();
    }

    // Update gesture if raw reports NONE (hand exiting frame)
    if (gesture === 'NONE') {
      this._gestureState[hand].gesture = 'NONE';
    }
  }

  /**
   * Called when a tracker frame reports at least one hand.
   * Resets the absence timer.
   */
  _markHandPresent() {
    const wasAbsent = !this._handPresent;
    this._handPresent = true;
    this._lastHandsDetected = performance.now();
    this._fallbackPending = false;

    if (wasAbsent) {
      console.log('[GestureController] Hand entered frame');
    }
  }

  // -------------------------------------------------------------------------
  // Discrete gesture handlers
  // -------------------------------------------------------------------------

  _handlers = {
    OPEN_HAND: function (event) {
      const ps = this._getPS();
      if (!ps) {
        console.warn('[GestureController] OPEN_HAND: no particle system available');
        return;
      }

      const now = performance.now();
      if (now - this._lastMorphTime < this._config.morphCooldown) {
        console.log('[GestureController] OPEN_HAND: cooldown active, skipping');
        return;
      }

      const targetShape = this._config.openShape; // 'dispersed'

      // Validate shape exists before calling morphTo
      if (ps.stateRegistry && !ps.stateRegistry.get(targetShape)) {
        console.warn('[GestureController] OPEN_HAND: shape "' + targetShape + '" not in stateRegistry');
        return;
      }

      console.log('[GestureController] OPEN_HAND: bursting to "' + targetShape + '"');
      ps.morphTo(targetShape, this._config.burstDuration);
      this._lastMorphTime = now;
      this._flashUI('burst!');
    },

    FIST: function (event) {
      const ps = this._getPS();
      if (!ps) {
        console.warn('[GestureController] FIST: no particle system available');
        return;
      }

      const now = performance.now();
      if (now - this._lastMorphTime < this._config.morphCooldown) {
        console.log('[GestureController] FIST: cooldown active, skipping (ms remaining:',
          Math.round(this._config.morphCooldown - (now - this._lastMorphTime)) + ')');
        return;
      }

      const targetShape = this._config.fistShape; // 'globe'

      // Validate shape is registered
      if (ps.stateRegistry && !ps.stateRegistry.get(targetShape)) {
        console.warn('[GestureController] FIST: shape "' + targetShape + '" not in stateRegistry. Available:', this._getAvailableShapes(ps));
        return;
      }

      console.log('[GestureController] FIST: morphing to "' + targetShape + '"');
      ps.morphTo(targetShape, this._config.morphDuration);
      this._lastMorphTime = now;
      this._flashUI('fist → ' + targetShape);
    },

    PINCH: function (event) {
      // No discrete morph — continuous force field handles it
      this._flashUI('pinch');
    },

    VICTORY: function (event) {
      const ps = this._getPS();
      if (!ps) {
        console.warn('[GestureController] VICTORY: no particle system available');
        return;
      }

      const now = performance.now();
      if (now - this._lastMorphTime < this._config.morphCooldown) {
        console.log('[GestureController] VICTORY: cooldown active, skipping');
        return;
      }

      const targetShape = this._config.victoryShape; // 'helix'

      if (ps.stateRegistry && !ps.stateRegistry.get(targetShape)) {
        console.warn('[GestureController] VICTORY: shape "' + targetShape + '" not in stateRegistry');
        return;
      }

      console.log('[GestureController] VICTORY: morphing to "' + targetShape + '"');
      ps.morphTo(targetShape, this._config.morphDuration);
      this._lastMorphTime = now;
      this._flashUI('peace → ' + targetShape);
    },

    POINT: function (event) {
      // Cursor mode — the loop applies a directional nudge
      this._flashUI('point');
    },

    NONE: function (event) {
      // Hand gesture went to NONE (not hand-absent, just no recognized gesture)
      // Force fields will fade naturally
    },
  };

  // -------------------------------------------------------------------------
  // No-hand fallback (scroll-shape restoration)
  // -------------------------------------------------------------------------

  /**
   * Check if hands have been absent long enough to trigger scroll-shape fallback.
   * Called each frame from _loop().
   */
  _checkHandAbsence() {
    const now = performance.now();
    const bothNone =
      this._gestureState.Right.gesture === 'NONE' &&
      this._gestureState.Left.gesture  === 'NONE';

    if (!bothNone) {
      // At least one hand is gesturing — reset absence tracking
      this._handPresent = true;
      this._lastHandsDetected = now;
      this._fallbackPending = false;
      return;
    }

    // Both hands are NONE — check how long they've been absent
    const elapsed = now - this._lastHandsDetected;
    const timeout = this._config.handAbsentTimeout;

    if (elapsed >= timeout && !this._fallbackPending) {
      this._fallbackPending = true;
      this._handPresent = false;
      this._triggerScrollFallback();
    }
  }

  /**
   * Morph back to whatever shape scroll position dictates.
   * Does NOT re-register any observers — just fires one morphTo().
   */
  _triggerScrollFallback() {
    const ps = this._getPS();
    if (!ps) {
      console.log('[GestureController] Scroll fallback: no particle system yet');
      return;
    }

    const targetShape = resolveScrollShape();

    // Validate state exists
    if (ps.stateRegistry && !ps.stateRegistry.get(targetShape)) {
      console.warn('[GestureController] Scroll fallback: shape "' + targetShape + '" not loaded, falling back to dispersed');
      if (ps.stateRegistry.get('dispersed')) {
        ps.morphTo('dispersed', this._config.morphDuration);
      }
      return;
    }

    console.log('[GestureController] Hand left frame — falling back to scroll shape: "' + targetShape + '"');
    ps.morphTo(targetShape, this._config.morphDuration);
    this._flashUI('↩ ' + targetShape);

    // Reset morph cooldown so next gesture can fire immediately after re-entry
    this._lastMorphTime = 0;
  }

  // -------------------------------------------------------------------------
  // Per-frame force application loop
  // -------------------------------------------------------------------------

  _loop(timestamp) {
    if (!this._running) return;

    this._frameCount++;

    // Check hand absence and maybe fire scroll fallback
    this._checkHandAbsence();

    // Throttle: skip force update every other frame when both hands active
    const bothActive = this._isBothHandsActive();
    const skipForce  = bothActive && (this._frameCount % 2 === 0);

    if (!skipForce) {
      this._buildForceFields();
      this._applyForces();
    }

    this._rafId = requestAnimationFrame(this._loop);
  }

  /**
   * Fix 3: per-frame callback registered on ParticleAnimationLoop._rafCallbacks.
   * Same logic as _loop but no timestamp and no self-rescheduling — the host RAF
   * handles repetition.
   */
  _loopTick() {
    if (!this._running) return;

    this._frameCount++;
    this._checkHandAbsence();

    const bothActive = this._isBothHandsActive();
    const skipForce  = bothActive && (this._frameCount % 2 === 0);

    if (!skipForce) {
      this._buildForceFields();
      this._applyForces();
    }
  }

  /**
   * Fix 3: resolve the ParticleAnimationLoop instance that owns the RAF.
   * Looks for it via window.particleSystem.loop (the standard wiring).
   */
  _getAnimationLoop() {
    const ps = this._getPS();
    if (ps && ps.loop instanceof ParticleAnimationLoop) return ps.loop;
    if (ps instanceof ParticleAnimationLoop) return ps;
    return null;
  }

  /**
   * Collect active force fields from current gesture states.
   */
  _buildForceFields() {
    this._activeFields = [];

    const sides = this._config.dualHandMode
      ? ['Right', 'Left']
      : ['Right'];

    for (const side of sides) {
      const state = this._gestureState[side];
      if (!state || state.gesture === 'NONE') continue;

      const { x, y } = state.position;
      const cfg = this._config;

      switch (state.gesture) {
        case 'OPEN_HAND':
          this._activeFields.push({ x, y, strength: cfg.repelStrength, mode: 'repel', radius: cfg.forceRadius });
          break;

        case 'FIST':
          this._activeFields.push({ x, y, strength: cfg.attractStrength, mode: 'attract', radius: cfg.forceRadius });
          break;

        case 'PINCH':
          this._activeFields.push({ x, y, strength: cfg.attractStrength * 1.4, mode: 'attract', radius: cfg.forceRadius * 0.5 });
          break;

        case 'POINT': {
          const vel   = state.velocity;
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          if (speed > 0.001) {
            this._activeFields.push({
              x, y,
              dx: vel.x / speed,
              dy: vel.y / speed,
              strength: cfg.pointStrength * Math.min(speed * 60, 1),
              mode:     'nudge',
              radius:   cfg.forceRadius * 0.6,
            });
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Apply all active force fields to the particle system's positions.
   */
  _applyForces() {
    if (this._activeFields.length === 0) return;

    const posAttr = this._getPositionAttribute();
    if (!posAttr) return;

    const positions = posAttr.array;
    const count     = positions.length / 3;

    if (!this._displacement || this._displacement.length !== count * 2) {
      this._displacement  = new Float32Array(count * 2);
      this._particleCount = count;
    }

    const disp    = this._displacement;
    const cfg     = this._config;
    const maxF    = cfg.maxForcePerFrame;
    const damping = cfg.velocityDamping;

    for (let i = 0; i < count; i++) {
      const baseX = positions[i * 3    ];
      const baseY = positions[i * 3 + 1];
      const baseZ = positions[i * 3 + 2];

      // Fix 2: skip helix overflow particles sitting exactly at origin
      if (baseX === 0 && baseY === 0 && baseZ === 0) continue;

      const px = (baseX / 10 + 0.5);
      const py = (baseY / 10 + 0.5);

      let fx = 0;
      let fy = 0;
      let attracted = false;

      for (const field of this._activeFields) {
        const dx     = px - field.x;
        const dy     = py - field.y;
        const distSq = dx * dx + dy * dy;
        const radSq  = field.radius * field.radius;

        if (distSq > radSq || distSq < 0.00001) continue;

        const dist    = Math.sqrt(distSq);
        const falloff = 1 - dist / field.radius;

        if (field.mode === 'repel') {
          const force = field.strength * falloff / dist;
          fx += dx * force;
          fy += dy * force;
        } else if (field.mode === 'attract') {
          const force = field.strength * falloff / dist;
          fx -= dx * force;
          fy -= dy * force;
          attracted = true;
        } else if (field.mode === 'nudge') {
          const force = field.strength * falloff;
          fx += field.dx * force;
          fy += field.dy * force;
        }
      }

      disp[i * 2    ] = disp[i * 2    ] * damping + Math.max(-maxF, Math.min(maxF, fx));
      disp[i * 2 + 1] = disp[i * 2 + 1] * damping + Math.max(-maxF, Math.min(maxF, fy));

      positions[i * 3    ] += disp[i * 2    ] * 10;
      positions[i * 3 + 1] += disp[i * 2 + 1] * 10;

      // Fix 1: add Z jitter to attracted particles to break perfect Z-axis line alignment
      if (attracted) {
        positions[i * 3 + 2] += Math.random() * 0.1 - 0.05;
      }
    }

    posAttr.needsUpdate = true;
  }

  /**
   * Find the Three.js BufferAttribute containing particle positions.
   */
  _getPositionAttribute() {
    const ps = this._getPS();
    if (!ps) return null;

    if (ps.particles && ps.particles.geometry) {
      return ps.particles.geometry.attributes.position;
    }
    if (ps.geometry && ps.geometry.attributes) {
      return ps.geometry.attributes.position;
    }
    if (ps.mesh && ps.mesh.geometry) {
      return ps.mesh.geometry.attributes.position;
    }
    if (ps.points && ps.points.geometry) {
      return ps.points.geometry.attributes.position;
    }
    // ParticleAnimationLoop exposes particles via ps.loop.particles
    if (ps.loop && ps.loop.particles && ps.loop.particles.geometry) {
      return ps.loop.particles.geometry.attributes.position;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Utility helpers
  // -------------------------------------------------------------------------

  _isBothHandsActive() {
    return (
      this._gestureState.Right.gesture !== 'NONE' &&
      this._gestureState.Left.gesture  !== 'NONE'
    );
  }

  /**
   * Returns a list of shapes currently in the stateRegistry for debugging.
   * StateRegistry uses a Map (stateRegistry.states is a Map).
   */
  _getAvailableShapes(ps) {
    try {
      // StateRegistry.states is a Map — use .keys()
      if (ps && ps.stateRegistry && ps.stateRegistry.states instanceof Map) {
        return Array.from(ps.stateRegistry.states.keys());
      }
      // Fallback: plain object
      if (ps && ps.stateRegistry && ps.stateRegistry.states) {
        return Object.keys(ps.stateRegistry.states);
      }
    } catch (e) {}
    return '(unknown)';
  }

  /**
   * Emit a transient UI flash event. spatial-computing-ui.js listens for this.
   */
  _flashUI(label) {
    window.dispatchEvent(
      new CustomEvent('gesture:action', { detail: { label } })
    );
  }

  /**
   * Returns a snapshot of the current gesture + particle system state for debugging.
   */
  getState() {
    const ps = this._getPS();
    return {
      right:            { ...this._gestureState.Right },
      left:             { ...this._gestureState.Left },
      activeFields:     this._activeFields.length,
      frame:            this._frameCount,
      handPresent:      this._handPresent,
      fallbackPending:  this._fallbackPending,
      msSinceHand:      Math.round(performance.now() - this._lastHandsDetected),
      psAvailable:      !!ps,
      morphToAvailable: typeof ps?.morphTo === 'function',
      currentShape:     ps?.loop?.currentState?.config?.shapeKey || '(unknown)',
    };
  }

  /**
   * Debug helper: call from browser console to diagnose issues.
   *   window.gestureController.diagnose()
   */
  diagnose() {
    const ps = this._getPS();
    console.group('[GestureController] Diagnostic');
    console.log('running:', this._running);
    console.log('particle system (window.particleSystem):', window.particleSystem);
    console.log('resolved ps:', ps);
    console.log('ps.morphTo available:', typeof ps?.morphTo === 'function');
    console.log('ps.stateRegistry:', ps?.stateRegistry);
    console.log('available shapes:', this._getAvailableShapes(ps));
    console.log('fistShape config:', this._config.fistShape);
    console.log('victoryShape config:', this._config.victoryShape);
    console.log('openShape config:', this._config.openShape);
    console.log('morphCooldown:', this._config.morphCooldown, 'ms');
    console.log('ms since last morph:', Math.round(performance.now() - this._lastMorphTime));
    console.log('gesture state:', this._gestureState);
    console.log('hand present:', this._handPresent);
    console.log('ms since last hand:', Math.round(performance.now() - this._lastHandsDetected));
    console.log('full state snapshot:', this.getState());
    console.groupEnd();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap helper
// ---------------------------------------------------------------------------

/**
 * Wires up a complete gesture pipeline:
 *   GestureHandTracker → GestureDetector → ParticleGestureController
 *
 * @param {object} options
 * @param {object} [options.particleSystem] - window.particleSystem reference
 * @param {object} [options.trackerConfig]  - Overrides for GestureHandTracker
 * @param {object} [options.detectorConfig] - Overrides for GestureDetector
 * @param {object} [options.controllerConfig] - Overrides for ParticleGestureController
 * @returns {Promise<{tracker, detector, controller}|null>} null if webcam unavailable
 */
async function bootstrapGestureSystem(options = {}) {
  if (typeof GestureHandTracker === 'undefined') {
    console.error('[GestureSystem] gesture-hand-tracker.js must be loaded first.');
    return null;
  }
  if (typeof GestureDetector === 'undefined') {
    console.error('[GestureSystem] gesture-detector.js must be loaded first.');
    return null;
  }

  // Sanitize controllerConfig: strip invalid shape overrides from main.js call
  // (morphShapes is not a valid config key; fistShape/victoryShape must be real shapes)
  const VALID_SHAPES = new Set([
    'dispersed', 'helix', 'mobile', 'note', 'clapper', 'diamond',
    'globe', 'game', 'chart', 'email', 'genie', 'camera', 'footer',
    'dispersed_dense', 'dispersed_chaos', 'dispersed_swarm',
  ]);

  const rawControllerConfig = options.controllerConfig || {};
  const sanitizedConfig = { ...rawControllerConfig };

  // Remove stale/invalid keys
  delete sanitizedConfig.morphShapes; // was passed in main.js but doesn't exist in CONTROLLER_DEFAULTS

  // Validate shape keys — fall back to defaults if invalid
  const DEFAULT_FIST_SHAPE    = 'globe';
  const DEFAULT_VICTORY_SHAPE = 'helix';
  const DEFAULT_OPEN_SHAPE    = 'dispersed';

  if (sanitizedConfig.fistShape && !VALID_SHAPES.has(sanitizedConfig.fistShape)) {
    console.warn('[GestureSystem] Invalid fistShape "' + sanitizedConfig.fistShape + '", using "' + DEFAULT_FIST_SHAPE + '"');
    sanitizedConfig.fistShape = DEFAULT_FIST_SHAPE;
  }
  if (sanitizedConfig.victoryShape && !VALID_SHAPES.has(sanitizedConfig.victoryShape)) {
    console.warn('[GestureSystem] Invalid victoryShape "' + sanitizedConfig.victoryShape + '", using "' + DEFAULT_VICTORY_SHAPE + '"');
    sanitizedConfig.victoryShape = DEFAULT_VICTORY_SHAPE;
  }
  if (sanitizedConfig.openShape && !VALID_SHAPES.has(sanitizedConfig.openShape)) {
    console.warn('[GestureSystem] Invalid openShape "' + sanitizedConfig.openShape + '", using "' + DEFAULT_OPEN_SHAPE + '"');
    sanitizedConfig.openShape = DEFAULT_OPEN_SHAPE;
  }

  const ps = options.particleSystem || window.particleSystem || null;

  if (!ps) {
    console.warn('[GestureSystem] window.particleSystem not yet available — controller will resolve it lazily');
  } else {
    console.log('[GestureSystem] Particle system passed in. morphTo:', typeof ps.morphTo === 'function');
    if (ps.stateRegistry && ps.stateRegistry.states instanceof Map) {
      console.log('[GestureSystem] Available shapes at bootstrap time:', Array.from(ps.stateRegistry.states.keys()));
    }
  }

  const controller = new ParticleGestureController({
    particleSystem: ps,
    ...sanitizedConfig,
  });

  const detector = new GestureDetector({
    onGesture:    (e) => controller.onGesture(e),
    onRawGesture: (e) => controller.onRawGesture(e),
    ...(options.detectorConfig || {}),
  });

  const tracker = await createHandTracker({
    onResults: (results) => detector.update(results),
    config: options.trackerConfig || {},
  });

  if (!tracker) {
    console.warn('[GestureSystem] Webcam unavailable — gesture control disabled.');
    return null;
  }

  controller.start();
  tracker.start();

  // Expose controller globally for debugging from the browser console
  window.gestureController = controller;

  console.log('[GestureSystem] Pipeline active: tracker → detector → controller');
  console.log('[GestureSystem] Debug: window.gestureController.diagnose()');
  return { tracker, detector, controller };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

window.ParticleGestureController = ParticleGestureController;
window.bootstrapGestureSystem    = bootstrapGestureSystem;
window.resolveScrollShape        = resolveScrollShape;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParticleGestureController, bootstrapGestureSystem, resolveScrollShape };
}

console.log('[particle-gesture-controller] Loaded — bootstrapGestureSystem available');
