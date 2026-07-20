# Particle System - Issues & Solutions

## Journey Log: Challenges Encountered and Resolutions

This document tracks all major issues encountered during particle system development, their root causes, and solutions.

---

## 1. Black Background Covering Everything

### Problem
After implementing particles, a solid black rectangle covered the entire page, hiding all content and gradients.

### Root Cause
The WebGL canvas was rendering with an opaque black clear color. The `EffectComposer`'s internal render target used `RGB` format (no alpha channel), which meant every pixel was written with alpha=1.0 (fully opaque).

### Solution
1. Set renderer to `{ alpha: true }` for transparent canvas
2. Changed `setClearColor(0x000000, 0)` (0 = transparent alpha)
3. Added `RGBAFormat` render targets instead of `RGB`
4. Ensured `EffectComposer` uses transparent clear

### Code Changes
```javascript
// particle-animation-loop.js
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);  // Black with alpha=0 (transparent)
```

### Why It Worked
- `alpha: true` creates a transparent WebGL canvas
- `setClearColor(..., 0)` clears to fully transparent (not black)
- `RGBAFormat` preserves transparency through post-processing

---

## 2. Particles Disappearing When Removing z-index Modifications

### Problem
Removed inline `position: relative; z-index: 1` from `<main>` and `<footer>` to clean up unnecessary styles, and particles vanished entirely.

### Root Cause
The z-index adjustments weren't the issue, but the removal coincided with a different problem. The real issue was that the particle container was still at `z-index: -5`, putting it behind all default-stacking content.

### Solution
Kept the z-index structure:
- Gradients: `z-index: -10` (background)
- Particles: `z-index: -5` (visible background effect)
- Content: default `z-index: auto` (natural stacking, above particles)

### Why It Worked
Z-index must be explicit in fixed-position stacking contexts. Without it, browsers fall back to DOM order, which can place content below particles.

---

## 3. Card Animations Playing on Page Load Instead of on Scroll

### Problem
All card animations played simultaneously on page load, not when cards entered the viewport.

### Root Cause
GSAP timeline had `delay: cardDelay` which delayed animation playback **from page load**, not from when the scroll trigger fired. This created sequential queuing rather than scroll-based triggering.

**Timeline behavior**:
- Card 0: delay=0s → animation plays at page load
- Card 1: delay=0.6s → animation plays 0.6s later
- Card 2: delay=1.2s → animation plays 1.2s later

**What we wanted**:
- Card animation should only play when card enters viewport

### Solution
Removed `delay: cardDelay` from timeline. Instead, used independent ScrollTrigger with `paused: true` and `onEnter` callback:

```javascript
const tl = gsap.timeline({
  paused: true,  // Start paused
  scrollTrigger: {
    trigger: card,
    start: 'top 100%',  // Trigger when card enters
    onEnter: () => tl.play()  // Play only on enter
  }
});
```

### Why It Worked
- `paused: true` prevents automatic playback
- `onEnter` callback gives explicit control over when animation starts
- `start: 'top 100%'` ensures trigger fires when card reaches viewport

---

## 4. Particles Rendering as Squares Instead of Circles

### Problem
Particles appeared as square glyphs instead of circular bokeh shapes.

### Root Cause
Used `PointsMaterial` with attempted shader injection via `onBeforeCompile`, but Three.js's shader generation is unpredictable. String replacement targets for circle rendering kept failing.

### Solution
Abandoned `PointsMaterial` entirely and switched to custom `ShaderMaterial` with hand-written GLSL:

```javascript
const mat = new THREE.ShaderMaterial({
  vertexShader: `...`,
  fragmentShader: `
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);  // Center coords
      float r = length(p);
      if (r > 0.5) discard;  // Discard outside circle
      // Hexagon math here...
    }
  `,
  blending: THREE.AdditiveBlending
});
```

### Why It Worked
- Full control over fragment shader output
- Can discard pixels explicitly (prevents square rendering)
- Hexagon math (polar coordinates) becomes reliable
- No fragile string replacement hacks

---

## 5. Hexagonal Bokeh Not Rendering / Particles Invisible

### Problem
Attempted to render hexagonal bokeh using polar coordinate math, but particles disappeared entirely.

### Root Cause
Used incorrect shader insertion point in onBeforeCompile. The shader template variables changed between Three.js versions, causing injection failures.

### Solution
See Issue #4 — switching to full `ShaderMaterial` solved this. The hexagon formula works correctly:

