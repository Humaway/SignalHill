// ==== engine/01_input.js — keyboard, mouse, gamepad, action mapping, rumble (ARCHITECTURE §2, spec §3) ====
//
// Everything is polled: Input.update() runs once per frame (first in the main loop) and turns the raw device
// state into per-action edges. Actions are driven by *sources* ('k:KeyE', 'm:0', 'p:0', 'ls:up', 'i:interact',
// 'x:skip'); consume(a) swallows the sources currently driving `a` until they are released, so one physical
// press can never trigger two things in the same frame (a menu closing on E and the player interacting).
//
// Keyboard (physical key positions, e.code):
//   WASD / arrows move (and navigate menus: up/down/left/right), Shift run, F torch, E interact+confirm,
//   Enter confirm, Space or right mouse ready, left click attack, Q quick-turn+decline, Tab inventory, M map,
//   C phone, Esc pause+cancel (Backspace also cancels), hold Esc 1 s = skip, ` debug.
//   In menu context the right mouse button means cancel instead of ready.
// Gamepad (standard mapping):
//   left stick move (and menu nav), A interact+confirm, B quick-turn+cancel+decline, X attack, Y torch,
//   LT ready, RT (or L3) run, Start pause (hold 1 s = skip), Select/Back/View map, D-pad navigates menus;
//   in play the D-pad also gives phone (up) and inventory (down), LB is a second phone button and
//   RB / R3 open the inventory. (On most pads "View" *is* Select/Back, so the spec's "Select map / View
//   inventory" cannot both be honoured on button 8 — map keeps Select, inventory moves to RB, R3 and D-pad down.)
//   Right stick feeds drag() for examine rotation.
// Injected actions (Input.inject / SH.press): a new injection while the last one still holds the action releases it
// for one update first (a fresh press edge); injected up/down/left/right also drive Input.move().
// Input clock: every hold time here (injected holds, heldTime, the 1 s skip hold, menu key repeat) runs on Input's own
// clock. In the requestAnimationFrame loop it follows real time; while Game.manual is on (SH.advance) Game.tick passes
// its fixed tick (1/30 s) to Input.update(dt), so the clock follows GAME time — SH.press('ready', 1) holds for one game
// second, and a real key held across SH.advance(1.2) counts as held 1.2 s (the skip hold, E holds) whatever the
// machine's speed.
const Input = (() => {
  const ACTIONS = ['up', 'down', 'left', 'right', 'run', 'torch', 'interact', 'confirm', 'cancel', 'ready', 'attack',
    'turn', 'decline', 'inventory', 'map', 'phone', 'pause', 'skip', 'debug'];
  const NAV = { up: 1, down: 1, left: 1, right: 1 };
  const REPEAT_DELAY = 0.42, REPEAT_RATE = 0.11; // menu auto-repeat for held nav directions
  const SKIP_HOLD = 1.0;
  const STICK_DZ = 0.22, NAV_ON = 0.55, NAV_OFF = 0.35, TRIGGER_ON = 0.3;

  // ---- bindings: source id → actions -----------------------------------------------------------------
  const KEYMAP = {
    KeyW: ['up'], ArrowUp: ['up'], KeyS: ['down'], ArrowDown: ['down'],
    KeyA: ['left'], ArrowLeft: ['left'], KeyD: ['right'], ArrowRight: ['right'],
    ShiftLeft: ['run'], ShiftRight: ['run'],
    KeyF: ['torch'],
    KeyE: ['interact', 'confirm'],
    Enter: ['confirm'], NumpadEnter: ['confirm'],
    Space: ['ready'],
    KeyQ: ['turn', 'decline'],
    Tab: ['inventory'],
    KeyM: ['map'],
    KeyC: ['phone'],
    Escape: ['pause', 'cancel'],
    Backspace: ['cancel'],
    Backquote: ['debug'],
  };
  const MOVE_KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  // keys whose browser default must never happen while playing (focus change, scroll, quick-find, back-nav …)
  const PREVENT = new Set([...Object.keys(KEYMAP), 'Quote', 'Slash', 'PageUp', 'PageDown', 'Home', 'End']);
  const PAD = {
    0: ['interact', 'confirm'], 1: ['turn', 'cancel', 'decline'], 2: ['attack'], 3: ['torch'],
    4: ['phone'], 5: ['inventory'], 6: ['ready'], 7: ['run'], 8: ['map'], 9: ['pause'], 10: ['run'], 11: ['inventory'],
    12: ['up', 'phone'], 13: ['down', 'inventory'], 14: ['left'], 15: ['right'],
  };
  const PAD_MENU = { 12: ['up'], 13: ['down'] }; // the D-pad only navigates while a menu is open
  const MOUSE = { 0: ['attack'], 2: ['ready'] };
  const MOUSE_MENU = { 0: ['attack'], 2: ['cancel'] };
  const SKIP_SOURCES = ['k:Escape', 'p:9'];

  const LABELS = {
    keyboard: { up: 'W', down: 'S', left: 'A', right: 'D', run: 'SHIFT', torch: 'F', interact: 'E', confirm: 'E', cancel: 'ESC',
      ready: 'RIGHT MOUSE', attack: 'LEFT CLICK', turn: 'Q', decline: 'Q', inventory: 'TAB', map: 'M', phone: 'C', pause: 'ESC',
      skip: 'HOLD ESC', debug: '`' },
    gamepad: { up: 'D-PAD UP', down: 'D-PAD DOWN', left: 'D-PAD LEFT', right: 'D-PAD RIGHT', run: 'RT', torch: 'Y', interact: 'A',
      confirm: 'A', cancel: 'B', ready: 'LT', attack: 'X', turn: 'B', decline: 'B', inventory: 'RB', map: 'SELECT', phone: 'D-PAD UP',
      pause: 'START', skip: 'HOLD START', debug: '' },
  };

  // ---- raw device state --------------------------------------------------------------------------------
  const keys = new Set();        // codes currently held
  const tapped = new Set();      // codes pressed since the last update (so a tap shorter than a frame still counts)
  const mouse = new Set();       // mouse buttons held
  const mouseTapped = new Set();
  const injected = new Map();    // action → { until (Input clock), first } (test/debug injection)
  const consumed = new Set();    // source ids swallowed until released
  const since = new Map();       // source id → Input-clock time it went down
  let typed = [], typedBuf = [];
  let keyEdges = new Set(), keyEdgesBuf = new Set();
  let anyBuf = false, anyNow = false;
  let dragAcc = { dx: 0, dy: 0 }, dragNow = { dx: 0, dy: 0 };
  let wheelAcc = 0, wheelNow = 0;
  const pointer = { x: 0, y: 0, inside: false };
  let padState = { buttons: [], axes: [0, 0, 0, 0], connected: false, id: '' };
  let padPrev = [];
  const lsNav = { up: false, down: false, left: false, right: false };
  let active = new Set(), prevActive = new Set();
  let lastT = 0, dt = 0, nowT = 0, clockT = 0;   // lastT: real time of the last update; clockT: the Input clock
  let inited = false;
  let menuForced = 0;
  let canvasEl = null;

  const st = {};
  for (const a of ACTIONS) st[a] = { down: false, pressed: false, released: false, t0: 0, lastHold: 0, relHold: 0, repeatAt: 0 };

  const api = {
    lastDevice: 'keyboard',
    pointer,
    init, update, down, held, pressed, released, heldTime, consume, move, anyPressed, drag, wheel, rumble, heartbeat,
    releasedAfter, label, inject, releaseAll, key, keyPressed, typedChars, skipProgress, setMenu, pad, isMenu, actions: ACTIONS,
    // CONTRACT+: Input.frame — counts updates (a consumer ticked more than once per update, like UI's stall fallback,
    // uses it to act on each press / typed character only once); Input.clock — the Input clock (s, see the header)
    get frame() { return updates; },
    get clock() { return clockT; },
  };
  let updates = 0;

  const realNow = () => performance.now() / 1000;
  const isTextTarget = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  // ---- event handlers ---------------------------------------------------------------------------------
  function onKeyDown(e) {
    if (isTextTarget(e.target)) return;
    const code = e.code || e.key;
    const modifier = e.ctrlKey || e.metaKey || e.altKey;
    if (modifier && !/^(Shift|Control|Alt|Meta)/.test(code)) return; // leave browser shortcuts alone
    if (PREVENT.has(code)) e.preventDefault();
    api.lastDevice = 'keyboard';
    if (!/^(Control|Alt|Meta|OS)/.test(code)) anyBuf = true;
    if (!e.repeat) {
      if (!keys.has(code)) keyEdgesBuf.add(code);
      keys.add(code); tapped.add(code);
    }
    if (e.key && e.key.length === 1) typedBuf.push(e.key);
    else if (e.key === 'Backspace' || e.key === 'Enter') typedBuf.push(e.key);
  }
  function onKeyUp(e) {
    const code = e.code || e.key;
    keys.delete(code);
    if (PREVENT.has(code) && !isTextTarget(e.target)) e.preventDefault();
  }
  // A click on an interactive overlay element (anything inside #ui that takes pointer events) is the UI's
  // business: it still counts for anyPressed() but never becomes attack/ready.
  const isUiTarget = (t) => !!t && t !== canvasEl && t.id !== 'ui' && typeof t.closest === 'function' && !!t.closest('#ui');
  function onMouseDown(e) {
    if (isTextTarget(e.target)) return;
    api.lastDevice = 'mouse';
    anyBuf = true;
    if (isUiTarget(e.target)) return;
    mouse.add(e.button); mouseTapped.add(e.button);
    if (e.button === 1 || e.button === 2) e.preventDefault();
  }
  function onMouseUp(e) { mouse.delete(e.button); }
  function onMouseMove(e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    if (mouse.size) {
      dragAcc.dx += e.movementX || 0; dragAcc.dy += e.movementY || 0;
      api.lastDevice = 'mouse';
    }
  }
  function onWheel(e) {
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= 400;
    wheelAcc += d / 100;
  }
  function onContext(e) { e.preventDefault(); }
  function onBlur() { releaseAll(); }
  function onVisibility() { if (document.hidden) releaseAll(); }
  function onPadConnect(e) { if (e && e.gamepad) api.lastDevice = 'gamepad'; }

  function init(canvas) {
    canvasEl = canvas || canvasEl;
    if (inited) return api;
    inited = true;
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mouseup', onMouseUp, { capture: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('gamepadconnected', onPadConnect);
    document.addEventListener('mouseleave', () => { pointer.inside = false; });
    lastT = realNow(); clockT = 0;
    return api;
  }

  // Focus loss: release everything so no key sticks down; held sources count as released next frame.
  function releaseAll() {
    keys.clear(); tapped.clear(); mouse.clear(); mouseTapped.clear(); injected.clear();
    dragAcc = { dx: 0, dy: 0 };
  }

  // ---- gamepad polling ------------------------------------------------------------------------------------
  function pollPads() {
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { pads = []; }
    const buttons = [], axes = [0, 0, 0, 0];
    let connected = false, id = '';
    for (const p of pads) {
      if (!p || !p.connected) continue;
      connected = true; if (!id) id = p.id;
      p.buttons.forEach((b, i) => {
        const v = typeof b === 'object' ? b.value : b;
        const on = typeof b === 'object' ? (i === 6 || i === 7 ? v > TRIGGER_ON : (b.pressed || v > 0.5)) : v > 0.5;
        if (on) buttons[i] = true;
      });
      for (let i = 0; i < 4 && i < p.axes.length; i++) if (Math.abs(p.axes[i]) > Math.abs(axes[i])) axes[i] = p.axes[i];
    }
    padState = { buttons, axes, connected, id };
  }
  function stickVec(x, y) {
    const m = Math.hypot(x, y);
    if (m < STICK_DZ) return { x: 0, y: 0, m: 0 };
    const s = Math.min(1, (m - STICK_DZ) / (1 - STICK_DZ));
    return { x: (x / m) * s, y: (y / m) * s, m: s };
  }

  // ---- per-frame update -----------------------------------------------------------------------------------
  function isMenu() {
    if (menuForced > 0) return true;
    try { return typeof Menus !== 'undefined' && !!Menus.isOpen && !!Menus.isOpen(); } catch (e) { return false; }
  }

  // update(tickDt?) — tickDt (seconds) advances the Input clock by a game tick instead of real time (Game.tick passes
  // it while Game.manual is on, i.e. under SH.advance); without it the clock follows real time (clamped to 0.1 s).
  function update(tickDt) {
    if (!inited) init();
    const real = realNow();
    const realDt = Math.min(0.1, Math.max(0, real - lastT)); lastT = real;
    dt = tickDt !== undefined && tickDt !== null && tickDt >= 0 ? Math.min(0.1, +tickDt || 0) : realDt;
    clockT += dt; updates++;
    const t = clockT; nowT = t;
    pollPads();
    const menu = isMenu();

    // gather active sources this frame
    prevActive = active;
    active = new Set();
    for (const c of keys) active.add('k:' + c);
    for (const c of tapped) active.add('k:' + c);
    for (const b of mouse) active.add('m:' + b);
    for (const b of mouseTapped) active.add('m:' + b);
    padState.buttons.forEach((on, i) => { if (on) active.add('p:' + i); });
    // left stick → digital nav with hysteresis
    const lx = padState.axes[0] || 0, ly = padState.axes[1] || 0;
    lsNav.up = ly < -(lsNav.up ? NAV_OFF : NAV_ON);
    lsNav.down = ly > (lsNav.down ? NAV_OFF : NAV_ON);
    lsNav.left = lx < -(lsNav.left ? NAV_OFF : NAV_ON);
    lsNav.right = lx > (lsNav.right ? NAV_OFF : NAV_ON);
    for (const d in lsNav) if (lsNav[d]) active.add('ls:' + d);
    // injected: always down for the first update after inject(), then while the Input clock < until. A new injection that
    // lands while the previous one still holds the action first releases it for one update (a fresh press edge).
    for (const [a, e] of injected) {
      if (e.gap) { e.gap = false; continue; }
      if (e.first || t < e.until) { active.add('i:' + a); e.first = false; } else injected.delete(a);
    }

    // track when each source went down; newly pressed pad buttons count for anyPressed / lastDevice
    for (const s of active) if (!since.has(s)) since.set(s, t);
    for (const s of [...since.keys()]) if (!active.has(s)) since.delete(s);
    let anyPad = false;
    padState.buttons.forEach((on, i) => { if (on && !padPrev[i]) { anyPad = true; api.lastDevice = 'gamepad'; } });
    padPrev = padState.buttons.slice();
    if (padState.connected && (Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5 || Math.abs(padState.axes[2] || 0) > 0.5 || Math.abs(padState.axes[3] || 0) > 0.5)) api.lastDevice = 'gamepad';

    // derived: skip = Esc / Start held ≥ 1 s
    for (const s of SKIP_SOURCES) if (active.has(s) && t - since.get(s) >= SKIP_HOLD) active.add('x:skip');

    // released sources stop being consumed
    for (const s of [...consumed]) if (!active.has(s)) consumed.delete(s);

    // action states
    const raw = {};
    for (const a of ACTIONS) raw[a] = false;
    const bind = (src, list) => { if (!list || consumed.has(src)) return; for (const a of list) raw[a] = true; };
    for (const s of active) {
      const i = s.indexOf(':'), kind = s.slice(0, i), id = s.slice(i + 1);
      if (kind === 'k') bind(s, KEYMAP[id]);
      else if (kind === 'm') bind(s, (menu ? MOUSE_MENU : MOUSE)[id]);
      else if (kind === 'p') bind(s, (menu && PAD_MENU[id]) || PAD[id]);
      else if (kind === 'ls') bind(s, [id]);
      else if (kind === 'i') bind(s, [id]);
      else if (kind === 'x') bind(s, [id]);
    }
    for (const a of ACTIONS) {
      const o = st[a], was = o.down;
      o.down = raw[a];
      o.pressed = o.down && !was;
      o.released = !o.down && was;
      o.relHold = 0;
      if (o.pressed) { o.t0 = t; o.repeatAt = t + REPEAT_DELAY; }
      if (o.released) { o.relHold = t - o.t0; o.lastHold = o.relHold; }
      if (NAV[a] && o.down && !o.pressed && t >= o.repeatAt) { o.pressed = true; o.repeatAt = t + REPEAT_RATE; }
    }

    tapped.clear(); mouseTapped.clear();
    typed = typedBuf; typedBuf = [];
    keyEdges = keyEdgesBuf; keyEdgesBuf = new Set();
    anyNow = anyPad || anyBuf; anyBuf = false;

    // drag: mouse delta while a button is held + right stick (examine rotation), in px
    const rs = stickVec(padState.axes[2] || 0, padState.axes[3] || 0);
    dragNow = { dx: dragAcc.dx + rs.x * 520 * dt, dy: dragAcc.dy + rs.y * 520 * dt };
    dragAcc = { dx: 0, dy: 0 };
    wheelNow = wheelAcc; wheelAcc = 0;

    tickHeart(real);                                   // (rumble is physical: real time)
  }

  // ---- queries -----------------------------------------------------------------------------------------------
  const S_ = (a) => st[a] || null;
  function down(a) { const o = S_(a); return !!o && o.down; }
  function pressed(a) { const o = S_(a); return !!o && o.pressed; }
  function released(a) { const o = S_(a); return !!o && o.released; }
  function heldTime(a) { const o = S_(a); return o && o.down ? Math.max(0, nowT - o.t0) : 0; }
  // CONTRACT+: Input.releasedAfter(a) → length (s) of the hold that ended this frame (0 if not released now); tap vs hold.
  function releasedAfter(a) { const o = S_(a); return o && o.released ? o.relHold : 0; }
  // CONTRACT+: Input.held(a) — a key / button / injection bound to `a` is physically held, even when its press was
  // consumed. For "hold E" mechanics that run while the player has control (Ch 4's "Hold him back"): the E press that
  // also used an interactable in reach, or dismissed a message, was consumed, so Input.down() stays false for the rest
  // of that hold — Input.held() still sees the key down.
  function held(a) {
    if (!S_(a)) return false;
    const menu = isMenu();
    for (const s of active) {
      const i = s.indexOf(':'), kind = s.slice(0, i), id = s.slice(i + 1);
      const list = kind === 'k' ? KEYMAP[id] : kind === 'm' ? (menu ? MOUSE_MENU : MOUSE)[id] : kind === 'p' ? ((menu && PAD_MENU[id]) || PAD[id]) : [id];
      if (list && list.includes(a)) return true;
    }
    return false;
  }
  // Swallow the press: every physical source currently driving `a` is ignored (for all actions) until released.
  function consume(a) {
    if (!S_(a)) return;
    const menu = isMenu();
    for (const s of active) {
      const i = s.indexOf(':'), kind = s.slice(0, i), id = s.slice(i + 1);
      let list = null;
      if (kind === 'k') list = KEYMAP[id];
      else if (kind === 'm') list = (menu ? MOUSE_MENU : MOUSE)[id];
      else if (kind === 'p') list = (menu && PAD_MENU[id]) || PAD[id];
      else list = [id];
      if (list && list.includes(a)) consumed.add(s); // (skip stays measurable: 'x:skip' is its own source)
    }
    // everything those sources drive goes quiet immediately (for modules later in this frame)
    const still = {};
    for (const s of active) {
      if (consumed.has(s)) continue;
      const i = s.indexOf(':'), kind = s.slice(0, i), id = s.slice(i + 1);
      const list = kind === 'k' ? KEYMAP[id] : kind === 'm' ? (menu ? MOUSE_MENU : MOUSE)[id] : kind === 'p' ? ((menu && PAD_MENU[id]) || PAD[id]) : [id];
      if (list) for (const x of list) still[x] = true;
    }
    for (const x of ACTIONS) if (!still[x] && st[x].down) { st[x].down = false; st[x].pressed = false; st[x].released = false; }
  }

  // Movement vector: x = right, y = forward, magnitude ≤ 1 (keyboard digital, stick with radial dead zone).
  const INJ_MOVE = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
  function move() {
    let kx = 0, ky = 0;
    for (const c in MOVE_KEYS) if (keys.has(c) && !consumed.has('k:' + c)) { kx += MOVE_KEYS[c][0]; ky += MOVE_KEYS[c][1]; }
    // injected directions (SH.press('up', sec)) walk like the keys
    for (const a in INJ_MOVE) if (active.has('i:' + a) && !consumed.has('i:' + a)) { kx += INJ_MOVE[a][0]; ky += INJ_MOVE[a][1]; }
    kx = Math.max(-1, Math.min(1, kx)); ky = Math.max(-1, Math.min(1, ky));
    const km = Math.hypot(kx, ky);
    if (km > 1) { kx /= km; ky /= km; }
    const s = stickVec(padState.axes[0] || 0, padState.axes[1] || 0);
    if (s.m > Math.min(1, km)) return { x: s.x, y: -s.y };
    return { x: kx, y: ky };
  }
  function anyPressed() { return anyNow; }
  function drag() { return { dx: dragNow.dx, dy: dragNow.dy }; }
  // CONTRACT+: Input.wheel() → mouse-wheel notches this frame (+ = toward the user / zoom out).
  function wheel() { return wheelNow; }
  // CONTRACT+: Input.key(code) raw physical key held (e.code, e.g. 'Digit4'); Input.keyPressed(code) pressed this frame;
  //            Input.typedChars() → characters typed this frame (keypads, map notes; 'Backspace'/'Enter' included).
  function key(code) { return keys.has(code); }
  function keyPressed(code) { return keyEdges.has(code); }
  function typedChars() { return typed.slice(); }
  // CONTRACT+: Input.skipProgress() → 0..1 while Esc/Start is held toward the 1 s cutscene skip.
  function skipProgress() {
    let best = 0;
    for (const s of SKIP_SOURCES) if (since.has(s) && active.has(s)) best = Math.max(best, (nowT - since.get(s)) / SKIP_HOLD);
    return Math.min(1, best);
  }
  // CONTRACT+: Input.inject(action, sec=0) — simulate the action held for `sec` seconds of the Input clock from the next
  //            update (at least one frame): real seconds in the live loop, GAME seconds under SH.advance (Game.manual).
  //            Used by SH.press and tests.
  function inject(a, sec = 0) {
    if (!S_(a)) return;
    const gap = injected.has(a) || active.has('i:' + a);              // still held from the last injection: release first
    // (the hold starts at the next update: until = the clock then + sec; `first` guarantees that update)
    injected.set(a, { until: clockT + Math.max(0, +sec || 0), first: true, gap, sec: Math.max(0, +sec || 0) });
  }
  // CONTRACT+: Input.setMenu(on) — force menu context (D-pad = nav only, right mouse = cancel) for overlays that
  //            are not Menus screens (UI.choice, UI.keypad …). Calls nest. Menus.isOpen() also counts automatically.
  function setMenu(on) { menuForced = Math.max(0, menuForced + (on ? 1 : -1)); }
  // CONTRACT+: Input.label(action) → 'E' / 'A' … for the current device (prompts).
  function label(a) { return (LABELS[api.lastDevice === 'gamepad' ? 'gamepad' : 'keyboard'] || {})[a] || a.toUpperCase(); }
  // CONTRACT+: Input.pad() → { connected, id, buttons[], axes[] } (last poll).
  function pad() { return padState; }

  // ---- rumble ------------------------------------------------------------------------------------------------------
  function rumble(strong = 0.5, weak = 0.5, ms = 200) {
    try {
      if (typeof META !== 'undefined' && META.options && META.options.vibration === false) return false;
      if (!navigator.getGamepads) return false;
      let any = false;
      for (const p of Array.from(navigator.getGamepads())) {
        if (!p || !p.connected) continue;
        const act = p.vibrationActuator;
        if (act && typeof act.playEffect === 'function') {
          const r = act.playEffect('dual-rumble', {
            startDelay: 0, duration: Math.max(1, ms | 0),
            strongMagnitude: Math.max(0, Math.min(1, strong)), weakMagnitude: Math.max(0, Math.min(1, weak)),
          });
          if (r && r.catch) r.catch(() => {});
          any = true;
        } else if (p.hapticActuators && p.hapticActuators[0] && p.hapticActuators[0].pulse) {
          const r = p.hapticActuators[0].pulse(Math.max(strong, weak), ms);
          if (r && r.catch) r.catch(() => {});
          any = true;
        }
      }
      return any;
    } catch (e) { return false; }
  }
  // Heartbeat rumble (spec §2A Options: "a heartbeat at Danger"): Input.heartbeat(true, bpm=78) / heartbeat(false).
  const heart = { on: false, bpm: 78, next: 0, dub: 0 };
  function heartbeat(on, bpm) {
    if (bpm) heart.bpm = bpm;
    if (on && !heart.on) heart.next = realNow();
    heart.on = !!on;
    return heart.on;
  }
  function tickHeart(t) {
    if (!heart.on || !padState.connected) return;
    if (t >= heart.next) {
      rumble(0.55, 0.3, 90);
      heart.dub = t + 0.2;
      heart.next = t + 60 / Math.max(30, heart.bpm);
    }
    if (heart.dub && t >= heart.dub) { rumble(0.3, 0.18, 80); heart.dub = 0; }
  }

  return api;
})();
