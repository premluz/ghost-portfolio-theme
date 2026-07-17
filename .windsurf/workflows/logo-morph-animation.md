# Logo Morph Animation — `prems.design` → `prem designs`

## Overview

When the user scrolls into the **#operating-model** section, the site logo in the navigation morphs from `prems.design` to `prem designs` in three staggered phases. The animation reverses after the section has fully exited the viewport.

---

## Visual Change

```
Before  →  prems.design
After   →  prem designs
```

| Phase | Element | Action |
|-------|---------|--------|
| 1 | Trailing `s` in "prems" | Fades **out** |
| 2 | `.` dot separator | Fades **out** |
| 3 | `s` appended to "design" | Fades **in** |

---

## HTML Structure

**File:** `partials/navigation.hbs`

```html
<h4 class="nav-logo-text-based">
  <span class="serif">prem<span class="logo-s-prems">s</span></span>
  <span class="brand logo-dot">.</span>
  <span class="sans">design</span>
  <span class="sans logo-s-design">s</span>
</h4>
```

### Selector roles

| Selector | Purpose |
|----------|---------|
| `.logo-s-prems` | The trailing `s` in "prems" — fades out on enter |
| `.logo-dot` | The `.` separator — fades out on enter |
| `.logo-s-design` | The arriving `s` after "design" — hidden by default, fades in on enter |

---

## CSS Initial State

**File:** `assets/css/main.css`

```css
.nav-logo-text-based .logo-s-design {
  opacity: 0;
}
```

The arriving `s` is hidden at page load so the logo always reads `prems.design` before the animation fires.

---

## JavaScript Animation

**File:** `assets/js/main.js` — function `initLogoMorphToOperatingModel()`

### Scroll trigger config

```js
scrollTrigger: {
  trigger: '#operating-model',
  start: 'top top',      // fires when section pins (first heading enters)
  end: 'bottom -160%',   // reverses well after section is off-screen
  toggleActions: 'play reverse play reverse',
}
```

| `toggleActions` position | Action |
|--------------------------|--------|
| `onEnter` | `play` — morph forward |
| `onLeave` | `reverse` — morph back |
| `onEnterBack` | `play` — morph forward again |
| `onLeaveBack` | `reverse` — morph back |

### Timeline phases

```js
// Phase 1 — at t=0s: trailing 's' fades out
tl.to('.logo-s-prems', { opacity: 0, duration: 0.3, ease: 'power2.inOut' }, 0);

// Phase 2 — at t=0.15s: dot fades out
tl.to('.logo-dot',     { opacity: 0, duration: 0.3, ease: 'power2.inOut' }, 0.15);

// Phase 3 — at t=0.3s: arriving 's' fades in
tl.to('.logo-s-design',{ opacity: 1, duration: 0.3, ease: 'power2.inOut' }, 0.3);
```

Total animation duration: **~0.6 s** (staggered 0.15 s between phases).

### Initial state (set by JS, not CSS, so GSAP owns it)

```js
gsap.set('.logo-s-prems', { opacity: 1 });
gsap.set('.logo-dot',     { opacity: 1 });
gsap.set('.logo-s-design',{ opacity: 0 });
```

### Reduced-motion fallback

If `prefers-reduced-motion: reduce` is set the logo jumps immediately to the final `prem designs` state and no scroll animation is registered.

```js
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReducedMotion) {
  gsap.set('.logo-s-prems', { opacity: 0 });
  gsap.set('.logo-dot',     { opacity: 0 });
  gsap.set('.logo-s-design',{ opacity: 1 });
  return;
}
```

---

## Timing / Scroll positions

| Scroll event | What happens |
|-------------|-------------|
| `#operating-model` top reaches viewport top | Animation plays forward |
| Inside section / pinned | Logo stays as `prem designs` |
| Section bottom scrolls 160% above viewport top | Animation reverses to `prems.design` |

The generous `end: 'bottom -160%'` was chosen so the logo does not revert while the user is still reading the operating model content or the section immediately following it.

---

## Dependencies

- **GSAP** (loaded globally)
- **ScrollTrigger** plugin (registered globally)
- `initLogoMorphToOperatingModel()` is called from the main `DOMContentLoaded` handler with a GSAP availability check + 50 ms retry loop.
