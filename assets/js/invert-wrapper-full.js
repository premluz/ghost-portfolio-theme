(function() { 'use strict';

// FULL-BLEED .invert-wrapper — measures and corrects the horizontal
// breakout for .invert-wrapper--full instances (main.css). The CSS-only
// `margin: calc(-50vw + 50%)` technique used elsewhere (e.g.
// .post-hero-gradient-frame) only self-corrects an element's WIDTH; it
// assumes the element is horizontally CENTERED in the viewport. On a
// post page, .gh-content sits inside .post-layout's grid, which is not
// always centered (page padding, an optional side rail) — verified live:
// left edge landed at 237px instead of 0 on a real post. Pure vw math
// can't know about that offset, so this reads it directly instead.
//
// Sets --invert-wrapper-left-offset / --invert-wrapper-right-offset (this
// element's own live distance from each viewport edge, BEFORE the
// breakout margins apply) as inline custom properties; main.css's
// .invert-wrapper--full rule negates each into a margin that pulls that
// edge out to the true viewport edge. Kept as a SEPARATE small script
// (not folded into background-layer.js, whose job is the scroll-shift
// ramp, not layout geometry) so either can change independently.
//
// Must zero the properties BEFORE reading getBoundingClientRect(): once
// a previous measurement has set them, main.css's own rule is already
// applying a breakout margin from that stale value, so reading the rect
// without resetting first measures the ALREADY-SHIFTED box and compounds
// on every re-measure (confirmed live — repeated resizes walked the
// offset further off-viewport each time). Resetting to 0 first forces
// the box back to its natural, un-broken-out position for one accurate
// read, matching the value main.css's own var() fallback assumes.
function measure(el) {
  el.style.setProperty('--invert-wrapper-left-offset', '0px');
  el.style.setProperty('--invert-wrapper-right-offset', '0px');
  const rect = el.getBoundingClientRect();
  const rightOffset = window.innerWidth - rect.right;
  el.style.setProperty('--invert-wrapper-left-offset', rect.left + 'px');
  el.style.setProperty('--invert-wrapper-right-offset', rightOffset + 'px');
}

function initAll() {
  const els = document.querySelectorAll('.invert-wrapper--full');
  if (!els.length) return;

  let scheduled = false;
  const scheduleMeasure = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      els.forEach(measure);
    });
  };

  scheduleMeasure();
  window.addEventListener('resize', scheduleMeasure);

  // Catches layout shifts with no resize event (e.g. a fetch populating
  // content above the wrapper, font load reflow) — same reasoning as
  // background-layer.js's own ResizeObserver on <html>.
  const ro = new ResizeObserver(scheduleMeasure);
  ro.observe(document.documentElement);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll, { once: true });
} else {
  initAll();
}

})();
