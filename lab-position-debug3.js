const { chromium } = require('/Users/przemek/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:2369/', { waitUntil:'networkidle', timeout:40000 });
  await page.waitForFunction(()=>!!window.particleSystem?.loop?.particles,{timeout:30000});
  await page.waitForTimeout(2000);
  const d = await page.evaluate(() => {
    const dir = window.particleScrollDirector;
    return {
      timeline: dir.timeline,
      sampleAt0: dir._sample('position', 0),
      channelsHasPosition: dir._channels.has('position'),
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await b.close();
})();
