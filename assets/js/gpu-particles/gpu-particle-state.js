/**
 * GPU Particle State
 * Tracks particle positions, rotations, and morph state
 */

class GPUParticleState {
  constructor(particleCount) {
    this.particleCount = particleCount;

    // Shape state
    this.currentShape = 'helix';  // Matches initial shape loaded in gpu-particle-system.js
    this.targetShape = null;
    this.morphProgress = 0; // 0-1, tracks blend progress

    // Position buffers (CPU-side for reference)
    this.positions = new Float32Array(particleCount * 3);
    this.targetPositions = new Float32Array(particleCount * 3);
    this.rotations = new Float32Array(particleCount * 4);

    // GPU buffers (created during engine init)
    this.positionBuffer = null;
    this.targetPositionBuffer = null;
    this.rotationBuffer = null;

    // Initialize rotations to identity quaternions
    for (let i = 0; i < particleCount; i++) {
      this.rotations[i * 4 + 3] = 1.0; // w = 1 (identity)
    }

    console.log(`[GPUParticleState] Created for ${particleCount} particles`);
  }

  /**
   * Set initial particle positions (before any morph)
   */
  setInitialPositions(geometry) {
    if (!geometry || !geometry.positions) {
      throw new Error('Invalid geometry for initial positions');
    }

    const posCount = Math.min(geometry.positions.length, this.positions.length);
    this.positions.set(geometry.positions.subarray(0, posCount));

    console.log(`[GPUParticleState] Set initial positions from ${geometry.count} vertices`);
  }

  /**
   * Set target shape for morphing
   */
  setTargetShape(shapeName, geometry) {
    if (!geometry || !geometry.positions) {
      throw new Error(`Invalid geometry for target shape: ${shapeName}`);
    }

    this.targetShape = shapeName;

    // Copy target positions. If the source shape has fewer vertices than
    // particleCount (e.g. small GLB meshes), tile it so every particle gets
    // a valid target — otherwise the tail keeps the previous shape's data.
    const src = geometry.positions;
    const dst = this.targetPositions;
    if (src.length >= dst.length) {
      dst.set(src.subarray(0, dst.length));
    } else {
      for (let i = 0; i < dst.length; i += 3) {
        const j = i % src.length;
        dst[i + 0] = src[j + 0];
        dst[i + 1] = src[j + 1];
        dst[i + 2] = src[j + 2];
      }
    }

    // Reset morph progress to start fresh
    this.morphProgress = 0;

    console.log(`[GPUParticleState] Set target shape: ${shapeName}`);
  }

  /**
   * Update morph progress (0-1)
   * When progress reaches 1.0, complete the morph
   */
  updateMorphProgress(progress) {
    // Clamp to 0-1
    this.morphProgress = Math.max(0, Math.min(1, progress));

    // When morph completes
    if (this.morphProgress >= 1.0) {
      this._completeMorph();
    }
  }

  /**
   * Complete the morph (swap current/target)
   * @private
   */
  _completeMorph() {
    if (!this.targetShape) return;

    // Current shape becomes the target shape
    this.currentShape = this.targetShape;
    this.targetShape = null;
    // Don't reset morphProgress here — keep it at 1.0 so the final GPU dispatch
    // runs with progress=1.0, ensuring particles reach their final positions.
    // The next morph's setTargetShape() will reset it when needed.

    // Swap position buffers: target becomes current
    const temp = this.positions;
    this.positions = this.targetPositions;
    this.targetPositions = temp;

    console.log(`[GPUParticleState] Morph completed: now at ${this.currentShape}`);
  }

  /**
   * Check if currently morphing
   */
  isMorphing() {
    return this.targetShape !== null && this.morphProgress < 1.0;
  }

  /**
   * Set GPU buffer references
   * Called after GPU buffers are created
   */
  setGPUBuffers(positionBuffer, targetPositionBuffer, rotationBuffer) {
    this.positionBuffer = positionBuffer;
    this.targetPositionBuffer = targetPositionBuffer;
    this.rotationBuffer = rotationBuffer;

    console.log('[GPUParticleState] GPU buffers linked');
  }

  /**
   * Get state info for debugging
   */
  getInfo() {
    return {
      particleCount: this.particleCount,
      currentShape: this.currentShape,
      targetShape: this.targetShape,
      morphProgress: this.morphProgress,
      isMorphing: this.isMorphing()
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUParticleState = GPUParticleState;
}
