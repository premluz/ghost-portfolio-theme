# Page Load & Entrance Animations

Consolidated reference for everything that happens between "browser requests page"
and "page is fully revealed and idle". Covers initial hidden states, the load
pipeline, entrance sequences per page type, hero and profile animations, and how
state resets on navigation.

Related docs (this file consolidates and links, it does not replace):

| Doc | Covers |
|-----|--------|
| [page-transitions.md](page-transitions.md) | Exit animation on `data-transition` links |
| [../ANIMATIONS.md](../ANIMATIONS.md) | Heading text animations + card scroll reveals (config detail) |
| [../ORCHESTRATOR-ANIMATION.md](../ORCHESTRATOR-ANIMATION.md) | Architecture notes, observer-vs-scrub rationale |
| [../GSAP-CONFIG.md](../GSAP-CONFIG.md) | GSAP setup |
| [../COMMON_ISSUES.md](../COMMON_ISSUES.md) | Known animation pitfalls |

---

## 1. The load pipeline (big picture)

```
Browser load
   │
   ├─ <head> script + preloader.js decide:
   │     first visit  → FULL PRELOADER (html.preloading, everything hidden)
   │     return visit → SKIP PATH (preloader_seen in localStorage)
   │
   ├─ preloader:done  ← window CustomEvent, THE master gate
   │     • dispatched after preloader fade-out (full run)
   │     • dispatched via setTimeout(0) on skip path
   │
   ├─ Consumers of preloader:done (each registers independently):
   │     • main.js boot (~line 2418) → initHero(), initPostHeaderAnimation(), …
   │     • scroll-scrub-anim.js      → hero headline lines, profile, data-animate
   │     • gpu-particle-integration.hbs → GPU particle system init
   │
   ├─ heroEntranceDone ← dispatched on .hero element 2s after the hero
   │     entrance timeline completes (main.js initHero onComplete)
   │     • logomark animation starts
   │     • preloader.js adds html.page-ready → nav + footer fade in
   │
   └─ Idle state: scroll-driven systems take over
         (heading-animations.js observers, card-scroll-reveal.js,
          scroll-scrub-anim.js scrubs, particle scroll morphs)
```

Key globals and flags:

| Flag | Set by | Meaning |
|------|--------|---------|
| `localStorage.preloader_seen` | preloader.js | Preloader already shown — skip it on every later load (persists until storage cleared; delete it to test the full run) |
| `window.__preloaderRunning` | preloader.js | Full preloader in progress |
| `window.__preloaderSkipped` | preloader.js | Skip path taken; `page-ready` set synchronously |
| `html.preloading` class | head script / preloader.js | Nav, footer, `#hero-headline`, all `main > *` (except `#preloader`) hidden via CSS (main.css ~line 140) |
| `html.page-ready` class | preloader.js (after `heroEntranceDone`, 1200ms fallback) | Nav/footer allowed to show |
| `preloader:done` event | preloader.js | Master gate for all entrance work |
| `heroEntranceDone` event (on `.hero`) | main.js `initHero` | Hero settled; logomark + `page-ready` may proceed |

**Rule of thumb: never listen for `preloader:done` from code that itself runs
after the preloader** — the event has already fired and you'll wait forever.
Check `window.__preloaderSkipped || html.page-ready` first, then fall back to
the listener (see the boot IIFE at the bottom of scroll-scrub-anim.js for the
canonical 3-case pattern).

---

## 2. Initial state — what is hidden before entrance

### Via CSS classes (main.css, `html.preloading …`)
- `.gh-navigation`, `.gh-footer` — hidden until `page-ready`
- `#hero-headline` — hidden until scroll-scrub-anim splits + reveals it
- `main > *:not(#preloader)` — everything hidden during full preloader run

### Via CSS initial values (resolved only by JS)
- `.post-header .post-image img` — `opacity: 0; transform: scale(0.95)`
  (main.css ~line 3004). `initPostHeaderAnimation()` animates it visible.
  If a post hero image ever "never appears", this pairing broke.
- `.hero-intro` etc. have CSS initial `opacity: 0`; `initHero()` makes the
  **parent** visible and animates split children (see the CRITICAL comment in
  main.js ~line 634 — parent must be un-hidden or child animations are invisible).

### Via JS `gsap.set` at init time
- scroll-scrub-anim `splitText()` spans start `opacity: 0`
- Profile: image wrapper `x: 500`, text `opacity: 0, y: 40, blur(16px)`,
  headline letters `opacity: 0` (initProfile, desktop only)
- Hero tags `opacity: 0, scale: 0.9, y: 8`

---

## 3. Entrance sequences by page type

### 3.1 Home page (first visit — full preloader)

