/**
 * GPU Compute Engine
 * Manages compute shader dispatch, particle buffer allocation and updates
 */

class GPUComputeEngine {
  constructor(device, particleCount = 2000) {
    this.device = device;
    this.particleCount = particleCount;

    // Shader and pipeline
    this.computeShader = null;
    this.computePipeline = null;
    this.bindGroup = null;

    // Particle buffers (GPU-side)
    this.positionBuffer = null;
    this.rotationBuffer = null;
    this.velocityBuffer = null;
    this.targetPositionBuffer = null;

    // Uniform buffer
    this.uniformBuffer = null;

    // State
    this.lastDispatchTime = 0;
  }

  /**
   * Initialize compute engine: compile shader, create pipeline, allocate buffers
   * @param {GPUShaderModule} computeShaderModule - Compiled compute shader
   * @returns {Promise<void>}
   */
  async init(computeShaderModule) {
    console.log('[GPUComputeEngine] Initializing with', this.particleCount, 'particles...');

    this.computeShader = computeShaderModule;

    // 1. Allocate particle buffers
    this._allocateBuffers();

    // 2. Create uniform buffer for morph progress, time, etc.
    this._createUniformBuffer();

    // 3. Create compute pipeline
    this._createComputePipeline();

    console.log('[GPUComputeEngine] ✅ Initialized');
  }

  /**
   * Allocate GPU buffers for particle data
   * @private
   */
  _allocateBuffers() {
    // WGSL array<vec3f> has a 16-byte element stride (vec3 aligns to 16),
    // so every vec3 buffer must be allocated at 4 floats per particle.
    const positionSize = this.particleCount * 4 * 4;
    const rotationSize = this.particleCount * 4 * 4; // vec4f (quaternion) × float32
    const velocitySize = this.particleCount * 4 * 4;

    // Position buffer (read-write for compute, read for render)
    this.positionBuffer = this.device.createBuffer({
      size: positionSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
      label: 'Particle Position Buffer'
    });

    // Initialize positions to zero
    new Float32Array(this.positionBuffer.getMappedRange()).fill(0);
    this.positionBuffer.unmap();

    // Rotation buffer (quaternions)
    this.rotationBuffer = this.device.createBuffer({
      size: rotationSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
      label: 'Particle Rotation Buffer'
    });

    // Initialize to identity quaternion (0, 0, 0, 1)
    const rotData = new Float32Array(this.rotationBuffer.getMappedRange());
    for (let i = 0; i < this.particleCount; i++) {
      rotData[i * 4 + 0] = 0;
      rotData[i * 4 + 1] = 0;
      rotData[i * 4 + 2] = 0;
      rotData[i * 4 + 3] = 1;
    }
    this.rotationBuffer.unmap();

    // Velocity buffer
    this.velocityBuffer = this.device.createBuffer({
      size: velocitySize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
      label: 'Particle Velocity Buffer'
    });

    new Float32Array(this.velocityBuffer.getMappedRange()).fill(0);
    this.velocityBuffer.unmap();

    // Target position buffer (for morphing)
    this.targetPositionBuffer = this.device.createBuffer({
      size: positionSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Target Position Buffer'
    });

    console.log('[GPUComputeEngine] ✅ Buffers allocated');
  }

  /**
   * Create uniform buffer for compute shader parameters
   * @private
   */
  _createUniformBuffer() {
    this.uniformBuffer = this.device.createBuffer({
      size: 16, // 4 × float32 (morphProgress, morphTarget, time, particleCount)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
      label: 'Compute Uniform Buffer'
    });

    // Initialize (morphTarget and particleCount are u32 in the shader,
    // so they must be written as integers, not float bits)
    const mapped = this.uniformBuffer.getMappedRange();
    const f32 = new Float32Array(mapped);
    const u32 = new Uint32Array(mapped);
    f32[0] = 0.0;  // morphProgress
    u32[1] = 0;    // morphTarget
    f32[2] = 0.0;  // time
    u32[3] = this.particleCount;  // particleCount
    this.uniformBuffer.unmap();
  }

