/**
 * Dispersed Variants - Alt versions with density, clustering, and size variation
 * Original dispersed is too calm and uniform → these add complexity/chaos
 */

// console.log('[dispersed-variants] Loading alt dispersed generators');

class DispersedVariant {
  constructor(key, generator, config = {}) {
    this.key = key;
    this.generator = generator;
    this.config = {
      particleCount: 6000,
      clusterCount: 8,
      animated: false,  // Enable pulsing animation
      pulseSpeed: 1.0,  // Speed of pulsing (1.0 = normal)
      pulseAmount: 0.3, // Amount of movement (0.3 = 30% of cluster radius)
      ...config
    };
  }

  generate(particleCount) {
    return this.generator(particleCount, this.config);
  }
}

/**
 * DISPERSED_DENSE - 3x particle density, uniform scattered
 * No clustering, just more particles = more visual complexity
 * Sizes: 60% small dots, 40% larger blobs
 */
const dispersedDenseGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const bounds = 50;

  for (let i = 0; i < particleCount; i++) {
    // Position: uniform random in 50×50×50 cube
    positions[i * 3] = (Math.random() - 0.5) * bounds;
    positions[i * 3 + 1] = (Math.random() - 0.5) * bounds;
    positions[i * 3 + 2] = (Math.random() - 0.5) * bounds;

    // Size: bimodal distribution (small dots + large blobs)
    const sizeRand = Math.random();
    if (sizeRand < 0.6) {
      // 60% small dots: 0.3-0.6 size scale
      sizes[i] = 0.3 + Math.random() * 0.3;
    } else {
      // 40% large blobs: 0.8-1.4 size scale
      sizes[i] = 0.8 + Math.random() * 0.6;
    }
  }

  return { positions, sizes };
};

const DISPERSED_DENSE = new DispersedVariant(
  'dispersed_dense',
  dispersedDenseGenerator,
  { particleCount: 8000 }
);

/**
 * DISPERSED_CHAOS - Clustered, chaotic distribution
 * 8 random cluster centers with Gaussian falloff
 * Sizes: Larger variation (very small speckles + huge blobs)
 * Creates "unresolved" feeling with concentrated hotspots
 */
const dispersedChaosGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const clusterCount = config.clusterCount || 8;
  const particlesPerCluster = Math.floor(particleCount / clusterCount);

  // Generate random cluster centers
  const clusterCenters = [];
  for (let c = 0; c < clusterCount; c++) {
    clusterCenters.push({
      x: (Math.random() - 0.5) * 40,
      y: (Math.random() - 0.5) * 40,
      z: (Math.random() - 0.5) * 40,
      radius: 2 + Math.random() * 6, // Cluster spread radius
      density: 0.5 + Math.random() * 0.5 // How dense this cluster is
    });
  }

  let particleIdx = 0;

  // Distribute particles around clusters using Gaussian
  for (let c = 0; c < clusterCount && particleIdx < particleCount; c++) {
    const cluster = clusterCenters[c];
    const particlesInCluster = Math.min(
      particlesPerCluster,
      particleCount - particleIdx
    );

    for (let p = 0; p < particlesInCluster && particleIdx < particleCount; p++) {
      // Gaussian distribution around cluster center
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const r = Math.sqrt(-2 * Math.log(u1)) * cluster.density;
      const theta = u2 * Math.PI * 2;

      const dist = Math.abs(r);
      const angle = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      positions[particleIdx * 3] = cluster.x + dist * Math.sin(phi) * Math.cos(angle);
      positions[particleIdx * 3 + 1] = cluster.y + dist * Math.sin(phi) * Math.sin(angle);
      positions[particleIdx * 3 + 2] = cluster.z + dist * Math.cos(phi);

      // Size: Extreme variation
      // Tiny speckles (20%), normal dots (50%), huge blobs (30%)
      const sizeRand = Math.random();
      if (sizeRand < 0.2) {
        // 20% tiny speckles: 0.1-0.25
        sizes[particleIdx] = 0.1 + Math.random() * 0.15;
      } else if (sizeRand < 0.7) {
        // 50% normal dots: 0.4-0.8
        sizes[particleIdx] = 0.4 + Math.random() * 0.4;
      } else {
        // 30% huge blobs: 1.0-2.0
        sizes[particleIdx] = 1.0 + Math.random() * 1.0;
      }

      particleIdx++;
    }
  }

  // Fill remaining with random chaos points
  while (particleIdx < particleCount) {
    const c = Math.floor(Math.random() * clusterCount);
    const cluster = clusterCenters[c];

    // Random points within cluster radius
    const dist = Math.random() * cluster.radius * 2;
    const angle = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;

    positions[particleIdx * 3] = cluster.x + dist * Math.sin(phi) * Math.cos(angle);
    positions[particleIdx * 3 + 1] = cluster.y + dist * Math.sin(phi) * Math.sin(angle);
    positions[particleIdx * 3 + 2] = cluster.z + dist * Math.cos(phi);

    // Random size for chaos
    sizes[particleIdx] = 0.2 + Math.random() * 1.5;

    particleIdx++;
  }

  return { positions, sizes };
};