1. **Preloader** (preloader.js, `#preloader` element, homepage only)
   - Tracks GLB + video asset loading → progress bar + % counter
   - "prems • design" wordmark animates while loading
   - At 100%: burst animation, `_runParticles()` (waits for `window.particleSystem`),
     wordmark flies to logo position, preloader fades out
   - `preloader:done` dispatched from `_hide()` after full fade-out
2. **Hero entrance** — two cooperating systems:
   - `main.js initHero()` (timeline, ease `cubic-bezier(0.2,0,0,1)`):

     | Element | Animation | Start | Duration |
     |---------|-----------|-------|----------|
     | `.hero-intro` | SplitType words, `y:12→0` fade, stagger 0.03 | 0s | 0.5s |
     | `.hero-description` | letter-by-letter (`animateH1LetterByLetter`) | 0.15s | — |
     | `.hero-tags .tag` | scale 0.9→1 + fade, stagger 0.05 | 0.2s | 0.5s |
     | `.hero-image-wrapper` | `animateImageEntrance` zoom+fade | 0s | 0.8s |

     The headline is **not** animated here (skipped in favor of line reveal below).
   - `scroll-scrub-anim.js initHero()`: splits `#hero-headline` into 2-word
     line spans, staggers them in (blur + y), and fires
     `particleSystem.morphTo('helix', 600)` at the same moment — particles wind
     into the helix alongside the headline reveal. Guarded by
     `data-hero-animated` to prevent double-run.
3. **`heroEntranceDone`** (2s after timeline complete) → logomark animation
   (main.js ~line 1999) + `html.page-ready` (nav/footer fade in via CSS).

### 3.2 Home page (return visit — skip path)

- Preloader hides itself instantly, sets `page-ready` synchronously,
  dispatches `preloader:done` on `setTimeout(0)`.
- Same hero sequence as above, just without the preloader wait.
- `intro.js` (`#intro` element via partials/intro.hbs, when present): a
  self-contained multi-phase sequence — "Hello, I'm Prem" word reveal (2s hold,
  reverse out) → "Welcome to" (same) → headline falls from top
  (`y: -innerHeight → 0`, `power1.in`). Runs on DOMContentLoaded, independent
  of the preloader gates. Config at top of intro.js.

### 3.3 Post pages

