const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext()).newPage();
  const logs=[];
  p.on('console', m=>logs.push(m.text()));
  await p.addInitScript(()=>{ window.DEBUG_SCROLL = true; });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(5000);
  console.log(logs.filter(l=>/preloader/i.test(l)).slice(0,8).join('\n'));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
