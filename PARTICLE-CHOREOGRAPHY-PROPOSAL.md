# Particle Choreography — Proposal for a Single Declarative Timeline

> **Status: proposal, not implemented.** Nothing in this document is built.
> It argues for replacing the multi-zone coordination layer in
> `particle-scroll-director.js` with one page-scroll timeline, and sets out
> what that would take.
>
> Companion documents:
> `PARTICLE-SCROLL-DIRECTOR.md` — how the current system works
> `LESSONS.md` — the debugging session that motivated this
> `ORCHESTRATOR-ANIMATION.md` — the wider animation-orchestration roadmap

---

## 1. The goal, restated

The director was built to make choreography easy: a declarative timeline
saying *what the particles do at which point of scroll*, in plain attributes —
shape, position, rotation, zoom — instead of ~24 scattered
`IntersectionObserver`/`ScrollTrigger` registrations.

That goal was correct, and the declarative layer genuinely delivers on it. A
zone today is already close to the intended shape:

```js
window.particleScrollDirector.setZone('lab', [
  { at: 0.00, position: [0, -6.0, 0] },
  { at: 0.05, shape: 'lab' },
  { at: 0.50, position: [0, 0.0, 0] },
], { element: labWrapper, morphMs: 800 });
```

Read on its own, that is exactly the "JSON tells the particles what to do"
model. The problem is not the notation. **The problem is that the notation is
not authoritative** — three separate mechanisms outside it decide whether any
given line actually takes effect.

---

## 2. The current issue

### 2.1 Ownership is implicit, per-channel, and invisible

Three channels, three different arbitration rules:

| Channel | Who writes it |
|---|---|
| `position` | **One** exclusive owner per frame — first zone whose `ownsPosition()` returns true, in Map insertion order |
| `rotation` | **Every** active zone, gated only by `_zoneActive()` — no frontmost check, no exclusive owner |
| `shape` | Only the **frontmost** zone (element centre nearest viewport centre) |

A keyframe can therefore be correct, sampled, and silently discarded. Nothing
at the authoring site indicates which rule applies. Reasoning about one channel
using another's rules produced several wrong diagnoses in the session behind
`LESSONS.md`.

### 2.2 The real behaviour lives in imperative escape hatches

Because keyframes cannot express everything, each zone grew callbacks:
`ownsPosition`, `frame()`, `chase`, `continuous`, `progressScale`, plus
`heroStillRelevant()` shared between two of them.

**Every bug in that session was in these, not in the timelines.**
`heroStillRelevant()` has accumulated four special cases — `becomingHero`,
`becomingOther`, `handedOff`, a Lab-progress release — each added for a
specific regression. Its behaviour now has to be simulated in Node to be
predicted with confidence, which was done twice.

### 2.3 Zones are local; the choreography is global

Each zone measures its own element. But the object's journey spans several
sections, so local ranges have to be stretched to cover it:

- `progressScale: 8.2` — hero's `100dvh` element must cover ~7800px
- `labHoldFrac = 1800 / wrapperHeight` — Lab held open past its own range
- `CENTER_BY = 0.35` — a fraction of hero's *scaled* range

These do not compose. Concrete failures, all confirmed:

- `CENTER_BY` was calibrated for `progressScale: 3.2`; raising the scale to 8.2
  moved the drift's completion from ~2700px to ~6600px while the handover
  stayed at ~3294px. The constant was never edited — its meaning changed
  underneath it.
- `_zoneActive()` used a fixed 3-viewport margin that knew nothing about
  `progressScale`, so hero went inactive at ~3796px with its rotation ramp only
  49% complete — rotation simply stopped being written mid-ramp.
- `_sampleContinuous()` compared unscaled `_rawT` against scaled keyframe `at`
  values, inflating overscroll by 8.2× and making rotation run away to 5.55 rad
  against a 0.36 target.

### 2.4 Element-relative percentages are viewport-fragile

`mode: 'scroll-through'` gives `t = -top / height`. For a `100dvh` hero, `t`
saturates at 1.0 after exactly one viewport — while the object remains visible
for roughly three. Every keyframe in `0..1` was therefore crammed into the first
third of the visible scroll, with a dead zone after it. This is precisely the
device-height fragility that motivates preferring percentages, and the current
percentages are the *wrong* percentages: local to an element rather than to the
journey.

### 2.5 No feedback loop

Edit → `ghost restart` → scroll manually → judge by eye. A ~30-second cycle
with a subjective verdict. This is why guessing was expensive and why the
twenty-line probes that eventually resolved each bug paid for themselves
immediately.

