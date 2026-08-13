# GSAP Scroll Animation Architecture

Master patterns for scroll-driven storytelling animations. Focuses on **why** and **how** systems work, not just configuration values.

---

## Pinned Sections on This Site

### 1. Hero Sequence (Storytelling)
- 3 phrases, each 100vh scroll
- Entrance → Pause → Exit pattern
- Snaps to phase completions
- **Location:** `partials/hero-sequence.hbs`

### 2. Operating Model (List Entrance)
- 3 items staggered entrance
- Pause hold after all visible
- Snaps to item waypoints
- **Location:** `partials/operating-model.hbs`

### 3. Statement / Helix Section
- Simple `#helix` section with h2 + h3 headings
- **NOT pinned** — normal document flow
- Animation handled by `heading-animations.js` (h2/h3 → scroll-scrubbed word reveal)
- **Location:** `partials/statement-slide-logos.hbs`

> **Note:** This section was previously a complex 3-phase pinned sequence with logos ribbon. It has been simplified to a plain scroll-reveal section. The logos ribbon is now a separate `logos-ribbon.hbs` partial. See `GSAP-ANIMATION-AUDIT.md` for the current section order.

All pinned sections follow the same stage-based architecture below.

---

## Core Architectural Pattern: Pinned Scroll Stages

### The Problem
Scroll-driven animations can get "stuck" between states — text at half opacity, items half-translated, unclear final state. Users scroll past key moments, or scroll back and land mid-animation.

### The Solution: Stage-Based Composition

Instead of one continuous animation, we build **discrete stages** that complete fully before the next begins:

```
User scrolls ───→ Stage 1 (Entrance) ───→ Stage 2 (Pause/Hold) ───→ Stage 3 (Exit)
                  [0%─40%]                [40%─60%]                [60%─100%]
                  ↓ Complete               ↓ Stable                 ↓ Complete
                  Text fully visible       Text frozen              Text gone
```

**Key principle:** Each stage has a clear start and end state. No ambiguity mid-stage.

---

## Pause System Architecture

### Why Pauses Exist

**Problem:** Without pauses, users scroll too fast through the story. Text appears and immediately starts exiting.

**Solution:** Pause phases give time for comprehension without requiring extra scroll distance.

### How Pauses Work

1. **Budget allocation** per phrase: `SCROLL_PER_PHRASE = 100vh`
2. **Carve into stages:**
   ```
   Entrance: 0–40%    (40vh of scroll budget)
   Pause:    40–60%   (20vh of scroll budget) ← configurable
   Exit:     60–100%  (40vh of scroll budget)
   ```
3. **Exit timeline position recalculates** based on pause duration
   - No pause (0%): exit starts at 40%
   - 20% pause: exit starts at 60%
   - 30% pause: exit starts at 70%

### Why This Architecture Works

- **Predictable timing:** Pause percentage is independent of viewport speed
- **Composable:** Each phrase is self-contained; adding/removing pauses doesn't break others
- **Scrollable:** Users control pacing—fast scroller skips pause phase, slow scroller lingers
- **Responsive:** Works at any viewport (100vh is always the same "scroll distance" perception)

---

## Magnetizing: Preventing Stuck States

### The Problem Statement
User scrolls partway through an exit animation, then scrolls back — text is now at 35% opacity, stuck between visible and invisible. Confusing.

### Industry Solutions

#### 1. **GSAP Snap (Recommended for This Project)**
Snaps scroll position to predefined waypoints. User scrolls to 45%, but snap pulls them to nearest stage boundary.

**Current Implementation:**
```javascript
scrollTrigger: {
  snap: { snapTo: 1, duration: 0.3, ease: 'power2.out' }
}
```

**What it does:**
- `snapTo: 1` → snap to full timeline completion
- `duration: 0.3` → 300ms snap animation
- `ease: 'power2.out'` → feels natural, not jarring

**Result:** User can't get stuck mid-animation. Always lands on a complete state.

#### 2. **Timeline Labels + Waypoint Snapping (Advanced)**
Snap to specific labeled moments instead of just start/end.

