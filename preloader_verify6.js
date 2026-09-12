const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(2500);
  const state = await p.evaluate(()=>{
    const t = document.getElementById('preloader-text');
    const pre = document.getElementById('preloader');
    return {
      textCls: t?t.className:'-', textOp: t?getComputedStyle(t).opacity:'-',
      preDisplay: pre?getComputedStyle(pre).display:'-',
      done: !!window.__preloaderDoneFired,
    };
  });
  console.log(JSON.stringify(state,null,2));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
