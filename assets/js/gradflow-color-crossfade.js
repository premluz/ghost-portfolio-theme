/**
 * GRADFLOW COLOR CROSSFADE
 *
 * Small reusable helpers, split out of gradflow-page-bg-trigger.js to stay
 * under this repo's 200-line-per-file guardrail (one responsibility each):
 * pull a representative RGB color out of a CSS gradient string, expand it
 * into the 3 tones gradflow's shaders take, and tween a mounted gradflow
 * instance's setColors() toward a new target over time — that call jumps
 * instantly on its own (see gradflow-background.js's own doc), so a caller
 * wanting a "nice transition" between colors needs to drive it every frame
 * itself. Same manual-RGB-lerp spirit as this codebase's other one
 * (scroll-scrub-anim.js's invertParticles).
 *
 * Exposed as window.GradflowColorCrossfade — no build step in this theme,
 * so a plain namespaced global is the established pattern here (see
 * window.GRADFLOW_SHADERS, window.BackgroundLayer, etc.).
 */
(function () {
  'use strict';

  // data-gradient-css (post-card.hbs) carries a full CSS gradient string —
  // e.g. "#FDA9A9,#FDA9A9,#FDA9A9," or "rgb(163,240,223), rgb(186,253,239)"
  // (a literal stop list, hex OR rgb()/rgba(), can even mix both) or
  // "radial-gradient(85% 40% at 50% 50%, #ff000033 0%, transparent 70%)"
  // (post-and-cards.js / posts-tabs-grid.js, one stop). Pulls out EVERY
  // color of EITHER format in source order (one global scan, not a
  // hex-first-then-rgb-fallback split) — color1/color2 below use the first
  // two literally when both exist, regardless of which format authored
  // them or whether they're the same format as each other.
  function extractRgbs(gradientCss) {
    var results = [];
    var colorRe = /#[0-9a-f]{6}([0-9a-f]{2})?|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi;
    var m;
    while ((m = colorRe.exec(gradientCss))) {
      if (m[0][0] === '#') {
        var hex = m[0];
        results.push({
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
        });
      } else {
        results.push({ r: +m[2], g: +m[3], b: +m[4] });
      }
    }
    return results;
  }

  // Robust CSS-color-to-RGB reader (canvas 1x1 fill trick — same pattern
  // particle-morph.hbs's own readCSSColor uses) — needed because this
  // theme's tokens aren't always plain hex; --color-background can resolve
  // to oklch()/color() depending on the active theme, which a regex can't
  // parse but a canvas fillStyle always can.
  function readCssColorRgb(varName) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return null;
    var cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1;
    var ctx = cvs.getContext('2d');
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }

  // gradflow's shaders take 3 OPAQUE color stops. color1/color2/color3 all
  // use the gradientCss data's own hex stops literally, in order, whenever
  // they exist (e.g. "#FDA9A9,#FDA9A9,#FDA9A9," → color1=color2=color3=
  // that pink — a card author providing identical stops gets a flat wash,
  // not a synthesized variation; that's their data, not this function's
  // call to second-guess).
  //
  // Only synthesizes when the data falls short:
  //   - color2 missing → 35% toward black from color1 (a darker tone).
  //   - color3 missing → the page's live --color-background, not a
  //     synthesized tint. This is the common case in practice: most
  //     gradientCss strings only ever carry one or two real stops (a
  //     single-hex-stop radial-gradient(), or a hand-authored pair) — for
  //     those, "fade to whatever's behind it" is the truer intent than any
  //     fixed third color, and the shader has no alpha channel to express
  //     "fades to transparent" directly. Read fresh every call (not
  //     cached) so a theme toggle between crossfades is picked up
  //     automatically, same reasoning as every other live-token read in
  //     this codebase (color-mix() calls etc.) never caching a snapshot.
  function tonesFrom(rgbs) {
    function mix(from, target, amount) {
      return {
        r: Math.round(from.r + (target.r - from.r) * amount),
        g: Math.round(from.g + (target.g - from.g) * amount),
        b: Math.round(from.b + (target.b - from.b) * amount),
      };
    }
    var first = rgbs[0];
    var second = rgbs[1];
    var third = rgbs[2];
    // Only read the (canvas-fillStyle) background when actually needed —
    // no point paying for it on every card that already supplies a 3rd stop.
    var color3 = third || readCssColorRgb('--color-background') || { r: 255, g: 255, b: 255 };
    return {
      color1: first,
      color2: second || mix(first, { r: 0, g: 0, b: 0 }, 0.35),  // fallback: 35% toward black
      color3: color3,
    };
  }

  function lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  // Returns a crossfadeTo(targetTones) closure bound to one gradflow handle
  // getter — a getter (not the handle itself) because the async mount in
  // gradflow-page-bg.hbs may not have resolved yet when a caller first
  // wants to set a color; each call re-checks rather than latching a
  // possibly-still-undefined handle once.
  function makeCrossfader(getHandle, durationMs) {
    var displayed = null; // last color this crossfader actually applied — gradflow-background.js exposes no getter for its live uniforms, so this is the only record of "where we're tweening from"
    var rafId = 0;

    return function crossfadeTo(targetTones) {
      var handle = getHandle();
      if (!handle) return; // mount not ready (or prefers-reduced-motion skipped it entirely)

      if (!displayed) {
        handle.setColors(targetTones); // first-ever color: snap, nothing to tween from
        displayed = targetTones;
        return;
      }

      if (rafId) cancelAnimationFrame(rafId);
      var from = { color1: displayed.color1, color2: displayed.color2, color3: displayed.color3 };
      var start = performance.now();

      function tick(now) {
        var t = Math.min(1, (now - start) / durationMs);
        var next = {
          color1: lerpColor(from.color1, targetTones.color1, t),
          color2: lerpColor(from.color2, targetTones.color2, t),
          color3: lerpColor(from.color3, targetTones.color3, t),
        };
        handle.setColors(next);
        displayed = next;
        if (t < 1) { rafId = requestAnimationFrame(tick); }
        else { rafId = 0; displayed = targetTones; }
      }
      rafId = requestAnimationFrame(tick);
    };
  }

  window.GradflowColorCrossfade = { extractRgbs: extractRgbs, tonesFrom: tonesFrom, makeCrossfader: makeCrossfader };
})();
