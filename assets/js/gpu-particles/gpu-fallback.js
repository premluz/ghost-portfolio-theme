/**
 * GPU Fallback
 * Graceful WebGPU detection and fallback to existing particle system
 */

class GPUFallback {
  /**
   * Check if WebGPU is supported
   */
  static isSupported() {
    return !!navigator.gpu;
  }

  /**
   * Detect WebGPU support with detailed info
   */
  static async detectCapabilities() {
    const info = {
      supported: !!navigator.gpu,
      adapter: null,
      device: null,
      limits: null,
      features: null,
      browser: this._detectBrowser(),
      os: this._detectOS()
    };

    if (!navigator.gpu) {
      return info;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return info;
      }

      info.adapter = adapter;

      const device = await adapter.requestDevice();
      if (!device) {
        return info;
      }

      info.device = device;
      info.limits = device.limits;
      info.features = Array.from(device.features);
    } catch (error) {
      console.warn('[GPUFallback] Error detecting capabilities:', error);
    }

    return info;
  }

  /**
   * Create GPU particle system with automatic fallback
   * @param {string} canvasSelector - Canvas element selector
   * @param {Object} config - Configuration options
   * @returns {Promise<GPUParticleSystem|null>}
   */
  static async createSystem(canvasSelector, config = {}) {
    console.log('[GPUFallback] Creating particle system with automatic fallback...');

    // Check WebGPU support
    if (!navigator.gpu) {
      console.warn('[GPUFallback] WebGPU not supported, falling back to existing system');
      return this._fallbackToExistingSystem(canvasSelector);
    }

    try {
      // Create GPU system
      const system = new GPUParticleSystem(canvasSelector, config);

      // Initialize with error handling
      const initialized = await system.init();

      if (!initialized) {
        console.warn('[GPUFallback] GPU system initialization failed, using existing system');
        return this._fallbackToExistingSystem(canvasSelector);
      }

      // Add performance monitor if requested
      if (config.monitoring) {
        system.monitor = new GPUPerformanceMonitor();
      }

      // Add shape registry
      if (config.shapeRegistry) {
        system.shapeRegistry = new GPUShapeRegistry(system.shapeLoader);

        // Expose registry as stateRegistry for compatibility with main.js
        // main.js expects: stateRegistry.get(cardId) to check if shape is loaded
        system.stateRegistry = {
          get: (shapeName) => system.shapeRegistry.shapes[shapeName] || null
        };
      }

      // Add scroll driver
      if (config.scrollDriver) {
        system.scrollDriver = new GPUScrollDriver(system, system.morphController);
        system.scrollDriver.enable();
      }

      // Preload shapes if requested
      if (config.preloadShapes && system.shapeRegistry) {
        const toPreload = config.preloadShapes === true
          ? system.shapeRegistry.getPreloadRecommendations()
          : config.preloadShapes;

        await system.shapeRegistry.preloadShapes(toPreload, config.particleCount || 2000);

        // Signal that GLBs are ready for main.js card morph system
        window.particleSystemGLBsReady = true;
        console.log('[GPUFallback] ✅ GLBs loaded, particleSystemGLBsReady = true');
      }

      console.log('[GPUFallback] ✅ GPU system initialized successfully');
      return system;
    } catch (error) {
      console.error('[GPUFallback] GPU system creation failed:', error);
      return this._fallbackToExistingSystem(canvasSelector);
    }
  }

  /**
   * Fallback to existing particle system
   * @private
   */
  static _fallbackToExistingSystem(canvasSelector) {
    console.log('[GPUFallback] Using existing particle system');

    // Hide GPU canvas
    const canvas = document.querySelector(canvasSelector);
    if (canvas) {
      canvas.style.display = 'none';
    }

    // Return stub system that does nothing
    return {
      isGPU: false,
      isSupported: () => false,
      setMorphTarget: async () => console.warn('GPU particles unavailable'),
      destroy: () => {}
    };
  }

  /**
   * Detect browser
   * @private
   */
  static _detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  /**
   * Detect OS
   * @private
   */
  static _detectOS() {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Android')) return 'Android';
    return 'Unknown';
  }

  /**
   * Log system capabilities
   */
  static async logCapabilities() {
    const caps = await this.detectCapabilities();
    console.group('[GPUFallback] Capabilities');
    console.log('Supported:', caps.supported);
    console.log('Browser:', caps.browser);
    console.log('OS:', caps.os);
    if (caps.limits) {
      console.log('Max Compute Workgroups:', caps.limits.maxComputeWorkgroupsPerDimension);
      console.log('Max Buffer Bind Groups:', caps.limits.maxBindGroups);
    }
    console.groupEnd();
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUFallback = GPUFallback;
}
