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

  /**
   * Scroll the sticky-nav container only if the item is close to an edge.
   * Keeps scrolling subtle — only centers when item is in outer 30% of visible area.
   */
  function scrollNavToItem(item) {
    const containerRect = stickyNav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    if (containerRect.width === 0 || itemRect.width === 0) return;

    // Check if item is visible and not near the edges
    const itemLeft = itemRect.left - containerRect.left;
    const itemRight = itemLeft + itemRect.width;
    const edgeThreshold = containerRect.width * 0.3; // 30% threshold

    // Only scroll if item is outside safe zone or close to edges
    if (itemLeft >= edgeThreshold && itemRight <= containerRect.width - edgeThreshold) {
      return; // Item is centered enough, don't scroll
    }

    // Item is close to edge, center it
    const itemScrollPos = stickyNav.scrollLeft + itemLeft;
    const targetScrollLeft = itemScrollPos - (containerRect.width - itemRect.width) / 2;

    stickyNav.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
  }

  /**
   * Mark an item as active (removing active from all others) and scroll the
   * nav to center it. Safe to call from both the observer and click handlers.
   */
  function setActiveItem(item) {
    items.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    scrollNavToItem(item);
  }

  // Use Intersection Observer to detect which section is in view.
  // rootMargin: top clip removes the header area; the large bottom clip means
  // a section is "active" as soon as its top edge crosses the upper 20% of
  // the viewport — this feels most natural for bottom-anchored navs.
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0,
  };

  // Keep track of which sections are currently intersecting so we can pick
  // the topmost one when multiple fire simultaneously.
  const intersectingSet = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        intersectingSet.add(entry.target.id);
      } else {
        intersectingSet.delete(entry.target.id);
      }
    });

    if (intersectingSet.size === 0) return;

    // Pick the section that appears earliest in DOM order (topmost on page)
    // so the active item is always the one the user is currently reading.
    let activeSectionId = null;
    Object.keys(sectionMap).forEach(sectionId => {
      if (intersectingSet.has(sectionId)) {
        if (activeSectionId === null) {
          activeSectionId = sectionId;
        }
        // sectionMap keys were inserted in DOM order (forEach on items),
        // so the first match is already the topmost — just take the first.
      }
    });

    if (activeSectionId && sectionMap[activeSectionId]) {
      setActiveItem(sectionMap[activeSectionId]);
    }
  }, observerOptions);

  // Observe all sections that have a corresponding nav item
  Object.keys(sectionMap).forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      observer.observe(section);
    }
  });

  // Handle click navigation.
  // Immediately apply active state so the nav feels responsive, then perform
  // the smooth page scroll. The Intersection Observer will re-confirm the
  // active item once the scroll settles, which is fine.
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.getAttribute('data-section-id');
      const section = document.getElementById(sectionId);
      if (!section) return;

      // Optimistic active update — instant feedback before the page scrolls
      setActiveItem(item);

      const offsetTop = section.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    });
  });
}

/**
 * Monitor scroll direction to show/hide sticky-nav.
 * Hidden on page load; slides in when scrolling down past 100 px;
 * slides out when scrolling back up.
 */
function monitorNavVisibility(stickyNav, mainNav) {
  let lastScrollY = 0;
  let isNavVisible = false;

  function updateStickyNavPosition() {
    const currentScrollY = window.scrollY;
    const isScrollingDown = currentScrollY > lastScrollY;

    // Check if near bottom of page (within 400px of bottom)
    const isNearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 400);

    if (currentScrollY < 50) {
      // Near top — always hide
      if (isNavVisible) {
        stickyNav.classList.remove('visible');
        isNavVisible = false;
      }
    } else if (isNearBottom && isScrollingDown) {
      // Reached bottom while still scrolling down — hide
      if (isNavVisible) {
        stickyNav.classList.remove('visible');
        isNavVisible = false;
      }
    } else if (currentScrollY > 100 && isScrollingDown) {
      // Scrolling down past threshold — show
      if (!isNavVisible) {
        stickyNav.classList.add('visible');
        isNavVisible = true;
      }
    } else if (!isScrollingDown) {
      // Scrolling up from anywhere (including near bottom) — show
      if (!isNavVisible) {
        stickyNav.classList.add('visible');
        isNavVisible = true;
      }
    }

    lastScrollY = currentScrollY;
  }

  window.addEventListener('scroll', updateStickyNavPosition, { passive: true });
  if (window.resizeManager) window.resizeManager.subscribe('sticky-nav', updateStickyNavPosition);
  else window.addEventListener('resize', updateStickyNavPosition, { passive: true });
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

  headings.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `section-${index + 1}`;
    }

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
