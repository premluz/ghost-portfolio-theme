/**
 * Fade Controller - Manages container opacity transitions
 */

class FadeController {
  constructor(element) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    this.currentOpacity = 0;
    this.targetOpacity = 0;
    this.duration = 0;
    this.startTime = null;
    this.easing = this.easeInOutCubic;
  }

  fadeIn(duration = 1500) {
    this.animate(1, duration);
  }

  fadeOut(duration = 1500) {
    this.animate(0, duration);
  }

  setOpacity(target, duration = 0) {
    this.animate(target, duration);
  }

  animate(target, duration) {
    this.targetOpacity = target;
    this.duration = duration;
    this.startTime = Date.now();

    if (duration === 0) {
      this.currentOpacity = target;
      this.element.style.opacity = target.toString();
    } else {
      this.updateFrame();
    }
  }

  updateFrame() {
    if (!this.startTime) return;

    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(1, elapsed / this.duration);
    const eased = this.easing(progress);

    this.currentOpacity = this.currentOpacity + (this.targetOpacity - this.currentOpacity) * eased;
    this.element.style.opacity = Math.max(0, Math.min(1, this.currentOpacity)).toString();

    if (progress < 1) {
      requestAnimationFrame(() => this.updateFrame());
    }
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.FadeController = FadeController;
}
