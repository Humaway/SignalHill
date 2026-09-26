// tools/tests/lib.mjs — shared helpers for the chapter test scripts (tools/tests/chN.mjs, chain.mjs).
// Every helper takes the harness handle `h` from tools/run.mjs ({ eval, shot, wait, key, log, page }).
// Predicates are JavaScript expression strings evaluated in the page (window.SH, SH.S, SH.mod.* are in scope), e.g.
//   await advanceUntil(h, "SH.S.chapter === 1 && SH.mod.World.room === 'c1_relay'", 60)
// Keep these generic: chapter-specific logic belongs in the chapter's own file.

// ---- evaluation --------------------------------------------------------------------------------------------------
// run `code` (the body of an async function) in the page; page exceptions are rethrown with the code for context
export async function ev(h, code) {
  try { return await h.eval(code); }
  catch (e) { throw new Error(`page eval failed: ${e.message}\n  in: ${String(code).slice(0, 300)}`); }
}
// evaluate a predicate expression safely (a throwing predicate counts as false)
export async function check(h, pred) {
  return !!(await ev(h, `try { return !!(${pred}); } catch (e) { return false; }`));
}
export const state = (h) => ev(h, 'return SH.state()');

// ---- time --------------------------------------------------------------------------------------------------------
// advance game time by `sec` (SH.advance: 30 Hz ticks, no rendering)
export const advance = (h, sec) => ev(h, `return SH.advance(${Number(sec)})`);
// poll `pred` in REAL time while the game's own loop runs (menus, fades, anything that needs rendering)
export async function waitFor(h, pred, timeoutSec = 20) {
  return !!(await ev(h, `return await SH.until(() => { try { return !!(${pred}); } catch (e) { return false; } }, ${Number(timeoutSec)})`));
}
// step SH.advance in small chunks until `pred` holds or `maxSec` of GAME time has passed → true | false.
// o.step (game seconds per chunk, default 0.25), o.each (a page-side statement run before every chunk, e.g. a skip)
export async function advanceUntil(h, pred, maxSec = 30, o = {}) {
  const step = o.step ?? 0.25;
  const each = o.each ? `try { ${o.each} } catch (e) {}` : '';
  // one round trip per ~2 s of game time keeps it fast; the predicate is checked after every chunk in the page
  const r = await ev(h, `
    const pred = () => { try { return !!(${pred}); } catch (e) { return false; } };
    let t = 0;
    if (pred()) return true;
    while (t < ${Number(maxSec)}) {
      ${each}
      await SH.advance(${step});
      t += ${step};
      if (pred()) return true;
    }
    return false;`);
  return !!r;
}
// like advanceUntil, but throws with the current SH.state() when the predicate never holds
export async function mustReach(h, pred, maxSec = 30, what = pred, o = {}) {
  if (await advanceUntil(h, pred, maxSec, o)) return true;
  const st = await state(h).catch(() => null);
  const errs = await ev(h, 'return SH.errors.slice(-5)').catch(() => []);
  throw new Error(`timed out after ${maxSec}s game time waiting for: ${what}\n  state: ${JSON.stringify(st)}\n  errors: ${JSON.stringify(errs)}`);
}

