// tools/tests/ch0.mjs — Chapter 0, the Prologue "No Service" (spec §8 P-1 … P-4, §7B, §2A payphone).
//
// play(h, opts) — PRECONDITION: a new game in play mode at the start of chapter 0 (S.chapter === 0): P-1 "Rehearsal"
//   either still running (SH.chapter(0) / SH.newGame({})) or already skipped (SH.newGame({skipIntro:true})). P-1 is
//   played through with SH.advance. Then the critical path: the Returned modem, the Visitor Map (the §2A payphone save
//   when opts.saveLoad), Hill Road (the cardigan figure crossing), the bus shelter (box cutter → P-4 → the first
//   Tethered: cut free on the Face paths, stomped on 'tomorrow'), the Route 44 timetable, sticker01 (connected / deal),
//   and north into Relay Street → CHAPTER CARD → chapter 1 at c1_relay. With opts.saveLoad it saves at the Lookout
//   booth, walks on past the crossing, reloads that slot (Game.continueFrom) and plays on from the booth again.
//   → { chapter: 0, F, A, flags, notes }
// default (page, h) — isolated runs. Env: CH0_PATH (connected|coverage|tomorrow|deal), CH0_RIDDLE (easy|normal|hard),
//   CH0_SAVELOAD (1), CH0_SHOTS (a directory for screenshots of the key beats). With no CH0_PATH it runs the matrix
//   connected/normal/saveLoad · tomorrow/hard · coverage/easy, each from SH.newGame + SH.chapter(0), in one browser.
//   node tools/build.mjs --out .build/ch0.html && node tools/run.mjs --file .build/ch0.html --script tools/tests/ch0.mjs
import { ev, advance, advanceUntil, mustReach, choose, press, interactAt, walkTo, closeMenus, payphoneSave, loadSlot, assertNoErrors, errorCount, report } from './lib.mjs';

// ---- Hill Road geometry (a copy of data/10_prologue.js's HR curve: 120 m S-curve east, 10 % down) ------------------
const HR = { L: 120, A: 7, grade: -0.1 };
const hrZ = (x) => { if (x <= 0 || x >= HR.L) return 0; const w = 2 * Math.PI / 60; return x <= 60 ? HR.A * (1 - Math.cos(w * x)) / 2 : -HR.A * (1 - Math.cos(w * (x - 60))) / 2; };
const hrDZ = (x) => { if (x <= 0 || x >= HR.L) return 0; const w = 2 * Math.PI / 60; return x <= 60 ? HR.A * w / 2 * Math.sin(w * x) : -HR.A * w / 2 * Math.sin(w * (x - 60)); };
const hrPt = (x, d) => { const th = Math.atan(hrDZ(x)); return [x - d * Math.sin(th), hrZ(x) + d * Math.cos(th)]; };
const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az) * 180 / Math.PI;

const TETH = 'p4_busshelter:teth';
const IDLE = "SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()";
const idle = (h, max = 30, what = 'player control') => mustReach(h, IDLE, max, what);

// record every subtitle / message / prompt line (the dialogue audit reads them back)
async function spy(h) {
  await ev(h, `if (!window.__ch0spy) { window.__ch0spy = true; window.__lines = []; const U = SH.mod.UI;
    for (const fn of ['subtitle', 'message', 'prompt', 'card']) { const o = U[fn]; if (typeof o !== 'function') continue;
      U[fn] = function (t, ...r) { try { window.__lines.push(fn[0] + ':' + t); } catch (e) {} return o.call(this, t, ...r); }; } }
    return 1;`);
}
const lines = (h) => ev(h, 'return (window.__lines || []).slice()');
async function saw(h, text, notes, where) {
  const L = await lines(h);
  const ok = L.some((l) => l.slice(2) === text || l.slice(2).includes(text));
  if (!ok) notes.push(`MISSING line (${where}): ${text}`);
  return ok;
}
async function shot(h, opts, name) {
  if (!opts.shots) return;
  await ev(h, 'SH.mod.Render.render(0); return 1');
  await h.shot(`${opts.shots}/${name}.png`);
}
async function examineAt(h, x, z, yaw) {
  await interactAt(h, x, z, yaw);
  await idle(h, 15, 'an examine line');
}

