/**
 * GRADIENT TOKENS — reads the theme's --grad-brand-N and --grad-text-N CSS
 * custom properties (tokens.css) and hands them to JS consumers in the
 * shapes each one needs: a raw hex triple, or gradflow's 3-tone
 * color1/color2/color3 shape (via GradflowColorCrossfade.tonesFrom(),
 * already loaded site-wide — reused rather than re-deriving tone math).
 *
 * Exposed as window.GradientTokens — plain namespaced global, same
 * no-build-step pattern as window.GradflowColorCrossfade/BackgroundLayer.
 */
(function () {
  'use strict';

  function readVar(varName) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return raw || null;
  }

  // 'brand' | 'text' -> [hex1, hex2, hex3], reading live (not cached) so a
  // theme toggle between calls is always picked up — same reasoning
  // gradflow-color-crossfade.js's own readCssColorRgb documents.
  function read(which) {
    var prefix = which === 'text' ? '--grad-text-' : '--grad-brand-';
    var stops = [readVar(prefix + '1'), readVar(prefix + '2'), readVar(prefix + '3')];
    return stops.filter(Boolean);
  }

  // 'brand' | 'text' -> gradflow's { color1, color2, color3 } tone shape.
  function toTones(which) {
    if (!window.GradflowColorCrossfade) return null;
    var hexes = read(which);
    if (!hexes.length) return null;
    var rgbs = window.GradflowColorCrossfade.extractRgbs(hexes.join(','));
    if (!rgbs.length) return null;
    return window.GradflowColorCrossfade.tonesFrom(rgbs);
  }

  window.GradientTokens = { read: read, toTones: toTones };
})();
