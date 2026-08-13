# Performance Optimizations & Low-End Device Handling

Verified live against the running theme on 2026-07-21; §1.5, §1.6 and the §1 weight baseline
added and verified 2026-07-25. Every item below was re-checked in the
actual files (not memory) before being listed — see the "Verify" line under each entry to
re-confirm it yourself later. If any of these ever seem not to be working, run its Verify
command first; don't assume the description of the fix is still accurate.

---

## 1. Load-time (first paint / DOMContentLoaded)

**Homepage weight baseline** (measured 2026-07-25, cold cache, after 1.5/1.6). Ghost serves
text assets **brotli-compressed** (~4× reduction) but images and `.glb` binaries uncompressed —
so on-disk size badly misranks the real cost. Wire weight is what's listed:

| Asset | Wire | Note |
|---|---|---|
| `three.min.js` (CDN) | ~160 KB | 654 KB raw — largest single script |
| Local JS ×69 files | ~250 KB | 949 KB raw, unbundled |
| Local CSS ×13 files | ~120 KB | 482 KB raw (`main.css` = 291 KB) |
| HTML | 44 KB | 153 KB raw |
| GSAP + ScrollTrigger | ~30 KB | |
| **Total** | **≈ 2.7 MB** | was ≈ 8.9 MB before 1.5/1.6 |

Re-measure wire weight with:
`curl -s -H "Accept-Encoding: br, gzip" <url> | wc -c` — *not* `ls`/`stat`, which report raw
bytes and will make text assets look ~4× worse than they are.

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

### 1.5 Unused 6.24 MB portrait preloads removed (2026-07-25)
**File:** `default.hbs` (`<head>`, just after the `@site.cover_image` preload)
`prem-front-dark.png` and `prem-front-light.png` (**3.04 MB each**) were preloaded with
`fetchpriority="high"` on **every page of the site** — and no live template rendered either
one. The partials that used to show them are in `backup/`; `partials/testimonials.hbs`'s copy
is inside an HTML comment and `partials/hero.hbs`'s is inside a `{{!-- --}}` block, so
neither reaches the browser as a live reference. Being *high* priority, they also queued
**ahead of** fonts, CSS and `three.min.js`, delaying first paint on top of the wasted bytes.
The PNGs remain on disk — only the preload tags were removed. If a portrait is ever
reintroduced, preload the **one** theme variant actually painted above the fold, not both.
**Result measured:** homepage eager transfer ~8.9 MB → ~2.7 MB when combined with 1.6 (**−8.2 MB**).
**Verify:** `grep -rn "prem-front" --include="*.hbs" . | grep -v backup/` — every hit must be
inside a comment. Definitive check (0 = correct):
`curl -s http://localhost:2369/ | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log((d.replace(/<!--[\s\S]*?-->/g,"").match(/prem-front/g)||[]).length))'`

### 1.6 Eager GLB shape preloading removed, both copies (2026-07-25)
**Files:** `default.hbs` (`<head>`) **and** `assets/js/preloader.js` (`GLB_FILES`)
The eight `.glb` morph shapes (~**2.0 MB**, of which `mobile.glb` alone is **1.47 MB**) were
being fetched **twice per load**: once by `<link rel="preload">` in `<head>`, and again by
`preloader.js`'s `GLB_FILES` list. Worse, the `preloader.js` copy **gated preloader
completion** — `_total` counted all 9 files and `_onAllLoaded()` only fired once every one
resolved, so the completion chain waited on multi-megabyte models.

Nothing above the fold ever needed them: the hero shape is `helix`
(`window.HERO_PARTICLE_MODE`, `default.hbs`), which is generated **procedurally** and loads no
GLB at all. Every one of these files is a morph target for sections further down the page.
Shapes now load on demand at first morph.

Two supporting changes in `preloader.js`: `_total` counts only `VIDEO_FILES`, and
`_startLoading()` gained a `_total === 0` short-circuit to `_onAllLoaded()`. That guard
matters because the 8s safety timer lives **inside** `_finish()` — if the tracked list ever
empties, nothing recovers it. The overlay itself is force-hidden site-wide
(`#preloader { display: none !important; }`, `default.hbs`), so a stall would not visibly
block the page; what stalls is `preloader:done` / `window.__preloaderDoneFired`, which the
particle bootstrap and other listeners wait on.
**Verify:** `grep -n "GLB_FILES\|_total === 0" assets/js/preloader.js` — `GLB_FILES` must
appear only in comments. And `curl -s http://localhost:2369/ | grep -c 'rel="preload"'` → `0`
(unless `@site.cover_image` is set).

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

