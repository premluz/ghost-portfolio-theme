/**
 * Unified Scroll-Scrubbed Text Animation System
 * Handles all text reveals/exits tied to scroll position
 */

class ScrollScrubAnimationSystem {
  constructor() {
    this.config = {
      enterDuration: 0.9,
      staggerWord: 0.2,
      // Low-end: no blur in scrubbed reveals. A scrub-driven filter:blur()
      // re-runs a Gaussian blur over the text EVERY scroll frame — among
      // the most expensive paints an old integrated GPU can do. With 0px
      // start == end, GSAP still tweens but the filter is a visual no-op
      // and the browser skips the blur pass; the opacity/y motion carries
      // the reveal on that tier.
      blurStart: window.__lowEndDevice ? '0px' : '16px',
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

    // LOW-END: route scrolling through GSAP's own rAF pipeline.
    // Symptom on old integrated-GPU machines: scrub animations do not
    // update AT ALL during continuous scrolling and snap to their end
    // state when scrolling stops — native scroll runs on the compositor
    // thread while main-thread rAF starves. normalizeScroll intercepts
    // wheel/touch input and drives the scroll itself from the same tick
    // that updates ScrollTriggers, so the two cannot desynchronize —
    // GSAP's canonical fix for exactly this failure mode. Gated to
    // low-end so capable machines keep untouched native scrolling.
    // NEVER on touch devices (2026-08-29). normalizeScroll replaces native
    // touch scrolling with a synthetic, main-thread-driven version, and on
    // phones that reads as: first swipe is swallowed (or moves a few px)
    // and only the SECOND one actually scrolls — worst over interactive
    // elements like the homepage cards, where it has to disambiguate
    // tap-from-drag before it will commit to a scroll.
    //
    // Mobile was never the target of this fix: the failure mode described
    // above is a DESKTOP one (old integrated GPUs starving main-thread rAF
    // while the compositor scrolls on). Phones were caught only because
    // device-capability.js flags `hardwareConcurrency <= 4` as low-end,
    // which is true of a large share of current mid-range Androids and
    // older iPhones — hardware that scrolls natively just fine.
    //
    // matchMedia('(pointer: coarse)') rather than a UA sniff or a width
    // check: it asks the only question that matters here — is the primary
    // input a finger? — and stays correct on tablets, touch laptops in
    // tablet mode, and whatever ships next.
    var isTouchPrimary = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (window.__lowEndDevice && !isTouchPrimary && ScrollTrigger.normalizeScroll) {
      ScrollTrigger.normalizeScroll(true);
      console.log('[scroll-scrub-anim] low-end device: ScrollTrigger.normalizeScroll enabled');
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
      // Query .grid-card-image-fallback specifically, not a generic first
      // img/video lookup — posts-tabs-grid.js replaces this element's
      // content with a <video> entirely for cards with video metadata
      // (async, per-post fetch), so at first render the <img> is the only
      // media guaranteed to exist with a real src.
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
    // No .profile on this page (the homepage — profile.hbs is only included
    // by about.hbs/page-about.hbs): testimonials still wants the inverted
    // palette, so bind it directly instead of returning outright.
    //
    // Testimonials never had a binding of its own — it inverted as a
    // PASSENGER, first on the `endTrigger: zoneEnd` extension of this
    // function's own binding (below), and later on an invert-mode
    // gradient-frame that wrapped it on the homepage. With .profile absent
    // AND that frame removed (index.hbs, now commented out) nothing writes
    // a non-zero shift on the homepage at all: --profile-shift resolves to
    // max(0,0,0,0) for testimonials' whole scroll range, so its text
    // rendered at the un-blended base colour (measured: pure white snippet
    // through the entire section). See COMMON_ISSUES.md.
    if (!section) {
      // TO RE-ENABLE THE TESTIMONIALS INVERT: uncomment the call below.
      // (It is the whole switch — initTestimonialsColorInvert() itself is
      // left intact further down this file, and every CSS rule it drives
      // already defaults gracefully to the normal palette via
      // var(--profile-shift, 0) when nothing writes the property. Nothing
      // else needs reverting either way.)
      // DISABLED (2026-08-22, explicit request: turn off the testimonials
      // page invert). This is the real driver — a scroll-scrubbed
      // BackgroundLayer.bindShift on --gradient-shift-3, entirely separate
      // from the .invert-wrapper--page/data-invert-timed markup in
      // testimonials.hbs (also disabled). Removing the wrapper alone left
      // the invert visible because THIS binding was still running.
      // this.initTestimonialsColorInvert();
      return;
    }
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
    const PARTICLE_NORMAL = { dark: '#1D4551', light: '#082A3C' }; // mirrors default.hbs's --color-particles
    const PARTICLE_SHIFTED = {
      light: { r: 255, g: 255, b: 255 },  // light site → dark panel → white particles
      dark:  { r: 8, g: 42, b: 60 },      // dark/dim site → light panel → #082A3C (light theme's particle colour)
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
      // QUANTIZED to 1/25 steps, and heavy work skipped when the step
      // hasn't changed: this runs on every scroll frame through both shift
      // ramps, and each un-throttled call did a GPU-backed canvas readback
      // (parseColorToRGB -> getImageData) plus updateColors() = full 16k
      // color regen + attribute re-upload — measured as a per-frame GPU
      // pipeline stall ("ReadPixels" driver warnings) that starved rAF on
      // old integrated GPUs. 25 color steps are visually identical to
      // continuous for a cubic ramp.
      const particleT = Math.round(t * t * t * 25) / 25;
      if (particleT === invertParticles.__lastT) return;
      invertParticles.__lastT = particleT;

      if (particleT <= 0) {
        document.documentElement.style.removeProperty('--color-particles');
      } else {
        const isLightSite = document.documentElement.getAttribute('data-theme') === 'light';
        // memoized per theme — the "normal" endpoint colors are constants
        const cacheKey = isLightSite ? 'light' : 'dark';
        invertParticles.__normalCache = invertParticles.__normalCache || {};
        const normal = invertParticles.__normalCache[cacheKey] ||
          (invertParticles.__normalCache[cacheKey] = window.BackgroundLayer.parseColorToRGB(isLightSite ? PARTICLE_NORMAL.light : PARTICLE_NORMAL.dark));
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
    // Zone rule: the shift zone is ALWAYS just the profile section itself —
    // it reverses back to normal palette at the profile's bottom edge on
    // ALL pages (homepage, about, etc.) and ALL themes (light/dark/dim).
    // Footer is explicitly excluded from the shift zone. If testimonials
    // exists (homepage), it appears in normal palette. On pages without
    // testimonials (about page), the shift still reverses after profile.
    // endTrigger can extend to testimonials if needed, but NOT to footer.
    const testimonials = document.querySelector('.testimonials-section');
    const zoneEnd = testimonials || section; // Extend through testimonials if present, otherwise just profile

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
      endTrigger: zoneEnd, // Static element, not theme-dependent anymore
      enterOffset: 0.3, // Delay enter ramp - shift starts 0.3vh after profile top enters viewport (prevents hero shading)
      exitOffset: 0.3, // Delay exit ramp - shift holds 1.0vh longer before reverting (prevents early fade)
      // quantize: this binding was the one bindShift() caller WITHOUT it.
      // bindShift's own doc explains why that matters: --profile-shift is
      // read by the nav's glass layer (backdrop-filter: blur(32px), see
      // main.css), and every distinct value written to it forces a
      // full-width blur re-rasterization there. Without quantize, apply()
      // writes a new float on nearly every scroll frame for the whole
      // profile+testimonials zone (endTrigger extends it through
      // testimonials) — unthrottled per-frame GPU blur cost tied directly
      // to scrolling that section. gradient-frame.js's own binding already
      // sets quantize: 0.05 with the comment "cuts nav backdrop-blur
      // repaints" — same variable, same mechanism, this call site just
      // never got it. 0.05 (~20 steps) matches that precedent; the doc
      // comment on bindShift notes that's indistinguishable from continuous
      // for a colour blend.
      quantize: 0.05,
      onProgress: invertParticles,
    });
  }

  // Testimonials' own palette-shift binding, used ONLY when there is no
  // .profile on the page to carry it (see initProfileColorInvert's early
  // branch). Consumes an INDEXED slot (--gradient-shift-N), never
  // --profile-shift directly: that property is derived in CSS as
  // max(--gradient-shift-0..3) precisely so multiple writers can't race
  // (gradient-frame.css / gradient-frame.js — two frames writing the shared
  // property directly is a bug that already happened once, where a
  // correctly-near-zero off-screen frame overwrote testimonials' correct 1).
  // Slot 3 is the last of the four; frames claim 0,1,2… in DOM order, and
  // the homepage currently mounts none, so taking the top slot keeps this
  // out of their way without needing to coordinate a counter across files.
  //
  // No onProgress particle inversion here, unlike profile's binding: that
  // ramp is cubed specifically to sync with .profile's own reveal, and
  // testimonials sits far enough down that the particle layer is hidden by
  // the scenario map anyway. Text/nav/surface blending is what's wanted, and
  // that all reads --profile-shift from CSS with no JS involvement.
  initTestimonialsColorInvert() {
    const testimonials = document.querySelector('.testimonials-section');
    if (!testimonials) return;
    if (!window.BackgroundLayer) { console.warn('[testimonials] BackgroundLayer not loaded'); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Ramp geometry differs from profile's binding, and must: bindShift
    // computes min(enterT, exitT), where enterT climbs off triggerEl's TOP
    // and exitT falls off endTrigger's BOTTOM. Profile passes a LATER
    // element as endTrigger, so the two ramps are far apart and the shift
    // plateaus at 1 between them. Here trigger and end are the SAME element,
    // so the ramps are only (sectionHeight - vh) apart — copying profile's
    // enterOffset/exitOffset 0.3 verbatim made them overlap and cancel:
    // measured a flat 0.0000 across the entire section, i.e. no visible
    // invert at all.
    //
    // enterOffset 0: start the climb as soon as the section's top enters the
    // viewport. exitOffset 0: begin reverting only once its bottom edge
    // reaches the viewport top. enterSpan/exitSpan 0.6: ramp over 0.6vh
    // rather than a full crossing, so the shift reaches a true 1 and holds
    // through the section's middle instead of peaking momentarily.
    window.BackgroundLayer.bindShift(testimonials, '--gradient-shift-3', {
      enterSpan: 0.6,
      exitSpan: 0.6,
      // quantize 0.05 — same rationale as profile's binding (see the long
      // comment there: nav backdrop-blur repaint cost per distinct value).
      quantize: 0.05,
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
    // — disabled per explicit request: let the headline wrap normally
    // (natural CSS text-wrap) instead of a hardcoded 2-words-per-line
    // split. The headline now animates in/out as a single element instead
    // of per-line-group; see `allItems` below (was `[intro, ...lines]`).
    // const lines = this.splitText(heading, 'word');
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
      // Same-site arrival at home (About -> logo/Work click, etc. — see
      // default.hbs's head script) means the visitor has already seen the
      // helix form once this session; replaying that multi-second morph
      // again reads as the shape "still loading" when it's really just
      // replaying an intro it doesn't need to. Snap straight to the resting
      // shape instead (duration 0 — see particle-morph-system.js's morphTo,
      // fixed to actually honor an explicit 0 rather than silently falling
      // back to the default). A genuine fresh landing still gets the full
      // form-in morph.
      // Was: window.__pageEntranceOwns ? 0 : 2000 — a genuine fresh landing
      // got a 2s form-in morph from the dispersed cloud into the hero shape.
      // Forced to 0 per explicit request: particles should already BE the
      // hero shape on first load, no visible morph-in.
      const morphDuration = 0;
      const waitForParticleSystemThenMorph = () => {
        if (window.particleSystem?.morphTo) {
          // Abandon a late entrance: this poll retries for up to 8s waiting
          // for the particle system, and by then the visitor may have
          // scrolled past the hero — applying the entrance there would undo
          // the exit that already ran. Guarded on the hide being in flight
          // rather than a pixel threshold, so it stays correct regardless of
          // the zone's EXIT_SPAN.
          if (window.__particleHiding) return;
          // hero shape per HERO_PARTICLE_MODE, routed through the scenario map
          const heroShape = window.__heroShape ? window.__heroShape() : 'helix';
          if (window.__particleApply) window.__particleApply(window.particleSystem, 'hero', heroShape, morphDuration);
          else window.particleSystem.morphTo(heroShape, morphDuration);
        } else if (attempts++ < maxAttempts) {
          setTimeout(waitForParticleSystemThenMorph, 80);
        } else {
          console.warn('[scroll-scrub-anim] particleSystem never became ready — helix morph skipped');
        }
      };
      waitForParticleSystemThenMorph();

      // Entrance: h1 gets a letter-by-letter reveal — same treatment
      // .page-title gets on About/Contact (animateH1LetterByLetter, main.js
      // — per-character opacity stagger, no position/blur movement).
      // Unconditional for every load path (fresh, cached, same-site nav),
      // matching About: that page's own title reveal isn't gated behind
      // window.__pageEntranceOwns either, it just always plays. intro/
      // description get a plain fade alongside it — this used to be a
      // bigger per-item slide+blur stagger, simplified to instant reveal
      // at one point, now this.
      //
      // 0.25s start offset: on the same-site/skip path, this block and
      // page-transition.js's runLandingAnimation() both fire off the same
      // preloader:done tick, so an unoffset reveal raced .home's own 0.2s
      // opacity fade — both landed within ~150ms of each other (confirmed
      // via traced computed-opacity samples), so the letters were already
      // fully revealed by the time .home became visible enough to see them,
      // reading as "no reveal, text just appears". Starting after .home's
      // fade has essentially finished makes the stagger the first thing
      // visible against an already-shown hero, matching what a fresh/full
      // preloader load naturally gets for free (there the reveal only
      // starts once preloader:done fires, seconds after .home settled).
      const REVEAL_START = 0.25;
      const intro = hero.querySelector('.hero-intro');
      const description = hero.querySelector('.hero-description');
      gsap.set(heading, { y: 0, filter: 'blur(0px)' }); // opacity handled per-letter below
      const entranceTl = gsap.timeline();
      // window.animateH1LetterByLetter is defined in main.js, which loads
      // AFTER this file (default.hbs: scroll-scrub-anim.js at 770, main.js
      // at 838 — both plain blocking <script> tags, executed in order).
      // On the same-site "skip path" specifically, initHero() can run
      // synchronously at script-PARSE time (the preloader-skip decision is
      // already known, no event to wait for) — well before main.js has
      // executed and defined this function. A one-shot check here silently
      // fell through to the plain-opacity fallback below whenever that race
      // was lost, which read as "sometimes the letter reveal just doesn't
      // happen, whole H1 pops in at once" — intermittent because it depended
      // on exact script-load timing, not any conditional logic. Poll instead,
      // same pattern as waitForParticleSystemThenMorph just above.
      let letterAnimAttempts = 0;
      // `deferred` = this call is running LONG after entranceTl was created
      // (the curtain-return wait below). entranceTl is shared with the
      // intro/description/avatar/stats fades and starts playing immediately,
      // so by the time the midpoint fires (~1.3s) its playhead is already
      // way past REVEAL_START — tweens added at that position land behind
      // the playhead and GSAP snaps them straight to their end state.
      // Traced exactly that: 102 spans appearing at opacity 1..1 with no
      // stagger at all. A deferred run therefore needs its OWN timeline,
      // starting at 0, so the stagger actually plays.
      const runLetterReveal = (deferred) => {
        if (window.animateH1LetterByLetter) {
          const targetTl = deferred ? gsap.timeline() : entranceTl;
          window.animateH1LetterByLetter(heading, targetTl, deferred ? 0 : REVEAL_START);
        } else if (letterAnimAttempts++ < 25) { // 25 * 20ms = 500ms
          setTimeout(() => runLetterReveal(deferred), 20);
        } else {
          console.warn('[scroll-scrub-anim] animateH1LetterByLetter never became available — hero heading shown without letter reveal');
          gsap.set(heading, { opacity: 1, visibility: 'visible' });
        }
      };
      // CURTAIN RETURN: hold the letter reveal until the page is actually
      // visible. On that path this whole block runs while
      // html.curtain-restoring still has .home at opacity:0 — traced with
      // the stagger completing at ~1022ms and the scroll restore landing at
      // ~1085ms, so every letter had finished animating before anything was
      // on screen. Waiting for page-transition.js's 'curtain:reveal-midpoint'
      // (fired halfway through <main>'s slide-up) puts the stagger where it
      // can be seen, and keeps it off the main thread during the restore's
      // backfill passes.
      //
      // Everything else — fresh load, cached load, same-site nav — is
      // unchanged and still starts immediately; those paths never fire this
      // event, which is exactly why the wait is gated on
      // __curtainReturnLoad (default.hbs head, set before any script runs
      // and only cleared on real user input) rather than on the event.
      //
      // The timeout is a failsafe, not the mechanism: if the midpoint never
      // arrives (no <main>, an aborted timeline, a GSAP failure) the reveal
      // still runs rather than leaving the H1 stranded at opacity 0 — the
      // same "failsafes are a backstop" rule LOADING.md §9 states for veils.
      if (window.__curtainReturnLoad && !window.__curtainRevealMidpoint) {
        let letterRevealStarted = false;
        const startLetterReveal = () => {
          if (letterRevealStarted) return;
          letterRevealStarted = true;
          window.removeEventListener('curtain:reveal-midpoint', startLetterReveal);
          runLetterReveal(true);
        };
        window.addEventListener('curtain:reveal-midpoint', startLetterReveal);
        setTimeout(startLetterReveal, 1500);
      } else {
        runLetterReveal(false);
      }
      if (intro) {
        gsap.set(intro, { y: 0, filter: 'blur(0px)' });
        entranceTl.fromTo(intro, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START);
      }
      if (description) {
        gsap.set(description, { y: 0, filter: 'blur(0px)' });
        entranceTl.fromTo(description, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START + 0.1);
      }
      // Avatar sits on the same row as the description (hero.hbs) and its CSS
      // carries the same opacity:0 pre-hide, so it needs the same reveal or
      // it stays invisible forever. Same offset as the description — they are
      // one visual unit, so they fade in together rather than staggering.
      const avatar = hero.querySelector('.hero-avatar');
      if (avatar) {
        entranceTl.fromTo(avatar, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START + 0.1);
      }
      // .hero-description2 (hero.hbs's current active "I'm Prem / Product
      // Design Partner" line) sits in .hero-avatar-row right next to the
      // avatar above — same opacity:0 pre-hide (main.css), same offset, so
      // it fades in as part of the same visual unit/beat as the avatar
      // rather than staggering separately.
      const description2 = hero.querySelector('.hero-description2');
      if (description2) {
        entranceTl.fromTo(description2, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START + 0.1);
      }
      // Stats row (hero.hbs) carries the same opacity:0 pre-hide as
      // avatar/description (main.css) — same reveal, one beat later so it
      // reads as the last piece of the hero settling in rather than
      // fighting the description/avatar for attention at the same instant.
      const stats = hero.querySelector('.hero-stats');
      if (stats) {
        entranceTl.fromTo(stats, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START + 0.2);
      }
      // Logos strip (hero.hbs's .hero-logos-section) — carries the same
      // opacity:0 pre-hide as stats/avatar/description (main.css), one
      // beat after stats, matching the exit stagger's own ordering
      // (scroll-scrub-anim.js's exitTl further down this file).
      // Queried from `document`, not `hero`: this section is a normal-flow
      // SIBLING of .hero in the markup (hero.hbs), not a descendant, so
      // hero.querySelector() can never find it.
      const heroLogos = document.querySelector('.hero-logos-section');
      if (heroLogos) {
        entranceTl.fromTo(heroLogos, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, REVEAL_START + 0.25);
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
            // 45%, not 80%: the next section covers the hero's center after
            // only ~0.35 viewport of scroll (measured via elementFromPoint),
            // so most of an 80%-long fade/slide played out INVISIBLY behind
            // it — reported as "still can't see the fade". This range makes
            // the whole dim+slide happen while the hero is actually on screen.
            end: '+=45%',
            // scrub: true (not a lagged numeric value) — a numeric scrub
            // makes the tween CHASE the scroll-computed progress with that
            // many seconds of catch-up smoothing, rather than mapping to it
            // directly. Fine at normal/fast scroll speed (the lag is a tiny
            // fraction of the time spent in the range), but during very
            // slow, bursty scrolling each new position retargets the chase
            // before the previous catch-up finishes, so the tween visibly
            // never moves — until scrolling pauses long enough for the lag
            // to resolve, which reads as an abrupt snap. true ties the
            // tween 1:1 to scroll position with zero lag, so every scroll
            // delta (however tiny) reflects immediately regardless of speed.
            scrub: true,
            markers: false
          }
        }).fromTo(imageWrapper,
          { x: 0 },
          { x: '0', duration: 0.5, ease: 'power1.in' },
          0
        ).fromTo(imageWrapper,
          // Scroll-linked fade (fantasy.co reference request): opacity
          // ties directly to scroll position via the same scrub:true
          // ScrollTrigger as the slide above, so it's inherently
          // bidirectional too — no separate scroll-up handling needed.
          // ease: 'none' (linear), not power2.in — power2.in is backloaded
          // (barely any change until late in the range: measured 0.9987 —
          // essentially unchanged — at just 100px of scroll into a 720px
          // range), which is why the first version of this was reported as
          // invisible. Linear makes the dimming proportional to scroll
          // distance from the very first pixel. Target dropped to 0.2 (was
          // 0.5) so it reads as an unmistakable dim rather than a subtle
          // shade — the slide-off still handles fully hiding it at the end.
          { opacity: 1 },
          // power2.out per design direction ("fast → slow"): rapid initial
          // dimming that levels off toward the floor — registers within the
          // first ~100px of scroll, unlike linear which was too gradual to
          // notice in the (now shorter) visible window.
          // duration 0.5 (vs the slide's 1): alpha completes in HALF the
          // movement's scroll range — the image is fully dimmed while the
          // slide is still carrying it off (design rule: alpha < movement).
          { opacity: 0, duration: 0.9, ease: 'power1.in' },
          0
        );
      }

      const exitTl = gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=80%',     // Faster exit — completes over 80% of viewport height
          // scrub: true, not a lagged numeric value — see the image
          // wrapper's own scrollTrigger above for why (0.5 caused "no
          // animation, then abrupt appearance" during very slow scrolling).
          scrub: true,
          markers: false
        }
      });

