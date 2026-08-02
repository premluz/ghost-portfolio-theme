/**
 * Particle Style Definitions — the motion/render counterpart to
 * shape-definitions.js.
 *
 * A SHAPE says where particles rest (`shape-definitions.js`).
 * A STYLE says how they move and how they are drawn on top of that rest
 * position. Both are registries you add to rather than files you edit.
 *
 * Before this existed, every style lived as a hand-inlined block inside the
 * one ~290-line vertex shader in particle-animation-loop.js, with its uniforms
 * in a separate object and its progress value computed by a fifth copy of the
 * same six lines in animate(). Adding a style meant editing three places in a
 * 1550-line file and hoping you matched the existing pattern.
 *
 * ── The shader contract ────────────────────────────────────────────────
 * main() is assembled in four stages. A style opts into any of them:
 *
 *   preamble     vec3 basePos / float baseSize / vec3 pos = basePos,
 *                plus any `channels` styles declare
 *   displace     each style's `displace` GLSL, in registration order.
 *                Reads basePos (the un-displaced rest position — always
 *                read basePos, never pos, so styles cannot silently
 *                depend on each other's output). Mutates `pos`.
 *   colorize     each style's `colorize` GLSL. Mutates `baseColor`.
 *   output       vColor / gl_PointSize / gl_Position
 *
 * `channels` exist for the one real cross-stage dependency: the Lab orb
 * computes `orbNoise` during displace and the colour stage reads it. Rather
 * than let stages reach into each other's locals, a style declares the
 * channel and the composer emits its zero-initialised declaration up front.
 *
 * Every displace block is wrapped by the composer in
 * `if (<amount expression> > 0.0001) { ... }`, so a style that isn't active
 * costs one uniform-coherent branch and nothing else — that gating was
 * already the convention here (see particles.md), it is now automatic
 * instead of hand-written per block.
 *
 * ── Adding a style ─────────────────────────────────────────────────────
 * Append a `new ParticleStyleDefinition(...)` below and export it. That is
 * the whole change — no edits to particle-animation-loop.js.
 */

class ParticleStyleDefinition {
  /**
   * @param {string} key            Matches the shape/state id that activates it
   *                                (see `amount` for the non-default cases).
   * @param {object} config
   *   uniforms      {name: {value}} merged into the material.
   *   attributes    ['helixPhi'] — declared in the vertex shader. The
   *                 geometry attribute itself is still supplied by the shape.
   *   channels      {orbNoise: 'float'} — shared locals, zero-initialised in
   *                 the preamble, readable by later stages.
   *   amount        GLSL expression for "how active am I" (default
   *                 `u<Key>Progress`). Gates the displace block.
   *   declarations  extra vertex-shader GLSL (helper functions).
   *   displace      GLSL mutating `pos`. Wrapped in the amount gate.
   *   colorize      GLSL mutating `baseColor`. NOT gated — these are cheap
   *                 mixes that already no-op via their own progress term.
   *   sizeMul       GLSL mutating `styleSizeMul` (starts at 1.0), folded
   *                 into gl_PointSize in the output stage. NOT gated, for
   *                 the same reason as colorize.
   *   varyings      {vName: 'float'} declared in BOTH shaders, so a style
   *                 can hand a per-vertex value to its fragment code.
   *   postProject   GLSL running AFTER mvPosition/gl_PointSize exist. The
   *                 only place depth-dependent work can happen (mvPosition.z
   *                 is not available in `sizeMul`). May write gl_PointSize
   *                 and its own varyings.
   *   fragmentBody  GLSL in the fragment shader, after the default sprite
   *                 has produced `finalColor`/`finalAlpha`. Mutates those.
   *   materialState {blending, depthWrite, ...} applied to the material when
   *                 this style becomes dominant (progress > 0.5). For state
   *                 that is not expressible as a uniform.
   *   progressUniform  which uniform animate() drives (default
   *                 `u<Key>Progress`); set null for styles with no
   *                 shape-driven progress.
   */
  constructor(key, config = {}) {
    this.key = key;
    this.uniforms = config.uniforms || {};
    this.attributes = config.attributes || [];
    this.channels = config.channels || {};
    this.declarations = config.declarations || '';
    this.displace = config.displace || '';
    this.colorize = config.colorize || '';
    this.sizeMul = config.sizeMul || '';
    this.varyings = config.varyings || {};
    this.postProject = config.postProject || '';
    this.fragmentBody = config.fragmentBody || '';
    this.materialState = config.materialState || null;
    this.amount = config.amount || null;
    this.progressUniform =
      config.progressUniform !== undefined ? config.progressUniform : null;
  }
}

