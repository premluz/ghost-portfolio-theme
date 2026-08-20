# Colour & Gradient Token System

**Where to change a colour, and what each gradient actually drives.**

This doc covers the **colour/token layer** — the CSS custom properties that
decide what colour things are. It does not cover the *rendering* systems that
draw gradients; those have their own docs:

| If you want to… | Read |
|---|---|
| Change what colour something is | **This doc** |
| Understand the WebGL band/frame component | `GRADIENT-FRAME-SYSTEM.md` |
| Understand the post-card gradient pipelines | `GRADIENT_SYSTEMS.md` |
| Understand the GLSL card-gradient component | `GLSL_GRADIENT_GUIDE.md`, `GRADIENT_SETUP.md` |
| Understand the scroll→palette-flip driver | `BACKGROUND-LAYER-SYSTEM.md`, `INVERSION.md` |

---

## 1. The two-layer idea

Colours are authored **once, as raw stops**, and every gradient string is
**derived** from those stops via `var()`.

```
  Layer 1  PRIMITIVES        --grad-brand-1/2/3     ← the ONLY place hex is written
  (per theme)                --grad-text-1/2/3
                                    │
                                    ▼  composed with var()
  Layer 2  COMPOSED          --gradient-brand-image  (page background)
  (declared once)            --gradient-text-image   (headline fill)
```

**Why:** before this, the text gradient stored a whole `linear-gradient(...)`
string and the WebGL background stored separate numbers. A shader needs
*stops*, not CSS syntax, so the two could never share a source and drifted
apart. Authoring stops and deriving strings fixes that by construction.

**Practical consequence:** to recolour a theme you edit **3 or 6 hex values**.
You should never need to touch a `linear-gradient(...)` string.

---

## 2. The two families

| Family | Drives | Default |
|---|---|---|
| `--grad-brand-1/2/3` | Page background (gradflow / WebGL) | authored per theme |
| `--grad-text-1/2/3` | `.text-gradient` headline fill | **inherits brand** via `var()` |

Text defaults to brand, so a theme where they match needs only 3 values.
Override `--grad-text-*` **only** when the headline should diverge from the
background.

---

## 3. Where to edit — `assets/css/tokens.css`

Three theme blocks. Runtime toggling is **light vs dark only**
(`theme.js` sets `data-theme="light"` or removes the attribute); `dim` is a
separately-configured variant not reachable from the toggle.

| Theme | Selector | Line | What's authored there |
|---|---|---|---|
| **Dark** (default) | `:root` | ~598 | brand 1/2/3 + text 1/2/3 (text = `var(--grad-brand-*)`) |
| **Light** | `:root[data-theme='light']` | ~897 | brand 1/2/3, text 1/2/3, **and** a direct `--gradient-text-image` |
| **Dim** | `:root[data-theme='dim']` | ~1101 | *nothing* — intentionally inherits dark |

### Dark (base `:root`, ~line 598)

```css
--grad-brand-1: #b9a7ff;
--grad-brand-2: #8fd8d2;
--grad-brand-3: #6aa9ff;
--grad-text-1: var(--grad-brand-1);   /* text follows brand */
--grad-text-2: var(--grad-brand-2);
--grad-text-3: var(--grad-brand-3);
```

### Light (~line 897) — one deliberate exception

Light keeps a **direct 5-stop `--gradient-text-image`** rather than composing
from its primitives, because its fill needs more stops than the 3-stop shape
supports. Its `--grad-text-1/2/3` are still set so anything reading the raw
primitives gets a sane 3-stop approximation.

> ⚠️ **This is why per-post overrides must set BOTH** the primitives and the
> composed string — see §5. Setting only primitives works in dark and
> silently does nothing in light.

### Dim (~line 1101)

Declares no gradient tokens on purpose; inherits dark's. Add an override
block there if dim ever needs its own.

---

## 4. What each gradient drives

