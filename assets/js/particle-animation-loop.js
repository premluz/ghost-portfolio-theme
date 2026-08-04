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

// GLOW RADIUS — how far the in-sprite halo reaches, in sprite units (the
// hex body's edge sits at ~0.5, its corners at ~0.58). This single knob
// drives the falloff normalisation, the fade envelope, the discard bound
// AND the sprite's pixel room (uSpriteScale = radius * 2.12) — they must
// move together, which is why there is no separate "radius" uniform to
// hand-edit. Live-tune in the console:
//   window.particleSystem.loop.setGlowRadius(2.0)
const GLOW_RADIUS = 2.8;

class ParticleAnimationLoop {
  constructor(container, particleCount, colorConfig, config = {}) {
    this.container = container;
    this.colorConfig = colorConfig;
    this.config = config;
    this.demoContainer = (this.container && this.container.parentElement) || document.getElementById('particle-morph-demo');
    this._helixAmount = 0;

    // Use particle count as passed (already adjusted for mobile in particle-morph.hbs)
    const isMobile = window.innerWidth < 768;
    this.particleCount = particleCount;  // Don't reduce again - already done at top level
    this.isMobile = isMobile;

    // Three.js setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Base FOV, restored whenever helix isn't the active/incoming shape —
    // see _getHeroZoomFov()/heroOffsetActive below.
    this._baseFov = this.camera.fov;
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
    this._heroBaseCameraZ = this.camera.position.z;

    // HERO-EXIT CHOREOGRAPHY — see _updateHeroCollapseState()/_applyHeroExitVisuals() below for the full
    // explanation. Element cached once; .hero doesn't move or get replaced.
    this._heroEl = document.querySelector('.hero');
    this._heroCollapsed = false;
    this._heroExitTravelY = 2.5;      // world units scrolled upward over the exit
    this._heroExitZoomFactor = 0.72;  // camera distance at t=1, as a fraction of base
    this._heroExitExtraRotation = 1.2; // radians of extra spin added over the exit, on top of ambient auto/mouse rotation
    // Rate-limited state for the rotation contribution
    // (easeInQuad(heroT) * _heroExitExtraRotation, extended by overscroll
    // below) — the target is a pure function of scroll position with no
    // cap on how fast it can change, so a fast flick/scroll (heroT jumping
    // a lot between frames) added a correspondingly large chunk of
    // rotation in just a few frames: fast enough to visually blur the
    // double helix into reading as a solid sphere. _heroExitRotationCurrent
    // chases the target by at most _heroExitRotationMaxDelta per frame, so
    // the RATE is capped regardless of how fast the target itself moves.
    this._heroExitRotationCurrent = 0;
    this._heroExitRotationMaxDelta = 0.05; // radians/frame, ~3rad/s cap at 60fps
    // "Keep the rotation [going] as the scroll goes": once collapsed,
    // rather than freezing the rotation target at _heroExitExtraRotation,
    // it keeps growing with however much FURTHER the visitor scrolls past
    // the collapse point — see _heroCollapseScrollY/overscroll in
    // _applyHeroExitVisuals(). Tied to scroll position, not elapsed time,
    // so it holds steady (doesn't run away) if the visitor stops
    // scrolling, and is fed through the same rate-limited chase above so a
    // fast flick still can't blur it.
    this._heroCollapseScrollY = 0;
    this._heroExitOverscrollSpinRate = 0.0025; // extra rad of rotation TARGET per px scrolled past collapse
    // Fraction of the hero's own height the whole exit choreography (and the
    // collapse trigger) completes within, NOT 1.0 — a separate, pre-existing
    // trigger (particle-morph.hbs's 'profile' IntersectionObserver) hides
    // this same layer once .hero's CSS display flips to 'none', which in
    // practice (confirmed via screenshots at several scroll depths) happens
    // well before a full hero-height of scroll. Running the buildup across
    // the full 0-1 range meant most of it played out already hidden behind
    // that separate trigger. Extended 0.45 → 0.65 per explicit request for
    // more scroll before collapse triggers.
    this._heroExitSpan = 0.65;

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

    // Inert until someone calls setTimeline() — see the apply() call site
    // just before the draw in animate().
    this.scrollDirector = window.particleScrollDirector || null;

    this.setupMouse();
    this.setupClick();
    this.setupResize();

    // A theme toggle can restyle the canvas, so drop the cached hero-offset
    // pixel read alongside resize (see _readHeroCanvasOffsetPx). Cheap: fires
    // on data-theme changes only, not per frame.
    this._themeObserver = new MutationObserver(() => this._invalidateHeroOffsetCache());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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
        isMobile ? 0.8 : 3.4,    // radius — your current value, untouched
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

    // PARTICLE ROLE — a stable per-particle random in [0,1). A particle is
    // "free floating" (ignores the shape, drifts on its own) when its hash
    // falls below uFreeFloatRatio; everything else forms the shape. Encoding
    // the role as a THRESHOLD against a fixed hash rather than a boolean
    // means the structure/free split is retunable at runtime from one
    // uniform, with no buffer rebuild — and because the hash is derived from
    // the particle INDEX it is identical across every shape, so a particle
    // keeps its role through a morph instead of flickering between them.
    // Same sin-based hash as shape-definitions.js/generateColors so roles,
    // sizes and colour accents stay correlated per index.
    const roleAttr = new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1);
    for (let i = 0; i < roleAttr.array.length; i++) {
      const x = Math.sin(i * 127.1) * 43758.5453;
      roleAttr.array[i] = x - Math.floor(x);
    }
    geo.setAttribute('aRoleHash', roleAttr);

