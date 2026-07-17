/**
 * GPU Scroll Driver
 * Bind scroll position to particle morph transitions
 */

class GPUScrollDriver {
  constructor(system, morphController) {
    this.system = system;
    this.morphController = morphController;

    // Scroll sections
    this.sections = [];
    this.activeSectionIdx = -1;

    // Scroll state
    this.isEnabled = false;
    this.lastScrollY = 0;

    console.log('[GPUScrollDriver] Created');
  }

  /**
   * Register a scroll-bound morph section
   * @param {HTMLElement} element - Section element to watch
   * @param {Object} config - { target: shapeName, duration: ms, easing?: 'linear'|'ease' }
   */
  registerScrollSection(element, config) {
    if (!element || !config.target) {
      console.warn('[GPUScrollDriver] Invalid section config');
      return;
    }

    const section = {
      element,
      target: config.target,
      duration: config.duration || 1.5,
      easing: config.easing || 'ease',
      triggered: false,
      scrollTrigger: null
    };

    this.sections.push(section);

    // Create ScrollTrigger for section visibility
    if (typeof ScrollTrigger !== 'undefined') {
      section.scrollTrigger = ScrollTrigger.create({
        trigger: element,
        start: 'top 80%',
        end: 'top 20%',
        onEnter: () => this._onSectionEnter(section),
        onLeave: () => this._onSectionLeave(section)
      });
    }

    console.log(`[GPUScrollDriver] Registered section: ${config.target}`);
  }

  /**
   * Section enters viewport
   * @private
   */
  _onSectionEnter(section) {
    console.log(`[GPUScrollDriver] Section entered: ${section.target}`);
    this.activeSectionIdx = this.sections.indexOf(section);
    section.triggered = true;

    // Trigger morph to target shape
    this.morphController.requestMorph(section.target, section.duration);
  }

  /**
   * Section leaves viewport
   * @private
   */
  _onSectionLeave(section) {
    console.log(`[GPUScrollDriver] Section left: ${section.target}`);
    if (this.sections.indexOf(section) === this.activeSectionIdx) {
      this.activeSectionIdx = -1;
    }
  }

  /**
   * Enable scroll-driven morphing
   */
  enable() {
    if (this.isEnabled) return;

    this.isEnabled = true;
    window.addEventListener('scroll', this._onScroll.bind(this), { passive: true });

    console.log('[GPUScrollDriver] ✅ Enabled');
  }

  /**
   * Disable scroll-driven morphing
   */
  disable() {
    this.isEnabled = false;
    window.removeEventListener('scroll', this._onScroll.bind(this));

    console.log('[GPUScrollDriver] Disabled');
  }

  /**
   * Handle scroll event
   * @private
   */
  _onScroll() {
    if (!this.isEnabled) return;

    this.lastScrollY = window.scrollY;

    // Scroll-to-morph progress integration can happen here
    // For now, we use ScrollTrigger to handle visibility
  }

  /**
   * Get active section info
   */
  getActiveSectionInfo() {
    if (this.activeSectionIdx < 0) return null;

    const section = this.sections[this.activeSectionIdx];
    return {
      target: section.target,
      duration: section.duration,
      triggered: section.triggered
    };
  }

  /**
   * Destroy scroll driver and clean up
   */
  destroy() {
    this.sections.forEach(section => {
      if (section.scrollTrigger) {
        section.scrollTrigger.kill();
      }
    });

    this.disable();
    console.log('[GPUScrollDriver] Destroyed');
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GPUScrollDriver = GPUScrollDriver;
}
