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

  // Get elements
  const stickyEl = container.querySelector('.word-animation-sticky');
  const textContainer = container.querySelector('.word-animation-text');
  const periodEl = container.querySelector('.word-animation-period');
  const wordEls = container.querySelectorAll('.word-animation-word');

  if (!stickyEl || !textContainer || wordEls.length === 0) {
    console.warn('[word-animation] Missing elements', { stickyEl, textContainer, wordEls: wordEls.length });
    return;
  }

  console.log('[word-animation] Initialized', { words: wordEls.length });

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

  // Word indices to animate out: "like" (1), "ing" (3), "often" (7)
  [1, 3, 7].forEach((idx, i) => {
    if (wordEls[idx]) {
      tl.to(
        wordEls[idx],
        {
          opacity: 0,
          y: 180,
          rotationZ: gsap.utils.random(-30, 30),
          filter: 'blur(40px)',
          marginRight: -50,
          duration: 0.8,
          ease: 'power2.out',
        },
        0.2 + i * 0.35
      );
    }
  });

  // "things" (index 10) animation
  if (wordEls[10]) {
    tl.to(
      wordEls[10],
      {
        opacity: 0,
        y: 180,
        rotationZ: gsap.utils.random(-30, 30),
        filter: 'blur(40px)',
        marginRight: -50,
        duration: 0.8,
        ease: 'power2.out',
      },
      1.3
    );
  }

  // "and", "remove", "more", "than", "add." animations
  [6, 8, 9, 11, 12].forEach((idx, i) => {
    if (wordEls[idx]) {
      tl.to(
        wordEls[idx],
        {
          opacity: 0,
          y: 180,
          rotationZ: gsap.utils.random(-30, 30),
          filter: 'blur(40px)',
          marginRight: -50,
          duration: 0.8,
          ease: 'power2.out',
        },
        1.5 + i * 0.35
      );
    }
  });

  // Period animation - starts after all words are gone
  if (periodEl) {
    // Drop from above with opacity fade in
    tl.fromTo(
      periodEl,
      { y: -250, x: -10, opacity: 0 },
      { y: -23, x: -10, opacity: 1, duration: 0.25, ease: 'power2.in' },
      3.5
    );

    // Bounce 1 - strong
    tl.to(periodEl, { y: -183, x: -10, duration: 0.15, ease: 'back.out(3)' }, 3.75);
    tl.to(periodEl, { y: -23, x: -10, duration: 0.15, ease: 'power2.in' }, 3.9);

    // Bounce 2 - medium
    tl.to(periodEl, { y: -83, x: -10, duration: 0.15, ease: 'back.out(2.5)' }, 4.05);
    tl.to(periodEl, { y: -23, x: -10, duration: 0.15, ease: 'power2.in' }, 4.2);

    // Hold final position
    tl.to(periodEl, { duration: 0.5 }, 4.2);
  }

  // Create ScrollTrigger
  ScrollTrigger.create({
    trigger: container,
    start: 'top top',
    end: `+=${totalHeight}`,
    pin: stickyEl,
    scrub: 1,
    onUpdate: (self) => {
      tl.progress(self.progress);
    },
  });

  // Refresh measurements after fonts/images load
  setTimeout(() => {
    ScrollTrigger.refresh();
  }, 500);
})();
