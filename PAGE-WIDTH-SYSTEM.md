# Page Width System

How the theme's content-width settings cascade from Ghost Admin down to individual sections, and how to make one section diverge from the page-wide setting.

## The three tiers

1. **Global scale** — `page_width` custom setting (Ghost Admin → Design). Options: `narrow` (1080px) / `contained` (1280px) / `wide` (1600px) / `full` (1800px). Rendered onto `<body data-page-width="...">` in `default.hbs:159`.

   > `narrow` added 2026-08-05 alongside the post-page side-rail layout, which needed a tier below `contained`. It follows the existing pattern exactly (absolute pin + `respect_page_width` variant) across every attribute in the table below.
   >
   > The `contained` figure above previously read **1400px** in this doc; the CSS has always been **1280px**. Corrected here — check `main.css` if a number in this file ever looks off, the stylesheet is the source of truth.
2. **Per-section opt-in** — each section that should respect the global scale carries its own `data-*-width` attribute, bound to its own custom setting. The attribute's value is either a fixed keyword (e.g. `full`) or the literal string `respect_page_width` / `respects_page_width`.
3. **CSS cascade rule** — for every section, a rule shaped like:
   ```css
   body[data-page-width='wide'] [data-page-content-width='respect_page_width'] {
     max-width: 1600px;
   }
   ```
   Only fires when BOTH the body's global setting AND the section's own attribute say "respect the page width." If the section's attribute is `full` instead, this selector never matches it — the section just renders full-bleed regardless of the global setting.

This two-key-match design (body attribute × element attribute) is what makes per-section override possible: a section only inherits the global width if its own attribute explicitly opts in.

## Existing per-section attributes

| Attribute | Custom setting | Options | Default | Used in |
|---|---|---|---|---|
| `data-page-content-width` | `page_content_width` | `full` / `respect_page_width` / `narrow` / `contained` / `wide` | `respect_page_width` | `page.hbs`, `post.hbs`, `work.hbs`, `about.hbs`, `page-about.hbs`, `page-contact.hbs` (headers, `.gh-canvas`, `.page-body`, `.page-sections`, `.page-image`) |
| `data-home-content-width` | `home_content_width` | `full` / `respect_page_width` / `narrow` / `contained` / `wide` | `respect_page_width` | `index.hbs` (wraps posts-tabs/lab sections) |
| `data-footer-width` | `footer_width` | `full` / `respect_page_width` / `narrow` / `contained` / `wide` | `full` | `default.hbs` (`.gh-footer`) |
| `data-home-hero-width` | `home_hero_width` | `full` / `respect_page_width` / `narrow` / `contained` / `wide` | `full` | `partials/hero.hbs` |
| `data-post-hero` | `page_hero_width` | `fullscreen` / `respects_page_width` / `narrow` / `contained` / `wide` | `fullscreen` | `page.hbs`, `post.hbs` (`.post-layout`, `.post-image`) |
| `data-nav-layout` | `nav_layout` | `fullscreen` / `respects_page_width` | `fullscreen` | `partials/navigation.hbs` |
| `data-testimonials-layout` | `testimonials_layout` | `grid` / `scroll` / `list` | `grid` | `partials/testimonials.hbs` — not a width toggle, controls layout mode; `scroll` mode is full-bleed by design (see main.css breakout rule) |
| `data-home-profile-width` | `home_profile_width` | — | — | `partials/profile.hbs` — **dangling**: this custom setting doesn't exist in `package.json`, so the attribute always renders empty. Not currently wired to anything in CSS either. Fix or remove if picked up. |

### `narrow` / `contained` / `wide` — absolute, site-wide-independent pins

Added 2026-07-18 (`narrow` 2026-08-05). Every attribute above (except `data-nav-layout`, not yet extended) also accepts the literal values `narrow` (1080px), `contained` (1280px) and `wide` (1600px) — no `body[data-page-width='...']` prefix on these rules, so they apply unconditionally regardless of whatever the site-wide `page_width` setting is. This is what technique (1) below actually needs: hardcoding `respect_page_width` doesn't decouple a section from the global setting, it deliberately keeps following it. Hardcoding `contained`/`wide` is the real decoupling.

There's no absolute `full` (1800px, fixed) pin — the existing `full` value already means "no max-width at all," which only differs from a fixed 1800px in practice on viewports wider than 1800px. Add one (following the same pattern: a bare `[attr="full-1800"]` rule, no body prefix) if that distinction ever actually matters somewhere.

**Known trap that caused this section to be added**: `about.hbs` hardcodes `data-page-content-width="contained"` — but `about.hbs` was never the live template for `/about/` in the first place (Ghost auto-selects `page-about.hbs` for a page with slug "about"; `about.hbs` only runs if manually chosen as a custom template in Admin). Before assuming a hardcoded override "doesn't work," confirm the file you're editing is actually the one Ghost renders — check the live page's class list/attributes via view-source, don't assume from the `.hbs` filename alone.

