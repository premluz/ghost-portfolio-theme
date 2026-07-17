# GPU Particle System Integration Guide

## Step 1: Add Canvas to HTML

Add this to your page where you want particles to render (e.g., in default.hbs or a section):

```html
<!-- GPU Particles Canvas (independent, overlaid on existing particles) -->
<canvas id="gpu-canvas" 
        style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;">
</canvas>
```

**Key styles:**
- `position: fixed` — Stays in viewport
- `z-index: 0` — Behind content (adjust if needed)
- `pointer-events: none` — Doesn't block clicks

---

## Step 2: Load JavaScript Files

Add these script tags to `default.hbs` (after GSAP, before other particle code):

```html
<!-- GPU Particle System (Week 1 foundation) -->
<script src="{{asset 'js/gpu-particles/gpu-shader-compiler.js'}}"></script>
<script src="{{asset 'js/gpu-particles/gpu-compute-engine.js'}}"></script>
<script src="{{asset 'js/gpu-particles/gpu-renderer.js'}}"></script>
<script src="{{asset 'js/gpu-particles/gpu-particle-system.js'}}"></script>
```

**Order matters** — compiler first, then engines, then system.

---

## Step 3: Initialize the System

Add this initialization script (in default.hbs or particle-morph.hbs):

```javascript
<script>
(function() {
  'use strict';

  async function initGPUParticles() {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      console.warn('WebGPU not supported, using existing particle system');
      return;
    }

    // Create and initialize GPU particle system
    window.gpuParticleSystem = new GPUParticleSystem('#gpu-canvas', {
      particleCount: 2000  // Adjust based on device performance
    });

    const initialized = await window.gpuParticleSystem.init();
    
    if (initialized) {
      console.log('✅ GPU Particle System active');
    } else {
      console.log('⚠️ GPU Particle System unavailable, existing system active');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGPUParticles);
  } else {
    initGPUParticles();
  }
})();
</script>
```

---

## Step 4: Verify It Works

1. **Open browser DevTools Console** (F12)
2. **Check for messages:**
   ```
   ✅ [GPUParticleSystem] Initialized successfully
   ```

3. **Look at canvas:**
   - Should see sphere particles oscillating
   - Particles should rotate slowly
   - ~2000 tiny spheres forming a cloud

4. **Check performance:**
   - DevTools → Performance → record for 2 seconds
   - Frame rate should be ~60fps

---

## Step 5: Test Fallback (Optional)

To test the fallback when WebGPU isn't available:

```javascript
// Temporarily disable WebGPU
Object.defineProperty(navigator, 'gpu', { value: undefined });
```

Then reload. Should see existing particle system render instead.

---

## Configuration Options

```javascript
new GPUParticleSystem('#gpu-canvas', {
  particleCount: 2000,          // Default: 2000
  particleCount: 3000,          // Desktop (more particles)
  particleCount: 1000,          // Mobile (fewer particles)
  shaderPath: '/path/to/shaders/' // Default: correct path
});
```

---

## What Renders (Week 1)

- ✅ Sphere mesh (hardcoded for Week 1)
- ✅ 2000-3000 particle instances
- ✅ Rotation animation
- ✅ Vertical oscillation
- ✅ Independent canvas overlay

**What's NOT in Week 1:**
- ❌ Shape morphing (coming Week 2)
- ❌ Scroll binding (coming Week 2)
- ❌ GLB shapes (coming Week 2)

---

## Troubleshooting

### Canvas is blank
- Check DevTools for errors in console
- Verify shader files exist at correct path
- Check browser WebGPU support (Chrome 113+, Edge 113+, Safari 18+)

### Particles not visible
- Check `z-index` isn't behind other content
- Verify `pointer-events: none` set on canvas
- Check canvas size (should fill viewport)

### Poor performance
- Reduce `particleCount` to 500-1000
- Check GPU load in DevTools
- Mobile devices may need fewer particles

### WebGPU errors
- Check browser console for specific errors
- Shader compilation errors will show in console
- Buffer allocation errors will log with [GPUComputeEngine] prefix

---

## Next Steps (Week 2)

Once this is working:
1. Add shape loader (GLB + math shapes)
2. Implement morph logic
3. Add scroll binding via `window.gpuParticleSystem.setMorphTarget(shapeName)`

---

## Integration Checklist

- [ ] Canvas HTML added to default.hbs
- [ ] 4 JS files loaded in order
- [ ] Initialization script added
- [ ] Browser DevTools shows ✅ init message
- [ ] Canvas renders sphere particles
- [ ] Performance is ~60fps
- [ ] Fallback works (WebGPU off)
