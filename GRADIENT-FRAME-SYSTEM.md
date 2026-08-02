# Gradient Frame System

Wrap any block of content and it gets an animated WebGL gradient band above
and below it, optionally flipping the whole page's palette (nav, body ink,
surfaces, icons) while the visitor is inside it.

**Files**

| File | Role |
|---|---|
| `assets/js/gradient-frame.js` | The component. Injects the bands, resolves colours, drives the palette shift. |
| `assets/css/gradient-frame.css` | Band layout, the invert-mode token overrides. |
| `assets/js/gradflow-background.js` | WebGL renderer (ogl). Owns the rAF loop, resolution scaling, offscreen pause. |
| `assets/js/gradflow-shaders.js` | GLSL source + config defaults. Data, not logic. |
| `assets/js/background-layer.js` | `bindShift()` — the scroll→scalar driver. Shared with `.profile`. |
| `assets/css/tokens.css` | The shift palette (`--shift-*`) and icon polarity tokens. |

Reference implementation: `partials/posts-tabs-grid-lab.hbs` +
`assets/css/posts-tabs-grid-lab.css`.

Related: **`BACKGROUND-LAYER-SYSTEM.md`** documents `bindShift()`'s scroll
maths and design rules in depth. This doc covers the frame and the options
added for it.

---

## Usage

```hbs
<div class="gradient-frame" data-gradient-frame data-gradient-mode="invert">
  ...any content...
</div>
```

No per-section JS. `gradient-frame.js` is loaded site-wide in `default.hbs`
and auto-initialises every `[data-gradient-frame]` on DOM ready.

### All options

Every one is optional; the values below are the defaults. Any colour value
may be a literal (`#61177c`) **or** a custom property name
(`--color-background`), which is read live and re-read on theme change.

| Attribute | Default | Meaning |
|---|---|---|
| `data-gradient-mode` | `theme` | `theme` or `invert` (see below) |
| `data-gradient-outer` | per mode | Band edge facing the page |
| `data-gradient-inner` | per mode | Band edge facing the content |
| `data-gradient-wave-a` / `-b` | `#61177c` / `#2e073e` | Base wave's two colours |
| `data-gradient-scale` | `0.5` | Base wave frequency — the "squiggliness" knob |
| `data-gradient-speed` | `0.7` | Base wave animation speed |
| `data-gradient-wave2-a` / `-b` | base pair | Second wave's colours |
| `data-gradient-wave2-opacity` | `0.55` | `0` disables the second wave entirely |
| `data-gradient-wave2-scale` | `1.4` | **Must differ from `scale`** or the two stack instead of crossing |
| `data-gradient-wave2-speed` | `0.45` | |
| `data-gradient-wave2-center` | `0.52` | Where the second band sits vertically (0 = bottom edge) |
| `data-gradient-wave2-width` | `0.34` | Its thickness |
| `data-gradient-parallax` | `0.05` | Base layer drift per viewport-height of scroll |
| `data-gradient-wave2-parallax` | `-0.09` | Opposite sign ⇒ the layers slide past each other |
| `data-gradient-enter-span` | `0.5` | Palette-shift ramp length, in viewport heights |
| `data-gradient-exit-span` | `0.5` | Revert ramp length |
| `data-gradient-resolution-scale` | `0.35` | Fraction of device pixels the bands render at |

Band height is CSS: `--gradient-frame-edge-height` (default `480px`).

> The Lab section spells all of these out explicitly even where they match
> the defaults, so the partial is a single tuning surface. Deleting an
> attribute falls back to the component default.

---

## The two modes

### `theme` (default)

Both band edges resolve to `--color-background`. The wave tints the middle
and **nothing else on the page changes** — no palette flip, nav and text keep
their normal colours, identical behaviour in light and dark.

### `invert`

The frame becomes a self-contained island of the opposite palette (light page
⇒ dark island, and vice versa) and drives the site-wide palette shift so the
fixed nav, body ink, surfaces and icons follow it.

The shift is **not reimplemented here** — it is
`BackgroundLayer.bindShift(frame, '--profile-shift')`, exactly what `.profile`
uses on the about page. Every
`color-mix(…, var(--shift-ink) calc(var(--profile-shift) * 100%))` rule
already in `main.css` reacts for free.

### A *fixed* palette is not a third mode

To make an island look identical in both themes, use `invert` and override
the shift tokens in CSS from the page that wants it:

```css
:root:has(#work-grid-lab) {
  --shift-bg:  #1B092C;
  --shift-ink: #ffffff;
  --icon-invert-shift: 1;      /* white icons on the island */
  --icon-brightness-shift: 1.2;
}
```

`:has()` with an id outranks both theme blocks in `tokens.css`, so a theme
toggle cannot move it. `--surface-1-shift` and `--glass-bg-shift` derive from
`--shift-ink`, so nav pill and badge fills follow automatically.

