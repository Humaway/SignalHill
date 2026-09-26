// tools/tests/ch8.mjs — Chapter 8 "The Mast" played start to finish, through the ending hand-off (spec §12 Chapter 8
// 8-1…8-4, 8-2A, E-C1 and the in-room beats of Out of Coverage / Follow Up Tomorrow, §7A Summit Road, §7B The Mast,
// §6 the Closer / the Standard, §4 ending logic, §2A riddle row "Ch 8 gate"; CONTENT_PLAN §2 / §7 / §8).
//
//   node tools/build.mjs --out .build/c8.html && node tools/run.mjs --file .build/c8.html --script tools/tests/ch8.mjs
//   env: CH8_PATH=connected|coverage|tomorrow|deal  CH8_RIDDLE=easy|normal|hard  CH8_SAVELOAD=1  CH8_SHOTS=<dir>
//        CH8_TITLE=1 (after the hand-off, skip through the ending to the title screen)
//   With no CH8_PATH it runs the matrix connected/normal/saveLoad(+to the title) · tomorrow/hard · coverage/easy(+to the
//   title) · deal/normal in one browser.
//
// play(h, opts) — PRECONDITION: play mode at the start of Chapter 8 as a real player arrives (S.chapter === 8, Aidan on
// Summit Road by the chained gate, the siren of begin() possibly still sounding). It never resets state. It plays the
// critical path with the real mechanics: Summit Road walked with real keys (the seated row's / the empty road's thought),
// the three hostile Tethered cut free (hold E with the box cutter) or stomped, the two Reaches fought with the bar (real
// swings, the Enemies API to finish), the compound (the Borrowed "Luka" examined + stepped back from, or talked to; the
// §2A payphone; the map on the gate; the emergency phone — Wai, or the laminated card; the combination padlock typed on
// the keyboard; HUT 2's first aid kit and energy drink), the climb (ladders: E + W held; the Unread nest woken by the torch
// on platform 1 and settled with it off; the Standard climbing after him from platform 2), CUTSCENE 8-1, the hut door,
// CUTSCENE 8-2, the Closer (Phase 1: the six pitch lines, the [Hold E] prompt; Phase 2 by real swings; 8-3; the crawl to
// the phone with real keys and E; 8-4; the in-room ending scene) until Game.ending has taken over (SH.mode 'ending').
// Decisions follow opts.path:
//   connected — cut the Tethered free, examine the Borrowed then step back, a wrong code before the right one, the hut's
//               pickups, the torch on up the first ladder (the nest wakes), listen to the whole Pitch, then fight;
//               8-1 / 8-2 / 8-3 / 8-4 / E-C1 play through
//   coverage  — cut free, talk to the Borrowed (it grabs), fight at once; scenes skipped. (The ending comes from the
//               state a coverage player carries in: two of Wai / Chase / Chloe / Luke lost, or F < 35.)
//   tomorrow  — stomp every Tethered, talk to the Borrowed, run past the Reaches, fight at once; scenes skipped. (A ≥ F:
//               the call connects to "Your callback has been scheduled for: tomorrow.")
//   deal      — as connected, but hold E through the Pitch ("[Hold E] Lower your hands", 3 s): 8-2A → Follow Up Tomorrow
// opts.saveLoad — save at the compound payphone (the chapter's first), open the gate, reload that slot
// (Game.continueFrom) and play on (the gate shut again: the padlock again).
// → { chapter: 8, F, A, flags, ending, notes }
import { ev, advance, advanceUntil, mustReach, choose, press, walkTo, payphoneSave, errorCount, report } from './lib.mjs';

const PATHS = {
  connected: { cut: true, borrowed: 'examine', wrongCode: true, pickups: true, torchNest: true, listen: true, deal: false, play: true, examine: true, fight: true },
  coverage: { cut: true, borrowed: 'talk', wrongCode: false, pickups: true, torchNest: false, listen: false, deal: false, play: false, examine: false, fight: true },
  tomorrow: { cut: false, borrowed: 'talk', wrongCode: false, pickups: false, torchNest: false, listen: false, deal: false, play: false, examine: false, fight: false },
};
PATHS.deal = { ...PATHS.connected, deal: true };
const MAIN = { connected: 'E-C2', coverage: 'E-OC', tomorrow: 'E-FT', yes: 'E-YES' };
const PRE = { connected: 'E-C1', coverage: 'E-OC0', tomorrow: 'E-FT0' };

const snap = (h) => ev(h, `const M = SH.mod, S = SH.S; return { room: M.World.room, busy: M.Script.busy, cs: M.Script.cutscene,
  skippable: M.Script.skippable, choosing: M.Script.choosing, ring: M.Phone.ringing, inCall: M.Phone.inCall,
  trans: M.World.transitioning, menu: M.Menus.isOpen() ? M.Menus.current : null, ready: !!(M.Menus._top && M.Menus._top.ready),
  cap: !!(M.UI.capturing && M.UI.capturing()), mode: SH.mode, chapter: S.chapter, F: S.F, A: S.A, hp: S.health,
  ctl: M.Player.control !== false, pmode: M.Player.mode, outage: !!S.outage, torch: !!M.Player.torchOn,
  pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.y.toFixed(2), +M.Player.pos.z.toFixed(2)], cam: SH.state().cam };`);

// ---- what was shown: every subtitle / message / card / choice / stamp / prompt ------------------------------------
async function spy(h) {
  await ev(h, `if (!window.__c8spy) { window.__c8spy = true; window.__c8lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'card', 'say', 'choice', 'prompt', 'stamp', 'titleText', 'textOnBlack', 'holdPrompt']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (...a) { try { window.__c8lines.push(fn[0] + ':' + a.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? 'CHOICE[' + x.map((y) => (typeof y === 'string' ? y : (y && (y.label || y.text)) || '')).join('|') + ']' : (x && typeof x.text === 'string' ? x.text : x && typeof x.title === 'string' ? 'TITLE[' + x.title + ']' : ''))).filter(Boolean).join(' | ')); } catch (e) {} return o.apply(this, a); }; } }
    return 1;`);
}
const mark = (h) => ev(h, 'return (window.__c8lines || []).length');
const parts = (text) => String(text).split(/\s*\[(?:long )?beat\]\s*/).filter(Boolean);
async function saw(h, text, notes, where, since = 0) {
  const ok = await ev(h, `const L = (window.__c8lines || []).slice(${since}); return ${JSON.stringify(parts(text))}.every((p) => L.some((l) => l.includes(p)))`);
  if (!ok) notes.push(`MISSING line (${where}): ${text}  [shown since: ${JSON.stringify(await ev(h, `return (window.__c8lines || []).slice(${since}).slice(-8)`))}]`);
  return ok;
}
async function awaitLine(h, text, notes, where, since = 0, maxSec = 8) {
  const ok = await advanceUntil(h, `${JSON.stringify(parts(text))}.every((p) => (window.__c8lines || []).slice(${since}).some((l) => l.includes(p)))`, maxSec, { step: 0.2 });
  if (!ok) await saw(h, text, notes, where, since);
  return ok;
}
async function sawOrder(h, lines, notes, where, since = 0) {
  const r = await ev(h, `const L = (window.__c8lines || []).slice(${since}); let at = -1; const miss = [];
    for (const t of ${JSON.stringify(lines.map(parts))}) { for (const p of t) { const i = L.findIndex((l, k) => k > at && l.includes(p)); if (i < 0) { miss.push(p); } else at = i; } }
    return miss;`);
  if (r.length) notes.push(`MISSING/out of order (${where}): ${r.join(' / ')}`);
  return !r.length;
}

