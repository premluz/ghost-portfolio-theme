/**
 * Particle Fragment Shader (Billboard Quads)
 * Hexagonal bokeh disc + hot gaussian center + wide gaussian halo, with
 * chromatic aberration. The hex disc mimics camera aperture blades; the halo
 * accumulates through additive blending into bloom in dense regions; CA
 * splits the channels radially like a real glass lens.
 */

// Fragment input from vertex shader
struct FragmentInput {
  @location(0) uv: vec2f,
  @location(1) particleColor: vec3f,
  @location(2) fade: f32,
};

// Signed-distance-style metric to a hexagon: 0 at center, 1 at the
// hexagon's inscribed edge. Small dots stay visually round; large near
// particles read as six-sided bokeh discs.
fn hexDist(p: vec2f) -> f32 {
  let q = abs(p);
  return max(q.x * 0.866025 + q.y * 0.5, q.y);
}

// Full radial brightness profile of one particle at centered coords p
// (-1..1 across the quad): hex bokeh disc + hot center + wide glow halo.
fn dotBrightness(p: vec2f) -> f32 {
  let dist = length(p);
  let hd = hexDist(p);

  // Hexagonal bokeh disc: flat plate with a soft rim (inner ~40% of quad)
  let disc = 1.0 - smoothstep(0.30, 0.46, hd);

  // Hot gaussian center: bright lit point inside the disc
  let core = exp(-dist * dist * 22.0);

  // Wide gaussian halo: per-particle glow, ~zero at the quad edge
  let halo = 0.5 * exp(-dist * dist * 4.5);

  return max(disc * 0.85, core) + halo;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  // Centered coords: -1..1 across the quad
  let p = (input.uv - vec2f(0.5, 0.5)) * 2.0;
  let dist = length(p);

  if (dist > 1.0) {
    discard;
  }

  // ── Chromatic aberration: sample the profile at per-channel radii ──
  // Shrinking a channel's coordinate renders that channel slightly larger,
  // so red fringes outward and blue inward at the disc rim — lateral CA.
  let ca = 0.07;
  let bR = dotBrightness(p * (1.0 - ca));
  let bG = dotBrightness(p);
  let bB = dotBrightness(p * (1.0 + ca));

  // Push the hot center toward white for a lit look
  let core = exp(-dist * dist * 22.0);
  let baseColor = mix(input.particleColor, vec3f(1.0), core * 0.5);

  // Per-channel brightness in rgb; fade in alpha. With src-alpha additive
  // blending the contribution is rgb × alpha, same energy as before.
  let rgb = baseColor * vec3f(bR, bG, bB);
  return vec4f(rgb, input.fade);
}