      // Text exit: fade out + slide DOWN, staggered intro -> headline ->
      // description (was slide left+up — per request, replaced with a
      // pure vertical exit; no matching "slide down" preset existed
      // anywhere in the shared animation configs (card-scroll-reveal.js's
      // yOffset values are all entrance-direction, elements sliding UP
      // INTO view, not an exit sliding down out of it), so this is
      // authored directly here, same structure/timing as before — just
      // y instead of x+y, no horizontal drift. Distances carried over
      // unchanged (headline moves furthest, matching its larger size).
      // Alpha duration < movement duration is unchanged too (content dims
      // out quickly while the slide is still carrying it away; scrub
      // makes both bidirectional).

      // Intro line slides down
      const intro = hero.querySelector('.hero-intro');
      if (intro) {
        exitTl.fromTo(intro,
          { y: 0 },
          { y: 160, duration: 0.5, ease: 'power2.in' },
          0
        ).fromTo(intro,
          { opacity: 1 },
          { opacity: 0, duration: 0.3, ease: 'power1.out' },
          0
        );
      }

      // Headline slides down off screen
      exitTl.fromTo(heading,
        { y: 0 },
        { y: 220, duration: 0.5, ease: 'power2.in' },
        0.05
      ).fromTo(heading,
        { opacity: 1 },
        { opacity: 0, duration: 0.3, ease: 'power1.out' },
        0.05
      );

