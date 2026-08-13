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
  function updateSectionVisibility() {
    var r = postsSection.getBoundingClientRect();
    var shown = r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.1;
    if (shown === lastShown) return;
    lastShown = shown;
    bgEl.style.opacity = shown ? '1' : '0';
  }
  window.addEventListener('scroll', updateSectionVisibility, { passive: true });
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
    updateSectionVisibility();
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
})();