// ---- small mechanics ------------------------------------------------------------------------------------------------
async function tp(h, x, z, yaw) {
  await ev(h, `SH.teleport(${x}, ${z}, ${yaw}); try { SH.mod.Cam.snap(); } catch (e) {} return true;`);
  await advance(h, 0.25);
}
async function holdAction(h, action, sec) {
  await ev(h, `SH.press(${JSON.stringify(action)}, 600); return true;`);
  try { await advance(h, sec); } finally { await ev(h, 'SH.mod.Input.releaseAll(); return true;'); }
  await advance(h, 0.1);
}
// equip the first of `ids` he carries (a chained run arrives with whatever the player picked up)
async function equip(h, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  const id = await ev(h, `return ${JSON.stringify(list)}.find((id) => SH.S.inv.some((i) => i && i.id === id)) || null`);
  if (!id) throw new Error(`carries none of ${list.join(', ')}`);
  await ev(h, `await SH.run(async (G) => { G.equip(${JSON.stringify(id)}); }); return true;`);
  const eq = await ev(h, 'return SH.S.equipped');
  if (eq !== id) throw new Error(`could not equip ${id} (equipped: ${eq})`);
  return id;
}
const heal = (h) => ev(h, 'await SH.run(async (G) => { G.heal(100); }); return SH.S.health;');
const torch = (h, on) => ev(h, `SH.mod.Player.setTorch(${!!on}); return SH.mod.Player.torchOn;`);
async function shot(h, opts, name) {
  if (!opts || !opts.shots) return;
  try { await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${opts.shots}/c8_${name}.png`); } catch (e) { /* optional */ }
}
// advance until `pred`, closing any reading view a scene opens (a skip per step when `skip`); screenshots every `every` s
async function playUntil(h, pred, maxSec, what, o = {}) {
  const each = "if (SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc' && SH.mod.Menus._top && SH.mod.Menus._top.ready) SH.nav('cancel');" + (o.skip ? ' if (SH.mod.Script.skippable) SH.skip();' : '');
  if (o.opts && o.opts.shots && o.every) {
    for (let t = 0, k = 0; t < maxSec; t += o.every, k++) {
      if (await advanceUntil(h, pred, o.every, { step: 0.25, each })) return;
      await shot(h, o.opts, `${o.name}_${String(k).padStart(2, '0')}`);
    }
    throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
  }
  if (!(await advanceUntil(h, pred, maxSec, { step: 0.25, each }))) throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(await snap(h))}`);
}
// Let whatever the game is doing play out: scenes (played or skipped per path), a reading view (closed), a choice or a
// keypad (returned to the caller). Returns when the player has control.
async function settle(h, P, notes, o = {}) {
  for (let i = 0; i < (o.maxIter ?? 900); i++) {
    const s = await snap(h);
    if (s.mode === 'ending' || s.mode === 'credits' || s.mode === 'fates' || s.mode === 'results' || s.mode === 'title') return s;
    if (s.mode !== 'play' && s.mode !== 'cutscene' && s.mode !== 'menu') { await advance(h, 0.3); continue; }
    if (s.menu) {
      if (s.menu === 'doc' || s.menu === 'items' || s.menu === 'map') { if (s.ready) await ev(h, 'SH.nav("cancel"); return true;'); await advance(h, 0.3); continue; }
      return s;
    }
    if (s.choosing || s.cap) return s;
    if (s.trans || s.busy || s.inCall) {
      if (!(o.play ?? P.play) && s.skippable) { await ev(h, 'SH.skip(); return true;'); await advance(h, 0.4); }
      else await advance(h, 0.5);
      continue;
    }
    await advance(h, 0.15);
    const s2 = await snap(h);
    if (!s2.busy && !s2.trans && !s2.menu && !s2.choosing && !s2.cap) return s2;
  }
  throw new Error('settle: the game never handed control back: ' + JSON.stringify(await snap(h)));
}
// walk (real keys) through waypoints, topping him up if a Reach / swarm got to him (a player drinks what he carries)
async function walkPath(h, P, notes, pts0, what, o = {}) {
  // each leg along the engine's nav grid from wherever he stands (a fight can leave him anywhere)
  const pts = [];
  for (const [x, z] of pts0) {
    const path = o.nav === false ? null : await ev(h, `try { const p = SH.mod.Player.pos; return SH.mod.Enemies.path(p.x, p.z, ${x}, ${z}) || null; } catch (e) { return null; }`);
    if (path && path.length > 1 && !pts.length) for (const q of path.slice(0, -1)) pts.push(q);
    pts.push([x, z]);
  }
  for (const [x, z] of pts) {
    let ok = false;
    for (let tries = 0; tries < (o.tries ?? 3) && !ok; tries++) {
      ok = await walkTo(h, x, z, { maxSec: o.maxSec ?? 40, tol: o.tol ?? 0.6, run: o.run, until: `(SH.S.health < 50 ? (SH.mod.Player.heal(100), false) : false) || ${o.until || 'false'} || Math.hypot(SH.mod.Player.pos.x - ${x}, SH.mod.Player.pos.z - ${z}) < ${o.tol ?? 0.6}` });
      if (o.until && (await ev(h, `try { return !!(${o.until}); } catch (e) { return false; }`))) return true;
      if (!ok) { const s = await settle(h, P, notes); if (o.room && s.room !== o.room) throw new Error(`walk (${what}) left ${o.room}: ${JSON.stringify(s)}`); }
    }
    if (!ok) throw new Error(`walk (${what}) never reached ${x},${z}: ${JSON.stringify(await snap(h))}`);
  }
  return true;
}
async function examine(h, P, notes, x, z, yaw, want) {
  const m0 = await mark(h);
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, 0.3);
  await settle(h, P, notes, { play: true });
  if (want) await saw(h, want, notes, `examine at ${x},${z}`, m0);
}

