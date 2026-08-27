# Lessons — particle scroll choreography

Written after a long session retuning the hero → Lab → footer particle
sequence (2026-08-21). `PARTICLE-SCROLL-DIRECTOR.md` documents how the system
*works*; this documents how it *misleads you*, and the debugging discipline
that eventually worked.

Most of what follows is not really about particles. It is about a class of bug
where a knob is genuinely connected to the thing you are looking at, and
changing it still does nothing — and what to do when that happens.

---

## The single most useful signal: "no change at all"

Three separate times, a fix produced **no visible difference whatsoever**, and
three times that was treated as "not enough" and the value was pushed further.
It was not "not enough". It was diagnostic.

> A knob that is genuinely connected produces some *wrong* effect, not *no*
> effect. Total inertness almost always means the value is unreachable, the
> code path is refused upstream, or something else owns the behaviour.

Confirmed instances from this session:

| Symptom | Actual cause |
|---|---|
| `EXIT_SPAN` 0.65 → 1.65 changed nothing | `t` is clamped to `[0,1]`; anything above 1.0 is unreachable, so the animation froze partway through its own curve |
| `rootMargin` fade-in offset raised to 1000 changed nothing | `rootMargin` only ever *grows* the box for positive values, so it made the section intersect for **longer**, never shorter |
| `shapeKey: 'hero'` on the footer's reverseExit changed nothing | `__particleApply` refuses **any** `key === 'hero'` once `scrollY > heroHeight` — the call was dropped before it could morph |

**Rule:** on the *second* inert fix, stop tuning and instrument. Not the fifth.

---

## Probe, don't infer

The winning move every time was a twenty-line temporary probe. The losing move
every time was reading the code, finding a mechanism that plausibly explained
the symptom, and changing it.

The plausible-mechanism trap is strong here because the system has many real
knobs that all genuinely affect motion. `EXIT_SPAN`, `CENTER_BY`,
`progressScale`, `chase`, `continuous`, `rootMargin` — every one of them is a
believable culprit for "the movement feels wrong". Believability is not
evidence.

### Probes that paid for themselves

Each of these ended an investigation immediately after several failed guesses:

**Ownership / jump attribution** — logs any single-frame position change above
a threshold, naming the zone that wrote the previous position and the one
writing now:

```js
[JUMP] 3.79 units | hero(prePlace) -> lab(prePlace)
       | from [-3.33,-1.82] to [0.00,-3.62] | scrollY=3294
```

One line gave the two zones, both positions, the distance, and the scroll
offset. It replaced three wrong guesses.

**Owner + frontmost + live zone state** — the one that cracked the last bug:

```js
[JIT-OWN] owner=lab frontmost=footer labRawT=0.822 labShapeAt=1.17 scrollY=4396
```

`owner=lab` proved Lab still claimed position after its `frame()` had been
commented out. `labShapeAt=1.17` simultaneously proved its only shape keyframe
was beyond reach. Two findings, one line.

**Rate/target/actual for a chased channel** — for "it pauses then continues":

```js
[rot] scrollY=716 t=1.0000 target=0.3636 actual=0.3581 lag=0.0056 dRot=0.0206
```

Watching `t` saturate at 1.000 while `scrollY` kept climbing showed instantly
that the zone had run out of range.

### Probe design notes

- **Log on change, not every frame.** Cache a signature string per zone and
  only print when it differs, or the console is unusable.
- **Print the derived value AND its inputs.** `t=1.000 rawT=3.150` was the
  whole answer to one bug — the clamp was invisible from `t` alone.
- **Name the actor.** `this.zones.forEach((z,n) => { if (z === zone) name = n; })`
  turns an anonymous callback into "which zone did this".
- **Use a dedicated flag** (`window.DEBUG_JIT`), not the theme's shared
  `DEBUG_SCROLL` — otherwise the signal drowns in every other system's output.
- **Remember `console.log` is silenced sitewide** unless `window.DEBUG_SCROLL`
  is set (see the console gate in `default.hbs`). A probe that prints nothing
  may be working perfectly.

---

## Couplings that are invisible at the edit site

Nearly every regression was two things that must change together, where
nothing at either location says so.

### `frame()` and `ownsPosition` are one unit

Commenting out a zone's `frame()` to stop it repositioning left `ownsPosition`
active. The zone kept winning **exclusive** position ownership, and with no
`frame()` its `positionBase` fell back to `[0,0,0]` — so it yanked the object
to the origin. Disabling the reposition *caused* a reposition.

> If a zone claims position, it must be able to place it. Disable both or
> neither.

### Fractions silently depend on `progressScale`

`CENTER_BY` is a fraction of the hero zone. Raising `progressScale` from 3.2 to
8.2 stretched the drift from finishing at ~2700px to ~6600px — but the handover
still happened at ~3294px, so the drift was barely a third done. The constant
was never edited; its meaning changed underneath it.

> Any constant expressed as a fraction of a scaled zone must be re-derived when
> the scale changes. The relationship here is
> `CENTER_BY < handoverScrollY / (progressScale × heroHeight)`.

