/**
 * VOLATILITY SURFACE — hero ground-plane point lattice.
 *
 * Separate, self-contained layer: deliberately NOT part of the particle-morph
 * system (different camera, different motion model, no morphing, no accent
 * color). 140×60 points, single draw call, displacement computed entirely in
 * the vertex shader (uTime uniform is the only per-frame CPU work).
 *
 * Reads as a nearly-flat term-structure plot with gentle relief — never as
 * waves. Monochrome: point color derived from the live theme background
 * (lightness +10% dark / −12% light), depth fade does all atmospheric work.
 */
import * as THREE from 'three';

const COLS = 140, ROWS = 60;
const SPACING = 1.0;                 // grid cell = 1 unit (amplitudes are in cells)
const A1 = 0.35, A2 = 0.6, A3 = 0.15;
const S1 = 0.15, S2 = 0.08;          // rad/s — barely perceptible watched directly

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPointBase;          // ~2px * devicePixelRatio
  attribute vec2 aGrid;              // col, row (grid units)
  varying float vAlpha;

  // cheap 2D value noise (hash-based, good enough for a 0.15-cell layer)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2D(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y) * 2.0 - 1.0;
  }

  void main() {
    float gx = aGrid.x, gy = aGrid.y, t = uTime;
    // spec height field: broad swell (A2) + finer ripple (A1) + noise (A3)
    float h = ${A1} * sin(gx * 0.35 + t * ${S1}) * cos(gy * 0.5 + t * ${S1 * 0.7})
            + ${A2} * sin(gx * 0.12 - t * ${S2}) * sin(gy * 0.18 + t * ${S2 * 0.5})
            + ${A3} * noise2D(vec2(gx * 0.08 + t * 0.01, gy * 0.08));

    float rowN = gy / ${(ROWS - 1)}.0;
    /* GEOMETRIC row depth, not linear: a flat 140×60 lattice with square
       cells can't fill a grazing view (only ~13 columns fit the frustum
       near the camera — measured: a sparse far wedge). Geometric spacing
       distributes rows evenly in SCREEN space from the bottom edge up to
       the horizon; pow(d/near, 0.7) partially re-widens far rows so the
       lattice bleeds off both edges at every depth (full compensation
       would make columns perfectly vertical = wallpaper). Camera numbers
       (height 42.7, near 78, far 328, fov 50, pitch 3.7deg) are derived so
       the near row sits exactly on the viewport bottom edge and the far
       edge dissolves at ~57% of hero height. */
    float dist = 78.0 * pow(4.2, rowN);
    float widen = pow(dist / 78.0, 0.7);
    vec3 pos = vec3((gx - ${COLS / 2}.0) * widen, h, -dist);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // ~2px near → ~0.5px far (dpr-scaled by uPointBase)
    gl_PointSize = clamp(uPointBase * 78.0 / dist, 0.5, uPointBase + 0.5);

    // opacity ramp 0.55 near → 0.12 at horizon…
    vAlpha = mix(0.55, 0.12, rowN);
    // …dissolving to nothing over the last 15% of rows (no visible far edge)
    vAlpha *= 1.0 - smoothstep(0.85, 1.0, rowN);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    // round sprite, soft ~1px falloff, no glow
    float d = length(gl_PointCoord - 0.5);
    float edge = smoothstep(0.5, 0.35, d);
    if (edge < 0.01) discard;
    gl_FragColor = vec4(uColor, vAlpha * edge);
  }
`;

function themePointColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
  const { r, g, b } = window.BackgroundLayer.parseColorToRGB(bg || '#1d1e1f');
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  // dark: bg lightness +10%; light: −12% (monochrome, no accent — per spec)
  const shift = isLight ? -0.12 : 0.10;
  const adj = (v) => Math.max(0, Math.min(255, v + shift * 255));
  return new THREE.Color(adj(r) / 255, adj(g) / 255, adj(b) / 255);
}

function initVolatilitySurface() {
  // Honors the HERO_PARTICLE_MODE switch in default.hbs: flip it to 'helix'
  // and this layer never mounts (the helix morphs come back automatically).
  if (window.HERO_PARTICLE_MODE !== 'volatility') return;
  const heroBg = document.querySelector('.hero .hero-bg');
  // No mobile variant: on phones the hero copy is bottom-anchored — exactly
  // where the ground plane lives — so the layer would sit under text at
  // full strength. Desktop/tablet only.
  if (!heroBg || window.matchMedia('(max-width: 768px)').matches) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-vol-surface';
  canvas.setAttribute('aria-hidden', 'true');
  heroBg.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 500);

  const grid = new Float32Array(COLS * ROWS * 2);
  const pos = new Float32Array(COLS * ROWS * 3); // required by three, real position built in-shader
  let i = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { grid[i * 2] = c; grid[i * 2 + 1] = r; i++; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -200), 400); // covers the geometric depth range; skips CPU recompute

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: reduced ? 2.0 : 0 },   // reduced-motion: mid-phase frame with visible relief
      uColor: { value: themePointColor() },
      uPointBase: { value: 2.0 * Math.min(window.devicePixelRatio || 1, 1.5) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Points(geo, mat));

  function layout() {
    const w = heroBg.clientWidth, h = heroBg.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Low pitched view: near rows at the bottom edge, horizon ≈57% of hero
    // height. Grid spans ~120% viewport width at the near rows (bleeds off
    // both edges). 3° yaw so the lattice isn't perfectly frontal.
    // Derived analytically (see shader comment): near row exactly at the
    // bottom edge, horizon ~57% of hero height, 3deg yaw for asymmetry.
    camera.fov = 50;
    camera.position.set(0, 42.7, 0);
    camera.lookAt(5.2, 42.7 - 6.5, -100);
    camera.updateProjectionMatrix();
  }
  layout();

  const t0 = performance.now();
  let raf = 0, running = false;
  const frame = () => {
    raf = 0;
    if (!running) return;
    mat.uniforms.uTime.value = (performance.now() - t0) / 1000;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const renderOnce = () => renderer.render(scene, camera);

  // Run only while the hero is actually on screen: the hero is position:fixed,
  // so IntersectionObserver never reports it gone — gate on scroll position
  // (later sections cover it after one viewport) + document visibility.
  const shouldRun = () => !document.hidden && window.scrollY < window.innerHeight;
  const update = () => {
    const want = shouldRun() && !reduced;
    if (want && !running) { running = true; raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  };
  if (reduced) renderOnce(); else update();
  window.addEventListener('scroll', update, { passive: true });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('resize', () => { layout(); if (!running) renderOnce(); });
  window.addEventListener('themechange', () => { mat.uniforms.uColor.value = themePointColor(); if (!running) renderOnce(); });

  // Debug/tuning handle (harmless in production): lets a console session
  // recolor or re-render the layer without reaching into module scope.
  window.__volSurface = { mat, camera, renderOnce, layout };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVolatilitySurface);
else initVolatilitySurface();
