// ==== engine/16_game.js — Game: boot, main loop, modes, chapters, death, endings, results, New Game+ ====
// ARCHITECTURE §13 · spec §2A (title → new game → calibration → play; pause; death; results), §4 (ending logic),
// §12 (endings flow, fate cards, credits, New Game+), §14 (acceptance).
//
// Boot: Render / Input / UI / Menus / Snd (the AudioContext resumes on the first gesture) / Debug, the main loop,
//   LOADING while Tex.preload + Kit.preload generate every texture, then the title. SH.ready = true once the title
//   screen is up.
// Main loop (requestAnimationFrame; contract §13 order): Input.update → Menus.update (while open) → Script.update →
//   (pause / Tab / M / C) → Player.update → Enemies.update → World.update → Phone.update → Rig.update → Cam.update →
//   Snd.update → UI.update → Render.update + render → Debug.update. Real dt is clamped to 0.05; Time.dt is 0 while a
//   menu is open (the game is paused) and Time.now only advances in play. On the title the backdrop (and an attract
//   script) runs on real time, so the fog, the lights and the camera drift keep moving behind the menu.
// Modes (Game.mode): 'boot' → 'title' (Menus reports 'newgame' / 'calibrate' while those screens are up) → 'play'
//   ('menu' while a screen is open, 'cutscene' while a letterboxed scene runs) → 'death' → 'play' | 'title';
//   'ending' → 'credits' → 'fates' → 'results' → 'title'. 'loading' covers the black gaps in between.
// Title backdrop: ROOMS.t_title built on its own (no spawns, no player) and framed by its first camera with a slow
//   drift; without it a small built-in fog vista (a lookout over the fogged town, the mast's red light blinking far
//   off). 60 idle seconds → the attract sequence: SCRIPTS['title:attract'](G, {signal, show}) when content defines it,
//   else silent shots of whichever of c1_relay, c2_crescent, c3_hall, c5_atrium exist (their static cameras).
// Chapters: Game.startChapter(n, {card, skipIntro}) sets S.chapter (Bus 'chapter'), shows CHAPTERS[n].card on black,
//   autosaves, goes to CHAPTERS[n].start and runs CHAPTERS[n].begin(G) as a persistent background script (not awaited,
//   so a blocking script that called it never deadlocks with the chapter's first cutscene). skipIntro skips the first
//   skippable scene begin() plays (SH.newGame({skipIntro:true}) starts at the Prologue gameplay).
// Endings: Game.endingFor(S) is spec §4 exactly (Yes first: playthrough ≥ 2 and all 12 Ollie stickers in META.stickers ∪
//   S.stickers). Game.ending(name, {parent}) plays the ending's cutscenes that content registered (skipping any that
//   don't exist yet): connected E-C1 (unless Ch 8 already played it) → E-C2 → credits (the Nan motif) → E-C3
//   (post-credits "Ask First") → fate cards → results; coverage E-OC0 (unless played) → E-OC → credits (wind and static)
//   → fates → results; tomorrow E-FT0 (unless played or the deal was accepted) → E-FT → credits → results (no fates);
//   yes E-YES → credits (the hold music, a quicker roll) → results. Fate-card texts come from DIALOGUE.fates
//   ([{flag, saved, lost}], data/19_endings.js) when defined, else Menus' own table. Results are recorded
//   (META.endingsSeen / results / completed → EXTRA and New Game+ unlock); Aidan's body is put back as a new game
//   expects it (posture, the phone in his hand, nothing in the other), then the title.
// Fog culling: Rig actors beyond the fog's cutoff (≈ 2.45 / density m) are skipped by the renderer (render layer 1),
//   with the groups listed in actor.cullWith (an enemy's fx group), and so are the room's merged static batches (kit:*)
//   wholly beyond 3 / density; it runs on SH.advance's manual ticks too.
// Debug jumps (Game.debugRoom = SH.goto) in play cancel a transition in flight and abort running blocking scripts.
// CONTRACT+: Game.fps, Game.culled, Game.manual(on) (SH.advance), Game.autosave(), Game.goTitle(), Game.results(name) (the §2A results
//   record + stars without showing it), Game.rank(stats), Game.stickerCount(S), Game.debugStart(n, o),
//   Game.debugRoom(room, entry), Game.wait(sec) (real-time Promise stepped by the loop), Game.flow (current flow name).
const Game = (() => {
  const STICKERS = Array.from({ length: 12 }, (_, i) => 'sticker' + String(i + 1).padStart(2, '0'));
  const ENDINGS = {
    connected: { pre: ['E-C1'], main: ['E-C2'], post: ['E-C3'], fates: true, name: 'CONNECTED' },
    coverage: { pre: ['E-OC0'], main: ['E-OC'], post: [], fates: true, name: 'OUT OF COVERAGE' },
    tomorrow: { pre: ['E-FT0'], main: ['E-FT'], post: [], fates: false, name: 'FOLLOW UP TOMORROW' },
    yes: { pre: [], main: ['E-YES'], post: [], fates: false, name: 'YES', creditSpeed: 6.2 },
  };
  const ATTRACT_ROOMS = ['c1_relay', 'c2_crescent', 'c3_hall', 'c5_atrium'];
  const errors = () => (window.SH && Array.isArray(window.SH.errors) ? window.SH.errors : []);

  let mode = 'boot', flow = null, flowTok = 0, booted = false;
  let raf = 0, lastReal = 0, manualN = 0, fps = 60;
  const timers = [];
  const failed = new Map();

  // ---------------------------------------------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------------------------------------------
  // a system call that must never take the loop down: logs the first few failures per system (and into SH.errors)
  function safe(name, fn) {
    try { return fn(); } catch (e) {
      const n = (failed.get(name) || 0) + 1;
      failed.set(name, n);
      if (n <= 3) { console.error(`[Game] ${name} failed`, e); errors().push(`[Game] ${name}: ${e && e.message ? e.message : e}`); }
      return undefined;
    }
  }
  const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch((e) => console.error('[Game]', e)); return p; };
  // real-time tween/sleep stepped by the loop (so SH.advance fast-forwards it too)
  function tween(dur, fn) { return new Promise((r) => { timers.push({ t: 0, dur: Math.max(0.0001, dur), fn, r }); }); }
  const wait = (s) => tween(s, null);
  function stepTimers(dt) {
    if (!timers.length) return;
    for (const w of timers.slice()) {
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      if (w.fn) { try { w.fn(k); } catch (e) { console.error('[Game] tween', e); } }
      if (k >= 1) { timers.splice(timers.indexOf(w), 1); w.r(); }
    }
  }
  function waitFor(pred, maxSec = 30) {
    return new Promise((res) => {
      const w = { t: 0, dur: maxSec, fn: null, r: () => res(false) };
      w.fn = () => { let ok = false; try { ok = pred(); } catch (e) { ok = true; } if (ok) { timers.splice(timers.indexOf(w), 1); res(true); } };
      timers.push(w);
    });
  }
  function showPlayer(on) {
    try {
      const a = Player.actor;
      if (!a) return;
      if (typeof a.visible === 'function') a.visible(!!on); else a.root.visible = !!on;
      if (!on && a.setPhoneLight) a.setPhoneLight(0);             // (Player turns the phone glow back on in play)
    } catch (e) { /* no actor */ }
  }
  function bootText(text, progress) {
    const b = document.getElementById('boot');
    if (!b) return;
    if (text === null) { b.remove(); return; }
    if (!b.dataset.built) {
      b.dataset.built = '1';
      b.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:14px"><div class="bt" style="letter-spacing:.3em;font-size:13px;color:#6f6f6a">LOADING</div>'
        + '<div style="width:140px;height:1px;background:#1c1c1a"><div class="bp" style="height:1px;width:0;background:#6f6f6a"></div></div></div>';
      b.style.zIndex = '9800';
    }
    const t = b.querySelector('.bt'), p = b.querySelector('.bp');
    if (t && text) t.textContent = text;
    if (p && progress !== undefined) p.style.width = Math.round(U.clamp(progress) * 140) + 'px';
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The stage: a room shown without World (title backdrop, attract shots): no player, no spawns, no hooks
  // ---------------------------------------------------------------------------------------------------------------
  const stage = { rb: null, def: null, t: 0 };
  // the built-in fog vista used until data/20_title.js provides t_title: the Lookout's gravel shoulder over the town
  let glowTex = null;
  function vistaGlow() {                          // one shared radial sprite texture (kept across title visits)
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; glowTex.userData.shared = true;
    return glowTex;
  }
  const VISTA = {
    id: '__vista', name: 'VISTA', outdoor: true, fog: { density: 0.021 }, ambient: 'wind', surface: 'gravel',
    build(K) {
      K.floor(-9, -7, 9, 9, 'gravel');
      K.prop('guardrail', 0, -6.2, 0, { len: 16 });
      K.prop('streetlight', -5.5, -3.5, 90);
      K.prop('road_sign', 6.2, -5.2, 200);
      K.prop('gum_tree', -8.2, -5.5, 30); K.prop('gum_tree_small', 8.4, -1.5, 120); K.prop('shrub', -3.6, -6.7, 0); K.prop('shrub', 3.2, -6.8, 70);
      // the hill falls away past the rail, down to the town
      K.floor(-60, -80, 60, -7, { tex: 'grass', color: '#3c4540' }, { ramp: { axis: 'z', y0: -30, y1: -0.3 } });
      for (let i = 0; i < 7; i++) K.prop('shrub', -15 + i * 5 + K.rng() * 2, -9 - K.rng() * 6, K.rng() * 360, { collide: false });
      // the town: houses and cottages stepping down the hill, a few gum trees between them
      const houses = [];
      const hillY = (z) => -0.3 + ((z + 7) / 73) * 29.7;
      for (let i = 0; i < 16; i++) {
        const x = -44 + (i % 8) * 12 + K.rng() * 6, z = -24 - Math.floor(i / 8) * 16 - K.rng() * 10, y = hillY(z);
        const kind = K.rng() < 0.45 ? 'cottage' : 'house';
        K.prop(kind, x, z, 150 + K.rng() * 60, { y, collide: false, lit: false, seed: i + 3 });
        houses.push([x, y, z]);
      }
      for (let i = 0; i < 7; i++) { const z = -30 - K.rng() * 30; K.prop(i % 2 ? 'gum_tree' : 'gum_tree_small', -42 + K.rng() * 50, z, K.rng() * 360, { y: hillY(z), collide: false }); }
      // lights through the fog (fog-immune additive sprites: they read as lamps glowing in the murk)
      const glow = vistaGlow();
      const lights = new THREE.Group(); lights.name = 'vista:lights';
      const spr = (x, y, z, s, color, op) => {
        const m = new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
        const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(s); sp.userData.op = op; lights.add(sp); return sp;
      };
      const lamps = [];
      for (let i = 0; i < houses.length; i += 3) { const [x, y, z] = houses[i]; lamps.push(spr(x + 1.5, y + 1.6, z + 4.5, 1.3, '#ffb060', 0.12 + K.rng() * 0.08)); }
      lamps.push(spr(-18, hillY(-32) + 6, -32, 3.2, '#ff9340', 0.2), spr(14, hillY(-42) + 6, -42, 3, '#ff9340', 0.16), spr(2, hillY(-52) + 6, -52, 2.6, '#ff9340', 0.12));
      // the mast far off to the north-east with its blinking red aircraft lights
      const mx = 52, mz = -112, my = -30;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        K.cyl(mx + Math.cos(a) * 1.4, my, mz + Math.sin(a) * 1.4, 0.16, 46, '#1b2120', { r2: 0.06, seg: 5, name: 'vista:mastleg' + k });
      }
      for (let yy = 3; yy < 44; yy += 4.5) K.box(mx, my + yy, mz, 3.2 - yy * 0.06, 0.1, 0.1, '#1b2120', { name: 'vista:brace' + yy });
      const red = spr(mx, my + 46.6, mz, 5.5, '#ff2a1c', 0);
      const red2 = spr(mx, my + 30, mz, 3.6, '#ff2a1c', 0);
      K.mesh(lights, { name: 'vista:lights' });
      K.animate((dt, t) => {
        red.material.opacity = (t % 2.1) < 0.6 ? 0.95 : 0.04;
        red2.material.opacity = ((t + 1.05) % 2.1) < 0.6 ? 0.55 : 0;
        for (let i = 0; i < lamps.length; i++) lamps[i].material.opacity = lamps[i].userData.op * (0.85 + 0.15 * Math.sin(t * 0.7 + i * 1.7));
      });
    },
  };
  const VISTA_CAM = { keys: [{ t: 0, pos: [0.6, 2.8, -1.6], target: [9, -6.5, -52], fov: 46 }, { t: 90, pos: [-0.3, 2.85, -2.0], target: [7.5, -6.7, -52], fov: 45 }] };

  function stageShow(def, camSpec) {
    stageClear();
    let rb;
    try { rb = Kit.build(def); } catch (e) { console.error('[Game] stage build', def && def.id, e); return false; }
    stage.rb = rb; stage.def = def; stage.t = 0;
    Render.scene.add(rb.group);
    if (rb.applyWorld) rb.applyWorld(false);
    Tex.setOutage(0);
    Render.setEnvironment({ outdoor: !!def.outdoor, outage: false, fog: def.fog || null, noFog: !!def.noFog, grade: def.grade || undefined, ...(def.env || {}) });
    if (rb.ambient) Render.setAmbient(rb.ambient.color, rb.ambient.intensity); else Render.setAmbient(null);
    safe('Snd.ambient', () => { Snd.setWorld('fog'); Snd.ambient(def.ambient || (def.outdoor ? 'wind' : 'interior')); });
    Cam.scripted(camSpec || camFor(def));
    return true;
  }
  // the room's first camera as a slow drift (static/pan → a few centimetres of push over a minute; rail → along it)
  function camFor(def, index = 0) {
    const list = CAMERAS[def.id] || def.cameras || [];
    const c = list[index] || list[0];
    if (!c) {
      const b = def.bounds || [-5, -5, 5, 5];
      return { pos: [(b[0] + b[2]) / 2, 3.2, b[3]], target: [(b[0] + b[2]) / 2, 1, (b[1] + b[3]) / 2], fov: 50 };
    }
    if (Array.isArray(c.keys) && c.keys.length) return { keys: c.keys };
    const fov = typeof c.fov === 'number' ? c.fov : 48;
    const pos = c.type === 'rail' && c.rail ? c.rail.a : c.pos, target = c.target || (c.vol ? [(c.vol[0] + c.vol[2]) / 2, 1, (c.vol[1] + c.vol[3]) / 2] : [0, 1, 0]);
    const end = c.type === 'rail' && c.rail ? c.rail.b : pos;
    const push = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize().multiplyScalar(0.6);
    const pos2 = c.type === 'rail' ? end : [end[0] + push.x, end[1] + push.y, end[2] + push.z];
    return { keys: [{ t: 0, pos, target, fov, roll: c.roll || 0 }, { t: c.type === 'rail' ? 14 : 60, pos: pos2, target, fov: fov - 1, roll: c.roll || 0 }] };
  }
  function stageUpdate(dt) {
    if (!stage.rb) return;
    stage.t += dt;
    const a = stage.rb.animated;
    for (let i = 0; i < a.length; i++) { try { a[i](dt, stage.t); } catch (e) { a.splice(i--, 1); console.error('[Game] stage animation', e); } }
  }
  function stageClear() {
    if (!stage.rb) return;
    const rb = stage.rb;
    stage.rb = null; stage.def = null;
    try { rb.group.removeFromParent(); rb.dispose(); } catch (e) { console.error('[Game] stage dispose', e); }
    Render.setAmbient(null);
    safe('Cam.release', () => Cam.release());
  }
  function titleBackdrop() {
    if (ROOMS.t_title) { if (stageShow(ROOMS.t_title)) return; }
    stageShow(VISTA, VISTA_CAM);
  }
  // attract (spec §2A step 5): silent shots of empty locations, no text; any input aborts (the signal)
  async function attract(signal) {
    const show = async (roomId, o = {}) => {
      if (signal.aborted || !ROOMS[roomId]) return false;
      await UI.fade(1, 1.2);
      if (signal.aborted) return false;
      stageShow(ROOMS[roomId], o.cam || camFor(ROOMS[roomId], o.index || 0));
      await UI.fade(0, 1.6);
      const hold = o.dur ?? 7;
      await waitFor(() => signal.aborted, hold);
      return !signal.aborted;
    };
    try {
      if (typeof SCRIPTS['title:attract'] === 'function') {
        await Script.run((G) => SCRIPTS['title:attract'](G, { signal, show }), { control: true, persist: true, name: 'title:attract' });
      } else {
        const rooms = ATTRACT_ROOMS.filter((id) => ROOMS[id]);
        if (!rooms.length) await waitFor(() => signal.aborted, 16);
        for (const id of rooms) { if (!(await show(id))) break; }
      }
    } catch (e) { console.error('[Game] attract', e); }
    await UI.fade(1, signal.aborted ? 0.4 : 1.2);
    if (mode === 'title') titleBackdrop();
    await UI.fade(0, 1.2);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------------------------------------------
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    const real = lastReal ? now - lastReal : 1 / 60;
    lastReal = now;
    if (real > 0 && real < 1) fps = U.lerp(fps, 1 / real, 0.08);
    if (manualN > 0) return;
    tick(Math.min(0.05, Math.max(0, real)), true);
  }
  const isTitle = () => mode === 'title' || mode === 'boot';
  function tick(dt, render = true) {
    dt = Math.min(0.05, Math.max(0, +dt || 0));
    Time.frame++;
    Time.real += dt;
    // under SH.advance (manual ticks) Input's clock follows the game tick, so held keys / SH.press holds last game time
    safe('Input', () => Input.update(manualN > 0 ? dt : undefined));
    if (safe('Menus.isOpen', () => Menus.isOpen())) safe('Menus', () => Menus.update(dt));
    const menu = !!safe('Menus.isOpen', () => Menus.isOpen());
    const title = isTitle();
    const paused = menu && !title;
    const gdt = title ? dt : paused ? 0 : dt;
    Time.paused = paused || title;
    Time.dt = gdt;
    if (!paused && !title) {
      Time.now += dt;
      if (mode === 'play' && S && S.stats) S.stats.time = (S.stats.time || 0) + dt;
    }
    safe('Script', () => Script.update(gdt));
    if (mode === 'play') safe('shortcuts', shortcuts);
    if (!title) {
      safe('Player', () => Player.update(gdt));
      safe('Enemies', () => Enemies.update(gdt));
    }
    safe('World', () => World.update(gdt));
    if (!title) safe('Phone', () => Phone.update(gdt));
    stageUpdate(gdt);
    safe('Rig', () => Rig.update(gdt));
    safe('Cam', () => Cam.update(gdt));
    safe('Snd', () => Snd.update(dt));
    stepTimers(dt);
    safe('UI', () => UI.update(dt));
    safe('Render.update', () => Render.update(gdt, focus()));
    // (fog culling runs on manual ticks too, so Render.render(0) after SH.advance draws — and counts — what a real frame would)
    safe('fogCull', fogCull);
    if (render) safe('Render', () => Render.render(dt));
    safe('Debug', () => Debug.update(dt));
  }
  const _f = new THREE.Vector3(), _d = new THREE.Vector3();
  function focus() {
    if (!isTitle() && World.room && Player.actor) return Player.pos;
    Render.camera.getWorldDirection(_d);
    _f.copy(Render.camera.position).addScaledVector(_d, 9);
    _f.y = Math.max(0, _f.y - 1.5);
    return _f;
  }
  // Fog culling: Rig actors (people and rig-built monsters, 35–65 draw calls each) further from the camera than the fog
  // lets anything through (FogExp2 transmittance below 0.25 %) move to render layer 1, which no camera draws — a visual
  // no-op that keeps long foggy streets full of figures (8-1's summit road) inside the draw-call budget. Aidan is never
  // culled; nothing else in the engine uses layers. Game.culled → how many actors are culled this frame.
  const CULL_LAYER = 1;
  const culled = new Set();
  const _cp = new THREE.Vector3(), _ap = new THREE.Vector3();
  // actor.cullWith = [Object3D…]: groups that live outside the actor's root but belong to its body (an enemy's fx group —
  // the Tethered's tether and box — set by Enemies) are culled with it
  function setCulled(a, off) {
    if (off) culled.add(a); else culled.delete(a);
    // (parts drawn by the figure's batch — Rig.batch — stay on no layer at all: userData.rigHidden)
    const set = (o) => { if (o.userData.rigHidden) return; if (off) o.layers.set(CULL_LAYER); else o.layers.set(0); };
    a.root.traverse(set);
    if (Array.isArray(a.cullWith)) for (const g of a.cullWith) if (g && g.traverse) g.traverse(set);
  }
  // Static geometry too: the room's merged batches (kit:* — most of a room's triangles, in ≤ 40 m cells) whose nearest
  // point lies beyond 3 / density (FogExp2 lets e^-9 ≈ 0.01 % through: nothing shows, even a bright emissive) go to
  // layer 1 as well — a long street no longer draws the blocks the fog has swallowed. Only fogged materials; only the
  // room's static batches (they never move). Game.staticCulled → how many this frame.
  let sBuild = null, sList = [], sCulled = 0;
  function staticList(rb) {
    const out = [];
    for (const m of rb.group.children) {
      if (!m.isMesh || !/^kit:/.test(m.name) || !m.geometry) continue;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some((q) => !q || q.fog === false)) continue;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.updateMatrixWorld(true);
      out.push({ m, s: m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld), off: false });
    }
    return out;
  }
  function staticCull(d) {
    const rb = typeof World !== 'undefined' ? World.build : null;
    if (rb !== sBuild) { sBuild = rb; sList = rb && rb.group ? staticList(rb) : []; sCulled = 0; }
    if (!sList.length) return;
    const far = d > 0.004 ? 3 / d : Infinity;
    Render.camera.getWorldPosition(_cp);
    let n = 0;
    for (const it of sList) {
      const off = far < Infinity && _cp.distanceTo(it.s.center) - it.s.radius > far;
      if (off !== it.off) { it.off = off; it.m.layers.set(off ? CULL_LAYER : 0); }
      if (off) n++;
    }
    sCulled = n;
  }
  function fogCull() {
    const live = Rig.actors;
    for (const a of [...culled]) if (!live.has(a)) culled.delete(a);
    const d = Render.fog ? Render.fog.density : 0;
    const me = Player.actor;
    staticCull(d);
    if (!(d > 0.004)) { for (const a of [...culled]) setCulled(a, false); return; }
    const far = Math.sqrt(6) / d;
    Render.camera.getWorldPosition(_cp);
    for (const a of live) {
      if (a === me || !a.root || !a.root.parent) { if (culled.has(a)) setCulled(a, false); continue; }
      const dist = a.root.getWorldPosition(_ap).distanceTo(_cp) - (a.height || 1.8);
      const is = culled.has(a);
      if (!is && dist > far + 1.5) setCulled(a, true);
      else if (is && dist < far) setCulled(a, false);
    }
  }

  // Esc → pause; Tab / M / C → items / map / phone (spec §3). Nothing opens over a capture (choice, keypad, in-world
  // screen), a room transition or death; Tab / M / C also wait while a blocking script owns the input.
  function shortcuts() {
    if (Menus.isOpen() || UI.capturing() || World.transitioning || Player.dead || flow) return;
    if (Input.pressed('pause')) { Input.consume('pause'); openMenu('pause'); return; }
    if (Script.busy) return;
    if (Input.pressed('inventory')) { Input.consume('inventory'); openMenu('items'); }
    else if (Input.pressed('map')) { Input.consume('map'); openMenu('map'); }
    else if (Input.pressed('phone')) { Input.consume('phone'); openMenu('phone'); }
  }
  function openMenu(name, o = {}) {
    return quiet(Promise.resolve(Menus.open(name, o)).then((r) => { if (r === 'title') goTitle(); return r; }));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Boot and the title
  // ---------------------------------------------------------------------------------------------------------------
  async function boot() {
    if (booted) return;
    booted = true;
    mode = 'boot';
    const canvas = document.getElementById('gl');
    Render.init(canvas);
    Input.init(canvas);
    UI.init();
    UI.fade(1, 0);
    Menus.init();
    safe('Snd.init', () => { Snd.init(); Snd.setVolumes(); });
    Debug.init();
    raf = requestAnimationFrame(frame);
    bootText('LOADING', 0);
    try {
      const variants = [['bitumen', { lines: 'center' }], ['bitumen', { lines: 'double' }], ['bitumen', { lines: 'edge' }]];
      await Tex.preload([...Tex.list(), ...variants], (i, n) => bootText('LOADING', (i / n) * 0.75));
      await Kit.preload((i, n) => bootText('LOADING', 0.75 + (i / n) * 0.2));
    } catch (e) { console.error('[Game] preload', e); }
    safe('Player.init', () => { Player.init(); showPlayer(false); });
    bootText('LOADING', 1);
    await wait(0.1);
    bootText(null);
    await title({ intro: true });
  }
  async function title(o = {}) {
    const tok = ++flowTok;
    mode = 'title'; flow = null;
    titleBackdrop();
    const p = Menus.open('title', { intro: o.intro !== false, onIdle: ({ signal }) => attract(signal) });
    window.SH.ready = true;
    const r = await p;
    if (tok !== flowTok) return null;                         // someone else (a new game from SH, a load) took over
    if (!r) return title({ intro: false });
    if (r.choice === 'load') return continueFrom(r.slot);
    if (r.choice === 'ngplus') return newGame({ action: r.action, riddle: r.riddle, ngPlus: true });
    return newGame({ action: r.action, riddle: r.riddle });
  }
  // tear the running game down to a black screen (scripts, menus, room, stage, enemies, sounds, post, player)
  async function teardown(o = {}) {
    // a room transition still running from the flow being replaced (the Prologue's P-1 moving between its sets when
    // a chapter select or a load comes in) must never finish later and land Aidan back in its room
    safe('World.cancelTransition', () => World.cancelTransition());
    safe('Script.abortAll', () => Script.abortAll(o.reason || 'reset'));
    if (Menus.isOpen()) { try { await Menus.close(null); } catch (e) { console.error(e); } }
    safe('UI.clear', () => { UI.clear({ letterbox: true }); UI.showHud(true); });
    await UI.fade(1, o.fade ?? 0.35);
    stageClear();
    safe('World.unload', () => World.unload());
    safe('Enemies', () => { Enemies.clear(); Enemies.standard.stop(); });
    safe('Cam', () => { Cam.release(); Cam.unload(); Cam.lock(null); });
    safe('Render', () => { Render.resetPost(); Render.freeze(false); Render.overlay = null; Render.party(false); Render.setAmbient(null); Tex.setOutage(0); });
    safe('Snd', () => { Snd.stopMusic(0.6); Snd.stopLoops(0.3); Snd.staticLevel(0); });
    safe('Phone', () => Phone.reset());
    safe('Player', () => { Player.reset(); Player.setTorch(false); Player.lock('death', false); Player.lock('chapter', false); Player.lock('ending', false); Player.noclip = false; });
    safe('heartbeat', () => Input.heartbeat(false));
    timers.length = 0;
  }
  async function goTitle() {
    const tok = ++flowTok;
    flow = 'title';
    mode = 'loading';
    await teardown({ reason: 'title', fade: 0.5 });
    if (tok !== flowTok) return;
    resetState();
    showPlayer(false);
    flow = null;
    return title({ intro: false });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // New game, chapters, loading
  // ---------------------------------------------------------------------------------------------------------------
  async function newGame(o = {}) {
    const tok = ++flowTok;
    flow = 'newgame';
    mode = 'loading';
    try {
      await teardown({ reason: 'newgame' });
      if (tok !== flowTok) return false;
      // every new game after a finished one is a further playthrough (the Yes ending needs playthrough ≥ 2); NG+
      // only adds its extras (the steel bar, the stickers carried over)
      const ng = !!(o.ngPlus || o.ngplus);
      const done = Math.max((META.results || []).length, META.completed ? 1 : 0);
      resetState({ action: o.action || 'normal', riddle: o.riddle || 'normal', ngPlus: ng, playthrough: ng ? Math.max(2, done + 1) : done + 1 });
      if (ng) {
        S.stickers = { ...(META.stickers || {}) };                           // NG+ keeps the collected Ollie stickers
        if (!S.inv.some((i) => i.id === 'steel_bar')) S.inv.push({ id: 'steel_bar', n: 1 });   // … and starts with the bar
      }
      Time.now = 0;
      safe('Player', () => Player.reset());
      showPlayer(true);
      mode = 'play';
      flow = null;
      if (CHAPTERS[0]) return await startChapter(0, { skipIntro: !!o.skipIntro, card: o.card });
      // no chapters yet (engine-only builds): the test room, else the first room
      const room = ROOMS.test_room ? 'test_room' : Object.keys(ROOMS)[0];
      if (!room) { console.warn('[Game] no rooms defined'); await UI.fade(0, 0.5); return false; }
      await enterRoom(room, null);
      return true;
    } finally { if (flowTok === tok && flow === 'newgame') flow = null; }
  }
  async function enterRoom(room, entry, o = {}) {
    safe('Cam.release', () => Cam.release());
    World.load(room, entry, o);
    showPlayer(true);
    safe('Cam.snap', () => Cam.snap());
    await UI.fade(0, o.fadeIn ?? 0.8);
    return World.room;
  }
  // Game.startChapter(n, {card, skipIntro}) — contract §12 (see the header)
  async function startChapter(n, o = {}) {
    n = Number(n);
    const ch = CHAPTERS[n];
    S.chapter = n;
    Bus.emit('chapter', n);
    if (!ch) { console.warn(`[Game] startChapter: no chapter ${n}`); return false; }
    mode = 'play';
    flow = 'chapter';
    safe('Player.lock', () => Player.lock('chapter', true));
    try {
      const cardText = ch.card ?? null;
      if (cardText && o.card !== false && !o.skipIntro) await UI.card(cardText, { sub: ch.cardSub });
      else await UI.fade(1, World.room ? 0.6 : 0);
      // the chapter-start autosave always records the chapter's entry (even when Aidan already stands in that room),
      // so continuing from it resumes at the entry and re-runs begin(G, {resumed:true})
      safe('Save.autosave', () => Save.autosave(ch.start && ch.start.room ? { room: ch.start.room, entry: ch.start.entry ?? null, chapterStart: n } : { chapterStart: n }));
      if (ch.start && ch.start.room && ROOMS[ch.start.room]) {
        safe('Cam.release', () => Cam.release());
        await World.goto(ch.start.room, ch.start.entry ?? null, { fade: false, sound: 'none' });
        showPlayer(true);
      } else if (ch.start) console.warn(`[Game] chapter ${n}: start room "${ch.start.room}" is not defined`);
    } finally {
      safe('Player.lock', () => Player.lock('chapter', false));
      flow = null;
    }
    quiet(UI.fade(0, 1.0));
    runBegin(ch, n, o);
    return true;
  }
  function runBegin(ch, n, o = {}) {
    if (typeof ch.begin !== 'function') return null;
    const p = Script.run((G) => ch.begin(G, { skipIntro: !!o.skipIntro, resumed: !!o.resumed }), { control: true, persist: true, name: 'chapter:' + n });
    if (o.skipIntro) {
      // skip the first skippable scene begin() plays (or give up after a few seconds of game time)
      quiet(waitFor(() => Script.skippable, 6).then((ok) => { if (ok) Script.skip(); }));
    }
    return p;
  }
  async function continueFrom(slot = 'auto') {
    const tok = ++flowTok;
    flow = 'load';
    mode = 'loading';
    try {
      if (slot === 'latest' || slot === null || slot === undefined) { const l = Save.latest(); slot = l ? l.slot : null; }
      if (slot === null) { console.warn('[Game] continueFrom: no save'); flow = null; return goTitle(); }
      await teardown({ reason: 'load' });
      if (tok !== flowTok) return false;
      const r = Save.load(slot);
      if (!r) { console.warn(`[Game] continueFrom: slot ${slot} could not be loaded`); flow = null; return goTitle(); }
      Time.now = 0;
      safe('Player', () => Player.reset());
      let room = r.room;
      const chStart = CHAPTERS[S.chapter] && CHAPTERS[S.chapter].start;
      if (!room || !ROOMS[room]) room = chStart && ROOMS[chStart.room] ? chStart.room : null;
      if (!room) { console.warn('[Game] continueFrom: the saved room no longer exists'); flow = null; return goTitle(); }
      mode = 'play';
      flow = null;
      await enterRoom(room, room === r.room ? r.entry : chStart.entry ?? null);
      // a chapter-start autosave (Save.load → chapterStart = n) resumes the chapter from the top
      const n = r.chapterStart;
      if (n !== null && n !== undefined && CHAPTERS[n]) { S.chapter = n; Bus.emit('chapter', n); runBegin(CHAPTERS[n], n, { resumed: true }); }
      return true;
    } catch (e) {
      console.error('[Game] continueFrom failed', e);
      flow = null;
      return goTitle();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Death (spec §2A): Aidan collapses, the camera holds on him, colour drains and static rises until it fills the
  // screen, a flat disconnected tone, "NO SIGNAL" small and centred for 3 s, then CONTINUE / LOAD GAME / TITLE.
  // ---------------------------------------------------------------------------------------------------------------
  let deathP = null;
  function death() {
    if (mode === 'death') return deathP;
    if (mode !== 'play') return null;                         // no deaths on the title, while loading or in the endings
    if (!Player.dead) { Player.kill(); if (mode === 'death') return deathP; }
    const tok = ++flowTok;
    mode = 'death'; flow = 'death';
    deathP = deathFlow(tok);
    quiet(deathP);
    return deathP;
  }
  async function deathFlow(tok) {
    if (Menus.isOpen()) { try { await Menus.close(null); } catch (e) { /* closed */ } }
    safe('Player.lock', () => Player.lock('death', true));
    safe('Cam.hold', () => { if (!Cam.isScripted && Cam.current) Cam.lock(Cam.current.id); });
    safe('UI', () => { UI.showHud(false); UI.callPrompt(null); UI.holdPrompt(null, 0); });
    await wait(0.9);                                              // he goes down; the camera holds
    safe('Snd', () => { Snd.stopLoops(1.5); Snd.ambient('none', 2.5); });
    await tween(2.8, (k) => {
      Render.post.desat = U.smooth(Math.min(1, k * 1.25));
      Render.post.noise = Math.pow(k, 1.6);
      safe('Snd.static', () => Snd.staticLevel(Math.min(1, k * 1.2)));
    });
    Render.post.noise = 1;
    await UI.noSignal({ keep: true, tone: true });
    safe('Snd.static', () => Snd.staticLevel(0));
    if (tok !== flowTok) return;
    for (;;) {
      const d = await Menus.open('death');
      if (tok !== flowTok) return;
      if (d === 'continue') {
        const l = Save.latest();
        if (l) { flow = null; await continueFrom(l.slot); return; }
      } else if (d === 'load') {
        const slot = await Menus.open('load');
        if (tok !== flowTok) return;
        if (slot !== null && slot !== undefined) { flow = null; await continueFrom(slot); return; }
      } else { flow = null; await goTitle(); return; }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Endings (spec §4 logic, §12 flow)
  // ---------------------------------------------------------------------------------------------------------------
  function stickerCount(s = S) {
    const all = { ...(META.stickers || {}), ...((s && s.stickers) || {}) };
    return STICKERS.filter((id) => all[id]).length;
  }
  function endingFor(s = S) {
    s = s || S;
    const f = s.flags || {}, F = +s.F || 0, A = +s.A || 0;
    if ((s.playthrough || 1) >= 2 && stickerCount(s) >= STICKERS.length) return 'yes';
    if (f.acceptedDeal || A >= F) return 'tomorrow';
    const saved = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukeSaved'].filter((k) => f[k]).length;
    if (F >= 35 && saved >= 3) return 'connected';
    return 'coverage';
  }
  let endingP = null;
  function ending(name, o = {}) {
    if (!ENDINGS[name]) { console.warn(`[Game] ending: unknown ending "${name}" — using Game.endingFor(S)`); name = endingFor(S); }
    if (mode === 'ending' && endingP) return endingP;
    const tok = ++flowTok;
    mode = 'ending'; flow = 'ending';
    endingP = endingFlow(name, o, tok);
    quiet(endingP);
    return endingP;
  }
  async function playCs(id, o) {
    if (!CUTSCENES[id]) { console.info(`[Game] ending cutscene "${id}" is not registered yet — skipped`); return false; }
    // inheritSkip:false — the ending's scenes never inherit a skip of the Ch 8 scene that called G.ending (a skipped
    // 8-1 would otherwise swallow E-YES and cut straight to the credits); each stays skippable on its own
    const r = await Script.playCutscene(id, o.parent ? { parent: o.parent, inheritSkip: false } : { inheritSkip: false });
    return r !== Script.ABORT;
  }
  async function endingFlow(name, o, tok) {
    const E = ENDINGS[name];
    const live = () => tok === flowTok;
    if (Menus.isOpen()) { try { await Menus.close(null); } catch (e) { /* closed */ } }
    safe('Player.lock', () => Player.lock('ending', true));
    safe('UI', () => UI.showHud(false));
    S.chapter = Math.max(S.chapter, 9);
    let played = 0;
    const pre = E.pre.filter((id) => !S.done['cs:' + id] && !(name === 'tomorrow' && S.flags.acceptedDeal));
    for (const id of [...pre, ...E.main]) { if (!live()) return; if (await playCs(id, o)) played++; }
    if (!live()) return;
    if (!played) await UI.card(E.name, { dur: 2.2 });            // nothing registered yet: the ending's name on black
    await UI.fade(1, 1.2);
    // the world goes; the rest happens on black
    safe('Script.abortAll', () => Script.abortAll('ending'));
    safe('World.unload', () => World.unload());
    safe('Enemies', () => { Enemies.clear(); Enemies.standard.stop(); });
    safe('Snd', () => { Snd.stopLoops(0.5); Snd.ambient('none', 1.5); Snd.staticLevel(0); });
    safe('Render', () => { Render.resetPost(); Render.party(false); });
    showPlayer(false);
    if (!live()) return;
    mode = 'credits';
    await Menus.open('credits', E.creditSpeed ? { ending: name, speed: E.creditSpeed } : { ending: name });
    if (!live()) return;
    // the post-credits scene (Connected: "Ask First"), then the fate cards on black
    if (E.post.length) {
      mode = 'ending';
      for (const id of E.post) { if (!live()) return; if (CUTSCENES[id]) { showPlayer(true); await playCs(id, {}); } }
      if (!live()) return;
      await UI.fade(1, 1.2);
      safe('Script.abortAll', () => Script.abortAll('ending'));
      safe('World.unload', () => World.unload());
      safe('Snd', () => { Snd.stopLoops(0.5); Snd.ambient('none', 1.2); });
      safe('Render', () => { Render.resetPost(); Render.party(false); });
      showPlayer(false);
    }
    if (E.fates) {
      mode = 'fates';
      const cards = safe('fates', () => fateCards(S));
      await Menus.open('fates', cards && cards.length ? { cards } : {});
      if (!live()) return;
    }
    safe('Player.restore', restoreAidan);
    mode = 'results';
    await Menus.open('results', { ending: name, record: true });
    if (!live()) return;
    flow = null;
    await goTitle();
  }
  // fate-card texts from DIALOGUE.fates ([{flag, saved, lost}]) when content defines them (null → Menus' own table)
  function fateCards(s = S) {
    const list = typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.fates) ? DIALOGUE.fates : null;
    if (!list || !list.length) return null;
    return list.map((f) => (f && s && s.flags && s.flags[f.flag] ? f.saved : f && f.lost) || '').filter(Boolean);
  }
  // after an ending: Aidan's body as a new game expects it (the endings straighten him up, take the phone out of his
  // hand for the box and the pendant, give him things to hold) — the player's actor outlives the playthrough
  function restoreAidan() { Player.restoreBody(); }
  // the §2A results record (+ stars) without showing it
  function results(name = endingFor(S)) {
    try { return Menus.results({ ending: name }); } catch (e) {
      const s = S.stats || {};
      const r = { ending: name, time: s.time || 0, saves: S.saves || 0, stomped: s.stomped || 0, memos: s.memos || 0, memosTotal: Object.keys(DOCUMENTS).length };
      r.lost = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukaSaved', 'lukeSaved'].filter((k) => !S.flags[k]).length;
      r.stars = rank(r);
      return r;
    }
  }
  function rank(st) {
    try { return Menus.rank(st); } catch (e) {
      let s = 10;
      if ((st.time || 0) > 7200) s--;
      if ((st.saves || 0) > 12) s--;
      if ((st.stomped || 0) > 5) s--;
      if ((st.memosTotal || 0) > 0 && (st.memos || 0) < st.memosTotal / 2) s--;
      s -= st.lost || 0;
      return Math.max(1, s);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Debug entry points (chapter select / test rooms)
  // ---------------------------------------------------------------------------------------------------------------
  async function debugStart(n, o = {}) {
    const tok = ++flowTok;
    flow = 'debug';
    mode = 'loading';
    await teardown({ reason: 'debug' });
    if (tok !== flowTok) return false;
    const keep = { action: S.difficulty.action, riddle: S.difficulty.riddle, playthrough: S.playthrough, ngPlus: S.ngPlus };
    resetState(keep);
    if (keep.ngPlus) S.stickers = { ...(META.stickers || {}) };
    try { if (typeof CHAPTERS[n].debugState === 'function') CHAPTERS[n].debugState(S); } catch (e) { console.error(`[Game] chapter ${n} debugState`, e); }
    Time.now = 0;
    safe('Player', () => Player.reset());
    showPlayer(true);
    mode = 'play'; flow = null;
    return startChapter(n, { card: o.card !== false, skipIntro: !!o.skipIntro });
  }
  async function debugRoom(room, entry = null) {
    if (!ROOMS[room]) { console.warn(`[Game] no room "${room}"`); return false; }
    if (mode === 'play' && World.room && !flow) {
      // a debug jump wins over whatever was moving Aidan: a transition in flight and a running cutscene / blocking
      // beat (the Prologue's P-1 still changing sets after SH.newGame) would otherwise refuse or undo it; an open menu
      // screen (a document's reading view an interaction opened) is closed first — it pauses the game ticks the room
      // change needs, so the jump would never finish
      if (safe('Menus.isOpen', () => Menus.isOpen())) { try { await Menus.close(null); } catch (e) { console.error('[Game] debugRoom: Menus.close', e); } }
      safe('World.cancelTransition', () => { if (World.transitioning) World.cancelTransition(); });
      safe('Script.abort', () => { for (const c of Script.list()) if (c.blocking && !c.queued) Script.abort(c.name, 'debug'); });
      safe('Cam.release', () => Cam.release());
      await World.goto(room, entry, { sound: 'none', fade: true });
      return World.room;
    }
    const tok = ++flowTok;
    flow = 'debug'; mode = 'loading';
    await teardown({ reason: 'debug' });
    if (tok !== flowTok) return false;
    if (isTitleState()) resetState({ action: S.difficulty.action, riddle: S.difficulty.riddle });
    safe('Player', () => Player.reset());
    mode = 'play'; flow = null;
    return enterRoom(room, entry);
  }
  const isTitleState = () => !S.room;

  // ---------------------------------------------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------------------------------------------
  const api = {
    boot, tick, newGame, continueFrom, startChapter, death, ending, endingFor,
    // CONTRACT+
    goTitle, results, rank, stickerCount, debugStart, debugRoom, wait,
    autosave: (o) => Save.autosave(o),
    manual(on) { manualN = Math.max(0, manualN + (on ? 1 : -1)); if (!manualN) lastReal = 0; return manualN > 0; },
    get mode() {
      if (mode === 'play') {
        if (safe('Menus', () => Menus.isOpen())) return 'menu';
        if (safe('Script', () => Script.cutscene)) return 'cutscene';
        return 'play';
      }
      if (mode === 'title') { const c = safe('Menus', () => Menus.current); return c === 'newgame' || c === 'calibrate' ? c : 'title'; }
      return mode;
    },
    get flow() { return flow; },
    get culled() { return culled.size; },
    get staticCulled() { return sCulled; },
    get fps() { return fps; },
    ENDINGS, STICKERS,
  };
  return api;
})();
