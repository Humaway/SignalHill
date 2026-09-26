// tools/tests/title.mjs — spec §2A "Title screen" steps 1–5, measured at NORMAL SPEED (the real requestAnimationFrame
// loop, not SH.advance) from a fresh page load, with a screenshot of every step.
//
//   node tools/build.mjs --out .build/title.html
//   node tools/run.mjs --file .build/title.html --size 1280x720 --quiet --script tools/tests/title.mjs
//   env: SH_SHOTS  screenshot directory (default .build/title)     TITLE_IDLE=0  skip the 60 s attract wait (part 1)
//
// 1. TIMING. A probe installed before the page's own scripts (page.addInitScript) wraps the title screen's update and logs
//    every frame: the menu clock (st.t — the one the title's fades run on), the wall clock, the stage, the opacities of
//    the black cover, "SIGNAL HILL", "PRESS ANY KEY" and the menu, whether the static hiss and the phone ring are
//    playing, and the audio clock. The 3D view is not drawn in this pass (renderer.render is a no-op) so the headless
//    browser runs its frames at a desktop's pace — a SwiftShader frame would otherwise take 0.1–0.3 s and the game
//    clamps a frame to 0.05 s, which slows every fade — and the wall clock can be compared with the spec:
//      1. 3 s of black with the static hiss;
//      2. the Lookout vista fades up (the cover clears);
//      3. "SIGNAL HILL" fades in; "PRESS ANY KEY" 2 s after it is in;
//      4. a real key (Enter): the distant phone that has been ringing the whole time stops MID-RING — inside one of its
//         two bursts (the cadence: 0–0.4 s and 0.6–1.0 s of every 3 s) — and the menu fades in (NEW GAME, LOAD GAME,
//         OPTIONS; EXTRA only after an ending);
//      5. 60 idle seconds → the attract sequence (silent shots of c1_relay, c2_crescent, c3_hall, c5_atrium, no text),
//         then back to the title.
// 2. SCREENSHOTS (the 3D view drawn): each step above, the menu, EXTRA in the menu after an ending (META.endingsSeen set,
//    as Save.recordEnding leaves it) and the EXTRA screen, and each attract shot.
// Prints the timeline and `PASS title`.
import fs from 'node:fs';
import { ev, report } from './lib.mjs';

const OUT = process.env.SH_SHOTS || '.build/title';

// the probe: runs in the page before any of its scripts (every load)
function probe() {
  const L = window.__tt = { s: [], key: null, stops: [], rooms: [] };
  const noRender = localStorage.getItem('__tt_norender') === '1';
  const iv = setInterval(() => {
    const M = window.SH && window.SH.mod;
    if (!M || !M.Menus || !M.Menus.SCREENS || !M.Menus.SCREENS.title) return;
    clearInterval(iv);
    if (noRender) { const w = setInterval(() => { if (M.Render && M.Render.renderer) { M.Render.renderer.render = () => {}; clearInterval(w); } }, 2); }
    const T = M.Menus.SCREENS.title, up = T.update;
    const op = (e) => (e ? +(+getComputedStyle(e).opacity).toFixed(3) : null);
    let lastRing = null;
    T.update = function (sc) {
      const st = sc.st, ring0 = st.ring;
      const r = up.apply(this, arguments);
      const ctx = M.Snd.ctx, a = ctx ? ctx.currentTime : null;
      if (ring0 && !st.ring) L.stops.push({ t: st.t, wall: performance.now() / 1000, audio: a, t0: ring0.t0, phase: ring0.t0 != null && a != null ? (((a - ring0.t0) % 3) + 3) % 3 : null });
      if (st.ring) lastRing = st.ring;
      let room = null; M.Render.scene.children.forEach((c) => { if (/^room:/.test(c.name)) room = c.name.slice(5); });
      L.s.push({ t: st.t, wall: performance.now() / 1000, stage: st.stage, cover: op(st.cover), name: op(st.name), press: op(st.press), menu: op(st.menuBox),
        ring: !!(st.ring && st.ring.playing), hiss: !!st.hiss, attract: !!st.attract, idle: st.idle, audio: a, room, items: st.list ? st.list.items.map((x) => x.label).join('/') : '' });
      return r;
    };
    window.addEventListener('keydown', () => { if (!L.key) { const st = M.Menus._top && M.Menus._top.st; L.key = { wall: performance.now() / 1000, t: st ? st.t : null, audio: M.Snd.ctx ? M.Snd.ctx.currentTime : null, ringT0: st && st.ring ? st.ring.t0 : null }; } }, true);
    void lastRing;
  }, 1);
}