```javascript
const tl = gsap.timeline();
tl.add('entrance-end', 0.4);
tl.add('pause-end', 0.6);

scrollTrigger: {
  snap: { 
    snapTo: ['entrance-end', 'pause-end'], 
    duration: 0.3, 
    ease: 'power2.out' 
  }
}
```

**Result:** Snap to 40% (entrance done), 60% (pause done), or 100% (exit done). Never stuck at 45%.

#### 3. **Momentum-Based Snapping (Luxury Pattern)**
Doesn't just snap to nearest waypoint — considers scroll velocity.

**Pseudocode (GSAP Inertia plugin):**
```javascript
snap: {
  snapTo: ['entrance-end', 'pause-end'],
  inertia: true,  // physics-based momentum
  duration: 0.5,
  ease: 'power2.out'
}
```

Fast flick → snaps far. Slow scroll → snaps to nearest. Feels buttery smooth.

---

## Three-Layer Architecture: Pause → Speed → Ease

### Layer 1: Pause (Timing Structure)
**Question answered:** "When should this animation happen?"

```
Controls scroll budget allocation across entrance/pause/exit phases.
Affects: Timeline progression, when text becomes visible/invisible.
```

### Layer 2: Speed (Responsiveness)
**Question answered:** "How fast should this happen?"

```
Multiplier on animation duration. Faster = snappier, Slower = more deliberate.
Example: 0.8x speed = 20% slower, feels weightier, more dramatic.
```

### Layer 3: Ease (Feel/Intention)
**Question answered:** "What does this animation *mean*?"

```
Easing function changes narrative tone:
- entrance: 'power2.out'  → eager, welcoming arrival
- exit: 'power3.in'       → weighted, gravity-pulled departure
- exit: 'back.in'         → snappy, bouncy, playful exit
- exit: 'elastic.in'      → spring-loaded, resilient
```

**Why three layers?**
- Pause alone = robotic, same pacing
- Pause + Speed = responds to context (emphasize key moments)
- Pause + Speed + Ease = intentional storytelling (sets emotional tone)

---

## Scroll Trigger Timing: Why Positions Matter

### The Calculation Chain

```
sliceStart = i × SCROLL_PER_PHRASE           // Where this phrase's scroll begins
entranceEnd = sliceStart + 0.4 × SCROLL_PER_PHRASE  // Entrance finishes here
pauseEnd = entranceEnd + pausePercent × SCROLL_PER_PHRASE  // Pause finishes
exitStart = pauseEnd                         // Exit begins where pause ends
sliceEnd = (i + 1) × SCROLL_PER_PHRASE       // Phrase ends here
```

### Why This Order?

1. **Entrance first** — must complete before pause can hold
2. **Pause at end of entrance** — natural stopping point for comprehension
3. **Exit at end of pause** — clean handoff, no overlap
4. **Slicing ensures isolation** — each phrase is independent

**Benefits:**
- Predictable timeline positions
- Easy to debug (know exactly where each phase starts/ends)
- Allows snap to waypoints reliably

---

## Gap Reduction Architecture: Viewport Spacing

### The Challenge
Hero is pinned (fixed viewport position). Operating model content needs to appear naturally in the document flow, but should start scrolling soon after hero exits.

### The Solution: Padding Offset

```css
.page-content-wrapper {
  padding-top: calc(65vh - var(--nav-height));  /* current value */
}
```

**How it works:**
1. Hero pins at `top: 0` (starts at viewport top)
2. Hero content scrolls as user moves
3. Operating model sits in normal document flow **below** hero
4. `65vh` padding = "skip 65% of viewport height before showing operating model content"
5. When user finishes hero scroll, they've scrolled ~100vh
6. Operating model appears after ~65vh more scroll

**Why padding-top, not margin-top?**
- Padding is **inside** the element's box — creates visual spacing before content
- Margin-top **outside** the element's box — less reliable with positioned ancestors

**Adjustment guideline:**
- `65vh` = current value — deliberate breathing room after hero ✓
- `40vh` = moderate gap (tighter feel)
- `25vh` = tight gap (rush feeling)
- `10vh` = minimal gap (hard to transition)

---

## Timeline Markers: Why They Exist

