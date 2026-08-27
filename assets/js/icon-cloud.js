/**
 * ICON CLOUD — rotating sphere of DOM sprites (react-icon-cloud / magicui's
 * "interactive icon cloud" pattern, reimplemented natively — this theme has
 * no React/canvas rendering pipeline, and the effect itself is just a rigid
 * rotation of points on a sphere, which a small vanilla module does fine).
 *
 * THE MATH
 * ────────
 * Each icon sits at a fixed point on a unit sphere, placed once via a
 * fibonacci/golden-spiral distribution (evenly spread, no clustering at the
 * poles — the standard trick for "N points roughly evenly spaced on a
 * sphere" with no relaxation/simulation needed).
 *
 * Every frame, the WHOLE sphere is rotated by an accumulated (rotationX,
 * rotationY) — auto-advancing on its own, or driven by drag delta — and
 * each point's rotated 3D position is projected back to 2D:
 *   screen.x = point.x * radius
 *   screen.y = point.y * radius
 *   scale    = perspective / (perspective + point.z * radius)   (nearer = bigger)
 *   opacity  = remapped from point.z (nearer = more opaque, matches the
 *              CSS `perspective` on the container doing the same job
 *              visually for the sprite's own size)
 *
 * This is the ENTIRE effect — no physics engine, no simulation step. Only
 * the rotation state changes per frame; every point's position on the
 * sphere itself is static and computed once at init.
 *
 * DRAG
 * ────
 * Pointer delta maps directly to rotation delta (dx -> rotationY, dy ->
 * rotationX), same sign convention a trackball/arcball control uses.
 * Releasing keeps the last frame's per-axis delta as a momentum velocity,
 * decayed each frame — so a flick keeps spinning and settles, rather than
 * stopping dead the instant the pointer lifts.
 */

