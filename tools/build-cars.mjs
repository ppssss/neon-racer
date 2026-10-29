/* Prepares the Nissan GT-R and Audi R8 glbs for the game.

   Both source models are far too heavy for a browser racer:

     GTR+35.glb   56 MB, 2.07 M triangles, one 1.27 M triangle body mesh and
                  four 198k triangle wheels
     r8.obj       17 MB OBJ, 167 groups, 72k triangles, millimetre units and
                  flat KeyShot materials (converted to glb by obj2gltf first)

   This script normalises both into the layout js/car-body.js expects:

     Lamborghini Temerario_Root   (any name works - the game only needs
       Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR   these five to exist)
       ...body meshes merged by material

   Steps, per car: bake each mesh's world matrix into its vertices (so the whole
   car becomes flat geometry with identity transforms - required because the
   game spins a wheel around that node's own X axis), regroup into body + four
   wheels, merge by material, weld, decimate, quantize, downscale textures.

   One-off tool - not needed to play. Install the dev dependencies in tools/
   and run it from there:

     cd tools && npm i @gltf-transform/core @gltf-transform/functions \
           @gltf-transform/extensions sharp meshoptimizer
     node build-cars.mjs all

   Output: assets/car/gtr.glb, assets/car/r8.glb
*/
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, join, prune, quantize, simplifyPrimitive,
  textureCompress, transformPrimitive, weld
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), '..', '..');

/* ---- per car configuration ---------------------------------------------- */
const CARS = {
  gtr: {
    src: 'assets/car/source/GTR/GTR+35.glb',
    out: 'assets/car/gtr.glb',
    scale: 1,
    // node name -> game wheel name (front pair first)
    wheels: {
      'Wheel.Ft.L': 'Wheel_FL',
      'Wheel.Ft.R': 'Wheel_FR',
      'Wheel.Bk.L': 'Wheel_RL',
      'Wheel.Bk.R': 'Wheel_RR'
    },
    // extra nodes that belong to a wheel, by name prefix
    wheelPrefix: { 'WheelBrake.Ft.L': 'Wheel.Ft.L', 'WheelBrake.Ft.R': 'Wheel.Ft.R',
      'WheelBrake.Bk.L': 'Wheel.Bk.L', 'WheelBrake.Bk.R': 'Wheel.Bk.R' },
    bodySimplify: { ratio: 0.06, error: 0.002 },
    wheelSimplify: { ratio: 0.025, error: 0.004 },
    textureSize: 512,
    textureQuality: 82
  },
  r8: {
    src: 'assets/car/source/R8/r8.glb',   // r8.obj converted once with obj2gltf
    out: 'assets/car/r8.glb',
    scale: 0.001,          // authoring units are millimetres
    // wheel meshes are found by name prefix, then split into the four corners
    // by the sign of their centroid (x > 0 is left, z > 0 is front)
    wheelByName: { prefixes: ['tyre', 'rims 1'] },
    bodySimplify: { ratio: 0.5, error: 0.0008 },
    wheelSimplify: { ratio: 0.5, error: 0.004 },
    textureSize: 256,
    textureQuality: 80
  },
  mclaren: {
    src: 'assets/car/source/mclaren/mclaren_mp45_2k.glb',
    out: 'assets/car/mclaren.glb',
    scale: 1,
    // the model has one node per axle - split each pair into left/right so the
    // game can steer and spin them individually
    splitWheelPair: { front_wheels: ['Wheel_FL', 'Wheel_FR'], back_wheels: ['Wheel_RL', 'Wheel_RR'] },
    bodySimplify: { ratio: 0.42, error: 0.0015 },
    wheelSimplify: { ratio: 0.5, error: 0.003 },
    textureSize: 512,
    textureQuality: 82
  },
  veyron: {
    src: 'assets/car/source/bugatti veyron/Bugatti veyron 0001.glb',
    out: 'assets/car/veyron.glb',
    scale: 1,
    // single merged mesh: no wheel nodes to steer, the wheels just ride along
    wheels: {},
    bodySimplify: { ratio: 0.6, error: 0.0012 },
    wheelSimplify: { ratio: 0.6, error: 0.003 },
    textureSize: 512,
    textureQuality: 82
  },
  f12: {
    src: 'assets/car/source/ferrari-F12/f12-raw.glb',   // Ferrari F12.obj -> obj2gltf
    out: 'assets/car/f12.glb',
    scale: 0.2527,          // authoring units: the car is 18.3 units long
    // Blender export names every part after its corner: F_L_ = front left ...
    wheelByPrefix: {
      'F_L_': 'Wheel_FL', 'F_WHEEL_L': 'Wheel_FL',
      'F_R_': 'Wheel_FR', 'F_WHEEL_R': 'Wheel_FR',
      'R_L_': 'Wheel_RL', 'R_L_': 'Wheel_RL',
      'R_R_': 'Wheel_RR'
    },
    drop: ['SEATS_'],       // 813k triangle leather interior
    stripNormals: true,     // unwelded triangle soup, cannot decimate otherwise
    bodySimplify: { ratio: 0.04, error: 0.01, lockBorder: false },
    wheelSimplify: { ratio: 0.012, error: 0.01, lockBorder: false },
    textureSize: 256,
    textureQuality: 80
  }
};

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/* real (dequantised) bounds of a primitive, from its raw position data */
function primBounds(prim) {
  const acc = prim.getAttribute('POSITION');
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], sum: [0, 0, 0], n: 0 };
  const el = [];
  for (let i = 0; i < acc.getCount(); i++) {
    acc.getElement(i, el);
    for (let k = 0; k < 3; k++) {
      out.min[k] = Math.min(out.min[k], el[k]);
      out.max[k] = Math.max(out.max[k], el[k]);
      out.sum[k] += el[k];
    }
    out.n++;
  }
  return out;
}

