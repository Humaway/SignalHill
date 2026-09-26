// tools/tests/gamepad.mjs — spec §1 "full Gamepad API support", §3 Controls (gamepad): a synthesised standard-mapping pad
// (navigator.getGamepads overridden in the page; Input polls it every tick) plays through the title, the menus and a
// room with no keyboard at all:
//   the title: A ends PRESS ANY KEY, the D-pad and the left stick move the menu, A opens OPTIONS, the D-pad changes a
//     value, B backs out; NEW GAME → setup (A ×3) → the first-time calibration (D-pad right, A) → the Prologue's
//     opening scene, skipped by HOLDING Start for 1 s;
//   play: the left stick walks (camera-relative), RT runs, A examines, Y the torch, B the quick 180° turn, LT readies,
//     X attacks; Start pauses (D-pad through the list, A opens ITEMS, B back, Start resumes); Select opens the map,
//     D-pad up and LB the phone, RB / R3 / D-pad down the inventory (LB/RB change its tabs; D-pad left/right the item;
//     the right stick turns the examined model), B closes each;
//   prompts name the pad's buttons once it is the device in use; rumble reaches the pad (the phone's buzz, the heartbeat
//     at Danger) while VIBRATION is on.
//
//   node tools/build.mjs --out .build/pad.html
//   node tools/run.mjs --file .build/pad.html --size 960x540 --quiet --script tools/tests/gamepad.mjs
// Prints each check and `PASS gamepad`.
import { ev, report } from './lib.mjs';

// standard mapping: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Select/View · 9 Start · 10 L3 · 11 R3 · 12–15 D-pad U D L R
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

