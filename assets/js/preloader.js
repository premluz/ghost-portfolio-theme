/**
 * PRELOADER v3
 * Sequence:
 * 1. Track loading of all GLBs + videos → progress bar + % counter
 * 2. "prems • design" wordmark animates during loading
 * 3. Only fly to logo + run particles once 100% loaded
 * 4. Preloader fades out; hero entrance triggers
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

  // ─── Assets to track ─────────────────────────────────────────────────────
  // GLB_FILES removed 2026-07-25 (mobile / note / diamond / globe / game /
  // chart / email / camera / sim .glb). It fully fetch()ed ~2.0 MB of models
  // — mobile.glb alone was 1.47 MB — and HELD THE PRELOADER OPEN until every
  // one resolved, even though the hero shape ('helix') is generated
  // procedurally and needs no GLB. These are all morph targets for sections
  // further down the page, so the preloader was gating first paint on assets
  // nothing on screen wanted yet. The same set was ALSO preloaded in
  // default.hbs's <head> (removed there too) — they were being requested
  // twice per load. Shapes now load on demand at first morph.
  const VIDEO_FILES = [
    'IoT.mp4', 'Tracr.mp4'
  ];

  // ─── Helper: poll for window.particleSystem ───────────────────────────────
  function getLoopWhenReady(cb, maxWait) {
    const deadline = Date.now() + (maxWait || 8000);
    const id = setInterval(() => {
      const sys = window.particleSystem;
      if (sys && sys.loop && sys.loop.currentState) {
        clearInterval(id);
        cb(sys);
      } else if (Date.now() > deadline) {
        clearInterval(id);
        cb(null);
      }
    }, 80);
  }

  class Preloader {
    constructor() {
      this.preloader   = document.getElementById('preloader');
      this.wordmark    = document.querySelector('.preloader-wordmark');
      this.progressBar = document.getElementById('preloader-progress-bar');

      if (!this.preloader || !this.wordmark) return;

      this.premWord   = this.wordmark.querySelector('.pl-word-prem');
      this.designWord = this.wordmark.querySelector('.pl-word-design');
      this.dot        = this.wordmark.querySelector('.preloader-dot');

      this._loaded = 0;
      this._total  = VIDEO_FILES.length;
      this._readyToFinish = false;
      this._wordmarkDone  = false;
      // Bar becomes visible the instant this constructor runs (CSS handles
      // the chase from its own 0% keyframe, no JS width to wait on) — this
      // timestamp anchors the __barMinCycleRelease "at least one full
      // cycle" gate in _finish() below.
      this._barStartTime = Date.now();

      const particlesEl = document.getElementById('particles');
      if (particlesEl) gsap.set(particlesEl, { opacity: 0 });

      console.log('[preloader] Constructor: starting loading + wordmark animation');
      this._startLoading();
      this._runWordmarkAnimation();
    }

    // ── Progress tracking ───────────────────────────────────────────────────
    // Real asset loading still gates _readyToFinish (below) — we don't start
    // the reveal before videos are actually ready. The VISIBLE bar is pure
    // CSS (main.css .preloader-progress-bar — Material Design's own linear
    // indeterminate two-bar animation, no JS width-driving here);
    // _animateVisibleProgress()/_setProgress() were removed 2026-08-06 along
    // with it — see main.css's comment on that rule for why a determinate
    // readout didn't fit an indeterminate bar.
    _startLoading() {
      const onProgress = () => {
        this._loaded++;
        if (this._loaded >= this._total) this._onAllLoaded();
      };

      // Nothing to wait on → complete immediately. Without this, an empty
      // tracked-asset list means onProgress never fires, _readyToFinish stays
      // false, and _finish() is never reached — and the 8s safety timer lives
      // INSIDE _finish(), so nothing recovers it. The overlay itself is
      // force-hidden site-wide (`#preloader { display:none !important }` in
      // default.hbs), so this would not visibly block the page; what stalls
      // is the completion chain _finish() drives — preloader:done /
      // window.__preloaderDoneFired, which the particle bootstrap and other
      // listeners wait on. Cheap guard, added when removing GLB_FILES shrank
      // this list from 11 entries to 2.
      if (this._total === 0) {
        this._onAllLoaded();
        return;
      }

      // GLB fetch loop removed here — see GLB_FILES comment at top of file.

      VIDEO_FILES.forEach(file => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = onProgress;
        v.onerror = onProgress;
        v.src = `/content/images/videos/${file}`;
      });
    }

    _onAllLoaded() {
      console.log('[preloader] All assets loaded/failed, _readyToFinish=true, _wordmarkDone=' + this._wordmarkDone);
      this._readyToFinish = true;
      if (this._wordmarkDone) this._finish();
    }

    // ── Wordmark animation — uses same letter-by-letter as headers
    _runWordmarkAnimation() {
      console.log('[preloader] Wordmark letter-by-letter animation started');

      // Animate wordmark letters + dot drop together
      const tl = gsap.timeline();

      // Prem: letters reveal starting at 0.1s using standard letter animation
      const premWord = this.premWord;
      if (premWord && typeof animateH1LetterByLetter === 'function') {
        gsap.set(premWord, { opacity: 1 });
        animateH1LetterByLetter(premWord, tl, 0.1, null);
      }

      // Design: letters reveal starting at 0.35s (0.1 + ~0.25 prem duration) using standard letter animation
      const designWord = this.designWord;
      if (designWord && typeof animateH1LetterByLetter === 'function') {
        gsap.set(designWord, { opacity: 1 });
        animateH1LetterByLetter(designWord, tl, 0.35, null);
      }

      // Dot drops immediately at 0s (parallel with prem letters)
      const dot = this.dot;
      if (dot) {
        tl.fromTo(dot,
          { opacity: 0, y: -150, scale: 1.4 },
          { opacity: 1, y: -2, scale: 1, duration: 0.6, ease: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)' },
          0
        );
        // Dot bounces
        tl.to(dot, { y: -26, duration: 0.3, ease: 'cubic-bezier(0.215, 0.61, 0.355, 1)' }, 0.6);
        tl.to(dot, { y: -2, duration: 0.3, ease: 'cubic-bezier(0.215, 0.61, 0.355, 1)' });
        tl.to(dot, { y: -14, duration: 0.25, ease: 'cubic-bezier(0.215, 0.61, 0.355, 1)' });
        tl.to(dot, { y: -2, duration: 0.2 });
      }

      // Total animation: ~0.65s (letters + dot complete)
      setTimeout(() => {
        console.log('[preloader] Wordmark animation done, _readyToFinish=' + this._readyToFinish);
        this._wordmarkDone = true;
        if (this._readyToFinish) this._finish();
      }, 1350); // 0.8s hold after animation settles
    }

    // ── Final sequence ──────────────────────────────────────────────────────
    // 1. Dot has already landed (CSS anim). 1s hold.
    // 2. Words fade out one by one matching their reveal timing (prems first).
    // 3. Particles burst into globe — moment burst done: dot out in 0.1s.
    // 4. Preloader fades, hero entrance.
    _finish() {
      if (this._finishing) return;
      this._finishing = true;
      console.log('[preloader] _finish() — starting fade-out sequence');

      // Stops the CSS chase and holds a full, bright bar for this handoff
      // beat (main.css .progress-bar-track.is-complete) — replaces the old
      // _setProgress(100) width snap, which no longer applies now that the
      // bar is an indeterminate CSS animation, not JS-driven width. Gated
      // through __barMinCycleRelease (defined at the top of this file) so
      // the chase always completes at least one full loop before stopping
      // — in practice _finish() only ever fires well after that on the
      // homepage (the wordmark/dot sequence alone takes ~2.75s, longer than
      // one 1.6s cycle), but the gate is applied uniformly rather than
      // assumed safe here specifically — same helper page-transition.js
      // uses for .scroll-progress, where timing is NOT naturally slow.
      if (this.progressBar) {
        window.__barMinCycleRelease(this._barStartTime, () => {
          this.progressBar.classList.add('is-complete');
        });
      }

      const safetyTimer = setTimeout(() => { this._hide(); }, 8000);

      const dot        = this.dot;
      const premWord   = this.premWord;
      const designWord = this.designWord;

      // Freeze dot in landed position so CSS anim doesn't fight GSAP
      if (dot) { dot.style.animation = 'none'; gsap.set(dot, { y: -2, scale: 1, opacity: 1 }); }

      const tl = gsap.timeline();
      const subtitle = document.getElementById('preloader-subtitle');

      // MASTER TIMELINE: All preloader sequence timing controlled here.
      // NOTE: this timeline does NOT actually start at page load — it
      // starts when _finish() is called, which only happens once
      // _wordmarkDone AND
      // _readyToFinish are both true (i.e. after the wordmark hold timer
      // in _runWordmarkAnimation(), ~2.75s post wordmark-start). By that
      // point the dot (CSS-driven, settles at 1.2s+0.75s=1.95s) has
      // *already* finished landing and bouncing ~0.8s earlier. So
      // BURST_TIME is relative to _finish()'s call time, not page load —
      // a BURST_TIME matching "200ms after the dot lands" measured from
      // page load (e.g. 1.715) would actually fire ~3s too late from here,
      // since the dot landed long before this timeline even started.
      // BURST_TIME = 0 is correct: the ~0.8s gap between the dot settling
      // and _finish() running already serves as the "hold before burst".
      const preloaderTL = gsap.timeline();

      const BURST_TIME = 0;                    // correct as 0 — see note above, do not change to 1.715
      const BURST_DURATION = 1;              // particle burst 500ms
      const SETTLE_DURATION = 1.2;             // particle settle 900ms
      const SETTLE_TIME = BURST_TIME + BURST_DURATION + SETTLE_DURATION;
      const WORD_FADE_TIME = 0.45;             // words fade duration
      const HERO_START_TIME = BURST_TIME + WORD_FADE_TIME + 0;  // 500ms after words finish

      preloaderTL.call(() => { this._runParticles(safetyTimer); }, null, BURST_TIME);

      // Words fade out: prems first at 0.1s, design at 0.65s (from CSS), so fade them at those times
      // Wait for wordmark CSS animation to complete (~2.2s), then hold
      tl.to({}, { duration: 1.0 }, 2.2);

      // 2) Words & subtitle fade out together (prems first), matching reveal gap
      tl.to(premWord,   { opacity: 0, duration: 0.45, ease: 'power2.in' }, '>');
      if (subtitle) {
        tl.to(subtitle, { opacity: 0, duration: 0.45, ease: 'power2.in' }, '<');
      }
      tl.to(designWord, { opacity: 0, duration: 0.45, ease: 'power2.in' }, '>+0.55');

      // NOTE: preloader:done is now dispatched from _hide() when preloader fully fades out
      // This ensures hero only starts after entire preloader sequence completes
    }

    _hide() {
      if (this._hidden) return;
      this._hidden = true;
      console.log('[preloader] _hide() — preloader faded out completely');
      if (this.preloader) {
        this.preloader.style.cssText = 'display:none !important';
      }
      // Restore particle z-index
      const demoEl = document.getElementById('particle-morph-demo');
      if (demoEl) demoEl.style.zIndex = '1';

      // Dispatch preloader:done NOW — hero starts after preloader fully fades
      console.log('[preloader] Preloader sequence complete, dispatching preloader:done');
      window.__preloaderDoneFired = true; // sticky flag — see other dispatch points' comment
      window.dispatchEvent(new CustomEvent('preloader:done'));
    }

    _runParticles(safetyTimer) {
      console.log('[preloader] _runParticles() called, waiting for window.particleSystem...');
      const particlesEl = document.getElementById('particles');
      const demoEl      = document.getElementById('particle-morph-demo');
      const dot         = this.dot;

      // Raise container so sphere shows through transparent preloader
      if (demoEl) demoEl.style.zIndex = '999990';

      // Dedicated scrim (particle-morph.hbs) that covers #particles until
      // the skip-path reveal fades it — full preloader runs never touch
      // that fade-in trigger (gated on !window.__preloaderRunning), so
      // without this the scrim would sit at opacity:1 forever once the
      // preloader itself finishes fading away, permanently hiding the
      // particles behind a solid-color layer.
      const loadScrim = document.getElementById('particles-load-scrim');

      getLoopWhenReady((sys) => {
        if (!sys) {
          console.warn('[preloader] particleSystem timeout — fallback');
          if (particlesEl) gsap.to(particlesEl, { opacity: 1, duration: 0.4 });
          if (loadScrim) gsap.set(loadScrim, { opacity: 0 });
          if (dot) gsap.to(dot, { opacity: 0, duration: 0.1 });
          gsap.to(this.preloader, { opacity: 0, duration: 0.5, delay: 0.2 })
            .then(() => { clearTimeout(safetyTimer); this._hide(); });
          return;
        }

        // Burst into dispersed (skip globe forming)
        // Don't morph to globe — go straight to dispersed
        sys.morphTo('dispersed', 0);
        sys.loop._preloaderScale = 0;
        sys.loop._preloaderIntroActive = true;

        // Particle burst source position: 20px up and 30px left (adjust here)
        const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 0;
        if (particlesEl) gsap.set(particlesEl, { y: navH / 2 - 55, x: -40, opacity: 1 });
        if (loadScrim) gsap.set(loadScrim, { opacity: 0 });

        const burstMs = 500;

        // Dot fades out fast (0.05s)
        setTimeout(() => {
          if (dot) gsap.to(dot, { opacity: 0, duration: 0.05, ease: 'none' });
        }, Math.max(0, burstMs - 450));

        // Run burst animation into dispersed form (not globe)
        sys.loop.startPreloaderGlobeIntro({
          burstMs: burstMs, settleMs: 900, overshoot: 0.5, oscillations: 2
        }).then(() => {
          // Burst + settle complete — particles stay in dispersed form here.
          // (Previously this morphed straight to 'helix', but that's too
          // early — the dot has just burst into particles, hero isn't
          // revealed yet. Helix formation is now tied to initHero()'s own
          // entrance animation in scroll-scrub-anim.js instead, so it forms
          // alongside the headline/description fading in once hero content
          // is actually there, not immediately after the burst settles.)
          if (particlesEl) gsap.to(particlesEl, { y: 0, x: 0, duration: 0.4, ease: 'power2.out' });

          gsap.to(this.preloader, {
            opacity: 0, duration: 0.5, ease: 'power2.inOut', delay: 0.1,
            onComplete: () => { clearTimeout(safetyTimer); this._hide(); }
          });
        });
      });
    }
  }

  function waitForGsap(cb) {
    if (typeof gsap !== 'undefined') { cb(); return; }
    const t = setInterval(() => { if (typeof gsap !== 'undefined') { clearInterval(t); cb(); } }, 50);
  }

  function boot() { waitForGsap(() => new Preloader()); }

  // PRELOADER DISABLED — GLBs are only ~20KB, videos load in background
  // Videos start loading immediately without blocking page reveal
  // Hide preloader and dispatch preloader:done immediately
  const hidePreloader = () => {
    const el = document.getElementById('preloader');
    if (el) el.style.display = 'none';
    document.documentElement.classList.remove('preloading');
    document.documentElement.classList.add('page-ready');
    // Clear __preloaderRunning: it's set to true unconditionally at the top
    // of this IIFE on the fresh-landing path, back when that path really did
    // run the full Preloader. With the preloader disabled, _runParticles()
    // — the ONLY thing that clears #particles-load-scrim on a full run —
    // never executes, while the flag staying true also gates OFF the skip
    // path's own scrim fade in particle-morph.hbs (`if
    // (!window.__preloaderRunning)`). Net effect on every fresh load /
    // refresh: the scrim sat at opacity 1 hiding the particles behind a
    // solid colour until the 6s failsafe in particle-morph.hbs cleared it.
    // (Same-site nav was unaffected — it takes the skip path, which returns
    // before the flag is ever set.) Cleared here so the skip-path fade is
    // the single live clear route for both entries.
    window.__preloaderRunning = false;
    window.__preloaderSkipped = true;
    window.__preloaderDoneFired = true; // sticky flag — see other dispatch points' comment
    window.dispatchEvent(new CustomEvent('preloader:done'));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hidePreloader);
  } else {
    hidePreloader();
  }

  // Uncomment below to re-enable preloader sequence:
  // if (document.readyState === 'loading') {
  //   document.addEventListener('DOMContentLoaded', boot);
  // } else {
  //   boot();
  // }
})();
