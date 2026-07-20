/**
 * THINKINGISFREE — Main JS
 * Navigation, theme toggle, scroll progress
 */

// console.log('main.js file loaded');

// ═══════════════════════════════════════════════════════════════
// GLOBAL GSAP SETUP - Register ScrollTrigger for all scripts
// ═══════════════════════════════════════════════════════════════
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  // console.log('[main] ✅ ScrollTrigger registered globally');
}

// ═══════════════════════════════════════════════════════════════
// GHOST CONTENT API HELPER
// ═══════════════════════════════════════════════════════════════
// Resolves the correct Content API key at runtime:
//   1. window.ghostContentKey — injected via Ghost Admin > Code Injection (production)
//   2. Hardcoded localhost dev key as fallback
// Usage in Ghost Admin > Site Header Code Injection:
//   <script>window.ghostContentKey = 'YOUR_PRODUCTION_CONTENT_API_KEY';</script>
// ───────────────────────────────────────────────────────────────
// Post utilities moved to post-utilities.js (getGhostContentKey, fetchPostsByTag)

// Prevent browser from auto-restoring scroll position from history state
if (history && typeof history.scrollRestoration !== 'undefined') {
  history.scrollRestoration = 'manual';
}

// Lock scroll on page load to prevent unwanted scroll-to-hash behavior.
// Skipped entirely on a post's close-button "curtain return" (see
// page-transition.js's runCurtainExit/runCurtainEntrance) — that flow
// deliberately scrolls to a saved position on load, which this lock's
// forced scrollTo(0,0) would otherwise immediately fight and undo (the
// lock's own 'scroll' listener below fires on that restore and reverts it).
let isCurtainReturn = false;
try { isCurtainReturn = sessionStorage.getItem('curtainReturn') === '1'; } catch (err) {}

let scrollLocked = false;
const lockScroll = () => {
  scrollLocked = true;
  window.scrollTo(0, 0);
};

// Prevent scroll immediately
if (!isCurtainReturn) lockScroll();
// Also block scroll events for 500ms after page load
window.addEventListener('scroll', (e) => {
  if (scrollLocked) {
    window.scrollTo(0, 0);
  }
}, { passive: false });

// Unlock after 500ms (enough time for page to fully load)
setTimeout(() => {
  scrollLocked = false;
  // console.log('[scroll] Scroll unlocked');

  // After unlock, scroll to hash if present (from external navigation)
  if (window.location.hash) {
    const hash = window.location.hash;
    const id = hash.slice(1);
    // console.log('[scroll] Hash found:', hash, '| Looking for element:', id);

    const element = document.getElementById(id);
    if (element) {
      // console.log('[scroll] Element found, scrolling to:', id);
      // Use a small delay to ensure scroll lock is fully released
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } else {
      // console.log('[scroll] Element not found for id:', id);
    }
  } else {
    // console.log('[scroll] No hash in URL');
  }
}, 500);

// Handle hash changes (menu clicks, navigation)
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  // console.log('[scroll] hashchange event, hash:', hash);

  if (hash) {
    // Wait a bit for DOM to settle before scrolling
    setTimeout(() => {
      const id = hash.slice(1);
      const element = document.getElementById(id);
      // console.log('[scroll] Looking for element:', id, '| Found:', !!element);

      if (element) {
        // console.log('[scroll] hashchange - scrolling to:', id);
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
});

// ═══════════════════════════════════════════════════════════════
// SCROLL-BASED ANIMATION CONFIG
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// HEADING ANIMATION CONFIG
// Controls scroll-triggered heading animations (initHeadingAnimations).
// data-animate and data-blur attributes on individual elements override
// these defaults per-instance.
// ═══════════════════════════════════════════════════════════════
// Configs moved to heading-animations.js and card-scroll-reveal.js

// ═══════════════════════════════════════════════════════════════
// SCROLL REVEAL ANIMATIONS TOGGLE — Set to false to disable all
// ═══════════════════════════════════════════════════════════════
const SCROLL_REVEAL_ENABLED = false;  // Set to true to enable heading/card scroll reveal

// ═══════════════════════════════════════════════════════════════
// UTILITIES — Conditional rendering, validation helpers
// ═══════════════════════════════════════════════════════════════

function isEmptyValue(val) {
  return val === null || val === undefined || val === '' || val === '{{.*}}';
}

function toggleElementIfEmpty(selector, shouldHide = true) {
  const el = document.querySelector(selector);
  if (el) {
    const isEmpty = isEmptyValue(el.textContent?.trim());
    if (isEmpty && shouldHide) {
      el.style.display = 'none';
    }
  }
}

// hideEmptyMetadata() moved to feature-modules.js

// ═══════════════════════════════════════════════════════════════
// H1 CHARACTER ANIMATION HELPERS
// ═══════════════════════════════════════════════════════════════

function computeTextSpread(charCount, minSpread, maxSpread) {
  const t = Math.min(Math.max((charCount - 5) / 45, 0), 1);
  return minSpread + t * (maxSpread - minSpread);
}

function initTitleReveal(selector, timeline = null) {
  const titleEl = document.querySelector(selector);
  if (!titleEl) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    titleEl.style.opacity = '1';
    return;
  }

  if (typeof gsap === 'undefined') {
    titleEl.style.opacity = '1';
    return;
  }

  // If a timeline is provided, use reusable function with it
  if (timeline) {
    animateH1LetterByLetter(titleEl, timeline, 0.15);
    return;
  }

  // Otherwise, create standalone timeline for post pages
  requestAnimationFrame(() => {
    try {
      const standalone = gsap.timeline();
      animateH1LetterByLetter(titleEl, standalone, 0);
    } catch (err) {
      // console.warn('[initTitleReveal] Error:', err);
      titleEl.style.opacity = '1';
    }
  });
}

function replaceHyphensWithNonBreaking() {
  // Replace regular hyphens with non-breaking hyphens (U+2011) in text elements
  // This prevents hyphenated words from breaking across lines during animation
  // Run immediately and again on a delay to catch dynamic content
  const applyReplacement = () => {
    const heroDesc = document.getElementById('hero-description');
    if (heroDesc && heroDesc.textContent) {
      heroDesc.textContent = heroDesc.textContent.replace(/-/g, '‑');
    }
  };

  applyReplacement();
  // Also run after a short delay in case content loads late
  setTimeout(applyReplacement, 50);
}

// ═══════════════════════════════════════════════════════════════
// REUSABLE ANIMATIONS
// ═══════════════════════════════════════════════════════════════

function animateImageEntrance(imageEl, timeline, ease, startTime = 0, duration = 0.8) {
  if (!imageEl || !timeline) return;

  // Fade entrance only: fade from 0 → 1 (no zoom)
  gsap.set(imageEl, {
    opacity: 0,
    visibility: 'visible'
  });

  timeline.to(imageEl, {
    opacity: 1,
    duration: duration,
    ease: ease
  }, startTime);
}

/**
 * Letter-by-letter entrance animation for a heading element.
 * Splits text into individual character spans and staggers their opacity
 * from 0 → 1. Optionally unblurs the heading container in parallel.
 *
 * @param {Element}       h1El      - The heading element to animate
 * @param {GSAPTimeline}  timeline  - GSAP timeline to add tweens to
 * @param {number}        startTime - Timeline insert position (seconds)
 * @param {number|null}   blurPx    - Starting blur in px (null = no blur)
 */
function animateH1LetterByLetter(h1El, timeline, startTime = 0.15, blurPx = null) {
  // console.log('[h1-anim] Called with h1El:', h1El, 'timeline:', !!timeline, 'startTime:', startTime);

  if (!h1El || !timeline) {
    // console.warn('[h1-anim] Missing h1El or timeline, returning');
    if (h1El) gsap.set(h1El, { opacity: 1, visibility: 'visible' });
    return;
  }

  if (h1El.dataset.lettersAnimated === 'true') {
    // console.warn('[h1-anim] Already animated, skipping');
    return;
  }

  try {
    // Make parent visible immediately
    gsap.set(h1El, { opacity: 1, visibility: 'visible' });

    const text = h1El.textContent;
    if (!text || text.trim().length === 0) {
      // console.warn('[h1-anim] No text content found');
      return;
    }

    // console.log('[h1-anim] ✓ Text found:', text.substring(0, 40), 'Length:', text.length);

    // Clear the h1 and manually create letter spans
    h1El.innerHTML = '';
    const letters = [];

    for (let char of text) {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = char;
      h1El.appendChild(span);
      letters.push(span);
    }

    // console.log('[h1-anim] ✓ Created', letters.length, 'letter spans manually');

    if (letters.length > 0) {
      // Set all letters invisible initially
      gsap.set(letters, { opacity: 0 });

      // Optional blur on the container — unblurs in parallel with letter reveal
      // DISABLED: blur removed from all letter reveal animations
      /* if (blurPx != null && blurPx > 0) {
        gsap.set(h1El, { filter: `blur(${blurPx}px)` });
        const blurCfg = HEADING_ANIM_CONFIG.letter;
        timeline.to(h1El, {
          filter: 'blur(0px)',
          duration: blurCfg.blurDuration,
          ease: 'power2.out',
        }, startTime);
      } */

      // Same capped formula as heading-animations.js's computeLetterStagger
      // (shrinks toward a tiny, fast gap as charCount grows, capped so
      // short text can't get the inflated gap the uncapped version gave
      // it — this call site had its own copy of that same raw formula).
      const cfg = HEADING_ANIM_CONFIG.letter;
      const charCount = letters.length;
      const stagger = window.computeLetterStagger
        ? window.computeLetterStagger(charCount)
        : Math.min(
            (cfg.spreadMax - ((charCount - 1) / 100) * (cfg.spreadMax - cfg.spreadMin)) / Math.max(1, charCount - 1),
            cfg.maxStagger || 0.025
          );

      // Animate each letter to full opacity
      timeline.to(letters, {
        opacity: 1,
        duration: cfg.charDuration,
        ease: cfg.ease,
        stagger: stagger
      }, startTime);

      // console.log('[h1-anim] ✅ Animation: 0.14s/char, stagger:', stagger.toFixed(3), 's');
    }

    h1El.dataset.lettersAnimated = 'true';
  } catch (err) {
    console.error('[h1-anim] ERROR:', err.message);
    gsap.set(h1El, { opacity: 1, visibility: 'visible' });
  }
}

// initStatementHeadingAnimation() — replaced by initHeadingAnimations()

function initStatsScroll() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  const section = document.getElementById('stats-scroll');
  if (!section) return;

  // On mobile items are stacked vertically — no horizontal scroll needed
  if (window.innerWidth <= 768) return;

  const ticker = section.querySelector('.stats-ticker');
  if (!ticker) return;

  try {
    const firstChild = ticker.firstElementChild;
    if (firstChild) {
      const itemWidth = firstChild.offsetWidth;
      const totalItems = ticker.querySelectorAll('.stat-item').length;
      const totalWidth = itemWidth * totalItems;
      const sectionWidth = section.offsetWidth;

      // If all items already fit, don't move the ticker
      if (totalWidth <= sectionWidth) {
        console.log('[stats-scroll] All items fit, no scroll animation needed');
        return;
      }

      const contentWidth = totalWidth / 2;

      gsap.fromTo(
        ticker,
        { x: 0 },
        {
          x: -contentWidth,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top-=200',
            scrub: 1,
            markers: false,
            immediateRender: false,
          }
        }
      );
    }
  } catch (err) {
    console.error('[stats-scroll] ERROR:', err.message, 'stack:', err.stack);
  }
}

