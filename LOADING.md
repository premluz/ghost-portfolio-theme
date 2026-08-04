# Loading & Visibility

How content becomes visible on this theme: the pre-paint veils, the four
entrance paths, card media (skeleton → image/video), and the reveal backfill.

Companion docs: `OPTIMIZATIONS.md` (load/scroll performance), `ANIMATIONS.md`,
`COMMON_ISSUES.md` (symptom-first index).

---

## 1. The core rule: most content has no opacity of its own

Two different visibility models coexist. Confusing them is the single biggest
source of "why is this invisible" bugs.

| Elements | Hidden by | Revealed by |
|---|---|---|
| `.post-card-content`, `.post-card-image` | **nothing of their own** — they inherit their ancestor's opacity | whatever reveals `.home` / `<main>` |
| `.testimonial-card`, `.about-card`, `.personal-card`, `.profile-paragraph`, `.profile-item`, `.om3-card` | CSS `opacity: 0` (post-card-grid.css) | `card-scroll-reveal.js` IntersectionObserver, or `__revealBackfill()` |

**Post cards are page-level only.** They are deliberately *not* in
`card-scroll-reveal.js`'s registry (a per-card fade there raced the metadata
fetch and read as a second, competing animation). So if post cards are
invisible, the cause is almost never the card system — it is an ancestor
(`.home` or `<main>`) still held at `opacity: 0` by a veil. Check the veils
first; `__revealBackfill` returning `0` while cards are invisible is the
signature of exactly that.

---

## 2. The veils (pre-paint hide classes)

Set synchronously in `default.hbs` `<head>` so raw markup never paints before
JS can take ownership. Each has a failsafe so a stalled script can't leave the
page permanently blank.

| Class | Hides | Set when | Cleared by | Failsafe |
|---|---|---|---|---|
| `landing-pending` | `.home` | home + same-origin referrer | `runLandingAnimation()` (isHome), `runCurtainEntrance()` | 2500 ms |
| `main-pending` | `<main>` | any non-home page | `runLandingAnimation()` (non-home), `runCurtainEntrance()` | 2500 ms |
| `curtain-restoring` | `.home` **and** `#particle-morph-demo` | curtain return **and** saved `scrollY > 100` | `__particleApply()` (default.hbs), `runCurtainEntrance()` | 8000 ms |

CSS lives in `main.css` (`html.landing-pending .home`, `html.main-pending main`,
`html.curtain-restoring .home` / `#particle-morph-demo`), all `opacity: 0
!important`.

**Invariant:** every veil must be cleared by *whichever* function ends up
owning the entrance. `runEntranceAnimation()` is
`if (!runCurtainEntrance()) runLandingAnimation();` — the two are mutually
exclusive, so a veil cleared in only one of them is a latent bug on the other
path. That is precisely what broke on 2026-08-03 (§5).

---

## 3. The four entrance paths

| Path | Trigger | Owner | Measured to visible |
|---|---|---|---|
| Fresh landing (home) | no/external referrer | preloader choreography | ~342 ms |
| Same-site → home | nav menu, logo | `runLandingAnimation()` isHome branch | ~350 ms |
| → non-home (Profile/About, Contact, Work, post) | any nav | `runLandingAnimation()` non-home branch | ~935 ms |
| **Close button → back** | `.nav-close-btn` | `runCurtainEntrance()` | ~552 ms |

### The close-button (curtain return) path in detail

`.nav-close-btn` exists on post pages only (`navigation.hbs`, `{{#is "post"}}`).
It is the return leg of the post transition and has the most moving parts:

1. Click → `closePost()` → `runCurtainExit(origin.url)`.
2. Exit writes `sessionStorage.curtainReturn = '1'`; `postOrigin`
   (`{url, scrollY}`) was written earlier by the click that *opened* the post.
3. Fades `<main>` down + scrim up, then a real navigation (`location.href`).
4. On arrival, `default.hbs` head reads those keys and — **only if the saved
   `scrollY > 100`** — raises `curtain-restoring`, hiding `.home` and the
   particle layer so a mid-page return doesn't paint at scroll-top (hero
   visible) for a frame before the jump.
5. `runCurtainEntrance()` (DOMContentLoaded) clears the veils, instant-jumps to
   the saved `scrollY`, runs `__revealBackfill()` at 450/1200/2500 ms plus a
   `ResizeObserver` for late layout growth, and fades `<main>` in.

That `scrollY > 100` condition matters when reproducing bugs on this path:
**closing a post you opened from the top of the page skips the veil entirely.**
Symptoms only appear when you scrolled down before opening the post.

---

## 4. Card media: skeleton → image or video

`.card-media-skeleton` shimmers until the card's real media resolves. Metadata
is fetched lazily per card, so cards far below the fold legitimately still show
a skeleton — that is not a bug.

- **Image** (`showImageFallback`, post-and-cards.js): `<img>` is server-rendered
  with a `src`, so `img.complete && img.naturalWidth > 0` is already true on a
  warm cache → shown instantly, no fade. Otherwise the standard
  `SCROLL_REVEAL_CONFIG.image` reveal.
- **Video** (`applyCardMeta`): the element is created in JS, so there is no
  equivalent synchronous "already loaded" signal — see §6. Cache hits are
  detected by *timing* `load()` → `loadeddata` against `CACHED_VIDEO_MS`
  (150 ms): under it → instant, over it → fade.

Every failure path (no video field, malformed metadata, fetch error) must end
in `showImageFallback()`, or the skeleton shimmers forever.

---

## 5. Reveal backfill (why scroll-restore needs a guardrail)

A curtain return jumps instantly to the saved scroll position, so
IntersectionObserver never fires for everything "passed over" — and the reveal
conditions (`isScrollingDown && isInBottomHalf`) can't be satisfied by a jump
anyway. Two registries force-reveal anything at or above the restored viewport:

