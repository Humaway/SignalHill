// tools/tests/ch5.mjs — Chapter 5 "Level 4" played start to finish (spec §10 Chapter 5 + Luka calls 5 and 6, §7B
// Regional Office, §6 the Standard / the Pedestal / the Borrowed, §13 Huddle Whiteboard 3 + Chloe's Pin; CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c5.html && node tools/run.mjs --file .build/c5.html --script tools/tests/ch5.mjs
//   env: CH5_PATH=connected|coverage|tomorrow|deal  CH5_RIDDLE=easy|normal|hard  CH5_SAVELOAD=1  CH5_SHOTS=<dir>
//   With no CH5_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//   (Chapter 5 has no riddle puzzle: the riddle level only has to leave the chapter playable.)
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 5 as a real player arrives (S.chapter === 5, Aidan on
// the ring road at the business-park gate, carrying the box cutter and the bar). It never resets state. It plays the
// critical path with the real mechanics — street exits walked into with real keys, doors and props used with E beside
// them, the lobby's visitor-pass printer, the speed gate and the whole of Stairwell A climbed with real keys (CUTSCENE
// 5-1 on the Level 2 landing, the Standard following up the flights), Luka's calls answered / declined with E / Q, the
// Tethered cut free (hold E with the box cutter) or stomped, the Borrowed "Chloe" examined + stepped back from (then
// fought) or talked to, the print room (CUTSCENE 5-2 → the Outage), Chloe's Pin and the receipt map, the Outage floor
// walked to the feature stair, the Pedestal (real bar swings at the six base plinths; the crawling reps put down with
// the Enemies API when they reach him), CUTSCENE 5-4 / 5-4alt, the climb back up (CALL 6) — until Chapter 6 has started
// on Level 4 (c5_level4, the escalations office door).
// Decisions follow opts.path:
//   connected — answer Luka (5 and 6), cut the Tethered free, examine the Borrowed and step back, read Huddle Whiteboard
//               3, take the break, never hit the figure at the top (chloeSaved → 5-4); 5-1, 5-2, 5-3, 5-4 play through
//   coverage  — answer Luka, cut the Tethered free, talk to the Borrowed (grabbed) — and hit the top figure once the
//               tower is low enough (chloeSaved false → 5-4alt); scenes skipped
//   tomorrow  — decline Luka (both), stomp the Tethered, leave the Borrowed alone, never hit the figure; scenes skipped
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the lobby payphone (the chapter's first), go on through the pass, the stairwell and 5-1 to
// Level 4 (CALL 5), then reload that slot (Game.continueFrom) and play the chapter on from the lobby.
// → { chapter: 5, F, A, flags, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: true, borrowed: 'examine', huddle: true, brk: true, hitTop: false, play: true, examine: true },
  coverage: { answer: true, cut: true, borrowed: 'talk', huddle: true, brk: false, hitTop: true, play: false, examine: false },
  tomorrow: { answer: false, cut: false, borrowed: 'avoid', huddle: false, brk: false, hitTop: false, play: false, examine: false },
};
PATHS.deal = PATHS.connected;

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, obusy: !!M.World.outageBusy, menu: M.Menus.isOpen() ? M.Menus.current : null,
  ready: !!(M.Menus._top && M.Menus._top.ready), cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode,
  outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A, hp: Math.round(S.health), pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.y.toFixed(2), +M.Player.pos.z.toFixed(2)] };`);

// record every subtitle / message / card / choice line (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c5spy) { window.__c5spy = true; window.__c5lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say', 'choice']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c5lines.push(fn[0] + ':' + a.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? 'CHOICE[' + x.map((y) => (typeof y === 'string' ? y : (y && (y.label || y.text)) || '')).join('|') + ']' : '')).filter(Boolean).join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
async function saw(h, text, notes, where) {
  const ok = await ev(h, `return (window.__c5lines || []).some((l) => l.includes(${JSON.stringify(text)}))`);
  if (!ok) notes.push(`MISSING line (${where}): ${text}`);
  return ok;
}
const clearLines = (h) => ev(h, 'window.__c5lines = []; return 1');

async function holdAction(h, action, sec) {
  await ev(h, `SH.press(${JSON.stringify(action)}, 600); return true;`);
  try { await advance(h, sec); } finally { await ev(h, 'SH.mod.Input.releaseAll(); return true;'); }
  await advance(h, 0.1);
}
async function equip(h, id) {
  await ev(h, `await SH.run(async (G) => { G.equip(${JSON.stringify(id)}); }); return true;`);
  const eq = await ev(h, 'return SH.S.equipped');
  if (eq !== id) throw new Error(`could not equip ${id} (equipped: ${eq})`);
}
async function tp(h, x, z, yaw) {
  await ev(h, `SH.teleport(${x}, ${z}, ${yaw}); try { SH.mod.Cam.snap(); } catch (e) {} return true;`);
  await advance(h, 0.3);
}
const heal = (h) => ev(h, 'await SH.run(async (G) => { G.heal(100); }); return SH.S.health;');
async function shot(h, opts, name) {
  if (!opts.shots) return;
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c5_${name}.png`); } catch (e) { /* optional */ }
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered / declined per
// path), a document's reading view (closed). Returns when the player has control, or when a choice / keypad waits.
export async function settle(h, P, notes, o = {}) {
  const maxIter = o.maxIter ?? 900;
  for (let i = 0; i < maxIter; i++) {
    const s = await snap(h);
    if (s.mode === 'death') throw new Error('Aidan died: ' + JSON.stringify(s));
    if (s.mode !== 'play' && s.mode !== 'cutscene' && s.mode !== 'menu') { await advance(h, 0.3); continue; }
    if (s.menu) {
      if (s.menu === 'doc' || s.menu === 'items' || s.menu === 'map') { if (s.ready) await ev(h, 'SH.nav("cancel"); return true;'); await advance(h, 0.3); continue; }
      return s;
    }
    if (s.choosing || s.cap) return s;
    if (s.ring && !s.inCall && !s.trans) {
      notes.push(`call ${s.ring}: ${P.answer ? 'answered' : 'declined'}`);
      await press(h, P.answer ? 'interact' : 'decline', 0, 0.4);
      continue;
    }
    if (s.trans || s.busy || s.inCall || s.obusy) {
      if (!(o.play ?? P.play) && s.skippable) { await ev(h, 'SH.skip(); return true;'); await advance(h, 0.4); }
      else await advance(h, 0.5);
      continue;
    }
    await advance(h, 0.15);
    const s2 = await snap(h);
    if (!s2.busy && !s2.trans && !s2.obusy && !s2.menu && !s2.choosing && !s2.cap && !(s2.ring && !s2.inCall)) return s2;
  }
  throw new Error('settle: the game never handed control back: ' + JSON.stringify(await snap(h)));
}
// press E at a spot and let the result play out
export async function useAt(h, P, notes, x, z, yaw, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, o.after ?? 0.4);
  return settle(h, P, notes, o);
}
// stand at a spot facing a door and press E until the next room is loaded
async function door(h, P, notes, x, z, yaw, to) {
  const arrived = `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`;
  for (let tries = 0; tries < 4; tries++) {
    await tp(h, x, z, yaw);
    await press(h, 'interact', 0, 0.3);
    if (await advanceUntil(h, arrived, 8)) { await advance(h, 0.3); return; }
    await settle(h, P, notes);
  }
  throw new Error(`door → ${to} did not work from ${x},${z}: ${JSON.stringify(await snap(h))}`);
}
// walk with real keys through waypoints (o.until ends the walk early); throws with the state when a leg stalls
async function walkPath(h, pts, what, o = {}) {
  for (const [x, z] of pts) {
    const ok = await walkTo(h, x, z, { maxSec: o.maxSec ?? 25, tol: o.tol ?? 0.45, run: o.run, until: o.until });
    if (o.until && (await ev(h, `try { return !!(${o.until}); } catch (e) { return false; }`))) return true;
    if (!ok && !o.until) throw new Error(`walk (${what}) did not reach ${x},${z}: ${JSON.stringify(await snap(h))}`);
    if (o.heal) { const hp = await ev(h, 'return SH.S.health'); if (hp < 60) await heal(h); }
  }
  return true;
}
// the §2A payphone flow: receiver → breathing → "Save your progress?" → slot
async function payphoneSave(h, P, notes, slot, at) {
  await tp(h, ...at);
  await press(h, 'interact', 0, 0.3);
  await choose(h, 0);                                                  // Pick up the receiver? YES
  await choose(h, 0, 30);                                              // Save your progress? YES
  await mustReach(h, "SH.mod.Menus.current === 'save' && SH.mod.Menus._top && SH.mod.Menus._top.ready", 20, 'the save screen', { step: 0.1 });
  const before = await ev(h, 'return SH.mod.Save.seq');
  for (let k = 0; k < 4; k++) {
    const cur = await ev(h, 'return SH.mod.Menus._top.st.i');
    if (cur === slot) break;
    await ev(h, `SH.nav(${cur < slot ? "'down'" : "'up'"}); return 1`); await advance(h, 0.15);
  }
  await ev(h, 'SH.nav("confirm"); return true;');
  await advance(h, 0.4);
  if (await ev(h, 'const t = SH.mod.Menus._top; return !!(t && t.st && t.st.ask);')) {
    await ev(h, 'SH.nav("left"); return true;'); await advance(h, 0.1);
    await ev(h, 'SH.nav("confirm"); return true;'); await advance(h, 0.4);
  }
  await mustReach(h, `SH.mod.Save.seq !== ${JSON.stringify(before)} && !SH.mod.Menus.isOpen()`, 20, 'the save written', { step: 0.2 });
  await settle(h, P, notes);
  await saw(h, 'Progress saved.', notes, 'the payphone');
  notes.push(`saved slot ${slot + 1} in ${await ev(h, 'return SH.mod.World.room')} (F ${await ev(h, 'return SH.S.F')}, A ${await ev(h, 'return SH.S.A')})`);
}
async function reload(h, P, notes, slot) {
  await ev(h, `SH.mod.Game.continueFrom(${slot}); return true;`);
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, 'the loaded game');
  await advance(h, 0.6);
  await settle(h, P, notes);
  notes.push(`reloaded slot ${slot + 1} → ${await ev(h, 'return SH.mod.World.room')} (F ${await ev(h, 'return SH.S.F')}, A ${await ev(h, 'return SH.S.A')}, luka5 ${await ev(h, 'return (SH.S.calls && SH.S.calls.luka5) || "—"')})`);
}

