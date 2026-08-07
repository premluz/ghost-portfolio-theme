# Inversion (palette shift), with and without Gradient Frame

"Invert" in this codebase means: a section's ink (text/icons) and/or
background flips to the *opposite* theme's palette — dark site ⇒ light
island, light site ⇒ dark island — driven by one scalar, `--profile-shift`,
ramping `0 → 1` as the visitor scrolls through the section.

**Gradient Frame (`GRADIENT-FRAME-SYSTEM.md`) is one way to get this, not
the only way.** It bundles two independent things: animated WebGL bands
(the visual decoration) and the invert/shift trigger. This doc is about the
shift half on its own — the pattern to use when you want a section to
invert but don't want the bands.

**Core files**: `assets/js/background-layer.js` (`bindShift` — the
scroll→scalar driver), `assets/css/gradient-frame.css` (the ink-snapshot
tokens, `--gradient-frame-ink-*`, loaded site-wide regardless of whether any
`.gradient-frame` element exists on the page). Read `BACKGROUND-LAYER-
SYSTEM.md` first if you haven't — this doc assumes `bindShift()`'s scroll
maths and doesn't re-explain them.

---

## Two axes, four combinations

**Scroll-scrubbed vs. forced.** Should the invert ramp in/out as you scroll
through the section (matching testimonials/Lab), or just always be on
(matching a page that's simply light-on-dark regardless of scroll position)?

**Section-scoped vs. site-wide reach.** Should *only* this section's own
content invert, or should the fixed nav/other chrome outside the section
also flip while it's on screen (what testimonials/Lab actually do)?

| | Section-scoped only | Site-wide reach (nav included) |
|---|---|---|
| **Scroll-scrubbed** | `bindShift(el, var, { root: el })` | `bindShift(el, var)` — default `root`, this is what `.profile` and every `gradient-frame` invert instance already do |
| **Forced (always on)** | Hardcode the CSS variable, no JS at all | Hardcode the CSS variable **at `:root`**, no JS at all |

Gradient Frame's own invert mode is the top-right cell *plus* the bands.
The bottom-left cell (forced, section-scoped) is `.invert-wrapper`
(`main.css`) — a real, live reference implementation, wrapping `posts-tabs`
on the homepage. Its own opt-in (`data-invert-scroll`) also covers the
top-left cell (scroll-scrubbed, section-scoped) with the same CSS, so both
left-column cells now have one shared, working implementation to point to —
see below.

---

## The shared piece: ink tokens

Regardless of which cell you're in, "invert the ink" is always the same
three lines, reusing the snapshot tokens `gradient-frame.css` already
declares at `:root` (available everywhere, with or without any
`.gradient-frame` on the page):

```css
.your-section {
  --color-on-surface: color-mix(
    in srgb,
    var(--gradient-frame-ink-base),
    var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%)
  );
  --color-on-surface-variant: color-mix(
    in srgb,
    var(--gradient-frame-ink-variant-base),
    var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%)
  );
  --color-primary: color-mix(
    in srgb,
    var(--gradient-frame-ink-primary-base),
    var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%)
  );
}
```

Descendants keep writing plain `var(--color-on-surface)` and get the
inverted value for free — this is what lets the pattern wrap arbitrary
content instead of enumerating every text element. Swap `--profile-shift` in
the three `calc()`s for your own variable name if you're in one of the
section-scoped cells (see below).

**Why blend from `--gradient-frame-ink-base` and not `--color-on-surface`
directly:** a custom property can't reference itself in its own definition.
The `-base` tokens are a `:root`-level snapshot of the real tokens
(`theme.js`'s own values), re-read on every repaint via `color-mix()` — so
there's still exactly one writer of the real tokens, and this can't go stale
the way `BACKGROUND-LAYER-SYSTEM.md` warns a shared-state version would.

> ⚠ **This block alone does not look inverted — it only ever flips ink.**
> Nothing here paints a background, so the section's old background stays
> exactly as it was: on a dark site, that's dark text (now blended toward
> `--shift-ink`, which is *also* dark in that direction — see the token
> table in `tokens.css`) landing on the still-dark background it started on,
> reading as "nothing happened" or as broken contrast. This bit
> `.invert-wrapper` for real: the class shipped with only these three lines,
> `--profile-shift` was confirmed `1` and the ink tokens confirmed correctly
> blended, and it still didn't look inverted, because there was no panel
> underneath for the flipped ink to contrast against. **Every recipe below
> that doesn't already have its own background answer (gradient-frame's
> bands, or a page-level layer like `gradflow-page-bg`) needs a background
> panel — see `.invert-wrapper::before` below for the exact pattern.**

---

## Recipes

### Site-wide reach, scroll-scrubbed, no bands

Same shift Lab/testimonials use, minus the WebGL decoration — the nav,
body ink, icons all invert while the visitor is scrolled into your section,
exactly like a gradient-frame invert instance.

```js
BackgroundLayer.bindShift(document.querySelector('.your-section'), '--profile-shift', {
  quantize: 0.05, // matches gradient-frame's own — see BACKGROUND-LAYER-SYSTEM.md
});
```

```css
.your-section {
  /* the three color-mix() rules above, using --profile-shift */
}
```

