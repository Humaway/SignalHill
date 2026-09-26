// tools/tests/ch2.mjs — Chapter 2 "Hilltop Village" played start to finish (spec §9 Chapter 2, §7B; CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c2.html && node tools/run.mjs --file .build/c2.html --script tools/tests/ch2.mjs
//   env: CH2_PATH=connected|coverage|tomorrow|deal  CH2_RIDDLE=easy|normal|hard  CH2_SAVELOAD=1  CH2_SHOTS=<dir>
//   With no CH2_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 2 as a real player arrives (S.chapter === 2, Aidan on
// Hilltop Road, carrying the returned modem, the box cutter and the bar). It never resets state. It plays the critical
// path with the real mechanics — teleport beside a thing + E, street exits and doors, the lockbox keypad typed on the
// keyboard, Luka's call answered / declined with E / Q, the §2A payphone save, the chase run with real keys, the
// pendant used from the Items screen and held for three seconds — until Chapter 3 has started on Exchange Road.
// Decisions follow opts.path:
//   connected — answer Luka, cut every Tethered free, read Account Note 3, Returns Notes 10–12, the fridge list, play
//               the answering machine; 2-1, 2-2 and 2-3 play through; three loops (the Reach fought on the second)
//   coverage  — answer Luka, cut most Tethered free but stomp one, read Account Note 3 and the fridge list, skip the
//               answering machine and the returns; scenes skipped; one loop; back into Unit 9 through a door reading 9
//   tomorrow  — decline Luka, stomp every Tethered, read nothing that tracks Face; scenes skipped; one loop
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the village office payphone (the chapter's first), read the clues, reload that slot
// (Game.continueFrom) and play on; then save again at the same payphone in the Outage and reload it from the loop.
// → { chapter: 2, F, A, flags, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, assertNoErrors, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: { road: true, teth2: true, teth5: true, teth11: true, oteth4: true }, acct3: true, returns: true, fridge: true, machine: true, play: true, loops: 3, reach: true, via6: false, examine: true },
  coverage: { answer: true, cut: { road: true, teth2: true, teth5: false, teth11: true, oteth4: true }, acct3: true, returns: false, fridge: true, machine: false, play: false, loops: 1, reach: false, via6: true, examine: false },
  tomorrow: { answer: false, cut: { road: false, teth2: false, teth5: false, teth11: false, oteth4: false }, acct3: false, returns: false, fridge: false, machine: false, play: false, loops: 1, reach: false, via6: true, examine: false },
};
PATHS.deal = PATHS.connected;

