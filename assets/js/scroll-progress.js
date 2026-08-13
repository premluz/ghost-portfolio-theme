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
      // A page shorter than the viewport (contact, short posts) makes this 0,
      // and scrollY/0 is NaN or Infinity — `width: NaN%` is an invalid value
      // the browser discards, so the bar kept whatever width it last had.
      if (windowHeight <= 0) {
        if (progressBar.style.width !== '0%') progressBar.style.width = '0%';
        return;
      }
      // Clamped because scrollY goes out of bounds during rubber-band /
      // overscroll at both ends, which produced negative and >100% widths.
      const scrolled = Math.min(100, Math.max(0, (window.scrollY / windowHeight) * 100));
      // Write only on a real change. This runs every scroll frame and the
      // element carries `transition: width 0.1s linear` (main.css), so an
      // unchanged re-write still restarts a 100ms transition — including
      // while parked at the very top or bottom, where the value is pinned
      // by the clamp above but scroll events keep arriving.
      const next = scrolled.toFixed(2) + '%';
      if (progressBar.style.width !== next) progressBar.style.width = next;
    });
  }, { passive: true });
}

if (typeof window !== 'undefined') {
  window.initScrollProgress = initScrollProgress;
}

})();