**Why `:root` and not the frame?** The nav is `position: fixed` and lives
*outside* the frame, so a subtree override structurally cannot reach it.

> **Was:** a JS `fixed` mode that pinned these at `:root` itself and used a
> colour-luminance heuristic (threshold 140) to guess icon polarity. Deleting
> it removed a mode, all `:root` writes from the component, the heuristic, and
> two data attributes — same result, less machinery.

---

## How a band is drawn

Both bands are **normal-flow divs injected by JS** as the frame's first and
last child. Existing children are never reparented (that would break scripts
holding references to them).

> **Was:** absolutely-positioned overlay slots. They sat on top of the
> content *and* got clipped at the section edge — the two bugs that forced
> this rewrite.

Each band is one `<canvas>` running `waveGradient` with **four colours**:

```
uv.y = 1 (top)     ── color4
                      ↕ wavy color2 ↔ color3 core
uv.y = 0 (bottom)  ── color1
```

The top and bottom bands are exact mirrors: whichever end faces *away* from
the content gets the page colour.

### Two invariants worth not breaking

**1. The edge colours are exact.** `uv.y = 0` is precisely `color1` and
`uv.y = 1` is precisely `color4`, regardless of wave settings. This is what
makes a band blend seamlessly into both the page and the content instead of
ending in a visible horizontal cut.

It works by **tapering the wave displacement** with `sin(uv.y * PI)` — zero at
both edges, full strength mid-band — so `flowingY == uv.y` exactly at the
edges. The `variation` term and the second layer's alpha carry the same taper
for the same reason.

> **Was, twice:**
> - *Originally* a 3-colour **cycle** (last stop wrapped back to `color1`),
>   so the same colour landed on both edges — no way to match a different
>   page colour above vs. content colour below. Hence the 4th colour.
> - *Then* the edge colours were derived from `pattern` (= `uv.y` **plus**
>   wave offsets up to ±0.45), so at `uv.y = 0` the pattern could already be
>   mid-wave and paint a wave colour. The band ended in mid-wave and read as
>   a hard cut.
> - *An intermediate fix* faded the **colours** toward the edges over
>   `uv.y 0→0.45` and `0.55→1`. That fixed the cut but left the waves only
>   10% of the band tall — the whole thing flattened into horizontal stripes.
>   **Taper the displacement, not the colour.**
>
> An earlier version also used a CSS `mask-image` to fade the band edges to
> transparent. The shader ramping to the real page colour is a genuine colour
> match rather than a transparency trick; the mask is gone.

**2. Two waves, one shader.** The second wave is composited *inside* the same
fragment shader — a shared `waveFlow()` helper evaluated twice, then alpha-
blended as a soft band. A second canvas would have meant another GL context,
another rAF loop, another observer. This costs a handful of extra `sin()`
calls.

A **different `scale`** is what makes the two cross rather than stack.
Parallax is applied to the *displacement* (which is tapered), never to the
ramp position — so it cannot reintroduce the edge seam.

---

## `bindShift` options added for this

`bindShift(triggerEl, varName, options)` writes a single scalar 0→1 and never
touches colour. See `BACKGROUND-LAYER-SYSTEM.md` for the core design. These
options were added here; **all default to the previous behaviour**, so
`.profile` is unaffected.

| Option | Default | Purpose |
|---|---|---|
| `enterSpan` | `1` | Enter ramp length in viewport heights. `1` is the geometric default (a full crossing); the frame uses `0.5` because at `1` the ramp only completes once the frame's top reaches the viewport *top*, by which point the island already fills the screen and the palette is visibly still catching up. |
| `exitSpan` | `1` | Same for the revert. |
| `endInset` | `0` | Pixels (number **or** function, re-evaluated each compute). Treats the end element as ending this far *above* its real bottom edge. The frame passes the bottom band's height: that band has already faded back to the page colour by its own lower edge, so the frame's box bottom is much later than the point the island stops being visible. |
| `quantize` | `0` (exact) | Snap the value to steps of this size. The frame uses `0.05`. |

### Why `quantize` exists

Every consumer of the shift is a colour blend, where ~20 steps is
indistinguishable from continuous. But the nav's glass layer carries
`backdrop-filter: blur(32px)`, so **each distinct value costs a full-width
blur re-rasterisation**. Snapping cuts those repaints several-fold while
staying position-derived — so unlike a time-based transition it still cannot
go stale on a fast flick.

Measured: 13 distinct values across a ramp instead of one per frame.

---

## What the shift touches

Driven entirely by `--profile-shift` via `color-mix()`. Nothing here is
frame-specific; it is the site's existing palette-shift surface.

