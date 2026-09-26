// tools/tests/ch6.mjs — Chapter 6 "The Middle" played start to finish (spec §11 Chapter 6 + Luka call 7, §7B Regional
// Office Levels 5–6 and the lift shaft, §6 the Middle / the Standard, §13 Case File, Luka's Meeting Notes, Huddle
// Whiteboard 4, Account Note 6; CONTENT_PLAN §2).
//
//   node tools/build.mjs --out .build/c6.html && node tools/run.mjs --file .build/c6.html --script tools/tests/ch6.mjs
//   env: CH6_PATH=connected|coverage|tomorrow|deal  CH6_RIDDLE=easy|normal|hard  CH6_SAVELOAD=1  CH6_SHOTS=<dir>
//   With no CH6_PATH it runs the matrix connected/normal/saveLoad · tomorrow/hard · coverage/easy in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 6 as a real player arrives (S.chapter === 6, Aidan on
// Level 4 of the regional office outside the escalations office, carrying Chloe's keycard, the box cutter and the bar).
// It never resets state. It plays the critical path with the real mechanics — doors (teleport beside them + E), the
// keycard door, the Case File that opens by itself, the terminal's two buttons (arrow keys + confirm), the fire stairs
// walked with real keys, the Fire Stairs Plan, the Level 6 maglock and its note, the site power board, Luka's call 7
// answered / declined with E / Q, the Tethered cut free (hold E with the box cutter) or stomped, the Reach fought, the
// §2A payphone save, Luka's back office (its documents, the roster, the cold coffee), the voice from lift B, forcing
// the doors (hold E) into the Outage, the shaft — the ladder climbed down with S under the swatting hands, the hatch,
// the brace in the car (hold E, let go in the red, hold again) — and "Is that all of it?", until Chapter 7 has started
// on the ring road.
// Decisions follow opts.path:
//   connected — answer Luka, cut both Tethered free, read Account Note 6 and the office's documents, "Leave it open",
//               "...No."; the brace clean; 6-case, 6-terminal, 6-voice, 6-1 and 6-2 play through
//   coverage  — answer Luka, cut both Tethered free, read Account Note 6, "Leave it open", [Stay silent]; miss the brace
//               twice first (the car drops a level, part 2 restarts); scenes skipped
//   tomorrow  — decline Luka, stomp both Tethered, read nothing that tracks Face, "Close case", "That's all of it.";
//               scenes skipped
//   deal      — as connected (the deal only matters in Chapter 8)
// opts.saveLoad — save at the Level 6 lobby payphone (the chapter's first), go into Luka's back office, reload that slot
// (Game.continueFrom) and play on.
// → { chapter: 6, F, A, flags, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { answer: true, cut: true, acct6: true, docs: true, openCase: true, reply: 2, play: true, examine: true, brace: 'clean', walk: true },
  coverage: { answer: true, cut: true, acct6: true, docs: false, openCase: true, reply: 0, play: false, examine: false, brace: 'drop', walk: false },
  tomorrow: { answer: false, cut: false, acct6: false, docs: false, openCase: false, reply: 1, play: false, examine: false, brace: 'clean', walk: false },
};
PATHS.deal = PATHS.connected;

