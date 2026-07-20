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

if (typeof window !== 'undefined') {
  window.fetchPostsByTag = fetchPostsByTag;
  window.getGhostContentKey = getGhostContentKey;
}

})();
