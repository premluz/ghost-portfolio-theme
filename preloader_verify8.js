const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.addInitScript(()=>{
    window.__t0 = performance.now();
    window.__events = [];
    document.addEventListener('readystatechange', () => {
      window.__events.push({ms: Math.round(performance.now()-window.__t0), state: document.readyState,
        hasEl: !!document.getElementById('preloader-text')});
    });
  });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(500);
  console.log(JSON.stringify(await p.evaluate(()=>window.__events),null,2));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
