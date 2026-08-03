const { chromium } = require('/Users/przemek/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.waitForTimeout(1000);

  const d = await page.evaluate(() => {
    const dir = window.particleScrollDirector;
    return {
      heroOffsetActive: window.particleSystem.loop._heroOffsetActive,
      heroT: window.particleSystem.loop._heroT,
      dirEnabled: dir.enabled,
      dirElement: dir.element ? (dir.element.className || dir.element.id) : null,
      dirChannels: [...dir._channels],
      dirProgress: dir.progress(),
      posY: window.particleSystem.loop.particles.position.y,
      scrollY: window.scrollY,
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await b.close();
})();
