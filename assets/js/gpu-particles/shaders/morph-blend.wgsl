/**
 * Morph Blend Compute Shader
 * Blends particle positions from current → target shape
 */

// Storage buffers
@group(0) @binding(0) var<storage, read_write> currentPositions : array<vec3f>;
@group(0) @binding(1) var<storage, read> targetPositions : array<vec3f>;
@group(0) @binding(2) var<storage, read_write> rotations : array<vec4f>;

// Uniform buffer
struct Uniforms {
  morphProgress: f32,      // 0-1: blend factor
  morphEase: u32,          // 0=linear, 1=easeInOutCubic
  time: f32,
  particleCount: u32,
};

@group(1) @binding(0) var<uniform> uniforms : Uniforms;

/**
 * Easing: easeInOutCubic
 */
fn easeInOutCubic(t: f32) -> f32 {
  let t2 = t * t;
  let t3 = t2 * t;

  if (t < 0.5) {
    return 4.0 * t3;
  } else {
    let t_adj = t - 1.0;
    let t_adj3 = t_adj * t_adj * t_adj;
    return 1.0 - t_adj3 * 2.0;
  }
}

/**
 * Easing: linear
 */
fn easeLinear(t: f32) -> f32 {
  return t;
}

/**
 * Apply easing function
 */
fn applyEase(t: f32, easeType: u32) -> f32 {
  if (easeType == 1u) {
    return easeInOutCubic(t);
  }
  return easeLinear(t);
}

/**
 * Main compute shader
 * Blends current positions toward target positions
 */
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
  let idx = global_id.x;

  // Boundary check
  if (idx >= uniforms.particleCount) {
    return;
  }

  // ── Apply easing to morph progress ──
  let easedProgress = applyEase(uniforms.morphProgress, uniforms.morphEase);

  // ── Blend positions: current → target ──
  let current = currentPositions[idx];
  let targetPos = targetPositions[idx];
  let blended = mix(current, targetPos, easedProgress);

  currentPositions[idx] = blended;

  // ── Rotate particles during morph ──
  // Subtle rotation based on morph progress (full rotation over morph)
  var rot = rotations[idx];

  let morphAngle = easedProgress * 6.28318530718; // 2π
  let rotSin = sin(morphAngle * 0.5);
  let rotCos = cos(morphAngle * 0.5);

  // Rotate around Y axis
  let rotY = vec4f(0.0, rotSin, 0.0, rotCos);

  // Quaternion multiply: rot * rotY
  let newRot = vec4f(
    rot.w * rotY.x + rot.x * rotY.w + rot.y * rotY.z - rot.z * rotY.y,
    rot.w * rotY.y + rot.y * rotY.w + rot.z * rotY.x - rot.x * rotY.z,
    rot.w * rotY.z + rot.z * rotY.w + rot.x * rotY.y - rot.y * rotY.x,
    rot.w * rotY.w - rot.x * rotY.x - rot.y * rotY.y - rot.z * rotY.z
  );

  rotations[idx] = newRot;
}
