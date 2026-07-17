# Common Issues & Solutions

## Particle System & Morphing

### Triple-Sphere Morph Not Appearing
**Problem**: Operating model systems category wasn't morphing to triple-sphere particles.
**Root Cause**: Shape name in HTML was `data-morph-shape="cube"` but the GPU particle system's shape registry only has `"triple-sphere"`.
**Solution**: Change HTML attribute to `data-morph-shape="triple-sphere"` and ensure shape is preloaded in gpu-particle-integration.hbs
**Files**: 
- operating-model-stacked.hbs (line 63)
- gpu-particle-integration.hbs (preloadShapes array)

### Footer Helix Morph Not Triggering
**Problem**: Footer scroll trigger wasn't morphing particles to helix.
**Root Cause**: Used ScrollTrigger instead of IntersectionObserver; also GPU system lacked `morphTo()` compatibility method.
**Solution**: 
1. Replace ScrollTrigger with IntersectionObserver (matches hero/testimonials pattern)
2. Add `morphTo(shapeName, durationMs)` method to GPUParticleSystem as wrapper around `setMorphTarget()`
**Files**:
- particle-morph.hbs (footer trigger section ~line 297)
- gpu-particle-system.js (line 225, added morphTo method)

### Hero Helix Being Overridden by Operating Model Pre-Pin
**Problem**: Scroll up to hero → helix morphs correctly, but after a moment it flips to sphere.
**Root Cause**: Operating model's pre-pin timeline had hardcoded `morphTo('sphere')` at line 226, immediately overwriting hero's helix when section enters.
**Solution**: Remove sphere morph from pre-pin timeline. Let main pinned timeline handle morphing when operating model fully engages.
**Files**: 
- operating-model-stacked.hbs (line 221-227: removed pre-pin sphere morph)
- particle-morph.hbs (line 78-121: scroll triggers with explicit start/end to prevent overlap)

