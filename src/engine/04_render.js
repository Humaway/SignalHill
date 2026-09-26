// ==== engine/04_render.js — renderer, low-res target, post chain, fog, fog sheets, dead air, light pool, halos, torch ====
// Spec §2: internal resolution 55% of the window (canvas CSS-stretched, linear upscale), pixel ratio 1, PCF-soft
// shadows (the torch is the only caster), FogExp2, one full-screen post pass (tone curve → grade → grain/vignette/CA,
// Outage scanlines + sync-slip, death static, fades), drifting lit fog sheets and "dead air" specks.
//
// Render.post (read every frame; null = automatic from the current grade):
//   grain, ca, vignette : strength overrides (null → grade default: grain 0.08 Fog / 0.14 Outage …)
//   desat 0..1 (colour drain), noise 0..1 (static fill), fade 0..1 (to black), white 0..1 (to white),
//   dim (brightness multiplier; pause uses 0.4), blur 0..1, brightness (null → META.options.brightness),
//   redBadge 0..1 (Unread stings), menu (bool: grain at 60%, also automatic while frozen or an overlay is shown),
//   exposure (multiplier, default 1)                                                           // CONTRACT+: menu, exposure
// Grain is multiplied by META.options.grain and disabled when META.options.noise === false.
const Render = (() => {
  const POINTS = 8, SPOTS = 2, SHEETS = 20, SPECKS = 360, TAU = Math.PI * 2;
  const FOG_HEX = '#8e9996';
  let renderer = null, composer = null, renderPass = null, postPass = null, overlayRT = null, canvasEl = null;
  let scale = 0.55, iw = 2, ih = 2, frozen = false, needFrame = true, updated = false, lastNow = 0, worldCalls = 0, worldTris = 0;

  const scene = new THREE.Scene();
  scene.name = 'world';
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
  camera.position.set(0, 1.7, 6);
  scene.add(camera);
  const fog = new THREE.FogExp2(FOG_HEX, 0.075);
  scene.fog = fog;
  scene.background = new THREE.Color(FOG_HEX);
  const hemi = new THREE.HemisphereLight(0xa3aeab, 0x2e3331, 0.9);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const col = (c) => (c && c.isColor ? c.clone() : new THREE.Color(c ?? 0xffffff));

  // ---------------------------------------------------------------------------------------------------------------
  // Environment (fog, background, ambient, fog sheets, dead air) with optional cross-fade
  // ---------------------------------------------------------------------------------------------------------------
  const ENV_KEYS_C = ['fog', 'bg', 'sky', 'ground'], ENV_KEYS_N = ['density', 'amb', 'sheetOpacity', 'sheetBase', 'specks'];
  function envPreset(outdoor, outage, noFog) {
    let p;
    if (noFog) p = { fog: '#cdc8bb', bg: '#cdc8bb', sky: '#efe2cf', ground: '#5b5446', density: 0, amb: 1.4, sheetOpacity: 0, sheetBase: 1, specks: 0, sheets: 0 };
    else if (outage && outdoor) p = { fog: '#0a1312', bg: '#0a1312', sky: '#1f6f6a', ground: '#040606', density: 0.06, amb: 0.06, sheetOpacity: 0.4, sheetBase: 0.25, specks: 0, sheets: 8 };
    else if (outage) p = { fog: '#070d0d', bg: '#060a0a', sky: '#1f6f6a', ground: '#030404', density: 0.035, amb: 0.035, sheetOpacity: 0.3, sheetBase: 0.2, specks: 0, sheets: 4 };
    else if (outdoor) p = { fog: FOG_HEX, bg: FOG_HEX, sky: '#a3aeab', ground: '#2e3331', density: 0.075, amb: 0.9, sheetOpacity: 0.34, sheetBase: 1, specks: 1, sheets: 12 };
    else p = { fog: FOG_HEX, bg: FOG_HEX, sky: '#56605e', ground: '#141716', density: 0.03, amb: 0.16, sheetOpacity: 0.2, sheetBase: 0.3, specks: 0, sheets: 5 };
    for (const k of ENV_KEYS_C) p[k] = new THREE.Color(p[k]);
    return p;
  }
  const env = { outdoor: true, outage: false, noFog: false, cur: envPreset(true, false, false), from: null, to: null, t: 1, dur: 0, sheets: 14, jump: true };
  let ambOverride = null;
  function applyEnv() {
    const c = env.cur;
    fog.color.copy(c.fog); fog.density = c.density;
    if (scene.background && scene.background.isColor) scene.background.copy(c.bg);
    if (ambOverride) { hemi.color.copy(ambOverride.color); hemi.groundColor.copy(ambOverride.color).multiplyScalar(0.3); hemi.intensity = ambOverride.intensity; } else { hemi.color.copy(c.sky); hemi.groundColor.copy(c.ground); hemi.intensity = c.amb; }
  }
  function stepEnv(dt) {
    if (env.t >= 1 || !env.to) return;
    env.t = env.dur > 0 ? Math.min(1, env.t + dt / env.dur) : 1;
    const k = U.smooth(env.t);
    for (const key of ENV_KEYS_C) env.cur[key].copy(env.from[key]).lerp(env.to[key], k);
    for (const key of ENV_KEYS_N) env.cur[key] = U.lerp(env.from[key], env.to[key], k);
    applyEnv();
  }
  // setEnvironment({ outdoor, outage, fog:{density,color}|null, noFog, background, ambient:[color,i], sheets:bool|n,
  //                  specks:bool, dur (s, cross-fade), grade:name|false, gradeDur })
  function setEnvironment(o = {}) {
    const outdoor = o.outdoor ?? env.outdoor, outage = o.outage ?? env.outage, noFog = !!o.noFog;
    const t = envPreset(outdoor, outage, noFog);
    if (o.fog) {
      if (o.fog.density !== undefined) t.density = o.fog.density;
      if (o.fog.color !== undefined) { t.fog.set(o.fog.color); if (o.background === undefined) t.bg.set(o.fog.color); }
    }
    if (o.background !== undefined) t.bg.set(o.background);
    if (o.ambient) { const a = Array.isArray(o.ambient) ? o.ambient : [o.ambient.color, o.ambient.intensity]; t.sky.set(a[0]); t.ground.set(a[0]).multiplyScalar(0.3); t.amb = a[1] ?? t.amb; }
    if (o.sheets !== undefined) t.sheets = o.sheets === true ? envPreset(outdoor, outage, false).sheets : o.sheets === false ? 0 : Math.max(0, Math.min(SHEETS, o.sheets | 0));
    if (o.sheets && noFog) { t.sheetOpacity = 0.25; t.sheetBase = 1; }
    if (o.specks !== undefined) t.specks = o.specks ? 1 : 0;
    const changedPlace = outdoor !== env.outdoor || noFog !== env.noFog;
    env.outdoor = outdoor; env.outage = outage; env.noFog = noFog;
    env.sheets = t.sheets;
    const dur = o.dur ?? 0;
    if (dur > 0) {
      env.from = { ...env.cur }; for (const k of ENV_KEYS_C) env.from[k] = env.cur[k].clone();
      env.to = t; env.t = 0; env.dur = dur;
    } else {
      env.cur = t; env.to = null; env.t = 1;
      if (changedPlace || !o.keepSheets) env.jump = true;
    }
    applyEnv();
    if (o.grade !== false) setGrade(typeof o.grade === 'string' ? o.grade : (noFog ? 'dawn' : outage ? 'outage' : 'fog'), o.gradeDur ?? dur);
  }
  function setAmbient(color, intensity) {
    if (color === undefined || color === null) ambOverride = null;
    else ambOverride = { color: col(color), intensity: intensity ?? 0.1 };
    applyEnv();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Light pool (fixed; shader programs never recompile) and the torch.
  // Handles are VIRTUAL: any number of lights can be allocated; each frame the physical slots (8 point + 2 spot) go to
  // the lit handles that matter most — nearest to Render.focus (Aidan), and only those whose range reaches into the
  // view frustum — so a long street's sodium lamps near Aidan are real wherever he is. A slot changing hands fades the
  // old light out and the new one in over ~0.3 s. {pin:true} handles (party lights) always hold a slot; {prio:m}
  // counts the light m metres closer than it is (the phone's screen light). Halos and emissive fixtures are the
  // owner's business and stay on whether or not a handle holds a slot at the moment.
  // ---------------------------------------------------------------------------------------------------------------
  const pool = { point: [], spot: [] };
  for (let i = 0; i < POINTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.name = 'pool_point_' + i;
    scene.add(l);
    pool.point.push({ light: l, used: false, base: 0, lit: true, handle: null });
  }
  for (let i = 0; i < SPOTS; i++) {
    const l = new THREE.SpotLight(0xffffff, 0, 12, U.rad(35), 0.4, 2);
    l.name = 'pool_spot_' + i;
    scene.add(l); scene.add(l.target);
    pool.spot.push({ light: l, used: false, base: 0, lit: true, handle: null });
  }
  const allSlots = [...pool.point, ...pool.spot];
  const vlights = [];                                // every live virtual handle
  const FADE = 0.3;
  let poolWarned = 0, crowdWarn = 0;
  // copy a handle's config onto its slot's THREE light (w = handover fade weight)
  function applySlot(slot) {
    const h = slot.handle, l = slot.light;
    if (!h) { l.intensity = 0; slot.base = 0; return; }
    const c = h.cfg;
    l.color.copy(c.color); l.distance = c.distance; l.decay = c.decay;
    l.position.copy(c.pos);
    if (l.isSpotLight) { l.angle = c.angle; l.penumbra = c.penumbra; l.target.position.copy(c.target); }
    slot.base = c.intensity; slot.lit = h.lit;
    l.intensity = h.lit ? c.intensity * h.w : 0;
  }
  function takeSlot(h, slot, fadeIn) {
    if (slot.handle && slot.handle !== h) { slot.handle.slot = null; slot.handle.w = 0; }
    slot.handle = h; slot.used = true; h.slot = slot; h.w = fadeIn ? 0 : 1;
    applySlot(slot);
  }
  function dropSlot(h) {
    const slot = h.slot; if (!slot) return;
    h.slot = null; h.w = 0;
    if (slot.handle === h) { slot.handle = null; slot.used = false; slot.base = 0; slot.light.intensity = 0; }
  }
  // allocLight('point'|'spot', {color, intensity, distance, decay, angle (deg), penumbra, pos, target, pin, prio}) → handle
  function allocLight(kind = 'point', o = {}) {
    kind = kind === 'spot' ? 'spot' : 'point';
    const h = {
      kind, light: null, slot: null, w: 0, lit: true, freed: false, pin: !!o.pin, prio: +o.prio || 0,
      cfg: { color: new THREE.Color(0xffffff), intensity: 1, distance: kind === 'spot' ? 12 : 10, decay: 2, pos: new THREE.Vector3(), angle: U.rad(35), penumbra: 0.4, target: new THREE.Vector3(0, -1, 0) },
      set(opts) { if (!h.freed) { cfgFrom(h, opts || {}); if (h.slot) applySlot(h.slot); } return h; },
      on(v = true) { if (!h.freed) { h.lit = !!v; if (h.slot) applySlot(h.slot); } return h; },
      get isOn() { return !h.freed && h.lit; },
      get intensity() { return h.cfg.intensity; },
      set intensity(v) { if (!h.freed) { h.cfg.intensity = +v || 0; if (h.slot) applySlot(h.slot); } },
      free() { if (h.freed) return; h.freed = true; dropSlot(h); const i = vlights.indexOf(h); if (i >= 0) vlights.splice(i, 1); },
    };
    Object.defineProperty(h, 'light', { get: () => (h.slot ? h.slot.light : null) });   // the physical light while held
    cfgFrom(h, { intensity: 1, ...o });
    vlights.push(h);
    if (h.pin) {                                    // pinned: a slot right now (evicting the least important holder)
      const list = pool[kind];
      let slot = list.find((sl) => !sl.handle) || null;
      if (!slot) {
        const cands = list.filter((sl) => !sl.handle.pin);
        slot = cands.sort((a, b) => score(b.handle) - score(a.handle))[0] || null;
      }
      if (slot) takeSlot(h, slot, false);
      else if (poolWarned++ < 5) console.warn(`[Render] light pool: no slot left for a pinned ${kind} light (max ${POINTS} point + ${SPOTS} spot)`);
    }
    return h;
  }
  function cfgFrom(h, o) {
    const c = h.cfg;
    if (o.color !== undefined) c.color.set(o.color);
    if (o.intensity !== undefined) c.intensity = +o.intensity || 0;
    if (o.distance !== undefined) c.distance = o.distance;
    if (o.decay !== undefined) c.decay = o.decay;
    if (o.pos) c.pos.copy(U.toV3(o.pos));
    if (o.angle !== undefined) c.angle = U.rad(o.angle);
    if (o.penumbra !== undefined) c.penumbra = o.penumbra;
    if (o.target) c.target.copy(U.toV3(o.target));
    if (o.on !== undefined) h.lit = !!o.on;
    if (o.pin !== undefined) h.pin = !!o.pin;
    if (o.prio !== undefined) h.prio = +o.prio || 0;
  }
  // lower = more important. Lights whose range can't reach the view frustum only get slots nobody else wants.
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere();
  function score(h) {
    if (h.pin) return -1e9;
    const d = h.cfg.pos.distanceTo(lastFocus) - h.prio - (h.slot ? 1.5 : 0);   // holders keep a 1.5 m edge (no thrash)
    _sp.set(h.cfg.pos, Math.max(0.5, h.cfg.distance || 30));
    return _fr.intersectsSphere(_sp) ? d : d + 1000;
  }
  // Switching a light off / on is instant (flicker, blackouts): an off light keeps its slot for a moment (dark), so it
  // comes straight back. Only a change of ranking — Aidan walking toward other lamps — fades a slot across.
  function assignLights(dt) {
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    for (const kind of ['point', 'spot']) {
      const list = pool[kind];
      const want = vlights.filter((h) => h.kind === kind && h.lit && h.cfg.intensity > 0);
      for (const h of want) h._s = score(h);
      want.sort((a, b) => a._s - b._s);
      const top = new Set(want.slice(0, list.length));
      for (const h of want) if (!top.has(h) && !h.slot) h.rankedOut = true;
      // warn (a few times a session) when more lights than slots are wanted close together in view
      if (kind === 'point' && crowdWarn < 3) {
        const near = want.filter((h) => h._s < 14);
        if (near.length > list.length + 2) { crowdWarn++; console.warn(`[Render] ${near.length} lit point lights within ~14 m in view — only the ${list.length} nearest are real; pass light:false to the rest`); }
      }
      for (const sl of list) {
        const h = sl.handle; if (!h) continue;
        if (!h.lit || !(h.cfg.intensity > 0)) { h.offT = (h.offT || 0) + dt; if (h.offT > 1.5) dropSlot(h); continue; }   // off: dark at once
        h.offT = 0;
        if (!top.has(h)) { h.w = Math.max(0, h.w - dt / FADE); if (h.w <= 0.001) { dropSlot(h); h.rankedOut = true; } }  // ranked out: fade
        else if (h.w < 1) h.w = Math.min(1, h.w + dt / FADE);
      }
      // wanted handles without a slot take a free one (or one an off light is only keeping warm): a light that was
      // ranked out fades in, a light just switched on / created comes on at once
      for (const h of want) {
        if (!top.has(h) || h.slot) continue;
        const free = list.find((sl) => !sl.handle) || list.find((sl) => sl.handle && !sl.handle.lit);
        if (!free) break;
        if (free.handle) dropSlot(free.handle);
        takeSlot(h, free, dt > 0 && !!h.rankedOut);
        h.rankedOut = false;
      }
      for (const sl of list) applySlot(sl);
    }
  }
  function freeAllLights() {
    for (const h of vlights.slice()) h.free();
    for (const s of allSlots) { s.handle = null; s.used = false; s.base = 0; s.light.intensity = 0; }
    partyLights(false);
    crowdWarn = 0;
    ambOverride = null; applyEnv();
  }
  // CONTRACT+: Render.lightAt(point, {torch=true, pool=true, ambient=false, exclude: handle}) → rough light level at a world point
  // (≈ 1 for a surface 2 m in front of the torch). For effects that should only show where light really falls
  // (pickup glints, the Tethered's clamshell glare, Aidan's phone glow): torch cone × falloff, pool lights × falloff,
  // plus the hemisphere ambient on request.
  const _la = new THREE.Vector3(), _lb = new THREE.Vector3();
  function lightAt(p, o = {}) {
    p = p.isVector3 ? p : U.toV3(p);
    let L = 0;
    if (o.torch !== false && torchLight.intensity > 0) {
      torchLight.getWorldPosition(_la);
      _lb.copy(p).sub(_la);
      const d = _lb.length();
      if (d > 0.01 && d < torchLight.distance) {
        torchLight.target.getWorldPosition(tmpV2);
        const cosA = _lb.divideScalar(d).dot(tmpV2.sub(_la).normalize());
        const c0 = Math.cos(torchLight.angle), c1 = Math.cos(torchLight.angle * (1 - torchLight.penumbra));
        const cone = U.clamp((cosA - c0) / Math.max(1e-4, c1 - c0));
        L += (torchLight.intensity / 42) * cone * 5 / (1 + d * d) * (1 - U.smooth(U.clamp((d - torchLight.distance * 0.6) / (torchLight.distance * 0.4))));
      }
    }
    if (o.pool !== false) {
      for (const s of allSlots) {
        const l = s.light;
        if (!s.handle || !(l.intensity > 0) || (o.exclude && s.handle === o.exclude)) continue;
        const d = l.position.distanceTo(p);
        const range = l.distance > 0 ? 1 - U.smooth(U.clamp((d - l.distance * 0.5) / (l.distance * 0.5))) : 1;
        let k = l.intensity * range / (1 + d * d) / 8;
        if (l.isSpotLight) { _lb.copy(p).sub(l.position).normalize(); _la.copy(l.target.position).sub(l.position).normalize(); k *= U.clamp((_lb.dot(_la) - Math.cos(l.angle)) / 0.1); }
        L += k;
      }
    }
    if (o.ambient) L += hemi.intensity * 0.35;
    return L;
  }

  const torchLight = new THREE.SpotLight(0xfff3e0, 0, 22, U.rad(28), 0.5, 2);
  torchLight.name = 'torch';
  torchLight.castShadow = true;
  torchLight.shadow.mapSize.set(1024, 1024);
  torchLight.shadow.bias = -0.0004;
  torchLight.shadow.normalBias = 0.025;
  torchLight.shadow.camera.near = 0.1;
  torchLight.shadow.camera.far = 12;         // casters beyond ~12 m are lost in the fog and the torch's falloff anyway
  torchLight.shadow.autoUpdate = false;
  torchLight.shadow.needsUpdate = true; // allocate the map on the first frame even while the torch is off
  torchLight.position.set(0, 1.3, 0);
  scene.add(torchLight); scene.add(torchLight.target);
  const torchSt = { on: false, base: 42, level: 0, dropT: 0, drop: 1 };
  const torch = {
    light: torchLight,
    get isOn() { return torchSt.on; },
    on(v = true) { torchSt.on = !!v; torchLight.shadow.autoUpdate = torchSt.on; torchLight.intensity = torchSt.on ? torchSt.base : 0; return torch; },
    toggle() { return torch.on(!torchSt.on); },
    // level 0..1 — flicker strength (Player sets it from the nearest monster within 6 m; 0 = steady)
    flicker(level = 0) { torchSt.level = U.clamp(level); return torch; },
    get level() { return torchSt.level; },
    // CONTRACT+: torch.intensity (base candela, default 42)
    get intensity() { return torchSt.base; },
    set intensity(v) { torchSt.base = v; },
    setTransform(pos, dir) {
      torchLight.position.copy(U.toV3(pos));
      if (dir) torchLight.target.position.copy(torchLight.position).add(tmpV.copy(U.toV3(dir)).normalize().multiplyScalar(4));
      return torch;
    },
  };
  function updateTorch(dt) {
    let k = 1;
    const L = torchSt.level;
    if (L > 0) {
      if (torchSt.dropT > 0) { torchSt.dropT -= dt; k = torchSt.drop; }
      else if (Math.random() < L * dt * 5) { torchSt.dropT = 0.04 + Math.random() * 0.14 * L; torchSt.drop = Math.random() * 0.35; k = torchSt.drop; }
      else k = 1 - L * 0.22 * Math.random();
    }
    torchLight.intensity = torchSt.on ? torchSt.base * k : 0;
  }

  // Party lights (Yes ending): coloured pool lights circling a point. CONTRACT+
  let party = null;
  function partyLights(on, o = {}) {
    if (party) { party.h.forEach((h) => h.free()); party = null; }
    if (!on) return;
    const n = o.count || 4, h = [];
    for (let i = 0; i < n; i++) h.push(allocLight('point', { color: '#ff5090', intensity: o.intensity ?? 14, distance: (o.radius || 3) * 3, pin: true }));
    party = { h, c: U.toV3(o.center || [0, 0, 0]), rad: o.radius || 3, y: o.y ?? 2.6, t: 0 };
  }
  function updateParty(dt) {
    if (!party) return;
    party.t += dt;
    party.h.forEach((h, i) => {
      const a = party.t * 0.8 + (i / party.h.length) * TAU;
      h.cfg.color.setHSL((party.t * 0.2 + i / party.h.length) % 1, 0.9, 0.55);
      h.cfg.pos.set(party.c.x + Math.cos(a) * party.rad, party.c.y + party.y + Math.sin(party.t * 2 + i) * 0.3, party.c.z + Math.sin(a) * party.rad);
      if (h.slot) applySlot(h.slot);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Halos — additive sprites for streetlights/screens. Room-owned: pass {parent} or add it yourself.
  // sprite.userData.opacity is the base brightness (fog fades it with distance); sprite.userData.free() removes it.
  // ---------------------------------------------------------------------------------------------------------------
  function halo(pos, o = {}) {
    const m = new THREE.SpriteMaterial({ map: Tex.get('halo'), color: col(o.color || '#ffad5c'), transparent: true, opacity: o.opacity ?? 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    s.name = o.name || 'halo';
    s.position.copy(U.toV3(pos));
    const size = o.size ?? 1.6;
    s.scale.set(size, size, 1);
    s.renderOrder = 10;
    s.userData.opacity = m.opacity;
    s.userData.halo = true;
    // o.fog (0..1, default 1): how much the fog swallows it — 0 keeps a far beacon (the mast's aircraft light) readable
    const fogK = o.fog ?? 1;
    s.onBeforeRender = (r, sc, cam) => {
      s.getWorldPosition(tmpV2);
      const d = tmpV2.distanceTo(cam.position), fd = (sc.fog ? sc.fog.density : 0) * 0.5 * d * fogK;
      m.opacity = s.userData.opacity * Math.exp(-fd * fd) * Math.min(1, d / 1.5);
    };
    s.userData.free = () => { s.removeFromParent(); m.dispose(); };
    if (o.parent) o.parent.add(s);
    return s;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Fog sheets: instanced, noise-textured, camera-facing, drifting, lit by the pool lights and the torch
  // ---------------------------------------------------------------------------------------------------------------
  const sheetU = {
    tNoise: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0.5 }, uColor: { value: new THREE.Color(FOG_HEX) }, uBase: { value: 1 }, uFogD: { value: 0.075 },
    uLP: { value: Array.from({ length: POINTS + SPOTS }, () => new THREE.Vector4()) },
    uLC: { value: Array.from({ length: POINTS + SPOTS }, () => new THREE.Vector4()) },
    uTP: { value: new THREE.Vector3() }, uTD: { value: new THREE.Vector3(0, 0, -1) }, uTC: { value: new THREE.Color(0xfff3e0) }, uTCos: { value: new THREE.Vector2(0.88, 0.95) }, uTI: { value: 0 },
  };
  const SHEET_VS = /* glsl */`
    attribute float aAlpha;
    attribute float aSeed;
    varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vWorld;
    void main() {
      vUv = uv; vAlpha = aAlpha; vSeed = aSeed;
      vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const SHEET_FS = /* glsl */`
    uniform sampler2D tNoise; uniform float uTime, uOpacity, uBase, uFogD; uniform vec3 uColor;
    uniform vec4 uLP[ ${POINTS + SPOTS} ]; uniform vec4 uLC[ ${POINTS + SPOTS} ];
    uniform vec3 uTP, uTD, uTC; uniform vec2 uTCos; uniform float uTI;
    varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vWorld;
    void main() {
      vec2 uv1 = vUv * vec2( 0.9, 0.5 ) + vec2( vSeed * 3.1 + uTime * 0.010, vSeed * 1.7 + uTime * 0.004 );
      vec2 uv2 = vUv * vec2( 1.6, 0.8 ) + vec2( vSeed * 5.3 - uTime * 0.016, vSeed * 2.9 - uTime * 0.006 );
      float n = smoothstep( 0.25, 1.05, texture2D( tNoise, uv1 ).a * 0.7 + texture2D( tNoise, uv2 ).a * 0.6 );
      float edge = smoothstep( 0.0, 0.3, vUv.x ) * smoothstep( 1.0, 0.7, vUv.x ) * smoothstep( 0.02, 0.4, vUv.y ) * smoothstep( 1.0, 0.55, vUv.y );
      float d = distance( vWorld, cameraPosition );
      float a = clamp( n, 0.0, 1.0 ) * edge * vAlpha * uOpacity * smoothstep( 0.8, 3.5, d );
      if ( a < 0.002 ) discard;
      vec3 glow = vec3( 0.0 );
      for ( int i = 0; i < ${POINTS + SPOTS}; i ++ ) {
        vec3 L = uLP[ i ].xyz - vWorld; float dl2 = dot( L, L );
        float att = 1.0 / ( 1.0 + dl2 * 0.3 );
        if ( uLP[ i ].w > 0.0 ) att *= 1.0 - smoothstep( uLP[ i ].w * 0.5, uLP[ i ].w, sqrt( dl2 ) );
        glow += uLC[ i ].rgb * uLC[ i ].a * att;
      }
      vec3 T = vWorld - uTP; float tl = length( T );
      float cone = smoothstep( uTCos.x, uTCos.y, dot( T / max( tl, 0.001 ), uTD ) );
      glow += uTC * uTI * cone * cone / ( 1.0 + tl * tl * 0.15 );
      float fogT = exp( - uFogD * uFogD * d * d * 0.3 );
      gl_FragColor = vec4( uColor * uBase + glow * fogT, a );
    }`;
  let sheetMesh = null, sheetAlpha = null;
  const sheets = [];
  const wind = new THREE.Vector3(1, 0, 0.3).normalize();
  let windA = 0.3;
  function buildSheets() {
    const geo = new THREE.PlaneGeometry(1, 1);
    sheetAlpha = new THREE.InstancedBufferAttribute(new Float32Array(SHEETS), 1);
    sheetAlpha.setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(SHEETS);
    for (let i = 0; i < SHEETS; i++) seeds[i] = Math.random() * 10;
    geo.setAttribute('aAlpha', sheetAlpha);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    sheetU.tNoise.value = Tex.get('fog_noise');
    const mat = new THREE.ShaderMaterial({ uniforms: sheetU, vertexShader: SHEET_VS, fragmentShader: SHEET_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    sheetMesh = new THREE.InstancedMesh(geo, mat, SHEETS);
    sheetMesh.name = 'fog_sheets';
    sheetMesh.frustumCulled = false;
    sheetMesh.renderOrder = 5;
    sheetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < SHEETS; i++) sheets.push({ pos: new THREE.Vector3(), w: 4, h: 2.5, alpha: 0, max: 0.8, life: 0, fading: true, speed: 1, yawJit: 0 });
    scene.add(sheetMesh);
  }
  function respawnSheet(s, focus, cam, instant) {
    const outdoor = env.outdoor, R = outdoor ? 13 : 6.5;
    s.w = outdoor ? 5 + Math.random() * 5 : 2.6 + Math.random() * 2.2;
    s.h = outdoor ? 2.4 + Math.random() * 1.6 : 1.5 + Math.random() * 1.0;
    let x, z;
    const dx = focus.x - cam.x, dz = focus.z - cam.z, L = Math.hypot(dx, dz) || 1;
    if (Math.random() < 0.55) { // in the space the shot looks through
      const t = 0.3 + Math.random() * 0.95;
      const lat = (Math.random() - 0.5) * 2 * Math.min(R * 0.6, 2 + L * 0.4);
      x = cam.x + dx * t + (-dz / L) * lat; z = cam.z + dz * t + (dx / L) * lat;
    } else {
      const a = Math.random() * TAU, d = 1.5 + Math.sqrt(Math.random()) * R;
      x = focus.x + Math.cos(a) * d; z = focus.z + Math.sin(a) * d;
    }
    s.pos.set(x, focus.y + s.h * 0.42 + (Math.random() - 0.3) * (outdoor ? 1.0 : 0.3), z);
    s.max = 0.5 + Math.random() * 0.5;
    s.life = 16 + Math.random() * 26;
    s.fading = false;
    s.alpha = instant ? s.max * (0.6 + Math.random() * 0.4) : 0;
    s.speed = 0.5 + Math.random() * 0.9;
    s.yawJit = (Math.random() - 0.5) * 0.6;
  }
  const lastFocus = new THREE.Vector3(), prevFocus = new THREE.Vector3(), camPos = new THREE.Vector3();
  let focusSet = false;
  function updateSheets(dt, time, cam) {
    if (!sheetMesh) return;
    const n = env.sheets;
    sheetMesh.visible = n > 0 || sheets.some((s) => s.alpha > 0.001);
    if (!sheetMesh.visible) { env.jump = false; return; }
    const R = env.outdoor ? 13 : 6.5;
    windA += dt * 0.013;
    wind.set(Math.cos(windA), 0, Math.sin(windA * 0.7) * 0.6).normalize().multiplyScalar(env.outdoor ? 0.28 : 0.07);
    const jump = env.jump || prevFocus.distanceTo(lastFocus) > 5;
    env.jump = false;
    for (let i = 0; i < SHEETS; i++) {
      const s = sheets[i], active = i < n;
      if (jump) { if (active) respawnSheet(s, lastFocus, cam, true); else s.alpha = 0; }
      if (!active && s.alpha <= 0) { sheetAlpha.array[i] = 0; continue; }
      s.life -= dt;
      s.pos.addScaledVector(wind, s.speed * dt);
      s.pos.y += Math.sin(time * 0.17 + i) * 0.03 * dt;
      const dist = Math.hypot(s.pos.x - lastFocus.x, s.pos.z - lastFocus.z);
      if (!active || s.life < 0 || dist > R * 1.35 || s.pos.distanceTo(cam) < 1.0) s.fading = true;
      const target = s.fading ? 0 : s.max;
      s.alpha = U.clamp(s.alpha + U.clamp(target - s.alpha, -dt * 0.45, dt * 0.22), 0, 1);
      if (s.fading && s.alpha <= 0.001 && active) respawnSheet(s, lastFocus, cam, false);
      const yaw = Math.atan2(cam.x - s.pos.x, cam.z - s.pos.z) + s.yawJit;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpM.compose(s.pos, tmpQ, tmpS.set(s.w, s.h, 1));
      sheetMesh.setMatrixAt(i, tmpM);
      sheetAlpha.array[i] = s.alpha;
    }
    sheetMesh.instanceMatrix.needsUpdate = true;
    sheetAlpha.needsUpdate = true;
    // uniforms: environment + lights
    const c = env.cur;
    sheetU.uTime.value = time; sheetU.uOpacity.value = c.sheetOpacity; sheetU.uBase.value = c.sheetBase; sheetU.uColor.value.copy(c.fog); sheetU.uFogD.value = c.density;
    allSlots.forEach((slot, i) => {
      const l = slot.light, P = sheetU.uLP.value[i], C = sheetU.uLC.value[i];
      if (slot.used && l.intensity > 0) { l.getWorldPosition(tmpV); P.set(tmpV.x, tmpV.y, tmpV.z, l.distance || 0); C.set(l.color.r, l.color.g, l.color.b, l.intensity * 0.05); } else C.w = 0;
    });
    torchLight.getWorldPosition(sheetU.uTP.value);
    torchLight.target.getWorldPosition(tmpV);
    sheetU.uTD.value.copy(tmpV).sub(sheetU.uTP.value).normalize();
    sheetU.uTC.value.copy(torchLight.color);
    sheetU.uTCos.value.set(Math.cos(torchLight.angle), Math.cos(torchLight.angle * (1 - torchLight.penumbra)));
    sheetU.uTI.value = torchLight.intensity * 0.007;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dead air: sparse white specks drifting up (Fog-world exteriors). Wrapped in a box around the focus, all on GPU.
  // ---------------------------------------------------------------------------------------------------------------
  const speckU = { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(22, 9, 22) }, uSize: { value: 0.03 }, uResY: { value: 300 }, uFogD: { value: 0.075 }, uWind: { value: new THREE.Vector2(0.05, 0.02) }, uOpacity: { value: 1 } };
  let speckMesh = null;
  function buildSpecks() {
    const pos = new Float32Array(SPECKS * 3), rnd = new Float32Array(SPECKS * 3);
    for (let i = 0; i < SPECKS * 3; i++) { pos[i] = Math.random(); rnd[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: speckU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 aRand;
        uniform float uTime, uSize, uResY, uFogD; uniform vec3 uFocus, uBox; uniform vec2 uWind;
        varying float vA;
        void main() {
          vec3 p = position * uBox;
          float t = uTime;
          p.y += t * ( 0.08 + 0.14 * aRand.x );
          p.x += sin( t * 0.31 + aRand.y * 6.2831 ) * 0.35 + t * uWind.x;
          p.z += cos( t * 0.27 + aRand.z * 6.2831 ) * 0.35 + t * uWind.y;
          vec3 origin = uFocus - uBox * vec3( 0.5, 0.03, 0.5 );
          vec3 q = mod( p - origin, uBox );
          vec3 qn = q / uBox;
          float edge = smoothstep( 0.0, 0.12, qn.x ) * smoothstep( 1.0, 0.88, qn.x ) * smoothstep( 0.0, 0.12, qn.z ) * smoothstep( 1.0, 0.88, qn.z ) * smoothstep( 0.0, 0.08, qn.y ) * smoothstep( 1.0, 0.75, qn.y );
          vec4 mv = viewMatrix * vec4( origin + q, 1.0 );
          float dist = -mv.z;
          float fogF = exp( - pow( uFogD * dist * 0.6, 2.0 ) );
          float tw = 0.55 + 0.45 * sin( t * ( 0.8 + aRand.x * 2.5 ) + aRand.y * 40.0 );
          vA = edge * fogF * tw * step( 0.15, dist );
          gl_PointSize = clamp( uSize * projectionMatrix[ 1 ][ 1 ] * uResY * 0.5 / max( dist, 0.1 ), 1.0, 4.5 );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; varying float vA;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          float a = smoothstep( 0.5, 0.05, d ) * vA * uOpacity;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( vec3( 1.25, 1.3, 1.28 ), a );
        }`,
    });
    speckMesh = new THREE.Points(geo, mat);
    speckMesh.name = 'dead_air';
    speckMesh.frustumCulled = false;
    speckMesh.renderOrder = 6;
    scene.add(speckMesh);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Colour grades (display-space parameters; cross-faded by lerping the numbers)
  // ---------------------------------------------------------------------------------------------------------------
  const G0 = { exp: 1, sat: 1, accent: 1, contrast: 1, pivot: 0.45, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], shadow: [0, 0, 0], high: [0, 0, 0], grain: 0.08, ca: 0.5, vig: 0.35, scan: 0, dirt: 0.6, glow: 0.6 };
  const grade = (o) => ({ ...G0, ...o });
  const GRADES = {
    none: grade({ ca: 0.3, vig: 0.25, dirt: 0.3 }),
    fog: grade({ exp: 1.0, sat: 0.5, accent: 0.95, contrast: 1.1, pivot: 0.4, lift: [0.012, 0.022, 0.024], gamma: [0.98, 1, 1], gain: [0.96, 1, 0.99], shadow: [-0.004, 0.006, 0.008], high: [0.01, 0.008, 0], grain: 0.08, ca: 0.55, vig: 0.45, dirt: 0.8, glow: 0.6 }),
    outage: grade({ exp: 0.92, sat: 0.55, accent: 1.2, contrast: 1.2, pivot: 0.35, lift: [0, 0.012, 0.011], gamma: [0.95, 1, 1], gain: [0.92, 1.02, 1], shadow: [-0.008, 0.012, 0.01], high: [0, 0, -0.01], grain: 0.14, ca: 0.95, vig: 0.62, scan: 1, dirt: 1, glow: 0.8 }),
    flashback: grade({ exp: 1.5, sat: 0.12, accent: 0.25, contrast: 0.88, pivot: 0.5, lift: [0.06, 0.056, 0.05], gamma: [1.08, 1.08, 1.05], gain: [1.02, 1, 0.96], high: [0.02, 0.015, 0], grain: 0.2, ca: 0.4, vig: 0.35, dirt: 1.6, glow: 1.3 }),
    dawn: grade({ exp: 1.12, sat: 0.85, accent: 1, contrast: 0.96, pivot: 0.45, lift: [0.03, 0.022, 0.012], gamma: [1.03, 1, 0.97], gain: [1.05, 1, 0.93], shadow: [0.004, 0, 0.006], high: [0.02, 0.012, -0.01], grain: 0.05, ca: 0.25, vig: 0.3, dirt: 0.4, glow: 1 }),
    hospital: grade({ exp: 1.25, sat: 0.7, accent: 0.8, contrast: 1.05, pivot: 0.5, lift: [0, 0.02, 0.022], gamma: [1, 1.03, 1.03], gain: [0.93, 1.04, 1.04], shadow: [-0.01, 0.01, 0.012], high: [0, 0.01, 0.012], grain: 0.08, ca: 0.45, vig: 0.3, dirt: 0.6, glow: 0.8 }),
    party: grade({ exp: 1.12, sat: 1.35, accent: 1.35, contrast: 1.1, lift: [0.02, 0.005, 0.01], gain: [1.08, 1, 0.94], shadow: [0.01, 0, 0.015], high: [0.02, 0.01, 0], grain: 0.06, ca: 0.35, vig: 0.3, dirt: 0.3, glow: 1 }),
    title: grade({ exp: 0.92, sat: 0.35, accent: 0.9, contrast: 1.08, pivot: 0.4, lift: [0.008, 0.016, 0.018], gain: [0.95, 1, 1], shadow: [-0.004, 0.004, 0.006], grain: 0.1, ca: 0.5, vig: 0.62, dirt: 1, glow: 0.6 }),
  };
  const cloneG = (g) => ({ ...g, lift: [...g.lift], gamma: [...g.gamma], gain: [...g.gain], shadow: [...g.shadow], high: [...g.high] });
  const gradeCur = cloneG(GRADES.fog);
  let gradeFrom = null, gradeTo = null, gradeT = 1, gradeDur = 0, gradeName = 'fog';
  function setGrade(name, dur = 0) {
    const g = GRADES[name];
    if (!g) { console.warn(`[Render] unknown grade "${name}"`); return; }
    gradeName = name;
    if (!(dur > 0)) { Object.assign(gradeCur, cloneG(g)); gradeT = 1; gradeTo = null; return; }
    gradeFrom = cloneG(gradeCur); gradeTo = g; gradeT = 0; gradeDur = dur;
  }
  function stepGrade(rdt) {
    if (gradeT >= 1 || !gradeTo) return;
    gradeT = Math.min(1, gradeT + rdt / gradeDur);
    const k = U.smooth(gradeT);
    for (const key of Object.keys(gradeCur)) {
      const a = gradeFrom[key], b = gradeTo[key];
      if (Array.isArray(a)) for (let i = 0; i < 3; i++) gradeCur[key][i] = U.lerp(a[i], b[i], k);
      else gradeCur[key] = U.lerp(a, b, k);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The post pass
  // ---------------------------------------------------------------------------------------------------------------
  const postU = {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(2, 2) }, uTime: { value: 0 },
    uGrain: { value: 0.08 }, uCA: { value: 0.5 }, uVig: { value: 0.4 }, uDesat: { value: 0 }, uNoise: { value: 0 }, uFade: { value: 0 }, uWhite: { value: 0 },
    uDim: { value: 1 }, uBlur: { value: 0 }, uBright: { value: 1 }, uRed: { value: 0 },
    uScan: { value: 0 }, uFlick: { value: 0 }, uSlip: { value: 0 }, uSlipY: { value: 0.5 }, uSlipSeed: { value: 0 },
    gExp: { value: 1 }, gSat: { value: 1 }, gAccent: { value: 1 }, gContrast: { value: 1 }, gPivot: { value: 0.45 }, gDirt: { value: 1 }, gGlow: { value: 0.6 },
    gLift: { value: new THREE.Vector3() }, gGamma: { value: new THREE.Vector3(1, 1, 1) }, gGain: { value: new THREE.Vector3(1, 1, 1) }, gShadow: { value: new THREE.Vector3() }, gHigh: { value: new THREE.Vector3() },
  };
  const POST_VS = /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
  const POST_FS = /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
    uniform float uGrain, uCA, uVig, uDesat, uNoise, uFade, uWhite, uDim, uBlur, uBright, uRed;
    uniform float uScan, uFlick, uSlip, uSlipY, uSlipSeed;
    uniform float gExp, gSat, gAccent, gContrast, gPivot, gDirt, gGlow;
    uniform vec3 gLift, gGamma, gGain, gShadow, gHigh;
    varying vec2 vUv;
    float h12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
    float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( h12( i ), h12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h12( i + vec2( 0.0, 1.0 ) ), h12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
    vec3 toSRGB( vec3 c ) { c = max( c, 0.0 ); return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
    vec3 knee( vec3 c ) { vec3 s = 0.62 + 0.38 * ( 1.0 - exp( - max( c - 0.62, 0.0 ) / 0.38 ) ); return mix( c, s, step( 0.62, c ) ); }
    const vec2 DISC[ 12 ] = vec2[ 12 ]( vec2( -0.326, -0.406 ), vec2( -0.840, -0.074 ), vec2( -0.696, 0.457 ), vec2( -0.203, 0.621 ), vec2( 0.962, -0.195 ), vec2( 0.473, -0.480 ),
      vec2( 0.519, 0.767 ), vec2( 0.185, -0.893 ), vec2( 0.507, 0.064 ), vec2( 0.896, 0.412 ), vec2( -0.322, -0.933 ), vec2( -0.792, -0.598 ) );
    void main() {
      vec2 uv = vUv;
      float slipBand = 0.0;
      if ( uSlip > 0.0 ) {
        slipBand = smoothstep( 0.07, 0.0, abs( uv.y - uSlipY ) );
        float row = floor( uv.y * uRes.y / 3.0 );
        uv.x += uSlip * slipBand * ( 0.006 + 0.028 * h12( vec2( row, uSlipSeed ) ) );
        uv.y += uSlip * 0.003 * sin( uSlipSeed * 7.0 );
      }
      vec2 cc = uv - 0.5;
      float r2 = dot( cc, cc );
      vec2 caOff = cc * r2 * uCA * 0.016 * ( 1.0 + slipBand * uSlip * 6.0 );
      vec3 col = vec3( texture2D( tDiffuse, uv + caOff ).r, texture2D( tDiffuse, uv ).g, texture2D( tDiffuse, uv - caOff ).b );
      float blur = max( uBlur, uRed * 0.6 );
      if ( blur > 0.002 ) {
        vec3 acc = col;
        vec2 px = blur * 10.0 / uRes;
        float ra = h12( gl_FragCoord.xy ) * 6.2831853;
        mat2 rot = mat2( cos( ra ), sin( ra ), -sin( ra ), cos( ra ) );
        for ( int i = 0; i < 12; i ++ ) acc += texture2D( tDiffuse, uv + rot * DISC[ i ] * px ).rgb;
        col = mix( col, acc / 13.0, clamp( blur * 2.5, 0.0, 1.0 ) );
      }
      // tone: exposure, soft shoulder, sRGB
      col = toSRGB( knee( col * gExp ) );
      // grade: lift / gain / gamma / contrast
      col = col * gGain + gLift * ( 1.0 - col );
      col = pow( max( col, 0.0 ), 1.0 / gGamma );
      col = max( ( col - gPivot ) * gContrast + gPivot, 0.0 );
      // saturation, keeping warm accents (sodium orange, LED red, warning yellow)
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float mx = max( col.r, max( col.g, col.b ) ), mn = min( col.r, min( col.g, col.b ) ), ch = mx - mn, hue = 0.0;
      if ( ch > 0.0001 ) {
        if ( mx == col.r ) hue = mod( ( col.g - col.b ) / ch, 6.0 );
        else if ( mx == col.g ) hue = ( col.b - col.r ) / ch + 2.0;
        else hue = ( col.r - col.g ) / ch + 4.0;
        hue /= 6.0;
      }
      float warm = max( 1.0 - smoothstep( 0.11, 0.17, hue ), smoothstep( 0.93, 0.98, hue ) ) * smoothstep( 0.04, 0.16, ch );
      col = mix( vec3( l ), col, mix( gSat, gAccent, warm ) * ( 1.0 - uDesat ) );
      col += gShadow * ( 1.0 - smoothstep( 0.0, 0.45, l ) ) + gHigh * smoothstep( 0.45, 1.0, l );
      col = pow( max( col, 0.0 ), vec3( 1.0 / max( uBright, 0.05 ) ) );
      // the Outage: fine scanlines, a rolling bright bar, flicker, sync-slip tear line
      if ( uScan > 0.0 ) {
        col *= 1.0 - uScan * 0.1 * ( 0.5 + 0.5 * cos( gl_FragCoord.y * 3.14159265 ) );
        float roll = fract( vUv.y * 0.85 + uTime * 0.11 );
        col *= 1.0 + uScan * ( 0.08 * smoothstep( 0.0, 0.03, roll ) * ( 1.0 - smoothstep( 0.03, 0.2, roll ) ) - 0.025 );
        col *= 1.0 - uScan * uFlick;
        col += uSlip * slipBand * vec3( 0.05, 0.08, 0.075 ) * step( 0.55, h12( vec2( floor( vUv.y * uRes.y ), uSlipSeed + 1.0 ) ) );
      }
      // dirty lens: faint blotches that dim, and glow a little around bright areas
      float dirt = vn( vUv * vec2( 5.0, 3.2 ) + 3.1 ) * 0.6 + vn( vUv * 13.0 + 7.7 ) * 0.4;
      col *= 1.0 - gDirt * 0.1 * smoothstep( 0.4, 0.95, dirt );
      col += gGlow * smoothstep( 0.55, 1.0, l ) * dirt * 0.05;
      col *= 1.0 - uVig * smoothstep( 0.2, 0.78, length( cc * vec2( 1.0, 0.9 ) ) );
      if ( uRed > 0.0 ) {
        float e = smoothstep( 0.05, 0.7, length( cc ) );
        col = mix( col, col * vec3( 1.25, 0.55, 0.55 ) + vec3( 0.2, 0.0, 0.01 ) * ( 0.4 + e ), clamp( uRed, 0.0, 1.0 ) * 0.6 );
      }
      if ( uNoise > 0.0 ) {
        float fr = floor( uTime * 30.0 );
        float s = h12( gl_FragCoord.xy + fr * 17.3 ) * 0.75 + h12( vec2( floor( gl_FragCoord.y / 2.0 ), fr ) ) * 0.35 - 0.1;
        col = mix( col, vec3( clamp( s, 0.0, 1.0 ) ) * 0.85, clamp( uNoise, 0.0, 1.0 ) );
      }
      col *= uDim;
      col = mix( col, vec3( 0.0 ), clamp( uFade, 0.0, 1.0 ) );
      col = mix( col, vec3( 1.0 ), clamp( uWhite, 0.0, 1.0 ) );
      if ( uGrain > 0.0 ) {
        float fr = floor( uTime * 24.0 );
        float g = h12( gl_FragCoord.xy + fr * vec2( 37.1, 17.7 ) ) + h12( gl_FragCoord.xy * 1.37 + fr * vec2( 11.3, 53.9 ) ) - 1.0;
        float lg = dot( col, vec3( 0.3333 ) );
        col += g * uGrain * 0.42 * ( 0.5 + 0.5 * ( 1.0 - abs( lg * 2.0 - 1.0 ) ) );
      }
      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
    }`;
  const postMat = new THREE.ShaderMaterial({ name: 'post', uniforms: postU, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false });

  const post = { grain: null, ca: null, vignette: null, desat: 0, noise: 0, fade: 0, white: 0, dim: 1, blur: 0, brightness: null, redBadge: 0, menu: false, exposure: 1 };
  const POST_DEFAULTS = { ...post };
  const slip = { next: 8 + Math.random() * 7, t: -1, dur: 0.3, forced: 0 };
  function stepPost(rdt, now) {
    stepGrade(rdt);
    const p = api.post || post, g = gradeCur, opt = (typeof META !== 'undefined' && META.options) || {};
    const menu = !!p.menu || frozen || !!(api.overlay && api.overlay.scene);
    let grain = (p.grain ?? g.grain) * (opt.grain ?? 1) * (menu ? 0.6 : 1);
    if (opt.noise === false) grain = 0;
    const u = postU;
    u.uTime.value = now % 3600;
    u.uGrain.value = grain;
    u.uCA.value = p.ca ?? g.ca;
    u.uVig.value = p.vignette ?? g.vig;
    u.uDesat.value = U.clamp(p.desat || 0);
    u.uNoise.value = U.clamp(p.noise || 0);
    u.uFade.value = U.clamp(p.fade || 0);
    u.uWhite.value = U.clamp(p.white || 0);
    u.uDim.value = p.dim ?? 1;
    u.uBlur.value = U.clamp(p.blur || 0);
    u.uBright.value = p.brightness ?? opt.brightness ?? 1;
    u.uRed.value = U.clamp(p.redBadge || 0);
    u.gExp.value = g.exp * (p.exposure ?? 1); u.gSat.value = g.sat; u.gAccent.value = g.accent; u.gContrast.value = g.contrast; u.gPivot.value = g.pivot; u.gDirt.value = g.dirt; u.gGlow.value = g.glow;
    u.gLift.value.fromArray(g.lift); u.gGamma.value.fromArray(g.gamma); u.gGain.value.fromArray(g.gain); u.gShadow.value.fromArray(g.shadow); u.gHigh.value.fromArray(g.high);
    // Outage flicker + sync-slip every 8–15 s
    u.uScan.value = g.scan;
    if (g.scan > 0.01 || slip.forced > 0) {
      u.uFlick.value = Math.random() < 0.03 ? 0.06 + Math.random() * 0.06 : Math.random() * 0.018;
      slip.next -= rdt;
      if (slip.next <= 0 && slip.t < 0) { slip.t = 0; slip.dur = 0.22 + Math.random() * 0.3; u.uSlipY.value = 0.15 + Math.random() * 0.7; u.uSlipSeed.value = Math.random() * 100; }
      if (slip.t >= 0) {
        slip.t += rdt;
        const k = slip.t / slip.dur;
        u.uSlip.value = k < 1 ? Math.sin(k * Math.PI) * Math.max(g.scan, slip.forced) * (0.7 + Math.random() * 0.3) : 0;
        if (k >= 1) { slip.t = -1; slip.forced = 0; slip.next = 8 + Math.random() * 7; }
      }
    } else { u.uFlick.value = 0; u.uSlip.value = 0; slip.t = -1; }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Init / resize / update / render
  // ---------------------------------------------------------------------------------------------------------------
  function init(canvas) {
    if (renderer) return api;
    canvasEl = canvas || document.getElementById('gl');
    if (!canvasEl) { canvasEl = document.createElement('canvas'); document.body.appendChild(canvasEl); }
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    renderer.setClearColor(0x000000, 1);
    canvasEl.style.width = '100%'; canvasEl.style.height = '100%';
    canvasEl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('[Render] WebGL context lost'); });
    renderer.setSize(Math.max(2, Math.round(window.innerWidth * scale)), Math.max(2, Math.round(window.innerHeight * scale)), false);
    composer = new EffectComposer(renderer); // HalfFloat targets: the scene stays linear HDR until the post pass
    composer.setPixelRatio(1);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    postPass = new ShaderPass(postMat, 'tNoInput'); // tDiffuse is bound manually (world frame, frozen frame or overlay)
    postPass.needsSwap = false;
    composer.addPass(postPass);
    overlayRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    buildSheets();
    buildSpecks();
    applyEnv();
    resize();
    window.addEventListener('resize', resize);
    return api;
  }
  function resize() {
    if (!renderer) return;
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    iw = Math.max(2, Math.round(w * scale)); ih = Math.max(2, Math.round(h * scale));
    renderer.setSize(iw, ih, false);
    composer.setSize(iw, ih);
    overlayRT.setSize(iw, ih);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const oc = api.overlay && api.overlay.camera;
    if (oc && oc.isPerspectiveCamera) { oc.aspect = w / h; oc.updateProjectionMatrix(); }
    postU.uRes.value.set(iw, ih);
    speckU.uResY.value = ih;
    needFrame = true;
  }
  function focusFromCamera() {
    camera.getWorldDirection(tmpV);
    camera.getWorldPosition(lastFocus).addScaledVector(tmpV, 6);
    lastFocus.y = Math.max(0, lastFocus.y - 1.6);
  }
  // update(dt, focus:Vector3|[x,y,z]) — animates fog sheets, dead air, torch flicker, party lights, env fades.
  function update(dt = 0, focus) {
    updated = true;
    prevFocus.copy(lastFocus);
    if (focus) { lastFocus.copy(U.toV3(focus)); focusSet = true; } else if (!focusSet) focusFromCamera();
    if (!focusSet && prevFocus.lengthSq() === 0) prevFocus.copy(lastFocus);
    const time = (performance.now() / 1000) % 3600;
    stepEnv(dt);
    updateTorch(dt);
    updateParty(dt);
    assignLights(dt);
    camera.getWorldPosition(camPos);
    updateSheets(dt, time, camPos);
    if (speckMesh) {
      const c = env.cur;
      speckMesh.visible = c.specks > 0.01;
      speckU.uTime.value = time; speckU.uFocus.value.copy(lastFocus); speckU.uFogD.value = c.density; speckU.uOpacity.value = c.specks;
    }
    Tex.setFocus(lastFocus);
    Tex.tick(dt);
  }
  function render(dt) {
    if (!renderer) return;
    const now = performance.now() / 1000;
    const rdt = lastNow ? Math.min(0.1, now - lastNow) : 1 / 60;
    lastNow = now;
    if (dt === undefined) dt = (typeof Time !== 'undefined' && Time.dt) || rdt;
    if (!updated) update(dt);
    updated = false;
    stepPost(rdt, now);
    renderer.info.reset();
    const ov = api.overlay;
    if (ov && ov.scene && ov.camera) {
      renderPass.enabled = false;
      renderer.setRenderTarget(overlayRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(ov.scene, ov.camera);
      postU.tDiffuse.value = overlayRT.texture;
    } else {
      renderPass.enabled = !frozen || needFrame;
      renderPass.scene = scene; renderPass.camera = camera;
      if (renderPass.enabled) needFrame = false;
      postU.tDiffuse.value = composer.readBuffer.texture;
    }
    const before = renderer.info.render.calls, beforeT = renderer.info.render.triangles;
    composer.render(dt);
    worldCalls = renderer.info.render.calls - before - 1;
    worldTris = renderer.info.render.triangles - beforeT - 1;
  }
  function freeze(v = true) {
    const was = frozen;
    frozen = !!v;
    if (!frozen && was) needFrame = true;
    return frozen;
  }
  // Render targets for mirrors/CCTV: linear HDR colour, sampled directly by materials.
  function renderTarget(w = 256, h = 256, o = {}) {
    const t = new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), { type: THREE.HalfFloatType, depthBuffer: true, ...o });
    t.texture.name = 'rt';
    return t;
  }
  // renderTo(target, camera, scene = Render.scene, {hide:[objects]}) — reuses this frame's shadow map.
  function renderTo(target, cam, sc = scene, o = {}) {
    if (!renderer || !target || !cam) return;
    const hidden = [];
    for (const obj of o.hide || []) if (obj && obj.visible) { obj.visible = false; hidden.push(obj); }
    const prev = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(sc, cam);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = au;
    for (const obj of hidden) obj.visible = true;
  }
  // CONTRACT+: Render.mirror({w,h,fov,every,scene}) → {target, texture, camera, update(faceObj, {hide, viewer}), dispose()}
  // A small planar-mirror approximation (the Standard's face): renders from the face along the viewer's reflected
  // line of sight into a horizontally flipped texture. Use `texture` as the face material's map (MeshBasicMaterial
  // or an emissive map); the face object is hidden automatically while rendering. faceObj's local +Z is its normal.
  function mirror(o = {}) {
    const w = o.w || 256, h = o.h || 256;
    const target = renderTarget(w, h);
    target.texture.wrapS = THREE.RepeatWrapping; target.texture.repeat.x = -1; target.texture.offset.x = 1;
    const cam = new THREE.PerspectiveCamera(o.fov || 55, w / h, 0.05, o.far || 40);
    const n = new THREE.Vector3(), v = new THREE.Vector3(), eye = new THREE.Vector3();
    let frame = 0;
    const m = {
      target, texture: target.texture, camera: cam, every: o.every || 1,
      update(face, { hide = [], viewer = camera } = {}) {
        if (!renderer || !face || frame++ % m.every) return;
        face.updateWorldMatrix(true, false);
        face.getWorldPosition(cam.position);
        n.set(0, 0, 1).transformDirection(face.matrixWorld);
        cam.position.addScaledVector(n, 0.03);
        viewer.getWorldPosition(eye);
        v.copy(cam.position).sub(eye).normalize();
        v.sub(tmpV.copy(n).multiplyScalar(2 * v.dot(n))).lerp(n, 0.35).normalize();
        cam.up.set(0, 1, 0);
        cam.lookAt(tmpV.copy(cam.position).add(v));
        renderTo(target, cam, o.scene || scene, { hide: [face, ...hide] });
      },
      dispose() { target.dispose(); },
    };
    return m;
  }
  function stats() {
    const lights = allSlots.filter((s) => s.used && s.light.intensity > 0).length + (torchSt.on ? 1 : 0);
    if (!renderer) return { calls: 0, triangles: 0, lights };
    return {
      calls: worldCalls, triangles: worldTris, lights,
      frameCalls: renderer.info.render.calls, programs: renderer.info.programs ? renderer.info.programs.length : 0,
      textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
      pool: { point: pool.point.filter((s) => s.used).length, spot: pool.spot.filter((s) => s.used).length, virtual: vlights.length, lit: vlights.filter((h) => h.lit).length },
      grade: gradeName, internal: [iw, ih],
    };
  }
  // CONTRACT+: Render.project(v3) → {x, y (CSS px), visible} for UI anchoring.
  function project(p) {
    tmpV.copy(U.toV3(p)).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight, visible: tmpV.z > -1 && tmpV.z < 1 && Math.abs(tmpV.x) <= 1 && Math.abs(tmpV.y) <= 1 };
  }
  // CONTRACT+: Render.capture() → PNG data URL of a freshly rendered frame (debug screenshots).
  function capture() { if (!renderer) return null; render(0); return canvasEl.toDataURL('image/png'); }

  const api = {
    init, resize, update, render, scene, camera, post, overlay: null, torch,
    setGrade, setEnvironment, setAmbient, allocLight, freeAllLights, halo, freeze, renderTarget, renderTo, mirror, stats, lightAt,
    project, capture,
    // CONTRACT+: Render.glitch(dur = 0.35, strength = 1) — trigger a horizontal sync-slip now (any world/grade).
    glitch(dur = 0.35, strength = 1) { slip.t = 0; slip.dur = dur; slip.forced = strength; postU.uSlipY.value = 0.15 + Math.random() * 0.7; postU.uSlipSeed.value = Math.random() * 100; },
    // CONTRACT+ extras
    party: partyLights,                         // Render.party(on, {center:[x,y,z], radius, y, count, intensity})
    resetPost() { Object.assign(api.post, POST_DEFAULTS); },
    setScale(s) { scale = U.clamp(s, 0.2, 1); resize(); },
    get renderer() { return renderer; },
    get grade() { return gradeName; },
    get frozen() { return frozen; },
    get env() { return { outdoor: env.outdoor, outage: env.outage, noFog: env.noFog, density: fog.density, sheets: env.sheets }; },
    get fog() { return fog; },
    get focus() { return lastFocus; },
    GRADES,
  };
  return api;
})();
