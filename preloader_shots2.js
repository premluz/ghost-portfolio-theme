const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const nav = p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(3000);
  await p.screenshot({path:'pl-3000.png'});
  await p.waitForTimeout(500);
  await p.screenshot({path:'pl-3500.png'});
  await nav;
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
