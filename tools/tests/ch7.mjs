// tools/tests/ch7.mjs — Chapter 7 "District Hospital" played start to finish (spec §11 Chapter 7 + Luka call 8, §7B District
// Hospital, §6 the Smile, §4 Face/Avoid: Luke's voicemails, the standoff; CONTENT_PLAN §2 / §8).
//
//   node tools/build.mjs --out .build/c7.html && node tools/run.mjs --file .build/c7.html --script tools/tests/ch7.mjs
//   env: CH7_PATH=connected|coverage|tomorrow|deal  CH7_RIDDLE=easy|normal|hard  CH7_SAVELOAD=1  CH7_SHOTS=<dir>
//        CH7_STAND=step|talk|run CH7_HITS=<chaseHits>   (standoff branch coverage: forces the 7-3 pick and Chase's hits)
//   With no CH7_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 7 as a real player arrives (S.chapter === 7, Aidan on
// Ring Road east where the drop used to be, carrying the box cutter and the bar). It never resets state. It plays the
// critical path with the real mechanics: the ring road walked with real keys (the "That wasn't there before." trigger),
// the car park, the doors (teleport beside them + E), the §2A payphone save, the visitor book / directory / feedback
// board / vending machine, the Tethered ×2 in the waiting room cut free (hold E with the box cutter) or stomped, the
// tea-room break table, walking into the corridor (CUTSCENE 7-1), the Smile store (a Smile's touch: SIGNED, 20 damage,
// pushed back), the PA microphone (the choice, 7-page, the doorways clear for 30 s, walking through a Ward 3 door),
// CUTSCENE 7-2 (the [Listen] / [Turn away] choice, the flashback) chained into 7-3 (the timed choice), walking back in to
// Room 12 (CUTSCENE 7-4), Luka's call 8 answered / declined with E / Q on stepping out, and the Summit Road gate with
// real keys, until Chapter 8 has started on Summit Road.
// Decisions follow opts.path:
//   connected — answer Luka, cut both Tethered free, [Listen], [Step between them] (both saved while chaseHits < 4);
//               examines, the break table, the store walked with real keys; 7-1, 7-page, 7-2, 7-3, 7-4 play through
//   coverage  — like connected but loses Chase: [Step between them] with chaseHits ≥ 4 (Chase swings, runs), else [Talk
//               him down] with chaseHits ≥ 2, else [Run]; scenes skipped
//   tomorrow  — decline Luka, stomp both Tethered, [Turn away], the standoff timer runs out (= [Run]); scenes skipped
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the reception payphone (the chapter's first), do the waiting room and the tea room, reload that
// slot (Game.continueFrom) and play on (the waiting room again: the Tethered are back as they were at the save).
// → { chapter: 7, F, A, flags, calls, spawns, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: true, listen: true, stand: 'face', play: true, examine: true, walk: true, rest: true },
  coverage: { answer: true, cut: true, listen: true, stand: 'lose', play: false, examine: false, walk: false, rest: false },
  tomorrow: { answer: false, cut: false, listen: false, stand: 'timeout', play: false, examine: false, walk: false, rest: false },
};
PATHS.deal = PATHS.connected;