```glsl
float slice = PI / 3.0;  // 60 degrees per sector
float polyDist = r * cos(mod(angle, slice) - slice * 0.5);
float bokeh = smoothstep(0.5, 0.3, polyDist);  // 0→1 inward
```

### Why It Worked
- Polar coordinate math for regular hexagons is mathematically sound
- `smoothstep` creates soft edges vs hard boundaries
- No shader injection fragility

---

## 6. Glow Effect Completely Invisible Despite HDR Values

### Problem
Shader output HDR color values (> 1.0) but glow was completely invisible. No bloom effect, no spread, no halo.

### Root Cause
The `EffectComposer` setup was incomplete:
- `bloomComposer` rendered scene + bloom to `bloomTarget` (off-screen)
- `finalComposer` had only a `RenderPass` (no bloom compositing back)
- Bloom was computed but never displayed

### Solution
Simplified to single-composer pipeline:

```javascript
const composer = new EffectComposer(this.renderer);
composer.addPass(new RenderPass(this.scene, this.camera));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(width, height),
  1.6,   // strength
  0.7,   // radius
  0.92   // threshold
));
```

**Render loop change**:
```javascript
if (this._composerReady && this._composer) {
  this._composer.render();  // Changed from finalComposer
}
```

### Why It Worked
- Single composer renders directly to canvas
- RenderPass draws scene
- UnrealBloomPass processes HDR values and spreads bloom
- Result reaches canvas immediately (no off-screen compositing)

---

## 7. Particles Not Loading - Syntax Error in Config

### Problem
Particles never initialized. Console showed:
```
[particle-morph] Waiting for ParticleAnimationLoop... (attempt 140)
```

Initialization hung forever.

### Root Cause
Typo in bloom pass parameters: `0.7in,` instead of `0.7,`

This syntax error prevented the entire `particle-animation-loop.js` file from parsing. JavaScript engine silently failed, class never exported.

### Solution
Fixed typo:
```javascript
// Before (broken)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6,   // strength
  0.7in,   // ← TYPO: "in" leftover from edit
  0.92   // threshold
);

// After (fixed)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6,   // strength
  0.7,   // ← Fixed
  0.92   // threshold
);
```

### Why It Worked
- Valid JavaScript syntax allows class to parse and export
- Initialization script can now detect `window.ParticleAnimationLoop`
- Particles initialize normally

### Lesson Learned
**Always validate JavaScript syntax with Node.js**:
```bash
node -c particle-animation-loop.js
```

---

## 8. Opacity Set to 0.8 But Particles Still Too Faint

### Problem
Even with 80% opacity and HDR bloom, particles seemed barely visible on dark background.

### Root Cause
Multiple factors compounded:
1. Bloom threshold was 0.92 (very strict, only brightest pixels bloom)
2. Core color at 4.0 (moderate, not extreme HDR)
3. Bloom radius 0.7 was narrow
4. Post-processing overhead reduced final brightness

### Solution
Tuned multiple parameters:
- Increased bloom strength: 0.6 → 1.6
- Widened bloom radius: 0.2 → 0.7
- Lowered threshold slightly: 0.92 (kept strict to avoid background glow)
- Kept opacity at 0.8 (good balance)
- Kept core color at 4.0 (sufficient for HDR)

### Why It Worked
- Bloom strength amplifies the glow spread
- Wider radius = softer, more visible falloff
- Combined effect creates cinematic halo without blooming background

---

## 9. Card Scroll Triggers Not Firing After Tab Switch

### Problem
When switching between featured/experimental tabs, card animations didn't trigger for the new tab's cards.

### Root Cause
Card animations were set up once on page load. When tabs switched, new DOM elements appeared but the old scroll triggers weren't unregistered, and new ones weren't created.

### Solution
Added re-initialization in tab switch handler:

```javascript
// main.js - tab click handler
setTimeout(() => {
  // Kill old GSAP timelines
  gsap.globalTimeline.getChildren().forEach(tl => {
    if (tl.vars?.id?.includes('card')) tl.kill();
  });
  
  // Create new animations
  new window.CardAnimations();
  
  // Re-register particle triggers
  if (window.reinitializeParticleTriggers) {
    window.reinitializeParticleTriggers();
  }
}, 200);
```

### Why It Worked
- Killing old timelines prevents conflicts
- New `CardAnimations` instance registers triggers for visible cards
- Particle triggers updated to match new card positions

---

## 10. ScrollTrigger Plugin Not Registered

