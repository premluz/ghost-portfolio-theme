# Post Card Gradient Systems - Complete Documentation

## Overview

The theme has two parallel gradient rendering systems for post cards:
1. **Main.js Gradient Application** — Direct CSS style application (currently disabled)
2. **ProjectGradientManager** — Layer-based gradient with fade transitions (currently disabled)

Both systems pull gradient data from post metadata and apply it to card backgrounds.

---

## Data Flow

```
Post Page (codeinjection_head)
    ↓
window.projectMeta = { gradientCss: "..." }
    ↓
main.js fetches & extracts metadata
    ↓
projectMetaArray (stored in memory)
    ↓
Gradient System A or B (applies to cards)
    ↓
Card background rendered
```

---

## System A: Main.js Gradient Application

### Location
**File**: `/assets/js/main.js` lines 3573-3585

### How It Works
```javascript
// Extract gradient from post metadata
if (meta.gradientCss) {
  // Store as data attribute
  card.setAttribute('data-gradient-css', meta.gradientCss);
  
  // Create inline style that applies gradient
  const style = document.createElement('style');
  style.textContent = `
    [data-cardid="${meta.cardId}"]::before {
      background: ${meta.gradientCss} !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);
}
```

### Characteristics
- ✓ Simple, direct application
- ✓ Instant gradient render
- ✓ No animation/fade
- ✓ Uses card's `::before` pseudo-element
- ✓ Currently DISABLED (return early in code)

### Enable/Disable
**To enable**: Uncomment the `document.createElement('style')` block (lines 3576-3583)
**To disable**: Leave as-is (commented out)

---

## System B: ProjectGradientManager

### Location
**File**: `/assets/js/project-gradient.js`

### How It Works

```javascript
class ProjectGradientManager {
  init() {
    // 1. Find all post cards on page
    this.cards = document.querySelectorAll('.post-card');
    
    // 2. Create gradient layers (fixed position, z-index -10)
    // 3. Register IntersectionObserver for each card
    // 4. Fade gradient in/out on scroll
  }
  
  getGradient(card, index, cardId) {
    // Try multiple sources in order:
    // 1. data-gradient-css attribute (from main.js)
    // 2. data-gradient attribute
    // 3. projectMetaArray by cardId match
    // 4. projectMetaArray by index match
    // 5. projectMeta array
  }
  
  handleCardIntersection(entries) {
    // Fade gradient in when card visible (50%+)
    // Fade gradient out when card not visible
    // Uses GSAP tweens for smooth animation
  }
}
```

### Gradient Layer HTML
```javascript
<div class="glsl-gradient-container" style="
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -10;
  opacity: 0;
  background-image: url('/assets/images/noise.svg'), [GRADIENT];
  background-blend-mode: overlay;
">
```

### Characteristics
- ✓ Separate fixed-position layers per card
- ✓ Smooth fade in/out on scroll
- ✓ Noise texture overlay
- ✓ Blend mode for sophisticated look
- ✓ GSAP animation (0.6s ease)
- ✓ Currently DISABLED (early return in init)

### Enable/Disable
**To enable**: Remove the early `return;` statement (line 21)
**To disable**: Add `return;` as first line in init() method

---

## Gradient Source: Post Metadata

### Where Gradients Come From

Each post defines its gradient in **codeinjection_head** as:

```javascript
window.projectMeta = {
  cardId: "mobile",
  longTitle: "Mobile App Design",
  projectCategory: "Mobile",
  client: "Acme Corp",
  
  // ← GRADIENT SOURCE
  gradientCss: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  
  // Other metadata...
  cardKeywords: "React, TypeScript, UX",
  cardDescription: "Redesigning the mobile experience",
};
```

### Accessing in Ghost Admin

1. Go to **Ghost Admin** → http://localhost:2369/ghost
2. Click **Posts**
3. Click any **project post** (Mobile, Note, Clapper, etc.)
4. Scroll to **Code injection** section
5. Click **Header** tab
6. Find the `window.projectMeta = {...}` block
7. Locate `gradientCss: "..."`

### Example Gradients

```javascript
// Linear gradient
gradientCss: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"

// Multi-color gradient
gradientCss: "linear-gradient(45deg, #ff6b6b, #ffd93d, #6bcf7f)"

// Radial gradient
gradientCss: "radial-gradient(circle, #ff00ff, #00ffff)"

// Conic gradient
gradientCss: "conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)"
```

---

## Data Storage Chain

### Step 1: Post Page Definition
```javascript
// In post's codeinjection_head
window.projectMeta = {
  gradientCss: "linear-gradient(135deg, #667eea, #764ba2)",
  // ...
};
```

### Step 2: Main.js Extraction
```javascript
// main.js fetches post URL
fetch(postUrl)
  .then(res => res.text())
  .then(html => {
    // Extract window.projectMeta from HTML
    const meta = eval(`(${metaString})`);
    // meta.gradientCss = "linear-gradient(...)"
  });
```

### Step 3: Storage in Memory
```javascript
// Store in global array
window.projectMetaArray.push({
  cardId: "mobile",
  gradientCss: "linear-gradient(135deg, #667eea, #764ba2)",
  // ... other metadata
});
```

### Step 4: Gradient Systems Read
```javascript
// System A (main.js)
card.setAttribute('data-gradient-css', meta.gradientCss);

