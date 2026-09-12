const { chromium } = require('/Users/przemek/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext()).newPage();
  await p.addInitScript(() => {
    window.__s=[];
    const t0=performance.now();
    const tick=()=>{
      const t=document.getElementById('preloader-text');
      const pre=document.getElementById('preloader');
      if(t) window.__s.push({ms:Math.round(performance.now()-t0),
        inline: t.getAttribute('style')||'(none)',
        cls:t.className,
        computedOp:getComputedStyle(t).opacity,
        parentOp: pre?getComputedStyle(pre).opacity:'-',
        parentInline: pre?(pre.getAttribute('style')||'(none)'):'-'});
      if(performance.now()-t0<3500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await p.goto('http://localhost:2369/?cb='+Date.now(),{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(4200);
  const s=await p.evaluate(()=>window.__s||[]);
  let last='';
  for(const r of s){
    const k=`${r.inline}|${r.cls}|${r.computedOp}|${r.parentOp}`;
    if(k!==last){console.log(`${r.ms}ms textInline="${r.inline}" cls="${r.cls}" textOp=${r.computedOp} preloaderOp=${r.parentOp}`);last=k;}
  }
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
