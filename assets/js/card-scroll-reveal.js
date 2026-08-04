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

// Exposed so other scripts can reuse the same reveal treatment (opacity +
// scale + blur) without duplicating these tuned values — post-and-cards.js's
// lazy-loaded card images/videos in particular. Read-only in spirit: nothing
// outside this file should mutate it.
window.SCROLL_REVEAL_CONFIG = SCROLL_REVEAL_CONFIG;

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
    // .logomark-image: same reasoning, but it's no longer a descendant of
    // .post-header — post.hbs's two-column restructuring (.post-header-layout
    // wraps .post-project-summary + .post-header as siblings) moved
    // .logomark-container OUT of .post-header so its absolute `right:
    // calc(...)` positioning stays correct against the full-width row. Its
    // reveal is owned by animateLogomarkDrop() (main.js), same as before —
    // needs its own explicit exclusion now that the ancestor check above
    // can't catch it. Confirmed this exact failure mode by measurement:
    // naturalWidth/complete both fine, opacity stuck at 0 forever.
    if (img.closest('.logomark-container')) return false;
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

  const allRevealImages = Array.from(revealImages);
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
  // .post-card-content/.post-card-image deliberately NOT included here —
  // page-level entrance only (see the CSS comment in post-card-grid.css
  // next to their opacity rule). A scroll-triggered fade for these read as
  // a second, competing animation on top of <main>'s own reveal, and
  // additionally raced the metadata fetch that fills in their text/video,
  // making content appear to "fade in with the video" instead of just
  // popping in the instant it's set.
  // .profile-item also deliberately NOT included here anymore — see
  // initProfileItemsReveal() below. This per-element system reveals each
  // card off ITS OWN IntersectionObserver crossing; data-item-index only
  // ever added a fixed extra delay after that per-item crossing, which
  // isn't the same thing as a coordinated stagger from one shared trigger
  // (six items spread down a taller mobile column could each cross the
  // threshold at visibly different scroll moments instead of reading as
  // one grouped reveal). initProfileItemsReveal observes the GROUP once
  // and staggers all six from that single trigger instead.
  const cards = document.querySelectorAll(
    '.testimonial-card, .about-card, .personal-card, .profile-paragraph, .om3-card'
  );

  const animatedCards = Array.from(cards).filter(card => {
    if (card.closest('.post-navigation')) return false;
    if (card.closest('[data-posts-layout="stacked"]')) return false;
    const testimonialGrid = card.closest('[data-testimonials-layout="scroll"]');
    if (testimonialGrid) return false;
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
    const isListLayout = variantName === 'slide-left';

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
          const isListLayout = variantName === 'slide-left';

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

          // Work-grid cards reveal once and stay — unlike testimonial/
          // about/personal/om3/profile cards (decorative, meant to fade
          // back out if you scroll past them going up), a post card
          // disappearing on the way back to the top read as broken, not
          // intentional. Unobserving is what actually prevents it: the
          // hide branch below is gated on `isRevealed`, but merely
          // skipping it would still leave the element under
          // observation forever for no reason once its one-time reveal
          // is done.
          if (card.classList.contains('post-card-content') || card.classList.contains('post-card-image')) {
            cardObserver.unobserve(card);
          }
        }
      } else {
        if (!isScrollingDown && isRevealed) {
          const isListLayout = variantName === 'slide-left';

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
  const allCards = Array.from(animatedCards);

  // Register a card created after this init already ran (see
  // setInitialCardState comment above). Sets the same initial hidden
  // state and hands it to the same shared observer/scroll-direction
  // tracking/revealedCards set as every other card — not a parallel
  // system, just a later entry point into this one.
  window.observeCardReveal = (card) => {
    if (!card) return;
    setInitialCardState(card);
    cardObserver.observe(card);
    allCards.push(card); // keep the backfill registry complete
  };

  // Mobile-only .posts-tabs-section blur(24px)->blur(0px) entrance removed —
  // desktop has no section-level entrance effect for posts-tabs-section at
  // all (only per-card blur:{start:0,end:0}, i.e. no blur), so mobile should
  // match by having none either. tabsBackfill stays null; the guard at its
  // one call site below already no-ops safely when unset.
  let tabsBackfill = null;

  // ── Profile items: single-trigger staggered slide-up ──────────────────
  // Six items revealed together off ONE shared trigger (the group's own
  // container entering view), not per-item — see the comment on the main
  // `cards` selector above for why the old per-item observer didn't give a
  // coordinated stagger. Same visual treatment as testimonial-card/
  // about-card etc. (SCROLL_REVEAL_CONFIG.card.default — slide-up, not the
  // old slide-left), just driven by one observer + one gsap.to(stagger)
  // instead of six independent ones.
  let profileItemsBackfillFns = [];
  const initProfileItemsReveal = (container) => {
    const items = Array.from(container.querySelectorAll('.profile-item'));
    if (!items.length) return;

    if (prefersReducedMotion || !window.gsap) {
      items.forEach(el => { el.style.opacity = '1'; });
      return;
    }

    const cfg = SCROLL_REVEAL_CONFIG.card.default;
    gsap.set(items, { opacity: 0, y: cfg.yOffset, scale: cfg.scale.start });

    let revealed = false;
    const reveal = (instant) => {
      if (revealed) return;
      revealed = true;
      const props = { opacity: 1, y: 0, scale: cfg.scale.end, filter: `blur(${cfg.blur.end}px)`, stagger: cfg.staggerDelay };
      if (instant) gsap.set(items, props);
      else gsap.to(items, { ...props, duration: cfg.duration, ease: cfg.ease });
      observer.disconnect();
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(false); });
    }, { threshold: 0.15, rootMargin: '0px 0px -80px 0px' });
    observer.observe(container);

    // Backfill hook — same "instant if above/behind the restored viewport,
    // animated if still on screen" convention window.__revealBackfill
    // itself uses below. Without this, a curtain-return whose instant
    // scroll jump lands past .profile-items would strand it at opacity:0
    // forever (the container never crosses the observer's threshold if
    // it's never actually scrolled THROUGH after the jump).
    profileItemsBackfillFns.push((limit) => {
      if (revealed) return;
      const viewportTop = window.scrollY;
      const docTop = container.getBoundingClientRect().top + window.scrollY;
      if (docTop >= limit) return;
      reveal(docTop < viewportTop);
    });
  };
  // querySelectorAll, not getElementById — page-about.hbs currently renders
  // a duplicate #profile-items (2 copies of the same 6 items; root cause
  // untraced, unrelated to this reveal — flagged separately). Handling
  // "however many exist" rather than just the first keeps this reveal
  // correct regardless of whether/when that gets fixed.
  document.querySelectorAll('.profile-items').forEach(initProfileItemsReveal);

  // REVEAL BACKFILL — the solid guardrail for scroll restoration.
  // The curtain-return scroll restore cannot rely on observers firing:
  // IntersectionObserver only evaluates at frame boundaries, and homepage
  // init blocks painting for ~1s, so a fast restore sweep passes most
  // elements between two frames — they teleport by unobserved and stay at
  // their hidden initial state ("can't see the card"). The reveal
  // conditions (isScrollingDown && isInBottomHalf) make it worse. This
  // force-reveals every managed element whose document position is at or
  // above the current viewport bottom (i.e., the user has already "passed"
  // it), instantly and unconditionally — no observers, no scroll
  // direction, no thresholds. Elements below stay hidden and reveal
  // normally on real scrolling; scroll-up hide behavior keeps working
  // because we mark the revealed sets just like a genuine reveal would.
  window.__revealBackfill = (maxDocY) => {
    const limit = (typeof maxDocY === 'number' ? maxDocY : window.scrollY + window.innerHeight) - 40;
    // Elements above the current scroll position have never been on screen
    // this load — instant is correct there (nothing to see mid-snap).
    // Elements from the scroll position down to the viewport bottom ARE
    // currently on screen (this runs right after a curtain-return's
    // INSTANT scroll jump, not a scrolled-through sweep), so snapping those
    // straight to their revealed state with gsap.set read as an abrupt pop
    // while the user is looking right at them — those get the same
    // animated reveal a normal scroll trigger would give instead.
    const viewportTop = window.scrollY;
    const skip = (el) => {
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0; // hidden containers (tab panels etc.)
    };
    const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
    let count = 0;
    console.log('[revealBackfill] images registry:', allRevealImages.length, 'cards registry:', allCards.length, 'limit:', limit, 'viewportTop:', viewportTop);
    allRevealImages.forEach((img) => {
      if (revealedImages.has(img) || skip(img) || docTop(img) >= limit) return;
      const props = { opacity: 1, scale: imgCfg.scale.end, filter: `blur(${imgCfg.blur.end}px)` };
      if (docTop(img) >= viewportTop) gsap.to(img, { ...props, duration: imgCfg.duration, ease: imgCfg.ease });
      else gsap.set(img, props);
      revealedImages.add(img);
      count++;
    });
    allCards.forEach((card) => {
      if (revealedCards.has(card) || skip(card) || docTop(card) >= limit) return;
      const variantName = card.dataset.cardReveal || 'default';
      const cardCfg = SCROLL_REVEAL_CONFIG.card[variantName] || SCROLL_REVEAL_CONFIG.card.default;
      const method = docTop(card) >= viewportTop ? 'to' : 'set';
      const tweenOpts = method === 'to' ? { duration: cardCfg.duration, ease: cardCfg.ease } : {};
      if (variantName === 'slide-left') {
        gsap[method](card, { opacity: 1, x: 0, filter: `blur(${cardCfg.blur.end}px)`, ...tweenOpts });
      } else if (variantName === 'scale-focus') {
        gsap[method](card, { opacity: 1, scale: cardCfg.scale.end, filter: `blur(${cardCfg.blur.end}px)`, ...tweenOpts });
      } else {
        gsap[method](card, { opacity: 1, y: 0, scale: cardCfg.scale.end, filter: `blur(${cardCfg.blur.end}px)`, ...tweenOpts });
      }
      revealedCards.add(card);
      count++;
    });
    if (tabsBackfill) tabsBackfill(limit);
    profileItemsBackfillFns.forEach(fn => fn(limit));
    return count;
  };
}

if (typeof window !== 'undefined') {
  window.initCardScrollReveal = initCardScrollReveal;
}

})();
