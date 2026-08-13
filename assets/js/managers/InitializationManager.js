(function() { 'use strict';/**
 * INITIALIZATION MANAGER
 * Handles dependency-based initialization sequence
 * Ensures modules load in correct order without race conditions
 */

class InitializationManager {
  constructor() {
    this.modules = new Map();
    this.initialized = new Set();
    this.errors = new Map();
    this.DEBUG = false; // Set to true for debug output
  }

  /**
   * Register a module to be initialized
   * @param {string} name - Module name (unique identifier)
   * @param {string[]} dependencies - Array of module names this depends on
   * @param {Function} initFn - Async or sync function to initialize module
   */
  register(name, dependencies = [], initFn) {
    if (typeof initFn !== 'function') {
      throw new Error(`InitializationManager: ${name} initFn must be a function`);
    }

    this.modules.set(name, {
      name,
      dependencies,
      initFn,
      startTime: null,
      endTime: null,
    });

    this.log(`Registered module: ${name} (deps: ${dependencies.join(', ') || 'none'})`);
  }

  /**
   * Initialize all registered modules in correct dependency order
   * @returns {Promise<boolean>} true if all modules initialized, false if errors
   */
  async initialize() {
    try {
      const sorted = this.topologicalSort();

      this.log(`Initializing ${sorted.length} modules in order:`, sorted);

      for (const name of sorted) {
        const module = this.modules.get(name);

        // Check if already initialized
        if (this.initialized.has(name)) {
          this.log(`⏭️  ${name} already initialized, skipping`);
          continue;
        }

        try {
          module.startTime = performance.now();
          this.log(`🚀 Starting: ${name}`);

          // Call initialization function
          await Promise.resolve(module.initFn());

          module.endTime = performance.now();
          const duration = (module.endTime - module.startTime).toFixed(2);

          this.initialized.add(name);
          this.log(`✅ Complete: ${name} (${duration}ms)`);
        } catch (err) {
          this.errors.set(name, err);
          console.error(`❌ Failed to initialize ${name}:`, err);

          // Continue with other modules (non-blocking)
          // but log the error
        }
      }

      // Report any failures
      if (this.errors.size > 0) {
        console.warn(`⚠️  Initialization completed with ${this.errors.size} error(s)`);
        return false;
      }

      this.log(`🎉 All modules initialized successfully`);
      return true;
    } catch (err) {
      console.error('InitializationManager fatal error:', err);
      return false;
    }
  }

  /**
   * Topological sort - order modules by dependencies
   * @returns {string[]} Sorted module names
   */
  topologicalSort() {
    const visited = new Set();
    const sorted = [];
    const visiting = new Set(); // For cycle detection

    const visit = (name) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      visiting.add(name);
      const module = this.modules.get(name);

      if (module) {
        // Visit dependencies first
        for (const dep of module.dependencies) {
          if (!this.modules.has(dep)) {
            throw new Error(`Module ${name} depends on unknown module: ${dep}`);
          }
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    // Visit all modules
    for (const name of this.modules.keys()) {
      visit(name);
    }

    return sorted;
  }

  /**
   * Check if a module has been initialized
   * @param {string} name - Module name
   * @returns {boolean}
   */
  isInitialized(name) {
    return this.initialized.has(name);
  }

  /**
   * Get initialization error for a module (if any)
   * @param {string} name - Module name
   * @returns {Error|null}
   */
  getError(name) {
    return this.errors.get(name) || null;
  }

  /**
   * Get timing information
   * @returns {Object} Timing data for all modules
   */
  getTimings() {
    const timings = {};

    for (const [name, module] of this.modules) {
      if (module.startTime && module.endTime) {
        timings[name] = {
          duration: module.endTime - module.startTime,
          initialized: this.initialized.has(name),
        };
      }
    }

    return timings;
  }

  /**
   * Debug logging
   */
  log(message, data) {
    if (this.DEBUG) {
      if (data) {
        console.log(`[InitManager] ${message}`, data);
      } else {
        console.log(`[InitManager] ${message}`);
      }
    }
  }

  /**
   * Print initialization report
   */
  printReport() {
    console.group('📊 Initialization Report');

    console.log(`Total modules: ${this.modules.size}`);
    console.log(`Initialized: ${this.initialized.size}`);
    console.log(`Errors: ${this.errors.size}`);

    if (this.errors.size > 0) {
      console.group('❌ Failed modules:');
      for (const [name, error] of this.errors) {
        console.error(`${name}:`, error.message);
      }
      console.groupEnd();
    }

    const timings = this.getTimings();
    if (Object.keys(timings).length > 0) {
      console.group('⏱️  Timings:');
      let total = 0;
      for (const [name, data] of Object.entries(timings)) {
        console.log(`${name}: ${data.duration.toFixed(2)}ms`);
        total += data.duration;
      }
      console.log(`Total: ${total.toFixed(2)}ms`);
      console.groupEnd();
    }

    console.groupEnd();
  }
}

// Export as global
if (typeof window !== 'undefined') {
  window.InitializationManager = InitializationManager;
}

// export defaultInitializationManager;
window.InitializationManager = InitializationManager;
})();
