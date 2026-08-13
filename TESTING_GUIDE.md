# Testing Alt Dispersed Variants

**Site**: http://localhost:2369  
**DevTools**: F12 → Console tab

---

## Quick Test (2 minutes)

1. **Open browser**: http://localhost:2369
2. **Open DevTools**: F12
3. **Paste in Console** (one at a time):

```javascript
// Test 1: Switch to DENSE (gentle complexity)
window.particleSystem.morphTo('dispersed_dense', 1000);
```
**Expected**: More particles (8K vs 6K), size variation visible (small dots + larger blobs)  
**Feel**: Fuller, busier, but still calm

---

```javascript
// Test 2: Switch to CHAOS (dramatic, unresolved)
window.particleSystem.morphTo('dispersed_chaos', 1000);
```
**Expected**: Dense clusters with extreme size mix (tiny speckles + huge blobs)  
**Feel**: Chaotic, energetic, "unresolved"

---

```javascript
// Test 3: Switch to SWARM (organic cloud)
window.particleSystem.morphTo('dispersed_swarm', 1000);
```
**Expected**: Very tight clustering, mostly fine speckles with medium anchors  
**Feel**: Dense swarm, like a cloud of gnats, organic

---

```javascript
// Test 4: Back to ORIGINAL (calm)
window.particleSystem.morphTo('dispersed', 1000);
```
**Expected**: Original sparse, uniform distribution  
**Feel**: Peaceful, empty, balanced

---

## Detailed Testing

### 1. **Verify Sizes Are Loading**

```javascript
// Check size variation in current state
const sizes = window.particleSystem.loop.particles.geometry.attributes.size.array;
console.log('Sample sizes:', sizes.slice(0, 20));
console.log('Min:', Math.min(...sizes).toFixed(2));
console.log('Max:', Math.max(...sizes).toFixed(2));
console.log('Mean:', (sizes.reduce((a,b)=>a+b)/sizes.length).toFixed(2));
```

**Expected Output**:
- **dispersed_dense**: Min ~0.3, Max ~1.4, Mean ~0.7
- **dispersed_chaos**: Min ~0.1, Max ~2.0, Mean ~0.8
- **dispersed_swarm**: Min ~0.15, Max ~1.5, Mean ~0.4

---

### 2. **Test Smooth Morphing**

Morph through all variants in sequence (each 1.5s):

```javascript
const variants = ['dispersed', 'dispersed_dense', 'dispersed_chaos', 'dispersed_swarm'];
let index = 0;
const interval = setInterval(() => {
  window.particleSystem.morphTo(variants[index], 1500);
  console.log('→', variants[index]);
  index = (index + 1) % variants.length;
}, 2000);

// Stop when done: clearInterval(interval)
```

**Expected**: Smooth transitions without popping or glitches

---

### 3. **Performance Check**

**Desktop** (Chrome DevTools):
1. Open DevTools → Performance tab
2. Start recording
3. Switch variants 3-4 times
4. Stop recording
5. Check FPS (should stay 60fps or near it)

