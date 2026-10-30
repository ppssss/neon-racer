/* ==========================================================================
   NEON RIDGE — procedural WebAudio engine & effects
   ========================================================================== */
(function () {
  'use strict';
  const NR = window.NR;
  const clamp = NR.util.clamp;

  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.started = false;
      this.paused = false;
      this.noise = null;
    }

    init() {
      if (this.ctx) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = this.ctx = new AC();
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : .78;
        this.comp = ctx.createDynamicsCompressor();
        this.comp.threshold.value = -14;
        this.comp.knee.value = 20;
        this.comp.ratio.value = 5;
        this.comp.attack.value = .004;
        this.comp.release.value = .25;
        this.master.connect(this.comp);
        this.comp.connect(ctx.destination);

        this.noise = this.makeNoise(2.2);

        // ----- engine ------------------------------------------------------
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 620;
        this.engineFilter.Q.value = 3.2;
        this.shaper = ctx.createWaveShaper();
        const curve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          const x = i / 255 - 1;
          curve[i] = Math.tanh(x * 2.1) * .72;
        }
        this.shaper.curve = curve;
        this.engineFilter.connect(this.shaper);
        this.shaper.connect(this.engineGain);
        this.engineGain.connect(this.master);

        this.engines = [];
        const specs = [
          { type: 'sawtooth', ratio: 1, gain: .2 },
          { type: 'square', ratio: .5, gain: .11 },
          { type: 'triangle', ratio: 2.01, gain: .09 }
        ];
        for (const s of specs) {
          const o = ctx.createOscillator();
          o.type = s.type;
          o.frequency.value = 62 * s.ratio;
          const g = ctx.createGain();
          g.gain.value = s.gain;
          o.connect(g); g.connect(this.engineFilter);
          o.start();
          this.engines.push({ o, g, ratio: s.ratio });
        }

        // ----- wind / road noise ------------------------------------------
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0;
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 900;
        this.windFilter = windFilter;
        this.windSource = this.loopNoise();
        this.windSource.connect(windFilter);
        windFilter.connect(this.windGain);
        this.windGain.connect(this.master);

        // ----- tyre squeal -------------------------------------------------
        this.tyreGain = ctx.createGain();
        this.tyreGain.gain.value = 0;
        const tyreFilter = ctx.createBiquadFilter();
        tyreFilter.type = 'bandpass';
        tyreFilter.frequency.value = 1650;
        tyreFilter.Q.value = 2.7;
        this.tyreFilter = tyreFilter;
        const tyreSrc = this.loopNoise(.65);
        tyreSrc.connect(tyreFilter);
        tyreFilter.connect(this.tyreGain);
        this.tyreGain.connect(this.master);

        // ----- boost rumble -----------------------------------------------
        this.boostGain = ctx.createGain();
        this.boostGain.gain.value = 0;
        const boostFilter = ctx.createBiquadFilter();
        boostFilter.type = 'bandpass';
        boostFilter.frequency.value = 280;
        boostFilter.Q.value = .8;
        this.boostFilter = boostFilter;
        const boostSrc = this.loopNoise(.7);
        boostSrc.connect(boostFilter);
        boostFilter.connect(this.boostGain);
        this.boostGain.connect(this.master);

        // ----- low synth pad ----------------------------------------------
        this.padGain = ctx.createGain();
        this.padGain.gain.value = 0;
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 420;
        this.pad = [];
        [55, 82.41, 110, 164.81].forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = i % 2 ? 'triangle' : 'sine';
          o.frequency.value = f;
          o.detune.value = (i - 1.5) * 4;
          const g = ctx.createGain();
          g.gain.value = .06 / (i + 1);
          o.connect(g); g.connect(padFilter);
          o.start();
          this.pad.push(o);
        });
        padFilter.connect(this.padGain);
        this.padGain.connect(this.master);

        this.started = true;
      } catch (e) {
        console.warn('Audio unavailable', e);
        this.ctx = null;
      }
    }

    makeNoise(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * .6 + white * .4;
        data[i] = last;
      }
      return buffer;
    }

    loopNoise(rate) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = rate || 1;
      src.start();
      return src;
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(m ? 0 : .78, this.ctx.currentTime, .03);
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    setPaused(p) {
      this.paused = p;
      if (!this.ctx) return;
      if (p) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, .08);
        this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, .1);
        this.tyreGain.gain.setTargetAtTime(0, this.ctx.currentTime, .1);
        this.boostGain.gain.setTargetAtTime(0, this.ctx.currentTime, .08);
        this.padGain.gain.setTargetAtTime(.015, this.ctx.currentTime, .2);
      } else {
        this.padGain.gain.setTargetAtTime(.045, this.ctx.currentTime, .3);
      }
    }

    startEngine() {
      this.init();
      if (!this.ctx) return;
      this.resume();
      this.paused = false;
      this.padGain.gain.setTargetAtTime(.045, this.ctx.currentTime, .8);
    }

    update(speedKmh, throttle, drift, boost, offroad) {
      if (!this.ctx || this.paused) return;
      const t = this.ctx.currentTime;
      const sp = clamp(speedKmh / 210, 0, 1.15);
      const gear = 1 + Math.floor(sp * 5.5);
      const rpm = .55 + clamp((speedKmh % 42) / 42, 0, 1) * .55 + sp * .35;
      const base = 54 + sp * 118 + rpm * 28 + throttle * 9;
      for (const e of this.engines) {
        e.o.frequency.setTargetAtTime(base * e.ratio, t, .035);
      }
      this.engineFilter.frequency.setTargetAtTime(420 + sp * 1750 + throttle * 280, t, .04);
      const engineLevel = .055 + throttle * .04 + sp * .035;
      this.engineGain.gain.setTargetAtTime(engineLevel, t, .05);

      this.windGain.gain.setTargetAtTime(sp * sp * .055, t, .08);
      this.windFilter.frequency.setTargetAtTime(600 + sp * 2200, t, .08);

      const tyre = drift ? clamp(Math.abs(drift) * .06, .012, .055) : 0;
      this.tyreGain.gain.setTargetAtTime(tyre, t, .06);
      this.tyreFilter.frequency.setTargetAtTime(1400 + sp * 900 + Math.random() * 120, t, .04);

      this.boostGain.gain.setTargetAtTime(boost ? .08 : 0, t, .09);
      this.boostFilter.frequency.setTargetAtTime(boost ? 420 + sp * 500 : 260, t, .1);
      this.padGain.gain.setTargetAtTime(.035 + sp * .02, t, .2);
    }

    env(gainNode, peak, attack, decay) {
      const t = this.ctx.currentTime;
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(.0001, t);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + attack);
      gainNode.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
    }

    tone(freq, dur, type, vol, when) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + (when || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || .08, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + .03);
    }

    sweep(f1, f2, dur, vol, type) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol || .08, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + .02);
    }

    noiseBurst(dur, vol, freq, type) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.setValueAtTime(freq || 900, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, (freq || 900) * .25), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || .16, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + .02);
    }

    countdown(n) {
      if (!this.ctx) return;
      if (n > 0) {
        this.tone(440 + (3 - n) * 55, .13, 'square', .035);
        this.tone(220, .1, 'sine', .02);
      }
    }

    go() {
      if (!this.ctx) return;
      this.tone(880, .3, 'square', .045);
      this.tone(1320, .42, 'triangle', .035, .03);
      this.tone(1760, .5, 'sine', .02, .06);
      this.noiseBurst(.5, .1, 2200, 'highpass');
    }

    lap() {
      this.tone(740, .12, 'triangle', .045);
      this.tone(1110, .22, 'triangle', .04, .1);
    }

    bestLap() {
      this.tone(740, .1, 'triangle', .04);
      this.tone(988, .1, 'triangle', .04, .08);
      this.tone(1480, .28, 'sine', .045, .16);
    }

    collision(power) {
      this.noiseBurst(.18 + power * .22, .09 + power * .1, 420, 'lowpass');
      this.tone(70 + power * 25, .18, 'sine', .07 + power * .05);
    }

    boost() {
      this.noiseBurst(.55, .08, 1800, 'bandpass');
      this.sweep(180, 900, .5, .035, 'sawtooth');
    }

    finish(win) {
      if (!this.ctx) return;
      const notes = win ? [523, 659, 784, 1046] : [392, 494, 587, 784];
      notes.forEach((f, i) => this.tone(f, .45, 'triangle', .04, i * .14));
      if (win) {
        this.tone(1568, .8, 'sine', .03, .58);
        this.noiseBurst(.6, .05, 3000, 'highpass');
      }
    }

    ui() {
      this.tone(520, .06, 'square', .02);
    }
  }

  NR.Audio = Audio;
})();
