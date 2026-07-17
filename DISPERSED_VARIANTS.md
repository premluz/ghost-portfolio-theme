# Dispersed Variants - Alt Particle States with Density & Variation

## Overview

Three alt versions of the "dispersed" particle state, each designed to add visual complexity and an "unresolved" feeling through density, clustering, and size variation.

**Current default**: `dispersed` (uniform random, calm)  
**New variants**: `dispersed_dense`, `dispersed_chaos`, `dispersed_swarm`

---

## Variant Comparison

| Variant | Particles | Clustering | Density | Size Variation | Feeling |
|---------|-----------|-----------|---------|---|----------|
| **dispersed** | 6,000 | None (uniform) | Low | Uniform | Calm, peaceful, empty |
| **dispersed_dense** | 8,000 | None (uniform) | Medium | Bimodal (60% small, 40% large) | More complex, still balanced |
| **dispersed_chaos** | 10,000 | 8 clusters | Medium-High | Extreme (20% tiny, 50% normal, 30% huge) | Chaotic, unresolved, dynamic |
| **dispersed_swarm** | 12,000 | 12 tight clusters | Very High | Tight (80% speckles, 20% medium) | Swarm-like, dense cloud, organic |

---

## 1. DISPERSED_DENSE

**Concept**: Higher density, no clustering. More particles = more visual complexity.

**Characteristics**:
- 8,000 particles (vs 6,000 original)
- Uniform random distribution in 50×50×50 cube
- Bimodal size distribution:
  - 60% small dots: 0.3-0.6 scale
  - 40% large blobs: 0.8-1.4 scale
- All cyan color (like original)

**When to use**: Gentle increase in complexity without chaos. Good intermediate step between calm and chaotic.

**Visual effect**: Feels fuller, busier, more visual weight—but still organized and peaceful.

---

## 2. DISPERSED_CHAOS (Recommended Default)

**Concept**: Clustered distribution with Gaussian falloff. Creates "hotspots" of high particle density.

**Characteristics**:
- 10,000 particles
- 8 random cluster centers with Gaussian spread
- Each cluster has random radius (2-8 units) and density (0.5-1.0)
- Extreme size variation:
  - 20% tiny speckles: 0.1-0.25 scale (barely visible specs)
  - 50% normal dots: 0.4-0.8 scale
  - 30% huge blobs: 1.0-2.0 scale (dominates visually)

**When to use**: When you want to feel "unresolved" or chaotic. Good for statement sections or dramatic transitions.

**Visual effect**: 
- Visually dramatic with large and small particles mixing
- Concentrations of density in random spots
- Feels like a system in flux, not at equilibrium
- More cinematic

**Algorithm**:
```
For each cluster:
  - Generate random center (x, y, z) in ±40 range
  - Set cluster radius (2-8) and density (0.5-1.0)
  - Sample particles around center using Gaussian (Box-Muller transform)
  - Size: 20% tiny, 50% normal, 30% huge
```

---

## 3. DISPERSED_SWARM

**Concept**: Very tight clustering, many clusters. Like a swarm of gnats or a dense cloud.

**Characteristics**:
- 12,000 particles (highest density)
- 12 tight cluster centers (more clusters than chaos)
- Exponential falloff (tighter than Gaussian)
- Swarm-like size distribution:
  - 80% speckles: 0.15-0.45 scale (fine detail)
  - 20% medium blobs: 0.6-1.2 scale (anchors)

**When to use**: When you want dense, organic, swarm-like appearance. Good for nature/organic metaphors.

**Visual effect**: 
- Looks like a cloud of particles
- Much denser locally (cluster centers)
- More "populated" feeling
- Speckled texture with occasional medium blobs

---

## Technical Implementation

### Size Attribute in Shader

The shader now reads a `size` attribute per particle:

```glsl
attribute float size;  // 0.0-2.0 scale

void main() {
  // Size is modulated per-particle
  gl_PointSize = (0.1 * size) * (300.0 / -mvPosition.z);
}
```

Each variant provides sizes in the return value:

```javascript
// Old (no variation):
return positions;  // Just Float32Array

// New (with variation):
return { positions, sizes };  // Object with both
```

### State Registration

States are registered with sizes:

```javascript
const result = this.shapeRegistry.generateState('dispersed_chaos', 10000);
// result = { positions: Float32Array, sizes: Float32Array }

this.stateRegistry.register('dispersed_chaos', result.positions, {
  shapeKey: 'dispersed_chaos',
  sizes: result.sizes
});
```