// =====================================================================================================================
export async function play(h, opts = {}) {
  const path = opts.path || 'connected';
  const face = path !== 'tomorrow';
  const notes = [];
  await spy(h);
  await ev(h, 'window.__p1t = 0; return 1');
  const st0 = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room, F: SH.S.F, A: SH.S.A }');
  if (st0.ch !== 0) throw new Error(`ch0.play: expected S.chapter 0, got ${st0.ch}`);

  // ---- P-1 "Rehearsal" (played through, not skipped) → gameplay at the Lookout ------------------------------------
  if (opts.shots) {
    for (const [t, n] of [[4, 'P1-1_wide'], [12, 'P1-2_memo'], [32, 'P1-3_note'], [38, 'P1-4_face'], [47, 'P1-5_insert'], [55, 'P1-5_nan']]) {
      if (!(await ev(h, 'return SH.mod.Script.cutscene'))) break;
      await advanceUntil(h, 'false', t - (await ev(h, 'return window.__p1t || 0')));
      await ev(h, `window.__p1t = ${t}; return 1`);
      await shot(h, opts, n);
    }
  }
  await mustReach(h, "!!SH.S.done['cs:P-1'] && SH.mod.World.room === 'p2_lookout' && !SH.mod.Script.cutscene && " + IDLE, 150, 'P-1 to end at the Lookout');
  if (!(await ev(h, 'return !!SH.S.flags.p0_carDead'))) notes.push('BUG: p0_carDead not set after P-1');
  const p1 = await lines(h);
  if (!p1.some((l) => l.includes('Hi. Um.') || l.includes('I kept pressing it.'))) notes.push('P-1 was skipped (skipIntro) — its lines were not seen');
  else for (const t of ['Hi. Um.', 'I served you. A few weeks ago. At the store.', 'Reset the modem. Check her alarm. Say sorry. Drive home.',
    '...it never connected, love. I kept pressing it.', "I'm coming. I'm going to fix it."]) await saw(h, t, notes, 'P-1');
  await advance(h, 4);                                                           // the three tutorial prompts
  for (const t of ['move', ': phone torch', ': examine']) await saw(h, t, notes, 'P-2 prompts');

  // ---- P-2 the Lookout: the modem (passenger seat), examines, the fog wall, the Visitor Map, the payphone -----------
  await interactAt(h, 22.05, 2.85, 0);
  await mustReach(h, "!!SH.S.taken['p2_lookout:modem'] && " + IDLE, 20, 'the Returned modem pickup');
  await saw(h, "She opened it. She plugged it in. It just didn't work.", notes, 'P-2 modem');
  await saw(h, 'Aidan picked up the returned modem.', notes, 'P-2 modem');
  await examineAt(h, 27.5, 2.4, 180);                                            // guardrail
  await saw(h, "Can't see the valley. Can't see anything.", notes, 'P-2 guardrail');
  await examineAt(h, 31.9, 2.1, 90);                                             // the road sign
  await saw(h, 'Mobile coverage ends.', notes, 'P-2 road sign');
  await ev(h, 'SH.teleport(4.2, 5.0, -90); SH.mod.Cam.snap(); return 1');     // back toward the city: the fog wall
  await walkTo(h, 0.3, 5.0, { maxSec: 5 });
  await advance(h, 1.5);
  await saw(h, "The road's just... gone.", notes, 'P-2 fog wall');
  if ((await ev(h, 'return SH.mod.Player.pos.x')) < 1.2) notes.push('BUG: walked through the west fog wall');
  await interactAt(h, 5.3, 2.2, -115);                                           // the Visitor Map inside the booth
  await mustReach(h, "!!SH.S.taken['p2_lookout:map'] && " + IDLE, 20, 'the Visitor Map pickup');
  if (!(await ev(h, "return SH.S.inv.some((i) => i.id === 'map_town')"))) notes.push('BUG: map_town not in the inventory');
  let slot = null;
  if (opts.saveLoad) {
    slot = await payphoneSave(h, 5.3, 2.5, -90, 0);
    await saw(h, 'Payphones save your progress.', notes, 'P-2 payphone');
    await saw(h, 'Progress saved.', notes, 'P-2 payphone');
    notes.push(`saved at the Lookout booth (slot ${slot})`);
  }

  // ---- to Hill Road (a real walk into the turn-off exit) -----------------------------------------------------------
  const toHill = async () => {
    await ev(h, 'SH.teleport(38.3, -2.6, 180); SH.mod.Cam.snap(); return 1');
    if (!(await walkTo(h, 38.3, -6.3, { until: "SH.mod.World.room === 'p3_hillroad'", maxSec: 12 }))) throw new Error('never reached Hill Road');
    await idle(h, 15, 'Hill Road loaded');
    await walkTo(h, 6, hrZ(6), { maxSec: 6 });                                   // a few metres under the high camera
  };
  const crossing = async (tag) => {
    const [x0, z0] = hrPt(37.5, 0);
    await ev(h, `SH.teleport(${x0}, ${z0}, 90); SH.mod.Cam.snap(); return 1`);
    await advance(h, 0.3);
    const [x1, z1] = hrPt(43, 0);
    await walkTo(h, x1, z1, { until: "SH.mod.Script.busy || !!SH.S.done['p3:crossed']", maxSec: 12 });
    if (opts.shots && tag) { await advance(h, 3.2); await shot(h, opts, 'P3_crossing'); }
    await mustReach(h, "!!SH.S.done['p3:crossed'] && " + IDLE, 40, 'the P-3 crossing');
    await saw(h, 'Excuse me!', notes, 'P-3');
  };
  await toHill();
  await crossing(true);
  if (opts.saveLoad) {
    // reload the Lookout save mid-chapter: back at the booth, before the crossing, carrying the modem and the map
    await loadSlot(h, slot);
    const r = await ev(h, "return { room: SH.mod.World.room, crossed: !!SH.S.done['p3:crossed'], modem: !!SH.S.taken['p2_lookout:modem'], map: SH.S.inv.some((i) => i.id === 'map_town'), ch: SH.S.chapter }");
    if (r.room !== 'p2_lookout' || r.crossed || !r.modem || !r.map || r.ch !== 0) throw new Error('bad state after loading the Lookout save: ' + JSON.stringify(r));
    notes.push('reloaded the Lookout save after the crossing; replaying from the booth');
    await toHill();
    await crossing(false);
  }
  { const [lx, lz] = hrPt(90.4, 3.1); const [bx, bz] = hrPt(90.4, 4.45); await examineAt(h, lx, lz, yawTo(lx, lz, bx, bz)); }
  await saw(h, 'Fair enough.', notes, 'P-3 letterbox');
  await ev(h, `SH.teleport(119, 0, 90); SH.mod.Cam.snap(); return 1`);
  if (!(await walkTo(h, 124, 0, { until: "SH.mod.World.room === 'p4_busshelter'", maxSec: 12 }))) throw new Error('never reached the bus shelter');
  await idle(h, 15, 'the bus shelter loaded');
  if (opts.shots) { await advance(h, 0.6); await shot(h, opts, 'P4_arrive'); }

  // ---- P-4 the bus shelter: the box cutter by the bin → the figure turns ------------------------------------------
  await walkTo(h, 12.1, 5.5, { maxSec: 20 });
  if (await ev(h, "return !!SH.S.done['p4:reveal']")) notes.push('P-4 fired before the box cutter (walked past the shelter front)');
  await interactAt(h, 12.1, 5.45, 90);
  await mustReach(h, "!!SH.S.taken['p4_busshelter:cutter'] && SH.mod.Script.active === 'cs:P-4'", 25, 'the box cutter pickup → P-4');
  await saw(h, "Someone's been breaking down boxes out here. Every store has one of these.", notes, 'P-4 cutter');
  if (opts.shots) { await advance(h, 3.6); await shot(h, opts, 'P4_reveal'); }
  await mustReach(h, "!!SH.S.done['p4:reveal'] && " + IDLE, 30, 'P-4 to end');
  await saw(h, 'What— what is that?', notes, 'P-4');
  await saw(h, 'Right mouse: ready weapon. Left click: attack.', notes, 'P-4 prompts');
  if ((await ev(h, 'return SH.S.equipped')) !== 'box_cutter') notes.push('BUG: the box cutter is not equipped after the pickup');

  // the fight: ready + attack with the box cutter until it is down (Player / Enemies APIs only as a fallback)
  const E = `SH.mod.Enemies.get(${JSON.stringify(TETH)})`;
  await ev(h, `const e = ${E}; SH.teleport(e.pos.x + 0.05, e.pos.z + 1.35, 180); SH.mod.Cam.snap(); return 1`);
  let swings = 0;
  for (; swings < 12; swings++) {
    const s = await ev(h, `const e = ${E}; return { down: !!(e && (e.downed || e.knocked)), hp: e ? e.hp : null, mode: SH.mod.Player.mode }`);
    if (s.down) break;
    if (s.mode === 'grabbed') { for (let i = 0; i < 8; i++) await press(h, 'interact', 0, 0.12); continue; }
    await ev(h, "SH.press('ready', 3); return 1");
    await advance(h, 0.35);
    await press(h, 'attack', 0, 0.75);
  }
  let down = await ev(h, `const e = ${E}; return !!(e && (e.downed || e.knocked))`);
  if (!down) { notes.push(`fallback: Enemies API downed the Tethered after ${swings} swings`); await ev(h, `const e = ${E}; e.damage(e.hp + 1, 'box_cutter'); return 1`); await advance(h, 0.3); }
  else notes.push(`downed with ${swings} box-cutter swings`);
  await ev(h, "SH.mod.Input.releaseAll && SH.mod.Input.releaseAll(); return 1");
  await advance(h, 0.4);
  await saw(h, ': stomp.', notes, 'P-4 downed prompt');
  await ev(h, `const e = ${E}; const p = SH.mod.Player.pos; SH.teleport(p.x, p.z, Math.atan2(e.pos.x - p.x, e.pos.z - p.z) * 180 / Math.PI); return 1`);
  await advance(h, 0.1);
  if (face) {
    await saw(h, ': cut it free.', notes, 'P-4 cut prompt');
    await h.page.keyboard.down('e');
    try { await advanceUntil(h, `!!SH.S.spawns[${JSON.stringify(TETH)}]`, 3.5, { step: 0.1 }); } finally { await h.page.keyboard.up('e'); }
  } else {
    await press(h, 'interact', 0, 0.6);
  }
  await mustReach(h, `!!SH.S.spawns[${JSON.stringify(TETH)}]`, 6, face ? 'the cut free (hold E)' : 'the stomp (E)');
  const how = await ev(h, `return SH.S.spawns[${JSON.stringify(TETH)}]`);
  if (how !== (face ? 'freed' : 'dead')) throw new Error(`Tethered resolved as ${how}`);
  const outLine = face ? '...There.' : 'It looked like—';
  await mustReach(h, `(window.__lines || []).some((l) => l.includes(${JSON.stringify(outLine)}))`, 25, 'the outcome line');
  await advance(h, 4);
  await saw(h, face ? 'There you go.' : "It wasn't a person. It wasn't.", notes, 'P-4 outcome');
  if (face && opts.shots) { await advance(h, 2); await ev(h, 'SH.teleport(9.0, 5.0, -90); SH.mod.Cam.snap(); return 1'); await advance(h, 0.5); await shot(h, opts, 'P4_freed'); }
  await idle(h, 20, 'control after the Tethered');

  // the Route 44 timetable on the shelter's back glass (Hard: the depot footer version)
  const riddle = await ev(h, 'return SH.S.difficulty.riddle');
  const docId = riddle === 'hard' ? 'timetable_hard' : 'timetable';
  await interactAt(h, 3.85, 1.55, 180);
  await mustReach(h, `SH.mod.Menus.current === 'doc' || !!(SH.S.docs[${JSON.stringify(docId)}] && SH.S.docs[${JSON.stringify(docId)}].read)`, 15, 'the timetable to open');
  if (opts.shots) { await advance(h, 1.0); await shot(h, opts, 'P4_timetable'); }
  await closeMenus(h);
  await idle(h, 10, 'the timetable closed');
  if (!(await ev(h, `return !!(SH.S.docs[${JSON.stringify(docId)}] && SH.S.docs[${JSON.stringify(docId)}].read)`))) notes.push(`BUG: ${docId} not read`);

  // sticker01 under the shelter bench (the connected / deal runs collect it)
  if (path === 'connected' || path === 'deal') {
    await interactAt(h, 4.68, 1.5, 180);
    await mustReach(h, `!!(SH.S.stickers && SH.S.stickers.sticker01) && ${IDLE}`, 15, 'sticker01');
  }

  // ---- P-4 8: walking on into town → CHAPTER CARD "SIGNAL HILL PLAZA" → chapter 1 at c1_relay:south --------------
  await ev(h, 'SH.teleport(10.2, -2.8, 180); SH.mod.Cam.snap(); return 1');
  if (!(await walkTo(h, 10.2, -6.4, { until: 'SH.S.chapter === 1', maxSec: 12 }))) throw new Error('walking north never started chapter 1');
  await mustReach(h, "SH.S.chapter === 1 && SH.mod.World.room === 'c1_relay' && !SH.mod.World.transitioning && SH.mode === 'play'", 40, 'chapter 1 at c1_relay');
  await saw(h, 'SIGNAL HILL PLAZA', notes, 'chapter card');
  const end = await ev(h, 'return { F: SH.S.F, A: SH.S.A, flags: { ...SH.S.flags }, spawns: SH.S.spawns, inv: SH.S.inv.map((i) => i.id), equipped: SH.S.equipped }');
  for (const id of ['returned_modem', 'map_town', 'box_cutter']) if (!end.inv.includes(id)) notes.push(`BUG: ${id} missing entering chapter 1`);
  return { chapter: 0, F: end.F, A: end.A, flags: end.flags, notes, inv: end.inv };
}