// ---- scenes, choices, input --------------------------------------------------------------------------------------
// skip whatever skippable scene chain is running (repeats while scenes keep starting); → number of skips
export async function skipScenes(h, maxSec = 20) {
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const sk = await ev(h, 'return SH.mod.Script.skippable');
    if (!sk) {
      // a scene may be about to start (a queued script): give it a moment, then stop if nothing is skippable
      await advance(h, 0.2);
      if (!(await ev(h, 'return SH.mod.Script.skippable'))) break;
      continue;
    }
    await ev(h, 'SH.skip(); return true');
    n++;
    await advance(h, 0.5);
  }
  // (a G.boss ends the skip when the fight starts, so Script.skipping is false during it; the `!cutscene` half also keeps
  // older builds, where the suspended scene stayed `skipping` for the whole fight, from waiting out the fight here)
  await advanceUntil(h, '!SH.mod.Script.skipping || !SH.mod.Script.cutscene', maxSec);
  return n;
}
// wait for a choice to be up (Script.choosing), then pick option i (0-based)
export async function choose(h, i, maxSec = 60) {
  await mustReach(h, 'SH.mod.Script.choosing', maxSec, 'a choice (Script.choosing)', { step: 0.1 });
  await ev(h, `return SH.choose(${Number(i)})`);
  await advance(h, 0.1);
}
// SH.press(action) followed by a few game ticks so the press is consumed
export async function press(h, action, holdSec = 0, after = 0.2) {
  await ev(h, `return SH.press(${JSON.stringify(action)}, ${Number(holdSec)})`);
  await advance(h, after);
}
// hold a real key (Playwright name, e.g. 'e', 'w', 'Shift') for `sec` of GAME time
export async function holdKey(h, key, sec) {
  await h.page.keyboard.down(key);
  try { await advance(h, sec); } finally { await h.page.keyboard.up(key); }
  await advance(h, 0.05);
}
// wait until the player has control (no blocking script, no transition, play mode)
export async function waitControl(h, maxSec = 30) {
  return mustReach(h, "SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning && SH.mod.Player.control !== false", maxSec, 'player control');
}
// teleport next to an interactable (x, z, facing yaw in degrees) and press interact
export async function interactAt(h, x, z, yaw, o = {}) {
  await ev(h, `SH.teleport(${x}, ${z}, ${yaw}); try { SH.mod.Cam.snap(); } catch (e) {} return true;`);
  await advance(h, o.settle ?? 0.3);
  await press(h, 'interact', 0, o.after ?? 0.4);
}

// ---- rooms -------------------------------------------------------------------------------------------------------
// debug jump (SH.goto) and wait until the room is loaded and idle
export async function gotoRoom(h, room, entry = null, maxSec = 15) {
  await ev(h, `return await SH.goto(${JSON.stringify(room)}, ${JSON.stringify(entry)})`);
  await mustReach(h, `SH.mod.World.room === ${JSON.stringify(room)} && !SH.mod.World.transitioning`, maxSec, `room ${room}`);
}
// wait for a room change triggered by the game itself (an exit, a door, G.goto)
export async function waitRoom(h, room, maxSec = 30) {
  return mustReach(h, `SH.mod.World.room === ${JSON.stringify(room)} && !SH.mod.World.transitioning`, maxSec, `room ${room}`);
}

// ---- checks ------------------------------------------------------------------------------------------------------
// throw if the page logged anything into SH.errors (o.since = the count to ignore, from errorCount())
export async function errorCount(h) { return ev(h, 'return SH.errors.length'); }
export async function assertNoErrors(h, o = {}) {
  const errs = await ev(h, `return SH.errors.slice(${Number(o.since || 0)})`);
  if (errs.length) throw new Error(`SH.errors (${errs.length}):\n  ` + errs.slice(0, 8).join('\n  '));
  return true;
}
// a PASS / FAIL line for isolated runs; returns ok
export function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