      // Description slides down
      const description = hero.querySelector('.hero-description');
      if (description) {
        exitTl.fromTo(description,
          { y: 0 },
          { y: 160, duration: 0.5, ease: 'power2.in' },
          0.1
        ).fromTo(description,
          { opacity: 1 },
          { opacity: 0, duration: 0.3, ease: 'power1.out' },
          0.1
        );
      }

      // Avatar (2026-08-11) — added to the exit stagger to match its
      // entrance treatment: it shares .hero-description-row with the
      // description above and fades in alongside it (REVEAL_START + 0.1 in
      // initHero() above), so it exits at the SAME position/values here too
      // — one visual unit, not staggered against its own row-mate.
      const avatar = hero.querySelector('.hero-avatar');
      if (avatar) {
        exitTl.fromTo(avatar,
          { y: 0 },
          { y: 160, duration: 0.5, ease: 'power2.in' },
          0.1
        ).fromTo(avatar,
          { opacity: 1 },
          { opacity: 0, duration: 0.3, ease: 'power1.out' },
          0.1
        );
      }

      // .hero-description2 — same row as the avatar (hero.hbs), same
      // entrance offset (REVEAL_START + 0.1 above), so it exits at the SAME
      // position/values here too — one visual unit with the avatar, not
      // staggered against it.
      const description2 = hero.querySelector('.hero-description2');
      if (description2) {
        exitTl.fromTo(description2,
          { y: 0 },
          { y: 160, duration: 0.5, ease: 'power2.in' },
          0.1
        ).fromTo(description2,
          { opacity: 1 },
          { opacity: 0, duration: 0.3, ease: 'power1.out' },
          0.1
        );
      }