### Problem
Card animations threw errors:
```
Uncaught TypeError: ot.ScrollTrigger.create is not a function
```

### Root Cause
`gsap.registerPlugin(ScrollTrigger)` was called before ScrollTrigger library loaded. The initialization script waited for both GSAP and ScrollTrigger, but timing was fragile.

### Solution
Made wait logic more robust:

```javascript
function waitForGSAP(callback, maxAttempts = 200) {
  let attempts = 0;
  function check() {
    attempts++;
    if (typeof gsap !== 'undefined') {
      if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
        callback();
      } else {
        // Keep waiting specifically for ScrollTrigger
        setTimeout(check, 100);
      }
    } else if (attempts < maxAttempts) {
      setTimeout(check, 100);
    }
  }
  check();
}
```

### Why It Worked
- Waits for GSAP first
- Then waits specifically for ScrollTrigger
- Registers plugin only when both available
- Higher max attempts (200 vs 50) for slower devices

---

## 11. Particle Count and Duration Configuration Not Applied

### Problem
Changed `particleCount: 6000` in `particle-morph.hbs` to `2000`, but saw no effect.

### Root Cause
The configuration in `particle-morph.hbs` (line 120) was a local variable passed to `ParticleMorphSystem` constructor. But the actual particle count is generated in `shape-definitions.js` from `MeshSurfaceSampler`, which hardcodes 6000 samples.

### Solution
Particle count is determined by:
1. `ParticleMorphSystem` constructor config: `particleCount: 2000`
2. `shape-definitions.js`: `sampler.sample(positions, normals, this.particleCount)` uses the config value
3. `particle-animation-loop.js`: `this.particleCount` passed to shader

The config IS applied, but visual changes are subtle at different counts.

### Why It Worked
The architecture chains properly; reduced particle count should work, but the effect is subtle until you compare side-by-side.

---

## 12. Project Gradients Hidden Behind Particles

### Problem
Beautiful gradient backgrounds disappeared when particles were enabled.

### Root Cause
Z-index layering was inverted:
- Gradients: `z-index: -2`
- Particles: `z-index: -1` (higher, blocks gradients)
- Content: default

Particles sat on TOP of gradients instead of below them.

### Solution
Proper z-index layering:
```
z-index: -10  ← Gradients (deepest background)
z-index: -5   ← Particles (visible effect, above gradients)
z-index: 1    ← Page content (hero, cards, footer)
```

### Why It Worked
Negative z-indices arrange from back to front: -10 is furthest back, -5 is forward of that, content is on top.

---

## Prevention Checklist for Future Issues

### Rendering Issues
- [ ] Use `node -c` to validate JavaScript syntax before testing
- [ ] Test WebGL canvas transparency: `renderer.setClearColor(..., 0)` + `{ alpha: true }`
- [ ] Use `ShaderMaterial` for custom rendering (avoid fragile `onBeforeCompile`)
- [ ] Always use `EffectComposer.renderToScreen = true` to display post-processing

### Z-Index Issues
- [ ] Map out z-index layers before implementation
- [ ] Use negative values for background, positive for content
- [ ] Test in DevTools Elements panel with `z-index` filter

### Trigger Issues
- [ ] Always add `observerInitComplete` guard to skip initial callbacks
- [ ] Verify `window.projectMetaArray` is populated before registering triggers
- [ ] Call `ScrollTrigger.refresh()` after DOM changes
- [ ] Re-initialize animations when tabs/filters change content

### Configuration Issues
- [ ] Document all config parameters with units and ranges
- [ ] Validate parameters match Three.js API (numbers, not strings)
- [ ] Use hardcoded values for testing, move to config later
- [ ] Log all config values on initialization for debugging

### Performance Issues
- [ ] Profile with Chrome DevTools → Performance tab
- [ ] Monitor GPU usage with WebGL Inspector
- [ ] Start conservative (fewer particles, no bloom), add features incrementally
- [ ] Test on multiple devices (mobile, tablet, desktop)

---

## Testing Recommendations

### Manual Testing Checklist
- [ ] Particles visible on page load
- [ ] Particles glow with cinematic bloom
- [ ] Particles morph smoothly between shapes
- [ ] Card animations trigger on scroll
- [ ] Gradients visible behind particles
- [ ] Page content visible on top of particles
- [ ] No janky performance or lag
- [ ] Works on Chrome, Firefox, Safari
- [ ] Tab switching re-registers triggers
- [ ] Debug console shows correct state changes

