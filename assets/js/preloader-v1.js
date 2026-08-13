/**
 * PRELOADER v1 BACKUP — original "Hello I'm Prem" sequence
 * Backed up before v2 rewrite (prem.design sequence)
 *
 * Sequence:
 * 1. "Hello, I'm Prem" word reveal, stay 2s, reverse out
 * 2. "Welcome to" word reveal, stay 2s, reverse out
 * 3. "prems" and "design" fall from top with physics acceleration
 * 4. Dot falls and bounces between words
 * 5. Logo scales down and moves to top-left corner
 */

(function() {
  'use strict';

  console.log('[preloader] Script loaded');

  // SAFETY: Force preloader visible immediately
  const style = document.createElement('style');
  style.textContent = `
    .preloader {
      opacity: 1 !important;
      visibility: visible !important;
      display: flex !important;
    }
    .preloader-greeting,
    .preloader-welcome,
    .preloader-heading {
      opacity: inherit;
      visibility: visible !important;
    }
  `;
  document.head.appendChild(style);

  const CONFIG = {
    // Word reveal timing
    wordRevealDuration: 0.5,
    wordStayDuration: 2.0,

    // Falling phase
    wordFallDuration: 1.2,
    dotFallDuration: 1.2,
    dotBounceDuration: 0.4,

    // Final positioning
    logoScaleDuration: 0.6,
    logoMoveDuration: 0.6,
  };

  class Preloader {
    constructor() {
      console.log('[preloader] Initializing...');
      this.preloader = document.getElementById('preloader');
      this.greetingRow = document.querySelector('.preloader-greeting-row');

      if (!this.preloader || !this.greetingRow) {
        console.error('[preloader] Missing elements');
        return;
      }

      // Hide until animation starts
      this.greetingRow.style.display = 'none';

      this.isLoaded = false;
      this.mainTimeline = gsap.timeline();

      this.init();
      console.log('[preloader] Animation starting');
    }

    init() {
      this.animateSequence();

      // Monitor page load
      if (document.readyState === 'complete') {
        this.completeLoading();
      } else {
        window.addEventListener('load', () => this.completeLoading());
      }
    }

    animateSequence() {
      const tl = this.mainTimeline;

      if (!this.greetingRow) return;

      const helloLetters  = this.greetingRow.querySelectorAll('.preloader-hello-letter');
      const spacerMid     = this.greetingRow.querySelector('.preloader-spacer-mid');
      const premLetters   = this.greetingRow.querySelectorAll('.preloader-prem-letter');
      const sLetter       = this.greetingRow.querySelector('.preloader-s-letter');
      const dot           = this.greetingRow.querySelector('.preloader-dot');
      const designLetters = this.greetingRow.querySelectorAll('.preloader-design-letter');

      tl.add(() => { this.greetingRow.style.display = 'block'; });

      const allReveal = [...helloLetters, ...premLetters];
      allReveal.forEach((letter, i) => {
        tl.fromTo(
          letter,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' },
          i === 0 ? '>' : '<+=0.06'
        );
      });

      tl.to({}, { duration: 0.45 });

      tl.to(
        [...helloLetters, spacerMid],
        { opacity: 0, x: -24, duration: 0.3, ease: 'power3.in', stagger: 0.035 },
        '>'
      );

      tl.to(
        premLetters,
        {
          x: () => {
            let w = 0;
            helloLetters.forEach(l => { w += l.offsetWidth; });
            if (spacerMid) w += spacerMid.offsetWidth;
            return -(w / 2);
          },
          duration: 0.38,
          ease: 'power2.inOut',
        },
        '<'
      );

      tl.add(() => {
        helloLetters.forEach(l => gsap.set(l, { display: 'none' }));
        if (spacerMid) gsap.set(spacerMid, { display: 'none' });
        gsap.set(premLetters, { x: 0 });
      }, '>');

      tl.to({}, { duration: 0.2 });

      premLetters.forEach((letter, i) => {
        tl.to(letter, {
          rotateX: 720,
          duration: 0.52,
          ease: 'power2.inOut',
          onComplete: () => {
            if (letter.dataset.land) letter.textContent = letter.dataset.land;
            gsap.set(letter, { rotateX: 0 });
          },
        }, i === 0 ? '>' : '<+=0.14');
      });

      if (sLetter) {
        tl.fromTo(
          sLetter,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' },
          '>'
        );
      }

      designLetters.forEach((letter, i) => {
        tl.fromTo(
          letter,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' },
          i === 0 ? '<+=0.1' : '<+=0.06'
        );
      });

      if (dot) {
        tl.to({}, { duration: 0.2 });
        tl.fromTo(
          dot,
          { opacity: 1, y: -window.innerHeight * 0.6 },
          { y: 0, duration: CONFIG.dotFallDuration, ease: 'power3.in' },
          '>'
        );
        tl.to(dot, { y: -16, duration: CONFIG.dotBounceDuration * 0.4, ease: 'power2.out' }, '>');
        tl.to(dot, { y: 0, duration: CONFIG.dotBounceDuration * 0.6, ease: 'bounce.out' }, '>-=0.08');
      }

      tl.to({}, { duration: 0.9 });

      tl.to(
        this.greetingRow,
        { fontSize: 'clamp(1.2rem, 3vw, 2rem)', duration: CONFIG.logoScaleDuration, ease: 'power2.inOut' },
        '>'
      );
      tl.to(
        this.greetingRow,
        { position: 'fixed', top: 'var(--nav-height)', left: 'var(--content-padding)', duration: CONFIG.logoMoveDuration, ease: 'power2.inOut' },
        '<'
      );
      tl.to(this.preloader, { opacity: 0, duration: 0.5, ease: 'power2.inOut' }, '>');
      tl.add(() => {
        this.preloader.classList.add('loaded');
        this.preloader.style.display = 'none';
      }, '>');
    }

    completeLoading() {
      if (!this.isLoaded) {
        this.isLoaded = true;
        console.log('[preloader] Page loaded');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Preloader());
  } else {
    new Preloader();
  }
})();