function initIconCloud() {
  const root = document.querySelector('.icon-cloud');
  if (!root) return;

  const items = Array.from(root.querySelectorAll('.icon-cloud-item'));
  if (!items.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fibonacci sphere: evenly distributes N points with no clustering at the
  // poles. `i + 0.5` centers each sample within its slice (avoids a literal
  // point AT each pole when N is such that i=0/i=N-1 would land there).
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const points = items.map((el, i) => {
    const n = items.length;
    const y = 1 - (i / (n - 1)) * 2; // 1 -> -1 top to bottom
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    return {
      el,
      x: Math.cos(theta) * radiusAtY,
      y,
      z: Math.sin(theta) * radiusAtY,
    };
  });

  // Sphere radius in px, derived from the container's own rendered size —
  // NOT a fixed constant. Recomputed on resize (see the ResizeObserver
  // below) so the cloud fills whatever box the CSS gives it at any
  // viewport, matching every other viewport-relative measurement pattern
  // already used sitewide (e.g. particle-scroll-director.js's own
  // _zoneProgress, which reads live rect/innerHeight rather than baking in
  // a design-time number).
  let sphereRadius = 0;
  let perspective = 800; // must match .icon-cloud's CSS `perspective` value

  const measure = () => {
    const rect = root.getBoundingClientRect();
    sphereRadius = Math.min(rect.width, rect.height) * 0.38;
    const cs = window.getComputedStyle(root);
    const p = parseFloat(cs.perspective);
    if (!Number.isNaN(p) && p > 0) perspective = p;
  };
  measure();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(measure).observe(root);
  } else {
    window.addEventListener('resize', measure, { passive: true });
  }

  let rotX = -0.3; // slight tilt at rest so the top row isn't perfectly edge-on
  let rotY = 0;
  // Auto-rotation speed, radians/frame — deliberately slow (see the
  // particle system's own `autoRotation += 0.0005` for the same "barely
  // perceptible, reads as ambient not spinning" target this matches).
  const AUTO_SPEED = 0.0022;

  let velX = 0, velY = 0; // momentum after a drag release, decayed each frame
  const MOMENTUM_DECAY = 0.94;
  const MOMENTUM_STOP_THRESHOLD = 0.00005;

  let dragging = false;
  let lastPointerX = 0, lastPointerY = 0;
  let dragMoved = false; // distinguishes a drag from a tap (see pointerup below)

  const onPointerDown = (e) => {
    dragging = true;
    dragMoved = false;
    velX = 0; velY = 0;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    root.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    const ROTATE_SPEED = 0.005;
    rotY += dx * ROTATE_SPEED;
    rotX -= dy * ROTATE_SPEED;
    velY = dx * ROTATE_SPEED;
    velX = -dy * ROTATE_SPEED;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  };
  const onPointerUp = (e) => {
    dragging = false;
    try { root.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };

  // Drag-to-rotate disabled ≤767px (icon-cloud.css's own breakpoint,
  // touch-action:auto there restores native scroll for the same range) —
  // a drag gesture on a touch device is indistinguishable from a scroll
  // attempt starting on the cloud, and this component sits inline in the
  // page flow (not a dedicated full-screen surface), so scroll has to win.
  // The sphere still turns via the unconditional auto-rotation below
  // (AUTO_SPEED) either way — "no interaction on mobile, it just rotates
  // itself" is the explicit request, not merely "less drag sensitivity."
  // matchMedia, not a one-time innerWidth check at init: rotating a
  // device or resizing a desktop window across the boundary should
  // enable/disable dragging live, matching how every other responsive
  // rule in this file (the ResizeObserver above) already reacts rather
  // than freezing behavior at load time.
  const mobileQuery = window.matchMedia('(max-width: 767px)');
  let dragListenersActive = false;
  const syncDragListeners = () => {
    const shouldEnable = !prefersReducedMotion && !mobileQuery.matches;
    if (shouldEnable === dragListenersActive) return;
    dragListenersActive = shouldEnable;
    const method = shouldEnable ? 'addEventListener' : 'removeEventListener';
    root[method]('pointerdown', onPointerDown);
    root[method]('pointermove', onPointerMove);
    root[method]('pointerup', onPointerUp);
    root[method]('pointercancel', onPointerUp);
    // A resize crossing the boundary mid-drag must not leave `dragging`
    // stuck true with listeners now removed (pointerup would never fire
    // again to clear it) — same effect as a real pointerup/cancel.
    if (!shouldEnable && dragging) onPointerUp({ pointerId: undefined });
  };
  syncDragListeners();
  mobileQuery.addEventListener('change', syncDragListeners);

  const render = () => {
    if (!dragging && !prefersReducedMotion) {
      rotY += AUTO_SPEED + velY;
      rotX += velX;
      velX *= MOMENTUM_DECAY;
      velY *= MOMENTUM_DECAY;
      if (Math.abs(velX) < MOMENTUM_STOP_THRESHOLD) velX = 0;
      if (Math.abs(velY) < MOMENTUM_STOP_THRESHOLD) velY = 0;
    }

    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

    points.forEach((p) => {
      // Rotate around Y first, then X — standard extrinsic rotation order,
      // matches how the drag's dx/dy are applied independently above.
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.x * sinY + p.z * cosY;
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      const sx = x1 * sphereRadius;
      const sy = y2 * sphereRadius;
      const sz = z2 * sphereRadius;

      const scale = perspective / (perspective + sz);
      // z ranges [-sphereRadius, +sphereRadius]; remap to an opacity range
      // that keeps the far side legible (0.35) rather than vanishing —
      // this is a logo cloud, not a starfield, every icon should stay
      // identifiable even at the back.
      const depthT = (sz + sphereRadius) / (sphereRadius * 2); // 0 (far) -> 1 (near)
      const opacity = 0.35 + depthT * 0.65;

      p.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(${scale})`;
      p.el.style.opacity = String(opacity);
      // z-index from depth so nearer icons visually overlap farther ones —
      // integer bucket (not a raw float) since z-index only needs correct
      // ORDERING, not the precise depth value.
      p.el.style.zIndex = String(Math.round(depthT * 1000));
    });

    requestAnimationFrame(render);
  };

  // Reduced motion: render the static rest pose once (so items aren't left
  // at their unpositioned CSS default) and never schedule another frame —
  // no rAF loop at all, matching this theme's existing reduced-motion
  // pattern of removing the animation rather than just slowing it (see
  // .icon-cloud-item's own reduced-motion note, main.css's post-card
  // hover-glow equivalent).
  if (prefersReducedMotion) {
    // One static frame at the rest pose (rotX/rotY's initial values), no
    // rAF loop scheduled — render() always calls requestAnimationFrame at
    // its own end, so it can't be reused unmodified for a single-shot
    // paint; inlining the projection loop's own OUTPUT step here would
    // duplicate it, so instead just paint once via a throwaway rAF that
    // renders exactly one frame and does not re-arm itself.
    const renderOnce = () => {
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      points.forEach((p) => {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const sx = x1 * sphereRadius;
        const sy = y2 * sphereRadius;
        const sz = z2 * sphereRadius;
        const scale = perspective / (perspective + sz);
        const depthT = (sz + sphereRadius) / (sphereRadius * 2);
        const opacity = 0.35 + depthT * 0.65;
        p.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(${scale})`;
        p.el.style.opacity = String(opacity);
        p.el.style.zIndex = String(Math.round(depthT * 1000));
      });
    };
    requestAnimationFrame(renderOnce);
  } else {
    requestAnimationFrame(render);
  }

  // ── Tap celebration ────────────────────────────────────────────────
  // Fires on pointerup ONLY when the pointer didn't move (dragMoved still
  // false) — otherwise every drag-to-spin release would also burst an
  // emoji, which reads as noise rather than feedback for a deliberate tap.
  const CELEBRATION_EMOJI = ['👏🏼', '🏆', '🥇', '🎯', '🥁', '🏁', '✌🏼', '💪🏼', '🌟'];

  items.forEach((el) => {
    el.addEventListener('pointerup', (e) => {
      if (dragMoved) return;
      const emoji = CELEBRATION_EMOJI[Math.floor(Math.random() * CELEBRATION_EMOJI.length)];
      const burst = document.createElement('span');
      burst.className = 'icon-cloud-burst';
      burst.textContent = emoji;
      burst.setAttribute('aria-hidden', 'true');
      el.appendChild(burst);
      burst.addEventListener('animationend', () => burst.remove(), { once: true });
      // Safety net: if the element is removed/hidden mid-animation (tab
      // switch, resize teardown) animationend may never fire — same
      // belt-and-suspenders pattern this theme already uses for other
      // transient DOM nodes (e.g. the hover-glow layer's own cleanup).
      setTimeout(() => burst.remove(), 900);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIconCloud);
} else {
  initIconCloud();
}
