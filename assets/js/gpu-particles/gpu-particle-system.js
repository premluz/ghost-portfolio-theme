/**
 * GPU Particle System
 * Main orchestrator for WebGPU-based particle rendering
 * Independent system that can coexist with or replace current particle system
 */

class GPUParticleSystem {
  constructor(canvasSelector, config = {}) {
    // Canvas setup
    const canvasEl = document.querySelector(canvasSelector);
    if (!canvasEl) {
      throw new Error(`Canvas element not found: ${canvasSelector}`);
    }
    this.canvas = canvasEl;

    // WebGPU device (set during init)
    this.device = null;
    this.adapter = null;

    // System components
    this.shaderCompiler = null;
    this.computeEngine = null;
    this.renderer = null;
    this.shapeLoader = null;
    this.morphController = null;
    this.state = null;
    this.scrollDriver = null;
    this.shapeRegistry = null;
    this.monitor = null;

    // Configuration
    this.config = {
      particleCount: config.particleCount || 2000,
      shaderPath: config.shaderPath || '/assets/js/gpu-particles/shaders/',
      ...config
    };

    // Animation state
    this.isRunning = false;
    this.animationFrameId = null;
    this.lastFrameTime = performance.now();
    this.currentTime = 0;
    this.deltaTime = 0;

    console.log('[GPUParticleSystem] Created with config:', this.config);
  }

  /**
   * Initialize the GPU particle system
   * Checks WebGPU support, requests device, initializes subsystems
   */
  async init() {
    try {
      console.log('[GPUParticleSystem] Initializing...');

      // 1. Check WebGPU support
      if (!navigator.gpu) {
        console.warn('[GPUParticleSystem] WebGPU not supported, falling back to existing system');
        this._fallbackToExistingSystem();
        return false;
      }

      // 2. Request adapter and device
      await this._initializeGPU();

      // 3. Initialize shader compiler
      this.shaderCompiler = new GPUShaderCompiler(this.device);

      // 4. Load and compile shaders
      const shaders = await this._loadShaders();

      // 5. Initialize particle state
      this.state = new GPUParticleState(this.config.particleCount);

      // 6. Initialize compute engine
      this.computeEngine = new GPUComputeEngine(this.device, this.config.particleCount);
      await this.computeEngine.init(shaders.compute);

      // Link state to GPU buffers
      const buffers = this.computeEngine.getBuffers();
      this.state.setGPUBuffers(buffers.positionBuffer, buffers.targetPositionBuffer, buffers.rotationBuffer);

      // 7. Initialize shape loader
      this.shapeLoader = new ShapeLoader(this.device);
      await this.shapeLoader.connectRegistry(window.shapeRegistry);

      // 8. Initialize morph controller
      this.morphController = new GPUMorphController(this, this.shapeLoader, this.state);

      // 9. Load initial dispersed shape (matches old particle system hero appearance)
      const dispersedGeometry = await this.shapeLoader.loadShape('dispersed', this.config.particleCount);
      if (dispersedGeometry) {
        this.state.setInitialPositions(dispersedGeometry);
        this._copyStateToGPU();
      } else {
        console.warn('[GPUParticleSystem] Dispersed load failed, using sphere fallback');
        const sphereGeometry = await this.shapeLoader.loadShape('sphere', this.config.particleCount);
        if (sphereGeometry) {
          this.state.setInitialPositions(sphereGeometry);
          this._copyStateToGPU();
        }
      }

      // 10. Initialize renderer
      this.renderer = new GPURenderer(this.device, this.canvas, this.config.particleCount);
      await this.renderer.init(shaders.vertex, shaders.fragment, buffers.positionBuffer, buffers.rotationBuffer);

      // 11. Start animation loop
      this._startAnimationLoop();

      console.log('[GPUParticleSystem] ✅ Initialized successfully');
      return true;
    } catch (error) {
      console.error('[GPUParticleSystem] Initialization failed:', error);
      this._fallbackToExistingSystem();
      return false;
    }
  }

  /**
   * Initialize WebGPU adapter and device
   * @private
   */
  async _initializeGPU() {
    console.log('[GPUParticleSystem] Requesting WebGPU adapter...');

    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      throw new Error('No WebGPU adapter found');
    }

    this.device = await this.adapter.requestDevice();
    if (!this.device) {
      throw new Error('Failed to request WebGPU device');
    }

