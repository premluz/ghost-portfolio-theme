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

  // Only run on homepage (preloader element present)
  if (!document.getElementById('preloader')) return;

  // Skip path: arrived via an in-site click (e.g. the logo), not a fresh
  // landing/refresh. page-transition.js navigates via window.location.href
  // (a real page load, not a client-side route swap), so document.referrer
  // reliably reflects the previous page when it's same-origin. Replaces
  // the old "once per localStorage session" check (see commented-out
  // block below) — that flag stopped being read by the anti-flash script
  // in default.hbs's <head> too; keep both in sync if this logic changes.
  let cameFromSameSite = false;
  try {
    cameFromSameSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
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
  const GLB_FILES = [
    'mobile.glb', 'note.glb', 'diamond.glb',
    'globe.glb', 'game.glb', 'chart.glb', 'email.glb',
    'camera.glb', 'sim.glb'
  ];
  const VIDEO_FILES = [
    '01.mp4', 'Genie2.mp4', 'IoT.mp4', 'Tracr.mp4', 'b2b.mp4'
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
      this.progressPct = document.getElementById('preloader-progress-pct');

      if (!this.preloader || !this.wordmark) return;

      this.premWord   = this.wordmark.querySelector('.pl-word-prem');
      this.designWord = this.wordmark.querySelector('.pl-word-design');
      this.dot        = this.wordmark.querySelector('.preloader-dot');

      this._loaded = 0;
      this._total  = GLB_FILES.length + VIDEO_FILES.length;
      this._readyToFinish = false;
      this._wordmarkDone  = false;

      const particlesEl = document.getElementById('particles');
      if (particlesEl) gsap.set(particlesEl, { opacity: 0 });

      console.log('[preloader] Constructor: starting loading + wordmark animation');
      this._startLoading();
      this._animateVisibleProgress();
      this._runWordmarkAnimation();
    }

    // ── Progress tracking ───────────────────────────────────────────────────
    // Real asset loading still gates _readyToFinish (below) — we don't
    // start the reveal before GLBs/videos are actually ready. But the
    // VISIBLE progress bar/percentage no longer tracks real fetch timing
    // (which is network-dependent and unpredictable); it's a fixed 1s
    // animation instead (see _animateVisibleProgress), for a consistent
    // feel regardless of connection speed.
    _startLoading() {
      const onProgress = () => {
        this._loaded++;
        if (this._loaded >= this._total) this._onAllLoaded();
      };

      GLB_FILES.forEach(file => {
        fetch(`/content/images/${file}`)
          .then(onProgress)
          .catch(onProgress);
      });

      VIDEO_FILES.forEach(file => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = onProgress;
        v.onerror = onProgress;
        v.src = `/content/images/videos/${file}`;
      });
    }

    // Fixed 1s 0→100% animation driving the visible progress bar/percentage,
    // independent of real asset-loading speed (see _startLoading above).
    _animateVisibleProgress() {
      const counter = { pct: 0 };
      gsap.to(counter, {
        pct: 100,
        duration: 1,
        ease: 'power1.out',
        onUpdate: () => this._setProgress(Math.round(counter.pct)),
      });
    }

    _setProgress(pct) {
      if (this.progressBar) this.progressBar.style.width = pct + '%';
      if (this.progressPct) this.progressPct.textContent = pct + '%';
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

      this._setProgress(100);

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

      getLoopWhenReady((sys) => {
        if (!sys) {
          console.warn('[preloader] particleSystem timeout — fallback');
          if (particlesEl) gsap.to(particlesEl, { opacity: 1, duration: 0.4 });
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
