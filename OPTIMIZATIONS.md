# Performance Optimizations & Low-End Device Handling

Verified live against the running theme on 2026-07-21. Every item below was re-checked in the
actual files (not memory) before being listed — see the "Verify" line under each entry to
re-confirm it yourself later. If any of these ever seem not to be working, run its Verify
command first; don't assume the description of the fix is still accurate.

---

## 1. Load-time (first paint / DOMContentLoaded)

### 1.1 Lazy per-card metadata fetching
**File:** `assets/js/posts-tabs-grid.js`
Grid cards (lab/about grids) used to each `fetch()` their **entire post page HTML** just to
regex out `window.projectMeta` — measured ~400KB downloaded and parsed at load for
below-the-fold cards. Now behind an `IntersectionObserver` (`rootMargin: '800px 0px'`), and
observation itself is deferred until `load` + idle (`requestIdleCallback`, 800ms timeout
fallback) so it never competes with the critical path.
**Verify:** `grep -n "IntersectionObserver\|requestIdleCallback" assets/js/posts-tabs-grid.js`

### 1.2 Deferred homepage card + testimonial metadata
**File:** `assets/js/main.js` (`deferMetadataFetches`, ~line 2477)
`post-and-cards.js`'s homepage card fetches and `initTestimonialMetadata()` had the same
eager full-page-fetch pattern but couldn't go fully lazy (their "all N cards loaded → re-init
animations" counters would break). Deferred wholesale to `load` + idle instead.
**Result measured:** `loadEventStart` 1491ms → 978ms (**−34%**) on the homepage.
**Verify:** `grep -n "deferMetadataFetches" assets/js/main.js`

