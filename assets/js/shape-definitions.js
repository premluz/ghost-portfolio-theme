/**
 * Shape Definitions - Generators for different particle shapes
 * Uses MeshSurfaceSampler for uniform surface distribution on low-vertex GLB models
 */

console.log('[shape-definitions] 🎨 Loading with MeshSurfaceSampler support for surface sampling');

class ShapeDefinition {
  constructor(key, generator, config = {}) {
    this.key = key;
    this.generator = generator;
    this.config = {
      radius: 3.5,
      height: 12,
      scale: 1.0,
      ...config
    };
  }

  generate(particleCount) {
    const result = this.generator(particleCount, this.config);
    // Result can be: Float32Array (positions only) or { positions, sizes }
    if (result instanceof Float32Array) {
      return { positions: result, sizes: null };
    }
    return result; // Already an object with { positions, sizes }
  }
}

// HELIX - Two intertwined tubes
// Each particle sits at exactly `tubeRadius` from the tube's own centerline
// (a ring in the XZ-plane at that segment — see x/z formulas below), never
// inside or outside it — this was already true of the geometry itself. To
// animate it with a wavy motion that can NEVER distort that surface (bulge
// in/out), `phis` records, per particle, the single combined angle
// `phi = theta + angle` such that `x = cx + tubeRadius*cos(phi)`,
// `z = cz + tubeRadius*sin(phi)` (derived via the cos/sin angle-addition
// identity from the x/z formulas below — `cx`/`cz` themselves are NOT
// stored; the shader recovers them from the rest position algebraically:
// `cx = x - tubeRadius*cos(phi)`, `cz = z - tubeRadius*sin(phi)`). Animating
// phi and re-evaluating that exact same circle equation is an algebraic
// identity, not an approximation — the particle is mathematically
// guaranteed to stay on the ring (radius exactly `tubeRadius`) for any
// phi offset, so the "surface" can wave without ever bulging or caving.
// Y is untouched entirely (phi has no effect on it), so it can't distort
// that axis either. See uHelixProgress in particle-animation-loop.js.
// CLASSIC DOUBLE-STRAND TUBE HELIX — restored (2026-07-17) after briefly
// being replaced by the ribbon lattice below; the ribbon now lives as its
// own separate 'ribbon' state. Form is the original DNA-style pair of
// tube strands; only the PARTICLE TREATMENT is new: fine dots with per-
// particle size variance and ~0.5% oversized sparkles whose indices match
// the bright colour accents in particle-morph.hbs (same hash + threshold).
// Density comes from the global particleCount (16k desktop), which this
// generator spreads across segments automatically.
const helixGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const phis = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const helixRadius = config.radius;
  const tubeRadius = 1.5;
  const height = config.height;
  const turns = 1.5;
  const spacing = 3; // = 2*tubeRadius: strands are tangent at closest approach, not overlapping
  const segments = Math.floor(particleCount / (2 * 20)); // Adjust segments based on particle count
  const tubeDensity = 20;

  const hash = (i) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  let particleIdx = 0;

  for (let helix = 0; helix < 2 && particleIdx < particleCount; helix++) {
    const helixOffset = helix * Math.PI;

    for (let seg = 0; seg < segments && particleIdx < particleCount; seg++) {
      const t = (seg / segments) * turns * Math.PI * 2;
      const y = (seg / segments - 0.5) * height;

      const cx = helixRadius * Math.cos(t + helixOffset) + (helix - 0.5) * spacing;
      const cz = helixRadius * Math.sin(t + helixOffset);

      for (let tube = 0; tube < tubeDensity && particleIdx < particleCount; tube++) {
        const theta = (tube / tubeDensity) * Math.PI * 2;
        const u = Math.cos(theta) * tubeRadius;
        const v = Math.sin(theta) * tubeRadius;

        const angle = t + helixOffset;
        const x = cx + u * Math.cos(angle) - v * Math.sin(angle);
        const z = cz + u * Math.sin(angle) + v * Math.cos(angle);

        positions[particleIdx * 3] = x;
        positions[particleIdx * 3 + 1] = y + (Math.random() - 0.5) * 0.2;
        positions[particleIdx * 3 + 2] = z;
        phis[particleIdx] = theta + angle;
        // New particle treatment: tiny dots, rare sparkles (threshold MUST
        // match generateColors in particle-morph.hbs).
        const h = hash(particleIdx);
        sizes[particleIdx] = h > 0.995 ? 1.6 + hash(particleIdx + 7) * 0.9 : 0.38 + h * 0.22;
        particleIdx++;
      }
    }
  }

  while (particleIdx < particleCount) {
    positions[particleIdx * 3] = 0;
    positions[particleIdx * 3 + 1] = 0;
    positions[particleIdx * 3 + 2] = 0;
    phis[particleIdx] = 0;
    sizes[particleIdx] = 0.4;
    particleIdx++;
  }

  return { positions, phis, sizes };
};

