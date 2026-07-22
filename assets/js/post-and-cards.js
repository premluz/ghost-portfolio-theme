(function() { 'use strict';

// Extracted from initPostCardMetadata() so an eager pre-pass (below) and
// the full deferred pass (main.js's load+idle-gated initPostCardMetadata())
// can share one implementation. __metaLoaded guards against double-fetching
// a card the eager pass already claimed; onSettled always fires exactly
// once per card regardless of which path handled it, so the caller's
// "all done" counting stays correct either way.
// Fades the skeleton out and the <img> in — the fallback endpoint for
// every path that ends up WITHOUT a video (no video field, malformed
// metadata, fetch failure).
function showImageFallback(card) {
  const imageEl = card.querySelector('.post-card-image');
  if (!imageEl) return;
  const skeleton = imageEl.querySelector('.card-media-skeleton');
  if (skeleton) skeleton.classList.add('is-hidden');
  const img = imageEl.querySelector('img');
  if (img) img.classList.add('is-visible');
}

function fetchCardMeta(card, onSettled) {
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
    .then(html => {
      let metaMatch = html.match(/window\.projectMeta\s*=\s*(\{[\s\S]*?\});/);

      if (!metaMatch) {
        metaMatch = html.match(/window\.projectMetaArray\.push\(\s*(\{[\s\S]*?\})\s*\)/);
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
              inset: '0',
              width: '100%',
              height: '100%',
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
            link.style.pointerEvents = 'none';
            link.setAttribute('data-tooltip', 'No case study');
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
    })
    .catch(err => {
      // Fetch failed — same fallback as malformed metadata.
      showImageFallback(card);
      onSettled();
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

  postCards.forEach(card => fetchCardMeta(card, done));

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

// EAGER PRE-PASS: runs immediately at this script's own load (not gated
// behind main.js's load+idle defer that the full initPostCardMetadata()
// pass waits for). Targets (1) any card already sitting in the viewport
// right now — it's about to be seen instantly, so waiting on idle just
// means visible text/video shows up late for no reason — and (2) if this
// load is a curtain-return (or any arrival referred from one of these
// posts), the specific card the visitor just came back to check, plus its
// immediate neighbors. fetchCardMeta's __metaLoaded guard makes this safe
// to run ahead of the full pass without double-fetching anything.
function eagerFetchVisibleOrReturning() {
  const postCards = document.querySelectorAll('.post-card');
  if (postCards.length === 0) return;

  const eager = new Set();
  postCards.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) eager.add(i);
  });

  if (document.referrer) {
    try {
      const referrerPath = new URL(document.referrer).pathname.replace(/\/$/, '');
      postCards.forEach((card, i) => {
        const link = card.querySelector('.post-card-link');
        const href = link?.getAttribute('href');
        if (!href) return;
        const hrefPath = new URL(href, window.location.origin).pathname.replace(/\/$/, '');
        if (hrefPath === referrerPath) {
          eager.add(i);
          if (i > 0) eager.add(i - 1);
          if (i < postCards.length - 1) eager.add(i + 1);
        }
      });
    } catch (e) { /* not a valid URL (e.g. empty referrer) — skip */ }
  }

  eager.forEach((i) => fetchCardMeta(postCards[i], () => {}));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', eagerFetchVisibleOrReturning, { once: true });
} else {
  eagerFetchVisibleOrReturning();
}

if (typeof window !== 'undefined') {
  window.initPostCardMetadata = initPostCardMetadata;
}

})();
