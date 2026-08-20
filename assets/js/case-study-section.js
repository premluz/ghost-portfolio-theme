(function() { 'use strict';

// .case-study-section[data-background] — sets this section's own
// background from a hex color OR an image URL (main.css consumes
// --case-study-bg for the color case; the image case sets background-image
// directly, since a URL has no equivalent single-property custom-property
// trick the way a color does). A plain CSS rule can't read either straight
// off the attribute: CSS attr() only resolves inside `content`, not
// background-color/-image, so both cases need JS regardless.
//
// FOUR states, not three — the attribute's mere PRESENCE matters, not just
// its value, and its value's FORMAT picks color vs image:
//   attribute absent entirely   -> --case-study-bg left unset, main.css's
//                                  own var(--case-study-bg, var(--color-
//                                  background)) fallback resolves it to
//                                  the live page background token.
//   data-background="#hex"      -> --case-study-bg: #hex (flat color).
//   data-background="" (blank)  -> --case-study-bg: transparent, explicit
//                                  — an authored "no background" that
//                                  must NOT fall through to the page-token
//                                  default above. hasAttribute (not the
//                                  querySelectorAll match, which is true
//                                  for a blank attribute too) is what lets
//                                  this branch tell "blank" apart from
//                                  "has a real value" — el.dataset.background
//                                  is '' either way absence wouldn't even
//                                  reach this loop at all, so within it the
//                                  only question left is real-value vs blank.
//   data-background="<url>"     -> anything non-blank that doesn't start
//                                  with "#" is treated as an image URL, not
//                                  a color: sets background-image (cover)
//                                  directly instead of --case-study-bg, and
//                                  adds data-background-type="image" so
//                                  main.css's [data-gradient-wash="true"]
//                                  rules can key off it — an image
//                                  background flips the wash's whole
//                                  premise (see that rule's own comment):
//                                  there's no flat --case-study-bg color
//                                  left to fade FROM, so the wash instead
//                                  fades the PAGE background color IN over
//                                  the image's own edge, transparent at the
//                                  image (inner) to --color-background at
//                                  the far end (outer) — the reverse of the
//                                  color case's stop order.
function initAll() {
  document.querySelectorAll('.case-study-section[data-background]').forEach(function(el) {
    var value = el.dataset.background;
    if (!value) {
      el.style.setProperty('--case-study-bg', 'transparent');
      return;
    }
    if (value.charAt(0) === '#') {
      el.style.setProperty('--case-study-bg', value);
      return;
    }
    el.setAttribute('data-background-type', 'image');
    // CSS.escape + manual url(...) construction (not template-string
    // interpolation) so a path containing a literal quote or backslash
    // can't break out of the url() token — el.style.backgroundImage is a
    // plain property assignment, not parsed as a stylesheet, so the
    // browser won't sanitize this the way a real CSS file would.
    el.style.backgroundImage = 'url("' + value.replace(/["\\]/g, '\\$&') + '")';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll, { once: true });
} else {
  initAll();
}

})();
