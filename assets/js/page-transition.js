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

  // ── Shared backfill dispatcher ──────────────────────────────────────────
  // Force-reveals anything stuck at its pre-reveal hidden state because the
  // IntersectionObserver driving it never saw a genuine crossing — either an
  // instant scroll jump skipped it between frames (curtain-return, below),
  // or the page simply loaded/landed already scrolled past the trigger
  // point with no scroll event to fire it at all. Covers every reveal
  // system that exposes a backfill registry: images/cards
  // (card-scroll-reveal.js), card text (post-and-cards.js), general
  // headings (heading-animations.js), and the homepage gradient background
  // (gradflow-page-bg-trigger.js, index.hbs only — absent elsewhere, hence
  // the ?. -equivalent guards). Optional-chained since scripts can init in
  // either order and not every page loads every one of these.
  window.__runAllBackfills = (maxDocY) => {
    let revealCount = null, contentCount = null, headingCount = null, gradflowIndex = null;
    try { revealCount = window.__revealBackfill ? window.__revealBackfill(maxDocY) : 'MISSING'; } catch (e) { revealCount = 'ERROR: ' + e.message; }
    try { contentCount = window.__cardContentRevealBackfill ? window.__cardContentRevealBackfill(maxDocY) : 'MISSING'; } catch (e) { contentCount = 'ERROR: ' + e.message; }
    try { headingCount = window.__headingRevealBackfill ? window.__headingRevealBackfill(maxDocY) : 'MISSING'; } catch (e) { headingCount = 'ERROR: ' + e.message; }
    try { gradflowIndex = window.__gradflowBgBackfill ? window.__gradflowBgBackfill(maxDocY) : 'MISSING'; } catch (e) { gradflowIndex = 'ERROR: ' + e.message; }
    console.log('[backfill]', Math.round(performance.now()), 'reveal:', revealCount, 'content:', contentCount, 'heading:', headingCount, 'gradflow:', gradflowIndex, 'scrollY:', window.scrollY);
  };

  // Load-settle: catches a plain load/refresh/same-site nav landing already
  // scrolled past a trigger point (browser scroll restoration, a same-page
  // hash link, anything that isn't the curtain-return path below, which
  // already runs its own copy of this). Same staggered timing rationale as
  // the curtain-return backfill: init order across scripts and deferred
  // metadata fetches aren't synchronous, so one pass can't catch everything.
  setTimeout(() => window.__runAllBackfills(), 450);
  setTimeout(() => window.__runAllBackfills(), 1200);
  setTimeout(() => window.__runAllBackfills(), 2500);

  // Scroll-up: catches the other half of the reported bug — scrolling UP
  // into an element whose observer crossing got skipped (e.g. a fast
  // upward flick can skip frames same as a programmatic jump). Throttled to
  // once per ~600ms of continued upward motion, not every scroll frame —
  // this is a safety net for missed crossings, not the primary reveal path.
  let lastScrollY = window.scrollY;
  let scrollBackfillTimer = null;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const scrollingUp = y < lastScrollY;
    lastScrollY = y;
    if (!scrollingUp || scrollBackfillTimer) return;
    scrollBackfillTimer = setTimeout(() => {
      scrollBackfillTimer = null;
      window.__runAllBackfills();
    }, 600);
  }, { passive: true });

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

  // ── Page-to-page loading bar ─────────────────────────────────────────────
  // Reuses the SAME Material indeterminate chase #preloader-progress-bar
  // uses on the homepage's first load (main.css ".progress-bar-track"
  // system) — .scroll-progress (default.hbs, every page) is the SAME
  // element that normally tracks real scroll position; armLoadingBar()
  // switches it into the chase for the duration of a navigation,
  // releaseLoadingBar() hands it back.
  //
  // The tricky part: this is a REAL browser navigation (window.location.href
  // in the timelines below), not a client-side route swap — the JS context
  // that calls armLoadingBar() is destroyed the moment navigation starts.
  // sessionStorage carries the bar's start timestamp across that boundary
  // (same pattern this file already uses for postOrigin/curtainReturn/
  // navPrevNextHop), so the INCOMING page can (a) show the chase immediately
  // — a small inline script right after .scroll-progress's own markup in
  // default.hbs reads this same key, before that page's first paint, so
  // there's no flash-off during the actual network gap — and (b) know how
  // long the chase has already been running when it's time to release it.
  function armLoadingBar() {
    try { sessionStorage.setItem('ptBarStart', String(Date.now())); } catch (err) {}
    const bar = document.querySelector('.scroll-progress');
    if (bar) bar.classList.add('is-loading');
  }

  // Called once, from the INCOMING page's own entrance point — the same
  // moment runLandingAnimation()/runCurtainEntrance() remove the
  // main-pending/landing-pending veils (below). Gated through
  // window.__barMinCycleRelease (preloader.js — loaded before this file on
  // every page, not just the homepage; see that file's own comment) so a
  // fast navigation can never cut the chase off before one full loop.
  function releaseLoadingBar() {
    const bar = document.querySelector('.scroll-progress');
    if (!bar) return;
    let startTime = null;
    try {
      const raw = sessionStorage.getItem('ptBarStart');
      if (raw) startTime = parseInt(raw, 10);
      sessionStorage.removeItem('ptBarStart');
    } catch (err) {}
    // No transition was in flight (fresh/direct load, or the flag was
    // never set) — nothing armed the chase, so there's nothing to release.
    // Still strip the classes defensively in case an interrupted/aborted
    // navigation left a stale one behind.
    if (!startTime || isNaN(startTime)) {
      bar.classList.remove('is-loading', 'is-complete');
      return;
    }
    const finish = () => {
      bar.classList.add('is-complete');
      // Hold until the exit slide has fully played (main.css
      // .progress-bar-track.is-complete → bar-exit-right, 0.55s) before
      // handing back to scroll-progress.js's normal JS-driven width
      // tracking. Stripping the classes any earlier cuts the slide/fade
      // off mid-flight and the bar vanishes instead of leaving.
      // ⚠ Keep in sync with bar-exit-right's animation-duration.
      setTimeout(() => {
        // ⚠ THE "GOES BACK RIGHT-TO-LEFT" BUG. .scroll-progress is also the
        // real scroll indicator, so its base rule is `width: 0%` with
        // `transition: width 0.1s linear` and a VISIBLE gradient
        // background. Removing .is-loading reverts width 100% → 0%, and
        // that transition animated the revert: a visible bar collapsing
        // right-to-left, immediately after the exit slide had correctly
        // travelled left-to-right. The streak keyframes were never at
        // fault, which is why they kept verifying clean.
        // CSS alone can't fix this (see .scroll-progress.is-loading in
        // main.css): once the class is gone the element stops matching any
        // loading-scoped rule, so the base transition is what applies.
        // Suppress it inline for exactly this one commit, force the style
        // to flush so the 0% lands untransitioned, then hand the
        // transition straight back for real scroll tracking.
        bar.style.transition = 'none';
        bar.classList.remove('is-loading', 'is-complete');
        void bar.offsetWidth;
        bar.style.transition = '';
      }, 600);
    };
    if (typeof window.__barMinCycleRelease === 'function') {
      window.__barMinCycleRelease(startTime, finish);
    } else {
      finish();
    }
  }

  function runTransition(href) {
    if (animating) return;
    animating = true;
    armLoadingBar();

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
    armLoadingBar();

    // Destination is already known synchronously (origin.url, from
    // closePost()) — no reason to wait for the animation to finish before
    // starting to warm it up.
    prefetchHref(href);
    try { sessionStorage.setItem('curtainReturn', '1'); } catch (err) {}

    const pageContent = document.querySelector('main');

    // NAV REVERSE — removing .nav-collapsing plays the collapse's CSS
    // transitions in reverse "for free" (main.css "POST PAGE NAV": the
    // base/no-class rules ARE the expanded state, already have their own
    // transitions declared, so un-setting the class naturally animates
    // back — verified in isolation, ~0.4s to fully settle: close/prev/
    // next snap invisible instantly (display:none, mirroring how they
    // snapped visible on the way in), Home/Profile/Contact/theme-toggle
    // reappear instantly, and the pane's width tweens from
    // --nav-collapsed-w back to --nav-expanded-w). The nav sits ABOVE the
    // scrim (z-index 10001 vs 9998), so this stays visible throughout —
    // not something the scrim conveniently covers — hence extending the
    // timeline below to let it actually finish before navigating.
    document.body.classList.remove('nav-collapsing');

    const tl = gsap.timeline({
      onComplete: () => {
        window.location.href = href;
      },
    });

    // scrim/main keep their existing fast 0.2s pace (an earlier explicit
    // "speed it up" request) — only the timeline's OVERALL duration is
    // extended, via this placeholder tween, so onComplete (and the actual
    // navigation) waits for the nav's CSS width transition above to
    // finish too. 0.42s: the reverse's own measured settle time (~0.4s)
    // plus a small buffer — CSS transitions aren't tracked by GSAP's
    // timeline duration on their own, so without this the page would
    // navigate away at 0.2s, mid-expand.
    tl.to({}, { duration: 0.42 }, 0);

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
    releaseLoadingBar();

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
      // viewport via window.__runAllBackfills (shared dispatcher, defined
      // at the top of this file — also drives plain-load-settle and
      // scroll-up backfills), at several points (idempotent, cheap) — right
      // after the jump, after init settles, and as a final sweep-up.
      const backfill = () => window.__runAllBackfills();
      // Synchronous call FIRST, not just the setTimeout(…, 450) below.
      // window.__gradflowBgBackfill (one of the dispatchers __runAllBackfills
      // calls — gradflow-page-bg-trigger.js) both flips the homepage's
      // triggered gradflow canvas to visible AND sets its colour from
      // whichever card is now most visible, based on live geometry — but
      // until this fires even once, the canvas is showing initGradFlowBackground()'s
      // PARTIAL DEFAULTS (index.hbs's own color1/2/3 Handlebars params —
      // pastel pink/near-white, meant only as this canvas's very-first-paint
      // placeholder before any card is known). Visibility is driven
      // separately by scroll position (updateSectionVisibility(), same
      // file) and flips to opaque the instant scrollY lands past the
      // posts-tabs section — which on a curtain return happens immediately
      // via snapTo() above, well before the 450ms timer's first colour
      // backfill. Reported live as "background is white for a moment even
      // though the theme is dark" on a homepage curtain return landing past
      // that section: the canvas becomes visible immediately, painted in
      // its pastel defaults, and only gets today's actual card colour once
      // the first backfill finally runs — confirmed via a frame-by-frame
      // getComputedStyle poll (gradflowOpacity climbing 0→1 while the
      // scrim lifts, well under the 450ms mark). Calling here closes that
      // gap instead of just shrinking it.
      backfill();
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
    // Commit the particle layer's hidden state INLINE before dropping the
    // veil below. html.curtain-restoring's `opacity: 0 !important` (main.css)
    // is the only thing holding that layer hidden right now — the element's
    // own inline style still says opacity:1 (particle-morph.hbs), so removing
    // the class hands it straight back to full opacity. The scenario trigger
    // that would legitimately hide it can't cover the gap: the particle
    // system boots through a 100ms-interval retry chain (particle-morph.hbs)
    // and typically doesn't exist yet at this point, so the resync below
    // silently no-ops on its `if (__loop)` guard and the real hide lands
    // ~660ms in — measured as particles sitting at full opacity over the
    // page, then vanishing. Writing opacity:0 here (transition:none, so it
    // cannot animate) makes the hidden state survive the veil removal
    // regardless of when the system finishes booting.
    // Only when this restore is actually mid-page: __particleLayerHidden is
    // set by the same head guard that added the veil, under exactly that
    // condition (scrollY > 100), so it's the correct thing to key on.
    if (window.__particleLayerHidden) {
      const pLayer = document.getElementById('particle-morph-demo');
      if (pLayer) {
        pLayer.style.transition = 'none';
        pLayer.style.opacity = '0';
      }
    }
    document.documentElement.classList.remove('curtain-restoring');

    // PARTICLE RESYNC after a curtain return.
    //
    // The scroll position was just restored with an instant jump, which is
    // NOT how the particle system is normally driven: its shapes and its
    // fade/visibility come from triggers that fire as you pass through
    // sections. A jump skips those, so the system can settle holding a shape
    // (and a visibility/opacity pairing) that belongs to a different part of
    // the page than the one now on screen — reported as particles looking
    // "overbloomed" after closing a post, and only fixed by scrolling away
    // and back, which is exactly what re-firing the triggers does.
    //
    // Rather than special-case each trigger, ask the system to re-evaluate
    // itself against the scroll position it ACTUALLY landed on. Both calls
    // are the same ones the render loop already makes every frame — this
    // just guarantees one pass happens after the jump has settled, instead
    // of waiting for the user to scroll.
    //
    // Deliberately defensive: this runs on every curtain return, on pages
    // that may not have particles at all (the system is absent on post/
    // about/contact/work-index — see particle-morph.hbs), so every hop is
    // optional-chained and the whole thing is wrapped. A throw here would
    // abort the rest of the restore.
    try {
      var __loop = window.particleSystem && window.particleSystem.loop;
      if (__loop) {
        var __dir = __loop.scrollDirector;

        // Clear each zone's "shape I last applied" memory FIRST.
        //
        // _checkZoneShape() only calls _applyShape() when the sampled shape
        // differs from zone.shape (particle-scroll-director.js). On a fresh
        // load every zone.shape is undefined while the live particle state
        // is whatever the boot sequence left ('dispersed'), so the check
        // below computes the correct shape for this scroll position, finds
        // it "already applied", and skips it — leaving the raw 16k-particle
        // cloud on screen at full opacity. That is the overbloomed look.
        //
        // Measured at an identical scroll position (y=4500): a normal
        // approach settles on 'sphere', the curtain return sat on
        // 'dispersed' and only corrected once a scroll pushed it to
        // 'triple-sphere'. Nulling zone.shape makes the very next check a
        // genuine re-apply instead of a no-op.
        if (__dir && __dir.zones && typeof __dir.zones.forEach === 'function') {
          __dir.zones.forEach(function (zone) {
            zone.shape = undefined;
            zone._shapeEverEntered = false;
          });
        }

        // Re-run the two checks that own "which shape should be current"
        // and "should the layer be visible", both of which are otherwise
        // only reached via scroll.
        if (typeof __loop._checkHeroReentry === 'function') __loop._checkHeroReentry();
        if (__dir && typeof __dir.checkShapesEvenWhileHidden === 'function') {
          __dir.checkShapesEvenWhileHidden();
        }
        // ScrollTrigger caches each trigger's start/end in pixels. The jump
        // happened after those were computed, so refresh re-measures them
        // against the real position before the director samples again.
        if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function') {
          window.ScrollTrigger.refresh();
        }
        if (__dir && typeof __dir.apply === 'function') __dir.apply(__loop);
        // Second pass after refresh: the first ran against pre-refresh
        // trigger positions, so a zone whose activity flipped during the
        // refresh would otherwise stay unevaluated until the next scroll.
        if (__dir && typeof __dir.checkShapesEvenWhileHidden === 'function') {
          __dir.checkShapesEvenWhileHidden();
        }
      }
    } catch (e) {
      console.warn('[page-transition] particle resync after curtain return failed', e);
    }

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
  // Backs off entirely while the kg-gallery-card modal is open (modal.js
  // sets window.__galleryModalOpen) — this listener is on `document`,
  // which fires BEFORE modal.js's own Escape handler (registered on
  // `window`, later in the bubble phase), so without this check both fired
  // on the same keypress: the modal closed AND the post navigated away,
  // since this handler had no way to know the modal existed. The modal
  // should own Escape exclusively while it's open; this only resumes
  // owning it once the modal is closed.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (window.__galleryModalOpen) return;
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
    // A bfcache restore can land on a page where armLoadingBar() ran (the
    // outgoing exit) but the destination's own releaseLoadingBar() never
    // did (navigation didn't complete the normal way) — leaving .is-loading
    // stuck. Same defensive reset as everything else in this handler.
    const bar = document.querySelector('.scroll-progress');
    if (bar) bar.classList.remove('is-loading', 'is-complete');
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
      releaseLoadingBar();
      // Slide entrance, same y-values as the non-home branch's <main>
      // entrance below (Work/About/Contact: y:20->0, duration 0.2, ease
      // power1.out). Split across two elements rather than animating .home
      // directly: .home must never get a transform (it would become the
      // containing block for every position:fixed element inside it, the
      // hero included, and skew the pinned sections' ScrollTrigger
      // measurements — confirmed earlier: "would be because section is
      // pinned?" — yes). So .home only ever gets the opacity fade, and the
      // y-slide goes on .hero instead.
      // Opacity fade removed — .home is fully visible immediately, no
      // fade-in tween. The hero's own y-slide is a slide, not a fade;
      // left as-is per "remove fade in", not "remove entrance motion".
      //
      // START OFFSET: 20, not 200. `gsap.set` lands the offset SYNCHRONOUSLY
      // while the tween back to 0 runs on GSAP's ticker — so any main-thread
      // contention during boot (particle system init, ScrollTrigger.refresh)
      // stretches the window where the hero is still displaced. At y:200 that
      // window reads as "the homepage loaded already scrolled down a bit, and
      // I can scroll up" — reported live, and measured here mid-flight at
      // t+0.6s with the hero still carrying translate3d(0,5.4px,0) on a
      // machine with NO real boot work to contend with. 20 matches the
      // documented intent above and keeps the displacement too small to read
      // as a scroll offset even if the tween is delayed.
      // (A prior version of this comment claimed .hero is position:fixed, so
      // its transform couldn't create a containing block for fixed
      // descendants. That is no longer true — .hero is position:relative
      // (main.css), and .hero-bg/.hero-image-wrapper have both since been
      // migrated off position:fixed themselves, so the concern is moot
      // rather than avoided. Corrected here so the next reader doesn't rely
      // on a false premise.)
      const heroEl = document.querySelector('.hero');
      gsap.set(homeEl, { opacity: 1 });
      if (heroEl) gsap.set(heroEl, { y: 20 });
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
    releaseLoadingBar();

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