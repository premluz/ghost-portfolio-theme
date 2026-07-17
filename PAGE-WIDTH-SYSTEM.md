# Page Width System

How the theme's content-width settings cascade from Ghost Admin down to individual sections, and how to make one section diverge from the page-wide setting.

## The three tiers

1. **Global scale** — `page_width` custom setting (Ghost Admin → Design). Options: `contained` (1400px) / `wide` (1600px) / `full` (1800px). Rendered onto `<body data-page-width="...">` in `default.hbs:159`.
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
| `data-page-content-width` | `page_content_width` | `full` / `respect_page_width` | `respect_page_width` | `page.hbs`, `post.hbs`, `work.hbs`, `about.hbs`, `page-about.hbs`, `page-contact.hbs` (headers, `.gh-canvas`, `.page-body`, `.page-sections`, `.page-image`) |
| `data-home-content-width` | `home_content_width` | `full` / `respect_page_width` | `respect_page_width` | `index.hbs` (wraps posts-tabs/lab sections) |
| `data-footer-width` | `footer_width` | `full` / `respect_page_width` | `full` | `default.hbs` (`.gh-footer`) |
| `data-home-hero-width` | `home_hero_width` | `full` / `respect_page_width` | `full` | `partials/hero.hbs` |
| `data-post-hero` | `page_hero_width` | `fullscreen` / `respects_page_width` | `fullscreen` | `page.hbs`, `post.hbs` (`.post-header`, `.post-image`) |
| `data-nav-layout` | `nav_layout` | `fullscreen` / `respects_page_width` | `fullscreen` | `partials/navigation.hbs` |
| `data-testimonials-layout` | `testimonials_layout` | `grid` / `scroll` / `list` | `grid` | `partials/testimonials.hbs` — not a width toggle, controls layout mode; `scroll` mode is full-bleed by design (see main.css breakout rule) |
| `data-home-profile-width` | `home_profile_width` | — | — | `partials/profile.hbs` — **dangling**: this custom setting doesn't exist in `package.json`, so the attribute always renders empty. Not currently wired to anything in CSS either. Fix or remove if picked up. |

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
