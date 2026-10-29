/* ==========================================================================
   NEON RIDGE — cars, driving model and AI
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;
  const V3 = THREE.Vector3;
  const clamp = NR.util.clamp;
  const wrapAngle = NR.util.wrapAngle;
  const damp = NR.util.damp;

  /* Selectable machines. `stats.speed` is top speed in m/s, `accel` is the
     throttle force and `grip` scales steering authority. `mira` runs the
     official three.js car body; revuelto, temerario, gtr and r8 are real glb
     models with their own steering/spinning wheels. */
  const CAR_DATA = {
    mira: {
      name: 'MIRA', tag: 'NR-11', blurb: '抓地力最好，适合贴着弯心走。',
      color: 0x9d78ff, accent: 0xd9c8ff, dark: 0x22154b,
      stats: { speed: 51.8, accel: 20, grip: 1.1 }
    },
    revuelto: {
      name: 'REVUELTO', tag: 'NR-09', model: 'lambo',
      blurb: '大牛，极速与加速都很凶，方向偏重。',
      color: 0xffb01a, accent: 0xfff0bd, dark: 0x3a2408,
      stats: { speed: 56, accel: 23.4, grip: 1.05 }
    },
    temerario: {
      name: 'TEMERARIO', tag: 'NR-13', model: 'temerario',
      blurb: '新旗舰，全场最快的一台，抓地稍弱。',
      color: 0x9dff3c, accent: 0xe4ffb8, dark: 0x1d3307,
      stats: { speed: 56.8, accel: 24.2, grip: 1.02 }
    },
    gtr: {
      name: 'GT-R 35', tag: 'NR-05', model: 'gtr',
      blurb: '四驱战神，弯道抓地最强，极速一般。',
      color: 0x9fc6ff, accent: 0xe4f0ff, dark: 0x16233c,
      stats: { speed: 55, accel: 22.4, grip: 1.13 }
    },
    r8: {
      name: 'R8 V10', tag: 'NR-03', model: 'r8',
      blurb: '中置自吸，声浪高转，加速最直接。',
      color: 0xe4152f, accent: 0xffb3bd, dark: 0x380610,
      stats: { speed: 56.2, accel: 23, grip: 1.04 }
    },
    f12: {
      name: 'F12', tag: 'NR-17', model: 'f12',
      blurb: '前置 V12，极速与抓地都很均衡。',
      color: 0xc3cad6, accent: 0xffffff, dark: 0x2a3140,
      stats: { speed: 56.4, accel: 23.6, grip: 1.06 }
    },
    mclaren: {
      name: 'MP4-5', tag: 'NR-08', model: 'mclaren',
      blurb: 'F1 血统，弯道抓地无人能敌，极速一般。',
      color: 0xff6a13, accent: 0xffd0a8, dark: 0x3a1405,
      stats: { speed: 55.8, accel: 25.2, grip: 1.2 }
    },
    veyron: {
      name: 'VEYRON', tag: 'NR-20', model: 'veyron',
      blurb: 'W16 巨兽，全场极速第一，入弯偏钝。',
      color: 0x5a7cff, accent: 0xbcd0ff, dark: 0x101a3a,
      stats: { speed: 58, accel: 24.8, grip: 1 }
    }
  };
  const CAR_ORDER = ['mira', 'revuelto', 'temerario', 'gtr', 'r8', 'f12', 'mclaren', 'veyron'];

  /* ======================================================================== */
  class Racer {
    constructor(game, data, isPlayer, opts) {
      opts = opts || {};
      this.game = game;
      this.track = game.track;
      this.data = data;
      this.name = data.name;
      this.color = data.color;
      this.isPlayer = isPlayer;
      this.model = NR.createCarModel(data, isPlayer);
      game.scene.add(this.model);

      this.pos = new V3();
      this.vel = new V3();
      this.heading = 0;
      this.steerVisual = 0;
      this.wheelSpin = 0;
      this.info = null;
      this.lastIndex = 0;
      this.prevS = 0;
      this.raceDistance = 0;
      this.completedLaps = 0;
      this.lapStart = 0;
      this.bestLap = Infinity;
      this.lastLap = 0;
      this.lapTimes = [];
      this.finished = false;
      this.finishTime = 0;
      this.finishPlace = 0;

      const stats = data.stats || {};
      this.maxSpeed = stats.speed || 53;
      this.accel = stats.accel || 19.5;
      this.handling = stats.grip || 1;
      this.brakePower = 39;
      this.reversePower = 7.5;
      this.nitro = 100;
      this.nitroMax = 100;
      this.boosting = false;
      this.wasBoosting = false;
      this.drifting = false;
      this.driftAngle = 0;
      this.driftCharge = 0;
      this.topSpeed = 0;
      this.offroad = false;
      this.wallHit = 0;
      this.wallCooldown = 0;
      this.stuckTime = 0;
      this.speed = 0;
      this.lateral = 0;
      this.place = 4;
      this.skill = opts.skill || 1;
      this.ai = null;
      this.nitroLock = 0;
    }

    placeOnGrid(s, lateral) {
      const a = this.track.at(s);
      this.pos.set(a.p.x + a.side.x * lateral, a.p.y + .04, a.p.z + a.side.z * lateral);
      this.heading = Math.atan2(a.t.x, a.t.z);
      this.vel.set(0, 0, 0);
      this.speed = 0;
      this.info = this.track.nearest(this.pos.x, this.pos.z, null);
      this.lastIndex = this.info.index;
      this.prevS = this.info.s;
      this.raceDistance = s > this.track.total * .5 ? s - this.track.total : s;
      this.completedLaps = 0;
      this.lapTimes = [];
      this.bestLap = Infinity;
      this.lastLap = 0;
      this.lapStart = 0;
      this.finished = false;
      this.finishTime = 0;
      this.finishPlace = 0;
      this.nitro = 100;
      this.driftCharge = 0;
      this.topSpeed = 0;
      this.stuckTime = 0;
      this.wallCooldown = 0;
      this.model.position.copy(this.pos);
      this.model.rotation.set(0, this.heading, 0);
      this.model.visible = true;
    }

    resetToTrack() {
      if (this.finished) return;
      const info = this.track.nearest(this.pos.x, this.pos.z, this.lastIndex);
      const s = info.s - (info.lateral > 0 ? 2 : -2);
      const a = this.track.at(s);
      const lateral = clamp(info.lateral, -this.track.halfWidth + 2, this.track.halfWidth - 2);
      this.pos.set(a.p.x + a.side.x * lateral, a.p.y + .08, a.p.z + a.side.z * lateral);
      this.heading = Math.atan2(a.t.x, a.t.z);
      this.vel.set(0, 0, 0);
      this.speed = 0;
      this.prevS = a.s;
      this.lastIndex = a.index;
      this.wallCooldown = .7;
      this.stuckTime = 0;
    }

    update(dt, ctrl, time) {
      const track = this.track;
      const offBefore = this.offroad;
      let h = this.heading;
      const fwd0 = new V3(Math.sin(h), 0, Math.cos(h));
      let vf0 = this.vel.dot(fwd0);
      const speedAbs = Math.abs(vf0);

      // steering authority scales with speed; reverse reverses turn direction
      const engage = clamp(speedAbs / 5.5, 0, 1);
      let steerRate = (1.85 - clamp(speedAbs / 80, 0, 1) * .74) * this.handling;
      if (ctrl.drift && speedAbs > 13) steerRate *= 1.5;
      if (offBefore) steerRate *= .85;
      const direction = vf0 < -.6 ? -1 : 1;
      h += ctrl.steer * steerRate * dt * engage * direction * clamp(.55 + speedAbs / 55, 0, 1.05);
      this.heading = h;

      const fwd = new V3(Math.sin(h), 0, Math.cos(h));
      const right = new V3(Math.cos(h), 0, -Math.sin(h));
      let vf = this.vel.dot(fwd);
      let vl = this.vel.dot(right);

      const wantsBoost = !!ctrl.boost && this.nitro > (this.boosting ? .5 : 6) && vf > 5 && this.nitroLock <= 0;
      this.boosting = wantsBoost;
      if (this.boosting) {
        this.nitro = Math.max(0, this.nitro - 31 * dt);
        if (this.nitro <= 0) this.nitroLock = .8;
        vf += 27 * dt;
      } else {
        this.nitroLock = Math.max(0, this.nitroLock - dt);
      }

      let maxSpeed = this.maxSpeed * (this.boosting ? 1.18 : 1);
      if (offBefore) maxSpeed *= .56;

      const throttle = clamp(ctrl.throttle || 0, 0, 1);
      const brake = clamp(ctrl.brake || 0, 0, 1);
      if (throttle > 0) {
        const headroom = 1 - clamp(Math.max(0, vf) / maxSpeed, 0, 1);
        vf += this.accel * throttle * (.3 + headroom * .95) * dt;
      }
      if (brake > 0) {
        if (vf > .8) vf -= this.brakePower * brake * dt;
        else vf -= this.reversePower * brake * dt;
      }
      if (!throttle && !brake) {
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.2 + speedAbs * .028) * dt);
      }

      // handbrake drag & drift state
      const driftIntent = !!ctrl.drift && speedAbs > 13 && Math.abs(ctrl.steer) > .12;
      this.drifting = driftIntent;
      if (driftIntent) vf *= 1 - .018 * dt;
      this.driftAngle = Math.abs(vl) > .1 ? Math.atan2(Math.abs(vl), Math.max(4, Math.abs(vf))) : 0;

      // grip: less lateral grip while drifting / on gravel
      let grip = offBefore ? 2.4 : (driftIntent ? 1.28 : 7.6);
      if (this.boosting) grip *= 1.06;
      vl *= Math.exp(-grip * dt);

      // aerodynamic + rolling drag
      const drag = offBefore ? 1.05 : .1;
      vf -= vf * drag * dt;
      vf -= Math.sign(vf) * .4 * dt;

      vf = clamp(vf, -13, maxSpeed);
      if (this.boosting) vf = Math.min(vf, maxSpeed * 1.03);
      this.vel.set(fwd.x * vf + right.x * vl, 0, fwd.z * vf + right.z * vl);

      // integrate
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;

      // find track and clamp to barrier
      const info = track.nearest(this.pos.x, this.pos.z, this.lastIndex);
      this.lastIndex = info.index;
      this.info = info;
      this.lateral = info.lateral;
      const edge = track.halfWidth + track.collisionWidth;
      if (Math.abs(info.lateral) > edge) {
        const sign = Math.sign(info.lateral);
        const push = Math.abs(info.lateral) - edge;
        this.pos.x -= info.side.x * sign * push;
        this.pos.z -= info.side.z * sign * push;
        const vn = this.vel.dot(info.side) * sign;
        if (vn > 0) this.vel.addScaledVector(info.side, -sign * vn * 1.7);
        this.wallHit = Math.max(this.wallHit, Math.min(1, vn / 18));
        if (this.wallCooldown <= 0) {
          this.wallCooldown = .35;
          this.speed = this.vel.length();
          this.game.onWallHit && this.game.onWallHit(this, this.pos, Math.min(1, vn / 16));
        }
      }
      this.wallCooldown = Math.max(0, this.wallCooldown - dt);
      this.wallHit = Math.max(0, this.wallHit - dt * 2.2);

      this.offroad = Math.abs(info.lateral) > track.halfWidth + .95;

      // track progress
      let ds = info.s - this.prevS;
      if (ds > track.total * .5) ds -= track.total;
      if (ds < -track.total * .5) ds += track.total;
      this.raceDistance += ds;
      this.prevS = info.s;

      // lap checkpoints
      if (!this.finished) {
        const lapsDone = Math.floor(Math.max(0, this.raceDistance) / track.total);
        if (lapsDone > this.completedLaps) {
          const lapTime = time - this.lapStart;
          this.lapStart = time;
          this.completedLaps = lapsDone;
          if (lapTime > 4 && this.completedLaps <= track.lapCount) {
            this.lastLap = lapTime;
            this.lapTimes.push(lapTime);
            if (lapTime < this.bestLap) this.bestLap = lapTime;
          }
        }
        if (this.raceDistance >= track.total * track.lapCount) {
          this.finished = true;
          this.finishTime = time;
          this.finishPlace = 0;
          this.completedLaps = track.lapCount;
          this.game.onRacerFinish && this.game.onRacerFinish(this);
        }
      }

      // nitro refill from drifting
      if (this.drifting && Math.abs(this.driftAngle) > .08) {
        const gain = 17 * dt * clamp(Math.abs(this.driftAngle) * 2.4, .25, 1.2);
        this.nitro = Math.min(this.nitroMax, this.nitro + gain);
        this.driftCharge += Math.abs(vf) * dt * .8;
      } else if (!this.boosting) {
        this.nitro = Math.min(this.nitroMax, this.nitro + 1.7 * dt);
      }

      // y and tangent pitch
      const a1 = track.at(info.s - 1.6);
      const a2 = track.at(info.s + 1.6);
      const pitch = -Math.atan2(a2.p.y - a1.p.y, 3.2);
      this.pos.y = info.p.y + .035;
      const leanTarget = clamp(ctrl.steer * clamp(speedAbs / 55, 0, 1) * .075 - vl * .004, -.11, .11);
      this.steerVisual = damp(this.steerVisual, ctrl.steer, 11, dt);
      this.model.position.copy(this.pos);
      this.model.rotation.y = this.heading;
      this.model.rotation.x = damp(this.model.rotation.x, pitch, 7, dt);
      this.model.rotation.z = damp(this.model.rotation.z, leanTarget, 7, dt);

      // wheels
      this.speed = vf;
      this.topSpeed = Math.max(this.topSpeed, Math.abs(vf) * 3.6);
      this.wheelSpin += vf / .36 * dt;
      const ud = this.model.userData;
      for (let i = 0; i < ud.wheels.length; i++) {
        ud.wheels[i].rotation.x = this.wheelSpin * (ud.wheelDir || 1);
      }
      for (const p of ud.frontPivots) p.rotation.y = this.steerVisual * .43;

      // flames
      for (let i = 0; i < ud.flames.length; i++) {
        const fl = ud.flames[i];
        fl.visible = this.boosting;
        if (this.boosting) {
          fl.scale.set(1 + Math.random() * .2, .8 + Math.random() * .6, 1 + Math.random() * .2);
        }
      }
      ud.under.material.opacity = .2 + (this.boosting ? .16 : 0) + Math.sin(time * 8) * .03;

      // stuck watchdog (AI chiefly)
      if (Math.abs(vf) < 2 && !this.finished) this.stuckTime += dt;
      else this.stuckTime = 0;
      if (!this.isPlayer && this.stuckTime > 4.3) this.resetToTrack();

      // signal for game audio/camera
      if (this.boosting && !this.wasBoosting) this.game.onBoost && this.game.onBoost(this);
      this.wasBoosting = this.boosting;
    }
  }

  /* ======================================================================== */
  class AIDriver {
    constructor(racer, opts) {
      this.racer = racer;
      this.baseLane = opts.lane;
      this.phase = opts.phase || 0;
      this.skill = opts.skill || 1;
      this.steer = 0;
      this.targetLane = opts.lane;
      this.laneTimer = 0;
      this.throttle = 1;
      this.brake = 0;
      this.drift = false;
      this.boost = false;
    }

    update(dt, time) {
      const r = this.racer;
      const track = r.track;
      const info = r.info;
      if (!info) return;
      const speed = Math.abs(r.speed);
      const look = 10 + speed * .5;
      const ahead = track.at(info.s + look);
      const curve = track.curvature(info.s + 14);
      const curve2 = track.curvature(info.s + 30);

      // wander between lanes, stay predictable
      this.laneTimer -= dt;
      if (this.laneTimer <= 0) {
        this.laneTimer = 2.4 + Math.random() * 3.2;
        this.targetLane = this.baseLane + (Math.random() - .5) * 3.4;
      }
      // avoid a car directly ahead
      let avoid = 0;
      for (const o of r.game.racers) {
        if (o === r || o.finished) continue;
        const gap = o.raceDistance - r.raceDistance;
        if (gap > 0 && gap < 9) {
          const latDiff = o.lateral - r.lateral;
          if (Math.abs(latDiff) < 2.4) avoid += latDiff > 0 ? -2.7 : 2.7;
        }
      }
      this.targetLane = clamp(this.targetLane + avoid, -track.halfWidth + 2.1, track.halfWidth - 2.1);
      const tx = ahead.p.x + ahead.side.x * this.targetLane;
      const tz = ahead.p.z + ahead.side.z * this.targetLane;
      const desired = Math.atan2(tx - r.pos.x, tz - r.pos.z);
      const diff = wrapAngle(desired - r.heading);
      const steerTarget = clamp(diff * 2.1, -1, 1);
      this.steer = damp(this.steer, steerTarget, 7.5, dt);

      let targetSpeed = r.maxSpeed * this.skill;
      targetSpeed *= clamp(1 - (curve * .72 + curve2 * .4) * 48, .35, 1);
      targetSpeed *= clamp(1 - Math.abs(diff) * .85, .42, 1);
      if (r.offroad) targetSpeed *= .5;
      // gentle rubber-band, keeps the pack close without cheating
      const player = r.game.player;
      if (player) {
        const gap = r.raceDistance - player.raceDistance;
        targetSpeed *= 1 + clamp(gap / 900, -.045, .075);
      }
      // final lap push
      if (r.completedLaps >= r.track.lapCount - 1) targetSpeed *= 1.025;

      this.throttle = speed < targetSpeed ? 1 : (speed < targetSpeed + 2.5 ? .35 : 0);
      this.brake = speed > targetSpeed + 3.4 ? .8 : 0;
      this.drift = curve > .018 && speed > 23 && Math.abs(diff) > .2;
      this.boost = curve < .003 && curve2 < .005 && speed > 18 && r.nitro > 38 &&
        (r.completedLaps >= 1 || time > 8);

      r.update(dt, {
        throttle: this.throttle,
        brake: this.brake,
        steer: this.steer,
        drift: this.drift,
        boost: this.boost
      }, time);
    }
  }

  NR.CAR_DATA = CAR_DATA;
  NR.CAR_ORDER = CAR_ORDER;
  NR.Racer = Racer;
  NR.AIDriver = AIDriver;
})();
