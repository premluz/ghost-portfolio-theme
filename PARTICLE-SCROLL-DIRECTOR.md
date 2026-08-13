# Particle Scroll Director

The single, canonical way scroll position drives the shared particle canvas
(shape, rotation, position, camera zoom/FOV) sitewide. Replaces the ~24
scattered `IntersectionObserver`/GSAP `ScrollTrigger` registrations audited in
`TRIGGER-SYSTEM-ISSUES.md` — that document's proposed direction, implemented.

**Core file**: `assets/js/particle-scroll-director.js`
**Zone registrations**: `partials/particle-morph.hbs` (all `setZone()` calls
live there, near the top of `initParticleMorphModular()`)
**"WHAT happens" dispatch** (unchanged by this system): `window.__particleApply`
in `default.hbs` — the director decides *when* a shape should change; the
scenario map (`window.PARTICLE_SCENARIOS`, same file) still decides *what*
that actually does (show it, or fade/hide it). Every zone's shape channel
routes through `__particleApply`, never `system.morphTo()` directly.

---

## The idea

One `ParticleScrollDirector` instance (`window.particleScrollDirector`), holding
multiple independent **zones**. Each zone binds a keyframe timeline to either
the whole page's scroll progress or one element's own scroll pass, and drives
some subset of channels — `shape`, `rotationX/Y/Z`, `rotationXDelta/YDelta/ZDelta`,
`position`, `cameraZ`, `fov`, `styles`. A channel is only touched if at least
one keyframe in the zone mentions it.

```js
window.particleScrollDirector.setZone('lab', [
  { at: 0.00, position: [0, -6.0, 0], shape: 'terrain', shapeKey: 'work-cards' },
  { at: 0.05, shape: 'lab' },
  { at: 0.50, position: [0,  0.0, 0] },
  { at: 1.00, position: [0, 14.0, 0] },
], { element: labWrapper, morphMs: 800 });
```

Every zone re-derives its state from **current scroll position**, every frame —
not from Enter/Leave events. That's the core advantage over the old
`IntersectionObserver`/`ScrollTrigger` triggers it replaced: position-derived
state is automatically correct after a fast flick, after loading the page
already scrolled, and after a curtain-return that restores scroll instantly —
all cases where an edge-triggered observer simply never fires and leaves the
wrong shape on screen. It's also why reversing direction (scrolling back up
through a section) just works with no special-case code — the zone re-samples
the same timeline, it doesn't need a separate "on leave" handler.

## `setZone(name, keyframes, options)`

- **`name`** — reuse to replace/retune a zone in place; a different name runs
  it alongside others.
- **`keyframes`** — array of `{ at, ...channels }`, sorted by `at` (0-1
  progress within the zone). Keys are optional per keyframe.
- **`options.element`** — CSS selector or `Element`. Progress is 0-1 across
  *that element's own scroll pass* instead of the whole page. Omit for
  whole-page progress.
- **`options.mode`** — `'enter'` (default): 0 when the element's top reaches
  the viewport bottom, 1 when its bottom clears the viewport top. Use for
  sections that start below the fold (Lab, footer, testimonials,
  operating-model-exit). `'scroll-through'`: 0 when the element's own top is
  at 0 (already on screen at load), 1 once scrolled a full element-height
  past it. Use for sections already visible at the top of the page (hero is
  the only current user).
- **`options.shapeKey`** — key passed to `__particleApply` for the `shape`
  channel (falls back to `name`). Can also be set **per-keyframe**
  (`{ at, shape, shapeKey }`) when different points in one zone's range need
  different `PARTICLE_SCENARIOS` keys — hero's own zone does this: its
  entrance keyframe resolves against `'hero'`, its hide keyframe against
  `'hero-exit'`, because only one of those is `'hide'` in the scenario map.
  `operating-model` does the same for the opposite reason: its entrance
  keyframe overrides the zone's own default (`'operating-model-exit'`) back
  to `'operating-model'`, so the entrance and exit resolve against their own
  separate scenario entries instead of both hitting the exit's.
- **`options.morphMs`** — default duration passed to `__particleApply` for
  this zone's shape morphs (default 600). Can also be set **per-keyframe**
  (`{ at, shape, morphMs }`), falling back to the zone default — added when
  Lab needed its slow 800ms entrance reveal and a fast 400ms exit hide in the
  same zone; `_sampleShape()` returns `{shape, shapeKey, morphMs}` together so
  both overrides travel with whichever keyframe is currently sampled.
