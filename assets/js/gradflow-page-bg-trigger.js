/**
 * GRADFLOW PAGE BG TRIGGER
 *
 * Drives .gradflow-page-bg--triggered (partials/gradflow-page-bg.hbs, the
 * WebGL 'smoke' whole-page background on index.hbs) the way the old,
 * now-dormant gradient-layer.js drove #page-gradient: fade in once the
 * posts-tabs section is meaningfully scrolled into view, fade out once
 * it's scrolled back past (works the same in both scroll directions — a
 * live rect recompute on every scroll tick, not a one-shot enter/leave
 * event, so there's no separate "reverse" case to handle), and crossfade
 * the canvas's colors to whichever post-card is currently most visible,
 * sourced from that card's own data-gradient-css.
 *
 * Section visibility is a plain scroll-driven boundingClientRect check
 * (top past the viewport's own midpoint, bottom not yet mostly cleared it),
 * not a fixed-px IntersectionObserver rootMargin — gradient-layer.js's
 * original -1000px/-80px pair, tried first here verbatim, assumed the
 * section sits much more than one viewport below the page top. That isn't
 * true on the current homepage layout (.posts-tabs-section starts ~720px
 * down, inside the very first 900px viewport with a short hero/intro above
 * it), so "shrink the observer root by 1000px from the top" collapsed to
 * an empty region and a plain isIntersecting check read as true from the
 * very first frame, before any scroll at all — reproduced live, opacity
 * was already 1 at scrollY 0 both ways. Percentages of window.innerHeight,
 * recomputed live, work regardless of the section's page position or the
 * viewport's own height. The cards themselves live in a horizontal
 * carousel (.carousel-track) inside this one vertically-scrolled section,
 * so "first card"/"last card" visibility depends on carousel PAN position,
 * not page scroll — the section itself is the only reliably
 * page-scroll-driven anchor. Functionally this still reads as "fades in as
 * the first card would be arriving, fades out as the last would be
 * leaving."
 */
