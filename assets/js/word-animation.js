/**
 * WORD ANIMATION
 * Scroll-triggered word drop animation with GSAP
 * Words drop and blur as user scrolls, final period bounces into place
 */

(function() {
  'use strict';

  // Wait for GSAP to be available
  if (typeof gsap === 'undefined') {
    console.warn('[word-animation] GSAP not loaded');
    return;
  }

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // Only run on pages with word animation section
  const container = document.getElementById('word-animation');
  if (!container) {
    console.log('[word-animation] Container not found');
    return;
  }

  // Check if mobile
  const isMobile = window.innerWidth < 768;

  // Get elements
  const stickyEl = container.querySelector('.word-animation-sticky');
  const textContainer = container.querySelector('.word-animation-text');
  const periodEl = container.querySelector('.word-animation-period');
  const wordEls = container.querySelectorAll('.word-animation-word');

  if (!stickyEl || !textContainer || wordEls.length === 0) {
    console.warn('[word-animation] Missing elements', { stickyEl, textContainer, wordEls: wordEls.length });
    return;
  }

  console.log('[word-animation] Initialized', { words: wordEls.length, isMobile });

  // Set initial state - words are visible
  gsap.set(wordEls, { opacity: 1, y: 0, filter: 'blur(0px)' });

  // Initialize period opacity (hidden until animation)
  if (periodEl) {
    periodEl.style.opacity = '0';
  }

  // Calculate heights
  const viewHeight = window.innerHeight;
  const sectionHeight = viewHeight * 3.4;
  const totalHeight = viewHeight + sectionHeight;
  const marginBottom = viewHeight * 1;

  container.style.height = totalHeight + 'px';
  container.style.marginBottom = marginBottom + 'px';

  // Register ScrollTrigger plugin
  if (typeof ScrollTrigger === 'undefined') {
    console.warn('[word-animation] ScrollTrigger not loaded');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  console.log('[word-animation] ScrollTrigger registered');

  // Create timeline (paused, will be controlled by scroll)
  const tl = gsap.timeline({ paused: true, timeScale: 0.25 });

  // Early sequence: "like" (1)
  if (wordEls[1]) {
    tl.to(wordEls[1], {
      opacity: 0,
      y: 180,
      rotationZ: gsap.utils.random(-30, 30),
      filter: 'blur(40px)',
      width: 0,
      marginRight: 0,
      marginLeft: 0,
      padding: 0,
      duration: 0.8,
      ease: 'power2.out',
    }, 0.2);
  }

  // Middle sequence: "ing" (3) - must drop before period arrives
  if (wordEls[3]) {
    tl.to(wordEls[3], {
      opacity: 0,
      y: 180,
      rotationZ: gsap.utils.random(-30, 30),
      filter: 'blur(40px)',
      width: 0,
      marginRight: 0,
      marginLeft: 0,
      padding: 0,
      duration: 0.8,
      ease: 'power2.out',
    }, 1.0);
  }

  // Late sequence: "and" (6), "often" (7), "remove" (8), "more" (9), "things" (10), "than" (11), "add." (12)
  [6, 7, 8, 9, 10, 11, 12].forEach((idx, i) => {
    if (wordEls[idx]) {
      tl.to(wordEls[idx], {
        opacity: 0,
        y: 180,
        rotationZ: gsap.utils.random(-30, 30),
        filter: 'blur(40px)',
        width: 0,
        marginRight: 0,
        marginLeft: 0,
        padding: 0,
        duration: 0.8,
        ease: 'power2.out',
      }, 1.5 + i * 0.35);
    }
  });

  // Period animation - starts after all words are gone
  if (periodEl) {
    // Adjust position on mobile: 16px down, 12px left
    const periodY = isMobile ? -10 : -23;
    const periodX = isMobile ? -16 : -10;

    // Show period at animation start with proper spacing
    tl.set(periodEl, { display: 'inline-block', marginRight: '0.25em' }, 3.4);

    // Drop from above with opacity fade in
    tl.fromTo(
      periodEl,
      { y: -250, x: periodX, opacity: 0 },
      { y: periodY, x: periodX, opacity: 1, duration: 0.25, ease: 'power2.in' },
      3.5
    );

    // Bounce 1 - strong
    tl.to(periodEl, { y: isMobile ? -120 : -183, x: periodX, duration: 0.15, ease: 'back.out(3)' }, 3.75);
    tl.to(periodEl, { y: periodY, x: periodX, duration: 0.15, ease: 'power2.in' }, 3.9);

    // Bounce 2 - medium
    tl.to(periodEl, { y: isMobile ? -60 : -83, x: periodX, duration: 0.15, ease: 'back.out(2.5)' }, 4.05);
    tl.to(periodEl, { y: periodY, x: periodX, duration: 0.15, ease: 'power2.in' }, 4.2);

    // Hold final position
    tl.to(periodEl, { duration: 0.5 }, 4.2);
  }

  // Create ScrollTrigger with delay before animation starts
  ScrollTrigger.create({
    trigger: container,
    start: 'top top',
    end: `+=${totalHeight}`,
    pin: stickyEl,
    scrub: 1,
    onUpdate: (self) => {
      // Add scroll delay but scale progress so animation completes by end
      const delayAmount = 0.2;
      const delayedProgress = Math.max(0, (self.progress - delayAmount) / (1 - delayAmount));
      tl.progress(delayedProgress);
    },
  });

  // Refresh measurements after fonts/images load
  setTimeout(() => {
    ScrollTrigger.refresh();
  }, 500);
})();