**Expected**: 
- No noticeable frame drops
- GPU load <10% (particles aren't expensive)
- Smooth morphing

---

### 4. **Mobile Performance**

If testing on phone/tablet:
1. Open Safari DevTools (Mac) or Chrome DevTools (Android)
2. Switch variants a few times
3. Check if performance is smooth

**Expected**: Smooth on most devices (may drop to 30fps on very old phones, which is acceptable)

---

## Visual Quality Checklist

### Size Variation ✓ or ✗

- [ ] **dense**: Can see both small and large particles (60/40 mix)
- [ ] **chaos**: Dramatic size difference (tiny specs visible + large blobs obvious)
- [ ] **swarm**: Fine speckles dominate with occasional medium blobs
- [ ] **original**: All particles appear uniform size

### Clustering ✓ or ✗

- [ ] **dense**: No visible clustering, uniform spread
- [ ] **chaos**: Clear "hotspots" where particles bunch up
- [ ] **swarm**: Multiple tight clusters throughout viewport
- [ ] **original**: Sparse, scattered uniformly

### Morphing ✓ or ✗

- [ ] Smooth transition (no popping/flickering)
- [ ] Particles gradually change position
- [ ] Sizes gradually change (not instant)
- [ ] Takes ~1 second (as specified)

### Glow/Bloom ✓ or ✗

- [ ] Each variant has hexagonal particles with glow
- [ ] Larger particles have more visible bloom
- [ ] Smaller particles are more subtle
- [ ] No visual artifacts or strange colors

---

## Debug Logging

To see initialization logs:

```javascript
// Check if system initialized properly
console.log('System ready:', !!window.particleSystem);
console.log('Loop ready:', !!window.particleSystem.loop);
console.log('Particles count:', window.particleSystem.loop.particleCount);
console.log('Available states:', ['dispersed', 'dispersed_dense', 'dispersed_chaos', 'dispersed_swarm']);

// Check if variants are registered
const registry = window.particleSystem.shapeRegistry;
['dispersed', 'dispersed_dense', 'dispersed_chaos', 'dispersed_swarm'].forEach(name => {
  const shape = registry.get(name);
  console.log(`${name}: ${shape ? '✅' : '❌'}`);
});
```

**Expected**: All variants show ✅

---

## Common Issues & Fixes

### ❌ "morphTo is not a function"
**Cause**: System not initialized  
**Fix**: Wait 3 seconds after page load, then try again

```javascript
setTimeout(() => {
  window.particleSystem.morphTo('dispersed_chaos', 1000);
}, 3000);
```

---

### ❌ "Particles don't look different"
**Cause**: Sizes not being applied, or very subtle  
**Fix**: Check size attribute is loaded

```javascript
const sizes = window.particleSystem.loop.particles.geometry.attributes.size;
console.log('Has size attr:', !!sizes);
console.log('First 10 sizes:', sizes.array.slice(0, 10));
```

**Should show**: Mixed values (not all 1.0)

---

### ❌ "All particles same size"
**Cause**: Variant didn't load properly, falling back to uniform  
**Fix**: Verify dispersed-variants.js loaded

```javascript
console.log('Window has variants:', !!window.DISPERSED_DENSE);
console.log('Window has CHAOS:', !!window.DISPERSED_CHAOS);
console.log('Window has SWARM:', !!window.DISPERSED_SWARM);
```

**Should show**: All true

---

### ❌ "Console shows 'size attribute undefined'"
**Cause**: Shader not updated  
**Fix**: Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

---

## Recommended Variants by Use Case

### Homepage (Current)
- **Hero**: Keep original `dispersed` (calm, minimal)
- **Statement section**: Switch to `dispersed_chaos` (dramatic)
- **Cards**: Back to `dispersed` (calm again)

### Alternative (More Energetic)
- **Hero**: Start with `dispersed_dense` (busier)
- **Statement**: `dispersed_chaos` (climax)
- **Cards**: `dispersed_swarm` (sustained energy)

---

## Next Steps After Testing

1. **Visual Approval**: Which variant feels right?
   - Dense? Chaos? Swarm? Or keep original?

2. **Integration**: Update particle-morph.hbs to trigger variants on sections
   ```javascript
   // Instead of:
   system.handleTriggerAction({ action: 'morph', state: 'dispersed', ... });
   
   // Use:
   system.handleTriggerAction({ action: 'morph', state: 'dispersed_chaos', ... });
   ```

3. **Performance**: Any issues on mobile? Adjust particle count if needed
   ```javascript
   const system = new window.ParticleMorphSystem(container, {
     particleCount: 4000,  // ← Lower for slower devices
     morphDuration: 500
   });
   ```

4. **Fine-tune**: Want different size distribution? Edit dispersed-variants.js

---

## Test Results Template

Copy this when testing:

```
Date: [date]
Browser: [Chrome/Safari/Firefox]
Device: [Desktop/Mobile]

Dense variant: ✓ or ✗
Chaos variant: ✓ or ✗
Swarm variant: ✓ or ✗
Morphing smooth: ✓ or ✗
Performance: ✓ or ✗
Glow visible: ✓ or ✗

Preferred variant: [dense/chaos/swarm/original]
Notes: [any observations]
```

---

## Questions?

Check these files:
- `/DISPERSED_VARIANTS.md` — Full technical guide
- `/ALT_DISPERSED_SUMMARY.md` — Implementation summary
- `/assets/js/dispersed-variants.js` — Generator code
