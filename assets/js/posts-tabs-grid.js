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

  gridCards.forEach(card => {
    const postUrl = card.getAttribute('data-post-url');
    if (!postUrl) return;

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

          if (meta.cardDescription) {
            const descEl = card.querySelector('.grid-card-description');
            if (descEl) descEl.textContent = meta.cardDescription;
          }

          if (meta.descBullet1 || meta.descBullet2 || meta.descBullet3) {
            const bulletsEl = card.querySelector('.grid-card-bullets');
            if (bulletsEl) {
              bulletsEl.innerHTML = '';
              [meta.descBullet1, meta.descBullet2, meta.descBullet3].forEach(bullet => {
                if (bullet) {
                  const li = document.createElement('li');
                  li.textContent = bullet;
                  bulletsEl.appendChild(li);
                }
              });
            }
          }

          if (meta.result) {
            const resultEl = card.querySelector('.grid-card-result');
            if (resultEl) resultEl.textContent = meta.result;
          }

          if (meta.cardKeywords) {
            const keywordsEl = card.querySelector('.grid-card-keywords');
            if (keywordsEl) {
              const keywords = meta.cardKeywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
              keywordsEl.innerHTML = keywords.map(keyword =>
                `<span class="grid-card-keyword">${keyword}</span>`
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
            const video = card.querySelector('.grid-card-video');
            if (video) {
              const videoSrc = meta.video.startsWith('http') ? meta.video : `/content/images/videos/${meta.video}`;
              // Start video invisible; fade in when it loads
              video.style.opacity = '0';
              video.src = videoSrc;

              // Fade in when video has loaded enough data to display
              const fadeInVideo = () => {
                if (typeof gsap !== 'undefined') {
                  gsap.to(video, { opacity: 1, duration: 0.4, ease: 'power2.out' });
                } else {
                  video.style.opacity = '1';
                }
                video.removeEventListener('loadedmetadata', fadeInVideo);
              };
              video.addEventListener('loadedmetadata', fadeInVideo);

              console.log('[grid-card] Set video thumbnail:', videoSrc);
            }
          }

          // Fade in grid card image
          const image = card.querySelector('.grid-card-image-fallback');
          if (image && image.src) {
            image.style.opacity = '0';
            const fadeInImage = () => {
              if (typeof gsap !== 'undefined') {
                gsap.to(image, { opacity: 1, duration: 0.4, ease: 'power2.out' });
              } else {
                image.style.opacity = '1';
              }
              image.removeEventListener('load', fadeInImage);
            };
            if (image.complete) {
              fadeInImage();
            } else {
              image.addEventListener('load', fadeInImage);
            }
          }

          if (meta.projectLogo) {
            const logoEl = card.querySelector('.grid-card-logo');
            if (logoEl) {
              const logoSrc = meta.projectLogo.startsWith('http') ? meta.projectLogo : `/content/images/logos/${meta.projectLogo}`;
              logoEl.src = logoSrc;
              logoEl.style.display = 'block';
            }
          }

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
  });
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