// ---- the village's connections: [from, to, kind, x, z, yaw, world] -----------------------------------------------
// exit: teleport into the street-exit box (armed from a step back); door / use: stand facing it and press E.
const HOPS = [
  ['c2_hilltoprd', 'c2_crescent', 'exit', 48, -37.85, 180],
  ['c2_crescent', 'c2_hilltoprd', 'exit', 4, 53.9, 0, 'fog'],
  ['c2_crescent', 'c2_office', 'door', -1.2, 46, -90],
  ['c2_office', 'c2_crescent', 'door', 9.9, 3.8, 90],
  ['c2_crescent', 'c2_hall', 'door', 30, 27, 180],
  ['c2_hall', 'c2_crescent', 'door', 9, 11.2, 0],
  ['c2_crescent', 'c2_unit9', 'use', 12.9, -3.85, 180],
  ['c2_unit9', 'c2_crescent', 'use', 4.0, 6.95, 0],
  ['c2_crescent', 'c2_garages', 'exit', 58, -15.35, 180],
  ['c2_garages', 'c2_crescent', 'exit', 31.7, 3, 90],
  ['c2_garages', 'c2_bay4', 'use', 12.5, 1.2, 180],
  ['c2_bay4', 'c2_garages', 'use', 1.5, 5.0, 0],
  ['c2_unit9', 'c2_kitchen_out', 'door', 3.9, 3.0, -90, 'outage'],
  ['c2_kitchen_out', 'c2_unit9', 'door', 10, 19.25, 0],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, obusy: !!M.World.outageBusy, menu: M.Menus.isOpen() ? M.Menus.current : null,
  ready: !!(M.Menus._top && M.Menus._top.ready), cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode,
  outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A, hp: S.health };`);

// record every subtitle / message / card line (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c2spy) { window.__c2spy = true; window.__c2lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c2lines.push(fn[0] + ':' + a.filter((x) => typeof x === 'string').join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
async function saw(h, text, notes, where) {
  const ok = await ev(h, `return (window.__c2lines || []).some((l) => l.includes(${JSON.stringify(text)}))`);
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
async function shot(h, opts, name) {
  if (!opts.shots) return;
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c2_${name}.png`); } catch (e) { /* optional */ }
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered / declined per
// path), a document's reading view (closed). Returns when the player has control, or when a choice / keypad waits.
async function settle(h, P, notes, o = {}) {
  const maxIter = o.maxIter ?? 700;
  for (let i = 0; i < maxIter; i++) {
    const s = await snap(h);
    if (s.mode !== 'play' && s.mode !== 'cutscene' && s.mode !== 'menu') { await advance(h, 0.3); continue; }
    if (s.menu) {
      if (s.menu === 'doc' || s.menu === 'items' || s.menu === 'map') { if (s.ready) await ev(h, 'SH.nav("cancel"); return true;'); await advance(h, 0.3); continue; }
      return s;
    }
    if (s.choosing || s.cap) return s;
    if (s.ring && !s.inCall && !s.busy && !s.trans) {
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

// walk the village's graph from the current room to `to` (BFS over the hops open in the current world)
async function goRoom(h, P, notes, to) {
  for (let guard = 0; guard < 12; guard++) {
    const s = await settle(h, P, notes);
    if (s.room === to) return;
    const world = s.outage ? 'outage' : 'fog';
    const prev = new Map([[s.room, null]]);
    const q = [s.room];
    while (q.length && !prev.has(to)) {
      const r = q.shift();
      for (const hp of HOPS) if (hp[0] === r && !prev.has(hp[1]) && (!hp[6] || hp[6] === world)) { prev.set(hp[1], hp); q.push(hp[1]); }
    }
    if (!prev.has(to)) throw new Error(`goRoom: no way from ${s.room} to ${to} (${world})`);
    let hop = prev.get(to);
    while (hop[0] !== s.room) hop = prev.get(hop[0]);
    await takeHop(h, P, notes, hop);
  }
  throw new Error('goRoom: too many hops to ' + to);
}
async function takeHop(h, P, notes, hop) {
  const [from, to, kind, x, z, yaw] = hop;
  const arrived = `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`;
  if (kind === 'exit') {
    const r = yaw * Math.PI / 180;
    await tp(h, x - Math.sin(r) * 1.3, z - Math.cos(r) * 1.3, yaw);
    await tp(h, x, z, yaw);
    if (!(await advanceUntil(h, arrived, 8))) throw new Error(`exit ${from} → ${to} did not fire at ${x},${z}: ${JSON.stringify(await snap(h))}`);
    return;
  }
  for (let tries = 0; tries < 4; tries++) {
    await tp(h, x, z, yaw);
    await press(h, 'interact', 0, 0.3);
    if (await advanceUntil(h, arrived, 8)) return;
    const s = await snap(h);
    if (s.room !== from) break;
    await settle(h, P, notes);
  }
  throw new Error(`${kind} ${from} → ${to} did not work from ${x},${z}: ${JSON.stringify(await snap(h))}`);
}
// press E at a spot and let the result play out
async function useAt(h, P, notes, x, z, yaw, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, o.after ?? 0.4);
  return settle(h, P, notes, o);
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
  if (o.swing) {
    await ev(h, `SH.press('ready', 600); return true;`);
    for (let k = 0; k < 5; k++) {
      if (await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || e.downed || e.resolved || e.hp <= 0;`)) break;
      await press(h, 'attack', 0, 0.55);
    }
    await ev(h, 'SH.mod.Input.releaseAll(); return true;');
    await advance(h, 0.2);
  }
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); return true;`);
  await advance(h, 0.4);
  await tp(h, ax, az, face);
  if (cut) await holdAction(h, 'interact', 2.6);
  else await press(h, 'interact', 0, 1.0);
  await advance(h, 0.6);
  const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res !== (cut ? 'freed' : 'dead')) throw new Error(`Tethered ${id}: expected ${cut ? 'freed' : 'dead'}, got ${res}`);
  notes.push(`${id} ${res}`);
  await ev(h, "SH.mod.Player.heal && SH.mod.Player.heal(100); return 1");
  await settle(h, P, notes);
  return res;
}

// the §2A payphone flow at the office foyer's wall phone: receiver → breathing → "Save your progress?" → slot
async function payphoneSave(h, P, notes, slot) {
  await tp(h, 9.3, 5.25, 0);
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
  notes.push(`saved slot ${slot + 1} in ${await ev(h, 'return SH.mod.World.room')}${await ev(h, 'return SH.S.outage') ? ' (Outage)' : ''}`);
}
async function reload(h, P, notes, slot) {
  await ev(h, `SH.mod.Game.continueFrom(${slot}); return true;`);
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, 'the loaded game');
  await advance(h, 0.6);
  await settle(h, P, notes);
  notes.push(`reloaded slot ${slot + 1} → ${await ev(h, 'return SH.mod.World.room')}${await ev(h, 'return SH.S.outage') ? ' (Outage)' : ''}`);
}

// Unit 9's lockbox: E, then type the code on the keyboard (a wrong one first on the connected path)
async function lockbox(h, P, notes, wrongFirst) {
  await tp(h, 11.95, -3.9, 180);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, 'SH.mod.UI.capturing()', 20, 'the lockbox keypad', { step: 0.2 });
  await advance(h, 0.8);
  if (wrongFirst) {
    await h.page.keyboard.type('1979', { delay: 30 });
    await advance(h, 2.5);
    if (!(await ev(h, 'return SH.mod.UI.capturing()'))) throw new Error('the lockbox closed on a wrong code');
    notes.push('lockbox: 1979 refused');
  }
  await h.page.keyboard.type('1947', { delay: 30 });
  await advance(h, 0.5);
  await mustReach(h, '!SH.mod.UI.capturing()', 15, 'the lockbox opening');
  await settle(h, P, notes);
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'unit9_key')"))) throw new Error('no Unit 9 key after 1947');
}

