const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  // freeze RIGHT after DOMContentLoaded, before boot()'s rAFs can run
  const r = await p.evaluate(()=>{
    const t = document.getElementById('preloader-text');
    return {cls: t.className, op: getComputedStyle(t).opacity, transition: getComputedStyle(t).transition};
  });
  console.log('immediately after DOMContentLoaded:', JSON.stringify(r));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
