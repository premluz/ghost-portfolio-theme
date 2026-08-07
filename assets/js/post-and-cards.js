(function() { 'use strict';

// Shared scroll-direction tracking for initCardContentReveal below — same
// isScrollingDown pattern card-scroll-reveal.js uses for its own image/card
// observers, one listener for every card instead of one per card.
let __cardRevealScrollingDown = true;
let __cardRevealLastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  __cardRevealScrollingDown = window.scrollY > __cardRevealLastScrollY;
  __cardRevealLastScrollY = window.scrollY;
}, { passive: true });

// Registry of every card processed by initCardContentReveal below, used by
// window.__cardContentRevealBackfill (see bottom of this function) to
// force-reveal title/bullets/keywords that a curtain-return's instant
// scroll jump carried past before their IntersectionObserver ever fired —
// the same problem card-scroll-reveal.js's own window.__revealBackfill
// solves for images/cards, but this file's title/bullets/keywords reveal is
// a separate system with its own state, so it needs its own registry.
const __cardContentRegistry = [];

// Upper bound on how long a *cache-served* video can take to reach its first
// decodable frame. A cache hit needs no network round trip and resolves in
// single-digit ms; anything slower means real fetching, which is what the
// reveal animation exists to cover. Used to decide instant-vs-fade for card
// videos (see applyCardMeta) — the readyState probe that used to make that
// call could never fire, see the comment at its call site.
const CACHED_VIDEO_MS = 150;

// Read directly (not a flag set by page-transition.js) because this script
// loads BEFORE page-transition.js (default.hbs) and its eager metadata fetch
// below can resolve synchronously, from the sessionStorage cache, on the very
// same DOMContentLoaded tick — before page-transition.js's own handler would
// even run. A cross-script flag set inside runCurtainEntrance() would lose
// that race for exactly the common case this exists to speed up. Reading the
// same sessionStorage key directly, at module load (this script runs first),
// sidesteps the ordering problem entirely — page-transition.js only clears
// the key later, well after this has already captured it.
const IS_CURTAIN_RETURN = (() => {
  try { return sessionStorage.getItem('curtainReturn') === '1'; } catch (e) { return false; }
})();