> **Recurred** after the pre-pin timeline itself was removed entirely (see "Operating Model
> Overlapped Previous Section" in `PARTICLE_SYSTEM_ISSUES.md` / this file's operating-model
> entries) — same symptom, new mechanism. The pinned master timeline's `tl.call(() => morphTo(...),
> null, tS)` for category 0 (tS=0, shape "sphere") fires whenever the *scrubbed* timeline's
> playhead crosses time 0 — which happens both when genuinely entering category 0 **and** when
> scrolling up fast enough to exit the pin entirely. Because `scrub: 1` eases the playhead toward
> the scroll-driven target with ~1s of lag, a fast scroll up past hero fires hero's own
> `onLeaveBack: helix` instantly, while operating-model's eased playhead is still catching up
> toward 0 — arriving, and re-firing `sphere`, a moment *after* helix already displayed. Confirmed
> via Playwright by reading `ScrollTrigger.getById('om-stacked').animation.progress()` every 300ms
> during a fast up-scroll: it eased from ~0.2 down to 0 over ~1.2s, exactly the "moment" of delay
> described.
>
> **Fix**: guard the morph call with the trigger's own `isActive` flag (true only while genuinely
> within the pin's start/end range), so a call arriving after the eased scrub catches up post-exit
> is dropped:
> ```javascript
> tl.call(() => {
>   if (!scrollTriggerInstance?.isActive) return; // scrub catching up after we've already left
>   window.particleSystem?.morphTo?.(morphShape, 400);
> }, null, tS);
> ```
> **File**: operating-model-stacked.hbs (morph `tl.call`, ~line 246)
>
> **General lesson**: any `tl.call()` on a `scrub`-driven timeline fires whenever the *eased*
> playhead crosses that position, in either direction, including *after* you've scrolled past the
> trigger's actual active range — not just on the scroll frame where the raw scroll position first
> reaches it. If the call has a real-world side effect (like overriding a shared, page-wide
> particle system that other sections also drive), guard it against the trigger's `isActive` state.

### Follow-up: Category 0's Own Sphere Morph Stopped Firing On Re-Entry
**Problem**: after the `isActive` guard above, scrolling down into operating-model's first slide
(Products) correctly morphed to sphere the first time — but exiting (scrolling up past hero) and
then scrolling back down into Products again, sphere no longer morphed at all. Categories 1 and 2
(Systems/Teams) were unaffected; only the first slide.

**Root Cause**: not a new bug introduced by the `isActive` guard — a pre-existing GSAP quirk that
guard *unmasked*. `tl.call()` at position `tS=0` (category 0's slot) sits exactly at the timeline's
natural rest position once fully exited (the eased scrub settles at progress 0 on exit). Re-entering
by scrolling forward from that exact resting point isn't treated as a fresh "crossing" the way
categories 1/2 are (`tS=0.333`/`0.666`, genuine interior positions the scrub never rests at). Before
the `isActive` fix, this was masked: the spurious exit-time re-fire (the original bug) happened to
leave the shape on sphere already, so the "missing" re-entry fire went unnoticed. Confirmed with
Playwright: enter (sphere fires, logged) → exit (no fire, correct) → re-enter (isActive and
progress both correctly read as "entered again," but `tl.call`'s own log never appeared).

**Solution**: fire category 0's morph from the pin `ScrollTrigger`'s own `onEnter` callback instead
of relying on `tl.call()` for that one category — `onEnter` reliably fires on every genuine forward
entry, unaffected by this scrub-rest quirk:
```javascript
const morph0 = cats[0]?.getAttribute('data-morph-shape');
ScrollTrigger.create({
  // ...
  onEnter: () => {
    window.particleSystem?.morphTo?.(morph0, 400);
  },
});
```
Categories 1/2 keep firing from `tl.call()` as before — they don't have this issue. (On a genuine
first-ever entry both `onEnter` and `tl.call` fire for category 0, calling `morphTo('sphere', ...)`
twice back-to-back; harmless, same shape/duration.)

**File**: operating-model-stacked.hbs (pin `ScrollTrigger.create`, `onEnter`)

**General lesson**: a `scrub`-driven timeline has exactly two "rest positions" — progress 0 (fully
exited above) and progress 1 (fully exited below). Any `tl.call()`/label placed at exactly one of
those two positions is unreliable for "did we just (re-)enter" logic, because re-approaching from
rest isn't a crossing. Interior positions don't have this problem. Prefer the pin `ScrollTrigger`'s
own `onEnter`/`onEnterBack`/`onLeave`/`onLeaveBack` for anything that must fire reliably on every
genuine entry/exit; reserve `tl.call()` on the scrubbed timeline for progression *within* an
already-active pin.

### Follow-up: Scrolling Back Up Out of a Later Category Didn't Restore the Previous One's Shape
**Problem**: scrolling down through operating-model correctly morphs sphere → triple-sphere →
torus across Products/Systems/Teams. Scrolling back **up** out of Systems into Products should
morph back to sphere — it didn't; triple-sphere stayed showing. Same for Teams → Systems reverse.

**Root Cause**: `tl.call()` at each category's start position (`tS = i*dur`) fires whenever the
playhead crosses that exact time, in *either* direction — it has no built-in notion of "entering
category i" vs. "leaving category i back into i-1." Scrolling down across `tS_i` genuinely means
entering category i (correct: fire shape i). Scrolling up across that same `tS_i` means you've just
left category i and landed back in category i-1's range — but the call positioned there always
fires category i's *own* shape regardless of direction, so leaving Systems (crossing `tS_1=0.333`
backward) re-asserted triple-sphere instead of showing sphere. Confirmed with Playwright: scrolled
down into Systems (triple-sphere fires, correct), then back up into Products' range — logged morph
was triple-sphere again, not sphere.

**Solution**: check `scrollTriggerInstance.direction` (GSAP's own `1`=forward/down, `-1`=backward/up,
computed from real scroll delta — not the eased scrub's internal state) inside the call, and use the
*previous* category's shape when crossing backward:
```javascript
tl.call(() => {
  if (!scrollTriggerInstance?.isActive) return;
  const goingBackward = scrollTriggerInstance.direction === -1;
  const shape = (goingBackward && i > 0) ? cats[i - 1].getAttribute('data-morph-shape') : morphShape;
  window.particleSystem?.morphTo?.(shape, 400);
}, null, tS);
```
Category 0 (`i === 0`) is excluded from the backward branch — there's no category -1; backward-
crossing its own `tS=0` means fully exiting the pin, already handled by the `isActive` guard and
`onLeaveBack`/hero's own trigger.

**File**: operating-model-stacked.hbs (morph `tl.call`, ~line 255)

Verified both directions with Playwright: Systems→Products reverse now logs `sphere ... (backward →
previous category)`; Teams→Systems reverse logs `triple-sphere ... (backward → previous category)`.

**General lesson**: a `tl.call()`/label shared by both scroll directions needs to know which
direction it's being crossed in if "entering" and "leaving" mean different things semantically (as
they do for a carousel where each position represents a distinct state, not just a triggerable
moment). `ScrollTrigger.direction` is the ground-truth signal for this — cheap to check, and
accurate on every crossing regardless of how far behind the eased scrub is.

### Post-Card Morphing Not Re-Triggering on Subsequent Scrolls + GPU Final Dispatch Bug
**Problem**: First scroll down → globe morphs ✓, diamond morphs ✓. Scroll back up → helix ✓. Scroll down again → only diamond ✗, globe INVISIBLE ✗.

**Root Causes (4 issues combined)**:
1. `hasAnimated` flag in card-animations.js never reset after first animation
2. Morph queue could have duplicate entries, causing state confusion  
3. pickBestAndMorph() was interrupting in-progress morphs with competing requests
4. **CRITICAL**: `morphProgress` reset to 0 in `_completeMorph()` BEFORE final GPU dispatch, so particles never reached final shape

**Solution**: 
1. Reset `hasAnimated = false` when cards leave viewport
2. Add dedup check in requestMorph() to prevent duplicate queues
3. Add morph-blocking in pickBestAndMorph() to not request during morphs
4. **Remove morphProgress reset from _completeMorph()** — keep it at 1.0 for final dispatch

**Files Modified**:
- card-animations.js (line 104-108: reset flag on exit)
- gpu-morph-controller.js (line 35-42: dedup check)
- main.js (line 2510-2513: skip morph if one is already morphing)
- **gpu-particle-state.js (line 103: removed `this.morphProgress = 0;`)**

**Why the GPU dispatch bug is critical:**

The animation loop order:
```javascript
morphController.update(deltaTime);    // ← Line A: Sets morphProgress, calls _completeMorph()
_updateFrame(deltaTime);              // ← Line B: GPU dispatch with current morphProgress
renderer.render();                    // ← Line C: Render particles
```

**Before fix (BROKEN):**
1. Line A: morphProgress reaches 1.0 → _completeMorph() immediately resets to 0
2. Line B: Dispatch compute shader with morphProgress = 0
3. Shader does: `mix(pos, targetPos, 0.0) = pos` ← NO CHANGE!
4. Line C: Particles render at 99% position (incomplete morph)

**After fix (CORRECT):**
1. Line A: morphProgress reaches 1.0 → _completeMorph() does NOT reset it
2. Line B: Dispatch compute shader with morphProgress = 1.0
3. Shader does: `mix(pos, targetPos, 1.0) = targetPos` ← FINAL POSITION!
4. Line C: Particles render at final shape position ✓
5. Next morph: setTargetShape() resets morphProgress = 0 for new morph

**Before (3 bugs combined):**
```javascript
// ❌ BUG 1: hasAnimated never resets in card-animations.js
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && !hasAnimated) {
      hasAnimated = true;  // Never reset!
      this.playCardAnimation(card, index);
    }
  });
});