### The Problem
Scroll-based timelines are hard to reason about. "Is my exit happening at 60% or 65%?" Hard to debug.

### The Solution: GSAP Labels

```javascript
tl.add('phase-entrance-start', 0);
tl.add('phase-entrance-end', 0.4);  // automatic time calculation
// ... animation code ...
tl.add('phase-exit-start');  // captures current timeline position
```

### Why Markers Matter

1. **Debugging** — "where is the snap failing?"
   ```javascript
   gsap.timeline().tweenTo('phase-entrance-end')  // jump there instantly
   ```

2. **Communication** — "when does text become visible?" → "at `phase-entrance-end`"

3. **Snapping** — snap to labeled waypoints instead of percentages
   ```javascript
   snap: { snapTo: ['entrance-end', 'pause-end', 'exit-start'] }
   ```

4. **Future modifications** — add/remove animations, markers reorder automatically

---

## Industry Pattern: "Scrubbing Without Getting Stuck"

### Standard Approach (Most Studios)

**Snap Configuration:**
```javascript
snap: {
  snapTo: 1,              // snap to full timeline completion (100%)
  duration: 0.3,          // 300ms snap animation
  ease: 'power2.out',     // natural easing
  force: true,            // always snap, no exceptions
  momentum: false         // no physics (simpler, predictable)
}
```

**What it prevents:**
- Text stuck at 50% opacity ✓
- Animation frozen mid-motion ✓
- Unclear final state ✓

**What it allows:**
- Fast scrolling → snaps to completion instantly
- Slow scrolling → lands at stage end naturally
- Scroll back → re-animates smoothly

### Advanced Approach (When Needed)

Use waypoint snapping + momentum:

```javascript
snap: {
  snapTo: ['entrance-end', 'pause-end', 1],  // three magnetic points
  duration: 0.3,
  ease: 'power2.out',
  momentum: true,  // scrolling fast → snaps farther ahead
  onSnap: (self) => console.log('Snapped to', self.getLabel())
}
```

**Result:** Feels like scroll is being "guided" toward key story moments.

---

## Decision Tree: Which Pattern for What?

```
Do users need precise scroll control?
├─ YES → Use Stage-Based (current)
│        Each phase is distinct, clear endpoints
│        Snap to 1 (full timeline)
│
└─ NO (more freeform) → Use Linear Scrubbing
                        Snap disabled, smooth continuous animation
                        (not recommended for storytelling)

Does the sequence have distinct beats?
├─ YES → Add timeline markers
│        Enable waypoint snapping to markers
│        Helps users stop at meaningful moments
│
└─ NO → Snap to timeline completion (1)
        Simple, predictable

Should slow scrollers linger, fast scrollers skip?
├─ YES → Keep snap enabled
│        Respects user's scroll speed
│        (current implementation)
│
└─ NO → Disable snap, use fixed duration
        Forces everyone same pacing (heavy-handed)
```

---

## Checklist: Implementing Magnetizing for New Sequences

When adding a new pinned animation, ensure:

- [ ] **Stage boundaries defined** — clear entrance/pause/exit or equivalent
- [ ] **Snap enabled** — `snap: { snapTo: 1, duration: 0.3, ease: '...' }`
- [ ] **Timeline markers added** — at least `phase-start`, `phase-end`
- [ ] **ScrollTrigger pins correctly** — `pin: true, pinSpacing: false` (unless spacing needed)
- [ ] **Exit timeline recalculates** based on pause — no hardcoded positions
- [ ] **Tested at multiple scroll speeds** — fast flick, slow drag, back-scroll

---

## Files & Where Architecture Lives

| Aspect | File | Lines | Purpose |
|--------|------|-------|---------|
| Pause budget | `hero-sequence.hbs` | 360-375 | Calculates stage boundaries |
| Snap config | `hero-sequence.hbs` | 394 | Prevents stuck states |
| Timeline markers | `hero-sequence.hbs` | 401-402 | Debug & waypoint snapping |
| Speed/Ease controls | `CONSTANTS.js` | 115-130 | Story tone/emphasis |
| Gap spacing | `main.css` | ~1756 | Content flow breathing room (`padding-top: calc(65vh - var(--nav-height))`) |