/* world-space AABB of a mesh node, from the primitive min/max boxes */
function nodeBounds(node, matrix) {
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const prim of node.getMesh().listPrimitives()) {
    const acc = prim.getAttribute('POSITION');
    const mn = acc.getMin([]), mx = acc.getMax([]);
    for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) {
      const p = [
        matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
      ];
      for (let k = 0; k < 3; k++) {
        out.min[k] = Math.min(out.min[k], p[k]);
        out.max[k] = Math.max(out.max[k], p[k]);
      }
    }
  }
  out.center = [0, 1, 2].map(k => (out.min[k] + out.max[k]) / 2);
  out.size = [0, 1, 2].map(k => out.max[k] - out.min[k]);
  return out;
}

/* Smooth per-vertex normals from the (already welded) index buffer. Used for
   models too dense to keep their exported normals: welding needs them gone,
   and without them three.js would flat-shade everything. */
function computeSmoothNormals(doc) {
  const buffer = doc.getRoot().listBuffers()[0];
  let done = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (!pos || !idx) continue;
      const count = pos.getCount();
      const acc = new Float32Array(count * 3);
      const a = [], b = [], c = [];
      for (let i = 0; i < idx.getCount(); i += 3) {
        const i0 = idx.getScalar(i), i1 = idx.getScalar(i + 1), i2 = idx.getScalar(i + 2);
        pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const k of [i0, i1, i2]) {
          acc[k * 3] += nx; acc[k * 3 + 1] += ny; acc[k * 3 + 2] += nz;
        }
      }
      for (let i = 0; i < count; i++) {
        const x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2];
        const len = Math.hypot(x, y, z);
        if (len < 1e-9) { acc[i * 3] = 0; acc[i * 3 + 1] = 1; acc[i * 3 + 2] = 0; }
        else { acc[i * 3] = x / len; acc[i * 3 + 1] = y / len; acc[i * 3 + 2] = z / len; }
      }
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(acc).setBuffer(buffer));
      done++;
    }
  }
  return done;
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const key of (process.argv[2] === 'all' ? Object.keys(CARS) : [process.argv[2]])) {
  const cfg = CARS[key];
  if (!cfg) { console.error('unknown car', key); continue; }
  console.log('\n=== ' + key + ' ===');

  const doc = await io.read(path.join(ROOT, cfg.src));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const modelRoot = scene.listChildren().length === 1 ? scene.listChildren()[0] : null;

  const countTris = () => root.listMeshes().reduce((n, m) =>
    n + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
  const report = (label) => console.log(
    label.padEnd(16), 'nodes', String(root.listNodes().length).padStart(4),
    '| meshes', String(root.listMeshes().length).padStart(4),
    '| tris', String(Math.round(countTris())).padStart(8),
    '| materials', String(root.listMaterials().length).padStart(3),
    '| textures', String(root.listTextures().length).padStart(3));
  report('source');

  /* 1. world matrix of every node ---------------------------------------- */
  const world = new Map();
  for (const s of root.listScenes()) {
    for (const n of s.listChildren()) {
      (function resolve(node, parentMatrix) {
        const m = mul(parentMatrix, node.getMatrix());
        world.set(node, m);
        for (const c of node.listChildren()) resolve(c, m);
      })(n, IDENTITY);
    }
  }

  /* 1b. drop nodes we never see (interiors) -------------------------------- */
  for (const pattern of (cfg.drop || [])) {
    for (const node of root.listNodes()) {
      const nm = node.getName() || '';
      if (!nm.startsWith(pattern)) continue;
      const doomed = [];
      node.traverse(n => doomed.push(n));
      for (const n of doomed.reverse()) n.dispose();
      console.log('dropped', nm);
    }
  }

  /* 2. which wheel does each mesh belong to? ------------------------------ */
  const wheelOf = new Map();     // mesh node -> game wheel name
  const wheelNames = new Set(cfg.wheels ? Object.values(cfg.wheels) : ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']);

  if (cfg.wheels) {
    const byNode = new Map();
    for (const [srcName, wheelName] of Object.entries(cfg.wheels)) {
      const node = root.listNodes().find(n => n.getName() === srcName);
      if (!node) { console.warn('missing wheel node', srcName); continue; }
      byNode.set(node, wheelName);
      node.traverse(n => { if (n !== node) wheelOf.set(n, wheelName); });
    }
    // brake nodes that live next to a wheel go with it
    for (const [prefix, owner] of Object.entries(cfg.wheelPrefix || {})) {
      const ownerNode = root.listNodes().find(n => n.getName() === owner);
      const wheelName = byNode.get(ownerNode);
      if (!wheelName) continue;
      for (const n of root.listNodes()) {
        if (n.getName() && n.getName().startsWith(prefix) && n !== ownerNode) wheelOf.set(n, wheelName);
      }
    }
    // any other top-level mesh that the loop above missed is body
  } else if (cfg.wheelByPrefix) {
    const entries = Object.entries(cfg.wheelByPrefix).sort((a, b) => b[0].length - a[0].length);
    for (const node of root.listNodes()) {
      if (!node.getMesh()) continue;
      const nm = node.getName() || '';
      const hit = entries.find(([prefix]) => nm.startsWith(prefix));
      if (hit) wheelOf.set(node, hit[1]);
    }
  } else if (cfg.wheelByHub) {
    // hubs are the centres of the tyre meshes; every small part near a hub is
    // part of that wheel (rim, disc, caliper, nuts...)
    const all = root.listNodes().filter(n => n.getMesh());
    const boxes = new Map(all.map(n => [n, nodeBounds(n, world.get(n) || IDENTITY)]));
    const car = all.reduce((acc, n) => {
      const b = boxes.get(n);
      return {
        min: acc.min.map((v, k) => Math.min(v, b.min[k])),
        max: acc.max.map((v, k) => Math.max(v, b.max[k]))
      };
    }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const carSize = [0, 1, 2].map(k => car.max[k] - car.min[k]);
    const carLen = Math.max(carSize[0], carSize[2]);
    const hubs = all
      .filter(n => (n.getName() || '').toLowerCase().includes(cfg.wheelByHub.match.toLowerCase()))
      .map(n => boxes.get(n).center);
    console.log('hubs found:', hubs.length);
    if (hubs.length !== 4) throw new Error('expected 4 tyre hubs, got ' + hubs.length);
    // name them: bigger z (or whatever axis is longest) is the front pair
    const alongZ = carSize[2] >= carSize[0];
    const axes = alongZ ? { front: 2, side: 0 } : { front: 0, side: 2 };
    const frontVal = Math.max(...hubs.map(h => h[axes.front]));
    const backVal = Math.min(...hubs.map(h => h[axes.front]));
    const radius = cfg.wheelByHub.radius * carLen;
    const named = hubs.map(h => {
      const isFront = Math.abs(h[axes.front] - frontVal) < Math.abs(h[axes.front] - backVal);
      const isLeft = h[axes.side] > 0;   // +X is the left side when +Z is forward
      return { h, name: 'Wheel_' + (isFront ? 'F' : 'R') + (isLeft ? 'L' : 'R') };
    });
    for (const node of all) {
      const b = boxes.get(node);
      const diag = Math.hypot(b.size[0], b.size[1], b.size[2]);
      if (diag > carLen * 0.55) continue;
      let best = null, bestD = Infinity;
      for (const n of named) {
        const d = Math.hypot(b.center[0] - n.h[0], b.center[1] - n.h[1], b.center[2] - n.h[2]);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best && bestD < radius) wheelOf.set(node, best.name);
    }
    console.log('wheel parts assigned:', wheelOf.size, 'radius', radius.toFixed(2));
  } else if (cfg.wheelByName) {
    const corners = new Map();   // 'FL' -> {sum:[..], n}
    const loose = [];
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const nm = node.getName() || '';
      if (!cfg.wheelByName.prefixes.some(p => nm.startsWith(p))) continue;
      const box = primBounds(mesh.listPrimitives()[0]);
      const cx = box.sum[0] / box.n, cz = box.sum[2] / box.n;
      loose.push({ node, cx, cz });
    }
    for (const item of loose) {
      const side = item.cx > 0 ? 'L' : 'R';
      const axle = item.cz > 0 ? 'F' : 'R';
      wheelOf.set(item.node, 'Wheel_' + axle + side);
    }
  }

  /* 3. bake world matrix (+ optional unit scale) into the vertices -------- */
  const SCALE = [cfg.scale, 0, 0, 0, 0, cfg.scale, 0, 0, 0, 0, cfg.scale, 0, 0, 0, 0, 1];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = mul(SCALE, world.get(node) || IDENTITY);
    for (const prim of mesh.listPrimitives()) transformPrimitive(prim, m);
  }

  /* 3b. split axle-wide wheel nodes into left/right halves ---------------- */
  if (cfg.splitWheelPair) {
    const buffer = root.listBuffers()[0];
    for (const [srcName, pair] of Object.entries(cfg.splitWheelPair)) {
      const node = root.listNodes().find(n => n.getName() === srcName && n.getMesh());
      if (!node) { console.warn('missing wheel pair', srcName); continue; }
      const box = nodeBounds(node, IDENTITY);
      const lateral = box.size[0] >= box.size[2] ? 0 : 2;  // the axis the two wheels sit on
      const mid = box.center[lateral];
      const sides = [{ name: pair[0], mesh: doc.createMesh('') }, { name: pair[1], mesh: doc.createMesh('') }];
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        const buckets = [[], []];
        const a = [], b = [], c = [];
        for (let i = 0; i < idx.getCount(); i += 3) {
          const i0 = idx.getScalar(i), i1 = idx.getScalar(i + 1), i2 = idx.getScalar(i + 2);
          pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
          const ctr = (a[lateral] + b[lateral] + c[lateral]) / 3;
          buckets[ctr >= mid ? 0 : 1].push(i0, i1, i2);
        }
        buckets.forEach((list, i) => {
          if (!list.length) return;
          const np = doc.createPrimitive();
          np.setMaterial(prim.getMaterial());
          np.setMode(prim.getMode());
          for (const sem of prim.listSemantics()) np.setAttribute(sem, prim.getAttribute(sem));
          np.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer));
          sides[i].mesh.addPrimitive(np);
        });
      }
      sides.forEach((side) => {
        const n = doc.createNode(side.name).setMesh(side.mesh);
        wheelOf.set(n, side.name);
      });
      console.log('split', srcName, 'into', pair.join(' / '), 'lateral axis', lateral);
      node.dispose();
    }
  }

  /* 4. flat hierarchy: model root -> [Wheel_XX | body meshes] ------------- */
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  const rootName = 'car';
  const bodyRoot = doc.createNode(rootName);
  scene.addChild(bodyRoot);

  // detach everything, then rebuild
  for (const node of root.listNodes()) {
    if (node === bodyRoot) continue;
    const parent = node.getParentNode();
    if (parent) parent.removeChild(node);
    node.setMatrix(IDENTITY);
  }
  for (const mesh of root.listMeshes()) mesh.setName('');

  const wheelNode = new Map();
  for (const w of wheelNames) {
    const n = doc.createNode(w);
    bodyRoot.addChild(n);
    wheelNode.set(w, n);
  }
  for (const node of meshNodes) {
    const w = wheelOf.get(node);
    node.setName('');
    (w ? wheelNode.get(w) : bodyRoot).addChild(node);
  }
  // drop nodes that are not part of the tree we just built
  for (const node of root.listNodes()) {
    if (node !== bodyRoot && !node.getParentNode()) node.dispose();
  }
  report('body + wheels');
  console.log('wheels:', [...wheelNames].map(w => w + ':' + wheelNode.get(w).listChildren().length + 'm').join(' '));

  /* 5. merge by material -------------------------------------------------- */
  await doc.transform(join({ keepNamed: true }));
  report('join');

  /* 6. weld, then decimate per mesh (wheels can go much harder) ----------- */
  if (cfg.stripNormals) {
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
    }
  }
  await doc.transform(weld());
  const isWheelMesh = (mesh) => {
    for (const node of root.listNodes()) if (node.getMesh() === mesh) {
      return [...wheelNames].includes(node.getName()) || !!node.getParentNode() && [...wheelNames].includes(node.getParentNode().getName());
    }
    return false;
  };
  for (const mesh of root.listMeshes()) {
    const opt = isWheelMesh(mesh) ? cfg.wheelSimplify : cfg.bodySimplify;
    for (const prim of mesh.listPrimitives()) {
      if (!prim.getIndices() || prim.getIndices().getCount() < 300) continue;
      try {
        simplifyPrimitive(prim, {
          simplifier: MeshoptSimplifier, ratio: opt.ratio, error: opt.error,
          lockBorder: opt.lockBorder !== false
        });
      } catch (e) {
        console.warn('simplify skipped:', e.message);
      }
    }
  }
  report('decimate');
  if (cfg.stripNormals) {
    console.log('normals recomputed for', computeSmoothNormals(doc), 'primitives');
  }
  await doc.transform(dedup(), prune());

  /* 7. attributes + textures --------------------------------------------- */
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  if (root.listTextures().length) {
    await doc.transform(textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [cfg.textureSize, cfg.textureSize],
      quality: cfg.textureQuality
    }));
  }
  await doc.transform(prune());
  report('quantize');

  const out = path.join(ROOT, cfg.out);
  await io.write(out, doc);
  console.log('wrote', cfg.out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB');
}
