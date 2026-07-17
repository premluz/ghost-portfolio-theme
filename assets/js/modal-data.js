// ═══════════════════════════════════════════════════════════════
// MODAL DATA EXAMPLES
// ═══════════════════════════════════════════════════════════════

/**
 * Modal data structure:
 * {
 *   id: 'unique-id',           // For URL hash
 *   title: 'Modal Title',      // Optional title
 *   content: '...'             // HTML string or text
 * }
 */

// Example: Testimonials
const testimonialModals = [
  {
    id: 'testimonial-1',
    title: 'Bringing clarity & alignment',
    content: `
      <p>
        "His storytelling skills and ability to bring people along are
        genuinely impressive. He has a real talent for bringing clarity
        to ambiguous, fast-moving environments."
      </p>
      <p style="margin-top: 24px; font-weight: 600;">Paul Wilsher</p>
      <p style="color: var(--color-on-surface-variant); font-size: 14px;">
        Project Manager at Gala
      </p>
    `
  },
  {
    id: 'testimonial-2',
    title: 'Technical depth',
    content: `
      <p>
        "Przemek is an outstanding product designer with exceptional
        technical depth. His work ethic and collaborative approach make
        him invaluable to any team."
      </p>
      <p style="margin-top: 24px; font-weight: 600;">Matt Bindoff</p>
      <p style="color: var(--color-on-surface-variant); font-size: 14px;">
        Lead Engineer at Tracr
      </p>
    `
  },
  {
    id: 'testimonial-3',
    title: 'Strategic thinking',
    content: `
      <p>
        "What sets Przemek apart is his ability to think strategically
        while executing tactically. He's comfortable in ambiguity and
        thrives in fast-paced environments."
      </p>
      <p style="margin-top: 24px; font-weight: 600;">Sarah Chen</p>
      <p style="color: var(--color-on-surface-variant); font-size: 14px;">
        Product Lead at TechCorp
      </p>
    `
  }
];

// ═══════════════════════════════════════════════════════════════
// CONTACT FORM MODAL
// ═══════════════════════════════════════════════════════════════

const CONTACT_FORM_EMAIL = (document.body?.dataset?.contactEmail) || 'przemekluczak@duck.com';
const CONTACT_FORM_ENDPOINT = 'https://formsubmit.co/ajax/e7006f2cb920d1fc070c466e50d16f23';
const contactFormMarkup = `
  <div class="contact-form-wrapper">
    <p class="contact-form-intro">
      Let's talk about your next project or just say hello.
    </p>

    <form class="contact-form" data-contact-form data-to-email="${CONTACT_FORM_EMAIL}">
      <input
        type="text"
        name="name"
        placeholder="Your name"
        class="form-input"
        required
      >

      <input
        type="email"
        name="email"
        placeholder="Your email"
        class="form-input"
        required
      >

      <textarea
        name="message"
        placeholder="Your message"
        class="form-input"
        required
      ></textarea>

      <div class="contact-form-actions">
        <button
          type="submit"
          class="form-submit"
          aria-label="Send message"
        >
          →
        </button>
      </div>
    </form>

    <div class="contact-form-success" data-form-message hidden>
      <p>
        ✓ Message sent!
      </p>
      <p>
        Thanks for reaching out. I'll get back to you soon.
      </p>
    </div>
  </div>
`;

const contactFormModal = [
  {
    id: 'contact-form',
    title: 'Get in touch',
    content: contactFormMarkup
  }
];

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Open a modal with group navigation
 * Usage: openModalGroup('testimonials', testimonialModals, 0)
 */
function openModalGroup(groupId, items, initialIndex = 0) {
  ModalSystem.openModal('group', groupId, items, initialIndex);
}

/**
 * Open a single modal item
 * Usage: openModalSingle('info', [{id: 'x', title: 'X', content: '...'}])
 */
function openModalSingle(groupId, items) {
  ModalSystem.openModal('single', groupId, items, 0);
}

/**
 * Open contact form modal
 */