  /**
   * Create compute pipeline and bind group
   * @private
   */
  _createComputePipeline() {
    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        // Position buffer (storage, read-write)
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        },
        // Rotation buffer (storage, read-write)
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        },
        // Target position buffer (storage, read-only)
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' }
        },
        // Velocity buffer (storage, read-write)
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        }
      ]
    });

    const uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' }
        }
      ]
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, uniformBindGroupLayout]
    });

    // Create compute pipeline
    this.computePipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: this.computeShader, entryPoint: 'main' }
    });

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.rotationBuffer } },
        { binding: 2, resource: { buffer: this.targetPositionBuffer } },
        { binding: 3, resource: { buffer: this.velocityBuffer } }
      ]
    });

    this.uniformBindGroup = this.device.createBindGroup({
      layout: uniformBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } }
      ]
    });

    console.log('[GPUComputeEngine] ✅ Compute pipeline created');
  }

  /**
   * Dispatch compute shader to update particles
   * @param {number} deltaTime - Time since last frame (seconds)
   * @param {Object} uniforms - { morphProgress, morphTarget, time }
   */
  dispatch(deltaTime, uniforms = {}) {
    // Update uniform buffer
    this._updateUniforms(uniforms);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Compute dispatch encoder'
    });

    // Begin compute pass
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.bindGroup);
    computePass.setBindGroup(1, this.uniformBindGroup);

    // Dispatch work groups (64 threads per group, particleCount / 64 groups)
    const workgroups = Math.ceil(this.particleCount / 64);
    computePass.dispatchWorkgroups(workgroups);
    computePass.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);

    this.lastDispatchTime = performance.now();
  }

  /**
   * Update uniform buffer with current frame data
   * @private
   */
  _updateUniforms(uniforms) {
    const buffer = new ArrayBuffer(16);
    const f32 = new Float32Array(buffer);
    const u32 = new Uint32Array(buffer);
    f32[0] = uniforms.morphProgress ?? 0.0;
    u32[1] = uniforms.morphTarget ?? 0;
    f32[2] = uniforms.time ?? performance.now() / 1000;
    u32[3] = this.particleCount;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, buffer);
  }

  /**
   * Update target position buffer (for morphing)
   * @param {Float32Array} targetPositions - Array of target positions (particleCount × 3)
   */
  updateTargetPositions(targetPositions) {
    if (targetPositions.length !== this.particleCount * 3) {
      console.error(
        `[GPUComputeEngine] Invalid target positions array size. Expected ${this.particleCount * 3}, got ${targetPositions.length}`
      );
      return;
    }

    // Repack tightly-packed xyz (12-byte stride) into the 16-byte stride
    // WGSL expects for array<vec3f>. Scratch array is reused across frames.
    if (!this._paddedTargets) {
      this._paddedTargets = new Float32Array(this.particleCount * 4);
    }
    const padded = this._paddedTargets;
    for (let i = 0; i < this.particleCount; i++) {
      padded[i * 4 + 0] = targetPositions[i * 3 + 0];
      padded[i * 4 + 1] = targetPositions[i * 3 + 1];
      padded[i * 4 + 2] = targetPositions[i * 3 + 2];
    }

    this.device.queue.writeBuffer(this.targetPositionBuffer, 0, padded);
  }

  /**
   * Get all particle buffers (for renderer)
   * @returns {Object} { positionBuffer, rotationBuffer, velocityBuffer }
   */
  getBuffers() {
    return {
      positionBuffer: this.positionBuffer,
      rotationBuffer: this.rotationBuffer,
      velocityBuffer: this.velocityBuffer,
      targetPositionBuffer: this.targetPositionBuffer
    };
  }

  /**
   * Destroy compute engine and free resources
   */
  destroy() {
    this.positionBuffer?.destroy();
    this.rotationBuffer?.destroy();
    this.velocityBuffer?.destroy();
    this.targetPositionBuffer?.destroy();
    this.uniformBuffer?.destroy();
    console.log('[GPUComputeEngine] Destroyed');
  }
}

if (typeof window !== 'undefined') {
  window.GPUComputeEngine = GPUComputeEngine;
}
