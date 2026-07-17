# Trigger System Issues

An audit of every "when does section X enter/exit the viewport" mechanism in
this theme. Written because none of them are unified — before adding a new
one, know what already exists and why it's fragmented. **Not fixed yet** —
this documents the current state and a proposed direction for later.

---

## Current state: no unified framework, five+ independent systems

| System | Primitive | Scope | File |
|---|---|---|---|
| `BackgroundLayer.bindShift()` | GSAP `ScrollTrigger`, `scrub: true`, viewport-height-tied `start`/`end` | Generic utility — see `BACKGROUND-LAYER-SYSTEM.md` | `background-layer.js` |
| Card/image reveal-on-scroll | Raw `IntersectionObserver` | Sitewide — fade+slide variants | `card-scroll-reveal.js` |
| Heading split-text reveals | Raw `IntersectionObserver` | Sitewide | `heading-animations.js` |
| Post-card gradient wash | Raw `IntersectionObserver` per card | `.post-card` only | `gradient-layer.js` |
| GPU particle morphs | GSAP `ScrollTrigger`, discrete `onEnter`/`onLeave`/`onLeaveBack`, **no** scrub | Hero, operating-model, testimonials → shape morphs | `particle-morph.hbs` → `registerScrollTriggersOnGPU()` |
| Legacy THREE.js particle morphs | Raw `IntersectionObserver`, partly via a local `createViewportTrigger()` helper, partly hand-rolled | Same conceptual triggers as above (hero, operating-model cards, profile, testimonials, stats, footer) — parallel/redundant implementation for the non-GPU code path | `particle-morph.hbs` → `setupCardTriggers()` |
| Pinned carousel | GSAP `ScrollTrigger`, `pin: true` + its own internal `gsap.timeline()` | Self-contained, not shared with anything else | `operating-model-stacked.hbs` |
| Profile enter/exit lifecycle | Raw `IntersectionObserver` | `.profile` only | `scroll-scrub-anim.js` → `initProfile()` |

**No master timeline strings any of this together.** `operating-model-stacked.hbs`
is the only place with a real internal `gsap.timeline()`, and it's scoped
entirely to itself.

---

## Concrete problems this causes

1. **Duplicated trigger registration.** `particle-morph.hbs` alone has *two*
   separate functions (`registerScrollTriggersOnGPU()` and the
   `IntersectionObserver`-based half of `setupCardTriggers()`) both enumerating
   essentially the same section list (hero, operating-model, testimonials,
   profile, footer) to fire the same kind of action (`morphTo(shape, duration)`),
   because the code branches on which particle backend (GPU vs. legacy
   THREE.js) is active rather than normalizing that behind one interface before
   registering triggers.
2. **Inconsistent, non-derived timing.** The GPU path uses ad hoc keyword pairs
   tuned by feel — `'bottom center'→'bottom top'`, `'top center'→'top top'` —
   with no documented reasoning for why those specific keywords were chosen.
   The IntersectionObserver paths mostly use a bare `{threshold: 0.1}` with no
   geometric reasoning at all. This is exactly the bug class that caused this
   session's profile-section timing issues (ramp completing before/after the
   section actually fills the viewport, bleeding onto neighbors) — except here
   it's spread across ~8 registrations with no shared fix applied.
3. **Inconsistent primitives mean inconsistent guarantees.** `ScrollTrigger`
   with `scrub` gives frame-accurate, lag-free values tied to exact scroll
   position (see `BACKGROUND-LAYER-SYSTEM.md`'s Timing section for why this
   matters on fast scrolls). Plain `IntersectionObserver` only tells you
   "crossed a visibility threshold," with no scroll-position precision and no
   protection against firing early/late relative to a neighboring section —
   most of this theme's triggers use the weaker primitive.
4. **Discoverability.** There's no single place to see "everything that
   happens when the user scrolls past section X." To find out, you currently
   have to grep `particle-morph.hbs`, `card-scroll-reveal.js`,
   `heading-animations.js`, `gradient-layer.js`, and each section's own partial
   separately.
5. **Debug logging is inconsistent.** Every system has its own console prefix
   convention (`[trigger]`, `[trigger-setup]`, `[particle-morph] [SCROLL]`,
   `[card-scroll-reveal]`, etc.) with no shared gate — see `debug.js`'s
   `window.DEBUG_SCROLL` flag, which only some of these actually check.

---

## Suggested architecture (not implemented — for later)