const ribbonGenerator = (particleCount, config) => {
  // DNA-CAPITAL-STYLE RIBBON LATTICE (rebuilt from the old random-sampled
  // double tube): an ORDERED grid of tiny particles woven into a single
  // wide, twisting ribbon — rows visible along its length, like a dot-
  // matrix sheet caught mid-twist. The ordered lattice (not random
  // scatter) is what makes the reference read as a luminous woven surface;
  // per-particle size variance below adds the occasional bright "sparkle"
  // dot (indices deterministically matched with the bright color accents
  // in particle-morph.hbs's generateColors — same index hash).
  const positions = new Float32Array(particleCount * 3);
  const phis = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);

  const R = config.radius;          // sweep radius of the centerline
  const height = config.height;     // vertical span
  const turns = 0.9;                // how far the centerline winds
  const ribbonW = 5.6;              // ribbon width (world units)
  // 0.9 (was 2.3): gentle twist keeps the sheet broadly face-on like the
  // reference — higher values repeatedly turn it edge-on, collapsing the
  // lattice into scalloped pinch lines instead of one woven surface.
  const twistTurns = 0.9;

  // Lattice dimensions from the particle budget, ~3.2:1 length:width density
  const cols = Math.max(24, Math.round(Math.sqrt(particleCount / 3.2)));
  const rows = Math.max(24, Math.floor(particleCount / cols));

  const hash = (i) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  let idx = 0;
  for (let r = 0; r < rows && idx < particleCount; r++) {
    const u = r / (rows - 1);
    const t = u * turns * Math.PI * 2;
    // Centerline: gentle helical sweep, tall
    const cx = R * Math.cos(t);
    const cy = (u - 0.5) * height;
    const cz = R * Math.sin(t);
    // Ribbon direction: rotates along the length (the twist). Built from a
    // vector that stays broadly screen-facing so the ribbon reads wide.
    const tw = u * twistTurns * Math.PI * 2;
    const dx = Math.cos(tw) * Math.cos(t + Math.PI / 2);
    const dy = Math.sin(tw) * 0.85;
    const dz = Math.cos(tw) * Math.sin(t + Math.PI / 2);

    for (let c = 0; c < cols && idx < particleCount; c++) {
      const v = (c / (cols - 1) - 0.5) * ribbonW;
      // Tiny jitter breaks moire without destroying the lattice read
      const j = (hash(idx * 3 + 1) - 0.5) * 0.05;
      positions[idx * 3]     = cx + dx * v + j;
      positions[idx * 3 + 1] = cy + dy * v + j;
      positions[idx * 3 + 2] = cz + dz * v + j;
      phis[idx] = tw + t;
      // Size variance: mostly tiny lattice dots; ~2% bright sparkles
      // (h > 0.98 — the SAME threshold/hash generateColors uses so the
      // big dots are also the bright-colored ones, like the reference).
      const h = hash(idx);
      // Sparkles at 0.5% (was 2%) — rarity is what makes them read as
      // sparkles; threshold MUST match generateColors in particle-morph.hbs.
      sizes[idx] = h > 0.995 ? 1.6 + hash(idx + 7) * 0.9 : 0.38 + h * 0.22;
      idx++;
    }
  }
  while (idx < particleCount) {
    positions[idx * 3] = 0; positions[idx * 3 + 1] = 0; positions[idx * 3 + 2] = 0;
    phis[idx] = 0; sizes[idx] = 0.4; idx++;
  }

  return { positions, phis, sizes };
};

const HELIX = new ShapeDefinition(
  'helix',
  helixGenerator,
  { radius: 3.5, height: 12 }
);

// The DNA-Capital-style woven sheet — its own state, not wired to any
// trigger yet; available anywhere via morphTo('ribbon').
const RIBBON = new ShapeDefinition(
  'ribbon',
  ribbonGenerator,
  { radius: 3.5, height: 12 }
);

// GLB Mesh Loader - loads 3D models and caches both geometry and sampler
let meshCache = {};
let samplerCache = {};