    // GPU morph buffers: destination shape + per-frame progress live on the
    // GPU (aTargetPos/aTargetSize + uMorphProgress). Initialised to a copy
    // of the rest state so uMorphProgress = 0 is exactly "no morph".
    geo.setAttribute('aTargetPos', new THREE.BufferAttribute(new Float32Array(posAttr.array), 3));
    geo.setAttribute('aTargetSize', new THREE.BufferAttribute(new Float32Array(geo.attributes.size.array), 1));

    // Styles (motion + per-style uniforms) come from the registry in
    // particle-style-definitions.js — the five blocks that used to be
    // hand-inlined below. See that file for the stage contract.
    this.styleRegistry = (window.createDefaultParticleStyleRegistry
      ? window.createDefaultParticleStyleRegistry()
      : { uniforms: () => ({}), vertexAttributes: () => [], vertexUniformDeclarations: () => '',
          channelDeclarations: () => '', extraDeclarations: () => '', displaceBlocks: () => '',
          colorizeBlocks: () => '', progressDrivenStyles: () => [] });
    const styles = this.styleRegistry;

    // ShaderMaterial gives us full control — no string-replacement fragility.
    // Vertex shader replicates PointsMaterial's sizeAttenuation in clip space.
    // Fragment shader draws a 6-sided bokeh polygon with an HDR white-hot core
    // (values > 1.0) fading to HDR cyan at the edges, discarding outside the hex.
    // UnrealBloomPass picks up anything above its threshold and spreads it as bloom.
    const vertexShader = `
      attribute vec3 color;
      attribute float size;
      // helixPhi is NOT declared here — it belongs to the helix STYLE and is
      // emitted by styles.vertexAttributes() below. Declaring it in both
      // places is a GLSL redefinition error.
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
      ${styles.vertexUniformDeclarations()}
      ${styles.vertexAttributes().map(a => `attribute float ${a};`).join('\n      ')}
      varying vec3 vColor;
      ${styles.varyingDeclarations()}
      ${styles.extraDeclarations()}

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

        // Per-style displacement, composed from the style registry. Each
        // block reads basePos (never another style's output) and mutates
        // pos; each is gated on its own activity so an inactive style costs
        // one uniform-coherent branch. Shared cross-stage values (orbNoise)
        // are declared as channels.
        vec3 pos = basePos;
        // Styles multiply into this rather than touching gl_PointSize
        // directly, so several can compose (see sizeMul slot).
        float styleSizeMul = 1.0;
        ${styles.channelDeclarations()}
${styles.displaceBlocks()}
${styles.sizeMulBlocks()}

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

${styles.colorizeBlocks()}

        vColor = baseColor;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        // uSpriteScale: extra sprite room for the in-sprite glow halo (the
        // fragment shader scales its coords to keep the hex body the same
        // visual size; 2.75x gives the halo ~2.75x the dot's diameter, the
        // minimum for haze to read on 3-6px particles). 1.0 on low-end
        // devices — no halo, no extra fill.
        gl_PointSize = (0.09 * baseSize * sizeScale * styleSizeMul) * (300.0 / -mvPosition.z) * uDprNorm * uSpriteScale;
${styles.postProjectBlocks()}
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      #define PI 3.14159265359

      varying vec3 vColor;
      ${styles.varyingDeclarations()}
      uniform float uGlowStrength;
      uniform float uSpriteScale;
      uniform float uGlowRadius;
      uniform float uDprNorm;
      ${styles.fragmentUniformDeclarations()}

      void main() {
        // SCAFFOLD ONLY. Every render treatment — the default bokeh/glow
        // included — is a style in particle-style-definitions.js. The first
        // one to run DECLARES finalColor/finalAlpha; later ones mix over
        // them. Nothing about how a particle looks is hardcoded here.
${styles.fragmentBodyBlocks()}

        if (finalAlpha <= 0.004) discard;
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
        // 0.6 (was 0.8): finer dots across every shape — the DNA-Capital
        // profile trades dot size for count (see particle-morph.hbs's
        // particleCount). Net fill: 16k x 0.6^2 is slightly BELOW the old
        // 10k x 0.8^2 budget.
        sizeScale: { value: this.isMobile ? 0.5 : 0.6 },
        // GPU morph progress — eased in animate(); 0 = resting on `position`.
        uMorphProgress: { value: 0 },
        // In-sprite halo strength (the bloom replacement, see fragment
        // shader). Low-end devices skip the halo entirely — the 1.5x sprite
        // enlargement alone is 2.25x the fill per particle, real money on
        // old integrated GPUs; they get crisp 1x dots instead.
        // 1.0 tuned against DNA-Capital-style haze (A/B'd 0.55/1.0/1.6).
        // NOTE the glow's real ceiling is --color-particles (default.hbs):
        // additive blending multiplies everything by that hex, and it's
        // currently a deliberately dark teal — brighten it to push further.
        // Low-end runs a MODEST halo rather than none (2026-07-17): with
        // the fine-particle profile (tiny dots, dpr 1) even old iGPUs
        // afford it — this keeps low-end looking like the site, not a
        // degraded sketch of it.
        uGlowStrength: { value: window.__lowEndDevice ? 0.6 : 1.0 },
        uGlowRadius: { value: window.__lowEndDevice ? 1.1 : GLOW_RADIUS },
        // Derived from GLOW_RADIUS — the sprite must physically contain the
        // halo (x2 for diameter + margin). Change the radius, not this.
        uSpriteScale: { value: (window.__lowEndDevice ? 1.1 : GLOW_RADIUS) * 2.12 },
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
        // Per-style uniforms (orb/terrain/volatility/helix/grid and their
        // tuning constants) now live with their style in
        // particle-style-definitions.js, so a style owns its GLSL and its
        // defaults in one place instead of two files.
        ...styles.uniforms(),
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
  /**
   * Explicitly set a style's activity, for styles that are NOT shape-driven
   * (render modes like halftone, budget knobs like free-float). Shape-driven
   * styles are handled automatically in animate() via styleAmount().
   *
   * Also applies the style's materialState — blending mode and friends are
   * material state, not uniforms, so they cannot cross-fade; they switch
   * when the style becomes dominant.
   */
  setStyleAmount(key, value) {
    const style = this.styleRegistry.get && this.styleRegistry.get(key);
    if (!style || !this.particles) return;
    const uniformName = style.progressUniform
      || `u${key.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())}Progress`;
    const u = this.particles.material.uniforms[uniformName];
    if (!u) return;
    u.value = value;

    if (style.materialState) {
      const dominant = value > 0.5;
      const mat = this.particles.material;
      if (style.materialState.blending) {
        const want = dominant
          ? (style.materialState.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending)
          : THREE.AdditiveBlending;
        if (mat.blending !== want) mat.blending = want;
      }
    }
  }

  /**
   * How active a style is this frame, 0-1. A style is "on" when its key is
   * the current state id; during a morph it blends between the outgoing and
   * incoming values using the same eased morphProgress the positions use.
   * Extracted from five hand-duplicated copies — see the style registry in
   * particle-style-definitions.js.
   */
  styleAmount(key) {
    const from = this.currentState && this.currentState.id === key ? 1 : 0;
    const to = this.nextState && this.nextState.id === key ? 1 : 0;
    return this.morphStartTime ? from + (to - from) * this.morphProgress : from;
  }

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

  // Live glow-radius tuning (also used from the console — see GLOW_RADIUS
  // at the top of this file). Keeps the sprite's pixel room in lockstep
  // with the halo extent; adjusting either alone visibly caps or wastes.
  setGlowRadius(radius) {
    const u = this.particles && this.particles.material && this.particles.material.uniforms;
    if (!u) return;
    u.uGlowRadius.value = radius;
    u.uSpriteScale.value = radius * 2.12;
  }

  // Reads --particle-hero-canvas-left/top off the canvas (falling back to
  // #particle-morph-demo). Those come from width-based media queries in
  // main.css, so they can only change on RESIZE — never per frame, and never
  // on scroll. Cached for exactly that reason: _getHeroCanvasOffset() runs
  // every frame while the helix is active, and getComputedStyle() there was
  // forcing one style recalc per frame (measured: getComputedStyle/s tracked
  // draws/s 1:1 on the hero, and dropped to 0 the moment the shape changed).
  // Invalidated by _invalidateHeroOffsetCache() from applyResize() and on a
  // data-theme change.
  _readHeroCanvasOffsetPx() {
    if (this._heroOffsetPx) return this._heroOffsetPx;
    const target = (this.renderer && this.renderer.domElement) || this.demoContainer;
    let leftPx = 0;
    let topPx = 0;
    if (target) {
      const style = window.getComputedStyle(target);
      leftPx = parseFloat(style.getPropertyValue('--particle-hero-canvas-left')) || 0;
      topPx = parseFloat(style.getPropertyValue('--particle-hero-canvas-top')) || 0;
      // If the canvas itself doesn't define them, fall back to the demo container
      if (!leftPx && !topPx && this.demoContainer && target !== this.demoContainer) {
        const containerStyle = window.getComputedStyle(this.demoContainer);
        leftPx = parseFloat(containerStyle.getPropertyValue('--particle-hero-canvas-left')) || 0;
        topPx = parseFloat(containerStyle.getPropertyValue('--particle-hero-canvas-top')) || 0;
      }
    }
    this._heroOffsetPx = { leftPx, topPx };
    return this._heroOffsetPx;
  }

  _invalidateHeroOffsetCache() {
    this._heroOffsetPx = null;
  }

  // Hero-only canvas offset in WORLD units. Only the CSS pixel read is cached
  // (above); the world conversion stays per-frame because camera.fov is itself
  // animated on the hero (see _getHeroZoomFov) and would otherwise go stale.
  _getHeroCanvasOffset() {
    const { leftPx, topPx } = this._readHeroCanvasOffsetPx();
    const cameraZ = this.camera.position.z;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const worldPerPixel = (2 * cameraZ * Math.tan(fovRad / 2)) / window.innerHeight;
    return {
      x: leftPx * worldPerPixel,
      y: -topPx * worldPerPixel
    };
  }

  // HERO-EXIT CHOREOGRAPHY — continuous, scroll-bound. Replaces a discrete
  // ScrollTrigger (start:8,end:9 — fired ~immediately on any scroll) that
  // used to flip particles.position/camera.fov straight from their hero
  // values to their neutral ones the instant the morph away from 'helix'
  // began, well before the morph/fade had visually finished — that abrupt
  // cut was reported as "helix scales down and moves to centre". heroT
  // below is a plain 0-1 read of how far scroll has gone through the
  // hero's OWN height (0 at the top of the page, 1 once scrolled a full
  // hero-height past it) — NOT the "entering from below" formula
  // ParticleScrollDirector uses for Lab, which assumes the element starts
  // below the fold; the hero starts already on screen at load.
  // Position/zoom ease continuously with heroT through the buildup (0 to
  // _heroExitSpan). At the collapse instant, hero-exit's own "hide" is a
  // SHAPE MORPH into a sphere ('collapse') — called directly via
  // system.morphTo(), not through __particleApply's 'hide' branch — with
  // NO opacity fade: per explicit request, the object stays fully opaque
  // and folds into a rotating sphere instead of dimming out. Rotation
  // keeps advancing throughout, including after collapse (see
  // _heroExitOverscrollSpinRate below) — "keep the rotation as the scroll
  // goes". camera.z/fov still have to return to base EVENTUALLY (every
  // later shape renders through this same camera), which happens once
  // hero-exit's own shapes (base hero shape, or the collapsed sphere) are
  // no longer current — see the reset at the end of
  // _updateHeroCollapseState(), not in _applyHeroExitVisuals().
  //
  // loop._heroOffsetActive doubles as the gate ParticleScrollDirector's
  // Lab/footer zones check before writing particles.position — the two
  // would otherwise fight over the same property, since those timelines
  // are live for the whole page lifetime, clamped to their own t=0
  // keyframe while still off-screen.
  //
  // Split into two halves, called from two different points in animate():
  // _updateHeroCollapseState() just measures heroT and fires the shape
  // flip — cheap (one rect read), and must run even while the layer is
  // hidden (window.__particleLayerHidden skips the rest of animate() for
  // cost reasons), otherwise scrolling back up could never be noticed and
  // the layer would stay hidden forever. _applyHeroExitVisuals() writes
  // position/camera/rotation from the heroT it measured, and has to run
  // AFTER the ambient auto-rotation code sets particles.rotation.y (that
  // code does an absolute `=`, not `+=`, so running this first would have
  // its rotation addition immediately overwritten) — it's a no-op to run
  // this while hidden anyway, since nothing is visible to see it.
  _updateHeroCollapseState() {
    // Default 1 (fully exited), NOT 0: main.js's initHeroFadeOut() sets
    // .hero to display:none once scrolled well past it, which collapses
    // getBoundingClientRect() to an all-zero rect. Falling back to 0 there
    // read that as "back at the very top of the hero" and popped the helix
    // back up deep in the page — reproduced at scrollY 1612 on this build.
    let heroT = 1;
    if (this._heroEl) {
      const r = this._heroEl.getBoundingClientRect();
      heroT = r.height > 0 ? Math.min(1, Math.max(0, -r.top / r.height)) : 1;
    }
    // Rescaled so the buildup reaches its full intended amount by the point
    // collapse triggers, instead of only ever reaching heroExitSpan's worth
    // of it — see _heroExitSpan above for why collapse fires that early.
    this._heroT = Math.min(1, heroT / this._heroExitSpan);

    const shouldCollapse = heroT >= this._heroExitSpan;
    if (shouldCollapse !== this._heroCollapsed) {
      this._heroCollapsed = shouldCollapse;
      if (shouldCollapse) {
        // "Hide" uses the SAME standard mechanism as operating-model-exit
        // and testimonials (both also route 'hide' + 'collapse' through
        // __particleApply): morph to the sphere shape AND fade opacity
        // together, fast (~400ms morph, ~600ms fade). By the time the
        // morph is far enough along to read as recognizably "a sphere",
        // it's already faded most of the way out — hide is a quick
        // transition, not a shape the visitor is meant to consciously see.
        // A direct morphTo() bypass (no fade at all, sphere left fully
        // visible and spinning indefinitely) was tried and replaced here
        // per explicit follow-up: that read as the sphere persisting far
        // too long, all the way until Lab's own trigger far down the
        // page, rather than a brief exit. Rotation still keeps advancing
        // for however much of the ~700ms-till-hidden window remains
        // visible (see _applyHeroExitVisuals(), unchanged) —
        // _heroCollapseScrollY is the zero-point that's measured from.
        this._heroCollapseScrollY = window.scrollY;
        if (window.__particleApply && window.particleSystem) {
          window.__particleApply(window.particleSystem, 'hero-exit', 'collapse', 400);
        }
      } else if (window.__particleApply && window.particleSystem) {
        const shape = window.__heroShape ? window.__heroShape() : 'helix';
        window.__particleApply(window.particleSystem, 'hero', shape, 500);
      }
    }

    // Release once collapsed AND either window.__particleLayerHidden is
    // true (some OTHER trigger elsewhere on the page did its own opacity
    // fade — still possible on other sections, just not this one anymore)
    // OR the current shape has moved on to something hero-exit doesn't own
    // itself (neither its base hero shape NOR the 'collapse' sphere it
    // just morphed into) — signalling a later section (Lab, footer, ...)
    // has taken over the shared canvas, so hero-exit should stop holding
    // camera/position ownership. Camera z/fov reset here (not in
    // _applyHeroExitVisuals(), which keeps running through the sphere
    // phase — see its own comment) so every later shape renders at the
    // correct distance/FOV.
    const heroBaseShape = window.__heroShape ? window.__heroShape() : 'helix';
    const shapeHandedOff = this.currentState
      && this.currentState.id !== heroBaseShape
      && this.currentState.id !== 'collapse';
    if (this._heroCollapsed && (window.__particleLayerHidden || shapeHandedOff) && this.particles) {
      // Releasing the position guard HERE, at the same instant as the
      // camera reset, is the point — see the comment on this flag in
      // _applyHeroExitVisuals()'s collapsed branch.
      this._heroOffsetActive = false;
      if (this.camera.position.z !== this._heroBaseCameraZ) this.camera.position.z = this._heroBaseCameraZ;
      if (this.camera.fov !== this._baseFov) {
        this.camera.fov = this._baseFov;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  _applyHeroExitVisuals() {
    const heroT = this._heroT || 0;
    // How far scroll has continued PAST the collapse point — 0 until
    // collapsed, then grows with every extra px scrolled. Fed into the
    // rotation target below so the (now-sphere) object keeps spinning
    // faster for as long as scrolling continues, instead of freezing —
    // "keep the rotation as the scroll goes".
    const overscroll = this._heroCollapsed ? Math.max(0, window.scrollY - this._heroCollapseScrollY) : 0;

    // Rotation: ONE continuous rate-limited chase, covering the buildup,
    // the collapse instant, AND the continuing overscroll spin — no
    // branch, so there's no pace mismatch at the collapse boundary. heroT
    // is already clamped to 1 by _updateHeroCollapseState(), so pre-
    // collapse this is exactly the plain easeInQuad formula; overscroll is
    // 0 until collapsed, so the target doesn't jump at the boundary, it
    // just keeps growing afterward instead of capping there.
    const easeInQuad = heroT * heroT;
    const targetRotationExtra = easeInQuad * this._heroExitExtraRotation
      + overscroll * this._heroExitOverscrollSpinRate;
    const rotDelta = Math.max(
      -this._heroExitRotationMaxDelta,
      Math.min(this._heroExitRotationMaxDelta, targetRotationExtra - this._heroExitRotationCurrent)
    );
    this._heroExitRotationCurrent += rotDelta;
    this.particles.rotation.y += this._heroExitRotationCurrent;

    if (heroT < 1) {
      this._heroOffsetActive = true;
      const heroOffset = this._getHeroCanvasOffset();
      this.particles.position.x = heroOffset.x;
      this.particles.position.y = heroOffset.y + heroT * this._heroExitTravelY;
      const zoomedZ = this._heroBaseCameraZ * this._heroExitZoomFactor;
      this.camera.position.z = this._heroBaseCameraZ + (zoomedZ - this._heroBaseCameraZ) * easeInQuad;
      const targetFov = this._getHeroZoomFov(window.innerWidth);
      if (Math.abs(this.camera.fov - targetFov) > 0.01) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
      }
    }
    // COLLAPSED (heroT >= 1) — position.x/y and camera.z/fov left exactly
    // where the buildup put them, no recentring (the object is now the
    // 'collapse' sphere shape, morphed in _updateHeroCollapseState(), so
    // there's no separate reposition needed here). camera.z/fov DO still
    // need to return to base EVENTUALLY — every later shape (Lab, footer,
    // grid...) renders through this same camera — but doing it here would
    // be visible. Deferred to _updateHeroCollapseState(), which keeps
    // running even once the layer is fully hidden (this function does
    // not), so that reset happens only once there is nothing left to see.
    // _heroOffsetActive stays true until that same moment — see the
    // comment there.
  }

  // Hero-only zoom: narrows the FOV (not the canvas/CSS) as the viewport
  // narrows, so the helix reads as zooming in on small screens instead of
  // just shrinking with everything else. Linear ramp between two reference
  // widths, clamped at both ends.
  _getHeroZoomFov(width) {
    const WIDE_WIDTH = 1440;
    const NARROW_WIDTH = 375;
    const NARROW_FOV = 45;
    const t = Math.min(1, Math.max(0, (WIDE_WIDTH - width) / (WIDE_WIDTH - NARROW_WIDTH)));
    return this._baseFov + (NARROW_FOV - this._baseFov) * t;
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
    const applyResize = () => {
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

    // Changing camera.aspect reframes every particle on screen instantly —
    // harmless once the layer has scrolled past the hero, but while Helix
    // is still visible it reads as the whole shape snapping to a new
    // position. Defer the actual resize until the hero has left the
    // viewport (same bounding-rect check as the testimonials hide trigger
    // in particle-morph.hbs), then apply it on the next scroll.
    const heroNotVisible = () => {
      const heroElement = document.querySelector('.hero');
      return !heroElement || heroElement.getBoundingClientRect().bottom <= 0;
    };
    let resizePending = false;
    const onResize = () => {
      // Cache-drop happens on EVERY resize, not inside applyResize(): the
      // camera/renderer resize below is deliberately deferred while the hero
      // is on screen, but --particle-hero-canvas-left/top are pure CSS and
      // must track the width media queries immediately. Hanging this off
      // applyResize() left the hero offset frozen at its first-read value for
      // as long as the hero stayed visible.
      this._invalidateHeroOffsetCache();
      if (heroNotVisible()) applyResize();
      else resizePending = true;
    };
    const flushPendingResize = () => {
      if (resizePending && heroNotVisible()) {
        resizePending = false;
        applyResize();
      }
    };
    window.addEventListener('scroll', flushPendingResize, { passive: true });

    // Stashed so dispose() can actually unsubscribe instead of leaking a
    // listener against a renderer/camera that no longer exist.
    if (window.resizeManager) this._unsubscribeResize = window.resizeManager.subscribe('particle-camera-resize', onResize);
    else {
      window.addEventListener('resize', onResize, { passive: true });
      this._unsubscribeResize = () => window.removeEventListener('resize', onResize);
    }
    this._unsubscribeResizeScrollFlush = () => window.removeEventListener('scroll', flushPendingResize);
  }

  animate = () => {
    this._animateRAF = requestAnimationFrame(this.animate);
    // Runs even while the layer is hidden — it's just a rect read + a few
    // property writes, nowhere near the cost the hidden-gate below exists
    // to avoid, and it's the only thing that notices "scrolled back up
    // through the hero" and un-hides/un-collapses. Skipping it while hidden
    // would mean scrolling back to the top could never reverse a collapse.
    if (this.particles) this._updateHeroCollapseState();
    // PARTICLE_SCENARIO 'hide' support: while the layer is faded out
    // (window.__particleLayerHidden, set by __particleApply in default.hbs),
    // skip simulation + render entirely — measured cost of NOT doing this
    // was a full ~60fps × 16k-point draw behind an invisible layer. The
    // rAF stays alive (one no-op callback per frame) so resume is instant
    // and no timer state is torn down. Clocks are Date.now()-derived, so
    // everything stays correct across the gap.
    if (window.__particleLayerHidden) return;
    // (Low-end particle gates — scroll-time pause + half cadence — removed
    // 2026-07-19: the real cause of the old-Mac scroll starvation was
    // backdrop-filter re-blurring every frame (see html.low-end CSS block)
    // + scroll/scrub desync (normalizeScroll). Particles render at full
    // cadence on every tier.)
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
      // Per-style progress: one helper replaces five near-identical copies
      // of this from/to blend (lab, terrain, volatility, grid, helix). Each
      // ramps 0<->1 across a morph the same way blendStates() blends
      // position, so entering/leaving a style eases instead of snapping.
      // Driven purely by WHICH SHAPE is current — not by scroll position.
      this.styleRegistry.progressDrivenStyles().forEach(({ key, uniform }) => {
        const u = this.particles.material.uniforms[uniform];
        if (u) u.value = this.styleAmount(key);
      });

      // Terrain-only: push the shape further from the camera so it reads
      // smaller on screen (camera sits at positive Z looking toward the
      // origin, so a more-negative Z here means further away). Blends via the
      // same amount as every other shape-driven value on this page, so it
      // eases in/out across a morph instead of snapping.
      const terrainZOffset = -5;
      this.particles.position.z = terrainZOffset * this.styleAmount('terrain');

      // Dots amount — same shape-driven pattern, for the 'dots' state.
      // Deliberately NOT fed into uGridProgress/the shader: that uniform
      // also gates grid's mouse-wave/click-ripple displacement (below),
      // which dots shouldn't inherit (it's a flat, undisplaced, static
      // field per its own reference image — no shader-side effect wanted).
      // This blend is only consumed further down for the rotation-freeze,
      // which is plain JS (this.particles.rotation.*), not a shader path.
      const fromDots = this.currentState && this.currentState.id === 'dots' ? 1 : 0;
      const toDots = this.nextState && this.nextState.id === 'dots' ? 1 : 0;
      // Stored on the instance, not a local — this block and the Rotation
      // section below are separate `if (this.particles)` blocks further
      // down in the same animate() call, so a plain const wouldn't survive
      // between them (gridAmountForSpin re-reads a uniform for the same
      // reason; this just uses an instance property instead of a uniform).
      this._dotsAmount = this.morphStartTime
        ? fromDots + (toDots - fromDots) * this.morphProgress
        : fromDots;

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
      this._helixAmount = helixAmount;
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
    // Dots: same "fully stopped, not just pinned" treatment as Grid, via
    // this._dotsAmount (an instance property, not a uniform — see where
    // it's set above for why). Combined with gridAmountForSpin so either
    // shape being active freezes rotation the same way.
    const dotsAmountForSpin = this._dotsAmount || 0;
    const noRotateAmount = Math.max(gridAmountForSpin, dotsAmountForSpin);
    // Grid/Dots: fully stopped rotation, not just a pinned mouse-slant. The
    // ambient auto-spin below normally advances every frame regardless of
    // shape; while grid or dots is the active/blending shape its advance is
    // ramped down to 0 (via the same blend used everywhere else in this
    // file), so the lattice actually holds still instead of just losing its
    // mouse-driven wobble while still slowly spinning. Pausing the
    // accumulator itself (rather than freezing the derived rotation value)
    // means leaving the shape resumes the spin from exactly where it left
    // off, no snap/jump.
    this.autoRotation += 0.0005 * (1 - noRotateAmount);
    if (this.particles) {
      // Grid/Dots: fixed camera framing, not live mouse-driven. Live mouse
      // tilt fights visually with the mouse-follow wave (uMouseWorld, left
      // untouched below — that's a separate, wanted interaction, and dots
      // doesn't wire into it at all — see where dotsAmount is computed);
      // the lattice needs to hold one designed angle instead of slanting as
      // the cursor moves. Pinned to whatever a virtual mouse parked at a
      // fixed screen position would produce, reusing the exact same
      // rotation formula as every other shape — only the mouse input is
      // swapped for a constant. Blends smoothly in/out via the same
      // shape-driven pattern as uLabProgress/uTerrainProgress.
      const gridAmount = noRotateAmount;
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
      // Dots: flatten to exactly zero tilt, not Grid's pinned angle — a
      // truly flat, camera-facing field per its own reference image, rather
      // than just frozen at whatever angle happened to be active when it
      // took over. Blends via dotsAmountForSpin like everything else here,
      // so entering/leaving dots eases the tilt out smoothly instead of
      // snapping (0 amount = no effect, so this leaves Grid's own tilt
      // alone).
      if (dotsAmountForSpin > 0.0001) {
        this.particles.rotation.y *= (1 - dotsAmountForSpin);
        this.particles.rotation.x *= (1 - dotsAmountForSpin);
      }

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

      this._applyHeroExitVisuals();
    }

    // SCROLL DIRECTOR — last writer before the draw, on purpose. Everything
    // above (auto-rotation, mouse tilt, the hero offset) writes
    // particles.rotation/position every frame, so a director hooked into
    // _rafCallbacks (which run AFTER the draw) would have its values
    // overwritten before they were ever rendered. Applying here is the only
    // point where "scroll decides the scene" actually wins.
    // No-op unless a timeline has been configured — see
    // particle-scroll-director.js.
    if (this.scrollDirector) this.scrollDirector.apply(this);

    // Half-rate low-end rendering removed (2026-07-17): it existed for the
    // bloom/CPU-morph era. With the fine-particle profile + dpr 1, low-end
    // devices target full frame rate like everyone else.
    const skipRenderThisFrame = false;

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
    this._unsubscribeResizeScrollFlush?.();
    this._unsubscribeMobileScaleResize?.();
    this._themeObserver?.disconnect();
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
