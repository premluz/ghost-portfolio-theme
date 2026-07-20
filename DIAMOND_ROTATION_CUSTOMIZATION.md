# Diamond Particle Rotation Customization

## Overview
Customized the diamond particle shape to rotate around the Y axis (like Earth) with 90° counter-clockwise rotation offset and higher pivot point.

## Files Modified

### 1. `assets/js/CONSTANTS.js`

**Location:** Lines 255-268

**Added new configuration section:**
```javascript
const SHAPE_ROTATIONS = {
  diamond: {
    axis: 'y',           // Rotate around Y (like Earth)
    speed: 0.003,        // Rotation speed
    rotationOffset: { x: 0, y: 0, z: Math.PI / 2 },  // 90° left (counter-clockwise)
    pivotY: 0.6,         // Move pivot point higher (0 = center, 1 = top)
  },
  default: {
    axis: 'y',
    speed: 0.003,
    rotationOffset: { x: 0, y: 0, z: 0 },
    pivotY: 0,
  },
};
```

**Added window assignment (Line 285):**
```javascript
window.SHAPE_ROTATIONS = SHAPE_ROTATIONS;
```

### 2. `assets/js/particle-animation-loop.js`

**Location:** Lines 366-391 (Rotation section in animate() method)

**Original code (lines 371-377):**
```javascript
// Rotation
this.autoRotation += 0.003;
if (this.particles) {
  this.particles.rotation.y = this.autoRotation + (this.mouseX * Math.PI * 0.5);
  this.particles.rotation.x = this.mouseY * Math.PI * 0.5;
  this.particles.rotation.z = 0;
}
```

**Replaced with shape-aware rotation (lines 366-391):**
```javascript
// Rotation - customizable per shape
if (this.particles) {
  const currentShapeName = this.currentState?.name || 'default';
  const shapeRotConfig = window.SHAPE_ROTATIONS?.[currentShapeName] || window.SHAPE_ROTATIONS?.default;
  const offset = shapeRotConfig?.rotationOffset || { x: 0, y: 0, z: 0 };

  this.autoRotation += (shapeRotConfig?.speed || 0.003);

  if (shapeRotConfig?.axis === 'y') {
    this.particles.rotation.y = offset.y + this.autoRotation + (this.mouseX * Math.PI * 0.5);
    this.particles.rotation.x = offset.x + (this.mouseY * Math.PI * 0.5);
    this.particles.rotation.z = offset.z;
  } else if (shapeRotConfig?.axis === 'x') {
    this.particles.rotation.x = offset.x + this.autoRotation + (this.mouseY * Math.PI * 0.5);
    this.particles.rotation.y = offset.y + (this.mouseX * Math.PI * 0.5);
    this.particles.rotation.z = offset.z;
  } else if (shapeRotConfig?.axis === 'z') {
    this.particles.rotation.z = offset.z + this.autoRotation + (this.mouseX * Math.PI * 0.5);
    this.particles.rotation.y = offset.y + (this.mouseY * Math.PI * 0.5);
    this.particles.rotation.x = offset.x;
  }
}
```

## How It Works

### Shape Detection
- Reads current particle state name (e.g., 'diamond', 'sphere', 'torus')
- Looks up rotation config for that shape from `SHAPE_ROTATIONS`
- Falls back to 'default' if shape not found

### Rotation Axes
Each shape can rotate around a primary axis:
- `'y'`: Continuous Y rotation (primary), X/Z from mouse
- `'x'`: Continuous X rotation (primary), Y/Z from mouse  
- `'z'`: Continuous Z rotation (primary), Y/X from mouse

### Rotation Offset
- Applies initial rotation before animation starts
- Diamond uses: `z: Math.PI / 2` (90° counter-clockwise)
- Can be adjusted per shape

### Pivot Point (pivotY)
- `0` = center (default)
- `0.6` = 60% toward top
- `1` = top of particle cloud

## Diamond Settings Breakdown

```javascript
diamond: {
  axis: 'y',                                         // Primary rotation axis
  speed: 0.003,                                      // Auto-rotation speed increment
  rotationOffset: { x: 0, y: 0, z: Math.PI / 2 },   // 90° initial rotation on Z
  pivotY: 0.6,                                       // Rotation point 60% up
}
```

## Testing
1. Navigate to page with diamond particles
2. Particles should rotate around Y axis smoothly
3. Diamond appears rotated 90° counter-clockwise from default
4. Pivot point is positioned higher in the cloud

## To Restore/Redo

### If reverting to backup:
1. Delete or rename modified files
2. Restore from backup
3. Follow sections above to reapply changes
4. Test particle rotation

### To add custom rotation for other shapes:
1. Add new shape entry to `SHAPE_ROTATIONS` in CONSTANTS.js
2. Set desired `axis`, `speed`, `rotationOffset`, and `pivotY`
3. Animation loop automatically applies the config

## Related Files
- `shape-definitions.js` - Defines diamond shape (loads from `diamond.glb`)
- `particle-morph-system.js` - Orchestrates shape transitions
- `particle-animation-loop.js` - Renders particles each frame

## Notes
- Mouse interaction still affects secondary axes
- Speed can be adjusted per shape (currently 0.003 for all)
- Additional shapes can get custom rotation without modifying animation loop
- Rotation offset is applied in addition to auto-rotation
