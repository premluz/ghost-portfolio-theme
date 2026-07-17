# GSAP Architecture — Current State, Issues & Recommendations

> Reflects the site as currently wired in `index.hbs` (hero → logos-ribbon → posts-tabs →
> operating-model-stacked → profile → testimonials). Written after fixing two real bugs in
> `operating-model-stacked.hbs` (see `COMMON_ISSUES.md`) surfaced a broader pattern worth
> documenting on its own.
>
> **`GSAP-ANIMATION-AUDIT.md` is stale** — it documents an earlier page order (`#operating-model`,
> `#hero-sequence`, no `posts-tabs` before operating model) and calls the debounced
> `resize → ScrollTrigger.refresh()` pattern "correct," which this doc's evidence contradicts.
> Treat this file as the current one; that one as historical.

---

## The one-line verdict

**The library choice is right; most of the organizational gaps below have since been resolved or
deliberately dropped with evidence.** GSAP + ScrollTrigger is the correct foundation for this kind
of scroll storytelling site — pin+scrub for narrative sections, IntersectionObserver for simple
one-shot reveals, is a legitimate and common split.

*(Original framing, kept for context on why this review started: the site appeared to have ~10
independent, hand-rolled implementations of the same pinned-section pattern. A follow-up audit
restricted to the live render tree — see "What's actually active vs. dead code" below — found
that count included three dead-code files that were never live, and that only **one** real
consumer of a "shared pinned-section pattern" exists today. See each numbered gap below for what
was actually resolved, dropped, or left open.)*

---

## What's actually active vs. dead code

Worth knowing before touching anything — several files that look like part of the live site
are not:

| File | Status |
|------|--------|
| `operating-model-stacked.hbs` | **Active** — included in `index.hbs`, the current pinned carousel |
| `operating-model-v2.hbs` | **Dead code** — commented out in `index.hbs` (`{{!-- Original: {{> operating-model-v2}} --}}`). Has the identical baked-`VW`/`VH` pattern as the bug we just fixed in `-stacked`. Will resurface the same bug if ever re-enabled. |
| `operating-model.hbs` | **Dead code** — not included anywhere in `index.hbs`. Referenced only in stale docs. |
| `hero-sequence.hbs` | **Dead code** — not included anywhere; `index.hbs` only includes `{{> hero}}`. Its own resize handler is partially better (recomputes total scroll from `window.innerHeight` fresh) but was never audited further since it isn't live. |
| `posts-tabs-grid.hbs` / `.js` | **Dead code** — not included in `index.hbs`; the live tab section is `posts-tabs.hbs`. `default.hbs` still unconditionally links `posts-tabs-grid.css` on every page load though, which is a small, free perf win to remove. |

Three orphaned near-duplicates of the same pinned-carousel pattern sitting in the repo is itself
a maintenance risk: it's easy to accidentally edit the wrong one, or re-enable one without
realizing it never got the fixes the active version has.

---

## Evidence (counted, not guessed)

Original counts below include dead-code files (see previous section) — this is the snapshot that
prompted the review. The follow-up live-tree-only audit found 9 real resize listeners (not 14)
and exactly 9 live `ScrollTrigger.create()` sites, of which only 1 is a genuine pinned+scrubbed
multi-stage section — see the resolution notes under each numbered gap below for the corrected,
scoped numbers actually acted on.

```
ScrollTrigger.create() call sites   : 22, across 10 different files
Files using IntersectionObserver    : 15
gsap.context() usage                : 0
ScrollTrigger.matchMedia() usage    : 0
window.matchMedia() usage           : 10 — all reduced-motion / dark-mode checks, not breakpoint branching
window resize listeners             : 14, independently debounced, several also calling
                                       ScrollTrigger.refresh() redundantly alongside GSAP's
                                       own built-in auto-refresh-on-resize
```

---

## Concrete gaps, in priority order

Status markers reflect the live-tree-scoped audit and implementation that followed this review —
see `/Users/przemek/.claude/plans/federated-tinkering-hopcroft.md` for the full plan.

### 1. No shared factory for pinned sections — ❌ DROPPED (YAGNI, not fixed)
Original concern: every pinned/scrubbed section re-implements the same boilerplate from scratch
(readiness polling, `VW`/`VH` computation, master timeline, pin ScrollTrigger, resize handler),
copy-pasted rather than shared, so a fix in one copy doesn't propagate to the others.