// ---- the connections: [from, to, x, z, yaw] — stand facing the door and press E --------------------------------------
const HOPS = [
  ['c5_level4', 'c6_escalations', 3.0, 5.6, 180],
  ['c6_escalations', 'c5_level4', 3.0, 4.35, 0],
  ['c5_level4', 'c6_firestairs', 0.8, 27.4, -90],
  ['c6_firestairs', 'c5_level4', 0.8, 5.15, 0],
  ['c6_firestairs', 'c6_level5', 2.85, 5.15, 0],
  ['c6_level5', 'c6_firestairs', 2.0, 23.35, 0],
  ['c6_firestairs', 'c6_level6', 4.95, 5.15, 0],
  ['c6_level6', 'c6_firestairs', 2.0, 23.35, 0],
  ['c6_level6', 'c6_lukaoffice', 9.0, 19.35, 0],
  ['c6_lukaoffice', 'c6_level6', 1.2, 0.8, 180],
];

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, obusy: !!M.World.outageBusy, menu: M.Menus.isOpen() ? M.Menus.current : null,
  ready: !!(M.Menus._top && M.Menus._top.ready), cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode,
  outage: !!S.outage, chapter: S.chapter, F: S.F, A: S.A, hp: S.health, ctl: M.Player.control !== false,
  pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.y.toFixed(2), +M.Player.pos.z.toFixed(2)], cam: SH.state().cam };`);

// record every subtitle / message / card / choice line (the dialogue checks read them back)
async function spy(h) {
  await ev(h, `if (!window.__c6spy) { window.__c6spy = true; window.__c6lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say', 'choice', 'prompt']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c6lines.push(fn[0] + ':' + a.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? 'CHOICE[' + x.map((y) => (typeof y === 'string' ? y : (y && (y.label || y.text)) || '')).join('|') + ']' : '')).filter(Boolean).join(' | ')); } catch (e) {} return o.apply(this, a); }; }
    // (the hold prompt is redrawn every frame: keep the text that is up now, and log each new one once)
    const hp = U.holdPrompt; if (typeof hp === 'function') U.holdPrompt = function (text, ...a) { try { if (text !== window.__c6hold) { window.__c6hold = text; if (text) window.__c6lines.push('h:' + text); } } catch (e) {} return hp.call(this, text, ...a); }; }
    return 1;`);
}
async function saw(h, text, notes, where) {
  const ok = await ev(h, `return (window.__c6lines || []).some((l) => l.includes(${JSON.stringify(text)}))`);
  if (!ok) notes.push(`MISSING line (${where}): ${text}`);
  return ok;
}
async function sawAll(h, lines, notes, where) { for (const l of lines) await saw(h, l, notes, where); }
// a line that comes a moment later (an onEnter thought after its wait): play on up to maxSec for it
async function awaitLine(h, text, notes, where, maxSec = 6) {
  const ok = await advanceUntil(h, `(window.__c6lines || []).some((l) => l.includes(${JSON.stringify(text)}))`, maxSec, { step: 0.2 });
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
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c6_${name}.png`); } catch (e) { /* optional */ }
}

