(function() { 'use strict';

// This file is <script src>'d independently from FOUR different partials
// (about-projects.hbs, work-projects.hbs, posts-tabs-grid-lab.hbs,
// posts-tabs-grid.hbs) — any page rendering more than one of them (e.g.
// work.hbs renders both about-projects AND work-projects) loads and
// EXECUTES this same script twice, since repeated <script src> tags for
// the same URL aren't deduped by the browser. A second run's
// loadCardMeta(gridCards[0]) sees card.__metaLoaded already true (set by
// the first run) and returns an already-resolved Promise.resolve()
// immediately, which then overwrote window.__firstGridCardMetaReady with
// a trivially-resolved promise instead of the real, still in-flight one —
// page-transition.js's reveal-gate resolved instantly instead of actually
// waiting, which is exactly the abrupt post-reveal pop-in this was meant
// to prevent.
if (window.__postsTabsGridInitialized) return;
window.__postsTabsGridInitialized = true;

function initPostsTabsGrid() {
  const section = document.querySelector('.posts-tabs-grid-section');
  if (!section) return;

  const outer = section.querySelector('.tab-switch-grid-outer');
  const scene = section.querySelector('.tab-switch-grid-scene');
  const indicator = section.querySelector('.tab-switch-grid-indicator');
  const desc = section.querySelector('.tab-switch-grid-description');
  const buttons = section.querySelectorAll('.tab-switch-grid-btn');
  const panels = section.querySelectorAll('.posts-tabs-grid-panel');
  if (buttons.length === 0 || panels.length === 0) return;

  const descriptions = {
    featured: 'Real products, real constraints, real impact.',
    experimental: 'Pitches, smaller projects, and explorations.'
  };

  function slideIndicator(activeBtn) {
    if (!indicator) return;
    indicator.style.top = activeBtn.offsetTop + 'px';
    indicator.style.left = activeBtn.offsetLeft + 'px';
    indicator.style.width = activeBtn.offsetWidth + 'px';
    indicator.style.height = activeBtn.offsetHeight + 'px';
  }

  function switchTab(tab) {
    const targetPanel = section.querySelector(`.posts-tabs-grid-panel[data-tab="${tab}"]`);
    if (!targetPanel) return;

    buttons.forEach(btn => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    panels.forEach(panel => panel.classList.remove('active'));
    targetPanel.classList.add('active');

    const activeBtn = section.querySelector(`.tab-switch-grid-btn[data-tab="${tab}"]`);
    if (activeBtn) slideIndicator(activeBtn);
    if (desc) desc.textContent = descriptions[tab] || '';

    // Scroll to grid section
    const gridSection = document.getElementById('work-grid');
    if (gridSection) {
      gridSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  const initialActive = section.querySelector('.tab-switch-grid-btn.active');
  if (initialActive) requestAnimationFrame(() => slideIndicator(initialActive));

  // ── Entrance: slide up when scrolled into view ─────────────
  const entranceObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && outer) {
          outer.classList.add('is-visible');
          entranceObserver.disconnect();
        }
      });
    },
    { threshold: 0.2 }
  );
  if (outer) entranceObserver.observe(outer);

  // ── Sticky scale: scale down when switch reaches viewport top ─
  let isSticky = false;
  let ticking = false;
  let stickyScrollY = 0;
  let spacer = null;

  function updateIndicator() {
    const activeBtn = section.querySelector('.tab-switch-grid-btn.active');
    if (activeBtn) slideIndicator(activeBtn);
  }

  // Create a body-level fixed element that blurs the canvas behind the pill.
  const gridBlurLayer = document.createElement('div');
  gridBlurLayer.className = 'tab-blur-layer';
  gridBlurLayer.style.opacity = '0';
  document.body.appendChild(gridBlurLayer);

  function updateBlurLayer() {
    const pill = section.querySelector('.tab-switch-grid-pill');
    if (!pill) return;
    const r = pill.getBoundingClientRect();
    gridBlurLayer.style.top    = r.top  + 'px';
    gridBlurLayer.style.left   = r.left + 'px';
    gridBlurLayer.style.width  = r.width  + 'px';
    gridBlurLayer.style.height = r.height + 'px';
    // Hide if pill is off-screen or the scene has been faded out
    const sceneOpacity = scene ? parseFloat(scene.style.opacity) : 1;
    const inView = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    gridBlurLayer.style.opacity = (inView && sceneOpacity !== 0) ? '1' : '0';
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!outer || !scene) return;

      const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 60;
      const thresh = navH;
      const sectionRect = section.getBoundingClientRect();

      if (!isSticky) {
        const outerRect = outer.getBoundingClientRect();
        if (outerRect.top <= thresh) {
          isSticky = true;
          stickyScrollY = window.scrollY;
          spacer = document.createElement('div');
          spacer.className = 'tab-switch-grid-spacer';
          spacer.style.cssText = `height:${outer.offsetHeight}px;flex-shrink:0;pointer-events:none;`;
          outer.insertAdjacentElement('afterend', spacer);
          outer.classList.add('is-sticky');
          updateIndicator();
        }
      } else {
        if (window.scrollY < stickyScrollY) {
          isSticky = false;
          if (spacer) {
            spacer.remove();
            spacer = null;
          }
          outer.classList.remove('is-sticky');
          updateIndicator();
        }
      }

      if (isSticky) {
        scene.style.opacity = sectionRect.bottom > thresh ? '1' : '0';
      }
      updateBlurLayer();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateBlurLayer, { passive: true });
  onScroll();
  requestAnimationFrame(updateBlurLayer);

}