// ---- enemies --------------------------------------------------------------------------------------------------------
// a hostile Tethered: a few real swings with the box cutter from behind it, the Enemies API to make sure it's down (a
// player keeps swinging), then cut free (hold E, 2 s) or stomped (E). The struggle (a tether's grab) is mashed free.
async function resolveTethered(h, P, notes, id, [x, z, yaw]) {
  const res0 = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res0) return;
  await equip(h, 'box_cutter');
  await tp(h, x, z, yaw);
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); const p = SH.mod.Player.pos; if (e) SH.mod.Player.face(Math.atan2(e.pos.x - p.x, e.pos.z - p.z) * 180 / Math.PI); return 1;`);
  await ev(h, "SH.press('ready', 600); return true;");
  for (let k = 0; k < 4; k++) await press(h, 'attack', 0, 0.55);
  await ev(h, 'SH.mod.Input.releaseAll(); return true;');
  await advance(h, 0.2);
  for (let k = 0; k < 14 && (await ev(h, "return SH.mod.Player.mode === 'grabbed'")); k++) await press(h, 'interact', 0, 0.12);
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.downed && !e.resolved) e.damage(Math.max(1, e.hp), 'box_cutter'); return true;`);
  await advance(h, 0.3);
  // kneel beside it where it lies (1 m off, facing it)
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); const p = SH.mod.Player.pos; let dx = p.x - e.pos.x, dz = p.z - e.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const x = e.pos.x + dx * 1.0, z = e.pos.z + dz * 1.0; SH.teleport(x, z, Math.atan2(-dx, -dz) * 180 / Math.PI); try { SH.mod.Cam.snap(); } catch (err) {} return 1;`);
  await advance(h, 0.25);
  if (P.cut) await holdAction(h, 'interact', 2.6);
  else await press(h, 'interact', 0, 1.0);
  await advance(h, 0.5);
  const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || null`);
  if (res !== (P.cut ? 'freed' : 'dead')) throw new Error(`Tethered ${id}: expected ${P.cut ? 'freed' : 'dead'}, got ${res} (${JSON.stringify(await snap(h))})`);
  notes.push(`${id} ${res}`);
  await heal(h);
  await settle(h, P, notes);
}
// a Reach (or the revealed Borrowed): the bar, real swings from where he stands, then the Enemies API to finish it
async function fightDown(h, P, notes, id, at, o = {}) {
  const alive = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !!(e && !e.removed && !e.resolved && e.hp > 0)`);
  if (!alive) return;
  await equip(h, ['steel_bar', 'extinguisher', 'box_cutter']);
  if (at) await tp(h, ...at);
  // (step up to it: 1.6 m off, on his side of it, facing it)
  const close = `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); const p = SH.mod.Player.pos; if (e) { let dx = p.x - e.pos.x, dz = p.z - e.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (d > 1.9) SH.teleport(e.pos.x + dx * 1.6, e.pos.z + dz * 1.6, 0); const q = SH.mod.Player.pos; SH.mod.Player.face(Math.atan2(e.pos.x - q.x, e.pos.z - q.z) * 180 / Math.PI); } return 1;`;
  await ev(h, close);
  await ev(h, "SH.press('ready', 600); return true;");
  for (let k = 0; k < (o.swings ?? 3); k++) await press(h, 'attack', 0, 0.9);
  await ev(h, 'SH.mod.Input.releaseAll(); return true;');
  const hp = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? e.hp : null`);
  await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); if (e && !e.resolved && e.hp > 0) e.damage(e.hp + 1, 'steel_bar'); return true;`);
  await advance(h, 1.2);
  // a downed one stays down 6 s: E stomps it (the bar's knockdown / a Borrowed on the ground)
  for (let k = 0; k < 3 && (await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !!(e && (e.downed || e.knocked) && !e.resolved)`)); k++) {
    await ev(h, close);
    await advance(h, 0.2);
    await press(h, 'interact', 0, 1.0);
  }
  const res = await ev(h, `return SH.S.spawns[${JSON.stringify(id)}] || (SH.mod.Enemies.get(${JSON.stringify(id)}) ? 'alive' : 'gone')`);
  notes.push(`${id}: ${res} (hp after real swings ${hp})`);
  await heal(h);
  await settle(h, P, notes);
}

// ---- 8-1 GAMEPLAY: Summit Road --------------------------------------------------------------------------------------
async function summit(h, P, notes, opts) {
  const m0 = await mark(h);
  // the siren as the chapter starts (begin): the whole chapter is in the Outage
  await playUntil(h, '!!SH.S.outage && !SH.mod.World.outageBusy', 30, 'the Outage at the start of Chapter 8');
  await settle(h, P, notes, { play: true });
  await advance(h, 2.5);
  await settle(h, P, notes, { play: true });
  await awaitLine(h, '"Come up where it\'s clearer." [beat] That\'s what she said.', notes, 'the chapter start', m0);
  const row = await ev(h, 'return (SH.c8 && SH.c8.row ? SH.c8.row.length : 0)');
  const freed = await ev(h, "return (SH.S.freedOrder || []).filter((id) => SH.S.spawns[id] === 'freed').length");
  notes.push(`summit: ${row} freed Tethered seated along the road (freed so far: ${freed})`);
  if (row !== freed) notes.push(`BUG: ${freed} freed Tethered but ${row} seated on the road`);
  // (their order: bottom to top as he freed them)
  const order = await ev(h, "return (SH.c8.row || []).map((e) => e.id)");
  const want = await ev(h, "return (SH.S.freedOrder || []).filter((id) => SH.S.spawns[id] === 'freed')");
  if (JSON.stringify(order) !== JSON.stringify(want)) notes.push(`BUG: the seated row is not in freeing order: ${JSON.stringify(order)}`);
  await shot(h, opts, 'summit_gate');
  if (P.examine) {
    await examine(h, P, notes, 41.4, 5.0, 180, 'A work order on the dash.');
    await examine(h, P, notes, 39.6, 10.6, 0, 'The chain\'s on the ground. The padlock\'s still locked.');
  }
  await tp(h, 40, 8, 180);
  // leg A (real keys): the first sight of the row (or of nobody)
  const m1 = await mark(h);
  await walkPath(h, P, notes, [[40, 1.2], [30, 0.5]], 'the apron and leg A', { room: 'c8_summit', run: true });
  await settle(h, P, notes, { play: true });
  await shot(h, opts, 'summit_legA');
  // the telephone pillar on leg A's verge, printing the receipt map (the first Outage up here)
  if (P.examine) {
    await tp(h, 12.35, -2.3, -140);
    await press(h, 'interact', 0, 0.8);
    await settle(h, P, notes, { play: true });
    if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'rmap_mast')"))) notes.push('BUG: no receipt map (rmap_mast) from the telephone pillar');
    else notes.push('the receipt map from the telephone pillar');
  }
  // teth1 (anchored by the guardrail on leg A)
  await resolveTethered(h, P, notes, 'c8_summit:teth1', [24.4, 2.4, -90]);
  await walkPath(h, P, notes, [[24, -0.6], [14, 0.0], [4.5, 0.2], [4.2, -13.2]], 'leg A to the first hairpin', { room: 'c8_summit', run: true });
  if (row) await saw(h, 'People sitting by the road. [beat] The ones I cut loose.', notes, 'the seated row', m1);
  // leg B: reach1
  await walkPath(h, P, notes, [[12, -13.4]], 'onto leg B', { room: 'c8_summit', run: true });
  if (P.fight) await fightDown(h, P, notes, 'c8_summit:reach1', null, { swings: 3 });
  await walkPath(h, P, notes, [[30, -13.2], [40, -14], [40.2, -27.2]], 'leg B to the second hairpin', { room: 'c8_summit', run: true });
  // nobody sits by the road for a player who freed no one: he notices on the second leg
  if (!row) await awaitLine(h, 'Nobody. [beat] There\'s nobody up here.', notes, 'the empty road', m1);
  // the lookout bench on the second hairpin (sticker11 under the seat)
  if (P.examine) {
    // (E picks the nearest thing he faces: the energy drink on the seat, the sticker under it, the bench itself)
    const mb = await mark(h);
    for (let k = 0; k < 4; k++) { await tp(h, 42.25, -26.5, 90); await press(h, 'interact', 0, 0.5); await settle(h, P, notes, { play: true }); }
    await saw(h, 'A bench facing out over nothing.', notes, 'the lookout bench', mb);
    const st11 = await ev(h, "return !!((SH.S.stickers || {}).sticker11)");
    notes.push(`sticker11 under the lookout bench: ${st11 ? 'found' : 'not found'}`);
    if (!st11) notes.push('BUG: sticker11 could not be picked up at the lookout bench');
  }
  // leg C: teth2
  await walkPath(h, P, notes, [[30, -27.4]], 'onto leg C', { room: 'c8_summit', run: true });
  await resolveTethered(h, P, notes, 'c8_summit:teth2', [27.2, -25.8, -90]);
  await walkPath(h, P, notes, [[26, -28.2], [4.4, -27.4], [4.2, -40.8]], 'leg C to the third hairpin', { room: 'c8_summit', run: true });
  if (P.fight) await fightDown(h, P, notes, 'c8_summit:reach2', null, { swings: 3 });
  // leg D: teth3
  await walkPath(h, P, notes, [[14, -41.2]], 'onto leg D', { room: 'c8_summit', run: true });
  await resolveTethered(h, P, notes, 'c8_summit:teth3', [21.6, -39.8, -90]);
  const m2 = await mark(h);
  await walkPath(h, P, notes, [[20.5, -42.4], [36.5, -41.2], [37, -52]], 'leg D to the top', { room: 'c8_summit', run: true });
  await settle(h, P, notes, { play: true });
  await awaitLine(h, 'The fog\'s thinner up here. [beat] I can see it now.', notes, 'the top of the road', m2);
  await shot(h, opts, 'summit_top');
  // the fog thins as he climbs
  const fogTop = await ev(h, 'return SH.mod.Render.fog.density');
  if (!(fogTop < 0.04)) notes.push(`BUG: the fog at the top of the road is ${fogTop} (should thin toward 0.024)`);
  await walkPath(h, P, notes, [[37, -60.4]], 'into the compound', { until: "SH.mod.World.room === 'c8_compound'", run: true });
  await mustReach(h, "SH.mod.World.room === 'c8_compound' && !SH.mod.World.transitioning", 10, 'the compound');
}

