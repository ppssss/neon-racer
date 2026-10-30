/* ==========================================================================
   NEON RIDGE — garage page (cars.html)

   A small standalone studio scene that shows the selected machine on a
   turntable, lets you pick a car and paint it, and writes the choice to the
   same localStorage entry the race page reads (neonRidgeSetup).
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;
  const $ = (id) => document.getElementById(id);
  const STORE = 'neonRidgeSetup';

  /* ---- setup -------------------------------------------------------------- */
  function readSetup() {
    const setup = { track: 'ridge', car: NR.CAR_ORDER[0], paint: null };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (typeof saved.track === 'string') setup.track = saved.track;
      if (NR.CAR_ORDER.includes(saved.car)) setup.car = saved.car;
      if (typeof saved.paint === 'string' && /^#[0-9a-f]{6}$/i.test(saved.paint)) setup.paint = saved.paint.toLowerCase();
      // fields this page does not own, but must not wipe on save
      if (saved.mode === '2p') setup.mode = '2p';
      if (NR.CAR_ORDER.includes(saved.car2)) setup.car2 = saved.car2;
      if (typeof saved.paint2 === 'string' && /^#[0-9a-f]{6}$/i.test(saved.paint2)) setup.paint2 = saved.paint2.toLowerCase();
      if (NR.DIFFICULTY && NR.DIFFICULTY[saved.difficulty]) setup.difficulty = saved.difficulty;
    } catch (e) { /* noop */ }
    return setup;
  }
  const setup = readSetup();
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(setup)); } catch (e) { /* noop */ }
  };

  /* ---- two-player split garage -------------------------------------------- */
  const DUAL = /(^|&)mode=2p(&|$)/.test(location.search.slice(1));
  if (DUAL) {
    setup.mode = '2p';
    if (!NR.CAR_ORDER.includes(setup.car2) || setup.car2 === setup.car) {
      setup.car2 = NR.CAR_ORDER.find(id => id !== setup.car) || setup.car;
    }
  }
  const carOf = (slot) => (slot === 1 ? setup.car2 : setup.car);
  const paintOf = (slot) => (slot === 1 ? setup.paint2 : setup.paint);
  const setCarAt = (slot, id) => {
    if (slot === 1) setup.car2 = id; else setup.car = id;
    if (slot === 1) setup.paint2 = null; else setup.paint = null;
  };
  const setPaintAt = (slot, hex) => {
    const v = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
    if (slot === 1) setup.paint2 = v; else setup.paint = v;
  };

  const hexOf = (n) => '#' + n.toString(16).padStart(6, '0');
  const currentHex = () => setup.paint || hexOf(NR.CAR_DATA[setup.car].color);

  /* ---- studio scene ------------------------------------------------------- */
  const canvas = $('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.042);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 120);
  camera.position.set(5.4, 2.9, 7.6);
  camera.lookAt(0, .95, 0);

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x120a1e, .5));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(5, 8, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x5f7dff, .55);
  fill.position.set(-7, 3.4, -3);
  scene.add(fill);
  const rimA = new THREE.PointLight(0x28f0ff, 2.4, 16, 2);
  rimA.position.set(-4.4, 1.4, -4.2);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xff3aa0, 2.0, 16, 2);
  rimB.position.set(4.6, 1.6, -3.6);
  scene.add(rimB);

  // floor: dark disc + a neon grid just under the car
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({ color: 0x090c18, roughness: .55, metalness: .35 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(26, 26, 0x1d7fa0, 0x122438);
  grid.material.transparent = true;
  grid.material.opacity = .5;
  grid.position.y = .004;
  scene.add(grid);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.95, 3.05, 96),
    new THREE.MeshBasicMaterial({ color: 0x1ff3ff, transparent: true, opacity: .5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(1, 1.42, 1);          // stretch along the car's length
  ring.position.y = .006;
  scene.add(ring);

  /* ---- car ---------------------------------------------------------------- */
  const turntable = new THREE.Group();
  scene.add(turntable);

  // one holder per human; in solo mode only the first one is used
  const holders = [new THREE.Group(), new THREE.Group()];
  holders.forEach(h => turntable.add(h));
  if (DUAL) {
    holders[0].position.x = -2.45;
    holders[0].rotation.y = .26;
    holders[1].position.x = 2.45;
    holders[1].rotation.y = -.26;
    ring.visible = false;
  }

  const models = [null, null];
  let spin = 0;
  let drag = null;

  function buildCar(slot) {
    slot = slot || 0;
    if (models[slot]) {
      NR.disposeCarModel(models[slot]);
      holders[slot].remove(models[slot]);
      models[slot] = null;
    }
    const hex = paintOf(slot) || hexOf(NR.CAR_DATA[carOf(slot)].color);
    const data = Object.assign({}, NR.CAR_DATA[carOf(slot)], { color: parseInt(hex.slice(1), 16) });
    models[slot] = NR.createCarModel(data, true);
    holders[slot].add(models[slot]);
    // wheels sit still in the garage, but the front pair gets a little lock
    const ud = models[slot].userData;
    if (ud && ud.frontPivots) for (const p of ud.frontPivots) p.rotation.y = .16;
    applyPaint(slot);
  }

  function applyPaint(slot) {
    slot = slot || 0;
    const model = models[slot];
    if (!model) return;
    const hex = paintOf(slot) || hexOf(NR.CAR_DATA[carOf(slot)].color);
    const col = new THREE.Color(hex);
    const ud = model.userData;
    if (ud.paintMat) { ud.paintMat.color.copy(col); ud.paintMat.emissive.copy(col); }
    if (ud.under) ud.under.material.color.copy(col);
    if (!DUAL) {
      const chip = document.querySelector('.g-list .g-card.on .g-chip');
      if (chip) chip.style.background = `linear-gradient(100deg,${hex},${hex}33 70%,transparent)`;
    }
  }

  /* ---- UI ----------------------------------------------------------------- */
  const spec = (stats) => ({
    speed: Math.round(NR.util.clamp((stats.speed - 48) / 9, .25, 1) * 100),
    accel: Math.round(NR.util.clamp((stats.accel - 18) / 7, .25, 1) * 100),
    grip: Math.round(NR.util.clamp((stats.grip - .88) / .28, .25, 1) * 100)
  });

  function buildList() {
    const wrap = $('gList');
    wrap.innerHTML = '';
    NR.CAR_ORDER.forEach((id, i) => {
      const d = NR.CAR_DATA[id];
      const hex = hexOf(d.color);
      const st = spec(d.stats);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'g-card' + (id === setup.car ? ' on' : '');
      card.dataset.car = id;
      card.style.setProperty('--tint', hex);
      card.innerHTML =
        `<span class="g-chip" style="background:linear-gradient(100deg,${hex},${hex}33 70%,transparent)"></span>` +
        `<span class="g-num">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="g-name">${d.name}</span>` +
        `<span class="g-tag">${d.tag}</span>` +
        '<span class="g-bars">' +
        `<i style="--v:${st.speed}%"></i><i style="--v:${st.accel}%"></i><i style="--v:${st.grip}%"></i>` +
        '</span>';
      card.addEventListener('click', () => selectCar(id));
      wrap.appendChild(card);
    });
    $('gTotal').textContent = String(NR.CAR_ORDER.length).padStart(2, '0');
  }

  function syncUI() {
    if (DUAL) { syncDual(); return; }
    const d = NR.CAR_DATA[setup.car];
    const hex = currentHex();
    const st = spec(d.stats);
    document.querySelectorAll('.g-card').forEach(c => c.classList.toggle('on', c.dataset.car === setup.car));
    $('gIndex').textContent = String(NR.CAR_ORDER.indexOf(setup.car) + 1).padStart(2, '0');
    $('gName').textContent = d.name;
    $('gTag').textContent = d.tag;
    $('gBlurb').textContent = d.blurb || '';
    $('gHex').textContent = hex.toUpperCase();
    $('gPick').value = hex;
    $('gSpeed').textContent = Math.round(d.stats.speed * 3.6);
    $('gAccel').textContent = (d.stats.accel / 2).toFixed(1);
    $('gGrip').textContent = (d.stats.grip * 100 | 0);
    const bars = document.querySelectorAll('.g-stats u');
    if (bars.length === 3) {
      bars[0].style.width = st.speed + '%';
      bars[1].style.width = st.accel + '%';
      bars[2].style.width = st.grip + '%';
    }
    const chip = document.querySelector('.g-list .g-card.on .g-chip');
    if (chip) chip.style.background = `linear-gradient(100deg,${hex},${hex}33 70%,transparent)`;
  }

  function selectCar(id, slot) {
    if (!NR.CAR_DATA[id]) return;
    slot = slot || 0;
    setCarAt(slot, id);              // also drops the custom paint back to factory
    save();
    buildCar(slot);
    syncUI();
    spin = 0;
  }

  function setPaint(hex, slot) {
    slot = slot || 0;
    setPaintAt(slot, hex);
    save();
    applyPaint(slot);
    syncUI();
  }

  const SWATCHES = NR.PAINT_SWATCHES || [
    '#18d9f0', '#9dff3c', '#ffb01a', '#f02548',
    '#ff2d8d', '#9d78ff', '#9fc6ff', '#f4f6ff',
    '#20232c', '#0f7a4a'
  ];

  function buildSwatches() {
    const wrap = $('gSwatches');
    wrap.innerHTML = '';
    for (const hex of SWATCHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-swatch';
      b.style.background = hex;
      b.title = hex.toUpperCase();
      b.addEventListener('click', () => setPaint(hex));
      wrap.appendChild(b);
    }
  }

  /* ---- two-player halves -------------------------------------------------- */
  const halves = [];

  function buildDual() {
    const wrap = $('gDual');
    wrap.hidden = false;
    document.body.classList.add('garage-2p');
    ['P1', 'P2'].forEach((tag, slot) => {
      const half = document.createElement('div');
      half.className = 'gd-half' + (slot ? ' p2' : '');
      half.innerHTML =
        '<div class="gd-head">' +
          '<span class="gd-tag' + (slot ? ' alt' : '') + '">' + tag + '</span>' +
          '<b data-f="name"></b><em data-f="tag"></em><span class="gd-dot" data-f="dot"></span>' +
        '</div>' +
        '<div class="gd-cars" data-f="cars"></div>' +
        '<div class="gd-paints" data-f="paints"></div>' +
        '<div class="gd-keys">' + (slot
          ? '<b>P2</b> ↑↓←→ 驾驶 · ENTER 漂移 · R SHIFT 氮气 · BKSP 复位'
          : '<b>P1</b> WASD 驾驶 · 空格 漂移 · SHIFT 氮气 · R 复位') + '</div>';
      wrap.insertBefore(half, wrap.querySelector('.g-dual-divider'));

      const f = {};
      half.querySelectorAll('[data-f]').forEach(el => { f[el.dataset.f] = el; });

      const cards = NR.CAR_ORDER.map(id => {
        const car = NR.CAR_DATA[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gd-car';
        btn.dataset.car = id;
        btn.innerHTML = '<i style="background:' + hexOf(car.color) + '"></i><span>' + car.name + '</span>';
        btn.addEventListener('click', () => selectCar(id, slot));
        f.cars.appendChild(btn);
        return { id, el: btn };
      });

      const paints = SWATCHES.map(hex => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gd-paint';
        b.style.background = hex;
        b.title = hex.toUpperCase();
        b.addEventListener('click', () => setPaint(hex, slot));
        f.paints.appendChild(b);
        return { hex, el: b };
      });
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'gd-reset';
      reset.textContent = '原厂';
      reset.addEventListener('click', () => setPaint(null, slot));
      f.paints.appendChild(reset);
      const pick = document.createElement('label');
      pick.className = 'gd-pick';
      pick.innerHTML = '<span>自定义</span><input type="color" value="#ffffff">';
      pick.querySelector('input').addEventListener('input', (e) => setPaint(e.target.value, slot));
      f.paints.appendChild(pick);
      f.pick = pick.querySelector('input');

      halves.push({ slot, f, cards, paints, reset });
    });
  }

  function syncDual() {
    for (const half of halves) {
      const slot = half.slot;
      const ownId = carOf(slot);
      const otherId = carOf(1 - slot);
      const car = NR.CAR_DATA[ownId];
      const hex = paintOf(slot) || hexOf(car.color);
      half.f.name.textContent = car.name;
      half.f.tag.textContent = car.tag;
      half.f.dot.style.background = hex;
      half.f.dot.style.color = hex;
      half.f.pick.value = hex;
      half.f.pick.parentNode.classList.toggle('on', !!paintOf(slot));
      for (const c of half.cards) {
        c.el.classList.toggle('on', c.id === ownId);
        c.el.classList.toggle('taken', c.id === otherId);
        c.el.disabled = c.id === otherId;
      }
      for (const p of half.paints) p.el.classList.toggle('on', !!paintOf(slot) && p.hex === paintOf(slot));
      half.reset.classList.toggle('on', !paintOf(slot));
    }
    $('gConfirm').querySelector('.cta-label').textContent = '一起出发';
    $('gConfirm').querySelector('.cta-en').textContent = 'BOTH LIGHTS OUT';
  }

  /* ---- interaction -------------------------------------------------------- */
  window.addEventListener('pointerdown', (e) => {
    if (DUAL) return;
    if (e.target.closest('.g-list, .g-paint, .g-foot, .g-head')) return;
    drag = { x: e.clientX, y: 0 };
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    spin += (e.clientX - drag.x) * .006;
    drag.x = e.clientX;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointercancel', () => { drag = null; });

  window.addEventListener('keydown', (e) => {
    if (DUAL) {
      if (e.key === 'Enter') $('gConfirm').click();
      return;
    }
    const i = NR.CAR_ORDER.indexOf(setup.car);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') selectCar(NR.CAR_ORDER[(i + 1) % NR.CAR_ORDER.length]);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') selectCar(NR.CAR_ORDER[(i - 1 + NR.CAR_ORDER.length) % NR.CAR_ORDER.length]);
    else if (e.key === 'Enter') $('gConfirm').click();
  });

  $('gPick').addEventListener('input', (e) => setPaint(e.target.value));
  $('gReset').addEventListener('click', () => setPaint(null));
  $('gConfirm').addEventListener('click', () => { save(); location.href = 'index.html'; });

  /* ---- loop --------------------------------------------------------------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!drag && !DUAL) spin += dt * .18;
    turntable.rotation.y = spin;
    ring.material.opacity = .32 + Math.sin(now * .0012) * .12;
    rimA.intensity = 2.2 + Math.sin(now * .0016) * .45;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ---- boot --------------------------------------------------------------- */
  if (DUAL) {
    // two cars parked side by side, one half of the screen each
    camera.position.set(8.6, 3.6, 12.2);
    camera.fov = 40;
    camera.lookAt(0, .95, 0);
    camera.updateProjectionMatrix();
    buildDual();
  } else {
    buildList();
    buildSwatches();
  }
  syncUI();
  resize();
  requestAnimationFrame(frame);

  const loading = $('gLoading');
  NR.carModelReady.then(() => {
    buildCar(0);
    if (DUAL) buildCar(1);
    loading.classList.add('done');
  });
})();
