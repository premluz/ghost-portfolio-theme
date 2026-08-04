/**
 * Particle Morph System - Main orchestrator for modular particle animation
 */

class ParticleMorphSystem {
  // Shapes with no GLB dependency — generated synchronously at init so
  // start('dispersed') works before any mesh has loaded. Read by BOTH
  // _createImmediateStates() (what to build now) and createInitialStates()
  // (what not to rebuild later); they used to be separate hand-kept lists
  // that had drifted apart.
  static IMMEDIATE_SHAPES = ['dispersed', 'collapse', 'helix', 'hero-helix', 'ribbon', 'ribbon-dispersed', 'volatility', 'lab', 'terrain', 'grid', 'dots'];

  constructor(container, config = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.config = {
      particleCount: config.particleCount || 2000,
      particleSize: config.particleSize || 0.5,
      particleOpacity: config.particleOpacity || 0.1,
      autoRotationSpeed: config.autoRotationSpeed || 0.003,
      morphDuration: config.morphDuration || 2000,
      ...config
    };

    // Note: initializeModules() must be called explicitly as it's async
  }

  async initializeModules() {
    // Shape registry
    this.shapeRegistry = new window.ShapeRegistry();
    this.shapeRegistry.register(window.SPHERE);
    this.shapeRegistry.register(window.HELIX);
    this.shapeRegistry.register(window.RIBBON);
    this.shapeRegistry.register(window.RIBBON_DISPERSED);
    this.shapeRegistry.register(window.VOLATILITY);
    this.shapeRegistry.register(window.HERO_HELIX);
    this.shapeRegistry.register(window.COLLAPSE);
    this.shapeRegistry.register(window.TRIPLE_SPHERE);
    this.shapeRegistry.register(window.TORUS);
    this.shapeRegistry.register(window.MOBILE);
    this.shapeRegistry.register(window.NOTE);
    this.shapeRegistry.register(window.DIAMOND);
    this.shapeRegistry.register(window.GLOBE);
    this.shapeRegistry.register(window.GAME);
    this.shapeRegistry.register(window.CHART);
    this.shapeRegistry.register(window.EMAIL);
    this.shapeRegistry.register(window.CAMERA);
    this.shapeRegistry.register(window.FOOTER);
    this.shapeRegistry.register(window.LAB);
    this.shapeRegistry.register(window.TERRAIN);
    this.shapeRegistry.register(window.GRID);
    this.shapeRegistry.register(window.DOTS);
    this.shapeRegistry.register(window.DISPERSED);

    // Register dispersed variants (alt versions with density + size variation)
    if (window.registerDispersedVariants) {
      window.registerDispersedVariants(this.shapeRegistry);
    }

    // Color configuration
    this.colorConfig = {
      generate: (particleCount, state) => this.generateParticleColors(particleCount, state)
    };

    // Animation loop
    this.loop = new window.ParticleAnimationLoop(this.container, this.config.particleCount, this.colorConfig, this.config);

    // State registry
    this.stateRegistry = new window.StateRegistry(this.config.particleCount);

    // Create non-GLB states immediately so start('dispersed') works right away
    await this._createImmediateStates();

    // Fade controller
    this.fadeController = new window.FadeController(this.container);

    // Trigger manager
    this.triggerManager = new window.TriggerManager();

    // Load GLBs in the background — creates remaining states when ready.
    // Deferred to requestIdleCallback (not kicked off immediately): each
    // file's fetch is async, but the moment it resolves, GLTFLoader parse +
    // subdivideGeometry + MeshSurfaceSampler.build() run synchronously — CPU
    // work, not I/O — and with 9 files tending to resolve in a burst, that
    // synchronous work bunches up and freezes the main thread for several
    // seconds right after page load. On a curtain-return (post -> close back
    // to home), that freeze starves page-transition.js's backfill
    // setTimeout(450/1200/2500) calls, so cards restore several seconds late
    // and then all pop in at once instead of being there already — these
    // GLBs are only morph targets for later scroll-triggered shape changes
    // elsewhere on the page, nothing on/near first paint depends on them, so
    // there's no reason they need to compete with critical-path work for the
    // thread. Idle callback lets already-queued work (backfill, entrance
    // animations) run first; the 2s timeout is a ceiling so this can't be
    // starved indefinitely on a page that's never truly idle.
    if (window.loadGLBMesh) {
      const startGLBLoad = () => {
        // lab.glb removed: 'lab' is now sphere-based (see shape-definitions.js),
        // generated immediately above — no GLB load to wait for.
        const meshFiles = ['mobile.glb', 'note.glb', 'diamond.glb', 'globe.glb', 'game.glb', 'chart.glb', 'email.glb', 'camera.glb', 'sim.glb'];
        Promise.allSettled(meshFiles.map(file => window.loadGLBMesh(file)))
          .then(() => {
            this.createInitialStates();
            window.particleSystemGLBsReady = true;
          });
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(startGLBLoad, { timeout: 2000 });
      } else {
        setTimeout(startGLBLoad, 0);
      }
    } else {
      window.particleSystemGLBsReady = true;
    }
  }

