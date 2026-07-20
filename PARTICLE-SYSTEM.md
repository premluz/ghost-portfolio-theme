# Particle Morph System Template

## Overview
A reusable 3D particle animation system that visualizes objects through three distinct particle groups with smooth state transitions.

## Architecture

### Two States
1. **Dispersed State**: All particles floating randomly in 3D space (yellow)
2. **Object State**: Particles organized into structure with 3 groups (cyan)

### Three Particle Groups (Object State)

#### 1. Object Core (70% of particles)
- **Color**: Bright cyan (full brightness)
- **Behavior**: Forms the main shape structure
- **Animation**: Scrolls upward along the defined path continuously
- **Density**: Dense circumference particles create solid 3D appearance

#### 2. Aura (20% of particles)  
- **Color**: Dimmed cyan (0.6 brightness)
- **Behavior**: Orbits around object with large random offsets
- **Animation**: Creates scattered, pulsing effect around core
- **Visual Effect**: Suggests energy/force field around object

#### 3. Dispersed Background (10% of particles)
- **Color**: Bright yellow
- **Behavior**: Drifts in original dispersed positions
- **Animation**: Continuous organic drift in 3D space
- **Visual Effect**: Chaos/energy state visible beneath object

## Technical Implementation

### Configuration Constants
```javascript
const PARTICLE_COUNT = 3000;
const PARTICLE_COLOR = 0x4ad2ff;      // Base cyan
const PARTICLE_SIZE = 0.12;
const PARTICLE_OPACITY = 0.6;
const AUTO_ROTATION_SPEED = 0.003;    // Y-axis
```

### Helix/Object Generation
**File**: `generateDNAHelix()`

- **helixRadius**: 3.5 (center distance from axis)
- **tubeRadius**: 2.5 (thickness of the tube)
- **segments**: 75 (points along length)
- **tubeDensity**: 20 (particles around circumference)
- **turns**: 1.5 (rotations along height)
- **spacing**: 3 (distance between intertwined strands)

**Result**: Two intertwined helical tubes forming DNA-like structure

### Animation Loop

1. **Scroll Motion**: Particles move upward along path at speed controlled by `time * 2`
2. **Height Wrapping**: Position wraps from top to bottom for infinite scroll
3. **Per-Group Updates**:
   - Core: Direct helix position + subtle pulse
   - Aura: Helix position + large random scatter offsets (±3 units XZ, ±0.8 Y)
   - Dispersed: basePositions + organic drift (sine/cosine waves)

### Visual Effects

#### Circular Particles
- Fragment shader discards pixels beyond 0.5 radius: `if (dist > 0.5) discard;`
- Creates perfect circles instead of square sprites

#### Additive Blending
- Particles layer and glow when overlapping
- `blending: THREE.AdditiveBlending`

#### Per-Vertex Colors
- Different groups use different colors via vertex color attribute
- Enables visual distinction while using single mesh

## State Transitions

**Current**: Always in Object State (helixReached = true)

**Planned**: 
- Add delay timer to start in Dispersed State
- Transition to Object State after N seconds
- Smooth morph transition between states

## Usage for Other Objects

To create a new object shape:

1. **Copy** `generateDNAHelix()` function
2. **Modify** parameters:
   - `helixRadius`: Control overall size
   - `tubeRadius`: Control thickness
   - `segments`: Control detail/density
   - `tubeDensity`: Control smoothness
3. **Reposition** the coordinate calculations to create new geometry
4. **Store** positions in `wavePositions` array
5. **Colors** automatically apply via group percentages

## Performance Notes

- 3000 particles: Smooth 60fps on modern hardware
- Uses single Points mesh (not individual objects)
- WebGL rendering with alpha transparency
- Mouse rotation: Y-axis only (prevents disorientation)

## Files
- **Main**: `/partials/particle-morph.hbs`
- **Backup**: `/partials/particle-morph.hbs.backup`
