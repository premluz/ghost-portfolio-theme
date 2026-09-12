const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  const logs=[];
  p.on('console', m => logs.push(m.text()));
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(2500);
  console.log(logs.filter(l=>l.includes('preloader')).join('\n'));
  const state = await p.evaluate(()=>{
    const t = document.getElementById('preloader-text');
    return {exists: !!t, cls: t?t.className:'', op: t?getComputedStyle(t).opacity:'-'};
  });
  console.log('final state:', JSON.stringify(state));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
