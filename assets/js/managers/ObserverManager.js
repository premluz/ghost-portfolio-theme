(function() { 'use strict';/**
 * OBSERVER MANAGER
 * Centralized management of all IntersectionObservers
 * Prevents duplicate observers, memory leaks, and redundant DOM queries
 */

class ObserverManager {
  constructor() {
    this.observers = new Map(); // id → observer instance
    this.targets = new Map();   // id → target element
    this.callbacks = new Map(); // id → callback function
    this.DEBUG = false;
  }

  /**
   * Create and register an IntersectionObserver
   * @param {string} id - Unique observer ID
   * @param {string|Element} target - Selector or element to observe
   * @param {Function} callback - Called with (entry) when visibility changes
   * @param {Object} options - IntersectionObserver options
   * @returns {IntersectionObserver|null}
   */
  createObserver(id, target, callback, options = {}) {
    // Check if already exists
    if (this.observers.has(id)) {
      console.warn(`ObserverManager: Observer "${id}" already exists`);
      return this.observers.get(id);
    }

    // Resolve target element
    const element = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!element) {
      console.error(`ObserverManager: Target not found for observer "${id}":`, target);
      return null;
    }

    // Create observer
    const defaultOptions = { threshold: 0.1 };
    const observerOptions = { ...defaultOptions, ...options };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        this.log(`Observer "${id}" triggered:`, entry.isIntersecting ? 'entered' : 'left');
        callback(entry);
      });
    }, observerOptions);

    observer.observe(element);

    // Store references
    this.observers.set(id, observer);
    this.targets.set(id, element);
    this.callbacks.set(id, callback);

    this.log(`Created observer: "${id}" for element:`, element);

    return observer;
  }

  /**
   * Remove an observer
   * @param {string} id - Observer ID
   */
  removeObserver(id) {
    const observer = this.observers.get(id);
    if (observer) {
      observer.disconnect();
      this.observers.delete(id);
      this.targets.delete(id);
      this.callbacks.delete(id);
      this.log(`Removed observer: "${id}"`);
    }
  }

  /**
   * Re-observe a target (useful after DOM changes)
   * @param {string} id - Observer ID
   * @param {string|Element} newTarget - New target to observe
   */
  reobserve(id, newTarget) {
    const observer = this.observers.get(id);
    if (!observer) {
      console.error(`ObserverManager: Observer "${id}" not found`);
      return;
    }

    // Unobserve old target
    const oldTarget = this.targets.get(id);
    if (oldTarget) {
      observer.unobserve(oldTarget);
    }

    // Observe new target
    const element = typeof newTarget === 'string'
      ? document.querySelector(newTarget)
      : newTarget;

    if (!element) {
      console.error(`ObserverManager: New target not found for observer "${id}"`);
      return;
    }

    observer.observe(element);
    this.targets.set(id, element);

    this.log(`Re-observed "${id}" with new target`);
  }

  /**
   * Get observer by ID
   * @param {string} id - Observer ID
   * @returns {IntersectionObserver|null}
   */
  getObserver(id) {
    return this.observers.get(id) || null;
  }

  /**
   * Check if observer exists
   * @param {string} id - Observer ID
   * @returns {boolean}
   */
  hasObserver(id) {
    return this.observers.has(id);
  }

  /**
   * Pause all observers (they stop triggering callbacks)
   */
  pauseAll() {
    for (const observer of this.observers.values()) {
      // IntersectionObserver doesn't have pause, so we disconnect
      observer.disconnect();
    }
    this.log('All observers paused');
  }

  /**
   * Resume all observers
   */
  resumeAll() {
    for (const [id, target] of this.targets) {
      const observer = this.observers.get(id);
      if (observer && target) {
        observer.observe(target);
      }
    }
    this.log('All observers resumed');
  }

  /**
   * Clean up all observers (for memory management)
   */
  cleanup() {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    this.targets.clear();
    this.callbacks.clear();
    this.log('All observers cleaned up');
  }

  /**
   * Get list of all active observers
   * @returns {string[]} Array of observer IDs
   */
  getActiveObservers() {
    return Array.from(this.observers.keys());
  }

  /**
   * Print observer status
   */
  printStatus() {
    console.group('📊 Observer Manager Status');
    console.log(`Active observers: ${this.observers.size}`);
    console.log('IDs:', this.getActiveObservers());
    console.groupEnd();
  }

  /**
   * Debug logging
   */
  log(message, data) {
    if (this.DEBUG) {
      if (data) {
        console.log(`[ObserverManager] ${message}`, data);
      } else {
        console.log(`[ObserverManager] ${message}`);
      }
    }
  }
}

// Export as global
if (typeof window !== 'undefined') {
  window.ObserverManager = ObserverManager;
}

// export defaultObserverManager;
window.ObserverManager = ObserverManager;
})();
