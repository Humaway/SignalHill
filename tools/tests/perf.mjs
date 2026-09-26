// tools/tests/perf.mjs — spec §2 (60 fps target, never below 30) and §14 ("the heaviest scene — the Chapter 8 summit
// road — holds 60 fps on a mid-range laptop"): the draw-call / triangle / light budget of every view in the game, shader
// program stability and memory across room transitions.
//
//   node tools/build.mjs --out .build/perf.html
//   node tools/run.mjs --file .build/perf.html --size 640x360 --quiet --script tools/tests/perf.mjs
//
// 1. VIEWS. For every room in ROOMS — in both worlds where it has an Outage (Outage-tagged meshes, floors, colliders,
//    cameras or spawns, or an outageFog / outageAmbient / outageEnv) — the room is loaded as a save is (slot 3 →
//    Game.continueFrom(2)) with a plausible state: a fresh state + the room's chapter's debugState (what chapter select
//    gives: the inventory, flags, freed Tethered and fates a player carries into that chapter), S.chapter = the room's
//    chapter (the ending sets: 8), the room's first entry, and:
//      * every spawn of the room in that world — one whose when() is false in that state is spawned anyway (the moment
//        in the chapter when it is there: the Ward 3 Smiles after the store, Level 4's Tethered …; listed as forced),
//      * the room's people (K.npc) as its build decides for that state; ROOM_EXTRA below turns on the flags that bring
//        in the ones who only come later (the hospital car park's stand-off);
//      * the Chapter 8 summit road with the MOST freed Tethered a game can have (every Tethered of the Prologue and
//        Chapters 1–7 cut free: they sit along its verges) — the heaviest scene of spec §14;
//      * the torch ON (its shadow pass is the worst case; the player can switch it on anywhere).
//    What the room started on entering that would hold the player (a cutscene) is aborted, the actors it made stay; a
//    blocking hold script then keeps triggers, exits and the monsters' AI still while the views are taken. Then for
//    EVERY camera of the room in that world (a camera with a when() is measured whatever its condition says): Aidan is
//    placed at walkable points of its volume (static: the middle and the far end, facing away from the lens; pan / rail:
//    also the four extremes — their view follows him), Cam.lock(camera) + 0.5 s of game time (light-pool fades, fog
//    culling, a room's own visibility rules — the summit road shows only the seated Tethered on his stretch of road),
//    Render.render(0), and Render.stats(): draw calls (the world pass incl. the torch's shadow pass), triangles, real
//    pool lights (+ the torch), and the actors in the frustum. The room's build time (Kit.build) is recorded.
//    Budget per view: ≤ 400 draw calls and ≤ 250 000 triangles; ≤ 11 real lights (8 point + 2 spot + the torch — the
//    pool is fixed). Printed: one row per room / world sorted by its worst view's calls, then every view over budget.
// 2. SHADER PROGRAMS. The renderer's programs are recorded after each room's first visit (a room / world adds the
//    programs its materials need the first time); a revisit (part 3) must compile none: no new program id.
// 3. MEMORY. After every room has been seen once, 30 room transitions (World.goto — a door's transition — through rooms
//    of every chapter, both worlds, spawns and people, back to the first) must return renderer.info.memory geometries
//    and textures, the scene graph's object count, the live Rig actors, the enemies and the virtual lights to the
//    baseline taken in the first room; the JS heap is printed (not failed: it is noisy).
//
// env: SH_ONLY    a comma list of room ids (default: every room)
//      SH_WORLDS  fog | outage | both (default: both where the room has an Outage)
//      SH_POINTS  n — the most points per camera (default: 2 static, 5 pan / rail)
//      SH_MEM     0 — skip part 3
//      SH_VERBOSE 1 — print every view
//      SH_EXPLAIN 1 — what every room's worst view draws, by owner (always printed for a view over budget)
// Prints `PASS perf` (or FAIL lines) at the end.
import { ev, report } from './lib.mjs';