- **`options.chase`** — `{ channel: maxDeltaPerFrame }`. Rate-limits a
  `*Delta` channel's frame-to-frame change, so a fast scroll/flick can't jump
  the target too far in one frame and visually blur a shape (the original
  motivation: hero's rotation blurring into looking like a solid sphere).
  Stateful — inherently not expressible as a pure function of `t` alone.
- **`options.continuous`** — `{ channel: ratePerPxOfOverscroll }`. Once
  scroll passes a zone's own LAST keyframe `at`, keep extrapolating a
  `*Delta` channel via this rate instead of clamping flat there — element-bound
  zones only. This is what lets hero keep spinning faster for as long as
  scrolling continues, past its own last rotation keyframe.
- **`options.frame`** — `(loop, t) => { positionBase?, cameraZ?, fov? } | null`.
  For values that are DOM/viewport *measurements*, not functions of `t` (hero's
  live canvas offset, viewport-width-derived FOV). `positionBase` is added to
  the zone's own sampled `position` channel. Returning `null` (or omitting a
  key) makes `apply()` skip it entirely that frame — this is the ONLY way to
  drive `cameraZ`/`fov` for a zone that also needs to stop affecting the
  camera once no longer relevant; the plain `cameraZ`/`fov` keyframe channels
  have no such awareness (see Gotchas).
- **`options.ownsPosition`** — `(loop) => boolean`, called as `zone.ownsPosition(loop)`
  so a plain (non-arrow) function body can read `this._rawT`. At most ONE
  active zone with a truthy `ownsPosition(loop)` writes `position` on any
  given frame (first found, Map-insertion-order). Zones that never pass this
  are unaffected — if NO active zone passes it, every active zone with a
  `position` channel writes freely, last-registered wins ties. Two patterns
  in use: hero's own closure (`heroStillRelevant`, state-based — "is my shape
  still current and the layer not hidden") holds exclusive control over
  Lab/footer while relevant; Lab's and operating-model's own
  (`function () { return this._rawT >= 0 && this._rawT <= 1; }`) is
  geometry-based — "is my own progress genuinely inside my own range, not
  just within `_zoneActive()`'s generous activity margin." The geometry-based
  form is the right default for two ordinary adjacent sections; reach for the
  state-based form only when a zone's relevance depends on something
  `_rawT` alone can't express (see Gotchas).
- **`options.reverseExit`** — `{ shape, shapeKey?, morphMs? }`. Fires once
  when the user scrolls back UP out of a zone's own entrance, having
  genuinely been inside before — direction-aware, tracked via an internal
  one-shot flag (`zone._shapeEverEntered`), not expressible as a keyframe
  (see Gotchas for why). `shapeKey`/`morphMs` fall back to the zone-level
  defaults. Only Lab uses it today, hiding into `'terrain'` on the way back
  out, same target as its forward exit.

## Current live zones

| Zone | Element | Mode | Channels | Notes |
|---|---|---|---|---|
| `hero` | `.hero` | `scroll-through` | shape, rotationYDelta (chase+continuous), position (via `frame`), cameraZ/fov (via `frame`) | The most elaborate zone — continuous rotation/zoom buildup, then a fast hide-morph. See its own inline comments in `particle-morph.hbs` for the full design. `ownsPosition`: state-based (`heroStillRelevant`). |
| `lab` | `.gradient-frame` wrapper around `#work-grid-lab` | `enter` | shape, position | Self-contained entrance (`'lab'` at t=0.05), forward exit (`'terrain'`/`lab-exit`/hide at t=0.60, `morphMs:400` overriding the zone's own 800ms), AND `reverseExit` (same target, fires scrolling back up out of the entrance). `ownsPosition`: geometry-based (`_rawT` in `[0,1]`). |
| `footer` | `#footer` | `enter` | shape, position | Shape keyframe deliberately NOT at `at:0` — see Gotchas. No `ownsPosition` (last zone on the page — nothing after it to race against). |
| `testimonials` | `[data-testimonials]` etc. | `enter` | shape | Single late keyframe (`collapse`). |
| `operating-model` | `#operating-model` | `enter` | shape, position | Renamed from `operating-model-exit` — now owns the section's own entrance too, not just its exit. Entrance at t=0.02 (`'sphere'`/`operating-model` key, matching the section's own first category so `operating-model.hbs`'s own groupObserver's first `morphTo()` overrides it invisibly); exit at t=1 (`'collapse'`/`operating-model-exit` key). Position rises on the right (`x:4.0`), same curve shape as Lab. `operating-model.hbs`'s own internal category-morph system (sphere/triple-sphere/torus) is separate, untouched, calls `morphTo()` directly — this zone's entrance keyframe only exists to un-hide the layer for that system to draw into. `ownsPosition`: geometry-based. |

