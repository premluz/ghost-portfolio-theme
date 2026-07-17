# GLSL Gradient Component Setup

## What Was Created

A **modular, reusable GLSL gradient component** that:
- ✅ Embeds animated gradients on project cards
- ✅ Only initializes when cards enter the viewport
- ✅ Responds to mouse movement
- ✅ Supports configurable colors and animation parameters
- ✅ Prepares for dynamic color updates based on project data

## Files Added/Modified

### New Files Created
```
partials/
└── glsl-gradient.hbs                    # Partial template

assets/
├── js/
│   └── glsl-gradient-manager.js         # Gradient lifecycle manager
├── css/main.css                         # Added gradient styles
└── glsl-gradient/                       # Full gradient source (Vite project)
    ├── src/
    │   ├── modules/gl/
    │   │   ├── gl.js                    # Main WebGL setup
    │   │   ├── scene.js                 # Mouse tracking & params
    │   │   └── mat/fsq/
    │   │       ├── fragment.frag        # Shader logic
    │   │       └── vertex.vert
    │   ├── app.js
    │   └── styles/
    ├── lib/gradient.02.js               # Compiled library
    └── vite.config.js
```

### Modified Files
```
assets/js/main.js                       # Added gradient manager import
partials/post-card.hbs                  # Added gradient partial
```

### Documentation
```
GLSL_GRADIENT_GUIDE.md                  # Detailed usage guide
GRADIENT_SETUP.md                       # This file
```

## How It Works

```
Page Load
  ↓
GlslGradientManager initializes
  ↓
Scans for [data-gradient-id] elements
  ↓
Sets up IntersectionObserver
  ↓
When card enters viewport (30% visible):
  ├─ Create canvas with unique ID
  ├─ Load GLSL gradient module
  ├─ Initialize WebGL context
  ├─ Start animation loop
  └─ Fade in gradient (opacity 0→1)
  ↓
When card leaves viewport:
  └─ Fade out gradient (opacity 1→0)
```

## Current Implementation

### Post Cards With Gradient
Every project card now has:
- Unique gradient ID: `data-gradient-id="gradient-{{id}}"`
- Canvas element with parameters
- Lazy initialization on viewport enter

### Default Parameters
```handlebars
{{> glsl-gradient 
  id=id 
  multx=0.2                 # X deformation
  multy=0.8                 # Y deformation
  hue=200                   # Blue hue
  brightness=0.8            # Moderate brightness
  mouse=-1                  # Strong mouse influence
  scale=1                   # Normal zoom
  scale2=2                  # Alt scale
  noise=1                   # Moderate noise
  time=0.2                  # Slow animation
  bw=0                      # Full color
  bw2=0                     # Alt B&W
  red=0.2 green=0.4 blue=0.8    # Blue-ish primary
  red2=0.9 green2=0.1 blue2=0.2 # Red-ish secondary
}}
```

## Testing

### 1. **Verify File Structure**
```bash
ls -la assets/glsl-gradient/src/
ls -la assets/js/glsl-gradient-manager.js
ls -la partials/glsl-gradient.hbs
```

### 2. **Start Ghost & Check Console**
```bash
cd /Users/przemek/ghostthemeportfolio/ghost2
ghost restart
```

Open browser DevTools (F12 → Console) and look for:
- `[glsl-gradient] Setting up gradient manager`
- `[glsl-gradient] Found X gradient containers`
- `[glsl-gradient] shown` (when card enters view)
- `[glsl-gradient] Instance gradient-XXX initialized`

### 3. **Visual Testing**
- Navigate to homepage (where project cards are)
- Scroll to project cards
- Watch gradients fade in
- Move mouse over cards to see gradient respond
- Scroll away and watch gradients fade out

### 4. **Check Inspector**
- Right-click card → Inspect
- Look for: `<div class="glsl-gradient-container" data-gradient-id="gradient-XXX">`
- Look for: `<canvas id="glsl-XXX" data-gradient="wrapper">`

## Next Steps: Dynamic Colors

To link gradient colors to project metadata:

### Option 1: Store in Post Custom Fields
1. Add custom fields in Ghost Admin for each post:
   - `gradientRed`, `gradientGreen`, `gradientBlue`
   - `gradientRed2`, `gradientGreen2`, `gradientBlue2`
2. Update partial to use post data:
   ```handlebars
   {{> glsl-gradient 
     id=id 
     red={{customFields.gradientRed}}
     green={{customFields.gradientGreen}}
     blue={{customFields.gradientBlue}}
   }}
   ```

### Option 2: Detect Color from Featured Image
1. Extract dominant colors from post feature image
2. Update gradient colors dynamically:
   ```javascript
   const colors = await extractImageColors(postId);
   window.glslGradientManager.updateColors(`gradient-${postId}`, {
     primary: colors.dominant,
     secondary: colors.accent
   });
   ```

### Option 3: Link to Post Tag/Category
1. Assign color schemes to tags
2. When post loads, apply tag color:
   ```javascript
   const tags = post.tags;
   const colorScheme = getColorForTag(tags[0]);
   window.glslGradientManager.updateColors(`gradient-${post.id}`, colorScheme);
   ```

## Performance Notes

### What's Optimized
- ✅ Lazy initialization (only load visible gradients)
- ✅ GPU rendering (shader runs on graphics card)
- ✅ Minimal JS overhead (manager is lightweight)
- ✅ Mobile disabled (CSS media query)

### Monitoring
Check DevTools Performance tab:
- Canvas rendering should be smooth (60fps)
- JavaScript execution minimal (<1ms per frame)
- GPU load low (shader is efficient)

## Troubleshooting

### Gradient Not Showing
**Check Console:**
- Look for error messages starting with `[glsl-gradient]`
- Verify canvas ID: `data-gradient-id="gradient-XXX"`

**Check HTML:**
- Inspect post card
- Verify `<canvas>` element exists
- Check `data-gradient="wrapper"` attribute

**Check Viewport:**
- Scroll to card (should be 30% visible to trigger)
- Watch console for "shown" message

### Module Loading Issues
The gradient manager tries two approaches:
1. Load pre-built library: `/assets/glsl-gradient/lib/gradient.02.js`
2. Fallback to source modules: `/assets/glsl-gradient/src/modules/gl/gl.js`

If neither works, you may need to build the gradient project:
```bash
cd assets/glsl-gradient
npm install
npm run build
```

### Colors Not Updating
- Verify you're calling the right API:
  ```javascript
  window.glslGradientManager.updateColors('gradient-postId', {...});
  ```
- Check that post ID matches
- Ensure gradient is already initialized

## API Reference

See **GLSL_GRADIENT_GUIDE.md** for detailed parameter explanations and JavaScript API.

## Files to Modify for Customization

| File | Purpose | Edit For |
|------|---------|----------|
| `partials/glsl-gradient.hbs` | Template | Change default params |
| `assets/css/main.css` | Styling | Adjust container size/transition |
| `assets/glsl-gradient/src/modules/gl/mat/fsq/fragment.frag` | Shader | Change visual effects |
| `assets/js/glsl-gradient-manager.js` | Logic | Add auto-color features |

---

**Created:** June 2026  
**Status:** Ready for integration and dynamic color updates
