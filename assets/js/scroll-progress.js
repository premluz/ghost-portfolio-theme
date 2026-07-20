(function() { 'use strict';

function initScrollProgress() {
  const progressBar = document.querySelector('.scroll-progress');
  if (!progressBar) {
    return;
  }

  progressBar.style.opacity = '1';

  let _rafPending = false;
  document.addEventListener('scroll', () => {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = (window.scrollY / windowHeight) * 100;
      progressBar.style.width = scrolled + '%';
    });
  }, { passive: true });
}

if (typeof window !== 'undefined') {
  window.initScrollProgress = initScrollProgress;
}

})();
