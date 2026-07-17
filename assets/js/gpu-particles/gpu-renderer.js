/**
 * GPU Renderer
 * Renders particle geometry to canvas using WebGPU instancing
 */

class GPURenderer {
  constructor(device, canvas, particleCount = 2000) {
    this.device = device;
    this.canvas = canvas;
    this.particleCount = particleCount;

    // WebGPU context
    this.context = null;
    this.canvasFormat = null;

    // Render pipeline
    this.renderPipeline = null;

    // Point sprite data
    this.particleSize = 8.0;  // Screen-space size in pixels

    // Bind groups
    this.bindGroup = null;

    // Timing
    this.startTime = performance.now();
  }

  /**
   * Initialize renderer: configure canvas, compile shaders, create pipeline
   * @param {GPUShaderModule} vertexShaderModule - Compiled vertex shader
   * @param {GPUShaderModule} fragmentShaderModule - Compiled fragment shader
   * @param {GPUBuffer} positionBuffer - Particle position buffer from compute engine
   * @param {GPUBuffer} rotationBuffer - Particle rotation buffer from compute engine
   * @returns {Promise<void>}
   */
  async init(vertexShaderModule, fragmentShaderModule, positionBuffer, rotationBuffer) {
    console.log('[GPURenderer] Initializing renderer...');

    // 1. Configure canvas context
    this._configureCanvas();

    // 2. Create render pipeline (point sprites, no mesh needed)
    this._createRenderPipeline(vertexShaderModule, fragmentShaderModule, positionBuffer, rotationBuffer);

    console.log('[GPURenderer] ✅ Renderer initialized (point sprites)');
  }

  /**
   * Configure WebGPU canvas context
   * @private
   */
  _configureCanvas() {
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('[GPURenderer] Failed to get WebGPU context');
    }

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.canvasFormat
    });

    // Set canvas size at device resolution (CSS-pixel canvases render blurry
    // on retina displays and soften the particle dots)
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);

    console.log('[GPURenderer] ✅ Canvas configured:', this.canvas.width, '×', this.canvas.height);
  }


  /**
   * Create render pipeline
   * @private
   */
  _createRenderPipeline(vertexShaderModule, fragmentShaderModule, positionBuffer, rotationBuffer) {
    // Create uniform buffer for camera data (view-projection matrix + time)
    // Layout: mat4x4 (64 bytes) + f32 time (4 bytes) + 12 bytes padding = 80 bytes
    this.cameraUniformBuffer = this.device.createBuffer({
      size: 80,  // 4x4 matrix (64) + time (4) + padding (12)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false
    });

    // Create bind group layout for particle data + uniforms
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        // Camera uniform (view-projection matrix + time)
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' }
        },
        // Position buffer (storage)
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' }
        },
        // Rotation buffer (storage)
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' }
        }
      ]
    });

    // Create pipeline layout
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    // Create render pipeline (point sprite mode)
    this.renderPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertexShaderModule,
        entryPoint: 'main',
        buffers: [] // No vertex buffers - using point sprites with instance index
      },
      fragment: {
        module: fragmentShaderModule,
        entryPoint: 'main',
        targets: [{
          format: this.canvasFormat,
          // Additive blending for bloom glow effect
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list', // Quads = 2 triangles per particle
        frontFace: 'ccw',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,  // Don't write depth (particles should not occlude each other)
        depthCompare: 'always'     // Always render, no depth test
      }
    });

    // Create bind group with uniforms + particle buffers
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: positionBuffer } },
        { binding: 2, resource: { buffer: rotationBuffer } }
      ]
    });

    console.log('[GPURenderer] ✅ Render pipeline created');
  }

  /**
   * Render frame
   */
  render() {
    // Compute and update camera matrix + time
    const elapsed = performance.now() - this.startTime;

    // Orthographic projection for WebGPU conventions: clip z in [0, 1], w = 1.
    // World x in [-2·aspect, 2·aspect] → [-1, 1], y in [-2, 2] → [-1, 1],
    // z in [-5, 5] → [1, 0] (depth test is off; the z window is deliberately
    // deeper than any shape so rotating particles are never culled mid-screen
    // — the dispersed cloud reaches radius 4).
    const aspect = this.canvas.width / this.canvas.height;

    const cameraData = new Float32Array(20);  // 16 (mat4x4, column-major) + 1 (time) + 3 (padding)
    cameraData[0] = 1 / (2 * aspect);  // col 0: x scale
    cameraData[5] = 0.5;               // col 1: y scale
    cameraData[10] = -0.1;             // col 2: z scale
    cameraData[14] = 0.5;              // col 3: z offset
    cameraData[15] = 1;                // col 3: w
    cameraData[16] = elapsed;
    cameraData[17] = this.canvas.height;  // for min-pixel-size clamp in shader
    this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, cameraData);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Render pass encoder'
    });

    // Create render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },  // Dark navy for additive bloom
          loadOp: 'clear',
          storeOp: 'store'
        }
      ],
      depthStencilAttachment: {
        view: this._getDepthTexture().createView(),
        depthLoadOp: 'clear',
        depthClearValue: 1.0,
        depthStoreOp: 'store'
      }
    });

    // Render billboards (quads)
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.bindGroup);

    // Draw: 6 vertices per particle (2 triangles = full quad) with
    // particleCount instances. triangle-list consumes 3 vertices per
    // triangle — drawing only 4 renders half the quad (diagonal-cut dots).
    renderPass.draw(6, this.particleCount);

    renderPass.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Get or create depth texture
   * @private
   */
  _getDepthTexture() {
    if (!this._depthTexture) {
      this._depthTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
    }
    return this._depthTexture;
  }

  /**
   * Multiply two 4x4 matrices (row-major)
   * @private
   */
  _multiplyMatrices4x4(a, b) {
    const result = new Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 0;
        for (let k = 0; k < 4; k++) {
          result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
        }
      }
    }
    return result;
  }

  /**
   * Handle canvas resize
   */
  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(this.canvas.clientWidth * dpr);
    const height = Math.round(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this._depthTexture) {
        this._depthTexture.destroy();
        this._depthTexture = null;
      }
      console.log('[GPURenderer] Canvas resized to', width, '×', height);
    }
  }

  /**
   * Destroy renderer and free resources
   */
  destroy() {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this._depthTexture?.destroy();
    console.log('[GPURenderer] Destroyed');
  }
}

if (typeof window !== 'undefined') {
  window.GPURenderer = GPURenderer;
}