// advance until `pred` holds, closing any document reading view a scene opens on the way (the player reads it, E);
// with o.shots/o.every, a screenshot every `every` seconds of game time (the cutscene's key shots)
async function playUntil(h, pred, maxSec, what, o = {}) {
  const each = "if (SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc' && SH.mod.Menus._top && SH.mod.Menus._top.ready) SH.nav('cancel');";
  if (o.opts && o.opts.shots && o.every) {
    for (let t = 0, k = 0; t < maxSec; t += o.every, k++) {
      if (await advanceUntil(h, pred, o.every, { step: 0.25, each })) return;
      await shot(h, o.opts, `${o.name}_${String(k).padStart(2, '0')}`);
    }
    throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
  }
  const ok = await advanceUntil(h, pred, maxSec, { step: 0.25, each });
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
async function goRoom(h, P, notes, to, o = {}) {
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
    // (arrived: with o.noSettle a scene the room starts on entering is left for the caller to play)
    if (hop[1] === to && o.noSettle) return;
  }
  throw new Error('goRoom: too many hops to ' + to);
}
async function takeHop(h, P, notes, hop) {
  const [from, to, x, z, yaw] = hop;
  const arrived = `SH.mod.World.room === ${JSON.stringify(to)} && !SH.mod.World.transitioning`;
  for (let tries = 0; tries < 4; tries++) {
    await tp(h, x, z, yaw);
    await press(h, 'interact', 0, 0.3);
    if (await advanceUntil(h, arrived, 8)) return;
    const s = await snap(h);
    if (s.room !== from) break;
    await settle(h, P, notes);
  }
  throw new Error(`door ${from} → ${to} did not work from ${x},${z}: ${JSON.stringify(await snap(h))}`);
}
// press E at a spot and let the result play out
async function useAt(h, P, notes, x, z, yaw, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, o.after ?? 0.4);
  return settle(h, P, notes, o);
}
// walk with real keys through a list of waypoints (topping Aidan up as a player would with what he carries — the walk
// is what is tested, not the damage race); throws with the state if a leg does not arrive
async function walkPath(h, P, notes, pts, what, o = {}) {
  for (const [x, z] of pts) {
    let ok = false;
    for (let tries = 0; tries < 3 && !ok; tries++) {
      ok = await walkTo(h, x, z, { maxSec: o.maxSec ?? 30, tol: o.tol ?? 0.45, run: o.run, until: `(SH.S.health < 60 ? (SH.mod.Player.heal(100), false) : false) || Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z}) < ${o.tol ?? 0.45}` });
      if (!ok) { const s = await settle(h, P, notes); if (s.room !== o.room && o.room) throw new Error(`walk (${what}) left ${o.room}: ${JSON.stringify(s)}`); }
    }
    if (!ok) throw new Error(`walk (${what}) did not reach ${x},${z}: ${JSON.stringify(await snap(h))}`);
  }
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
async function resolveReach(h, P, notes, id) {
  const st = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e && !e.resolved ? { x: e.pos.x, z: e.pos.z } : null;`);
  if (!st) return null;
  await equip(h, 'steel_bar');
  const spot = await ev(h, `for (const [dx, dz, yaw] of [[-1.4, 0, 90], [1.4, 0, -90], [0, -1.4, 0], [0, 1.4, 180]]) { const x = ${st.x} + dx, z = ${st.z} + dz; if (SH.mod.World.pointFree(x, z, 0.3)) return [x, z, yaw]; } return [${st.x} - 1.4, ${st.z}, 90];`);
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
  await settle(h, P, notes);
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

// ---- GAMEPLAY 6-1: the escalations office — the Case File, "Hospital.", the terminal's two buttons ------------------------
async function escalations(h, P, notes, opts) {
  if (!(await ev(h, 'return !!SH.S.flags.c6_file'))) {
    await goRoom(h, P, notes, 'c6_escalations', { noSettle: true });
    await shot(h, opts, 'esc_in');
    // 6-case starts on entering: the file under the lamp opens by itself (the reading view), then the line
    await mustReach(h, "SH.mod.Script.busy || !!SH.S.flags.c6_file", 5, '6-case starting on entering the escalations office');
    if (P.play) {
      await mustReach(h, "SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc'", 30, 'the Case File opening by itself', { step: 0.2 });
      await shot(h, opts, 'esc_casefile');
      const doc = await ev(h, "return SH.mod.Menus._top && SH.mod.Menus._top.o ? SH.mod.Menus._top.o.docId || SH.mod.Menus._top.o.id || null : null");
      notes.push(`6-case: reading view open (${doc || 'doc'})`);
      await playUntil(h, '!SH.mod.Script.busy', 60, '6-case playing through', { opts, name: 'case', every: 2.5 });
      await sawAll(h, ['Hospital.', 'She fell.', "She fell and the alarm didn't—", "it didn't—"], notes, '6-case');
    }
    await settle(h, P, notes);
    if (!(await ev(h, 'return !!SH.S.flags.c6_file'))) throw new Error('6-case did not set c6_file');
    if (!(await ev(h, "return !!(SH.S.docs && SH.S.docs.case_file)"))) notes.push('BUG: the Case File is not in the memos after 6-case');
  }
  if (!(await ev(h, 'return !!SH.S.flags.c6_case'))) {
    if (P.walk) {
      // round the desk with real keys to the terminal
      await walkPath(h, P, notes, [[4.45, 3.4], [4.45, 1.0], [3.7, 0.95]], 'round the desk', { room: 'c6_escalations' });
      await ev(h, 'SH.mod.Player.face(-90); return 1');
      await advance(h, 0.2);
      if (P.examine) {
        await tp(h, 3.65, 0.8, -3);
        await press(h, 'interact', 0, 0.4); await settle(h, P, notes);
        await saw(h, "The message light's on.", notes, 'the escalations desk phone');
        await useAt(h, P, notes, 1.6, 1.6, 70);                          // the file, after
        await saw(h, 'Case 118-2231.', notes, 'the file (examine)');
      }
    }
    await tp(h, 2.15, 1.1, 67);
    await press(h, 'interact', 0, 0.3);
    await mustReach(h, 'SH.mod.UI.capturing()', 20, 'the terminal\'s two buttons', { step: 0.2 });
    await shot(h, opts, 'esc_terminal');
    const labels = await ev(h, "return [...document.querySelectorAll('.crm-btn, .scr-btn, .ph-btn')].map((b) => b.textContent.trim())");
    for (const l of ['Close case (no further action)', 'Leave it open']) if (!labels.includes(l)) notes.push(`MISSING terminal button: ${l} (have ${JSON.stringify(labels)})`);
    await advance(h, 0.3);
    if (P.openCase) { await press(h, 'right', 0, 0.2); }
    await press(h, 'confirm', 0, 0.3);
    await mustReach(h, '!!SH.S.flags.c6_case', 5, 'the terminal choice registering');
    if (!P.openCase) {
      // "Case closed." — one second later it reopens itself
      const reopened = await advanceUntil(h, "[...document.querySelectorAll('.ui-scr')].some((e) => e.textContent.includes('CASE 118-2231 — REOPENED — FOLLOW UP: TOMORROW'))", 6, { step: 0.1 });
      if (!reopened) notes.push('MISSING terminal text (Close case): CASE 118-2231 — REOPENED — FOLLOW UP: TOMORROW');
      await shot(h, opts, 'esc_reopened');
    }
    await settle(h, P, notes, { play: true });
    const c = await ev(h, 'return SH.S.flags.c6_case');
    if (c !== (P.openCase ? 'open' : 'closed')) throw new Error('c6_case = ' + c);
    if (P.openCase) await saw(h, 'It stays open.', notes, '6-terminal (Leave it open)');
    else await saw(h, "No. No, I didn't mean—", notes, '6-terminal (Close case)');
    notes.push(`6-terminal: ${P.openCase ? 'Leave it open' : 'Close case'}`);
  }
}

// ---- the fire stairs, Level 4 → the Level 5 door (the plan) and the Level 6 door (locked: its note) -----------------------
async function stairsUp(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c6_firestairs');
  await shot(h, opts, 'fs_l4');
  if (P.walk) {
    // L4 landing → F1 north → half landing 1 → F2 south → the Level 5 landing
    await walkPath(h, P, notes, [[0.6, 3.6], [0.6, 0.8], [2.25, 0.8], [2.25, 3.9], [2.85, 4.9]], 'up to the Level 5 landing', { room: 'c6_firestairs' });
    await shot(h, opts, 'fs_l5');
    const y = await ev(h, 'return SH.mod.Player.pos.y');
    if (Math.abs(y - 3.6) > 0.1) notes.push(`BUG: walking up flights 1-2 did not reach the Level 5 landing (y ${y})`);
  }
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'map_office_upper')"))) {
    await useAt(h, P, notes, 2.85, 5.1, 0);
    if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'map_office_upper')"))) notes.push('BUG: the Fire Stairs Plan could not be taken from the Level 5 door');
  }
  if (!(await ev(h, "return !!SH.S.flags.c6_power")) && P.walk) {
    // on up to Level 6: the door won't open; the taped note
    await walkPath(h, P, notes, [[3.45, 3.9], [3.45, 0.8], [5.1, 0.8], [5.1, 3.9], [4.95, 4.95]], 'up to the Level 6 landing', { room: 'c6_firestairs' });
    await shot(h, opts, 'fs_l6');
    await useAt(h, P, notes, 4.95, 5.0, 0);
    await useAt(h, P, notes, 4.95, 5.0, 0);
    await useAt(h, P, notes, 4.95, 5.0, 0);
    await saw(h, "It won't open. The maglock light is red.", notes, 'the Level 6 door (no power)');
    await saw(h, 'No site power.', notes, 'the note on the Level 6 door');
    if (!(await ev(h, "return !!SH.S.done['c6:noteRead']"))) notes.push('BUG: the note on the Level 6 door could not be read');
  }
}

// ---- GAMEPLAY 6-2 Level 5: the Tethered, the Reach, the site power board, CALL 7 --------------------------------------------
async function level5(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c6_level5');
  await shot(h, opts, 'l5_in');
  await resolveReach(h, P, notes, 'c6_level5:reach');
  if (P.walk) {
    await tp(h, 2.0, 22.9, 180);
    await walkPath(h, P, notes, [[2.0, 16], [2.0, 2.2], [13.0, 2.2]], 'Level 5: the west leg and the north leg', { room: 'c6_level5' });
    await shot(h, opts, 'l5_north');
  }
  await resolveTethered(h, P, notes, 'c6_level5:teth', P.cut, { from: -90, swing: true });
  if (P.walk) {
    await walkPath(h, P, notes, [[22, 2.2], [30, 2.2], [30, 8.6]], 'Level 5: to the power board', { room: 'c6_level5' });
    await shot(h, opts, 'l5_board');
  }
  if (P.examine) {
    await useAt(h, P, notes, 29.35, 7.55, -90);
    await saw(h, "The builders' programme.", notes, 'the site programme (Level 5)');
  }
  // the isolator (6-power); CALL 7 rings as the lights come back
  await tp(h, 29.35, 9.2, -90);
  await press(h, 'interact', 0, 0.4);
  await mustReach(h, '!!SH.S.flags.c6_power', 10, 'the site power board (6-power)');
  await mustReach(h, "SH.mod.Phone.ringing === 'luka7' || !!(SH.S.calls && SH.S.calls.luka7)", 30, 'Luka call 7 ringing at the board', { step: 0.2 });
  await shot(h, opts, 'l5_call7');
  await settle(h, P, notes, { play: true });
  const c = await ev(h, 'return SH.S.calls.luka7');
  if (c !== (P.answer ? 'answered' : 'declined')) throw new Error('luka7 ended as ' + c);
  if (P.answer) await sawAll(h, ['Mate.', "I know you're scared of me.", "I'm scared too."], notes, 'luka7');
  await saw(h, 'Something upstairs just unlocked.', notes, '6-power');
}

// ---- Level 6: the Tethered, the payphone, Luka's back office ----------------------------------------------------------------
async function office(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c6_lukaoffice');
  await shot(h, opts, 'office_in');
  await mustReach(h, '!!SH.S.flags.c6_office', 6, 'the back office remembered (c6_office)');
  await awaitLine(h, 'this is our back office.', notes, 'entering the back office');
  await settle(h, P, notes);
  const read = (d) => ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(d)}] && SH.S.docs[${JSON.stringify(d)}].read)`);
  if (P.docs) {
    await useAt(h, P, notes, 2.5, 4.45, 0);
    if (!(await read('huddle4'))) notes.push('BUG: Huddle Whiteboard 4 could not be read');
    await useAt(h, P, notes, 5.23, 1.67, 87);
    if (!(await read('luka_notes'))) notes.push("BUG: Luka's Meeting Notes could not be read");
  }
  if (P.acct6) {
    await useAt(h, P, notes, 5.0, 2.95, 101);
    if (!(await read('acct6'))) notes.push('BUG: Account Note 6 could not be read on the corkboard');
  }
  if (P.examine) {
    await useAt(h, P, notes, 5.63, 2.93, 145);
    await saw(h, 'Cold. He never drinks them.', notes, "Luka's coffee");
    await useAt(h, P, notes, 5.5, 3.4, 69, { play: true });
    if (!(await ev(h, "return !!SH.S.done['cs:6-roster']"))) notes.push('BUG: the roster insert (6-roster) did not play');
    await shot(h, opts, 'office_roster');
  }
  for (const [x, z, yaw, id] of [[4.55, 0.91, 118, 'c6_lukaoffice:firstaid'], [4.4, 4.55, 58, 'c6_lukaoffice:coffee']]) {
    await useAt(h, P, notes, x, z, yaw);
    if (!(await ev(h, `return !!(SH.S.taken && SH.S.taken[${JSON.stringify(id)}])`))) notes.push(`BUG: ${id} was not picked up`);
  }
}