// System B (ProjectGradientManager)
const gradient = this.getGradient(card, index, cardId);
// Returns meta.gradientCss or fallback
```

---

## Z-Index Layering

### Current Layer Stack (Gradients Hidden)
```
z-index: 1+    ← Page content (cards, text, etc.)
z-index: -5    ← Particles (hexagon bokeh with bloom)
z-index: -10   ← Gradients (currently not visible)
[background]   ← Body/page background
```

### If Gradients Enabled
```
z-index: 1+    ← Page content (cards, text, etc.)
z-index: -5    ← Particles (hexagon bokeh with bloom)
z-index: -10   ← Gradients (visible behind particles)
[background]   ← Body/page background
```

The gradients sit BEHIND the particles, creating depth.

---

## Status: Currently Disabled

Both gradient systems are **disabled** as of last update:

### System A (main.js)
- **Status**: Disabled
- **Location**: `/assets/js/main.js:3576`
- **Why**: Commented out style block
- **To enable**: Uncomment lines 3576-3583

### System B (ProjectGradientManager)
- **Status**: Disabled  
- **Location**: `/assets/js/project-gradient.js:21`
- **Why**: Early return statement
- **To enable**: Remove the `return;` statement

### Console Output
When disabled, you'll see:
```
[project-gradient] Initializing - DISABLED
```

---

## Quick Enable/Disable Guide

### Enable Both Gradients

**File 1**: `/assets/js/main.js` (line 3576)
```javascript
// CHANGE FROM:
/*
const style = document.createElement('style');

// TO:
const style = document.createElement('style');
// And close comment after line 3583
*/
```

**File 2**: `/assets/js/project-gradient.js` (line 21)
```javascript
// CHANGE FROM:
init() {
  console.log('[project-gradient] Initializing - DISABLED');
  return;

// TO:
init() {
  console.log('[project-gradient] Initializing');
  // Remove the return statement
```

### Test After Enabling
1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Scroll to cards section
3. Should see gradient backgrounds on cards
4. Check console for logs confirming gradient loaded

---

## Customizing Gradients

### Add Custom Gradient to Post

1. **In Ghost Admin**:
   - Go to Posts → Select a project
   - Scroll to Code injection → Header
   - Find `window.projectMeta = {...}`
   - Update `gradientCss` value

2. **Example**:
```javascript
window.projectMeta = {
  cardId: "mobile",
  // ... other fields ...
  gradientCss: "linear-gradient(to right, #ff0000, #00ff00, #0000ff)",
};
```

3. **Save and test**:
   - Save post
   - Hard refresh theme
   - Check if gradient appears

### Gradient Tools

- **CSS Gradient Generator**: https://cssgradient.io/
- **WebGradients**: https://webgradients.com/
- **Gradient Designer**: https://www.colordot.it/

---

## Performance Considerations

### System A (Direct Application)
- **Overhead**: Minimal (creates 1 style tag per card)
- **Render**: Instant
- **Memory**: ~1KB per card
- **Best for**: Quick, simple gradients

### System B (ProjectGradientManager)
- **Overhead**: Higher (creates fixed layer + observers + GSAP tweens)
- **Render**: Animated fade (0.6s)
- **Memory**: ~10KB per card (layer DOM + tween state)
- **Best for**: Cinematic, sophisticated look

### Recommendation
- **Performance priority**: Use System A
- **Visual quality priority**: Use System B
- **Best balance**: Use one or the other, not both

---

## Troubleshooting

### Gradients Not Showing
1. Check if systems are disabled:
   ```javascript
   console.log('Main.js applied:', document.querySelectorAll('[data-gradient-css]').length > 0);
   console.log('ProjectGradientManager active:', !!window.projectGradientManager);
   ```

2. Enable the system you want

3. Hard refresh browser

4. Check console for errors

### Gradients Hidden Behind Content
- Check z-index values in CSS
- Particles are at z-index: -5
- Gradients should be at z-index: -10
- Content should be at z-index: 1+

### Gradient Data Not Loading
1. Check post's codeinjection_head has `window.projectMeta`
2. Verify `gradientCss` field is spelled correctly
3. Verify gradient CSS syntax is valid
4. Check main.js console logs: `[metadata]` messages

### GSAP Not Working (System B)
- Ensure GSAP is loaded globally
- Check browser console for GSAP errors
- Verify `window.gsap` exists

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `/assets/js/main.js` | Extracts gradient from posts, applies via System A | Active (System A disabled) |
| `/assets/js/project-gradient.js` | Creates layers, fade animation (System B) | Loaded (disabled) |
| `/assets/js/gradient-layer.js` | Utility for creating gradient elements | Loaded |
| `/assets/js/glsl-gradient-manager.js` | GLSL/WebGL gradient (alternative) | Loaded |
| Post codeinjection_head | Defines `window.projectMeta` with gradient | Active |

---

## Future Enhancements

- [ ] Dynamic gradient based on card content
- [ ] Animated gradients (hue rotation, etc.)
- [ ] Multi-gradient per card (layered)
- [ ] Gradient based on scroll position
- [ ] Touch-responsive gradients on mobile
- [ ] Accessibility: Reduce Motion support

---

## Contact & Questions

For issues with gradients:
1. Check this documentation first
2. Review the files listed above
3. Check browser console for error messages
4. Verify post metadata is correct
5. Try enabling/disabling each system independently
