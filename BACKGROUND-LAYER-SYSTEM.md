# Background Layer System

A generic, reusable framework for "as this section scrolls into view, shift its
background/foreground to a different look" — built for the profile section's
"The design role is shifting." effect, but not specific to it. Any section can
reuse the same mechanism.

**Core file**: `assets/js/background-layer.js`
**Reference implementation**: `.profile` in `profile.css` / `main.css` (nav) /
`initProfileColorInvert()` in `scroll-scrub-anim.js`

---

## The idea

`BackgroundLayer.bindShift(triggerEl, varName, options)` drives one CSS custom
property from `0` to `1` and back, tied to `triggerEl` scrolling through the
viewport. It never touches color — it just writes a plain number. Your CSS
(via `color-mix()`, `opacity`, whatever) decides what that number *means*
visually. That separation is what makes it reusable: the timing/scroll-math is
solved once, centrally, and every consumer just writes normal CSS against a
variable.

```js
BackgroundLayer.bindShift(document.querySelector('.your-section'), '--your-shift', {
  root: document.documentElement, // optional, defaults to :root
  onProgress: (t) => { /* optional: e.g. blend a THREE.js material colour */ },
});
```

```css
.your-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: #141414;        /* pick your own fixed "shifted" colour */
  opacity: var(--your-shift, 0);
}

.your-section .some-heading {
  color: color-mix(in srgb, var(--color-on-surface), white calc(var(--your-shift, 0) * 100%));
}
```

That's the whole recipe. No new JS required per section — just a new
`bindShift()` call and a few CSS rules.

---

## Why it's built this way (two design rules, both fixing real bugs)

### 1. A fixed palette, never the theme's own tokens

The first version of this effect worked by swapping
`--color-background`/`--color-on-surface` — the same tokens `theme.js` also
writes to on every theme toggle. That made two independent systems race over
the same shared state: toggling the site theme at any point (before, during,
or after scrolling through the section) produced stuck, flipped, or
inconsistent colors, because whichever system's cache happened to be stale won.

The fix: never write to `--color-background`/`--color-on-surface`. Pick your
own fixed "shifted" color for each layer instead (like `#141414` above), and
for text, use `color-mix()` to blend the *live* current theme token toward
that fixed color. `color-mix()` re-reads the token every repaint — there's
nothing to cache, so there's nothing to go stale. A theme toggle at any point
just works, because the two systems no longer share any state at all.

### 2. A dedicated property, not a shared one — even though it lives at `:root`

`bindShift()` defaults to writing at `document.documentElement` (`:root`), not
scoped to the trigger element. That sounds like it would risk the section
"bleeding" its look onto whatever else is on screen during the scroll
transition — and an earlier version that reused `--color-background` at
`:root` did exactly that (the profile section's background swept over the
still-visible tail of the previous section while both were partially in the
viewport).

The actual fix wasn't to stop using `:root` — it was to stop reusing a token
*everything already consumes*. `--color-background`/`--color-on-surface` are
referenced by every section's text/backgrounds by definition, so writing to
them at `:root` affects the whole page, full stop. A **fresh, single-purpose
property** like `--profile-shift` has zero blast radius by default — it only
affects the handful of selectors a stylesheet explicitly opts into via
`color-mix()`/`opacity`. Living at `:root` is what lets things *outside* the
trigger element (the fixed nav) react too; it's safe specifically because
nothing else's CSS references it.

The actual background *panel* (the dark fill itself) goes a step further and
doesn't even need `:root` — it's a `::before` pseudo-element scoped inside the
section's own box, painting a CSS background that structurally cannot escape
its own element. That's what guarantees zero bleed onto a neighboring section
regardless of how much of both happen to be visible mid-scroll — not careful
timing, but the fact that a background can't paint outside its own box.

---

## Timing: two viewport-height-tied ramps

```
enter: 'top bottom' -> 'top top'        (progress 0 -> 1)
exit:  'bottom bottom' -> 'bottom top'  (progress 1 -> 0)
```

Each of these spans **exactly one viewport height** by construction — the
scroll distance for the trigger element's edge to travel from the viewport's
bottom edge to its top edge. That's the only geometrically correct choice,
regardless of how tall the section is:

