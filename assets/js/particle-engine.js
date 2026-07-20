class ParticleEngine {
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      particleCount: 6000,
      particleSize: 0.025,
      color: 0x71FFFF,
      animationDuration: 1000,
      ...config
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.particlePositions = null;
    this.targetPositions = null;
    this.shapes = new Map();
    this.isMorphing = false;
    this.morphProgress = 0;
    this.currentShapeKey = null;
    this.isDisperged = false;

    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(0x050a0f, 1);
    this.container.appendChild(this.renderer.domElement);

    this.camera.position.z = 3;

    // Lighting
    const ambientLight = new THREE.AmbientLight(this.config.color, 1);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(this.config.color, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);

    // Create initial particle sphere
    this.createSphereParticles();

    // Register default shapes
    this.registerShape('sphere', () => this.createSphereGeometry());

    // Handle resize
    if (window.resizeManager) window.resizeManager.subscribe('particle-engine', () => this.onWindowResize());
    else window.addEventListener('resize', () => this.onWindowResize());

    // Start animation loop
    this.animate();

    console.log('[ParticleEngine] ✅ Initialized');
  }

  createSphereParticles() {
    if (this.particles) this.scene.remove(this.particles);

    const baseGeometry = new THREE.OctahedronGeometry(1.5, 4);
    const basePositions = baseGeometry.attributes.position.array;

    const particleCount = this.config.particleCount;
    const particleGeometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const triangleIndex = Math.floor(Math.random() * (basePositions.length / 9));
      const v1Index = triangleIndex * 9;
      const v2Index = triangleIndex * 9 + 3;
      const v3Index = triangleIndex * 9 + 6;

      const r1 = Math.random();
      const r2 = Math.random();
      const w1 = 1 - Math.sqrt(r1);
      const w2 = Math.sqrt(r1) * (1 - r2);
      const w3 = Math.sqrt(r1) * r2;

      this.particlePositions[i * 3] =
        basePositions[v1Index] * w1 + basePositions[v2Index] * w2 + basePositions[v3Index] * w3 +
        (Math.random() - 0.5) * 0.1;
      this.particlePositions[i * 3 + 1] =
        basePositions[v1Index + 1] * w1 + basePositions[v2Index + 1] * w2 + basePositions[v3Index + 1] * w3 +
        (Math.random() - 0.5) * 0.1;
      this.particlePositions[i * 3 + 2] =
        basePositions[v1Index + 2] * w1 + basePositions[v2Index + 2] * w2 + basePositions[v3Index + 2] * w3 +
        (Math.random() - 0.5) * 0.1;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const material = new THREE.PointsMaterial({
      color: this.config.color,
      size: this.config.particleSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.1
    });

    this.particles = new THREE.Points(particleGeometry, material);
    this.scene.add(this.particles);
  }

  registerShape(key, geometryFn) {
    this.shapes.set(key, geometryFn);
  }

  loadGLTFShape(key, url) {
    import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
          let mesh = null;
          gltf.scene.traverse((node) => {
            if (node.geometry && !mesh) mesh = node;
          });

          if (mesh && mesh.geometry) {
            this.registerShape(key, () => mesh.geometry.clone());
            console.log(`[ParticleEngine] Registered shape: ${key}`);
          }
        });
      });
  }

  createSphereGeometry() {
    return new THREE.OctahedronGeometry(1.5, 4);
  }

  morphToShape(shapeKey) {
    if (!this.shapes.has(shapeKey)) {
      console.warn(`[ParticleEngine] Shape not found: ${shapeKey}`);
      return;
    }

    if (this.isMorphing) return;

    console.log(`[ParticleEngine] Morphing to: ${shapeKey}`);
    this.currentShapeKey = shapeKey;
    this.isMorphing = true;
    this.morphProgress = 0;

    const geometry = this.shapes.get(shapeKey)();
    const positions = geometry.attributes.position.array;

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity,
        minY = Infinity, maxY = -Infinity,
        minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);
    const scale = 2.5 / maxSize;

    const vertexCount = positions.length / 3;
    this.targetPositions = new Float32Array(this.config.particleCount * 3);

    // Calculate centroid for interior sampling
    let centerX = 0, centerY = 0, centerZ = 0;
    for (let i = 0; i < positions.length; i += 3) {
      centerX += positions[i];
      centerY += positions[i + 1];
      centerZ += positions[i + 2];
    }
    centerX = centerX / vertexCount * scale;
    centerY = centerY / vertexCount * scale;
    centerZ = centerZ / vertexCount * scale;

    // Recalculate bounding box with scaled positions
    minX = Infinity; maxX = -Infinity;
    minY = Infinity; maxY = -Infinity;
    minZ = Infinity; maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i] * scale);
      maxX = Math.max(maxX, positions[i] * scale);
      minY = Math.min(minY, positions[i + 1] * scale);
      maxY = Math.max(maxY, positions[i + 1] * scale);
      minZ = Math.min(minZ, positions[i + 2] * scale);
      maxZ = Math.max(maxZ, positions[i + 2] * scale);
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;

    for (let i = 0; i < this.config.particleCount; i++) {
      let px, py, pz;
      const rand = Math.random();

      if (rand < 0.4) {
        // 40% surface vertices
        const idx = Math.floor(Math.random() * vertexCount) * 3;
        px = positions[idx] * scale;
        py = positions[idx + 1] * scale;
        pz = positions[idx + 2] * scale;
      } else if (rand < 0.7) {
        // 30% interpolated between surface and center
        const idx = Math.floor(Math.random() * vertexCount) * 3;
        const blend = Math.random() * 0.5;
        px = positions[idx] * scale * (1 - blend) + centerX * blend;
        py = positions[idx + 1] * scale * (1 - blend) + centerY * blend;
        pz = positions[idx + 2] * scale * (1 - blend) + centerZ * blend;
      } else {
        // 30% random fill in bounding box
        px = minX + Math.random() * rangeX;
        py = minY + Math.random() * rangeY;
        pz = minZ + Math.random() * rangeZ;
      }

      this.targetPositions[i * 3] = px + (Math.random() - 0.5) * 0.08;
      this.targetPositions[i * 3 + 1] = py + (Math.random() - 0.5) * 0.08;
      this.targetPositions[i * 3 + 2] = pz + (Math.random() - 0.5) * 0.08;
    }

    this.morphParticles();
  }

  morphParticles() {
    const startPositions = new Float32Array(this.particlePositions);
    const duration = this.config.animationDuration;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      this.morphProgress = Math.min(elapsed / duration, 1);

      const posAttr = this.particles.geometry.attributes.position;
      for (let i = 0; i < this.config.particleCount; i++) {
        posAttr.array[i * 3] = startPositions[i * 3] +
          (this.targetPositions[i * 3] - startPositions[i * 3]) * this.morphProgress;
        posAttr.array[i * 3 + 1] = startPositions[i * 3 + 1] +
          (this.targetPositions[i * 3 + 1] - startPositions[i * 3 + 1]) * this.morphProgress;
        posAttr.array[i * 3 + 2] = startPositions[i * 3 + 2] +
          (this.targetPositions[i * 3 + 2] - startPositions[i * 3 + 2]) * this.morphProgress;
      }
      posAttr.needsUpdate = true;

      if (this.morphProgress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isMorphing = false;
        this.particlePositions.set(this.targetPositions);
      }
    };
    animate();
  }

  disperse(intensity = 1) {
    console.log(`[ParticleEngine] Dispersing with intensity: ${intensity}`);
    this.isDisperged = true;

    const posAttr = this.particles.geometry.attributes.position;
    for (let i = 0; i < this.config.particleCount; i++) {
      posAttr.array[i * 3] += (Math.random() - 0.5) * 2 * intensity;
      posAttr.array[i * 3 + 1] += (Math.random() - 0.5) * 2 * intensity;
      posAttr.array[i * 3 + 2] += (Math.random() - 0.5) * 2 * intensity;
    }
    posAttr.needsUpdate = true;
  }

  resetToSphere() {
    this.morphToShape('sphere');
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.particles && this.morphProgress < 1) {
      this.particles.rotation.y += 0.01;
      this.particles.rotation.x = Math.sin(Date.now() * 0.0005) * 0.3;
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}

window.ParticleEngine = ParticleEngine;