const f2 = (v) => (v == null ? '-' : Number(v).toFixed(2));

export default async function (page, h) {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const notes = [];
  const bad = (m) => notes.push('BUG: ' + m);
  await page.addInitScript(probe);
  const reload = async (noRender) => {
    await page.evaluate((v) => { localStorage.setItem('__tt_norender', v ? '1' : '0'); }, noRender);
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.ready === true && window.__tt, null, { timeout: 60000 });
  };
  const title = () => ev(h, "const t = SH.mod.Menus._top; return t && SH.mod.Menus.current === 'title' ? { t: t.st.t, stage: t.st.stage, attract: !!t.st.attract } : null");
  const waitTitle = async (pred, maxSec = 120) => {
    const end = Date.now() + maxSec * 1000;
    for (;;) { const s = await title(); if (s && pred(s)) return s; if (Date.now() > end) return s; await h.wait(0.05); }
  };

  // ---- 1. timing at normal speed ---------------------------------------------------------------------------------------
  await ev(h, 'localStorage.removeItem("signalhill.meta"); return 1');            // a first-time player: no endings yet
  await reload(true);
  await waitTitle((s) => s.stage === 'press', 40);
  await h.wait(1.3);                                                        // … PRESS ANY KEY has been up a moment
  await page.keyboard.press('Enter');
  await h.wait(3.5);
  let L = await ev(h, 'return window.__tt');
  const S = L.s;
  const first = S[0], at = (pred) => S.find(pred);
  const span = S[S.length - 1].wall - first.wall, fps = S.length > 20 ? (S.length - 1) / span : 0;
  const slow = S.filter((s, i) => i && s.wall - S[i - 1].wall > 0.05).length;
  notes.push(`normal-speed pass: ${S.length} frames in ${span.toFixed(1)} s wall (${fps.toFixed(0)} fps, the 3D view not drawn); ${slow} frame(s) longer than 50 ms (the game clamps a frame to 50 ms, so the menu clock ran ${f2(span - (S[S.length - 1].t - first.t))} s behind the wall clock — on a machine holding 60 fps they are the same clock)`);
  if (first.t > 0.2) bad(`the probe caught the title late (menu clock ${first.t.toFixed(2)} s)`);
  // (times below: the menu clock st.t — game time, what the title's fades run on — with the wall clock in brackets)
  const tFade = at((s) => s.stage !== 'black'), tVista = at((s) => s.stage !== 'black' && s.cover <= 0.02);
  const tName = at((s) => s.name > 0.005), tNameIn = at((s) => s.name >= 0.995), tPress = at((s) => s.press > 0.005), tPressIn = at((s) => s.press >= 0.995);
  const hissBlack = S.filter((s) => s.stage === 'black'), hissOn = hissBlack.filter((s) => s.hiss).length / Math.max(1, hissBlack.length);
  const ringBefore = S.filter((s) => L.key && s.wall < L.key.wall && s.t > 0.5);
  const ringOn = ringBefore.filter((s) => s.ring).length / Math.max(1, ringBefore.length);
  const w = (s) => (s ? s.wall - first.wall : null), tm = (s) => (s ? `${f2(s.t)} s (${f2(w(s))} wall)` : '-');
  notes.push(`1. black + static: 0 → ${tm(tFade)}; the static hiss plays for ${(hissOn * 100).toFixed(0)}% of it; the distant phone rings from ${tm(at((s) => s.ring))}`);
  notes.push(`2. the Lookout vista fades up: ${tm(tFade)} → ${tm(tVista)}`);
  notes.push(`3. SIGNAL HILL fades in: ${tm(tName)} → ${tm(tNameIn)}; PRESS ANY KEY: ${tm(tPress)} → ${tm(tPressIn)} — ${f2(tPress && tNameIn ? tPress.t - tNameIn.t : null)} s after the name is in`);
  if (!(tFade && Math.abs(tFade.t - 3) <= 0.1)) bad(`the black lasts ${f2(tFade && tFade.t)} s (spec: 3 s)`);
  if (!(hissOn > 0.9)) bad('no static hiss during the black');
  if (!(tVista && tVista.t - tFade.t <= 4)) bad('the vista does not fade up within 4 s of the black');
  if (!(tPress && tNameIn && Math.abs(tPress.t - tNameIn.t - 2) <= 0.2)) bad('"PRESS ANY KEY" is not 2 s after "SIGNAL HILL"');
  if (!(ringOn > 0.95)) bad(`the phone is not ringing the whole time before the key (${(ringOn * 100).toFixed(0)}% of the frames)`);
  // 4. the key: the ring stops mid-ring, the menu fades in
  const stop = L.stops[0], key = L.key;
  const kPhase = key && key.ringT0 != null ? (((key.audio - key.ringT0) % 3) + 3) % 3 : null;
  const inBurst = (p) => p != null && ((p >= 0.05 && p <= 0.38) || (p >= 0.65 && p <= 0.98));
  const tMenu = at((s) => key && s.wall >= key.wall && s.menu > 0.02), tMenuIn = at((s) => key && s.wall >= key.wall && s.menu >= 0.98);
  notes.push(`4. a key (Enter) at ${f2(key && key.t)} s, the ring ${f2(kPhase)} s into its 3 s cycle (bursts at 0–0.4 and 0.6–1.0): it stops ${f2(stop && key ? stop.audio - key.audio : null)} s later, ${f2(stop && stop.phase)} s into the cycle — ${inBurst(stop && stop.phase) ? 'inside a burst: mid-ring' : 'NOT inside a burst'}; the menu fades in ${f2(tMenu && key ? tMenu.t - key.t : null)} → ${f2(tMenuIn && key ? tMenuIn.t - key.t : null)} s after the key: ${tMenuIn ? tMenuIn.items.replace(/\//g, ' / ') : '-'}`);
  if (!stop) bad('the ring never stopped after the key');
  else {
    if (!inBurst(stop.phase)) bad(`the ring did not stop mid-ring (phase ${f2(stop.phase)})`);
    if (stop.audio - key.audio > 2.5) bad('the ring stopped more than 2.5 s after the key');
  }
  if (!tMenuIn || tMenuIn.t - key.t > 1.2) bad('the menu did not fade in within 1.2 s of the key');
  if (tMenuIn && tMenuIn.items !== 'NEW GAME/LOAD GAME/OPTIONS') bad(`title menu ${tMenuIn.items} (a first-time player: NEW GAME / LOAD GAME / OPTIONS)`);
  const after = S.filter((s) => key && s.wall > key.wall + 2.6);
  if (after.some((s) => s.ring)) bad('the phone rings again after the key');
  // 5. 60 idle seconds → the attract, then back
  if (process.env.TITLE_IDLE !== '0') {
    const st = await waitTitle((s) => s.attract, 80);
    const back = await waitTitle((s) => !s.attract && s.stage === 'menu', 120);
    L = await ev(h, 'return window.__tt');
    const A = L.s.filter((s) => key && s.wall > key.wall), aStart = A.find((s) => s.attract), aEnd = [...A].reverse().find((s) => s.attract);
    const lastActive = [...A].reverse().find((s) => aStart && s.wall < aStart.wall && s.idle < 0.1);
    const rooms = []; for (const s of A) if (s.attract && s.room && rooms[rooms.length - 1] !== s.room) rooms.push(s.room);
    const shotRooms = rooms.filter((r) => r !== 't_title');
    // text: once the title's words have faded out (1.2 s) until the attract hands back
    const text = A.filter((s) => aStart && s.attract && s.t > aStart.t + 1.3 && Math.max(s.name, s.press, s.menu) > 0.02);
    notes.push(`5. idle: the attract starts at ${f2(aStart && aStart.idle)} s idle (${f2(aStart && lastActive ? aStart.t - lastActive.t : null)} s of menu clock after the last input); shots: ${shotRooms.join(', ')}; ${f2(aStart && aEnd ? aEnd.t - aStart.t : null)} s long; the title's text during the shots: ${text.length ? 'YES' : 'none'}; back to the title menu: ${back && !back.attract ? 'yes' : 'no'}`);
    if (!st || !st.attract || !aStart) bad('no attract sequence after 60 idle seconds');
    else if (!(aStart.idle >= 59.95 && aStart.idle <= 60.2)) bad(`the attract started after ${aStart.idle} s idle`);
    for (const r of ['c1_relay', 'c2_crescent', 'c3_hall', 'c5_atrium']) if (!shotRooms.includes(r)) bad(`the attract never showed ${r}`);
    if (text.length) bad(`text on screen during the attract shots (${JSON.stringify(text[0])})`);
    if (!back || back.attract) bad('the attract did not return to the title');
  }

  // ---- 2. screenshots (the 3D view drawn; the menu clock stepped with SH.advance, a frame drawn for each) --------------
  await reload(false);
  const step = (pred, maxSec = 120) => ev(h, `const top = () => SH.mod.Menus._top; for (let i = 0; i < ${maxSec * 10}; i++) { const t = top(); if (t && SH.mod.Menus.current === 'title' && (${pred})(t.st)) break; await SH.advance(0.1); } SH.mod.Render.render(0); return 1`);
  const shotAt = async (name, pred, maxSec) => { await step(pred, maxSec); await h.shot(`${OUT}/${name}.png`); };
  await shotAt('1_black_static', '(st) => st.t >= 1.5');
  await shotAt('2_vista_fading_up', '(st) => st.t >= 5.0');
  await shotAt('3_signal_hill', '(st) => st.t >= 9.2');
  await shotAt('3b_press_any_key', "(st) => st.stage === 'press' && st.t >= 12.4");
  await page.keyboard.press('Enter');
  await ev(h, 'await SH.advance(0.2); return 1');
  await shotAt('4_menu', "(st) => st.stage === 'menu' && !st.menuF.busy");
  // after an ending: EXTRA (what Save.recordEnding leaves in META), on the title the game comes back to
  await ev(h, "const M = SH.mod; window.__oldTop = M.Menus._top; M.META.endingsSeen = ['connected']; M.META.results = [{ ending: 'connected', name: 'CONNECTED', rank: 10, time: 5400 }]; M.META.completed = true; localStorage.setItem('signalhill.meta', JSON.stringify(M.META)); M.Game.goTitle(); return 1");
  await ev(h, "for (let i = 0; i < 300 && !(SH.mod.Menus._top && SH.mod.Menus._top !== window.__oldTop && SH.mod.Menus.current === 'title'); i++) await SH.advance(0.1); return 1");
  await step("(st) => st.stage === 'press'");
  await page.keyboard.press('Enter');
  await ev(h, 'await SH.advance(0.2); return 1');
  await step("(st) => st.stage === 'menu' && !st.menuF.busy");
  const items = await ev(h, "return SH.mod.Menus._top.st.list.items.map((x) => x.label)");
  await h.shot(`${OUT}/4b_menu_with_extra.png`);
  notes.push(`after an ending the title menu reads ${items.join(' / ')}`);
  if (JSON.stringify(items) !== JSON.stringify(['NEW GAME', 'LOAD GAME', 'OPTIONS', 'EXTRA'])) bad(`title menu after an ending: ${items.join(' / ')}`);
  await ev(h, "const L = SH.mod.Menus._top.st.list; L.select(L.items.findIndex((x) => x.label === 'EXTRA')); await SH.advance(0.2); return 1");
  await page.keyboard.press('Enter');
  const ex = await ev(h, "for (let i = 0; i < 60 && !(SH.mod.Menus.current === 'extra' && SH.mod.Menus._top.ready); i++) await SH.advance(0.1); await SH.advance(0.5); SH.mod.Render.render(0); return SH.mod.Menus.current === 'extra'");
  await h.shot(`${OUT}/4c_extra.png`);
  if (!ex) bad('EXTRA did not open from the title menu');
  await page.keyboard.press('Escape');
  await ev(h, 'await SH.advance(1); return 1');
  await step("(st) => st.stage === 'menu' && !st.menuF.busy");
  // the attract shots (the idle clock set to 59.5 s: part 1 measured the minute)
  await ev(h, 'SH.mod.Menus._top.st.idle = 59.5; return 1');
  const shots = [];
  for (let i = 0; i < 200; i++) {
    const r = await ev(h, "await SH.advance(0.5); const t = SH.mod.Menus._top; let room = null; SH.mod.Render.scene.children.forEach((c) => { if (/^room:/.test(c.name)) room = c.name.slice(5); }); return { attract: !!(t && SH.mod.Menus.current === 'title' && t.st.attract), room }");
    if (!r.attract && shots.length) break;
    if (r.attract && r.room && r.room !== 't_title' && !shots.includes(r.room)) {
      shots.push(r.room);
      await ev(h, 'await SH.advance(3.5); SH.mod.Render.render(0); return 1');
      await h.shot(`${OUT}/5_attract_${shots.length}_${r.room}.png`);
    }
  }
  await step("(st) => !st.attract && st.stage === 'menu' && !st.menuF.busy", 60);
  await h.shot(`${OUT}/5z_back_to_title.png`);
  notes.push(`screenshots: ${OUT}/ (1 black, 2 vista, 3 SIGNAL HILL, 3b PRESS ANY KEY, 4 menu, 4b menu with EXTRA, 4c EXTRA, 5 attract: ${shots.join(', ')}, 5z back)`);
  await ev(h, 'localStorage.removeItem("__tt_norender"); return 1');
  for (const x of notes) console.log('  ' + x);
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); bad('page errors'); }
  report('title (§2A steps 1–5 at normal speed)', !notes.some((x) => x.startsWith('BUG')), `${OUT}, ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