- It's precisely the distance during which the section goes from
  "not yet visible" to "fully filling the viewport" (or the reverse on exit).
- Nothing needs to happen in between — neither range covers the dwell in the
  middle, so the value just holds at whatever the enter ramp left it at (1)
  until the exit ramp starts moving it again.

An earlier version ramped over a fixed *fraction* (e.g. 15%) of the *entire*
enter-to-exit range. For a section much taller than one viewport, that
finishes the ramp to fully-shifted long before the section actually fills the
screen — so whatever's still visible above it gets swept into the effect too.
Tying the ramp to actual viewport height removes that mismatch for any
section height, verified empirically (see `PARTICLE_SYSTEM_ISSUES.md`-style
verification notes in git history / prior session transcripts if needed).

`scrub: true` (not `scrub: 1` or any eased value) is deliberate: the value at
any scroll position is computed exactly, with no smoothing lag. A fast scroll
or flick can't outrun it and show a stale, still-catching-up edge — the
classic bug from a *time-based* CSS transition triggered by a boolean
IntersectionObserver threshold, which is what the very first version of this
effect used and which this whole system now avoids by construction.

---

## Where this sits among the site's other background mechanisms

The theme has three independent background systems today. Know which one
you're touching:

| System | Scope | File(s) | Status |
|---|---|---|---|
| Token-driven flat colors | Whole page (`body`, most sections) | `tokens.css`, swapped via `data-theme` | Active |
| `#page-gradient` canvas wash | Hardcoded to `.posts-tabs-section`/`.post-card` | `gradient-layer.js` + `gradient-distortion.js` + `gradient-animation-loop.js` | Active |
| **Background Layer (this doc)** | Per-section, opt-in | `background-layer.js` | Active — currently used by `.profile` |

Two more exist in the codebase but are **dormant** (script tags commented out
in `default.hbs`) — don't assume they're live without checking:
- `gradient-morph-system.js` — a global fixed-canvas cross-fade system,
  disabled at `default.hbs` (search for the commented `<script>` tag).
- `glsl-gradient.hbs` + `glsl-gradient-manager.v2.js`/`glsl-gradient-enhanced.js`
  — the partial isn't included by any page template; scripts commented out.

`hero.hbs` and `profile.hbs` used to carry 7 `data-gradient-*` attributes each,
left over from `gradient-morph-system.js` — these were removed since nothing
reads them anymore. If you re-enable that system, you'd need to re-add
per-section config attributes for whichever sections should use it.

---

## Using this for a new section

1. Pick a fixed "shifted" palette for the new section — don't derive it from
   the current theme.
2. Add a `::before` (or similar) pseudo-element scoped to the section for the
   background panel, with `opacity: var(--your-shift, 0)`.
3. Add `color-mix()` rules for any text/icons that need to shift, blending the
   live theme token toward your fixed color.
4. Call `BackgroundLayer.bindShift(sectionEl, '--your-shift', { onProgress })`
   once, in your section's init function (see `initProfileColorInvert()` for
   the exact pattern, including how particles blend via `onProgress`).
5. If anything *outside* the section (nav, etc.) should also react, write
   `color-mix()` rules for it too — they'll pick up the same `:root`-level
   variable automatically, with zero extra JS.

## Extending to non-flat-color layers (gradients, shaders)

`bindShift()` only ever hands you a `0-1` number via `onProgress` (and writes
it to a CSS variable) — it has no opinion on what a "layer" visually is, and
it is **not** color-specific. It generalizes to any effect parameterized by a
single progress value:

- **A GSAP tween on a real property** (e.g. a card scaling up to fill the
  screen) doesn't need to go through `bindShift()`/`onProgress` at all — GSAP's
  own `scrollTrigger` config is already the progress-to-property mapper.
  Apply the same timing formula directly:
  ```js
  gsap.to(card, {
    scale: 12,
    scrollTrigger: { trigger: card, start: 'top bottom', end: 'top top', scrub: true },
  });
  ```
  The reusable knowledge here isn't "call this function," it's the
  `'top bottom' → 'top top'` / `'bottom bottom' → 'bottom top'`, `scrub: true`
  **recipe** — apply it directly in any ScrollTrigger config, with or without
  `background-layer.js` in the loop.
