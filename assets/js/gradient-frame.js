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
// data-gradient-parallax / -wave2-parallax (second wave layer),
// data-gradient-breathe (calm wave-height pulse, 0 disables),
// data-gradient-breathe-rate (that pulse's own speed, independent of
// data-gradient-speed), data-gradient-amplitude (overall wave-height
// multiplier — scale is frequency, this is "how tall"),
// data-gradient-fade-outer="true" (fade each band's outer/page-facing edge
// to transparent instead of a flat matched color — works for any type, not
// just wave — so the frame can overlap non-solid content behind it).
// Band height is CSS: --gradient-frame-edge-height (gradient-frame.css).
//
// data-gradient-type (default 'wave') — any GRADIENT_TYPE_NUMBER key in
// gradflow-shaders.js (linear/conic/animated/wave/silk/smoke/stripe).
// EVERY type except 'wave' is an untouched 3-color CYCLE (see that file's
// own comment on u_color4) — no edge-to-page-background matching, so
// data-gradient-outer/-inner/-wave-a/-wave-b (wave-only concepts: which
// color sits at which edge so the band fades cleanly into the page) don't
// apply. Non-wave types use THREE direct colors instead:
// data-gradient-color1/-color2/-color3 (same literal-or-'--token' rule as
// every other color attribute here), plus data-gradient-noise (default 0,
// 'wave' ignores it — noise is a cycle-type-only shader param). The second-
// wave layer (data-gradient-wave2-*) is also wave-specific and is skipped
// for any other type.

const MODE_COLORS = {
  theme: { outer: '--color-background', inner: '--color-background' },
  // --shift-bg-theme, NOT --shift-bg: the two are the same value until a
  // frame in fixed-palette mode redirects --shift-bg at :root while it is
  // on screen (see posts-tabs-grid-lab.css). This resolution runs in JS at
  // init and on theme-change only, so pointing it at the redirectable token
  // made a frame's painted colour depend on WHEN that read happened to
  // fire — Lab painted itself the theme mirror (white on a dark site)
  // because at init nothing was on screen yet, then snapped to its real
  // purple on the next theme toggle, and testimonials picked up Lab's
  // purple if the toggle happened while Lab was on screen. A frame wanting
  // a fixed colour declares it literally via data-gradient-inner.
  invert: { outer: '--color-background', inner: '--shift-bg-theme' },
};

// Gives each invert-mode frame on the page its own --gradient-shift-N
// variable instead of writing the shared --profile-shift directly — see
// the long comment at the bindShift call site in initFrame() for why.
let gradientFrameShiftCount = 0;

const DEFAULTS = {
  waveA: '#61177c',
  waveB: '#2e073e',
  speed: 0.7,
  scale: 0.5,
  // Non-wave-type-only (see the data-gradient-type doc above) — falls back
  // to the wave palette so an instance that sets type without colors still
  // renders something, rather than crashing on an undefined uniform.
  type: 'wave',
  color1: '#61177c',
  color2: '#61177c',
  color3: '#2e073e',
  noise: 0,
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
  // Calm wave-height pulse — shared by both layers, but each one breathes
  // at its OWN pace since the shader derives the pulse rate from the
  // speed already passed in per layer (see waveFlow in gradflow-shaders.js).
  // 0 disables it (flat, constant amplitude — the old behaviour).
  breathe: 0.4,
  // Pulse rate multiplier, on top of each layer's own speed — was a
  // hardcoded 0.12 inside waveFlow(), now tunable per instance independent
  // of how fast the wave itself travels sideways.
  breatheRate: 0.12,
  // Overall wave-height multiplier — `scale` is frequency ("squiggliness"),
  // this is amplitude ("how tall"). 1 = the original hardcoded heights.
  amplitude: 1,
  // Fade each band's OUTER (page-facing) edge to transparent instead of a
  // flat page-background-matching color — lets the frame overlap non-solid
  // content behind it (an image, texture, another canvas). Off by default:
  // every existing instance keeps painting a solid, theme-matched outer
  // edge exactly as before.
  fadeOuter: false,
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
  const noise = parseFloat(d.gradientNoise);
  return {
    mode: mode,
    outer: d.gradientOuter || MODE_COLORS[mode].outer,
    inner: d.gradientInner || MODE_COLORS[mode].inner,
    waveA: d.gradientWaveA || DEFAULTS.waveA,
    waveB: d.gradientWaveB || DEFAULTS.waveB,
    // Non-wave-type-only — see data-gradient-type's own doc above.
    type: d.gradientType || DEFAULTS.type,
    color1: d.gradientColor1 || DEFAULTS.color1,
    color2: d.gradientColor2 || DEFAULTS.color2,
    color3: d.gradientColor3 || DEFAULTS.color3,
    noise: isNaN(noise) ? DEFAULTS.noise : noise,
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
    breathe: num(d.gradientBreathe, DEFAULTS.breathe),
    breatheRate: num(d.gradientBreatheRate, DEFAULTS.breatheRate),
    amplitude: num(d.gradientAmplitude, DEFAULTS.amplitude),
    fadeOuter: d.gradientFadeOuter === 'true',
  };
}

