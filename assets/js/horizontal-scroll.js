/**
 * HorizontalScroll — reusable auto-scrolling horizontal card row
 *
 * Not specific to any one section: point it at a container with a
 * [data-scroll-track] child and it works. No UI is rendered or assumed —
 * every knob is a plain constructor option / data-scroll-* attribute set
 * by whoever authors the markup, never a visitor-facing control.
 *
 * Behavior: scrolls itself continuously (bouncing at both ends), pauses
 * the moment a user grabs it, follows the drag/swipe 1:1, releases into
 * momentum, then resumes autoplay after a short idle delay. Respects
 * prefers-reduced-motion (autoplay only — drag/swipe still work).
 *
 * Config (constructor options override data-scroll-* attributes on the
 * track element, which override the defaults below):
 *   speed          px/frame during autoplay                  (default 1)
 *   autoplay       false disables autoplay, drag/swipe only   (default true)
 *   direction      1 (toward end) or -1 (toward start)        (default 1)
 *   resumeDelay    ms of idle time before autoplay resumes    (default 1500)
 *   dragSpeedFactor  momentum multiplier applied to release velocity (default 2)
 *
 * Usage:
 *   new HorizontalScroll(sectionEl, { speed: 1.5 });
 * Auto-inits every [data-stripe-id] section on the page on load.
 */

class HorizontalScroll {
  constructor(container, options = {}) {
    this.container = container;
    this.track = container.querySelector('[data-scroll-track]');

    if (!this.track) {
      console.error('[HorizontalScroll] No track found with data-scroll-track');
      return;
    }

    const data = this.track.dataset;
    const parsedSpeed = parseFloat(data.scrollSpeed);
    const parsedDirection = parseFloat(data.scrollDirection);
    this.options = {
      speed: options.speed ?? (Number.isFinite(parsedSpeed) ? parsedSpeed : 1),
      autoplay: options.autoplay ?? data.scrollAutoplay !== 'false',
      direction: options.direction ?? (Number.isFinite(parsedDirection) ? parsedDirection : 1),
      resumeDelay: options.resumeDelay ?? 1500,
      dragSpeedFactor: options.dragSpeedFactor ?? 2,
    };

    this.direction = this.options.direction >= 0 ? 1 : -1;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartScroll = 0;
    this.dragVelocity = 0;
    this.autoplayId = null;
    this.momentumId = null;
    this.resumeTimeoutId = null;
    this.isInView = true;

    this.tickAutoplay = this.tickAutoplay.bind(this);

    this.init();
  }

  init() {
    this.setupDragListeners();
    this.setupVisibilityGate();
    this.setupResizeHandling();

    this.startAutoplay();
  }

  canAutoplay() {
    return this.options.autoplay && !window.__prefersReducedMotion;
  }

  /* ── Autoplay: continuous rAF scroll, bounces at both ends ──
     canAutoplay() is checked HERE, not by callers — every call site
     (init, visibility gate, resume-after-drag) can call this unconditionally
     and trust it to no-op correctly rather than each re-deriving the gate. */

  startAutoplay() {
    if (!this.canAutoplay() || this.autoplayId || this.isDragging || !this.isInView) return;
    this.autoplayId = requestAnimationFrame(this.tickAutoplay);
  }

  stopAutoplay() {
    if (this.autoplayId) {
      cancelAnimationFrame(this.autoplayId);
      this.autoplayId = null;
    }
  }

  tickAutoplay() {
    const maxScroll = this.track.scrollWidth - this.track.clientWidth;

    if (maxScroll > 0) {
      const next = this.track.scrollLeft + this.options.speed * this.direction;
      if (next <= 0) {
        this.track.scrollLeft = 0;
        this.direction = 1;
      } else if (next >= maxScroll) {
        this.track.scrollLeft = maxScroll;
        this.direction = -1;
      } else {
        this.track.scrollLeft = next;
      }
    }

    this.autoplayId = requestAnimationFrame(this.tickAutoplay);
  }

  /* Pause during interaction, resume after resumeDelay of no interaction. */
  pauseThenResume() {
    this.stopAutoplay();
    clearTimeout(this.resumeTimeoutId);
    if (!this.canAutoplay()) return;
    this.resumeTimeoutId = setTimeout(() => this.startAutoplay(), this.options.resumeDelay);
  }

  /* ── Drag / swipe (mouse + touch unified) ── */

