const { chromium } = require('/Users/przemek/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://localhost:2369/', { waitUntil:'networkidle', timeout:40000 });
  await page.waitForFunction(()=>!!window.particleSystem?.loop?.particles,{timeout:30000});
  await page.waitForTimeout(2000);

  let y = 0;
  const step = 80;
  const target = 1672;
  while (y < target) {
    y = Math.min(target, y + step);
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(500);

  const d = await page.evaluate(() => {
    const loop = window.particleSystem.loop;
    const dir = window.particleScrollDirector;
    const sameRef = loop.scrollDirector === dir;
    let manualCallError = null;
    const beforeY = loop.particles.position.y;
    try { dir.apply(loop); } catch (e) { manualCallError = e.message; }
    const afterY = loop.particles.position.y;
    return { sameRef, beforeY, afterY, manualCallError, hasScrollDirectorProp: 'scrollDirector' in loop };
  });
  console.log(JSON.stringify(d, null, 2));
  console.log('page errors:', JSON.stringify(errs));
  await b.close();
})();