// ---- the lift lobby: the voice (6-voice), forcing lift B (6-lift) → the Outage → the shaft ------------------------------------
async function liftB(h, P, notes, opts) {
  await goRoom(h, P, notes, 'c6_level6');
  if (P.walk) {
    await tp(h, 9.0, 19.1, 180);
    await walkPath(h, P, notes, [[12, 18.2], [19, 18.0]], 'the spine to the lobby', { room: 'c6_level6' });
    await walkTo(h, 24, 17, { maxSec: 12, until: "SH.mod.Script.busy || !!SH.S.flags.c6_voice" });
  } else {
    await tp(h, 21.5, 17.5, 90);
  }
  await mustReach(h, '!!SH.S.flags.c6_voice', 10, 'the voice from lift B (6-voice)');
  await shot(h, opts, 'l6_voice');
  await settle(h, P, notes);
  if (P.play) await saw(h, "Is someone there? Help— I can't hold it—", notes, '6-voice');
  // hold E at the doors
  await tp(h, 26.0, 15.25, 180);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, "SH.mod.Script.busy && typeof window.__c6hold === 'string' && window.__c6hold.includes('force the doors')", 12, 'the hold prompt at lift B', { step: 0.2 });
  await holdAction(h, 'interact', 3.0);
  await mustReach(h, '!!SH.S.flags.c6_doors', 6, 'lift B forced (c6_doors)');
  await shot(h, opts, 'l6_forced');
  await mustReach(h, '!!SH.S.outage && !SH.mod.World.outageBusy', 20, 'the Outage taking the lobby');
  await shot(h, opts, 'l6_outage');
  await settle(h, P, notes);
  // walk into the dark doorway (real keys)
  if (!(await walkTo(h, 26.0, 13.5, { maxSec: 12, until: "SH.mod.World.room === 'c6_shaft'" }))) throw new Error('walking into lift B did not reach the shaft: ' + JSON.stringify(await snap(h)));
  await mustReach(h, "SH.mod.World.room === 'c6_shaft' && !SH.mod.World.transitioning", 10, 'the shaft');
}

