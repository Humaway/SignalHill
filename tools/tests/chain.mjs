// tools/tests/chain.mjs — THE WHOLE GAME IN ONE SESSION: a real New Game from the title through the Prologue and
// Chapters 1–8 (tools/tests/ch0.mjs … ch8.mjs, each chapter's play() on the state the previous chapter left), the
// ending, the credits, the fate cards, the results and back to the title; then the §14 save checks.
//
//   node tools/build.mjs --out .build/chain.html
//   SH_PATH=connected node tools/run.mjs --file .build/chain.html --size 640x360 --script tools/tests/chain.mjs
//
// env: SH_PATH    connected (default) | coverage | tomorrow | deal   (the story decisions, see tools/tests/chN.mjs)
//      SH_RIDDLE  easy | normal (default) | hard                       (chosen on the NEW GAME setup screen)
//      SH_ACTION  easy | normal (default) | hard
//      SH_RESUME  1 — at every chapter start, continue from the chapter-start autosave (Game.continueFrom('auto'), the
//                 death screen's CONTINUE) before playing the chapter: every chapter is then played from its autosave
//      SH_SHOTS   a directory: a screenshot at every chapter hand-off (and on failure)
//      SH_FROM    N — debug aid: start at chapter N through SH.chapter(N) instead of the title (no chain before it)
//      SH_FROM_AUTO  a chapter-start autosave a chain run wrote (.build/chainlogs/<path>_<riddle>_chN.auto.json): debug aid,
//                 continue the chain from it (the title's LOAD GAME → AUTOSAVE)
//      SH_VERBOSE 1 — print every chapter's notes
//      SH_RENDER  1 — keep drawing frames (by default renderer.render is a no-op: see install())
//
// The flow:
//   1. boot → the title: PRESS ANY KEY → NEW GAME → ACTION / RIDDLE LEVEL → the brightness calibration (as a first-time
//      player) → the Prologue's P-1 must start (played through on 'connected', skipped on the other paths).
//   2. for N = 0 … 8: tools/tests/chN.mjs play(h, {path, riddle, saveLoad: N is 2, 5 or 7}); after each hand-off: S.chapter
//      is N+1, the chapter's start room is loaded, its begin() ran (once, not resumed), the chapter-start autosave holds
//      it, the carried state is sane (the key items every earlier chapter gives — the next chapter's debugState() is the
//      reference —, no duplicates, F/A never went down, the Luka calls so far each ended once and as the path answers
//      them, freed Tethered consistent, fate flags as the path decides them), no Outage / Outage bed / Outage textures
//      leaking into a chapter that starts in the Fog world, the player gets control, zero errors.
//   3. Chapter 8 hands over to Game.ending: the ending must be the path's (connected → connected, coverage → coverage,
//      tomorrow → tomorrow, deal → tomorrow via 8-2A), its cutscenes must run, then credits → fates (not after
//      tomorrow) → results → the title with EXTRA (tools/tests/endings.mjs playEnding).
//   4. §14 saves: every payphone save the chapters made in 2 / 5 / 7 (the last one of each) is loaded from the title's
//      LOAD GAME and must restore room, inventory, F/A, fate flags, chaseHits, calls, voicemails and the freed
//      Tethered exactly as saved; then pause → QUIT TO TITLE. Every chapter-start autosave (0–8) is continued from
//      (AUTOSAVE on LOAD GAME for the first) and must land at the chapter's start with begin({resumed:true}) run and the
//      player in control.
//   5. A per-chapter timeline (game minutes, walking skipped by teleports, cutscenes, F/A, fate flags) and an estimate
//      of a first playthrough (spec §14: 60–120 minutes).
// Prints PASS/FAIL lines; the last one is "PASS chain <path>/<riddle>".
import fs from 'node:fs';
import { ev, advance, advanceUntil, mustReach, report, titleNewGame, titleLoad, quitToTitle, menuReady, payphoneSave } from './lib.mjs';
import { spy as endSpy, playEnding } from './endings.mjs';

const CH = [];
for (let n = 0; n <= 8; n++) CH.push(await import(`./ch${n}.mjs`));

const WANT_ENDING = { connected: 'connected', coverage: 'coverage', tomorrow: 'tomorrow', deal: 'tomorrow' };
// the chapter that rings each of Luka's calls (CONTENT_PLAN §6)
const CALL_CH = { luka1: 1, luka2: 2, luka3: 3, luka4: 4, luka5: 5, luka6: 5, luka7: 6, luka8: 7 };
const FATES = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukaSaved', 'lukeSaved'];
// what each path decides (checked once the deciding chapter is over; null = not decided by the path)
const FATE_BY = {
  connected: { 3: { waiSaved: true }, 5: { chloeSaved: true }, 6: { lukaSaved: true }, 7: { chaseSaved: true, lukeSaved: true } },
  deal: { 3: { waiSaved: true }, 5: { chloeSaved: true }, 6: { lukaSaved: true }, 7: { chaseSaved: true, lukeSaved: true } },
  coverage: { 3: { waiSaved: false }, 5: { chloeSaved: false }, 7: { chaseSaved: false } },
  // (Wai's jacks are re-patched and Chloe's figure is never hit on 'tomorrow': those are not Avoid choices)
  tomorrow: { 3: { waiSaved: true }, 5: { chloeSaved: true }, 6: { lukaSaved: false }, 7: { chaseSaved: false, lukeSaved: false } },
};
const ENDING_CS = {
  connected: { must: ['E-C1', 'E-C2', 'E-C3'], never: ['E-OC0', 'E-OC', 'E-FT0', 'E-FT', '8-2A'] },
  coverage: { must: ['E-OC0', 'E-OC'], never: ['E-C1', 'E-C2', 'E-C3', 'E-FT0', 'E-FT', '8-2A'] },
  tomorrow: { must: ['E-FT0', 'E-FT'], never: ['E-C1', 'E-C2', 'E-C3', 'E-OC0', 'E-OC', '8-2A'] },
  deal: { must: ['8-2A', 'E-FT'], never: ['E-FT0', 'E-C1', 'E-C2', 'E-C3', 'E-OC0', 'E-OC'] },
};

