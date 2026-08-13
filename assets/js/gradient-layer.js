/**
 * GRADIENT LAYER
 * Multiple gradient divs with opacity crossfade
 * Shows smooth color transitions as cards scroll into view
 */

(function() {
  'use strict';

  const gradientBg = document.getElementById('page-gradient');
  const postsSection = document.querySelector('.posts-tabs-section');

  console.log('[gradient-layer] Init: gradientBg found:', !!gradientBg, 'postsSection found:', !!postsSection);
  if (!gradientBg || !postsSection) {
    console.warn('[gradient-layer] Missing elements - aborting');
    return;
  }

  // Initialize immediately (wire-meta runs synchronously)
  function initGradients() {
    console.log('[gradient-layer] Initializing gradients immediately...');
    try {
      initGradientsNow();
      console.log('[gradient-layer] ✅ initGradientsNow() completed successfully');
    } catch (err) {
      console.error('[gradient-layer] Error in initGradientsNow():', err);
    }
  }

  function initGradientsNow() {
  console.log('[gradient-layer] ✅ initGradientsNow() called');
  console.log('[gradient-layer] gradientBg z-index:', window.getComputedStyle(gradientBg).zIndex, 'opacity:', window.getComputedStyle(gradientBg).opacity, 'position:', window.getComputedStyle(gradientBg).position);

  // Card colors: read from metadata instead of hardcoded
  const allCards = document.querySelectorAll('.post-card');
  // Cached once — cardObserver's and attrObserver's callbacks below used to
  // re-run document.querySelectorAll('.post-card') + Array.from(...).indexOf()
  // on every single firing (every scroll-driven intersection change, every
  // gradient-attribute mutation), which is a full DOM query + array
  // allocation + O(n) scan repeated for no reason — this list never
  // changes after init.
  const allCardsArray = Array.from(allCards);
  console.log('[gradient-layer] Found', allCards.length, 'post-cards');

  // Predefined color palette for cards (matching your design)
  const colorPalette = [
    'rgba(255, 0, 0, 0.55)',        // Red
    'rgba(15, 162, 162, 0.55)',     // Teal
    'rgba(149, 0, 255, 0.55)',      // Purple
    'rgba(183, 41, 60, 0.55)',      // Maroon
    'rgba(124, 42, 255, 0.55)',     // Violet
    'rgba(202, 22, 230, 0.55)',     // Magenta
    'rgba(36, 59, 235, 0.55)',      // Blue
    'rgba(220, 20, 120, 0.55)',     // Pink
  ];

  // Build per-card data: full gradient string + a flat colour for the solid bg layer
  const cardData = Array.from(allCards).map((card, index) => {
    // Try to get gradientCss from data attribute first, then from projectMetaArray
    let gradientCss = card.getAttribute('data-gradient-css');

    // Debug: check what attributes are available
    const cardId = card.getAttribute('data-card-id') || card.querySelector('[data-project-id]')?.getAttribute('data-project-id');
    console.log('[gradient-layer] Card', index + 1, '- cardId:', cardId, 'projectMetaArray:', window.projectMetaArray?.length || 0);

    // If not in data attribute, look up in projectMetaArray by card ID
    if (!gradientCss && window.projectMetaArray && window.projectMetaArray.length > 0) {
      const cardMeta = window.projectMetaArray.find(meta => meta.cardId === cardId);
      if (cardMeta && cardMeta.gradientCss) {
        gradientCss = cardMeta.gradientCss;
        console.log('[gradient-layer] Card', index + 1, '- found in projectMetaArray:', cardMeta.cardId);
      }
    }

    console.log('[gradient-layer] Card', index + 1, '- gradientCss:', gradientCss ? 'found' : 'MISSING');

    if (gradientCss) {
      // Extract the first colour stop for the subtle solid-bg layer
      const hexMatch  = gradientCss.match(/#[0-9a-f]{6}([0-9a-f]{2})?/i);
      const rgbaMatch = gradientCss.match(/rgba\([^)]+\)/);
      let flatColor;
      if (hexMatch) {
        const hex = hexMatch[0];
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
        flatColor = `rgba(${r}, ${g}, ${b}, ${(a * 0.15).toFixed(2)})`;
      } else if (rgbaMatch) {
        flatColor = rgbaMatch[0];
      } else {
        flatColor = colorPalette[index % colorPalette.length].replace('0.55', '0.05');
      }
      console.log('[gradient-layer]   → using full gradient, flat colour:', flatColor);
      // Use the full gradientCss string directly — no rebuilding
      return { gradient: gradientCss, flat: flatColor };
    }

    // Fallback: palette colour, rebuild simple gradient
    const color = colorPalette[index % colorPalette.length];
    console.log('[gradient-layer] Card', index + 1, '- using palette color:', color);
    return {
      gradient: `radial-gradient(85% 80% at 10% 10%, ${color} 25%, transparent 100%)`,
      flat: color.replace('0.55', '0.05')
    };
  });

  console.log('[gradient-layer] Card data:', cardData.map(d => d.gradient.substring(0, 60)));

  // Create gradient divs (reuse existing trigger system)
  const solidBgs = cardData.map((data) => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.background = data.flat;
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.5s ease-in-out';
    div.style.pointerEvents = 'none';
    // Hints the browser to keep these on their own compositor layer rather
    // than promoting/demoting one on every fade in/out — with N cards this
    // is 2N persistent full-viewport layers already, cheaper to keep
    // stable than to keep recreating.
    div.style.willChange = 'opacity';
    gradientBg.appendChild(div);
    return div;
  });
  console.log('[gradient-layer] Created', solidBgs.length, 'solid background divs');

  const gradientDivs = cardData.map((data) => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.background = data.gradient;  // full string from meta — position/size preserved
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.2s ease-in-out';
    div.style.pointerEvents = 'none';
    div.style.willChange = 'opacity'; // see solidBgs' own comment above
    gradientBg.appendChild(div);
    return div;
  });
  console.log('[gradient-layer] Created', gradientDivs.length, 'gradient divs');

  let currentCardIndex = 0;

  // Add fade transition for section visibility changes (fast)
  gradientBg.style.transition = 'opacity 0.4s ease-in-out';

  // Show gradient: delayed entry — only when cards are in view (top shrunk)
  const sectionEnterObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) gradientBg.style.opacity = '0.5';
    },
    { threshold: 0, rootMargin: '-1000px 0px 0px 0px' }
  );
  sectionEnterObserver.observe(postsSection);

  // Hide gradient: early exit on scroll-up — fires once section top leaves viewport
  const sectionExitObserver = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) gradientBg.style.opacity = '0';
    },
    { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
  sectionExitObserver.observe(postsSection);

  // Persistent map of card → latest intersection ratio
  const cardRatios = new Map();

  const cardObserver = new IntersectionObserver(
    (entries) => {
      // Update ratios for every changed entry
      entries.forEach((entry) => {
        cardRatios.set(entry.target, entry.intersectionRatio);
      });

      // Find globally most-visible card across all tracked cards
      let bestCard = null;
      let maxRatio = 0;
      cardRatios.forEach((ratio, card) => {
        if (ratio > maxRatio) {
          maxRatio = ratio;
          bestCard = card;
        }
      });

      if (bestCard && maxRatio > 0.1) {
        gradientBg.style.opacity = '0.5';

        const cardIndex = allCardsArray.indexOf(bestCard);

        if (cardIndex !== currentCardIndex && cardIndex >= 0 && cardIndex < solidBgs.length) {
          // Re-read attribute live — it may have been set async after init
          const liveGradient = bestCard.getAttribute('data-gradient-css');
          if (liveGradient && gradientDivs[cardIndex].style.background !== liveGradient) {
            gradientDivs[cardIndex].style.background = liveGradient;
            // Also update flat colour for solid layer
            const hexMatch = liveGradient.match(/#[0-9a-f]{6}([0-9a-f]{2})?/i);
            if (hexMatch) {
              const hex = hexMatch[0];
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              const a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
              solidBgs[cardIndex].style.background = `rgba(${r},${g},${b},${(a * 0.15).toFixed(2)})`;
            }
          }

          solidBgs[currentCardIndex].style.opacity = '0';
          gradientDivs[currentCardIndex].style.opacity = '0';
          solidBgs[cardIndex].style.opacity = '1';
          gradientDivs[cardIndex].style.opacity = '1';
          currentCardIndex = cardIndex;
        }
      }
      // No else-hide here — gaps between cards would cause flicker.
      // Gradient hides only when the section leaves viewport (sectionObserver below).
    },
    {
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    }
  );

  // Watch for data-gradient-css being set async (fetch in posts-tabs-grid.js / post-and-cards.js)
  function applyLiveGradient(card, cardIndex) {
    const gradient = card.getAttribute('data-gradient-css');
    if (!gradient) return;
    gradientDivs[cardIndex].style.background = gradient;
    const hexMatch = gradient.match(/#[0-9a-f]{6}([0-9a-f]{2})?/i);
    if (hexMatch) {
      const hex = hexMatch[0];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
      solidBgs[cardIndex].style.background = `rgba(${r},${g},${b},${(a * 0.15).toFixed(2)})`;
    }
  }

  const attrObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.attributeName !== 'data-gradient-css') return;
      const card = m.target;
      const cardIndex = allCardsArray.indexOf(card);
      if (cardIndex < 0 || cardIndex >= gradientDivs.length) return;
      applyLiveGradient(card, cardIndex);
    });
  });
  allCards.forEach(card => attrObserver.observe(card, { attributes: true, attributeFilter: ['data-gradient-css'] }));

  // Observe all cards (with delay to ensure DOM is ready)
  setTimeout(() => {
    console.log('[gradient-layer] Observing', allCards.length, 'cards');
    allCards.forEach((card) => cardObserver.observe(card));

    // Force initialize card 1 gradient (re-read live in case async fetch already ran)
    if (allCards.length > 0) {
      const liveGradient0 = allCards[0].getAttribute('data-gradient-css');
      if (liveGradient0) {
        gradientDivs[0].style.background = liveGradient0;
        const hexMatch0 = liveGradient0.match(/#[0-9a-f]{6}([0-9a-f]{2})?/i);
        if (hexMatch0) {
          const hex = hexMatch0[0];
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const a = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
          solidBgs[0].style.background = `rgba(${r},${g},${b},${(a * 0.15).toFixed(2)})`;
        }
        console.log('[gradient-layer] Card 1 live gradient:', liveGradient0.substring(0, 60));
      }
      solidBgs[0].style.opacity = '1';
      gradientDivs[0].style.opacity = '1';
      currentCardIndex = 0;
    }
  }, 500);

  // Expose method to reset to first card gradient (called on tab switch)
  window.gradientManager = window.gradientManager || {};
  window.gradientManager.setFirstCardGradient = function() {
    // Fade out current gradient
    solidBgs[currentCardIndex].style.opacity = '0';
    gradientDivs[currentCardIndex].style.opacity = '0';
    // Fade in first card gradient
    solidBgs[0].style.opacity = '1';
    gradientDivs[0].style.opacity = '1';
    currentCardIndex = 0;
    console.log('[gradient-layer] Reset to first card gradient');
  };
  } // End initGradientsNow()

  // Start initialization
  try {
    console.log('[gradient-layer] Calling initGradients()...');
    initGradients();
    console.log('[gradient-layer] initGradients() called successfully');
  } catch (err) {
    console.error('[gradient-layer] Error calling initGradients():', err);
  }

})();