## 2A. GPU compositing / layer-churn flicker (2026-08-09)

Different failure class from the rest of §2: not extra JS work per scroll frame, but the
**compositor discarding and rebuilding a GPU layer** for an element that was never pinned to a
stable one. Symptom is a visible flicker with **zero Paint-flashing activity** (DevTools
Rendering tab) — because nothing is being repainted, a layer boundary is being torn down and
recreated. Diagnosed via DevTools "Layer borders" (not Paint flashing, not a Performance
trace, not source-reading — all three were tried first and found nothing on this bug; see the
retro below). Confirms `isolation: isolate` + `transform: translateZ(0)` (a promotion pair, not
either alone — `will-change` on the wrong element, e.g. a parent when the actual moving
property is on a `::before`, is a documented no-op, see §2A.2) as the fix pattern for any
`position: fixed`/`sticky` element that is full-viewport or near-full-viewport sized, sits at a
high z-index above continuously-repainting content (the particle canvas, mainly), and shows
persistent flicker with clean Paint-flashing.

### 2A.1 `.gh-navigation` outer shell had no compositing layer at all
**File:** `assets/css/main.css` (`.gh-navigation`, ~line 1917)
The visible glass pill is `.nav-wrapper` (247×64px) — but it lives inside `.gh-navigation`, an
invisible 1440×88px `position: fixed` shell at `z-index: 10001`, spanning the full viewport
width, sitting directly above the WebGL particle canvas. That outer shell had `isolation: auto`
/ `transform: none` — nothing pinning it to a layer — so the compositor had to keep deciding
whether it needed a new one as content moved beneath it, every frame, forever, on every page.
Confirmed directly (not inferred) via Layer borders: **two nested orange outlines**, the outer
one loosely sized well past the visible pill — matching this element's own oversized box
exactly — both flickering together, with zero green paint-flashing.
**Verify:** `grep -n "LAYER-BORDER FLICKER FIX" assets/css/main.css`

### 2A.2 `will-change` on the wrong element is a silent no-op
**File:** `assets/css/glass-liquid.css` (`.glass-liquid::before`, ~line 183)
`will-change` only ever optimizes the element it's declared ON — never a pseudo-element or
descendant. An earlier pass put `will-change: backdrop-filter` on `.glass-liquid` (the parent),
but the actual `backdrop-filter` lives on `.glass-liquid::before` (the parent's own is forced to
`none` so only one blur pass runs). WebKit/Safari promoted the pseudo's layer anyway via the
parent's `translateZ(0)` alone and rendered fine; **Chromium and Firefox did not** — blur/tint
computed correctly in DevTools but never actually composited on screen. Moving
`will-change`/`transform`/`backface-visibility` onto the pseudo-element itself (where the
backdrop-filter actually is) fixed it in both engines. Filed here as a reusable lesson: when
promoting an element for a property that lives on its `::before`/`::after`, the promotion
declarations belong on the pseudo, not the parent.
**Verify:** `grep -n "\.glass-liquid::before {" -A 6 assets/css/glass-liquid.css | grep will-change`

### 2A.3 Nesting two independently-promoted elements couples their stacking
**File:** `partials/navigation.hbs` (`.nav-progressive-blur`, moved to a sibling of `<nav>`)
Fixing 2A.1 (`isolation: isolate` on `.gh-navigation`) had an unplanned side effect:
`.nav-progressive-blur` was a DOM **child** of `<nav class="gh-navigation">`, and `isolation`
makes an element establish a *new* stacking context for its descendants — so the blur pane's
`z-index: -1` silently stopped meaning "behind the page" and started meaning "behind its now-
isolated sibling `.nav-wrapper`," visibly reordering which pane painted on top. Both elements
are `position: fixed`, so nesting was never load-bearing for where either one *paints* — it only
ever coupled their stacking, invisibly, until one needed a fix the other didn't ask for.
Un-nested them (siblings in the DOM now); each element's `z-index` resolves independently again.
**General lesson:** two elements that both need independent GPU-layer promotion should not be
DOM-nested unless the nesting is otherwise required — `isolation`/`transform` on one changes
stacking-context math for every descendant, not just itself.
**Verify:** `grep -n "SIBLING OF <nav>, NOT a child" partials/navigation.hbs`

