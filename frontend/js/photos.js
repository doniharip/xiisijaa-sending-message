/**
 * photos.js — Foto kelas mengambang di background
 *
 * Cara pakai:
 * 1. Taruh foto-foto kelas di folder frontend/photos/
 * 2. Format yang didukung: jpg, jpeg, png, webp
 * 3. Foto akan otomatis muncul mengambang di background
 */

const PhotoBg = (() => {
  const CONTAINER  = document.getElementById('photo-bg');
  const MIN_SIZE   = 160;
  const MAX_SIZE   = 280;
  const MAX_PHOTOS = 10;
  const MIN_DUR    = 18;
  const MAX_DUR    = 34;

  let photos = [], active = [], running = false, spawnTimer = null;

  async function loadPhotos() {
    try {
      const res = await fetch('/api/photos');
      if (res.ok) photos = await res.json();
    } catch { photos = []; }
  }

  const rand    = (a, b) => a + Math.random() * (b - a);
  const randEl  = arr => arr[Math.floor(Math.random() * arr.length)];

  function spawnPhoto() {
    if (!photos.length || active.length >= MAX_PHOTOS || !running) return;

    const src    = randEl(photos);
    const size   = rand(MIN_SIZE, MAX_SIZE);
    const dur    = rand(MIN_DUR, MAX_DUR);
    const left   = rand(3, 88);
    const goUp   = Math.random() > 0.35;
    const travel = goUp ? `-${rand(65, 115)}vh` : `${rand(65, 115)}vh`;
    const startY = goUp ? `${rand(75, 115)}vh`  : `${rand(-35, -8)}vh`;
    const rot    = rand(-20, 20);
    const spin   = rand(-15, 15);
    const aspect = rand(0.62, 1.05);

    const el = document.createElement('div');
    el.className = 'photo-item';
    el.style.cssText = `
      width:${size}px;
      height:${size * aspect}px;
      left:${left}%;
      top:${startY};
      --rot:${rot}deg;
      --travel:${travel};
      --spin:${spin}deg;
      animation-duration:${dur}s;
      animation-delay:${rand(0, 1.5)}s;
    `;

    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy'; img.draggable = false;
    el.appendChild(img);
    CONTAINER.appendChild(el);
    active.push(el);

    const cleanup = () => { el.remove(); active = active.filter(e => e !== el); };
    el.addEventListener('animationend', cleanup);
    setTimeout(cleanup, (dur + 5) * 1000);
  }

  function scheduleSpawn() {
    if (!running) return;
    spawnTimer = setTimeout(() => { spawnPhoto(); scheduleSpawn(); }, rand(2500, 5500));
  }

  async function init() {
    if (!CONTAINER) return;
    await loadPhotos();
    if (!photos.length) { CONTAINER.style.display = 'none'; return; }
    running = true;
    // Spawn beberapa foto awal supaya tidak kosong
    const n = Math.min(5, photos.length);
    for (let i = 0; i < n; i++) setTimeout(spawnPhoto, i * 900);
    scheduleSpawn();
  }

  function stop() {
    running = false;
    clearTimeout(spawnTimer);
    active.forEach(el => el.remove());
    active = [];
  }

  // Pause saat tab tidak aktif
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; clearTimeout(spawnTimer); }
    else if (photos.length) { running = true; scheduleSpawn(); }
  });

  return { init, stop };
})();

document.addEventListener('DOMContentLoaded', () => PhotoBg.init());