// waveGradient puts color1 at the band's BOTTOM edge and color4 at its TOP
// edge, so the top band (page above it, content below it) and the bottom
// band (content above, page below) are exact mirrors of each other. Every
// OTHER type is an untouched 3-color cycle (gradflow-shaders.js) with no
// edge-to-page-background concept, so it skips the outer/inner mirroring
// entirely — top and bottom bands get the same three colors, direct.
function bandConfig(cfg, position, frame) {
  // Which physical edge of THIS band is its outer (page-facing) one —
  // type-independent, purely geometric: a top band's own top edge faces the
  // page above it; a bottom band's own bottom edge faces the page below.
  // Feeds u_outer_at_one (gradflow-shaders.js) when fadeOuter is on.
  const outerAtTop = position === 'top';
  if (cfg.type !== 'wave') {
    return {
      color1: resolveColor(cfg.color1, frame),
      color2: resolveColor(cfg.color2, frame),
      color3: resolveColor(cfg.color3, frame),
      speed: cfg.speed,
      scale: cfg.scale,
      type: cfg.type,
      noise: cfg.noise,
      resolutionScale: cfg.resolutionScale,
      parallax: cfg.parallax,
      breathe: cfg.breathe,
      breatheRate: cfg.breatheRate,
      amplitude: cfg.amplitude,
      fadeOuter: cfg.fadeOuter,
      outerAtTop: outerAtTop,
      layer2: null, // second-wave layer is a wave-specific composited effect
    };
  }
  const outer = resolveColor(cfg.outer, frame);
  const inner = resolveColor(cfg.inner, frame);
  const edges = outerAtTop
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
    breathe: cfg.breathe,
    breatheRate: cfg.breatheRate,
    amplitude: cfg.amplitude,
    fadeOuter: cfg.fadeOuter,
    outerAtTop: outerAtTop,
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
  // shader's own color1-at-bottom / color4-at-top mapping. Non-wave types
  // have no color4 (see bandConfig) — color3 (the cycle's last stop) is the
  // nearest equivalent "far" color for this two-stop CSS approximation.
  let from = config.color1;
  let to = config.color4 || config.color3;
  // fadeOuter has no CSS-gradient/alpha equivalent worth building (this
  // fallback only ever shows pre-WebGL or under reduced motion) — closest
  // approximation is dropping the outer stop to transparent outright, same
  // "let whatever's behind it show" intent as the shader's alpha fade.
  if (config.fadeOuter) {
    if (config.outerAtTop) to = 'transparent'; else from = 'transparent';
  }
  band.style.setProperty('--gradient-frame-edge-from', from);
  band.style.setProperty('--gradient-frame-edge-to', to);
}

