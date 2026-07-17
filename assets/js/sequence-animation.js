/**
 * SEQUENCE ANIMATION
 * Scroll-driven zoom animation for section headers
 * Scales from 3x → 1x as user scrolls through section
 */

// Check if ScrollTrigger is ready (only log, don't fail)
if (typeof ScrollTrigger !== 'undefined' && typeof ScrollTrigger.create === 'function') {
  console.log('[sequence-animation] ScrollTrigger.create is ready');
}

const SEQUENCE_ANIMATION_CONFIG = {
  initialScale: 3.0,              // Starting zoom level (3x)
  finalScale: 1.0,                // End zoom level (natural)

  // ═══ SCROLL DISTANCE ═══
  // Base distance (px) needed to complete scale animation
  // Override per-element with: data-scroll-distance="5000"
  baseScrollDistance:500,       // pixels - INCREASE if not reaching 1.0

  scrubAmount: 1,                 // Smooth scroll scrub (1 = linked to scrollbar)
  showDebugMarkers: false,
};

function getScrollDistance(element) {
  // Per-element override: <div data-sequence-animate data-scroll-distance="6000">
  const customDistance = element.getAttribute('data-scroll-distance');
  if (customDistance) {
    return parseInt(customDistance);
  }
  return SEQUENCE_ANIMATION_CONFIG.baseScrollDistance;
}

function initSequenceAnimations() {
  if (typeof ScrollTrigger === 'undefined' || typeof ScrollTrigger.create !== 'function') {
    console.warn('[sequence-animation] ScrollTrigger.create not available');
    return;
  }

  const sections = document.querySelectorAll('.animated-scroll-sequence');
  console.log('[sequence-animation] Found', sections.length, 'sections');

  if (sections.length === 0) {
    console.log('[sequence-animation] ⚠️ No .animated-scroll-sequence found!');
    return;
  }

  sections.forEach((section, idx) => {
    const animatedElements = section.querySelectorAll('[data-sequence-animate]');

    if (animatedElements.length === 0) {
      console.log(`[sequence-animation] Section ${idx}: no elements to animate`);
      return;
    }

    console.log(`[sequence-animation] Section ${idx}: animating ${animatedElements.length} elements`);

    animatedElements.forEach((element, eIdx) => {
      // Get scroll distance for this specific element
      const scrollDist = getScrollDistance(element);
      let isSticky = false;

      // Simple scale animation: 3x → 1x over scroll distance
      gsap.fromTo(
        element,
        { scale: SEQUENCE_ANIMATION_CONFIG.initialScale },
        {
          scale: SEQUENCE_ANIMATION_CONFIG.finalScale,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: element,  // Trigger from the element itself
            start: 'top 80%',   // Start when element is 80% down viewport
            end: '+=' + scrollDist,  // Scroll this many pixels to complete animation
            scrub: SEQUENCE_ANIMATION_CONFIG.scrubAmount,
            markers: SEQUENCE_ANIMATION_CONFIG.showDebugMarkers,
            immediateRender: false,
            onUpdate: (self) => {
              // Skip animation if tab switch scroll is in progress
              if (window.tabSwitchScrolling) return;

              // Skip sticky logic if CSS is handling it via data-sticky-header attribute
              const hasStickyAttr = element.hasAttribute('data-sticky-header');
              if (hasStickyAttr) return;

              // When animation is complete (100%), make sticky at its natural position
              if (self.progress >= 0.99 && !isSticky) {
                // Get element's current position from viewport top
                const rect = element.getBoundingClientRect();
                const topOffset = rect.top + window.scrollY;

                element.style.position = 'sticky';
                element.style.top = '0px';  // Stick at current scroll position
                element.style.zIndex = '100';
                isSticky = true;
                console.log('[sequence] Sticky ON at final scale, offsetTop:', topOffset);
              }
            }
          }
        }
      );

      // When section leaves, remove sticky via ScrollTrigger on section
      // Skip if CSS is handling it via data-sticky-header attribute
      if (!element.hasAttribute('data-sticky-header')) {
        ScrollTrigger.create({
          trigger: section,
          start: 'bottom bottom',
          onLeave: () => {
            element.style.position = 'relative';
            element.style.top = 'auto';
            isSticky = false;
            console.log('[sequence] Sticky OFF (section left)');
          }
        });
      }

      console.log(`[sequence-animation] ✅ Element ${eIdx}: scale 3→1 over ${scrollDist}px`);
    });
  });
}

// Initialize when ScrollTrigger.create is actually available
function waitForScrollTriggerThenInit() {
  if (typeof ScrollTrigger !== 'undefined' && typeof ScrollTrigger.create === 'function') {
    console.log('[sequence-animation] ✅ ScrollTrigger.create is ready');
    initSequenceAnimations();
  } else {
    console.log('[sequence-animation] ⏳ Waiting for ScrollTrigger.create... ST:', typeof ScrollTrigger, 'create:', typeof ScrollTrigger?.create);
    setTimeout(waitForScrollTriggerThenInit, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForScrollTriggerThenInit);
} else {
  waitForScrollTriggerThenInit();
}