function initGridCardHover() {
  const gridCards = document.querySelectorAll('.grid-card');
  let videosFound = 0;

  gridCards.forEach(card => {
    const video = card.querySelector('.grid-card-image video');
    if (!video || !video.src) return;

    videosFound++;
    // Video autoplay handles playback when visible (opacity: 0 → 1)
  });

  if (videosFound === 0) {
    console.log('[grid-video] No video metadata found in posts. Add video field to post metadata to enable hover videos.');
  } else {
    console.log(`[grid-video] ✅ ${videosFound} card(s) with video ready`);
  }
}

function initGridCardMetadata() {
  const gridCards = document.querySelectorAll('.grid-card');
  if (gridCards.length === 0) return;

  // Each card's metadata (title/description/bullets/etc.) arrives via its
  // own independent fetch() below, at whatever time that card's post page
  // responds — potentially seconds after other scroll-triggered systems
  // (e.g. BackgroundLayer.bindShift() on .profile, in scroll-scrub-anim.js)
  // already measured trigger positions further down the page. Populating
  // previously-empty divs with real text changes THIS section's height,
  // which shifts everything below it — without a refresh, those other
  // triggers stay anchored to the old, too-short-page position and fire
  // early/miss entirely. Debounced since up to 5+ cards can each resolve
  // within a few hundred ms of each other.
  let refreshTimer = null;
  const scheduleRefresh = () => {
    if (typeof ScrollTrigger === 'undefined') return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
  };

  // LAZY metadata loading (2026-07-19): each card fetches its ENTIRE post
  // page HTML just to regex out window.projectMeta — measured 7 fetches /
  // ~400KB of HTML downloaded and scanned at homepage load, all for
  // below-the-fold grids. Fetch just-in-time instead: when a card comes
  // within ~1.5 viewports of view. The existing debounced
  // ScrollTrigger.refresh() below already handles the late height changes
  // this causes, and BackgroundLayer.bindShift reads live geometry so it
  // never cared. No-IntersectionObserver browsers fall back to eager.
  // Fades the skeleton out and the <img>/<video> in. Video-vs-image is no
  // longer decided here — it's server-side now (the #video internal tag,
  // post-card-grid.hbs, same as post-card.hbs) — this just reveals
  // whichever element the template actually rendered. Called once per card
  // (see call sites below), regardless of which media type it resolves to.
  const showImageFallback = (card) => {
    const imageEl = card.querySelector('.grid-card-image');
    if (!imageEl) return;
    const skeleton = imageEl.querySelector('.card-media-skeleton');
    if (skeleton) skeleton.classList.add('is-hidden');
    const media = imageEl.querySelector('img, video');
    if (!media) return;
    media.classList.add('is-visible');
    const isVideo = media.tagName === 'VIDEO';

    // Same load-gated fade+scale+blur as post-and-cards.js's showImageFallback
    // (and the SAME window.initCardMediaReveal hookup once it's actually
    // visible) — .grid-card previously had no reveal animation at all here.
    const cfg = window.SCROLL_REVEAL_CONFIG && window.SCROLL_REVEAL_CONFIG.image;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isReady = isVideo ? media.readyState >= 2 : (media.complete && media.naturalWidth > 0);
    const reveal = () => {
      if ((!window.gsap || !cfg || prefersReducedMotion)) {
        if (window.gsap) gsap.set(media, { opacity: 1, scale: 1, filter: 'none' });
        else media.style.opacity = '1';
        if (window.initCardMediaReveal) window.initCardMediaReveal(card, media);
        return;
      }
      gsap.set(media, { opacity: 0, scale: cfg.scale.start, filter: `blur(${cfg.blur.start}px)` });
      gsap.to(media, {
        opacity: 1,
        scale: cfg.scale.end,
        filter: `blur(${cfg.blur.end}px)`,
        duration: cfg.duration,
        ease: cfg.ease,
        onComplete: () => { if (window.initCardMediaReveal) window.initCardMediaReveal(card, media); },
      });
    };
    if (isReady) { reveal(); return; }
    // Not loaded yet — wait for the browser to actually have a frame
    // (image: 'load', video: 'loadeddata') before starting the reveal,
    // matching the old video path's own gating exactly.
    media.addEventListener(isVideo ? 'loadeddata' : 'load', reveal, { once: true });
  };

  // Video autoplay/pause on visibility — matches post-and-cards.js's own
  // #video handling. Runs for every card; a no-op on cards whose media is
  // an <img>.
  const observeCardVideo = (card) => {
    const video = card.querySelector('.grid-card-image video');
    if (!video) return;
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) video.play();
        else video.pause();
      });
    }, { threshold: 0.5 });
    videoObserver.observe(video);
  };

  const loadCardMeta = (card) => {
    if (card.__metaLoaded) return Promise.resolve();
    const postUrl = card.getAttribute('data-post-url');
    if (!postUrl) { showImageFallback(card); return Promise.resolve(); }
    card.__metaLoaded = true;

    return fetch(postUrl)
      .then(res => res.text())
      .then(html => {
        let metaMatch = html.match(/window\.projectMeta\s*=\s*(\{[\s\S]*?\});/);
        if (!metaMatch) {
          metaMatch = html.match(/window\.projectMetaArray\.push\(\s*(\{[\s\S]*?\})\s*\)/);
        }
        if (!metaMatch) { showImageFallback(card); return; }

        try {
          const meta = eval(`(${metaMatch[1]})`);

          // Debug: log metadata fields for first card
          if (card === gridCards[0]) {
            console.log('[grid-card-meta] Available fields:', Object.keys(meta));
          }

          if (meta.projectCategory) {
            const categoryEl = card.querySelector('.grid-card-category');
            if (categoryEl) categoryEl.textContent = meta.projectCategory;
          }

          if (meta.longTitle) {
            const titleEl = card.querySelector('.grid-card-title');
            if (titleEl) titleEl.textContent = meta.longTitle;
          }

          if (meta.result) {
            // Same field post.hbs's own #project-result reads (detail
            // page) and post-and-cards.js's identical .post-card-result
            // case — see that file's own comment for why this reuses
            // "result" rather than a second card-only field, and why
            // innerHTML not textContent.
            const resultEl = card.querySelector('.grid-card-result');
            if (resultEl) resultEl.innerHTML = meta.result;
          }

          if (meta.client) {
            const clientEl = card.querySelector('.grid-card-client');
            if (clientEl) clientEl.textContent = meta.client;
          }

          if (meta.cardKeywords) {
            // Shared parser/renderer — post-utilities.js (window.renderCardKeywords),
            // also used by post-and-cards.js's identical .post-card-keywords case.
            // extraClass reproduces this file's own grid-card-keyword dual-class.
            window.renderCardKeywords(card.querySelector('.grid-card-keywords'), meta.cardKeywords, 'grid-card-keyword');
          }

          if (meta.accentColor) {
            card.style.setProperty('--grid-card-accent-color', meta.accentColor);
          }

          if (meta.gradientCss) {
            card.setAttribute('data-gradient-css', meta.gradientCss);
            console.log('[grid-card] Set gradient for card:', meta.gradientCss.substring(0, 50) + '...');
          }

          // Video-vs-image is decided server-side now (the #video internal
          // tag, post-card-grid.hbs) — whichever element the template
          // rendered just needs revealing + (if it's a video) play/pause
          // wiring. Was: an `if (meta.video)` branch here that built a
          // <video> via JS from this same fetched metadata, layered over
          // the <img> — removed along with that field's only reader.
          showImageFallback(card);
          observeCardVideo(card);

          if (meta.projectTestimonial) {
            const testimonialEl = card.querySelector('.grid-card-testimonial');
            if (testimonialEl) {
              testimonialEl.textContent = meta.projectTestimonial;
            }
          }

          if (meta.projectEndorser) {
            const endorserEl = card.querySelector('.grid-card-endorser');
            if (endorserEl) {
              endorserEl.textContent = `— ${meta.projectEndorser}`;
            }
          }

          const isDisabled = meta.disableLink === true || meta['disable-link'] === true;
          if (isDisabled) {
            const link = card.querySelector('.grid-card-link');
            if (link) {
              link.style.pointerEvents = 'none';
              card.classList.add('grid-card-disabled');
            }
          }

          // Hover tooltip (initTooltipSystem, main.js — mouse-tracking, reads
          // data-tooltip off whatever's under the cursor). Same field/fallback
          // logic as post-and-cards.js's identical .post-card-link case:
          // meta.tooltipLabel unset → default text below (enabled/disabled
          // read); set to real text → that text, either state; set to ''
          // (explicitly blank) → no tooltip at all, on purpose (a per-post
          // opt-out — hasOwnProperty, not a falsy check, so "" only wins over
          // the default when the field was actually written, not just absent).
          {
            const link = card.querySelector('.grid-card-link');
            if (link) {
              const hasTooltipLabel = Object.prototype.hasOwnProperty.call(meta, 'tooltipLabel');
              const label = hasTooltipLabel
                ? meta.tooltipLabel
                : (isDisabled ? 'Case study not available' : 'View case study');
              if (label) link.setAttribute('data-tooltip', label);
              else link.removeAttribute('data-tooltip');
            }
          }

          // Title/keywords/testimonial+author scroll reveal with reverse —
          // .grid-card-title/-keywords/-testimonial/-endorser are already
          // dual-classed with .post-card-* for exactly this reuse (see
          // post-card-grid.hbs), so the exact same function post-and-cards.js
          // uses for .post-card works unchanged here.
          if (window.initCardContentReveal) window.initCardContentReveal(card);

          scheduleRefresh();
        } catch (e) {
          // Malformed metadata — still resolve the skeleton to the image
          // rather than leaving it shimmering forever.
          showImageFallback(card);
        }
      })
      .catch(() => {
        // Fetch failed — same fallback as malformed metadata.
        showImageFallback(card);
      });
  };

  // Defer even the OBSERVING until the page has fully loaded and the main
  // thread is idle — the first grid rows sit within a viewport of the fold
  // (the fixed hero takes no layout space), so proximity alone still fired
  // ~5 fetches during load. This keeps the critical path completely clear;
  // near cards then populate within ~a second of load, long before a
  // visitor scrolls to them.
  const startObserving = () => {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { io.unobserve(en.target); loadCardMeta(en.target); }
        });
      }, { rootMargin: '800px 0px' });
      // First card excluded here — it's fetched eagerly below instead of
      // waiting on this same idle+intersection gate, so page-transition.js
      // can hold the page-level reveal until it's actually ready (see
      // window.__firstGridCardMetaReady). Deferring it like every other
      // card was exactly why the reveal used to show an empty/static card
      // that then abruptly filled in or swapped to a video mid-view.
      gridCards.forEach((c, i) => { if (i > 0) io.observe(c); });
    } else {
      gridCards.forEach((c, i) => { if (i > 0) loadCardMeta(c); });
    }
  };
  // timeout is required — on pages with continuous particle/GSAP activity
  // (the homepage's about-projects grid), the real requestIdleCallback can
  // go a very long time without a genuinely idle period to fire in (see
  // the identical fix + measurement in main.js's deferMetadataFetches).
  const whenIdle = () => (window.requestIdleCallback || ((fn) => setTimeout(fn, 800)))(startObserving, { timeout: 2000 });
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });

  // EAGER FETCH beyond just card 0: (1) any card already sitting in the
  // viewport at this exact moment — it's about to be seen instantly, so
  // waiting on idle+800px like a below-the-fold card just means visible
  // text/video shows up late for no reason; (2) if this load is a
  // curtain-return (or any arrival referred from one of these posts), the
  // specific card the visitor just came back to check, plus its immediate
  // neighbors — the one thing they're most likely looking at right now.
  const eagerIndexes = new Set();
  gridCards.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) eagerIndexes.add(i);
  });
  if (document.referrer) {
    try {
      const referrerPath = new URL(document.referrer).pathname.replace(/\/$/, '');
      gridCards.forEach((card, i) => {
        const postUrl = (card.getAttribute('data-post-url') || '').replace(/\/$/, '');
        if (postUrl && postUrl === referrerPath) {
          eagerIndexes.add(i);
          if (i > 0) eagerIndexes.add(i - 1);
          if (i < gridCards.length - 1) eagerIndexes.add(i + 1);
        }
      });
    } catch (e) { /* not a valid URL (e.g. empty referrer) — skip */ }
  }
  eagerIndexes.forEach((i) => loadCardMeta(gridCards[i]));

  // First card: fetch immediately, in parallel with the page transition,
  // not deferred behind idle+load like the rest — page-transition.js
  // awaits this (with its own timeout cap) before revealing <main>, so by
  // the time the page is actually visible this card is already in its
  // final state instead of visibly changing after the fact.
  window.__firstGridCardMetaReady = loadCardMeta(gridCards[0]) || Promise.resolve();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPostsTabsGrid();
    initGridCardHover();
    initGridCardMetadata();
  });
} else {
  initPostsTabsGrid();
  initGridCardHover();
  initGridCardMetadata();
}

})();