// =====================================================================================================================
async function runOne(h, cfg) {
  const e0 = await errorCount(h);
  await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(cfg.riddle)} }); return 1`);
  await advance(h, 1);
  await ev(h, 'await SH.chapter(0); return 1');
  await advance(h, 0.5);
  const t0 = Date.now();
  const r = await play(h, cfg);
  const errs = await ev(h, `return SH.errors.slice(${e0})`);
  const st = await ev(h, 'return { ch: SH.S.chapter, room: SH.mod.World.room, card: null }');
  const wantF = cfg.path === 'tomorrow' ? 0 : 1, wantA = cfg.path === 'tomorrow' ? 1 : 0;
  const bugs = r.notes.filter((n) => /^(BUG|MISSING)/.test(n));
  const ok = st.ch === 1 && st.room === 'c1_relay' && r.F === wantF && r.A === wantA && !errs.length && !bugs.length;
  report(`ch0 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, ok,
    `S.chapter=${st.ch} room=${st.room} F=${r.F} A=${r.A} (want ${wantF}/${wantA}) errors=${errs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s real`);
  for (const n of r.notes) console.log('   ·', n);
  for (const e of errs) console.log('   ! error:', e);
  return ok;
}
export default async function (page, h) {
  const one = process.env.CH0_PATH;
  const shots = process.env.CH0_SHOTS || null;
  const runs = one
    ? [{ path: one, riddle: process.env.CH0_RIDDLE || 'normal', saveLoad: process.env.CH0_SAVELOAD === '1', shots }]
    : [{ path: 'connected', riddle: 'normal', saveLoad: true, shots }, { path: 'tomorrow', riddle: 'hard', saveLoad: false }, { path: 'coverage', riddle: 'easy', saveLoad: false }];
  let all = true;
  for (const cfg of runs) {
    try { all = (await runOne(h, cfg)) && all; }
    catch (e) { all = false; report(`ch0 ${cfg.path}/${cfg.riddle}${cfg.saveLoad ? '/saveLoad' : ''}`, false, e.message); }
  }
  await assertNoErrors(h).catch((e) => { all = false; console.log(e.message); });
  report('ch0 (all runs)', all);
}