/**
 * Holds the registered styles and assembles their GLSL. The composer never
 * reorders styles — registration order is displacement order, which matters:
 * helix writes pos.x/pos.z absolutely while the others accumulate into pos.y.
 */
class ParticleStyleRegistry {
  constructor() {
    this.styles = new Map();
  }

  register(style) {
    this.styles.set(style.key, style);
    return this;
  }

  get(key) {
    return this.styles.get(key);
  }

  all() {
    return Array.from(this.styles.values());
  }

  /** Merged uniform block for THREE.ShaderMaterial. */
  uniforms() {
    const out = {};
    this.all().forEach((s) => Object.assign(out, s.uniforms));
    return out;
  }

  /** Attribute declarations, de-duplicated (two styles may share one). */
  vertexAttributes() {
    const seen = new Set();
    this.all().forEach((s) => s.attributes.forEach((a) => seen.add(a)));
    return Array.from(seen);
  }

  /** Uniform declarations for the vertex shader, de-duplicated. */
  vertexUniformDeclarations() {
    const seen = new Set();
    const lines = [];
    this.all().forEach((s) => {
      Object.entries(s.uniforms).forEach(([name, def]) => {
        if (seen.has(name)) return;
        seen.add(name);
        lines.push(`uniform ${ParticleStyleRegistry.glslType(def.value)} ${name};`);
      });
    });
    return lines.join('\n      ');
  }

  /** Infers the GLSL type from the JS uniform value THREE will upload. */
  static glslType(value) {
    if (typeof value === 'number') return 'float';
    if (typeof value === 'boolean') return 'bool';
    if (Array.isArray(value)) return value.length === 2 ? 'vec2' : 'vec3';
    if (value && typeof value === 'object') {
      if ('isColor' in value || ('r' in value && 'g' in value && 'b' in value)) return 'vec3';
      if ('z' in value) return 'vec3';
      if ('y' in value) return 'vec2';
    }
    return 'float';
  }

  channelDeclarations() {
    const lines = [];
    this.all().forEach((s) => {
      Object.entries(s.channels).forEach(([name, type]) => {
        lines.push(`${type} ${name} = ${type === 'float' ? '0.0' : `${type}(0.0)`};`);
      });
    });
    return lines.join('\n        ');
  }

  extraDeclarations() {
    return this.all().map((s) => s.declarations).filter(Boolean).join('\n');
  }

  /** Displacement blocks, each wrapped in its own activity gate. */
  displaceBlocks() {
    return this.all()
      .filter((s) => s.displace)
      .map((s) => {
        const amount = s.amount || `u${ParticleStyleRegistry.pascal(s.key)}Progress`;
        return `
        // ── style: ${s.key} ──
        {
          float _amount = ${amount};
          if (_amount > 0.0001) {
${s.displace}
          }
        }`;
      })
      .join('\n');
  }

  colorizeBlocks() {
    return this.all()
      .filter((s) => s.colorize)
      .map((s) => `
        // ── style colorize: ${s.key} ──
${s.colorize}`)
      .join('\n');
  }

  sizeMulBlocks() {
    return this.all()
      .filter((s) => s.sizeMul)
      .map((s) => `
        // ── style sizeMul: ${s.key} ──
${s.sizeMul}`)
      .join('\n');
  }

