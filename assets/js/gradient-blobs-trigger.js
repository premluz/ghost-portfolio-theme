/**
 * GRADIENT BLOBS TRIGGER
 * Fades window.pageGradientBlobs (default.hbs) in/out around
 * .posts-tabs-section, and swaps its colors to match whichever post-card
 * is currently most visible. Independent of gradient-layer.js (same
 * section, same per-card color source) — that file owns #page-gradient's
 * own crossfade divs and is untouched by this.
 *
 * Same loading pattern as gradient-layer.js: included site-wide
 * (default.hbs), no-ops here if this page has neither the API nor the
 * section. A future trigger for a different section is just another
 * small file like this one, not a change to this one.
 */
(function () {
  'use strict';

  var postsSection = document.querySelector('.posts-tabs-section');
  var blobs = window.pageGradientBlobs;
  if (!postsSection || !blobs) return;

  // Single observer, threshold 0, no rootMargin skew: intersecting means
  // any part of the section is on screen, in either scroll direction —
  // covers "scrolling down into it" (show), "scrolling down out the
  // bottom" (hide), "scrolling back up into it" (show), and "scrolling up
  // out the top, back toward hero" (hide) with one rule instead of
  // gradient-layer.js's two asymmetric observers.
  var sectionObserver = new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting) blobs.show();
      else blobs.hide();
    },
    { threshold: 0 }
  );
  sectionObserver.observe(postsSection);

  var allCards = document.querySelectorAll('.post-card');
  if (!allCards.length) return;
  var allCardsArray = Array.from(allCards);

  // Cards only carry ONE color each (data-gradient-css, same attribute
  // gradient-layer.js reads) — not a 3-color set. Feeding that single
  // color into all three --aura-1/2/3 slots still gets the soft
  // multi-gradient blend from the radial-gradient stack (main.css), just
  // monochrome per card rather than 3 distinct tones; the hue shift as
  // you scroll between cards is what actually reads as "changing color".
  function extractHex(gradientCss) {
    var m = gradientCss && gradientCss.match(/#[0-9a-f]{6}([0-9a-f]{2})?/i);
    return m ? m[0] : null;
  }

  var cardRatios = new Map();
  var currentCardIndex = -1;

  var cardObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        cardRatios.set(entry.target, entry.intersectionRatio);
      });

      var bestCard = null;
      var maxRatio = 0;
      cardRatios.forEach(function (ratio, card) {
        if (ratio > maxRatio) {
          maxRatio = ratio;
          bestCard = card;
        }
      });

      if (!bestCard || maxRatio <= 0.1) return;
      var cardIndex = allCardsArray.indexOf(bestCard);
      if (cardIndex === currentCardIndex || cardIndex < 0) return;

      // Re-read live: data-gradient-css can be set async after this
      // observer starts (posts-tabs-grid.js's own metadata fetch).
      var hex = extractHex(bestCard.getAttribute('data-gradient-css'));
      if (hex) blobs.setColors([hex, hex, hex]);
      currentCardIndex = cardIndex;
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] }
  );

  setTimeout(function () {
    allCards.forEach(function (card) { cardObserver.observe(card); });
  }, 500); // same delay gradient-layer.js uses, for the same reason —
           // lets the async metadata fetch populate data-gradient-css first.
})();
