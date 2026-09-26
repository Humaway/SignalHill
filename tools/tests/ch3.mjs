// tools/tests/ch3.mjs — Chapter 3 "The Exchange" played start to finish (spec §9 Chapter 3, §7B Trunk Exchange;
// CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c3.html && node tools/run.mjs --file .build/c3.html --script tools/tests/ch3.mjs
//   env: CH3_PATH=connected|coverage|tomorrow|deal  CH3_RIDDLE=easy|normal|hard  CH3_SAVELOAD=1  CH3_SHOTS=<dir>
//   With no CH3_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 3 as a real player arrives (S.chapter === 3, Aidan at
// the top of the village back gate on Exchange Road, carrying the box cutter and the bar). It never resets state. It
// plays the critical path with the real mechanics — street exits and doors (teleport beside them + E), Luka's call
// answered / declined with E / Q, the Tethered cut free (hold E with the box cutter) or stomped, the §2A payphone save,
// the fuse board worked with the arrow keys and E (a trip first on the connected path), the Borrowed on the stairs
// (Examine + Step back, or Talk), the Restructure's jacks re-patched by holding E — until Chapter 4 has started on
// Wire Lane. Decisions follow opts.path:
//   connected — answer Luka, cut every Tethered free, read Account Note 4 and the Operator's Logs, examine the Borrowed
//               and step back, re-patch all three WAI jacks (waiSaved); 3-1, 3-2 and 3-3 play through
//   coverage  — answer Luka, cut two Tethered free and stomp one, read Account Note 4, talk to the Borrowed, patch one
//               jack and let the Restructure's timer run out (Wai lost → 3-3alt); scenes skipped
//   tomorrow  — decline Luka, stomp every Tethered, read nothing that tracks Face, talk to the Borrowed; the jacks are
//               re-patched (Wai's fate is not an Avoid choice); scenes skipped
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the payphone at the top of Exchange Road (the chapter's first), go on through the forecourt
// and the foyer, reload that slot (Game.continueFrom) and play on; later save at the Operators' Hall wall phone and
// reload it after the fuse board.
// → { chapter: 3, F, A, flags, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, errorCount, assertNoErrors, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: { forecourt: true, tethN: true, tethS: true }, acct4: true, logs: true, play: true, borrowed: 'examine', patch: 3, trip: true, examine: true, wai: 'saved' },
  coverage: { answer: true, cut: { forecourt: true, tethN: true, tethS: false }, acct4: true, logs: false, play: false, borrowed: 'talk', patch: 1, trip: false, examine: false, wai: 'lost' },
  tomorrow: { answer: false, cut: { forecourt: false, tethN: false, tethS: false }, acct4: false, logs: false, play: false, borrowed: 'talk', patch: 3, trip: false, examine: false, wai: 'saved' },
};
PATHS.deal = PATHS.connected;

// ---- the exchange's connections: [from, to, kind, x, z, yaw] ------------------------------------------------------
// exit: teleport into the street-exit box (armed from a step back); door: stand facing it and press E.
const HOPS = [
  ['c3_exchangerd', 'c3_forecourt', 'exit', -0.4, 4.0, -90],
  ['c3_forecourt', 'c3_exchangerd', 'exit', 36.6, 11, 90],
  ['c3_forecourt', 'c3_foyer', 'door', 28, 0.75, 180],
  ['c3_foyer', 'c3_forecourt', 'door', 6.5, 7.2, 0],
  ['c3_foyer', 'c3_hall', 'door', 2.4, 0.8, 180],
  ['c3_hall', 'c3_foyer', 'door', 39.2, 6.63, 90],
  ['c3_hall', 'c3_records', 'door', 22, 0.8, 180],
  ['c3_records', 'c3_hall', 'door', 5, 7.2, 0],
  ['c3_hall', 'c3_canteen', 'door', 38.6, 13.2, 0],
  ['c3_canteen', 'c3_hall', 'door', 8.6, 0.8, 180],
  ['c3_hall', 'c3_stairs', 'door', 39.2, 1.6, 90],
  ['c3_stairs', 'c3_hall', 'door', 2.0, 0.8, 180],
  ['c3_stairs', 'c3_fuse', 'door', 3.3, 6.7, 90],
  ['c3_fuse', 'c3_stairs', 'door', 0.8, 2.5, -90],
  ['c3_stairs', 'c3_vault', 'door', 0.7, 6.7, -90],
  ['c3_vault', 'c3_stairs', 'door', 19.2, 5.0, 90],
  ['c3_frame', 'c3_yard', 'door', 17.0, 0.8, 180],
  ['c3_yard', 'c3_frame', 'door', 16.0, 9.4, 0],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, obusy: !!M.World.outageBusy, menu: M.Menus.isOpen() ? M.Menus.current : null,
  ready: !!(M.Menus._top && M.Menus._top.ready), cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode,
  outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A, hp: S.health };`);

// record every subtitle / message / card line (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c3spy) { window.__c3spy = true; window.__c3lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c3lines.push(fn[0] + ':' + a.filter((x) => typeof x === 'string').join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
async function saw(h, text, notes, where) {
  const ok = await ev(h, `return (window.__c3lines || []).some((l) => l.includes(${JSON.stringify(text)}))`);
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
  if (!opts.shots) return;
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c3_${name}.png`); } catch (e) { /* optional */ }
}

