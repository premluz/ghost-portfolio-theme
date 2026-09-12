const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  const r1 = await p.evaluate(()=>({
    scrimExists: !!document.getElementById('particles-load-scrim'),
    textExists: !!document.getElementById('preloader-text'),
    preloaderRunning: window.__preloaderRunning,
  }));
  console.log('at domcontentloaded:', JSON.stringify(r1));
  await p.waitForTimeout(500);
  const r2 = await p.evaluate(()=>({
    scrimExists: !!document.getElementById('particles-load-scrim'),
    textOpacity: getComputedStyle(document.getElementById('preloader-text')).opacity,
  }));
  console.log('+500ms:', JSON.stringify(r2));
  await p.waitForTimeout(1500);
  const r3 = await p.evaluate(()=>({
    done: !!window.__preloaderDoneFired,
    preloaderDisplay: getComputedStyle(document.getElementById('preloader')).display,
    scrimOpacity: document.getElementById('particles-load-scrim') ? getComputedStyle(document.getElementById('particles-load-scrim')).opacity : 'GONE',
  }));
  console.log('+2000ms:', JSON.stringify(r3));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
