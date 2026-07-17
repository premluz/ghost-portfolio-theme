/**
 * HORIZ-SCROLL
 * Vertical page scroll drives horizontal item movement (scroll-pinning pattern).
 *
 * Usage: add [data-horiz-scroll] to the row container, or use [data-testimonials-layout="scroll"].
 *
 * How it works:
 *   1. The outer section gets extra height = total horizontal scroll distance.
 *   2. The row container becomes position:sticky so it stays in view while page scrolls.
 *   3. Vertical scroll progress through the section maps to horizontal translateX on the row.
 */

(function () {
  'use strict';

  function initHorizScroll() {
    const grids = document.querySelectorAll(
      '.testimonials-grid[data-testimonials-layout="scroll"]'
    );
    if (!grids.length) return;

    grids.forEach(function (grid, gridIndex) {
      var section = grid.closest('.testimonials-section');
      if (!section) return;

      var header = section.querySelector('.testimonials-header');
      var track = grid.querySelector('.testimonials-track');
      if (!track) return;

      var totalScrollWidth = 0;

      function setup() {
        var cards = track.querySelectorAll('.testimonial-card');
        if (!cards.length) return;

        var headerHeight = header ? header.offsetHeight : 0;
        // track.scrollWidth = full row width including all cards, gaps, padding
        var rowWidth = track.scrollWidth;
        totalScrollWidth = rowWidth - window.innerWidth;

        console.log('[horiz-scroll] cards:', cards.length, 'rowWidth:', rowWidth, 'innerWidth:', window.innerWidth, 'totalScrollWidth:', totalScrollWidth);

        if (totalScrollWidth <= 0) return;

        // Section tall enough to scroll through all cards
        section.style.height = (headerHeight + totalScrollWidth + window.innerHeight) + 'px';

        // Grid sticky below header — clips overflowing cards
        grid.style.top = headerHeight + 'px';
      }

      function onScroll() {
        if (totalScrollWidth <= 0) return;
        var sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
        var scrolled = window.pageYOffset - sectionTop;
        var progress = Math.max(0, Math.min(1, scrolled / totalScrollWidth));
        track.style.transform = 'translateX(' + (-progress * totalScrollWidth) + 'px)';
      }

      setup();
      onScroll();

      window.addEventListener('scroll', onScroll, { passive: true });

      var resizeTimer;
      var onHorizScrollResize = function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          setup();
          onScroll();
        }, 150);
      };
      // Unique id per grid — this runs inside a forEach over potentially
      // multiple .testimonials-grid instances; a shared id would let a
      // later grid's subscription silently replace an earlier one's.
      if (window.resizeManager) window.resizeManager.subscribe('horiz-scroll-' + gridIndex, onHorizScrollResize);
      else window.addEventListener('resize', onHorizScrollResize);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHorizScroll);
  } else {
    initHorizScroll();
  }
})();
