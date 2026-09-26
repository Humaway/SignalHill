// tools/tests/ch4.mjs — Chapter 4 "Customer Care" played start to finish (spec §10 Chapter 4 + Luka call 4, §7B Customer
// Care Centre, §6 the Escalation; CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c4.html && node tools/run.mjs --file .build/c4.html --script tools/tests/ch4.mjs
//   env: CH4_PATH=connected|coverage|tomorrow|deal  CH4_RIDDLE=easy|normal|hard  CH4_SAVELOAD=1  CH4_SHOTS=<dir>
//   With no CH4_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 4 as a real player arrives (S.chapter === 4, Aidan on
// Wire Lane at the exchange's yard gate, carrying the box cutter and the bar). It never resets state. It plays the
// critical path with the real mechanics — street exits and doors (teleport beside them + E), Luka's call 4 answered /
// declined with E / Q, the bus-stop Tethered cut free (hold E with the box cutter) or stomped, the §2A payphone save,
// the Team 3 pod phone listened to (the pulse clicks), the rotary dial typed on the keyboard, the call-log choice, the
// Outage maze walked with real keys, the Escalation (hold E beside Chase, the duress button, both of them through the
// back-office door), the gate key and the boom gate — until Chapter 5 has started on the ring road.
// Decisions follow opts.path:
//   connected — answer Luka, cut the Tethered free, read Account Note 5 and Chase's Notes, Read on (F+3), hold Chase
//               back (chaseHits < 2); 4-1, 4-2 and 4-3 play through
//   coverage  — answer Luka, cut the Tethered free, read Account Note 5, Read on — but let Chase swing until
//               chaseHits ≥ 4 (the Level 3 grab, the hurt variant of 4-3: chaseHurt); scenes skipped
//   tomorrow  — decline Luka, stomp the Tethered, read nothing that tracks Face, Tear it up (A+3); scenes skipped
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the Wire Lane payphone (the chapter's first), go on through the park and into the lobby, reload
// that slot (Game.continueFrom) and play on; later save at the break-room payphone and reload it after the dial.
// → { chapter: 4, F, A, flags, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: true, acct5: true, readLogs: true, chaseNotes: true, hits: 'few', play: true, examine: true },
  coverage: { answer: true, cut: true, acct5: true, readLogs: true, chaseNotes: false, hits: 'many', play: false, examine: false },
  tomorrow: { answer: false, cut: false, acct5: false, readLogs: false, chaseNotes: false, hits: 'few', play: false, examine: false },
};
PATHS.deal = PATHS.connected;

// ---- the connections: [from, to, kind, x, z, yaw] ----------------------------------------------------------------------
// exit: teleport into the street-exit box (armed from a step back); door: stand facing it and press E.
const HOPS = [
  ['c4_wirelane', 'c4_park', 'exit', -0.3, 0, -90],
  ['c4_park', 'c4_wirelane', 'exit', 39, 40.3, 0],
  ['c4_park', 'c4_lobby', 'door', 30.2, 4.55, 180],
  ['c4_lobby', 'c4_park', 'door', 10.2, 11.05, 0],
  ['c4_lobby', 'c4_floor', 'door', 10.0, 0.9, 180],
  ['c4_floor', 'c4_lobby', 'door', 25.1, 27.1, 0],
  ['c4_lobby', 'c4_secoffice', 'door', 19.1, 8.5, 90],
  ['c4_secoffice', 'c4_lobby', 'door', 0.8, 2.0, -90],
  ['c4_floor', 'c4_records', 'door', 7.1, 0.9, 180],
  ['c4_records', 'c4_floor', 'door', 7.1, 7.1, 0],
  ['c4_floor', 'c4_break', 'door', 49.1, 7.1, 90],
  ['c4_break', 'c4_floor', 'door', 0.8, 4.0, -90],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, obusy: !!M.World.outageBusy, menu: M.Menus.isOpen() ? M.Menus.current : null,
  ready: !!(M.Menus._top && M.Menus._top.ready), cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode,
  outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A, hp: S.health, pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.z.toFixed(2)] };`);

// record every subtitle / message / card line (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c4spy) { window.__c4spy = true; window.__c4lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say', 'choice']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c4lines.push(fn[0] + ':' + a.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? 'CHOICE[' + x.map((y) => (typeof y === 'string' ? y : (y && (y.label || y.text)) || '')).join('|') + ']' : '')).filter(Boolean).join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
async function saw(h, text, notes, where) {
  const ok = await ev(h, `return (window.__c4lines || []).some((l) => l.includes(${JSON.stringify(text)}))`);
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
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c4_${name}.png`); } catch (e) { /* optional */ }
}

// advance until `pred` holds, closing any document reading view a scene opens on the way (the player reads it, E)
async function playUntil(h, pred, maxSec, what) {
  const ok = await advanceUntil(h, pred, maxSec, { step: 0.25, each: "if (SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc' && SH.mod.Menus._top && SH.mod.Menus._top.ready) SH.nav('cancel');" });
  if (!ok) throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
}

