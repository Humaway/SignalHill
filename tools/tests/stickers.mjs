// tools/tests/stickers.mjs — the twelve Ollie stickers (CONTENT_PLAN §8, spec §4 "Yes", §12 "Ending: Yes"): each one is
// placed exactly once in the game data, every one can be picked up in the room it lives in, as a player would (standing
// on a floor beside it, facing it, E), it lands in S.stickers and in META.stickers (they persist across playthroughs);
// with all twelve, the FIRST playthrough still ends as its F / A say (Yes needs a second playthrough); that playthrough
// ends (Connected, skipped through to the title); the title's EXTRA → NEW GAME+ → BEGIN NEW GAME+ starts playthrough 2
// with the stickers and the steel bar; in Chapter 8 the hut door on the mast's top landing (8-1 first) opens onto E-YES:
// the party, the lines, credits over the hold music, no fate cards, the results "YES", the title — under a minute of
// scene before the credits.
//
//   node tools/build.mjs --out .build/st.html && node tools/run.mjs --file .build/st.html --size 640x360 --script tools/tests/stickers.mjs
//
// Per sticker: SH.chapter(n) (the chapter's debugState: the room is as a player finds it that chapter), SH.goto(room), the
// sticker's interactable (World.interactables, kind 'sticker'), then the spots 0.45–0.95 m around it on a floor layer he can
// stand on at its height (World.pointFree, Kit.floorLayers): he is placed there facing it, World.nearestInteractable must
// pick the sticker (the E press would), and E must take it (it is then gone from the room). Reports the spot used, or why
// none worked.
import fs from 'node:fs';
import { ev, advance, advanceUntil, mustReach, report, titleMenu, menuPick, menuReady, nav } from './lib.mjs';
import { spy, playEnding } from './endings.mjs';

export const STICKERS = [
  ['sticker01', 'p4_busshelter', 0], ['sticker02', 'c1_store', 1], ['sticker03', 'c1_security', 1], ['sticker04', 'c2_hall', 2],
  ['sticker05', 'c3_hall', 3], ['sticker06', 'c3_canteen', 3], ['sticker07', 'c4_park', 4], ['sticker08', 'c5_forecourt', 5],
  ['sticker09', 'c6_lukaoffice', 6], ['sticker10', 'c7_waiting', 7], ['sticker11', 'c8_summit', 8], ['sticker12', 'c8_mast', 8],
];

