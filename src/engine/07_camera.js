// ==== engine/07_camera.js — Cam: fixed-camera volumes, static/pan/rail/scripted cameras, shake, volume check ====
// ARCHITECTURE §8 · spec §3 (fixed cameras, composition, hysteresis), §4 (debug overlay: volumes + off-screen flags).
//
// Room cameras come from CAMERAS[roomId] (defineRoom({cameras})). Each frame Cam.update(dt) picks the camera whose
// XZ volume (optionally limited by `y` = the player's foot height) contains Aidan: higher `pri` wins among containing
// volumes, the current camera counts as containing until he is more than 0.5 m outside its volume (hysteresis — but
// only while it still sees him: feet and head in frame and no wall / closed door / tall prop between lens and chest)
// and ties keep the current one, so overlapping volumes never flicker. A change is an instant cut (Bus 'cam:cut').
//
// Camera def (contract §8) — every field but vol/pos is optional:
//   { id, vol:[x0,z0,x1,z1], y:[y0,y1], pri:0, type:'static'|'pan'|'rail'|'scripted', pos:[x,y,z], target:[x,y,z],
//     fov:45|'fit', roll:0 (deg, Dutch), pan:{lag:0.25, yaw:35, pitch:15}, rail:{a, b, look:[dx,dy,dz], lag:0.3},
//     world:'fog'|'outage'|'both', when:(S)=>bool }
//   static   fixed pos → target.
//   pan      fixed pos; aims at Aidan's chest with `lag` (s, time constant), clamped to ±yaw / ±pitch degrees around
//            the pos→target direction.
//   rail     pos slides a→b by Aidan's projection onto the segment (XZ), looking at Aidan + look (default [0,1.1,0]).
//   scripted CONTRACT+: a room camera that plays keyframes when cut to: keys:[{t, pos, target, fov, roll, ease}],
//            loop:false. (Cutscenes use Cam.scripted(spec) instead.)
//   fov:'fit' → the smallest fov (30…60) that frames the whole volume (Aidan at 0.1–1.8 m) from pos; for pan/rail
//            cameras the fov that keeps him framed everywhere in the volume. Recomputed when the aspect changes.
//
// API: load(roomId, build), unload(), update(dt), basis() → {fx,fz,rx,rz}, scripted(spec) → Promise, release(),
//   shake(amount, dur), current, onCut(fn) → off, check(roomId) → problems.
// CONTRACT+: snap() (re-select + instant, after teleports), lock(camId|null) (force a room camera), use(camId) (alias),
//   done() → Promise of the running scripted move, finish() (jump scripted moves to their end — cutscene skip),
//   a room with no cameras gets a high follow camera behind Aidan (a safety net while content is written),
//   busy (scripted move running), isScripted, cutCount, defs, debugDraw(on, problems?), view (current pos/target/fov/
//   roll), fit(def, build) (fov a 'fit' camera resolves to), visibleFrom(camDef, x, y, z) → null|'behind'|'offscreen'.
// Cam.check(roomId|'*', {aspect=16/9, step=0.5, worlds}) samples every walkable point on a 0.5 m grid (floors of the
// room's RoomBuild, minus points inside colliders) at heights 0.1 and 1.8 and returns
// [{cam, x, z, y, why:'uncovered'|'offscreen'|'behind', world}] (cam null for uncovered points). A camera with `when`
// is checked wherever it contains a point (it may be the one showing); an unconditional camera only where no
// unconditional camera of higher `pri` also contains the point.
// CONTRACT+: far — the far plane (m, default 200) from a scripted move (G.cam({far})), a camera def or the room def
//   (wide aerial / dawn sky shots with a big dome).
// CONTRACT+: rooms with cutsceneOnly:true (sets the player never walks) are skipped; rooms with stackedFloors:true are
//   sampled on every floor layer; Cam.check(room, {occlusion:true}) also casts a ray from each camera to Aidan's chest
//   at every sample (1 m grid by default) against the room's visible meshes and reports why:'occluded' with `hit` (the
//   first object's name) — walls, closed doors, sign backs, duct runs; one-sided (cutaway) faces seen from behind and
//   transparent / glass surfaces don't block. Off by default (it is slow on big rooms).
const Cam = (() => {
  const D2R = Math.PI / 180, HYST = 0.5, FOV_MIN = 30, FOV_MAX = 60, CHEST = 1.1;
  const cam = Render.camera;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _off = V(), _subj = V();
  const probe = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
  const UP = V(0, 1, 0), NORTH = V(0, 0, -1);
  const matchWorld = (w, outage) => !w || w === 'both' || (w === 'outage') === !!outage;
  const safeWhen = (fn) => { try { return !fn || !!fn(S); } catch (e) { console.error('[Cam] when() failed', e); return false; } };
  const normBox = (b) => [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
  const v3of = (p, fb) => (p === undefined || p === null ? (fb ? fb.clone() : V()) : p.isVector3 ? p.clone() : Array.isArray(p) ? U.toV3(p) : fb ? fb.clone() : V());

  let roomId = null, build = null, defs = [], current = null, forced = null, aspectUsed = 0;
  let snapNext = true, cutCount = 0, scriptedSt = null, dbg = null, dbgOn = false, dbgProblems = null;
  const listeners = new Set();
  const view = { pos: V(0, 1.7, 6), target: V(0, 1, 0), fov: 50, roll: 0 };
  const shakes = [];
  let shakeT = 0;

  // ---------------------------------------------------------------------------------------------------------------
  // Room data
  // ---------------------------------------------------------------------------------------------------------------
  const floorsOf = (rb) => (rb && rb.floors) || [];
  function floorY(rb, x, z, outage = S.outage) {
    const f = floorsOf(rb);
    if (!f.length) return 0;
    const y = Kit.floorAt(f, x, z, outage);
    return y === null ? null : y;
  }
  // normalise a def (a copy: the registry entry is never mutated); rt holds runtime state
  function norm(d, i, rb, rid, aspect) {
    const vol = normBox(d.vol || d.volume || [0, 0, 0, 0]);
    const pos = v3of(d.pos || d.position, V((vol[0] + vol[2]) / 2, 2.6, vol[3]));
    const target = v3of(d.target, V((vol[0] + vol[2]) / 2, 0.9, (vol[1] + vol[3]) / 2));
    const n = {
      ...d, id: d.id || `${rid}:cam${i + 1}`, type: d.type || 'static', pri: d.pri || 0, vol, pos, target,
      roll: d.roll || 0, world: d.world || 'both', src: d,
      pan: d.type === 'pan' ? { lag: 0.25, yaw: 35, pitch: 15, ...(d.pan || {}) } : d.pan || null,
      rail: d.rail ? { lag: 0.3, look: [0, CHEST, 0], ...d.rail, a: v3of(d.rail.a, pos), b: v3of(d.rail.b, pos) } : null,
      keys: Array.isArray(d.keys) ? d.keys.map((k) => ({ ...k, pos: v3of(k.pos, pos), target: v3of(k.target, target) })) : null,
      rt: { yaw: 0, pitch: 0, pos: V(), t: 0 },
    };
    if (n.type === 'rail' && !n.rail) n.rail = { lag: 0.3, look: [0, CHEST, 0], a: pos.clone(), b: pos.clone() };
    const dir = _a.copy(target).sub(pos);
    n.baseYaw = Math.atan2(dir.x, dir.z);
    n.basePitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z) || 1e-6);
    n.fovV = typeof d.fov === 'number' ? d.fov : d.fov === 'fit' ? fitFov(n, rb, aspect) : 50;
    return n;
  }
  function inVol(c, x, z, y, m = 0) {
    const v = c.vol;
    if (x < v[0] - m || x > v[2] + m || z < v[1] - m || z > v[3] + m) return false;
    if (c.y && y !== null && y !== undefined && (y < c.y[0] - m - 0.01 || y > c.y[1] + m + 0.01)) return false;
    return true;
  }
  const volDist = (c, x, z) => Math.hypot(Math.max(c.vol[0] - x, 0, x - c.vol[2]), Math.max(c.vol[1] - z, 0, z - c.vol[3]));

  // ---------------------------------------------------------------------------------------------------------------
  // Views: what a camera shows for a given subject position (feet)
  // ---------------------------------------------------------------------------------------------------------------
  function panAim(c, sx, sy, sz) {
    const dx = sx - c.pos.x, dy = sy + CHEST - c.pos.y, dz = sz - c.pos.z;
    let yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-6);
    const lim = c.pan || {};
    yaw = c.baseYaw + U.clamp(U.angleDiff(c.baseYaw, yaw), -(lim.yaw ?? 35) * D2R, (lim.yaw ?? 35) * D2R);
    pitch = c.basePitch + U.clamp(pitch - c.basePitch, -(lim.pitch ?? 15) * D2R, (lim.pitch ?? 15) * D2R);
    return { yaw, pitch };
  }
  const aimTarget = (pos, yaw, pitch, out) => out.set(pos.x + Math.sin(yaw) * Math.cos(pitch), pos.y + Math.sin(pitch), pos.z + Math.cos(yaw) * Math.cos(pitch));
  function railPos(c, sx, sz, out) {
    const a = c.rail.a, b = c.rail.b, ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-8 ? U.clamp(((sx - a.x) * ex + (sz - a.z) * ez) / L2, 0, 1) : 0;
    return out.copy(a).lerp(b, t);
  }
  const railLook = (c, sx, sy, sz, out) => { const l = c.rail.look || [0, CHEST, 0]; return out.set(sx + (l[0] || 0), sy + (l[1] ?? CHEST), sz + (l[2] || 0)); };
  // steady-state view of camera c with the subject standing at (sx, sy, sz)
  function steadyView(c, sx, sy, sz, out) {
    out.fov = c.fovV; out.roll = c.roll;
    if (c.type === 'pan') { const a = panAim(c, sx, sy, sz); out.pos.copy(c.pos); aimTarget(c.pos, a.yaw, a.pitch, out.target); }
    else if (c.type === 'rail') { railPos(c, sx, sz, out.pos); railLook(c, sx, sy, sz, out.target); }
    else if (c.type === 'scripted' && c.keys && c.keys.length) { const k = c.keys[0]; out.pos.copy(k.pos); out.target.copy(k.target); out.fov = k.fov ?? c.fovV; out.roll = k.roll ?? c.roll; }
    else { out.pos.copy(c.pos); out.target.copy(c.target); }
    return out;
  }
  function orient(o, pos, target, roll) {
    o.position.copy(pos);
    const d = _e.copy(target).sub(pos);
    const l = d.length();
    o.up.copy(l > 1e-6 && Math.abs(d.y / l) > 0.985 ? NORTH : UP);
    o.lookAt(target);
    if (roll) o.rotateZ(roll * D2R);
    o.up.copy(UP);
  }
  // null (visible) | 'behind' | 'offscreen' for a world point seen with view v at the given aspect
  function visibility(v, p, aspect, margin = 1) {
    probe.fov = v.fov; probe.aspect = aspect;
    orient(probe, v.pos, v.target, v.roll);
    probe.updateMatrixWorld(true);
    const q = _d.copy(p).applyMatrix4(probe.matrixWorldInverse);
    if (q.z > -0.05) return 'behind';
    const th = Math.tan((v.fov * D2R) / 2);
    const nx = q.x / (-q.z * th * aspect), ny = q.y / (-q.z * th);
    return Math.abs(nx) > margin || Math.abs(ny) > margin ? 'offscreen' : null;
  }
  // tan(half vertical fov) needed to frame point p from the view (Infinity if behind)
  function tanNeeded(v, p, aspect) {
    orient(probe, v.pos, v.target, v.roll);
    probe.updateMatrixWorld(true);
    const q = _d.copy(p).applyMatrix4(probe.matrixWorldInverse);
    if (q.z > -0.05) return Infinity;
    return Math.max(Math.abs(q.y) / -q.z, Math.abs(q.x) / (-q.z * aspect));
  }
  // sample points of a volume where Aidan can stand: grid points on a floor (or the corners at y=0 with no floors)
  function volSamples(c, rb, step, outage) {
    const v = c.vol, pts = [];
    const nx = Math.max(1, Math.ceil((v[2] - v[0]) / step)), nz = Math.max(1, Math.ceil((v[3] - v[1]) / step));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = v[0] + ((v[2] - v[0]) * i) / nx, z = v[1] + ((v[3] - v[1]) * j) / nz;
      const y = floorsOf(rb).length ? floorY(rb, x, z, outage) : 0;
      if (y === null) continue;
      if (c.y && (y < c.y[0] - 0.01 || y > c.y[1] + 0.01)) continue;
      pts.push([x, y, z]);
    }
    if (!pts.length) for (const [x, z] of [[v[0], v[1]], [v[2], v[1]], [v[0], v[3]], [v[2], v[3]]]) pts.push([x, c.y ? c.y[0] : 0, z]);
    return pts;
  }
  function fitFov(c, rb, aspect) {
    const outage = c.world === 'outage';
    const tmp = { pos: V(), target: V(), fov: 50, roll: c.roll };
    let need = 0;
    const tracking = c.type === 'pan' || c.type === 'rail';
    for (const [x, y, z] of volSamples(c, rb, tracking ? 1 : 0.5, outage)) {
      steadyView(c, x, y, z, tmp);
      if (!tracking) { for (const h of [0.1, 1.8]) need = Math.max(need, tanNeeded(tmp, _b.set(x, y + h, z), aspect)); continue; }
      // tracking cameras keep a padded box around Aidan in frame (feet to above the head, a shoulder-width either side)
      let rx = tmp.pos.z - z, rz = x - tmp.pos.x;
      const rl = Math.hypot(rx, rz) || 1; rx = (rx / rl) * 0.6; rz = (rz / rl) * 0.6;
      for (const [px, py, pz] of [[x, y - 0.05, z], [x, y + 2.05, z], [x + rx, y + 1, z + rz], [x - rx, y + 1, z - rz]]) need = Math.max(need, tanNeeded(tmp, _b.set(px, py, pz), aspect));
    }
    if (!isFinite(need)) return FOV_MAX;
    const margin = tracking ? 1.08 : 1.03;
    return U.clamp((2 * Math.atan(need * margin)) / D2R, FOV_MIN, FOV_MAX);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Load / select / cut
  // ---------------------------------------------------------------------------------------------------------------
  const curAspect = () => (cam.aspect > 0.1 ? cam.aspect : 16 / 9);
  function load(id, rb) {
    unload(true);
    autoSt.yaw = null;
    roomId = id; build = rb || null;
    aspectUsed = curAspect();
    defs = (CAMERAS[id] || []).map((d, i) => norm(d, i, build, id, aspectUsed));
    current = null; forced = null; snapNext = true;
    if (dbgOn) buildDebug();
    return defs;
  }
  function unload(keepDebug) {
    defs = []; current = null; build = null; roomId = null; forced = null;
    if (dbg && !keepDebug) { dbg.removeFromParent(); disposeDebug(); }
  }
  function refit() {
    aspectUsed = curAspect();
    for (const c of defs) if (c.src.fov === 'fit') c.fovV = fitFov(c, build, aspectUsed);
  }
  function subject(out) {
    if (typeof Player !== 'undefined' && Player && Player.pos) return out.copy(Player.pos);
    return out.set(0, 0, 0);
  }
  const allowed = (c) => matchWorld(c.world, S.outage) && safeWhen(c.when);
  // The 0.5 m exit hysteresis only holds the current camera while it can still see Aidan: feet and head inside the
  // frame (its view of him where he stands — what a pan/rail camera settles on) and a clear line from the lens to his
  // chest (walls, closed doors and tall props block; invisible blockers and one-sided cutaway walls seen from behind
  // don't). Otherwise the best containing camera takes over, so stepping through a doorway past the edge of a volume
  // never leaves him off-frame or behind a wall.
  const _hp = V(), _hq = V(), hv = { pos: V(), target: V(), fov: 50, roll: 0 };
  function holdable(c, p) {
    const v = steadyView(c, p.x, p.y, p.z, hv);
    const a = curAspect();
    if (visibility(v, _hp.set(p.x, p.y + 0.1, p.z), a, 0.96) || visibility(v, _hp.set(p.x, p.y + 1.8, p.z), a, 0.96)) return false;
    return clearSight(_hq.copy(v.pos), _hp.set(p.x, p.y + 1.2, p.z));
  }
  // segment a→b (3D) against the loaded room's colliders at least 1.2 m tall
  function clearSight(a, b) {
    const cols = typeof World !== 'undefined' && World && World.build ? World.build.colliders : null;
    if (!cols) return true;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const c of cols) {
      if (c.enabled === false || !matchWorld(c.world, S.outage) || c.blocker || c.soft || c.enemy || (c.h || 0) < 1.2) continue;
      if (c.oneSided && (a.x - (c.x0 + c.x1) / 2) * c.oneSided[0] + (a.z - (c.z0 + c.z1) / 2) * c.oneSided[1] < 0) continue;
      let px = a.x, pz = a.z, qx = dx, qz = dz, x0 = c.x0, x1 = c.x1, z0 = c.z0, z1 = c.z1;
      if (c.obb) {
        const { cx, cz, hw, hd, cos, sin } = c.obb;
        px = (a.x - cx) * cos - (a.z - cz) * sin; pz = (a.x - cx) * sin + (a.z - cz) * cos;
        qx = dx * cos - dz * sin; qz = dx * sin + dz * cos; x0 = -hw; x1 = hw; z0 = -hd; z1 = hd;
      }
      if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) continue;     // the lens sits inside it (a cutaway ceiling void …)
      let t0 = 0, t1 = 0.97;                                          // (stop just short of Aidan)
      let ok = true;
      for (const [p0, d, lo, hi] of [[px, qx, x0, x1], [pz, qz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) { ok = false; break; } continue; }
        let ta = (lo - p0) / d, tb = (hi - p0) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok) continue;
      const ya = a.y + dy * t0, yb = a.y + dy * t1, cy = c.y || 0;
      if (Math.max(ya, yb) < cy || Math.min(ya, yb) > cy + c.h) continue;
      return false;
    }
    return true;
  }
  function select(p) {
    if (forced) { const f = defs.find((c) => c.id === forced); if (f && allowed(f)) return f; }
    let best = null;
    for (const c of defs) {
      if (!allowed(c)) continue;
      if (!inVol(c, p.x, p.z, p.y, 0) && (c !== current || !inVol(c, p.x, p.z, p.y, HYST) || !holdable(c, p))) continue;
      if (!best || c.pri > best.pri || (c.pri === best.pri && c === current)) best = c;
    }
    if (best) return best;
    if (current && allowed(current)) return current;           // outside every volume: never cut to nothing
    let near = null, nd = Infinity;
    for (const c of defs) { if (!allowed(c)) continue; const d = volDist(c, p.x, p.z); if (d < nd) { nd = d; near = c; } }
    return near;
  }
  function cut(c) {
    current = c; snapNext = true; cutCount++;
    if (c && c.type === 'scripted') c.rt.t = 0;
    Bus.emit('cam:cut', c);
    for (const fn of [...listeners]) { try { fn(c); } catch (e) { console.error('[Cam] onCut listener', e); } }
    if (dbgOn) colorDebug();
  }
  function onCut(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function snap() {
    if (scriptedSt) return;
    const p = subject(_subj);
    const c = select(p);
    if (c !== current) cut(c); else snapNext = true;
    if (current) liveView(current, p, 0);
    apply(0);
  }
  function lock(id) { forced = id || null; if (!scriptedSt) snap(); }

  // live view of the current room camera (with pan/rail smoothing); snapNext makes it instant
  function liveView(c, p, dt) {
    const snapIt = snapNext; snapNext = false;
    view.roll = c.roll; view.fov = c.fovV;
    if (c.type === 'pan') {
      const a = panAim(c, p.x, p.y, p.z);
      if (snapIt || !(dt > 0)) { c.rt.yaw = a.yaw; c.rt.pitch = a.pitch; }
      else {
        const k = 1 - Math.exp(-dt / Math.max(0.02, c.pan.lag ?? 0.25));
        c.rt.yaw += U.angleDiff(c.rt.yaw, a.yaw) * k; c.rt.pitch += (a.pitch - c.rt.pitch) * k;
      }
      view.pos.copy(c.pos); aimTarget(c.pos, c.rt.yaw, c.rt.pitch, view.target);
    } else if (c.type === 'rail') {
      railPos(c, p.x, p.z, _b);
      if (snapIt || !(dt > 0)) c.rt.pos.copy(_b);
      else c.rt.pos.lerp(_b, 1 - Math.exp(-dt / Math.max(0.02, c.rail.lag ?? 0.3)));
      view.pos.copy(c.rt.pos); railLook(c, p.x, p.y, p.z, view.target);
    } else if (c.type === 'scripted' && c.keys && c.keys.length) {
      c.rt.t += dt;
      evalKeys(c.keys, c.loop ? c.rt.t % (c.keys[c.keys.length - 1].t || 1) : c.rt.t, view, c.fovV, c.roll);
    } else { view.pos.copy(c.pos); view.target.copy(c.target); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Scripted cameras (cutscenes): Cam.scripted({pos, target, fov, roll, to:{…}, dur, ease, follow, keys, followOffset})
  // pos/target: [x,y,z] | Vector3 | mark name | Object3D | actor (target only: its head). `follow` (actor/Object3D)
  // keeps the target on it every frame. keys (CONTRACT+): [{t, pos, target, fov, roll, ease}] with t in seconds.
  // The camera holds the last frame until Cam.release().
  // ---------------------------------------------------------------------------------------------------------------
  function resolveP(v, out, head) {
    if (v === undefined || v === null) return null;
    if (v.isVector3) return out.copy(v);
    if (Array.isArray(v)) return v.length === 2 ? out.set(v[0], 1.6, v[1]) : out.set(v[0], v[1], v[2]);
    if (typeof v === 'string') {
      const m = typeof World !== 'undefined' && World && World.marks ? World.marks[v] : null;
      return m ? out.copy(m.pos) : null;
    }
    const act = v.raw && v.raw.root ? v.raw : v;
    if (act.bones && act.bones.head && head) return act.bones.head.getWorldPosition(out);
    if (act.root && act.root.isObject3D) return act.root.getWorldPosition(out).add(_off.set(0, head ? 1.55 : 0, 0));
    if (act.isObject3D) return act.getWorldPosition(out);
    if (act.pos && act.pos.isVector3) return out.copy(act.pos).add(_off.set(0, head ? 1.5 : 0, 0));
    return null;
  }
  function key(k, from) {
    return { t: k.t ?? 0, pos: k.pos ?? from.pos, target: k.target ?? from.target, fov: k.fov ?? from.fov, roll: k.roll ?? from.roll, ease: k.ease };
  }
  function evalKeys(keys, t, out, fovDef, rollDef) {
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const span = b.t - a.t;
    const e = U.ease[b.ease || 'inOut'] || U.ease.inOut;
    const k = a === b || span <= 0 ? (t >= b.t ? 1 : 0) : e(U.clamp((t - a.t) / span));
    const pa = resolveP(a.pos, _a) || out.pos, pb = resolveP(b.pos, _b) || pa;
    out.pos.copy(pa).lerp(pb, a === b ? 0 : k);
    const ta = resolveP(a.target, _c, true) || out.target;
    const tb = resolveP(b.target, _d, true) || ta;
    out.target.copy(ta).lerp(tb, a === b ? 0 : k);
    out.fov = U.lerp(a.fov ?? fovDef, b.fov ?? fovDef, k);
    out.roll = U.lerp(a.roll ?? rollDef, b.roll ?? rollDef, k);
    return out;
  }
  function scripted(spec = {}) {
    if (scriptedSt && scriptedSt.resolve) scriptedSt.resolve();
    const from = { pos: spec.pos ?? view.pos.clone(), target: spec.target ?? spec.follow ?? view.target.clone(), fov: spec.fov ?? view.fov, roll: spec.roll ?? view.roll };
    let keys;
    if (Array.isArray(spec.keys) && spec.keys.length) keys = spec.keys.map((k) => key(k, from));
    else {
      keys = [{ t: 0, ...from }];
      const dur = Math.max(0, spec.dur ?? (spec.to ? 2 : 0));
      if (spec.to) keys.push({ ...key(spec.to, from), t: dur, ease: spec.ease || 'inOut' });
    }
    keys.sort((a, b) => a.t - b.t);
    const dur = keys[keys.length - 1].t;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    scriptedSt = { keys, t: 0, dur, follow: spec.follow || null, followOffset: spec.followOffset ? U.toV3(spec.followOffset) : null, resolve, promise, done: dur <= 0, far: +spec.far || 0 };
    stepScripted(0);
    apply(0);
    if (scriptedSt.done) { scriptedSt.resolve = null; resolve(); }
    return promise;
  }
  function stepScripted(dt) {
    const s = scriptedSt;
    s.t = Math.min(s.dur, s.t + dt);
    evalKeys(s.keys, s.t, view, view.fov, view.roll);
    if (s.follow) {
      const p = resolveP(s.follow, _a, true);
      if (p) { view.target.copy(p); if (s.followOffset) view.target.add(s.followOffset); }
    }
    if (!s.done && s.t >= s.dur) { s.done = true; if (s.resolve) { const r = s.resolve; s.resolve = null; r(); } }
  }
  function finish() { if (scriptedSt && !scriptedSt.done) { scriptedSt.t = scriptedSt.dur; stepScripted(0); } }
  function done() { return scriptedSt && !scriptedSt.done ? scriptedSt.promise : Promise.resolve(); }
  function release() {
    if (scriptedSt && scriptedSt.resolve) { const r = scriptedSt.resolve; scriptedSt.resolve = null; r(); }
    scriptedSt = null;
    const p = subject(_subj);
    const c = select(p);
    cut(c);
    if (c) liveView(c, p, 0);
    apply(0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Shake (respects META.options.shake)
  // ---------------------------------------------------------------------------------------------------------------
  function shake(amount = 0.3, dur = 0.4) {
    if (typeof META !== 'undefined' && META.options && META.options.shake === false) return;
    shakes.push({ a: Math.max(0, +amount || 0), dur: Math.max(0.01, +dur || 0.4), t: 0 });
    if (shakes.length > 8) shakes.shift();
  }
  function shakeAmp(dt) {
    let amp = 0;
    for (let i = shakes.length - 1; i >= 0; i--) {
      const s = shakes[i]; s.t += dt;
      if (s.t >= s.dur) { shakes.splice(i, 1); continue; }
      amp = Math.max(amp, s.a * (1 - s.t / s.dur) ** 1.5);
    }
    if (typeof META !== 'undefined' && META.options && META.options.shake === false) { shakes.length = 0; return 0; }
    return amp;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Apply to Render.camera
  // ---------------------------------------------------------------------------------------------------------------
  function apply(dt) {
    orient(cam, view.pos, view.target, view.roll);
    const amp = shakeAmp(dt || 0);
    if (amp > 0) {
      shakeT += dt || 0.016;
      const n = (f, o) => Math.sin(shakeT * f + o) * 0.6 + Math.sin(shakeT * f * 2.31 + o * 1.7) * 0.4;
      cam.translateX(n(37, 0.3) * amp * 0.05); cam.translateY(n(41, 1.9) * amp * 0.05);
      cam.rotateZ(n(29, 4.1) * amp * 1.4 * D2R); cam.rotateX(n(33, 2.7) * amp * 0.9 * D2R);
    }
    // far plane (CONTRACT+): a scripted move's `far`, else the current camera def's, else the room's `far`, else 200 m
    const far = (scriptedSt && scriptedSt.far) || (!scriptedSt && current && current.far) || roomFar() || 200;
    if (Math.abs(cam.fov - view.fov) > 1e-4 || cam.far !== far) { cam.fov = view.fov; cam.far = far; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
  }
  const roomFar = () => { const d = roomId && ROOMS[roomId]; return (d && +d.far) || 0; };
  function update(dt = 0) {
    if (defs.length && Math.abs(curAspect() - aspectUsed) > 0.01) refit();
    const p = subject(_subj);
    if (scriptedSt) stepScripted(dt);
    else if (defs.length) {
      const c = select(p);
      if (c !== current) cut(c);
      if (current) liveView(current, p, dt);
    } else if (roomId) autoView(p, dt);
    apply(dt);
    if (typeof Snd !== 'undefined' && Snd && Snd.setListener) {
      const b = basis();
      Snd.setListener([p.x, p.y + 1.6, p.z], [b.fx, 0, b.fz]);
    }
    if (dbgOn && dbg) tickDebug();
  }
  // safety net for a room without cameras (content in progress): a high follow camera behind Aidan
  const autoSt = { yaw: null };
  function autoView(p, dt) {
    const py = typeof Player !== 'undefined' && Player ? Player.yaw : 0;
    if (autoSt.yaw === null || snapNext || !(dt > 0)) autoSt.yaw = py; else autoSt.yaw += U.angleDiff(autoSt.yaw, py) * (1 - Math.exp(-dt * 1.5));
    snapNext = false;
    view.pos.set(p.x - Math.sin(autoSt.yaw) * 4.2, p.y + 2.7, p.z - Math.cos(autoSt.yaw) * 4.2);
    view.target.set(p.x, p.y + 1.1, p.z); view.fov = 50; view.roll = 0;
  }
  // camera forward/right on the ground plane (steep cameras use screen-up for "forward")
  function basis() {
    const e = cam.matrixWorld.elements;
    let fx = -e[8], fz = -e[10], l = Math.hypot(fx, fz);
    if (l < 0.05) { fx = e[4]; fz = e[6]; l = Math.hypot(fx, fz) || 1; }
    fx /= l; fz /= l;
    let rx = e[0], rz = e[2];
    const lr = Math.hypot(rx, rz);
    if (lr < 1e-3) { rx = -fz; rz = fx; } else { rx /= lr; rz /= lr; }
    return { fx, fz, rx, rz };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Volume check (spec §3: every walkable point covered, every camera sees its whole volume)
  // ---------------------------------------------------------------------------------------------------------------
  function roomHasOutage(rb, cams) {
    if (cams.some((c) => c.world === 'outage')) return true;
    if (!rb) return false;
    return rb.floors.some((f) => f.world === 'outage') || rb.colliders.some((c) => c.world === 'outage') || rb.tagged.some((t) => t.world === 'outage');
  }
  function walkable(rb, x, z, y, outage) {
    for (const c of rb.colliders) {
      if (c.enabled === false || !matchWorld(c.world, outage)) continue;
      if (x < c.x0 - 0.3 || x > c.x1 + 0.3 || z < c.z0 - 0.3 || z > c.z1 + 0.3) continue;
      const cy = c.y || 0;
      if (cy > y + 1.6 || cy + c.h < y + 0.25) continue;
      if (Kit.collide(c, x, z, 0.25)) return false;
    }
    return true;
  }
  // the meshes that can hide Aidan from a camera: visible, opaque, in this world (world-tagged groups of the other world
  // excluded); sprites, lines, points, transparent / alpha-tested materials and actors aren't occluders. With
  // o.veils the transparent ones (plastic sheeting, curtains, glass, cut-out foliage) come back as a second list, each
  // with its effective opacity (material opacity × the texture's average alpha / cut-out coverage); additive glows never.
  const _ray = new THREE.Raycaster();
  function occluders(rb, outage, o = {}) {
    const hidden = new Set();
    for (const t of rb.tagged || []) if (!matchWorld(t.world, outage)) hidden.add(t.obj);
    const list = [], veils = [];
    const walk = (ob) => {
      if (!ob.visible || hidden.has(ob) || ob.userData.rig || ob.userData.noOcclude) return;
      if (ob.isMesh && !ob.isInstancedMesh) {
        const ms = Array.isArray(ob.material) ? ob.material : [ob.material];
        if (ms.some((m) => m && !m.transparent && m.opacity >= 0.99 && m.visible !== false && !m.alphaTest)) list.push(ob);
        else if (o.veils) {
          let a = 0;
          for (const m of ms) if (m && m.visible !== false && m.blending !== THREE.AdditiveBlending) a = Math.max(a, matAlpha(m));
          if (a > 0.04) { ob.userData._veilA = a; veils.push(ob); }
        }
      }
      for (const c of ob.children) walk(c);
    };
    rb.group.updateMatrixWorld(true);
    walk(rb.group);
    list.root = rb.group; veils.root = rb.group;
    if (o.veils) list.veils = veils;
    return list;
  }
  // a material's effective opacity: opacity × the average alpha of its map / alphaMap (cut-outs: the covered fraction)
  function matAlpha(m) {
    let a = m.transparent || m.opacity < 0.99 ? m.opacity : 1;
    const cov = (t, lum) => {
      if (!t || !t.image) return 1;
      const ud = t.userData || (t.userData = {}), key = (lum ? '_avgL' : '_avgA') + (m.alphaTest ? '@' + m.alphaTest : '');
      if (ud[key] !== undefined) return ud[key];
      let v = 1;
      try {
        const img = t.image, W = 32, H = 32;
        if (img.width && img.height) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const x = cv.getContext('2d'); x.drawImage(img, 0, 0, W, H);
          const d = x.getImageData(0, 0, W, H).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const q = lum ? (d[i] + d[i + 1] + d[i + 2]) / 765 : d[i + 3] / 255;
            sum += m.alphaTest ? (q > m.alphaTest ? 1 : 0) : q;
          }
          v = sum / (W * H);
        }
      } catch (e) { v = 1; }
      ud[key] = v;
      return v;
    };
    if (m.map && (m.transparent || m.alphaTest)) a *= cov(m.map, false);
    if (m.alphaMap) a *= cov(m.alphaMap, true);
    return U.clamp(a);
  }
  function occludedBy(list, from, to) {
    const d = _e.copy(to).sub(from), len = d.length();
    if (len < 0.5) return null;
    _ray.set(from, d.divideScalar(len));
    _ray.near = 0.05; _ray.far = len - 0.35;
    const hits = _ray.intersectObjects(list, false);
    if (!hits.length) return null;
    return nameOf(hits[0].object, list.root);
  }
  function nameOf(o, root) {
    let name = o.name;
    while ((!name || /^(merged|mesh|part|leaf|kit:)/i.test(name)) && o.parent && o.parent !== root) { o = o.parent; name = o.name || name; }
    return name || 'mesh';
  }
  // light through transparent layers between the lens and Aidan's chest: → {t (0..1 transmittance), hit} | null
  function veiledBy(veils, from, to) {
    if (!veils || !veils.length) return null;
    const d = _e.copy(to).sub(from), len = d.length();
    if (len < 0.5) return null;
    _ray.set(from, d.divideScalar(len));
    _ray.near = 0.05; _ray.far = len - 0.35;
    const hits = _ray.intersectObjects(veils, false);
    if (!hits.length) return null;
    let t = 1, top = null, seen = new Set();
    for (const h of hits) {
      const k = h.object.uuid + ':' + Math.round(h.distance * 20);           // (a double-sided sheet counts once)
      if (seen.has(k)) continue; seen.add(k);
      const a = h.object.userData._veilA || 0;
      t *= 1 - a;
      if (!top || a > (top.userData._veilA || 0)) top = h.object;
    }
    return { t, hit: top ? nameOf(top, veils.root) : 'mesh' };
  }
  // Fog: the density the room shows in a world (mirrors World's environment: the room's fog / outageFog / env /
  // outageEnv, else Render's preset). A camera def may override it for the check with fog: density | false (a room
  // whose onUpdate thins the fog for that shot).
  function roomFog(def, outage) {
    const o = { outdoor: !!def.outdoor, fog: (outage && def.outageFog) || def.fog || null, noFog: !!def.noFog, ...(def.env || {}) };
    if (outage && def.outageEnv) Object.assign(o, def.outageEnv);
    if (o.noFog) return 0;
    if (o.fog && typeof o.fog.density === 'number') return o.fog.density;
    return outage ? (o.outdoor ? 0.06 : 0.035) : (o.outdoor ? 0.075 : 0.03);
  }
  // (x, y, z = Aidan's feet) — a room whose onUpdate moves the fog with him gives the check the same rule as
  // def.fogAt(x, y, z, outage) → density; a camera def's fog: density | false | (x, y, z, outage) => density wins
  function camFog(c, def, outage, x, y, z) {
    const f = c.src && c.src.fog;
    try {
      if (f === false) return 0;
      if (typeof f === 'number') return f;
      if (typeof f === 'function') return +f(x, y, z, outage) || 0;
      if (f && typeof f.density === 'number') return f.density;
      if (typeof def.fogAt === 'function') { const d = def.fogAt(x, y, z, outage); if (typeof d === 'number') return d; }
    } catch (e) { console.error('[Cam] fog rule', def.id, e); }
    return roomFog(def, outage);
  }
  // Beyond FOG_K / density (FogExp2 ≈ 92 % fog) Aidan is a faint ghost, and past ~1.8 / density he is gone: flagged
  // beyond 21 m in 0.075 street fog, 32 m at 0.05, 53 m in 0.03 interiors (calibrated on c1_relay:south: a clear
  // silhouette at 1.4 / density, faint at 1.6, a ghost at 1.85)
  const FOG_K = 1.6;
  // The lens inside something solid (a parked car, a cabinet): rays in 14 directions from the lens — at least 9 first
  // meet a back face within 6 m (the lens is inside a closed shell; the exit points bound it) — AND the shot shows the
  // shell's insides: of 25 rays through the frame, at least 2 first meet a surface the renderer draws (a front face, a
  // double-sided seat / window) inside the shell's bounds. A lens inside a plain single-sided box looking out through
  // its culled side sees nothing of the box and passes — the stair-core and cutaway-wall tricks — and so does a lens
  // tucked into a cupboard shooting past foreground dressing outside it. Also flagged: clutter against the glass — 65 % of
  // the frame (the 25 rays, a drawn opaque surface counting 1, foliage / sheeting their combined opacity) covered within
  // 1.2 m of the lens (a camera inside a tree canopy or a shrub, behind a curtain). → {x, y, z, hit, frame} | null
  const DIRS = (() => { const a = []; for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) a.push(V(...v)); for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) a.push(V(x, y, z).normalize()); return a; })();
  const FRAME = []; for (const nx of [-0.9, -0.45, 0, 0.45, 0.9]) for (const ny of [-0.9, -0.45, 0, 0.45, 0.9]) FRAME.push([nx, ny]);
  const _n = V(), _fd = V(), _shell = new THREE.Box3(), _sp = V(), NEAR_CLUTTER = 1.2;
  function lensInside(c, occ, aspect) {
    if (!occ || !occ.length) return null;
    // (a rail camera only ever sits where Aidan's projection onto the rail puts it: the stretch the volume covers)
    const v = c.vol, rp = (x, z) => railPos(c, x, z, V());
    const lenses = c.type === 'rail' && c.rail ? [rp(v[0], v[1]), rp(v[2], v[3]), rp(v[0], v[3]), rp(v[2], v[1]), rp((v[0] + v[2]) / 2, (v[1] + v[3]) / 2)]
      : c.type === 'scripted' && c.keys && c.keys.length ? c.keys.map((k) => k.pos) : [c.pos];
    const sides = new Map();
    for (const o of occ) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && !sides.has(m)) { sides.set(m, m.side); m.side = THREE.DoubleSide; } }
    // the first surface along the ray the renderer draws / culls from this side: [{culled, h}] in order
    const along = (p, dir, near, far) => {
      _ray.set(p, dir); _ray.near = near; _ray.far = far;
      const out = [];
      for (const h of _ray.intersectObjects(occ, false)) {
        if (!h.face) continue;
        const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex || 0] : h.object.material;
        const side = sides.get(m);
        _n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        const away = _n.dot(dir) > 0;
        out.push({ culled: side === THREE.DoubleSide ? false : side === THREE.BackSide ? !away : away, h });
      }
      return out;
    };
    const veils = occ.veils || [];
    try {
      for (let i = 0; i < lenses.length; i++) {
        const p = lenses[i];
        // (where it looks: the key's target, else the def's target — by default the volume's middle)
        const tgt = c.type === 'scripted' && c.keys && c.keys[i] ? c.keys[i].target : c.target;
        probe.fov = c.fovV; probe.aspect = aspect; orient(probe, p, tgt, c.roll); probe.updateMatrixWorld(true);
        // clutter against the glass: half the frame is hidden by something within 1.2 m of the lens (a tree canopy, a
        // curtain, a shelf the lens is buried in): per ray, 1 for a drawn opaque surface, else 1 − Π(1 − α) of the veils
        let cover = 0, nearWhat = null;
        for (const [nx, ny] of FRAME) {
          _fd.set(nx, ny, 0.5).unproject(probe).sub(p).normalize();
          const f = along(p, _fd, cam.near * 1.2, NEAR_CLUTTER).find((q) => !q.culled);
          if (f) { cover++; nearWhat = nearWhat || f.h.object; continue; }
          if (!veils.length) continue;
          _ray.set(p, _fd); _ray.near = cam.near * 1.2; _ray.far = NEAR_CLUTTER;
          let t = 1; const seen = new Set();
          for (const v of _ray.intersectObjects(veils, false)) { const k = v.object.uuid + ':' + Math.round(v.distance * 20); if (seen.has(k)) continue; seen.add(k); t *= 1 - (v.object.userData._veilA || 0); nearWhat = nearWhat || v.object; }
          cover += 1 - t;
        }
        if (cover / FRAME.length >= 0.65) return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), hit: nameOf(nearWhat, occ.root), frame: +(cover / FRAME.length).toFixed(2) };
        let back = 0;
        _shell.makeEmpty(); _shell.expandByPoint(p);
        for (const dir of DIRS) { const f = along(p, dir, 0.02, 6)[0]; if (f && f.culled) { back++; _shell.expandByPoint(f.h.point); } }
        if (back < 9) continue;
        _shell.expandByScalar(-0.03);
        let seen = 0, what = null;
        for (const [nx, ny] of FRAME) {
          _fd.set(nx, ny, 0.5).unproject(probe).sub(p).normalize();
          const f = along(p, _fd, cam.near * 1.2, 8).find((q) => !q.culled);
          if (f && _shell.containsPoint(_sp.copy(f.h.point))) { seen++; what = what || f.h.object; }
        }
        if (seen >= 2) return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), hit: nameOf(what, occ.root), frame: +(seen / FRAME.length).toFixed(2) };
      }
    } finally { for (const [m, sd] of sides) m.side = sd; }
    return null;
  }
  // Cam.check(roomId|'*', o) → problems. o: aspect (16/9), step (0.5; 1 with occlusion), worlds, occlusion
  // (true: every occluded / veiled sample; 'summary': one problem per camera whose occluded + veiled share of its
  // samples passes o.occlusionMax, default 0.05), fog:false, lens:false, ladders:false, force (cutsceneOnly rooms).
  function check(id = roomId, o = {}) {
    if (id === '*' || id === 'all') {
      const all = [];
      for (const rid of Object.keys(ROOMS)) for (const p of check(rid, o)) all.push({ room: rid, ...p });
      return all;
    }
    const def = ROOMS[id];
    if (!def) return [{ cam: null, x: 0, z: 0, why: 'noroom', room: id }];
    if (def.cutsceneOnly && !o.force) return [];                     // the player never walks it: no coverage needed
    const summary = o.occlusion === 'summary', occMax = o.occlusionMax ?? 0.05;
    const aspect = o.aspect ?? 16 / 9, step = o.step ?? (o.occlusion ? 1 : 0.5);
    let rb = null, temp = false;
    if (typeof World !== 'undefined' && World && World.room === id && World.build) rb = World.build;
    else { rb = Kit.build(def); temp = true; }
    const problems = [];
    const r2 = (v) => Math.round(v * 100) / 100;
    try {
      const cams = (CAMERAS[id] || []).map((d, i) => norm(d, i, rb, id, aspect));
      const worlds = o.worlds || (roomHasOutage(rb, cams) ? ['fog', 'outage'] : ['fog']);
      let b = def.bounds ? normBox(def.bounds) : null;
      if (!b) {
        b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const f of rb.floors) { b[0] = Math.min(b[0], f.x0); b[1] = Math.min(b[1], f.z0); b[2] = Math.max(b[2], f.x1); b[3] = Math.max(b[3], f.z1); }
        if (!isFinite(b[0])) b = [0, 0, 0, 0];
      }
      const tmp = { pos: V(), target: V(), fov: 50, roll: 0 };
      const x0 = Math.ceil(b[0] / step - 1e-6) * step, z0 = Math.ceil(b[1] / step - 1e-6) * step;
      for (const w of worlds) {
        const outage = w === 'outage';
        const needMeshes = o.occlusion || o.lens !== false;
        const all = needMeshes ? occluders(rb, outage, { veils: true }) : null;
        const occ = o.occlusion ? all : null, veils = occ ? occ.veils : null;
        const stats = new Map();
        const stat = (c) => { let s0 = stats.get(c); if (!s0) { s0 = { n: 0, bad: 0, hits: new Map(), at: null }; stats.set(c, s0); } return s0; };
        // the lens: once per camera per world
        if (o.lens !== false) for (const c of cams) {
          if (!matchWorld(c.world, outage)) continue;
          const r = lensInside(c, all, aspect);
          if (r) problems.push({ cam: c.id, x: r.x, z: r.z, y: r.y, why: 'lens-inside', hit: r.hit, frame: r.frame, world: w });
        }
        // one sample (feet at y) against the camera that shows it
        const sample = (c, xx, y, zz, extra) => {
          steadyView(c, xx, y, zz, tmp);
          for (const h of [0.1, 1.8]) {
            const why = visibility(tmp, _b.set(xx, y + h, zz), aspect);
            if (why) { problems.push({ cam: c.id, x: xx, z: zz, y, h, why, world: w, ...extra }); return; }
          }
          if (o.fog !== false) {
            const dens = camFog(c, def, outage, xx, y, zz);
            if (dens > 0) {
              const dist = tmp.pos.distanceTo(_b.set(xx, y + CHEST, zz));
              if (dist > FOG_K / dens) { problems.push({ cam: c.id, x: xx, z: zz, y, h: CHEST, why: 'fogged', dist: r2(dist), max: r2(FOG_K / dens), world: w, ...extra }); return; }
            }
          }
          if (occ) {
            const st = summary ? stat(c) : null;
            if (st) st.n++;
            // hips, chest and head: hidden when at least two of the three are behind something (a rail across his chest
            // alone doesn't hide him)
            let hit = null, why = 'occluded', tv = null, nb = 0, nv = 0, vt = 1, vh = null;
            for (const hh of [0.55, CHEST, 1.6]) {
              const q = occludedBy(occ, tmp.pos, _b.set(xx, y + hh, zz));
              if (q) { nb++; hit = hit || q; continue; }
              const v = veiledBy(veils, tmp.pos, _b.set(xx, y + hh, zz));
              if (v && v.t < 0.45) { nv++; vt = Math.min(vt, v.t); vh = vh || v.hit; }
            }
            if (nb >= 2) why = 'occluded';
            else if (nb + nv >= 2) { why = 'veiled'; hit = vh || hit; tv = r2(vt); }
            else hit = null;
            if (hit) {
              if (st) { st.bad++; st.hits.set(hit, (st.hits.get(hit) || 0) + 1); if (!st.at) st.at = [xx, zz, y]; }
              else problems.push({ cam: c.id, x: xx, z: zz, y, h: CHEST, why, hit, ...(tv !== null ? { t: tv } : {}), world: w, ...extra });
            }
          }
        };
        for (let x = x0; x <= b[2] + 1e-6; x += step) for (let z = z0; z <= b[3] + 1e-6; z += step) {
          const xx = Math.round(x * 1000) / 1000, zz = Math.round(z * 1000) / 1000;
          const layers = def.stackedFloors ? Kit.floorLayers(rb.floors, xx, zz, outage) : [Kit.floorAt(rb.floors, xx, zz, outage)];
          for (const y of layers) {
            if (y === null || !walkable(rb, xx, zz, y, outage)) continue;
            const containing = cams.filter((c) => matchWorld(c.world, outage) && inVol(c, xx, zz, y));
            if (!containing.length) { problems.push({ cam: null, x: xx, z: zz, y, why: 'uncovered', world: w }); continue; }
            const top = Math.max(...containing.filter((c) => !c.when).map((c) => c.pri), -Infinity);
            for (const c of containing) { if (!c.when && c.pri < top) continue; sample(c, xx, y, zz); }
          }
        }
        // ladders: Aidan on the rungs (where Player.climb holds him), every 0.5 m from the bottom to the top, against the
        // camera whose volume (and height band) holds his feet there; a height no camera contains keeps the camera he
        // climbed in with, so only covered heights are checked
        if (o.ladders !== false) for (const L of rb.ladders || []) {
          if (!matchWorld(L.world, outage)) continue;
          const r = (L.rot || 0) * Math.PI / 180, lx = r2(L.x + Math.sin(r) * 0.34), lz = r2(L.z + Math.cos(r) * 0.34);
          const yTop = Math.max(L.y0 + 0.1, L.y1 - 0.95);
          for (let y = L.y0 + 0.25; y <= yTop + 1e-6; y += 0.5) {
            const yy = r2(y);
            const containing = cams.filter((c) => matchWorld(c.world, outage) && inVol(c, lx, lz, yy));
            if (!containing.length) continue;
            const top = Math.max(...containing.filter((c) => !c.when).map((c) => c.pri), -Infinity);
            for (const c of containing) { if (!c.when && c.pri < top) continue; sample(c, lx, yy, lz, { ladder: L.id }); }
          }
        }
        if (summary) for (const [c, st] of stats) {
          if (!st.n || st.bad / st.n <= occMax) continue;
          const hit = [...st.hits.entries()].sort((a, bb) => bb[1] - a[1])[0][0];
          problems.push({ cam: c.id, x: st.at[0], z: st.at[1], y: st.at[2], why: 'occluded', frac: r2(st.bad / st.n), n: st.bad, of: st.n, hit, world: w });
        }
      }
    } finally { if (temp && rb && rb.dispose) rb.dispose(); }
    if (roomId === id) dbgProblems = problems;
    if (dbgOn && roomId === id) buildDebug();
    return problems;
  }
  function visibleFrom(c, x, y, z, aspect = curAspect()) {
    const n = c.rt ? c : norm(c, 0, build, roomId || 'x', aspect);
    const tmp = { pos: V(), target: V(), fov: 50, roll: 0 };
    steadyView(n, x, y, z, tmp);
    return visibility(tmp, V(x, y + 1.0, z), aspect);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Debug drawing: wireframe volume boxes (current = warning yellow), camera markers, check problems (red)
  // ---------------------------------------------------------------------------------------------------------------
  function disposeDebug() {
    if (!dbg) return;
    dbg.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    dbg = null;
  }
  function buildDebug() {
    if (dbg) { dbg.removeFromParent(); disposeDebug(); }
    dbg = new THREE.Group(); dbg.name = 'cam:debug'; dbg.renderOrder = 999;
    for (const c of defs) {
      const v = c.vol;
      let y0 = c.y ? c.y[0] : Infinity;
      if (!c.y) for (const [, yy] of volSamples(c, build, 1, c.world === 'outage')) y0 = Math.min(y0, yy);
      if (!isFinite(y0)) y0 = 0;
      const y1 = c.y ? c.y[1] + 2 : y0 + 2.2;
      const g = new THREE.BoxGeometry(v[2] - v[0], y1 - y0, v[3] - v[1]);
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#1f9d94', transparent: true, opacity: 0.8, depthTest: false, fog: false }));
      g.dispose();
      box.position.set((v[0] + v[2]) / 2, (y0 + y1) / 2, (v[1] + v[3]) / 2);
      box.userData.cam = c; box.renderOrder = 999;
      dbg.add(box);
      const pts = [c.type === 'rail' ? c.rail.a : c.pos, c.type === 'rail' ? c.rail.b : c.target];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#e8c21a', transparent: true, opacity: 0.6, depthTest: false, fog: false }));
      line.userData.cam = c; line.renderOrder = 999;
      dbg.add(line);
    }
    if (dbgProblems && dbgProblems.length) {
      const arr = [];
      for (const p of dbgProblems) arr.push(p.x, (p.y || 0) + 0.05, p.z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#d0231c', size: 6, sizeAttenuation: false, depthTest: false, fog: false }));
      pts.renderOrder = 1000;
      dbg.add(pts);
    }
    Render.scene.add(dbg);
    colorDebug();
  }
  function colorDebug() {
    if (!dbg) return;
    for (const o of dbg.children) if (o.isLineSegments && o.userData.cam) {
      const cur = o.userData.cam === current, ok = allowed(o.userData.cam);
      o.material.color.set(cur ? '#e8c21a' : ok ? '#1f9d94' : '#4a4f4e');
      o.material.opacity = cur ? 1 : ok ? 0.7 : 0.35;
    }
  }
  function tickDebug() { if (!dbg.parent) Render.scene.add(dbg); }
  function debugDraw(on = true, problems) {
    dbgOn = !!on;
    if (problems !== undefined) dbgProblems = problems;
    if (dbgOn) buildDebug();
    else if (dbg) { dbg.removeFromParent(); disposeDebug(); }
    return dbgOn;
  }

  return {
    load, unload, update, basis, scripted, release, shake, onCut, check, snap, lock, use: lock, finish, done, debugDraw,
    visibleFrom, fit: (d, rb) => fitFov(norm(d, 0, rb || build, roomId || 'x', curAspect()), rb || build, curAspect()),
    get current() { return current; },
    get defs() { return defs; },
    get cutCount() { return cutCount; },
    get busy() { return !!(scriptedSt && !scriptedSt.done); },
    get isScripted() { return !!scriptedSt; },
    get room() { return roomId; },
    get view() { return { pos: view.pos.clone(), target: view.target.clone(), fov: view.fov, roll: view.roll }; },
    get locked() { return forced; },
  };
})();
