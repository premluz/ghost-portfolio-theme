/**
 * Particle Animation Loop - Core renderer and state blending
 * Uses HDR + UnrealBloomPass for cinematic glow on hexagonal particles.
 */

// Bloom turned off entirely as a straight performance win — UnrealBloomPass
// is a full extra render pass plus several blur sub-passes every single
// frame, for a whole-page-lifetime ongoing cost. Kept as a flag, not
// ripped out, so re-enabling is a one-line flip — see _initComposer()'s
// own call site and antialias below, both tied to this same flag.
const BLOOM_ENABLED = false;

class ParticleAnimationLoop {
  constructor(container, particleCount, colorConfig, config = {}) {
    this.container = container;
    this.colorConfig = colorConfig;
    this.config = config;

    // Use particle count as passed (already adjusted for mobile in particle-morph.hbs)
    const isMobile = window.innerWidth < 768;
    this.particleCount = particleCount;  // Don't reduce again - already done at top level
    this.isMobile = isMobile;

    // Three.js setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // antialias tied to BLOOM_ENABLED: when bloom runs, its own blur passes
    // wash out MSAA's contribution anyway — pure waste. With bloom off,
    // AA is cheap and worth keeping for crisp point edges.
    this.renderer = new THREE.WebGLRenderer({ antialias: !BLOOM_ENABLED, alpha: true, preserveDrawingBuffer: false });

    // Device pixel ratio: capped at 2 (retina reference), and at 1 on
    // low-end hardware — fill cost scales with buffer pixels and is the
    // base-pass bottleneck on old integrated GPUs. Visual particle size
    // stays correct at any dpr via the uDprNorm uniform.
    const dpr = Math.min(window.devicePixelRatio, window.__lowEndDevice ? 1 : 2);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(dpr);
    this.renderer.autoClear = true;
    // TRANSPARENT canvas, both themes, always. (History: dark mode used an
    // opaque black clear + mix-blend-mode:screen purely so UnrealBloomPass
    // had an opaque buffer; bloom is gone — glow now lives in-sprite in the
    // fragment shader — so the dual-pipeline machinery, its 0.65
    // shift-threshold flip and the black-flash bridge frame are all
    // obsolete. Do not reintroduce an opaque clear.)
    this.renderer.setClearColor(0x000000, 0);

    // HDR tone mapping — required for bloom to look cinematic
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Position canvas as fixed overlay, non-blocking
    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    // mix-blend-mode: screen lives on #particle-morph-demo (the outermost container)
    // so it composites into the page stacking context — not here on the inner canvas.

    this.container.appendChild(canvas);

    // Scale down the particle system on mobile via CSS transform on the outermost
    // container (#particle-morph-demo = this.container.parentElement).
    // Fixed-position elements don't affect layout so this is safe.
    this._applyMobileScale();
    const onMobileScaleResize = () => this._applyMobileScale();
    if (window.resizeManager) this._unsubscribeMobileScaleResize = window.resizeManager.subscribe('particle-mobile-scale', onMobileScaleResize);
    else {
      window.addEventListener('resize', onMobileScaleResize, { passive: true });
      this._unsubscribeMobileScaleResize = () => window.removeEventListener('resize', onMobileScaleResize);
    }

    // Force canvas size update (critical for mobile)
    setTimeout(() => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }, 100);

    // Scale camera position for mobile (bring particles closer on small screens)
    this.camera.position.z = this.isMobile ? 14 : 8;  // further back on mobile = smaller shapes, full viewport

    // Lighting
    const light = new THREE.AmbientLight(0x00f0ff, 1);
    this.scene.add(light);

    // Particle system
    this.particles = null;
    this.currentState = null;
    this.nextState = null;
    this.morphProgress = 0;
    this.morphDuration = 0;
    this.morphStartTime = null;
    this.helixReached = false;

    // Animation state
    this.time = 0;
    // Zero-based clock for the GPU uTime uniform specifically — this.time
    // itself is Date.now()*0.001 (absolute epoch seconds), fine for the
    // existing CPU-side Math.sin() calls (JS doubles), but passed directly
    // into a GLSL float it'd be a ~1.78-billion-magnitude value with maybe
    // 2-3 significant fractional digits left at 32-bit float precision —
    // the noise's frame-to-frame phase change would be visibly stepped/
    // jittery instead of smooth. Starting from 0 keeps the uniform small
    // for the life of the page.
    this._orbClockStart = Date.now();
    this.autoRotation = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    // Raw mouse target — lerped toward each frame for smooth easing
    this._mouseTargetX = 0;
    this._mouseTargetY = 0;
    // Grid shape only: NDC-to-world scale for both the continuous mouse
    // wave (animate()) and the click ripple (setupClick()) — a single
    // source so the two stay in sync. Not a physical ray-plane projection,
    // a hand-tuned constant sized to the GRID shape's own half-extent
    // (shape-definitions.js's `size: 16`), same convention as every other
    // shape's amplitude/frequency taste constants in this file.
    this._gridMouseWorldScale = 7;

    // Postprocessing — populated async in _initComposer()
    this._composerReady = false;

    // Fix 3: callbacks registered here run every frame after render,
    // in the same RAF tick as blendStates() — avoids RAF desync.
    this._rafCallbacks = [];

    this.setupMouse();
    this.setupClick();
    this.setupResize();