// ---- CUTSCENE 6-1, the SET PIECE (the ladder, the hatch, the brace) ----------------------------------------------------------
async function setPiece(h, P, notes, opts) {
  if (P.play) {
    await mustReach(h, 'SH.mod.Script.cutscene', 8, '6-1 starting');
    await playUntil(h, "!SH.mod.Script.cutscene || !!(SH.c6 && SH.c6.mid && SH.c6.mid.part === 'ladder')", 90, '6-1 playing through', { opts, name: '61', every: 1.5 });
    await sawAll(h, ["Don't let go.", "I've got you. I've got you. Don't let go."], notes, '6-1');
  } else {
    for (let k = 0; k < 40 && (await ev(h, 'return !!SH.mod.Script.cutscene')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.5); }
  }
  // part 1: down the ladder (S) under the swatting hands
  await mustReach(h, "SH.c6 && SH.c6.mid && SH.c6.mid.part === 'ladder' && SH.mod.Player.mode === 'ladder'", 20, 'part 1: on the ladder');
  await shot(h, opts, 'sp_ladder0');
  const hp0 = await ev(h, 'return SH.S.health');
  let hits = 0, lastHp = hp0;
  await h.page.keyboard.down('s');
  try {
    for (let t = 0; t < 60; t += 0.5) {
      await advance(h, 0.5);
      const s = await ev(h, "return { part: SH.c6.mid.part, hp: SH.S.health, y: SH.mod.Player.pos.y, mode: SH.mod.Player.mode, dead: SH.mode === 'death' }");
      if (s.hp < lastHp) { hits++; notes.push(`part 1: a swat hit at y ${s.y.toFixed(1)} (−${lastHp - s.hp})`); }
      lastHp = s.hp;
      if (s.hp < 45) { await heal(h); lastHp = 100; }
      if (s.dead) throw new Error('Aidan died on the ladder');
      if (t === 2 || t === 5) await shot(h, opts, 'sp_ladder' + t);
      if (s.part !== 'ladder') break;
    }
  } finally { await h.page.keyboard.up('s'); }
  await mustReach(h, "SH.c6.mid.part === 'roof' && SH.mod.Player.control !== false && !SH.mod.Script.busy", 20, 'part 1: on the car roof', { each: 'if (SH.S.health < 45) SH.mod.Player.heal(100);' });
  await shot(h, opts, 'sp_roof');
  notes.push(`part 1: down the ladder (${hits} swat hit(s))`);
  if (P.examine) { await useAt(h, P, notes, -0.95, -0.55, 120); await saw(h, "The ropes are stretched", notes, 'the car roof ropes'); }
  // the hatch
  await tp(h, 0.32, 0.25, 180);
  await press(h, 'interact', 0, 0.3);
  await mustReach(h, "SH.c6.mid.part === 'car'", 8, 'dropping through the hatch');
  await mustReach(h, "SH.c6.mid.phase === 'calm' && SH.mod.Player.control !== false", 10, 'part 2: bracing in the car');
  await shot(h, opts, 'sp_car');
  // part 2: hold E; let go in the red; hold again after. coverage: miss twice first (the drop), then brace properly
  let toMiss = P.brace === 'drop' ? 2 : 0, drops0 = 0;
  const want = async (down) => { if (down) await ev(h, "if (!SH.mod.Input.down('interact')) SH.press('interact', 600); return 1"); else await ev(h, 'SH.mod.Input.releaseAll(); return 1'); };
  let lastPhase = null, redShot = false;
  try {
    for (let t = 0; t < 120; t += 0.1) {
      const s = await ev(h, "const M = SH.c6.mid; return { phase: M.phase, wins: M.wins | 0, misses: M.misses | 0, drops: M.drops | 0, done: !!SH.S.flags.c6_setpiece, hp: SH.S.health, dead: SH.mode === 'death' }");
      if (s.done || s.phase === 'won') break;
      if (s.dead) throw new Error('Aidan died in the car');
      if (s.drops > drops0) { notes.push(`part 2: the car dropped a level (−10; drop ${s.drops})`); drops0 = s.drops; }
      if (s.phase === 'flash') { if (!redShot) { await shot(h, opts, 'sp_red'); redShot = true; } await want(toMiss > 0); }
      else await want(true);
      if (lastPhase === 'regrip' && s.phase !== 'regrip' && toMiss > 0 && s.misses > 0) toMiss = Math.max(0, 2 - s.misses);
      if (s.drops > 0) toMiss = 0;
      lastPhase = s.phase;
      await advance(h, 0.1);
    }
  } finally { await ev(h, 'SH.mod.Input.releaseAll(); return 1'); }
  await mustReach(h, '!!SH.S.flags.c6_setpiece', 20, 'the Middle beaten (c6_setpiece)');
  if (P.brace === 'drop' && !(await ev(h, 'return (SH.c6.mid.drops | 0) > 0'))) notes.push('BUG: missing the brace twice did not drop the car');
  notes.push(`set piece won (lukaSaved ${await ev(h, 'return SH.S.flags.lukaSaved')}, drops ${await ev(h, 'return SH.c6.mid.drops | 0')})`);
}

