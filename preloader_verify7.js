const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.addInitScript(()=>{
    window.__trace=[]; const t0=performance.now();
    const tick=()=>{
      const txt=document.getElementById('preloader-text');
      window.__trace.push({ms: Math.round(performance.now()-t0), op: txt?getComputedStyle(txt).opacity:'no-el'});
      if (performance.now()-t0<1600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(2000);
  const tr = await p.evaluate(()=>window.__trace||[]);
  console.log('total samples:', tr.length);
  // print ALL rows once element exists, no dedupe, to see the actual curve
  const withEl = tr.filter(r=>r.op!=='no-el');
  console.log('first sample with element at', withEl[0]?.ms, 'ms, opacity', withEl[0]?.op);
  for (const r of withEl.slice(0,40)) console.log(`${r.ms}ms: ${r.op}`);
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