**Resolution: dropped, not implemented.** A follow-up audit restricted to the live render tree
(`default.hbs` + `index.hbs` and everything they include) found only **one** genuine `pin:true` +
scrubbed multi-stage section (`operating-model-stacked.hbs`) and one simple, structurally
different `pin:true` (`particle-morph.hbs`'s text-container pin — no scrub, no rebuild need, its
trigger-relative `start`/`end` strings already work correctly via `ScrollTrigger.refresh()`). A
factory built to serve one real consumer, this dissimilar from the other, would be premature
abstraction — either too narrow to reuse or too abstract for a hypothetical third case that
doesn't exist yet. The original count of "10 files" needing this included three now-confirmed
dead-code variants (`operating-model-v2.hbs`, `operating-model.hbs`, `hero-sequence.hbs`) that
were never live in the first place. If a third pinned section appears later, extract a factory
then, from two concrete implementations instead of one imagined one.

### 2. Viewport dimensions baked into tweens/pin distances at build time — ✅ RESOLVED (live tree)
Root cause of both bugs fixed earlier. `const VW = window.innerWidth` (etc.) computed once and
used inside `x: VW` tween targets and `end: '+=${totalScroll}'` pin strings never gets
recomputed by `ScrollTrigger.refresh()` — refresh re-measures *trigger positions*, it doesn't
re-run the JS that derived your constants. Fix pattern (teardown + full rebuild on resize/load/
fonts.ready) documented in `COMMON_ISSUES.md` under "Operating Model Desynced After Window Resize
/ On Page Load," and is the only live occurrence of this pattern. **Still present, unfixed, in
`operating-model-v2.hbs`** (dead code, explicitly out of scope — will resurface the identical bug
if that file is ever re-enabled without applying the same fix).

### 3. No `gsap.context()` — ✅ RESOLVED (where justified)
Its absence is why the resize/rebuild fix in `operating-model-stacked.hbs` had to hand-track
`scrollTriggerInstance`/`timelineInstance` module variables and manually `.kill()` both.

**Resolution: implemented in `operating-model-stacked.hbs` only.** Its teardown/rebuild cycle now
uses `ctx = gsap.context(() => {...}, section)` + `ctx.revert()` instead of manual `.kill()`
bookkeeping — verified with Playwright that all previously-fixed behavior (directional morph,
category-0 `onEnter` fix, resize rebuild, fresh-load overlap) survived unchanged. The ~25 one-shot
`gsap.timeline()` sites elsewhere (hero intro, heading reveals, card entrance, page transitions)
were **not** touched — none of them tear down and rebuild, so `gsap.context()` has nothing to buy
them; wrapping them would be scope creep, not improvement.

### 4. No `ScrollTrigger.matchMedia()` — ❌ DROPPED (weak justification, guideline written instead)
Responsive branching is done via manual `window.innerWidth < 768` checks instead of GSAP's own
breakpoint-aware utility.

**Resolution: dropped, not implemented.** The ~11 live breakpoint checks are all simple
`if (window.innerWidth <= N) return;` bailout guards, not per-breakpoint ScrollTrigger
reconfiguration — `matchMedia()`'s main benefit (automatic cleanup when a breakpoint is crossed
live) doesn't apply to a guard that just skips a feature. A guideline is written below instead,
for if a future section genuinely needs different configs per breakpoint.

### 5. 14 independent resize listeners, no central dispatcher — ✅ RESOLVED (live tree)
Each did its own debounce (or none) and its own recompute; several ran alongside GSAP's own
built-in auto-refresh-on-resize — two refresh paths racing each other was a likely contributor to
the "onEnter → onLeaveBack → onEnter" pin double-fire seen while debugging an earlier bug.

