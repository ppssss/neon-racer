/* ==========================================================================
   NEON RIDGE — game orchestration, camera, HUD, effects
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;
  const V3 = THREE.Vector3;
  const clamp = NR.util.clamp;
  const damp = NR.util.damp;
  const wrapAngle = NR.util.wrapAngle;
  const STEP = 1 / 120;
  const $ = (id) => document.getElementById(id);

  const fmt = (t) => {
    if (!isFinite(t) || t < 0) return '--:--.---';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  const fmtShort = (t) => {
    if (!isFinite(t) || t < 0) return '--.---';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return `${m ? m + ':' : ''}${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  const cssColor = (n) => '#' + n.toString(16).padStart(6, '0');

  /* ---------------------------------------------------------------------- */
  class ParticleField {
    constructor(scene, max, additive, scale) {
      this.max = max;
      this.cursor = 0;
      this.scale = scale || 170;
      this.pos = new Float32Array(max * 3);
      this.vel = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.alpha = new Float32Array(max);
      this.size = new Float32Array(max);
      this.life = new Float32Array(max);
      this.maxLife = new Float32Array(max);
      this.gravity = additive ? -2.5 : .8;
      this.drag = additive ? .6 : 1.8;
      const geo = this.geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uScale: { value: this.scale } },
        vertexShader: `
          attribute vec3 aColor;
          attribute float aAlpha;
          attribute float aSize;
          uniform float uScale;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uScale / max(2.0, -mv.z);
            vColor = aColor;
            vAlpha = aAlpha;
          }`,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord - .5;
            float d = length(p);
            if (d > .5) discard;
            float a = 1.0 - smoothstep(.03, .5, d);
            gl_FragColor = vec4(vColor, a * vAlpha);
          }`
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      scene.add(this.points);
    }

    spawn(x, y, z, vx, vy, vz, color, size, life) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
      this.alpha[i] = 1;
      this.size[i] = size;
      this.life[i] = life; this.maxLife[i] = life;
    }

    update(dt) {
      const p = this.pos, v = this.vel;
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        const i3 = i * 3;
        v[i3 + 1] += this.gravity * dt;
        const drag = Math.max(0, 1 - this.drag * dt);
        v[i3] *= drag; v[i3 + 1] *= drag; v[i3 + 2] *= drag;
        p[i3] += v[i3] * dt;
        p[i3 + 1] += v[i3 + 1] * dt;
        p[i3 + 2] += v[i3 + 2] * dt;
        const k = this.life[i] / this.maxLife[i];
        this.alpha[i] = this.additiveFade ? k : k * k;
        this.size[i] += (this.additiveFade ? 0 : 1.9) * dt;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.setDrawRange(0, this.max);
    }
  }

  /* ---------------------------------------------------------------------- */
  class Game {
    constructor() {
      this.canvas = $('scene');
      this.state = 'menu';
      this.menuTime = 0;
      this.raceTime = 0;
      this.acc = 0;
      this.last = performance.now();
      this.finishedOrder = [];
      this.lastLapCount = 0;
      this.messageTimer = 0;
      this.goTimer = 0;
      this.resultTimer = 0;
      this.shakeP = [0, 0];
      this.smokeTimer = 0;
      this.pausedFrom = 'racing';
      this.steer = 0;
      const blankInput = () => ({
        gas: false, brake: false, left: false, right: false,
        drift: false, boost: false
      });
      this.input = blankInput();       // player 1 (keyboard + pad 1)
      this.input2 = blankInput();      // player 2 (only used in split screen)
      this.touch = blankInput();
      this.steerP = [0, 0];
      this.players = [];
      this.record = this.loadRecord();
      this.setup = this.loadSetup();

      this.initThree();
      this.track = new NR.Track(this.scene, this.renderer, this.trackCfg());
      this.audio = new NR.Audio();
      this.createRacers();
      this.createParticles();
      this.createSpeedLines();
      this.cacheUI();
      this.bindUI();
      this.bindInput();
      this.buildSetupUI();
      this.resetToMenu(true);
      this.updateMenuBest();
      this.clock = new THREE.Clock();
      this.last = performance.now();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
      window.__NEON = this;
    }

    /* ---- renderer & scene ------------------------------------------------ */
    initThree() {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas, antialias: true, alpha: false,
          powerPreference: 'high-performance', stencil: false
        });
      } catch (e) {
        $('loading').innerHTML = '<div class="loading-text" style="color:#ff8bc2">WEBGL UNAVAILABLE<br>请使用新版 Chrome / Edge</div>';
        throw e;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : 1.8);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05060f);
      this.scene.fog = new THREE.FogExp2(0x090b1c, .00235);

      this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, .08, 900);
      this.camera.rotation.order = 'YXZ';
      this.scene.add(this.camera);
      this.cam1 = this.camera;
      // second eye for split screen; parked until the mode is switched on
      this.cam2 = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, .08, 900);
      this.cam2.rotation.order = 'YXZ';
      this.cam2.position.set(10, 4, 10);
      this.scene.add(this.cam2);
      this.lookAt = new V3(0, 1, 0);
      this.lookAt2 = new V3(0, 1, 0);
      this.camera.position.set(10, 4, 10);
      // both eyes share one shadow map, refreshed once per frame
      this.renderer.shadowMap.autoUpdate = false;
    }

    createRacers() {
      const D = NR.CAR_DATA;
      const dual = this.setup.mode === '2p';
      const car1 = this.setup.car;
      // P2 never drives the exact machine P1 picked - that would be unreadable
      let car2 = this.setup.car2;
      if (!D[car2] || car2 === car1) car2 = NR.CAR_ORDER.find(id => id !== car1) || car1;
      this.setup.car2 = car2;
      // a custom paint job only ever applies to the first player's machine
      const playerBase = D[car1];
      const playerData = this.setup.paint
        ? Object.assign({}, playerBase, { color: parseInt(this.setup.paint.slice(1), 16) })
        : playerBase;
      this.player = new NR.Racer(this, playerData, true, { skill: 1 });
      this.player.playerIndex = 0;
      this.players = [this.player];
      if (dual) {
        const p2 = new NR.Racer(this, D[car2], true, { skill: 1 });
        p2.playerIndex = 1;
        this.players.push(p2);
      }
      const taken = new Set([car1, dual ? car2 : null]);
      const others = NR.CAR_ORDER.filter(id => !taken.has(id));
      // two cars per row, the humans always start from the last one
      const ROW = 6.5;
      const configs = others.map((id, i) => ({
        id,
        s: -7 - ROW * Math.floor(i / 2),
        lat: i % 2 ? 3.5 : -3.5,
        lane: i % 2 ? 2.8 : -2.8,
        skill: 1.02 - i * 0.014,
        phase: 1.3 + i * 1.7
      }));
      this.opponents = configs.map(c => {
        const r = new NR.Racer(this, D[c.id], false, { skill: c.skill });
        r.ai = new NR.AIDriver(r, { lane: c.lane, skill: c.skill, phase: c.phase });
        return r;
      });
      this.racers = [...this.players, ...this.opponents];
      this.grid = configs.map((c, i) => ({ racer: this.opponents[i], s: c.s, lat: c.lat }));
      const backS = -7 - ROW * Math.ceil(others.length / 2);
      this.players.forEach((p, i) => {
        this.grid.push({ racer: p, s: backS, lat: i === 0 ? 3.5 : -3.5 });
      });
    }

    /* is the screen currently split in two? */
    splitActive() {
      return this.setup.mode === '2p' && this.players.length > 1 &&
        this.state !== 'menu' && this.state !== 'results';
    }

    camOf(slot) { return slot === 1 ? this.cam2 : this.cam1; }
    lookOf(slot) { return slot === 1 ? this.lookAt2 : this.lookAt; }

    rebuildRacers() {
      for (const r of this.racers) {
        NR.disposeCarModel(r.model);
        this.scene.remove(r.model);
      }
      this.createRacers();
      this.ui.fieldSize.textContent = this.racers.length;
      this.resetGrid();
    }

    /* ---- race setup ------------------------------------------------------ */
    trackCfg(id) {
      return NR.TRACKS.find(t => t.id === id) || NR.TRACKS[0];
    }

    loadTrack() {
      const cfg = this.trackCfg(this.setup.track);
      this.track.dispose();
      this.track = new NR.Track(this.scene, this.renderer, cfg);
      this.buildMinimapBase();
      this.racers.forEach(r => { r.track = this.track; });
      this.snapCamera = true;
    }

    selectTrack(id) {
      if (id === this.setup.track) return;
      this.setup.track = id;
      this.saveSetup();
      this.loadTrack();
      this.rebuildRacers();
      this.updateSetupUI();
      this.updateMenuBest();
    }

    selectCar(id) {
      if (id === this.setup.car) return;
      this.setup.car = id;
      this.saveSetup();
      this.rebuildRacers();
      this.updateSetupUI();
      this.snapCamera = true;
    }

    selectMode(mode) {
      if (this.setup.mode === mode) return;
      this.setup.mode = mode;
      this.saveSetup();
      document.body.classList.toggle('mode-2p', mode === '2p');
      this.rebuildRacers();
      this.updateSetupUI();
      this.snapCamera = true;
    }

    selectCar2(id) {
      if (id === this.setup.car2 || id === this.setup.car) return;
      this.setup.car2 = id;
      this.saveSetup();
      this.rebuildRacers();
      this.updateSetupUI();
      this.snapCamera = true;
    }

    /* ---- custom paint ---------------------------------------------------- */
    carPaintColor() {
      return this.setup.paint || cssColor(NR.CAR_DATA[this.setup.car].color);
    }

    setPaint(hex) {
      this.setup.paint = hex || null;
      this.saveSetup();
      this.paintPlayer();
      this.updateSetupUI();
    }

    // repaint the player's body in place (menu is live, no rebuild needed)
    paintPlayer() {
      if (!this.player || !this.player.model) return;
      const col = new THREE.Color(this.carPaintColor());
      this.player.color = col.getHex();
      // keep data a copy so the shared CAR_DATA palette is never overwritten
      this.player.data = Object.assign({}, NR.CAR_DATA[this.setup.car], { color: col.getHex() });
      const ud = this.player.model.userData;
      if (ud.paintMat) {
        ud.paintMat.color.copy(col);
        ud.paintMat.emissive.copy(col);
      }
      if (ud.under) ud.under.material.color.copy(col);
    }

    loadSetup() {
      const setup = {
        track: NR.TRACKS[0].id, car: NR.CAR_ORDER[0],
        car2: NR.CAR_ORDER[1], mode: '1p', paint: null
      };
      try {
        const saved = JSON.parse(localStorage.getItem('neonRidgeSetup') || '{}');
        if (NR.TRACKS.some(t => t.id === saved.track)) setup.track = saved.track;
        if (NR.CAR_ORDER.includes(saved.car)) setup.car = saved.car;
        if (NR.CAR_ORDER.includes(saved.car2)) setup.car2 = saved.car2;
        if (saved.mode === '2p') setup.mode = '2p';
        if (typeof saved.paint === 'string' && /^#[0-9a-f]{6}$/i.test(saved.paint)) {
          setup.paint = saved.paint.toLowerCase();
        }
      } catch (e) { /* noop */ }
      return setup;
    }

    saveSetup() {
      try { localStorage.setItem('neonRidgeSetup', JSON.stringify(this.setup)); } catch (e) { /* noop */ }
    }

    buildSetupUI() {
      const trackWrap = $('trackOptions');
      trackWrap.innerHTML = '';
      this.trackCards = [];

      for (const t of NR.TRACKS) {
        const btn = document.createElement('button');
        btn.className = 'setup-card';
        btn.innerHTML = '<canvas class="setup-map" width="150" height="64"></canvas>' +
          `<span class="setup-name">${t.name}</span><span class="setup-meta">${t.sub}</span>`;
        this.drawTrackThumb(btn.querySelector('canvas'), t);
        btn.addEventListener('click', () => {
          this.audio.ui();
          this.selectTrack(t.id);
        });
        trackWrap.appendChild(btn);
        this.trackCards.push({ id: t.id, el: btn });
      }

      // the machine itself is chosen in the garage page (cars.html)
      const garage = $('garageLink');
      if (garage) garage.addEventListener('click', () => this.audio.ui());

      this.updateSetupUI();
    }

    updateSetupUI() {
      for (const c of this.trackCards) c.el.classList.toggle('on', c.id === this.setup.track);

      const cfg = this.trackCfg(this.setup.track);
      const car = NR.CAR_DATA[this.setup.car];
      const track = this.track;
      const hex = this.carPaintColor();
      $('setupTrack').textContent = cfg.name;
      $('setupCar').textContent = car.name;
      $('trackCode').textContent = cfg.code;
      $('mapTrack').textContent = track.name;
      $('mapLaps').textContent = track.lapCount;
      $('statLaps').textContent = String(track.lapCount).padStart(2, '0');
      $('statRacers').textContent = String(this.racers.length).padStart(2, '0');
      const km = track.total * track.lapCount / 1000;
      $('statDist').innerHTML = km.toFixed(1) + '<em>KM</em>';

      const gName = $('garageName');
      if (gName) {
        gName.textContent = car.name;
        $('garageTag').textContent = car.tag;
        $('garageBlurb').textContent = car.blurb || '';
        $('garageChip').style.background = 'linear-gradient(100deg,' + hex + ',' + hex + '44 60%,transparent)';
        $('garageHex').textContent = hex.toUpperCase();
      }

      const pick = $('paintPick');
      if (pick) pick.value = this.setup.paint || cssColor(NR.CAR_DATA[this.setup.car].color);
      const resetBtn = $('paintReset');
      if (resetBtn) resetBtn.classList.toggle('off', !this.setup.paint);
    }

    drawTrackThumb(canvas, cfg) {
      const pts = NR.trackOutline(cfg, 130);
      const g = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height, pad = 7;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
      }
      const sc = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
      const ox = (w - (maxX - minX) * sc) / 2 - minX * sc;
      const oz = (h - (maxZ - minZ) * sc) / 2 - minZ * sc;
      g.clearRect(0, 0, w, h);
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      pts.forEach((p, i) => {
        const x = p[0] * sc + ox, y = p[1] * sc + oz;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.closePath();
      g.strokeStyle = 'rgba(4,8,18,.85)'; g.lineWidth = 7; g.stroke();
      g.strokeStyle = 'rgba(120,200,235,.55)'; g.lineWidth = 3.4; g.stroke();
      g.strokeStyle = 'rgba(190,250,255,.85)'; g.lineWidth = 1; g.stroke();
      const a = pts[0];
      g.fillStyle = '#eaff5a';
      g.beginPath();
      g.arc(a[0] * sc + ox, a[1] * sc + oz, 2, 0, Math.PI * 2);
      g.fill();
    }

    createParticles() {
      this.smoke = new ParticleField(this.scene, 220, false, 130);
      this.smoke.gravity = .85;
      this.smoke.drag = 1.7;
      this.sparks = new ParticleField(this.scene, 180, true, 95);
      this.sparks.gravity = -7;
      this.sparks.drag = .4;
      this.sparks.additiveFade = true;
    }

    createSpeedLines() {
      const count = 90;
      const pos = new Float32Array(count * 6);
      const col = new Float32Array(count * 6);
      this.speedLineData = [];
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = 1.7 + Math.random() * 5.2;
        const x = Math.cos(angle) * rad;
        const y = Math.sin(angle) * rad * .55;
        const z = -6 - Math.random() * 70;
        const len = 1.2 + Math.random() * 4.2;
        this.speedLineData.push({ x, y, z, len });
        c.setHex(i % 3 === 0 ? 0xff2d8d : 0x9af7ff);
        for (let k = 0; k < 2; k++) {
          pos[i * 6 + k * 3] = x;
          pos[i * 6 + k * 3 + 1] = y;
          pos[i * 6 + k * 3 + 2] = z + k * len;
          col[i * 6 + k * 3] = c.r;
          col[i * 6 + k * 3 + 1] = c.g;
          col[i * 6 + k * 3 + 2] = c.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      });
      this.speedLines = new THREE.LineSegments(geo, mat);
      this.speedLines.frustumCulled = false;
      this.speedLines.renderOrder = 20;
      this.camera.add(this.speedLines);
      this.speedLinePos = pos;
    }

    /* ---- UI cache ------------------------------------------------------- */
    cacheUI() {
      const ids = [
        'hud', 'menu', 'pause', 'results', 'loading', 'countdown', 'countdownNum', 'countdownSub',
        'lapNum', 'raceTime', 'positionNum', 'positionGap', 'fieldSize', 'lapTime', 'bestLap',
        'speedNum', 'gearNum', 'speedo', 'nitroFill', 'nitroPct', 'nitroPanel', 'driftBadge',
        'driftScore', 'wrongWay', 'raceMessage', 'minimap', 'standingsList', 'sectorBars',
        'resultTitle', 'resultSub', 'resultPlace', 'resultKicker', 'resultTime', 'resultBest',
        'resultSpeed', 'resultDrift', 'resultTable', 'menuBest', 'startFlash', 'muteBtn',
        'touchControls', 'startBtn', 'pauseBtn', 'muteBtn', 'resumeBtn', 'restartBtn',
        'quitBtn', 'againBtn', 'menuBtn', 'pause', 'menu', 'paintPick', 'paintReset'
      ];
      this.ui = {};
      ids.forEach(id => { if (!this.ui[id]) this.ui[id] = $(id); });
      this.ui.fieldSize.textContent = this.racers.length;
      this.ui.standingsList.innerHTML = '';
      this.buildMinimapBase();
      this.ui.minimap.width = 190; this.ui.minimap.height = 190;
    }

    buildMinimapBase() {
      const size = 190, pad = 18;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const s of this.track.samples) {
        minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
        minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
      }
      const spanX = maxX - minX, spanZ = maxZ - minZ;
      const scale = Math.min((size - pad * 2) / spanX, (size - pad * 2) / spanZ);
      const ox = (size - spanX * scale) / 2 - minX * scale;
      const oz = (size - spanZ * scale) / 2 - minZ * scale;
      this.map = { scale, ox, oz, size };
      this.mapPoints = this.track.samples.map(s => [s.p.x * scale + ox, s.p.z * scale + oz]);

      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      g.clearRect(0, 0, size, size);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      this.mapPoints.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.closePath();
      g.strokeStyle = 'rgba(3,6,15,.8)'; g.lineWidth = 14; g.stroke();
      g.strokeStyle = 'rgba(63,116,158,.5)'; g.lineWidth = 8; g.stroke();
      g.strokeStyle = 'rgba(151,236,255,.55)'; g.lineWidth = 1.4; g.stroke();
      // inner glow line
      g.strokeStyle = 'rgba(255,45,141,.25)'; g.lineWidth = 1; g.stroke();
      // start line
      const a = this.mapPoints[0], b = this.mapPoints[this.mapPoints.length - 1];
      g.strokeStyle = '#eaff5a'; g.lineWidth = 4; g.beginPath();
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      this.mapBase = c;
    }

    /* ---- input ---------------------------------------------------------- */
    bindUI() {
      const bind = (id, fn) => { const el = this.ui[id]; if (el) el.addEventListener('click', fn); };
      bind('startBtn', () => { this.audio.init(); this.audio.ui(); this.startRace(); });
      bind('pauseBtn', () => this.pauseGame());
      bind('resumeBtn', () => this.resumeGame());
      bind('restartBtn', () => { this.audio.ui(); this.startRace(); });
      bind('againBtn', () => { this.audio.ui(); this.startRace(); });
      bind('quitBtn', () => { this.audio.ui(); this.quitToMenu(); });
      bind('menuBtn', () => { this.audio.ui(); this.quitToMenu(); });
      bind('muteBtn', () => this.toggleMute());
      this.ui.muteBtn.classList.toggle('muted', this.audio.muted);

      const paintPick = this.ui.paintPick;
      if (paintPick) {
        paintPick.addEventListener('input', () => this.setPaint(paintPick.value));
        paintPick.addEventListener('change', () => this.audio.ui());
      }
      bind('paintReset', () => { this.audio.ui(); this.setPaint(null); });

      const touchMap = { left: 'left', right: 'right', gas: 'gas', brake: 'brake', drift: 'drift', boost: 'boost' };
      document.querySelectorAll('[data-touch]').forEach(btn => {
        const key = touchMap[btn.dataset.touch];
        const on = (e) => { e.preventDefault(); this.touch[key] = true; btn.setPointerCapture && btn.setPointerCapture(e.pointerId); };
        const off = (e) => { e.preventDefault(); this.touch[key] = false; };
        btn.addEventListener('pointerdown', on);
        btn.addEventListener('pointerup', off);
        btn.addEventListener('pointercancel', off);
        btn.addEventListener('pointerleave', off);
      });
    }

    bindInput() {
      const map = {
        KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake',
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
        Space: 'drift', ShiftLeft: 'boost', ShiftRight: 'boost'
      };
      window.addEventListener('keydown', (e) => {
        if (e.code in map) {
          this.input[map[e.code]] = true;
          if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        }
        if (e.repeat) return;
        if (e.code === 'Escape') {
          if (this.state === 'racing' || this.state === 'countdown') this.pauseGame();
          else if (this.state === 'paused') this.resumeGame();
        }
        if (e.code === 'KeyM') this.toggleMute();
        if (e.code === 'KeyR' && this.state === 'racing') {
          this.player.resetToTrack();
          this.showMessage('已复位 · RESET');
          this.audio.ui();
          this.snapCamera = true;
        }
        if (e.code === 'Enter' && this.state === 'menu') {
          this.audio.init(); this.startRace();
        }
      });
      window.addEventListener('keyup', (e) => {
        if (e.code in map) this.input[map[e.code]] = false;
      });
      window.addEventListener('blur', () => {
        this.clearInput();
        if (this.state === 'racing' || this.state === 'countdown') this.pauseGame();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && (this.state === 'racing' || this.state === 'countdown')) this.pauseGame();
      });
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    clearInput() {
      for (const k in this.input) this.input[k] = false;
      for (const k in this.touch) this.touch[k] = false;
    }

    readGamepad() {
      if (!navigator.getGamepads) return null;
      const pads = navigator.getGamepads();
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const steer = Math.abs(p.axes[0] || 0) > .14 ? (p.axes[0] || 0) : 0;
        const gas = p.buttons[7] ? p.buttons[7].value : 0;
        const brake = p.buttons[6] ? p.buttons[6].value : 0;
        const btnA = !!(p.buttons[0] && p.buttons[0].pressed);
        const btnX = !!(p.buttons[2] && p.buttons[2].pressed);
        if (steer || gas > .08 || brake > .08 || btnA || btnX) {
          return {
            steer, gas, brake,
            drift: btnA,
            boost: btnX
          };
        }
      }
      return null;
    }

    getControls(dt) {
      const gp = this.readGamepad();
      // Internal steering is positive toward the car's +X side, which appears
      // left on screen with our behind-the-car camera. Invert player input so
      // A / left-stick-left turns screen-left and D / stick-right turns right.
      let steerInput = (this.input.left || this.touch.left ? 1 : 0) - (this.input.right || this.touch.right ? 1 : 0);
      if (gp && gp.steer) steerInput = -gp.steer;
      this.steer = damp(this.steer, steerInput, 11, dt);
      if (Math.abs(this.steer) < .015) this.steer = 0;
      const throttle = gp && gp.gas > .05 ? gp.gas : ((this.input.gas || this.touch.gas) ? 1 : 0);
      const brake = gp && gp.brake > .05 ? gp.brake : ((this.input.brake || this.touch.brake) ? 1 : 0);
      this.lastThrottle = throttle;
      return {
        throttle,
        brake,
        steer: this.steer,
        drift: !!(this.input.drift || this.touch.drift || (gp && gp.drift)),
        boost: !!(this.input.boost || this.touch.boost || (gp && gp.boost))
      };
    }

    /* ---- flow ----------------------------------------------------------- */
    startRace() {
      const fromMenu = this.state === 'menu';
      this.clearInput();
      this.steer = 0;
      this.lastThrottle = 0;
      this.finishedOrder = [];
      this.lastLapCount = 0;
      this.messageTimer = 0;
      this.raceTime = 0;
      this.acc = 0;
      this.goTimer = 0;
      this.resultTimer = 0;
      this.shake = 0;
      this.smokeTimer = 0;
      this.state = 'countdown';
      this.countdownT = 3.0;
      this.countdownLast = 3;
      this.pausedFrom = 'racing';
      this.ui.menu.classList.add('hidden');
      this.ui.results.classList.add('hidden');
      this.ui.pause.classList.add('hidden');
      this.ui.hud.classList.remove('hidden');
      this.ui.countdown.classList.remove('hidden');
      this.ui.touchControls.classList.add('active');
      document.body.classList.add('racing');
      try { this.canvas.focus({ preventScroll: true }); } catch (e) { this.canvas.focus(); }
      this.ui.startFlash.classList.remove('on');
      this.ui.raceMessage.textContent = '';
      this.ui.wrongWay.classList.remove('on');
      this.ui.driftBadge.classList.remove('on');
      this.resetGrid();
      this.player.nitro = 100;
      this.showCountdown('3');
      this.audio.startEngine();
      this.audio.setPaused(false);
      this.audio.countdown(3);
      this.track.setStartLights(1, false);
      if (this.speedLines) this.speedLines.material.opacity = 0;
      this.showMessage(`${this.track.lapCount} 圈 · ${this.racers.length} 位车手`, 3);
      this.snapCamera = !fromMenu;
      this.menuTime = 0;
      this.updateStandings(true);
    }

    resetGrid() {
      for (const g of this.grid) {
        g.racer.placeOnGrid(g.s < 0 ? this.track.total + g.s : g.s, g.lat);
        g.racer.lapStart = 0;
        g.racer.lapTimes = [];
        g.racer.bestLap = Infinity;
        g.racer.lastLap = 0;
        g.racer.drifting = false;
        g.racer.boosting = false;
        g.racer.nitro = 100;
        g.racer.topSpeed = 0;
        g.racer.driftCharge = 0;
        g.racer.model.visible = true;
        if (g.racer.ai) {
          g.racer.ai.steer = 0;
          g.racer.ai.laneTimer = 0;
          g.racer.ai.throttle = 1;
          g.racer.ai.brake = 0;
          g.racer.ai.drift = false;
          g.racer.ai.boost = false;
        }
      }
      this.player.finished = false;
      this.player.finishPlace = 0;
      this.player.finishTime = 0;
      this.placeState = 4;
      this.snapCamera = true;
    }

    resetToMenu(initial) {
      this.state = 'menu';
      this.menuTime = 0;
      this.raceTime = 0;
      this.clearInput();
      for (const g of this.grid) {
        g.racer.placeOnGrid(g.s < 0 ? this.track.total + g.s : g.s, g.lat);
        g.racer.model.visible = true;
      }
      this.player.finished = false;
      this.ui.hud.classList.add('hidden');
      this.ui.results.classList.add('hidden');
      this.ui.pause.classList.add('hidden');
      this.ui.countdown.classList.add('hidden');
      this.ui.menu.classList.remove('hidden');
      this.ui.touchControls.classList.remove('active');
      document.body.classList.remove('racing');
      this.audio.setPaused(true);
      if (this.speedLines) this.speedLines.material.opacity = 0;
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
      this.snapCamera = true;
      this.updateMenuBest();
      if (!initial) this.showMenuIntro();
    }

    showMenuIntro() {
      // slow reveal of the start grid, handled by the menu camera orbit
    }

    quitToMenu() {
      this.resetToMenu(false);
      this.audio.setPaused(true);
      this.track.setStartLights(0, false);
      this.ui.results.classList.add('hidden');
      this.ui.pause.classList.add('hidden');
    }

    pauseGame() {
      if (this.state !== 'racing' && this.state !== 'countdown') return;
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.ui.pause.classList.remove('hidden');
      this.audio.setPaused(true);
      this.clearInput();
    }

    resumeGame() {
      if (this.state !== 'paused') return;
      this.state = this.pausedFrom;
      this.ui.pause.classList.add('hidden');
      this.audio.setPaused(false);
      this.last = performance.now();
      this.snapCamera = false;
    }

    toggleMute() {
      const muted = this.audio.toggleMute();
      this.ui.muteBtn.classList.toggle('muted', muted);
      this.showMessage(muted ? '静音 · MUTED' : '声音开启 · AUDIO ON', 1.6);
    }

    onRacerFinish(racer) {
      if (this.finishedOrder.includes(racer)) return;
      this.finishedOrder.push(racer);
      racer.finishPlace = this.finishedOrder.length;
      if (racer.isPlayer) {
        this.state = 'finishing';
        this.resultTimer = 1.25;
        this.audio.finish(racer.finishPlace === 1);
        this.showMessage(racer.finishPlace === 1 ? '冠军 · VICTORY' : '完赛 · RACE COMPLETE', 3);
        this.ui.touchControls.classList.remove('active');
        this.clearInput();
      } else {
        racer.model.visible = false;
      }
    }

    showResults() {
      this.state = 'results';
      const p = this.player;
      const place = p.finishPlace || this.racers.filter(r => r.finished && r.finishPlace < (p.finishPlace || 99)).length + 1;
      const wins = ['冠军', '亚军', '季军', '完赛'];
      const kicks = ['RACE WINNER', 'PODIUM FINISH', 'PODIUM FINISH', 'RACE COMPLETE'];
      const subs = [
        '山道之王，今晚属于你。',
        '只差一点点。再来一圈，把冠军抢回来。',
        '登上领奖台。前面还有两台车等着你。',
        '轮胎已冷，但线路已经记住了。'
      ];
      this.ui.resultTitle.textContent = wins[Math.min(place - 1, 3)];
      this.ui.resultKicker.textContent = kicks[Math.min(place - 1, 3)];
      this.ui.resultSub.textContent = subs[Math.min(place - 1, 3)];
      this.ui.resultPlace.textContent = place;
      this.ui.resultTime.textContent = fmt(p.finishTime || this.raceTime);
      this.ui.resultBest.textContent = fmt(p.bestLap);
      this.ui.resultSpeed.textContent = Math.round(p.topSpeed);
      this.ui.resultDrift.textContent = Math.round(p.driftCharge);
      this.ui.resultTable.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'result-row result-head';
      head.innerHTML = '<span class="rpos">P</span><span class="rname">DRIVER</span><span class="rbest">BEST</span><span class="rgap">GAP</span>';
      this.ui.resultTable.appendChild(head);

      const order = this.racers.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishPlace - b.finishPlace;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.raceDistance - a.raceDistance;
      });
      const winner = order[0];
      order.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'result-row' + (r.isPlayer ? ' me' : '');
        const gap = r.finished
          ? (r === winner ? 'WINNER' : '+' + (r.finishTime - winner.finishTime).toFixed(2) + 's')
          : '+' + Math.max(0, (winner.raceDistance - r.raceDistance) / 38).toFixed(1) + 's';
        row.innerHTML = `<span class="rpos">0${i + 1}</span><span class="rname">${r.name}${r.isPlayer ? ' · YOU' : ''}</span>` +
          `<span class="rbest">${fmt(r.bestLap)}</span><span class="rgap">${gap}</span>`;
        this.ui.resultTable.appendChild(row);
      });

      const rec = this.record[this.setup.track] || (this.record[this.setup.track] = {});
      const newRecord = !rec.lap || (p.bestLap && p.bestLap < rec.lap);
      if (p.bestLap && p.bestLap < Infinity && newRecord) {
        rec.lap = p.bestLap;
        rec.total = p.finishTime;
        this.saveRecord();
        this.ui.resultKicker.textContent = 'NEW TRACK RECORD';
      }
      this.ui.results.classList.remove('hidden');
      this.updateMenuBest();
      this.ui.touchControls.classList.remove('active');
      document.body.classList.remove('racing');
      this.audio.setPaused(true);
      this.snapCamera = true;
    }

    loadRecord() {
      let data = {};
      try { data = JSON.parse(localStorage.getItem('neonRidgeRecord') || '{}'); } catch (e) { data = {}; }
      // records are kept per circuit now; migrate the old single-track shape
      if (data && data.lap) data = { [NR.TRACKS[0].id]: { lap: data.lap, total: data.total } };
      return data || {};
    }

    saveRecord() {
      try { localStorage.setItem('neonRidgeRecord', JSON.stringify(this.record)); } catch (e) { /* noop */ }
    }

    updateMenuBest() {
      const rec = this.record[this.setup.track];
      if (this.ui.menuBest) this.ui.menuBest.textContent = rec && rec.lap ? fmt(rec.lap) : '--:--.---';
    }

    showMessage(text, time) {
      this.ui.raceMessage.textContent = text;
      this.messageTimer = time || 2.2;
    }

    showCountdown(txt) {
      this.ui.countdown.classList.remove('hidden');
      this.ui.countdownNum.textContent = txt;
      this.ui.countdownSub.textContent = txt === 'GO!' ? 'FULL THROTTLE' : 'HOLD THE LINE';
      this.ui.countdownNum.classList.toggle('go', txt === 'GO!');
      this.ui.countdown.classList.remove('pop');
      void this.ui.countdown.offsetWidth;
      this.ui.countdown.classList.add('pop');
    }

    /* ---- race update ---------------------------------------------------- */
    updateRace(dt) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 8) {
        const ctrl = this.getControls(STEP);
        this.player.update(STEP, ctrl, this.raceTime);
        for (const r of this.opponents) {
          if (!r.finished) r.ai.update(STEP, this.raceTime);
        }
        this.resolveCollisions();
        this.raceTime += STEP;
        this.acc -= STEP;
        steps++;
        if (this.state !== 'racing') break;
      }
      if (steps === 8) this.acc = 0;
      this.updateStandings();
      this.updateLapEvents();
      this.checkWrongWay();
      this.spawnDriftSmoke(dt);
    }

    resolveCollisions() {
      const cars = this.racers;
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          if (a.finished || b.finished) continue;
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const d2 = dx * dx + dz * dz;
          const min = 2.65;
          if (d2 > min * min || d2 < .0001) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const push = (min - d) * .52;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          const av = a.vel.x * nx + a.vel.z * nz;
          const bv = b.vel.x * nx + b.vel.z * nz;
          const rel = av - bv;
          if (rel > 0) {
            const imp = rel * .58;
            a.vel.x -= nx * imp; a.vel.z -= nz * imp;
            b.vel.x += nx * imp; b.vel.z += nz * imp;
            if ((a.isPlayer || b.isPlayer) && rel > 2.5) {
              this.shake = Math.min(.8, this.shake + rel * .018);
              this.audio.collision(Math.min(1, rel / 10));
            }
          }
        }
      }
    }

    updateStandings(force) {
      const sorted = this.racers.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishPlace - b.finishPlace;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.raceDistance - a.raceDistance;
      });
      sorted.forEach((r, i) => { r.place = i + 1; });
      this.sorted = sorted;
      const p = this.player;
      this.ui.positionNum.textContent = p.place;
      if (p.place === 1) this.ui.positionGap.textContent = 'LEADER';
      else {
        const ahead = sorted[p.place - 2];
        const gap = ahead ? Math.max(0, ahead.raceDistance - p.raceDistance) : 0;
        this.ui.positionGap.textContent = '+' + (gap / 42).toFixed(1) + 's';
      }

      if (force || performance.now() - (this._lastStanding || 0) > 260) {
        this._lastStanding = performance.now();
        this.ui.standingsList.innerHTML = '';
        sorted.forEach((r, i) => {
          const row = document.createElement('div');
          row.className = 'standing-row' + (r.isPlayer ? ' me' : '');
          row.innerHTML = `<span class="pos">0${i + 1}</span><span class="dot" style="background:${cssColor(r.color)};color:${cssColor(r.color)}"></span>` +
            `<span class="name">${r.name}</span><span class="gap">${r.finished ? 'FIN' : (i === 0 ? 'LDR' : '+' + ((sorted[0].raceDistance - r.raceDistance) / 42).toFixed(1))}</span>`;
          this.ui.standingsList.appendChild(row);
        });
      }
    }

    updateLapEvents() {
      if (this.state !== 'racing') return;
      const p = this.player;
      if (p.lapTimes.length > this.lastLapCount) {
        this.lastLapCount = p.lapTimes.length;
        const lap = p.lastLap;
        const isBest = Math.abs(lap - p.bestLap) < .001;
        this.showMessage(`LAP ${p.completedLaps} · ${fmtShort(lap)}${isBest ? ' · BEST' : ''}`, 2.6);
        if (isBest) this.audio.bestLap(); else this.audio.lap();
      }
      const finalLap = this.track.lapCount - 1;
      if (p.completedLaps >= finalLap && !this._finalLapShown && p.lapTimes.length === finalLap) {
        this._finalLapShown = true;
        this.showMessage('FINAL LAP · 最后一圈', 2.8);
      }
      if (p.completedLaps === 0) this._finalLapShown = false;
    }

    checkWrongWay() {
      const p = this.player;
      if (!p.info) return;
      const dot = p.vel.x * p.info.t.x + p.vel.z * p.info.t.z;
      const wrong = Math.abs(p.speed) > 5 && dot < -4;
      this.ui.wrongWay.classList.toggle('on', wrong);
    }

    spawnDriftSmoke(dt) {
      const p = this.player;
      if (this.state !== 'racing' || !p.drifting || Math.abs(p.driftAngle) < .07) return;
      this.smokeTimer -= dt;
      if (this.smokeTimer > 0) return;
      this.smokeTimer = .035;
      const h = p.heading;
      const fwd = new V3(Math.sin(h), 0, Math.cos(h));
      const side = new V3(Math.cos(h), 0, -Math.sin(h));
      const base = new V3(p.pos.x - fwd.x * 1.5, p.pos.y + .18, p.pos.z - fwd.z * 1.5);
      const color = new THREE.Color(p.drifting ? 0xff9dcb : 0xe8fdff);
      for (const sd of [-1, 1]) {
        const x = base.x + side.x * .85 * sd + (Math.random() - .5) * .25;
        const z = base.z + side.z * .85 * sd + (Math.random() - .5) * .25;
        this.smoke.spawn(x, base.y, z,
          side.x * sd * 1.4 + (Math.random() - .5) * 1.5,
          1 + Math.random() * 1.4,
          side.z * sd * 1.4 + (Math.random() - .5) * 1.5,
          color, 1.2 + Math.random() * 1.1, .8 + Math.random() * .5);
      }
    }

    onWallHit(racer, pos, power) {
      if (racer !== this.player) return;
      this.shake = Math.min(1, this.shake + power * 1.2 + .18);
      this.audio.collision(power);
      const color = new THREE.Color(power > .55 ? 0xffb15c : 0xff6b9e);
      for (let i = 0; i < Math.floor(10 + power * 18); i++) {
        this.sparks.spawn(
          pos.x, pos.y + .3 + Math.random() * .7, pos.z,
          (Math.random() - .5) * 12, 1 + Math.random() * 5, (Math.random() - .5) * 12,
          color, .16 + Math.random() * .22, .35 + Math.random() * .45
        );
      }
    }

    onBoost(racer) {
      if (racer.isPlayer) {
        this.audio.boost();
        this.shake = Math.min(this.shake + .18, .7);
      }
    }

    /* ---- camera --------------------------------------------------------- */
    updateMenuCamera(dt) {
      const p = this.player;
      const h = p.heading;
      const fwd = new V3(Math.sin(h), 0, Math.cos(h));
      const side = new V3(Math.cos(h), 0, -Math.sin(h));
      const t = Math.sin(this.menuTime * .13);
      const desired = new V3(
        p.pos.x - fwd.x * (7.7 + t * .45) - side.x * (6.2 + t * .55),
        p.pos.y + 3.05 + Math.sin(this.menuTime * .19) * .12,
        p.pos.z - fwd.z * (7.7 + t * .45) - side.z * (6.2 + t * .55)
      );
      const look = new V3(
        p.pos.x + fwd.x * 3.6 - side.x * 4.0,
        p.pos.y + .88,
        p.pos.z + fwd.z * 3.6 - side.z * 4.0
      );
      if (this.snapCamera) {
        this.camera.position.copy(desired);
        this.lookAt.copy(look);
        this.snapCamera = false;
      } else {
        this.camera.position.lerp(desired, 1 - Math.exp(-2.5 * dt));
        this.lookAt.lerp(look, 1 - Math.exp(-3.2 * dt));
      }
      this.camera.fov = damp(this.camera.fov, 57, 2, dt);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.lookAt);
    }

    updateChaseCamera(dt, mode) {
      const p = this.player;
      const h = p.heading;
      const fwd = new V3(Math.sin(h), 0, Math.cos(h));
      const side = new V3(Math.cos(h), 0, -Math.sin(h));
      const speedN = clamp(Math.abs(p.speed) / 52, 0, 1.35);

      let desired, look, fovTarget;
      if (mode === 'finish') {
        const a = this.menuTime * .35 + .6;
        desired = new V3(
          p.pos.x + Math.cos(a) * 8.5,
          p.pos.y + 3.3,
          p.pos.z + Math.sin(a) * 8.5
        );
        look = new V3(p.pos.x, p.pos.y + .65, p.pos.z);
        fovTarget = 55;
      } else {
        const back = 8.2 + speedN * 1.35;
        const high = 3.55 + speedN * .28;
        const sideOffset = clamp(-p.vel.dot(side) * .045, -.9, .9) - this.steer * .15;
        desired = new V3(
          p.pos.x - fwd.x * back + side.x * sideOffset,
          p.pos.y + high,
          p.pos.z - fwd.z * back + side.z * sideOffset
        );
        look = new V3(
          p.pos.x + fwd.x * (8 + speedN * 8) + side.x * sideOffset * .3,
          p.pos.y + 1.15,
          p.pos.z + fwd.z * (8 + speedN * 8) + side.z * sideOffset * .3
        );
        fovTarget = 63 + speedN * 10 + (p.boosting ? 6 : 0);
      }

      if (this.snapCamera) {
        this.camera.position.copy(desired);
        this.lookAt.copy(look);
        this.snapCamera = false;
      } else {
        const posLerp = mode === 'finish' ? 2.2 : mode === 'intro' ? 2.6 : 9.2;
        const lookLerp = mode === 'intro' ? 3.4 : 9.5;
        this.camera.position.lerp(desired, 1 - Math.exp(-posLerp * dt));
        this.lookAt.lerp(look, 1 - Math.exp(-lookLerp * dt));
      }
      this.camera.fov = damp(this.camera.fov, fovTarget, 3.2, dt);
      this.camera.updateProjectionMatrix();

      if (this.shake > .002) {
        const s = this.shake;
        this.camera.position.x += (Math.random() - .5) * s * .14;
        this.camera.position.y += (Math.random() - .5) * s * .12;
        this.lookAt.x += (Math.random() - .5) * s * .18;
        this.lookAt.y += (Math.random() - .5) * s * .12;
        this.shake = Math.max(0, this.shake - dt * (1.5 + s * 1.4));
      }
      this.camera.lookAt(this.lookAt);
      if (mode !== 'finish') this.camera.rotateZ(-p.model.rotation.z * .38);
    }

    updateSpeedLines(dt) {
      const p = this.player;
      const speedN = clamp(Math.abs(p.speed) / 52, 0, 1.2);
      const target = this.state === 'racing' ? clamp((speedN - .5) * .8 + (p.boosting ? .5 : 0), 0, .72) : 0;
      const m = this.speedLines.material;
      m.opacity = damp(m.opacity, target, 4, dt);
      if (m.opacity < .01) return;
      const positions = this.speedLinePos;
      const move = (25 + Math.abs(p.speed) * 3.2 + (p.boosting ? 45 : 0)) * dt;
      for (let i = 0; i < this.speedLineData.length; i++) {
        const d = this.speedLineData[i];
        d.z += move;
        if (d.z > -3) {
          d.z = -55 - Math.random() * 35;
          const ang = Math.random() * Math.PI * 2;
          const rad = 1.7 + Math.random() * 5.2;
          d.x = Math.cos(ang) * rad;
          d.y = Math.sin(ang) * rad * .55;
        }
        const o = i * 6;
        positions[o] = d.x; positions[o + 1] = d.y; positions[o + 2] = d.z;
        positions[o + 3] = d.x; positions[o + 4] = d.y; positions[o + 5] = d.z + d.len;
      }
      this.speedLines.geometry.attributes.position.needsUpdate = true;
    }

    /* ---- HUD ------------------------------------------------------------ */
    updateHUD(dt) {
      const p = this.player;
      this.ui.raceTime.textContent = fmt(this.raceTime);
      const lap = clamp(Math.floor(Math.max(0, p.raceDistance) / this.track.total) + 1, 1, this.track.lapCount);
      this.ui.lapNum.textContent = lap;
      const current = p.completedLaps === 0 ? this.raceTime : this.raceTime - p.lapStart;
      this.ui.lapTime.textContent = fmt(Math.max(0, current));
      this.ui.bestLap.textContent = fmt(p.bestLap);

      const kmh = Math.round(Math.abs(p.speed) * 3.6);
      this.ui.speedNum.textContent = String(kmh).padStart(3, '0');
      this.ui.speedo.style.setProperty('--v', clamp(kmh / 240, 0, 1).toFixed(3));
      this.ui.speedo.classList.toggle('hot', kmh > 150);
      this.ui.speedo.classList.toggle('boost', !!p.boosting);
      let gear = 'N';
      if (p.speed < -.5) gear = 'R';
      else if (kmh > 0) gear = String(clamp(Math.ceil(kmh / 38), 1, 6));
      this.ui.gearNum.textContent = gear;

      const n = clamp(p.nitro / p.nitroMax, 0, 1);
      this.ui.nitroFill.style.width = (n * 100).toFixed(1) + '%';
      this.ui.nitroPct.textContent = Math.round(n * 100);
      this.ui.nitroPanel.classList.toggle('active', !!p.boosting);
      this.ui.nitroPanel.classList.toggle('empty', n <= .01);

      const showDrift = p.drifting && Math.abs(p.driftAngle) > .06;
      this.ui.driftBadge.classList.toggle('on', showDrift);
      if (showDrift) this.ui.driftScore.textContent = '+' + Math.round(p.driftCharge);

      // lap sector bars
      const frac = ((Math.max(0, p.raceDistance) / this.track.total) % 1 + 1) % 1;
      const bars = this.ui.sectorBars.children;
      for (let i = 0; i < 3; i++) {
        const f = clamp((frac * 3 - i) * 100, 0, 100);
        bars[i].style.setProperty('--fill', f + '%');
        bars[i].classList.toggle('done', f >= 99.9);
      }

      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
        if (this.messageTimer <= 0) this.ui.raceMessage.textContent = '';
      }
      this.updateMinimap();
      this.updateSpeedLines(dt);
    }

    updateMinimap() {
      const ctx = this.ui.minimap.getContext('2d');
      const size = 190;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(this.mapBase, 0, 0);
      // route pulse at start
      ctx.save();
      const p = this.player;
      // other cars first
      for (const r of this.racers) {
        if (r === p) continue;
        const x = r.pos.x * this.map.scale + this.map.ox;
        const y = r.pos.z * this.map.scale + this.map.oz;
        ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(r.color); ctx.fill();
        ctx.strokeStyle = 'rgba(5,8,20,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      const x = p.pos.x * this.map.scale + this.map.ox;
      const y = p.pos.z * this.map.scale + this.map.oz;
      const fwdX = Math.sin(p.heading), fwdZ = Math.cos(p.heading);
      const ang = Math.atan2(fwdX, -fwdZ);
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5.2, 5.4); ctx.lineTo(0, 2.8); ctx.lineTo(-5.2, 5.4); ctx.closePath();
      ctx.fillStyle = '#aeffff'; ctx.shadowColor = '#21f4ff'; ctx.shadowBlur = 10; ctx.fill();
      ctx.strokeStyle = '#041018'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }

    /* ---- frame ---------------------------------------------------------- */
    frame(now) {
      requestAnimationFrame(this.frame);
      if (this._crashed) return;
      try {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, .05);

      this.track.update(dt);
      const p = this.player;

      if (this.state === 'menu') {
        this.menuTime += dt;
        this.updateMenuCamera(dt);
        const seq = Math.floor(this.menuTime * 1.8) % 7;
        this.track.setStartLights(Math.min(5, seq), false);
        this.audio.update(0, 0, 0, false, false);
      } else if (this.state === 'countdown') {
        this.countdownT -= dt;
        const n = Math.ceil(this.countdownT);
        if (n !== this.countdownLast) {
          this.countdownLast = n;
          if (n > 0) {
            this.showCountdown(String(n));
            this.audio.countdown(n);
            this.track.setStartLights(n === 3 ? 1 : n === 2 ? 3 : 5, false);
          } else {
            this.state = 'racing';
            this.raceTime = 0;
            this.goTimer = .82;
            this.showCountdown('GO!');
            this.track.setStartLights(5, true);
            this.audio.go();
            this.ui.startFlash.classList.remove('on');
            void this.ui.startFlash.offsetWidth;
            this.ui.startFlash.classList.add('on');
            this.track.setStartLights(5, true);
            this.ui.touchControls.classList.add('active');
          }
        }
        this.updateChaseCamera(dt, 'intro');
        this.audio.update(0, this.lastThrottle || 0, 0, false, false);        this.updateHUDLite();
      } else if (this.state === 'racing' || this.state === 'finishing') {
        if (this.state === 'racing') {
          this.updateRace(dt);
          if (this.goTimer > 0) {
            this.goTimer -= dt;
            if (this.goTimer <= 0) this.ui.countdown.classList.add('hidden');
          }
          this.updateChaseCamera(dt, 'race');
          this.audio.update(
            Math.abs(p.speed) * 3.6,
            this.lastThrottle || 0,
            p.drifting ? Math.abs(p.driftAngle) : 0,
            p.boosting,
            p.offroad
          );
        } else {
          this.resultTimer -= dt;
          this.menuTime += dt;
          this.updateChaseCamera(dt, 'finish');
          if (this.resultTimer <= 0) this.showResults();
          this.audio.update(0, 0, 0, false, false);
        }
        this.updateHUD(dt);
      } else if (this.state === 'paused') {
        this.audio.update(0, 0, 0, false, false);
      } else if (this.state === 'results') {
        this.menuTime += dt;
        this.updateChaseCamera(dt, 'finish');
        this.updateSpeedLines(dt);
      }

      // particles
      this.smoke.update(dt);
      this.sparks.update(dt);

      // shadow follows the action
      const focus = (this.state === 'menu' || this.state === 'results') ? p.pos : p.pos;
      this.track.moon.position.set(focus.x - 50, 80, focus.z + 42);
      this.track.moon.target.position.set(focus.x, 0, focus.z);
      this.track.moon.target.updateMatrixWorld();

      this.renderer.render(this.scene, this.camera);

      if (!this._loaded) {
        this._loaded = true;
        // the official car model is parsed from an embedded glb at runtime;
        // keep the loader up until every racer has its body attached
        const carReady = NR.carModelReady || Promise.resolve();
        carReady.then(() => setTimeout(() => $('loading').classList.add('done'), 250));
      }
      } catch (err) {
        this._crashed = true;
        console.error(err);
        const el = $('loading');
        if (el) {
          el.classList.remove('done');
          el.innerHTML = '<div class="loading-text" style="color:#ff8bc2;line-height:2">RUNTIME ERROR<br><span style="color:#7e92ad">' +
            String(err && err.message || err).replace(/</g, '&lt;') + '</span></div>';
        }
      }
    }

    updateHUDLite() {
      this.ui.raceTime.textContent = '00:00.000';
      this.ui.lapNum.textContent = '1';
      this.ui.speedNum.textContent = '000';
      this.ui.speedo.style.setProperty('--v', '0');
      this.ui.gearNum.textContent = 'N';
      this.ui.lapTime.textContent = '00:00.000';
      this.ui.bestLap.textContent = '--:--.---';
      this.updateMinimap();
    }
  }

  // returning from the garage (cars.html) - rebuild the field with the new
  // machine instead of showing a stale bfcache snapshot
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  window.addEventListener('DOMContentLoaded', () => {
    try {
      new Game();
    } catch (err) {
      console.error(err);
      const el = document.getElementById('loading');
      if (el) {
        el.classList.remove('done');
        el.innerHTML = '<div class="loading-text" style="color:#ff8bc2;line-height:2">加载失败<br><span style="color:#7e92ad">' +
          String(err && err.message || err).replace(/</g, '&lt;') + '</span></div>';
      }
    }
  });
})();
