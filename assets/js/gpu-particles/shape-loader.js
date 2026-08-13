/**
 * Shape Loader
 * Load GLB files and generate math shapes for GPU particles
 */

class ShapeLoader {
  constructor(device) {
    this.device = device;
    this.shapes = {}; // Cache loaded shapes
    this.shapeRegistry = null; // Reference to existing shape-definitions.js
  }

  /**
   * Connect to existing shape registry (shape-definitions.js)
   */
  async connectRegistry(registry) {
    if (!registry) {
      console.warn('[ShapeLoader] No shape registry provided, math shapes unavailable');
      return;
    }
    this.shapeRegistry = registry;
  }

  /**
   * Load GLB file from /content/images/ directory (where Ghost stores images/models)
   */
  async loadGLB(filename, particleCount = null) {
    const url = `/content/images/${filename}.glb`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      let geometry = this._parseGLB(arrayBuffer);

      // GLB files come in arbitrary units — recenter and scale to match the
      // procedural shapes' world (~1.4 radius inside the ±2 ortho view)
      this._normalizeGeometry(geometry.positions, 1.4);

      // Distribute particles uniformly over the mesh surface instead of
      // placing them on vertices (low-poly meshes read as sparse noise)
      if (particleCount && geometry.isTriangles) {
        const sampled = this._sampleMeshSurface(geometry.positions, geometry.indices, particleCount);
        if (sampled) {
          geometry = { positions: sampled, normals: null, count: particleCount };
        }
      }

      console.log(`[ShapeLoader] Loaded GLB: ${filename} (${geometry.count} particles)`);
      return geometry;
    } catch (error) {
      console.error(`[ShapeLoader] Failed to load GLB ${filename}:`, error);
      return null;
    }
  }

  /**
   * Recenter positions on the origin and uniformly scale so the largest
   * half-extent equals targetRadius. Mutates the array in place.
   * @private
   */
  _normalizeGeometry(positions, targetRadius) {
    if (!positions || positions.length < 3) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);     maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    const scale = halfExtent > 0 ? targetRadius / halfExtent : 1;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i]     = (positions[i]     - cx) * scale;
      positions[i + 1] = (positions[i + 1] - cy) * scale;
      positions[i + 2] = (positions[i + 2] - cz) * scale;
    }
  }

  /**
   * Parse GLB binary format
   * Simple parser for position data (assumes single mesh with positions)
   */
  _parseGLB(arrayBuffer) {
    const view = new DataView(arrayBuffer);

    // GLB header: magic(4) version(4) length(4)
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546C67) { // 'glTF'
      throw new Error('Invalid GLB file');
    }

    const version = view.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`GLB version ${version} not supported`);
    }

    // First chunk: JSON (contains asset structure)
    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    if (jsonChunkType !== 0x4E4F534A) { // 'JSON'
      throw new Error('Expected JSON chunk');
    }

    const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
    const jsonText = new TextDecoder().decode(jsonBytes);
    const json = JSON.parse(jsonText);

    // Second chunk: BIN (binary data)
    const binOffset = 20 + jsonChunkLength + 8;
    const binChunkLength = view.getUint32(20 + jsonChunkLength, true);
    const binData = new Uint8Array(arrayBuffer, binOffset, binChunkLength);

    // Extract positions from first mesh
    const mesh = json.meshes?.[0];
    if (!mesh) throw new Error('No mesh found in GLB');

    const primitive = mesh.primitives?.[0];
    if (!primitive) throw new Error('No primitive found in mesh');

    const positionAccessorIdx = primitive.attributes?.POSITION;
    if (positionAccessorIdx === undefined) throw new Error('No POSITION attribute');

    const posAccessor = json.accessors[positionAccessorIdx];
    const posBufferView = json.bufferViews[posAccessor.bufferView];

    const offset = (posAccessor.byteOffset || 0) + (posBufferView.byteOffset || 0);
    const count = posAccessor.count;
    const componentType = posAccessor.componentType; // 5126 = FLOAT

    if (componentType !== 5126) {
      throw new Error('Only FLOAT positions supported');
    }

    // Extract positions as Float32Array
    const positions = new Float32Array(binData.buffer, binOffset + offset, count * 3);

    // Optional: Extract normals
    let normals = null;
    const normalAccessorIdx = primitive.attributes?.NORMAL;
    if (normalAccessorIdx !== undefined) {
      const normAccessor = json.accessors[normalAccessorIdx];
      const normBufferView = json.bufferViews[normAccessor.bufferView];
      const normOffset = (normAccessor.byteOffset || 0) + (normBufferView.byteOffset || 0);
      normals = new Float32Array(binData.buffer, binOffset + normOffset, normAccessor.count * 3);
    }

    // Optional: Extract triangle indices (needed for surface sampling)
    let indices = null;
    if (primitive.indices !== undefined) {
      const idxAccessor = json.accessors[primitive.indices];
      const idxBufferView = json.bufferViews[idxAccessor.bufferView];
      const idxOffset = binOffset + (idxAccessor.byteOffset || 0) + (idxBufferView.byteOffset || 0);
      // 5121 = Uint8, 5123 = Uint16, 5125 = Uint32
      if (idxAccessor.componentType === 5123) {
        indices = new Uint16Array(binData.buffer, idxOffset, idxAccessor.count);
      } else if (idxAccessor.componentType === 5125) {
        indices = new Uint32Array(binData.buffer, idxOffset, idxAccessor.count);
      } else if (idxAccessor.componentType === 5121) {
        indices = new Uint8Array(binData.buffer, idxOffset, idxAccessor.count);
      }
      if (indices) indices = indices.slice(); // Copy to avoid buffer reuse issues
    }

    // primitive.mode 4 = TRIANGLES (default when omitted)
    const isTriangles = primitive.mode === undefined || primitive.mode === 4;

    return {
      positions: new Float32Array(positions), // Copy to avoid buffer reuse issues
      normals: normals ? new Float32Array(normals) : null,
      indices,
      isTriangles,
      count
    };
  }

  /**
   * Sample points uniformly across a triangle mesh surface (area-weighted).
   * Without this, particles cluster on mesh vertices — a low-poly diamond
   * has only dozens of vertices, so vertex placement reads as sparse noise.
   * @private
   * @returns {Float32Array|null} sampleCount × 3 positions, or null if no triangles
   */
  _sampleMeshSurface(positions, indices, sampleCount) {
    const triCount = indices
      ? Math.floor(indices.length / 3)
      : Math.floor(positions.length / 9);
    if (triCount === 0) return null;

    const vertexAt = (i, out) => {
      const vi = (indices ? indices[i] : i) * 3;
      out[0] = positions[vi];
      out[1] = positions[vi + 1];
      out[2] = positions[vi + 2];
    };

    // Cumulative triangle areas → area-weighted triangle selection
    const cumAreas = new Float64Array(triCount);
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    let totalArea = 0;
    for (let t = 0; t < triCount; t++) {
      vertexAt(t * 3, a);
      vertexAt(t * 3 + 1, b);
      vertexAt(t * 3 + 2, c);
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      totalArea += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      cumAreas[t] = totalArea;
    }
    if (totalArea === 0) return null;

    const out = new Float32Array(sampleCount * 3);
    for (let s = 0; s < sampleCount; s++) {
      // Binary search for the triangle containing this cumulative-area point
      const r = Math.random() * totalArea;
      let lo = 0, hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumAreas[mid] < r) lo = mid + 1; else hi = mid;
      }

      vertexAt(lo * 3, a);
      vertexAt(lo * 3 + 1, b);
      vertexAt(lo * 3 + 2, c);

      // Uniform barycentric point: P = (1−√r1)·A + √r1(1−r2)·B + √r1·r2·C
      const sqrtR1 = Math.sqrt(Math.random());
      const r2 = Math.random();
      const wa = 1 - sqrtR1;
      const wb = sqrtR1 * (1 - r2);
      const wc = sqrtR1 * r2;

      out[s * 3 + 0] = wa * a[0] + wb * b[0] + wc * c[0];
      out[s * 3 + 1] = wa * a[1] + wb * b[1] + wc * c[1];
      out[s * 3 + 2] = wa * a[2] + wb * b[2] + wc * c[2];
    }
    return out;
  }

  /**
   * Generate math shape using existing shape registry
   */
  generateMathShape(shapeName, particleCount) {
    if (!this.shapeRegistry) {
      console.warn('[ShapeLoader] Shape registry not connected, cannot generate math shapes');
      return null;
    }

    try {
      // Call registry's shape generator
      const state = this.shapeRegistry.generateState(shapeName, particleCount);
      if (!state || !state.positions) {
        throw new Error(`Shape registry returned invalid state for ${shapeName}`);
      }

      console.log(`[ShapeLoader] Generated math shape: ${shapeName} (${state.positions.length / 3} particles)`);
      return {
        positions: new Float32Array(state.positions),
        normals: null,
        count: particleCount,
        metadata: state
      };
    } catch (error) {
      console.error(`[ShapeLoader] Failed to generate shape ${shapeName}:`, error);
      return null;
    }
  }

  /**
   * Load a shape by name (GLB or math)
   * Determines type automatically based on shape name
   */
  async loadShape(shapeName, particleCount) {
    console.log(`[ShapeLoader] Loading shape: ${shapeName}`);

    // Clear helix cache to force regeneration with new parameters
    if (shapeName === 'helix' && this.shapes['helix']) {
      console.log(`[ShapeLoader] Clearing helix cache to regenerate with new parameters`);
      delete this.shapes['helix'];
    }

    // Check cache first
    if (this.shapes[shapeName]) {
      console.log(`[ShapeLoader] Using cached shape: ${shapeName}`);
      return this.shapes[shapeName];
    }

    let geometry = null;

    // Known procedural shapes (always use procedural)
    const proceduralShapes = ['sphere', 'torus', 'cube', 'pyramid', 'dispersed', 'vortex'];
    const mathShapes = ['helix', 'mobile']; // Shapes to try registry first

    // Known GLB shapes
    const glbShapes = ['diamond', 'globe', 'game', 'chart', 'email', 'camera', 'clapper', 'note', 'mobile', 'sim', 'lab'];

    // Handle special procedural shapes (bypass registry)
    if (shapeName === 'helix') {
      geometry = this._generateProceduralHelix(particleCount);
    } else if (shapeName === 'vortex') {
      geometry = this._generateProceduralVortex(particleCount);
    } else if (shapeName === 'dispersed') {
      geometry = this._generateProceduralDispersed(particleCount);
    } else if (shapeName === 'torus') {
      geometry = this._generateProceduralTorus(particleCount);
    } else if (shapeName === 'cube') {
      geometry = this._generateProceduralCube(particleCount);
    } else if (shapeName === 'sphere') {
      geometry = this._generateProceduralSphere(particleCount);
    }
    // Try strategies based on shape type:
    else if (proceduralShapes.includes(shapeName)) {
      // Use procedural generator for known math shapes
      geometry = this.generateMathShape(shapeName, particleCount);
      if (!geometry) {
        console.warn(`[ShapeLoader] Registry failed for ${shapeName}, using procedural fallback`);
        geometry = this._generateProceduralSphere(particleCount);
      }
    } else if (glbShapes.includes(shapeName)) {
      // Load from GLB for known files
      geometry = await this.loadGLB(shapeName, particleCount);
      if (!geometry) {
        console.warn(`[ShapeLoader] GLB load failed for ${shapeName}, using procedural sphere`);
        geometry = this._generateProceduralSphere(particleCount);
      }
    } else {
      // Unknown shape: try registry, then GLB, then procedural
      geometry = this.generateMathShape(shapeName, particleCount);
      if (!geometry) {
        geometry = await this.loadGLB(shapeName, particleCount);
      }
      if (!geometry) {
        console.warn(`[ShapeLoader] Shape not found: ${shapeName}, using procedural sphere`);
        geometry = this._generateProceduralSphere(particleCount);
      }
    }

    // Cache
    this.shapes[shapeName] = geometry;
    return geometry;
  }

  /**
   * Generate a procedural helix (double intertwined tubes)
   * High-density version for impressive visual detail
   * @private
   */
  _generateProceduralHelix(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    // Old-system proportions (radius 3.5, tube 1.5, height 12) × 0.28, so
    // the full shape fits the ortho view: y extent ±(1.68+0.42) = ±2.1
    const helixRadius = 0.98;
    const tubeRadius = 0.42;
    const height = 3.36;
    const turns = 1.5;
    const spacing = 0;            // Classic DNA: both tubes centered, π-offset for phase

    // Match original particle distribution (must match particleCount exactly)
    const segments = Math.floor(particleCount / (2 * 20));  // Original: /20
    const tubeDensity = 20;  // Original: 20 (2 × segments × 20 = particleCount)

    let particleIdx = 0;

    // Two intertwined helixes (exact copy of original algorithm)
    for (let helix = 0; helix < 2 && particleIdx < particleCount; helix++) {
      const helixOffset = helix * Math.PI;

      for (let seg = 0; seg < segments && particleIdx < particleCount; seg++) {
        const t = (seg / segments) * turns * Math.PI * 2;
        const y = (seg / segments - 0.5) * height;

        const cx = helixRadius * Math.cos(t + helixOffset) + (helix - 0.5) * spacing;
        const cz = helixRadius * Math.sin(t + helixOffset);

        for (let tube = 0; tube < tubeDensity && particleIdx < particleCount; tube++) {
          const theta = (tube / tubeDensity) * Math.PI * 2;

          // Ring perpendicular to spiral path: radial (N) + vertical (binormal approximation)
          const angle = t + helixOffset;
          const x = cx + Math.cos(theta) * tubeRadius * Math.cos(angle);
          const z = cz + Math.cos(theta) * tubeRadius * Math.sin(angle);
          const ry = y + Math.sin(theta) * tubeRadius;  // ring's vertical component

          positions[particleIdx * 3 + 0] = x;
          positions[particleIdx * 3 + 1] = ry;
          positions[particleIdx * 3 + 2] = z;
          particleIdx++;
        }
      }
    }

    // Fill remaining
    while (particleIdx < particleCount) {
      positions[particleIdx * 3] = 0;
      positions[particleIdx * 3 + 1] = 0;
      positions[particleIdx * 3 + 2] = 0;
      particleIdx++;
    }

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * Generate a procedural sphere (fallback if registry unavailable)
   * Scaled to fit viewport with monumental feel
   * @private
   */
  _generateProceduralSphere(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    // Fibonacci sphere: distribute points evenly on sphere surface
    // Scale factor: 0.35× to fit viewport while maintaining visual presence
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;
    const sphereRadius = 1.2;  // 3.5 × 0.35 ≈ 1.2

    for (let i = 0; i < particleCount; i++) {
      const y = 1 - (i / (particleCount - 1)) * 2; // -1 to 1
      const radius = Math.sqrt(1 - y * y);
      const angle = angleIncrement * i;

      positions[i * 3 + 0] = Math.cos(angle) * radius * sphereRadius;
      positions[i * 3 + 1] = y * sphereRadius;
      positions[i * 3 + 2] = Math.sin(angle) * radius * sphereRadius;
    }

    console.log(`[ShapeLoader] Generated procedural sphere (${particleCount} vertices, radius ${sphereRadius})`);

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * Generate a procedural spiral vortex (tornado/funnel shape)
   * Scaled to fit viewport (0.35× original)
   * @private
   */
  _generateProceduralVortex(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    const maxRadius = 1.2;        // 3.5 × 0.35 ≈ 1.2
    const height = 4.2;           // 12 × 0.35 ≈ 4.2
    const spiralTurns = 4;        // Number of complete spiral rotations
    const taper = 0.6;            // How quickly radius tapers (0-1, higher = sharper point)

    for (let i = 0; i < particleCount; i++) {
      // Normalized position along spiral (0 to 1)
      const t = i / particleCount;

      // Height: spread particles from -height/2 to height/2
      const y = (t - 0.5) * height;

      // Radius decreases as we go up and down (funnel/vortex shape)
      // Wider at middle (t=0.5), narrower at top/bottom (t=0 or t=1)
      const distFromCenter = Math.abs(t - 0.5) * 2; // 0 at center, 1 at ends
      const radius = maxRadius * Math.pow(1 - distFromCenter, taper);

      // Spiral rotation: more turns = tighter spiral
      const theta = t * spiralTurns * Math.PI * 2;

      // No jitter — crisp lattice structure like old system
      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    console.log(`[ShapeLoader] Generated procedural vortex (${particleCount} particles, scaled fit)`);

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * Generate dispersed (random cloud) shape - hero starting state
   * Scaled to fit viewport (0.35× original)
   * @private
   */
  _generateProceduralDispersed(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    // Uniform distribution inside a sphere large enough to extend past every
    // screen edge (x view is ±2·aspect ≈ ±3.6 widescreen), so the viewer sits
    // inside the cloud rather than observing it. A sphere (unlike a cube)
    // keeps its extent constant while rotating; the renderer's z clip window
    // (±5) comfortably contains it, so nothing pops mid-screen.
    const radius = 4.0;

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;          // azimuth
      const phi = Math.acos(2 * Math.random() - 1);       // polar (uniform on sphere)
      const r = radius * Math.cbrt(Math.random());        // uniform in volume

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }

    console.log(`[ShapeLoader] Generated procedural dispersed (${particleCount} particles, scaled fit)`);

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * Generate torus (donut shape)
   * Scaled to fit viewport (0.35× original)
   * @private
   */
  _generateProceduralTorus(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    // Torus parameters scaled to fit viewport
    const majorRadius = 1.2;   // 3.5 × 0.35
    const minorRadius = 0.525; // 1.5 × 0.35
    const segments = Math.ceil(Math.sqrt(particleCount));

    let particleIdx = 0;

    for (let i = 0; i < segments && particleIdx < particleCount; i++) {
      const u = (i / segments) * Math.PI * 2;

      for (let j = 0; j < segments && particleIdx < particleCount; j++) {
        const v = (j / segments) * Math.PI * 2;

        const x = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
        const y = minorRadius * Math.sin(v);
        const z = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);

        positions[particleIdx * 3 + 0] = x;
        positions[particleIdx * 3 + 1] = y;
        positions[particleIdx * 3 + 2] = z;
        particleIdx++;
      }
    }

    // Fill remaining
    while (particleIdx < particleCount) {
      positions[particleIdx * 3] = 0;
      positions[particleIdx * 3 + 1] = 0;
      positions[particleIdx * 3 + 2] = 0;
      particleIdx++;
    }

    console.log(`[ShapeLoader] Generated procedural torus (${particleCount} particles, scaled fit)`);

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * Generate cube (box shape)
   * Particles distributed on cube surface and interior
   * @private
   */
  _generateProceduralCube(particleCount) {
    const positions = new Float32Array(particleCount * 3);

    // Cube parameters
    const size = 1.5;  // Total cube size (-0.75 to 0.75 on each axis)
    const half = size / 2;

    // Distribute particles in a grid-like pattern within the cube
    const pointsPerSide = Math.ceil(Math.cbrt(particleCount));
    let particleIdx = 0;

    for (let x = 0; x < pointsPerSide && particleIdx < particleCount; x++) {
      for (let y = 0; y < pointsPerSide && particleIdx < particleCount; y++) {
        for (let z = 0; z < pointsPerSide && particleIdx < particleCount; z++) {
          const px = (x / (pointsPerSide - 1)) * size - half;
          const py = (y / (pointsPerSide - 1)) * size - half;
          const pz = (z / (pointsPerSide - 1)) * size - half;

          positions[particleIdx * 3 + 0] = px;
          positions[particleIdx * 3 + 1] = py;
          positions[particleIdx * 3 + 2] = pz;
          particleIdx++;
        }
      }
    }

    // Fill remaining
    while (particleIdx < particleCount) {
      positions[particleIdx * 3] = 0;
      positions[particleIdx * 3 + 1] = 0;
      positions[particleIdx * 3 + 2] = 0;
      particleIdx++;
    }

    console.log(`[ShapeLoader] Generated procedural cube (${particleCount} particles, grid fill)`);

    return {
      positions,
      normals: null,
      count: particleCount
    };
  }

  /**
   * List available shapes
   */
  listAvailableShapes() {
    const glbShapes = ['diamond', 'globe', 'game', 'chart', 'email', 'camera', 'clapper', 'note', 'mobile', 'sim'];
    const mathShapes = this.shapeRegistry ? Object.keys(this.shapeRegistry.SHAPE_MODES || {}) : [];

    return [...new Set([...glbShapes, ...mathShapes])];
  }

  /**
   * Clear cache (for memory management)
   */
  clearCache() {
    this.shapes = {};
    console.log('[ShapeLoader] Cache cleared');
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ShapeLoader = ShapeLoader;
}
