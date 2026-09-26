// tools/tests/options.mjs — spec §2A "Options": every entry applies LIVE and PERSISTS (META.options in localStorage), and
// the brightness calibration screen ("a single signal bar on black, and 'Adjust until the bar is barely visible.'"),
// both from Options and as a first-time player's NEW GAME step. Driven with real keys (W/S/A/D, E, Esc) like a player.
//
//   node tools/build.mjs --out .build/options.html
//   node tools/run.mjs --file .build/options.html --size 960x540 --quiet --script tools/tests/options.mjs
//   env: SH_SHOTS  screenshot directory (default .build/options)
//
// Each entry, changed in the Options screen opened from the pause menu (the game underneath), and its effect measured
// while the game runs:
//   BRIGHTNESS      → the calibration screen (the bar drawn through the real post chain; A/D adjust); the post chain's
//                     brightness uniform follows at once, and the mean luminance of a rendered game frame changes;
//   NOISE EFFECT    → OFF: the film grain uniform is 0 (and the DOM grain over menus hides); ON: back;
//   GRAIN STRENGTH  → the grain uniform scales with it;
//   SUBTITLE SIZE   → the next subtitle's font size (small < medium < large);
//   CONTROL TYPE    → CLASSIC TANK: A/D turn Aidan on the spot and W walks where he faces; CAMERA-RELATIVE: A/D walk;
//   CAMERA SHAKE    → OFF: Cam.shake moves nothing (and a shake under way stops); ON: the camera shakes;
//   MASTER / EFFECTS / MUSIC VOLUME → the audio bus gains follow;
//   INVERT EXAMINE ROTATION → holding D in the items examine view turns the model the other way;
//   VIBRATION       → OFF: no rumble reaches a (synthesised) gamepad; ON: it does;
//   SIGNAL          → CLASSIC: a dormant Tethered 8 m away (facing away, torch off) shows bars at once;
//                     UNRELIABLE (the default): the same Tethered reads nothing (only what has found Aidan transmits).
// Then the page is RELOADED: META.options come back exactly as set and apply at boot (brightness, grain, volumes, the
// subtitle size). Prints `PASS options`.
import fs from 'node:fs';
import { ev, report } from './lib.mjs';

const OUT = process.env.SH_SHOTS || '.build/options';

// a standard-mapping gamepad whose rumble calls are counted (navigator.getGamepads overridden in the page)
function fakePad() {
  const pad = window.__pad = {
    id: 'Synthetic standard gamepad (Vendor: 0000 Product: 0000)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0], rumbles: 0,
    vibrationActuator: { type: 'dual-rumble', playEffect() { pad.rumbles++; return Promise.resolve('complete'); }, reset() { return Promise.resolve('complete'); } },
  };
  navigator.getGamepads = () => [pad, null, null, null];
}

