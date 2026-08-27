# Page-width system — known issues & cleanup plan

Companion to `PAGE-WIDTH-SYSTEM.md` (which documents how the system is
*supposed* to work). This file documents where it currently doesn't, found
while chasing a "contained doesn't resolve to 1440px" report on
`.case-study-columns[data-width="contained"]` (2026-08-24). Fixed on the spot
where the fix was small and safe; left as a punch list where it wasn't.

## Background: two systems, one vocabulary

There are (at least) **three independent width mechanisms** on this site that
all use the words `narrow` / `contained` / `wide` / `full`, and nothing stops
one from having a different real pixel value than another for the "same"
tier name:

1. **`page_width`** — one site-wide Ghost Admin setting (`custom_theme_settings`
   table, `key='page_width'`). Drives `body[data-page-width="..."]`, which in
   turn re-values `--content-max-width-text` / `--content-max-width-media`
   (tokens.css) and `--container` (main.css `.gh-canvas`).
2. **`data-page-content-width`** — a per-element attribute (post.hbs, page.hbs,
   about.hbs, etc.) with its own hardcoded pixel values
   (`main.css`, `[data-page-content-width="..."]` rules: narrow 700px,
   contained 1280px, wide 1600px, full = `--max-width` token).
3. **`data-width`** (on `.case-study-section` / `.case-study-columns`) —
   per-instance author choice, picks a `.gh-canvas` named-line grid zone
   (`main.css` ~line 2692 onward) or a page section's own grid-column.

None of these three feed each other. A content author picking "contained" in
one context has no reason to expect it matches "contained" in another — and
until this session, it often silently didn't.

## Found and fixed this session (2026-08-24)

- **`--content-max-width-wide` renamed to `--content-max-width-media`**
  (tokens.css, main.css, post-card-grid.css, modal.css, PAGE-WIDTH-SYSTEM.md).
  The old name collided with the *`page_width` tier* also called `wide` —
  `--content-max-width-wide` under `page_width="wide"` actually resolved to
  1100px, *smaller* than under `page_width="contained"` (1440px, once fixed
  below). "media" names what the token is actually *for* (images/cards, the
  wider of the two content measures vs. `-text`), independent of tier
  vocabulary.
- **`--content-max-width-media` had no `contained`-tier override at all.**
  Only `wide`/`full` were defined in tokens.css's "PAGE WIDTH CONFIGURATION"
  block; `contained` — the theme's own default setting (package.json) —
  silently fell through to the base 1000px. Added the missing block.
- **That new block (and the pre-existing wide/full ones) were scoped to
  `:root[data-page-width='...']`, which never matched anything.**
  `data-page-width` is set on `<body>` (default.hbs:524), never on `<html>`.
  `:root` only matches `<html>`. All three tier overrides had **never
  actually applied**, on any setting, predating this session — confirmed by
  checking every other `data-page-width` consumer in main.css, which
  correctly targets `body[data-page-width='...']`. Changed all three to
  `body[...]`.
- **`main.css:2699` referenced `--content-max-width-contained`, a token that
  has never existed anywhere in this codebase** (typo, presumably for
  `--content-max-width-wide`/`-media`). No fallback, so `max-width` computed
  to `none` and the accompanying `!important` locked that in:
  `.case-study-section[data-content-align] > .case-study-columns[data-width="contained"]`
  was silently rendering with **no width cap at all**. Fixed.
- **The *other* `contained` rule (no `data-content-align` ancestor,
  `main.css` ~2760) had no `max-width` at all**, unlike its `narrow` and
  `wide` siblings — same missing-cap bug, different code path. Added one.