    // Kick off async composer setup; animate() falls back to direct render
    // until ready. During a full preloader run, wait for preloader:done
    // first: UnrealBloomPass is expensive enough on weak/software GL to tank
    // the RAF rate, and every stage of the preloader's finish sequence
    // (burst ticks, GSAP fades, even its safety setTimeout) is frame-driven —
    // measured stretching _runParticles()→_hide() from ~2.4s to ~9.5s in dark
    // mode. Light mode never noticed because the inline theme patch
    // (particle-morph.hbs) disables the composer there entirely. Deferring
    // equalizes the themes (~7s page-ready both) at no visual cost: particles
    // sit behind the opaque preloader while it runs.
    if (BLOOM_ENABLED) {
      if (window.__preloaderDoneFired) {
        // preloader:done already fired before this constructor ever ran — the
        // real preloader sequence typically finishes well before the particle
        // system's own async bootstrap chain (GLB loads, GPU-vs-WebGL
        // resolution, etc.) does, so this is the common case, not an edge
        // case. Without this check, the addEventListener below silently
        // misses an event that already happened (CustomEvent dispatches
        // don't replay for late subscribers), leaving bloom stuck on the 20s
        // fallback timer every single load — exactly the "bloom changes do
        // nothing" symptom this was added to fix.
        this._initComposer();
      } else if (window.__preloaderRunning) {
        window.addEventListener('preloader:done', () => this._initComposer(), { once: true });
        // Belt-and-braces: if preloader:done somehow never fires, still get bloom.
        setTimeout(() => this._initComposer(), 20000);
      } else {
        this._initComposer();
      }
    }
    // BLOOM_ENABLED === false: _initComposer() is never called, so
    // _composerReady stays false forever and animate()'s existing
    // direct-render fallback (no composer needed) is simply the only path
    // — zero other code changes required for bloom to be fully off.
  }

  async _initComposer() {
    if (this._composerInitStarted) return;
    this._composerInitStarted = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      ]);

      const composer = new EffectComposer(this.renderer);
      composer.renderToScreen = true;

      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      // Reduce bloom on mobile for performance
      const isMobile = window.innerWidth < 768;
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        isMobile ? 0.7 : 1.6,   // strength — your current value, untouched
        isMobile ? 0.8 : 2.4,    // radius — your current value, untouched
        0.1                       // threshold — lowered back down. At 0.65 combined with the
                                  // darker particle color chain, nothing in the scene ever
                                  // crossed this gate, so strength/radius (however high) had
                                  // no HDR-bright input left to amplify at all.
      );
      composer.addPass(bloomPass);

      this._bloomPass = bloomPass;
      this._composer = composer;
      this._composerReady = true;
    } catch (err) {
      console.warn('[ParticleAnimationLoop] Bloom unavailable, falling back to direct render:', err);
    }
  }

  createParticles(positions, colors, sizes, phis) {
    if (this.particles) {
      this.scene.remove(this.particles);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(positions), 3);
    geo.setAttribute('position', posAttr);

    if (colors) {
      const colorAttr = new THREE.BufferAttribute(new Float32Array(colors), 3);
      geo.setAttribute('color', colorAttr);
    }

    // Size variation for density/complexity
    if (sizes) {
      const sizeAttr = new THREE.BufferAttribute(new Float32Array(sizes), 1);
      geo.setAttribute('size', sizeAttr);
    } else {
      // Fallback: uniform size
      const uniformSizes = new Float32Array(positions.length / 3).fill(1.0);
      const sizeAttr = new THREE.BufferAttribute(uniformSizes, 1);
      geo.setAttribute('size', sizeAttr);
    }

    // Helix-only per-particle tube angle (see uHelixProgress in the vertex
    // shader). Always created — filled with 0 when not helix — because the
    // shader unconditionally declares this attribute, so every geometry
    // built here needs it present, not just helix's own.
    const helixPhiAttr = new THREE.BufferAttribute(
      phis ? new Float32Array(phis) : new Float32Array(positions.length / 3),
      1
    );
    geo.setAttribute('helixPhi', helixPhiAttr);

    // GPU morph buffers: destination shape + per-frame progress live on the
    // GPU (aTargetPos/aTargetSize + uMorphProgress). Initialised to a copy
    // of the rest state so uMorphProgress = 0 is exactly "no morph".
    geo.setAttribute('aTargetPos', new THREE.BufferAttribute(new Float32Array(posAttr.array), 3));
    geo.setAttribute('aTargetSize', new THREE.BufferAttribute(new Float32Array(geo.attributes.size.array), 1));

    // ShaderMaterial gives us full control — no string-replacement fragility.
    // Vertex shader replicates PointsMaterial's sizeAttenuation in clip space.
    // Fragment shader draws a 6-sided bokeh polygon with an HDR white-hot core
    // (values > 1.0) fading to HDR cyan at the edges, discarding outside the hex.
    // UnrealBloomPass picks up anything above its threshold and spreads it as bloom.
    const vertexShader = `
      attribute vec3 color;
      attribute float size;
      attribute float helixPhi;
      // GPU morph: destination shape lives on the GPU; uMorphProgress
      // (eased, 0 = resting) mixes toward it per-vertex. One uniform write
      // per frame replaces the old CPU lerp + full-buffer re-upload.
      attribute vec3 aTargetPos;
      attribute float aTargetSize;
      uniform float uMorphProgress;
      uniform float uSpriteScale; // 1.5 with glow halo, 1.0 on low-end (no halo)
      uniform float sizeScale;
      uniform float uDprNorm; // devicePixelRatio / 2 — see uniforms block
      uniform float uWavefront;
      uniform float uWaveFalloff;
      uniform vec3 uWaveColor;
      uniform bool uPrefersReducedMotion;
      uniform float uTime;
      uniform float uOrbAmp;
      uniform float uOrbFreq;
      uniform float uOrbSpeed;
      uniform float uLabProgress;
      uniform float uTerrainAmp;
      uniform float uTerrainFreq;
      uniform float uTerrainSpeed;
      uniform float uTerrainProgress;
      uniform float uGridProgress;
      uniform vec2 uMouseWorld;
      uniform vec2 uClickPos;
      uniform float uClickTime;
      uniform float uGridWaveAmp;
      uniform float uGridWaveFreq;
      uniform float uGridWaveSpeed;
      uniform float uGridWaveFalloff;
      uniform float uGridRippleAmp;
      uniform float uGridRippleSpeed;
      uniform float uGridRippleWidth;
      uniform float uGridRippleLife;
      uniform float uHelixProgress;
      uniform float uHelixTubeRadius;
      uniform float uHelixWaveAmp;
      uniform float uHelixWaveFreq;
      uniform float uHelixWaveSpeed;
      varying vec3 vColor;

      // ── Ashima simplex noise (3D), public domain ──
      // Reached for the Lab/orb state (uOrbAmp * uLabProgress > 0) and the
      // Terrain state (uTerrainAmp * uTerrainProgress > 0) below — every
      // other shape pays nothing for this.
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      void main() {
        vec3 baseColor = color;

        // GPU morph mix — all shape effects below operate on the morphed
        // rest position, matching what the old CPU blendStates() produced.
        vec3 basePos = mix(position, aTargetPos, uMorphProgress);
        float baseSize = mix(size, aTargetSize, uMorphProgress);

        // Lab orb: permanent, non-resolving deformation. Rest positions are
        // the sphere distribution (see shape-definitions.js's LAB state);
        // displaced radially by 2-octave simplex noise so folds read as a
        // handful of large, slow-moving lobes, not high-frequency shimmer.
        // Gated by uOrbAmp * uLabProgress — zero for every other shape (amp
        // only ever nonzero while the Lab state is current) and zero while
        // scrolled away from the Lab section (labProgress), so scrubbing
        // back re-freezes the orb toward the plain rest sphere. The branch
        // below also means the 2 extra snoise() calls are skipped entirely
        // — not just visually zeroed — whenever the orb isn't the active,
        // in-view shape.
        vec3 pos = basePos;
        float orbNoise = 0.0;
        float orbAmount = uOrbAmp * uLabProgress;
        if (orbAmount > 0.0001) {
          float n1 = snoise(basePos * uOrbFreq + uTime * uOrbSpeed) * 0.65;
          float n2 = snoise(basePos * uOrbFreq * 2.03 + uTime * uOrbSpeed * 1.3 + 11.0) * 0.35;
          orbNoise = n1 + n2;
          vec3 dir = normalize(basePos);
          pos = basePos + dir * orbNoise * orbAmount;
        }

        // Terrain: the Profile section's counterpart to the Lab orb — also
        // permanent/non-resolving, but the ground itself moving rather than
        // an object deforming. Rest positions are the flat X/Z plane (see
        // shape-definitions.js's TERRAIN state); displaced along Y ONLY,
        // sampling 2D simplex noise across X/Z with time folded into the
        // 3rd input (a standard animated-heightfield technique) so the
        // whole field rolls smoothly rather than each particle jittering
        // independently. See uTerrainAmp/Freq/Speed's uniform declaration
        // for the amplitude/pace tuning history — distinctly slower/
        // broader than the Lab orb, but with proportionally more amplitude
        // to stay clearly visible against the shared object rotation.
        float terrainAmount = uTerrainAmp * uTerrainProgress;
        if (terrainAmount > 0.0001) {
          float tn1 = snoise(vec3(basePos.x, basePos.z, uTime * uTerrainSpeed) * uTerrainFreq) * 0.7;
          float tn2 = snoise(vec3(basePos.x, basePos.z, uTime * uTerrainSpeed * 0.6 + 31.0) * uTerrainFreq * 2.1) * 0.3;
          pos.y += (tn1 + tn2) * terrainAmount;
        }

        // Helix: wavy motion confined EXACTLY to the tube's own surface —
        // never inside, never outside. helixPhi (per-vertex attribute, see
        // shape-definitions.js's helixGenerator) is the single combined
        // angle such that the rest position satisfies
        // position.xz = ringCenter + tubeRadius*(cos(helixPhi), sin(helixPhi)).
        // We recover ringCenter algebraically from the rest position itself
        // (no need to store it), then re-evaluate that SAME circle equation
        // at a time-animated phi. This is an algebraic identity, not an
        // approximation: for any phi offset, the result is still exactly
        // tubeRadius from ringCenter — the surface cannot bulge or cave in,
        // by construction. Y is left completely untouched (phi has no
        // effect on it), so it can't distort that axis either.
        float helixAmount = uHelixProgress;
        if (helixAmount > 0.0001) {
          float ringCenterX = basePos.x - uHelixTubeRadius * cos(helixPhi);
          float ringCenterZ = basePos.z - uHelixTubeRadius * sin(helixPhi);
          float wave = sin(helixPhi * uHelixWaveFreq + uTime * uHelixWaveSpeed) * uHelixWaveAmp;
          float animatedPhi = helixPhi + wave * helixAmount;
          pos.x = ringCenterX + uHelixTubeRadius * cos(animatedPhi);
          pos.z = ringCenterZ + uHelixTubeRadius * sin(animatedPhi);
        }

        // Grid: the flat, regular lattice ("technical drawing paper") is
        // otherwise completely inert — no ambient noise like Lab/Terrain —
        // so the two effects below are the entire life of this shape.
        // Gated by uGridProgress the same way orb/terrain are gated by
        // their own shape-driven progress uniforms (see animate()); zero
        // cost on every other shape.
        //
        // Both effects are deliberately organic/irregular — angle- and
        // position-dependent simplex noise (the same snoise() Lab/Terrain
        // already use above) breaks what would otherwise be a
        // mathematically perfect concentric-circle wavefront/ring, to
        // match Profile/TERRAIN's organic, non-diagrammatic feel instead
        // of reading as a clean technical simulation.
        //
        // Previous plain-circular version kept below, unused, in case we
        // want to revert:
        // float mouseDist = length(position.xz - uMouseWorld);
        // float mouseWave = sin(mouseDist * uGridWaveFreq - uTime * uGridWaveSpeed)
        //   * exp(-mouseDist * uGridWaveFalloff);
        // pos.y += mouseWave * uGridWaveAmp * uGridProgress;
        // float tSinceClick = uTime - uClickTime;
        // if (tSinceClick >= 0.0 && tSinceClick < uGridRippleLife) {
        //   float clickDist = length(position.xz - uClickPos);
        //   float rippleRadius = tSinceClick * uGridRippleSpeed;
        //   float ring = exp(-pow((clickDist - rippleRadius) / uGridRippleWidth, 2.0));
        //   float decay = 1.0 - (tSinceClick / uGridRippleLife);
        //   pos.y += ring * decay * uGridRippleAmp * uGridProgress;
        // }
        if (uGridProgress > 0.0001) {
          // 1) Mouse-follow wave: radial ripple centered on the cursor's
          // position projected onto the grid's X/Z plane (uMouseWorld, fed
          // from the existing eased this.mouseX/this.mouseY in animate() —
          // see its own comment for the NDC-to-world scale). The distance
          // carrier is the same sine-with-falloff as before, but its phase
          // is perturbed by spatial simplex noise so the wavefront wobbles
          // instead of forming perfect concentric circles.
          vec2 toMouse = basePos.xz - uMouseWorld;
          float mouseDist = length(toMouse);
          float mouseWaveNoise = snoise(vec3(basePos.xz * 0.35, uTime * 0.12)) * 2.5;
          float mouseWave = sin(mouseDist * uGridWaveFreq - uTime * uGridWaveSpeed + mouseWaveNoise)
            * exp(-mouseDist * uGridWaveFalloff);
          pos.y += mouseWave * uGridWaveAmp * uGridProgress;

          // 2) Click ripple: a single expanding, decaying ring seeded at
          // uClickTime/uClickPos by the click listener in animate()'s
          // setup. uClickTime starts far in the past (see uniform default)
          // so the ring is simply never visible before the first click —
          // no separate "has clicked yet" flag needed. The ring's radius
          // is perturbed with angle-dependent simplex noise (same
          // technique as the organic boundary mask in shape-definitions.js)
          // so the expanding front reads as a wobbly blob, not a
          // mathematically perfect circle.
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
          }
        }

        // Lab wave: scroll-driven color shift propagates from top (section entry) downward
        // Distance from wavefront (negative = above wave, positive = below)
        float waveDistance = basePos.y - uWavefront;

        // Reduced-motion: bake in the final post-wave color (no sweep)
        if (uPrefersReducedMotion) {
          baseColor = mix(color, uWaveColor, 0.8);
        } else {
          // Smooth falloff around wavefront: particles the wave has already
          // passed (waveDistance >= 0, since uWavefront descends from maxY
          // toward minY as scroll progresses) blend toward wave color;
          // particles above/ahead of it stay base color. Edge order matters
          // here — smoothstep(-falloff, falloff, x) is the increasing ramp
          // this needs; the previously-reversed order (falloff, -falloff)
          // made the wave paint on fully at section ENTRY and fade back to
          // base as you scrolled further in — backwards from "propagates
          // downward as you scroll."
          float waveMix = smoothstep(-uWaveFalloff, uWaveFalloff, waveDistance);
          baseColor = mix(color, uWaveColor, waveMix * 0.95);
        }

        // Deformation-weighted bloom: the orb's folds (largest |orbNoise|)
        // pull further toward the wave hue; calm surface stays at the plain
        // wave-blended base color. No-op (orbAmount already 0) off-orb.
        baseColor = mix(baseColor, uWaveColor, abs(orbNoise) * uLabProgress * 0.6);

        vColor = baseColor;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        // uSpriteScale: extra sprite room for the in-sprite glow halo (the
        // fragment shader scales its coords to keep the hex body the same
        // visual size). 1.0 on low-end devices — no halo, no extra fill.
        gl_PointSize = (0.09 * baseSize * sizeScale) * (300.0 / -mvPosition.z) * uDprNorm * uSpriteScale;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      #define PI 3.14159265359

      varying vec3 vColor;
      uniform float uGlowStrength;
      uniform float uSpriteScale;

      void main() {
        // Sprite coords: the vertex shader enlarged gl_PointSize by 1.5x to
        // make room for the glow halo — scale coords back up so the hex
        // body keeps its original visual size in the sprite's inner region.
        vec2 p = (gl_PointCoord - vec2(0.5)) * uSpriteScale;
        float r = length(p);
        if (r > 0.72) discard;   // fully outside the halo range (no-op at scale 1.0)

        float angle = atan(p.y, p.x);
        float slice = PI / 3.0;                          // 60 degrees per sector
        float polyDist = r * cos(mod(angle, slice) - slice * 0.5);

        // polyDist == 0.5 at the hex boundary → mask goes 0→1 inward
        float bokeh = smoothstep(0.5, 0.3, polyDist);
        float coreMask = pow(bokeh, 4.0);

        // IN-SPRITE GLOW — the replacement for UnrealBloomPass. A soft
        // radial halo outside the hex body; additive blending (SrcAlpha,
        // One) accumulates overlapping halos into the same haze bloom used
        // to produce, for ~zero cost. This is the DNA-Capital recipe:
        // additive blending + soft-edged sprites + HDR-hot cores, no post-
        // processing. Faded to zero before the sprite edge (smoothstep) so
        // nothing ever clips against the square sprite bounds.
        float halo = exp(-r * 4.0) * (1.0 - bokeh) * smoothstep(0.72, 0.35, r) * uGlowStrength;

        vec3 coreColor = vColor * 1.8;   // HDR-hot centre; ACES rolls it off

        float alphaBody = pow(bokeh, 2.0) * 0.9;
        float finalAlpha = min(alphaBody + halo, 1.0);
        if (finalAlpha <= 0.004) discard;

        // Weighted colour of the two regions (blending multiplies by
        // srcAlpha, so each keeps its intended intensity).
        vec3 finalColor = (mix(vColor, coreColor, coreMask * 0.35) * alphaBody
                          + vColor * 1.2 * halo) / finalAlpha;

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        // DPR NORMALISATION — direction matters, this burned a whole session:
        // gl_PointSize is a DRAWING-BUFFER pixel count. With setPixelRatio(2)
        // the retina buffer is 2x the CSS size, so the same value covers
        // HALF the CSS-visual area on retina vs a 1x display. The retina
        // "fine dust" look is the design reference, therefore 1x displays
        // were rendering every particle at 2x the intended visual diameter
        // (~4x area under additive blending — the "thick blobby hexes over
        // bloom" report). An earlier fix boosted 1x sizes via max(1, 2/dpr)
        // — the OPPOSITE direction — and could only ever look "still huge".
        // uDprNorm = dpr/2 anchors every display to the retina footprint:
        // x1.0 at dpr 2 (reference, unchanged), x0.5 at dpr 1, x0.75 at 1.5.
        // Measured coverage before: 9.68%/1.94%/0.66% at dpr 1/1.5/2 —
        // after: near-equal across all three.
        uDprNorm: { value: this.renderer.getPixelRatio() / 2.0 },
        sizeScale: { value: this.isMobile ? 0.5 : 0.8 },
        // GPU morph progress — eased in animate(); 0 = resting on `position`.
        uMorphProgress: { value: 0 },
        // In-sprite halo strength (the bloom replacement, see fragment
        // shader). Low-end devices skip the halo entirely — the 1.5x sprite
        // enlargement alone is 2.25x the fill per particle, real money on
        // old integrated GPUs; they get crisp 1x dots instead.
        uGlowStrength: { value: window.__lowEndDevice ? 0.0 : 0.55 },
        uSpriteScale: { value: window.__lowEndDevice ? 1.0 : 1.5 },
        uWavefront: { value: 0 },              // Driven by Lab section scroll progress
        uWaveFalloff: { value: 2.0 },          // Gradient width around wavefront
        uWaveColor: { value: new THREE.Color(0xda70d6) },  // Orchid (pinkish-purple)
        uPrefersReducedMotion: { value: window.matchMedia('(prefers-reduced-motion: reduce)').matches },
        // Lab orb (perpetually-deforming sphere) — see vertex shader.
        // uTime advances every frame in animate() (reduced-motion: set once
        // here, then left alone — see the reduced-motion guard there).
        // uOrbAmp/uOrbFreq/uOrbSpeed are taste constants; uLabProgress (0-1)
        // is shape-driven (see animate()), not scroll-driven.
        // uOrbAmp/uOrbSpeed pushed further per explicit "larger, faster"
        // direction, past the ~0.4 point where strand-like separation
        // starts showing at some rotation angles (see git history/prior
        // session notes for the coherence-ceiling explanation) — accepted
        // as the intended look now, not a regression.
        // uOrbSpeed halved (0.45 → 0.225) per explicit "2x slower" morph
        // request — folding speed only, uOrbAmp/uOrbFreq (fold size/scale)
        // untouched.
        uTime: { value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 3.0 : 0 },
        uOrbAmp: { value: 1.1 },
        uOrbFreq: { value: 0.4 },
        uOrbSpeed: { value: 0.225 },
        uLabProgress: { value: 0 },
        // Terrain (perpetually-rolling ground plane) — see vertex shader.
        // uTerrainProgress (0-1) is shape-driven the same way uLabProgress
        // is (see animate()). History: first tuned slower/broader than Lab
        // (0.14/0.13, amp 2.4) — read as barely-morphing, indistinguishable
        // from just the shared object rotation. Matched exactly to Lab's
        // own values next (0.4/0.45/1.1) to confirm the motion itself
        // wasn't broken — it wasn't; the earlier version's problem was
        // amplitude, not pace. Now differentiated again with that lesson
        // applied: still distinctly slower/broader than Lab (roughly half
        // the frequency and speed — broad, rolling waves vs Lab's tighter,
        // faster wobble), but with proportionally MORE amplitude than
        // Lab's own 1.1, since terrain's field (13×11) is much larger than
        // Lab's 3-unit-radius sphere — 1.1 units of displacement reads as
        // strong on that small a sphere, but faint smoothed over a field
        // 4x wider. ~30% of the field's own width, roughly matching Lab's
        // ~37%-of-radius proportion, at half the pace.
        uTerrainAmp: { value: 3.6 },
        uTerrainFreq: { value: 0.2 },
        uTerrainSpeed: { value: 0.22 },
        uTerrainProgress: { value: 0 },
        // Grid (interactive lattice, "technical drawing paper") — see
        // vertex shader. uGridProgress (0-1) is shape-driven the same way
        // uLabProgress/uTerrainProgress are (see animate()). uMouseWorld
        // and uClickPos/uClickTime are updated every frame in animate(),
        // not tuning constants — see setupGridInteraction().
        // uGridWaveAmp/Freq/Speed/Falloff are taste constants for the
        // continuous mouse-follow ripple; uGridRippleAmp/Speed/Width/Life
        // are taste constants for the one-shot click pulse.
        uGridProgress: { value: 0 },
        uMouseWorld: { value: new THREE.Vector2(0, 0) },
        uClickPos: { value: new THREE.Vector2(0, 0) },
        // Starts far in the past so tSinceClick > uGridRippleLife before
        // any click ever happens — the shader's own life-window check
        // (tSinceClick < uGridRippleLife) then keeps the ring invisible
        // with no separate "has clicked yet" flag needed.
        uClickTime: { value: -1000 },
        uGridWaveAmp: { value: 0.6 },
        uGridWaveFreq: { value: 1.2 },
        uGridWaveSpeed: { value: 2.0 },
        uGridWaveFalloff: { value: 0.15 },
        uGridRippleAmp: { value: 1.6 },
        uGridRippleSpeed: { value: 6.0 },
        uGridRippleWidth: { value: 1.2 },
        uGridRippleLife: { value: 2.5 },
        // Helix (surface-confined wavy motion) — see vertex shader.
        // uHelixProgress (0-1) is shape-driven the same way uLabProgress/
        // uTerrainProgress/uGridProgress are (see animate()). uHelixTubeRadius
        // MUST match helixGenerator's own hardcoded tubeRadius (1.5) — it's
        // what lets the shader recover each particle's ring center from its
        // rest position; if the generator's tube radius ever changes, update
        // this to match or the surface constraint breaks. uHelixWaveFreq is
        // in "per radian of phi" terms (how many wave crests appear going
        // once around a tube ring); uHelixWaveAmp is in radians of angular
        // offset (small, since it's an angle, not a distance — 0.35 rad is
        // already a very visible wobble at this tube radius); uHelixWaveSpeed
        // is the animation pace.
        uHelixProgress: { value: 0 },
        uHelixTubeRadius: { value: 1.5 },
        // Wave turned off per explicit "turn off particle movement morphing
        // on helix" request — amplitude 0 means the shader block still runs
        // (uHelixProgress still gated/blended each frame, helixPhi still
        // synced) but produces zero displacement, so helix renders as a
        // plain static tube again. All the plumbing is left connected —
        // set this back to a nonzero value (was 0.35) to re-enable.
        uHelixWaveAmp: { value: 0 },
        uHelixWaveFreq: { value: 3.0 },
        uHelixWaveSpeed: { value: 1.4 },
      }
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  /**
   * Get the y-extent of a particle field (used by wave system to map scroll
   * progress to wavefront position). Pass an explicit positions array (e.g.
   * a specific state's own rest positions) to measure THAT shape regardless
   * of what's currently live on screen — the live geometry buffer can be
   * mid-morph or showing a completely different shape at call time, which
   * silently produces the wrong bounds if that's not what the caller wants.
   * With no argument, falls back to the live buffer (previous behavior).
   */
  getParticleBounds(positions) {
    if (!positions) {
      if (!this.particles || !this.particles.geometry.attributes.position) {
        return { minY: -5, maxY: 5 };  // Fallback
      }
      positions = this.particles.geometry.attributes.position.array;
    }
    let minY = positions[1];
    let maxY = positions[1];
    for (let i = 1; i < positions.length; i += 3) {
      const y = positions[i];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minY, maxY };
  }

  setColors(colors) {
    console.log('[particles-loop] setColors called');
    if (this.particles && colors) {
      const geo = this.particles.geometry;
      const posCount = geo.attributes.position ? geo.attributes.position.count : 0;
      const colorCount = geo.attributes.color ? geo.attributes.color.count : 0;
      console.log('[particles-loop] geometry particle count from position:', posCount,
                  '| existing color attribute count:', colorCount,
                  '| new colors length:', colors.length);

      if (colors.length !== posCount * 3) {
        console.warn('[particles-loop] color/particle count mismatch — new colors:', colors.length,
                     'expected:', posCount * 3);
      }

      const oldColors = colorCount ? Array.from(geo.attributes.color.array.slice(0, 3)).map(v => v.toFixed(3)) : 'none';
      const newColorsSample = Array.from(colors.slice(0, 3)).map(v => v.toFixed(3));
      console.log('[particles-loop] old color sample:', oldColors, '→ new color sample:', newColorsSample);

      // Reuse existing BufferAttribute when possible — Three.js keeps the GPU buffer
      // binding and just uploads the new data. Creating a new attribute each time can
      // occasionally fail to update the active shader program.
      if (geo.attributes.color && geo.attributes.color.array.length === colors.length) {
        const arr = geo.attributes.color.array;
        arr.set(colors);
        geo.attributes.color.needsUpdate = true;
        console.log('[particles-loop] existing color array updated');
      } else {
        const colorAttr = new THREE.BufferAttribute(new Float32Array(colors), 3);
        geo.setAttribute('color', colorAttr);
        geo.attributes.color.needsUpdate = true;
        console.log('[particles-loop] color attribute replaced');
      }
      this.particles.material.needsUpdate = true;
    } else {
      console.warn('[particles-loop] particles or colors missing:', !!this.particles, !!colors);
    }
  }

  // Bake the CURRENTLY VISIBLE morph blend into the position/size buffers.
  // Called when a new morph interrupts one mid-flight: the new morph then
  // departs from what the viewer actually sees, instead of snapping back to
  // the stale start shape — that snap-back was the "morph never finishes /
  // leaves weird artifacts" bug, worst on slow machines where the scrub-lag
  // trigger re-fires (see COMMON_ISSUES.md) make interrupts the common case.
  _bakeMorphIntoPosition() {
    const geo = this.particles && this.particles.geometry;
    if (!geo || !geo.attributes.aTargetPos) return;
    const t = this.morphProgress;
    const eased = t * (2 - t);              // same ease-out the shader uses
    const pos = geo.attributes.position, tgt = geo.attributes.aTargetPos;
    for (let i = 0; i < pos.array.length; i++) {
      pos.array[i] += (tgt.array[i] - pos.array[i]) * eased;
    }
    pos.needsUpdate = true;
    const sz = geo.attributes.size, tsz = geo.attributes.aTargetSize;
    if (sz && tsz) {
      for (let i = 0; i < sz.array.length; i++) {
        sz.array[i] += (tsz.array[i] - sz.array[i]) * eased;
      }
      sz.needsUpdate = true;
    }
    const u = this.particles.material?.uniforms?.uMorphProgress;
    if (u) u.value = 0;
  }

  setState(state, duration = 0) {
    if (!this.currentState) {
      this.currentState = state;
      this.createParticles(state.positions, this.colorConfig.generate(this.particleCount, state), state.sizes, state.phis);
    } else if (duration > 0) {
      const geo = this.particles && this.particles.geometry;
      if (geo && geo.attributes.aTargetPos) {
        // Interrupting a morph mid-flight: bake what's on screen first.
        if (this.morphStartTime && this.nextState) this._bakeMorphIntoPosition();
        // ONE-TIME upload of the destination — per-frame interpolation now
        // happens in the vertex shader via uMorphProgress (this replaces
        // blendStates()'s per-frame CPU lerp + full buffer re-upload, the
        // main-thread cost that made morphs the laggy moment on old GPUs).
        const tgt = geo.attributes.aTargetPos;
        const n = Math.min(tgt.array.length, state.positions.length);
        for (let i = 0; i < n; i++) tgt.array[i] = state.positions[i];
        tgt.needsUpdate = true;
        const tsz = geo.attributes.aTargetSize;
        if (tsz && state.sizes) {
          const m = Math.min(tsz.array.length, state.sizes.length);
          for (let i = 0; i < m; i++) tsz.array[i] = state.sizes[i];
          tsz.needsUpdate = true;
        }
      }
      this.nextState = state;
      this.morphProgress = 0;
      this.morphDuration = duration;
      this.morphStartTime = Date.now();
    } else {
      this.currentState = state;
      this.morphProgress = 0;
      this.morphStartTime = null;
      this.nextState = null;
      this.createParticles(state.positions, this.colorConfig.generate(this.particleCount, state), state.sizes, state.phis);
    }
  }

  _applyMobileScale() {
    // Camera z-distance handles mobile sizing — no CSS transform needed
  }

  setupMouse() {
    window.addEventListener('mousemove', (e) => {
      this._mouseTargetX = (e.clientX / window.innerWidth) * 2 - 1;
      this._mouseTargetY = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });
  }

  // Grid click ripple — only meaningful while 'grid' is the active shape
  // (the shader gates the whole displacement on uGridProgress), but the
  // listener itself is unconditional and cheap, same as setupMouse() above
  // tracking mouse position regardless of which shape is on screen.
  setupClick() {
    window.addEventListener('click', (e) => {
      if (!this.particles) return;
      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
      const uniforms = this.particles.material.uniforms;
      uniforms.uClickPos.value.set(ndcX * this._gridMouseWorldScale, -ndcY * this._gridMouseWorldScale);
      uniforms.uClickTime.value = uniforms.uTime.value;
    }, { passive: true });
  }

  setupResize() {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);

      // Update device pixel ratio on resize (for orientation changes AND
      // dragging the window between monitors with different DPRs — the
      // uDprNorm uniform must follow or particle sizes jump; see uniforms).
      const dpr = Math.min(window.devicePixelRatio, window.__lowEndDevice ? 1 : 2);
      this.renderer.setPixelRatio(dpr);
      const dprUniform = this.particles?.material?.uniforms?.uDprNorm;
      if (dprUniform) dprUniform.value = dpr / 2.0;

      if (this._composerReady) {
        if (this._composer) this._composer.setSize(w, h);
        if (this._bloomPass) this._bloomPass.resolution.set(w, h);
      }
    };
    // Stashed so dispose() can actually unsubscribe instead of leaking a
    // listener against a renderer/camera that no longer exist.
    if (window.resizeManager) this._unsubscribeResize = window.resizeManager.subscribe('particle-camera-resize', onResize);
    else {
      window.addEventListener('resize', onResize, { passive: true });
      this._unsubscribeResize = () => window.removeEventListener('resize', onResize);
    }
  }

  animate = () => {
    this._animateRAF = requestAnimationFrame(this.animate);
    this.time = Date.now() * 0.001;

    // Lab orb noise clock — advances every frame regardless of which shape
    // is current (matches uWavefront's own always-on-material convention);
    // the orb only ever becomes visible via uOrbAmp*uLabProgress in the
    // shader, so this costs nothing when the Lab section is out of view.
    // Reduced-motion: uTime was set once to a fixed value at material
    // creation and is deliberately never touched again here — that's what
    // keeps the orb's noise pattern a single static "mid-deformation" frame
    // instead of animating, matching uWavefront's existing reduced-motion
    // bake-not-animate convention in the same shader.
    if (this.particles && !this.particles.material.uniforms.uPrefersReducedMotion.value) {
      this.particles.material.uniforms.uTime.value = (Date.now() - this._orbClockStart) * 0.001;
    }

    // Update morph — GPU path: one uniform write per frame; the vertex
    // shader mixes position → aTargetPos itself (replaces blendStates()).
    if (this.morphStartTime && this.nextState) {
      this.morphProgress = Math.min(1, (Date.now() - this.morphStartTime) / this.morphDuration);
      const morphU = this.particles?.material?.uniforms?.uMorphProgress;

      if (this.morphProgress < 1) {
        if (morphU) morphU.value = this.morphProgress * (2 - this.morphProgress); // ease-out, as before
      } else {
        // Completion: bake the destination into the position buffer ONCE so
        // non-shader consumers (preloader intro scaling, gesture forces,
        // the interrupt bake above) keep seeing true resting positions.
        const geo = this.particles?.geometry;
        if (geo) {
          const pos = geo.attributes.position;
          const n = Math.min(pos.array.length, this.nextState.positions.length);
          for (let i = 0; i < n; i++) pos.array[i] = this.nextState.positions[i];
          pos.needsUpdate = true;
          const sz = geo.attributes.size;
          if (sz && this.nextState.sizes) {
            const m = Math.min(sz.array.length, this.nextState.sizes.length);
            for (let i = 0; i < m; i++) sz.array[i] = this.nextState.sizes[i];
            sz.needsUpdate = true;
          }
        }
        if (morphU) morphU.value = 0;
        this.currentState = this.nextState;
        this.morphStartTime = null;
        this.nextState = null;
        this.morphProgress = 0;
        this.helixReached = true;
      }
    }

    // Lab orb deformation amount — driven purely by which shape is current,
    // NOT scroll position. The orb morphs continuously and independently
    // the whole time it's on screen; scrolling only decides WHEN it's the
    // current shape (via the existing #work-grid-lab morphTo('lab') and
    // triple-sphere/lab handoffs), never pauses or re-freezes its motion.
    // Blends smoothly across a shape morph the same way blendStates()
    // blends position, so switching into/out of 'lab' ramps amplitude
    // in/out over the same morphDuration instead of snapping.
    if (this.particles) {
      const fromLab = this.currentState && this.currentState.id === 'lab' ? 1 : 0;
      const toLab = this.nextState && this.nextState.id === 'lab' ? 1 : 0;
      const labAmount = this.morphStartTime
        ? fromLab + (toLab - fromLab) * this.morphProgress
        : fromLab;
      this.particles.material.uniforms.uLabProgress.value = labAmount;

      // Terrain undulation amount — same shape-driven pattern as uLabProgress
      // above (see its comment), just for the 'terrain' state instead.
      const fromTerrain = this.currentState && this.currentState.id === 'terrain' ? 1 : 0;
      const toTerrain = this.nextState && this.nextState.id === 'terrain' ? 1 : 0;
      const terrainAmount = this.morphStartTime
        ? fromTerrain + (toTerrain - fromTerrain) * this.morphProgress
        : fromTerrain;
      this.particles.material.uniforms.uTerrainProgress.value = terrainAmount;

      // Terrain-only: push the shape further from the camera so it reads
      // smaller on screen (camera sits at positive Z looking toward the
      // origin, so a more-negative Z here means further away). Blends via
      // terrainAmount the same way every other shape-driven value on this
      // page does, so it eases in/out smoothly across a morph instead of
      // snapping when entering/leaving the Profile section.
      const terrainZOffset = -5;
      this.particles.position.z = terrainZOffset * terrainAmount;

      // Grid interaction amount — same shape-driven pattern as uLabProgress
      // above (see its comment), just for the 'grid' state instead.
      const fromGrid = this.currentState && this.currentState.id === 'grid' ? 1 : 0;
      const toGrid = this.nextState && this.nextState.id === 'grid' ? 1 : 0;
      const gridAmount = this.morphStartTime
        ? fromGrid + (toGrid - fromGrid) * this.morphProgress
        : fromGrid;
      this.particles.material.uniforms.uGridProgress.value = gridAmount;

      // Project the eased mouse NDC (this.mouseX/Y, updated below) onto the
      // grid's local X/Z plane — see this._gridMouseWorldScale's comment.
      this.particles.material.uniforms.uMouseWorld.value.set(
        this.mouseX * this._gridMouseWorldScale,
        -this.mouseY * this._gridMouseWorldScale
      );

      // Helix interaction amount — same shape-driven pattern as uLabProgress
      // above (see its comment), just for the 'helix' state instead.
      const fromHelix = this.currentState && this.currentState.id === 'helix' ? 1 : 0;
      const toHelix = this.nextState && this.nextState.id === 'helix' ? 1 : 0;
      const helixAmount = this.morphStartTime
        ? fromHelix + (toHelix - fromHelix) * this.morphProgress
        : fromHelix;
      this.particles.material.uniforms.uHelixProgress.value = helixAmount;

      // Lazily (re-)upload the helixPhi attribute whenever helix becomes
      // relevant. Unlike position/color/size, this buffer is only ever
      // populated inside createParticles() — which normal timed morphs
      // (setState's duration>0 branch) never call, since blendStates()
      // just interpolates the EXISTING position buffer instead of
      // rebuilding the geometry. Without this sync, morphing into helix
      // via a normal timed morphTo() would leave helixPhi at whatever an
      // earlier shape (or the all-zero default) left it at. Re-synced
      // once per entry (not every frame) via _helixPhiUploaded; resets
      // as soon as helix is no longer current/next so the next entry
      // re-uploads correctly.
      const helixState = this.currentState?.id === 'helix' ? this.currentState
        : this.nextState?.id === 'helix' ? this.nextState
        : null;
      if (helixState && helixState.phis && this.particles.geometry.attributes.helixPhi) {
        if (!this._helixPhiUploaded) {
          this.particles.geometry.attributes.helixPhi.array.set(helixState.phis);
          this.particles.geometry.attributes.helixPhi.needsUpdate = true;
          this._helixPhiUploaded = true;
        }
      } else {
        this._helixPhiUploaded = false;
      }
    }

    // Apply pulsing animation if enabled
    if (this.currentState && this.currentState.config?.animated) {
      this.applyPulsingAnimation();
    }

    // Preloader globe intro — driven by _preloaderScale set in startPreloaderGlobeIntro()
    if (this._preloaderIntroActive && this.particles && this.currentState) {
      const s = this._preloaderScale;
      const posAttr = this.particles.geometry.attributes.position;
      const base = this.currentState.positions;
      const count = this.particleCount;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        posAttr.array[idx]     = base[idx]     * s;
        posAttr.array[idx + 1] = base[idx + 1] * s;
        posAttr.array[idx + 2] = base[idx + 2] * s;
      }
      posAttr.needsUpdate = true;
    }

    // Ease mouse toward target (lerp factor — lower = more scrub/lag before
    // interaction catches up to the cursor, less "instant". Lowered from
    // 0.04 per explicit "add more scrub, feels less instant" request.)
    const ease = 0.015;
    this.mouseX += (this._mouseTargetX - this.mouseX) * ease;
    this.mouseY += (this._mouseTargetY - this.mouseY) * ease;

    // Rotation
    const gridAmountForSpin = this.particles?.material?.uniforms?.uGridProgress?.value || 0;
    // Grid: fully stopped rotation, not just a pinned mouse-slant. The
    // ambient auto-spin below normally advances every frame regardless of
    // shape; while grid is the active/blending shape its advance is ramped
    // down to 0 (via the same gridAmount blend used everywhere else in
    // this file), so the lattice actually holds still instead of just
    // losing its mouse-driven wobble while still slowly spinning. Pausing
    // the accumulator itself (rather than freezing the derived rotation
    // value) means leaving the shape resumes the spin from exactly where
    // it left off, no snap/jump.
    this.autoRotation += 0.0005 * (1 - gridAmountForSpin);
    if (this.particles) {
      // Grid: fixed camera framing, not live mouse-driven. Live mouse tilt
      // fights visually with the mouse-follow wave (uMouseWorld, left
      // untouched below — that's a separate, wanted interaction); the
      // lattice needs to hold one designed angle instead of slanting as
      // the cursor moves. Pinned to whatever a virtual mouse parked at a
      // fixed screen position would produce, reusing the exact same
      // rotation formula as every other shape — only the mouse input is
      // swapped for a constant. Blends smoothly in/out via uGridProgress,
      // the same shape-driven blend pattern as uLabProgress/uTerrainProgress.
      const gridAmount = gridAmountForSpin;
      let rotMouseX = this.mouseX;
      let rotMouseY = this.mouseY;
      if (gridAmount > 0.0001) {
        const fixedMouseX = (750 / window.innerWidth) * 2 - 1;
        const fixedMouseY = (620 / window.innerHeight) * 2 + 1;
        rotMouseX = this.mouseX + (fixedMouseX - this.mouseX) * gridAmount;
        rotMouseY = this.mouseY + (fixedMouseY - this.mouseY) * gridAmount;
      }
      // Rotation strength — how much the cursor tilts the object. Reduced
      // from Math.PI * 0.5 (±90° across the full mouse range) per explicit
      // "reduce strength of cursor movement" request, then reduced further
      // (0.22 → 0.08) per explicit "even subtler" follow-up.
      const rotStrength = Math.PI * 0.08;
      this.particles.rotation.y = this.autoRotation + (rotMouseX * rotStrength);
      this.particles.rotation.x = rotMouseY * rotStrength;
      this.particles.rotation.z = 0;

      // Position pan (camera dolly/pan left-right-up-down with the cursor)
      // — added earlier this thread, then explicitly turned back off:
      // "turn off the particle or object movement... just keep the
      // rotation". Explicitly zeroed (not just left unset) so a page that
      // still has a nonzero position from before this change doesn't get
      // stuck offset. Kept the old lines commented, not deleted, in case
      // panning is wanted again.
      // const panStrength = 1.2;
      // this.particles.position.x = rotMouseX * panStrength;
      // this.particles.position.y = rotMouseY * panStrength;
      this.particles.position.x = 0;
      this.particles.position.y = 0;
    }

    // Half-rate rendering on low-end devices — the GPU render/paint call
    // below is the dominant cost per frame, not the state-update math
    // above it (morph blending, uniforms, rotation), so skipping every
    // other frame's actual render roughly halves the real cost while the
    // state itself keeps updating smoothly underneath. Only ever matters
    // for the hero's brief one-time helix formation on these devices (see
    // setupHeroExitTeardown() in particle-morph.hbs) — a small, barely
    // perceptible smoothness trade during that one moment. Gates only the
    // render calls themselves (not an early return) so the _rafCallbacks
    // loop below still runs every frame regardless.
    let skipRenderThisFrame = false;
    if (window.__lowEndDevice) {
      this._lowEndFrameSkip = !this._lowEndFrameSkip;
      skipRenderThisFrame = this._lowEndFrameSkip;
    }

    // Render with bloom composer when ready, fallback to direct render during async init
    if (!skipRenderThisFrame) {
      if (this._composerReady && this._composer) {
        this._composer.render();
      } else {
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
      }
    }

    // Fix 3: run any co-registered per-frame callbacks (e.g. gesture controller forces)
    // so they always execute in the same RAF tick as blendStates(), in correct order.
    for (let i = 0; i < this._rafCallbacks.length; i++) {
      this._rafCallbacks[i]();
    }
  };

  updateParticleAnimation() {
    if (!this.particles || !this.currentState) return;

    const attr = this.particles.geometry.attributes.position;
    if (!attr) return;

    const array = attr.array;
    const basePositions = this.currentState.positions;
    const time = this.time;

    for (let i = 0; i < this.particleCount; i++) {
      const seed = i * 73;

      // Read BASE position
      let baseX = basePositions[i * 3];
      let baseY = basePositions[i * 3 + 1];
      let baseZ = basePositions[i * 3 + 2];

      // Tubular wave - gentle undulation on helix surface
      const wavePhase = baseY * 0.5 + time * 0.3;
      const radialWave = Math.sin(wavePhase) * 0.1;  // ±0.1 radial pulse

      // Apply wave as scale factor (keeps distance positive)
      const distance = Math.sqrt(baseX * baseX + baseZ * baseZ);
      if (distance > 0.1) {
        const angle = Math.atan2(baseZ, baseX);
        const scaleFactor = 1.0 + radialWave;  // 0.9 to 1.1 scale
        const newDistance = distance * scaleFactor;

        array[i * 3] = newDistance * Math.cos(angle);
        array[i * 3 + 2] = newDistance * Math.sin(angle);
      } else {
        array[i * 3] = baseX;
        array[i * 3 + 2] = baseZ;
      }

      // Gentle Y bobbing
      array[i * 3 + 1] = baseY + Math.sin(time * 0.5 + seed * 0.001) * 0.15;
    }

    attr.needsUpdate = true;
  }

  // blendStates() removed — morphs are now interpolated in the vertex
  // shader (aTargetPos + uMorphProgress, see setState/animate). It lerped
  // and re-uploaded the entire position+size buffers on the CPU every
  // frame of every morph, which was the dominant main-thread cost during
  // morphs on weak hardware.

  applyPulsingAnimation() {
    if (!this.particles || !this.currentState) return;

    const posAttr = this.particles.geometry.attributes.position;
    const basePositions = this.currentState.positions;
    const config = this.currentState.config || {};

    const pulseSpeed = config.pulseSpeed || 1.0;
    const pulseAmount = config.pulseAmount || 0.2;
    const particleCount = this.particleCount;

    // Apply gentle pulsing to each particle (moves back and forth)
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;

      // Base position
      const baseX = basePositions[idx];
      const baseY = basePositions[idx + 1];
      const baseZ = basePositions[idx + 2];

      // Per-particle phase offset for variation
      const phase = (i * 0.317) % (Math.PI * 2);  // Spread phases

      // Gentle sinusoidal pulsing (back and forth)
      const pulse = Math.sin(this.time * pulseSpeed * 2 + phase) * pulseAmount;

      // Apply pulsing as radial offset from center
      const distance = Math.sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ);
      if (distance > 0.01) {
        const scale = 1.0 + pulse;
        posAttr.array[idx] = baseX * scale;
        posAttr.array[idx + 1] = baseY * scale;
        posAttr.array[idx + 2] = baseZ * scale;
      } else {
        posAttr.array[idx] = baseX;
        posAttr.array[idx + 1] = baseY;
        posAttr.array[idx + 2] = baseZ;
      }
    }

    posAttr.needsUpdate = true;
  }

  start() {
    this.animate();
  }

  // Low-end-device teardown (see device-capability.js / particle-morph.hbs):
  // hiding the canvas via CSS does NOT stop requestAnimationFrame from
  // firing every frame — Three.js keeps paying the full render+bloom cost
  // whether the canvas is visible or not unless the loop is explicitly
  // cancelled and GPU resources explicitly freed. This is the actual
  // performance recovery; a CSS fade alone would not be.
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._animateRAF) cancelAnimationFrame(this._animateRAF);

    if (this.particles) {
      this.particles.geometry?.dispose();
      this.particles.material?.dispose();
      this.scene.remove(this.particles);
      this.particles = null;
    }

    if (this._composer) {
      this._bloomPass?.dispose?.();
      this._composer = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this._unsubscribeResize?.();
    this._unsubscribeMobileScaleResize?.();
  }

  // ─── Preloader globe intro ────────────────────────────────────────────────
  // Particles start collapsed at centre, burst out to globe shape with
  // spring oscillation, then settle. Returns a promise resolving when done.
  //
  // Phase 1 (burstMs):   scale 0 → overshoot (1 + overshoot)
  // Phase 2 (settleMs):  spring damp back to 1.0 with decaying oscillation
  startPreloaderGlobeIntro({ burstMs = 600, settleMs = 1400, overshoot = 0.55, oscillations = 3 } = {}) {
    if (!this.particles || !this.currentState) return Promise.resolve();

    this._preloaderIntroActive = true;
    this._preloaderScale = 0;

    const totalMs = burstMs + settleMs;
    const start   = Date.now();

    return new Promise(resolve => {
      const tick = () => {
        const elapsed = Date.now() - start;
        const t = Math.min(elapsed / totalMs, 1);

        let scale;
        if (elapsed < burstMs) {
          // Phase 1: cubic ease-in-out from 0 → (1 + overshoot)
          const tb = elapsed / burstMs;
          const eb = tb < 0.5 ? 4 * tb * tb * tb : 1 - Math.pow(-2 * tb + 2, 3) / 2;
          scale = eb * (1 + overshoot);
        } else {
          // Phase 2: damped spring back to 1.0
          const ts = (elapsed - burstMs) / settleMs; // 0→1
          const decay = Math.exp(-ts * 4.5);
          const osc   = Math.cos(ts * Math.PI * oscillations * 2);
          scale = 1 + overshoot * decay * osc;
        }

        this._preloaderScale = Math.max(0, scale);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this._preloaderScale = 1;
          this._preloaderIntroActive = false;
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ParticleAnimationLoop = ParticleAnimationLoop;
}
