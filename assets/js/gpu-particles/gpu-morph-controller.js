/**
 * GPU Morph Controller
 * Drive shape transitions and scroll binding for GPU particles
 */

class GPUMorphController {
  constructor(system, shapeLoader, state) {
    this.system = system;           // GPUParticleSystem
    this.shapeLoader = shapeLoader; // ShapeLoader instance
    this.state = state;             // GPUParticleState

    // Morph queue and state
    this.morphQueue = [];           // Array of pending morphs
    this.currentMorph = null;       // Current active morph
    this.morphStartTime = null;

    // Scroll binding
    this.scrollMode = false;        // If true, scroll controls morph progress
    this.scrollTarget = null;       // Shape to morph to when scroll binding active
  }

  /**
   * Request a morph to target shape
   * @param {string} targetShapeName - Target shape name (e.g., 'torus', 'diamond')
   * @param {number} duration - Morph duration in seconds
   */
  async requestMorph(targetShapeName, duration = 1.0) {
    // Skip if already at (or already heading to) this shape
    if (this.currentMorph) {
      if (this.currentMorph.targetShape === targetShapeName) return;
    } else if (targetShapeName === this.state.currentShape) {
      console.log(`[GPUMorphController] Already at shape: ${targetShapeName}`);
      return;
    }

    // Skip if queued morphs already have this target
    if (this.morphQueue.length > 0) {
      const lastQueued = this.morphQueue[this.morphQueue.length - 1];
      if (lastQueued.targetShape === targetShapeName) {
        console.log(`[GPUMorphController] Already queued: ${targetShapeName}`);
        return;
      }
    }

    // Stale-load guard: if a newer request arrives while this shape is
    // still loading, abandon this one when the load finishes.
    this._morphSeq = (this._morphSeq || 0) + 1;
    const seq = this._morphSeq;

    try {
      // Load target shape geometry
      const geometry = await this.shapeLoader.loadShape(
        targetShapeName,
        this.system.config.particleCount
      );

      if (!geometry) {
        throw new Error(`Failed to load shape: ${targetShapeName}`);
      }

      if (seq !== this._morphSeq) return; // superseded by a newer request

      // Newest request wins: replace any queued/active morph so triggers
      // interrupt each other like the old GSAP-based system, instead of
      // serializing into a long queue (which made brief shapes invisible).
      this.morphQueue = [{
        targetShape: targetShapeName,
        geometry,
        duration,
        startTime: null, // Set when actually starts
        queued: true
      }];

      console.log(`%c→ ${targetShapeName}`, 'color: #ffff00; font-weight: bold; font-size: 14px;');

      this._startNextMorph();
    } catch (error) {
      console.error(`[GPUMorphController] Morph failed:`, error);
    }
  }

  /**
   * Start the next queued morph
   * @private
   */
  _startNextMorph() {
    if (this.morphQueue.length === 0) {
      this.currentMorph = null;
      return;
    }

    this.currentMorph = this.morphQueue.shift();
    this.currentMorph.startTime = Date.now();
    this.currentMorph.queued = false;

    // Set target position buffer
    this.state.setTargetShape(this.currentMorph.targetShape, this.currentMorph.geometry);

    // Copy target positions to GPU buffer for compute shader
    this.system.computeEngine.updateTargetPositions(this.state.targetPositions);

    console.log(`%c◆ ${this.currentMorph.targetShape}`, 'color: #00ff00; font-weight: bold; font-size: 14px;');
  }

  /**
   * Update morph progress (time-based)
   * Called every frame from render loop
   */
  update(deltaTime) {
    if (!this.currentMorph) return;

    // Calculate elapsed time
    const elapsed = (Date.now() - this.currentMorph.startTime) / 1000; // Convert to seconds
    let progress = elapsed / this.currentMorph.duration;

    if (progress >= 1.0) {
      // Morph complete
      progress = 1.0;
      this.state.updateMorphProgress(progress);

      console.log(`[GPUMorphController] Completed: now at ${this.state.currentShape}`);

      // Start next morph if queued
      this._startNextMorph();
    } else {
      // Morph in progress
      this.state.updateMorphProgress(progress);
    }
  }

  /**
   * Bind morph to scroll progress
   * When active, scroll position (0-1) directly controls morph progress
   */
  onScroll(scrollProgress) {
    // scrollProgress: 0-1 within a pinned section
    if (!this.currentMorph || !this.scrollMode) return;

    // Clamp to 0-1
    const clamped = Math.max(0, Math.min(1, scrollProgress));
    this.state.updateMorphProgress(clamped);
  }

  /**
   * Enable scroll-driven morph
   */
  enableScrollMode(targetShape, duration = 1.0) {
    this.scrollMode = true;
    this.scrollTarget = targetShape;
    this.requestMorph(targetShape, duration);
  }

  /**
   * Disable scroll-driven morph
   */
  disableScrollMode() {
    this.scrollMode = false;
    this.scrollTarget = null;
  }

  /**
   * Check if currently morphing
   */
  isMorphing() {
    return this.state.isMorphing();
  }

  /**
   * Get current morph progress (0-1)
   */
  getMorphProgress() {
    return this.state.morphProgress;
  }

  /**
   * Get morph queue info
   */
  getQueueInfo() {
    return {
      currentShape: this.state.currentShape,
      targetShape: this.state.targetShape,
      morphProgress: this.state.morphProgress,
      queued: this.morphQueue.length,
      isMorphing: this.isMorphing()
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUMorphController = GPUMorphController;
}