function openContactForm() {
  ModalSystem.openModal('single', 'contact', contactFormModal, 0);

  // Wire up form submission after modal renders
  setTimeout(() => {
    const modalForm = document.querySelector('.modal-inner [data-contact-form]');
    if (modalForm && typeof handleContactFormSubmit === 'function') {
      modalForm.addEventListener('submit', handleContactFormSubmit);
    }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// TESTIMONIAL MODAL
// ═══════════════════════════════════════════════════════════════

// Cache for testimonial content to avoid repeated fetches
const testimonialCache = new Map();
// Persistent items array to preserve content across modal opens
let testimonialItems = null;

/**
 * Build testimonial items array from all testimonial cards on page
 * @returns {Array} Items array for modal
 */
function buildTestimonialItems() {
  const cards = document.querySelectorAll('.testimonial-card');
  const newItems = Array.from(cards).map(card => ({
    title: '', // Empty - title is inside content via h2.testimonial-modal-title
    content: '<div class="testimonial-modal-loading">Loading...</div>',
    url: card.dataset.testimonialUrl,
    short: card.dataset.testimonialShort || ''
  }));

  // If we have cached items, merge cached content
  if (testimonialItems && testimonialItems.length === newItems.length) {
    newItems.forEach((item, index) => {
      const cachedItem = testimonialItems[index];
      if (cachedItem && !cachedItem.content.includes('Loading...')) {
        item.content = cachedItem.content;
        // Keep title empty - title is inside content
        item.title = '';
      }
    });
  }

  testimonialItems = newItems;
  return testimonialItems;
}

/**
 * Fetch full testimonial content from URL
 * @param {string} url - Post URL
 * @param {string} title - Post title to include above content
 * @returns {Promise<string>} HTML content
 */
async function fetchTestimonialContent(url, title = '') {
  const cacheKey = url + '::' + title;
  if (testimonialCache.has(cacheKey)) {
    return testimonialCache.get(cacheKey);
  }

  try {
    const response = await fetch(url);
    const html = await response.text();

    // Extract post content from the page
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Get the post title element from header (to include in modal as h2)
    const postTitleEl = doc.querySelector('.post-header .post-title') ||
                        doc.querySelector('h1.post-title') ||
                        doc.querySelector('article h1') ||
                        doc.querySelector('header h1');
    // Create h2 title inside data-page-content-width
    const postTitleHtml = postTitleEl ? `<h2 class="testimonial-modal-title">${postTitleEl.textContent.trim()}</h2>` : '';

    // Get post content - specifically .gh-content inside article, exclude header
    const contentEl = doc.querySelector('.gh-content') ||
                      doc.querySelector('.post-content') ||
                      doc.querySelector('article .content') ||
                      doc.querySelector('main .content');

    let content = contentEl ? contentEl.innerHTML : '';
    
    // If still empty, try getting article but exclude post-header
    if (!content) {
      const articleEl = doc.querySelector('article.post, article');
      if (articleEl) {
        // Clone to avoid modifying original
        const clone = articleEl.cloneNode(true);
        // Remove post-header from clone
        const headerEl = clone.querySelector('.post-header, header');
        if (headerEl) headerEl.remove();
        // Remove post-footer from clone
        const footerEl = clone.querySelector('.post-footer, footer');
        if (footerEl) footerEl.remove();
        content = clone.innerHTML;
      }
    }

    // Clean up - remove scripts, styles
    content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>.*?<\/style>/gi, '');

    // Wrap content in page-width container with h2 title at top
    content = `<div data-page-content-width="respect_page_width">${postTitleHtml}${content}</div>`;

    testimonialCache.set(cacheKey, content);
    return content;
  } catch (err) {
    console.error('[testimonial-modal] Error fetching content:', err);
    return '<p>Error loading testimonial content</p>';
  }
}

/**
 * Open testimonial modal with all testimonials
 * @param {string} clickedUrl - URL of clicked testimonial to show first
 */
async function openTestimonialModal(clickedUrl) {
  const items = buildTestimonialItems();
  if (items.length === 0) {
    // console.log('[testimonial-modal] No testimonial cards found');
    return;
  }

  // Find index of clicked testimonial
  const clickedIndex = testimonialItems.findIndex(item => item.url === clickedUrl);
  const startIndex = clickedIndex >= 0 ? clickedIndex : 0;

  // Open modal immediately with loading state
  ModalSystem.openModal('group', 'testimonials', testimonialItems, startIndex);

  // Fetch content for currently displayed item
  const currentItem = testimonialItems[startIndex];
  if (currentItem.url) {
    const content = await fetchTestimonialContent(currentItem.url, currentItem.title);

    // Update modal content if still on same item
    const overlay = document.querySelector('.modal-overlay');
    if (overlay && overlay.classList.contains('modal-visible')) {
      const inner = overlay.querySelector('.modal-inner');
      if (inner) {
        inner.innerHTML = content;
      }
    }

    // Update item in cache
    testimonialItems[startIndex].content = content;
    
    // Also update modal.js's internal items reference
    if (typeof ModalSystem !== 'undefined' && ModalSystem.getState) {
      const modalState = ModalSystem.getState();
      if (modalState && modalState.items && modalState.items[startIndex]) {
        modalState.items[startIndex].content = content;
      }
    }
  }

  function getTestimonialModalState() {
    if (typeof ModalSystem !== 'undefined' && ModalSystem.getState) {
      return ModalSystem.getState();
    }
    return JSON.parse(sessionStorage.getItem('modalState') || '{}');
  }

  // Listen for modal navigation to fetch content as needed
  const handleNav = async () => {
    const state = getTestimonialModalState();
    console.log('[testimonial-nav] handleNav called, state:', state);
    
    if (state.groupId === 'testimonials' && state.currentIndex !== undefined) {
      const item = testimonialItems[state.currentIndex];
      console.log('[testimonial-nav] Current item:', state.currentIndex, 'url:', item?.url, 'loading?', item?.content?.includes('Loading...'));
      
      if (item.url && item.content.includes('Loading...')) {
        console.log('[testimonial-nav] Fetching content for index', state.currentIndex);
        const content = await fetchTestimonialContent(item.url, item.title);
        item.content = content;

        // Update modal if still visible
        const overlay = document.querySelector('.modal-overlay');
        if (overlay && overlay.classList.contains('modal-visible')) {
          const inner = overlay.querySelector('.modal-inner');
          if (inner) {
            inner.innerHTML = content;
            console.log('[testimonial-nav] Updated modal content');
          }
          
          // Also update the modal's internal items array
          // This ensures next/prev navigation uses cached content
          if (typeof ModalSystem !== 'undefined' && ModalSystem.getState) {
            const modalState = ModalSystem.getState();
            console.log('[testimonial-nav] modalState:', modalState);
            if (modalState && modalState.groupId === 'testimonials' && modalState.items) {
              // Update the specific item in modal.js's internal array
              modalState.items[state.currentIndex].content = content;
              console.log('[testimonial-nav] Updated modal.js items array');
            }
          }
        }
      } else if (!item?.content?.includes('Loading...')) {
        // Content already loaded but modal might show stale "Loading..."
        const overlay = document.querySelector('.modal-overlay');
        if (overlay && overlay.classList.contains('modal-visible')) {
          const inner = overlay.querySelector('.modal-inner');
          if (inner && inner.innerHTML.includes('Loading...')) {
            inner.innerHTML = item.content;
            console.log('[testimonial-nav] Fixed stale Loading... display');
          }
        }
        console.log('[testimonial-nav] Item already loaded, synced if needed');
      }
    }
  };

  // Listen for navigation clicks
  document.addEventListener('click', (e) => {
    if (e.target.closest('.modal-next, .modal-prev')) {
      console.log('[testimonial-nav] Navigation clicked');
      setTimeout(handleNav, 450); // Wait for modal animation + state update
    }
  });

  // Also listen for modal inner content changes (backup for navigation)
  const modalOverlay = document.querySelector('.modal-overlay');
  if (modalOverlay) {
    const modalInner = modalOverlay.querySelector('.modal-inner');
    if (modalInner) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const state = getTestimonialModalState();
            if (state.groupId === 'testimonials') {
              console.log('[testimonial-nav] Modal content changed, index:', state.currentIndex);
              handleNav();
            }
          }
        });
      });
      observer.observe(modalInner, { childList: true });
      console.log('[testimonial-nav] MutationObserver attached');
    }
  }
}

