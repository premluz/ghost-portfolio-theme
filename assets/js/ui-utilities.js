(function() { 'use strict';

function initNavScrollBehavior() {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const isHomepage = document.body.classList.contains('home') ||
                     window.location.pathname === '/' ||
                     window.location.pathname.endsWith('/index.html');

  // ── Anchor-redirect handler (all pages) ───────────────────────────────
  // #hash nav links on non-homepage pages redirect to / and scroll after load.
  const navLinks = nav.querySelectorAll('a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        if (!isHomepage) {
          e.preventDefault();
          sessionStorage.setItem('scrollToAnchor', href.substring(1));
          window.location.href = window.location.origin + '/';
        }
      }
    });
  });

  if (isHomepage) {
    const anchorId = sessionStorage.getItem('scrollToAnchor');
    if (anchorId) {
      sessionStorage.removeItem('scrollToAnchor');
      setTimeout(() => {
        const el = document.getElementById(anchorId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  // ── Scroll-hide behavior: homepage only ───────────────────────────────
  // Disabled for now — turns off the nav shrink-on-scroll (menu items,
  // theme toggle, glass pill, and logo minimize-to-badge all key off the
  // .nav-hidden class this used to toggle; see main.css's stagger-mode
  // rules and the LOGO MINIMIZE/EXPAND block). Nav just stays in its
  // normal expanded state regardless of scroll now. Anchor-redirect
  // handling above is untouched — only this part is commented out.
  /*
  // Other pages: nav is always visible, no scroll interaction.
  // Homepage:
  //   • Entrance slide-down on load is handled by the preloader (html.page-ready
  //     triggers the navSlideDown CSS animation on .gh-navigation).
  //   • Stagger mode: nav bar stays fixed; only menu items slide-left + fade
  //     on scroll-down, reverse on scroll-up. CSS handles visuals, JS adds class.
  if (!isHomepage) return;

  nav.setAttribute('data-nav-hide-mode', 'stagger');

  let lastScrollY = 0;
  let isNavHovered = false;
  let lastAnchorClickTime = 0;

  nav.addEventListener('mouseenter', () => {
    isNavHovered = true;
    nav.classList.remove('nav-hidden');
  });
  nav.addEventListener('mouseleave', () => {
    isNavHovered = false;
  });

  let _navRafPending = false;
  document.addEventListener('scroll', () => {
    if (_navRafPending) return;
    _navRafPending = true;
    requestAnimationFrame(() => {
      _navRafPending = false;
      const currentScrollY = window.scrollY;
      const timeSinceAnchorClick = Date.now() - lastAnchorClickTime;
      const shouldPreventHide = isNavHovered || timeSinceAnchorClick < 1000;
      if (currentScrollY > lastScrollY && !shouldPreventHide) {
        nav.classList.add('nav-hidden');
      } else {
        nav.classList.remove('nav-hidden');
      }
      lastScrollY = currentScrollY;
    });
  }, { passive: true });
  */
}

function initCustomScrollbar() {
  const html = document.documentElement;

  function updateThumb() {
    const scrollTop = window.scrollY;
    const scrollHeight = html.scrollHeight;
    const clientHeight = html.clientHeight;
    const scrollable = scrollHeight - clientHeight;

    if (scrollable <= 0) {
      html.style.setProperty('--scroll-thumb-height', '0');
      return;
    }

    const thumbHeightPct = Math.max(8, (clientHeight / scrollHeight) * 100);
    const trackSpace = 100 - thumbHeightPct;
    const thumbTopPct = (scrollTop / scrollable) * trackSpace;

    html.style.setProperty('--scroll-thumb-top', thumbTopPct.toFixed(2));
    html.style.setProperty('--scroll-thumb-height', thumbHeightPct.toFixed(2));
  }

  updateThumb();

  let _sbRafPending = false;
  const scheduleThumb = () => {
    if (_sbRafPending) return;
    _sbRafPending = true;
    requestAnimationFrame(() => { _sbRafPending = false; updateThumb(); });
  };
  window.addEventListener('scroll', scheduleThumb, { passive: true });
  if (window.resizeManager) window.resizeManager.subscribe('scrollbar-thumb', scheduleThumb);
  else window.addEventListener('resize', scheduleThumb, { passive: true });
}

function initScrollbarHover() {
  const scrollableElements = document.querySelectorAll('.sticky-nav, .post-toc-nav');

  scrollableElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      el.classList.add('scrollbar-visible');
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('scrollbar-visible');
    });
  });
}

function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger');
  const navMenuMobile = document.querySelector('.nav-menu-mobile');
  if (!hamburger || !navMenuMobile) return;

  const mobileLinks = navMenuMobile.querySelectorAll('a');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenuMobile.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', hamburger.classList.contains('active'));
  });

  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navMenuMobile.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenuMobile.classList.contains('active')) {
      hamburger.classList.remove('active');
      navMenuMobile.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

if (typeof window !== 'undefined') {
  window.initNavScrollBehavior = initNavScrollBehavior;
  window.initCustomScrollbar = initCustomScrollbar;
  window.initScrollbarHover = initScrollbarHover;
  window.initMobileMenu = initMobileMenu;
}

})();
