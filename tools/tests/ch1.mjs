// tools/tests/ch1.mjs — Chapter 1 "The Plaza" played start to finish (spec §8 Chapter 1; CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c1.html && node tools/run.mjs --file .build/c1.html --script tools/tests/ch1.mjs
//   env: CH1_PATH=connected|coverage|tomorrow  CH1_RIDDLE=easy|normal|hard  CH1_SAVELOAD=1  CH1_SHOTS=1
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 1 as a real player arrives (S.chapter === 1, Aidan on
// Relay Street, carrying the Prologue's things). It never resets state. It walks the chapter's critical path with the
// real mechanics (teleport beside a thing + E, doors and street exits, the terminal keypad typed on the keyboard, the
// phone call answered / declined with E / Q, the payphone's §2A save flow, the Returns Cage fought with the bar) until
// Chapter 2 has started on Hilltop Road. Decisions follow opts.path:
//   connected — answer Luka, cut every Tethered free, read Account Notes 1 and 2
//   coverage  — answer Luka, cut the street one free, stomp the car-park one, read Account Note 1 only
//   tomorrow  — decline Luka, stomp every Tethered, read no Account Note
// opts.saveLoad — save at Relay Street's payphone (the chapter's first), go on to the security office, reload that slot
// (Game.continueFrom), then later save at the food court payphone in the Outage and reload it from the kitchen.
import { ev, advance, advanceUntil, mustReach, skipScenes, choose, press, holdKey, waitControl, waitRoom, assertNoErrors, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: { relay: true, carpark: true, concourse: true }, acct1: true, acct2: true, play: true, readAll: true, pinFirst: true },
  coverage: { answer: true, cut: { relay: true, carpark: false, concourse: true }, acct1: true, acct2: false, play: false, readAll: false, pinFirst: false },
  tomorrow: { answer: false, cut: { relay: false, carpark: false, concourse: false }, acct1: false, acct2: false, play: false, readAll: false, pinFirst: false },
};
PATHS.deal = PATHS.connected;