`data-page-width="{{@custom.page_width}}"` also appears a second time on `partials/posts-tabs.hbs`'s root section — same global value, read locally rather than via the `body[data-page-width=...]` ancestor selector, for a selector that needed to match within that section specifically.

## Overriding one section's width manually

Two techniques, pick based on whether the override should ever be re-configurable later.

**1. Hardcode the attribute value in that page's `.hbs`** — decouples the section from the global setting entirely:
```hbs
<!-- was: data-page-content-width="{{@custom.page_content_width}}" -->
<div class="gh-canvas" data-page-content-width="full">
```
Now `body[data-page-width='contained'] [data-page-content-width='respect_page_width']` no longer matches this element (its attribute isn't `respect_page_width`), so it's pinned to whatever CSS targets `[data-page-content-width='full']`, regardless of what the site-wide `page_width` setting is.

**2. Scope a plain CSS rule to the section, bypassing the attribute system entirely** — for a one-off that should just always be different, no custom-setting plumbing needed. Precedent already in `main.css`:
```css
/* Deliberately NOT applied to the base .container rule — would leak into
   the homepage carousel, which needs the default behavior. */
.about-projects-section .container,
.work-projects-section .container {
  padding: 0 var(--content-padding);
}
```
This just wins by selector specificity/source order over the generic `body[data-page-width='...'] .container` rule.

Use (1) when the override itself might need to become theme-configurable later (it already speaks the settings system's language). Use (2) for a section that should just permanently differ, full stop.

## Full-bleed-with-contained-header pattern

Some sections need to be edge-to-edge themselves while their header/text still respects page width (hero, testimonials `scroll` layout). The pattern: the section's own background/boundary element is unconditionally full-bleed (`overflow: hidden`, or a breakout via `width: 100vw; left: 50%; margin-left: -50vw`), while a *child* wrapper carries the `data-*-width` attribute and gets the normal `body[data-page-width='...'] [data-*-width='respect_page_width']` treatment. See `.hero-bg` (full-bleed) vs `.hero-container` (contained), or `.testimonials-section[data-testimonials-layout='scroll']` (full-bleed breakout) vs `.testimonials-header` (contained).

## Content zones — the `.gh-content` grid (a SEPARATE system)

Everything above sizes *containers*. Inside a post body there's a second,
independent width system: `.gh-canvas` declares a CSS Grid whose named column
lines give each piece of content a **zone**, and `.gh-content` inherits those
tracks. Same vocabulary as the container tiers on purpose, different mechanism —
don't confuse the two.

| Zone | Width | What lands there |
|---|---|---|
| `narrow` (alias of `main`) | `--content-max-width-text` (800px) | body text — `p`, `h2`…, `blockquote`, and anything `.kg-width-narrow` |
| `contained` | `--content-max-width-wide` (1000px) | **default for images/cards** — any `.kg-card` without a width class |
| `wide` | `--container` + 200px | `.kg-width-wide` |
| `full` | remaining `1fr` each side | `.kg-width-full`, galleries |

Placement is `grid-column: <zone>-start / <zone>-end`.

`narrow-start/-end` are additional line names on the *same track* as
`main-start/-end`, so every pre-existing `main-start / main-end` rule keeps
working untouched — `narrow` is just the name that matches the tier vocabulary.

### The contained zone (added 2026-08-05)

Before this, text and images shared one track (`main`), so they could never
differ. `contained` splits them: text stays at the text measure, images default
one step wider. `.kg-width-narrow` opts an individual card back down to the text
measure.

### ⚠️ This grid was silently inert until 2026-08-05

`--wide` was defined as `calc((var(--container) + 200 - var(--main)) / 2)`. The
**unitless `200`** makes that calc invalid (px + `<number>` is not valid CSS
math), which invalidated the *entire* `grid-template-columns` declaration — so
no zone ever applied and every child simply filled the canvas width. Body text
was rendering at ~1280px instead of its intended 800px measure.

Fixed by writing `200px`. Two things worth carrying forward:

- **A single bad track expression kills the whole template.** `grid-template-columns` is one declaration; one invalid `var()`/`calc()` inside it drops all of it, silently, with no console error. If zones "aren't applying", read the *computed* `grid-template-columns` (it'll show far fewer tracks than authored) rather than assuming the `grid-column` assignments are wrong.
- **Verify calc validity directly**, don't eyeball it: set the value on a detached element and check whether it survives —
  ```js
  const d = document.createElement('div');
  d.style.gridTemplateColumns = 'minmax(0, calc((1280px + 200 - 800px) / 2))';
  d.style.gridTemplateColumns === ''   // true → the browser rejected it
  ```
