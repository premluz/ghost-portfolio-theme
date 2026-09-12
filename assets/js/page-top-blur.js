// Generates the 8-layer Utsubo-technique progressive blur (extracted
// 2026-09-08) into any container marked with [data-progressive-blur-layers].
// Shared by .page-top-blur (default.hbs, top-anchored) and
// .nav-progressive-blur (navigation.hbs, bottom-anchored) — same band math,
// same doubling blur-radius curve, each container's own mask direction set
// via data-progressive-blur-layers="top|bottom" (which edge the strongest,
// 10px layer sits at).
//
// Band math: step = 100 / 8 = 12.5%. Each band's opaque PLATEAU is 2 steps
// wide with 1-step ramps on each side (3 steps total), so consecutive bands
// overlap by a full step instead of meeting edge-to-edge at a single point.
// That overlap is what turns 8 discrete triangles into one continuous ramp
// — a zero-width-plateau version (ramps meeting at one point, no overlap)
// produces hard seams, visible as discrete rings wherever the blurred
// content has a bright, sharp feature (confirmed live against this site's
// particle field; invisible on the reference's own flat mockup background,
// but a real defect in the reference's posted "reusable" JS all the same).
(function () {
  var blurRadii = [
    '0.078125px',
    '0.15625px',
    '0.3125px',
    '0.625px',
    '1.25px',
    '2.5px',
    '5px',
    '10px',
  ];

  var step = 100 / blurRadii.length;

  var clamp = function (v) {
    return Math.max(0, Math.min(100, v));
  };

  function buildLayers(container, direction) {
    // 'top': strongest blur (10px) at the container's top edge, mask
    // direction "to top" (band 0 at the bottom, band 7 at the top).
    // 'bottom': mirrored — strongest blur at the bottom edge, mask
    // direction "to bottom" (band 0 at the top, band 7 at the bottom).
    var maskDirection = direction === 'bottom' ? 'to bottom' : 'to top';

    blurRadii.forEach(function (radius, index) {
      var start = clamp(index * step);
      var fadeInEnd = clamp(index * step + step);
      var fadeOutStart = clamp(index * step + step * 2);
      var end = clamp(index * step + step * 3);

      var layer = document.createElement('div');
      layer.className = 'progressive-blur-layer';
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.pointerEvents = 'none';
      layer.style.zIndex = String(index + 1);
      layer.style.backdropFilter = 'blur(' + radius + ')';
      layer.style.webkitBackdropFilter = 'blur(' + radius + ')';

      var mask = [
        'rgba(0, 0, 0, 0) ' + start + '%',
        'rgba(0, 0, 0, 1) ' + fadeInEnd + '%',
        'rgba(0, 0, 0, 1) ' + fadeOutStart + '%',
        'rgba(0, 0, 0, 0) ' + end + '%',
      ].join(', ');

      layer.style.maskImage = 'linear-gradient(' + maskDirection + ', ' + mask + ')';
      layer.style.webkitMaskImage = 'linear-gradient(' + maskDirection + ', ' + mask + ')';
      container.appendChild(layer);
    });
  }

  document.querySelectorAll('[data-progressive-blur-layers]').forEach(function (container) {
    buildLayers(container, container.getAttribute('data-progressive-blur-layers'));
  });
})();
