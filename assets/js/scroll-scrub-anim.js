/**
 * Unified Scroll-Scrubbed Text Animation System
 * Handles all text reveals/exits tied to scroll position
 */

class ScrollScrubAnimationSystem {
  constructor() {
    this.config = {
      enterDuration: 0.9,
      staggerWord: 0.2,
      blurStart: '16px',
      blurEnd: '0px',
      yStart: 40,
      yEnd: -80
    };
  }

  init() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      console.warn('GSAP or ScrollTrigger not loaded');
      return;
    }

    // Hero: special handling
    this.initHero();

    // Profile: pinned section with scroll-driven entrance
    this.initProfile();

    // Portrait image: now lives in testimonials.hbs, not profile.hbs — see
    // initTestimonialsImage() for why this needs its own lifecycle.
    this.initTestimonialsImage();

    // Profile: reversed bg/text palette on entry. To disable, comment this
    // call out — all the CSS it drives (profile.css's .profile::before /
    // color-mix() rules, main.css's nav + theme-icon rules) defaults
    // gracefully to normal via its var(--profile-shift, 0) fallback the
    // moment nothing sets that property; nothing else needs reverting.
    // That graceful fallback is exactly what makes it safe to skip outright
    // on low-end devices: its bindShift() binding attaches a plain window
    // 'scroll' listener that calls getBoundingClientRect() on every scroll
    // event site-wide, for the rest of the page's life, regardless of
    // whether Profile is anywhere near the viewport — profiled under
    // simulated old hardware as the single largest source of scroll-jank
    // on the page, well above the particle system itself.
    if (!window.__lowEndDevice) {
      this.initProfileColorInvert();
    }

    // Lab grid liquid-glass ripple (images + text) — disabled. To re-enable,
    // uncomment the call below; initLabGlassEffect() itself is left intact.
    // this.initLabGlassEffect();

    // Other elements with data-animate
    this.initDataAnimateElements();
  }

  initLabGlassEffect() {
    // #work-grid-lab is the SAME element id particle-morph.hbs's own lab
    // trigger observes (its IntersectionObserver morphs particles to the
    // 'lab' shape on enter) — that trigger drives a different concern
    // (particle shape), not reused here.
    const section = document.getElementById('work-grid-lab');
    if (!section) return;
    if (!window.SurfaceEffectLayer) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = section.querySelectorAll('.grid-card-image');
    if (!cards.length) return;

    // center starts far outside [0,1] UV space for every instance below —
    // with the shader's inverted falloff (full effect everywhere, clears
    // near uCenter), an on-canvas default (e.g. the element center) would
    // show a phantom clear spot before the cursor ever actually reaches
    // that element. Off-canvas keeps everything at full, undisturbed
    // effect until a real mousemove supplies a real position.
    const OFFSCREEN_CENTER = { x: -10, y: -10 };

    // Renders `el`'s current text content into `canvas`, matching its
    // rendered font/size and the ORIGINAL color passed in (captured once,
    // before attachText hides the real text — see below; re-reading
    // getComputedStyle(el).color on later calls would just read back our
    // own 'transparent !important' override forever after). Re-called on
    // content/size change: this grid's category/description text populates
    // asynchronously per card (posts-tabs-grid.js's per-post metadata
    // fetch — see initGridCardMetadata()), so the first call here often
    // rasterizes an still-empty element.
    const rasterizeText = (el, canvas, color) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'top';
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const words = (el.textContent || '').trim().split(/\s+/).filter(Boolean);
      let line = '';
      let y = 0;
      words.forEach((word, i) => {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > w) {
          ctx.fillText(line, 0, y);
          line = word;
          y += lineHeight;
        } else {
          line = test;
        }
        if (i === words.length - 1) ctx.fillText(line, 0, y);
      });
    };

    // instances grows over time (image instances attach synchronously
    // below; text instances may attach later — see attachText) — the
    // mousemove listener at the bottom reads this array fresh on every
    // event, so late arrivals are picked up automatically, no extra wiring.
    const instances = [];

    // Attaches a text element the same way an image card does: rasterize
    // its current text onto an owned canvas, hand that to
    // SurfaceEffectLayer as the media source, and — only once a real
    // WebGL canvas actually landed in the DOM (attach() didn't silently
    // degrade to a no-op) — hide the real DOM text so only the shader's
    // (alpha-aware) redraw shows. If WebGL is unavailable, skip hiding the
    // color: real text just stays put, same "never break the page"
    // guarantee SurfaceEffectLayer already gives images/video.
    //
    // Timing matters here: this grid's category/description text populates
    // asynchronously per card, and posts-tabs-grid.js's initGridCardMetadata()
    // fills it in via `el.textContent = meta.whatever` — a plain assignment,
    // which discards ALL existing child nodes. Attaching eagerly (before
    // that fetch resolves) meant our freshly-appended WebGL canvas — a
    // child of that same element — got silently deleted the moment
    // metadata arrived, with nothing left in the DOM to refresh. So: wait
    // until the element already has real text (either it's already
    // populated, or wait for the first mutation that populates it) before
    // ever attaching, so no later textContent write can still be pending.
    const attachText = (el) => {
      if (!el) return;
      const doAttach = () => {
        // Captured once, before we ever hide the real text below — every
        // later re-rasterize (including ResizeObserver's own guaranteed
        // first-call-on-observe firing, which lands AFTER this function
        // already hid the color) reuses this same value instead of
        // re-reading getComputedStyle(el).color, which would just read
        // back our own 'transparent !important' forever after.
        const color = getComputedStyle(el).color;
        const canvas = document.createElement('canvas');
        rasterizeText(el, canvas, color);
        const handle = window.SurfaceEffectLayer.attach(el, {
          effect: 'liquid-glass',
          media: canvas,
          center: OFFSCREEN_CENTER,
        });
        if (!el.querySelector('canvas')) return;
        // !important: posts-tabs-grid.css sets `color ... !important` on
        // at least .grid-card-description — a plain inline style loses to
        // that; an inline !important is the one thing that still wins.
        el.style.setProperty('color', 'transparent', 'important');
        handle.set(1);
        instances.push({ el, handle });

        // Content is final now (the one-time metadata fetch already
        // happened) — only reflow (viewport resize etc.) needs a
        // re-rasterize from here on.
        let resizeTimer = null;
        new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            rasterizeText(el, canvas, color);
            handle.refreshTexture();
          }, 100);
        }).observe(el);
      };

      if (el.textContent.trim()) {
        doAttach();
      } else {
        const mo = new MutationObserver(() => {
          mo.disconnect();
          doAttach();
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
      }
    };

    cards.forEach((card) => {
      // Default media resolution (first img/video) would grab the empty
      // <video class="grid-card-video"> that sits before the fallback
      // <img> in markup order — it has no src until posts-tabs-grid.js's
      // per-post metadata fetch resolves, so it'd never be renderable for
      // most cards. The <img class="grid-card-image-fallback"> is always
      // present with a real src from first render.
      const media = card.querySelector('.grid-card-image-fallback');
      if (media) {
        const handle = window.SurfaceEffectLayer.attach(card, {
          effect: 'liquid-glass',
          media,
          center: OFFSCREEN_CENTER,
        });
        handle.set(1);
        instances.push({ el: card, handle });
      }
      // Text: the category label + headline description sitting below the
      // image, in the sibling .grid-card-content block (see
      // post-card-grid.hbs) — not a descendant of .grid-card-image itself.
      const article = card.closest('.grid-card');
      ['.grid-card-category', '.grid-card-description'].forEach((sel) => {
        attachText(article && article.querySelector(sel));
      });
    });

    // Cursor doesn't paint the effect on (there's nothing to turn on — it's
    // already everywhere); it clears a hole in it locally, radius = a third
    // of the viewport's smaller dimension, converted into each card's own
    // UV space since uRadius is relative to that card's box, not the
    // viewport. No "is the cursor over this card" gating needed: for cards
    // far from the cursor, the converted local position simply lands far
    // outside [0,1] too, so distance-from-center is already large and the
    // effect reads as fully present there without a separate branch.
    document.addEventListener('mousemove', (e) => {
      const radiusPx = Math.min(window.innerWidth, window.innerHeight) / 0.6;
      instances.forEach(({ el, handle }) => {
        const rect = el.getBoundingClientRect();
        handle.setUniform('radius', radiusPx / Math.max(rect.width, rect.height));
        // v=0 is the bottom of the shader's UV space (UNPACK_FLIP_Y_WEBGL
        // upload), clientY grows downward — flip so the clear spot lands
        // under the actual cursor, not mirrored vertically.
        handle.setCenter({
          x: (e.clientX - rect.left) / rect.width,
          y: 1 - (e.clientY - rect.top) / rect.height,
        });
      });
    }, { passive: true });
  }

  initProfileColorInvert() {
    const section = document.querySelector('.profile');
    if (!section) return;
    if (!window.BackgroundLayer) { console.warn('[profile] BackgroundLayer not loaded'); return; }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Particles: blend toward the OPPOSITE theme's particle colour, off the
    // SAME scroll-driven progress as the background panel/text (see bindShift
    // below). Mirrors the theme-aware --shift-bg/--shift-ink tokens: a light
    // site shifts to a dark panel (white particles), a dark/dim site shifts
    // to a light panel (the light theme's own dark-teal particles). Both
    // sides are looked up fresh from data-theme every call, not cached — so
    // a site theme toggle at any point just works, nothing to reconcile.
    const PARTICLE_NORMAL = { dark: '#1D4551', light: '#17516E' }; // mirrors default.hbs's --color-particles
    const PARTICLE_SHIFTED = {
      light: { r: 255, g: 255, b: 255 },  // light site → dark panel → white particles
      dark:  { r: 23, g: 81, b: 110 },    // dark/dim site → light panel → #17516E (light theme's particle colour)
    };

    const invertParticles = (t) => {
      // Note: the CSS var is written even if the particle system isn't up
      // yet (early return used to skip both, which left particles unshifted
      // if the user scrolled into profile before particles finished
      // initializing and then stopped scrolling — seen as a transient in
      // Firefox testing). With the var always current, the system picks the
      // right color up on its own next updateColors()/init read.

      // The particle canvas is a fixed, always-visible, full-viewport layer
      // — unlike the background panel (painted only within .profile's own
      // box, so it's naturally invisible until some of that box is on
      // screen), particles have no such spatial gating. Sharing the raw
      // enter-ramp `t` directly meant particles visibly started shifting a
      // full viewport-height BEFORE any of profile's own content (panel,
      // text) was on screen — reading as "particles change during the
      // previous section," not as part of profile's own reveal. Cubing t
      // keeps this subtle through most of the approach and only catches up
      // rapidly once profile is substantially on screen (t already close to
      // 1), so it reads as simultaneous with the panel/text instead of an
      // early, disconnected cue. Monotonic in both directions, so no
      // special-casing needed for the exit ramp (t decreasing 1->0).
      const particleT = t * t * t;

      if (particleT <= 0) {
        document.documentElement.style.removeProperty('--color-particles');
      } else {
        const isLightSite = document.documentElement.getAttribute('data-theme') === 'light';
        const normal = window.BackgroundLayer.parseColorToRGB(isLightSite ? PARTICLE_NORMAL.light : PARTICLE_NORMAL.dark);
        const shifted = isLightSite ? PARTICLE_SHIFTED.light : PARTICLE_SHIFTED.dark;
        const r = Math.round(normal.r + (shifted.r - normal.r) * particleT);
        const g = Math.round(normal.g + (shifted.g - normal.g) * particleT);
        const b = Math.round(normal.b + (shifted.b - normal.b) * particleT);
        document.documentElement.style.setProperty('--color-particles', `rgb(${r}, ${g}, ${b})`);
      }
      window.particleSystem?.updateColors?.();
    };

    // Background panel + text (see profile.css) and nav (see main.css) all
    // read --profile-shift directly via color-mix()/opacity — this just
    // drives that one number. scroll-position-driven, not a time-based CSS
    // transition, so it can't fall behind on a fast scroll. Set at :root
    // (the default) so the fixed nav can read it too.
    // Zone rule: the profile always flips to the OPPOSITE palette, but
    // everything from testimonials onward should always end up LIGHT.
    // Because the dark/dim shift target IS light, that collapses to a
    // theme-dependent zone end:
    //   dark/dim → hold the (light) shifted palette to the FOOTER's bottom,
    //              i.e. the end of the page — it never reverses;
    //   light    → the zone is the profile alone; the exit ramp at its
    //              bottom returns to the normal light palette exactly as
    //              testimonials enters.
    // endTrigger is a function so this resolves fresh every frame (and on
    // data-theme mutations — bindShift watches those): a theme toggle
    // mid-scroll just works. Bonus of this rule: at full shift the
    // dark-shifted palette and normal light palette are the same colours,
    // so toggling while inside testimonials/footer is visually seamless.
    // One binding spanning the whole zone (see bindShift for why this must
    // NOT be several bindings, one per section). Every section inside the
    // zone needs the --shift-ink color-mix treatment for its text
    // (profile.css + the testimonials/footer blocks in main.css).
    const zoneEnd = document.querySelector('.gh-footer')
      || document.querySelector('.testimonials-section');

    // NOTE: liquid-glass (SurfaceEffectLayer) does NOT attach to the
    // portrait — deliberately. The portrait's job is legibility of the
    // face as the page's authenticity signal; refraction/chromatic
    // fringing on hairlines/eyes/jaw reads as artifice exactly when the
    // page is earning trust. Legal targets for the effect are the
    // particle field zone, section boundaries, and Lab-card hover (see
    // initLabGlassEffect()) — not this element. If a portrait beat is
    // ever wanted, it should be a single <200ms shimmer pulse at reveal
    // entry, never a persistent scroll-scrubbed lens.
    window.BackgroundLayer.bindShift(section, '--profile-shift', {
      endTrigger: () => {
        const isLightSite = document.documentElement.getAttribute('data-theme') === 'light';
        return isLightSite ? section : zoneEnd;
      },
      onProgress: invertParticles,
    });
  }

  initHero() {
    const heading = document.getElementById('hero-headline');
    if (!heading) return;

    // Skip if already animated (prevents double-animation)
    if (heading.getAttribute('data-hero-animated') === 'true') {
      console.log('[scroll-scrub-anim] Hero already animated, skipping');
      return;
    }
    heading.setAttribute('data-hero-animated', 'true');

    // Split into 2-word line groups (creates display:block spans → always 2 lines)
    const lines = this.splitText(heading, 'word');
    const hero = document.querySelector('.hero');

    // Make heading container visible; spans start at opacity:0 from splitText
    gsap.set(heading, { visibility: 'visible' });

    gsap.delayedCall(0.01, () => {
      // Particles form into helix alongside hero's own entrance — this is
      // the "hero content and image are there" moment (this callback only
      // runs once initHero() itself has been invoked, which only happens
      // after preloader:done / cached-visit immediate-start, so hero is
      // always actually present here). Previously this was tied to the
      // preloader's own burst+settle timing instead, which fired before
      // hero was revealed — see COMMON_ISSUES.md.
      //
      // window.particleSystem itself may not exist yet at this exact point:
      // particle-morph.hbs's init is async (awaits THREE.js + GLB loading),
      // and on a FULL preloader run there's several seconds of preloader
      // animation covering that — but on a cached/skip-path visit,
      // preloader:done (and thus this callback, ~10ms later) fires almost
      // immediately, well before that async chain has necessarily finished.
      // The old direct `window.particleSystem?.morphTo?.(...)` call silently
      // no-op'd via optional chaining whenever it lost that race, with
      // nothing ever retrying — seen as "helix sometimes just doesn't
      // happen on load, no clear pattern," since it depended on exactly how
      // that race landed on a given load. Poll instead, matching the same
      // pattern preloader.js already uses (getLoopWhenReady) for the same
      // "wait for the particle system to actually exist" problem.
      let attempts = 0;
      const maxAttempts = 100; // 100 * 80ms = 8s, matching preloader.js's own timeout for this
      const waitForParticleSystemThenMorph = () => {
        if (window.particleSystem?.morphTo) {
          window.particleSystem.morphTo('helix', 3000);  // Slowed from 600ms to 1200ms
        } else if (attempts++ < maxAttempts) {
          setTimeout(waitForParticleSystemThenMorph, 80);
        } else {
          console.warn('[scroll-scrub-anim] particleSystem never became ready — helix morph skipped');
        }
      };
      waitForParticleSystemThenMorph();

      // Entrance: stagger eyebrow, then headline lines in sequence
      const intro = hero.querySelector('.hero-intro');
      const allItems = intro ? [intro, ...lines] : lines;  // Eyebrow first, then headline lines

      gsap.fromTo(allItems,
        { opacity: 0, filter: `blur(${this.config.blurStart})`, y: this.config.yStart },
        {
          opacity: 1,
          filter: `blur(${this.config.blurEnd})`,
          y: 0,
          duration: this.config.enterDuration,
          stagger: 0.12,
          ease: 'power2.out'
        }
      );

      // Entrance: animate description in after headline
      const description = hero.querySelector('.hero-description');
      if (description) {
        gsap.fromTo(description,
          { opacity: 0, filter: `blur(${this.config.blurStart})`, y: this.config.yStart },
          {
            opacity: 1,
            filter: `blur(${this.config.blurEnd})`,
            y: 0,
            duration: this.config.enterDuration,
            ease: 'power2.out'
          },
          0.35  // Delay after headline animation starts
        );
      }
    });

    // Exit: individual hero elements animate out on scroll
    if (hero) {
      // Image: independent of the text exit below — its own scrub-linked
      // ScrollTrigger, not part of `exitTl`. Pure x-axis slide off to the
      // RIGHT (mirrors the profile-image pattern in initProfile() below,
      // which slides its image off to x:500 rather than off to the left),
      // with no y movement, so the image reads as pinned in place until it
      // slides away — instead of drifting left+up together with the text.
      // A `scrub`-driven ScrollTrigger is inherently bidirectional: scrolling
      // back up through this same range naturally reverses the tween,
      // sliding the image back in from right to left as hero re-enters view
      // — no separate "reverse" logic needed, the scrub IS the reverse.
      const imageWrapper = hero.querySelector('.hero-image-wrapper');
      if (imageWrapper) {
        gsap.timeline({
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: '+=80%',
            scrub: 0.5,
            markers: false
          }
        }).fromTo(imageWrapper,
          { x: 0 },
          { x: '120%', duration: 1, ease: 'power2.in' },
          0
        );
      }

      const exitTl = gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=80%',     // Faster exit — completes over 80% of viewport height
          scrub: 0.5,
          markers: false
        }
      });

      // Intro line slides up + left
      const intro = hero.querySelector('.hero-intro');
      if (intro) {
        exitTl.fromTo(intro,
          { x: 0, y: 0 },
          { x: '-80vw', y: -160, duration: 0.5, ease: 'power2.in' },
          0
        );
      }

      // Headline slides up + left off screen
      exitTl.fromTo(heading,
        { x: 0, y: 0 },
        { x: '-100vw', y: -220, duration: 0.5, ease: 'power2.in' },
        0.05
      );

      // Description slides up + left
      const description = hero.querySelector('.hero-description');
      if (description) {
        exitTl.fromTo(description,
          { x: 0, y: 0 },
          { x: '-70vw', y: -160, duration: 0.5, ease: 'power2.in' },
          0.1
        );
      }
    }
  }

  initProfile() {
    const section = document.querySelector('.profile');
    if (!section) { console.warn('[profile] .profile not found'); return; }

    const bg           = section.querySelector('.profile-bg');
    const intro        = section.querySelector('.profile-intro');
    const headline     = section.querySelector('.profile-headline');
    const description  = section.querySelector('.profile-description');
    const tags         = section.querySelector('.profile-tags');

    if (!bg) { console.warn('[profile] .profile-bg not found'); return; }

    // On mobile: CSS sets display:flex and handles layout — nothing to do
    if (window.innerWidth <= 1024) { console.log('[profile] mobile — skipping JS'); return; }

    const textEls = [intro, tags].filter(Boolean);  // Exclude headline and description
    const descSpans = description ? Array.from(description.querySelectorAll('[data-animate="slide-left"]')) : [];

    // Split headline into letters using the same pattern as heading-animations.js
    let headlineLetters = [];
    if (headline) {
      const text = headline.textContent.trim();
      headline.innerHTML = '';
      const letters = [];
      for (const char of text) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = char;
        headline.appendChild(span);
        letters.push(span);
      }
      headlineLetters = letters;
    }

    // Set initial hidden states (intro, tags, description spans, and headline)
    if (textEls.length) gsap.set(textEls, { opacity: 0, y: 40 });
    if (descSpans.length) {
      descSpans.forEach(span => span.style.display = 'inline-block');
      gsap.set(descSpans, { opacity: 0, x: 100 });
    }
    if (headlineLetters.length) {
      // y added — was opacity-only (a plain fade), unlike every other
      // slide-up reveal on this page (.profile-paragraph via card-scroll-
      // reveal.js's "default" variant, y:48→0). Per-letter offset kept
      // smaller than the paragraph's 48px — that's tuned for one block
      // moving, not dozens of individual characters staggering in.
      // opacity fully 0 (not 0.1) — a visible dim "ghost" of unrevealed
      // text before the reveal fires was a regression, not an improvement.
      gsap.set(headlineLetters, { opacity: 0, y: 24 });
      gsap.set(headline, { opacity: 1 });
    }

    // Headline: mark as animated so scroll-scrub doesn't process it
    if (headline) headline.setAttribute('data-heading-anim-done', 'true');

    let isVisible = false;
    let pendingState = null;
    let debounceTimer = null;
    let enterTl = null;
    let exitTl = null;

    // Kill any running animations before starting new ones
    const killAnimations = () => {
      if (enterTl) { enterTl.kill(); enterTl = null; }
      if (exitTl) { exitTl.kill(); exitTl = null; }
    };

    // Debounce observer callbacks to prevent rapid re-triggering
    const scheduleStateChange = (shouldBeVisible) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      pendingState = shouldBeVisible;
      debounceTimer = setTimeout(() => {
        if (pendingState === shouldBeVisible) {
          if (shouldBeVisible) {
            animateIn();
          } else {
            animateOut();
          }
        }
      }, 50); // 50ms debounce
    };

    const animateIn = () => {
      if (isVisible) return; // Guard: already visible
      isVisible = true;
      killAnimations(); // Kill any conflicting exit animation
      console.log('[profile] Animate IN');
      bg.style.display = 'flex';
      enterTl = gsap.timeline();

      // Reuses heading-animations.js's own computeLetterStagger (shrinks
      // toward a tiny, fast gap as letter count grows — already correct
      // and fast for long headlines — capped so short ones can't get an
      // inflated gap) and its original duration/easing, back from the
      // 0.3s/'none' overlap experiment: that made long headlines slower
      // than before, the opposite of what was wanted.
      if (headlineLetters.length) {
        const charStagger = window.computeLetterStagger
          ? window.computeLetterStagger(headlineLetters.length)
          : 0.02;

        enterTl.to(headlineLetters,
          { opacity: 1, y: 0, duration: 0.14, ease: 'power1.out', stagger: charStagger },
          0
        );
      }

      // Animate intro and tags only (blur + y)
      if (textEls.length) {
        enterTl.fromTo(textEls,
          { opacity: 0, y: 40, filter: 'blur(16px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.15, duration: 0.9, ease: 'power2.out' },
          0.1
        );
      }

      // Animate description spans with slide-right stagger (starts earlier via scroll trigger)
      if (descSpans.length) {
        // Also add scroll-triggered animation for earlier start (well before section visible)
        gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'bottom 0%',    // Start when section bottom is at TOP of viewport (much earlier)
            end: 'top 500px',        // End when section top reaches middle of viewport
            scrub: 1
          }
        })
        .fromTo(descSpans,
          { opacity: 0, x: 400 },
          { opacity: 1, x: 0, ease: 'none', stagger: 0.1 },
          0
        );

        // Also add the immediate animation for entrance (slower)
        descSpans.forEach((span, i) => {
          enterTl.fromTo(span,
            { opacity: 0, x: 400 },
            { opacity: 1, x: 0, duration: 0.5, ease: 'power2.in' },
            0.15 + (i * 0.15)
          );
        });
      }
    };

    const animateOut = () => {
      if (!isVisible) return; // Guard: already hidden
      isVisible = false;
      killAnimations(); // Kill any conflicting enter animation
      console.log('[profile] Animate OUT');
      exitTl = gsap.timeline({
        onComplete: () => {
          bg.style.display = 'none';
        }
      });

      // Hide intro and tags only (headline and description stay visible for their animations)
      if (textEls.length) {
        exitTl.set(textEls, { opacity: 0, y: 40 }, 0);
      }
    };

    // ── IntersectionObserver with guard conditions ──
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            scheduleStateChange(true);
          } else if (!entry.isIntersecting && isVisible) {
            scheduleStateChange(false);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(section);
  }

  initTestimonialsImage() {
    // The portrait (.profile-image-wrapper) used to live inside .profile,
    // where initProfile()'s own IntersectionObserver slid it in/out as part
    // of that section's enter/exit lifecycle. It's since been moved into
    // testimonials.hbs, but nothing updated the animation to match — so
    // initProfile()'s `section.querySelector('.profile-image-wrapper')`
    // silently returned null (the element is no longer a descendant of
    // .profile), every `if (imageWrapper)` guard was false, and the image
    // just sat at its bare CSS state (position: fixed, no opacity/transform
    // ever applied) — fixed-position and always visible, on every page,
    // from first paint, regardless of scroll position. This gives it its
    // own lifecycle tied to wherever it actually lives now, reusing the
    // exact same slide-in/out animation initProfile() used to apply.
    const section = document.querySelector('.testimonials-section');
    const imageWrapper = document.querySelector('.profile-image-wrapper');
    if (!section || !imageWrapper) return;

    // On mobile: CSS sets display:flex and handles layout — nothing to do
    // (mirrors initProfile()'s own mobile guard, since the CSS clauses this
    // relies on are the same profile.css rules written for that layout).
    if (window.innerWidth <= 1024) return;

    // '100%' (relative to the element's own rendered width) rather than a
    // fixed pixel offset — the wrapper is 40vw wide, so a hardcoded value
    // like the original 500px left a visible sliver peeking in at some
    // viewport widths instead of fully clearing it.
    gsap.set(imageWrapper, { x: '100%' });

    let isVisible = false;
    let pendingState = null;
    let debounceTimer = null;
    let tween = null;

    const scheduleStateChange = (shouldBeVisible) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      pendingState = shouldBeVisible;
      debounceTimer = setTimeout(() => {
        if (pendingState !== shouldBeVisible) return;
        isVisible = shouldBeVisible;
        if (tween) tween.kill();
        tween = shouldBeVisible
          ? gsap.fromTo(imageWrapper, { x: '100%' }, { x: 0, duration: 0.7, ease: 'power2.out' })
          : gsap.to(imageWrapper, { x: '100%', duration: 0.8, ease: 'power2.in' });
      }, 50);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) scheduleStateChange(true);
          else if (!entry.isIntersecting && isVisible) scheduleStateChange(false);
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(section);
  }

  initDataAnimateElements() {
    document.querySelectorAll('[data-animate]').forEach((el) => {
      // Skip if marked to skip
      if (el.getAttribute('data-skip-animation') === 'true') return;

      // Skip if already animated
      if (el.getAttribute('data-anim-done') === 'true') return;

      // Skip hero and most profile elements, but allow headline and description (including child spans)
      if (el.closest('.hero')) return;
      if (el.closest('.profile') && !el.matches('.profile-headline') && !el.matches('.profile-description') && !el.closest('.profile-description')) return;

      // Skip elements inside data-skip-reveal sections (testimonials, etc.)
      if (el.closest('[data-skip-reveal]')) return;

      // Skip if heading-animations.js already owns this element — it uses
      // IntersectionObserver + SplitType and calling splitText() here would
      // wipe out its word spans with innerHTML='', breaking line breaks
      // across the entire page.
      if (el.getAttribute('data-heading-anim-done') === 'true') return;

      // Skip if already animated
      if (el.getAttribute('data-anim-done') === 'true') return;
      el.setAttribute('data-anim-done', 'true');

      const animType = el.getAttribute('data-animate');
      const section = el.closest('section') || el.closest('[id]');

      if (!section) return;

      // Handle slide-left animation (no text splitting needed)
      if (animType === 'slide-left') {
        const customDuration = el.getAttribute('data-duration') ? parseFloat(el.getAttribute('data-duration')) : this.config.enterDuration;
        const itemStagger = el.getAttribute('data-item-stagger') ? parseFloat(el.getAttribute('data-item-stagger')) : 0;
        const itemIndex = el.getAttribute('data-item-index') ? parseInt(el.getAttribute('data-item-index')) : 0;
        const itemDelay = itemStagger * itemIndex;
        const slideDistance = el.getAttribute('data-slide-distance') ? parseFloat(el.getAttribute('data-slide-distance')) : 100;

        const rect = el.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
          // Visible: animate immediately
          gsap.fromTo(el,
            { opacity: 0, x: -slideDistance },
            {
              opacity: 1,
              x: 0,
              duration: customDuration,
              ease: 'power2.out',
              delay: itemDelay
            }
          );
        } else {
          // Below fold: scroll-triggered
          gsap.set(el, { opacity: 1, x: 0 });
          gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: 'bottom 100%',
              end: 'top 85%',
              scrub: 1
            }
          })
          .fromTo(el,
            { opacity: 0, x: -slideDistance },
            { opacity: 1, x: 0, ease: 'none', delay: itemDelay },
            0
          );
        }
        return;
      }

      // Split text for letter/word animations
      const elements = this.splitText(el, animType);
      if (elements.length === 0) return;

      const stagger = animType === 'letter' ? 0.02 : this.config.staggerWord;
      const noSlide = el.getAttribute('data-no-slide') === 'true';

      // Custom timing attributes (for operating-model, etc.)
      const customDuration = el.getAttribute('data-duration') ? parseFloat(el.getAttribute('data-duration')) : this.config.enterDuration;
      const customYStart = el.getAttribute('data-y-start') ? parseFloat(el.getAttribute('data-y-start')) : this.config.yStart;
      const itemStagger = el.getAttribute('data-item-stagger') ? parseFloat(el.getAttribute('data-item-stagger')) : 0;
      const itemIndex = el.getAttribute('data-item-index') ? parseInt(el.getAttribute('data-item-index')) : 0;

      const yStart = noSlide ? 0 : customYStart;
      const yEnd = noSlide ? 0 : this.config.yEnd;
      const itemDelay = itemStagger * itemIndex;  // Delay for this item relative to first

      // Only run entrance animation if element is in viewport
      const rect = el.getBoundingClientRect();
      const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

      if (isInViewport) {
        // Entrance animation for visible elements (no blur on slide animations)
        gsap.fromTo(elements,
          { opacity: 0, y: yStart },
          {
            opacity: 1,
            y: 0,
            duration: customDuration,
            stagger: stagger,
            ease: 'none',
            delay: itemDelay  // Stagger between items
          }
        );
      } else {
        // Below-fold: start visible, scroll animations control visibility
        gsap.set(elements, { opacity: 1, y: 0 });

        // Scroll-reveal: animate in as section enters viewport
        const triggerStart = el.getAttribute('data-trigger-start') || 'bottom 100%';
        const entranceEase = el.getAttribute('data-entrance-ease') || 'none';
        gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: triggerStart,   // Custom or default start position
            end: 'top 85%',        // End when section top reaches 85% of viewport
            scrub: 1
          }
        })
        .fromTo(elements,
          { opacity: 0, y: yStart },
          { opacity: 1, y: 0, stagger: stagger, ease: entranceEase, delay: itemDelay },
          0
        );
      }

      // Scroll-scrubbed exit (blur out on scroll past section)
      // Skip exit animation for elements marked with data-no-exit
      if (el.getAttribute('data-no-exit') !== 'true') {
        const exitEase = el.getAttribute('data-exit-ease') || 'none';
        gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'bottom 85%',  // Start when section bottom reaches 85% of viewport
            end: 'bottom 35%',    // End when section bottom reaches 35% of viewport
            scrub: 1,
            markers: false
          }
        })
        .fromTo(elements,
          { opacity: 1, y: 0 },
          { opacity: 0, y: yEnd, stagger: stagger * 1.8, ease: exitEase, delay: itemDelay },
          0
        );
      }
    });
  }

  splitText(el, type) {
    // Skip if already split (prevents double-splitting with space loss)
    if (el.getAttribute('data-split-done') === 'true') {
      return Array.from(el.querySelectorAll('.animate-letter, .animate-word'));
    }

    const text = el.textContent.trim();
    const isLetter = type === 'letter';

    el.innerHTML = '';
    el.setAttribute('data-split-done', 'true');

    if (isLetter) {
      // Letter-by-letter: split each character
      const units = text.split('');
      const elements = [];
      units.forEach((unit) => {
        if (!unit.trim()) return;
        const span = document.createElement('span');
        span.className = 'animate-letter';
        span.style.display = 'inline-block';
        span.style.opacity = '0';  // Only opacity, parent's visibility controls
        span.textContent = unit;
        el.appendChild(span);
        elements.push(span);
      });
      return elements;
    } else {
      // Word-by-word or line-by-line: group words (2 per line for line mode)
      const words = text.split(/\s+/);
      const elements = [];
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        currentLine += (currentLine ? ' ' : '') + words[i];
        // Group 2 words per line, or on last word
        if ((i + 1) % 2 === 0 || i === words.length - 1) {
          const span = document.createElement('span');
          span.className = 'animate-word';
          span.style.display = 'block';
          span.style.opacity = '0';  // Only opacity, parent's visibility controls
          // Trailing space so spans don't stick together when rendered inline —
          // must be a non-breaking space: a plain trailing space gets visually
          // trimmed at the edge of a `display: inline-block` box (the CSS for
          // .animate-word forces inline-block via !important), silently
          // swallowing the gap between consecutive word-group spans.
          span.textContent = currentLine.trim() + (i === words.length - 1 ? '' : ' ');
          el.appendChild(span);
          elements.push(span);
          currentLine = '';
        }
      }

      return elements;
    }
  }
}

