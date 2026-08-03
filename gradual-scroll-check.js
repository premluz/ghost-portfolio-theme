const { chromium } = require('/Users/przemek/node_modules/playwright');
const S='/private/tmp/claude-501/-Users-przemek-ghostthemeportfolio-ghost-local/66aba004-4f84-4cb9-ae14-9e87a0d3ad2d/scratchpad/';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:2369/', { waitUntil:'networkidle', timeout:40000 });
  await page.waitForFunction(()=>!!window.particleSystem?.loop?.particles,{timeout:30000});
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const labSection = document.querySelector('#work-grid-lab');
    const wrapper = labSection.closest('.gradient-frame');
    return { wrapperTop: wrapper.getBoundingClientRect().top + window.scrollY };
  });
  const preTrigger = info.wrapperTop - 900 - 900*0.3 - 20;

  // Simulate real scrolling: many small incremental steps via mouse wheel,
  // not one instant jump.
  let y = 0;
  const step = 80;
  while (y < preTrigger + 60) {
    y = Math.min(preTrigger + 60, y + step);
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);

  const d = await page.evaluate(() => ({
    shape: window.particleSystem.loop.currentState?.id,
    nextShape: window.particleSystem.loop.nextState?.id,
    morphProgress: window.particleSystem.loop.morphProgress,
    posY: +window.particleSystem.loop.particles.position.y.toFixed(3),
    opacity: document.getElementById('particle-morph-demo')?.style.opacity,
    scrollY: window.scrollY,
  }));
  console.log('after gradual scroll to just past lab trigger:', JSON.stringify(d));
  await page.screenshot({ path: S+'gradual-lab.png' });
  await b.close();
})();