---

## 3. Reasons for change

1. **Authoring should be reliable.** A keyframe that reads correctly should
   take effect, or fail loudly. Today it can be silently discarded by
   arbitration the author cannot see.
2. **One source of truth for "where are we in the story".** Section-local
   progress is the wrong unit for a journey that crosses sections.
3. **Delete the escape hatches, or give them one defined home.** They are where
   every bug lives, and they multiply because each new requirement adds another.
4. **Make the couplings structural rather than prose.** `frame()`+`ownsPosition`
   as a unit, fractions depending on `progressScale` — these are currently
   enforced only by comments.
5. **Device-independence by construction**, rather than per-zone correction
   factors that each need re-deriving when a scale changes.

---

## 4. The proposal

### 4.1 One timeline, page-scroll fractions

A single ordered list of keyframes over **total document scroll progress**,
not per-element passes. One writer, so no arbitration:

```jsonc
{
  "version": 1,
  "keyframes": [
    { "at": 0.00, "shape": "ribbon-dispersed-pulse",
      "position": [0, 0, 0], "zoom": 1.0 },

    { "at": 0.12, "rotation": { "y": "+0.6" }, "ease": "linear" },

    { "at": "#work-grid-lab@enter",
      "position": [0, -6, 0], "ease": "smoothstep" },

    { "at": "#work-grid-lab@exit", "shape": "terrain", "fade": 0.15 },

    { "at": "#footer@enter", "shape": "grid", "morphMs": 1100 }
  ]
}
```

**Section anchors resolve to fractions at load.** `"#work-grid-lab@enter"`
is measured once after layout settles and becomes e.g. `0.32`. Authoring stays
semantic; runtime stays a single monotonic scale. Re-resolve on resize.

### 4.2 Absent means hold

If a keyframe omits an attribute, that attribute **holds its last value**. It
does not mean "someone else may write it". With one writer this is
unambiguous — and it removes the entire class of "which zone won" bug.

### 4.3 Attribute set

| Attribute | Meaning |
|---|---|
| `shape` | Morph target; still dispatched via `__particleApply` so `PARTICLE_SCENARIOS` continues to decide show/hide |
| `position` | `[x, y, z]` world units |
| `rotation` | `{ x, y, z }`; `"+0.6"` means *additive delta*, `0.6` means absolute |
| `zoom` | Camera distance as a **multiplier of base** — `1.0` is neutral (see `ZOOM_FACTOR = 0` in `LESSONS.md` for why this matters) |
| `fade` | Global particle alpha `0..1` (the existing `uGlobalAlpha`) |
| `styles` | Per-style amounts, unchanged |
| `ease` | `linear` / `smoothstep` / `easeIn` / `easeOut` between this keyframe and the next |
| `morphMs` | Shape-morph duration for this keyframe |

Extensible: adding an attribute means adding a sampler and a writer, not a new
coordination rule.

### 4.4 Two escape hatches, explicitly bounded

Some behaviour genuinely is not a pure function of scroll position, and
pretending otherwise is what caused the sprawl. Give them exactly one home
each:

- **`derived`** — values measured from the DOM/viewport rather than authored
  (hero's live canvas offset from CSS custom properties; FOV from viewport
  width). Declared per-keyframe as `"position": ["@heroOffsetX", -6, 0]`,
  resolved by a small named registry. Not arbitrary callbacks.
