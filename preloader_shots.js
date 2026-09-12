const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const nav = p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  // capture a burst of screenshots right after navigation starts
  await p.waitForTimeout(1100);
  await p.screenshot({path:'pl-1100.png'});
  await p.waitForTimeout(200);
  await p.screenshot({path:'pl-1300.png'});
  await p.waitForTimeout(300);
  await p.screenshot({path:'pl-1600.png'});
  await p.waitForTimeout(500);
  await p.screenshot({path:'pl-2100.png'});
  await p.waitForTimeout(500);
  await p.screenshot({path:'pl-2600.png'});
  await nav;
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