// Subdivide geometry to create more faces for better particle distribution
function subdivideGeometry(geometry, subdivisions = 2) {
  let currentGeometry = geometry;

  for (let s = 0; s < subdivisions; s++) {
    // Convert to non-indexed if needed
    if (currentGeometry.index) {
      currentGeometry = currentGeometry.toNonIndexed();
    }

    const posAttr = currentGeometry.attributes.position;
    const oldPositions = posAttr.array;
    const newPositions = new Float32Array(oldPositions.length * 4);

    let newIndex = 0;

    // Process each triangle (3 vertices at a time)
    for (let i = 0; i < oldPositions.length; i += 9) {
      // Original triangle vertices
      const ax = oldPositions[i],     ay = oldPositions[i + 1], az = oldPositions[i + 2];
      const bx = oldPositions[i + 3], by = oldPositions[i + 4], bz = oldPositions[i + 5];
      const cx = oldPositions[i + 6], cy = oldPositions[i + 7], cz = oldPositions[i + 8];

      // Midpoints of edges
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      const nx = (bx + cx) / 2, ny = (by + cy) / 2, nz = (bz + cz) / 2;
      const ox = (cx + ax) / 2, oy = (cy + ay) / 2, oz = (cz + az) / 2;

      // 4 sub-triangles
      // Corner triangle A
      newPositions[newIndex++] = ax; newPositions[newIndex++] = ay; newPositions[newIndex++] = az;
      newPositions[newIndex++] = mx; newPositions[newIndex++] = my; newPositions[newIndex++] = mz;
      newPositions[newIndex++] = ox; newPositions[newIndex++] = oy; newPositions[newIndex++] = oz;

      // Corner triangle B
      newPositions[newIndex++] = mx; newPositions[newIndex++] = my; newPositions[newIndex++] = mz;
      newPositions[newIndex++] = bx; newPositions[newIndex++] = by; newPositions[newIndex++] = bz;
      newPositions[newIndex++] = nx; newPositions[newIndex++] = ny; newPositions[newIndex++] = nz;

      // Corner triangle C
      newPositions[newIndex++] = ox; newPositions[newIndex++] = oy; newPositions[newIndex++] = oz;
      newPositions[newIndex++] = nx; newPositions[newIndex++] = ny; newPositions[newIndex++] = nz;
      newPositions[newIndex++] = cx; newPositions[newIndex++] = cy; newPositions[newIndex++] = cz;

      // Center triangle
      newPositions[newIndex++] = mx; newPositions[newIndex++] = my; newPositions[newIndex++] = mz;
      newPositions[newIndex++] = nx; newPositions[newIndex++] = ny; newPositions[newIndex++] = nz;
      newPositions[newIndex++] = ox; newPositions[newIndex++] = oy; newPositions[newIndex++] = oz;
    }

    // Create new geometry with subdivided positions
    const newGeometry = new window.THREE.BufferGeometry();
    newGeometry.setAttribute('position', new window.THREE.BufferAttribute(newPositions, 3));
    currentGeometry = newGeometry;
  }

  return currentGeometry;
}