// advance until `pred` holds, closing any document reading view a scene opens on the way (the player reads it, E)
async function playUntil(h, pred, maxSec, what) {
  const ok = await advanceUntil(h, pred, maxSec, { step: 0.25, each: "if (SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc' && SH.mod.Menus._top && SH.mod.Menus._top.ready) SH.nav('cancel');" });
  if (!ok) throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered / declined per
// path), a document's reading view (closed). Returns when the player has control, or when a choice / keypad waits.
async function settle(h, P, notes, o = {}) {
  const maxIter = o.maxIter ?? 900;
  for (let i = 0; i < maxIter; i++) {
    const s = await snap(h);
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

// walk the building's graph from the current room to `to`
async function goRoom(h, P, notes, to) {
  for (let guard = 0; guard < 12; guard++) {
    const s = await settle(h, P, notes);
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
  await heal(h);
  await settle(h, P, notes);
  return res;
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
  notes.push(`saved slot ${slot + 1} in ${await ev(h, 'return SH.mod.World.room')}`);
}
async function reload(h, P, notes, slot) {
  await ev(h, `SH.mod.Game.continueFrom(${slot}); return true;`);
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, 'the loaded game');
  await advance(h, 0.6);
  await settle(h, P, notes);
  notes.push(`reloaded slot ${slot + 1} → ${await ev(h, 'return SH.mod.World.room')} (F ${await ev(h, 'return SH.S.F')}, A ${await ev(h, 'return SH.S.A')})`);
}

// the fuse board (GAMEPLAY 3-4): the board-side view — arrows pick a switch, E throws it. BASEMENT runs at first.
// The connected path overloads it once (HALL + BASEMENT + FRAME = 13 A → the trip, the dark, something moving).
const FUSE_ORDER = ['HALL', 'FRAME', 'RECORDS', 'BASEMENT', 'CANTEEN', 'MAST FEED'];
async function fuseBoard(h, P, notes, riddle) {
  await tp(h, 5.0, 2.3, 90);
  await press(h, 'interact', 0, 0.4);
  await mustReach(h, "SH.mod.Script.busy", 5, 'the fuse board view');
  await advance(h, 0.6);
  // the selection frame's position on the board tells which switch is picked (row 0: HALL FRAME RECORDS; row 1:
  // BASEMENT CANTEEN MAST FEED); it is hidden while a throw / the trip plays out
  const selIdx = () => ev(h, `const o = SH.mod.World.obj('c3f_sel'); if (!o || !o.visible) return -1;
    const col = Math.round((o.position.z - 2.3 + 0.34) / 0.34), row = Math.round((1.51 - o.position.y) / 0.5); return row * 3 + col;`);
  const ready = async () => { await mustReach(h, "(() => { const o = SH.mod.World.obj('c3f_sel'); return !!(o && o.visible) && !SH.mod.UI.subtitleShown; })()", 20, 'the fuse board ready for a switch', { step: 0.1 }); await advance(h, 0.3); };
  const moveTo = async (name) => {
    const want = FUSE_ORDER.indexOf(name);
    for (let k = 0; k < 10; k++) {
      const cur = await selIdx();
      if (cur === want) return;
      if (cur < 0) { await advance(h, 0.3); continue; }
      const [cr, cc] = [Math.floor(cur / 3), cur % 3], [wr, wc] = [Math.floor(want / 3), want % 3];
      if (cr !== wr) await press(h, wr > cr ? 'down' : 'up', 0, 0.25);
      else await press(h, wc > cc ? 'right' : 'left', 0, 0.25);
    }
    throw new Error('fuse board: could not select ' + name);
  };
  const circ = () => ev(h, "const v = SH.S.done['c3:circ']; return v === undefined || v === null ? 'BASEMENT' : String(v);");
  const throwIt = async (name) => {
    await ready();
    await moveTo(name);
    await press(h, 'interact', 0, 0.2);
    await advance(h, 1.4);
    if ((await ev(h, "return SH.S.done['c3:trips'] | 0")) > trips) { trips++; notes.push(`fuse: overload (${name}) — the trip`); }
    if (!(await ev(h, 'return !!SH.S.flags.c3_fused'))) await ready();
  };
  let trips = await ev(h, "return SH.S.done['c3:trips'] | 0");
  if (P.trip) {
    await throwIt('HALL');                                         // HALL + BASEMENT = 7 A
    await throwIt('FRAME');                                        // + FRAME = 13 A → the main trips, every switch drops
    if ((await circ()) !== '') notes.push(`BUG: after the trip the circuits read "${await circ()}"`);
    if (!(await ev(h, "return !!SH.S.done['c3:stoolDown']"))) notes.push('BUG: the first trip did not knock the stool over');
  } else {
    await throwIt('BASEMENT');                                     // off: the fuse room goes dark
  }
  if ((await circ()).includes('BASEMENT')) await throwIt('BASEMENT');
  if (!(await circ()).includes('HALL')) await throwIt('HALL');
  if (!(await circ()).includes('FRAME')) await throwIt('FRAME');
  await mustReach(h, '!!SH.S.flags.c3_fused && !SH.mod.Script.busy', 20, 'the fuse board solved (c3_fused)');
  await settle(h, P, notes);
  notes.push(`fuse: solved on ${riddle} (${await circ()}), trips ${trips}`);
}

// the Borrowed "Wai" on the landing (IN-ENGINE 3-3b): Examine (within 4 m) + Step back, or Talk
async function borrowed(h, P, notes) {
  const id = 'c3_stairs:borrowed';
  const res0 = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res0) return;
  if (!(await ev(h, `return !!SH.mod.Enemies.get(${JSON.stringify(id)})`))) throw new Error('no Borrowed on the landing after the fuses');
  // the conversation starts by itself within 4 m (he arrives 2.2 m from it, out of the fuse room)
  let s = await snap(h);
  for (let k = 0; k < 60 && !s.choosing; k++) { await advance(h, 0.25); s = await snap(h); if (!s.busy && !s.choosing && k > 20) break; }
  if (!s.choosing) {
    await tp(h, 2.6, 6.9, 0);
    await press(h, 'interact', 0, 0.3);
    await mustReach(h, 'SH.mod.Script.choosing', 15, 'the Borrowed conversation', { step: 0.1 });
  }
  await saw(h, "Take a seat, mate. I'm on a call.", notes, 'the Borrowed');
  const hp0 = await ev(h, 'return SH.S.health');
  if (P.borrowed === 'examine') {
    await choose(h, 1);                                                // Examine
    await mustReach(h, 'SH.mod.Script.choosing', 20, 'the choice again after Examine', { step: 0.1 });
    await saw(h, "His hands. Rings on every finger.", notes, 'the Borrowed examine');
    await saw(h, "Wai doesn't wear rings.", notes, 'the Borrowed examine');
    await choose(h, 2);                                                // Step back → it reveals at range
  } else {
    await choose(h, 0);                                                // Talk → it unfolds and grabs (25)
  }
  // Step back: he backs off a pace or two, then it unfolds at range (no grab); Talk: it unfolds and grabs at once
  await advanceUntil(h, `(() => { const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || !e.disguised; })()`, 4, { step: 0.1 });
  await advance(h, P.borrowed === 'examine' ? 0.3 : 1.3);
  const hp1 = await ev(h, 'return SH.S.health');
  notes.push(`  (Aidan backed off to ${JSON.stringify(await ev(h, 'const p = SH.mod.Player.pos; return [+p.x.toFixed(2), +p.z.toFixed(2)]'))})`);
  notes.push(`the Borrowed: ${P.borrowed} (health ${hp0} → ${hp1})`);
  if (P.borrowed === 'talk' && hp0 - hp1 < 12) notes.push('BUG: Talk first did not grab (no damage)');
  if (P.borrowed === 'examine' && hp1 < hp0) notes.push('BUG: Examine + Step back still hurt');
  if (await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !!(e && e.disguised);`)) throw new Error('the Borrowed never revealed itself');
  // the fight: the bar (or the box cutter, if a chained run arrives without it), real swings, then the API
  await equip(h, (await ev(h, "return SH.S.inv.some((i) => i && i.id === 'steel_bar')")) ? 'steel_bar' : 'box_cutter');
  const e = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? { x: e.pos.x, z: e.pos.z } : null`);
  if (e) {
    await ev(h, "SH.press('ready', 600); return true;");
    for (let k = 0; k < 4; k++) await press(h, 'attack', 0, 0.9);
    await ev(h, 'SH.mod.Input.releaseAll(); return true;');
    await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.resolved && e.hp > 0) e.damage(e.hp + 5, 'steel_bar'); return true;`);
    await advance(h, 1.2);
    const d = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? { x: e.pos.x, z: e.pos.z, down: !!e.downed } : null`);
    if (d && d.down) { await tp(h, d.x, d.z - 1.0, 0); await press(h, 'interact', 0, 1.2); }
  }
  await mustReach(h, `SH.S.spawns[${JSON.stringify(id)}] === 'dead'`, 10, 'the Borrowed dead');
  await heal(h);
  await advance(h, 2.0);
  await settle(h, P, notes);
  await mustReach(h, '!!SH.S.flags.c3_borrowedMet', 5, 'c3_borrowedMet');
  await advance(h, 4.0);
  await saw(h, 'It had his voice.', notes, 'after the Borrowed');
}