// ---- CUTSCENE 6-2 "Is That All of It?" → CHAPTER CARD "DISTRICT HOSPITAL" -------------------------------------------------------
async function isThatAll(h, P, notes, opts) {
  await mustReach(h, "SH.mod.World.room === 'c6_level6' && !SH.mod.World.transitioning && SH.mod.Script.cutscene", 30, '6-2 in the Level 6 lobby');
  if (!P.play) {
    for (let k = 0; k < 60 && !(await ev(h, 'return SH.mod.Script.choosing')); k++) { if (await ev(h, 'return SH.mod.Script.skippable')) await ev(h, 'SH.skip(); return 1'); await advance(h, 0.4); }
  } else {
    await playUntil(h, 'SH.mod.Script.choosing', 240, '6-2 up to the choice', { opts, name: '62a', every: 3 });
  }
  if (await ev(h, 'return !!SH.S.outage')) notes.push('BUG: 6-2 plays in the Outage (spec: the Fog world)');
  const labels = await ev(h, "return (window.__c6lines || []).filter((l) => l.includes('CHOICE[')).slice(-1)[0] || ''");
  if (!labels.includes(`CHOICE[[Stay silent]|"That's all of it."|"...No."]`)) notes.push('MISSING choice labels (6-2): ' + labels);
  await choose(h, P.reply);
  if (P.play) await playUntil(h, 'SH.S.chapter === 7', 240, '6-2 after the choice', { opts, name: '62b', every: 3 });
  await mustReach(h, "SH.S.chapter === 7 && SH.mod.World.room === 'c7_ringroad' && !SH.mod.World.transitioning", 90, 'Chapter 7 on the ring road', { each: P.play ? '' : 'if (SH.mod.Script.skippable) SH.skip();' });
  if (P.play) {
    await sawAll(h, ['...Aidan.', "You're a hard man to get hold of.", "I'm sorry. I'm sorry, I know I didn't come in, I know—", 'Mate.', 'Stop.', "I'm not here to fire you.",
      'The complaint came to me the morning after she fell.', 'I read the case. Then I rang you. Then I rang you again.', 'Then I got in the car.', 'Why?',
      "Because nobody could reach you. And that's my job. Knowing my people are okay.", 'I write the number on the whiteboard every morning. Eleven. Fourteen. Whatever they send me.',
      'I never once wrote what it cost.', "I'm scared too, mate. Every month. There's someone above me with a whiteboard.", 'I sold her the wrong thing.',
      "The internet doesn't work at her place. Her alarm ran through the landline, and I moved the landline, and I didn't check. She asked me. She asked me and I said it'd be fine.",
      'It was an accident.', 'Is that all of it?', 'What is it?', 'It was never you.', 'What?', 'I have to go to the hospital.', "I'll drive.", 'If I can find the car.',
      "Go. I'll find the road and meet you there."], notes, '6-2');
    if (P.reply === 2) await sawAll(h, ['...No.', "When you're ready. I'm not going anywhere."], notes, '6-2 "...No."');
    if (P.reply === 1) await sawAll(h, ["That's all of it.", '...Okay.'], notes, '6-2 "That\'s all of it."');
    if (P.reply === 0) await saw(h, "When you're ready.", notes, '6-2 [Stay silent]');
  }
  await saw(h, 'DISTRICT HOSPITAL', notes, 'the chapter card');
  if ((await ev(h, 'return SH.S.flags.standardName')) !== 'AIDAN') notes.push('BUG: the Standard\'s name card is not AIDAN after 6-2');
  if (!(await ev(h, 'return !!SH.S.flags.c6_done'))) notes.push('BUG: c6_done not set by 6-2');
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = { ...(PATHS[path] || PATHS.connected) };
  const notes = opts.notes || [];
  await spy(h);
  const start = await snap(h);
  if (start.chapter !== 6) throw new Error('ch6.play: not at Chapter 6: ' + JSON.stringify(start));
  await settle(h, P, notes);
  if ((await ev(h, 'return SH.mod.World.room')) !== 'c5_level4') throw new Error('ch6.play: expected to start on Level 4 (c5_level4)');
  const F0 = start.F, A0 = start.A;
  const flag = (n) => ev(h, `return !!(SH.S.flags && SH.S.flags[${JSON.stringify(n)}])`);
  let saved = false, reloaded = false;

  await shot(h, opts, 'start');
  await escalations(h, P, notes, opts);
  await goRoom(h, P, notes, 'c5_level4');
  if (!(await flag('c6_power'))) {
    await stairsUp(h, P, notes, opts);
    await level5(h, P, notes, opts);
  }
  for (let pass = 0; pass < 3; pass++) {
    await goRoom(h, P, notes, 'c6_level6');
    if (pass === 0) {
      await shot(h, opts, 'l6_in');
      await awaitLine(h, 'Carpet, up this end.', notes, 'arriving on Level 6');
      await resolveTethered(h, P, notes, 'c6_level6:teth', P.cut, { from: 180, swing: true });
    }
    if (opts.saveLoad && !saved) { await payphoneSave(h, P, notes, 0, [29.4, 23.25, 0]); saved = true; }
    if (!(await flag('c6_office'))) await office(h, P, notes, opts);
    if (opts.saveLoad && saved && !reloaded) { reloaded = true; await reload(h, P, notes, 0); continue; }
    break;
  }
  await liftB(h, P, notes, opts);
  await setPiece(h, P, notes, opts);
  await isThatAll(h, P, notes, opts);
  await advance(h, 0.5);

  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: Object.fromEntries(Object.entries(S.flags).filter(([k]) => /^c6_|lukaSaved|standardName/.test(k))), calls: { ...S.calls }, spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c6_'))), health: S.health, outage: !!S.outage };`);
  if (S.outage) notes.push('BUG: Chapter 7 started in the Outage');
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}`, `flags ${JSON.stringify(S.flags)}`, `spawns ${JSON.stringify(S.spawns)}`);
  return { chapter: 6, F: end.F, A: end.A, flags: S.flags, calls: S.calls, spawns: S.spawns, notes };
}

// =====================================================================================================================
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(6); return 1');
  await mustReach(h, "SH.mod.World.room === 'c5_level4' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Level 4 (Chapter 6 start)');
  if (cfg.path === 'tomorrow') {
    // (the chapter select's history answers every call; a Follow-Up-Tomorrow player declined them all and never played a
    // voicemail — spec §6: then lukaSaved is false)
    await ev(h, `const S = SH.S; for (const c of ['luka1', 'luka2', 'luka3', 'luka4', 'luka5', 'luka6']) S.calls[c] = 'declined';
      S.voicemails = ['luka1', 'luka2', 'luka3', 'luka4', 'luka5', 'luka6'].map((id) => ({ id, played: false })); S.stats.callsAnswered = 0; S.stats.voicemails = 0; return 1`);
  }
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room }');
  // the chapter's own Face/Avoid: connected answers (F+2), cuts two Tethered (F+2), reads Account Note 6 (F+1), leaves
  // the case open (F+2) and says "...No." (F+3); coverage the same but stays silent; tomorrow declines (A+2), stomps two
  // (A+2), closes the case (A+5) and says "That's all of it." (A+3)
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [10, 0], deal: [10, 0], coverage: [7, 0], tomorrow: [0, 12] }[cfg.path];
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const trackOk = !want || (dF === want[0] && dA === want[1]);
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  // lukaSaved: true unless no call was ever answered and no voicemail played (the tomorrow run declines everything)
  const wantLuka = cfg.path !== 'tomorrow';
  if (!!r.flags.lukaSaved !== wantLuka) r.notes.push(`BUG: lukaSaved ${r.flags.lukaSaved}, want ${wantLuka}`);
  const ok = st.ch === 7 && st.room === 'c7_ringroad' && trackOk && !errs.length && !bugs.length;
  report(`ch6 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F ${F0}→${r.F} A ${A0}→${r.A} lukaSaved=${r.flags.lukaSaved} errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH6_PATH;
  const shots = process.env.CH6_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH6_RIDDLE || 'normal', saveLoad: process.env.CH6_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch6 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch6_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  return all;
}
