# Profile Background-Shift — Handoff

**Status: RE-ENABLED (2026-07-07).** All four unresolved issues below were
picked up, root-caused, fixed, and verified — see the RESOLVED notes appended
to each. `this.initProfileColorInvert();` is active again in
`scroll-scrub-anim.js`'s `init()`. To disable, comment that call out —
all the CSS it drives defaults to normal appearance via
`var(--profile-shift, 0)` fallbacks when nothing sets that property.

---

## What the feature is

As the profile section ("The design role is shifting.") scrolls into view,
its background, text, nav, and particle colors invert — the palette itself
"shifting" as a concrete metaphor for the headline. Full design writeup:
`BACKGROUND-LAYER-SYSTEM.md`.

**Update 2026-07-08 — targets are now THEME-AWARE, not fixed.** The original
fixed dark target (#141414/#22262E panel + white text) was dramatic in light
mode but nearly invisible in dark mode (dark-on-dark). The shift now always
goes to the OPPOSITE of the current theme, expressed as two tokens in
tokens.css (`--shift-bg`, `--shift-ink`): dark/dim sites shift to a light
panel (#F1F3F9) with dark ink; light sites shift to a dark panel (#22262E)
with white ink. Every color-mix rule blends toward `var(--shift-ink)`, the
panel paints `var(--shift-bg)`, the theme icons run per-theme filter ramps,
and particles blend toward the opposite theme's particle colour
(scroll-scrub-anim.js `PARTICLE_SHIFTED`). This is deliberately still NOT a
theme switch — `data-theme`, the toggle, and all theme tokens stay untouched;
it's a self-contained scroll transition any future section can reuse by
scrubbing a 0–1 property against the same tokens.

**Update 2026-07-08 (later) — the shift's PAINT SCOPE is now switchable**
via two 0/1 flags in tokens.css: `--shift-scope-page` (blend the
full-viewport `#page-backdrop` — the MAIN page background shifts; current
default) and `--shift-scope-panel` (the original section-clipped
`.profile::before` panel — kept fully functional; flip the flags to switch
back, no JS). Two constraints the page scope depends on, both commented at
the source: (1) `<body>`'s background must stay **transparent** — CSS paint
order puts negative-z elements below in-flow block backgrounds, so any
opaque body background (CSS or the inline one theme.js used to set) sits on
top of the backdrop and silently hides the blend (this bug shipped once);
`<html>` carries the anti-flash colour instead. (2) In dark mode at high
shift the particle bloom washes out — the canvas screen-blends against a
now-light backdrop and screen can only lighten. Cosmetic, panel scope has
the same issue inside the section box.

Short version of the mechanism:

- A generic utility, `assets/js/background-layer.js`, exposes
  `BackgroundLayer.bindShift(triggerEl, cssVarName, options)` — drives a
  plain `0-1` number onto a CSS custom property (`--profile-shift`), with
  viewport-height enter/exit ramps at the section's edges, scrub-exact.
  **Update 2026-07-08: rewritten from two ScrollTriggers to live
  getBoundingClientRect() geometry** (rAF-coalesced scroll/resize/
  ResizeObserver updates). ScrollTriggers bake positions to absolute scroll
  pixels; sections ABOVE the profile that grow dynamically after load
  (operating-model-stacked's pause system extending its pinned range,
  posts-tabs-grid's metadata fetches) shifted everything below and left the
  cached positions stale unless every such section remembered to call
  ScrollTrigger.refresh() — firing the shift early/partially/seemingly at
  random. This is very likely what the original "unreliable in real-world
  testing" reports actually were. Live geometry has no cache, so it is
  correct by construction regardless of what grows above it, with no
  refresh choreography — regression-tested by injecting +1500px above the
  profile post-load with no refresh (shift stayed exact: 0 / 0.5 / 1).
- `profile.css`'s `.profile::before` (a scoped pseudo-element, fixed color
  `#141414`) uses `opacity: var(--profile-shift, 0)` for the background panel
  — scoped to `.profile`'s own box so it structurally cannot bleed onto a
  neighboring section.
- Text (`profile.css`) and nav (`main.css`, `.nav-logo`/`.nav-logo-text`/
  `.nav-icon-btn`) use `color-mix(in srgb, var(--color-on-surface), white
  calc(var(--profile-shift, 0) * 100%))` — blends the *live* current theme
  token toward a fixed white, so it's never touching/racing with the
  theme-toggle's own tokens.
- Particles (`scroll-scrub-anim.js`, `initProfileColorInvert()`) blend
  `--color-particles` toward white too, via `onProgress`, with the raw
  progress value cubed (`t³`) specifically for particles so they don't start
  visibly shifting a full viewport-height before the (spatially-scoped, thus
  naturally-later-appearing) panel does.

## Bugs found and fixed during development (context, not action items)

1. Hard color-swap on scroll threshold caused a visible hard edge on fast
   scroll (time-based CSS transition can't keep up with variable scroll
   speed) → rebuilt as scroll-exact (`scrub: true`, no easing).
2. Ramping over a fraction of the *whole* enter-to-exit range finished the
   ramp before the section actually filled the viewport, bleeding the effect
   onto the still-visible previous section → rebuilt with viewport-height-
   tied ramps (see above).
3. Reusing `--color-background`/`--color-on-surface` (the same tokens
   `theme.js` writes to) raced with the sitewide theme toggle, producing
   stuck/inconsistent colors on toggle → rebuilt around a fixed palette +
   dedicated `--profile-shift` property + `color-mix()` against the live
   token, so nothing shares mutable state with the theme system anymore.
4. Particles (a global, always-visible canvas layer) visibly changed before
   the panel (spatially scoped, naturally invisible until on screen) since
   both shared the same linear ramp → fixed with the `t³` easing above.
5. A separate, unrelated post-cards-grid-lab fix (per-card metadata `fetch()`
   populating previously-empty description/title fields) could change page
   height after other `ScrollTrigger`s already measured positions below it →
   added a debounced `ScrollTrigger.refresh()` there.

Each of these was verified fixed via Playwright — see conversation history /
git-equivalent notes if exact verification numbers are needed.

---

## Known unresolved issues at hand-off — all RESOLVED 2026-07-07

### 1. Theme-toggle icon (sun/moon) does not invert — RESOLVED

**Fixed in main.css.** Both `.theme-icon-sun` and `.theme-icon-moon` now get
`filter: invert(var(--profile-shift, 0)) brightness(calc(1 + 0.2 *
var(--profile-shift, 0)))` in light mode — identity at shift 0, exactly the
dark-mode white treatment at shift 1. Verified computing correctly in
Chromium, Firefox, and WebKit.

Two traps discovered while fixing, now documented in main.css:
- theme.js shows the icon of the theme you'd switch TO: light mode displays
  the **moon**, dark mode the sun. A first fix targeting only
  `[data-theme='light'] .theme-icon-sun` was a silent no-op (that element is
  `display:none` in light mode) — hence both icons get the rule.
- All the CSS `opacity: 0/1` show/hide rules for these icons are dead: the
  shared `opacity: 1 !important` (GSAP isolation) overrides them. Inline
  `display` set by theme.js is the only real visibility gate.

### (original notes below, kept for context)

The nav logo/text/icon-button color-mix rules cover `.nav-logo`,
`.nav-logo-text`, `.nav-icon-btn` — but the actual sun/moon toggle icon
images (`.theme-icon-sun`, `.theme-icon-moon` in `main.css`) use a completely
separate mechanism: `filter: invert(1) brightness(1.2)`, gated directly on
the `data-theme` attribute, not on `--profile-shift` or `color-mix()`. **This
icon was never wired up and will not invert** while scrolled through the
profile section, even though the logo text next to it does. This is very
likely part of what "nav items didn't change to the opposite" refers to — if
the sun/moon icon was what was being watched, it genuinely never worked.

Fix direction if picked back up: give `.theme-icon-sun`/`.theme-icon-moon` a
`--profile-shift`-aware treatment too — either an alternate filter value
blended via a similar `calc()` trick, or (simpler) swap to an SVG using
`currentColor` + the same `color-mix()` pattern as the logo, dropping the
filter-based tinting entirely.

### 2. Never tested outside Chromium — RESOLVED

**Verified in Chromium, Firefox, and WebKit (Playwright), both themes — all
six combinations green.** In every one: `--profile-shift` reaches 1.0 inside
the profile section, the `::before` panel opacity tracks it, and
headline/description/nav-logo computed colors resolve to pure
`color(srgb 1 1 1)` at shift 1 via the exact
`color-mix(in srgb, var(token), white calc(var(--profile-shift) * 100%))`
syntax in question. The newer-CSS-feature concern is retired.

One real (transient, self-healing) issue surfaced by Firefox testing:
`invertParticles()` used to early-return *before* writing the
`--color-particles` var when the particle system wasn't initialized yet, so
scrolling into profile before particles were up and then stopping left
particles unshifted until the next scroll. Fixed in scroll-scrub-anim.js —
the var is now always written; only the `updateColors()` call is guarded.

### (original notes below, kept for context)

Every verification pass in this feature's development was via Playwright,
which drives Chromium. **No manual testing was done in Firefox or Safari.**
`color-mix()` is broadly supported in current evergreen browsers (Safari
16.4+, Firefox 113+, Chrome 111+) but the specific combination used here
(`color-mix()` reading a `calc()` expression built from a JS-written,
plain-number custom property) was never cross-browser verified. If "didn't
work reliably" describes different behavior on a specific browser, start by
checking that exact `color-mix()`/`calc()` syntax renders as expected there
— it's the one piece of this whole mechanism resting on a relatively newer
CSS feature.

### 3. Dark-mode preloader slowdown is a confound, not fixed — RESOLVED

**Root-caused and fixed — but the trace below was wrong.** Reproduced
exactly (13.8s dark / 7.0s light to `page-ready`), then instrumented:
`getLoopWhenReady()` was NOT the stall — `particleSystem.loop.currentState`
is ready at ~1s in *both* themes. Both themes are byte-identical through
`_finish()` at ~3.4s; the divergence is `_runParticles()`→`_hide()`: 2.4s in
light (exactly the scripted burst+settle+fade) vs 9.5s in dark. Cause:
dark mode renders with `UnrealBloomPass` (light mode disables the composer
via the inline theme patch in particle-morph.hbs), and on weak/software GL
bloom tanks the RAF rate — every stage of the finish sequence is
frame-driven, so it all stretches; even the 8s safety `setTimeout` fired
~1.5s late from main-thread jank.

Fix in particle-animation-loop.js: during a full preloader run,
`_initComposer()` is deferred until `preloader:done` (20s fallback timer as
belt-and-braces; `_composerInitStarted` guard makes it idempotent). The
preloader now renders via the same cheap direct path in both themes.
**Measured after fix: dark 7.5s, light 6.7s.** No visual cost — particles
sit behind the opaque preloader while it runs, and bloom kicks in right as
the hero reveals.

### (original notes below, kept for context — note the getLoopWhenReady
trace did not survive instrumentation)

Separately discovered, NOT fixed (deliberately left out of scope during this
work): the site's preloader takes roughly **2x longer** to reach
`page-ready` in dark theme than light theme (measured: ~6s light, ~13s dark).
Everything gated on `preloader:done` — including this whole feature — simply
isn't active yet if tested before that resolves. Traced to `_runParticles()`
in `preloader.js` stalling on `getLoopWhenReady()`'s poll for
`window.particleSystem.loop.currentState`. This predates this feature
entirely, but it's exactly the kind of thing that would make "it works in
one theme but not the other" true by pure timing, independent of anything
actually wrong with the shift mechanism itself. Worth ruling out first when
re-investigating "doesn't work in [theme] but does in [other theme]" reports
— confirm the page has actually finished loading (not just visually settled)
before concluding the shift logic itself is broken.

### 4. The particle "catch-up" easing (`t³`) was tuned by feel — CHECKED, KEPT

Screenshotted the enter ramp at progress 0.25 / 0.5 / 0.75 / 1.0 in both
themes. Numbers behave as designed (at 50% panel shift, particles are only
12.5% toward white; full white at 100%) and visually nothing shifts early —
no particle color change reads on the previous section, and the catch-up
lands with the panel. No retune needed.

### (original notes below, kept for context)

Chosen to make particles start shifting noticeably later than the panel, not
derived from any specific measurement of "when does the panel become
perceptually noticeable." Worth revisiting with actual before/after
screenshots at several progress values if the timing still feels off once
other issues are resolved.

---

## Files touched by this feature

- `assets/js/background-layer.js` — the generic utility (kept, unused while disabled)
- `assets/js/scroll-scrub-anim.js` — `initProfileColorInvert()` (defined but not called)
- `assets/css/profile.css` — `.profile::before` panel + `color-mix()` text rules
- `assets/css/main.css` — nav `color-mix()` rules (`.nav-logo`, `.nav-logo-text`, `.nav-icon-btn`)
- `default.hbs` — `<script src=".../background-layer.js">` tag (still loads, harmless if unused)

Related reading: `BACKGROUND-LAYER-SYSTEM.md` (full architecture/rationale),
`TRIGGER-SYSTEM-ISSUES.md` (how this fits — or doesn't — into the site's
broader, unconsolidated scroll-trigger patterns).