const DISPERSED_CHAOS = new DispersedVariant(
  'dispersed_chaos',
  dispersedChaosGenerator,
  { particleCount: 10000, clusterCount: 8 }
);

/**
 * DISPERSED_SWARM - High-density, very chaotic
 * Like a swarm or cloud of gnats
 * Tight clustering with lots of small fast-moving particles
 */
const dispersedSwarmGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const swarmCenters = 12; // More clusters = denser swarm
  const particlesPerSwarm = Math.floor(particleCount / swarmCenters);

  // Tighter cluster centers (more compact)
  const centers = [];
  for (let s = 0; s < swarmCenters; s++) {
    centers.push({
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 30,
      z: (Math.random() - 0.5) * 30,
      radius: 0.8 + Math.random() * 3, // Tighter than chaos
      speed: 0.5 + Math.random() * 1.5
    });
  }

  let particleIdx = 0;

  // Pack particles tightly around centers
  for (let s = 0; s < swarmCenters && particleIdx < particleCount; s++) {
    const center = centers[s];
    const particlesInSwarm = Math.min(
      particlesPerSwarm,
      particleCount - particleIdx
    );

    for (let p = 0; p < particlesInSwarm && particleIdx < particleCount; p++) {
      // Very tight Gaussian (exponential falloff)
      const u1 = Math.random();
      const u2 = Math.random();
      const r = -Math.log(u1) * center.speed;
      const theta = u2 * Math.PI * 2;

      const dist = Math.min(r, center.radius * 2);
      const phi = Math.random() * Math.PI;
      const angle = Math.random() * Math.PI * 2;

      positions[particleIdx * 3] = center.x + dist * Math.sin(phi) * Math.cos(angle);
      positions[particleIdx * 3 + 1] = center.y + dist * Math.sin(phi) * Math.sin(angle);
      positions[particleIdx * 3 + 2] = center.z + dist * Math.cos(phi);

      // Swarm = mostly tiny particles with occasional medium blobs
      const sizeRand = Math.random();
      if (sizeRand < 0.8) {
        // 80% speckles: 0.15-0.45
        sizes[particleIdx] = 0.15 + Math.random() * 0.3;
      } else {
        // 20% medium blobs: 0.6-1.2
        sizes[particleIdx] = 0.6 + Math.random() * 0.6;
      }

      particleIdx++;
    }
  }

  // Fill remaining
  while (particleIdx < particleCount) {
    const s = Math.floor(Math.random() * swarmCenters);
    const center = centers[s];

    const dist = Math.random() * center.radius * 3;
    const phi = Math.random() * Math.PI;
    const angle = Math.random() * Math.PI * 2;

    positions[particleIdx * 3] = center.x + dist * Math.sin(phi) * Math.cos(angle);
    positions[particleIdx * 3 + 1] = center.y + dist * Math.sin(phi) * Math.sin(angle);
    positions[particleIdx * 3 + 2] = center.z + dist * Math.cos(phi);

    sizes[particleIdx] = 0.2 + Math.random() * 0.8;
    particleIdx++;
  }

  return { positions, sizes };
};

const DISPERSED_SWARM = new DispersedVariant(
  'dispersed_swarm',
  dispersedSwarmGenerator,
  { particleCount: 12000, clusterCount: 12 }
);

/**
 * DISPERSED_DYNAMIC - Living, pulsing clusters with motion
 * Multiple tight clusters (16) with particles gently pulsing back and forth
 * Creates alive, organic feeling without being chaotic
 */
