// Initialize particle morphing demo when StringTune is ready
(function() {
  'use strict';

  const maxAttempts = 50;
  let attempts = 0;

  function initParticleMorph() {
    if (!window.StringTune || !window.StringTune3D || !window.THREE || !window.GLTFLoader) {
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(initParticleMorph, 100);
      }
      return;
    }

    console.log('[particle-morph] Libraries ready, initializing...');

    const { String3D, ThreeJSProvider } = window.StringTune3D;
    const { StringTune: StringTuneCore, StringSequence } = window.StringTune;
    const THREE = window.THREE;

    String3D.setProvider(new ThreeJSProvider(THREE, { gltf: window.GLTFLoader }));

    const stringTune = StringTuneCore.getInstance();
    stringTune.domBatcherEnabled = false;
    stringTune.use(StringSequence);
    stringTune.use(String3D, { useDirtySync: false });
    stringTune.start(60);

    const models = [
      { url: "https://hls.penev.tech/blasters/blaster-a.glb", code: "PTM-X7" },
      { url: "https://hls.penev.tech/blasters/blaster-b.glb", code: "VTX-92" },
      { url: "https://hls.penev.tech/blasters/blaster-c.glb", code: "NVA-15" },
      { url: "https://hls.penev.tech/blasters/blaster-d.glb", code: "SPC-33" },
      { url: "https://hls.penev.tech/blasters/blaster-f.glb", code: "ECL-08" },
      { url: "https://hls.penev.tech/blasters/blaster-g.glb", code: "ZNT-K1" },
    ];

    const particlesEl = document.getElementById("particles");
    const modelCodeEl = document.getElementById("model-code");

    if (!particlesEl || !modelCodeEl) {
      console.warn('[particle-morph] Missing DOM elements');
      return;
    }

    let currentRotation = -65;

    function typeCode(code) {
      modelCodeEl.textContent = "";
      let i = 0;
      const interval = setInterval(() => {
        modelCodeEl.textContent += code[i];
        i++;
        if (i >= code.length) clearInterval(interval);
      }, 50);
    }

    stringTune.on("sequence:transition:start", (event) => {
      currentRotation += 360 * event.direction;
      particlesEl.style.setProperty("--rotate-y", `${currentRotation}`);
      particlesEl.style.setProperty("--instance-model", `'${models[event.to].url}'`);
      typeCode(models[event.to].code);
    });

    stringTune.emit("sequence", {
      slider: "demo",
      step: 0,
      direction: 1,
      duration: 800,
      instant: true,
    });

    stringTune.onResize(true);
    console.log('[particle-morph] ✅ Initialized');
  }

  initParticleMorph();
})();
