# [COMPLETED 2026-07-18] Type-settings migration — kept as system reference

> **Status: migration done and verified.** All ~62 hardcoded font-sizes were
> migrated (with `, 1` fallbacks on every scale var — required for standalone
> contexts like error.hbs that don't load tokens.css). Facts that changed
> after this doc was written:
> - Heading scale steps are now **0.8 / 1 / 1.15** (body stays 0.92 / 1 / 1.12).
> - Header weight styles are now a full matrix: display 900 ("black", DM Sans
>   900 loaded in default.hbs for it), editorial 800/700 (default), minimal
>   500 — covering h1–h6.
> - `tag.css` and `operating-model-v2.css` were deleted (unused);
>   `operating-model-stacked.css` was unlinked but kept on disk (toggle-back
>   alternative — see comment in default.hbs).
> - Form inputs intentionally stay at fixed 16px (iOS zoom-on-focus threshold).
> - Known pre-existing quirk: ~114px of horizontal overflow at 1440px, fully
>   masked by `body { overflow-x: hidden }`, present at every setting combo —
>   not typography-related.
>
> The sections below are the original spec; the "system you are wiring into"
> description remains accurate apart from the numbers above.

# Handoff: make every hardcoded font-size respond to the admin type settings

**Goal.** The theme now has a two-axis scaled type system, but ~62 `font-size`
declarations across the CSS bypass it with raw `clamp()`/px/rem values. Those
sections don't react when the admin changes type settings. Migrate them onto
the system **without changing how anything renders at the default settings.**

---

## The system you are wiring into (already built — do not redesign it)

All size tokens live in `assets/css/tokens.css` (~line 245) and multiply one of
two scale axes:

- `--type-scale-heading` — display + h1–h6 primitives (`--type-h1-size` …)
- `--type-scale-body` — body/UI primitives (`--type-body-size`,
  `--type-label-size`, `--type-caption-size`, `--text-size-xs`,
  `--text-size-lede`, …)

Admin settings → body attributes → scale values (mappings at tokens.css ~line
710, via `:root:has(body[data-…])`):

| Setting (package.json) | Body attribute | Drives |
|---|---|---|
| `type_size` | `data-type-size` (compact/standard/large + legacy sm/md/lg) | `--type-scale-body` (legacy values drive both axes) |
| `type_size_headings` | `data-type-size-headings` (compact/standard/large) | `--type-scale-heading` |
| `typography_style_header` | `data-typography-header` | h1–h4 weight + letter-spacing (main.css ~4183) |
| `typography_style_body` | `data-typography-body` | p/li/button/a weight (main.css ~4227) |

Multipliers: compact 0.92, standard 1, large 1.12. **Standard = the original
design, pixel-for-pixel.** That invariant must survive your changes.

**Critical gotcha (cost us a silent bug already):** `var()` inside a custom
property resolves where the property is **declared**, not where it's used.
Token definitions live at `:root`, so scale overrides must be at `:root` too —
that's why the mappings use `:root:has(body[data-…])`, never `body[data-…]`.
Don't "simplify" them.

## Migration rules

For each hardcoded `font-size`, in order of preference:

1. **Use an existing semantic token** if the value is close to one
   (`--text-size-h1…h6`, `--text-size-body/-sm/-xs`, `--text-size-lede`,
   `--type-label-size`, `--type-caption-size`, `--type-overline-size`).
   "Close" = within ~10% at 1440px AND at 390px. Then delete any now-redundant
   local clamp.
2. **If the value is intentionally unique** (giant display text like the
   footer title's `clamp(1.5rem, 11vw, 16rem)`), keep its numbers but multiply
   every clamp term by the appropriate axis:
   `clamp(calc(1.5rem * var(--type-scale-heading)), calc(11vw * var(--type-scale-heading)), calc(16rem * var(--type-scale-heading)))`.
   Heading-like text (titles, slide headers, metrics, stat numbers) → heading
   axis. Paragraph/UI text (labels, buttons, meta, captions) → body axis.
3. **Leave alone:** `font-size: 0` (dot/`sr-only` tricks — see comment at
   main.css ~4956), `em`-based values (they inherit scale from their parent),
   and anything inside `.gh-portal`/third-party overrides.

Keep existing `!important` flags exactly as they are — several are
load-bearing against Ghost card styles. Never edit `tokens.css` mappings or
`default.hbs`; your scope is consumer stylesheets only.

## Inventory (grep `font-size:\s*(clamp|[0-9])` to regenerate)

- `assets/css/main.css` — 31 instances. Notables: hero/preloader display text
  (~340, 458, 474), `.footer-title` (~524), section headlines (~6384, 7026,
  7259), mobile overrides with `!important` (~7047–7177), stray px values
  (~3742 `120px`, ~5667 `44px`, ~6445/6487 px UI text).
- `assets/css/tag.css` — 15 instances (tag-page variants of the same
  patterns; this file loads only on tag pages).
- `assets/css/modal.css` — 13 instances (testimonial modal).
- `assets/css/operating-model-stacked.css` — 2; `operating-model-v2.css` — 1
  (slide headers/metrics — these were explicitly reported as not scaling well
  on small mobile; after wiring, sanity-check them at 360–390px).
- Inline styles: `partials/posts-tabs-grid-lab.hbs`, `partials/preloader.hbs`
  (migrate to the same pattern if they're real text; preloader counter may be
  intentionally fixed — use judgment, report either way).
- Also check `post-card-grid.css`, `profile.css`, `testimonials*.css` for the
  same pattern even if the initial grep count was 0 for them.

## Verification (mandatory, per file batch)

Test page: `http://localhost:2369/` (Playwright: `NODE_PATH=/Users/przemek/node_modules`,
`localStorage.setItem('preloader_seen','1')` in addInitScript to skip the preloader).

1. **Default-stability:** with body attributes forced to
   `data-type-size="standard"` + `data-type-size-headings="standard"`,
   computed `font-size` of every element you touched must equal its
   pre-change value (±0.5px). Capture before/after with a script, don't
   eyeball.
2. **Responsiveness:** flip each axis to `compact`/`large` via
   `document.body.setAttribute(...)` and confirm the touched element's size
   scales ×0.92/×1.12 (or through the token it now uses).
3. **Axis correctness:** flipping the *body* axis must not move headings and
   vice versa.
4. Repeat at 1440px and 390px viewports; screenshot hero, operating model,
   testimonials, footer at `large`/`large` to confirm nothing overflows
   (heading `min()` overflow guards exist in the hero — keep them outermost:
   `min(scaled-clamp, geometric-guard)`).
5. Run on home, one post page (`/work/tracr-blockchain-traceability/`), and
   one tag page.

## Out of scope

Do not touch: weight rules (`typography_style_*` — already wired), line-height
tokens, `tokens.css` scale mappings, `package.json`, `default.hbs`, any JS.
If a migration would visibly change the default rendering and you can't avoid
it, skip it and list it in your report instead.
