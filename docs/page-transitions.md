# Page Transitions & Page Entrance Animations

> Rewritten 2026-07 to match the actual code. The earlier version of this doc
> described a `post-enter.js` file, a `#pt-darken` veil and a bfcache
> `resetState()` that were never in this theme copy.
> See also: [page-load-animations.md](page-load-animations.md) for the full
> load/entrance pipeline.

## Files involved

| File | Role |
|------|------|
| `assets/js/page-transition.js` | Exit animation on `data-transition` link click + overlay panel |
| `assets/js/main.js` → `initPostHeaderAnimation()` (~line 711) | Entrance animation for post & static pages |
| `assets/css/main.css` (~line 3004) | Initial hidden state for post hero image |
| `assets/js/card-scroll-reveal.js` | Scroll-driven image reveal for the REST of the post body — explicitly excludes the hero + first content image (see §2) so it doesn't fight this entrance |
| `default.hbs` | Script registration (page-transition.js loads near the end) |

---

## 1. Page Transition (exit animation)

**Opt-in**: add `data-transition` to any `<a>` tag.

```html
<a href="/work/my-project" data-transition>View project</a>
```

### What happens on click

`runTransition(href)` builds one GSAP timeline:

1. **Current page** (`<main>`) — blurs to `blur(10px)` and drifts **up**
   `y: -48px` over `0.45s power2.in`.
2. **Dark scrim** (`#pt-scrim`, created by the script at load time) — a
   `rgba(0,0,0,0.55)` full-viewport div, `z-index: 9998` (under the panel,
   `z-index: 9999`), fades `opacity: 0 → 1` over `0.45s power2.in`
   (accelerating — starts slow, speeds up), starting at the same time as the
   blur (`t=0`). Dims the page while the panel below is still rising; the
   panel simply paints over it once it arrives.
3. **Panel overlay** (`#pt-overlay`, created by the script at load time) — a
   `var(--color-background)` div hidden below the viewport (`yPercent: 105`)
   rises to cover the screen, scaling `0.9 → 1.2` with its
   `40px 40px 0 0` top radius flattening to `0`. Starts `0.06s` after the
   blur, `0.58s power3.in`.

When the timeline completes → `window.location.href = href` fires navigation.

An `animating` flag prevents double-triggering while the exit is running.

### Intercepted / not intercepted

| Scenario | Intercepted? |
|----------|-------------|
| Normal `<a data-transition>` click | ✅ Yes |
| `Cmd/Ctrl/Shift/Alt` + click | ❌ No (pass-through) |
| `target="_blank"` | ❌ No |
| Hash links (`#section`) / `javascript:` | ❌ No |
| GSAP not loaded | ❌ Script exits, links behave natively |

### Back-button / bfcache

`page-transition.js` listens for `pageshow` and resets `animating`, the
overlay (`yPercent: 105, scaleX: 0.9, scaleY: 1, borderRadius: '40px 40px 0 0'`),
the scrim (`opacity: 0`), and `<main>` (`y: 0, filter: 'none'`) whenever
`event.persisted` is true — i.e.
whenever the browser restores the page from bfcache instead of a fresh load.
Without this, a page restored mid-transition (back button) could come back
with `<main>` still blurred/offset and the overlay stuck mid-rise. (The
*legacy* overlay system in main.js ~line 1707 does its own equivalent reset
for its own `.page-transition-overlay` class-based overlay — different
element, same idea.)

---

## 2. Post & Static Page Entrance Animation

**Code**: `initPostHeaderAnimation()` in `assets/js/main.js` — there is no
separate post-enter.js. Applies to `.post-header` **or** `.page-header`
(posts, about, contact…), skipped on the homepage hero.

### Sequence

One GSAP timeline, ease `power2.out`:

| Element | From | To | Duration | Start |
|---------|------|----|----------|-------|
| `.post-header` / `.page-header` | `opacity: 0, blur(4px)` (set by JS at run time) | visible, sharp | 0.8s | 0s |
| `.post-title` / `.page-title` | — | letter-by-letter reveal (`animateH1LetterByLetter`) | per-char | 0s |
| `.post-image img` (etc.) | `opacity: 0, scale(0.95)` **from CSS** | `opacity: 1, scale(1)` | 0.8s | 0s |
| First `.gh-content img` (first in-body image) | `opacity: 0, scale(0.97)` **set by this tl** | `opacity: 1, scale(1)` | 0.8s | 0.2s |
| `.page-body` (static pages only) | `opacity: 0, blur(4px)` | visible, sharp | 0.8s | 0.2s |

The hero image's initial `opacity: 0; transform: scale(0.95)` lives in
`main.css` (`.post-header .post-image img`) and this function is the **only**
thing that resolves it — if the entrance is removed without removing the CSS,
post hero images stay invisible. The hero tween must explicitly animate
`opacity: 1` (not just `transform`) — a prior version only tweened
`transform`, leaving the image permanently invisible since GSAP never
touched its opacity.

The first content image (the first `<img>` inside `.gh-content`, e.g. a
kg-image card right after the title) is also brought in by this timeline
rather than by `card-scroll-reveal.js`'s generic scroll-driven reveal —
that observer requires the image to be scrolled up from the bottom half of
the viewport, which can never happen for an image sitting above the fold on
page load. `card-scroll-reveal.js` explicitly excludes:
- images inside `.post-header` / `.page-header` (owned by this function)
- the first `img` inside `.gh-content` (owned by this function, added here)

### Interplay with an incoming transition

If a `.page-transition-overlay` element exists on the page, the entrance waits
for that overlay's `pageTransitionExit` animation to end (with a 400ms
fallback) before running, so the entrance doesn't play behind the overlay.

### When it runs

On the homepage the call is gated behind `preloader:done`; on all other pages
there is no preloader element, so it runs during the normal main.js boot —
effectively immediately. Full pipeline: [page-load-animations.md](page-load-animations.md).

---

## 3. Adding the transition to new links

```html
<!-- Internal link with transition -->
<a href="/about" data-transition class="button">More about me</a>

<!-- Post card grid links (post-card-grid.hbs) -->
<a href="{{url}}" class="grid-card-link" data-transition>

<!-- post-card.hbs list/stacked cards -->
<!-- Add data-transition to the .post-card-link anchor -->
```

---

## 4. Tuning values

### Exit (page-transition.js → `runTransition`)

```js
// Current page
filter: 'blur(10px)',  // exit blur
y: -48,                // upward drift (px)
duration: 0.45,        // blur/drift speed

// Dark scrim (starts at t=0, alongside the blur)
background: 'rgba(0, 0, 0, 0.55)',
duration: 0.45,        // fade-in speed
ease: 'power2.in',     // accelerating: starts slow, speeds up

// Panel rise
duration: 0.58,        // how fast the panel covers the screen
scaleX/Y: 1.2,         // overshoot so it covers edge-to-edge
// start offset 0.06s after the blur begins
```

### Entrance (main.js → `initPostHeaderAnimation`)

```js
// Header fade + un-blur
duration: 0.8, ease: 'power2.out'

// Hero image settle (initial scale defined in main.css) — must animate
// BOTH opacity and transform, CSS only sets the initial hidden state
opacity: 1, transform: 'scale(1)', duration: 0.8

// First in-body content image (kg-image), starts slightly after header
opacity: 0 -> 1, scale: 0.97 -> 1, duration: 0.8, start offset: 0.2s

// .page-body stagger (static pages)
start offset: 0.2s
```