`main.js initPostHeaderAnimation()` (runs after `preloader:done`; on
non-homepage pages the preloader element doesn't exist so this is immediate):

| Element | Animation | Start | Duration |
|---------|-----------|-------|----------|
| `.post-header` | opacity 0→1 + blur 4px→0 | 0s | 0.8s |
| `.post-title` | letter-by-letter | 0s | — |
| `.post-image img` | scale 0.95→1 (opacity handled with it) | 0s | 0.8s |

If a `.page-transition-overlay` element exists, the animation waits for its
`pageTransitionExit` animationend (400ms fallback) so entrance doesn't fight
the incoming transition.

> ⚠️ **Doc drift**: docs/page-transitions.md describes a `post-enter.js` file, a
> `#pt-darken` veil, and a bfcache `resetState()` — none of these exist in the
> current code. The actual post entrance is `initPostHeaderAnimation()` in
> main.js; the actual exit transition is the simpler page-transition.js
> (blur + overlay rise, no darken veil, no pageshow reset). Trust the code.

### 3.4 Static pages (about / contact)

Same as post pages (`.page-header` is matched by the same function), plus
`.page-body` fades in (opacity + blur) starting 0.2s after the header.

### 3.5 Archive / work / card grids

No dedicated page entrance — cards animate on scroll via
`card-scroll-reveal.js` (`data-card-reveal` variants: `default`, zoom
(scale 1.3→1), `slide-left`). First-viewport cards therefore animate
immediately after `preloader:done`/load. Config table in
[ANIMATIONS.md](../ANIMATIONS.md).

---

## 4. Profile section (`partials/profile.hbs`)

Animation is owned entirely by **scroll-scrub-anim.js `initProfile()`**
(the partial's own comment says so; there is no inline script).

- **Desktop only** — bails at `window.innerWidth <= 1024` (CSS handles mobile).
- Initial states: image wrapper `x: 500` (slides in from right), intro/tags
  `opacity 0, y 40, blur 16px`, description spans (`data-animate="slide-left"`)
  `opacity 0, x 100`, headline manually split into `.char` letter spans at
  `opacity: 0`.
- Enter/exit timelines are visibility-driven (IntersectionObserver with
  debounce) — the section animates in when scrolled into view and **reverses
  out** when it leaves, so it replays on every pass.
- The headline sets `data-heading-anim-done="true"` so heading-animations.js
  won't double-animate it.
- The six `profile-item` blocks use `data-card-reveal="slide-left"` →
  handled by card-scroll-reveal.js with per-item stagger.

---

## 5. Text & heading animations on load

`heading-animations.js` auto-animates headings when they enter the viewport
(IntersectionObserver, threshold 0.25, rootMargin `-120px` bottom):

- h1/h2 → letter-by-letter, h3 → word-by-word, h4+ → fade
- Exclusions: elements inside `.post-header` (owned by
  `initPostHeaderAnimation`), elements with `data-heading-anim-done`,
  `data-animate` overrides
- Headings visible in the first viewport animate immediately after init —
  which is gated on `preloader:done` on the homepage, immediate elsewhere.

Full config/override tables: [ANIMATIONS.md](../ANIMATIONS.md).

---

## 6. Particles on page load

- `gpu-particle-integration.hbs` (in default.hbs) waits for `preloader:done`,
  creates the GPU system, `start('dispersed')`, then morphs to **helix**
  (page-load trigger, plus the scroll-scrub hero reveal fires its own
  `morphTo('helix', 600)` — the morph controller de-duplicates).
- Card/section morphs after load are scroll-driven (main.js card observer,
  statement-section observer, hero `onLeaveBack`).
- Details: [../GPU_PARTICLES_INTEGRATION.md](../GPU_PARTICLES_INTEGRATION.md).

---

## 7. Navigation & reset behavior

This theme is **not** a SPA — every navigation is a full page load, so all
entrance state is rebuilt from scratch each time. The things that persist or
need explicit resetting:

| Concern | Mechanism |
|---------|-----------|
| Preloader replay | `localStorage.preloader_seen` — set on first run, never expires. Full preloader only ever runs once per browser profile. Delete the key (DevTools → Application → Local Storage) to see it again. |
| Exit animation (leaving a page) | page-transition.js on `a[data-transition]` links: `<main>` blurs (10px) + drifts up 48px while a rounded panel rises from below (0.58s `power3.in`), then `location.href` navigates. Modifier-clicks, `target="_blank"`, and hash links pass through. |
| Back button (bfcache) | The legacy overlay system in main.js (~line 1707) resets `.page-transition-overlay` classes on `pageshow` when `e.persisted`. The newer page-transition.js overlay has **no** bfcache reset — if users report a stuck dark overlay after back-navigation, add a `pageshow` handler there that re-sets `yPercent: 105` and clears `<main>` blur. |
| Scroll restoration | Left to the browser (no manual `scrollRestoration` handling). |

---

## 8. Customization guide

### Timing / feel knobs

| What | Where |
|------|-------|
| Hero element timings & ease | main.js `initHero()` (timeline positions inline) |
| Hero headline line reveal (blur, y, stagger, enterDuration) | scroll-scrub-anim.js `this.config` |
| Post/page header entrance | main.js `initPostHeaderAnimation()` |
| Heading letter/word/fade params + observer thresholds | heading-animations.js `HEADING_ANIM_CONFIG` |
| Card reveal variants (scale/blur/stagger) | card-scroll-reveal.js config block (top of file) |
| Intro phases (word timing, fall duration) | intro.js `CONFIG` |
| Exit transition (blur, panel speed) | page-transition.js `runTransition()` |
| Preloader asset list & phase timing | preloader.js (`GLB_FILES`, timeline constants) |

### Adding animation to new elements

```html
<!-- Heading override / opt-in for non-headings -->
<p data-animate="letter">…</p>   <!-- or "word" / "fade" / "slide-left" -->

<!-- Card-style scroll reveal -->
<div data-card-reveal="default">…</div>   <!-- or "slide-left", zoom -->

<!-- Page exit transition on a link -->
<a href="/about" data-transition>About</a>
```

### Opting out

- `data-heading-anim-done="true"` — heading-animations.js skips it
- Keep elements out of `.post-header` / `.hero` if they should use the
  generic observers (those containers are excluded — their entrances are
  owned by the dedicated functions)

### Adding a new entrance that must wait for the preloader

Use the canonical 3-case boot (copy from the bottom of scroll-scrub-anim.js):
no `#preloader` element → run now; `__preloaderSkipped`/`page-ready` → run
now; otherwise listen for `preloader:done` once, with a safety timeout.

---

## 9. Gotchas (learned the hard way)

1. **Don't `setTimeout` before registering the `preloader:done` listener** —
   on cached visits the event fires at ~0ms and you'll miss it (this exact bug
   made the hero wait for a 5s fallback once; see scroll-scrub-anim.js boot
   comment).
2. **Parents with CSS `opacity: 0` swallow child animations** — reveal the
   parent with `gsap.set`, animate the children (main.js initHero, item 1).
3. **Two systems animating one element = flash or double-run** — use the
   guard attributes (`data-hero-animated`, `data-heading-anim-done`) when
   adding anything new that touches hero or headings.
4. **CSS initial states must have exactly one JS resolver** — if you remove an
   entrance function, also remove its `opacity: 0` partner in main.css, or
   content stays invisible (see CLAUDE-memory "CSS initial states").
