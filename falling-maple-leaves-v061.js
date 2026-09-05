/* Royal CRM Mini App v0.6.1 — visible but unobtrusive falling maple leaves */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_AUTUMN_LEAVES_V061__) return;

  const VERSION = '0.6.1-autumn-leaves.2';
  const CANVAS_ID = 'royalAutumnLeavesV061';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

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
    zIndex: '6',
    opacity: '1'
  });

  const style = document.createElement('style');
  style.dataset.royalAutumnLeavesV061 = '2';
  style.textContent = `
    #${CANVAS_ID}{display:block!important;visibility:visible!important;pointer-events:none!important}
    body>.app{position:relative;z-index:10}
    body>.bottom-nav{z-index:30}
  `;
  document.head.appendChild(style);
  document.body.prepend(canvas);

  // Keep the canvas path conservative for Telegram Android/iOS WebViews.
  // Some WebViews do not behave reliably with desynchronized contexts.
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    window.__ROYAL_AUTUMN_LEAVES_V061__ = VERSION + '-no-canvas';
    return;
  }

  const tones = ['#d78b3b', '#c96f32', '#e0a84b', '#b84d35', '#c78738', '#a85e32'];
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

  function reduced() {
    return !!reduceMotion?.matches;
  }

  function leafCount() {
    const memory = Number(navigator.deviceMemory || 0);
    const lowPower = memory > 0 && memory <= 3;
    if (reduced()) return width < 520 ? 6 : 8;
    if (lowPower) return 9;
    if (width < 520) return 13;
    if (width < 900) return 16;
    return 19;
  }

  function makeLeaf(initial = false) {
    const depth = rand(0.64, 1.0);
    const lowMotion = reduced();
    return {
      x: rand(-35, width + 35),
      y: initial ? rand(-height * 0.12, height * 0.98) : rand(-120, -24),
      size: rand(16, 29) * depth,
      speed: rand(lowMotion ? 7 : 17, lowMotion ? 12 : 34) * depth,
      drift: rand(-4.6, 4.6),
      sway: rand(lowMotion ? 2 : 4.5, lowMotion ? 5 : 12),
      swayRate: rand(0.42, 0.95),
      phase: rand(0, Math.PI * 2),
      rotation: rand(0, Math.PI * 2),
      spin: rand(lowMotion ? -0.10 : -0.38, lowMotion ? 0.10 : 0.38),
      alpha: rand(lowMotion ? 0.22 : 0.28, lowMotion ? 0.31 : 0.42) * depth,
      color: tones[Math.floor(Math.random() * tones.length)],
      age: rand(0, 8)
    };
  }

  function resize() {
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    dpr = Math.min(1.75, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const count = leafCount();
    if (leaves.length > count) leaves.length = count;
    while (leaves.length < count) leaves.push(makeLeaf(true));
    draw(0);
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

    ctx.globalAlpha = Math.min(0.34, leaf.alpha * 0.72);
    ctx.strokeStyle = '#ffd388';
    ctx.lineWidth = 0.028;
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

  function draw(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const leaf of leaves) {
      if (dt > 0) {
        leaf.age += dt;
        leaf.y += leaf.speed * dt;
        leaf.x += (leaf.drift + Math.sin(leaf.age * leaf.swayRate + leaf.phase) * leaf.sway) * dt;
        leaf.rotation += leaf.spin * dt;
        if (leaf.y > height + leaf.size * 2 || leaf.x < -90 || leaf.x > width + 90) resetLeaf(leaf);
      }
      drawLeaf(leaf);
    }
  }

  function frame(now) {
    if (!running) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 31) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - (lastFrame || now - 32)) / 1000));
    lastFrame = now;
    draw(dt);
  }

  function setRunning(next) {
    const value = !!next;
    if (value === running && (value ? !!raf : !raf)) return;
    running = value;
    if (!running) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  }, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(resize, 180), { passive: true });
  document.addEventListener('visibilitychange', () => setRunning(document.visibilityState !== 'hidden'));
  reduceMotion?.addEventListener?.('change', () => {
    leaves = [];
    resize();
    setRunning(document.visibilityState !== 'hidden');
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
