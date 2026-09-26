// tools/tests/stickers.mjs — the twelve Ollie stickers (CONTENT_PLAN §8, spec §12 "Yes"): every one can be picked up in
// the room it lives in, as a player would (standing on a floor beside it, facing it, E), it lands in S.stickers and in
// META.stickers (they persist across playthroughs), and with all twelve in META a second playthrough's Game.endingFor is
// 'yes' — the ending the transmitter-room door opens onto.
//
//   node tools/build.mjs --out .build/st.html && node tools/run.mjs --file .build/st.html --size 640x360 --script tools/tests/stickers.mjs
//
// Per sticker: SH.chapter(n) (the chapter's debugState: the room is as a player finds it that chapter), SH.goto(room), the
// sticker's interactable (World.interactables, kind 'sticker'), then the spots 0.45–0.95 m around it on a floor layer he can
// stand on at its height (World.pointFree, Kit.floorLayers): he is placed there facing it, World.nearestInteractable must
// pick the sticker (the E press would), and E must take it. Reports the spot used, or why none worked.
import { ev, advance, advanceUntil, report } from './lib.mjs';

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

export default async function (page, h) {
  const t0 = Date.now();
  const bad = [];
  await ev(h, 'localStorage.clear(); SH.mod.META.stickers = {}; return 1');
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
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id} in ${room} (chapter ${n})${r.ok ? ` — from (${r.spot.px}, ${r.spot.pz}) on the floor at y ${r.spot.fy}, facing ${r.spot.yaw}°` : ' — ' + r.why}`);
    if (!r.ok) bad.push(`${id} (${room}): ${r.why}`);
  }
  const all = await ev(h, 'return Object.keys(SH.mod.META.stickers || {}).filter((k) => /^sticker\\d\\d$/.test(k)).sort()');
  console.log(`META.stickers: ${all.length} — ${all.join(' ')}`);
  if (all.length !== 12) bad.push(`META.stickers holds ${all.length} of 12`);
  // a second playthrough with all twelve: the Yes ending (spec §4: checked when the transmitter-room door opens)
  const yes = await ev(h, `SH.mod.META.results = [{ ending: 'connected', date: Date.now(), playthrough: 1 }]; await SH.newGame({ skipIntro: true }); await SH.chapter(8);
    return { pt: SH.S.playthrough, ending: SH.mod.Game.endingFor(SH.S) };`);
  console.log(`second playthrough: S.playthrough ${yes.pt}, Game.endingFor → ${yes.ending}`);
  if (yes.pt < 2 || yes.ending !== 'yes') bad.push(`with all twelve stickers a second playthrough ends '${yes.ending}' (playthrough ${yes.pt})`);
  const errs = await ev(h, 'return SH.errors.slice()');
  for (const e of errs) bad.push('error: ' + e);
  for (const b of bad) console.log('  ! ' + b);
  report('stickers', !bad.length, `${all.length}/12 collected, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
