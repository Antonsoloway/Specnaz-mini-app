/* Royal CRM Mini App v0.6.1 — subtle falling maple leaves background */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_AUTUMN_LEAVES_V061__) return;

  const VERSION = '0.6.1-autumn-leaves.1';
  const CANVAS_ID = 'royalAutumnLeavesV061';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (reduceMotion?.matches) {
    window.__ROYAL_AUTUMN_LEAVES_V061__ = VERSION + '-reduced-motion';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.id = CANVAS_ID;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: '0',
    opacity: '1',
    contain: 'strict'
  });

  const style = document.createElement('style');
  style.dataset.royalAutumnLeavesV061 = '1';
  style.textContent = `
    #${CANVAS_ID}{display:block!important}
    body>.app{position:relative;z-index:1}
    @media (prefers-reduced-motion:reduce){#${CANVAS_ID}{display:none!important}}
  `;
  document.head.appendChild(style);
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) {
    canvas.remove();
    window.__ROYAL_AUTUMN_LEAVES_V061__ = VERSION + '-no-canvas';
    return;
  }

  const tones = ['#b76a32', '#c58a42', '#9d5a35', '#b44732', '#9f7037'];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let leaves = [];
  let raf = 0;
  let lastFrame = 0;
  let running = true;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function leafCount() {
    const memory = Number(navigator.deviceMemory || 0);
    const lowPower = memory > 0 && memory <= 3;
    if (lowPower) return 7;
    if (width < 520) return 9;
    if (width < 900) return 12;
    return 15;
  }

  function makeLeaf(initial = false) {
    const depth = rand(0.58, 1.0);
    return {
      x: rand(-30, width + 30),
      y: initial ? rand(-height * 0.18, height * 0.96) : rand(-150, -30),
      size: rand(13, 26) * depth,
      speed: rand(14, 29) * depth,
      drift: rand(-3.8, 3.8),
      sway: rand(3.5, 10),
      swayRate: rand(0.45, 0.9),
      phase: rand(0, Math.PI * 2),
      rotation: rand(0, Math.PI * 2),
      spin: rand(-0.34, 0.34),
      alpha: rand(0.12, 0.23) * depth,
      color: tones[Math.floor(Math.random() * tones.length)],
      age: rand(0, 8)
    };
  }

  function resize() {
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    dpr = Math.min(1.65, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const count = leafCount();
    if (leaves.length > count) leaves.length = count;
    while (leaves.length < count) leaves.push(makeLeaf(true));
  }

  function resetLeaf(leaf) {
    Object.assign(leaf, makeLeaf(false));
  }

  function drawLeaf(leaf) {
    const s = leaf.size;
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.rotation);
    ctx.scale(s, s);
    ctx.globalAlpha = leaf.alpha;
    ctx.fillStyle = leaf.color;
    ctx.beginPath();
    ctx.moveTo(0, -1.0);
    ctx.lineTo(0.15, -0.53);
    ctx.lineTo(0.39, -0.73);
    ctx.lineTo(0.33, -0.34);
    ctx.lineTo(0.77, -0.43);
    ctx.lineTo(0.54, -0.09);
    ctx.lineTo(0.94, 0.05);
    ctx.lineTo(0.45, 0.18);
    ctx.lineTo(0.56, 0.57);
    ctx.lineTo(0.17, 0.37);
    ctx.lineTo(0, 0.88);
    ctx.lineTo(-0.17, 0.37);
    ctx.lineTo(-0.56, 0.57);
    ctx.lineTo(-0.45, 0.18);
    ctx.lineTo(-0.94, 0.05);
    ctx.lineTo(-0.54, -0.09);
    ctx.lineTo(-0.77, -0.43);
    ctx.lineTo(-0.33, -0.34);
    ctx.lineTo(-0.39, -0.73);
    ctx.lineTo(-0.15, -0.53);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = leaf.alpha * 0.55;
    ctx.strokeStyle = '#f0c783';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(0, 0.86);
    ctx.lineTo(0, -0.62);
    ctx.moveTo(0, -0.12);
    ctx.lineTo(0.46, -0.30);
    ctx.moveTo(0, 0.08);
    ctx.lineTo(-0.47, -0.18);
    ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 31) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - (lastFrame || now - 32)) / 1000));
    lastFrame = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const leaf of leaves) {
      leaf.age += dt;
      leaf.y += leaf.speed * dt;
      leaf.x += (leaf.drift + Math.sin(leaf.age * leaf.swayRate + leaf.phase) * leaf.sway) * dt;
      leaf.rotation += leaf.spin * dt;
      if (leaf.y > height + leaf.size * 2 || leaf.x < -90 || leaf.x > width + 90) resetLeaf(leaf);
      drawLeaf(leaf);
    }
  }

  function setRunning(next) {
    running = !!next;
    if (running && !raf) raf = requestAnimationFrame(frame);
    if (!running && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
    }
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  }, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(resize, 180), { passive: true });
  document.addEventListener('visibilitychange', () => setRunning(document.visibilityState !== 'hidden'));
  reduceMotion?.addEventListener?.('change', event => {
    if (event.matches) {
      setRunning(false);
      canvas.hidden = true;
    } else {
      canvas.hidden = false;
      resize();
      setRunning(true);
    }
  });

  resize();
  raf = requestAnimationFrame(frame);

  window.RoyalAutumnLeavesV061 = {
    version: VERSION,
    refresh: resize,
    pause: () => setRunning(false),
    resume: () => setRunning(true)
  };
  window.__ROYAL_AUTUMN_LEAVES_V061__ = VERSION;
})();
