(function() { 'use strict';

function initThemeToggle() {
  const themeToggle = document.querySelector('.theme-toggle');
  if (!themeToggle) return;

  const sunIcon = themeToggle.querySelector('.theme-icon-sun');
  const moonIcon = themeToggle.querySelector('.theme-icon-moon');
  const html = document.documentElement;
  const STORAGE_KEY = 'theme-preference';
  const AUTO = 'auto';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY) || AUTO;
  }

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }

  function getActiveTheme(savedTheme) {
    if (savedTheme === AUTO) {
      return getSystemTheme();
    }
    return savedTheme;
  }

  function updateThemeIcon() {
    const currentTheme = getActiveTheme(localStorage.getItem(STORAGE_KEY) || AUTO);
    if (currentTheme === LIGHT) {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'inline';
    } else {
      sunIcon.style.display = 'inline';
      moonIcon.style.display = 'none';
    }
  }

  function updateHeroImage(activeTheme) {
    // Switch hero image based on theme
    const heroImg = document.getElementById('hero-portrait');
    if (heroImg) {
      if (activeTheme === LIGHT) {
        heroImg.src = heroImg.getAttribute('data-light-src');
      } else {
        heroImg.src = heroImg.getAttribute('data-dark-src');
      }
      console.log('[theme] Hero image switched to:', heroImg.src);
    }
  }

  function updateProfileImage(activeTheme) {
    // Switch profile image based on theme (uses data attrs, consistent with hero)
    const profileImg = document.querySelector('.profile-image-main');
    if (profileImg) {
      if (activeTheme === LIGHT) {
        profileImg.src = profileImg.getAttribute('data-light-src') || '/content/images/prem-back-light.png';
      } else {
        profileImg.src = profileImg.getAttribute('data-dark-src') || '/content/images/prem-front.png';
      }
      console.log('[theme] Profile image switched to:', profileImg.src);
    }
  }

  function setTheme(theme) {
    const activeTheme = getActiveTheme(theme);
    console.log('[setTheme]', { theme, activeTheme });
    if (activeTheme === LIGHT) {
      html.setAttribute('data-theme', LIGHT);
    } else {
      html.removeAttribute('data-theme');
    }
    localStorage.setItem(STORAGE_KEY, theme);
    updateThemeIcon();
    updateHeroImage(activeTheme);
    updateProfileImage(activeTheme);
    // Update inline styles to change background immediately (prevents color flash on theme switch)
    // Reads the single shared hex table (set by default.hbs's inline anti-flash
    // script) instead of keeping its own copy, so the two can't drift apart.
    const THEME_BG = window.__THEME_BG_COLORS__ || { light: '#FAFAF8', dark: '#1d1e1f' };
    const bg = activeTheme === LIGHT ? THEME_BG.light : THEME_BG.dark;
    html.style.backgroundColor = bg;
    // Deliberately NOT setting body background: body stays transparent so the
    // fixed #page-backdrop can paint the (shiftable) page background — an
    // inline body background here would sit above it in paint order and
    // silently disable the profile palette shift. See body rule in main.css.
    if (document.body && document.body.style.backgroundColor) {
      document.body.style.backgroundColor = ''; // clear any stale inline value
    }
    // Update meta tags so the browser color scheme matches the theme
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', bg);
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) metaScheme.setAttribute('content', activeTheme === LIGHT ? 'light' : 'dark');
    // Update particle colors to match new theme
    console.log('[setTheme] particleSystem exists?', !!window.particleSystem);
    console.log('[setTheme] updateColors method exists?', !!window.particleSystem?.updateColors);
    if (window.particleSystem && window.particleSystem.updateColors) {
      console.log('[setTheme] Calling updateColors()');
      window.particleSystem.updateColors();
    } else {
      console.warn('[setTheme] particleSystem.updateColors not available');
    }
    // Dispatch theme change event for listening components
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: activeTheme } }));
  }

  // data-theme is already resolved by the inline script in default.hbs, which
  // correctly applies: localStorage → @custom.color_scheme → system preference.
  // Reading it here ensures the Ghost admin setting is honoured on first load.
  const initialTheme = html.getAttribute('data-theme') === 'light' ? LIGHT : DARK;
  updateThemeIcon();
  updateHeroImage(initialTheme);
  updateProfileImage(initialTheme);

  themeToggle.addEventListener('click', () => {
    const currentSaved = localStorage.getItem(STORAGE_KEY) || DARK;
    let newTheme;

    // Cycle through: dark ↔ light (no auto)
    if (currentSaved === DARK) {
      newTheme = LIGHT;
    } else {
      newTheme = DARK;
    }

    console.log('%c[THEME TOGGLE]', 'color: #0FA2A2; font-weight: bold;', `${currentSaved} → ${newTheme}`);
    setTheme(newTheme);
  });

  function pinPortalIframes() {
    const iframes = document.querySelectorAll([
      'iframe[data-ghost-portal]',
      'iframe[src*="#/portal"]',
      'iframe[src*="ghost.io"]',
      '#ghost-portal-root iframe',
    ].join(', '));

    iframes.forEach(iframe => {
      iframe.style.setProperty('color-scheme', 'light', 'important');
      iframe.style.background = 'transparent';
    });
  }

  pinPortalIframes();

  const iframeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const addedFrames = [...mutation.addedNodes].filter(
        n => n.nodeType === 1 && (n.tagName === 'IFRAME' || n.querySelector?.('iframe'))
      );
      if (addedFrames.length > 0) {
        const newIframes = [];
        addedFrames.forEach(node => {
          if (node.tagName === 'IFRAME') {
            newIframes.push(node);
          } else {
            newIframes.push(...node.querySelectorAll('iframe'));
          }
        });

        newIframes.forEach(iframe => {
          iframe.style.visibility = 'hidden';
          iframe.style.opacity = '0';
          pinPortalIframes();
          setTimeout(() => {
            iframe.style.visibility = 'visible';
            iframe.style.opacity = '1';
            iframe.style.transition = 'opacity 0.2s ease-out';
          }, 50);
        });
        break;
      }
    }
  });

  iframeObserver.observe(document.body, { childList: true, subtree: true });
}

if (typeof window !== 'undefined') {
  window.initThemeToggle = initThemeToggle;
}

})();
