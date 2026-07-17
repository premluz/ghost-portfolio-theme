/**
 * PAGE TRANSITION
 * Opt-in via data-transition attribute on any <a> tag.
 *
 * Sequence on click (exit):
 *  1. <main> slides up + fades out (accelerated ease)
 *  1b. Dark scrim fades in fast, dimming the page immediately
 *  2. Overlay slides up from bottom, scales up → scales down while moving up
 *  3. Navigation fires
 *
 * Sequence on landing (work/about/contact pages):
 *  1. <main> starts off-screen bottom
 *  2. Animates up + fades in to center position
 */
(function () {
  'use strict';

  if (typeof gsap === 'undefined') return;

  // ── Scrim element ──────────────────────────────────────────────────────────
  // Fast-fading dark shade that dims the outgoing page immediately, before
  // the panel (below) has risen far enough to cover it. Sits under the
  // panel (z-index 9998 vs 9999) so the panel simply paints over it once it
  // arrives — the scrim is only ever visible in the brief window at the
  // start of the exit.
  const scrim = document.createElement('div');
  scrim.id = 'pt-scrim';
  Object.assign(scrim.style, {
    position:      'fixed',
    inset:         '0',
    width:         '100%',
    height:        '100%',
    background:    'var(--color-background)',
    zIndex:        '9998',
    pointerEvents: 'none',
    opacity:       '0',
    willChange:    'opacity',
  });
  document.body.appendChild(scrim);

  // ── Overlay element ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'pt-overlay';
  Object.assign(overlay.style, {
    position:        'fixed',
    inset:           '0',
    width:           '100%',
    height:          '120%',
    opacity:         '1',
    background:      'var(--color-background, #0a0a0a)',
    borderRadius:    '40px 40px 0 0',
    transformOrigin: 'center bottom',
    zIndex:          '9999',
    pointerEvents:   'none',
    willChange:      'transform',
  });
  document.body.appendChild(overlay);

  // Hidden off-screen below viewport, scaled down to 50%, with strong blur
  gsap.set(overlay, { yPercent: 120, scale: 1, opacity: 0, borderRadius: '140px 140px 0 0', filter: 'blur(40px)' });

  // ── Animation ─────────────────────────────────────────────────────────────
  let animating = false;

  function runTransition(href) {
    if (animating) return;
    animating = true;

    const pageContent = document.querySelector('main');

    const tl = gsap.timeline({
      onComplete: () => {
        window.location.href = href;
      },
    });

    // 1. Current page: slide up + fade out
    if (pageContent) {
      tl.to(pageContent, {
        y:        -150,
        opacity:  50,
        duration: 0.2,
        ease:     'power1.in',
      }, 0);
    }

    // 1b. Scrim: dark fade-in, dims the page while the panel is still
    // rising below the fold. Accelerating ease (power2.in) — starts slow,
    // speeds up into the panel's arrival.
    tl.to(scrim, {
      opacity:  0.9,
      duration: 0.2,
      ease:     'power2.in',
    }, 0);

    // 2. Overlay: slide up from bottom, scale up 0.5x → 1x
    tl.to(
      overlay,
      {
        yPercent:     0,
        scale:        2,
        borderRadius: '40px 40px 0 0',
        duration:     0.2,
        ease:         'power1.out',
      },
      0.03
    );
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-transition]');
    if (!link) return;

    const href = link.href;
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

    // Let modifier-key clicks (new tab etc.) pass through
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // External links: let them open normally
    if (link.target === '_blank') return;

    e.preventDefault();
    runTransition(href);
  });

  // ── bfcache restore (back button) ───────────────────────────────────────
  // Without this, a page restored from bfcache mid-transition can come back
  // with <main> still blurred/offset and the overlay stuck mid-rise. See
  // docs/page-transitions.md "Back-button / bfcache" section.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    animating = false;
    gsap.set(overlay, { yPercent: 40, height: '100%', scale: 1.4, opacity: 0, borderRadius: '40px 40px 0 0', filter: 'blur(20px)' });
    gsap.set(scrim, { opacity: 0 });
    const main = document.querySelector('main');
    if (main) gsap.set(main, { y: 0, opacity: 1, filter: 'none' });
  });

  // ── Landing animation: slide up + fade in on page load ────────────────────
  function runLandingAnimation() {
    const pageId = document.body.getAttribute('data-page-id');
    const landingPages = ['work', 'about', 'contact']; // Page slugs that get landing animation

    const main = document.querySelector('main');
    if (!main) return;

    // Check if current page should have landing animation
    // Look for class on body, section, or in data-page-id
    const shouldAnimate = landingPages.some(page => {
      const hasBodyClass = document.body.classList.contains(`page-${page}`);
      const hasPageClass = document.querySelector(`.page-${page}`) !== null;
      const hasPageId = pageId && pageId.includes(page);
      return hasBodyClass || hasPageClass || hasPageId;
    });

    if (shouldAnimate) {
      // Set initial state: off-screen bottom + invisible
      gsap.set(main, { y: 200, opacity: 0 });

      // Animate in from bottom with fade. clearProps: 'transform' matters
      // here — GSAP always writes an inline `transform` for `y`, even at
      // y:0 (leaves `matrix(1,0,0,1,0,0)`, not none), and ANY non-none
      // transform on an ancestor — identity or not — creates a new
      // containing block for position:fixed descendants. Left uncleared,
      // this silently broke position:fixed for anything nested inside
      // <main> on work/about/contact (found via a fixed-position gradient
      // canvas sizing itself to the full page instead of the viewport).
      gsap.to(main, {
        y: 0,
        opacity: 1,
        duration: 0.2,
        ease: 'power1.out',
        delay: 0,
        clearProps: 'transform',
      });
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLandingAnimation);
  } else {
    runLandingAnimation();
  }

})();