// ---- the page-side recorder (Bus events, teleports, begin() calls, saves) -----------------------------------------
async function install(h) {
  // Nothing is drawn unless SH_RENDER=1: WebGL draws (SwiftShader, on the CPU) between the test's steps are what made a
  // chain crawl — three browsers kept every core busy rendering frames nobody looks at. The game logic, the post chain's
  // state and every timer run exactly as before; only renderer.render() is a no-op (screenshots draw a frame first).
  if (process.env.SH_RENDER !== '1') await ev(h, `const r = SH.mod.Render.renderer; if (r && !r.__render) { r.__render = r.render; r.render = function () {}; } return 1`);
  await ev(h, `if (!window.__chain) {
    const C = window.__chain = { ev: [], tp: {}, tpN: {}, begins: [], saves: [], autos: [], vm: 0 };
    const M = SH.mod, B = M.Bus;
    const at = () => ({ t: +((M.S.stats && M.S.stats.time) || 0).toFixed(1), real: +M.Time.real.toFixed(1), ch: M.S.chapter });
    B.on('cutscene', (id, what) => C.ev.push({ k: 'cs', id, what, ...at() }));
    B.on('call:ring', (id) => C.ev.push({ k: 'ring', id, ...at() }));
    B.on('call:end', (id, how) => C.ev.push({ k: 'call', id, how, ...at() }));
    B.on('chapter', (n) => C.ev.push({ k: 'chapter', n, room: M.World.room, ...at() }));
    B.on('load', (slot) => C.ev.push({ k: 'load', slot, calls: { ...M.S.calls }, ...at() }));
    B.on('outage', (on) => C.ev.push({ k: 'outage', on, room: M.World.room, ...at() }));
    B.on('voicemail', (id) => C.ev.push({ k: 'vm', id, ...at() }));
    B.on('save', (slot) => {
      try {
        const raw = localStorage.getItem(M.Save._key(slot));
        if (slot === 'auto') { let cs = null; try { cs = JSON.parse(raw).chapterStart ?? null; } catch (e) {} C.autos.push({ ch: M.S.chapter, cs, raw }); }
        else C.saves.push({ slot, ch: M.S.chapter, room: M.S.room, raw, snap: JSON.parse(JSON.stringify(M.S)) });
      } catch (e) { C.ev.push({ k: 'saveErr', msg: String(e) }); }
    });
    // teleports stand in for walking: add up the distance skipped (same-room jumps only)
    const tp = SH.teleport;
    SH.teleport = (x, z, yaw) => {
      try { const p = M.Player.pos, d = Math.hypot(x - p.x, z - p.z), ch = M.S.chapter; if (d < 250) { C.tp[ch] = (C.tp[ch] || 0) + d; C.tpN[ch] = (C.tpN[ch] || 0) + 1; } } catch (e) {}
      return tp(x, z, yaw);
    };
    // every chapter's begin(G, o): who ran, and whether it was a resume
    M.CHAPTERS.forEach((ch, n) => { if (!ch || typeof ch.begin !== 'function' || ch.begin.__chain) return;
      const b = ch.begin; ch.begin = function (G, o) { C.begins.push({ n, resumed: !!(o && o.resumed), room: M.World.room, ...at() }); return b.call(this, G, o); }; ch.begin.__chain = true; });
  } return 1;`);
}
const chainEv = (h, since = 0) => ev(h, `return window.__chain.ev.slice(${since})`);

// ---- state snapshot and the hand-off checks ---------------------------------------------------------------------
const snapState = (h) => ev(h, `const M = SH.mod, S = SH.S;
  return { chapter: S.chapter, room: M.World.room, F: S.F, A: S.A, flags: { ...S.flags }, chaseHits: S.chaseHits, calls: { ...S.calls },
    voicemails: (S.voicemails || []).map((v) => v.id + (v.played ? '+' : '')), inv: S.inv.map((i) => i.id + (i.n > 1 ? '×' + i.n : '')),
    equipped: S.equipped, health: S.health, outage: !!S.outage, time: +(S.stats.time || 0).toFixed(1), freed: S.stats.freed, stomped: S.stats.stomped,
    freedOrder: (S.freedOrder || []).slice(), spawns: { ...S.spawns }, docs: Object.keys(S.docs || {}).length, saves: S.saves, stickers: Object.keys(S.stickers || {}).length,
    ammo: { ...(S.ammo || {}) } };`);