function loadGLBMesh(filename) {
  if (meshCache[filename] && samplerCache[filename]) {
    return Promise.resolve({ positions: meshCache[filename], sampler: samplerCache[filename] });
  }

  return new Promise((resolve) => {
    const modelPath = `/content/images/${filename}`;
    console.log('[shape-definitions] Loading', filename, 'from:', modelPath);

    Promise.all([
      import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'),
      import('https://unpkg.com/three@0.160.0/examples/jsm/math/MeshSurfaceSampler.js'),
      import('https://unpkg.com/three@0.160.0/build/three.module.js')
    ])
      .then(([{ GLTFLoader }, { MeshSurfaceSampler }, THREE_Module]) => {
        const THREE = window.THREE || THREE_Module;
        const loader = new GLTFLoader();
        loader.load(
          modelPath,
          (gltf) => {
            let mesh = null;
            gltf.scene.traverse((node) => {
              if (node.isMesh) mesh = node;
            });

            if (mesh && mesh.geometry && mesh.geometry.attributes.position) {
              const rawPositions = mesh.geometry.attributes.position.array;
              const initialVertexCount = rawPositions.length / 3;

              // Calculate bounding box for centering and scaling
              let minX = Infinity, maxX = -Infinity;
              let minY = Infinity, maxY = -Infinity;
              let minZ = Infinity, maxZ = -Infinity;

              for (let i = 0; i < rawPositions.length; i += 3) {
                minX = Math.min(minX, rawPositions[i]);
                maxX = Math.max(maxX, rawPositions[i]);
                minY = Math.min(minY, rawPositions[i + 1]);
                maxY = Math.max(maxY, rawPositions[i + 1]);
                minZ = Math.min(minZ, rawPositions[i + 2]);
                maxZ = Math.max(maxZ, rawPositions[i + 2]);
              }

              // Calculate center and scale
              const centerX = (minX + maxX) / 2;
              const centerY = (minY + maxY) / 2;
              const centerZ = (minZ + maxZ) / 2;

              const sizeX = maxX - minX;
              const sizeY = maxY - minY;
              const sizeZ = maxZ - minZ;
              const maxSize = Math.max(sizeX, sizeY, sizeZ);
              const targetSize = 6;
              const scale = maxSize > 0 ? targetSize / maxSize : 1;

              // Subdivide geometry for better particle distribution if vertex count is low
              let samplerGeometry = mesh.geometry.clone();
              const subdivisionLevels = initialVertexCount < 1000 ? 3 : (initialVertexCount < 5000 ? 2 : 1);
              if (subdivisionLevels > 0) {
                samplerGeometry = subdivideGeometry(samplerGeometry, subdivisionLevels);
                console.log('[shape-definitions]', filename, 'subdivided:', initialVertexCount, '→',
                            samplerGeometry.attributes.position.array.length / 3, 'vertices');
              }

              // Apply centering and scaling to sampler geometry
              const samplerPos = samplerGeometry.attributes.position.array;
              for (let i = 0; i < samplerPos.length; i += 3) {
                samplerPos[i] = (samplerPos[i] - centerX) * scale;
                samplerPos[i + 1] = (samplerPos[i + 1] - centerY) * scale;
                samplerPos[i + 2] = (samplerPos[i + 2] - centerZ) * scale;
              }
              samplerGeometry.attributes.position.needsUpdate = true;

              // Apply scaling to original positions for fallback
              const positions = new Float32Array(rawPositions.length);
              for (let i = 0; i < rawPositions.length; i += 3) {
                positions[i] = (rawPositions[i] - centerX) * scale;
                positions[i + 1] = (rawPositions[i + 1] - centerY) * scale;
                positions[i + 2] = (rawPositions[i + 2] - centerZ) * scale;
              }

              // Create a temporary mesh for the sampler (needed by MeshSurfaceSampler)
              const tempMesh = new THREE.Mesh(samplerGeometry);

              // Initialize MeshSurfaceSampler for uniform face-based distribution
              const sampler = new MeshSurfaceSampler(tempMesh).build();

              meshCache[filename] = positions;
              samplerCache[filename] = { sampler, geometry: samplerGeometry };

              console.log('[shape-definitions] ✅', filename, 'ready with MeshSurfaceSampler:',
                          'scale:', scale.toFixed(2));
              resolve({ positions, sampler: samplerCache[filename] });
            } else {
              console.error('[shape-definitions] No geometry found in', filename);
              resolve(null);
            }
          },
          undefined,
          (error) => {
            console.error('[shape-definitions] Failed to load', filename, ':', error);
            resolve(null);
          }
        );
      })
      .catch((err) => {
        console.error('[shape-definitions] Failed to import loaders:', err);
        resolve(null);
      });
  });
}

// Create generators for each model - uses MeshSurfaceSampler for uniform surface distribution
function createGLBGenerator(filename) {
  return (particleCount, config) => {
    const positions = new Float32Array(particleCount * 3);

    // Three.js Vector3 for sampling
    const THREE = window.THREE;
    if (!THREE) {
      console.warn('[shape-definitions] THREE.js not available for', filename);
      // Fallback to vertex-based generation below
    }

    const tempPos = THREE ? new THREE.Vector3() : null;
    const tempNorm = THREE ? new THREE.Vector3() : null;

    // Check if sampler is available (MeshSurfaceSampler loaded)
    if (samplerCache[filename] && samplerCache[filename].sampler && tempPos && tempNorm) {
      const sampler = samplerCache[filename].sampler;

      // Sample uniformly across mesh surface using barycentric interpolation
      for (let i = 0; i < particleCount; i++) {
        sampler.sample(tempPos, tempNorm);

        // Add slight random offset perpendicular to surface for dust-like appearance
        const offsetDist = 0.08;
        const offsetX = (Math.random() - 0.5) * offsetDist;
        const offsetY = (Math.random() - 0.5) * offsetDist;
        const offsetZ = (Math.random() - 0.5) * offsetDist;

        positions[i * 3] = tempPos.x + offsetX;
        positions[i * 3 + 1] = tempPos.y + offsetY;
        positions[i * 3 + 2] = tempPos.z + offsetZ;
      }
      console.log('[shape-definitions] Generated particles for', filename, 'using MeshSurfaceSampler');
    } else if (meshCache[filename]) {
      // Fallback: distribute around vertices (for when sampler not available)
      const meshPositions = meshCache[filename];
      if (meshPositions && meshPositions.length > 0) {
        const vertexCount = meshPositions.length / 3;
        const particlesPerVertex = Math.max(1, Math.floor(particleCount / vertexCount));

        let particleIdx = 0;

        // Multi-layer shell around each vertex
        for (let v = 0; v < vertexCount && particleIdx < particleCount; v++) {
          const posIdx = v * 3;
          const baseX = meshPositions[posIdx];
          const baseY = meshPositions[posIdx + 1];
          const baseZ = meshPositions[posIdx + 2];

          for (let layer = 0; layer < particlesPerVertex && particleIdx < particleCount; layer++) {
            const seed = v * 73 + layer * 13;
            const shellThickness = 0.15;
            const normalizedLayer = layer / Math.max(1, particlesPerVertex - 1);

            const phi = (seed * 2.654) % (Math.PI * 2);
            const theta = (seed * 3.7) % (Math.PI * 2);

            const shellDist = shellThickness * normalizedLayer;
            const x = baseX + Math.sin(theta) * Math.cos(phi) * shellDist;
            const y = baseY + Math.sin(theta) * Math.sin(phi) * shellDist;
            const z = baseZ + Math.cos(theta) * shellDist;

            positions[particleIdx * 3] = x;
            positions[particleIdx * 3 + 1] = y;
            positions[particleIdx * 3 + 2] = z;
            particleIdx++;
          }
        }

        // Fill remaining with random distribution
        while (particleIdx < particleCount) {
          const v = Math.floor(Math.random() * vertexCount);
          const posIdx = v * 3;
          const baseX = meshPositions[posIdx];
          const baseY = meshPositions[posIdx + 1];
          const baseZ = meshPositions[posIdx + 2];
          const dist = 0.3;

          positions[particleIdx * 3] = baseX + (Math.random() - 0.5) * dist;
          positions[particleIdx * 3 + 1] = baseY + (Math.random() - 0.5) * dist;
          positions[particleIdx * 3 + 2] = baseZ + (Math.random() - 0.5) * dist;
          particleIdx++;
        }
      }
    } else {
      // Final fallback: random cloud
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 4;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      }
    }

    return positions;
  };
}

