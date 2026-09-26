// ==== engine/08_player.js — Player: Aidan — movement, stamina, health, torch, interaction look, combat, ladders ====
// ARCHITECTURE §2/§6/§9 · spec §2 (torch), §2A (messages, head-turn hint, death), §3 (controls), §4 (health, combat).
//
// Aidan is Rig.create('aidan') (phone in the right hand; weapons go in the LEFT hand). Player.pos IS actor.root.position
// and the facing is actor.root.rotation.y (yaw, radians, 0 = +Z, π/2 = +X), so scripts that move G.aidan move the
// player. While control is off (cutscenes, blocking scripts, transitions) Player never writes the transform or the
// animation — the script owns the body — and only keeps the torch on the phone.
//
// Controls (Input actions): move (camera-relative with direction hold, or tank when META.options.control === 'tank'),
//   run (Shift/RT: 3.5 m/s for 6 s of stamina, refills in 4 s; walk 1.6 m/s), torch (F), interact (E), ready (RMB/
//   Space/LT), attack (LMB/X), turn (Q/B: quick 180°).
// Direction hold (spec §3): when the camera cuts while a direction is held, movement keeps the previous camera's axes
//   until the input is released or changes (keyboard: any change; stick: > 25°). Across a room change (or teleport)
//   the old axes mean nothing, so a direction held through the transition keeps Aidan walking along his entry facing
//   (same release / change rule). Input is tracked while control is off, so releasing during a cutscene ends a hold.
// The phone in his right hand lights his face (spec §5): Actor.setPhoneLight(0.28) while he holds it, off when dead.
// Interaction: the nearest active interactable within 3 m roughly in front turns Aidan's head (the only hint — no
//   prompts); E uses the best one within its own radius. hold>0 interactables fill UI.holdPrompt while E is held.
// Combat (spec §4 table): ready soft-locks Enemies.lockTarget(pos, yaw) and turns to it. Attack while ready, or a
//   quick attack from standing (auto-lock). Weapon stats: ITEMS[S.equipped].weapon {dmg, speed:'fast'|'slow', range,
//   arc, knock} with built-in defaults for box_cutter (8 fast), steel_bar (20 slow, 30% knockdown), extinguisher
//   (12 slow bash). Unarmed = a shove (2 dmg, 0.8 s stun).
//   EXTINGUISHER INPUT: ready + attack = SPRAY while S.ammo.extinguisher > 0 (3 s stun in a 4 m / 55° cone, scatters
//   the Unread, one of 6 sprays); attack WITHOUT ready (or with no sprays left) = BASH.
//   E on a downed enemy = stomp. With the box cutter equipped, HOLD E 2 s on a downed or unaware Tethered = cut free
//   (a tap still stomps a downed one). Eligibility is the enemy's: e.canCutFree / e.canStomp (bool or fn(Player));
//   defaults: stomp = downed, cut = type 'tethered' and (downed or state 'idle'/'unaware'). The act itself is
//   e.stomp() / e.cutFree() when present (Enemies own resolution, tracking and stats), else e.damage(9999,'stomp') /
//   Enemies.cutFree(e). Hits use Enemies.hitTest(origin, yawRadians, range, arcDeg) and hit the nearest target.
//   A disguised Borrowed (e.disguised / e.noRaise) refuses the ready stance: "He can't bring himself to."
// Damage: Player.damage(n, source, {minHealth, knock, push, from, force, dot}) — DIFF.dmg is applied only when `source` is
//   an enemy: an object (the enemy e, or anything with .type / .isEnemy), or a string starting with 'enemy' or 'boss',
//   or a known enemy type name. Everything else ('fall', 'script', 'story' …) is taken as given. Discrete hits have a
//   0.3 s cooldown (opts.force skips it) and a reaction (hurt sound, flinch, shake; ≥ 20 staggers; knock:true knocks
//   Aidan down; push:m / from:pos shove him back). {dot:true} is for continuous damage called every frame with n·dt
//   (spotlight beams): no cooldown, no rounding, no flinch, a throttled hurt sound.
//   Status (§2A): FINE 100–70, CAUTION 69–35, DANGER 34–1. Health 0 → collapse → Bus 'death' → Game.death().
//
// CONTRACT+ (beyond ARCHITECTURE): Player.init(), reset(), place(x,z,yawDeg,{y}), teleport(x,z,yawDeg), face(yawDeg),
//   setControl(on), lock(reason,on), locked, mode, setMode(name), crawl(on,{anim}), pin(on,{anim}), climb(ladderRec,
//   'bottom'|'top') → Promise, grab({mash,damage,onFail,onEscape,source,window}) → Promise<'escaped'|'failed'>,
//   release(), setGaze(level 0..1), gaze, heal(n), kill(), status(), stamina (0..1), exhausted, torchOn, setTorch(on),
//   toggleTorch(), stillTime (s since he last moved/turned), speed (m/s), running, ready, lockTarget, interactTarget,
//   lookTarget, turnAround(), impulse(dx,dz,dur), knockback(fromPos,dist), noclip, saveState(), actor, yawDeg,
//   weapon() → current weapon stats, attackState.
// CONTRACT+ (maintenance): Player.restoreBody() (the actor back to a new game's defaults; reset() calls it),
//   Player.holdOverride(on) (a scripted left-hand prop wins over the equipped weapon), the weapon put away while a
//   letterboxed scene owns Aidan, poseSnapshot() / poseRestore(snap) (Script restores his arm poses after each
//   letterboxed scene), the torch bounce (a fill light that keeps Aidan readable in the dark), crawl-mode interactables
//   ({crawl:true}), E with a message up goes to the faced target unless it is the thing just used.
const Player = (() => {
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const WALK = 1.6, RUN = 3.5, BACK = 0.9, CRAWL = 0.8, READY_STEP = 0.75, CLIMB_UP = 0.8, CLIMB_DOWN = 1.0;
  const RUN_SEC = 6, REFILL_SEC = 4, RADIUS = 0.3;
  const WEAPONS = {                                  // defaults when ITEMS[id].weapon is missing (spec §4 table)
    box_cutter: { dmg: 8, speed: 'fast', range: 1.1, arc: 70, knock: 0, rig: 'box_cutter' },
    steel_bar: { dmg: 20, speed: 'slow', range: 1.5, arc: 90, knock: 0.3, rig: 'bar' },
    extinguisher: { dmg: 12, speed: 'slow', range: 1.3, arc: 80, knock: 0, rig: 'extinguisher', spray: true },
  };
  const UNARMED = { dmg: 2, speed: 'fast', range: 1.0, arc: 70, knock: 0, shove: true, stun: 0.8 };
  const ENEMY_TYPES = ['tethered', 'reach', 'borrowed', 'unread', 'standard', 'smile', 'closer', 'rep', 'escalation', 'pedestal', 'middle', 'returns_cage', 'restructure'];
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const _a = V(), _b = V(), _c = V();
  const hasEnemies = () => typeof Enemies !== 'undefined' && !!Enemies;
  const hasUI = () => typeof UI !== 'undefined' && !!UI;
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio not ready */ } return null; };
  const ui = (fn, ...a) => { try { if (hasUI() && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[Player] UI.' + fn, e); } return undefined; };

  let actor = null;
  const fallbackPos = V();
  let yaw = 0, speed = 0;
  let control = true;
  const locks = new Set();
  let mode = 'normal', modeOpts = {};
  let stamina = 1, exhausted = false, runningNow = false;
  let torchOn = false, flickerLv = 0;
  let gaze = 0, gazeTarget = 0, gazeSetAt = -1, tremorOn = false;
  let clock = 0, stillTime = 0;
  let noclip = false;
  // direction hold
  let cutFlag = false, hold = null, lastLiveBasis = null, prevInput = { x: 0, y: 0 }, entryHold = null, basisRead = false;
  const PHONE_GLOW = 0.28;                                  // the phone screen's light on Aidan's face (spec §5)
  // actions
  let turnSt = null, attack = null, readyOn = false, readyTarget = null, readyRelockT = 0, refuseT = 0;
  let holdAct = null, grabSt = null, ladderSt = null, downSt = null, staggerT = 0, hurtCool = 0, impulseSt = null;
  let lookT = 0, lookIt = null, useIt = null, lookVec = V(), enemyLook = V();
  let heldKind = null, heldFor = null, weaponPose = null;
  let lastPhase = 0;
  let animLock = 0, lastAnim = null, hadControl = true;
  let deadSt = false;
  let eBuf = 0;            // (integration) an E pressed in the last 0.5 s of a swing is kept for when it ends
  let fx = null; // spray particles
  let footSurfaceOverride = null;
  let phoneGlow = -1;

  // ---------------------------------------------------------------------------------------------------------------
  // Actor
  // ---------------------------------------------------------------------------------------------------------------
  function init() {
    if (actor) return actor;
    actor = Rig.create('aidan');
    actor.root.name = 'player:aidan';
    actor.root.position.copy(fallbackPos);
    actor.root.rotation.y = yaw;
    actor.setAnim('idle', { blend: 0 });
    return actor;
  }
  const pos = () => (actor ? actor.root.position : fallbackPos);
  function ensureInScene() { init(); if (actor.root.parent !== Render.scene) Render.scene.add(actor.root); }
  const setYaw = (y) => { yaw = U.wrapAngle(y); if (actor) actor.root.rotation.y = yaw; };
  const canCtl = () => control && locks.size === 0 && !deadSt && !(hasUI() && UI.capturing && UI.capturing()) && !(typeof Menus !== 'undefined' && Menus && Menus.isOpen && Menus.isOpen());
  function setAnim(name, blend = 0.2, o = {}) {
    if (!actor) return;
    if (lastAnim === name && !o.force) return;
    lastAnim = name;
    actor.setAnim(name, { blend, ...o });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------------------------------------------
  function floorAt(x, z, refY = pos().y) { return typeof World !== 'undefined' && World && World.heightAt ? World.heightAt(x, z, refY) : null; }
  function place(x, z, yawDeg = 0, o = {}) {
    ensureInScene();
    const y = o.y ?? floorAt(x, z) ?? 0;
    pos().set(x, y, z);
    setYaw((yawDeg || 0) * D2R);
    speed = 0; turnSt = null; attack = null; holdAct = null; impulseSt = null; staggerT = 0;
    // direction hold across a placement (room entry, teleport): the old camera's axes mean nothing here (each room has
    // its own coordinates), so a direction still held from before carries on along Aidan's new facing instead
    hold = null; cutFlag = false; lastLiveBasis = null;
    entryHold = Math.hypot(prevInput.x, prevInput.y) > 0.15 ? { dir: { ...prevInput } } : null;
    abortLadder();
    if (grabSt) grabEnd(null);
    if (mode === 'ladder' || mode === 'grabbed' || mode === 'down') setMode('normal');
    if (actor.state) actor.state.hasPrev = false;
    if (!deadSt && (mode === 'normal')) setAnim('idle', 0, { force: true });
    ui('holdPrompt', null);
    actor.update(0);
    updateTorch(0);
    return pos();
  }
  function teleport(x, z, yawDeg) {
    place(x, z, yawDeg ?? yaw / D2R);
    if (typeof Cam !== 'undefined' && Cam && Cam.snap) Cam.snap();
  }
  function face(yawDeg) { setYaw(yawDeg * D2R); }

  // ---------------------------------------------------------------------------------------------------------------
  // Control, modes
  // ---------------------------------------------------------------------------------------------------------------
  function setControl(on) { control = !!on; if (!control) { speed = 0; cancelActions(); } }
  function lock(reason, on = true) { if (on) { locks.add(reason); speed = 0; cancelActions(); } else locks.delete(reason); }
  function cancelActions() {
    if (holdAct) { ui('holdPrompt', null); if (holdAct.kind === 'cut' && actor) actor.finishGestures(); holdAct = null; }
    if (readyOn) endReady();
    turnSt = null;
  }
  function setMode(name, o = {}) {
    const prev = mode;
    mode = name; modeOpts = o;
    if (name !== 'ladder') ladderSt = null;
    if (prev === 'grabbed' && name !== 'grabbed') ui('mash', null);
    if (name === 'normal' && actor) { lastAnim = null; setAnim('idle', 0.3); }
    return mode;
  }
  function crawl(on = true, o = {}) { if (deadSt) return; setMode(on ? 'crawl' : 'normal', o); if (on) { endReady(); setAnim(o.anim || 'crawl', 0.35, { force: true }); } }
  function pin(on = true, o = {}) { if (deadSt) return; setMode(on ? 'pinned' : 'normal', o); if (on) { speed = 0; endReady(); setAnim(o.anim || 'struggle', 0.15, { force: true }); } }

  // ---------------------------------------------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------------------------------------------
  function isEnemySource(src) {
    if (!src) return false;
    if (typeof src === 'object') return !!(src.isEnemy || src.type || src.hp !== undefined || src.enemy);
    if (typeof src !== 'string') return false;
    const s = src.toLowerCase();
    if (s.startsWith('enemy') || s.startsWith('boss')) return true;
    const t = s.split(':')[0];
    if (ENEMY_TYPES.includes(t)) return true;
    try { if (hasEnemies() && Enemies.types && Enemies.types[t]) return true; } catch (e) { /* no registry */ }
    return false;
  }
  function status(h = S.health) { return h >= 70 ? 'FINE' : h >= 35 ? 'CAUTION' : 'DANGER'; }
  let dotSnd = 0;
  function damage(n, source = null, o = {}) {
    if (deadSt || !(n > 0)) return 0;
    const enemy = isEnemySource(source) && typeof DIFF !== 'undefined';
    const floor = Math.max(0, o.minHealth ?? 0);
    if (o.dot) {                                               // continuous damage (per frame): no cooldown, no flinch
      const amt = n * (enemy ? DIFF.dmg(100) / 100 : 1), before = S.health;
      S.health = Math.max(floor, Math.min(100, S.health - amt));
      S.stats.damage = (S.stats.damage || 0) + (before - S.health);
      if (clock - dotSnd > 0.7) { dotSnd = clock; sfx('hurt', { pos: [pos().x, pos().y + 1.4, pos().z], vol: 0.6 }); if (typeof Cam !== 'undefined' && Cam.shake) Cam.shake(0.12, 0.25); }
      Bus.emit('damage', before - S.health, source);
      if (S.health <= 0) die(source);
      return before - S.health;
    }
    if (hurtCool > 0 && !o.force) return 0;
    let amt = enemy ? DIFF.dmg(n) : Math.round(n);
    const before = S.health;
    S.health = Math.max(floor, Math.min(100, S.health - amt));
    amt = before - S.health;
    S.stats.damage = (S.stats.damage || 0) + amt;
    hurtCool = o.cooldown ?? 0.3;
    Bus.emit('damage', amt, source);
    // reaction
    const heavy = n >= 20;
    sfx('hurt', { pos: [pos().x, pos().y + 1.4, pos().z], heavy });
    if (typeof Cam !== 'undefined' && Cam && Cam.shake) Cam.shake(0.25 + Math.min(0.6, n / 50), heavy ? 0.45 : 0.3);
    try { if (typeof Input !== 'undefined' && Input.rumble) Input.rumble(heavy ? 0.9 : 0.6, 0.5, heavy ? 320 : 180); } catch (e) { /* no pad */ }
    if (actor && mode !== 'ladder') actor.gesture('flinch');
    if (o.push || o.from) {
      const from = o.from ? U.toV3(o.from) : sourcePos(source);
      if (from) knockback(from, o.push ?? 0.6);
    }
    if (S.health <= 0) { die(source); return amt; }
    if (o.knock && mode === 'normal') knockDown(o.knockTime ?? 1.1);
    else if (heavy && mode === 'normal') staggerT = 0.5;
    return amt;
  }
  function sourcePos(src) {
    if (!src || typeof src !== 'object') return null;
    if (src.pos && src.pos.isVector3) return src.pos;
    if (src.root && src.root.isObject3D) return src.root.position;
    return null;
  }
  function heal(n) { if (deadSt) return 0; const b = S.health; S.health = Math.min(100, S.health + Math.max(0, +n || 0)); return S.health - b; }
  function knockDown(t = 1.1) {
    endReady(); attack = null; holdAct = null; ui('holdPrompt', null);
    setMode('down');
    downSt = { t: 0, lie: t, up: false };
    setAnim('collapse', 0.12, { force: true });
  }
  function die(source) {
    if (deadSt) return;
    deadSt = true; S.health = 0;
    endReady(); attack = null; holdAct = null; grabEnd(null);
    ui('holdPrompt', null); ui('mash', null);
    mode = 'dead'; speed = 0;
    if (actor) { actor.finishGestures(); actor.lookAt(null); setAnim('collapse', 0.15, { force: true }); }
    try { if (typeof Input !== 'undefined' && Input.heartbeat) Input.heartbeat(false); } catch (e) { /* ignore */ }
    Bus.emit('death', source);
    if (typeof Game !== 'undefined' && Game && typeof Game.death === 'function') { try { Game.death(); } catch (e) { console.error('[Player] Game.death', e); } }
  }
  function kill() { damage(S.health + 999, 'script', { force: true }); }

  // ---------------------------------------------------------------------------------------------------------------
  // Torch (the phone's back light; flickers with a monster within 6 m)
  // ---------------------------------------------------------------------------------------------------------------
  function setTorch(on) { torchOn = !!on; Render.torch.on(torchOn); return torchOn; }
  function toggleTorch() { setTorch(!torchOn); sfx('torch', { pos: [pos().x, pos().y + 1.2, pos().z] }); return torchOn; }
  function updateTorch(dt) {
    const p = pos();
    let tx = p.x, ty = p.y + 1.3, tz = p.z;
    const tor = actor && actor.held && actor.held.R && actor.held.R.userData.torch;
    if (tor) { tor.getWorldPosition(_a); tx = _a.x; tz = _a.z; ty = _a.y; }
    const lo = mode === 'crawl' ? 0.25 : mode === 'dead' || mode === 'down' ? 0.1 : 1.1, hi = mode === 'crawl' ? 0.8 : 1.45;
    ty = U.clamp(ty, p.y + lo, p.y + hi);
    let ay = yaw, pitch = -6 * D2R;
    if (mode === 'ladder') pitch = 18 * D2R;
    else if (readyOn && readyTarget && readyTarget.pos) {
      const dx = readyTarget.pos.x - p.x, dz = readyTarget.pos.z - p.z;
      ay = Math.atan2(dx, dz);
      pitch = Math.atan2(readyTarget.pos.y + 1.0 - ty, Math.hypot(dx, dz) || 1);
    }
    if (gaze > 0.01) { ay += swayYaw() * 1.3; pitch += Math.sin(clock * 2.3 + 1) * gaze * 5 * D2R; }
    Render.torch.setTransform([tx, ty, tz], [Math.sin(ay) * Math.cos(pitch), Math.sin(pitch), Math.cos(ay) * Math.cos(pitch)]);
    // flicker from the nearest threat
    let lv = 0;
    if (hasEnemies() && typeof Enemies.nearestThreat === 'function') {
      try { const t = Enemies.nearestThreat(p); if (t && t.dist < 6) lv = U.clamp((6 - t.dist) / 6 * 1.25 + 0.15); } catch (e) { /* enemies not ready */ }
    }
    flickerLv = dt > 0 ? U.damp(flickerLv, lv, 6, dt) : lv;
    Render.torch.flicker(flickerLv < 0.02 ? 0 : flickerLv);
    updateBounce(dt);
  }
  // Torch bounce: the torch lights what is in front of Aidan, never Aidan himself, and in a dark interior (the Outage)
  // a fixed camera 6–15 m away lost him even with the torch on. While the torch is on, one pool light (prio 20) hangs
  // ~0.55 m ahead of him along his facing and ~0.6 m toward the lens, 1.3 m up (the spill that would bounce back onto
  // him from the side the shot sees): range 3.4 m, 0.8 cd in the Fog world / 2.3 in the Outage, scaled down where the
  // room's own lights already reach him (Render.lightAt without it), off with the torch, in death and when he is hidden.
  const BOUNCE = { fog: 0.8, outage: 2.3, range: 3.4, color: '#cfe2dc', colorOut: '#8fd8cc' };
  let bounce = null, bounceLv = 0;
  const _bp = V();
  function updateBounce(dt) {
    if (bounce && bounce.freed) bounce = null;
    const want = torchOn && !deadSt && actor && actor.root.visible && !!actor.root.parent && typeof World !== 'undefined' && !!World.room;
    let I = 0;
    if (want) {
      const p = pos(), out = !!S.outage;
      let cx = 0, cz = 0;
      try { const c = Render.camera.position, dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1; cx = dx / d; cz = dz / d; } catch (e) { /* no camera */ }
      _bp.set(p.x + Math.sin(yaw) * 0.55 + cx * 0.6, (p.y || 0) + 1.3, p.z + Math.cos(yaw) * 0.55 + cz * 0.6);
      // how lit he already is by the room (pool lights near him + the sky light), without the torch and this light
      let lit = 0;
      try { lit = Render.lightAt(_a.set(p.x, (p.y || 0) + 1.2, p.z), { torch: false, ambient: true, exclude: bounce }); } catch (e) { lit = 0; }
      const dark = U.clamp(1 - (lit - 0.05) / 0.45);
      I = (out ? BOUNCE.outage : BOUNCE.fog) * dark;
      if (!bounce && I > 0.02 && typeof Render !== 'undefined' && Render.allocLight) bounce = Render.allocLight('point', { color: BOUNCE.color, intensity: 0, distance: BOUNCE.range, decay: 1.5, prio: 20 });
      bounceLv = dt > 0 ? U.damp(bounceLv, I, 4, dt) : I;
      if (bounce) bounce.set({ pos: _bp, intensity: bounceLv < 0.02 ? 0 : bounceLv, color: out ? BOUNCE.colorOut : BOUNCE.color });
    } else {
      bounceLv = 0;
      if (bounce) bounce.set({ intensity: 0 });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Gaze (the Standard): aim sway, hand tremor, stamina drains 3×
  // ---------------------------------------------------------------------------------------------------------------
  function setGaze(level) { gazeTarget = U.clamp(+level || 0); gazeSetAt = clock; }
  const swayYaw = () => gaze * (Math.sin(clock * 1.7) * 0.6 + Math.sin(clock * 3.1 + 2) * 0.4) * 12 * D2R;
  function updateGaze(dt) {
    if (clock - gazeSetAt > 0.3) gazeTarget = 0;
    gaze = U.damp(gaze, gazeTarget, gazeTarget > gaze ? 5 : 2, dt);
    if (!actor) return;
    if (gaze > 0.2 && !tremorOn && mode !== 'dead') { tremorOn = true; actor.gesture('tremor', { hold: true, amount: 0.6 + gaze * 0.8 }); }
    else if (gaze < 0.1 && tremorOn) { tremorOn = false; actor.gesture('tremor', { dur: 0.3, amount: 0.05 }); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Weapons
  // ---------------------------------------------------------------------------------------------------------------
  function weapon(id = S.equipped) {
    if (!id) return UNARMED;
    const it = typeof ITEMS !== 'undefined' ? ITEMS[id] : null;
    const base = WEAPONS[id] || {};
    const w = it && it.weapon ? { ...base, ...it.weapon } : base.dmg ? { ...base } : null;
    if (!w) return UNARMED;
    return { id, dmg: 8, speed: 'fast', range: 1.2, arc: 70, knock: 0, ...w, rig: w.rig || base.rig || (it && it.rig) || null };
  }
  // CONTRACT+: Player.holdOverride(on) — while on (counted), the equipped weapon doesn't claim the left hand: a script
  // holding a prop there (A.hold('L', 'pen') on Aidan does it by itself) keeps it; off → the weapon comes back
  let weaponOverride = 0;
  function holdOverride(on) {
    weaponOverride = Math.max(0, weaponOverride + (on ? 1 : -1));
    if (!weaponOverride) {
      // the scripted prop leaves his hand with the override (even with nothing equipped); the weapon is re-held next frame
      if (actor && actor.held && actor.held.L) { try { actor.hold('L', null); } catch (e) { /* rig */ } }
      heldFor = undefined; heldKind = null;
    }
    return weaponOverride > 0;
  }
  // The equipped weapon is put away while a letterboxed scene owns Aidan (Script.cutscene and no player control): he
  // doesn't sit at a switchboard or talk to Wai with the steel bar in his hand. It comes back the frame the scene ends,
  // is suspended by a G.boss, or hands control back (G.control(true)). A scene can still show it: A.hold('L', 'bar').
  const cutsceneStow = (ctl) => { try { return !ctl && typeof Script !== 'undefined' && !!Script.cutscene; } catch (e) { return false; } };
  function syncWeapon(stow = false) {
    if (!actor || weaponOverride > 0) return;
    if (stow) {
      if (heldKind) {
        if (readyOn) endReady();
        try { actor.hold('L', null); } catch (e) { console.error('[Player] stow weapon', e); }
        heldKind = null;
      }
      heldFor = undefined;                                          // re-synced when the scene lets go
      return;
    }
    const id = S.equipped || null;
    if (id === heldFor) return;
    heldFor = id;
    const w = id ? weapon(id) : null;
    const kind = w && !w.shove ? w.rig : null;
    if (kind === heldKind) return;
    const wasReady = readyOn;
    if (wasReady) endReady();
    heldKind = kind;
    try { actor.hold('L', kind || null); } catch (e) { console.error('[Player] hold weapon', e); }
    weaponPose = actor.state && actor.state.carry ? actor.state.carry.L : null;
  }
  function startReady() {
    if (readyOn || !actor) return;
    const p = pos();
    let t = null;
    if (hasEnemies() && typeof Enemies.lockTarget === 'function') { try { t = Enemies.lockTarget(p, yaw) || null; } catch (e) { t = null; } }
    if (t && (t.disguised || t.noRaise)) {
      if (refuseT <= 0) { ui('message', "He can't bring himself to."); refuseT = 2.2; }
      return;
    }
    readyOn = true; readyTarget = t; readyRelockT = 0;
    actor.armPose('L', 'bar_ready');
  }
  function endReady() {
    if (!readyOn) return;
    readyOn = false; readyTarget = null;
    if (actor) actor.armPose('L', heldKind ? weaponPose : null);
  }
  const alive = (e) => !!e && !e.resolved && e.state !== 'dead' && e.hp !== 0 && !e.removed;
  function relock() {
    if (!hasEnemies() || typeof Enemies.lockTarget !== 'function') { readyTarget = null; return; }
    try { const t = Enemies.lockTarget(pos(), yaw); readyTarget = t && !(t.disguised || t.noRaise) ? t : null; } catch (e) { readyTarget = null; }
  }
  function startAttack() {
    if (attack || !actor) return;
    const w = weapon();
    const p = pos();
    if (!readyOn) {                                   // quick attack from standing: auto-lock and face it
      let t = null;
      if (hasEnemies() && typeof Enemies.lockTarget === 'function') { try { t = Enemies.lockTarget(p, yaw); } catch (e) { t = null; } }
      if (t && (t.disguised || t.noRaise)) { if (refuseT <= 0) { ui('message', "He can't bring himself to."); refuseT = 2.2; } return; }
      if (t && t.pos) setYaw(Math.atan2(t.pos.x - p.x, t.pos.z - p.z));
    }
    const spray = !!w.spray && readyOn && (S.ammo && S.ammo.extinguisher > 0);
    if (spray) {
      S.ammo.extinguisher = Math.max(0, S.ammo.extinguisher - 1);
      attack = { kind: 'spray', t: 0, strikeAt: 0.12, dur: 1.0, hit: false, w, tick: 0 };
      sfx('spray', { pos: [p.x, p.y + 1.1, p.z], dur: 0.85 });
      emitSpray(0.9);
      return;
    }
    const fast = w.speed === 'fast';
    const dur = fast ? 0.42 : 1.08, strikeAt = fast ? 0.15 : 0.46;
    attack = { kind: w.shove ? 'shove' : 'melee', t: 0, strikeAt, dur, hit: false, w };
    sfx('swing', { pos: [p.x, p.y + 1.2, p.z], heavy: !fast, delay: fast ? 0.05 : 0.3 });
    actor.gesture('swing', { hand: 'L', dur: fast ? 0.36 : 1.1 });
  }
  function aimYaw() { return yaw + (gaze > 0.01 ? swayYaw() : 0); }
  function strike() {
    const w = attack.w, p = pos();
    if (!hasEnemies() || typeof Enemies.hitTest !== 'function') return;
    let hits = [];
    const origin = V(p.x, p.y + 1.1, p.z);
    try { hits = Enemies.hitTest(origin, aimYaw(), w.range, w.arc) || []; } catch (e) { console.error('[Player] hitTest', e); hits = []; }
    hits = hits.filter(alive);
    if (!hits.length) return;
    hits.sort((a, b) => U.dist2(p.x, p.z, a.pos.x, a.pos.z) - U.dist2(p.x, p.z, b.pos.x, b.pos.z));
    const e = hits[0];
    attack.hit = true;
    try {
      if (w.shove) { if (e.damage) e.damage(w.dmg, 'unarmed'); if (e.stun) e.stun(w.stun || 0.8); }
      else {
        if (e.damage) e.damage(w.dmg, w.id || S.equipped);
        if (w.knock > 0 && Math.random() < w.knock && e.knockdown && alive(e)) e.knockdown();
      }
    } catch (err) { console.error('[Player] enemy hit', err); }
    const ep = e.pos || p;
    sfx(w.speed === 'slow' ? 'hit_heavy' : 'hit', { pos: [ep.x, (ep.y || 0) + 1.1, ep.z] });
    if (typeof Cam !== 'undefined' && Cam.shake) Cam.shake(w.speed === 'slow' ? 0.3 : 0.12, 0.18);
    try { if (typeof Input !== 'undefined' && Input.rumble) Input.rumble(0.5, 0.3, 90); } catch (err) { /* ignore */ }
  }
  function sprayTick() {
    if (!hasEnemies() || typeof Enemies.hitTest !== 'function') return;
    const p = pos(), origin = V(p.x, p.y + 1.1, p.z), ay = aimYaw();
    let hits = [];
    try { hits = Enemies.hitTest(origin, ay, 4, 55) || []; } catch (e) { hits = []; }
    for (const e of hits) {
      if (!alive(e) || attack.stunned && attack.stunned.has(e)) continue;
      (attack.stunned || (attack.stunned = new Set())).add(e);
      try {
        if (e.type === 'unread' && typeof e.scatter === 'function') e.scatter(origin, ay);
        else if (e.stun) e.stun(3);
      } catch (err) { console.error('[Player] spray', err); }
    }
    Bus.emit('spray', origin, ay, 4, 55);
  }

  // spray visual: CO2 mist puffs from the nozzle (THREE.Points with a soft canvas sprite)
  function sprayFx() {
    if (fx) return fx;
    const N = 140;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(235,240,240,0.45)'); g.addColorStop(1, 'rgba(230,235,235,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.shared = true;
    const geo = new THREE.BufferGeometry();
    const P = new Float32Array(N * 3), A = new Float32Array(N), Sz = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(A, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(Sz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 300 } }, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; uniform float uScale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb * 0.92, c.a * vA); if (gl_FragColor.a < 0.01) discard; }',
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.name = 'fx:spray'; pts.renderOrder = 5;
    fx = { pts, N, P, A, Sz, parts: Array.from({ length: N }, () => ({ life: 0, max: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0 })), emit: 0, next: 0 };
    P.fill(0); for (let i = 0; i < N; i++) P[i * 3 + 1] = -100;
    return fx;
  }
  function emitSpray(sec) { const f = sprayFx(); f.emit = Math.max(f.emit, sec); if (f.pts.parent !== Render.scene) Render.scene.add(f.pts); }
  function updateFx(dt) {
    if (!fx) return;
    const f = fx;
    let live = 0;
    if (f.emit > 0 && actor) {
      f.emit -= dt;
      const nz = actor.held.L || actor.bones.handL;
      nz.getWorldPosition(_b);
      const ay = aimYaw();
      const n = Math.ceil(dt * 150);
      for (let k = 0; k < n; k++) {
        const p = f.parts[f.next]; f.next = (f.next + 1) % f.N;
        const spread = (Math.random() - 0.5) * 0.7, up = (Math.random() - 0.4) * 0.35, sp = 4 + Math.random() * 3;
        p.x = _b.x + Math.sin(ay) * 0.25; p.y = _b.y + 0.05; p.z = _b.z + Math.cos(ay) * 0.25;
        p.vx = Math.sin(ay + spread) * sp; p.vz = Math.cos(ay + spread) * sp; p.vy = up * sp * 0.4;
        p.life = 0; p.max = 0.7 + Math.random() * 0.6;
      }
    }
    for (let i = 0; i < f.N; i++) {
      const p = f.parts[i];
      if (p.max <= 0 || p.life >= p.max) { f.A[i] = 0; continue; }
      p.life += dt;
      const k = p.life / p.max, drag = Math.exp(-3.2 * dt);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + 0.25 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      f.P[i * 3] = p.x; f.P[i * 3 + 1] = p.y; f.P[i * 3 + 2] = p.z;
      f.A[i] = (1 - k) * Math.min(1, k * 8) * 0.55; f.Sz[i] = 0.12 + k * 0.9;
      live++;
    }
    f.pts.geometry.attributes.position.needsUpdate = true; f.pts.geometry.attributes.alpha.needsUpdate = true; f.pts.geometry.attributes.size.needsUpdate = true;
    if (!live && f.emit <= 0 && f.pts.parent) f.pts.removeFromParent();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Enemies within reach for E (stomp / cut free)
  // ---------------------------------------------------------------------------------------------------------------
  const isDowned = (e) => e.state === 'down' || e.state === 'downed' || e.state === 'knockdown' || e.downed === true;
  function flagOf(e, key, def) { const v = e[key]; if (typeof v === 'function') { try { return !!v.call(e, api); } catch (err) { return false; } } return v === undefined ? def : !!v; }
  const stompable = (e) => alive(e) && flagOf(e, 'canStomp', isDowned(e));
  const cuttable = (e) => S.equipped === 'box_cutter' && alive(e) && flagOf(e, 'canCutFree', e.type === 'tethered' && (isDowned(e) || e.state === 'idle' || e.state === 'unaware' || e.aware === false));
  function enemyInReach() {
    if (!hasEnemies()) return null;
    const p = pos();
    let best = null, bs = Infinity;
    const list = Enemies.list instanceof Map ? Enemies.list.values() : Enemies.list || [];
    for (const e of list) {
      if (!e || !e.pos || !(stompable(e) || cuttable(e))) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > (e.reach ?? 1.6)) continue;
      const ang = d < 0.3 ? 0 : Math.abs(U.angleDiff(yaw, Math.atan2(dx, dz)));
      if (ang > 85 * D2R) continue;
      const s = d + ang;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  function stomp(e) {
    const p = pos();
    if (e.pos) setYaw(Math.atan2(e.pos.x - p.x, e.pos.z - p.z));
    attack = { kind: 'stomp', t: 0, strikeAt: 0.22, dur: 0.6, hit: false, e };
    animLock = 0.5; setAnim('crouch', 0.1, { force: true });
  }
  function doStomp(e) {
    try { if (typeof e.stomp === 'function') e.stomp(api); else if (e.damage) e.damage(9999, 'stomp'); } catch (err) { console.error('[Player] stomp', err); }
    const ep = e.pos || pos();
    sfx('stomp', { pos: [ep.x, (ep.y || 0) + 0.2, ep.z] });
    if (typeof Cam !== 'undefined' && Cam.shake) Cam.shake(0.35, 0.25);
  }
  function doCut(e) {
    try {
      if (typeof e.cutFree === 'function') e.cutFree(api);
      else if (hasEnemies() && typeof Enemies.cutFree === 'function') Enemies.cutFree(e);
    } catch (err) { console.error('[Player] cut free', err); }
    const ep = e.pos || pos();
    sfx('cut', { pos: [ep.x, (ep.y || 0) + 1.0, ep.z] });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Grab / struggle (the Tethered's tether): mash E
  // ---------------------------------------------------------------------------------------------------------------
  function grab(o = {}) {
    if (deadSt) return Promise.resolve('dead');
    if (grabSt) grabEnd(null);
    endReady(); attack = null; holdAct = null; ui('holdPrompt', null);
    return new Promise((resolve) => {
      const need = o.mash ?? 1.5;
      grabSt = { need, window: o.window ?? need + 1.6, t: 0, prog: 0, dmg: o.damage ?? 15, src: o.source ?? 'enemy', onFail: o.onFail, onEscape: o.onEscape, resolve, text: o.text };
      setMode('grabbed'); speed = 0;
      const sp = sourcePos(grabSt.src);
      if (sp) setYaw(Math.atan2(sp.x - pos().x, sp.z - pos().z));
      setAnim('struggle', 0.12, { force: true });
      ui('mash', 0, o.text ? { text: o.text } : {});
    });
  }
  function grabEnd(result) {
    const g = grabSt; if (!g) return;
    grabSt = null;
    ui('mash', null);
    if (mode === 'grabbed') setMode('normal');
    if (result === 'escaped' && g.onEscape) { try { g.onEscape(); } catch (e) { console.error(e); } }
    if (result === 'failed' && g.onFail) { try { g.onFail(); } catch (e) { console.error(e); } }
    g.resolve(result || 'released');
  }
  function release() { grabEnd(null); if (mode === 'pinned') setMode('normal'); }
  function updateGrab(dt, ctl) {
    const g = grabSt;
    g.t += dt;
    if (ctl && typeof Input !== 'undefined' && Input.pressed('interact')) { g.prog += 1 / (g.need * 5.5); Input.consume('interact'); }
    g.prog = Math.max(0, g.prog - dt * 0.08);
    ui('mash', U.clamp(g.prog), g.text ? { text: g.text } : {});
    if (g.prog >= 1) {
      grabEnd('escaped');
      const sp = sourcePos(g.src);
      if (sp) knockback(sp, 0.5);
      return;
    }
    if (g.t >= g.window) {
      const src = g.src;
      grabEnd('failed');
      damage(g.dmg, src, { force: true });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Ladders: climb(rec, from) — rec from RoomBuild.ladders {x,z,rot,y0,y1,top,bottom}
  // ---------------------------------------------------------------------------------------------------------------
  function climb(rec, from = 'bottom') {
    if (!rec || deadSt || mode === 'ladder') return Promise.resolve(false);
    endReady(); attack = null; holdAct = null;
    return new Promise((resolve) => {
      const r = (rec.rot || 0) * D2R;
      const ax = rec.x + Math.sin(r) * 0.34, az = rec.z + Math.cos(r) * 0.34;
      const top = from === 'top';
      const yEnd = top ? Math.max(rec.y0, Math.min(rec.y1 - 1.2, rec.y1 - 0.95)) : rec.y0;
      ladderSt = { rec, ax, az, yaw: r + Math.PI, phase: 'mount', t: 0, dur: top ? 0.8 : 0.45, from: pos().clone(), fromYaw: yaw, to: V(ax, yEnd, az), y: yEnd, stepAcc: 0, resolve, topY: Math.max(rec.y0 + 0.1, rec.y1 - 0.95) };
      setMode('ladder');
      speed = 0;
      setAnim('climb', 0.25, { force: true });
    });
  }
  function abortLadder() { if (ladderSt) { const L = ladderSt; ladderSt = null; mode = 'normal'; L.resolve(false); } }
  function ladderDone() {
    const L = ladderSt; if (!L) return;
    ladderSt = null;
    setMode('normal');
    L.resolve(true);
  }
  function updateLadder(dt, ctl) {
    const L = ladderSt; if (!L) { setMode('normal'); return; }
    const p = pos();
    if (L.phase === 'mount' || L.phase === 'dismount') {
      L.t += dt;
      const k = U.ease.inOut(U.clamp(L.t / L.dur));
      p.lerpVectors(L.from, L.to, k);
      if (L.phase === 'dismount' && L.lift) p.y = Math.max(p.y, U.lerp(L.from.y, L.to.y, Math.min(1, k * 1.6)));
      setYaw(L.fromYaw + U.angleDiff(L.fromYaw, L.toYaw ?? L.yaw) * k);
      if (L.t >= L.dur) {
        if (L.phase === 'mount') { L.phase = 'climb'; setYaw(L.yaw); }
        else { ladderDone(); return; }
      }
      return;
    }
    let v = 0;
    if (ctl && typeof Input !== 'undefined') {                // W / S (stick up / down) climb in any control mode
      const up = Input.move().y;
      if (up > 0.3) v = CLIMB_UP; else if (up < -0.3) v = -CLIMB_DOWN;
    }
    const ny = U.clamp(L.y + v * dt, L.rec.y0, L.topY);
    const moved = Math.abs(ny - L.y);
    L.y = ny;
    p.set(L.ax, ny, L.az);
    setYaw(L.yaw);
    if (moved > 0) {
      L.stepAcc += moved;
      if (L.stepAcc >= 0.3) { L.stepAcc -= 0.3; footstep('ladder', false); }
      stillTime = 0;
    }
    if (v > 0 && ny >= L.topY - 1e-4) {                      // top: over onto the platform
      L.phase = 'dismount'; L.t = 0; L.dur = 0.9; L.from = p.clone(); L.fromYaw = yaw; L.lift = true;
      const ty = floorAt(L.rec.top[0], L.rec.top[1]);
      L.to = V(L.rec.top[0], ty ?? L.rec.y1, L.rec.top[1]); L.toYaw = L.yaw;
      setAnim('walk', 0.35, { force: true });
    } else if (v < 0 && ny <= L.rec.y0 + 1e-4) {             // bottom: step back off
      L.phase = 'dismount'; L.t = 0; L.dur = 0.5; L.from = p.clone(); L.fromYaw = yaw; L.lift = false;
      const by = floorAt(L.rec.bottom[0], L.rec.bottom[1]);
      L.to = V(L.rec.bottom[0], by ?? L.rec.y0, L.rec.bottom[1]); L.toYaw = L.yaw + Math.PI;
      setAnim('idle', 0.3, { force: true });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Footsteps (timed to the Rig gait phase: heel strikes at phase 0 and 0.5)
  // ---------------------------------------------------------------------------------------------------------------
  function surface() {
    if (footSurfaceOverride) return footSurfaceOverride;
    if (typeof World !== 'undefined' && World && World.surfaceAt) return World.surfaceAt(pos().x, pos().z);
    return 'concrete';
  }
  function footstep(surf, running) {
    try { if (typeof Snd !== 'undefined' && Snd.footstep) Snd.footstep(surf, running, { pos: [pos().x, pos().y + 0.05, pos().z] }); } catch (e) { /* audio */ }
  }
  function footsteps(moving) {
    if (!actor || !actor.state) return;
    const ph = actor.state.phase;
    if (moving) {
      const fwd = (lastPhase < 0.5 && ph >= 0.5 && ph - lastPhase < 0.4) || (ph < lastPhase && lastPhase - ph > 0.5);
      const back = (lastPhase >= 0.5 && ph < 0.5 && lastPhase - ph < 0.4) || (ph > lastPhase && ph - lastPhase > 0.5);
      const crossed = fwd || back;
      if (crossed) footstep(surface(), runningNow);
    }
    lastPhase = ph;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Movement helpers
  // ---------------------------------------------------------------------------------------------------------------
  function moveBy(dx, dz) {
    const p = pos();
    if (noclip) {
      p.x += dx; p.z += dz;
      const fy = floorAt(p.x, p.z);
      if (fy !== null) p.y = fy;
      return Math.hypot(dx, dz);
    }
    if (typeof World === 'undefined' || !World || !World.move) { p.x += dx; p.z += dz; return Math.hypot(dx, dz); }
    const ox = p.x, oz = p.z;
    const r = World.move(p, dx, dz, RADIUS, { player: true });
    p.x = r.x; p.z = r.z;
    if (r.y !== undefined && r.y !== null) stepTo(r.y);
    return Math.hypot(p.x - ox, p.z - oz);
  }
  let stepTarget = null;
  function stepTo(y) { stepTarget = y; }
  function settleY(dt) {
    const p = pos();
    let fy = stepTarget;
    if (fy === null || fy === undefined) fy = floorAt(p.x, p.z);
    stepTarget = null;
    if (fy === null || fy === undefined) return;
    const d = fy - p.y;
    if (Math.abs(d) < 0.002 || dt <= 0) { p.y = fy; return; }
    // smooth stepping: climb steps quickly, drop a touch faster; ramps follow almost exactly
    p.y = Math.abs(d) > 0.6 ? fy : U.damp(p.y, fy, d > 0 ? 18 : 22, dt);
  }
  function impulse(dx, dz, dur = 0.25) { impulseSt = { dx, dz, dur: Math.max(0.05, dur), t: 0 }; }
  function knockback(from, dist = 1) {
    const p = pos(), f = U.toV3(from);
    let dx = p.x - f.x, dz = p.z - f.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) { dx = -Math.sin(yaw); dz = -Math.cos(yaw); } else { dx /= l; dz /= l; }
    impulse(dx * dist, dz * dist, 0.28);
  }
  function turnAround() {
    if (mode !== 'normal' || turnSt) return;
    turnSt = { from: yaw, t: 0, dur: 0.45 };
    speed = 0; hold = null;
    impulse(-Math.sin(yaw) * 0.25, -Math.cos(yaw) * 0.25, 0.3);
  }
  function camBasis() {
    if (typeof Cam !== 'undefined' && Cam && Cam.basis) return Cam.basis();
    return { fx: 0, fz: 1, rx: -1, rz: 0 };
  }
  // direction hold: returns the basis to use for this frame's input
  const dirChanged = (a, mv) => {
    const pad = typeof Input !== 'undefined' && Input.lastDevice === 'gamepad';
    return pad ? Math.abs(U.angleDiff(Math.atan2(a.x, a.y), Math.atan2(mv.x, mv.y))) > 25 * D2R
      : Math.abs(mv.x - a.x) > 0.01 || Math.abs(mv.y - a.y) > 0.01;
  };
  // a basis under which input `mv` points along Aidan's facing (input angle a maps to world yaw θ − a, so θ = yaw + a)
  function facingBasis(mv) {
    const th = yaw + Math.atan2(mv.x, mv.y), fx = Math.sin(th), fz = Math.cos(th);
    return { fx, fz, rx: -fz, rz: fx };
  }
  function heldBasis(mv) {
    basisRead = true;
    const live = camBasis();
    const mag = Math.hypot(mv.x, mv.y);
    if (mag < 0.15) { hold = null; entryHold = null; cutFlag = false; lastLiveBasis = live; prevInput = { x: 0, y: 0 }; return live; }
    if (entryHold) {                                   // held since before a room change / teleport: keep walking on
      const eh = entryHold; entryHold = null;
      if (!dirChanged(eh.dir, mv)) hold = { basis: facingBasis(mv), dir: { x: mv.x, y: mv.y } };
    }
    if (cutFlag && !hold && lastLiveBasis && Math.hypot(prevInput.x, prevInput.y) > 0.15) hold = { basis: lastLiveBasis, dir: { ...prevInput } };
    cutFlag = false;
    if (hold && dirChanged(hold.dir, mv)) hold = null;
    prevInput = { x: mv.x, y: mv.y };
    lastLiveBasis = live;
    return hold ? hold.basis : live;
  }
  // frames where movement input isn't read (no control: cutscenes, transitions, menus; attacks, turns, holds): keep
  // the hold honest — releasing or changing direction ends it — so a stale hold never re-engages after a cut
  function trackInput() {
    if (typeof Input === 'undefined' || !Input.move) return;
    const mv = Input.move(), mag = Math.hypot(mv.x, mv.y);
    if (mag < 0.15) { hold = null; entryHold = null; prevInput = { x: 0, y: 0 }; return; }
    if (hold && dirChanged(hold.dir, mv)) hold = null;
    if (entryHold && dirChanged(entryHold.dir, mv)) entryHold = null;
    prevInput = { x: mv.x, y: mv.y };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Interaction target + head look
  // ---------------------------------------------------------------------------------------------------------------
  function updateTargets(dt, ctl) {
    lookT -= dt;
    const hasWorld = typeof World !== 'undefined' && World && World.nearestInteractable;
    if (lookT <= 0) {
      lookT = 0.1;
      const p = pos();
      if (hasWorld && mode === 'crawl') {
        lookIt = null;
        useIt = World.nearestInteractable(p, yaw, 3, { use: true, crawl: true });   // CONTRACT+: K.interact(…, {crawl:true})
      } else if (hasWorld && mode === 'normal') {
        const lk = World.nearestInteractable(p, yaw, 3, { look: true });
        if (lk !== lookIt) {
          // hysteresis: keep the current look target unless it is gone or clearly worse
          if (!lookIt || !lk || !World.isActive || !World.isActive(lookIt) || distTo(lookIt) > 3.2 || distTo(lk) + 0.4 < distTo(lookIt)) lookIt = lk;
        }
        useIt = World.nearestInteractable(p, yaw, 3, { use: true });
      } else { lookIt = null; useIt = null; }
    }
    if (!actor || !ctl) return;
    let target = null;
    if (readyOn && readyTarget && readyTarget.pos) { enemyLook.copy(readyTarget.pos); enemyLook.y += readyTarget.height ? readyTarget.height * 0.85 : 1.4; target = enemyLook; }
    else if (holdAct && holdAct.e && holdAct.e.pos) { enemyLook.copy(holdAct.e.pos); enemyLook.y += 0.9; target = enemyLook; }
    else if (lookIt && lookIt.look !== false) { lookVec.copy(lookIt.pos); target = lookVec; }
    actor.lookAt(target);
  }
  const distTo = (it) => (it && it.pos ? U.dist2(pos().x, pos().z, it.pos.x, it.pos.z) : Infinity);

  function interactPress(ctl, dt) {
    if (!ctl || typeof Input === 'undefined') return;
    if (holdAct) {
      const H = holdAct;
      if (!Input.down('interact')) {
        if (H.kind === 'cut' && H.t < 0.3 && H.tapStomp && stompable(H.e)) { ui('holdPrompt', null); holdAct = null; if (actor) actor.finishGestures(); stomp(H.e); return; }
        ui('holdPrompt', null); if (H.kind === 'cut' && actor) actor.finishGestures(); holdAct = null; return;
      }
      if (H.kind === 'cut' && (!alive(H.e) || !cuttable(H.e) || distTo(H.e) > 2)) { ui('holdPrompt', null); if (actor) actor.finishGestures(); holdAct = null; return; }
      if (H.kind === 'interact' && (!World.isActive(H.it) || distTo(H.it) > (H.it.r ?? 1.2) + 0.6)) { ui('holdPrompt', null); holdAct = null; return; }
      H.t += dt;
      const shown = H.kind === 'cut' ? H.t >= 0.3 : true;
      if (shown) ui('holdPrompt', H.text, U.clamp(H.t / H.need));
      if (H.kind === 'cut' && H.t >= 0.3 && !H.reached && actor) { H.reached = true; actor.gesture('reach', { hand: 'L', target: V(H.e.pos.x, (H.e.pos.y || 0) + 0.8, H.e.pos.z), hold: true }); }
      if (H.t >= H.need) {
        holdAct = null; ui('holdPrompt', null);
        if (H.kind === 'cut') { if (actor) actor.finishGestures(); doCut(H.e); }
        else if (typeof World !== 'undefined') World.interact(H.it);
      }
      return;
    }
    const buffered = eBuf > 0;
    eBuf = 0;
    if (!Input.pressed('interact') && !buffered) return;
    const e = mode === 'crawl' ? null : enemyInReach();
    // E on an open message: it only dismisses the message when E has nothing else to do, or when the target is the
    // thing he just used (so dismissing "It's locked." never re-tries the door). A message from elsewhere — a boss
    // objective, a pickup line — never eats the press meant for the button in front of him.
    const target = (e && (cuttable(e) || stompable(e))) ? e : useIt;
    const recent = target && target === lastUsed.it && clock - lastUsed.t < 6;
    if (hasUI() && UI.dismissMessage && UI.dismissMessage() && (!target || recent)) { Input.consume('interact'); return; }
    if (e) {
      if (cuttable(e)) { holdAct = { kind: 'cut', e, t: 0, need: 2, tapStomp: stompable(e), text: 'Cut it free' }; speed = 0; return; }
      if (stompable(e)) { stomp(e); Input.consume('interact'); return; }
    }
    const it = useIt;
    if (!it || typeof World === 'undefined') return;
    lastUsed.it = it; lastUsed.t = clock;
    if (it.hold > 0) { holdAct = { kind: 'interact', it, t: 0, need: it.hold, text: it.holdText || 'Hold {interact}' }; speed = 0; return; }
    Input.consume('interact');
    World.interact(it);
  }
  const lastUsed = { it: null, t: -99 };

  // ---------------------------------------------------------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------------------------------------------------------
  function update(dt = Time.dt || 0) {
    if (!actor) return;
    clock += dt;
    hurtCool = Math.max(0, hurtCool - dt);
    refuseT = Math.max(0, refuseT - dt);
    const ctl = canCtl();
    if (!ctl && hadControl) {                                   // control lost: settle, hand the body to the script
      speed = 0; cancelActions();
      if (mode === 'normal' && (lastAnim === 'walk' || lastAnim === 'run' || lastAnim === 'stagger')) setAnim('idle', 0.3);
      actor.lookAt(null);
    }
    if (ctl && !hadControl) { lastAnim = null; if (actor.root.rotation.y !== yaw) yaw = U.wrapAngle(actor.root.rotation.y); }
    hadControl = ctl;
    if (!ctl && mode === 'normal') yaw = U.wrapAngle(actor.root.rotation.y);
    syncWeapon(cutsceneStow(ctl));
    updateGaze(dt);
    const p = pos();
    const ox = p.x, oz = p.z, oyaw = yaw;
    runningNow = false;
    basisRead = false;
    let moved = 0;

    if (typeof Input !== 'undefined' && ctl && Input.pressed('torch') && mode !== 'dead') toggleTorch();

    switch (mode) {
      case 'dead': speed = 0; break;
      case 'down': {
        downSt.t += dt;
        if (!downSt.up && downSt.t >= downSt.lie + 0.3) { downSt.up = true; actor.gesture('stand_up', { to: 'idle' }); lastAnim = 'idle'; }
        if (downSt.up && downSt.t >= downSt.lie + 1.55) { downSt = null; setMode('normal'); }
        break;
      }
      case 'grabbed': updateGrab(dt, ctl); break;
      case 'pinned': speed = 0; break;
      case 'ladder': updateLadder(dt, ctl); break;
      case 'crawl': moved = locomotion(dt, ctl, CRAWL, false); interactPress(ctl, dt); break;
      default: moved = normalMode(dt, ctl);
    }
    if (impulseSt) {
      const I = impulseSt, k0 = I.t / I.dur;
      I.t = Math.min(I.dur, I.t + dt);
      const k1 = I.t / I.dur, e0 = 1 - (1 - k0) ** 2, e1 = 1 - (1 - k1) ** 2;
      moveBy(I.dx * (e1 - e0), I.dz * (e1 - e0));
      if (I.t >= I.dur) impulseSt = null;
    }
    if (mode !== 'ladder' && mode !== 'dead' && (ctl || mode !== 'normal' || impulseSt)) settleY(dt);
    if (!basisRead) trackInput();
    // the phone's screen lights his face and chest from below (a weak pool light the Rig keeps at the screen)
    const glow = deadSt || !actor.root.visible || !actor.root.parent || !actor.held || !actor.held.R || !actor.held.R.userData.screen ? 0 : PHONE_GLOW;
    if (glow !== phoneGlow || (glow > 0 && (!actor._plight || !actor._plight.isOn))) { phoneGlow = glow; try { actor.setPhoneLight(glow); } catch (e) { /* no rig light */ } }

    // stamina: 6 s of running, refills in 4 s (gaze drains 3×)
    if (runningNow) stamina = Math.max(0, stamina - (dt / RUN_SEC) * (1 + 2 * gaze));
    else stamina = Math.min(1, stamina + dt / REFILL_SEC);
    if (stamina <= 0) exhausted = true; else if (exhausted && stamina >= 0.35) exhausted = false;

    // stats
    const dist = Math.hypot(p.x - ox, p.z - oz);
    if (dist > 0 && dist < 2 && (ctl || mode === 'crawl')) { if (runningNow) S.stats.ran = (S.stats.ran || 0) + dist; else S.stats.walked = (S.stats.walked || 0) + dist; }
    if (dist > 0.002 || Math.abs(U.angleDiff(oyaw, yaw)) > 0.004 || (mode === 'ladder' && ladderSt && ladderSt.phase !== 'climb')) stillTime = 0; else stillTime += dt;

    updateTargets(dt, ctl);
    if (ctl || mode !== 'normal') pickAnim(dt, moved);
    // heartbeat rumble at DANGER
    try { if (typeof Input !== 'undefined' && Input.heartbeat) Input.heartbeat(!deadSt && S.health < 35, 70 + (35 - S.health) * 1.5); } catch (e) { /* ignore */ }
    actor.update(dt);
    footsteps(ctl && Math.abs(speed) > 0.25 && mode === 'normal');
    updateTorch(dt);
    updateFx(dt);
  }

  function normalMode(dt, ctl) {
    // attack / stomp in progress: planted
    if (attack) {
      eBuf = Math.max(0, eBuf - dt);
      if (ctl && typeof Input !== 'undefined' && Input.pressed('interact')) eBuf = 0.5;
      attack.t += dt;
      if (attack.kind !== 'spray' && readyTarget && alive(readyTarget) && readyTarget.pos) faceToward(readyTarget.pos, 10, dt);
      if (!attack.hit && attack.t >= attack.strikeAt) {
        if (attack.kind === 'stomp') { attack.hit = true; doStomp(attack.e); }
        else if (attack.kind === 'spray') { /* continuous below */ }
        else { attack.hit = true; strike(); }
      }
      if (attack.kind === 'spray' && attack.t >= attack.strikeAt && attack.t <= attack.dur - 0.15) { attack.tick -= dt; if (attack.tick <= 0) { attack.tick = 0.15; sprayTick(); } }
      if (attack.t >= attack.dur) { if (attack.kind === 'stomp') { animLock = 0; lastAnim = null; } attack = null; }
      speed = U.damp(speed, 0, 16, dt);
      return 0;
    }
    if (!ctl) { speed = 0; return 0; }
    // quick 180° turn
    if (turnSt) {
      turnSt.t += dt;
      const k = U.ease.inOut(U.clamp(turnSt.t / turnSt.dur));
      setYaw(turnSt.from + Math.PI * k);
      speed = U.damp(speed, 0, 20, dt);
      if (turnSt.t >= turnSt.dur) { turnSt = null; hold = null; }
      return 0;
    }
    if (Input.pressed('turn') && !holdAct) { endReady(); turnSt = { from: yaw, t: 0, dur: 0.38 }; hold = null; return 0; }
    // ready stance
    const wantReady = Input.down('ready') && !holdAct;
    if (wantReady && !readyOn) startReady();
    else if (!wantReady && readyOn) endReady();
    if (readyOn && (!readyTarget || !alive(readyTarget) || distTo(readyTarget) > 7)) { readyRelockT -= dt; if (readyRelockT <= 0) { readyRelockT = 0.25; relock(); } }
    if (Input.pressed('attack')) { startAttack(); if (attack) return 0; }
    interactPress(ctl, dt);
    if (holdAct) { speed = U.damp(speed, 0, 16, dt); return 0; }
    return locomotion(dt, ctl, WALK, true);
  }
  function faceToward(target, rate, dt) {
    const p = pos();
    const want = Math.atan2(target.x - p.x, target.z - p.z);
    const d = U.angleDiff(yaw, want);
    setYaw(yaw + Math.sign(d) * Math.min(Math.abs(d), rate * dt));
  }

  // walking/running/crawling with camera-relative (direction hold) or tank controls
  function locomotion(dt, ctl, walkSpeed, canRun) {
    const mv = ctl && typeof Input !== 'undefined' ? Input.move() : { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const tank = typeof META !== 'undefined' && META.options && META.options.control === 'tank';
    const danger = S.health < 35;
    let target = 0, dirYaw = yaw, strafe = null;
    const runKey = canRun && ctl && Input.down('run') && !readyOn && !exhausted && stamina > 0;
    if (readyOn) {
      // ready: facing belongs to the lock (or A/D rotate without one); slow steps
      if (readyTarget && readyTarget.pos) {
        faceToward(readyTarget.pos, 7, dt);
        if (gaze > 0.01) setYaw(yaw + swayYaw() * dt * 3);
        if (mag > 0.15) {
          const b = heldBasis(mv);
          const dx = b.fx * mv.y + b.rx * mv.x, dz = b.fz * mv.y + b.rz * mv.x;
          strafe = Math.atan2(dx, dz); target = READY_STEP * mag;
        } else heldBasis(mv);
      } else {
        setYaw(yaw - mv.x * 1.9 * dt);
        if (Math.abs(mv.y) > 0.15) { target = READY_STEP * Math.abs(mv.y); strafe = mv.y > 0 ? yaw : yaw + Math.PI; }
      }
      speed = U.damp(speed, target, 12, dt);
      const d = speed * dt, sy = strafe ?? yaw;
      return strafe !== null || speed > 0.01 ? moveBy(Math.sin(sy) * d, Math.cos(sy) * d) : 0;
    }
    if (tank) {
      const rate = (runKey && mv.y > 0.3 ? 3.0 : 2.5);
      setYaw(yaw - mv.x * rate * dt);
      if (mv.y > 0.15) target = (runKey ? RUN : walkSpeed * Math.max(0.35, mv.y)) * (danger && !runKey ? 0.85 : 1);
      else if (mv.y < -0.15) target = -Math.min(BACK, walkSpeed) * Math.abs(mv.y);
      runningNow = runKey && mv.y > 0.3 && speed > walkSpeed + 0.2;
      speed = U.damp(speed, target, target === 0 ? 14 : 9, dt);
      const d = speed * dt;
      if (Math.abs(speed) < 0.005) return 0;
      return moveBy(Math.sin(yaw) * d, Math.cos(yaw) * d);
    }
    // camera-relative
    const b = ctl ? heldBasis(mv) : camBasis();
    if (mag > 0.1) {
      const dx = b.fx * mv.y + b.rx * mv.x, dz = b.fz * mv.y + b.rz * mv.x;
      dirYaw = Math.atan2(dx, dz);
      const diff = U.angleDiff(yaw, dirYaw);
      const rate = (runKey ? 8 : 10) * (mode === 'crawl' ? 0.35 : 1);
      setYaw(yaw + Math.sign(diff) * Math.min(Math.abs(diff), rate * dt));
      const align = Math.max(0, Math.cos(U.angleDiff(yaw, dirYaw)));
      target = (runKey ? RUN : walkSpeed * Math.max(0.4, mag)) * align ** 1.5 * (danger && !runKey && mode !== 'crawl' ? 0.85 : 1) * (staggerT > 0 ? 0.35 : 1);
    }
    staggerT = Math.max(0, staggerT - dt);
    speed = U.damp(speed, target, target > speed ? 9 : 14, dt);
    runningNow = runKey && speed > walkSpeed + 0.3;
    if (speed < 0.005) { speed = 0; return 0; }
    const d = speed * dt;
    return moveBy(Math.sin(yaw) * d, Math.cos(yaw) * d);
  }

  function pickAnim(dt, moved) {
    if (!actor) return;
    if (animLock > 0) { animLock -= dt; return; }
    switch (mode) {
      case 'dead': case 'down': case 'grabbed': case 'pinned': return;
      case 'ladder': if (ladderSt && ladderSt.phase !== 'dismount') setAnim('climb', 0.25); return;
      case 'crawl': setAnim(modeOpts.anim || 'crawl', 0.35); return;
      default: {
        const v = Math.abs(speed);
        let name;
        if (staggerT > 0) name = 'stagger';
        else if (v > 2.3) name = 'run';
        else if (v > 0.12) name = 'walk';
        else name = S.health < 35 ? 'hurt' : 'idle';
        setAnim(name, name === 'run' || lastAnim === 'run' ? 0.18 : 0.25);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------------------------------------------
  function saveState() {
    const p = pos();
    S.pos = [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, Math.round(p.z * 1000) / 1000];
    S.yaw = Math.round((yaw / D2R) * 10) / 10;
    if (typeof World !== 'undefined' && World && World.room) S.room = World.room;
    return S.pos;
  }
  function reset() {
    deadSt = false; mode = 'normal'; modeOpts = {}; stamina = 1; exhausted = false; gaze = 0; gazeTarget = 0; tremorOn = false;
    speed = 0; control = true; locks.clear(); turnSt = null; attack = null; holdAct = null; ladderSt = null; downSt = null;
    staggerT = 0; impulseSt = null; hold = null; cutFlag = false; entryHold = null; lastLiveBasis = null; prevInput = { x: 0, y: 0 };
    readyOn = false; readyTarget = null; stillTime = 0; phoneGlow = -1;
    if (grabSt) grabEnd(null);
    heldFor = undefined; heldKind = null;
    setTorch(false);
    if (actor) { restoreBody(); lastAnim = null; setAnim('idle', 0, { force: true }); }
    ui('holdPrompt', null); ui('mash', null);
  }
  // CONTRACT+: Player.restoreBody() — Aidan's actor as a new game expects it: the player's Rig actor lives for the whole
  // session, so posture, habits, expression, eyes, head scale, opacity / tint and held props set by cutscenes (the
  // endings take the phone out of his hand, give him a box or a pendant) would otherwise carry into the title and NG+.
  function restoreBody() {
    const a = actor;
    if (!a) return;
    a.posture = 0; a.idleLife = true;
    try { a.finishGestures(); a.lookAt(null); a.expr('neutral'); a.eyes('ahead'); a.talk(false); } catch (e) { /* rig */ }
    try { a.hold('L', null); } catch (e) { /* rig */ }
    if (!a.held || !a.held.R || a.held.R.userData.kind !== 'phone') { try { a.hold('R', 'phone'); } catch (e) { /* rig */ } }
    if (a.held && a.held.R) a.held.R.visible = true;
    try { a.bones.head.scale.set(1, 1, 1); } catch (e) { /* rig */ }
    try { a.setOpacity(1); if (a.tint && a.tint.amount) a.setTint(null, 0); a.visible(true); } catch (e) { /* rig */ }
    heldFor = undefined; heldKind = null;                         // the weapon hold is re-synced next frame
    weaponOverride = 0;
  }

  // CONTRACT+: Player.poseSnapshot() / poseRestore(snap) — Aidan's arm carry poses and held props. Script takes one when a
  // letterboxed scene starts and restores it when the scene ends, so a pose a scene sets (phone_ear, a raised phone …)
  // doesn't outlive it; a hand whose prop the scene changed keeps what the scene gave it.
  function poseSnapshot() {
    const a = actor;
    if (!a || !a.state || !a.state.carry) return null;
    return { L: a.state.carry.L, R: a.state.carry.R, hL: a.held ? a.held.L : null, hR: a.held ? a.held.R : null };
  }
  function poseRestore(snap) {
    const a = actor;
    if (!snap || !a || !a.state || !a.state.carry || deadSt) return false;
    let n = 0;
    for (const h of ['L', 'R']) {
      if ((a.held ? a.held[h] : null) !== snap['h' + h] || a.state.carry[h] === snap[h]) continue;
      a.state.carry[h] = snap[h]; n++;
    }
    return n > 0;
  }

  Bus.on('cam:cut', () => { cutFlag = true; });
  Bus.on('save', () => { try { saveState(); } catch (e) { /* no actor yet */ } });
  Bus.on('room:leave', () => {
    if (holdAct) { ui('holdPrompt', null); holdAct = null; }
    if (grabSt) grabEnd(null);
    abortLadder();
    attack = null; impulseSt = null; lookIt = null; useIt = null;
    if (fx) { fx.emit = 0; for (const p of fx.parts) p.max = 0; if (fx.pts.parent) fx.pts.removeFromParent(); }
  });

  const api = {
    init, update, place, teleport, face, damage, hurt: damage, heal, kill, status, setGaze, grab, release, climb, crawl, pin,
    setMode, setControl, lock, reset, restoreBody, holdOverride, poseSnapshot, poseRestore, saveState, setTorch, toggleTorch, turnAround, impulse, knockback, weapon,
    isEnemySource,
    get actor() { return init(); },
    get pos() { return pos(); },
    get yaw() { return yaw; },
    set yaw(v) { setYaw(v); },
    get yawDeg() { return yaw / D2R; },
    get control() { return control; },
    set control(v) { setControl(v); },
    get locked() { return locks.size > 0; },
    get canControl() { return canCtl(); },
    get mode() { return mode; },
    get health() { return S.health; },
    get stamina() { return stamina; },
    get exhausted() { return exhausted; },
    get running() { return runningNow; },
    get speed() { return speed; },
    get torchOn() { return torchOn; },
    get torch() { return torchOn; },
    get stillTime() { return stillTime; },
    get gaze() { return gaze; },
    get ready() { return readyOn; },
    get lockTarget() { return readyTarget; },
    get interactTarget() { return useIt; },
    get lookTarget() { return lookIt; },
    get attackState() { return attack ? { kind: attack.kind, t: attack.t, dur: attack.dur } : null; },
    get holding() { return holdAct ? { kind: holdAct.kind, t: holdAct.t, need: holdAct.need } : null; },
    get grabbed() { return !!grabSt; },
    get ladder() { return ladderSt ? ladderSt.rec : null; },
    get dead() { return deadSt; },
    get noclip() { return noclip; },
    set noclip(v) { noclip = !!v; },
    get surface() { return surface(); },
    set surfaceOverride(v) { footSurfaceOverride = v || null; },
    get directionHeld() { return !!hold; },
    WEAPONS, WALK, RUN, CRAWL,
  };
  return api;
})();
