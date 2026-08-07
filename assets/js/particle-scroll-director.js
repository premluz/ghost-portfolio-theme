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
   *             channel (falls back to the zone name). Can also be set
   *             per-keyframe (`{ at, shape, shapeKey }`) when different
   *             points in the same zone need different scenario-map keys
   *             (e.g. hero's entrance keyframe resolves against the 'hero'
   *             key, its collapse keyframe against 'hero-exit' — those are
   *             NOT interchangeable in PARTICLE_SCENARIOS) — falls back to
   *             the zone-level shapeKey when a keyframe doesn't set one.
   *   morphMs   duration passed to __particleApply for this zone's shape
   *             morphs (default 600). Can also be set per-keyframe
   *             (`{ at, shape, morphMs }`), falling back to the zone-level
   *             morphMs when a keyframe doesn't set one — e.g. Lab's own
   *             entrance is a deliberately slow, dramatic reveal (800ms)
   *             but its exit should be fast like every other hide (400ms).
   *   chase     { channel: maxDeltaPerFrame } — rate-limits a *Delta
   *             channel's frame-to-frame change (mirrors hero's old
   *             _heroExitRotationCurrent chase, which existed specifically
   *             so a fast scroll/flick can't jump the target too far in one
   *             frame and visually blur a shape). Stateful — inherently not
   *             expressible as a pure function of `t` alone.
   *   continuous { channel: ratePerPxOfOverscroll } — once scroll passes a
   *             zone's own LAST keyframe `at` (not just t=1), keep
   *             extrapolating a *Delta channel via this rate instead of
   *             clamping flat, using however many px past that keyframe the
   *             zone's bound element has scrolled. Element-bound zones only
   *             (needs a real px height to convert progress into px).
   *   frame     (loop, t) => { positionBase?: [x,y,z], cameraZ?: number,
   *             fov?: number } | null — an optional per-frame callback for
   *             values that are DOM/viewport measurements, not scroll-
   *             progress functions (e.g. hero's canvas offset, which
   *             depends on live CSS custom properties, not on `t`). When
   *             present, `positionBase` is added to the zone's own sampled
   *             `position` channel (so keyframes describe a delta from a
   *             moving base, not an absolute world position); `cameraZ`/
   *             `fov` are applied directly. Deliberately the ONLY way to
   *             drive cameraZ/fov for a zone that also needs to stop
   *             affecting the camera once no longer relevant — unlike the
   *             plain cameraZ/fov keyframe channels (which `_sample()`
   *             clamps to their last value forever), returning `null` (or
   *             omitting a key) here makes `apply()` skip it entirely, so
   *             the callback's own closure is what decides whether it's
   *             still in control this frame — see the zone's own `frame`
   *             for the exact "still relevant" check.
   *   ownsPosition (loop) => boolean — generalizes the single hardcoded
   *             `!loop._heroOffsetActive` guard this file used to have into
   *             a per-zone predicate. At most ONE active zone with a truthy
   *             `ownsPosition(loop)` gets to write `position` on any given
   *             frame (first one found, Map-insertion-order); zones that
   *             never pass this option are unaffected — they write
   *             `position` exactly as before as long as no OTHER zone
   *             currently claims exclusive ownership.
   *   reverseExit { shape, shapeKey?, morphMs? } — fires once when the user
   *             scrolls back UP out of this zone's own entrance, having
   *             genuinely been inside it before. Pure keyframes can't
   *             express this: `_sampleShape()` stays silent (no opinion)
   *             before a zone's first real shape keyframe on purpose (see
   *             this file's own doc on why an early claim is unsafe), so
   *             scrolling back out just freezes the last-applied shape
   *             forever instead of reverting anything — there's no
   *             "leaving in reverse" keyframe to land on, only a direction-
   *             aware check can tell "approaching for the first time" (stay
   *             silent, correct) apart from "was inside, now backing out"
   *             (should hide again). `shapeKey`/`morphMs` fall back to the
   *             zone-level defaults, same as a keyframe's own overrides.
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
      chase: options.chase || null,
      continuous: options.continuous || null,
      frame: options.frame || null,
      ownsPosition: options.ownsPosition || null,
      reverseExit: options.reverseExit || null,
      _shapeEverEntered: false,
      _chaseCurrent: {},
      _lastRect: null,
      _rawT: 0,
    };
    zone.timeline.forEach((k) => {
      ['rotationX', 'rotationY', 'rotationZ', 'rotationXDelta', 'rotationYDelta', 'rotationZDelta', 'position', 'cameraZ', 'fov']
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
   *
   * Also caches the UNCLAMPED progress (`zone._rawT`) and, for
   * element-bound zones, the live rect (`zone._lastRect`) — used by
   * `_sampleContinuous()` to extrapolate past a zone's last keyframe. Not
   * used by anything that only reads the clamped 0-1 return value, so this
   * is a pure addition with no effect on existing Lab/footer behavior.
   */
  _zoneProgress(zone) {
    if (zone.element) {
      const el = this._resolveElement(zone);
      if (el) {
        const r = el.getBoundingClientRect();
        zone._lastRect = r;
        let raw;
        if (zone.mode === 'scroll-through') {
          raw = r.height > 0 ? -r.top / r.height : 0;
        } else {
          const vh = window.innerHeight;
          const span = r.height + vh;
          raw = span > 0 ? (vh - r.top) / span : 0;
        }
        zone._rawT = raw;
        return Math.min(1, Math.max(0, raw));
      }
      zone._lastRect = null;
      zone._rawT = 0;
      return 0;
    }
    zone._lastRect = null;
    const doc = document.scrollingElement || document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const raw = max > 0 ? this._scrollY / max : 0;
    zone._rawT = raw;
    return Math.min(1, Math.max(0, raw));
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
   * `_sample()`'s value, extended past a zone's own LAST keyframe `at`
   * instead of clamping flat there — only for zones that opt in via
   * `options.continuous`. Reuses `_zoneProgress()`'s already-computed
   * unclamped `zone._rawT`/`zone._lastRect` (no separate scrollY
   * bookkeeping needed): once raw progress passes the last keyframe, the
   * extra distance (in px, via the zone's own element height) is
   * multiplied by the configured rate and added on top. Element-bound
   * zones only — a rate expressed "per px of overscroll" has no meaning
   * for a whole-page zone with no single element height to convert against.
   */
  _sampleContinuous(zone, channel, t) {
    const base = this._sample(zone, channel, t);
    if (!zone.continuous || zone.continuous[channel] === undefined || !zone._lastRect) return base;
    const frames = zone.timeline.filter((k) => k[channel] !== undefined);
    if (!frames.length) return base;
    const lastAt = frames[frames.length - 1].at;
    const raw = zone._rawT || 0;
    if (raw <= lastAt) return base;
    const overscrollPx = (raw - lastAt) * zone._lastRect.height;
    return base + overscrollPx * zone.continuous[channel];
  }

  /**
   * `_sampleContinuous()`'s value, rate-limited to at most
   * `zone.chase[channel]` change per frame — only for zones that opt in
   * via `options.chase`. Stateful (remembers last frame's output per
   * channel in `zone._chaseCurrent`), which is inherent to "cap the RATE
   * of change" — `_sample`/`_sampleContinuous` alone are pure functions of
   * `t` with no memory of the previous frame, so this can't be expressed
   * through them. Exists so a fast scroll/flick can't jump a chased
   * channel's target too far in a single frame (the original motivation:
   * hero's rotation blurring into looking like a solid sphere on a fast
   * scroll, before this rate cap existed).
   */
  _sampleChased(zone, channel, t) {
    const target = this._sampleContinuous(zone, channel, t);
    if (!zone.chase || zone.chase[channel] === undefined) return target;
    const max = zone.chase[channel];
    const cur = zone._chaseCurrent[channel] || 0;
    const delta = Math.max(-max, Math.min(max, target - cur));
    zone._chaseCurrent[channel] = cur + delta;
    return zone._chaseCurrent[channel];
  }

  /**
   * The shape whose keyframe range contains `t` — the last keyframe at or
   * before it. Deriving shape from POSITION rather than from enter/leave
   * events is the point of migrating a section here: a position-derived
   * shape is correct after a fast flick, after loading the page already
   * scrolled, and after a curtain-return that restores scroll instantly —
   * all cases where an IntersectionObserver simply never fires and the old
   * triggers leave the wrong shape on screen.
   *
   * Returns { shape, shapeKey, morphMs } rather than a bare shape — the
   * keyframe that produced the current shape may carry its own `shapeKey`
   * and/or `morphMs` override (each falls back to the zone's own default
   * independently), since different points in one zone's span can need
   * different PARTICLE_SCENARIOS keys and/or morph speeds (see setZone()'s
   * own doc comments on shapeKey/morphMs) — e.g. Lab's slow, dramatic
   * entrance reveal vs. its own fast "hide, never really seen" exit.
   *
   * Returns undefined (no opinion) when `t` is BEFORE the first shape
   * keyframe's own `at` — deliberately NOT the same clamp-to-first-value
   * behavior `_sample()` uses for numeric channels. A zone whose only
   * shape keyframe sits partway through its range (e.g. operating-model-
   * exit: nothing happens until the section is fully left, expressed as a
   * single `{at: 1, shape: 'collapse'}`) must stay silent before that
   * point — claiming 'collapse' from the moment the zone merely becomes
   * `_zoneActive` (which _zoneActive's 3-viewport margin makes true well
   * before `t` actually reaches 1) would override whatever an EARLIER
   * zone (Lab) is still legitimately showing. Every zone whose first shape
   * keyframe is already at `at: 0` (hero, Lab, footer) is unaffected —
   * `t >= 0` is always true, so this never triggers for them.
   */
  _sampleShape(zone, t) {
    const frames = zone.timeline.filter((k) => k.shape !== undefined);
    if (!frames.length || t < frames[0].at) return undefined;
    let active = frames[0];
    for (let i = 0; i < frames.length; i++) {
      if (t >= frames[i].at) active = frames[i]; else break;
    }
    return {
      shape: active.shape,
      shapeKey: active.shapeKey || zone.shapeKey,
      morphMs: active.morphMs || zone.morphMs,
    };
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
   * If `zone`'s sampled shape at `t` differs from what it last applied,
   * apply it. Shared by apply() (the visible-frame path) and
   * checkShapesEvenWhileHidden() (see that method) so there's one shape-
   * application code path, not two drifting copies.
   */
  _checkZoneShape(zone, t) {
    if (!zone.channels.has('shape')) return;
    const sampled = this._sampleShape(zone, t);
    if (sampled) {
      zone._shapeEverEntered = true;
      if (sampled.shape !== zone.shape) {
        zone.shape = sampled.shape;
        this._applyShape(sampled.shape, sampled.shapeKey, sampled.morphMs);
      }
      return;
    }
    // `sampled` undefined: t has dropped back below this zone's own first
    // shape keyframe. Only act if we'd genuinely been inside before
    // (_shapeEverEntered) AND the zone opted into reverseExit — see that
    // option's own doc for why this can't just be another keyframe. One-shot
    // per entry: reset immediately so re-entering (scrolling back down) and
    // leaving again fires it again, but lingering just above the threshold
    // doesn't re-apply every frame.
    if (zone._shapeEverEntered && zone.reverseExit) {
      zone._shapeEverEntered = false;
      const rx = zone.reverseExit;
      if (rx.shape !== zone.shape) {
        zone.shape = rx.shape;
        this._applyShape(rx.shape, rx.shapeKey || zone.shapeKey, rx.morphMs || zone.morphMs);
      }
    }
  }

  /**
   * Routed through __particleApply, not morphTo, so the scenario map in
   * default.hbs (hero-footer / full / 'hide') still governs what a section
   * actually does — the director decides WHEN, the scenario decides WHAT,
   * exactly as the existing triggers do. Shared by both branches of
   * _checkZoneShape() (forward sampling and reverseExit) so there's one
   * apply code path, not two drifting copies.
   */
  _applyShape(shape, shapeKey, morphMs) {
    const sys = window.particleSystem;
    if (window.__particleApply && sys) {
      window.__particleApply(sys, shapeKey, shape, morphMs);
    } else if (sys && sys.morphTo) {
      sys.morphTo(shape, morphMs);
    }
  }

  /**
   * Cheap, shape-only pass — one getBoundingClientRect() per element-bound
   * zone with a shape channel, no particle position/rotation/camera
   * writes, no geometry blending. Meant to be called UNCONDITIONALLY, even
   * while window.__particleLayerHidden is true (see the call site in
   * particle-animation-loop.js's animate(), right where hero's own
   * _checkHeroReentry() already runs for the same reason).
   *
   * Why this exists: apply() (the rest of this class) only ever runs when
   * the layer is visible — animate() skips it entirely while hidden, for
   * real cost reasons (a full 16k-point draw + blend behind an invisible
   * layer). But a LATER zone's shape (e.g. footer's 'grid', which needs to
   * fire well after an EARLIER zone like operating-model-exit or
   * testimonials has already faded the layer to hidden) can only ever
   * become current by calling __particleApply with a non-'hide' target,
   * which is also what UN-hides the layer — a chicken-and-egg problem if
   * nothing evaluates that zone's shape while hidden in the first place.
   * The old IntersectionObserver-based triggers never had this gap: they
   * run on the browser's own callback queue, entirely independent of
   * animate()'s render state. This restores that property for shape only,
   * without paying for the rest of apply()'s per-frame work while hidden.
   */
  checkShapesEvenWhileHidden() {
    this.zones.forEach((zone) => {
      if (!zone.channels.has('shape') || !this._zoneActive(zone)) return;
      this._checkZoneShape(zone, this._zoneProgress(zone));
    });
  }

  /**
   * Called by ParticleAnimationLoop.animate() immediately before the draw —
   * see the comment at that call site for why it must be last.
   */
  apply(loop) {
    if (!loop.particles) return;
    const p = loop.particles;

    // Exclusive position ownership: at most one ACTIVE zone with a truthy
    // ownsPosition(loop) writes `position` this frame — computed once,
    // ahead of the per-zone loop below, so every zone can check "am I the
    // owner" against the same answer. Zones that never pass `ownsPosition`
    // (Lab, footer today) don't affect this at all; if no zone claims
    // ownership, exclusiveOwner stays null and every zone writes `position`
    // freely, same as before this capability existed.
    let exclusiveOwner = null;
    this.zones.forEach((zone) => {
      if (exclusiveOwner || !zone.ownsPosition || !this._zoneActive(zone)) return;
      if (zone.ownsPosition(loop)) exclusiveOwner = zone;
    });

    this.zones.forEach((zone) => {
      if (!this._zoneActive(zone)) return;
      const t = this._zoneProgress(zone);

      // DOM/viewport-measured base for this frame (e.g. hero's live canvas
      // offset, which depends on CSS custom properties, not on `t`) — see
      // setZone()'s `frame` option doc. null for every zone that doesn't
      // pass one (Lab, footer today), so `frameResult` stays null and the
      // position/fov blocks below behave exactly as before.
      const frameResult = zone.frame ? zone.frame(loop, t) : null;

      if (zone.channels.has('rotationX')) p.rotation.x = this._sample(zone, 'rotationX', t);
      if (zone.channels.has('rotationY')) p.rotation.y = this._sample(zone, 'rotationY', t);
      if (zone.channels.has('rotationZ')) p.rotation.z = this._sample(zone, 'rotationZ', t);
      // *Delta channels ADD to whatever rotation.{x,y,z} already holds
      // (typically the ambient auto-rotation/mouse-tilt code earlier in
      // animate(), which does an absolute `=` assignment) rather than
      // overwriting it — chased/extrapolated via _sampleChased so a fast
      // scroll can't jump them and so they can keep growing past a zone's
      // last keyframe (see setZone()'s chase/continuous doc).
      if (zone.channels.has('rotationXDelta')) p.rotation.x += this._sampleChased(zone, 'rotationXDelta', t);
      if (zone.channels.has('rotationYDelta')) p.rotation.y += this._sampleChased(zone, 'rotationYDelta', t);
      if (zone.channels.has('rotationZDelta')) p.rotation.z += this._sampleChased(zone, 'rotationZDelta', t);
      // Skipped when a DIFFERENT zone currently holds exclusive position
      // ownership (see exclusiveOwner above) — e.g. the 'hero' zone while
      // its own shapes are current, via its ownsPosition option — so a
      // zone clamped to its own t=0 keyframe while off-screen below (Lab,
      // footer) doesn't silently cancel hero's own offset out.
      if (zone.channels.has('position') && (!exclusiveOwner || exclusiveOwner === zone)) {
        const v = this._sample(zone, 'position', t);
        if (v) {
          const base = (frameResult && frameResult.positionBase) || [0, 0, 0];
          p.position.set(base[0] + v[0], base[1] + v[1], base[2] + v[2]);
        }
      }
      if (zone.channels.has('cameraZ')) loop.camera.position.z = this._sample(zone, 'cameraZ', t);
      if (zone.channels.has('fov')) {
        const fov = this._sample(zone, 'fov', t);
        if (Math.abs(loop.camera.fov - fov) > 0.01) {
          loop.camera.fov = fov;
          loop.camera.updateProjectionMatrix();
        }
      }
      // frame()'s own cameraZ/fov (e.g. hero's viewport-width-derived FOV
      // and its live canvas-offset-driven zoom, neither a pure function of
      // `t`) — independent of the cameraZ/fov KEYFRAME channels above,
      // which no zone currently uses at the same time as `frame`.
      //
      // Deliberately NOT a `cameraZ` keyframe channel for a zone like
      // hero's: `_sample()` has no awareness of "am I still relevant" and
      // would keep re-asserting its last keyframe's (zoomed-in) value every
      // frame for as long as `_zoneActive()`'s generous 3-viewport margin
      // keeps the zone active — which, for a short section like hero, can
      // extend well past the point some OTHER trigger has already reset
      // the camera and handed off to a later section. Routing it through
      // `frame()` instead lets the callback's own closure stop returning a
      // value entirely once no longer relevant (see the zone's own `frame`
      // for the exact check), so this block simply has nothing to apply.
      if (frameResult && frameResult.cameraZ !== undefined) {
        loop.camera.position.z = frameResult.cameraZ;
      }
      if (frameResult && frameResult.fov !== undefined && Math.abs(loop.camera.fov - frameResult.fov) > 0.01) {
        loop.camera.fov = frameResult.fov;
        loop.camera.updateProjectionMatrix();
      }
      this._checkZoneShape(zone, t);

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
