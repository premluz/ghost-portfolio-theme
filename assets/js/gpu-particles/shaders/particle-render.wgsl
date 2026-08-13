/**
 * Particle Render Vertex Shader (Instanced Billboards)
 * Each particle = 1 quad billboard, expanded in vertex shader
 */

// Uniforms
struct CameraData {
  viewProj: mat4x4f,     // View-projection matrix
  time: f32,              // Time in milliseconds for shape rotation
  canvasHeight: f32,      // Device-pixel canvas height, for the DPR compensation below
};
@group(0) @binding(0) var<uniform> camera: CameraData;

// The quad/hex-bokeh size and edge softness below were tuned by eye at a
// retina-class resolution. Both are expressed as fractions of the quad
// itself (NDC size, UV-space smoothstep) — resolution-independent by
// construction — so the absolute PIXEL count spanning each particle's
// antialiased edge shrinks in lockstep with canvas resolution: plenty of
// samples at 2x/3x DPR, as few as 1-2 pixels at 1x, reading as coarse/
// hexagonal/muddy on standard non-retina displays. REFERENCE_HEIGHT is the
// device-pixel canvas height this tuning assumed (a typical retina laptop:
// ~900 CSS px * 2 dpr). Below that, quadSize is scaled up so the actual
// on-screen pixel footprint — and therefore the fragment shader's edge
// sample density, since its smoothstep operates in this same quad's UV
// space — stays roughly constant regardless of DPR, continuously (1.5x
// Windows scaling included), not just switched between two hardcoded cases.
const REFERENCE_HEIGHT: f32 = 1800.0;

// Storage buffers (read-only)
@group(0) @binding(1) var<storage> positions : array<vec3f>;
@group(0) @binding(2) var<storage> rotations : array<vec4f>;

// Vertex output
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,             // Quad UV (0-1)
  @location(1) particleColor: vec3f,  // Color (depth-driven)
  @location(2) depth: f32,            // Normalized depth (0=near, 1=far) for fragment shader
};

// Quaternion rotation helper (module-level)
fn quaternion_rotate(v: vec3f, q: vec4f) -> vec3f {
  let qv = vec4f(q.xyz, 0.0);
  let uv = 2.0 * cross(q.xyz, v);
  return v + q.w * uv + cross(q.xyz, uv);
}

/**
 * Vertex shader main
 * Each vertex is a corner of a quad billboard around the particle
 */
@vertex
fn main(
  @builtin(vertex_index) vertexIdx: u32,
  @builtin(instance_index) instanceIdx: u32
) -> VertexOutput {
  // Get particle position, rotation, and color
  var particlePos = positions[instanceIdx];
  let particleRot = rotations[instanceIdx];

  // ── Shape rotation: rotate around Y-axis at center (0,0,0) ──
  let timeSeconds = camera.time / 1000.0;
  let shapeRotAngle = timeSeconds * 0.08;  // Radians per second
  let sinA = sin(shapeRotAngle);
  let cosA = cos(shapeRotAngle);

  // Apply Y-axis rotation to position
  let rotX = particlePos.x * cosA - particlePos.z * sinA;
  let rotZ = particlePos.x * sinA + particlePos.z * cosA;
  particlePos = vec3f(rotX, particlePos.y, rotZ);

  // ── Create quad billboard (4 vertices = one quad) ──
  let cornerIdx = vertexIdx % 4u;
  var cornerPos = vec2f(0.0, 0.0);
  var uv = vec2f(0.0, 0.0);

  if (cornerIdx == 0u) {
    cornerPos = vec2f(-1.0, -1.0);
    uv = vec2f(0.0, 0.0);
  } else if (cornerIdx == 1u) {
    cornerPos = vec2f(1.0, -1.0);
    uv = vec2f(1.0, 0.0);
  } else if (cornerIdx == 2u) {
    cornerPos = vec2f(1.0, 1.0);
    uv = vec2f(1.0, 1.0);
  } else {
    cornerPos = vec2f(-1.0, 1.0);
    uv = vec2f(0.0, 1.0);
  }

  // ── Depth cue: +z is toward the viewer ──
  let normalizedDepth = clamp((particlePos.z + 3.0) / 6.0, 0.0, 1.0);  // Map [-3, 3] to [0, 1]

  // ── Quad size scaled by depth: near particles large, far ones small ──
  // Fakes perspective under the ortho camera so the viewer reads as being
  // inside the cloud instead of observing a flat scatter.
  //
  // ── DPR pixel-density compensation (see CameraData/REFERENCE_HEIGHT above) ──
  // max(1.0, ...) so this only ever grows the quad on lower-than-reference
  // resolutions — never shrinks it on higher-DPI displays, which already
  // have plenty of samples. Continuous in canvasHeight, so 1.5x scaling
  // (e.g. Windows) lands proportionally between the 1x and 2x/3x cases,
  // not snapped to either one.
  let pixelDensityCompensation = max(1.0, REFERENCE_HEIGHT / camera.canvasHeight);
  let quadSize = 0.012 * mix(0.45, 2.2, normalizedDepth) * pixelDensityCompensation;

  // Apply particle rotation to quad corner
  let rotatedCorner = quaternion_rotate(vec3f(cornerPos.x * quadSize, cornerPos.y * quadSize, 0.0), particleRot);

  // ── Project to clip space using view-projection matrix ──
  let worldPos = particlePos + vec3f(rotatedCorner.xy, 0.0);
  let clipPos = camera.viewProj * vec4f(worldPos, 1.0);

  // ── Depth-based color: Z position drives color ──
  // Color ramp: far back (0.2, 0.2, 1.0) blue → front (1,1,1) white
  let nearColor = vec3f(1.0, 1.0, 1.0);
  let farColor = vec3f(0.2, 0.2, 1.0);
  let depthColor = mix(farColor, nearColor, normalizedDepth);

  // Final output
  var output: VertexOutput;
  output.position = clipPos;
  output.uv = uv;
  output.particleColor = depthColor;
  output.depth = normalizedDepth;

  return output;
}