- **`smoothing`** — stateful rate limiting (today's `chase`). One global
  config per attribute, not per zone, since there is now one timeline.

Everything else that is currently a callback — `ownsPosition`, `frame()`,
`heroStillRelevant()`, `progressScale`, `labHoldFrac`, `continuous` — is
**deleted**, not ported.

### 4.5 What survives

The rewrite is narrower than it sounds. Keep:

- keyframe sampling and interpolation (`_sample`, easing)
- `__particleApply` dispatch and `PARTICLE_SCENARIOS` — unchanged, still the
  show/hide authority
- `setGlobalAlpha` / `uGlobalAlpha`
- the render loop entirely

Replace: multi-zone registration, `_zoneActive`, `_frontmostZone`,
`_isZoneFrontmost`, `exclusiveOwner`, `ownsPosition`, per-zone `frame()`,
`progressScale`, `_sampleContinuous`.

---

## 5. Migration path

Deliberately incremental — the current system stays live throughout.

1. **Instrument first.** Add a permanent, flag-gated dev overlay (§7) showing
   scroll fraction, active attributes and current values. Without a feedback
   loop this migration will repeat the session in `LESSONS.md`.
2. **Record the present behaviour.** With the overlay, capture the object's
   actual `position`/`rotation`/`zoom`/`shape` at ~20 scroll fractions down the
   homepage. This is the acceptance target — the migration should be visually
   indistinguishable, not a redesign.
3. **Build the timeline runtime beside the director**, driven by the same
   `requestAnimationFrame`, writing nothing. Compare its computed values
   against the recording.
4. **Author the homepage timeline** to reproduce step 2's numbers.
5. **Switch the writer** behind a flag (`?choreo=v2`). Both systems computable,
   one authoritative.
6. **Delete the zone layer** once v2 matches, including the commented-out
   blocks currently in `particle-morph.hbs`.

Steps 1–3 are non-destructive and independently useful even if the rest is
never done.

---

## 6. Risks and open questions

- **The current state is mid-surgery.** Several zone features are commented out
  to hold the hero shape through Lab (see the end of `LESSONS.md`). Step 2 must
  record intended behaviour, not today's half-disabled behaviour — decide
  first which of those disables are permanent.
- **Page-scroll fractions shift when content changes.** Adding a section moves
  every downstream fraction. Section anchors (§4.1) mitigate this, and are the
  reason to prefer them over raw numbers for anything section-tied.
- **One timeline per page template**, not per site. Post pages, About, and the
  homepage need separate timelines; the loader must pick by template.
- **Non-scroll triggers still exist** — curtain-return resync, gesture control,
  card hover morphs. These call `morphTo` directly today. The timeline must
  define what happens when an external caller changes the shape mid-scroll:
  suggest the timeline reasserts at the next keyframe crossing rather than
  fighting per-frame.
- **`chase` smoothing interacts with a single writer differently.** Worth
  checking whether it is still needed once nothing competes.

---

## 7. Orchestrator improvements

These are worth doing **regardless** of whether §4 is built. They address the
feedback-loop problem, which was the largest single cost in the session behind
`LESSONS.md`. See `ORCHESTRATOR-ANIMATION.md` for the wider
section-orchestration roadmap this sits inside.

### 7.1 A dev overlay (highest value, lowest cost)

Flag-gated (`?choreo-debug=1`), fixed-position, showing live:

```
scroll     4396px / 8912px   (0.493)
anchors    lab@enter 0.32 · lab@exit 0.48 · footer@enter 0.71
shape      ribbon-dispersed-pulse    (next: grid @ 0.71)
position   [0.00, -6.00, 0.00]
rotation   y 0.5215  (target 0.5215, lag 0.0000)
zoom       1.00
fade       1.00
writer     timeline
```

Every bug in that session would have been visible here in one scroll. The
ad-hoc probes that solved them (`[JIT-OWN]`, `[JUMP]`, `[rot]`) were
rediscovered three separate times — this makes them permanent.

### 7.2 Assert instead of silently discarding

Where a value cannot take effect, say so once rather than doing nothing:

- keyframe `at` outside the reachable range
- a `shapeKey` that `__particleApply` will refuse (e.g. `'hero'` past the
  hero's height)
- a `shapeKey` resolving to `'hide'` where a visible shape was clearly intended

"No change at all" was the single most misleading symptom in that session, three
separate times. A console warning would have collapsed each investigation to
seconds.

### 7.3 Timeline validation at load

Cheap checks: keyframes sorted and within `0..1`; section anchors resolve to
real elements; no duplicate `at` for the same attribute; `zoom` not `0` unless
deliberate.

### 7.4 A scrub control

Dev-only slider that sets scroll fraction directly, so choreography can be
inspected frame by frame without physically scrolling. Turns a ~30-second
subjective loop into an immediate one.

### 7.5 Visual regression capture

Given the theme's existing screenshot-diff tooling, capture the canvas at the
~20 fractions from step 2 and diff on change. Choreography is currently
verified entirely by eye, which is why regressions surfaced turns later — the
footer's reverse exit and the Lab jump were both noticed well after the change
that caused them.

---

## 8. Recommendation

Do **§7.1 and §7.2 now**, independently of everything else. They are small,
non-destructive, and directly address why the last session was expensive.

Treat §4 as a real project with a recorded acceptance target, not an
incremental refactor — and only start it once the current choreography has
settled visually, since migrating a design that is still moving means recording
the wrong target.
