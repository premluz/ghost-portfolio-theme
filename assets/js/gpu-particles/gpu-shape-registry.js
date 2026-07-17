/**
 * GPU Shape Registry
 * Load, cache, and manage all particle shapes (math + GLB + variants)
 */

class GPUShapeRegistry {
  constructor(shapeLoader) {
    this.shapeLoader = shapeLoader;
    this.shapes = {};        // Loaded shapes cache
    this.loading = {};       // In-progress loads
    this.preloadQueue = [];  // Shapes to preload

    // Available shapes (math + GLB + variants)
    this.availableShapes = {
      // Math shapes
      helix: { type: 'math', label: 'Helix' },
      sphere: { type: 'math', label: 'Sphere' },
      torus: { type: 'math', label: 'Torus' },
      cube: { type: 'math', label: 'Cube' },
      pyramid: { type: 'math', label: 'Pyramid' },
      disperse: { type: 'math', label: 'Disperse' },

      // GLB shapes
      diamond: { type: 'glb', label: 'Diamond' },
      globe: { type: 'glb', label: 'Globe' },
      game: { type: 'glb', label: 'Game' },
      chart: { type: 'glb', label: 'Chart' },
      email: { type: 'glb', label: 'Email' },
      camera: { type: 'glb', label: 'Camera' },
      clapper: { type: 'glb', label: 'Clapper' },
      note: { type: 'glb', label: 'Note' },
      mobile: { type: 'glb', label: 'Mobile' },
      sim: { type: 'glb', label: 'SIM' },
      lab: { type: 'glb', label: 'Lab' }
    };

    console.log('[GPUShapeRegistry] Created with', Object.keys(this.availableShapes).length, 'shapes');
  }

  /**
   * Preload shapes for instant access
   * @param {string|Array<string>} shapeNames - Shape name(s) to preload
   */
  async preloadShapes(shapeNames, particleCount) {
    const names = Array.isArray(shapeNames) ? shapeNames : [shapeNames];

    for (const name of names) {
      if (this.shapes[name]) continue; // Already loaded

      console.log(`[GPUShapeRegistry] Preloading: ${name}`);

      try {
        const geometry = await this.shapeLoader.loadShape(name, particleCount);
        if (geometry) {
          this.shapes[name] = geometry;
          console.log(`[GPUShapeRegistry] ✅ Preloaded: ${name}`);
        }
      } catch (error) {
        console.warn(`[GPUShapeRegistry] Failed to preload ${name}:`, error);
      }
    }
  }

  /**
   * Get a shape (load if not cached)
   * @param {string} shapeName - Shape to load
   * @param {number} particleCount - Particle count
   * @returns {Promise<Object>} Geometry object
   */
  async getShape(shapeName, particleCount) {
    // Return cached shape
    if (this.shapes[shapeName]) {
      return this.shapes[shapeName];
    }

    // Avoid duplicate loads
    if (this.loading[shapeName]) {
      return await this.loading[shapeName];
    }

    // Load shape
    const loadPromise = this.shapeLoader.loadShape(shapeName, particleCount)
      .then(geometry => {
        this.shapes[shapeName] = geometry;
        delete this.loading[shapeName];
        return geometry;
      })
      .catch(error => {
        delete this.loading[shapeName];
        throw error;
      });

    this.loading[shapeName] = loadPromise;
    return loadPromise;
  }

  /**
   * Get all available shapes info
   */
  listAvailableShapes() {
    return Object.entries(this.availableShapes).map(([name, info]) => ({
      name,
      ...info,
      loaded: !!this.shapes[name],
      loading: !!this.loading[name]
    }));
  }

  /**
   * Get preload recommendations (shapes likely to be used)
   */
  getPreloadRecommendations() {
    return ['sphere', 'torus', 'cube', 'diamond', 'globe'];
  }

  /**
   * Clear cache (for memory management)
   */
  clearCache() {
    this.shapes = {};
    console.log('[GPUShapeRegistry] Cache cleared');
  }

  /**
   * Get memory usage info
   */
  getMemoryInfo() {
    const loaded = Object.keys(this.shapes).length;
    const loading = Object.keys(this.loading).length;
    const available = Object.keys(this.availableShapes).length;

    return {
      loaded,
      loading,
      available,
      coverage: (loaded / available * 100).toFixed(1) + '%'
    };
  }

  /**
   * Destroy registry
   */
  destroy() {
    this.shapes = {};
    this.loading = {};
    console.log('[GPUShapeRegistry] Destroyed');
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUShapeRegistry = GPUShapeRegistry;
}