// a Tethered: a few real swings, then the Enemies API to down it; cut it free (hold E with the box cutter) or stomp it
async function resolveTethered(h, P, notes, id, cut, o = {}) {
  const done = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (done) return done;
  const st = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? { x: e.pos.x, z: e.pos.z } : null;`);
  if (!st) throw new Error('no Tethered ' + id);
  const r = (o.from ?? 0) * Math.PI / 180, ax = st.x + Math.sin(r) * 1.25, az = st.z + Math.cos(r) * 1.25, face = ((o.from ?? 0) + 180) % 360;
  await equip(h, 'box_cutter');
  await tp(h, ax, az, face);
  await ev(h, `SH.press('ready', 600); return true;`);
  for (let k = 0; k < 5; k++) {
    if (await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || e.downed || e.resolved || e.hp <= 0;`)) break;
    await press(h, 'attack', 0, 0.55);
  }
  await ev(h, 'SH.mod.Input.releaseAll(); return true;');
  await advance(h, 0.2);
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); return true;`);
  await advance(h, 0.4);
  await tp(h, ax, az, face);
  if (cut) await holdAction(h, 'interact', 2.6);
  else await press(h, 'interact', 0, 1.0);
  await advance(h, 0.6);
  const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res !== (cut ? 'freed' : 'dead')) throw new Error(`Tethered ${id}: expected ${cut ? 'freed' : 'dead'}, got ${res}`);
  notes.push(`${id} ${res}`);
  await heal(h);
  await settle(h, P, notes);
  return res;
}
// a Reach standing in the way: a few real swings of the bar from beside it, the Enemies API to finish it, E to stomp
async function resolveReach(h, P, notes, id) {
  const st = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? { x: e.pos.x, z: e.pos.z } : null;`);
  if (!st) return null;
  await equip(h, 'steel_bar');
  const spot = await ev(h, `for (const [dx, dz, yaw] of [[1.4, 0, -90], [-1.4, 0, 90], [0, -1.4, 0], [0, 1.4, 180]]) { const x = ${st.x} + dx, z = ${st.z} + dz; if (SH.mod.World.pointFree(x, z, 0.3)) return [x, z, yaw]; } return [${st.x} + 1.4, ${st.z}, -90];`);
  await tp(h, ...spot);
  await ev(h, "SH.press('ready', 600); return 1");
  for (let k = 0; k < 3; k++) await press(h, 'attack', 0, 1.1);
  await ev(h, 'SH.mod.Input.releaseAll(); return 1');
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.resolved && !e.downed) e.damage(Math.max(1, e.hp), 'steel_bar'); return 1`);
  await advance(h, 0.6);
  const at = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? [e.pos.x, e.pos.z] : null;`);
  if (at) { await tp(h, at[0] + (spot[0] - st.x) * 0.7, at[1] + (spot[1] - st.z) * 0.7, spot[2]); await press(h, 'interact', 0, 1.0); }
  let res = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || e.resolved || null;`);
  if (!res) { await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e) SH.mod.Enemies.kill(e); return 1`); res = 'killed (API)'; }
  notes.push(`${id}: ${res}`);
  await heal(h);
  await settle(h, P, notes);
  return res;
}

