// ==== data/19_endings.js — the endings after the transmitter room (spec §12 Endings, Fate cards, Credits; §2A Results;
// §5 cast bible; CONTENT_PLAN §7 ending ids) — tag END_ ====
// Game.ending(name) (engine/16_game.js) plays, nested in the Chapter 8 scene that decided the ending:
//   connected  E-C1 (Ch 8, in the transmitter room) → E-C2 "Morning" → credits (the Nan motif) → E-C3 "Ask First"
//              (post-credits) → fate cards → results
//   coverage   E-OC0 (Ch 8: the call rings out) → E-OC (shots 1–7) → credits (wind and static) → fate cards → results
//   tomorrow   E-FT0 (Ch 8; not after the accepted deal) → E-FT (the city store, 9:00am) → credits → results
//   yes        E-YES (the transmitter room door opens onto the party) → credits over the hold music → results
//   … then the title, with New Game+ unlocked (Save.recordEnding).
// Rooms (cutscene sets; every one keeps real lighting, and each has room cameras so Cam.check passes):
//   e_dawn        the real Signal Hill at dawn, no fog: mist lifting off an ordinary small town of gum trees and tin
//                 roofs, the District Hospital with Luka's car parked out the front, the mast on the summit behind.
//   e_room12_day  Room 12 in morning daylight: Nan in bed (nan_gown: the blue cardigan over the gown, glasses on),
//                 Luke asleep sitting up in the chair by the window, birds outside, the real hill through the glass.
//   e_citystore   STORE 0412 — CITY, bright and ordinary: counter, demo tables, accessory wall, huddle board (drawn live
//                 — Luka writes on it), leaderboard TV, the back office behind the counter window with its monitor,
//                 the glass shopfront and its chiming door onto a city street. Used by E-C3, E-OC shot 6 and E-FT.
//   e_highway     very high above the highway at dawn: paddocks, gum trees, fence lines, mist in the hollows, one car.
//   e_redlight    a city intersection in the morning; a car interior (Aidan's hatchback) stopped at the red light.
//   e_party       the transmitter room as a party: bunting, balloons, party lights, confetti, the whole cast in party
//                 hats and Ollie — an original round teal phone mascot with the sticker's yellow smile for a face.
//   (p1_car, p2_lookout and c8_mast from earlier chapters are reused for Out of Coverage shots 1, 2 and 4.)
// Also here: DIALOGUE.credits (the credit roll), DIALOGUE.fates (the §12 fate-card table, read by Game), and a
// small Web Audio helper for the few sounds Snd has no voice for (dawn birds, a car engine and road hum).
// State: none saved — the endings only read S (fate flags, F/A). Transient presentation state lives in END (never saved).
{
  const D2R = Math.PI / 180;
  const clamp = U.clamp, lerp = U.lerp;
  const FN = Tex.fonts, BR = Tex.brand;
  const flag = (k) => !!(S.flags && S.flags[k]);
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio */ } return null; };
  const ease = U.ease.inOut;
  // transient presentation state (never saved)
  const END = { board: null, lb: null, mon: null, fx: [], ollie: null, contract: null, yes: null, carT: 0, hwCar: null, noteT: 0 };
  try { if (typeof window !== 'undefined' && window.SH) window.SH.end = END; } catch (e) { /* tests only */ }

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures: cached static ones (drawn once, shared, never disposed) and live ones (redrawn by the scenes)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash('end:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'end:' + key;
    TEXC.set(key, t);
    return t;
  }
  // a live canvas: {tex, draw(fn)} — one per key for the whole session (shared; each room build reuses it)
  const LIVE = new Map();
  function ltex(key, w, h) {
    let L = LIVE.get(key);
    if (L) return L;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true; tex.name = 'end:' + key;
    L = { canvas: c, ctx: c.getContext('2d'), tex, w, h, draw(fn) { try { fn(L.ctx, w, h); } catch (e) { console.error('[END] draw ' + key, e); } tex.needsUpdate = true; } };
    LIVE.set(key, L);
    return L;
  }
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    if (o.spacing) { try { ctx.letterSpacing = o.spacing + 'px'; } catch (e) { /* old canvas */ } }
    if (o.maxWidth) ctx.fillText(s, x, y, o.maxWidth); else ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  const hand = (ctx, s, x, y, o = {}) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };
  // handwriting revealed left to right (k 0..1): a marker being written
  function handReveal(ctx, s, x, y, k, o = {}) {
    if (k <= 0) return;
    ctx.save();
    ctx.font = `${o.size || 20}px ${FN.hand}`;
    const w = ctx.measureText(s).width * 1.12 + 20;
    ctx.beginPath(); ctx.rect(x - 10, y - (o.size || 20) * 1.4, w * clamp(k), (o.size || 20) * 2.2); ctx.clip();
    hand(ctx, s, x, y, o);
    ctx.restore();
  }
  // a mesh from a geometry + material spec (room-owned; Kit disposes it with the room)
  function mesh(K, geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat && mat.isMaterial ? mat : K.mat(mat));
    m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false;
    if (o.pos) m.position.set(...o.pos);
    if (o.rot) m.rotation.set((o.rot[0] || 0) * D2R, (o.rot[1] || 0) * D2R, (o.rot[2] || 0) * D2R);
    if (o.scale) m.scale.set(...(Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]));
    if (o.order) m.renderOrder = o.order;
    K.mesh(m, { name: o.name });
    return m;
  }
  const basic = (tex, o = {}) => new THREE.MeshBasicMaterial({ map: tex, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? !o.transparent, fog: o.fog ?? false, side: o.double ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false, color: o.color || 0xffffff, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const std = (tex, o = {}) => new THREE.MeshStandardMaterial({ map: tex, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0, color: o.color || 0xffffff, emissive: o.emissive ? new THREE.Color(o.emissive === true ? 0xffffff : o.emissive) : new THREE.Color(0), emissiveMap: o.emissive ? tex : null, emissiveIntensity: o.emissiveIntensity ?? (o.emissive ? 0.9 : 1), transparent: !!o.transparent, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
  // a soft round glow (fog-immune sprites: distant lamps, the sun, the mast's red light)
  const glowTex = () => ctex('glow', 64, 64, (x, w, h) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  function glow(K, x, y, z, size, color, opacity = 0.8, o = {}) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, fog: !!o.fog, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); s.userData.op = opacity;
    if (o.order) s.renderOrder = o.order;
    K.mesh(s, { name: o.name });
    return s;
  }
  // a big sky dome (vertical gradient canvas, sun glow painted in); radius under the camera's far plane (200 m)
  function skyDome(K, key, stops, o = {}) {
    const tex = ctex('sky:' + key, 64, 512, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      for (const [k, c] of stops) g.addColorStop(k, c);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const geo = new THREE.SphereGeometry(o.r || 185, 32, 16, 0, Math.PI * 2, 0, Math.PI * (o.lower ? 0.62 : 0.55));
    const m = new THREE.Mesh(geo, basic(tex, { double: false }));
    m.material.side = THREE.BackSide; m.material.depthWrite = false; m.renderOrder = -10;
    m.position.set(...(o.at || [0, 0, 0])); m.frustumCulled = false;
    K.mesh(m, { name: 'end:sky:' + key });
    return m;
  }
  // soft mist cloud texture (tileable-ish alpha noise) for lying mist layers
  const mistTex = () => ctex('mist', 256, 256, (x, w, h, r) => {
    const img = x.createImageData(w, h), d = img.data;
    let n = null;
    try { n = Tex.util.fbm(w, h, r, { cells: 4, oct: 4 }); } catch (e) { n = null; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = (j * w + i), dx = (i / w - 0.5) * 2, dy = (j / h - 0.5) * 2;
      const fall = clamp(1 - Math.sqrt(dx * dx + dy * dy)), v = n ? n[p] : 0.5;
      d[p * 4] = 245; d[p * 4 + 1] = 240; d[p * 4 + 2] = 232; d[p * 4 + 3] = Math.round(255 * clamp((v - 0.32) * 1.9) * Math.pow(fall, 0.7));
    }
    x.putImageData(img, 0, 0);
  });
  function mistLayer(K, x, y, z, w, d, opacity, o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), basic(mistTex(), { transparent: true, opacity, fog: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = (o.spin || 0) * D2R; m.position.set(x, y, z); m.renderOrder = 4;
    m.userData.base = { y, opacity, rise: o.rise ?? 0.05, drift: o.drift ?? 0.1 };
    K.mesh(m, { name: o.name });
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // A few sounds Snd has no voice for, synthesised here with the same AudioContext (dawn birds, a car engine and
  // road hum). They follow META.options master × effects; silent until the context runs.
  // ---------------------------------------------------------------------------------------------------------------
  const AUD = { bus: null, noise: null };
  function audCtx() { try { return typeof Snd !== 'undefined' && Snd.ready ? Snd.ctx : null; } catch (e) { return null; } }
  function audBus(ac) {
    if (AUD.bus && AUD.bus.context === ac) {
      const O = (typeof META !== 'undefined' && META.options) || {};
      AUD.bus.gain.setTargetAtTime((O.master ?? 0.9) * (O.effects ?? 0.9), ac.currentTime, 0.1);
      return AUD.bus;
    }
    const O = (typeof META !== 'undefined' && META.options) || {};
    AUD.bus = ac.createGain(); AUD.bus.gain.value = (O.master ?? 0.9) * (O.effects ?? 0.9); AUD.bus.connect(ac.destination);
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), dd = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; dd[i] = last * 3.5; }
    AUD.noise = b;
    return AUD.bus;
  }
  // one bird phrase: 2–5 quick chirps (FM sine sweeps), panned
  function END_chirp(vol = 0.05, pan = 0) {
    const ac = audCtx(); if (!ac) return;
    try {
      const out = audBus(ac), t0 = ac.currentTime + 0.02;
      const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
      const g = ac.createGain(); g.gain.value = 0;
      if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(out); } else g.connect(out);
      const n = 2 + Math.floor(Math.random() * 4), base = 2400 + Math.random() * 2200, kind = Math.random();
      let t = t0;
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(), d = 0.05 + Math.random() * 0.07;
        o.type = 'sine';
        const f0 = base * (0.9 + Math.random() * 0.2), f1 = kind < 0.5 ? f0 * (1.25 + Math.random() * 0.3) : f0 * (0.7 + Math.random() * 0.1);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
        const og = ac.createGain(); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(vol, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0005, t + d);
        o.connect(og); og.connect(p || out);
        o.start(t); o.stop(t + d + 0.02);
        o.onended = () => { try { o.disconnect(); og.disconnect(); } catch (e) { /* gone */ } };
        t += d + 0.03 + Math.random() * 0.09;
      }
      setTimeout(() => { try { g.disconnect(); if (p) p.disconnect(); } catch (e) { /* gone */ } }, 1500);
    } catch (e) { /* audio */ }
  }
  // birds in a room: call from K.animate(dt) (they stop when the room unloads)
  function birdsTick(st, dt, o = {}) {
    st.t = (st.t ?? 0.5) - dt;
    if (st.t > 0) return;
    st.t = (o.gap || 0.9) + Math.random() * (o.spread || 2.2);
    END_chirp((o.vol || 0.045) * (0.5 + Math.random() * 0.8), (Math.random() * 2 - 1) * (o.pan ?? 0.8));
  }
  // an engine: {start:true} cranks it (a starter whirr) and it catches; the idle/road hum runs until stop(fade)
  function END_engine(o = {}) {
    const ac = audCtx();
    const H = { stop() {}, set() {} };
    if (!ac) return H;
    try {
      const out = audBus(ac), t0 = ac.currentTime + 0.03;
      const master = ac.createGain(); master.gain.value = 0; master.connect(out);
      const nodes = [];
      const mk = (n) => { nodes.push(n); return n; };
      let t = t0;
      if (o.start) {
        // the starter: a band of noise chopped at ~11 Hz for ~0.8 s
        const src = mk(ac.createBufferSource()); src.buffer = AUD.noise; src.loop = true;
        const bp = mk(ac.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
        const g = mk(ac.createGain()); g.gain.value = 0;
        src.connect(bp); bp.connect(g); g.connect(out);
        for (let k = 0; k < 9; k++) { const a = t0 + k * 0.09; g.gain.setValueAtTime(0.0, a); g.gain.linearRampToValueAtTime(0.22, a + 0.02); g.gain.linearRampToValueAtTime(0.03, a + 0.07); }
        g.gain.linearRampToValueAtTime(0, t0 + 0.9);
        src.start(t0); src.stop(t0 + 1.0);
        t = t0 + 0.75;
      }
      // the idle: two detuned saws through a low-pass + brown-noise road rumble
      const lp = mk(ac.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = o.road ? 260 : 420; lp.Q.value = 0.8;
      lp.connect(master);
      for (const f of [o.road ? 52 : 38, o.road ? 52.7 : 38.6]) { const s = mk(ac.createOscillator()); s.type = 'sawtooth'; s.frequency.value = f; if (o.start) { s.frequency.setValueAtTime(f * 2.2, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.9); } s.connect(lp); s.start(t); }
      const rn = mk(ac.createBufferSource()); rn.buffer = AUD.noise; rn.loop = true;
      const rl = mk(ac.createBiquadFilter()); rl.type = 'lowpass'; rl.frequency.value = o.road ? 520 : 180;
      const rg = mk(ac.createGain()); rg.gain.value = o.road ? 0.6 : 0.15;
      rn.connect(rl); rl.connect(rg); rg.connect(master); rn.start(t);
      const vol = o.vol ?? 0.3;
      master.gain.setValueAtTime(0, t); master.gain.linearRampToValueAtTime(o.start ? vol * 1.5 : vol, t + (o.start ? 0.12 : 1.2));
      if (o.start) master.gain.linearRampToValueAtTime(vol, t + 1.4);
      let stopped = false;
      H.stop = (fade = 0.8) => {
        if (stopped) return; stopped = true;
        try {
          const n = ac.currentTime; master.gain.cancelScheduledValues(n); master.gain.setValueAtTime(master.gain.value, n); master.gain.linearRampToValueAtTime(0, n + fade);
          setTimeout(() => { for (const x of nodes) { try { if (x.stop) x.stop(); } catch (e) { /* ok */ } try { x.disconnect(); } catch (e) { /* ok */ } } try { master.disconnect(); } catch (e) { /* ok */ } }, (fade + 0.2) * 1000);
        } catch (e) { /* audio */ }
      };
      H.set = (v) => { try { master.gain.setTargetAtTime(v, ac.currentTime, 0.2); } catch (e) { /* audio */ } };
      END.fx.push(H);
    } catch (e) { /* audio */ }
    return H;
  }
  function stopFx(fade = 0.5) { for (const h of END.fx.splice(0)) { try { h.stop(fade); } catch (e) { /* audio */ } } }

  // ---------------------------------------------------------------------------------------------------------------
  // Scene helpers
  // ---------------------------------------------------------------------------------------------------------------
  const wpos = (o) => { const v = V3(); if (o) { o.updateWorldMatrix(true, false); o.getWorldPosition(v); } return v; };
  const headOf = (A) => wpos(A && A.raw && A.raw.bones && A.raw.bones.head).add(V3(0, 0.06, 0));
  const arr = (v) => [v.x, v.y, v.z];
  const fwdOf = (A) => { const y = (A.yaw || 0) * D2R; return V3(Math.sin(y), 0, Math.cos(y)); };
  // a close shot `d` m in front of an actor's face (side: metres to his left(+)/right(−) as seen by him)
  function faceShot(A, d = 1.0, fov = 30, lift = -0.02, side = 0, look = 0) {
    const h = headOf(A), f = fwdOf(A), l = V3(f.z, 0, -f.x);
    return { pos: [h.x + f.x * d + l.x * side, h.y + lift, h.z + f.z * d + l.z * side], target: [h.x + l.x * look, h.y - 0.02, h.z + l.z * look], fov };
  }
  // over-the-shoulder: behind `from`'s head (back m), to one side (side m, + = camera right), looking at `to`'s face
  function ots(from, to, back = 0.5, side = 0.3, up = 0.08, fov = 34, aim = 0) {
    const a = headOf(from), b = headOf(to), d = b.clone().sub(a); d.y = 0; d.normalize();
    const r = V3(-d.z, 0, d.x);
    return { pos: [a.x - d.x * back + r.x * side, a.y + up, a.z - d.z * back + r.z * side], target: [b.x + r.x * aim, b.y - 0.03, b.z + r.z * aim], fov };
  }
  // hide Aidan (the player's body) for scenes he isn't in; torch off; no phone glow on his face
  function aidanOff(G) {
    const A = G.aidan;
    try { Player.setTorch(false); } catch (e) { /* player */ }
    if (A.raw) { A.raw.setPhoneLight && A.raw.setPhoneLight(0); A.raw.idleLife = false; }
    A.hide();
    return A;
  }
  // (the carry poses are reset too: Ch 8's E-C1 leaves his right arm up at his ear — 'phone_ear' — and a pose set by a
  // scene outlives it. o.phone:false puts the phone away: hidden, the arm hanging free.)
  function aidanOn(G, x, z, rot, o = {}) {
    const A = G.aidan;
    try { Player.setTorch(false); } catch (e) { /* player */ }
    A.show(); A.place(x, z, rot);
    A.pose(o.pose || 'idle');
    if (A.raw) {
      A.raw.setPhoneLight && A.raw.setPhoneLight(0); A.raw.idleLife = false; A.raw.lookAt(null); A.raw.finishGestures && A.raw.finishGestures(); A.raw.expr(o.expr || 'neutral'); A.raw.eyes('ahead');
      try {
        const ph = A.raw.held && A.raw.held.R;
        if (ph) ph.visible = o.phone !== false;
        A.raw.armPose('R', ph && o.phone !== false ? 'phone' : null);
        if (!(A.raw.held && A.raw.held.L)) A.raw.armPose('L', null);
      } catch (e) { /* rig */ }
    }
    return A;
  }
  // a room's own clean slate between setups: every post effect off, the grade the room asks for
  function cleanPost(G, grade) {
    try { Render.resetPost(); } catch (e) { /* render */ }
    if (grade) { try { Render.setGrade(grade, 0); } catch (e) { /* render */ } }
    try { G.bars(null); } catch (e) { /* phone */ }
    try { Phone.display(null); } catch (e) { /* phone */ }
  }
  // Rig party hat / small hand-made props hung on a bone
  function hatOn(A, color, o = {}) {
    const raw = A && A.raw; if (!raw || !raw.bones || !raw.bones.head) return null;
    const g = new THREE.Group(); g.name = 'end:hat';
    const tex = ctex('hat:' + color, 64, 64, (x, w, h) => { x.fillStyle = color; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc((i % 3) * 24 + 8, Math.floor(i / 3) * 32 + 14, 5, 0, Math.PI * 2); x.fill(); } }, { wrap: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 14, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
    cone.position.y = 0.11; g.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: o.pom || '#ffcc00', roughness: 0.9 }));
    pom.position.y = 0.23; g.add(pom);
    const H = raw.H || 1.75;
    g.position.set(0, (o.y ?? 0.118) * H, (o.z ?? -0.004) * H); g.rotation.set((o.tilt || -8) * D2R, 0, (o.roll || 6) * D2R);
    raw.bones.head.add(g);
    return g;
  }

  // =================================================================================================================
  // CREDITS (spec §12: a slow scroll in the title serif on black; music by ending — Menus picks it). Menus reads
  // DIALOGUE.credits: strings, '' gaps, {title}, {head}, {role, name}, {text, italic}.
  // =================================================================================================================
  defineDialogue('credits', [
    { title: 'SIGNAL HILL' },
    { text: 'a story about the call you didn\'t make', italic: true },
    '', '', '',
    { head: 'With' },
    { role: 'AIDAN', name: 'a sales rep, six months in' },
    { role: 'WAI', name: 'who stayed on the line' },
    { role: 'CHASE', name: 'who was rostered on alone' },
    { role: 'CHLOE', name: 'number one, thirty months running' },
    { role: 'LUKA', name: 'the store leader' },
    { role: 'LUKE', name: 'who rang three times' },
    { role: 'NAN', name: 'who kept pressing it' },
    '', '',
    { head: 'Written and designed by' },
    'Luka',
    { head: 'Engine' },
    'Three.js, and everything else built in code:',
    'fixed cameras, fog, bodies, faces and cutscenes',
    { head: 'Art' },
    'Every surface drawn with Canvas 2D',
    'Every body and building built from primitives',
    { head: 'Sound' },
    'Synthesised with Web Audio:',
    'wind, static, the door chime, the hold music, the receipt printers',
    { head: 'Music' },
    'Three motifs on a synthesised felt piano',
    { role: 'TOMORROW', name: 'four notes that never resolve' },
    { role: 'NAN', name: 'a warm phrase with one sad note' },
    { role: 'THE LINE', name: 'two notes a fifth apart' },
    { head: 'Built with' },
    'Claude',
    '', '',
    { text: 'No voices were used.', italic: true },
    { text: 'No images, models, sound files or fonts were used.', italic: true },
    '', '',
    { head: 'Thanks' },
    'To everyone who works a counter, a shop floor or a phone queue.',
    'To the reps rostered on alone on the late shift.',
    'To the contact-centre staff who stay on the line',
    'long after the call stops being about a phone.',
    'And to everyone who ever rang back.',
    '', '',
    { text: 'This is a work of fiction. Signal Hill, its people and its customers are invented.', italic: true },
    { text: 'The store names and the wordmark are original drawings, used here with respect;', italic: true },
    { text: 'this game is not affiliated with or endorsed by any company.', italic: true },
    '', '', '',
    { text: 'Ask first.', italic: true },
    '', '',
    'Thank you for playing.',
  ]);
  // the §12 fate-card table (Game shows them after the credits in Connected and Out of Coverage, 4 s each)
  defineDialogue('fates', [
    { flag: 'waiSaved', saved: 'Wai trains the new starters now. He still picks up on the first ring.', lost: 'The operators\' board in Signal Hill has one lamp that never lights.' },
    { flag: 'chaseSaved', saved: 'Chase told his leader what really happened that night. His store doesn\'t roster anyone alone on late shifts anymore.', lost: 'Nobody has heard from Chase. His phone rings out.' },
    { flag: 'chloeSaved', saved: 'Chloe finished the month eleven short. Nothing happened.', lost: 'Chloe was number one again that month. And the next.' },
    { flag: 'lukaSaved', saved: 'Luka stopped writing the number first.', lost: 'Luka is still looking for the road out.' },
    { flag: 'lukeSaved', saved: 'Luke visits on Sundays.', lost: 'Luke is still ringing a number that doesn\'t pick up.' },
  ]);

  // =================================================================================================================
  // e_citystore — STORE 0412 — CITY. x 0–18 (west → east), z 0–13 (back wall → the glass shopfront); the back office
  // behind the counter (x 11–18, z −4–0) seen through its window; the city street outside the glass (z 13–28).
  // =================================================================================================================
  const CS = {
    W: 18, D: 13, H: 3.2, cz: 3.4, aidan: [9.2, 2.45], cust: [9.2, 4.55], door: [9, 13],
    board: [15.35, 3.55, -40], winX: 11.0, offDoor: 16.4, offW: 9.6, mon: [11.4, -3.25], leader: [17.93, 6.4],
    chloe: [4.2, 7.8], chloeCust: [5.4, 8.35],
  };
  // the huddle board, drawn live: st = {mode:'c3'|'oc'|'ft', num, numK, ask, day}
  const boardL = () => ltex('board', 512, 384);
  function boardDraw(st = {}) {
    const L = boardL();
    L.draw((x, w, h) => {
      x.fillStyle = '#f4f5f1'; x.fillRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      // ghosts of old writing
      // (Tex.handwriting sets its own globalAlpha per glyph: the faintness goes in through its alpha option)
      hand(x, 'NPS!!  bundles  →  ask about NBN', 40, 330, { size: 22, color: '#1b3a8a', seed: 5, alpha: 0.09 }); hand(x, 'Target 12', 300, 120, { size: 26, color: '#1b3a8a', seed: 6, alpha: 0.07 });
      // printed header strip
      x.fillStyle = BR.tealDark; x.fillRect(0, 0, w, 46);
      tx(x, 'HUDDLE', 18, 32, 24, '#ffffff', { weight: 'bold', spacing: 3 });
      tx(x, 'STORE 0412', w - 18, 32, 18, BR.yellow, { align: 'right', weight: 'bold' });
      hand(x, st.day || 'Thursday', 150, 34, { size: 22, color: '#ffffff', seed: 7 });
      // left: today's number (the leader writes it)
      tx(x, 'TODAY', 26, 88, 16, '#6a7472', { weight: 'bold', spacing: 2 });
      if (st.num) handReveal(x, st.num, 40, 176, st.numK ?? 1, { size: 78, color: '#1d2f86', wobble: 2, seed: 21 });
      if (st.ask) handReveal(x, 'Ask first.', 36, 262, st.ask, { size: 46, color: '#b2261e', wobble: 1.6, seed: 22 });
      if (st.mode === 'ft') { hand(x, 'SIGN-UPS', 40, 250, { size: 30, color: '#1d2f86', seed: 23 }); hand(x, 'AIDAN  ★★★', 44, 300, { size: 34, color: '#b2261e', seed: 24 }); }
      // right: the roster, name magnets (one slot empty in Out of Coverage)
      const rx = 300, ry = 76;
      tx(x, 'ON TODAY', rx, ry + 12, 16, '#6a7472', { weight: 'bold', spacing: 2 });
      const names = st.names || ['LUKA', 'CHLOE', 'PRIYA', 'JOSH', 'AIDAN'];
      names.forEach((n, i) => {
        const y = ry + 26 + i * 50;
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(rx + 3, y + 3, 170, 38);
        if (n) {
          x.fillStyle = i === 0 ? BR.yellow : '#ffffff'; x.fillRect(rx, y, 170, 38);
          x.strokeStyle = '#9aa6a4'; x.lineWidth = 2; x.strokeRect(rx, y, 170, 38);
          tx(x, n, rx + 85, y + 27, 22, BR.ink, { align: 'center', weight: 'bold', font: FN.sans });
        } else {
          // the magnet's gone: a clean rectangle where it sat, the ghost of a name wiped off
          x.fillStyle = '#fbfbf8'; x.fillRect(rx, y, 170, 38);
          x.strokeStyle = 'rgba(120,130,128,0.35)'; x.setLineDash([6, 5]); x.lineWidth = 2; x.strokeRect(rx, y, 170, 38); x.setLineDash([]);
        }
      });
      // marker tray shadow
      x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, h - 10, w, 10);
    });
    END.boardSt = st;
    return L;
  }
  const lbL = () => ltex('lb', 320, 180);
  function lbDraw(mode) {
    lbL().draw((c, w, h) => {
      c.fillStyle = '#071a1c'; c.fillRect(0, 0, w, h);
      if (mode === 'ft') {
        c.fillStyle = BR.teal; c.fillRect(0, 0, w, h * 0.16);
        tx(c, 'STORE LEADERBOARD', w * 0.04, h * 0.115, h * 0.075, '#ffffff', { weight: '900', font: FN.heavy });
        const g = c.createLinearGradient(0, h * 0.2, 0, h * 0.62); g.addColorStop(0, 'rgba(255,204,0,0.35)'); g.addColorStop(1, 'rgba(255,204,0,0.08)');
        c.fillStyle = g; c.fillRect(0, h * 0.2, w, h * 0.42);
        tx(c, 'AIDAN — #1', w / 2, h * 0.5, h * 0.2, '#ffffff', { align: 'center', weight: '900', font: FN.heavy });
        const rows = [['AIDAN', '212%'], ['CHLOE', '96%'], ['PRIYA', '91%'], ['JOSH', '88%']];
        rows.forEach(([n, v], i) => { const y = h * (0.7 + i * 0.075); tx(c, '#' + (i + 1), w * 0.06, y, h * 0.055, i ? '#9fb4b2' : BR.yellow, { weight: 'bold' }); tx(c, n, w * 0.2, y, h * 0.055, i ? '#9fb4b2' : '#ffffff', { weight: 'bold' }); tx(c, v, w * 0.94, y, h * 0.055, '#c8d8d6', { align: 'right', font: FN.mono }); });
      } else {
        // an ordinary day: the plan ad loop's first slide — the wordmark and a line
        const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, BR.tealDeep); g.addColorStop(1, BR.teal);
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        try { Tex.drawWordmark(c, w * 0.08, h * 0.36, h * 0.2, { color: BR.yellow }); } catch (e) { /* brand */ }
        tx(c, 'Tell us what you need.', w * 0.08, h * 0.62, h * 0.1, '#ffffff', { weight: 'bold' });
        tx(c, 'We\'ll find what fits.', w * 0.08, h * 0.76, h * 0.08, '#d8f2ef', {});
      }
    });
  }
  const monL = () => ltex('mon', 256, 160);
  function monDraw(mode) {
    monL().draw((c, w, h) => {
      c.fillStyle = '#e9edec'; c.fillRect(0, 0, w, h);
      c.fillStyle = BR.tealDark; c.fillRect(0, 0, w, 18);
      tx(c, 'CUSTOMER CARE — CASES', 6, 13, 10, '#ffffff', { weight: 'bold' });
      if (mode === 'ft') {
        c.fillStyle = '#ffffff'; c.fillRect(8, 26, w - 16, h - 36); c.strokeStyle = '#b8c2c0'; c.strokeRect(8, 26, w - 16, h - 36);
        tx(c, 'CASE 118-2231', w / 2, 62, 24, BR.ink, { align: 'center', weight: 'bold', font: FN.mono });
        tx(c, '—', w / 2, 84, 16, '#5a6462', { align: 'center', font: FN.mono });
        tx(c, 'FOLLOW UP:', w / 2, 108, 20, '#3a4442', { align: 'center', weight: 'bold', font: FN.mono });
        c.fillStyle = '#b8261c'; c.fillRect(46, 118, w - 92, 28);
        tx(c, 'TOMORROW', w / 2, 140, 22, '#ffffff', { align: 'center', weight: 'bold', font: FN.mono });
      } else if (mode === 'oc') {
        tx(c, 'ROSTER — NEXT WEEK', 10, 40, 12, BR.ink, { weight: 'bold' });
        ['LUKA   9–5', 'CHLOE  9–5', 'PRIYA 12–8', 'JOSH  12–8', '—'].forEach((s, i) => tx(c, s, 14, 62 + i * 18, 12, '#3a4442', { font: FN.mono }));
      } else {
        tx(c, 'CASE 118-2231', 12, 48, 16, BR.ink, { weight: 'bold', font: FN.mono });
        tx(c, 'STATUS:', 12, 76, 13, '#5a6462', { font: FN.mono });
        c.fillStyle = '#2f9a5a'; c.fillRect(80, 62, 92, 20);
        tx(c, 'CLOSED', 126, 77, 13, '#ffffff', { align: 'center', weight: 'bold', font: FN.mono });
        tx(c, 'Resolved by phone.', 12, 106, 12, '#3a4442', {});
        tx(c, 'Customer visited in person.', 12, 124, 12, '#3a4442', {});
      }
    });
  }
  // the street outside through the glass (a far facade row + sky), painted once
  const cityTex = () => ctex('cityfar', 1024, 256, (x, w, h, r) => {
    const sky = x.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#c9d6de'); sky.addColorStop(1, '#eef0ea');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    let px = 0;
    while (px < w) {
      const bw = 70 + r() * 120, bh = h * (0.45 + r() * 0.45), c = ['#b9b2a6', '#a8aca8', '#c7bca8', '#9ea6a8', '#d2cabb', '#8f9894'][Math.floor(r() * 6)];
      x.fillStyle = c; x.fillRect(px, h - bh, bw, bh);
      x.fillStyle = 'rgba(40,52,58,0.55)';
      for (let yy = h - bh + 12; yy < h - 40; yy += 22) for (let xx = px + 8; xx < px + bw - 14; xx += 18) x.fillRect(xx, yy, 10, 13);
      px += bw + 2;
    }
    x.fillStyle = '#6d6f6a'; x.fillRect(0, h - 26, w, 26);
    age(x, w, h, r, 0.2);
  });
  const matTex = () => ctex('welcome', 256, 96, (x, w, h) => { x.fillStyle = '#0e5f5e'; x.fillRect(0, 0, w, h); tx(x, 'WELCOME IN', w / 2, 62, 34, BR.yellow, { align: 'center', weight: 'bold' }); });
  const backsignTex = () => ctex('backsign', 512, 112, (x, w, h) => { x.fillStyle = '#0e6f6e'; x.fillRect(0, 0, w, h); try { Tex.drawWordmark(x, w * 0.32, h * 0.78, h * 0.62, { color: '#ffcc00' }); } catch (e) { /* brand */ } });
  const storeNameTex = () => ctex('storename', 512, 96, (x, w, h) => { x.fillStyle = '#10403f'; x.fillRect(0, 0, w, h); tx(x, 'STORE 0412 — CITY', w / 2, 60, 34, '#f4f3ee', { align: 'center', weight: 'bold', spacing: 3 }); });
  const drawingTex = () => ctex('kiddraw', 256, 192, (x, w, h, r) => {
    x.fillStyle = '#fbfaf4'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2a8a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, h * 0.8); x.lineTo(w, h * 0.78); x.stroke();
    x.fillStyle = '#f2c12e'; x.beginPath(); x.arc(w * 0.82, h * 0.2, 18, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#1b2a7a'; x.lineWidth = 3;
    for (const [cx, hh] of [[70, 70], [120, 58], [165, 64]]) { x.beginPath(); x.arc(cx, h * 0.8 - hh - 10, 10, 0, Math.PI * 2); x.moveTo(cx, h * 0.8 - hh); x.lineTo(cx, h * 0.8 - 20); x.moveTo(cx - 14, h * 0.8 - hh + 14); x.lineTo(cx + 14, h * 0.8 - hh + 14); x.moveTo(cx, h * 0.8 - 20); x.lineTo(cx - 10, h * 0.8); x.moveTo(cx, h * 0.8 - 20); x.lineTo(cx + 10, h * 0.8); x.stroke(); }
    hand(x, 'MY DAD AT WORK', 20, 34, { size: 22, color: '#c0392b', seed: 3 });
  });
  defineRoom({
    id: 'e_citystore', name: 'THE CITY STORE', area: 'STORE 0412 — CITY', outdoor: false, surface: 'vinyl', ambient: 'store',
    noFog: true, grade: 'dawn',
    env: { ambient: ['#f7f5ef', 2.3], sheets: false, specks: false },
    surfaces: [{ box: [9.6, -4, 18, 0], s: 'carpet' }],
    bounds: [0, -4, 18, 13],
    entries: { counter: [CS.aidan[0], CS.aidan[1], 0], door: [9, 12.2, 180], office: [14.5, -1.2, 180], start: [9, 12.2, 180] },
    cameras: [
      // through the glass: from the footpath outside, the whole floor to the counter and the lit wordmark
      { id: 'e_citystore:street', vol: [0, 4.3, 18, 13], type: 'pan', pos: [9, 2.35, 15.6], target: [9, 1.1, 5.5], fov: 46, pan: { lag: 0.35, yaw: 58, pitch: 42 } },
      // low behind the counter, out over it to the door (the customer's side)
      { id: 'e_citystore:counter', vol: [0, 0, 11, 4.3], type: 'pan', pos: [15.6, 1.35, 1.2], target: [7, 1.0, 3.4], fov: 46, pan: { lag: 0.35, yaw: 55, pitch: 40 } },
      // the east end behind the counter: the office door, the huddle board, from the CCTV corner over the door
      { id: 'e_citystore:cctv', vol: [11, 0, 18, 4.3], type: 'static', pos: [2.6, 3.05, 7.2], target: [15.4, 0.6, 1.4], fov: 'fit' },
      // the back office
      { id: 'e_citystore:office', vol: [9.6, -4, 18, 0], type: 'pan', pos: [9.95, 2.45, -0.3], target: [14.6, 0.8, -2.6], fov: 50, pan: { lag: 0.3, yaw: 66, pitch: 55 } },
    ],
    build(K) {
      const H = CS.H, W = CS.W, D = CS.D;
      const wallM = { color: '#f2f1eb', roughness: 0.92 };
      // ---- shell -----------------------------------------------------------------------------------------------
      K.floor(0, 0, W, D, { tex: 'vinyl_retail', color: '#ebe9e2', roughness: 0.25 });
      K.ceiling(0, 0, W, D, H, { tex: 'ceiling_tile', color: '#fbfbf8' });
      K.wall(-0.15, -0.075, W + 0.15, -0.075, H, wallM, { openings: [{ at: CS.winX + 0.15, w: 2.6, h: 1.25, sill: 0.95, glass: true }, { at: CS.offDoor + 0.15, w: 0.95, h: 2.15 }], skirting: '#10403f' });
      K.wall(-0.075, D, -0.075, -0.15, H, wallM, { skirting: '#10403f' });
      K.wall(W + 0.075, -0.15, W + 0.075, D, H, wallM, { skirting: '#10403f' });
      // the glass shopfront (south) with its door; a teal bulkhead over it
      K.wall(W + 0.15, D + 0.075, -0.15, D + 0.075, H, 'glass', { openings: [{ at: W + 0.15 - CS.door[0], w: 1.9, h: 2.45 }], collideH: H });
      for (let x = 0.1; x <= W; x += 3.0) K.box(x, 0, D + 0.07, 0.07, H, 0.12, { tex: 'metal', color: '#bfc3bd' });
      K.box(W / 2, 2.62, D + 0.075, W + 0.3, H - 2.62, 0.22, { color: '#10403f', roughness: 0.5 });
      K.door({ id: 'e_citystore:front', x: CS.door[0], z: D + 0.075, rot: 0, w: 1.8, h: 2.4, style: 'glass_double', when: () => false, mapMark: false }); // the scenes open it (G.door)
      K.box(CS.door[0], 0, D - 0.7, 2.4, 0.012, 1.3, { tex: 'fabric_knit', color: '#0e5f5e' });
      K.plane(CS.door[0], 0.014, D - 0.7, 1.7, 0.62, matTex(), { rot: [-90, 0, 0] });
      for (const x of [7.3, 10.7]) { K.box(x, 0, D - 0.45, 0.12, 1.5, 0.4, { color: '#c9ccca', roughness: 0.3 }, { collide: true }); K.light('led', x, 1.46, D - 0.45, { color: '#2aff5a', intensity: 1.4 }); }
      // ---- back wall: the lit wordmark, the store name, the clock; the office window and door ------------------------
      K.plane(6.5, 2.2, 0.02, 3.8, 0.8, backsignTex(), { emissive: true, emissiveIntensity: 0.9 });
      K.plane(6.5, 1.55, 0.02, 2.2, 0.4, storeNameTex(), {});
      K.prop('clock', 8.3, 0.0, 0, { time: [9, 0], mount: 2.35, name: 'endcs:clock' });
      K.door({ id: 'e_citystore:office', x: CS.offDoor, z: -0.075, rot: 0, w: 0.9, style: 'wood', color: '#d8d0bc', sign: 'STAFF ONLY', signBack: 'SALES FLOOR' });
      // ---- the counter (two bays), the EFTPOS, the contract printer; staff side shelving ----------------------------
      K.prop('counter', 6.9, CS.cz, 0, { len: 4, printer: false, clutter: false });
      K.prop('counter', 10.9, CS.cz, 0, { len: 4, printer: true, clutter: false });
      // (the counter's own kit: an EFTPOS on each bay, a tablet stand, a low POS screen angled at the staff side)
      for (const x of [6.1, 11.7]) { K.box(x, 1.0, CS.cz - 0.05, 0.09, 0.05, 0.17, { color: '#232628', roughness: 0.4 }, { rot: 15 }); K.box(x, 1.05, CS.cz - 0.02, 0.07, 0.004, 0.06, { color: '#3a8a6a', emissive: '#2a7a5a', emissiveIntensity: 0.6 }, { rot: 15 }); }
      K.box(7.7, 1.0, CS.cz - 0.2, 0.2, 0.02, 0.2, { color: '#2a2d2e' }); K.box(7.7, 1.02, CS.cz - 0.22, 0.03, 0.2, 0.03, { color: '#2a2d2e' });
      K.box(7.7, 1.2, CS.cz - 0.2, 0.26, 0.19, 0.012, { color: '#1b1c1e', roughness: 0.3 }, { rot: 180 });
      K.box(12.6, 1.0, CS.cz - 0.3, 0.36, 0.24, 0.04, { color: '#2a2d2e', roughness: 0.4 }, { rot: 170 });
      K.prop('shelf', 2.2, 0.36, 0, { len: 3.2, h: 2.1, load: 'stock' });
      K.prop('stool', 4.9, 2.2, 20, { variant: 'bar' });
      K.prop('mug', 8.1, CS.cz - 0.2, 30, { y: 1.0, text: 'WORLD\'S OKAYEST MANAGER' });
      K.prop('sticky_note', 12.2, CS.cz - 0.15, 0, { y: 1.0, variant: 'flat', text: 'NBN? ask about their street' });
      // ---- the huddle board (drawn live) -------------------------------------------------------------------------
      {
        const [bx, bz, br] = CS.board;
        const g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = br * D2R; g.name = 'endcs:board';
        const fm = K.mat({ tex: 'metal', color: '#c7ccc9', roughness: 0.4 });
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.95, 0.04), fm); leg.position.set(s * 0.66, 0.975, 0); g.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.6), fm); foot.position.set(s * 0.66, 0.05, 0); g.add(foot);
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), K.mat({ color: '#1b1c1c' })); wheel.rotation.z = Math.PI / 2; wheel.position.set(s * 0.66, 0.035, 0.26); g.add(wheel);
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.98, 0.035), fm); frame.position.set(0, 1.45, 0); g.add(frame);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.9), std(boardL().tex, { roughness: 0.35 })); face.position.set(0, 1.45, 0.019); g.add(face);
        const tray = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.07), fm); tray.position.set(0, 0.97, 0.05); g.add(tray);
        for (const [mx, mc] of [[-0.3, '#1d2f86'], [-0.2, '#b2261e'], [0.25, '#1b1c1c']]) { const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 8), K.mat({ color: mc, roughness: 0.5 })); mk.rotation.z = Math.PI / 2; mk.position.set(mx, 0.995, 0.055); g.add(mk); }
        K.mesh(g, { name: 'endcs:board', collide: [bx - 0.62, bz - 0.35, bx + 0.62, bz + 0.35] });
        if (!END.boardSt) boardDraw({ mode: 'c3' });
      }
      // ---- the leaderboard TV (east wall), posters, the waiting chairs, a queue barrier ----------------------------
      END.lb = K.prop('leaderboard', CS.leader[0], CS.leader[1], -90, { mount: 2.05, w: 1.5, name: 'endcs:lb' });
      {
        // the screen: take it over with the live canvas
        const scr = END.lb; let sm = null;
        scr.traverse((c) => { if (c.isMesh && c.geometry && c.geometry.parameters && Math.abs((c.geometry.parameters.width || 0) - 1.5) < 0.01) sm = c; });
        if (sm) { sm.material = std(lbL().tex, { emissive: true, emissiveIntensity: 1.0, roughness: 0.3 }); sm.userData.kitMerge = false; }
        if (!END.lbMode) { lbDraw('c3'); END.lbMode = 'c3'; }
      }
      for (const [z, t] of [[9.4, 'SWITCH\n& SAVE'], [11.6, 'UNLIMITED\nDATA'], [3.9, 'ASK US\nABOUT NBN']]) K.prop('poster', W - 0.07, z, -90, { style: 'plan', text: t, mount: 1.6 });
      for (let k = 0; k < 3; k++) K.prop('chair', W - 0.7, 8.4 + k * 0.62, -90, { variant: 'waiting' });
      K.prop('plant_pot', W - 0.6, 12.3, 0, { variant: 'fiddle' });
      for (const x of [13.2, 15.6]) K.cyl(x, 0, 5.2, 0.04, 0.95, { tex: 'metal', color: '#c9ccca' }, { collide: true });
      K.box(14.4, 0.85, 5.2, 2.4, 0.06, 0.02, { color: '#10403f' });
      K.sign('PLEASE WAIT HERE\nTO BE SERVED', 13.2, 1.22, 5.25, 0.5, 0.3, { style: 'shop', bg: '#ffcc00', fg: '#10403f' });
      // ---- the floor: demo tables, a feature table, the accessory wall, standees -----------------------------------
      for (const [x, z] of [[4.4, 6.6], [13.6, 7.6], [4.4, 9.6], [13.6, 10.4]]) K.prop('demo_table', x, z, 0, { len: 1.8, n: 6, lit: true, time: '9:41' });
      K.prop('demo_table', 9, 8.2, 90, { len: 1.6, n: 4, lit: true, time: '9:41' });
      for (const z of [4.6, 7.2, 9.8]) K.prop('accessory_wall', 0.35, z, 90, { len: 2.5 });
      for (const [x, i] of [[6.8, 0], [11.2, 1]]) {
        K.box(x, 0, D - 1.3, 0.5, 0.04, 0.32, { tex: 'metal', color: '#3a3f3d' });
        K.box(x, 0.04, D - 1.28, 0.62, 1.62, 0.03, { color: '#10403f', roughness: 0.5 }, { collide: true });
        K.plane(x, 0.9, D - 1.26, 0.58, 1.5, ctex('standee' + i, 128, 336, (c, w, h) => {
          c.fillStyle = i ? BR.teal : '#10403f'; c.fillRect(0, 0, w, h);
          try { Tex.drawWordmark(c, w * 0.12, h * 0.12, h * 0.05, { color: BR.yellow }); } catch (e) { /* brand */ }
          tx(c, i ? 'WORKS' : 'ASK', w / 2, h * 0.45, 30, '#ffffff', { align: 'center', weight: '900', font: FN.heavy });
          tx(c, i ? 'WHERE' : 'US', w / 2, h * 0.55, 30, '#ffffff', { align: 'center', weight: '900', font: FN.heavy });
          tx(c, i ? 'YOU ARE' : 'ANYTHING', w / 2, h * 0.65, i ? 26 : 22, BR.yellow, { align: 'center', weight: '900', font: FN.heavy });
        }), {});
      }
      // ---- the lights: an ordinary bright store --------------------------------------------------------------------
      for (const [x, z, real] of [[4.5, 3, false], [9, 3, true], [13.5, 3, false], [4.5, 7.5, true], [13.5, 7.5, true], [9, 7.5, false], [4.5, 11.5, false], [9, 11.5, true], [13.5, 11.5, false]]) {
        K.light('fluoro', x, H - 0.02, z, { len: 1.2, diffuser: true, intensity: 11, distance: 11, real });
      }
      K.light('point', 6.5, 2.4, 1.2, { color: '#e8f4ef', intensity: 3, distance: 6 });
      // (downlights over the counter: faces across it read)
      K.light('point', 9.2, 2.75, 4.3, { color: '#fff3e2', intensity: 5, distance: 6 });
      K.light('point', 14.6, 2.75, 5.2, { color: '#fff3e2', intensity: 4, distance: 6 });
      // ---- the back office (x 9.6–18, z −4–0): the desk and its monitor facing the window, the roster, the hoodies --
      const OW = CS.offW;
      K.floor(OW, -4, W, 0, { tex: 'carpet', color: '#676c70' });
      K.ceiling(OW, -4, W, 0, 2.7, 'ceiling_tile');
      K.wall(OW - 0.075, 0, OW - 0.075, -4.15, 2.7, wallM, { skirting: true });
      K.wall(OW - 0.1, -4.075, W + 0.15, -4.075, 2.7, wallM, { skirting: true });
      K.prop('desk', CS.mon[0], -3.55, 0, { clutter: false, w: 1.6 });
      // (the chair pushed back from the desk: whoever sat here got up in a hurry)
      K.prop('office_chair', CS.mon[0] + 1.35, -2.35, 130, {});
      K.prop('monitor', CS.mon[0], CS.mon[1], 0, { y: 0.745, content: 'desktop', name: 'endcs:mon', w: 0.62 });
      {
        let sm = null;
        const mon = K.build.objs['endcs:mon'];
        if (mon) mon.traverse((c) => { if (c.isMesh && c.geometry && c.geometry.parameters && Math.abs((c.geometry.parameters.width || 0) - 0.62) < 0.01) sm = c; });
        if (sm) { sm.material = std(monL().tex, { emissive: true, emissiveIntensity: 0.95, roughness: 0.3 }); sm.userData.kitMerge = false; }
        if (!END.monMode) { monDraw('c3'); END.monMode = 'c3'; }
      }
      K.prop('desk_phone', CS.mon[0] - 0.55, -3.4, 10, { y: 0.745 });
      K.prop('mug', CS.mon[0] + 0.5, -3.45, -20, { y: 0.745, text: 'LUKA' });
      K.box(CS.mon[0] + 0.3, 0.745, -3.3, 0.3, 0.01, 0.22, { color: '#f4f2ea', roughness: 0.9 }, { rot: 8 });
      K.prop('filing_cabinet', 17.5, -3.6, 0, {});
      K.prop('roster', W - 0.08, -1.8, -90, { title: 'ROSTER — STORE 0412', mount: 1.55 });
      K.box(OW + 0.1, 1.55, -1.6, 0.05, 0.05, 0.6, { tex: 'wood', color: '#6a5436' });
      K.box(OW + 0.18, 0.95, -1.8, 0.12, 0.6, 0.34, { color: '#393a3d', roughness: 0.9 });
      K.box(OW + 0.18, 1.0, -1.4, 0.12, 0.55, 0.32, { color: '#2d3a52', roughness: 0.9 });
      K.plane(15.1, 1.45, -4.0, 0.42, 0.32, drawingTex(), {});
      K.prop('poster', 14.2, -4.0, 0, { style: 'notice', text: 'CALL BACKS\nWITHIN 24 HRS', mount: 1.55 });
      K.light('fluoro', 14.5, 2.68, -2, { len: 1.2, diffuser: true, intensity: 6, distance: 7 });
      // ---- outside the glass: the footpath, the road, the facades opposite, bright overcast morning ----------------
      K.box(W / 2, -0.06, 15, 40, 0.06, 4, { tex: 'footpath', color: '#c9c6bd' }, { shadow: false });
      K.box(W / 2, -0.08, 20.5, 40, 0.06, 7, { tex: 'bitumen', color: '#5d5f5c' }, { shadow: false });
      K.box(W / 2, -0.06, 25, 40, 0.06, 2, { tex: 'footpath', color: '#c9c6bd' }, { shadow: false });
      for (const x of [-1, 5, 13, 19]) K.plane(x, 0.0 - 0.045, 20.5, 2.4, 0.14, { color: '#e8e6dc', roughness: 0.6 }, { rot: [-90, 0, 0] });
      [['bank', 'CITY BANK'], ['pharmacy', 'CHEMIST'], ['shop', 'NEWS & LOTTO'], ['shop', 'SUSHI TRAIN']].forEach(([v, n], i) => K.prop('shopfront', -4 + i * 8.4, 26.2, 180, { w: 8, name: n, variant: v, lit: true, awning: true }));
      K.plane(W / 2, 11, 27.5, 60, 22, cityTex(), { rotY: 180, emissive: true, emissiveIntensity: 0.85 });
      K.prop('bus_shelter', 14.5, 23.6, 180, { route: '412', stop: 'CITY' });
      K.prop('car', 3.5, 18.8, 90, { color: '#8a9aa6' });
      for (const x of [-1.5, 20]) K.prop('bollard', x, 13.6, 0, { variant: 'galv' });
      K.prop('bin', 16.5, 13.8, 0, { variant: 'street' });
      K.prop('streetlight', 1, 16.8, 0, { lit: false });
      K.light('point', W / 2, 3.2, 17.5, { color: '#f6f4ec', intensity: 9, distance: 22 });
      K.light('point', 4, 4.5, 23, { color: '#f6f4ec', intensity: 7, distance: 16 });
      K.mark('end:cs:aidan', CS.aidan[0], 0, CS.aidan[1], 0);
      K.mark('end:cs:cust', CS.cust[0], 0, CS.cust[1], 180);
      // ---- examine (the room is a cutscene set; these read if anyone walks it in the debug build) -----------------
      K.examine(9, 1.2, CS.cz, ['My counter. Bay two.', 'The EFTPOS still has the sticker I stuck on it. "Ask first."'], { id: 'endcs:counter', r: 1.6 });
      K.examine(CS.board[0], 1.4, CS.board[1] + 0.4, 'The huddle board. Today\'s number. [beat] And what\'s under it.', { id: 'endcs:board', r: 1.5 });
      K.examine(CS.leader[0] - 0.3, 1.8, CS.leader[1], 'The leaderboard. I used to check it before I checked my messages.', { id: 'endcs:lb', r: 1.6 });
      K.examine(4.4, 1.1, 6.6, 'Every demo phone says the same time. Somebody sets them every morning.', { id: 'endcs:demo', r: 1.5 });
      K.examine(0.5, 1.4, 7.2, 'Chargers, cases, screen protectors. We sell a lot of screen protectors.', { id: 'endcs:acc', r: 1.5 });
      K.examine(8.1, 1.1, CS.cz - 0.2, '"World\'s Okayest Manager." Luka\'s mug. He brings it out here so people ask about it.', { id: 'endcs:mug', r: 1.2 });
      K.examine(CS.mon[0], 1.1, CS.mon[1] + 0.4, 'The case system. [beat] Every callback has a name on it.', { id: 'endcs:mon', r: 1.4 });
      K.examine(15.1, 1.45, -3.8, 'A kid\'s drawing. "My dad at work." Somebody\'s kept it up there for years.', { id: 'endcs:draw', r: 1.2 });
      K.examine(9, 1.4, D - 0.4, 'The door chime. Two notes. [beat] You stop hearing it after a week.', { id: 'endcs:chime', r: 1.6 });
    },
  });

  // ---- people only the endings use --------------------------------------------------------------------------------
  try {
    // the young customer in "Ask First": a uni student with a cracked phone
    Rig.definePreset('end_young', {
      height: 1.66, build: 'slight', gender: 'f', age: 19, skin: '#d9ab8c', seed: 191,
      hair: { style: 'bun', color: '#5a3a22' },
      face: { eyes: '#4a3526', brows: '#3a2a1c', browThick: 0.8, freckles: 0.5, bags: 0.1 },
      top: { kind: 'tee', color: '#e8e2d4' }, layers: [{ kind: 'jacket', color: '#6b7f5a', open: true }],
      pants: { kind: 'jeans', color: '#3b4659' }, shoes: { kind: 'sneaker', color: '#e8e4da', sole: '#c9c3b6' },
      style: { armSwing: 0.8, narrow: 0.6 }, habits: ['fidget', 'shift_weight'], habitEvery: [5, 10],
    }, { hold: { R: ['phone', { screen: false, case: '#c9a6d8', pose: 'phone_look' }] } });
    // a relief store leader (when Luka never found the road out)
    Rig.definePreset('end_leader', {
      height: 1.72, build: 'average', gender: 'f', age: 38, skin: '#c69070', seed: 381,
      hair: { style: 'bob', color: '#2b221b' }, face: { eyes: '#3b2a1e', brows: '#2a2019', bags: 0.4 },
      top: { kind: 'polo', color: '#15817e', logo: true }, pants: { kind: 'slacks', color: '#1e1f22' }, shoes: { kind: 'flat', color: '#161616', sole: '#0c0c0c' },
      lanyard: { color: '#161618', card: 'SAM', role: 'STORE LEADER', keys: true }, habits: ['nod'], habitEvery: [8, 14],
    }, { hold: { R: 'pen' } });
  } catch (e) { console.error('[END] presets', e); }

  // the ending cutscenes run after Chapter 8's Outage: every set is in the ordinary world
  function fogWorld(G) { if (S.outage) G.setOutage(false); try { Render.setAmbient(null); } catch (e) { /* render */ } }
  function storeProps(G, mode) {
    const clk = G.obj('endcs:clock');
    if (clk && clk.userData.setTime) { if (mode === 'ft') clk.userData.setTime(9, 0); else if (mode === 'oc') clk.userData.setTime(8, 52); else clk.userData.setTime(14, 40); }
  }
  // the leader at the board writes: marker in hand, the arm reaching to the board as the ink appears
  async function writeOnBoard(G, L, key, dur, st) {
    const [bx, bz, br] = CS.board;
    const r = br * D2R, fx = Math.sin(r), fz = Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
    // board-space (u across, v up) → world, on the face
    const at = (u, v) => [bx + rx * u + fx * 0.03, 1.45 + v, bz + rz * u + fz * 0.03];
    const path = key === 'num' ? [[-0.5, 0.05], [-0.38, 0.0], [-0.44, -0.05]] : [[-0.52, -0.2], [-0.35, -0.22], [-0.2, -0.2]];
    let t = 0, i = -1;
    await G.loop((dt) => {
      t += dt;
      const k = clamp(t / dur);
      if (key === 'num') st.numK = k; else st[key] = k;
      boardDraw(st);
      const seg = Math.min(path.length - 1, Math.floor(k * path.length));
      if (seg !== i && L && L.raw) { i = seg; const p = path[seg]; q(L.gesture('reach', { hand: 'R', target: at(p[0] + Math.sin(t * 9) * 0.02, p[1]), hold: true, dur: 0.5 })); }
      return k >= 1;
    });
    if (key === 'num') st.numK = 1; else st[key] = 1;
    boardDraw(st);
  }

  // =================================================================================================================
  // POST-CREDITS "Ask First" (E-C3) — the city store, weeks later, bright and ordinary
  // =================================================================================================================
  defineCutscene('E-C3', async (G) => {
    await G.fade(1, 0);
    stopFx(0.2);
    fogWorld(G);
    const st = { mode: 'c3', day: 'Thursday', num: '14', numK: 0, ask: 0, names: ['LUKA', flag('chloeSaved') ? 'CHLOE' : 'MEL', 'PRIYA', 'JOSH', 'AIDAN'] };
    boardDraw(st); lbDraw('c3'); END.lbMode = 'c3'; monDraw('c3'); END.monMode = 'c3';
    await G.goto('e_citystore', 'counter', { fade: false, sound: 'none' });
    cleanPost(G, 'none');
    G.ambient('store', 0);
    storeProps(G, 'c3');
    aidanOff(G);
    // Aidan behind the counter, standing up straight: the uniform polo, no hoodie, rested
    const A = G.actor('c3aidan', 'aidan', { rig: { layers: [], posture: 1, habits: [], idleLife: false, face: { bags: 0.12, stubble: 0.08 }, hold: {} } });
    A.place(CS.aidan[0], CS.aidan[1], 0); A.pose('idle');
    if (A.raw) { A.raw.posture = 1; A.raw.idleLife = false; }
    const C = G.actor('c3cust', 'end_young');
    C.place(CS.cust[0] + 0.05, CS.cust[1], 180); C.pose('idle');
    // the floor: Chloe laughing with a customer, no tablet (if she was saved); the leader at the huddle board
    const saved = flag('chloeSaved');
    const Ch = saved ? G.actor('c3chloe', 'chloe', { rig: { hold: {}, face: { redRim: 0.15 }, habits: ['smooth_uniform'], habitEvery: [9, 16] } }) : null;
    const CC = G.actor('c3chcust', 'customer', { rig: { seed: 7, detail: 'low' } });
    if (Ch) { Ch.place(12.35, 7.3, 75); Ch.pose('idle'); Ch.expr('smile'); }
    CC.place(saved ? 13.3 : 13.2, saved ? 6.85 : 7.0, saved ? -105 : 200); CC.pose('idle');
    const lukaOK = flag('lukaSaved');
    const L = lukaOK ? G.actor('c3luka', 'luka', { rig: { hold: { R: 'pen', L: ['coffee', {}] } } }) : G.actor('c3leader', 'end_leader');
    {
      const [bx, bz, br] = CS.board, r = br * D2R;
      L.place(bx + Math.cos(r) * -0.95 + Math.sin(r) * 0.55, bz - Math.sin(r) * -0.95 + Math.cos(r) * 0.55, br - 60); L.pose('idle');
      if (L.raw) L.raw.idleLife = false;
    }
    // ---- 1. over the customer's shoulder: Aidan behind the counter, the lit wordmark behind him -------------------
    A.look(C); A.eyes('at', C); A.expr('neutral');
    C.look(A);
    G.cam({ pos: [9.95, 1.66, 6.6], target: [9.1, 1.42, 2.4], fov: 34, to: { pos: [9.9, 1.64, 6.35], fov: 32 }, dur: 9 });
    await G.fade(0, 1.4);
    await G.wait(1.6);
    try { C.raw.talk(2.6); } catch (e) { /* rig */ }
    q(C.gesture('shrug'));
    await G.say('CUSTOMER', 'I just need a new phone. Whatever\'s best.');
    await G.wait(0.4);
    // close on Aidan: he doesn't reach for the demo phones; he asks
    G.cam({ ...faceShot(A, 1.3, 28, -0.05, -0.62, -0.1), dur: 0 });
    A.expr('smile');
    await G.wait(0.5);
    await G.say('AIDAN', 'Sure. [beat] Before we look at anything, tell me what you need it to work with.');
    q(A.gesture('nod'));
    await G.wait(0.3);
    // her answer starts (we don't need to hear it): she lifts her cracked phone to show him
    G.cam({ pos: [7.7, 1.55, 5.55], target: [9.3, 1.35, 3.7], fov: 36 });
    C.expr('smile');
    try { C.raw.talk(3.2); } catch (e) { /* rig */ }
    q(C.gesture('raise_phone'));
    await G.wait(1.2);
    A.expr('smile'); q(A.gesture('nod'));
    await G.wait(1.6);
    // ---- 2. wide: the door chime; Chloe laughing in the background; the leader at the huddle board -----------------
    const E = G.actor('c3enter', 'customer', { rig: { seed: 23, detail: 'low' } });
    E.place(CS.door[0] + 0.3, CS.D + 0.9, 180); E.pose('idle');
    G.cam({ pos: [8.2, 1.74, 12.35], target: [13.7, 1.3, 4.3], fov: 46, to: { pos: [8.35, 1.72, 12.05], fov: 44 }, dur: 12 });
    try { G.door('e_citystore:front').open(); } catch (e) { /* door */ }
    G.sfx('chime', { vol: 0.9 });
    q(E.walkTo([[CS.door[0] + 0.25, CS.D - 0.6], [11.3, 10.5], [12.6, 9.4]], { speed: 1.1 }));
    await G.wait(0.8);
    if (Ch) { Ch.expr('grin'); q(Ch.gesture('laugh')); try { Ch.raw.talk(1.4); } catch (e) { /* rig */ } }
    q(CC.gesture('laugh', { small: true }));
    await G.wait(1.4);
    try { G.door('e_citystore:front').close(); } catch (e) { /* door */ }
    L.look([CS.board[0], 1.5, CS.board[1]]);
    await L.turn([CS.board[0], CS.board[1]], 0.6);
    await G.wait(0.8);
    // over the leader's shoulder: today's number, then underneath it
    {
      const [bx, bz, br] = CS.board, r = br * D2R, fx = Math.sin(r), fz = Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
      G.cam({ pos: [bx + fx * 1.9 + rx * 0.35, 1.62, bz + fz * 1.9 + rz * 0.35], target: [bx - rx * 0.2, 1.42, bz - rz * 0.2], fov: 34, to: { pos: [bx + fx * 1.7 + rx * 0.3, 1.6, bz + fz * 1.7 + rz * 0.3], fov: 31 }, dur: 9 });
    }
    await G.wait(0.6);
    G.sfx('scribble', { dur: 1.2, vol: 0.5 });
    await writeOnBoard(G, L, 'num', 1.3, st);
    await G.wait(0.7);
    G.sfx('scribble', { dur: 1.6, vol: 0.5 });
    await writeOnBoard(G, L, 'ask', 1.9, st);
    if (L.raw) L.raw.finishGestures();
    await G.wait(0.9);
    // the board, square on: the day's number, and under it
    {
      const [bx, bz, br] = CS.board, r = br * D2R, fx = Math.sin(r), fz = Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
      G.cam({ pos: [bx + fx * 1.3 - rx * 0.25, 1.53, bz + fz * 1.3 - rz * 0.25], target: [bx - rx * 0.25, 1.52, bz - rz * 0.25], fov: 36, to: { pos: [bx + fx * 1.15 - rx * 0.25, 1.53, bz + fz * 1.15 - rz * 0.25], fov: 35 }, dur: 5 });
    }
    await G.wait(3.4);
    await G.fade(1, 1.8);
    // (state: none — the store is only ever shown)
    st.numK = 1; st.ask = 1; boardDraw(st);
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // ENDING "Follow Up Tomorrow" (E-FT) — the city store at 9:00am, bright. No fate cards follow it.
  // =================================================================================================================
  defineCutscene('E-FT', async (G) => {
    await G.fade(1, 1.0);
    stopFx(0.3);
    try { G.stopMusic(1.5); } catch (e) { /* audio */ }
    fogWorld(G);
    const st = { mode: 'ft', day: 'Monday', num: '31', numK: 1, ask: 0, names: ['AIDAN', 'CHLOE', 'PRIYA', 'JOSH', 'LUKA'] };
    boardDraw(st); lbDraw('ft'); END.lbMode = 'ft'; monDraw('ft'); END.monMode = 'ft';
    await G.goto('e_citystore', 'counter', { fade: false, sound: 'none' });
    cleanPost(G, 'hospital');
    G.post({ exposure: 1.04 });
    G.ambient('store', 0);
    storeProps(G, 'ft');
    aidanOff(G);
    const P = G.actor('ftaidan', 'aidan_perfect', { rig: { habits: [], idleLife: false } });
    P.place(CS.aidan[0], CS.aidan[1], 0); P.pose('stand_still'); P.expr('smile'); P.eyes('ahead');
    if (P.raw) P.raw.idleLife = false;
    // ---- 1. 9:00am, from the CCTV corner: the empty bright floor, Aidan perfectly still behind the counter ---------
    G.cam({ pos: [17.2, 3.02, 12.55], target: [9.2, 1.0, 3.0], fov: 46, to: { pos: [17.1, 3.0, 12.4], fov: 45 }, dur: 8 });
    await G.fade(0, 0.8);
    await G.wait(2.6);
    // the leaderboard TV
    G.cam({ pos: [15.2, 2.02, 6.5], target: [CS.leader[0], 2.05, CS.leader[1]], fov: 34, to: { pos: [15.8, 2.04, 6.45], fov: 30 }, dur: 5 });
    await G.wait(2.8);
    // ---- 2. the door chime: an old man walks in, confused, holding an old flip phone ------------------------------
    const O = G.actor('ftold', 'old_man');
    O.place(CS.door[0] + 0.1, CS.D + 0.8, 180); O.pose('idle'); O.expr('tired');
    G.cam({ pos: [9.85, 1.78, 1.35], target: [9.0, 1.3, 11.5], fov: 40 });
    await G.wait(0.3);
    try { G.door('e_citystore:front').open(); } catch (e) { /* door */ }
    G.sfx('chime', { vol: 0.9 });
    await G.wait(0.4);
    // (he looks around as he comes in: the tables, the walls of phones, the smiling young man at the counter)
    q((async () => { O.look([6, 1.8, 7]); await G.wait(1.8); O.look([13, 1.6, 7]); await G.wait(1.6); O.look(P); })());
    await O.walkTo([[CS.door[0] + 0.05, CS.D - 1.1], [CS.door[0] + 0.25, 9.8]], { speed: 0.75 });
    try { G.door('e_citystore:front').close(); } catch (e) { /* door */ }
    O.look(P);
    await G.wait(0.6);
    // at the counter
    O.place(CS.cust[0] + 0.05, CS.cust[1] + 0.1, 180); O.pose('idle'); O.look(P); O.eyes('at', P);
    P.look(O);
    G.cam({ pos: [8.35, 1.78, 1.45], target: [9.25, 1.42, 4.7], fov: 32 });
    await G.wait(0.8);
    q(O.gesture('raise_phone'));
    await G.say('OLD MAN', 'Hello, love. They said my phone\'s going to stop working. [beat] I don\'t really know what I need.');
    O.eyes('down');
    await G.wait(0.8);
    // ---- 3. close on Aidan: the smile widens, and keeps widening, past anything natural --------------------------
    const f0 = faceShot(P, 1.05, 28, -0.05, 0.05), f1 = faceShot(P, 0.8, 24, -0.04, 0.03);
    G.cam({ ...f0, to: { pos: f1.pos, target: f1.target, fov: f1.fov }, dur: 7 });
    P.eyes('at', O);
    await G.wait(0.9);
    P.expr('grin');
    await G.wait(0.9);
    P.expr('smile_huge');
    {
      // (the face keeps going: a hair wider, a hair wider, the eyes never changing)
      const hb = P.raw && P.raw.bones && P.raw.bones.head;
      let t = 0;
      await G.loop((dt) => { t += dt; if (hb) hb.scale.set(1 + 0.07 * ease(clamp(t / 2.4)), 1 - 0.015 * ease(clamp(t / 2.4)), 1); return t >= 1.2; });
    }
    try { P.raw.talk(1.6); } catch (e) { /* rig */ }
    await G.say('AIDAN', 'Hi there! [beat] That\'ll all be fine.');
    {
      const hb = P.raw && P.raw.bones && P.raw.bones.head;
      let t = 1.2;
      await G.loop((dt) => { t += dt; if (hb) hb.scale.set(1 + 0.07 * ease(clamp(t / 2.4)), 1 - 0.015 * ease(clamp(t / 2.4)), 1); return t >= 2.6; });
    }
    // ---- 4. over his shoulder to the back office monitor: CASE 118-2231 — FOLLOW UP: TOMORROW. The door chime. ----
    G.cam({ pos: [8.85, 1.62, 4.9], target: [CS.mon[0], 1.07, CS.mon[1]], fov: 22, to: { pos: [8.95, 1.6, 4.6], fov: 13 }, dur: 6.5 });
    G.music('tomorrow', { clipped: true, vol: 0.55 });
    await G.wait(3.6);
    G.sfx('chime', { vol: 0.9 });
    await G.wait(0.9);
    await G.fade(1, 0);
    try { G.stopMusic(0.3); } catch (e) { /* audio */ }
    await G.wait(1.2);
    // (state: none)
  }, { letterbox: true, skippable: true });


  // =================================================================================================================
  // e_dawn — the real Signal Hill at dawn. No fog: mist lifting off an ordinary small town of gum trees and tin roofs.
  // The District Hospital on its shelf of flat ground (x −16…16, z −24…−12) with the car park in front (walkable:
  // x −18…18, z −11…6), Ring Road below it, the town stepping down the hill to the south, the summit and the mast behind.
  // =================================================================================================================
  const DW = { hosp: [0, -18], car: [3.2, -6.6], mast: [22, -112] };
  function dawnH(x, z) {
    let h = 0;
    if (z < -26) h = Math.pow((-26 - z) / 86, 1.25) * 44;
    else if (z > 16) h = -Math.pow((z - 16) / 58, 1.12) * 21;
    h += (z > 16 || z < -26) ? 2.4 * Math.sin(x * 0.045 + z * 0.02) + 1.2 * Math.sin(x * 0.11 - z * 0.07) : 0;
    const shelf = clamp(1 - Math.abs(x) / 150);
    return h * (0.75 + 0.25 * shelf);
  }
  // (the dome covers 0.55π from the zenith: canvas 0 = zenith, 0.91 = the horizon)
  const dawnSkyStops = [[0, '#6d8db0'], [0.45, '#a9bccb'], [0.72, '#dcd2c2'], [0.84, '#f0d3aa'], [0.9, '#f7c996'], [0.95, '#e9c7a2'], [1, '#c8b597']];
  const hospSignTex = () => ctex('hospsign', 1024, 128, (x, w, h) => {
    x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h);
    tx(x, 'SIGNAL HILL DISTRICT HOSPITAL', w / 2, h * 0.68, 54, '#24406a', { align: 'center', weight: 'bold', spacing: 4, maxWidth: w * 0.94 });
  });
  const hTex = () => ctex('hblue', 128, 128, (x, w, h) => { x.fillStyle = '#1d4e9a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.strokeRect(6, 6, w - 12, h - 12); tx(x, 'H', w / 2, h * 0.78, 92, '#ffffff', { align: 'center', weight: 'bold' }); });
  const winBandTex = () => ctex('hospwin', 512, 64, (x, w, h, r) => {
    x.fillStyle = '#d6cbb4'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { const g = x.createLinearGradient(0, 8, 0, h - 8); g.addColorStop(0, '#6f7f86'); g.addColorStop(1, '#3a464c'); x.fillStyle = g; x.fillRect(i * 32 + 4, 8, 24, h - 16); if (r() < 0.2) { x.fillStyle = 'rgba(255,220,160,0.55)'; x.fillRect(i * 32 + 4, 8, 24, h - 16); } }
  }, { wrap: true });
  defineRoom({
    id: 'e_dawn', name: 'SIGNAL HILL AT DAWN', area: 'SIGNAL HILL', outdoor: true, surface: 'bitumen', ambient: 'none',
    noFog: true, grade: 'dawn',
    env: { ambient: ['#f4e2c8', 1.85], sheets: 0, specks: false },
    bounds: [-18, -11, 18, 6],
    entries: { start: [0, 2, 180] },
    cameras: [
      // the car park: from the entrance canopy, down over Luka's car to the road and the town below
      { id: 'e_dawn:canopy', vol: [-18, -11, 0, 6], type: 'pan', pos: [6, 3.6, -11.5], target: [-6, 0.8, 0], fov: 50, pan: { lag: 0.3, yaw: 70, pitch: 45 } },
      { id: 'e_dawn:road', vol: [0, -11, 18, 6], type: 'pan', pos: [-6, 3.6, -11.5], target: [8, 0.8, 0], fov: 50, pan: { lag: 0.3, yaw: 70, pitch: 45 } },
    ],
    build(K) {
      // ---- the land: one displaced terrain over the whole view (visual), the car park and road on the shelf -------
      {
        const geo = new THREE.PlaneGeometry(380, 330, 95, 82);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position, uv = geo.attributes.uv, col = [];
        const cA = new THREE.Color('#b7c08e'), cB = new THREE.Color('#cdc496'), cC = new THREE.Color('#99a673'), tmp = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i) - 30;
          pos.setZ(i, z); pos.setY(i, dawnH(x, z) - 0.12);
          uv.setXY(i, x / 4, z / 4);
          const n = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) * Math.sin(z * 0.09 + x * 0.013);
          tmp.copy(cA).lerp(n > 0.5 ? cB : cC, Math.abs(n - 0.5) * 1.6); col.push(tmp.r, tmp.g, tmp.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: Tex.get('grass'), vertexColors: true, roughness: 0.95 }));
        m.receiveShadow = true; K.mesh(m, { name: 'e_dawn:land' });
      }
      skyDome(K, 'dawn', dawnSkyStops, { r: 150, at: [-32, -6, 40] });
      glow(K, 92, 14, -40, 60, '#ffcf8f', 0.8, { name: 'e_dawn:sun' });
      glow(K, 92, 14, -40, 20, '#fff2d8', 0.9);
      K.floor(-18, -11, 18, 6, { color: '#6c6e69', roughness: 0.92 }, { skirt: false });
      for (const [x, z, r0] of [[-6, -8.5, 0.5], [2.5, -3.2, 0.4], [9, -9, 0.6], [-12, 1.8, 0.45]]) K.plane(x, 0.008, z, r0 * 2, r0 * 1.4, { color: '#4e504c', roughness: 0.6 }, { rot: [-90, 0, x * 7] });
      for (let x = -16.5; x <= 16.6; x += 2.6) { K.plane(x, 0.012, -9.2, 0.1, 3.4, { color: '#e8e6dc', roughness: 0.6 }, { rot: [-90, 0, 0] }); K.plane(x, 0.012, 3.2, 0.1, 3.4, { color: '#e8e6dc', roughness: 0.6 }, { rot: [-90, 0, 0] }); }
      K.box(0, -0.05, 10, 300, 0.05, 8, { color: '#5f615e', roughness: 0.9 }, { shadow: false });
      for (let x = -120; x <= 120; x += 6) K.plane(x, 0.006, 10, 3, 0.12, { color: '#e2dccb', roughness: 0.7 }, { rot: [-90, 0, 0] });
      K.box(0, -0.02, 6.6, 300, 0.1, 1.2, { tex: 'kerb', color: '#b9b5aa' }, { shadow: false });
      K.box(0, -0.02, 14.8, 300, 0.12, 1.6, { tex: 'footpath', color: '#b7b2a6' }, { shadow: false });
      // ---- the hospital: two storeys of cream brick, bands of windows, the entrance canopy and its sign ----------
      const [hx, hz] = DW.hosp;
      const HB = { tex: 'render_cracked', color: '#efe4cc' }, HB2 = { tex: 'render_cracked', color: '#e6dac0' };
      K.box(hx, 0, hz, 32, 7.4, 12, HB);
      K.box(hx, 0, hz + 6.0, 32.1, 0.6, 0.1, { tex: 'brick', color: '#c9a88a' });
      K.box(hx, 7.4, hz, 32.6, 0.5, 12.6, { color: '#c9c1ae', roughness: 0.7 });
      for (const y of [1.2, 4.6]) for (const s of [-1, 1]) K.plane(hx + s * 9.5, y + 0.9, hz + 6.02, 11, 1.4, winBandTex(), {});
      K.box(hx + 22, 0, hz + 1, 12, 4.2, 10, HB2);
      K.box(hx + 22, 4.2, hz + 1, 12.4, 0.35, 10.4, { color: '#c9c1ae', roughness: 0.7 });
      K.plane(hx + 22, 1.9, hz + 6.02, 9, 1.2, winBandTex(), {});
      K.sign('EMERGENCY', hx + 22, 3.5, hz + 6.1, 3.2, 0.5, { style: 'hospital', bg: '#b3261e', fg: '#ffffff' });
      K.box(hx - 22, 0, hz - 2, 12, 4.6, 8, HB2);
      for (const [ax, az] of [[-6, -18.5], [3, -21], [10, -17]]) { K.box(ax, 7.9, az, 2.2, 1.2, 1.6, { tex: 'metal', color: '#9aa09a' }); K.cyl(ax + 0.4, 9.1, az, 0.4, 0.1, { tex: 'metal', color: '#6d726e' }); }
      // the canopy over the entrance, the glass doors, the sign
      K.box(hx, 3.1, hz + 8.4, 9, 0.35, 5, { color: '#e8e4da', roughness: 0.6 });
      for (const [px, pz] of [[-4.2, 10.6], [4.2, 10.6]]) K.cyl(hx + px, 0, hz + pz, 0.14, 3.1, { color: '#e8e4da', roughness: 0.5 });
      // the name stands on the canopy's front edge (on the wall behind it the canopy hid it from every low angle)
      K.box(hx, 3.45, hz + 10.86, 9.1, 1.16, 0.1, { color: '#e8e4da', roughness: 0.6 });
      K.plane(hx, 4.03, hz + 10.92, 8.9, 1.1, hospSignTex(), {});
      // the entrance: sliding glass doors, lit from inside, the foyer beyond
      K.box(hx, 0, hz + 5.95, 4.4, 2.7, 0.1, { color: '#2e3a3e', roughness: 0.2, metalness: 0.3 });
      K.plane(hx, 1.3, hz + 6.02, 4.1, 2.5, { color: '#f4ead2', emissive: '#f4ead2', emissiveIntensity: 0.35, roughness: 0.4 }, {});
      for (const px of [-2.05, 0, 2.05]) K.box(hx + px, 0, hz + 6.05, 0.08, 2.6, 0.08, { tex: 'metal', color: '#b8bcb8' });
      K.box(hx, 2.6, hz + 6.05, 4.4, 0.14, 0.12, { tex: 'metal', color: '#b8bcb8' });
      K.sign('ENTRANCE', hx, 2.95, hz + 6.12, 1.6, 0.26, { style: 'hospital', bg: '#1d4e9a', fg: '#ffffff' });
      K.light('point', hx, 2.8, hz + 8.2, { color: '#ffe8c8', intensity: 3, distance: 8 });
      {
        K.box(-9.5, 0, -10.2, 0.12, 3.4, 0.12, { tex: 'metal', color: '#b8bcb8' });
        K.plane(-9.5, 3.8, -10.13, 0.9, 0.9, hTex(), {});
        K.plane(-9.5, 3.8, -10.27, 0.9, 0.9, hTex(), { rotY: 180 });
      }
      // gardens along the front, gum trees on the shelf and all down the hill
      K.box(hx - 10, 0, -11.2, 12, 0.35, 1.2, { tex: 'brick', color: '#b8906a' }, { collide: true });
      K.box(hx + 10, 0, -11.2, 12, 0.35, 1.2, { tex: 'brick', color: '#b8906a' }, { collide: true });
      for (const [x, z] of [[-14, -11.2], [-7, -11.2], [8, -11.2], [14, -11.2]]) K.prop('shrub', x, z, x * 17, { collide: false });
      const R = U.rng(907);
      const trees = [[-22, -8], [21, -5], [-26, 4], [27, 2], [-30, -20], [34, -26], [-12, -34], [8, -40], [26, -48], [-34, -52], [44, -66], [-18, -72], [2, -86], [-50, -30], [60, -40], [-66, -8], [70, 4]];
      for (let i = 0; i < 26; i++) trees.push([-90 + R() * 180, 22 + R() * 50]);
      trees.forEach(([x, z], i) => K.prop(i % 3 ? 'gum_tree' : 'gum_tree_small', x, z, R() * 360, { y: dawnH(x, z), collide: false }));
      // the town below Ring Road: tin roofs down the hill in loose rows
      const ROOFS = ['#8a8f8a', '#6f3b30', '#4f5a55', '#9a9a92', '#7a4a3a', '#5d6a72'];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
        const x = -76 + i * 18 + (row % 2) * 8 + R() * 5, z = 24 + row * 15 + R() * 4;
        if (Math.abs(x + 44) < 12 && row === 2) continue;
        const kind = R() < 0.4 ? 'cottage' : 'house';
        K.prop(kind, x, z, 180 + (R() - 0.5) * 16, { y: dawnH(x, z) - 0.2, collide: false, lit: R() < 0.15, roof: ROOFS[Math.floor(R() * ROOFS.length)], seed: row * 9 + i });
      }
      // a few beside the hospital on the shelf's edges
      for (const [x, z, r] of [[-36, -4, 90], [-38, 10, 90], [40, -2, -90], [42, 12, -90]]) K.prop('house', x, z, r, { y: dawnH(x, z), collide: false, roof: ROOFS[(x > 0 ? 1 : 3)] });
      // power poles along Ring Road, streetlights still burning on the last of the night
      for (let x = -60; x <= 60; x += 24) K.prop('power_pole', x, 15.6, 0, { span: 24 });
      for (const x of [-20, 0, 20]) K.prop('streetlight', x, 5.9, 180, { lit: true, light: false });
      // Luka's car, parked crooked across two bays by the entrance (he arrived in a hurry)
      K.prop('car', DW.car[0], DW.car[1], 172, { color: '#51606c', variant: 'wagon', plate: 'LUK·018' });
      K.box(DW.car[0] + 0.4, 1.36, DW.car[1] + 1.1, 0.12, 0.004, 0.08, { color: '#f2efe2' }, { rot: 20 });
      K.prop('hatchback', -15.2, -7.8, 180, { color: '#8a8f86' });
      K.prop('bin', 12.6, -10.3, 0, { variant: 'street' });
      K.prop('bench', -3.5, -10.5, 0, {});
      // the summit and the mast (a silhouette at this distance), its red light blinking
      {
        const [mx, mz] = DW.mast, my = dawnH(mx, mz) - 0.5;
        const mm = K.mat({ color: '#3b3e3c', roughness: 0.8 });
        for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.3; K.cyl(mx + Math.cos(a) * 1.6, my, mz + Math.sin(a) * 1.6, 0.18, 44, mm, { r2: 0.07, seg: 5 }); }
        for (let yy = 3; yy < 43; yy += 4) K.box(mx, my + yy, mz, 3.4 - yy * 0.065, 0.12, 0.12, mm, { rot: yy * 13 });
        K.box(mx - 1.2, my + 40, mz, 2.6, 2.2, 2.2, { tex: 'metal', color: '#6d726e' });
        const red = glow(K, mx, my + 44.8, mz, 3.2, '#ff2a1c', 0);
        K.animate((dt, t) => { red.material.opacity = (t % 2.1) < 0.6 ? 0.95 : 0.05; });
      }
      // ---- mist lifting off the roofs and out of the hollows ---------------------------------------------------------
      const mists = [];
      for (const [x, z, w, d, op, rise] of [[-30, 32, 90, 40, 0.55, 0.18], [30, 40, 90, 40, 0.5, 0.2], [-10, 58, 120, 40, 0.6, 0.12], [-70, 20, 60, 50, 0.5, 0.15], [60, 26, 70, 40, 0.45, 0.16], [0, -70, 120, 50, 0.35, 0.22]]) {
        mists.push(mistLayer(K, x, dawnH(x, z) + 2.5, z, w, d, op, { rise, spin: x * 3 }));
      }
      // birds: a loose flock crossing the dawn, and the chorus
      const flock = [];
      for (let i = 0; i < 9; i++) { const s = glow(K, 0, 0, 0, 0.9, '#20242a', 0.9); s.material.blending = THREE.NormalBlending; flock.push({ s, ph: i * 0.7, off: [(i % 3) * 2.2, (i % 2) * 1.4, Math.floor(i / 3) * 1.8] }); }
      const birdSt = {};
      K.animate((dt, t) => {
        for (const m of mists) { const b = m.userData.base; m.position.y = b.y + t * b.rise; m.material.opacity = b.opacity * clamp(1 - t / 26); m.rotation.z += dt * 0.004; }
        const bx = -60 + ((t * 7) % 160), by = 22 + Math.sin(t * 0.4) * 2, bz = 8 - ((t * 2) % 40);
        for (const f of flock) { f.s.position.set(bx + f.off[0], by + f.off[1] + Math.sin(t * 6 + f.ph) * 0.3, bz + f.off[2]); f.s.scale.set(0.9, 0.35 + 0.3 * Math.abs(Math.sin(t * 9 + f.ph)), 1); }
        birdsTick(birdSt, dt, { vol: 0.05, gap: 0.6, spread: 1.6 });
      });
      K.light('spot', 110, 70, -40, { target: [0, 0, -8], angle: 40, penumbra: 0.9, intensity: 4.5, distance: 400, decay: 0, color: '#ffd9a8', name: 'e_dawn:sun' });
      K.mark('end:dawn:car', DW.car[0], 0, DW.car[1], 0);
      K.examine(DW.car[0], 1.2, DW.car[1] - 1.8, ['Luka\'s car. Parked across two bays.', 'There\'s dew on the windscreen. He\'s been here all night.'], { id: 'end:dawn:car', r: 2.2 });
      K.examine(0, 1.4, -11.6, 'The hospital. Just a hospital. Somebody\'s left a light on upstairs.', { id: 'end:dawn:hosp', r: 2.2 });
      K.examine(-9.5, 1.5, -9.8, 'The blue H. I drove past a sign like this every day and never looked at it.', { id: 'end:dawn:h', r: 1.6 });
      K.examine(-3.5, 0.8, -10.1, 'A bench facing the car park. For people waiting for news.', { id: 'end:dawn:bench', r: 1.4 });
      K.examine(0, 1.0, 5.4, ['Tin roofs all the way down the hill. Gum trees. Smoke from a chimney.', 'It\'s just a town.'], { id: 'end:dawn:town', r: 2.4 });
    },
  });

  // =================================================================================================================
  // e_room12_day — Room 12 in morning daylight. x 0–6.4, z 0–4.6; the window on the north wall (the real hill beyond),
  // the bed's head against the west wall, the door in the south wall (x 4.9) onto the ward corridor.
  // =================================================================================================================
  const RD = { W: 6.4, D: 4.6, H: 2.8, bed: [1.45, 2.2], nan: [1.02, 2.2], luke: [0.85, 0.75], chair: [1.45, 3.1], door: [4.9, 4.6], win: [2.9, 3.0] };
  const r12ViewTex = () => ctex('r12view', 1024, 512, (x, w, h, r) => {
    const sky = x.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#9fb8cc'); sky.addColorStop(0.6, '#e2d6c0'); sky.addColorStop(1, '#f2d9b0');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    // the hill to the summit, the mast on top
    x.fillStyle = '#7e8a66'; x.beginPath(); x.moveTo(0, h * 0.62); x.bezierCurveTo(w * 0.25, h * 0.5, w * 0.45, h * 0.22, w * 0.62, h * 0.2); x.bezierCurveTo(w * 0.8, h * 0.22, w * 0.9, h * 0.44, w, h * 0.52); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    x.strokeStyle = '#3b3e3c'; x.lineWidth = 3; x.beginPath(); x.moveTo(w * 0.62, h * 0.21); x.lineTo(w * 0.62, h * 0.04); x.stroke();
    x.lineWidth = 1.5; for (let k = 0; k < 6; k++) { const yy = h * (0.2 - k * 0.028); x.beginPath(); x.moveTo(w * 0.62 - 8 + k, yy); x.lineTo(w * 0.62 + 8 - k, yy - 6); x.stroke(); }
    x.fillStyle = '#d0331f'; x.beginPath(); x.arc(w * 0.62, h * 0.035, 3.5, 0, Math.PI * 2); x.fill();
    // gum trees, the slope, tin roofs catching the sun
    for (let i = 0; i < 70; i++) { const tx0 = r() * w, ty = h * (0.42 + r() * 0.5); x.fillStyle = ['#5d6b4a', '#6f7a55', '#4b5a40'][i % 3]; x.beginPath(); x.ellipse(tx0, ty, 10 + r() * 22, 8 + r() * 16, 0, 0, Math.PI * 2); x.fill(); }
    for (let i = 0; i < 26; i++) { const bx = r() * w, by = h * (0.55 + r() * 0.4), bw = 30 + r() * 40; x.fillStyle = ['#a9aca6', '#8a4a3c', '#6d7a70', '#c2c0b6'][i % 4]; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + bw, by); x.lineTo(bx + bw * 0.8, by - 12); x.lineTo(bx + bw * 0.2, by - 12); x.fill(); x.fillStyle = '#e4dccb'; x.fillRect(bx + 4, by, bw - 8, 14); }
    // mist lying in the hollows
    for (let i = 0; i < 8; i++) { const g = x.createRadialGradient(r() * w, h * (0.6 + r() * 0.3), 0, r() * w, h * 0.75, 200); g.addColorStop(0, 'rgba(250,244,232,0.5)'); g.addColorStop(1, 'rgba(250,244,232,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    age(x, w, h, r, 0.1);
  });
  const r12CardTex = () => ctex('r12card', 128, 160, (x, w, h, r) => { x.fillStyle = '#f4ecd8'; x.fillRect(0, 0, w, h); hand(x, 'Get well', 14, 40, { size: 20, seed: 3 }); hand(x, 'soon Nan', 14, 64, { size: 20, seed: 4 }); hand(x, 'love from', 14, 104, { size: 16, seed: 5 }); hand(x, 'Luke x', 14, 128, { size: 18, seed: 6 }); age(x, w, h, r, 0.2); });
  const r12BoardTex = () => ctex('r12board', 512, 384, (x, w, h) => {
    x.fillStyle = '#f7f7f3'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d4e9a'; x.fillRect(0, 0, w, 44); tx(x, 'ROOM 12', 16, 31, 24, '#ffffff', { weight: 'bold', spacing: 2 });
    tx(x, 'Your nurse today:', 18, 86, 20, '#333', {}); hand(x, 'Jas', 210, 88, { size: 28, color: '#1b3a8a', seed: 9 });
    tx(x, 'Goal:', 18, 140, 20, '#333', {}); hand(x, 'sit out in the chair ✓', 90, 142, { size: 26, color: '#1b3a8a', seed: 10 });
    tx(x, 'Mobility:', 18, 194, 20, '#333', {}); hand(x, '1 assist + frame', 120, 196, { size: 26, color: '#1b3a8a', seed: 11 });
    tx(x, 'Visitors:', 18, 248, 20, '#333', {}); hand(x, 'grandson (Luke)', 120, 250, { size: 26, color: '#1b3a8a', seed: 12 });
    hand(x, 'Good morning!', 250, 330, { size: 32, color: '#b2261e', seed: 13 });
  });
  defineRoom({
    id: 'e_room12_day', name: 'ROOM 12 (MORNING)', area: 'DISTRICT HOSPITAL', outdoor: false, surface: 'lino', ambient: 'hospital',
    noFog: true, grade: 'dawn',
    env: { ambient: ['#f5efe4', 1.9], sheets: false, specks: false },
    bounds: [0, 0, RD.W, RD.D],
    entries: { door: [RD.door[0], 4.1, 0], start: [RD.door[0], 4.1, 0] },
    cameras: [
      // from outside the south wall (cut away): the bed, the chairs, the window full of morning
      { id: 'e_room12_day:door', vol: [2.1, 0, RD.W, RD.D], type: 'static', pos: [3.3, 2.4, 8.9], target: [2.6, 0.8, 1.3], fov: 'fit' },
      // the window corner, back toward the door: the bed in the foreground
      { id: 'e_room12_day:window', vol: [0, 0, 2.1, RD.D], pri: 1, type: 'static', pos: [6.1, 2.45, 0.35], target: [1.1, 0.7, 2.9], fov: 'fit' },
    ],
    build(K) {
      const W = RD.W, D = RD.D, H = RD.H;
      const wm = { color: '#e7e3d2', roughness: 0.9 }, dado = { color: '#9fb4b0', roughness: 0.8 };
      K.floor(0, 0, W, D, { tex: 'lino_hospital', color: '#b9bdb2' });
      K.ceiling(0, 0, W, D, H, { tex: 'ceiling_tile', color: '#f4f4f0' });
      K.wall(-0.08, -0.075, W + 0.08, -0.075, H, wm, { openings: [{ at: RD.win[0] + 0.08, w: RD.win[1], h: 1.6, sill: 0.78, glass: true }], skirting: '#6f8480' });
      K.wall(W + 0.075, -0.08, W + 0.075, D + 0.08, H, wm, { skirting: '#6f8480' });
      K.wall(-0.075, D + 0.08, -0.075, -0.08, H, wm, { skirting: '#6f8480' });
      K.wall(W + 0.08, D + 0.075, -0.08, D + 0.075, H, wm, { both: false, openings: [{ at: W + 0.08 - RD.door[0], w: 1.1, h: 2.15 }], skirting: '#6f8480' });
      K.box(W / 2, 0.9, 0.02, W, 0.06, 0.03, dado);
      K.box(W - 0.02, 0.9, D / 2, 0.03, 0.06, D, dado);
      // the corridor outside the door (seen through it): the far wall with its handrail, the ward light
      K.box(RD.door[0], -0.02, 5.5, 5, 0.02, 1.9, { tex: 'lino_hospital', color: '#b9bdb2' }, { shadow: false });
      K.wall(RD.door[0] + 2.6, 6.45, RD.door[0] - 2.6, 6.45, H, wm, { both: false });
      K.box(RD.door[0], 0.9, 6.4, 5, 0.05, 0.06, { tex: 'metal', color: '#c9cfcc' });
      K.box(RD.door[0], H - 0.02, 5.5, 5, 0.02, 1.9, { tex: 'ceiling_tile', color: '#f4f4f0' }, { shadow: false });
      K.light('fluoro', RD.door[0], H - 0.03, 5.5, { len: 1.2, intensity: 5, distance: 6, real: false });
      // (the door stands open, folded back flat against the corridor wall; just the frame here)
      for (const sx of [-1, 1]) K.box(RD.door[0] + sx * 0.6, 0, D + 0.075, 0.1, 2.2, 0.2, { color: '#8a6a4a', roughness: 0.6 });
      K.box(RD.door[0], 2.15, D + 0.075, 1.3, 0.1, 0.2, { color: '#8a6a4a', roughness: 0.6 });
      K.box(RD.door[0] - 1.15, 0, D + 0.26, 1.05, 2.1, 0.05, { tex: 'wood', color: '#9a7652' });
      K.box(RD.door[0] + 1.35, 1.6, D + 0.2, 0.5, 0.35, 0.02, { color: '#f2efe2', roughness: 0.8 });
      K.plane(RD.door[0] + 1.35, 1.78, D + 0.21, 0.46, 0.3, ctex('r12name', 256, 160, (x, w, h) => { x.fillStyle = '#f2efe2'; x.fillRect(0, 0, w, h); tx(x, 'ROOM 12', w / 2, 50, 34, '#1d4e9a', { align: 'center', weight: 'bold' }); hand(x, 'Mrs —', 40, 118, { size: 30, seed: 2 }); }), { rotY: 180 });
      // the view: the real hill beyond the glass, and the morning light coming through it
      mesh(K, new THREE.PlaneGeometry(26, 13), basic(r12ViewTex()), { pos: [RD.win[0] + 1.5, 1.2, -9.5], name: 'e_room12_day:view' });
      K.light('spot', RD.win[0] + 1.6, 3.4, -2.6, { target: [1.3, 0.6, 2.4], angle: 34, penumbra: 0.7, intensity: 60, distance: 12, decay: 1.2, color: '#ffe0b0', name: 'e_room12_day:sun' });
      K.light('point', 3.4, 2.2, 2.4, { color: '#f7efe2', intensity: 1.6, distance: 7 });
      // venetian blind pulled right up; the privacy curtain on its track, bunched back against the wall
      K.box(RD.win[0], 2.42, 0.08, RD.win[1] + 0.1, 0.12, 0.05, { color: '#e8e6de', roughness: 0.5 });
      K.box(0.2, H - 0.05, 1.6, 0.04, 0.04, 3.0, { tex: 'metal', color: '#c9cfcc' });
      for (let i = 0; i < 4; i++) K.box(0.16 + (i % 2) * 0.05, 0.35, 3.55 + i * 0.1, 0.05, 2.3, 0.1, { color: '#a9c0c8', roughness: 0.95 });
      // the bed: Nan's; the blanket up; the call button on its lead; the overbed table
      K.prop('hospital_bed', RD.bed[0], RD.bed[1], 90, { empty: false, chart: true });
      // her legs under a proper blanket, turned down at the top
      K.box(1.65, 0.6, RD.bed[1], 1.62, 0.24, 0.9, { tex: 'fabric_knit', color: '#a9bccb', roughness: 0.95 }, { uv: 3 });
      K.box(0.93, 0.6, RD.bed[1], 0.16, 0.27, 0.92, { color: '#f2f2ee', roughness: 0.9 });
      // the overbed table swung away to the foot of the bed, breakfast finished
      K.box(2.85, 0, 1.25, 0.06, 0.86, 0.06, { tex: 'metal', color: '#b8bcb8' });
      K.box(2.75, 0.86, 1.35, 0.46, 0.03, 0.9, { color: '#d8d2c4', roughness: 0.5 }, { collide: true });
      K.prop('mug', 2.72, 1.1, 20, { y: 0.89, text: '' });
      K.cyl(2.78, 0.89, 1.6, 0.05, 0.2, { color: '#e8eef0', roughness: 0.1, transparent: true, opacity: 0.55 });
      K.box(2.7, 0.89, 1.35, 0.26, 0.02, 0.2, { color: '#e9e4d6', roughness: 0.6 }, { rot: 12 });
      K.prop('bedside_table', 0.35, 3.25, 90, { items: true });
      K.prop('bedside_phone', 0.4, 3.3, 100, { y: 0.6, text: '' });
      K.prop('iv_stand', 0.45, 1.05, 0, { bag: false });
      // Luke's chair by the window (a vinyl recliner), and the plastic visitor's chair beside the bed
      K.box(RD.luke[0], 0, RD.luke[1], 0.72, 0.44, 0.68, { color: '#5e7a74', roughness: 0.6 }, { rot: 20, collide: true });
      K.box(RD.luke[0] - 0.08, 0.44, RD.luke[1] - 0.26, 0.7, 0.62, 0.16, { color: '#5e7a74', roughness: 0.6 }, { rot: 20 });
      for (const s of [-1, 1]) K.box(RD.luke[0] + s * 0.36 * Math.cos(20 * D2R), 0.44, RD.luke[1] - s * 0.36 * Math.sin(20 * D2R), 0.1, 0.2, 0.62, { color: '#4f6a64', roughness: 0.6 }, { rot: 20 });
      K.prop('chair', RD.chair[0], RD.chair[1], 180, { variant: 'waiting', color: '#6a7a6e' });
      // Luke's things on the sill: his thermos, a servo coffee cup; Nan's crossword book
      K.prop('coffee_cup', 1.7, 0.2, 0, { y: 0.8 });
      K.cyl(1.35, 0.8, 0.18, 0.045, 0.26, { tex: 'metal', color: '#2f5a8a', roughness: 0.4 });
      K.prop('crossword', 4.3, 0.2, 10, { y: 0.8 });
      // fresh flowers now, and the card
      K.cyl(3.9, 0.8, 0.16, 0.07, 0.24, { color: '#b8d0d8', roughness: 0.1, transparent: true, opacity: 0.5 });
      for (let i = 0; i < 7; i++) K.sphere(3.9 + (i % 3 - 1) * 0.05, 1.1 + (i % 2) * 0.04, 0.16 + (i - 3) * 0.02, 0.035, { color: ['#e8c34a', '#d86a6a', '#f2eee2'][i % 3], roughness: 0.9 });
      for (let i = 0; i < 5; i++) K.cyl(3.9 + (i - 2) * 0.02, 1.0, 0.16, 0.004, 0.14, { color: '#4a6a3a' });
      K.box(4.5, 0.8, 0.14, 0.14, 0.18, 0.005, { color: '#f4ecd8', roughness: 0.9 }, { rot: -8 });
      K.plane(4.5, 0.89, 0.147, 0.13, 0.17, r12CardTex(), { rotY: -8 });
      // the wall: whiteboard (a goal ticked), the clock, the TV on its arm, the call light
      K.plane(W - 0.03, 1.6, 2.4, 1.1, 0.82, r12BoardTex(), { rotY: -90 });
      K.prop('clock', 3.4, D, 180, { mount: 2.35, time: [7, 42] });
      K.prop('tv', W, 1.0, -90, { mount: 'wall', w: 0.7, content: 'off' });
      K.box(W - 0.9, 0, 4.2, 0.8, 1.7, 0.5, { tex: 'wood', color: '#b0946a' }, { collide: true });
      K.prop('water_stain', 4.8, 1.2, 0, { surface: 'ceiling', ceil: H });
      K.mark('end:r12:nan', RD.nan[0], 0.58, RD.nan[1], 90);
      // birds outside
      const birdSt = {};
      K.animate((dt) => birdsTick(birdSt, dt, { vol: 0.035, gap: 1.2, spread: 3, pan: 0.5 }));
      // ---- examine ------------------------------------------------------------------------------------------------
      K.examine(RD.win[0], 1.6, 0.3, ['The window. The hill, green all the way up. [beat] The mast on top.', 'No fog. Just a hill.'], { id: 'end:r12:win', r: 1.5 });
      K.examine(W - 0.3, 1.6, 2.4, '"Goal: sit out in the chair." [beat] It\'s ticked.', { id: 'end:r12:board', r: 1.3 });
      K.examine(4.5, 1.0, 0.3, '"Get well soon Nan. Love from Luke." [beat] The flowers are new.', { id: 'end:r12:card', r: 1.2 });
      K.examine(0.4, 0.8, 3.3, 'The beige phone. Just a phone.', { id: 'end:r12:phone', r: 1.0 });
      K.examine(RD.luke[0], 0.9, RD.luke[1], 'Luke. Asleep sitting up. [beat] He hasn\'t gone home either.', { id: 'end:r12:luke', r: 1.2 });
      K.examine(4.3, 1.0, 0.25, 'Her crossword book. Half the clues filled in, in pen.', { id: 'end:r12:cross', r: 1.0 });
    },
  });

  // the new pendant in its box, held in Aidan's hand (the item's model, lid closed until he opens it)
  function END_pendantBox() {
    let obj = null;
    try { obj = ITEMS.new_pendant && ITEMS.new_pendant.model ? ITEMS.new_pendant.model() : null; } catch (e) { obj = null; }
    if (!obj) { obj = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.034, 0.085), new THREE.MeshStandardMaterial({ color: '#f3f3ef' })); b.position.y = 0.017; obj.add(b); }
    let lid = null, pend = null;
    obj.traverse((c) => {
      if (c.isGroup && c !== obj && Math.abs(c.rotation.x + 104 * D2R) < 0.05) lid = c;
      if (c.isGroup && c !== obj && !pend && Math.abs(c.position.x + 0.018) < 0.002 && Math.abs(c.position.y - 0.02) < 0.002) pend = c;
    });
    if (lid) lid.rotation.x = 0;
    return { obj, lid, pend };
  }
  END.pendantBox = END_pendantBox;                     // (tests)

  // =================================================================================================================
  // CUTSCENE E-C2 "Morning"
  // =================================================================================================================
  defineCutscene('E-C2', async (G) => {
    // (E-C1 left the screen white with the Nan motif playing in full: the morning comes up out of the white)
    stopFx(0.2);
    await G.fade(1, 0, '#ffffff');
    fogWorld(G);
    // ---- 1. dawn: the real Signal Hill, no fog; Luka's car outside the District Hospital -------------------------
    await G.goto('e_dawn', 'start', { fade: false, sound: 'none' });
    cleanPost(G, 'dawn');
    G.ambient('none', 0);
    aidanOff(G);
    // (clear air, but the far hill softens into the morning: a thin warm haze, not the fog)
    try { Render.fog.color.set('#e2cfb2'); Render.fog.density = 0.0042; } catch (e) { /* render */ }
    G.cam({ keys: [{ t: 0, pos: [-48, 19, 58], target: [-4, 1.5, -10], fov: 44 }, { t: 11, pos: [-21, 7.5, 27], target: [2.6, 1.2, -8.2], fov: 34 }], ease: 'inOut' });
    await G.fade(0, 3.2, '#ffffff');
    await G.wait(5.8);
    // closer: the car, dew on the glass, the entrance behind it
    G.cam({ pos: [-5.2, 1.35, 4.6], target: [1.6, 2.9, -12.2], fov: 44, to: { pos: [-4.9, 1.34, 4.1], fov: 42 }, dur: 6 });
    await G.wait(3.4);
    await G.fade(1, 1.2);
    // ---- 2. Room 12 in daylight: Nan in bed, Luke asleep in the chair, Aidan in the doorway with a small box -------
    await G.goto('e_room12_day', 'door', { fade: false, sound: 'none' });
    cleanPost(G, 'dawn');
    G.ambient('hospital', 0);
    const N = G.actor('nanday', 'nan_gown', { rig: { habits: [], idleLife: false } });
    N.place(RD.nan[0], RD.nan[1], 90, { y: 0.6 }); N.pose('sit_bed'); N.expr('neutral'); N.eyes('ahead');
    if (N.raw) N.raw.idleLife = false;
    const L = G.actor('lukeday', 'luke', { rig: { habits: [], idleLife: false, hold: { L: ['phone', { case: '#8a6f94', screen: false }] } } });
    L.place(RD.luke[0], RD.luke[1] - 0.05, 160); L.pose('sit', { seat: 0.46 });
    if (L.raw) { L.raw.idleLife = false; L.raw.eyes('closed'); L.raw.lookAt(V3(RD.luke[0] + 0.6, 0.3, RD.luke[1] + 1.2)); }
    const A = aidanOn(G, RD.door[0] - 0.05, 4.3, -40, { expr: 'tired', phone: false });
    if (A.raw) A.raw.posture = Math.max(A.raw.posture || 0, 0.75);
    const PB = END_pendantBox();
    A.hold('L', PB.obj, { pose: 'cup' });                 // (held in front of him, where it reads: the small box)
    PB.obj.position.set(0.0, -0.035, 0.02); PB.obj.rotation.set(0, 0, 90 * D2R);
    // (she looks up at him: a look target lifted a little above his eyes keeps her chin up through the gestures)
    const lookUp = (X, lift = 0.18) => { const h = headOf(X); return [h.x, h.y + lift, h.z]; };
    N.look(lookUp(A, 0.1)); N.eyes('at', A);
    // the wide: from the window corner, Nan in bed on the left, Luke asleep, Aidan framed in the door
    G.cam({ pos: [5.95, 2.05, 0.45], target: [2.6, 1.05, 3.3], fov: 50, to: { pos: [5.8, 2.0, 0.55], fov: 48 }, dur: 9 });
    await G.fade(0, 1.4);
    await G.wait(2.4);
    // Nan, past his shoulder: the morning on her face
    G.cam({ ...ots(A, N, 0.42, 0.3, 0.02, 21, -0.05), to: { fov: 19 }, dur: 5 });
    N.expr('smile');
    await G.wait(0.7);
    await G.say('NAN', 'Oh. [beat] It\'s the lovely young man.');
    // over her shoulder: Aidan in the doorway
    G.cam({ ...ots(N, A, 0.34, -0.26, 0.1, 30, 0.1) });
    A.look(N); A.eyes('at', N);
    await G.wait(0.6);
    await G.say('AIDAN', 'Hi. [beat] Can I sit down?');
    N.expr('smile'); q(N.gesture('nod'));
    await G.wait(0.9);
    // ---- 3. he sits. A long silence. Birds outside. -----------------------------------------------------------------
    G.cam({ pos: [5.9, 1.9, 0.6], target: [2.2, 0.95, 3.0], fov: 44 });
    await A.walkTo([[4.2, 3.9], [RD.chair[0] + 0.45, RD.chair[1] + 0.4]], { speed: 0.9 });
    A.place(RD.chair[0], RD.chair[1] + 0.02, 196);
    A.pose('sit', { seat: 0.46 });
    A.look(N); A.eyes('down');
    N.look(lookUp(A)); N.eyes('at', A);
    await G.wait(0.4);
    // the two of them from the foot of the bed, the window light across the blanket; nobody says anything
    G.cam({ pos: [3.55, 1.32, 3.25], target: [1.2, 1.0, 2.55], fov: 40, to: { pos: [3.45, 1.3, 3.18], fov: 39 }, dur: 7 });
    await G.wait(3.2);
    // his face, over her shoulder
    G.cam({ ...ots(N, A, 0.38, -0.24, 0.06, 27, 0.05) });
    A.eyes('at', N);
    await G.wait(0.8);
    await G.say('AIDAN', 'I need to tell you something. [beat] About your alarm. About me.');
    // the confession: his voice drops under the music; the camera pushes in on Nan's face as she listens
    G.music('nan', { full: true });
    G.duck(0.25, 2.5);
    {
      const a = headOf(A), b = headOf(N), f0 = ots(A, N, 0.5, 0.34, 0.04, 30, -0.04);
      const e = a.clone().lerp(b, 0.5); e.y = b.y + 0.02;
      const d = b.clone().sub(a); d.y = 0; d.normalize();
      G.cam({ ...f0, to: { pos: [e.x - d.z * 0.1, e.y, e.z + d.x * 0.1], target: [b.x, b.y - 0.02, b.z], fov: 24 }, dur: 16 });
    }
    N.expr('neutral');
    const talkT = { t: 0 };
    await G.loop((dt) => {
      talkT.t += dt;
      const t = talkT.t;
      if (A.raw && Math.floor(t * 1.3) !== Math.floor((t - dt) * 1.3) && t < 13) { try { A.raw.talk(0.5 + Math.random() * 0.6); } catch (e) { /* rig */ } }
      if (t > 3 && t < 3.1) N.expr('sad');
      if (t > 6.5 && t < 6.6) N.eyes('down');
      if (t > 8.5 && t < 8.6) { N.eyes('at', A); q(N.gesture('nod')); }
      if (t > 12 && t < 12.1) N.expr('cry');
      // (his hand onto the blanket at the bed's edge, within reach from the chair — a bent arm, not a straight one)
      if (t > 12.6 && t < 12.7) q(A.gesture('reach', { hand: 'R', target: [1.27, 0.88, 2.74], hold: true, dur: 1.2 }));
      return t >= 15;
    });
    // ---- 4. close on hands: her hand rests on his --------------------------------------------------------------------
    G.cam({ pos: [2.12, 1.1, 3.02], target: [1.22, 0.9, 2.66], fov: 30, to: { pos: [2.05, 1.08, 2.98], fov: 28 }, dur: 8 });
    await G.wait(1.0);
    {
      const hp = A.raw && A.raw.bones && A.raw.bones.handR ? wpos(A.raw.bones.handR) : V3(1.2, 0.89, 2.75);
      q(N.gesture('reach', { hand: 'R', target: [hp.x - 0.02, hp.y + 0.05, hp.z - 0.02], hold: true, dur: 1.8 }));
    }
    N.look(lookUp(A, 0.3));
    await G.wait(2.8);
    // her face, past his shoulder
    G.cam({ ...ots(A, N, 0.45, 0.32, 0.03, 28, -0.04) });
    N.expr('sad'); N.eyes('at', A);
    await G.say('NAN', 'You came all this way. [beat] You came back. [beat] Most people don\'t come back, love.');
    N.expr('smile');
    await G.wait(0.8);
    // ---- 5. he opens the box: a new alarm pendant, set up properly; into her hand, her fingers closed round it ------
    if (N.raw) N.raw.finishGestures();
    if (A.raw) A.raw.finishGestures();
    N.look(lookUp(A)); N.eyes('down');
    // (he sets the box on the blanket between them)
    const BX = [1.36, 0.846, 2.47];
    A.hold('L', null);
    PB.obj.position.set(BX[0], BX[1], BX[2]); PB.obj.rotation.set(0, -70 * D2R, 0);
    try { World.build.group.add(PB.obj); } catch (e) { /* room */ }
    A.look(BX); A.eyes('down');
    G.cam({ pos: [1.98, 1.3, 1.98], target: [BX[0], BX[1] + 0.03, BX[2]], fov: 30, to: { pos: [1.9, 1.24, 2.05], fov: 26 }, dur: 7 });
    await G.wait(0.6);
    q(A.gesture('reach', { hand: 'R', target: [BX[0] + 0.02, BX[1] + 0.06, BX[2] + 0.03], dur: 1.4 }));
    await G.wait(0.5);
    {
      let t = 0;
      await G.loop((dt) => { t += dt; if (PB.lid) PB.lid.rotation.x = -104 * D2R * ease(clamp(t / 1.0)); return t >= 1.0; });
      if (PB.lid) PB.lid.rotation.x = -104 * D2R;
    }
    await G.wait(1.6);
    // (he lifts it out and puts it in her hand)
    if (PB.pend) PB.pend.visible = false;
    A.hold('L', 'pendant', { pose: false });
    q(N.gesture('reach', { hand: 'R', target: [1.2, 0.93, 2.6], hold: true, dur: 1.2 }));
    {
      G.cam({ pos: [2.3, 1.04, 2.98], target: [1.18, 0.92, 2.66], fov: 28, to: { fov: 25 }, dur: 6 });
      await G.wait(0.9);
      const np = N.raw && N.raw.bones && N.raw.bones.handR ? wpos(N.raw.bones.handR) : V3(1.2, 0.93, 2.6);
      q(A.gesture('reach', { hand: 'L', target: [np.x + 0.03, np.y + 0.05, np.z + 0.03], hold: true, dur: 1.1 }));
      await G.wait(1.2);
      A.hold('L', null);
      N.hold('R', 'pendant', { pose: false });
      q(A.gesture('reach', { hand: 'L', target: [np.x + 0.06, np.y + 0.07, np.z + 0.05], hold: true, dur: 1.0 }));
      q(A.gesture('reach', { hand: 'R', target: [np.x + 0.02, np.y - 0.03, np.z + 0.04], hold: true, dur: 1.0 }));
    }
    await G.wait(1.6);
    G.cam({ ...ots(N, A, 0.4, -0.26, 0.05, 27, 0.05) });
    A.look(N); A.expr('cry'); A.eyes('at', N);
    await G.say('AIDAN', 'This one works. I checked. [beat] I checked three times.');
    q(A.gesture('laugh', { small: true }));
    await G.wait(1.4);
    // ---- 6. two-shot: "I never asked your name." She smiles and opens her mouth to answer. CUT TO BLACK. -----------
    if (A.raw) A.raw.finishGestures();
    if (N.raw) N.raw.finishGestures();
    N.pose('sit_bed');
    A.expr('sad'); A.eyes('at', N);
    N.expr('smile'); N.eyes('at', A); N.look(lookUp(A, 0.05));
    G.cam({ pos: [3.35, 1.3, 1.75], target: [1.25, 1.02, 2.72], fov: 38, to: { pos: [3.2, 1.28, 1.82], fov: 36 }, dur: 8 });
    await G.wait(1.2);
    await G.say('AIDAN', 'I never asked your name.');
    await G.wait(0.5);
    N.expr('smile');
    try { N.raw.talk(3); } catch (e) { /* rig */ }
    await G.wait(0.35);
    // CUT TO BLACK. Silence. The title: SIGNAL HILL.
    await G.fade(1, 0);
    G.stopMusic(0);
    G.ambient('none', 0);
    G.duck(0, 0.1);
    await G.wait(2.2);
    await G.title('SIGNAL HILL', { fadeIn: 2.2, dur: 3.2, fadeOut: 2.2 });
    await G.wait(1.0);
    // (state: none — but the scene gives Aidan's body back as it found it)
    try { const pa = Player.actor; if (pa && pa.held && pa.held.R) { pa.held.R.visible = true; pa.armPose('R', 'phone'); } } catch (e) { /* rig */ }
    A.hold('L', null);
    if (A.raw) A.raw.finishGestures();
  }, { letterbox: true, skippable: true });


  // =================================================================================================================
  // e_highway — very high above the highway at dawn: one car on a long curve through paddocks and gum trees, mist
  // lying in the hollows. The road's centreline: z = HW.z(x). (A small walkable pad at the start for the room check.)
  // =================================================================================================================
  const HW = { z: (x) => 14 * Math.sin(x / 70) + 4 * Math.sin(x / 23), y: (x, z) => 0, x0: -175, x1: 175 };
  function hwH(x, z) { const d = Math.abs(z - HW.z(x)); return d < 6 ? -0.05 : (d - 6) * 0.08 * (1 + 0.6 * Math.sin(x * 0.03 + z * 0.02)) + 3 * Math.sin(x * 0.02) * Math.cos(z * 0.025) * clamp((d - 6) / 30); }
  // a ribbon along the road's curve between two lateral offsets (a, b), at height y (+ terrain-free)
  function hwRibbon(a, b, y, step = 3) {
    const pos = [], idx = [], uv = [];
    let n = 0;
    for (let x = HW.x0; x <= HW.x1 + 0.01; x += step) {
      const z = HW.z(x), dz = (HW.z(x + 0.5) - HW.z(x - 0.5)), L = Math.hypot(1, dz), nx = -dz / L, nz = 1 / L;
      pos.push(x + nx * a, y, z + nz * a, x + nx * b, y, z + nz * b); uv.push(x / 4, 0, x / 4, 1);
      if (n) { const k = n * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  defineRoom({
    id: 'e_highway', name: 'THE HIGHWAY', area: 'THE HIGHWAY', outdoor: true, surface: 'bitumen', ambient: 'wind',
    noFog: true, grade: 'dawn',
    env: { ambient: ['#f2e2c8', 2.1], sheets: 0, specks: false },
    bounds: [-4, -4, 4, 4],
    entries: { start: [0, 0, 90] },
    cameras: [
      { id: 'e_highway:high', vol: [-4, -4, 4, 4], type: 'pan', pos: [-2, 60, 30], target: [0, 0, 0], fov: 40, pan: { lag: 0.3, yaw: 40, pitch: 40 } },
    ],
    build(K) {
      K.floor(-4, -4, 4, 4, { color: '#5d5f5b', roughness: 0.92 }, { skirt: false });
      // the land: paddocks rolling away either side of the road, darker gullies
      {
        const geo = new THREE.PlaneGeometry(380, 300, 95, 75); geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position, uv = geo.attributes.uv, col = [], c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i), h = hwH(x, z);
          pos.setY(i, h - 0.08); uv.setXY(i, x / 5, z / 5);
          const pad = (Math.floor((x + 400) / 55) + Math.floor((z + 400) / 45)) % 3;
          c.set(['#b5c486', '#cfc592', '#a2b67a'][pad]);
          c.multiplyScalar(0.92 + 0.14 * Math.sin(x * 0.05) * Math.cos(z * 0.07));
          col.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        mesh(K, geo, new THREE.MeshStandardMaterial({ map: Tex.get('grass'), vertexColors: true, roughness: 0.95 }), { name: 'e_highway:land' });
      }
      skyDome(K, 'dawnhw', dawnSkyStops, { r: 175, at: [0, -20, 0] });
      glow(K, 140, 12, -40, 55, '#ffcf8f', 0.8);
      // the highway: bitumen, gravel shoulders, the centre dashes and edge lines
      mesh(K, hwRibbon(-6, 6, -0.03), { tex: 'gravel', color: '#9a9282' }, { name: 'e_highway:shoulder' });
      mesh(K, hwRibbon(-3.9, 3.9, 0.0), { color: '#56585a', roughness: 0.9 }, { name: 'e_highway:road' });
      mesh(K, hwRibbon(-3.55, -3.4, 0.012, 3), { color: '#e8e4d8', roughness: 0.6 }, {});
      mesh(K, hwRibbon(3.4, 3.55, 0.012, 3), { color: '#e8e4d8', roughness: 0.6 }, {});
      for (let x = HW.x0; x < HW.x1; x += 9) { const z = HW.z(x), dz = HW.z(x + 0.5) - HW.z(x - 0.5); K.box(x, 0.005, z, 3, 0.012, 0.13, { color: '#efe9d8', roughness: 0.6 }, { rot: -Math.atan2(dz, 1) / D2R, shadow: false }); }
      // fence lines, power poles, gum trees in clumps, a farmhouse and its dam, sheep
      const R = U.rng(4411);
      for (let x = HW.x0 + 8; x < HW.x1; x += 30) { const z = HW.z(x); K.prop('power_pole', x, z - 9, 0, { span: 30, y: hwH(x, z - 9) }); }
      for (let x = HW.x0; x < HW.x1; x += 6) for (const off of [-11, 11]) { const z = HW.z(x) + off; K.box(x, hwH(x, z), z, 0.1, 1.1, 0.1, { tex: 'wood', color: '#6e6250' }, { shadow: false }); }
      mesh(K, hwRibbon(-11.02, -10.98, 0.95, 6), { color: '#8a8a82', roughness: 0.6 }, {});
      mesh(K, hwRibbon(10.98, 11.02, 0.95, 6), { color: '#8a8a82', roughness: 0.6 }, {});
      for (let i = 0; i < 70; i++) {
        const cx = HW.x0 + R() * (HW.x1 - HW.x0), side = R() < 0.5 ? -1 : 1, cz = HW.z(cx) + side * (16 + R() * 70);
        const n = 1 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) { const x = cx + (R() - 0.5) * 12, z = cz + (R() - 0.5) * 10; K.prop(R() < 0.6 ? 'gum_tree' : 'gum_tree_small', x, z, R() * 360, { y: hwH(x, z), collide: false }); }
      }
      K.prop('house', 38, HW.z(38) - 42, 20, { y: hwH(38, HW.z(38) - 42), collide: false, roof: '#8a8f8a' });
      K.box(26, hwH(26, HW.z(26) - 58) - 0.05, HW.z(26) - 58, 16, 0.06, 11, { color: '#6a7c80', roughness: 0.15, metalness: 0.3 }, { shadow: false });
      for (let i = 0; i < 14; i++) { const x = 60 + R() * 40, z = HW.z(60) + 30 + R() * 30; K.sphere(x, hwH(x, z) + 0.45, z, 0.45, { color: '#e8e4d8', roughness: 0.95 }, { scale: [1.4, 0.8, 0.9] }); }
      // mist in the hollows, lifting
      const mists = [];
      for (const [x, z, w, d, op] of [[-60, 50, 90, 50, 0.55], [40, -60, 110, 60, 0.5], [110, 40, 90, 50, 0.5], [-120, -40, 90, 60, 0.5], [0, 90, 120, 40, 0.45]]) mists.push(mistLayer(K, x, hwH(x, z) + 2, z, w, d, op, { rise: 0.12, spin: x }));
      K.animate((dt, t) => { for (const m of mists) { const b = m.userData.base; m.position.y = b.y + t * b.rise; m.material.opacity = b.opacity * clamp(1 - t / 30); } });
      // the car (live: it drives) with its headlights on
      END.hwCar = K.prop('hatchback', 0, HW.z(0) - 1.8, 90, { name: 'e_highway:car', headlights: true });
      K.light('spot', 150, 60, -30, { target: [0, 0, 0], angle: 45, penumbra: 0.9, intensity: 4.2, distance: 400, decay: 0, color: '#ffd9a8' });
      K.examine(0, 1.0, 0, 'The highway. The city\'s that way. [beat] Three hours.', { id: 'end:hw:road', r: 3 });
    },
  });
  // drive the highway car along the left lane toward −x at `speed` m/s; returns its position
  function hwCarAt(x) {
    const z = HW.z(x) - 1.8, dz = HW.z(x + 0.5) - HW.z(x - 0.5);
    return { x, z, yaw: Math.atan2(-1, -dz) };
  }

  // =================================================================================================================
  // e_redlight — a city intersection, a grey bright morning; Aidan's hatchback stopped at the red light (a car
  // interior built here: the camera sits inside it). The car faces +x, the driver on the right (+z), at the stop line.
  // =================================================================================================================
  const RL = { car: [0, -1.8], seatX: -0.08, drvZ: 0.36, psgZ: -0.36, cushion: 0.44, roof: 1.42, belt: 0.92, zin: 0.66 };
  function END_carInterior(K, cx, cz) {
    const P = (x, y, z) => [cx + x, y, cz + z];
    const TRIM = { color: '#2a2d30', roughness: 0.75 }, TRIM2 = { color: '#3a3e42', roughness: 0.7 }, FAB = { tex: 'fabric_knit', color: '#4a4f55', roughness: 0.95 };
    const PAINT = { color: '#5b6b70', roughness: 0.38, metalness: 0.35 };
    const bx = (x, y, z, sx, sy, sz, m, o = {}) => K.box(...P(x, y, z), sx, sy, sz, m, o);
    const R0 = RL.roof, BL = RL.belt, ZI = RL.zin;
    bx(-0.3, 0.12, 0, 2.6, 0.1, ZI * 2, { tex: 'carpet', color: '#2b2d30' });
    for (const sz of [RL.drvZ, RL.psgZ]) {
      bx(RL.seatX, 0.3, sz, 0.52, 0.14, 0.5, FAB);
      bx(RL.seatX - 0.33, 0.44, sz, 0.12, 0.66, 0.5, FAB, { rot: 0 });
      bx(RL.seatX - 0.4, 1.12, sz, 0.1, 0.18, 0.26, FAB);
    }
    bx(-1.0, 0.3, 0, 0.5, 0.14, ZI * 2 - 0.08, FAB);
    bx(-1.26, 0.44, 0, 0.12, 0.6, ZI * 2 - 0.08, FAB);
    // the dash, the binnacle, the centre stack with its little screen, the wheel
    bx(0.82, 0.57, 0, 0.32, 0.3, ZI * 2, TRIM);
    bx(0.76, 0.87, 0, 0.42, 0.06, ZI * 2, TRIM2);
    bx(0.62, 0.9, RL.drvZ, 0.16, 0.1, 0.4, TRIM);
    bx(0.64, 0.5, 0, 0.1, 0.3, 0.26, TRIM2);
    bx(0.6, 0.72, 0, 0.012, 0.08, 0.14, { color: '#1c6f68', emissive: '#1c6f68', emissiveIntensity: 0.6 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.016, 8, 28), K.mat({ color: '#18191a', roughness: 0.55 }));
    wheel.position.set(...P(0.44, 0.93, RL.drvZ)); wheel.rotation.set(0, Math.PI / 2, 0); wheel.rotateX(-0.42);
    K.mesh(wheel, {});
    bx(0.5, 0.88, RL.drvZ, 0.24, 0.05, 0.05, TRIM, { rot: 0 });
    // the body: sills, door cards, pillars, the roof and its lining, the windscreen and the side glass
    const glass = { color: '#a8bdb9', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.14 };
    for (const s of [-1, 1]) {
      const zi = s * ZI;
      bx(-0.2, 0.2, s * (ZI + 0.1), 3.3, 0.35, 0.06, PAINT);
      bx(-0.2, 0.3, zi + s * 0.03, 2.5, 0.6, 0.04, { tex: 'fabric_knit', color: '#54585c', roughness: 0.9 });
      bx(0.3, 0.66, zi - s * 0.02, 0.5, 0.05, 0.08, TRIM);
      bx(-0.25, BL, zi + s * 0.02, 0.1, R0 - BL, 0.07, TRIM);
      bx(-1.4, BL, zi + s * 0.02, 0.14, R0 - BL, 0.07, TRIM);
      K.box(...P(0.66, BL, zi + s * 0.02), 0.07, R0 - BL, 0.07, TRIM, { rot: 0 });
      K.plane(...P(0.2, (BL + R0) / 2, zi + s * 0.05), 0.9, R0 - BL - 0.04, glass, { rotY: 0, double: true });
      K.plane(...P(-0.85, (BL + R0) / 2, zi + s * 0.05), 1.05, R0 - BL - 0.04, glass, { rotY: 0, double: true });
      K.box(...P(0.92, BL, s * (ZI + 0.22)), 0.12, 0.1, 0.16, PAINT);
    }
    bx(-0.5, R0, 0, 2.0, 0.05, ZI * 2 + 0.16, PAINT);
    bx(-0.5, R0 - 0.03, 0, 1.9, 0.03, ZI * 2, { tex: 'fabric_knit', color: '#8d8f88', roughness: 0.95 });
    K.plane(...P(0.67, (BL + R0) / 2 + 0.02, 0), 0.62, ZI * 2, glass, { rot: [0, -90, -58], double: true });
    K.plane(...P(-1.36, (BL + R0) / 2, 0), 0.5, ZI * 2, glass, { rot: [0, 90, 10], double: true });
    bx(1.45, 0.3, 0, 0.9, 0.5, ZI * 2 + 0.2, PAINT);
    // the rear-view mirror on its stem (its glass faces the seats: it catches the daylight — without the stem and the
    // glass it read as a black bar floating in the windscreen)
    bx(0.4, R0 - 0.16, 0, 0.04, 0.06, 0.24, { color: '#18191a' });
    bx(0.42, R0 - 0.105, 0, 0.02, 0.08, 0.025, TRIM);
    K.plane(...P(0.378, R0 - 0.13, 0), 0.22, 0.045, { color: '#b9c4c6', roughness: 0.15, metalness: 0.5 }, { rotY: -90 });
    K.cyl(...P(0.38, R0 - 0.36, 0.02), 0.0015, 0.2, '#d8d4c8');
    // his things: the servo coffee in the cup holder, receipts on the dash, the P plate
    K.prop('coffee_cup', ...[cx + 0.18, cz], 0, { y: 0.52 });
    K.plane(...P(0.86, 0.905, -0.2), 0.08, 0.18, 'receipt', { rot: [-80, 12, 0] });
  }
  defineRoom({
    id: 'e_redlight', name: 'THE RED LIGHT', area: 'THE CITY', outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.012, color: '#c7cbc8' }, grade: 'none',
    env: { ambient: ['#e6e9e6', 2.2], sheets: 0, specks: false },
    bounds: [-6, -5.5, 6, -0.5],
    entries: { seat: [RL.car[0] + RL.seatX, RL.car[1] + RL.drvZ, 90], start: [-4, -3.5, 90] },
    cameras: [
      { id: 'e_redlight:kerb', vol: [-6, -5.5, 6, -0.5], type: 'pan', pos: [2.5, 2.4, -9.6], target: [0, 0.8, -3], fov: 46, pan: { lag: 0.3, yaw: 60, pitch: 40 } },
    ],
    build(K) {
      // the road (two lanes each way, along x), the cross street ahead, footpaths, the stop line, the crossing
      K.floor(-6, -5.5, 6, -0.5, { color: '#5b5d5a', roughness: 0.9 }, { skirt: false });
      K.box(0, -0.06, 0, 120, 0.05, 14, { color: '#595b58', roughness: 0.9 }, { shadow: false });
      K.box(10, -0.055, 0, 12, 0.05, 90, { color: '#5b5d5a', roughness: 0.9 }, { shadow: false });
      for (const s of [-1, 1]) K.box(0, 0, s * 9.5, 120, 0.14, 5, { tex: 'footpath', color: '#b9b5aa' }, { shadow: false });
      for (const s of [-1, 1]) K.box(10 + s * 9.5, 0.001, 0, 5, 0.14, 90, { tex: 'footpath', color: '#b9b5aa' }, { shadow: false });
      K.box(2.4, 0.0, -3.5, 0.4, 0.012, 7, { color: '#f0ece0', roughness: 0.6 }, { shadow: false });
      for (let k = 0; k < 7; k++) K.box(3.6, 0.0, -6.2 + k * 1.8, 1.8, 0.012, 0.8, { color: '#f0ece0', roughness: 0.6 }, { shadow: false });
      for (let x = -50; x < 3; x += 6) K.box(x, 0.0, 0, 3, 0.012, 0.12, { color: '#f0ece0', roughness: 0.6 }, { shadow: false });
      for (let x = -50; x < 3; x += 6) for (const z of [-3.5, 3.5]) K.box(x, 0.0, z, 3, 0.012, 0.1, { color: '#e2ddd0', roughness: 0.6 }, { shadow: false });
      // the traffic lights: the near-left corner and across the intersection (a head facing back at the traffic)
      END.rl = [K.prop('traffic_light', 4.6, -7.3, -90, { mode: 'red', name: 'e_redlight:tl1', light: false }), K.prop('traffic_light', 16.2, -7.3, -90, { mode: 'red', name: 'e_redlight:tl2', light: false }), K.prop('traffic_light', 16.2, 7.3, -90, { mode: 'red', name: 'e_redlight:tl3', light: false }), K.prop('traffic_light', 4.8, 0.2, -90, { mode: 'red', name: 'e_redlight:tl4', light: false, glow: 0 })];
      K.box(4.8, 0, 0.2, 1.2, 0.16, 3.2, { tex: 'kerb', color: '#c9c4b8' }, { shadow: false });
      // the lamp glows on the signal ahead (the lenses alone are small from the driver's seat; its own halos are off)
      glow(K, 4.56, 3.1, 0.2, 0.9, '#ff3322', 0.9, { name: 'e_redlight:red' });
      const gg = glow(K, 4.56, 2.44, 0.2, 0.9, '#3dff9a', 0.85, { name: 'e_redlight:green' }); gg.visible = false;
      // the stand-in phone for the typing insert (his own is small in his hand; this one fills the frame)
      {
        const L = ltex('rlphone', 256, 512);
        const g = new THREE.Group(); g.name = 'e_redlight:phone';
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.15, 0.009), K.mat({ color: '#1e1f22', roughness: 0.35, metalness: 0.25 }));
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.139), new THREE.MeshBasicMaterial({ map: L.tex, toneMapped: false }));
        sc.position.z = 0.0048; g.add(body); g.add(sc);
        g.position.set(RL.car[0] + 0.2, 0.86, RL.car[1] + RL.drvZ + 0.02); g.rotation.set(-0.95, Math.PI / 2, 0, 'YXZ');
        g.visible = false;
        K.mesh(g, { name: 'e_redlight:phone' });
      }
      // shopfronts both sides, awnings, a tram-stop shelter, parked cars, a delivery truck at the kerb
      const names = [['CAFE', 'shop'], ['BANK', 'bank'], ['PHARMACY', 'pharmacy'], ['DRY CLEANING', 'shop'], ['NEWS', 'newsagent'], ['FOR LEASE', 'vacant']];
      for (let i = 0; i < 7; i++) { const [n, v] = names[i % names.length]; K.prop('shopfront', -34 + i * 8, -12.1, 0, { w: 7.8, name: n, variant: v, lit: true }); K.prop('shopfront', -34 + i * 8 + 4, 12.1, 180, { w: 7.8, name: names[(i + 3) % names.length][0], variant: names[(i + 3) % names.length][1], lit: true }); }
      for (let i = 0; i < 3; i++) { K.prop('shopfront', 22 + i * 8, -12.1, 0, { w: 7.8, name: names[(i + 1) % names.length][0], variant: names[(i + 1) % names.length][1] }); }
      K.box(10, 0, -32, 30, 14, 20, { tex: 'render_cracked', color: '#b9b2a4' });
      K.box(10, 0, 32, 30, 18, 20, { tex: 'render_cracked', color: '#a9aaa4' });
      for (let y = 4; y < 17; y += 3.2) for (let x = -2; x < 22; x += 3) K.plane(x, y, 21.95, 1.6, 1.8, { color: '#3a464c', roughness: 0.2, metalness: 0.3 }, { rotY: 180 });
      K.prop('car', -12, -5.4, 90, { color: '#8a2a24' });
      K.prop('car', -20, -5.4, 90, { color: '#d8d6ce' });
      K.prop('car', 26, 5.6, -90, { color: '#2a3a52' });
      K.prop('car', -7, 1.8, -90, { color: '#6a6e72' });
      K.prop('bus_shelter', -26, -9.4, 0, { route: '96', stop: 'CITY' });
      for (const x of [-18, -2, 20]) K.prop('streetlight', x, -7.6, 0, { lit: false });
      K.prop('bin', -9.5, -7.6, 0, { variant: 'street' });
      K.prop('bollard', 6.9, -7.3, 0, {}); K.prop('bollard', 6.9, 7.3, 0, {});
      K.plane(10, 16, -60, 140, 40, cityTex(), { emissive: true, emissiveIntensity: 0.8 });
      K.plane(-60, 16, 0, 140, 40, cityTex(), { rotY: 90, emissive: true, emissiveIntensity: 0.8 });
      K.plane(10, 16, 60, 140, 40, cityTex(), { rotY: 180, emissive: true, emissiveIntensity: 0.8 });
      K.plane(80, 16, 0, 140, 40, cityTex(), { rotY: -90, emissive: true, emissiveIntensity: 0.8 });
      // Aidan's hatchback, from the inside
      END_carInterior(K, RL.car[0], RL.car[1]);
      K.light('point', 6, 6, -4, { color: '#eef0ec', intensity: 8, distance: 30 });
      K.light('point', -8, 6, 4, { color: '#eef0ec', intensity: 6, distance: 30 });
      K.examine(-4, 1.0, -3.5, 'Peak hour. Everyone going somewhere.', { id: 'end:rl:road', r: 2 });
    },
  });

  // the insert phone on p1_car's passenger seat (the Prologue's stand-in phone, moved), drawn by Phone.drawScreen
  function carPhone(G) {
    const box = G.obj('p1:iphone'), scr = G.obj('p1:iscreen');
    if (!box || !scr) return null;
    const x = RL.seatX + 0.02, y = RL.cushion + 0.004, z = RL.psgZ + 0.08;
    box.position.set(x, y, z); scr.position.set(x, y + 0.0101, z);
    const map = scr.material && scr.material.map;
    return { box, scr, map, x, y, z, draw() { if (!map || !map.image) return; try { Phone.drawScreen(map.image.getContext('2d'), map.image.width, map.image.height); map.needsUpdate = true; } catch (e) { /* phone */ } } };
  }
  // a camera on Aidan's own phone (in his right hand), close: the typed message readable
  function phoneShot(dist = 0.2, fov = 30, lift = 0.012) {
    const ph = Player.actor && Player.actor.held && Player.actor.held.R;
    if (!ph) return null;
    ph.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), qq = new THREE.Quaternion();
    ph.getWorldPosition(p); ph.getWorldQuaternion(qq);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(qq), up = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
    const c = p.clone().addScaledVector(n, dist).addScaledVector(up, lift);
    return { pos: [c.x, c.y, c.z], target: [p.x + up.x * lift, p.y + up.y * lift, p.z + up.z * lift], fov };
  }

  // =================================================================================================================
  // ENDING "Out of Coverage" (E-OC) — after E-OC0 (the call rings out; "The number you have called is not connected.")
  // =================================================================================================================
  const RESIGN = 'Hi Luka, I\'m resigning effective immediately. Sorry.';
  defineCutscene('E-OC', async (G) => {
    await G.fade(1, 1.4);
    stopFx(0.3);
    fogWorld(G);
    // ---- 1. Aidan climbing down the mast in thinning fog -------------------------------------------------------------
    S.done['once:c8:mastIn'] = true;                                 // (he's been up here: no first-time thought)
    await G.goto('c8_mast', 'base', { fade: false, sound: 'none' });
    cleanPost(G, 'fog');
    await G.frame();
    try { for (const e of [...(Enemies.list || [])]) if (e && !e.removed) e.remove(); } catch (e) { /* enemies */ }
    const A = aidanOn(G, 1.0, 2.12, 180, { expr: 'tired' });
    A.place(1.0, 2.12, 180, { y: 15 }); A.pose('climb');
    try { Render.fog.color.set('#b7bcb6'); Render.fog.density = 0.014; } catch (e) { /* render */ }
    G.cam({ pos: [5.2, 16.2, 7.2], target: [1.0, 15.6, 2.1], fov: 40 });
    await G.fade(0, 1.6);
    {
      let t = 0;
      await G.loop((dt) => {
        t += dt;
        const y = 15 - t * 0.85;
        A.raw.root.position.y = y;
        try { Render.fog.density = lerp(0.014, 0.009, clamp(t / 7)); } catch (e) { /* render */ }
        try { Cam.scripted({ pos: [5.2 - t * 0.05, y + 1.4, 7.2 + t * 0.04], target: [1.0, y + 0.8, 2.1], fov: 40 }); } catch (e) { /* cam */ }
        return t >= 7;
      });
    }
    await G.fade(1, 1.0);
    // ---- 2. the Lookout. His car starts first try. ---------------------------------------------------------------------
    S.flags.p0_carDead = false;                                       // (built with its lamps live, then dead again)
    await G.goto('p2_lookout', 'car', { fade: false, sound: 'none' });
    S.flags.p0_carDead = true;
    cleanPost(G, 'fog');
    try { Render.fog.color.set('#b9bcb4'); Render.fog.density = 0.032; } catch (e) { /* render */ }
    G.ambient('wind', 0);
    A.place(22.05, 4.68, 90, { y: 0.03 }); A.pose('sit', { seat: 0.42, blend: 0 });
    if (A.raw) { A.raw.lookAt(null); A.raw.eyes('ahead'); A.raw.expr('flat'); }
    const car = G.obj('p2_car');
    G.cam({ pos: [16.9, 0.55, 13.3], target: [22.6, 1.0, 4.1], fov: 38 });
    await G.fade(0, 1.2);
    await G.wait(1.4);
    const eng = END_engine({ start: true, vol: 0.28 });
    await G.wait(0.8);
    if (car && car.userData.setHeadlights) car.userData.setHeadlights(true);
    try { G.light('p2:head').on(true); } catch (e) { /* light */ }
    await G.wait(2.2);
    // (he pulls out onto the highway and away)
    {
      let t = 0;
      const x0 = car ? car.position.x : 22, z0 = car ? car.position.z : 4.3, ax = A.raw.root.position.x, az = A.raw.root.position.z;
      const hl = (() => { try { return G.light('p2:head'); } catch (e) { return null; } })();
      await G.loop((dt) => {
        t += dt;
        const k = clamp(t / 5), s = k * k * 22, dz = 4.6 * U.smooth(clamp(t / 3));
        const yaw = Math.PI / 2 - 0.35 * Math.sin(Math.PI * clamp(t / 3)) ;
        if (car) { car.position.x = x0 + s; car.position.z = z0 + dz; car.rotation.y = yaw; }
        if (A.raw) { A.raw.root.position.x = ax + s; A.raw.root.position.z = az + dz; A.raw.root.rotation.y = yaw; }
        if (hl && hl.set) hl.set({ pos: [x0 + 2.05 + s, 0.72, z0 + dz], target: [x0 + 14 + s, 0.1, z0 + dz + 2] });
        return t >= 5;
      });
    }
    eng.stop(1.2);
    await G.fade(1, 0.8);
    // ---- 3. very high above the highway at dawn. A single car. --------------------------------------------------------
    await G.goto('e_highway', 'start', { fade: false, sound: 'none' });
    cleanPost(G, 'dawn');
    try { Render.fog.color.set('#e0cfb4'); Render.fog.density = 0.004; } catch (e) { /* render */ }
    aidanOff(G);
    G.ambient('wind', 0);
    {
      const hc = G.obj('e_highway:car') || END.hwCar;
      let x = 60;
      const put = () => { const c = hwCarAt(x); if (hc) { hc.position.set(c.x, 0, c.z); hc.rotation.y = c.yaw; } return c; };
      let c = put();
      G.cam({ pos: [c.x + 48, 62, c.z + 52], target: [c.x - 14, 0, c.z - 6], fov: 40 });
      await G.fade(0, 1.4);
      await G.loop((dt) => {
        x -= dt * 12;
        c = put();
        try { Cam.scripted({ pos: [c.x + 48 - (60 - x) * 0.3, 62, c.z + 52], target: [c.x - 14, 0, c.z - 6], fov: 40 }); } catch (e) { /* cam */ }
        return x <= -24;
      });
    }
    await G.fade(1, 1.0);
    // ---- 4. inside the car: his phone on the passenger seat; signal returns and the notifications flood in ---------------
    S.taken = S.taken || {}; S.taken['p2_lookout:modem'] = true;    // (the satchel went back with the modem long ago)
    await G.goto('p1_car', 'seat', { fade: false, sound: 'none' });
    cleanPost(G, 'dawn');
    try { Render.fog.color.set('#e2ddd0'); Render.fog.density = 0.06; Render.setAmbient('#efe6d6', 1.35); } catch (e) { /* render */ }
    G.ambient('none', 0);
    A.show(); A.place(RL.seatX, RL.drvZ, 90, { y: 0.02 }); A.pose('sit', { seat: 0.42, blend: 0 });
    if (A.raw) { A.raw.idleLife = false; A.raw.expr('flat'); A.raw.eyes('ahead'); try { if (A.raw.held && A.raw.held.R) A.raw.held.R.visible = false; } catch (e) { /* rig */ } }
    q(A.gesture('reach', { hand: 'L', target: [0.46, 1.0, RL.drvZ - 0.14], hold: true, dur: 0.1 }));
    q(A.gesture('reach', { hand: 'R', target: [0.46, 1.0, RL.drvZ + 0.14], hold: true, dur: 0.1 }));
    const road = END_engine({ road: true, vol: 0.22 });
    const CP = carPhone(G);
    const glowL = Render.allocLight('point', { color: '#48c9bc', intensity: 0.0, distance: 0.9, pos: CP ? [CP.x, CP.y + 0.15, CP.z] : [0, 0.6, -0.3], pin: true });
    END.carGlow = glowL;
    const disp = (o) => { try { Phone.display(o); } catch (e) { /* phone */ } if (CP) CP.draw(); };
    disp({ title: '', lines: [], bars: 'noservice' });
    const cpos = CP ? [CP.x, CP.y, CP.z] : [RL.seatX, RL.cushion, RL.psgZ];
    G.cam({ pos: [cpos[0] + 0.22, cpos[1] + 0.36, cpos[2] + 0.02], target: [cpos[0], cpos[1], cpos[2] - 0.01], fov: 32, to: { pos: [cpos[0] + 0.2, cpos[1] + 0.33, cpos[2] + 0.02], fov: 30 }, dur: 9 });
    G.shake(0.012, 12);
    await G.fade(0, 1.0);
    await G.wait(1.4);
    const flood = ['MISSED CALL — LUKA', 'MISSED CALL — LUKA', 'VOICEMAIL — LUKA', 'MISSED CALL — UNKNOWN', 'MISSED CALL — LUKA', 'VOICEMAIL — LUKA', 'MISSED CALL — STORE 0412', 'MISSED CALL — +61 4••• •••', 'VOICEMAIL — UNKNOWN', 'MISSED CALL — LUKA'];
    for (let b = 1; b <= 4; b++) { disp({ title: '', lines: [], bars: b }); glowL.set({ intensity: 0.25 * b }); G.sfx('beep', { vol: 0.15 }); await G.wait(0.35); }
    {
      const shown = [];
      for (let i = 0; i < flood.length; i++) {
        shown.unshift(flood[i]);
        disp({ title: `${i + 1} NOTIFICATIONS`, lines: shown.slice(0, 7), bars: 4 });
        G.sfx('vibrate', { vol: 0.5 });
        if (i % 3 === 0) G.sfx('msgchime', { vol: 0.3 });
        if (CP) { CP.box.position.x = CP.x + (Math.random() - 0.5) * 0.004; }
        await G.wait(i < 3 ? 0.55 : 0.32);
        if (i === 4) G.cam({ pos: [-1.05, 1.3, -0.12], target: [0.1, 0.72, 0.02], fov: 50 });
      }
    }
    // he reaches over and turns the phone face down; the buzz goes on and on, muffled into the seat
    if (A.raw) A.raw.finishGestures();
    q(A.gesture('reach', { hand: 'L', target: [0.46, 1.0, RL.drvZ - 0.14], hold: true, dur: 0.1 }));
    q(A.gesture('reach', { hand: 'R', target: [cpos[0] + 0.1, cpos[1] + 0.06, cpos[2] + 0.08], dur: 1.6 }));
    A.look([cpos[0], cpos[1], cpos[2]]);
    await G.wait(0.8);
    if (CP) {
      let t = 0;
      await G.loop((dt) => { t += dt; const k = ease(clamp(t / 0.35)); CP.box.rotation.x = Math.PI * k; CP.scr.rotation.x = -Math.PI / 2 + Math.PI * k; CP.scr.position.y = CP.y + 0.0101 - 0.011 * k; return t >= 0.35; });
    }
    glowL.set({ intensity: 0 });
    A.look(null);
    for (let i = 0; i < 4; i++) { G.sfx('vibrate', { vol: 0.25 - i * 0.04 }); await G.wait(0.7); }
    await G.wait(0.6);
    road.stop(1.0);
    await G.fade(1, 1.0);
    try { glowL.free(); } catch (e) { /* light */ } END.carGlow = null;
    // ---- 5. later, stopped at a red light: he types the message; sends it; the light turns green ------------------------
    await G.goto('e_redlight', 'seat', { fade: false, sound: 'none' });
    cleanPost(G, 'none');
    A.show(); A.place(RL.car[0] + RL.seatX, RL.car[1] + RL.drvZ, 90, { y: 0.02 }); A.pose('sit', { seat: 0.42, blend: 0 });
    if (A.raw) { A.raw.idleLife = false; A.raw.finishGestures(); A.raw.expr('flat'); try { if (A.raw.held && A.raw.held.R) A.raw.held.R.visible = true; A.raw.armPose('R', 'phone_look'); } catch (e) { /* rig */ } }
    q(A.gesture('reach', { hand: 'L', target: [RL.car[0] + 0.46, 1.0, RL.car[1] + RL.drvZ - 0.14], hold: true, dur: 0.1 }));
    const idle = END_engine({ vol: 0.12 });
    G.ambient('wind', 0);
    // (a couple of people cross in front of the car while it's red)
    const P1 = G.actor('rlped1', 'customer', { rig: { seed: 41, detail: 'low' } }), P2 = G.actor('rlped2', 'customer', { rig: { seed: 57, detail: 'low' } });
    P1.place(3.6, -8.4, 0); P2.place(3.2, 7.6, 180);
    G.cam({ pos: [RL.car[0] - 0.95, 1.2, RL.car[1] + 0.1], target: [RL.car[0] + 4.6, 1.95, RL.car[1] + 0.9], fov: 46, to: { pos: [RL.car[0] - 0.9, 1.2, RL.car[1] + 0.12], fov: 44 }, dur: 10 });
    q(P1.walkTo([3.7, 8.5], { speed: 1.3 })); q(P2.walkTo([3.1, -8.6], { speed: 1.2 }));
    await G.fade(0, 1.0);
    await G.wait(1.8);
    // the phone: he types it, slowly (an insert: the phone fills the frame)
    {
      const sp = G.obj('e_redlight:phone'), L = ltex('rlphone', 256, 512);
      const draw = () => L.draw((c, w, h) => { try { Phone.drawScreen(c, w, h); } catch (e) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); } });
      const dispR = (o) => { try { Phone.display(o); } catch (e) { /* phone */ } draw(); };
      if (sp) {
        sp.visible = true;
        const n = V3(0, 0, 1).applyQuaternion(sp.quaternion), up = V3(0, 1, 0).applyQuaternion(sp.quaternion), c0 = sp.position.clone();
        // (close — any further back and the lens is inside his chest — but wide enough that the whole screen, "TO: LUKA"
        // at its top, stays inside the letterbox as it pushes in)
        const cp = c0.clone().addScaledVector(n, 0.25).addScaledVector(up, -0.004);
        G.cam({ pos: [cp.x, cp.y, cp.z], target: [c0.x, c0.y, c0.z], fov: 46, to: { pos: [cp.x - n.x * 0.015, cp.y - n.y * 0.015, cp.z - n.z * 0.015], fov: 45 }, dur: 9 });
      }
      let typed = '';
      for (const ch of RESIGN) {
        typed += ch;
        dispR({ title: 'TO: LUKA', lines: [typed + '_'], bars: 4, button: 'SEND' });
        if (ch !== ' ') G.sfx('keypress', { vol: 0.12 });
        await G.wait(ch === ',' || ch === '.' ? 0.32 : 0.075);
      }
      dispR({ title: 'TO: LUKA', lines: [RESIGN], bars: 4, button: 'SEND' });
      await G.wait(1.6);
      G.sfx('click', { vol: 0.4 });
      dispR({ title: 'TO: LUKA', lines: [RESIGN, '', 'SENT'], bars: 4 });
      G.sfx('whoosh', { vol: 0.35 });
      await G.wait(1.4);
      if (sp) sp.visible = false;
    }
    // the light turns green
    G.cam({ pos: [RL.car[0] - 0.95, 1.2, RL.car[1] + 0.1], target: [RL.car[0] + 4.6, 2.0, RL.car[1] + 0.9], fov: 44 });
    if (A.raw) { try { A.raw.armPose('R', 'phone'); } catch (e) { /* rig */ } }
    await G.wait(1.2);
    for (const n of ['e_redlight:tl1', 'e_redlight:tl2', 'e_redlight:tl3', 'e_redlight:tl4']) { const o = G.obj(n); if (o && o.userData.setMode) o.userData.setMode('green'); }
    { const r = G.obj('e_redlight:red'), g = G.obj('e_redlight:green'); if (r) r.visible = false; if (g) g.visible = true; }
    G.sfx('beep', { vol: 0.12 });
    await G.wait(2.4);
    idle.stop(0.8);
    await G.fade(1, 1.0);
    try { Phone.display(null); } catch (e) { /* phone */ }
    // ---- 6. the store huddle board. Luka writes a number. The space beside it on the roster is empty. ---------------
    const lukaOK = flag('lukaSaved');
    const st = { mode: 'oc', day: 'Monday', num: '11', numK: 0, ask: 0, names: [lukaOK ? 'LUKA' : 'SAM', 'CHLOE', 'PRIYA', 'JOSH', ''] };
    boardDraw(st); lbDraw('c3'); END.lbMode = 'c3'; monDraw('oc'); END.monMode = 'oc';
    await G.goto('e_citystore', 'counter', { fade: false, sound: 'none' });
    cleanPost(G, 'fog');
    try { Render.setAmbient('#d9dcd8', 1.2); } catch (e) { /* render */ }
    G.ambient('store', 0);
    storeProps(G, 'oc');
    aidanOff(G);
    const L = lukaOK ? G.actor('oclu', 'luka', { rig: { hold: { R: 'pen', L: ['coffee', {}] } } }) : G.actor('oclead', 'end_leader');
    {
      const [bx, bz, br] = CS.board, r = br * D2R;
      L.place(bx + Math.cos(r) * -0.78 + Math.sin(r) * 0.46, bz - Math.sin(r) * -0.78 + Math.cos(r) * 0.46, br + 150); L.pose('idle');
      if (L.raw) L.raw.idleLife = false;
      L.expr('tired'); L.look([bx, 1.5, bz]);
      const fx = Math.sin(r), fz = Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
      G.cam({ pos: [bx + fx * 1.9 + rx * 0.35, 1.62, bz + fz * 1.9 + rz * 0.35], target: [bx - rx * 0.2, 1.42, bz - rz * 0.2], fov: 34 });
      await G.fade(0, 1.2);
      await G.wait(1.0);
      G.sfx('scribble', { dur: 1.2, vol: 0.5 });
      await writeOnBoard(G, L, 'num', 1.3, st);
      if (L.raw) L.raw.finishGestures();
      await G.wait(0.8);
      // the roster: the name magnets, and the empty space where his was
      G.cam({ pos: [bx + fx * 1.3 - rx * 0.05, 1.46, bz + fz * 1.3 - rz * 0.05], target: [bx - rx * 0.05, 1.38, bz - rz * 0.05], fov: 36, to: { pos: [bx + fx * 1.1 + rx * 0.22, 1.3, bz + fz * 1.1 + rz * 0.22], target: [bx + rx * 0.24, 1.17, bz + rz * 0.24], fov: 30 }, dur: 6 });
      await G.wait(4.6);
    }
    await G.fade(1, 1.4);
    // ---- 7. text on black ----------------------------------------------------------------------------------------------
    G.ambient('none', 1.5);
    await G.wait(1.0);
    await G.textOnBlack('He never found out if she was okay.', 4.5);
    await G.wait(0.8);
    // (state: none — the scene gives Aidan's body back as it found it)
    try { const pa = Player.actor; if (pa && pa.held && pa.held.R) { pa.held.R.visible = true; pa.armPose('R', 'phone'); } } catch (e) { /* rig */ }
    S.flags.p0_carDead = true;
  }, { letterbox: true, skippable: true });


  // =================================================================================================================
  // OLLIE — the Ollie stickers' mascot, in person: an original round teal phone with the sticker's yellow smiley face
  // for a screen, stubby arms and legs, white mitten hands, yellow sneakers, an antenna with a yellow bobble.
  // =================================================================================================================
  const OL = { talk: 0, blink: 0, wave: 0, bounce: 1, walk: 0, t: 0, face: '', offer: 0, happy: 1 };
  const ollieFaceL = () => ltex('ollieface', 256, 256);
  function ollieFaceDraw(open, closed, happy) {
    const key = `${open.toFixed(1)}|${closed ? 1 : 0}|${happy}`;
    if (key === OL.face) return;
    OL.face = key;
    ollieFaceL().draw((x, w, h) => {
      x.fillStyle = '#0b3f40'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.yellow; x.beginPath(); x.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = w * 0.035; x.stroke();
      x.fillStyle = BR.ink; x.strokeStyle = BR.ink; x.lineCap = 'round';
      if (closed) { x.lineWidth = w * 0.03; for (const ex of [0.37, 0.63]) { x.beginPath(); x.arc(w * ex, h * 0.42, w * 0.05, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); } }
      else for (const ex of [0.37, 0.63]) { x.beginPath(); x.ellipse(w * ex, h * 0.4, w * 0.045, w * 0.06, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w * ex + 4, h * 0.38, 4, 0, Math.PI * 2); x.fill(); x.fillStyle = BR.ink; }
      // the smile: a big open grin while talking
      x.lineWidth = w * 0.032;
      if (open > 0.05) {
        x.beginPath(); x.moveTo(w * 0.32, h * 0.56); x.quadraticCurveTo(w * 0.5, h * (0.58 + 0.2 * open), w * 0.68, h * 0.56); x.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.32, h * 0.56); x.closePath();
        x.fillStyle = '#7a1f22'; x.fill(); x.stroke();
        x.fillStyle = '#e8606a'; x.beginPath(); x.ellipse(w * 0.5, h * (0.6 + 0.12 * open), w * 0.07, w * 0.03 * (0.5 + open), 0, 0, Math.PI * 2); x.fill();
      } else { x.beginPath(); x.arc(w / 2, h * 0.5, w * 0.19, 0.25, Math.PI - 0.25); x.stroke(); }
      // rosy cheeks
      x.fillStyle = 'rgba(240,120,110,0.45)'; for (const ex of [0.27, 0.73]) { x.beginPath(); x.ellipse(w * ex, h * 0.55, w * 0.05, w * 0.03, 0, 0, Math.PI * 2); x.fill(); }
      tx(x, 'OLLIE', w / 2, h * 0.86, h * 0.1, BR.ink, { align: 'center', weight: '900', font: FN.heavy });
    });
  }
  function END_ollie(K, x, z, rot) {
    const g = new THREE.Group(); g.name = 'e_party:ollie';
    const teal = new THREE.MeshStandardMaterial({ color: '#13a6a2', roughness: 0.35, metalness: 0.05 });
    const tealDk = new THREE.MeshStandardMaterial({ color: '#0d7c79', roughness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: '#f6f5ef', roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#ffc81e', roughness: 0.45 });
    const ink = new THREE.MeshStandardMaterial({ color: '#16201f', roughness: 0.4 });
    const body = new THREE.Group(); body.position.y = 0.42; g.add(body);
    // the phone body: a chubby rounded slab
    const W = 0.9, H = 1.26, rr = 0.24;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2 + rr, 0); sh.lineTo(W / 2 - rr, 0); sh.quadraticCurveTo(W / 2, 0, W / 2, rr); sh.lineTo(W / 2, H - rr); sh.quadraticCurveTo(W / 2, H, W / 2 - rr, H);
    sh.lineTo(-W / 2 + rr, H); sh.quadraticCurveTo(-W / 2, H, -W / 2, H - rr); sh.lineTo(-W / 2, rr); sh.quadraticCurveTo(-W / 2, 0, -W / 2 + rr, 0);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4, curveSegments: 10 });
    bg.translate(0, 0, -0.13);
    const bm = new THREE.Mesh(bg, teal); bm.castShadow = true; body.add(bm);
    // the screen: the sticker's face, lit
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({ map: ollieFaceL().tex, toneMapped: false }));
    scr.position.set(0, H * 0.56, 0.205); body.add(scr);
    const bez = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.98), ink); bez.position.set(0, H * 0.53, 0.202); body.add(bez);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), ink); slot.position.set(0, H * 0.94, 0.2); body.add(slot);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18), yellow); btn.rotation.x = Math.PI / 2; btn.position.set(0, H * 0.1, 0.2); body.add(btn);
    // the antenna and its bobble
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.26, 10), tealDk); ant.position.set(0.24, H + 0.17, -0.02); body.add(ant);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), yellow); bob.position.set(0.24, H + 0.33, -0.02); body.add(bob);
    // arms: shoulder pivots, teal sleeves, white mitten hands
    const arms = [];
    for (const sx of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(sx * (W / 2 + 0.05), H * 0.52, 0); body.add(piv);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 4, 10), teal); up.position.y = -0.22; piv.add(up);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), white); hand.position.y = -0.46; hand.scale.set(1, 0.9, 0.85); piv.add(hand);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), white); thumb.position.set(-sx * 0.07, -0.42, 0.05); piv.add(thumb);
      piv.rotation.z = sx * 0.35;
      arms.push(piv);
    }
    // legs and yellow sneakers
    const legs = [];
    for (const sx of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(sx * 0.2, 0.42, 0); g.add(piv);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 10), tealDk); leg.position.y = -0.2; piv.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), yellow); shoe.position.set(0, -0.36, 0.05); piv.add(shoe);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), yellow); toe.scale.set(1, 0.6, 0.8); toe.position.set(0, -0.35, 0.18); piv.add(toe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.34), white); sole.position.set(0, -0.415, 0.06); piv.add(sole);
      legs.push(piv);
    }
    g.position.set(x, 0, z); g.rotation.y = rot * D2R;
    K.mesh(g, { name: 'e_party:ollie', collide: [x - 0.5, z - 0.3, x + 0.5, z + 0.3] });
    const O = END.ollie = { g, body, arms, legs, scr, base: { x, z, rot } };
    ollieFaceDraw(0, false, 1);
    K.animate((dt, t) => {
      OL.t = t;
      // blink every few seconds; the mouth flaps while he talks
      OL.blink -= dt; if (OL.blink < -0.12) OL.blink = 2.2 + Math.random() * 2.5;
      if (OL.talk > 0) OL.talk -= dt;
      const open = OL.talk > 0 ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13)) : 0;
      ollieFaceDraw(open, OL.blink < 0, 1);
      // bounce, waddle, wave
      const b = OL.bounce * Math.abs(Math.sin(t * 4.2)) * 0.05;
      body.position.y = 0.42 + b; body.rotation.z = Math.sin(t * 2.1) * 0.04 * OL.bounce + (OL.walk ? Math.sin(t * 8) * 0.12 : 0);
      for (let i = 0; i < 2; i++) legs[i].rotation.x = OL.walk ? Math.sin(t * 8 + i * Math.PI) * 0.5 : 0;
      arms[0].rotation.x = OL.offer ? -1.25 * OL.offer : Math.sin(t * 2 + 1) * 0.12;
      arms[1].rotation.x = OL.offer ? -1.1 * OL.offer : Math.sin(t * 2) * 0.12;
      arms[1].rotation.z = OL.wave ? 2.4 + Math.sin(t * 12) * 0.35 : 0.35;
      arms[0].rotation.z = -0.35 - (OL.cheer ? 1.9 + Math.sin(t * 10) * 0.25 : 0);
      if (OL.cheer) arms[1].rotation.z = 2.25 + Math.sin(t * 10 + 1) * 0.25;
    });
    return O;
  }

  // the huge contract: a rolled scroll that unrolls along the floor (k 0..1), and its printed face
  const contractL = () => ltex('contract', 512, 1536);
  function contractDraw(sign = 0) {
    contractL().draw((x, w, h) => {
      x.fillStyle = '#fbf8ee'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w, 110);
      try { Tex.drawWordmark(x, w * 0.08, 78, 52, { color: BR.yellow }); } catch (e) { /* brand */ }
      tx(x, 'BRAND-NEW', w / 2, 200, 44, BR.ink, { align: 'center', weight: '900', font: FN.heavy });
      tx(x, '36-MONTH PLAN', w / 2, 262, 54, BR.tealDark, { align: 'center', weight: '900', font: FN.heavy });
      tx(x, 'UNLIMITED EVERYTHING', w / 2, 320, 30, BR.ink, { align: 'center', weight: 'bold' });
      const small = ['Unlimited calls, texts and data, forever-ish.', 'Unlimited Ollie stickers (12 included).', 'Cake provided on activation.', 'Customer confirms they have been asked', 'what they need it to work with.', 'Party lights not included. They are.', 'Confetti is non-refundable.', 'Terms and conditions: be nice.'];
      small.forEach((sx, i) => tx(x, sx, 40, 400 + i * 38, 19, '#3a4442', { font: FN.mono, maxWidth: w - 76 }));
      for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(40,50,48,0.16)'; x.fillRect(40, 740 + i * 26, w - 80 - (i % 3) * 40, 9); }
      x.strokeStyle = BR.ink; x.lineWidth = 3; x.beginPath(); x.moveTo(60, 1260); x.lineTo(w - 60, 1260); x.stroke();
      tx(x, 'SIGN HERE', 60, 1300, 26, BR.ink, { weight: 'bold' });
      tx(x, '✕', 30, 1256, 44, '#d0231c', { weight: 'bold' });
      if (sign > 0) handReveal(x, 'Aidan', 110, 1245, sign, { size: 92, color: '#1d2f86', wobble: 2.2, seed: 36 });
      tx(x, 'YES', w - 70, 1440, 40, '#d0231c', { align: 'right', weight: '900', font: FN.heavy });
    });
  }
  const yesL = () => ltex('yes', 1024, 512);
  function yesDraw() {
    yesL().draw((x, w, h) => {
      x.clearRect(0, 0, w, h);
      // a starburst behind the letters
      x.save(); x.translate(w / 2, h / 2);
      for (let i = 0; i < 24; i++) { x.rotate(Math.PI / 12); x.fillStyle = i % 2 ? 'rgba(255,204,0,0.5)' : 'rgba(0,168,168,0.45)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(w * 0.6, -26); x.lineTo(w * 0.6, 26); x.fill(); }
      x.restore();
      x.font = `900 ${h * 0.72}px ${FN.heavy}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round';
      x.lineWidth = 46; x.strokeStyle = '#0b4f52'; x.strokeText('YES', w / 2, h * 0.54);
      x.lineWidth = 24; x.strokeStyle = '#ffffff'; x.strokeText('YES', w / 2, h * 0.54);
      const g = x.createLinearGradient(0, h * 0.2, 0, h * 0.85); g.addColorStop(0, '#fff07a'); g.addColorStop(0.5, '#ffcc00'); g.addColorStop(1, '#f2a100');
      x.fillStyle = g; x.fillText('YES', w / 2, h * 0.54);
      x.fillStyle = 'rgba(255,255,255,0.8)'; for (const [sx, sy, r0] of [[0.12, 0.2, 16], [0.88, 0.25, 20], [0.2, 0.85, 12], [0.84, 0.8, 14], [0.5, 0.08, 10]]) { x.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r0 * 0.35 : r0; x.lineTo(w * sx + Math.cos(a) * rr, h * sy + Math.sin(a) * rr); } x.fill(); }
    });
  }
  // confetti: one Points cloud per room, bursts from emitters, fluttering down
  function END_confetti(K, n = 700) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n);
    const C = ['#ffcc00', '#13a6a2', '#ff6f91', '#ffffff', '#7fd6ff', '#b4f07a'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) { pos[i * 3 + 1] = -50; const c = C[i % C.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.055, vertexColors: true, sizeAttenuation: true, fog: false }));
    pts.frustumCulled = false; pts.name = 'e_party:confetti';
    K.mesh(pts, { name: 'e_party:confetti' });
    let next = 0;
    const C0 = {
      burst(at, dir, count = 160, spread = 1.2, speed = 5) {
        for (let k = 0; k < count; k++) {
          const i = next; next = (next + 1) % n;
          pos[i * 3] = at[0]; pos[i * 3 + 1] = at[1]; pos[i * 3 + 2] = at[2];
          const s = speed * (0.5 + Math.random() * 0.7);
          vel[i * 3] = dir[0] * s + (Math.random() - 0.5) * spread * 3; vel[i * 3 + 1] = dir[1] * s + Math.random() * spread * 2; vel[i * 3 + 2] = dir[2] * s + (Math.random() - 0.5) * spread * 3;
          life[i] = 6 + Math.random() * 4;
        }
      },
      rain(box, count = 200) { for (let k = 0; k < count; k++) { const i = next; next = (next + 1) % n; pos[i * 3] = box[0] + Math.random() * (box[2] - box[0]); pos[i * 3 + 1] = 3.6 + Math.random() * 1.5; pos[i * 3 + 2] = box[1] + Math.random() * (box[3] - box[1]); vel[i * 3] = (Math.random() - 0.5) * 0.4; vel[i * 3 + 1] = -0.2; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4; life[i] = 12; } },
    };
    K.animate((dt, t) => {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const j = i * 3;
        vel[j + 1] = Math.max(-0.75, vel[j + 1] - 9 * dt);                  // (paper falls slow)
        vel[j] *= 1 - 1.8 * dt; vel[j + 2] *= 1 - 1.8 * dt;
        pos[j] += (vel[j] + Math.sin(t * 5 + i) * 0.25) * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += (vel[j + 2] + Math.cos(t * 4 + i) * 0.25) * dt;
        if (pos[j + 1] < 0.01) { pos[j + 1] = 0.01; vel[j] = vel[j + 2] = 0; }
        if (life[i] <= 0) pos[j + 1] = -50;
      }
      g.attributes.position.needsUpdate = true;
    });
    return C0;
  }

  // =================================================================================================================
  // e_party — the transmitter room, as a party. x 0–14, z 0–11 (the door in the south wall at x 7). The cast in an arc
  // under the banner, Ollie in front with the contract; racks of transmitter cabinets draped in streamers; windows onto
  // a clear blue sky (the fog is behind the door).
  // =================================================================================================================
  const PY = { W: 14, D: 11, H: 4.2, door: [7, 11], ollie: [7, 6.2], aidan: [7, 9.95], cast: { nanP: [4.3, 5.45, 18], lukeP: [5.3, 4.95, 10], chloeP: [6.12, 4.6, 5], chaseP: [7.88, 4.6, -5], waiP: [8.7, 4.95, -10], lukaP: [9.7, 5.45, -18] } };
  const bannerTex = () => ctex('banner', 1024, 192, (x, w, h, r) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { x.fillStyle = ['#ffcc00', '#13a6a2', '#ff6f91'][i % 3]; x.beginPath(); x.arc(r() * w, r() * h, 3 + r() * 5, 0, Math.PI * 2); x.fill(); }
    x.font = `900 ${h * 0.46}px ${FN.heavy}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    // (squeezed to the banner's width: at this size the line is wider than the cloth)
    x.lineWidth = 10; x.strokeStyle = '#0b4f52'; x.strokeText('YOU\'RE PRE-APPROVED, AIDAN!', w / 2, h * 0.55, w * 0.93);
    x.fillStyle = BR.yellow; x.fillText('YOU\'RE PRE-APPROVED, AIDAN!', w / 2, h * 0.55, w * 0.93);
  });
  const skyWinTex = () => ctex('skywin', 256, 256, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4aa3e8'); g.addColorStop(1, '#bfe6ff'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,255,255,0.92)'; const cx = r() * w, cy = h * (0.2 + r() * 0.6); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + k * 14 - 28, cy + Math.sin(k) * 6, 16 + r() * 10, 0, Math.PI * 2); x.fill(); } }
    x.fillStyle = 'rgba(255,240,160,0.9)'; x.beginPath(); x.arc(w * 0.82, h * 0.18, 20, 0, Math.PI * 2); x.fill();
  });
  const cakeTex = () => ctex('cake', 256, 128, (x, w, h) => { x.fillStyle = '#13a6a2'; x.fillRect(0, 0, w, h); x.fillStyle = BR.yellow; x.beginPath(); x.arc(w / 2, h / 2, h * 0.36, 0, Math.PI * 2); x.fill(); x.fillStyle = BR.ink; x.beginPath(); x.arc(w * 0.46, h * 0.44, 5, 0, 7); x.arc(w * 0.54, h * 0.44, 5, 0, 7); x.fill(); x.strokeStyle = BR.ink; x.lineWidth = 4; x.beginPath(); x.arc(w / 2, h * 0.5, h * 0.16, 0.3, Math.PI - 0.3); x.stroke(); });
  defineRoom({
    id: 'e_party', name: 'THE PARTY', area: 'THE MAST', outdoor: false, surface: 'vinyl', ambient: 'none',
    noFog: true, grade: 'party',
    env: { ambient: ['#fff1f4', 1.7], sheets: false, specks: false },
    bounds: [0, 0, PY.W, PY.D],
    entries: { door: [PY.aidan[0], PY.aidan[1], 180], start: [PY.aidan[0], PY.aidan[1], 180] },
    cameras: [
      { id: 'e_party:north', vol: [0, 0, PY.W, 5.6], type: 'pan', pos: [7, 3.3, 10.4], target: [7, 1.0, 3], fov: 50, pan: { lag: 0.3, yaw: 60, pitch: 40 } },
      { id: 'e_party:south', vol: [0, 5.6, PY.W, PY.D], type: 'pan', pos: [7, 3.4, 0.6], target: [7, 1.0, 8.5], fov: 50, pan: { lag: 0.3, yaw: 60, pitch: 40 } },
    ],
    build(K) {
      const W = PY.W, D = PY.D, H = PY.H;
      const wm = { color: '#f6f4f2', roughness: 0.85 };
      K.floor(0, 0, W, D, { color: '#f4f2ee', roughness: 0.14, metalness: 0.05 });
      K.ceiling(0, 0, W, D, H, { color: '#fbfbfa', roughness: 0.8 });
      K.wall(-0.1, -0.075, W + 0.1, -0.075, H, wm, { skirting: '#13a6a2' });
      K.wall(-0.075, D + 0.1, -0.075, -0.1, H, wm, { skirting: '#13a6a2', openings: [{ at: 3.6, w: 2.4, h: 1.6, sill: 1.0, glass: true }, { at: 7.6, w: 2.4, h: 1.6, sill: 1.0, glass: true }] });
      K.wall(W + 0.075, -0.1, W + 0.075, D + 0.1, H, wm, { skirting: '#13a6a2', openings: [{ at: 3.5, w: 2.4, h: 1.6, sill: 1.0, glass: true }, { at: 7.5, w: 2.4, h: 1.6, sill: 1.0, glass: true }] });
      K.wall(W + 0.1, D + 0.075, -0.1, D + 0.075, H, wm, { skirting: '#13a6a2', openings: [{ at: W + 0.1 - PY.door[0], w: 1.0, h: 2.15 }] });
      K.box(W / 2, 2.9, 0.02, W, 0.18, 0.04, { color: '#13a6a2', roughness: 0.4 });
      // the windows: a clear blue sky and sunshine (the fog stayed outside the door)
      for (const [x, z, ry] of [[-0.6, D - 3.6, 90], [-0.6, D - 7.6, 90], [W + 0.6, 3.5, -90], [W + 0.6, 7.5, -90]]) K.plane(x, 1.8, z, 3.2, 2.4, skyWinTex(), { rotY: ry, emissive: true, emissiveIntensity: 1.0 });
      // the door (the hut's steel door) and what's behind it: the top of the mast at night, in the Outage fog
      // (the hut's steel door: a leaf hinged on the west jamb that swings out, into the night)
      {
        const piv = new THREE.Group(); piv.position.set(PY.door[0] - 0.49, 0, D + 0.16); piv.name = 'e_party:door';
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.97, 2.12, 0.05), K.mat({ tex: 'metal', color: '#7d8682', roughness: 0.5 }));
        leaf.position.set(0.485, 1.06, 0); piv.add(leaf);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.45), K.mat({ tex: 'grille', color: '#9aa2a0' })); win.position.set(0.485, 1.5, -0.027); win.rotation.y = Math.PI; piv.add(win);
        K.mesh(piv, { name: 'e_party:door' });
        for (const sx of [-1, 1]) K.box(PY.door[0] + sx * 0.54, 0, D + 0.075, 0.08, 2.2, 0.2, { tex: 'metal', color: '#5d6664' });
        K.box(PY.door[0], 2.15, D + 0.075, 1.16, 0.08, 0.2, { tex: 'metal', color: '#5d6664' });
      }
      K.plane(PY.door[0], 1.4, D + 1.6, 4, 3, { color: '#0b1716', emissive: '#10302e', emissiveIntensity: 0.6, roughness: 1 }, { rotY: 180 });
      // transmitter cabinets along the north wall, LEDs blinking, draped in streamers
      for (let i = 0; i < 5; i++) { const x = 1.2 + i * 0.95; K.box(x, 0, 0.45, 0.85, 2.1, 0.7, { tex: 'metal', color: '#c9cdc9', roughness: 0.45 }, { collide: true }); for (let k = 0; k < 3; k++) K.light('led', x - 0.25 + k * 0.1, 1.8, 0.81, { color: k === 1 ? '#ffb21e' : '#3dff9a', blink: 0.6 + k * 0.3 + i * 0.1, size: 0.012 }); }
      for (let i = 0; i < 5; i++) { const x = 9.2 + i * 0.95; K.box(x, 0, 0.45, 0.85, 2.1, 0.7, { tex: 'metal', color: '#c9cdc9', roughness: 0.45 }, { collide: true }); }
      // the banner over the cast, bunting in swags across the ceiling, streamers, balloons, the disco ball
      K.plane(W / 2, 3.05, 0.08, 7.5, 1.4, bannerTex(), {});
      {
        const pos = [], col = [], cols = ['#ffcc00', '#13a6a2', '#ff6f91', '#ffffff'].map((c) => new THREE.Color(c));
        const swag = (a, b, sag) => {
          const n = Math.floor(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.32);
          for (let i = 0; i < n; i++) {
            const t0 = i / n, t1 = (i + 0.8) / n, y0 = lerp(a[1], b[1], t0) - sag * Math.sin(Math.PI * t0), y1 = lerp(a[1], b[1], t1) - sag * Math.sin(Math.PI * t1);
            const x0 = lerp(a[0], b[0], t0), z0 = lerp(a[2], b[2], t0), x1 = lerp(a[0], b[0], t1), z1 = lerp(a[2], b[2], t1), tm = (t0 + t1) / 2;
            const xm = lerp(a[0], b[0], tm), zm = lerp(a[2], b[2], tm), ym = lerp(a[1], b[1], tm) - sag * Math.sin(Math.PI * tm) - 0.28;
            pos.push(x0, y0, z0, x1, y1, z1, xm, ym, zm);
            const c = cols[i % cols.length]; for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
          }
        };
        for (const [a, b, sg] of [[[0.2, 3.9, 1.5], [W - 0.2, 3.9, 1.5], 0.6], [[0.2, 3.9, 4.5], [W - 0.2, 3.9, 4.5], 0.7], [[0.2, 3.9, 7.5], [W - 0.2, 3.9, 7.5], 0.6], [[0.3, 3.9, 0.3], [W - 0.3, 3.9, D - 0.3], 0.9], [[W - 0.3, 3.9, 0.3], [0.3, 3.9, D - 0.3], 0.9]]) swag(a, b, sg);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
        mesh(K, g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), { name: 'e_party:bunting' });
      }
      const R = U.rng(3636);
      for (let i = 0; i < 26; i++) { const x = 0.4 + R() * (W - 0.8), z = 0.4 + R() * (D - 0.8); K.plane(x, H - 0.45, z, 0.06, 0.9, { color: ['#ffcc00', '#13a6a2', '#ff6f91', '#b4f07a'][i % 4], roughness: 0.7 }, { rotY: R() * 180, double: true }); }
      const balloon = (x, y, z, c) => { K.sphere(x, y, z, 0.2, { color: c, roughness: 0.25, metalness: 0.05 }, { scale: [1, 1.18, 1] }); K.box(x, 0, z, 0.006, y - 0.2, 0.006, { color: '#e8e8e8' }); };
      for (const [cx, cz] of [[1.0, 2.4], [W - 1.0, 2.4], [1.2, D - 1.6], [W - 1.2, D - 1.6]]) for (let k = 0; k < 5; k++) balloon(cx + (R() - 0.5) * 0.6, 1.9 + R() * 0.9, cz + (R() - 0.5) * 0.6, ['#ffcc00', '#13a6a2', '#ff6f91', '#ffffff', '#7fd6ff'][k]);
      for (let i = 0; i < 14; i++) K.sphere(0.5 + R() * (W - 1), H - 0.25, 0.5 + R() * (D - 1), 0.2, { color: ['#ffcc00', '#13a6a2', '#ff6f91', '#ffffff'][i % 4], roughness: 0.25 });
      const ball = mesh(K, new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.12, metalness: 0.95, flatShading: true }), { pos: [W / 2, H - 0.62, D / 2], name: 'e_party:ball' });
      K.box(W / 2, H - 0.3, D / 2, 0.01, 0.3, 0.01, { color: '#aaaaaa' });
      K.animate((dt) => { ball.rotation.y += dt * 0.9; });
      // the party table: a cake shaped like a phone (with a face), cups, chips, a jug of cordial
      K.prop('table', 1.6, 7.0, 90, { collide: true });
      K.box(1.6, 0.74, 6.6, 0.42, 0.14, 0.7, { color: '#13a6a2', roughness: 0.5 });
      K.plane(1.6, 0.885, 6.6, 0.4, 0.66, cakeTex(), { rot: [-90, 0, 90] });
      for (let k = 0; k < 6; k++) { K.cyl(1.46 + (k % 3) * 0.14, 0.88, 6.35 + Math.floor(k / 3) * 0.5, 0.006, 0.09, { color: ['#ff6f91', '#ffcc00', '#7fd6ff'][k % 3] }); K.light('led', 1.46 + (k % 3) * 0.14, 0.99, 6.35 + Math.floor(k / 3) * 0.5, { color: '#ffb84a', size: 0.012, blink: 0.18 + k * 0.03, duty: 0.8 }); }
      for (let k = 0; k < 8; k++) K.cyl(1.35 + (k % 2) * 0.5, 0.74, 7.3 + Math.floor(k / 2) * 0.12, 0.035, 0.1, { color: ['#ff6f91', '#ffcc00', '#13a6a2', '#ffffff'][k % 4], roughness: 0.6 });
      K.sphere(1.8, 0.76, 7.1, 0.14, { color: '#e8c060', roughness: 0.8 }, { scale: [1, 0.45, 1] });
      K.cyl(1.4, 0.74, 7.0, 0.07, 0.22, { color: '#ffa640', roughness: 0.1, transparent: true, opacity: 0.8 });
      for (let k = 0; k < 4; k++) K.prop('chair', 0.6, 8.3 + k * 0.6, 90, {});
      // Ollie, the contract (rolled up by his feet), confetti
      END_ollie(K, PY.ollie[0], PY.ollie[1], 0);
      contractDraw(0);
      {
        const cg = new THREE.PlaneGeometry(0.9, 2.1); cg.rotateX(-Math.PI / 2); cg.translate(0, 0.012, 1.05);
        const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: contractL().tex, roughness: 0.8 }));
        cm.position.set(PY.ollie[0], 0, PY.ollie[1] + 0.45); cm.scale.z = 0.001; cm.visible = false;
        K.mesh(cm, { name: 'e_party:contract' });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.14, 18), new THREE.MeshStandardMaterial({ color: '#fbf8ee', roughness: 0.8 }));
        roll.rotation.z = Math.PI / 2; roll.position.set(PY.ollie[0] + 0.3, 0.75, PY.ollie[1] + 0.35);
        K.mesh(roll, { name: 'e_party:roll' });
        END.contract = { cm, roll };
      }
      // the giant novelty pen
      {
        const pen = new THREE.Group(); pen.name = 'e_party:pen';
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12), new THREE.MeshStandardMaterial({ color: '#13a6a2', roughness: 0.4 })); pen.add(shaft);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 12), new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 0.8, roughness: 0.3 })); tip.position.y = -0.45; tip.rotation.x = Math.PI; pen.add(tip);
        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: BR.yellow, roughness: 0.9 })); pom.position.y = 0.46; pen.add(pom);
        pen.position.set(PY.ollie[0] - 0.62, 0.95, PY.ollie[1] + 0.1); pen.rotation.z = 0.5;
        K.mesh(pen, { name: 'e_party:pen' });
      }
      END.confetti = END_confetti(K, 900);
      // light: bright and warm; the party lights circle during the scene (Render.party)
      for (const [x, z] of [[3.5, 3], [10.5, 3], [3.5, 8], [10.5, 8]]) K.light('point', x, H - 0.3, z, { color: '#fff4ea', intensity: 6, distance: 10, name: 'e_party:l' + x + z });
      K.examine(PY.ollie[0], 1.4, PY.ollie[1], ['Ollie. [beat] From the stickers.', 'He\'s taller than I thought.'], { id: 'end:party:ollie', r: 1.6 });
      K.examine(W / 2, 2.4, 0.4, '"You\'re pre-approved, Aidan!" [beat] I didn\'t even apply.', { id: 'end:party:banner', r: 2.2 });
      K.examine(1.6, 1.0, 6.8, 'A cake shaped like a phone. It\'s smiling at me.', { id: 'end:party:cake', r: 1.4 });
      K.examine(-0.2, 1.6, D - 5.6, 'Blue sky. Actual blue sky.', { id: 'end:party:win', r: 1.8 });
      K.examine(3.0, 1.2, 0.8, 'The transmitters are still going. Somebody\'s hung streamers on them.', { id: 'end:party:racks', r: 1.6 });
    },
  });

  // =================================================================================================================
  // ENDING "Yes" (E-YES) — the transmitter room door opens onto confetti and party lights. (The only joke in the game.)
  // =================================================================================================================
  defineCutscene('E-YES', async (G) => {
    try { Render.post.white = 0; } catch (e) { /* render */ }
    stopFx(0.2);
    let hold = null;
    // ---- at the hut door (when he's there): warm light and confetti spill out of the doorway -------------------------
    if (World.room === 'c8_mast') {
      const A0 = G.aidan;
      G.cam({ pos: [-3.3, 57.5, 0.95], target: [-1.0, 57.2, -0.55], fov: 44 });
      const warm = Render.allocLight('point', { color: '#ffb86b', intensity: 14, distance: 7, pos: [-1.4, 57.4, -0.55], pin: true });
      G.sfx('confetti', { vol: 0.9 }); Snd.murmur && G.sfx('murmur_cheer', { vol: 0.7 });
      hold = sfx('hold', { loop: true, vol: 0.7, bus: 'music' });
      if (A0.raw) { A0.raw.expr('wide'); q(A0.gesture('flinch')); }
      await G.wait(1.5);
      try { warm.free(); } catch (e) { /* light */ }
      await G.fade(1, 0.35, '#fff4e6');
    } else await G.fade(1, 0.3, '#fff4e6');
    fogWorld(G);
    await G.goto('e_party', 'door', { fade: false, sound: 'none' });
    cleanPost(G, 'party');
    G.ambient('none', 0);
    if (!hold) hold = sfx('hold', { loop: true, vol: 0.7, bus: 'music' });
    END.hold = hold;
    const A = aidanOn(G, PY.aidan[0], PY.aidan[1] + 0.6, 180, { expr: 'wide' });
    // the cast, in party hats
    const mk = (id, preset, key, hat, rig = {}) => {
      const [x, z, r] = PY.cast[key];
      const X = G.actor(id, preset, { rig: { detail: 'low', habits: [], idleLife: false, ...rig } });
      X.place(x, z, r); X.pose('idle'); X.expr('grin'); X.look(A); if (X.raw) X.raw.idleLife = false;
      hatOn(X, hat);
      return X;
    };
    const cast = {
      nan: mk('ynan', 'nan', 'nanP', '#ff6f91', { pendant: null }),
      luke: mk('yluke', 'luke', 'lukeP', '#ffcc00', { hold: {} }),
      chloe: mk('ychloe', 'chloe', 'chloeP', '#13a6a2', { hold: {}, face: { redRim: 0.1 } }),
      chase: mk('ychase', 'chase', 'chaseP', '#ff8a2a', { hold: {}, earbuds: null }),
      wai: mk('ywai', 'wai', 'waiP', '#4a7fd6', {}),
      luka: mk('yluka', 'luka', 'lukaP', '#9a6ad6', { hold: { R: 'coffee' } }),
    };
    const all = Object.values(cast);
    // everyone cheering, on and off (a background loop for the whole scene)
    const cheerSt = { on: false };
    G.bg(async (G2) => {
      const moves = { nan: ['laugh', 'nod'], luke: ['hands_up', 'laugh'], chloe: ['hands_up', 'laugh'], chase: ['hands_up', 'bounce', 'hands_up'], wai: ['nod', 'laugh'], luka: ['laugh', 'nod'] };
      let i = 0;
      // (a bg child inherits the cutscene's skip, and a skipping wait resolves at once: stop, never spin)
      while (!G2.skipping) {
        await G2.wait(0.45);
        if (G2.skipping) return;
        if (!cheerSt.on) continue;
        const k = Object.keys(cast)[i++ % 6], m = moves[k];
        q(cast[k].gesture(m[Math.floor(Math.random() * m.length)]));
      }
    }, { name: 'e_yes:cheer' });
    const party = () => { try { Render.party(true, { center: [7, 0, 5.5], radius: 3.2, y: 3.2, count: 4, intensity: 16 }); } catch (e) { /* render */ } };
    // ---- 1. inside: the door opens; Aidan in the doorway; SURPRISE — the lights, the confetti, everyone ---------------
    try { Render.setAmbient('#3a2a40', 0.25); } catch (e) { /* render */ }
    for (const l of ['e_party:l3.53', 'e_party:l10.53', 'e_party:l3.58', 'e_party:l10.58']) { try { G.light(l).on(false); } catch (e) { /* light */ } }
    A.place(PY.door[0], PY.D + 0.4, 180);
    G.cam({ pos: [5.5, 2.35, 2.4], target: [7.3, 1.35, 10.8], fov: 46 });
    await G.fade(0, 0.5, '#fff4e6');
    await G.wait(0.5);
    { const dp = G.obj('e_party:door'); let t = 0; G.sfx('creak', { vol: 0.6 }); if (dp) await G.loop((dt) => { t += dt; dp.rotation.y = -1.75 * ease(clamp(t / 0.9)); return t >= 0.9; }); }
    await G.wait(0.9);
    // lights!
    try { Render.setAmbient(null); } catch (e) { /* render */ }
    for (const l of ['e_party:l3.53', 'e_party:l10.53', 'e_party:l3.58', 'e_party:l10.58']) { try { G.light(l).on(true); } catch (e) { /* light */ } }
    party();
    cheerSt.on = true;
    for (const X of all) q(X.gesture('hands_up'));
    if (END.confetti) { END.confetti.burst([5.2, 1.4, 5], [0.3, 0.9, 0.6], 180); END.confetti.burst([8.8, 1.4, 5], [-0.3, 0.9, 0.6], 180); END.confetti.rain([4, 6, 10, 11], 160); }
    G.sfx('confetti', { vol: 1 });
    G.sfx('murmur_cheer', { vol: 0.9 });
    await G.say('EVERYONE', 'SURPRISE!');
    // ---- 2. Aidan: torch still up, blinking -------------------------------------------------------------------------
    A.place(PY.aidan[0], PY.aidan[1], 180);
    G.cam({ ...faceShot(A, 1.5, 32, -0.05, 0.1), dur: 0 });
    A.expr('wide'); A.eyes('ahead');
    await G.wait(0.8);
    await G.say('AIDAN', '...What?');
    // ---- 3. over his shoulder: the whole party. Ollie waddles up. ----------------------------------------------------
    G.cam({ pos: [7.6, 1.86, 10.72], target: [7.0, 1.3, 5.0], fov: 52, to: { pos: [7.55, 1.84, 10.6], fov: 50 }, dur: 8 });
    OL.walk = 1;
    {
      const O = END.ollie;
      let t = 0;
      await G.loop((dt) => { t += dt; if (O) O.g.position.z = PY.ollie[1] + ease(clamp(t / 1.8)) * 1.0; return t >= 1.8; });
    }
    OL.walk = 0; OL.wave = 1;
    OL.talk = 1.8;
    await G.say('OLLIE', 'Aidan! You found all twelve of me!');
    OL.wave = 0;
    // low on Ollie: the hero shot
    G.cam({ pos: [7.35, 0.72, 9.15], target: [7.0, 1.42, PY.ollie[1] + 1.0], fov: 44 });
    OL.talk = 1.8;
    await G.say('OLLIE', 'That calls for a brand-new plan!');
    // ---- 4. the huge contract unrolls across the floor to his feet ---------------------------------------------------
    G.cam({ pos: [11.2, 1.5, 9.8], target: [7.0, 0.35, 8.7], fov: 46 });
    {
      const C = END.contract, O = END.ollie;
      if (C) { C.cm.visible = true; C.cm.position.z = (O ? O.g.position.z : PY.ollie[1] + 1.0) + 0.4; }
      G.sfx('paper', { vol: 0.8 });
      let t = 0;
      await G.loop((dt) => {
        t += dt;
        const k = ease(clamp(t / 1.6));
        if (C) { C.cm.scale.z = Math.max(0.001, k); C.roll.position.set(PY.ollie[0], 0.1 + 0.65 * (1 - k), C.cm.position.z + 2.1 * k); C.roll.scale.setScalar(1 - 0.6 * k); }
        return t >= 1.6;
      });
      if (C) C.roll.visible = false;
    }
    await G.wait(0.3);
    // an insert on it: BRAND-NEW 36-MONTH PLAN
    {
      const C = END.contract, z0 = C ? C.cm.position.z : 7.6;
      G.cam({ pos: [7.95, 1.35, z0 + 1.95], target: [7.0, 0.0, z0 + 0.75], fov: 36 });
    }
    await G.wait(1.6);
    // ---- 5. the cast weigh in ----------------------------------------------------------------------------------------
    // (from the left of Ollie, who stands between the door and the cast: Chloe and Chase both in the clear)
    G.cam({ pos: [4.6, 1.7, 7.6], target: [7.1, 1.5, 4.6], fov: 34 });
    q(cast.chase.gesture('hands_up'));
    await G.say('CHASE', 'LEGEND!');
    q(cast.chloe.gesture('laugh'));
    await G.say('CHLOE', 'Amazing!');
    G.cam({ pos: [8.45, 1.6, 8.1], target: [9.2, 1.5, 5.15], fov: 32 });
    cast.wai.expr('smile');
    await G.say('WAI', 'Read the fine print, mate. [beat] Or don\'t. It\'s a party.');
    await G.say('LUKA', 'No pressure, mate. [beat] Thirty-six months.');
    G.cam({ pos: [5.55, 1.5, 8.2], target: [4.8, 1.4, 5.15], fov: 32 });
    await G.say('NAN', 'Oh, he\'s lovely.');
    await G.say('LUKE', 'Sign it, mate. There\'s cake.');
    // ---- 6. Ollie holds out the giant pen: "What do you say?" ---------------------------------------------------------
    {
      const pen = G.obj('e_party:pen'), O = END.ollie;
      if (pen && O) { pen.position.set(O.g.position.x + 0.62, 1.05, O.g.position.z + 0.6); pen.rotation.set(-1.0, 0, -0.35); }
      OL.offer = 1;
    }
    G.cam({ pos: [6.45, 1.62, 10.7], target: [7.0, 1.3, 7.2], fov: 40 });
    OL.talk = 1.2;
    await G.say('OLLIE', 'So, Aidan... [beat] What do you say?');
    // ---- 7. Aidan: the biggest, realest grin of the game -------------------------------------------------------------
    G.cam({ ...faceShot(A, 1.25, 30, -0.04, -0.1), dur: 0 });
    A.expr('grin'); A.eyes('ahead');
    await G.wait(0.7);
    q(A.gesture('laugh', { small: true }));
    await G.wait(0.6);
    A.expr('grin');
    await G.say('AIDAN', '...Yes.');
    // he signs (the pen, the scribble, his name on the line)
    {
      const pen = G.obj('e_party:pen'), C = END.contract;
      const z0 = C ? C.cm.position.z : 7.6, zs = z0 + 2.1 * 0.83;
      G.cam({ pos: [6.25, 1.4, zs + 1.05], target: [7.0, 0.0, zs - 0.12], fov: 36 });
      if (pen) { pen.position.set(6.85, 0.5, zs - 0.05); pen.rotation.set(-0.35, 0, -0.4); }
      A.place(PY.aidan[0] + 0.05, zs + 0.75, 180); A.pose('crouch');
      G.sfx('scribble', { dur: 1.6, vol: 0.8 });
      let t = 0;
      await G.loop((dt) => { t += dt; contractDraw(clamp(t / 1.5)); if (pen) { pen.position.x = 6.7 + clamp(t / 1.5) * 0.45; pen.position.y = 0.5 + Math.abs(Math.sin(t * 14)) * 0.03; } return t >= 1.6; });
      contractDraw(1);
      A.pose('idle');
    }
    // ---- 8. a giant YES fills the screen; confetti; everyone cheers ---------------------------------------------------
    const cp = [7.0, 2.25, 10.7], ct = [7.0, 1.4, 4.6];
    G.cam({ pos: cp, target: ct, fov: 46 });
    OL.offer = 0; OL.cheer = 1;
    for (const X of all) q(X.gesture('hands_up'));
    A.place(PY.aidan[0] + 0.4, PY.aidan[1] - 0.2, 170); q(A.gesture('hands_up'));
    if (END.confetti) { END.confetti.burst([5, 1.5, 5.6], [0.4, 1, 0.8], 220, 1.5, 6); END.confetti.burst([9, 1.5, 5.6], [-0.4, 1, 0.8], 220, 1.5, 6); END.confetti.rain([2, 2, 12, 11], 260); }
    G.sfx('confetti', { vol: 1 }); G.sfx('murmur_cheer', { vol: 1 });
    await G.wait(0.4);
    yesDraw();
    {
      const cam = V3(...cp), d = V3(ct[0] - cp[0], ct[1] - cp[1], ct[2] - cp[2]).normalize();
      const at = cam.clone().addScaledVector(d, 1.4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshBasicMaterial({ map: yesL().tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
      m.position.copy(at); m.lookAt(cam); m.renderOrder = 50; m.scale.setScalar(0.01);
      try { World.build.group.add(m); } catch (e) { /* room */ }
      END.yes = m;
      G.sfx('stamp', { vol: 0.9 }); G.sfx('eftpos', { vol: 0.8 });
      let t = 0;
      await G.loop((dt) => { t += dt; const k = clamp(t / 0.45); m.scale.setScalar(k < 1 ? 1.25 * Math.sin(k * Math.PI * 0.5) + (k > 0.7 ? -0.25 * (k - 0.7) / 0.3 : 0) : 1 + 0.03 * Math.sin(t * 6)); m.rotation.z = 0.04 * Math.sin(t * 3); return t >= 3.2; });
    }
    await G.fade(1, 1.0);
    // (state: none — the scene's own presentation is cleaned up)
    try { if (END.hold) END.hold.stop(1.2); } catch (e) { /* audio */ } END.hold = null;
    try { Render.party(false); } catch (e) { /* render */ }
    OL.cheer = 0; OL.offer = 0; OL.walk = 0; OL.wave = 0;
    if (END.yes) { END.yes.removeFromParent(); END.yes.geometry.dispose(); END.yes.material.dispose(); END.yes = null; }
  }, { letterbox: true, skippable: true });

  // ==== END OF ENDINGS CONTENT ====
}