**Deliberately NOT a zone**: `work-cards` (`main.js`'s
`initCardParticleMorphing()`) — its shape depends on "which sibling post-card
is currently most visible among N," not one section's own monotonic scroll
progress. Forcing that onto a keyframe timeline would mean re-deriving "most
visible card" as a synthetic pseudo-`t`, which is more complex and less
correct than the `IntersectionObserver` comparison already there.

---

## Gotchas (found the hard way — read before adding a zone)

**A shape keyframe that isn't at `at: 0` stays silent before its own `at`, on
purpose.** `_sampleShape()` does NOT clamp-to-first-value the way `_sample()`
does for numeric channels. If it did, a zone whose only shape keyframe sits
partway through its range (e.g. `operating-model-exit`'s single
`{at: 1, shape: 'collapse'}`) would claim that shape the MOMENT the zone
merely becomes `_zoneActive` — which, thanks to `_zoneActive()`'s generous
3-viewport-height margin, is far earlier than the keyframe's own `at` — and
override whatever an earlier section is legitimately still showing. This was
a real, reproduced bug: footer's zone (see `git`/session history) originally
had a shape keyframe at `at:0` claiming `'dispersed'`, and it fired while
still deep in operating-model's own territory. Fix: either don't put a shape
on a zone's `at:0` keyframe unless you actually want it claimed from the
moment the zone is merely active, or accept the "silent before first
keyframe" semantics for a later one.

**Shape-checking must keep running even while the layer is hidden, or a
later zone can never "wake" it back up.** `apply()` (rotation/position/camera/
the render-affecting work) is correctly skipped entirely while
`window.__particleLayerHidden` is true — that gate exists because a full
16k-point draw+blend behind an invisible layer is real, measured cost. But a
LATER zone's shape (footer's `'grid'`, arriving after an EARLIER zone like
`operating-model-exit` or `testimonials` has already faded the layer to
hidden) can only become current by calling `__particleApply` with a
non-`'hide'` target — which is also what un-hides the layer. If nothing ever
evaluates that later zone's shape while hidden, it's a chicken-and-egg
deadlock: the layer stays hidden forever, even though the user has scrolled
well past the sections that were supposed to hide it. Fix:
`checkShapesEvenWhileHidden()` — a separate, cheap (one rect read per
element-bound zone with a shape channel, no particle/camera writes) method
called unconditionally from `particle-animation-loop.js`'s `animate()`,
alongside `_checkHeroReentry()` (hero's own bespoke version of the same
problem, solved first and generalized here).

**Morph PROGRESS is the third thing that must run above the hidden gate
(added 2026-08-07).** Same rule as the two above, and it was missed when the
gate was introduced. `_advanceMorph()` both advances `morphProgress` and, on
completion, runs the handler that bakes the destination into the position
buffer and sets `currentState = nextState`. It used to sit *below* the
`if (window.__particleLayerHidden) return;` line, so a morph started while
the layer was hidden froze at a partial blend and never completed — leaving
the state machine wedged permanently, since `currentState` never advanced.

Reproduced on the curtain-return path (open a post, close it back to the
source page), which restores the previous scroll position *while the layer is
hidden* and therefore starts a morph inside exactly that window. At the Lab
section a normal scroll settles on `currentState: 'terrain' / nextState: null`;
before the fix, the same scroll position after a curtain return reported
`currentState: 'dispersed' / nextState: 'terrain'` and stayed there. What
renders in that state is a literal 50/50 blend of two shapes — reported as
"particles look like fat glowing blobs instead of a fine lattice." See
COMMON_ISSUES.md for the full write-up.

The general form of all three: **an early-return that skips *rendering* must
never skip *state progression*.** Timers, morph progress and completion
handlers have to run above the gate, or the system can reach a state it can
never leave. The gate's real job is skipping the 16k-point draw; keep it
scoped to that.

**`cameraZ`/`fov` keyframe channels have no "am I still relevant" awareness —
use `frame()` instead for a zone that needs to stop affecting the camera.**
`_sample()` clamps to a channel's last keyframe value forever once past it.
For a short-lived zone like hero, combined with `_zoneActive()`'s generous
margin, that means a plain `cameraZ` keyframe channel would keep re-asserting
a stale zoomed-in value for a long stretch of scroll AFTER some other trigger
has already reset the camera and handed off to a later section. `frame()`'s
callback can check relevance itself and return `null`, which makes `apply()`
skip that channel entirely that frame — see hero's own `frame()` closure for
the pattern.

