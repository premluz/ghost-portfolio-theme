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

  console.log('[pt-debug] page-transition.js executing, readyState:', document.readyState, 'gsap:', typeof gsap);
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

  // ── Curtain transition (post close button) ─────────────────────────────────
  // No sliding #pt-overlay panel — the close button isn't going "forward"
  // anywhere, it's dismissing back to wherever the post was opened from, at
  // that same scroll position, so that panel's directional motion would
  // read wrong here. <main> instead slides DOWN + fades — the reverse of
  // runLandingAnimation()'s slide up + fade used to bring a post in (see
  // that function below) — while the scrim fades in underneath it.
  function runCurtainExit(href) {
    if (animating) return;
    animating = true;

    const pageContent = document.querySelector('main');

    const tl = gsap.timeline({
      onComplete: () => {
        // Read by runCurtainEntrance() on the landing page's DOMContentLoaded —
        // tells it to fade in from the scrim instead of running the normal
        // slide-up-from-bottom runLandingAnimation().
        try { sessionStorage.setItem('curtainReturn', '1'); } catch (err) {}
        window.location.href = href;
      },
    });

    if (pageContent) {
      tl.to(pageContent, { y: 200, opacity: 0, duration: 0.25, ease: 'power1.in' }, 0);
    }
    tl.to(scrim, { opacity: 1, duration: 0.3, ease: 'power2.in' }, 0);
  }

  // Shared by the close button click and the Escape key (below) — resolves
  // the stored origin and picks curtain-exit vs the homepage fallback.
  function closePost() {
    let origin = null;
    try { origin = JSON.parse(sessionStorage.getItem('postOrigin') || 'null'); } catch (err) {}
    if (origin && origin.url) {
      runCurtainExit(origin.url);
    } else {
      runTransition(window.location.origin + '/');
    }
  }

  // Reverse of the above — runs on the landing page instead of the normal
  // runLandingAnimation() slide-up when sessionStorage says this load is a
  // curtain return. Restores the saved scroll position BEFORE fading
  // anything in, so there's no visible scroll-to-top-then-jump flash.
  function runCurtainEntrance() {
    let isCurtainReturn = false;
    try { isCurtainReturn = sessionStorage.getItem('curtainReturn') === '1'; } catch (err) {}
    if (!isCurtainReturn) return false;
    try { sessionStorage.removeItem('curtainReturn'); } catch (err) {}

    // The head pre-hide (html.landing-pending, default.hbs) fires on ANY
    // same-origin arrival at '/' — including this curtain return, since
    // the referrer is the post page. But the landing branch (which
    // normally removes that class) never runs on the curtain path (this
    // function returning true short-circuits it), so the class used to
    // sit until its 2.5s failsafe — a blank page that then faded in late.
    // The curtain entrance has its own scrim/main choreography; drop the
    // veil the moment this path takes ownership.
    document.documentElement.classList.remove('landing-pending');

    let origin = null;
    try { origin = JSON.parse(sessionStorage.getItem('postOrigin') || 'null'); } catch (err) {}
    try { sessionStorage.removeItem('postOrigin'); } catch (err) {}

    const main = document.querySelector('main');

    gsap.set(scrim, { opacity: 1 });
    if (main) gsap.set(main, { opacity: 0, y: 0 });

    if (origin && typeof origin.scrollY === 'number') {
      const targetY = origin.scrollY;

      // A plain window.scrollTo() jump teleports straight to targetY,
      // skipping every intermediate scroll position — anything relying on
      // actually passing through the viewport to reveal itself (card-
      // scroll-reveal.js's IntersectionObservers, and any other scroll-
      // driven reveal on the page) never fires for elements above targetY,
      // since they never entered the observer's view this session. Faking
      // a real (fast) scroll through those intermediate positions instead
      // lets whatever reveal system exists — of any kind, not just cards —
      // fire exactly as it would on an ordinary scroll. Respects
      // prefers-reduced-motion: jump straight there instead.
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const snapTo = (y) => window.scrollTo(0, y);
      const scrollThrough = (y, duration = 350) => {
        if (prefersReducedMotion) { snapTo(y); return; }
        const startY = window.scrollY;
        const delta = y - startY;
        if (delta === 0) return;
        const startTime = performance.now();
        (function step(now) {
          const t = Math.min(1, (now - startTime) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          window.scrollTo(0, startY + delta * eased);
          if (t < 1) requestAnimationFrame(step);
        })(startTime);
      };

      scrollThrough(targetY);

      // BACKFILL GUARDRAIL: the sweep above is best-effort — homepage init
      // blocks painting for ~1s, so its rAF loop degenerates into a few
      // big scroll jumps and IntersectionObserver-based reveals miss most
      // elements (they only evaluate at frame boundaries). Force-reveal
      // everything at/above the restored viewport via the registry that
      // card-scroll-reveal.js exposes, at several points (idempotent,
      // cheap): right after the sweep, after init settles, and as a final
      // sweep-up. Optional-chained: pages without the reveal system, or
      // loads where it initializes late, are covered by the later calls.
      const backfill = () => { try { window.__revealBackfill && window.__revealBackfill(); } catch (e) {} };
      setTimeout(backfill, 450);
      setTimeout(backfill, 1200);
      setTimeout(backfill, 2500);

      // Keep correcting while the page's height is still settling — on the
      // homepage specifically, several things grow/shrink it AFTER this
      // point: initTestimonialsHorizontalScroll()'s pin:true ScrollTrigger
      // (main.js, created behind await waitForPreloader()), and the
      // deferred metadata fetches (initPostCardMetadata/initTestimonial
      // Metadata, requestIdleCallback/800ms-after-load) that inject real
      // card text later. A single fixed-timing re-check can't catch all of
      // these — a ResizeObserver on <body> reacts to whichever ones
      // actually happen, on any page template, without guessing timings.
      // These follow-up corrections are small deltas (page settling, not
      // the original jump) so a plain snap is fine — no need to re-run the
      // pass-through animation for them.
      let settleTimer = null;
      const stop = () => {
        clearTimeout(settleTimer);
        ro.disconnect();
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
        window.removeEventListener('keydown', stop);
      };
      const ro = new ResizeObserver(() => {
        snapTo(targetY);
        backfill(); // late layout growth can pull new elements above the fold
        clearTimeout(settleTimer);
        settleTimer = setTimeout(stop, 300);
      });
      ro.observe(document.body);
      settleTimer = setTimeout(stop, 300);
      window.addEventListener('wheel', stop, { once: true, passive: true });
      window.addEventListener('touchstart', stop, { once: true, passive: true });
      window.addEventListener('keydown', stop, { once: true });
      setTimeout(stop, 3000); // hard cap regardless
    }

    const tl = gsap.timeline();
    if (main) tl.to(main, { opacity: 1, duration: 0.3, ease: 'power1.out', clearProps: 'transform' }, 0);
    tl.to(scrim, { opacity: 0, duration: 0.3, ease: 'power1.out' }, 0);

    return true;
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    // Post-page close button — returns to wherever the post was opened from,
    // at the same scroll position (see runCurtainExit above). Falls back to
    // the homepage transition if there's no stored origin (direct link,
    // refresh, or a new tab — sessionStorage is per-tab).
    const closeBtn = e.target.closest('.nav-close-btn');
    if (closeBtn) {
      e.preventDefault();
      closePost();
      return;
    }

    const link = e.target.closest('a[data-transition]');
    if (!link) return;

    const href = link.href;
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

    // Let modifier-key clicks (new tab etc.) pass through
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // External links: let them open normally
    if (link.target === '_blank') return;

    e.preventDefault();

    // Remember where we're navigating FROM + the scroll offset, so if `href`
    // turns out to be a post, its close button can return here at the same
    // scroll position instead of just going to '/'. Harmless to store
    // unconditionally (cheap, and unused if the destination isn't a post).
    try {
      sessionStorage.setItem('postOrigin', JSON.stringify({
        url: window.location.href,
        scrollY: window.scrollY,
      }));
    } catch (err) {}

    runTransition(href);
  });

  // ── Escape key (post close button) ──────────────────────────────────────
  // Same dismissal as clicking .nav-close-btn (see closePost above).
  // Post-only (.nav-close-btn only exists in the DOM there — see
  // navigation.hbs's {{#is "post"}} guard), so this is a no-op elsewhere.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.querySelector('.nav-close-btn')) return;
    closePost();
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
    // Homepage: scoped to .home, not <main> — <main> also wraps #preloader
    // on index.hbs, and hiding it via y:200/opacity:0 would break the
    // preloader's own reveal sequence. Only runs on the same-site "skip
    // path" (preloader hides itself instantly, window.__preloaderSkipped —
    // see preloader.js) or when there's no preloader at all; a fresh full
    // preloader run already has its own entrance choreography (wordmark,
    // particle burst, hero blur/scale), so adding this on top would just
    // be a second, competing animation.
    const isHome = document.body.classList.contains('home') || document.querySelector('.home') !== null;
    console.log('[landing-anim/home] isHome:', isHome);
    if (isHome) {
      const hasPreloader = !!document.getElementById('preloader');
      console.log('[landing-anim/home] hasPreloader:', hasPreloader, '__preloaderSkipped:', window.__preloaderSkipped);
      if (hasPreloader && !window.__preloaderSkipped) {
        console.log('[landing-anim/home] SKIPPED — full preloader run owns the entrance');
        return;
      }
      const homeEl = document.querySelector('.home');
      if (!homeEl) {
        console.log('[landing-anim/home] SKIPPED — .home not found');
        return;
      }
      console.log('[landing-anim/home] RUNNING');
      // NO transform on .home — a transform there makes .home the
      // containing block for every position:fixed element inside it (the
      // hero!) and skews the pinned sections' ScrollTrigger measurements
      // ("would be because section is pinned?" — yes). The page-level
      // entrance is opacity-only; the slide-up lives on the hero's own
      // fixed container (.hero), where a transform affects nothing else.
      // Initial hidden state comes from html.landing-pending (set in the
      // head BEFORE first paint — a gsap.set here was measurably one
      // painted frame too late).
      const heroEl = document.querySelector('.hero');
      gsap.set(homeEl, { opacity: 0, transition: 'none' });
      if (heroEl) gsap.set(heroEl, { y: 120 });
      document.documentElement.classList.remove('landing-pending');
      let started = false;
      const startTween = () => {
        if (started) return;
        started = true;
        gsap.to(homeEl, {
          opacity: 1,
          duration: 0.35,
          ease: 'power2.out',
          // opacity NOT cleared: inline 1 equals the stylesheet value;
          // clearing it would re-arm the CSS opacity transition mid-handoff.
          clearProps: 'transition',
        });
        if (heroEl) gsap.to(heroEl, {
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          clearProps: 'transform',
          onComplete: () => console.log('[landing-anim/home] entrance complete'),
        });
      };
      // Start only once frames are demonstrably flowing (two consecutive
      // rAF deltas under 100ms) — homepage init blocks painting ~1s after
      // DOMContentLoaded, and a tween started blind finishes entirely
      // inside that frozen window (= perceived as an abrupt pop).
      let prevT = performance.now();
      let smooth = 0;
      const probe = (now) => {
        smooth = (now - prevT < 100) ? smooth + 1 : 0;
        prevT = now;
        if (smooth >= 2) startTween();
        else if (!started) requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
      // failsafe: never hold the page hidden longer than ~1.2s — beyond
      // that a deliberate entrance reads as a hang, and a slightly choppy
      // start is the lesser evil
      setTimeout(startTween, 1200);
      return;
    }

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
    })
    // Post pages get the same slide-up entrance — Ghost gives these
    // 'post-template' (not 'page-post', since a post isn't a custom page),
    // so it needs its own check rather than joining the landingPages list.
    || document.body.classList.contains('post-template');

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

  // Run on DOMContentLoaded or immediately if already loaded. A curtain
  // return (see runCurtainEntrance above) takes priority — it restores the
  // saved scroll position and runs its own scrim fade-in; running the
  // normal slide-up-from-bottom landing animation on top of that would
  // fight it (main would be forced back to y:200 mid-scroll).
  function runEntranceAnimation() {
    if (!runCurtainEntrance()) runLandingAnimation();
  }

  console.log('[pt-debug] about to wire up runEntranceAnimation, readyState:', document.readyState);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[pt-debug] DOMContentLoaded fired, calling runEntranceAnimation');
      runEntranceAnimation();
    });
  } else {
    console.log('[pt-debug] readyState not loading, calling runEntranceAnimation immediately');
    runEntranceAnimation();
  }

})();