// ---- the Plaza's connections: [from, to, kind, x, z, yaw, world] --------------------------------------------------
// exit: teleport into the street-exit box; door: stand in front of it facing it and press E. world: 'fog' | 'outage'.
const HOPS = [
  ['c1_relay', 'c1_carpark', 'exit', 15.95, -60, 90],
  ['c1_carpark', 'c1_relay', 'exit', -1.15, 5, -90],
  ['c1_carpark', 'c1_dock', 'exit', 42.1, 27, 90],
  ['c1_dock', 'c1_carpark', 'exit', -0.95, 8.6, -90],
  ['c1_dock', 'c1_corridor', 'door', 15.5, 0.8, 180],
  ['c1_corridor', 'c1_dock', 'door', 39.2, 1.5, 90],
  ['c1_corridor', 'c1_security', 'door', 31, 2.2, 0],
  ['c1_corridor', 'c1_staffroom', 'door', 13, 2.2, 0],
  ['c1_corridor', 'c1_concourse', 'door', 5, 0.8, 180],
  ['c1_security', 'c1_corridor', 'door', 4, 0.8, 180],
  ['c1_staffroom', 'c1_corridor', 'door', 4, 0.8, 180],
  ['c1_concourse', 'c1_corridor', 'door', 43, 11.2, 0, 'fog'],
  ['c1_concourse', 'c1_store', 'exit', 51, -1.4, 180, 'fog'],
  ['c1_concourse', 'c1_foodcourt', 'exit', 7, -0.8, 180],
  ['c1_foodcourt', 'c1_concourse', 'exit', 15, 20.75, 0],
  ['c1_foodcourt', 'c1_kitchen', 'door', 27.6, 0.8, 180, 'outage'],
  ['c1_kitchen', 'c1_foodcourt', 'door', 0.8, 3, -90],
  ['c1_kitchen', 'c1_backoffice', 'door', 9.3, 3, 90],
  ['c1_store', 'c1_concourse', 'exit', 10, 16.7, 0, 'fog'],
  ['c1_store', 'c1_backoffice', 'door', 17.5, 0.8, 180],
  ['c1_backoffice', 'c1_store', 'door', 1.2, 4.3, 0],
  ['c1_backoffice', 'c1_kitchen', 'door', 0.8, 3.4, -90, 'outage'],
  ['c1_backoffice', 'c1_stockroom', 'door', 5.3, 2.5, 90, 'outage'],
  ['c1_stockroom', 'c1_backoffice', 'door', 0.8, 7, -90],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, menu: M.Menus.isOpen() ? M.Menus.current : null, ready: !!(M.Menus._top && M.Menus._top.ready),
  cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode, outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A };`);

// hold an injected action for `sec` of GAME time (SH.press holds in real time; release it ourselves)
async function holdAction(h, action, sec) {
  await ev(h, `SH.press(${JSON.stringify(action)}, 600); return true;`);
  try { await advance(h, sec); } finally { await ev(h, 'SH.mod.Input.releaseAll(); return true;'); }
  await advance(h, 0.1);
}
// equip through the game's own G.equip (what the Items screen's EQUIP does)
async function equip(h, id) {
  await ev(h, `await SH.run(async (G) => { G.equip(${JSON.stringify(id)}); }); return true;`);
  const eq = await ev(h, 'return SH.S.equipped');
  if (eq !== id) throw new Error(`could not equip ${id} (equipped: ${eq})`);
}
async function tp(h, x, z, yaw) {
  await ev(h, `SH.teleport(${x}, ${z}, ${yaw}); try { SH.mod.Cam.snap(); } catch (e) {} return true;`);
  await advance(h, 0.25);
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered or declined
// per path), a document's reading view (closed). Returns when the player has control, or when a choice / keypad waits.
async function settle(h, P, notes, maxIter = 600) {
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
    if (s.trans || s.busy || s.inCall) {
      if (!P.play && s.skippable) { await ev(h, 'SH.skip(); return true;'); await advance(h, 0.4); }
      else await advance(h, 0.5);
      continue;
    }
    // a queued scene may be about to start: one more short tick, then done
    await advance(h, 0.15);
    const s2 = await snap(h);
    if (!s2.busy && !s2.trans && !s2.menu && !s2.choosing && !s2.cap && !(s2.ring && !s2.inCall)) return s2;
  }
  throw new Error('settle: the game never handed control back: ' + JSON.stringify(await snap(h)));
}

// walk the Plaza's graph from the current room to `to` (BFS over the hops open in the current world)
async function goRoom(h, P, notes, to) {
  for (let guard = 0; guard < 14; guard++) {
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
  if (kind === 'exit') {
    // arm the exit outside its box first (a step back along the facing), then into the box
    const r = yaw * Math.PI / 180;
    await tp(h, x - Math.sin(r) * 1.2, z - Math.cos(r) * 1.2, yaw);
    await tp(h, x, z, yaw);
    if (!(await advanceUntil(h, `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`, 8))) {
      throw new Error(`exit ${from} → ${to} did not fire at ${x},${z}: ${JSON.stringify(await snap(h))}`);
    }
    return;
  }
  for (let tries = 0; tries < 4; tries++) {
    await tp(h, x, z, yaw);
    await press(h, 'interact', 0, 0.3);
    if (await advanceUntil(h, `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`, 6)) return;
    const s = await snap(h);
    if (s.room !== from) break;
    await settle(h, P, notes);
  }
  throw new Error(`door ${from} → ${to} did not open from ${x},${z}: ${JSON.stringify(await snap(h))}`);
}

// press E at a spot and let the result play out
async function useAt(h, P, notes, x, z, yaw, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, o.after ?? 0.4);
  return settle(h, P, notes);
}

// a Tethered: down it (real swings first when asked, then the Enemies API), then cut it free (hold E with the box
// cutter) or stomp it (E). → 'freed' | 'dead'
async function resolveTethered(h, P, notes, id, cut, o = {}) {
  const st = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? { x: e.pos.x, z: e.pos.z, res: e.resolved, hp: e.hp } : null;`);
  const done = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (done) return done;
  if (!st) throw new Error('no Tethered ' + id);
  const dir = o.from ?? 0;                                      // approach side (yaw from it to Aidan, degrees)
  const r = dir * Math.PI / 180, ax = st.x + Math.sin(r) * 1.25, az = st.z + Math.cos(r) * 1.25;
  await equip(h, 'box_cutter');
  await tp(h, ax, az, (dir + 180) % 360);
  if (o.swing) {
    // a few real box-cutter swings (ready + attack)
    await ev(h, `SH.press('ready', 600); return true;`);
    for (let k = 0; k < 6; k++) {
      const down = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || e.downed || e.resolved || e.hp <= 0;`);
      if (down) break;
      await press(h, 'attack', 0, 0.55);
    }
    await ev(h, 'SH.mod.Input.releaseAll(); return true;');
    await advance(h, 0.2);
  }
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); return true;`);
  await advance(h, 0.4);
  await tp(h, ax, az, (dir + 180) % 360);
  if (cut) await holdAction(h, 'interact', 2.5);
  else await press(h, 'interact', 0, 1.0);
  await advance(h, 0.6);
  const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res !== (cut ? 'freed' : 'dead')) throw new Error(`Tethered ${id}: expected ${cut ? 'freed' : 'dead'}, got ${res}`);
  notes.push(`${id} ${res}`);
  await settle(h, P, notes);
  return res;
}

