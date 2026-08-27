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

### Particles Render as Fat Glowing Blobs Instead of a Fine Lattice After Closing a Post (2026-08-07)
**Problem**: after opening a project post and closing it back to the source page (the curtain-return
path), the particle object rendered as a dense, filled-in glowing mass instead of the intended crisp
dot lattice. Most visible on the Lab section ("Explorations, AI experiments"). It never recovered —
scrolling further did not fix it; only a full page reload did. A normal scroll to the same section
always looked correct.

**Root Cause**: `animate()` in `particle-animation-loop.js` had an early return —
`if (window.__particleLayerHidden) return;` — positioned *before* the morph-advance block. That block
does two things: advance `morphProgress`, and (on completion) run the handler that bakes the
destination into the position buffer and sets `currentState = nextState`.

The curtain return restores the previous scroll position **while the particle layer is hidden**, which
starts a morph inside exactly that window. With the advance gated off, `morphProgress` froze at
whatever partial value it had, and the completion handler never ran — so the state machine wedged
permanently mid-morph. What renders in that state is a literal 50/50 blend of two shapes.

Measured at the Lab section, same scroll position (2500), same viewport:

| | normal scroll | after curtain return |
|---|---|---|
| `currentState` | `terrain` | `dispersed` |
| `nextState` | `null` | `terrain` |

Half a dispersed cloud blended into half a terrain surface is precisely the "fat blob" appearance —
it is not a sizing, DPR, or shader-config problem.

**Solution**: extract the morph advance into `_advanceMorph()` and call it *before* the hidden gate,
alongside the two calls already documented as needing to run while hidden (`_checkHeroReentry()`,
`scrollDirector.checkShapesEvenWhileHidden()`) for the same "otherwise permanently stuck" reason:
```javascript
if (this.particles) this._checkHeroReentry();
if (this.scrollDirector) this.scrollDirector.checkShapesEvenWhileHidden();
this._advanceMorph();          // ← added: morphs must keep progressing while hidden
if (window.__particleLayerHidden) return;   // the expensive 16k-point DRAW stays skipped
```
Cheap enough to run unconditionally: one uniform write per frame plus a single buffer bake on
completion. The costly thing the gate protects — the draw call — is untouched.

**File**: `assets/js/particle-animation-loop.js` (`_advanceMorph()`, and its call site in `animate()`)

Verified with Playwright by comparing `currentState`/`nextState` at an identical scroll position on
both paths: after the fix the curtain return reports `terrain`/`null`, byte-identical to a normal
scroll. Regression-checked that ordinary scrolling still transitions
`ribbon-dispersed → terrain → grid` and settles with `nextState: null`.