export default async function (page, h) {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const notes = [];
  const bad = (m) => notes.push('BUG: ' + m);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await ev(h, 'await SH.advance(0.12); return 1'); } };
  const top = () => ev(h, "const t = SH.mod.Menus._top; return t ? { name: SH.mod.Menus.current, ready: !!t.ready, i: t.st.i } : null");
  const waitMenu = async (name) => ev(h, `for (let i = 0; i < 100; i++) { const t = SH.mod.Menus._top; if (SH.mod.Menus.current === ${JSON.stringify(name)} && t && t.ready) return true; await SH.advance(0.1); } return false`);
  const opts = () => ev(h, 'return JSON.parse(JSON.stringify(SH.mod.META.options))');
  const stored = () => ev(h, "return JSON.parse(localStorage.getItem('signalhill.meta') || '{}').options || null");
  const persisted = async (k, what) => { const o = await opts(), s = await stored(); if (!s || JSON.stringify(s[k]) !== JSON.stringify(o[k])) bad(`${what}: META.options.${k} = ${JSON.stringify(o[k])} but localStorage holds ${JSON.stringify(s && s[k])}`); return o[k]; };
  // (the post chain's uniforms are written as a frame is drawn: draw one first)
  const U = () => ev(h, 'SH.mod.Render.render(0); const u = SH.mod.Render.uniforms; return { bright: u.uBright.value, grain: u.uGrain.value }');
  const lum = () => ev(h, `SH.mod.Render.render(0); const url = SH.mod.Render.capture(); const img = new Image(); await new Promise((r) => { img.onload = r; img.src = url; });
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 160, 90);
    const d = x.getImageData(0, 0, 160, 90).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return +(s / (d.length / 4)).toFixed(2);`);
  // the Options screen from the pause menu, cursor on row `row`
  const openOptions = async () => {
    await page.keyboard.press('Escape'); await ev(h, 'await SH.advance(0.2); return 1');
    if (!(await waitMenu('pause'))) { bad('Esc did not open the pause menu'); return false; }
    const items = await ev(h, 'return SH.mod.Menus._top.st.list.items.map((x) => x.label)');
    await key('s', items.indexOf('OPTIONS'));
    await key('e');
    if (!(await waitMenu('options'))) { bad('OPTIONS did not open from the pause menu'); return false; }
    return true;
  };
  const closeAll = async () => { await ev(h, 'await SH.mod.Menus.close(null); await SH.advance(0.8); return 1'); };
  const row = async (label) => {
    const labels = await ev(h, 'return SH.mod.Menus._top.st.rows.map((r) => r.o.label)');
    const want = labels.indexOf(label), cur = (await top()).i;
    if (want < 0) { bad(`no ${label} row`); return; }
    const n = (want - cur + labels.length) % labels.length;
    await key('s', n);
  };

  try {
  await ev(h, `(${fakePad})(); return 1`);
  await ev(h, "await SH.newGame({ skipIntro: true }); await SH.advance(2); await SH.goto('c1_relay', 'south'); await SH.advance(3); SH.mod.Script.abortAll('options'); if (!SH.S.inv.some((i) => i.id === 'box_cutter')) SH.S.inv.push({ id: 'box_cutter', n: 1 }); await SH.advance(0.5); return 1");
  const defaults = await opts();
  notes.push(`defaults: ${JSON.stringify(defaults)}`);
  if (!(await openOptions())) { report('options', false, notes.join(' | ')); return; }
  const labels = await ev(h, 'return SH.mod.Menus._top.st.rows.map((r) => r.o.label)');
  notes.push(`Options rows: ${labels.join(', ')}`);
  // (§2A's list, plus SIGNAL — the unreliable-signal design's CLASSIC switch)
  const want = ['BRIGHTNESS', 'NOISE EFFECT', 'GRAIN STRENGTH', 'SUBTITLE SIZE', 'CONTROL TYPE', 'CAMERA SHAKE', 'MASTER VOLUME', 'EFFECTS VOLUME', 'MUSIC VOLUME', 'INVERT EXAMINE ROTATION', 'VIBRATION', 'SIGNAL'];
  if (JSON.stringify(labels) !== JSON.stringify(want)) bad(`the Options list is not §2A's (+ SIGNAL): ${labels.join(', ')}`);
  if (defaults.signal !== 'unreliable') bad(`the SIGNAL default is ${JSON.stringify(defaults.signal)}, not 'unreliable'`);
  await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${OUT}/options.png`);

  // ---- BRIGHTNESS: the calibration screen ---------------------------------------------------------------------------
  {
    await row('BRIGHTNESS'); await key('e');
    if (!(await waitMenu('calibrate'))) bad('BRIGHTNESS did not open the calibration screen');
    const text = await ev(h, "return SH.mod.Menus._top.el.innerText.replace(/\\s+/g, ' ')");
    const b0 = (await opts()).brightness;
    await key('d', 6);
    const b1 = (await opts()).brightness, u1 = await U();
    await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${OUT}/calibrate.png`);
    await key('a', 12);
    const b2 = (await opts()).brightness, u2 = await U();
    await key('d', 6);
    await key('e');
    await waitMenu('options');
    const b3 = await persisted('brightness', 'BRIGHTNESS');
    notes.push(`BRIGHTNESS: calibration screen "${text.slice(0, 60)}"; D×6 ${b0} → ${b1} (uniform ${u1.bright}), A×12 → ${b2} (uniform ${u2.bright}), D×6 + E → ${b3}, saved`);
    if (!/Adjust until the bar is barely visible\./.test(text)) bad('the calibration screen lacks "Adjust until the bar is barely visible."');
    if (!(b1 > b0 && u1.bright === b1 && b2 < b0 && u2.bright === b2)) bad('brightness does not change live on the calibration screen');
    // the game frame, darker and brighter
    await closeAll();
    await ev(h, 'SH.mod.META.options.brightness = 0.6; await SH.advance(0.2); return 1'); const lDark = await lum();
    await ev(h, 'SH.mod.META.options.brightness = 1.6; await SH.advance(0.2); return 1'); const lBright = await lum();
    await ev(h, `SH.mod.META.options.brightness = ${b3}; await SH.advance(0.2); return 1`);
    notes.push(`  a game frame's mean luminance at brightness 0.6 / 1.6: ${lDark} / ${lBright}`);
    if (!(lBright > lDark + 2)) bad('brightness does not change the rendered frame');
    await openOptions();
  }
  // ---- NOISE EFFECT and GRAIN STRENGTH -----------------------------------------------------------------------------
  {
    await row('NOISE EFFECT'); await key('e');
    const n1 = await persisted('noise', 'NOISE EFFECT'); await closeAll(); const g1 = (await U()).grain;
    await openOptions(); await row('NOISE EFFECT'); await key('e');
    const n2 = await persisted('noise', 'NOISE EFFECT'); await closeAll(); const g2 = (await U()).grain;
    notes.push(`NOISE EFFECT: ${n1 ? 'ON' : 'OFF'} → grain uniform ${g1.toFixed(3)}; ${n2 ? 'ON' : 'OFF'} → ${g2.toFixed(3)}`);
    if (!(n1 === false && g1 === 0 && n2 === true && g2 > 0)) bad('NOISE EFFECT does not switch the film grain off and on');
    await openOptions(); await row('GRAIN STRENGTH');
    const gs0 = (await opts()).grain; await key('a', 3); const gs1 = await persisted('grain', 'GRAIN STRENGTH');
    await closeAll(); const ga = (await U()).grain;
    await openOptions(); await row('GRAIN STRENGTH'); await key('d', 3); const gs2 = await persisted('grain', 'GRAIN STRENGTH');
    await closeAll(); const gb = (await U()).grain;
    notes.push(`GRAIN STRENGTH: ${gs0} → A×3 ${gs1} (uniform ${ga.toFixed(3)}) → D×3 ${gs2} (uniform ${gb.toFixed(3)})`);
    if (!(gs1 < gs0 && Math.abs(ga / gb - gs1 / gs2) < 0.02)) bad('GRAIN STRENGTH does not scale the grain');
  }
  // ---- SUBTITLE SIZE ------------------------------------------------------------------------------------------------
  {
    const size = async () => ev(h, "SH.mod.UI.subtitle('Fifteen-minute break.'); await SH.advance(0.5); const e = [...document.querySelectorAll('#ui .ui-sub')].find((x) => x.textContent.includes('Fifteen')); const fs = parseFloat(getComputedStyle(e).fontSize); SH.mod.UI.clearSubtitle(0); await SH.advance(0.3); return fs");
    const seen = {};
    for (let i = 0; i < 3; i++) {
      await openOptions(); await row('SUBTITLE SIZE'); await key('d');
      const v = await persisted('subs', 'SUBTITLE SIZE'); await closeAll();
      seen[v] = await size();
    }
    notes.push(`SUBTITLE SIZE: ${Object.entries(seen).map(([k, v]) => `${k} ${v.toFixed(1)} px`).join(', ')}`);
    if (!(seen.small < seen.medium && seen.medium < seen.large)) bad('SUBTITLE SIZE does not change the subtitles');
    if ((await opts()).subs !== 'medium') { await openOptions(); await row('SUBTITLE SIZE'); while ((await opts()).subs !== 'medium') await key('d'); await closeAll(); }
  }
  // ---- CONTROL TYPE -------------------------------------------------------------------------------------------------
  {
    const pose = () => ev(h, 'const p = SH.mod.Player.pos; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +(SH.mod.Player.yaw * 180 / Math.PI).toFixed(1) }');
    const hold = async (k, sec) => { await page.keyboard.down(k); await ev(h, `await SH.advance(${sec}); return 1`); await page.keyboard.up(k); await ev(h, 'await SH.advance(0.3); return 1'); };
    await ev(h, "SH.teleport(9, -60, 180); await SH.advance(0.5); return 1");
    await openOptions(); await row('CONTROL TYPE'); await key('d');
    const c1 = await persisted('control', 'CONTROL TYPE'); await closeAll();
    const p0 = await pose(); await hold('a', 0.8); const p1 = await pose(); await hold('w', 0.8); const p2 = await pose();
    const turned = Math.abs(((p1.yaw - p0.yaw + 540) % 360) - 180), movedTurn = Math.hypot(p1.x - p0.x, p1.z - p0.z), walked = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const dir = Math.atan2(p2.x - p1.x, p2.z - p1.z) * 180 / Math.PI, off = Math.abs(((dir - p1.yaw + 540) % 360) - 180);
    notes.push(`CONTROL TYPE ${c1}: A held 0.8 s turns him ${turned.toFixed(0)}° (moving ${movedTurn.toFixed(2)} m); W held 0.8 s walks ${walked.toFixed(2)} m, ${off.toFixed(0)}° off his facing`);
    if (!(c1 === 'tank' && turned > 30 && movedTurn < 0.25 && walked > 0.6 && off < 20)) bad('CLASSIC TANK controls do not turn on the spot and walk forward');
    await openOptions(); await row('CONTROL TYPE'); await key('d');
    const c2 = await persisted('control', 'CONTROL TYPE'); await closeAll();
    const q0 = await pose(); await hold('a', 0.8); const q1 = await pose();
    const moved = Math.hypot(q1.x - q0.x, q1.z - q0.z);
    notes.push(`CONTROL TYPE ${c2}: A held 0.8 s walks him ${moved.toFixed(2)} m (camera-relative)`);
    if (!(c2 === 'camera' && moved > 0.6)) bad('CAMERA-RELATIVE controls do not walk on A');
  }
  // ---- CAMERA SHAKE -------------------------------------------------------------------------------------------------
  {
    const shakeOff = () => ev(h, "SH.mod.Cam.shake(1, 2); await SH.advance(0.2); const c = SH.mod.Render.camera.position, v = SH.mod.Cam.view.pos; return +c.distanceTo(v).toFixed(4)");
    const on0 = await shakeOff();
    await openOptions(); await row('CAMERA SHAKE'); await key('e');
    const s1 = await persisted('shake', 'CAMERA SHAKE'); await closeAll();
    const off1 = await shakeOff();
    await openOptions(); await row('CAMERA SHAKE'); await key('e');
    const s2 = await persisted('shake', 'CAMERA SHAKE'); await closeAll();
    const on2 = await shakeOff();
    notes.push(`CAMERA SHAKE: ON → the camera moves ${on0} m off its mark in a shake; ${s1 ? 'ON' : 'OFF'} → ${off1}; ${s2 ? 'ON' : 'OFF'} → ${on2}`);
    if (!(on0 > 0.001 && s1 === false && off1 === 0 && s2 === true && on2 > 0.001)) bad('CAMERA SHAKE does not switch the shake off and on');
    await ev(h, 'await SH.advance(2); return 1');
  }
  // ---- VOLUMES ------------------------------------------------------------------------------------------------------
  {
    const bus = () => ev(h, 'await SH.wait(0.4); const s = SH.mod.Snd.stats(); return s.buses');
    for (const [label, k, b] of [['MASTER VOLUME', 'master', 'master'], ['EFFECTS VOLUME', 'effects', 'effects'], ['MUSIC VOLUME', 'music', 'music']]) {
      await openOptions(); await row(label);
      const v0 = (await opts())[k]; const g0 = (await bus())[b];
      await key('a', 4); const v1 = await persisted(k, label); const g1 = (await bus())[b];
      await key('d', 4); const v2 = await persisted(k, label); const g2 = (await bus())[b];
      await closeAll();
      notes.push(`${label}: ${v0} → ${v1} → ${v2}; its bus gain ${g0.toFixed(3)} → ${g1.toFixed(3)} → ${g2.toFixed(3)} (live, the menu still open)`);
      if (!(v1 < v0 && g1 < g0 - 0.01 && Math.abs(v2 - v0) < 1e-6 && Math.abs(g2 - g0) < 0.02)) bad(`${label} does not change its bus live`);
    }
  }
  // ---- INVERT EXAMINE ROTATION ----------------------------------------------------------------------------------------
  {
    const turn = async () => {
      await ev(h, "SH.mod.Menus.open('items', { tab: 1 }); for (let i = 0; i < 60 && !(SH.mod.Menus._top && SH.mod.Menus._top.ready); i++) await SH.advance(0.1); return 1");
      await key('e');
      const C = await ev(h, "const C = SH.mod.Menus._top.st.cmd; return C ? C.list.items.map((x) => x.label) : null");
      if (!C) { await closeAll(); return null; }
      await key('s', C.indexOf('EXAMINE')); await key('e');
      await ev(h, 'await SH.advance(0.6); return 1');
      const y0 = await ev(h, 'const ex = SH.mod.Menus._top.st.ex; return ex ? ex.yaw : null');
      await page.keyboard.down('d'); await ev(h, 'await SH.advance(0.5); return 1'); await page.keyboard.up('d');
      const y1 = await ev(h, 'const ex = SH.mod.Menus._top.st.ex; return ex ? ex.yaw : null');
      await closeAll();
      return y0 == null || y1 == null ? null : y1 - y0;
    };
    const d0 = await turn();
    await openOptions(); await row('INVERT EXAMINE ROTATION'); await key('e');
    const i1 = await persisted('invertExamine', 'INVERT EXAMINE ROTATION'); await closeAll();
    const d1 = await turn();
    await openOptions(); await row('INVERT EXAMINE ROTATION'); await key('e'); await closeAll();
    notes.push(`INVERT EXAMINE ROTATION: D held 0.5 s in the examine view turns the model ${d0 == null ? '-' : d0.toFixed(2)} rad; ${i1 ? 'ON' : 'OFF'} → ${d1 == null ? '-' : d1.toFixed(2)} rad`);
    if (!(d0 != null && d1 != null && i1 === true && Math.sign(d0) === -Math.sign(d1) && Math.abs(d0) > 0.3)) bad('INVERT EXAMINE ROTATION does not reverse the examine rotation');
  }
  // ---- VIBRATION (the synthesised gamepad counts rumble effects) ------------------------------------------------------
  {
    const rumble = () => ev(h, "const n0 = window.__pad.rumbles; SH.mod.Input.rumble(0.5, 0.5, 100); return window.__pad.rumbles - n0");
    const r0 = await rumble();
    await openOptions(); await row('VIBRATION'); await key('e');
    const v1 = await persisted('vibration', 'VIBRATION'); await closeAll();
    const r1 = await rumble();
    await openOptions(); await row('VIBRATION'); await key('e');
    const v2 = await persisted('vibration', 'VIBRATION'); const r2menu = await ev(h, 'return window.__pad.rumbles');
    await closeAll();
    const r2 = await rumble();
    notes.push(`VIBRATION: ON → ${r0} rumble effect(s) reach the pad; ${v1 ? 'ON' : 'OFF'} → ${r1}; ${v2 ? 'ON' : 'OFF'} → ${r2} (switching it on buzzes the pad once: ${r2menu} so far)`);
    if (!(r0 === 1 && v1 === false && r1 === 0 && v2 === true && r2 === 1)) bad('VIBRATION does not switch the rumble off and on');
  }
  // ---- SIGNAL (a dormant Tethered 8 m away: CLASSIC reads it at once, UNRELIABLE not at all) ----------------------------
  {
    const probe = () => ev(h, `const P = SH.mod.Player; P.setTorch(false); const p = P.pos, y = P.yaw;
      const x = p.x + Math.sin(y) * 8, z = p.z + Math.cos(y) * 8;
      const e = SH.mod.Enemies.spawn({ id: 'options:teth', type: 'tethered', pos: [x, z], rot: y * 180 / Math.PI, anchor: [x, z], persist: false });
      await SH.advance(0.6); const r = SH.mod.Phone.reading; const out = { bars: r.bars, signal: SH.mod.Phone.signalMode, aware: SH.mod.Enemies.aware(e), state: e.state };
      e.remove(); await SH.advance(3); return out`);
    const r0 = await probe();
    await openOptions(); await row('SIGNAL'); await key('e');
    const s1 = await persisted('signal', 'SIGNAL'); const live1 = await ev(h, 'return SH.mod.Phone.signalMode'); await closeAll();
    const r1 = await probe();
    await openOptions(); await row('SIGNAL'); await key('d');
    const s2 = await persisted('signal', 'SIGNAL'); await closeAll();
    const r2 = await probe();
    notes.push(`SIGNAL: ${r0.signal} → a dormant Tethered 8 m off reads ${r0.bars} bar(s) (aware ${r0.aware}, ${r0.state}); ${s1} (Phone.signalMode ${live1} with the menu still open) → ${r1.bars}; ${s2} → ${r2.bars}`);
    if (!(r0.signal === 'unreliable' && r0.bars === 0 && s1 === 'classic' && live1 === 'classic' && r1.bars > 0 && s2 === 'unreliable' && r2.bars === 0)) bad('SIGNAL does not switch between UNRELIABLE and CLASSIC live');
  }
  // ---- persistence: reload the page ---------------------------------------------------------------------------------
  {
    const setTo = { brightness: 1.35, noise: true, grain: 0.6, subs: 'large', control: 'tank', shake: false, master: 0.5, effects: 0.7, music: 0.3, invertExamine: true, vibration: false, signal: 'classic' };
    // set the rest through the screen as a player would (the values the steps above left are real already)
    await openOptions();
    await row('GRAIN STRENGTH'); while ((await opts()).grain > 0.61) await key('a');
    await row('SUBTITLE SIZE'); while ((await opts()).subs !== 'large') await key('d');
    await row('CONTROL TYPE'); if ((await opts()).control !== 'tank') await key('d');
    await row('CAMERA SHAKE'); if ((await opts()).shake) await key('e');
    await row('MASTER VOLUME'); while ((await opts()).master > 0.51) await key('a');
    await row('EFFECTS VOLUME'); while ((await opts()).effects > 0.71) await key('a');
    await row('MUSIC VOLUME'); while ((await opts()).music > 0.31) await key('a');
    await row('INVERT EXAMINE ROTATION'); if (!(await opts()).invertExamine) await key('e');
    await row('VIBRATION'); if ((await opts()).vibration) await key('e');
    await row('SIGNAL'); if ((await opts()).signal !== 'classic') await key('e');
    await row('BRIGHTNESS'); await key('e'); await waitMenu('calibrate');
    while ((await opts()).brightness < 1.34) await key('d');
    while ((await opts()).brightness > 1.36) await key('a');
    await key('e'); await waitMenu('options');
    const before = await opts();
    await closeAll();
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: 60000 });
    await ev(h, 'await SH.advance(0.5); return 1');
    const after = await opts();
    const boot = await ev(h, "SH.mod.Render.render(0); const u = SH.mod.Render.uniforms; SH.mod.UI.subtitle('x'); await SH.advance(0.2); const lg = !!document.querySelector('#ui .ui-sz-l'); SH.mod.UI.clearSubtitle(0); return { bright: u.uBright.value, grain: u.uGrain.value, volumes: SH.mod.Snd.stats().volumes, subsLarge: lg }");
    notes.push(`reload: META.options ${JSON.stringify(after)}; at boot: brightness uniform ${boot.bright}, grain uniform ${boot.grain.toFixed(3)}, volumes ${JSON.stringify(boot.volumes)}, large subtitles ${boot.subsLarge}`);
    for (const k of Object.keys(setTo)) {
      if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) bad(`${k} did not survive a reload (${JSON.stringify(before[k])} → ${JSON.stringify(after[k])})`);
      if (JSON.stringify(before[k]) !== JSON.stringify(setTo[k]) && !(typeof setTo[k] === 'number' && Math.abs(before[k] - setTo[k]) < 0.051)) bad(`${k} was not set to ${JSON.stringify(setTo[k])} through the screen (${JSON.stringify(before[k])})`);
    }
    if (!(Math.abs(boot.bright - after.brightness) < 1e-6 && boot.subsLarge && Math.abs(boot.volumes.master - after.master) < 1e-6 && Math.abs(boot.volumes.music - after.music) < 1e-6)) bad('the saved options are not applied at boot');
    // the first-time player's calibration step (NEW GAME → setup → BEGIN → calibration → the game)
    await ev(h, "SH.mod.META.calibrated = false; localStorage.setItem('signalhill.meta', JSON.stringify(SH.mod.META)); return 1");
    await ev(h, "for (let i = 0; i < 300 && SH.mod.Menus._top && SH.mod.Menus._top.st.stage !== 'press' && SH.mod.Menus._top.st.stage !== 'menu'; i++) await SH.advance(0.1); return 1");
    await key('e'); await ev(h, 'await SH.advance(1.2); return 1');
    await key('e');                                                           // NEW GAME
    const ng = await waitMenu('newgame');
    await key('e'); await key('e'); await key('e');                           // ACTION → RIDDLE → BEGIN
    const cal = await waitMenu('calibrate');
    await ev(h, 'SH.mod.Render.render(0); return 1'); await h.shot(`${OUT}/calibrate_first_time.png`);
    const ctext = cal ? await ev(h, "return SH.mod.Menus._top.el.innerText.replace(/\\s+/g, ' ')") : '';
    await key('a', 2);
    await key('e');
    const started = await ev(h, "for (let i = 0; i < 300 && SH.mode !== 'play' && SH.mode !== 'cutscene'; i++) await SH.advance(0.1); return { mode: SH.mode, calibrated: SH.mod.META.calibrated, brightness: SH.mod.META.options.brightness }");
    notes.push(`first-time NEW GAME: setup ${ng ? 'up' : 'MISSING'} → calibration ${cal ? `up ("${ctext.slice(0, 50)}")` : 'MISSING'} → A×2 + E → ${JSON.stringify(started)}`);
    if (!ng || !cal) bad('a first-time NEW GAME does not go setup → calibration');
    if (!started.calibrated || Math.abs(started.brightness - 1.25) > 1e-6 || !/cutscene|play/.test(started.mode)) bad('the calibration step does not apply and start the game');
  }
  } catch (e) { bad('threw: ' + String(e.message).split('\n').slice(0, 2).join(' ')); }
  for (const n of notes) console.log('  ' + n);
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); bad('page errors'); }
  report('options (§2A): every entry applies live and persists; the calibration screen', !notes.some((n) => n.startsWith('BUG')), `${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