### Fixed margins vs. scaled zones

`_zoneActive()` used a fixed 3-viewport margin. With `progressScale: 8.2` the
hero choreographs ~7782px but went inactive at ~3796px — less than halfway
through its own rotation ramp. Rotation is written by *every active zone*, so
it climbed smoothly and then simply stopped being written, and the render
loop's ambient spin took over from a different value. Fixed by scaling the
margin with the zone:

```js
const margin = Math.max(vh * 3, r.height * zone.progressScale);
```

### Unit mismatches between scaled and unscaled progress

`_sampleContinuous()` compared **unscaled** `_rawT` against **scaled** keyframe
`at` values. With `progressScale: 8.2` these are 8.2× apart, so overscroll was
inflated enormously — rotation ran away to 5.55 rad against a 0.36 target.

The important part is what I did about it *first*: I disabled the feature.
`continuous` was not broken; its caller had a unit bug. Turning something off
because it misbehaves, without establishing why, buries the real defect and
loses working functionality.

> Diagnose before disabling. "It misbehaves" is not "it is wrong".

---

## Two channels, two completely different ownership rules

This is the structural thing most worth remembering.

- **`position`** — one exclusive owner per frame. First zone whose
  `ownsPosition()` returns true wins (Map insertion order), and everything else
  is skipped.
- **`rotation`** — written by **every** active zone, gated only by
  `_zoneActive()`. No frontmost check, no exclusive owner.
- **`shape`** — only the **frontmost** zone is consulted.

So "the object jumped" and "the rotation jumped" have entirely different
candidate causes, and a fix for one tells you nothing about the other. Several
wasted rounds came from reasoning about rotation using position's rules.

Related: because `shape` only runs for the frontmost zone, a `reverseExit` can
be structurally unable to fire. Operating-model's own upward-exit crossing puts
its element-centre near the viewport bottom while the section above fills the
viewport — so it never wins frontmost at exactly the moment it would need to.

---

## Zone-cache staleness

`_checkZoneShape()` skips applying when `sampled.shape === zone.shape`. A zone
that showed a shape, went silent while another zone overwrote the live shape,
then became current again would compare against its own stale cache, find
"no change", and silently do nothing.

Fixed by invalidating other zones' caches whenever a shape is genuinely
overwritten:

```js
this.zones.forEach((other) => {
  if (other !== zone && other.shape === sampled.shape) other.shape = null;
});
```

> Per-actor caches of shared mutable state need invalidation at the write site,
> not at the read site.

---

## Values that look like "off" but aren't

`ZOOM_FACTOR = 0` reads as "no zoom". It is the camera's **target distance as a
fraction of base**, so `0` means travel all the way to z=0 — straight into the
particles. "Off" is `1`.

It only ever looked bounded because another zone's `frame()` reset the camera;
when that `frame()` was commented out for unrelated reasons, the zoom became
unbounded and manifested as "zooms in and the rotation stops". One cause, two
symptoms, in a constant that had been sitting there looking harmless.

> For any "disabled" sentinel value, check what the arithmetic actually does
> with it. Identity is rarely zero.

---

## Reading the report carefully

- "Still not good" was treated as one problem. Asking split it into two
  independent ones.
- "Zooms in **and** stops rotating" was two symptoms of one cause; I chased
  them as two.
- "I increased it to -1000" — the word *increased* against a negative number
  revealed that my sign convention was inverted relative to how it was being
  read. That turned out to be a genuine bug (`vh - OFFSET` should have been
  `vh + OFFSET`), found from the phrasing alone.

Ambiguous phrasing is cheap to resolve and expensive to guess at.

---

## Checklist for the next change here

1. Which channel is affected — `position`, `rotation`, or `shape`? They have
   different ownership rules. Do not reason across them.
2. Is the value **reachable**? `t` is clamped to `[0,1]`; `progressScale`
   changes what a fraction means; `rootMargin` cannot shrink via positive
   values.
3. Is the call **refused upstream**? `__particleApply` drops `key === 'hero'`
   past the hero's height, and the scenario map may resolve the key to
   `'hide'`.
4. Does anything else **depend on this constant** — a fraction of the same
   zone, a margin, a paired `frame()`/`ownsPosition`?
5. If the first fix produces *no* change, **instrument instead of escalating**.
6. Simulate the keyframe/ownership logic in Node before deploying. Several real
   bugs (a `reverseExit` that could never fire, a double-jump on the return
   trip) were caught this way in seconds.

---

## Current commented-out state

The zone definitions in `partials/particle-morph.hbs` carry several disabled
blocks with "restore together" notes — Lab's `frame()`, `ownsPosition`, and
position keyframes; hero's and Lab's exit-shape keyframes; testimonials' and
operating-model's `collapse` morphs.

This is honest bookkeeping but fragile: the couplings live in prose. When the
choreography settles, either delete the dead paths or encode the invariants in
code so they cannot be half-restored.
