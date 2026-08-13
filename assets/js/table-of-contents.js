(function() { 'use strict';

function initTableOfContents() {
  const tocContainer = document.querySelector('.post-toc-list');
  const tocNav = document.querySelector('.post-toc-nav');
  const contentArea = document.querySelector('.gh-content');

  if (!tocContainer || !contentArea) {
    return;
  }

  function generateSlug(text) {
    return 'toc-' + text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function createControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'post-toc-controls';

    const themeIcon = document.querySelector('.theme-icon-sun');
    let versionParam = '';
    if (themeIcon && themeIcon.src) {
      const match = themeIcon.src.match(/\?v=[^&]+/);
      if (match) versionParam = match[0];
    }

    const prevBtn = document.createElement('button');
    prevBtn.className = 'post-toc-nav-btn post-toc-nav-prev';
    prevBtn.setAttribute('aria-label', 'Previous project');
    prevBtn.style.display = 'flex';
    prevBtn.style.visibility = 'visible';
    prevBtn.style.opacity = '1';

    const prevImg = document.createElement('img');
    prevImg.src = '/assets/icons/arrow-left.svg' + versionParam;
    prevImg.alt = 'Previous';
    prevBtn.appendChild(prevImg);

    const prevTooltip = document.createElement('span');
    prevTooltip.className = 'post-toc-tooltip';
    prevTooltip.textContent = 'Previous project';
    prevBtn.appendChild(prevTooltip);

    try {
      prevBtn.addEventListener('click', async () => {
      const article = document.querySelector('article.post');
      const currentId = article ? article.getAttribute('data-post-id') : null;
      const tagsStr = article ? article.getAttribute('data-post-tags') : null;

      if (currentId && tagsStr) {
        const tags = tagsStr
          .split(',')
          .map(t => t.trim())
          .filter(t => t && !t.startsWith('hash-'));

        const tagSlug = tags.length > 0 ? tags[0] : null;

        if (!tagSlug) {
          const prevLink = document.querySelector('a.post-nav-prev');
          if (prevLink && prevLink.offsetParent !== null) {
            prevLink.click();
          }
          return;
        }

        try {
          const posts = await window.fetchPostsByTag(tagSlug);

          const currentIndex = posts.findIndex(p => p.id === currentId);
          if (currentIndex >= 0) {
            const prevIndex = currentIndex === 0 ? posts.length - 1 : currentIndex - 1;
            window.location.href = posts[prevIndex].url;
          }
        } catch (e) {
          //
        }
      } else {
        const prevLink = document.querySelector('a.post-nav-prev');
        if (prevLink && prevLink.offsetParent !== null) {
          prevLink.click();
        }
      }
      });
    } catch (e) {
      console.error('Error setting up prev button listener:', e);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'post-toc-nav-btn post-toc-nav-next';
    nextBtn.setAttribute('aria-label', 'Next project');
    nextBtn.style.display = 'flex';
    nextBtn.style.visibility = 'visible';
    nextBtn.style.opacity = '1';

    const nextImg = document.createElement('img');
    nextImg.src = '/assets/icons/arrow-right.svg' + versionParam;
    nextImg.alt = 'Next';
    nextBtn.appendChild(nextImg);

    const nextTooltip = document.createElement('span');
    nextTooltip.className = 'post-toc-tooltip';
    nextTooltip.textContent = 'Next project';
    nextBtn.appendChild(nextTooltip);

    try {
      nextBtn.addEventListener('click', async () => {
      const article = document.querySelector('article.post');
      const currentId = article ? article.getAttribute('data-post-id') : null;
      const tagsStr = article ? article.getAttribute('data-post-tags') : null;

      if (currentId && tagsStr) {
        const tags = tagsStr
          .split(',')
          .map(t => t.trim())
          .filter(t => t && !t.startsWith('hash-'));

        const tagSlug = tags.length > 0 ? tags[0] : null;

        if (!tagSlug) {
          const nextLink = document.querySelector('a.post-nav-next');
          if (nextLink && nextLink.offsetParent !== null) {
            nextLink.click();
          }
          return;
        }

        try {
          const posts = await window.fetchPostsByTag(tagSlug);

          const currentIndex = posts.findIndex(p => p.id === currentId);
          if (currentIndex >= 0) {
            const nextIndex = currentIndex === posts.length - 1 ? 0 : currentIndex + 1;
            window.location.href = posts[nextIndex].url;
          }
        } catch (e) {
          //
        }
      } else {
        const nextLink = document.querySelector('a.post-nav-next');
        if (nextLink && nextLink.offsetParent !== null) {
          nextLink.click();
        }
      }
      });
    } catch (e) {
      console.error('Error setting up next button listener:', e);
    }

    controlsDiv.appendChild(prevBtn);
    controlsDiv.appendChild(nextBtn);

    return controlsDiv;
  }

  function addStartItem() {
    const startLi = document.createElement('li');
    startLi.className = 'post-toc-item post-toc-item-start';

    const startLink = document.createElement('a');
    startLink.href = '#start';
    startLink.className = 'post-toc-link';
    startLink.textContent = 'Start';

    startLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateActiveHeader(null);
    });

    startLi.appendChild(startLink);
    tocContainer.appendChild(startLi);
  }

  const controls = createControls();
  const controlsLi = document.createElement('li');
  controlsLi.className = 'post-toc-controls-item';
  controlsLi.appendChild(controls);
  tocContainer.appendChild(controlsLi);

  addStartItem();

  const headers = contentArea.querySelectorAll('h2');
  if (headers.length === 0) {
    const testLi = document.createElement('li');
    testLi.className = 'post-toc-item';
    const testLink = document.createElement('a');
    testLink.href = '#';
    testLink.className = 'post-toc-link';
    testLink.textContent = 'Test';
    testLi.appendChild(testLink);
    tocContainer.appendChild(testLi);

    const testLi2 = document.createElement('li');
    testLi2.className = 'post-toc-item post-toc-item--h3';
    const testLink2 = document.createElement('a');
    testLink2.href = '#';
    testLink2.className = 'post-toc-link';
    testLink2.textContent = 'Sub';
    testLi2.appendChild(testLink2);
    tocContainer.appendChild(testLi2);
    return;
  }

  headers.forEach(header => {
    if (!header.id) {
      header.id = generateSlug(header.textContent);
    }

    const li = document.createElement('li');
    li.className = 'post-toc-item';

    const link = document.createElement('a');
    link.href = `#${header.id}`;
    link.className = 'post-toc-link';
    link.textContent = header.textContent;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      header.scrollIntoView({ behavior: 'smooth' });
      updateActiveHeader(header);
    });

    li.appendChild(link);
    tocContainer.appendChild(li);
  });

  function trackScrollPosition() {
    const scrollTop = window.scrollY;

    if (scrollTop < 100) {
      updateActiveHeader(null);
    }
  }

  const observerOptions = {
    rootMargin: '-100px 0px -66% 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        updateActiveHeader(entry.target);
      }
    });
  }, observerOptions);

  headers.forEach(header => observer.observe(header));

  document.addEventListener('scroll', trackScrollPosition, { passive: true });

  function updateActiveHeader(activeHeader) {
    document.querySelectorAll('.post-toc-item--active').forEach(item => {
      item.classList.remove('post-toc-item--active');
    });

    if (activeHeader === null) {
      const startItem = tocContainer.querySelector('.post-toc-item-start');
      if (startItem) {
        startItem.classList.add('post-toc-item--active');
      }
    } else {
      const activeItem = tocContainer.querySelector(
        `a[href="#${activeHeader.id}"]`
      )?.closest('.post-toc-item');

      if (activeItem) {
        activeItem.classList.add('post-toc-item--active');
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.initTableOfContents = initTableOfContents;
}

})();