// the Restructure (BOSS): re-patch WAI-1, WAI-2, WAI-3 (hold E 3 s each) within 150 s — or let the time run out
async function restructure(h, P, notes) {
  await mustReach(h, "SH.mod.World.room === 'c3_frame' && !!SH.S.outage", 90, 'the frame hall in the Outage');
  await mustReach(h, "!SH.mod.Script.cutscene && SH.mod.Player.control !== false && !SH.mod.World.outageBusy", 90, 'the fight handing control back');
  await shot(h, P.__opts || {}, 'boss');
  const JACKS = [[2.05, 5.35, -90], [10.2, 2.7, 0], [11.0, 11.3, 180]];
  const t0 = await ev(h, 'return SH.mod.Time ? SH.mod.Time.now || 0 : 0');
  void t0;
  const patched = () => ev(h, "return [0, 1, 2].filter((j) => SH.S.done['c3:patch' + j]).length");
  for (let j = 0; j < P.patch; j++) {
    const [x, z, yaw] = JACKS[j];
    await heal(h);
    await tp(h, x, z, yaw);
    await holdAction(h, 'interact', 3.4);
    if ((await patched()) < j + 1) {
      // a lash or a sweep may have knocked him off it: once more
      await heal(h);
      await tp(h, x, z, yaw);
      await holdAction(h, 'interact', 3.4);
    }
    if ((await patched()) < j + 1) throw new Error(`WAI-${j + 1} did not re-patch`);
    notes.push(`WAI-${j + 1} re-patched`);
  }
  if (P.patch < 3) {
    // wait out the timer somewhere the lashes and sweeps don't reach (the doors end)
    await tp(h, 17.5, 7.0, -90);
    for (let k = 0; k < 40; k++) {
      if (await ev(h, "return !(SH.mod.Script.busy && SH.mod.World.room === 'c3_frame' && SH.S.outage) || SH.mod.Script.cutscene")) break;
      if ((await ev(h, 'return SH.S.health')) < 70) await heal(h);
      await advance(h, 5);
    }
  }
  await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.flags.c3_bossDone", 200, 'the Restructure over (3-3 / 3-3alt)', { each: "if (SH.S.health < 60) SH.mod.Player.heal(100);" });
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = { ...(PATHS[path] || PATHS.connected), __opts: opts };
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 3) throw new Error('ch3.play: not at Chapter 3: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if (!opts.resume && (await ev(h, 'return SH.mod.World.room')) !== 'c3_exchangerd') throw new Error('ch3.play: expected to start on Exchange Road');
  const F0 = start.F, A0 = start.A;
  const riddle = opts.riddle || (await ev(h, "return (SH.S.difficulty && SH.S.difficulty.riddle) || 'normal'"));
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);
  const done = (k) => ev(h, `return !!(SH.S.done && SH.S.done[${JSON.stringify(k)}])`);
  const has = (id) => ev(h, `return SH.S.inv.some((i) => i && i.id === ${JSON.stringify(id)})`);
  const read = (d) => ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(d)}])`);
  const room = () => ev(h, 'return SH.mod.World.room');
  let saved1 = false, reloaded1 = false, saved2 = false, reloaded2 = false;

  for (let pass = 0; pass < 5; pass++) {
    // ---- 3-1 Exchange Road: a short real walk up the hill, the payphone at the top -----------------------------------
    if ((await room()) === 'c3_exchangerd') {
      await shot(h, opts, 'road_gate');
      if ((await ev(h, 'return SH.mod.Player.pos.x')) > 100 && !(await walkTo(h, 101, 4.0, { maxSec: 12, tol: 0.8 }))) notes.push('BUG: could not walk up from the back gate');
      if (opts.saveLoad && !saved1) { await payphoneSave(h, P, notes, 0, [7.2, 1.45, 180]); saved1 = true; }
      if (P.examine) { await useAt(h, P, notes, 46.1, 0.9, 180); await saw(h, 'Operators lived up here. Right next to work.', notes, 'the M. — Operator letterbox'); }
      // the lower branch toward Relay Street ends at a drop (spec §7A gating): walk into it
      if (P.examine && !(await ev(h, "return (window.__c3lines || []).some((l) => l.includes(\"I can't go that way.\"))"))) {
        await tp(h, 77, 16.5, 0);
        await walkTo(h, 77, 22, { maxSec: 6, until: "(window.__c3lines || []).some((l) => l.includes(\"I can't go that way.\"))" });
        await saw(h, "I can't go that way.", notes, 'the drop at the end of the lower branch');
        await settle(h, P, notes);
      }
      await takeHop(h, P, notes, HOPS[0]);
    }
    // ---- 3-1 the forecourt: CALL 3, the Tethered, the plaque, the hum ---------------------------------------------------
    if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka3)')) || !(await ev(h, "return SH.S.spawns['c3_forecourt:teth'] || null")) || !(await read('plaque'))) {
      await goRoom(h, P, notes, 'c3_forecourt');
      await mustReach(h, "SH.mod.Phone.ringing === 'luka3' || !!(SH.S.calls && SH.S.calls.luka3)", 12, 'Luka call 3 ringing on the forecourt');
      await shot(h, opts, 'forecourt_call');
      await settle(h, P, notes);
      const c = await ev(h, 'return SH.S.calls.luka3');
      if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka3 ended as ' + c);
      if (P.answer) { await saw(h, 'Your housemate said you drove out to Signal Hill.', notes, 'luka3'); await saw(h, "I'm already on the highway, mate.", notes, 'luka3'); }
      await resolveTethered(h, P, notes, 'c3_forecourt:teth', P.cut.forecourt, { from: 90, swing: true });
      await useAt(h, P, notes, 30.45, 1.0, 180);                                              // the brass plaque
      if (!(await read('plaque'))) throw new Error('the Exchange Plaque was not read');
      if (P.examine) { await useAt(h, P, notes, 11.2, 1.1, 180); await saw(h, 'Something in there is still running.', notes, 'the hum'); }
    }
    // ---- the foyer: the Fire Evacuation Plan -------------------------------------------------------------------------
    if (!(await has('map_exchange'))) {
      await goRoom(h, P, notes, 'c3_foyer');
      await shot(h, opts, 'foyer');
      await useAt(h, P, notes, 0.95, 5.6, -90);
      if (!(await has('map_exchange'))) throw new Error('no Exchange Fire Evacuation Plan');
      if (opts.saveLoad && saved1 && !reloaded1) { reloaded1 = true; await reload(h, P, notes, 0); continue; }
    }
    // ---- CUTSCENE 3-1 "The Last Operator" ----------------------------------------------------------------------------
    if (!(await done('cs:3-1'))) {
      await goRoom(h, P, notes, 'c3_hall');
      await mustReach(h, "SH.mod.Script.cutscene || !!SH.S.done['cs:3-1']", 8, '3-1 starting');
      if (P.play) {
        await shot(h, opts, '31_start');
        await playUntil(h, '!SH.mod.Script.cutscene', 240, '3-1 playing through');
        for (const l of ["I'm on a call.", "That number's not connected.", 'Someone trying to reach someone.', 'Now I fix cracked screens in a shopping centre.',
          'Full bars means something\'s found you.', 'It just stops letting you look away.', 'Jumper tool. For the frame.', 'Status: follow up tomorrow.', 'Wrong number.', 'Mind the stairs.']) await saw(h, l, notes, '3-1');
      }
      await settle(h, P, notes);
      if (!(await done('cs:3-1'))) throw new Error('3-1 did not play');
      if (!(await has('jumper_tool'))) throw new Error('no jumper tool after 3-1');
    }
    // ---- GAMEPLAY 3-2: Wai's talk, the records room, the canteen, the side-aisle Tethered ----------------------------
    // the two Ollie stickers (CONTENT_PLAN §8): under Wai's board, under a canteen table
    if (P.examine && !(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker05)"))) {
      await goRoom(h, P, notes, 'c3_hall');
      await useAt(h, P, notes, 7.98, 5.25, 180);
      if (!(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker05)"))) notes.push('BUG: sticker05 (under Wai\'s board) could not be collected');
    }
    if (P.examine && !(await done('c3:waiTalk'))) {
      for (let k = 0; k < 3; k++) await useAt(h, P, notes, 6.9, 6.3, 180, { play: true });
      await saw(h, 'Impacted. Like a tooth.', notes, 'Wai talk 1');
      await saw(h, "You'd think they'd at least call.", notes, 'Wai talk 2');
      await saw(h, 'Go on. Basement.', notes, 'Wai talk 3');
    }
    await goRoom(h, P, notes, 'c3_hall');
    // the frame-hall doors: a maglock with no power until the fuses are set (spec §9 3-4, §7B)
    if (P.examine && !(await flag('c3_fused')) && !(await done('c3:frameLocked'))) {
      await useAt(h, P, notes, 1.4, 6.63, -90);
      await saw(h, "It's locked.", notes, 'the frame-hall doors before the fuses');
      await saw(h, "There's no power to it.", notes, 'the frame-hall doors before the fuses');
      if ((await room()) !== 'c3_hall') throw new Error('the frame-hall doors opened before the fuses');
    }
    await resolveTethered(h, P, notes, 'c3_hall:tethN', P.cut.tethN, { from: 90 });
    await resolveTethered(h, P, notes, 'c3_hall:tethS', P.cut.tethS, { from: 90 });
    if ((P.logs && !(await read('oplog1'))) || (P.acct4 && !(await read('acct4')))) {
      await goRoom(h, P, notes, 'c3_records');
      await shot(h, opts, 'records');
      if (P.logs && !(await read('oplog1'))) {
        await useAt(h, P, notes, 1.45, 2.6, -90, { play: true });
        for (const d of ['oplog1', 'oplog2', 'oplog3']) if (!(await read(d))) throw new Error(d + ' not read');
      }
      if (P.acct4 && !(await read('acct4'))) {
        await useAt(h, P, notes, 8.55, 4.4, 90, { play: true });
        if (!(await read('acct4'))) throw new Error('Account Note 4 not read');
        await saw(h, 'I wrote that.', notes, 'Account Note 4');
      }
    }
    if (!(await has('extinguisher'))) {
      await goRoom(h, P, notes, 'c3_canteen');
      await shot(h, opts, 'canteen');
      await useAt(h, P, notes, 8.75, 1.4, 90);
      if (!(await has('extinguisher'))) throw new Error('no fire extinguisher');
      await saw(h, 'Still charged. Nineteen seventy-something.', notes, 'the extinguisher');
      if (!(await ev(h, "return !!SH.S.taken['c3_canteen:coffee']"))) await useAt(h, P, notes, 1.5, 5.2, -90);
      if (P.examine && !(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker06)"))) {
        await useAt(h, P, notes, 4.6, 2.95, 180);
        if (!(await ev(h, "return !!(SH.S.stickers && SH.S.stickers.sticker06)"))) notes.push('BUG: sticker06 (under the canteen table) could not be collected');
      }
      if (P.logs && !(await read('oplog4'))) { await useAt(h, P, notes, 9.15, 3.25, 90); if (!(await read('oplog4'))) throw new Error('oplog4 not read'); }
      if (!(await done('break:ch3'))) {
        await ev(h, 'SH.mod.Player.damage && SH.mod.Player.damage(30, "test"); return 1');
        const s1 = await useAt(h, P, notes, 6.3, 4.45, 0, { play: true });
        if (s1.choosing) { await choose(h, 0); await settle(h, P, notes, { play: true }); }
        const hp = await ev(h, 'return SH.S.health');
        notes.push(`break table: health ${hp}`);
        if (hp < 100) notes.push('BUG: the fifteen-minute break did not heal fully');
      }
    }
    // ---- 3-4 the fuse room (down the stairs) ---------------------------------------------------------------------------
    if (!(await flag('c3_fused'))) {
      if (opts.saveLoad && !saved2) { await goRoom(h, P, notes, 'c3_hall'); await payphoneSave(h, P, notes, 1, [39.1, 11.5, 90]); saved2 = true; }
      await goRoom(h, P, notes, 'c3_fuse');
      await shot(h, opts, 'fuse');
      const noteId = riddle === 'easy' ? 'fuse_note_easy' : riddle === 'hard' ? 'fuse_note_hard' : 'fuse_note';
      if (!(await read(noteId))) { await useAt(h, P, notes, 5.2, 3.08, 90); if (!(await read(noteId))) throw new Error(`Wai's note (${noteId}) not read`); }
      if (riddle === 'hard' && !(await read('fuse_spec_hard'))) { await useAt(h, P, notes, 5.2, 1.4, 90); if (!(await read('fuse_spec_hard'))) throw new Error('the Hard spec sheet (watts) not read'); }
      await fuseBoard(h, P, notes, riddle);
      if (opts.saveLoad && saved2 && !reloaded2) { reloaded2 = true; await reload(h, P, notes, 1); continue; }
    }
    // ---- IN-ENGINE 3-3b: the Borrowed on the landing, on the way back up -------------------------------------------
    if (!(await ev(h, "return SH.S.spawns['c3_stairs:borrowed'] || null"))) {
      if ((await room()) !== 'c3_fuse') await goRoom(h, P, notes, 'c3_fuse');
      await takeHop(h, P, notes, HOPS.find((x) => x[0] === 'c3_fuse'));
      await shot(h, opts, 'borrowed');
      await borrowed(h, P, notes);
    }
    // ---- the cable vault: Operator's Log 5, the energy drink, the Unread (torch off) ----------------------------------
    if (P.logs && !(await read('oplog5'))) {
      await ev(h, 'SH.mod.Player.setTorch(false); return 1');
      await goRoom(h, P, notes, 'c3_vault');
      await shot(h, opts, 'vault');
      await useAt(h, P, notes, 1.55, 4.6, -90);
      if (!(await read('oplog5'))) throw new Error('oplog5 not read');
      await useAt(h, P, notes, 1.55, 5.55, -90);
      await heal(h);
      await ev(h, 'SH.mod.Player.setTorch(true); return 1');
    }
    if (P.logs && !(await read('oplog6'))) {
      await goRoom(h, P, notes, 'c3_hall');
      if (!(await flag('c3_fused')) || (await done('cs:3-2'))) { /* Wai's board */ }
      await useAt(h, P, notes, 6.62, 5.2, 180);
      if (!(await read('oplog6'))) notes.push('BUG: Operator\'s Log 6 (under Wai\'s board) could not be read');
    }
    // ---- back in the hall: "Wasn't me on the stairs, mate." --------------------------------------------------------------
    await goRoom(h, P, notes, 'c3_hall');
    if (P.examine && !(await done('c3:waiStairs'))) {
      await useAt(h, P, notes, 3.3, 5.0, -90, { play: true });
      await saw(h, "Wasn't me on the stairs, mate. Check the hands next time.", notes, 'Wai after the stairs');
    }
    // ---- CUTSCENE 3-2 "Impacted" → the Outage → BOSS: the Restructure → 3-3 / 3-3alt ------------------------------------
    if (!(await flag('c3_bossDone'))) {
      if (!(await done('cs:3-2'))) {
        await tp(h, 3.4, 6.63, -90);
        if (!(await walkTo(h, 1.6, 6.63, { maxSec: 10, until: "SH.mod.Script.cutscene || !!SH.S.done['cs:3-2']" }))) throw new Error('3-2 did not start at the frame-hall doors');
        if (P.play) {
          await shot(h, opts, '32_start');
          await playUntil(h, "SH.mod.World.room === 'c3_frame' || !SH.mod.Script.cutscene", 200, '3-2 playing through');
          for (const l of ['Lights are on. Good lad.', 'Look at this.', "I trained the kid who built the booking page.", "They can't just—", 'I used to think that meant something.', 'There she goes.']) await saw(h, l, notes, '3-2');
          if (!(await read('wai_email'))) notes.push("BUG: Wai's Email was not shown in 3-2");
        } else {
          for (let k = 0; k < 30 && !(await ev(h, "return SH.mod.World.room === 'c3_frame' && !SH.mod.World.transitioning")); k++) {
            if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1');
            await advance(h, 0.5);
          }
        }
      }
      await restructure(h, P, notes);
      // 3-3 / 3-3alt
      if (P.play) await playUntil(h, '!SH.mod.Script.cutscene && !SH.mod.World.outageBusy', 200, '3-3 playing through');
      await settle(h, P, notes);
      if (!(await flag('c3_bossDone'))) throw new Error('the chapter did not mark c3_bossDone');
      const ws = await flag('waiSaved');
      notes.push(`Wai ${ws ? 'saved (3-3)' : 'lost (3-3alt)'}`);
      if ((P.wai === 'saved') !== ws) throw new Error(`waiSaved = ${ws}, want ${P.wai}`);
      if (!ws && !(await flag('waiLost'))) notes.push('BUG: waiLost not set after 3-3alt');
      if (P.play && ws) for (const l of ['You plugged me back in.', 'It was going to disconnect you.', 'I was gonna let it.', "Someone should keep the line open.", "You pick one up, I'll be on the other end.", 'Said he could hear phones.']) await saw(h, l, notes, '3-3');
      // Aidan's objective updates (a phone note; the thought itself only shows when the scene plays)
      const obj = await ev(h, "const n = (SH.S.notes || []).find((x) => x && x.id === 'c3_callcentre'); return n ? n.text : null;");
      if (!obj || !obj.includes("Chase went to the call centre. Wai says it keeps every call log in the district.") || !obj.includes("If there's a real number for her, it's there.")) notes.push(`BUG: the objective note after 3-3 is ${JSON.stringify(obj)}`);
      if (P.play) await saw(h, "If there's a real number for her, it's there.", notes, 'the objective');
      if (await ev(h, 'return !!SH.S.outage')) throw new Error('still in the Outage after the Restructure');
      if (!(await has('rmap_exchange'))) { await useAt(h, P, notes, 17.4, 8.6, 180); if (!(await has('rmap_exchange'))) notes.push('BUG: no receipt map (rmap_exchange) in the frame hall'); }
    }
    // ---- the rear yard → the yard gate → CHAPTER CARD "CUSTOMER CARE" --------------------------------------------------
    await goRoom(h, P, notes, 'c3_frame');
    await goRoom(h, P, notes, 'c3_yard');
    await shot(h, opts, 'yard');
    if (!(await walkTo(h, -0.6, 5.0, { maxSec: 30, until: 'SH.S.chapter === 4' }))) throw new Error('walking through the yard gate never started Chapter 4');
    await mustReach(h, "SH.S.chapter === 4 && SH.mod.World.room === 'c4_wirelane' && !SH.mod.World.transitioning", 60, 'Chapter 4 on Wire Lane', { each: "if (SH.mod.Script.skippable && SH.mod.Script.cutscene) {}" });
    await saw(h, 'CUSTOMER CARE', notes, 'the chapter card');
    await advance(h, 0.5);
    break;
  }
  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: { ...S.flags }, calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c3_'))), health: S.health, inv: S.inv.map((i) => i.id + '×' + i.n).join(' '), outage: !!S.outage };`);
  if (S.outage) notes.push('BUG: Chapter 4 started in the Outage');
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `inv: ${S.inv}`);
  return { chapter: 3, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

// =====================================================================================================================
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(3); return 1');
  await mustReach(h, "SH.mod.World.room === 'c3_exchangerd' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Exchange Road');
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected answers (F+2), cuts 3 (F+3), reads Account Note 4 (F+1);
  // coverage answers, cuts 2 and stomps 1, reads Account Note 4; tomorrow declines (A+2) and stomps 3 (A+3)
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [6, 0], deal: [6, 0], coverage: [5, 1], tomorrow: [0, 5] }[cfg.path];
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const ok = st.ch === 4 && st.room === 'c4_wirelane' && trackOk && !errs.length && !bugs.length;
  report(`ch3 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH3_PATH;
  const shots = process.env.CH3_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH3_RIDDLE || 'normal', saveLoad: process.env.CH3_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  const e0 = await errorCount(h);
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch3 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch3_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  await assertNoErrors(h, { since: e0 }).catch((e) => { all = false; console.log(e.message); });
  report('ch3 (all runs)', all);
  return all;
}