// ---- 8-2 GAMEPLAY: the compound and the gate --------------------------------------------------------------------------
async function borrowedLuka(h, P, notes) {
  const id = 'c8_compound:luka';
  if (await ev(h, `return !!SH.S.spawns[${JSON.stringify(id)}]`)) return;
  const e0 = await ev(h, `const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return e ? { dis: !!e.disguised, badge: e.data && e.data.B ? e.data.B.badge : null } : null`);
  if (!e0) throw new Error('no Borrowed "Luka" at the compound gate');
  if (e0.badge !== 'LUAK') notes.push(`BUG: the Borrowed Luka's badge reads ${e0.badge} (spec: LUAK)`);
  if (e0.dis) {
    const m0 = await mark(h);
    // it starts the conversation by itself within 4 m (walking up to the gate, real keys)
    await walkTo(h, 16.2, 25.5, { maxSec: 12, tol: 0.4, until: 'SH.mod.Script.choosing' });
    if (!(await ev(h, 'return SH.mod.Script.choosing'))) {
      await tp(h, 16.3, 24.8, 180);
      await press(h, 'interact', 0, 0.3);
    }
    await mustReach(h, 'SH.mod.Script.choosing', 15, 'the Borrowed conversation', { step: 0.1 });
    await saw(h, 'CHOICE[Talk|Examine|Step back]', notes, 'the Borrowed choice', m0);
    const hp0 = await ev(h, 'return SH.S.health');
    if (P.borrowed === 'examine') {
      await choose(h, 1);
      await mustReach(h, 'SH.mod.Script.choosing', 20, 'the choice again after Examine', { step: 0.1 });
      await saw(h, 'LUAK. [beat] And those aren\'t his hands.', notes, 'the Borrowed examine', m0);
      await choose(h, 2);
    } else {
      await choose(h, 0);
      await saw(h, 'I\'m not ringing about the roster.', notes, 'the Borrowed talk', m0);
    }
    await advanceUntil(h, `(() => { const e = SH.mod.Enemies.get(${JSON.stringify(id)}); return !e || !e.disguised; })()`, 4, { step: 0.1 });
    await advance(h, P.borrowed === 'examine' ? 0.3 : 1.3);
    const hp1 = await ev(h, 'return SH.S.health');
    notes.push(`the Borrowed Luka: ${P.borrowed} (health ${hp0} → ${hp1})`);
    if (P.borrowed === 'talk' && hp0 - hp1 < 12) notes.push('BUG: Talk first did not grab (no damage)');
    if (P.borrowed === 'examine' && hp1 < hp0) notes.push('BUG: Examine + Step back still hurt');
  }
  await fightDown(h, P, notes, id, null, { swings: 2 });
}
async function gate(h, P, notes, opts) {
  const lv = await ev(h, "return (SH.S.difficulty && SH.S.difficulty.riddle) || 'normal'");
  const code = lv === 'hard' ? '1408' : '1961';
  // the map on the gate
  await tp(h, 14.05, 21.2, 180);
  await press(h, 'interact', 0, 0.6);
  await settle(h, P, notes, { play: true });
  if (!(await ev(h, "return SH.S.inv.some((i) => i && i.id === 'map_mast')"))) notes.push('BUG: no Mast Compound Diagram (map_mast) from the gate');
  // the emergency phone: Wai (waiSaved), or the laminated card (the doc for the riddle level)
  const wai = await ev(h, 'return !!SH.S.flags.waiSaved');
  const m0 = await mark(h);
  await tp(h, 10.4, 21.3, 180);
  await press(h, 'interact', 0, 0.3);
  if (!wai) await mustReach(h, "SH.mod.Menus.isOpen() && SH.mod.Menus.current === 'doc'", 20, 'the gate card', { step: 0.2 });
  await settle(h, P, notes, { play: true });
  if (wai) {
    const mid = lv === 'easy' ? 'Every tech learned it. 1961. The year the exchange opened.' : lv === 'hard' ? 'Every tech learned it. The day and month the exchange opened.' : 'Every tech learned it. The year the exchange opened.';
    await sawOrder(h, [`Gate's on the old combination. ${mid}`, 'Go on, mate. I\'ll put you through when you get there.'], notes, 'WAI on the emergency phone', m0);
  } else {
    const doc = lv === 'easy' ? 'gate_card_easy' : lv === 'hard' ? 'gate_card_hard' : 'gate_card';
    if (!(await ev(h, `return !!(SH.S.docs && SH.S.docs[${JSON.stringify(doc)}])`))) notes.push(`BUG: the emergency phone box did not give the ${doc} card`);
  }
  // the padlock (typed on the keyboard; E opens)
  const tryCode = async (c) => {
    await tp(h, 15, 21.2, 180);
    await press(h, 'interact', 0, 0.3);
    await mustReach(h, 'SH.mod.UI.capturing()', 20, 'the padlock', { step: 0.2 });
    await advance(h, 0.8);
    await h.page.keyboard.type(c, { delay: 30 });
    await advance(h, 0.3);
    await h.page.keyboard.press('e');
    await advance(h, 1.5);
  };
  if (P.wrongCode) {
    await tryCode('1947');
    if (!(await ev(h, 'return SH.mod.UI.capturing()'))) notes.push('BUG: the padlock closed on a wrong code');
    await h.page.keyboard.press('Escape');
    await advance(h, 0.8);
    await settle(h, P, notes, { play: true });
    if (await ev(h, 'return !!SH.S.flags.c8_gate')) notes.push('BUG: the gate opened on 1947');
  }
  const m1 = await mark(h);
  await tryCode(code);
  await mustReach(h, '!SH.mod.UI.capturing()', 15, 'the padlock opening');
  await settle(h, P, notes, { play: true });
  if (!(await ev(h, 'return !!SH.S.flags.c8_gate'))) throw new Error(`the gate did not open on ${code} (riddle ${lv})`);
  await saw(h, lv === 'hard' ? 'Fourteen, oh-eight. [beat] The day the girls started on the boards.' : 'Nineteen sixty-one. [beat] The year the girls started on the boards.', notes, 'the padlock', m1);
  notes.push(`gate: ${code} on ${lv}${P.wrongCode ? ' (1947 refused first)' : ''}; ${wai ? 'Wai on the phone' : 'the laminated card'}`);
  // the gate's collider is gone
  await advance(h, 1.8);
  if (await ev(h, "const c = SH.mod.World.build.colliders ? SH.mod.World.build.colliders.find((c) => c.name === 'c8c:gatecol') : null; return !!(c && c.enabled)")) notes.push('BUG: the gate is open but its collider still blocks');
}
async function compound(h, P, notes, opts) {
  const m0 = await mark(h);
  await settle(h, P, notes, { play: true });
  await advance(h, 1.5);
  await settle(h, P, notes, { play: true });
  await awaitLine(h, 'Luka? [beat] ...He said he\'d be at the hospital.', notes, 'the first sight of "Luka"', m0);
  await shot(h, opts, 'compound_apron');
  await borrowedLuka(h, P, notes);
  let saved = false, reloaded = false;
  for (;;) {
    if (opts.saveLoad && !saved) {
      await payphoneSave(h, 24.0, 24.6, 90, 0);
      saved = true;
      await settle(h, P, notes, { play: true });
      notes.push(`saved slot 1 at the compound payphone (F ${await ev(h, 'return SH.S.F')}, A ${await ev(h, 'return SH.S.A')})`);
    }
    await gate(h, P, notes, opts);
    if (opts.saveLoad && saved && !reloaded) {
      reloaded = true;
      await ev(h, 'SH.mod.Game.continueFrom(0); return true;');
      await mustReach(h, "SH.mode === 'play' && SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, 'the loaded game');
      await advance(h, 0.8);
      await settle(h, P, notes, { play: true });
      const st = await snap(h);
      notes.push(`reloaded slot 1 → ${st.room} (outage ${st.outage}, gate ${await ev(h, 'return !!SH.S.flags.c8_gate')})`);
      if (st.room !== 'c8_compound') notes.push(`BUG: the reload landed in ${st.room}, not the compound`);
      if (!st.outage) notes.push('BUG: the reload came back out of the Outage');
      if (await ev(h, 'return !!SH.S.flags.c8_gate')) notes.push('BUG: the reload kept the gate open (it was shut at the save)');
      continue;
    }
    break;
  }
  // through the gate into the yard; HUT 2 (the first aid kit and the energy drink)
  await walkPath(h, P, notes, [[15, 18.4]], 'through the gate', { room: 'c8_compound' });
  await shot(h, opts, 'compound_yard');
  if (P.pickups) {
    const inv0 = await ev(h, "const c = (id) => (SH.S.inv.find((i) => i && i.id === id) || { n: 0 }).n || 0; return [c('first_aid'), c('energy_drink')]");
    await walkPath(h, P, notes, [[21, 12.5], [21.3, 7.3]], 'to HUT 2', { room: 'c8_compound' });
    await tp(h, 25.6, 8.2, 0);
    await press(h, 'interact', 0, 0.8); await settle(h, P, notes, { play: true });
    await tp(h, 25.0, 8.2, 0);
    await press(h, 'interact', 0, 0.8); await settle(h, P, notes, { play: true });
    const inv1 = await ev(h, "const c = (id) => (SH.S.inv.find((i) => i && i.id === id) || { n: 0 }).n || 0; return [c('first_aid'), c('energy_drink')]");
    if (!(inv1[0] > inv0[0] && inv1[1] > inv0[1])) notes.push(`BUG: HUT 2 pickups: first aid ${inv0[0]}→${inv1[0]}, energy drink ${inv0[1]}→${inv1[1]}`);
    else notes.push('HUT 2: first aid kit + energy drink');
    if (P.examine) await examine(h, P, notes, 24.4, 8.2, 0, 'Every entry after that says the same thing.');
    await walkPath(h, P, notes, [[21.3, 7.3], [21, 12.4]], 'out of HUT 2', { room: 'c8_compound' });
  }
  // the mast's enclosure gate → c8_mast
  await walkPath(h, P, notes, [[15, 11.4], [15, 10.3]], 'to the mast', { until: "SH.mod.World.room === 'c8_mast'" });
  await mustReach(h, "SH.mod.World.room === 'c8_mast' && !SH.mod.World.transitioning", 10, 'the mast');
}

// ---- 8-3 GAMEPLAY: the climb ------------------------------------------------------------------------------------------
async function climb(h, P, notes, [x, z, yaw], topY, what, o = {}) {
  await tp(h, x, z, yaw);
  await press(h, 'interact', 0, 1.0);
  if ((await snap(h)).pmode !== 'ladder') throw new Error(`${what}: not on the ladder: ${JSON.stringify(await snap(h))}`);
  const kb = h.page.keyboard;
  await kb.down('w');
  try {
    for (let t = 0; t < 60; t += 0.5) {
      await advance(h, 0.5);
      const s = await snap(h);
      if (o.each) await o.each(s);
      if (s.hp < 45) await heal(h);
      if (s.pmode !== 'ladder' && s.pos[1] > topY - 0.6) break;
      if (s.pmode !== 'ladder' && s.pos[1] < topY - 1) {
        // knocked off (the nest) — back on
        await kb.up('w');
        return { off: true, s };
      }
    }
  } finally { await kb.up('w'); }
  await advance(h, 0.5);
  return { off: false, s: await snap(h) };
}
async function mast(h, P, notes, opts) {
  const m0 = await mark(h);
  await settle(h, P, notes, { play: true });
  await advance(h, 2.2);
  await settle(h, P, notes, { play: true });
  await awaitLine(h, 'Sixty metres. [beat] Come up where it\'s clearer.', notes, 'the mast', m0);
  // nothing here is sure: the bars flicker between 0 and 5 at random
  const seenBars = new Set();
  // (sampled every 0.25 s until three different readings: a fixed 3 s window missed a third one ~3 % of the time — the
  // flicker holds a reading 0.05–0.6 s and picks 0 more often — and failed a correct mast)
  for (let k = 0; k < 40 && (k < 12 || seenBars.size < 3); k++) { await advance(h, 0.25); seenBars.add(await ev(h, 'return SH.mod.Phone.reading.bars')); }
  notes.push(`mast: phone bars seen ${JSON.stringify([...seenBars].sort())}`);
  if (seenBars.size < 3) notes.push('BUG: the phone bars do not flicker on the mast');
  if (P.examine) await examine(h, P, notes, -1.95, 4.4, 180, 'The last line\'s filled in already. [beat] AIDAN. The reason\'s left blank.');
  await shot(h, opts, 'mast_base');
  // L1: 0 → 20 (the torch on, on the connected path: the nest above platform 1 wakes to it)
  await torch(h, !!P.torchNest);
  let r = await climb(h, P, notes, [1.0, 3.35, 180], 20, 'L1');
  await shot(h, opts, 'mast_p1');
  await advance(h, 1.0);
  const nest1 = await ev(h, "const e = SH.mod.Enemies.get('c8_mast:nest'); return e ? e.data.swarm : null");
  notes.push(`platform 1: the nest ${nest1} (torch ${P.torchNest ? 'on' : 'off'})`);
  if (P.torchNest && nest1 !== 'swarm') notes.push('BUG: the torch did not wake the nest on platform 1');
  // torch off, stand still: they settle back onto the rungs
  await torch(h, false);
  await playUntil(h, "(() => { const e = SH.mod.Enemies.get('c8_mast:nest'); return !e || e.data.swarm === 'rest'; })()", 20, 'the nest settling (torch off, still)');
  await heal(h);
  // L2: 20 → 40, torch off through the nest
  const hpL2 = await ev(h, 'return SH.S.health');
  r = await climb(h, P, notes, [3.05, -0.45, -90], 40, 'L2');
  if (r.off) notes.push('BUG: knocked off L2 with the torch off');
  const hpP2 = await ev(h, 'return SH.S.health');
  if (hpP2 < hpL2) notes.push(`BUG: hurt climbing L2 with the torch off (${hpL2} → ${hpP2})`);
  // platform 2: keys below — the Standard climbing after him
  const m2 = await mark(h);
  await advance(h, 0.6);
  await playUntil(h, "!!SH.mod.Enemies.get('c8_mast:std')", 6, 'the Standard on the ladder below platform 2');
  await settle(h, P, notes, { play: true });
  await awaitLine(h, 'Keys. [beat] Below me.', notes, 'platform 2', m2);
  const std = await ev(h, "const e = SH.mod.Enemies.get('c8_mast:std'); return e ? { mode: e.data.c8.mode, y: +e.pos.y.toFixed(1), name: e.data.name || (e.def && e.def.name) } : null");
  notes.push(`platform 2: the Standard ${JSON.stringify(std)}`);
  await shot(h, opts, 'mast_p2');
  // sticker12 on platform 2's kick plate (the corner behind the ladder's head)
  if (P.examine) {
    for (let k = 0; k < 3 && !(await ev(h, 'return !!(SH.S.stickers || {}).sticker12')); k++) { await tp(h, -0.35, -4.85, -135); await press(h, 'interact', 0, 0.5); await settle(h, P, notes, { play: true }); }
    const st12 = await ev(h, 'return !!(SH.S.stickers || {}).sticker12');
    notes.push(`sticker12 on platform 2: ${st12 ? 'found' : 'not found'}`);
    if (!st12) notes.push('BUG: sticker12 could not be picked up on platform 2');
  }
  await torch(h, true);
  // L3: 40 → 56 without stopping; the Standard never catches up
  const hpL3 = await ev(h, 'return SH.S.health');
  r = await climb(h, P, notes, [-0.55, -3.15, 0], 56, 'L3');
  const hpTop = await ev(h, 'return SH.S.health');
  if (hpTop < hpL3 - 1) notes.push(`BUG: the Standard caught him on L3 without stopping (${hpL3} → ${hpTop})`);
}

// ---- 8-1, 8-2 and the Closer ------------------------------------------------------------------------------------------
async function closer(h, P, notes, opts) {
  // CUTSCENE 8-1 "The Mirror" (P3): played (connected) or skipped
  const m0 = await mark(h);
  if (!opts.inFight) {
    await playUntil(h, "!!SH.S.done['cs:8-1']", 10, 'CUTSCENE 8-1 on the top landing');
    await playUntil(h, "SH.mod.World.room === 'c8_transmitter' && !SH.mod.World.transitioning", 90, 'the transmitter room (8-1, the door)', { skip: !P.play, opts, every: P.play ? 3 : 0, name: '81' });
    if (P.play) await sawOrder(h, ['...Yeah. [beat] I know.'], notes, '8-1', m0);
  }
  if (await ev(h, "return !!SH.mod.Enemies.get('c8_mast:std')")) notes.push('BUG: the Standard is still there after 8-1');
  // CUTSCENE 8-2 "The Pitch" (after a CONTINUE from the autosave before the fight: the Pitch again, without 8-2)
  const m1 = await mark(h);
  await playUntil(h, '!!(SH.c8 && SH.c8.fight && SH.c8.fight.phase === 1) && !SH.mod.Script.cutscene', 60, 'the Pitch (Phase 1)', { skip: !P.play, opts, every: P.play ? 3 : 0, name: '82' });
  if (P.play && !opts.inFight) await sawOrder(h, ['Hi there! [beat] What brings you in today?', '...No.', 'Relax. I\'m you. [beat] The good version. The one who closes.'], notes, '8-2', m1);
  const auto = await ev(h, "try { const a = SH.mod.Save.list().auto; return a ? (a.room || a.area || JSON.stringify(a).slice(0, 80)) : null; } catch (e) { return String(e); }");
  notes.push(`the autosave before the fight: ${JSON.stringify(auto)}`);
  await equip(h, ['steel_bar', 'extinguisher', 'box_cutter']);
  const m2 = await mark(h);
  await shot(h, opts, 'pitch');
  if (P.deal) {
    // hold E through the Pitch: 3 s lowers his hands → 8-2A "Signed" → Follow Up Tomorrow
    await advance(h, 3);
    await saw(h, 'Lower your hands', notes, 'the [Hold E] prompt', m2);
    await holdAction(h, 'interact', 3.6);
    await playUntil(h, "!!SH.S.done['cs:8-2A']", 6, 'CUTSCENE 8-2A');
    await playUntil(h, "SH.mode === 'ending' || SH.mode === 'credits'", 60, 'the ending after the deal', { opts, every: 3, name: '82A' });
    if (!(await ev(h, 'return !!SH.S.flags.acceptedDeal'))) notes.push('BUG: acceptedDeal not set by 8-2A');
    return 'tomorrow';
  }
  if (P.listen) {
    // the whole Pitch: a line every 8 s, in order
    await playUntil(h, `(window.__c8lines || []).slice(${m2}).some((l) => l.includes('Tomorrow.'))`, 56, 'the six pitch lines');
    await advance(h, 2);
  } else await advance(h, 1.5);
  const pitch = ["You don't have to make that call.", "She's in hospital. They look after them in there. She's fine.", "Luka doesn't need to know the rest. And Luke will calm down. They always calm down.", "Stay up here and you'll be the best in the store. Every month. Better than Chloe.", "You said it'd be fine, and you believed it. That's what makes you so good at this.", 'All you have to do is follow up. [beat] Tomorrow.'];
  if (P.listen) await sawOrder(h, pitch, notes, 'the Pitch', m2);
  await saw(h, 'Lower your hands', notes, 'the [Hold E] prompt', m2);
  // attack: Phase 2 (real swings; the Enemies API brings it to the 30 % mark, then a last real hit)
  const m3 = await mark(h);
  const hitIt = async (n) => {
    for (let k = 0; k < n; k++) {
      await ev(h, "const e = SH.mod.Enemies.get('c8_transmitter:closer'); const p = SH.mod.Player.pos; if (e) { const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); if (d > 1.9) SH.teleport(e.pos.x - (e.pos.x - p.x) / d * 1.5, e.pos.z - (e.pos.z - p.z) / d * 1.5, 0); SH.mod.Player.face(Math.atan2(e.pos.x - SH.mod.Player.pos.x, e.pos.z - SH.mod.Player.pos.z) * 180 / Math.PI); } return 1;");
      await ev(h, "SH.press('ready', 600); return true;");
      await advance(h, 0.2);
      await press(h, 'attack', 0, 1.0);
      await ev(h, 'SH.mod.Input.releaseAll(); return true;');
      if ((await ev(h, 'return SH.S.health')) < 50) await heal(h);
      if (await ev(h, "return !!(SH.c8.fight && SH.c8.fight.phase !== 1 && SH.c8.fight.phase !== 2)")) return;
    }
  };
  await hitIt(2);
  await playUntil(h, '!!(SH.c8.fight && SH.c8.fight.phase === 2)', 8, 'Phase 2 (The Close)');
  await hitIt(4);
  const hp2 = await ev(h, "const e = SH.mod.Enemies.get('c8_transmitter:closer'); return e ? [e.hp, e.maxHp, (e.data.tears || []).filter((m) => m.visible).length, SH.c8.fight.sigs] : null");
  notes.push(`Phase 2 after real swings: closer hp/max/tears/sigs ${JSON.stringify(hp2)}`);
  if (hp2 && hp2[0] >= hp2[1]) notes.push('BUG: real swings did not hurt the Closer in Phase 2');
  await shot(h, opts, 'close');
  // (to the edge of 30 %, then the real hit that crosses it)
  for (let k = 0; k < 8 && (await ev(h, "return !!(SH.c8.fight && SH.c8.fight.phase === 2)")); k++) {
    await ev(h, "const e = SH.mod.Enemies.get('c8_transmitter:closer'); if (e && !SH.c8.fight.restartT) e.hp = Math.min(e.hp, Math.ceil(e.maxHp * 0.3) + 5); return 1");
    await hitIt(2);
  }
  await saw(h, 'Sign here.', notes, 'the Phase 2 barks', m3);
  // CUTSCENE 8-3 "The Callback"
  const m4 = await mark(h);
  await playUntil(h, "!!SH.S.done['cs:8-3']", 10, 'CUTSCENE 8-3');
  await playUntil(h, "!!(SH.c8.fight && SH.c8.fight.phase === 3) && !SH.mod.Script.cutscene && SH.mod.Player.mode === 'crawl'", 40, 'the crawl (Phase 3)', { skip: !P.play, opts, every: P.play ? 2 : 0, name: '83' });
  if (P.play) await saw(h, 'It\'ll be fine! It\'ll be fine! IT\'LL BE FINE!', notes, '8-3', m4);
  const ph = await ev(h, "const o = SH.mod.World.obj('c8t:phone'); const p = SH.mod.Player.pos; return o ? [o.visible, +o.position.x.toFixed(2), +o.position.z.toFixed(2), +Math.hypot(o.position.x - p.x, o.position.z - p.z).toFixed(2)] : null");
  notes.push(`8-3: the phone ${JSON.stringify(ph)} (visible, x, z, distance)`);
  if (!ph || !ph[0] || Math.abs(ph[3] - 8) > 0.6) notes.push('BUG: the phone did not stop face up ~8 m away');
  await shot(h, opts, 'crawl');
  // crawl to the phone (real keys, 0.8 m/s; the swipes knock him back 1 m, never below 1 health), then E
  let minHp = 100;
  for (let k = 0; k < 8; k++) {
    await walkTo(h, 10.9, 12.6, { maxSec: 16, tol: 0.7, step: 0.25, until: '(SH.S.health < 1 ? true : false) || Math.hypot(SH.mod.Player.pos.x - 10.4, SH.mod.Player.pos.z - 12.6) < 0.95' });
    minHp = Math.min(minHp, await ev(h, 'return SH.S.health'));
    if (await ev(h, 'return Math.hypot(SH.mod.Player.pos.x - 10.4, SH.mod.Player.pos.z - 12.6) < 1.0')) break;
  }
  if (minHp < 1) notes.push('BUG: health dropped below 1 during the crawl');
  if (await ev(h, "return SH.mod.Player.mode !== 'crawl'")) notes.push('BUG: not crawling in Phase 3');
  await saw(h, 'to call', notes, 'the crawl prompt', m4);
  await press(h, 'interact', 0, 0.5);
  // CUTSCENE 8-4 "Ringing", then the ending's in-room scene
  const m5 = await mark(h);
  await playUntil(h, "!!SH.S.done['cs:8-4']", 6, 'CUTSCENE 8-4 (E pressed Call)');
  const want = await ev(h, 'return SH.mod.Game.endingFor(SH.S)');
  // 8-4 (played or skipped), then the path's own in-room ending scene always played through
  await playUntil(h, `!!SH.S.done['cs:${PRE[want] || 'none'}'] || SH.mode === 'ending' || SH.mode === 'credits'`, 90, 'CUTSCENE 8-4', { skip: !P.play, opts, every: P.play ? 3 : 0, name: '84' });
  await playUntil(h, "SH.mode === 'ending' || SH.mode === 'credits'", 120, 'the ending hand-off', { opts, every: 3, name: '84e' });
  if (P.play) await sawOrder(h, ['I just wanted it to be fine.', 'I know. [beat] It wasn\'t.'], notes, '8-4', m5);
  if (want === 'connected') {
    const lines = [...(await ev(h, 'return !!SH.S.flags.waiSaved')) ? ['Putting you through, mate.'] : [], 'Hello? [beat] Is that the young man?', 'It\'s Aidan. [beat] From the store. [beat] I\'m so sorry.', 'Oh, love. [beat] Come and see me.'];
    await sawOrder(h, lines, notes, 'E-C1', m5);
  } else if (want === 'coverage') await saw(h, 'The number you have called is not connected.', notes, 'E-OC0', m5);
  else if (want === 'tomorrow') await saw(h, 'Your callback has been scheduled for: tomorrow.', notes, 'E-FT0', m5);
  if (PRE[want] && !(await ev(h, `return !!SH.S.done['cs:${PRE[want]}']`))) notes.push(`BUG: the in-room ending scene ${PRE[want]} never played`);
  return want;
}

export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const P = PATHS[path];
  if (!P) throw new Error('unknown path ' + path);
  const notes = opts.notes || [];
  await spy(h);
  const s0 = await snap(h);
  if (s0.chapter !== 8 || (!opts.resume && s0.room !== 'c8_summit')) throw new Error('ch8 play(): not at the start of Chapter 8 (' + JSON.stringify(s0) + ')');
  const F0 = s0.F, A0 = s0.A;
  // opts.resume (a CONTINUE mid-chapter, e.g. after dying in the fight): the autosave before the fight puts him back in
  // the transmitter room and the Pitch starts again; from anywhere else the chapter plays from Summit Road
  const inFight = !!opts.resume && s0.room === 'c8_transmitter';
  if (!inFight) {
    if (s0.room !== 'c8_summit') throw new Error('ch8 play(): resumed at ' + s0.room + ' (only the transmitter room or Summit Road)');
    await summit(h, P, notes, opts);
    await compound(h, P, notes, opts);
    await mast(h, P, notes, opts);
  }
  const ending = await closer(h, P, notes, { ...opts, inFight });
  // the hand-off: Game.ending runs the rest (its first main scene starts)
  const main = MAIN[ending];
  await playUntil(h, `SH.mode !== 'play' && (!!SH.S.done['cs:${main}'] || SH.mode === 'credits' || SH.mode === 'results')`, 60, `the ending "${ending}" (${main}) under way`);
  const end = await snap(h);
  const S = await ev(h, `const S = SH.S; return { flags: Object.fromEntries(Object.entries(S.flags).filter(([k]) => /^c8_|Saved$|acceptedDeal/.test(k))), spawns: Object.fromEntries(Object.entries(S.spawns).filter(([k]) => k.startsWith('c8_'))), stickers: S.stickers, chapter: S.chapter };`);
  notes.push(`F ${F0}→${end.F}, A ${A0}→${end.A}; ending ${ending}; mode ${end.mode}`, `flags ${JSON.stringify(S.flags)}`, `spawns ${JSON.stringify(S.spawns)}`);
  return { chapter: 8, F: end.F, A: end.A, flags: S.flags, spawns: S.spawns, ending, notes };
}