// On-scroll reveal for a card's text content (title/bullets/keywords/
// testimonial), called once from applyCardMeta after the real text is in
// place — title and bullets can't be pre-split/pre-hidden at page load like
// a normal heading, since post-and-cards.js's own textContent assignments
// above would wipe out any word-split spans made before the real text
// arrived (same class of bug as the video/image and quote-mark races
// elsewhere in this file). Testimonial + endorser are plain opacity fades,
// same as the keyword pills — no slide/scale, no dependency on the shared
// card-scroll-reveal.js system (that one added a race: window.observeCardReveal
// only exists once main.js's initCardScrollReveal() runs, behind an await
// chain, so on a curtain-return — where <main> fades back in within ~0.18s,
// far sooner than that — the text used to flash fully visible first).
// Everything here is one self-contained observer instead.
function initCardContentReveal(card) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const titleEl = card.querySelector('.post-card-title');
  const bulletsEl = card.querySelector('.post-card-bullets');
  const bulletItems = bulletsEl ? Array.from(bulletsEl.children) : [];
  const keywordsEl = card.querySelector('.post-card-keywords');
  const keywordItems = keywordsEl ? Array.from(keywordsEl.children) : [];
  const testimonialEl = card.querySelector('.post-card-testimonial');
  const endorserEl = card.querySelector('.post-card-endorser');
  const testimonialItems = [testimonialEl, endorserEl].filter(el => el && el.textContent.trim());

  if (!window.gsap || prefersReducedMotion) return; // title/bullets/keywords/testimonial stay at their normal CSS state — nothing to reveal

  const headingCfg = window.HEADING_ANIM_CONFIG && window.HEADING_ANIM_CONFIG.word;
  const hasSplitType = typeof SplitType !== 'undefined';
  let titleSplit = null;

  if (titleEl && titleEl.textContent.trim() && headingCfg) {
    if (hasSplitType) {
      // tagName: 'span' (not SplitType's block-level default) — keeps
      // words inline so normal word-spacing survives, same reasoning as
      // heading-animations.js's own word-split.
      titleSplit = new SplitType(titleEl, { types: 'words', tagName: 'span' });
    }
    if (titleSplit && titleSplit.words && titleSplit.words.length > 0) {
      gsap.set(titleSplit.words, { opacity: 0, y: headingCfg.yOffset });
    } else {
      titleSplit = null;
      gsap.set(titleEl, { opacity: 0 });
    }
  }

  if (bulletItems.length > 0) {
    gsap.set(bulletItems, { opacity: 0, y: 12 });
  }

  if (keywordItems.length > 0) {
    gsap.set(keywordItems, { opacity: 0 });
  }

  if (testimonialItems.length > 0) {
    gsap.set(testimonialItems, { opacity: 0 });
  }

  if (!titleSplit && !titleEl && bulletItems.length === 0 && keywordItems.length === 0 && testimonialItems.length === 0) return; // nothing left to reveal

  // One-time, not repeatable: plays once when the card first scrolls down
  // into view, then unobserves — it used to also reverse every time the
  // card scrolled back up out of view (same isInBottomHalf +
  // isScrollingDown convention card-scroll-reveal.js's own image/card
  // observers use), which read as the whole card "fading out" while
  // scrolling back toward the top of the page. Fine for decorative
  // scroll-linked elements (testimonials, about-cards); wrong for work-
  // grid cards, which should just stay revealed once shown — same call
  // already made for the outer .post-card-content/.post-card-image wrapper
  // in card-scroll-reveal.js. state.revealed (not a plain local var) so
  // window.__cardContentRevealBackfill below can read/flip it from outside
  // this closure.
  const state = { revealed: false };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const rect = entry.boundingClientRect;
      const elementCenter = rect.top + rect.height / 2;
      const isInBottomHalf = elementCenter > window.innerHeight / 2;

      if (entry.isIntersecting) {
        if (!__cardRevealScrollingDown || !isInBottomHalf || state.revealed) return;
        state.revealed = true;

        if (titleSplit) {
          gsap.to(titleSplit.words, {
            opacity: 1,
            y: 0,
            duration: headingCfg.duration,
            stagger: headingCfg.stagger,
            ease: headingCfg.ease,
          });
        } else if (titleEl) {
          gsap.to(titleEl, { opacity: 1, duration: 0.6, ease: 'power2.out' });
        }

        if (bulletItems.length > 0) {
          gsap.to(bulletItems, {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.08,
            ease: 'power2.out',
            delay: 0.1, // lets the title lead in slightly before bullets follow
          });
        }

        if (keywordItems.length > 0) {
          gsap.to(keywordItems, {
            opacity: 1,
            duration: 0.35,
            stagger: 0.06,
            ease: 'power2.out',
            delay: 0.15, // trails bullets slightly, same lead-in convention
          });
        }

        if (testimonialItems.length > 0) {
          gsap.to(testimonialItems, {
            opacity: 1,
            duration: 0.35,
            stagger: 0.08,
            ease: 'power2.out',
            delay: 0.2, // trails keywords slightly, same lead-in convention
          });
        }

        // Reveal once, done — no reverse-on-scroll-up branch anymore (was
        // here, mirroring the entry animation with opacity:0 tweens; see
        // the comment above this observer). Unobserving is what actually
        // guarantees it can't fire again, not just skipping it here.
        observer.unobserve(card);
      }
    });
  // Top margin (-360px): fires the scroll-up exit/reverse well before the
  // card is fully gone, rather than waiting until it completely clears the
  // viewport (started at -100px, then +20% / +50% / +100% across follow-up
  // requests). Only affects the exit edge in practice; entry always
  // happens from the bottom, governed by the bottom margin below.
  }, { threshold: 0.25, rootMargin: '-360px 0px -120px 0px' });

  observer.observe(card);

  __cardContentRegistry.push({ card, titleSplit, titleEl, bulletItems, keywordItems, testimonialItems, headingCfg, state });
}

