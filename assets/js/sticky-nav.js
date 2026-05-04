/**
 * Sticky Navigation Component
 * Auto-generates nav items from h2/h3 headings or uses pre-defined items
 * Detects active section using Intersection Observer
 */

function initStickyNav() {
  const stickyNav = document.querySelector('.sticky-nav');
  if (!stickyNav) return;

  // Check if nav items need to be auto-generated from content headings
  if (stickyNav.dataset.autoGenerate === 'true') {
    generateNavFromHeadings(stickyNav);
  }

  const items = stickyNav.querySelectorAll('.sticky-nav-item');
  if (items.length === 0) return;

  // Track main nav visibility for sticky-nav positioning
  const mainNav = document.querySelector('.gh-navigation');
  if (mainNav) {
    monitorNavVisibility(stickyNav, mainNav);
  }

  // Build map of section IDs to nav items
  const sectionMap = {};
  items.forEach(item => {
    const sectionId = item.getAttribute('data-section-id');
    if (sectionId) {
      sectionMap[sectionId] = item;
    }
  });

  // Use Intersection Observer to detect which section is in view
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -80% 0px',
    threshold: 0,
  };

  const observer = new IntersectionObserver((entries) => {
    let activeSection = null;

    entries.forEach(entry => {
      if (entry.isIntersecting) {
        activeSection = entry.target.id;
      }
    });

    if (activeSection) {
      items.forEach(item => item.classList.remove('active'));
      const activeItem = sectionMap[activeSection];
      if (activeItem) {
        activeItem.classList.add('active');
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, observerOptions);

  // Observe all sections
  Object.keys(sectionMap).forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      observer.observe(section);
    }
  });

  // Handle click navigation
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.getAttribute('data-section-id');
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

/**
 * Monitor main nav position and push sticky-nav down by nav's movement
 * Sticky nav always stays directly below the nav with no gap
 */
function monitorNavVisibility(stickyNav, mainNav) {
  function updateStickyNavPosition() {
    // Get nav's position in viewport
    const navRect = mainNav.getBoundingClientRect();

    // Sticky nav should be at the nav's bottom edge in viewport coordinates
    // (since sticky nav uses position: fixed)
    const navBottom = navRect.bottom;

    console.log('Nav bottom:', navBottom, 'Top set to:', navBottom);

    stickyNav.style.top = Math.max(0, navBottom) + 'px';
  }

  // Update on scroll
  window.addEventListener('scroll', updateStickyNavPosition, { passive: true });

  // Also update on resize
  window.addEventListener('resize', updateStickyNavPosition, { passive: true });

  // Initial call
  updateStickyNavPosition();
}

/**
 * Auto-generate nav items from h2/h3 headings in content
 */
function generateNavFromHeadings(stickyNav) {
  const contentSelector = stickyNav.dataset.contentSelector || '.gh-content';
  const headingSelector = stickyNav.dataset.headingSelector || 'h2, h3';
  const content = document.querySelector(contentSelector);

  if (!content) return;

  const headings = content.querySelectorAll(headingSelector);
  if (headings.length === 0) return;

  // Generate nav items from headings
  headings.forEach((heading, index) => {
    // Add ID if missing
    if (!heading.id) {
      heading.id = `section-${index + 1}`;
    }

    // Create nav item
    const navItem = document.createElement('a');
    navItem.className = 'sticky-nav-item';
    navItem.href = `#${heading.id}`;
    navItem.setAttribute('data-section-id', heading.id);
    navItem.textContent = heading.textContent;

    stickyNav.appendChild(navItem);
  });
}

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStickyNav);
} else {
  initStickyNav();
}