**Resolution: implemented.** Re-counted at 9 real live-tree listeners (the "14" included
now-excluded dead files). New `assets/js/managers/ResizeManager.js` (singleton, thin pub/sub, no
built-in debounce — matches the existing `assets/js/managers/ObserverManager.js` convention,
which was itself loaded on every page but never instantiated until now) loaded early in
`default.hbs`; all 9 migrated to `window.resizeManager.subscribe(id, fn)` with a same-behavior
`window.addEventListener` fallback if the manager fails to load. Caught two latent multi-instance
bugs during migration (`horiz-scroll.js` and a stacked-cards handler both run per-instance inside
a `forEach` — a shared subscribe id would have let a later instance silently overwrite an
earlier one's callback; both given unique per-instance ids instead).
`operating-model-stacked.hbs`'s own resize handler stays separate and bespoke on purpose — it's a
full rebuild, not a reaction, fundamentally unlike the other 9.

### 6. Mixed pinning mechanisms — ⏸️ NOT ACTIONABLE (dead code, untouched by design)
Most sections use real ScrollTrigger `pin: true`. `posts-tabs-grid.js` hand-rolls its own
sticky/spacer logic instead — duplicating, less robustly, what ScrollTrigger's pin already does.
Confirmed dead code (not included in `index.hbs`; the live tab section is `posts-tabs.hbs`) and
explicitly left untouched per the "only rewrite what's used" scope decision. Worth keeping in
mind if it's ever revived: port it to ScrollTrigger pin rather than reusing its current
implementation.

### 7. Console logging always on — ✅ RESOLVED (live tree)
Every section logged verbosely and unconditionally — real, unconditional work on every scroll
frame / page load in production.

**Resolution: implemented**, reusing `assets/js/debug.js` (already existed, hardcoded to
`DEBUG = true`, never actually adopted outside `particle-morph.hbs`) rather than building a new
utility. `window.DEBUG_SCROLL` now gates both `debug()`/`debugWarn()` and a global
`console.log`/`console.warn` override, moved to load right after GSAP registers (it used to sit
near the end of `<body>`, which left ~50 early top-level logs from other scripts ungated
regardless of the flag — moving it earlier was necessary, not optional). Defaults off; set
`window.DEBUG_SCROLL = true` in devtools to restore full logging. `console.error` is never gated,
matching `debugError()`'s existing "always log errors" behavior.

### 8. Concurrent load on one page — ⏸️ OPEN (not addressed)
A 7000-particle WebGPU system running its own `requestAnimationFrame` loop, plus GSAP's own
ticker driving the live tree's 9 `ScrollTrigger.create()` sites, plus 15 IntersectionObservers,
plus the resize dispatcher — all running simultaneously on the home page. Not something any
session so far has directly measured; still worth profiling on a mid-tier device before assuming
it's fine everywhere it looks fine on a dev machine. No action taken.

---

## What's already good, worth keeping

- **Pin + scrub as two conceptually separate concerns** (one ScrollTrigger for `pin`, animation
  progress driven by a `scrub`-linked timeline) is the correct, intended GSAP pattern and avoids
  timing-coupling bugs.
- **Normalized timeline segments** (`dur = 1 / N` per category in `operating-model-stacked.hbs`)
  is a clean way to keep a multi-stage pinned carousel proportional regardless of stage count.
  This is easy to write badly.
- **`prefers-reduced-motion` respected** in multiple places (`card-scroll-reveal.js`,
  `heading-animations.js`, `main.js`, `word-animation.js`) — good accessibility practice, not
  something every scrollytelling site bothers with.
- **IntersectionObserver used for simple one-shot reveals** rather than ScrollTrigger everywhere
  — cheaper and appropriate when you don't need scrub-linked progress, just an enter/exit signal.

---

## `ScrollTrigger.matchMedia()` guideline (for future sections, not a current gap)

If a future section needs genuinely **different ScrollTrigger configs per breakpoint** — not just
a "skip this feature below/above N" guard, but e.g. a pin that should only exist on desktop, or a
scrub distance that's fundamentally different on mobile — use `ScrollTrigger.matchMedia()` rather
than hand-rolling a `resize` listener that tears down and rebuilds. `matchMedia()` handles cleanup
automatically when the browser crosses the breakpoint live; a hand-rolled version needs to
reimplement that (as `operating-model-stacked.hbs` did, because its rebuild need is about stale
*viewport dimensions*, not stale *breakpoint branch*, which is a different problem). Don't reach
for this preemptively — the 11 simple bailout guards in this codebase today don't need it.
