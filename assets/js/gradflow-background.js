(function() { 'use strict';

// Vanilla reimplementation of the "gradflow" npm package's renderer
// (node_modules/gradflow — a React component) for use in this Ghost theme,
// which has no React runtime. gradflow's own rendering core has no React
// dependency at all — it's the `ogl` WebGL library (Renderer/Plane/Program/
// Mesh/Transform) driven from a useEffect; only the component wrapper
// (lifecycle + props) is React-specific. Setup below mirrors that useEffect
// line-for-line; shader source/config constants live in gradflow-shaders.js
// (split out to stay under this repo's 200-line-per-file guardrail — that's
// pure GLSL/data, this is the actual logic). `ogl` is resolved via
// default.hbs's importmap (same "classic script + dynamic import()" pattern
// already used for three.js in shape-definitions.js/particle-animation-loop.js).

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function normalizeColor(color) {
  return typeof color === 'string' ? hexToRgb(color) : color;
}

function toGl(rgb) {
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
}

let oglModulePromise = null;
function loadOgl() {
  if (!oglModulePromise) oglModulePromise = import('ogl');
  return oglModulePromise;
}

// Mounts a gradient onto `canvas`, sized to canvas.parentElement — same
// setup gradflow's own useEffect does (Renderer/Plane/Program/Mesh/
// Transform, resize listener, rAF loop), just without the React lifecycle.
//
// Resolves to a handle: { setColors(partialConfig), destroy() }. setColors
// exists because a theme toggle has to re-drive the uniforms — the colors
// are baked into GL uniforms at init, so unlike the CSS around them they
// can't just re-resolve themselves on the next repaint.
//
// Two deliberate cost controls, both invisible on this kind of content:
//
//  * resolutionScale (default 0.35) — the drawing buffer is rendered at a
//    fraction of the element's device pixels and upscaled by the browser.
//    waveGradient never reads u_resolution (it works purely off uv), so the
//    shape is bit-identical; only sampling density drops, ~8x fewer fragment
//    invocations. A smooth gradient survives bilinear upscaling fine.
//
//  * The rAF loop is PAUSED whenever the canvas is off screen. It used to
//    run unconditionally for the life of the page — two full-width GL
//    surfaces animating while scrolled a thousand pixels away.
async function initGradFlowBackground(canvas, configInput) {
  if (!canvas) return { setColors() {}, destroy() {} };
  const { Renderer, Plane, Program, Mesh, Transform } = await loadOgl();
  const { VERTEX, FRAGMENT, GRADIENT_TYPE_NUMBER, DEFAULT_CONFIG } = window.GRADFLOW_SHADERS;

  const config = Object.assign({}, DEFAULT_CONFIG, configInput || {});
  const color1 = toGl(normalizeColor(config.color1));
  const color2 = toGl(normalizeColor(config.color2));
  const color3 = toGl(normalizeColor(config.color3));
  const color4 = toGl(normalizeColor(config.color4));
  // Second wave layer is optional; when absent its opacity is 0 and the
  // shader's branch skips it entirely.
  const l2 = config.layer2 || {};
  const l2on = !!config.layer2;

  // Clamped: below ~0.1 the upscale starts to show as banding on a tall band.
  const resolutionScale = Math.max(0.1, config.resolutionScale || 0.35);
  const bufferDpr = () => Math.min(window.devicePixelRatio, 2) * resolutionScale;

  const renderer = new Renderer({
    canvas,
    dpr: bufferDpr(),
    // true so a fadeOuter band (see gradient-frame.js's data-gradient-fade-
    // outer) can actually composite over whatever's behind it in the DOM.
    // Every existing caller still outputs alpha 1.0 everywhere (u_fade_outer
    // defaults to 0, see the shader), so this is a no-op for them — same
    // fully-opaque canvas as before.
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
  });
  const gl = renderer.gl;
  const geometry = new Plane(gl, { width: 2, height: 2 });

  const resize = () => {
    if (!canvas.parentElement) return;
    const parent = canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const dpr = bufferDpr();
    // Backing store is deliberately smaller than the CSS box (see
    // resolutionScale above); the style width/height keep it displayed full
    // size, so the browser upscales.
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    renderer.setSize(width, height);
    if (program) program.uniforms.u_resolution.value = [width, height];
  };

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: FRAGMENT,
    uniforms: {
      u_time: { value: 0 },
      u_color1: { value: color1 },
      u_color2: { value: color2 },
      u_color3: { value: color3 },
      u_color4: { value: color4 },
      u_speed: { value: config.speed },
      u_scale: { value: config.scale },
      u_type: { value: GRADIENT_TYPE_NUMBER[config.type] != null ? GRADIENT_TYPE_NUMBER[config.type] : GRADIENT_TYPE_NUMBER.animated },
      u_noise: { value: config.noise },
      u_resolution: { value: [canvas.clientWidth, canvas.clientHeight] },
      u_layer2_color1: { value: toGl(normalizeColor(l2.color1 || config.color2)) },
      u_layer2_color2: { value: toGl(normalizeColor(l2.color2 || config.color3)) },
      u_layer2_opacity: { value: l2on ? (l2.opacity != null ? l2.opacity : 0.5) : 0 },
      u_layer2_scale: { value: l2.scale != null ? l2.scale : config.scale * 2.6 },
      u_layer2_speed: { value: l2.speed != null ? l2.speed : config.speed * 0.6 },
      u_layer2_center: { value: l2.center != null ? l2.center : 0.5 },
      u_layer2_width: { value: l2.width != null ? l2.width : 0.34 },
      u_scroll: { value: 0 },
      u_parallax: { value: config.parallax || 0 },
      u_layer2_parallax: { value: l2.parallax != null ? l2.parallax : 0 },
      u_breathe: { value: config.breathe != null ? config.breathe : DEFAULT_CONFIG.breathe },
      u_breathe_rate: { value: config.breatheRate != null ? config.breatheRate : DEFAULT_CONFIG.breatheRate },
      u_amplitude: { value: config.amplitude != null ? config.amplitude : DEFAULT_CONFIG.amplitude },
      u_fade_outer: { value: config.fadeOuter ? 1 : 0 },
      u_outer_at_one: { value: config.outerAtTop ? 1 : 0 },
    },
  });

  const mesh = new Mesh(gl, { geometry, program });
  const scene = new Transform();
  mesh.setParent(scene);

  resize();
  window.addEventListener('resize', resize, { passive: true });

  const startTime = performance.now();
  let rafId = 0;
  const needsScroll = !!(config.parallax || l2.parallax);
  const tick = (now) => {
    program.uniforms.u_time.value = (now - startTime) / 1000;
    // scrollY (not getBoundingClientRect) on purpose — reading it costs
    // nothing, whereas a per-frame rect read would force layout. Only the
    // RELATIVE change matters here, which is identical either way.
    if (needsScroll) program.uniforms.u_scroll.value = window.scrollY / window.innerHeight;
    renderer.render({ scene });
    rafId = requestAnimationFrame(tick);
  };
  const start = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
  const stop = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };

  // u_time keeps advancing off real elapsed time rather than a frame count,
  // so a band resumed after being paused picks the animation up where it
  // would have been — no visible jump on scrolling back to it.
  // rootMargin: start a little before it's actually on screen so the first
  // visible frame is already rendered.
  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { entry.isIntersecting ? start() : stop(); });
  }, { rootMargin: '200px 0px' });
  visibility.observe(canvas);

  return {
    // Only the four colors — speed/scale/type/noise are structural and a
    // caller changing those should mount a new gradient instead.
    setColors(next) {
      if (!next) return;
      ['color1', 'color2', 'color3', 'color4'].forEach((key, i) => {
        if (!next[key]) return;
        program.uniforms['u_color' + (i + 1)].value = toGl(normalizeColor(next[key]));
      });
      const n2 = next.layer2;
      if (n2 && n2.color1) program.uniforms.u_layer2_color1.value = toGl(normalizeColor(n2.color1));
      if (n2 && n2.color2) program.uniforms.u_layer2_color2.value = toGl(normalizeColor(n2.color2));
    },
    destroy() {
      stop();
      visibility.disconnect();
      window.removeEventListener('resize', resize);
      if (program.program) gl.deleteProgram(program.program);
    },
  };
}

window.initGradFlowBackground = initGradFlowBackground;

})();
