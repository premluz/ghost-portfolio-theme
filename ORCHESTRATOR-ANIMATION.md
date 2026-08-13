# Animation Orchestration — Architecture Notes & Roadmap

> Working document. Current state + what needs to change to reach a proper storytelling-site architecture.

---

## Current Architecture Gaps

### 1. No orchestrator — each partial boots independently

Every section (`operating-model.hbs`, `logos-ribbon.hbs`, etc.) self-initialises via `load` or `setTimeout`. There is no coordination layer. On a real storytelling site, one `PageController` fires sections in order after layout is stable.

**What to build:**
```js
// In main.js, after preloader:done
async function initAll() {
  await waitForPreloader();
  ScrollTrigger.refresh();           // Stable layout before any ST registers
  initOperatingModel();
  initStatementSlide();
  initLogosRibbon();
  initHeadingAnimations();
  ScrollTrigger.refresh();           // Second pass after all ST registered
}
```

### 2. `statement-slide-logos` had no stage wrapper (now fixed)

Added `id="helix-stage"` inner div — enables future pinning without restructuring. Pattern now matches `operating-model` (outer section = trigger, inner div = pin target).

### 3. `HERO_PHRASE_SPEEDS` in CONSTANTS.js is dead

`speedFactor` was removed as dead code from `hero-sequence.hbs`. Either wire it or remove the constant.

### 4. `logos-ribbon.hbs` has dead animation factory

`createLineRevealAnim` is defined but never called. The commented-out `helix-alt` section adds confusion. Needs cleanup.

---

## Reference: Industry-Standard Pinned Section Pattern

`operating-model.hbs` is the canonical implementation. All future pinned sections should follow this:

```js
// 1. Separate ScrollTrigger for the pin
ScrollTrigger.create({
  trigger: stage,          // outer section
  start: 'top top',
  end: `+=${TOTAL_SCROLL}`,
  pin: true,
  pinSpacing: true,
  anticipatePin: 1,
});

// 2. Paused master timeline with named labels
const masterTl = gsap.timeline({ paused: true });
masterTl.add('entrance-start', 0);
masterTl.fromTo(el, { x: '-100%', opacity: 0 }, { x: '0%', opacity: 1 }, 0);
masterTl.add('entrance-end');

// 3. Separate ScrollTrigger scrubs the timeline
ScrollTrigger.create({
  trigger: stage,
  start: 'top top',
  end: `+=${TOTAL_SCROLL}`,
  scrub: 1,
  animation: masterTl,
});
```

**Key rules:**
- Pin ST and scrub ST are always separate (different concerns)
- Master timeline is always `paused: true`
- Use named labels for every phase (enables seek, debug, future sequencing)
- Scroll budget (`TOTAL_SCROLL`) always comes from `CONSTANTS.js → SCROLL_ANIMATION_PAUSES`

---

## Heading Animations: Observer vs Scrub — The Wormhole.com Finding

### What Wormhole does (industry reference)

Wormhole.com uses **GSAP ScrollTrigger scrub** for heading reveals, not IntersectionObserver:

```js
// Wormhole pattern (reconstructed from bundles)
const { chars } = new SplitText(headingElement, { type: 'words,chars' });

gsap.fromTo(chars,
  { opacity: 0.1 },
  {
    opacity: 1,
    stagger: 0.1,
    scrollTrigger: {
      trigger: headingElement,
      start: 'top 100%',   // starts when heading top hits viewport bottom
      end: 'top 50%',      // finishes when heading top hits viewport centre
      scrub: true,         // animation progress = scroll position
      toggleActions: 'play none none reset',
    }
  }
);
```

**Stack:** GSAP + ScrollTrigger + SplitText + Lenis (smooth scroll).
Lenis delivers high-frequency scroll events with momentum — this is what makes scrub feel fluid rather than mechanical.

### Why scrub feels better than observer for headings

| | IntersectionObserver | ScrollTrigger scrub |
|---|---|---|
| Trigger | Threshold crossing (binary) | Continuous scroll position |
| Feel | Snappy, plays and done | Perfectly tied to hand speed |
| Reversibility | Manual (our `resetHeading`) | Free — scrub reverses by scrolling back |
| Race conditions | Needs `killTweensOf` guards | None — scroll position is source of truth |
| Complexity | Low | Medium (needs scroll budget sizing) |

### Our current approach

We use **IntersectionObserver** with manual bidirectional reset:
- Reveals on scroll-down entry (`WeakSet` + direction tracking)
- Reverses with `resetHeading()` (reverse stagger + `killTweensOf` race guard)
- Config: `heading-animations.js` → `HEADING_ANIM_CONFIG`

This works and is correct. The Wormhole scrub approach would feel more premium but requires:
1. Lenis or equivalent for smooth scroll delivery
2. Per-heading scroll budget sizing (how much scroll = full reveal)
3. `SplitText` (GSAP Club membership) instead of manual span creation

### Decision point for future upgrade

**To switch to scrub for headings:**
- Add Lenis: `import Lenis from '@studio-freight/lenis'` (free, MIT)
- Replace `_revealHeadingByLetter` / `_revealHeadingByWord` with a `fromTo` + `scrollTrigger.scrub` per heading
- Remove `resetHeading`, `WeakSet`, scroll direction listener — no longer needed
- Trigger window: `start: 'top 90%'`, `end: 'top 30%'` (adjust per section density)

The existing `HEADING_ANIM_CONFIG` structure stays valid — just the trigger mechanism changes.

---

## Section Order & Scroll Budget Map

```
┌──────────────────────────────────────────────────┐
│  hero-sequence          ~4 × 100vh pinned         │
│    phrase 0: observer (time-based)                │
│    phrases 1–3: ScrollTrigger scrub               │
├──────────────────────────────────────────────────┤
│  page-content-wrapper   65vh padding-top          │
├──────────────────────────────────────────────────┤
│  operating-model        1.5vh × 1.4 pinned        │
│    3 headings stagger   ScrollTrigger scrub       │
│    config: OPERATING_MODEL_PAUSE_PERCENTAGE       │
├──────────────────────────────────────────────────┤
│  statement-slide-logos  normal flow               │
│    h2/h3: heading-animations.js observer          │
│    stage: #helix-stage (pinnable)                 │
├──────────────────────────────────────────────────┤
│  logos-ribbon           scroll-delta + lerp RAF   │
│    no ScrollTrigger (transform container issue)   │
├──────────────────────────────────────────────────┤
│  posts-tabs             normal flow               │
│  testimonials           card observer reveal      │
└──────────────────────────────────────────────────┘
```

---

## Key Insight: Observer vs Scrub (when to use each)

| Use case | Pattern |
|---|---|
| One-shot entrance (cards, images) | IntersectionObserver |
| Bidirectional heading reveal (current) | IntersectionObserver + manual reset |
| Premium heading reveal (upgrade path) | ScrollTrigger scrub |
| Pinned section with sequenced content | ScrollTrigger pin + scrub timeline |
| Count-up numbers, one-time triggers | IntersectionObserver (Wormhole does this too) |
| Ribbon/marquee inside transformed container | Raw scroll delta + RAF lerp |