// pick one sticker up in the current room → { ok, why, spot }
export async function takeSticker(h, id) {
  const found = await ev(h, `const M = SH.mod, it = (M.World.build ? M.World.build.interactables : []).find((i) => i.kind === 'sticker' && String(i.id).includes(${JSON.stringify(id)}));
    if (!it) return { why: 'no sticker interactable in ' + M.World.room };
    return { pos: [it.pos.x, it.pos.y, it.pos.z], active: M.World.interactables.includes(it), world: it.world || 'both', r: it.r };`);
  if (!found.pos) return { ok: false, why: found.why };
  if (!found.active) return { ok: false, why: `the sticker is not active here (world ${found.world}, outage ${await ev(h, 'return !!SH.S.outage')})` };
  const tried = [];
  for (const rr of [0.55, 0.75, 0.45, 0.95]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const spot = await ev(h, `const M = SH.mod, [x, y, z] = ${JSON.stringify(found.pos)}, px = x + Math.sin(${a}) * ${rr}, pz = z + Math.cos(${a}) * ${rr};
        if (!M.World.pointFree(px, pz, 0.28)) return null;
        // a floor layer at his feet from which the sticker is within reach (≤ 1 m below, ≤ 2.6 m above)
        const ys = M.Kit.floorLayers(M.World.build.floors, px, pz, !!SH.S.outage).filter((fy) => y - fy <= 2.6 && y - fy >= -1.0);
        if (!ys.length) return null;
        const fy = ys.sort((p, q) => Math.abs((y - p) - 0.6) - Math.abs((y - q) - 0.6))[0];
        const yaw = Math.atan2(x - px, z - pz) * 180 / Math.PI;
        M.Player.place(px, pz, yaw, { y: fy }); try { M.Cam.snap(); } catch (e) {}
        const n = M.World.nearestInteractable(M.Player.pos, M.Player.yaw, 3, { use: true });
        return { px: +px.toFixed(2), pz: +pz.toFixed(2), fy: +fy.toFixed(2), yaw: +yaw.toFixed(0), pick: n ? n.id : null, kind: n ? n.kind : null };`);
      if (!spot) continue;
      if (!String(spot.pick || '').includes(id)) { tried.push(`${spot.px},${spot.pz}→${spot.pick}`); continue; }
      // (Player re-picks its E target every 0.1 s: let it see the sticker from the new spot)
      await advance(h, 0.4);
      await ev(h, "SH.press('interact'); return 1");
      await advanceUntil(h, `!!(SH.S.stickers || {})[${JSON.stringify(id)}] && !SH.mod.Script.busy`, 6, { step: 0.1 });
      const got = await ev(h, `return { s: !!(SH.S.stickers || {})[${JSON.stringify(id)}], m: !!((SH.mod.META.stickers || {})[${JSON.stringify(id)}]) }`);
      if (got.s && got.m) return { ok: true, spot };
      const st = await ev(h, 'const M = SH.mod; return { busy: M.Script.busy, list: M.Script.list().map((c) => c.name), ctl: M.Player.control, locked: M.Player.locked, pmode: M.Player.mode, mode: SH.mode, menu: M.Menus.current, pos: [+M.Player.pos.x.toFixed(2), +M.Player.pos.y.toFixed(2), +M.Player.pos.z.toFixed(2)] }');
      return { ok: false, why: `E at ${JSON.stringify(spot)} did not take it (S ${got.s}, META ${got.m}; ${JSON.stringify(st)})` };
    }
  }
  return { ok: false, why: `no spot beside it where E picks it (${tried.length ? 'E picks instead: ' + tried.slice(0, 4).join('; ') : 'no free floor within reach'})` };
}

// every K.sticker('<id>', …) in src/data (the test room's own excepted) → { id: [files] }
function placedInData() {
  const dir = new URL('../../src/data/', import.meta.url);
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('99_')).sort()) {
    const txt = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of txt.matchAll(/K\.sticker\(\s*['"]([^'"]+)['"]/g)) (out[m[1]] = out[m[1]] || []).push(f);
  }
  return out;
}

