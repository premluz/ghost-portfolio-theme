# Particle Morphing System Documentation

## Overview

A modular Three.js particle system that morphs between 7 3D shapes with cinematic glow effects. Particles trigger morphing transitions when scroll-positioned elements enter the viewport, creating a dynamic visual effect tied to page content.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│ particle-morph.hbs (Initialization & Triggers)      │
│ - IntersectionObserver setup                        │
│ - Viewport-based state morphing                      │
│ - ParticleMorphSystem init                           │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┴───────────────┬──────────────────┐
    │                            │                  │
┌───▼──────────┐    ┌───────────▼──┐    ┌─────────▼─────┐
│ Particle     │    │ Shape        │    │ Color Config  │
│ Animation    │    │ Definitions  │    │ (Cyan/White)  │
│ Loop         │    │ (7 shapes)   │    │ (40% opacity) │
└───┬──────────┘    └──────────────┘    └───────────────┘
    │
    ├─ Scene Setup (Three.js)
    ├─ Shader Material (Hexagonal Bokeh)
    ├─ HDR Tone Mapping
    ├─ EffectComposer + UnrealBloomPass
    └─ Particle Rendering Loop
```

## Core Files

### 1. **particle-morph.hbs** (Initialization)
- **Location**: `/partials/particle-morph.hbs`
- **Purpose**: HTML container, module loading, initialization script
- **Key Functions**:
  - Sets up `<div id="particle-morph-demo">` container (z-index: -5)
  - Waits for all modules to load before initializing
  - Creates `ParticleMorphSystem` instance
  - Sets initial state to "dispersed"
  - Registers IntersectionObserver triggers for helix section
  - Registers card-based triggers via `projectMetaArray`
  - Calls `ScrollTrigger.refresh()` after initialization

### 2. **particle-animation-loop.js** (Rendering Engine)
- **Location**: `/assets/js/particle-animation-loop.js`
- **Purpose**: Core render loop, shader management, bloom effects
- **Key Classes**:
  - `ParticleAnimationLoop`: Main controller
  - Manages THREE.js scene, camera, renderer
  - Handles particle geometry and shader material
  - Implements HDR tone mapping + UnrealBloomPass

#### Shader Material Details:
**Vertex Shader**:
- Replicates PointsMaterial sizeAttenuation in clip space
- `gl_PointSize = 0.1 * (300.0 / -mvPosition.z)`
- Passes vertex color to fragment shader

**Fragment Shader**:
- Renders **6-sided hexagonal bokeh** using polar coordinates
- Formula: `r * cos(mod(angle, PI/3) - PI/6)`
- Discards pixels outside hexagon (`r > 0.5`)
- HDR color blending:
  - Core: `vec3(4.0, 4.0, 4.0)` (white-hot, triggers bloom)
  - Edges: `vColor * 1.2` or `vec3(0.0, 0.44, 1.0)` (cyan fallback)
- Alpha: `pow(bokeh, 2.0) * 0.8` (80% opacity)

#### Bloom Pipeline:
```
EffectComposer
├─ RenderPass (particles + scene)
└─ UnrealBloomPass
   ├─ Strength: 1.6 (glow intensity)
   ├─ Radius: 0.7 (falloff width)
   └─ Threshold: 0.92 (only bright pixels bloom)
