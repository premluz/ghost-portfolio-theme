const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  await p.addInitScript(()=>{
    document.addEventListener('DOMContentLoaded', () => {
      window.__trace=[]; const t0=performance.now();
      const tick=()=>{
        const txt=document.getElementById('preloader-text');
        window.__trace.push({ms: Math.round(performance.now()-t0), op: txt?getComputedStyle(txt).opacity:'-'});
        if (performance.now()-t0<2500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(3000);
  const tr = await p.evaluate(()=>window.__trace||[]);
  let last=''; for (const r of tr) { if (r.op!==last) { console.log(`${String(r.ms).padStart(5)}ms opacity=${r.op}`); last=r.op; } }
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