const BUDGET = { calls: 400, tris: 250000, lights: 11 };
const ONLY = process.env.SH_ONLY ? process.env.SH_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
const WORLDS = process.env.SH_WORLDS || '';
const MAXPTS = process.env.SH_POINTS ? Number(process.env.SH_POINTS) : 0;
const VERBOSE = process.env.SH_VERBOSE === '1';
const MEM = process.env.SH_MEM !== '0';
const EXPLAIN = process.env.SH_EXPLAIN === '1';

// flags that bring in the people a room only has later in its chapter (K.npc placements decided at build time)
const ROOM_EXTRA = {
  c7_carpark: { flags: { c7_standoff: true, lukeSaved: true, chaseSaved: true } },
};

// ---- the page side ---------------------------------------------------------------------------------------------------
function perfPage(ROOM_EXTRA, MAXPTS) {
  if (window.__perf) return;
  const M = SH.mod, T = M.THREE;
  const adv = (s) => SH.advance(s);
  const P = window.__perf = { fresh: JSON.stringify(M.S), lastBuild: 0, builds: 0 };
  // Kit.build timing (World.load builds the room through it)
  const origBuild = M.Kit.build;
  M.Kit.build = function (...a) { const t = performance.now(); try { return origBuild.apply(this, a); } finally { P.lastBuild = performance.now() - t; P.builds++; } };
  const matchWorld = (w, outage) => !w || w === 'both' || (w === 'outage') === !!outage;
  const chapterOf = (id) => { const d = M.ROOMS[id]; if (d && Number.isFinite(d.chapter)) return d.chapter; return /^e_/.test(id) ? 8 : /^c7_/.test(id) ? 7 : 0; };
  const r = (v, k = 100) => Math.round(v * k) / k;
  const R = () => M.Render.renderer;
  P.progs = () => (R().info.programs || []).map((p) => ({ id: p.id, key: String(p.cacheKey || p.name || '').slice(0, 80) }));
  P.mem = () => {
    let objs = 0; M.Render.scene.traverse(() => { objs++; });
    const st = M.Render.stats();
    return { geometries: R().info.memory.geometries, textures: R().info.memory.textures, objects: objs, actors: M.Rig.actors.size, enemies: (M.Enemies.list || []).filter((e) => e && !e.removed).length, vlights: st.pool ? st.pool.virtual : 0, programs: (R().info.programs || []).length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  };
  // every Tethered a player can cut free before Chapter 8 (they sit along the summit road)
  P.allTethered = () => {
    const out = [];
    for (const [room, list] of Object.entries(M.SPAWNS)) {
      if (/^(c8_|test_)/.test(room)) continue;
      for (const sd of list || []) if (sd && sd.type === 'tethered' && sd.id) out.push(sd.id);
    }
    return out;
  };
  function stateFor(id, world, variant) {
    const def = M.ROOMS[id], ch = chapterOf(id);
    const s = JSON.parse(P.fresh);
    try { if (M.CHAPTERS[ch] && typeof M.CHAPTERS[ch].debugState === 'function') M.CHAPTERS[ch].debugState(s); } catch (e) { console.warn('[perf] debugState', ch, e); }
    s.chapter = ch; s.room = id; s.outage = world === 'outage';
    const E = def.entries || {};
    const e = E.start || E[Object.keys(E)[0]] || [0, 0, 0];
    s.pos = [e[0], 0, e[1]]; s.yaw = e[2] || 0;
    const x = ROOM_EXTRA[id];
    if (x && x.flags) Object.assign(s.flags, x.flags);
    if (variant === 'maxfreed') {
      s.freedOrder = P.allTethered();
      for (const tid of s.freedOrder) s.spawns[tid] = 'freed';
      s.stats.freed = s.freedOrder.length;
    }
    return s;
  }
  // load a room as a save is loaded; → {ok, build ms, forced spawns, notes}
  P.load = async (id, world, variant) => {
    const s = stateFor(id, world, variant);
    const env = { game: 'signalhill', v: 1, slot: 2, meta: { chapter: s.chapter, room: id, date: Date.now() }, S: s, chapterStart: null };
    localStorage.setItem(M.Save._key(2), JSON.stringify(env));
    const b0 = P.builds, t0 = performance.now();
    M.Game.continueFrom(2);
    let t = 0;
    for (; t < 30; t += 0.1) {
      await adv(0.1);
      if (M.Game.flow === null && M.World.room === id && !M.World.transitioning && P.builds > b0) break;
    }
    if (t >= 30) return { ok: false, why: 'the room did not load: ' + JSON.stringify(SH.state()) };
    const loadMs = performance.now() - t0, buildMs = P.lastBuild;
    const notes = [];
    await adv(0.3);
    // what the room started that would hold the player (a scene on entering) is aborted; its actors stay
    const hold = M.Script.list().filter((c) => c.blocking);
    if (hold.length) { notes.push('aborted ' + [...new Set(hold.map((c) => c.name))].join(', ')); for (const c of hold) M.Script.abort(c.name, 'perf'); await adv(0.2); }
    if (M.Menus.isOpen()) { try { await M.Menus.close(null); } catch (e) { /* closed */ } await adv(0.2); }
    // every spawn of this world, even one whose when() is off in this state (the moment it is there)
    const forced = [];
    for (const sd of M.SPAWNS[id] || []) {
      if (!sd || !sd.id || M.World.spawned.has(sd.id) || !matchWorld(sd.world, M.S.outage)) continue;
      if (M.S.spawns[sd.id] === 'dead' && sd.type !== 'tethered') continue;
      try { const e = M.Enemies.spawn(sd); if (e) { M.World.spawned.set(sd.id, e); forced.push(sd.id.replace(/^[^:]*:/, '')); } } catch (e) { notes.push('spawn ' + sd.id + ' failed: ' + e.message); }
    }
    // a blocking beat keeps triggers, exits and the monsters' AI still while the views are taken
    P.holdCtx = M.Script.run(async (G) => { for (;;) await G.wait(5); }, { control: false, letterbox: false, skippable: false, name: 'perf:hold' });
    await adv(0.2);
    return { ok: true, buildMs: r(buildMs, 1), loadMs: r(loadMs, 1), forced, notes, outage: !!M.S.outage };
  };
  P.release = async () => { M.Script.abort('perf:hold', 'perf'); M.Cam.lock(null); M.Player.setTorch(false); await adv(0.1); };
  // does the loaded room have an Outage (content of its own for it)?
  P.hasOutage = (id) => {
    const def = M.ROOMS[id], rb = M.World.build;
    if (def.outageFog || def.outageAmbient || def.outageEnv) return true;
    if ((M.CAMERAS[id] || []).some((c) => c.world === 'outage')) return true;
    if ((M.SPAWNS[id] || []).some((s) => s && s.world === 'outage')) return true;
    if (!rb) return false;
    return rb.floors.some((f) => f.world === 'outage') || rb.colliders.some((c) => c.world === 'outage') || rb.tagged.some((t) => t.world === 'outage');
  };
  // walkable points of a camera's volume (in its height band), outside colliders
  function free(rb, x, z, y, outage) {
    for (const c of rb.colliders) {
      if (c.enabled === false || !matchWorld(c.world, outage) || c.exit) continue;
      if (x < c.x0 - 0.4 || x > c.x1 + 0.4 || z < c.z0 - 0.4 || z > c.z1 + 0.4) continue;
      const cy = c.y || 0;
      if (cy > y + 1.6 || cy + c.h < y + 0.25) continue;
      if (M.Kit.collide(c, x, z, 0.3)) return false;
    }
    return true;
  }
  function pointsFor(c, rb, def, outage) {
    const [x0, z0, x1, z1] = c.vol;
    const area = Math.max(1, (x1 - x0) * (z1 - z0)), step = Math.max(0.5, Math.sqrt(area / 500));
    const pts = [];
    for (let x = x0 + step / 2; x <= x1; x += step) for (let z = z0 + step / 2; z <= z1; z += step) {
      const layers = def.stackedFloors ? M.Kit.floorLayers(rb.floors, x, z, outage) : [M.Kit.floorAt(rb.floors, x, z, outage)];
      for (const y of layers) {
        if (y === null || y === undefined) continue;
        if (c.y && (y < c.y[0] - 0.01 || y > c.y[1] + 0.01)) continue;
        if (!free(rb, x, z, y, outage)) continue;
        pts.push({ x: r(x), y, z: r(z) });
      }
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (!pts.length) {
      // a camera for a ladder's height band (Aidan on the rungs, as Cam.check samples him) or a set with no floor
      for (const L of rb.ladders || []) {
        if (!matchWorld(L.world, outage)) continue;
        const a = (L.rot || 0) * Math.PI / 180, lx = L.x + Math.sin(a) * 0.34, lz = L.z + Math.cos(a) * 0.34;
        if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;
        for (let y = L.y0 + 0.25; y <= L.y1 - 0.9; y += 0.5) if (!c.y || (y >= c.y[0] - 0.01 && y <= c.y[1] + 0.01)) pts.push({ x: r(lx), y: r(y), z: r(lz) });
      }
      if (!pts.length) pts.push({ x: r(cx), y: c.y ? c.y[0] : (M.Kit.floorAt(rb.floors, cx, cz, outage) ?? 0), z: r(cz) });
    }
    const by = (f) => pts.reduce((a, p) => (f(p) < f(a) ? p : a), pts[0]);
    const lens = c.pos;
    const pick = [by((p) => Math.hypot(p.x - cx, p.z - cz))];
    if (c.type === 'pan' || c.type === 'rail') pick.push(by((p) => p.x), by((p) => -p.x), by((p) => p.z), by((p) => -p.z));
    else pick.push(by((p) => -Math.hypot(p.x - lens.x, p.z - lens.z)));
    const out = [];
    for (const p of pick) if (!out.includes(p)) out.push(p);
    const max = MAXPTS || (c.type === 'pan' || c.type === 'rail' ? 5 : 2);
    return out.slice(0, max).map((p) => ({ ...p, yaw: r(Math.atan2(p.x - lens.x, p.z - lens.z) * 180 / Math.PI, 1) }));
  }
  const _fr = new T.Frustum(), _pm = new T.Matrix4(), _sp = new T.Sphere(), _v = new T.Vector3();
  function shown(o) { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; }
  function actorsInView() {
    const cam = M.Render.camera;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    let n = 0;
    for (const a of M.Rig.actors) {
      if (!a.root || !a.root.parent || !shown(a.root) || !a.root.layers.test(cam.layers)) continue;
      a.root.getWorldPosition(_v); _v.y += 0.9;
      if (_fr.intersectsSphere(_sp.set(_v, 1.1))) n++;
    }
    return n;
  }
  // what the current view draws, by owner (an actor, a prop, a merged kit batch, a monster's fx …): the main pass as
  // three.js culls it (visible chain, layers, frustum) and the torch's shadow pass (casters in its shadow frustum)
  P.breakdown = (top = 14) => {
    const cam = M.Render.camera, torch = M.Render.torch.light;
    cam.updateMatrixWorld();
    const frOf = (c) => { const f = new T.Frustum(); c.updateMatrixWorld(); f.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)); return f; };
    const fr = frOf(cam);
    let sfr = null;
    if (M.Render.torch.isOn) { torch.updateMatrixWorld(); torch.shadow.updateMatrices(torch); sfr = frOf(torch.shadow.camera); }
    const owner = (o) => {
      for (let q = o; q; q = q.parent) { if (/^(actor|player|enemyfx|enemy):/.test(q.name)) return q.name; if (q.userData && q.userData.prop) return 'prop:' + (q.name || q.userData.prop); }
      for (let q = o; q; q = q.parent) if (q.name && !/^(Mesh|Group|Object3D)$/.test(q.name) && q.name !== 'world') return q.name + (q === o ? '' : '…');
      return o.type;
    };
    const tally = new Map();
    const add = (k, calls, tris, sh) => { let t = tally.get(k); if (!t) { t = { k, calls: 0, tris: 0, shadow: 0 }; tally.set(k, t); } t.calls += calls; t.tris += tris; t.shadow += sh; };
    const sph = new T.Sphere();
    const walk = (o) => {
      if (!o.visible) return;
      if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.geometry) {
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        const inMain = o.layers.test(cam.layers) && (!o.frustumCulled || o.isSkinnedMesh || fr.intersectsSphere(sph));
        const inShadow = sfr && o.castShadow && o.isMesh && o.layers.test(torch.shadow.camera.layers) && (!o.frustumCulled || sfr.intersectsSphere(sph));
        const groups = Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
        const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
        const inst = o.isInstancedMesh ? o.count : 1;
        const tris = o.isMesh ? Math.round(Math.min(n, g.drawRange.count) / 3) * inst : 0;
        if (inMain || inShadow) add(owner(o), inMain ? groups : 0, inMain ? tris : 0, inShadow ? groups : 0);
      }
      for (const c of o.children) walk(c);
    };
    walk(M.Render.scene);
    const list = [...tally.values()];
    const sum = list.reduce((a, t) => ({ calls: a.calls + t.calls, shadow: a.shadow + t.shadow, tris: a.tris + t.tris }), { calls: 0, shadow: 0, tris: 0 });
    return { sum, byCalls: list.sort((a, b) => b.calls + b.shadow - a.calls - a.shadow).slice(0, top), byTris: [...list].sort((a, b) => b.tris - a.tris).slice(0, top) };
  };
  // every camera of the loaded room in its world: → [{cam, type, pt, calls, tris, lights, actors, culled}]
  P.views = async () => {
    const rb = M.World.build, id = M.World.room, def = M.ROOMS[id], outage = !!M.S.outage;
    const out = [];
    M.Player.setTorch(true);
    for (const c of M.Cam.defs) {
      if (!matchWorld(c.world, outage)) continue;
      const pts = pointsFor(c, rb, def, outage);
      if (!pts.length) { out.push({ cam: c.id, type: c.type, none: 'no walkable point in its volume' }); continue; }
      const when = c.when; c.when = null;
      try {
        for (const p of pts) {
          M.Player.place(p.x, p.z, p.yaw, { y: p.y });
          M.Cam.lock(c.id);
          await adv(0.5);
          if (!M.Cam.current || M.Cam.current.id !== c.id) { M.Cam.lock(c.id); await adv(0.1); }
          if (!M.Cam.current || M.Cam.current.id !== c.id) { out.push({ cam: c.id, type: c.type, none: 'Cam.lock did not take (' + (M.Cam.current && M.Cam.current.id) + ')' }); break; }
          M.Render.render(0);
          const st = M.Render.stats();
          out.push({ cam: c.id, type: c.type, pt: [p.x, r(p.y), p.z], calls: st.calls, tris: st.triangles, lights: st.lights, actors: actorsInView(), culled: M.Game.culled });
        }
      } finally { c.when = when; }
    }
    return out;
  };
  // one view again (the worst of a room) with what it draws, by owner
  P.explain = async (camId, pt) => {
    const c = M.Cam.defs.find((d) => d.id === camId);
    if (!c) return null;
    const when = c.when; c.when = null;
    try {
      M.Player.setTorch(true);
      M.Player.place(pt[0], pt[2], Math.atan2(pt[0] - c.pos.x, pt[2] - c.pos.z) * 180 / Math.PI, { y: pt[1] });
      M.Cam.lock(c.id);
      await adv(0.5);
      M.Render.render(0);
      const st = M.Render.stats();
      return { calls: st.calls, tris: st.triangles, ...P.breakdown() };
    } finally { c.when = when; }
  };
  // a real door transition (World.goto, as a door or G.goto does) to `id` in `world`; → true when it landed
  P.go = async (id, world) => {
    await M.Game.debugRoom(id, null);
    for (let t = 0; t < 20 && (M.World.room !== id || M.World.transitioning); t += 0.1) await adv(0.1);
    if (world !== undefined && !!M.S.outage !== (world === 'outage')) { M.World.setOutage(world === 'outage'); await adv(0.2); }
    for (const c of M.Script.list().filter((q) => q.blocking)) M.Script.abort(c.name, 'perf');
    await adv(1.0);
    return M.World.room === id;
  };
}

