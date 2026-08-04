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
 *   director.setZone('lab', [
 *     { at: 0.00, rotationY: 0.0,  position: [0, 0, 0], styles: { halftone: 0 } },
 *     { at: 0.20, rotationY: 1.5,  position: [-2, 1, 0], styles: { halftone: 1 } },
 *     { at: 0.45, rotationY: 3.0,  position: [0, -3, -4], styles: { 'free-float': 0.3 } },
 *   ]);
 *
 * Keys are optional per keyframe — a channel is only driven if at least one
 * keyframe mentions it, so you can choreograph rotation without touching
 * position, etc.
 *
 * ── Multiple zones ─────────────────────────────────────────────────────
 * One director instance, but MULTIPLE independent zones (each its own name,
 * element binding, and keyframe list) can be live at once — e.g. Lab and
 * the footer both drive `position` from their own section's scroll pass at
 * the same time. Each zone computes its own progress from its own element
 * and is applied independently every frame; elsewhere on the page a zone's
 * `t` just sits clamped at 0 or 1 (whichever end its element is currently
 * on), holding its edge-most keyframe value rather than fighting anything
 * — harmless, since a zone bound to a specific section has nothing
 * meaningful to say while that section isn't nearby. First version of this
 * file supported exactly one zone via setTimeline(keyframes, options); that
 * became setZone('default', keyframes, options) below — setTimeline is an
 * alias kept only because nothing yet needs it removed.
 */

