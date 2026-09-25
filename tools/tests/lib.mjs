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
  // (a skipped scene that has started a G.boss stays `skipping` — suspended — for the whole fight: stop waiting once no
  // letterboxed scene is running, or the fight would play out unattended here)
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