// Force-reveal counterpart to card-scroll-reveal.js's window.__revealBackfill,
// for THIS file's separate title/bullets/keywords reveal system (that
// registry only tracks images/cards registered via observeCardReveal, not
// these). Called from page-transition.js's runCurtainEntrance alongside the
// existing window.__revealBackfill(), same "instant if above the restored
// viewport, animated if currently on-screen" logic and limit/viewportTop math.
window.__cardContentRevealBackfill = (maxDocY) => {
  const limit = (typeof maxDocY === 'number' ? maxDocY : window.scrollY + window.innerHeight) - 40;
  const viewportTop = window.scrollY;
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  let count = 0;
  console.log('[cardContentRevealBackfill] registry size:', __cardContentRegistry.length, 'limit:', limit, 'viewportTop:', viewportTop);
  __cardContentRegistry.forEach((entry) => {
    if (entry.state.revealed || docTop(entry.card) >= limit) return;
    entry.state.revealed = true;
    const method = docTop(entry.card) >= viewportTop ? 'to' : 'set';

    if (entry.titleSplit) {
      gsap[method](entry.titleSplit.words, { opacity: 1, y: 0, ...(method === 'to' ? { duration: entry.headingCfg.duration, stagger: entry.headingCfg.stagger, ease: entry.headingCfg.ease } : {}) });
    } else if (entry.titleEl) {
      gsap[method](entry.titleEl, { opacity: 1, ...(method === 'to' ? { duration: 0.6, ease: 'power2.out' } : {}) });
    }

    if (entry.bulletItems.length > 0) {
      gsap[method](entry.bulletItems, { opacity: 1, y: 0, ...(method === 'to' ? { duration: 0.4, stagger: 0.08, ease: 'power2.out' } : {}) });
    }

    if (entry.keywordItems.length > 0) {
      gsap[method](entry.keywordItems, { opacity: 1, ...(method === 'to' ? { duration: 0.35, stagger: 0.06, ease: 'power2.out' } : {}) });
    }

    if (entry.testimonialItems.length > 0) {
      gsap[method](entry.testimonialItems, { opacity: 1, ...(method === 'to' ? { duration: 0.35, stagger: 0.08, ease: 'power2.out' } : {}) });
    }

    count++;
  });
  return count;
};

// Used to wire a "reverse on scroll up, re-reveal on scroll back down"
// toggle for a card's already-visible image/video (called once the media
// has completed its initial load-gated reveal — see showImageFallback /
// applyCardMeta's video fadeIn below — so there was never a "first reveal"
// here, only a repeatable hide/re-show). Now a no-op: that hide-on-scroll-
// up behavior read as the whole card fading out on the way back to the
// top of the page — fine for decorative elements, wrong for work-grid
// media, which should just stay visible once shown. Same call already
// made for initCardContentReveal's title/bullets/keywords/testimonial
// above and for the outer .post-card-content/.post-card-image wrapper in
// card-scroll-reveal.js. Kept as a no-op (not deleted) so its four call
// sites don't need touching.
function initCardMediaReveal() {}