```

**Why This Works**:
- Renderer has `alpha: true` + `setClearColor(0x000000, 0)` (transparent)
- Particles use `THREE.AdditiveBlending` (dark pixels = invisible)
- UnrealBloomPass picks up HDR cores (values > 1.0) and spreads glow
- ACESFilmicToneMapping converts HDR values to displayable range
- Result: Sharp hexagonal shapes with cinematic glow halos

### 3. **particle-morph-system.js** (Orchestrator)
- **Location**: `/assets/js/particle-morph-system.js`
- **Purpose**: High-level system management, color generation
- **Key Functions**:
  - `initializeModules()`: Async initialization of all sub-systems
  - `generateParticleColors()`: Per-shape color assignment
  - `setupTriggers()`: Register viewport triggers
  - `start()`: Begin animation loop
  - `morphTo()`: Trigger state transitions

**Color Configuration**:
```javascript
DISPERSED & HELIX: Cyan (0.29, 0.82, 1.0) @ 40% opacity
CARDS (mobile, note, clapper, diamond, globe, game): White (1.0, 1.0, 1.0) @ 40% opacity
```

### 4. **shape-definitions.js** (Particle Geometry)
- **Location**: `/assets/js/shape-definitions.js`
- **Purpose**: Generate particle positions for each shape
- **Technique**: MeshSurfaceSampler on GLB models
  - Loads 3D models: mobile.glb, note.glb, clapper.glb, diamond.glb, globe.glb, game.glb
  - Automatically subdivides low-poly models 2-3 times
  - Samples 6000 points uniformly across surface
  - Falls back to procedural geometry if GLB fails

### 5. **particle-state.js** (State Registry)
- **Location**: `/assets/js/particle-state.js`
- **Purpose**: Cache particle position arrays
- **Key Functions**:
  - `register(key, positions, config)`: Store shape state
  - `get(key)`: Retrieve cached positions
  - `blendStates()`: Linear interpolation for morphing

### 6. **card-animations.js** (Card Scroll Effects)
- **Location**: `/assets/js/card-animations.js`
- **Purpose**: Animate work cards on scroll
- **Mechanism**: GSAP ScrollTrigger per card
  - Each card has independent scroll trigger at `top 100%` (viewport entry)
  - Triggers play GSAP timeline when card enters
  - Content slides in from right (0.6s)
  - Image slides in staggered (0.6s, +0.2s delay)
  - No exit animation (cards stay in final position)

## 7D Shape States

| State | Particles | Behavior | Color |
|-------|-----------|----------|-------|
| **dispersed** | Scattered randomly | Initial page load state | Cyan |
| **helix** | Helical tube formation | Triggered when statement section enters | Cyan |
| **mobile** | Mobile phone shape | Triggered on mobile card scroll | White |
| **note** | Note/document shape | Triggered on note card scroll | White |
| **clapper** | Clapper board shape | Triggered on clapper card scroll | White |
| **diamond** | Diamond gemstone shape | Triggered on diamond card scroll | White |
| **globe** | Spherical globe shape | Triggered on globe card scroll | White |
| **game** | Game controller shape | Triggered on game card scroll | White |

## Morphing Behavior

### Trigger System
- **Page Load**: Start in `dispersed` state
- **Hero Section Visible**: Fade in particles (1.5s)
- **Initial Helix (Time-based)**: Morph to `helix` (600ms transition) — *particle-morph.hbs line 198*
- **Helix Section on Scroll**: Morph to `helix` (500ms) — triggered at `top center+=800px`
- **Work Card Enters**: Morph to card's shape (400ms) — *main.js line 2380*
- **Card Leaves**: Morph back to `dispersed` (500ms)
- **Tabs Switch**: Re-register card triggers for new tab's cards

### Morphing Algorithm
```
If duration > 0:
  nextState = target
  morphProgress = 0→1 over duration ms
  blendStates() interpolates positions linearly
  
If morphProgress >= 1:
  currentState = nextState
  nextState = null