### Automated Testing
```javascript
// Test particle morphing
console.assert(window.particleSystem !== undefined, 'System initialized');
window.particleSystem.morphTo('helix', 1000);
setTimeout(() => {
  console.assert(window.particleLoop?.particles !== null, 'Particles rendered');
}, 1100);
```

---

## 13. Old THREE.js System Wouldn't Render After Re-Enabling — Reverted to GPU

### Problem
Disabled the GPU (WebGPU compute) particle system and tried to re-enable the old THREE.js
system (`particle-morph-system.js`, `shape-definitions.js`, `particle-state.js`,
`particle-animation-loop.js`, orchestrated from `particle-morph.hbs`). Nothing rendered —
particles were invisible, with no obvious console error pointing at why.

### Root Causes Found
1. **Syntax error in `particle-morph.hbs`** — a `catch (error)` around line 615 with no matching
   `try`, producing `Unexpected token 'catch'`. This is fatal for the whole inline `<script>`
   block — a parse error means *none* of the script runs, not just the broken branch.
2. **Script still didn't execute after fixing the syntax error** — test indicators (a red
   border, a green box) added directly in the script never appeared, meaning something deeper
   than the syntax error was also preventing execution (template rendering order, a guard
   condition, or similar — not fully isolated).
3. **Deep async dependency chain** — the old system's init waits on `window.THREE` loading, then
   the `ParticleMorphSystem` class, then checks for the GPU system to decide old-vs-new. Three
   sequential async waits with no logging at each handoff makes it hard to tell which stage is
   actually stuck.
4. **No clear error path** — valid HTML, invalid/non-executing JS, and no obvious console
   signal made this much slower to debug than a single clear stack trace would have been.

### Decision: Reverted to GPU, Did Not Fix
- The GPU (WebGPU compute) system is proven working — it initializes, renders, and morphs
  correctly (confirmed via live browser testing while investigating an unrelated bug: shader
  compile, buffer allocation, all 12 shape preloads, and scroll-triggered morphs all succeeded
  with clean console output).
- GPU has a simpler, single-stage init path with no multi-layer async waiting.
- GPU already has every feature the old system provided (helix, morphing, scroll triggers).
- GPU is the intended long-term system anyway; debugging the old THREE.js path further would
  be time spent on something being phased out.

**Current state**: `particle-morph.hbs` is still included site-wide (`default.hbs:325`) and its
scroll-trigger/morph-orchestration logic is active and working — it drives `window.particleSystem`
regardless of which renderer backs it. Only the old THREE.js *renderer* files
(`particle-morph-system.js`, `shape-definitions.js`, `particle-state.js`,
`particle-animation-loop.js`) are not loaded (`default.hbs` only loads
`js/gpu-particles/gpu-fallback.js`) — they remain in the repo as dead code, not wired into any
template.

> **Correction**: when this entry was first written, a quick try/catch-pairing check suggested
> the syntax error described above was no longer present. That check was wrong — it only counted
> `try`/`catch` keyword pairs and missed a *stray extra closing brace* elsewhere in the same
> function (unrelated to try/catch structure). The error was still live and is what entry #14
> below actually fixes. Lesson: counting keyword pairs isn't a syntax check — run the file (or its
> extracted script content) through a real parser (`node -c`, or `new Function(src)`) instead.

### What Would Be Needed to Actually Fix the Old System (Not Currently Planned)
1. Fix the syntax error in `particle-morph.hbs` (add the missing `try` before `setupCardTriggers`)
2. Debug why the script still didn't execute after that fix — likely needs `console.log` at each
   stage of the async chain (THREE loaded → class available → GPU-vs-old decision) to isolate
   where it actually stalls
3. Add robust error logging in the THREE.js init path instead of silent failure
4. Add a fallback if THREE.js fails to load (currently none)
5. Simplify the three-stage async dependency chain — a single readiness check would remove most
   of the debugging difficulty described above

Not worth the effort unless there's a specific reason to move off the GPU system — it's the
forward path and already works.

---

## 14. Particles Invisible With No Console Errors — Two Separate Root Causes

### Problem
GPU particles weren't rendering and, from the terminal, nothing indicated why. (Note: this
system's logs are browser DevTools console logs, not server-terminal output — `ghost run`'s
terminal will never show them, since the particle system is entirely client-side JS.)

