/* ==========================================================================
   NEON RIDGE — world, circuit and procedural art
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0);
  const TAU = Math.PI * 2;
  // shared helpers live in js/util.js so the garage page can use them too
  const { clamp, wrapAngle, rng, canvas2d, tex, glowTexture } = NR.util;

  function asphaltTexture(renderer) {
    const r = rng(41);
    const [c, g] = canvas2d(256, 256);
    g.fillStyle = '#252b38'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = 26 + Math.floor(r() * 38);
      g.fillStyle = `rgba(${v},${v + 2},${v + 7},${.12 + r() * .25})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 20; i++) {
      g.strokeStyle = `rgba(12,15,22,${.05 + r() * .12})`;
      g.lineWidth = .5 + r() * 2;
      g.beginPath();
      const x = r() * 256;
      g.moveTo(x, 0); g.bezierCurveTo(x + 18, 80, x - 22, 180, x + 8, 256);
      g.stroke();
    }
    // faint longitudinal tyre polish
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(.28, 'rgba(6,8,14,.2)');
    grad.addColorStop(.5, 'rgba(0,0,0,0)');
    grad.addColorStop(.72, 'rgba(6,8,14,.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    return tex(c, renderer, 3.2, 1);
  }

  function groundTexture(renderer) {
    const r = rng(9);
    const [c, g] = canvas2d(256, 256);
    g.fillStyle = '#080b18'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3800; i++) {
      const v = Math.floor(8 + r() * 20);
      g.fillStyle = `rgba(${v},${v + 4},${v + 12},${.18 + r() * .28})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    g.strokeStyle = 'rgba(40,68,98,.08)'; g.lineWidth = 1;
    for (let i = -256; i < 512; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
      g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke();
    }
    return tex(c, renderer, 90, 90);
  }

  function windowTexture(renderer) {
    const r = rng(21);
    const [c, g] = canvas2d(128, 256);
    g.fillStyle = '#080c1b'; g.fillRect(0, 0, 128, 256);
    // structure bands
    g.fillStyle = 'rgba(70,97,140,.16)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 1, 256);
    for (let y = 0; y < 256; y += 14) g.fillRect(0, y, 128, 1);
    const colors = ['#77e9ff', '#ff72b8', '#ffd36e', '#d7f6ff', '#7b8dff'];
    for (let y = 4; y < 250; y += 14) {
      for (let x = 4; x < 124; x += 10) {
        if (r() < .25) {
          g.fillStyle = colors[Math.floor(r() * colors.length)];
          g.globalAlpha = .25 + r() * .62;
          g.fillRect(x, y, 5, 7);
        }
      }
    }
    g.globalAlpha = 1;
    // neon crown
    g.fillStyle = '#1ff3ff'; g.fillRect(0, 0, 128, 2);
    return tex(c, renderer);
  }

  function checkerTexture(renderer) {
    const [c, g] = canvas2d(256, 64);
    const s = 16;
    for (let y = 0; y < 64; y += s) {
      for (let x = 0; x < 256; x += s) {
        g.fillStyle = ((x / s + y / s) & 1) ? '#eafcff' : '#11162a';
        g.fillRect(x, y, s, s);
      }
    }
    return tex(c, renderer);
  }

  function bannerTexture(renderer, label) {
    const [c, g] = canvas2d(1024, 192);
    g.fillStyle = '#070a18'; g.fillRect(0, 0, 1024, 192);
    g.strokeStyle = '#22f5ff'; g.lineWidth = 4; g.strokeRect(5, 5, 1014, 182);
    g.fillStyle = '#ff2d8d'; g.fillRect(5, 5, 12, 182); g.fillRect(1007, 5, 12, 182);
    // checkered edge strips
    for (let y = 18; y < 176; y += 22) {
      for (let i = 0; i < 2; i++) {
        g.fillStyle = ((y / 22 + i) & 1) ? '#e9fbff' : '#1a2033';
        g.fillRect(30 + i * 22, y, 22, 22);
        g.fillRect(950 + i * 22, y, 22, 22);
      }
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f1fdff';
    g.font = '900 72px Bahnschrift, Arial Narrow, sans-serif';
    g.fillText(label || 'NEON RIDGE', 512, 84);
    g.fillStyle = '#22f5ff';
    g.font = '700 22px Consolas, monospace';
    g.fillText('S T A R T   /   F I N I S H', 512, 141);
    return tex(c, renderer);
  }

  function billboardTexture(renderer, title, sub, c1, c2, variant) {
    const [c, g] = canvas2d(512, 256);
    g.fillStyle = '#070b18'; g.fillRect(0, 0, 512, 256);
    const gr = g.createLinearGradient(0, 0, 512, 256);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.globalAlpha = .22; g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.globalAlpha = 1;
    g.strokeStyle = c1; g.lineWidth = 5; g.strokeRect(7, 7, 498, 242);
    if (variant === 1) {
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
      for (let i = -256; i < 512; i += 34) { g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
    } else if (variant === 2) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 2 ? c1 : c2; g.globalAlpha = .18;
        g.fillRect(20 + i * 54, 190, 28, 50);
      }
      g.globalAlpha = 1;
    }
    g.fillStyle = '#f2fdff';
    g.font = '900 98px Bahnschrift, Arial Narrow, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(title, 35, 105);
    g.fillStyle = c1;
    g.fillRect(37, 159, 118, 6);
    g.fillStyle = '#9db4c7';
    g.font = '700 22px Consolas, monospace';
    g.fillText(sub, 37, 195);
    g.fillStyle = c1;
    g.font = '700 16px Consolas, monospace';
    g.fillText('NR // 01', 402, 225);
    return tex(c, renderer);
  }

  function palmLeafGeometry() {
    const positions = [];
    const indices = [];
    let vi = 0;
    const fronds = 8;
    for (let f = 0; f < fronds; f++) {
      const a = f / fronds * TAU + (f % 2) * .18;
      const len = 2.6 + (f % 3) * .35;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz, pz = dx;
      const y0 = 0, y1 = .55 + (f % 2) * .25, y2 = -.15;
      const w0 = .22, w1 = .52, w2 = .05;
      positions.push(
        px * w0, y0, pz * w0,
        -px * w0, y0, -pz * w0,
        dx * len * .55 + px * w1, y1, dz * len * .55 + pz * w1,
        dx * len * .55 - px * w1, y1, dz * len * .55 - pz * w1,
        dx * len + px * w2, y2, dz * len + pz * w2,
        dx * len - px * w2, y2, dz * len - pz * w2
      );
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2, vi + 2, vi + 3, vi + 4, vi + 3, vi + 5, vi + 4);
      vi += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /* Circuits. Each layout is a simple closed polygon whose corners get
     filleted, so the ribbon stays clean around hairpins and chicanes. */
  const TRACKS = [
    {
      id: 'ridge', name: 'NEON RIDGE', sub: '霓虹山道', code: '01',
      halfWidth: 9.4, laps: 3,
      path: {
        corners: [
          [0, 0, 0], [70, 0, 0], [115, .8, 25], [140, 1.8, 70],
          [125, 2.8, 110], [85, 3.4, 132], [55, 3.0, 112], [36, 2.4, 128],
          [58, 3.2, 160], [20, 2.6, 178], [-40, 1.6, 170], [-92, .9, 144],
          [-122, .4, 104], [-110, .2, 66], [-126, 0, 24], [-108, -.2, -22],
          [-78, -.3, -42], [-38, -.2, -38]
        ],
        radii: [22, 24, 26, 24, 20, 18, 16, 16, 18, 22, 24, 22, 20, 18, 20, 22, 18, 20]
      },
      sky: { bg: 0x05060f, fog: 0x090b1c, fogDensity: .00235, top: 0x03040d, mid: 0x0b0c27, horizon: 0x30144a },
      scenery: { ridge: [0x0b1024, 0x111631, 0x191d3d], city: 0x9aa9c9 }
    },
    {
      id: 'docks', name: 'NEON DOCKS', sub: '霓虹港区', code: '02',
      halfWidth: 10.2, laps: 3,
      path: {
        corners: [
          [0, 0, 0], [85, 0, 2], [120, 0, 22], [120, .4, 74],
          [96, .6, 94], [96, .8, 138], [136, 1.0, 158], [136, 1.2, 196],
          [88, 1.4, 212], [48, 1.2, 192], [46, .9, 152], [4, .7, 140],
          [-28, 1.0, 160], [-70, 1.2, 152], [-96, 1.0, 116], [-78, .7, 82],
          [-110, .5, 46], [-104, .3, 2], [-70, .2, -20], [-32, .1, -14]
        ],
        radii: [20, 22, 20, 18, 18, 20, 22, 20, 18, 16, 18, 18, 20, 22, 20, 18, 20, 22, 20, 18]
      },
      sky: { bg: 0x03070e, fog: 0x06121c, fogDensity: .0022, top: 0x020610, mid: 0x06203a, horizon: 0x0d3f58 },
      scenery: { ridge: [0x061a2a, 0x0b2740, 0x124a63], city: 0x86dcf4 }
    },
    {
      id: 'canyon', name: 'VIPER CANYON', sub: '毒蛇峡谷', code: '03',
      halfWidth: 8.8, laps: 3,
      path: {
        corners: [
          [0, 0, 0], [74, 1.6, 10], [122, 4.6, 40], [136, 8.2, 90],
          [116, 11, 132], [70, 10, 148], [32, 7.4, 128], [-8, 5.2, 152],
          [-58, 7.8, 166], [-108, 6.4, 142], [-130, 3.4, 96], [-116, 1.2, 56],
          [-82, .4, 26], [-56, 0, -8], [-20, -.2, -20]
        ],
        radii: [24, 26, 28, 26, 22, 18, 16, 18, 22, 24, 22, 20, 18, 20, 22]
      },
      sky: { bg: 0x0a0509, fog: 0x160812, fogDensity: .0026, top: 0x0a0409, mid: 0x241026, horizon: 0x5a1636 },
      scenery: { ridge: [0x170811, 0x250c1b, 0x3b1329], city: 0xffa9be }
    }
  ];

  /* Fillets every corner, then resamples the result at a constant spacing.
     Even spacing matters: the Catmull-Rom resampler below overshoots when
     control points are packed unevenly, which would pinch the ribbon. */
  function filletPath(corners, radii, step) {
    const n = corners.length, raw = [];
    let last = null;
    const push = (x, z) => {
      if (last) {
        const d = Math.hypot(x - last[0], z - last[1]);
        if (d < .8) return;
      }
      raw.push([x, z]);
      last = [x, z];
    };
    const straight = (A, B) => {
      const d = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (d < .01) return;
      const m = Math.max(1, Math.round(d / step));
      for (let k = 1; k <= m; k++) {
        push(A[0] + (B[0] - A[0]) * k / m, A[1] + (B[1] - A[1]) * k / m);
      }
    };

    const arcs = [];
    for (let i = 0; i < n; i++) {
      const P = corners[(i - 1 + n) % n], C = corners[i], N = corners[(i + 1) % n];
      const dIn = Math.hypot(C[0] - P[0], C[2] - P[2]);
      const dOut = Math.hypot(N[0] - C[0], N[2] - C[2]);
      const ux = (C[0] - P[0]) / dIn, uz = (C[2] - P[2]) / dIn;
      const vx = (N[0] - C[0]) / dOut, vz = (N[2] - C[2]) / dOut;
      const turn = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz);
      const r = Math.min(radii[i], .45 * Math.min(dIn, dOut) / Math.max(1e-4, Math.tan(Math.abs(turn) / 2)));
      if (Math.abs(turn) < .05 || r < 1.5) {
        arcs.push({ S: [C[0], C[2]], E: [C[0], C[2]] });
        continue;
      }
      const t = r * Math.tan(Math.abs(turn) / 2);
      const S = [C[0] - ux * t, C[2] - uz * t];
      const E = [C[0] + vx * t, C[2] + vz * t];
      const bx = vx - ux, bz = vz - uz, bl = Math.hypot(bx, bz);
      const mag = r / Math.cos(Math.abs(turn) / 2);
      const cx = C[0] + bx / bl * mag, cz = C[2] + bz / bl * mag;
      arcs.push({ S, E, cx, cz, turn, r, a0: Math.atan2(S[1] - cz, S[0] - cx) });
    }

    for (let i = 0; i < n; i++) {
      const a = arcs[i];
      if (i === 0) push(a.S[0], a.S[1]);
      else straight(arcs[i - 1].E, a.S);
      if (a.cx === undefined) continue;
      const m = Math.max(4, Math.ceil(Math.abs(a.turn) * a.r / step));
      for (let k = 1; k <= m; k++) {
        const ang = a.a0 + a.turn * (k / m);
        push(a.cx + Math.cos(ang) * a.r, a.cz + Math.sin(ang) * a.r);
      }
    }
    straight(arcs[n - 1].E, arcs[0].S);

    const m = raw.length, cum = [0];
    for (let i = 1; i <= m; i++) {
      const a = raw[i - 1], b = raw[i % m];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const L = cum[m], count = Math.max(48, Math.round(L / step));
    const pts = [];
    let seg = 0;
    for (let k = 0; k < count; k++) {
      const target = L * k / count;
      while (seg < m - 1 && cum[seg + 1] < target) seg++;
      const a = raw[seg], b = raw[(seg + 1) % m];
      const f = (target - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      pts.push(new V3(a[0] + (b[0] - a[0]) * f, 0, a[1] + (b[1] - a[1]) * f));
    }

    // lift each point onto the height profile authored on the corners
    for (const p of pts) {
      let best = Infinity, y = 0;
      for (let i = 0; i < n; i++) {
        const A = corners[i], B = corners[(i + 1) % n];
        const ex = B[0] - A[0], ez = B[2] - A[2], L2 = ex * ex + ez * ez;
        let u = ((p.x - A[0]) * ex + (p.z - A[2]) * ez) / L2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(p.x - (A[0] + ex * u), p.z - (A[2] + ez * u));
        if (d < best) { best = d; y = A[1] + (B[1] - A[1]) * u; }
      }
      p.y = y;
    }
    return pts;
  }

  function trackPoints(cfg) {
    return filletPath(cfg.path.corners, cfg.path.radii, 4);
  }

  // Flat outline used by the menu thumbnails.
  function trackOutline(cfg, count) {
    const curve = new THREE.CatmullRomCurve3(trackPoints(cfg), true, 'catmullrom', .5);
    return curve.getSpacedPoints(count || 110).map(p => [p.x, p.z]);
  }

  /* ======================================================================== */
  class Track {
    constructor(scene, renderer, cfg) {
      this.scene = scene;
      this.renderer = renderer;
      this.cfg = cfg = cfg || TRACKS[0];
      this.id = cfg.id;
      this.name = cfg.name;
      this.sub = cfg.sub;
      this.halfWidth = cfg.halfWidth || 9.4;
      this.wallWidth = 2.55;
      this.collisionWidth = 1.72;
      this.lapCount = cfg.laps || 3;
      this.sky = cfg.sky || {};
      this.startLights = [];

      if (this.sky.bg !== undefined) this.scene.background = new THREE.Color(this.sky.bg);
      if (this.sky.fog !== undefined) {
        this.scene.fog = new THREE.FogExp2(this.sky.fog, this.sky.fogDensity || .00235);
      }

      this.points = trackPoints(cfg);

      this.curve = new THREE.CatmullRomCurve3(this.points, true, 'catmullrom', .5);
      this.curve.arcLengthDivisions = 2400;
      this.N = 760;
      this.samples = [];
      const pts = this.curve.getSpacedPoints(this.N).slice(0, this.N);
      const segLen = [];
      this.total = 0;
      for (let i = 0; i < this.N; i++) {
        const d = pts[i].distanceTo(pts[(i + 1) % this.N]);
        segLen.push(d);
        this.total += d;
      }
      this.segment = this.total / this.N;
      this.dist = [0];
      for (let i = 1; i < this.N; i++) this.dist[i] = this.dist[i - 1] + segLen[i - 1];
      for (let i = 0; i < this.N; i++) {
        const p = pts[i];
        const prev = pts[(i - 1 + this.N) % this.N];
        const next = pts[(i + 1) % this.N];
        const t = new V3().subVectors(next, prev).normalize();
        const side = new V3().crossVectors(UP, t).normalize();
        this.samples.push({ p, t, side });
      }
      this.samples.total = this.total;

      // Every root object built below is recorded so the circuit can be
      // swapped from the menu without leaking GPU resources.
      const own = this.own = [];
      const sceneAdd = this.scene.add.bind(this.scene);
      this.scene.add = (...objs) => { own.push(...objs); return sceneAdd(...objs); };

      this.buildSurface();
      this.buildStart();
      this.buildScenery();
      this.buildSky();
      this.buildLights();

      this.scene.add = sceneAdd;
    }

    dispose() {
      for (const o of this.own) {
        this.scene.remove(o);
        o.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : null;
          if (!mats) return;
          for (const m of mats) {
            for (const key in m) {
              const v = m[key];
              if (v && v.isTexture) v.dispose();
            }
            m.dispose();
          }
        });
      }
      this.own.length = 0;
      this.startLights.length = 0;
    }

    /* ---- sampling -------------------------------------------------------- */
    at(s) {
      s = ((s % this.total) + this.total) % this.total;
      const u = s / this.total * this.N;
      const i = Math.floor(u) % this.N;
      const f = u - Math.floor(u);
      const a = this.samples[i], b = this.samples[(i + 1) % this.N];
      return {
        p: new V3().lerpVectors(a.p, b.p, f),
        t: new V3().lerpVectors(a.t, b.t, f).normalize(),
        side: new V3().lerpVectors(a.side, b.side, f).normalize(),
        s, index: i
      };
    }

    headingAt(s) {
      const a = this.at(s);
      return Math.atan2(a.t.x, a.t.z);
    }

    nearest(x, z, hint) {
      let best = Infinity, bi = 0;
      if (hint === undefined || hint === null) {
        for (let i = 0; i < this.N; i += 2) {
          const p = this.samples[i].p;
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < best) { best = d; bi = i; }
        }
        for (let i = bi - 3; i <= bi + 3; i++) {
          const k = (i + this.N) % this.N;
          const p = this.samples[k].p;
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < best) { best = d; bi = k; }
        }
      } else {
        for (let o = -34; o <= 34; o++) {
          const k = (hint + o + this.N) % this.N;
          const p = this.samples[k].p;
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < best) { best = d; bi = k; }
        }
      }
      const sm = this.samples[bi];
      const dx = x - sm.p.x, dz = z - sm.p.z;
      const lateral = dx * sm.side.x + dz * sm.side.z;
      const along = dx * sm.t.x + dz * sm.t.z;
      return {
        index: bi, s: this.dist[bi] + along, lateral, dist: Math.sqrt(best),
        p: sm.p, t: sm.t, side: sm.side, along
      };
    }

    curvature(s) {
      const a = this.at(s), b = this.at(s + 22);
      return Math.abs(wrapAngle(Math.atan2(b.t.x, b.t.z) - Math.atan2(a.t.x, a.t.z))) / 22;
    }

    /* ---- track surface --------------------------------------------------- */
    buildSurface() {
      const N = this.N, hw = this.halfWidth;
      const map = asphaltTexture(this.renderer);
      const roadPos = [], roadUv = [], roadIdx = [];
      const shoulderPos = [], shoulderUv = [], shoulderIdx = [];
      const lanePos = [], laneIdx = [];
      const gridPos = [], gridIdx = [];

      for (let i = 0; i < N; i++) {
        const a = this.samples[i], b = this.samples[(i + 1) % N];
        const ay = a.p.y + .025, by = b.p.y + .025;
        const al = new V3(a.p.x - a.side.x * hw, ay, a.p.z - a.side.z * hw);
        const ar = new V3(a.p.x + a.side.x * hw, ay, a.p.z + a.side.z * hw);
        const bl = new V3(b.p.x - b.side.x * hw, by, b.p.z - b.side.z * hw);
        const br = new V3(b.p.x + b.side.x * hw, by, b.p.z + b.side.z * hw);
        const base = roadPos.length / 3;
        roadPos.push(al.x, al.y, al.z, ar.x, ar.y, ar.z, bl.x, bl.y, bl.z, br.x, br.y, br.z);
        roadUv.push(0, this.dist[i] / 9, 1, this.dist[i] / 9, 0, (this.dist[i] + this.segment) / 9, 1, (this.dist[i] + this.segment) / 9);
        roadIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);

        // gravel run-off on both sides
        for (const sd of [-1, 1]) {
          const inA = new V3(a.p.x + a.side.x * hw * sd, ay - .02, a.p.z + a.side.z * hw * sd);
          const outA = new V3(a.p.x + a.side.x * (hw + 2.4) * sd, ay - .06, a.p.z + a.side.z * (hw + 2.4) * sd);
          const inB = new V3(b.p.x + b.side.x * hw * sd, by - .02, b.p.z + b.side.z * hw * sd);
          const outB = new V3(b.p.x + b.side.x * (hw + 2.4) * sd, by - .06, b.p.z + b.side.z * (hw + 2.4) * sd);
          const sb = shoulderPos.length / 3;
          shoulderPos.push(inA.x, inA.y, inA.z, outA.x, outA.y, outA.z, inB.x, inB.y, inB.z, outB.x, outB.y, outB.z);
          shoulderUv.push(0, this.dist[i] / 5, 1, this.dist[i] / 5, 0, (this.dist[i] + this.segment) / 5, 1, (this.dist[i] + this.segment) / 5);
          if (sd > 0) shoulderIdx.push(sb, sb + 2, sb + 1, sb + 1, sb + 3, sb + 2);
          else shoulderIdx.push(sb, sb + 1, sb + 2, sb + 1, sb + 3, sb + 2);
        }

        // dashed centre line
        if (i % 8 === 0) {
          const sa = this.samples[i];
          const p = sa.p;
          const c = new V3(p.x, p.y + .045, p.z);
          const l = new V3(c.x - sa.side.x * .1, c.y, c.z - sa.side.z * .1);
          const rr = new V3(c.x + sa.side.x * .1, c.y, c.z + sa.side.z * .1);
          const far = this.at(this.dist[i] + 4.2);
          const l2 = new V3(far.p.x - far.side.x * .1, far.p.y + .045, far.p.z - far.side.z * .1);
          const r2 = new V3(far.p.x + far.side.x * .1, far.p.y + .045, far.p.z + far.side.z * .1);
          const b = lanePos.length / 3;
          lanePos.push(l.x, l.y, l.z, rr.x, rr.y, rr.z, l2.x, l2.y, l2.z, r2.x, r2.y, r2.z);
          laneIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }

        // grid slot markings, behind start line
        if (i === N - 15 || i === N - 8) {
          const sA = this.samples[i];
          const sB = this.samples[(i + 3) % N];
          for (const lat of [-3.5, 3.5]) {
            const l1 = new V3(sA.p.x + sA.side.x * (lat - 1.15), sA.p.y + .05, sA.p.z + sA.side.z * (lat - 1.15));
            const r1 = new V3(sA.p.x + sA.side.x * (lat + 1.15), sA.p.y + .05, sA.p.z + sA.side.z * (lat + 1.15));
            const l2 = new V3(sB.p.x + sB.side.x * (lat - 1.15), sB.p.y + .05, sB.p.z + sB.side.z * (lat - 1.15));
            const r2 = new V3(sB.p.x + sB.side.x * (lat + 1.15), sB.p.y + .05, sB.p.z + sB.side.z * (lat + 1.15));
            const gb = gridPos.length / 3;
            gridPos.push(
              l1.x, l1.y, l1.z, r1.x, r1.y, r1.z, l2.x, l2.y, l2.z, r2.x, r2.y, r2.z
            );
            gridIdx.push(gb, gb + 2, gb + 1, gb + 1, gb + 2, gb + 3);
          }
        }
      }

      const mkGeo = (pos, uv, idx) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx); g.computeVertexNormals(); return g;
      };

      const road = new THREE.Mesh(mkGeo(roadPos, roadUv, roadIdx), new THREE.MeshStandardMaterial({
        map, color: 0xb9c8dd, roughness: .76, metalness: .08
      }));
      road.receiveShadow = true;
      this.scene.add(road);
      this.road = road;

      const shoulder = new THREE.Mesh(mkGeo(shoulderPos, shoulderUv, shoulderIdx), new THREE.MeshStandardMaterial({
        color: 0x111726, roughness: 1, metalness: 0
      }));
      shoulder.receiveShadow = true;
      this.scene.add(shoulder);

      const lane = new THREE.Mesh(mkGeo(lanePos, null, laneIdx), new THREE.MeshBasicMaterial({
        color: 0xcfefff, transparent: true, opacity: .58, depthWrite: false
      }));
      this.scene.add(lane);

      const grid = new THREE.Mesh(mkGeo(gridPos, null, gridIdx), new THREE.MeshBasicMaterial({
        color: 0xf3fdff, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false
      }));
      this.scene.add(grid);

      this.buildCurbsAndWalls();
    }

    buildCurbsAndWalls() {
      const N = this.N, hw = this.halfWidth;
      const curbColors = [new THREE.Color(0xff3b5c), new THREE.Color(0xe8f9ff)];
      const positions = [], colors = [], indices = [];
      const wallPos = [], wallIdx = [];
      const neonAPos = [], neonAIdx = [], neonBPos = [], neonBIdx = [];
      for (let i = 0; i < N; i++) {
        const a = this.samples[i], b = this.samples[(i + 1) % N];
        const col = curbColors[Math.floor(this.dist[i] / 3.1) % 2];
        for (const sd of [-1, 1]) {
          const p1 = new V3(a.p.x + a.side.x * hw * sd, a.p.y + .06, a.p.z + a.side.z * hw * sd);
          const p2 = new V3(a.p.x + a.side.x * (hw + 1.15) * sd, a.p.y + .1, a.p.z + a.side.z * (hw + 1.15) * sd);
          const p3 = new V3(b.p.x + b.side.x * hw * sd, b.p.y + .06, b.p.z + b.side.z * hw * sd);
          const p4 = new V3(b.p.x + b.side.x * (hw + 1.15) * sd, b.p.y + .1, b.p.z + b.side.z * (hw + 1.15) * sd);
          const base = positions.length / 3;
          positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          for (let k = 0; k < 4; k++) colors.push(col.r, col.g, col.b);
          if (sd > 0) indices.push(base, base + 2, base + 1, base + 1, base + 3, base + 2);
          else indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);

          // barrier wall
          const wo = hw + this.wallWidth;
          const w1 = new V3(a.p.x + a.side.x * wo * sd, a.p.y, a.p.z + a.side.z * wo * sd);
          const w2 = new V3(a.p.x + a.side.x * wo * sd, a.p.y + 1.05, a.p.z + a.side.z * wo * sd);
          const w3 = new V3(b.p.x + b.side.x * wo * sd, b.p.y, b.p.z + b.side.z * wo * sd);
          const w4 = new V3(b.p.x + b.side.x * wo * sd, b.p.y + 1.05, b.p.z + b.side.z * wo * sd);
          const wb = wallPos.length / 3;
          wallPos.push(w1.x, w1.y, w1.z, w2.x, w2.y, w2.z, w3.x, w3.y, w3.z, w4.x, w4.y, w4.z);
          if (sd > 0) wallIdx.push(wb, wb + 2, wb + 1, wb + 1, wb + 2, wb + 3);
          else wallIdx.push(wb, wb + 1, wb + 2, wb + 1, wb + 3, wb + 2);

          // glowing top rails, one colour per side
          const rail = sd > 0 ? neonAPos : neonBPos;
          const railIdx = sd > 0 ? neonAIdx : neonBIdx;
          const r1 = new V3(a.p.x + a.side.x * (wo - .09) * sd, a.p.y + 1.06, a.p.z + a.side.z * (wo - .09) * sd);
          const r2 = new V3(a.p.x + a.side.x * (wo + .09) * sd, a.p.y + 1.06, a.p.z + a.side.z * (wo + .09) * sd);
          const r3 = new V3(b.p.x + b.side.x * (wo - .09) * sd, b.p.y + 1.06, b.p.z + b.side.z * (wo - .09) * sd);
          const r4 = new V3(b.p.x + b.side.x * (wo + .09) * sd, b.p.y + 1.06, b.p.z + b.side.z * (wo + .09) * sd);
          const rb = rail.length / 3;
          rail.push(r1.x, r1.y, r1.z, r2.x, r2.y, r2.z, r3.x, r3.y, r3.z, r4.x, r4.y, r4.z);
          if (sd > 0) railIdx.push(rb, rb + 2, rb + 1, rb + 1, rb + 3, rb + 2);
          else railIdx.push(rb, rb + 1, rb + 2, rb + 1, rb + 3, rb + 2);
        }
      }
      const curbGeo = new THREE.BufferGeometry();
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      curbGeo.setIndex(indices); curbGeo.computeVertexNormals();
      const curbs = new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: .53, metalness: .1, emissive: 0x160811, emissiveIntensity: .4
      }));
      curbs.receiveShadow = true;
      this.scene.add(curbs);

      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
      wallGeo.setIndex(wallIdx); wallGeo.computeVertexNormals();
      const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
        color: 0x141b2e, roughness: .8, metalness: .25, side: THREE.DoubleSide,
        emissive: 0x080d1c, emissiveIntensity: .5
      }));
      wall.receiveShadow = true;
      this.scene.add(wall);

      const railGeo = (p, i) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        g.setIndex(i); g.computeVertexNormals(); return g;
      };
      const railA = new THREE.Mesh(railGeo(neonAPos, neonAIdx), new THREE.MeshBasicMaterial({
        color: 0x22f5ff, toneMapped: false, transparent: true, opacity: .92
      }));
      const railB = new THREE.Mesh(railGeo(neonBPos, neonBIdx), new THREE.MeshBasicMaterial({
        color: 0xff2d8d, toneMapped: false, transparent: true, opacity: .8
      }));
      this.scene.add(railA, railB);
    }

    buildStart() {
      const a = this.at(0);
      const heading = Math.atan2(a.t.x, a.t.z);
      const group = new THREE.Group();
      group.position.copy(a.p);
      group.rotation.y = heading;
      this.scene.add(group);

      // checkered strip across the road
      const check = new THREE.Mesh(new THREE.PlaneGeometry(this.halfWidth * 2 + .6, 3.8), new THREE.MeshBasicMaterial({
        map: checkerTexture(this.renderer), transparent: true, opacity: .92, side: THREE.DoubleSide
      }));
      check.rotation.x = -Math.PI / 2;
      check.position.y = .055;
      check.receiveShadow = true;
      group.add(check);

      const steel = new THREE.MeshStandardMaterial({ color: 0x1a2238, roughness: .4, metalness: .72 });
      const cyan = new THREE.MeshBasicMaterial({ color: 0x22f5ff, toneMapped: false });
      const pink = new THREE.MeshBasicMaterial({ color: 0xff2d8d, toneMapped: false });
      const pillarGeo = new THREE.BoxGeometry(.58, 7, .58);
      const pillarX = this.halfWidth + this.wallWidth + .45;
      for (const sd of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, steel);
        pillar.position.set(sd * pillarX, 3.5, 0);
        pillar.castShadow = true;
        group.add(pillar);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(.07, 6.4, .1), sd > 0 ? pink : cyan);
        strip.position.set(sd * (pillarX - .34), 3.45, -.32);
        group.add(strip);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(.72, .9, .35, 12), steel);
        foot.position.set(sd * pillarX, .17, 0);
        group.add(foot);
      }

      const beam = new THREE.Mesh(new THREE.BoxGeometry(pillarX * 2 + .8, .62, .72), steel);
      beam.position.set(0, 7, 0);
      beam.castShadow = true;
      group.add(beam);

      const banner = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 2.5), new THREE.MeshBasicMaterial({
        map: bannerTexture(this.renderer, this.name), transparent: true, side: THREE.DoubleSide, toneMapped: false
      }));
      banner.position.set(0, 6.2, -.35);
      banner.rotation.y = Math.PI;
      group.add(banner);

      // five start lamps
      const lampGeo = new THREE.SphereGeometry(.21, 12, 10);
      for (let i = 0; i < 5; i++) {
        const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x29364b, toneMapped: false }));
        lamp.position.set((i - 2) * 1.15, 5.42, -.62);
        group.add(lamp);
        this.startLights.push(lamp);
      }
      const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(7.1, .9, .48), steel);
      lampHousing.position.set(0, 5.4, -.28);
      group.add(lampHousing);

      // glow sprites
      const glowTex = glowTexture();
      const addGlow = (x, y, z, color, size) => {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color, transparent: true, opacity: .55,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        spr.position.set(x, y, z); spr.scale.set(size, size, 1);
        group.add(spr);
      };
      addGlow(-(this.halfWidth + this.wallWidth + .45), 3.1, -.45, 0x22f5ff, 4);
      addGlow(this.halfWidth + this.wallWidth + .45, 3.1, -.45, 0xff2d8d, 4);

      const light = new THREE.PointLight(0x22f5ff, 1.6, 24, 2);
      light.position.set(0, 6, 0);
      group.add(light);

      this.startGroup = group;
      this.startHeading = heading;
    }

    buildScenery() {
      const scene = this.scene;
      const r = rng(77);
      const scenic = this.cfg.scenery || {};
      const ridgeCols = scenic.ridge || [0x0b1024, 0x111631, 0x191d3d];
      const cityCol = scenic.city === undefined ? 0x9aa9c9 : scenic.city;

      // wet dark ground
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), new THREE.MeshStandardMaterial({
        map: groundTexture(this.renderer), color: 0x657493, roughness: .98, metalness: .03
      }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -.3;
      ground.receiveShadow = true;
      scene.add(ground);

      // distant city ring
      const windowTex = windowTexture(this.renderer);
      const cityGeo = new THREE.BoxGeometry(1, 1, 1);
      const cityMat = new THREE.MeshBasicMaterial({ map: windowTex, color: cityCol, fog: true });
      const city = new THREE.InstancedMesh(cityGeo, cityMat, 96);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 96; i++) {
        const ang = i / 96 * TAU + r() * .06;
        const rad = 205 + r() * 135;
        const w = 7 + r() * 18, h = 16 + r() * 70, d = 7 + r() * 16;
        dummy.position.set(Math.cos(ang) * rad, h / 2 - 2, Math.sin(ang) * rad);
        dummy.rotation.set(0, ang + r() * .5, 0);
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        city.setMatrixAt(i, dummy.matrix);
      }
      city.instanceMatrix.needsUpdate = true;
      city.frustumCulled = false;
      scene.add(city);

      // mountains — three layered silhouettes
      this.buildRidge(430, 46, 104, ridgeCols[0], .95, 74, 13);
      this.buildRidge(350, 30, 76, ridgeCols[1], 1, 62, 31);
      this.buildRidge(285, 15, 48, ridgeCols[2], 1, 54, 8);

      // palms
      this.buildPalms(r);

      // light poles
      this.buildPoles();

      // billboards
      const boards = [
        { s: 105, side: 1, title: 'DRIFT', sub: 'HOLD THE SLIDE', c1: '#ff2d8d', c2: '#37112e', v: 1 },
        { s: 268, side: -1, title: 'NITRO', sub: 'CHASE THE LIGHT', c1: '#22f5ff', c2: '#0d2339', v: 2 },
        { s: 438, side: 1, title: 'RIDGE', sub: 'RADIO 88.7 FM', c1: '#eaff5a', c2: '#273012', v: 0 },
        { s: 604, side: -1, title: 'APEX', sub: 'NO BRAKES CLUB', c1: '#ff7a45', c2: '#351411', v: 1 },
        { s: 720, side: 1, title: 'NIGHT', sub: 'STAY UNTIL DAWN', c1: '#a98bff', c2: '#1a1435', v: 2 }
      ];
      boards.forEach(b => this.makeBillboard(b));

      // start-side grandstand
      this.makeGrandstand();

      // low glow haze above the track in the distance
      const hazeTex = glowTexture();
      for (let i = 0; i < 4; i++) {
        const s = i * this.total / 4 + 60;
        const a = this.at(s);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: hazeTex, color: i % 2 ? 0x2d5cff : 0xff2d8d, transparent: true,
          opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        spr.position.set(a.p.x, 15, a.p.z);
        spr.scale.set(110, 42, 1);
        scene.add(spr);
      }
    }

    buildRidge(radius, hMin, hMax, color, opacity, segments, seed) {
      const r = rng(seed);
      const heights = [];
      for (let i = 0; i <= segments; i++) {
        const wave = Math.sin(i * 1.7 + seed) * .18 + Math.sin(i * .43 + seed * 2) * .22;
        heights.push(hMin + (hMax - hMin) * clamp(.45 + wave + r() * .25, 0, 1));
      }
      const pos = [], idx = [];
      for (let i = 0; i <= segments; i++) {
        const a = i / segments * TAU;
        const rad = radius + Math.sin(i * .9 + seed) * 16;
        pos.push(Math.cos(a) * rad, -18, Math.sin(a) * rad);
        pos.push(Math.cos(a) * rad, heights[i], Math.sin(a) * rad);
      }
      for (let i = 0; i < segments; i++) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, side: THREE.DoubleSide, transparent: opacity < 1, opacity, fog: true
      }));
      this.scene.add(m);
    }

    buildPalms(r) {
      const count = 66;
      const dummy = new THREE.Object3D();
      const trunkGeo = new THREE.CylinderGeometry(.12, .28, 5.6, 5);
      const trunkMat = new THREE.MeshBasicMaterial({ color: 0x070d18 });
      const crownGeo = palmLeafGeometry();
      const crownMat = new THREE.MeshBasicMaterial({ color: 0x07111c, side: THREE.DoubleSide });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
      for (let i = 0; i < count; i++) {
        const s = r() * this.total;
        const a = this.at(s);
        const side = r() < .5 ? -1 : 1;
        const off = this.halfWidth + 9 + r() * 24;
        const x = a.p.x + a.side.x * off * side + a.t.x * (r() - .5) * 16;
        const z = a.p.z + a.side.z * off * side + a.t.z * (r() - .5) * 16;
        const sc = .7 + r() * .75;
        dummy.position.set(x, a.p.y + 2.8 * sc, z);
        dummy.scale.set(sc, sc, sc);
        dummy.rotation.set(0, r() * TAU, (r() - .5) * .12);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        dummy.position.y = a.p.y + 5.55 * sc;
        dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      trunks.frustumCulled = false;
      crowns.frustumCulled = false;
      this.scene.add(trunks, crowns);
    }

    buildPoles() {
      const spacing = 27;
      const count = Math.ceil(this.total / spacing) * 2;
      const postGeo = new THREE.CylinderGeometry(.075, .11, 5.4, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x1b2438, roughness: .45, metalness: .7 });
      const orbGeo = new THREE.SphereGeometry(.13, 8, 6);
      const orbs = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), count);
      const posts = new THREE.InstancedMesh(postGeo, postMat, count);
      const dummy = new THREE.Object3D();
      const glowPos = [], glowCol = [];
      let n = 0;
      for (let s = 0; s < this.total; s += spacing) {
        const a = this.at(s);
        for (const sd of [-1, 1]) {
          const off = this.halfWidth + 4.4;
          const x = a.p.x + a.side.x * off * sd, z = a.p.z + a.side.z * off * sd;
          dummy.position.set(x, a.p.y + 2.7, z);
          dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          posts.setMatrixAt(n, dummy.matrix);
          dummy.position.y = a.p.y + 5.42;
          dummy.updateMatrix();
          orbs.setMatrixAt(n, dummy.matrix);
          const col = sd > 0 ? new THREE.Color(0xff2d8d) : new THREE.Color(0x22f5ff);
          orbs.setColorAt(n, col);
          glowPos.push(x, a.p.y + 5.42, z);
          glowCol.push(col.r, col.g, col.b);
          n++;
        }
      }
      posts.instanceMatrix.needsUpdate = true;
      orbs.instanceMatrix.needsUpdate = true;
      posts.frustumCulled = false;
      orbs.frustumCulled = false;
      if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
      this.scene.add(posts, orbs);

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(glowCol, 3));
      const points = new THREE.Points(g, new THREE.PointsMaterial({
        size: 2.2, map: glowTexture(), transparent: true, opacity: .58,
        blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, sizeAttenuation: true
      }));
      this.scene.add(points);
    }

    makeBillboard(cfg) {
      const a = this.at(cfg.s);
      const heading = Math.atan2(a.t.x, a.t.z);
      const group = new THREE.Group();
      const off = this.halfWidth + 7.2;
      group.position.set(a.p.x + a.side.x * off * cfg.side, a.p.y, a.p.z + a.side.z * off * cfg.side);
      group.rotation.y = heading - cfg.side * Math.PI / 2;
      this.scene.add(group);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0x20293e, roughness: .5, metalness: .7 });
      for (const sx of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(.28, 6.2, .28), poleMat);
        pole.position.set(sx * 4, 3.1, 0);
        pole.castShadow = true;
        group.add(pole);
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 4.7), new THREE.MeshBasicMaterial({
        map: billboardTexture(this.renderer, cfg.title, cfg.sub, cfg.c1, cfg.c2, cfg.v),
        toneMapped: false, side: THREE.DoubleSide
      }));
      board.position.y = 5.5;
      group.add(board);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(9.8, 5.05, .16), new THREE.MeshStandardMaterial({
        color: 0x11182b, roughness: .35, metalness: .7, emissive: new THREE.Color(cfg.c1), emissiveIntensity: .14
      }));
      frame.position.set(0, 5.5, -.1);
      group.add(frame);

      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: new THREE.Color(cfg.c1), transparent: true,
        opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.position.set(0, 5.5, -.4);
      spr.scale.set(15, 9, 1);
      group.add(spr);
    }

    makeGrandstand() {
      const a = this.at(14);
      const heading = Math.atan2(a.t.x, a.t.z);
      const group = new THREE.Group();
      group.position.copy(a.p);
      group.rotation.y = heading;
      this.scene.add(group);

      const stepMat = new THREE.MeshStandardMaterial({ color: 0x1c2439, roughness: .7, metalness: .35 });
      const crowdMat = new THREE.MeshBasicMaterial({ color: 0x22f5ff, toneMapped: false });
      const pinkMat = new THREE.MeshBasicMaterial({ color: 0xff2d8d, toneMapped: false });
      for (let row = 0; row < 6; row++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, .55, 30), stepMat);
        step.position.set(this.halfWidth + 3.3 + row * 1.5, .28 + row * .55, 0);
        step.castShadow = true; step.receiveShadow = true;
        group.add(step);
        for (let i = 0; i < 9; i++) {
          if ((i + row) % 3 === 0) continue;
          const person = new THREE.Mesh(new THREE.BoxGeometry(.24, .5, .28), (i + row) % 2 ? crowdMat : pinkMat);
          person.position.set(this.halfWidth + 3.35 + row * 1.5, .78 + row * .55, -12.6 + i * 3.1);
          person.scale.y = .75 + ((i * 7 + row * 3) % 5) * .09;
          group.add(person);
        }
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, .35, 33), new THREE.MeshStandardMaterial({
        color: 0x11182a, roughness: .4, metalness: .6, emissive: 0x08101f, emissiveIntensity: 1
      }));
      roof.position.set(this.halfWidth + 7.3, 7.6, 0);
      roof.rotation.z = -.05;
      group.add(roof);
      for (const z of [-14, 0, 14]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.22, 7.2, .22), stepMat);
        post.position.set(this.halfWidth + 10.9, 3.7, z);
        group.add(post);
      }
      const neon = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 32.5), new THREE.MeshBasicMaterial({ color: 0x22f5ff, toneMapped: false }));
      neon.position.set(this.halfWidth + 3.0, 4.1, 0);
      group.add(neon);
      const neon2 = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 32.5), new THREE.MeshBasicMaterial({ color: 0xff2d8d, toneMapped: false }));
      neon2.position.set(this.halfWidth + 11.4, 7.8, 0);
      group.add(neon2);
    }

    buildSky() {
      const scene = this.scene;
      const skyGeo = new THREE.SphereGeometry(700, 32, 20);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(this.sky.top || 0x03040d) },
          uMid: { value: new THREE.Color(this.sky.mid || 0x0b0c27) },
          uHorizon: { value: new THREE.Color(this.sky.horizon || 0x30144a) },
          uMoon: { value: new THREE.Vector3(-.55, .16, -.82).normalize() },
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon;
          uniform vec3 uMoon; uniform float uTime;
          varying vec3 vWorld;
          void main() {
            vec3 dir = normalize(vWorld - cameraPosition);
            float h = clamp(dir.y, -0.1, 1.0);
            vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
            col = mix(col, uTop, smoothstep(0.22, 0.8, h));
            float horizonGlow = exp(-abs(h) * 16.0);
            col += vec3(0.34, 0.06, 0.24) * horizonGlow;
            float d = max(dot(dir, uMoon), 0.0);
            float disc = smoothstep(0.9993, 0.99975, d);
            float halo = pow(d, 220.0) * 0.55 + pow(d, 26.0) * 0.12;
            col += vec3(1.0, 0.72, 0.86) * disc * 1.25;
            col += vec3(0.55, 0.32, 0.85) * halo;
            // faint milky way band
            float band = exp(-pow((dir.x * .7 + dir.z * .4 + .15) * 4.2, 2.0));
            col += vec3(.09,.11,.22) * band * smoothstep(.05,.6,h) * .7;
            gl_FragColor = vec4(col, 1.0);
          }`
      });
      const sky = new THREE.Mesh(skyGeo, skyMat);
      scene.add(sky);
      this.skyMat = skyMat;

      // stars
      const r = rng(99);
      const pos = [], col = [];
      const c = new THREE.Color();
      for (let i = 0; i < 1900; i++) {
        const a = r() * TAU;
        const y = Math.pow(r(), .7) * .95 + .03;
        const rad = 500 + r() * 120;
        const rr = Math.sqrt(1 - y * y);
        pos.push(Math.cos(a) * rr * rad, y * rad, Math.sin(a) * rr * rad);
        const tint = r();
        c.setRGB(.55 + tint * .4, .65 + tint * .3, .9 + tint * .1);
        col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({
        size: 2.3, vertexColors: true, transparent: true, opacity: .9,
        map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      scene.add(stars);
    }

    buildLights() {
      const hemi = new THREE.HemisphereLight(0x4666b0, 0x080a14, 1.05);
      this.scene.add(hemi);

      const moon = new THREE.DirectionalLight(0xaecaff, 1.5);
      moon.position.set(-55, 80, 38);
      moon.castShadow = true;
      moon.shadow.mapSize.set(1536, 1536);
      const sc = moon.shadow.camera;
      sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62;
      sc.near = 1; sc.far = 220;
      sc.updateProjectionMatrix();
      moon.shadow.bias = -.0008;
      moon.shadow.normalBias = .04;
      this.scene.add(moon, moon.target);
      this.moon = moon;

      const fill = new THREE.DirectionalLight(0xff3d8f, .38);
      fill.position.set(60, 22, -50);
      this.scene.add(fill);

      const warm = new THREE.PointLight(0xff8a3d, .9, 70, 2);
      warm.position.set(30, 8, 110);
      this.scene.add(warm);

      const blue = new THREE.PointLight(0x2d5bff, 1.1, 80, 2);
      blue.position.set(-75, 9, 15);
      this.scene.add(blue);

      // pools of coloured light around the circuit keep the road readable at night
      for (let i = 0; i < 5; i++) {
        const a = this.at(this.total * (i / 5) + 45);
        const l = new THREE.PointLight(i % 2 ? 0xff2d8d : 0x21f4ff, .95, 52, 2);
        l.position.set(a.p.x, a.p.y + 7.5, a.p.z);
        this.scene.add(l);
      }
    }

    setStartLights(count, green) {
      for (let i = 0; i < this.startLights.length; i++) {
        const m = this.startLights[i].material;
        if (green) m.color.setHex(0x8cff5a);
        else if (i < count) m.color.setHex(0xff203f);
        else m.color.setHex(0x29364b);
      }
    }

    update(dt) {
      if (this.skyMat) this.skyMat.uniforms.uTime.value += dt;
    }
  }

  NR.TRACKS = TRACKS;
  NR.trackOutline = trackOutline;
  NR.Track = Track;
})();
