(function() { 'use strict';
/**
 * RESIZE MANAGER
 * Centralized dispatch for window resize reactions.
 * One `resize` listener instead of N independent ones; callbacks are
 * intentionally NOT debounced here — callers that need debouncing wrap
 * their own callback (see horiz-scroll.js) since different subscribers
 * have very different cost/tolerance (a cheap DOM re-measure vs. a THREE.js
 * camera/renderer resize).
 */

class ResizeManager {
  constructor() {
    this.callbacks = new Map(); // id → callback function
    this._bound = false;
    this.DEBUG = false;
  }

  /**
   * Register a resize callback.
   * @param {string} id - Unique subscriber ID (used in error logging)
   * @param {Function} fn - Called with no arguments on every window resize
   * @returns {Function} Unsubscribe function
   */
  subscribe(id, fn) {
    if (this.callbacks.has(id)) {
      console.warn(`ResizeManager: "${id}" already subscribed — replacing previous callback`);
    }
    this.callbacks.set(id, fn);
    this._ensureBound();
    this.log(`Subscribed: "${id}"`);
    return () => this.unsubscribe(id);
  }

  /**
   * Remove a resize callback.
   * @param {string} id - Subscriber ID
   */
  unsubscribe(id) {
    if (this.callbacks.delete(id)) {
      this.log(`Unsubscribed: "${id}"`);
    }
  }

  _ensureBound() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('resize', () => {
      this.callbacks.forEach((fn, id) => {
        try {
          fn();
        } catch (e) {
          console.error(`ResizeManager: "${id}" threw on resize`, e);
        }
      });
    }, { passive: true });
  }

  /**
   * Debug logging
   */
  log(message) {
    if (this.DEBUG) {
      console.log(`[ResizeManager] ${message}`);
    }
  }
}

// Export as global — ready-made singleton, not just the bare class, so
// every caller shares one instance without needing to coordinate who
// creates it.
window.ResizeManager = ResizeManager;
window.resizeManager = new ResizeManager();
})();
