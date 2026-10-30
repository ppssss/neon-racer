/* ==========================================================================
   NEON RIDGE — car bodies

   Three real glb models are used:
     ferrari   — the official three.js example car (webgl_materials_car)
     lambo     — a Lamborghini Revuelto glb (interior removed, batched by material)
     temerario — a Lamborghini Temerario glb (interior removed, body + 4 wheels,
                 merged by material, 512px webp textures)

   All binaries are embedded as base64 in js/car-model*.js and parsed with
   THREE.GLTFLoader, so the game keeps working when index.html is opened
   straight from disk (file://, no server).

   Every racer clones its model's template: geometry is shared, but each car
   gets its own paint, glass, rim and light materials plus the neon underglow,
   exhaust flames and (for the player) the headlight beam.
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;

  /* Per-model tuning. `length` re-centres and rescales a model that was not
     authored at game scale; `wheels` lists the four exported wheel nodes (front
     pair first) so the game can steer and spin them; `yaw` flips a model whose
     glb faces +Z after the shell's own half turn (see createCarModel). */
  const SPECS = {
    ferrari: { wheelDir: -1, length: 0, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    lambo: { wheelDir: 1, length: 4.95, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    temerario: { wheelDir: 1, length: 4.72, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    gtr: { wheelDir: 1, length: 4.7, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    r8: { wheelDir: 1, length: 4.43, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    f12: { wheelDir: 1, length: 4.63, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    mclaren: { wheelDir: 1, length: 4.35, yaw: Math.PI, wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] },
    // single merged mesh, no wheel nodes: the wheels ride along without spinning
    veyron: { wheelDir: 1, length: 4.7, yaw: Math.PI }
  };

  /* glTF material name -> the material this game paints it with. Everything
     not listed keeps whatever the exporter gave it (carbon, grilles, rubber,
     badges...), which is what makes the up-close detail read at all.
     `*` is a suffix match so a whole exported family can be caught at once. */
  const MAT_SLOTS = {
    // main paint
    Body_Color: 'paint', car_paint_v3_03: 'paint',
    'car_metallic_paint_02.001': 'paint',
    'CT_Carpaint_BluArione_Matt_001.001': 'paint',
    'CT_Carpaint_RossoEfesto_001.001': 'paint',
    'CT_Carpaint_RossoEfesto_Matt_001.001': 'paint',
    'CarpaintMetallicBlack': 'paint', 'CarpaintGlossBlack': 'paint',
    'CarpaintMetallicDarkGrey': 'paint', 'CarpaintMatteBlack': 'paint',
    'Paint Metallic Orange peel Cool Grey #1': 'paint',   // Audi R8 body
    'Car_paint': 'paint', 'Car_paint.002': 'paint',       // Ferrari F12
    // glass
    Glass_Gray: 'glass', M_GlassClear: 'glass', M_GlassSide: 'glass',
    'E_Glass_WindowsOutside_001.001': 'glass', 'E_Glass_WindowsInside.001': 'glass',
    'PlasticGlassWhite': 'glass', 'PlasticGlassWhitewindshield': 'glass',
    'Glass Basic White #2': 'glass',
    'Soft Rough Black #1': 'glass',      // Audi R8 windows (glass lost its alpha in the OBJ)
    'glass_details_mat': 'glass',        // McLaren MP4-5 canopy + mirrors
    'Front_windshild': 'glass', 'Back_windshild': 'glass',
    'FlatGlass.001': 'glass', 'FlatGlass.002': 'glass',
    // front lights
    Projector_Glass: 'head', HeadLights: 'head', M_Emitter: 'head',
    'L_Daylight_Led_ON_001.001': 'head', 'L_Frontlight_Glass_001.001': 'head',
    'headlight': 'head', 'Emissive Cool #1': 'head',
    'Head_light_cover': 'head', 'Head_light_cover-2': 'head',
    // rear lights
    Taillight_Glass: 'tail', M_GlassRed: 'tail', 'Emission Red': 'tail',
    'LuceRossa.001': 'tail',
    'L_Rearlight_Glass_Red_001.001': 'tail',
    'L_Rearlight_Glass_Red_001_001.001': 'tail',
    'taillight': 'tail', 'PlasticGlassRed': 'tail', 'Emissive Warm #3': 'tail',
    'Break_light': 'tail',
    // indicators + rims
    Turn_Signal_LED: 'led',
    M_WheelRim: 'rim',
    'W_Rims_Titanium_001.001': 'rim', 'W_Rims_Black_Shiny_001.001': 'rim',
    'Aloywheel': 'rim', 'Rime': 'rim'
  };

  const sources = NR.CAR_MODELS || {};
  const templates = {};
  let release = null;
  const ready = new Promise((resolve) => { release = resolve; });

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  (function loadTemplates() {
    const keys = Object.keys(sources);
    if (!keys.length || !THREE.GLTFLoader) {
      console.error('NEON RIDGE: car model data or GLTFLoader missing');
      release();
      return;
    }
    let left = keys.length;
    const done = () => { if (--left === 0) release(); };
    for (const key of keys) {
      try {
        new THREE.GLTFLoader().parse(base64ToBuffer(sources[key]), '', (gltf) => {
          templates[key] = gltf.scene;
          done();
        }, (err) => {
          console.error('NEON RIDGE: could not parse car model "' + key + '"', err);
          done();
        });
      } catch (err) {
        console.error('NEON RIDGE: could not read car model "' + key + '"', err);
        done();
      }
    }
  })();

  function glowSprite(color, size, opacity) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: NR.util.glowTexture(), color, transparent: true,
      opacity: opacity === undefined ? .6 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spr.scale.set(size, size, 1);
    return spr;
  }

  /* Wrap the four exported wheel nodes so the game can spin and steer them:
     pivot (steers, sits at the hub) > spin (rolls about the axle) > node.
     Some exports put the wheel origin at the model origin, so the pivot is
     placed on the wheel's own bounding-box centre. */
  function rigWheels(root, names) {
    root.updateMatrixWorld(true);
    const wheels = [], frontPivots = [];
    for (let i = 0; i < names.length; i++) {
      const node = root.getObjectByName(names[i]);
      if (!node || !node.parent) continue;
      const parent = node.parent;
      const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(parent.worldToLocal(centre.clone()));
      parent.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      spin.attach(node);
      wheels.push(spin);
      if (i < 2) frontPivots.push(pivot);
    }
    return { wheels, frontPivots };
  }

  /* Centre the model on the origin, sit it on the ground and scale it to a
     real car length. Measured after any yaw so the offsets are in the parent's
     space. */
  function normalize(root, length) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = length / Math.max(size.z, .001);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(root);
    const centre = scaled.getCenter(new THREE.Vector3());
    root.position.set(-centre.x, -scaled.min.y, -centre.z);
  }

  /* Swap the shared glTF materials for this car's own ones. */
  function skin(root, mats) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      if (!m) return;
      let slot = MAT_SLOTS[m.name || ''];
      if (!slot && (/^rim_/.test(o.name) || o.name === 'centre' || o.name === 'nuts')) slot = 'rim';
      if (slot) o.material = mats[slot];
    });
  }

  function createCarModel(data, isPlayer) {
    const requested = data.model || 'ferrari';
    // Fall back only if that model does not exist at all - templates are parsed
    // asynchronously (a 4 MB glb takes a moment), so a model that is merely
    // still parsing must keep its own key and attach when `ready` resolves.
    const known = templates[requested] || sources[requested];
    const modelKey = known ? requested
      : (templates.ferrari ? 'ferrari' : (Object.keys(templates)[0] || Object.keys(sources)[0] || requested));
    const spec = SPECS[modelKey] || {};

    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    const paintMat = new THREE.MeshPhysicalMaterial({
      color: data.color, metalness: .42, roughness: .3,
      clearcoat: 1, clearcoatRoughness: .06,
      emissive: new THREE.Color(data.color), emissiveIntensity: .1
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: data.accent, metalness: .85, roughness: .24,
      emissive: new THREE.Color(data.accent), emissiveIntensity: .3
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x060c16, metalness: .9, roughness: .1, transparent: true, opacity: .82,
      emissive: new THREE.Color(data.color), emissiveIntensity: .18
    });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xdff7ff, toneMapped: false });
    const tailMat = new THREE.MeshBasicMaterial({
      color: 0xff1436, transparent: true, opacity: .88, toneMapped: false
    });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, toneMapped: false });
    const mats = { paint: paintMat, rim: rimMat, glass: glassMat, head: headMat, tail: tailMat, led: ledMat };

    // The glb points down -Z; the game drives towards +Z.
    const shell = new THREE.Group();
    shell.rotation.y = Math.PI;
    group.add(shell);

    // ---- underglow pool
    const [c, g] = NR.util.canvas2d(128, 128);
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(.45, 'rgba(255,255,255,.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const underGeo = new THREE.PlaneGeometry(3.2, 5.4);
    const under = new THREE.Mesh(underGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), color: data.color, transparent: true, opacity: .25,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = .03;
    group.add(under);

    // ---- exhaust flames (rear of the car is -Z in game space)
    const flameGeo = new THREE.ConeGeometry(.12, .8, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x7ff8ff, transparent: true, opacity: .85, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false
    });
    const flames = [];
    for (const x of [-.34, .34]) {
      const fl = new THREE.Mesh(flameGeo, flameMat);
      fl.rotation.x = -Math.PI / 2;
      fl.position.set(x, .42, -2.18);
      fl.visible = false;
      group.add(fl);
      flames.push(fl);
    }

    // ---- headlight beam + a soft rim light so the hero car reads at night
    let spot = null;
    if (isPlayer) {
      spot = new THREE.SpotLight(0xc8efff, 3.2, 52, .42, .72, 1.6);
      spot.position.set(0, .72, 1.7);
      const target = new THREE.Object3D();
      target.position.set(0, -.8, 24);
      group.add(target);
      spot.target = target;
      group.add(spot);

      const rim = new THREE.PointLight(data.accent, 1.15, 8.5, 2);
      rim.position.set(-1.15, 1.7, -1.3);
      group.add(rim);
    }

    // head/tail glow sits on the shell so it flips with the model
    const headGlow = glowSprite(0xbdf7ff, 1.5, .35);
    headGlow.position.set(0, .56, -2.3);
    shell.add(headGlow);
    const tailGlow = glowSprite(0xff2050, 1.7, .32);
    tailGlow.position.set(0, .78, 2.3);
    shell.add(tailGlow);

    const ud = {
      wheels: [], frontPivots: [],
      flames, under, spot, shell,
      paintMat, accentMat: rimMat, wheelDir: spec.wheelDir || 1,
      modelKey,
      own: [paintMat, rimMat, glassMat, headMat, tailMat, ledMat, under.material, flameMat,
        headGlow.material, tailGlow.material],
      ownGeo: [underGeo, flameGeo],
      dead: false
    };
    group.userData = ud;

    const attach = (tpl) => {
      if (!tpl || ud.dead) return;
      const root = tpl.clone(true);
      if (spec.yaw) root.rotation.y = spec.yaw;
      if (spec.length) normalize(root, spec.length);
      const rig = spec.wheels ? rigWheels(root, spec.wheels) : { wheels: [], frontPivots: [] };
      skin(root, mats);
      shell.add(root);
      ud.wheels = rig.wheels;
      ud.frontPivots = rig.frontPivots;
    };

    if (templates[modelKey]) attach(templates[modelKey]);
    else ready.then(() => attach(templates[modelKey]));

    return group;
  }

  /* Cloned cars share the template's geometry and its leftover materials, so
     only the bits this car allocated may be disposed. */
  function disposeCarModel(model) {
    const ud = model.userData || {};
    ud.dead = true;
    if (ud.own) for (const m of ud.own) m.dispose();
    if (ud.ownGeo) for (const g of ud.ownGeo) g.dispose();
  }

  NR.createCarModel = createCarModel;
  NR.disposeCarModel = disposeCarModel;
  NR.carModelReady = ready;
})();
