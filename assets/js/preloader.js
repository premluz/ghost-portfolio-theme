/**
 * PRELOADER v4 — minimal instant-text preloader.
 * Sequence:
 * 1. #preloader-text is visible in the markup instantly (no JS wait).
 * 2. Soft fade-in (opts into a CSS transition, then triggers it a frame
 *    later so it actually animates instead of snapping).
 * 3. Short hold, then text + the shared #particles-load-scrim
 *    (particle-morph.hbs) fade out together; preloader:done dispatched
 *    once fully hidden — same contract every prior version used.
 * See partials/preloader.hbs for the full design note.
 */

(function () {
  'use strict';

  // Shared "at least one full cycle" gate for the indeterminate loading bar
  // (main.css .progress-bar-track — the single-streak grow/collapse
  // sequence, shared by #preloader-progress-bar here AND .scroll-progress
  // during regular page navigation, see page-transition.js). Defined here,
  // ABOVE this file's own early-return below, specifically so it's
  // registered on EVERY page — page-transition.js loads after this file
  // (default.hbs script order) and needs this on every navigation, not just
  // the homepage. Without a minimum hold, a fast page load or navigation
  // can call the "done" trigger before the bar has completed even one
  // visible sequence — reads as a flicker, not a loading indicator.
  // ⚠ MUST be >= bar-grow's animation-duration in main.css (currently
  // 0.9s). That is not just cosmetic pacing: the .is-complete exit assumes
  // it starts from a settled scaleX(1), and this gate is the only thing
  // guaranteeing the one-shot grow has actually finished before the exit
  // can be applied. Drop it below the grow duration and a fast load will
  // cut the grow off mid-way and jump. Update both together.
  window.__BAR_CYCLE_MS = 900;
  window.__barMinCycleRelease = function (startTime, release) {
    var elapsed = Date.now() - startTime;
    var remaining = window.__BAR_CYCLE_MS - elapsed;
    if (remaining <= 0) { release(); return; }
    setTimeout(release, remaining);
  };

  // Only run on homepage (preloader element present)
  if (!document.getElementById('preloader')) return;

  // Skip path: arrived via an in-site click (e.g. the logo), not a fresh
  // landing/refresh. page-transition.js navigates via window.location.href
  // (a real page load, not a client-side route swap), so document.referrer
  // reliably reflects the previous page when it's same-origin. Replaces
  // the old "once per localStorage session" check (see commented-out
  // block below) — that flag stopped being read by the anti-flash script
  // in default.hbs's <head> too; keep both in sync if this logic changes.
  //
  // isReload override (2026-08-06): document.referrer alone can't tell a
  // refresh apart from an in-site click earlier in this tab's history — a
  // browser reload PRESERVES the referrer from the page's original
  // navigation, it doesn't clear it. So once you'd reached this page via
  // an internal link even once, cameFromSameSite stayed true on every
  // later refresh of that tab, permanently skipping the preloader (bug
  // report: the loading bar never showed on refresh). Navigation Timing's
  // own `type` is the correct signal for "was this specific request a
  // reload" — checked first and allowed to override the referrer
  // heuristic. Same override added to default.hbs's two copies of this
  // check; keep all three in sync.
  let isReload = false;
  try {
    const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    isReload = navEntry
      ? navEntry.type === 'reload'
      : !!(performance.navigation && performance.navigation.type === performance.navigation.TYPE_RELOAD);
  } catch (e) {
    isReload = false;
  }

  let cameFromSameSite = false;
  try {
    cameFromSameSite = !isReload && !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch (e) {
    cameFromSameSite = false;
  }

  if (cameFromSameSite) {
    console.log('[preloader] SKIP PATH — arrived via in-site navigation (referrer: ' + document.referrer + '), skipping animation');
    const el = document.getElementById('preloader');
    if (el) el.style.display = 'none';
    // Reveal #particles-load-scrim HERE too, not just #preloader.
    //
    // The scrim is markup rendered by {{#is "index"}} — a TEMPLATE-level
    // guard evaluated server-side on every request to "/", with no way to
    // distinguish a fresh landing from a curtain-return (page-transition.js's
    // runCurtainExit ends in a real `location.href` navigation, same as
    // typing the URL). So the scrim exists and starts at its base
    // opacity:1 on this path exactly as much as on a fresh load — but
    // until this fix, only the FULL-RUN branch below (_finish(), later in
    // this file) ever revealed it. This skip-path predates the scrim
    // entirely and never touched it.
    //
    // Left alone, the scrim stayed opaque (z-index 999998, above .home/
    // .hero but still below nav's 10001) until a much slower FALLBACK in
    // particle-morph.hbs (~line 725, gated on `!window.__preloaderRunning`)
    // happened to fire once the particle system's own async THREE.js/GLB
    // boot chain finished — that gate's own comment wrongly assumed it
    // never runs on pages with #preloader (i.e. the homepage); this
    // cameFromSameSite branch proves it does, since __preloaderRunning is
    // never set on this path either. Reported symptom matched exactly:
    // nav genuinely painting at opacity:1/visible per computed style, but
    // invisible on screen — confirmed live via screenshot, a fully opaque
    // frame with nothing on it — until that fallback eventually cleared
    // the scrim, sometimes noticeably late (post-page boot is slower than
    // About's), reading as "not visible, then fades in."
    const scrim = document.getElementById('particles-load-scrim');
    if (scrim) {
      scrim.classList.add('is-revealed');
      scrim.style.opacity = '0';
    }
    document.documentElement.classList.remove('preloading');
    document.documentElement.classList.add('page-ready');
    window.__preloaderSkipped = true;
    setTimeout(() => {
      console.log('[preloader] preloader:done dispatched (skip path)');
      // Sticky flag — see particle-animation-loop.js's constructor, which
      // checks this before deciding whether to even wait for the event.
      // Without it, late subscribers (the particle system's own async
      // bootstrap chain finishes well after this fires) miss the event
      // entirely and fall back to a 20s timer for bloom to ever turn on.
      window.__preloaderDoneFired = true;
      window.dispatchEvent(new CustomEvent('preloader:done'));
    }, 0);
    return;
  }
  console.log('[preloader] FULL RUN — showing preloader (fresh landing/refresh)');
  window.__preloaderRunning = true;

  /* Show preloader only once per session
  if (localStorage.getItem('preloader_seen')) {
    console.log('[preloader] SKIP PATH — preloader_seen in localStorage, skipping animation');
    const el = document.getElementById('preloader');
    if (el) el.style.display = 'none';
    document.documentElement.classList.add('page-ready');
    window.__preloaderSkipped = true;
    setTimeout(() => {
      console.log('[preloader] preloader:done dispatched (skip path)');
      window.dispatchEvent(new CustomEvent('preloader:done'));
    }, 0);
    return;
  }
  console.log('[preloader] FULL RUN — showing preloader');
  localStorage.setItem('preloader_seen', '1');
  window.__preloaderRunning = true;
*/
  // Ensure nav is hidden during preloader
  document.documentElement.classList.add('preloading');

  // Reveal page when preloader finishes (preloading class already on html from head script)
  window.addEventListener('preloader:done', () => {
    // Keep preloading class until nav is ready to show (page-ready added)
    // Nav fades in after hero entrance completes, not immediately
    const heroEl = document.querySelector('.intro');
    let _navShown = false;
    const addPageReady = () => {
      if (_navShown) return;
      _navShown = true;
      document.documentElement.classList.remove('preloading');
      document.documentElement.classList.add('page-ready');
    };
    if (heroEl) {
      heroEl.addEventListener('heroEntranceDone', addPageReady, { once: true });
      setTimeout(addPageReady, 1200); // fallback if event doesn't fire
    } else {
      setTimeout(addPageReady, 800);
    }
  }, { once: true });

  // ─── Minimal text preloader ─────────────────────────────────────────────
  // Sequence: text is visible instantly in the markup (no opacity:0 default
  // — see main.css's comment on .preloader-text), then this adds the
  // fade-in class + triggers it a frame later so the CSS transition actually
  // runs instead of snapping. HOLD_MS after that, fade the text and the
  // shared #particles-load-scrim (particle-morph.hbs) out TOGETHER, then
  // _hide() the preloader shell and dispatch preloader:done — same as every
  // prior version, so the 5 files that key off __preloaderSkipped /
  // __preloaderDoneFired / 'preloader:done' keep working unchanged.
  // Nominal fade-in length, used only by the failsafe timer below. The
  // REAL entrance is `preloaderFadeIn 0.4s ease-out` on #preloader
  // (main.css) — the .pl-text-fade-in transition this used to name never
  // actually produces a visible fade, since the container animating is
  // what the viewer sees. Kept at 500 as a deliberately generous margin,
  // not as a value that must match anything.
  const FADE_IN_MS    = 500;
  // FAILSAFE MARGIN ONLY — no longer a deliberate hold. The scrim exit is
  // triggered by the entrance animation actually completing (see the
  // constructor's getAnimations check); this extra slack exists purely so
  // the backup timer can't beat that to the punch on a normal load, and
  // only takes over if the animation never resolves (reduced-motion
  // zeroing the duration, backgrounded tab).
  const HOLD_MS       = 500;
  // Longer than the 0.4s entrance ON PURPOSE. An exit that matches its
  // entrance beat-for-beat reads as clipped, because it is competing with
  // the scrim's own 600ms slide for the viewer's attention rather than
  // receding behind it; stretching it past both the entrance and the slide
  // lets the text recede as the scrim carries it away instead of blinking
  // out mid-movement. Paired with power2.out below (mirroring the
  // entrance's ease-out), this is the "smoother, longer, matching" exit.
  const FADE_OUT_MS   = 800;
  const SCRIM_SLIDE_MS = 600; // MUST match .particles-load-scrim's transition-duration (main.css)

  class Preloader {
    constructor() {
      this.preloader   = document.getElementById('preloader');
      this.text        = document.getElementById('preloader-text');
      this.progressBar = document.getElementById('preloader-progress-bar');
      this.scrim       = document.getElementById('particles-load-scrim');

      if (!this.preloader || !this.text) return;

      // Bar becomes visible the instant this constructor runs (CSS handles
      // the chase from its own 0% keyframe) — anchors __barMinCycleRelease's
      // "at least one full cycle" gate in _finish() below.
      this._barStartTime = Date.now();

      // Text is already opacity:1 in its base CSS state (renders instantly,
      // no JS dependency). Opting it INTO the fade-in transition here, then
      // flipping .is-visible on the next frame, is what makes it visibly
      // soft-fade rather than being present from t=0 with no motion at all.
      this.text.classList.add('pl-text-fade-in');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.text.classList.add('is-visible');
        });
      });

      // The scrim's exit is triggered by the TEXT'S OWN fade-in finishing —
      // driven off the real `transitionend`, not a timer that merely hopes
      // to match .pl-text-fade-in's CSS duration (main.css). Keying off the
      // actual event means the two stay in sync automatically if that
      // duration is ever retuned in CSS, instead of silently drifting apart
      // the way a hardcoded FADE_IN_MS constant would.
      //
      // Guarded on propertyName: this element only transitions opacity
      // today, but a future transition on any other property would
      // otherwise fire this early.
      //
      // The timer below is now a FAILSAFE, not the mechanism — transitionend
      // legitimately never fires in several cases (a zeroed duration under
      // prefers-reduced-motion, the element being display:none'd mid-fade,
      // some backgrounded-tab conditions), and the preloader must never be
      // able to strand the page behind a scrim that has no other way to
      // leave. Both paths funnel into the same _finishing-guarded _finish(),
      // so whichever wins the race, the other is a no-op.
      // NOTE the target: #preloader's own `preloaderFadeIn` ANIMATION
      // (main.css ~607, 0.4s ease-out forwards) — NOT the text's
      // .pl-text-fade-in transition. Traced live: the text's computed
      // opacity is 1 from first paint and never transitions, because the
      // CONTAINER is what actually fades (preloaderOp climbing 0 -> 1 while
      // textOp stayed pinned at 1). The text's own transition only ever
      // fires on the way OUT, when _finish()'s GSAP tween writes an inline
      // opacity that finally beats the class rule. So the visible
      // "Opportunity lives in complexity" fade-in the viewer sees is this
      // animation, and animationend on it is the correct "the text has
      // finished appearing" signal.
      // ALREADY-FINISHED CHECK comes first, and is the common case — not an
      // edge case. preloaderFadeIn is a CSS animation that starts at first
      // paint, while this constructor runs on DOMContentLoaded; on a normal
      // load the 0.4s animation is long over by then (traced: animation
      // ends 586ms, constructor runs 726ms, with getAnimations() already
      // reporting playState "finished"). Attaching a listener alone would
      // therefore wait forever and leave the failsafe timer to do all the
      // work — exactly the 3.1s desync this replaced. Querying the live
      // animation state instead of trusting the event to still be coming is
      // what makes this correct regardless of which side of the race the
      // constructor lands on.
      const fadeInAnim = this.preloader.getAnimations
        ? this.preloader.getAnimations().find(a => a.animationName === 'preloaderFadeIn')
        : null;

      if (!fadeInAnim || fadeInAnim.playState === 'finished') {
        // Fade-in already done (or no such animation at all — reduced
        // motion, unsupported getAnimations): the text has finished
        // appearing, so the scrim's exit is due now.
        this._finish();
      } else {
        // Still running — wait for it to land. `finished` is a promise on
        // the Animation object itself, which (unlike an animationend
        // listener) resolves correctly even if the animation completes
        // between this check and the next tick.
        fadeInAnim.finished.then(() => this._finish()).catch(() => {});
      }

      // Failsafe in BOTH branches — the promise above can reject (animation
      // cancelled) or, on a stalled/backgrounded tab, simply never settle,
      // and the page must never be left behind a scrim with no other way
      // out. Harmless when the normal path wins: _finish() is guarded by
      // its own _finishing flag, so whichever fires second is a no-op.
      this._holdTimer = setTimeout(() => this._finish(), FADE_IN_MS + HOLD_MS);
    }

    _finish() {
      if (this._finishing) return;
      this._finishing = true;

      // preloader:done dispatched HERE — at the moment the scrim starts its
      // slide — not from _hide() 500ms later as before. That gap is what
      // caused hero content set static by scroll-scrub-anim.js's
      // isFreshPreloaderRun branch (entranceTl.progress(1), gated on this
      // exact event) to only become visible ~700ms into the scrim's
      // slide-away, well AFTER the transform had finished uncovering the
      // hero — measured: scrim fully off-screen at 6275ms, hero content
      // still opacity:0 until 6343ms. The scrim was sliding over nothing,
      // then the hero popped in afterward — the opposite of the intended
      // "scrim reveals already-visible content" effect.
      //
      // Every one of this event's other 3 listeners (main.js's hero-image
      // wait + entrance chain, particle-animation-loop.js's bloom composer
      // init, and this file's own nav-reveal listener below) only cares
      // about "is the hero/particle system ready to be acted on", not
      // "has the preloader visually finished fading" — firing ~500ms
      // earlier makes the signal MORE accurate to what it's named, not
      // less. _hide() still runs on its own timing afterward (shell
      // display:none, scrim pointer-events) — it just no longer owns the
      // event dispatch.
      window.__preloaderDoneFired = true; // sticky flag — see other dispatch points' comment
      window.dispatchEvent(new CustomEvent('preloader:done'));

      // Stops the CSS chase and holds a full bright bar for this handoff
      // beat (main.css .progress-bar-track.is-complete), gated through
      // __barMinCycleRelease so the chase always completes at least one
      // full loop before stopping — same helper page-transition.js uses
      // for .scroll-progress during regular navigation.
      if (this.progressBar) {
        window.__barMinCycleRelease(this._barStartTime, () => {
          this.progressBar.classList.add('is-complete');
        });
      }

      const safetyTimer = setTimeout(() => { this._hide(); }, 4000);

      // Scrim: SLIDE, not fade. .particles-load-scrim.is-revealed (main.css)
      // translates it up by its own 150vh height over SCRIM_SLIDE_MS — its
      // own CSS transition, not GSAP, since the motion is a plain transform
      // with nothing else to coordinate. Longer than FADE_OUT_MS (500ms) on
      // purpose: the slide is the visible reveal now, so it gets the
      // slower, more deliberate duration; text/preloader-shell still fade
      // on the original faster beat alongside it.
      //
      // Opacity is written AFTER the slide finishes, not alongside it —
      // opacity and transform are independent properties, so setting
      // opacity:0 immediately made the whole element invisible at once
      // regardless of the transform, which silently defeated the slide
      // entirely (confirmed via a frame-by-frame trace: opacity read 0 on
      // literally every sampled frame, including mid-slide at -925px).
      // Every other consumer of this element (the fade-in trigger and 6s
      // failsafe in particle-morph.hbs, __preloaderRunning's gate) only
      // cares about the terminal "is this scrim gone" value, not when it's
      // reached, so deferring it to match the real end of the transform is
      // free — it just has to actually happen after, not before.
      // The slide itself is GATED ON THE HERO BEING READY — it must never
      // uncover a page whose content has not been put in place yet.
      //
      // This file now loads early in <body> (default.hbs, right after
      // <main>), well before scroll-scrub-anim.js (~1799, behind three.js
      // and GSAP). That early boot is what makes the fade-in -> slide
      // handoff instant, but it also means that at this point the hero has
      // very likely NOT been made visible yet: scroll-scrub-anim.js sets it
      // static and then fires 'hero:ready'. Sliding regardless produced
      // exactly the bug this whole sequence exists to avoid — the scrim
      // wiping across an empty page, hero popping in ~260ms after the slide
      // had already finished (traced: slide done 1641ms, hero visible
      // 1902ms).
      //
      // __heroReady is checked first for the same late-subscriber reason
      // preloader:done needs its own sticky flag: the hero may already be
      // ready by the time we get here, and CustomEvents do not replay.
      const startScrimSlide = () => {
        if (!this.scrim || this._scrimSliding) return;
        this._scrimSliding = true;
        this.scrim.classList.add('is-revealed');
        setTimeout(() => { if (this.scrim) this.scrim.style.opacity = '0'; }, SCRIM_SLIDE_MS);
      };

      if (this.scrim) {
        if (window.__heroReady) {
          startScrimSlide();
        } else {
          window.addEventListener('hero:ready', startScrimSlide, { once: true });
          // Failsafe: the hero signal only exists on the fresh-preloader
          // path in scroll-scrub-anim.js. If that file errors, is absent,
          // or takes an unexpected branch, the scrim must still leave —
          // this is a veil, and a veil that can outlive its trigger is
          // strictly worse than no veil at all (LOADING.md §9).
          setTimeout(startScrimSlide, 3000);
        }
      }

      // Fades the CONTAINER only, not the text as well.
      //
      // #preloader-text is a child of #preloader, so a tween on each meant
      // the text's effective opacity was the PRODUCT of the two (0.5 * 0.5
      // = 0.25 at the midpoint, not 0.5) — it visibly vanished well ahead
      // of the container it sits on, which is a large part of what read as
      // an abrupt exit. One tween on the parent fades the whole preloader,
      // text included, at a single honest rate.
      //
      // Easing MIRRORS the fade-in rather than opposing it: the entrance is
      // `preloaderFadeIn 0.4s ease-out` (main.css), which decelerates into
      // place; this was `power2.in`, which accelerates away — the two
      // together gave a soft arrival and a sharp departure. power2.out is
      // ease-out's GSAP equivalent, so both halves now ease the same way.
      // RELEASE THE ENTRANCE ANIMATION FIRST — load-bearing, not cleanup.
      //
      // .preloader carries `animation: preloaderFadeIn 0.4s ease-out
      // forwards` (main.css ~607). A finished animation with fill-mode
      // `forwards` keeps applying its final keyframe (opacity: 1), and in
      // the CSS cascade that beats an inline style — so every fade-out
      // written here was silently ignored. Traced directly: GSAP's inline
      // opacity descended correctly (0.963 -> 0.60 -> ...) while the
      // COMPUTED opacity stayed pinned at 1 for the whole tween, and the
      // preloader only disappeared when _hide() applied display:none —
      // a hard cut, never a fade, no matter what duration or easing was
      // set here. Clearing `animation` drops that forwards fill and lets
      // the tween actually take effect.
      // Opacity is pinned to 1 in the same tick the animation is dropped:
      // .preloader's own base rule is `opacity: 0` (the pre-animation
      // state), so removing the forwards fill without this would expose
      // that 0 for a frame — the preloader blinking out instantly, which
      // is the very thing being fixed.
      this.preloader.style.opacity = '1';
      this.preloader.style.animation = 'none';

      if (typeof gsap !== 'undefined') {
        gsap.to(this.preloader, {
          opacity: 0,
          duration: FADE_OUT_MS / 1000,
          ease: 'power2.out',
          onComplete: () => { clearTimeout(safetyTimer); this._hide(); },
        });
      } else {
        this.preloader.style.transition = 'opacity ' + (FADE_OUT_MS / 1000) + 's ease-out';
        this.preloader.style.opacity = '0';
        setTimeout(() => { clearTimeout(safetyTimer); this._hide(); }, FADE_OUT_MS);
      }
    }

    _hide() {
      if (this._hidden) return;
      this._hidden = true;
      if (this.preloader) {
        this.preloader.style.cssText = 'display:none !important';
      }
      // Scrim belongs to particle-morph.hbs, not this file. pointer-events
      // is safe to force here immediately (the scrim is already inert,
      // this just makes it explicit) — opacity is NOT: _hide() fires at
      // FADE_OUT_MS (500ms), but the slide (_finish(), above) runs for
      // SCRIM_SLIDE_MS (600ms) and only sets opacity:0 once that completes.
      // Writing opacity:0 here too, 100ms earlier, would cut the slide
      // short — the scrim vanishing via opacity before its transform has
      // finished, instead of the transform being what makes it leave.
      // _finish()'s own deferred write is the one guarantee here; nothing
      // else needs to duplicate it.
      if (this.scrim) {
        this.scrim.style.pointerEvents = 'none';
      }

      // preloader:done is now dispatched from _finish() (above, at the
      // moment the scrim starts its slide) — NOT here. This function is
      // purely cleanup (shell display:none, scrim pointer-events) by the
      // time it runs; every listener has already acted on the event.
    }
  }

  function boot() { new Preloader(); }

  // Boot as soon as BOTH elements this needs actually exist, rather than
  // waiting for DOMContentLoaded.
  //
  // Waiting for DOMContentLoaded used to be mandatory: #particles-load-scrim
  // was declared in particle-morph.hbs, near the end of <body>, behind ~96
  // blocking <script> tags (three.js, GSAP, string-tune, all external CDNs).
  // That pushed the event — and so this constructor — to ~3959ms on a cold
  // dev-server load, while the preloader's own fade-in had already finished
  // at 2404ms. The text just sat there for ~1.5s of dead time before the
  // scrim could even begin to leave.
  //
  // The scrim is now the first element in <body> (default.hbs) and
  // #preloader comes from index.hbs's `{{> preloader}}` at the top of
  // <main>, so by the time THIS file executes (default.hbs ~1369) both are
  // already parsed and the whole wait disappears. The readyState fallback
  // stays for safety: if either element is somehow missing at this point
  // (markup reordered, partial not included), defer to DOMContentLoaded
  // rather than construct against nulls — Preloader's own constructor also
  // bails on a missing #preloader, so a genuinely absent element is still
  // handled, just later.
  if (document.getElementById('preloader') && document.getElementById('particles-load-scrim')) {
    boot();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
