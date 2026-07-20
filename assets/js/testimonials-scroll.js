/**
 * TESTIMONIALS SCROLL
 * Horizontal scroll animation tied to page scroll
 * Uses GSAP ScrollTrigger for smooth scroll-driven animation
 */

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION - Adjust these values to customize the scroll behavior
// ═══════════════════════════════════════════════════════════════════════

const TESTIMONIALS_SCROLL_CONFIG = {
  // Card sizing
  cardWidthVw: 50,  // Each card width as % of viewport (50 = 50vw)

  // Starting position - how far off-screen the first card starts
  // 1.0 = one card width, 1.2 = 60% off-screen, 1.5 = fully hidden, 2.0 = very far
  startPositionMultiplier: 0.8,

  // Scroll speed - higher = slower, smoother animation
  // 1.0 = fast, 1.5 = moderate (current), 2.0 = slow, 3.0 = very slow
  scrubSpeed: 1,

  // Items visible at end - how many items should remain visible when scroll completes
  // 2 = two items visible, 3 = three items visible, etc
  itemsVisibleAtEnd: 2,

  // Scroll distance multiplier - scales the animation distance
  // 1.0 = use base distance, 1.5 = 50% farther (faster), 0.8 = 20% less (slower)
  scrollDistanceMultiplier: 0.8,

  // ScrollTrigger timing
  scrollTriggerStart: 'top center',  // When animation starts (section top at viewport center)
  scrollTriggerEnd: 'bottom center',  // When animation ends (section bottom at viewport center)

  // Animation delay - how far into the section before items start moving
  // Delay the animation start by adding scroll distance
  // Examples: '+=0px' (start immediately), '+=100px', '+=200px', '+=20%', '+=30%'
  animationDelay: '+=-30%',

  // Debug mode - shows animation markers when true
  showDebugMarkers: false,
};

function initTestimonialsScroll() {
  // Only initialize if scroll layout is active
  const grid = document.querySelector('.testimonials-grid[data-testimonials-layout="scroll"]');
  if (!grid) return;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('[testimonials-scroll] GSAP or ScrollTrigger not loaded');
    return;
  }

  const section = grid.closest('.testimonials-section');
  if (!section) {
    console.warn('[testimonials-scroll] Section not found');
    return;
  }

  try {
    const cards = grid.querySelectorAll('.testimonial-card');
    if (cards.length === 0) {
      console.warn('[testimonials-scroll] No testimonial cards found');
      return;
    }

    console.log('[testimonials-scroll] Found', cards.length, 'testimonial cards');

    // Calculate dimensions from config
    const cardWidth = (window.innerWidth * TESTIMONIALS_SCROLL_CONFIG.cardWidthVw) / 100;
    const gap = parseInt(getComputedStyle(grid).gap) || 0;
    const totalWidth = (cardWidth + gap) * cards.length;
    const visibleWidth = cardWidth * TESTIMONIALS_SCROLL_CONFIG.itemsVisibleAtEnd + gap * (TESTIMONIALS_SCROLL_CONFIG.itemsVisibleAtEnd - 1);
    const baseScrollDistance = totalWidth - visibleWidth;
    const scrollDistance = baseScrollDistance * TESTIMONIALS_SCROLL_CONFIG.scrollDistanceMultiplier;
    const startX = cardWidth * TESTIMONIALS_SCROLL_CONFIG.startPositionMultiplier;

    // Set grid width to accommodate all items
    grid.style.width = totalWidth + 'px';

    console.log('[testimonials-scroll] Card width:', cardWidth, 'Gap:', gap, 'Total width:', totalWidth, 'Scroll distance:', scrollDistance, 'Start X:', startX);

    // ── ANIMATION SETTINGS ─────────────────────────────────────────────
    // Create scroll-driven animation (header is sticky, only grid scrolls)
    gsap.fromTo(
      grid,
      { x: startX },  // Starting position: off-screen right
      {
        x: -scrollDistance,  // Ending position: scroll all items off-screen left
        ease: 'none',  // Linear easing for consistent scroll speed
        scrollTrigger: {
          trigger: section,
          start: TESTIMONIALS_SCROLL_CONFIG.scrollTriggerStart + TESTIMONIALS_SCROLL_CONFIG.animationDelay,
          end: TESTIMONIALS_SCROLL_CONFIG.scrollTriggerEnd,
          scrub: TESTIMONIALS_SCROLL_CONFIG.scrubSpeed,
          markers: TESTIMONIALS_SCROLL_CONFIG.showDebugMarkers,
          immediateRender: false,
        }
      }
    );

    console.log('[testimonials-scroll] ✅ Scroll-driven animation initialized');

    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newCardWidth = window.innerWidth * 0.5;
        const newTotalWidth = (newCardWidth + gap) * cards.length;
        const newVisibleWidth = newCardWidth * TESTIMONIALS_SCROLL_CONFIG.itemsVisibleAtEnd + gap * (TESTIMONIALS_SCROLL_CONFIG.itemsVisibleAtEnd - 1);
        const newBaseScrollDistance = newTotalWidth - newVisibleWidth;
        const newScrollDistance = newBaseScrollDistance * TESTIMONIALS_SCROLL_CONFIG.scrollDistanceMultiplier;

        // Update grid width
        grid.style.width = newTotalWidth + 'px';

        // Kill existing ScrollTrigger
        ScrollTrigger.getAll().forEach(trigger => {
          if (trigger.vars.trigger === section) {
            trigger.kill();
          }
        });

        // Recreate animation with new dimensions
        const newStartX = newCardWidth * TESTIMONIALS_SCROLL_CONFIG.startPositionMultiplier;
        gsap.fromTo(
          grid,
          { x: newStartX },
          {
            x: -newScrollDistance,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: TESTIMONIALS_SCROLL_CONFIG.scrollTriggerStart + TESTIMONIALS_SCROLL_CONFIG.animationDelay,
              end: TESTIMONIALS_SCROLL_CONFIG.scrollTriggerEnd,
              scrub: TESTIMONIALS_SCROLL_CONFIG.scrubSpeed,
              markers: TESTIMONIALS_SCROLL_CONFIG.showDebugMarkers,
              immediateRender: false,
            }
          }
        );

        console.log('[testimonials-scroll] ✅ Animation updated after resize');
      }, 250);
    });

  } catch (err) {
    console.error('[testimonials-scroll] Error:', err);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTestimonialsScroll);
} else {
  initTestimonialsScroll();
}