// ---- walking, menus, saving (added for ch0; generic) -------------------------------------------------------------
// walk Aidan with REAL keys (camera-relative W/A/S/D, diagonals, Shift with o.run) toward (x, z) until he is within
// o.tol m (default 0.4) or, with o.until (a page predicate), until that holds — e.g. walking into an exit:
//   await walkTo(h, 10.2, -7.5, { until: "SH.mod.World.room === 'c1_relay'" })
// Keys are re-chosen every o.step game seconds from Cam.basis(); after a camera cut they are released for a tick so
// the new camera's axes apply (direction hold would otherwise keep the old ones). While a blocking script owns Aidan
// the keys are released and the walk waits. → true | false (o.maxSec of game time, default 25)
export async function walkTo(h, x, z, o = {}) {
  const tol = o.tol ?? 0.4, maxSec = o.maxSec ?? 25, step = o.step ?? 0.25;
  const until = o.until || 'false';
  const kb = h.page.keyboard;
  let held = new Set(), lastCam = null;
  const setKeys = async (want) => {
    for (const k of held) if (!want.has(k)) await kb.up(k);
    for (const k of want) if (!held.has(k)) await kb.down(k);
    held = want;
  };
  try {
    for (let t = 0; t < maxSec; t += step) {
      const st = await ev(h, `const p = SH.mod.Player.pos, b = SH.mod.Cam.basis(); let u = false; try { u = !!(${until}); } catch (e) {}
        return { x: p.x, z: p.z, b, u, cam: SH.state().cam, free: SH.mode === 'play' && !SH.mod.Script.busy && !SH.mod.World.transitioning };`);
      if (st.u) return true;
      const dx = x - st.x, dz = z - st.z, dist = Math.hypot(dx, dz);
      if (!o.until && dist < tol) return true;
      if (!st.free) { await setKeys(new Set()); await advance(h, step); continue; }
      if (lastCam !== null && st.cam !== lastCam && held.size) { await setKeys(new Set()); await advance(h, 0.05); }
      lastCam = st.cam;
      const ux = dist > 1e-3 ? dx / dist : 0, uz = dist > 1e-3 ? dz / dist : 0;
      const fy = ux * st.b.fx + uz * st.b.fz, rx = ux * st.b.rx + uz * st.b.rz;
      const want = new Set();
      if (fy > 0.38) want.add('w'); else if (fy < -0.38) want.add('s');
      if (rx > 0.38) want.add('d'); else if (rx < -0.38) want.add('a');
      if (o.run && want.size) want.add('Shift');
      await setKeys(want);
      await advance(h, o.until ? step : Math.min(step, dist / 1.6 + 0.05));
    }
    return false;
  } finally { await setKeys(new Set()); await advance(h, 0.05); }
}
// close whatever menu screens are open (doc reading view, map …) with 'cancel', waiting for each to be ready
export async function closeMenus(h, maxSec = 10) {
  for (let i = 0; i < 8; i++) {
    const open = await ev(h, 'return SH.mod.Menus.isOpen()');
    if (!open) return true;
    await advanceUntil(h, '!SH.mod.Menus.isOpen() || (SH.mod.Menus._top && SH.mod.Menus._top.ready)', maxSec, { step: 0.1 });
    if (await ev(h, 'return SH.mod.Menus.isOpen() && !!(SH.mod.Menus._top && SH.mod.Menus._top.ready)')) await ev(h, "SH.nav('cancel'); return 1");
    await advance(h, 0.4);
  }
  return !(await ev(h, 'return SH.mod.Menus.isOpen()'));
}
// the §2A payphone flow at an interactable payphone Aidan can reach from (x, z, yaw): "Pick up the receiver?" YES →
// breathing (or Wai) → "Save your progress?" YES → the save screen → slot `slot` (0–2; overwrite confirmed) →
// "Progress saved." → the handset back. → the slot saved to (throws if nothing was saved)
export async function payphoneSave(h, x, z, yaw, slot = 0) {
  const seq0 = await ev(h, 'return SH.mod.Save.seq');
  await interactAt(h, x, z, yaw);
  await choose(h, 0);                                                  // Pick up the receiver? YES
  await choose(h, 0, 30);                                              // Save your progress? YES
  await mustReach(h, "SH.mod.Menus.current === 'save' && SH.mod.Menus._top && SH.mod.Menus._top.ready", 15, 'the save screen', { step: 0.1 });
  for (let i = 0; i < 4; i++) {
    const cur = await ev(h, 'return SH.mod.Menus._top.st.i');
    if (cur === slot) break;
    await ev(h, `SH.nav(${cur < slot ? "'down'" : "'up'"}); return 1`); await advance(h, 0.15);
  }
  await ev(h, "SH.nav('confirm'); return 1"); await advance(h, 0.4);
  if (await ev(h, 'return !!(SH.mod.Menus._top && SH.mod.Menus._top.st && SH.mod.Menus._top.st.ask)')) {
    await ev(h, "SH.nav('left'); return 1"); await advance(h, 0.15);           // "Overwrite this save?" starts on NO
    await ev(h, "SH.nav('confirm'); return 1"); await advance(h, 0.4);
  }
  await mustReach(h, `SH.mod.Save.seq !== ${JSON.stringify(seq0)} && !SH.mod.Menus.isOpen() && !SH.mod.Script.busy`, 20, 'the save to finish');
  return slot;
}
// load a slot like LOAD GAME / CONTINUE does (Game.continueFrom) and wait until play resumes in a loaded room
export async function loadSlot(h, slot = 0, maxSec = 20) {
  await ev(h, `SH.mod.Game.continueFrom(${JSON.stringify(slot)}); return 1`);
  await advance(h, 0.2);
  await mustReach(h, "SH.mode === 'play' && !!SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", maxSec, `continueFrom(${slot})`);
  await advance(h, 1.0);
}

