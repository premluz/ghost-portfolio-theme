/**
 * INTRO ANIMATION
 * Sequential multi-phase sequence (same as preloader):
 * 1. "Hello, I'm Prem" word reveal, stay 2s, reverse out
 * 2. "Welcome to" word reveal, stay 2s, reverse out
 * 3. Hero headline falls from top with physics acceleration
 * 4. Logo moves to final position
 */

(function() {
  'use strict';

  console.log('[intro] Script loaded');

  const CONFIG = {
    // Word reveal timing
    wordRevealDuration: 0.5,
    wordStayDuration: 2.0,

    // Falling phase
    wordFallDuration: 1.2,

    // Final positioning
    logoScaleDuration: 0.6,
    logoMoveDuration: 0.6,
  };

  class IntroAnimation {
    constructor() {
      console.log('[intro] Initializing...');
      this.intro = document.getElementById('intro');
      this.greeting = document.querySelector('.intro-greeting');
      this.welcome = document.querySelector('.intro-welcome');
      this.headline = document.querySelector('.intro-headline');

      if (!this.intro || !this.headline) {
        console.error('[intro] Missing elements');
        return;
      }

      // Hide welcome and headline initially
      if (this.welcome) this.welcome.style.display = 'none';
      if (this.headline) this.headline.style.display = 'none';

      this.isLoaded = false;
      this.mainTimeline = gsap.timeline();

      this.init();
      console.log('[intro] Animation starting');
    }

    init() {
      this.animateSequence();
    }

    animateSequence() {
      const tl = this.mainTimeline;

      // ─────────────────────────────────────────────────────
      // PHASE 1: "Hello, I'm Prem" word reveal sequence
      // ─────────────────────────────────────────────────────
      if (this.greeting) {
        // Show greeting
        tl.add(() => {
          console.log('[intro] Phase 1: Showing greeting');
          this.greeting.style.display = 'inline-flex';
        }, 0);

        const greetingSpans = this.greeting.querySelectorAll('span');

        // Reveal words (staggered)
        greetingSpans.forEach((span, i) => {
          tl.fromTo(
            span,
            { opacity: 0 },
            {
              opacity: 1,
              duration: CONFIG.wordRevealDuration,
              ease: 'power2.out',
            },
            i * 0.08
          );
        });

        // Stay visible for 2 seconds
        tl.to({}, { duration: CONFIG.wordStayDuration });

        // Reverse animation (fade out)
        greetingSpans.forEach((span, i) => {
          tl.to(
            span,
            {
              opacity: 0,
              duration: CONFIG.wordRevealDuration,
              ease: 'power2.in',
            },
            i * 0.08
          );
        });

        // Hide greeting
        tl.add(() => {
          this.greeting.style.display = 'none';
        });
      }

      // Transition gap
      tl.to({}, { duration: 0.2 });

      // ─────────────────────────────────────────────────────
      // PHASE 2: "Welcome to" word reveal sequence
      // ─────────────────────────────────────────────────────
      if (this.welcome) {
        // Show welcome
        tl.add(() => {
          console.log('[intro] Phase 2: Showing welcome');
          this.welcome.style.display = 'inline-flex';
        });

        const welcomeSpans = this.welcome.querySelectorAll('span');

        // Reveal words (staggered)
        welcomeSpans.forEach((span, i) => {
          tl.fromTo(
            span,
            { opacity: 0 },
            {
              opacity: 1,
              duration: CONFIG.wordRevealDuration,
              ease: 'power2.out',
            },
            i * 0.08
          );
        });

        // Stay visible for 2 seconds
        tl.to({}, { duration: CONFIG.wordStayDuration });

        // Reverse animation (fade out)
        welcomeSpans.forEach((span, i) => {
          tl.to(
            span,
            {
              opacity: 0,
              duration: CONFIG.wordRevealDuration,
              ease: 'power2.in',
            },
            i * 0.08
          );
        });

        // Hide welcome
        tl.add(() => {
          this.welcome.style.display = 'none';
        });
      }

      // Transition gap
      tl.to({}, { duration: 0.2 });

      // ─────────────────────────────────────────────────────
      // PHASE 3: Headline falls from top
      // ─────────────────────────────────────────────────────
      if (this.headline) {
        // Show headline
        tl.add(() => {
          console.log('[intro] Phase 3: Showing headline and falling');
          this.headline.style.display = 'block';
        });

        // Headline falls from off-screen top
        tl.fromTo(
          this.headline,
          {
            opacity: 0,
            y: -window.innerHeight,
          },
          {
            y: 0,
            opacity: 1,
            duration: CONFIG.wordFallDuration,
            ease: 'power1.in',
          }
          // No position — add to end of timeline
        );
      }

      // Mark as complete
      tl.add(() => {
        this.intro.classList.add('loaded');
        console.log('[intro] ✓ Animation sequence complete');
      });
    }
  }

  // Initialize intro animation
  console.log('[intro] Ready to initialize, document.readyState:', document.readyState);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[intro] DOMContentLoaded, creating instance');
      new IntroAnimation();
    });
  } else {
    console.log('[intro] Document already loaded, creating instance immediately');
    new IntroAnimation();
  }
})();