/**
 * Initialize testimonial modal click handlers
 */
function initTestimonialModal() {
  const cards = document.querySelectorAll('.testimonial-card');

  cards.forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const url = card.dataset.testimonialUrl;
      if (url) {
        openTestimonialModal(url);
      }
    });
  });

  if (cards.length > 0) {
    console.log(`[testimonial-modal] Initialized ${cards.length} testimonial cards`);
  }
}

/**
 * Handle post-injected projectMeta configuration
 * Reads from window.projectMeta (set in post codeinjection_head)
 *
 * projectMeta fields:
 * - disable-link: true/false — Make card not clickable
 * - next-project: 'project-id' — Override next project navigation
 * - prev-project: 'project-id' — Override prev project navigation
 * - logomark: '/path/to/logo.svg' — Project logomark
 * - accentColor: '#HEX' — Project accent color
 * - longTitle: 'Full Project Title'
 * - projectCategory: 'Category Name' — Small text above longTitle, no margin
 * - client: 'Client Name'
 * - cardDescription: 'Project description'
 * - descBullet1/2/3: 'Bullet text' — Display as bullet points under cardDescription
 * - result: 'Project Result/Outcome'
 */
function getProjectMeta() {
  return window.projectMeta || {};
}

function isLinkDisabled() {
  const meta = getProjectMeta();
  return meta['disable-link'] === true;
}

