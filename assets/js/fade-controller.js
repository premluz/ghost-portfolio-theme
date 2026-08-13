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
    // Sync from the element's actual current opacity before starting a new
    // interpolation. this.currentOpacity is otherwise just an internal
    // tracker that only ever gets updated by this class's OWN previous
    // writes (starts at 0 from the constructor) — if the element's real
    // opacity is different (its CSS/HTML default, or something else set it
    // directly), the first animation frame below would snap the element to
    // the stale tracked value before continuing toward target, instead of
    // starting from wherever it visually already is. Confirmed cause of
    // "particles abruptly disappear, then fade back in" on the very first
    // fadeIn() call of a page load — the element defaulted to opacity 1
    // (untouched), this.currentOpacity was still its constructor default
    // of 0, so the first frame here forced a visible snap to 0.
    const computed = parseFloat(getComputedStyle(this.element).opacity);
    if (!Number.isNaN(computed)) this.currentOpacity = computed;

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
