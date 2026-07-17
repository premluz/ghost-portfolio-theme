# Particle System

The homepage's morphing particle field: shapes made of points, rendered with
**Three.js + WebGL** (`THREE.WebGLRenderer`, custom GLSL shaders). This is
the system actually running in production.

There is a second, separate **WebGPU** particle system
(`partials/gpu-particle-integration.hbs`, exposes `window.gpuParticleSystem`)
that `particle-morph.hbs` knows how to hand off to if present — but its
include is commented out in `default.hbs:434`, so it never runs today. This
doc is entirely about the WebGL system. Don't confuse the two:
`window.particleSystem` (WebGL, covered here) vs `window.gpuParticleSystem`
(WebGPU, dormant).

## Files, in dependency order

| File | Role |
|---|---|
| `assets/js/shape-definitions.js` | Generates the raw `Float32Array` of point positions for each shape ("what does this shape look like at rest"). One generator function + one `ShapeDefinition` per shape. |
| `assets/js/particle-morph-system.js` | Orchestrator. Owns the shape registry, the state registry (pre-generated position buffers), and `morphTo(shapeKey, durationMs)` — the one public entry point everything else calls to change shape. |
| `assets/js/particle-animation-loop.js` | The actual Three.js scene: camera, renderer, the vertex/fragment shaders, the `animate()` RAF loop (rotation, pan, mouse easing, per-shape shader uniforms), mouse/click listeners. **Almost everything you'll want to tune lives here.** |
| `partials/particle-morph.hbs` | Wiring, not logic: creates the canvas div, loads the scripts in order, and registers the `IntersectionObserver`/`ScrollTrigger` triggers that call `system.morphTo(...)` when the user scrolls into a given section (hero, operating model, testimonials, Profile→terrain, footer→grid, Lab, etc). Also the light/dark pipeline switch (`installThemePatch`) and particle base-color reader. |
| `assets/js/dispersed-variants.js`, `assets/js/particle-state.js`, `assets/js/trigger-system.js`, `assets/js/fade-controller.js` | Supporting pieces: alternate "dispersed" shape variants, the state-registry data structure, a generic trigger helper, and the fade-in/out-on-morph controller. Rarely need to touch these for shape/tuning work. |

Dependency direction: `shape-definitions.js` → `particle-morph-system.js` →
`particle-animation-loop.js`, all loaded as plain `<script>` tags (in that
order) by `particle-morph.hbs`, then `particle-morph.hbs`'s own inline
`<script>` wires up scroll triggers against the resulting
`window.particleSystem`.

## How a shape actually renders