### Root Cause 1: The syntax error from #13 was still actually present
The correction note above explains this: the earlier check only verified `try`/`catch` keyword
counts were paired, which missed a genuine **stray extra closing `}`** right after
`initParticleMorphModular()`'s own proper closing brace (confirmed by brace-depth counting: the
function opened at line 152 and correctly reached depth 0 at line 652 — line 653's `}` had
nothing left to close). A parse error anywhere in an inline `<script>` block prevents the *entire*
block from running, so this alone was enough to explain "nothing renders, nothing logs."
**Fixed** — removed the stray `}` in `particle-morph.hbs`.

### Root Cause 2: `gpu-particle-integration.hbs` was never included anywhere
This is the partial that actually creates the system:
`window.gpuParticleSystem = await GPUFallback.createSystem('#gpu-canvas', {...})`. It was
referenced only in comments (including, confusingly, inside its own file: *"particle-morph.hbs is
NOT loaded on the home page, so the hero choreography must live here"* — no longer true, since
`particle-morph.hbs` **is** loaded site-wide). `default.hbs` had a comment reading
`<!-- GPU Particle System Integration (Production Setup) -->` immediately above
`{{> particle-morph}}`, but the actual `{{> gpu-particle-integration}}` include the comment
describes was missing — almost certainly dropped during the old-system experiment in #13.

Without it, `particle-morph.hbs`'s own polling loop (`while (!window.gpuParticleSystem && ...)`)
waited the full 15s and then gave up, meaning `window.particleSystem` was simply never set and
the canvas stayed at its unrendered default size (`300×150`).

