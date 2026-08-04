(function() { 'use strict';

// Shader source + config constants for gradflow-background.js, split out
// so that file stays under this repo's 200-line guardrail — this is pure
// GLSL/data, not logic, so it lives separately rather than being split in
// a way that would break the shader itself. Copied verbatim from
// node_modules/gradflow/dist/index.mjs (see gradflow-background.js for the
// full "why vanilla, not the React component" explanation).

const VERTEX = `
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform float u_time;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  // 4th color — waveGradient only (see below). The other gradient types
  // are untouched 3-color cycles; this theme only ever uses 'wave'.
  uniform vec3 u_color4;
  uniform float u_speed;
  uniform float u_scale;
  uniform int u_type;
  uniform float u_noise;
  uniform vec2 u_resolution;

  // ── SECOND WAVE LAYER (waveGradient only) ─────────────────────────
  // A second, independently-shaped wave composited over the base ramp, so
  // a band reads as two crossing currents instead of one wash. Its own
  // scale (frequency) is the point: at a different frequency the two never
  // sit on top of each other. Drawn as a soft BAND (centre + width) rather
  // than a full ramp so it overlays without flattening the base.
  // u_layer2_opacity 0 disables it and the branch is uniform, so there is
  // no per-fragment divergence cost when unused.
  uniform vec3 u_layer2_color1;
  uniform vec3 u_layer2_color2;
  uniform float u_layer2_opacity;
  uniform float u_layer2_scale;
  uniform float u_layer2_speed;
  uniform float u_layer2_center;
  uniform float u_layer2_width;

  // Scroll position in viewport heights, updated per frame. Each layer
  // multiplies it by its own parallax factor, so they drift past each
  // other as the page moves. Applied to the DISPLACEMENT (which is
  // tapered to zero at both edges), never to the ramp position — that is
  // what keeps the band's outer colours exactly matching the page.
  uniform float u_scroll;
  uniform float u_parallax;
  uniform float u_layer2_parallax;

  // "Breathe" — the wave's own height (amplitude) slowly expanding and
  // collapsing over time, rather than holding one constant height. One
  // knob for both layers; the PACE each one breathes at is derived from
  // that call's own speed inside waveFlow() below (already different
  // between the base wave and layer2 — see DEFAULTS.speed vs wave2Speed
  // in gradient-frame.js) rather than a second per-layer uniform, so the
  // two layers naturally drift in and out of phase using a parameter that
  // already exists for another reason. 0 = off, exactly the old constant-
  // amplitude behaviour.
  uniform float u_breathe;

  varying vec2 vUv;

  #define PI 3.14159265359

  float noise(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 linearGradient(vec2 uv, float time) {
    float t = (uv.y * u_scale) + sin(uv.x * PI + time) * 0.1;
    t = clamp(t, 0.0, 1.0);

    return t < 0.5
      ? mix(u_color1, u_color2, t * 2.0)
      : mix(u_color2, u_color3, (t - 0.5) * 2.0);
  }

  vec3 conicGradient(vec2 uv, float time) {
    vec2 center = vec2(0.5);
    vec2 pos = uv - center;

    float angle = atan(pos.y, pos.x);
    float normalizedAngle = (angle + PI) / (2.0 * PI);

    float t = fract(normalizedAngle * u_scale + time * 0.3);
    float smoothT = t;

    vec3 color;
    if (smoothT < 0.33) {
      color = mix(u_color1, u_color2, smoothstep(0.0, 0.33, smoothT));
    } else if (smoothT < 0.66) {
      color = mix(u_color2, u_color3, smoothstep(0.33, 0.66, smoothT));
    } else {
      color = mix(u_color3, u_color1, smoothstep(0.66, 1.0, smoothT));
    }

    float dist = length(pos);
    color += sin(dist * 8.0 + time * 1.5) * 0.03;

    return color;
  }

  #define S(a,b,t) smoothstep(a,b,t)

  mat2 Rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
    return fract(sin(p) * 43758.5453);
  }

  float advancedNoise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                      dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                  mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                      dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
    return 0.5 + 0.5 * n;
  }

  vec3 animatedGradient(vec2 uv, float time) {
    float ratio = u_resolution.x / u_resolution.y;
    vec2 tuv = uv;
    tuv -= 0.5;

    float degree = advancedNoise(vec2(time * 0.1 * u_speed, tuv.x * tuv.y));
    tuv.y *= 1.0 / ratio;
    tuv *= Rot(radians((degree - 0.5) * 720.0 * u_scale + 180.0));
    tuv.y *= ratio;

    float frequency = 5.0 * u_scale;
    float amplitude = 30.0;
    float speed = time * 2.0 * u_speed;
    tuv.x += sin(tuv.y * frequency + speed) / amplitude;
    tuv.y += sin(tuv.x * frequency * 1.5 + speed) / (amplitude * 0.5);

    vec3 layer1 = mix(u_color1, u_color2, S(-0.3, 0.2, (tuv * Rot(radians(-5.0))).x));
    vec3 layer2 = mix(u_color2, u_color3, S(-0.3, 0.2, (tuv * Rot(radians(-5.0))).x));

    vec3 finalComp = mix(layer1, layer2, S(0.05, -0.2, tuv.y));

    return finalComp;
  }

  // 4-COLOR BAND: color1 at the very bottom edge, color4 at the very top
  // edge, with a wavy color2<->color3 core floating between them.
  //
  // Two deliberate differences from gradflow's stock 3-color waveGradient:
  //
  // 1. Stock CYCLES (its last stop wraps back to color1), which is fine for
  //    one self-contained blob but meant the SAME color landed on both the
  //    top and bottom edge of a band — no way to match a different page
  //    background above vs. content background below. Hence the 4th color.
  //
  // 2. Stock derives the edge colors from 'pattern', which is uv.y PLUS the
  //    wave offsets (up to ±0.45). So at uv.y=0 the pattern could already be
  //    ~0.45 and paint a wave color instead of the edge color — the band
  //    ended in mid-wave and read as a hard horizontal cut against the page.
  //    Fixed by TAPERING THE WAVE AMPLITUDE to zero at both edges, so
  //    flowingY == uv.y exactly there. (An earlier attempt instead faded the
  //    COLORS toward the edges over uv.y 0->0.45 and 0.55->1, which did fix
  //    the cut but left the waves only 10% of the band tall — the whole
  //    thing flattened into horizontal stripes. Taper the displacement, not
  //    the color: the diagonal sweep survives at full strength mid-band.)
  // One layer's displaced vertical coordinate. Shared by both waves so
  // they are literally the same curve shape at different frequencies.
  float waveFlow(vec2 uv, float time, float scale, float speed, float parallax, float taper) {
    // Pulse rate is 0.12x this layer's own speed — heavily slowed down so
    // it reads as a calm, slow breathing rather than tracking the wave's
    // own faster side-to-side motion. Ranges the amplitude multiplier
    // 1-u_breathe .. 1+u_breathe, so u_breathe=1 swings from fully
    // collapsed (0, flat) to double height (expanded).
    float breathe = 1.0 + sin(time * speed * 0.12) * u_breathe;
    float w1 = sin(uv.x * PI * scale * 0.8 + time * speed * 0.5) * 0.1 * breathe;
    float w2 = sin(uv.x * PI * scale * 0.5 + time * speed * 0.3) * 0.15 * breathe;
    float w3 = sin(uv.x * PI * scale * 1.2 + time * speed * 0.8) * 0.2 * breathe;
    return uv.y + (w1 + w2 + w3 + u_scroll * parallax) * taper;
  }

  vec3 waveGradient(vec2 uv, float time) {
    // 0 at uv.y 0 and 1, 1 at mid-band.
    float taper = sin(uv.y * PI);

    // BASE LAYER — the 4-colour edge ramp.
    float flowingY = waveFlow(uv, time, u_scale, u_speed, u_parallax, taper);
    float pattern = smoothstep(0.0, 1.0, clamp(flowingY, 0.0, 1.0));

    vec3 color;
    if (pattern < 0.333) {
      color = mix(u_color1, u_color2, smoothstep(0.0, 0.333, pattern));
    } else if (pattern < 0.667) {
      color = mix(u_color2, u_color3, smoothstep(0.333, 0.667, pattern));
    } else {
      color = mix(u_color3, u_color4, smoothstep(0.667, 1.0, pattern));
    }

    // Tapered too — an untapered ±0.02 would nudge the edges off their
    // exact color match.
    color += sin(uv.x * PI * 2.0 + time * u_speed) *
             cos(uv.y * PI * 1.5 + time * u_speed * 0.7) * 0.02 * taper;

    // SECOND LAYER — soft band, own frequency/speed/parallax/colours.
    // Its alpha carries the same taper, so it fades out at both edges and
    // cannot disturb the exact edge match the base ramp guarantees.
    if (u_layer2_opacity > 0.001) {
      float flow2 = waveFlow(uv, time, u_layer2_scale, u_layer2_speed, u_layer2_parallax, taper);
      float band = smoothstep(u_layer2_width, 0.0, abs(flow2 - u_layer2_center));
      vec3 c2 = mix(u_layer2_color1, u_layer2_color2, clamp(flow2, 0.0, 1.0));
      color = mix(color, c2, band * u_layer2_opacity * taper);
    }

    return clamp(color, 0.0, 1.0);
  }

  vec3 silkGradient(vec2 uv, float time) {
    vec2 fragCoord = uv * u_resolution;
    vec2 invResolution = 1.0 / u_resolution.xy;
    vec2 centeredUv = (fragCoord * 2.0 - u_resolution.xy) * invResolution;

    centeredUv *= u_scale;

    float dampening = 1.0 / (1.0 + u_scale * 0.1);

    float d = -time * u_speed * 0.5;
    float a = 0.0;

    for (float i = 0.0; i < 8.0; ++i) {
        a += cos(i - d - a * centeredUv.x) * dampening;
        d += sin(centeredUv.y * i + a) * dampening;
    }

    d += time * u_speed * 0.5;

    vec3 patterns = vec3(
      cos(centeredUv.x * d + a) * 0.5 + 0.5,
      cos(centeredUv.y * a + d) * 0.5 + 0.5,
      cos((centeredUv.x + centeredUv.y) * (d + a) * 0.5) * 0.5 + 0.5
    );

    vec3 color1Mix = mix(u_color1, u_color2, patterns.x);
    vec3 color2Mix = mix(u_color2, u_color3, patterns.y);
    vec3 color3Mix = mix(u_color3, u_color1, patterns.z);

    vec3 finalColor = mix(color1Mix, color2Mix, patterns.z);
    finalColor = mix(finalColor, color3Mix, patterns.x * 0.5);

    vec3 originalPattern = vec3(cos(centeredUv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
    originalPattern = cos(originalPattern * cos(vec3(d, a, 2.5)) * 0.5 + 0.5);

    return mix(finalColor, originalPattern * finalColor, 0.3);
  }

  vec3 smokeGradient(vec2 uv, float time) {
    float mr = min(u_resolution.x, u_resolution.y);
    vec2 fragCoord = uv * u_resolution;
    vec2 p = (2.0 * fragCoord.xy - u_resolution.xy) / mr;

    p *= u_scale;

    float iTime = time * u_speed;

    for(int i = 1; i < 10; i++) {
      vec2 newp = p;
      float fi = float(i);
      newp.x += 0.6 / fi * sin(fi * p.y + iTime + 0.3 * fi) + 1.0;
      newp.y += 0.6 / fi * sin(fi * p.x + iTime + 0.3 * (fi + 10.0)) - 1.4;
      p = newp;
    }

    float redPattern = 1.0;
    float greenPattern = 1.0 - sin(p.y);
    float bluePattern = sin(p.x + p.y);

    greenPattern = clamp(greenPattern, 0.0, 1.0);
    bluePattern = bluePattern * 0.5 + 0.5;

    vec3 color;

    vec3 color12 = mix(u_color1, u_color2, greenPattern);

    color = mix(color12, u_color3, bluePattern);

    return clamp(color, 0.0, 1.0);
  }

  vec3 stripeGradient(vec2 uv, float time) {
    vec2 p = ((uv * u_resolution * 2.0 - u_resolution.xy) / (u_resolution.x + u_resolution.y) * 2.0) * u_scale;
    float t = time * 0.7, a = 4.0 * p.y - sin(-p.x * 3.0 + p.y - t);
    a = smoothstep(cos(a) * 0.7, sin(a) * 0.7 + 1.0, cos(a - 4.0 * p.y) - sin(a + 3.0 * p.x));

    vec2 warped = (cos(a) * p + sin(a) * vec2(-p.y, p.x)) * 0.5 + 0.5;
    vec3 color = mix(u_color1, u_color2, warped.x);

    color = mix(color, u_color3, warped.y);
    color *= color + 0.6 * sqrt(color);

    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    float time = u_time * u_speed;

    vec3 color;

    if (u_type == 0) {
      color = linearGradient(uv, time);
    } else if (u_type == 1) {
      color = conicGradient(uv, time);
    } else if (u_type == 2) {
      color = animatedGradient(uv, time);
    } else if (u_type == 3) {
      color = waveGradient(uv, time);
    } else if (u_type == 4) {
      color = silkGradient(uv, time);
    } else if (u_type == 5) {
      color = smokeGradient(uv, time);
    } else if (u_type == 6) {
      color = stripeGradient(uv, time);
    } else {
      color = animatedGradient(uv, time);
    }

    if (u_noise > 0.001) {
      float grain = noise(uv * 200.0 + time * 0.1);
      color *= (1.0 - u_noise * 0.4 + u_noise * grain * 0.4);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

const GRADIENT_TYPE_NUMBER = { linear: 0, conic: 1, animated: 2, wave: 3, silk: 4, smoke: 5, stripe: 6 };

const DEFAULT_CONFIG = {
  color1: { r: 226, g: 98, b: 75 },
  color2: { r: 255, g: 255, b: 255 },
  color3: { r: 30, g: 34, b: 159 },
  // Falls back to color1 (matches waveGradient's old cyclic behavior)
  // when a caller doesn't supply a 4th color — only 'wave' reads this.
  color4: { r: 226, g: 98, b: 75 },
  speed: 0.4,
  scale: 1,
  layer2: null, // { color1, color2, opacity, scale, speed, center, width, parallax }
  parallax: 0,
  // Calm amplitude pulse (see waveFlow in the fragment shader above). 0.4
  // swings each wave's height between 60% and 140% of its base amplitude.
  breathe: 0.4,
  type: 'stripe',
  noise: 0.08,
};

window.GRADFLOW_SHADERS = { VERTEX, FRAGMENT, GRADIENT_TYPE_NUMBER, DEFAULT_CONFIG };

})();