// ---- the connections: [from, to, x, z, yaw, kind] — 'door': stand there facing it and press E; 'walk': stand there and
// walk (real keys) toward [x2, z2] into the exit box
const HOPS = [
  ['c7_ringroad', 'c7_carpark', 93.4, 0, 90, 'walk', 97, 0],
  ['c7_carpark', 'c7_ringroad', 8, 28.2, 0, 'walk', 8, 31],
  ['c7_carpark', 'c7_reception', 19.4, 0.9, 180],
  ['c7_reception', 'c7_carpark', 8, 11.2, 0],
  ['c7_reception', 'c7_waiting', 0.8, 7.2, -90],
  ['c7_waiting', 'c7_reception', 11.2, 5, 90],
  ['c7_reception', 'c7_tearoom', 3, 0.8, 180],
  ['c7_tearoom', 'c7_reception', 4.5, 4.2, 0],
  ['c7_reception', 'c7_corridor', 15.2, 5, 90],
  ['c7_corridor', 'c7_reception', 0.8, 2, -90],
  ['c7_corridor', 'c7_nurses', 0.8, -20, -90],
  ['c7_nurses', 'c7_corridor', 7.2, 3.5, 90],
  ['c7_nurses', 'c7_ward3', 4.0, 0.9, 180, 'walk', 4.0, -1.2],
  ['c7_ward3', 'c7_nurses', 1.5, -1.1, 0, 'walk', 1.5, 0.6],
  ['c7_ward3', 'c7_room12', 1.5, -29.2, 180],
  ['c7_room12', 'c7_ward3', 1.2, 3.2, 0],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, menu: M.Menus.isOpen() ? M.Menus.current : null, ready: !!(M.Menus._top && M.Menus._top.ready),
  mode: SH.mode, chapter: S.chapter, F: S.F, A: S.A, hp: S.health, ctl: M.Player.control !== false, pmode: M.Player.mode,
  store: !!S.flags.c7_store, pinning: !!(SH.c7 && SH.c7.pinning),
  pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.y.toFixed(2), +M.Player.pos.z.toFixed(2)], cam: SH.state().cam };`);

// record every subtitle / message / card / choice / stamp (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c7spy) { window.__c7spy = true; window.__c7lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say', 'choice', 'prompt', 'stamp', 'titleText', 'textOnBlack']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c7lines.push(fn[0] + ':' + a.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? 'CHOICE[' + x.map((y) => (typeof y === 'string' ? y : (y && (y.label || y.text)) || '')).join('|') + ']' : (x && typeof x.text === 'string' ? x.text : x && typeof x.title === 'string' ? 'TITLE[' + x.title + ']' : ''))).filter(Boolean).join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
const mark = (h) => ev(h, 'return (window.__c7lines || []).length');
// (a line with [beat]s is shown as its parts, in order: each part must have been shown)
const parts = (text) => String(text).split(/\s*\[(?:long )?beat\]\s*/).filter(Boolean);
async function saw(h, text, notes, where, since = 0) {
  const ok = await ev(h, `const L = (window.__c7lines || []).slice(${since}); return ${JSON.stringify(parts(text))}.every((p) => L.some((l) => l.includes(p)))`);
  if (!ok) notes.push(`MISSING line (${where}): ${text}`);
  return ok;
}
async function sawAll(h, lines, notes, where, since = 0) { for (const l of lines) await saw(h, l, notes, where, since); }
async function awaitLine(h, text, notes, where, maxSec = 6) {
  const ok = await advanceUntil(h, `${JSON.stringify(parts(text))}.every((p) => (window.__c7lines || []).some((l) => l.includes(p)))`, maxSec, { step: 0.2 });
  if (!ok) notes.push(`MISSING line (${where}): ${text}`);
  return ok;
}
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
  await advance(h, 0.25);
}
const heal = (h) => ev(h, 'await SH.run(async (G) => { G.heal(100); }); return SH.S.health;');
async function shot(h, opts, name) {
  if (!opts || !opts.shots) return;
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c7_${name}.png`); } catch (e) { /* optional */ }
}
// advance until `pred`, closing any reading view a scene opens; with opts.shots, a screenshot every `every` game seconds
async function playUntil(h, pred, maxSec, what, o = {}) {
  const each = "if (SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc' && SH.mod.Menus._top && SH.mod.Menus._top.ready) SH.nav('cancel');";
  if (o.opts && o.opts.shots && o.every) {
    for (let t = 0, k = 0; t < maxSec; t += o.every, k++) {
      if (await advanceUntil(h, pred, o.every, { step: 0.25, each })) return;
      await shot(h, o.opts, `${o.name}_${String(k).padStart(2, '0')}`);
    }
    throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
  }
  if (!(await advanceUntil(h, pred, maxSec, { step: 0.25, each }))) throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered / declined per
// path), a reading view (closed). Returns when the player has control, or when a choice waits.
async function settle(h, P, notes, o = {}) {
  for (let i = 0; i < (o.maxIter ?? 900); i++) {
    const s = await snap(h);
    if (s.mode !== 'play' && s.mode !== 'cutscene' && s.mode !== 'menu') { await advance(h, 0.3); continue; }
    if (s.menu) {
      if (s.menu === 'doc' || s.menu === 'items' || s.menu === 'map') { if (s.ready) await ev(h, 'SH.nav("cancel"); return true;'); await advance(h, 0.3); continue; }
      return s;
    }
    if (s.choosing) return s;
    if (s.ring && !s.inCall && !s.trans) {
      notes.push(`call ${s.ring}: ${P.answer ? 'answered' : 'declined'}`);
      await press(h, P.answer ? 'interact' : 'decline', 0, 0.4);
      continue;
    }
    if (s.trans || s.busy || s.inCall) {
      if (!(o.play ?? P.play) && s.skippable) { await ev(h, 'SH.skip(); return true;'); await advance(h, 0.4); }
      else await advance(h, 0.5);
      continue;
    }
    await advance(h, 0.15);
    const s2 = await snap(h);
    if (!s2.busy && !s2.trans && !s2.menu && !s2.choosing && !(s2.ring && !s2.inCall)) return s2;
  }
  throw new Error('settle: the game never handed control back: ' + JSON.stringify(await snap(h)));
}

async function goRoom(h, P, notes, to, o = {}) {
  for (let guard = 0; guard < 12; guard++) {
    const s = o.noSettle && guard > 0 ? await snap(h) : await settle(h, P, notes);
    if (s.room === to) return;
    const prev = new Map([[s.room, null]]);
    const q = [s.room];
    while (q.length && !prev.has(to)) {
      const r = q.shift();
      for (const hp of HOPS) if (hp[0] === r && !prev.has(hp[1])) { prev.set(hp[1], hp); q.push(hp[1]); }
    }
    if (!prev.has(to)) throw new Error(`goRoom: no way from ${s.room} to ${to}`);
    let hop = prev.get(to);
    while (hop[0] !== s.room) hop = prev.get(hop[0]);
    await takeHop(h, P, notes, hop);
    if (hop[1] === to && o.noSettle) return;
  }
  throw new Error('goRoom: too many hops to ' + to);
}
async function takeHop(h, P, notes, hop) {
  const [from, to, x, z, yaw, kind, x2, z2] = hop;
  const arrived = `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`;
  for (let tries = 0; tries < 4; tries++) {
    await tp(h, x, z, yaw);
    if (kind === 'walk') await walkTo(h, x2, z2, { maxSec: 10, until: arrived });
    else await press(h, 'interact', 0, 0.3);
    if (await advanceUntil(h, arrived, 8)) return;
    const s = await snap(h);
    if (s.room !== from) break;
    await settle(h, P, notes);
  }
  if (!(await ev(h, `return ${arrived}`))) throw new Error(`hop ${from} → ${to} did not work from ${x},${z}: ${JSON.stringify(await snap(h))}`);
}
async function useAt(h, P, notes, x, z, yaw, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, o.after ?? 0.4);
  return settle(h, P, notes, o);
}
// walk (real keys) through waypoints; a Smile's touch pushes him back a doorway — keep going (topping him up as a player
// would with what he carries). → true when the last point is reached
async function walkPath(h, P, notes, pts, what, o = {}) {
  for (const [x, z] of pts) {
    let ok = false;
    for (let tries = 0; tries < (o.tries ?? 3) && !ok; tries++) {
      ok = await walkTo(h, x, z, { maxSec: o.maxSec ?? 25, tol: o.tol ?? 0.5, run: o.run, until: `(SH.S.health < 55 ? (SH.mod.Player.heal(100), false) : false) || Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z}) < ${o.tol ?? 0.5}` });
      if (!ok) { const s = await settle(h, P, notes); if (o.room && s.room !== o.room) throw new Error(`walk (${what}) left ${o.room}: ${JSON.stringify(s)}`); }
    }
    if (!ok) return false;
  }
  return true;
}
// walk (real keys, running) to (x, z) along the engine's nav grid (Enemies.path), re-planning whenever a Smile's touch
// pushes him back a doorway (a player picks himself up and goes again). → { ok, pins }
async function navTo(h, P, notes, x, z, o = {}) {
  let pins = 0;
  for (let attempt = 0; attempt < (o.attempts ?? 8); attempt++) {
    const path = await ev(h, `const p = SH.mod.Player.pos; return SH.mod.Enemies.path(p.x, p.z, ${x}, ${z}) || [[${x}, ${z}]]`);
    let pinned = false;
    for (const [px, pz] of [...path, [x, z]]) {
      await walkTo(h, px, pz, { maxSec: o.leg ?? 8, tol: 0.45, run: o.run ?? true, until: `(SH.S.health < 55 ? (SH.mod.Player.heal(100), false) : false) || !!(SH.c7 && SH.c7.pinning) || Math.hypot(SH.mod.Player.pos.x - ${px}, SH.mod.Player.pos.z - ${pz}) < 0.45` });
      if (await ev(h, 'return !!(SH.c7 && SH.c7.pinning)')) { pinned = true; break; }
    }
    if (pinned) {
      pins++;
      await mustReach(h, '!(SH.c7 && SH.c7.pinning) && !SH.mod.Script.busy', 12, 'the Smile letting go');
      await advance(h, 0.2);                                              // (up, and away while it stands smiling)
      continue;
    }
    if (await ev(h, `return Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z}) < 0.6`)) return { ok: true, pins };
  }
  return { ok: false, pins };
}
// a group of Tethered sitting side by side (the waiting room's two, 3.4 m apart — inside each other's tether range): a
// few real swings at the first, the Enemies API to put them all down (a player downs both before kneeling to cut), then
// each one cut free (hold E with the box cutter, 2 s) or stomped (E) from behind its chair. spots: [[id, x, z, yaw]…]
async function resolveTethered(h, P, notes, spots, cut) {
  const ids = spots.map((s) => s[0]);
  const left = await ev(h, `return ${JSON.stringify(ids)}.filter((id) => !SH.S.spawns[id])`);
  if (!left.length) return;
  await equip(h, 'box_cutter');
  const [id0, x0, z0, y0] = spots.find((s) => left.includes(s[0]));
  await tp(h, x0, z0, y0);
  await ev(h, "SH.press('ready', 600); return true;");
  for (let k = 0; k < 4; k++) await press(h, 'attack', 0, 0.55);
  await ev(h, 'SH.mod.Input.releaseAll(); return true;');
  await advance(h, 0.2);
  const pullFree = async () => { for (let k = 0; k < 14 && (await ev(h, "return SH.mod.Player.mode === 'grabbed'")); k++) await press(h, 'interact', 0, 0.12); };
  await pullFree();
  await ev(h, `for (const id of ${JSON.stringify(left)}) { const e = SH.mod.Enemies.get(id); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); } return true;`);
  await advance(h, 0.3);
  for (const [id, x, z, yaw] of spots) {
    if (!left.includes(id)) continue;
    await pullFree();
    await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); return true;`);
    await tp(h, x, z, yaw);
    if (cut) await holdAction(h, 'interact', 2.5);
    else await press(h, 'interact', 0, 1.0);
    await advance(h, 0.5);
    const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
    if (res !== (cut ? 'freed' : 'dead')) throw new Error(`Tethered ${id}: expected ${cut ? 'freed' : 'dead'}, got ${res} (${JSON.stringify(await snap(h))})`);
    notes.push(`${id} ${res}`);
  }
  await heal(h);
  await settle(h, P, notes);
}
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
  notes.push(`saved slot ${slot + 1} in ${await ev(h, 'return SH.mod.World.room')}`);
}
async function reload(h, P, notes, slot) {
  await ev(h, `SH.mod.Game.continueFrom(${slot}); return true;`);
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, 'the loaded game');
  await advance(h, 0.6);
  await settle(h, P, notes);
  notes.push(`reloaded slot ${slot + 1} → ${await ev(h, 'return SH.mod.World.room')} (F ${await ev(h, 'return SH.S.F')}, A ${await ev(h, 'return SH.S.A')})`);
}
const flagOf = (h, n) => ev(h, `return SH.S.flags ? SH.S.flags[${JSON.stringify(n)}] : undefined`);

// ---- GAMEPLAY 7-1: Ring Road east, the car park ---------------------------------------------------------------------------
async function arrive(h, P, notes, opts) {
  if ((await ev(h, 'return SH.mod.World.room')) === 'c7_ringroad') {
    await shot(h, opts, 'ringroad');
    if (P.walk) {
      // the old road end, on east (running, real keys): "That wasn't there before."
      await walkPath(h, P, notes, [[9, 0.5]], 'the old road end', { room: 'c7_ringroad' });
      await awaitLine(h, "That wasn't there before.", notes, 'Ring Road east (the old road end)');
      if (P.examine) { await useAt(h, P, notes, 3.0, -4.1, 180); await saw(h, "The barrier. Somebody's pushed it onto the footpath.", notes, 'the pushed-aside barrier'); }
      await walkPath(h, P, notes, [[40, 0.5], [80, 0.5]], 'Ring Road east', { room: 'c7_ringroad', run: true, maxSec: 40 });
      await shot(h, opts, 'ringroad_east');
    }
    await goRoom(h, P, notes, 'c7_carpark');
  }
  if ((await ev(h, 'return SH.mod.World.room')) === 'c7_carpark' && !(await flagOf(h, 'c7_arrived'))) {
    await awaitLine(h, 'District Hospital. [beat] Ward 3. Room 12.', notes, 'arriving in the car park');
    await shot(h, opts, 'carpark');
    if (P.examine) {
      await tp(h, 38.9, 4.5, 90);
      await walkTo(h, 40.4, 4.5, { maxSec: 3 });                         // bump the chained gate
      await saw(h, 'Chained.', notes, 'the Summit Road gate (chained)');
      await useAt(h, P, notes, 38.9, 4.5, 90);
    }
    if (P.walk) await walkPath(h, P, notes, [[16, 20], [19.4, 7], [19.4, 1.2]], 'across the car park to the doors', { room: 'c7_carpark', run: true });
    await goRoom(h, P, notes, 'c7_reception');
  }
}

// ---- 7B: reception, the waiting room, the tea room ---------------------------------------------------------------------------
async function reception(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c7_reception');
  if (!(await flagOf(h, 'c7_visitor'))) {
    await awaitLine(h, 'Somebody should be at the desk.', notes, 'entering reception');
    await shot(h, opts, 'reception');
    const m0 = await mark(h);
    await useAt(h, P, notes, 6.6, 3.55, 180);                          // the visitor book
    await sawAll(h, ['"Luke — Ward 3, Rm 12."', 'Room twelve.'], notes, 'the visitor book', m0);
    if (!(await flagOf(h, 'c7_visitor'))) notes.push('BUG: the visitor book did not set c7_visitor');
  }
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'map_hospital')"))) {
    const m0 = await mark(h);
    await useAt(h, P, notes, 14.95, 8.4, 90);                          // the directory (+ the map from the rack)
    await sawAll(h, ['"Ward 3 — Orthopaedics"', 'Broken bones.'], notes, 'the hospital directory', m0);
    if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'map_hospital')"))) notes.push('BUG: the Hospital Directory (map_hospital) was not picked up at the directory');
  }
  if (P.examine) {
    const m0 = await mark(h);
    await useAt(h, P, notes, 1.2, 10.1, -90);                          // the "You said, we did" board
    await saw(h, 'Nobody said anything.', notes, 'the feedback board', m0);
  }
  if (!(await ev(h, "return !!(SH.S.taken && SH.S.taken['c7_reception:firstaid'])"))) {
    await useAt(h, P, notes, 6.0, 1.05, 180);                          // the first aid kit behind the desk
    if (!(await ev(h, "return !!(SH.S.taken && SH.S.taken['c7_reception:firstaid'])"))) notes.push('BUG: the reception first aid kit was not picked up');
  }
}
async function waiting(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c7_waiting');
  await shot(h, opts, 'waiting');
  // the two seated Tethered facing the TV: from behind the chairs (they face north)
  await resolveTethered(h, P, notes, [['c7_waiting:teth1', 4.25, 4.95, 180], ['c7_waiting:teth2', 7.6, 4.95, 180]], P.cut);
  if (P.examine) {
    const m0 = await mark(h);
    await useAt(h, P, notes, 1.75, 2.3, -90);                          // the vending machine
    await saw(h, 'Out of order. Of course.', notes, 'the vending machine', m0);
  }
  if (P.examine && !(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker10)"))) {
    await useAt(h, P, notes, 0.95, 3.2, 180);                          // sticker10, low on the vending machine's side panel
    const got = await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker10)");
    notes.push(got ? 'sticker10 found' : 'NOTE: sticker10 not taken from (0.95, 3.2)');
  }
}
async function tearoom(h, P, notes, opts) {
  if (!P.rest) return;
  await goRoom(h, P, notes, 'c7_tearoom');
  await shot(h, opts, 'tearoom');
  if (!(await ev(h, "return !!SH.S.done['break:ch7']"))) {
    await ev(h, 'SH.S.health = 60; return 1');
    const m0 = await mark(h);
    await tp(h, 2.5, 1.45, 0);                                         // the break table: "Take your break?" YES
    await press(h, 'interact', 0, 0.3);
    await choose(h, 0, 10);
    await settle(h, P, notes, { play: true });
    await saw(h, 'Fifteen-minute break.', notes, 'the break table', m0);
    if (!(await ev(h, "return !!SH.S.done['break:ch7'] && SH.S.health === 100"))) notes.push('BUG: the tea-room break table did not heal');
  }
}

// ---- CUTSCENE 7-1, GAMEPLAY 7-2 the Smile store, the PA --------------------------------------------------------------------
async function store(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c7_corridor');
  if (!(await flagOf(h, 'c7_s71'))) {
    const m0 = await mark(h);
    await shot(h, opts, 'corridor_fog');
    await walkTo(h, 6, 2, { maxSec: 8, until: 'SH.mod.Script.cutscene || !!SH.S.flags.c7_store' });
    await mustReach(h, 'SH.mod.Script.cutscene || !!SH.S.flags.c7_store', 5, '7-1 starting a few steps into the corridor');
    if (P.play) {
      await playUntil(h, '!SH.mod.Script.busy', 90, '7-1 playing through', { opts, name: '71', every: 1.5 });
      await sawAll(h, ['Hi there!', 'What brings you in today?', "That'll all be fine."], notes, '7-1', m0);
    }
    await settle(h, P, notes);
    if (!(await flagOf(h, 'c7_store'))) throw new Error('7-1 did not turn the corridor into the store (c7_store)');
    const ph = await ev(h, 'return SH.mod.Phone.reading');
    if (!/^(none|noservice|nobars)$/.test(ph.mode) || ph.bars) notes.push(`BUG: the phone shows bars in the store (spec: NO SERVICE, no bars at all): ${JSON.stringify(ph)}`);
    notes.push(`7-1 played (${P.play ? 'through' : 'skipped'}); phone mode ${ph.mode}, bars ${ph.bars}`);
    await shot(h, opts, 'store');
  }
  if ((await ev(h, 'return SH.mod.World.room')) === 'c7_corridor') {
    if (P.walk) {
      // the maze, running (right after 7-1, while they stand and smile): along the first leg, round F1 (a Smile stands
      // in it) through Bay 2, down the second leg, round F2 through Bay 3, along the third leg to the nurses' door
      const hp0 = await ev(h, 'return SH.S.health');
      let pins = 0, ok = true;
      for (const [x, z] of [[14.5, 1.2], [14.5, -1.2], [21.2, -4], [23.4, -4], [26.8, -6.5], [28.6, -11], [26.8, -15.5], [23.6, -17.6], [21.5, -20], [1.2, -20]]) {
        const r = await navTo(h, P, notes, x, z);
        pins += r.pins;
        if (!r.ok) { ok = false; break; }
      }
      notes.push(ok ? `ran the store to the nurses' door (${pins} Smile touch(es), hp ${hp0}→${await ev(h, 'return SH.S.health')})` : `NOTE: the store run did not reach the nurses' door (${pins} touches; teleported the rest)`);
    }
    await goRoom(h, P, notes, 'c7_nurses');
  }
  await awaitLine(h, "They're standing in them.", notes, "the nurses' station (store)");
  await shot(h, opts, 'nurses_store');
  if (P.examine) {
    // walk into a Ward 3 door past the Smile standing in it: the pen, SIGNED, 20 damage, pushed back to the last doorway
    const hp0 = await ev(h, 'return SH.S.health'), m0 = await mark(h);
    await tp(h, 4.0, 2.2, 180);
    await walkTo(h, 4.0, -0.6, { maxSec: 8, until: '!!(SH.c7 && SH.c7.pinning)' });
    await mustReach(h, '!!(SH.c7 && SH.c7.pinning)', 6, "a Smile's touch at the Ward 3 door");
    await mustReach(h, '!(SH.c7 && SH.c7.pinning) && !SH.mod.Script.busy', 12, 'the pin to finish');
    await saw(h, 'SIGNED', notes, "a Smile's touch", m0);
    const s = await snap(h);
    notes.push(`pinned at the ward door: hp ${hp0}→${s.hp}, pushed back to ${s.pos[0]},${s.pos[2]} (${s.room})`);
    if (s.room !== 'c7_nurses' || s.pos[2] < 2.2) notes.push('BUG: the Smile\'s touch did not push him back through the last doorway');
    const want20 = await ev(h, 'return SH.mod.DIFF.dmg(20)');
    if (hp0 - s.hp !== want20) notes.push(`BUG: a Smile's touch took ${hp0 - s.hp} (spec §6: 20, × the Action level = ${want20})`);
    await heal(h);
    if ((await ev(h, 'return SH.mod.World.room')) !== 'c7_nurses') await goRoom(h, P, notes, 'c7_nurses');
  }
  // the PA: "Patient paging." — YES — 7-page
  const m1 = await mark(h);
  await tp(h, 2.3, 2.3, 0);
  await press(h, 'interact', 0, 0.3);
  await awaitLine(h, 'Patient paging.', notes, 'the PA microphone');
  await mustReach(h, 'SH.mod.Script.choosing', 10, 'the PA choice', { step: 0.1 });
  await saw(h, 'Use the microphone?', notes, 'the PA choice');
  await choose(h, 0);
  if (P.play) await playUntil(h, '!SH.mod.Script.busy', 40, '7-page', { opts, name: 'page', every: 1.0 });
  await settle(h, P, notes);
  if (P.play) await sawAll(h, ['Would... would Aidan please come to the front counter.', 'They all answered.'], notes, '7-page', m1);
  if (!(await flagOf(h, 'c7_paged'))) notes.push('BUG: the PA did not set c7_paged');
  const left = await ev(h, 'return +(SH.c7.pageUntil - SH.mod.Time.now).toFixed(1)');
  const inDoors = await ev(h, "return ['c7_nurses:d1','c7_nurses:d2','c7_nurses:d3'].map((id) => SH.mod.Enemies.get(id)).filter((e) => e && !e.removed && !e.hidden && e.pos.z < 1.3).length");
  notes.push(`7-page: doorways clear for ${left}s, ${inDoors} Smile(s) still in the doors`);
  if (left < 25 || left > 31) notes.push(`BUG: the page clears the doorways for ${left}s (spec: 30 s)`);
  if (inDoors) notes.push('BUG: Smiles still stand in the Ward 3 doors after the page');
  await shot(h, opts, 'nurses_paged');
  // through the middle door (real keys)
  await walkTo(h, 4.0, -1.2, { maxSec: 10, until: "SH.mod.World.room === 'c7_ward3'" });
  await mustReach(h, "SH.mod.World.room === 'c7_ward3' && !SH.mod.World.transitioning", 10, 'Ward 3 through the cleared door');
}