// ---- the title screen and the in-game menus as a player uses them (added for chain.mjs; generic) ---------------------
// a page predicate: the menu screen `name` is on top and accepting input
export const menuReady = (name) => `SH.mod.Menus.current === ${JSON.stringify(name)} && !!(SH.mod.Menus._top && SH.mod.Menus._top.ready)`;
// one injected menu action (SH.nav: up/down/left/right/confirm/cancel/any), then a few ticks so the screen reads it
export async function nav(h, a, after = 0.2) {
  await ev(h, `SH.nav(${JSON.stringify(a)}); return 1`);
  await advance(h, after);
}
// from anywhere on the title screen to its menu: wait for "PRESS ANY KEY" as a player would (o.wait:false presses at
// once), press a key, wait for the menu to fade in → the visible labels
export async function titleMenu(h, o = {}) {
  await mustReach(h, menuReady('title'), o.maxSec ?? 40, 'the title screen', { step: 0.2 });
  const stage = () => ev(h, 'return SH.mod.Menus._top.st.stage');
  if (o.wait !== false && (await stage()) !== 'menu') await mustReach(h, "['press', 'menu'].includes(SH.mod.Menus._top.st.stage)", 20, 'PRESS ANY KEY', { step: 0.2 });
  if ((await stage()) !== 'menu') await nav(h, 'any', 0.3);
  await mustReach(h, "SH.mod.Menus.current === 'title' && SH.mod.Menus._top.st.stage === 'menu' && !SH.mod.Menus._top.st.attract && +getComputedStyle(SH.mod.Menus._top.st.menuBox).opacity > 0.9", 10, 'the title menu', { step: 0.2 });
  return ev(h, 'return SH.mod.Menus._top.st.list.items.map((x) => x.label + (x.off ? " (off)" : ""))');
}
// move a menu list (`list` = the page expression of a makeList, default the top screen's st.list) onto `label` with
// up/down presses, then confirm it
export async function menuPick(h, label, list = 'SH.mod.Menus._top.st.list') {
  for (let k = 0; k < 12; k++) {
    const cur = await ev(h, `const L = ${list}; return L && L.items[L.i] ? L.items[L.i].label : null`);
    if (cur === label) { await nav(h, 'confirm', 0.3); return true; }
    await nav(h, 'down', 0.15);
  }
  throw new Error(`menuPick: no "${label}" in ${JSON.stringify(await ev(h, `return (${list}).items.map((x) => x.label)`))}`);
}
// the title → NEW GAME → ACTION / RIDDLE LEVEL (left/right on each row, BEGIN) → the brightness calibration (a first-time
// player: nudge the bar, confirm) → the game starting. → { action, riddle } as the setup screen showed them
export async function titleNewGame(h, o = {}) {
  const LV = ['easy', 'normal', 'hard'];
  await titleMenu(h, o);
  await menuPick(h, 'NEW GAME');
  await mustReach(h, menuReady('newgame'), 10, 'the NEW GAME setup screen', { step: 0.1 });
  const row = async (r, want) => {
    for (let k = 0; k < 4 && (await ev(h, 'return SH.mod.Menus._top.st.row')) !== r; k++) await nav(h, 'down', 0.15);
    const key = r === 0 ? 'action' : 'riddle';
    for (let k = 0; k < 4; k++) {
      const v = await ev(h, `return SH.mod.Menus._top.st.v.${key}`);
      if (v === LV.indexOf(want)) break;
      await nav(h, v < LV.indexOf(want) ? 'right' : 'left', 0.15);
    }
  };
  await row(0, o.action || 'normal');
  await row(1, o.riddle || 'normal');
  const shown = await ev(h, `const t = SH.mod.Menus._top.st; return { action: ${JSON.stringify(LV)}[t.v.action], riddle: ${JSON.stringify(LV)}[t.v.riddle], desc: [...document.querySelectorAll('#ui .ng-d')].map((e) => e.textContent) }`);
  for (let k = 0; k < 4 && (await ev(h, 'return SH.mod.Menus._top.st.row')) !== 2; k++) await nav(h, 'down', 0.15);
  await nav(h, 'confirm', 0.4);
  if (await ev(h, "return SH.mod.Menus.current === 'calibrate'")) {
    await mustReach(h, menuReady('calibrate'), 10, 'the brightness calibration', { step: 0.1 });
    shown.calibrated = true;
    await nav(h, 'right', 0.2); await nav(h, 'left', 0.2);
    await nav(h, 'confirm', 0.4);
  }
  await mustReach(h, "SH.mode === 'play' || SH.mode === 'cutscene'", 30, 'the new game starting', { step: 0.2 });
  return shown;
}
// Esc → the pause menu → QUIT TO TITLE → "Quit to the title?" YES → the title screen
export async function quitToTitle(h) {
  await mustReach(h, "SH.mode === 'play' && !SH.mod.World.transitioning", 20, 'play (to pause)', { step: 0.2 });
  await ev(h, "SH.press('pause'); return 1");
  await mustReach(h, menuReady('pause'), 10, 'the pause menu', { step: 0.1 });
  await menuPick(h, 'QUIT TO TITLE');
  await mustReach(h, '!!SH.mod.Menus._top.st.ask', 5, 'the quit question', { step: 0.1 });
  await nav(h, 'left', 0.15);                                           // the question starts on NO
  await nav(h, 'confirm', 0.3);
  await mustReach(h, menuReady('title'), 30, 'the title after QUIT TO TITLE', { step: 0.25 });
}
// the title → LOAD GAME → slot (0–2 or 'auto') → play resumes in a loaded room
export async function titleLoad(h, slot, o = {}) {
  await titleMenu(h, { wait: false, ...o });
  await menuPick(h, 'LOAD GAME');
  await mustReach(h, menuReady('load'), 10, 'the LOAD GAME screen', { step: 0.1 });
  const want = slot === 'auto' ? 3 : Number(slot);
  for (let k = 0; k < 6 && (await ev(h, 'return SH.mod.Menus._top.st.i')) !== want; k++) await nav(h, 'down', 0.15);
  if ((await ev(h, 'return SH.mod.Menus._top.st.i')) !== want) throw new Error('titleLoad: could not select slot ' + slot);
  await nav(h, 'confirm', 0.4);
  // (a chapter-start autosave re-runs the chapter's begin(): the Prologue's opens on a cutscene)
  await mustReach(h, "(SH.mode === 'play' || SH.mode === 'cutscene') && !!SH.mod.World.room && !SH.mod.World.transitioning && !SH.mod.Menus.isOpen()", o.maxSec ?? 30, `LOAD GAME ${slot}`);
}
