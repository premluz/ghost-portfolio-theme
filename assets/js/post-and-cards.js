(function() { 'use strict';

// Hides the skeleton and shows the <img> — the fallback endpoint for
// every path that ends up WITHOUT a video (no video field, malformed
// metadata, fetch failure).
function showImageFallback(card) {
  const imageEl = card.querySelector('.post-card-image');
  if (!imageEl) return;
  const skeleton = imageEl.querySelector('.card-media-skeleton');
  if (skeleton) skeleton.classList.add('is-hidden');
  const img = imageEl.querySelector('img');
  if (!img) return;

  // If the image is already loaded and decoded by the time we know there's
  // no video for this card, there's nothing left to wait for — skip the
  // normal 0.4s opacity fade (post-card-grid.css's .post-card-image img
  // transition) and show it instantly instead of fading in something
  // that's already fully ready. Still falls back to the normal fade for
  // images that genuinely haven't finished loading yet.
  if (img.complete && img.naturalWidth > 0) {
    img.style.transition = 'none';
    img.classList.add('is-visible');
    void img.offsetHeight; // flush the style before restoring the transition
    img.style.transition = '';
  } else {
    img.classList.add('is-visible');
  }
}

// Extracted from the old fetchCardMeta so both the batched Content API
// path (fetchAllCardMetaBatched) and the per-card fallback path
// (fetchCardMetaFallback) apply the same fields the same way — only WHERE
// rawText comes from differs (a small codeinjection_head string vs a full
// fetched HTML page); the regex below finds the same embedded
// window.projectMeta/projectMetaArray.push(...) block in either.
function applyCardMeta(card, rawText, onSettled) {
  let metaMatch = rawText.match(/window\.projectMeta\s*=\s*(\{[\s\S]*?\});/);

  if (!metaMatch) {
    metaMatch = rawText.match(/window\.projectMetaArray\.push\(\s*(\{[\s\S]*?\})\s*\)/);
  }

  if (!metaMatch) {
    showImageFallback(card);
    onSettled();
    return;
  }

  try {
    const metaStr = metaMatch[1];
    const meta = eval(`(${metaStr})`);
    console.log('[post-and-cards] Loaded metadata for card:', meta);

    if (meta.gradientCss) {
      console.log('[post-and-cards] Found gradientCss:', meta.gradientCss);
      card.setAttribute('data-gradient-css', meta.gradientCss);
    } else {
      console.log('[post-and-cards] No gradientCss in metadata');
    }

    if (meta.projectCategory) {
      let categoryEl = card.querySelector('.post-card-category');
      if (!categoryEl) {
        const titleEl = card.querySelector('.post-card-title');
        if (titleEl && titleEl.parentElement) {
          categoryEl = document.createElement('p');
          categoryEl.className = 'post-card-category';
          titleEl.parentElement.insertBefore(categoryEl, titleEl);
        }
      }
      if (categoryEl) {
        categoryEl.textContent = meta.projectCategory;
      }
    }

    // Logo sits above the category (eyebrow) line — same meta field
    // and /content/images/logos/ path convention as the other grid
    // (posts-tabs-grid.js), just a different position in this card.
    if (meta.projectLogo) {
      let logoEl = card.querySelector('.post-card-logo');
      if (!logoEl) {
        const anchorEl = card.querySelector('.post-card-category') || card.querySelector('.post-card-title');
        if (anchorEl && anchorEl.parentElement) {
          logoEl = document.createElement('img');
          logoEl.className = 'post-card-logo';
          logoEl.alt = 'Project logo';
          anchorEl.parentElement.insertBefore(logoEl, anchorEl);
        }
      }
      if (logoEl) {
        logoEl.src = meta.projectLogo.startsWith('http')
          ? meta.projectLogo
          : `/content/images/logos/${meta.projectLogo}`;
      }
    }

    if (meta.longTitle) {
      const titleEl = card.querySelector('.post-card-title');
      if (titleEl) {
        titleEl.textContent = meta.longTitle;
      }
    }

    if (meta.client) {
      const clientEl = card.querySelector('.post-card-client');
      if (clientEl) {
        clientEl.textContent = meta.client;
      }
    }

    if (meta.cardDescription) {
      const statementSlide = document.createElement('section');
      statementSlide.className = 'statement-slide card-description-statement';
      statementSlide.innerHTML = `
        <div class="statement-container" data-card-reveal="default">
          <h2 class="statement-heading">${meta.cardDescription}</h2>
        </div>
      `;
      card.parentElement.insertBefore(statementSlide, card);
      // card-scroll-reveal.js's own querySelectorAll already ran by
      // the time this fetch resolves — window.observeCardReveal is
      // its escape hatch for exactly this (see that file's
      // setInitialCardState comment): same shared observer/scroll-
      // direction tracking, just registered later. 'default' is the
      // shared slide-up variant (same motion as .testimonial-card
      // etc.) — matches the post-card entrance now using 'default'
      // too instead of 'slide-left' (see card-animations.js).
      window.observeCardReveal?.(statementSlide.querySelector('.statement-container'));
    }

    if (meta.descBullet1 || meta.descBullet2 || meta.descBullet3) {
      let bulletsEl = card.querySelector('.post-card-bullets');
      if (!bulletsEl) {
        const descEl = card.querySelector('.post-card-description');
        if (descEl && descEl.parentElement) {
          bulletsEl = document.createElement('ul');
          bulletsEl.className = 'post-card-bullets';
          descEl.parentElement.insertBefore(bulletsEl, descEl.nextElementSibling);
        }
      }
      if (bulletsEl) {
        bulletsEl.innerHTML = '';
        [meta.descBullet1, meta.descBullet2, meta.descBullet3].forEach(bullet => {
          if (bullet) {
            const li = document.createElement('li');
            li.textContent = bullet;
            bulletsEl.appendChild(li);
          }
        });
      }
    }

    if (meta.cardKeywords) {
      const keywordsEl = card.querySelector('.post-card-keywords');
      if (keywordsEl) {
        const keywords = meta.cardKeywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);

        keywordsEl.innerHTML = keywords.map(keyword =>
          `<span class="post-card-keyword">${keyword}</span>`
        ).join('');
      }
    }

    if (meta.video) {
      const imageEl = card.querySelector('.post-card-image');
      if (imageEl) {
        // Layered ON TOP of the existing <img> (absolute, starts at
        // opacity:0) instead of replacing it via innerHTML — that
        // used to destroy the <img> the instant this ran, leaving a
        // blank gap until the video's own loadeddata fired and its
        // fade-in completed (image gone, then a beat of nothing,
        // then video). The <img> stays hidden (skeleton → video,
        // image never shown at all — a post either HAS a video or
        // shows its image, never both/overlapping) so there's no
        // two-layer race (unlike the OLD dual-layer .grid-card
        // approach this used to mirror — see posts-tabs-grid.js).
        const videoSrc = meta.video.startsWith('http') ? meta.video : `/content/images/videos/${meta.video}`;
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        Object.assign(video.style, {
          position: 'absolute',
          // width/height:100% removed — redundant with inset:0 (which
          // alone fully determines the box on all 4 sides) and the
          // reported bug (video rendering smaller than its container,
          // skeleton visible behind it at the bottom/right edges) is
          // exactly the kind of "two competing sizing paths disagree"
          // symptom that redundancy causes on a dynamically-inserted
          // element. .card-media-skeleton (which never shows this bug)
          // only ever used inset:0 alone — matching that here.
          inset: '0',
          objectFit: 'cover',
          opacity: '0',
          transition: 'opacity 0.4s ease',
        });
        const source = document.createElement('source');
        source.src = videoSrc;
        source.type = 'video/mp4';
        video.appendChild(source);
        imageEl.appendChild(video);
        video.load();

        const skeleton = imageEl.querySelector('.card-media-skeleton');
        const fadeIn = () => {
          video.style.opacity = '1';
          if (skeleton) skeleton.classList.add('is-hidden');
        };
        if (video.readyState >= 2) fadeIn();
        else video.addEventListener('loadeddata', fadeIn, { once: true });

        const videoObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              video.play();
            } else {
              video.pause();
            }
          });
        }, { threshold: 0.5 });

        videoObserver.observe(video);
      }
    } else {
      // No video for this post — resolve the skeleton to the image
      // instead (see showImageFallback above).
      showImageFallback(card);
    }

    if (meta.cardId) {
      card.setAttribute('data-cardid', meta.cardId);
    }

    if (meta.accentColor) {
      card.style.setProperty('--card-accent-color', meta.accentColor);
    }

    if (meta.gradientCss) {
      card.setAttribute('data-gradient-css', meta.gradientCss);
    }

    if (meta.projectTestimonial) {
      const testimonialEl = card.querySelector('.post-card-testimonial');
      if (testimonialEl) {
        testimonialEl.textContent = meta.projectTestimonial;
      }
    }

    if (meta.projectEndorser) {
      const endorserEl = card.querySelector('.post-card-endorser');
      if (endorserEl) {
        endorserEl.textContent = `— ${meta.projectEndorser}`;
      }
    }

    if (meta.disableLink === true || meta['disable-link'] === true) {
      const link = card.querySelector('.post-card-link');
      if (link) {
        // Was pointer-events:none — that also blocks mouseenter/mouseleave,
        // so hover-driven effects (e.g. the card's own scale-on-hover)
        // never saw the hover at all. preventDefault on click blocks
        // navigation the same way while leaving hover intact. A listener
        // on the link itself fires before page-transition.js's
        // document-level click handler (bubble phase starts at the
        // target), so stopPropagation here reliably stops it from also
        // handling this click.
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        card.classList.add('card-disabled');
      }
    }

    if (window.projectMetaArray && Array.isArray(window.projectMetaArray)) {
      window.projectMetaArray.push(meta);
    }

    onSettled();
  } catch (e) {
    // Malformed metadata — still resolve the skeleton to the image
    // rather than leaving it shimmering forever.
    showImageFallback(card);
    onSettled();
  }
}