1. `shape-definitions.js` generates a flat position array once, cached in
   the state registry (`particle-morph-system.js`'s `stateRegistry`).
2. `morphTo(key, duration)` looks up that state and starts a CPU-side blend
   (`particle-animation-loop.js`'s `blendStates()`) from the current
   position buffer to the target one over `duration` ms — this is a
   straight per-vertex lerp of the position attribute, not shader-driven.
3. Once blended, the vertex shader can ALSO apply a continuous,
   shader-driven effect on top of the rest position — this is how Lab's
   orb noise, Terrain's rolling ground, and Grid's mouse wave/click ripple
   work. Each has its own `u<Shape>Progress` uniform (0–1), set every
   frame in `animate()`, driven by "is this shape the current/next state"
   rather than by scroll or by the CPU blend — see `uLabProgress`,
   `uTerrainProgress`, `uGridProgress` in `particle-animation-loop.js`. This
   is the pattern to copy for any new continuously-animated shape: gate an
   entire shader block behind `if (uYourShapeProgress > 0.0001) { ... }` so
   it costs nothing when that shape isn't active.

## Recipe: adding a new shape

Modeled on how `grid` was added this thread. Three files, three steps:

1. **`shape-definitions.js`** — write a generator `(particleCount, config) =>
   Float32Array` and wrap it: `const YOUR_SHAPE = new ShapeDefinition('your-key', yourGenerator, { ...config });`. Export it: `window.YOUR_SHAPE = YOUR_SHAPE;` in the export block near the bottom of the file.
2. **`particle-morph-system.js`** — register it in **three** places (all required, easy to miss one):
   - `initializeModules()`: `this.shapeRegistry.register(window.YOUR_SHAPE);` (~line 38)
   - `_createImmediateStates()`'s `immediate` array (~line 83) — add your key here if the shape doesn't depend on an async GLB load (plain generated geometry, like grid/terrain/lab, always qualifies)
   - `createInitialStates()`'s `shapes` array (~line 111), plus the skip-condition right below it so this function doesn't clobber the state your immediate-creation step already made
3. **`particle-morph.hbs`** — wire a trigger that calls
   `system.morphTo('your-key', durationMs)` when the user scrolls into
   whatever section should show it. Copy an existing `IntersectionObserver`
   block (the footer→grid one, ~line 533, is the simplest template) or a
   `ScrollTrigger.create(...)` block if you need finer scroll-position
   control (see the Profile→terrain trigger, ~line 463, for the
   "wait for a previous shape to release first" pattern).

If your shape needs its own continuous shader effect (not just a static
rest shape), also add: a `u<Shape>Progress` uniform + its shape-driven
blend logic in `animate()` (copy the "Grid interaction amount" block,
~line 754), any uniforms your effect needs in the material's
`uniforms: {...}` object (~line 485), and the displacement block itself in
the vertex shader's `main()` (~line 353 onward — copy the Grid block as the
most fully-worked example, including the "keep the old version commented
out" convention below).

## Recipe: reverting a change without git

This repo has no git. The established convention this thread (grid's square
vs. organic boundary, its plain-circular vs. noise-perturbed wave/ripple)
is: **comment the old block out in place, right above the new one, with a
one-line label** ("kept for revert"). Don't delete working code you might
want back — search for `kept for revert` / `kept below, unused` in
`shape-definitions.js` and `particle-animation-loop.js` to find the
currently-stashed alternates.

## Tuning reference (WebGL system, `particle-animation-loop.js` unless noted)

All of these are plain constants — change the number, restart Ghost
(`cd ghost2 && ghost restart`), reload.

| What | Where | Current value | Notes |
|---|---|---|---|
| Camera distance (zoom) | `constructor()`, ~line 64 | `camera.position.z = isMobile ? 14 : 8` | Bigger = smaller/further-away shapes. |
| Ambient auto-spin speed | `animate()`, ~line 809 | `this.autoRotation += 0.0005 * (1 - gridAmountForSpin)` | Per-frame radians. The `(1 - gridAmountForSpin)` factor is what freezes rotation while Grid is active — see "Grid is special" below. |
| Cursor → tilt strength | `animate()`, ~line 832 | `const rotStrength = Math.PI * 0.22;` | How far the object tilts across the full mouse range. Was `Math.PI * 0.5` before this thread's "reduce strength" request. |
| Cursor → pan (camera-like left/right/up/down shift) | `animate()`, ~line 843 | `const panStrength = 1.2;` | World units at full mouse deflection. This whole effect (`this.particles.position.x/y`) was added this thread — didn't exist before. |
| Mouse easing / "scrub" feel | `animate()`, ~line 794 | `const ease = 0.015;` | Lerp factor toward the raw mouse target. Lower = laggier/more scrubbed, higher = snappier. Was `0.04`. |
| Particle size | material `uniforms`, ~line 488 | `sizeScale: { value: isMobile ? 0.5 : 0.8 }` | Multiplies every particle's `gl_PointSize` (vertex shader ~line 419). |
| Particle max opacity | fragment shader, ~line 460 | `float finalAlpha = pow(bokeh, 2.0) * 0.9;` | The `0.9` is overall max alpha; `pow(bokeh, 2.0)` shapes the soft hex-edge falloff, don't touch that part for a simple opacity change. |
| Particle base color (all shapes) | `partials/particle-morph.hbs`, `generateColors()` ~line 846 | reads CSS var `--color-particles` | Theme-dependent, set in your token CSS, not here. |
| Lab orb morph (fold) speed | material `uniforms`, ~line 509 | `uOrbSpeed: { value: 0.225 }` | Halved this thread ("2x slower") from `0.45`. Size/reach of the folds is `uOrbAmp` (~line 507), their scale is `uOrbFreq` (~line 508) — untouched. |
| Terrain roll amplitude/speed | material `uniforms`, ~line 527-529 | `uTerrainAmp: 3.6`, `uTerrainFreq: 0.2`, `uTerrainSpeed: 0.22` | |
| Morph transition durations | wherever `morphTo(key, ms)` is called (mostly `particle-morph.hbs`, one in `scroll-scrub-anim.js`) | varies, e.g. hero→helix is `1200` (`scroll-scrub-anim.js:381`) | **Gotcha this thread**: that hero call was accidentally `26200` (26.2s) — a typo that made the hero look permanently stuck in "dispersed" since the blend was real but imperceptibly slow. If a morph looks "stuck," check its duration argument first. |

### Grid-specific interactive uniforms (all in `particle-animation-loop.js`)

Grid is the only shape with mouse/click-reactive shader effects, and the
only shape with a **pinned, non-live camera framing** (rotation + pan are
both frozen to a fixed virtual-mouse position while Grid is active/blending
— see the `gridAmount`-gated branch in `animate()`, ~line 815-845 — instead
of following the real cursor like every other shape does). If you add
another interactive shape, decide up front whether it should behave like
Grid (fixed framing) or like everything else (live mouse-driven).

| Uniform | ~Line | Current value | Controls |
|---|---|---|---|
| `uGridWaveAmp` / `Freq` / `Speed` / `Falloff` | 547-550 | `0.6 / 1.2 / 2.0 / 0.15` | Continuous mouse-follow wave: height, ripple density, animation speed, how fast it fades with distance from cursor. |
| `uGridRippleAmp` / `Speed` / `Width` / `Life` | 551-554 | `1.6 / 6.0 / 1.2 / 2.5` | Click ripple: height, outward speed (world units/sec), ring thickness, seconds until fully decayed. |
| `_gridMouseWorldScale` | constructor, ~line 102 | `7` | NDC (-1..1 mouse) → world-space scale, shared by the continuous wave and the click ripple so they can't drift apart. |
| Organic noise on wave/ripple | vertex shader, ~line 325-355 | `snoise(...)` calls perturbing phase/radius | Makes the wavefront/ring wobble instead of forming a mathematically perfect circle — added this thread to match Profile/Terrain's organic feel. Old plain-circular version kept commented directly above, per the no-git revert convention. |
| Organic (non-rectangular) boundary | `shape-definitions.js`, `gridGenerator` ~line 581 | same `edgeFactor()` technique as `terrainGenerator` | Pulls corner/edge particles inward into a coastline-like silhouette. Interior spacing stays perfectly even (no jitter) — that's what keeps the "technical drawing paper" read. Old plain-rectangle generator kept commented above it. |
| Fixed camera framing while Grid is active | `animate()`, ~line 824-845 | `fixedMouseX`/`fixedMouseY` computed from a hardcoded screen position (currently `750, 620`) | This is "as if the mouse were parked at this pixel." Change these two numbers to re-aim the frozen tilt/pan. |

## Where to change the Lab section's particle color

Two different things can look like "the color of the particles in Lab,"
don't confuse them:

1. **Base particle color (every shape, theme-driven)** — `--color-particles`
   CSS custom property, read by `generateColors()` in
   `particle-morph.hbs` (~line 846-853) into the geometry's per-vertex
   `color` attribute. Change the CSS variable, not this file, to recolor
   particles globally.
2. **The Lab-specific color wash** (the actual "on top of particles" tint
   people mean by "Lab section color") — `uWaveColor` in
   `particle-animation-loop.js`:
   - Uniform declaration/default: ~line 205 (shader) and ~line 491
     (`uWaveColor: { value: new THREE.Color(0xda70d6) }`, currently
     Orchid/pinkish-purple).
   - Where it's actually applied, in the vertex shader's `main()`:
     - ~line 397 / 409: the scroll-driven wavefront blend
       (`mix(color, uWaveColor, waveMix * 0.95)`) — a color sweep that
       propagates top-to-bottom as you scroll into Lab, gated by
       `uWavefront`/`uWaveFalloff` (~line 489-490, also material uniforms).
     - ~line 415: an extra Lab-orb-specific bloom
       (`mix(baseColor, uWaveColor, abs(orbNoise) * uLabProgress * 0.6)`) —
       the orb's own deformation folds pull further toward this color,
       proportional to how deformed each point currently is; zero
       everywhere else since `uLabProgress` is 0 off-Lab.
   - To change the Lab tint color: edit the hex in `uWaveColor`'s default
     (~line 491). To change how far/fast the wash sweeps: `uWaveFalloff`
     (~line 490, gradient width) and `uWavefront` (driven at runtime by
     Lab's own scroll progress elsewhere, not a static tuning constant).

## Where to change overall particle brightness (dark vs. light mode)

"Brightness" is NOT just the `--color-particles` hex — that's the weakest
lever here. Dark and light mode actually use two entirely different render
pipelines (`installThemePatch()` in `particle-morph.hbs`, ~line 855
onward — `wantsLightPipeline()` decides which), each with its own
brightness contributors stacked on top of the base color. Changing the hex
alone (what was tried this thread — darkening dark mode's `#5ad8ff` and
brightening light mode's `#1a5a7a`) has a real but small effect, because
these other layers dominate what you actually perceive:

| Layer | Applies to | Where | Current value | Effect |
|---|---|---|---|---|
| Base color | Both | `default.hbs` (`:root` / `[data-theme='light']`), mirrored in `scroll-scrub-anim.js`'s `PARTICLE_NORMAL`/`PARTICLE_SHIFTED` | dark `#3B8CA6`, light `#2787B7` | The raw hue/lightness fed into the shader's `color` attribute. Weak lever on its own — see below. |
| Bloom pass (glow) | **Dark mode only** | `particle-animation-loop.js`, `_initComposer()` ~line 152-157 | `strength: isMobile?0.3:0.1`, `radius: isMobile?0.2:2.4`, `threshold: 0.1` | This is doing most of the "brightness" work in dark mode — it's a full HDR bloom pass, not just a color. Lower `strength` first if dark mode still reads too bright; `threshold` (currently `0.1`, very low) controls how much of the particle even qualifies as "bloom-worthy" — raising it means only the brightest core pixels bloom, dimming the overall glow. |
| HDR core multiplier | Both (feeds bloom in dark mode) | fragment shader, ~line 490-495 | `coreColor = vColor * 1.1` | Values above 1.0 are genuine HDR overbright — this is what the bloom pass in dark mode actually latches onto. Drop below `1.0` (e.g. `0.85`) to stop the core from ever triggering bloom at all. |
| Tone-mapping exposure | Both | `constructor()`, ~line 33 | `renderer.toneMappingExposure = 1.0` | Global exposure multiplier for the entire canvas (not just particles, but nothing else renders on this canvas) — a blunt "turn the whole render down" knob if per-particle tuning isn't enough. |
| Additive blending (density compounding) | Both | material creation, ~line 508 | `blending: THREE.AdditiveBlending` | Structural, not really a "tunable," but explains why dense/overlapping shapes (helix, terrain) look far brighter than a single particle's color would suggest — overlapping particles SUM their color values. A shape that looks "too bright" in a dense region may need fewer overlapping particles there, not a darker color. |
| Max opacity | Both | fragment shader, ~line 498 | `finalAlpha = pow(bokeh, 2.0) * 0.9` | Secondary lever — lowers how much each individual particle contributes per-pixel, which also reduces how much dense overlapping regions can compound (see additive blending above). |
| **Light-mode-only glow filter** | **Light mode only** | `particle-morph.hbs`, `installThemePatch()` ~line 925-949 | `demo.style.filter = 'drop-shadow(0 0 6px ' + hex + ') drop-shadow(0 0 16px ' + hex + ')'` | Light mode doesn't use the bloom pass at all (`wantsLightPipeline()` disables it) — instead it's a plain CSS `drop-shadow` glow on the whole canvas element, using `--color-particles` itself as the glow color. **This is almost certainly why light mode reads "too light"** — even a darker base hex still gets a two-layer soft-glow halo (6px + 16px spread) painted around every particle. Shrink the blur radii or drop the second `drop-shadow` entirely to tighten it up. |

Practical order to try, if brightness still isn't right after a color-only
change: **dark mode** → lower bloom `strength` first, then `threshold` up,
then the `coreColor` multiplier, hex last. **Light mode** → shrink/remove
the `drop-shadow` filter first, hex last.

## Known gotchas from this thread

- **Rotation/pan are shared across every shape** except Grid (which pins
  its own fixed values instead) — turning the global dial (`rotStrength`,
  `panStrength`, auto-spin speed) affects sphere/helix/terrain/lab/etc all
  at once. There's no per-shape override for these today; if you need one,
  follow Grid's `gridAmount`-blend pattern as the template.
- **`morphTo` duration typos are easy to miss and look like a stuck/broken
  morph, not a slow one** — the blend is real and progressing
  (`morphProgress` climbs every frame), it's just too slow to notice. If
  something "never changes shape," check its duration argument before
  assuming the trigger itself is broken.
- **Z-index, not particle opacity, usually explains "particles missing" on
  a given section.** `#particle-morph-demo` is a fixed-position canvas at
  `z-index: 1`; any section that should render its own content above the
  particles needs `position: relative; z-index: 2` (see `.page`,
  `.posts-tabs-grid-lab-section`). Profile is the deliberate exception —
  it's `z-index: 0` so the terrain shape shows through it, not the other
  way around.
