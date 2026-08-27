# Particle Color Tuning

How to control particle core color, glow/halo color, and the Lab wave tint —
per theme (dark/light). All values below take effect after `cd ghost2 &&
ghost restart` + a hard reload (no build step, but Ghost caches theme files).

## The three color layers

Every particle pixel is one of these, composited in order:

1. **Base color** (`vColor`, from `--color-particles`) — the particle's own
   flat color before any glow/HDR effect.
2. **HDR core** (`coreColor = vColor * uCoreMult`) — an overbright center
   (values > 1.0) that the renderer's tonemapping rolls into a soft glow.
   This is what makes particles look "lit" rather than flat dots.
3. **Halo** (`vColor * uHaloMult`, spread by `uGlowRadius`/`uGlowStrength`) —
   the soft radial bloom around each particle, additive-blended so
   overlapping halos accumulate into dust/haze.

On top of all three, **Lab's wave tint** (`uWaveColor`) can override the
base color for particles the scroll-driven wavefront has passed — normally
only visible in the Lab section.

## Where each value lives

| Value | File | What it controls |
|---|---|---|
| `--color-particles` (dark) | `default.hbs`, `:root` block | Base particle color, dark/dim theme |
| `--color-particles` (light) | `default.hbs`, `:root[data-theme='light']` block | Base particle color, light theme |
| `--color-particles-wave` (dark) | `default.hbs`, `:root` block | Lab wave tint color, dark/dim theme |
| `--color-particles-wave` (light) | `default.hbs`, `:root[data-theme='light']` block | Lab wave tint color, light theme |
| `uCoreMult` default | `particle-animation-loop.js`, material `uniforms` | HDR core overbright multiplier — global default, both themes |
| `uHaloMult` default | `particle-animation-loop.js`, material `uniforms` | Halo overbright multiplier — global default, both themes |
| `CORE_MULT_LIGHT_MULT` | `particle-morph.hbs`, near `GLOW_STRENGTH_LIGHT_MULT` | Light-mode-only trim on `uCoreMult` (1.0 = no trim) |
| `HALO_MULT_LIGHT_MULT` | `particle-morph.hbs`, near `GLOW_STRENGTH_LIGHT_MULT` | Light-mode-only trim on `uHaloMult` (1.0 = no trim) |
| `GLOW_STRENGTH_LIGHT_MULT` | `particle-morph.hbs` | Light-mode-only trim on halo strength/opacity |
| `GLOW_RADIUS_LIGHT_MULT` | `particle-morph.hbs` | Light-mode-only trim on halo footprint/spread |

All the `applyTheme()` per-theme multipliers live together in
`particle-morph.hbs`, applied every time the theme changes (toggle, or the
profile section's scroll-driven palette shift).

## How to change the base particle color

Edit `--color-particles` in `default.hbs` — one hex per theme (dark/dim
share the `:root` value; light has its own `:root[data-theme='light']`
value). Also update the mirrored literals in `scroll-scrub-anim.js`'s
`PARTICLE_NORMAL` object (search for `PARTICLE_NORMAL`) — these are a
**deliberate duplicate**, not read from CSS, used for the profile section's
scroll-driven color shift. The two must stay in sync manually.

## How to change the Lab wave tint color

Edit `--color-particles-wave` in `default.hbs`, same per-theme split as
above. Both themes default to the same Orchid (`#da70d6`) — the original
hardcoded value before this token existed. Give light mode a different,
softer hex here if the current pink reads too intense against a white page.

This tint is normally invisible outside Lab — it's driven by `uWavefront`,
which Lab's own scroll-progress wave loop parks safely off-shape
(`initLabWave`/`_startAutonomousWave` in `particle-morph-system.js`) whenever
Lab isn't the active/blending shape. If you ever see this tint OUTSIDE Lab,
that parking is broken — check `uWavefront`'s value first, not the color.

## How to fix "particles look white/washed out" in light mode

This is the HDR core (`uCoreMult`) or halo (`uHaloMult`) reading as flat
white against light mode's near-white background — the same overbright
value that makes dark mode's particles look like they're glowing rolls into
"white" once there's no dark backdrop for the bloom to stand out against.

Fix: lower `CORE_MULT_LIGHT_MULT` and/or `HALO_MULT_LIGHT_MULT` in
`particle-morph.hbs` below `1.0`. Both currently default to `1.0` (no
change from the original single-theme behavior) — this is an unused knob
until you tune it. Start with `HALO_MULT_LIGHT_MULT` (the halo is the bigger
visual area); only touch `CORE_MULT_LIGHT_MULT` if the tiny hot centers
themselves still look wrong after that.

**Do this incrementally and re-check visually after each change** — dark
mode's own halo strength/radius (`GLOW_STRENGTH_LIGHT_MULT` /
`GLOW_RADIUS_LIGHT_MULT`) were tuned against measured pixel-coverage data
(see the comment block above `GLOW_STRENGTH_LIGHT_MULT` in
`particle-morph.hbs` for the actual deltaL/coverage numbers) — a guessed
multiplier can just as easily make light mode too faint as too white.

## Common mistake: editing the shader literal directly

`particle-style-definitions.js`'s `STYLE_BOKEH` fragment body now reads
`uCoreMult`/`uHaloMult` uniforms, NOT hardcoded `1.8`/`1.5` numbers. Don't
hand-edit those literals back in — they're wired to the per-theme system
above. If you need a change that applies identically to both themes, edit
the **default** values in `particle-animation-loop.js`'s uniforms block
instead (search `uCoreMult: { value:`).

## Live console tuning (no restart needed, for quick previews only)

```js
// Base color, current theme
document.documentElement.style.setProperty('--color-particles', '#123456');
window.particleSystem.updateColors();

// HDR core / halo, direct uniform poke (temporary — reverts on reload)
window.particleSystem.loop.particles.material.uniforms.uCoreMult.value = 1.3;
window.particleSystem.loop.particles.material.uniforms.uHaloMult.value = 1.2;

// Wave tint
window.particleSystem.loop.particles.material.uniforms.uWaveColor.value.set('#ff8800');
```

Console changes are temporary — always land the real change in the files
above once you've found a value you like.
