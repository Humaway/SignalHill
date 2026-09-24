// ==== engine/02_audio.js — Snd: all Web Audio synthesis (ARCHITECTURE §7; spec §2, §2A, §4, §6) ====
//
// One AudioContext. Bus graph:
//   fx ──┐
//   amb ─┴→ world (menu dim) → worldLP ─→ duckLP → duck ─→ master → mute → limiter → speakers
//   music ─────────────────────────────→ duckLP
//   ui ────────────────────────────────────────────────→ master
//   verbIn → room convolver → fx        mverbIn → hall convolver → music
// Every sound is built from Voice/Grp helpers: sources start/stop on the audio clock and every node is disconnected
// when the sources that feed it end, so Snd.stats().nodes returns to its baseline. Sequenced and looping sounds
// schedule ahead through per-voice tasks pumped from Snd.update() and a 200 ms timer (they keep time without a game
// loop). Before init — or while the context is still waiting for a user gesture — one-shots are dropped silently;
// state (ambient bed, world, threat loops, static level) is remembered and applied once audio runs.
const Snd = (() => {
  let ctx = null, B = null, NZ = null, PW = null, CV = null;
  let realCtx = null, offline = false;
  let liveNodes = 0;
  const voices = new Set();
  const sirens = new Set();
  let wantBed = 'none', bedFade = 2, bed = { name: 'none', v: null }, outBed = null;
  let world = 'fog', lastSOutage;
  let curMusic = null;
  const loops = new Map();
  let isMuted = false, hiddenMute = false, worldForced = null;
  const menuOpen = new Set();
  const vol = { master: 0.9, effects: 0.9, music: 0.8 };
  let nextChime = 0;
  let stat = null, staticCur = 0, staticTarget = 0, staticNext = 0;
  let pumpTimer = null, subscribed = false;
  const lst = { x: 0, y: 0, z: 0 };
  const warned = new Set();
  const LOOK = 1.0;
  const DIM_MENUS = new Set(['pause', 'items', 'map', 'memos', 'phone', 'options', 'save', 'load', 'doc']);
  const UI_ISH = new Set(['paper', 'whoosh', 'scribble', 'pickup', 'paper_tear']);

  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rt = (o) => (o && o.rate > 0 ? o.rate : 1);
  const xyz = (p) => {
    if (!p) return [0, 1.2, 0];
    if (Array.isArray(p)) return p.length === 2 ? [+p[0] || 0, 1.2, +p[1] || 0] : [+p[0] || 0, +p[1] || 0, +p[2] || 0];
    return [+p.x || 0, +p.y || 0, +p.z || 0];
  };
  const ok = () => !!ctx && (offline || ctx.state === 'running');
  const DUMMY = Object.freeze({ stop() {}, setPos() {}, setVol() {}, set() {}, playing: false, dur: 0, done: Promise.resolve() });

  // ---- shared resources: noise buffers, periodic waves, curves, impulses, bus graph ---------------------------
  function mkNoise(c) {
    const sr = c.sampleRate, len = Math.floor(sr * 2.5);
    const w = c.createBuffer(1, len, sr), p = c.createBuffer(1, len, sr), b = c.createBuffer(1, len, sr);
    const wd = w.getChannelData(0), pd = p.getChannelData(0), bd = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      wd[i] = x * 0.9;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02; bd[i] = last * 3.5;
    }
    // remove the step at the loop seam (low-frequency noise would click)
    for (const d of [pd, bd]) { const s = d[len - 1] - d[0]; for (let i = 0; i < len; i++) d[i] -= (s * i) / (len - 1); }
    return { white: w, pink: p, brown: b };
  }
  function mkPW(c, amps) {
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => { im[i + 1] = a; });
    return c.createPeriodicWave(re, im);
  }
  function mkCurve(k) {
    const n = 1024, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); }
    return a;
  }
  function mkImpulse(c, sec, decay, tone) {
    const sr = c.sampleRate, len = Math.floor(sr * sec), buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, a = tone * (1 - 0.8 * x) + 0.015; // darker as it decays
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - x, decay) * (i < sr * 0.005 ? i / (sr * 0.005) : 1);
      }
      for (let k = 0; k < 7; k++) { const idx = Math.floor(sr * rnd(0.007, 0.06)); if (idx < len) d[idx] += rnd(-0.4, 0.4); }
    }
    return buf;
  }
  function buildShared() {
    NZ = mkNoise(ctx);
    PW = {
      softsq: mkPW(ctx, [1, 0, 0.26, 0, 0.12, 0, 0.06, 0, 0.03, 0, 0.015]),
      piano: mkPW(ctx, [1, 0.5, 0.28, 0.18, 0.11, 0.07, 0.045, 0.03, 0.018, 0.01]),
      hum: mkPW(ctx, [1, 0.6, 0.38, 0.24, 0.12, 0.07, 0.04]),
    };
    CV = { soft: mkCurve(1.6), dist: mkCurve(5), hard: mkCurve(14) };
    const g = (v, d) => { const n = ctx.createGain(); n.gain.value = v; if (d) n.connect(d); return n; };
    const f = (type, fr, q, d) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = fr; n.Q.value = q; if (d) n.connect(d); return n; };
    const G = {};
    G.lim = ctx.createDynamicsCompressor();
    G.lim.threshold.value = -9; G.lim.knee.value = 6; G.lim.ratio.value = 10; G.lim.attack.value = 0.003; G.lim.release.value = 0.25;
    G.out = g(0.95, ctx.destination); G.lim.connect(G.out);
    G.mute = g(isMuted || hiddenMute ? 0 : 1, G.lim);
    G.master = g(curve(vol.master), G.mute);
    G.duck = g(1, G.master);
    G.duckLP = f('lowpass', 20000, 0.5, G.duck);
    G.worldLP = f('lowpass', 20000, 0.5, G.duckLP);
    G.world = g(1, G.worldLP);
    G.fx = g(curve(vol.effects), G.world);
    G.amb = g(curve(vol.effects), G.world);
    G.music = g(curve(vol.music), G.duckLP);
    G.ui = g(curve(vol.effects), G.master);
    G.verb = ctx.createConvolver(); G.verb.buffer = mkImpulse(ctx, 1.9, 2.6, 0.55);
    G.verbIn = g(1); G.verbIn.connect(G.verb); G.verb.connect(g(0.8, G.fx));
    G.mverb = ctx.createConvolver(); G.mverb.buffer = mkImpulse(ctx, 3.6, 2.2, 0.35);
    G.mverbIn = g(1); G.mverbIn.connect(G.mverb); G.mverb.connect(g(0.75, G.music));
    B = G;
  }
  const curve = (v) => Math.pow(clamp(+v || 0), 1.6);

  // ---- Grp: nodes that live exactly as long as their own sources -------------------------------------------------
  class Grp {
    constructor(v) { this.v = v; this.nodes = []; this.live = 0; this.dead = false; v.grps.add(this); }
    add(n) { this.nodes.push(n); liveNodes++; return n; }
    src(n, t0, t1, off) {
      this.add(n); this.live++;
      const v = this.v; v.srcs.add(n);
      n.onended = () => { v.srcs.delete(n); if (--this.live <= 0) this.free(); };
      const st = Math.max(ctx.currentTime, t0);
      if (off != null) n.start(st, off); else n.start(st);
      if (t1 != null && isFinite(t1)) { n._t1 = Math.max(t1, st + 0.004); n.stop(n._t1); }
      return n;
    }
    free() {
      if (this.dead) return;
      this.dead = true;
      for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* already */ } }
      liveNodes -= this.nodes.length; this.nodes.length = 0;
      this.v.grps.delete(this); this.v.check();
    }
    gain(val = 1, dest) { const n = this.add(ctx.createGain()); n.gain.value = val; if (dest) n.connect(dest); return n; }
    filt(type, fr, q, dest) { const n = this.add(ctx.createBiquadFilter()); n.type = type; n.frequency.value = fr; if (q != null) n.Q.value = q; if (dest) n.connect(dest); return n; }
    peak(fr, q, db, dest) { const n = this.filt('peaking', fr, q, dest); n.gain.value = db; return n; }
    pan(p, dest) { const n = this.add(ctx.createStereoPanner()); n.pan.value = clamp(p, -1, 1); if (dest) n.connect(dest); return n; }
    delay(t, max, dest) { const n = this.add(ctx.createDelay(max || 1)); n.delayTime.value = t; if (dest) n.connect(dest); return n; }
    shaper(c, dest) { const n = this.add(ctx.createWaveShaper()); n.curve = c; n.oversample = '2x'; if (dest) n.connect(dest); return n; }
    osc(type, fr, t0, t1, dest) {
      const n = ctx.createOscillator();
      if (typeof type === 'string') n.type = type; else n.setPeriodicWave(type);
      n.frequency.value = fr; if (dest) n.connect(dest);
      return this.src(n, t0, t1);
    }
    noise(kind, t0, t1, dest, rate) {
      const n = ctx.createBufferSource(); n.buffer = NZ[kind] || NZ.white; n.loop = true;
      if (rate) n.playbackRate.value = rate;
      if (dest) n.connect(dest);
      return this.src(n, t0, t1, Math.random() * (n.buffer.duration - 0.2));
    }
  }

  // ---- Voice: one playing sound (output chain, optional panner / reverb send / phone band, tasks) -------------------
  function holdParam(p, now) {
    if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(now); return; } catch (e) { /* fall through */ } }
    const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now);
  }
  function makePanner() {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 2; p.maxDistance = 80; p.rolloffFactor = 1.1;
    return p;
  }
  function setPannerPos(p, pos, instant) {
    const [x, y, z] = xyz(pos);
    if (p.positionX) {
      if (instant) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
      else { const t = ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.04); p.positionY.setTargetAtTime(y, t, 0.04); p.positionZ.setTargetAtTime(z, t, 0.04); }
    } else p.setPosition(x, y, z);
  }
  const wetFor = (base, pos) => { const [x, y, z] = xyz(pos); return base * (0.5 + 0.5 * clamp(Math.hypot(x - lst.x, y - lst.y, z - lst.z) / 14, 0, 1.5)) / (1 + Math.hypot(x - lst.x, z - lst.z) / 16); };

  class Voice {
    constructor(dest, o = {}) {
      this.o = o; this.grps = new Set(); this.srcs = new Set(); this.shared = []; this.tasks = []; this.children = [];
      this.params = { intensity: o.intensity != null ? o.intensity : 0.5, bpm: o.bpm };
      this.ended = false; this.stopping = false; this.built = false; this.offline = offline;
      this.t0 = ctx.currentTime + 0.01 + Math.max(0, o.delay || 0);
      this.hardEnd = Infinity; this.baseVol = o.baseVol != null ? o.baseVol : 1; this.defFade = o.defFade || 0.05;
      this.in = this.sh(ctx.createGain());
      let tail = this.in;
      const ins = (n) => { this.sh(n); tail.connect(n); tail = n; return n; };
      const bq = (type, fr, q, db) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = fr; n.Q.value = q; if (db) n.gain.value = db; return ins(n); };
      if (o.phone) { bq('highpass', 340, 0.7); bq('lowpass', 3300, 0.9); bq('peaking', 1800, 1.1, 5); const ws = ctx.createWaveShaper(); ws.curve = CV.soft; ins(ws); }
      if (o.far) bq('lowpass', 1500, 0.6);
      if (o.lp) bq('lowpass', o.lp, 0.6);
      if (o.hp) bq('highpass', o.hp, 0.6);
      this.out = this.sh(ctx.createGain());
      this.out.gain.value = o.vol != null ? o.vol : 1;
      tail.connect(this.out);
      let post = this.out;
      if (o.pos) { this.panner = this.sh(makePanner()); setPannerPos(this.panner, o.pos, true); post.connect(this.panner); post = this.panner; }
      else if (o.pan) { const sp = this.sh(ctx.createStereoPanner()); sp.pan.value = clamp(o.pan, -1, 1); post.connect(sp); post = sp; }
      post.connect(dest);
      const wet = o.verb != null ? o.verb : o.far ? 0.7 : 0;
      if (wet > 0) {
        this.wet = wet;
        this.send = this.sh(ctx.createGain());
        this.send.gain.value = o.pos ? wetFor(wet, o.pos) : wet;
        this.out.connect(this.send);
        this.send.connect(dest === B.music || o.verbBus === 'music' ? B.mverbIn : B.verbIn);
      }
      voices.add(this);
      this.done = new Promise((r) => { this._res = r; });
      const v = this;
      this.handle = {
        stop: (fade) => v.stop(fade != null ? fade : v.defFade),
        setPos: (p) => v.setPos(p),
        setVol: (x, tc) => v.setVol(x, tc),
        set: (params) => { Object.assign(v.params, params || {}); },
        get playing() { return !v.ended && !v.stopping; },
        dur: 0,
        done: this.done,
      };
    }
    sh(n) { this.shared.push(n); liveNodes++; return n; }
    grp() { return new Grp(this); }
    // a voice-lifetime mixing gain into this.in (for chains that no single source owns)
    mixer(val = 1) { const n = this.sh(ctx.createGain()); n.gain.value = val; n.connect(this.in); return n; }
    // periodic task: cb(t, i) at `first`, then every iv() seconds (iv may be a number or a function)
    every(first, iv, cb, opt = {}) { this.tasks.push({ next: first, iv, cb, i: 0, n: opt.n != null ? opt.n : Infinity, end: opt.end != null ? opt.end : Infinity }); }
    pumpTasks(until) {
      const now = ctx.currentTime;
      for (const k of [...this.tasks]) {
        if (k.next < now - 0.05) k.next = now + 0.02; // fell behind (throttled tab): skip ahead, never burst
        while (k.next < until && this.tasks.includes(k)) {
          if (k.i >= k.n || k.next >= k.end) { this.tasks.splice(this.tasks.indexOf(k), 1); break; }
          const r = k.cb(k.next, k.i++);
          if (r === false) { this.tasks.splice(this.tasks.indexOf(k), 1); break; }
          k.next += Math.max(0.02, typeof k.iv === 'function' ? k.iv() : k.iv);
        }
        if (this.tasks.includes(k) && (k.i >= k.n || k.next >= k.end)) this.tasks.splice(this.tasks.indexOf(k), 1);
      }
      this.check();
    }
    check() { if (!this.ended && this.built && this.tasks.length === 0 && this.grps.size === 0) this.end(); }
    setVol(x, tc = 0.08) { if (this.ended || this.stopping || x == null) return; this.out.gain.setTargetAtTime(Math.max(0, x) * this.baseVol, ctx.currentTime, tc); }
    setPos(p) {
      if (this.ended || !p) return;
      if (this.panner) setPannerPos(this.panner, p, false);
      if (this.send && this.o.pos) this.send.gain.setTargetAtTime(wetFor(this.wet, p), ctx.currentTime, 0.1);
    }
    stop(fade = 0.05) {
      if (this.ended || this.stopping) return;
      this.stopping = true; this.tasks.length = 0;
      for (const h of this.children) h.stop(fade);
      const now = ctx.currentTime, f = Math.max(0.004, fade);
      holdParam(this.out.gain, now); this.out.gain.linearRampToValueAtTime(0, now + f);
      const e = now + f + 0.015;
      for (const s of this.srcs) { if (s._t1 == null || s._t1 > e) { s._t1 = e; try { s.stop(e); } catch (err) { /* not started */ } } }
      this.hardEnd = e + 2;
      this.check();
    }
    end() {
      if (this.ended) return;
      this.ended = true; this.tasks.length = 0;
      for (const s of this.srcs) { s.onended = null; try { s.stop(); } catch (e) { /* done */ } }
      this.srcs.clear();
      for (const g of [...this.grps]) g.free();
      for (const n of this.shared) { try { n.disconnect(); } catch (e) { /* already */ } }
      liveNodes -= this.shared.length; this.shared.length = 0;
      voices.delete(this); sirens.delete(this);
      this._res();
    }
  }

  // ---- envelope + building-block helpers (all take a Grp) ----------------------------------------------------------
  function ad(p, t, a, peak, d) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(Math.max(1e-4, peak), t + a); p.exponentialRampToValueAtTime(1e-4, t + a + Math.max(0.002, d)); }
  function box(p, t, dur, amp, a = 0.004, r = 0.012) {
    dur = Math.max(dur, a + r + 0.002);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(amp, t + a); p.setValueAtTime(amp, t + dur - r); p.linearRampToValueAtTime(0, t + dur);
  }
  function lfo(g, rate, depth, param, t0, t1, type = 'sine') { const o = g.osc(type, rate, t0, t1); const d = g.gain(depth, param); o.connect(d); return { o, d }; }
  function thump(g, t, f0, f1, dur, amp, dest) {
    const o = g.osc('sine', f0, t, t + dur + 0.05);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const a = g.gain(0, dest); o.connect(a); ad(a.gain, t, 0.003, amp, dur);
    return a;
  }
  function ping(g, t, f, dur, amp, dest, type = 'sine', att = 0.0015) {
    const o = g.osc(type, f, t, t + att + dur + 0.03);
    const a = g.gain(0, dest); o.connect(a); ad(a.gain, t, att, amp, dur);
    return o;
  }
  function burst(g, t, dur, ftype, f, q, amp, dest, kind = 'white', att = 0.0015) {
    const s = g.noise(kind, t, t + att + dur + 0.03);
    const fl = g.filt(ftype, f, q); s.connect(fl);
    const a = g.gain(0, dest); fl.connect(a); ad(a.gain, t, att, amp, dur);
    return { s, fl, a };
  }
  function partials(g, t, f, list, amp, dest, att = 0.002) { for (const [r, a, d] of list) ping(g, t, f * r, d, a * amp, dest, 'sine', att); }
  // Random spikes on a gain param: crackle, grit, dot-matrix chatter. dens = events/s (number or fn of 0..1).
  function crackle(p, t0, dur, dens, pk = [0.2, 1], dec = [0.002, 0.012], base = 0) {
    const floor = Math.max(1e-4, base);
    p.setValueAtTime(floor, t0);
    let t = t0 + rnd(0, 0.01);
    const tEnd = t0 + dur;
    while (t < tEnd) {
      const x = (t - t0) / dur, d = Math.max(0.5, typeof dens === 'function' ? dens(x) : dens);
      const a = rnd(pk[0], pk[1]), dd = rnd(dec[0], dec[1]);
      p.setValueAtTime(floor, t); p.linearRampToValueAtTime(Math.max(floor, a), t + 0.0006); p.exponentialRampToValueAtTime(floor, t + 0.0006 + dd);
      t += 0.0008 + dd + -Math.log(1 - Math.random() * 0.999) / d;
    }
    p.setValueAtTime(floor, tEnd);
  }
  function sweepNoise(g, t, dur, f0, f1, f2, q, amp, dest, kind = 'pink') {
    const s = g.noise(kind, t, t + dur + 0.03);
    const bp = g.filt('bandpass', f0, q); s.connect(bp);
    const a = g.gain(0, dest); bp.connect(a);
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(amp, t + dur * 0.45); a.gain.linearRampToValueAtTime(0, t + dur);
    return { bp, a };
  }
  // Stick-slip creak: an irregular pulse train through wood / metal / cardboard resonances.
  function creakSyn(g, t, dur, o, dest) {
    const f0 = o.f || rnd(28, 58);
    const src = g.osc('sawtooth', f0, t, t + dur + 0.06);
    const fp = src.frequency; fp.setValueAtTime(f0, t);
    const n = Math.max(3, Math.round(dur * 7));
    for (let i = 1; i <= n; i++) fp.linearRampToValueAtTime(f0 * rnd(0.5, 1.7), t + (dur * i) / n);
    const amp = g.gain(0, dest);
    const res = o.metal ? [[830, 16, 7], [1780, 18, 5], [2950, 20, 3]] : o.card ? [[310, 5, 5], [720, 6, 4], [1350, 7, 2]] : [[520, 9, 6], [1180, 11, 5], [2300, 12, 2.5]];
    for (const [f, q, a] of res) { const bp = g.filt('bandpass', f * rnd(0.9, 1.1), q); src.connect(bp); bp.connect(g.gain(a, amp)); }
    const A = amp.gain, pk = o.amp || 0.5, segs = Math.max(2, Math.round(dur * 4));
    A.setValueAtTime(0, t);
    for (let i = 0; i < segs; i++) {
      const s = dur / segs, tt = t + i * s;
      A.linearRampToValueAtTime(rnd(0.35, 1) * pk, tt + s * 0.4); A.linearRampToValueAtTime(rnd(0.05, 0.4) * pk, tt + s);
    }
    A.linearRampToValueAtTime(0, t + dur + 0.04);
  }
  function crinkle(g, t, d, dens, amp, dest) {
    const s = g.noise('white', t, t + d + 0.05);
    const hp = g.filt('highpass', 1700, 0.7); const bp = g.filt('bandpass', 4200, 0.6);
    s.connect(hp); hp.connect(bp);
    const a = g.gain(0, dest); bp.connect(a);
    crackle(a.gain, t, d, (x) => dens * 170 * (0.35 + Math.sin(x * Math.PI) * 0.9), [amp * 0.15, amp], [0.002, 0.011]);
    const s2 = g.noise('white', t, t + d + 0.05); const bp2 = g.filt('bandpass', 1300, 1.2); s2.connect(bp2);
    const a2 = g.gain(0, dest); bp2.connect(a2);
    crackle(a2.gain, t, d, dens * 35, [amp * 0.1, amp * 0.5], [0.004, 0.02]);
  }
  function latch(g, t, amp, dest, hi = 1) {
    burst(g, t, 0.008, 'bandpass', 2600 * hi, 3, amp, dest);
    ping(g, t, 1850 * hi * rnd(0.97, 1.03), 0.035, amp * 0.3, dest);
    ping(g, t + 0.002, 3150 * hi, 0.02, amp * 0.15, dest);
  }
  function piezo(g, t, f, dur, amp, dest) {
    const bp = g.filt('bandpass', f, 4, dest);
    const a = g.gain(0, bp); g.osc('square', f, t, t + dur + 0.02, a); box(a.gain, t, dur, amp, 0.003, 0.01);
    const b = g.gain(0, dest); g.osc('sine', f, t, t + dur + 0.02, b); box(b.gain, t, dur, amp * 0.6, 0.003, 0.01);
  }
  function tear(g, t, amp, dest) {
    const s = g.noise('white', t, t + 0.35); const bp = g.filt('bandpass', 4200, 1.1); s.connect(bp);
    const a = g.gain(0, dest); bp.connect(a);
    bp.frequency.setValueAtTime(4200, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.26);
    crackle(a.gain, t, 0.26, (x) => 420 * (1 - x * 0.5), [amp * 0.25, amp], [0.0015, 0.006]);
    return t + 0.3;
  }
  function jingle(g, t, n, spread, dest, amp, hi = 1) {
    for (let i = 0; i < n; i++) {
      const ti = t + Math.pow(Math.random(), 1.5) * spread, f = rnd(2300, 4600) * hi, a = amp * rnd(0.35, 1);
      ping(g, ti, f, rnd(0.06, 0.2), a, dest);
      ping(g, ti, f * rnd(1.48, 1.56), rnd(0.04, 0.12), a * 0.5, dest);
      if (Math.random() < 0.4) ping(g, ti, f * rnd(2.55, 2.7), 0.05, a * 0.25, dest);
    }
  }
  function buzzPulse(g, t, f, d, amp, dest) {
    const o = g.osc('sawtooth', f, t, t + d + 0.03); const lp = g.filt('lowpass', 800, 0.8); o.connect(lp);
    const a = g.gain(0, dest); lp.connect(a); box(a.gain, t, d, amp, 0.012, 0.025);
    const nz = g.noise('white', t, t + d + 0.03); const nb = g.filt('bandpass', 1900, 2); nz.connect(nb);
    const na = g.gain(0, dest); nb.connect(na); box(na.gain, t, d, amp * 0.35, 0.012, 0.025);
    lfo(g, rnd(27, 33), amp * 0.3, a.gain, t, t + d + 0.03, 'square');
  }
  const BELL_BAR = [[1, 1, 1], [2.756, 0.32, 0.42], [5.404, 0.12, 0.18], [8.933, 0.04, 0.08]];
  const BELL_PHONE = [[1, 1, 0.6], [2.32, 0.45, 0.3], [4.25, 0.22, 0.14]];
  const STEEL = [[1, 1, 1.4], [2.756, 0.55, 0.8], [5.404, 0.3, 0.45], [8.933, 0.15, 0.25]];
  const METAL = [[1, 1, 0.5], [2.17, 0.5, 0.3], [3.6, 0.3, 0.2], [5.1, 0.15, 0.12]];
  const GLASS = [[1, 1, 0.16], [2.05, 0.6, 0.11], [3.4, 0.4, 0.08], [4.6, 0.25, 0.05]];
  const VIBE = [[1, 1, 1.8], [4.0, 0.22, 0.3], [10.0, 0.05, 0.1]];

  const SFX = {};
  const DEF = {};

  // =============================================================================================================
  // Signature sounds (spec §2 "each a reusable function")
  // =============================================================================================================
  function chimeTone(g, t, f, dec, amp, dest) {
    const o = g.gain(1, dest);
    for (const [r, a, d] of BELL_BAR) ping(g, t, f * r, dec * d, a * amp, o, 'sine', 0.0015);
    burst(g, t, 0.012, 'highpass', 2500, 0.7, amp * 0.12, o); // plunger strike
  }
  // Two-tone shop-door chime: a plunger striking two tuned bars, high then a major third lower.
  SFX.chime = (v, o, t) => {
    const g = v.grp(), R = rt(o) * rnd(0.995, 1.005);
    chimeTone(g, t, 740 * R, 2.4, 0.2, v.in);
    chimeTone(g, t + 0.55 / rt(o), 587.3 * R, 3.0, 0.19, v.in);
    return 3.7;
  };
  DEF.chime = { verb: 0.25 };

  // EFTPOS "approved": short blip then the long piezo beep.
  SFX.eftpos = (v, o, t) => {
    const g = v.grp(), R = rt(o);
    if (o.declined) { for (let i = 0; i < 3; i++) piezo(g, t + i * 0.16, 1200 * R, 0.1, 0.2, v.in); return 0.6; }
    piezo(g, t, 1560 * R, 0.06, 0.2, v.in);
    piezo(g, t + 0.1, 2080 * R, 0.27, 0.22, v.in);
    return 0.45;
  };

  // Receipt printer: stepped dot-matrix buzz, line by line, then the paper tear.
  SFX.printer = (v, o, t) => {
    const g = v.grp(), R = rt(o), lines = Math.max(1, o.lines || 14), on = 0.05, off = 0.02, T = lines * (on + off);
    const mix = g.gain(1, v.in);
    const bp = g.filt('bandpass', 1400, 1.4, mix);
    const gate = g.gain(0, bp);
    const saw = g.osc('sawtooth', 200 * R, t, t + T + 0.05, gate);
    const sqg = g.gain(0.5, gate); const sq = g.osc('square', 400 * R, t, t + T + 0.05, sqg);
    const head = g.noise('white', t, t + T + 0.05); const hbp = g.filt('bandpass', 3800, 1.8); head.connect(hbp);
    const hg = g.gain(0, mix); hbp.connect(hg);
    const mg = g.gain(0, mix); g.osc('triangle', 96 * R, t, t + T + 0.1, mg);
    mg.gain.setValueAtTime(0, t); mg.gain.linearRampToValueAtTime(0.05, t + 0.03); mg.gain.setValueAtTime(0.05, t + T); mg.gain.linearRampToValueAtTime(0, t + T + 0.05);
    hg.gain.setValueAtTime(0, t);
    for (let i = 0; i < lines; i++) {
      const ti = t + i * (on + off), f = 200 * R * rnd(0.8, 1.28);
      saw.frequency.setValueAtTime(f, ti); sq.frequency.setValueAtTime(f * 2, ti);
      gate.gain.setValueAtTime(0, ti); gate.gain.linearRampToValueAtTime(0.2, ti + 0.004); gate.gain.setValueAtTime(0.2, ti + on - 0.006); gate.gain.linearRampToValueAtTime(0, ti + on);
      for (let k = 0; k < 5; k++) { const tk = ti + (k * on) / 5; hg.gain.setValueAtTime(0.12 * rnd(0.3, 1), tk); hg.gain.setValueAtTime(0, tk + 0.004); }
    }
    let end = t + T;
    if (o.tear !== false) end = tear(g, end + 0.25, 0.4, mix);
    return end - t + 0.2;
  };

  // Dial-up handshake that climbs into a siren over 6 s — the Outage cue. Cuts itself dead at the end unless
  // opts.sustain (then the siren holds until stopped or 'siren_cut'). opts.dur rescales the 6 s.
  SFX.dialup = (v, o, t) => {
    sirens.add(v);
    const g = v.grp(), D = o.dur || 6, k = D / 6, R = rt(o), sus = !!o.sustain;
    const T = (s) => t + s * k, END = sus ? undefined : T(6) + 0.01;
    // "from everywhere": a dry centre plus two short, uncorrelated reflections panned hard left/right. No shared
    // reverb, so nothing rings on after the cut.
    const mix = g.gain(0.8, v.in);
    for (const [dt, pn] of [[0.019, -0.95], [0.031, 0.95]]) { const dl = g.delay(dt, 0.1); mix.connect(dl); dl.connect(g.gain(0.45, g.pan(pn, v.in))); }
    const L = g.pan(-0.6, mix), Rr = g.pan(0.6, mix), C = g.pan(0, mix);
    // 1. answer tone 2100 Hz, amplitude-modulated, with phase-reversal dips
    const aA = g.gain(0, C); g.osc('sine', 2100 * R, T(0), T(1.25), aA);
    const A = aA.gain;
    A.setValueAtTime(0, T(0)); A.linearRampToValueAtTime(0.1, T(0.35));
    for (const d of [0.45, 0.9]) { A.setValueAtTime(0.1, T(d)); A.linearRampToValueAtTime(0.02, T(d) + 0.012); A.linearRampToValueAtTime(0.1, T(d) + 0.035); }
    A.setValueAtTime(0.1, T(1.15)); A.linearRampToValueAtTime(0, T(1.25));
    lfo(g, 15, 0.025, A, T(0), T(1.25));
    // 2. FSK warble, two carriers (left / right), random mark/space
    for (const [pn, lo, hi, amp, t0] of [[L, 1650, 1850, 0.11, 1.2], [Rr, 980, 1180, 0.08, 1.3]]) {
      const fb = g.filt('bandpass', (lo + hi) / 2 * R, 2.5); const fa = g.gain(0, pn); fb.connect(fa);
      const fs = g.osc('square', lo * R, T(t0), T(2.3), fb);
      box(fa.gain, T(t0), T(2.25) - T(t0), amp, 0.01, 0.02);
      for (let tt = T(t0); tt < T(2.25); tt += rnd(0.012, 0.045)) fs.frequency.setValueAtTime((Math.random() < 0.5 ? lo : hi) * R, tt);
    }
    // 3. line probing: a brief chord of pure tones
    const pa = g.gain(0, C); box(pa.gain, T(2.3), 0.3 * k, 1, 0.01, 0.03);
    for (const [f, a] of [[429, 0.035], [1000, 0.045], [1650, 0.035], [2250, 0.03], [2850, 0.025], [3429, 0.02]]) g.osc('sine', f * R, T(2.3), T(2.3) + 0.3 * k + 0.02, g.gain(a, pa));
    // 4. training screech: gated band noise that brightens as the siren takes over
    const nz = g.noise('white', T(2.55), END); const nbp = g.filt('bandpass', 1800, 0.7); nz.connect(nbp);
    const na = g.gain(0, mix); nbp.connect(na);
    na.gain.setValueAtTime(0, T(2.55)); na.gain.linearRampToValueAtTime(0.16, T(2.7)); na.gain.setValueAtTime(0.16, T(4)); na.gain.linearRampToValueAtTime(0.04, T(5.6));
    if (!sus) na.gain.linearRampToValueAtTime(0, T(6));
    nbp.frequency.setValueAtTime(1800, T(2.55)); nbp.frequency.linearRampToValueAtTime(2400, T(4.2)); nbp.frequency.exponentialRampToValueAtTime(3600, T(5.8));
    lfo(g, 38, 0.06, na.gain, T(2.55), END, 'square');
    const scb = g.filt('bandpass', 2000, 2); const sca = g.gain(0, Rr); scb.connect(sca); box(sca.gain, T(2.6), 1.8 * k, 0.06, 0.02, 0.2);
    const sc = g.osc('sawtooth', 1200, T(2.6), T(4.45), scb);
    for (let tt = T(2.6); tt < T(4.4); tt += rnd(0.02, 0.06)) sc.frequency.setValueAtTime(rnd(900, 2600) * R, tt);
    // 5. the siren: detuned saws left/right, rising with an accelerating wail
    for (const [pn, det] of [[L, 0.997], [Rr, 1.004], [C, 1]]) {
      const lp = g.filt('lowpass', 900, 0.8); const sa = g.gain(0, pn); lp.connect(sa);
      const s = g.osc(det === 1 ? 'square' : 'sawtooth', 300 * R * det * (det === 1 ? 2 : 1), T(3), END, lp);
      s.frequency.setValueAtTime(300 * R * det * (det === 1 ? 2 : 1), T(3)); s.frequency.exponentialRampToValueAtTime(820 * R * det * (det === 1 ? 2 : 1), T(5.4));
      const w = lfo(g, 0.55, 0, s.frequency, T(3), END);
      w.d.gain.setValueAtTime(0, T(3.6)); w.d.gain.linearRampToValueAtTime(70 * (det === 1 ? 2 : 1), T(5.6));
      w.o.frequency.setValueAtTime(0.55, T(3)); w.o.frequency.linearRampToValueAtTime(1.3, T(5.8));
      lp.frequency.setValueAtTime(900, T(3)); lp.frequency.exponentialRampToValueAtTime(4200, T(5.6));
      const pk = det === 1 ? 0.05 : 0.2;
      sa.gain.setValueAtTime(0, T(3)); sa.gain.linearRampToValueAtTime(pk * 0.25, T(4.2)); sa.gain.linearRampToValueAtTime(pk, T(5.7));
      if (!sus) { sa.gain.setValueAtTime(pk, T(6) - 0.008); sa.gain.linearRampToValueAtTime(0, T(6)); }
    }
    return sus ? Infinity : D + 0.02;
  };

  // The siren cuts dead: kills any running dial-up/siren and leaves a relay clack and a breath of static.
  SFX.siren_cut = (v, o, t) => {
    for (const s of [...sirens]) s.stop(0.006);
    const g = v.grp();
    burst(g, t, 0.012, 'highpass', 1500, 0.7, 0.5, v.in);
    thump(g, t, 90, 40, 0.07, 0.35, v.in);
    const p = g.osc('sine', 1400, t, t + 0.05); p.frequency.exponentialRampToValueAtTime(60, t + 0.03);
    const pa = g.gain(0, v.in); p.connect(pa); ad(pa.gain, t, 0.001, 0.15, 0.03);
    burst(g, t + 0.005, 0.22, 'bandpass', 2600, 0.6, 0.05, v.in);
    return 0.4;
  };

  // Leaving the Outage: one long exhale of static.
  SFX.exhale_static = (v, o, t) => {
    const g = v.grp(), D = o.dur || 4.5;
    for (const pn of [-0.5, 0.5]) {
      const s = g.noise('pink', t, t + D + 0.1); const bp = g.filt('bandpass', 2600, 0.8); s.connect(bp);
      const a = g.gain(0); bp.connect(a); a.connect(g.pan(pn, v.in));
      bp.frequency.setValueAtTime(2600 * rnd(0.9, 1.1), t); bp.frequency.exponentialRampToValueAtTime(450, t + D);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.42, t + 0.8); a.gain.exponentialRampToValueAtTime(0.05, t + D * 0.8); a.gain.linearRampToValueAtTime(0, t + D);
    }
    const f = g.noise('white', t, t + D + 0.1); const pre = g.gain(1); f.connect(pre);
    const fa = g.gain(0, v.in);
    for (const [fr, q, a] of [[700, 4, 1], [1150, 5, 0.7]]) { const bp = g.filt('bandpass', fr, q); pre.connect(bp); bp.connect(g.gain(a, fa)); bp.frequency.setValueAtTime(fr, t); bp.frequency.exponentialRampToValueAtTime(fr * 0.6, t + D); }
    fa.gain.setValueAtTime(0, t); fa.gain.linearRampToValueAtTime(0.35, t + 0.9); fa.gain.exponentialRampToValueAtTime(1e-3, t + D);
    const c = g.noise('white', t, t + D + 0.1); const ch = g.filt('highpass', 3000, 0.7); c.connect(ch);
    const ca = g.gain(0, v.in); ch.connect(ca);
    crackle(ca.gain, t, D, (x) => 120 * (1 - x) + 4, [0.05, 0.3], [0.002, 0.02]);
    const r = g.noise('brown', t, t + D + 0.1); const rl = g.filt('lowpass', 220, 0.7); r.connect(rl);
    const ra = g.gain(0, v.in); rl.connect(ra); ra.gain.setValueAtTime(0, t); ra.gain.linearRampToValueAtTime(0.3, t + 1.1); ra.gain.linearRampToValueAtTime(0, t + D);
    return D + 0.1;
  };
  DEF.exhale_static = { verb: 0.3 };

  // ---- hold music: an original cheerful 8-bar tune (F major, 108 bpm) on a soft square, with tape wobble ----------
  // [midi | 0 = rest, beats]
  const HOLD_MEL = [
    [[72, 0.5], [69, 0.5], [65, 0.5], [69, 0.5], [72, 1], [74, 0.5], [72, 0.5]],
    [[70, 1], [67, 0.5], [69, 0.5], [70, 1.5], [0, 0.5]],
    [[69, 0.5], [72, 0.5], [77, 1], [76, 0.5], [74, 0.5], [72, 1]],
    [[74, 0.5], [72, 0.5], [70, 0.5], [69, 0.5], [67, 2]],
    [[72, 0.5], [69, 0.5], [65, 0.5], [69, 0.5], [72, 1], [74, 0.5], [76, 0.5]],
    [[77, 1], [76, 0.5], [74, 0.5], [72, 1], [69, 1]],
    [[70, 0.5], [74, 0.5], [72, 0.5], [70, 0.5], [69, 1], [67, 1]],
    [[65, 1.5], [69, 0.5], [65, 1], [0, 1]],
  ];
  const HOLD_CH = [['F', 'F'], ['Bb', 'Gm'], ['F', 'F'], ['Gm', 'C'], ['F', 'Am'], ['Bb', 'F'], ['Gm', 'C'], ['F', 'F']];
  const CHORD = { F: [41, [53, 57, 60]], Bb: [46, [53, 58, 62]], Gm: [43, [55, 58, 62]], C: [48, [55, 60, 64]], Am: [45, [57, 60, 64]] };
  function sqNote(g, t, f, d, amp, dest) {
    const a = g.gain(0, dest);
    g.osc(PW.softsq, f, t, t + d + 0.08, a);
    const b = g.gain(0, dest); g.osc('sine', f * 2, t, t + d + 0.08, b);
    const A = a.gain; A.setValueAtTime(0, t); A.linearRampToValueAtTime(amp, t + 0.008); A.linearRampToValueAtTime(amp * 0.7, t + 0.08); A.setValueAtTime(amp * 0.7, t + d); A.linearRampToValueAtTime(0, t + d + 0.05);
    ad(b.gain, t, 0.006, amp * 0.18, Math.min(0.25, d));
  }
  function holdBar(v, t, bar, beat, R, dest, amp = 1) {
    const g = v.grp();
    let bt = 0;
    for (const [m, d] of HOLD_MEL[bar]) { if (m) sqNote(g, t + bt * beat, mtof(m) * R, d * beat * 0.9, 0.1 * amp, dest); bt += d; }
    HOLD_CH[bar].forEach((ch, h) => {
      const tc = t + h * 2 * beat, [root, notes] = CHORD[ch];
      for (const [off, m, a] of [[0, root, 0.15], [1, root + 7, 0.09]]) {
        const ba = g.gain(0, dest); g.osc('triangle', mtof(m) * R, tc + off * beat, tc + off * beat + beat, ba);
        ad(ba.gain, tc + off * beat, 0.01, a * amp, beat * 0.8);
      }
      for (const off of [0.5, 1.5]) {
        const ts = tc + off * beat, sa = g.gain(0, dest), lp = g.filt('lowpass', 1400, 0.7, sa);
        for (const m of notes) g.osc(PW.softsq, mtof(m) * R, ts, ts + beat * 0.45, lp);
        box(sa.gain, ts, beat * 0.32, 0.028 * amp, 0.006, 0.05);
      }
    });
  }
  SFX.hold = (v, o, t) => {
    const sp = o.speed > 0 ? o.speed : 1, R = rt(o) * sp, beat = 60 / 108 / sp, loop = o.loop !== false;
    const g = v.grp(), end = loop ? undefined : t + 32 * beat + 1.5;
    const mix = g.gain(1);
    const dl = g.delay(0.03, 0.1); mix.connect(dl);
    const lp = g.filt('lowpass', sp < 1 ? 1500 : 2600, 0.6, v.in); dl.connect(lp);
    lfo(g, 0.55 * sp, 0.0032, dl.delayTime, t, end);   // wow
    lfo(g, 6.3 * sp, 0.00035, dl.delayTime, t, end);   // flutter
    const hs = g.noise('white', t, end); const hf = g.filt('highpass', 4500, 0.7); hs.connect(hf); hf.connect(g.gain(0.006, v.in));
    v.every(t, 4 * beat, (tb, i) => holdBar(v, tb, i % 8, beat, R, mix), { n: loop ? Infinity : 8 });
    return loop ? Infinity : 32 * beat + 1.5;
  };
  SFX.hold.loops = true;

  // Manager keys chiming (a ring of dozens of keys, shaken in two or three swings)
  SFX.keys = (v, o, t) => {
    const g = v.grp(), shakes = o.n || 3;
    let tt = t;
    for (let i = 0; i < shakes; i++) { jingle(g, tt, irnd(6, 9), 0.2, v.in, 0.07); tt += rnd(0.24, 0.36); }
    return tt - t + 0.3;
  };
  DEF.keys = { verb: 0.15 };
  SFX.keys_far = (v, o, t) => SFX.keys(v, o, t);
  DEF.keys_far = { vol: 0.45, lp: 2600, verb: 0.7 };
  // Chloe's Top Performer pins clinking
  SFX.pins = (v, o, t) => { const g = v.grp(); jingle(g, t, o.n || 7, 0.35, v.in, 0.045, 1.5); return 0.6; };

  // Pen click: click down, click up
  SFX.penclick = (v, o, t) => {
    const g = v.grp();
    for (const [dt, f, a] of [[0, 1, 0.35], [rnd(0.1, 0.13), 0.88, 0.28]]) {
      burst(g, t + dt, 0.006, 'bandpass', 3500 * f, 3, a, v.in);
      ping(g, t + dt, 2900 * f, 0.025, a * 0.25, v.in);
      ping(g, t + dt, 620 * f, 0.01, a * 0.2, v.in);
    }
    return 0.3;
  };

  // Phone vibration (bzzz — bzzz), with gamepad buzz
  SFX.vibrate = (v, o, t) => {
    const g = v.grp(), pulses = o.short ? [[0, 0.32]] : [[0, 0.42], [0.62, 0.42]];
    for (const [d, len] of pulses) buzzPulse(g, t + d, rnd(160, 172), len, 0.16, v.in);
    if (!v.offline && !o.pos && typeof Input !== 'undefined' && Input.rumble) {
      Input.rumble(0.05, 0.45, 400);
      if (!o.short) setTimeout(() => Input.rumble(0.05, 0.45, 400), 620);
    }
    return o.short ? 0.4 : 1.1;
  };

  // Message chime: two quick rising notes
  SFX.msgchime = (v, o, t) => {
    const g = v.grp(), R = rt(o);
    for (const [dt, f] of [[0, 988], [0.11, 1319]]) {
      ping(g, t + dt, f * R, 0.5, 0.12, v.in, 'triangle', 0.003);
      ping(g, t + dt, f * 2 * R, 0.18, 0.03, v.in, 'sine', 0.003);
    }
    return 0.8;
  };
  // Low-battery chirp (the Standard's phone tell)
  SFX.battery = (v, o, t) => { const g = v.grp(); ping(g, t, 880, 0.08, 0.1, v.in, 'triangle', 0.004); ping(g, t + 0.12, 660, 0.12, 0.1, v.in, 'triangle', 0.004); return 0.35; };

  // Old double-burst phone ring (loops until stopped; opts.n = number of cycles; opts.kind 'ringback' = heard
  // down a line while calling). stop(0) stops it mid-ring.
  function ringCycle(v, t, o) {
    const g = v.grp(), R = rt(o);
    if (o.kind === 'ringback') {
      const a = g.gain(0, v.in);
      for (const f of [400, 425, 450]) g.osc('sine', f * R, t, t + 1.05, g.gain(0.33, a));
      box(a.gain, t, 0.4, 0.12, 0.01, 0.02); a.gain.setValueAtTime(0, t + 0.6); a.gain.linearRampToValueAtTime(0.12, t + 0.61); a.gain.setValueAtTime(0.12, t + 0.98); a.gain.linearRampToValueAtTime(0, t + 1.0);
      return;
    }
    const strike = g.gain(0, v.in);
    for (const [f0, pn] of [[1250, -0.2], [1515, 0.2]]) {
      const p = g.pan(pn, strike);
      for (const [r, a] of BELL_PHONE) g.osc('sine', f0 * r * R * rnd(0.998, 1.002), t, t + 1.4, g.gain(a * 0.5, p));
    }
    const cl = g.noise('white', t, t + 1.4); const cb = g.filt('bandpass', 3200, 2); cl.connect(cb); cb.connect(g.gain(0.12, strike));
    const S = strike.gain;
    S.setValueAtTime(0, t);
    for (const b0 of [t, t + 0.6]) {
      for (let k = 0; k < 8; k++) { const tk = b0 + k * 0.05; S.setValueAtTime(0.18, tk); S.setTargetAtTime(0.07, tk + 0.001, 0.018); }
      S.setTargetAtTime(1e-4, b0 + 0.4, 0.08);
    }
    if (o.buzz && !v.offline && typeof Input !== 'undefined' && Input.rumble) { Input.rumble(0.2, 0.5, 400); setTimeout(() => Input.rumble(0.2, 0.5, 400), 600); }
  }
  SFX.ring = (v, o, t) => {
    const n = o.n || (o.loop === false ? 1 : Infinity);
    v.every(t, 3.0, (tt) => ringCycle(v, tt, o), { n });
    return isFinite(n) ? n * 3 : Infinity;
  };
  SFX.ring.loops = true;
  SFX.ringback = (v, o, t) => SFX.ring(v, { ...o, kind: 'ringback' }, t);
  SFX.ringback.loops = true;
  DEF.ringback = { phone: true };

  // Line static burst (opts.dur) or continuous (loop:true; intensity via handle.set({intensity}))
  SFX.static = (v, o, t) => {
    const g = v.grp(), loop = !!o.loop, d = o.dur || 0.7, t1 = loop ? undefined : t + d + 0.05;
    const s = g.noise('white', t, t1); const bp = g.filt('bandpass', 2300, 0.7); s.connect(bp);
    const c = g.gain(0); bp.connect(c);
    const a = g.gain(0, v.in); c.connect(a);
    const p = g.noise('pink', t, t1); const hp = g.filt('highpass', 700, 0.7); p.connect(hp); hp.connect(g.gain(0.35, c));
    if (loop) {
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.22, t + 0.08);
      v.every(t, 0.9, (tt) => crackle(c.gain, tt, 0.9, 60 + 140 * (v.params.intensity != null ? v.params.intensity : 0.5), [0.5, 1.4], [0.004, 0.04], 0.55));
      return Infinity;
    }
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.28, t + 0.02); a.gain.setValueAtTime(0.28, t + d * 0.6); a.gain.linearRampToValueAtTime(0, t + d);
    crackle(c.gain, t, d, 140, [0.5, 1.5], [0.004, 0.03], 0.5);
    return d + 0.05;
  };
  SFX.static.loops = true;

  // Flat disconnected tone after a line click (opts.dur, or loop:true)
  SFX.disconnected = (v, o, t) => {
    const g = v.grp(), loop = !!o.loop, d = o.dur || 3, t1 = loop ? undefined : t + d;
    latch(g, t, 0.12, v.in, 0.8);
    const a = g.gain(0, v.in);
    g.osc('sine', 425, t + 0.12, t1, a); g.osc('sine', 850, t + 0.12, t1, g.gain(0.1, a));
    a.gain.setValueAtTime(0, t + 0.12); a.gain.linearRampToValueAtTime(0.16, t + 0.14);
    if (!loop) { a.gain.setValueAtTime(0.16, t + d - 0.02); a.gain.linearRampToValueAtTime(0, t + d); }
    return loop ? Infinity : d + 0.05;
  };
  SFX.disconnected.loops = true;
  DEF.disconnected = { phone: true };

  // Dial tone: 425 Hz modulated at 25 Hz (opts.dur, or loop:true)
  SFX.dialtone = (v, o, t) => {
    const g = v.grp(), loop = !!o.loop, d = o.dur || 4, t1 = loop ? undefined : t + d + 0.02;
    const env = g.gain(0, v.in), am = g.gain(0.6, env);
    g.osc('sine', 425, t, t1, am);
    lfo(g, 25, 0.35, am.gain, t, t1);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.18, t + 0.02);
    if (!loop) { env.gain.setValueAtTime(0.18, t + d - 0.02); env.gain.linearRampToValueAtTime(0, t + d); }
    return loop ? Infinity : d + 0.05;
  };
  SFX.dialtone.loops = true;
  DEF.dialtone = { phone: true };

  // Rotary dial pulses: Snd.play('rotary_click', {n}) = n clean clicks at 10 pps (opts.fast: 14 pps)
  SFX.rotary_click = (v, o, t) => {
    const g = v.grp(), n = Math.max(1, Math.round(o.n || 1)), per = o.fast ? 0.07 : 0.1;
    for (let i = 0; i < n; i++) {
      const tt = t + i * per;
      burst(g, tt, 0.004, 'bandpass', 2600, 4, 0.4 * rnd(0.94, 1), v.in);
      ping(g, tt, 820, 0.01, 0.1, v.in);
    }
    return n * per + 0.05;
  };

  // Breathing: 'breath' = slow breathing on a line (phone band, n breaths or loop); the Reach's is heavier.
  function breathCycle(v, t, heavy) {
    const g = v.grp(), I = v.params.intensity != null ? v.params.intensity : 0.5;
    const inD = heavy ? rnd(0.8, 1.05) : rnd(1.3, 1.7), exD = heavy ? rnd(1.0, 1.25) : rnd(1.8, 2.3), gap = heavy ? 0.1 : rnd(0.3, 0.5);
    const len = inD + gap + exD;
    const s = g.noise('white', t, t + len + 0.1);
    const f1 = g.filt('bandpass', heavy ? 1100 : 1400, 1.2), f2 = g.filt('bandpass', heavy ? 2000 : 2600, 2.2);
    s.connect(f1); s.connect(f2);
    const a = g.gain(0, v.in); f1.connect(a); f2.connect(g.gain(0.5, a));
    const A = a.gain, amp = (heavy ? 0.55 : 0.3) * (0.8 + 0.4 * I);
    A.setValueAtTime(0, t); A.linearRampToValueAtTime(amp * 0.6, t + inD * 0.35); A.linearRampToValueAtTime(amp * 0.75, t + inD * 0.8); A.linearRampToValueAtTime(0, t + inD);
    const te = t + inD + gap;
    f1.frequency.setValueAtTime(heavy ? 650 : 820, te); f2.frequency.setValueAtTime(heavy ? 1400 : 1700, te);
    A.setValueAtTime(0, te); A.linearRampToValueAtTime(amp, te + 0.12); A.exponentialRampToValueAtTime(amp * 0.3, te + exD * 0.7); A.linearRampToValueAtTime(0, te + exD);
    if (heavy) {
      const gr = g.gain(0, v.in); const gl = g.filt('lowpass', 380, 1, gr);
      g.osc('sawtooth', rnd(66, 78), te, te + exD + 0.05, gl);
      box(gr.gain, te + 0.05, exD * 0.8, 0.12 * (0.6 + I), 0.08, 0.3);
      lfo(g, 23, 0.05, gr.gain, te, te + exD, 'square');
    }
    return len;
  }
  SFX.breath = (v, o, t) => {
    const g = v.grp(), loop = !!o.loop;
    let tt = t;
    const hissEnd = () => (loop ? undefined : tt + 0.3);
    if (loop) {
      v.every(t, () => (v.lastCycle || 4) + rnd(0.6, 1.1), (x) => { v.lastCycle = breathCycle(v, x, false); });
    } else {
      for (let i = 0; i < (o.n || 2); i++) tt += breathCycle(v, tt, false) + rnd(0.7, 1.0);
    }
    const h = g.noise('white', t, hissEnd()); const hf = g.filt('highpass', 1000, 0.7); h.connect(hf); hf.connect(g.gain(0.01, v.in));
    return loop ? Infinity : tt - t + 0.3;
  };
  SFX.breath.loops = true;
  DEF.breath = { phone: true };
  SFX.reach_breath = (v, o, t) => {
    v.every(t, () => (v.lastCycle || 2.2) * (1.15 - 0.45 * (v.params.intensity != null ? v.params.intensity : 0.5)) + 0.1, (x) => { v.lastCycle = breathCycle(v, x, true); });
    return Infinity;
  };
  SFX.reach_breath.loops = true;
  // The Standard's one disappointed exhale
  SFX.sigh = (v, o, t) => {
    const g = v.grp(), D = o.dur || 1.9;
    const s = g.noise('white', t, t + D + 0.1); const pre = g.gain(1); s.connect(pre);
    const a = g.gain(0, v.in);
    for (const [f, q, m] of [[720, 3, 1], [1250, 4, 0.6], [2500, 5, 0.25]]) { const bp = g.filt('bandpass', f, q); pre.connect(bp); bp.connect(g.gain(m, a)); bp.frequency.setValueAtTime(f, t); bp.frequency.linearRampToValueAtTime(f * 0.7, t + D); }
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.4, t + 0.25); a.gain.exponentialRampToValueAtTime(0.05, t + D * 0.85); a.gain.linearRampToValueAtTime(0, t + D);
    const vo = g.gain(0, v.in); const vl = g.filt('bandpass', 450, 3, vo);
    const o1 = g.osc('sawtooth', 115, t + D * 0.55, t + D, vl); o1.frequency.linearRampToValueAtTime(92, t + D);
    box(vo.gain, t + D * 0.55, D * 0.42, 0.06, 0.1, 0.25);
    return D + 0.1;
  };

  // =============================================================================================================
  // Doors, phones, UI
  // =============================================================================================================
  SFX.handle = (v, o, t) => {
    const g = v.grp();
    latch(g, t, 0.35, v.in); latch(g, t + rnd(0.1, 0.14), 0.28, v.in, 0.92);
    thump(g, t + 0.1, 220, 150, 0.03, 0.08, v.in);
    return 0.35;
  };
  SFX.creak = (v, o, t) => { const g = v.grp(), d = o.dur || rnd(0.9, 1.4); creakSyn(g, t, d, { metal: o.metal, amp: 0.5, f: o.f }, v.in); return d + 0.2; };
  const isGlass = (s) => s === 'glass' || s === 'glass_double' || s === 'wired';
  const isMetal = (s) => s === 'metal' || s === 'fire' || s === 'roller';
  // Door opening: handle, creak, the air of the swing (opts.style as K.door styles)
  SFX.door_open = (v, o, t) => {
    const g = v.grp(), st = o.style || 'wood';
    if (st === 'roller') return SFX.roller(v, o, t);
    latch(g, t, 0.35, v.in); latch(g, t + 0.13, 0.25, v.in, 0.9);
    if (!isGlass(st)) creakSyn(g, t + 0.22, rnd(0.7, 1.0), { metal: isMetal(st), amp: 0.32 }, v.in);
    else partials(g, t + 0.2, 1900, GLASS, 0.03, v.in);
    sweepNoise(g, t + 0.25, 0.7, 250, 600, 300, 0.8, 0.06, v.in);
    return 1.3;
  };
  SFX.door_close = (v, o, t) => {
    const g = v.grp(), st = o.style || 'wood', ti = t + 0.26;
    sweepNoise(g, t, 0.28, 200, 500, 250, 0.8, 0.05, v.in);
    thump(g, ti, isMetal(st) ? 95 : 80, 45, 0.25, 0.5, v.in);
    burst(g, ti, 0.07, 'lowpass', 700, 0.7, 0.35, v.in);
    burst(g, ti, 0.14, 'bandpass', isMetal(st) ? 420 : 190, 5, 0.35, v.in);
    latch(g, ti + 0.02, 0.3, v.in, 1.05);
    if (isMetal(st)) partials(g, ti, 310, METAL, 0.06, v.in);
    if (isGlass(st)) partials(g, ti, 1650, GLASS, 0.05, v.in);
    return 0.95;
  };
  // Locked: the handle jiggled three or four times against the latch
  SFX.door_locked = (v, o, t) => {
    const g = v.grp();
    let tt = t;
    for (let i = 0; i < 4; i++) {
      latch(g, tt, 0.3 * rnd(0.7, 1), v.in, rnd(0.9, 1.1));
      thump(g, tt + 0.005, 130, 90, 0.05, 0.14, v.in);
      burst(g, tt, 0.04, 'bandpass', 900, 2, 0.1, v.in);
      tt += rnd(0.11, 0.16);
    }
    return tt - t + 0.2;
  };
  // Handset hung back on the cradle: plastic clunk, hook switch, the bell's faint ding
  SFX.clunk = (v, o, t) => {
    const g = v.grp();
    thump(g, t, 190, 85, 0.1, 0.45, v.in);
    burst(g, t, 0.035, 'lowpass', 1400, 0.7, 0.3, v.in);
    burst(g, t + 0.018, 0.006, 'highpass', 3000, 0.7, 0.25, v.in);
    partials(g, t + 0.01, 1250, BELL_PHONE, 0.035, v.in);
    thump(g, t + 0.09, 140, 90, 0.05, 0.12, v.in);
    return 0.8;
  };
  SFX.click = (v, o, t) => { const g = v.grp(); burst(g, t, 0.004, 'bandpass', 2000, 2, 0.3, v.in); thump(g, t, 400, 250, 0.02, 0.1, v.in); return 0.1; };
  SFX.torch = (v, o, t) => { const g = v.grp(); burst(g, t, 0.004, 'bandpass', 3500, 2, 0.18, v.in); ping(g, t, 2200, 0.012, 0.05, v.in); return 0.1; };
  SFX.keypress = (v, o, t) => { const g = v.grp(), j = rnd(0.92, 1.08); burst(g, t, 0.006, 'bandpass', 2500 * j, 1.5, 0.25, v.in); thump(g, t, 600 * j, 400, 0.015, 0.1, v.in); return 0.1; };
  SFX.keybeep = (v, o, t) => { const g = v.grp(); piezo(g, t, 1400 * rt(o), 0.07, 0.14, v.in); return 0.15; };
  SFX.error = (v, o, t) => { const g = v.grp(); piezo(g, t, 330, 0.22, 0.16, v.in); piezo(g, t + 0.3, 330, 0.22, 0.16, v.in); return 0.6; };
  SFX.unlock = (v, o, t) => {
    const g = v.grp();
    latch(g, t, 0.3, v.in, 0.8); thump(g, t + 0.06, 180, 110, 0.06, 0.3, v.in); latch(g, t + 0.07, 0.35, v.in, 0.7);
    ping(g, t + 0.08, 900, 0.15, 0.05, v.in);
    return 0.4;
  };
  SFX.plug = (v, o, t) => {
    const g = v.grp();
    if (o.out) { burst(g, t, 0.01, 'bandpass', 2400, 2, 0.25, v.in); ping(g, t, 1500, 0.02, 0.06, v.in); return 0.1; }
    burst(g, t, 0.006, 'bandpass', 3000, 2, 0.3, v.in); ping(g, t, 1800, 0.03, 0.08, v.in); thump(g, t + 0.01, 220, 120, 0.04, 0.2, v.in);
    return 0.15;
  };
  SFX.maglock = (v, o, t) => {
    const g = v.grp(); const bp = g.filt('bandpass', 400, 1.5); const a = g.gain(0, v.in); bp.connect(a);
    g.osc('sawtooth', 100, t, t + 0.1, bp); box(a.gain, t, 0.08, 0.25, 0.003, 0.01);
    thump(g, t + 0.08, 120, 60, 0.12, 0.5, v.in); latch(g, t + 0.09, 0.3, v.in, 0.7);
    return 0.4;
  };
  SFX.buzzer = (v, o, t) => {
    const g = v.grp(), d = o.dur || 0.6; const ws = g.shaper(CV.dist); const bp = g.filt('bandpass', 900, 1); ws.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a); g.osc('sawtooth', 220, t, t + d + 0.02, ws); g.osc('square', 110, t, t + d + 0.02, g.gain(0.5, ws));
    box(a.gain, t, d, 0.12, 0.005, 0.02);
    return d + 0.05;
  };
  SFX.turnstile = (v, o, t) => {
    const g = v.grp();
    latch(g, t, 0.3, v.in, 0.8); thump(g, t, 150, 90, 0.08, 0.35, v.in);
    for (let i = 0; i < 6; i++) burst(g, t + 0.1 + i * 0.035, 0.004, 'bandpass', 2800, 3, 0.18 * (1 - i * 0.1), v.in);
    thump(g, t + 0.35, 120, 80, 0.06, 0.2, v.in);
    return 0.5;
  };
  // Base-station beep ("NO LINE"): soft, through a small speaker. opts.n beeps.
  SFX.beep = (v, o, t) => {
    const g = v.grp(), n = o.n || 1, bp = g.filt('bandpass', 1300, 0.8, v.in);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.25, a = g.gain(0, bp);
      g.osc('sine', 1020 * rt(o), tt, tt + 0.16, a); g.osc('sine', 2040 * rt(o), tt, tt + 0.16, g.gain(0.15, a));
      box(a.gain, tt, 0.14, 0.3, 0.012, 0.03);
    }
    return n * 0.25 + 0.05;
  };
  // Pendant alarm: one long tone
  SFX.alarm_tone = (v, o, t) => {
    const g = v.grp(), d = o.dur || 3.2, bp = g.filt('bandpass', 1500, 0.6, v.in);
    const a = g.gain(0, bp); g.osc('sine', 1020, t, t + d + 0.02, a); g.osc('sine', 2040, t, t + d + 0.02, g.gain(0.2, a));
    box(a.gain, t, d, 0.35, 0.02, 0.03);
    lfo(g, 7, 0.025, a.gain, t, t + d);
    return d + 0.05;
  };
  // Modem boot: relay, three rising chirps, data chatter, then (opts.ok ? a happy double beep : the low red failure)
  SFX.modem_boot = (v, o, t) => {
    const g = v.grp();
    latch(g, t, 0.2, v.in, 0.8); thump(g, t, 120, 80, 0.06, 0.15, v.in);
    [0.25, 0.5, 0.75].forEach((d, i) => {
      const a = g.gain(0, v.in); const c = g.osc('sine', 800 + i * 200, t + d, t + d + 0.1, a);
      c.frequency.exponentialRampToValueAtTime(1600 + i * 400, t + d + 0.08); box(a.gain, t + d, 0.08, 0.1, 0.003, 0.01);
    });
    for (let k = 0; k < 3; k++) {
      const tb = t + 1.2 + k * 0.45, bp = g.filt('bandpass', 1700, 2), a = g.gain(0, v.in); bp.connect(a);
      const f = g.osc('square', 1200, tb, tb + 0.3, bp);
      for (let tt = tb; tt < tb + 0.28; tt += rnd(0.02, 0.06)) f.frequency.setValueAtTime(Math.random() < 0.5 ? 1200 : 2200, tt);
      box(a.gain, tb, 0.28, 0.06, 0.005, 0.02);
    }
    if (o.ok) { piezo(g, t + 3.2, 1000, 0.1, 0.12, v.in); piezo(g, t + 3.35, 1500, 0.18, 0.12, v.in); }
    else { piezo(g, t + 3.2, 440, 0.2, 0.14, v.in); piezo(g, t + 3.5, 440, 0.32, 0.14, v.in); }
    return 4;
  };
  // Clock tick (opts.tock for the lower one; loop:true ticks once a second)
  function tickAt(g, t, tock, amp, dest) {
    burst(g, t, 0.004, 'bandpass', tock ? 2500 : 3300, 6, amp, dest);
    ping(g, t, tock ? 3400 : 4300, 0.018, amp * 0.3, dest);
    ping(g, t, tock ? 900 : 1100, 0.012, amp * 0.2, dest);
  }
  SFX.clock_tick = (v, o, t) => {
    if (o.loop) { v.every(t, 1, (tt, i) => tickAt(v.grp(), tt, i % 2 === 1, 0.3, v.in)); return Infinity; }
    tickAt(v.grp(), t, !!o.tock, 0.3, v.in); return 0.1;
  };
  SFX.clock_tick.loops = true;
  // Car hazard relay (loop:true until stopped, else opts.n ticks)
  SFX.hazard = (v, o, t) => {
    const n = o.loop ? Infinity : o.n || 8;
    v.every(t, 0.375, (tt, i) => { const g = v.grp(), tock = i % 2 === 1; burst(g, tt, 0.004, 'bandpass', tock ? 1600 : 2200, 4, 0.3, v.in); ping(g, tt, tock ? 700 : 900, 0.014, 0.08, v.in); }, { n });
    return isFinite(n) ? n * 0.375 + 0.1 : Infinity;
  };
  SFX.hazard.loops = true;
  // An engine ticking as it cools
  SFX.engine_tick = (v, o, t) => {
    const g = v.grp(), d = o.dur || 6;
    let tt = t + rnd(0.1, 0.5);
    while (tt < t + d) { const a = rnd(0.05, 0.14) * (1 - (tt - t) / d * 0.6); ping(g, tt, rnd(3000, 5200), 0.02, a, v.in); burst(g, tt, 0.003, 'highpass', 3000, 0.7, a * 0.5, v.in); tt += rnd(0.25, 1.4) * (1 + (tt - t) / d); }
    return d + 0.1;
  };
  // PA chime: three warm notes through a ceiling speaker (opts.down = descending, end of announcement)
  SFX.pa_ding = (v, o, t) => {
    const g = v.grp(), hp = g.filt('highpass', 320, 0.7), lp = g.filt('lowpass', 4200, 0.7), ws = g.shaper(CV.soft);
    hp.connect(lp); lp.connect(ws); ws.connect(v.in);
    const notes = o.down ? [784, 659, 523] : [523, 659, 784];
    notes.forEach((f, i) => partials(g, t + i * 0.42, f * rt(o), VIBE, 0.16, hp, 0.004));
    return 2.8;
  };
  DEF.pa_ding = { verb: 0.45 };

  // UI (spec §2A): soft low tick, muted click, dull thud, paper rustle, slow whoosh
  SFX.ui_move = (v, o, t) => { const g = v.grp(); ping(g, t, 520, 0.045, 0.14, v.in, 'sine', 0.002); burst(g, t, 0.006, 'lowpass', 2200, 0.7, 0.05, v.in); return 0.12; };
  SFX.ui_confirm = (v, o, t) => {
    const g = v.grp();
    burst(g, t, 0.008, 'bandpass', 1700, 1, 0.2, v.in); thump(g, t, 330, 260, 0.07, 0.16, v.in);
    burst(g, t + 0.035, 0.006, 'bandpass', 2100, 1.2, 0.1, v.in);
    return 0.2;
  };
  SFX.ui_cancel = (v, o, t) => { const g = v.grp(); thump(g, t, 115, 62, 0.17, 0.35, v.in); burst(g, t, 0.05, 'lowpass', 320, 0.7, 0.25, v.in, 'brown'); return 0.3; };
  DEF.ui_move = { bus: 'ui' }; DEF.ui_confirm = { bus: 'ui' }; DEF.ui_cancel = { bus: 'ui' };
  SFX.paper = (v, o, t) => {
    const g = v.grp(), d = o.dur || rnd(0.35, 0.5);
    const s = g.noise('white', t, t + d + 0.05); const hp = g.filt('highpass', 900, 0.7); const bp = g.filt('bandpass', 3200, 0.5);
    s.connect(hp); hp.connect(bp);
    const a = g.gain(0); bp.connect(a); const env = g.gain(0, v.in); a.connect(env);
    crackle(a.gain, t, d, 260, [0.2, 1], [0.003, 0.02], 0.15);
    const E = env.gain; E.setValueAtTime(0, t); E.linearRampToValueAtTime(0.3, t + 0.06); E.linearRampToValueAtTime(0.14, t + d * 0.45); E.linearRampToValueAtTime(0.26, t + d * 0.6); E.linearRampToValueAtTime(0, t + d);
    burst(g, t + 0.02, d * 0.6, 'lowpass', 700, 0.7, 0.08, v.in, 'pink', 0.03);
    return d + 0.1;
  };
  SFX.whoosh = (v, o, t) => {
    const g = v.grp(), d = o.dur || 0.6, p = g.pan(0, v.in);
    const s = g.noise('pink', t, t + d + 0.05); const bp = g.filt('bandpass', 300, 1.3); s.connect(bp);
    const a = g.gain(0, p); bp.connect(a);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1500, t + d * 0.5); bp.frequency.exponentialRampToValueAtTime(450, t + d);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.4, t + d * 0.5); a.gain.linearRampToValueAtTime(0, t + d);
    const dir = o.dir === 'left' ? -1 : 1; p.pan.setValueAtTime(-0.45 * dir, t); p.pan.linearRampToValueAtTime(0.45 * dir, t + d);
    return d + 0.05;
  };
  SFX.pickup = (v, o, t) => {
    const g = v.grp();
    burst(g, t, 0.16, 'bandpass', 2600, 0.6, 0.12, v.in, 'pink', 0.03);
    burst(g, t + 0.12, 0.005, 'bandpass', 2200, 2, 0.12, v.in);
    return 0.3;
  };
  // Marker scribble (map pickup copies Aidan's notes, ~1 s)
  SFX.scribble = (v, o, t) => {
    const g = v.grp(), d = o.dur || 1;
    let tt = t;
    while (tt < t + d - 0.05) {
      const sd = rnd(0.07, 0.18), f = rnd(2200, 3600);
      const s = g.noise('white', tt, tt + sd + 0.02); const bp = g.filt('bandpass', f, 3); s.connect(bp);
      const a = g.gain(0, v.in); bp.connect(a);
      a.gain.setValueAtTime(0, tt); a.gain.linearRampToValueAtTime(0.28, tt + sd * 0.25); a.gain.linearRampToValueAtTime(0.2, tt + sd * 0.7); a.gain.linearRampToValueAtTime(0, tt + sd);
      bp.frequency.setValueAtTime(f, tt); bp.frequency.linearRampToValueAtTime(f * rnd(0.8, 1.2), tt + sd);
      if (Math.random() < 0.35) { const q = g.gain(0, v.in); const sq = g.osc('sine', rnd(1600, 2200), tt, tt + sd, q); sq.frequency.linearRampToValueAtTime(rnd(1800, 2600), tt + sd); box(q.gain, tt, sd, 0.015, 0.01, 0.02); }
      tt += sd + rnd(0.01, 0.05);
    }
    return d + 0.05;
  };
  // Paper, tape, cardboard, stamps
  SFX.paper_tear = (v, o, t) => { const g = v.grp(); tear(g, t, 0.55, v.in); tear(g, t + rnd(0.4, 0.55), 0.5, v.in); return 1.0; };
  SFX.tape = (v, o, t) => {
    const g = v.grp(), d = o.dur || 0.85;
    const s = g.noise('white', t, t + d + 0.05); const bp = g.filt('bandpass', 2400, 1.4); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a);
    bp.frequency.setValueAtTime(2400, t); bp.frequency.linearRampToValueAtTime(4200, t + d);
    crackle(a.gain, t, d, (x) => 160 + 260 * x, [0.15, 0.4], [0.001, 0.004], 0.03);
    const zh = g.filt('highpass', 900, 0.7); const za = g.gain(0, v.in); zh.connect(za);
    const z = g.osc('sawtooth', 70, t, t + d + 0.02, zh);
    for (let tt = t; tt < t + d; tt += 0.03) z.frequency.setValueAtTime(rnd(55, 120), tt);
    za.gain.setValueAtTime(0, t); za.gain.linearRampToValueAtTime(0.07, t + d * 0.3); za.gain.linearRampToValueAtTime(0, t + d);
    burst(g, t + d, 0.01, 'highpass', 2500, 0.7, 0.3, v.in);
    return d + 0.1;
  };
  SFX.cardboard = (v, o, t) => {
    const g = v.grp(), d = o.dur || 1.6;
    const r = g.noise('brown', t, t + d + 0.1); const rl = g.filt('bandpass', 380, 0.8); r.connect(rl);
    const ra = g.gain(0, v.in); rl.connect(ra);
    ra.gain.setValueAtTime(0, t); ra.gain.linearRampToValueAtTime(0.45, t + 0.15); ra.gain.linearRampToValueAtTime(0.25, t + d * 0.7); ra.gain.linearRampToValueAtTime(0, t + d);
    const s = g.noise('white', t, t + d + 0.1); const bp = g.filt('bandpass', 1400, 1); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a);
    crackle(a.gain, t, d, (x) => 90 + 60 * Math.sin(x * 9), [0.05, 0.45], [0.006, 0.03], 0.02);
    creakSyn(g, t + 0.1, d * 0.8, { f: 30, amp: 0.25, card: true }, v.in);
    return d + 0.2;
  };
  SFX.stamp = (v, o, t) => {
    const g = v.grp();
    thump(g, t, 160, 90, 0.07, 0.5, v.in); burst(g, t, 0.03, 'bandpass', 1500, 0.8, 0.35, v.in);
    burst(g, t + 0.11, 0.02, 'bandpass', 900, 1, 0.08, v.in);
    return 0.3;
  };
  SFX.copier = (v, o, t) => {
    const g = v.grp(), d = o.dur || 3;
    const ml = g.filt('lowpass', 600, 0.8); const ma = g.gain(0, v.in); ml.connect(ma);
    const m = g.osc('sawtooth', 95, t, t + d + 0.1, ml);
    m.frequency.linearRampToValueAtTime(125, t + d * 0.5); m.frequency.linearRampToValueAtTime(95, t + d);
    ma.gain.setValueAtTime(0, t); ma.gain.linearRampToValueAtTime(0.12, t + 0.3); ma.gain.setValueAtTime(0.12, t + d - 0.2); ma.gain.linearRampToValueAtTime(0, t + d);
    const p = g.pan(0, v.in);
    const c = g.noise('pink', t, t + d + 0.1); const cb = g.filt('bandpass', 1600, 0.7); c.connect(cb);
    const ca = g.gain(0, p); cb.connect(ca);
    ca.gain.setValueAtTime(0, t); ca.gain.linearRampToValueAtTime(0.25, t + d * 0.45); ca.gain.linearRampToValueAtTime(0.08, t + d * 0.6); ca.gain.linearRampToValueAtTime(0.15, t + d * 0.85); ca.gain.linearRampToValueAtTime(0, t + d);
    p.pan.setValueAtTime(-0.5, t); p.pan.linearRampToValueAtTime(0.5, t + d * 0.55); p.pan.linearRampToValueAtTime(-0.3, t + d);
    g.osc('sine', 120, t, t + d, g.gain(0.02, v.in));
    thump(g, t + d * 0.55, 150, 90, 0.05, 0.18, v.in); latch(g, t + d * 0.55, 0.12, v.in, 0.7);
    thump(g, t + d, 130, 80, 0.06, 0.2, v.in);
    sweepNoise(g, t + d, 0.3, 1200, 3000, 1500, 0.8, 0.08, v.in);
    return d + 0.4;
  };
  SFX.confetti = (v, o, t) => {
    const g = v.grp();
    burst(g, t, 0.025, 'highpass', 500, 0.7, 0.6, v.in); thump(g, t, 190, 50, 0.08, 0.5, v.in);
    const s = g.noise('white', t + 0.05, t + 1.5); const bp = g.filt('bandpass', 4800, 0.8); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a);
    crackle(a.gain, t + 0.05, 1.4, (x) => 250 * (1 - x) + 15, [0.05, 0.22], [0.003, 0.02]);
    return 1.6;
  };

  // =============================================================================================================
  // Combat, bodies, impacts (no gore: packaging, cardboard, cable and plastic)
  // =============================================================================================================
  SFX.swing = (v, o, t) => {
    const g = v.grp(), h = !!o.heavy, d = h ? 0.34 : 0.22;
    sweepNoise(g, t, d, h ? 280 : 500, h ? 1300 : 2400, h ? 500 : 900, 1.6, 0.5, v.in, 'white');
    return d + 0.05;
  };
  SFX.hit = (v, o, t) => {
    const g = v.grp(), j = rnd(0.9, 1.1);
    thump(g, t, 100 * j, 55, 0.13, 0.55, v.in);
    burst(g, t, 0.05, 'bandpass', 1200 * j, 1, 0.4, v.in);
    const s = g.noise('white', t, t + 0.1); const bp = g.filt('bandpass', 2600, 1); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a); crackle(a.gain, t, 0.07, 400, [0.1, 0.3], [0.002, 0.008]);
    return 0.3;
  };
  SFX.hit_heavy = (v, o, t) => {
    const g = v.grp(), j = rnd(0.93, 1.07);
    thump(g, t, 75 * j, 38, 0.26, 0.75, v.in);
    burst(g, t, 0.09, 'bandpass', 700, 0.9, 0.45, v.in);
    partials(g, t, 1080 * j, STEEL, 0.06, v.in);
    const s = g.noise('white', t, t + 0.14); const bp = g.filt('bandpass', 1800, 1); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a); crackle(a.gain, t, 0.1, 350, [0.1, 0.35], [0.002, 0.01]);
    return 1.5;
  };
  SFX.stomp = (v, o, t) => {
    const g = v.grp();
    thump(g, t, 62, 32, 0.3, 0.8, v.in);
    burst(g, t, 0.06, 'lowpass', 500, 0.7, 0.5, v.in, 'brown');
    crinkle(g, t + 0.01, 0.25, 1.4, 0.35, v.in);
    return 0.6;
  };
  // Tether cut: the box cutter's slice, the coil snapping loose, its recoil rattle
  SFX.cut = (v, o, t) => {
    const g = v.grp();
    sweepNoise(g, t, 0.07, 3000, 7000, 5000, 1.2, 0.35, v.in, 'white');
    const ta = g.gain(0, v.in); const tw = g.osc('triangle', 1400, t + 0.04, t + 0.22, ta);
    tw.frequency.setValueAtTime(1400, t + 0.04); tw.frequency.exponentialRampToValueAtTime(170, t + 0.15);
    ad(ta.gain, t + 0.04, 0.002, 0.28, 0.14);
    const s = g.noise('white', t + 0.06, t + 0.4); const bp = g.filt('bandpass', 2600, 1.5); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a); crackle(a.gain, t + 0.06, 0.3, (x) => 220 * (1 - x) + 10, [0.05, 0.25], [0.003, 0.015]);
    return 0.5;
  };
  // The packaging loosens with a long exhale (a Tethered cut free)
  SFX.release = (v, o, t) => {
    const g = v.grp(), D = o.dur || 3;
    crinkle(g, t, D * 0.7, 0.7, 0.2, v.in);
    const s = g.noise('pink', t, t + D + 0.05); const bp = g.filt('bandpass', 900, 1.2); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a);
    bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(350, t + D);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.3, t + 0.5); a.gain.exponentialRampToValueAtTime(0.01, t + D);
    return D + 0.1;
  };
  SFX.spray = (v, o, t) => {
    const g = v.grp(), d = o.dur || 0.9;
    burst(g, t, 0.03, 'highpass', 400, 0.7, 0.4, v.in); thump(g, t, 200, 60, 0.03, 0.3, v.in);
    const s = g.noise('white', t, t + d + 0.3); const hp = g.filt('highpass', 1300, 0.7); const pk = g.peak(4800, 1, 6);
    s.connect(hp); hp.connect(pk);
    const a = g.gain(0, v.in); pk.connect(a);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.4, t + 0.03); a.gain.linearRampToValueAtTime(0.3, t + d); a.gain.exponentialRampToValueAtTime(1e-4, t + d + 0.25);
    lfo(g, 13, 0.04, a.gain, t, t + d);
    const b = g.noise('pink', t, t + d + 0.3); const bl = g.filt('lowpass', 1500, 0.7); b.connect(bl);
    const ba = g.gain(0, v.in); bl.connect(ba);
    ba.gain.setValueAtTime(0, t); ba.gain.linearRampToValueAtTime(0.18, t + 0.03); ba.gain.linearRampToValueAtTime(0.12, t + d); ba.gain.exponentialRampToValueAtTime(1e-4, t + d + 0.25);
    return d + 0.35;
  };
  SFX.plastic = (v, o, t) => { const g = v.grp(), d = o.dur || 0.7; crinkle(g, t, d, o.dens || 1, 0.35, v.in); return d + 0.05; };
  SFX.whip = (v, o, t) => {
    const g = v.grp();
    sweepNoise(g, t, 0.16, 800, 4000, 3000, 1.4, 0.3, v.in, 'white');
    burst(g, t + 0.15, 0.006, 'highpass', 2500, 0.7, 0.6, v.in); thump(g, t + 0.15, 300, 150, 0.03, 0.2, v.in);
    return 0.3;
  };
  SFX.grab = (v, o, t) => { SFX.whip(v, o, t); const g = v.grp(); crinkle(g, t + 0.15, 0.5, 1.2, 0.3, v.in); thump(g, t + 0.18, 90, 55, 0.12, 0.4, v.in); return 0.8; };
  // The Borrowed unfolding: dry cracks and a long stretching creak
  SFX.unfold = (v, o, t) => {
    const g = v.grp(), d = o.dur || 1;
    creakSyn(g, t, d, { card: true, amp: 0.35, f: 22 }, v.in);
    for (let i = 0; i < 9; i++) { const tt = t + rnd(0, d); burst(g, tt, 0.005, 'highpass', 1800, 0.7, rnd(0.2, 0.5), v.in); thump(g, tt, 400, 200, 0.02, 0.12, v.in); }
    return d + 0.1;
  };
  // Hurt: body thud, a sharp breath and a short grunt (opts.heavy adds ringing ears)
  SFX.hurt = (v, o, t) => {
    const g = v.grp(), j = rnd(0.92, 1.08);
    thump(g, t, 88 * j, 52, 0.15, 0.5, v.in);
    const s = g.noise('white', t, t + 0.35); const pre = g.gain(1); s.connect(pre);
    const a = g.gain(0, v.in);
    for (const [f, q, m] of [[900, 2, 1], [1500, 3, 0.6]]) { const bp = g.filt('bandpass', f * j, q); pre.connect(bp); bp.connect(g.gain(m, a)); }
    ad(a.gain, t + 0.02, 0.012, 0.3, 0.25);
    const va = g.gain(0, v.in); const f1 = g.filt('bandpass', 650 * j, 3); const f2 = g.filt('bandpass', 1100 * j, 4);
    f1.connect(va); f2.connect(g.gain(0.6, va));
    const gr = g.osc('sawtooth', 145 * j, t + 0.02, t + 0.3); gr.connect(f1); gr.connect(f2);
    gr.frequency.linearRampToValueAtTime(105 * j, t + 0.25);
    ad(va.gain, t + 0.02, 0.02, 0.2, 0.2);
    if (o.heavy) { const r = g.gain(0, v.in); g.osc('sine', 3300, t + 0.05, t + 1.6, r); ad(r.gain, t + 0.05, 0.1, 0.02, 1.4); }
    return o.heavy ? 1.7 : 0.5;
  };
  // Heartbeat: lub-dub (loop:true repeats at opts.bpm or handle.set({bpm}))
  SFX.heartbeat = (v, o, t) => {
    const beat = (tt) => {
      const g = v.grp();
      thump(g, tt, 60, 40, 0.13, 0.7, v.in); burst(g, tt, 0.05, 'lowpass', 150, 0.7, 0.3, v.in, 'brown');
      thump(g, tt + 0.27, 52, 36, 0.11, 0.5, v.in); burst(g, tt + 0.27, 0.04, 'lowpass', 140, 0.7, 0.2, v.in, 'brown');
    };
    if (o.loop) { v.every(t, () => 60 / clamp(v.params.bpm || o.bpm || 72, 30, 200), beat); return Infinity; }
    beat(t); return 0.55;
  };
  SFX.heartbeat.loops = true;
  SFX.thud = (v, o, t) => { const g = v.grp(); thump(g, t, 78, 42, 0.22, 0.5, v.in); burst(g, t, 0.08, 'lowpass', 500, 0.7, 0.35, v.in, 'brown'); return 0.35; };
  // Fists on glass (the Reach): opts.n knocks, opts.hard
  SFX.glass_knock = (v, o, t) => {
    let tt = t;
    for (let i = 0; i < (o.n || 3); i++) {
      const g = v.grp(), a = (o.hard ? 0.6 : 0.4) * rnd(0.75, 1);
      thump(g, tt, 95, 60, 0.09, a, v.in);
      partials(g, tt, 1150 * rnd(0.97, 1.03), GLASS, a * 0.12, v.in);
      burst(g, tt, 0.05, 'bandpass', 2800, 3, a * 0.2, v.in);
      tt += rnd(0.22, 0.34) * (o.hard ? 0.8 : 1);
    }
    return tt - t + 0.3;
  };
  // Fists on a door (Chase's back office)
  SFX.pound = (v, o, t) => {
    let tt = t;
    for (let i = 0; i < (o.n || 4); i++) {
      const g = v.grp(), a = rnd(0.45, 0.7);
      thump(g, tt, 72, 42, 0.2, a, v.in); burst(g, tt, 0.06, 'lowpass', 600, 0.7, a * 0.5, v.in, 'brown');
      latch(g, tt + 0.01, a * 0.25, v.in, 0.8);
      tt += rnd(0.36, 0.52);
    }
    return tt - t + 0.3;
  };
  // Steel bar on concrete: clang, bounce, bounce, scrape
  SFX.bar_concrete = (v, o, t) => {
    const j = rnd(0.97, 1.03);
    const hitAt = (tt, a) => {
      const g = v.grp();
      burst(g, tt, 0.035, 'highpass', 900, 0.7, a * 0.55, v.in);
      thump(g, tt, 120, 60, 0.06, a * 0.4, v.in);
      partials(g, tt, 520 * j, STEEL, a * 0.2, v.in);
    };
    hitAt(t, 1); hitAt(t + 0.31, 0.55); hitAt(t + 0.5, 0.3); hitAt(t + 0.62, 0.15);
    burst(v.grp(), t + 0.7, 0.4, 'bandpass', 2200, 1, 0.05, v.in, 'white', 0.05);
    return 2.4;
  };
  // The Returns Cage's two-handed slam and shockwave
  SFX.slam = (v, o, t) => {
    const g = v.grp();
    thump(g, t, 48, 24, 0.6, 0.9, v.in);
    burst(g, t, 0.12, 'lowpass', 400, 0.7, 0.5, v.in, 'brown');
    crinkle(g, t + 0.02, 0.45, 1.5, 0.3, v.in);
    const r = g.noise('brown', t, t + 1.6); const rl = g.filt('lowpass', 120, 0.7); r.connect(rl);
    const ra = g.gain(0, v.in); rl.connect(ra); ad(ra.gain, t, 0.05, 0.6, 1.4);
    return 1.7;
  };
  SFX.shatter = (v, o, t) => {
    const g = v.grp();
    burst(g, t, 0.05, 'highpass', 2000, 0.7, 0.5, v.in);
    for (let i = 0; i < 14; i++) ping(g, t + Math.pow(Math.random(), 2) * 0.5, rnd(3000, 9000), rnd(0.03, 0.15), rnd(0.02, 0.08), v.in);
    const s = g.noise('white', t, t + 0.5); const hp = g.filt('highpass', 4000, 0.7); s.connect(hp);
    const a = g.gain(0, v.in); hp.connect(a); crackle(a.gain, t, 0.45, (x) => 300 * (1 - x) + 20, [0.05, 0.3], [0.002, 0.01]);
    return 0.7;
  };
  // A phone skittering across a polished floor
  SFX.skitter = (v, o, t) => {
    const g = v.grp();
    let tt = t, gap = 0.2;
    for (let i = 0; i < 7; i++) { const a = 0.35 * (1 - i / 8); burst(g, tt, 0.006, 'bandpass', 2500, 2, a, v.in); ping(g, tt, 1600, 0.02, a * 0.2, v.in); tt += gap; gap *= 0.72; }
    burst(g, t, tt - t + 0.2, 'bandpass', 3000, 0.8, 0.04, v.in, 'white', 0.02);
    return tt - t + 0.3;
  };
  // Roller door rattle (sliding under a half-open roller door)
  SFX.roller = (v, o, t) => {
    const g = v.grp(), d = o.dur || 1.2;
    const s = g.noise('white', t, t + d + 0.05); const bp = g.filt('bandpass', 1100, 3); s.connect(bp);
    const a = g.gain(0, v.in); bp.connect(a); crackle(a.gain, t, d, 60, [0.15, 0.5], [0.01, 0.04]);
    for (let i = 0; i < 6; i++) partials(g, t + rnd(0, d), rnd(600, 800), METAL, 0.03, v.in);
    return d + 0.5;
  };
  // Unread sting: an electric bite and a notification pop
  SFX.sting = (v, o, t) => {
    const g = v.grp(), bp = g.filt('bandpass', 3000, 2), a = g.gain(0, v.in); bp.connect(a);
    g.osc('square', 2400, t, t + 0.07, bp); box(a.gain, t, 0.05, 0.2, 0.002, 0.01);
    thump(g, t, 300, 200, 0.04, 0.2, v.in); ping(g, t + 0.05, 1760, 0.08, 0.08, v.in, 'triangle');
    return 0.2;
  };
  SFX.drip = (v, o, t) => {
    const g = v.grp(), a = g.gain(0, v.in), f = rnd(650, 900);
    const s = g.osc('sine', f, t, t + 0.08, a); s.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.03);
    ad(a.gain, t, 0.001, 0.2, 0.05);
    return 0.1;
  };
  DEF.drip = { verb: 0.6 };
  // Environment one-shots
  SFX.wind_gust = (v, o, t) => {
    const g = v.grp(), d = o.dur || 3.2, p = g.pan(0, v.in);
    const s = g.noise('pink', t, t + d + 0.1); const bp = g.filt('bandpass', 400, 1.2); s.connect(bp);
    const a = g.gain(0, p); bp.connect(a);
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1100, t + d * 0.45); bp.frequency.exponentialRampToValueAtTime(500, t + d);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.5, t + d * 0.45); a.gain.linearRampToValueAtTime(0, t + d);
    const w = g.noise('white', t, t + d + 0.1); const wb = g.filt('bandpass', 1400, 14); w.connect(wb);
    const wa = g.gain(0, p); wb.connect(wa);
    wb.frequency.setValueAtTime(1400, t); wb.frequency.linearRampToValueAtTime(1900, t + d * 0.5); wb.frequency.linearRampToValueAtTime(1500, t + d);
    wa.gain.setValueAtTime(0, t); wa.gain.linearRampToValueAtTime(0.25, t + d * 0.5); wa.gain.linearRampToValueAtTime(0, t + d);
    const dir = Math.random() < 0.5 ? -1 : 1; p.pan.setValueAtTime(-0.6 * dir, t); p.pan.linearRampToValueAtTime(0.6 * dir, t + d);
    return d + 0.1;
  };
  // Fluorescent tube: 100 Hz buzz that stutters (loop:true = a steady buzz with an occasional flicker)
  SFX.tube_flicker = (v, o, t) => {
    const g = v.grp(), loop = !!o.loop, d = o.dur || 1.3, t1 = loop ? undefined : t + d + 0.05;
    const gate = g.gain(0, v.in);
    const bp = g.filt('bandpass', 200, 1.2); bp.connect(g.gain(0.2, gate));
    g.osc('sawtooth', 100, t, t1, bp);
    const hp = g.filt('highpass', 2400, 0.7); hp.connect(g.gain(0.014, gate));
    g.osc('square', 100, t, t1, hp);
    const flick = (g2, t0, dd) => {
      let tt = t0;
      while (tt < t0 + dd) {
        const on = rnd(0.02, 0.12), off = rnd(0.02, 0.15);
        gate.gain.setValueAtTime(rnd(0.5, 1), tt); gate.gain.setValueAtTime(0.02, tt + on);
        burst(g2, tt, 0.003, 'highpass', 3000, 0.7, 0.08, v.in);
        tt += on + off;
      }
      gate.gain.setValueAtTime(1, tt);
      return tt;
    };
    if (loop) {
      gate.gain.setValueAtTime(0.9, t);
      v.every(t + rnd(0.5, 3), () => rnd(2, 9), (tt) => { flick(v.grp(), tt, rnd(0.2, 0.9)); });
      return Infinity;
    }
    const e = flick(g, t, d);
    gate.gain.setValueAtTime(0, e);
    return d + 0.3;
  };
  SFX.tube_flicker.loops = true;
  // Lift groan: strained cables, a low metal moan, creaks, a clunk
  SFX.lift_groan = (v, o, t) => {
    const g = v.grp(), d = o.dur || 3.5;
    const lp = g.filt('lowpass', 320, 0.8); const a = g.gain(0, v.in); lp.connect(a);
    for (const [f, q, m] of [[180, 8, 4], [410, 10, 3]]) { const bp = g.filt('bandpass', f, q); lp.connect(bp); bp.connect(g.gain(m * 0.1, a)); }
    const s = g.osc('sawtooth', 42, t, t + d + 0.1, lp);
    for (let i = 1; i <= 6; i++) s.frequency.linearRampToValueAtTime(rnd(34, 56), t + (d * i) / 6);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.4, t + d * 0.3); a.gain.linearRampToValueAtTime(0.25, t + d * 0.8); a.gain.linearRampToValueAtTime(0, t + d);
    creakSyn(g, t + d * 0.2, d * 0.5, { metal: true, amp: 0.25, f: 24 }, v.in);
    const ca = g.gain(0, v.in); const cs = g.osc('sine', 190, t, t + d, ca); lfo(g, 5, 6, cs.frequency, t, t + d);
    box(ca.gain, t, d, 0.025, 0.4, 0.8);
    thump(g, t + d * 0.92, 110, 55, 0.2, 0.4, v.in); latch(g, t + d * 0.92, 0.15, v.in, 0.6);
    return d + 0.3;
  };

  // =============================================================================================================
  // Footsteps: Snd.footstep(surface, running, {pos, vol, heavy})
  // =============================================================================================================
  // th: heel thump [f0, f1, decay, amp]; n: noise [filter, freq, Q, amp, decay]; grit: grains; wet: slap;
  // clang: metal partials [f, amp, decay]; ring: tile ring; res: hollow board [f, Q, amp]; squeak / creak chance
  const SURF = {
    tile: { th: [120, 70, 0.05, 0.5], n: ['bandpass', 3200, 1.2, 0.5, 0.03], ring: [4100, 0.12, 0.05] },
    carpet: { th: [85, 55, 0.07, 0.45], n: ['lowpass', 900, 0.7, 0.4, 0.08] },
    lino: { th: [105, 65, 0.05, 0.5], n: ['bandpass', 1900, 1, 0.45, 0.04], squeak: 0.12 },
    bitumen: { th: [95, 60, 0.05, 0.45], n: ['bandpass', 2600, 0.8, 0.35, 0.05], grit: 0.4, wet: 0.35 },
    gravel: { th: [80, 55, 0.06, 0.3], n: ['bandpass', 2200, 0.7, 0.25, 0.09], grit: 1 },
    metal: { th: [110, 70, 0.05, 0.4], n: ['bandpass', 2800, 1.5, 0.35, 0.04], clang: [[380, 0.5, 0.3], [905, 0.35, 0.2], [1530, 0.25, 0.14], [2380, 0.15, 0.09]] },
    ladder: { th: [140, 90, 0.04, 0.3], n: ['bandpass', 2400, 2, 0.25, 0.03], clang: [[610, 0.5, 0.35], [1190, 0.35, 0.22], [2080, 0.2, 0.14]] },
    concrete: { th: [100, 62, 0.05, 0.5], n: ['bandpass', 2300, 0.8, 0.45, 0.04], grit: 0.25 },
    wood: { th: [150, 95, 0.09, 0.55], n: ['lowpass', 1600, 0.8, 0.3, 0.05], res: [185, 6, 0.3], creak: 0.1 },
    grass: { th: [70, 50, 0.05, 0.12], n: ['bandpass', 3600, 0.6, 0.35, 0.14], grit: 0.2 },
    vinyl: { th: [105, 65, 0.05, 0.5], n: ['bandpass', 2100, 1.1, 0.45, 0.035], squeak: 0.4 },
  };
  let footAlt = 0;
  function footstep(surface = 'concrete', running = false, o = {}) {
    if (!ok()) return DUMMY;
    o = o || {};
    const sp = SURF[surface] || SURF.concrete, run = !!running, heavy = !!o.heavy;
    const v = new Voice(o.dest || B.fx, { pos: o.pos, vol: (o.vol != null ? o.vol : 1) * (run ? 1.3 : 1) * (heavy ? 1.5 : 1) * 1.3, verb: o.verb != null ? o.verb : 0.06 });
    try {
      const g = v.grp(), t = v.t0 + rnd(0, 0.01), j = rnd(0.92, 1.08) * (heavy ? 0.7 : 1), k = run ? 0.75 : 1, br = run ? 1.18 : 1;
      footAlt ^= 1;
      const side = footAlt ? 1.03 : 0.97, toe = t + (run ? rnd(0.012, 0.022) : rnd(0.028, 0.045));
      if (sp.th) { const [f0, f1, d, a] = sp.th; thump(g, t, f0 * j * side, f1 * j, d * k, a * 0.5, v.in); thump(g, toe, f0 * 1.15 * j, f1 * j, d * 0.7 * k, a * 0.25, v.in); }
      if (sp.n) {
        const [ty, f, q, a, d] = sp.n;
        burst(g, t, d * k, ty, f * br * rnd(0.85, 1.15), q, a * 0.45, v.in);
        burst(g, toe, d * 0.7 * k, ty, f * 1.1 * br * rnd(0.85, 1.15), q, a * 0.3, v.in);
      }
      if (sp.grit) {
        const gd = (surface === 'gravel' ? 0.16 : 0.08) * k * (run ? 1.2 : 1);
        const s = g.noise('white', t, t + gd + 0.05); const bp = g.filt('bandpass', (surface === 'gravel' ? 2800 : 3600) * br, 0.8); s.connect(bp);
        const a = g.gain(0, v.in); bp.connect(a);
        crackle(a.gain, t, gd, (x) => sp.grit * 420 * (1 - x * 0.7) + 20, [0.05, 0.4 * sp.grit + 0.05], [0.001, 0.006]);
      }
      if (sp.wet) burst(g, t, 0.03, 'highpass', 3000, 0.7, sp.wet * 0.2, v.in);
      if (sp.clang) for (const [f, a, d] of sp.clang) ping(g, t, f * rnd(0.97, 1.03) * (heavy ? 0.8 : 1), d * k, a * 0.12 * (run ? 1.2 : 1), v.in);
      if (sp.ring) { const [f, a, d] = sp.ring; ping(g, t, f * rnd(0.95, 1.05), d, a, v.in); }
      if (sp.res) { const [f, q, a] = sp.res; burst(g, t, 0.12 * k, 'bandpass', f * rnd(0.95, 1.05), q, a, v.in); }
      if (sp.squeak && Math.random() < sp.squeak * (run ? 1.5 : 1)) {
        const a = g.gain(0, v.in); const s = g.osc('sine', rnd(1400, 1900), toe + 0.01, toe + 0.1, a);
        s.frequency.linearRampToValueAtTime(rnd(1900, 2600), toe + 0.07); box(a.gain, toe + 0.01, 0.07, 0.025, 0.01, 0.02);
      }
      if (sp.creak && Math.random() < sp.creak) creakSyn(g, t + 0.02, rnd(0.2, 0.35), { amp: 0.12 }, v.in);
      if (run) burst(g, toe + 0.02, 0.05, 'bandpass', 2400, 0.7, 0.05, v.in);
      v.hardEnd = t + 4;
    } catch (e) { console.error('[Snd] footstep', e); v.end(); return DUMMY; }
    v.built = true; v.check();
    return v.handle;
  }

  // =============================================================================================================
  // Wordless voices: formant "speech" that never forms words (muffled, distorted, layered)
  // =============================================================================================================
  const VOW = { a: [760, 1200, 2600], e: [480, 1850, 2550], i: [320, 2200, 2950], o: [500, 880, 2450], u: [350, 760, 2350], '@': [540, 1400, 2500] };
  const vowel = (k) => (VOW[k] ? [VOW[k], VOW[k]] : [VOW[k[0]] || VOW['@'], VOW[k[1]] || VOW['@']]);
  function consonant(g, t, c, amp, dest) {
    if (c === 's' || c === 'f' || c === 'th' || c === 'h') burst(g, t, c === 'h' ? 0.05 : 0.06, c === 'h' ? 'bandpass' : 'highpass', c === 's' ? 4500 : c === 'h' ? 1500 : 2500, 0.8, amp * (c === 's' ? 0.35 : 0.2), dest);
    else if ('tkdgb'.includes(c)) burst(g, t + 0.02, 0.015, 'bandpass', c === 't' || c === 'd' ? 3500 : c === 'b' ? 900 : 2000, 1, amp * 0.4, dest);
  }
  // phr: [[vowel, dur, pitchMul=1, amp=1, consonant]]; returns end time
  function speak(g, t, phr, o, dest) {
    const f0 = o.f0 || 180, st = o.stretch || 1, peak = o.amp || 0.3;
    let total = 0; for (const s of phr) total += s[1] * st;
    const end = t + total + 0.3;
    const src = g.osc(o.wave || 'sawtooth', f0, t, end);
    const pre = g.gain(1); src.connect(pre);
    const nz = g.noise('white', t, end); nz.connect(g.gain(o.breath != null ? o.breath : 0.12, pre));
    const amp = g.gain(0, dest), fg = o.fgain || 2.5;
    const F = [0, 1, 2].map((i) => { const bp = g.filt('bandpass', VOW['@'][i], i ? 9 : 5); pre.connect(bp); bp.connect(g.gain([1, 0.55, 0.28][i] * fg, amp)); return bp; });
    lfo(g, rnd(4.5, 6.2), f0 * (o.vib != null ? o.vib : 0.018), src.frequency, t, end);
    const P = src.frequency, A = amp.gain, fs = o.fshift || 1;
    P.setValueAtTime(f0, t); A.setValueAtTime(0, t);
    let tt = t;
    for (const [vk, d0, p = 1, a = 1, c] of phr) {
      const d = d0 * st, [v1, v2] = vowel(vk);
      if (c) consonant(g, tt, c, peak * a, dest);
      const ts = tt + (c ? 0.03 : 0);
      F.forEach((bp, i) => { bp.frequency.setTargetAtTime(v1[i] * fs, ts, 0.02); if (v1 !== v2) bp.frequency.setTargetAtTime(v2[i] * fs, ts + d * 0.35, d * 0.18); });
      P.setTargetAtTime(f0 * p, ts, 0.04); P.setTargetAtTime(f0 * p * 0.93, ts + d * 0.5, d * 0.4);
      A.setTargetAtTime(peak * a, ts, 0.018); A.setTargetAtTime(peak * a * 0.15, tt + d - 0.035, 0.014);
      tt += d;
    }
    A.setTargetAtTime(0, tt, o.tail || 0.04);
    return tt;
  }
  const PHRASE = {
    // "I only came in to—" (it never finishes)
    tethered: [['ai', 0.24, 1.06, 1], ['o', 0.13, 1.02, 0.9], ['i', 0.12, 0.98, 0.8], ['ei', 0.22, 1.04, 1, 'k'], ['i', 0.13, 0.96, 0.85], ['u', 0.13, 0.9, 0.7, 't']],
    name: [['ai', 0.2, 1.25, 1], ['o', 0.22, 1.35, 1], ['o', 0.18, 1.2, 0.9], ['ei', 0.4, 1.0, 1]],
    waiting: [['u', 0.12, 1.2, 0.9, 'd'], ['u', 0.12, 1.25, 0.9], ['o', 0.2, 1.35, 1], ['au', 0.22, 1.4, 1, 'h'], ['o', 0.24, 1.3, 1], ['ai', 0.14, 1.2, 0.9], ['i', 0.12, 1.15, 0.9, 'b'], ['ei', 0.2, 1.25, 1], ['i', 0.3, 1.45, 1, 't']],
    someone: [['e', 0.14, 1.3, 1, 'g'], ['i', 0.12, 1.25, 0.9], ['a', 0.16, 1.3, 1, 's'], ['a', 0.14, 1.2, 0.9], ['u', 0.14, 1.25, 0.9, 'h'], ['o', 0.2, 1.35, 1], ['o', 0.12, 1.2, 0.9], ['ei', 0.14, 1.2, 0.9, 't'], ['u', 0.14, 1.3, 1, 'd'], ['i', 0.26, 1.1, 0.9]],
    three: [['i', 0.3, 1.3, 1, 'th'], ['ai', 0.3, 1.2, 1, 't'], ['ai', 0.14, 1.15, 0.9], ['a', 0.2, 1.3, 1], ['i', 0.24, 1.35, 1, 'th'], ['ai', 0.36, 1.2, 1, 't']],
    hospital: [['i', 0.12, 1.2, 0.9, 's'], ['i', 0.12, 1.25, 0.9], ['o', 0.26, 1.45, 1, 'h'], ['i', 0.12, 1.3, 0.9, 'p'], ['@', 0.16, 1.2, 0.9, 't'], ['i', 0.12, 1.2, 0.9, 'd'], ['u', 0.12, 1.25, 0.9], ['o', 0.3, 1.4, 1, 'n']],
    come: [['a', 0.22, 1.3, 1, 'k'], ['a', 0.18, 1.25, 1, 'b'], ['i', 0.34, 1.45, 1, 'h']],
    fine: [['i', 0.12, 1, 0.9], ['@', 0.1, 0.95, 0.8], ['i', 0.14, 1.1, 0.9, 'b'], ['ai', 0.34, 1.25, 1, 'f']],
  };
  const REACH_LINES = ['name', 'waiting', 'someone'];
  SFX.murmur_tethered = (v, o, t) => {
    const g = v.grp(), muf = g.filt('lowpass', 680, 1.2, v.in), shell = g.peak(1250, 3, 6, muf);
    const reps = o.dur ? Math.max(1, Math.round(o.dur / 2.2)) : 1;
    let tt = t;
    for (let i = 0; i < reps; i++) {
      const phr = i === reps - 1 || Math.random() < 0.5 ? PHRASE.tethered : PHRASE.tethered.slice(0, irnd(2, 4));
      const e = speak(g, tt, phr, { f0: 205 * rnd(0.95, 1.05), amp: 0.5, breath: 0.25, tail: 0.008, stretch: rnd(0.95, 1.15) }, shell);
      crinkle(g, tt, e - tt, 0.4, 0.08, v.in);
      tt = e + rnd(0.6, 1.2);
    }
    return tt - t + 0.2;
  };
  function shouting(v, o, t, lineKeys, layers, post) {
    const g = v.grp(), dur = o.dur || 0;
    let tt = t;
    do {
      const key = o.line && PHRASE[o.line] ? o.line : typeof o.line === 'number' ? lineKeys[o.line % lineKeys.length] : lineKeys[irnd(0, lineKeys.length - 1)];
      let e = tt;
      layers.forEach(([f0, amp], i) => { e = Math.max(e, speak(g, tt + i * rnd(0.01, 0.05), PHRASE[key], { f0: f0 * rnd(0.95, 1.06), amp, breath: 0.3, fgain: 3, stretch: rnd(0.95, 1.1), vib: 0.03 }, post)); });
      tt = e + rnd(0.35, 0.8);
    } while (tt - t < dur);
    return tt - t;
  }
  // The Reach: layered, distorted shouting through a phone-speaker grille (opts.line: 'name'|'waiting'|'someone'|
  // 'three'|'hospital'|'come' or index; opts.dur repeats lines until that long)
  SFX.murmur_reach = (v, o, t) => {
    const g = v.grp(), ws = g.shaper(CV.dist), bp = g.filt('bandpass', 1500, 0.7), pk = g.peak(2600, 1.5, 5, v.in);
    ws.connect(bp); bp.connect(pk);
    const pre = g.gain(0.9, ws);
    return shouting(v, o, t, REACH_LINES, [[150, 0.5], [188, 0.4], [122, 0.4]], pre) + 0.3;
  };
  // The Closer: "It'll be fine!" three times, a layered shriek that rises
  SFX.murmur_closer = (v, o, t) => {
    const g = v.grp(), rm = g.gain(0.6), ws = g.shaper(CV.dist), hp = g.filt('highpass', 300, 0.7, v.in);
    rm.connect(ws); ws.connect(hp);
    let tt = t;
    const end = t + 3.6;
    lfo(g, 70, 0.5, rm.gain, t, end);
    for (let r = 0; r < 3; r++) {
      const k = 1 + r * 0.18;
      let e = tt;
      for (const f0 of [300, 380, 460, 610]) e = Math.max(e, speak(g, tt + rnd(0, 0.03), PHRASE.fine, { f0: f0 * k * rnd(0.97, 1.03), amp: 0.22 * k, breath: 0.35, fgain: 3, stretch: r === 2 ? 1.25 : 1, vib: 0.04 }, rm));
      tt = e + (r < 2 ? 0.18 : 0);
    }
    return tt - t + 0.3;
  };
  // Murmuring crowd (opts.dur, opts.n voices)
  SFX.murmur_crowd = (v, o, t) => {
    const g = v.grp(), dur = o.dur || 4, lp = g.filt('lowpass', 1700, 0.7, v.in), keys = Object.keys(VOW).concat(['ai', 'ei', 'au']);
    for (let n = 0; n < (o.n || 8); n++) {
      let tt = t + rnd(0, 1);
      const f0 = rnd(95, 230);
      while (tt < t + dur) {
        const phr = []; for (let k = irnd(3, 8); k > 0; k--) phr.push([keys[irnd(0, keys.length - 1)], rnd(0.1, 0.24), rnd(0.9, 1.15), rnd(0.6, 1)]);
        tt = speak(g, tt, phr, { f0, amp: 0.07, breath: 0.2 }, lp) + rnd(0.3, 1.2);
      }
    }
    return dur + 1.5;
  };
  DEF.murmur_crowd = { verb: 0.5 };
  // Cheering, whoops and clapping (the Yes ending)
  SFX.murmur_cheer = (v, o, t) => {
    const g = v.grp(), dur = o.dur || 5;
    for (let n = 0; n < (o.n || 7); n++) {
      let tt = t + rnd(0, 0.6);
      const f0 = rnd(150, 300);
      while (tt < t + dur - 0.5) tt = speak(g, tt, [['e', 0.15, 1.2, 0.8], ['ei', rnd(0.4, 0.7), 1.6, 1]], { f0, amp: 0.1, breath: 0.3 }, v.in) + rnd(0.4, 1.4);
    }
    for (let w = 0; w < 3; w++) { const tt = t + rnd(0.3, dur - 1), a = g.gain(0, v.in); const s = g.osc('sine', 900, tt, tt + 0.7, a); s.frequency.linearRampToValueAtTime(2200, tt + 0.3); s.frequency.linearRampToValueAtTime(1400, tt + 0.6); box(a.gain, tt, 0.6, 0.06, 0.05, 0.1); }
    for (let c = 0; c < 6; c++) { let tt = t + rnd(0, 0.3); while (tt < t + dur) { burst(g, tt, 0.02, 'bandpass', rnd(1100, 1800), 0.9, rnd(0.06, 0.14), v.in); tt += rnd(0.12, 0.2); } }
    return dur + 0.5;
  };
  DEF.murmur_cheer = { verb: 0.35 };

  // =============================================================================================================
  // Threat loops (Snd.loop): each keeps scheduling itself until stopped; intensity via handle.set({intensity})
  // =============================================================================================================
  const I = (v) => (v.params.intensity != null ? v.params.intensity : 0.5);
  function playOn(dest, name, o, parent) {
    const h = play(name, { ...o, dest });
    if (parent) { parent.children = parent.children.filter((c) => c.playing); parent.children.push(h); }
    return h;
  }
  const at = (tt) => Math.max(0, tt - ctx.currentTime - 0.01);
  SFX.tethered_crinkle = (v, o, t) => {
    v.every(t, () => rnd(0.35, 1.5) / (0.6 + I(v)), (tt) => { crinkle(v.grp(), tt, rnd(0.15, 0.6), 0.6 + I(v), 0.3, v.in); });
    if (o.voice !== false) v.every(t + rnd(2, 6), () => rnd(7, 14), (tt) => { playOn(v.in, 'murmur_tethered', { delay: at(tt), vol: 0.7 }, v); });
    return Infinity;
  };
  SFX.tethered_crinkle.loops = true;
  SFX.standard_keys = (v, o, t) => {
    v.every(t, () => rnd(0.86, 0.98), (tt) => { const g = v.grp(); jingle(g, tt, irnd(5, 8), 0.22, v.in, 0.06); thump(g, tt, 70, 45, 0.08, 0.06, v.in); });
    v.every(t + rnd(5, 9), () => rnd(8, 15), (tt) => { playOn(v.in, 'penclick', { delay: at(tt), vol: 0.6 }, v); });
    return Infinity;
  };
  SFX.standard_keys.loops = true;
  SFX.unread_buzz = (v, o, t) => {
    for (let k = 0; k < 4; k++) {
      const f = rnd(150, 200), pn = rnd(-0.6, 0.6);
      v.every(t + rnd(0, 1.5), () => rnd(0.9, 2.8) / (0.6 + I(v)), (tt) => {
        const g = v.grp(), p = g.pan(pn, v.in);
        buzzPulse(g, tt, f, rnd(0.25, 0.45), 0.07, p);
        if (Math.random() < 0.5) buzzPulse(g, tt + 0.6, f, rnd(0.25, 0.45), 0.07, p);
      });
    }
    v.every(t + rnd(3, 6), () => rnd(5, 12), (tt) => { playOn(v.in, 'msgchime', { delay: at(tt), vol: 0.3 }, v); });
    return Infinity;
  };
  SFX.unread_buzz.loops = true;
  // The Smiles hum the hold music to themselves, slightly out of tune
  function humNote(g, t, f, d, dest) {
    const lp = g.filt('lowpass', 520, 1); const nas = g.filt('bandpass', 270, 2.5); lp.connect(nas);
    const a = g.gain(0, dest); nas.connect(a); lp.connect(g.gain(0.3, a));
    const o1 = g.osc('sawtooth', f, t, t + d + 0.12, lp), o2 = g.osc('triangle', f * 1.004, t, t + d + 0.12, lp);
    lfo(g, 5.2, f * 0.015, o1.frequency, t, t + d + 0.12); lfo(g, 5.0, f * 0.015, o2.frequency, t, t + d + 0.12);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.5, t + 0.05); a.gain.setValueAtTime(0.5, t + d); a.gain.linearRampToValueAtTime(0, t + d + 0.1);
  }
  SFX.smile_hum = (v, o, t) => {
    const beat = 60 / 84;
    v.every(t, 4 * beat, (tb, i) => {
      const g = v.grp();
      let bt = 0;
      for (const [m, d] of HOLD_MEL[i % 8]) { if (m) humNote(g, tb + bt * beat, mtof(m - 12) * 0.985, d * beat * 0.95, v.in); bt += d; }
    });
    return Infinity;
  };
  SFX.smile_hum.loops = true;

  // =============================================================================================================
  // Ambient beds (Snd.ambient) — each builds continuous layers on a Voice plus random events via tasks
  // =============================================================================================================
  const BEDS = {};
  function windBed(v, t, heavy) {
    const g = v.grp(), out = g.gain(heavy ? 1.3 : 1, v.in);
    const bands = [-0.7, 0.7].map((pn) => {
      const s = g.noise('pink', t); const bp = g.filt('bandpass', heavy ? 560 : 430, 0.8); s.connect(bp);
      const a = g.gain(0.1); bp.connect(a); a.connect(g.pan(pn, out));
      return { bp, a };
    });
    const rum = g.noise('brown', t); const rl = g.filt('lowpass', heavy ? 200 : 150, 0.7); rum.connect(rl);
    const ra = g.gain(heavy ? 0.4 : 0.26, out); rl.connect(ra);
    const wh = g.noise('white', t); const wb = g.filt('bandpass', 1300, heavy ? 22 : 16); wh.connect(wb);
    const wa = g.gain(0, out); wb.connect(wa);
    v.every(t, () => rnd(2.5, heavy ? 6 : 8), (tt) => {
      const k = Math.pow(Math.random(), 0.8) * (heavy ? 1.3 : 1), d = rnd(1.8, 4.5);
      for (const b of bands) { b.a.gain.setTargetAtTime(0.05 + 0.15 * k * rnd(0.8, 1.2), tt, d / 3); b.bp.frequency.setTargetAtTime((heavy ? 480 : 360) + 520 * k * rnd(0.7, 1.3), tt, d / 3); }
      wa.gain.setTargetAtTime(k > 0.6 ? (heavy ? 0.06 : 0.03) * (k - 0.45) : 0, tt, d / 2.5);
      wb.frequency.setTargetAtTime(1100 + 900 * k, tt, d / 2);
      ra.gain.setTargetAtTime((heavy ? 0.32 : 0.2) + 0.15 * k, tt, d / 3);
    });
    if (heavy) {
      v.every(t + rnd(4, 10), () => rnd(6, 14), (tt) => { playOn(v.in, 'wind_gust', { vol: rnd(0.3, 0.6), pan: rnd(-0.8, 0.8), delay: at(tt) }, v); });
      // the mast's cables and fences singing in the wind
      v.every(t + rnd(3, 8), () => rnd(5, 12), (tt) => { const gg = v.grp(); partials(gg, tt, rnd(300, 700), METAL, 0.02, v.in); crinkle(gg, tt, 0.4, 0.3, 0.05, v.in); });
    }
  }
  BEDS.wind = (v, t) => windBed(v, t, false);
  BEDS.wind_heavy = (v, t) => windBed(v, t, true);
  function drone(g, t, dest, list, lpf, amp) {
    const lp = g.filt('lowpass', lpf, 0.7, dest), dg = g.gain(amp, lp);
    for (const [f, ty, a] of list) g.osc(ty, f, t, undefined, g.gain(a, dg));
    lfo(g, rnd(0.05, 0.08), amp * 0.4, dg.gain, t);
    return dg;
  }
  function roomTone(g, t, dest, lpf, amp, kind = 'brown') { const s = g.noise(kind, t); const l = g.filt('lowpass', lpf, 0.7); s.connect(l); l.connect(g.gain(amp, dest)); }
  function hvac(g, t, dest, amp) { roomTone(g, t, dest, 700, amp, 'pink'); g.osc('sine', 120, t, undefined, g.gain(amp * 0.12, dest)); }
  function fluoro(g, t, dest, amp) {
    const bp = g.filt('bandpass', 3000, 1); bp.connect(g.gain(amp * 0.06, dest)); g.osc('sawtooth', 100, t, undefined, bp);
    g.osc('sine', 100, t, undefined, g.gain(amp * 0.4, dest));
  }
  BEDS.interior = (v, t) => {
    const g = v.grp();
    drone(g, t, v.in, [[55, 'triangle', 0.6], [55.4, 'triangle', 0.6], [82.6, 'sine', 0.4], [110.7, 'sine', 0.2]], 240, 0.08);
    roomTone(g, t, v.in, 260, 0.06);
    v.every(t + rnd(4, 10), () => rnd(7, 20), (tt) => { playOn(v.in, 'creak', { metal: true, far: true, vol: rnd(0.25, 0.45), pan: rnd(-0.9, 0.9), dur: rnd(0.6, 1.6), delay: at(tt) }, v); });
    v.every(t + rnd(8, 20), () => rnd(15, 40), (tt) => { playOn(v.in, 'thud', { far: true, vol: rnd(0.08, 0.16), pan: rnd(-1, 1), delay: at(tt) }, v); });
  };
  // The exchange: mains hum, buzzing relays, stepping switches clattering in the dark
  BEDS.hum = (v, t) => {
    const g = v.grp();
    g.osc(PW.hum, 100, t, undefined, g.gain(0.035, v.in));
    g.osc('sine', 100.35, t, undefined, g.gain(0.02, v.in));
    g.osc('sine', 50, t, undefined, g.gain(0.03, v.in));
    const bp = g.filt('bandpass', 1800, 1.5); bp.connect(g.gain(0.008, v.in)); g.osc('sawtooth', 100, t, undefined, bp);
    roomTone(g, t, v.in, 200, 0.04);
    v.every(t + 1, () => rnd(1.2, 6), (tt) => {
      const gg = v.grp(), pn = gg.pan(rnd(-0.9, 0.9), v.in), a = rnd(0.05, 0.14);
      if (Math.random() < 0.35) { const n = irnd(4, 10); for (let i = 0; i < n; i++) { burst(gg, tt + i * 0.1, 0.004, 'bandpass', 2400, 3, a, pn); ping(gg, tt + i * 0.1, 900, 0.01, a * 0.3, pn); } }
      else { latch(gg, tt, a, pn, rnd(0.7, 1)); }
    });
    v.every(t + rnd(10, 20), () => rnd(15, 35), (tt) => { playOn(v.in, 'creak', { metal: true, far: true, vol: 0.3, pan: rnd(-0.9, 0.9), delay: at(tt) }, v); });
  };
  BEDS.office = (v, t) => {
    const g = v.grp();
    hvac(g, t, v.in, 0.07); fluoro(g, t, v.in, 0.025);
    v.every(t + rnd(6, 14), () => rnd(10, 30), (tt) => { playOn(v.in, Math.random() < 0.5 ? 'creak' : 'thud', { far: true, vol: rnd(0.1, 0.25), pan: rnd(-1, 1), delay: at(tt) }, v); });
    v.every(t + rnd(30, 60), () => rnd(45, 90), (tt) => { playOn(v.in, 'ring', { n: 1, far: true, lp: 900, vol: 0.08, pan: rnd(-1, 1), delay: at(tt) }, v); });
  };
  BEDS.hospital = (v, t) => {
    const g = v.grp();
    hvac(g, t, v.in, 0.075); fluoro(g, t, v.in, 0.03);
    // a monitor beeping somewhere down the corridor, drifting in and out
    const mon = g.gain(0, v.in); const mp = g.pan(rnd(-0.6, 0.6), mon);
    v.every(t + 1, 1.1, (tt) => { const gg = v.grp(); ping(gg, tt, 880, 0.09, 0.03, mp, 'sine', 0.005); });
    v.every(t, () => rnd(8, 20), (tt) => { mon.gain.setTargetAtTime(Math.random() < 0.6 ? rnd(0.3, 1) : 0, tt, 1.5); });
    v.every(t + rnd(40, 80), () => rnd(60, 120), (tt) => { playOn(v.in, 'pa_ding', { far: true, vol: 0.2, delay: at(tt) }, v); });
    v.every(t + rnd(10, 25), () => rnd(18, 40), (tt) => { playOn(v.in, 'door_close', { far: true, vol: 0.15, pan: rnd(-1, 1), delay: at(tt) }, v); });
  };
  BEDS.garage = (v, t) => {
    const g = v.grp();
    roomTone(g, t, v.in, 120, 0.09);
    const w = g.noise('pink', t); const wb = g.filt('bandpass', 700, 3); w.connect(wb); const wa = g.gain(0.03, v.in); wb.connect(wa);
    lfo(g, 0.09, 0.02, wa.gain, t);
    v.every(t + rnd(0.5, 2), () => rnd(1, 4), (tt) => { const n = Math.random() < 0.3 ? 2 : 1; for (let i = 0; i < n; i++) playOn(v.in, 'drip', { vol: rnd(0.2, 0.45), pan: rnd(-0.9, 0.9), delay: at(tt + i * rnd(0.3, 0.6)) }, v); });
    v.every(t + rnd(6, 15), () => rnd(10, 25), (tt) => { const gg = v.grp(); ping(gg, tt, rnd(2500, 4200), 0.04, 0.05, v.in); });
  };
  // CONTRACT+: 'store' — the Smile store (Ch 7): bright fluorescent hum and in-store music far off
  BEDS.store = (v, t) => {
    const g = v.grp();
    hvac(g, t, v.in, 0.05); fluoro(g, t, v.in, 0.05);
    v.children.push(playOn(v.in, 'hold', { lp: 1800, verb: 0.6, vol: 0.07, delay: 0.3 }));
  };
  // The Outage: no music — a slow industrial pulse of receipt-printer steps, phones ringing one room away,
  // EFTPOS approvals somewhere, and the hold music at half speed, far off.
  function stepHit(g, t, amp, dest, heavy) {
    const bp = g.filt('bandpass', heavy ? 900 : 1300, 1.5); const a = g.gain(0, dest); bp.connect(a);
    g.osc('sawtooth', heavy ? 140 : 190, t, t + 0.1, bp);
    box(a.gain, t, heavy ? 0.075 : 0.05, amp, 0.003, 0.01);
    burst(g, t, 0.02, 'bandpass', 3200, 1.5, amp * 0.5, dest);
  }
  BEDS.outage = (v, t) => {
    const g = v.grp();
    const dl = g.filt('lowpass', 150, 0.9, v.in), dg = g.gain(0.12, dl);
    g.osc('sawtooth', 36.7, t, undefined, dg); g.osc('sawtooth', 36.95, t, undefined, dg);
    lfo(g, 0.05, 45, dl.frequency, t);
    g.osc(PW.hum, 100, t, undefined, g.gain(0.01, v.in));
    const pulse = g.gain(1); const plp = g.filt('lowpass', 2400, 0.7, v.in); pulse.connect(plp);
    pulse.connect(g.gain(0.35, B.verbIn));
    v.every(t + 0.5, 1.25, (tt, i) => {
      const gg = v.grp();
      stepHit(gg, tt, 0.12, pulse); stepHit(gg, tt + 0.16, 0.17, pulse, true);
      thump(gg, tt + 0.16, 52, 34, 0.18, 0.24, pulse);
      if (i % 4 === 3) for (let s = 0; s < 8; s++) stepHit(gg, tt + 0.5 + s * 0.07, 0.05, pulse);
    });
    v.children.push(playOn(v.in, 'hold', { speed: 0.5, lp: 900, verb: 0.9, vol: 0.14, pan: rnd(-0.4, 0.4), delay: 0.5 }));
    v.every(t + rnd(3, 8), () => rnd(10, 24), (tt) => { playOn(v.in, 'ring', { n: irnd(1, 3), lp: 1000, verb: 0.8, vol: rnd(0.12, 0.2), pan: rnd(-0.9, 0.9), delay: at(tt) }, v); });
    v.every(t + rnd(2, 5), () => rnd(5, 13), (tt) => { playOn(v.in, 'eftpos', { lp: 3000, verb: 0.7, vol: rnd(0.08, 0.15), pan: rnd(-1, 1), delay: at(tt) }, v); });
    v.every(t + rnd(10, 20), () => rnd(14, 30), (tt) => { playOn(v.in, 'printer', { lines: irnd(6, 16), tear: Math.random() < 0.4, lp: 1800, verb: 0.7, vol: 0.18, pan: rnd(-1, 1), delay: at(tt) }, v); });
  };
  function startBed(name, fade, dest) {
    const v = new Voice(dest || B.amb, { baseVol: BED_LEVEL[name] || 1, vol: BED_LEVEL[name] || 1 });
    v.bedName = name;
    const now = ctx.currentTime;
    v.in.gain.setValueAtTime(0, now); v.in.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
    BEDS[name](v, v.t0);
    v.built = true;
    return v;
  }

  // =============================================================================================================
  // Music: a synthesised felt piano (sine + decaying harmonics, soft attack, lowpass, hall reverb)
  // =============================================================================================================
  function pianoNote(g, t, midi, dur, vel, dest) {
    const f = mtof(midi), hi = clamp((midi - 40) / 50);
    const out = g.gain(0, dest);
    const bright = Math.min(15000, f * (5 + vel * 6));
    const lp = g.filt('lowpass', bright, 0.4, out);
    const end = t + dur + 1.0;
    g.osc(PW.piano, f * 0.9994, t, end, lp); g.osc(PW.piano, f * 1.0008, t, end, lp);
    const body = g.gain(0, out); g.osc('sine', f, t, end, body);
    const atk = 0.008 + (1 - vel) * 0.014, tail = 5 - hi * 3.2, peak = vel * 0.22;
    const A = out.gain;
    A.setValueAtTime(0, t); A.linearRampToValueAtTime(peak, t + atk);
    A.setTargetAtTime(peak * 0.45, t + atk, 0.18); A.setTargetAtTime(1e-4, t + atk + 0.5, tail / 3);
    A.setTargetAtTime(0, t + dur, 0.14); // felt damper
    const Bd = body.gain;
    Bd.setValueAtTime(0, t); Bd.linearRampToValueAtTime(vel * 0.1, t + atk * 2); Bd.setTargetAtTime(1e-4, t + atk * 2, tail / 2.5); Bd.setTargetAtTime(0, t + dur, 0.16);
    lp.frequency.setValueAtTime(bright, t); lp.frequency.setTargetAtTime(Math.min(8000, f * 1.8 + 200), t + atk, 0.4);
    const n = g.noise('pink', t, t + 0.06); const nl = g.filt('lowpass', 300 + f * 0.5, 0.7); n.connect(nl);
    const na = g.gain(0, dest); nl.connect(na); ad(na.gain, t, 0.002, vel * 0.05, 0.03);
  }
  // [t (s), midi, dur (s), velocity]
  const TOM_A = [
    [0, 45, 5.2, 0.34], [0.02, 52, 5.0, 0.28], [0.05, 60, 4.8, 0.22],
    [0.1, 76, 1.3, 0.52], [1.3, 74, 1.3, 0.48],
    [2.5, 41, 5.5, 0.32], [2.53, 48, 5.3, 0.26], [2.56, 57, 5.2, 0.2],
    [2.55, 72, 1.3, 0.45], [3.8, 71, 4.2, 0.4],        // …B4, left hanging over F: it never resolves
  ];
  const TOM_B = [
    [0, 38, 3.6, 0.3], [0.03, 45, 3.5, 0.24], [0.06, 53, 3.4, 0.2],
    [0.1, 76, 1.2, 0.46], [1.3, 74, 1.2, 0.44],
    [2.4, 40, 3.8, 0.3], [2.43, 47, 3.6, 0.24], [2.46, 56, 3.5, 0.2],
    [2.45, 72, 1.2, 0.42], [3.65, 71, 1.2, 0.4], [4.85, 68, 1.25, 0.38],
    [6.1, 45, 7, 0.32], [6.13, 52, 7, 0.26], [6.16, 60, 7, 0.22], [6.2, 69, 7, 0.42],   // home, at last
    [8.6, 76, 5, 0.2],
  ];
  const NAN_A = [
    [0, 43, 4.2, 0.3], [0.04, 50, 4.0, 0.24], [0.08, 59, 3.9, 0.2],
    [0.1, 71, 1.5, 0.42], [1.6, 74, 0.5, 0.36], [2.1, 79, 1.0, 0.42], [3.1, 78, 1.0, 0.36],
    [4.1, 40, 4.0, 0.28], [4.14, 47, 3.9, 0.22], [4.18, 55, 3.8, 0.18],
    [4.2, 76, 1.5, 0.4], [5.7, 74, 0.5, 0.34], [6.2, 71, 1.9, 0.36],
    [8.2, 48, 2.0, 0.28], [8.24, 55, 2.0, 0.22], [8.28, 64, 1.9, 0.18],
    [8.3, 72, 1.0, 0.38], [9.3, 76, 1.0, 0.36],
    [10.3, 48, 2.1, 0.28], [10.34, 55, 2.0, 0.22], [10.38, 63, 2.0, 0.2],
    [10.4, 75, 1.5, 0.38],                                  // E flat: the one sad note
    [11.9, 74, 0.5, 0.32],
    [12.4, 43, 5.5, 0.3], [12.44, 50, 5.4, 0.24], [12.48, 59, 5.3, 0.2], [12.5, 67, 5.2, 0.3], [12.55, 71, 5.1, 0.34],
  ];
  const NAN_B = [
    [0, 48, 2, 0.28], [0.04, 55, 2, 0.22], [0.08, 64, 2, 0.18], [0.1, 74, 1, 0.38], [1.1, 76, 1, 0.36], [2.1, 79, 2, 0.4],
    [4.1, 50, 4, 0.28], [4.14, 57, 3.9, 0.22], [4.18, 66, 3.8, 0.18], [4.2, 78, 1, 0.38], [5.2, 76, 1, 0.34], [6.2, 74, 2, 0.36],
    [8.2, 40, 2, 0.28], [8.24, 47, 2, 0.22], [8.28, 55, 2, 0.18], [8.3, 71, 1, 0.36], [9.3, 72, 1, 0.34],
    [10.3, 48, 2, 0.28], [10.34, 55, 2, 0.22], [10.38, 64, 2, 0.18], [10.4, 76, 2, 0.38],
    [12.4, 50, 3.6, 0.28], [12.44, 57, 3.5, 0.22], [12.48, 60, 3.5, 0.18], [12.52, 66, 3.4, 0.18],
    [12.5, 74, 1.5, 0.36], [14.0, 72, 0.5, 0.3], [14.5, 71, 1, 0.32], [15.5, 69, 1, 0.3],
    [16.5, 43, 9, 0.32], [16.54, 50, 9, 0.26], [16.58, 59, 9, 0.22], [16.62, 67, 9, 0.24], [16.6, 74, 9, 0.3], [16.65, 71, 9, 0.32],
    [20.5, 79, 6, 0.18],
  ];
  function playNotes(v, t, list, dest, off = 0, human = true) {
    const g = v.grp();
    for (const [nt, m, d, vel] of list) pianoNote(g, t + off + nt + (human ? rnd(-0.015, 0.02) : 0), m, d, clamp(vel + (human ? rnd(-0.03, 0.03) : 0), 0.05, 1), dest);
  }
  const MUSIC = {
    // Aidan: four descending notes that never resolve (clipped: cut off after the second; full: the flashback)
    tomorrow(v, o, t) {
      const cut = v.mixer(1);
      if (o.clipped) {
        playNotes(v, t, TOM_A.filter((n) => n[0] < 2.6).map(([a, m, d, vel]) => [a, m, Math.min(d, 2.62 - a), vel]), cut);
        cut.gain.setValueAtTime(1, t + 2.62); cut.gain.linearRampToValueAtTime(0, t + 2.7);
        return 2.8;
      }
      playNotes(v, t, TOM_A, cut);
      if (o.full) { playNotes(v, t, TOM_B, cut, 6.0); return 20; }
      if (o.loop) { v.every(t + 9, 9, (tt) => playNotes(v, tt, TOM_A, cut)); return Infinity; }
      return 8.5;
    },
    // Nan: slow, warm, major, with one sad note (full = the long version for the Connected ending)
    nan(v, o, t) {
      const mix = v.mixer(1);
      playNotes(v, t, NAN_A, mix);
      if (o.full) { playNotes(v, t, NAN_B, mix, 18); return 45; }
      if (o.loop) { v.every(t + 18.5, 18.5, (tt) => playNotes(v, tt, NAN_A, mix)); return Infinity; }
      return 18.5;
    },
    // The Line (Wai): two notes a fifth apart, repeating like a dial tone
    line(v, o, t) {
      const per = 1.7, n = o.loop ? Infinity : o.full ? 12 : 8;
      v.every(t, per, (tt, i) => {
        const g = v.grp();
        pianoNote(g, tt, 62, 0.9, 0.34, v.in); pianoNote(g, tt + per / 2, 69, 0.9, 0.3, v.in);
        if (i % 4 === 0) pianoNote(g, tt, 50, per * 3.5, 0.18, v.in);
      }, { n });
      return isFinite(n) ? n * per + 3 : Infinity;
    },
  };

  // ---- loudness calibration (measured with Snd.render: typical sfx peak 0.25–0.5, UI ~0.1, beds RMS ~0.03–0.08) ----
  const LEVEL = {
    ui_move: 2.4, ui_confirm: 2.4, ui_cancel: 1.8, paper: 1.6, whoosh: 2, pickup: 4, scribble: 1.3,
    disconnected: 0.6, dialtone: 0.6, alarm_tone: 0.65, smile_hum: 0.22, lift_groan: 0.6, spray: 0.7,
    murmur_reach: 0.65, murmur_closer: 0.62, murmur_tethered: 0.6, rotary_click: 6, click: 4, torch: 4, keypress: 4,
    clock_tick: 4, penclick: 1.3, handle: 2, door_locked: 1.8, clunk: 2.2, plug: 2.5, hazard: 1.6, drip: 2, roller: 2.5,
    sting: 2, skitter: 1.8, battery: 1.5, pins: 1.8, keys: 1.3, msgchime: 1.8, sigh: 2.5, wind_gust: 3, modem_boot: 1.8,
    turnstile: 1.5, stamp: 2, hurt: 2.2, swing: 1.5, hit: 2, thud: 1.8, release: 1.5, cut: 1.5, unfold: 0.7, creak: 0.7,
    door_close: 0.8, eftpos: 0.8, ring: 1.4, breath: 0.7, beep: 0.8, pa_ding: 0.7, dialup: 1.3, printer: 1.5, slam: 1.3,
    standard_keys: 1.5,
  };
  for (const k in LEVEL) { DEF[k] = DEF[k] || {}; DEF[k].vol = (DEF[k].vol != null ? DEF[k].vol : 1) * LEVEL[k]; }
  const BED_LEVEL = { office: 2, hospital: 2, garage: 2, hum: 1.4, store: 1.8 };

  // =============================================================================================================
  // Public API
  // =============================================================================================================
  function busFor(name, o, d) {
    const b = o.bus || d.bus || (UI_ISH.has(name) && worldDimmed() ? 'ui' : 'fx');
    return b === 'ui' ? B.ui : b === 'amb' ? B.amb : b === 'music' ? B.music : B.fx;
  }
  // Snd.play(name, {vol, pos, rate, loop, delay, pan, lp, hp, verb, phone, far, bus, …sound-specific}) → handle
  function play(name, o) {
    if (!ok()) return DUMMY;
    const fn = SFX[name];
    if (!fn) { if (!warned.has(name)) { warned.add(name); console.warn('[Snd] unknown sound: ' + name); } return DUMMY; }
    o = o || {};
    const d = DEF[name] || {};
    const oo = { ...d, ...o, vol: (d.vol != null ? d.vol : 1) * (o.vol != null ? o.vol : 1), baseVol: d.vol != null ? d.vol : 1 };
    if (o.pos) oo.pan = 0;
    const v = new Voice(o.dest || busFor(name, o, d), oo);
    try {
      let dur;
      if (oo.loop && !fn.loops) {
        v.every(v.t0, () => (v.lastDur || 1) + (oo.gap != null ? oo.gap : 0.3), (tt) => { v.lastDur = fn(v, oo, tt); });
        dur = Infinity;
      } else dur = fn(v, oo, v.t0);
      v.handle.dur = dur;
      if (isFinite(dur) && v.tasks.length === 0) v.hardEnd = v.t0 + dur + 3;
      else if (isFinite(dur)) v.hardEnd = v.t0 + dur + 6;
      if (v.tasks.length) v.pumpTasks(ctx.currentTime + LOOK);
    } catch (e) { console.error('[Snd] ' + name, e); v.end(); return DUMMY; }
    v.built = true; v.check();
    return v.handle;
  }
  // Snd.murmur(kind, {pos, dur, vol, line}) — 'tethered' | 'reach' | 'closer' | 'crowd' | 'cheer'
  function murmur(kind, o) { return play('murmur_' + kind, o || {}); }
  // Snd.tell(kind) — the phone's monster tells: 'eftpos' (a bar gained), 'vibration', 'pulse', 'battery', 'none'
  function tell(kind, o) {
    o = o || {};
    switch (kind) {
      case 'eftpos': return play('eftpos', { vol: 0.5, lp: 5000, ...o });
      case 'vibration': case 'vibrate': return play('vibrate', { vol: 0.55, short: true, ...o });
      case 'pulse': case 'heartbeat': return play('heartbeat', { vol: 0.35, ...o });
      case 'battery': return play('battery', { vol: 0.5, ...o });
      default: return DUMMY;
    }
  }

  // ---- ambient beds & worlds ------------------------------------------------------------------------------------
  function ambient(name, fade = 2) {
    wantBed = name && BEDS[name] && name !== 'outage' ? name : 'none';
    bedFade = fade;
    if (ctx && !offline && ctx.state === 'running') applyBeds(fade);
  }
  function applyBeds(fade = bedFade) {
    if (bed.name !== wantBed || (bed.v && bed.v.ended)) {
      if (bed.v) bed.v.stop(Math.max(0.05, fade));
      bed = { name: wantBed, v: wantBed === 'none' ? null : startBed(wantBed, fade) };
      if (bed.v && nextChime < ctx.currentTime + 15) nextChime = ctx.currentTime + rnd(20, 50);
    }
    const lvl = world === 'outage' ? (wantBed === 'wind_heavy' ? 0.75 : wantBed === 'wind' ? 0.35 : 0.25) : 1;
    if (bed.v && bed.v.level !== lvl) { bed.v.level = lvl; bed.v.setVol(lvl, 1.2); }
    if (world === 'outage' && (!outBed || outBed.ended)) outBed = startBed('outage', 3.5);
    if (world !== 'outage' && outBed) { outBed.stop(4); outBed = null; }
  }
  // CONTRACT+: Snd.setWorld('fog'|'outage') — switches to/from the Outage bed (also follows S.outage automatically).
  function setWorld(w) {
    w = w === 'outage' ? 'outage' : 'fog';
    if (typeof S !== 'undefined' && S) lastSOutage = S.outage;
    if (w === world) return;
    world = w;
    if (ctx && !offline && ctx.state === 'running') applyBeds();
  }

  // ---- music ------------------------------------------------------------------------------------------------------
  // Snd.music('tomorrow'|'nan'|'line', {full, clipped, loop, vol}) → {stop(fade=2)}
  function music(name, o) {
    o = o || {};
    if (!ok() || !MUSIC[name]) { if (ctx && !MUSIC[name]) console.warn('[Snd] unknown music: ' + name); return DUMMY; }
    if (curMusic && !curMusic.ended) curMusic.stop(o.xfade != null ? o.xfade : 1.5);
    const v = new Voice(B.music, { vol: (o.vol != null ? o.vol : 1) * 1.1, verb: o.verb != null ? o.verb : o.clipped ? 0.1 : 0.55, defFade: 2 });
    try {
      const d = MUSIC[name](v, o, v.t0 + 0.05);
      v.handle.dur = d;
      if (isFinite(d)) v.hardEnd = v.t0 + d + 6;
      if (v.tasks.length) v.pumpTasks(ctx.currentTime + LOOK);
    } catch (e) { console.error('[Snd] music ' + name, e); v.end(); return DUMMY; }
    v.built = true; v.check();
    curMusic = v;
    return v.handle;
  }
  function stopMusic(fade = 2) { if (curMusic && !curMusic.ended) curMusic.stop(fade); curMusic = null; }

  // ---- phone static that follows the nearest threat ----------------------------------------------------------------
  function buildStatic() {
    const n = ctx.createBufferSource(); n.buffer = NZ.white; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 1.6;
    const crk = ctx.createGain(); crk.gain.value = 0.7;
    const lvl = ctx.createGain(); lvl.gain.value = 0;
    n.connect(bp); bp.connect(crk); crk.connect(lvl); lvl.connect(B.fx);
    const p = ctx.createBufferSource(); p.buffer = NZ.pink; p.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const pg = ctx.createGain(); pg.gain.value = 0.3; p.connect(hp); hp.connect(pg); pg.connect(crk);
    const w = ctx.createOscillator(); w.frequency.value = 2950; const wg = ctx.createGain(); wg.gain.value = 0; w.connect(wg); wg.connect(lvl);
    n.start(0, Math.random()); p.start(0, Math.random()); w.start();
    stat = { lvl, crk, wg, bp };
    staticCur = -1;
  }
  function staticLevel(x) { staticTarget = clamp(+x || 0); if (stat && ctx.state === 'running') applyStatic(); }
  function applyStatic() {
    const v = staticTarget;
    if (Math.abs(v - staticCur) < 0.004) return;
    const now = ctx.currentTime, up = v > staticCur;
    staticCur = v;
    stat.lvl.gain.setTargetAtTime(Math.pow(v, 1.4) * 0.2, now, up ? 0.06 : 0.25);
    stat.wg.gain.setTargetAtTime(v > 0.7 ? (v - 0.7) * 0.02 : 0, now, 0.2);
    stat.bp.Q.setTargetAtTime(0.7 + (1 - v) * 1.2, now, 0.2);
  }

  // ---- threat loops -------------------------------------------------------------------------------------------------
  // Snd.loop(name, on, {pos, vol, id, intensity, fade}) — call every frame with on=true to move it; opts.id lets
  // several instances of one sound run at once (one per monster).
  function loop(name, on, o) {
    o = o || {};
    const key = o.id || name;
    let L = loops.get(key);
    if (!on) { if (L) { loops.delete(key); if (L.h) L.h.stop(o.fade != null ? o.fade : 0.8); } return DUMMY; }
    if (!L) { L = { name, o: { ...o }, h: null }; loops.set(key, L); }
    else {
      if (o.pos) L.o.pos = o.pos;
      if (o.vol != null) L.o.vol = o.vol;
      if (o.intensity != null) L.o.intensity = o.intensity;
    }
    if (L.h && L.h.playing) {
      if (o.pos) L.h.setPos(o.pos);
      if (o.vol != null && o.vol !== L.lastVol) { L.lastVol = o.vol; L.h.setVol(o.vol, 0.15); }
      if (o.intensity != null) L.h.set({ intensity: o.intensity });
    } else if (ok() && !offline) L.h = play(name, { ...L.o, loop: true });
    return L.h || DUMMY;
  }
  // CONTRACT+: Snd.stopLoops(fade=0.5) — stop every threat loop (done automatically on room:leave).
  function stopLoops(fade = 0.5) { for (const L of loops.values()) if (L.h) L.h.stop(fade); loops.clear(); }

  // ---- ducking, muting, volumes, listener ---------------------------------------------------------------------------
  // Snd.duck(amount 0..1, dur): all sound drains away (the Standard's "Got a sec?"), holds, then returns.
  function duck(amount = 1, dur = 3) {
    if (!ctx || offline) return Promise.resolve();
    const a = clamp(amount), now = ctx.currentTime, drain = 0.7, back = 1.4;
    const g = B.duck.gain, f = B.duckLP.frequency;
    holdParam(g, now); holdParam(f, now);
    g.linearRampToValueAtTime(1 - a * 0.985, now + drain); f.exponentialRampToValueAtTime(Math.max(60, 20000 * Math.pow(0.013, a)), now + drain);
    g.setValueAtTime(1 - a * 0.985, now + drain + dur); f.setValueAtTime(Math.max(60, 20000 * Math.pow(0.013, a)), now + drain + dur);
    g.linearRampToValueAtTime(1, now + drain + dur + back); f.exponentialRampToValueAtTime(20000, now + drain + dur + back);
    return new Promise((r) => setTimeout(r, (drain + dur) * 1000));
  }
  function applyMute() {
    if (!B) return;
    const t = ctx.currentTime;
    B.mute.gain.cancelScheduledValues(t);
    B.mute.gain.setTargetAtTime(isMuted || hiddenMute ? 0 : 1, t, 0.03);
  }
  function muted(on) {
    if (on === undefined) return isMuted;
    isMuted = !!on;
    if (ctx && !offline) applyMute();
    return isMuted;
  }
  function setVolumes(vv) {
    const src = vv || (typeof META !== 'undefined' && META.options) || {};
    for (const k of ['master', 'effects', 'music']) if (src[k] != null && isFinite(+src[k])) vol[k] = clamp(+src[k]);
    if (!ctx || offline || !B) return { ...vol };
    const t = ctx.currentTime;
    B.master.gain.setTargetAtTime(curve(vol.master), t, 0.05);
    for (const b of [B.fx, B.amb, B.ui]) b.gain.setTargetAtTime(curve(vol.effects), t, 0.05);
    B.music.gain.setTargetAtTime(curve(vol.music), t, 0.05);
    return { ...vol };
  }
  // Snd.setListener(pos, forward) — pos [x,y,z]|Vector3; forward [x,y,z]|Vector3 or a yaw in radians (0 = +Z).
  // Call each frame with the player's position and the current camera's ground-plane forward.
  function setListener(pos, fwd) {
    if (!ctx || offline) return;
    const [x, y, z] = xyz(pos);
    let f = typeof fwd === 'number' ? [Math.sin(fwd), 0, Math.cos(fwd)] : fwd ? xyz(Array.isArray(fwd) && fwd.length === 2 ? [fwd[0], 0, fwd[1]] : fwd) : [0, 0, -1];
    const m = Math.hypot(f[0], f[1], f[2]) || 1; f = f.map((c) => c / m);
    lst.x = x; lst.y = y; lst.z = z;
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.02); L.positionY.setTargetAtTime(y, t, 0.02); L.positionZ.setTargetAtTime(z, t, 0.02);
      L.forwardX.setTargetAtTime(f[0], t, 0.02); L.forwardY.setTargetAtTime(f[1], t, 0.02); L.forwardZ.setTargetAtTime(f[2], t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(x, y, z); L.setOrientation(f[0], f[1], f[2], 0, 1, 0); }
  }
  // CONTRACT+: Snd.pauseWorld(on|null) — muffle and dim world sound (fx + ambient) under menus; null = automatic
  // (dims while an in-game screen — pause/items/map/memos/phone/options/save/load/doc — is open, via Bus 'menu').
  function worldDimmed() { return worldForced != null ? worldForced : [...menuOpen].some((n) => DIM_MENUS.has(n)); }
  function pauseWorld(on) { worldForced = on == null ? null : !!on; applyWorldDim(); }
  function applyWorldDim() {
    if (!ctx || offline || !B) return;
    const d = worldDimmed(), t = ctx.currentTime;
    B.world.gain.setTargetAtTime(d ? 0.3 : 1, t, 0.12);
    B.worldLP.frequency.setTargetAtTime(d ? 1100 : 20000, t, 0.12);
  }

  // ---- lifecycle ----------------------------------------------------------------------------------------------------
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  function init() {
    if (ctx) { resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return false; } }
    realCtx = ctx;
    buildShared();
    buildStatic();
    setVolumes();
    lastSOutage = typeof S !== 'undefined' && S ? S.outage : false;
    world = lastSOutage ? 'outage' : world;
    for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchend']) window.addEventListener(ev, resume, { capture: true, passive: true });
    ctx.onstatechange = () => { if (ctx === realCtx && ctx.state === 'running') pumpAll(); };
    document.addEventListener('visibilitychange', () => { hiddenMute = document.hidden; if (ctx) applyMute(); });
    if (!subscribed && typeof Bus !== 'undefined') {
      subscribed = true;
      Bus.on('outage', (on) => setWorld(on ? 'outage' : 'fog'));
      Bus.on('room:leave', () => { stopLoops(0.4); staticLevel(0); });
      Bus.on('menu', (open, name) => { if (open) menuOpen.add(name); else if (name) menuOpen.delete(name); else menuOpen.clear(); applyWorldDim(); });
    }
    pumpTimer = setInterval(pumpAll, 200);
    resume();
    return true;
  }
  function pumpAll() {
    if (!ctx || offline || ctx.state !== 'running') return;
    const now = ctx.currentTime, until = now + LOOK;
    if (bed.name !== wantBed || (bed.v && bed.v.ended) || (world === 'outage') !== !!(outBed && !outBed.ended)) applyBeds();
    for (const L of loops.values()) if (!L.h || (!L.h.playing && L.h === DUMMY)) L.h = play(L.name, { ...L.o, loop: true });
    for (const v of voices) {
      if (v.offline) continue;
      if (v.tasks.length && !v.stopping) { try { v.pumpTasks(until); } catch (e) { console.error('[Snd] task', e); v.stop(0.05); } }
      if (now > v.hardEnd) v.end();
    }
    // the two-tone chime from nowhere (Fog world, any bed)
    if (world === 'fog' && bed.v && now >= nextChime) {
      if (nextChime > 0) play('chime', { bus: 'amb', pan: rnd(-0.85, 0.85), vol: rnd(0.16, 0.26), lp: 2400, verb: 0.9 });
      nextChime = now + rnd(40, 90);
    }
    if (stat) {
      applyStatic();
      if (staticCur > 0.02) {
        if (staticNext < now) staticNext = now + 0.02;
        if (staticNext < until) { crackle(stat.crk.gain, staticNext, LOOK, 30 + 170 * staticCur, [0.4, 1.4], [0.004, 0.03], 0.6); staticNext += LOOK; }
      }
    }
    if (menuOpen.size && typeof Menus !== 'undefined' && Menus.isOpen && !Menus.isOpen()) { menuOpen.clear(); applyWorldDim(); }
  }
  function update(dt) {
    if (!ctx || offline) return;
    if (typeof S !== 'undefined' && S && !!S.outage !== !!lastSOutage) { lastSOutage = S.outage; setWorld(S.outage ? 'outage' : 'fog'); }
    pumpAll();
  }

  // ---- diagnostics ----------------------------------------------------------------------------------------------------
  // CONTRACT+: Snd.stats() → { state, voices, nodes, loops, bed, world, music, static } (nodes = live per-sound nodes)
  function stats() {
    return { state: ctx ? ctx.state : 'none', voices: voices.size, nodes: liveNodes, loops: loops.size, bed: bed.name,
      outageBed: !!outBed, world, music: !!(curMusic && !curMusic.ended), static: staticTarget, dimmed: worldDimmed() };
  }
  // CONTRACT+: Snd.names() → { sfx:[…], beds:[…], music:[…], murmur:[…], surfaces:[…] }
  function names() {
    return { sfx: Object.keys(SFX).filter((n) => !n.startsWith('murmur_')), beds: Object.keys(BEDS), music: Object.keys(MUSIC),
      murmur: Object.keys(SFX).filter((n) => n.startsWith('murmur_')).map((n) => n.slice(7)), surfaces: Object.keys(SURF) };
  }
  // CONTRACT+: Snd.render(spec, sec=4) → Promise<{peak, rms, nan, buffer}> — renders offline (test/debug):
  // spec = {sfx, opts} | {footstep:[surface, running]} | {ambient} | {music, opts} | {murmur, opts}
  async function render(spec, sec = 4, sr = 44100) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const off = new OAC(2, Math.ceil(sec * sr), sr);
    const saved = { ctx, B, NZ, PW, CV, curMusic };
    const before = new Set(voices);
    ctx = off; offline = true;
    try {
      buildShared();
      if (spec.sfx) play(spec.sfx, spec.opts);
      else if (spec.footstep) footstep(spec.footstep[0], spec.footstep[1], spec.opts);
      else if (spec.ambient) startBed(spec.ambient, 0.5);
      else if (spec.music) music(spec.music, spec.opts);
      else if (spec.murmur) murmur(spec.murmur, spec.opts);
      for (let k = 0; k < 20; k++) { let n = 0; for (const v of [...voices]) if (v.offline && v.tasks.length) { v.pumpTasks(sec); n++; } if (!n) break; }
    } finally { ctx = saved.ctx; B = saved.B; NZ = saved.NZ; PW = saved.PW; CV = saved.CV; curMusic = saved.curMusic; offline = false; }
    const buf = await off.startRendering();
    for (const v of [...voices]) if (v.offline && !before.has(v)) v.end();
    let peak = 0, sum = 0, nan = false;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const x = d[i]; if (x !== x) { nan = true; continue; } const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
    }
    return { peak, rms: Math.sqrt(sum / (buf.length * buf.numberOfChannels)), nan, buffer: buf };
  }

  return {
    init, update, play, footstep, ambient, music, stopMusic, staticLevel, loop, murmur, tell, duck, muted, setVolumes,
    setListener, setWorld, pauseWorld, stopLoops, stats, names, render,
    get ctx() { return ctx; },
    get ready() { return !!ctx && ctx.state === 'running'; },
    get world() { return world; },
  };
})();