class ParticleScrollDirector {
  constructor() {
    this.zones = new Map();
    this._scrollY = window.scrollY;

    this._onScroll = () => { this._scrollY = window.scrollY; };
    this._onResize = () => { this.zones.forEach((z) => { z.elCache = null; }); };
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  get enabled() { return this.zones.size > 0; }

  /**
   * @param {string} name     Zone identifier — reuse the same name to
   *   replace/retune a zone in place; use a different name to run it
   *   alongside other zones.
   * @param {Array}  keyframes sorted by `at` (0-1 zone progress). Each may
   *   carry: rotationX/Y/Z, position [x,y,z], cameraZ, fov, shape,
   *   styles {styleKey: amount}.
   * @param {Object} [options]
   *   element   CSS selector or Element. When given, `at` is 0-1 across THAT
   *             element's own scroll pass instead of the whole page — see
   *             `mode` for which formula. Omit for whole-page progress.
   *   mode      'enter' (default) — 0 when the element's top reaches the
   *             viewport bottom (entering from below), 1 when its bottom
   *             clears the viewport top (fully scrolled past). Use for
   *             sections that start below the fold (Lab, footer).
   *             'scroll-through' — 0 when the element's own top is at 0
   *             (already on screen at load), 1 once scrolled a full
   *             element-height past it. Use for sections already visible
   *             at the top of the page (the hero).
   *   shapeKey  key passed to __particleApply for this zone's `shape`
   *             channel (falls back to the zone name).
   *   morphMs   duration passed to __particleApply for this zone's shape
   *             morphs (default 600).
   */
  setZone(name, keyframes, options) {
    options = options || {};
    const zone = {
      element: options.element || null,
      mode: options.mode || 'enter',
      elCache: null,
      timeline: (keyframes || []).slice().sort((a, b) => a.at - b.at),
      channels: new Set(),
      shape: null,
      shapeKey: options.shapeKey || name,
      morphMs: options.morphMs || 600,
    };
    zone.timeline.forEach((k) => {
      ['rotationX', 'rotationY', 'rotationZ', 'position', 'cameraZ', 'fov']
        .forEach((c) => { if (k[c] !== undefined) zone.channels.add(c); });
      if (k.styles) Object.keys(k.styles).forEach((s) => zone.channels.add('style:' + s));
      if (k.shape !== undefined) zone.channels.add('shape');
    });
    this.zones.set(name, zone);
    return this;
  }

  /** Back-compat alias for the original single-zone API. */
  setTimeline(keyframes, options) {
    return this.setZone('default', keyframes, options);
  }

  _resolveElement(zone) {
    if (zone.elCache) return zone.elCache;
    zone.elCache = typeof zone.element === 'string'
      ? document.querySelector(zone.element)
      : zone.element;
    return zone.elCache;
  }

  /**
   * 0-1 progress for one zone. Whole-page when the zone has no element (no
   * rect read at all); element-bound otherwise — costs ONE
   * getBoundingClientRect per frame per bound zone, measured against the
   * existing scroll handlers, which is why the page path avoids it
   * entirely.
   */
  _zoneProgress(zone) {
    if (zone.element) {
      const el = this._resolveElement(zone);
      if (el) {
        const r = el.getBoundingClientRect();
        if (zone.mode === 'scroll-through') {
          return r.height > 0 ? Math.min(1, Math.max(0, -r.top / r.height)) : 0;
        }
        const vh = window.innerHeight;
        const span = r.height + vh;
        return span > 0 ? Math.min(1, Math.max(0, (vh - r.top) / span)) : 0;
      }
      return 0;
    }
    const doc = document.scrollingElement || document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, this._scrollY / max)) : 0;
  }

  /** Linear blend of a numeric channel across a zone's bracketing keyframes. */
  _sample(zone, channel, t) {
    const frames = zone.timeline.filter((k) => k[channel] !== undefined);
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
   * The shape whose keyframe range contains `t` — the last keyframe at or
   * before it. Deriving shape from POSITION rather than from enter/leave
   * events is the point of migrating a section here: a position-derived
   * shape is correct after a fast flick, after loading the page already
   * scrolled, and after a curtain-return that restores scroll instantly —
   * all cases where an IntersectionObserver simply never fires and the old
   * triggers leave the wrong shape on screen.
   */
  _sampleShape(zone, t) {
    const frames = zone.timeline.filter((k) => k.shape !== undefined);
    if (!frames.length) return undefined;
    let shape = frames[0].shape;
    for (let i = 0; i < frames.length; i++) {
      if (t >= frames[i].at) shape = frames[i].shape; else break;
    }
    return shape;
  }

  _sampleStyle(zone, key, t) {
    const frames = zone.timeline.filter((k) => k.styles && k.styles[key] !== undefined);
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
   * Is `zone`'s bound element anywhere near the viewport right now? Zones
   * with no element (whole-page progress) are always active. This exists
   * because a zone's progress() is clamped, not undefined, when its
   * element is far away — a footer zone sitting at t=0 while you're up at
   * Lab looks IDENTICAL to a footer zone at t=0 because you've just
   * scrolled into it. With multiple zones live at once (apply() below
   * iterates all of them, Map-insertion-order), an inactive zone's clamped
   * value would silently overwrite whichever zone you're actually near —
   * reproduced by adding the footer zone: it starts writing [0,-6,0] every
   * frame regardless of scroll position, permanently pinning Lab's
   * position and looking like Lab's own movement had broken. A generous
   * margin (3 viewport heights) rather than an exact intersection check
   * keeps a zone "owning" its channels through the brief moments its
   * element's rect is just outside the viewport, avoiding a flicker
   * hand-off right at the edges of its actual scroll range.
   */
  _zoneActive(zone) {
    if (!zone.element) return true;
    const el = this._resolveElement(zone);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const margin = vh * 3;
    return r.bottom > -margin && r.top < vh + margin;
  }

  /**
   * Called by ParticleAnimationLoop.animate() immediately before the draw —
   * see the comment at that call site for why it must be last.
   */
  apply(loop) {
    if (!loop.particles) return;
    const p = loop.particles;

    this.zones.forEach((zone) => {
      if (!this._zoneActive(zone)) return;
      const t = this._zoneProgress(zone);

      if (zone.channels.has('rotationX')) p.rotation.x = this._sample(zone, 'rotationX', t);
      if (zone.channels.has('rotationY')) p.rotation.y = this._sample(zone, 'rotationY', t);
      if (zone.channels.has('rotationZ')) p.rotation.z = this._sample(zone, 'rotationZ', t);
      // Skipped while the hero owns particles.position for its own
      // CSS-driven offset (particle-animation-loop.js's _heroOffsetActive)
      // — both write the same property every frame, and this director runs
      // last, so without this guard a zone's position (clamped to its t=0
      // keyframe while its section is still off-screen below) would
      // silently cancel the hero offset out on every frame it's active.
      if (zone.channels.has('position') && !loop._heroOffsetActive) {
        const v = this._sample(zone, 'position', t);
        if (v) p.position.set(v[0], v[1], v[2]);
      }
      if (zone.channels.has('cameraZ')) loop.camera.position.z = this._sample(zone, 'cameraZ', t);
      if (zone.channels.has('fov')) {
        const fov = this._sample(zone, 'fov', t);
        if (Math.abs(loop.camera.fov - fov) > 0.01) {
          loop.camera.fov = fov;
          loop.camera.updateProjectionMatrix();
        }
      }
      if (zone.channels.has('shape')) {
        const want = this._sampleShape(zone, t);
        if (want && want !== zone.shape) {
          zone.shape = want;
          // Routed through __particleApply, not morphTo, so the scenario
          // map in default.hbs (hero-footer / full / 'hide') still governs
          // what a section actually does — the director decides WHEN, the
          // scenario decides WHAT, exactly as the existing triggers do.
          const sys = window.particleSystem;
          if (window.__particleApply && sys) {
            window.__particleApply(sys, zone.shapeKey, want, zone.morphMs);
          } else if (sys && sys.morphTo) {
            sys.morphTo(want, zone.morphMs);
          }
        }
      }

      zone.channels.forEach((c) => {
        if (c.slice(0, 6) !== 'style:') return;
        const key = c.slice(6);
        const amount = this._sampleStyle(zone, key, t);
        if (amount !== undefined && loop.setStyleAmount) loop.setStyleAmount(key, amount);
      });
    });
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    this.zones.clear();
  }
}

if (typeof window !== 'undefined') {
  window.ParticleScrollDirector = ParticleScrollDirector;
  // One instance, attached to the loop when it exists. Left with an empty
  // timeline (and therefore inert) until something calls setTimeline().
  window.particleScrollDirector = new ParticleScrollDirector();
}