  async _createImmediateStates() {
    // Create only states that don’t depend on GLB meshes.
    // Single source of truth — createInitialStates() reads the same list to
    // decide what NOT to regenerate (see its comment).
    //
    // async + a requestAnimationFrame yield between EACH shape (was one
    // synchronous forEach): 13 generations (10 IMMEDIATE_SHAPES + 3
    // dispersed variants) at this.config.particleCount (16000 on desktop)
    // ran back-to-back with zero paint opportunity in between — measured
    // 500-2000ms of unbroken main-thread work on every load. Whenever that
    // window happened to overlap the hero's own letter-by-letter reveal
    // (scroll-scrub-anim.js initHero(), gated on preloader:done — this
    // method runs on an entirely separate, uncoordinated timer, a plain
    // 500ms setTimeout from script-parse in particle-morph.hbs), GSAP's
    // tween is time-based: with no frame able to paint any intermediate
    // state, it found real elapsed time already past the whole stagger's
    // duration the next time it COULD paint, and rendered the fully-
    // complete state directly — every letter appearing at once with no
    // visible stagger ("every now and then it just... appears, doesn't
    // animate letter by letter"). Yielding after each shape breaks that one
    // multi-hundred-ms block into ~13 short ones with a real paint chance
    // between each, so a concurrent animation elsewhere on the page keeps
    // advancing instead of skipping to its end state. system.start()
    // (particle-morph.hbs) already awaits this method, so total ordering
    // is unchanged — only now spread across frames instead of one tick.
    const nextFrame = () => new Promise(requestAnimationFrame);
    const immediate = ParticleMorphSystem.IMMEDIATE_SHAPES;
    for (const key of immediate) {
      try {
        const result = this.shapeRegistry.generateState(key, this.config.particleCount);
        const positions = result.positions || result;
        const sizes = result.sizes || null;
        // helix-only: per-particle tube angle, see helixGenerator's own
        // comment in shape-definitions.js and uHelixProgress's in
        // particle-animation-loop.js.
        const phis = result.phis || null;
        this.stateRegistry.register(key, positions, { shapeKey: key, sizes, phis });
      } catch (err) {
        console.warn(`[particle-morph-system] Could not create immediate state: ${key}`, err);
      }
      await nextFrame();
    }
    // Dispersed variants
    const variants = ['dispersed_dense', 'dispersed_chaos', 'dispersed_swarm'];
    for (const key of variants) {
      try {
        const shape = this.shapeRegistry.get(key);
        if (shape) {
          const result = shape.generate(shape.config.particleCount);
          const positions = result.positions || result;
          const sizes = result.sizes || null;
          this.stateRegistry.register(key, positions, { shapeKey: key, sizes });
        }
      } catch (err) {}
      await nextFrame();
    }
  }