const dispersedDynamicGenerator = (particleCount, config) => {
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const clusterCount = config.clusterCount || 16;
  const particlesPerCluster = Math.floor(particleCount / clusterCount);

  // Generate 16 cluster centers spread throughout viewport
  const clusters = [];
  for (let c = 0; c < clusterCount; c++) {
    clusters.push({
      x: (Math.random() - 0.5) * 35,
      y: (Math.random() - 0.5) * 35,
      z: (Math.random() - 0.5) * 35,
      radius: 1.5 + Math.random() * 4,  // Medium-tight clusters
      speed: 0.4 + Math.random() * 0.6
    });
  }

  let particleIdx = 0;

  // Pack particles tightly around centers with Gaussian distribution
  for (let c = 0; c < clusterCount && particleIdx < particleCount; c++) {
    const cluster = clusters[c];
    const particlesInCluster = Math.min(
      particlesPerCluster,
      particleCount - particleIdx
    );

    for (let p = 0; p < particlesInCluster && particleIdx < particleCount; p++) {
      // Tight Gaussian around cluster center
      const u1 = Math.random();
      const u2 = Math.random();
      const r = -Math.log(Math.max(0.001, u1)) * cluster.speed;

      const dist = Math.min(r, cluster.radius * 1.5);
      const phi = Math.random() * Math.PI;
      const angle = Math.random() * Math.PI * 2;

      positions[particleIdx * 3] = cluster.x + dist * Math.sin(phi) * Math.cos(angle);
      positions[particleIdx * 3 + 1] = cluster.y + dist * Math.sin(phi) * Math.sin(angle);
      positions[particleIdx * 3 + 2] = cluster.z + dist * Math.cos(phi);

      // Size variation: mostly medium with some extremes
      const sizeRand = Math.random();
      if (sizeRand < 0.1) {
        // 10% tiny: 0.15-0.3
        sizes[particleIdx] = 0.15 + Math.random() * 0.15;
      } else if (sizeRand < 0.85) {
        // 75% medium: 0.4-0.9
        sizes[particleIdx] = 0.4 + Math.random() * 0.5;
      } else {
        // 15% large: 1.0-1.8
        sizes[particleIdx] = 1.0 + Math.random() * 0.8;
      }

      particleIdx++;
    }
  }

  // Fill remaining
  while (particleIdx < particleCount) {
    const c = Math.floor(Math.random() * clusterCount);
    const cluster = clusters[c];

    const dist = Math.random() * cluster.radius * 2;
    const phi = Math.random() * Math.PI;
    const angle = Math.random() * Math.PI * 2;

    positions[particleIdx * 3] = cluster.x + dist * Math.sin(phi) * Math.cos(angle);
    positions[particleIdx * 3 + 1] = cluster.y + dist * Math.sin(phi) * Math.sin(angle);
    positions[particleIdx * 3 + 2] = cluster.z + dist * Math.cos(phi);

    sizes[particleIdx] = 0.3 + Math.random() * 1.0;
    particleIdx++;
  }

  return { positions, sizes };
};

const DISPERSED_DYNAMIC = new DispersedVariant(
  'dispersed_dynamic',
  dispersedDynamicGenerator,
  {
    particleCount: 14000,
    clusterCount: 16,
    animated: true,
    pulseSpeed: 0.8,    // Gentle pulsing
    pulseAmount: 0.25   // Subtle movement (not too extreme)
  }
);

// RegistryUpdate function
function registerDispersedVariants(shapeRegistry) {
  if (shapeRegistry && shapeRegistry.register) {
    shapeRegistry.register(DISPERSED_DENSE);
    shapeRegistry.register(DISPERSED_CHAOS);
    shapeRegistry.register(DISPERSED_SWARM);
    shapeRegistry.register(DISPERSED_DYNAMIC);
    // console.log('[dispersed-variants] ✅ Registered 4 variants: dense, chaos, swarm, dynamic');
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.DispersedVariant = DispersedVariant;
  window.DISPERSED_DENSE = DISPERSED_DENSE;
  window.DISPERSED_CHAOS = DISPERSED_CHAOS;
  window.DISPERSED_SWARM = DISPERSED_SWARM;
  window.DISPERSED_DYNAMIC = DISPERSED_DYNAMIC;
  window.registerDispersedVariants = registerDispersedVariants;
}