  varyingDeclarations() {
    const lines = [];
    this.all().forEach((st) => Object.entries(st.varyings)
      .forEach(([n, t]) => lines.push(`varying ${t} ${n};`)));
    return lines.join('\n      ');
  }

  postProjectBlocks() {
    return this.all().filter((st) => st.postProject)
      .map((st) => `
        // ── style postProject: ${st.key} ──
${st.postProject}`).join('\n');
  }

  /** Fragment uniforms: same set as the vertex side, THREE shares them. */
  fragmentUniformDeclarations() {
    return this.vertexUniformDeclarations();
  }

  fragmentBodyBlocks() {
    return this.all().filter((st) => st.fragmentBody)
      .map((st) => `
        // ── style fragment: ${st.key} ──
${st.fragmentBody}`).join('\n');
  }

  /** Styles whose progress uniform animate() drives from the current state. */
  progressDrivenStyles() {
    return this.all()
      .filter((s) => s.progressUniform)
      .map((s) => ({ key: s.key, uniform: s.progressUniform }));
  }

  static pascal(key) {
    return key.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUILT-IN STYLES — extracted verbatim from particle-animation-loop.js's
// vertex shader. Comments are the originals; behaviour is unchanged.
// ═══════════════════════════════════════════════════════════════════════

// LAB / ORB — permanent, non-resolving deformation. Rest positions are the
// sphere distribution (shape-definitions.js's LAB state); displaced radially
// by 2-octave simplex noise so folds read as a handful of large, slow-moving
// lobes, not high-frequency shimmer. `orbNoise` is published as a channel
// because the colour stage weights bloom by the fold depth.
const STYLE_ORB = new ParticleStyleDefinition('lab', {
  uniforms: {
    uOrbAmp: { value: 1.1 },
    uOrbFreq: { value: 0.4 },
    uOrbSpeed: { value: 0.225 },
    uLabProgress: { value: 0 },
  },
  channels: { orbNoise: 'float' },
  amount: 'uOrbAmp * uLabProgress',
  progressUniform: 'uLabProgress',
  displace: `
            float n1 = snoise(basePos * uOrbFreq + uTime * uOrbSpeed) * 0.65;
            float n2 = snoise(basePos * uOrbFreq * 2.03 + uTime * uOrbSpeed * 1.3 + 11.0) * 0.35;
            orbNoise = n1 + n2;
            vec3 dir = normalize(basePos);
            pos = basePos + dir * orbNoise * _amount;`,
  // Deformation-weighted bloom: the orb's folds (largest |orbNoise|) pull
  // further toward the wave hue; calm surface stays at the plain wave-blended
  // base color. No-op (orbNoise still 0) off-orb.
  colorize: `        baseColor = mix(baseColor, uWaveColor, abs(orbNoise) * uLabProgress * 0.6);`,
});

// TERRAIN — the Profile section's counterpart to the Lab orb: the ground
// itself moving rather than an object deforming. Displaced along Y ONLY,
// sampling 2D simplex noise across X/Z with time folded into the 3rd input
// (a standard animated-heightfield technique) so the whole field rolls
// smoothly rather than each particle jittering independently.
const STYLE_TERRAIN = new ParticleStyleDefinition('terrain', {
  uniforms: {
    uTerrainAmp: { value: 3.6 },
    uTerrainFreq: { value: 0.2 },
    uTerrainSpeed: { value: 0.22 },
    uTerrainProgress: { value: 0 },
  },
  amount: 'uTerrainAmp * uTerrainProgress',
  progressUniform: 'uTerrainProgress',
  displace: `
            float tn1 = snoise(vec3(basePos.x, basePos.z, uTime * uTerrainSpeed) * uTerrainFreq) * 0.7;
            float tn2 = snoise(vec3(basePos.x, basePos.z, uTime * uTerrainSpeed * 0.6 + 31.0) * uTerrainFreq * 2.1) * 0.3;
            pos.y += (tn1 + tn2) * _amount;`,
});

// VOLATILITY — the hero's receding term-structure surface. Same "flat rest
// position + shader-driven heightfield" split as Terrain, with its own
// amp/freq/speed (a much larger, shallower field, so lower frequency reads
// right).
const STYLE_VOLATILITY = new ParticleStyleDefinition('volatility', {
  uniforms: {
    uVolatilityAmp: { value: 2.2 },
    uVolatilityFreq: { value: 0.07 },
    uVolatilitySpeed: { value: 0.3 },
    uVolatilityProgress: { value: 0 },
  },
  amount: 'uVolatilityAmp * uVolatilityProgress',
  progressUniform: 'uVolatilityProgress',
  displace: `
            float vn1 = snoise(vec3(basePos.x, basePos.z, uTime * uVolatilitySpeed) * uVolatilityFreq) * 0.7;
            float vn2 = snoise(vec3(basePos.x, basePos.z, uTime * uVolatilitySpeed * 0.6 + 31.0) * uVolatilityFreq * 2.1) * 0.3;
            pos.y += (vn1 + vn2) * _amount;`,
});

// HELIX — wavy motion confined EXACTLY to the tube's own surface, never
// inside, never outside. helixPhi (per-vertex, see shape-definitions.js's
// helixGenerator) is the single combined angle such that the rest position
// satisfies position.xz = ringCenter + tubeRadius*(cos(phi), sin(phi)). The
// ring centre is recovered algebraically from the rest position, then the
// SAME circle equation is re-evaluated at a time-animated phi: an algebraic
// identity, not an approximation, so the surface cannot bulge or cave in.
// Y is untouched, so it cannot distort that axis either.
const STYLE_HELIX = new ParticleStyleDefinition('helix', {
  uniforms: {
    uHelixProgress: { value: 0 },
    uHelixTubeRadius: { value: 1.5 },
    uHelixWaveAmp: { value: 0 },
    uHelixWaveFreq: { value: 3.0 },
    uHelixWaveSpeed: { value: 1.4 },
  },
  attributes: ['helixPhi'],
  amount: 'uHelixProgress',
  progressUniform: 'uHelixProgress',
  displace: `
            float ringCenterX = basePos.x - uHelixTubeRadius * cos(helixPhi);
            float ringCenterZ = basePos.z - uHelixTubeRadius * sin(helixPhi);
            float wave = sin(helixPhi * uHelixWaveFreq + uTime * uHelixWaveSpeed) * uHelixWaveAmp;
            float animatedPhi = helixPhi + wave * _amount;
            pos.x = ringCenterX + uHelixTubeRadius * cos(animatedPhi);
            pos.z = ringCenterZ + uHelixTubeRadius * sin(animatedPhi);`,
});

// GRID — the flat, regular lattice ("technical drawing paper") is otherwise
// completely inert, so the two effects below are the entire life of this
// shape. Both are deliberately organic/irregular: angle- and
// position-dependent simplex noise breaks what would otherwise be a
// mathematically perfect concentric wavefront/ring, to match Profile/TERRAIN's
// organic feel instead of reading as a clean technical simulation.
const STYLE_GRID = new ParticleStyleDefinition('grid', {
  uniforms: {
    uGridProgress: { value: 0 },
    // THREE.Vector2, not a plain array: animate() calls .set(x, y) on both
    // of these every frame. This file loads after three.min.js (see the
    // script order in particle-morph.hbs), so THREE is available here.
    uMouseWorld: { value: new THREE.Vector2(0, 0) },
    uClickPos: { value: new THREE.Vector2(0, 0) },
    uClickTime: { value: -1000 },
    uGridWaveAmp: { value: 0.6 },
    uGridWaveFreq: { value: 1.2 },
    uGridWaveSpeed: { value: 2.0 },
    uGridWaveFalloff: { value: 0.15 },
    uGridRippleAmp: { value: 1.6 },
    uGridRippleSpeed: { value: 6.0 },
    uGridRippleWidth: { value: 1.2 },
    uGridRippleLife: { value: 2.5 },
  },
  amount: 'uGridProgress',
  progressUniform: 'uGridProgress',
  displace: `
            // 1) Mouse-follow wave: radial ripple centred on the cursor
            // projected onto the grid's X/Z plane. The distance carrier is a
            // sine-with-falloff whose phase is perturbed by spatial simplex
            // noise, so the wavefront wobbles instead of forming perfect
            // concentric circles.
            vec2 toMouse = basePos.xz - uMouseWorld;
            float mouseDist = length(toMouse);
            float mouseWaveNoise = snoise(vec3(basePos.xz * 0.35, uTime * 0.12)) * 2.5;
            float mouseWave = sin(mouseDist * uGridWaveFreq - uTime * uGridWaveSpeed + mouseWaveNoise)
              * exp(-mouseDist * uGridWaveFalloff);
            pos.y += mouseWave * uGridWaveAmp * uGridProgress;

            // 2) Click ripple: a single expanding, decaying ring seeded at
            // uClickTime/uClickPos. uClickTime starts far in the past so the
            // ring is simply never visible before the first click — no
            // separate "has clicked yet" flag needed. The radius is perturbed
            // with angle-dependent noise so the front reads as a wobbly blob.
            float tSinceClick = uTime - uClickTime;
            if (tSinceClick >= 0.0 && tSinceClick < uGridRippleLife) {
              vec2 toClick = basePos.xz - uClickPos;
              float clickDist = length(toClick);
              float clickAngle = atan(toClick.y, toClick.x);
              float radiusNoise = snoise(vec3(cos(clickAngle) * 2.0, sin(clickAngle) * 2.0, uTime * 0.2))
                * uGridRippleWidth * 0.8;
              float rippleRadius = tSinceClick * uGridRippleSpeed + radiusNoise;
              float ring = exp(-pow((clickDist - rippleRadius) / uGridRippleWidth, 2.0));
              float decay = 1.0 - (tSinceClick / uGridRippleLife);
              pos.y += ring * decay * uGridRippleAmp * uGridProgress;
            }`,
});

// FREE FLOAT — the particle-budget knob. Splits the field into particles
// that FORM THE SHAPE and particles that ignore it entirely and drift on
// their own, breaking the field's read as a single rigid object.
//
// uFreeFloatRatio is the whole control: 0 (default) is exactly the old
// behaviour — every particle forms the shape and the gate below is never
// entered — and 0.05 sends ~5% of them adrift. Because the split is a
// threshold on the per-particle hash (aRoleHash, see createParticles), it
// is retunable live from one uniform, with no buffer rebuild and no role
// flicker across a morph.
//
// Free positions are DERIVED from the hash rather than stored: three
// decorrelated values off the same seed give a stable scatter, so this
// costs one float per particle instead of a second position buffer.
const STYLE_FREE_FLOAT = new ParticleStyleDefinition('free-float', {
  uniforms: {
    uFreeFloatRatio: { value: 0 },
    uFreeFloatRadius: { value: 9.0 },
    uFreeFloatSpeed: { value: 0.08 },
    uFreeFloatDrift: { value: 1.6 },
    uFreeFloatSizeMul: { value: 0.75 },
  },
  attributes: ['aRoleHash'],
  amount: 'uFreeFloatRatio',
  progressUniform: null, // not shape-driven — a global budget, set by config
  declarations: `
      // Three decorrelated randoms from one seed. Same sin-hash family as
      // shape-definitions.js so it stays visually consistent with the
      // existing size/colour jitter.
      float freeHash(float seed, float salt) {
        float x = sin(seed * 127.1 + salt * 311.7) * 43758.5453;
        return fract(x);
      }`,
  displace: `
            if (aRoleHash < uFreeFloatRatio) {
              // Scatter across a sphere shell, then drift on three slow,
              // mutually-prime sine rates so no two particles share a path.
              float h1 = freeHash(aRoleHash, 1.0);
              float h2 = freeHash(aRoleHash, 2.0);
              float h3 = freeHash(aRoleHash, 3.0);
              float theta = h1 * 6.2831853;
              float phi = acos(2.0 * h2 - 1.0);
              float r = uFreeFloatRadius * (0.45 + 0.55 * h3);
              vec3 home = vec3(
                r * sin(phi) * cos(theta),
                r * cos(phi) * 0.55,
                r * sin(phi) * sin(theta)
              );
              vec3 drift = vec3(
                sin(uTime * uFreeFloatSpeed * (0.7 + h1) + h1 * 6.28),
                sin(uTime * uFreeFloatSpeed * (0.9 + h2) + h2 * 6.28),
                sin(uTime * uFreeFloatSpeed * (1.1 + h3) + h3 * 6.28)
              ) * uFreeFloatDrift;
              pos = home + drift;
            }`,
  // Free particles read as background texture, not structure — smaller.
  sizeMul: `        if (aRoleHash < uFreeFloatRatio) styleSizeMul *= uFreeFloatSizeMul;`,
});


// HALFTONE — printed-dot rendering rather than light sources. The opposite
// of the default treatment in every respect: hard-edged circles instead of a
// soft hex bokeh, no glow halo, monochrome instead of per-particle accents,
// and size/opacity BOTH ramping with depth so the near field reads as
// discrete resolvable dots and the far field as continuous fine texture.
// That depth gradient is what produces the monumental quality — it is not a
// dimming effect, it is a density effect.
//
// uHalftoneProgress 0 (default) is exactly the old look: every contribution
// below multiplies through it, and the fragment path cross-fades, so the two
// styles can coexist and blend rather than being a hard switch.
const STYLE_HALFTONE = new ParticleStyleDefinition('halftone', {
  uniforms: {
    uHalftoneProgress: { value: 0 },
    // Depth window the ramps are measured across, in world units from the
    // camera. Anything nearer than uHalftoneNear gets the near treatment,
    // anything beyond uHalftoneFar the far one.
    uHalftoneNear: { value: 6.0 },
    uHalftoneFar: { value: 26.0 },
    uHalftoneSizeNear: { value: 3.6 },
    uHalftoneSizeFar: { value: 0.7 },
    uHalftoneAlphaNear: { value: 0.65 },
    uHalftoneAlphaFar: { value: 0.12 },
    // Screen-space column guard: normalised X beyond which particles fade
    // out, so the field can never compete with the headline/body copy.
    // 1.0 disables it.
    uHalftoneMaskFrom: { value: 1.0 },
    uHalftoneMaskTo: { value: 1.0 },
    uHalftoneMaskAlpha: { value: 0.1 },
    // The dot ink. Explicit, not derived: collapsing the particle colour to
    // its own luminance produced near-black dots on this palette, because
    // the base particle colour is already dark. The spec calls for
    // "background lightness +12-18%", which is a value ABOUT the page, not
    // about the particle — so it has to be supplied.
    uHalftoneInk: { value: new THREE.Color(0.62, 0.63, 0.65) },
  },
  varyings: { vHalftoneAlpha: 'float' },
  // NOT shape-driven: there is no state whose id is 'halftone', so the
  // usual "am I the current shape" blend would pin this at 0 forever. It is
  // a render mode you switch on — drive it with
  // loop.setStyleAmount('halftone', 0..1), which tweens the same uniform.
  progressUniform: null,
  // Depth-driven size + alpha. Must run postProject: mvPosition.z does not
  // exist during the sizeMul stage.
  postProject: `        if (uHalftoneProgress > 0.0001) {
          float depth = clamp((-mvPosition.z - uHalftoneNear)
            / max(uHalftoneFar - uHalftoneNear, 0.001), 0.0, 1.0);
          // gl_PointSize is in DEVICE pixels, and these sizes are authored
          // in CSS px, so the conversion is devicePixelRatio. uDprNorm is
          // dpr/2 (the default path wants it pre-halved), hence the *2.0 —
          // using uDprNorm directly made every dot half the intended size,
          // which at dpr 1 pushed the far field below one pixel and it
          // effectively vanished.
          float htSize = mix(uHalftoneSizeNear, uHalftoneSizeFar, depth) * (uDprNorm * 2.0);
          gl_PointSize = mix(gl_PointSize, htSize, uHalftoneProgress);
          vHalftoneAlpha = mix(uHalftoneAlphaNear, uHalftoneAlphaFar, depth);

          // Screen-column guard, in clip space (before the perspective
          // divide gl_Position implies, so compute NDC x explicitly).
          vec4 clip = projectionMatrix * mvPosition;
          float ndcX = clip.x / max(abs(clip.w), 0.0001);
          float colMix = smoothstep(uHalftoneMaskFrom, uHalftoneMaskTo, ndcX * 0.5 + 0.5);
          vHalftoneAlpha = mix(vHalftoneAlpha, min(vHalftoneAlpha, uHalftoneMaskAlpha), colMix);
        }`,
  // Monochrome: collapse the per-particle accents toward the field's own
  // base luminance. The accents (violet/pink/sparkle from generateColors)
  // are exactly what halftone must not have.
  colorize: `        if (uHalftoneProgress > 0.0001) {
          // Monochrome by REPLACEMENT, not by desaturation — the violet/pink
          // accents from generateColors are exactly what halftone must not
          // have, and desaturating them just yields dark grey.
          baseColor = mix(baseColor, uHalftoneInk, uHalftoneProgress);
        }`,
  // Hard circle, no halo, no HDR core — cross-faded against the default
  // bokeh sprite so the two styles blend instead of popping.
  fragmentBody: `        if (uHalftoneProgress > 0.0001) {
          // NO uSpriteScale here. That factor exists because the DEFAULT
          // path inflates gl_PointSize to make room for its glow halo, so
          // its fragment coords have to be scaled back. Halftone REPLACES
          // gl_PointSize with the exact dot size it wants, so the sprite is
          // not inflated and applying the factor anyway shrank the visible
          // disc to ~1/uSpriteScale of the dot — which is why the field
          // rendered almost invisible.
          float rHt = length(gl_PointCoord - vec2(0.5));
          // One-pixel-ish feather only: enough to avoid aliasing, not
          // enough to read as glow.
          float disc = 1.0 - smoothstep(0.42, 0.5, rHt);
          float htAlpha = disc * vHalftoneAlpha;
          finalColor = mix(finalColor, vColor, uHalftoneProgress);
          finalAlpha = mix(finalAlpha, htAlpha, uHalftoneProgress);
        }`,
  // Printed dots do not accumulate like light. Applied when halftone is the
  // dominant style — blending is material state, not a uniform, so it
  // cannot cross-fade; 0.5 is the switch point.
  materialState: { blending: 'normal' },
});

if (typeof window !== 'undefined') {
  window.ParticleStyleDefinition = ParticleStyleDefinition;
  window.STYLE_HALFTONE = STYLE_HALFTONE;
  window.STYLE_FREE_FLOAT = STYLE_FREE_FLOAT;
  window.ParticleStyleRegistry = ParticleStyleRegistry;
  window.STYLE_ORB = STYLE_ORB;
  window.STYLE_TERRAIN = STYLE_TERRAIN;
  window.STYLE_VOLATILITY = STYLE_VOLATILITY;
  window.STYLE_HELIX = STYLE_HELIX;
  window.STYLE_GRID = STYLE_GRID;

  // Registration order IS displacement order and must not be reordered
  // casually: helix writes pos.x/pos.z absolutely, while orb/terrain/
  // volatility/grid accumulate into pos. This matches the original
  // hand-written block order in the shader exactly.
  window.createDefaultParticleStyleRegistry = () =>
    new ParticleStyleRegistry()
      .register(STYLE_ORB)
      .register(STYLE_TERRAIN)
      .register(STYLE_VOLATILITY)
      .register(STYLE_HELIX)
      .register(STYLE_GRID)
      // LAST on purpose: free particles ignore whatever the shape styles
      // above did to `pos`, so this must have the final say.
      .register(STYLE_FREE_FLOAT)
      // Render treatment, so it comes after every displacement style.
      .register(STYLE_HALFTONE);
}
