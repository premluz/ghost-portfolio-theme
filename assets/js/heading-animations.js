(function() { 'use strict';

const HEADING_ANIM_CONFIG = {
  defaultBlur: 8,
  defaults: {
    h1: 'letter',
    h2: 'letter',
    h3: 'word',
    h4: 'fade',
  },
  letter: {
    // Back to the original duration/ease/fully-transparent hidden state —
    // those were never the problem. The overlap-via-longer-duration
    // attempt (0.3/'none'/opacity 0.1) made long headings slower than
    // before AND left a visible dim "ghost" of unrevealed text — both
    // regressions. The ACTUAL original bug was narrower: spreadMin/
    // spreadMax/(charCount-1) gave a big per-letter gap for SHORT text
    // (little to divide a similar-sized spread by) while already
    // shrinking to a tiny, fast gap for LONG text — that shrink was
    // correct and should stay. maxStagger below just caps the short-text
    // case; see computeLetterStagger().
    charDuration: 0.14,
    ease: 'power1.out',
    spreadMin: 0.10,
    spreadMax: 0.22,
    maxStagger: 0.025,
    blurDuration: 0.7,
  },
  word: {
    duration: 0.25,
    stagger: 0.015,
    ease: 'cubic-bezier(0.16, 0.84, 0.44, 1)',
    yOffset: 0,
  },
  fade: {
    duration: 0.6,
    ease: 'power2.out',
  },
  observer: {
    threshold: 0.25,
    rootMargin: '0px 0px -120px 0px',
  },
};

// Shrinks toward a tiny, fast gap as charCount grows (unchanged from the
// original — that part was already correct and fast for long headings),
// capped at maxStagger so short text can no longer produce the inflated
// gap that made a few letters crawl across the screen.
function computeLetterStagger(charCount) {
  const cfg = HEADING_ANIM_CONFIG.letter;
  const spread = cfg.spreadMax - ((charCount - 1) / 100) * (cfg.spreadMax - cfg.spreadMin);
  const rawStagger = spread / Math.max(1, charCount - 1);
  return Math.min(rawStagger, cfg.maxStagger);
}

function _revealHeadingByWord(heading, splitMap, wordTlMap, blurPx, unobserve) {
  const split = splitMap.get(heading);
  if (!split) {
    return;
  }

  const activeTl = wordTlMap.get(heading);
  if (activeTl) { activeTl.kill(); wordTlMap.delete(heading); }
  gsap.killTweensOf(heading);

  const cfg = HEADING_ANIM_CONFIG.word;
  heading.style.willChange = 'opacity, transform, filter';

  if (split.fallback || !split.words) {
    gsap.to(heading, {
      opacity: 1,
      filter: 'blur(0px)',
      duration: cfg.duration,
      ease: cfg.ease,
      onComplete: () => {
        heading.style.willChange = 'auto';
      },
    });
  } else {
    gsap.set(heading, { opacity: 1 });

    if (blurPx > 0) {
      gsap.to(heading, {
        filter: 'blur(0px)',
        duration: cfg.duration * 0.8,
        ease: 'power2.out',
      });
    }

    const revealTl = gsap.timeline({
      onComplete: () => {
        wordTlMap.delete(heading);
        gsap.set(split.words, { clearProps: 'transform' });
        heading.style.willChange = 'auto';
      },
    });
    revealTl.to(split.words, {
      opacity: 1,
      y: 0,
      duration: cfg.duration,
      stagger: cfg.stagger,
      ease: cfg.ease,
    });
    wordTlMap.set(heading, revealTl);
  }
}

function _revealHeadingByLetter(heading, blurPx, unobserve) {
  // Split ONCE (data-letters-split, not data-letters-animated) — the old
  // guard used "already finished animating" to mean "don't re-split",
  // which also — incorrectly — blocked the OPACITY TWEEN from
  // restarting: resetHeading() only flips that flag back in its
  // onComplete, so while a hide tween was still mid-flight (now slower,
  // since long headings can take a while), a reveal triggered by
  // scrolling back down found the flag still "true" and returned before
  // doing anything — the hide just kept playing to completion regardless
  // of the new scroll direction. Splitting once and reusing the same
  // spans afterward means a reveal call can always kill whatever's
  // running on them and take over immediately, from wherever they
  // currently are.
  let letters;
  if (heading.dataset.lettersSplit === 'true') {
    letters = Array.from(heading.querySelectorAll('.char'));
  } else {
    if (!heading.textContent || !heading.textContent.trim()) return;

    // Walk child nodes instead of flattening to textContent — textContent
    // ignores element boundaries entirely, concatenating every text node
    // together with no trace of a <br> that sat between them. A literal
    // <br> in the source (e.g. posts-tabs.hbs's statement-heading) used to
    // just vanish the first time this ran, since the old code read
    // heading.textContent (br-blind), wiped innerHTML, and rebuilt purely
    // from that flattened string. Preserving actual <br> elements as we
    // rebuild keeps the line breaks intact through the character split.
    const originalNodes = Array.from(heading.childNodes);
    heading.innerHTML = '';
    letters = [];
    originalNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        heading.appendChild(document.createElement('br'));
        return;
      }
      for (const char of node.textContent || '') {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = char;
        heading.appendChild(span);
        letters.push(span);
      }
    });
    heading.dataset.lettersSplit = 'true';
    gsap.set(letters, { opacity: 0 });
  }

  // Interrupt whatever's currently running (e.g. an in-progress hide) so
  // the reveal takes over immediately instead of racing it.
  gsap.killTweensOf(letters);
  gsap.killTweensOf(heading);

  heading.style.willChange = 'opacity, filter';
  gsap.set(heading, { opacity: 1 });

  const cfg = HEADING_ANIM_CONFIG.letter;
  const stagger = computeLetterStagger(letters.length);

  const tl = gsap.timeline({
    onComplete: () => {
      heading.style.willChange = 'auto';
    }
  });

  if (blurPx > 0) {
    const blurDur = cfg.blurDuration;
    tl.to(heading, { filter: 'blur(0px)', duration: blurDur, ease: 'power2.out' }, 0);
  }

  tl.to(letters, {
    opacity: 1,
    duration: cfg.charDuration,
    ease: cfg.ease,
    stagger: stagger,
  }, 0);
}