// =====================================================================================================================
// isolated runs: the state a player on each path carries up the hill (chapter select gives the best run: everyone saved)
const ARRIVE = {
  connected: '',
  deal: '',
  coverage: 'S.flags.waiSaved = false; S.flags.waiLost = true; S.flags.chaseSaved = false; S.chaseHits = 4; S.flags.chaseHurt = true;',
  // (every Tethered on the way stomped: nobody sits by the road — "and that should feel worse")
  tomorrow: 'S.flags.waiSaved = false; S.flags.waiLost = true; S.flags.chaseSaved = false; S.flags.chloeSaved = false; S.F = 16; S.A = 31; for (const c of ["luka1","luka2","luka3","luka4","luka5","luka6","luka7","luka8"]) S.calls[c] = "declined"; for (const id of S.freedOrder || []) S.spawns[id] = "dead"; S.freedOrder = []; S.stats.freed = 0;',
};
async function runOne(h, cfg, notes) {
  const e0 = await errorCount(h);
  const t0 = Date.now();
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(8); return 1');
  await mustReach(h, "SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Summit Road (Chapter 8 start)');
  // (the emergency phone is built for Wai or the card, the road's seated row from S.freedOrder: arrive again with the state)
  if (ARRIVE[cfg.path]) {
    await ev(h, `const S = SH.S; ${ARRIVE[cfg.path]} await SH.goto('c8_summit', 'bottom'); return 1`);
    await mustReach(h, "SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning && SH.mode === 'play'", 30, 'Summit Road again');
  }
  const F0 = await ev(h, 'return SH.S.F'), A0 = await ev(h, 'return SH.S.A');
  const r = await play(h, { ...cfg, notes });
  // the chapter's own Face/Avoid: connected / coverage / deal cut the three Tethered free (F+3); tomorrow stomps them (A+3)
  const dF = r.F - F0, dA = r.A - A0;
  const want = { connected: [3, 0], deal: [3, 0], coverage: [3, 0], tomorrow: [0, 3] }[cfg.path];
  const trackOk = dF === want[0] && dA === want[1];
  if (!trackOk) r.notes.push(`BUG: Face/Avoid in the chapter F+${dF} A+${dA}, want F+${want[0]} A+${want[1]}`);
  const wantEnding = { connected: 'connected', deal: 'tomorrow', coverage: 'coverage', tomorrow: 'tomorrow' }[cfg.path];
  const endOk = r.ending === wantEnding && (cfg.path !== 'deal' || !!r.flags.acceptedDeal);
  if (!endOk) r.notes.push(`BUG: ending ${r.ending}, want ${wantEnding}`);
  let titleOk = true;
  if (cfg.toTitle) {
    // skip through the rest of the ending to the title (catches errors in the endings fed by this chapter's state)
    const ok = await advanceUntil(h, "SH.mode === 'title'", 400, { step: 0.5, each: "if (SH.mod.Script.skippable) SH.skip(); if (SH.mod.Menus.isOpen() && SH.mod.Menus._top && SH.mod.Menus._top.ready && ['credits','fates','results'].includes(SH.mod.Menus.current)) SH.nav('confirm');" });
    titleOk = ok;
    r.notes.push(`to the title: ${ok ? 'yes' : 'NO'} (endings seen ${JSON.stringify(await ev(h, 'return SH.mod.META.endingsSeen || null'))})`);
  }
  const errs2 = await ev(h, `return SH.errors.slice(${e0})`);
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const ok = trackOk && endOk && titleOk && !errs2.length && !bugs.length;
  report(`ch8 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `ending=${r.ending} mode=${await ev(h, 'return SH.mode')} F ${F0}→${r.F} A ${A0}→${r.A} errors=${errs2.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs2) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH8_PATH;
  const shots = process.env.CH8_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH8_RIDDLE || 'normal', saveLoad: process.env.CH8_SAVELOAD === '1', shots, toTitle: process.env.CH8_TITLE === '1' }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots, toTitle: true }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false, toTitle: true }, { path: 'deal', riddle: 'normal', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    const notes = [];
    try { all = (await runOne(h, cfg, notes)) && all; }
    catch (e) {
      all = false;
      report(`ch8 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, String(e.stack || e));
      for (const n of notes) console.log('   ·', n);
      try { const st = await ev(h, 'return SH.state()'); console.log('   state:', JSON.stringify(st)); } catch (e2) { /* page */ }
      try { await h.shot('.build/ch8_fail.png'); } catch (e2) { /* no page */ }
    }
  }
  return all;
}