// ❌ BUG 2: Duplicate morphs stack in queue (gpu-morph-controller.js)
async requestMorph(targetShapeName, duration = 1.0) {
  // No check for duplicate shapes already in morphQueue
  this.morphQueue = [{ targetShape: targetShapeName, ... }];
}

// ❌ BUG 3: pickBestAndMorph interrupts in-progress morphs (main.js)
function pickBestAndMorph() {
  // Called on EVERY threshold crossing (11 thresholds!)
  // No check if a morph is already in progress
  if (bestCard && bestCard !== currentCard) {
    sys.morphTo(targetShape, 400);  // Interrupt immediately
  }
}
```

**After (all 3 fixed):**
```javascript
// ✅ FIX 1: Reset hasAnimated when card leaves viewport
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && !hasAnimated) {
      hasAnimated = true;
      this.playCardAnimation(card, index);
    } else if (!entry.isIntersecting) {
      hasAnimated = false;  // ← Cards can now re-animate
    }
  });
});

// ✅ FIX 2: Dedup shapes already queued
async requestMorph(targetShapeName, duration = 1.0) {
  if (this.morphQueue.length > 0) {
    const lastQueued = this.morphQueue[this.morphQueue.length - 1];
    if (lastQueued.targetShape === targetShapeName) {
      console.log(`Already queued: ${targetShapeName}`);
      return;  // ← Skip duplicate
    }
  }
  // ... normal flow
}

// ✅ FIX 3: Don't interrupt an in-progress morph
function pickBestAndMorph() {
  if (sys && sys.morphController && sys.morphController.isMorphing()) {
    return;  // ← Let current morph finish before requesting next
  }
  if (bestCard && bestCard !== currentCard) {
    sys.morphTo(targetShape, 400);
  }
}
```

**Why the combination matters:**
- Fix 1 alone: Cards can animate again, but globe morph might still get cut off
- Fix 2 alone: No duplicate queues, but diamond can still interrupt globe
- Fix 3 alone: No interruption, but if cards don't re-animate, they won't appear

All three work together to ensure:
1. Cards animate when they enter the viewport (every time)
2. Morph requests don't stack duplicates
3. In-progress morphs complete uninterrupted, then the next morph starts

**What Was Broken:**
```javascript
// ❌ BEFORE: Pre-pin hardcoded sphere, overwriting helix
const preTl = gsap.timeline({ paused: true });
preTl.call(() => {
  window.particleSystem?.morphTo?.('sphere', 400);  // Overwrites hero's helix!
}, null, 0);
```

**What's Fixed:**
```javascript
// ✅ AFTER: Pre-pin only animates cards, main timeline handles morphing
const preTl = gsap.timeline({ paused: true });
// Pre-pin handles only card animations — particle morph happens in main timeline
```

**Trigger Boundaries (prevent overlap):**
```javascript
// Hero: fires when scrolling UP past hero
ScrollTrigger.create({
  trigger: hero,
  start: 'bottom center',  // Hero bottom at viewport center
  end: 'bottom top',       // Hero bottom at viewport top
  onLeaveBack: () => gpu.morphTo('helix', 400)
});

// Operating Model: fires when scrolling DOWN into it (doesn't interfere with hero)
ScrollTrigger.create({
  trigger: operatingModel,
  start: 'top center',     // OM top at viewport center
  end: 'top top',          // OM top at viewport top
  onEnter: () => gpu.morphTo('sphere', 400)
});
```

> **Recurred** with a different exact symptom: globe (card 1) morphs correctly on the first
> down-scroll, correctly re-morphs when scrolling back up through it, but is silently **skipped**
> on a second down-scroll pass (jumps straight to diamond). Root cause this time was in
> `main.js`'s `pickBestAndMorph()`: `currentCard` (the "don't re-morph to the same card" cache)
> was only ever reset to `null` on one specific boundary — scrolling up while intersecting the
> footer (`isScrollingUp && inHelixState`). Leaving the cards by scrolling up past the *top* (back
> toward hero) never reset it. So: scroll down (globe→diamond, `currentCard`=diamond), scroll up
> (back to globe, `currentCard`=globe), scroll up further into hero, scroll back down — card 1
> re-enters, `bestCard === currentCard` is still true from the earlier visit, and the morph is
> skipped entirely; only card 2 (which now differs from the stale cache) fires.
>
> **Fix**: reset `currentCard = null` whenever no card is meaningfully visible (`maxRatio <= 0.1`),
> not just at the specific footer boundary — this covers leaving via *either* end of the card list:
> ```javascript
> if (!bestCard || maxRatio <= 0.1) {
>   currentCard = null;
>   return;
> }
> ```
> **File**: main.js (`pickBestAndMorph()`, ~line 2507)
>
> Verified with a full Playwright round trip (globe → diamond → scroll to hero → globe → diamond
> again): all four card morphs now fire in the log, where previously the second `globe` would be
> missing.
>
> **General lesson**: a "reset the cache on the way out" boundary condition needs to cover *every*
> way out, not just the one you tested. If a similar "already handled this" cache exists elsewhere
> in this codebase, check it resets on all exit paths, not just the one exercised when the fix was
> originally written.

---

### Particles Stuck on `dispersed` Instead of `helix` After a Full Preloader Run (Production)
**Problem**: on a genuine first-time visit — the full preloader sequence (wordmark + fade-out),
not the refresh/skip path — particles never morphed to `helix` once the preloader faded away and
hero was revealed. Refreshing the page (skip path) always worked correctly.

**Root Cause**: `preloader.js` sets `localStorage.setItem('preloader_seen', '1')` synchronously at
the very top of its IIFE, before any other script runs — so by the time `particle-morph.hbs`
checks `localStorage.getItem('preloader_seen') ? 0 : 500` to decide its own init delay, the flag
is already set on *both* first visits and refreshes. That means its scheduled helix morph
(`scheduleHelixMorph()`, firing ~200-700ms after init) runs almost immediately on a first visit
too — long before the preloader's multi-second wordmark sequence has finished.

On a full run only, `preloader.js`'s own `_runParticles()` later forces
`sys.morphTo('dispersed', 0)` partway through its timeline, as part of a "burst" reveal effect —
silently overriding that earlier helix morph. Nothing re-applied `helix` after the burst+settle
animation completed, so the preloader faded away leaving particles stuck on `dispersed`. The
refresh/skip path never runs `_runParticles()` at all (it returns early before the full-run
timeline is even built — see `preloader.js:17-28`), so nothing overrides the early helix morph
there, which is exactly why only the full-run path broke.

**Solution**: morph back to `helix` right after the burst+settle animation completes in
`_runParticles()`, before the preloader fades out — so both paths converge on the same final
state instead of relying on an early morph call that a later step can silently clobber:
```javascript
sys.loop.startPreloaderGlobeIntro({ burstMs, settleMs: 900, overshoot: 0.5, oscillations: 2 })
  .then(() => {
    sys.morphTo('helix', 600); // ← added: restore helix before reveal
    // ...existing preloader fade-out...
  });