// the chase (GAMEPLAY 2-4): real keys, running, from her door along the north side, up the NE lane to the garages and
// under Bay 4's door. Luke is a person — his catches hurt but never kill; the route is fenced by the fog.
async function chase(h, P, notes) {
  const hp0 = await ev(h, 'return SH.S.health');
  const legs = [[36, -1.2], [57.6, -1.6], [58, -13.6]];
  for (const [x, z] of legs) {
    if ((await ev(h, 'return SH.mod.World.room')) !== 'c2_crescent') break;
    if (!(await walkTo(h, x, z, { run: true, tol: 1.2, maxSec: 30 }))) throw new Error(`chase: could not run to ${x},${z}: ${JSON.stringify(await snap(h))}`);
  }
  if (!(await walkTo(h, 58, -16, { run: true, maxSec: 12, until: "SH.mod.World.room === 'c2_garages'" }))) throw new Error('chase: never reached the garages');
  await mustReach(h, "SH.mod.World.room === 'c2_garages' && !SH.mod.World.transitioning", 10, 'the garages');
  await advance(h, 0.3);
  const luke = await mustReach(h, "!!SH.mod.Enemies.get('c2:luke')", 6, 'Luke coming round the corner').catch(() => false);
  if (!luke) notes.push('BUG: Luke did not follow into the garages');
  else {
    // he has to actually come after him here (he once spawned off the lane's floor and never moved)
    const lx0 = await ev(h, "return SH.mod.Enemies.get('c2:luke').pos.x"), hpA = await ev(h, 'return SH.S.health');
    await advance(h, 2.0);
    const lx1 = await ev(h, "const e = SH.mod.Enemies.get('c2:luke'); return e ? e.pos.x : null"), hpB = await ev(h, 'return SH.S.health');
    if (lx1 === null || (Math.abs(lx1 - lx0) < 0.5 && hpB >= hpA)) notes.push(`BUG: Luke never came after him in the garages (x ${lx0} → ${lx1}, health ${hpA} → ${hpB})`);
  }
  if (!(await walkTo(h, 12.5, 0.6, { run: true, maxSec: 30, until: "SH.mod.World.room === 'c2_bay4' || (SH.S.flags.c2_chase|0) >= 2" }))) throw new Error('chase: never got under Bay 4\'s door: ' + JSON.stringify(await snap(h)));
  const hp1 = await ev(h, 'return SH.S.health');
  notes.push(`chase: health ${hp0} → ${hp1}`);
}