function _revealHeadingFade(heading, blurPx, unobserve) {
  const cfg = HEADING_ANIM_CONFIG.fade;
  heading.style.willChange = 'opacity, filter';

  gsap.to(heading, {
    opacity: 1,
    filter: 'blur(0px)',
    duration: cfg.duration,
    ease: cfg.ease,
    onComplete: () => { heading.style.willChange = 'auto'; },
  });
}

function initHeadingAnimations() {
  if (typeof gsap === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const headings = document.querySelectorAll('h1, h2, h3, h4');

  // OPT-IN ONLY: Only animate headings that explicitly have data-animate attribute.
  // This prevents automatic animation of all headings by default.
  const candidates = Array.from(headings).filter(el => {
    // REQUIRED: Must have data-animate attribute to be animated
    if (!el.dataset.animate) return false;

    // Another system already claimed this heading (e.g. scroll-scrub-anim.js's
    // initProfile(), which hand-splits .profile-headline into .char letter
    // spans itself and sets this flag for exactly this reason) — processing
    // it again here ran SplitType's word-split on top of the already-split
    // DOM, nesting a single-letter .word span inside every existing .char
    // span (each now its own isolated text node, so SplitType's word
    // detection had nothing but single characters to group). That's what
    // caused "no spaces between words" on the profile headline.
    if (el.dataset.headingAnimDone === 'true') return false;

    // Exclusions for special contexts (even if data-animate is present)
    if (el.closest('.hero')) return false;
    if (el.closest('.post-header')) return false;
    if (el.closest('.page-header')) return false;
    if (el.closest('.preloader')) return false;
    if (el.closest('.gh-navigation')) return false;
    if (el.closest('[data-skip-reveal]')) return false;
    if (el.classList.contains('preloader-heading') ||
        el.classList.contains('preloader-greeting') ||
        el.classList.contains('preloader-welcome')) return false;
    if (el.classList.contains('post-card-title')) return false;
    if (el.dataset.skipAnimation === 'true') return false;
    if (el.closest('.om3-header-slot')) return false;
    if (el.closest('.profile-item')) return false;
    if (el.closest('.about-card')) return false;
    if (el.closest('.personal-card')) return false;
    if (el.closest('.testimonial-card')) return false;
    return true;
  });

  if (candidates.length === 0) return;

  const cfg = HEADING_ANIM_CONFIG;
  const hasSplitType = typeof SplitType !== 'undefined';

  function resolveMode(el) {
    const override = el.dataset.animate;
    if (override === 'letter') return 'letter';
    if (override === 'word')   return 'word';
    if (override === 'fade')   return 'fade';
    const tag = el.tagName.toLowerCase();
    return cfg.defaults[tag] || 'fade';
  }

  function resolveBlur(heading) {
    const attr = heading.dataset.blur;
    if (attr !== undefined) return parseFloat(attr) || 0;
    return cfg.defaultBlur;
  }

  const splitMap = new Map();
  const wordTlMap = new Map();

  candidates.forEach(heading => {
    const mode  = resolveMode(heading);
    const blurPx = resolveBlur(heading);

    // Mark element so scroll-scrub-anim.js knows heading-animations owns it
    heading.dataset.headingAnimDone = 'true';

    if (mode === 'letter') {
      gsap.set(heading, {
        opacity: 0,
        filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
      });
    } else if (mode === 'word') {
      if (hasSplitType) {
        // tagName: 'span' — SplitType's default is 'div' (block-level),
        // which wraps each word in its own block and drops the natural
        // space between words (they render stacked/touching). span keeps
        // words inline so normal word-spacing is preserved.
        const split = new SplitType(heading, { types: 'words', tagName: 'span' });
        if (!split || !split.words || split.words.length === 0) {
          splitMap.set(heading, { fallback: true });
          gsap.set(heading, {
            opacity: 0,
            filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
          });
        } else {
          splitMap.set(heading, split);
          gsap.set(split.words, { opacity: 0, y: cfg.word.yOffset, clearProps: 'transform' });
          gsap.set(heading, {
            opacity: 0,
            filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
          });
        }
      } else {
        splitMap.set(heading, { fallback: true });
        gsap.set(heading, {
          opacity: 0,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
        });
      }
    } else {
      gsap.set(heading, {
        opacity: 0,
      });
    }
  });

  function resetHeading(heading, mode, blurPx, wordTlMap) {
    gsap.killTweensOf(heading);

    if (mode === 'letter') {
      const chars = heading.querySelectorAll('.char');
      gsap.killTweensOf(chars);

      const cfg = HEADING_ANIM_CONFIG.letter;
      const stagger = computeLetterStagger(chars.length);

      if (blurPx > 0) {
        gsap.to(heading, {
          filter: `blur(${blurPx}px)`,
          duration: cfg.blurDuration,
          ease: 'power2.in',
        });
      }

      // No onComplete flag flip anymore — data-letters-split (set once,
      // in _revealHeadingByLetter) is what gates re-splitting now, and it
      // deliberately never resets, so a reveal triggered mid-hide can
      // always interrupt this tween and take over (see that function's
      // comment).
      gsap.to(chars, {
        opacity: 0,
        duration: cfg.charDuration,
        ease: cfg.ease,
        stagger: -stagger,
      });
    } else if (mode === 'word') {
      const split = splitMap.get(heading);

      if (split && split.words && !split.fallback) {
        const activeTl = wordTlMap.get(heading);
        if (activeTl) { activeTl.kill(); wordTlMap.delete(heading); }
        gsap.killTweensOf(heading);

        const cfg = HEADING_ANIM_CONFIG.word;

        if (blurPx > 0) {
          gsap.to(heading, {
            filter: `blur(${blurPx}px)`,
            duration: cfg.duration,
            ease: 'power2.in',
          });
        }

        const reverseTl = gsap.timeline({
          onComplete: () => {
            wordTlMap.delete(heading);
            gsap.set(split.words, { opacity: 0, clearProps: 'transform' });
            gsap.set(heading, {
              opacity: 0,
              filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
            });
          },
        });
        reverseTl.to(split.words, {
          opacity: 0,
          y: cfg.yOffset,
          duration: cfg.duration,
          stagger: -cfg.stagger,
          ease: cfg.ease,
        });
        wordTlMap.set(heading, reverseTl);
      } else {
        const cfg = HEADING_ANIM_CONFIG.fade;
        gsap.to(heading, {
          opacity: 0,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
          duration: cfg.duration,
          ease: cfg.ease,
        });
      }
    } else {
      const cfg = HEADING_ANIM_CONFIG.fade;
      gsap.to(heading, {
        opacity: 0,
        filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
        duration: cfg.duration,
        ease: 'power2.in',
      });
    }
  }

  let lastScrollY = window.scrollY;
  let isScrollingDown = true;
  let hasScrolled = false;

  const scrollListener = () => {
    const currentScrollY = window.scrollY;
    isScrollingDown = currentScrollY > lastScrollY;
    lastScrollY = currentScrollY;
    hasScrolled = true;
  };

  window.addEventListener('scroll', scrollListener, { passive: true });

  const revealedHeadings = new WeakSet();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const heading  = entry.target;
      const mode     = resolveMode(heading);
      const blurPx   = resolveBlur(heading);
      const noop = () => {};

      const rect = heading.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const isInBottomHalf = elementCenter > viewportCenter;
      const isRevealed = revealedHeadings.has(heading);
      // Already visible at page load — reveal immediately without scroll guards
      const isInitialReveal = !hasScrolled && entry.isIntersecting;

      if (entry.isIntersecting) {
        if ((isInitialReveal || (isScrollingDown && isInBottomHalf)) && !isRevealed) {
          if (mode === 'letter') {
            _revealHeadingByLetter(heading, blurPx, noop);
          } else if (mode === 'word') {
            _revealHeadingByWord(heading, splitMap, wordTlMap, blurPx, noop);
          } else {
            _revealHeadingFade(heading, blurPx, noop);
          }
          revealedHeadings.add(heading);
        }
      } else {
        if (!isScrollingDown && isRevealed) {
          resetHeading(heading, mode, blurPx, wordTlMap);
          revealedHeadings.delete(heading);
        }
      }
    });
  }, {
    threshold: cfg.observer.threshold,
    rootMargin: cfg.observer.rootMargin,
  });

  candidates.forEach(h => observer.observe(h));
}

if (typeof window !== 'undefined') {
  window.initHeadingAnimations = initHeadingAnimations;
  window.HEADING_ANIM_CONFIG = HEADING_ANIM_CONFIG;
  window._revealHeadingByLetter = _revealHeadingByLetter;
  window.computeLetterStagger = computeLetterStagger;
}

})();