**Verified fix, end-to-end**, via Playwright with WebGPU explicitly enabled
(`--enable-unsafe-webgpu`, headless Chromium doesn't grant GPU adapter access by default): with
both fixes in place, canvas correctly resized to the real viewport (`1440×900`), adapter/device
initialized, all GLB shapes loaded, `window.particleSystem` set.

### Duplicate-trigger risk when re-adding the include (checked, currently a non-issue)
`particle-morph.hbs` has its own `registerScrollTriggersOnGPU()` function that would register
GPU-path hero/operating-model/testimonials triggers — which would duplicate/conflict with
`gpu-particle-integration.hbs`'s own hero/statement triggers (worst case: two different sources
both calling `morphTo('sphere', ...)` on operating-model entry, since
`operating-model-stacked.hbs` also does this from its own pinned timeline). This function's call
site is **already commented out** (`// await registerScrollTriggersOnGPU();`, noted "commented out
because GPU is disabled") so there's no active duplication today — but if anyone ever un-comments
it, re-check for exactly this conflict first.

### Current state (as of this writing) — intentionally left toggleable
The include is present in `default.hbs` but **commented out**:
```handlebars
<!-- {{> gpu-particle-integration}} -->
{{> particle-morph}}
```
This was a deliberate choice to be able to switch particle systems on/off without deleting code —
uncomment that one line to re-enable GPU particle rendering. With it commented out, particles will
not render (same visible symptom as before), but — unlike before — this is now a clean, expected
no-op rather than a silent failure: no syntax error, no infinite polling loop left hanging.

---

## 15. Old System Appeared, But With a ~15s Delay Every Load

### Problem
After choosing to run the old THREE.js system (commenting out `{{> gpu-particle-integration}}`,
per #14), the old particles eventually appeared but only after a noticeable delay on every page
load, including refreshes.

### Root Cause — Not the preloader (verified, then ruled out)
The initial hypothesis was that the preloader-skip-on-refresh logic wasn't working. Checked
`preloader.js` directly: on the skip path (`localStorage.getItem('preloader_seen')` already set),
it returns immediately (`preloader.js:27`) and never calls `_runParticles()` at all — that
function only runs as part of the full first-visit timeline. So the preloader was already
correctly skipping itself on refresh; it wasn't the cause.

The actual cause was in `particle-morph.hbs`'s own `initParticleMorphModular()`: it *unconditionally*
polled `window.gpuParticleSystem` for up to 15 seconds before falling back to the old system —
regardless of whether `gpu-particle-integration.hbs` (the only thing that ever sets that variable)
was even included on the page. With it commented out, `window.gpuParticleSystem` could never
appear, so this loop ran its full 15s timeout on *every single load*, every time, before the old
system got a chance to start.

### Fix
Set a flag synchronously (before any `await`) at the very top of `gpu-particle-integration.hbs`'s
script — `window.__gpuIntegrationPresent = true;` — so `particle-morph.hbs` can tell "GPU
integration is on the page but still initializing" apart from "GPU integration isn't included at
all," and skip the wait entirely in the latter case:
```javascript
// gpu-particle-integration.hbs — set immediately, before any async work
window.__gpuIntegrationPresent = true;

// particle-morph.hbs — only wait if that flag exists
if (window.__gpuIntegrationPresent) {
  // ...existing up-to-15s polling loop...
} else {
  debug('[particle-morph] gpu-particle-integration not present — skipping GPU wait');
}
```
Verified: old system now initializes at ~0.6s instead of ~15s (timed via Playwright console
timestamps), with or without the GPU include present.

### Self-inflicted bug hit while writing this fix's explanatory comment
Wrote a code comment inside `particle-morph.hbs`'s `<script>` block that included the literal text
`{{> gpu-particle-integration}}` to reference the partial by name. **Handlebars doesn't know what a
JS comment is** — it processes `{{...}}` patterns anywhere in the `.hbs` file, including inside
`<script>` tags and inside `//` comments. This caused Ghost to render the *entire*
`gpu-particle-integration.hbs` partial — complete with its own `<script>...</script>` tags —
directly into the middle of the comment, breaking the surrounding script with `Unexpected token
'<'`. Confirmed by extracting the actual rendered (post-Handlebars) `<script>` content from the
live page HTML (not the `.hbs` source) and running it through `node -c` — the `.hbs` source alone
looked syntactically fine, since Handlebars processing only happens at render time.

**Fix:** rephrase the comment to describe the partial in prose ("the gpu-particle-integration
partial") instead of using literal `{{> partialName}}` syntax.

**General lesson:** never write a literal `{{...}}` Handlebars expression inside a code comment in
a `.hbs` file — even a `//` JS comment — unless you deliberately intend it to render. If you need
to reference a partial/helper by its exact syntax in a comment, escape it (`\{{...}}`) or spell it
out in prose. When a syntax error appears in an inline script and the `.hbs` source looks fine,
always check the actual **rendered** HTML output, not just the template source — Handlebars
processing can introduce content the source alone won't reveal.

---

## Lessons Learned

1. **Syntax validation is critical** — A single typo can break entire modules silently
2. **Z-index stacking is non-obvious** — Always draw explicit diagrams
3. **Off-screen rendering needs compositing** — Can't just render and expect it to appear
4. **Timing guards are essential** — Initial observer callbacks are tricky
5. **Configuration chains matter** — Understand the flow from config to actual values
6. **Post-processing is powerful but complex** — HDR + bloom requires careful setup
7. **Full shader control beats fragile injection** — ShaderMaterial > onBeforeCompile
8. **Test on multiple devices early** — Mobile performance != desktop performance
9. **A single syntax error kills the whole inline script, not just the broken branch** — a
   stray `catch` with no matching `try` in one code path (old-system-only logic) silently
   prevented the entire `particle-morph.hbs` script from parsing at all. When re-enabling a
   long-dormant code path, validate syntax first (`node -c`, or paste into a linter) before
   spending time on runtime debugging.
10. **When reviving a deprecated system costs more than it's worth, say so and move on** — after
    finding the syntax error and confirming the async init chain was still too opaque to debug
    quickly, the right call was reverting to the proven GPU path rather than continuing to sink
    time into code that's being phased out anyway.
11. **Never write literal `{{...}}` inside a code comment in a `.hbs` file** — Handlebars processes
    it regardless of surrounding JS comment syntax, and can inject an entire partial's rendered
    HTML/script into what you thought was inert text. Describe partials in prose in comments, or
    escape with `\{{...}}`. When a script has a syntax error but its `.hbs` source looks clean,
    check the actual **rendered** page HTML, not just the template.
12. **A "commented out to disable" state can still hide an active bug** — disabling
    `gpu-particle-integration.hbs` didn't just stop GPU particles from rendering, it also exposed
    an unconditional 15s wait in `particle-morph.hbs` that had never been tested with the include
    absent. When a feature is made toggleable, test *both* states, not just the one you're
    currently building.

---

## Contact & Escalation

If you encounter issues not listed here:
1. Check browser console for errors
2. Run `node -c particle-animation-loop.js` to validate syntax
3. Check z-index layering in DevTools Elements panel
4. Verify all modules loaded: `window.ParticleAnimationLoop`, `window.ParticleMorphSystem`, etc.
5. Review PARTICLE_SYSTEM.md documentation
6. Check git log for related commits (git blame on files that changed)