function fakePad() {
  const pad = window.__pad = {
    id: 'Synthetic standard gamepad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0], rumbles: 0,
    vibrationActuator: { type: 'dual-rumble', playEffect() { pad.rumbles++; return Promise.resolve('complete'); }, reset() { return Promise.resolve('complete'); } },
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__btn = (i, on) => { const b = pad.buttons[i]; b.pressed = b.touched = !!on; b.value = on ? 1 : 0; pad.timestamp = performance.now(); };
  window.__axes = (a) => { for (let i = 0; i < 4; i++) pad.axes[i] = a[i] || 0; pad.timestamp = performance.now(); };
  window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
}

export default async function (page, h) {
  const t0 = Date.now();
  const notes = [];
  const bad = (m) => notes.push('BUG: ' + m);
  const ok = (cond, what, detail = '') => { notes.push(`${cond ? 'ok ' : 'BUG:'} ${what}${detail ? ' — ' + detail : ''}`); return cond; };
  // press a button: down for `hold` game seconds (SH.advance: Input polls the pad every 1/30 s tick), then up
  const btn = (name, hold = 0.1, after = 0.3) => ev(h, `__btn(${BTN[name]}, true); await SH.advance(${hold}); __btn(${BTN[name]}, false); await SH.advance(${after}); return 1`);
  const stick = (lx, ly, sec, extra = '') => ev(h, `__axes([${lx}, ${ly}, 0, 0]); ${extra} await SH.advance(${sec}); __axes([0, 0, 0, 0]); await SH.advance(0.3); return 1`);
  const cur = () => ev(h, 'return SH.mod.Menus.current');
  const ready = (name, sec = 10) => ev(h, `for (let i = 0; i < ${sec * 10}; i++) { const t = SH.mod.Menus._top; if (SH.mod.Menus.current === ${JSON.stringify(name)} && t && t.ready) return true; await SH.advance(0.1); } return false`);
  const closed = (sec = 5) => ev(h, `for (let i = 0; i < ${sec * 10}; i++) { if (!SH.mod.Menus.isOpen()) return true; await SH.advance(0.1); } return false`);
  const pose = () => ev(h, 'const p = SH.mod.Player.pos; return { x: p.x, z: p.z, yaw: SH.mod.Player.yawDeg }');
  try {
    await ev(h, `(${fakePad})(); localStorage.removeItem('signalhill.meta'); return 1`);
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: 60000 });
    await ev(h, `(${fakePad})(); SH.mod.META.calibrated = false; return 1`);
    // ---- the title ------------------------------------------------------------------------------------------------
    await ev(h, "for (let i = 0; i < 300 && SH.mod.Menus._top.st.stage !== 'press'; i++) await SH.advance(0.1); return 1");
    await btn('A');
    await ev(h, 'await SH.advance(1.2); return 1');
    const st1 = await ev(h, "const t = SH.mod.Menus._top.st; return { stage: t.stage, i: t.list.i, items: t.list.items.map((x) => x.label), dev: SH.mod.Input.lastDevice }");
    ok(st1.stage === 'menu', 'title: A ends PRESS ANY KEY', `the menu ${st1.items.join(' / ')}, device ${st1.dev}`);
    await btn('DOWN'); const i1 = await ev(h, 'return SH.mod.Menus._top.st.list.i');
    await stick(0, 1, 0.25); const i2 = await ev(h, 'return SH.mod.Menus._top.st.list.i');
    await btn('UP'); await btn('UP'); const i3 = await ev(h, 'return SH.mod.Menus._top.st.list.i');
    ok(i1 !== st1.i && i2 !== i1 && i3 === 0, 'title: the D-pad and the left stick move the selection', `${st1.i} → D-pad down ${i1} → stick down ${i2} → D-pad up ×2 ${i3}`);
    // OPTIONS: A opens it, the D-pad changes a value, B backs out
    const optIdx = st1.items.indexOf('OPTIONS');
    await ev(h, `SH.mod.Menus._top.st.list.select(${optIdx}); return 1`);
    await btn('A');
    const opOpen = await ready('options');
    await btn('DOWN');                                                     // NOISE EFFECT
    const n0 = await ev(h, 'return SH.mod.META.options.noise');
    await btn('RIGHT'); const n1 = await ev(h, 'return SH.mod.META.options.noise');
    await btn('A'); const n2 = await ev(h, 'return SH.mod.META.options.noise');
    await btn('B'); await ev(h, 'await SH.advance(0.6); return 1');
    const back = await cur();
    ok(opOpen && n1 === !n0 && n2 === n0 && back === 'title', 'title: A opens OPTIONS, D-pad right / A change NOISE EFFECT, B backs out', `noise ${n0} → ${n1} → ${n2}; back on ${back}`);
    // NEW GAME → setup → calibration → the Prologue
    await ev(h, 'SH.mod.Menus._top.st.list.select(0); return 1');
    await btn('A');
    const ng = await ready('newgame');
    await btn('A'); await btn('A'); await btn('A');
    const cal = await ready('calibrate');
    const b0 = await ev(h, 'return SH.mod.META.options.brightness');
    await btn('RIGHT'); await btn('RIGHT');
    const b1 = await ev(h, 'return SH.mod.META.options.brightness');
    await btn('A');
    const cs = await ev(h, "for (let i = 0; i < 400 && !SH.mod.Script.skippable; i++) await SH.advance(0.1); return SH.mod.Script.cutscene ? String(SH.mod.Script.cutscene.name || SH.mod.Script.cutscene.opts && SH.mod.Script.cutscene.opts.cutscene || 'a cutscene') : null");
    ok(ng && cal && Math.abs(b1 - b0 - 0.1) < 1e-6 && !!cs, 'NEW GAME with the pad: setup (A ×3) → calibration (D-pad right ×2, A) → the opening scene', `brightness ${b0} → ${b1}; scene ${cs}`);
    // hold Start 1 s: skip
    const sk = await ev(h, `__btn(${BTN.START}, true); let p = 0; for (let i = 0; i < 45; i++) { await SH.advance(1 / 30); p = Math.max(p, SH.mod.Input.skipProgress()); } __btn(${BTN.START}, false); await SH.advance(0.5); return { p: +p.toFixed(2), skipping: !!SH.mod.Script.skipping, pause: SH.mod.Menus.current }`);
    const after = await ev(h, "for (let i = 0; i < 300 && (SH.mod.Script.skipping || SH.mode !== 'play'); i++) await SH.advance(0.1); return { mode: SH.mode, room: SH.mod.World.room, pause: SH.mod.Menus.current }");
    ok(sk.p >= 1 && after.mode === 'play' && !after.pause, 'holding Start 1 s skips the scene (and does not pause)', `skip hold ${sk.p}; then ${JSON.stringify(after)}`);
    // ---- play -----------------------------------------------------------------------------------------------------
    await ev(h, "await SH.goto('c1_relay', 'south'); await SH.advance(2); SH.mod.Script.abortAll('pad'); if (!SH.S.inv.some((i) => i.id === 'box_cutter')) SH.S.inv.push({ id: 'box_cutter', n: 1 }); if (!SH.S.inv.some((i) => i.id === 'steel_bar')) SH.S.inv.push({ id: 'steel_bar', n: 1 }); SH.S.equipped = 'steel_bar'; SH.teleport(9, -60, 180); await SH.advance(1); return 1");
    let p0 = await pose();
    await stick(0, -1, 1.0);                                               // stick up
    let p1 = await pose();
    const walk = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    await ev(h, 'SH.teleport(9, -60, 180); await SH.advance(0.5); return 1');
    p0 = await pose();
    await stick(0, -1, 1.0, `__btn(${BTN.RT}, true);`);
    await ev(h, `__btn(${BTN.RT}, false); return 1`);
    p1 = await pose();
    const run = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    ok(walk > 1.0 && run > walk * 1.6, 'the left stick walks, RT runs', `1 s: walked ${walk.toFixed(2)} m, ran ${run.toFixed(2)} m`);
    await ev(h, 'SH.teleport(9, -60, 180); await SH.advance(0.5); return 1');
    // Y: torch · B: quick turn · LT: ready · X: attack
    const t0t = await ev(h, 'return SH.mod.Player.torchOn'); await btn('Y'); const t1t = await ev(h, 'return SH.mod.Player.torchOn');
    ok(t1t === !t0t, 'Y toggles the torch', `${t0t} → ${t1t}`);
    const y0 = (await pose()).yaw; await btn('B', 0.1, 1.0); const y1 = (await pose()).yaw;
    const turned = Math.abs(((y1 - y0 + 540) % 360) - 180);
    ok(turned > 150, 'B makes the quick 180° turn', `${y0.toFixed(0)}° → ${y1.toFixed(0)}° (${turned.toFixed(0)}°)`);
    const rd = await ev(h, `__btn(${BTN.LT}, true); await SH.advance(0.5); const r = SH.mod.Player.ready; __btn(${BTN.X}, true); await SH.advance(0.1); __btn(${BTN.X}, false); await SH.advance(0.15); const a = SH.mod.Player.attackState; __btn(${BTN.LT}, false); await SH.advance(1.2); return { ready: r, attack: a ? (a.kind || a.phase || a.state || 'on') : null, after: SH.mod.Player.ready }`);
    ok(rd.ready && !!rd.attack && !rd.after, 'LT readies the bar, X swings it', JSON.stringify(rd));
    // A: examine the thing in front of him
    const ex = await ev(h, `const W = SH.mod.World, P = SH.mod.Player;
      const list = W.build.interactables.filter((i) => i.kind === 'examine' && i.enabled !== false && !i.removed && (!i.world || i.world === 'both' || i.world === (SH.S.outage ? 'outage' : 'fog')));
      let best = null;
      for (const it of list) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (!best || d < best.d) best = { it, d }; }
      const it = best.it; const a = Math.atan2(it.pos.x - P.pos.x, it.pos.z - P.pos.z);
      SH.teleport(it.pos.x - Math.sin(a) * 0.8, it.pos.z - Math.cos(a) * 0.8, a * 180 / Math.PI); await SH.advance(0.6);
      const n0 = SH.S.done['ex:' + it.id] | 0;
      __btn(${BTN.A}, true); await SH.advance(0.12); __btn(${BTN.A}, false); await SH.advance(0.6);
      const sub = [...document.querySelectorAll('#ui .ui-sub')].map((e) => +getComputedStyle(e).opacity > 0.5 ? e.textContent : '').join('').trim();
      return { id: it.id, n0, n1: SH.S.done['ex:' + it.id] | 0, sub: sub.slice(0, 60) }`);
    ok(ex.n1 === ex.n0 + 1 && ex.sub.length > 0, 'A examines', `${ex.id}: "${ex.sub}"`);
    await ev(h, 'SH.mod.UI.clearSubtitle(0); await SH.advance(3); SH.teleport(9, -60, 180); await SH.advance(0.5); return 1');
    // Start: pause · the list · A opens ITEMS · B back · Start resumes
    await btn('START', 0.1, 0.2);
    const ps = await ready('pause');
    const pi0 = await ev(h, 'return SH.mod.Menus._top.st.list.i');
    await btn('DOWN'); const pi1 = await ev(h, 'return SH.mod.Menus._top.st.list.i');
    await btn('A'); const itemsFromPause = await ready('items');
    await btn('B'); const backPause = await ready('pause');
    await btn('START', 0.1, 0.2); const resumed = await closed();
    ok(ps && pi1 === pi0 + 1 && itemsFromPause && backPause && resumed, 'Start pauses; D-pad down moves; A opens ITEMS; B returns to the pause list; Start resumes', `pause ${ps}, list ${pi0} → ${pi1}, items ${itemsFromPause}, back ${backPause}, resumed ${resumed}`);
    // Select: the map (or "You don't have a map of this area.")
    await btn('SELECT'); const mp = await ready('map'); const mtxt = mp ? await ev(h, "return SH.mod.Menus._top.el.innerText.replace(/\\s+/g, ' ').slice(0, 60)") : '';
    await btn('B'); const mpc = await closed();
    ok(mp && mpc, 'Select opens the map, B closes it', `"${mtxt}"`);
    // D-pad up / LB: the phone
    await btn('UP'); const ph1 = await ready('phone');
    await btn('RIGHT'); const tab = await ev(h, 'return SH.mod.Menus._top.st.tab');
    await btn('B'); const phc1 = await closed();
    await btn('LB'); const ph2 = await ready('phone');
    await btn('B'); const phc2 = await closed();
    ok(ph1 && ph2 && phc1 && phc2 && tab === 1, 'D-pad up and LB open the phone (D-pad right changes its tab), B closes it', `tab after right: ${tab}`);
    // RB / R3 / D-pad down: the inventory; LB/RB tabs; D-pad left/right the item; the right stick turns the examined model
    await btn('RB'); const iv1 = await ready('items');
    const tabA = await ev(h, 'return SH.mod.Menus._top.st.tab');
    await btn('RB'); const tabB = await ev(h, 'return SH.mod.Menus._top.st.tab');
    await btn('LB'); const tabC = await ev(h, 'return SH.mod.Menus._top.st.tab');       // back to WEAPONS (the box cutter, the bar)
    if (tabC !== 1) { await ev(h, "SH.mod.Menus._top.st.tab = 1; return 1"); }
    const sel0 = await ev(h, 'return SH.mod.Menus._top.st.sel'), nList = await ev(h, 'return SH.mod.Menus._top.st.list.length');
    await btn('RIGHT'); const sel1 = await ev(h, 'return SH.mod.Menus._top.st.sel');
    await btn('A');                                                        // the command list (USE / EQUIP / EXAMINE …)
    const cmds = await ev(h, "const t = SH.mod.Menus._top; if (!t.st.cmd) return null; const L = t.st.cmd.list; const i = L.items.findIndex((x) => x.label === 'EXAMINE'); return { items: L.items.map((x) => x.label), i, cur: L.i }");
    if (cmds) {
      await ev(h, 'await SH.advance(0.2); return 1');
      for (let k = 0; k < 6 && (await ev(h, 'return SH.mod.Menus._top.st.cmd ? SH.mod.Menus._top.st.cmd.list.i : -1')) !== cmds.i; k++) await btn('DOWN');
      await btn('A'); await ev(h, 'await SH.advance(0.5); return 1');
    }
    const yawEx = await ev(h, `const ex = SH.mod.Menus._top.st.ex; if (!ex) return null; const y0 = ex.yaw; __axes([0, 0, 1, 0]); await SH.advance(0.6); __axes([0, 0, 0, 0]); await SH.advance(0.2); return +(ex.yaw - y0).toFixed(2)`);
    for (let k = 0; k < 4 && (await ev(h, 'return SH.mod.Menus.isOpen()')); k++) { await btn('B'); await ev(h, 'await SH.advance(0.4); return 1'); }
    const ivc1 = await closed();
    await btn('R3'); const iv2 = await ready('items'); await btn('B'); const ivc2 = await closed();
    await btn('DOWN'); const iv3 = await ready('items'); await btn('B'); const ivc3 = await closed();
    ok(iv1 && iv2 && iv3 && ivc1 && ivc2 && ivc3, 'RB, R3 and D-pad down open the inventory, B closes it', `RB ${iv1}/${ivc1}, R3 ${iv2}/${ivc2}, D-pad down ${iv3}/${ivc3}`);
    ok(tabB !== tabA && tabC === tabA, 'RB / LB change the inventory tab', `${tabA} → RB ${tabB} → LB ${tabC}`);
    ok(nList < 2 || sel1 !== sel0, 'D-pad right moves along the items', `${sel0} → ${sel1} of ${nList}`);
    ok(yawEx !== null && Math.abs(yawEx) > 0.3, 'the right stick turns the examined model', `yaw change ${yawEx}`);
    // prompts name the pad's buttons
    const lbl = await ev(h, "SH.mod.UI.prompt('Hold {interact}: cut it free.', { id: 'padtest', force: true, dur: 5 }); await SH.advance(0.6); const t = [...document.querySelectorAll('#ui .ui-prompts *')].map((e) => e.textContent).join(' '); SH.mod.UI.prompt(null, { id: 'padtest' }); return { dev: SH.mod.Input.lastDevice, text: t.slice(0, 60) }");
    ok(lbl.dev === 'gamepad' && /Hold A/.test(lbl.text), 'prompts name the pad\'s buttons', JSON.stringify(lbl));
    // rumble: the phone's buzz and the heartbeat at Danger
    const rb = await ev(h, "const n0 = __pad.rumbles; SH.mod.Snd.play('vibrate'); await SH.wait(0.9); const n1 = __pad.rumbles; SH.S.health = 20; await SH.advance(1.5); await SH.wait(1.6); const n2 = __pad.rumbles; SH.S.health = 100; await SH.advance(1); return { buzz: n1 - n0, heart: n2 - n1 }");
    ok(rb.buzz >= 1 && rb.heart >= 1, 'rumble reaches the pad: the phone buzz and the heartbeat at Danger', JSON.stringify(rb));
  } catch (e) { bad('threw: ' + String(e.message).split('\n').slice(0, 2).join(' ')); }
  for (const n of notes) console.log('  ' + n);
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); bad('page errors'); }
  report('gamepad (§1, §3): movement, interact, menus, pause / map / phone / inventory on a standard pad', !notes.some((n) => n.startsWith('BUG')), `${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