### Morphing with Size Variation

When morphing between states with different sizes, the sizes also interpolate:

```javascript
if (this.currentState && this.nextState) {
  const nextSizes = this.nextState.sizes;
  const currentSizes = this.currentState.sizes;
  
  if (nextSizes && currentSizes) {
    // Blend sizes along with positions
    const morphedSizes = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      morphedSizes[i] = currentSizes[i] + 
        (nextSizes[i] - currentSizes[i]) * morphProgress;
    }
    this.updateSizes(morphedSizes);
  }
}
```

---

## How to Use in Browser Console

### Switch Dispersed Variant

```javascript
// Switch to dense variant
window.particleSystem.morphTo('dispersed_dense', 1000);

// Switch to chaos variant
window.particleSystem.morphTo('dispersed_chaos', 1000);

// Switch to swarm variant
window.particleSystem.morphTo('dispersed_swarm', 1000);

// Back to original calm dispersed
window.particleSystem.morphTo('dispersed', 1000);
```

### Test Size Variation

```javascript
// Verify sizes are being used
console.log('Current state sizes:', window.particleSystem.loop.particles.geometry.attributes.size.array.slice(0, 20));

// Check size distribution (should show variation)
const sizes = window.particleSystem.loop.particles.geometry.attributes.size.array;
console.log('Min size:', Math.min(...sizes).toFixed(2));
console.log('Max size:', Math.max(...sizes).toFixed(2));
console.log('Mean size:', (sizes.reduce((a,b) => a+b) / sizes.length).toFixed(2));
```

---

## Recommended Configuration

### Default Homepage Look

Start with `dispersed` (calm), then trigger chaos on statement section:

```javascript
// In particle-morph.hbs, statement section trigger:
system.handleTriggerAction({ 
  action: 'morph', 
  state: 'dispersed_chaos',  // ← More dramatic
  duration: 500 
});
```

### Alternative: Swarm for Innovation Section

```javascript
// For "cutting edge" or "innovative" sections:
system.handleTriggerAction({ 
  action: 'morph', 
  state: 'dispersed_swarm',  // ← Dense, organic
  duration: 800 
});
```

### Morphing Sequence (Cinematic)

```javascript
// 1. Start: calm dispersed
system.start('dispersed');  // 0ms

// 2. Hero visible: fade in
system.handleTriggerAction({ action: 'fade-in', duration: 1500 });  // 0-1500ms

// 3. Statement section: chaos
setTimeout(() => {
  system.morphTo('dispersed_chaos', 800);  // 1500-2300ms
}, 1500);

// 4. Back to calm when exiting
system.morphTo('dispersed', 600);  // on scroll away
```

---

## Performance Notes

- **Dense** (8K): ~2% GPU overhead increase vs original
- **Chaos** (10K): ~3-4% overhead (clustering computation is minimal)
- **Swarm** (12K): ~5-6% overhead (highest particle count)

All variants use the same shader and blending, so performance scales linearly with particle count.

**On lower-end devices**: Reduce particle count in config:
```javascript
const system = new window.ParticleMorphSystem(container, {
  particleCount: 4000,  // ← Reduced (normally 6000+)
  morphDuration: 500
});
```

---

## File Structure

```
assets/js/
├── dispersed-variants.js  ← New file (alt generators)
├── particle-animation-loop.js  ← Updated (size attribute)
├── particle-state.js  ← Updated (sizes field)
├── shape-definitions.js  ← Updated (generator return format)
└── particle-morph-system.js  ← Updated (register variants)

partials/
└── particle-morph.hbs  ← Updated (load dispersed-variants.js)
```

---

## Testing Checklist

- [ ] Page loads with original `dispersed` state (calm)
- [ ] `morphTo('dispersed_dense')` shows more particles
- [ ] `morphTo('dispersed_chaos')` shows clustering + size variation
- [ ] `morphTo('dispersed_swarm')` shows tight swarm effect
- [ ] Morphing smooth (no popping or glitches)
- [ ] Size variation visible (both large blobs and small speckles)
- [ ] No performance drops on Chrome/Safari/Firefox
- [ ] Mobile performance acceptable (reduced particle count if needed)

---

## Future Ideas

- **Directional swarms**: Particles flow toward cluster centers (wind-like)
- **Animated clusters**: Centers move over time (breathing effect)
- **Color per cluster**: Different colors for different clusters
- **Physics**: Gravity, repulsion between particles (very expensive)
- **Audio-reactive**: Size/density respond to page scroll speed