- `window.__revealBackfill()` — card-scroll-reveal.js (images + observed cards)
- `window.__cardContentRevealBackfill()` — post-and-cards.js (card
  title/bullets/keywords/testimonial, a separate system with its own state)

Both are idempotent and animate elements currently on screen while snapping
those above it. **Any new IntersectionObserver-based reveal must register into
one of these** (or route through `window.observeCardReveal`) or it will strand
elements on a curtain return.

Backfill is also **timing-sensitive**: it runs on `setTimeout`, so anything that
blocks the main thread starves it. GLB shape loading used to fire immediately on
init and froze the thread for seconds (parse + `subdivideGeometry` +
`MeshSurfaceSampler.build()` are synchronous — `mobile.glb` alone expands
43,147 → 1,016,880 vertices). Deferring the kickoff to `requestIdleCallback`
(`particle-morph-system.js`) moved the first backfill from **3033 ms → 1342 ms**.

---

## 6. Fixed issues (keep these from regressing)

### Post cards invisible for 8s, then popped in at once (2026-08-03)

**Symptom:** close a post after scrolling down → page blank (particles/helix
visible, scrim faded fine), then everything appeared abruptly seconds later.

**Cause:** two veils over `.home`, neither cleared on the curtain path.

1. `landing-pending` is raised on *any* same-origin arrival at `/` — a curtain
   return qualifies — but was only cleared by `runLandingAnimation()`, which
   `runCurtainEntrance()` short-circuits. It sat until its 2.5 s failsafe.
2. `curtain-restoring` **deadlocked**: it was only cleared by `__particleApply()`
   with a non-`'hero'` key, but a restore landing inside the hero only ever
   fires `'hero'`, and that key's guard returns early *because the veil is up*
   (`if (veiled || …) return;` sits before the removal line). Nothing could
   clear it → full 8 s failsafe.

Measured `.home` at `opacity: 0` for **8122 ms**, released only by the 8 s
timeout. Post cards inherit that opacity (§1), hence "cards take time and come
abruptly" while particles (outside `.home`) showed immediately.

**Fix:** `runCurtainEntrance()` now clears `landing-pending` alongside
`main-pending`, and clears `curtain-restoring` immediately after the scroll
snap — the real "restore has settled" moment, rather than delegating to a
particle trigger that may never fire. Result: 8122 ms → **552 ms**, with the
veil still masking the pre-restore frame (up at t≈101 ms while `scrollY` is 0,
down by t≈552 ms with scroll restored). No regression on the other three paths.

> Note: this only regressed *because* `landing-pending` was reintroduced for the
> hero letter-reveal entrance. Production had deleted that rule entirely, which
> is why the same flow worked there — a veil added for one path silently broke
> another.

### Card videos always faded, even when cached

**Symptom:** skeleton, then a visible fade-in, on media that was already cached.

**Cause:** the cache check was `video.readyState >= 2` evaluated synchronously on
the line right after `video.load()`. `load()` *resets* `readyState` to
`HAVE_NOTHING` (0) and loads asynchronously, so a fully cached video still
reports `0` there. Measured `readyState: 0` in every case, cold and warm — the
check could never be true, so every video took the animated branch.

**Fix:** time `load()` → `loadeddata` against `CACHED_VIDEO_MS`.

Validated against a *second, genuinely different* condition, because localhost
cannot distinguish the cases (cold and warm both measure ~1 ms there — the test
would have passed for the wrong reason). Throttled to 800 kbps / 150 ms RTT:

| Condition | Gap | Result |
|---|---|---|
| Cold, cache disabled | 951 ms | fade ✅ |
| Cache-priming fetch | 2470 ms | fade ✅ |
| Cached | 1 ms | instant ✅ |

---

## 7. Debugging

`console.log`/`warn` are silenced unless `window.DEBUG_SCROLL` is set. It
**persists across navigations** via localStorage (set once, survives the
home → post → close round trip; set `false` to stop). Without persistence a
plain assignment is lost on every navigation, which makes this whole flow
undebuggable from devtools.

Useful lines: `[curtain-return]` (veil state, origin, per-pass backfill counts),
`[revealBackfill]` / `[cardContentRevealBackfill]` (registry sizes, limits).

**When content is invisible, check in this order:**

1. `document.documentElement.className` — is a veil still up?
2. Is the invisible element inside `.home` / `<main>`? → ancestor problem, not
   a card problem (§1).
3. Only then look at the element's own opacity / reveal system.

Verify:
```bash
grep -n "classList.remove('landing-pending'\|classList.remove('curtain-restoring'\|classList.remove('main-pending'" assets/js/page-transition.js
grep -n "landing-pending\|main-pending\|curtain-restoring" assets/css/main.css
grep -n "CACHED_VIDEO_MS" assets/js/post-and-cards.js
```

---

## 8. Rules for future work

- A veil added for one entrance path must be cleared on **every** path that can
  raise it — check `runCurtainEntrance()` *and* `runLandingAnimation()`.
- Never let a veil gate its own removal. If clearing depends on another system
  firing, that system must be reachable while the veil is up, or clear it
  directly at the moment its purpose is served.
- Failsafes are a backstop, never the mechanism. If content appears at ~2.5 s or
  ~8 s, a failsafe is doing the work and something upstream failed.
- Don't add blocking synchronous work (mesh subdivision, large procedural
  generation) on the load path — it starves `setTimeout`-based reveal logic.
- New IntersectionObserver reveals must register into a backfill registry (§5).
- Cache-hit detection needs a signal that is actually valid at check time; test
  it under throttling, since localhost makes cold and warm indistinguishable.