// Fallback path: fetches the post's own full rendered HTML and regex-scrapes
// the embedded meta block out of it — the ORIGINAL mechanism, kept only for
// any card the batched Content API pass below couldn't cover (bad/missing
// key, network failure, slug mismatch). Expensive (a full page fetch just
// to read one embedded <script> block) — not the common path anymore.
function fetchCardMetaFallback(card, onSettled) {
  if (card.__metaLoaded) { onSettled(); return; }
  card.__metaLoaded = true;

  if (!window.projectMetaArray) {
    window.projectMetaArray = [];
  }

  const link = card.querySelector('.post-card-link');
  const postUrl = link?.getAttribute('href');

  if (!postUrl) {
    showImageFallback(card);
    onSettled();
    return;
  }

  fetch(postUrl)
    .then(res => res.text())
    .then(html => applyCardMeta(card, html, onSettled))
    .catch(() => {
      // Fetch failed — same fallback as malformed metadata.
      showImageFallback(card);
      onSettled();
    });
}

function slugFromHref(href) {
  try {
    const path = new URL(href, window.location.origin).pathname;
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch (e) {
    return null;
  }
}

// sessionStorage cache for codeinjection_head strings, keyed by slug — a
// full page reload (page-transition.js does a real window.location.href
// navigation, not an in-page swap) wipes every in-memory JS variable, so a
// user going home->post->home (nav close, or any same-tab back/forward)
// re-ran this whole batched fetch from scratch even though nothing about
// these posts had changed since they last loaded, showing the skeleton for
// a full network round-trip again. sessionStorage survives across those
// reloads for the life of the tab; bumping CARD_META_CACHE_VERSION
// invalidates every entry at once if the stored shape ever changes.
const CARD_META_CACHE_VERSION = 'v1';
function cardMetaCacheKey(slug) {
  return `cardMeta:${CARD_META_CACHE_VERSION}:${slug}`;
}
function readCardMetaCache(slug) {
  try {
    return window.sessionStorage.getItem(cardMetaCacheKey(slug));
  } catch (e) {
    return null; // storage disabled/unavailable (private mode, quota) — just skip the cache
  }
}
function writeCardMetaCache(slug, rawText) {
  try {
    window.sessionStorage.setItem(cardMetaCacheKey(slug), rawText);
  } catch (e) {
    // storage disabled/full — caching is an optimization, not a requirement
  }
}

// One batched Ghost Content API call for every card's slug at once, instead
// of a separate full-HTML-page fetch per card. codeinjection_head is the
// EXACT field each post's own <script>window.projectMeta.../<script> block
// already lives in (that's what the old per-card fetch was scraping out of
// the full page) — the Content API returns it directly, as a few KB of JSON
// for the whole batch, rather than N full page downloads staggered by
// viewport visibility. That staggering was the actual cause of the gap:
// below-the-fold cards sat on their skeleton until scrolled into view.
// Firing this once, immediately, for every card regardless of visibility
// removes that gap instead of just reshuffling which cards go first.
function fetchAllCardMetaBatched(cards, onCardSettled) {
  const bySlug = new Map();
  cards.forEach(card => {
    if (card.__metaLoaded) return;
    const link = card.querySelector('.post-card-link');
    const href = link?.getAttribute('href');
    const slug = href ? slugFromHref(href) : null;
    if (slug) bySlug.set(slug, card);
  });

  if (bySlug.size === 0) return Promise.resolve();

  if (!window.projectMetaArray) {
    window.projectMetaArray = [];
  }

  // Serve whatever's already cached from a prior page load in this tab
  // immediately, synchronously — no network wait, so these cards' skeletons
  // resolve on the same tick instead of after a round-trip. Only the
  // remaining (uncached) slugs go through the fetch below.
  bySlug.forEach((card, slug) => {
    const cached = readCardMetaCache(slug);
    if (cached !== null) {
      card.__metaLoaded = true;
      bySlug.delete(slug);
      applyCardMeta(card, cached, () => onCardSettled(card));
    }
  });

  if (bySlug.size === 0) return Promise.resolve();

  const key = window.ghostContentKey || '53c1eef4fff835def4f59619d6';
  const slugList = Array.from(bySlug.keys()).join(',');
  const apiUrl = `/ghost/api/content/posts/?key=${key}&filter=slug:[${slugList}]&fields=slug,codeinjection_head&limit=all`;

  return fetch(apiUrl)
    .then(res => res.json())
    .then(data => {
      const posts = (data && data.posts) || [];
      posts.forEach(post => {
        const card = bySlug.get(post.slug);
        if (!card || card.__metaLoaded) return;
        card.__metaLoaded = true;
        bySlug.delete(post.slug);
        writeCardMetaCache(post.slug, post.codeinjection_head || '');
        applyCardMeta(card, post.codeinjection_head || '', () => onCardSettled(card));
      });

      // Any slug that didn't come back (post not published yet, mismatch,
      // partial API failure) still needs to resolve — fall back per-card
      // for exactly those, not the whole batch.
      bySlug.forEach(card => {
        fetchCardMetaFallback(card, () => onCardSettled(card));
      });
    })
    .catch(() => {
      // Whole batched request failed (network, invalid key, etc.) — fall
      // back to the original per-card path for every card it would have
      // covered, so a Content API outage degrades to the old behavior
      // instead of leaving cards stuck on their skeleton forever.
      bySlug.forEach(card => {
        fetchCardMetaFallback(card, () => onCardSettled(card));
      });
    });
}

function initPostCardMetadata() {
  const postCards = document.querySelectorAll('.post-card');
  if (postCards.length === 0) return;

  if (!window.projectMetaArray) {
    window.projectMetaArray = [];
  }

  let loadedCount = 0;
  const totalCards = postCards.length;
  const done = () => {
    loadedCount++;
    if (loadedCount === totalCards) {
      reInitializeCardAnimations();
    }
  };

  // Most cards are already __metaLoaded by the time this runs (see the
  // immediate batched call at the bottom of this file) — this call mainly
  // exists as a safety net for anything that pre-pass missed, and to keep
  // window.initPostCardMetadata's external contract (main.js calls this on
  // its own load+idle-gated schedule) working exactly as before.
  fetchAllCardMetaBatched(Array.from(postCards), done);

  function reInitializeCardAnimations() {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cardmeta:ready'));
      if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        if (typeof ScrollTrigger.getAll === 'function') {
          const postCards = document.querySelectorAll('.post-card');
          postCards.forEach(card => {
            const triggers = ScrollTrigger.getAll().filter(t => t.trigger === card);
            triggers.forEach(t => t.kill());
          });
        }
      }

      if (window.CardAnimations) {
        new window.CardAnimations();
      }

      if (typeof window.initHeadingAnimations === 'function') {
        window.initHeadingAnimations();
      }

      // Injected statement slides / bullets / category text above changed
      // this section's height — refresh so triggers further down the page
      // (e.g. #lab-intro) recompute their start position against the new
      // layout instead of firing at a stale pixel offset.
      if (window.ScrollTrigger && typeof ScrollTrigger.refresh === 'function') {
        ScrollTrigger.refresh();
      }
    }, 150);
  }

  setTimeout(() => {
    if (loadedCount < totalCards) {
      reInitializeCardAnimations();
    }
  }, 8000);
}

// Runs immediately at this script's own load (not gated behind main.js's
// load+idle defer that the full initPostCardMetadata() pass waits for) —
// one batched Content API request covering every card on the page, so all
// of them get their real data as early as the page can make one network
// call, rather than waiting on main.js's deferred pass or a per-card
// viewport-triggered fetch.
function eagerFetchAllCardMeta() {
  const postCards = document.querySelectorAll('.post-card');
  if (postCards.length === 0) return;
  fetchAllCardMetaBatched(Array.from(postCards), () => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', eagerFetchAllCardMeta, { once: true });
} else {
  eagerFetchAllCardMeta();
}

if (typeof window !== 'undefined') {
  window.initPostCardMetadata = initPostCardMetadata;
}

})();