```

### Z-Index Layering
```
z-index: -10  ← Project gradients (background)
z-index: -5   ← Particles (foreground of background)
z-index: 1    ← Page content (hero, cards, footer)
z-index: 999  ← Debug UI (dev console)
```

## Configuration & Customization

### Particle Count
**File**: `particle-morph.hbs` line 120
```javascript
const system = new window.ParticleMorphSystem(container, {
  particleCount: 6000,  // Change here
  morphDuration: 4000   // Morph duration in ms
});
```

### Bloom Parameters
**File**: `particle-animation-loop.js` lines 97-102
```javascript
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6,   // Strength (increase for more glow)
  0.7,   // Radius (increase for wider spread)
  0.92   // Threshold (lower for more pixels to glow)
);
```

### Particle Opacity
**File**: `particle-animation-loop.js` line 184
```glsl
float finalAlpha = pow(bokeh, 2.0) * 0.8;  // Change 0.8 (1.0 = fully opaque)
```

### Particle Size
**File**: `particle-animation-loop.js` line 141
```glsl
gl_PointSize = 0.1 * (300.0 / -mvPosition.z);  // Change 0.1 (larger = bigger particles)
```

### Core Color (Glow Brightness)
**File**: `particle-animation-loop.js` line 178
```glsl
vec3 coreColor = vec3(4.0, 4.0, 4.0);  // Increase for brighter bloom (4.0 = very bright)
```

### Edge Color (Fallback Cyan)
**File**: `particle-animation-loop.js` line 176
```glsl
vec3(0.0, 0.44, 1.0)  // Adjust for different hue/saturation
```

## Known Issues & Solutions

### Issue: Particles Not Visible
**Solutions**:
1. Check console for `[particle-morph]` initialization logs
2. Verify `particle-animation-loop.js` is loaded (check network tab)
3. Ensure THREE.js is available globally before particle-morph.hbs loads
4. Check that `window.ParticleAnimationLoop` exists

### Issue: Bloom Not Visible
**Solutions**:
1. Increase bloom strength (1.6 → 2.0+)
2. Lower threshold (0.92 → 0.7) to trigger more pixels
3. Increase particle opacity (0.8 → 1.0)
4. Increase core color values (4.0 → 6.0+)

### Issue: Morphing Stuck or Not Triggering
**Solutions**:
1. Verify IntersectionObserver is supported (modern browsers only)
2. Check that card elements have `data-cardid` attributes
3. Verify `window.projectMetaArray` is populated
4. Call `ScrollTrigger.refresh()` after tab switches
5. Check for JavaScript errors in console

### Issue: Performance Issues
**Solutions**:
1. Reduce particle count (6000 → 3000-4000)
2. Disable bloom (remove UnrealBloomPass) for performance
3. Use `AdditiveBlending` (already optimized)
4. Profile with Chrome DevTools → Performance tab

## Performance Metrics

- **Particle Count**: 6000 (optimized for smooth 60fps)
- **Morph Duration**: 1-4 seconds (smooth interpolation)
- **Shader Complexity**: Low (hexagon math is efficient)
- **Bloom Overhead**: ~5-10% GPU load (post-processing)
- **Memory**: ~20-30MB for particle geometry + textures

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ❌ IE 11 (no WebGL 2.0, no dynamic imports)

## References

- **Three.js Docs**: https://threejs.org/docs/
- **UnrealBloomPass**: https://threejs.org/examples/?q=bloom
- **Polar Coordinates**: Math for hexagon distance calculation
- **HDR Rendering**: Values > 1.0 for bloom threshold detection
- **GSAP ScrollTrigger**: https://greensock.com/docs/v3/Plugins/ScrollTrigger

## Development Notes

### Testing Morphing
```javascript
// In browser console (actual timings used):
window.particleSystem.morphTo('helix', 500);      // Helix on scroll: 500ms
window.particleSystem.morphTo('mobile', 400);     // Card shapes: 400ms
window.particleSystem.morphTo('dispersed', 500);  // Return to dispersed: 500ms

// Initial helix (time-based, 600ms) is in particle-morph.hbs line 198
```

### Debugging Triggers
```javascript
// Enable debug logs in particle-morph.hbs:
// Uncomment debug() calls to see trigger firing
```

### Monitoring GPU
```javascript
// Check bloom pass stats:
console.log(window.particleLoop._bloomPass);
```

## Future Enhancements

- [ ] Mobile touch controls (rotate particles on swipe)
- [ ] Particle count optimization based on device
- [ ] Custom shape loader (user-provided GLB models)
- [ ] Particle physics (gravity, wind, forces)
- [ ] Multi-color gradients per state
- [ ] WebGL 2.0 compute shaders for dynamic updates
- [ ] Audio-reactive particle movement
