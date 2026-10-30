/* ==========================================================================
   NEON RIDGE — tiny shared helpers

   Loaded before world.js so both the race page and the garage page can use the
   same math, canvas and texture helpers. world.js destructures these instead
   of keeping its own copies.
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR = window.NR || {};
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }

  function tex(c, renderer, repeatX, repeatY) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (repeatX || repeatY) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeatX || 1, repeatY || 1);
    }
    return t;
  }

  function glowTexture() {
    const [c, g] = canvas2d(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(.16, 'rgba(255,255,255,.9)');
    gr.addColorStop(.4, 'rgba(255,255,255,.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  NR.util = { clamp, wrapAngle, damp, rng, canvas2d, tex, glowTexture };
})();