| Token | Consumed by | File |
|---|---|---|
| `--gradient-text-image` | `.text-gradient` (`background-clip: text`) | `main.css:117` |
| `--gradient-text-fallback` | flat colour when bg-clip unsupported | `main.css:104,118` |
| `--gradient-brand-image` | page background reference / non-JS fallback | `tokens.css:627` |
| `--progress-bar-color-a/-b` | loading streak **and** scroll indicator | `main.css:689,5321` |

### `.text-gradient`
A utility class. Put it on any heading/`<span>` to fill the text with
`--gradient-text-image`. **Never use it inside a palette-shift zone** — it is
not wired to the shift and will not flip with the surrounding palette.

### Progress bar
One shared element (`.scroll-progress.progress-bar-track`, `default.hbs:591`)
serving two states: the preloader streak (`.is-loading`) and the scroll
indicator. Both read the SAME two tokens:

| Token | Fallback | Per-post override |
|---|---|---|
| `--progress-bar-color-a` | `--color-background` (theme bg token, responsive to dark/light/dim) | none — CSS only |
| `--progress-bar-color-b` | `--color-secondary` (theme accent) | post's `accentColor` |

`-a` is deliberately **not** driven by JS: `--color-background` already
recomputes on its own the instant `data-theme` changes, so there is nothing
for `post.hbs` to redrive. `-b` is set once from `meta.accentColor` in
`applyProgressBarColors()` (`post.hbs`) — mode-agnostic, matching
`accentColor`'s existing behaviour everywhere else it's used (logomark
backdrop, `--before-after-accent`). `gradientCss` does **not** touch the
progress bar.

### Page background (gradflow)
The WebGL background takes **4 colours + an optional 2nd layer**, but the
authoring contract here is **3 stops** — the 4th and the layer-2 colours are
synthesized by `GradflowColorCrossfade.tonesFrom()`.

> **Note:** `partials/gradflow-page-bg.hbs` takes hardcoded RGB numbers as
> Handlebars params, and `page-about.hbs` / `index.hbs` pass their own. Those
> per-page looks are **not** token-driven and are unaffected by the theme
> stops above. Wiring them up was deliberately left out of scope.

---

## 5. Per-post overrides

Set in a post's `codeinjection_head` via `projectMeta` / `projectMetaArray`.
Consumed in `post.hbs`.

| Field | Overrides | Format |
|---|---|---|
| `gradientCss` | page bg + hero wave | hex list **or** full gradient string |
| `textGradientColor` | `.text-gradient` fill | comma-separated hex list |
| `accentColor` | logomark bg, `--before-after-accent`, progress bar color-b | single colour |

### Light/dark variants

Each colour field accepts optional per-mode forms. **Specific wins, generic
falls back**, so posts authored before this existed are unaffected:

```
gradientCss              → both modes
gradientCssLight         → light only
gradientCssDark          → dark only
textGradientColor        → both modes
textGradientColorLight   → light only
textGradientColorDark    → dark only
```

camelCase and kebab-case are both accepted (`gradientCssLight` ≡
`gradient-css-light`). `dim` resolves to the **Dark** variant, matching the
token layer. Resolution lives in `metaForMode()` (`post.hbs`).

`gradientCss` and `textGradientColor` re-resolve on the `themechange` event,
so toggling theme on a post repaints correctly. `accentColor` has **no**
Light/Dark variant — it's a single value everywhere it's used, including the
progress bar — so nothing to re-resolve there.

### Accepted `gradientCss` formats

Both of these work — real posts on this site use each:

```
#205B4E,#14342D,#000000
radial-gradient(85% 40% at 50% 50%, #ff000033 0%, #ff000000 100%)
```

> ⚠️ **Never parse `gradientCss` with `split(',')`.** On the gradient-string
> form that yields `"radial-gradient(85% 40% at 50% 50%"` as the first
> "colour" — an invalid value CSS silently discards, falling back to theme
> colours. Use a colour regex (`GradflowColorCrossfade.extractRgbs`, the
> shared helper the page-bg code already routes through). Fully-transparent
> stops (`#RRGGBBAA` ending `00`) should be stripped first, or a fade-out
> gradient hands you an invisible colour. (The progress bar no longer
> parses `gradientCss` at all — see §4 — so this trap only applies to the
> hero-wave/page-bg code paths now.)

