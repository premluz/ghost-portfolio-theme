(function() { 'use strict';/**
 * CONSTANTS
 * Central configuration for all magic numbers and hardcoded values
 * Single source of truth for timing, thresholds, and measurements
 */

// ═════════════════════════════════════════════════════════════
// DEVICE & VIEWPORT
// ═════════════════════════════════════════════════════════════

/**
 * Canonical breakpoints for responsive design.
 * Shared reference for both CSS and JS decision points.
 * CSS-only breakpoints (600px, 780px, 900px, 960px, 1025px) are defined
 * in their respective component stylesheets and do not appear here.
 */
const BREAKPOINTS = {
  MOBILE_SMALL: 480,      // Mobile small (e.g., 320px devices at max)
  MOBILE_MEDIUM: 640,     // Mobile medium (e.g., 375px+ devices)
  TABLET: 768,            // Tablet (e.g., iPad, larger phones)
  DESKTOP: 1024,          // Desktop (e.g., laptops, 1024px+)
  LARGE_DESKTOP: 1440,    // Large desktop (e.g., 4K monitors, ultrawide)
};

// Legacy alias for backwards compatibility
const DEVICE = {
  MOBILE_BREAKPOINT: BREAKPOINTS.TABLET,      // 768
  TABLET_BREAKPOINT: BREAKPOINTS.DESKTOP,     // 1024
  LARGE_BREAKPOINT: BREAKPOINTS.LARGE_DESKTOP, // 1440
};

// ═════════════════════════════════════════════════════════════
// TIMING (milliseconds)
// ═════════════════════════════════════════════════════════════

const TIMINGS = {
  // Scroll handling
  SCROLL_LOCK_DURATION: 500,
  SCROLL_HASH_DELAY: 100,
  SCROLL_UNLOCK: 500,

  // Initialization
  METADATA_POLL_INTERVAL: 100,
  METADATA_POLL_TIMEOUT: 10000,
  PARTICLE_SYSTEM_INIT_DELAY: 500,
  CARD_ANIMATIONS_INIT_DELAY: 150,

  // Animations
  PARTICLE_MORPH_DURATION: 500,
  CARD_ANIMATION_DURATION: 600,
  FADE_DURATION: 1500,
  TOOLTIP_DELAY: 500,
  MODAL_ANIMATION: 300,

  // Debouncing
  RESIZE_DEBOUNCE: 200,
  SCROLL_DEBOUNCE: 100,
  INPUT_DEBOUNCE: 300,
};

// ═════════════════════════════════════════════════════════════
// ANIMATION CONFIG
// ═════════════════════════════════════════════════════════════

const ANIMATIONS = {
  // Easing functions
  EASING_DEFAULT: 'power3.out',
  EASING_SMOOTH: 'power4.out',
  EASING_ELASTIC: 'power2.inOut',

  // Particle system
  PARTICLE_COUNT_DESKTOP: 2000,
  PARTICLE_COUNT_MOBILE: 1500,
  PARTICLE_SIZE_SCALE_MOBILE: 0.7,
  PARTICLE_SIZE_SCALE_DESKTOP: 1.0,

  // Card animations
  CARD_SLIDE_DISTANCE: 100,
  CARD_STAGGER_DELAY: 0.2,
  CARD_CONTENT_DURATION: 0.8,
  CARD_IMAGE_DURATION: 0.8,
};

// ═════════════════════════════════════════════════════════════
// OBSERVER THRESHOLDS (IntersectionObserver)
// ═════════════════════════════════════════════════════════════

const OBSERVER_THRESHOLDS = {
  HERO_SECTION: 0.1,
  STATEMENT_SLIDE: 0.5,
  CARD_MORPH: 0.3,
  TABS_SECTION: 0.1,
};

// ═════════════════════════════════════════════════════════════
// PARTICLE CAMERA POSITIONING
// ═════════════════════════════════════════════════════════════

const PARTICLE_CAMERA = {
  Z_POSITION_MOBILE: 4,
  Z_POSITION_DESKTOP: 8,
  FOV: 75,
  NEAR_PLANE: 0.1,
  FAR_PLANE: 1000,
};

// ═════════════════════════════════════════════════════════════
// SHADER CONSTANTS
// ═════════════════════════════════════════════════════════════

const SHADER = {
  SIZE_BASE: 0.1,
  DEPTH_SCALE: 300.0,
  BOKEH_THRESHOLD: 0.5,
  CORE_MASK_EXPONENT: 4.0,
  BOKEH_MASK_EXPONENT: 2.0,
};

// ═════════════════════════════════════════════════════════════
// SCROLL ANIMATION PAUSES & EASING
// Scalable pause + speed + easing for pinned scroll sequences
// Industry-standard pattern: timeline markers + ease variations
// ═════════════════════════════════════════════════════════════

const SCROLL_ANIMATION_PAUSES = {
  // HERO SEQUENCE: per-phrase control (0=Opportunity, 1=I transform, 2=Clarity, 3=future)
  // pausePercentages: % of scroll budget to hold before exit (0-100)
  // speedFactors: scroll speed multiplier (1=normal, 0.8=20% slower, 1.2=20% faster)
  // eases: animation easing for each phase (entrance, pause, exit)
  HERO_PHRASE_PAUSES: [0, 0, 20, 20],
  HERO_PHRASE_SPEEDS: [1, 1, 0.8, 0.8],  // slow down slides 2-3 for emphasis
  HERO_PHRASE_EASES: {
    entrance: 'power2.out',
    pause: 'none',
    exit: 'power3.in'  // decelerate on exit
  },

  // OPERATING MODEL: pause after entrance
  OPERATING_MODEL_PAUSE_PERCENTAGE: 0.4,
  OPERATING_MODEL_SPEED: 1,
  OPERATING_MODEL_EASES: {
    entrance: 'power3.out',
    pause: 'none',
    exit: 'power2.in'
  },
};

// ═════════════════════════════════════════════════════════════
// BLOOM & POST-PROCESSING
// ═════════════════════════════════════════════════════════════

const BLOOM = {
  STRENGTH_DESKTOP: 0.6,
  STRENGTH_MOBILE: 0.3,
  RADIUS_DESKTOP: 0.7,
  RADIUS_MOBILE: 0.4,
  THRESHOLD: 0.92,
  TONE_MAPPING_EXPOSURE: 1.0,
};

// ═════════════════════════════════════════════════════════════
// DEVICE PIXEL RATIO
// ═════════════════════════════════════════════════════════════

const DPR = {
  MAX: 2,  // Cap at 2x for mobile performance
};

// ═════════════════════════════════════════════════════════════
// API & ENDPOINTS
// ═════════════════════════════════════════════════════════════

const API = {
  GHOST_CONTENT_KEY: '53c1eef4fff835def4f59619d6',
  GHOST_API_ENDPOINT: '/ghost/api/content/posts/',
  GHOST_API_FIELDS: 'id,url,title',
};

// ═════════════════════════════════════════════════════════════
// CSS SELECTORS (centralized for easy refactoring)
// ═════════════════════════════════════════════════════════════

const SELECTORS = {
  // Layout
  BODY: 'body',
  MAIN: 'main',
  FOOTER: 'gh-footer',
  NAVIGATION: '.gh-nav',

  // Particles
  PARTICLE_CONTAINER: '#particles',
  PARTICLE_DEMO: '#particle-morph-demo',
  PARTICLE_DEBUG: '#particle-debug',

  // Sections
  HOME_SECTION: '.home',
  HERO_SECTION: '[data-section="hero"]',
  HELIX_SECTION: '#helix',
  STATEMENT_SLIDE: '.statement-slide-main',
  TABS_SECTION: '.posts-tabs-section',

  // Cards
  POST_CARD: '.post-card',
  POST_CARD_CONTENT: '.post-card-content',
  POST_CARD_IMAGE: '.post-card-image',

  // Theme & UI
  THEME_TOGGLE: '[data-toggle-theme]',
  THEME_PREFERENCE: 'theme-preference',
  SCROLL_PROGRESS: '.scroll-progress',

  // Modal
  MODAL_TRIGGER: '[data-modal]',
  MODAL_CONTENT: '.modal-content',

  // Buttons
  CLOSE_BUTTON: '[data-close]',
  BUTTON: 'button',
};

// ═════════════════════════════════════════════════════════════
// DATA ATTRIBUTES
// ═════════════════════════════════════════════════════════════

const DATA_ATTR = {
  CARD_ID: 'cardid',
  MODAL_ID: 'modal',
  SCROLL_DISTANCE: 'scroll-distance',
  ANIMATION_TYPE: 'card-animation',
  TOGGLE_THEME: 'toggle-theme',
};

// ═════════════════════════════════════════════════════════════
// CSS CLASSES
// ═════════════════════════════════════════════════════════════

const CLASSES = {
  ACTIVE: 'active',
  VISIBLE: 'visible',
  HIDDEN: 'hidden',
  READY: 'is-ready',
  LOADING: 'is-loading',
  DARK: 'dark',
  LIGHT: 'light',
};

// ═════════════════════════════════════════════════════════════
// COLORS
// ═════════════════════════════════════════════════════════════

const COLORS = {
  CYAN: { r: 0.29, g: 0.82, b: 1.0 },
  WHITE: { r: 1.0, g: 1.0, b: 1.0 },
  TRANSPARENT: 0x000000,
};

// ═════════════════════════════════════════════════════════════
// LOCAL STORAGE KEYS
// ═════════════════════════════════════════════════════════════

const STORAGE = {
  THEME_PREFERENCE: 'theme-preference',
  USER_PREFERENCES: 'user-prefs',
};
window.DEVICE = DEVICE;
window.TIMINGS = TIMINGS;
window.ANIMATIONS = ANIMATIONS;
window.OBSERVER_THRESHOLDS = OBSERVER_THRESHOLDS;
window.PARTICLE_CAMERA = PARTICLE_CAMERA;
window.SHADER = SHADER;
window.SCROLL_ANIMATION_PAUSES = SCROLL_ANIMATION_PAUSES;
window.BLOOM = BLOOM;
window.DPR = DPR;
window.API = API;
window.SELECTORS = SELECTORS;
window.DATA_ATTR = DATA_ATTR;
window.CLASSES = CLASSES;
window.COLORS = COLORS;
window.STORAGE = STORAGE;
})();