async function handoff(h, n, ctx) {
  const bad = [], info = [];
  const B = (m) => bad.push(m);
  const start = await ev(h, `const c = SH.mod.CHAPTERS[${n}]; return c && c.start ? { room: c.start.room, entry: c.start.entry, title: c.title } : null`);
  // (the chapter's test already waited for this; the check is the chain's own)
  if (!(await advanceUntil(h, `SH.S.chapter === ${n} && SH.mod.World.room === ${JSON.stringify(start.room)} && !SH.mod.World.transitioning`, 30))) {
    B(`chapter ${n}: S.chapter ${await ev(h, 'return SH.S.chapter')} / room ${await ev(h, 'return SH.mod.World.room')} — want ${n} at ${start.room}`);
  }
  // begin() ran once for this chapter since the previous hand-off (a live start: not resumed)
  const begins = (await ev(h, `return window.__chain.begins.slice(${ctx.beginMark})`)).filter((b) => b.n === n);
  if (!begins.length) B(`chapter ${n}: begin() never ran`);
  else if (begins.length > 1) B(`chapter ${n}: begin() ran ${begins.length} times: ${JSON.stringify(begins)}`);
  else if (begins[0].resumed) B(`chapter ${n}: begin() ran as resumed on a live hand-off`);
  else if (begins[0].room !== start.room) B(`chapter ${n}: begin() ran in ${begins[0].room}, not ${start.room}`);
  // the chapter-start autosave
  const auto = await ev(h, `const e = SH.mod.Save._readEnv('auto'); return e ? { chapterStart: e.chapterStart, start: e.start, ch: e.S.chapter, F: e.S.F, A: e.S.A, inv: e.S.inv.map((i) => i.id) } : null`);
  if (!auto) B(`chapter ${n}: no autosave`);
  else if (auto.chapterStart !== n || auto.ch !== n || !auto.start || auto.start.room !== start.room || (auto.start.entry ?? null) !== (start.entry ?? null)) B(`chapter ${n}: the autosave is ${JSON.stringify({ chapterStart: auto.chapterStart, ch: auto.ch, start: auto.start })}`);
  // control: begin's thoughts run in the background; the player must be free to walk (at most a few seconds of scene)
  const freeP = "SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen() && SH.mod.Player.control !== false && !SH.mod.Player.locked && SH.mod.Player.mode === 'normal' && !SH.mod.Player.dead";
  if (!(await advanceUntil(h, freeP, 25))) B(`chapter ${n}: the player never got control: ${JSON.stringify(await ev(h, "return { st: SH.state(), locked: SH.mod.Player.locked, pmode: SH.mod.Player.mode, control: SH.mod.Player.control, busy: SH.mod.Script.active }"))}`);
  const s = await snapState(h);
  // the Outage: only Chapter 8 starts in it (begin brings the siren); nothing of it may leak into a Fog-world start
  const out = await ev(h, 'const st = SH.mod.Snd.stats(); return { tex: SH.mod.Tex.outage, bed: st.bed, outageBed: st.outageBed, music: st.music, static: st.static, busy: SH.mod.World.outageBusy, std: SH.mod.Enemies.standard.active ? SH.mod.Enemies.standard.state : null, amb: (SH.mod.World.def || {}).ambient || null }');
  if (n !== 8) {
    if (s.outage) B(`chapter ${n}: starts in the Outage`);
    if (out.tex > 0.01) B(`chapter ${n}: Outage textures still showing (Tex.outage ${out.tex})`);
    if (out.outageBed) B(`chapter ${n}: the Outage ambient bed is still playing`);
    if (out.busy) B(`chapter ${n}: an Outage transition is still running`);
  }
  // (Chapter 8's begin() brings the Outage with the siren a moment after the arrival: checked once the chapter is played,
  // from the recorder — waiting here would eat begin()'s first thought before the chapter's own test starts listening)
  if (out.amb && out.bed && out.bed !== out.amb && out.bed !== 'none') info.push(`ambient bed ${out.bed} (room says ${out.amb})`);
  info.push(`bed ${out.bed}${out.music ? ' +music' : ''}${out.std ? ' · the Standard: ' + JSON.stringify(out.std) : ''}`);
  // F / A never go down between chapter starts; the path's lean
  if (ctx.prev && (s.F < ctx.prev.F || s.A < ctx.prev.A)) B(`chapter ${n}: F/A went down: ${ctx.prev.F}/${ctx.prev.A} → ${s.F}/${s.A}`);
  if (ctx.path === 'tomorrow' ? s.A < s.F : s.F <= s.A) B(`chapter ${n}: F ${s.F} / A ${s.A} do not lean the path's way (${ctx.path})`);
  // Luka's calls: each earlier one ended exactly once, answered on the Face paths, declined on 'tomorrow'; no later one yet
  const want = ctx.path === 'tomorrow' ? 'declined' : 'answered';
  for (const [id, c] of Object.entries(CALL_CH)) {
    if (c < n && s.calls[id] !== want) B(`chapter ${n}: ${id} is ${s.calls[id] || 'missing'} (want ${want})`);
    if (c >= n && s.calls[id]) B(`chapter ${n}: ${id} already ${s.calls[id]} (it belongs to chapter ${c})`);
  }
  const ends = {};
  for (const e of await chainEv(h)) {
    if (e.k === 'load') { for (const id of Object.keys(ends)) if (!e.calls[id]) ends[id] = 0; }
    if (e.k === 'call' && e.how !== 'cancelled') ends[e.id] = (ends[e.id] || 0) + 1;
  }
  for (const [id, k] of Object.entries(ends)) if (k > 1) B(`chapter ${n}: ${id} rang through ${k} times`);
  // freed Tethered: S.freedOrder ↔ S.spawns ↔ S.stats.freed
  for (const id of s.freedOrder) if (s.spawns[id] !== 'freed') B(`chapter ${n}: ${id} is in freedOrder but spawns says ${s.spawns[id]}`);
  const freedN = Object.values(s.spawns).filter((v) => v === 'freed').length;
  if (freedN !== s.freedOrder.length) B(`chapter ${n}: ${freedN} spawns freed but freedOrder has ${s.freedOrder.length}`);
  // inventory: no doubled one-offs; every key item / weapon / map the next chapter's debugState hands a chapter-select
  // player (what the earlier chapters give) is carried
  const invChk = await ev(h, `const M = SH.mod, S = SH.S, ch = M.CHAPTERS[${n}];
    const t = { inv: [], flags: { waiSaved: false, chaseSaved: false, chloeSaved: false, lukaSaved: false, lukeSaved: false, acceptedDeal: false }, docs: {}, maps: {}, calls: {}, done: {}, spawns: {}, freedOrder: [], taken: {}, notes: [], stickers: {},
      stats: { freed: 0, callsAnswered: 0 }, ammo: { extinguisher: 6 }, difficulty: { ...S.difficulty }, chapter: ${n}, F: 0, A: 0, chaseHits: S.chaseHits, health: 100 };
    try { if (ch && ch.debugState) ch.debugState(t); } catch (e) { return { err: String(e) }; }
    const cat = (id) => (M.ITEMS[id] && M.ITEMS[id].cat) || '?';
    const have = S.inv.map((i) => i.id);
    const dup = S.inv.filter((i) => i.n > 1 && M.ITEMS[i.id] && !M.ITEMS[i.id].stack && cat(i.id) !== 'item').map((i) => i.id + '×' + i.n);
    const want = t.inv.map((i) => i.id).filter((id) => cat(id) !== 'item');
    return { missing: want.filter((id) => !have.includes(id)), extra: have.filter((id) => cat(id) !== 'item' && !want.includes(id)), dup, cats: Object.fromEntries(have.map((id) => [id, cat(id)])) };`);
  if (invChk.err) B(`chapter ${n}: debugState threw: ${invChk.err}`);
  if (invChk.missing && invChk.missing.length) B(`chapter ${n}: carried inventory lacks ${invChk.missing.join(', ')} (the chapter's debugState gives them)`);
  if (invChk.extra && invChk.extra.length) info.push(`carries beyond debugState: ${invChk.extra.join(', ')}`);
  if (invChk.dup && invChk.dup.length) B(`chapter ${n}: doubled one-off items ${invChk.dup.join(', ')}`);
  // fate flags the path has decided by now
  for (const [c, fl] of Object.entries(FATE_BY[ctx.path] || {})) {
    if (+c >= n) continue;
    for (const [k, v] of Object.entries(fl)) if (!!s.flags[k] !== v) B(`chapter ${n}: ${k} is ${!!s.flags[k]} (the ${ctx.path} path decides it ${v} in chapter ${c})`);
  }
  if (n >= 4 && !s.flags.waiSaved !== !!s.flags.waiLost) B(`chapter ${n}: waiSaved ${s.flags.waiSaved} / waiLost ${s.flags.waiLost} disagree`);
  if (n >= 5 && !!s.flags.chaseHurt !== (s.chaseHits >= 4)) B(`chapter ${n}: chaseHurt ${s.flags.chaseHurt} but chaseHits ${s.chaseHits}`);
  if (n >= 7 && s.flags.standardName !== 'AIDAN') B(`chapter ${n}: standardName is ${s.flags.standardName} after 6-2`);
  if (n >= 1 && n < 7 && s.flags.standardName && s.flags.standardName !== 'LUKA') B(`chapter ${n}: standardName ${s.flags.standardName} before 6-2`);
  // zero errors
  const errs = await ev(h, `return SH.errors.slice(${ctx.errMark})`);
  for (const e of errs) B(`error: ${e}`);
  return { s, bad, info };
}

