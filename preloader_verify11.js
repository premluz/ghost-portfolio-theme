const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  let navCount = 0;
  p.on('framenavigated', () => navCount++);
  await p.addInitScript(()=>{
    window.__events = [];
    window.__t0 = performance.now();
    const origAdd = DOMTokenList.prototype.add;
    DOMTokenList.prototype.add = function(...args) {
      if (this.ownerElement && this.ownerElement.id === 'preloader-text') {
        window.__events.push({ms: Math.round(performance.now()-window.__t0), added: args.join(',')});
      }
      return origAdd.apply(this, args);
    };
  });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(2000);
  console.log('nav count:', navCount);
  console.log('classList.add events:', JSON.stringify(await p.evaluate(()=>window.__events)));
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