function initFrame(frame) {
  if (frame.__gradientFrameReady) return; // idempotent: safe on re-init
  frame.__gradientFrameReady = true;

  const cfg = readConfig(frame);
  // data-gradient-bands-container: opt-in escape hatch for a frame whose
  // z-index (needed for ITS OWN content to sit above the particle canvas —
  // see .gradient-frame's own doc) would otherwise also drag the bands'
  // WebGL canvas above the particle canvas, hard-cutting across it
  // wherever the two overlap (reproduced live on Lab: the wave band's
  // straight rectangular edge sliced across the particle sphere). A
  // stacking context is atomic — nothing inside .gradient-frame can paint
  // below something the frame itself out-ranks — so the only fix is
  // moving the bands OUTSIDE it, into a container this attribute names (a
  // CSS selector), which must be a plain position:relative element with NO
  // z-index of its own (so it doesn't create the same trap) sized to
  // exactly cover .gradient-frame's own box — see
  // .lab-particle-backdrop-wrap in posts-tabs-grid-lab.hbs for the
  // existing example (used there for the SAME reason, for its solid
  // backdrop div). The .gradient-frame-edge--external class below gets the
  // absolute positioning + low z-index this needs; the normal (no
  // attribute) case is entirely unchanged.
  const bandsContainer = frame.dataset.gradientBandsContainer
    ? (document.querySelector(frame.dataset.gradientBandsContainer) || frame)
    : frame;
  const external = bandsContainer !== frame;
  const bands = ['top', 'bottom'].map(function(position) {
    const band = document.createElement('div');
    band.className = 'gradient-frame-edge gradient-frame-edge-' + position;
    if (external) band.classList.add('gradient-frame-edge--external');
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
  // that already hold references to (and measure) it. In the external
  // case, bandsContainer is a DIFFERENT, dedicated element (see doc
  // above), so this same insertBefore/appendChild pattern is still safe —
  // nothing else lives there to reparent around.
  bandsContainer.insertBefore(bands[0].band, bandsContainer.firstChild);
  bandsContainer.appendChild(bands[1].band);
  applyColors();

  // A theme toggle re-resolves every CSS custom property automatically,
  // but the shader's colors are GL uniforms — they have to be pushed.
  const themeObserver = new MutationObserver(applyColors);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Palette flip for the nav/text/icons while this frame owns the screen.
  // Scroll math, ramp timing and theme-toggle correctness all live in
  // bindShift — see BACKGROUND-LAYER-SYSTEM.md.
  //
  // bindShift's own doc warns "one binding per page writing --profile-shift"
  // — true for a single binding, but this theme has grown a SECOND
  // invert-mode frame on the same page (Lab + testimonials, both on the
  // homepage). Binding both directly to --profile-shift reproduced exactly
  // the warned-about failure: each computes its own progress correctly, but
  // whichever one's scroll-triggered recompute finishes last in a given
  // frame overwrites the other's value — reported as "testimonials' shift
  // never happens", root-caused to Lab's (correctly near-zero, since it's
  // scrolled far out of view by then) write landing after testimonials' and
  // silently zeroing it back out.
  //
  // Fix: each invert frame gets its OWN indexed variable
  // (--gradient-shift-0, -1, ...) — no shared write, no race — and
  // --profile-shift itself becomes `max()` of all of them (see
  // gradient-frame.css), which is exactly the semantics wanted: whichever
  // frame is actually in view dominates, and CSS recomputes it, not a JS
  // ordering accident. data-gradient-shift-key (optional) also gets mirrored
  // onto :root as data-active-gradient-frame while THIS frame's shift is
  // above 0 — lets a frame's own CSS (e.g. a fixed-palette override) scope
  // itself to "while I'm actually active" instead of "while I merely exist
  // in the DOM" (see posts-tabs-grid-lab.css's :root:has(#work-grid-lab),
  // which used to leak its fixed colour into testimonials' shift for
  // exactly this reason).
  if (cfg.mode === 'invert' && window.BackgroundLayer) {
    const shiftVar = '--gradient-shift-' + (gradientFrameShiftCount++);
    const shiftKey = frame.dataset.gradientShiftKey || null;
    window.BackgroundLayer.bindShift(frame, shiftVar, {
      quantize: 0.05, // see bindShift: cuts nav backdrop-blur repaints
      enterSpan: cfg.enterSpan,
      exitSpan: cfg.exitSpan,
      // The bottom band has already faded to the page background by its own
      // lower edge, so the frame's box bottom is much later than the point
      // the island stops being visible — without this the palette reverted
      // noticeably after it looked like it should have. Read live (not
      // captured) so it tracks --gradient-frame-edge-height at any viewport.
      endInset: function() { return bands[1].band.offsetHeight; },
      onProgress: shiftKey ? function(t) {
        if (t > 0.001) {
          document.documentElement.setAttribute('data-active-gradient-frame', shiftKey);
        } else if (document.documentElement.getAttribute('data-active-gradient-frame') === shiftKey) {
          document.documentElement.removeAttribute('data-active-gradient-frame');
        }
      } : undefined,
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
