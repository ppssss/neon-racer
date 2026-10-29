/* Prepares assets/car/Lambo-Temerario.glb for the game.

   The raw export is a full configurator scene: 41 MB, 827 nodes, 563k triangles,
   a complete interior and 28 embedded 1-2k PNG textures. That is far too heavy
   for a browser racer that draws five of them, so this script:

     1. drops GRP_Interior (158k verts nobody sees from the chase camera)
     2. bakes every mesh's world matrix into its vertices, which collapses the
        ~800-node hierarchy into flat geometry sitting in one car-space
     3. rotates that geometry so the car faces +Z like the other game models.
        It has to be geometry, not a node matrix: the game spins each wheel
        about the wheel node's local X axis, so the axle must already lie on X
     4. re-groups the pieces into "body + 4 wheels" (the WHL_* meshes become
        Wheel_XX, the wheel-arch trim that was exported inside those groups goes
        back to the body so it does not spin), with every node at identity
     5. merges meshes by material, welds, simplifies, quantizes
     6. re-encodes every texture as 512px webp

   Run from tools/_gt, where the dev dependencies live:

     npm i @gltf-transform/core @gltf-transform/functions \\
           @gltf-transform/extensions sharp meshoptimizer
     node build-temerario.mjs

   Output: assets/car/temerario.glb
*/
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, join, prune, quantize, simplify, textureCompress, transformPrimitive, weld
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), '..', '..');
const SRC = path.join(ROOT, 'assets', 'car', 'source', 'temerario', 'Lambo-Temerario.glb');
const OUT = path.join(ROOT, 'assets', 'car', 'temerario.glb');

const WHEELS = [
  ['CTRL_Wheel_FL', 'WHL_FL_', 'Wheel_FL'],
  ['CTRL_Wheel_FR', 'WHL_FR_', 'Wheel_FR'],
  ['CTRL_Wheel_RL', 'WHL_RL_', 'Wheel_RL'],
  ['CTRL_Wheel_RR', 'WHL_RR_', 'Wheel_RR']
];

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d
  ];
}
// +90 deg about Y: the glb points down -X, the game drives towards +Z
const ROT_Y90 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
const modelRoot = scene.listChildren()[0];

const countTris = () => root.listMeshes().reduce((n, mesh) =>
  n + mesh.listPrimitives().reduce((m, p) => m + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
const report = (label) => console.log(
  label.padEnd(20), 'nodes', String(root.listNodes().length).padStart(4),
  '| meshes', String(root.listMeshes().length).padStart(4),
  '| tris', String(Math.round(countTris())).padStart(7),
  '| materials', String(root.listMaterials().length).padStart(3),
  '| textures', String(root.listTextures().length).padStart(3));

report('source');

/* ---- 1. drop the interior ------------------------------------------------ */
const interior = modelRoot.listChildren().find(n => n.getName() === 'GRP_Interior');
if (interior) {
  const doomed = [];
  interior.traverse(n => doomed.push(n));
  for (const n of doomed.reverse()) n.dispose();
  console.log('removed GRP_Interior (' + doomed.length + ' nodes)');
}

/* ---- 2. world matrices for everything that is left ----------------------- */
const world = new Map();
(function walk(node, parentMatrix) {
  const m = mul(parentMatrix, node.getMatrix());
  world.set(node, m);
  for (const c of node.listChildren()) walk(c, m);
})(modelRoot, IDENTITY);

/* ---- 3. which wheels does each node belong to, and where is its pivot --- */
const groups = new Map();   // pivot node -> {wheelName, pivotWorld}
for (const [ctrlName, , wheelName] of WHEELS) {
  const ctrl = modelRoot.listChildren().find(n => n.getName() === ctrlName);
  if (!ctrl) { console.warn('missing', ctrlName); continue; }
  groups.set(ctrl, { wheelName, pivotWorld: world.get(ctrl) });
}
const wheelOf = new Map();  // node -> pivot node
for (const [ctrl] of groups) {
  const inside = new Set();
  ctrl.traverse(n => inside.add(n));
  // children of the CTRL group that are not wheel meshes go back to the body
  for (const n of inside) {
    const nm = n.getName() || '';
    const isWheelPart = WHEELS.some(([cn, prefix]) => cn === ctrl.getName() && nm.startsWith(prefix));
    if (isWheelPart) wheelOf.set(n, ctrl);
  }
}

/* ---- 4. bake each mesh into car space, dropping the pivot's steering yaw - */
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const w = world.get(node);
  if (!w) continue;
  const pivot = wheelOf.get(node);
  let m = w;
  if (pivot) {
    // relative to the pivot, then re-anchored at the pivot's hub: keeps the
    // wheel straight instead of baking in the 14 deg steering pose
    const pw = world.get(pivot);
    const rel = mul(invert(pw), w);
    rel[12] += pw[12]; rel[13] += pw[13]; rel[14] += pw[14];
    m = rel;
  }
  for (const prim of mesh.listPrimitives()) {
    transformPrimitive(prim, m);
    transformPrimitive(prim, ROT_Y90);
  }
}

/* ---- 5. flat hierarchy: model root -> [Wheel_XX | body meshes] ----------- */
const meshNodes = root.listNodes().filter(n => n.getMesh());

if (process.env.DEBUG) {
  for (const node of meshNodes) {
    const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    for (const prim of node.getMesh().listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      if (!acc) continue;
      const mn = acc.getMin([]), mx = acc.getMax([]);
      for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], mn[k]); box.max[k] = Math.max(box.max[k], mx[k]); }
    }
    if (box.min[1] < -0.02 || box.max[1] > 1.26) {
      console.log('OUT', (node.getName() || '?').padEnd(28), 'y', box.min[1].toFixed(2), '..', box.max[1].toFixed(2),
        'z', box.min[2].toFixed(2), '..', box.max[2].toFixed(2), 'wheel', !!wheelOf.get(node));
    }
  }
}

// detach everything first, then build the new tree - the Wheel_XX nodes must
// not exist yet or they would be caught by the detach pass themselves
const KEEP = new Set([modelRoot.getName()]);
for (const node of root.listNodes()) {
  if (node === modelRoot) continue;
  const parent = node.getParentNode();
  if (parent) parent.removeChild(node);
  node.setMatrix(IDENTITY);
  if (!KEEP.has(node.getName())) node.setName('');
}
for (const mesh of root.listMeshes()) mesh.setName('');
const wheelNodes = new Map();
for (const [ctrl, info] of groups) {
  const node = doc.createNode(info.wheelName);
  wheelNodes.set(ctrl, node);
  modelRoot.addChild(node);
}
for (const node of meshNodes) {
  const pivot = wheelOf.get(node);
  const target = pivot ? wheelNodes.get(pivot) : modelRoot;
  if (target) target.addChild(node);
}
report('body + wheels');

/* ---- 6. merge by material, weld, simplify ------------------------------- */
await doc.transform(join({ keepNamed: true }));
report('join');
await doc.transform(weld());
await doc.transform(simplify({
  simplifier: MeshoptSimplifier,
  ratio: 0.3,
  error: 0.0015,
  lockBorder: false
}));
report('weld + simplify');
await doc.transform(dedup(), prune());

/* ---- 7. attributes + textures ------------------------------------------ */
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await doc.transform(textureCompress({
  encoder: sharp,
  targetFormat: 'webp',
  resize: [512, 512],
  quality: 82
}));
await doc.transform(prune());
report('quantize + webp');

console.log('named nodes:', root.listNodes().filter(n => n.getName()).map(n => n.getName()).join(', '));
await io.write(OUT, doc);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB');
