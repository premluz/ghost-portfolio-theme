/**
 * Gradient Morph System — Global animated gradient layer
 * One fixed canvas that fades between section gradient configs
 * Mirrors gradient-layer.js architecture but with animation
 */

(function() {
  'use strict';

  // Create or find global gradient canvas container
  let gradientCanvas = document.getElementById('gradient-morph-canvas');
  if (!gradientCanvas) {
    gradientCanvas = document.createElement('canvas');
    gradientCanvas.id = 'gradient-morph-canvas';
    gradientCanvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -10;
      pointer-events: none;
    `;
    document.body.insertBefore(gradientCanvas, document.body.firstChild);
  }

  const defaultConfig = {
    startColor: '#0f172a',
    endColor: '#1e3a5f',
    linearGradientAngle: 135,
    distortionSpeed: 0.4,
    distortionIntensity: 0.15,
    distortionComplexity: 3,
    distortionMorphSpeed: 0.3,
    distortionSeed: 42,
    distortionSmoothness: 0.8
  };

  let loop = null;
  let currentConfig = { ...defaultConfig };
  let nextConfig = null;
  let transitionProgress = 0;
  let transitionDuration = 900; // ms
  let transitionStartTime = null;
  let sectionObserver = null;
  let currentActiveSectionId = null;
  let sections = new Map();

  class GlobalGradientLoop {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = null;
      this.distortion = null;
      this.startTime = null;
      this.rafId = null;
      this.running = false;

      this.init();
    }

    init() {
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) {
        console.error('[gradient-morph] Failed to get canvas context');
        return;
      }

      this.distortion = new GradientDistortion(currentConfig);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      console.log('[gradient-morph] ✅ Initialized');
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.startTime = Date.now() / 1000;
      this.tick();
    }

    tick = () => {
      if (!this.running) return;

      const now = Date.now() / 1000;
      const elapsed = now - this.startTime;

      // Handle gradient transition
      if (nextConfig) {
        if (!transitionStartTime) transitionStartTime = Date.now();
        const transitionElapsed = (Date.now() - transitionStartTime) / transitionDuration;
        transitionProgress = Math.min(transitionElapsed, 1);

        if (transitionProgress >= 1) {
          currentConfig = { ...nextConfig };
          nextConfig = null;
          transitionProgress = 0;
          transitionStartTime = null;
          this.distortion = new GradientDistortion(currentConfig);
        }
      }

      this.draw(elapsed);
      this.rafId = requestAnimationFrame(this.tick);
    };

    draw(elapsed) {
      const config = nextConfig ? this.interpolateConfigs(currentConfig, nextConfig, transitionProgress) : currentConfig;

      // Recreate distortion only on stable config change (not during transition interpolation)
      if (!this.distortion) {
        this.distortion = new GradientDistortion(config);
      } else if (!nextConfig && this.lastStableConfig !== currentConfig) {
        // Config settled to a new stable value after a transition
        this.distortion = new GradientDistortion(config);
        this.lastStableConfig = currentConfig;
      } else if (nextConfig) {
        // During transition: update distortion config in-place rather than recreating
        this.distortion.config = config;
      }

      const { stops, angle } = this.distortion.sample(elapsed);

      const width = this.canvas.width;
      const height = this.canvas.height;

      // Radial gradient from center
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.sqrt(width * width + height * height) / 2;

      const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

      for (const stop of stops) {
        gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
      }

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);
    }

    interpolateConfigs(configA, configB, t) {
      return {
        startColor: configA.startColor, // Keep start color of current
        endColor: configB.endColor,     // Transition to next end color
        linearGradientAngle: configA.linearGradientAngle + (configB.linearGradientAngle - configA.linearGradientAngle) * t,
        distortionSpeed: configA.distortionSpeed + (configB.distortionSpeed - configA.distortionSpeed) * t,
        distortionIntensity: configA.distortionIntensity + (configB.distortionIntensity - configA.distortionIntensity) * t,
        distortionComplexity: Math.round(configA.distortionComplexity + (configB.distortionComplexity - configA.distortionComplexity) * t),
        distortionMorphSpeed: configA.distortionMorphSpeed + (configB.distortionMorphSpeed - configA.distortionMorphSpeed) * t,
        distortionSeed: configA.distortionSeed,
        distortionSmoothness: configA.distortionSmoothness + (configB.distortionSmoothness - configA.distortionSmoothness) * t
      };
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.ctx.scale(dpr, dpr);
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
    }
  }

  function initGradientMorphSystem() {
    loop = new GlobalGradientLoop(gradientCanvas);
    loop.start();

    // Find all sections with gradient configs
    document.querySelectorAll('[data-gradient-config]').forEach(section => {
      const id = section.dataset.gradientConfig;
      const config = parseGradientConfig(section);
      sections.set(id, { element: section, config });
    });

    console.log(`[gradient-morph] Found ${sections.size} sections with gradient configs`);

    if (sections.size === 0) return;

    // Observer to detect which section is most visible
    sectionObserver = new IntersectionObserver((entries) => {
      let bestSection = null;
      let maxRatio = 0;

      entries.forEach(entry => {
        if (entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          bestSection = entry.target.dataset.gradientConfig;
        }
      });

      if (bestSection && bestSection !== currentActiveSectionId && maxRatio > 0.1) {
        currentActiveSectionId = bestSection;
        const newConfig = sections.get(bestSection).config;
        transitionToConfig(newConfig);
        console.log(`[gradient-morph] Transitioning to: ${bestSection}`);
      }
    }, { threshold: [0.1, 0.2, 0.3, 0.4, 0.5] });

    sections.forEach(({ element }) => {
      sectionObserver.observe(element);
    });

    // Initialize with first section
    if (sections.size > 0) {
      const firstSection = Array.from(sections.values())[0];
      transitionToConfig(firstSection.config);
    }
  }

  function parseGradientConfig(element) {
    const config = { ...defaultConfig };

    const attrs = {
      startColor: 'data-gradient-start-color',
      endColor: 'data-gradient-end-color',
      linearGradientAngle: 'data-gradient-angle',
      distortionSpeed: 'data-gradient-distortion-speed',
      distortionIntensity: 'data-gradient-distortion-intensity',
      distortionComplexity: 'data-gradient-distortion-complexity',
      distortionMorphSpeed: 'data-gradient-morph-speed',
      distortionSeed: 'data-gradient-seed',
      distortionSmoothness: 'data-gradient-smoothness'
    };

    Object.entries(attrs).forEach(([key, attr]) => {
      const val = element.getAttribute(attr);
      if (val !== null) {
        if (key.includes('Color')) {
          config[key] = val;
        } else if (key === 'distortionComplexity' || key === 'distortionSeed') {
          config[key] = parseInt(val);
        } else {
          config[key] = parseFloat(val);
        }
      }
    });

    return config;
  }

  function transitionToConfig(newConfig) {
    nextConfig = newConfig;
  }

  // Wait for GradientDistortion to be available
  function waitForDistortion() {
    if (typeof GradientDistortion !== 'undefined') {
      initGradientMorphSystem();
    } else {
      setTimeout(waitForDistortion, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDistortion);
  } else {
    waitForDistortion();
  }

  window.GradientMorphSystem = { sections, currentConfig, transitionToConfig };
})();
