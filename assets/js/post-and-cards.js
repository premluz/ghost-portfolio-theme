(function() { 'use strict';

function initPostCardMetadata() {
  const postCards = document.querySelectorAll('.post-card');
  if (postCards.length === 0) return;

  if (!window.projectMetaArray) {
    window.projectMetaArray = [];
  }

  let loadedCount = 0;
  const totalCards = postCards.length;

  postCards.forEach(card => {
    const link = card.querySelector('.post-card-link');
    const postUrl = link?.getAttribute('href');

    if (!postUrl) {
      loadedCount++;
      if (loadedCount === totalCards) {
        reInitializeCardAnimations();
      }
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
          loadedCount++;
          if (loadedCount === totalCards) {
            reInitializeCardAnimations();
          }
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
              imageEl.innerHTML = `
                <video muted loop playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);">
                  <source src="/content/images/videos/${meta.video}" type="video/mp4">
                </video>
              `;
              const video = imageEl.querySelector('video');
              if (video) {
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
            }
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

          loadedCount++;
          if (loadedCount === totalCards) {
            reInitializeCardAnimations();
          }
        } catch (e) {
          loadedCount++;
          if (loadedCount === totalCards) {
            reInitializeCardAnimations();
          }
        }
      })
      .catch(err => {
        loadedCount++;
        if (loadedCount === totalCards) {
          reInitializeCardAnimations();
        }
      });
  });

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

if (typeof window !== 'undefined') {
  window.initPostCardMetadata = initPostCardMetadata;
}

})();
