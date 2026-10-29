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
    } catch (e) { /* noop */ }
    return setup;
  }
  const setup = readSetup();
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(setup)); } catch (e) { /* noop */ }
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

  let model = null;
  let spin = 0;
  let drag = null;

  function buildCar() {
    if (model) {
      NR.disposeCarModel(model);
      turntable.remove(model);
      model = null;
    }
    const data = Object.assign({}, NR.CAR_DATA[setup.car], { color: parseInt(currentHex().slice(1), 16) });
    model = NR.createCarModel(data, true);
    turntable.add(model);
    // wheels sit still in the garage, but the front pair gets a little lock
    const ud = model.userData;
    if (ud && ud.frontPivots) for (const p of ud.frontPivots) p.rotation.y = .16;
    applyPaint();
  }

  function applyPaint() {
    if (!model) return;
    const col = new THREE.Color(currentHex());
    const ud = model.userData;
    if (ud.paintMat) { ud.paintMat.color.copy(col); ud.paintMat.emissive.copy(col); }
    if (ud.under) ud.under.material.color.copy(col);
    const chip = document.querySelector('.g-list .g-card.on .g-chip');
    if (chip) chip.style.background = `linear-gradient(100deg,${currentHex()},${currentHex()}33 70%,transparent)`;
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

  function selectCar(id) {
    if (!NR.CAR_DATA[id]) return;
    setup.car = id;
    setup.paint = null;             // back to the factory colour
    save();
    buildCar();
    syncUI();
    spin = 0;
  }

  function setPaint(hex) {
    setup.paint = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
    save();
    applyPaint();
    syncUI();
  }

  const SWATCHES = [
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

  /* ---- interaction -------------------------------------------------------- */
  window.addEventListener('pointerdown', (e) => {
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
    if (!drag) spin += dt * .18;
    turntable.rotation.y = spin;
    ring.material.opacity = .32 + Math.sin(now * .0012) * .12;
    rimA.intensity = 2.2 + Math.sin(now * .0016) * .45;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ---- boot --------------------------------------------------------------- */
  buildList();
  buildSwatches();
  syncUI();
  resize();
  requestAnimationFrame(frame);

  const loading = $('gLoading');
  NR.carModelReady.then(() => {
    buildCar();
    loading.classList.add('done');
  });
})();
