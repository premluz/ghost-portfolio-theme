(function() { 'use strict';

function isEmptyValue(val) {
  return val === null || val === undefined || val === '' || val === '{{.*}}';
}

function hideEmptyMetadata() {
  document.querySelectorAll('.reading-time').forEach(el => {
    if (isEmptyValue(el.textContent?.trim())) {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('[data-metadata]').forEach(el => {
    if (isEmptyValue(el.textContent?.trim())) {
      el.style.display = 'none';
    }
  });
}

function initTooltipSystem() {
  const tooltipElements = document.querySelectorAll('[data-tooltip]');

  if (tooltipElements.length === 0) {
    return;
  }

  tooltipElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      const text = el.getAttribute('data-tooltip');
      if (!text) return;

      let tooltip = el.querySelector('.tooltip-text');
      if (!tooltip) {
        tooltip = document.createElement('span');
        tooltip.className = 'tooltip-text';
        tooltip.textContent = text;
        el.appendChild(tooltip);
      }

      tooltip.style.display = 'block';
      const rect = el.getBoundingClientRect();
      const top = rect.top - tooltip.offsetHeight - 8;
      const left = rect.left + (rect.width - tooltip.offsetWidth) / 2;

      tooltip.style.position = 'fixed';
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
      tooltip.style.zIndex = '10000';
    });

    el.addEventListener('mouseleave', () => {
      const tooltip = el.querySelector('.tooltip-text');
      if (tooltip) {
        tooltip.style.display = 'none';
      }
    });
  });
}

function initDragToScroll() {
  const scrollableElements = document.querySelectorAll('.sticky-nav, .post-toc-nav');

  scrollableElements.forEach(el => {
    let isDown = false;
    let startX;
    let scrollLeft;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1;
      el.scrollLeft = scrollLeft - walk;
    });

    document.addEventListener('mouseup', () => {
      isDown = false;
      el.style.cursor = 'grab';
      el.style.userSelect = 'auto';
    });
  });
}

function initCarousel() {
  const carouselContainer = document.querySelector('.carousel-container');
  if (!carouselContainer) return;

  const track = carouselContainer.querySelector('.carousel-track');
  if (!track) return;

  const slides = track.querySelectorAll('.carousel-item');
  if (slides.length === 0) return;

  const prevBtn = carouselContainer.querySelector('.carousel-btn-prev');
  const nextBtn = carouselContainer.querySelector('.carousel-btn-next');
  const dotsContainer = carouselContainer.querySelector('.carousel-dots');

  let currentIndex = 0;

  function updateCarousel() {
    const slideWidth = slides[0].offsetWidth + 20;
    track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;

    document.querySelectorAll('.carousel-dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentIndex);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + slides.length) % slides.length;
      updateCarousel();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % slides.length;
      updateCarousel();
    });
  }

  if (dotsContainer) {
    slides.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (idx === 0 ? ' active' : '');
      dot.addEventListener('click', () => {
        currentIndex = idx;
        updateCarousel();
      });
      dotsContainer.appendChild(dot);
    });
  }

  updateCarousel();
}

if (typeof window !== 'undefined') {
  window.hideEmptyMetadata = hideEmptyMetadata;
  window.initTooltipSystem = initTooltipSystem;
  window.initDragToScroll = initDragToScroll;
  window.initCarousel = initCarousel;
}

})();