// ---- the hand-offs' timeline ----------------------------------------------------------------------------------------
function csTime(evs, ch) {
  // played / skipped cutscene seconds per chapter (start → end or skip)
  let played = 0, skipped = 0, n = 0; const open = {};
  for (const e of evs) {
    if (e.k !== 'cs' || e.ch !== ch) continue;
    if (e.what === 'start') { open[e.id] = e; n++; }
    else if (open[e.id]) { const d = Math.max(0, e.t - open[e.id].t); if (e.what === 'skip') skipped++; else played += d; delete open[e.id]; }
  }
  return { played, skipped, n };
}

// ---- §14 saves after the ending --------------------------------------------------------------------------------------
// compare the loaded game with the S recorded when save #i was written (§14: room, inventory, F/A, fate flags,
// chaseHits, calls, voicemails, the freed Tethered) → [problems]
async function compareToSave(h, i) {
  return ev(h, `const want = window.__chain.saves[${i}].snap, S = SH.S, M = SH.mod, bad = [];
    const J = (x) => JSON.stringify(x);
    const inv = (s) => s.inv.map((i) => i.id + '×' + i.n).sort().join(' ');
    if (M.World.room !== want.room) bad.push('room ' + M.World.room + ' ≠ ' + want.room);
    if (Math.hypot(M.Player.pos.x - want.pos[0], M.Player.pos.z - want.pos[2]) > 1.0) bad.push('position ' + [M.Player.pos.x, M.Player.pos.z].map((v) => v.toFixed(1)) + ' ≠ ' + [want.pos[0], want.pos[2]].map((v) => v.toFixed(1)));
    if (inv(S) !== inv(want)) bad.push('inventory ' + inv(S) + ' ≠ ' + inv(want));
    if (S.equipped !== want.equipped) bad.push('equipped ' + S.equipped + ' ≠ ' + want.equipped);
    if (S.health !== want.health) bad.push('health ' + S.health + ' ≠ ' + want.health);
    if (S.F !== want.F || S.A !== want.A) bad.push('F/A ' + S.F + '/' + S.A + ' ≠ ' + want.F + '/' + want.A);
    if (J(S.flags) !== J(want.flags)) bad.push('flags differ: ' + Object.keys({ ...S.flags, ...want.flags }).filter((k) => J(S.flags[k]) !== J(want.flags[k])).map((k) => k + ' ' + J(S.flags[k]) + '≠' + J(want.flags[k])).join(', '));
    if (S.chaseHits !== want.chaseHits) bad.push('chaseHits ' + S.chaseHits + ' ≠ ' + want.chaseHits);
    if (J(S.calls) !== J(want.calls)) bad.push('calls ' + J(S.calls) + ' ≠ ' + J(want.calls));
    if (J(S.voicemails) !== J(want.voicemails)) bad.push('voicemails ' + J(S.voicemails) + ' ≠ ' + J(want.voicemails));
    if (J(S.freedOrder) !== J(want.freedOrder)) bad.push('freedOrder ' + J(S.freedOrder) + ' ≠ ' + J(want.freedOrder));
    if (J(S.spawns) !== J(want.spawns)) bad.push('spawns differ: ' + Object.keys({ ...S.spawns, ...want.spawns }).filter((k) => S.spawns[k] !== want.spawns[k]).join(','));
    if (J(S.docs) !== J(want.docs)) bad.push('documents differ');
    if (J(S.taken) !== J(want.taken)) bad.push('taken pickups differ');
    if (!!S.outage !== !!want.outage) bad.push('outage ' + S.outage + ' ≠ ' + want.outage);
    if (S.chapter !== want.chapter) bad.push('chapter ' + S.chapter + ' ≠ ' + want.chapter);
    // the freed Tethered of this room are rebuilt, passive; the stomped ones dead
    const here = Object.keys(S.spawns).filter((id) => id.startsWith(M.World.room + ':'));
    for (const id of here) { const e = M.Enemies.get(id); const v = S.spawns[id];
      if ((v === 'freed') && (!e || e.resolved !== 'freed')) bad.push(id + ' was freed but is ' + (e ? e.resolved : 'not rebuilt'));
      if (v === 'dead' && e && !e.removed && e.resolved !== 'dead' && e.hp > 0 && e.hostile) bad.push(id + ' was killed but is back'); }
    return { bad, room: M.World.room, F: S.F, A: S.A, freedHere: here.filter((id) => S.spawns[id] === 'freed').length, calls: Object.keys(S.calls).length, vm: S.voicemails.length, inv: S.inv.length, outage: !!S.outage };`);
}
// §14: every chapter that saved at a payphone (2 / 5 / 7): its last save loaded from the title's LOAD GAME must be the
// game as it was saved; then a fresh payphone save right there → pause → QUIT TO TITLE → LOAD GAME → the same again
async function checkPayphoneLoads(h, notes) {
  const saves = await ev(h, 'return window.__chain.saves.map((s, i) => ({ i, slot: s.slot, ch: s.ch, room: s.room }))');
  notes.push(`payphone saves made: ${saves.map((s) => `ch${s.ch}:slot${s.slot + 1}@${s.room}`).join(', ') || 'none'}`);
  const last = {};
  for (const s of saves) last[s.ch] = s;
  const picks = Object.values(last);
  if (!picks.length) { notes.push('BUG: no payphone save was made in chapters 2 / 5 / 7'); return; }
  for (const p of picks) {
    // (a later chapter may have overwritten the slot: put this save back first)
    await ev(h, `const s = window.__chain.saves[${p.i}]; localStorage.setItem(SH.mod.Save._key(s.slot), s.raw); return 1`);
    await titleLoad(h, p.slot);
    await advance(h, 0.5);
    let r = await compareToSave(h, p.i);
    notes.push(`LOAD GAME slot ${p.slot + 1} (the chapter ${p.ch} payphone save): ${r.room}${r.outage ? ' (Outage)' : ''}, F/A ${r.F}/${r.A}, ${r.inv} items, ${r.calls} calls, ${r.vm} voicemails, ${r.freedHere} freed here${r.bad.length ? '' : ' — as saved'}`);
    for (const b of r.bad) notes.push(`BUG: LOAD GAME slot ${p.slot + 1} (ch ${p.ch}): ${b}`);
    // save again at that payphone (he stands at it, facing it), quit to the title, load it back
    await advanceUntil(h, "SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning", 20, { each: 'if (SH.mod.Script.skippable) SH.skip();' });
    const at = await ev(h, 'return { x: SH.mod.Player.pos.x, z: SH.mod.Player.pos.z, yaw: SH.mod.Player.yawDeg }');
    const n0 = await ev(h, 'return window.__chain.saves.length');
    await payphoneSave(h, at.x, at.z, at.yaw, p.slot);
    const n1 = await ev(h, 'return window.__chain.saves.length');
    if (n1 === n0) { notes.push(`BUG: the payphone at ${JSON.stringify(at)} (ch ${p.ch}) did not save`); await quitToTitle(h); continue; }
    await advance(h, 2);
    await quitToTitle(h);
    await titleLoad(h, p.slot);
    await advance(h, 0.5);
    r = await compareToSave(h, n1 - 1);
    notes.push(`payphone save → QUIT TO TITLE → LOAD GAME slot ${p.slot + 1} (ch ${p.ch}): ${r.bad.length ? r.bad.length + ' differences' : 'as saved'}`);
    for (const b of r.bad) notes.push(`BUG: save → quit → load (ch ${p.ch}): ${b}`);
    // the Tethered resolved before the save stay resolved in their own rooms: visit the room of the latest one (debug jump)
    // (only spawns that exist in the world the save is in: the Fog-world Tethered of a room are not there in its Outage)
    const ACTIVE = `const act = (id) => { const room = id.split(':')[0], d = (SH.mod.SPAWNS[room] || []).find((x) => x.id === id); if (!d) return false;
      const w = d.world || 'both'; if (w !== 'both' && w !== (SH.S.outage ? 'outage' : 'fog')) return false; try { return !d.when || !!d.when(SH.S); } catch (e) { return false; } };`;
    const last = await ev(h, `${ACTIVE} const S = SH.S; const ids = Object.keys(S.spawns).filter((id) => (S.spawns[id] === 'freed' || S.spawns[id] === 'dead') && SH.mod.ROOMS[id.split(':')[0]] && id.split(':')[0] !== SH.mod.World.room && act(id));
      const fo = (S.freedOrder || []).filter((id) => ids.includes(id)); return fo.length ? fo[fo.length - 1] : ids[ids.length - 1] || null;`);
    if (last) {
      const room = last.split(':')[0];
      await ev(h, `await SH.goto(${JSON.stringify(room)}, null); return 1`);
      await advanceUntil(h, `SH.mod.World.room === ${JSON.stringify(room)} && !SH.mod.World.transitioning`, 15);
      await advance(h, 0.5);
      const t = await ev(h, `${ACTIVE} const S = SH.S, M = SH.mod; return Object.keys(S.spawns).filter((id) => id.startsWith(${JSON.stringify(room + ':')}) && act(id)).map((id) => { const e = M.Enemies.get(id); return [id, S.spawns[id], e ? (e.resolved || (e.removed ? 'removed' : 'active')) : 'none']; });`);
      const wrong = t.filter(([, want, got]) => (want === 'freed' && got !== 'freed') || (want === 'dead' && got === 'active'));
      notes.push(`  ${room} after the load: ${t.map(([id, w, g]) => `${id.split(':')[1]} ${w}→${g}`).join(', ')}`);
      for (const [id, w, g] of wrong) notes.push(`BUG: after LOAD GAME (ch ${p.ch}) ${id} was ${w} but is ${g}`);
    }
    await advance(h, 1);
    await quitToTitle(h);
  }
}
async function checkAutosaves(h, notes, handoffs) {
  const autos = await ev(h, 'return window.__chain.autos.map((a, i) => ({ i, ch: a.ch, cs: a.cs }))');
  notes.push(`autosaves written: ${autos.map((a) => a.cs !== null ? `start ${a.cs}` : `ch${a.ch}`).join(', ')}`);
  // the chapter-start autosave of each chapter (a chapter's own mid-chapter G.autosave() — before a boss — is not it)
  for (let n = 0; n <= 8; n++) {
    const a = autos.filter((x) => x.cs === n).pop();
    if (!a) { notes.push(`BUG: no chapter-start autosave for chapter ${n}`); continue; }
    const e0 = await ev(h, 'return SH.errors.length');
    const b0 = await ev(h, 'return window.__chain.begins.length');
    await ev(h, `localStorage.setItem(SH.mod.Save._key('auto'), window.__chain.autos[${a.i}].raw); return 1`);
    if (n === 0) await titleLoad(h, 'auto');                               // the first through the title's LOAD GAME
    else {
      await ev(h, "SH.mod.Game.continueFrom('auto'); return 1");         // the rest as CONTINUE does
      await advance(h, 0.3);
      await mustReach(h, "SH.mode !== 'loading' && !!SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", 30, `continue from the chapter ${n} autosave`);
    }
    // (continueFrom runs begin() once the room has faded in)
    await advanceUntil(h, `window.__chain.begins.length > ${b0}`, 8, { step: 0.1 });
    const st = await ev(h, `const c = SH.mod.CHAPTERS[${n}].start; return { room: SH.mod.World.room, want: c.room, ch: SH.S.chapter, F: SH.S.F, A: SH.S.A, inv: SH.S.inv.map((i) => i.id).sort().join(' '), begins: window.__chain.begins.slice(${b0}) }`);
    const bad = [];
    const bs = st.begins.filter((x) => x.n === n);
    // (where the chapter resumed: the room begin() started in — the Prologue's P-1 moves on to the Lookout at once)
    const at = bs.length ? bs[0].room : st.room;
    if (at !== st.want) bad.push(`resumed in ${at}, want ${st.want}`);
    if (st.ch !== n) bad.push(`S.chapter ${st.ch}`);
    if (bs.length !== 1 || !bs[0].resumed) bad.push(`begin(): ${JSON.stringify(st.begins)}`);
    const ho = handoffs[n];
    if (ho && (ho.F !== st.F || ho.A !== st.A)) bad.push(`F/A ${st.F}/${st.A}, the chapter started with ${ho.F}/${ho.A}`);
    if (ho && ho.invIds !== st.inv) bad.push(`inventory ${st.inv} ≠ ${ho.invIds}`);
    // the player gets control (scenes skipped: chapter 0 replays P-1), then a few seconds of play
    const ok = await advanceUntil(h, "SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen() && SH.mod.Player.control !== false && !SH.mod.Player.locked", 60, { each: 'if (SH.mod.Script.skippable && !SH.mod.Script.skipping) SH.skip();' });
    if (!ok) bad.push('no control: ' + JSON.stringify(await ev(h, 'return SH.state()')));
    await advance(h, 3);
    const errs = await ev(h, `return SH.errors.slice(${e0})`);
    for (const e of errs) bad.push('error: ' + e);
    notes.push(`autosave ch${n}: ${bad.length ? 'FAIL' : 'ok'} — ${at} F/A ${st.F}/${st.A}${bad.length ? ' — ' + bad.join(' | ') : ''}`);
    for (const b of bad) notes.push(`BUG: autosave ch${n}: ${b}`);
  }
  await quitToTitle(h);
}