// the §2A payphone flow: "Pick up the receiver?" YES → breathing → "Save your progress?" YES → slot 1 (overwrite: YES)
async function payphoneSave(h, P, notes, x, z, yaw, slot = 0) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, 0.3);
  await choose(h, 0);                                                  // pick up the receiver
  await choose(h, 0, 30);                                              // save your progress
  await mustReach(h, "SH.mod.Menus.current === 'save' && SH.mod.Menus._top && SH.mod.Menus._top.ready", 20, 'the save screen', { step: 0.1 });
  const before = await ev(h, 'return SH.mod.Save.seq');
  for (let k = 0; k < slot; k++) { await ev(h, 'SH.nav("down"); return true;'); await advance(h, 0.15); }
  // the screen opens on the latest save's slot: walk it up to the one we want
  await ev(h, `const t = SH.mod.Menus._top; if (t && t.st) { t.st.i = ${slot}; } return true;`);
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
async function reload(h, P, notes, slot = 0) {
  await ev(h, `SH.mod.Game.continueFrom(${slot}); return true;`);
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning", 30, 'the loaded game');
  await advance(h, 0.5);
  await settle(h, P, notes);
  notes.push(`reloaded slot ${slot + 1} → ${await ev(h, 'return SH.mod.World.room')}`);
}