export default async function (page, h) {
  const t0 = Date.now();
  const bad = [];
  const say = (m) => console.log('  · ' + m);
  // ---- 0. the game data: sticker01 … sticker12, each placed exactly once, nothing else called a sticker ----------------
  const placed = placedInData();
  const ids = STICKERS.map(([id]) => id);
  const gameIds = await ev(h, 'return SH.mod.Game.STICKERS.slice()');
  if (JSON.stringify(gameIds) !== JSON.stringify(ids)) bad.push(`Game.STICKERS is ${JSON.stringify(gameIds)}`);
  for (const id of ids) if ((placed[id] || []).length !== 1) bad.push(`${id} is placed ${(placed[id] || []).length} times in src/data (${(placed[id] || []).join(', ') || 'nowhere'})`);
  for (const id of Object.keys(placed)) if (!ids.includes(id)) bad.push(`an unknown sticker "${id}" in ${placed[id].join(', ')}`);
  say(`src/data places ${Object.keys(placed).length} stickers: ${ids.map((id) => `${id} ${(placed[id] || ['-'])[0].replace(/\.js$/, '')}`).join(' · ')}`);

  // ---- 1. playthrough 1: every sticker picked up in its room -----------------------------------------------------------
  await ev(h, 'localStorage.clear(); const M = SH.mod.META; M.stickers = {}; M.results = []; M.endingsSeen = []; M.completed = false; return 1');
  await spy(h);
  await ev(h, 'await SH.newGame({ skipIntro: true }); return 1');
  await advance(h, 1);
  let ch = -1;
  for (const [id, room, n] of STICKERS) {
    if (n !== ch) { await ev(h, `await SH.chapter(${n}); return 1`); await advance(h, 1); ch = n; }
    await ev(h, `await SH.goto(${JSON.stringify(room)}, null); return 1`);
    await advanceUntil(h, `SH.mod.World.room === ${JSON.stringify(room)} && !SH.mod.World.transitioning`, 15);
    // (scenes a room starts on entering: out of the way)
    await advanceUntil(h, '!SH.mod.Script.busy', 20, { each: 'if (SH.mod.Script.skippable) SH.skip(); if (SH.mod.Script.choosing) SH.choose(0);' });
    await ev(h, 'SH.mod.Menus.isOpen() && SH.mod.Menus.close(); return 1');
    const r = await takeSticker(h, id);
    // (taken: gone from the room — the interactable and the sticker itself)
    if (r.ok) {
      const gone = await ev(h, `const M = SH.mod, id = ${JSON.stringify(id)}, it = M.World.interactables.find((i) => i.kind === 'sticker' && String(i.id).includes(id));
        let vis = false; M.Render.scene.traverse((o) => { if (o.name === 'sticker:' + id && o.visible && o.parent) vis = true; }); return { it: !!it, vis };`);
      if (gone.it || gone.vis) { r.ok = false; r.why = `taken, but still in the room (interactable ${gone.it}, visible ${gone.vis})`; }
    }
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id} in ${room} (chapter ${n})${r.ok ? ` — from (${r.spot.px}, ${r.spot.pz}) on the floor at y ${r.spot.fy}, facing ${r.spot.yaw}°` : ' — ' + r.why}`);
    if (!r.ok) bad.push(`${id} (${room}): ${r.why}`);
  }
  const all = await ev(h, 'return Object.keys(SH.mod.META.stickers || {}).filter((k) => /^sticker\\d\\d$/.test(k)).sort()');
  console.log(`META.stickers: ${all.length} — ${all.join(' ')}`);
  if (all.length !== 12) bad.push(`META.stickers holds ${all.length} of 12`);
  // (META persists: what is on disk has them too)
  const disk = await ev(h, `let m = null; try { m = JSON.parse(localStorage.getItem('signalhill.meta') || 'null'); } catch (e) {} return m && m.stickers ? Object.keys(m.stickers).filter((k) => /^sticker\\d\\d$/.test(k)).length : null`);
  say(`META on disk (signalhill.meta): ${disk === null ? 'nothing' : disk + ' stickers'}`);
  if (disk !== 12) bad.push(`the saved META (localStorage signalhill.meta) holds ${disk === null ? 'no' : disk} stickers`);

  // ---- 2. still playthrough 1: the hut door does NOT open onto the party (Yes needs a second playthrough) -------------
  // (we are on the mast after sticker12: onto the top landing as if off the last ladder → 8-1 → the hut door)
  const p1 = await ev(h, 'return { pt: SH.S.playthrough, ending: SH.mod.Game.endingFor(SH.S), room: SH.mod.World.room }');
  say(`playthrough ${p1.pt} with all twelve: Game.endingFor → ${p1.ending}`);
  if (p1.pt !== 1 || p1.ending === 'yes') bad.push(`the first playthrough with all twelve stickers: playthrough ${p1.pt}, endingFor '${p1.ending}' (Yes needs a second playthrough)`);
  const hut = await hutDoor(h);
  say(`playthrough 1, the hut door: ${hut.line}`);
  if (hut.yes || hut.room !== 'c8_transmitter') bad.push(`playthrough 1: the hut door → ${hut.line} (want the transmitter room and the Pitch, no E-YES)`);

  // ---- 3. playthrough 1 ends (Connected, every scene skipped) → the title --------------------------------------------
  await ev(h, 'await SH.newGame({ skipIntro: true }); await SH.chapter(8); return 1');
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning", 30, 'Chapter 8 loaded');
  await advance(h, 8);
  await ev(h, "await SH.goto('c8_transmitter', 'door'); return 1");
  await mustReach(h, "SH.mod.World.room === 'c8_transmitter' && !SH.mod.World.transitioning", 20, 'the transmitter room');
  await advance(h, 1);
  const pre = await ev(h, "return SH.preset('connected')");
  if (pre !== 'connected') bad.push(`playthrough 1: the Connected preset gives endingFor '${pre}'`);
  await ev(h, "SH.ending('connected'); return 1");
  await advance(h, 0.2);
  const e1 = await playEnding(h, 'connected', { skip: true });
  for (const x of e1.notes) say(x);
  for (const x of e1.notes) if (/^BUG/.test(x)) bad.push('playthrough 1 ending: ' + x);
  const m1 = await ev(h, 'const M = SH.mod.META; return { results: (M.results || []).map((r) => r.ending + "@" + r.playthrough), seen: M.endingsSeen, completed: !!M.completed, stickers: Object.keys(M.stickers || {}).length }');
  say(`after playthrough 1: META ${JSON.stringify(m1)}`);
  if (m1.results.length !== 1 || m1.stickers !== 12) bad.push(`after playthrough 1: META ${JSON.stringify(m1)}`);

  // ---- 4. the title → EXTRA → NEW GAME+ → BEGIN NEW GAME+ (as a player) → playthrough 2 --------------------------------
  const items = await titleMenu(h, { wait: false });
  if (!items.includes('EXTRA')) bad.push(`no EXTRA on the title after an ending (${items.join(' / ')})`);
  await menuPick(h, 'EXTRA');
  await mustReach(h, menuReady('extra'), 10, 'EXTRA', { step: 0.1 });
  await menuPick(h, 'NEW GAME+');
  await mustReach(h, menuReady('newgame'), 10, 'the NEW GAME+ setup screen', { step: 0.1 });
  const go = await ev(h, 'return SH.mod.Menus._top.st.goIt.textContent.trim()');
  if (go !== 'BEGIN NEW GAME+') bad.push(`the NEW GAME+ setup screen says "${go}"`);
  for (let k = 0; k < 4 && (await ev(h, 'return SH.mod.Menus._top.st.row')) !== 2; k++) await nav(h, 'down', 0.15);
  await nav(h, 'confirm', 0.4);
  await mustReach(h, "(SH.mode === 'play' || SH.mode === 'cutscene') && !!SH.mod.World.room", 40, 'NEW GAME+ starting', { step: 0.2 });
  const ng = await ev(h, "return { pt: SH.S.playthrough, ngPlus: !!SH.S.ngPlus, bar: SH.S.inv.some((i) => i.id === 'steel_bar'), stickers: Object.keys(SH.S.stickers || {}).length, ch: SH.S.chapter, room: SH.mod.World.room, cs: SH.mod.Script.active }");
  say(`NEW GAME+: ${JSON.stringify(ng)}`);
  if (ng.pt !== 2 || !ng.ngPlus || !ng.bar || ng.stickers !== 12 || ng.ch !== 0) bad.push(`NEW GAME+ starts ${JSON.stringify(ng)} (want playthrough 2, the steel bar, 12 stickers, the Prologue)`);

  // ---- 5. playthrough 2, Chapter 8 (chapter select keeps the playthrough and NG+): the hut door → E-YES → the title ------
  await ev(h, 'await SH.chapter(8); return 1');
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning", 30, 'Chapter 8 loaded (playthrough 2)');
  await advance(h, 8);
  const p2 = await ev(h, 'return { pt: SH.S.playthrough, ngPlus: !!SH.S.ngPlus, ending: SH.mod.Game.endingFor(SH.S), stickers: Object.keys(SH.S.stickers || {}).length }');
  say(`Chapter 8 on playthrough ${p2.pt}${p2.ngPlus ? ' (NG+)' : ''}: ${p2.stickers} stickers, Game.endingFor → ${p2.ending}`);
  if (p2.pt < 2 || p2.ending !== 'yes') bad.push(`playthrough 2 with all twelve: endingFor '${p2.ending}' (playthrough ${p2.pt})`);
  const since = await ev(h, 'return window.__endLines.length');
  await ev(h, "await SH.goto('c8_mast', 'base'); return 1");
  await mustReach(h, "SH.mod.World.room === 'c8_mast' && !SH.mod.World.transitioning", 20, 'the mast (playthrough 2)');
  const e0 = await ev(h, 'return SH.errors.length');
  const hut2 = await hutDoor(h, { yes: true });
  say(`playthrough 2, the hut door: ${hut2.line}`);
  if (!hut2.yes || hut2.room !== 'c8_mast') bad.push(`playthrough 2: the hut door → ${hut2.line} (want E-YES from the hut door on the mast)`);
  if (hut2.yes) {
    const e2 = await playEnding(h, 'yes', { since });
    for (const x of e2.notes) say(x);
    for (const x of e2.notes) if (/^BUG/.test(x)) bad.push('the Yes ending: ' + x);
    // "Keep it under a minute": the scene from the door to the credits, and the credits
    const T = (m) => { const e = (e2.events || []).find((x) => x.k === 'mode' && x.v === m); return e ? e.T : null; };
    const tc = T('credits'), tr = T('results');
    say(`E-YES: ${tc === null ? '?' : (tc + hut2.lead).toFixed(1)} s from the door to the credits, credits ${tc === null || tr === null ? '?' : (tr - tc).toFixed(1)} s`);
    if (tc === null || tc + hut2.lead > 60) bad.push(`the Yes ending takes ${tc === null ? '?' : (tc + hut2.lead).toFixed(1)} s before the credits (spec: under a minute)`);
    const m2 = await ev(h, 'const M = SH.mod.META; return { results: (M.results || []).map((r) => r.ending + "@" + r.playthrough), seen: M.endingsSeen }');
    say(`after playthrough 2: META ${JSON.stringify(m2)}`);
    if (!m2.seen.includes('yes') || m2.results[m2.results.length - 1] !== 'yes@2') bad.push(`after the Yes ending: META ${JSON.stringify(m2)}`);
  }
  for (const e of await ev(h, `return SH.errors.slice(${e0})`)) bad.push('error (the Yes ending): ' + e);

  const errs = await ev(h, 'return SH.errors.slice()');
  for (const e of errs) if (!bad.includes('error (the Yes ending): ' + e)) bad.push('error: ' + e);
  for (const b of bad) console.log('  ! ' + b);
  report('stickers', !bad.length, `${all.length}/12 collected, the Yes ending on playthrough 2, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// on the mast: onto the top landing as if just off the last ladder (the landing's trigger starts 8-1, skipped), then
// whatever the hut door opens onto → { yes (E-YES started), room (where it started / where the door led), line, lead }
async function hutDoor(h, o = {}) {
  await ev(h, `const M = SH.mod;
    const ys = M.Kit.floorLayers(M.World.build.floors, -3.2, -0.6, !!SH.S.outage); const y = Math.max(...ys);
    M.Player.place(-3.2, -0.6, -90, { y }); try { M.Cam.snap(); } catch (e) {} return y;`);
  // 8-1 (skipped) → C8_enterHut: the Yes check at the door
  const ok = await advanceUntil(h, "SH.mod.Script.active === 'cs:E-YES' || SH.mod.World.room === 'c8_transmitter' || !!SH.S.done['cs:8-2'] || SH.mode === 'ending'", 90,
    { step: 0.1, each: "if (SH.mod.Script.active === 'cs:8-1' && SH.mod.Script.skippable && !SH.mod.Script.skipping) SH.skip();" });
  const st = await ev(h, "const M = SH.mod; return { active: M.Script.active, room: M.World.room, mode: SH.mode, done81: !!SH.S.done['cs:8-1'] }");
  const yes = st.active === 'cs:E-YES';
  if (!ok) return { yes: false, room: st.room, line: `nothing happened in 90 s: ${JSON.stringify(st)}`, lead: 0 };
  if (!yes) {
    // (not the party: let the door finish taking him through)
    await advanceUntil(h, "SH.mod.World.room === 'c8_transmitter' && !SH.mod.World.transitioning", 20, { step: 0.1 });
    const st2 = await ev(h, "return { room: SH.mod.World.room, active: SH.mod.Script.active, e: !!SH.S.done['cs:E-YES'] }");
    return { yes: !!st2.e, room: st2.room, line: `8-1 ${st.done81 ? 'done' : 'not done'} → ${st2.room} (${st2.active || 'no scene'})` };
  }
  // (caught within a 0.1 s step of E-YES starting: that much of it went by before playEnding's clock starts)
  return { yes, room: st.room, line: `8-1 ${st.done81 ? 'done' : 'not done'} → E-YES in ${st.room}`, lead: 0.1 };
}