You also need a background *panel* — `bindShift` only ever drives a number,
it paints nothing. Either a `::before` scoped to the section (see
`BACKGROUND-LAYER-SYSTEM.md`'s own recipe for `.profile`), or, if the
inverted look should cover the WHOLE page rather than just this section's
box, a separate fixed full-viewport layer (`gradflow-page-bg.hbs` is one
such layer, though it's a WebGL gradient, not a flat color).

**Only one direct `--profile-shift` writer per page.** If a page already has
a `.profile` or a `gradient-frame` invert instance, don't add a second
direct binding — see `GRADIENT-FRAME-SYSTEM.md`'s "Traps" section for the
exact failure mode (two bindings racing through the handoff zone,
last-writer-wins flicker). Use gradient-frame's own `--gradient-shift-N` +
`max()` pattern instead if you need a second scroll-scrubbed invert zone on
a page that already has one.

Also add the page-backdrop opt-out, same reason gradient-frame's invert mode
needs it (the full-viewport backdrop would otherwise blend past your
section into whatever's next):

```css
:root:has(.your-section) {
  --shift-scope-page: 0;
  --shift-scope-panel: 0;
}
```

### Section-scoped only — `.invert-wrapper` (`main.css`), forced by default, opt into scroll-scrubbed

Both left-column cells share one implementation, since they only differ in
*how* `--profile-shift` gets its value — a class rule pinning it, or JS
scrubbing it — and an inline style from JS always outranks a class rule for
the same property, so no modifier class is needed to switch modes.

```css
/* main.css — the whole component */
.invert-wrapper {
  position: relative;                 /* anchors ::before below */
  --profile-shift: 1;                 /* forced default — overridden per-instance by JS, see below */
  --color-on-surface: color-mix(in srgb, var(--gradient-frame-ink-base), var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%));
  --color-on-surface-variant: color-mix(in srgb, var(--gradient-frame-ink-variant-base), var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%));
  --color-primary: color-mix(in srgb, var(--gradient-frame-ink-primary-base), var(--shift-ink, white) calc(var(--profile-shift, 0) * 100%));
}

/* The background panel the callout above warns you not to skip. No
   --shift-scope-panel gate (unlike .profile::before): that flag exists so
   .profile can defer to the PAGE-level #page-backdrop blend instead — this
   component's shift is scoped, so #page-backdrop's own --profile-shift read
   never sees it. The panel has to be unconditional or the section gets no
   background at all. z-index:0 is a POSITIONED stacking tier, which paints
   ABOVE plain in-flow content by default — the child rule below is what
   keeps the real content on top instead of hidden under the panel. */
.invert-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background-color: var(--shift-bg, #22262E);
  opacity: var(--profile-shift, 0);
  pointer-events: none;
}

.invert-wrapper > * {
  position: relative;
  z-index: 1;
}
```

**Forced (default)** — just the class, no JS, nothing else:

```hbs
<div class="invert-wrapper">{{> your-section}}</div>
```

**Scroll-scrubbed** — add `data-invert-scroll`; `default.hbs` carries a
small site-wide auto-init (right after `background-layer.js` loads, same
"no per-page JS" convention as `[data-gradient-frame]`) that picks it up:

```hbs
<div class="invert-wrapper" data-invert-scroll>{{> your-section}}</div>
```

```js
// default.hbs, already wired — shown here for reference, not something
// you need to add per-instance
document.querySelectorAll('.invert-wrapper[data-invert-scroll]').forEach(function (el) {
  window.BackgroundLayer.bindShift(el, '--profile-shift', { root: el, quantize: 0.05 });
});
```

No page-backdrop opt-out needed for either mode — `#page-backdrop` only
ever reads `--profile-shift` at `:root`, which a scoped write like this
never touches.

### Site-wide reach, forced (always on), no bands, no JS

For a page that's simply inverted throughout, not scroll-triggered — e.g. a
whole page meant to read light-on-dark (or vice versa) regardless of scroll
position. Skip `bindShift()` entirely; just pin the number. Needs a
background answer too (see the callout above) — typically a page-level
layer here rather than a section `::before`, since the whole page is in
scope; `gradflow-page-bg.hbs` is one such layer.

```css
.your-page {
  --profile-shift: 1;
  /* the three color-mix() rules, using --profile-shift */
}
```

Because this writes `--profile-shift` (not a scoped variable), it reaches
descendants of `.your-page` — but **not** the fixed nav, since the nav is a
sibling, not a descendant, of whatever wraps the page content. (Also: as of
this writing, `.nav-wrapper.glass-liquid` separately pins `--profile-shift:
0` on itself regardless — see that rule's own comment — so even a `:root`-
level forced value wouldn't reach the nav today without removing that pin
first.) If you need the nav to invert too, you're back in the "site-wide
reach" recipes above — write at `:root`, and remember only one *scroll-
scrubbed* binding may write `--profile-shift` directly, though a forced
`:root { --profile-shift: 1; }` co-existing with zero scroll-driven bindings
elsewhere on the same page is fine (there's nothing to race against).

---

## Fixed (non-theme-mirroring) palettes

Everything above makes a section invert to *whichever theme's opposite* —
dark site ⇒ light island. If you want one **authored color that's the same
in both themes** (Lab's purple, not a theme mirror), that's not a different
mechanism — it's any of the above recipes plus overriding `--shift-bg` /
`--shift-ink` for that scope. See `GRADIENT-FRAME-SYSTEM.md`'s "A fixed
palette is not a third mode" section for the exact two-part recipe
(including the `:root:has()`-vs-`data-active-*` trap it documents) — the
same override applies whether or not you're also using gradient-frame's
bands.

---

## Decision guide

- **Want the animated bands too?** Use gradient-frame directly
  (`GRADIENT-FRAME-SYSTEM.md`) — don't hand-roll this.
- **Want the shift/invert behavior only, no bands, and the nav should
  react?** `bindShift()` at `:root` (default `root`), site-wide reach recipe
  above.
- **Want the shift confined to just this section, nav untouched?**
  `bindShift(el, var, { root: el })`, section-scoped recipe above.
- **Not scroll-driven at all — the section (or page) is just always
  inverted?** Skip `bindShift()`, hardcode the variable, either scope.
