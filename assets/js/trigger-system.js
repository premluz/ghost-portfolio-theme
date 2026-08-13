/**
 * Trigger System - Handles scroll, time, and viewport triggers
 */

class ParticleScrollTrigger {
  constructor(element, actions) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    this.actions = actions; // [ { percent: 20, action: 'fade-in', ... } ]
    this.lastPercent = -1;
    this.observer = null;
  }

  init(callback) {
    this.callback = callback;
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.startTracking();
        } else {
          this.stopTracking();
        }
      });
    }, { threshold: 0 });

    if (this.element) {
      this.observer.observe(this.element);
    }
  }

  startTracking() {
    window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
  }

  stopTracking() {
    window.removeEventListener('scroll', this.handleScroll.bind(this));
  }

  handleScroll() {
    if (!this.element) return;

    const rect = this.element.getBoundingClientRect();
    const elementTop = rect.top;
    const elementHeight = rect.height;
    const viewportHeight = window.innerHeight;

    // Calculate percent (0 = top of element enters viewport, 100 = bottom leaves)
    const scrollPercent = Math.max(
      0,
      Math.min(100, ((viewportHeight - elementTop) / (viewportHeight + elementHeight)) * 100)
    );

    // Fire actions that match current percent
    this.actions.forEach(action => {
      if (
        scrollPercent >= action.percent &&
        scrollPercent < action.percent + 10 &&
        this.lastPercent < action.percent
      ) {
        this.callback(action);
      }
    });

    this.lastPercent = scrollPercent;
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    this.stopTracking();
  }
}

class TimeTrigger {
  constructor(actions) {
    this.actions = actions; // [ { at: 0, state: 'dispersed' }, { at: 2000, action: 'morph', ... } ]
    this.startTime = null;
    this.completedActions = new Set();
  }

  init(callback) {
    this.callback = callback;
    this.startTime = Date.now();
  }

  update() {
    if (!this.startTime) return;

    const elapsed = Date.now() - this.startTime;

    this.actions.forEach(action => {
      if (elapsed >= action.at && !this.completedActions.has(action.at)) {
        this.callback(action);
        this.completedActions.add(action.at);
      }
    });
  }

  reset() {
    this.startTime = Date.now();
    this.completedActions.clear();
  }
}

class ViewportTrigger {
  constructor(element, actions) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    this.actions = actions; // [ { when: 'enters', action: 'fade-in' } ]
    this.observer = null;
    this.isVisible = false;
  }

  init(callback) {
    this.callback = callback;
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const wasVisible = this.isVisible;
        this.isVisible = entry.isIntersecting;

        if (this.isVisible && !wasVisible) {
          this.fireAction('enters');
        } else if (!this.isVisible && wasVisible) {
          this.fireAction('leaves');
        }
      });
    }, { threshold: 0.1 });

    if (this.element) {
      this.observer.observe(this.element);
    }
  }

  fireAction(when) {
    const action = this.actions.find(a => a.when === when);
    if (action) {
      this.callback(action);
    }
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
  }
}

class TriggerManager {
  constructor() {
    this.triggers = new Map();
    this.timeTriggers = [];
  }

  registerScroll(id, element, actions) {
    const trigger = new ParticleScrollTrigger(element, actions);
    this.triggers.set(id, trigger);
    return trigger;
  }

  registerTime(id, actions) {
    const trigger = new TimeTrigger(actions);
    this.timeTriggers.push(trigger);
    this.triggers.set(id, trigger);
    return trigger;
  }

  registerViewport(id, element, actions) {
    const trigger = new ViewportTrigger(element, actions);
    this.triggers.set(id, trigger);
    return trigger;
  }

  init(callback) {
    this.triggers.forEach(trigger => {
      trigger.init(callback);
    });
  }

  update() {
    this.timeTriggers.forEach(trigger => trigger.update());
  }

  destroy() {
    this.triggers.forEach(trigger => trigger.destroy());
    this.triggers.clear();
    this.timeTriggers = [];
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ParticleScrollTrigger = ParticleScrollTrigger;
  window.TimeTrigger = TimeTrigger;
  window.ViewportTrigger = ViewportTrigger;
  window.TriggerManager = TriggerManager;
}