**Two things ruled out first** (don't re-blame them): `uDprNorm`, `uSpriteScale`, `uGlowRadius`,
`sizeScale` and the renderer's pixel ratio were **identical** on both paths — the "thick blobby hexes"
comment in the uniforms block describes a *different*, already-fixed DPR bug and is not this. Also,
browser `goBack()` does **not** reproduce it; only the theme's own close control does, because that is
what triggers the scroll-restore-while-hidden sequence.

**General lesson**: a performance early-return that skips rendering must not also skip *state
progression*. Anything that advances a state machine — timers, morph progress, completion handlers —
has to run above such a gate, or the system can enter a state it can never leave. This file already had
two other calls hoisted above the same gate for exactly this reason; the morph advance was the one that
got missed. When adding a "skip work while hidden" optimisation, audit everything below it for
"does this need to keep ticking even when nothing is drawn?"

---

### Hero's "Surface" Stays Visible — `applyTheme` Races the Hide Fade (2026-08-08) ← THE REAL ONE
**Problem**: click Home, scroll immediately — the hero's `terrain` ground plane ("the surface") stays
on screen at full opacity instead of fading out. Waiting ~700ms before scrolling avoids it.

**Root Cause**: `applyTheme()` (particle-morph.hbs) forces the particle layer visible:

```javascript
if (!window.__particleLayerHidden) demo.style.opacity = '1';   // ← too weak a guard
```

`__particleLayerHidden` only flips true from the hide **timer**, ~700ms after a fade is armed
(`__particleApply`, default.hbs). For that entire window a fade is visibly in flight while the flag
still reads `false` — so this line stomps opacity back to `'1'` and cancels it.

Traced by trapping writes to the element's `style.opacity` with a stack capture:

| scroll delay | sequence | result |
|---|---|---|
| 400ms | hide writes `'0'` at t=1513 → **`applyTheme` writes `'1'` at t=1532** | surface visible |
| 1200ms | `applyTheme` writes `'1'` at t=1271 → hide writes `'0'` at t=1614 | correctly hidden |

19ms apart. Scroll late enough and the order reverses — which is exactly why it only reproduced when
scrolling within ~400ms of landing.

**Solution**: also test `__particleHiding`, which goes true *synchronously* the instant any hide is
requested and therefore covers the whole fade window:

```javascript
if (!window.__particleLayerHidden && !window.__particleHiding) demo.style.opacity = '1';
```

**File**: `partials/particle-morph.hbs` (`applyTheme`)

Verified: all scroll delays (0/200/400/700/1200/2500ms) now hide correctly, stable across repeat
runs — 0ms had never passed before. Regression-checked: normal scroll sequence unchanged, layer still
both shows and hides across a full-page scroll, curtain return unaffected.

**Two flags, two meanings — don't mix them up**:
- `__particleHiding` — true **synchronously** when a hide is requested; covers the fade itself.
- `__particleLayerHidden` — true only once the fade has **finished** (timer); means "fully hidden".

Any code deciding "may I show the layer?" wants `__particleHiding`. Guarding on
`__particleLayerHidden` alone leaves a ~700ms hole where a fade is in flight but reads as not-hidden.
The same class of bug is documented directly below (the `alreadyHiding` gate in `__particleApply`'s
hide branch) — this is the third instance, so treat a lone `__particleLayerHidden` check as suspect.

**Test the symptom, not a proxy**: an earlier test scrolled all the way to the operating-model section
and asserted the final shape. It passed while the bug was fully present, because the bug is the layer
being VISIBLE during the hero exit — which that test scrolled straight past. The test that found it
stops just past the hero (~1.2 viewports) and asserts `opacity`.

---

### Hero's "Surface" (`terrain`) Left Visible When You Scroll Immediately After Landing (2026-08-07)
**Problem**: click Home, then start scrolling before the hero object's form-in/hide sequence
finishes — the hide never completes and the `terrain` ground plane (the shape the hero exit is only
supposed to pass THROUGH on its way to fading out) stays on screen.

**Root Cause**: `morphTo()` **silently discarded** requests for shapes that were not yet registered.

GLB-derived shapes (`sphere`, `torus`, …) are created asynchronously after their meshes load
(`createInitialStates`, see `initializeModules`). A visitor who scrolls quickly reaches the
operating-model section before that finishes, so:

```
morphTo('terrain', 400)  registered:true   → applied
morphTo('sphere',  400)  registered:false  → warned and DROPPED
```

Nothing ever re-issued the dropped request, so the layer stayed on `terrain` — visible, at opacity 1.
Scrolling later worked because by then the GLBs had loaded.

Traced with a `morphTo` wrapper logging `stateRegistry.get(state)` at call time; `registered:false`
on the `sphere` call is the whole bug.

**Solution**: retry the request once the shape exists, instead of dropping it (`morphTo`'s else
branch). Only the latest pending request is kept (a fast scroll can queue several) and it gives up
after ~4s rather than polling forever or re-applying somewhere the user has long since left.

**File**: `assets/js/particle-morph-system.js` (`morphTo`)

Verified with a sweep of scroll-start delays after clicking Home. Before: `terrain` stranded at
0/150/300/600ms. After: 300ms and later always resolve to `sphere`, repeatably across runs. Normal
scrolling unchanged (`ribbon-dispersed → terrain → sphere → torus → grid`).

**Known remaining edge**: scrolling within ~150ms of landing can still strand it, but for a
different reason — the page only reaches y≈1920 instead of 3200, i.e. the operating-model trigger
never fires at all because scrolling begins before its handlers are wired. Separate problem, not the
registry race above.

**Two things that looked like the cause and were NOT** (both measured, don't re-blame them):
- *A late hero entrance undoing the exit.* `scroll-scrub-anim.js`'s poll waits up to 8s for the
  particle system and then applies the hero shape unconditionally, which genuinely can arrive after
  you've scrolled away — a `__particleHiding` guard was added there and is worth keeping, but it did
  NOT fix this.
- *The show branch cancelling an in-flight fade.* `__particleApply`'s show path only restored opacity
  when it was exactly `'0'`, missing a fade still in progress. Also real, also fixed (it now restores
  whenever a hide was in flight), also not the cause here.

---

### Particles Stuck on `dispersed` ("overbloomed") After Closing a Post — IntersectionObserver Never Fires on a Scroll JUMP (2026-08-07)
**Problem**: open a post from the homepage, close it with the nav close button (curtain return to the
anchored scroll position), then scroll — particles sometimes render as an overbloomed blob instead of
the section's shape. Scrolling away and back always fixed it.

**Root Cause**: the operating-model section drives its own particle shapes with an
**IntersectionObserver** (`partials/operating-model.hbs`), independent of `ParticleScrollDirector` —
under the live `hero-footer` scenario the `operating-model` key is deliberately absent from
`PARTICLE_SCENARIOS`, so that section owns its own morphs.

An IntersectionObserver fires on a viewport **crossing**. A curtain return restores scroll with an
instant jump, so nothing crosses, no callback runs, and the particles keep whatever the boot sequence
left them on — `'dispersed'`, the raw 16k-particle cloud, which at full opacity reads as an
overbloomed blob rather than a shape. Scrolling away and back "fixed" it precisely because that
produces the crossing the jump skipped.

Measured at an identical scroll position (y=4500):

| | live particle state | director's own zone |
|---|---|---|
| normal approach | `triple-sphere` | `sphere` |
| **after curtain return** | **`dispersed`** | `sphere` |

The director *knew* the right shape — it had recorded it — but this section's separate
observer-driven system never re-ran. That split is why looking only at director state was misleading.

**Solution**: re-evaluate manually once the restore jump has settled, using the same "group top above
the viewport middle" test the observer's `rootMargin: '0px 0px -50% 0px'` encodes, and morph to the
last group that satisfies it.

**Critical detail — capture the flag at SCRIPT-PARSE time**:
```javascript
// top of the IIFE, NOT inside initOperatingModel()
var IS_CURTAIN_RETURN = (function () {
  try { return sessionStorage.getItem('curtainReturn') === '1'; } catch (e) { return false; }
})();
```
`initOperatingModel()` waits for the window `load` event, which fires long after
`page-transition.js`'s `runCurtainEntrance()` has already done
`sessionStorage.removeItem('curtainReturn')`. Reading the key from inside init always found `null`
and the resync silently never ran — verified by zero `[om]` console logs after a return. The partial
renders in the page body, before the deferred `<script>` tags at the end of default.hbs, so a
parse-time read wins. Same trick `post-and-cards.js` already uses for its own `IS_CURTAIN_RETURN`.

**File**: `partials/operating-model.hbs` (`resyncToScrollPosition()` + the parse-time flag)

Verified: after the fix the curtain return reports `triple-sphere` at y=4500 — byte-identical to a
normal approach, with no scroll needed. Regression-checked a normal load: shape sequence is still
`ribbon-dispersed → terrain → sphere → torus → collapse → grid` with **0** `[om] morph` calls,
confirming the resync only fires on the curtain-return path.

**General lesson**: **IntersectionObserver cannot see a scroll JUMP.** Any observer-driven state is
unreliable on a path that restores scroll programmatically (curtain return, deep link, hash jump,
bfcache restore) — the observer's own initial callback fires at `observe()` time, which is *before*
the jump, so it reports the wrong position and is useless for this. Anything driven that way needs an
explicit re-evaluation after the jump settles. Note this is the OPPOSITE trade-off from the one that
made this section use an observer in the first place (see "Lab Grid Morph Firing…" above): observers
are immune to stale cached pixel positions, but blind to jumps.

---

### Particles Render "Stronger"/Brighter After Opening a Post and Closing It (2026-08-07)
**Problem**: after opening a post and closing it back to the source page, the particle object
(the operating-model sphere, sometimes the hero object) rendered noticeably brighter/stronger than
normal. Scrolling away and back always fixed it. Distinct from the "fat blobby lattice" bug above —
that one is a frozen mid-morph *shape*; this is a frozen *frame* at full opacity.

**Root Cause**: `__particleApply`'s hide path (default.hbs) starts an opacity fade on
`#particle-morph-demo` and, separately, arms a `setTimeout` to set
`window.__particleLayerHidden = true` once that fade should be done — deliberately decoupled so the
render loop only pauses *after* the fade is visually complete.

Nothing re-checked that the fade actually still applied when the timer fired ~700ms later. On a
curtain return the layer's opacity gets put back to `1` in that window (the show branch, or the
freshly-loaded page's own inline `opacity: 1`), while the stale timer still fires and pauses the
render loop. Result: **loop paused + layer fully visible = the last drawn frame frozen on screen at
full opacity**, sitting where the live, normally-fading object should be.

Measured across the reported cycle:

| | state | `__particleLayerHidden` | layer opacity |
|---|---|---|---|
| normal, scrolled to object | `grid` | false | 1 |
| **after curtain return (bug)** | `collapse` | **true** | **1** ← contradiction |
| after scrolling away + back | `terrain` | true | 0 |

`hidden: true` with `opacity: 1` is the signature — the loop is not drawing, so whatever was last
rendered stays put at full brightness. Scrolling away and back fired a fresh trigger that reached
the show branch and resynced both flags, which is why that always "fixed" it.

**Solution**: re-check the layer is still faded before pausing the loop:
```javascript
window.__particleHideTimer = setTimeout(() => {
  const l = document.getElementById('particle-morph-demo');
  const stillFaded = !l || l.style.opacity === '0';
  if (stillFaded) window.__particleLayerHidden = true;
  else window.__particleHiding = false;   // fade was cancelled; stay live
}, hideDelayMs);
```
**File**: `default.hbs` (`window.__particleApply`, the `target === 'hide'` branch)

Verified: after the fix, the post-curtain-return state reports `opacity: 0` with `hidden: true` —
byte-identical to the recovered state, so the "broken vs fixed-by-scrolling" diff is now empty.
Regression-checked a full scroll of the homepage: fades still run correctly through
`terrain → sphere → torus → collapse → grid`, and **0** frames occur with `hidden: true` while
opacity > 0.9.

**General lesson**: when a deferred timer commits state that a *separate* property was supposed to
have already reached, the timer must re-verify that property at fire time — it cannot assume the
world is unchanged since it was armed. Same family as the morph-freeze bug above: both are
"something was skipped while hidden and nothing re-checked it later."

**Note for future debugging**: the particle system does NOT run on post pages
(`particle-morph.hbs` excludes `post-template` — verified: `window.particleSystem` is undefined and
there are no canvases there at all). Any particle symptom "on a post page" is really on the page you
returned TO.

---

### Lab Orb Renders Over-Saturated After Closing a Post — Morph Never Resets `size` for Shapes With No Authored Sizes (2026-08-20)
**Problem**: after a post → Close curtain return that lands mid-page, the Lab orb rendered
markedly brighter and denser than normal — "like bloom exaggerated". A plain refresh did **not**
fix it; opening the site in a new tab did. Browser-back was fine; only the nav Close button
reproduced it. Scrolling on to the operating-model globe did **not** fix it — **only** morphing
back to the hero shape did.

**Root Cause**: on morph completion, `_advanceMorph()` copied the destination's per-particle sizes
**only if that destination had any**:

```javascript
const sz = geo.attributes.size;
if (sz && this.nextState.sizes) {   // ← no else: buffer left untouched
```

`ShapeDefinition.generate()` (`shape-definitions.js`) returns `sizes: null` for every plain
generator — including `sphereGenerator`, i.e. **`lab`**. So morphing *into* `lab` left whatever
sizes the previous shape had in the buffer.

Every load starts at `'dispersed'` (`particle-morph.hbs`), and the dispersed variants author sizes
up to **2.0** (`dispersed-variants.js`) against an authored norm of ~0.49. `gl_PointSize` scales
linearly with size and sprite *area* with its square, so under `AdditiveBlending` the orb rendered
at roughly **4x mean luminance and 2.6x lit coverage** — at identical geometry, camera, glow,
colour and particle count.

`setState()` had the same gap for `aTargetSize`, so the morph also *animated toward* the stale
sizes rather than merely settling on them.

**Why only the hero shape fixed it** (the clue that cracked this): `volatility` and `helix` DO
author real sizes, so they always overwrote the buffer. Any shape without sizes — `lab`, and the
GLB card shapes — inherited instead. That asymmetry is the whole tell.

**Solution**: give both write sites an explicit no-sizes fallback:
```javascript
if (sz) {
  if (this.nextState.sizes) { /* copy */ }
  else { sz.array.fill(0.49); }
  sz.needsUpdate = true;
}
```
**File**: `assets/js/particle-animation-loop.js` — `_advanceMorph()` completion block *and*
`setState()`'s `aTargetSize` block.

**0.49, not 1.0**: filling with `1.0` (matching `createParticles()`'s own fallback) was tried first
and caused a *worse* regression — every no-sizes shape over-saturated even with no navigation at
all. Every generator that authors sizes centres on `0.38 + h * 0.22` (~0.49 mean, caps 0.40), so
1.0 is ~2x too large linearly and ~4x by sprite area. `createParticles()`'s own `1.0` was
deliberately left alone: that path is not implicated and changing it would alter first-load
appearance site-wide.

**Verified**: measured at matched viewport, DPR and scrollY — `lum` 13.0 → ~3.0, `litPct` 13.4 →
~5.0, restoring parity with a never-navigated page.

**General lesson**: a conditional buffer write with no `else` silently inherits the previous state.
That is invisible whenever the values happen to be similar, and only shows up on the one transition
where they are not — here, exclusively from `dispersed`, which is exactly the state every page load
starts in and therefore exactly what a curtain return morphs out of.

**Debugging lesson (this one cost ~10 wrong theories)**: every hypothesis derived from *reading*
this code was wrong — duplicate canvases, duplicate render loops, camera/FOV, particle count, glow
compounding, `uTime` phase, `uWavefront` phase, depth-test ordering. What worked was (a) a
`gl.readPixels` probe measuring **mean luminance and lit coverage of the actual frame**, and (b)
taking the *behavioural asymmetry* seriously — "only the hero shape fixes it" pointed straight at
the one property hero shapes set and others don't. Two measurement traps to avoid repeating: the
console is monkey-patched and silently drops `console.log` unless `window.DEBUG_SCROLL = true`, and
any good-vs-bad comparison **must** match `innerWidth`/`innerHeight`, `devicePixelRatio` and
`scrollY` — an early pair differed on viewport alone and produced a completely false signal.

---

## Navigation

### Nav Blinks Intermittently While Scrolling (2026-08-07)
**Problem**: the glass nav pill flickered/blinked at random during scroll. Intermittent, so it looked
like a JS timing bug — but nothing in JS was touching it.

**Root Cause**: **two stacked `backdrop-filter` layers on the same element, with no layer promotion.**

`.nav-wrapper` carries its own `backdrop-filter: var(--glass-backdrop)` — `blur(20px) saturate(180%)`
(main.css) — and `.glass-liquid` is applied to that *same* element, whose `::before` added a second
full backdrop re-sample, `blur(14px) saturate(190%) brightness(0.9)` (glass-liquid.css).

`backdrop-filter` forces the browser to re-read and re-blur everything behind the element every frame.
Doing it twice, over the continuously-repainting particle canvas, with nothing pinning the nav to a
stable compositing layer, meant the compositor kept discarding and rebuilding that layer mid-scroll.
Measured before the fix: `willChange: auto`, `transform: none`, `contain: none`, `isolation: auto` —
i.e. no promotion hint of any kind.

Note this is **not** detectable by sampling computed styles during scroll: every property
(`opacity`/`visibility`/`transform`/`filter`/class lists) reported **0 changes** across 240 sampled
frames on both home and post pages. It is a rasterisation artifact, not a style change — if a "blink"
probe comes back clean, stop looking for a JS toggle and start looking at compositing.

**Solution** (both parts in `glass-liquid.css`):
1. Suppress the redundant element-level blur wherever `.glass-liquid` supplies its own, so exactly one
   `backdrop-filter` remains. Scoped to `.glass-liquid`, so the other 13 `--glass-backdrop` consumers
   (cards, modal, stats ticker) are untouched.
2. Promote the pane to its own compositing layer so the sampled backdrop is rasterised once and reused:
```css
.glass-liquid { -webkit-backdrop-filter: none; backdrop-filter: none; }
.glass-liquid {
  transform: translateZ(0);          /* what actually forces promotion */
  backface-visibility: hidden;       /* kills the sub-pixel re-raster seam */
  will-change: backdrop-filter;      /* not sufficient on its own */
}
```
**File**: `assets/css/glass-liquid.css`

Verified: `.nav-wrapper` now reports `backdrop: none` with `::before` retaining `blur(14px)…` (look
preserved — screenshot-checked with the particle canvas behind it), plus `transform: matrix(1,0,0,1,0,0)`,
`willChange: backdrop-filter`, `backfaceVisibility: hidden`. `.post-card`/`.modal-content` still report
`willChange: auto`, confirming the scoping held. `.glass-liquid` is used on exactly one element
(`navigation.hbs` — `<div class="nav-wrapper glass-liquid">`), so the blast radius is one component.

**Trade-off accepted**: promoting an element makes it a containing block for any *fixed-position*
descendant. The nav has none — `.nav-tooltip` is `absolute` — so nothing is affected. Do not add a
fixed-position child to a `.glass-liquid` pane without re-checking this.

**General lesson**: never stack `backdrop-filter` on an element and its own pseudo-element — it doubles
a per-frame full-backdrop re-sample for no visual gain. And any translucent, blurred, *fixed* surface
sitting over animating content needs explicit layer promotion, or the compositor will rebuild it at
unpredictable moments. Related: `html.low-end` already strips `backdrop-filter` from the nav entirely
(main.css, "LOW-END DEGRADATIONS") for the same underlying cost reason.

### Nav Glass Blur Renders in Safari/WebKit but Not Chrome/Brave/Firefox (2026-08-08)
**Problem**: after the blink fix above landed, the nav pill's frosted-glass blur was visible in Safari
and DuckDuckGo (both WebKit) but rendered as a flat opaque gradient card — no blur at all — in Chrome,
Brave, and Firefox. DevTools on the broken browsers showed `backdrop-filter` computing correctly
(`blur(14px) saturate(1.9) brightness(0.9)`) on `.glass-liquid::before`, with the right gradient
background — the CSS was provably correct, it just wasn't compositing on screen.

**Root Cause**: the blink fix's compositing pin — `transform: translateZ(0)`, `backface-visibility:
hidden`, `will-change: backdrop-filter` — was applied to `.glass-liquid` (the parent element), but that
element's own `backdrop-filter` is explicitly forced to `none` two rules above it (so only one blur
remains, on `::before`). `will-change` only ever optimizes the element it's declared on — it does not
reach a pseudo-element or any descendant. So `will-change: backdrop-filter` on `.glass-liquid` was
promising the browser a property change that could never happen on that box; the pseudo-element
actually holding the blur got no promotion hint at all. WebKit tolerated this and promoted the
pseudo's layer anyway via the ancestor's `translateZ(0)` alone. Chromium and Firefox did not.

**Solution**: move the entire compositing-pin trio off `.glass-liquid` and onto `.glass-liquid::before`
— the box that actually owns the `backdrop-filter`:
```css
/* WRONG — will-change targets the parent, but the parent's own backdrop-filter is `none` */
.glass-liquid {
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: backdrop-filter;
}

/* RIGHT — pin the element that actually has the blur */
.glass-liquid::before {
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: backdrop-filter;
}
```
**File**: `assets/css/glass-liquid.css`

Diagnosed by diffing the live file against a known-working backup (`backup ref8/assets/css/glass-liquid.css`)
byte-for-byte — confirmed identical except for this trio's selector, which isolated the change to
exactly one rule instead of a wider guess. A same-machine, multi-browser check (Safari/DuckDuckGo
correct, Chrome/Brave/Firefox broken, same CSS file, same server) is what ruled out cache, GPU drivers,
and the CSS values themselves, and pointed at engine-specific `will-change` handling instead.

**General lesson**: `will-change` (and any other property that names *another* CSS property, like
`transition`/`animation` shorthands referencing properties by name) only ever affects the element it is
declared on — never a pseudo-element, never a descendant. When a `backdrop-filter`/`filter`/`opacity`
etc. lives on `::before`/`::after` rather than the element itself (common when suppressing a duplicate
effect on the parent, as the blink fix above does), any compositing hints for that effect must be
declared on the pseudo-element's own rule, not the parent's. A cross-browser split where the *computed
style* is correct everywhere but the *visual result* differs only between engines is a compositing/
layer-promotion problem, not a CSS-value problem — stop re-checking the values and start checking which
element the promotion hints actually target.

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

### Card Gradient Colors Wrong/Stuck After Fixing `codeinjection_head` (Two Compounding Bugs)
**Problem**: `gradflow-page-bg`'s (homepage background, `gradflow-page-bg-trigger.js`) crossfaded colors for one specific card rendered strongly wrong (solid blue) despite that card's own `gradientCss` field clearly specifying different colors (pink/lavender/white, confirmed against the swatches in a design reference). Fixing the field's value in Ghost Admin didn't visibly change anything, even after reloading.

**Root Cause (two separate bugs, same visible symptom)**:
1. **A malformed `codeinjection_head` silently breaks the WHOLE metadata parse, not just one field.** A string value missing its closing quote (`"cardDescription": ","`) makes everything after it — the rest of the object literal — part of one unterminated string, throwing a `SyntaxError` on `eval()` (`post-and-cards.js`). That's caught by a bare `catch (e) { showImageFallback(card); ... }` with **no logging at all**. Every field on that card (title, `gradientCss`, testimonial, everything) silently never applies — the card just falls back to its plain image, indistinguishable from a card that legitimately has no metadata. Because `gradflow-page-bg-trigger.js`'s "most-visible-card-wins" colour trigger skips any card with no usable `data-gradient-css`, it fell through to whichever *adjacent* card did have valid data — reading as "showing the wrong card's colour," not "this card's own data never loaded at all."
2. **Fixing the Admin field doesn't fix already-cached browsers.** `post-and-cards.js` caches each card's raw `codeinjection_head` string in `sessionStorage`, keyed by slug, with no expiry — the file's own comment says it "survives across reloads for the life of the tab." A tab that had already cached the broken raw text before the Admin fix keeps serving it indefinitely; reloading doesn't help, because the reload is exactly what reads from that cache.

**Solution**:
1. Fix the malformed field in Ghost Admin (a content fix, not a code change) — every occurrence, not just the one first found: the identical missing-closing-quote pattern turned up on a second, unrelated post's `gradientCss` field too, once looked for.
2. Bump `CARD_META_CACHE_VERSION` in `post-and-cards.js` to force-invalidate every cached entry for every visitor — the mechanism already existed for exactly this ("bumping `CARD_META_CACHE_VERSION` invalidates every entry at once"), it just hadn't needed using yet.

**Files**:
- (data fix) Ghost Admin → post → Code Injection → Header, for each affected post
- post-and-cards.js (`CARD_META_CACHE_VERSION`, `'v1'` → `'v2'`)

**General lesson**: when a `catch` block swallows a parse error with no logging, "this field has the wrong value" and "this field never loaded at all" look identical from the outside — before assuming one value is simply wrong, check whether the *whole* object failed to parse (every field on that entity sitting at its unset/default). Separately: any client-side cache with no expiry needs a version-bump escape hatch, and "I fixed the source data but nothing changed" is the signature symptom of that cache still being warm — verify against a completely fresh browser context (no prior session state) before concluding a fix didn't work.

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

## Loading & Entrance Visibility

> Full reference: **`LOADING.md`** (veils, the four entrance paths, card media,
> reveal backfill, the loading bar). Entries below are the symptom-first index.

### Loading Bar "Goes Back Right-to-Left" at the End of Its Sequence (2026-08-06)
**Problem**: the indeterminate loading bar finished its left→right exit correctly, then a bar visibly collapsed **right-to-left** immediately afterwards. Multiple rounds of re-easing and re-authoring the `@keyframes` changed nothing, because every keyframe check kept passing — the reverse motion was real, but it was not in the animation.

**Root Cause**: **`.scroll-progress` does double duty.** The same element is both the loading bar *and* the real scroll-position indicator, so its base rule (main.css, "SCROLL PROGRESS BAR") is:
```css
.scroll-progress { width: 0%; background: linear-gradient(...); transition: width 0.1s linear; }
```
The loading state overrides that with `width: 100% !important`. So when `page-transition.js` stripped `.is-loading` after the exit, the **track itself** reverted `100% → 0%` — and that `transition` *animated* the revert as a visible gradient bar shrinking right-to-left. The streak's own keyframes were never involved.

Two things made this hard to see:
- **The streak keyframes verify clean**, because they *are* clean. Sampling `left`/`width`/`transform` across the exit shows strictly rightward motion. The regression lives one element up, on the track, and only exists for ~100ms *after* the animation is over.
- **A CSS-only fix does not work.** Adding `transition: none` to `.scroll-progress.is-loading` suppresses only the *entry* (0% → 100%). The collapse happens the instant the class is **removed**, at which point the element no longer matches any loading-scoped selector and the base rule's `0.1s` is what applies.

**Solution**: suppress the transition inline, in JS, wrapped around the class removal — the only place that spans the moment the rule changes:
```javascript
bar.style.transition = 'none';
bar.classList.remove('is-loading', 'is-complete');
void bar.offsetWidth;        // force the 0% to commit untransitioned
bar.style.transition = '';   // hand it straight back for real scroll tracking
```
**Files**:
- `assets/js/page-transition.js` (`releaseLoadingBar()`)
- `assets/css/main.css` (`.scroll-progress.is-loading` — kills the *entry* transition only; comment cross-references the JS half)

Verified by A/B on the class-removal moment: **without** the fix, width reads `1000px` immediately after removal (a full-width visible gradient about to animate down); **with** it, `0px`.

**General lesson**: when an element is **shared between two roles**, its "off" state is not neutral — it is the *other role's* live styling, transitions included. Before assuming a visual regression is in the animation you just wrote, check what the element reverts *to*, and whether that revert is itself animated. A repeatedly-passing verification of the thing you changed is a signal to widen the search, not to re-tune it.

### Homepage Loads "Already Scrolled Down a Bit" — You Can Scroll Up From the Top (2026-08-09)
**Problem**: landing on the homepage, the page looked like it had already been scrolled down slightly — the hero sat low, and scrolling **up** was possible even though it should already be at the top. Intermittent, and it did not reproduce on a hard refresh with storage cleared.

**Root Cause**: `runLandingAnimation()` (page-transition.js, home branch) ran `gsap.set(heroEl, { y: 200 })` and animated it back to 0 over 0.2s. **`gsap.set` lands synchronously; the tween runs on GSAP's ticker.** During boot the ticker competes with particle-system init and `ScrollTrigger.refresh()`, so the window where the hero is still displaced stretches well past 0.2s — and a 200px-low hero over an unchanged document scroll extent reads exactly as "the page loaded scrolled down."

Three things made this hard to pin down:
- **`window.scrollY` is 0 the whole time, correctly.** The hero is displaced by a *transform*, not by scrolling. Probing `scrollY` alone (the obvious first check) returns a clean `0` at every sample and rules out the real cause. You have to read `getComputedStyle('.hero').transform` / `getBoundingClientRect().top`.
- **It only happens on the skip path.** A genuinely cold load returns early (`if (hasPreloader && !window.__preloaderSkipped) return;`) and never touches the hero, so the full preloader run is *not* affected. Only cached/same-site arrivals at `/` reach the `gsap.set`. Testing with cleared storage tests the one path that was always fine.
- **A fast machine hides it.** Measured mid-flight in headless (no real boot work to contend with) the hero still carried `translate3d(0, 5.4px, 0)` at t+0.6s — the tail of the same tween. With real particle/GLB work in front of it, that tail is what the user sits and looks at.

**Solution**: `y: 20` instead of `y: 200`. 20 is what the function's own comment already claimed it used ("same y-values as the non-home branch's `<main>` entrance: y:20->0") — the 200 was an undocumented mismatch against stated intent. Small enough that a delayed tween can't read as a scroll offset. Measured after: peak displacement 7.8–11.4px, resolved within ~0.3s.

Also corrected in the same comment block: it justified putting the transform on `.hero` on the grounds that `.hero` "is position:fixed, so its own transform doesn't create that containing-block problem." `.hero` is `position: relative` (main.css). The concern is moot anyway — `.hero-bg` and `.hero-image-wrapper` have both since been migrated off `position: fixed` — but the false premise would have misled the next change.

**Files**:
- `assets/js/page-transition.js` (`runLandingAnimation()`, home branch)

**General lesson**: `gsap.set(x)` + `gsap.to(x, {back to 0})` is not an atomic "animate from" — it is an **immediate displacement** followed by a tween that may be arbitrarily delayed by main-thread contention. The larger the set value, the worse a delayed tween looks. Prefer `fromTo` (or a small offset) for anything that runs during boot. And when a symptom is described in scroll terms, confirm whether the element moved or the scroll position did before searching the scroll system — a transform on a full-viewport section produces the visual signature of a scroll offset while every scroll value stays correct.

### Preloader's Loading Bar Never Rendered At All (2026-08-06)
**Problem**: the homepage preloader's progress bar showed nothing on every load. Easy to misread as a timing or z-index issue.
**Root Cause**: the shared streak is gated behind `.progress-bar-track:not(.is-loading) .progress-bar-streak { display: none }` (main.css). `.scroll-progress` gets `.is-loading` toggled by `page-transition.js` — but `#preloader-progress-bar`'s markup never had the class, and no JS added it. Its streak was therefore `display: none` permanently, so **only the page-navigation bar was ever visible**; all loading-bar feedback during this work was coming from `.scroll-progress`.
**Solution**: hardcode `is-loading` in `preloader.hbs`. Unlike `.scroll-progress`, that element exists *only* during loading — there is no "off" state to toggle back to, so a static class is correct rather than JS-managed.
**Files**:
- `partials/preloader.hbs`

**General lesson**: a class gated by `:not()` is invisible-by-default. When one consumer of a shared component has JS managing that class and another does not, the second silently renders nothing — with no error and no console warning. Grep for who actually *adds* a gating class before assuming both consumers are wired.

### Post Cards Invisible After Closing a Post, Then Pop In All At Once (~8s)
**Problem**: Close button on a post → back on home, page blank (particles/helix visible, scrim faded normally), then every card appeared abruptly seconds later. Only reproducible when you had **scrolled down** before opening the post.
**Root Cause**: Two separate `opacity: 0 !important` veils over `.home`, neither cleared on the curtain-return path (`.post-card-content`/`.post-card-image` have no opacity of their own — they inherit the ancestor's, so this reads as "the cards are broken" when the cards are fine). (1) `html.landing-pending` is raised on *any* same-origin arrival at `/`, including a curtain return, but was only removed by `runLandingAnimation()` — which `runCurtainEntrance()` short-circuits (`if (!runCurtainEntrance()) runLandingAnimation()`), so it sat until its 2.5s failsafe. (2) `html.curtain-restoring` **deadlocked**: only `__particleApply()` with a non-`'hero'` key removed it, but a restore landing inside the hero only fires `'hero'`, whose guard returns early *because the veil is up* (`if (veiled || …) return;` precedes the removal line) — nothing could ever clear it, so it ran the full 8s failsafe. Measured `.home` at opacity 0 for **8122ms**. Note the veil only activates when the saved `scrollY > 100`, hence the "only if you scrolled first" reproduction.
**Solution**: `runCurtainEntrance()` clears `landing-pending` alongside `main-pending`, and clears `curtain-restoring` immediately after its scroll snap (the actual "restore settled" moment) instead of delegating to a particle trigger that may never fire. 8122ms → **552ms**; veil still masks the pre-restore frame; fresh/menu/post paths unchanged (342/350/935ms).
**Files**:
- page-transition.js (`runCurtainEntrance`)
- main.css (`html.landing-pending .home`, `html.curtain-restoring .home`)
- default.hbs (head veil script)

### Card Video Always Faded In, Even When Cached
**Problem**: Skeleton shimmer then a visible fade on card media that was already loaded/cached.
**Root Cause**: The cache check was `video.readyState >= 2`, evaluated synchronously on the line right after `video.load()`. `load()` **resets** `readyState` to `HAVE_NOTHING` (0) and loads asynchronously, so even a fully cached video reports `0` there — measured `0` in every case, cold and warm. The check could never be true, so every video took the animated branch regardless of cache state. (An `<img>` needs no such handling: it's server-rendered with a `src`, so `img.complete` is genuinely true on a warm cache.)
**Solution**: Time the `load()` → `loadeddata` gap against `CACHED_VIDEO_MS` (150ms) — cache hits resolve in ~1ms, real fetches cannot. Validated under throttling (800kbps/150ms RTT), because **localhost cannot distinguish the cases** (cold and warm both ~1ms — the test would pass for the wrong reason): cold 951ms → fade, priming fetch 2470ms → fade, cached 1ms → instant.
**Files**: post-and-cards.js (`applyCardMeta`, `CACHED_VIDEO_MS`)

### Reveal Backfill Fires Seconds Late (Starved by Synchronous GLB Work)
**Problem**: `setTimeout`-scheduled backfill passes (450/1200/2500ms) fired at 3033/3472/4223ms after a curtain return.
**Root Cause**: GLB shape loading kicked off immediately during particle init. The fetches are async but the work on resolve is **synchronous CPU** — GLTFLoader parse + `subdivideGeometry` + `MeshSurfaceSampler.build()`, with 9 files resolving in a burst (`mobile.glb` alone expands 43,147 → 1,016,880 vertices) — which blocks the main thread and starves every queued timer.
**Solution**: Defer the load kickoff to `requestIdleCallback` (2s timeout ceiling). Nothing on/near first paint depends on these — they're morph targets for later scroll-triggered shape changes. First backfill 3033ms → **1342ms**.
**Files**: particle-morph-system.js (`initializeModules`)

### `window.DEBUG_SCROLL = true` Doesn't Survive a Page Transition
**Problem**: Console gate reset on every navigation, making any multi-page flow (home → post → close) impossible to debug from devtools — logs appeared to be missing entirely.
**Root Cause**: A plain property assignment is per-page-load; every step of these flows is a **full navigation**, not a client-side route swap.
**Solution**: `window.DEBUG_SCROLL` is a getter/setter mirroring localStorage, seeded on each load. Same `window.DEBUG_SCROLL = true` UX, now persistent. Seeds from *either* an already-set value or localStorage — seeding from localStorage alone silently discarded a value set by an earlier script (e.g. Playwright's `addInitScript`), since `defineProperty` replaces the plain property.
**Files**: default.hbs (console gate IIFE)

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
- [ ] Close button → scroll well down into the work cards, open a post, close it: cards are visible **immediately** at the restored position (not blank-then-pop). Scrolling first is required — the veil only arms when saved `scrollY > 100`
- [ ] Entrance paths → fresh landing, menu → home, and → Profile/Contact/post all reveal without a 2.5s/8s stall (a failsafe doing the work means something upstream failed)
- [ ] Card media → on a revisit, cached card videos/images appear with no fade; no skeleton left shimmering once scrolled to
