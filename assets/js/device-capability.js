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
  // SOFTWARE RENDERING (no GPU acceleration at all) — a separate signal from
  // the "weak GPU" heuristics above, and a much harsher one: EVERY composite,
  // blur and blend runs on the CPU. Measured live on an M3 Max with Chrome's
  // GPU process disabled: ~4-6fps with 160-300ms worst frames on this site,
  // while Firefox and Dia (separate GPU stacks) stayed smooth on the same
  // machine — i.e. entirely a rendering-path problem, not a hardware one.
  //
  // Detection: when acceleration is off, getContext('webgl') returns null
  // outright (verified against chrome://gpu reporting "GPU process was unable
  // to boot"). A null context was previously just skipped by the `if (gl)`
  // guard below, so this population got NO downgrade at all — the exact gap
  // this fixes. SwiftShader/llvmpipe (software GL implementations that DO
  // return a context) are caught by the renderer-string test instead.
  //
  // Deliberately folded into the same isLowEndHardware flag rather than a
  // parallel one: html.low-end already strips every backdrop-filter site-wide
  // (main.css) plus the particle/scrub degradations, which is exactly the
  // treatment this case wants. One tier, one code path, no second system to
  // keep in sync.
  var gpuRenderer = '';
  var softwareRendered = false;
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
        // Software GL: Chrome's SwiftShader fallback, Mesa's llvmpipe, or a
        // generic "Software"/"Microsoft Basic Render" string. These return a
        // working context, so only the renderer name gives them away.
        if (/SwiftShader|llvmpipe|software|Microsoft Basic Render/i.test(gpuRenderer)) {
          softwareRendered = true;
          isLowEndHardware = true;
        }
        var loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();
      } else {
        // No WebGL context at all — acceleration is off (or WebGL is blocked).
        // Either way the compositor is on the CPU path, so degrade.
        softwareRendered = true;
        isLowEndHardware = true;
        gpuRenderer = 'none (no webgl context)';
      }
    } catch (e) { /* detection is best-effort */ }
  }

  window.__prefersReducedMotion = prefersReducedMotion;
  window.__lowEndDevice = isLowEndHardware;
  // DOM marker so stylesheets can degrade expensive effects (backdrop-filter
  // etc.) without any JS coupling — see the low-end block in main.css.
  if (isLowEndHardware) document.documentElement.classList.add('low-end');
  // Separate marker as well as the shared .low-end class: this tier wants the
  // same CSS degradations, but a stylesheet may eventually want to target
  // "no GPU at all" specifically (e.g. dropping a WebGL canvas entirely rather
  // than just simplifying it), and JS can gate on window.__softwareRendered
  // without re-running detection.
  window.__softwareRendered = softwareRendered;
  if (softwareRendered) document.documentElement.classList.add('software-rendered');

  console.log(
    '[device-capability] hardwareConcurrency=' + hardwareConcurrency +
    ' deviceMemory=' + (deviceMemory === undefined ? 'unsupported' : deviceMemory) +
    ' prefersReducedMotion=' + prefersReducedMotion +
    ' gpu=' + (gpuRenderer || 'unknown') +
    ' softwareRendered=' + softwareRendered +
    ' → lowEndDevice=' + isLowEndHardware
  );
})();