// Hides the skeleton and shows whichever media element this card actually
// has — an <img> or a <video>, decided server-side (the #video internal
// tag, post-card.hbs), never both. Also the fallback endpoint for every
// path that can't resolve metadata at all (malformed data, fetch failure).
function showImageFallback(card) {
  const imageEl = card.querySelector('.post-card-image');
  if (!imageEl) return;
  const skeleton = imageEl.querySelector('.card-media-skeleton');
  if (skeleton) skeleton.classList.add('is-hidden');
  const media = imageEl.querySelector('img, video');
  if (!media) return;

  const cfg = window.SCROLL_REVEAL_CONFIG && window.SCROLL_REVEAL_CONFIG.image;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Shared by both media types — opacity + scale + blur/duration/ease,
  // matching card-scroll-reveal.js's SCROLL_REVEAL_CONFIG.image exactly
  // (same reveal a post detail page's in-content images use).
  const reveal = (instant) => {
    if (instant || !window.gsap || !cfg || prefersReducedMotion) {
      media.style.transition = 'none';
      media.classList.add('is-visible');
      if (window.gsap) gsap.set(media, { scale: 1, filter: 'none' });
      void media.offsetHeight; // flush the style before restoring the transition
      media.style.transition = '';
      initCardMediaReveal(card, media);
      return;
    }
    media.classList.add('is-visible'); // CSS fallback opacity, harmless once gsap drives the inline style
    // post-card-grid.css's own `transition: opacity 0.4s ease` would otherwise
    // fight this tween — it retriggers on every one of GSAP's per-frame inline
    // opacity updates, dragging/lagging GSAP's own easing instead of a single
    // clean curve. GSAP owns this exclusively for the duration of the tween;
    // restored after so any later, unrelated opacity change still transitions.
    media.style.transition = 'none';
    gsap.set(media, { opacity: 0, scale: cfg.scale.start, filter: `blur(${cfg.blur.start}px)` });
    gsap.to(media, {
      opacity: 1,
      scale: cfg.scale.end,
      filter: `blur(${cfg.blur.end}px)`,
      duration: cfg.duration,
      ease: cfg.ease,
      onComplete: () => { media.style.transition = ''; initCardMediaReveal(card, media); },
    });
  };

  if (media.tagName === 'VIDEO') {
    // Play/pause on scroll — independent of the reveal timing below, and
    // unconditional now (no longer gated behind a meta.video check, since
    // this element only exists in the DOM at all when the template already
    // decided this post has a video).
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => { entry.isIntersecting ? media.play() : media.pause(); });
    }, { threshold: 0.5 });
    videoObserver.observe(media);

    // A <video> has no synchronous "already decoded" signal the way
    // img.complete gives an <img> — load() resets readyState to
    // HAVE_NOTHING and resolves asynchronously, so a fully cached video
    // still reports 0 on the very next line. Timing the gap to
    // `loadeddata` against CACHED_VIDEO_MS is what actually distinguishes
    // a cache hit (a few ms) from a genuine fetch.
    const videoLoadStartedAt = performance.now();
    media.load();
    if (media.readyState >= 2) {
      reveal(true);
    } else {
      media.addEventListener('loadeddata', () => {
        reveal(IS_CURTAIN_RETURN || performance.now() - videoLoadStartedAt < CACHED_VIDEO_MS);
      }, { once: true });
    }
    return;
  }

  // <img> path: server-rendered with a src, so img.complete is already a
  // meaningful, synchronous signal — no load()/event wait needed. A
  // curtain return forces the instant path unconditionally either way:
  // you already saw this exact page once this session, so re-playing the
  // entrance fade on the way back reads as unwanted extra motion.
  reveal(IS_CURTAIN_RETURN || (media.complete && media.naturalWidth > 0));
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

    // Video vs image is decided server-side now (the #video internal tag,
    // post-card.hbs) — meta.video (codeinjection_head) is no longer read
    // here at all. showImageFallback reveals whichever element the
    // template actually rendered.
    showImageFallback(card);

    if (meta.cardId) {
      card.setAttribute('data-cardid', meta.cardId);
    }

    if (meta.accentColor) {
      card.style.setProperty('--card-accent-color', meta.accentColor);
    }

    if (meta.gradientCss) {
      card.setAttribute('data-gradient-css', meta.gradientCss);
      // Mirrored into a custom property (not just the attribute) so CSS can
      // read it directly — needed for the cinematic layout's gradient scrim
      // (.post-card-image::before, post-card-grid.css), which is a
      // pseudo-element and so can never receive an inline style from JS.
      // The server-side case (custom.gradientCss set at build time,
      // post-card.hbs) sets this same property inline on the <article> tag
      // itself — this keeps the async-fetched path in sync with it.
      card.style.setProperty('--card-gradient', meta.gradientCss);
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
        endorserEl.textContent = meta.projectEndorser;
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

    initCardContentReveal(card);

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
// invalidates every entry at once — for a stored-SHAPE change, or (this
// bump, 2026-08-06) for a stale-CONTENT one: iot-connectivity-platform and
// gala-defi's codeinjection_head both had a malformed field (a string
// missing its closing quote) that threw a SyntaxError on the whole
// metadata object, silently caught, leaving gradientCss/title/etc. never
// applied — fixed in Admin, but any tab that had already cached the BROKEN
// raw text under v1 kept serving it indefinitely (no cache ever expires on
// its own), which is exactly why the fix didn't visibly take until this
// bump. Confirmed live: a tab with no prior cache renders the correct
// colors immediately; the bug was the cache, not the extraction pipeline.
const CARD_META_CACHE_VERSION = 'v2';
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
  // Exposed so posts-tabs-grid.js can reuse the exact same title/keywords/
  // testimonial and image/video reveal-with-reverse system on .grid-card
  // (Lab grid) — its content elements are already dual-classed with
  // .post-card-title/.post-card-keywords/.post-card-testimonial/
  // .post-card-endorser for exactly this purpose, it just never called in.
  window.initCardContentReveal = initCardContentReveal;
  window.initCardMediaReveal = initCardMediaReveal;
}

})();