- **A GLSL/WebGL/canvas layer** (full-screen distortion, shader uniform, etc.)
  *does* want the `onProgress` callback, since CSS can't reach a shader
  uniform:
  ```js
  BackgroundLayer.bindShift(section, '--unused', {
    onProgress: (t) => { myShader.uniforms.distortion.value = t; },
  });
  ```
  Build the actual render loop the same way `gradient-animation-loop.js`
  already does elsewhere in this codebase (its own canvas, its own RAF loop);
  `bindShift()` just replaces "work out correct scroll timing" with one call.
- **Combining effects** on the same section is fine — GSAP happily runs
  multiple independent ScrollTriggers on one trigger element. A card that
  both grows *and* shifts color as it enters would use a plain GSAP tween for
  scale and `bindShift()` for the color, both keyed to the same element.

---

## How this fits into the site's broader scroll-trigger architecture

There is **no single unified "trigger framework"** across this theme — worth
knowing before assuming `BackgroundLayer` slots into one. What exists instead
is several independent, purpose-built systems, using two different underlying
primitives:

| System | Primitive | Scope |
|---|---|---|
| `background-layer.js` (`bindShift`) | GSAP `ScrollTrigger`, `scrub: true` | Generic — this doc |
| `card-scroll-reveal.js` | Raw `IntersectionObserver` | Sitewide — card/image reveal-on-scroll (fade+slide variants) |
| `heading-animations.js` | Raw `IntersectionObserver` | Sitewide — heading split-text reveals |
| `gradient-layer.js` | Raw `IntersectionObserver` per card | `.post-card` gradient cross-fade wash |
| `particle-morph.hbs` — GPU particle path (`registerScrollTriggersOnGPU`) | GSAP `ScrollTrigger`, discrete `onEnter`/`onLeave`/`onLeaveBack` (no scrub) | Hero/operating-model/testimonials → particle shape morphs |
| `particle-morph.hbs` — legacy THREE.js path (`setupCardTriggers`) | Raw `IntersectionObserver`, via a local `createViewportTrigger(name, el, state)` helper *plus several one-off hand-rolled observers that don't use it* | Same morph triggers, parallel/redundant implementation for the non-GPU code path |
| `operating-model-stacked.hbs` | GSAP `ScrollTrigger`, `pin: true` + its own master `gsap.timeline()` | Self-contained pinned carousel (the one place with a real internal timeline) |
| `scroll-scrub-anim.js` (`initProfile`, before this change) | Raw `IntersectionObserver` | Profile enter/exit animation lifecycle |

Two implications worth being explicit about:

1. **No master timeline strings sections together.** Every system above is
   independent; `operating-model-stacked.hbs` is the only section with an
   internal `gsap.timeline()`, and it's scoped to itself, not shared. "Do we
   have a timeline-based orchestrator" — no, not at the site level.
2. **The particle-morph trigger logic is the closest thing to a precedent for
   `bindShift()`, and it's less rigorous.** Its various `start`/`end` pairs
   (`'bottom center'→'bottom top'`, `'top center'→'top top'`, bare
   `{threshold: 0.1}` IntersectionObservers with no explicit geometry
   reasoning at all) were tuned ad hoc per section, not derived from "this is
   the mathematically correct distance for a section to fill the viewport."
   That's exactly the class of bug this doc's Timing section fixes. If this
   effect is ever revisited, retiming it with the same `'top bottom'→'top
   top'` viewport-height formula would very likely fix the same premature/
   late-trigger symptoms this document's earlier iterations hit.

`BackgroundLayer` doesn't plug into an existing best-practice framework
because there isn't one to plug into — it *is* a new, more disciplined piece
sitting alongside the others. It does, however, match documented GSAP
ScrollTrigger convention for "ramp exactly as an element enters/exits the
viewport" (keyword-relative `start`/`end` anchoring + `scrub`), which is why
it's presented here as a reusable recipe rather than a one-off fix.