function getNextProjectId() {
  const meta = getProjectMeta();
  return meta['next-project'];
}

function getPrevProjectId() {
  const meta = getProjectMeta();
  return meta['prev-project'];
}

/**
 * Initialize gallery modals for Ghost kg-gallery images
 */
function initGalleryModals() {
  const galleries = document.querySelectorAll('.kg-gallery-card, .kg-gallery-container');
  if (galleries.length === 0) return;

  galleries.forEach((gallery, galleryIndex) => {
    const images = gallery.querySelectorAll('.kg-gallery-image img');
    if (images.length === 0) return;

    // Build modal items array for this gallery
    const galleryItems = Array.from(images).map((img, index) => ({
      id: `gallery-${galleryIndex}-img-${index}`,
      title: img.alt || `Image ${index + 1}`,
      content: `
        <div class="gallery-modal-scroll" style="width: 100%; max-width: 100vw; height: 100vh; overflow-y: auto; overflow-x: hidden; display: flex; justify-content: center; padding: var(--space-lg);">
          <img src="${img.src}" alt="${img.alt || ''}" class="gallery-modal-image" style="width: 100%; height: auto; max-width: 100%; object-fit: contain;">
        </div>
      `
    }));

    // Add click handler to each image
    images.forEach((img, index) => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ModalSystem.openModal('group', `gallery-${galleryIndex}`, galleryItems, index);
      });
    });
  });

  console.log('[gallery-modal] ✅ Initialized', galleries.length, 'galleries');
}

/**
 * Handle contact form submission — Send to account email
 */
function handleContactFormSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const name = formData.get('name');
  const email = formData.get('email');
  const message = formData.get('message');
  const customEndpoint = form.getAttribute('data-contact-endpoint');
  const endpoint = customEndpoint || CONTACT_FORM_ENDPOINT;
  const successMessage = form.closest('.contact-form-wrapper')?.querySelector('[data-form-message]');

  // Simple validation
  if (!name || !email || !message) {
    alert('Please fill in all fields');
    return;
  }

  if (!endpoint) {
    alert('Contact form is not configured correctly.');
    return;
  }

  // Show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  // Send email via FormSubmit (auto-sends to Ghost admin email)
  const payload = new URLSearchParams();
  payload.append('name', name);
  payload.append('email', email);
  payload.append('message', message);
  payload.append('reply_to', email);
  payload.append('_subject', `New inquiry from ${name}`);

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json'
    },
    body: payload
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      const success = data?.success === true || data?.success === 'true';
      if (success) {
        // Hide form, show confirmation
        form.style.display = 'none';
        if (successMessage) {
          successMessage.hidden = false;
        }
        console.log('[contact] Message sent successfully from', name);
      } else {
        const errorMessage = data?.message || 'Failed to send message. Please try again.';
        alert(errorMessage);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    })
    .catch(err => {
      console.error('[contact] Submission failed:', err);
      alert('Error sending message. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    });
}
