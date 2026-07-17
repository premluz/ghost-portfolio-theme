/**
 * Particle Morph System - Main orchestrator for modular particle animation
 */

class ParticleMorphSystem {
  constructor(container, config = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.config = {
      particleCount: config.particleCount || 200,
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
    this._createImmediateStates();

    // Fade controller
    this.fadeController = new window.FadeController(this.container);

    // Trigger manager
    this.triggerManager = new window.TriggerManager();

    // Load GLBs in the background — creates remaining states when ready
    if (window.loadGLBMesh) {
      // lab.glb removed: 'lab' is now sphere-based (see shape-definitions.js),
      // generated immediately below — no GLB load to wait for.
      const meshFiles = ['mobile.glb', 'note.glb', 'diamond.glb', 'globe.glb', 'game.glb', 'chart.glb', 'email.glb', 'camera.glb', 'sim.glb'];
      Promise.allSettled(meshFiles.map(file => window.loadGLBMesh(file)))
        .then(() => {
          this.createInitialStates();
          window.particleSystemGLBsReady = true;
        });
    } else {
      window.particleSystemGLBsReady = true;
    }
  }

  _createImmediateStates() {
    // Create only states that don’t depend on GLB meshes
    const immediate = ['dispersed', 'helix', 'lab', 'terrain', 'grid'];
    immediate.forEach(key => {
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
    });
    // Dispersed variants
    const variants = ['dispersed_dense', 'dispersed_chaos', 'dispersed_swarm'];
    variants.forEach(key => {
      try {
        const shape = this.shapeRegistry.get(key);
        if (shape) {
          const result = shape.generate(shape.config.particleCount);
          const positions = result.positions || result;
          const sizes = result.sizes || null;
          this.stateRegistry.register(key, positions, { shapeKey: key, sizes });
        }
      } catch (err) {}
    });
  }

  createInitialStates() {
    // Generate states for all shapes (must include every state used by triggers)
    const shapes = ['dispersed', 'helix', 'sphere', 'triple-sphere', 'torus', 'mobile', 'note', 'clapper', 'diamond', 'globe', 'game', 'chart', 'email', 'genie', 'camera', 'footer', 'lab', 'terrain', 'grid'];
    shapes.forEach(key => {
      try {
        // Skip states already created by _createImmediateStates to avoid overwriting live state
        if (this.stateRegistry.get(key) && (key === 'dispersed' || key === 'helix' || key === 'lab' || key === 'terrain' || key === 'grid')) return;
        const result = this.shapeRegistry.generateState(key, this.config.particleCount);
        const positions = result.positions || result; // Handle both old (array) and new (object) formats
        const sizes = result.sizes || null;
        this.stateRegistry.register(key, positions, { shapeKey: key, sizes });
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

    // Update triggers each frame
    const updateFrame = () => {
      this.triggerManager.update();
      requestAnimationFrame(updateFrame);
    };
    updateFrame();
  }

  morphTo(state, duration = null) {
    const nextState = this.stateRegistry.get(state);
    if (nextState) {
      this.loop.setState(nextState, duration || this.config.morphDuration);
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

    // Bind scroll progress (0-1 as user scrolls into/through Lab) to wavefront position
    // Wavefront travels from top of particle field (maxY) downward to bottom (minY)
    window.BackgroundLayer.bindShift(
      labSection,
      '--lab-wave-progress',
      {
        onProgress: (t) => {
          // Map scroll progress to wavefront y-position: starts at top (maxY), ends at bottom (minY)
          const wavefront = bounds.maxY - (t * yExtent);
          this.loop.particles.material.uniforms.uWavefront.value = wavefront;
          // NOTE: orb deformation amplitude (uLabProgress) is NOT driven
          // from here (scroll) — it's driven purely by which shape is
          // currently active, in ParticleAnimationLoop.animate(). The orb
          // is meant to be continuously, independently morphing whenever
          // it's on screen, not something scrubbing pauses/resumes.
        }
      }
    );

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
