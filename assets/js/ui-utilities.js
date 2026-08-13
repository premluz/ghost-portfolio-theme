(function() { 'use strict';

function initNavScrollBehavior() {
  const nav = document.querySelector('.gh-navigation');
  if (!nav) return;

  const isHomepage = document.body.classList.contains('home') ||
                     window.location.pathname === '/' ||
                     window.location.pathname.endsWith('/index.html');

  // ── Nav gradient fade on scroll — commented out for now ────────────────
  // Faded the ::before/::after tint from opacity 0 at top to 1 when
  // scrolled past ~100px. Disabled per explicit request now that the
  // progressive-blur layers (.nav-progressive-blur, main.css) are always
  // on regardless of scroll — leaving this active meant the tint stayed
  // invisible at the top of the page while the blur layers were already
  // visible, an inconsistent mismatched combo. --nav-gradient-opacity's
  // static value is now 1 (main.css's .gh-navigation rule) instead of the
  // 0 this used to force on load.
  //
  // const setGradientOpacity = (scrollY) => {
  //   const opacity = Math.min(1, scrollY / 100);
  //   nav.style.setProperty('--nav-gradient-opacity', opacity);
  // };
  // setGradientOpacity(0);
  // let gradientRafPending = false;
  // const updateNavGradientOpacity = () => {
  //   if (gradientRafPending) return;
  //   gradientRafPending = true;
  //   requestAnimationFrame(() => {
  //     gradientRafPending = false;
  //     setGradientOpacity(window.scrollY);
  //   });
  // };
  // window.addEventListener('scroll', updateNavGradientOpacity, { passive: true });

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

// initCustomScrollbar() REMOVED (2026-08-09) — was writing
// --scroll-thumb-top/--scroll-thumb-height to <html>'s inline style on
// EVERY scroll frame, unthrottled (no quantize, no zone gating), on every
// page, forever. Neither custom property has a CSS consumer anywhere in the
// codebase (grepped main.css and every partial: zero matches) — the actual
// custom-scrollbar CSS this was built for is gone, this handler just kept
// running for it.
//
// Measured while investigating a persistent nav/blur-pane flicker: over
// ~1s of scrolling on /about/, this fired 46 times each (92 total) —
// nearly 3x the already-quantized --profile-shift writes (16) from the
// SAME <html> element in the same window. Writing to <html>'s inline style
// attribute invalidates style resolution for the whole document subtree,
// so an unthrottled, purposeless writer at that scope was pure waste
// competing with every other scroll-driven write on the page for no
// visual benefit. See OPTIMIZATIONS.md §2A for the broader flicker
// investigation this was found during.

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
  window.initScrollbarHover = initScrollbarHover;
  window.initMobileMenu = initMobileMenu;
}

})();
