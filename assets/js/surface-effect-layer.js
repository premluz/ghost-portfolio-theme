/**
 * SurfaceEffectLayer — reusable scroll-orchestrated visual-effect module.
 * Phase 1: core scaffolding + one effect ('liquid-glass' — chromatic-
 * refraction ripple distortion sampled from an <img>/<video>). Full-screen /
 * snapshot mode is explicitly out of scope for Phase 1.
 *
 * House pattern mirrored from background-layer.js: fire-and-forget attach()
 * (synchronous return, no Promise), a plain 0-1 number as the only "state"
 * a caller feeds in, rAF-coalesced, ResizeObserver/IntersectionObserver-
 * driven, kill() teardown. Unlike BackgroundLayer this module owns no
 * producer of its own (no internal ScrollTrigger, no CSS custom property) —
 * callers drive `handle.set(t)` from whatever single producer they already
 * have (e.g. bindShift's onProgress). One producer per handle: this module
 * never creates its own ScrollTrigger and never reads/writes theme tokens
 * or CSS custom properties — it only samples pixels, so it is palette-
 * agnostic by construction.
 */
(function () {
  'use strict';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function noopHandle() {
    return {
      set: function () {},
      pulse: function () {},
      setCenter: function () {},
      setUniform: function () {},
      refreshTexture: function () {},
      kill: function () {},
      _isRendering: false,
    };
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Media can be an <img>, <video>, or a caller-owned <canvas> (e.g. a
  // rasterized text snapshot — see refreshTexture() below). Canvas sources
  // have no .complete/.naturalWidth (those are HTMLImageElement-only) and
  // are always immediately "ready" since the caller draws into them
  // synchronously before attach() ever sees them.
  function mediaIsReady(media) {
    if (media.tagName === 'IMG') return media.complete && media.naturalWidth > 0;
    if (media.tagName === 'CANVAS') return media.width > 0 && media.height > 0;
    return true;
  }
  function getMediaWidth(media) { return media.naturalWidth || media.videoWidth || media.width || 1; }
  function getMediaHeight(media) { return media.naturalHeight || media.videoHeight || media.height || 1; }

  function easeInOut(x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  // ── Shaders ─────────────────────────────────────────────────────────
  var VERT_SRC = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}',
  ].join('\n');

  var LIQUID_GLASS_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uIntensity;',
    'uniform float uTime;',
    'uniform float uChroma;',
    'uniform float uMaxDisp;',
    'uniform float uRadius;',
    'uniform vec2 uCenter;',
    'uniform vec2 uTexScale;',
    'uniform vec2 uTexOffset;',
    '',
    '// ── 2-octave value noise (cheap, no external displacement image) ──',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float valueNoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
    '}',
    'float noise2(vec2 p) {',
    '  return valueNoise(p) * 0.6 + valueNoise(p * 2.0 + 17.0) * 0.4;',
    '}',
    '',
    'vec2 coverUv(vec2 uv) {',
    '  return uv * uTexScale + uTexOffset;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '',
    '  // Inverse radial falloff from uCenter: the effect is at FULL',
    '  // strength everywhere by default, and clears to zero within uRadius',
    '  // of uCenter — a cursor "wiping the glass clear" locally, rather',
    '  // than a spotlight painting the effect on. uCenter defaults far',
    '  // outside [0,1] (see attach options) so nothing clears until a',
    '  // real cursor position is supplied.',
    '  float dist = distance(uv, uCenter);',
    '  float falloff = smoothstep(0.0, uRadius, dist);',
    '',
    '  // Two independent noise samples (offset in both space and time) give',
    '  // a genuine 2D displacement vector instead of one scalar driving both',
    '  // axes identically, which reads as a much more liquid/organic ripple.',
    '  float nx = noise2(uv * 3.0 + uTime * 0.15);',
    '  float ny = noise2(uv * 3.0 + vec2(5.2, 1.3) + uTime * 0.15);',
    '  vec2 displacement = (vec2(nx, ny) - 0.5) * 2.0 * uIntensity * uMaxDisp * falloff;',
    '',
    '  // Chromatic refraction: sample uTex three times, each channel at a',
    '  // slightly different displacement magnitude — fringing then appears',
    '  // at high-gradient edges automatically (the refractive-glass look).',
    '  vec2 dispR = displacement * (1.0 + 0.35 * uChroma);',
    '  vec2 dispG = displacement;',
    '  vec2 dispB = displacement * (1.0 - 0.35 * uChroma);',
    '',
    '  vec4 texR = texture2D(uTex, coverUv(uv + dispR));',
    '  vec4 texG = texture2D(uTex, coverUv(uv + dispG));',
    '  vec4 texB = texture2D(uTex, coverUv(uv + dispB));',
    '',
    '  // Real alpha (not a forced 1.0): opaque photo media has alpha=1',
    '  // everywhere anyway, so this is a no-op for images/video. For a',
    '  // rasterized-text canvas (mostly-transparent background, alpha=1',
    '  // only at glyph pixels) this is what lets the real page show through',
    '  // around the letters instead of an opaque block covering the box.',
    '  gl_FragColor = vec4(texR.r, texG.g, texB.b, texG.a);',
    '}',
  ].join('\n');

  // ── Effect registry — a future effect is a new entry only ───────────
  var EFFECTS = {
    'liquid-glass': {
      vert: VERT_SRC,
      frag: LIQUID_GLASS_FRAG,
      uniforms: function (overrides) {
        return Object.assign({ chroma: 1.0, maxDisp: 0.06, radius: 0.9 }, overrides);
      },
      mapIntensity: function (t) { return t; },
    },
  };

  // ── GL helpers ────────────────────────────────────────────────────────
  function compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function buildProgram(gl, vertSrc, fragSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return prog;
  }

  function computeCoverUV(state) {
    var canvasAspect = state.canvas.width / state.canvas.height;
    var mediaAspect = state.mediaW / state.mediaH;
    if (!isFinite(mediaAspect) || mediaAspect <= 0) return;
    var scaleX, scaleY;
    if (mediaAspect > canvasAspect) {
      scaleY = 1;
      scaleX = canvasAspect / mediaAspect;
    } else {
      scaleX = 1;
      scaleY = mediaAspect / canvasAspect;
    }
    state.texScale = [scaleX, scaleY];
    state.texOffset = [(1 - scaleX) / 2, (1 - scaleY) / 2];
  }

  function resizeCanvas(state) {
    var rect = state.target.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, state.opts.dprCap);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (state.canvas.width !== w || state.canvas.height !== h) {
      state.canvas.width = w;
      state.canvas.height = h;
    }
    computeCoverUV(state);
  }

  function updateCanvasOpacity(state) {
    var active = state.effectiveIntensity > 0.001;
    state.canvas.style.opacity = active ? '1' : '0';
  }

  function killState(state) {
    state.dead = true;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state._isRendering = false;
    if (state.ro) state.ro.disconnect();
    if (state.io) state.io.disconnect();
    if (state.canvas && state.canvas.parentNode) {
      state.canvas.parentNode.removeChild(state.canvas);
    }
    if (state.gl) {
      var ext = state.gl.getExtension('WEBGL_lose_context');
      if (ext) { try { ext.loseContext(); } catch (e) {} }
    }
    state.gl = null;
  }

  // Degrade in place: stop rendering, hide the canvas so the untouched
  // media shows through, mark dead so set()/pulse() become no-ops. Used by
  // both context-creation failure and webglcontextlost/render exceptions —
  // this effect is decorative, never allowed to throw outward.
  function degrade(state) {
    if (state.dead) return;
    state.dead = true;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state._isRendering = false;
    if (state.canvas) state.canvas.style.opacity = '0';
  }

  function renderFrame(state, now) {
    try {
      var gl = state.gl;

      // Pulse ramp: easeInOut up to peak over the first half of duration,
      // back down over the second half, then clear. Combined with the
      // scroll-driven base intensity via max() so a pulse always reads as
      // an additional boost on top of whatever the scroll producer is
      // currently driving, never a reduction.
      var pulseIntensity = 0;
      if (state.pulse) {
        var elapsed = now - state.pulse.start;
        if (elapsed >= state.pulse.duration) {
          state.pulse = null;
        } else {
          var half = state.pulse.duration / 2;
          var p = elapsed < half ? easeInOut(elapsed / half) : easeInOut(1 - (elapsed - half) / half);
          pulseIntensity = p * state.pulse.peak;
        }
      }
      state.effectiveIntensity = Math.max(state.baseIntensity, pulseIntensity);
      updateCanvasOpacity(state);

      var center = state.pulse ? state.pulse.center : state.baseCenter;

      // Texture upload: video re-uploads every rendered frame; a static
      // image only needs uploading once (on load), which also gives us the
      // media's natural size for the cover-UV math.
      if (state.mediaIsVideo) {
        if (state.media.readyState >= 2) {
          gl.bindTexture(gl.TEXTURE_2D, state.texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.media);
          if (state.media.videoWidth && (state.mediaW !== state.media.videoWidth || state.mediaH !== state.media.videoHeight)) {
            state.mediaW = state.media.videoWidth;
            state.mediaH = state.media.videoHeight;
            computeCoverUV(state);
          }
        }
      } else if (state.textureNeedsUpload && mediaIsReady(state.media)) {
        gl.bindTexture(gl.TEXTURE_2D, state.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.media);
        state.mediaW = getMediaWidth(state.media);
        state.mediaH = getMediaHeight(state.media);
        computeCoverUV(state);
        state.textureNeedsUpload = false;
      }

      gl.viewport(0, 0, state.canvas.width, state.canvas.height);
      gl.useProgram(state.program);

      gl.uniform1f(state.uIntensityLoc, state.effectiveIntensity);
      gl.uniform1f(state.uTimeLoc, (now - state.startTime) / 1000);
      gl.uniform2f(state.uCenterLoc, center[0], center[1]);
      gl.uniform2f(state.uTexScaleLoc, state.texScale[0], state.texScale[1]);
      gl.uniform2f(state.uTexOffsetLoc, state.texOffset[0], state.texOffset[1]);

      // Effect-configurable uniforms (chroma/maxDisp/radius) — re-set every
      // frame from state.customUniforms so handle.setUniform() (e.g. a
      // live-shrinking radius for a cursor-follow spotlight) takes effect
      // on the next frame, not just at attach time.
      var locs = state.customUniformLocs;
      var vals = state.customUniforms;
      for (var key in locs) {
        if (locs[key]) gl.uniform1f(locs[key], vals[key]);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.texture);
      gl.uniform1i(state.uTexLoc, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
      gl.enableVertexAttribArray(state.aPosLoc);
      gl.vertexAttribPointer(state.aPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch (e) {
      degrade(state);
    }
  }

  function startRenderLoop(state) {
    if (state.rafId || state.dead || !state.visible) return;
    state._isRendering = true;
    var frame = function (now) {
      renderFrame(state, now);
      var active = !state.dead && (state.baseIntensity > 0 || state.pulse) && state.visible;
      if (active) {
        state.rafId = requestAnimationFrame(frame);
      } else {
        state.rafId = 0;
        state._isRendering = false;
      }
    };
    state.rafId = requestAnimationFrame(frame);
  }

  function attach(targetEl, options) {
    options = options || {};

    if (!targetEl || prefersReducedMotion()) {
      return noopHandle();
    }

    var effectName = options.effect || 'liquid-glass';
    var effect = EFFECTS[effectName];
    if (!effect) return noopHandle();

    var media = options.media || targetEl.querySelector('img, video');
    if (!media) return noopHandle();

    if (getComputedStyle(targetEl).position === 'static') {
      targetEl.style.position = 'relative';
    }

    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:2;opacity:0;transition:opacity 120ms linear;';

    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
        canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
    } catch (e) {
      gl = null;
    }
    if (!gl) return noopHandle();

    var program = buildProgram(gl, effect.vert, effect.frag);
    if (!program) return noopHandle();

    var resolvedUniforms = effect.uniforms(options.uniforms || {});

    var quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    targetEl.appendChild(canvas);

    var state = {
      target: targetEl,
      canvas: canvas,
      gl: gl,
      program: program,
      quadBuffer: quadBuffer,
      texture: texture,
      media: media,
      mediaIsVideo: media.tagName === 'VIDEO',
      mediaW: getMediaWidth(media),
      mediaH: getMediaHeight(media),
      textureNeedsUpload: true,
      texScale: [1, 1],
      texOffset: [0, 0],
      opts: { dprCap: options.dprCap || 1.5 },
      baseIntensity: 0,
      effectiveIntensity: 0,
      baseCenter: options.center ? [options.center.x, options.center.y] : [0.5, 0.5],
      pulse: null,
      rafId: 0,
      _isRendering: false,
      visible: true,
      dead: false,
      startTime: performance.now(),
      aPosLoc: gl.getAttribLocation(program, 'aPos'),
      uIntensityLoc: gl.getUniformLocation(program, 'uIntensity'),
      uTimeLoc: gl.getUniformLocation(program, 'uTime'),
      uCenterLoc: gl.getUniformLocation(program, 'uCenter'),
      uTexScaleLoc: gl.getUniformLocation(program, 'uTexScale'),
      uTexOffsetLoc: gl.getUniformLocation(program, 'uTexOffset'),
      uTexLoc: gl.getUniformLocation(program, 'uTex'),
      // Effect-configurable uniforms (chroma/maxDisp/radius by default) —
      // live values + their GL locations, re-applied every frame in
      // renderFrame() so handle.setUniform() can change them post-attach
      // (e.g. shrinking radius into a cursor-follow spotlight).
      customUniforms: resolvedUniforms,
      customUniformLocs: {},
    };

    gl.useProgram(program);
    Object.keys(resolvedUniforms).forEach(function (key) {
      var loc = gl.getUniformLocation(program, 'u' + capitalize(key));
      state.customUniformLocs[key] = loc;
      if (loc) gl.uniform1f(loc, resolvedUniforms[key]);
    });

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      degrade(state);
    });

    if (state.mediaIsVideo) {
      // Nothing to wait for — first ready frame uploads itself in renderFrame().
    } else if (media.tagName === 'IMG' && !media.complete) {
      media.addEventListener('load', function () {
        state.textureNeedsUpload = true;
      }, { once: true });
    }
    // Canvas media (e.g. rasterized text) is always immediately ready —
    // the initial textureNeedsUpload:true above is enough, no event to wait
    // for. Callers redraw it in place and call handle.refreshTexture().

    resizeCanvas(state);

    var resizeRaf = 0;
    var ro = new ResizeObserver(function () {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0;
        if (!state.dead) resizeCanvas(state);
      });
    });
    ro.observe(targetEl);
    state.ro = ro;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        state.visible = entry.isIntersecting;
        if (state.visible) {
          if (state.baseIntensity > 0 || state.pulse) startRenderLoop(state);
        } else if (state.rafId) {
          cancelAnimationFrame(state.rafId);
          state.rafId = 0;
          state._isRendering = false;
        }
      });
    }, { threshold: 0 });
    io.observe(targetEl);
    state.io = io;

    var handle = {
      set: function (t) {
        if (state.dead) return;
        t = Math.max(0, Math.min(1, t));
        state.baseIntensity = effect.mapIntensity(t);
        updateCanvasOpacity(state);
        if (state.baseIntensity > 0 || state.pulse) startRenderLoop(state);
      },
      pulse: function (opts) {
        if (state.dead) return;
        opts = opts || {};
        var center = opts.center || { x: 0.5, y: 0.5 };
        state.pulse = {
          start: performance.now(),
          duration: opts.duration || 900,
          peak: opts.peak != null ? opts.peak : 1,
          center: [center.x, center.y],
        };
        updateCanvasOpacity(state);
        startRenderLoop(state);
      },
      // Persistent ripple origin (0-1, element-relative), used whenever no
      // pulse is active — e.g. a continuously-updated cursor position for
      // a hover-follow spotlight. Independent of intensity: pairs with
      // set(t) the same way pulse's own `center` option pairs with pulse().
      setCenter: function (center) {
        if (state.dead || !center) return;
        state.baseCenter = [center.x, center.y];
      },
      // Live-update one of the effect's configurable uniforms (e.g.
      // 'radius') after attach — takes effect on the next rendered frame.
      // Silently ignored if `name` isn't one of this effect's uniforms.
      setUniform: function (name, value) {
        if (state.dead || !(name in state.customUniforms)) return;
        state.customUniforms[name] = value;
      },
      // For canvas media redrawn in place by the caller (e.g. a text
      // rasterizer re-drawing after content/size changes) — flags a
      // re-upload and re-measures the source size for the cover-UV math,
      // same as what happens automatically on an <img>'s load event.
      refreshTexture: function () {
        if (state.dead) return;
        state.mediaW = getMediaWidth(state.media);
        state.mediaH = getMediaHeight(state.media);
        state.textureNeedsUpload = true;
      },
      kill: function () { killState(state); },
    };

    Object.defineProperty(handle, '_isRendering', {
      get: function () { return state._isRendering; },
    });

    return handle;
  }

  window.SurfaceEffectLayer = { attach: attach, EFFECTS: EFFECTS };
})();