(function () {
  'use strict';

  var bgEl = document.querySelector('.gradflow-page-bg--triggered');
  var postsSection = document.querySelector('.posts-tabs-section');
  if (!bgEl || !postsSection) return;

  var canvas = bgEl.querySelector('.gradflow-page-bg-canvas');
  var cards = Array.from(postsSection.querySelectorAll('.post-card'));
  if (!canvas || !cards.length) return;

  // ── Section visibility: fade the whole canvas in/out ────────────────────
  // A plain "any pixel on screen" IntersectionObserver (threshold 0, no
  // rootMargin) fired true from the very first frame here: the section
  // starts at ~720px down (short hero/intro above it), inside one 900px
  // viewport, so its top edge is already inside the viewport at scrollY 0
  // — correct per that literal rule, but reads as "always on," not a real
  // entrance. Scroll-driven instead: show once the section's top has
  // crossed meaningfully past the viewport's own midpoint (a real
  // "entering," not just a peeking edge), hide once its bottom has mostly
  // cleared the top. Recomputes window.innerHeight live each call rather
  // than caching it, so this can't go stale across a resize.
  var lastShown = null;
  // skipTransition: suppress the normal 0.4s fade (main.css) for one write,
  // used by the curtain-return/missed-crossing backfill below. On a
  // post→close return the canvas and its colours are already loaded from
  // before the visitor left, so easing them in just reads as "everything
  // else appears, then the background catches up a beat later".
  //
  // Three separate things all had to be right for this to actually work —
  // each one alone silently produced no visible change:
  //   1. `skipTransition === true` STRICTLY, not truthiness — this function
  //      is also a scroll listener, and the browser passes an Event as the
  //      first argument, so a truthy check makes EVERY scroll take the
  //      instant path and kills the fade everywhere.
  //   2. The `shown === lastShown` early-out has to let an instant call
  //      through: on a curtain return snapTo()'s native scroll event reaches
  //      the listener first, sets lastShown with the transition still live,
  //      and starts the fade — so by the time the backfill calls in there is
  //      no state change left and the fade proceeds regardless. An instant
  //      call re-applies even with no state change; it's idempotent (same
  //      opacity, transition suppressed) so its only effect is cutting a
  //      fade that's already mid-flight.
  //   3. The canvas must actually have a REAL FRAME in it. Making it opaque
  //      achieves nothing while it is unrendered (transparent), and is
  //      actively wrong while it holds the mount-time placeholder palette
  //      (index.hbs's pale colour1/2/3 — only a fallback for this triggered
  //      instance, whose colours always come from whichever card is in
  //      view). Both were measured on a curtain return: first a transparent
  //      canvas showing the page background, then a near-white 242,239,237
  //      frame, then the real colour. The gate below waits for the drawn
  //      frame; gradflow-background.js additionally skips its mount-time
  //      paint entirely for deferred-colour instances.
  function updateSectionVisibility(skipTransition) {
    var r = postsSection.getBoundingClientRect();
    var shown = r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.1;
    var instant = skipTransition === true;
    // Never reveal the canvas before a real card colour has been DRAWN into
    // it. "Drawn", not merely "set": uniform writes change nothing on screen
    // until a frame renders, and revealing between those two points shows
    // the previous (placeholder) frame — measured as a near-white 242,239,237
    // pixel on an already-opaque canvas during a curtain return. The handle's
    // hasDrawnRealColor flips inside setColors(), after its own render call,
    // so it is the only authoritative signal here (a local "applyCard ran"
    // flag is not: applyCard's colour may still be queued, undrawn).
    var handle = canvas.__gradflowHandle;
    var drawn = handle ? handle.hasDrawnRealColor === true : false;
    if (shown && !drawn) shown = false;
    if (shown === lastShown && !instant) return;
    lastShown = shown;
    if (instant) {
      bgEl.style.transition = 'none';
      bgEl.style.opacity = shown ? '1' : '0';
      // Force a style flush so `transition: none` is actually in effect for
      // the opacity write above before it's cleared below — without this all
      // three writes collapse into one recalc and the element keeps its
      // stylesheet transition, animating the change after all.
      void bgEl.offsetHeight;
      bgEl.style.transition = '';
    } else {
      bgEl.style.opacity = shown ? '1' : '0';
    }
  }
  // Wrapped, not passed directly: as a listener this receives an Event as
  // its first argument, which must not be read as skipTransition. Kept
  // wrapped even while the instant path is commented out — it costs
  // nothing and stops trap 1 above from silently reappearing.
  window.addEventListener('scroll', function () { updateSectionVisibility(); }, { passive: true });
  updateSectionVisibility();

  // Color extraction/tone/crossfade logic lives in gradflow-color-
  // crossfade.js (split out to stay under this file's own 200-line budget
  // — see that file's doc for why) — loaded just before this script in
  // default.hbs.
  var extractRgbs = window.GradflowColorCrossfade.extractRgbs;
  var tonesFrom = window.GradflowColorCrossfade.tonesFrom;
  var crossfadeTo = window.GradflowColorCrossfade.makeCrossfader(
    function () { return canvas.__gradflowHandle; },
    700
  );

  // ── Most-visible-card-wins color source (verbatim algorithm from
  // gradient-layer.js's cardObserver) ─────────────────────────────────────
  var cardRatios = new Map();
  var currentCardIndex = -1;

  function applyCard(index) {
    var rgbs = extractRgbs(cards[index].getAttribute('data-gradient-css') || '');
    if (!rgbs.length) return; // no color set on this card (yet, or ever) — keep showing whatever's current
    currentCardIndex = index;
    crossfadeTo(tonesFrom(rgbs));
    // Re-run the visibility check so a canvas held back by the gate is
    // released as soon as it has a real frame. Called unconditionally, not
    // just on the first applyCard: crossfadeTo QUEUES rather than applies
    // when the mount hasn't resolved (gradflow-color-crossfade.js), so the
    // first call here often leaves the gate still closed, and the flush that
    // finally draws happens later with no applyCard around it. releaseWhenDrawn
    // below covers that case; this covers the already-mounted one.
    updateSectionVisibility(true);
    releaseWhenDrawn();
  }

  // Poll briefly for the first drawn frame, then open the gate. Needed
  // because the moment a real colour is DRAWN is not necessarily inside any
  // call this file makes: when crossfadeTo queues a colour pre-mount, the
  // flush that eventually renders it happens on the crossfader's own timer.
  // Self-cancelling, and capped so it can't poll forever on a page where the
  // mount never resolves (prefers-reduced-motion skips it entirely).
  var releasePoll = 0;
  var releaseTries = 0;
  function releaseWhenDrawn() {
    // Direct callback first: gradflow-background.js invokes onFirstDraw
    // synchronously inside setColors(), immediately after its render call,
    // so the reveal lands on the SAME frame the colour is painted. The poll
    // below is only a fallback for a handle that mounted before this ran.
    var h0 = canvas.__gradflowHandle;
    if (h0) {
      if (h0.hasDrawnRealColor === true) { updateSectionVisibility(true); return; }
      if (typeof h0.onFirstDraw === 'function') {
        h0.onFirstDraw(function () { updateSectionVisibility(true); });
        return;
      }
    }
    if (releasePoll) return;
    releasePoll = setInterval(function () {
      var h = canvas.__gradflowHandle;
      if (h && typeof h.onFirstDraw === 'function' && h.hasDrawnRealColor !== true) {
        clearInterval(releasePoll);
        releasePoll = 0;
        h.onFirstDraw(function () { updateSectionVisibility(true); });
        return;
      }
      if (h && h.hasDrawnRealColor === true) {
        clearInterval(releasePoll);
        releasePoll = 0;
        updateSectionVisibility(true);
        return;
      }
      if (++releaseTries > 100) { clearInterval(releasePoll); releasePoll = 0; }
    }, 16);
  }

  var cardObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) { cardRatios.set(entry.target, entry.intersectionRatio); });

      var bestCard = null, maxRatio = 0;
      cardRatios.forEach(function (ratio, card) {
        if (ratio > maxRatio) { maxRatio = ratio; bestCard = card; }
      });

      if (bestCard && maxRatio > 0.1) {
        var index = cards.indexOf(bestCard);
        if (index !== currentCardIndex && index >= 0) applyCard(index);
      }
      // No else-hide: gaps between cards would flicker the colors — the
      // section-level observers above own visibility, this only ever
      // owns WHICH color while visible.
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] }
  );

  // Re-apply if a card's data-gradient-css arrives asynchronously (fetch in
  // posts-tabs-grid.js / post-and-cards.js can land after this script's
  // own init) and it's the card currently driving the display.
  var attrObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName !== 'data-gradient-css') return;
      var index = cards.indexOf(m.target);
      if (index === currentCardIndex) applyCard(index);
    });
  });
  cards.forEach(function (card) {
    attrObserver.observe(card, { attributes: true, attributeFilter: ['data-gradient-css'] });
  });

  // Observe cards after a short delay — mirrors gradient-layer.js's own
  // setTimeout, giving the async metadata fetch a head start so the very
  // first observed ratios already have real colors to read instead of
  // firing once with nothing, then again moments later once data lands.
  setTimeout(function () {
    cards.forEach(function (card) { cardObserver.observe(card); });

    // Force-initialize card 0's color immediately, same as gradient-layer.js
    // — otherwise nothing is displayed until the first ratio > 0.1 fires,
    // which can lag a beat behind the section fading in.
    applyCard(0);
  }, 500);

  // ── Curtain-return backfill ──────────────────────────────────────────────
  // A curtain return (post → close button → back to the homepage,
  // page-transition.js's runCurtainEntrance()) instant-jumps scrollY to
  // wherever the visitor was before opening the post — no gradual scroll,
  // so cardObserver above never sees the intersection-ratio CHANGES it's
  // built to react to. Reproduced live: land back on a card deep in the
  // list, and the background kept showing whatever applyCard(0)'s own
  // t=500ms bootstrap had set, not that card's colour — the exact same
  // "IntersectionObserver never fires for everything passed over" problem
  // LOADING.md §5 already documents and solves for card image/content
  // reveals (window.__revealBackfill / window.__cardContentRevealBackfill).
  // This is that same fix, extended to this system: runCurtainEntrance()
  // already calls both of those at several points after the jump — reads
  // the CURRENT geometry directly (getBoundingClientRect, synchronous, no
  // observer round-trip needed) rather than waiting on one, so it works
  // regardless of whether an observer callback happens to fire in between.
  function backfillMostVisibleCard() {
    // skipTransition: true — this function only runs to correct a MISSED
    // crossing (curtain-return jump, or the scroll-up safety net above),
    // never the primary path (the direct 'scroll' listener on
    // updateSectionVisibility still fades normally on every real scroll
    // frame). By the time this fires, the visibility change it's about to
    // apply should already have happened smoothly and didn't — catching up
    // instantly reads correct here, a delayed fade does not.
    updateSectionVisibility(true);
    var vh = window.innerHeight;
    var bestIndex = -1, bestRatio = 0;
    cards.forEach(function (card, i) {
      var r = card.getBoundingClientRect();
      var visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      var ratio = r.height > 0 ? visible / r.height : 0;
      if (ratio > bestRatio) { bestRatio = ratio; bestIndex = i; }
    });
    // Same de-dupe as cardObserver's own callback below — this runs
    // repeatedly (several fixed delays plus a ResizeObserver, matching
    // runCurtainEntrance()'s own multi-call pattern for the other two
    // backfills), and a re-apply of the SAME card would just restart its
    // crossfade from wherever it currently is for no visual benefit.
    if (bestIndex >= 0 && bestRatio > 0.1 && bestIndex !== currentCardIndex) applyCard(bestIndex);
    return bestIndex;
  }
  window.__gradflowBgBackfill = backfillMostVisibleCard;

  // Re-derive tones on theme change — color3 (tonesFrom, gradflow-color-
  // crossfade.js) is the page's live --color-background, so a toggle mid-
  // display otherwise leaves it showing the PREVIOUS theme's background
  // until the next card-visibility change happens to fire, which could be
  // a long scroll away. theme.js dispatches this event on every toggle
  // (see setTheme there); re-running applyCard re-reads the same card's
  // data-gradient-css (color1/color2 unchanged) but tonesFrom picks up the
  // fresh background — and since crossfadeTo already has a "displayed"
  // value by this point, it tweens smoothly rather than snapping, same as
  // any other color change here. No-ops if no card has ever been applied
  // yet (currentCardIndex still -1 — nothing to re-derive from).
  window.addEventListener('themechange', function () {
    if (currentCardIndex >= 0) applyCard(currentCardIndex);
  });

  // ── bfcache restore (browser back button) ────────────────────────────────
  // A back-button return is NOT a fresh load: the page comes back out of
  // bfcache with this whole script's state frozen exactly as it was when the
  // visitor navigated away (lastShown, currentCardIndex, the canvas's live
  // uniforms), and none of the init path above re-runs. Nothing re-evaluates
  // the canvas against the scroll position actually restored, so it can come
  // back showing a different card's colour — or visible when it should not
  // be — which reads as "the gradflow has a different setup than on a
  // curtain return, taking more of the colour across the whole page".
  // Same defensive-reset pattern as page-transition.js's own pageshow
  // handler (see its "bfcache restore" block). Deferred one frame: on a
  // bfcache restore, scroll position is applied by the browser around this
  // event, so reading geometry synchronously here can sample the pre-restore
  // position. Reset lastShown first so the visibility check below can't be
  // swallowed by its own no-change early-out.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    requestAnimationFrame(function () {
      lastShown = null;
      // currentCardIndex too: backfillMostVisibleCard()'s own de-dupe skips
      // applyCard() when the winning card is the one already recorded as
      // applied — but after a bfcache restore that record describes the
      // pre-navigation state, and the canvas's actual colours may not match
      // it. Clearing forces a genuine re-apply rather than trusting stale
      // bookkeeping.
      currentCardIndex = -1;
      backfillMostVisibleCard();
    });
  });
})();
