/**
 * DEVICE CAPABILITY — static, one-time detection (Adaptive Loading pattern)
 *
 * Checked ONCE at load, never polled/monitored during the session. Runtime
 * FPS monitoring is not a W3C/WCAG standard, is unreliable (background
 * tabs/processes/other tab activity skew it independent of actual device
 * capability), and reads as jarring to users ("why did my animation just
 * stop?"). This file exists so any heavy feature (particles today, anything
 * else later) can make a one-time decision instead of reinventing this.
 *
 * window.__prefersReducedMotion — WCAG 2.1 accessibility setting, NOT a
 * performance proxy. Always respect it regardless of hardware.
 *
 * window.__lowEndDevice — performance signal only. navigator.deviceMemory
 * is Chrome/Edge/Android-only (undefined in Safari and Firefox), so it's a
 * secondary signal, never the sole gate — treating "unsupported" as "not
 * low-end" would silently skip the check on an entire browser family.
 * navigator.hardwareConcurrency is the primary signal: broadly supported,
 * including Safari.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var hardwareConcurrency = navigator.hardwareConcurrency || 8; // assume capable if unknown
  var deviceMemory = navigator.deviceMemory; // undefined on Safari/Firefox

  var isLowEndHardware = hardwareConcurrency <= 4 || (typeof deviceMemory === 'number' && deviceMemory <= 4);

  // Old integrated-GPU check: pre-~2017 Intel iGPUs (HD Graphics 3000-6000,
  // Iris / Iris Pro) choke on fullscreen fill long before the CPU heuristics
  // above notice — e.g. a 2014 MacBook Pro i7 reports hardwareConcurrency=8
  // and sails past the core-count gate while its Iris Pro crawls. The
  // renderer string is the only honest signal for this class. Silently
  // skipped where the extension is blocked (privacy modes): no signal, no
  // downgrade.
  var gpuRenderer = '';
  if (!isLowEndHardware) {
    try {
      var glCanvas = document.createElement('canvas');
      var gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        var dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
        gpuRenderer = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
        // Iris Xe (2020+) is capable — the negative lookahead excludes it.
        if (/Intel.*(HD Graphics [3-6]\d{2,3}|Iris(?! ?Xe))/i.test(gpuRenderer)) {
          isLowEndHardware = true;
        }
        var loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();
      }
    } catch (e) { /* detection is best-effort */ }
  }

  window.__prefersReducedMotion = prefersReducedMotion;
  window.__lowEndDevice = isLowEndHardware;
  // DOM marker so stylesheets can degrade expensive effects (backdrop-filter
  // etc.) without any JS coupling — see the low-end block in main.css.
  if (isLowEndHardware) document.documentElement.classList.add('low-end');

  console.log(
    '[device-capability] hardwareConcurrency=' + hardwareConcurrency +
    ' deviceMemory=' + (deviceMemory === undefined ? 'unsupported' : deviceMemory) +
    ' prefersReducedMotion=' + prefersReducedMotion +
    ' gpu=' + (gpuRenderer || 'unknown') +
    ' → lowEndDevice=' + isLowEndHardware
  );
})();
