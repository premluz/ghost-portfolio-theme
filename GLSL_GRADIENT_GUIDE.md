# GLSL Gradient Component Guide

## Overview
Modular GLSL gradient component that renders interactive, animated gradients in the background of project cards. Gradients only initialize when cards enter the viewport to optimize performance.

## File Structure
```
assets/
├── glsl-gradient/           # GLSL gradient source (Vite project)
│   ├── src/
│   │   ├── app.js
│   │   ├── modules/
│   │   │   └── gl/
│   │   │       ├── gl.js
│   │   │       ├── scene.js
│   │   │       ├── mat/fsq/
│   │   │       │   ├── fragment.frag
│   │   │       │   └── vertex.vert
│   │   │       └── ...
│   │   └── styles/
│   └── ...
├── js/
│   └── glsl-gradient-manager.js    # Manager for gradient instances
└── css/
    └── main.css                     # Gradient component styles

partials/
└── glsl-gradient.hbs                # Handlebars partial template
```

## Usage

### Basic Usage
Include the partial in a post-card or any component:

```handlebars
{{> glsl-gradient 
  id=id 
  multx=0.2 
  multy=0.8 
  hue=200 
  brightness=0.8 
  mouse=-1 
  scale=1 
  scale2=2 
  noise=1 
  time=0.2 
  bw=0 
  bw2=0 
  red=0.2 
  green=0.4 
  blue=0.8 
  red2=0.9 
  green2=0.1 
  blue2=0.2
}}
```

### Available Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `id` | string | - | Unique identifier (usually post ID) |
| `multx` | float | 0-3 | X-axis deformation frequency |
| `multy` | float | 0-3 | Y-axis deformation frequency |
| `hue` | float | 0-360 | Hue shift in degrees |
| `brightness` | float | 0-5 | Overall brightness multiplier |
| `mouse` | float | -1 to 1 | Mouse interaction strength (-1=dark influence) |
| `scale` | float | 0.5-3 | UV scale/zoom level |
| `scale2` | float | 0.5-3 | Alternative scale for swap mode |
| `noise` | float | 0-3 | Perlin noise deformation amount |
| `time` | float | 0.1-3 | Animation speed multiplier |
| `bw` | float | 0-1 | Black & white mix (0=color, 1=bw) |
| `bw2` | float | 0-1 | Alternative B&W for swap mode |
| `red` | float | 0-1 | Primary color red channel |
| `green` | float | 0-1 | Primary color green channel |
| `blue` | float | 0-1 | Primary color blue channel |
| `red2` | float | 0-1 | Secondary color red channel |
| `green2` | float | 0-1 | Secondary color green channel |
| `blue2` | float | 0-1 | Secondary color blue channel |

## How It Works

### 1. **Initialization**
- When the page loads, `glsl-gradient-manager.js` scans for gradient containers
- Sets up IntersectionObserver to detect viewport visibility
- Gradients initialize **only when in view** (threshold: 0.3)

### 2. **Rendering**
- Each gradient gets its own canvas element with unique ID
- GLSL fragment shader runs on GPU for smooth 60fps animation
- Mouse movement tracked and passed to shader as uniform
- Time incremented each frame for continuous animation

### 3. **Visibility Control**
- Out of view: opacity 0, gradient doesn't render
- Entering view: IntersectionObserver triggers, gradient initializes and fades in
- Leaving view: Gradient fades out to save performance

## JavaScript API

### Access Gradient Manager
```javascript
window.glslGradientManager
```

### Update Colors Dynamically
```javascript
window.glslGradientManager.updateColors('gradient-{{id}}', {
  primary: { r: 0.2, g: 0.4, b: 0.8 },
  secondary: { r: 0.9, g: 0.1, b: 0.2 }
});
```

### Update Parameters
```javascript
window.glslGradientManager.updateParams('gradient-{{id}}', {
  multx: 0.3,
  brightness: 1.0,
  hue: 240
});
```

### Access Gradient Instance
```javascript
const gradient = window.gradientInstances['gradient-{{id}}'];
gradient.gl.scene.quad.swap(1, { d: 1.2 }); // Swap to alt colors
```

## Future: Dynamic Colors Based on Project

Currently, all project cards use the same gradient parameters. To link colors to each project:

1. **Store colors in post metadata** (custom fields or project data)
2. **Pass to partial**: 
   ```handlebars
   {{> glsl-gradient 
     id=id 
     red=customMetadata.gradientRed
     green=customMetadata.gradientGreen
     blue=customMetadata.gradientBlue
   }}
   ```
3. **Or update dynamically in JS**:
   ```javascript
   // When project data loads
   const projectData = getProjectMetadata(postId);
   window.glslGradientManager.updateColors(`gradient-${postId}`, {
     primary: projectData.gradientColor
   });
   ```

## Performance Considerations

- ✅ **Lazy initialization**: Gradients only load when visible
- ✅ **GPU-accelerated**: Shader runs on graphics card
- ✅ **Minimal JS overhead**: Manager is lightweight
- ⚠️ **Note**: Disable on mobile (see CSS media query)

## Customization

### Change Default Parameters
Edit the partial call in `post-card.hbs`:
```handlebars
{{> glsl-gradient id=id multx=0.5 multy=1.0 ...}}
```

### Edit Shader
Modify `/assets/glsl-gradient/src/modules/gl/mat/fsq/fragment.frag` for different effects.

### Styling
Update `.glsl-gradient-container` in `main.css` for sizing, transitions, etc.

## Troubleshooting

**Gradient not showing:**
- Check browser console for errors
- Verify canvas ID matches: `data-gradient-id="gradient-{{id}}"`
- Ensure card is in viewport (scroll to it)

**Poor performance:**
- Reduce `noise` parameter
- Lower `time` multiplier
- Check GPU usage in DevTools

**Colors not updating:**
- Verify post ID is correct
- Call `updateParams()` instead of directly setting dataset
- Check that card is initialized (console log in manager)
