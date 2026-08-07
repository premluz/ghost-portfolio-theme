// ═══════════════════════════════════════════════════════════════
// MODAL SYSTEM — Global state management and navigation
// ═══════════════════════════════════════════════════════════════

const ModalSystem = (() => {
  // State
  let modalState = {
    type: null,           // 'single', 'group', or null
    groupId: null,        // ID of modal group (e.g., 'testimonials')
    currentIndex: 0,      // Currently displayed item
    items: [],            // Array of modal items
  };

  let touchStartX = 0;
  let touchStartY = 0;
  let isAnimating = false;

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Create modal DOM structure if not exists
    if (!document.querySelector('.modal-overlay')) {
      createModalDOM();
    }

    attachEventListeners();
    console.log('[modal] System initialized');
  }

  function createModalDOM() {
    // Same icon markup as the main nav's post prev/next/close buttons
    // (navigation.hbs) — identical paths/viewBox, kept as this modal's own
    // instance (modal-nav-btn/modal-close-btn classes, not .nav-icon-btn
    // itself, which carries the fixed site-nav's own positioning/sizing).
    const prevSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>`;
    const nextSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;

    // Close sits INSIDE the pill, leftmost — same arrangement as the main
    // nav's collapsed post-page pill (navigation.hbs: close, then prev,
    // then next). The pill itself is therefore always visible; only
    // prev/next toggle per modal type (see renderModal), because hiding
    // the whole container would take the close button with it.
    const modalHTML = `
      <div class="modal-overlay" style="display:none;">
        <div class="modal-content">
          <div class="modal-body">
            <h2 class="modal-title" style="display:none;"></h2>
            <div class="modal-inner"></div>
          </div>

          <div class="modal-actions">
            <div class="modal-nav-controls">
              <button class="modal-close-btn" aria-label="Close">
                <img class="modal-close-icon" alt="Close" data-skip-reveal>
              </button>
              <button class="modal-nav-btn modal-prev" aria-label="Previous">${prevSvg}</button>
              <!-- Page indicator ("1 / 3") commented out per request — kept
                   here (and its renderModal/CSS handling left intact, both
                   null-guarded) so it can be restored by uncommenting.
              <span class="modal-page-indicator"></span>
              -->
              <button class="modal-nav-btn modal-next" aria-label="Next">${nextSvg}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // The close icon is a fixed-black-fill SVG asset (icons/close.svg),
    // recolored via the same CSS filter as .nav-icon-close (main.css) —
    // not currentColor-able like the chevrons above, since it's an <img>
    // reference, not inline SVG. Reuses whatever URL Ghost already
    // resolved for the nav's own close icon (its {{asset}} helper output)
    // rather than guessing/hardcoding the theme's asset path from this
    // plain JS file — falls back to the theme's known asset path only if
    // that element isn't on the page for some reason.
    const closeIcon = document.querySelector('.modal-close-icon');
    const navCloseIcon = document.querySelector('.nav-icon-close');
    if (closeIcon) {
      closeIcon.src = navCloseIcon ? navCloseIcon.src : '/assets/icons/close.svg';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  function openModal(type, groupId, items, initialIndex = 0) {
    modalState = {
      type,
      groupId,
      currentIndex: initialIndex,
      items
    };

    document.body.style.overflow = 'hidden';
    renderModal();
    showModal();

    // Store modal state in sessionStorage instead of hash to avoid unwanted scroll
    // NOTE: Setting window.location.hash causes browser to auto-scroll to element with that ID,
    // which creates jank and page jump on refresh. Using sessionStorage prevents this.
    if (items[initialIndex]) {
      sessionStorage.setItem('modalState', JSON.stringify({
        type: modalState.type,
        groupId: modalState.groupId,
        currentIndex: initialIndex,
      }));
    }
  }

  function closeModal() {
    hideModal();
    setTimeout(() => {
      modalState.type = null;
      document.body.style.overflow = '';
    }, 400);
  }

  function nextItem() {
    if (modalState.items.length <= 1) return;
    const newIndex = (modalState.currentIndex + 1) % modalState.items.length;
    goToItem(newIndex);
  }

  function prevItem() {
    if (modalState.items.length <= 1) return;
    const newIndex = modalState.currentIndex === 0
      ? modalState.items.length - 1
      : modalState.currentIndex - 1;
    goToItem(newIndex);
  }

  function goToItem(index) {
    if (index === modalState.currentIndex || isAnimating) return;

    isAnimating = true;
    const direction = index > modalState.currentIndex ? 'next' : 'prev';

    animateItemTransition(direction, () => {
      modalState.currentIndex = index;
      renderModal();
      isAnimating = false;

      // Update sessionStorage instead of hash (prevents unwanted scroll)
      if (modalState.items[index]) {
        sessionStorage.setItem('modalState', JSON.stringify({
          type: modalState.type,
          groupId: modalState.groupId,
          currentIndex: index,
        }));
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════

  function renderModal() {
    if (!modalState.type) return;

    const overlay = document.querySelector('.modal-overlay');
    const title = overlay.querySelector('.modal-title');
    const inner = overlay.querySelector('.modal-inner');
    const pageIndicator = overlay.querySelector('.modal-page-indicator');

    const currentItem = modalState.items[modalState.currentIndex];

    // Set title
    if (currentItem.title) {
      title.textContent = currentItem.title;
      title.style.display = '';
    } else {
      title.style.display = 'none';
    }

    // Set content
    if (typeof currentItem.content === 'string') {
      inner.innerHTML = currentItem.content;
    } else if (currentItem.content instanceof HTMLElement) {
      inner.innerHTML = '';
      inner.appendChild(currentItem.content.cloneNode(true));
    } else {
      inner.textContent = currentItem.content;
    }

    // Hook for testimonial modal to fetch content dynamically
    if (modalState.groupId === 'testimonials' && currentItem.content.includes('Loading...') && currentItem.url && typeof fetchTestimonialContent === 'function') {
      fetchTestimonialContent(currentItem.url).then(content => {
        currentItem.content = content;
        inner.innerHTML = content;
      });
    }

    // Show prev/next for group modals with multiple items. Toggles the two
    // BUTTONS, not the pill around them — the pill now also holds the close
    // button (see createModalDOM), which has to stay reachable on every
    // modal type; hiding the container outright would take it with it and
    // leave the modal closable only by Escape/backdrop-click.
    // pageIndicator is null while its markup is commented out — guarded
    // rather than removed, so uncommenting is the only step to restore it.
    const isMultiItemGroup = modalState.type === 'group' && modalState.items.length > 1;
    const prevBtn = overlay.querySelector('.modal-prev');
    const nextBtn = overlay.querySelector('.modal-next');
    if (prevBtn) prevBtn.style.display = isMultiItemGroup ? '' : 'none';
    if (nextBtn) nextBtn.style.display = isMultiItemGroup ? '' : 'none';
    if (pageIndicator) {
      pageIndicator.style.display = isMultiItemGroup ? '' : 'none';
      pageIndicator.textContent = `${modalState.currentIndex + 1} / ${modalState.items.length}`;
    }
  }

  function showModal() {
    // Read by page-transition.js's Escape handler (post-page close button)
    // so it can back off while this modal owns Escape — without this, both
    // fired on the same keypress: this modal closed AND the post navigated
    // away, since page-transition.js's handler has no other way to know
    // this modal exists.
    window.__galleryModalOpen = true;

    const overlay = document.querySelector('.modal-overlay');
    overlay.style.display = '';

    const content = overlay.querySelector('.modal-content');
    if (content) {
      content.style.transition = 'none';
      content.style.transform = 'translateY(100%)';
      void content.offsetHeight; // Force reflow so Firefox registers start state
      content.style.transition = '';
      content.style.transform = ''; // Allow CSS rule to control final state
    }

    requestAnimationFrame(() => {
      overlay.classList.add('modal-visible');
    });
  }

  function hideModal() {
    window.__galleryModalOpen = false;

    const overlay = document.querySelector('.modal-overlay');
    overlay.classList.remove('modal-visible');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 400);
  }

  // ═══════════════════════════════════════════════════════════════
  // ANIMATIONS
  // ═══════════════════════════════════════════════════════════════

  function animateItemTransition(direction, onComplete) {
    const body = document.querySelector('.modal-body');
    const inner = document.querySelector('.modal-inner');

    // Fade out body
    body.classList.add('fade-out');

    // Slide out current content (slower, more visible)
    gsap.to(inner, {
      opacity: 0,
      x: direction === 'next' ? -50 : 50,
      duration: 0.5,
      ease: 'power2.in'
    });

    // Update content and fade back in
    setTimeout(() => {
      onComplete();
      body.classList.remove('fade-out');

      gsap.fromTo(
        inner,
        {
          opacity: 0,
          x: direction === 'next' ? 50 : -50
        },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: 'power2.out'
        }
      );
    }, 300);
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════

  function attachEventListeners() {
    const overlay = document.querySelector('.modal-overlay');
    if (!overlay) return;

    // Close button
    overlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    // Navigation buttons
    overlay.querySelector('.modal-next').addEventListener('click', nextItem);
    overlay.querySelector('.modal-prev').addEventListener('click', prevItem);

    // Keyboard navigation
    window.addEventListener('keydown', handleKeyDown);

    // Touch gestures
    overlay.addEventListener('touchstart', handleTouchStart, false);
    overlay.addEventListener('touchend', handleTouchEnd, false);

    // Hash navigation (restore modal if hash exists)
    window.addEventListener('hashchange', handleHashChange);

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  function handleKeyDown(e) {
    if (!modalState.type) return;

    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === 'ArrowRight') {
      nextItem();
    } else if (e.key === 'ArrowLeft') {
      prevItem();
    }
  }

  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (!modalState.type) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const minDistance = 50;

    // Swipe down to close
    if (deltaY > minDistance && Math.abs(deltaY) > Math.abs(deltaX)) {
      closeModal();
    }
    // Swipe left (next)
    else if (deltaX < -minDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      nextItem();
    }
    // Swipe right (prev)
    else if (deltaX > minDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      prevItem();
    }
  }

  function handleHashChange() {
    const hash = window.location.hash.slice(1);
    if (!hash && modalState.type) {
      closeModal();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPOSURE
  // ═══════════════════════════════════════════════════════════════

  return {
    init,
    openModal,
    closeModal,
    nextItem,
    prevItem,
    goToItem,
    getState: () => modalState
  };
})();

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ModalSystem.init());
} else {
  ModalSystem.init();
}
