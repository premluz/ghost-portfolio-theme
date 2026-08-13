# Flicker investigation — outcome and findings (2026-08-09)

## TL;DR

**The flicker was not a code defect.** Chrome's GPU process was disabled
(`chrome://gpu` → *"GPU process was unable to boot: GPU access is disabled in
chrome://settings"*, every feature reading `Software only` / `Disabled`), so the
entire site rendered on the CPU at ~4–6fps with 160–300ms worst frames. At that
frame rate everything on screen appears to stutter/flicker together.

The disabled GPU was **self-inflicted during this investigation** — hardware
acceleration was turned off as a deliberate diagnostic step and never turned back
on. Every measurement taken after that point was against a crippled browser,
including the "hardware acceleration off, still flickers" result that was used to
(incorrectly) rule out GPU compositing as the cause.

**Confirmed by:** production (unchanged code) never flickered; Firefox and Dia
were both smooth on the same machine, same page, at the same time; another
designer's portfolio was also janky in the same Chrome; re-enabling acceleration
resolved it and the issue could no longer be reproduced.

---

## What this means for the fixes made during the investigation

Six changes were shipped while chasing this. They split cleanly into two groups.

### Keep — verified defects, independent of the flicker

Each was measured directly and would be a real bug regardless of whether the
flicker ever existed.

| Change | File | Evidence |
|---|---|---|
| Gradient-aura animation disabled | `assets/css/main.css` (`.gradient-aura-frame::before`) | `background-position` animating `24s infinite` on a **1440×11067px** element (the entire post `<article>`). `background-position` is a paint property, not compositor-only, so this repainted a full-page-sized area every frame, forever, regardless of scrolling. Confirmed live by sampling its computed value 1s apart. Paint flashing showed whole-page green before, none after. |
| `initCustomScrollbar()` removed | `assets/js/ui-utilities.js`, `assets/js/main.js` | Wrote `--scroll-thumb-top`/`--scroll-thumb-height` to `<html>`'s inline style on **every scroll frame, unthrottled**, for CSS that does not exist anywhere (grepped every stylesheet: zero consumers). Measured 92 writes/sec on `/about/` — ~3× the already-throttled `--profile-shift`. Total `<html>` inline-style writes dropped **119 → 27** (−77%). |
| Header/video stuck `filter` | `assets/js/main.js`, `assets/css/main.css` | Entrance animations left `filter: blur(4px)` (header) and `blur(0px)` (video) permanently installed. A non-`none` filter keeps an element on a filter-effect compositing layer indefinitely. Note: `clearProps: 'filter'` alone was **not** sufficient — it exposes `.post > .post-header`'s own stylesheet `filter: blur(4px)` underneath; an explicit `filter: 'none'` was required. |
| scroll-progress NaN / overscroll clamp | `assets/js/scroll-progress.js` | `scrollY / 0` → `NaN` on pages shorter than the viewport (`width: NaN%` is discarded, bar keeps a stale width); rubber-band overscroll produced negative and >100% widths. |

### Scrutinise — made on the now-false flicker premise

Not known to have broken anything, but the justification no longer holds.

| Change | File | Concern |
|---|---|---|
| `.gh-navigation` layer promotion (`isolation: isolate` + `transform: translateZ(0)`) | `assets/css/main.css` | Justified by DevTools **Layer borders** evidence read on a GPU-disabled Chrome — that evidence is unreliable. It also directly *caused* a regression (below) needing a second fix. |
| `.nav-progressive-blur` un-nested from `<nav>` | `partials/navigation.hbs` | Only became necessary because `isolation: isolate` on `.gh-navigation` created a new stacking context, so the pane's `z-index: -1` stopped meaning "behind the page" and started meaning "behind its sibling `.nav-wrapper`" — visibly reordering the panes. Arguably better structure regardless, but it exists to serve the promotion above. |
| `gsap.ticker.lagSmoothing(0)` | `default.hbs` | Real mechanism, proved by measurement (ticker advanced **0s** vs **4.6s** across a 900ms block), but shipped for a symptom that was not real. Changes GSAP timing behaviour globally. |
| Scroll lock removed | `assets/js/main.js` | Correct on its own analysis — the site has **zero** same-page anchor links, and `history.scrollRestoration = 'manual'` already does the stated job — but it was not the jank cause. |

---

## The real performance finding: `backdrop-filter` cost

Software rendering turned out to be an accidental but genuinely useful stress
test. It exposes cost the GPU normally hides.

**25 live `backdrop-filter` elements on the homepage**, measured:

| Element | Filter | Size | Area |
|---|---|---|---|
| `.nav-blur-layer` ×5 | `blur(2px)` / `6px` / `14px` / `24px` / `36px` | 1440×196 each | 282k px² each (~1.4M px² total) |
| `.post-card-keyword` / `.grid-card-keyword` | `blur(20px) saturate(1.8)` | ~100–220 × 27 | 18 in DOM, 12 visible |
| `.nav-menu-mobile`, `.modal-nav-controls` | `blur(20px)` | 0×0 (inactive) | — |

**Why this is expensive:** blur cost scales with **radius squared**. The
`blur(36px)` layer alone is roughly 300× the per-pixel work of the `blur(2px)`
one. The 5-layer stack means the same 282k-pixel region is sampled and re-blurred
**five separate times per frame**, permanently, on every page. A GPU parallelises
this almost for free; a CPU does it per-pixel.

This is why other sites were smooth without acceleration — most don't use
`backdrop-filter` at all, let alone five overlapping full-width instances. And why
another designer's portfolio was also janky: portfolio sites lean on this same
glass aesthetic.

### Where the keyword pills are

- **Markup:** injected by JS, not in templates —
  `assets/js/post-and-cards.js:455` and `assets/js/posts-tabs-grid.js:299`
  (`<span class="post-card-keyword">` / `grid-card-keyword`)
- **Containers:** `partials/post-card.hbs:24`, `partials/post-card-grid.hbs:39`
- **CSS:** `assets/css/post-card-grid.css:1527`
- **On screen:** the post-card keyword tags in `.posts-tabs-section`
  (e.g. *"240M+ connected devices"*, *"Research-driven IA architecture"*)

⚠️ **Worth noting:** their `background` is **commented out** in the CSS, so
computed `background-color` is `rgba(0, 0, 0, 0)` — fully transparent. They are
paying for a `blur(20px) saturate(1.8)` backdrop pass with **no translucent
background layered over it**, which is most of what makes glass read as glass.
Whether the blur is even visible here is worth checking before optimising — this
may be pure cost for no visual effect.

### Prior art — this is already documented

`OPTIMIZATIONS.md` §3.1 records that removing `backdrop-filter` entirely on
low-end devices was **"the single biggest fix"** — measured **24–30fps → 60fps**
on a 2014 MacBook Pro (Iris Pro). The `html.low-end` tier already disables all of
it. What this investigation adds is that the cost is significant on *capable*
hardware too, once the GPU isn't carrying it.

---

## Software-rendering degradation tier (built 2026-08-09)

Acted on the finding above: the site now **detects the no-GPU case and degrades
deliberately**, rather than trying to render the full glass treatment on the CPU.

**Detection** — `assets/js/device-capability.js`

When acceleration is off, `canvas.getContext('webgl')` returns **null** outright
(verified against `chrome://gpu` reporting *"GPU process was unable to boot"*).
That null was previously swallowed by an `if (gl)` guard, so this population got
**no downgrade at all** — the exact gap this closes. Software GL implementations
that *do* return a context (Chrome's SwiftShader, Mesa's llvmpipe, "Microsoft
Basic Render") are caught by a renderer-string test instead.

Both cases set `window.__softwareRendered` and add `html.software-rendered`, and
fold into the **existing** `html.low-end` tier rather than creating a parallel
system — that tier already strips every `backdrop-filter` site-wide plus the
particle/scrub degradations, which is exactly the treatment this case wants.

**Degradations** — `assets/css/main.css` (low-end block)

| Rule | Why |
|---|---|
| `html.low-end * { backdrop-filter: none }` | Pre-existing blanket strip — kills all 25 instances. |
| `html.low-end .nav-progressive-blur { display: none }` | **New.** The blanket rule un-blurs the 5 panes but leaves five full-viewport-width divs in the layer tree costing composite work for nothing. The element exists *only* to carry those filters, so removing it is the honest degradation — no content is lost. |
| `html.low-end .post-card-keyword, .grid-card-keyword { background-color: … }` | **New.** These pills have their `background` commented out in `post-card-grid.css`, so the backdrop-filter alone separates them from the card behind. Strip the filter and they'd be left with only a 0.5px border — this restores a solid fallback so the tag stays legible. |

**Verified** by stubbing `getContext('webgl')` to distinguish a capable GPU
(faked M3 Max renderer string) from the no-GPU case:

| | capable GPU | no GPU |
|---|---|---|
| `html.low-end` | `false` | `true` |
| `html.software-rendered` | `false` | `true` |
| `.nav-progressive-blur` display | `block` | `none` |
| live `backdrop-filter` elements | **25** | **0** |

Detection discriminates correctly — full effect preserved on capable hardware,
fully stripped without a GPU.

⚠️ **Still worth a human visual check:** the keyword pills' solid-background
fallback was verified computationally (`rgba` value applied) but not reviewed by
eye. Confirm they read correctly with acceleration disabled before considering
this closed.

---

## Recommended next steps

1. **Regression-check the six changes above** under normal (accelerated)
   conditions — nothing looks broken, but the flicker-premise group deserves
   verification rather than assumption.
2. **Treat software-rendering smoothness as its own goal.** It's a good proxy for
   low-end machines, and if the site is smooth without acceleration it will be
   excellent with it.
3. **First target: the 5-layer nav blur.** The stack exists to fake a *progressive*
   blur gradient (a single CSS layer can only fade a constant radius's opacity).
   2–3 layers would likely retain most of the visual effect at roughly half the
   cost. **This is a visual design decision, not a bug fix** — it changes how the
   effect looks, so prototype and compare before committing.
4. **Check the keyword pills' transparent background** (above) — possibly free to
   remove.

---

## Process lessons

- **Verify the environment before trusting any rendering measurement.** Several
  hours of diagnosis rested on DevTools output from a browser whose GPU was off.
  Check `chrome://gpu` first when investigating any rendering issue.
- **Restore diagnostic changes immediately.** Hardware acceleration was disabled
  as a test and left off, silently invalidating everything measured afterwards.
- **Cross-check against another browser and production early.** Firefox, Dia and
  production were all smooth throughout — three independent signals that the code
  was fine, available from the start.
- **Headless Chromium cannot reproduce this class of bug.** Repeated attempts to
  measure flicker via Playwright returned clean results (0 backward scroll jumps,
  0 long tasks, negligible `getBoundingClientRect` cost — 0.4ms across 224 scroll
  events) because synthetic wheel events don't drive the compositor the way real
  input does. Real-machine DevTools was the only useful instrument.
- **Ruled out by measurement, not assumption:** repaint (Paint flashing clean),
  GPU layer churn (persisted with acceleration off), layout thrashing
  (`getBoundingClientRect` cost negligible), scroll listeners (all cheap or dead
  code), `--profile-shift` writes (zero on post pages), `#page-backdrop`
  (unchanged before/after scroll).