**Two non-exclusive zones with a `position` channel simultaneously
`_zoneActive` silently fight — last one registered in the file wins every
frame, not the one genuinely on screen.** `_zoneActive()`'s generous
3-viewport margin means adjacent sections' zones (Lab, operating-model) are
both "active" for a wide stretch around their shared boundary, and with
neither passing `ownsPosition`, `apply()`'s per-zone loop just lets whichever
one iterates last overwrite the other's write earlier in the same frame —
reproduced live: operating-model's position (`x:4`) was bleeding into Lab's
own first ~90% of its range (`x` should've been `0`), because operating-model
is registered after Lab. Fix: give each such zone a geometry-based
`ownsPosition` (`function () { return this._rawT >= 0 && this._rawT <= 1; }`)
— see `setZone()`'s own doc above for why this only wins genuinely-own-range
frames, not merely `_zoneActive` ones.

**Giving an EARLIER zone its own exit can silently swallow a LATER zone's
entire visibility, if the later zone has no entrance of its own to un-hide
the layer again.** Before Lab had its own exit, its shape stayed `'lab'`
(visible) all the way through into operating-model's old single `{at:1}}`
exit keyframe — so operating-model was visible by accident, riding on Lab
never having hidden the layer. The moment Lab got a real `lab-exit`→`'hide'`
keyframe partway through its own range, that accident stopped covering for
operating-model: nothing un-hid the layer again until much later (footer),
so operating-model's own position/shape work — correct, and correctly
written every frame — was invisible on screen the entire time (`apply()`
skips ALL position/rotation/shape writes while
`window.__particleLayerHidden` is true, confirmed live: position values were
updating in memory, opacity stayed 0). Fix: operating-model needed its OWN
entrance shape keyframe (silent until t=0.02, then un-hiding via its own
`operating-model` scenario key) — the general lesson is that "no entrance
keyframe" is only safe for a zone if NOTHING before it can ever hide the
layer; the instant a neighbor gets a real exit, every zone downstream of it
needs its own real entrance too. This is exactly the self-contained-sections
requirement working as intended — it just requires literally auditing every
zone for "do I define my OWN un-hide," not assuming one exists by accident.

**A zone's forward exit doesn't cover scrolling back out the way it came
in — that's a separate, direction-aware case a pure keyframe timeline can't
express.** Lab's shape stays silent below its own entrance keyframe
(`t < 0.05`) by design, so a first-time approach from above doesn't hijack
hero's still-legitimate shape. But that silence is direction-blind: it's
exactly as silent when the user is scrolling back UP having genuinely been
inside Lab already — so without extra handling, backing out just freezes the
last-applied shape (`'lab'`) forever instead of hiding it, since nothing
downstream is left to reclaim it. A `{at: 0.03, shape: 'terrain'}`-style
keyframe can't fix this either: `_sampleShape()` is a pure function of `t`
alone, so the SAME keyframe would also fire on the way IN, causing a
hide-then-immediately-show flicker right before the `t=0.05` entrance claim.
The fix needed actual state — `options.reverseExit` (see above), tracked via
a one-shot `zone._shapeEverEntered` flag inside `_checkZoneShape()` itself,
so forward approach and backward departure — same `t` values, opposite
history — resolve differently.

---

## Migration history (phased work, this session)

Executed per an approved plan; six stages, verified after each via ad hoc
Playwright scripts (scratchpad, deleted after use) sampling
`window.particleSystem.loop` state directly across a fixed checkpoint sweep,
diffed against a captured baseline.

1. **Deleted confirmed-dead code**: `registerScrollTriggersOnGPU()` (the
   entire GPU-backend trigger set — its bootstrap include was already
   commented out in `default.hbs`, and its only call site was ALSO already
   commented out, so it never ran) and `createViewportTrigger` (defined,
   zero call sites). Also caught and removed during this pass:
   `helix-section`, `work-grid`, `profile`, `stats` — all gated on elements
   confirmed to not exist on any live page.
2. **Extended `particle-scroll-director.js`** with the six capabilities
   listed above (`*Delta` channels, `chase`, `continuous`, `frame`,
   `ownsPosition`, per-keyframe `shapeKey`) — verified inert for the
   already-live Lab/footer position zones before anything used them.
3. **Migrated hero** — its ~150-line hand-rolled
   `_updateHeroCollapseState()`/`_applyHeroExitVisuals()` deleted outright,
   replaced by the `hero` zone plus a small kept `_checkHeroReentry()` (the
   "wake from hidden" concern, before it was generalized in step 4).
4. **Migrated `operating-model-exit`, `testimonials`, `footer`'s shape
   channel, `lab`'s shape channel** — one at a time, each verified with a
   full-page regression sweep before moving to the next. This is where both
   Gotchas above were found and fixed live, not anticipated in advance.
5. **Documented** `work-cards` as deliberately not migrated (comments in
   `main.js` and `particle-morph.hbs`, cross-referencing each other).
6. **Final regression pass** + a comment near `default.hbs`'s commented-out
   `gpu-particle-integration` include, noting `registerScrollTriggersOnGPU()`
   was deleted as dead code and should not be resurrected if that include
   ever comes back — the director's zones already work against either
   particle backend via `__particleApply`/`system.morphTo`.

**Follow-up 1, same session**: hero's own hide shape was reverted from
`'collapse'` (a sphere — this session's own interim choice) back to
`'terrain'`, matching the ORIGINAL production behavior in
`backup/partials/particle-morph.hbs`.

**Follow-up 2 — self-contained section choreography**: re-read with a new
requirement — every zone should define its own complete entrance AND exit
using only its own values, never a neighboring section's specific choice, so
sections can be reordered without anything breaking. Concretely:
- Added per-keyframe `morphMs` to `particle-scroll-director.js` (mirrors the
  existing per-keyframe `shapeKey` pattern), so one zone can have a slow
  entrance morph and a fast exit hide.
- Removed Lab's `at:0` keyframe that hard-copied hero's own hide shape
  (`'terrain'`/`work-cards`) purely to avoid a shape race — replaced with a
  single silent-until-`t=0.05` `'lab'` entrance keyframe, the same pattern
  already used elsewhere, no longer needing to know what hero did.
- Gave Lab its own exit: `{at: 0.60, shape: 'terrain', shapeKey: 'lab-exit',
  morphMs: 400}`, plus a new `'lab-exit': 'hide'` entry in both
  `PARTICLE_SCENARIOS` maps.
- Renamed `operating-model-exit`'s zone to `operating-model` and gave it a
  position channel (rises on the right, `x:4.0`, same curve shape as Lab) —
  then, once live verification caught Lab's new exit silently swallowing
  operating-model's entire visibility (see the Gotchas entry above), also
  gave it its own entrance shape keyframe to un-hide the layer for itself.
- Gave both Lab and operating-model a geometry-based `ownsPosition` predicate
  once live verification caught operating-model's position bleeding into
  Lab's own range (see the other new Gotchas entry above) — the "known
  limitation, flagged not fixed" contingency from the approved plan, which
  did in fact manifest and get fixed in the same pass.

Verified via scratchpad Playwright scripts under both `particle_scenario`
values: Lab's own entrance/exit and operating-model's own entrance/rise/exit
all fire correctly and independently under both, with no bleed between the
two zones' positions.

**Follow-up 3, same session**: `'operating-model'` (the entrance key) was
removed from the `hero-footer` scenario map — that map originally hid
everything but hero/footer by design, but per explicit request
operating-model's entrance is now visible under the LIVE default scenario
too (its own exit, `'operating-model-exit'`, still hides it same as before).
Verified live: un-hides at the zone's own t≈0.03, cycles through its own
sphere/triple-sphere/torus category shapes untouched, position correctly
rises `x:0→4` with no bleed into/out of Lab's own range, hides again after
its own t=1 exit.

**Follow-up 4, same session**: briefly tried hero exiting into `'dots'`
without hiding (both live, for comparison against the original
`'terrain'`+hide combo) — reverted back to `'terrain'`+hide (the dots line
kept commented for later). This surfaced a real bug along the way: with
`'dots'` live, `heroStillRelevant()`'s hardcoded `cur.id !== 'terrain'`
check released hero's `ownsPosition`/`frame` control the instant it reached
`'dots'`, even though the layer was still genuinely visible (nothing hidden
it) — fixed by deriving the comparison from the zone's own actual exit shape
(`heroExitShape`, captured where the shape line is set) instead of a
hardcoded string, so any future shape swap there stays correct automatically.
Also added Lab's `reverseExit` (see above) in the same pass, after noticing
scrolling back out of Lab left the shape stuck instead of hiding.
