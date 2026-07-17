/**
 * Compute Particles Shader
 * Updates particle positions, rotations, and velocities each frame
 * Blends particles toward target shape positions for morphing
 */

// Storage buffers (read-write)
@group(0) @binding(0) var<storage, read_write> positions : array<vec3f>;
@group(0) @binding(1) var<storage, read_write> rotations : array<vec4f>;
@group(0) @binding(2) var<storage, read> targetPositions : array<vec3f>;
@group(0) @binding(3) var<storage, read_write> velocities : array<vec3f>;

// Uniform buffer (read-only)
struct Uniforms {
  morphProgress: f32,
  morphTarget: u32,
  time: f32,
  particleCount: u32,
};

@group(1) @binding(0) var<uniform> uniforms : Uniforms;

/**
 * Simple pseudo-random number generator
 */
fn random(seed: u32) -> f32 {
  var x = seed ^ u32(12345);
  x = x ^ (x << 13u);
  x = x ^ (x >> 17u);
  x = x ^ (x << 5u);
  return f32(x) / 4294967295.0;
}

/**
 * Quaternion multiplication: q1 * q2
 */
fn quaternion_multiply(q1: vec4f, q2: vec4f) -> vec4f {
  return vec4f(
    q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    q1.w * q2.y + q1.y * q2.w + q1.z * q2.x - q1.x * q2.z,
    q1.w * q2.z + q1.z * q2.w + q1.x * q2.y - q1.y * q2.x,
    q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
  );
}

/**
 * Rotate vector by quaternion
 */
fn quaternion_rotate(v: vec3f, q: vec4f) -> vec3f {
  let qv = vec4f(q.xyz, 0.0);
  let uv = 2.0 * cross(q.xyz, v);
  return v + q.w * uv + cross(q.xyz, uv);
}

/**
 * Main compute shader
 * Each workgroup processes 64 particles in parallel
 */
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
  let idx = global_id.x;

  // Boundary check
  if (idx >= uniforms.particleCount) {
    return;
  }

  // ── Morph: interpolate toward target position ──
  var pos = positions[idx];
  let targetPos = targetPositions[idx];
  pos = mix(pos, targetPos, uniforms.morphProgress);

  // Rotation is applied in vertex shader, not in simulation
  var rot = rotations[idx];

  // ── Dampen velocity (apply friction) ──
  var vel = velocities[idx];
  vel *= 0.95;

  // ── Write back to buffers ──
  positions[idx] = pos;
  rotations[idx] = rot;
  velocities[idx] = vel;
}