// Wait for GSAP to be ready
function initScrollScrubAnimSystem() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    setTimeout(initScrollScrubAnimSystem, 100);
    return;
  }

  // System handles visibility and opacity — no pre-animation state needed here
  const system = new ScrollScrubAnimationSystem();
  system.init();
  window.ScrollScrubAnimationSystem = system;
}

// Start initialization after preloader completes.
//
// Three cases:
//   1. No preloader element on the page (non-homepage) → start immediately.
//   2. Cached visit: preloader.js sets window.__preloaderSkipped = true and
//      adds the "page-ready" class synchronously before dispatching
//      preloader:done via setTimeout(0). By the time this script runs,
//      __preloaderSkipped is already true → start immediately (no delay).
//   3. First visit: preloader runs its full sequence and fires preloader:done
//      when it fades out. Listen for that event normally.
//
// The previous approach wrapped the listener in setTimeout(100), which caused
// the event to be missed on cached visits (event fired at ~0 ms, listener
// registered at 100 ms) → hero waited for the 5 s fallback.

(function() {
  // Case 1: no preloader on this page
  if (!document.getElementById('preloader')) {
    console.log('[scroll-scrub-anim] no preloader — initializing immediately');
    initScrollScrubAnimSystem();
    return;
  }

  // Case 2: cached visit — preloader was skipped, page-ready already set
  if (window.__preloaderSkipped || document.documentElement.classList.contains('page-ready')) {
    console.log('[scroll-scrub-anim] preloader skipped (cached) — initializing immediately');
    initScrollScrubAnimSystem();
    return;
  }

  // Case 3: first visit — wait for preloader:done
  window.addEventListener('preloader:done', () => {
    console.log('[scroll-scrub-anim] preloader:done — initializing animations');
    initScrollScrubAnimSystem();
  }, { once: true });

  // Safety fallback: if preloader:done never fires (e.g. preloader crash), start after 8s
  setTimeout(() => {
    if (typeof window.ScrollScrubAnimationSystem === 'undefined') {
      console.log('[scroll-scrub-anim] safety fallback (8s) — initializing animations');
      initScrollScrubAnimSystem();
    }
  }, 8000);
})();