// ---- the node side ---------------------------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

export default async function (page, h) {
  const fails = [];
  await ev(h, `(${perfPage.toString()})(${JSON.stringify(ROOM_EXTRA)}, ${MAXPTS}); return true;`);
  const rooms = ONLY || (await ev(h, 'return Object.keys(SH.mod.ROOMS)'));
  const rows = [], over = [], progLog = [];
  let progIds = new Set((await ev(h, 'return __perf.progs()')).map((p) => p.id));
  const t0 = Date.now();
  const runs = [];
  for (const id of rooms) {
    const worlds = WORLDS === 'fog' ? ['fog'] : WORLDS === 'outage' ? ['outage'] : null;
    const variants = id === 'c8_summit' ? ['play', 'maxfreed'] : ['play'];
    for (const variant of variants) {
      let ws = worlds || ['fog'];
      for (let wi = 0; wi < ws.length; wi++) {
        const world = ws[wi];
        const L = await ev(h, `return await __perf.load(${JSON.stringify(id)}, ${JSON.stringify(world)}, ${JSON.stringify(variant)})`);
        if (!L.ok) { fails.push(`${id} (${world}): ${L.why}`); break; }
        if (!worlds && wi === 0 && (WORLDS === 'both' || (await ev(h, `return __perf.hasOutage(${JSON.stringify(id)})`)))) ws = ['fog', 'outage'];
        const V = await ev(h, 'return await __perf.views()');
        const w0 = V.filter((v) => !v.none).reduce((a, v) => (!a || v.calls > a.calls ? v : a), null);
        const tmax = V.filter((v) => !v.none).reduce((a, v) => (!a || v.tris > a.tris ? v : a), null);
        const explain = [];
        if (w0 && (EXPLAIN || w0.calls > BUDGET.calls)) explain.push(w0);
        if (tmax && tmax !== w0 && (EXPLAIN || tmax.tris > BUDGET.tris)) explain.push(tmax);
        for (const v of explain) {
          const X = await ev(h, `return await __perf.explain(${JSON.stringify(v.cam)}, ${JSON.stringify(v.pt)})`);
          if (!X) continue;
          console.log(`  ${id} (${world}${variant !== 'play' ? ', ' + variant : ''}) ${v.cam} at ${v.pt}: ${X.calls} calls ${X.tris} tris — counted ${X.sum.calls} main + ${X.sum.shadow} shadow, ${X.sum.tris} tris`);
          console.log('    calls: ' + X.byCalls.map((t) => `${t.k} ${t.calls}+${t.shadow}`).join(', '));
          console.log('    tris:  ' + X.byTris.map((t) => `${t.k} ${t.tris}`).join(', '));
        }
        await ev(h, 'await __perf.release(); return true');
        const progs = await ev(h, 'return __perf.progs()');
        const fresh = progs.filter((p) => !progIds.has(p.id));
        for (const p of fresh) progIds.add(p.id);
        progLog.push({ id, world, n: fresh.length, total: progs.length });
        const good = V.filter((v) => !v.none);
        const worst = good.reduce((a, v) => (!a || v.calls > a.calls ? v : a), null);
        const maxT = good.reduce((a, v) => Math.max(a, v.tris), 0), maxL = good.reduce((a, v) => Math.max(a, v.lights), 0);
        const row = { id, world, variant, cams: new Set(V.map((v) => v.cam)).size, views: good.length, worst, maxT, maxL, build: L.buildMs, forced: L.forced, notes: L.notes, newProgs: fresh.length, none: V.filter((v) => v.none) };
        rows.push(row);
        runs.push({ id, world, variant });
        for (const v of good) if (v.calls > BUDGET.calls || v.tris > BUDGET.tris || v.lights > BUDGET.lights) over.push({ id, world, variant, ...v });
        for (const v of row.none) fails.push(`${id} (${world}) ${v.cam}: ${v.none}`);
        const tag = `${id}${variant !== 'play' ? ' [' + variant + ']' : ''} (${world})`;
        if (VERBOSE) for (const v of V) console.log(`  ${tag} ${v.cam} ${v.none ? v.none : `calls ${v.calls} tris ${v.tris} lights ${v.lights} actors ${v.actors} culled ${v.culled} at ${v.pt}`}`);
        console.log(`${pad(tag, 40)} ${lpad(row.views, 3)} views  worst ${worst ? lpad(worst.calls, 4) : '   -'} calls (${worst ? worst.cam.replace(/^[^:]*:/, '') : '-'})  ${lpad(maxT, 7)} tris  ${lpad(maxL, 2)} lights  build ${lpad(L.buildMs, 6)} ms  +${fresh.length} programs${L.forced.length ? '  forced ' + L.forced.join(',') : ''}${L.notes.length ? '  (' + L.notes.join('; ') + ')' : ''}  [${Math.round((Date.now() - t0) / 1000)} s]`);
      }
    }
  }

  // ---- the table ----
  rows.sort((a, b) => (b.worst ? b.worst.calls : 0) - (a.worst ? a.worst.calls : 0));
  console.log('\nroom (world)                              views  worst calls  camera                        triangles  lights  actors  build ms');
  for (const w of rows) {
    const tag = `${w.id}${w.variant !== 'play' ? ' [' + w.variant + ']' : ''} (${w.world})`;
    const flag = w.worst && (w.worst.calls > BUDGET.calls || w.maxT > BUDGET.tris || w.maxL > BUDGET.lights) ? ' OVER' : '';
    console.log(`${pad(tag, 42)}${lpad(w.views, 5)}  ${lpad(w.worst ? w.worst.calls : '-', 11)}  ${pad(w.worst ? w.worst.cam.replace(/^[^:]*:/, '') : '-', 28)}  ${lpad(w.maxT, 9)}  ${lpad(w.maxL, 6)}  ${lpad(w.worst ? w.worst.actors : '-', 6)}  ${lpad(w.build, 8)}${flag}`);
  }
  const allViews = rows.reduce((a, w) => a + w.views, 0);
  const worstAll = rows[0] && rows[0].worst;
  console.log(`\n${rows.length} room loads, ${allViews} views; worst ${worstAll ? worstAll.calls + ' calls (' + rows[0].id + ' ' + worstAll.cam + ')' : '-'}; most triangles ${Math.max(...rows.map((w) => w.maxT))}; slowest build ${Math.max(...rows.map((w) => w.build))} ms`);
  if (over.length) {
    console.log(`\n${over.length} views over budget (≤ ${BUDGET.calls} calls, ≤ ${BUDGET.tris} triangles, ≤ ${BUDGET.lights} lights):`);
    for (const v of over.sort((a, b) => b.calls - a.calls)) console.log(`  ${v.id} (${v.world}${v.variant !== 'play' ? ', ' + v.variant : ''}) ${v.cam}: ${v.calls} calls, ${v.tris} tris, ${v.lights} lights, ${v.actors} actors in view (Aidan at ${v.pt})`);
  }
  report('perf views', !over.length && !fails.length, over.length ? `${over.length} views over budget` : fails.length ? fails.slice(0, 5).join(' | ') : `${allViews} views within ${BUDGET.calls} calls / ${BUDGET.tris} triangles / ${BUDGET.lights} lights`);

  // ---- memory + program stability across 30 transitions ----
  if (MEM && runs.length > 1) {
    const plan = [];
    const pool = runs.filter((q) => q.variant === 'play' && !/^(t_title|c7_flashback)$/.test(q.id));
    const byCh = new Map();
    for (const q of pool) { const k = q.id.slice(0, 2) + q.world; if (!byCh.has(k)) byCh.set(k, []); byCh.get(k).push(q); }
    // a spread over chapters and worlds: take rooms round-robin from each group
    const groups = [...byCh.values()];
    for (let i = 0; plan.length < 29 && i < 200; i++) { const g = groups[i % groups.length]; const q = g[Math.floor(i / groups.length) % g.length]; if (!plan.length || plan[plan.length - 1].id !== q.id) plan.push(q); }
    const first = pool.find((q) => q.world === 'fog') || pool[0];
    await ev(h, `return await __perf.go(${JSON.stringify(first.id)}, 'fog')`);
    await ev(h, 'return await SH.advance(0.5)');
    const base = await ev(h, 'return __perf.mem()');
    const progs0 = new Set((await ev(h, 'return __perf.progs()')).map((p) => p.id));
    const recompiled = [];
    const seq = [...plan, first];
    for (let i = 0; i < seq.length; i++) {
      const q = seq[i];
      const ok = await ev(h, `return await __perf.go(${JSON.stringify(q.id)}, ${JSON.stringify(q.world)})`);
      if (!ok) fails.push(`transition ${i + 1} to ${q.id} did not land`);
      await ev(h, 'SH.mod.Render.render(0); return true');
      const pr = await ev(h, 'return __perf.progs()');
      const fresh = pr.filter((p) => !progIds.has(p.id));
      for (const p of fresh) { progIds.add(p.id); recompiled.push(`${q.id} (${q.world}): ${p.key}`); }
      if (VERBOSE) console.log(`  transition ${i + 1} → ${q.id} (${q.world}) ${JSON.stringify(await ev(h, 'return __perf.mem()'))}`);
    }
    await ev(h, 'return await SH.advance(0.5)');
    const end = await ev(h, 'return __perf.mem()');
    console.log(`\nmemory: ${seq.length} transitions ${seq.map((q) => q.id + (q.world === 'outage' ? '*' : '')).join(' → ')}`);
    console.log(`  baseline ${JSON.stringify(base)}\n  after    ${JSON.stringify(end)}`);
    const grew = ['geometries', 'textures', 'objects', 'actors', 'enemies', 'vlights'].filter((k) => end[k] > base[k]);
    report('perf memory', !grew.length, grew.length ? 'grew: ' + grew.map((k) => `${k} ${base[k]} → ${end[k]}`).join(', ') : `geometries ${end.geometries}, textures ${end.textures}, objects ${end.objects} back to the baseline after ${seq.length} transitions (heap ${base.heap} → ${end.heap} MB)`);
    report('perf programs', !recompiled.length, recompiled.length ? `${recompiled.length} programs compiled again on a revisit: ${recompiled.slice(0, 4).join(' | ')}` : `no program compiled on a revisit (${progs0.size} programs; first visits added ${progLog.reduce((a, p) => a + p.n, 0)})`);
  }
  if (fails.length) console.log('problems:\n  ' + fails.join('\n  '));
  report('perf', process.exitCode !== 1 && !fails.length);
}
