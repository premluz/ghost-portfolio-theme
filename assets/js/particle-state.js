/**
 * ParticleState - Manages state configuration and position data
 */
class ParticleState {
  constructor(id, positions, config = {}) {
    this.id = id;
    this.positions = positions;
    this.sizes = config.sizes || null; // Optional size variation data
    this.phis = config.phis || null; // Helix-only: per-particle tube angle (see helixGenerator)
    this.config = {
      radius: config.radius || 3.5,
      scale: config.scale || 1.0,
      rotation: config.rotation || { x: 0, y: 0, z: 0 },
      animation: config.animation || {},
      ...config
    };
  }

  getPositionsCopy() {
    return new Float32Array(this.positions);
  }

  getSizesCopy() {
    return this.sizes ? new Float32Array(this.sizes) : null;
  }
}

class StateRegistry {
  constructor(particleCount) {
    this.states = new Map();
    this.particleCount = particleCount;
  }

  register(id, positions, config = {}) {
    this.states.set(id, new ParticleState(id, positions, config));
  }

  get(id) {
    return this.states.get(id);
  }

  has(id) {
    return this.states.has(id);
  }

  all() {
    return Array.from(this.states.values());
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ParticleState = ParticleState;
  window.StateRegistry = StateRegistry;
}