**Retro — what did NOT find this, for next time:** a Performance-tab trace and repeated
Paint-flashing checks both came back clean because there genuinely was no scripting/painting
cost — the bug was two layers'-worth of compositor churn with nothing to show on either of
those tools. Console-based frame-timing probes (recording `requestAnimationFrame` deltas) also
came back clean for the same reason: a torn-down-and-rebuilt layer boundary doesn't cost a long
task or a slow frame by itself, it just repaints boundary/tile metadata. **Layer borders was the
only overlay that showed it.** If a flicker survives with clean Paint-flashing and no long
tasks, check Layer borders next, before spending more time on JS-side profiling.

### 2A.4 Other `position: fixed` + `backdrop-filter`/`filter` combinations (not yet audited)
Found while looking for siblings of the bug above; neither looks likely to reproduce it today,
but both are the same *shape* of risk (a filter/backdrop-filter on a fixed element with nothing
pinning it to a layer) and are worth a real check if either area ever gets its own flicker
report:
- **Sodo Search overlay/backdrop** (`assets/css/main.css`, ~line 6532) —
  `backdrop-filter: blur(4px)` on a `position: fixed !important`, full-viewport overlay. Lower
  risk than §2A.1 was: it's transient (search modal only), animates in once
  (`backdrop-fade-in`), and sits over largely static content rather than the continuously-
  repainting particle canvas — but it has never been checked with Layer borders open.
- **`.gh-navigation::before` / `::after`** (`assets/css/main.css`, ~lines 2026–2105) — two more
  `backdrop-filter: blur(32px)` nav-area layers, same z-index neighborhood as §2A.1. Checked
  during this investigation and found **entirely commented out** (dead code, currently inert) —
  noted here so they aren't mistaken for live and re-investigated from scratch later. If ever
  re-enabled, promote them (or confirm `.gh-navigation`'s own promotion, §2A.1, already covers
  them as descendants) before shipping.
**Verify:** `grep -n "backdrop-filter" assets/css/main.css | grep -v "^\s*//"` then check each
hit's element against `position: fixed` + promotion, same method as §2A.1.

### 2A.5 Custom-scrollbar-thumb writer left running with nothing consuming it
**File:** `assets/js/ui-utilities.js` (`initCustomScrollbar`, removed) + `assets/js/main.js` (its
call site, removed)
A scroll handler wrote `--scroll-thumb-top`/`--scroll-thumb-height` to `<html>`'s inline style on
**every scroll frame, unthrottled** (no quantize, no zone gating), on every page — for a custom
scrollbar-thumb visual that no longer exists: grepped every CSS file, **zero** rules ever
consumed either property. The site actually uses a *restyled native* scrollbar
(`::-webkit-scrollbar-thumb`, main.css ~line 1775) — this handler was the orphaned JS half of an
abandoned earlier design.
Measured while investigating the nav/blur-pane flicker (§2A.1–2A.4): over ~1s of scrolling on
`/about/`, this fired **46 times each (92 total) — nearly 3x** the already-throttled
`--profile-shift` writes (16) from the *same* `<html>` element in the same window. Removing it
dropped total `<html>` inline-style writes **119 → 27** (−77%) over identical scrolling.
**Verify:** `grep -n "function initCustomScrollbar" assets/js/ui-utilities.js` → should be empty
(only the explanatory comment referencing the old name remains, not a live function).