### 1.3 Loading-bar "theater" skipped on hero-less pages
**File:** `assets/js/main.js` (`waitForHeroImages`, ~line 519)
This used to run its progress-bar choreography (`.scroll-progress`: 5% → 100% width → fade)
on **every page**, including about/contact/work which have no hero image at all — a
full-width **gradient bar** (the element's own background is `linear-gradient(...)`) flashed
under the nav on every refresh, racing `scroll-progress.js`'s own writes to the same element.
Reported as "a strange gradient-like artifact bar" — this was it. Now the whole routine is
skipped when there's no `.hero-image-wrapper` on the page.
**Verify:** `grep -n "heroWrapper) {" assets/js/main.js` — should `resolve(); return;` immediately, no bar writes.

### 1.4 Phantom always-on rAF loop removed
**File:** `assets/js/particle-morph-system.js` (~line 329)
A second self-scheduling `requestAnimationFrame` loop ran forever (60–120 callbacks/sec,
even while the particle layer was hidden) polling `triggerManager` for "time triggers" —
which nothing on the site ever registers (`registerTime` is gated behind `config.enableTime`,
never set). Replaced with a 500ms `setTimeout` poll that only upgrades to rAF cadence if a
time trigger is ever actually registered.
**Verify:** `grep -n "setTimeout(updateFrame, 500)" assets/js/particle-morph-system.js`

---

## 2. Scroll-time cost

### 2.1 Profile palette-shift color regen throttled
**File:** `assets/js/scroll-scrub-anim.js` (`invertParticles`, ~line 265)
This scroll-scrubbed callback (drives the profile section's "invert to opposite theme" effect,
and extends to the footer in dark theme) did a **GPU-backed canvas readback**
(`parseColorToRGB` → `getImageData`, the literal cause of `GL Driver Message … GPU stall due to
ReadPixels` warnings seen while profiling) plus a full 16k-particle color regeneration and
buffer re-upload, **on every scroll frame** through the whole shift ramp. Now quantized to 25
visually-identical steps and the "normal" endpoint colors are memoized per theme, so the heavy
path only runs when the visible step actually changes (≈4× fewer calls, zero redundant ones).
**Verify:** `grep -n "particleT === invertParticles.__lastT" assets/js/scroll-scrub-anim.js`

### 2.2 Hero disperse/terrain trigger fires on scroll *start*, not mid-scroll
**File:** `partials/particle-morph.hbs` (both the GPU trigger block and its legacy twin)
The hero-exit trigger used to be `start: 'bottom center'` (element-relative — didn't fire
until ~half a viewport of scroll had already happened, reads as "particles lag behind").
Both trigger twins now use absolute scroll positions (`start: 8, end: 9`) so the hero
shape reacts the instant scrolling begins. It currently morphs to `'terrain'` (not
`'dispersed'`) on exit — a continuous relief-plane deformation instead of scattering, since
volatility and terrain are both ground-plane shapes.
**Verify:** `grep -n "'hero-exit', 'terrain'" partials/particle-morph.hbs` (should match twice)

---

## 3. Low-end device handling

`window.__lowEndDevice` (set in `assets/js/device-capability.js` from `hardwareConcurrency`,
`deviceMemory`, and a pre-2017-Intel-iGPU renderer-string regex) gates everything in this
section. `html.low-end` is added to `<html>` for the same population, so CSS can degrade
without any JS coupling.

### 3.1 Backdrop-filter removed entirely
**File:** `assets/css/main.css` (~line 7952, `html.low-end` block)
This was **the single biggest fix**, found via `showPerfHUD()` on the actual reported machine
(a 2014 MacBook Pro, Iris Pro): re-blurring the nav's backdrop every frame while animated
particles sit beneath it was costing more than the particle system itself — **measured
24–30fps/50ms-worst-frame at rest → 60fps/18ms** after removing it. Every `backdrop-filter`
on the page is disabled for this tier; glass surfaces fall back to a high-opacity solid
`color-mix()` background.
**Verify:** `grep -n "html.low-end \* {" assets/css/main.css`

### 3.2 `ScrollTrigger.normalizeScroll(true)` on low-end
**File:** `assets/js/scroll-scrub-anim.js` (`init()`, ~line 39)
The actual root cause of "scrub animations don't move during continuous scrolling, only snap
when scrolling stops": on weak integrated GPUs, native scroll runs on the compositor thread
while main-thread rAF (which scrub animations depend on) starves — the two pipelines
desynchronize. `normalizeScroll` routes scroll input through GSAP's own rAF tick so they
structurally cannot diverge. This is GSAP's own canonical fix for this exact symptom.
**Verify:** `grep -n "ScrollTrigger.normalizeScroll(true)" assets/js/scroll-scrub-anim.js`

### 3.3 Scrubbed text-reveal blur skipped
**File:** `assets/js/scroll-scrub-anim.js` (`blurStart`, ~line 17, and one inline instance ~line 435)
`filter: blur()` animated against scroll means the GPU re-runs a Gaussian blur over the text
on every scroll frame — one of the most expensive paint operations available, happening
exactly while scrolling. `blurStart` resolves to `'0px'` on low-end (same value as the end
state, so GSAP still tweens but the filter is a no-op and the blur pass is skipped).
**Verify:** `grep -n "__lowEndDevice ? '0px'" assets/js/scroll-scrub-anim.js`

### 3.4 What was tried and then explicitly reverted
Two more particle-specific gates were added during diagnosis (pausing the particle render loop
during active scrolling on low-end, and a half-cadence frame cap) — **both were removed at
user request** once 3.1–3.3 above were confirmed as the actual root causes. Particles render
at full quality/cadence on every device tier today; do not reintroduce a low-end particle
degradation without a specific new reason.
**Verify:** `grep -n "_frameFlip\|__lastScrollTs" assets/js/particle-animation-loop.js` → should be empty.

---

## 4. Particle scenario system (what shows where)

**File:** `default.hbs`, ~line 386 (`window.PARTICLE_SCENARIOS`)

A declarative section → behavior map. Every particle trigger site (both the GPU path and the
legacy-THREE.js twin in `partials/particle-morph.hbs`, plus the hero entrance poll in
`scroll-scrub-anim.js`) routes through one resolver, `window.__particleApply(system, key,
builtinShape, duration)`, instead of calling `morphTo()` directly:

- key **absent / empty string** → the trigger's own built-in shape plays normally
- key → `'hide'` → the whole particle layer fades out (0.6s) **and its render loop actually
  stops** (verified: 0 frames/sec while hidden) — not just CSS-invisible
- key → any shape name → morphs to that shape instead of the trigger's default

```js
window.PARTICLE_SCENARIOS = {
  full: {},                       // every section gets its particle shape
  'hero-footer': {                // particles ONLY in hero + footer (current default)
    'hero-exit': 'hide', 'operating-model': 'hide', 'helix-section': 'hide',
    profile: 'hide', 'profile-exit': 'hide', stats: 'hide',
    'work-grid': 'hide', 'work-cards': 'hide', lab: 'hide',
    testimonials: 'hide', 'footer-exit': 'hide',
  },
};
window.PARTICLE_SCENARIO = localStorage.getItem('particle_scenario') || 'hero-footer';
```

**To change what's shown:** edit the `'hero-footer'` object (or add a new named scenario) and
point `PARTICLE_SCENARIO`'s fallback at it. To preview without a code change, run
`setParticleScenario('full')` (or any scenario name) in the console — persists to
localStorage and reloads.

Separately, `HERO_PARTICLE_MODE` (`'volatility'` | `'helix'`, same file, ~line 383) picks
which shape the hero itself uses — flip to `'helix'` to fully restore the original hero
particle look; this is independent of the scenario map above.

Note: `/work/`, `/about/`, `/contact/`, and posts are excluded from the particle system
entirely upstream (`partials/particle-morph.hbs`'s `isPostPageOrExcluded`, container
`display:none`) — the scenario map's `hide` entries never even get exercised there.
**Verify:** `grep -n "PARTICLE_SCENARIOS\|isPostPageOrExcluded" default.hbs partials/particle-morph.hbs`

---

## 5. Page-entrance system (flash-free reveals)

Three related problems, one shared mechanism: **CSS pre-hide, set synchronously in the real
`<head>`**, before the browser can paint anything. A `gsap.set()` fired on `DOMContentLoaded`
is measurably one frame too late — the browser had already painted the raw HTML by then.

**File:** `default.hbs`, ~line 200 (inline script before `</head>`)

| Class | Applies to | Cleared by |
|---|---|---|
| `html.landing-pending` | `/` on same-site arrival | `page-transition.js` landing branch, or its own 2.5s failsafe |
| `html.main-pending` | work/about/contact/post, **every** load (not referrer-gated — direct/external loads need it too) | `runLandingAnimation()`'s non-home branch, or its own 2.5s failsafe |
| `html.curtain-restoring` | `/` when a post-close scroll restore targets mid-page | first real trigger application in `__particleApply`, or its own 8s failsafe |

Each failsafe timeout exists so a page type the mechanism doesn't apply to (tag archives, etc.)
can never get stuck hidden.

### 5.1 Homepage same-site-nav entrance
`window.__pageEntranceOwns = true` is set alongside `landing-pending`. This suppresses the
hero's *own* inner choreography (the text stagger in `scroll-scrub-anim.js`'s `initHero()`,
and the image fade in `main.js`'s `animateImageEntrance`) so the homepage plays **one**
entrance (page fade + hero slide-up), not two stacked ones. Before this, the page-level
slide+fade and the hero's ~1.3s internal stagger both played, which read as "extra" motion
compared to about/work's single short entrance.
**Verify:** `grep -n "__pageEntranceOwns" assets/js/scroll-scrub-anim.js assets/js/main.js`

The tween itself doesn't start blind — a small probe waits for two consecutive rAF deltas
under 100ms (proof frames are actually flowing; homepage init can block paint for ~1s) before
playing the slide, with a 1.2s hard failsafe. The slide lives on `.hero` itself (a `position:
fixed` element), never on `.home` — transforming `.home` would make it the containing block
for the fixed hero and desync every pinned section's ScrollTrigger measurements.

### 5.2 Curtain-return (post → close) fade
`runCurtainEntrance()` in `page-transition.js` now clears **both** `landing-pending` and
`main-pending` the instant it takes over (~line 174) — those veils are set unconditionally on
arrival and previously only the normal landing branch removed them, so a curtain return sat
fully hidden for the entire ~2.5s failsafe window before content popped in all at once. Now:
veil drops within ~100ms, then the existing scroll-sweep + fade plays at the correct position.

---

## 6. Reveal-backfill guardrail (post → close scroll restore)

**File:** `assets/js/card-scroll-reveal.js` (`window.__revealBackfill`, ~line 388), called from
`assets/js/page-transition.js` at 450/1200/2500ms after a curtain-return sweep, and again on
every late layout-settling `ResizeObserver` correction.

The scroll-restore sweep (`scrollThrough()` in `page-transition.js`, a ~350ms eased
`requestAnimationFrame` pass from 0 to the saved scroll position) exists so
`IntersectionObserver`-based reveals fire the way they would on a real scroll — a plain
`scrollTo()` jump skips every intermediate position and strands anything above the target in
its hidden initial state. But the sweep **cannot be fully relied on either**: homepage init
blocks painting for ~1s, degrading the animated sweep into a few large jumps, and IO only
evaluates at frame boundaries — plus the reveal callbacks require `isScrollingDown &&
isInBottomHalf`, conditions a fast sweep can fail even when IO does fire.

`__revealBackfill(maxDocY?)` is the actual guardrail: it force-reveals (final `gsap.set` state
+ marks the same `revealed` `WeakSet`s a real reveal would, observers stay attached) every
registered element — images, all card variants, late-added cards via `observeCardReveal`, the
mobile tabs panel — whose document position is at or above the current viewport bottom. No
observers, no scroll direction, no thresholds involved. Elements below the fold are left alone
and reveal normally on real scrolling.

**Verified** at three restore depths (4vh / 7vh / 12.5vh scroll targets): zero stuck-hidden
elements in every case.

**Rule for future reveal systems:** any *new* `IntersectionObserver`-based reveal added to the
site must register into this backfill (or route through `observeCardReveal`) or it **will**
strand elements on post→close restore.
**Verify:** `grep -n "__revealBackfill" assets/js/card-scroll-reveal.js assets/js/page-transition.js`

---

## 7. Diagnostic tools (console)

All defined in `default.hbs`, all safe to leave in production (no-ops until invoked):

| Command | Effect |
|---|---|
| `showPerfHUD()` | Small overlay, top-right: live rAF fps / scroll events per sec / worst frame gap. `showPerfHUD(false)` removes it. **This is how the 2014 Mac's actual numbers were captured** — always reach for this before guessing at a performance fix. |
| `setScrubEnabled(false)` | Disables every scrub-driven `ScrollTrigger` with `revert(true)` — content falls back to its plain visible CSS state, page stays fully readable, just static. `setScrubEnabled(true)` restores. Persists via localStorage + reload. |
| `setAnimationsEnabled(false)` | Superset of the above: also completes all GSAP tweens instantly (`globalTimeline.timeScale(1000)`), zeroes every CSS transition/animation (`html.no-anim`), and hides the particle layer with its render loop never started. `setAnimationsEnabled(true)` restores. |
| `setParticleScenario('name')` | Switches the active particle scenario (see §4) at runtime. Persists + reloads. |

**IMPORTANT — console.log is silenced by default.** `default.hbs` overrides `console.log`/
`console.warn` to no-op unless `window.DEBUG_SCROLL === true` (there are ~300 scroll/particle
debug logs in this codebase that would otherwise spam every session). If you ever think
logging "isn't working" — including a hand-typed `console.log('test')` printing nothing —
this is almost certainly why. Run `window.DEBUG_SCROLL = true` first. `console.error` is
never gated by this (always visible, matching the "always log errors" convention elsewhere in
the codebase).

---

## 8. Known-idle items (measured, not worth fixing yet)

- Dormant, uninitialized `#gpu-canvas` (300×150) sits in the DOM on some pages — harmless, no
  render cost, just unused markup.
- `theme.js`'s Ghost-portal-iframe `MutationObserver` watches the whole `<body>` for the site's
  entire life. Small but perpetual; only worth touching if a future profile shows it matters.
- `heading-animations.js` registers one scroll listener per heading (~5 on a typical page) —
  measured ~6ms total per full-page scroll. Sloppy, not costly.
- GSAP's own ticker running at display refresh rate — expected, not a bug.

## 9. Deliberately not attempted

- **`content-visibility: auto`** on below-fold sections — theoretically the biggest remaining
  scroll win, but this codebase's scroll-trigger position math is its most fragile area (see
  `TRIGGER-SYSTEM-ISSUES.md`); changing layout/paint timing under it needs a full trigger
  regression pass first, not a quick patch.
- **Responsive image `srcset` audit** — real, valid lever (oversized bitmaps cost decode +
  compositing time on old GPUs) but is a content/Ghost-admin task, not a code change, and
  wasn't scoped into this pass.
- **Deferring Google Analytics** to post-load — small load-time win, but changes analytics
  timing semantics; flagged previously as the user's call, not made unilaterally.
