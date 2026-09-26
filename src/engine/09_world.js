// ==== engine/09_world.js — World: room load/unload/transition, collision queries, triggers, exits, doors, Outage ====
// ARCHITECTURE §5 (RoomBuild handoff), §9 (spawns), §11 (G.goto / G.outage are Script wrappers over these) · spec §2
// (the Outage transition), §2A (messages), §3 (1.5 s door transitions), §7A (every block is physical or spoken).
//
// World.load(roomId, entry, {fromRoom}) builds the room with Kit.build, adds it to Render.scene, sets the environment
// (outdoor / Outage / fog override), ambient bed and world, spawns SPAWNS[room] (world tags, when(), S.spawns), loads
// the cameras, places Aidan at the entry, emits room:enter and runs def.onEnter through Script.run({control:true,
// letterbox:false}). World.goto(roomId, entry, {fade, sound}) wraps it in the black-screen transition: doors 1.5 s of
// black with handle / creak / close; street exits (sound 'steps') a short fade with footsteps.
// entry: a name in def.entries ([x, z, yawDeg]), {pos:[x,z]|[x,y,z], yaw (deg)}, or null (entries[fromRoom] → start →
// the first entry).
//
// Collision (player = circle r 0.3 in XZ): World.move(pos, dx, dz, r, {player, maxStep=0.45, maxDrop=1, noFloor}) →
// {x, y, z, blocked, hit} slides against enabled, world-matching AABB/OBB colliders that overlap the mover's height,
// refuses steps higher than 0.45 m, drops deeper than 1 m and points off every floor. With {player:true} blockers
// show their message once per contact (soft blockers — fog walls — also turn Aidan around), and exits whose when() is
// false act as blockers with blockedMsg. World.heightAt(x,z) → floor y | null. World.los(ax,az,bx,bz,{minH=1.5})
// → true when no collider at least minH tall (closed doors included, invisible blockers excluded) crosses the segment.
//
// Doors: World.door(id) → {open(), close(), toggle(), lock(msg), unlock(), isOpen, locked, rec}. The use flow is
// World.useDoor(door, G): chapter lock ("It won't open. Not anymore." when the room's — and the target room's —
// chapter is below S.chapter), locked (key in S.inv → "The key fits." and it unlocks for good; else lockMsg /
// "It's locked."), then the room transition (`to`) or a swing. Script.builtins.door(G, door) should simply
// `return World.useDoor(door, G)`; World.interact calls useDoor itself when that builtin is missing.
// Unlocks persist in S.done['unlocked:<doorId>'].
//
// The Outage: World.setOutage(on) swaps instantly. World.outageTransition(on) → Promise plays spec §2 exactly —
// entering: a dial-up handshake rises into a siren over 6 s, grain and aberration ramp up, lights die bank by bank
// toward the camera, surfaces dissolve through Tex's noise shader with tagged objects/colliders/spawns swapping at the
// dissolve midpoint, then the siren cuts dead, the Outage's own lights (red LEDs, flickering tubes) come on and the
// phone bars climb (Phone.bars override if Phone exists). Leaving: the reverse swap with no siren — one long exhale of
// static, lights returning bank by bank away from the camera. The player keeps control throughout.
//
// CONTRACT+: World.update(dt), unload(), useDoor(door, G), isActive(interactable), surfaceAt(x,z) (def.surfaces
//   [{box:[x0,z0,x1,z1], s:'metal', world}] → def.surface → 'lino'/'bitumen'), raycast(ax,az,dx,dz,max,{minH}) →
//   {dist,x,z,collider}|null, lightsOut({dur, banks}) / lightsOn({dur}) → Promise (banks die toward the camera / return
//   away from it), light(name) → Kit light handle, mark(name), region(name), obj(name), inRegion(name, pos),
//   pointFree(x,z,r), runScript(fn, opts) (Script.run or a minimal fallback G in partial builds), wait(s) (game time),
//   build, room, def, time, transitioning, busy, colliders (active), exits, triggers, doors, spawned (spawnId → e).
//   Room def extras read here: grade (Render grade name), outageFog {density,color}, env (extra Render.setEnvironment
//   opts), surfaces, outageSurface.  Bus: 'outage:begin'(on) at the start of a transition (the 'outage'(on) event
//   fires at the swap).
// CONTRACT+ (maintenance): cancelTransition(), recheckMarks() (automatic map X → tick when its reason is gone; runs on
//   load and on flag/pickup/chapter/outage), mapXform(xform, x, z) (array | fn(x,z) | [{box, xform}]), heightAt(x, z,
//   refY) + room stackedFloors, yBand on exits / triggers / interactables, interactable kind priorities (prio), crawl
//   interactables, room outageAmbient / outageEnv; goto / doors / exits to a missing room are inert (a warning).
const World = (() => {
  const D2R = Math.PI / 180;
  const matchWorld = (w, outage) => Kit.matchWorld(w, outage);
  const safeWhen = (fn) => { try { return !fn || !!fn(S); } catch (e) { console.error('[World] when() failed', e); return false; } };
  const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
  // CONTRACT+ y bands: exits, triggers and interactables with yBand:[y0,y1] only count while Aidan's feet are in it
  // (stacked landings sharing a footprint)
  const inBand = (band, y) => !band || y === undefined || y === null || (y >= band[0] - 0.01 && y <= band[1] + 0.01);
  const hasUI = () => typeof UI !== 'undefined' && !!UI;
  const ui = (fn, ...a) => { try { if (hasUI() && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[World] UI.' + fn, e); } return undefined; };
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio not ready */ } return null; };
  const hasItem = (id) => Array.isArray(S.inv) && S.inv.some((i) => i && i.id === id && (i.n ?? 1) > 0);

  let build = null, def = null, roomId = null, lastRoom = null;
  let clock = 0, roomT = 0;
  let transitioning = false, busy = 0, blocking = 0;
  const trigIn = new Map(), exitArm = new Map(), exitCols = new Map(), contacts = new Map(), doorAnims = new Map();
  const spawned = new Map();
  const failedAnim = new Set();
  let seqs = [], waits = [];

  // ---------------------------------------------------------------------------------------------------------------
  // Game-time waits and sequences (step in World.update, so they pause with the game)
  // ---------------------------------------------------------------------------------------------------------------
  function wait(s) { return new Promise((r) => { waits.push({ t: clock + Math.max(0, +s || 0), r }); }); }
  function later(s, fn) { waits.push({ t: clock + Math.max(0, +s || 0), r: fn }); }
  function stepWaits() {
    if (!waits.length) return;
    const due = waits.filter((w) => w.t <= clock);
    if (!due.length) return;
    waits = waits.filter((w) => w.t > clock);
    for (const w of due) { try { w.r(); } catch (e) { console.error('[World] wait callback', e); } }
  }
  function makeSeq(dur, tag) {
    const s = { t: 0, dur, tag, ev: [], tw: [], resolve: null, resolveAt: dur, resolved: false, promise: null };
    s.at = (t, fn) => { s.ev.push({ t, fn, done: false }); return s; };
    s.tween = (a, b, fn) => { s.tw.push({ a, b, fn, end: false }); return s; };
    s.promise = new Promise((r) => { s.resolve = r; });
    return s;
  }
  function startSeq(s) { s.ev.sort((a, b) => a.t - b.t); seqs.push(s); stepSeq(s, 0); return s.promise; }
  function stepSeq(s, dt) {
    s.t += dt;
    for (const w of s.tw) {
      if (w.end || s.t < w.a) continue;
      const k = U.clamp((s.t - w.a) / Math.max(1e-6, w.b - w.a));
      try { w.fn(k); } catch (e) { console.error('[World] tween', e); }
      if (k >= 1) w.end = true;
    }
    for (const e of s.ev) if (!e.done && s.t >= e.t) { e.done = true; try { e.fn(); } catch (err) { console.error('[World] sequence event', err); } }
    if (!s.resolved && s.t >= s.resolveAt) { s.resolved = true; s.resolve(true); }
    return s.t >= s.dur;
  }
  function finishSeqs(tag) {
    for (const s of seqs.slice()) if (!tag || s.tag === tag) { stepSeq(s, s.dur - s.t + 1e-3); if (!s.resolved) { s.resolved = true; s.resolve(true); } }
    seqs = seqs.filter((s) => tag && s.tag !== tag);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Scripts (Script.run, or a small fallback G for partial builds)
  // ---------------------------------------------------------------------------------------------------------------
  function runScript(fn, opts = {}) {
    if (typeof fn !== 'function') return Promise.resolve();
    if (typeof Script !== 'undefined' && Script && typeof Script.run === 'function') {
      try { return Promise.resolve(Script.run(fn, opts)).catch((e) => { console.error('[World] script failed', e); }); } catch (e) { console.error('[World] Script.run', e); return Promise.resolve(); }
    }
    return runFallback(fn, opts);
  }
  async function runFallback(fn, opts) {
    const block = opts.control === false;
    if (block && ++blocking === 1) Player.lock('script', true);
    try { await fn(fallbackG()); } catch (e) { console.error('[World] script failed', e); }
    finally { if (block && --blocking === 0) Player.lock('script', false); }
  }
  let FG = null;
  function fallbackG() {
    if (FG) return FG;
    const say = (t, o = {}) => (hasUI() && UI.say ? UI.say(t, o) : Promise.resolve(ui('message', t)));
    FG = {
      get S() { return S; }, get player() { return Player; }, get aidan() { return Player.actor; }, skipping: false,
      wait, beat: () => wait(0.8), longBeat: () => wait(2), frame: () => wait(0),
      async until(pred, o = {}) { const t0 = clock; while (!pred()) { if (o.timeout && clock - t0 > o.timeout) return false; await wait(0.05); } return true; },
      msg: (t) => ui('message', t), prompt: (t, o) => ui('prompt', t, o),
      think: (t) => say(t, { italic: true }), say: (sp, t, o = {}) => say(t, { speaker: sp, ...o }),
      sfx: (n, o) => sfx(n, o), fade: (to = 1, d = 0.5, c) => ui('fade', to, d, c), fadeIn: (d = 0.5) => ui('fade', 0, d), fadeOut: (d = 0.5) => ui('fade', 1, d),
      letterbox: (on) => ui('letterbox', on), cam: (spec) => Cam.scripted(spec), camDone: () => Cam.done(), camRelease: () => Cam.release(), shake: (a, d) => Cam.shake(a, d),
      control: (on) => Player.setControl(on), hud: (on) => ui('showHud', on),
      give(id, n = 1) { const e = S.inv.find((i) => i.id === id); if (e) e.n = (e.n || 1) + n; else S.inv.push({ id, n }); Bus.emit('pickup', id); },
      take(id, n = 1) { const e = S.inv.find((i) => i.id === id); if (!e) return false; e.n = (e.n || 1) - n; if (e.n <= 0) S.inv.splice(S.inv.indexOf(e), 1); return true; },
      has: (id) => hasItem(id), flag: (n) => S.flags[n], set: (n, v = true) => setFlag(n, v), track: (k, n) => track(k, n), once: (id) => once(id),
      goto: (r, e, o) => goto(r, e, o), door: (id) => door(id), outage: (on) => outageTransition(on), setOutage: (on) => setOutage(on),
      pos: (m) => (build && build.marks[m] ? build.marks[m].pos.clone() : null), region: (n) => region(n), obj: (n) => obj(n),
      light: (n) => light(n), lightsOut: (o) => lightsOut(o), bars: (n) => phoneBars(n), inRoom: (id) => roomId === id,
      async doc(id) { S.docs[id] = S.docs[id] || { read: true }; Bus.emit('doc', id); },
    };
    return FG;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Room load / unload / transitions
  // ---------------------------------------------------------------------------------------------------------------
  // Room environment. CONTRACT+ room fields for the Outage: outageAmbient [color, intensity] (the hemisphere light —
  // the built-in outdoor Outage look is near-black beyond the torch) and outageEnv {…Render.setEnvironment opts};
  // both apply whenever the Outage shows (load, setOutage, the transition's cross-fade), no polling needed.
  function envOpts(outage, extra = {}) {
    const d = def || {};
    const o = { outdoor: !!d.outdoor, outage: !!outage, fog: (outage && d.outageFog) || d.fog || null, noFog: !!d.noFog, grade: outage ? 'outage' : d.grade || undefined, ...(d.env || {}) };
    if (outage) { if (d.outageEnv) Object.assign(o, d.outageEnv); if (d.outageAmbient) o.ambient = d.outageAmbient; }
    return { ...o, ...extra };
  }
  function load(id, entry = null, o = {}) {
    const d = ROOMS[id];
    if (!d) throw new Error(`World.load: unknown room "${id}"`);
    const from = o.fromRoom !== undefined ? o.fromRoom : roomId;
    if (build) unload();
    def = d; roomId = id; lastRoom = from; S.room = id; roomT = 0;
    build = Kit.build(d);
    for (const dr of Object.values(build.doors)) if (S.done['unlocked:' + dr.id]) dr.locked = false;
    Render.scene.add(build.group);
    build.outage = !!S.outage;
    Tex.setOutage(S.outage ? 1 : 0);
    Render.post.grain = null; Render.post.ca = null; Render.post.noise = 0;
    Render.setEnvironment(envOpts(S.outage));
    if (build.ambient) Render.setAmbient(build.ambient.color, build.ambient.intensity); else Render.setAmbient(null);
    if (typeof Snd !== 'undefined') {
      try { Snd.setWorld(S.outage ? 'outage' : 'fog'); Snd.ambient(d.ambient || (d.outdoor ? 'wind' : 'interior')); } catch (e) { console.error('[World] ambient', e); }
    }
    spawnAll();
    Cam.load(id, build);
    placePlayer(entry, from);
    Cam.snap();
    trigIn.clear(); contacts.clear(); exitArm.clear(); exitCols.clear(); failedAnim.clear();
    const p = Player.pos;
    for (const ex of build.exits) exitArm.set(ex, !inBox(ex.box, p.x, p.z));
    try { recheckMarks(); } catch (e) { console.error('[World] map marks', e); }
    Bus.emit('room:enter', id);
    if (!o.deferEnter) runEnter(from);
    return build;
  }
  function runEnter(from) {
    if (def && typeof def.onEnter === 'function') {
      const d = def;
      runScript((G) => d.onEnter(G, from), { control: true, letterbox: false, id: roomId + ':enter' });
    }
  }
  function placePlayer(entry, from) {
    Player.init();
    const E = def.entries || {};
    let x = 0, z = 0, yawDeg = 0, y;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const p = entry.pos || [entry.x || 0, entry.z || 0];
      if (p.length === 3) { x = p[0]; y = p[1]; z = p[2]; } else { x = p[0]; z = p[1]; }
      yawDeg = entry.yaw ?? 0;
      if (y !== undefined && heightAt(x, z, y) !== null) y = def.stackedFloors ? heightAt(x, z, y) : undefined;   // snap saved positions to the floor
    } else {
      const e = (Array.isArray(entry) && entry) || (entry && E[entry]) || (from && E[from]) || E.start || E[Object.keys(E)[0]] || [0, 0, 0];
      if (entry && typeof entry === 'string' && !E[entry]) console.warn(`[World] room "${roomId}" has no entry "${entry}"`);
      [x, z, yawDeg = 0] = e;
    }
    Player.place(x, z, yawDeg, y !== undefined ? { y } : {});
  }
  function unload() {
    if (!build) return;
    finishSeqs();
    const id = roomId, d = def;
    Bus.emit('room:leave', id);
    try { if (d && typeof d.onLeave === 'function') d.onLeave(); } catch (e) { console.error('[World] onLeave', e); }
    try { if (typeof Enemies !== 'undefined' && Enemies && Enemies.clear) Enemies.clear(); } catch (e) { console.error('[World] Enemies.clear', e); }
    spawned.clear();
    Cam.unload();
    ui('holdPrompt', null);
    try { build.dispose(); } catch (e) { console.error('[World] dispose', e); }
    Render.setAmbient(null);
    if (Render.party) Render.party(false);
    Render.post.grain = null; Render.post.ca = null; Render.post.noise = 0;
    build = null; def = null; roomId = null;
    trigIn.clear(); exitArm.clear(); exitCols.clear(); contacts.clear(); doorAnims.clear();
  }
  // World.goto: fade to black, door sounds (handle, creak … close), 1.5 s of black while the room builds, fade in
  let gotoGen = 0;
  async function goto(id, entry = null, o = {}) {
    if (transitioning) return false;
    if (!ROOMS[id]) { console.warn(`[World] goto: unknown room "${id}" — ignored`); return false; }
    transitioning = true;
    const gen = ++gotoGen, stale = () => gen !== gotoGen;
    const from = roomId, sound = o.sound ?? 'door', fade = o.fade !== false, street = sound !== 'door';
    const style = o.style || 'wood';
    Player.lock('goto', true);
    try {
      if (sound === 'door') { sfx('handle'); later(0.22, () => sfx('door_open', { style })); }
      else if (sound === 'steps') steps(3, 0.33);
      if (fade) await Promise.resolve(ui('fade', 1, street ? 0.35 : 0.3));
      if (stale()) return false;
      const black = o.black ?? (sound === 'door' ? 1.5 : fade ? 0.45 : 0);
      const t0 = clock;
      await wait(0.03);
      if (stale()) return false;
      load(id, entry, { fromRoom: from, deferEnter: true });
      if (sound === 'door') later(Math.max(0.05, black - 0.6 - (clock - t0)), () => { if (!stale()) sfx('door_close', { style }); });
      const rest = black - (clock - t0);
      if (rest > 0) await wait(rest);
      if (stale()) return false;
      Player.lock('goto', false);
      runEnter(from);
      if (fade) await Promise.resolve(ui('fade', 0, street ? 0.4 : 0.55));
      return !stale();
    } catch (e) { console.error('[World] goto failed', e); return false; }
    finally { if (!stale()) { transitioning = false; Player.lock('goto', false); } }
  }
  // CONTRACT+: World.cancelTransition() — a running goto stops where it is and never loads its room (Game's teardown:
  // a new game / chapter select / load must not be overtaken by the previous flow's transition finishing later)
  function cancelTransition() {
    gotoGen++;
    transitioning = false;
    try { Player.lock('goto', false); } catch (e) { /* no player */ }
  }
  function steps(n, gap) {
    const surf = def ? surfaceAt(Player.pos.x, Player.pos.z) : 'bitumen';
    for (let i = 0; i < n; i++) later(i * gap, () => { try { if (typeof Snd !== 'undefined') Snd.footstep(surf, false, { vol: 0.8 - i * 0.18 }); } catch (e) { /* audio */ } });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------------------------------------------
  const enemiesOK = () => typeof Enemies !== 'undefined' && Enemies && typeof Enemies.spawn === 'function';
  function trySpawn(sd) {
    if (!sd || !sd.id || spawned.has(sd.id)) return;
    if (!matchWorld(sd.world, S.outage) || !safeWhen(sd.when)) return;
    const res = S.spawns[sd.id];
    if (res === 'dead' && sd.type !== 'tethered') return;          // Tethered are rebuilt passive (dead/sitting)
    try { const e = Enemies.spawn(sd); if (e) spawned.set(sd.id, e); } catch (e) { console.error(`[World] spawn ${sd.id}`, e); }
  }
  function spawnAll() { if (!enemiesOK() || !roomId) return; for (const sd of SPAWNS[roomId] || []) trySpawn(sd); }
  function swapSpawns() {
    if (!enemiesOK() || !roomId) return;
    const defs = SPAWNS[roomId] || [];
    for (const [id, e] of [...spawned]) {
      const sd = defs.find((s) => s.id === id);
      if (sd && !matchWorld(sd.world, S.outage)) { try { if (e && e.remove) e.remove(); } catch (err) { console.error(err); } spawned.delete(id); }
    }
    for (const sd of defs) trySpawn(sd);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Collision and queries
  // ---------------------------------------------------------------------------------------------------------------
  // heightAt(x, z, refY?) → floor y | null. In a room with stackedFloors:true the floor is the highest one at or just
  // above refY's step (refY = the mover's feet); elsewhere (and without refY) the last registered floor wins.
  function heightAt(x, z, refY) { return build ? Kit.floorAt(build.floors, x, z, S.outage, def && def.stackedFloors ? refY : undefined) : null; }
  const activeCol = (c) => c.enabled !== false && matchWorld(c.world, S.outage);
  function exitCollider(ex) {
    let c = exitCols.get(ex);
    if (!c) { c = { x0: ex.box[0], z0: ex.box[1], x1: ex.box[2], z1: ex.box[3], y: -50, h: 100, world: ex.world, obb: null, blocker: ex.blockedMsg || "I can't go that way.", soft: false, enabled: true, exit: ex.id, name: ex.id, mapMark: ex.mapMark !== false }; exitCols.set(ex, c); }
    return c;
  }
  function touch(c) {
    const had = contacts.has(c);
    contacts.set(c, clock);
    if (had) return;
    if (c.blocker) { ui('message', c.blocker); blockerMark(c); }
    if (c.soft) Player.turnAround();
  }
  // Dynamic colliders (enemy bodies, c.dynamic) come first in `cols` and their push-out is capped at 0.4 r per pass, so
  // the static colliders resolved right after always see a penetration shallower than the circle's radius: a body that
  // walked into Aidan eases him away but can never shove his centre across a thin wall (a 0.15 m K.wall).
  function resolve(x, z, r, cols, out, o) {
    const maxDyn = r * 0.4;
    for (let it = 0; it < 4; it++) {
      let any = false;
      for (const c of cols) {
        const p = Kit.collide(c, x, z, r);
        if (!p) continue;
        let px = p.x, pz = p.z;
        if (c.dynamic) { const m = Math.hypot(px, pz); if (m > maxDyn) { px *= maxDyn / m; pz *= maxDyn / m; } }
        x += px; z += pz; any = true;
        if (!out.hit) out.hit = c;
        if (o.player && (c.blocker || c.soft)) touch(c);
      }
      if (!any) break;
    }
    return [x, z];
  }
  function floorCheck(x, z, y, o) {
    if (o.noFloor) return y;
    const f = heightAt(x, z, y);
    if (f === null) return false;
    if (f - y > (o.maxStep ?? 0.45)) return false;
    if (y - f > (o.maxDrop ?? 1.0)) return false;
    return f;
  }
  function move(pos, dx, dz, r = 0.3, o = {}) {
    const out = { x: pos.x + dx, y: pos.y, z: pos.z + dz, blocked: false, hit: null };
    if (!build) return out;
    const feet = pos.y || 0, len = Math.hypot(dx, dz);
    const minx = Math.min(pos.x, pos.x + dx) - r - 0.3, maxx = Math.max(pos.x, pos.x + dx) + r + 0.3;
    const minz = Math.min(pos.z, pos.z + dz) - r - 0.3, maxz = Math.max(pos.z, pos.z + dz) + r + 0.3;
    const cols = [];
    for (const c of build.colliders) {
      if (!activeCol(c) || c.x1 < minx || c.x0 > maxx || c.z1 < minz || c.z0 > maxz) continue;
      const cy = c.y || 0;
      if (cy > feet + 1.7 || cy + c.h < feet + 0.2) continue;       // overhead / below the knees (a kerb is a floor step)
      if (o.ignore && o.ignore(c)) continue;
      if (c.dynamic) cols.unshift(c); else cols.push(c);             // (dynamic bodies first: see resolve)
    }
    for (const ex of build.exits) {
      if (!matchWorld(ex.world, S.outage) || !ex.when || !inBand(ex.yBand, feet) || safeWhen(ex.when)) continue;
      const b = ex.box;
      if (b[2] < minx || b[0] > maxx || b[3] < minz || b[1] > maxz) continue;
      cols.push(exitCollider(ex));
    }
    let x = pos.x, z = pos.z;
    let y = o.noFloor ? feet : heightAt(x, z, feet);
    if (y === null) y = feet;
    const n = Math.max(1, Math.ceil(len / (r * 0.5)));
    const sx = dx / n, sz = dz / n;
    for (let i = 0; i < n; i++) {
      let [nx, nz] = resolve(x + sx, z + sz, r, cols, out, o);
      let ny = floorCheck(nx, nz, y, o);
      if (ny === false) {
        let ok = false;
        for (const [tx, tz] of [[x + sx, z], [x, z + sz]]) {
          if (Math.abs(tx - x) < 1e-7 && Math.abs(tz - z) < 1e-7) continue;
          const [ax, az] = resolve(tx, tz, r, cols, out, o);
          const ay = floorCheck(ax, az, y, o);
          if (ay !== false) { nx = ax; nz = az; ny = ay; ok = true; break; }
        }
        if (!ok) { out.blocked = true; break; }
      }
      x = nx; z = nz; y = ny;
    }
    if (len > 1e-6 && Math.hypot(x - pos.x - dx, z - pos.z - dz) > len * 0.5) out.blocked = true;
    out.x = x; out.z = z; out.y = y;
    return out;
  }
  // segment (a→b) vs collider: entry parameter t in [0,1] or null
  function segHit(c, ax, az, bx, bz) {
    let px = ax, pz = az, qx = bx, qz = bz, x0 = c.x0, z0 = c.z0, x1 = c.x1, z1 = c.z1;
    if (c.obb) {
      const { cx, cz, hw, hd, cos, sin } = c.obb;
      px = (ax - cx) * cos - (az - cz) * sin; pz = (ax - cx) * sin + (az - cz) * cos;
      qx = (bx - cx) * cos - (bz - cz) * sin; qz = (bx - cx) * sin + (bz - cz) * cos;
      x0 = -hw; x1 = hw; z0 = -hd; z1 = hd;
    }
    let t0 = 0, t1 = 1;
    const slab = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      return t0 <= t1;
    };
    if (!slab(px, qx - px, x0, x1) || !slab(pz, qz - pz, z0, z1)) return null;
    return t0;
  }
  function sightCols(o, base) {
    const minH = o.minH ?? 1.5, out = [];
    for (const c of build.colliders) {
      if (!activeCol(c)) continue;
      if ((c.blocker || c.soft) && !o.blockers) continue;
      if (o.ignore && o.ignore(c)) continue;
      const cy = c.y || 0;
      if (cy + c.h - base < minH || cy - base > 2.4) continue;
      out.push(c);
    }
    return out;
  }
  function los(ax, az, bx, bz, o = {}) {
    if (!build) return true;
    const base = o.y ?? heightAt(ax, az) ?? 0;
    for (const c of sightCols(o, base)) if (segHit(c, ax, az, bx, bz) !== null) return false;
    return true;
  }
  function raycast(ax, az, dx, dz, max = 20, o = {}) {
    if (!build) return null;
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, bx = ax + ux * max, bz = az + uz * max;
    const base = o.y ?? heightAt(ax, az) ?? 0;
    let best = null;
    for (const c of sightCols({ minH: 0.3, ...o }, base)) {
      const t = segHit(c, ax, az, bx, bz);
      if (t !== null && (!best || t * max < best.dist)) best = { dist: t * max, x: ax + ux * t * max, z: az + uz * t * max, collider: c };
    }
    return best;
  }
  function pointFree(x, z, r = 0.3) {
    if (!build || heightAt(x, z) === null) return false;
    const y = heightAt(x, z);
    for (const c of build.colliders) {
      if (!activeCol(c)) continue;
      const cy = c.y || 0;
      if (cy > y + 1.7 || cy + c.h < y + 0.2) continue;
      if (Kit.collide(c, x, z, r)) return false;
    }
    return true;
  }
  function surfaceAt(x, z) {
    const d = def || {};
    if (Array.isArray(d.surfaces)) for (let i = d.surfaces.length - 1; i >= 0; i--) {
      const s = d.surfaces[i];
      if (s && s.box && matchWorld(s.world, S.outage) && inBox([Math.min(s.box[0], s.box[2]), Math.min(s.box[1], s.box[3]), Math.max(s.box[0], s.box[2]), Math.max(s.box[1], s.box[3])], x, z)) return s.s || s.surface;
    }
    if (S.outage && d.outageSurface) return d.outageSurface;
    return d.surface || (d.outdoor ? 'bitumen' : 'lino');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Interactables
  // ---------------------------------------------------------------------------------------------------------------
  function isActive(it) {
    if (!it || it.removed || it.enabled === false) return false;
    if (!matchWorld(it.world, S.outage)) return false;
    return safeWhen(it.when);
  }
  // nearestInteractable(pos, yawRadians, maxDist=3, {cone (deg, default 100), use (within its own r), look (skip
  // look:false), crawl (only crawl:true ones)}). Score = distance + angle off the facing + the kind's priority (m):
  // doors, pickups, payphones, ladders 0 · docs, stickers 0.1 · interacts 0.15 · people (npc) 0.35 · examines 0.6 —
  // an examine or a person beside a door or a pickup no longer takes the E press meant for it. it.prio overrides.
  const KIND_PRIO = { door: 0, pickup: 0, payphone: 0, break: 0, ladder: 0, doc: 0.1, sticker: 0.1, interact: 0.15, npc: 0.35, examine: 0.6 };
  function nearestInteractable(pos, yaw, maxDist = 3, o = {}) {
    if (!build) return null;
    const cone = (o.cone ?? (o.use ? 95 : 100)) * D2R;
    let best = null, bs = Infinity;
    for (const it of build.interactables) {
      if (!isActive(it)) continue;
      if (o.look && it.look === false) continue;
      if (o.crawl && !it.crawl) continue;
      if (!inBand(it.yBand, pos.y)) continue;
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z, d = Math.hypot(dx, dz);
      const dy = it.pos.y - (pos.y || 0);
      if (dy < -1.0 || dy > 2.6) continue;                          // another level (ladder top, balcony)
      const lim = o.use ? Math.min(maxDist, (it.r ?? 1.2) + 0.15) : maxDist;
      if (d > lim) continue;
      const ang = d < 0.35 ? 0 : Math.abs(U.angleDiff(yaw, Math.atan2(dx, dz)));
      if (ang > cone) continue;
      const s = d + ang * 0.9 + (it.prio ?? KIND_PRIO[it.kind] ?? 0);
      if (s < bs) { bs = s; best = it; }
    }
    return best;
  }
  function doorFor(it) {
    if (!build) return null;
    if (build.doors[it.id]) return build.doors[it.id];
    for (const d of Object.values(build.doors)) if (d.obj === it.obj) return d;
    return null;
  }
  const hasBuiltin = (n) => typeof Script !== 'undefined' && Script && Script.builtins && typeof Script.builtins[n] === 'function';
  async function interact(it) {
    if (!it || busy || transitioning || !isActive(it)) return false;
    busy++;
    try {
      if (it.kind === 'door' && !hasBuiltin('door')) {
        const d = doorFor(it);
        if (d) { await runScript((G) => useDoor(d, G), { control: false, id: it.id }); return true; }
      }
      await runScript(it.fn, { control: it.kind === 'ladder', id: it.id, kind: it.kind });
      return true;
    } finally { busy = Math.max(0, busy - 1); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Doors
  // ---------------------------------------------------------------------------------------------------------------
  const isLocked = (d) => (typeof d.locked === 'function' ? safeLock(d) : !!d.locked);
  function safeLock(d) { try { return !!d.locked(S); } catch (e) { console.error('[World] door locked()', e); return true; } }
  function chapterLocked(d) {
    if (d.chapterLock === false || !def || def.chapter === undefined || def.chapter === null) return false;
    let ch = def.chapter;
    if (d.to && ROOMS[d.to] && ROOMS[d.to].chapter !== undefined && ROOMS[d.to].chapter !== null) ch = Math.max(ch, ROOMS[d.to].chapter);
    return ch < S.chapter;
  }
  const doorPos = (d) => [d.x, (heightAt(d.x, d.z) ?? 0) + 1.0, d.z];
  function unlockDoor(d) {
    d.locked = false; S.done['unlocked:' + d.id] = true;
    if (S.mapMarks && S.mapMarks['auto:door:' + d.id]) autoMark('door:' + d.id, d.x, d.z, 'tick');   // the X becomes a tick
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Automatic map annotations (spec §2A Map screen): trying a locked door puts a red X on the room's map, unlocking it
  // turns that X into a tick, and the first contact with a blocked road (K.drop, K.fogWall, an exit whose when() is
  // false, a K.blocker with {mapMark:true}) puts an X there. Marks live in S.mapMarks['auto:<key>'] (and
  // 'auto:<key>:r' on the room's receipt map when it has one with rxform / sameFrame); rooms without map.xform get
  // none. Opt out per door / drop / fog wall / exit with {mapMark:false}.
  // ---------------------------------------------------------------------------------------------------------------
  function receiptOf(rm) {
    if (rm.outage || rm.receipt) return rm.outage || rm.receipt;
    if (typeof MAPS === 'undefined') return null;
    for (const [id, m] of Object.entries(MAPS)) if (m && m.kind === 'receipt' && (m.of === rm.id || m.base === rm.id || m.for === rm.id)) return id;
    return null;
  }
  // CONTRACT+ World.mapXform(xform, x, z) → [ox, oz, scale, rotDeg] | null. room.map.xform / rxform may be the plain
  // array, a function (x, z) → array (set pieces whose parts sit apart), or a list [{box:[x0,z0,x1,z1], xform}, …]
  // (the first box containing the point; an entry without a box is the default).
  function mapXform(xf, x, z) {
    if (!xf) return null;
    if (typeof xf === 'function') { try { return mapXform(xf(x, z), x, z); } catch (e) { console.error('[World] map xform()', e); return null; } }
    if (Array.isArray(xf) && xf.length && typeof xf[0] === 'object' && xf[0] !== null && !Array.isArray(xf[0])) {
      let dflt = null;
      for (const e of xf) { if (!e) continue; if (!e.box) { dflt = dflt || e.xform; continue; } if (inBox([Math.min(e.box[0], e.box[2]), Math.min(e.box[1], e.box[3]), Math.max(e.box[0], e.box[2]), Math.max(e.box[1], e.box[3])], x, z)) return e.xform; }
      return dflt;
    }
    return Array.isArray(xf) ? xf : null;
  }
  function autoMark(key, x, z, t) {
    const rm = def && def.map;
    if (!rm || !rm.id) return;
    S.mapMarks = S.mapMarks || {};
    const put = (id, map, xf0, floor) => {
      const xf = mapXform(xf0, x, z);
      if (!map || !Array.isArray(xf)) return;
      const [ox, oz, sc = 1, rot = 0] = xf, c = Math.cos(rot * D2R), s = Math.sin(rot * D2R);
      const mx = ox + (x * c - z * s) * sc, my = oz + (x * s + z * c) * sc;
      S.mapMarks[id] = { map, floor: floor ?? 'G', t, x: Math.round(mx * 10) / 10, y: Math.round(my * 10) / 10, auto: true };
    };
    put('auto:' + key, rm.id, rm.xform, rm.floor);
    const rid = receiptOf(rm);
    if (rid) put('auto:' + key + ':r', rid, rm.rxform || (typeof MAPS !== 'undefined' && MAPS[rid] && MAPS[rid].sameFrame ? rm.xform : null), rm.rfloor ?? rm.floor);
  }
  // Marks written earlier turn into ticks when their reason is gone: a door that is no longer locked (a locked()
  // function that turned false, not only an unlock), an exit whose when() passes now, a blocker that isn't built any
  // more (the story moved on). Re-checked for the current room on load and on 'flag' / 'pickup' / 'chapter' / 'outage'.
  const coordKey = (c) => `${Math.round(c.x0 * 2)},${Math.round(c.z0 * 2)},${Math.round(c.x1 * 2)},${Math.round(c.z1 * 2)}`;
  function recheckMarks() {
    if (!build || !roomId || !S.mapMarks) return;
    const M = S.mapMarks;
    const tick = (id) => { for (const k of [id, id + ':r']) { const m = M[k]; if (m && m.t === 'x') m.t = 'tick'; } };
    for (const d of Object.values(build.doors)) {
      const id = 'auto:door:' + d.id, m = M[id] || M[id + ':r'];
      if (m && m.t === 'x' && d.mapMark !== false && !isLocked(d)) tick(id);
    }
    const pre = 'auto:blk:' + roomId + ':';
    let keys = null;
    for (const id0 of Object.keys(M)) {
      if (!id0.startsWith(pre)) continue;
      const id = id0.endsWith(':r') ? id0.slice(0, -2) : id0;
      if (id !== id0 && M[id]) continue;                              // the receipt copy follows its paper mark
      const m = M[id0];
      if (!m || m.t !== 'x') continue;
      const key = id.slice(pre.length);
      const ex = build.exits.find((e) => e.id === key);
      if (ex) { if (!ex.when || safeWhen(ex.when)) tick(id); continue; }
      if (!keys) { keys = new Set(); for (const c of build.colliders) if (c && c.blocker) keys.add(c.exit || c.name || coordKey(c)); }
      if (!keys.has(key)) tick(id);
    }
  }
  for (const ev of ['flag', 'pickup', 'chapter', 'outage']) Bus.on(ev, () => { try { recheckMarks(); } catch (e) { console.error('[World] map marks', e); } });
  function blockerMark(c) {
    if (!c.mapMark || !roomId) return;
    const key = 'blk:' + roomId + ':' + (c.exit || c.name || coordKey(c));
    if (S.mapMarks && S.mapMarks['auto:' + key]) return;
    autoMark(key, (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 'x');
  }
  function animateDoor(d, to, o = {}) {
    if (!d.setOpen) return;
    const from = d.amount ?? (d.open ? 1 : 0);
    if (o.instant) { applyDoorAmount(d, to); doorAnims.delete(d); return; }
    doorAnims.set(d, { from, to, t: 0, dur: o.dur ?? (d.style === 'roller' ? 1.6 : 0.75) });
    if (!o.silent) sfx(to > from ? 'door_open' : 'door_close', { style: d.style, pos: doorPos(d) });
  }
  function applyDoorAmount(d, a) {
    d.setOpen(a);
    const open = a >= (d.passAt ?? 0.5);
    d.open = open;
    if (!d.to && d.collider) d.collider.enabled = !open;
  }
  const openDoor = (d, o) => animateDoor(d, 1, o);
  const closeDoor = (d, o) => animateDoor(d, 0, o);
  function door(id) {
    const d = build && build.doors[id];
    if (!d) {
      console.warn(`[World] door "${id}" not found in ${roomId}`);
      return { id, rec: null, open() {}, close() {}, toggle() {}, lock() {}, unlock() {}, isOpen: false, locked: false };
    }
    return {
      id, rec: d,
      open: (o) => openDoor(d, o), close: (o) => closeDoor(d, o), toggle: (o) => (d.open ? closeDoor(d, o) : openDoor(d, o)),
      lock(msg) { d.locked = true; if (msg) d.lockMsg = msg; delete S.done['unlocked:' + id]; },
      unlock() { unlockDoor(d); },
      get isOpen() { return !!d.open; },
      get locked() { return isLocked(d); },
    };
  }
  // the door use flow (Script.builtins.door delegates here)
  async function useDoor(d, G) {
    if (!d) return false;
    const msg = (t) => (G && typeof G.msg === 'function' ? G.msg(t) : ui('message', t));
    if (chapterLocked(d)) { sfx('door_locked', { pos: doorPos(d) }); msg("It won't open. Not anymore."); return false; }
    if (isLocked(d)) {
      if (d.key && hasItem(d.key)) {
        unlockDoor(d);
        sfx('unlock', { pos: doorPos(d) });
        msg('The key fits.');
        await wait(1.0);
      } else {
        sfx('door_locked', { pos: doorPos(d) }); msg(d.lockMsg || "It's locked.");
        if (d.mapMark !== false && !S.done['unlocked:' + d.id]) autoMark('door:' + d.id, d.x, d.z, 'x');
        return false;
      }
    }
    if (d.to && !ROOMS[d.to]) { sfx('door_locked', { pos: doorPos(d) }); msg(d.lockMsg || "It won't open."); console.warn(`[World] door ${d.id}: no room "${d.to}"`); return false; }
    if (d.openMsg && !S.done['doormsg:' + d.id]) { S.done['doormsg:' + d.id] = true; msg(d.openMsg); await wait(1.2); }
    if (d.to) { await goto(d.to, d.entry, { sound: d.sound || 'door', style: d.style, door: d.id }); return true; }
    if (d.open) closeDoor(d); else openDoor(d);
    return true;
  }
  function stepDoors(dt) {
    for (const [d, a] of [...doorAnims]) {
      a.t += dt;
      const k = U.ease.inOut(U.clamp(a.t / a.dur));
      applyDoorAmount(d, U.lerp(a.from, a.to, k));
      if (a.t >= a.dur) doorAnims.delete(d);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Triggers and exits
  // ---------------------------------------------------------------------------------------------------------------
  // A trigger counts Aidan as inside only while it is ACTIVE (enabled, its world showing, when() true), so a trigger
  // that becomes active with him already in its box fires then (an Outage-only trigger where he stands when the
  // Outage hits, a when() flag set while he waits in it). Triggers only evaluate while the player has control: while
  // a blocking script / cutscene / transition owns Aidan the state is frozen and compared again when control returns
  // (a scene that walks him through a box fires nothing; one that leaves him inside a box fires it on return).
  // K.trigger(…, {anytime:true}) opts out and fires even while a script moves him.
  function checkTriggers(p, ctl) {
    for (const t of build.triggers) {
      if (!ctl && !t.anytime) continue;
      const active = !t.removed && t.enabled !== false && matchWorld(t.world, S.outage) && safeWhen(t.when);
      const inside = active && inBox(t.box, p.x, p.z) && inBand(t.yBand, p.y), prev = trigIn.get(t) || false;
      trigIn.set(t, inside);
      if (inside === prev || !active || (t.enter !== false) !== inside) continue;
      const key = 'trig:' + t.id;
      if (t.once !== false) { if (S.done[key]) continue; S.done[key] = true; }
      runScript(t.fn, { control: true, id: t.id });
    }
  }
  // Street exits are the player's: they only fire while he has control. While a script owns Aidan the arming follows
  // him (inside a box = disarmed), so an exit never fires the moment control returns inside it — he has to step out
  // and back in. A scene that wants a transition calls G.goto itself.
  function checkExits(p, ctl) {
    for (const ex of build.exits) {
      if (!matchWorld(ex.world, S.outage) || !ex.to || !ROOMS[ex.to]) continue;       // (an exit to a missing room is inert)
      const inside = inBox(ex.box, p.x, p.z) && inBand(ex.yBand, p.y);
      if (!ctl) { exitArm.set(ex, !inside); continue; }
      if (!exitArm.get(ex)) { if (!inside) exitArm.set(ex, true); continue; }
      if (!inside || (ex.when && !safeWhen(ex.when))) continue;
      exitArm.set(ex, false);
      goto(ex.to, ex.entry, { fade: ex.fade !== false, sound: ex.sound || 'steps', exit: ex.id });
      return;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lights: banks die toward the camera / return away from it
  // ---------------------------------------------------------------------------------------------------------------
  function light(name) { if (!build) return null; const l = build.lights.find((x) => x.name === name); return l ? l.handle : null; }
  function lightBanks(list, farFirst = true) {
    if (!list.length) return [];
    const cp = Render.camera.position;
    const dist = (l) => l.pos.distanceTo(cp);
    let groups;
    const banks = new Set(list.map((l) => l.bank || 0));
    if (banks.size <= 1) {
      // no authored banks: split by distance from the camera into up to four banks
      const sorted = list.slice().sort((a, b) => dist(b) - dist(a));
      const n = Math.min(4, sorted.length), per = Math.ceil(sorted.length / n);
      groups = [];
      for (let i = 0; i < sorted.length; i += per) groups.push(sorted.slice(i, i + per));
    } else {
      const m = new Map();
      for (const l of list) { const b = l.bank || 0; if (!m.has(b)) m.set(b, []); m.get(b).push(l); }
      groups = [...m.values()];
      const mean = (g) => g.reduce((s, l) => s + dist(l), 0) / g.length;
      groups.sort((a, b) => mean(b) - mean(a));
    }
    return farFirst ? groups : groups.reverse();
  }
  // flicker a light out (or on) at time t of sequence s; set(v) switches it
  function flickLight(s, l, t, on, set) {
    const pos = [l.pos.x, l.pos.y, l.pos.z];
    const seq = on ? [0, 1, 0, 1, 0, 1] : [0, 1, 0, 1, 0];
    const gaps = [0, 0.06, 0.11, 0.2, 0.26, 0.36];
    s.at(t, () => sfx(l.kind === 'fluoro' || l.kind === 'led' ? 'tube_flicker' : 'click', { pos, vol: l.kind === 'led' ? 0.15 : 0.4, dur: 0.35 }));
    seq.forEach((v, i) => s.at(t + gaps[i], () => set(l, !!v)));
  }
  const worldSet = (l, v) => { if (l.handle.setWorld) l.handle.setWorld(v); };
  const onSet = (l, v) => l.handle.on(v);
  function lightsOut(o = {}) {
    if (!build) return Promise.resolve(false);
    const dur = o.dur ?? 3;
    const lit = build.lights.filter((l) => l.handle.isOn && (!o.filter || o.filter(l)));
    const banks = lightBanks(lit, true);
    const s = makeSeq(dur + 0.5, 'lights');
    banks.forEach((b, i) => { const t = banks.length > 1 ? (i * dur) / (banks.length - 1) * 0.9 : 0; for (const l of b) flickLight(s, l, t + Math.random() * 0.12, false, onSet); });
    return startSeq(s);
  }
  function lightsOn(o = {}) {
    if (!build) return Promise.resolve(false);
    const dur = o.dur ?? 2;
    const list = build.lights.filter((l) => matchWorld(l.world, S.outage) && (!o.filter || o.filter(l)));
    const banks = lightBanks(list, false);
    const s = makeSeq(dur + 0.5, 'lights');
    banks.forEach((b, i) => { const t = banks.length > 1 ? (i * dur) / (banks.length - 1) * 0.9 : 0; for (const l of b) flickLight(s, l, t + Math.random() * 0.12, true, onSet); });
    return startSeq(s);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The Outage
  // ---------------------------------------------------------------------------------------------------------------
  function phoneBars(n) {
    try {
      if (typeof Phone !== 'undefined' && Phone) {
        if (typeof Phone.bars === 'function') return Phone.bars(n);
        if (typeof Phone.override === 'function') return Phone.override(n);
      }
      if (hasUI() && UI.bars) UI.bars(n === null || n === undefined ? 0 : n, { mode: 'normal' });
    } catch (e) { console.error('[World] phone bars', e); }
    return undefined;
  }
  function swapWorld(on, o = {}) {
    on = !!on;
    S.outage = on;
    if (build) {
      build.outage = on;
      for (const t of build.tagged) t.obj.visible = matchWorld(t.world, on);
      if (!o.deferLights) for (const l of build.lights) worldSet(l, matchWorld(l.world, on));
    }
    try { if (typeof Snd !== 'undefined' && Snd.setWorld) Snd.setWorld(on ? 'outage' : 'fog'); } catch (e) { /* audio */ }
    swapSpawns();
    contacts.clear();
    if (typeof Cam !== 'undefined' && Cam.snap && !Cam.isScripted) Cam.snap();
    Bus.emit('outage', on);
  }
  function setOutage(on) {
    finishSeqs('outage');
    swapWorld(!!on);
    Tex.setOutage(on ? 1 : 0);
    if (def) Render.setEnvironment(envOpts(!!on));
    Render.post.grain = null; Render.post.ca = null; Render.post.noise = 0;
    return !!on;
  }
  function outageTransition(on = true) {
    on = !!on;
    finishSeqs('outage');
    if (!build) { setOutage(on); return Promise.resolve(true); }
    if (!!S.outage === on && Tex.outage === (on ? 1 : 0)) return Promise.resolve(false);
    return startSeq(on ? enterSeq() : leaveSeq());
  }
  function enterSeq() {
    const s = makeSeq(8.8, 'outage');
    s.resolveAt = 6.25;
    const lit = build.lights.filter((l) => l.world !== 'outage' && l.handle.isOn);
    let dial = null;
    const post = Render.post;
    s.at(0, () => { dial = sfx('dialup', { sustain: true }); Bus.emit('outage:begin', true); });
    // 2. grain and aberration ramp up (the Outage grade takes over at the cut)
    s.tween(0, 6, (k) => { post.grain = U.lerp(0.08, 0.34, k * k); post.ca = U.lerp(0.55, 2.3, k * k); post.noise = k > 0.75 ? ((k - 0.75) / 0.25) * 0.08 : 0; });
    // 3. lights die bank by bank toward the camera — all dark before the 4.0 s swap hides the Fog world's fixtures
    const banks = lightBanks(lit, true);
    banks.forEach((b, i) => {
      const t = banks.length > 1 ? 1.2 + (i * 2.3) / (banks.length - 1) : 2.4;
      for (const l of b) flickLight(s, l, t + Math.random() * 0.15, false, worldSet);
    });
    s.at(1.4, () => Render.setEnvironment(envOpts(true, { dur: 4.4, gradeDur: 4.4 })));
    // 4. surfaces dissolve; tagged objects, colliders and spawns swap at the midpoint
    s.tween(2.4, 5.6, (k) => Tex.setOutage(k));
    s.at(4.0, () => swapWorld(true, { deferLights: true }));
    // 5. the siren cuts dead; the Outage's own lights come on; the phone bars climb
    s.at(6.0, () => {
      sfx('siren_cut');
      if (dial && dial.stop) dial.stop(0.006);
      post.grain = null; post.ca = null; post.noise = 0;
      Render.glitch(0.35, 1);
      Tex.setOutage(1);
      if (build) for (const l of build.lights) worldSet(l, matchWorld(l.world, true));
      try { if (typeof Input !== 'undefined' && Input.rumble) Input.rumble(0.7, 0.4, 160); } catch (e) { /* no pad */ }
    });
    [[6.0, 0], [6.55, 1], [7.1, 2], [7.7, 3], [8.7, null]].forEach(([t, n]) => s.at(t, () => phoneBars(n)));
    return s;
  }
  function leaveSeq() {
    const s = makeSeq(4.7, 'outage');
    const post = Render.post;
    const outLit = build.lights.filter((l) => l.world === 'outage' && l.handle.isOn);
    const fogLights = build.lights.filter((l) => l.world === 'fog');
    s.at(0, () => { sfx('exhale_static', { dur: 4.5 }); phoneBars(null); Bus.emit('outage:begin', false); });
    s.tween(0, 4.3, (k) => { const g = Math.sin(Math.PI * Math.min(1, k * 1.25)); post.grain = U.lerp(0.14, 0.08, k) + g * 0.08; post.ca = U.lerp(0.95, 0.55, k) + g * 0.45; });
    s.at(0.4, () => Render.setEnvironment(envOpts(false, { dur: 3.4, gradeDur: 3.4 })));
    s.tween(0.5, 3.5, (k) => Tex.setOutage(1 - k));
    for (const l of outLit) flickLight(s, l, 1.7 + Math.random() * 0.3, false, worldSet);
    s.at(2.0, () => swapWorld(false, { deferLights: true }));
    const banks = lightBanks(fogLights, false);
    banks.forEach((b, i) => {
      const t = banks.length > 1 ? 2.2 + (i * 1.8) / (banks.length - 1) : 2.6;
      for (const l of b) flickLight(s, l, t + Math.random() * 0.15, true, worldSet);
    });
    s.at(4.6, () => {
      post.grain = null; post.ca = null; post.noise = 0;
      Tex.setOutage(0);
      if (build) for (const l of build.lights) worldSet(l, matchWorld(l.world, false));
    });
    return s;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------------------------
  // the player drives Aidan: no blocking script / cutscene holds him, no lock (transition, chapter card, death), no menu
  function playerHasControl() {
    if (!Player.canControl) return false;
    try { if (typeof Script !== 'undefined' && Script && Script.busy) return false; } catch (e) { /* partial build */ }
    return true;
  }
  function update(dt = Time.dt || 0) {
    clock += dt;
    stepWaits();
    if (seqs.length) for (const s of seqs.slice()) if (stepSeq(s, dt)) { const i = seqs.indexOf(s); if (i >= 0) seqs.splice(i, 1); }
    if (!build) return;
    roomT += dt;
    stepDoors(dt);
    const anim = build.animated;
    for (let i = 0; i < anim.length; i++) {
      const fn = anim[i];
      if (failedAnim.has(fn)) continue;
      try { fn(dt, roomT); } catch (e) { failedAnim.add(fn); console.error('[World] animated callback failed (disabled)', e); }
    }
    if (typeof def.onUpdate === 'function') { try { def.onUpdate(dt); } catch (e) { console.error(`[World] ${roomId}.onUpdate`, e); } }
    for (const [c, t] of [...contacts]) if (clock - t > 0.35) contacts.delete(c);
    if (!transitioning && Player.actor && Player.mode !== 'dead') {
      const p = Player.pos;
      const ctl = playerHasControl();
      checkExits(p, ctl);
      if (build && !transitioning) checkTriggers(p, ctl);
    }
  }

  const api = {
    load, unload, goto, cancelTransition, recheckMarks, mapXform, update, move, heightAt, los, raycast, pointFree, surfaceAt,
    nearestInteractable, isActive, interact, useDoor, door, setOutage, outageTransition, lightsOut, lightsOn, light,
    runScript, wait,
    mark: (n) => (build && build.marks[n]) || null,
    region: (n) => region(n), obj: (n) => obj(n),
    inRegion(n, p = Player.pos) { const r = region(n); return !!r && inBox(r, p.x, p.z); },
    get build() { return build; },
    get room() { return roomId; },
    get def() { return def; },
    get fromRoom() { return lastRoom; },
    get time() { return roomT; },
    get transitioning() { return transitioning; },
    get busy() { return busy > 0; },
    get marks() { return build ? build.marks : {}; },
    get regions() { return build ? build.regions : {}; },
    get objs() { return build ? build.objs : {}; },
    get interactables() { return build ? build.interactables.filter(isActive) : []; },
    get colliders() { return build ? build.colliders.filter(activeCol) : []; },
    get exits() { return build ? build.exits : []; },
    get triggers() { return build ? build.triggers : []; },
    get doors() { return build ? build.doors : {}; },
    get lights() { return build ? build.lights : []; },
    get spawned() { return spawned; },
    get outageBusy() { return seqs.some((s) => s.tag === 'outage'); },
  };
  function region(n) { return (build && build.regions[n]) || null; }
  function obj(n) { return (build && build.objs[n]) || null; }
  return api;
})();
