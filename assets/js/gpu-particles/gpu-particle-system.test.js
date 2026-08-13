/**
 * GPU Particle System Tests
 * Unit and integration tests for the complete GPU particle system
 */

class GPUParticleSystemTests {
  /**
   * Run all tests
   */
  static async runAll() {
    console.group('[Tests] GPU Particle System');

    const results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    // Unit tests
    await this._testShapeLoader(results);
    await this._testGPUParticleState(results);
    await this._testGPUMorphController(results);
    await this._testGPUShapeRegistry(results);
    await this._testGPUPerformanceMonitor(results);

    // Integration tests
    await this._testSystemInitialization(results);
    await this._testMorphingPipeline(results);

    // Summary
    console.groupEnd();
    this._printSummary(results);

    return results;
  }

  /**
   * Test ShapeLoader
   * @private
   */
  static async _testShapeLoader(results) {
    console.group('[Test] ShapeLoader');

    try {
      const loader = new ShapeLoader(null);

      // Test procedural sphere generation
      const sphere = loader._generateProceduralSphere(100);
      this._assert(sphere.positions.length === 300, 'Procedural sphere has correct vertex count');
      this._assert(sphere.count === 100, 'Procedural sphere has correct count');

      results.passed++;
      results.tests.push({ name: 'ShapeLoader', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'ShapeLoader', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test GPUParticleState
   * @private
   */
  static async _testGPUParticleState(results) {
    console.group('[Test] GPUParticleState');

    try {
      const state = new GPUParticleState(100);

      // Test initialization
      this._assert(state.particleCount === 100, 'State created with correct particle count');
      this._assert(state.currentShape === 'sphere', 'Initial shape is sphere');
      this._assert(state.morphProgress === 0, 'Initial morph progress is 0');

      // Test morph progress
      state.updateMorphProgress(0.5);
      this._assert(state.morphProgress === 0.5, 'Morph progress updates correctly');

      // Test morph clamping
      state.updateMorphProgress(1.5);
      this._assert(state.morphProgress === 1.0, 'Morph progress clamped to 1.0');

      results.passed++;
      results.tests.push({ name: 'GPUParticleState', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'GPUParticleState', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test GPUMorphController
   * @private
   */
  static async _testGPUMorphController(results) {
    console.group('[Test] GPUMorphController');

    try {
      const mockSystem = { config: { particleCount: 100 } };
      const mockLoader = {
        loadShape: async () => ({ positions: new Float32Array(300), count: 100 })
      };
      const mockState = new GPUParticleState(100);
      const controller = new GPUMorphController(mockSystem, mockLoader, mockState);

      // Test controller creation
      this._assert(controller.morphQueue.length === 0, 'Morph queue starts empty');
      this._assert(!controller.isMorphing(), 'Controller not morphing initially');

      results.passed++;
      results.tests.push({ name: 'GPUMorphController', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'GPUMorphController', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test GPUShapeRegistry
   * @private
   */
  static async _testGPUShapeRegistry(results) {
    console.group('[Test] GPUShapeRegistry');

    try {
      const mockLoader = {
        loadShape: async (name) => ({ positions: new Float32Array(300), count: 100 })
      };
      const registry = new GPUShapeRegistry(mockLoader);

      // Test available shapes
      const shapes = registry.listAvailableShapes();
      this._assert(shapes.length > 0, 'Registry has available shapes');
      this._assert(shapes.some(s => s.name === 'sphere'), 'Sphere is available');

      // Test memory info
      const memInfo = registry.getMemoryInfo();
      this._assert(memInfo.available > 0, 'Memory info reports available shapes');

      results.passed++;
      results.tests.push({ name: 'GPUShapeRegistry', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'GPUShapeRegistry', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test GPUPerformanceMonitor
   * @private
   */
  static async _testGPUPerformanceMonitor(results) {
    console.group('[Test] GPUPerformanceMonitor');

    try {
      const monitor = new GPUPerformanceMonitor();

      // Test initialization
      this._assert(monitor.fps === 60, 'Initial FPS is 60');
      this._assert(monitor.frameCount === 0, 'Initial frame count is 0');

      // Simulate frames
      for (let i = 0; i < 5; i++) {
        monitor.recordFrame();
      }

      this._assert(monitor.frameCount === 5, 'Frame count increments');
      this._assert(monitor.frameTimings.length > 0, 'Frame timings recorded');

      // Test metrics
      const metrics = monitor.getMetrics();
      this._assert(metrics.fps, 'Metrics include FPS');
      this._assert(metrics.avgFrameTime, 'Metrics include average frame time');

      results.passed++;
      results.tests.push({ name: 'GPUPerformanceMonitor', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'GPUPerformanceMonitor', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test System Initialization
   * @private
   */
  static async _testSystemInitialization(results) {
    console.group('[Test] System Initialization');

    try {
      // Check if GPUParticleSystem is available
      this._assert(typeof GPUParticleSystem !== 'undefined', 'GPUParticleSystem is defined');
      this._assert(typeof ShapeLoader !== 'undefined', 'ShapeLoader is defined');
      this._assert(typeof GPUMorphController !== 'undefined', 'GPUMorphController is defined');

      results.passed++;
      results.tests.push({ name: 'System Initialization', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'System Initialization', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Test Morphing Pipeline
   * @private
   */
  static async _testMorphingPipeline(results) {
    console.group('[Test] Morphing Pipeline');

    try {
      // Create minimal morphing setup
      const state = new GPUParticleState(100);
      const mockGeometry = { positions: new Float32Array(300), count: 100 };

      state.setInitialPositions(mockGeometry);
      this._assert(state.positions.length === 300, 'Positions set correctly');

      state.setTargetShape('torus', mockGeometry);
      this._assert(state.targetShape === 'torus', 'Target shape set');
      this._assert(state.isMorphing(), 'State reports morphing active');

      // Simulate morph progress
      state.updateMorphProgress(0.5);
      this._assert(state.morphProgress === 0.5, 'Morph progress at 50%');

      // Complete morph
      state.updateMorphProgress(1.0);
      this._assert(!state.isMorphing(), 'Morph completed');
      this._assert(state.currentShape === 'torus', 'Current shape updated to target');

      results.passed++;
      results.tests.push({ name: 'Morphing Pipeline', status: 'PASS' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: 'Morphing Pipeline', status: 'FAIL', error: error.message });
      console.error(error);
    }

    console.groupEnd();
  }

  /**
   * Assert helper
   * @private
   */
  static _assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✓ ${message}`);
  }

  /**
   * Print summary
   * @private
   */
  static _printSummary(results) {
    const total = results.passed + results.failed;
    const percentage = total > 0 ? (results.passed / total * 100).toFixed(1) : 0;

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Test Summary]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Passed: ${results.passed}
❌ Failed: ${results.failed}
📊 Total:  ${total}
📈 Coverage: ${percentage}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    results.tests.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : '❌';
      const msg = test.error ? ` — ${test.error}` : '';
      console.log(`${icon} ${test.name}${msg}`);
    });
  }
}

// Export and auto-run if in test mode
if (typeof window !== 'undefined') {
  window.GPUParticleSystemTests = GPUParticleSystemTests;

  // Auto-run tests if requested via URL parameter
  if (new URLSearchParams(window.location.search).has('gpu-tests')) {
    GPUParticleSystemTests.runAll();
  }
}
