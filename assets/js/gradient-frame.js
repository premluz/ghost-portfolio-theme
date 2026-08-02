(function() { 'use strict';

// GRADIENT FRAME — wraps any content with an animated GradFlow gradient
// band above and below it. Both bands are injected here as normal-flow
// divs (never absolutely positioned over the content, which is what used
// to clip the content and get clipped itself at the section's edge).
//
// Each band takes FOUR colors: the page background at its outer edge, two
// wave colors for the animated core, and the frame's own background at the
// edge touching the content — so a band fades out cleanly at BOTH ends
// (see gradflow-shaders.js's waveGradient for why 3 colors couldn't).
// The two bands are mirror images: whichever end faces away from the
// content gets the page color.
//
// ── TWO MODES (data-gradient-mode) ────────────────────────────────────
//
// "theme" (default) — the band stays inside the CURRENT theme's tonality.
//   Both outer and inner edges are --color-background, so nothing about
//   the page needs to change: no palette flip, nav/text keep their normal
//   colors, and the whole thing works identically in light and dark.
//
// "invert" — the frame becomes a self-contained island of the OPPOSITE
//   palette (light page => dark island, dark page => light island), and
//   drives the site's existing palette-shift so the fixed nav, body text,
//   icons and the nav's glass tint all follow it. That shift is not
//   reimplemented here: it is BackgroundLayer.bindShift() writing
//   --profile-shift, exactly as .profile does on the about page — every
//   `color-mix(..., var(--shift-ink) calc(var(--profile-shift) * 100%))`
//   rule already in main.css reacts for free. Inner edge is --shift-bg
//   (tokens.css flips it per theme), so the island is always the reverse
//   of wherever the visitor has the site set.
//
// A FIXED palette (identical in both themes) is not a third mode — it is
// "invert" plus a CSS override of the shift tokens, authored by the page
// that wants it. There used to be a JS "fixed" mode that pinned these at
// :root itself; it needed a colour-luminance heuristic to pick the icon
// polarity and did a page-global write from a component. Declaring them in
// CSS is the same result with none of that:
//
//   :root:has(#my-section) {
//     --shift-bg:  #2A0F42;
//     --shift-ink: #ffffff;
//     --icon-invert-shift: 1;      /* white icons on the island */
//     --icon-brightness-shift: 1.2;
//   }
//
// The :has() selector outranks both theme blocks, so the palette survives a
// theme toggle — which is what "fixed" meant. --surface-1-shift and
// --glass-bg-shift derive from --shift-ink, so they follow automatically.
//
// Usage — no per-section JS, this file auto-initializes every instance:
//   <div class="gradient-frame" data-gradient-frame
//        data-gradient-mode="invert"
//        data-gradient-wave-a="#61177c"
//        data-gradient-wave-b="#2e073e">
//     ...any content...
//   </div>
//
// Any color value may be a literal (#61177c) OR a custom property name
// (--color-background), which is read live and re-read on theme change.
// Optional: data-gradient-outer, data-gradient-inner (override the mode's
// defaults), data-gradient-speed, data-gradient-scale (wave squiggliness),
// data-gradient-enter-span / -exit-span (ramp length in viewport heights),
// data-gradient-wave2-a/-b/-opacity/-scale/-speed/-center/-width and
// data-gradient-parallax / -wave2-parallax (second wave layer).
// Band height is CSS: --gradient-frame-edge-height (gradient-frame.css).

const MODE_COLORS = {
  theme: { outer: '--color-background', inner: '--color-background' },
  invert: { outer: '--color-background', inner: '--shift-bg' },
};

const DEFAULTS = {
  waveA: '#61177c',
  waveB: '#2e073e',
  speed: 0.7,
  scale: 0.5,
  // Ramp lengths in viewport heights. bindShift's geometric default is 1
  // (the full crossing), which reads as slow and late here: at 1 the enter
  // ramp only completes once the frame's top edge reaches the viewport TOP,
  // by which point the island has filled the screen and the palette is
  // visibly still catching up. Half a viewport puts the change where the
  // eye expects it and shortens the window in which every shift-aware rule
  // is being recomputed per frame.
  enterSpan: 0.5,
  exitSpan: 0.5,
  // Fraction of device pixels the bands render at (see
  // gradflow-background.js). waveGradient is resolution-independent, so
  // this only changes sampling density.
  resolutionScale: 0.35,

  // SECOND WAVE — composited inside the same shader (not a second canvas),
  // so it costs a handful of extra sin() calls per fragment rather than
  // another GL context and rAF loop. Defaults reuse the base wave's two
  // colours at partial opacity, which is the "same colours, different
  // opacity" case; give wave2A/wave2B to make it its own pair.
  // A different SCALE is the point: at another frequency the two curves
  // cross instead of sitting on top of each other.
  wave2Opacity: 0.55,
  wave2Scale: 1.4,
  wave2Speed: 0.45,
  wave2Center: 0.52,  // where the band sits vertically, 0 = bottom edge
  wave2Width: 0.34,
  // Parallax in viewport heights of scroll. Different factors make the two
  // drift past each other as the page moves; both 0 disables the scroll
  // read entirely.
  parallax: 0.05,
  wave2Parallax: -0.09,
};

// Any '--foo' resolves against the frame so per-section token overrides
// work; everything else is passed through to the shader untouched.
function resolveColor(value, frame) {
  if (typeof value !== 'string' || value.slice(0, 2) !== '--') return value;
  const resolved = getComputedStyle(frame).getPropertyValue(value).trim();
  return resolved || '#000000';
}

function readConfig(frame) {
  const d = frame.dataset;
  const mode = MODE_COLORS[d.gradientMode] ? d.gradientMode : 'theme';
  const speed = parseFloat(d.gradientSpeed);
  const scale = parseFloat(d.gradientScale);
  const enterSpan = parseFloat(d.gradientEnterSpan);
  const exitSpan = parseFloat(d.gradientExitSpan);
  const resolutionScale = parseFloat(d.gradientResolutionScale);
  const num = (v, fallback) => { const n = parseFloat(v); return isNaN(n) ? fallback : n; };
  return {
    mode: mode,
    outer: d.gradientOuter || MODE_COLORS[mode].outer,
    inner: d.gradientInner || MODE_COLORS[mode].inner,
    waveA: d.gradientWaveA || DEFAULTS.waveA,
    waveB: d.gradientWaveB || DEFAULTS.waveB,
    speed: isNaN(speed) ? DEFAULTS.speed : speed,
    scale: isNaN(scale) ? DEFAULTS.scale : scale,
    enterSpan: isNaN(enterSpan) ? DEFAULTS.enterSpan : enterSpan,
    exitSpan: isNaN(exitSpan) ? DEFAULTS.exitSpan : exitSpan,
    resolutionScale: isNaN(resolutionScale) ? DEFAULTS.resolutionScale : resolutionScale,
    wave2A: d.gradientWave2A || null,
    wave2B: d.gradientWave2B || null,
    wave2Opacity: num(d.gradientWave2Opacity, DEFAULTS.wave2Opacity),
    wave2Scale: num(d.gradientWave2Scale, DEFAULTS.wave2Scale),
    wave2Speed: num(d.gradientWave2Speed, DEFAULTS.wave2Speed),
    wave2Center: num(d.gradientWave2Center, DEFAULTS.wave2Center),
    wave2Width: num(d.gradientWave2Width, DEFAULTS.wave2Width),
    parallax: num(d.gradientParallax, DEFAULTS.parallax),
    wave2Parallax: num(d.gradientWave2Parallax, DEFAULTS.wave2Parallax),
  };
}

// waveGradient puts color1 at the band's BOTTOM edge and color4 at its TOP
// edge, so the top band (page above it, content below it) and the bottom
// band (content above, page below) are exact mirrors of each other.
function bandConfig(cfg, position, frame) {
  const outer = resolveColor(cfg.outer, frame);
  const inner = resolveColor(cfg.inner, frame);
  const edges = position === 'top'
    ? { color1: inner, color4: outer }
    : { color1: outer, color4: inner };
  return Object.assign({
    color2: resolveColor(cfg.waveA, frame),
    color3: resolveColor(cfg.waveB, frame),
    speed: cfg.speed,
    scale: cfg.scale,
    type: 'wave',
    noise: 0,
    resolutionScale: cfg.resolutionScale,
    parallax: cfg.parallax,
    layer2: cfg.wave2Opacity > 0 ? {
      color1: resolveColor(cfg.wave2A || cfg.waveA, frame),
      color2: resolveColor(cfg.wave2B || cfg.waveB, frame),
      opacity: cfg.wave2Opacity,
      scale: cfg.wave2Scale,
      speed: cfg.wave2Speed,
      center: cfg.wave2Center,
      width: cfg.wave2Width,
      parallax: cfg.wave2Parallax,
    } : null,
  }, edges);
}

function paintBand(band, config) {
  // Static fallback under the canvas: covers the moment before ogl loads,
  // and is the whole effect under reduced motion. Direction matches the
  // shader's own color1-at-bottom / color4-at-top mapping.
  band.style.setProperty('--gradient-frame-edge-from', config.color1);
  band.style.setProperty('--gradient-frame-edge-to', config.color4);
}

function initFrame(frame) {
  if (frame.__gradientFrameReady) return; // idempotent: safe on re-init
  frame.__gradientFrameReady = true;

  const cfg = readConfig(frame);
  const bands = ['top', 'bottom'].map(function(position) {
    const band = document.createElement('div');
    band.className = 'gradient-frame-edge gradient-frame-edge-' + position;
    band.setAttribute('aria-hidden', 'true');
    return { position: position, band: band };
  });

  const applyColors = () => {
    frame.style.setProperty('--gradient-frame-inner', resolveColor(cfg.inner, frame));
    bands.forEach(function(entry) {
      const config = bandConfig(cfg, entry.position, frame);
      paintBand(entry.band, config);
      if (entry.handle) entry.handle.setColors(config);
    });
  };

  // Bands are inserted around the EXISTING children rather than wrapping
  // them in a new element — reparenting content would break the scripts
  // that already hold references to (and measure) it.
  frame.insertBefore(bands[0].band, frame.firstChild);
  frame.appendChild(bands[1].band);
  applyColors();

  // A theme toggle re-resolves every CSS custom property automatically,
  // but the shader's colors are GL uniforms — they have to be pushed.
  const themeObserver = new MutationObserver(applyColors);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Palette flip for the nav/text/icons while this frame owns the screen.
  // Scroll math, ramp timing and theme-toggle correctness all live in
  // bindShift — see BACKGROUND-LAYER-SYSTEM.md. One binding per page:
  // two writers on --profile-shift fight through the handoff zone.
  if (cfg.mode === 'invert' && window.BackgroundLayer) {
    window.BackgroundLayer.bindShift(frame, '--profile-shift', {
      quantize: 0.05, // see bindShift: cuts nav backdrop-blur repaints
      enterSpan: cfg.enterSpan,
      exitSpan: cfg.exitSpan,
      // The bottom band has already faded to the page background by its own
      // lower edge, so the frame's box bottom is much later than the point
      // the island stops being visible — without this the palette reverted
      // noticeably after it looked like it should have. Read live (not
      // captured) so it tracks --gradient-frame-edge-height at any viewport.
      endInset: function() { return bands[1].band.offsetHeight; },
    });
  }

  // Reduced motion / no renderer: the CSS fallback gradient set above is
  // already painted, so the bands still read correctly — just not animated.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.initGradFlowBackground) return;

  bands.forEach(function(entry) {
    const canvas = document.createElement('canvas');
    canvas.className = 'gradient-frame-canvas';
    entry.band.appendChild(canvas);
    window.initGradFlowBackground(canvas, bandConfig(cfg, entry.position, frame))
      .then(function(handle) { entry.handle = handle; });
  });
}

function initAll() {
  document.querySelectorAll('[data-gradient-frame]').forEach(initFrame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll, { once: true });
} else {
  initAll();
}

window.initGradientFrame = initFrame;

})();
