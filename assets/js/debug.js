/**
 * DEBUG UTILITY
 * Controls all console output globally
 * Toggle via window.DEBUG_SCROLL in devtools (defaults off)
 */

window.DEBUG_SCROLL = window.DEBUG_SCROLL || false;

function debug(prefix, message) {
  if (window.DEBUG_SCROLL) {
    console.log(`[${prefix}] ${message}`);
  }
}

function debugWarn(prefix, message) {
  if (window.DEBUG_SCROLL) {
    console.warn(`[${prefix}] ⚠️ ${message}`);
  }
}

function debugError(prefix, message) {
  // Always log errors, even in production
  console.error(`[${prefix}] ❌ ${message}`);
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debug, debugWarn, debugError };
}
