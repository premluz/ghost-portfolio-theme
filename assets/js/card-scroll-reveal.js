(function() { 'use strict';

const SCROLL_REVEAL_CONFIG = {
  image: {
    enabled: true,
    duration: 0.64,
    ease: 'power2.out',
    scale: { start: 0.97, end: 1 },
    blur: { start: 0, end: 0 },
    fade: true,
  },
  card: {
    default: {
      enabled: true,
      duration: 0.48,
      ease: 'power2.out',
      scale: { start: 0.97, end: 1 },
      // 16 -> 48: shared by every consumer with no explicit data-card-reveal
      // override — .testimonial-card, .about-card, .personal-card,
      // .om3-card, .om3-header-slot, .profile-paragraph all move further
      // now, not just the operating-model headers this was raised for.
      yOffset: 48,
      blur: { start: 0, end: 0 },
      fade: true,
      staggerDelay: 0.1,
    },
    'scale-focus': {
      enabled: true,
      duration: 0.6,
      ease: 'power2.out',
      scale: { start: 1.3, end: 1 },
      yOffset: 0,
      blur: { start: 0, end: 0 },
      blurDuration: 0.1,
      fade: true,
      fadeDuration: 0.1,
      staggerDelay: 0.1,
    },
    // Rapid, decisive slide-in from a short distance (not full off-screen) —
    // same "arrive from the right, move left" motion as the list-layout
    // case below, but invokable directly via data-card-reveal without
    // needing a [data-posts-layout="list"] ancestor.
    'slide-left': {
      enabled: true,
      duration: 0.4,
      ease: 'power3.out',
      xOffset: 220, // was 120 — +100px per request
      blur: { start: 0, end: 0 },
      fade: true,
      staggerDelay: 0.08,
    },
  },
  container: {
    enabled: true,
    duration: 0.4,
    ease: 'power2.out',
    yOffset: 20,
    fade: true,
  },
  scrollTrigger: {
    blurEnabled: false,
  }
};

function initCardScrollReveal() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const images = document.querySelectorAll('img');
  const revealImages = Array.from(images).filter(img => {
    if (img.hasAttribute('data-skip-reveal')) return false;
    if (img.closest('.hero')) return false;
    // Post/page hero images are owned by initPostHeaderAnimation (main.js) —
    // they sit above the fold where this observer's isScrollingDown +
    // bottom-half conditions can never fire, so claiming them leaves them
    // stuck at opacity 0.
    if (img.closest('.post-header')) return false;
    if (img.closest('.page-header')) return false;
    if (img.closest('.post-navigation')) return false;
    if (img.closest('.logos-scroll-container')) return false;
    if (img.closest('.logos-ribbon-item')) return false;
    // First image in the post body belongs to the post entrance animation
    // (initPostHeaderAnimation) — it can sit above the fold where this
    // observer's scroll-down + bottom-half reveal can never fire. (The old
    // check looked for '.post-image img' inside '.post-content', which
    // matches nothing: wrong container class and the hero lives in the header.)
    const postContent = img.closest('.gh-content');
    if (postContent && img === postContent.querySelector('img')) return false;
    if (img.closest('.gh-navigation')) return false;
    if (img.closest('nav')) return false;
    if (img.closest('[data-posts-layout="stacked"]')) return false;
    if (img.closest('[data-posts-layout="list"]')) return false;
    if (img.closest('.profile')) return false;
    return true;
  });

  let lastScrollY = window.scrollY;
  let isScrollingDown = true;

  const scrollListener = () => {
    const currentScrollY = window.scrollY;
    isScrollingDown = currentScrollY > lastScrollY;
    lastScrollY = currentScrollY;
  };

  window.addEventListener('scroll', scrollListener, { passive: true });

  const revealedImages = new WeakSet();

  const imgCfg = SCROLL_REVEAL_CONFIG.image;
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const img = entry.target;

      const rect = img.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const isInBottomHalf = elementCenter > window.innerHeight / 2;
      const isRevealed = revealedImages.has(img);

      if (entry.isIntersecting) {
        if (isScrollingDown && isInBottomHalf && !isRevealed) {
          gsap.to(img, {
            opacity: 1,
            scale: imgCfg.scale.end,
            filter: `blur(${imgCfg.blur.end}px)`,
            duration: imgCfg.duration,
            ease: imgCfg.ease,
          });
          revealedImages.add(img);
        }
      } else {
        if (!isScrollingDown && isRevealed) {
          gsap.to(img, {
            opacity: 0,
            scale: imgCfg.scale.start,
            filter: `blur(${imgCfg.blur.start}px)`,
            duration: imgCfg.duration,
            ease: 'power2.in',
          });
          revealedImages.delete(img);
        }
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -120px 0px',
  });

  revealImages.forEach(img => {
    gsap.set(img, {
      opacity: 0,
      scale: imgCfg.scale.start,
      filter: `blur(${imgCfg.blur.start}px)`,
    });
    imageObserver.observe(img);
  });

  // .om3-header-slot deliberately excluded: it lives inside .om-headers-
  // sticky (position:sticky), so once that container sticks, all three
  // headers' own bounding boxes stop moving relative to the viewport —
  // they're clustered together in one small, fixed region rather than
  // spread across the page the way .om3-card is in its scrolling column.
  // A per-element "reveal when THIS element's own geometry crosses a
  // threshold" system has no meaningful separation to key off there, so
  // all three ended up revealing at nearly the same scroll moment. Header
  // timing instead lives in operating-model.hbs, keyed off when each
  // .om3-card-group (which DOES have real scroll separation) enters view.
  const cards = document.querySelectorAll(
    '.testimonial-card, .about-card, .personal-card, .profile-paragraph, .profile-item, .om3-card, .post-card-content, .post-card-image'
  );

  const animatedCards = Array.from(cards).filter(card => {
    if (card.closest('.post-navigation')) return false;
    if (card.closest('.posts-tabs-content-experimental')) return false;
    if (card.closest('[data-posts-layout="stacked"]')) return false;
    const testimonialGrid = card.closest('[data-testimonials-layout="scroll"]');
    if (testimonialGrid) return false;
    if (card.closest('.posts-tabs-section')) {
      // .post-card-content/.post-card-image opt in explicitly via
      // data-card-reveal, but only when the Work section is actually in
      // list layout — card-animations.js's own (disabled-in-list-mode)
      // system still owns grid/carousel layouts, so this must not fire
      // there too.
      const isPostCardPiece = card.classList.contains('post-card-content') || card.classList.contains('post-card-image');
      const isListLayout = card.closest('[data-posts-layout="list"]');
      if (!(isPostCardPiece && isListLayout)) return false;
    }
    return true;
  });

  const revealedCards = new WeakSet();

  // Pulled out of the initial forEach so it can also run for cards that
  // don't exist yet at this point — e.g. post-and-cards.js's
  // .card-description-statement .statement-container, built dynamically
  // from async project-metadata fetches, well after this one-time
  // querySelectorAll has already run. See registerCard/window.observeCardReveal
  // below.
  const setInitialCardState = (card) => {
    const variantName = card.dataset.cardReveal || 'default';
    const cardCfg = SCROLL_REVEAL_CONFIG.card[variantName] || SCROLL_REVEAL_CONFIG.card.default;
    const isListLayout = card.closest('[data-posts-layout="list"]') || variantName === 'slide-left';

    if (isListLayout) {
      // List layout / slide-left variant: slide in from the right
      gsap.set(card, { opacity: 0, x: cardCfg.xOffset || 100 });
      // Images: no scale change, stay at 1
      gsap.set(card.querySelectorAll('img'), { scale: 1 });
    } else {
      // Other layouts: slide up from below
      gsap.set(card, {
        opacity: 0,
        y: cardCfg.yOffset,
        scale: cardCfg.scale.start,
      });
    }
  };

  animatedCards.forEach(setInitialCardState);

  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const card = entry.target;

      const variantName = card.dataset.cardReveal || 'default';
      const cardCfg = SCROLL_REVEAL_CONFIG.card[variantName] || SCROLL_REVEAL_CONFIG.card.default;

      const rect = card.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const isInBottomHalf = elementCenter > window.innerHeight / 2;
      const isRevealed = revealedCards.has(card);

      if (entry.isIntersecting) {
        if (isScrollingDown && isInBottomHalf && !isRevealed) {
          const isListLayout = card.closest('[data-posts-layout="list"]') || variantName === 'slide-left';

          if (isListLayout) {
            // List layout / slide-left variant: slide left (from right to
            // center). `data-item-index` (if present) staggers a group of
            // these — e.g. the profile section's six items reveal one by
            // one via cardCfg.staggerDelay, instead of all firing at once
            // just because they crossed the IntersectionObserver threshold
            // in the same tick (which a compact grid otherwise would).
            const itemIndex = parseInt(card.dataset.itemIndex, 10) || 0;
            gsap.to(card, {
              opacity: 1,
              x: 0,
              filter: `blur(${cardCfg.blur.end}px)`,
              duration: cardCfg.duration,
              ease: cardCfg.ease,
              delay: itemIndex * (cardCfg.staggerDelay || 0),
            });
          } else if (variantName === 'scale-focus') {
            const tl = gsap.timeline();
            tl.to(card, {
              opacity: 1,
              filter: `blur(${cardCfg.blur.end}px)`,
              duration: cardCfg.blurDuration,
              ease: 'power2.out',
            }, 0);
            tl.to(card, {
              scale: cardCfg.scale.end,
              duration: cardCfg.duration,
              ease: cardCfg.ease,
            }, 0);
          } else {
            gsap.to(card, {
              opacity: 1,
              y: 0,
              scale: cardCfg.scale.end,
              filter: `blur(${cardCfg.blur.end}px)`,
              duration: cardCfg.duration,
              ease: cardCfg.ease,
            });
          }
          revealedCards.add(card);
        }
      } else {
        if (!isScrollingDown && isRevealed) {
          const isListLayout = card.closest('[data-posts-layout="list"]') || variantName === 'slide-left';

          if (isListLayout) {
            // List layout / slide-left variant: slide right (exit)
            gsap.to(card, {
              opacity: 0,
              x: cardCfg.xOffset || 100,
              filter: `blur(${cardCfg.blur.start}px)`,
              duration: cardCfg.duration,
              ease: 'power2.in',
            });
          } else {
            gsap.to(card, {
              opacity: 0,
              y: cardCfg.yOffset,
              scale: cardCfg.scale.start,
              filter: `blur(${cardCfg.blur.start}px)`,
              duration: cardCfg.duration,
              ease: 'power2.in',
            });
          }
          revealedCards.delete(card);
        }
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -120px 0px' });

  animatedCards.forEach(card => cardObserver.observe(card));

  // Register a card created after this init already ran (see
  // setInitialCardState comment above). Sets the same initial hidden
  // state and hands it to the same shared observer/scroll-direction
  // tracking/revealedCards set as every other card — not a parallel
  // system, just a later entry point into this one.
  window.observeCardReveal = (card) => {
    if (!card) return;
    setInitialCardState(card);
    cardObserver.observe(card);
  };

  if (window.innerWidth <= 768) {
    const tabsSection = document.querySelector('.posts-tabs-section');
    if (tabsSection) {
      const revealedTabs = new WeakSet();

      gsap.set(tabsSection, {
        opacity: 0,
        filter: 'blur(24px)',
      });

      const tabsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const rect = entry.target.getBoundingClientRect();
          const elementCenter = rect.top + rect.height / 2;
          const isInBottomHalf = elementCenter > window.innerHeight / 2;
          const isRevealed = revealedTabs.has(tabsSection);

          if (entry.isIntersecting) {
            if (isScrollingDown && isInBottomHalf && !isRevealed) {
              gsap.to(tabsSection, {
                opacity: 1,
                filter: 'blur(0px)',
                duration: 0.6,
                ease: 'power2.out',
              });
              revealedTabs.add(tabsSection);
            }
          } else {
            if (!isScrollingDown && isRevealed) {
              gsap.to(tabsSection, {
                opacity: 0,
                filter: 'blur(24px)',
                duration: 0.6,
                ease: 'power2.in',
              });
              revealedTabs.delete(tabsSection);
            }
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -120px 0px' });

      tabsObserver.observe(tabsSection);
    }
  }
}

if (typeof window !== 'undefined') {
  window.initCardScrollReveal = initCardScrollReveal;
}

})();
