(function() { 'use strict';

// .before-after-slider — standalone before/after image comparison, dropped
// into Ghost post content via a plain HTML card (see the snippet in this
// module's own doc comment below). Self-contained: no partial/include
// needed, since Handlebars partials aren't available inside the Ghost
// content editor — the user pastes raw markup, this script finds and
// wires up every instance on the page. Multiple instances per page work
// unmodified: each is scoped to its own element, nothing shared globally
// except this one init pass.
//
// Markup the user pastes into an HTML card:
//
//   <div class="before-after-slider" data-before-image="https://.../before.jpg" data-after-image="https://.../after.jpg" data-width="1600" data-height="900">
//     <div class="before-after-slider-before"></div>
//     <div class="before-after-slider-after"></div>
//     <div class="before-after-slider-handle"></div>
//   </div>
//
// Both images are expected to be the SAME dimensions/crop (the user's own
// stated constraint) — this script doesn't attempt to normalize aspect
// ratio or crop mismatched sources. The two image divs are plain
// background-image (not <img> tags): a background-image can be clipped to
// an arbitrary width via clip-path/width without the layout-shift/
// intrinsic-size complications an <img> element would introduce, and
// keeps the "after" layer's clip a single CSS property this script only
// has to update once per pointer move.
//
// Sizing: the container's own aspect-ratio always ends up matching the
// BEFORE image's true proportions, whatever they are — 16:9, 4:5,
// portrait, anything — never a fixed guessed shape. Two sources feed
// --before-after-ratio (before-after-slider.css's aspect-ratio), in
// order:
//   1. data-width/data-height, if both are present and numeric — applied
//      IMMEDIATELY, synchronously, before the image has even started
//      loading, purely to avoid a layout jump once it arrives. Optional;
//      just a hint.
//   2. The actual loaded image's own naturalWidth/naturalHeight — always
//      applied once the image loads, REGARDLESS of whether step 1 ran,
//      overwriting whatever guess was there with ground truth. This is
//      the real fix for "various ratios": even with no data-width/
//      -height at all, or a typo'd/wrong attribute name, the box still
//      ends up the correct shape once the image is actually in hand —
//      the attributes are purely a same-frame head start, never the only
//      path to a correct ratio.

function initSlider(root) {
  if (root.dataset.basInitialized) return;
  root.dataset.basInitialized = 'true';

  var beforeUrl = root.dataset.beforeImage;
  var afterUrl = root.dataset.afterImage;
  var beforeLayer = root.querySelector('.before-after-slider-before');
  var afterLayer = root.querySelector('.before-after-slider-after');
  var handle = root.querySelector('.before-after-slider-handle');
  if (!beforeUrl || !afterUrl || !beforeLayer || !afterLayer || !handle) return;

  // The visible 2px divider line is injected here, not part of the pasted
  // markup (see this file's own doc comment above) — before-after-
  // slider.css's own .before-after-slider-handle-line comment explains why
  // this moved off the handle's own background: background-clip:content-box
  // failed to actually confine the fill to the 2px content box, rendering
  // as the full ~44px touch-target box instead ("line appears fat").
  if (!handle.querySelector('.before-after-slider-handle-line')) {
    var line = document.createElement('div');
    line.className = 'before-after-slider-handle-line';
    handle.appendChild(line);
  }

  beforeLayer.style.backgroundImage = 'url("' + beforeUrl.replace(/["\\]/g, '\\$&') + '")';
  afterLayer.style.backgroundImage = 'url("' + afterUrl.replace(/["\\]/g, '\\$&') + '")';

  var hintWidth = parseFloat(root.dataset.width);
  var hintHeight = parseFloat(root.dataset.height);
  if (hintWidth > 0 && hintHeight > 0) {
    root.style.setProperty('--before-after-ratio', hintWidth + ' / ' + hintHeight);
  }

  // Ground truth overwrites the hint above once available — see this
  // file's own doc comment for why the attributes alone aren't trusted.
  var probe = new Image();
  probe.onload = function() {
    if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
      root.style.setProperty('--before-after-ratio', probe.naturalWidth + ' / ' + probe.naturalHeight);
    }
  };
  probe.src = beforeUrl;

  var dragging = false;

  // Percent, not pixels: setPosition is called from both pointer math
  // (needs the root's live width) and keyboard nudges (has no pixel
  // origin at all) — percent is the one unit both callers can produce
  // without knowing about each other's math.
  function setPosition(percent) {
    percent = Math.max(0, Math.min(100, percent));
    afterLayer.style.clipPath = 'inset(0 ' + (100 - percent) + '% 0 0)';
    handle.style.left = percent + '%';
    root.setAttribute('aria-valuenow', Math.round(percent));
  }

  function percentFromClientX(clientX) {
    var rect = root.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function onPointerDown(e) {
    dragging = true;
    root.classList.add('is-dragging');
    // Permanent, unlike is-dragging (which clears on pointerup) — the
    // idle drift animation (before-after-slider.css) is gated on THIS
    // class specifically, not is-dragging, so it stays off for good
    // once the user has engaged the control even after they let go.
    root.classList.add('has-interacted');
    setPosition(percentFromClientX(e.clientX));
    // Pointer capture keeps drag tracking the handle even once the
    // cursor/finger leaves the slider's own bounding box mid-drag — a
    // fast swipe on mobile easily overshoots the element's edges.
    if (handle.setPointerCapture && e.pointerId != null) {
      handle.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    setPosition(percentFromClientX(e.clientX));
  }

  function onPointerUp() {
    dragging = false;
    root.classList.remove('is-dragging');
  }

  handle.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerdown', function(e) {
    if (e.target === handle) return;
    // Touch: only the HANDLE starts a drag, never the rest of the surface.
    // This element is often full-width and tall in a post, so a vertical
    // scroll gesture that happens to begin on it was being consumed
    // outright — onPointerDown calls preventDefault() unconditionally, so
    // the first swipe moved the slider a few px instead of scrolling the
    // page, and only a second swipe (started off the image) got through.
    // With a mouse the same behaviour is harmless and genuinely useful —
    // click-anywhere-to-jump — so it is kept for fine pointers.
    if (e.pointerType === 'touch') return;
    onPointerDown(e);
  });
  // Move/up listen on window, not root: once dragging starts, the
  // pointer legitimately moves outside root's box (see pointer-capture
  // comment above) and root itself would stop receiving these events.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  handle.addEventListener('keydown', function(e) {
    var current = parseFloat(root.getAttribute('aria-valuenow')) || 50;
    if (e.key === 'ArrowLeft') { setPosition(current - 2); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setPosition(current + 2); e.preventDefault(); }
    else if (e.key === 'Home') { setPosition(0); e.preventDefault(); }
    else if (e.key === 'End') { setPosition(100); e.preventDefault(); }
    else return;
    root.classList.add('has-interacted');
  });

  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', 'Before and after image comparison');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  handle.setAttribute('tabindex', '0');

  setPosition(50);

  // Idle "breathing" drift — calm side-to-side motion signaling the
  // handle/mask is draggable, before the user has touched it. Drives
  // the REAL setPosition() (not a decorative CSS-only transform on the
  // handle) so the clip-path mask moves in lockstep with the handle,
  // exactly like a real drag — a purely visual handle-only offset was
  // tried first and rejected: the mask staying frozen at 50% while the
  // handle appeared to move made it look broken, not draggable.
  // sin()-based, not a manual easing curve: a sine wave is naturally
  // slowest at each extreme and fastest through center — the same
  // "settle, then re-accelerate" push-pull feel an ease-in-out
  // @keyframes would give, with no separate easing function needed.
  // ±50px converted to percent via the root's OWN live width each
  // frame (not computed once) — the box is responsive (aspect-ratio,
  // width:100%), so a fixed percent would drift a different pixel
  // amount at every viewport size; recomputing keeps the amplitude
  // pinned to the spec'd 50px regardless of how wide the slider
  // currently renders.
  // idleElapsedMs accumulates only while the drift is actually RUNNING —
  // a wall-clock timestamp (now - idleStart) was tried first and
  // rejected: pausing during hover only skipped the setPosition() call,
  // not the clock, so the sine phase kept advancing in real time while
  // paused — on hover-out it had jumped ahead to wherever real time now
  // said it should be, producing a visible snap instead of continuing
  // smoothly from the exact point it paused at. Tracking elapsed ACTIVE
  // time instead means the phase is frozen for the entire hover
  // duration, however long that is, and resumes from that exact frozen
  // phase the instant hover ends.
  var idleElapsedMs = 0;
  var idleLastFrameTime = performance.now();
  var idleFrame = null;
  var idlePeriodMs = 4000;

  function idleTick(now) {
    var dt = now - idleLastFrameTime;
    idleLastFrameTime = now;
    if (root.classList.contains('has-interacted')) { idleFrame = null; return; }
    if (!root.matches(':hover') && !dragging) {
      idleElapsedMs += dt;
      var rect = root.getBoundingClientRect();
      var amplitudePercent = rect.width > 0 ? (50 / rect.width) * 100 : 0;
      var phase = (idleElapsedMs % idlePeriodMs) / idlePeriodMs; // 0..1
      var offsetPercent = Math.sin(phase * Math.PI * 2) * amplitudePercent;
      setPosition(50 + offsetPercent);
    }
    idleFrame = requestAnimationFrame(idleTick);
  }
  idleFrame = requestAnimationFrame(idleTick);
}

// VIEWPORT-GATED INIT.
//
// initSlider() paints two full-size images as CSS background-image AND
// fires a `new Image()` dimension probe — three eager fetches per slider,
// none of which loading="lazy" can reach (backgrounds and Image() are
// both outside its scope). This post carries EIGHT slider blocks, all far
// below the fold, so a plain init-everything-on-DOMContentLoaded pass put
// ~16 full-size images on the wire during initial parse, competing with
// the hero for bandwidth. Measured under an 800kbps throttle: the 162KB
// hero took 12.3s to arrive with 15 other images starting before it
// finished; old.jpg and new.jpg (a slider pair) alone held the connection
// for 8.4s and 7.7s.
//
// Deferring per-slider until it approaches the viewport keeps the fetches
// but moves them off the critical path. rootMargin gives them a screen of
// runway so the images are ready before the slider is actually looked at
// — this trades nothing visually, it only stops them racing the hero.
//
// initSlider is unchanged and still idempotent (its own dataset guard), so
// the MutationObserver rescan below stays correct: newly added sliders get
// observed rather than initialized immediately.
var observer = null;
if (window.IntersectionObserver) {
  observer = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        var el = entries[i].target;
        observer.unobserve(el);
        initSlider(el);
      }
    }
  }, { rootMargin: '100% 0px' });
}

function initAll() {
  document.querySelectorAll('.before-after-slider').forEach(function (el) {
    // No IntersectionObserver (or already initialized): fall back to the
    // original immediate init rather than leaving an inert slider.
    if (!observer || el.dataset.basInitialized) {
      initSlider(el);
      return;
    }
    if (el.dataset.basObserved) return;
    el.dataset.basObserved = 'true';
    observer.observe(el);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll, { once: true });
} else {
  initAll();
}

// Ghost content (including HTML cards) can render or update after this
// script's own initial pass — e.g. a card lower on the page hydrating
// async, or an editor preview re-rendering content live. Without this,
// any .before-after-slider added post-load would sit inert (a slider
// shape with a handle that doesn't respond to input at all). initSlider
// itself no-ops instantly on an already-initialized element (dataset
// guard at the top), so re-scanning the whole subtree on every mutation
// is cheap and never double-wires the same instance.
if (window.MutationObserver) {
  new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length) { initAll(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

})();
