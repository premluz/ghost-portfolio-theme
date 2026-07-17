/**
 * LOGOS SCROLL
 * Infinite scrolling logos with entrance animation
 * Uses GSAP for smooth animation and seamless looping
 */

function initLogosScroll() {
  const section = document.getElementById('logos-scroll');
  if (!section) {
    console.log('[logos-scroll] Section not found');
    return;
  }

  const container = section.querySelector('.logos-scroll-container');
  if (!container) {
    console.warn('[logos-scroll] Container not found');
    return;
  }

  // Show section immediately — only logo images start hidden (opacity: 0 in CSS)
  section.classList.add('is-ready');

  if (typeof gsap === 'undefined') {
    console.warn('[logos-scroll] GSAP not loaded');
    return;
  }

  // CSS marquee animation handles the scrolling — nothing more needed here
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogosScroll);
} else {
  initLogosScroll();
}