// ---- 5A/5B the ring road, the forecourt, the lobby -------------------------------------------------------------------
async function ringRoad(h, P, notes, opts) {
  await shot(h, opts, 'ringroad');
  // a real walk up the south arm from the business-park gate, then (a 120 m street) on to the forecourt's kerb
  if (!(await walkTo(h, 1.2, 60.5, { maxSec: 12, tol: 0.8 }))) notes.push('BUG: could not walk up the ring road from the business-park gate');
  if (P.examine) { await useAt(h, P, notes, -7.9, 51.4, 0); await saw(h, 'Every price is just dashes.', notes, 'the servo pylon'); }
  await tp(h, 49.8, -5.8, 180);
  if (!(await walkTo(h, 49.8, -9.3, { maxSec: 8, until: "SH.mod.World.room === 'c5_forecourt'" }))) throw new Error('walking into the forecourt never left the ring road: ' + JSON.stringify(await snap(h)));
  await mustReach(h, "SH.mod.World.room === 'c5_forecourt' && !SH.mod.World.transitioning", 10, 'the forecourt');
  await settle(h, P, notes);
}
async function forecourt(h, P, notes, opts) {
  await shot(h, opts, 'forecourt');
  if (!(await walkTo(h, 16, 9.5, { maxSec: 12 }))) notes.push('BUG: could not walk across the forecourt');
  await useAt(h, P, notes, 7.0, 18.2, -129, { play: true });         // the monolith: EXAMINE → "Every day."
  await saw(h, '"Regional Office — Excellence Every Day"', notes, 'the tower sign');
  await saw(h, 'Every day.', notes, 'the tower sign');
  if (P.examine) { await useAt(h, P, notes, 21.2, 2.75, 180); await saw(h, 'PLEASE USE THE REVOLVING DOOR', notes, 'the locked side door'); }
  await door(h, P, notes, 16, 3.4, 180, 'c5_lobby');                  // the revolving door
  await settle(h, P, notes);
}
async function lobby(h, P, notes, opts, st) {
  await shot(h, opts, 'lobby');
  if (!(await walkTo(h, 11.2, 10.4, { maxSec: 10 }))) notes.push('BUG: could not walk into the lobby from the revolving door');
  const has = (id) => ev(h, `return SH.S.inv.some((i) => i && i.id === ${JSON.stringify(id)})`);
  if (!(await ev(h, 'return !!SH.S.flags.c5_pass'))) {
    await useAt(h, P, notes, 7.4, 13.3, -141, { play: true });         // the rankings screen
    await saw(h, "She's always at the top.", notes, 'the rankings screen');
    if (!(await has('map_office'))) { await useAt(h, P, notes, 0.95, 9.6, -90); if (!(await has('map_office'))) notes.push('BUG: no Regional Office Directory (map_office) from the lobby wall'); }
    if (!(await ev(h, "return !!(SH.S.taken && SH.S.taken['c5_lobby:firstaid'])"))) { await useAt(h, P, notes, 22.25, 11.55, 180); if (!(await ev(h, "return !!(SH.S.taken && SH.S.taken['c5_lobby:firstaid'])"))) notes.push('BUG: the first aid kit on the security desk was not picked up'); }
    if (opts.saveLoad && !st.saved) { await payphoneSave(h, P, notes, 0, [0.9, 13.4, -90]); st.saved = true; }
    await useAt(h, P, notes, 11.2, 8.0, 180);                          // the gates without a pass
    await saw(h, 'The gates need a pass.', notes, 'the speed gates');
    await useAt(h, P, notes, 18.6, 11.65, 180, { play: true });        // the visitor-pass printer
    await saw(h, '"AIDAN — VISITING: ESCALATIONS"', notes, 'the visitor pass printer');
    if (!(await has('visitor_pass')) || !(await ev(h, 'return !!SH.S.flags.c5_pass'))) throw new Error('the printer did not print the visitor pass');
  }
  // through lane four with real keys, the dead lifts, Stairwell A's door
  await tp(h, 12.04, 8.6, 180);
  if (!(await walkTo(h, 12.04, 5.6, { maxSec: 8, tol: 0.35 }))) throw new Error('could not walk through the open speed gate: ' + JSON.stringify(await snap(h)));
  await useAt(h, P, notes, 13.9, 1.3, 180, { play: true });            // the lift call button
  await saw(h, '"OUT OF SERVICE"', notes, 'the lift button');
  await saw(h, 'Stairs, then.', notes, 'the lift button');
  if (!(await walkTo(h, 21.9, 0.85, { maxSec: 12 }))) notes.push('BUG: could not walk from the gates to the stairwell door');
  await door(h, P, notes, 21.9, 0.8, 180, 'c5_stairs');
  await settle(h, P, notes);
}