// ---- CUTSCENE 7-2 "Three Times" → CUTSCENE 7-3 "Standoff" ------------------------------------------------------------------
async function threeTimes(h, P, notes, opts) {
  const m0 = await mark(h);
  await mustReach(h, 'SH.mod.Script.cutscene', 8, '7-2 starting in Ward 3');
  if (P.play) await playUntil(h, 'SH.mod.Script.choosing', 120, '7-2 up to the choice', { opts, name: '72a', every: 2 });
  else for (let k = 0; k < 80 && !(await ev(h, 'return SH.mod.Script.choosing')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.4); }
  const labels = await ev(h, "return (window.__c7lines || []).filter((l) => l.includes('CHOICE[')).slice(-1)[0] || ''");
  if (!labels.includes('CHOICE[[Listen]|[Turn away]]')) notes.push('MISSING choice labels (7-2): ' + labels);
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  await choose(h, P.listen ? 0 : 1);
  await advance(h, 0.5);
  const dF = (await ev(h, 'return SH.S.F')) - F0, dA = (await ev(h, 'return SH.S.A')) - A0;
  if (P.listen ? (dF !== 2 || dA !== 0) : (dF !== 0 || dA !== 3)) notes.push(`BUG: 7-2 ${P.listen ? '[Listen]' : '[Turn away]'} tracked F+${dF} A+${dA}`);
  notes.push(`7-2: ${P.listen ? '[Listen]' : '[Turn away]'}`);
  if (P.play) {
    await playUntil(h, "SH.mod.World.room === 'c7_flashback'", 40, 'the flashback', { opts, name: '72b', every: 2 });
    await playUntil(h, "SH.mod.World.room === 'c7_ward3' || SH.mod.World.room === 'c7_carpark'", 90, 'back from the flashback', { opts, name: '72fb', every: 1.5 });
    await playUntil(h, 'SH.mod.Script.choosing', 200, '7-2 → 7-3 up to the standoff', { opts, name: '72c', every: 2.5 });
    await sawAll(h, ["It's you.", 'From the store.', 'Yeah.', 'You know what this is?', 'My call log.', 'Three times. I rang three times.',
      "Yeah, this is Luke. My Nan was in last Saturday, your bloke sold her a whole heap of stuff and now her alarm doesn't work. Can someone call me back.",
      "It's Luke again. Nobody's called. Her alarm is not working. She's seventy-nine and she lives on her own. Call me back.",
      "Mate. It's Luke.", "She's got no alarm. She's on her own up there. Please, mate. Just call me back.", 'Tomorrow.',
      'I knew.', 'I knew. I had it for three days. I could have— one call. It was one call.', 'Yeah.', 'It was.',
      'You know what she said about you?', "She said you were lovely. 'Such a lovely young man. So patient with me.'",
      "I hadn't rung her in two weeks.", "Before she fell. Two weeks. I set her up out here on her own 'cause it was cheap and it was quiet and I said I'd visit every weekend.",
      "I didn't visit every weekend.", 'Luke—', "I'm not saying it's not on you. It's on you.", "It's just not only on you.",
      "Doctor says she's sleeping. Can't go in till she wakes.", 'I need air.',
      'AIDAN, GET AWAY FROM HIM!', 'Who the hell are you?', 'Back off. Back OFF.'], notes, '7-2 / 7-3', m0);
    if (!P.listen) await sawAll(h, ['Stop— turn it off—', 'No. You listen.'], notes, '7-2 [Turn away]', m0);
  } else {
    for (let k = 0; k < 120 && !(await ev(h, 'return SH.mod.Script.choosing && SH.mod.World.room === "c7_carpark"')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.4); }
  }
  if (!(await flagOf(h, 'c7_luke'))) notes.push('BUG: 7-2 did not set c7_luke');
  if (await flagOf(h, 'c7_store')) notes.push('BUG: the store is still up after 7-2 (spec: the Fog world again)');
  // 7-3: the timed choice
  if ((await ev(h, 'return SH.mod.World.room')) !== 'c7_carpark') throw new Error('7-3 is not in the car park: ' + JSON.stringify(await snap(h)));
  const labels3 = await ev(h, "return (window.__c7lines || []).filter((l) => l.includes('CHOICE[')).slice(-1)[0] || ''");
  if (!labels3.includes('CHOICE[[Step between them]|[Talk him down]|[Run]]')) notes.push('MISSING choice labels (7-3): ' + labels3);
  const hits = await ev(h, 'return SH.S.chaseHits | 0');
  let pick = 0;
  if (P.stand === 'lose') pick = hits >= 4 ? 0 : hits >= 2 ? 1 : 2;
  if (opts.stand) pick = ['step', 'talk', 'run'].indexOf(opts.stand);           // (branch coverage: CH7_STAND)
  const A1 = await ev(h, 'return SH.S.A'), hp1 = await ev(h, 'return SH.S.health'), m3 = await mark(h);
  await shot(h, opts, '73_choice');
  if (P.stand === 'timeout') {
    await advance(h, 11);                                                // (heartbeat, the push-in: nobody picks)
    if (await ev(h, 'return SH.mod.Script.choosing')) notes.push('BUG: the standoff choice did not time out after 10 s');
    pick = 2;
  } else await choose(h, pick);
  if (P.play) await playUntil(h, '!!SH.S.flags.c7_standoff && !SH.mod.Script.busy', 90, '7-3 after the choice', { opts, name: '73', every: 1.5 });
  await settle(h, P, notes);
  const want = ['step', 'talk', 'run'][pick];
  const got = await flagOf(h, 'c7_standoffPick');
  if (got !== want) notes.push(`BUG: c7_standoffPick = ${got}, want ${want}`);
  const cs = await flagOf(h, 'chaseSaved'), ls = await flagOf(h, 'lukeSaved');
  const wantChase = want === 'step' ? hits < 4 : want === 'talk' ? hits < 2 : false;
  const wantLuke = want !== 'run';
  if (!!cs !== wantChase || !!ls !== wantLuke) notes.push(`BUG: 7-3 ${want} with chaseHits ${hits}: chaseSaved ${cs} lukeSaved ${ls}, want ${wantChase}/${wantLuke}`);
  const dA3 = (await ev(h, 'return SH.S.A')) - A1;
  if ((want === 'run') !== (dA3 === 5)) notes.push(`BUG: 7-3 ${want} tracked A+${dA3}`);
  if (want === 'step' && hits >= 4 && hp1 - (await ev(h, 'return SH.S.health')) < 15) notes.push('BUG: stepping between them with chaseHits ≥ 4 did not cost Aidan the hit (30 damage)');
  if (P.play) {
    if (want === 'step') await saw(h, "He's just a bloke.", notes, '7-3 [Step between them]', m3);
    if (want === 'talk') await saw(h, "He's her grandson. He's not— he's not him.", notes, '7-3 [Talk him down]', m3);
    if (wantChase && wantLuke) await sawAll(h, ['Sorry. Sorry, mate.', 'I thought you were someone else.', 'Me too.'], notes, '7-3 both saved', m3);
  }
  notes.push(`7-3: ${want} (chaseHits ${hits}) → chaseSaved ${cs}, lukeSaved ${ls}`);
  await shot(h, opts, 'carpark_after');
}

