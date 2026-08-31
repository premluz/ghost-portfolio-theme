/**
 * LOGOS SCROLL
 * Infinite scrolling logos with entrance animation
 * Uses GSAP for smooth animation and seamless looping
 *
 * Marquee is CONDITIONAL: the CSS animation only runs when the real
 * (non-duplicated) logos actually overflow their container. When they
 * already fit — a narrow logo set, or a very wide viewport — scrolling
 * has nothing to accomplish but motion for its own sake, so this measures
 * on load/resize and adds/removes 'is-static' to switch it off, hiding the
 * duplicate set that only exists to hide the marquee's own seam.
 * logos-scroll.hbs's own noScroll="true" param forces this state from the
 * template instead (skips measurement entirely) — see that file's doc.
 */

function initLogosScroll() {
  const section = document.getElementById('logos-scroll');
  if (!section) {
    console.log('[logos-scroll] Section not found');
    return;
  }

  const container = section.querySelector('.logos-scroll-container');
  if (!container) {
    console.warn('[logos-scroll] Container not found');
    return;
  }

  // Show section immediately — only logo images start hidden (opacity: 0 in CSS)
  section.classList.add('is-ready');

  // noScroll="true" (logos-scroll.hbs) already applied .is-static
  // server-side and omitted the duplicate set entirely — nothing left to
  // measure, and no duplicates exist to hide.
  const templateForcedStatic = section.classList.contains('is-static');

  // Real logos only — .logo-item[data-logo-duplicate] is the second copy
  // that exists purely to hide the marquee's seam, and must be excluded
  // from the "does it fit" measurement or the answer would always be
  // "no, because there are two copies of everything".
  const originals = Array.from(container.querySelectorAll('.logo-item:not([data-logo-duplicate])'));
  const duplicates = Array.from(container.querySelectorAll('.logo-item[data-logo-duplicate]'));

  function measureAndToggle() {
    if (templateForcedStatic) return;
    if (!originals.length) return;

    // Sum each item's own layout width + the container's gap, rather than
    // reading the container's scrollWidth directly — scrollWidth already
    // includes the duplicate set (still in the DOM even while 'is-static'
    // hides it via CSS, per this file's own doc above), which would bias
    // the measurement toward "always overflows".
    const gapPx = parseFloat(getComputedStyle(container).columnGap || getComputedStyle(container).gap) || 0;
    const contentWidth = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
      + gapPx * Math.max(0, originals.length - 1);
    const availableWidth = container.getBoundingClientRect().width;

    // Fits (or duplicates already hidden from a prior pass) -> static.
    // Small tolerance (1px) against sub-pixel layout rounding causing a
    // spurious marquee for content that visually just fits.
    const fits = contentWidth <= availableWidth + 1;
    section.classList.toggle('is-static', fits);
  }

  // Duplicates are only ever relevant to the marquee's own seam-hiding —
  // once 'is-static' is decided, hide them outright via CSS (logos-scroll.css)
  // rather than removing them from the DOM, so a later resize back to
  // "overflows" can simply re-show what is already there.
  measureAndToggle();

  // Logos are images (async width once loaded) and the viewport can be
  // resized — both change whether the content fits. Re-measure on both;
  // debounced via rAF so a drag-resize doesn't thrash layout every pixel.
  let rafId = null;
  const scheduleMeasure = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      measureAndToggle();
    });
  };
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  originals.forEach((item) => {
    const img = item.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', scheduleMeasure, { once: true });
  });

  if (typeof gsap === 'undefined') {
    console.warn('[logos-scroll] GSAP not loaded');
    return;
  }

  // CSS marquee animation handles the scrolling itself — nothing more
  // needed here beyond the fit/no-fit toggle above.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogosScroll);
} else {
  initLogosScroll();
}