// Card objects - load from GLB files
const MOBILE = new ShapeDefinition(
  'mobile',
  createGLBGenerator('mobile.glb'),
  { radius: 2.0, height: 4 }
);

const NOTE = new ShapeDefinition(
  'note',
  createGLBGenerator('note.glb'),
  { radius: 2.0, height: 4 }
);

// Diamond - load from GLB file with mesh surface sampler
const DIAMOND = new ShapeDefinition(
  'diamond',
  createGLBGenerator('diamond.glb'),
  { radius: 2.0, height: 5 }
);

const GLOBE = new ShapeDefinition(
  'globe',
  createGLBGenerator('globe.glb'),
  { radius: 2.0, height: 4 }
);

const GAME = new ShapeDefinition(
  'game',
  createGLBGenerator('game.glb'),
  { radius: 2.0, height: 4 }
);

const CHART = new ShapeDefinition(
  'chart',
  createGLBGenerator('chart.glb'),
  { radius: 2.0, height: 4 }
);

const EMAIL = new ShapeDefinition(
  'email',
  createGLBGenerator('email.glb'),
  { radius: 2.0, height: 4 }
);

const CAMERA = new ShapeDefinition(
  'camera',
  createGLBGenerator('camera.glb'),
  { radius: 2.0, height: 4 }
);

const FOOTER = new ShapeDefinition(
  'footer',
  createGLBGenerator('sim.glb'),
  { radius: 2.0, height: 4 }
);

// DISPERSED - Random scattered
const dispersedGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
  }
  return positions;
};

