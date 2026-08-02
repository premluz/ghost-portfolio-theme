/**
 * BackgroundLayer — generic, reusable scroll-triggered "shift progress"
 * driver for per-section background/foreground treatments (a flat panel
 * today; the same bindShift contract works for a future gradient/shader
 * layer, since it just hands back a 0-1 number, not a colour).
 *
 * Replaces an earlier "ColorInvert" version that had two real bugs, each
 * fixed by a specific design change here:
 *
 * 1. That version worked by swapping --color-background/--color-on-surface
 *    — the SAME tokens theme.js also writes to on a theme toggle. Two
 *    independent systems racing over shared state meant toggling the site
 *    theme at any point produced inconsistent, stuck, or flip-flopping
 *    results. This version drives a brand-new, single-purpose property
 *    (e.g. --profile-shift, a plain 0-1 number, not a colour) that NOTHING
 *    else's CSS references. That's what actually prevents any bleed onto
 *    other sections too, even though the property lives at :root for
 *    convenience (so things outside the trigger element, like the fixed
 *    nav, can react to it as well) — a shared, widely-consumed token like
 *    --color-on-surface affects everything by definition; a fresh property
 *    only affects the handful of selectors a stylesheet explicitly opts in
 *    via color-mix()/opacity. Nothing to race over, nothing to leak onto.
 *
 * 2. Timed via two independent viewport-height-tied ramps rather than a
 *    fraction of the trigger's own (potentially much taller) total range:
 *      enter: 'top bottom' -> 'top top'        (0 -> 1)
 *      exit:  'bottom bottom' -> 'bottom top'  (1 -> 0)
 *    Each spans EXACTLY one viewport height by construction — the distance
 *    for triggerEl's edge to travel from the viewport's bottom edge to its
 *    top edge — the only geometrically correct choice regardless of
 *    section height, verified empirically. scrub:true (no lag): the value
 *    at any scroll position is exact, so fast scrolling can't show a
 *    stale, still-catching-up edge.
 */