function initHeroFadeOut() {
  const hero = document.querySelector('.hero[data-section-id="hero"]');
  if (!hero) return;

  // Hide hero section when scrolled fully out of view
  let lastScrollY = 0;
  function checkHeroVisibility() {
    const scrollY = window.scrollY;
    // innerHeight, NOT hero.offsetHeight: once the hero is display:none its
    // offsetHeight is 0, which collapsed the threshold to 0 and self-locked
    // the hero hidden for any scrollY > 0 — it could only reappear at
    // exactly the top of the page, which read as an abrupt pop-in after
    // slow upward scrolling. The hero is 100dvh by design, so the viewport
    // height IS its height, visible or not.
    const heroHeight = window.innerHeight;
    const isHidden = scrollY > heroHeight * 0.8; // Hide when 80% scrolled past

    if (isHidden && hero.style.display !== 'none') {
      hero.style.display = 'none';
    } else if (!isHidden && hero.style.display === 'none') {
      hero.style.display = 'block';
    }

    lastScrollY = scrollY;
  }

  window.addEventListener('scroll', checkHeroVisibility, { passive: true });
  // Initial check
  checkHeroVisibility();
}

function initHeroTitleReveal() {
  // Animate hero container blur/scale (H1 animation is handled by initHero())
  const heroContent = document.querySelector('.hero-content');

  if (heroContent && typeof gsap !== 'undefined') {
    gsap.fromTo(
      heroContent,
      {
        filter: 'blur(4px)',
        transform: 'scale(0.98)',
      },
      {
        filter: 'blur(0px)',
        transform: 'scale(1)',
        duration: 0.6,
        ease: 'power2.in',
      }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// THEME TOGGLE - Extracted to theme.js
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// NAVIGATION SCROLL HIDE/SHOW
// ═══════════════════════════════════════════════════════════════

// initNavScrollBehavior() - Extracted to ui-utilities.js

// ═══════════════════════════════════════════════════════════════
// CUSTOM SCROLLBAR THUMB POSITION
// ═══════════════════════════════════════════════════════════════

// initCustomScrollbar() - Extracted to ui-utilities.js

// ═══════════════════════════════════════════════════════════════
// DRAG-TO-SCROLL FOR STICKY NAV & TOC (Extracted to ui-utilities.js)
// ═══════════════════════════════════════════════════════════════

function initDragToScroll() {
  const scrollableElements = document.querySelectorAll('.sticky-nav, .post-toc-nav');
  let activeElement = null;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  // Single document-level mouseup handler (prevents accumulating listeners)
  const handleDocumentMouseUp = () => {
    if (activeElement) {
      isDown = false;
      activeElement.style.cursor = 'grab';
      activeElement = null;
    }
  };

  // Add document listener only once
  if (scrollableElements.length > 0) {
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('mouseup', handleDocumentMouseUp);
  }

  scrollableElements.forEach(el => {
    el.addEventListener('mousedown', (e) => {
      isDown = true;
      activeElement = el;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('mousemove', (e) => {
      if (!isDown || activeElement !== el) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1;
      el.scrollLeft = scrollLeft - walk;
    });

    el.addEventListener('mouseleave', () => {
      if (!isDown) {
        el.style.cursor = 'grab';
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// MOBILE MENU TOGGLE
// ═══════════════════════════════════════════════════════════════

// initMobileMenu() - Extracted to ui-utilities.js

// ═══════════════════════════════════════════════════════════════
// WAIT FOR H1 CONTENT — Ensure headline text is rendered
// ═══════════════════════════════════════════════════════════════

function waitForH1Content(selector = '.hero-headline') {
  return new Promise((resolve) => {
    const h1 = document.querySelector(selector);
    if (!h1) {
      resolve();
      return;
    }

    // Check if h1 already has text
    if (h1.textContent?.trim()) {
      resolve();
      return;
    }

    // Poll for text content (up to 3 seconds, check every 50ms)
    let checks = 0;
    const maxChecks = 60; // 60 checks × 50ms = 3 seconds
    const checkInterval = setInterval(() => {
      checks++;
      if (h1.textContent?.trim() || checks >= maxChecks) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 50);
  });
}

// ═══════════════════════════════════════════════════════════════
// IMAGE PRELOAD — Wait for hero images, show progress via scroll bar
// ═══════════════════════════════════════════════════════════════

function waitForHeroImages() {
  return new Promise((resolve) => {
    const progressBar = document.querySelector('.scroll-progress');
    const heroWrapper = document.querySelector('.hero-image-wrapper');

    // No hero images on this page -> NOTHING to indicate. This used to run
    // the full loading theater anyway (bar to 5%, then completePageLoad's
    // jump to 100% width + fade) on EVERY page — on about/contact/work a
    // full-viewport-wide gradient bar flashed under the nav on each
    // refresh ("strange gradient-like artifact bar"), racing
    // scroll-progress.js's own writes to the same element. Leave the bar
    // entirely alone and let scroll progress own it.
    if (!heroWrapper) {
      resolve();
      return;
    }

    const images = heroWrapper.querySelectorAll('img');
    if (images.length === 0) {
      resolve();
      return;
    }

    // Show progress bar during load (hero pages only)
    if (progressBar) {
      progressBar.style.width = '5%';
      progressBar.style.opacity = '1';
    }

    let loadedCount = 0;
    const totalCount = images.length;

    const checkComplete = () => {
      if (loadedCount === totalCount) {
        completePageLoad(progressBar);
        resolve();
      }
    };

    images.forEach((img, idx) => {
      // Simulate progress: animate bar as images load
      const progressStep = 30 + (idx * 30); // 30%, 60%, 90%
      const onLoad = () => {
        if (progressBar) progressBar.style.width = progressStep + '%';
        loadedCount++;
        checkComplete();
      };

      if (img.complete) {
        onLoad();
      } else {
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onLoad, { once: true });
      }
    });

    // Timeout: proceed after 3.5s even if images don't load
    setTimeout(() => {
      if (loadedCount < totalCount) {
        completePageLoad(progressBar);
        resolve();
      }
    }, 3500);
  });
}

function completePageLoad(progressBar) {
  if (progressBar) {
    progressBar.style.width = '100%';
    // Hide after brief delay
    setTimeout(() => {
      progressBar.style.opacity = '0';
    }, 300);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCROLL PROGRESS BAR
// ═══════════════════════════════════════════════════════════════

// initScrollProgress() - Extracted to scroll-progress.js

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
  // console.log('[DEBUG initHero] Starting...');
  const heroEl = document.querySelector('.hero[data-section-id="hero"]');
  if (!heroEl) {
    // console.warn('[DEBUG initHero] Hero section not found');
    return;
  }

  // console.log('[DEBUG initHero] Starting animation timeline');

  // Guard: if GSAP or SplitType are not available (CDN failure etc.) reveal
  // everything immediately so the page is still readable.
  if (typeof gsap === 'undefined') {
    // console.warn('[initHero] GSAP not loaded, revealing elements immediately');
    ['.hero-intro', '.hero-headline', '.hero-description', '.hero-image-wrapper']
      .forEach(sel => {
        const el = heroEl.querySelector(sel);
        if (el) el.style.opacity = '1';
      });
    heroEl.querySelectorAll('.hero-tags .tag').forEach(el => { el.style.opacity = '1'; });
    return;
  }

  // Match post header ease: cubic-bezier(0.2, 0, 0, 1) for snappy, front-loaded motion
  const ease = 'cubic-bezier(0.2, 0, 0, 1)';

  // ── Build entrance timeline ──────────────────────────────────
  const tl = gsap.timeline({ delay: 0 });

  // 0. Hero container — DISABLED: line animations handled by scroll-scrub-anim.js
  // const heroContent = heroEl.querySelector('.hero-content');
  // if (heroContent) { tl.fromTo(...) }

  // 1. Intro label — split into words then stagger in
  const introEl = heroEl.querySelector('.hero-intro');
  if (introEl && typeof SplitType !== 'undefined') {
    const split = new SplitType(introEl, { types: 'words' });
    // CRITICAL: make parent visible immediately — GSAP will animate the
    // child word spans. If the parent stays at opacity:0 (CSS initial state),
    // the word animations are invisible even when they reach opacity:1.
    gsap.set(introEl, { opacity: 1, visibility: 'visible' });
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
    gsap.set(introEl, { opacity: 0, y: 12, visibility: 'hidden' });
    tl.to(introEl, { opacity: 1, visibility: 'visible', y: 0, duration: 0.5, ease }, 0);
  }

  // 2. Headline — letter-by-letter animation (delayed to 0.25s)
  const headlineEl = heroEl.querySelector('.hero-headline');
  if (headlineEl) {
    // Skip animation — using new line-reveal from hero.hbs partial
    // animateH1LetterByLetter(headlineEl, tl, 0.1);
  }

  // 3. Description paragraph — letter-by-letter animation (starts at 0.35s)
  const descEl = heroEl.querySelector('.hero-description');
  if (descEl) {
    // console.log('[description] Element found, text:', descEl.textContent.substring(0, 30));
    gsap.set(descEl, { opacity: 0, visibility: 'visible' });
    animateH1LetterByLetter(descEl, tl, 0.15);
  }

  // 4. Tag pills — scale + fade with stagger (moved earlier to 0.2s)
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
    }, 0.2);
  }

  // 5. Hero background — no fade: scroll-scrub-anim.js owns all child animations.
  //    Fading the parent container here would override span animations inside it.

  // 6. Hero image entrance — zoom + fade (reusable image entrance animation)
  const imageWrapper = heroEl.querySelector('.hero-image-wrapper');
  if (imageWrapper) {
    if (window.__pageEntranceOwns) {
      // page-level landing entrance owns the reveal (same-site nav) —
      // don't stack a second image fade on top of it
      gsap.set(imageWrapper, { opacity: 1, visibility: 'visible' });
    } else {
      animateImageEntrance(imageWrapper, tl, ease, 0, 0.8);
    }
  }

  // Mark when entrance animation completes (2 seconds before blink starts)
  const totalDuration = tl.duration();
  tl.eventCallback('onComplete', () => {
    heroEl.setAttribute('data-hero-entrance-done', 'true');
    // Always dispatch heroEntranceDone after hero animation — logomark and
    // other listeners depend on it regardless of whether hero_image is set.
    setTimeout(() => {
      const entranceEvent = new CustomEvent('heroEntranceDone');
      heroEl.dispatchEvent(entranceEvent);
    }, 2000);
  });


  // console.log('[DEBUG initHero] ✅ Complete. Timeline duration:', tl.duration(), 'Paused?', tl.paused());
}

// ═══════════════════════════════════════════════════════════════
// POST HEADER ENTRANCE ANIMATION
// Same pattern as hero: blur/scale on container + h1 letter animation
// ═══════════════════════════════════════════════════════════════

function initPostHeaderAnimation() {
  if (typeof gsap === 'undefined') return;

  const postHeader = document.querySelector('.post-header');
  const pageHeader = document.querySelector('.page-header');
  const headerEl = postHeader || pageHeader;
  if (!headerEl) return;

  // Skip animation on homepage hero (page-header reused there via partials)
  if (headerEl.closest('.home')) return;

  const runHeaderAnimation = () => {
    const ease = 'cubic-bezier(0.2, 0, 0, 1)';

    // Set initial state immediately to prevent pre-animation flash
    gsap.set(headerEl, { opacity: 0, filter: 'blur(4px)' });

    const tl = gsap.timeline({ delay: 0 });

    tl.to(headerEl, {
      opacity: 1,
      filter: 'blur(0px)',
      duration: 0.8,
      ease: 'power2.out',
    }, 0);

    const postTitle = headerEl.querySelector('.post-title, .page-title');
    if (postTitle) {
      animateH1LetterByLetter(postTitle, tl, 0);
    }

    const heroImage = headerEl.querySelector('.post-image img, .post-image-wrapper img, .page-image img');
    if (heroImage) {
      // CSS holds the initial state (opacity 0, scale 0.95 in main.css);
      // this animation is the only thing that reveals the image — it must
      // animate opacity, not just scale.
      tl.to(heroImage, {
        opacity: 1,
        transform: 'scale(1)',
        duration: 0.8,
        ease: 'power2.out',
      }, 0);
    }

    // First content image (kg-image card) joins the entrance — card-scroll-
    // reveal excludes it (it can sit above the fold where its scroll-driven
    // reveal never fires), so this timeline is what brings it in.
    const firstContentImage = headerEl.closest('.post, .page')?.querySelector('.gh-content img');
    if (firstContentImage) {
      tl.fromTo(firstContentImage,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out' },
        0.2);
    }

    // Animate page-body on about/contact pages
    const pageBody = headerEl.closest('.page')?.querySelector('.page-body');
    if (pageBody) {
      gsap.set(pageBody, { opacity: 0, filter: 'blur(4px)' });
      tl.to(pageBody, {
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.8,
        ease: 'power2.out',
      }, 0.2);  // Stagger slightly after header
    }

    // Animate work-section on work page with scale-up
    const workSection = headerEl.closest('.page')?.querySelector('.work-section');
    if (workSection) {
      gsap.set(workSection, { opacity: 0, scale: 0.95 });
      tl.to(workSection, {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'power2.out',
      }, 0.2);  // Stagger slightly after header
    }
  };

  const overlay = document.querySelector('.page-transition-overlay');
  if (overlay) {
    let started = false;
    const startOnce = () => {
      if (started) return;
      started = true;
      runHeaderAnimation();
    };

    const handleOverlayAnimation = (event) => {
      if (event.animationName === 'pageTransitionExit') {
        overlay.removeEventListener('animationend', handleOverlayAnimation);
        startOnce();
      }
    };

    overlay.addEventListener('animationend', handleOverlayAnimation);

    // Fallback in case animation already ended before listener attached
    setTimeout(startOnce, 400);
    return;
  }

  runHeaderAnimation();
}

// ═══════════════════════════════════════════════════════════════
// PAGE TITLE ANIMATION (About/Contact pages)
// H1 letter-by-letter reveal without header blur (avoids pre-animation)
// ═══════════════════════════════════════════════════════════════

function initPageTitleAnimation() {
  if (typeof gsap === 'undefined') return;

  const pageTitle = document.querySelector('.page-title');
  if (!pageTitle) return;

  // Skip on homepage
  if (pageTitle.closest('.home')) return;

  // Use standalone timeline for page titles
  requestAnimationFrame(() => {
    try {
      const standalone = gsap.timeline();
      animateH1LetterByLetter(pageTitle, standalone, 0);
    } catch (err) {
      // console.warn('[pageTitle] Error:', err);
      pageTitle.style.opacity = '1';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// PAGE BODY ENTRANCE ANIMATION
// Fade + blur reveal for page content (about, contact pages)
// ═══════════════════════════════════════════════════════════════

function initPageBodyAnimation() {
  if (typeof gsap === 'undefined') return;

  const pageBody = document.querySelector('.page-body');
  if (!pageBody) return;

  // Skip on homepage
  if (pageBody.closest('.home')) return;

  const runPageBodyAnimation = () => {
    gsap.fromTo(pageBody, {
      opacity: 0,
      filter: 'blur(4px)',
    }, {
      opacity: 1,
      filter: 'blur(0px)',
      duration: 0.8,
      ease: 'power2.out',
    });
  };

  const overlay = document.querySelector('.page-transition-overlay');
  if (overlay) {
    let started = false;
    const startOnce = () => {
      if (started) return;
      started = true;
      runPageBodyAnimation();
    };

    const handleOverlayAnimation = (event) => {
      if (event.animationName === 'pageTransitionExit') {
        overlay.removeEventListener('animationend', handleOverlayAnimation);
        startOnce();
      }
    };

    overlay.addEventListener('animationend', handleOverlayAnimation);
    setTimeout(startOnce, 400);
    return;
  }

  runPageBodyAnimation();
}

// ═════════════════════════════════════════════════════════════════
// CAROUSEL
// ═════════════════════════════════════════════════════════════════
// HERO BLINK ANIMATION (EYE BLINK ON SCROLL)
// ═════════════════════════════════════════════════════════════════

function initHeroBlink() {
  if (typeof gsap === 'undefined') return;

  const blinkOverlay = document.getElementById('hero-blink-overlay');
  // console.log('[initHeroBlink] Blink overlay:', blinkOverlay ? '✅ FOUND' : '❌ NOT FOUND');
  if (!blinkOverlay) {
    // console.warn('[initHeroBlink] Check: @custom.hero_image set in Ghost Admin?');
    return;
  }

  const heroEl = document.querySelector('.hero[data-section-id="hero"]');
  if (!heroEl) return;

  // Only on desktop
  if (window.innerWidth <= 768) {
    // console.log('[initHeroBlink] Mobile detected, disabled');
    return;
  }

  // console.log('[initHeroBlink] ✅ Setting up blink animation');

  let isBlinkLocked = false;

  // Blink animation: eye closes and opens (0.3s total)
  function playBlink(source = 'auto') {
    // console.log('[initHeroBlink] Playing blink animation (', source, ')');
    const blinkTl = gsap.timeline();

    // Eye closes (0-0.15s)
    blinkTl.to(blinkOverlay, {
      opacity: 1,
      duration: 0.15,
      ease: 'power2.inOut',
    }, 0);

    // Eye opens (0.15-0.3s)
    blinkTl.to(blinkOverlay, {
      opacity: 0,
      duration: 0.15,
      ease: 'power2.inOut',
    }, 0.15);

    // Lock hover triggers for 2 seconds after blink completes
    blinkTl.eventCallback('onComplete', () => {
      isBlinkLocked = true;
      // console.log('[initHeroBlink] Hover locked for 2s');
      setTimeout(() => {
        isBlinkLocked = false;
        // console.log('[initHeroBlink] Hover unlocked');
      }, 2000);
    });
  }

  // Trigger 1: Automatically 2 seconds after entrance animation completes
  heroEl.addEventListener('heroEntranceDone', () => {
    // console.log('[initHeroBlink] Auto-trigger: 2s after entrance animation');
    playBlink('auto');
  });

  // Trigger 2: On hover of hero section (with lock)
  heroEl.addEventListener('mouseenter', () => {
    if (!isBlinkLocked) {
      // console.log('[initHeroBlink] Hover-trigger (unlocked)');
      playBlink('hover');
    } else {
      // console.log('[initHeroBlink] Hover-trigger blocked (locked)');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// STACKED CARDS LAYOUT
// ═══════════════════════════════════════════════════════════════
// Each card scrolls into view, sticks at the top, and the next
// card arriving from below gradually scales/pushes the previous
// one back in Z space (depth). Uses GSAP ScrollTrigger scrub.
// ═══════════════════════════════════════════════════════════════

function initStackedCards() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const allStackedGrids = document.querySelectorAll('[data-posts-layout="stacked"]');
  if (!allStackedGrids.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  allStackedGrids.forEach(postsGrid => initSingleStackedGrid(postsGrid, prefersReducedMotion));
}

function initSingleStackedGrid(postsGrid, prefersReducedMotion) {
  // Skip grids inside inactive tabs — they're position:absolute with no layout height
  const tabContent = postsGrid.closest('.posts-tabs-content');
  if (tabContent && !tabContent.classList.contains('active')) {
    // console.log('[stacked] skipping inactive tab grid');
    return;
  }

  const track = postsGrid.querySelector('.carousel-track');
  if (!track) { console.warn('[stacked] no .carousel-track found'); return; }

  // Skip if already initialized
  if (track.dataset.stackedInit) {
    // console.log('[stacked] already initialized, skipping');
    return;
  }
  track.dataset.stackedInit = '1';

  // Ghost pre-filters each track — use all cards directly, no display filter needed
  const cards = Array.from(track.querySelectorAll('.post-card'));
  // console.log('[stacked] found', cards.length, 'cards in', tabContent?.className);
  if (cards.length === 0) return;

  // ── Fantasma-style: cards are sticky via CSS margin-bottom, no JS wrapper ──
  // Each card sticks at STICKY_TOP. The margin-bottom creates scroll space.
  // JS only handles the scale/depth animation as next card scrolls in.

  const STICKY_TOP_RATIO = 0.20; // matches CSS top: 20vh
  const SCALE_MAX  = 0.06;  // subtle scale reduction per card
  const MAX_Y      = -20;   // px upward drift per card

  if (prefersReducedMotion) return;

  // Cache natural (pre-transform) absolute document tops for each card.
  // BCR of a transformed card includes the transform offset, creating a
  // feedback loop: card[j]'s translateY shifts its BCR.top → inflates p for
  // card[i] → more compression → oscillation / jank. Caching natural tops
  // and using pure scroll math eliminates this entirely.
  let cardNaturalTops = [];
  let trackNaturalBottom = 0;

  function cacheTops() {
    const saved = cards.map(c => c.style.transform);
    cards.forEach(c => { c.style.transform = ''; });
    void track.offsetHeight; // force reflow so BCR reflects cleared transforms
    const sy = window.scrollY;
    cardNaturalTops = cards.map(c => c.getBoundingClientRect().top + sy);
    trackNaturalBottom = track.getBoundingClientRect().bottom + sy; // includes padding-bottom
    cards.forEach((c, i) => { c.style.transform = saved[i]; });
  }

  function updateCards() {
    const vh        = window.innerHeight;
    const stickyTop = Math.round(vh * STICKY_TOP_RATIO);
    const scrollY   = window.scrollY;

    // Clear transforms only when the TRACK's natural bottom has scrolled past stickyTop.
    // Using the track's full bottom (including padding-bottom) means we wait until the
    // entire section — including the group-animation buffer — has actually scrolled past.
    const lastNatTop = cardNaturalTops[cards.length - 1];
    if (trackNaturalBottom > 0 && trackNaturalBottom - scrollY < stickyTop) {
      cards.forEach(c => { c.style.transform = ''; c.style.opacity = ''; });
      return;
    }

    // Group animation: once the last card locks, ALL cards (including the topmost)
    // sink together over the padding-bottom scroll space before section releases.
    // groupP = 0 while cards are still approaching; 0→1 over 60vh after last locks.
    const allLockedScrollY = lastNatTop !== undefined ? lastNatTop - stickyTop : Infinity;
    const groupRange       = Math.round(vh * 0.60);
    const groupP           = Math.max(0, Math.min(1, (scrollY - allLockedScrollY) / groupRange));
    const groupScale       = SCALE_MAX * 0.5 * groupP;
    const groupY           = MAX_Y * 0.5 * groupP;

    cards.forEach((card, i) => {
      // Last card: only participates in the group animation (nothing stacks above it).
      if (i === cards.length - 1) {
        if (groupP > 0.001) {
          card.style.transform = `translateY(${groupY}px) scale(${1 - groupScale})`;
        } else {
          card.style.transform = '';
        }
        card.style.opacity = '';
        return;
      }

      // Pure scroll math — no BCR reads, no feedback loop.
      // Linear p: proportional to scroll position, no amplification, no jumps.
      let nextP      = 0;
      let totalDepth = 0;
      for (let j = i + 1; j < cards.length; j++) {
        const natTop = cardNaturalTops[j];
        if (natTop === undefined) continue;
        const naturalViewTop = natTop - scrollY;
        const viewTop = Math.max(stickyTop, naturalViewTop);
        const p = Math.min(1, Math.max(0, (vh - viewTop) / (vh - stickyTop)));
        if (j === i + 1) nextP = p;
        totalDepth += p;
      }

      if (totalDepth < 0.001 && groupP < 0.001) {
        card.style.transform = '';
        card.style.opacity   = '';
        return;
      }

      const d     = Math.min(cards.length - 1 - i, totalDepth);
      const scale = 1 - SCALE_MAX * d - groupScale; // individual depth + group
      const y     = MAX_Y * d + groupY;             // individual depth + group

      // Per-card fade: triggered by card[i+2]'s approach (NOT card[i+1]).
      let fadeP = 0;
      const fadeIdx = i + 2;
      if (fadeIdx < cards.length && cardNaturalTops[fadeIdx] !== undefined) {
        const fNatTop = cardNaturalTops[fadeIdx];
        const fViewTop = Math.max(stickyTop, fNatTop - scrollY);
        fadeP = Math.min(1, Math.max(0, (vh - fViewTop) / (vh - stickyTop)));
      }
      const fadeT   = Math.max(0, (fadeP - 0.97) / 0.08);
      const opacity = 1 - fadeT;

      card.style.transform = `translateY(${y}px) scale(${scale})`;
      card.style.opacity   = fadeT > 0 ? String(opacity) : '';
    });
  }

  // RAF throttle
  let rafPending = false;
  function onScroll() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; updateCards(); });
    }
  }

  // Cache natural tops, then start animation
  requestAnimationFrame(() => {
    cacheTops();
    updateCards();
  });

  // Re-cache after images load (lazy images change card heights)
  window.addEventListener('load', () => requestAnimationFrame(() => {
    cacheTops();
    updateCards();
  }));

  // Re-cache on resize (viewport changes affect sticky positions)
  const onStackedCardsResize = () => requestAnimationFrame(() => {
    cacheTops();
    updateCards();
  });
  // Unique id per grid — initSingleStackedGrid runs once per tab panel
  // (this function is called from a forEach over multiple stacked grids),
  // a shared id would let one tab's subscription silently replace another's.
  const stackedCardsId = 'stacked-cards-' + (tabContent?.dataset.tab || Math.random().toString(36).slice(2));
  if (window.resizeManager) window.resizeManager.subscribe(stackedCardsId, onStackedCardsResize);
  else window.addEventListener('resize', onStackedCardsResize, { passive: true });

  window.addEventListener('scroll', onScroll, { passive: true });

  // console.log('[initStackedCards] Initialized', cards.length, 'cards (fantasma pattern)');
}

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
  if (window.resizeManager) window.resizeManager.subscribe('carousel-arrows', updateArrows);
  else window.addEventListener('resize', updateArrows);
  track.style.cursor = 'grab';
  updateArrows();
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCH COMPONENT
// ═══════════════════════════════════════════════════════════════

function initTabSwitch() {
  const outer      = document.getElementById('tab-switch-outer');
  const scene      = document.getElementById('tab-switch-scene');
  const indicator  = document.getElementById('tab-switch-indicator');
  const desc       = document.getElementById('tab-switch-description');
  const switchBtns = outer ? outer.querySelectorAll('.tab-switch-btn') : [];
  const tabsSection = document.querySelector('.posts-tabs-section');

  if (!outer || !scene || !switchBtns.length || !tabsSection) return;

  const descriptions = {
    featured:     'Real products, real constraints, real impact.',
    experimental: 'Pitches, smaller projects, and explorations.'
  };

  // ── Slide indicator to active button ───────────────────────
  // Position the indicator by measuring the button's offset inside the pill.
  function slideIndicator(activeBtn) {
    if (!indicator) return;
    // offsetTop/Left/Width/Height are layout (pre-transform) values relative
    // to offsetParent (.tab-switch-pill), so they work correctly whether the
    // scene is scaled or not — no getBoundingClientRect timing issues.
    indicator.style.top    = activeBtn.offsetTop    + 'px';
    indicator.style.left   = activeBtn.offsetLeft   + 'px';
    indicator.style.width  = activeBtn.offsetWidth  + 'px';
    indicator.style.height = activeBtn.offsetHeight + 'px';
  }

  // Initialise indicator position
  const initialActive = outer.querySelector('.tab-switch-btn.active');
  if (initialActive) requestAnimationFrame(() => slideIndicator(initialActive));

  // ── Switch button click → sync to posts-tabs ───────────────
  switchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;

      // Update switch active state
      switchBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      slideIndicator(btn);

      // Update description
      if (desc) desc.textContent = descriptions[tab] || '';

      // Trigger the corresponding posts-tab button
      const tabBtn = tabsSection.querySelector(`.posts-tab[data-tab="${tab}"]`);
      if (tabBtn) tabBtn.click();
    });
  });

  // ── Keep switch in sync when posts-tabs buttons are clicked ─
  const postTabBtns = tabsSection.querySelectorAll('.posts-tab');
  postTabBtns.forEach(ptBtn => {
    ptBtn.addEventListener('click', () => {
      const tab = ptBtn.dataset.tab;
      switchBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
        b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false');
      });
      const switchActive = outer.querySelector(`.tab-switch-btn[data-tab="${tab}"]`);
      if (switchActive) slideIndicator(switchActive);
      if (desc) desc.textContent = descriptions[tab] || '';
    });
  });

  // ── Entrance: slide up when scrolled into view ─────────────
  const entranceObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          outer.classList.add('is-visible');
          entranceObserver.disconnect(); // only fires once
        }
      });
    },
    { threshold: 0.2 }
  );
  entranceObserver.observe(outer);

  // ── Sticky scale: scale down when outer reaches viewport top ─
  // CSS handles position:sticky + scale via .is-sticky.
  // JS only adds/removes the class — no coordinate math needed.
  let isSticky    = false;
  let ticking     = false;
  let stickyScrollY = 0; // scrollY recorded when we stuck

  function updateIndicator() {
    const activeBtn = outer.querySelector('.tab-switch-btn.active');
    if (activeBtn) slideIndicator(activeBtn);
  }

  // Create a body-level fixed element that blurs the canvas behind the pill.
  // This is the only reliable way — backdrop-filter inside a sticky stacking
  // context cannot see position:fixed elements behind it.
  const blurLayer = document.createElement('div');
  blurLayer.className = 'tab-blur-layer';
  blurLayer.style.opacity = '0';
  document.body.appendChild(blurLayer);

  function updateBlurLayer() {
    const pill = document.querySelector('.tab-switch-pill');
    if (!pill) return;
    const r = pill.getBoundingClientRect();
    blurLayer.style.top    = r.top  + 'px';
    blurLayer.style.left   = r.left + 'px';
    blurLayer.style.width  = r.width  + 'px';
    blurLayer.style.height = r.height + 'px';
    // Hide if pill is off-screen or the scene has been faded out
    const scene = document.getElementById('tab-switch-scene');
    const sceneOpacity = scene ? parseFloat(scene.style.opacity) : 1;
    const inView = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    blurLayer.style.opacity = (inView && sceneOpacity !== 0) ? '1' : '0';
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;

      const sectionRect = tabsSection.getBoundingClientRect();
      const navH  = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 60;
      const thresh = navH;

      if (!isSticky) {
        const outerRect = outer.getBoundingClientRect();
        if (outerRect.top <= thresh) {
          isSticky = true;
          stickyScrollY = window.scrollY;
          // Reserve the space so content below doesn't collapse/jump
          const spacer = document.createElement('div');
          spacer.id = 'tab-switch-spacer';
          spacer.style.cssText = `height:${outer.offsetHeight}px;flex-shrink:0;pointer-events:none;`;
          outer.insertAdjacentElement('afterend', spacer);
          outer.classList.add('is-sticky');
          updateIndicator();
        }
      } else {
        // Only scrollY can reliably detect scroll-up past the stick point.
        if (window.scrollY < stickyScrollY) {
          isSticky = false;
          const spacer = document.getElementById('tab-switch-spacer');
          if (spacer) spacer.remove();
          outer.classList.remove('is-sticky');
          updateIndicator();
        }
      }

      // Fade pill out when section has scrolled fully past viewport (no position change = no reflow)
      if (isSticky) {
        const scene = document.getElementById('tab-switch-scene');
        if (scene) scene.style.opacity = sectionRect.bottom > thresh ? '1' : '0';
      }
      updateBlurLayer();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  if (window.resizeManager) window.resizeManager.subscribe('nav-blur-layer', updateBlurLayer);
  else window.addEventListener('resize', updateBlurLayer, { passive: true });
  onScroll();
  requestAnimationFrame(updateBlurLayer);

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
    experimental: 'Pitches, smaller projects, and explorations.'
  };

  function filterCardsByTab(tabName) {
    // Ghost queries already pre-filter each track correctly:
    //   featured track:     featured:true+tag:hash-work
    //   experimental track: featured:false+tag:hash-work
    // No JS card-level filtering needed — just ensure all cards are visible.
    tabContents.forEach(content => {
      content.querySelectorAll('.post-card').forEach(card => {
        card.style.display = '';
      });
    });
    // console.log(`[tabs] switched to ${tabName}`);
  }

  /**
   * Reveals items already visible in viewport when a tab becomes active.
   * For each item in viewport, we directly update its inline styles to the
   * final animation state (no GSAP set to avoid layout issues), then mark
   * it so ScrollTrigger animations skip re-animating it.
   */
  function revealItemsInViewport(tabContent) {
    if (typeof gsap === 'undefined') return;

    // Get all animated items in the tab
    const cards = tabContent.querySelectorAll('.post-card');
    // Exclude card images (handled by card-animations.js)
    const images = tabContent.querySelectorAll('img:not([data-skip-reveal]):not(.post-card-image img)');

    // Reveal ALL cards in the tab (not just viewport-visible ones)
    // Cards outside viewport will become visible as user scrolls; those in viewport are immediately visible
    cards.forEach(card => {
      if (card.hasAttribute('data-already-revealed')) return;
      // Skip stacked layout — GSAP handles transforms, inline styles break animation
      if (card.closest('[data-posts-layout="stacked"]')) return;

      // Always reveal: set to final visible state
      // Card entrance animations (slide/fade) are handled by card-animations.js
      card.style.opacity = '1';
      card.style.transform = 'translateY(0px) scale(1)';
      card.style.filter = 'blur(0px)';

      // Also reveal card contents (.post-card-content, .post-card-image)
      const cardContent = card.querySelector('.post-card-content');
      if (cardContent) {
        cardContent.style.opacity = '1';
        cardContent.style.transform = 'translateY(0px)';
        cardContent.style.filter = 'blur(0px)';
      }

      const cardImage = card.querySelector('.post-card-image');
      if (cardImage) {
        cardImage.style.opacity = '1';
        cardImage.style.transform = 'scale(1)';
        cardImage.style.filter = 'blur(0px)';
      }

      card.setAttribute('data-already-revealed', 'true');

      // Also clear any images inside the card
      const innerImg = card.querySelector('img');
      if (innerImg && !innerImg.hasAttribute('data-already-revealed')) {
        innerImg.style.opacity = '1';
        innerImg.style.transform = 'scale(1)';
        innerImg.style.filter = 'blur(0px)';
        innerImg.setAttribute('data-already-revealed', 'true');
      }
    });

    // Reveal all standalone images in the tab
    images.forEach(img => {
      if (img.hasAttribute('data-already-revealed')) return;
      if (img.closest('.post-card')) return; // Skip images inside cards (handled above)

      img.style.opacity = '1';
      img.style.transform = 'scale(1)';
      img.style.filter = 'blur(0px)';
      img.setAttribute('data-already-revealed', 'true');
    });

    // Refresh ScrollTrigger to recalculate positions for hidden items
    if (typeof gsap !== 'undefined' && gsap.ScrollTrigger && typeof gsap.ScrollTrigger.refresh === 'function') {
      gsap.ScrollTrigger.refresh();
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      if (!tabName) return;

      // Find current active content
      const currentActive = tabsSection.querySelector('.posts-tabs-content.active');
      const newActive = tabsSection.querySelector(`.posts-tabs-content[data-tab="${tabName}"]`);

      // Skip if already active
      if (currentActive === newActive) return;

      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update description and filter cards BEFORE animation
      if (description) {
        description.textContent = descriptions[tabName] || '';
      }
      tabsSection.setAttribute('data-active-tab', tabName);
      filterCardsByTab(tabName);

      // Tab switch with blur/fade: animate container out, swap, fade in
      const switchContainer = tabsSection.querySelector('.posts-tabs-container');
      const doSwitch = () => {
        tabContents.forEach(content => content.classList.remove('active'));
        newActive.classList.add('active');
        // revealItemsInViewport is called AFTER rAF so getBoundingClientRect
        // has valid values (browser has laid out the new tab content first)
      };

      // Simple tab switch: no fade animation, just swap and reveal
      doSwitch();
      requestAnimationFrame(() => {
        revealItemsInViewport(newActive);

        // Scroll to posts-tabs section BEFORE tab-switch minimizes
        setTimeout(() => {
          const postsSection = tabsSection.closest('.posts-tabs-section') || document.querySelector('.posts-tabs-section');
          console.log('[tab-switch] Looking for posts section:', !!postsSection);
          if (postsSection) {
            console.log('[tab-switch] Scrolling to posts section for tab:', tabName);
            // Scroll with offset to land before tab-switch sticky behavior triggers
            const rect = postsSection.getBoundingClientRect();
            const offsetY = window.scrollY + rect.top - 200; // 200px offset to clear tab-switch
            window.scrollTo({ top: offsetY, behavior: 'smooth' });
            // Update URL with current tab
            const newUrl = window.location.pathname + '#' + tabName;
            window.history.replaceState(null, null, newUrl);
          }
        }, 50);
      });

      // Retrigger heading animations for statement-slides in the new tab
      const statementHeadings = newActive.querySelectorAll('.statement-heading');
      statementHeadings.forEach((heading, index) => {
        // Always retrigger first heading, or any in viewport
        const rect = heading.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
        const isFirstHeading = index === 0;

        if ((isFirstHeading || isInViewport) && typeof window._revealHeadingByLetter === 'function') {
          // Reset animation state so it can be retriggered
          heading.dataset.lettersAnimated = 'false';
          // Manually call the heading reveal animation
          console.log('[tab-switch] Retriggering statement-heading at index:', index);
          window._revealHeadingByLetter(heading, HEADING_ANIM_CONFIG.defaultBlur, () => {});
        }
      });

      // Don't jump scroll when switching tabs — keep scroll position stable

      // Force gradient to first card of new tab
      if (window.gradientManager && window.gradientManager.setFirstCardGradient) {
        window.gradientManager.setFirstCardGradient();
      }

      // Update container height to match active content
      const tabsContainer = tabsSection.querySelector('.posts-tabs-container');
      if (tabsContainer && newActive) {
        const updateHeight = () => {
          const contentHeight = newActive.offsetHeight;
          tabsContainer.style.minHeight = contentHeight + 'px';
        };
        // Update immediately and after carousel init
        updateHeight();
        setTimeout(updateHeight, 200);
      }

      // Reinitialize carousel if needed
      setTimeout(() => {
        if (window.initCarousel) {
          initCarousel();
        }
      }, 150);

      // Re-init stacked cards for newly active tab (was skipped at load if inactive)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const newGrid = newActive.querySelector('[data-posts-layout="stacked"]');
        const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (newGrid) initSingleStackedGrid(newGrid, noMotion);
      }));

      // Re-run letter animation on first card's statement-heading in the new tab
      setTimeout(() => {
        const firstCard = newActive.querySelector('.post-card');
        if (!firstCard) return;
        const heading = firstCard.querySelector('.statement-heading');
        if (!heading) return;
        // Always reset so animation replays on every tab change
        heading.dataset.lettersAnimated = 'false';
        gsap.killTweensOf(heading);
        const chars = heading.querySelectorAll('.char');
        if (chars.length > 0) {
          gsap.killTweensOf(chars);
          gsap.set(chars, { opacity: 0 });
        }
        gsap.set(heading, { opacity: 1, filter: 'none' });
        window._revealHeadingByLetter?.(heading, HEADING_ANIM_CONFIG.defaultBlur, () => {});
      }, 100);

      // Re-initialize card animations for new tab
      if (window.CardAnimations) {
        setTimeout(() => {
          // Kill all existing card animation timelines to prevent conflicts
          gsap.globalTimeline.getChildren().forEach(tl => {
            if (tl.vars && tl.vars.id && tl.vars.id.includes('card')) {
              tl.kill();
            }
          });
          // Create new animations for active tab
          new window.CardAnimations();
          // console.log('[tabs] Re-initialized card animations for tab');

          // Re-initialize particle triggers for new cards
          if (window.reinitializeParticleTriggers) {
            window.reinitializeParticleTriggers();
            // console.log('[tabs] Re-initialized particle triggers for tab');
          }
        }, 200);
      }
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

// initTableOfContents() moved to table-of-contents.js

// ═══════════════════════════════════════════════════════════════
// PAGE TRANSITIONS
// ═══════════════════════════════════════════════════════════════

function initPageTransitions() {
  // Reset scroll to top only on homepage to prevent layout shifts during page load
  // On post pages, let browser restore saved scroll position from history
  const isPostPage = document.body.classList.contains('post');

  if (!isPostPage && window.scrollY !== 0) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Create overlay for page transitions (safe — doesn't affect fixed positioning)
  const overlay = document.createElement('div');
  overlay.className = 'page-transition-overlay';
  document.body.appendChild(overlay);

  let isTransitioning = false;

  // Animate in on page load
  requestAnimationFrame(() => {
    overlay.classList.remove('page-transition-enter');
    overlay.classList.add('page-transition-exit');
  });

  // Handle link clicks for exit animation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const rawHref = link.getAttribute('href');
    if (!rawHref) return;

    // Normalize same-origin absolute URLs so they behave like relative paths
    let href = rawHref;
    if (rawHref.startsWith(window.location.origin)) {
      href = rawHref.slice(window.location.origin.length) || '/';
    }

    const isExternal = rawHref.startsWith('http') && !rawHref.startsWith(window.location.origin);
    const isHashLink = href.startsWith('#');
    const isMailto = rawHref.startsWith('mailto:');
    const opensInNewTab = link.target === '_blank';

    // Skip if it's external, hash link, mailto link, or button-like element
    if (isExternal || isHashLink || isMailto || opensInNewTab) return;

    // Skip if it's within modals or special containers
    if (link.closest('.gh-portal, .search-modal, .subscribe-modal')) return;

    if (isTransitioning) return;
    isTransitioning = true;

    e.preventDefault();

    // Show overlay for exit animation
    overlay.classList.remove('page-transition-exit');
    overlay.classList.add('page-transition-enter');

    const destination = isExternal ? rawHref : href;

    // Navigate after animation
    setTimeout(() => {
      window.location.href = destination;
    }, 200);
  });

  // Reset overlay when page is restored from back/forward cache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      // Page was restored from cache (back button) — restore overlay to visible state
      // Browser handles scroll restoration automatically
      isTransitioning = false;
      overlay.classList.remove('page-transition-enter');
      overlay.classList.add('page-transition-exit');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// POST NAVIGATION FILTERING
// ═══════════════════════════════════════════════════════════════

function initPostNavigation() {
  // Post navigation now uses Ghost's native {{#get}} helper in post-navigation.hbs
  // No JavaScript needed — fully server-side rendered
}

// ═══════════════════════════════════════════════════════════════
// POST NAV CONTROLS — Header navigation arrows (only on post pages)
// ═══════════════════════════════════════════════════════════════

function initPostNavControls() {
  const article = document.querySelector('article.post');
  if (!article) {
    // Not a post page, hide nav controls
    const controls = document.querySelector('.nav-post-controls');
    if (controls) controls.style.display = 'none';
    return;
  }

  const navControls = document.querySelector('.nav-post-controls');
  if (!navControls) return;

  // Show controls on post pages
  navControls.style.display = 'flex';

  const currentId = article.getAttribute('data-post-id');
  const tagsStr = article.getAttribute('data-post-tags');

  if (!currentId || !tagsStr) {
    // console.log('[postNavControls] Missing post data');
    return;
  }

  // Extract first public tag (skip hash-*)
  const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t && !t.startsWith('hash-'));
  const publicTag = tags.length > 0 ? tags[0] : null;

  if (!publicTag) {
    // console.log('[postNavControls] No public tag found');
    return;
  }

  // Fetch posts in same tag to determine prev/next
  fetchPostsByTag(publicTag)
    .then(posts => {
      const currentIndex = posts.findIndex(p => p.id === currentId);

      if (currentIndex < 0) {
        // console.log('[postNavControls] Current post not found');
        return;
      }

      // Get prev and next posts (cycling)
      const prevIndex = currentIndex === 0 ? posts.length - 1 : currentIndex - 1;
      const nextIndex = currentIndex === posts.length - 1 ? 0 : currentIndex + 1;

      const prevPost = posts[prevIndex];
      const nextPost = posts[nextIndex];

      // Set up prev button click handler
      const prevBtn = navControls.querySelector('.nav-post-prev');
      if (prevBtn && prevPost) {
        prevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = prevPost.url;
        });
        prevBtn.href = prevPost.url;
      }

      // Set up next button click handler
      const nextBtn = navControls.querySelector('.nav-post-next');
      if (nextBtn && nextPost) {
        nextBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = nextPost.url;
        });
        nextBtn.href = nextPost.url;
      }

      // console.log('[postNavControls] ✓ Prev/Next posts set:', { prev: prevPost?.url, next: nextPost?.url });
    })
    .catch(err => {
      // console.log('[postNavControls] Error fetching posts:', err.message);
    });
}