// ---- 5C Stairwell A: CUTSCENE 5-1 on the Level 2 landing, then the climb with the Standard behind -----------------------
const FLOOR = [[0.65, 5.0], [0.65, 1.2], [2.3, 0.72], [3.95, 1.6], [3.95, 5.35], [2.3, 5.9]];   // one storey: south landing → next
async function stairs(h, P, notes, opts) {
  await shot(h, opts, 'stairs_g');
  if (!(await ev(h, "return !!SH.S.done['cs:5-1']"))) {
    // up the first storey until 5-1 takes over on the Level 2 landing
    await walkPath(h, FLOOR, 'Stairwell A, ground → Level 2', { until: "SH.mod.Script.cutscene || !!SH.S.done['cs:5-1']", tol: 0.4 });
    await mustReach(h, "!!SH.S.done['cs:5-1']", 10, 'CUTSCENE 5-1 on the Level 2 landing');
    await shot(h, opts, 's51');
    await settle(h, P, notes);
    if (!(await ev(h, 'return !!SH.S.flags.c5_chase'))) throw new Error('5-1 did not start the chase (c5_chase)');
    if (!(await ev(h, "return !!SH.mod.Enemies.get('c5_stairs:standard')"))) notes.push('BUG: no Standard in the stairwell after 5-1');
  }
  // the rest of the climb: whatever flight 5-1 left him on, up to the Level 4 landing (y 10.8)
  const level = () => ev(h, 'return SH.mod.Player.pos.y');
  if ((await level()) > 3.0 && (await level()) < 5.3 && (await ev(h, 'return SH.mod.Player.pos.z')) < 5.0) {
    await walkPath(h, FLOOR.slice(1), 'Stairwell A, the flight after 5-1', { heal: true });
  }
  if (P.examine && Math.abs((await level()) - 7.2) < 0.3) {
    // on the Level 3 landing: its door is locked (a rattle, "Locked.")
    await walkTo(h, 2.3, 5.95, { maxSec: 6, tol: 0.3 });
    await ev(h, 'SH.mod.Player.face(0); return 1'); await advance(h, 0.3);
    await press(h, 'interact', 0, 0.6);
    await settle(h, P, notes);
    await saw(h, 'Locked.', notes, 'the Level 3 door');
  }
  for (let guard = 0; guard < 4 && (await level()) < 10.6; guard++) await walkPath(h, FLOOR, 'Stairwell A, climbing', { heal: true });
  if ((await level()) < 10.6) throw new Error('never reached the Level 4 landing: ' + JSON.stringify(await snap(h)));
  const std = await ev(h, "const e = SH.mod.Enemies.get('c5_stairs:standard'); return e && !e.removed ? +e.pos.y.toFixed(1) : null");
  notes.push(`Stairwell A climbed (the Standard at y ${std}, health ${await ev(h, 'return Math.round(SH.S.health)')})`);
  await shot(h, opts, 'stairs_l4');
  await door(h, P, notes, 2.3, 6.0, 0, 'c5_level4');
}

