const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  // load a post, then click Home in-site (skip path trigger for referrer check)
  await p.goto('http://localhost:2369/work/gala-defi/',{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(3000);
  const t0 = Date.now();
  await p.locator('a[href="/"]').first().click();
  await p.waitForURL('http://localhost:2369/',{timeout:60000});
  const navMs = Date.now()-t0;
  await p.waitForTimeout(300);
  const state = await p.evaluate(()=>({
    preExists: !!document.getElementById('preloader'),
    preDisplay: document.getElementById('preloader') ? getComputedStyle(document.getElementById('preloader')).display : '-',
    skipped: !!window.__preloaderSkipped,
    done: !!window.__preloaderDoneFired,
  }));
  console.log('nav took', navMs, 'ms |', JSON.stringify(state));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
