/**
 * THINKINGISFREE — Main JS
 * Navigation, theme toggle, scroll progress
 */

console.log('main.js file loaded');

// ═══════════════════════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════════════════════

function initThemeToggle() {
  const themeToggle = document.querySelector('.theme-toggle');
  if (!themeToggle) return;

  const sunIcon = themeToggle.querySelector('.theme-icon-sun');
  const moonIcon = themeToggle.querySelector('.theme-icon-moon');
  const html = document.documentElement;
  const STORAGE_KEY = 'theme-preference';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY) || DARK;
  }

  // Apply theme to Ghost Portal iframes.
  function setTheme(theme) {
    if (theme === LIGHT) {
      html.setAttribute('data-theme', LIGHT);
      if (sunIcon) sunIcon.style.display = 'none';
      if (moonIcon) moonIcon.style.display = 'block';
    } else {
      // Dark mode: no data-theme attribute (tokens.css :root is the dark default)
      html.removeAttribute('data-theme');
      if (sunIcon) sunIcon.style.display = 'block';
      if (moonIcon) moonIcon.style.display = 'none';
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }

  setTheme(getSavedTheme());

  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme') || DARK;
    const newTheme = currentTheme === DARK ? LIGHT : DARK;
    setTheme(newTheme);
  });

  // Pin Ghost Portal iframes to light color-scheme (always, regardless of page theme)
  // and apply transparent background to prevent flash.
  function pinPortalIframes() {
    const iframes = document.querySelectorAll([
      'iframe[data-ghost-portal]',
      'iframe[src*="#/portal"]',
      'iframe[src*="ghost.io"]',
      '#ghost-portal-root iframe',
    ].join(', '));

    iframes.forEach(iframe => {
      iframe.style.setProperty('color-scheme', 'light', 'important');
      iframe.style.background = 'transparent';
    });
  }

  // Run once on init
  pinPortalIframes();

  // Watch for new iframes and pin them, with fade-in to prevent flash
  const iframeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const addedFrames = [...mutation.addedNodes].filter(
        n => n.nodeType === 1 && (n.tagName === 'IFRAME' || n.querySelector?.('iframe'))
      );
      if (addedFrames.length > 0) {
        // Find all new iframes in added nodes
        const newIframes = [];
        addedFrames.forEach(node => {
          if (node.tagName === 'IFRAME') {
            newIframes.push(node);
          } else {
            newIframes.push(...node.querySelectorAll('iframe'));
          }
        });

        // Hide, pin to light, and fade in
        newIframes.forEach(iframe => {
          iframe.style.visibility = 'hidden';
          iframe.style.opacity = '0';
          pinPortalIframes();
          setTimeout(() => {
            iframe.style.visibility = 'visible';
            iframe.style.opacity = '1';
            iframe.style.transition = 'opacity 0.2s ease-out';
          }, 50);
        });
        break;
      }
    }
  });

  iframeObserver.observe(document.body, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION SCROLL HIDE/SHOW
// ═══════════════════════════════════════════════════════════════

function initNavScrollBehavior() {
  const nav = document.querySelector('nav');
  if (!nav) return;

  let lastScrollY = 0;

  document.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > lastScrollY) {
      nav.classList.add('nav-hidden');
    } else {
      nav.classList.remove('nav-hidden');
    }

    lastScrollY = currentScrollY;
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM SCROLLBAR THUMB POSITION
// ═══════════════════════════════════════════════════════════════

function initCustomScrollbar() {
  // The native scrollbar is hidden via CSS (scrollbar-width: none /
  // ::-webkit-scrollbar { display: none }). We drive the custom scrollbar
  // thumb (rendered as html::before) by updating two CSS custom properties:
  //   --scroll-thumb-top    (0–100, percentage position along the track)
  //   --scroll-thumb-height (0–100, percentage of track height)
  //
  // Because the custom bar is a fixed element that's ALWAYS visible, Ghost
  // Portal's overflow:hidden on <html> cannot cause a layout width jump —
  // there is no native scrollbar to disappear.

  const html = document.documentElement;

  function updateThumb() {
    const scrollTop = window.scrollY;
    const scrollHeight = html.scrollHeight;
    const clientHeight = html.clientHeight;
    const scrollable = scrollHeight - clientHeight;

    if (scrollable <= 0) {
      // Page fits in viewport — hide thumb by giving it 0 height
      html.style.setProperty('--scroll-thumb-height', '0');
      return;
    }

    // Thumb height is proportional to the viewport/content ratio (min 8%)
    const thumbHeightPct = Math.max(8, (clientHeight / scrollHeight) * 100);
    // Thumb top: maps scroll position to available track space
    const trackSpace = 100 - thumbHeightPct;
    const thumbTopPct = (scrollTop / scrollable) * trackSpace;

    html.style.setProperty('--scroll-thumb-top', thumbTopPct.toFixed(2));
    html.style.setProperty('--scroll-thumb-height', thumbHeightPct.toFixed(2));
  }

  // Initial paint
  updateThumb();

  // Update on scroll and resize
  window.addEventListener('scroll', updateThumb, { passive: true });
  window.addEventListener('resize', updateThumb, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// MOBILE MENU TOGGLE
// ═══════════════════════════════════════════════════════════════

function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger');
  const navMenuMobile = document.querySelector('.nav-menu-mobile');
  if (!hamburger || !navMenuMobile) return;

  const mobileLinks = navMenuMobile.querySelectorAll('a');

  // Toggle menu
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenuMobile.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', hamburger.classList.contains('active'));
  });

  // Close menu when link is clicked
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navMenuMobile.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // Close menu on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenuMobile.classList.contains('active')) {
      hamburger.classList.remove('active');
      navMenuMobile.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SCROLL PROGRESS BAR
// ═══════════════════════════════════════════════════════════════

function initScrollProgress() {
  const progressBar = document.querySelector('.scroll-progress');
  if (!progressBar) {
    return;
  }

  document.addEventListener('scroll', () => {
    // Calculate scroll percentage
    const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;
    progressBar.style.width = scrolled + '%';
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// HERO SECTION — GSAP + SplitType entrance animation
// Mirrors reference/src/components/sections/Hero.tsx
//
// Timeline (seconds):
//   0.00 — intro label (words, 0.5s, stagger 0.03)
//   0.15 — headline    (words, 0.7s, stagger 0.07)
//   0.35 — description (0.6s)
//   0.50 — tags        (scale+fade, 0.5s, stagger 0.05)
//   0.00 — image       (blur 34px → 0, parallel, 1.4s)
//
// Scroll exit: as user scrolls past the hero the image blurs and
// fades out — this mirrors the scroll handler in Hero.tsx.
// ═══════════════════════════════════════════════════════════════

function initHero() {
  const heroEl = document.querySelector('.hero[data-section-id="hero"]');
  if (!heroEl) return;

  // Guard: if GSAP or SplitType are not available (CDN failure etc.) reveal
  // everything immediately so the page is still readable.
  if (typeof gsap === 'undefined') {
    ['.hero-intro', '.hero-headline', '.hero-description', '.hero-image-wrapper']
      .forEach(sel => {
        const el = heroEl.querySelector(sel);
        if (el) el.style.opacity = '1';
      });
    heroEl.querySelectorAll('.hero-tags .tag').forEach(el => { el.style.opacity = '1'; });
    return;
  }

  const ease = 'cubic-bezier(0.16, 0.84, 0.44, 1)';

  // ── Build entrance timeline ──────────────────────────────────

  const tl = gsap.timeline({ delay: 0 });

  // 1. Intro label — split into words then stagger in
  const introEl = heroEl.querySelector('.hero-intro');
  if (introEl && typeof SplitType !== 'undefined') {
    const split = new SplitType(introEl, { types: 'words' });
    // CRITICAL: make parent visible immediately — GSAP will animate the
    // child word spans. If the parent stays at opacity:0 (CSS initial state),
    // the word animations are invisible even when they reach opacity:1.
    gsap.set(introEl, { opacity: 1 });
    gsap.set(split.words, { opacity: 0, y: 12 });
    tl.to(split.words, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease,
      stagger: 0.03,
    }, 0);
  } else if (introEl) {
    // SplitType unavailable — animate the whole element
    gsap.set(introEl, { opacity: 0, y: 12 });
    tl.to(introEl, { opacity: 1, y: 0, duration: 0.5, ease }, 0);
  }

  // 2. Headline — split into words then stagger in
  const headlineEl = heroEl.querySelector('.hero-headline');
  if (headlineEl && typeof SplitType !== 'undefined') {
    const split = new SplitType(headlineEl, { types: 'words' });
    // CRITICAL: make parent visible immediately — same reason as intro above.
    gsap.set(headlineEl, { opacity: 1 });
    gsap.set(split.words, { opacity: 0, y: 20 });
    tl.to(split.words, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease,
      stagger: 0.07,
    }, 0.15);
  } else if (headlineEl) {
    gsap.set(headlineEl, { opacity: 0, y: 20 });
    tl.to(headlineEl, { opacity: 1, y: 0, duration: 0.7, ease }, 0.15);
  }

  // 3. Description — no SplitType (preserve any nested markup)
  const descEl = heroEl.querySelector('.hero-description');
  if (descEl) {
    gsap.set(descEl, { opacity: 0, y: 12 });
    tl.to(descEl, { opacity: 1, y: 0, duration: 0.6, ease }, 0.35);
  }

  // 4. Tag pills — scale + fade with stagger
  const tagsContainer = heroEl.querySelector('.hero-tags');
  if (tagsContainer) {
    const tags = tagsContainer.querySelectorAll('.tag');
    gsap.set(tags, { opacity: 0, scale: 0.9, y: 8 });
    tl.to(tags, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.5,
      ease,
      stagger: 0.05,
    }, 0.5);
  }

  // 5. Image — blur(34px) → blur(0) over 1.4s, runs in parallel with text
  const imageWrapper = heroEl.querySelector('.hero-image-wrapper');
  if (imageWrapper) {
    const imgEl = imageWrapper.querySelector('img');

    // Keep wrapper hidden until we know the image is ready
    gsap.set(imageWrapper, { opacity: 0, visibility: 'visible' });

    function startImageAnimation() {
      requestAnimationFrame(() => {
        gsap.fromTo(imageWrapper,
          { opacity: 0, filter: 'blur(34px)' },
          {
            opacity: 1,
            filter: 'blur(0px)',
            duration: 1.4,
            ease: 'power2.inOut',
            transformOrigin: 'top right',
          }
        );
      });
    }

    if (imgEl) {
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        // Image already cached — start immediately
        startImageAnimation();
      } else {
        // Begin animation after 800 ms regardless — preload should have
        // enough bytes by then for a graceful reveal (mirrors React logic).
        const earlyStart = setTimeout(startImageAnimation, 800);
        imgEl.addEventListener('load', () => {
          clearTimeout(earlyStart);
          startImageAnimation();
        }, { once: true });
        // Hard fallback in case load never fires
        setTimeout(startImageAnimation, 3000);
      }
    } else {
      // No image element — nothing to animate, just show wrapper
      gsap.set(imageWrapper, { opacity: 1 });
    }
  }

  // ── Scroll exit — image blurs and fades as user scrolls past hero ──
  // Only enable if hero_scroll_animation setting is enabled

  const animationEnabled = heroEl.getAttribute('data-hero-animation') !== 'false';

  if (animationEnabled) {
    function handleHeroScroll() {
      if (!imageWrapper) return;
      // Only apply on desktop (mirrors React isDesktop > 768 check)
      if (window.innerWidth <= 768) return;

      const rect = heroEl.getBoundingClientRect();
      const heroHeight = heroEl.clientHeight;
      // progress 0 = top of hero at viewport top; 1 = bottom of hero at viewport top
      const progress = Math.max(0, Math.min(1, -rect.top / heroHeight));

      // Blur/fade starts at 40% scroll progress, matches WINK_SCROLL.blurStart
      const blurStart = 0.4;
      const adjusted = Math.max(0, (progress - blurStart) / (1 - blurStart));

      const opacity = 1 - adjusted;
      const blur    = adjusted * 40;

      gsap.set(imageWrapper, {
        opacity,
        filter: `blur(${blur}px)`,
        visibility: opacity > 0.01 ? 'visible' : 'hidden',
      });
    }

    window.addEventListener('scroll', handleHeroScroll, { passive: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// CAROUSEL
// ═══════════════════════════════════════════════════════════════

function initCarousel() {
  const postsGrid = document.querySelector('[data-posts-layout="carousel"]');
  if (!postsGrid) return;

  const track = postsGrid.querySelector('.carousel-track');
  const prevBtn = postsGrid.querySelector('.carousel-prev');
  const nextBtn = postsGrid.querySelector('.carousel-next');
  const cards = track.querySelectorAll('.post-card');

  if (!track || !prevBtn || !nextBtn || cards.length === 0) return;

  const cardWidth = cards[0].offsetWidth;
  const gap = parseInt(getComputedStyle(track).gap);
  const scrollAmount = cardWidth + gap;

  // Arrow navigation
  prevBtn.addEventListener('click', () => {
    track.scrollBy({
      left: -scrollAmount,
      behavior: 'smooth'
    });
  });

  nextBtn.addEventListener('click', () => {
    track.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  });

  // Drag to scroll
  let isDown = false;
  let startX;
  let scrollLeft;

  track.addEventListener('mousedown', (e) => {
    isDown = true;
    track.style.cursor = 'grabbing';
    startX = e.pageX - track.offsetLeft;
    scrollLeft = track.scrollLeft;
  });

  track.addEventListener('mouseleave', () => {
    isDown = false;
    track.style.cursor = 'grab';
  });

  track.addEventListener('mouseup', () => {
    isDown = false;
    track.style.cursor = 'grab';
  });

  track.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - track.offsetLeft;
    const walk = (x - startX) * 2;
    track.scrollLeft = scrollLeft - walk;
  });

  // Update arrow visibility on scroll
  function updateArrows() {
    const atStart = track.scrollLeft <= gap;
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - gap;

    prevBtn.style.opacity = atStart ? '0.3' : '1';
    prevBtn.style.pointerEvents = atStart ? 'none' : 'auto';
    nextBtn.style.opacity = atEnd ? '0.3' : '1';
    nextBtn.style.pointerEvents = atEnd ? 'none' : 'auto';
  }

  track.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  track.style.cursor = 'grab';
  updateArrows();
}

// ═══════════════════════════════════════════════════════════════
// POSTS TABS
// ═══════════════════════════════════════════════════════════════

function initPostsTabs() {
  const tabsSection = document.querySelector('.posts-tabs-section');
  if (!tabsSection) return;

  const tabButtons = tabsSection.querySelectorAll('.posts-tab');
  const tabContents = tabsSection.querySelectorAll('.posts-tabs-content');
  const description = tabsSection.querySelector('.posts-tabs-description');

  const descriptions = {
    featured: 'Real products, real constraints, real impact.',
    experimental: 'Self-initiated projects built with AI tools and curiosity.'
  };

  function filterCardsByTab(tabName) {
    let totalCards = 0;
    let visibleCards = 0;
    tabContents.forEach(content => {
      const cards = content.querySelectorAll('.post-card');
      cards.forEach(card => {
        totalCards++;
        const tagSlugs = (card.getAttribute('data-tag-slugs') || '').toLowerCase();
        const tagsArray = tagSlugs.split(' ').filter(Boolean);
        const hasTab = tagsArray.includes(tabName.toLowerCase());
        if (hasTab) visibleCards++;
        console.log(`Card: "${card.querySelector('.post-card-title')?.textContent}" | tags="${tagSlugs}" | checking for "${tabName.toLowerCase()}" | match=${hasTab}`);
        card.style.display = hasTab ? '' : 'none';
      });
    });
    console.log(`[FilterResult] Tab: ${tabName} | Total cards: ${totalCards} | Visible: ${visibleCards}`);
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      if (!tabName) return;

      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active content
      tabContents.forEach(content => content.classList.remove('active'));
      const activeContent = tabsSection.querySelector(`.posts-tabs-content[data-tab="${tabName}"]`);
      if (activeContent) {
        activeContent.classList.add('active');
      }

      // Update description
      if (description) {
        description.textContent = descriptions[tabName] || '';
      }

      // Update section attribute
      tabsSection.setAttribute('data-active-tab', tabName);

      // Filter cards by tab
      filterCardsByTab(tabName);

      // Reinitialize carousel if needed
      setTimeout(() => {
        if (window.initCarousel) {
          initCarousel();
        }
      }, 100);
    });
  });

  // Apply initial filter on page load so the default "featured" tab
  // only shows posts actually tagged "featured".
  const initialTab = tabsSection.getAttribute('data-active-tab') || 'featured';
  filterCardsByTab(initialTab);
}

