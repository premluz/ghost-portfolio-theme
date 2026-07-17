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
    const modalHTML = `
      <div class="modal-overlay" style="display:none;">
        <div class="modal-content">
          <div class="modal-body">
            <h2 class="modal-title" style="display:none;"></h2>
            <div class="modal-inner"></div>
          </div>

          <div class="modal-actions">
            <div class="modal-nav-controls" style="display:none;">
              <button class="modal-nav-btn modal-prev" aria-label="Previous">←</button>
              <span class="modal-page-indicator"></span>
              <button class="modal-nav-btn modal-next" aria-label="Next">→</button>
            </div>
            <button class="modal-close-btn" aria-label="Close">✕</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
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
    const navControls = overlay.querySelector('.modal-nav-controls');
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

    // Show nav for group modals with multiple items
    if (modalState.type === 'group' && modalState.items.length > 1) {
      navControls.style.display = '';
      pageIndicator.textContent = `${modalState.currentIndex + 1} / ${modalState.items.length}`;
    } else {
      navControls.style.display = 'none';
    }
  }

  function showModal() {
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