  createInitialStates() {
    // Generate states for all shapes (must include every state used by triggers).
    // Three drift bugs fixed here, all of the "two lists that must agree"
    // kind that the style/shape registry work is meant to remove:
    //  - 'clapper' and 'genie' were listed but are NOT registered as shapes
    //    in initializeModules(), so they threw and warned on every single
    //    load. Removed (clapper.glb was deleted from Ghost content; see the
    //    preload comment in default.hbs).
    //  - 'ribbon' and 'volatility' were missing, so they existed only if
    //    _createImmediateStates() had already made them.
    //  - the skip-list below was a hand-maintained duplicate of
    //    _createImmediateStates()'s `immediate` array and had fallen behind
    //    it (missing 'ribbon'/'volatility'), so those two got regenerated
    //    here and clobbered the live state. Both now derive from one array.
    const shapes = ['dispersed', 'collapse', 'helix', 'hero-helix', 'ribbon', 'ribbon-dispersed', 'volatility', 'sphere', 'triple-sphere', 'torus', 'mobile', 'note', 'diamond', 'globe', 'game', 'chart', 'email', 'camera', 'footer', 'lab', 'terrain', 'grid', 'dots'];
    shapes.forEach(key => {
      try {
        // Skip states already created by _createImmediateStates to avoid overwriting live state
        if (this.stateRegistry.get(key) && ParticleMorphSystem.IMMEDIATE_SHAPES.includes(key)) return;
        const result = this.shapeRegistry.generateState(key, this.config.particleCount);
        const positions = result.positions || result; // Handle both old (array) and new (object) formats
        const sizes = result.sizes || null;
        // phis (helix-only per-particle tube angle) was captured in
        // _createImmediateStates but dropped here — a helix regenerated on
        // this path lost its wave animation input.
        const phis = result.phis || null;
        this.stateRegistry.register(key, positions, { shapeKey: key, sizes, phis });
        if (key === 'lab') {
          console.log(`[particle-morph-system] ✅ Lab state created with ${positions.length / 3} particles`);
        }
        // console.log(`[particle-morph-system] ✓ State created: ${key} (${positions.length / 3} particles)`);
      } catch (err) {
        if (key === 'lab') {
          console.warn(`[particle-morph-system] ❌ Failed to create lab state:`, err);
        } else {
          console.warn(`[particle-morph-system] ✗ Failed to create state: ${key}`, err);
        }
      }
    });

    // Also create variant states if available
    const variants = ['dispersed_dense', 'dispersed_chaos', 'dispersed_swarm'];
    variants.forEach(key => {
      try {
        const shape = this.shapeRegistry.get(key);
        if (shape) {
          // Variants use their own particle counts
          const result = shape.generate(shape.config.particleCount);
          const positions = result.positions || result;
          const sizes = result.sizes || null;
          this.stateRegistry.register(key, positions, { shapeKey: key, sizes });
          // console.log('[particle-morph-system] Variant state created:', key, 'with', shape.config.particleCount, 'particles');
        }
      } catch (err) {
        // console.warn('[particle-morph-system] Failed to create variant state:', key, err);
      }
    });
  }

