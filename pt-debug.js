const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  p.on('console', m => { const t = m.text(); if (/pt-debug|landing-anim/.test(t)) logs.push(t.slice(0, 130)); });
  p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 130)));
  await p.addInitScript(() => localStorage.setItem('preloader_seen', '1'));
  await p.goto('http://localhost:2369/', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  console.log(logs.join('\n') || '(nothing captured)');
  console.log('script tags:', await p.evaluate(() => [...document.querySelectorAll('script[src*="page-transition"]')].length));
  await b.close();
})();