- **Root confusion, only found by querying the live Ghost sqlite db
  directly** (`content/data/ghost-local.db`, `custom_theme_settings` table):
  the site's *actual* live `page_width` is `"full"`, not `"contained"`
  (package.json's schema default). A stale `page_width="contained"` row also
  exists for an **inactive** theme slug (`thinkingisfree--3-`) — harmless
  (Ghost only reads the active theme's rows) but worth deleting if that old
  theme folder isn't needed. This is why `--content-max-width-media` kept
  resolving to 1800px instead of 1440px even after every code fix above: the
  code was correct, the live *setting* just wasn't what was assumed.
- **Final fix for the actual report:** made both `contained`-tier
  `.case-study-columns` rules use a **flat `max-width: 1440px`**, not
  `var(--content-max-width-media)` — matching the pattern `wide` already used
  (flat 1600px) for the identical reason: `data-width="contained"` is a
  per-instance authoring choice and should mean one fixed thing, not silently
  drift with whatever the site-wide `page_width` toggle happens to be set to.

## Still open / not touched this session

1. **The three-systems-disagree problem itself, not resolved, only worked
   around once.** `main.css` ~line 8268 (`.content-grid`/`.field-grid`) has
   its own comment (2026-08-11) documenting that `--content-max-width-media`
   (was 1000px default), `[data-page-content-width="contained"]` (1440px
   hardcoded), and `.kg-width-wide` (1800px) are three different numbers for
   words that read as the same tier — and that rather than reconcile them,
   that component just got its own hardcoded 1440px to sidestep the
   disagreement. That workaround still works, but the underlying disagreement
   is still live everywhere else. Two of the three numbers now happen to
   agree on the `contained` tier (1440px) after this session's fixes, but
   that's a coincidence of the values chosen, not a structural fix — nothing
   stops them drifting apart again if either literal is edited without
   checking the other.

2. **Audit `tokens.css` for more `:root[data-page-width]` instances of the
   selector-scope bug.** Only `--content-max-width-text`/`-media` were
   checked and fixed this session. If any *other* custom property in that
   file has the same `:root[data-page-width='...']` mistake (should be
   `body[...]`), it has the same "silently never applies" bug. Grep
   `:root\[data-page-width` across tokens.css and check each hit.

3. **`[data-page-content-width]`'s own tier values are still hand-typed
   literals with no shared token**, duplicated at minimum in: `main.css`'s
   `[data-page-content-width="..."]` block (narrow 700/contained 1280/wide
   1600), the `.content-grid`/`.field-grid` escape-hatch rule (1440,
   "comment says must match contained"), and possibly others not yet grepped.
   None of these reference a CSS custom property — they're bare px values in
   comments and declarations, "kept in sync by hand." A real fix would give
   each tier one token (e.g. `--page-content-width-narrow/-contained/-wide`)
   and have every consumer read it, the same shape `--content-max-width-*`
   has now that it's fixed. Until then, changing one requires manually
   grepping for every sibling literal.

4. **No test/lint catches an undefined CSS custom property.** The
   `--content-max-width-contained` typo (#3 above) shipped silently because
   nothing flags `var(--name)` referencing a name with zero `--name:`
   declarations anywhere in the stylesheet set. Worth a simple script (grep
   every `var(--x` usage, grep every `--x:` declaration, diff the two sets)
   run as a pre-commit or CI check — cheap, would have caught this
   immediately instead of needing a live-site investigation.

5. **Decide, deliberately, whether `page_width` (site-wide) and `data-width`/
   `data-page-content-width` (per-instance) tiers are SUPPOSED to share
   values or not.** Right now the fix direction taken (flat 1440/1600px on
   `data-width`, independent of `page_width`) implies "no, per-instance tiers
   should mean one fixed thing" — but `--content-max-width-media` (which
   `.post-card` cinematic sizing, the `.gh-canvas` `--contained`/`--wide`
   track math, and the modal image cap all still read) is *still*
   `page_width`-driven by design. That's an intentional asymmetry right now
   (some consumers want the fixed-value behavior, some want the scaling
   behavior) but it isn't written down anywhere as a rule — a future
   contributor has no way to know which category a new consumer should join
   without re-deriving this whole investigation.

## Suggested approach when this gets tackled properly

1. **Inventory first, change nothing.** One pass: every `data-page-width`,
   `data-page-content-width`, `data-width` (case-study), and every
   `--content-max-width-*`/`--container`/`--main`/`--contained`/`--wide`
   custom property. List definition site(s), every consumer, and the actual
   resolved pixel value for each of the 4 site-wide tiers. This session's
   fixes are a start, not a finish — the audit item (#2 above) plus a full
   consumer list for `[data-page-content-width]` is the missing half.
2. **Decide the fixed-vs-scaling question (#5) explicitly**, write it down
   (a short rule in `PAGE-WIDTH-SYSTEM.md`), and make every consumer match
   the decision — not case-by-case as bugs get reported.
3. **Give `[data-page-content-width]`'s literals real tokens** (item #3),
   collapsing "kept in sync by hand" duplication the same way
   `--content-max-width-*` just was.
4. **Add the drift-detection script** (item #4) so a future typo'd/renamed
   token fails fast instead of shipping silent.
5. **Only then**, if still wanted, consider whether `page_width` and
   `data-page-content-width`'s tier *values* should actually be unified
   (one canonical 1440px "contained" everywhere) or are legitimately
   different scales for different purposes (site-wide vs. per-element
   override) — that's a design call, not a bug, and shouldn't be made
   implicitly by whichever literal happens to get edited next.
