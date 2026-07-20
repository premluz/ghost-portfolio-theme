(function() { 'use strict';

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
  const loadCardMeta = (card) => {
    const postUrl = card.getAttribute('data-post-url');
    if (!postUrl || card.__metaLoaded) return;
    card.__metaLoaded = true;

    fetch(postUrl)
      .then(res => res.text())
      .then(html => {
        let metaMatch = html.match(/window\.projectMeta\s*=\s*(\{[\s\S]*?\});/);
        if (!metaMatch) {
          metaMatch = html.match(/window\.projectMetaArray\.push\(\s*(\{[\s\S]*?\})\s*\)/);
        }
        if (!metaMatch) return;

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

          if (meta.client) {
            const clientEl = card.querySelector('.grid-card-client');
            if (clientEl) clientEl.textContent = meta.client;
          }

          if (meta.cardKeywords) {
            const keywordsEl = card.querySelector('.grid-card-keywords');
            if (keywordsEl) {
              const keywords = meta.cardKeywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
              keywordsEl.innerHTML = keywords.map(keyword =>
                `<span class="grid-card-keyword post-card-keyword">${keyword}</span>`
              ).join('');
            }
          }

          if (meta.accentColor) {
            card.style.setProperty('--grid-card-accent-color', meta.accentColor);
          }

          if (meta.gradientCss) {
            card.setAttribute('data-gradient-css', meta.gradientCss);
            console.log('[grid-card] Set gradient for card:', meta.gradientCss.substring(0, 50) + '...');
          }

          if (meta.video) {
            // Same pattern as .post-card-image (post-and-cards.js): replace
            // the image element's content with a <video> entirely, rather
            // than layering a <video> + <img> with independent opacity
            // fades racing each other (the old .grid-card-video/
            // .grid-card-image-fallback dual-layer — see the glitch this
            // caused, now removed from post-card-grid.hbs too). No fade
            // needed: the video simply replaces the static poster once
            // metadata assigns it, same as the post-card version always
            // has. IntersectionObserver play/pause also matches
            // post-and-cards.js, instead of the old autoplay+loop
            // regardless of visibility.
            const imageEl = card.querySelector('.grid-card-image');
            if (imageEl) {
              const videoSrc = meta.video.startsWith('http') ? meta.video : `/content/images/videos/${meta.video}`;
              imageEl.innerHTML = `
                <video muted loop playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);">
                  <source src="${videoSrc}" type="video/mp4">
                </video>
              `;
              const video = imageEl.querySelector('video');
              if (video) {
                const videoObserver = new IntersectionObserver((entries) => {
                  entries.forEach(entry => {
                    if (entry.isIntersecting) video.play();
                    else video.pause();
                  });
                }, { threshold: 0.5 });
                videoObserver.observe(video);
              }
              console.log('[grid-card] Set video thumbnail:', videoSrc);
            }
          }

          // Fallback image no longer gets its own fade-in — it's
          // unconditionally opacity:1 in CSS now (the "always-visible
          // poster" the .grid-card-video comment in post-card-grid.css
          // describes). This used to set opacity:0 here then fade it in on
          // `load`, racing the video's own independent fade instead of
          // always being solidly there first — see that CSS comment for
          // the glitch this caused.

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

          if (meta.disableLink === true || meta['disable-link'] === true) {
            const link = card.querySelector('.grid-card-link');
            if (link) {
              link.style.pointerEvents = 'none';
              link.setAttribute('data-tooltip', 'No case study');
              card.classList.add('grid-card-disabled');
            }
          }

          scheduleRefresh();
        } catch (e) {
          // Ignore malformed metadata
        }
      })
      .catch(() => {
        // Ignore fetch errors
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
      gridCards.forEach((c) => io.observe(c));
    } else {
      gridCards.forEach(loadCardMeta);
    }
  };
  const whenIdle = () => (window.requestIdleCallback || ((fn) => setTimeout(fn, 800)))(startObserving);
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
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