### 2A.6 Whole-page continuous repaint from an animated `background-position` (2026-08-09)
**File:** `assets/css/main.css` (`.gradient-aura-frame::before`, ~line 299; shared
`@keyframes page-gradient-aura`, ~line 259)
The biggest single finding of this investigation, and a different mechanism from 2A.1–2A.5
above: not layer churn (a stable GPU layer being torn down/rebuilt, invisible to Paint
flashing), but a **genuine, continuous, page-wide repaint** — visible directly as Paint flashing
showing solid green across the *entire* page, permanently, independent of scrolling.
`.gradient-aura-frame` wraps the whole `<article>` on **post pages** (`post.hbs`) and is also
used on About and the hero — measured live on a real post at **1440×11067px**, i.e. the full
page's scroll height at full viewport width. Its `::before` pseudo-element animated
`background-position` on a 4-stop radial-gradient background, `24s linear infinite`, forever,
on every page load. `background-position` is a **paint** property, not a compositor one —
animating it forces the browser to re-rasterize that entire area on every frame, regardless of
whether the user is scrolling, hovering, or doing anything at all.
Confirmed live (not inferred from source): sampled the pseudo-element's own computed
`background-position` 1 second apart and it had moved — i.e. it was genuinely running,
continuously, the whole time the page was open.
**Solution:** `animation: none` on `.gradient-aura-frame::before`. Turned off outright rather
than reworked to a compositor-safe (`transform`-based) version, since this component wraps
three different page types and a visual rework needs a review pass across all three — out of
scope for a flicker fix. The `@keyframes` block is kept on disk (not deleted): a sibling rule,
`.page-gradient-blobs`, shares it, though that component's own trigger `<div>` is currently
commented out in `default.hbs` and so is already inert regardless.
**A near-miss worth recording:** `.page-gradient-blobs` looked like a second live instance of
the same bug (also `animation: page-gradient-aura ... infinite`, also full-viewport
`position: fixed`) — but checking the actual DOM showed its target element
(`#page-gradient-blobs`, `default.hbs` ~line 536) is wrapped in an HTML comment and never
renders. Confirmed inert before touching anything; don't re-flag it without re-checking that
comment is still there.
**General lesson:** an animated `background-position` (or any property outside the
transform/opacity/filter-on-its-own-layer compositor set) on a large or full-page element is a
standing, unconditional repaint cost — not something that only shows up under load or on
scroll. `grep -n "animation:" assets/css/main.css` and check each hit's `@keyframes` for
anything other than `transform`/`opacity` before assuming an infinite animation is compositor-
cheap.
**Verify:** `grep -n "ANIMATION DISABLED SITE-WIDE" assets/css/main.css` should show one hit,
just above `.gradient-aura-frame::before`'s `animation: none;`; `grep -n "@keyframes
page-gradient-aura {" assets/css/main.css` should return exactly one match (the real
declaration — a second, non-brace mention may appear inside a comment, that's expected).

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
**See also:** `FLICKER-INVESTIGATION.md` (2026-08-09) — an accidental software-rendering session
(Chrome's GPU process was disabled) re-measured this cost on *capable* hardware and enumerated
every live `backdrop-filter` on the homepage: 25 elements, dominated by the 5 stacked
`.nav-blur-layer` panes (blur 2/6/14/24/36px, 282k px² each). Blur cost scales with radius
**squared**, so the 36px layer alone is ~300× the per-pixel work of the 2px one. Also flags that
`.post-card-keyword`'s `background` is commented out — those pills pay for a `blur(20px)`
backdrop pass with a fully transparent background over it.

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
- **Unused Google Fonts weight axes** (`default.hbs` stylesheet URL). The request spans
  100–900 across Crimson Pro + DM Sans, but `--primitive-font-weight-thin` is `300` and only
  **one** rule in the codebase uses `200` (`main.css`, `font-weight: 200`). The **100** axes
  are downloaded and never used. Small (subset woff2 per axis) but free to reclaim — narrow
  the URL when next touching type.
  **Verify:** `grep -rnE "font-weight:\s*(100|200)" assets/css/*.css`
- **69 unbundled JS + 13 CSS files** on the homepage — 82 requests. HTTP/2 multiplexing
  softens this, so it is connection/parse overhead rather than transfer weight; a build step
  is the fix, and that is a bigger change than this pass scoped.
- `b2b.mp4` is **10.87 MB**, but `preloader.js` loads videos at `preload='metadata'`, so only
  the moov atom is pulled, not the file. Costs a connection, not bulk transfer. Worth knowing
  before anyone "optimises" it in a panic.

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