  generateParticleColors(particleCount, state) {
    const colors = new Float32Array(particleCount * 3);

    // Read --color-particles from CSS (theme-responsive: bright cyan for dark, dark teal for light)
    let r = 90 / 255, g = 220 / 255, b = 220 / 255;  // Fallback: Soft cyan
    try {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-particles').trim();
      console.log('[particles-color] --color-particles raw:', raw,
                  '| data-theme:', document.documentElement.getAttribute('data-theme') || 'dark');
      if (raw) {
        const rgbMatch = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/);
        if (rgbMatch) {
          r = parseInt(rgbMatch[1], 10) / 255;
          g = parseInt(rgbMatch[2], 10) / 255;
          b = parseInt(rgbMatch[3], 10) / 255;
        } else if (document.body) {
          const tmp = document.createElement('div');
          tmp.style.color = raw;
          document.body.appendChild(tmp);
          const computed = getComputedStyle(tmp).color.trim();
          document.body.removeChild(tmp);
          console.log('[particles-color] computed CSS color:', computed);

          const parsed = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/);
          if (parsed) {
            r = parseInt(parsed[1], 10) / 255;
            g = parseInt(parsed[2], 10) / 255;
            b = parseInt(parsed[3], 10) / 255;
          }
        } else {
          // Canvas fallback for hex / named colors (body not ready yet)
          const cvs = document.createElement('canvas');
          const ctx = cvs.getContext('2d');
          ctx.fillStyle = raw;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          r = d[0] / 255; g = d[1] / 255; b = d[2] / 255;
        }
        console.log('[particles-color] Parsed RGB:', r.toFixed(3), g.toFixed(3), b.toFixed(3));
      }
    } catch (e) { console.error('[particles-color] Error reading color:', e); }

    for (let i = 0; i < particleCount; i++) {
      colors[i * 3]     = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    return colors;
  }

  updateColors() {
    // Regenerate colors with new theme's --color-particles and update particle loop
    console.log('[particles-theme] updateColors() called');

    if (this.loop && this.loop.particles) {
      const actualCount = this.loop.particles.geometry.attributes.position?.count
                          || this.config.particleCount
                          || 3000;
      console.log('[particles-theme] actual particle count:', actualCount);
      const newColors = this.generateParticleColors(actualCount);
      console.log('[particles-theme] newColors length:', newColors.length,
                  'sample:', Array.from(newColors.slice(0, 3)).map(v => v.toFixed(3)));

      if (this.loop.setColors) {
        this.loop.setColors(newColors);
      } else {
        console.warn('[particles-theme] setColors method not found on loop');
      }
    } else {
      console.warn('[particles-theme] No loop or particleCount available', {
        hasLoop: !!this.loop,
        particleCount: this.config.particleCount
      });
    }
  }

  setupTriggers(config = {}) {
    const defaults = {
      enableScroll: true,
      enableTime: false,
      enableViewport: true,
      scrollElement: this.container,
      viewportElement: null,
      actions: {
        scroll: [],
        time: [],
        viewport: []
      }
    };

    const opts = { ...defaults, ...config };

    if (opts.enableScroll && opts.scrollElement) {
      this.triggerManager.registerScroll('scroll-main', opts.scrollElement, opts.actions.scroll || []);
    }

    if (opts.enableTime) {
      this.triggerManager.registerTime('time-main', opts.actions.time || []);
    }

    if (opts.enableViewport && opts.viewportElement) {
      this.triggerManager.registerViewport('viewport-main', opts.viewportElement, opts.actions.viewport || []);
    }

    this.triggerManager.init((action) => this.handleTriggerAction(action));
  }

  handleTriggerAction(action) {
    if (action.action === 'fade-in') {
      this.fadeController.fadeIn(action.duration || 1500);
    } else if (action.action === 'fade-out') {
      this.fadeController.fadeOut(action.duration || 1500);
    } else if (action.action === 'morph') {
      // Check if we're morphing FROM dispersed or to/from helix
      const currentState = this.loop.currentState?.config?.shapeKey || 'dispersed';
      const nextState = action.state;

      if (currentState === 'dispersed' || nextState === 'dispersed' || nextState === 'helix' || currentState === 'helix') {
        // Dispersed ↔ Object, or anything involving Helix: smooth morph
        const state = this.stateRegistry.get(nextState);
        if (state) {
          this.loop.setState(state, action.duration || this.config.morphDuration);
        }
      } else {
        // Object → Object (card to card): dissolve current, assemble new from dispersed
        // console.log(`[particle-morph-system] Dissolve-assemble: ${currentState} → ${nextState}`);
        this.dissolveAndAssemble(nextState, action.duration || this.config.morphDuration);
      }
    } else if (action.action === 'set-state') {
      const nextState = this.stateRegistry.get(action.state);
      if (nextState) {
        this.loop.setState(nextState, 0);
      }
    }
  }

  dissolveAndAssemble(targetState, duration) {
    // 1. Fade out current particles (dissolve)
    // 2. Fade in target state particles (assemble)
    const fadeOutDuration = duration * 0.5;
    const fadeInDuration = duration * 0.5;
    const delayBeforeAssemble = 0;  // Start assembling while dissolving

    // Fade out current
    this.fadeController.fadeOut(fadeOutDuration);

    // After brief delay, fade in new state
    setTimeout(() => {
      const state = this.stateRegistry.get(targetState);
      if (state) {
        // Set to target state (positions) while faded out
        this.loop.setState(state, 0);  // Instant swap of positions
      }
      // Always fade back in — even if state missing, restore visibility
      this.fadeController.fadeIn(fadeInDuration);
    }, fadeOutDuration * 1000 * 0.5);  // Overlap the fade out/in
  }

  start(initialState = 'dispersed') {
    // Set initial state without morphing
    const initialParticles = this.stateRegistry.get(initialState);
    if (initialParticles) {
      this.loop.setState(initialParticles, 0);
    }

    // Start animation loop
    this.loop.start();

    // Update TIME triggers. This used to self-schedule via rAF every frame
    // forever — a second always-on 60-120Hz loop next to the render loop —
    // even though nothing on the site registers a time trigger (registerTime
    // is gated on config.enableTime, which is never set). Poll lazily
    // instead: a cheap 500ms timeout that upgrades itself to rAF cadence
    // only while time triggers actually exist.
    const updateFrame = () => {
      if (this.triggerManager.timeTriggers && this.triggerManager.timeTriggers.length) {
        this.triggerManager.update();
        requestAnimationFrame(updateFrame);
      } else {
        setTimeout(updateFrame, 500);
      }
    };
    updateFrame();
  }

  morphTo(state, duration = null) {
    const nextState = this.stateRegistry.get(state);
    if (nextState) {
      // ?? not || — duration:0 (an explicit instant-snap request; see
      // particle-animation-loop.js's setState, which treats duration<=0 as
      // "jump straight there, no interpolation") is falsy, so || silently
      // replaced it with the default morphDuration, making a genuine
      // "instant" request impossible to express through this call. ?? only
      // falls back for null/undefined, i.e. "no duration specified at all".
      this.loop.setState(nextState, duration ?? this.config.morphDuration);
      console.log(`[particle-morph-system] morphTo('${state}') executed`);
    } else {
      console.warn(`[particle-morph-system] morphTo('${state}') skipped — state not registered yet. GLBs ready: ${!!window.particleSystemGLBsReady}`);
    }
  }

  /**
   * Initialize Lab wave binding — scroll-driven color wave propagates from
   * top of Lab section downward through particle field. Uses bindShift to
   * map section entry progress (0-1) to particle field's y-extent.
   */
  initLabWave() {
    console.log('[lab-wave] initLabWave called');
    console.log('[lab-wave] this.loop:', !!this.loop, 'particles:', !!(this.loop && this.loop.particles));

    if (!this.loop || !this.loop.particles) {
      console.warn('[lab-wave] No particle loop yet; deferring Lab wave init');
      return;
    }

    const labSection = document.querySelector('.posts-tabs-grid-lab-section');
    console.log('[lab-wave] Lab section found:', !!labSection);
    if (!labSection) {
      console.warn('[lab-wave] Lab section not found');
      return;
    }

    console.log('[lab-wave] BackgroundLayer available:', !!window.BackgroundLayer);
    console.log('[lab-wave] bindShift available:', !!(window.BackgroundLayer && window.BackgroundLayer.bindShift));

    if (!window.BackgroundLayer || !window.BackgroundLayer.bindShift) {
      console.warn('[lab-wave] BackgroundLayer.bindShift not available');
      return;
    }

    // Compute the Lab/orb shape's OWN rest-position y-extent — NOT
    // this.loop.getParticleBounds() with no argument, which reads whatever
    // is CURRENTLY uploaded to the live geometry buffer. initLabWave() runs
    // 50ms after system.start('dispersed') (see particle-morph.hbs), so at
    // call time the live buffer is still the 'dispersed' cloud (a ±25 random
    // range), not the lab/orb sphere's actual ~±3 range. Binding the wave to
    // that mismatched range meant the wavefront swept through empty space
    // for nearly the whole scroll — using the lab state's own stored rest
    // positions (available immediately now that it's sphere-based, not
    // GLB-loaded) fixes the coordinate space regardless of what shape is
    // on screen when this happens to run.
    const labState = this.stateRegistry.get('lab');
    const bounds = labState
      ? this.loop.getParticleBounds(labState.positions)
      : this.loop.getParticleBounds();
    const yExtent = bounds.maxY - bounds.minY;

    // AUTONOMOUS WAVE (was scroll-scrubbed via bindShift): the wavefront
    // now travels on its own cadence whenever the Lab shape is on screen —
    // an eased sweep DOWN (tinting particles as it passes), a brief dwell,
    // an eased sweep back UP (untinting — a ping-pong, deliberately, so
    // there is never a snap-reset of all tinted particles the way a
    // wrap-around loop would cause), another dwell, then again. Every leg
    // and dwell duration is drawn fresh from a random range so the rhythm
    // reads as breathing, not a loop. Gated by uLabProgress — the SAME
    // shape-driven blend the orb deformation uses (see animate()) — so the
    // wave ramps in/out with morphs and parks fully above the shape
    // (zero tint) whenever Lab isn't the active shape. Runs as a
    // loop._rafCallbacks entry: same RAF tick as the render, no own loop.
    const LEG_S = [5, 9];        // sweep duration range (s) — cadence knob
    const DWELL_S = [0.6, 1.8];  // end-of-sweep pause range (s)
    const park = bounds.maxY + 3; // fully above the shape → no tint
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    let phase = 'down';
    let legDur = rand(LEG_S[0], LEG_S[1]);
    let tLeft = legDur;
    let pos01 = 0;
    let last = performance.now();
    this.loop._rafCallbacks.push(() => {
      const u = this.loop.particles && this.loop.particles.material.uniforms;
      if (!u) return;
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1); // clamp tab-suspend gaps
      last = now;
      if (u.uPrefersReducedMotion.value) { u.uWavefront.value = park; return; }
      tLeft -= dt;
      if (phase === 'down' || phase === 'up') {
        const p = 1 - Math.max(tLeft, 0) / legDur;
        const eased = 0.5 - 0.5 * Math.cos(p * Math.PI); // smooth both ends
        pos01 = (phase === 'down') ? eased : 1 - eased;
        if (tLeft <= 0) {
          phase = (phase === 'down') ? 'dwellBottom' : 'dwellTop';
          tLeft = rand(DWELL_S[0], DWELL_S[1]);
        }
      } else if (tLeft <= 0) {
        phase = (phase === 'dwellBottom') ? 'up' : 'down';
        legDur = rand(LEG_S[0], LEG_S[1]);
        tLeft = legDur;
      }
      const cyclePos = bounds.maxY - pos01 * yExtent;
      const labAmount = u.uLabProgress.value;
      u.uWavefront.value = park + (cyclePos - park) * labAmount;
    });

    // Sample card aura colors from the Lab grid and blend them for the wave gradient
    // For now, use a reasonable default; future: query card data-gradient-css or accent colors
    const labCards = labSection.querySelectorAll('.grid-card');
    console.log('[lab-wave] Lab cards found:', labCards.length);
    if (labCards.length > 0) {
      // Sample first card's aura color (if available) or use default cyan
      const firstCard = labCards[0];
      const accentColor = window.getComputedStyle(firstCard).getPropertyValue('--grid-card-accent-color') || '#5ad8ff';
      console.log('[lab-wave] Accent color:', accentColor);
      try {
        const rgb = window.BackgroundLayer.parseColorToRGB(accentColor);
        this.loop.particles.material.uniforms.uWaveColor.value = new THREE.Color(
          `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
        );
        console.log('[lab-wave] ✅ Wave color set');
      } catch (e) {
        console.warn('[lab-wave] Could not parse card accent color:', accentColor);
      }
    }
    console.log('[lab-wave] ✅ Lab wave initialized successfully');
  }

  destroy() {
    this.triggerManager.destroy();
    if (this.loop && this.loop.renderer) {
      this.loop.renderer.dispose();
    }
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ParticleMorphSystem = ParticleMorphSystem;
}