// ---- 5D/5E Level 4: CALL 5, the Tethered, the Borrowed, Huddle 3, the examines, the print room -------------------------
async function borrowed(h, P, notes) {
  const id = 'c5_level4:chloe';
  if (P.borrowed === 'avoid') { notes.push('the Borrowed "Chloe": left alone'); return; }
  if (await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`)) return;
  if (!(await ev(h, `return !!SH.mod.Enemies.get(${JSON.stringify(id)})`))) throw new Error('no Borrowed "Chloe" on Level 4');
  await equip(h, 'steel_bar');
  await tp(h, 5.1, 15.6, -90);                                         // behind her in the aisle; she types on
  let s = await snap(h);
  for (let k = 0; k < 40 && !s.choosing; k++) { await advance(h, 0.25); s = await snap(h); }
  if (!s.choosing) {
    await tp(h, 3.3, 15.6, -90);
    await press(h, 'interact', 0, 0.3);
    await mustReach(h, 'SH.mod.Script.choosing', 15, 'the Borrowed conversation', { step: 0.1 });
  }
  if (!(await ev(h, "return (window.__c5lines || []).some((l) => l.includes('CHOICE[Talk|Examine|Step back]'))"))) notes.push('MISSING choice labels (the Borrowed): Talk / Examine / Step back');
  const hp0 = await ev(h, 'return SH.S.health');
  if (P.borrowed === 'examine') {
    await choose(h, 1);
    await mustReach(h, 'SH.mod.Script.choosing', 20, 'the choice again after Examine', { step: 0.1 });
    await saw(h, 'The badge says CHLEO.', notes, 'the Borrowed examine');
    await saw(h, "And there's a hospital band on her wrist.", notes, 'the Borrowed examine');
    await choose(h, 2);
  } else {
    await choose(h, 0);
  }
  await advanceUntil(h, `(() => { const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || !e.disguised; })()`, 4, { step: 0.1 });
  await advance(h, P.borrowed === 'examine' ? 0.3 : 1.4);
  const hp1 = await ev(h, 'return SH.S.health');
  if (P.borrowed === 'talk') { await saw(h, 'Hi! Welcome in!', notes, 'the Borrowed talk'); if (hp0 - hp1 < 12) notes.push('BUG: Talk first did not grab (no damage)'); }
  if (P.borrowed === 'examine' && hp1 < hp0) notes.push('BUG: Examine + Step back still hurt');
  if (await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !!(e && e.disguised);`)) throw new Error('the Borrowed never revealed itself');
  // the fight: real swings of the bar, then the API
  await ev(h, "SH.press('ready', 600); return true;");
  for (let k = 0; k < 3; k++) await press(h, 'attack', 0, 1.1);
  await ev(h, 'SH.mod.Input.releaseAll(); return true;');
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.resolved && e.hp > 0) e.damage(e.hp + 5, 'steel_bar'); return true;`);
  await advance(h, 1.2);
  const d = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? { x: e.pos.x, z: e.pos.z, down: !!e.downed } : null`);
  if (d && d.down) { await tp(h, d.x + 1.0, d.z, -90); await press(h, 'interact', 0, 1.2); }
  if (!(await advanceUntil(h, `SH.S.spawns[${JSON.stringify(id)}] === 'dead' || !SH.mod.Enemies.get(${JSON.stringify(id)}) || SH.mod.Enemies.get(${JSON.stringify(id)}).resolved`, 10))) {
    await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e) SH.mod.Enemies.kill(e); return 1`);
    notes.push('the Borrowed finished with the API');
  }
  notes.push(`the Borrowed "Chloe": ${P.borrowed} (health ${Math.round(hp0)} → ${Math.round(hp1)})`);
  await heal(h);
  await settle(h, P, notes);
}
async function level4(h, P, notes, opts) {
  await shot(h, opts, 'level4');
  // CALL 5 rings as he arrives — the Standard coming up the stairwell behind him
  if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka5)'))) {
    await mustReach(h, "SH.mod.Phone.ringing === 'luka5' || !!(SH.S.calls && SH.S.calls.luka5)", 25, 'Luka call 5 ringing on Level 4');
    await shot(h, opts, 'call5');
    await settle(h, P, notes, { play: true });
    const c = await ev(h, 'return SH.S.calls.luka5');
    if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka5 ended as ' + c);
    if (P.answer) { await saw(h, 'I can hear keys.', notes, 'luka5'); await saw(h, 'Is that you?', notes, 'luka5'); }
  }
  await saw(h, "The lights are on. Nobody's here.", notes, 'arriving on Level 4');
  await mustReach(h, '!!SH.mod.Enemies.standard.active', 20, 'the Standard roaming Level 4');
  notes.push('the Standard roams Level 4');
  // the Tethered at the north windows (approached from the room side)
  await resolveTethered(h, P, notes, 'c5_level4:teth', P.cut, { from: 0 });
  // the examines the spec names: the desk photo frames, the escalations door, the projector
  await useAt(h, P, notes, 7.4, 16.9, 180, { play: true });            // the desk with the kid's drawing (63%)
  await saw(h, "Somebody's kid drew a picture on this desk. Their mum's a sixty-three.", notes, 'the desk photo frames');
  await useAt(h, P, notes, 3.0, 5.8, 180, { play: true });              // the escalations office door
  await saw(h, 'Keycard only.', notes, 'the escalations door');
  await useAt(h, P, notes, 31.6, 18.3, 140, { play: true });            // meeting room "Summit": the projector
  await saw(h, '"Q3: WHAT DOES WINNING LOOK LIKE?"', notes, 'the projector');
  await saw(h, "Winning looks like everyone's asleep.", notes, 'the projector');
  await borrowed(h, P, notes);
  if (P.huddle && !(await ev(h, 'return !!(SH.S.docs && SH.S.docs.huddle3)'))) {
    await useAt(h, P, notes, 10.0, 26.4, -53);
    if (!(await ev(h, 'return !!(SH.S.docs && SH.S.docs.huddle3)'))) notes.push('BUG: Huddle Whiteboard 3 could not be read on the regional huddle board');
  }
  if (P.brk && !(await ev(h, "return !!SH.S.done['break:ch5']"))) {
    await ev(h, 'SH.mod.Player.damage(30, "test"); return 1');
    const s1 = await useAt(h, P, notes, 31.9, 4.75, 180, { play: true });
    if (s1.choosing) { await choose(h, 0); await settle(h, P, notes, { play: true }); }
    const hp = await ev(h, 'return SH.S.health');
    notes.push(`the fifteen-minute break: health ${Math.round(hp)}`);
    if (hp < 100) notes.push('BUG: the fifteen-minute break did not heal fully');
    await saw(h, 'Fifteen-minute break.', notes, 'the break table');
  }
  if (P.examine) {
    for (const [x, z, yaw, id] of [[32.6, 1.3, 180, 'c5_level4:coffee'], [22.3, 27.6, 0, 'c5_level4:energy']]) {
      await useAt(h, P, notes, x, z, yaw);
      if (!(await ev(h, `return !!(SH.S.taken && SH.S.taken[${JSON.stringify(id)}])`))) notes.push(`BUG: ${id} was not picked up`);
    }
  }
  // the print room: slow, careful breathing through the door
  if (!(await ev(h, "return SH.mod.Snd && true"))) { /* audio is optional in the harness */ }
  await door(h, P, notes, 31.1, 27.5, 90, 'c5_print');
}
async function printRoom(h, P, notes, opts) {
  await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.flags.c5_chloe", 8, 'CUTSCENE 5-2 starting in the print room');
  await shot(h, opts, 's52');
  await settle(h, P, notes);
  if (!(await ev(h, 'return !!SH.S.flags.c5_chloe && !!SH.S.outage'))) throw new Error('5-2 did not end in the Outage');
  if (P.play) {
    for (const l of ['Chloe?', 'Hi! Sorry. Sorry. I just— I needed a minute.', 'Can you keep watch? Just for a minute.', 'I was going to submit my month.',
      "Eleven short. I've never been short. Thirty months.", "You know what happens the first month you're not number one?", '...Nothing?', 'Nothing.',
      "That's the thing. Nothing. And then it's just... me. With no number on it.", "You're the best rep I've ever seen.", "I'm the best rep you've seen in six months.",
      'I taught you to always offer the bundle.', 'Yeah.', "Did you? Offer it? To her? The one you're looking for?", '...Yeah.', "I'm sorry.",
      'I never said check what they actually need first. I never said that. I just said the bundle.', "It's not your fault.", "It's not all yours either.",
      "Oh. That's me.", "They're calling the numbers.", 'Chloe, wait—']) await saw(h, l, notes, '5-2');
  }
  await shot(h, opts, 'print_outage');
  // her pin on the floor (+ Chloe's Pin), the receipt map in the copier's tray
  await useAt(h, P, notes, 1.55, 3.15, -150);
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'chloe_pin')"))) notes.push("BUG: Chloe's Top Performer pin could not be picked up in the print room");
  if (!(await ev(h, 'return !!(SH.S.docs && SH.S.docs.chloe_pin)'))) notes.push("BUG: Chloe's Pin (doc) was not added when picking up the pin");
  await useAt(h, P, notes, 4.0, 1.4, 90);
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'rmap_office')"))) notes.push('BUG: no receipt map (rmap_office) from the copier');
  await door(h, P, notes, 0.6, 2.1, -90, 'c5_level4');
}

// ---- 5-4 the Outage floor, the feature stair, the atrium: CUTSCENE 5-3 → the Pedestal → 5-4 / 5-4alt → CALL 6 ------------
async function outageFloor(h, P, notes, opts) {
  await settle(h, P, notes);
  await shot(h, opts, 'l4_outage');
  // the Reach in the south zone would be on him the whole way: put it down first (the chapter's fight is the Pedestal)
  await resolveReach(h, P, notes, 'c5_level4:reach');
  await tp(h, 29.0, 27.2, -90);
  // west along the south zone, north up the west walkway, onto the feature stair — with real keys
  const inAtrium = "SH.mod.World.room === 'c5_atrium'";
  const ok = await (async () => {
    try { await walkPath(h, [[28.2, 23.4], [12.2, 23.3], [12.2, 7.3], [14.15, 7.25], [14.15, 11.4]], 'the Outage floor to the feature stair', { run: true, heal: true, until: inAtrium, maxSec: 30 }); return true; }
    catch (e) { notes.push('BUG: the Outage floor could not be walked to the feature stair: ' + e.message.split('\n')[0]); return false; }
  })();
  if (!ok || !(await ev(h, `return ${inAtrium}`))) {
    await tp(h, 14.15, 9.0, 0);
    await walkTo(h, 14.15, 11.4, { maxSec: 6, until: inAtrium });
  }
  await mustReach(h, "SH.mod.World.room === 'c5_atrium' && !SH.mod.World.transitioning", 10, 'the atrium (feature stair)');
  await settle(h, P, notes);
}
async function pedestal(h, P, notes, opts) {
  await shot(h, opts, 'atrium');
  // down the feature stair with real keys: 5-3 at its foot
  if (!(await walkTo(h, 14.15, 20.6, { maxSec: 20, until: "SH.mod.Script.cutscene || !!SH.S.done['cs:5-3']" }))) throw new Error('walking down the feature stair did not start 5-3: ' + JSON.stringify(await snap(h)));
  await shot(h, opts, 's53');
  if (P.play) {
    await mustReach(h, '!SH.mod.Script.cutscene', 40, '5-3 playing through');
    await saw(h, 'Welcome in!', notes, '5-3');
  } else {
    for (let k = 0; k < 20 && (await ev(h, 'return !!SH.mod.Script.cutscene')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.4); }
  }
  await mustReach(h, "!!SH.mod.Enemies.get('c5_atrium:plinth0') && SH.mod.Player.control !== false", 20, 'the Pedestal fight');
  await saw(h, 'Break the plinths at its base.', notes, 'the boss objective');
  await shot(h, opts, 'boss');
  await equip(h, 'steel_bar');
  const repsNear = () => ev(h, 'const P = SH.mod.Player.pos; let n = 0; for (let k = 1; k < 200; k++) { const e = SH.mod.Enemies.get("c5_atrium:rep#" + k); if (e && !e.resolved && !e.removed && e.pos.y < 0.3 && Math.hypot(e.pos.x - P.x, e.pos.z - P.z) < 2.2) { SH.mod.Enemies.kill(e); n++; } } return n;');
  let reps = 0, swings = 0;
  for (let i = 0; i < 6; i++) {
    const pl = await ev(h, `const e = SH.mod.Enemies.get('c5_atrium:plinth${i}'); return e && !e.removed && !e.resolved ? [e.pos.x, e.pos.z] : null`);
    if (!pl) continue;
    const dx = pl[0] - 20, dz = pl[1] - 15.2, d = Math.hypot(dx, dz), ax = pl[0] + dx / d * 1.15, az = pl[1] + dz / d * 1.15;
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
    for (let k = 0; k < 10; k++) {
      if (!(await ev(h, `const e = SH.mod.Enemies.get('c5_atrium:plinth${i}'); return !!(e && !e.removed && !e.resolved)`))) break;
      await tp(h, ax, az, yaw);
      await ev(h, "SH.press('ready', 600); return 1");
      await advance(h, 0.15);
      await press(h, 'attack', 0, 1.2);
      swings++;
      await ev(h, 'SH.mod.Input.releaseAll(); return 1');
      reps += await repsNear();
      if ((await ev(h, 'return SH.S.health')) < 55) await heal(h);
      if ((await ev(h, 'return SH.mode')) === 'death') throw new Error('Aidan died in the Pedestal fight');
    }
    if (await ev(h, `const e = SH.mod.Enemies.get('c5_atrium:plinth${i}'); return !!(e && !e.removed && !e.resolved)`)) throw new Error(`plinth ${i} would not break with the bar`);
    if (i === 4) {
      // five down: the tower is low enough to reach her
      await advance(h, 2.5);
      await saw(h, 'I could reach her.', notes, 'the fifth plinth');
      if (P.hitTop) {
        await tp(h, 20.0, 16.35, 180);
        await ev(h, "SH.press('ready', 600); return 1"); await advance(h, 0.1);
        await press(h, 'attack', 0, 1.2);
        await ev(h, 'SH.mod.Input.releaseAll(); return 1');
        if (!(await ev(h, 'return !!SH.S.flags.c5_hitTop'))) throw new Error('a swing at the lowered figure did not hit her (c5_hitTop)');
        notes.push('hit the figure at the top (chloeSaved false)');
      }
    }
  }
  notes.push(`the Pedestal: six plinths broken in ${swings} swings (${reps} crawling reps put down with the API)`);
  await mustReach(h, '!!SH.S.flags.c5_bossDone', 30, 'the Pedestal coming down');
  const saved = !P.hitTop;
  await mustReach(h, `SH.mod.Script.active === ${JSON.stringify(saved ? 'cs:5-4' : 'cs:5-4alt')} || !!SH.S.flags.c5_done`, 30, saved ? '5-4' : '5-4alt');
  await shot(h, opts, saved ? 's54' : 's54alt');
  await settle(h, P, notes);
  if (!(await ev(h, 'return !!SH.S.flags.c5_done'))) throw new Error('5-4 did not finish (c5_done)');
  if ((await ev(h, 'return !!SH.S.flags.chloeSaved')) !== saved) throw new Error('chloeSaved = ' + (await ev(h, 'return SH.S.flags.chloeSaved')));
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'keycard')"))) throw new Error('no Level 4 keycard after the Pedestal');
  if (P.play && saved) {
    for (const l of ['Huh.', 'Is it bad that this feels good? Being nothing for a minute?', "You're not nothing.", 'No.', "I'm eleven short.",
      "Escalations. That's what you're after, isn't it?", 'Aidan.', "Luka's here. He's upstairs. He's looking for you.", "...I can't.", "He's not who you think he is."]) await saw(h, l, notes, '5-4');
  }
  if (!saved && P.play) await saw(h, 'Welcome in.', notes, '5-4alt');
  notes.push(`5-4${saved ? '' : 'alt'}: chloeSaved ${saved}, keycard in hand`);
}
async function climbBack(h, P, notes, opts) {
  // back to the foot of the stair, then up it: CALL 6 on the way, the chapter card at the top
  await walkTo(h, 14.15, 21.1, { maxSec: 16 });
  await walkTo(h, 14.15, 12.2, { maxSec: 20, until: '!!SH.mod.Phone.ringing || !!(SH.S.calls && SH.S.calls.luka6) || SH.S.chapter === 6' });
  if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka6)'))) {
    await mustReach(h, "SH.mod.Phone.ringing === 'luka6' || !!(SH.S.calls && SH.S.calls.luka6)", 20, 'Luka call 6 on the stair');
    await shot(h, opts, 'call6');
    await settle(h, P, notes, { play: true });
  }
  const c = await ev(h, 'return SH.S.calls.luka6');
  if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka6 ended as ' + c);
  if (P.answer) { await saw(h, 'Is Chloe with you?', notes, 'luka6'); await saw(h, "Tell her she can stop now. Tell her it's okay.", notes, 'luka6'); }
  if (!(await walkTo(h, 14.15, 10.9, { maxSec: 20, until: 'SH.S.chapter === 6' }))) throw new Error('reaching the top of the stair did not start Chapter 6: ' + JSON.stringify(await snap(h)));
  await mustReach(h, "SH.S.chapter === 6 && SH.mod.World.room === 'c5_level4' && !SH.mod.World.transitioning", 60, 'Chapter 6 on Level 4');
  await saw(h, 'THE MIDDLE', notes, 'the chapter card');
  await advance(h, 0.5);
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = { ...(PATHS[path] || PATHS.connected), __opts: opts };
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 5) throw new Error('ch5.play: not at Chapter 5: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if (!opts.resume && (await ev(h, 'return SH.mod.World.room')) !== 'c5_ringroad') throw new Error('ch5.play: expected to start on the ring road');
  const F0 = start.F, A0 = start.A;
  const st = { saved: false, reloaded: false };
  const room = () => ev(h, 'return SH.mod.World.room');
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);

  for (let pass = 0; pass < 4; pass++) {
    if ((await room()) === 'c5_ringroad') await ringRoad(h, P, notes, opts);
    if ((await room()) === 'c5_forecourt') await forecourt(h, P, notes, opts);
    if ((await room()) === 'c5_lobby') await lobby(h, P, notes, opts, st);
    if ((await room()) === 'c5_stairs') await stairs(h, P, notes, opts);
    if ((await room()) === 'c5_level4' && !(await flag('c5_chloe'))) {
      if (opts.saveLoad && st.saved && !st.reloaded) {
        // mid-chapter: CALL 5 has rung and the Standard is roaming — reload the lobby save and play on from there
        await mustReach(h, "!!(SH.S.calls && SH.S.calls.luka5) || SH.mod.Phone.ringing === 'luka5'", 25, 'Luka call 5 before the reload');
        await settle(h, P, notes, { play: true });
        st.reloaded = true;
        await reload(h, P, notes, 0);
        if ((await room()) !== 'c5_lobby') throw new Error('the lobby save reloaded into ' + (await room()));
        if (await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka5)')) notes.push('BUG: the reload kept CALL 5 (it was answered after the save)');
        continue;
      }
      await level4(h, P, notes, opts);
    }
    if ((await room()) === 'c5_print') await printRoom(h, P, notes, opts);
    if ((await room()) === 'c5_level4' && (await flag('c5_outage'))) await outageFloor(h, P, notes, opts);
    if ((await room()) === 'c5_atrium') {
      if (!(await flag('c5_done'))) await pedestal(h, P, notes, opts);
      await climbBack(h, P, notes, opts);
    }
    if ((await ev(h, 'return SH.S.chapter')) === 6) break;
  }
  const end = await snap(h);
  if (end.chapter !== 6) throw new Error('ch5.play: Chapter 6 never started: ' + JSON.stringify(end));
  const S = await ev(h, `const S = SH.S; return { flags: { ...S.flags }, calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c5_'))), health: S.health, inv: S.inv.map((i) => i.id + '×' + i.n).join(' '), outage: !!S.outage };`);
  if (S.outage) notes.push('BUG: Chapter 6 started in the Outage');
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `spawns: ${JSON.stringify(S.spawns)}`);
  return { chapter: 5, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

// =====================================================================================================================
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(5); return 1');
  await mustReach(h, "SH.mod.World.room === 'c5_ringroad' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'the ring road');
  await clearLines(h).catch(() => null);
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected / coverage answer calls 5 and 6 (F+2 each) and cut the Tethered free (F+1);
  // tomorrow declines both (A+2 each) and stomps it (A+1). Nothing else in Chapter 5 tracks.
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [5, 0], deal: [5, 0], coverage: [5, 0], tomorrow: [0, 5] }[cfg.path];
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const fateOk = !!r.flags.chloeSaved === !(PATHS[cfg.path] || PATHS.connected).hitTop;
  if (!fateOk) r.notes.push(`BUG: chloeSaved ${r.flags.chloeSaved} on the ${cfg.path} path`);
  const ok = st.ch === 6 && st.room === 'c5_level4' && trackOk && fateOk && !errs.length && !bugs.length;
  report(`ch5 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} chloeSaved=${!!r.flags.chloeSaved} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH5_PATH;
  const shots = process.env.CH5_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH5_RIDDLE || 'normal', saveLoad: process.env.CH5_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch5 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch5_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  return all;
}