    console.log('[GPUParticleSystem] ✅ WebGPU device initialized');
  }

  /**
   * Load and compile all shader modules
   * @private
   */
  async _loadShaders() {
    console.log('[GPUParticleSystem] Loading shaders...');

    const shaderMap = {
      compute: this.config.shaderPath + 'compute-particles.wgsl',
      vertex: this.config.shaderPath + 'particle-render.wgsl',
      fragment: this.config.shaderPath + 'particle-fragment.wgsl'
    };

    return await this.shaderCompiler.loadAndCompileMultiple({
      compute: shaderMap.compute,
      vertex: shaderMap.vertex,
      fragment: shaderMap.fragment
    });
  }

  /**
   * Start the animation loop
   * @private
   */
  _startAnimationLoop() {
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    const animationLoop = (now) => {
      // PARTICLE_SCENARIO 'hide' support — twin of the same gate in the
      // legacy loop (particle-animation-loop.js animate()): while the layer
      // is faded out, skip simulation + render but keep the rAF and the
      // clock alive so resume is seamless.
      if (window.__particleLayerHidden) {
        this.lastFrameTime = now;
        this.animationFrameId = requestAnimationFrame(animationLoop);
        return;
      }
      this.deltaTime = (now - this.lastFrameTime) / 1000; // Convert to seconds
      this.lastFrameTime = now;
      this.currentTime += this.deltaTime;

      // Update morphs
      this.morphController.update(this.deltaTime);

      // Update and render
      this._updateFrame(this.deltaTime);
      this.renderer.render();

      // Handle canvas resize
      this.renderer.handleResize();

      // Record performance metrics
      if (this.monitor) {
        this.monitor.recordFrame();
      }

      // Continue loop
      this.animationFrameId = requestAnimationFrame(animationLoop);
    };

    this.animationFrameId = requestAnimationFrame(animationLoop);
    console.log('[GPUParticleSystem] ✅ Animation loop started');
  }

  /**
   * Update frame: dispatch compute shader and update uniforms
   * @private
   */
  _updateFrame(deltaTime) {
    // Update target positions if morphing
    if (this.state.isMorphing()) {
      this.computeEngine.updateTargetPositions(this.state.targetPositions);
    }

    // Dispatch compute
    this.computeEngine.dispatch(deltaTime, {
      morphProgress: this.state.morphProgress,
      morphTarget: 0, // Shape ID (0=sphere, 1=torus, etc.)
      time: this.currentTime
    });

    // Copy updated positions to state for next frame
    this._copyGPUToState();
  }

  /**
   * Set morph target shape
   * @param {string} shapeName - Shape name (e.g., 'sphere', 'torus', 'diamond')
   * @param {number} duration - Morph duration in seconds (default 1.0)
   */
  async setMorphTarget(shapeName, duration = 1.0) {
    return await this.morphController.requestMorph(shapeName, duration);
  }

  /**
   * Compatibility alias for morphTo (used by particle-morph.hbs)
   * @param {string} shapeName - Name of the shape to morph to
   * @param {number} duration - Morph duration in milliseconds (converted to seconds)
   */
  morphTo(shapeName, durationMs = 1000) {
    const durationSec = durationMs / 1000;
    console.log('[GPUParticleSystem] morphTo called:', shapeName, 'duration:', durationSec + 's');
    return this.setMorphTarget(shapeName, durationSec);
  }

  /**
   * Initialize with starting shape (used by particle-morph.hbs on page load)
   * @param {string} shapeName - Initial shape name
   */
  async start(shapeName) {
    console.log(`[GPUParticleSystem] Starting with shape: ${shapeName}`);
    return await this.setMorphTarget(shapeName, 0.1);  // Quick morph to avoid visible pop
  }

  /**
   * Stop animation loop and clean up
   */
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.computeEngine?.destroy();
    this.renderer?.destroy();
    this.device?.destroy?.();

    this.isRunning = false;
    console.log('[GPUParticleSystem] ✅ Destroyed');
  }

  /**
   * Copy particle state to GPU buffers (initial load)
   * @private
   */
  _copyStateToGPU() {
    if (!this.computeEngine) return;

    this.computeEngine.updateTargetPositions(this.state.targetPositions);
    console.log('[GPUParticleSystem] Copied state to GPU');
  }

  /**
   * Copy GPU buffer data back to CPU state (optional, for debugging)
   * @private
   */
  async _copyGPUToState() {
    // Note: This is optional. We only need this if we inspect particle data.
    // For now, just keep state in sync with uniforms.
  }

  /**
   * Fallback to existing particle system if WebGPU unavailable
   * @private
   */
  _fallbackToExistingSystem() {
    console.log('[GPUParticleSystem] Using existing particle system');
    // Hide GPU canvas, show existing system
    this.canvas.style.display = 'none';
  }

  /**
   * Check if GPU system is running
   */
  isSupported() {
    return this.isRunning && navigator.gpu !== undefined;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.monitor ? this.monitor.getMetrics() : null;
  }

  /**
   * Get performance status
   */
  getPerformanceStatus() {
    return this.monitor ? this.monitor.getStatus() : null;
  }

  /**
   * Register scroll-bound morph section
   */
  registerScrollSection(element, config) {
    if (!this.scrollDriver) {
      console.warn('[GPUParticleSystem] Scroll driver not initialized');
      return;
    }
    this.scrollDriver.registerScrollSection(element, config);
  }

  /**
   * Enable scroll binding
   */
  enableScrollBinding() {
    if (!this.scrollDriver) {
      console.warn('[GPUParticleSystem] Scroll driver not initialized');
      return;
    }
    this.scrollDriver.enable();
  }

  /**
   * Disable scroll binding
   */
  disableScrollBinding() {
    if (!this.scrollDriver) {
      console.warn('[GPUParticleSystem] Scroll driver not initialized');
      return;
    }
    this.scrollDriver.disable();
  }

  /**
   * Get available shapes
   */
  getAvailableShapes() {
    if (!this.shapeRegistry) return [];
    return this.shapeRegistry.listAvailableShapes();
  }

  /**
   * Preload shapes
   */
  async preloadShapes(shapeNames) {
    if (!this.shapeRegistry) {
      console.warn('[GPUParticleSystem] Shape registry not initialized');
      return;
    }
    return await this.shapeRegistry.preloadShapes(shapeNames, this.config.particleCount);
  }

  /**
   * Get shape registry memory info
   */
  getShapeMemoryInfo() {
    if (!this.shapeRegistry) return null;
    return this.shapeRegistry.getMemoryInfo();
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.GPUParticleSystem = GPUParticleSystem;
}