// use an item the way a player does: the Items screen opened on it, confirm → USE
async function useItem(h, id) {
  await ev(h, `SH.menu('items', { id: ${JSON.stringify(id)} }); return 1`);
  await mustReach(h, "SH.mod.Menus.current === 'items' && SH.mod.Menus._top && SH.mod.Menus._top.ready", 10, 'the items screen', { step: 0.1 });
  const sel = await ev(h, 'const st = SH.mod.Menus._top.st; return st.list[st.sel] && st.list[st.sel].id');
  if (sel !== id) throw new Error(`items screen opened on ${sel}, not ${id}`);
  await ev(h, 'SH.nav("confirm"); return 1'); await advance(h, 0.4);           // USE / EQUIP / EXAMINE / COMBINE / CANCEL
  await ev(h, 'SH.nav("confirm"); return 1'); await advance(h, 0.4);           // USE
  await mustReach(h, '!SH.mod.Menus.isOpen()', 10, 'the items screen closing');
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = PATHS[path] || PATHS.connected;
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 2) throw new Error('ch2.play: not at Chapter 2: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if (!opts.resume && (await ev(h, 'return SH.mod.World.room')) !== 'c2_hilltoprd') throw new Error('ch2.play: expected to start on Hilltop Road');
  const F0 = start.F, A0 = start.A;
  const riddle = opts.riddle || (await ev(h, "return (SH.S.difficulty && SH.S.difficulty.riddle) || 'normal'"));
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);
  const done = (k) => ev(h, `return !!(SH.S.done && SH.S.done[${JSON.stringify(k)}])`);
  const has = (id) => ev(h, `return SH.S.inv.some((i) => i && i.id === ${JSON.stringify(id)})`);
  const read = (d) => ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(d)}])`);
  const room = () => ev(h, 'return SH.mod.World.room');
  const heal = () => ev(h, 'await SH.run(async (G) => { G.heal(100); }); return SH.S.health;');
  let saved1 = false, reloaded1 = false, saved2 = false, reloaded2 = false, examinedU9 = false;

  for (let pass = 0; pass < 4; pass++) {
    // ---- 2-1 Hilltop Road: the Tethered at its letterbox, stop 2, CALL 2 at the village gate ---------------------------
    if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka2)'))) {
      await goRoom(h, P, notes, 'c2_hilltoprd');
      await shot(h, opts, 'road');
      await resolveTethered(h, P, notes, 'c2_hilltoprd:teth', P.cut.road, { from: 180, swing: true });
      if (riddle === 'hard' || P.examine) await useAt(h, P, notes, 15.0, 6.55, 0);         // Route 44 stop 2 (the timetable)
      if (!(await ev(h, "return !!SH.S.taken['c2_hilltoprd:coffee']")) && (await ev(h, "return SH.mod.World.interactables.some((i) => i.id === 'c2_hilltoprd:coffee')"))) await useAt(h, P, notes, 17.3, 6.6, 0);
      await tp(h, 48, -26, 180);
      await mustReach(h, "SH.mod.Phone.ringing === 'luka2' || !!(SH.S.calls && SH.S.calls.luka2)", 12, 'Luka call 2 ringing at the gate');
      await shot(h, opts, 'gate_call');
      await settle(h, P, notes);
      const c = await ev(h, 'return SH.S.calls.luka2');
      if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka2 ended as ' + c);
    }
    // ---- 2-1 the village office: the save, the visitor book (Luke's note), the noticeboard, the card, the Site Plan --
    if (opts.saveLoad && !saved1) {
      await goRoom(h, P, notes, 'c2_office');
      await payphoneSave(h, P, notes, 0);
      saved1 = true;
    }
    if (!(await has('unit9_key')) && !(await done('c2:lockbox'))) {
      await goRoom(h, P, notes, 'c2_office');
      await shot(h, opts, 'office');
      if (!(await done('c2:book'))) {
        await useAt(h, P, notes, 5.6, 1.75, -90, { play: P.play });
        if (!(await done('c2:book'))) throw new Error('the visitor book did not open');
      }
      const noteId = riddle === 'easy' ? 'lockbox_note_easy' : riddle === 'hard' ? 'lockbox_note_hard' : 'lockbox_note';
      if (!(await read(noteId))) throw new Error(`Luke's note (${noteId}) was not read`);
      if (!(await read('noticeboard'))) await useAt(h, P, notes, 6.2, 5.0, 0);
      if (!(await read('noticeboard'))) throw new Error('the Village Noticeboard was not read');
      if (riddle !== 'easy') {
        const card = riddle === 'hard' ? 'birthday_card_hard' : 'birthday_card';
        if (!(await read(card))) await useAt(h, P, notes, 7.0, 5.15, 0);
        if (!(await read(card))) throw new Error(`the birthday card (${card}) was not read`);
      }
      if (riddle === 'hard' && !(await read('timetable_hard'))) throw new Error('Hard: the Route 44 depot footer (timetable_hard) was never read');
      if (!(await has('map_village'))) await useAt(h, P, notes, 7.05, 0.85, 180);
      if (!(await has('map_village'))) throw new Error('no Site Plan');
      if (!(await ev(h, "return !!SH.S.taken['c2_office:firstaid']"))) await useAt(h, P, notes, 0.95, 3.6, -90);
      if (!(await ev(h, "return !!SH.S.taken['c2_office:coffee']"))) await useAt(h, P, notes, 2.2, 3.95, 0);
      if (opts.saveLoad && saved1 && !reloaded1) { reloaded1 = true; await reload(h, P, notes, 0); continue; }
    }
    // ---- 2-2 the Crescent: the three at the doors, the doorstep boxes, the lockbox (1947) ------------------------------
    if (!(await done('cs:2-1'))) {
      await goRoom(h, P, notes, 'c2_crescent');
      await shot(h, opts, 'crescent');
      await resolveTethered(h, P, notes, 'c2_crescent:teth2', P.cut.teth2, { from: 180 });
      await resolveTethered(h, P, notes, 'c2_crescent:teth5', P.cut.teth5, { from: 270 });
      await resolveTethered(h, P, notes, 'c2_crescent:teth11', P.cut.teth11, { from: 90 });
      if (P.acct3 && !(await read('acct3'))) { await useAt(h, P, notes, 47.75, -3.55, 180); if (!(await read('acct3'))) throw new Error('Account Note 3 not read'); }
      if (P.returns) {
        for (const [d, x, z, yaw] of [['returns10', 51.25, 43.55, 0], ['returns12', 63.55, 19.25, 90], ['returns11', -3.55, 37.25, -90]]) {
          if (!(await read(d))) await useAt(h, P, notes, x, z, yaw);
          if (!(await read(d))) throw new Error(d + ' not read');
        }
      }
      if (P.examine) { await useAt(h, P, notes, 27.2, 29.35, 0); await saw(h, 'Someone planted pansies around it. Still alive.', notes, 'the gnome'); }
      if (!(await has('unit9_key'))) await lockbox(h, P, notes, P.examine);
      // her door → 2-1 "Unit 9"
      await tp(h, 12.9, -3.85, 180);
      await press(h, 'interact', 0, 0.3);
      await mustReach(h, "SH.mod.World.room === 'c2_unit9' || SH.mod.Script.cutscene", 12, 'Unit 9 opening');
      await mustReach(h, "SH.mod.World.room === 'c2_unit9' && !SH.mod.World.transitioning", 12, 'Unit 9');
      await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.done['cs:2-1']", 6, '2-1 starting');
      if (P.play) {
        await shot(h, opts, '21_start');
        await mustReach(h, '!SH.mod.Script.cutscene', 60, '2-1 playing through');
        await saw(h, "Okay. Okay. The modem. That's all it is.", notes, '2-1');
      }
      await settle(h, P, notes);
      if (!(await done('cs:2-1'))) throw new Error('2-1 did not play');
    }
    // ---- 2-3 inside Unit 9: the modem, three restarts, the fridge, the machine, the chair --------------------------------
    if (!(await flag('c2_modemIn')) || ((await ev(h, "return SH.S.done['c2:restarts'] | 0")) < 3)) {
      await goRoom(h, P, notes, 'c2_unit9');
      if (!(await flag('c2_modemIn'))) {
        await useAt(h, P, notes, 5.55, 4.6, 180);
        await choose(h, 0);                                                                  // Use the returned modem? YES
        await settle(h, P, notes);
        if (!(await flag('c2_modemIn'))) throw new Error('the modem did not go in');
        if (await has('returned_modem')) throw new Error('the returned modem is still in the inventory');
      }
      for (let k = 0; k < 4 && ((await ev(h, "return SH.S.done['c2:restarts'] | 0")) < 3); k++) await useAt(h, P, notes, 5.55, 4.75, 180, { play: true });
      if ((await ev(h, "return SH.S.done['c2:restarts'] | 0")) < 3) throw new Error('three restarts did not happen');
      if (P.play) { await saw(h, 'Come on.', notes, 'restart 1'); await saw(h, 'Come on, come on.', notes, 'restart 2'); }
      if (await ev(h, "return SH.mod.World.interactables.some((i) => i.id === 'c2_unit9:restart')")) notes.push('BUG: the restart prompt is still there after the third restart');
    }
    if (P.fridge && !(await read('fridge_list'))) {
      await useAt(h, P, notes, 2.75, 1.75, 180, { play: true });
      if (!(await read('fridge_list'))) throw new Error("Nan's fridge list not read");
      await saw(h, 'She asked.', notes, 'the fridge list');
    }
    if (P.machine && !(await done('c2:machine'))) {
      await useAt(h, P, notes, 4.05, 4.82, -90, { play: true });
      if (!(await done('c2:machine'))) throw new Error('the answering machine did not play');
      await saw(h, 'Your callback has been scheduled for: tomorrow.', notes, 'the answering machine');
    }
    if (P.examine && !examinedU9) {
      await useAt(h, P, notes, 2.2, 2.35, -90);                                                    // the fallen chair
      await saw(h, 'Leave it.', notes, 'the fallen chair');
      await useAt(h, P, notes, 5.8, 0.9, -90, { play: true });                                      // the dresser photo
      await saw(h, 'Me and Luke, Year 7 sports day', notes, 'the dresser photo');
      await useAt(h, P, notes, 6.4, 1.25, 180);                                                    // the sealed tablet
      await saw(h, 'She never even opened it.', notes, 'the tablet');
      examinedU9 = true;
    }
    // ---- 2-2 "Are You From the Phone Company?" → 2-4 the chase → 2-3 "Legend" -------------------------------------
    if (!(await flag('c2_metChase'))) {
      if (!(await done('cs:2-2'))) {
        await goRoom(h, P, notes, 'c2_unit9');
        await tp(h, 4.0, 6.95, 0);
        await press(h, 'interact', 0, 0.3);
        await mustReach(h, "SH.mod.World.room === 'c2_crescent' && !SH.mod.World.transitioning", 12, 'out of Unit 9');
        await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.done['cs:2-2']", 6, '2-2 starting');
        if (P.play) {
          await mustReach(h, '!SH.mod.Script.cutscene', 60, '2-2 playing through');
          await saw(h, 'Are you from the phone company?', notes, '2-2');
          await saw(h, "Hey! I'm talking to you! Do you work for them?", notes, '2-2');
        } else await settle(h, P, notes);
        await mustReach(h, "(SH.S.flags.c2_chase|0) === 1 && !SH.mod.Script.busy", 10, 'the chase on');
        await shot(h, opts, 'chase');
      }
      if ((await ev(h, 'return SH.S.flags.c2_chase|0')) === 1) await chase(h, P, notes);
      await mustReach(h, "SH.mod.World.room === 'c2_bay4' && !SH.mod.World.transitioning", 15, 'Bay 4');
      await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.done['cs:2-3']", 6, '2-3 starting');
      if (P.play) {
        await shot(h, opts, '23');
        await mustReach(h, '!SH.mod.Script.cutscene', 120, '2-3 playing through');
        for (const l of ['Mate! Legend!', "Nearly's a good day.", 'Hit \'em first.', "They're all customers here, mate.", "Don't die, legend."]) await saw(h, l, notes, '2-3');
      }
      await settle(h, P, notes);
      if (!(await flag('c2_metChase'))) throw new Error('2-3 did not finish');
      if (await ev(h, "return ['c2:luke','c2:flankL','c2:flankR'].some((id) => { const e = SH.mod.Enemies.get(id); return e && !e.removed; })")) notes.push('BUG: the chase actors survived 2-3');
    }
    // ---- 2-5 the Outage as he leaves the garages ------------------------------------------------------------------------
    if (!(await flag('c2_loop'))) {
      await goRoom(h, P, notes, 'c2_garages');
      await walkTo(h, 24, 3, { maxSec: 20, until: "SH.mod.World.outageBusy || !!SH.S.outage" });
      await mustReach(h, '!!SH.S.outage && !SH.mod.World.outageBusy', 15, 'the Outage');
      await settle(h, P, notes);
      await shot(h, opts, 'garages_outage');
    }
    if (!(await has('rmap_village'))) {
      await goRoom(h, P, notes, 'c2_garages');
      await useAt(h, P, notes, 27.0, 2.75, 0);
      if (!(await has('rmap_village'))) throw new Error('no receipt map');
    }
    if (!(await flag('c2_loopBroken'))) {
      if (opts.saveLoad && !saved2) {
        await goRoom(h, P, notes, 'c2_office');
        await payphoneSave(h, P, notes, 1);
        saved2 = true;
      }
      // the loops: out through the back gate … and in at the front gate, with more nines each time
      const want = P.loops;
      for (let guard = 0; guard < 6 && ((await ev(h, 'return SH.S.flags.c2_loopN|0')) < want); guard++) {
        await goRoom(h, P, notes, 'c2_crescent');
        if (!(await ev(h, "return SH.S.spawns['c2_crescent:oteth4'] || null"))) await resolveTethered(h, P, notes, 'c2_crescent:oteth4', P.cut.oteth4, { from: 180 });
        const n0 = await ev(h, 'return SH.S.flags.c2_loopN|0');
        await tp(h, 4, -8.5, 180);
        if (!(await walkTo(h, 4, -15, { maxSec: 10, until: `(SH.S.flags.c2_loopN|0) > ${n0}` }))) throw new Error('the back gate did not loop');
        await mustReach(h, "SH.mod.World.room === 'c2_crescent' && !SH.mod.World.transitioning && !SH.mod.Script.busy", 15, 'back at the front gate');
        const pz = await ev(h, 'return SH.mod.Player.pos.z');
        if (pz < 40) notes.push(`BUG: loop ${n0 + 1} landed at z ${pz.toFixed(1)}, not the front gate`);
        await advance(h, 2.5);
        await settle(h, P, notes);
        const nines = await ev(h, "let n = 0; for (let k = 1; k <= 12; k++) { const o = SH.mod.World.obj('c2_plateO' + k); if (o && o.material && o.material.map && /plate\\|9$/.test(o.material.map.name || '')) n++; } return n;");
        notes.push(`loop ${n0 + 1}: plates reading 9 = ${nines}`);
        if (n0 + 1 >= 3 && nines !== 12) notes.push('BUG: the third loop does not show twelve nines');
        if (reloaded2 === false && saved2) { reloaded2 = true; await reload(h, P, notes, 1); break; }
        if (P.reach && n0 + 1 >= 2 && !(await ev(h, "return SH.S.spawns['c2_crescent:reach'] || null"))) {
          // the Reach on the west side from the second loop: the bar, real swings, then the API
          const e = await ev(h, "const e = SH.mod.Enemies.get('c2_crescent:reach'); return e ? { x: e.pos.x, z: e.pos.z } : null");
          if (!e) throw new Error('no Reach on the second loop');
          await equip(h, 'steel_bar');
          await heal();
          await tp(h, e.x, e.z + 1.6, 180);
          await ev(h, "SH.press('ready', 600); return true;");
          for (let k = 0; k < 4; k++) await press(h, 'attack', 0, 0.9);
          await ev(h, 'SH.mod.Input.releaseAll(); return true;');
          await ev(h, "const e = SH.mod.Enemies.get('c2_crescent:reach'); if (e && !e.downed && e.hp > 0) e.damage(e.hp, 'steel_bar'); return true;");
          await advance(h, 1.2);
          // downed: stomp it (E beside it)
          const d = await ev(h, "const e = SH.mod.Enemies.get('c2_crescent:reach'); return e ? { x: e.pos.x, z: e.pos.z, down: !!e.downed } : null");
          if (d && d.down) { await tp(h, d.x, d.z + 1.0, 180); await press(h, 'interact', 0, 1.2); }
          await heal();
          await settle(h, P, notes);
          notes.push(`the Reach: ${await ev(h, "return SH.S.spawns['c2_crescent:reach'] || 'alive'")}`);
        }
      }
      if (reloaded2 && (await ev(h, 'return SH.S.flags.c2_loopN|0')) < want) continue;
      // into Unit 9 (her own door, or any door that reads 9), the swollen kitchen, the pendant
      if (!(await has('alarm_pendant'))) {
        await goRoom(h, P, notes, 'c2_crescent');
        if (P.via6 && (await ev(h, 'return SH.S.flags.c2_loopN|0')) < 3) {
          // Unit 6's plate hangs upside down (9) from the first time round
          const [dx, dz] = [65 - 0.5, 6.5 - 1.6];
          await tp(h, dx - 0.7, dz, 90);
          await press(h, 'interact', 0, 0.3);
          await mustReach(h, "SH.mod.World.room === 'c2_unit9' && !SH.mod.World.transitioning", 12, 'Unit 6 opening into her hall');
          notes.push('in through Unit 6 (it read 9)');
        }
        await goRoom(h, P, notes, 'c2_kitchen_out');
        await shot(h, opts, 'kitchen_out');
        await useAt(h, P, notes, 10.85, 11.35, 180, { play: P.play });
        if (!(await has('alarm_pendant'))) throw new Error('no pendant');
        if (P.play) await saw(h, 'Press and hold for three seconds.', notes, 'the pendant');
      }
      // USE it: hold the button for three seconds → the tone → "Your call cannot be connected." → "...I'm sorry."
      await useItem(h, 'alarm_pendant');
      await mustReach(h, 'SH.mod.Script.busy', 5, 'the pendant scene');
      await advance(h, 0.6);
      await holdAction(h, 'interact', 3.6);
      await settle(h, P, notes, { play: true });
      if (!(await flag('c2_loopBroken'))) throw new Error('the pendant did not break the loop');
      await saw(h, 'Your call cannot be connected.', notes, 'the pendant');
      await saw(h, "...I'm sorry.", notes, 'the pendant');
    }
    // ---- the way up: the back gate, the Outage lifting, CHAPTER CARD → Chapter 3 ---------------------------------------
    await goRoom(h, P, notes, 'c2_crescent');
    await tp(h, 4, -8.5, 180);
    if (!(await walkTo(h, 4, -14.5, { maxSec: 12, until: '!SH.S.outage || SH.mod.World.outageBusy' }))) throw new Error('the Outage did not lift at the back gate');
    await mustReach(h, '!SH.S.outage && !SH.mod.World.outageBusy', 12, 'the Outage lifting');
    await settle(h, P, notes);
    await shot(h, opts, 'exchange_rd');
    if (!(await walkTo(h, 4, -31, { maxSec: 25, until: 'SH.S.chapter === 3' }))) throw new Error('walking up Exchange Road never started Chapter 3');
    await mustReach(h, "SH.S.chapter === 3 && SH.mod.World.room === 'c3_exchangerd' && !SH.mod.World.transitioning", 40, 'Chapter 3 on Exchange Road');
    await saw(h, 'SIGNAL HILL TRUNK EXCHANGE', notes, 'the chapter card');
    await advance(h, 0.5);
    break;
  }
  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: { ...S.flags }, calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c2_'))), health: S.health, inv: S.inv.map((i) => i.id + '×' + i.n).join(' '), outage: !!S.outage };`);
  if (S.outage) notes.push('BUG: Chapter 3 started in the Outage');
  if (S.inv.includes('returned_modem')) notes.push('BUG: the returned modem survived Chapter 2');
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `inv: ${S.inv}`);
  return { chapter: 2, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

// =====================================================================================================================
async function runOne(h, cfg) {
  const e0 = await errorCount(h);
  const notes = [];
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(2); return 1');
  await mustReach(h, "SH.mod.World.room === 'c2_hilltoprd' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Hilltop Road');
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected cuts 5 (F+5), answers (F+2), reads acct3 + fridge (F+2), the machine (F+1);
  // coverage cuts 4 and stomps 1, answers, reads acct3 + fridge; tomorrow stomps 5 (A+5) and declines (A+2)
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [10, 0], deal: [10, 0], coverage: [8, 1], tomorrow: [0, 7] }[cfg.path];
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const ok = st.ch === 3 && st.room === 'c3_exchangerd' && trackOk && !errs.length && !bugs.length;
  report(`ch2 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH2_PATH;
  const shots = process.env.CH2_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH2_RIDDLE || 'normal', saveLoad: process.env.CH2_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    try { all = (await runOne(h, cfg)) && all; }
    catch (e) {
      all = false;
      report(`ch2 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      try { await h.shot('.build/ch2_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  await assertNoErrors(h).catch((e) => { all = false; console.log(e.message); });
  report('ch2 (all runs)', all);
}