// ═══════════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// ═══════════════════════════════════════════════════════════════

function initTableOfContents() {
  console.log('initTableOfContents() function called');
  const tocContainer = document.querySelector('.post-toc-list');
  const tocNav = document.querySelector('.post-toc-nav');
  const contentArea = document.querySelector('.gh-content');

  console.log('TOC elements found:', { tocContainer, tocNav, contentArea });
  if (!tocContainer || !contentArea) {
    console.log('Missing required elements, returning early');
    return;
  }

  // Generate slug from text
  function generateSlug(text) {
    return 'toc-' + text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  // Create and insert controls (prev/next arrows only - Start is a regular TOC item)
  function createControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'post-toc-controls';

    // Get version parameter from existing theme icons for cache busting
    const themeIcon = document.querySelector('.theme-icon-sun');
    let versionParam = '';
    if (themeIcon && themeIcon.src) {
      const match = themeIcon.src.match(/\?v=[^&]+/);
      if (match) versionParam = match[0];
    }

    // Prev button with icon
    const prevBtn = document.createElement('button');
    prevBtn.className = 'post-toc-nav-btn post-toc-nav-prev';
    prevBtn.setAttribute('aria-label', 'Previous project');
    prevBtn.style.display = 'flex';
    prevBtn.style.visibility = 'visible';
    prevBtn.style.opacity = '1';

    const prevImg = document.createElement('img');
    prevImg.src = '/assets/icons/arrow-left.svg' + versionParam;
    prevImg.alt = 'Previous';
    prevBtn.appendChild(prevImg);

    const prevTooltip = document.createElement('span');
    prevTooltip.className = 'post-toc-tooltip';
    prevTooltip.textContent = 'Previous project';
    prevBtn.appendChild(prevTooltip);

    try {
      prevBtn.addEventListener('click', async () => {
      const article = document.querySelector('article.post');
      const currentId = article ? article.getAttribute('data-post-id') : null;
      const tagsStr = article ? article.getAttribute('data-post-tags') : null;

      if (currentId && tagsStr) {
        const tags = tagsStr.split(',').filter(t => t.trim());
        const tagSlug = tags[0];

        try {
          const response = await fetch(`/ghost/api/v3/content/posts/?key=53c1eef4fff835def4f59619d6&fields=id,url&filter=tag:${tagSlug}&order=published_at desc&limit=100`);
          const data = await response.json();
          const posts = data.posts || [];

          const currentIndex = posts.findIndex(p => p.id === currentId);
          if (currentIndex >= 0) {
            const prevIndex = currentIndex === 0 ? posts.length - 1 : currentIndex - 1;
            window.location.href = posts[prevIndex].url;
          }
        } catch (e) {
          console.log('Tag navigation unavailable');
        }
      } else {
        const prevLink = document.querySelector('a.post-nav-prev');
        if (prevLink && prevLink.offsetParent !== null) {
          prevLink.click();
        }
      }
      });
    } catch (e) {
      console.error('Error setting up prev button listener:', e);
    }

    // Next button with icon
    const nextBtn = document.createElement('button');
    nextBtn.className = 'post-toc-nav-btn post-toc-nav-next';
    nextBtn.setAttribute('aria-label', 'Next project');
    // Force visibility with inline styles
    nextBtn.style.display = 'flex';
    nextBtn.style.visibility = 'visible';
    nextBtn.style.opacity = '1';

    const nextImg = document.createElement('img');
    nextImg.src = '/assets/icons/arrow-right.svg' + versionParam;
    nextImg.alt = 'Next';
    nextBtn.appendChild(nextImg);

    const nextTooltip = document.createElement('span');
    nextTooltip.className = 'post-toc-tooltip';
    nextTooltip.textContent = 'Next project';
    nextBtn.appendChild(nextTooltip);

    try {
      nextBtn.addEventListener('click', async () => {
      const article = document.querySelector('article.post');
      const currentId = article ? article.getAttribute('data-post-id') : null;
      const tagsStr = article ? article.getAttribute('data-post-tags') : null;

      if (currentId && tagsStr) {
        const tags = tagsStr.split(',').filter(t => t.trim());
        const tagSlug = tags[0];

        try {
          const response = await fetch(`/ghost/api/v3/content/posts/?key=53c1eef4fff835def4f59619d6&fields=id,url&filter=tag:${tagSlug}&order=published_at desc&limit=100`);
          const data = await response.json();
          const posts = data.posts || [];

          const currentIndex = posts.findIndex(p => p.id === currentId);
          if (currentIndex >= 0) {
            const nextIndex = currentIndex === posts.length - 1 ? 0 : currentIndex + 1;
            window.location.href = posts[nextIndex].url;
          }
        } catch (e) {
          console.log('Tag navigation unavailable');
        }
      } else {
        const nextLink = document.querySelector('a.post-nav-next');
        if (nextLink && nextLink.offsetParent !== null) {
          nextLink.click();
        }
      }
      });
    } catch (e) {
      console.error('Error setting up next button listener:', e);
    }

    console.log('Appending prev button...');
    controlsDiv.appendChild(prevBtn);
    console.log('Prev button appended, controls children:', controlsDiv.children.length);

    console.log('Appending next button...');
    controlsDiv.appendChild(nextBtn);
    console.log('Next button appended, controls children:', controlsDiv.children.length);

    console.log('Controls created:', {
      prevBtn,
      nextBtn,
      controlsDiv,
      childCount: controlsDiv.children.length,
      prevDisplay: window.getComputedStyle(prevBtn).display,
      nextDisplay: window.getComputedStyle(nextBtn).display
    });

    return controlsDiv;
  }

  // Controls will be inserted into list after it's created (after Start item)

  // Add "Start" as a regular TOC item at the beginning of the list
  function addStartItem() {
    const startLi = document.createElement('li');
    startLi.className = 'post-toc-item post-toc-item-start';

    const startLink = document.createElement('a');
    startLink.href = '#start';
    startLink.className = 'post-toc-link';
    startLink.textContent = 'Start';

    startLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateActiveHeader(null); // Mark Start as active
    });

    startLi.appendChild(startLink);
    tocContainer.appendChild(startLi);  // Append instead of insertBefore
  }

  // Insert controls as first item (wrap in li for valid HTML structure)
  const controls = createControls();
  const controlsLi = document.createElement('li');
  controlsLi.className = 'post-toc-controls-item';
  controlsLi.appendChild(controls);
  tocContainer.appendChild(controlsLi);

  // Add "Start" as second item
  addStartItem();

  // Parse headers and build TOC (only h2)
  const headers = contentArea.querySelectorAll('h2');
  if (headers.length === 0) {
    // Add test items if no headers found
    const testLi = document.createElement('li');
    testLi.className = 'post-toc-item';
    const testLink = document.createElement('a');
    testLink.href = '#';
    testLink.className = 'post-toc-link';
    testLink.textContent = 'Test';
    testLi.appendChild(testLink);
    tocContainer.appendChild(testLi);

    const testLi2 = document.createElement('li');
    testLi2.className = 'post-toc-item post-toc-item--h3';
    const testLink2 = document.createElement('a');
    testLink2.href = '#';
    testLink2.className = 'post-toc-link';
    testLink2.textContent = 'Sub';
    testLi2.appendChild(testLink2);
    tocContainer.appendChild(testLi2);
    return;
  }

  headers.forEach(header => {
    // Assign id if missing
    if (!header.id) {
      header.id = generateSlug(header.textContent);
    }

    // Create TOC item
    const li = document.createElement('li');
    li.className = 'post-toc-item';

    const link = document.createElement('a');
    link.href = `#${header.id}`;
    link.className = 'post-toc-link';
    link.textContent = header.textContent;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      header.scrollIntoView({ behavior: 'smooth' });
      updateActiveHeader(header);
    });

    li.appendChild(link);
    tocContainer.appendChild(li);
  });

  // Track scroll position to show Start as active when at top
  function trackScrollPosition() {
    const scrollTop = window.scrollY;

    if (scrollTop < 100) {
      // At the top — activate Start item
      updateActiveHeader(null);
    }
  }

  // Intersection Observer for active header tracking
  const observerOptions = {
    rootMargin: '-100px 0px -66% 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        updateActiveHeader(entry.target);
      }
    });
  }, observerOptions);

  headers.forEach(header => observer.observe(header));

  // Track scroll for Start item activation
  document.addEventListener('scroll', trackScrollPosition, { passive: true });

  function updateActiveHeader(activeHeader) {
    // Remove active class from all items
    document.querySelectorAll('.post-toc-item--active').forEach(item => {
      item.classList.remove('post-toc-item--active');
    });

    // If activeHeader is null, activate Start item
    if (activeHeader === null) {
      const startItem = tocContainer.querySelector('.post-toc-item-start');
      if (startItem) {
        startItem.classList.add('post-toc-item--active');
      }
    } else {
      // Add active class to corresponding TOC item
      const activeItem = tocContainer.querySelector(
        `a[href="#${activeHeader.id}"]`
      )?.closest('.post-toc-item');

      if (activeItem) {
        activeItem.classList.add('post-toc-item--active');
        // Note: no scrollIntoView() here — the TOC is position:fixed so there
        // is nothing to scroll within it, and calling scrollIntoView() on a
        // fixed-position descendant can trigger unexpected page scroll.
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE TRANSITIONS
// ═══════════════════════════════════════════════════════════════

function initPageTransitions() {
  // Create overlay for page transitions (safe — doesn't affect fixed positioning)
  const overlay = document.createElement('div');
  overlay.className = 'page-transition-overlay';
  document.body.appendChild(overlay);

  // Animate in on page load
  requestAnimationFrame(() => {
    overlay.classList.add('page-transition-exit');
  });

  // Reset scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Handle link clicks for exit animation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    // Skip if it's external, hash link, or button-like element
    if (!href || href.startsWith('http') || href.startsWith('#') || link.target === '_blank') return;

    // Skip if it's within modals or special containers
    if (link.closest('.gh-portal, .search-modal, .subscribe-modal')) return;

    e.preventDefault();

    // Show overlay for exit animation
    overlay.classList.remove('page-transition-exit');
    overlay.classList.add('page-transition-enter');

    // Navigate after animation
    setTimeout(() => {
      window.location.href = href;
    }, 200);
  });

  // Reset overlay when page is restored from back/forward cache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      // Page was restored from cache (back button) — restore overlay to visible state
      // Browser handles scroll restoration automatically
      overlay.classList.remove('page-transition-enter');
      overlay.classList.add('page-transition-exit');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// POST NAVIGATION FILTERING
// ═══════════════════════════════════════════════════════════════

function initPostNavigation() {
  const navContainer = document.querySelector('.post-navigation');
  if (!navContainer) return;

  const article = document.querySelector('article.post');
  const currentId = article ? article.getAttribute('data-post-id') : null;
  const tagsStr = article ? article.getAttribute('data-post-tags') : null;

  // Update footer links to use tag-based navigation
  if (currentId && tagsStr) {
    const tags = tagsStr.split(',').filter(t => t.trim());
    const tagSlug = tags[0];

    fetch(`/ghost/api/v3/content/posts/?key=53c1eef4fff835def4f59619d6&fields=id,url,title,feature_image&filter=tag:${tagSlug}&order=published_at desc&limit=100`)
      .then(res => res.json())
      .then(data => {
        const posts = data.posts || [];
        const currentIndex = posts.findIndex(p => p.id === currentId);

        if (currentIndex >= 0) {
          // Get prev and next posts with cycling
          const prevIndex = currentIndex === 0 ? posts.length - 1 : currentIndex - 1;
          const nextIndex = currentIndex === posts.length - 1 ? 0 : currentIndex + 1;

          const prevPost = posts[prevIndex];
          const nextPost = posts[nextIndex];

          // Update prev link - always show if post exists
          const prevLink = navContainer.querySelector('a[rel="prev"]');
          if (prevPost) {
            if (prevLink) {
              prevLink.href = prevPost.url;
              const titleEl = prevLink.querySelector('.post-nav-title');
              if (titleEl) titleEl.textContent = prevPost.title;
              if (prevPost.feature_image) {
                const imgEl = prevLink.querySelector('.post-nav-image');
                if (imgEl) imgEl.src = prevPost.feature_image;
              }
              prevLink.style.display = 'flex';
            } else {
              // Create link if it doesn't exist
              const prevDiv = navContainer.querySelector('div:first-child');
              if (prevDiv) {
                const newPrevLink = document.createElement('a');
                newPrevLink.href = prevPost.url;
                newPrevLink.rel = 'prev';
                newPrevLink.className = 'post-nav-link post-nav-prev';
                if (prevPost.feature_image) {
                  const img = document.createElement('img');
                  img.src = prevPost.feature_image;
                  img.alt = prevPost.title;
                  img.className = 'post-nav-image';
                  newPrevLink.appendChild(img);
                }
                const content = document.createElement('div');
                content.className = 'post-nav-content';
                const label = document.createElement('div');
                label.className = 'post-nav-label';
                const labelImg = document.createElement('img');
                labelImg.src = '/assets/icons/arrow-left.svg';
                labelImg.alt = 'Previous';
                labelImg.className = 'post-nav-icon';
                label.appendChild(labelImg);
                label.appendChild(document.createTextNode('Previous'));
                const title = document.createElement('div');
                title.className = 'post-nav-title';
                title.textContent = prevPost.title;
                content.appendChild(label);
                content.appendChild(title);
                newPrevLink.appendChild(content);
                prevDiv.replaceWith(newPrevLink);
              }
            }
          } else {
            if (prevLink) prevLink.style.display = 'none';
          }

          // Update next link - always show if post exists
          const nextLink = navContainer.querySelector('a[rel="next"]');
          if (nextPost) {
            if (nextLink) {
              nextLink.href = nextPost.url;
              const titleEl = nextLink.querySelector('.post-nav-title');
              if (titleEl) titleEl.textContent = nextPost.title;
              if (nextPost.feature_image) {
                const imgEl = nextLink.querySelector('.post-nav-image');
                if (imgEl) imgEl.src = nextPost.feature_image;
              }
              nextLink.style.display = 'flex';
            } else {
              // Create link if it doesn't exist
              const nextDiv = navContainer.querySelector('div:last-child');
              if (nextDiv) {
                const newNextLink = document.createElement('a');
                newNextLink.href = nextPost.url;
                newNextLink.rel = 'next';
                newNextLink.className = 'post-nav-link post-nav-next';
                if (nextPost.feature_image) {
                  const img = document.createElement('img');
                  img.src = nextPost.feature_image;
                  img.alt = nextPost.title;
                  img.className = 'post-nav-image';
                  newNextLink.appendChild(img);
                }
                const content = document.createElement('div');
                content.className = 'post-nav-content';
                const label = document.createElement('div');
                label.className = 'post-nav-label';
                label.appendChild(document.createTextNode('Next'));
                const labelImg = document.createElement('img');
                labelImg.src = '/assets/icons/arrow-right.svg';
                labelImg.alt = 'Next';
                labelImg.className = 'post-nav-icon';
                label.appendChild(labelImg);
                const title = document.createElement('div');
                title.className = 'post-nav-title';
                title.textContent = nextPost.title;
                content.appendChild(label);
                content.appendChild(title);
                newNextLink.appendChild(content);
                nextDiv.replaceWith(newNextLink);
              }
            }
          } else {
            if (nextLink) nextLink.style.display = 'none';
          }
        }
      })
      .catch(() => {
        // Fall back to original Ghost behavior if API fails
        console.log('Tag-based footer nav unavailable');
      });
  }
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZE ALL
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired');
  initPageTransitions();
  initThemeToggle();
  initNavScrollBehavior();
  initMobileMenu();
  initScrollProgress();
  initCustomScrollbar();
  initHero();
  initCarousel();
  initPostsTabs();
  initTableOfContents();
  initPostNavigation();
});