// ═══════════════════════════════════════════════════════════════
// PROJECT META — Handle post-injected configuration
// ═══════════════════════════════════════════════════════════════

function initProjectMeta() {
  // Poll for window.projectMeta since it may not be available yet on DOMContentLoaded
  let attempts = 0;
  const maxAttempts = 50; // 2.5 seconds at 50ms intervals

  const checkAndApplyMeta = () => {
    if (window.projectMeta && Object.keys(window.projectMeta).length > 0) {
      // console.log('[projectMeta] ✓ Config loaded:', window.projectMeta);
      applyProjectMeta(window.projectMeta);
      return true;
    }

    attempts++;
    if (attempts >= maxAttempts) {
      // console.log('[projectMeta] ⚠️  No projectMeta found after polling');
      return false;
    }

    setTimeout(checkAndApplyMeta, 50);
    return false;
  };

  checkAndApplyMeta();
}

function applyProjectMeta(meta) {
  if (!meta) return;

  // Apply cardKeywords as pills on post page (in post-meta)
  if (meta.cardKeywords) {
    const postKeywordsEl = document.getElementById('post-keywords');
    if (postKeywordsEl) {
      // Parse comma-separated keywords
      const keywords = meta.cardKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      // Create pills
      postKeywordsEl.innerHTML = keywords.map(keyword =>
        `<span class="post-keyword">${keyword}</span>`
      ).join('');

      // console.log('[projectMeta] ✓ Applied', keywords.length, 'keywords to post page');
    }
  }

  // If link is disabled, prevent post navigation card clicks
  if (meta['disable-link'] === true) {
    // Disable post navigation card
    const navCard = document.querySelector('.post-nav-card');
    const navSection = document.querySelector('.post-navigation');

    if (navCard) {
      navCard.style.pointerEvents = 'none';
      navCard.setAttribute('data-tooltip', 'No case study');
      navCard.classList.add('card-disabled');
      // console.log('[projectMeta] ✓ Disabled .post-nav-card');
    }

    if (navSection) {
      navSection.style.pointerEvents = 'none';
      // console.log('[projectMeta] ✓ Disabled .post-navigation');
    }

    // Also disable any links within post-navigation
    document.querySelectorAll('.post-navigation a').forEach(link => {
      link.style.pointerEvents = 'none';
      link.setAttribute('data-tooltip', 'No case study');
    });

    // console.log('[projectMeta] ✓ Post navigation disabled successfully');
  }

  // Hide logomark container if no logomark provided
  if (!meta.logomark || meta.logomark === '' || meta.logomark.includes('{{')) {
    const logomarkBox = document.getElementById('logomark-container');
    if (logomarkBox) {
      logomarkBox.style.display = 'none';
      // console.log('[projectMeta] Logomark hidden (empty)');
    }
  }

  // Hide project metadata sections if empty
  ['client', 'result', 'longTitle', 'accentColor'].forEach(field => {
    const value = meta[field];
    if (!value || value === '' || (typeof value === 'string' && value.includes('{{')) ) {
      const selector = `[data-project-${field}]`;
      document.querySelectorAll(selector).forEach(el => {
        el.style.display = 'none';
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// HEADING ANIMATION SYSTEM
// Unified scroll-triggered animation for all h1–h4 headings.
//
// Default behaviour by tag level (see HEADING_ANIM_CONFIG.defaults):
//   h1, h2 → letter-by-letter  (slow, character stagger)
//   h3      → word-by-word      (medium, word stagger)
//   h4+     → fade only         (simple opacity reveal)
//
// All modes start blurred (default 8px) and unblur as they reveal.
//
// Per-instance overrides via data attributes:
//   data-animate="letter"  — force letter animation
//   data-animate="word"    — force word animation
//   data-animate="fade"    — force fade-only
//   data-animate="none"    — disable animation entirely
//   data-blur="12"         — custom starting blur in px (overrides default 8)
//
// Exclusions: elements inside .post-header, .page-header, .hero, and
// elements marked with data-skip-animation="true" are left untouched.
// ═══════════════════════════════════════════════════════════════

/**
 * Word-by-word scroll reveal with blur unblur.
 * Animates words in when element enters viewport; resets on exit via observer.
 *
 * @param {Element}  heading   - The heading element
 * @param {Map}      splitMap  - Pre-built word split map (heading → SplitType result)
 * @param {number}   blurPx    - Starting blur in px
 * @param {Function} unobserve - Callback (not used; kept for signature compatibility)
 */
// Heading reveal helpers moved to heading-animations.js

// initHeadingAnimations() moved to heading-animations.js

// ═══════════════════════════════════════════════════════════════
// SCROLL REVEAL — Cards & Images (Extracted to card-scroll-reveal.js)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// LOGOMARK DROP ANIMATION
// ═══════════════════════════════════════════════════════════════

function initLogomarkAnimation() {
  if (typeof gsap === 'undefined') return;

  const logomarkEl = document.getElementById('logomark-container');
  if (!logomarkEl) {
    // console.log('[logomark] No logomark-container element found');
    return;
  }

  // console.log('[logomark] Logomark container found, initializing animation');

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    // console.log('[logomark] Prefers reduced motion — showing immediately');
    logomarkEl.style.visibility = 'visible';
    logomarkEl.style.opacity = '1';
    return;
  }

  // Calculate landing position based on excerpt position
  let landingY = 220; // fallback

  function calculateLandingY() {
    const excerptEl = document.querySelector('.post-excerpt');
    if (excerptEl && logomarkEl.parentElement) {
      const postHeader = logomarkEl.parentElement;
      const excerptRect = excerptEl.getBoundingClientRect();
      const headerRect = postHeader.getBoundingClientRect();

      // Calculate excerpt bottom position relative to header
      const calculated = excerptRect.bottom - headerRect.top + 20; // 20px padding below excerpt
      // console.log(`[logomark] Calculated landing Y: ${calculated}`);
      return calculated;
    }
    return landingY;
  }

  const heroEl = document.querySelector('.hero[data-section-id="hero"]');

  if (!heroEl) {
    // No hero — run the full bounce drop with a short delay so the page has rendered
    // console.log('[logomark] No hero element found — running drop animation directly');
    setTimeout(() => {
      landingY = calculateLandingY();
      animateLogomarkDrop();
    }, 500);
    return;
  }

  // console.log('[logomark] Hero element found — waiting for heroEntranceDone event');

  let eventFired = false;

  // Listen for hero entrance completion
  const handleLogomarkTrigger = () => {
    // console.log('[logomark] heroEntranceDone event fired — starting animation');
    eventFired = true;
    setTimeout(() => {
      landingY = calculateLandingY();
      animateLogomarkDrop();
    }, 500);
    heroEl.removeEventListener('heroEntranceDone', handleLogomarkTrigger);
  };

  heroEl.addEventListener('heroEntranceDone', handleLogomarkTrigger);

  // Fallback: if event doesn't fire after 2s, animate anyway
  setTimeout(() => {
    if (!eventFired) {
      // console.log('[logomark] heroEntranceDone event did not fire — using fallback animation');
      setTimeout(() => {
        landingY = calculateLandingY();
        animateLogomarkDrop();
      }, 500);
    }
  }, 2000);

  function animateLogomarkDrop() {
    // console.log('[logomark] Starting drop animation');
    const tl = gsap.timeline();

    // Set initial state
    tl.set(logomarkEl, {
      y: 0,
      visibility: 'visible',
      opacity: 1
    }, 0);

    // Phase 1: Gravity fall (315ms)
    tl.to(logomarkEl, {
      y: landingY,
      duration: 0.315,
      ease: 'power1.in'
    });

    // Phase 2: First bounce up (112.5ms)
    tl.to(logomarkEl, {
      y: landingY - 24,
      duration: 0.1125,
      ease: 'power2.out'
    });

    // Phase 3: First bounce down (105ms)
    tl.to(logomarkEl, {
      y: landingY,
      duration: 0.105,
      ease: 'power2.out'
    });

    // Phase 4: Second bounce up (82.5ms)
    tl.to(logomarkEl, {
      y: landingY - 9,
      duration: 0.0825,
      ease: 'power2.out'
    });

    // Phase 5: Second bounce down (67.5ms)
    tl.to(logomarkEl, {
      y: landingY,
      duration: 0.0675,
      ease: 'power2.out'
    });

    // Phase 6: Hold at rest (67.5ms)
    tl.to(logomarkEl, {
      y: landingY,
      duration: 0.0675
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGO MORPH — prems.design → prem designs on operating-model entry
// Disabled: conflicts with the logo minimize/expand animation (see
// .logo-dot/.logo-letter-anchor rules in main.css) — this scroll-triggered
// morph sets opacity directly via GSAP inline styles on the same .logo-dot/
// .logo-s-prems/.logo-s-design elements, fighting the CSS-transition-driven
// nav-hidden minimize/expand state.
// ═══════════════════════════════════════════════════════════════

/*
function initLogoMorphToOperatingModel() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    setTimeout(initLogoMorphToOperatingModel, 50);
    return;
  }

  const section = document.getElementById('operating-model');
  const sPrems = document.querySelector('.logo-s-prems');
  const dot = document.querySelector('.logo-dot');
  const sDesign = document.querySelector('.logo-s-design');

  if (!section || !sPrems || !dot || !sDesign) {
    // console.log('[logo-morph] Missing elements, skipping');
    return;
  }

  // Respect reduced motion: show final state and skip scroll animation
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    gsap.set(sPrems, { opacity: 0 });
    gsap.set(dot, { opacity: 0 });
    gsap.set(sDesign, { opacity: 1 });
    return;
  }

  // Initial state: prems.design (design-s hidden)
  gsap.set(sPrems, { opacity: 1 });
  gsap.set(dot, { opacity: 1 });
  gsap.set(sDesign, { opacity: 0 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',      // Start when section pins / first heading enters
      end: 'bottom -160%',    // Reverse only after the entire section is well off-screen
      toggleActions: 'play reverse play reverse',
      markers: false,
    }
  });

  // Phase 1: trailing serif 's' fades out
  tl.to(sPrems,
    { opacity: 0, duration: 0.3, ease: 'power2.inOut' },
    0
  );

  // Phase 2: dot fades out (staggered after phase 1 starts)
  tl.to(dot,
    { opacity: 0, duration: 0.3, ease: 'power2.inOut' },
    0.15
  );

  // Phase 3: sans 's' fades in after design, completing "prem designs"
  tl.to(sDesign,
    { opacity: 1, duration: 0.3, ease: 'power2.inOut' },
    0.3
  );
}
*/

// ═══════════════════════════════════════════════════════════════
// FETCH METADATA FROM POST PAGES (codeinjection_head)
// ═══════════════════════════════════════════════════════════════

// initPostCardMetadata() moved to post-and-cards.js

// ═══════════════════════════════════════════════════════════════
// TESTIMONIAL META — Handle testimonial metadata
// ═══════════════════════════════════════════════════════════════

function initTestimonialMetadata() {
  const testimonialCards = document.querySelectorAll('.testimonial-card');
  if (testimonialCards.length === 0) return;

  // console.log(`[testimonial] Found ${testimonialCards.length} testimonial cards — fetching metadata`);

  // Fetch metadata for each testimonial by visiting its page and extracting window.testimonialMeta
  testimonialCards.forEach(card => {
    const url = card.dataset.testimonialUrl;

    if (!url) {
      // console.log('[testimonial] Card has no URL');
      return;
    }

    // Fetch the testimonial post page HTML
    fetch(url)
      .then(res => res.text())
      .then(html => {
        // Extract window.testimonialMeta from the HTML
        const metaMatch = html.match(/window\.testimonialMeta\s*=\s*(\{[\s\S]*?\});/);
        if (!metaMatch) {
          // console.log(`[testimonial] No testimonialMeta found in ${url}`);
          return;
        }

        try {
          // Parse the testimonialMeta object
          const metaStr = metaMatch[1];
          const meta = eval(`(${metaStr})`);

          // Apply snippet (big text on home page)
          if (meta.snippet) {
            const snippetEl = card.querySelector('.testimonial-snippet');
            if (snippetEl) {
              // Create h2 for snippet (skip animation — testimonials section has data-skip-reveal)
              const h2 = document.createElement('h2');
              h2.className = 'testimonial-snippet-text';
              h2.textContent = meta.snippet;
              snippetEl.innerHTML = ''; // Clear the div
              snippetEl.appendChild(h2);
              // console.log(`[testimonial] ✓ Applied snippet to card`);
              // Re-trigger heading animations for dynamically added h3
              if (typeof initHeadingAnimations === 'function') {
                initHeadingAnimations();
              }
            }
          } else {
            // Fallback to excerpt if no snippet
            const excerptEl = card.querySelector('.testimonial-excerpt');
            const snippetEl = card.querySelector('.testimonial-snippet');
            if (excerptEl && snippetEl) {
              // Create h3 for fallback excerpt (skip animation — testimonials section has data-skip-reveal)
              const h3 = document.createElement('h3');
              h3.className = 'testimonial-snippet-text';
              h3.textContent = excerptEl.textContent;
              snippetEl.innerHTML = ''; // Clear the div
              snippetEl.appendChild(h3);
              // console.log(`[testimonial] ✓ Applied excerpt as fallback snippet`);
              // Re-trigger heading animations for dynamically added h3
              if (typeof initHeadingAnimations === 'function') {
                initHeadingAnimations();
              }
            }
          }

          // Apply source (regular text underneath)
          if (meta.source) {
            const sourceEl = card.querySelector('.testimonial-source');
            if (sourceEl) {
              sourceEl.textContent = meta.source;
              // console.log(`[testimonial] ✓ Applied source to card`);
            }
          }

          // Apply short version
          if (meta.short) {
            const shortEl = card.querySelector('.testimonial-short');
            if (shortEl) {
              shortEl.textContent = meta.short;
              shortEl.style.display = 'block';
              // console.log(`[testimonial] ✓ Applied short to card`);
            }
          }

          // Apply full version
          if (meta.full) {
            const fullEl = card.querySelector('.testimonial-full');
            if (fullEl) {
              fullEl.innerHTML = meta.full;
              fullEl.style.display = 'block';
              // console.log(`[testimonial] ✓ Applied full to card`);
            }
          }
        } catch (e) {
          // console.log(`[testimonial] Error parsing testimonialMeta from ${url}:`, e);
        }
      })
      .catch(err => {
        // console.log(`[testimonial] Error fetching ${url}:`, err);
      });
  });
}

// ═══════════════════════════════════════════════════════════════
// MOUSE-TRACKING TOOLTIP SYSTEM
// ═══════════════════════════════════════════════════════════════

function initTooltipSystem() {
  // Create tooltip container
  const tooltip = document.createElement('div');
  tooltip.className = 'mouse-tracking-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  let currentTooltipText = null;

  function showTooltip(text, x, y) {
    tooltip.textContent = text;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y + 12}px`;
    tooltip.style.display = 'block';
    currentTooltipText = text;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
    currentTooltipText = null;
  }

  function updateTooltipPosition(x, y) {
    if (currentTooltipText) {
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y + 12}px`;
    }
  }

  // Attach handlers to elements with data-tooltip
  document.addEventListener('mouseenter', (e) => {
    if (e.target instanceof Element) {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        const text = target.getAttribute('data-tooltip');
        showTooltip(text, e.clientX, e.clientY);
      }
    }
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (currentTooltipText) {
      updateTooltipPosition(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mouseleave', (e) => {
    if (e.target instanceof Element) {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        hideTooltip();
      }
    }
  }, true);
}

// ═══════════════════════════════════════════════════════════════
// TESTIMONIALS HORIZONTAL SCROLL LOCK
// ═══════════════════════════════════════════════════════════════

function initTestimonialsHorizontalScroll() {
  const grid = document.querySelector('[data-testimonials-scroll="horizontal"]');
  if (!grid) return;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    // console.warn('[testimonials-scroll] GSAP or ScrollTrigger not loaded');
    return;
  }

  const cards = grid.querySelectorAll('.testimonial-card');
  if (cards.length === 0) return;

  // console.log('[testimonials-scroll] Setting up sticky horizontal scroll for', cards.length, 'cards');

  const section = grid.closest('.testimonials-section');

  // Calculate total scrollable distance based on card count
  const cardWidth = window.innerWidth - (2 * 16);
  const gap = 32;
  const totalScrollWidth = (cards.length * (cardWidth + gap)) - window.innerWidth;

  // console.log('[testimonials-scroll] Total scroll:', totalScrollWidth, 'px');

  // Pin section and tie horizontal movement to scroll
  gsap.fromTo(grid,
    { x: 0 },
    {
      x: -totalScrollWidth,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',         // Pin when section reaches top
        end: `+=${totalScrollWidth + window.innerHeight}`,  // Unpin after scroll distance
        scrub: 0,                 // Direct scroll coupling
        pin: true,                // Pin section to viewport
        markers: false,
        onEnter: () => {
          // console.log('[testimonials-scroll] ✅ Sticky scroll active');
        },
        onLeave: () => {
          // console.log('[testimonials-scroll] ✅ Sticky scroll complete');
        }
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PRELOADER GATE — resolves when preloader:done fires (or immediately
// if there is no preloader on the page, e.g. non-home templates).
// ═══════════════════════════════════════════════════════════════
function waitForPreloader() {
  return new Promise(resolve => {
    if (!document.getElementById('preloader')) { resolve(); return; }
    // Skip path adds page-ready synchronously before setTimeout — check first
    // to avoid missing the preloader:done event that already fired
    if (document.documentElement.classList.contains('page-ready')) { resolve(); return; }
    window.addEventListener('preloader:done', resolve, { once: true });
    // Safety: resolve after 12 s no matter what
    setTimeout(resolve, 12000);
  });
}

// INITIALIZE ALL
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // console.log('DOMContentLoaded event fired');
  window.initTooltipSystem?.();
  // initPageTransitions();  // Disabled: page transition overlay fade
  window.initThemeToggle?.();
  window.initNavScrollBehavior?.();
  window.initMobileMenu?.();
  window.initScrollProgress?.();
  window.initCustomScrollbar?.();
  window.initScrollbarHover?.();
  window.initDragToScroll?.();
  initProjectMeta();
  replaceHyphensWithNonBreaking();
  // Deferred to load+idle (2026-07-19): both routines fetch FULL post
  // pages per card (~400KB of HTML measured on the homepage) just to
  // regex out metadata for below-the-fold grids — at DCL they competed
  // with fonts/images/particles on the critical path.
  const deferMetadataFetches = () => (window.requestIdleCallback || ((fn) => setTimeout(fn, 800)))(() => {
    window.initPostCardMetadata?.();
    initTestimonialMetadata();
  });
  if (document.readyState === 'complete') deferMetadataFetches();
  else window.addEventListener('load', deferMetadataFetches, { once: true });
  initTestimonialModal();
  window.initCarousel?.();
  initPostsTabs();
  initTabSwitch();
  // Stacked cards must init AFTER tabs so display:none filtering is done
  // and ScrollTrigger calculates positions against the correct visible layout
  requestAnimationFrame(() => requestAnimationFrame(() => initStackedCards()));
  window.initTableOfContents?.();
  initPostNavigation();
  initPostNavControls();
  // initHeroTitleReveal moved into initHero() for synchronized timeline
  hideEmptyMetadata();

  // ── Wait for preloader to finish, then run all visual entrance animations ──
  console.log('[main] waiting for preloader:done...');
  await waitForPreloader();
  console.log('[main] preloader:done received — running entrance animations');

  // On cached visits (preloader skipped), bypass slow image/h1 wait
  if (!window.__preloaderSkipped) {
    console.log('[main] waiting for hero images + h1 content...');
    await Promise.all([
      waitForHeroImages(),
      waitForH1Content('.hero-headline'),
      waitForH1Content('.post-title, .page-title'),
    ]);
    console.log('[main] hero images + h1 ready');
  }

  // DISABLED: Hero animation now handled by scroll-scrub-anim.js via preloader:done event
  // This prevents double-animation (one at preloader start, one at preloader end)
  // console.log('[main] calling initHero()');
  // initHero();
  initPostHeaderAnimation();
  initHeroBlink();
  initLogomarkAnimation();
  // initLogoMorphToOperatingModel(); // disabled — conflicts with logo minimize/expand animation, see definition above
  initGalleryModals();

  // Letter/word/fade reveals always run (immediately, no scroll trigger)
  window.initHeadingAnimations?.();
  // Card/image scroll reveals (with blur/fade)
  window.initCardScrollReveal?.();
  initTestimonialsHorizontalScroll();
  initStatsScroll();
  // initHeroFadeOut(): disabled — written for .hero as position:fixed (it
  // stayed on screen covering everything below unless manually hidden past
  // a scroll threshold). .hero is normal document flow now (see main.css),
  // so it scrolls away on its own; this function's `display:none` toggle
  // instead collapses the hero's own layout space entirely, yanking every
  // section after it upward once scrolled past ~80% of viewport height.

  // ═══════════════════════════════════════════════════════════════
  // WIRE UP PROJECT META DATA TO CARDS (Code injection → data-cardid)
  // Reads window.projectMetaArray and sets data-cardid on post-cards
  // ═══════════════════════════════════════════════════════════════
  (function wireProjectMetaToCards() {
    function doWire() {
      if (!window.projectMetaArray || window.projectMetaArray.length === 0) {
        console.log('[wire-meta] No projectMetaArray yet, retrying...');
        setTimeout(doWire, 100);
        return;
      }

      const cards = document.querySelectorAll('.post-card');
      console.log('[wire-meta] Wiring', cards.length, 'cards with', window.projectMetaArray.length, 'meta entries');

      cards.forEach((card, index) => {
        const meta = window.projectMetaArray[index];
        if (meta) {
          if (meta.cardId) {
            card.setAttribute('data-cardid', meta.cardId);
          }
          if (meta.gradientCss) {
            card.setAttribute('data-gradient-css', meta.gradientCss);
          }
          console.log('[wire-meta] Card', index, '→', meta.cardId, meta.gradientCss ? '(gradient set)' : '(no gradient)');
        }
      });

      // Signal that card metadata is ready
      window.dispatchEvent(new CustomEvent('cardmeta:ready'));
      console.log('[wire-meta] ✅ cardmeta:ready event dispatched');
    }

    doWire();
  })();

  // ═══════════════════════════════════════════════════════════════
  // PARTICLE MORPHING ON CARD ENTRY
  // Single observer tracks all cards; most-visible card wins.
  // ═══════════════════════════════════════════════════════════════
  (function initCardParticleMorphing() {
    const cardRatios = new Map();
    let currentCard = null;
    let cardObserver = null;
    let lastScrollY = 0;
    let inHelixState = false;

    // Fallback shapes available from GPU system
    const FALLBACK_SHAPES = ['diamond', 'globe', 'game', 'chart', 'email', 'camera', 'clapper', 'note', 'mobile', 'sim'];

    function getShapeForCard(cardId, cardElement) {
      // If cardId matches a loaded shape, use it
      const sys = window.particleSystem;
      if (sys?.stateRegistry?.get(cardId)) {
        return cardId;
      }

      // Fallback: assign shape based on card index
      const allCards = Array.from(document.querySelectorAll('.post-card'));
      const cardIndex = allCards.indexOf(cardElement);
      const shapeIndex = cardIndex % FALLBACK_SHAPES.length;
      return FALLBACK_SHAPES[shapeIndex];
    }

    function pickBestAndMorph() {
      const sys = window.particleSystem;

      // Don't interrupt a morph already in progress — let it complete
      if (sys && sys.morphController && sys.morphController.isMorphing()) {
        return;
      }

      let bestCard = null;
      let maxRatio = 0;
      cardRatios.forEach((ratio, card) => {
        if (ratio > maxRatio) { maxRatio = ratio; bestCard = card; }
      });

      // No card meaningfully visible — forget which one we last morphed to.
      // Without this, re-entering a card from a PREVIOUS pass (e.g. scroll
      // down past globe→diamond, scroll up past hero, scroll down again)
      // sees `bestCard === currentCard` still holding the old value and
      // skips the morph entirely — the first card after a round trip gets
      // silently dropped and only the second one morphs. Only the existing
      // footer-boundary reset below (scrolling up out of helix state) caught
      // this; scrolling past the *top* of the cards into hero did not.
      if (!bestCard || maxRatio <= 0.1) {
        currentCard = null;
        return;
      }
      if (bestCard === currentCard) {
        // Already morphed to this card
        return;
      }
      {
        const cardId = bestCard.dataset.cardid;
        if (cardId) {
          // Try exact match first, then fallback to shape cycling
          let targetShape = cardId;
          const stateLoaded = sys && sys.stateRegistry && sys.stateRegistry.get(cardId);

          if (!stateLoaded) {
            // Shape not found, use fallback mapping
            targetShape = getShapeForCard(cardId, bestCard);
            console.log('[card-morph] Shape "' + cardId + '" not found, using fallback:', targetShape);
          }

          if (sys && sys.stateRegistry && sys.stateRegistry.get(targetShape)) {
            console.log(`%c◇ ${targetShape}`, 'color: #ff69b4; font-weight: bold; font-size: 13px;');
            currentCard = bestCard;
            sys.morphTo(targetShape, 400);
          } else {
            console.log('[card-morph] Shape not available:', targetShape);
          }
        }
      }
    }

    function observeCards(cards) {
      cards.forEach((card) => {
        if (cardRatios.has(card)) return; // skip if already observed
        cardRatios.set(card, 0);
        cardObserver.observe(card);
      });
    }

    function setupCardObservers() {
      if (!window.particleSystem) {
        setTimeout(setupCardObservers, 100);
        return;
      }

      // Both data-cardid attributes (set via async fetch in post-and-cards.js)
      // AND GLB shape states must be ready before we can morph correctly.
      // Track each independently; fire onBothReady() when both arrive.
      let cardMetaDone = false;
      let glbsDone     = window.particleSystemGLBsReady || false;

      function onBothReady() {
        // Both systems ready - card observer will handle morphing when user scrolls into cards
        // Don't force first card morph on page load - let scroll triggers handle it
        pickBestAndMorph();
      }

      window.addEventListener('cardmeta:ready', () => {
        cardMetaDone = true;
        if (glbsDone) onBothReady();
      }, { once: true });

      if (!glbsDone) {
        const waitGLBs = setInterval(() => {
          if (window.particleSystemGLBsReady) {
            clearInterval(waitGLBs);
            glbsDone = true;
            if (cardMetaDone) onBothReady();
          }
        }, 200);
      } else if (cardMetaDone) {
        onBothReady();
      }

      // Track helix state via footer intersection, reset card selection when returning from footer
      const footerEl = document.getElementById('footer') || document.querySelector('.gh-footer');
      if (footerEl) {
        new IntersectionObserver((entries) => {
          inHelixState = entries[0].isIntersecting;
        }, { threshold: 0.05 }).observe(footerEl);
      }

      window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const isScrollingUp = currentScrollY < lastScrollY;
        // When scrolling back up away from footer into cards, clear cached card so card 1 can win
        if (isScrollingUp && inHelixState) {
          currentCard = null;
        }
        lastScrollY = currentScrollY;
      }, { passive: true });

      // rootMargin bottom expanded 30% of viewport height — without it, a
      // card only starts registering intersectionRatio once it's actually
      // inside the viewport, so pickBestAndMorph() (which reacts to
      // whichever .post-card has the highest ratio) only starts favoring
      // the next card once it's already partway visible. Expanding the
      // observed area downward makes a card count toward the ratio race
      // earlier, while it's still partially below the fold.
      const cardObserverOffset = Math.round(window.innerHeight * 0.7);
      cardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => cardRatios.set(entry.target, entry.intersectionRatio));
        pickBestAndMorph();
      }, {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        rootMargin: `0px 0px ${cardObserverOffset}px 0px`,
      });

      observeCards(document.querySelectorAll('.post-card'));

      // Re-observe when tab switches (cards were hidden/removed)
      document.querySelectorAll('.posts-tabs-content').forEach(panel => {
        new MutationObserver(() => {
          if (panel.classList.contains('active')) {
            currentCard = null; // reset so first visible card in new tab morphs
            setTimeout(() => observeCards(panel.querySelectorAll('.post-card')), 150);
          }
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
      });
    }

    setupCardObservers();

    // ─── Gesture system disabled ───
    // if (typeof bootstrapGestureSystem !== 'undefined') { ... }
  })();

});
