/**
 * Gradient Animation Loop — Canvas rendering + RAF loop
 * Handles 2D canvas setup, gradient drawing, and frame updates
 */

class GradientAnimationLoop {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.distortion = new GradientDistortion(config);

    this.canvas = null;
    this.ctx = null;
    this.rafId = null;
    this.startTime = null;
    this.lastFrameTime = null;
    this.running = false;
    this.resizeObserver = null;

    this.init();
  }

  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gradient-bg-canvas';
    this.container.insertBefore(this.canvas, this.container.firstChild);

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      console.error('[GradientAnimationLoop] Failed to get 2D context');
      return;
    }

    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    console.log('[GradientAnimationLoop] ✅ Initialized');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now() / 1000;
    this.tick();
    console.log('[GradientAnimationLoop] Started');
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    console.log('[GradientAnimationLoop] Paused');
  }

  stop() {
    this.pause();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    console.log('[GradientAnimationLoop] Stopped');
  }

  tick = () => {
    if (!this.running) return;

    const now = Date.now() / 1000;
    const elapsed = now - this.startTime;
    const fps = this.config.fps || 60;
    const frameTime = 1000 / fps;

    if (!this.lastFrameTime || (now - this.lastFrameTime) * 1000 >= frameTime) {
      this.draw(elapsed);
      this.lastFrameTime = now;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  draw(elapsed) {
    const { stops, angle } = this.distortion.sample(elapsed);

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Convert angle to gradient coordinates
    const rad = (angle * Math.PI) / 180;
    const diagonal = Math.sqrt(width * width + height * height);
    const x0 = width / 2 - Math.cos(rad) * (diagonal / 2);
    const y0 = height / 2 - Math.sin(rad) * (diagonal / 2);
    const x1 = width / 2 + Math.cos(rad) * (diagonal / 2);
    const y1 = height / 2 + Math.sin(rad) * (diagonal / 2);

    // Create and apply gradient
    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);

    for (const stop of stops) {
      gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
    }

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    if (elapsed < 0.1) {
      console.log(`[GradientAnimationLoop] First frame: elapsed=${elapsed.toFixed(3)}s, angle=${angle.toFixed(1)}°, stops=${stops.length}`);
    }
  }

  resize() {
    if (!this.canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();

    // Render at half linear resolution (quarter area) and let the browser
    // upscale via the CSS size below — this is a blurred linear gradient
    // with noise-perturbed stops, already soft/low-frequency by design, so
    // the upscale is imperceptible while cutting fill-rate cost
    // (width*height pixels painted every frame) to a quarter.
    const renderScale = 0.5;
    const effectiveDpr = dpr * renderScale;

    this.canvas.width = rect.width * effectiveDpr;
    this.canvas.height = rect.height * effectiveDpr;

    this.ctx.scale(effectiveDpr, effectiveDpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  dispose() {
    this.stop();
  }
}

window.GradientAnimationLoop = GradientAnimationLoop;
