/**
 * GPU Performance Monitor
 * Track FPS, frame time, and GPU metrics
 */

class GPUPerformanceMonitor {
  constructor() {
    // Frame timing
    this.frameCount = 0;
    this.frameTimings = []; // Last 60 frame times
    this.lastFrameTime = performance.now();
    this.fps = 60;
    this.avgFrameTime = 0;

    // Stats tracking
    this.minFPS = 60;
    this.maxFPS = 60;
    this.droppedFrames = 0; // Frames < 30fps

    // GPU metrics (if available)
    this.gpuTime = null;
    this.computeTime = 0;
    this.renderTime = 0;

    // Config
    this.enabled = true;
    this.maxSamples = 60;

    console.log('[GPUPerformanceMonitor] Created');
  }

  /**
   * Record frame timing
   */
  recordFrame() {
    if (!this.enabled) return;

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Track frame times
    this.frameTimings.push(frameTime);
    if (this.frameTimings.length > this.maxSamples) {
      this.frameTimings.shift();
    }

    // Calculate metrics
    this._updateMetrics();

    this.frameCount++;
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics() {
    if (this.frameTimings.length === 0) return;

    // Average frame time
    const sum = this.frameTimings.reduce((a, b) => a + b, 0);
    this.avgFrameTime = sum / this.frameTimings.length;

    // Calculate FPS
    this.fps = 1000 / this.avgFrameTime;

    // Track min/max
    this.minFPS = Math.min(this.minFPS, this.fps);
    this.maxFPS = Math.max(this.maxFPS, this.fps);

    // Count dropped frames (below 30fps threshold)
    const droppedCount = this.frameTimings.filter(t => t > 33.33).length;
    this.droppedFrames = droppedCount;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      fps: this.fps.toFixed(1),
      avgFrameTime: this.avgFrameTime.toFixed(2) + 'ms',
      minFPS: this.minFPS.toFixed(1),
      maxFPS: this.maxFPS.toFixed(1),
      droppedFrames: this.droppedFrames,
      frameCount: this.frameCount,
      samples: this.frameTimings.length
    };
  }

  /**
   * Get performance status ('good', 'ok', 'poor')
   */
  getStatus() {
    if (this.fps >= 55) return 'good';
    if (this.fps >= 30) return 'ok';
    return 'poor';
  }

  /**
   * Log metrics to console
   */
  logMetrics() {
    const metrics = this.getMetrics();
    const status = this.getStatus();
    console.log(
      `[GPUPerformanceMonitor] Status: ${status} | FPS: ${metrics.fps} | ` +
      `Avg: ${metrics.avgFrameTime} | Dropped: ${metrics.droppedFrames}/${metrics.samples}`
    );
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.lastFrameTime = performance.now();
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.frameTimings = [];
    this.frameCount = 0;
    this.minFPS = 60;
    this.maxFPS = 60;
    this.droppedFrames = 0;
    this.lastFrameTime = performance.now();
  }

  /**
   * Start periodic logging
   */
  startPeriodicLogging(intervalMs = 1000) {
    this.loggingInterval = setInterval(() => this.logMetrics(), intervalMs);
    return this.loggingInterval;
  }

  /**
   * Stop periodic logging
   */
  stopPeriodicLogging() {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval);
      this.loggingInterval = null;
    }
  }

  /**
   * Destroy monitor
   */
  destroy() {
    this.stopPeriodicLogging();
    console.log('[GPUPerformanceMonitor] Destroyed');
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUPerformanceMonitor = GPUPerformanceMonitor;
}