      // Stats row (2026-08-11) — next step in the stagger after description/
      // avatar, mirroring its own entrance offset (REVEAL_START + 0.2, one
      // beat behind description/avatar's + 0.1) — same relative order, same
      // y/duration/ease as every other row in this sequence.
      const stats = hero.querySelector('.hero-stats');
      if (stats) {
        exitTl.fromTo(stats,
          { y: 0 },
          { y: 160, duration: 0.5, ease: 'power2.in' },
          0.15
        ).fromTo(stats,
          { opacity: 1 },
          { opacity: 0, duration: 0.3, ease: 'power1.out' },
          0.15
        );
      }

      // Logos strip (hero.hbs's .hero-logos-section) — deliberately NOT part
      // of exitTl above: exitTl is scrub:true, tying every tween 1:1 to
      // scroll position across hero's 80% range, but per explicit request
      // this strip instead plays a one-shot stagger (fade + slide down,
      // rightmost item first toward leftmost) the moment scroll leaves the
      // very top of the page, and reverses the same way back to the top —
      // not a scroll-position scrub. A separate, non-scrubbed ScrollTrigger
      // achieves that: toggleActions plays forward once past `start` and
      // reverses once scrolled back above it, rather than chasing scroll
      // distance like exitTl's own tweens do.
      // Queried from `document`, not `hero`: this section is a normal-flow
      // SIBLING of .hero, not a descendant (see the matching entrance tween
      // above for the full explanation).
      const heroLogos = document.querySelector('.hero-logos-section');
      if (heroLogos) {
        const logoItems = Array.from(heroLogos.querySelectorAll('.logo-item:not([data-logo-duplicate])')).reverse();
        if (logoItems.length) {
          gsap.timeline({
            scrollTrigger: {
              trigger: hero,
              start: 'top top-=1', // fires as soon as the page scrolls off the very top
              toggleActions: 'play none none reverse',
              markers: false
            }
          }).to(logoItems, {
            opacity: 0,
            y: 40,
            duration: 0.3,
            ease: 'power1.out',
            stagger: 0.06
          }, 0);
        }
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
        // A plain space as the sole content of an inline-level span is
        // subject to CSS whitespace collapsing (trimmed at line-box
        // edges) — intermittently swallowed depending on where the word
        // happens to wrap.   is never collapsible, so the gap holds.
        span.textContent = char === ' ' ? ' ' : char;
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

      // Animate intro and tags only (blur + y; blur skipped on low-end —
      // this timeline is scrubbed, and scrubbed blur repaints every frame)
      if (textEls.length) {
        enterTl.fromTo(textEls,
          { opacity: 0, y: 40, filter: window.__lowEndDevice ? 'blur(0px)' : 'blur(16px)' },
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

      // Skip the footer heading — it's meant to be exclusively owned by
      // heading-animations.js (br-safe split, see its own comment on
      // preserving <br> across the character split), but the
      // data-heading-anim-done check below is a race: that flag is set
      // inside THAT script's forEach loop, not before it starts, so
      // whichever init function's querySelectorAll happens to run first
      // can still win here. Reproduced live: .footer-title's <br /> got
      // silently dropped because this function's own splitText() (below,
      // textContent-based — <br>-blind by construction) ran first and
      // flattened "Building something<br />complex?" into one string
      // before heading-animations.js ever got a chance to preserve it.
      if (el.closest('.gh-footer')) return;

      // Skip the Lab section's statement heading for the identical reason
      // — it also has a literal <br> ("Explorations, <br />AI experiments",
      // posts-tabs-grid-lab.hbs). Scoped to the wrapper that also contains
      // #work-grid-lab rather than a bare .gradient-frame closest check —
      // that class is reused by profile.hbs's own gradient-frame, which
      // should still go through this function for .profile-headline (no
      // <br> in that one, so no bug to avoid there).
      const frameAncestor = el.closest('.gradient-frame');
      if (frameAncestor && frameAncestor.querySelector('#work-grid-lab')) return;

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

    const isLetter = type === 'letter';

    if (isLetter) {
      // Letter-by-letter: split each text node's characters, but walk the
      // ORIGINAL child nodes first (not el.textContent, which flattens
      // every element — including <br> — into plain text, silently
      // deleting the line break before it could ever be rebuilt). A <br>
      // in the source (e.g. "Explorations, <br />AI experiments") is
      // preserved as a real <br> in the rebuilt DOM instead of vanishing.
      const sourceNodes = Array.from(el.childNodes);
      el.innerHTML = '';
      el.setAttribute('data-split-done', 'true');

      const elements = [];
      sourceNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
          el.appendChild(document.createElement('br'));
          return;
        }
        const text = node.textContent;
        if (!text) return;
        const units = text.split('');
        units.forEach((unit) => {
          // Was `if (!unit.trim()) return;` — silently dropped space
          // characters entirely (no span created at all, not even a hidden
          // one), so consecutive words ran together with nothing between
          // them ("Explorations,AIexperiments"). A space still needs its own
          // span to occupy that layout space; it just starts fully visible
          // since there's no glyph to fade in.
          const isWhitespace = !unit.trim();
          const span = document.createElement('span');
          span.className = 'animate-letter';
          span.style.display = 'inline-block';
          span.style.opacity = isWhitespace ? '1' : '0';  // Only opacity, parent's visibility controls
          span.textContent = unit;
          el.appendChild(span);
          elements.push(span);
        });
      });
      return elements;
    } else {
      const text = el.textContent.trim();
      el.innerHTML = '';
      el.setAttribute('data-split-done', 'true');
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
