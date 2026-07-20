/**
 * CARD ANIMATIONS - Simple entrance animations
 * Uses IntersectionObserver to trigger when card enters viewport
 * No ScrollTrigger dependency
 */

(function() {
  'use strict';

  const VARIANTS = {
    default: {
      enabled: true,
      type: 'slide',
      contentDuration: 0.8,
      imageDuration: 0.8,
      staggerDelay: 0.2,
      easing: 'power3.out',
      // Used as `y: slideDistance + '%'` below (content) and
      // `x: slideDistance + '%'` (image, still slides in from the side in
      // this variant) — was missing here, so it evaluated to the string
      // "undefined%", which GSAP silently fails to parse into any motion
      // at all (confirmed: transform stays at identity). 100 matches
      // 'slide-left's own slideDistance below.
      slideDistance: 100,
    },
    'slide-left': {
      // Was 'scale-focus': image zoomed in→out (scale) while content slid
      // in from the right at the same time (staggerDelay was 0, so no
      // actual stagger). Both now slide in from the right ("slide left"
      // into place); staggerDelay raised from 0 so the image visibly
      // leads and the description follows, not simultaneous.
      enabled: true,
      type: 'slide-left',
      contentDuration: 0.8,
      imageDuration: 1.2,
      staggerDelay: 0.15,
      easing: 'power3.out',
      slideDistance: 100,
    },
  };

  const getVariant = () => {
    // .post-card-content/.post-card-image now opt directly into
    // card-scroll-reveal.js's shared `default` variant (via data-card-reveal
    // in post-card.hbs) for every posts layout — grid/carousel/list all use
    // the one systemized reveal (the same code path .testimonial-card,
    // .profile-paragraph, .om3-card use), not this parallel
    // reimplementation. Disabled unconditionally to avoid double-animating
    // the same elements; kept in place (rather than deleted) in case a
    // future layout genuinely needs a distinct entrance motion.
    const section = document.querySelector('.posts-tabs-section');
    if (section) return { enabled: false };
    return VARIANTS.default;
  };

  const CONFIG = getVariant();
  const MOBILE_BREAKPOINT = 768;

  class CardAnimations {
    constructor() {
      console.log('[card-anim] CardAnimations constructor');
      this.section = document.querySelector('.posts-tabs-section');
      if (!this.section || !CONFIG.enabled) {
        console.log('[card-anim] Section not found or disabled');
        return;
      }

      this.init();
    }

    init() {
      console.log('[card-anim] init() - width:', window.innerWidth);

      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        console.log('[card-anim] Mobile - skipping card animations');
        return;
      }

      // Direction tracking (same pattern as card-scroll-reveal.js) — the
      // exit/reverse animation below only plays while actually scrolling
      // up, not on every !isIntersecting (which also fires when a card
      // scrolls past on the way down into the next one).
      this.isScrollingDown = true;
      this.lastScrollY = window.scrollY;
      window.addEventListener('scroll', () => {
        this.isScrollingDown = window.scrollY > this.lastScrollY;
        this.lastScrollY = window.scrollY;
      }, { passive: true });

      const activeTab = this.section.querySelector('.posts-tabs-content.active');
      const cards = activeTab
        ? Array.from(activeTab.querySelectorAll('.post-card'))
        : Array.from(this.section.querySelectorAll('.post-card'));

      console.log('[card-anim] Setting up observers for', cards.length, 'cards');

      cards.forEach((card, index) => {
        this.setupCardObserver(card, index);
      });
    }

    setupCardObserver(card, index) {
      let hasAnimated = false;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const cardId = card.dataset.cardid;
          if (entry.isIntersecting && !hasAnimated) {
            hasAnimated = true;
            console.log('[card-anim] ENTER card', index, '(' + cardId + ') at', Math.round(window.scrollY), '- playing animation');
            this.playCardAnimation(card, index);
          } else if (!entry.isIntersecting) {
            if (hasAnimated && !this.isScrollingDown) {
              console.log('[card-anim] EXIT (reverse) card', index, '(' + cardId + ') at', Math.round(window.scrollY));
              this.playCardExitAnimation(card, index);
            }
            hasAnimated = false;
          }
        });
      }, { threshold: 0.3 });

      observer.observe(card);
    }

    // Mirrors playCardAnimation, undoing each type's own entrance motion —
    // content/image animate back to their pre-entrance state ('default'/
    // 'slide-left' never fade opacity on entrance either, only
    // position/scale, so neither does this).
    playCardExitAnimation(card, index = 0) {
      const content = card.querySelector('.post-card-content');
      const image = card.querySelector('.post-card-image');
      if (!content || !image) return;

      if (CONFIG.type === 'slide-left') {
        gsap.to(image,   { x: CONFIG.slideDistance + '%', duration: CONFIG.imageDuration, ease: 'power2.in' });
        gsap.to(content, { x: CONFIG.slideDistance + '%', duration: CONFIG.contentDuration, ease: 'power2.in' });
      } else {
        gsap.to(content, { y: CONFIG.slideDistance + '%', duration: CONFIG.contentDuration, ease: 'power2.in' });
        gsap.to(image,   { y: CONFIG.slideDistance + '%', duration: CONFIG.imageDuration, ease: 'power2.in' });
      }
    }

    playCardAnimation(card, index = 0) {
      const content = card.querySelector('.post-card-content');
      const image = card.querySelector('.post-card-image');

      if (!content || !image) return;

      const tl = gsap.timeline();

      if (CONFIG.type === 'slide-left') {
        // Image: slide in from right, starts first (time 0)
        tl.fromTo(
          image,
          { x: CONFIG.slideDistance + '%', opacity: 1 },
          { x: 0, opacity: 1, duration: CONFIG.imageDuration, ease: CONFIG.easing },
          0
        )
        // Content: slide in from right too, staggered to arrive after the image
        .fromTo(
          content,
          { x: CONFIG.slideDistance + '%', opacity: 1 },
          { x: 0, opacity: 1, duration: CONFIG.contentDuration, ease: CONFIG.easing },
          CONFIG.staggerDelay
        );
      } else {
        // Default: content and image both slide up from below (matches the
        // shared slide-up motion used elsewhere — .testimonial-card,
        // .profile-paragraph, and list-mode's own card-scroll-reveal.js
        // path, none of which have any x-offset). Image previously slid in
        // from the right here (x-offset) — leftover slide-left motion even
        // though this branch is meant to be the non-slide-left default.
        tl.fromTo(
          content,
          { x: 0, y: CONFIG.slideDistance + '%', opacity: 1 },
          { x: 0, y: 0, opacity: 1, duration: CONFIG.contentDuration, ease: CONFIG.easing },
          0
        )
        .fromTo(
          image,
          { y: CONFIG.slideDistance + '%', opacity: 1 },
          { y: 0, opacity: 1, duration: CONFIG.imageDuration, ease: CONFIG.easing },
          CONFIG.staggerDelay
        );
      }
    }
  }

  // Expose globally
  window.CardAnimations = CardAnimations;

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new CardAnimations();
    });
  } else {
    new CardAnimations();
  }

})();
