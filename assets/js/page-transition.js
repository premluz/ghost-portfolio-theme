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

    // 1. Current page: slide down + fade out
    if (pageContent) {
      tl.to(pageContent, {
        y:        0,
        opacity:  0,
        duration: 0.02,
        ease:     'power1.in',
      }, 0);
    }

    // 1b. Scrim: dark fade-in, dims the page while the panel is still
    // rising below the fold. Accelerating ease (power2.in) — starts slow,
    // speeds up into the panel's arrival.
    tl.to(scrim, {
      opacity:  0.9,
      duration: 0.02,
      ease:     'power2.in',
    }, 0);

    // 2. Overlay: slide up from bottom, scale up 0.5x → 1x
    tl.to(
      overlay,
      {
        yPercent:     0,
        scale:        2,
        borderRadius: '40px 40px 0 0',
        duration:     0.01,
        ease:         'power1.out',
      },
      0.03
    );
  }

  // Hints the browser to start fetching the destination HTML now, in the
  // background, while the exit animation below is still playing — the real
  // navigation (window.location.href, at the animation's onComplete) still
  // has to wait for the animation, but the network+parse work it kicks off
  // doesn't have to wait for THAT too. Same-tab, same-origin, so a plain
  // <link rel="prefetch"> is enough; failures (unsupported browser, etc.)
  // just mean no head start, never a broken transition.
  function prefetchHref(href) {
    try {
      if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    } catch (err) {}
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

    // Destination is already known synchronously (origin.url, from
    // closePost()) — no reason to wait for the animation to finish before
    // starting to warm it up.
    prefetchHref(href);
    try { sessionStorage.setItem('curtainReturn', '1'); } catch (err) {}

    const pageContent = document.querySelector('main');

    const tl = gsap.timeline({
      onComplete: () => {
        window.location.href = href;
      },
    });

    // Durations halved (0.15/0.3 → 0.08/0.18) per explicit "speed it up"
    // request — scrim stays the longer of the two so it's still fully
    // opaque (covering the page) by the time main's slide/fade finishes,
    // same relationship as before, just compressed.
    if (pageContent) {
      tl.to(pageContent, { y: 40, opacity: 0, duration: 0.2, ease: 'power2.in' }, 0);
    }
    tl.to(scrim, { opacity: 1, duration: 0.2, ease: 'power2.in' }, 0);
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
    console.log('[curtain-return] isCurtainReturn:', isCurtainReturn);
    if (!isCurtainReturn) return false;
    try { sessionStorage.removeItem('curtainReturn'); } catch (err) {}

    // The head pre-hide (html.main-pending for work/about/contact/post,
    // default.hbs) fires on ANY same-origin arrival, including this curtain
    // return, since the referrer is the post page. But the branch that
    // normally removes it (runLandingAnimation()) never runs on the curtain
    // path (this function returning true short-circuits it), so the class
    // used to sit until its 2.5s failsafe — main-pending's opacity:0
    // !important fully masked this function's own GSAP fade for that
    // entire window, then popped visible all at once when the failsafe
    // finally stripped it. The curtain entrance has its own scrim/main
    // choreography; drop this veil the moment this path takes ownership.
    // html.landing-pending is the same story for the homepage: it's set on
    // ANY same-site arrival at '/', and a curtain return from a post is one
    // — but it's only ever removed by runLandingAnimation(), which this
    // function short-circuits (runEntranceAnimation: `if
    // (!runCurtainEntrance()) runLandingAnimation()`). Left alone it sat
    // until its own 2.5s failsafe with .home at opacity:0 !important,
    // hiding every post card behind it. This path owns the entrance and
    // runs its own fade below, so both veils drop here together.
    document.documentElement.classList.remove('main-pending');
    document.documentElement.classList.remove('landing-pending');

    let origin = null;
    try { origin = JSON.parse(sessionStorage.getItem('postOrigin') || 'null'); } catch (err) {}
    try { sessionStorage.removeItem('postOrigin'); } catch (err) {}
    console.log('[curtain-return] origin:', origin);

    const main = document.querySelector('main');

    gsap.set(scrim, { opacity: 1 });
    if (main) gsap.set(main, { opacity: 0, y: 0 });

    if (origin && typeof origin.scrollY === 'number') {
      const targetY = origin.scrollY;

      // Instant jump, not an animated scroll-through — a curtain return is a
      // dismissal back to where you were, not a navigation anywhere new; a
      // visible smooth-scroll here read as an unwanted second animation on
      // top of the curtain fade. An earlier version animated this jump
      // specifically to make card-scroll-reveal.js's IntersectionObservers
      // fire for everything passed over, but that turned out unreliable on
      // its own (see BACKFILL GUARDRAIL below, which now does that job for
      // real, independent of how the scroll gets there) — safe to snap.
      // behavior: 'instant', not 'auto' — html has scroll-behavior: smooth
      // (main.css) globally, and per spec 'auto' means "defer to the
      // scrolling box's CSS scroll-behavior", not "force instant"; it still
      // animated. Only 'instant' actually overrides the CSS and jumps.
      const snapTo = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      snapTo(targetY);

      // BACKFILL GUARDRAIL: force-reveal everything at/above the restored
      // viewport via the registry that card-scroll-reveal.js exposes, at
      // several points (idempotent, cheap) — right after the jump, after
      // init settles, and as a final sweep-up. Optional-chained: pages
      // without the reveal system, or loads where it initializes late, are
      // covered by the later calls.
      const backfill = () => {
        let revealCount = null;
        let contentCount = null;
        try { revealCount = window.__revealBackfill ? window.__revealBackfill() : 'MISSING'; } catch (e) { revealCount = 'ERROR: ' + e.message; }
        try { contentCount = window.__cardContentRevealBackfill ? window.__cardContentRevealBackfill() : 'MISSING'; } catch (e) { contentCount = 'ERROR: ' + e.message; }
        console.log('[curtain-return] backfill @', Math.round(performance.now()), 'revealCount:', revealCount, 'contentCount:', contentCount, 'scrollY:', window.scrollY);
      };
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

    // Drop the curtain-restoring veil now that the scroll restore above has
    // actually happened. That veil (html.curtain-restoring, default.hbs
    // head) hides BOTH the particle layer and .home, to mask the window
    // between first paint and this function's instant scroll jump — a
    // mid-page return would otherwise paint at scroll-top (hero visible)
    // for a frame first. The snapTo above IS "the restore has settled", so
    // this is the correct moment; it previously waited on the first
    // non-'hero' __particleApply call instead, which DEADLOCKED on a
    // restore landing inside the hero: there only 'hero' applies fire, and
    // that key's guard returns early precisely BECAUSE the veil is up
    // (`if (veiled || ...) return;` before the remove), so nothing ever
    // cleared it and .home sat at opacity:0 for the full 8s failsafe —
    // measured 8122ms, the reported "nothing, then everything pops in".
    // Cleared unconditionally (not just in the origin.scrollY branch): with
    // no stored origin there's no restore to mask in the first place.
    document.documentElement.classList.remove('curtain-restoring');

    // <main> pops to fully visible instantly, UNDER the still-opaque scrim
    // — not animated in step with the scrim fade below. The two used to run
    // as simultaneous 0.1s tweens, which meant the scrim was dissolving away
    // while main (and its cards, still resolving their own metadata-gated
    // reveals) was mid-fade — you'd see the page's still-loading state
    // bleed through the curtain instead of a settled page appearing all at
    // once. Card image/video reveals are themselves instant on this path
    // now too (see IS_CURTAIN_RETURN in post-and-cards.js), so by the time
    // the scrim starts lifting a beat later, there's an already-complete
    // page underneath it — one clean reveal instead of two overlapping ones.
    if (main) gsap.set(main, { opacity: 1, clearProps: 'transform' });
    const tl = gsap.timeline();
    tl.to(scrim, { opacity: 0, duration: 0.12, ease: 'power1.out' }, 0.06);

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
    //
    // EXCEPTION: post-navigation.hbs's prev/next project links (rel="prev"/
    // "next") are lateral moves BETWEEN posts, not a fresh entry point —
    // overwriting postOrigin here would make Close return to whichever post
    // you arrived from instead of the listing page you originally opened a
    // post from. Skipping the write (not skipping the transition) means
    // whatever postOrigin already holds — set by the ORIGINAL click from
    // the listing page — survives any number of prev/next hops untouched.
    const isProjectNav = link.rel === 'next' || link.rel === 'prev';
    if (isProjectNav) {
      // Landing page already has the collapsed post-nav pill (we're going
      // FROM one post TO another) — default.hbs's head script reads this
      // to skip the collapse animation, rendering already-collapsed from
      // the first frame instead of animating into it.
      try { sessionStorage.setItem('navPrevNextHop', '1'); } catch (err) {}
    } else {
      try { sessionStorage.removeItem('navPrevNextHop'); } catch (err) {}
      try {
        sessionStorage.setItem('postOrigin', JSON.stringify({
          url: window.location.href,
          scrollY: window.scrollY,
        }));
      } catch (err) {}
    }

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
      // Drop the head pre-hide (html.landing-pending, default.hbs) the
      // instant this takes over — same tick as the gsap.set below, so
      // there's never a gap where neither CSS nor GSAP is holding it. Same
      // pattern as the non-home branch's html.main-pending removal further
      // down this function.
      document.documentElement.classList.remove('landing-pending');
      // Slide entrance, same y-values as the non-home branch's <main>
      // entrance below (Work/About/Contact: y:20->0, duration 0.2, ease
      // power1.out) — was y:100 here (a stale mismatch; the comment that
      // used to justify it as "matching About exactly" hadn't matched in a
      // while). Split across two elements rather than animating .home
      // directly: .home must never get a transform (it would become the
      // containing block for every position:fixed element inside it, the
      // hero included, and skew the pinned sections' ScrollTrigger
      // measurements — confirmed earlier: "would be because section is
      // pinned?" — yes). So .home only ever gets the opacity fade, and the
      // y-slide goes on .hero instead — itself position:fixed, so its own
      // transform doesn't create that containing-block problem.
      // Opacity fade removed — .home is fully visible immediately, no
      // fade-in tween. The hero's own y-slide is a slide, not a fade;
      // left as-is per "remove fade in", not "remove entrance motion".
      const heroEl = document.querySelector('.hero');
      gsap.set(homeEl, { opacity: 1 });
      if (heroEl) gsap.set(heroEl, { y: 200 });
      if (heroEl) {
        gsap.to(heroEl, {
          y: 0,
          duration: 0.2,
          ease: 'power1.out',
          clearProps: 'transform',
        });
      }
      // Posts tabs section: same slide-up treatment (y:20->0, duration 0.2,
      // ease power1.out) as .about-projects gets on the Work page — that
      // section has no animation of its own there, it just rides along
      // with <main>'s slide (see the non-home branch below); this is the
      // equivalent for the homepage, where .home itself can't carry the
      // transform that <main> does elsewhere.
      const postsTabsSection = document.querySelector('.posts-tabs-section');
      if (postsTabsSection) {
        gsap.set(postsTabsSection, { y: 120 });
        gsap.to(postsTabsSection, {
          y: 0,
          duration: 0.8,
          ease: 'power1.out',
          clearProps: 'transform',
        });
      }
      // Scrim: this path never sets it, so it should already sit at its
      // default opacity:0 (harmless) — but force-clear it too, in case a
      // previous exit's tween got interrupted (bfcache-adjacent edge case,
      // page-transition.js's own pageshow handler is the only other place
      // that resets this) and left it visibly dimming the page underneath
      // the entrance.
      gsap.set(scrim, { opacity: 0 });
      console.log('[landing-anim/home] entrance animating');
      return;
    }

    const pageId = document.body.getAttribute('data-page-id');
    const landingPages = ['work', 'about', 'contact']; // Page slugs that get landing animation

    const main = document.querySelector('main');
    if (!main) return;

    // Drop the head pre-hide (html.main-pending, default.hbs) the instant
    // this takes over — same tick as the gsap.set below (or, for pages that
    // don't match shouldAnimate, with nothing else hiding <main> at all),
    // so there's never a gap where neither CSS nor GSAP is holding it.
    document.documentElement.classList.remove('main-pending');

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
      // Set initial state: off-screen bottom, fully visible (no fade —
      // opacity stays 1 throughout, only the slide animates).
      gsap.set(main, { y: 80, opacity: 1 });

      // Animate in from bottom. clearProps: 'transform' matters here —
      // GSAP always writes an inline `transform` for `y`, even at y:0
      // (leaves `matrix(1,0,0,1,0,0)`, not none), and ANY non-none
      // transform on an ancestor — identity or not — creates a new
      // containing block for position:fixed descendants. Left uncleared,
      // this silently broke position:fixed for anything nested inside
      // <main> on work/about/contact (found via a fixed-position gradient
      // canvas sizing itself to the full page instead of the viewport).
      gsap.to(main, {
        y: 0,
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