(function() {
  'use strict';

  /**
   * Parse any valid CSS colour string to {r,g,b} (0-255 each), via a 1x1
   * canvas — handles hex/rgb/oklch/named colours alike. Exposed for
   * consumers that need to hand-blend a colour outside CSS (e.g. THREE.js
   * particle material colours, which color-mix() can't reach directly).
   */
  function parseColorToRGB(colorStr) {
    const cvs = document.createElement('canvas');
    cvs.width = 1;
    cvs.height = 1;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = colorStr || '#000';
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }

  /**
   * Bind a 0-1 scroll-driven "shift" value to `varName` on `options.root`
   * (default :root), tied to `triggerEl`'s enter/exit. Consumers style
   * against `varName` directly (e.g. via CSS color-mix()/opacity) — this
   * module only ever writes a plain number, never a colour.
   *
   * LIVE GEOMETRY, NOT ScrollTrigger — deliberately. The previous version
   * used two ScrollTriggers, which bake start/end to absolute scroll pixels
   * at refresh time. Several sections ABOVE the profile change height
   * dynamically after load (operating-model-stacked's pause system extends
   * its pinned scroll range; posts-tabs-grid's per-card metadata fetches
   * grow previously-empty cards; font loading) — each shifts everything
   * below it, and any of them landing after the last ScrollTrigger.refresh()
   * left the cached positions anchored to a stale page height, firing the
   * shift early / partially / seemingly at random. Point-fixes existed
   * (debounced refresh in posts-tabs-grid.js), but they require every
   * dynamic section to remember to refresh. getBoundingClientRect() has no
   * cache — it reads where the section ACTUALLY is, this frame, so no
   * section's dynamic growth can ever desync it, with nothing to
   * coordinate. (Same reasoning as particle-morph.hbs's lab trigger moving
   * from ScrollTrigger to IntersectionObserver.)
   *
   * Ramp maths (identical timing contract to the old triggers, one
   * viewport-height each by construction):
   *   enter: top edge travels viewport bottom → top   t: 0 → 1
   *   exit:  bottom edge travels viewport bottom → top t: 1 → 0
   *   t = clamp01(min(enterT, exitT)) — min() makes the two ramps compose
   *   for any section height (taller than a viewport: flat 1 in between;
   *   shorter: a lower peak, never a glitch).
   *
   * Updates are rAF-coalesced from three sources: scroll (the scrub),
   * window resize, and a ResizeObserver on <html> + the section itself —
   * the last one catches layout growth that happens WITHOUT a scroll event
   * (e.g. a fetch populating content above while the user is idle).
   */
  function bindShift(triggerEl, varName, options) {
    options = options || {};
    const root = options.root || document.documentElement;

    // Optional zone extension: the shifted state holds until END TRIGGER's
    // bottom edge exits, instead of triggerEl's own. This is the correct way
    // to keep the shift through several consecutive sections — ONE binding
    // spanning the zone. Do NOT bind a second bindShift() on the next
    // section writing the same property instead: two bindings recompute the
    // same var every frame with different answers through the handoff zone
    // (one's exit ramp vs the other's enter ramp), and last-writer-wins
    // flickers.
    //
    // endTrigger may be an ELEMENT (static zone) or a FUNCTION returning an
    // element, re-evaluated every compute — for zones whose end depends on
    // live state (e.g. the profile shift's end is theme-dependent). Same
    // fresh-lookup philosophy as everything else here: nothing cached,
    // a theme toggle mid-scroll is correct on the next frame.
    const resolveEndEl = typeof options.endTrigger === 'function'
      ? () => options.endTrigger() || triggerEl
      : () => options.endTrigger || triggerEl;

    // quantize (default 0 = off/exact): snap the value to steps of this size.
    // Every consumer of the shift is a colour blend, where ~20 steps is
    // indistinguishable from continuous — but the nav's glass layer carries
    // backdrop-filter: blur(32px), so each distinct value costs a full-width
    // blur re-rasterisation. Snapping cuts those repaints several-fold while
    // staying position-derived, so unlike a time-based transition it still
    // cannot go stale on a fast flick.
    const quantize = options.quantize || 0;
    let lastApplied = null;
    const apply = (raw) => {
      const t = quantize ? Math.round(raw / quantize) * quantize : raw;
      const fixed = t.toFixed(4);
      if (fixed === lastApplied) return; // skip no-op writes (+ onProgress work)
      lastApplied = fixed;
      root.style.setProperty(varName, fixed);
      if (options.onProgress) options.onProgress(t);
    };

    const compute = () => {
      const vh = window.innerHeight;
      if (!vh) return;
      // enterOffset (default 0): delays the enter ramp start by N viewport heights.
      // enterOffset=0.3 means the section's top must be 0.3vh PAST viewport bottom
      // before shift begins — prevents premature shift during previous section.
      // enterSpan/exitSpan (default 1): ramp length in viewport heights.
      // 1 is the geometric default documented above — the distance for the
      // element's edge to cross the viewport. A smaller value shortens the
      // ramp so the shift completes/reverts sooner, for callers that want a
      // snappier transition than the full crossing (gradient-frame's revert).
      const enterSpan = options.enterSpan || 1;
      const exitSpan = options.exitSpan || 1;
      const enterOffset = options.enterOffset || 0;
      const enterT = (vh - triggerEl.getBoundingClientRect().top - (vh * enterOffset)) / (vh * enterSpan);
      // exitOffset (default 0): delays the exit ramp start by N viewport heights.
      // exitOffset=0.5 means the section must scroll 0.5vh PAST the normal exit
      // trigger point before reversion begins — keeps the shift held longer.
      const exitOffset = options.exitOffset || 0;
      // endInset (default 0, px, number OR function re-evaluated every
      // compute): treat the end element as ending this many pixels ABOVE its
      // real bottom edge. For a trailing region whose lower part has already
      // faded back to the page's own look — gradient-frame's bottom band —
      // the box bottom is far later than the point the effect stops being
      // visible, so the revert felt late. Function form for the same
      // fresh-lookup reason as endTrigger: the inset can be layout-derived.
      const endInset = typeof options.endInset === 'function'
        ? (options.endInset() || 0)
        : (options.endInset || 0);
      const exitT = (resolveEndEl().getBoundingClientRect().bottom - endInset - (vh * exitOffset)) / (vh * exitSpan);
      apply(Math.max(0, Math.min(1, enterT, exitT)));
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; compute(); });
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Theme toggles fire neither scroll nor resize, but a function-valued
    // endTrigger may resolve differently per theme (zone length changes) —
    // recompute so the shift value can't go stale against the new zone.
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    ro.observe(triggerEl);
    // Dynamic end elements are covered by the documentElement observation
    // (any section growing changes the page height); observing the current
    // end element directly is just belt-and-braces for the static case.
    const initialEndEl = resolveEndEl();
    if (initialEndEl !== triggerEl) ro.observe(initialEndEl);
    compute();

    return {
      refresh: compute,
      kill() {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        ro.disconnect();
        mo.disconnect();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  }

  window.BackgroundLayer = { bindShift, parseColorToRGB };
})();