// the terminal: E, (first time: "My PIN…"), the CRM login keypad; type `pin` (null = back out with Esc)
async function terminal(h, P, notes, pin) {
  await tp(h, 2.6, 1.5, 180);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, 'SH.mod.UI.capturing() && !SH.mod.Script.choosing', 40, 'the terminal keypad', { step: 0.2 });
  await advance(h, 0.6);
  if (pin === null) {
    await h.page.keyboard.press('Escape');
    await advance(h, 0.6);
    await settle(h, P, notes);
    return;
  }
  await h.page.keyboard.type(String(pin), { delay: 20 });
  await advance(h, 0.3);
  await h.page.keyboard.press('Enter');
  await advance(h, 0.5);
  await mustReach(h, '!SH.mod.UI.capturing()', 15, 'the terminal accepting the PIN');
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = PATHS[path] || PATHS.connected;
  const notes = opts.notes || [];
  const shots = !!opts.shots;
  const shot = async (name) => { if (shots) { try { await ev(h, 'SH.mod.Render.render(0); return true;'); await h.shot(`.build/ch1_${name}.png`); } catch (e) { /* screenshots are optional */ } } };
  const start = await snap(h);
  if (start.chapter !== 1) throw new Error('ch1.play: not at Chapter 1: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if (!opts.resume && (await ev(h, 'return SH.mod.World.room')) !== 'c1_relay') throw new Error('ch1.play: expected to start on Relay Street');
  const F0 = start.F, A0 = start.A;
  let saved1 = false, reloaded1 = false, saved2 = false, reloaded2 = false;
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);
  const done = (k) => ev(h, `return !!(SH.S.done && SH.S.done[${JSON.stringify(k)}])`);
  const has = (id) => ev(h, `return SH.S.inv.some((i) => i && i.id === ${JSON.stringify(id)})`);
  const read = (d) => ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(d)}])`);
  // the riddle level's variant of a clue document (DOC_pick lives in the game's module scope, not on window)
  const docId = (base) => ev(h, `const l = (SH.S.difficulty && SH.S.difficulty.riddle) || 'normal', v = ${JSON.stringify(base)} + '_' + l; return SH.mod.DOCUMENTS[v] ? v : ${JSON.stringify(base)};`);

  // the whole chapter as idempotent stages: a reload rewinds S and the loop simply carries on from where S says
  for (let pass = 0; pass < 3; pass++) {
    // ---- 1-1 Relay Street ----------------------------------------------------------------------------------------
    if (opts.saveLoad && !saved1) {
      await goRoom(h, P, notes, 'c1_relay');
      await payphoneSave(h, P, notes, 2.15, -80.6, -90, 0);
      saved1 = true;
    }
    if (!(await ev(h, "return SH.S.spawns['c1_relay:teth'] || null"))) {
      await goRoom(h, P, notes, 'c1_relay');
      await shot('relay_teth');
      await resolveTethered(h, P, notes, 'c1_relay:teth', P.cut.relay, { from: 0, swing: true });
    }
    if (!(await ev(h, "return SH.S.spawns['c1_carpark:teth'] || null"))) {
      await goRoom(h, P, notes, 'c1_carpark');
      await resolveTethered(h, P, notes, 'c1_carpark:teth', P.cut.carpark, { from: 250 });
    }
    // ---- 1-2 the security office: the map, the staff room key, the bar, the coffee ---------------------------------
    if (!(await has('staff_key')) && !(await done('unlocked:c1_corridor:staff'))) {
      await goRoom(h, P, notes, 'c1_security');
      if (P.readAll) await useAt(h, P, notes, 5.6, 3.0, 90);                                         // the CCTV feeds
      await useAt(h, P, notes, 2.0, 1.25, -90);                                                        // the Plaza Directory
      await useAt(h, P, notes, 2.05, 2.0, -90);                                                        // the staff room key
      await useAt(h, P, notes, 6.2, 4.25, 90);                                                         // the steel bar
      await useAt(h, P, notes, 1.1, 4.55, -90);                                                        // the coffee
      for (const [id, want] of [['map_plaza', 1], ['staff_key', 1], ['steel_bar', 1]]) if (!(await has(id))) throw new Error(`security office: no ${id} (want ${want})`);
      // the CCTV figure: seen on camera three, then gone once he has looked away
      if (P.readAll && !(await done('c1:cctvGone'))) throw new Error('the CCTV figure did not vanish after looking away');
      if (P.readAll) {                                                                                 // Ollie sticker 3, under the desk
        await useAt(h, P, notes, 2.05, 1.1, -90);
        if (!(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker03)"))) throw new Error('sticker03 (under the security desk) not collected');
        notes.push('sticker03');
      }
    }
    if (opts.saveLoad && saved1 && !reloaded1) { reloaded1 = true; await reload(h, P, notes, 0); continue; }
    // ---- 1-1 "Welcome In" / 1-5: the store and a first go at the terminal ------------------------------------------
    if (P.pinFirst && !(await done('once:c1:termFirst'))) {
      await goRoom(h, P, notes, 'c1_store');                                                            // 1-1 plays
      if (!(await done('cs:1-1'))) throw new Error('1-1 did not play on entering the store');
      await useAt(h, P, notes, 10, 3.9, 180);                                                          // Chloe, again
      await useAt(h, P, notes, 10, 3.9, 180);                                                          // "Eleven."
      await useAt(h, P, notes, 9.2, 1.95, 0);                                                          // Ollie sticker 2, behind the counter
      if (!(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker02)"))) throw new Error('sticker02 (behind the store counter) not collected');
      notes.push('sticker02');
      await goRoom(h, P, notes, 'c1_backoffice');
      await terminal(h, P, notes, null);                                                               // "My PIN…"; Esc
      await useAt(h, P, notes, 2.95, 1.25, 180);                                                       // the sticky note
      await useAt(h, P, notes, 0.8, 1.2, -90);                                                         // Huddle Whiteboard 1
      if (!(await read(await docId('pin_note')))) throw new Error('the PIN sticky note was not read');
    }
    // ---- 1-6 the staff room: the locker (Account Note 1, the badge), the certificate --------------------------------
    if (!(await flag('c1_pinKnown'))) {
      await goRoom(h, P, notes, 'c1_staffroom');
      await shot('staffroom');
      await useAt(h, P, notes, 1.45, 2.79, -90);                                                       // the locker
      if (!(await done('c1:lockerOpen'))) throw new Error('the locker did not open');
      if (P.acct1) {
        await useAt(h, P, notes, 1.05, 2.79, -90);
        if (!(await read('acct1'))) { await useAt(h, P, notes, 0.95, 2.79, -90); }
        if (!(await read('acct1'))) throw new Error('Account Note 1 not read');
      }
      for (let k = 0; k < 3 && !(await has('first_day_badge')); k++) await useAt(h, P, notes, 0.95, 2.79, -90);
      if (!(await has('first_day_badge'))) throw new Error('no first-day badge');
      await useAt(h, P, notes, 6.85, 3.75, 90);                                                        // the certificate
      if (!(await flag('c1_pinKnown'))) throw new Error('the certificate did not give the PIN');
      if (P.readAll) await useAt(h, P, notes, 4.4, 2.9, 180).catch(() => null);                         // (the break table is optional)
    }
    // ---- CALL 1 as he leaves the staff room ------------------------------------------------------------------------
    if (!(await ev(h, "return !!(SH.S.calls && SH.S.calls.luka1)"))) {
      await goRoom(h, P, notes, 'c1_corridor');
      await mustReach(h, "SH.mod.Phone.ringing === 'luka1' || !!(SH.S.calls && SH.S.calls.luka1)", 12, 'Luka call 1 ringing');
      await settle(h, P, notes);
      const c = await ev(h, 'return SH.S.calls.luka1');
      if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka1 ended as ' + c);
    }
    // ---- 1-7 the case screen ---------------------------------------------------------------------------------------
    if (!(await flag('c1_address'))) {
      await goRoom(h, P, notes, 'c1_backoffice');
      if (!(await done('cs:1-1'))) throw new Error('reached the back office without 1-1');
      await terminal(h, P, notes, 1403);
      await shot('case_screen');
      await settle(h, P, notes);
      if (!(await flag('c1_address'))) throw new Error('the terminal did not give the address');
    }
    // ---- 1-8 the food court payphone → 1-2 "The Tone" → the Outage ------------------------------------------------
    if (!(await flag('c1_wai'))) {
      await goRoom(h, P, notes, 'c1_foodcourt');
      await mustReach(h, "SH.mod.World.interactables.some((i) => i.id === 'c1_foodcourt:ringing')", 5, 'the ringing payphone');
      await tp(h, 1.15, 13.2, -90);
      await press(h, 'interact', 0, 0.4);
      await mustReach(h, "SH.mod.Script.cutscene || SH.mod.Script.busy", 5, '1-8 starting');
      await shot('wai_call');
      await settle(h, P, notes);
      if (!(await ev(h, 'return !!SH.S.outage'))) throw new Error('1-2 did not bring the Outage');
      if (!(await done('cs:1-2'))) throw new Error('1-2 did not play');
    }
    // ---- 1-9 the Outage Plaza --------------------------------------------------------------------------------------
    if (!(await flag('c1_bossDone'))) {
      if (!(await has('rmap_plaza'))) {
        await goRoom(h, P, notes, 'c1_foodcourt');
        await useAt(h, P, notes, 4.25, 9.55, 180);
        if (!(await has('rmap_plaza'))) throw new Error('no receipt map');
        const un = await ev(h, "const e = SH.mod.Enemies.get('c1_foodcourt:unread'); return e ? { type: e.type, n: e.def.count } : null;");
        if (!un) throw new Error('no Unread swarm on the food court ceiling in the Outage');
      }
      if (opts.saveLoad && !saved2) {
        await goRoom(h, P, notes, 'c1_foodcourt');
        await payphoneSave(h, P, notes, 1.15, 13.2, -90, 1);
        saved2 = true;
        await goRoom(h, P, notes, 'c1_kitchen');
        if (!reloaded2) { reloaded2 = true; await reload(h, P, notes, 1); continue; }
      }
      // the concourse: three Tethered in the Outage, the energy drink
      if (!(await ev(h, "return SH.S.spawns['c1_concourse:teth2'] || null"))) {
        await goRoom(h, P, notes, 'c1_concourse');
        await shot('concourse_outage');
        await resolveTethered(h, P, notes, 'c1_concourse:teth2', P.cut.concourse, { from: 90 });
        if (!(await ev(h, "return !!SH.S.taken['c1_concourse:energy']"))) await useAt(h, P, notes, 36.8, 7.4, 90);
      }
      if (!(await ev(h, "return !!SH.S.taken['c1_kitchen:coffee']"))) {
        await goRoom(h, P, notes, 'c1_kitchen');
        await useAt(h, P, notes, 3.1, 1.3, 180);
      }
      if (P.acct2 && !(await read('acct2'))) {
        await goRoom(h, P, notes, 'c1_store');
        await shot('store_outage');
        await useAt(h, P, notes, 11.3, 4.2, 180);
        if (!(await read('acct2'))) throw new Error('Account Note 2 not read');
      }
      // ---- 1-3 "Returns" → the Returns Cage → 1-4 ------------------------------------------------------------------
      await goRoom(h, P, notes, 'c1_stockroom');
      await tp(h, 2.2, 7, 90);                                                                        // into the 1-3 trigger
      await mustReach(h, "SH.mod.Script.cutscene || SH.mod.Script.busy || SH.S.done['cs:1-3']", 5, '1-3 starting');
      if (P.play) await mustReach(h, "!SH.mod.Script.cutscene", 40, '1-3 playing through');
      else await skipScenes(h);
      await mustReach(h, "SH.mod.Script.active === null || !SH.mod.Script.cutscene", 10, 'the fight');
      await shot('boss');
      // the fight: the bar, real swings, then the Enemies API for the rest
      await equip(h, 'steel_bar');
      const bossPos = () => ev(h, "const e = SH.mod.Enemies.get('c1_stockroom:cage'); return e ? { x: e.pos.x, z: e.pos.z, yaw: e.yaw, hp: e.hp, st: e.data.state } : null;");
      let b = await bossPos();
      if (!b) throw new Error('no Returns Cage');
      await mustReach(h, "(() => { const e = SH.mod.Enemies.get('c1_stockroom:cage'); return !!(e && e.data.fight); })()", 10, 'the fight on');
      const heal = () => ev(h, 'await SH.run(async (G) => { G.heal(100); }); return SH.S.health;');
      await heal();
      b = await bossPos();
      const fx = b.x + Math.sin(b.yaw) * 1.75, fz = b.z + Math.cos(b.yaw) * 1.75;
      await tp(h, fx, fz, (Math.atan2(b.x - fx, b.z - fz) * 180) / Math.PI);
      await ev(h, `SH.press('ready', 600); return true;`);
      await advance(h, 0.3);
      for (let k = 0; k < 6; k++) await press(h, 'attack', 0, 0.9);
      await ev(h, 'SH.mod.Input.releaseAll(); return true;');
      b = await bossPos();
      notes.push(`boss hp after 6 real swings: ${b && b.hp}, Aidan ${await ev(h, 'return SH.S.health')}`);
      await heal();
      for (let k = 0; k < 8; k++) {
        b = await bossPos();
        if (!b || b.st === 'kneel' || b.hp <= 0) break;
        await ev(h, "const e = SH.mod.Enemies.get('c1_stockroom:cage'); e.damage(40, 'steel_bar'); return true;");
        await advance(h, 0.4);
      }
      await mustReach(h, "(() => { const e = SH.mod.Enemies.get('c1_stockroom:cage'); return e && e.data.state === 'kneel'; })()", 5, 'the Returns Cage kneeling');
      await advance(h, 1.2);
      notes.push(`returns dropped: ${await ev(h, "return [5,6,7,8,9].filter((n) => SH.S.done['c1:ret' + n]).length")}`);
      if (P.readAll) await useAt(h, P, notes, 3.2, 3.35, 180).catch(() => null);          // Returns Note 5, where it landed
      await heal();
      b = await bossPos();
      const tx = b.x + Math.sin(b.yaw) * 1.7, tz = b.z + Math.cos(b.yaw) * 1.7;
      await tp(h, tx, tz, (Math.atan2(b.x - tx, b.z - tz) * 180) / Math.PI);
      await shot('boss_kneel');
      await press(h, 'interact', 0, 0.5);
      await mustReach(h, "!!SH.S.done['c1:collapsed'] || !!SH.S.done['cs:1-4']", 20, 'the modem torn out');
      if (P.play) {
        await mustReach(h, "SH.mod.World.room === 'c1_store' || !!(SH.S.flags && SH.S.flags.c1_bossDone && !SH.mod.Script.busy)", 90, '1-4 playing through');
        await shot('14_store');
      }
      await settle(h, P, notes);
      if (!(await flag('c1_bossDone'))) throw new Error('1-4 did not finish the boss');
      if (await ev(h, 'return !!SH.S.outage')) throw new Error('the Outage did not lift after 1-4');
    }
    // ---- the chapter's end: back out to Relay Street and up Hilltop Road ------------------------------------------
    await goRoom(h, P, notes, 'c1_relay');
    await tp(h, 21.6, -171, 90);
    await tp(h, 23.1, -171, 90);
    await mustReach(h, "SH.S.chapter === 2", 20, 'Chapter 2 starting');
    await mustReach(h, "SH.mod.World.room === 'c2_hilltoprd' && !SH.mod.World.transitioning", 30, 'Hilltop Road');
    await advance(h, 0.5);
    break;
  }
  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: { ...S.flags }, calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c1_'))), docs: Object.keys(S.docs).length, health: S.health, inv: S.inv.map((i) => i.id + '×' + i.n).join(' ') };`);
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `inv: ${S.inv}`);
  return { chapter: 1, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

export default async function (page, h) {
  const path = process.env.CH1_PATH || 'connected';
  const riddle = process.env.CH1_RIDDLE || 'normal';
  const saveLoad = process.env.CH1_SAVELOAD === '1';
  const t0 = Date.now();
  let ok = false, detail = '';
  const notes = [];
  try {
    await ev(h, `return await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(riddle)} })`);
    await ev(h, 'return await SH.chapter(1)');
    await waitRoom(h, 'c1_relay', 30);
    await waitControl(h, 30);
    const r = await play(h, { path, riddle, saveLoad, shots: process.env.CH1_SHOTS === '1', notes });
    const st = await ev(h, 'return SH.state()');
    ok = st.chapter === 2 && st.room === 'c2_hilltoprd';
    await assertNoErrors(h);
    detail = `${path}/${riddle}${saveLoad ? '/saveLoad' : ''} F=${r.F} A=${r.A} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n  ` + r.notes.join('\n  ');
  } catch (e) {
    ok = false;
    detail = String(e.stack || e) + '\n  notes: ' + notes.join(' | ');
    try { await h.shot('.build/ch1_fail.png'); } catch (e2) { /* no page */ }
  }
  report(`ch1`, ok, detail);
}
