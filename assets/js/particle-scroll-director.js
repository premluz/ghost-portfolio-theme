/**
 * Particle Scroll Director — continuous, scroll-driven choreography.
 *
 * ── Why not a taller canvas ────────────────────────────────────────────
 * The obvious way to make the particle object "scroll with the page" is to
 * size the canvas to the whole document and let the viewport show part of
 * it. That does not work here, for a hard reason rather than a taste one:
 * this page is ~8900px, so at DPR 2 the canvas would be ~17800 device
 * pixels tall — past the 16384 max renderbuffer dimension most drivers
 * expose, i.e. it fails outright. Even under the cap, WebGL redraws the
 * ENTIRE framebuffer every frame, so it would shade ~52M fragments to show
 * the ~1.3M you can actually see.
 *
 * The identical effect costs one number: keep the canvas fixed and
 * viewport-sized, and move the SCENE as a function of scroll. That is what
 * this file does. A tall world seen through a fixed window is the same
 * picture as a tall canvas — for the price of a few uniform writes.
 *
 * ── Why it exists at all ───────────────────────────────────────────────
 * Every particle trigger today is boolean: ~20 IntersectionObservers and
 * ScrollTriggers that each fire morphTo() when a section crosses an edge.
 * That can express "when you reach the Lab section, become a sphere". It
 * cannot express "rotate a quarter turn and drift left across these two
 * screens", because nothing continuous is ever fed in.
 *
 * This is ADDITIVE — with one important exception.
 *
 * The NUMERIC channels (rotation, position, cameraZ, fov, style amounts) are
 * safe to add alongside the existing triggers: nothing else drives them from
 * scroll, so there is no contention.
 *
 * The `shape` channel is NOT. Existing morphTo triggers write the same
 * state, so while both are live they fight and the visible shape depends on
 * which fired last — verified: scrolling through several zones with the old
 * triggers still active leaves the shape stuck, while the same timeline on a
 * freshly-loaded page lands correctly. So:
 *
 *   - adding rotation/position/style choreography      → just add it
 *   - moving a section's SHAPE onto the timeline       → you must delete
 *     that section's IntersectionObserver/ScrollTrigger in the same change
 *
 * Do them one section at a time.
 *
 * ── Cost ───────────────────────────────────────────────────────────────
 * ONE passive scroll listener that does nothing but store a number, and one
 * document-height read per frame. Deliberately no getBoundingClientRect per
 * frame: the existing scroll path is already the page's main jank source
 * (see the note on bindShift in particle-morph.hbs), and this must not add
 * to it. Section-relative zones resolve their element rect at most once per
 * frame, cached, and only when a zone is actually configured.
 *
 * ── Usage ──────────────────────────────────────────────────────────────
 *   director.setTimeline([
 *     { at: 0.00, rotationY: 0.0,  position: [0, 0, 0], styles: { halftone: 0 } },
 *     { at: 0.20, rotationY: 1.5,  position: [-2, 1, 0], styles: { halftone: 1 } },
 *     { at: 0.45, rotationY: 3.0,  position: [0, -3, -4], styles: { 'free-float': 0.3 } },
 *   ]);
 *
 * Keys are optional per keyframe — a channel is only driven if at least one
 * keyframe mentions it, so you can choreograph rotation without touching
 * position, etc.
 */