// =====================================================================================================================
export default async function (page, h) {
  const path = process.env.SH_PATH || 'connected';
  const riddle = process.env.SH_RIDDLE || 'normal';
  const action = process.env.SH_ACTION || 'normal';
  const resume = process.env.SH_RESUME === '1';
  const shots = process.env.SH_SHOTS || '';
  let from = process.env.SH_FROM ? Number(process.env.SH_FROM) : 0;
  const fromAuto = process.env.SH_FROM_AUTO || '';
  if (!WANT_ENDING[path]) throw new Error('SH_PATH must be connected|coverage|tomorrow|deal');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const T0 = Date.now();
  const tag = `${path}/${riddle}${action !== 'normal' ? '/action-' + action : ''}${resume ? '/resume' : ''}`;
  const all = [];                    // BUG lines
  const timeline = [];
  const handoffs = [];
  const shot = async (name) => { if (!shots) return; try { await ev(h, 'const r = SH.mod.Render.renderer, nr = r.render; if (r.__render) r.render = r.__render; try { SH.mod.Render.render(0); } finally { r.render = nr; } return 1'); await h.shot(`${shots}/${name}.png`); } catch (e) { /* optional */ } };
  let failed = null;

  try {
    await install(h);
    await endSpy(h);
    // ---- 1. the title → NEW GAME → setup → calibration → P-1 ------------------------------------------------------
    if (fromAuto) {
      // debug aid: continue from a chapter-start autosave a chain run wrote (.build/chainlogs/<path>_<riddle>_chN.auto.json)
      const raw = fs.readFileSync(fromAuto, 'utf8');
      await ev(h, `localStorage.setItem(SH.mod.Save._key('auto'), ${JSON.stringify(raw)}); return 1`);
      await titleLoad(h, 'auto');
      from = await ev(h, 'return SH.S.chapter');
      await advanceUntil(h, "SH.mode === 'play' && !SH.mod.Script.busy && SH.mod.Player.control !== false", 20);
      console.log(`(SH_FROM_AUTO: continued at chapter ${from} from ${fromAuto})`);
    } else if (from > 0) {
      await ev(h, `await SH.newGame({ skipIntro: true, riddle: ${JSON.stringify(riddle)}, action: ${JSON.stringify(action)} }); await SH.chapter(${from}); return 1`);
      console.log(`(SH_FROM=${from}: started at chapter ${from} through SH.chapter — not a real chain)`);
    } else {
      const ng = await titleNewGame(h, { action, riddle });
      const d = await ev(h, 'return { ...SH.S.difficulty, ch: SH.S.chapter, pt: SH.S.playthrough, cal: SH.mod.META.calibrated }');
      console.log(`NEW GAME: setup ${JSON.stringify(ng)} → S.difficulty ${JSON.stringify(d)}`);
      if (d.action !== action || d.riddle !== riddle) all.push(`BUG: the setup screen chose ${d.action}/${d.riddle}, want ${action}/${riddle}`);
      if (!d.cal) all.push('BUG: the brightness calibration was not recorded (META.calibrated)');
      await mustReach(h, "SH.mod.Script.active === 'cs:P-1' || !!SH.S.done['cs:P-1']", 20, 'the opening cutscene P-1 to start', { step: 0.1 });
      // (P-1 opens on the roadside wide shot at the Lookout, then cuts into the car)
      const p1 = await ev(h, "return { active: SH.mod.Script.active, cs: SH.mod.Script.cutscene, room: SH.mod.World.room, letterbox: SH.mod.UI.letterboxed, ch: SH.S.chapter }");
      if (p1.active !== 'cs:P-1' || !p1.cs || !p1.letterbox || p1.ch !== 0 || !['p1_car', 'p2_lookout'].includes(p1.room)) all.push(`BUG: P-1 did not start as a letterboxed scene: ${JSON.stringify(p1)}`);
      await advance(h, 3);
      if (!(await ev(h, "return SH.mod.Script.active === 'cs:P-1' && SH.mod.Script.cutscene"))) all.push(`BUG: P-1 stopped within 3 s: ${JSON.stringify(await ev(h, 'return SH.state()'))}`);
      await shot('p1');
      if (path !== 'connected') { await ev(h, 'SH.skip(); return 1'); console.log(`P-1 started (${p1.room}); skipped`); }
      else console.log(`P-1 started (${p1.room}); played through`);
    }
    // ---- 2. the chapters -------------------------------------------------------------------------------------------
    let prev = null;
    let mark = { ev: 0, err: await ev(h, 'return SH.errors.length'), begin: 0 };
    for (let n = from; n <= 8; n++) {
      const t0 = Date.now();
      const s0 = await snapState(h);
      if (n > from) handoffs[n] = { F: s0.F, A: s0.A, invIds: (await ev(h, 'return SH.S.inv.map((i) => i.id).sort().join(" ")')) };
      if (resume && n > 0) {
        // continue from the chapter-start autosave just written, as a player coming back would
        const b0 = await ev(h, 'return window.__chain.begins.length');
        await ev(h, "SH.mod.Game.continueFrom('auto'); return 1");
        await advance(h, 0.3);
        await mustReach(h, "SH.mode !== 'loading' && !!SH.mod.World.room && !SH.mod.World.transitioning", 30, `continue at chapter ${n}`);
        await advanceUntil(h, `window.__chain.begins.length > ${b0}`, 8, { step: 0.1 });
        const bs = (await ev(h, `return window.__chain.begins.slice(${b0})`)).filter((b) => b.n === n);
        if (bs.length !== 1 || !bs[0].resumed) all.push(`BUG: resume ch${n}: begin() ${JSON.stringify(bs)}`);
        await advanceUntil(h, "SH.mode === 'play' && !SH.mod.Script.busy && SH.mod.Player.control !== false", 20);
      }
      const evMark = n === from ? 0 : await ev(h, 'return window.__chain.ev.length');
      // (the ending sets draw their canvases — the leaderboard, the back-office monitor — as their scene starts, which on the
      // deal path is before Chapter 8's test hands over: record them from the start of the chapter)
      if (n === 8) await ev(h, 'window.__endCanvasSpy = true; return 1');
      const r = await CH[n].play(h, { path, riddle, saveLoad: n === 2 || n === 5 || n === 7, notes: [] });
      const bugs = (r.notes || []).filter((x) => /^(BUG|MISSING)/.test(x));
      const evs = await chainEv(h, evMark);
      const real = (Date.now() - t0) / 1000;
      const row = { n, F: r.F, A: r.A, real, notes: r.notes || [], s0t: s0.time };
      for (const b of bugs) all.push(`ch${n}: ${b}`);
      if (n < 8) {
        const ctx = { path, prev, errMark: mark.err, beginMark: mark.begin };
        const ho = await handoff(h, n + 1, ctx);
        await shot(`handoff_${n + 1}`);
        // (the chapter-start autosave on disk: SH_FROM_AUTO=<file> replays the chain from it)
        try { fs.mkdirSync('.build/chainlogs', { recursive: true }); fs.writeFileSync(`.build/chainlogs/${path}_${riddle}_ch${n + 1}.auto.json`, await ev(h, "return localStorage.getItem(SH.mod.Save._key('auto'))")); } catch (e) { /* optional */ }
        for (const b of ho.bad) all.push(`hand-off ${n}→${n + 1}: ${b}`);
        row.s = ho.s; row.info = ho.info; row.ok = !ho.bad.length && !bugs.length;
        prev = ho.s;
      } else {
        const o8 = evs.find((e) => e.k === 'outage' && e.ch === 8);
        if (!o8 || !o8.on || o8.room !== 'c8_summit') all.push(`BUG: chapter 8: begin() did not bring the Outage on Summit Road (${JSON.stringify(o8 || null)})`);
        else if (o8.t - (row.s0t || 0) > 20) all.push(`BUG: chapter 8: the Outage came ${o8.t} s in`);
        row.s = await snapState(h);
        row.info = [`ending ${r.ending}, mode ${await ev(h, 'return SH.mode')}`];
        row.ending = r.ending;
      }
      row.min = Math.max(0, ((row.s.time || 0) - (s0.time || 0)) / 60);
      row.tp = await ev(h, `return +((window.__chain.tp[${n}] || 0)).toFixed(0)`);
      row.cs = csTime(evs, n);
      row.docs = (row.s.docs || 0) - (s0.docs || 0);
      timeline.push(row);
      const fl = FATES.filter((k) => row.s.flags[k]).map((k) => k.replace('Saved', '')).join(' ') || '-';
      console.log(`${row.ok === false || bugs.length ? 'FAIL' : 'ok  '} chapter ${n} → ${n < 8 ? 'chapter ' + (n + 1) + ' at ' + row.s.room : 'the ending ' + r.ending}: F ${row.s.F} A ${row.s.A} · fates ${fl} · chaseHits ${row.s.chaseHits} · ${row.min.toFixed(1)} game-min · ${real.toFixed(0)} s real`);
      for (const x of row.notes) if (/^(BUG|MISSING)/.test(x) || bugs.length || process.env.SH_VERBOSE === '1') console.log('     ' + (/^(BUG|MISSING)/.test(x) ? '! ' : '· ') + x);
      for (const x of row.info || []) console.log('     · ' + x);
      mark = { err: await ev(h, 'return SH.errors.length'), begin: await ev(h, 'return window.__chain.begins.length') };
      if (bugs.length || row.ok === false) { failed = `chapter ${n}`; break; }
    }
    // ---- 3. the ending → credits → fates → results → title -------------------------------------------------------
    if (!failed) {
      const want = WANT_ENDING[path];
      const last = timeline[timeline.length - 1];
      const st = await ev(h, `return { F: SH.S.F, A: SH.S.A, flags: { ...SH.S.flags }, endingFor: SH.mod.Game.endingFor(SH.S), mode: SH.mode, cs: Object.keys(SH.S.done).filter((k) => k.startsWith('cs:')).map((k) => k.slice(3)) }`);
      if (last.ending !== want) all.push(`BUG: the ending is ${last.ending}, want ${want} (F ${st.F} A ${st.A})`);
      if (st.endingFor !== want) all.push(`BUG: Game.endingFor(S) = ${st.endingFor}, want ${want}`);
      if (path === 'deal' && !st.flags.acceptedDeal) all.push('BUG: the deal path ended without acceptedDeal');
      if (path !== 'deal' && st.flags.acceptedDeal) all.push('BUG: acceptedDeal set on the ' + path + ' path');
      const e0 = await ev(h, 'return SH.errors.length');
      const pe = await playEnding(h, want, { since: 0 });
      for (const x of pe.notes) console.log('     · ' + x);
      for (const x of pe.notes) if (/^BUG/.test(x)) all.push('ending: ' + x);
      const evs = await chainEv(h);
      const started = new Set(evs.filter((e) => e.k === 'cs' && e.what === 'start').map((e) => e.id));
      for (const id of ENDING_CS[path].must) if (!started.has(id)) all.push(`BUG: the ${path} ending never ran ${id}`);
      for (const id of ENDING_CS[path].never) if (started.has(id)) all.push(`BUG: the ${path} ending ran ${id}`);
      const meta = await ev(h, 'return { seen: SH.mod.META.endingsSeen, results: (SH.mod.META.results || []).map((r) => r.ending), mode: SH.mode, items: SH.mod.Menus._top && SH.mod.Menus._top.st.list ? SH.mod.Menus._top.st.list.items.map((x) => x.label) : null }');
      console.log(`ending ${want}: scenes ${[...started].filter((id) => /^E-|^8-2A/.test(id)).join(' ')} · META.endingsSeen ${JSON.stringify(meta.seen)} · title menu ${JSON.stringify(meta.items)}`);
      if (meta.mode !== 'title') all.push(`BUG: not back at the title after the ending (${meta.mode})`);
      if (!meta.seen.includes(want)) all.push(`BUG: META.endingsSeen lacks ${want}`);
      if (!meta.items || !meta.items.includes('EXTRA')) all.push('BUG: EXTRA is not on the title menu');
      const errs = await ev(h, `return SH.errors.slice(${e0})`);
      for (const e of errs) all.push('ending error: ' + e);
      // EXTRA lists the ending
      await ev(h, "SH.nav('any'); return 1"); await advance(h, 0.5);
      await ev(h, "SH.menu('extra', {}); return 1");
      if (await advanceUntil(h, menuReady('extra'), 10, { step: 0.2 })) {
        const txt = await ev(h, 'const t = SH.mod.Menus._top; return t.st.panel ? t.st.panel.innerText : t.el ? t.el.innerText : ""');
        const NAMES = { connected: 'CONNECTED', coverage: 'OUT OF COVERAGE', tomorrow: 'FOLLOW UP TOMORROW' };
        if (!String(txt).toUpperCase().includes(NAMES[want])) all.push(`BUG: EXTRA does not list ${NAMES[want]}`);
        await ev(h, 'SH.mod.Menus.close(); return 1');
        await advance(h, 1);
      } else all.push('BUG: EXTRA would not open');
      await mustReach(h, menuReady('title'), 20, 'the title after EXTRA', { step: 0.25 });
      // ---- 4. §14 saves -------------------------------------------------------------------------------------------
      const sn = [];
      if (from === 0 && !fromAuto) {
        try { await checkPayphoneLoads(h, sn); } catch (e) { sn.push('BUG: payphone load check threw: ' + (e.stack || e.message)); }
        try { await checkAutosaves(h, sn, handoffs); } catch (e) { sn.push('BUG: autosave check threw: ' + (e.stack || e.message)); }
      }
      for (const x of sn) console.log('     · ' + x);
      for (const x of sn) if (/^BUG/.test(x)) all.push(x);
    }
  } catch (e) {
    failed = failed || 'exception';
    all.push('THREW: ' + (e.stack || e.message));
    try { console.log('   state:', JSON.stringify(await ev(h, 'return SH.state()'))); } catch (e2) { /* page gone */ }
    try { await h.shot(`.build/chain_fail_${path}.png`); } catch (e2) { /* no page */ }
  }

  // ---- 5. the timeline --------------------------------------------------------------------------------------------
  const TITLES = ['Prologue: No Service', '1 The Plaza', '2 Hilltop Village', '3 The Exchange', '4 Customer Care', '5 Level 4', '6 The Middle', '7 District Hospital', '8 The Mast'];
  const TARGET = [6, 14, 12, 14, 12, 12, 8, 12, 10];
  console.log(`\nTIMELINE ${tag}  (game-min = S.stats.time in play; walk = distance teleported ÷ 1.6 m/s (walking; ÷ 3.5 running); est = game + walk + 20 s per document read)`);
  console.log('  ch  chapter                 target  game-min  walk-min  est-min  cs played/skipped  docs   F   A  chaseHits  fates');
  let totG = 0, totE = 0, totR = 0;
  for (const r of timeline) {
    const walk = (r.tp || 0) / 1.6 / 60, est = r.min + walk + (r.docs || 0) * 20 / 60;
    totG += r.min; totE += est; totR += r.min + (r.tp || 0) / 3.5 / 60 + (r.docs || 0) * 20 / 60;
    const fl = FATES.filter((k) => r.s.flags[k]).map((k) => k.replace('Saved', '')).join(',') || '-';
    console.log(`  ${String(r.n).padStart(2)}  ${TITLES[r.n].padEnd(22)}  ${String(TARGET[r.n]).padStart(5)}  ${r.min.toFixed(1).padStart(8)}  ${walk.toFixed(1).padStart(8)}  ${est.toFixed(1).padStart(7)}  ${(`${(r.cs.played / 60).toFixed(1)}m/${r.cs.skipped}`).padStart(17)}  ${String(r.docs).padStart(4)}  ${String(r.s.F).padStart(3)} ${String(r.s.A).padStart(3)}  ${String(r.s.chaseHits).padStart(9)}  ${fl}`);
  }
  console.log(`  total: ${totG.toFixed(1)} game-min measured; a first playthrough ≈ ${totR.toFixed(0)}–${totE.toFixed(0)} min (running … walking the skipped distance; spec §14 target 60–120); ${((Date.now() - T0) / 60000).toFixed(1)} min real`);

  const ok = !failed && !all.length;
  for (const b of all) console.log('  ! ' + b);
  report(`chain ${tag}`, ok, failed ? `stopped at ${failed}` : `ending ${WANT_ENDING[path]}`);
  return ok;
}
