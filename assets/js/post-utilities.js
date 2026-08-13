(function() { 'use strict';

const GHOST_LOCAL_CONTENT_KEY = '53c1eef4fff835def4f59619d6';

function getGhostContentKey() {
  return (window.ghostContentKey && window.ghostContentKey.trim())
    ? window.ghostContentKey.trim()
    : GHOST_LOCAL_CONTENT_KEY;
}

function fetchPostsByTag(tagSlug, fields = 'id,url,title') {
  const key = getGhostContentKey();
  const url = `/ghost/api/content/posts/?key=${key}&filter=tag:${encodeURIComponent(tagSlug)}&fields=${fields}&order=published_at%20desc&limit=100`;
  return fetch(url)
    .then(res => {
      if (!res.ok) {
        throw new Error(`Ghost API ${res.status} for tag:${tagSlug}`);
      }
      return res.json();
    })
    .then(data => {
      const posts = data.posts || [];
      return posts;
    })
    .catch(err => {
      console.error('[ghostApi] Failed:', err.message);
      return [];
    });
}

// Shared by post-and-cards.js (.post-card-keywords) and posts-tabs-grid.js
// (.grid-card-keywords) — both parse the same codeinjection_head field
// (meta.cardKeywords) into the same pill markup, previously as two
// separately-hand-maintained .split(',').map(...) blocks that had already
// drifted (one dual-classed the span, one didn't — see posts-tabs-grid.js's
// own `post-card-keyword` class on its `grid-card-keyword` spans). One
// parser, one render function, so a format change (like this one) only
// needs a single edit.
//
// Format: comma-separated, each entry optionally suffixed `:color` — e.g.
// "UX:teal, Fintech:purple, B2B" — colon-suffixed entries get that
// data-color (see post-card-grid.css's .post-card-keyword[data-color=...]
// and tokens.css's "UTILITY COLORS" blocks for the six valid values:
// teal/purple/pink/blue/amber/neutral); plain entries render with no
// data-color attribute at all (today's existing neutral-glass look,
// untouched — see the base .post-card-keyword rule, unscoped to
// [data-color]). An unrecognised color name just fails to match any CSS
// rule and falls back to that same base look — no validation needed here.
const KEYWORD_COLOR_NAMES = ['teal', 'purple', 'pink', 'blue', 'amber', 'neutral'];

function parseCardKeywords(raw) {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const colonIndex = entry.lastIndexOf(':');
      if (colonIndex === -1) return { text: entry, color: null };
      const color = entry.slice(colonIndex + 1).trim().toLowerCase();
      if (!KEYWORD_COLOR_NAMES.includes(color)) return { text: entry, color: null };
      return { text: entry.slice(0, colonIndex).trim(), color };
    })
    .filter((k) => k.text.length > 0);
}

// Builds real elements (textContent, not innerHTML) — meta.cardKeywords is
// author-controlled (Ghost Admin code injection), not user input, but the
// old innerHTML-template-string approach still meant a stray `<`/`&` in a
// keyword would parse as markup rather than display literally; this is the
// same correctness fix at no extra cost, not a security hardening for a
// real threat model.
function renderCardKeywords(containerEl, raw, extraClass) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  parseCardKeywords(raw).forEach(({ text, color }) => {
    const span = document.createElement('span');
    span.className = extraClass ? `post-card-keyword ${extraClass}` : 'post-card-keyword';
    if (color) span.setAttribute('data-color', color);
    span.textContent = text;
    containerEl.appendChild(span);
  });
}

if (typeof window !== 'undefined') {
  window.fetchPostsByTag = fetchPostsByTag;
  window.getGhostContentKey = getGhostContentKey;
  window.renderCardKeywords = renderCardKeywords;
}

})();