---

## 6. JS access — `assets/js/gradient-tokens.js`

```js
window.GradientTokens.read('brand')    // → ['#b9a7ff', '#8fd8d2', '#6aa9ff']
window.GradientTokens.read('text')
window.GradientTokens.toTones('brand') // → { color1, color2, color3 } for gradflow
```

Reads live (never cached) so a theme toggle between calls is picked up.
`toTones()` delegates to `GradflowColorCrossfade.tonesFrom()`.

> ⚠️ **Load-order trap.** `gradflow-color-crossfade.js` and
> `gradient-tokens.js` load near the **bottom** of `default.hbs` (~line 1202),
> while inline scripts inside `{{{body}}}` (line 638) run *before* them. Code
> in `post.hbs` that guards on `window.GradflowColorCrossfade` will silently
> no-op. Either poll (as `waitForPageBg` does) or inline the few lines of
> regex you actually need. This exact mistake first produced a "progress bar
> stays theme-green" bug — since fixed by moving the progress bar off
> `gradientCss` parsing entirely (see §4), but the trap is still live for
> any other code that reads `GradflowColorCrossfade` from an inline
> `{{{body}}}` script.

---

## 7. Recipes

**Recolour a theme's gradients**
→ `tokens.css`, edit `--grad-brand-1/2/3` in that theme's block. If text
should differ, also set `--grad-text-1/2/3` (and in **light**, also update
the direct `--gradient-text-image`).

**Give one post its own colours**
→ post's `codeinjection_head`: `gradientCss` (page bg + hero wave),
`textGradientColor` (headlines), and/or `accentColor` (logomark, before/after
slider, progress bar). Add `gradientCssLight/Dark` or
`textGradientColorLight/Dark` for per-mode variants (`accentColor` has none).

**Give dim its own gradients**
→ add `--grad-brand-1/2/3` to the `:root[data-theme='dim']` block.

**Change the progress bar site-wide**
→ `main.css:689` / `main.css:5321` fallbacks
(`--color-background`/`--color-secondary`), or set
`--progress-bar-color-a/-b` at `:root` directly.

**Give one post a custom progress-bar accent**
→ set that post's `accentColor` in `codeinjection_head` — it already
colours the logomark backdrop and before/after slider, and now the
progress bar's color-b too, all from one field.

**Make a headline use the gradient fill**
→ add `class="text-gradient"`. Not inside a palette-shift zone.

---

## 8. Gotchas

1. **Light's text gradient is a direct override.** Setting only primitives
   won't change it. Per-post overrides must set both.
2. **`--progress-bar-color-b` falls back to `--color-secondary`** — the teal
   accent. Seeing that on a post means it has no `accentColor` set.
3. **`dim` inherits dark**, silently, by design.
4. **`.text-gradient` is not shift-aware.** Don't use it in a shift zone.
5. **`gradflow-page-bg.hbs` defaults are hardcoded params**, not tokens.
6. **`extractRgbs` drops alpha.** `#RRGGBBAA` → RGB only; filter transparent
   stops on the string, before parsing.
7. **The progress bar does not read `gradientCss`.** Its two colours come
   from `--color-background` (fixed, CSS-only) and `accentColor`
   (per-post) — a post with only `gradientCss` and no `accentColor` gets
   the theme-default bar, on purpose.

---

## 9. Files

| File | Role |
|---|---|
| `assets/css/tokens.css` | **Source of truth.** Primitives + composed strings, per theme. |
| `assets/css/main.css` | Consumers: `.text-gradient` (91–118), progress bar (682–690, 5311–5322). |
| `assets/js/gradient-tokens.js` | JS bridge — read stops / convert to gradflow tones. |
| `assets/js/gradflow-color-crossfade.js` | `extractRgbs` / `tonesFrom` / crossfader. |
| `post.hbs` | Per-post overrides, `metaForMode()`, `themechange` re-resolve. |
| `assets/js/theme.js` | Sets `data-theme`, dispatches `themechange`. |
| `default.hbs` | Shared progress-bar element (591); script order (~1202). |
