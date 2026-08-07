/**
 * GRADIENT AURA FRAME
 * Initializes every [data-gradient-aura] element on the page (multi-
 * instance safe — see main.css ".gradient-aura-frame" for why). Same
 * scanning pattern as gradient-frame.js's [data-gradient-frame]: loaded
 * site-wide, no-ops with zero cost on any page with no matching element.
 */
(function () {
  'use strict';

  function initFrame(el) {
    var colors = (el.getAttribute('data-aura-colors') || '')
      .split(',')
      .map(function (c) { return c.trim(); })
      .filter(Boolean);
    ['--aura-1', '--aura-2', '--aura-3'].forEach(function (prop, i) {
      if (colors[i]) el.style.setProperty(prop, colors[i]);
    });

    var size = el.getAttribute('data-aura-size');
    if (size) el.style.setProperty('--aura-size', size);

    var speed = el.getAttribute('data-aura-speed');
    if (speed) el.style.setProperty('--aura-speed', speed);
  }

  document.querySelectorAll('[data-gradient-aura]').forEach(initFrame);
})();