// ---- CUTSCENE 7-4 "Room 12", CALL 8, the Summit Road gate → CHAPTER CARD "THE MAST" -----------------------------------------
async function room12(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c7_ward3');
  await awaitLine(h, "The chair's empty.", notes, 'Ward 3 after the standoff');
  await goRoom(h, P, notes, 'c7_room12', { noSettle: true });
  const m0 = await mark(h);
  await mustReach(h, 'SH.mod.Script.cutscene || !!SH.S.flags.c7_room12', 8, '7-4 starting on entering Room 12');
  await shot(h, opts, 'room12');
  if (P.play) await playUntil(h, '!!SH.S.flags.c7_room12 && !SH.mod.Script.busy', 90, '7-4 playing through', { opts, name: '74', every: 1.2 });
  await settle(h, P, notes);
  if (!(await flagOf(h, 'c7_room12'))) throw new Error('7-4 did not set c7_room12');
  if (P.play) await sawAll(h, ['...is that you, love?', "It's alright. I'm still here.", "Come up where it's clearer."], notes, '7-4', m0);
  const view = await ev(h, "const o = SH.mod.World.obj('c7r12:view'); return o ? o.visible : null");
  if (view !== true) notes.push('BUG: the mast is not in the Room 12 window after 7-4');
  if (P.examine) { const m1 = await mark(h); await useAt(h, P, notes, 3.5, 1.1, 180); await saw(h, 'The mast. The red light, blinking.', notes, 'the window after the call', m1); }
}
async function toMast(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c7_reception');
  // out of the doors: CALL 8
  await tp(h, 8, 11.2, 0);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, "SH.mod.World.room === 'c7_carpark' && !SH.mod.World.transitioning", 10, 'the car park');
  const m0 = await mark(h);
  await mustReach(h, "SH.mod.Phone.ringing === 'luka8' || !!(SH.S.calls && SH.S.calls.luka8)", 12, 'Luka call 8 ringing as he leaves the hospital', { step: 0.2 });
  await shot(h, opts, 'call8');
  await settle(h, P, notes, { play: true });
  const c = await ev(h, 'return SH.S.calls.luka8');
  if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka8 ended as ' + c);
  if (P.answer) await sawAll(h, ["They reckon she's awake.", "Whatever you're carrying, mate, put it down. Come back.", 'I have to do one more thing.', "Then do it. I'll be here."], notes, 'luka8', m0);
  // the chain lies on the ground: up Summit Road (real keys)
  const m1 = await mark(h);
  if (P.walk) await walkPath(h, P, notes, [[24, 9], [36, 4.5]], 'across the car park to the gate', { room: 'c7_carpark', run: true });
  else await tp(h, 37.5, 4.5, 90);
  await shot(h, opts, 'gate_open');
  await walkTo(h, 47, 4.5, { maxSec: 14, until: 'SH.S.chapter === 8 || SH.mod.Script.busy' });
  await mustReach(h, "SH.S.chapter === 8 && SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning", 60, 'Chapter 8 on Summit Road', { each: P.play ? '' : 'if (SH.mod.Script.skippable) SH.skip();' });
  await saw(h, 'THE MAST', notes, 'the chapter card', m1);
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = { ...(PATHS[path] || PATHS.connected) };
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 7) throw new Error('ch7.play: not at Chapter 7: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if ((await ev(h, 'return SH.mod.World.room')) !== 'c7_ringroad') throw new Error('ch7.play: expected to start on Ring Road east (c7_ringroad)');
  const F0 = start.F, A0 = start.A;
  let saved = false, reloaded = false;

  await arrive(h, P, notes, opts);
  for (let pass = 0; pass < 3; pass++) {
    await reception(h, P, notes, opts);
    if (opts.saveLoad && !saved) { await payphoneSave(h, P, notes, 0, [15.2, 10.5, 90]); saved = true; }
    await waiting(h, P, notes, opts);
    await tearoom(h, P, notes, opts);
    if (opts.saveLoad && saved && !reloaded) {
      reloaded = true;
      await reload(h, P, notes, 0);
      if ((await ev(h, 'return SH.S.spawns["c7_waiting:teth1"] || null'))) notes.push('BUG: the reload kept the Tethered resolved after the save');
      continue;
    }
    break;
  }
  await store(h, P, notes, opts);
  await threeTimes(h, P, notes, opts);
  await room12(h, P, notes, opts);
  await toMast(h, P, notes, opts);
  await advance(h, 0.5);

  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: Object.fromEntries(Object.entries(S.flags).filter(([k]) => /^c7_|chaseSaved|lukeSaved|chaseHurt/.test(k))), calls: { luka8: S.calls.luka8 }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c7_'))), health: S.health, outage: !!S.outage };`);
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `flags ${JSON.stringify(S.flags)}`, `spawns ${JSON.stringify(S.spawns)}`);
  return { chapter: 7, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

// =====================================================================================================================
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(7); return 1');
  await mustReach(h, "SH.mod.World.room === 'c7_ringroad' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Ring Road east (Chapter 7 start)');
  if (cfg.hits !== undefined) await ev(h, `SH.S.chaseHits = ${Number(cfg.hits)}; SH.S.flags.chaseHurt = ${Number(cfg.hits) >= 4}; return 1`);
  else if (cfg.path === 'coverage') {
    // (what a coverage player carries in: Chase hit the Escalation four times in Chapter 4 — he's hurt)
    await ev(h, 'SH.S.chaseHits = 4; SH.S.flags.chaseHurt = true; return 1');
  }
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected cuts two Tethered free (F+2), answers Luka (F+2), [Listen] (F+2); coverage
  // the same (the standoff costs Chase, no track); tomorrow stomps two (A+2), declines (A+2), [Turn away] (A+3), runs (A+5)
  const dF = r.F - F0, dA = r.A - A0;
  const want = cfg.stand ? null : { connected: [6, 0], deal: [6, 0], coverage: [6, 0], tomorrow: [0, 12] }[cfg.path];
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const hitsNow = await ev(h, 'return SH.S.chaseHits | 0');
  const fates = !cfg.stand ? { connected: [true, true], deal: [true, true], coverage: [false, true], tomorrow: [false, false] }[cfg.path]
    : cfg.stand === 'step' ? [hitsNow < 4, true] : cfg.stand === 'talk' ? [hitsNow < 2, true] : [false, false];
  const fateOk = !!r.flags.chaseSaved === fates[0] && !!r.flags.lukeSaved === fates[1];
  if (!fateOk) r.notes.push(`BUG: fates chaseSaved ${r.flags.chaseSaved} lukeSaved ${r.flags.lukeSaved}, want ${fates}`);
  const ok = st.ch === 8 && st.room === 'c8_summit' && trackOk && fateOk && !errs.length && !bugs.length;
  report(`ch7 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}${cfg.stand ? '/' + cfg.stand + (cfg.hits !== undefined ? cfg.hits : '') : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} chaseSaved=${r.flags.chaseSaved} lukeSaved=${r.flags.lukeSaved} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH7_PATH;
  const shots = process.env.CH7_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH7_RIDDLE || 'normal', saveLoad: process.env.CH7_SAVELOAD === '1', shots,
      ...(process.env.CH7_STAND ? { stand: process.env.CH7_STAND } : {}), ...(process.env.CH7_HITS ? { hits: Number(process.env.CH7_HITS) } : {}) }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch7 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch7_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  return all;
}
