# Post body vertical rhythm — audit & system

Status: prose spacing consolidated into one owner (2026-08-06). Measured on
`/work/tracr-blockchain-traceability/` at 1440px and 390px with headless
Chromium.

---

## 1. What was wrong

Post prose spacing was written by **four rules competing for the same
elements**, each re-declaring vertical margin at a different specificity:

| # | Selector | Declared |
|---|---|---|
| 1 | `* ` | `margin: 0` |
| 2 | `h1, h2, h3, h4, h5, h6` | `margin-top: --space-xl; margin-bottom: --space-sm` |
| 3 | `.gh-content > * + *` | `margin-top: --space-md; margin-bottom: --space-xs` |
| 4 | `.gh-content > h2, > h3` | `margin-top: --space-xl; margin-bottom: --space-sm` |
| 5 | `.gh-content ul, ol` | `margin-top: --space-lg; margin-bottom: --space-md` |
| 6 | `.kg-card`, `.kg-width-full, .kg-width-wide`, `.kg-gallery-container`, `.kg-gallery`, `.kg-embed-card` | `margin: --space-lg 0` (shorthand) |
| 7 | `p` | `margin-bottom: --space-sm` |

An owl-selector flow system (#3) already existed, but #2/#4/#5/#6 all
out-specified it on headings, lists and media — so it only ever governed
paragraphs. Spacing was therefore **contextual**: identical blocks got
different gaps depending on what preceded them.

Measured symptom, desktop 1440px:

- **15 distinct gap values** between consecutive blocks:
  `29, 31, 48, 55, 62, 67, 86, 96, 103, 118, 127, 143, 150, 158, 198`
- Two structurally identical `h2` blocks rendered **143px** and **198px**
  of space above them.

The `margin` *shorthand* in #6 was the most damaging: it re-set
`margin-bottom` as a side effect, and single-class selectors beat
`.gh-content > * + figure`.

---

## 2. The system now

One owner. All spacing is `margin-top` on the second element of a pair
(owl pattern); no prose block sets its own vertical margin, so a gap can
never depend on its neighbour.

Tokens (`tokens.css`) — deliberately **fixed steps, not `clamp()`/`vw`**:

```
--prose-flow-2xs   8px    tight pairs
--prose-flow-xs   16px    within a block group / after a heading
--prose-flow-sm   24px    default block-to-block
--prose-flow-md   40px    around media & cards
--prose-flow-lg   64px    before a new h2 section
--prose-flow-xl   96px    major structural break (hr)
```

Mobile (≤768px) steps down to `8 / 12 / 16 / 24 / 40 / 56`.

**Why fixed, not fluid:** the `--space-*` t-shirt scale is
viewport-interpolated, so two different tokens land on two arbitrary
intermediate values at any given width and never repeat — that is
structurally incapable of producing a rhythm. Fluid spacing is still
correct for *section* padding (`--space-section`), where the gap should
breathe. It is wrong for prose, where the gap encodes hierarchy.

Rules live in `main.css` under `PROSE VERTICAL RHYTHM`.

---

## 3. Result

| | before | after |
|---|---|---|
| distinct block gaps (1440px) | **15** | **8** |
| distinct block gaps (390px) | 11 | 8 |
| `h2` gap above | 143 / 143 / 150 / 198 | 64 + figure slack, uniform per context |
| `h2` margin-bottom | 14.4px | 0 |
| `p` after heading | 29–31px | 16px, uniform |
| `p` margin-bottom | 14.4px | 0 |
| figure margin-top | 19.2–48px | 40px, uniform |

Every prose element now reports `margin-bottom: 0` and a `margin-top` drawn
only from the six-token ladder. Desktop gaps are
`16, 19, 24, 40, 64, 80, 104, 128` — the ladder, plus figure-internal slack
(below).

### Known remaining variance

The 8 values are not 6 because **some gaps include height that is not
margin**:

- `.kg-image-card` figures carry **48–84px of empty space below their last
  child, inside their own box**. So `figure -> h2` measures 104px = 64px
  margin + ~40px internal slack. Verified with a per-pair anatomy probe
  (`slkP` column).
- `div.respects_page_width` wrappers carry ~64px internal top padding.
- One `figure -> figure` pair reports 19px from a `19.2px` inline margin.

Fixing these means normalising **card internals**, not spacing — a separate
change, deliberately not attempted here.

So: **margins are fully consistent; a few total gaps still vary with card
box internals.**

---

## 4. Two assumptions that were WRONG — do not re-litigate

Both were investigated, measured, and disproved. Recorded so they are not
"fixed" again later.

### 4.1 The prose measure is NOT broken

Initial reading of `.gh-content width=1165px` looked like 145 characters
per line. That was the **grid container**, not the text.

Actual, verified:

| viewport | text width | approx CPL |
|---|---|---|
| 1440px | 800px | ~105 |
| 768px | 645px | ~85 |
| 390px | 318px | ~42 |

The named-line grid (`grid-column: main-start / main-end`, clamped to
`--content-max-width-text: 800px`) works correctly. No narrow-measure
track needs adding.

### 4.2 Mobile heading sizes are DELIBERATE

`h2` computes to 44.8px at every viewport, including a 318px column. This
looks like a `clamp()` bug — at ≤768px the token becomes
`clamp(calc(4rem * .7), calc(8vw * .7), calc(4rem * .7))`, where min and
max are identical, so the `8vw` ideal can never apply.

It is intentional. `tokens.css` (~line 644) carries a dated, explicit
note: *"Mobile heading scale (2026-08-04): a deliberate re-tier, not a bug
fix … All floors here dominate the full ≤768px range."*

Same for `h5` rendering *larger* on mobile (14.1px desktop → 16px mobile):
`--type-h5-size: var(--type-body-size)` at ≤768px, deliberately, so h5
always equals body size.

**Changing these affects h1–h6 on every page site-wide.** Needs explicit
sign-off, not a drive-by fix.

---

## 5. Incidental bug fixed

`main.css` had an **unclosed CSS comment** (the `SCROLLBAR` banner): its
opening `/*` was "closed" by a line that itself began `/*`, so the comment
never terminated and silently swallowed the following rule. Pre-existing,
unrelated to rhythm — but it truncated the stylesheet mid-work and
collapsed the whole `.gh-content` grid to `display: block` (text went
full-bleed at 1440px/181 CPL). Fixed; both `main.css` and `tokens.css` now
parse balanced.

---

## Verify

```bash
T=~/ghostthemeportfolio/ghost2/content/themes/thinkingisfree

# flow system is the single owner
grep -n "PROSE VERTICAL RHYTHM" "$T/assets/css/main.css"

# fixed (non-vw) prose tokens
grep -n -- "--prose-flow" "$T/assets/css/tokens.css"

# no kg-card / kg-width vertical margin shorthand remains
grep -n "margin: var(--space-lg) 0" "$T/assets/css/main.css"   # expect: no kg-* hits

# comments balanced in both sheets
python3 - <<'PY'
for p in ["assets/css/main.css","assets/css/tokens.css"]:
    import os
    f=os.path.expanduser("~/ghostthemeportfolio/ghost2/content/themes/thinkingisfree/"+p)
    s=open(f).read(); pos=depth=0; stray=[]
    while True:
        o=s.find('/*',pos); c=s.find('*/',pos)
        if o==-1 and c==-1: break
        if o!=-1 and (c==-1 or o<c): depth+=1; pos=o+2
        else:
            depth-=1; pos=c+2
            if depth<0: stray.append(s[:c].count('\n')+1); depth=0
    print(p, "depth=",depth, "stray=",stray)
PY
```