// Let whatever the game is doing play out: scenes (played or skipped per path), a ringing call (answered / declined per
// path), a document's reading view (closed). Returns when the player has control, or when a choice / keypad waits.
export async function settle(h, P, notes, o = {}) {
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
export async function useAt(h, P, notes, x, z, yaw, o = {}) {
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

// a Reach: a few real swings of the bar from beside it, the Enemies API to put it down, then E to stomp it
async function resolveReach(h, notes, id) {
  const st = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? { x: e.pos.x, z: e.pos.z } : null;`);
  if (!st) return null;
  await equip(h, 'steel_bar');
  const spot = await ev(h, `for (const [dx, dz, yaw] of [[1.4, 0, -90], [-1.4, 0, 90], [0, 1.4, 180], [0, -1.4, 0]]) { const x = ${st.x} + dx, z = ${st.z} + dz; if (SH.mod.World.pointFree(x, z, 0.3)) return [x, z, yaw]; } return [${st.x} + 1.4, ${st.z}, -90];`);
  await tp(h, ...spot);
  await ev(h, "SH.press('ready', 600); return 1");
  for (let k = 0; k < 3; k++) await press(h, 'attack', 0, 0.9);
  await ev(h, 'SH.mod.Input.releaseAll(); return 1');
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.resolved && !e.downed) e.damage(Math.max(1, e.hp), 'steel_bar'); return 1`);
  await advance(h, 0.6);
  const at = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? [e.pos.x, e.pos.z] : null;`);
  if (at) { await tp(h, at[0] + (spot[0] - st.x) * 0.7, at[1] + (spot[1] - st.z) * 0.7, spot[2]); await press(h, 'interact', 0, 1.0); }
  let res = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || e.resolved || null;`);
  if (!res) { await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e) SH.mod.Enemies.kill(e); return 1`); res = 'killed (API)'; }
  notes.push(`${id}: ${res}`);
  await heal(h);
  return res;
}

// the §2A payphone flow: receiver → breathing (or Wai) → "Save your progress?" → slot
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

// walk with real keys through a list of waypoints (throws with the state if a leg does not arrive)
async function walkPath(h, pts, what, o = {}) {
  for (const [x, z] of pts) {
    if (!(await walkTo(h, x, z, { maxSec: o.maxSec ?? 30, tol: o.tol ?? 0.5, run: o.run }))) {
      throw new Error(`walk (${what}) did not reach ${x},${z}: ${JSON.stringify(await snap(h))}`);
    }
    if (o.heal) await heal(h);
  }
}

// the Team 3 pod phone (GAMEPLAY 4-3): static, then the pulse clicks 2-2-3-1 repeating while the handset is up.
// Easy logs the digits after one listen, Normal after two, Hard never (hang up with E).
export async function podPhone(h, P, notes, riddle) {
  await tp(h, 23.65, 17.8, -90);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, 'SH.mod.Script.busy', 5, 'the Team 3 pod phone picked up');
  if (riddle === 'hard') {
    await advance(h, 11);                                              // one full group and a bit, then hang up
    await press(h, 'interact', 0, 0.3);
    await mustReach(h, '!SH.mod.Script.busy', 10, 'hanging up the pod phone');
    if (await ev(h, 'return !!SH.S.flags.c4_clicks')) notes.push('BUG: Hard logged the clicks');
    const n = await ev(h, "return SH.S.done['c4:listens'] | 0");
    notes.push(`pod phone (hard): ${n} listen(s), hung up, not logged`);
  } else {
    await mustReach(h, '!!SH.S.flags.c4_clicks', 40, 'the clicks logged', { step: 0.25 });
    await mustReach(h, '!SH.mod.Script.busy', 15, 'the pod phone put down');
    const n = await ev(h, "return SH.S.done['c4:listens'] | 0");
    const want = riddle === 'easy' ? 1 : 2;
    if (n !== want) notes.push(`BUG: the clicks were logged after ${n} listen(s), want ${want} on ${riddle}`);
    await saw(h, 'Twenty-two thirty-one.', notes, 'the pod phone');
    await saw(h, "...That's the case number.", notes, 'the pod phone');
    const nt = await ev(h, "return (SH.S.notes || []).some((n) => n && /Clicks: 2\\.\\.\\. 2\\.\\.\\. 3\\.\\.\\. 1\\./.test(n.text))");
    if (!nt) notes.push('BUG: the phone notes do not log "Clicks: 2... 2... 3... 1."');
    notes.push(`pod phone (${riddle}): logged after ${n} listen(s)`);
  }
  await settle(h, P, notes);
}
// the records door's rotary dial: E, then dial the number on the keyboard (a wrong one first on the connected path)
export async function rotary(h, P, notes, wrongFirst) {
  await tp(h, 8.05, 0.95, 180);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, 'SH.mod.UI.capturing()', 20, 'the rotary dial', { step: 0.2 });
  await advance(h, 0.8);
  if (wrongFirst) {
    await h.page.keyboard.type('1961', { delay: 40 });
    // (the refusal is written into the dial's own message line once the fourth digit has run back)
    const refused = await advanceUntil(h, "[...document.querySelectorAll('.ui-kp-msg')].some((m) => m.textContent.includes('Nothing. Just a dial tone.'))", 10, { step: 0.2 });
    await advance(h, 1.5);
    if (!(await ev(h, 'return SH.mod.UI.capturing()'))) throw new Error('the rotary dial closed on a wrong number');
    if (!refused) notes.push('MISSING line (the rotary dial (wrong)): Nothing. Just a dial tone.');
    notes.push('rotary: 1961 refused');
  }
  // (in the headless harness a typed digit is now and then lost before the dial reads it: a player would clear the dial
  // with Backspace and dial again, and so does this)
  for (let attempt = 0; attempt < 3; attempt++) {
    await h.page.keyboard.type('2231', { delay: 60 });
    if (await advanceUntil(h, '!SH.mod.UI.capturing()', 12, { step: 0.25 })) break;
    notes.push(`FLAKE: the rotary dial did not take all four digits (attempt ${attempt + 1}); cleared and dialled again`);
    await h.page.keyboard.press('Backspace');
    await advance(h, 1.0);
  }
  await mustReach(h, '!SH.mod.UI.capturing()', 5, 'the rotary dial taking 2231');
  await settle(h, P, notes);
  if (!(await ev(h, "return !!SH.S.done['unlocked:c4_floor:records']"))) throw new Error('the records door did not unlock after 2231');
  await saw(h, 'It took it.', notes, 'the rotary dial');
}

// walk with real keys to (x, z) during the fight, topping Aidan's health up as a player would with the coffee and energy
// drinks he carries (the walk itself is what is tested, not the damage race)
function walkFight(h, x, z, o = {}) {
  const tol = o.tol ?? 0.45;
  return walkTo(h, x, z, { ...o, until: `(SH.S.health < 55 ? (SH.mod.Player.heal(100), false) : false) || Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z}) < ${tol}` + (o.stop ? ` || (${o.stop})` : '') });
}
// Chase's distance from Aidan (page expression) and position
const CHASE_D = "(() => { const b = SH.mod.World.build, c = b && b.npcs && b.npcs.chase; return c ? Math.hypot(c.root.position.x - SH.mod.Player.pos.x, c.root.position.z - SH.mod.Player.pos.z) : 99; })()";
// the fight is over: both of them went through the back-office door (C4_officeDoor → c4_bossDone → 4-3 moves them into
// the security office, where the old store's Chase NPC no longer exists)
const BOSS_DONE = '!!(SH.S.flags && SH.S.flags.c4_bossDone)';
// walk to (x, z) with E held and Chase in tow, as a player keeps him: whenever he drops behind (the Escalation knocks him
// back, or he snags on the counter) turn back for him first — E still held takes hold of him again within 2 m.
// → true on arrival, false when he never got there, 'through' when an E press on the way (the one that takes hold of him
// again) was also on the back-office door with him beside Aidan: the door's interact spot (r 1.4) is 0.9 m past the last
// leg's end, and a player's press there takes them both through, as the spec's "both through the back-office door" wants
async function walkWithChase(h, x, z, o = {}) {
  const tol = o.tol ?? 0.45;
  for (let k = 0; k < 14; k++) {
    if (await ev(h, `return ${BOSS_DONE}`)) return 'through';
    const d = await ev(h, `return ${CHASE_D}`);
    if (d > 1.8) {
      const c = await ev(h, 'const b = SH.mod.World.build, c = b && b.npcs && b.npcs.chase; return c ? [c.root.position.x, c.root.position.z] : null');
      if (!c) { if (await advanceUntil(h, BOSS_DONE, 1)) return 'through'; throw new Error('Chase is gone from the old store mid-fight: ' + JSON.stringify(await snap(h))); }
      await walkFight(h, c[0], c[1], { maxSec: 6, tol: 1.1, stop: BOSS_DONE });
      await advance(h, 0.4);
      continue;
    }
    await walkFight(h, x, z, { maxSec: o.maxSec ?? 15, tol, stop: `${CHASE_D} > 2.1 || ${BOSS_DONE}` });
    if ((await ev(h, `return Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z})`)) < tol + 0.05) return true;
  }
  return false;
}

// the Escalation (BOSS): Chase swings every 4 s unless Aidan holds E within 2 m; the duress button; both through the
// back-office door. P.hits 'few' holds him back from the start; 'many' lets him swing until chaseHits ≥ 4 (the grab).
export async function escalation(h, P, notes) {
  await mustReach(h, "SH.mod.World.room === 'c4_oldstore' && !SH.mod.Script.cutscene && SH.mod.Player.control !== false", 120, 'the Escalation handing control back');
  await shot(h, P.__opts || {}, 'boss');
  await saw(h, 'Get Chase to the back office.', notes, 'the boss objective');
  const chase = () => ev(h, `let p = null; await SH.run(async (G) => { const C = G.actor('chase'); if (C && C.raw) p = [C.raw.root.position.x, C.raw.root.position.z]; }); return p;`);
  const hits = () => ev(h, 'return SH.S.chaseHits | 0');
  // (for the notes: where Chase and the Escalation are, and Chase's fight state)
  const fightSnap = () => ev(h, `const f = SH.c4 && SH.c4.fight, F = f ? { state: f.state, held: f.held, hurt: f.hurt, path: f.path ? f.path.length : 0 } : null; const b = SH.mod.World.build, c = b && b.npcs && b.npcs.chase, e = SH.mod.Enemies.get('c4_oldstore:esc');
    const r = (v) => +v.toFixed(2);
    return { chase: c ? [r(c.root.position.x), r(c.root.position.z)] : null, esc: e ? [r(e.pos.x), r(e.pos.z), e.data.state, e.data.level] : null, F: F || null };`);
  const level = () => ev(h, "const e = SH.mod.Enemies.get('c4_oldstore:esc'); return e ? e.data.level : -1");
  // 1. the duress button under the counter (the staff side)
  await heal(h);
  if (P.hits === 'many') {
    // the duress button first (behind the counter), then stand back by the demo tables and let him swing (and take what
    // comes) until Level 3 has him; then walk him to the door along the front of the store
    await tp(h, 15.6, 2.25, 0);
    await press(h, 'interact', 0, 0.4);
    await advanceUntil(h, "!!SH.S.done['c4:duress']", 3);
    await advanceUntil(h, '!SH.mod.Script.busy', 8);
    await tp(h, 6.0, 7.5, 90);
    for (let k = 0; k < 60 && (await hits()) < 4; k++) { await advance(h, 1.0); if ((await ev(h, 'return SH.S.health')) < 60) await heal(h); }
    if ((await hits()) < 4) throw new Error('Chase never reached four hits: ' + (await hits()));
    notes.push(`chaseHits ${await hits()} (Escalation level ${await level()})`);
    // the grab: Level 3 takes hold of him once
    await mustReach(h, '!!SH.S.flags.c4_chaseGrabbed', 20, 'the Level 3 grab', { each: 'if (SH.S.health < 60) SH.mod.Player.heal(100);' });
    await advance(h, 3.5);
    notes.push('the Level 3 grab happened');
  }
  // (a free spot beside Chase, facing him)
  const besideChase = async () => {
    const c = await chase();
    if (!c) throw new Error('cannot find Chase in the old store');
    return ev(h, `for (const [dx, dz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) { const x = ${c[0]} + dx, z = ${c[1]} + dz; if (x > 0.4 && x < 19.6 && z > 0.4 && z < 11.6 && SH.mod.World.pointFree(x, z, 0.3)) return [x, z, Math.atan2(-dx, -dz) * 180 / Math.PI]; } return [${c[0]} - 0.9, ${c[1]}, 90];`);
  };
  const chaseDist = () => ev(h, `let d = 99; await SH.run(async (G) => { const C = G.actor('chase'); if (C && C.raw) d = Math.hypot(C.raw.root.position.x - SH.mod.Player.pos.x, C.raw.root.position.z - SH.mod.Player.pos.z); }); return d;`);
  if (P.hits === 'few') {
    // hold him back from the first second: straight to him behind the counter, hold E (he follows), take him along to
    // the duress button and tap E there (a fresh press while still holding)
    await tp(h, ...(await besideChase()));
    await ev(h, "SH.press('interact', 600); return 1");
    try {
      await advance(h, 0.5);
      if (!(await walkWithChase(h, 15.6, 2.3, { maxSec: 10, tol: 0.3 }))) notes.push('walk to the duress button (holding Chase) did not arrive: ' + JSON.stringify(await snap(h)));
      await ev(h, 'SH.mod.Player.face(0); return 1');
      await advance(h, 0.1);
      await ev(h, "SH.press('interact', 600); return 1");
      await advanceUntil(h, "!!SH.S.done['c4:duress']", 4);
      await advanceUntil(h, '!SH.mod.Script.busy', 10);
    } finally { await ev(h, 'SH.mod.Input.releaseAll(); return 1'); }
    if (await ev(h, "return !!SH.S.done['c4:duress']")) notes.push(`duress button pressed (holding Chase; chaseHits ${await hits()})`);
  }
  if (!(await ev(h, "return !!SH.S.done['c4:duress']"))) {
    await tp(h, 15.6, 2.25, 0);
    await press(h, 'interact', 0, 0.4);
    await advanceUntil(h, "!!SH.S.done['c4:duress']", 3);
  }
  if (!(await ev(h, "return !!SH.S.done['c4:duress']"))) { await tp(h, 15.6, 2.3, 0); await press(h, 'interact', 0, 0.4); }
  if (!(await ev(h, "return !!SH.S.done['c4:duress']"))) throw new Error('the duress button did not press: ' + JSON.stringify(await snap(h)));
  await advance(h, 0.3);
  // 2. hold him back and walk him to the back office door (round the counter's east end from behind it), wait for him at
  //    the door, release, E on the door. When the Escalation knocks him out of Aidan's hold, go back for him.
  for (let tries = 0; tries < 8; tries++) {
    if (await ev(h, 'return !!SH.S.flags.c4_bossDone')) break;
    if ((await ev(h, 'return SH.mode')) === 'death') break;
    await heal(h);
    if ((await chaseDist()) > 1.6) await tp(h, ...(await besideChase()));
    await ev(h, "SH.press('interact', 600); return 1");
    try {
      await advance(h, 0.5);
      const behind = await ev(h, 'return SH.mod.Player.pos.z < 3.9 && SH.mod.Player.pos.x < 16.9');
      // (round the counter's east end wide, along the east wall: the Escalation follows Aidan behind the counter and
      // stands at its east end, and a straight line past the end runs into the counter's corner or into it)
      const legs = behind ? [[17.1, 2.3], [18.7, 3.1], [18.8, 6.0], [18.55, 8.5]] : [[18.55, 8.5]];
      let through = false;
      for (const [x, z] of legs) {
        const r = await walkWithChase(h, x, z, { maxSec: 15, tol: 0.45 });
        if (r === 'through') { through = true; notes.push(`through the back-office door with Chase on an E press on the way to it (try ${tries + 1})`); break; }
        if (!r) { notes.push(`walk to ${x},${z} (holding Chase, try ${tries + 1}) did not arrive: ${JSON.stringify(await snap(h))} · ${JSON.stringify(await fightSnap())}`); break; }
      }
      if (through) break;
      for (let k = 0; k < 12 && (await chaseDist()) > 2.2; k++) await advance(h, 0.25);
    } finally { await ev(h, 'SH.mod.Input.releaseAll(); return 1'); }
    await advance(h, 0.1);
    await tp(h, 18.9, 8.5, 90);
    await press(h, 'interact', 0, 0.5);
    if (await advanceUntil(h, '!!SH.S.flags.c4_bossDone', 2)) break;
    await advanceUntil(h, '!SH.mod.Script.busy', 6);
  }
  if ((await ev(h, 'return SH.mode')) === 'death') throw new Error('Aidan died in the Escalation: ' + JSON.stringify(await snap(h)));
  if (!(await ev(h, 'return !!SH.S.flags.c4_bossDone'))) throw new Error('never got Chase into the back office: ' + JSON.stringify(await snap(h)));
  notes.push(`into the back office (chaseHits ${await hits()})`);
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = { ...(PATHS[path] || PATHS.connected), __opts: opts };
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 4) throw new Error('ch4.play: not at Chapter 4: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if (!opts.resume && (await ev(h, 'return SH.mod.World.room')) !== 'c4_wirelane') throw new Error('ch4.play: expected to start on Wire Lane');
  const F0 = start.F, A0 = start.A;
  const riddle = opts.riddle || (await ev(h, "return (SH.S.difficulty && SH.S.difficulty.riddle) || 'normal'"));
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);
  const done = (k) => ev(h, `return !!(SH.S.done && SH.S.done[${JSON.stringify(k)}])`);
  const has = (id) => ev(h, `return SH.S.inv.some((i) => i && i.id === ${JSON.stringify(id)})`);
  const read = (d) => ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(d)}])`);
  const room = () => ev(h, 'return SH.mod.World.room');
  let saved1 = false, reloaded1 = false, saved2 = false, reloaded2 = false;

  for (let pass = 0; pass < 5; pass++) {
    // ---- 4A Wire Lane: a short real walk down the hill, the payphone outside the lines depot ----------------------------
    if ((await room()) === 'c4_wirelane') {
      await shot(h, opts, 'wirelane');
      if ((await ev(h, 'return SH.mod.Player.pos.x')) > 80 && !(await walkTo(h, 78, 0.5, { maxSec: 12, tol: 0.8 }))) notes.push('BUG: could not walk down Wire Lane from the yard gate');
      if (opts.saveLoad && !saved1) { await payphoneSave(h, P, notes, 0, [57.5, -2.75, 180]); saved1 = true; }
      if (P.examine) { await useAt(h, P, notes, 38.5, 3.2, 0); await saw(h, "It's humming.", notes, 'the substation'); }
      await takeHop(h, P, notes, HOPS[0]);
    }
    // ---- 4A the business park: CALL 4, the Tethered at the bus stop ------------------------------------------------------
    if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka4)')) || !(await ev(h, "return SH.S.spawns['c4_park:teth'] || null"))) {
      await goRoom(h, P, notes, 'c4_park');
      await shot(h, opts, 'park_stem');
      if (!(await ev(h, 'return !!(SH.S.calls && SH.S.calls.luka4)'))) {
        await walkTo(h, 39, 33, { maxSec: 10, until: "!!SH.mod.Phone.ringing || !!(SH.S.calls && SH.S.calls.luka4)" });
        await mustReach(h, "SH.mod.Phone.ringing === 'luka4' || !!(SH.S.calls && SH.S.calls.luka4)", 12, 'Luka call 4 ringing on entering the business park');
        await shot(h, opts, 'park_call');
        await settle(h, P, notes, { play: true });
        const c = await ev(h, 'return SH.S.calls.luka4');
        if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka4 ended as ' + c);
        if (P.answer) { await saw(h, "I'm here. I think I'm here.", notes, 'luka4'); await saw(h, 'Go home, Luka.', notes, 'luka4'); await saw(h, 'Not without you.', notes, 'luka4'); }
      }
      await resolveTethered(h, P, notes, 'c4_park:teth', P.cut, { from: 180, swing: true });
      if (P.examine) { await useAt(h, P, notes, 27.9, 24.65, 0); await saw(h, 'Route 44.', notes, 'the bus-stop timetable'); }
    }
    // ---- 4B the lobby: the Floor Plan on the reception counter, the ticket machine, the sign, the Champion wall -----------
    if (!(await has('map_care'))) {
      await goRoom(h, P, notes, 'c4_lobby');
      await shot(h, opts, 'lobby');
      await useAt(h, P, notes, 16.35, 5.15, 180);
      if (!(await has('map_care'))) throw new Error('no Care Centre Floor Plan from the reception counter');
      await useAt(h, P, notes, 7.3, 11.35, 180, { play: true });
      await saw(h, 'You are number 4,112.', notes, 'the ticket machine');
      await saw(h, 'Four thousand one hundred and twelve.', notes, 'the ticket machine');
      if (!(await has('ticket'))) notes.push('BUG: no queue ticket from the ticket machine');
      await useAt(h, P, notes, 13.9, 5.35, 180, { play: true });
      await saw(h, 'We are experiencing higher than normal call volumes.', notes, 'the reception sign');
      await saw(h, 'Always.', notes, 'the reception sign');
      await useAt(h, P, notes, 1.6, 6.1, -90, { play: true });
      await saw(h, "Every one of them's smiling.", notes, 'the Care Champion wall');
      if (opts.saveLoad && saved1 && !reloaded1) { reloaded1 = true; await reload(h, P, notes, 0); continue; }
    }
    // ---- 4C Floor 1: CUTSCENE 4-1 "A Funny Story" in Chase's aisle ---------------------------------------------------------
    if (!(await done('cs:4-1'))) {
      await goRoom(h, P, notes, 'c4_floor');
      await shot(h, opts, 'floor_in');
      if (P.examine) {
        // a ringing desk phone: a snippet
        await useAt(h, P, notes, 24.2, 21.6, 180, { play: true }).catch(() => null);
      }
      await walkPath(h, [[18.6, 19.3]], 'across the centre to row 6', { heal: true });
      const in41 = "SH.mod.Script.cutscene || !!SH.S.done['cs:4-1']";
      if (!(await walkTo(h, 10.8, 19.3, { maxSec: 12, until: in41 }))) {
        // (once, a run stalled on this walk — the state says where; walk on down the aisle's middle from there)
        notes.push('the walk down row 6\'s aisle stalled: ' + JSON.stringify(await snap(h)));
        await advanceUntil(h, `(${in41}) || (SH.mode === 'play' && !SH.mod.Script.busy)`, 20);
        if (!(await walkTo(h, 10.8, 19.2, { maxSec: 16, until: in41 }))) throw new Error('4-1 did not start in Chase\'s aisle: ' + JSON.stringify(await snap(h)));
      }
      if (P.play) {
        await shot(h, opts, '41_start');
        await playUntil(h, '!SH.mod.Script.cutscene', 240, '4-1 playing through');
        for (const l of ['Chase?', 'They keep ringing.', 'Every phone in here. I picked one up.', 'Bloke yelling. Thought it was him.', 'Who?', 'You know how I said it was footy?',
          "Wasn't footy.", 'Late shift. Thursday.', 'He comes over the counter.', 'Shoves me into the back wall.', 'Leader was on break. I was on my own.',
          'Told everyone it was funny.', "It's a funny story, right?", "...It's not funny, Chase.", 'Nah. It\'s not.', "If I'd just hit him first.",
          "Then you'd be the one who—", "Don't.", "Records room's down the back.", "I'll watch the lobby."]) await saw(h, l, notes, '4-1');
      }
      await settle(h, P, notes);
      if (!(await done('cs:4-1')) || !(await flag('c4_metChase'))) throw new Error('4-1 did not play (c4_metChase)');
      if (P.chaseNotes) {
        await useAt(h, P, notes, 6.75, 18.25, 200);
        if (!(await read('chase_notes'))) notes.push("BUG: Chase's Notes could not be read on his desk after 4-1");
      }
      if (opts.saveLoad && !saved2) {
        await goRoom(h, P, notes, 'c4_break');
        await shot(h, opts, 'break');
        await payphoneSave(h, P, notes, 1, [1.9, 1.15, 180]);
        saved2 = true;
      }
    }
    // ---- 4F the break room: the fifteen-minute break, the pickups (connected) -----------------------------------------------
    if (P.examine && !(await done('break:ch4'))) {
      await goRoom(h, P, notes, 'c4_break');
      await ev(h, 'SH.mod.Player.damage(30, "test"); return 1');
      const s1 = await useAt(h, P, notes, 4.9, 2.75, 0, { play: true });
      if (s1.choosing) { await choose(h, 0); await settle(h, P, notes, { play: true }); }
      const hp = await ev(h, 'return SH.S.health');
      notes.push(`break table: health ${hp}`);
      if (hp < 100) notes.push('BUG: the fifteen-minute break did not heal fully');
      for (const [x, z, yaw, id] of [[8.95, 2.9, 90, 'c4_break:coffee1'], [8.95, 4.4, 90, 'c4_break:coffee2'], [8.55, 6.6, 0, 'c4_break:energy']]) {
        await useAt(h, P, notes, x, z, yaw);
        if (!(await ev(h, `return !!(SH.S.taken && SH.S.taken[${JSON.stringify(id)}])`))) notes.push(`BUG: ${id} was not picked up`);
      }
    }
    // ---- 4D the team-leader pods: Huddle Whiteboard 2, Account Note 5, the ringing phone with the clicks ---------------------
    if (!(await done('unlocked:c4_floor:records'))) {
      await goRoom(h, P, notes, 'c4_floor');
      await shot(h, opts, 'pods');
      if (!(await read('huddle2'))) { await useAt(h, P, notes, 20.35, 17.6, -90); if (!(await read('huddle2'))) notes.push('BUG: Huddle Whiteboard 2 could not be read in the Team 3 pod'); }
      if (P.acct5 && !(await read('acct5'))) {
        await useAt(h, P, notes, 21.3, 4.55, 0, { play: true });
        if (!(await read('acct5'))) throw new Error('Account Note 5 not read from the pod drawer');
      }
      if (riddle === 'hard' || !(await flag('c4_clicks'))) await podPhone(h, P, notes, riddle);
      // the laminated card by the dial (Story), then the dial
      if (!(await read('rotary_card'))) { await useAt(h, P, notes, 8.05, 0.95, 180); if (!(await read('rotary_card'))) notes.push('BUG: the laminated rotary card could not be read'); }
      await rotary(h, P, notes, P.examine);
      if (opts.saveLoad && saved2 && !reloaded2) { reloaded2 = true; await reload(h, P, notes, 1); continue; }
    }
    // ---- 4E IN-ENGINE 4-4 the call logs → the Outage -------------------------------------------------------------------------
    if (!(await flag('c4_logs'))) {
      await goRoom(h, P, notes, 'c4_records');
      await shot(h, opts, 'records');
      if (!(await walkTo(h, 5.3, 5.6, { maxSec: 10, until: "SH.mod.Script.busy || !!SH.S.flags.c4_logs" }))) throw new Error('4-4 did not start at the table');
      // the Call Logs open by themselves on the first page, the highlights; then the choice
      await mustReach(h, "(SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc') || SH.mod.Script.choosing", 30, 'the Call Logs opening by themselves', { step: 0.2 });
      if (!(await ev(h, "return SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc'"))) notes.push('BUG: 4-4 did not open the Call Logs before the choice');
      await shot(h, opts, 'logs_doc');
      await playUntil(h, 'SH.mod.Script.choosing', 60, 'the call-log choice');
      if (!(await ev(h, "return (window.__c4lines || []).some((l) => l.includes('CHOICE[Read on|Tear it up]'))"))) notes.push('MISSING choice labels (4-4): Read on / Tear it up');
      await choose(h, P.readLogs ? 0 : 1);
      await playUntil(h, '!!SH.S.outage && !SH.mod.World.outageBusy && !SH.mod.Script.busy', 90, 'the Outage taking the building');
      await settle(h, P, notes);
      if ((await ev(h, 'return SH.S.flags.c4_logs')) !== (P.readLogs ? 'read' : 'torn')) throw new Error('c4_logs = ' + (await ev(h, 'return SH.S.flags.c4_logs')));
      if (P.readLogs) await saw(h, "'Assigned: Aidan.'", notes, '4-4 Read on');
      notes.push(`4-4: ${P.readLogs ? 'Read on' : 'Tear it up'}`);
      await shot(h, opts, 'records_outage');
      await useAt(h, P, notes, 8.55, 5.5, 0);
      if (!(await has('rmap_care'))) notes.push('BUG: no receipt map (rmap_care) from the records printer');
    }
    // ---- 4-5 the Outage Care Centre: the maze along the west wall, to the lobby doors (Chase's old store) ---------------------
    if (!(await flag('c4_bossDone'))) {
      if ((await room()) === 'c4_records') await takeHop(h, P, notes, HOPS.find((x) => x[0] === 'c4_records'));
      if ((await room()) === 'c4_floor') {
        await shot(h, opts, 'maze_in');
        await equip(h, 'steel_bar');
        // the three Reaches in the maze: fought (real swings, then the API) before the walk — standing and trading blows
        // in a corridor while walking blind would only test the walker
        for (const id of ['c4_floor:oreach1', 'c4_floor:oreach2', 'c4_floor:oreach3']) await resolveReach(h, notes, id);
        await tp(h, 7.1, 0.9, -90);                                    // back at the records door
        // records door → west along the north aisle → the walkway → C1 east → the row-3 gap → C2 west → the walkway →
        // C3 east → the row-7 gap → A7 west → the walkway → A8 → the SW door
        const route = [[1.0, 0.8], [0.8, 5.2], [16.9, 5.2], [16.95, 11.8], [0.8, 12.0], [0.8, 17.6], [16.95, 17.7], [16.95, 22.4], [0.8, 22.4], [0.8, 26.3]];
        const walked = await (async () => { try { await walkPath(h, route, 'the Outage maze', { heal: true, run: true, maxSec: 40 }); return true; } catch (e) { notes.push('maze walk: ' + e.message.split('\n')[0]); return false; } })();
        if (!walked) notes.push('BUG: the Outage maze could not be walked end to end');
        await shot(h, opts, 'maze_door');
        await tp(h, 0.8, 26.3, -90);
        await press(h, 'interact', 0, 0.3);
        await mustReach(h, "SH.mod.World.room === 'c4_oldstore' && !SH.mod.World.transitioning", 10, 'the side door into Chase\'s old store');
      }
      // CUTSCENE 4-2 "Hit 'Em First" → BOSS: the Escalation → CUTSCENE 4-3 "Safe Room"
      // (a CONTINUE from the autosave before the fight goes straight back into it: 4-2 is not played again)
      if (opts.resume && (await done('cs:4-2'))) {
        await mustReach(h, "SH.mod.Script.list().some((c) => c.name === 'boss:escalation')", 10, 'the Escalation again after CONTINUE');
      } else if (P.play) {
        await mustReach(h, 'SH.mod.Script.cutscene', 8, '4-2 starting');
        await shot(h, opts, '42_start');
        await playUntil(h, "!SH.mod.Script.cutscene && SH.mod.Player.control !== false", 120, '4-2 playing through');
        for (const l of ['I just need a new SIM.', "I don't have ID. I just need it.", "Can't do it without ID, mate.", 'Do it anyway.', "Chase, don't—", "Hit 'em first, right?", "Hit 'em first."]) await saw(h, l, notes, '4-2');
      } else {
        for (let k = 0; k < 40 && (await ev(h, 'return !!SH.mod.Script.cutscene')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.5); }
      }
      await escalation(h, P, notes);
      // 4-3
      await mustReach(h, "SH.mod.World.room === 'c4_secoffice' || !!SH.S.flags.c4_done", 30, 'the safe room');
      if (P.play) {
        await shot(h, opts, '43_start');
        await playUntil(h, '!!SH.S.flags.c4_done && !SH.mod.Script.cutscene', 200, '4-3 playing through');
        const hurt = await flag('chaseHurt');
        for (const l of ["...He's just a bloke.", 'Yeah.', "He's just having a shocker of a day.", "Doesn't mean I have to stand there and take it, though. Right?", 'No.', 'It means you get to leave.',
          'Look at you. Six months in and giving pep talks.', 'Where to next, legend?', 'The call log said the case got escalated.', 'If I can get to it, I can fix it.', 'Fix it?', 'Or bin it?',
          hurt ? "Go. I'm alright." : "I'll catch up. Gonna sit here a sec."]) await saw(h, l, notes, '4-3');
      }
      await settle(h, P, notes);
      if (!(await flag('c4_done'))) throw new Error('4-3 did not finish (c4_done)');
      if (await ev(h, 'return !!SH.S.outage')) throw new Error('still in the Outage after 4-3');
      const hurt = await flag('chaseHurt'), hits = await ev(h, 'return SH.S.chaseHits | 0');
      notes.push(`4-3: chaseHits ${hits}, chaseHurt ${hurt}`);
      if ((hits >= 4) !== hurt) notes.push(`BUG: chaseHurt ${hurt} with chaseHits ${hits}`);
      if (P.hits === 'few' && hits >= 2) notes.push(`BUG: holding Chase back still let him land ${hits} hits`);
    }
    // ---- the gate key, back out through the lobby, the boom gate → CHAPTER CARD "LEVEL 4" ---------------------------------
    if (!(await has('gate_key')) && !(await done('c4:gateOpen'))) {
      await goRoom(h, P, notes, 'c4_secoffice');
      await shot(h, opts, 'secoffice');
      await useAt(h, P, notes, 1.25, 3.0, 0);
      if (!(await has('gate_key'))) throw new Error('no gate key from the safe room key board');
    }
    await goRoom(h, P, notes, 'c4_park');
    if (!(await done('c4:gateOpen'))) {
      await useAt(h, P, notes, 52.0, 23.85, 90, { play: true });
      if (!(await done('c4:gateOpen'))) throw new Error('the boom gate did not open with the gate key');
      await saw(h, 'The key fits.', notes, 'the boom gate');
    }
    await shot(h, opts, 'boom_open');
    if (!(await walkTo(h, 57.6, 19.5, { maxSec: 20, until: 'SH.S.chapter === 5' }))) throw new Error('walking through the boom gate never started Chapter 5');
    await mustReach(h, "SH.S.chapter === 5 && SH.mod.World.room === 'c5_ringroad' && !SH.mod.World.transitioning", 60, 'Chapter 5 on the ring road');
    await saw(h, 'LEVEL 4', notes, 'the chapter card');
    await advance(h, 0.5);
    break;
  }
  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: { ...S.flags }, calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c4_'))), health: S.health, inv: S.inv.map((i) => i.id + '×' + i.n).join(' '), outage: !!S.outage, chaseHits: S.chaseHits | 0 };`);
  if (S.outage) notes.push('BUG: Chapter 5 started in the Outage');
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `inv: ${S.inv}`);
  return { chapter: 4, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, chaseHits: S.chaseHits, notes };
}

// =====================================================================================================================
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(4); return 1');
  await mustReach(h, "SH.mod.World.room === 'c4_wirelane' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Wire Lane');
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected answers (F+2), cuts the Tethered (F+1), reads Account Note 5 (F+1) and the
  // call logs (F+3); coverage the same; tomorrow declines (A+2), stomps (A+1) and tears the logs (A+3)
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [7, 0], deal: [7, 0], coverage: [7, 0], tomorrow: [0, 6] }[cfg.path];
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const ok = st.ch === 5 && st.room === 'c5_ringroad' && trackOk && !errs.length && !bugs.length;
  report(`ch4 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} chaseHits=${r.chaseHits} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH4_PATH;
  const shots = process.env.CH4_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH4_RIDDLE || 'normal', saveLoad: process.env.CH4_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch4 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch4_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  return all;
}