```
**File**: `assets/js/preloader.js` (`_runParticles()`, burst+settle `.then()` callback)

Verified with an isolated fresh Playwright browser context (genuine first visit, no
`preloader_seen` pre-set in `localStorage`) that `window.particleSystem`'s `currentState.id`
is `"helix"` after the full preloader sequence completes.

**General lesson**: when two independent code paths (a full first-run sequence vs. a cached
refresh) are supposed to converge on the same visual end state, don't rely on an early trigger
that fires on both paths equally — a later step unique to *one* path can silently override it on
that path only, and the bug will only reproduce there. Set the final state explicitly at the true
end of the longer path, not just at the first opportunity.

---

### Lab Grid Morph Firing While Scrolling Through `posts-tabs`, Not `work-grid-lab`
**Problem**: `#work-grid-lab`'s (Lab section) `morphTo('lab', 400)` trigger consistently fired while
the `posts-tabs` (`#work`) card carousel was still on screen — roughly a full pinned-section's worth
of scroll too early. Debug logging showed `rect.top` at fire time was ~13,000px (should be close to
`viewportH * 0.7` for a `start: 'top 70%'` `ScrollTrigger`).

**Root Cause (three layered issues)**:
1. **Async content growth above the trigger, no refresh.** `post-and-cards.js` (`posts-tabs`) and
   `posts-tabs-grid.js` (`work-grid-lab`'s own grid) both inject metadata (titles, bullets,
   category text, `card-description-statement` sections) via per-card `fetch()` calls that resolve
   at unpredictable times *after* the page's `ScrollTrigger`s were already created — growing those
   sections' height without ever calling `ScrollTrigger.refresh()`, leaving every downstream
   trigger's cached pixel `start` stale.
2. **`om-stacked`'s pin reserves/changes a large scroll buffer** (`totalScroll`, via `pinSpacing`)
   and rebuilds itself three times (initial load, `fonts.ready`, a 1000ms settle fallback) — each
   rebuild can change that reserved height, further invalidating any trigger positioned below it
   (`#work-grid-lab`'s stale offset was short by almost exactly `om-stacked`'s `totalScroll`).
3. **A crash was silently aborting every refresh anyway.** `ScrollTrigger.refresh()` internally
   calls each registered trigger's `onUpdate` in a `forEach` loop. One of those (`scroll-scrub-anim.js`'s
   `invertParticles` → `particle-morph-system.js` → `particle-animation-loop.js`'s `setColors`) was
   doing `geo.attributes.color.updateRange = { offset, count }` — a property that's **getter-only**
   in modern Three.js (`BufferAttribute.updateRange` was replaced by `addUpdateRange()`). Setting it
   threw `TypeError: Cannot set property updateRange of #<Mi> which has only a getter`, which
   **aborted the `forEach` before it reached any trigger registered after it** — so even the
   `refresh()` calls we added in (1)/(2) never actually reached `#work-grid-lab`.

**Solution**:
1. Removed the illegal `updateRange` assignment in `particle-animation-loop.js` — `needsUpdate = true`
   alone already re-uploads the full buffer; the extra line was unnecessary and crashing.