class ParticleScrollDirector {
  constructor() {
    this.timeline = [];
    this.enabled = false;
    this._scrollY = window.scrollY;
    this._progress = 0;
    // Channels the timeline actually mentions. Anything absent is left
    // entirely alone, so the director never fights animate() for control of
    // a value nobody asked it to drive.
    this._channels = new Set();
    // Last shape the director asked for. Shapes are discrete, so unlike the
    // numeric channels they are not interpolated — the director just detects
    // that the zone changed and issues one morph.
    this._shape = null;

    this._onScroll = () => { this._scrollY = window.scrollY; };
    this._onResize = () => { this._elCache = null; };
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  /**
   * @param {Array} keyframes sorted by `at` (0-1 page progress). Each may
   *   carry: rotationX/Y/Z, position [x,y,z], cameraZ, fov,
   *   styles {styleKey: amount}.
   */
  /**
   * @param {Array}  keyframes
   * @param {Object} [options]
   *   element  CSS selector or Element. When given, `at` is 0-1 across THAT
   *            element's own scroll pass instead of the whole page: 0 the
   *            moment its top reaches the viewport bottom, 1 when its bottom
   *            leaves the viewport top. This is what lets a shape "scroll
   *            with" a section — the section's own travel is the clock, so
   *            the choreography survives the page getting taller above it.
   */
  setTimeline(keyframes, options) {
    options = options || {};
    this.element = options.element || null;
    this._elCache = null;
    this.timeline = (keyframes || []).slice().sort((a, b) => a.at - b.at);
    this._channels = new Set();
    this.timeline.forEach((k) => {
      ['rotationX', 'rotationY', 'rotationZ', 'position', 'cameraZ', 'fov']
        .forEach((c) => { if (k[c] !== undefined) this._channels.add(c); });
      if (k.styles) Object.keys(k.styles).forEach((s) => this._channels.add('style:' + s));
      if (k.shape !== undefined) this._channels.add('shape');
    });
    this.enabled = this.timeline.length > 0;
    return this;
  }

  _resolveElement() {
    if (this._elCache) return this._elCache;
    this._elCache = typeof this.element === 'string'
      ? document.querySelector(this.element)
      : this.element;
    return this._elCache;
  }

  /**
   * 0-1 progress. Whole-page by default (no rect read at all); element-bound
   * when a timeline supplied one. The element path costs ONE
   * getBoundingClientRect per frame and only when configured — measured
   * against the existing scroll handlers, which is why the page path
   * deliberately avoids it entirely.
   */
  progress() {
    if (this.element) {
      const el = this._resolveElement();
      if (el) {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const span = r.height + vh;
        return span > 0 ? Math.min(1, Math.max(0, (vh - r.top) / span)) : 0;
      }
    }
    const doc = document.scrollingElement || document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, this._scrollY / max)) : 0;
  }

  /** Linear blend of a numeric channel across the bracketing keyframes. */
  _sample(channel, t) {
    const frames = this.timeline.filter((k) => k[channel] !== undefined);
    if (!frames.length) return undefined;
    if (t <= frames[0].at) return frames[0][channel];
    if (t >= frames[frames.length - 1].at) return frames[frames.length - 1][channel];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      if (t >= a.at && t <= b.at) {
        const span = b.at - a.at;
        const f = span > 0 ? (t - a.at) / span : 0;
        if (Array.isArray(a[channel])) {
          return a[channel].map((v, j) => v + (b[channel][j] - v) * f);
        }
        return a[channel] + (b[channel] - a[channel]) * f;
      }
    }
    return frames[frames.length - 1][channel];
  }

  /**
   * The shape whose zone contains `t` — the last keyframe at or before it.
   * Deriving shape from POSITION rather than from enter/leave events is the
   * point of migrating a section here: a position-derived shape is correct
   * after a fast flick, after loading the page already scrolled, and after a
   * curtain-return that restores scroll instantly — all cases where an
   * IntersectionObserver simply never fires and the old triggers leave the
   * wrong shape on screen.
   */
  _sampleShape(t) {
    const frames = this.timeline.filter((k) => k.shape !== undefined);
    if (!frames.length) return undefined;
    let shape = frames[0].shape;
    for (let i = 0; i < frames.length; i++) {
      if (t >= frames[i].at) shape = frames[i].shape; else break;
    }
    return shape;
  }

  _sampleStyle(key, t) {
    const frames = this.timeline.filter((k) => k.styles && k.styles[key] !== undefined);
    if (!frames.length) return undefined;
    if (t <= frames[0].at) return frames[0].styles[key];
    if (t >= frames[frames.length - 1].at) return frames[frames.length - 1].styles[key];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      if (t >= a.at && t <= b.at) {
        const span = b.at - a.at;
        const f = span > 0 ? (t - a.at) / span : 0;
        return a.styles[key] + (b.styles[key] - a.styles[key]) * f;
      }
    }
    return frames[frames.length - 1].styles[key];
  }

  /**
   * Called by ParticleAnimationLoop.animate() immediately before the draw —
   * see the comment at that call site for why it must be last.
   */
  apply(loop) {
    if (!this.enabled || !loop.particles) return;
    const t = this._progress = this.progress();
    const p = loop.particles;

    if (this._channels.has('rotationX')) p.rotation.x = this._sample('rotationX', t);
    if (this._channels.has('rotationY')) p.rotation.y = this._sample('rotationY', t);
    if (this._channels.has('rotationZ')) p.rotation.z = this._sample('rotationZ', t);
    // Skipped while the hero owns particles.position for its own CSS-driven
    // offset (particle-animation-loop.js's heroOffsetActive) — both write
    // the same property every frame, and this director runs last, so
    // without this guard the Lab timeline's position (clamped to its t=0
    // keyframe while the Lab section is still off-screen below) silently
    // cancels the hero offset out on every frame it's active.
    if (this._channels.has('position') && !loop._heroOffsetActive) {
      const v = this._sample('position', t);
      if (v) p.position.set(v[0], v[1], v[2]);
    }
    if (this._channels.has('cameraZ')) loop.camera.position.z = this._sample('cameraZ', t);
    if (this._channels.has('fov')) {
      const fov = this._sample('fov', t);
      if (Math.abs(loop.camera.fov - fov) > 0.01) {
        loop.camera.fov = fov;
        loop.camera.updateProjectionMatrix();
      }
    }
    if (this._channels.has('shape')) {
      const want = this._sampleShape(t);
      if (want && want !== this._shape) {
        this._shape = want;
        // Routed through __particleApply, not morphTo, so the scenario map
        // in default.hbs (hero-footer / full / 'hide') still governs what a
        // section actually does — the director decides WHEN, the scenario
        // decides WHAT, exactly as the existing triggers do.
        const sys = window.particleSystem;
        if (window.__particleApply && sys) {
          window.__particleApply(sys, this.shapeKey || 'director', want, this.morphMs || 600);
        } else if (sys && sys.morphTo) {
          sys.morphTo(want, this.morphMs || 600);
        }
      }
    }

    this._channels.forEach((c) => {
      if (c.slice(0, 6) !== 'style:') return;
      const key = c.slice(6);
      const amount = this._sampleStyle(key, t);
      if (amount !== undefined && loop.setStyleAmount) loop.setStyleAmount(key, amount);
    });
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    this.enabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.ParticleScrollDirector = ParticleScrollDirector;
  // One instance, attached to the loop when it exists. Left with an empty
  // timeline (and therefore inert) until something calls setTimeline().
  window.particleScrollDirector = new ParticleScrollDirector();
}