// SPHERE - Single sphere
const sphereGenerator = (particleCount, config) => {
  console.log('[sphere-gen] generating', particleCount, 'particles');
  const positions = new Float32Array(particleCount * 3);
  const radius = config.radius || 3.5;

  for (let i = 0; i < particleCount; i++) {
    // Fibonacci sphere distribution
    const y = 1 - (i / (particleCount - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = Math.sqrt(particleCount * Math.PI) * i;

    const x = Math.cos(theta) * radiusAtY * radius;
    const z = Math.sin(theta) * radiusAtY * radius;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z;
  }

  console.log('[sphere-gen] generated', particleCount, 'particles');
  return positions;
};

const SPHERE = new ShapeDefinition(
  'sphere',
  sphereGenerator,
  { radius: 3.5 }
);

// LAB now reuses the sphere generator (not lab.glb) — the Lab section
// morph target is a continuously-deforming orb (see uOrbAmp/uOrbFreq/
// uOrbSpeed in particle-animation-loop.js's vertex shader), which needs a
// clean, closed, uniformly-radius'd point cloud so normalize(position) is a
// well-defined outward direction per particle. A GLB-sampled surface (the
// old lab.glb) has irregular local geometry that doesn't displace cleanly.
// Reusing sphereGenerator also means this state needs no async mesh load —
// see particle-morph-system.js's immediate-state list.
const LAB = new ShapeDefinition(
  'lab',
  sphereGenerator,
  { radius: 3.0 }
);

// TERRAIN - Flat, jittered ground plane (Profile section). Rest positions
// are a wide, near-flat scatter across X/Z (Y=0) — the counterpart to LAB's
// sphere: a clean, evenly-covered field so the continuous heightfield noise
// in particle-animation-loop.js (uTerrainAmp/Freq/Speed) has uniform ground
// to roll across, the same way LAB's sphere gives its orb noise a clean
// outward direction per particle. Jittered within grid cells (not a rigid
// grid) so the rest state itself doesn't read as an obvious lattice before
// any displacement is applied.
//
// Boundary is an irregular, organic closed curve (a handful of sine
// harmonics at different frequencies/phases summed over angle), not the
// grid's own rectangle — from directly above, a plain width×depth grid
// reads as an obvious square regardless of internal jitter. Particles
// falling outside that curve are pulled radially in to sit near it, so the
// overall silhouette reads as a coastline/blob instead of a hard rectangle,
// without changing the total particle count.
const terrainGenerator = (particleCount, config) => {
  console.log('[terrain-gen] generating', particleCount, 'particles');
  const positions = new Float32Array(particleCount * 3);
  const width = config.width;
  const depth = config.depth;
  const halfW = width / 2;
  const halfD = depth / 2;
  const cols = Math.max(1, Math.round(Math.sqrt(particleCount * (width / depth))));
  const rows = Math.max(1, Math.ceil(particleCount / cols));
  const cellW = width / cols;
  const cellD = depth / rows;

  const edgeFactor = (angle) => 1.0
    + 0.22 * Math.sin(angle * 2.3 + 0.6)
    + 0.15 * Math.sin(angle * 3.7 + 2.4)
    + 0.11 * Math.sin(angle * 5.1 + 4.1)
    + 0.07 * Math.sin(angle * 7.9 + 1.2);

  let idx = 0;
  for (let r = 0; r < rows && idx < particleCount; r++) {
    for (let c = 0; c < cols && idx < particleCount; c++) {
      const jitterX = (Math.random() - 0.5) * cellW * 0.8;
      const jitterZ = (Math.random() - 0.5) * cellD * 0.8;
      let x = -halfW + (c + 0.5) * cellW + jitterX;
      let z = -halfD + (r + 0.5) * cellD + jitterZ;

      const nx = x / halfW;
      const nz = z / halfD;
      const dist = Math.sqrt(nx * nx + nz * nz);
      if (dist > 0.0001) {
        const angle = Math.atan2(nz, nx);
        const threshold = edgeFactor(angle);
        if (dist > threshold) {
          const pull = threshold / dist;
          x *= pull;
          z *= pull;
        }
      }

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = z;
      idx++;
    }
  }

  console.log('[terrain-gen] generated', idx, 'particles');
  return positions;
};

// width ≈ depth (not the earlier 17×7, which read as an elongated
// rectangular strip from directly above) but not perfectly equal either —
// a perfect square base, even with the organic edge mask applied, comes
// out close to circular. Close-but-not-quite-equal keeps the silhouette
// irregular rather than a regular polygon/circle while no longer reading
// as a stretched-out rectangle.
const TERRAIN = new ShapeDefinition(
  'terrain',
  terrainGenerator,
  { width: 13, depth: 11 }
);

// GRID - Regular, unjittered interior lattice ("technical drawing paper")
// with the same organic boundary treatment as TERRAIN (see its own
// edgeFactor comment above) — a hard rectangle reads as an obvious square
// from directly above regardless of how even the interior is, so the
// silhouette is pulled toward an irregular closed curve the same way
// TERRAIN's is, while keeping (unlike TERRAIN) zero per-cell jitter, which
// is what preserves the "technical drawing paper" read close-up.
// Interactive displacement (mouse wave + click ripple) lives in
// particle-animation-loop.js's vertex shader.
//
// Previous version (plain rectangle, no organic boundary) kept below,
// unused, in case we want to revert:
// const gridGenerator_square = (particleCount, config) => {
//   const positions = new Float32Array(particleCount * 3);
//   const size = config.size;
//   const half = size / 2;
//   const cols = Math.max(1, Math.round(Math.sqrt(particleCount)));
//   const rows = Math.max(1, Math.ceil(particleCount / cols));
//   const cellSize = size / cols;
//   let idx = 0;
//   for (let r = 0; r < rows && idx < particleCount; r++) {
//     for (let c = 0; c < cols && idx < particleCount; c++) {
//       const x = -half + (c + 0.5) * cellSize;
//       const z = -half + (r + 0.5) * cellSize;
//       positions[idx * 3] = x;
//       positions[idx * 3 + 1] = 0;
//       positions[idx * 3 + 2] = z;
//       idx++;
//     }
//   }
//   return positions;
// };
const gridGenerator = (particleCount, config) => {
  console.log('[grid-gen] generating', particleCount, 'particles');
  const positions = new Float32Array(particleCount * 3);
  const size = config.size;
  const half = size / 2;
  const cols = Math.max(1, Math.round(Math.sqrt(particleCount)));
  const rows = Math.max(1, Math.ceil(particleCount / cols));
  const cellSize = size / cols;

  // Same organic edge mask as TERRAIN — a handful of sine harmonics summed
  // over angle, pulling particles outside the resulting closed curve
  // radially inward so the silhouette reads as a coastline/blob, not a
  // hard rectangle, from directly above.
  const edgeFactor = (angle) => 1.0
    + 0.22 * Math.sin(angle * 2.3 + 0.6)
    + 0.15 * Math.sin(angle * 3.7 + 2.4)
    + 0.11 * Math.sin(angle * 5.1 + 4.1)
    + 0.07 * Math.sin(angle * 7.9 + 1.2);

  let idx = 0;
  for (let r = 0; r < rows && idx < particleCount; r++) {
    for (let c = 0; c < cols && idx < particleCount; c++) {
      let x = -half + (c + 0.5) * cellSize;
      let z = -half + (r + 0.5) * cellSize;

      const nx = x / half;
      const nz = z / half;
      const dist = Math.sqrt(nx * nx + nz * nz);
      if (dist > 0.0001) {
        const angle = Math.atan2(nz, nx);
        const threshold = edgeFactor(angle);
        if (dist > threshold) {
          const pull = threshold / dist;
          x *= pull;
          z *= pull;
        }
      }

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = z;
      idx++;
    }
  }

  console.log('[grid-gen] generated', idx, 'particles');
  return positions;
};

const GRID = new ShapeDefinition(
  'grid',
  gridGenerator,
  { size: 16 }
);

// TRIPLE SPHERES - Three spheres arranged in space, rotating together
const tripleSphereGenerator = (particleCount, config) => {
  console.log('[triple-sphere-gen] generating', particleCount, 'particles');
  const positions = new Float32Array(particleCount * 3);
  const sphereRadius = 2.5;
  const spacing = 7; // Distance between sphere centers
  const particlesPerSphere = Math.floor(particleCount / 3);
  let particleIdx = 0;

  // Generate 3 spheres arranged in a triangle
  const sphereCenters = [
    [-spacing, 0, 0],    // Left
    [spacing, 0, 0],     // Right
    [0, spacing * 0.866, 0] // Top (equilateral triangle)
  ];

  for (let s = 0; s < 3 && particleIdx < particleCount; s++) {
    const [cx, cy, cz] = sphereCenters[s];
    const particlesInThisSphere = (s === 2) ? (particleCount - particleIdx) : particlesPerSphere;

    for (let i = 0; i < particlesInThisSphere && particleIdx < particleCount; i++) {
      // Fibonacci sphere distribution
      const y = 1 - (i / (particlesInThisSphere - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = Math.sqrt(particleCount * Math.PI) * (i % particlesInThisSphere);

      const x = Math.cos(theta) * radiusAtY * sphereRadius;
      const z = Math.sin(theta) * radiusAtY * sphereRadius;

      positions[particleIdx * 3] = x + cx;
      positions[particleIdx * 3 + 1] = y * sphereRadius + cy;
      positions[particleIdx * 3 + 2] = z + cz;
      particleIdx++;
    }
  }

  console.log('[triple-sphere-gen] generated', particleIdx, 'particles');
  return positions;
};

const TRIPLE_SPHERE = new ShapeDefinition(
  'triple-sphere',
  tripleSphereGenerator,
  { radius: 10 }
);

// TORUS (DONUT) - Ring shape
const torusGenerator = (particleCount, config) => {
  console.log('[torus-gen] generating', particleCount, 'particles');
  const positions = new Float32Array(particleCount * 3);
  const majorRadius = 4; // Distance from center to tube center
  const minorRadius = 1.5; // Tube radius
  const segments = Math.floor(Math.sqrt(particleCount)); // Divide into grid

  let particleIdx = 0;

  for (let i = 0; i < segments && particleIdx < particleCount; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let j = 0; j < segments && particleIdx < particleCount; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const x = (majorRadius + minorRadius * cosPhi) * cosTheta;
      const y = minorRadius * sinPhi;
      const z = (majorRadius + minorRadius * cosPhi) * sinTheta;

      positions[particleIdx * 3] = x;
      positions[particleIdx * 3 + 1] = y;
      positions[particleIdx * 3 + 2] = z;
      particleIdx++;
    }
  }

  // Fill remaining particles
  while (particleIdx < particleCount) {
    positions[particleIdx * 3] = 0;
    positions[particleIdx * 3 + 1] = 0;
    positions[particleIdx * 3 + 2] = 0;
    particleIdx++;
  }

  console.log('[torus-gen] generated', particleIdx, 'particles');
  return positions;
};

const TORUS = new ShapeDefinition(
  'torus',
  torusGenerator,
  { radius: 6 }
);

const DISPERSED = new ShapeDefinition(
  'dispersed',
  dispersedGenerator,
  { radius: 25 }
);

// Shape registry
class ShapeRegistry {
  constructor() {
    this.shapes = new Map();
  }

  register(shape) {
    this.shapes.set(shape.key, shape);
  }

  get(key) {
    return this.shapes.get(key);
  }

  generateState(key, particleCount) {
    const shape = this.get(key);
    if (!shape) throw new Error(`Shape not found: ${key}`);
    return shape.generate(particleCount);
  }
}


// VOLATILITY SURFACE — receding ground-plane lattice (hero shape when
// HERO_PARTICLE_MODE === 'volatility' in default.hbs; replaces the helix
// there, reversibly). Authored directly in this scene's camera space
// (camera at z=8, fov 75, level): plane at y≈-2.6 below the eyeline,
// rows receding from z=+4 (just in front of the camera) to z=-40.
// GEOMETRIC row depth — rows equally spaced in SCREEN space, not world
// space (a linearly-spaced flat lattice at a grazing angle compresses into
// a sparse far wedge — same lesson as the standalone prototype); partial
// width re-widening pow(dist/near, 0.7) keeps the lattice bleeding off
// both viewport edges at every depth without going wallpaper-flat.
// Relief used to be the volatility height-field (two sines + value noise)
// frozen at t=2.0 (a single static snapshot baked into the rest positions
// at generation time). Now flat (Y = planeY, no relief term) — the
// undulation instead lives in particle-animation-loop.js's vertex shader
// as a continuous, time-animated effect (uVolatilityAmp/Freq/Speed/Progress),
// the same "flat rest position + shader-driven heightfield" split TERRAIN
// uses for the Profile section (see that uniform's own comment). Fine-dot
// sizes keep the same hash/threshold sparkle treatment as HELIX so the
// colour accents in particle-morph.hbs land on the same indices.
const volatilityGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const cols = config.cols;
  const rows = Math.max(2, Math.ceil(particleCount / cols));
  const nearDist = config.nearDist, farDist = config.farDist;
  const ratio = farDist / nearDist;
  const camZ = 8, planeY = config.planeY, nearWidth = config.nearWidth;
  const hash01 = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  let idx = 0;
  for (let r = 0; r < rows && idx < particleCount; r++) {
    const rowN = rows > 1 ? r / (rows - 1) : 0;
    const dist = nearDist * Math.pow(ratio, rowN);
    const widen = Math.pow(dist / nearDist, 0.7);
    for (let c = 0; c < cols && idx < particleCount; c++) {
      const colN = c / (cols - 1);
      positions[idx * 3]     = (colN - 0.5) * nearWidth * widen;
      positions[idx * 3 + 1] = planeY;
      positions[idx * 3 + 2] = camZ - dist;
      const h = hash01(idx);
      sizes[idx] = h > 0.995 ? 1.6 + h * 0.9 : 0.38 + h * 0.22;
      idx++;
    }
  }
  return { positions, sizes };
};

const VOLATILITY = new ShapeDefinition(
  'volatility',
  volatilityGenerator,
  { cols: 140, nearDist: 4, farDist: 48, planeY: -2.6, nearWidth: 12, reliefScale: 0.4 }
);

// Export for browser
if (typeof window !== 'undefined') {
  window.ShapeDefinition = ShapeDefinition;
  window.ShapeRegistry = ShapeRegistry;
  window.SPHERE = SPHERE;
  window.HELIX = HELIX;
  window.TRIPLE_SPHERE = TRIPLE_SPHERE;
  window.TORUS = TORUS;
  window.MOBILE = MOBILE;
  window.NOTE = NOTE;
  window.DIAMOND = DIAMOND;
  window.GLOBE = GLOBE;
  window.GAME = GAME;
  window.CHART = CHART;
  window.EMAIL = EMAIL;
  window.CAMERA = CAMERA;
  window.FOOTER = FOOTER;
  window.LAB = LAB;
  window.TERRAIN = TERRAIN;
  window.GRID = GRID;
  window.DISPERSED = DISPERSED;
  window.RIBBON = RIBBON;
  window.VOLATILITY = VOLATILITY;
  window.loadGLBMesh = loadGLBMesh;
}