2. Added `ScrollTrigger.refresh()` after each async metadata-driven layout change (`post-and-cards.js`'s
   `reInitializeCardAnimations()`, `posts-tabs-grid.js`'s debounced `scheduleRefresh()`) and after
   every `om-stacked` rebuild (`rebuildOperatingModelStacked()`).
3. **Root fix**: replaced `#work-grid-lab`'s `ScrollTrigger.create({ start: 'top 70%' })` with an
   `IntersectionObserver` (same pattern already used for the hero/helix trigger). Given how many
   independent async scripts on this page can change layout at unpredictable times, no number of
   scattered `refresh()` calls can be guaranteed to run *before* the user scrolls past a stale
   cached position — `IntersectionObserver` has no cached offset to go stale in the first place; it
   re-checks live geometry every frame.
```javascript
let labEntered = false;
const labObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && !labEntered) {
      labEntered = true;
      doLabMorph(); // system.morphTo('lab', 400), with GLB-ready wait
    } else if (!entry.isIntersecting) {
      labEntered = false;
    }
  });
}, { rootMargin: '0px', threshold: 0 }); // fires as soon as the section starts entering the viewport
labObserver.observe(document.getElementById('work-grid-lab'));
```
**Files**:
- `assets/js/particle-animation-loop.js` (line ~265: removed `updateRange` assignment)
- `assets/js/post-and-cards.js` (`reInitializeCardAnimations()`: added `ScrollTrigger.refresh()`)
- `assets/js/posts-tabs-grid.js` (debounced `scheduleRefresh()` calling `ScrollTrigger.refresh()`)
- `partials/operating-model-stacked.hbs` (`rebuildOperatingModelStacked()`: added `ScrollTrigger.refresh()`)
- `partials/particle-morph.hbs` (`#work-grid-lab` trigger: `ScrollTrigger` → `IntersectionObserver`)

**General lesson**: on a page with many independent scripts that can each grow/shrink layout at
unpredictable times (async metadata fetches, font swaps, self-rebuilding pinned sections), prefer
`IntersectionObserver` for one-shot "has this section been reached" triggers over a cached-pixel
`ScrollTrigger`. If you must use `ScrollTrigger`, remember `refresh()` runs every registered
trigger's `onUpdate` synchronously in one pass — an unrelated exception thrown by *any* of them
(e.g. from a deprecated third-party API like `BufferAttribute.updateRange`) silently aborts refresh
for every trigger registered after it, with no visible symptom other than "positions are stale for
no apparent reason." Check the console for uncaught errors during scroll before assuming a pure
timing/ordering bug.

---

## Theme & Flash Prevention

### White/Dark Flash on Page Load (Theme Blink)
**Problem**: Page flashes white (or wrong theme color) on load, then correct theme appears.
**Root Cause**: Theme CSS loads asynchronously after DOM paints; browser renders white default background first.
**Solution**: 
1. Inline theme detection script in `<head>` (runs before body paints)
2. Detect theme from localStorage or `prefers-color-scheme` synchronously
3. Set background color immediately via `document.documentElement.style.backgroundColor`
4. Set `data-theme` attribute and meta tags for browser chrome
5. Add defensive fallback CSS for the theme colors
**Files**:
- default.hbs (lines 6-46: inline script, lines 48-56: fallback CSS)

**Key Pattern:**
```javascript
// In <head>, before CSS/body loads
var saved = localStorage.getItem('theme-preference');
var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
var theme = saved !== null ? saved : (prefersDark ? 'dark' : 'light');
var bg = (theme === 'light') ? '#F1F3F9' : '#272733';
document.documentElement.style.backgroundColor = bg;  // Set immediately
```

### Stale Anti-Flash Hex After Changing --color-background (Dark Band Over Hero)
**Problem**: After retuning `--color-background` (#1c1c1c → #272733), a "weird black background" covered the hero region, scrolling with content, its bottom edge tracking `.page-content-wrapper`.
**Root Cause**: Two facts combined. (1) `.page-content-wrapper`'s `margin-top: 100vh` margin-collapses through `main`/`section.home`/`body`, so `<body>`'s paint area starts ~one viewport down — the hero region is painted by `<html>` alone. (2) The head anti-flash script sets an **inline** background on `<html>` from its own hardcoded hex table, which still said `#1c1c1c`; inline style beats the stylesheet's `var(--color-background)` forever. Invisible while token and table matched; exposed the moment the token changed. (`<body>` escaped only because the script runs in `<head>` where `document.body` is null.)
**Solution**: The anti-flash hexes are *deliberate* pre-CSS copies of `--color-background` — changing that token **always** requires updating them: `THEME_BG` in default.hbs's head script, the `<style>` fallback block below it, `<meta name="theme-color">`, and theme.js's fallback table.
**Files**: default.hbs (head script + fallback style + meta), theme.js (~line 82), tokens.css (`--color-background`)

### Theme Toggle Icon Shows the OPPOSITE Theme (and Its CSS Opacity Rules Are Dead)
**Problem**: A fix targeting `[data-theme='light'] .theme-icon-sun` was a silent no-op.
**Root Cause**: theme.js shows the icon of the theme you'd switch **to** — light mode displays the *moon*, dark mode the sun — via inline `display`. Separately, every CSS `opacity: 0/1` show/hide rule for these icons is dead: the shared `opacity: 1 !important` (GSAP isolation) overrides them all, so inline `display` is the only real visibility gate.
**Solution**: Style **both** icons for any state-dependent treatment; never rely on the CSS opacity rules to know which is visible.
**Files**: theme.js (`updateThemeIcon()`), main.css (theme-icon rules)

---

## Gradients & Layering

### Post Card Gradients Not Visible
**Problem**: Gradient-layer.js was creating gradient divs but they were invisible.
**Root Cause**: `.page-gradient-bg` had `z-index: -1` (behind all content) and `background: #1c1c1c` (covering gradient divs).
**Solution**: 
1. Change `z-index: -1` to `z-index: 10` (above content, below modals)
2. Change `background: #1c1c1c` to `background: transparent`
**Files**:
- main.css (line 38, .page-gradient-bg)

### Gradients Not Loading from Metadata
**Problem**: Gradient-layer.js initialized before projectMetaArray was populated.
**Root Cause**: Timing issue - script ran before wire-meta finished setting up card metadata.
**Solution**: Move initialization to immediate call (wire-meta is synchronous) instead of waiting for event/timeout
**Files**:
- gradient-layer.js (initGradients function)

### macOS Rubber-Band Overscroll Revealed Opaque-Black Particle Canvas
**Problem**: Scrolling past the page edge on a Mac trackpad revealed a black background — with particles visible in it — behind the page.
**Root Cause**: In dark mode the THREE.js canvas is deliberately cleared **opaque black** with `mix-blend-mode: screen` on its container (black is neutral for screen; it's what makes bloom composite additively). During rubber-band the scrolling content slides out from under the fixed canvas, the blend loses its backdrop, and the raw black buffer shows.
**Solution**: Fixed full-viewport `#page-backdrop` div painting `var(--color-background)` behind all content — a backdrop that can't rubber-band away, token-driven so theme changes flow through automatically.
**Files**: default.hbs (`#page-backdrop`), main.css (`.page-backdrop`), particle-morph.hbs (theme patch: opaque-black + screen rationale)

### Negative z-index Paints BELOW In-Flow Backgrounds (Opaque Body Silently Hid the Backdrop Blend)
**Problem**: `#page-backdrop` (z-index: -1) was given a scroll-driven `color-mix()` blend; computed styles showed it blending, but the page never changed color.
**Root Cause**: CSS paint order puts negative-z-index descendants **after the root background but before in-flow block backgrounds** — `<body>`'s opaque background painted on top of the backdrop, hiding it entirely. (The "tint" seen in early screenshots was actually particle-bloom screen-glow, not the blend — verify with pixels, not just computed styles.)
**Solution**: `<body>` background is now `transparent` **on purpose**; `<html>` carries the anti-flash color and `#page-backdrop` paints the (shiftable) page background. Never reintroduce a body background — CSS *or* inline via JS (theme.js used to set one on toggle; it now clears any stale inline value instead).
**Files**: main.css (body rule), default.hbs (fallback style block), theme.js (setTheme)

### SUPERSEDED (2026-07-17): Dual Particle Pipeline Removed — One Transparent Pipeline, In-Sprite Glow
**Change**: `UnrealBloomPass` is gone (BLOOM_ENABLED=false and the glow reimplemented as an in-sprite halo in the fragment shader — additive blending accumulates overlapping soft sprites into haze; the DNA-Capital technique). With bloom gone, the opaque-black-canvas + `mix-blend-mode:screen` dark pipeline lost its reason to exist, so BOTH themes now render on one pipeline: transparent canvas, normal element compositing, at every shift value.
**Consequences**: the 0.65 shift-threshold pipeline flip, the black-flash ordering invariant/bridge frame, the composer interceptor getters, and the canvas opacity dip are all REMOVED (entries above/below describing them are historical). The macOS rubber-band opaque-black exposure is now structurally impossible (no opaque buffer exists) — `#page-backdrop` remains for the palette shift. Morphs also moved to the GPU (`aTargetPos` + `uMorphProgress` vertex mix; one upload per morph instead of per frame), with an interrupt bake so a new morph departs from what's visibly on screen — the fix for half-finished-shape artifacts on slow machines. Low-end devices (`__lowEndDevice`, now including a pre-2017 Intel iGPU renderer-string check) get dpr 1, no halo, 1x sprites, 1800 particles.
**Files**: particle-animation-loop.js, particle-morph.hbs (theme patch), device-capability.js

---

## Animations

### Profile Description Spans Not Staggering
**Problem**: Span animation delay wasn't visible; spans appeared together instead of staggered.
**Root Cause**: Animation started too late (only when profile section entered viewport).
**Solution**: Add scroll-triggered animation that starts earlier via ScrollTrigger (bottom 0% to top 50%)
**Files**:
- scroll-scrub-anim.js (line ~195, profile description spans animation)

### Profile Spans Animation Child Selection Failed
**Problem**: Profile description span animations weren't being selected by scroll-scrub-anim.
**Root Cause**: Condition in initDataAnimateElements was skipping profile description spans
**Solution**: Change condition from `!el.matches('.profile-description')` to also allow `!el.closest('.profile-description')`
**Files**:
- scroll-scrub-anim.js (line 242, profile element filtering)

### Operating Model Cards Visible Before Animation
**Problem**: First category cards appeared before pre-pin animation started.
**Root Cause**: Main timeline AND pre-pin timeline both animating same cards, causing conflict.
**Solution**: Skip first category (cards 0) in main timeline - let pre-pin handle it exclusively
**Files**:
- operating-model-stacked.hbs (line 196, card animation loop)

> **Superseded** — the pre-pin timeline this entry refers to was removed entirely; see "Operating Model Overlapped Previous Section" below. Category 0's cards are now animated *inside* the main pinned timeline, not skipped from it.

---

### Operating Model Overlapped Previous Section (posts-tabs) on Scroll-In
**Problem**: Moving operating-model-stacked to appear after posts-tabs caused: overlap (both sections' content visible on screen together), first category's header/cards not appearing animated (already fully opaque), a "jump" feel right as pinning engaged.

**Root Cause (two attempts before the real fix):**
1. First attempt: the pre-pin ScrollTrigger's `start` was computed from `scrollPerCat` (a constant that paces the *carousel*, unrelated to viewport visibility) — `top ${100 + scrollPerCat/VH*100}%`. This started the reveal ~2.5 viewport-heights before the section was even on screen, so it finished (fully opaque) while still invisible.
2. Second attempt: changed `start` to `'top bottom'` (the section's own natural viewport-entry point). Looked correct, but proven wrong by adding `onEnter`/`onLeave` logging to the pre-pin trigger plus enter/exit logging to the *previous* section's own per-card `IntersectionObserver` (`card-animations.js`), then driving a real stepped scroll and diffing the console order:
   ```
   [card-anim] ENTER card 2 (gala-defi) at 4720
   [om-stacked] PRE-PIN ENTER at 5040        ← reveal starts
   [card-anim] EXIT card 2 (gala-defi) at 5800   ← previous card still visible 760px later
   ```
   Because this section shares a zero-gap document boundary with whatever precedes it, "this section's top touches the viewport bottom" and "the previous section's content is fully gone" are never the same scroll position — the previous section's own IntersectionObserver-based card reveal can hold content on screen for an arbitrary, unknowable-from-here amount of extra scroll.

**Solution**: Delete the separate pre-pin timeline/ScrollTrigger entirely. Animate category 0's header/cards *inside* the main pinned timeline (`tl`) at time 0, exactly like categories 1 and 2 — remove the `if (i > 0)` skip. Pinning guarantees the section already fully occupies the viewport before any reveal can play, so the overlap is structurally impossible rather than just retimed.

**Files**:
- operating-model-stacked.hbs (removed `preTl` + its `ScrollTrigger.create`; cards loop no longer skips `i === 0`)

**General lesson**: for a section whose predecessor's on-screen duration is variable (a scale-focus card, an IntersectionObserver-driven reveal, anything not a fixed height), a pre-pin reveal timed against *this* section's own geometry can never fully rule out overlap — the overlap is caused by the *other* section's content, not this section's timing relative to itself. Defer the reveal to a state that guarantees exclusivity (pin engaged) rather than one that merely correlates with it (natural viewport entry).

---

### Operating Model Desynced After Window Resize / On Page Load
**Problem**: After a real window resize, operating-model-stacked's pin position and card slide-in offsets went stale (content "jumped below post cards"). Separately, the same desync happened on a fresh page load/refresh with no resize at all — but a single manual resize afterward fixed it.

**Root Cause**: `VW`/`VH` are captured once (`const VW = window.innerWidth`) and baked as plain numbers into the pin's `end: '+=${totalScroll}'` string and every card/header's `x: VW` off-screen offset. `ScrollTrigger.refresh()` — including GSAP's own automatic refresh-on-resize, and a redundant manual `resize` → `ScrollTrigger.refresh()` listener this file also had — only re-measures the *trigger element's* live position; it never re-runs the JS that computed `totalScroll`, and never touches numbers already baked into a tween. So after a resize, the pin's duration and cards' offsets stay locked to the *old* viewport size while only the start position updates — a mismatch.

The load-time version of the same bug: the initial build runs on `window.load`, which guarantees images have loaded but *not* that custom `@font-face` fonts have finished swapping in (common with `font-display: swap`). If the real font's metrics differ from the fallback, text above this section reflows *after* we've already measured and pinned it. A manual resize "fixed" it only because resize already forces a re-measure — by then fonts had settled.

**Solution**: Track the timeline + ScrollTrigger in module-level variables and route every entry point (initial load, resize, `document.fonts.ready`, plus a 1000ms fallback timer) through one `rebuildOperatingModelStacked(reason)` helper that always tears down (`.kill()` on both) before rebuilding, so every viewport-dependent number gets recomputed from scratch and there's never more than one live instance regardless of which trigger fires first:
```javascript
let scrollTriggerInstance = null, timelineInstance = null;
function teardown() { scrollTriggerInstance?.kill(); timelineInstance?.kill(); scrollTriggerInstance = timelineInstance = null; }
function rebuild(reason) { teardown(); initOperatingModelStacked(); }

window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => rebuild('resize'), 250); });
window.addEventListener('load', () => rebuild('initial load'), { once: true });
document.fonts?.ready?.then(() => rebuild('fonts ready'));
setTimeout(() => rebuild('settle fallback'), 1000);
```
**Files**:
- operating-model-stacked.hbs (teardown/rebuild helpers, resize/load/fonts.ready/fallback wiring)

**Also present in** (same `const VW`/`VH` + baked `totalScroll` pattern, not yet fixed):
- operating-model-v2.hbs (line 166-167, 180, 250) — currently unused/commented out in index.hbs, but has the identical latent bug if ever re-enabled
- operating-model.hbs (line 77) — has its own resize handler, not yet audited for the same rebuild treatment
- hero-sequence.hbs (line 543-547) — partially better: its resize handler recomputes total scroll fresh from `window.innerHeight`, but hasn't been audited for other stale baked values

**General lesson**: "a resize fixes it" is a strong diagnostic signal, not just a workaround — it means *some* async event settles layout after a ScrollTrigger measured it, and resize happens to be the one path that already forces a re-measure. Any pinned/scroll-scrubbed section with numbers derived from `window.innerWidth`/`innerHeight` at build time needs this teardown-and-rebuild treatment (or `invalidateOnRefresh: true` + function-based tween values) wired to *every* event that could invalidate those numbers — not just resize.

---

## Performance & Visibility

### Scroll Buffer Not Working  
**Problem**: Last operating model category didn't have pause/buffer after final section.
**Root Cause**: totalScroll needed to include scroll buffer but calculation was missing.
**Solution**: Add `const scrollBuffer = VH * 0.5;` and include in totalScroll calculation
**Files**:
- operating-model-stacked.hbs (line 154)

### Profile Headline Not Animating (Word-Reveal vs Scroll-Scrub Conflict)
**Problem**: Profile h2 remained blurred/invisible - conflict between two animation systems.
**Root Cause**: scroll-scrub-anim was skipping all profile elements by default.
**Solution**: Create intersection observer-based letter reveal in profile animation (initProfile) instead of relying on scroll-scrub
**Files**:
- scroll-scrub-anim.js (profile element handling)
- profile.hbs (headline animation via profile animation system)

### Dark-Mode Preloader ~2× Slower Than Light (13.8s vs 7s to page-ready)
**Problem**: Full preloader runs took ~13.8s in dark theme vs ~7s in light — "works in one theme, not the other" reports by pure timing.
**Root Cause**: NOT the `getLoopWhenReady()` poll originally blamed (the particle system is ready at ~1s in both themes — always instrument before trusting a trace). Dark mode renders with `UnrealBloomPass` (light mode disables the composer via the theme patch); on weak/software GL bloom tanks the RAF rate, and **every stage of the preloader's finish sequence is frame-driven** — burst ticks, GSAP fades, even the 8s safety `setTimeout` fired ~1.5s late from main-thread jank.
**Solution**: Defer `_initComposer()` until `preloader:done` on full preloader runs (20s fallback timer; `_composerInitStarted` guard). Preloader renders via the same cheap direct path in both themes; bloom kicks in at hero reveal. Measured: 13.8s → 7.5s.
**Files**: particle-animation-loop.js (constructor + `_initComposer`)

---

## Shape Loading

### Cube Shape Not Generating
**Problem**: Operating model systems category tried to morph to 'cube' but particles didn't change.
**Root Cause**: Shape-loader.js had 'cube' in proceduralShapes list but no generator function.
**Solution**: Add `_generateProceduralCube()` method and explicit handler in loadShape()
**Files**:
- shape-loader.js (line 186-188 handler, line 440+ cube generator function)

---

## Pattern Notes

### When to Use IntersectionObserver vs ScrollTrigger
- **IntersectionObserver**: Morph triggers (hero, testimonials, footer) - simpler, more reliable for "when section enters" logic
- **ScrollTrigger**: Smooth scroll-scrubbed animations driven by scroll position (profile spans, operating model timeline)

### GPU Particle System Compatibility
- Wrap methods with optional chaining: `window.particleSystem?.morphTo?.()`
- Add compatibility aliases on GPU system for old API methods (morphTo → setMorphTarget)
- Convert duration: milliseconds → seconds when wrapping

### Resize/Load-Safe ScrollTrigger Sections
- Never bake `window.innerWidth`/`innerHeight` into tween values or pin `end` distances as plain numbers — `ScrollTrigger.refresh()` re-measures trigger *positions*, it never re-runs the JS that derived those numbers.
- For any section with more than one or two viewport-derived numbers, wrap setup in an `init()` + `teardown()` pair (track the ScrollTrigger + timeline instances, `.kill()` both in teardown) and route every entry point — initial load, `resize`, `document.fonts.ready`, and a short fallback timer — through one `rebuild(reason)` helper that always tears down first. See "Operating Model Desynced After Window Resize / On Page Load" above.
- Don't add a redundant manual `resize` → `ScrollTrigger.refresh()` listener alongside GSAP's own built-in auto-refresh-on-resize — two refresh paths racing each other can cause visible pin flicker (`onEnter` → `onLeaveBack` → `onEnter` for the same physical scroll position).

### Z-Index Layering Strategy
- **-1 to -10**: Behind everything (don't use for visible effects)
- **1-10**: Above content, below modals (gradients, backgrounds)
- **100+**: Modals, overlays, UI

### ScrollTriggers Cache Absolute Pixel Positions — Sections That Grow After Load Desync Everything Below
- Several sections change height dynamically after load (operating-model-stacked's pause system extends its pinned range, posts-tabs-grid's per-card metadata fetches, font loading). Every pixel they grow shifts everything below, while already-created ScrollTriggers keep the positions they measured — firing early/partially/"randomly" until the next `ScrollTrigger.refresh()`.
- Point-fixes (debounced refresh in posts-tabs-grid.js) work but require every dynamic section to *remember* to refresh. For bindings that must always be exact, prefer **live geometry**: `getBoundingClientRect()` per rAF, driven by scroll + resize + a `ResizeObserver` on `<html>` and the section (the observer catches growth that happens without a scroll event). No cache, nothing to coordinate — see `background-layer.js`'s `bindShift()` (regression-tested by injecting +1500px above the profile post-load, no refresh: shift stayed exact).
- Same family as the older lesson: IntersectionObserver over ScrollTrigger for the lab morph trigger.

### Broken var() References Fail SILENTLY — the Whole Declaration Computes to Nothing
- A `var(--typo-name)` referencing an undefined property makes the declaration *invalid at computed-value time*: the property becomes `unset` — it does **not** fall back to earlier cascade rules. Found live: `var(--color-bg)` (modal background → transparent), `var(--color-on-surfac)`, `var(--space-mdbl)`/`var(--space-mdopera)` (margins → 0), `var(--radius-2xl)` (corners → square), plus value typos like `9n00px` and `100px`-for-`1000px`.
- Audit trick: diff every `var(--x)` used against every `--x:` defined across the CSS — `grep -rhoE 'var\(--[a-z0-9-]+' *.css` vs `grep -rhoE '^\s*--[a-z0-9-]+:' *.css`, `comm -23`. Fallbacks (`var(--x, y)`) mask missing tokens; grep for those separately.
- Related pattern: when a scroll/progress callback needs a not-yet-initialized system, **write the state (CSS var) unconditionally and guard only the side-effect call** — an early return that skips both leaves stale state if the user stops scrolling before the system is up (seen as a Firefox-only transient in `invertParticles()`).

---

## Testing Checklist Before Ship
- [ ] Hero → scroll up into helix morph, verify stays helix (not overridden by testimonials)
- [ ] Operating model → all three categories morph correctly (sphere → triple-sphere → torus)
- [ ] Footer → scroll to footer triggers helix morph
- [ ] Profile → description spans stagger in smoothly, headline reveals by letter
- [ ] Gradients → post cards show gradient backgrounds on trigger
- [ ] Scroll buffer → operating model has noticeable pause at end before unpinning