  setupDragListeners() {
    this.track.addEventListener('mousedown', (e) => this.handleDragStart(e));
    this.track.addEventListener('touchstart', (e) => this.handleDragStart(e), { passive: true });

    document.addEventListener('mousemove', (e) => this.handleDragMove(e));
    document.addEventListener('touchmove', (e) => this.handleDragMove(e), { passive: true });

    document.addEventListener('mouseup', () => this.handleDragEnd());
    document.addEventListener('touchend', () => this.handleDragEnd());
  }

  handleDragStart(e) {
    // Without this, dragging over an <img> past the browser's native
    // drag-threshold hands mouse capture to native image drag-and-drop —
    // it fires exactly one more mousemove and then goes silent, since the
    // browser is now tracking its own drag ghost instead of the pointer.
    if (e.type === 'mousedown') e.preventDefault();

    this.isDragging = true;
    this.dragStartX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    this.dragStartScroll = this.track.scrollLeft;
    this.dragVelocity = 0;
    this.lastDragX = this.dragStartX;

    this.track.classList.add('is-dragging');
    this.stopAutoplay();
    clearTimeout(this.resumeTimeoutId);
    if (this.momentumId) cancelAnimationFrame(this.momentumId);
  }

  handleDragMove(e) {
    if (!this.isDragging) return;

    const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const dragDistance = this.dragStartX - currentX;

    // Frame-to-frame delta drives momentum velocity (not total distance).
    this.dragVelocity = (this.lastDragX - currentX) * this.options.dragSpeedFactor;
    this.lastDragX = currentX;

    this.track.scrollLeft = this.dragStartScroll + dragDistance;
  }

  handleDragEnd() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.track.classList.remove('is-dragging');

    if (Math.abs(this.dragVelocity) > 2) {
      this.applyMomentum();
    } else {
      this.pauseThenResume();
    }
  }

  applyMomentum() {
    let velocity = this.dragVelocity;
    const friction = 0.95;

    const momentumScroll = () => {
      if (Math.abs(velocity) < 0.5) {
        this.momentumId = null;
        // Momentum settled past whichever edge it was heading toward —
        // resume autoplay heading back the other way.
        this.direction = this.track.scrollLeft <= 0 ? 1
          : this.track.scrollLeft >= this.track.scrollWidth - this.track.clientWidth ? -1
          : this.direction;
        this.pauseThenResume();
        return;
      }

      const maxScroll = this.track.scrollWidth - this.track.clientWidth;
      this.track.scrollLeft = Math.max(0, Math.min(maxScroll, this.track.scrollLeft + velocity));
      velocity *= friction;
      this.momentumId = requestAnimationFrame(momentumScroll);
    };

    momentumScroll();
  }

  /* ── Pause offscreen (matches this theme's low-end/perf conventions —
     see device-capability.js) so the rAF loop doesn't run for a row
     that's nowhere near the viewport. ── */
  setupVisibilityGate() {
    this.visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.isInView = entry.isIntersecting;
        if (this.isInView) {
          this.startAutoplay();
        } else {
          this.stopAutoplay();
        }
      });
    }, { threshold: 0 });
    this.visibilityObserver.observe(this.container);
  }

  /* Clamp scroll position back into range if a resize shrinks scrollWidth
     (e.g. rotating a phone) so autoplay doesn't stay stuck past the new end. */
  setupResizeHandling() {
    const clamp = () => {
      const maxScroll = this.track.scrollWidth - this.track.clientWidth;
      if (this.track.scrollLeft > maxScroll) this.track.scrollLeft = Math.max(0, maxScroll);
    };
    if (window.resizeManager) {
      const id = `horizontal-scroll-${this.container.dataset.stripeId || Math.random().toString(36).slice(2)}`;
      this.unsubscribeResize = window.resizeManager.subscribe(id, clamp);
    } else {
      this._resizeHandler = clamp;
      window.addEventListener('resize', this._resizeHandler, { passive: true });
    }
  }

  destroy() {
    this.stopAutoplay();
    if (this.momentumId) cancelAnimationFrame(this.momentumId);
    clearTimeout(this.resumeTimeoutId);
    this.visibilityObserver?.disconnect();
    this.unsubscribeResize?.();
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
  }

  // Public API
  scrollTo(position) { this.track.scrollLeft = position; }
  scrollBy(amount) { this.track.scrollLeft += amount; }
  setSpeed(speed) { this.options.speed = speed; }
}

// Auto-initialize every horizontally-scrolling section on the page.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-stripe-id]').forEach((section) => {
    new HorizontalScroll(section);
  });
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HorizontalScroll;
}