A single, small **`ScrollOrchestrator`** module, loaded once, that becomes the
one canonical way to register "when section X enters/exits the viewport, do Y":

```js
ScrollOrchestrator.register({
  name: 'hero',              // for debug logging, consistent format
  trigger: heroEl,
  // Defaults to the verified viewport-height formula — the same one
  // BackgroundLayer.bindShift() already uses — not a per-call ad hoc string.
  // Callers can still override start/end for a genuinely different need,
  // but the default is the geometrically-correct one, not "whatever worked
  // when someone tuned it by hand."
  onEnter: () => particleSystem.morphTo('dispersed', 200),
  onLeaveBack: () => particleSystem.morphTo('helix', 400),
});
```

What this would fix, concretely:
- **One registration per section**, not two parallel ones per particle
  backend — `particleSystem.morphTo()` is already a normalized interface
  (works the same whether GPU or legacy THREE.js is active under the hood;
  see `useGPUSystem` branching in `particle-morph.hbs`), so there's no reason
  the *triggers themselves* need to be duplicated — only the registration
  call sites need collapsing into one list.
- **One timing default** (the viewport-height ramp), used everywhere unless a
  section has a genuine, documented reason to differ — removing the
  ad-hoc-tuned-by-feel `start`/`end` strings currently scattered across
  `particle-morph.hbs`.
- **One place to look** — a single config list (or a handful of `.register()`
  calls near each section's own init code) instead of grepping five files.
- **One debug log format**, gated on the existing `window.DEBUG_SCROLL` flag
  site-wide.

What this would deliberately *not* try to unify: `card-scroll-reveal.js`'s
reveal variants and `heading-animations.js`'s split-text logic don't need
scroll-position precision the way particle morphs or background shifts do —
plain `IntersectionObserver` is the right, simpler tool there, and forcing
everything onto one ScrollTrigger-based primitive would be over-engineering
for effects that only ever need a boolean "is it visible."

**Scope of the "later" work**, roughly in order of value if this gets picked
up: (1) collapse the two particle-morph trigger registrations into one, using
the verified timing default; (2) migrate the hand-rolled profile/testimonials/
stats/footer observers in `setupCardTriggers()` onto the shared
`createViewportTrigger()` helper that already exists in the same file but
isn't consistently used; (3) only then consider whether `card-scroll-reveal.js`/
`heading-animations.js` are worth folding in too (probably not, per above).

---

## What `BackgroundLayer.bindShift()` adds, and how to use it today

Not a fix for the fragmentation above (that's the orchestrator, later) — a
self-contained utility that happens to demonstrate the timing fix this doc
recommends generalizing.

**What it adds:**
- A verified-correct scroll-timing formula (`'top bottom'→'top top'` enter,
  `'bottom bottom'→'bottom top'` exit, `scrub: true`) — the geometrically
  correct ramp distance for any element to go from off-screen to fully
  filling the viewport, regardless of that element's own height. This is the
  one piece of this whole page worth reusing immediately, with or without the
  JS function itself (see below).
- A clean `0-1` progress value, decoupled from what it drives — not
  color-specific. Consumers choose what the number means.
- No coupling to the site's theme-token system — safe to use anywhere without
  the theme-toggle race bugs documented in `BACKGROUND-LAYER-SYSTEM.md`.

**How to use it:**

1. **CSS-drivable effects** (color, opacity, background) — call
   `BackgroundLayer.bindShift(el, '--your-var', options)` once, then write
   `color-mix()`/`opacity` rules against `--your-var` in CSS. No per-effect JS
   beyond the one `bindShift()` call. This is the profile section's exact
   pattern — copy it directly.
2. **GSAP-tweenable properties** (scale, position, clip-path) — skip
   `bindShift()` entirely; apply the same `start`/`end`/`scrub` values
   directly in the tween's own `scrollTrigger` config. GSAP already maps
   progress to the property; routing through `bindShift()` would just relay a
   number GSAP computes natively.
3. **Non-CSS effects** (shader uniforms, canvas render loops) — use
   `bindShift()`'s `onProgress(t)` callback to feed your own render loop,
   ignoring the CSS-variable side if nothing needs it.
4. **Combining effects** on one section — perfectly fine to use `bindShift()`
   for a color shift *and* a plain GSAP tween for a scale/position change on
   the same trigger element; GSAP supports multiple independent ScrollTriggers
   per element.

Full rationale, the two bug-fixing design rules (fixed palette, dedicated
property), and the complete API are in `BACKGROUND-LAYER-SYSTEM.md`.
