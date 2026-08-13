# Animation System Documentation

## Overview

The theme uses a sophisticated scroll-driven animation system with hierarchical defaults and instance-level customization. All animations respect scroll direction (up/down) and can be easily toggled or configured.

---

## Text Animations (Headings & Custom Elements)

### System: `initHeadingAnimations()`

Applies letter-by-letter, word-by-word, or fade animations to headings and custom elements based on type and user preference.

### Default Animation by Heading Level

| Element | Trigger | Animation Type | Speed | Use Case |
|---------|---------|---|---|---|
| **h1** | IntersectionObserver | Letter-by-letter | Slower (0.14s/char) | Page hero titles |
| **h2** | IntersectionObserver | Letter-by-letter | Staggered per char | Section headlines |
| **h3** | IntersectionObserver | Word-by-word | Staggered per word | Section subtitles |
| **h4+** | IntersectionObserver | Fade | Fast (0.6s) | Subtitles, descriptions |

**Bidirectional:** reveals on scroll-down entry, reverses (last-first stagger) on scroll-up exit. Uses `WeakSet` + scroll direction tracking to prevent false triggers. Kill-tweens race protection on every transition.

### Configuration

Edit [`heading-animations.js:3-32`](assets/js/heading-animations.js#L3-L32) - `HEADING_ANIM_CONFIG`:

```js
const HEADING_ANIM_CONFIG = {
  defaultBlur: 8,        // Initial blur amount (px)
  defaults: {
    h1: 'letter', h2: 'letter', h3: 'word', h4: 'fade',
  },
  letter: {
    charDuration: 0.14,  // Time per character (↓ faster, ↑ slower)
    ease: 'power1.out',
    spreadMin: 0.10,     // Stagger spread for long headings
    spreadMax: 0.22,     // Stagger spread for short headings
    blurDuration: 0.7,   // Blur clear time
  },
  word: {
    duration: 0.25,      // Per-word duration
    stagger: 0.015,      // Delay between words
    ease: 'cubic-bezier(0.16, 0.84, 0.44, 1)',
    yOffset: 0,
  },
  fade: {
    duration: 0.6,
    ease: 'power2.out',
  },
  observer: {
    threshold: 0.25,     // % visible to trigger
    rootMargin: '0px 0px -120px 0px',
  },
};
```

### Instance-Level Overrides

```html
<!-- Force word animation on h2 (normally letter) -->
<h2 data-animate="word">Faster reveal</h2>

<!-- Override blur amount -->
<h2 data-blur="12">More blurry start</h2>
<h2 data-blur="0">No blur</h2>

<!-- Skip heading-animations entirely (handled elsewhere) -->
<h2 data-skip-animation="true">Not animated</h2>
```

**Note:** `data-animate` on a heading skips it from `heading-animations.js` entirely — it routes to `scroll-scrub-anim.js` instead.

### How It Works

1. **Initial State**: Element starts invisible
   - `opacity: 0`
   - `blur: 8px` (default, customizable)

2. **On Scroll Down** (entering from bottom of viewport):
   - Animation triggers
   - Letters/words stagger in with blur unblurring
   - Element reveals smoothly

3. **On Scroll Up** (leaving viewport):
   - Animation reverses
   - Letters/words fade back out in reverse order
   - Blur re-applies

4. **On Scroll Down Again**:
   - Animation plays fresh from initial state
   - No glitches or state issues

### Animation Types

#### Letter-by-Letter (h1, h2)
- Each character animates in sequentially
- Slower, more deliberate
- Good for: Main headlines, impactful text
- Example: "Solving complexity..." reveals letter by letter

#### Word-by-Word (h3)
- Each word animates in sequentially
- Medium speed, natural flow
- Good for: Captions, descriptions, section titles
- Example: "I work on products where..." reveals word by word

#### Fade (h4+)
- Simple opacity fade
- Fastest
- Good for: Subtitles, secondary text
- Example: Testimonial snippets fade in

---

## Scroll Reveal Animations (Cards & Images)

### System: `initCardScrollReveal()`

Applies fade + scale + blur + y-offset animations to cards and images as you scroll.

### Animated Elements

| Element | Animation | Enabled? |
|---------|---|---|
| **Images** | Fade + scale + blur | ✅ Yes |
| **Post Cards** | Fade + scale + blur + y-slide | ❌ Disabled |
| **Testimonial Cards** | Fade + scale + blur + y-slide | ✅ Yes |
| **About/Personal Cards** | Fade + scale + blur + y-slide | ✅ Yes |

### Configuration

Edit [`main.js:173-192`](main.js#L173-L192) - `SCROLL_REVEAL_CONFIG`:

```js
const SCROLL_REVEAL_CONFIG = {
  image: {
    duration: 0.64,        // Animation time (↓ faster)
    scale: { start: 0.97, end: 1 },      // Zoom: 97% → 100%
    blur: { start: 8, end: 0 },          // Blur: 8px → 0
  },
  card: {
    duration: 0.48,        // Animation time
    yOffset: 16,           // Slide up distance (px)
    scale: { start: 0.97, end: 1 },
    blur: { start: 4, end: 0 },
    staggerDelay: 0.1,     // Delay between cards in grid
  }
};
```

### Card Animation Details

**Before scroll:**
```
opacity: 0      (invisible)
scale: 0.97     (slightly smaller)
blur: 4px       (blurred)
y: 16px         (16px below final position)
```

**On scroll (entering from bottom):**
```
opacity: 0 → 1        (fade in)
scale: 0.97 → 1       (zoom to normal)
blur: 4px → 0         (unblur)
y: 16px → 0           (slide up)
```

**On scroll up (leaving from bottom):**
```
All properties reverse smoothly
```

### Disable Post-Card Animations

**Currently DISABLED for post cards.** Cards use `initCardScrollReveal()` in `main.js`.

---

## Directional Scroll Logic

All animations respect **scroll direction**:

### Scroll Down
- Element enters from bottom of viewport
- **Only then** does animation trigger
- Animation: reveal/unblur

### Scroll Up
- Element leaves from bottom of viewport
- **Only then** does reverse animation trigger
- Animation: hide/blur

### Scroll Up Then Down
- No animation when entering from top (scrolling up)
- Animation fires fresh when re-entering from bottom (scrolling down)

**Why?** Creates natural, predictable reveal effects that feel intentional.

---

## Performance Notes

### SplitType Pre-Splitting
- Word-animated headings are pre-split on page load
- Avoids layout jank during animation
- Trade-off: Slight upfront cost for smooth animation

### Timeline-Based Animations
- Word/letter animations use `gsap.timeline()` not bare `gsap.to()`
- Ensures `onComplete` fires once (not per-element)
- Prevents state race conditions

### WeakSet State Tracking
- `revealedHeadings` WeakSet in `heading-animations.js`
- Auto-cleanup when elements removed from DOM
- No memory leaks

---

## Customization Examples

### Make all h3 fade instead of word-animate

Change [`main.js:141`](main.js#L141):
```js
h3: 'fade',  // Was 'word'
```

### Speed up all word animations by 30%

Change [`main.js:154`](main.js#L154):
```js
duration: 0.38,  // Was 0.55 (0.55 × 0.69 ≈ 0.38)
```

### Make cards reveal earlier on scroll

Change [`main.js:168`](main.js#L168):
```js
rootMargin: '0px 0px -80px 0px',  // Was -120px (triggers 40px earlier)
```

### Disable all blur effects

Change [`main.js:135`](main.js#L135):
```js
defaultBlur: 0,  // Was 8
```

---

## Debugging

### Check if element is animating

Open DevTools Console and look for logs:
```
[heading-anim] REVEAL: { mode: "word", tag: "H3", ... }
[word-anim] ANIMATE START: { words: 17, ... }
```

### Check element initial state

In DevTools Elements tab, inspect the element. Should show:
```html
<h3 style="opacity: 0; filter: blur(8px);">Text</h3>
```

### Reset debug logging

Remove console.log statements at:
- [`main.js:2831`](main.js#L2831) - REVEAL logs
- [`main.js:2844`](main.js#L2844) - REVERSE logs
- [`main.js:2467`](main.js#L2467) - ANIMATE START logs

---

## Troubleshooting

### Animation not triggering
- Check element is in viewport (scroll to it)
- Verify element has content (not empty)
- Check if excluded by filter (see code line ~3012)
- Ensure `data-animate="none"` is not set

### Animation glitchy
- Check browser console for errors
- Verify GSAP loaded (`window.gsap` exists)
- Try refreshing page (cache issue)

### Animation too slow/fast
- Adjust `duration` or `charDuration` in config
- Reload page to apply changes

---

## File References

| File | Purpose |
|------|---------|
| [`assets/js/heading-animations.js`](assets/js/heading-animations.js) | All heading animations — config, reveal, reset, observer |
| [`assets/js/CONSTANTS.js`](assets/js/CONSTANTS.js) | `SCROLL_ANIMATION_PAUSES` — pause %, eases, speeds per section |
| [`partials/operating-model.hbs`](partials/operating-model.hbs) | Pinned stage pattern — reference implementation |
| [`assets/js/scroll-scrub-anim.js`](assets/js/scroll-scrub-anim.js) | Handles `data-animate` elements (hero, statement sections) |
| [`assets/js/main.js`](assets/js/main.js) | `initCardScrollReveal()`, `initLogoMorphToOperatingModel()` |