| Token | Shifts toward | Consumers |
|---|---|---|
| `--color-on-surface` / `-variant`, `--color-primary` | `--shift-ink` | Body ink. Overridden **for the frame's subtree** (see below) |
| `--color-surface-1` | `--surface-1-shift` | Nav wrapper, active nav pill |
| `--glass-bg` | `--glass-bg-shift` | Keyword/badge fills |
| `.gh-navigation::before` background | `--shift-bg` | The nav glass tint |
| `--icon-invert-*` / `--icon-brightness-*` | — | Nav icon `filter: invert()` ramps |

### Subtree ink override

`invert` mode overrides the ink tokens **for its own subtree**, blending from
`:root`-level snapshots (`--gradient-frame-ink-base` etc.) because a custom
property cannot appear in its own definition. Descendants keep writing plain
`var(--color-on-surface)` and get the shifted value free — that's what lets
the component wrap *arbitrary* content without enumerating every text
element.

There is still exactly one writer of the real tokens (`theme.js` at `:root`),
so this does not recreate the stale-state race `BACKGROUND-LAYER-SYSTEM.md`
warns about.

### The page backdrop opts out

`:root:has(.gradient-frame[data-gradient-mode='invert'])` sets
`--shift-scope-page: 0` and `--shift-scope-panel: 0`. Otherwise
`#page-backdrop`'s full-viewport blend would push the inverted colour *past*
the bands into neighbouring sections — precisely the seam the bands exist to
prevent.

### Icon polarity

> **Was:** the icon filters hardcoded per theme on the assumption *"the shift
> always lands on the theme's opposite"*:
> `invert(calc(1 - var(--profile-shift)))` in dark, `invert(var(--profile-shift))`
> in light. A fixed palette breaks that — in whichever theme already matches
> the island, the icon inverted *into* the island and vanished while the nav
> text stayed correct.
>
> Now the ramp endpoints are tokens (`--icon-invert-base` / `-shift`, plus
> brightness) whose defaults reproduce the old per-theme behaviour, and a
> fixed palette redirects the endpoint. Applied to all three icons sharing
> that treatment: sun, moon, `.nav-icon-close`.

---

## Performance

| | Before | Now |
|---|---|---|
| GL draws while bands offscreen | ~84/s, forever | **0/s** |
| Band buffer (displayed 1440×480) | 1440×480 | **503×168** — ~8× fewer fragments |
| Distinct `--profile-shift` values per ramp | one per frame | **13**, on a 0.05 grid |

- **Offscreen pause** — `IntersectionObserver` (200px `rootMargin`) starts and
  stops the rAF loop, repeatedly. `u_time` runs off real elapsed time, so a
  resumed band picks up where it would have been, with no jump.
- **Reduced resolution** — `waveGradient` never reads `u_resolution` (pure
  `uv` + `u_scale`), so the shape is bit-identical; only sampling density
  drops. Verified: no visible banding at `0.35`.
- **Parallax scroll read** uses `window.scrollY`, not
  `getBoundingClientRect()` — the latter would force layout every frame. Only
  the relative change matters, which is identical either way. Both parallax
  values `0` skips the read entirely.

---

## Traps

**Never put a CSS `transition` on a property driven by `--profile-shift`.**
The value is already exact per frame; a time-based transition on top restarts
every frame and never converges. This bit twice:

- `.gh-navigation::before` had `transition: background-color 0.3s`. Measured
  **1.5–4s** to settle, which read as *"the glass doesn't invert at all"*
  mid-scroll. Removed — `opacity` still transitions, since that *is* a
  boolean toggle.
- `.nav-menu a` still transitions `background-color` for hover, so the pill
  lags ~1s on a hard scroll jump. Deliberately kept: removing it would make
  hover snap. Worth knowing when measuring.

**One `bindShift` per page writing `--profile-shift`.** Two bindings fight
through the handoff zone (one's exit ramp vs the other's enter ramp) and
last-writer-wins flickers. Enforced by convention only.

**Not every `--profile-shift` consumer has been audited** for the
"shift == theme opposite" assumption. The three icon sites were fixed; others
may exist and would break the same way under a fixed palette.

---

## The `gradflow` origin

`node_modules/gradflow` is a **React** component; this theme has no React
runtime. Its rendering core has no React dependency at all — it's the `ogl`
WebGL library driven from a `useEffect`. `gradflow-background.js` mirrors
that effect without the lifecycle; `gradflow-shaders.js` holds the GLSL,
originally copied verbatim and since modified (the 4th colour, the taper, the
second wave layer).

`ogl` resolves via the importmap in `default.hbs`, which **must stay the first
script in `<head>`** — an import map only applies to module resolution made
*after* it is parsed, and this one used to sit in `<body>`, below scripts
whose dynamic `import('ogl')` fired first.
