// ==== engine/15_debug.js — Debug: the backtick overlay, chapter select, presets, camera-volume check, window.SH ====
// ARCHITECTURE §2 / §14 · spec §4 (debug overlay: room and camera id, F and A, fate flags, chapter select, noclip,
// "show camera volumes"; presets that force each ending), §14 (acceptance: the debug volume check passes everywhere).
//
// The overlay (backtick; left in the shipping build, spec §4) is a small DOM panel inside #ui above the film grain:
//   status — mode, room / camera id, Aidan's position and health, F / A, the six fate flags + chaseHits, Outage, the
//            running script, fps, world draw calls / triangles / lights.
//   CHAPTER — 0…8 (a fresh state + CHAPTERS[n].debugState(S), then Game.startChapter(n) with its card) and TEST ROOM.
//   TOOLS   — NOCLIP (Player.noclip), CAMERA VOLUMES (Cam.debugDraw with the Cam.check problems of the current room,
//             listed underneath), OUTAGE (instant world swap), HEAL.
//   ENDING  — presets that force F / A and the fate flags (or the playthrough + stickers for Yes) so that
//             Game.endingFor(S) gives CONNECTED / OUT OF COVERAGE / FOLLOW UP TOMORROW / YES; PLAY ENDING runs
//             Game.ending(Game.endingFor(S)).
// The panel takes pointer events (Input ignores clicks inside #ui) and never pauses the game.
//
// window.SH (contract §14): ready, S, newGame(opts), chapter(n), goto(room, entry), advance(sec), skip(), choose(i),
//   press(action, sec), teleport(x, z), camCheck(roomId|'*'), rooms(), run(fn), errors, fps, mode, screenshot().
// CONTRACT+: SH.state() → a one-line summary object {mode, room, cam, pos, yaw, health, F, A, outage, script, menu},
//   SH.debug(on) (toggle the overlay), SH.preset(name) (apply an ending preset), SH.ending(name) (Game.ending),
//   SH.wait(sec) (real seconds, rendering), SH.until(fn, sec) (poll a predicate while the game runs), SH.menu(name, o)
//   (Menus.open without awaiting), SH.nav(action) (Menus.nav), SH.testRoom().
// SH.advance(sec) runs Game.tick(1/30, false) repeatedly, yielding a macrotask between ticks so script continuations
// (promise chains) run exactly as they would between frames; the requestAnimationFrame loop is suspended meanwhile.
const Debug = (() => {
  const FATE = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukaSaved', 'lukeSaved', 'acceptedDeal'];
  const STICKERS = Array.from({ length: 12 }, (_, i) => 'sticker' + String(i + 1).padStart(2, '0'));
  const PRESETS = {
    connected: { label: 'CONNECTED', apply(s) { s.F = 40; s.A = 6; Object.assign(s.flags, { waiSaved: true, chaseSaved: true, chloeSaved: true, lukaSaved: true, lukeSaved: true, acceptedDeal: false }); } },
    coverage: { label: 'OUT OF COVERAGE', apply(s) { s.F = 22; s.A = 12; Object.assign(s.flags, { waiSaved: true, chaseSaved: false, chloeSaved: true, lukaSaved: false, lukeSaved: false, acceptedDeal: false }); } },
    tomorrow: { label: 'FOLLOW UP TOMORROW', apply(s) { s.F = 8; s.A = 24; Object.assign(s.flags, { waiSaved: false, chaseSaved: false, chloeSaved: false, lukaSaved: false, lukeSaved: false, acceptedDeal: false }); } },
    yes: { label: 'YES', apply(s) { s.playthrough = Math.max(2, s.playthrough || 1); s.ngPlus = true; s.stickers = s.stickers || {}; for (const id of STICKERS) s.stickers[id] = true; s.F = 30; s.A = 10; } },
  };
  let el = null, on = false, statusEl = null, camEl = null, endEl = null, btn = {};
  let camOn = false, lastPaint = 0, lastProblems = null, lastProblemRoom = null;
  const errors = window.SH && Array.isArray(window.SH.errors) ? window.SH.errors : [];
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  const r2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

  // ---------------------------------------------------------------------------------------------------------------
  // Overlay DOM
  // ---------------------------------------------------------------------------------------------------------------
  const CSS = `
  .dbg{position:absolute;left:10px;top:10px;z-index:9500;width:344px;max-height:calc(100% - 20px);overflow:auto;pointer-events:auto;
    background:rgba(4,7,7,.86);border-left:2px solid #1f6f6a;color:#c9d3d0;font:11px/1.45 'Courier New',Courier,monospace;padding:8px 10px 10px;
    display:none;user-select:text;-webkit-user-select:text;scrollbar-width:thin}
  .dbg.on{display:block}
  .dbg h4{margin:9px 0 4px;font:bold 10px 'Courier New',monospace;letter-spacing:.18em;color:#e8c21a;font-weight:bold}
  .dbg .st div{white-space:pre;overflow:hidden;text-overflow:ellipsis}
  .dbg .st b{color:#eef3f1;font-weight:normal}
  .dbg .f1{color:#6fd3a0}.dbg .f0{color:#6a7270}.dbg .warn{color:#ff6a5c}
  .dbg .row{display:flex;flex-wrap:wrap;gap:4px}
  .dbg button{font:10px 'Courier New',monospace;color:#c9d3d0;background:#0d1616;border:1px solid #2c4644;padding:3px 6px;cursor:pointer;
    letter-spacing:.06em;border-radius:0}
  .dbg button:hover{border-color:#1f9d94;color:#fff}
  .dbg button.on{background:#1f6f6a;color:#fff;border-color:#35b3a8}
  .dbg button:disabled{opacity:.35;cursor:default}
  .dbg .cam{max-height:120px;overflow:auto;color:#9aa6a3;white-space:pre}
  .dbg .hint{color:#6a7270;margin-top:6px}`;
  function mk(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function button(parent, label, fn, key) {
    const b = mk('button', '', parent, label);
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); try { const r = fn(e); if (r && r.catch) r.catch((err) => console.error('[Debug]', err)); } catch (err) { console.error('[Debug]', err); } paint(true); });
    if (key) btn[key] = b;
    return b;
  }
  function build() {
    if (el) return;
    if (!document.getElementById('dbg-style')) { const st = document.createElement('style'); st.id = 'dbg-style'; st.textContent = CSS; document.head.appendChild(st); }
    const host = document.getElementById('ui') || document.body;
    el = mk('div', 'dbg', host);
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    mk('h4', '', el, 'SIGNAL HILL — DEBUG');
    statusEl = mk('div', 'st', el);
    mk('h4', '', el, 'CHAPTER');
    const chRow = mk('div', 'row', el);
    for (let n = 0; n <= 8; n++) button(chRow, String(n), () => chapter(n, { card: true }), 'ch' + n);
    button(chRow, 'TEST ROOM', () => testRoom(), 'test');
    mk('h4', '', el, 'TOOLS');
    const tRow = mk('div', 'row', el);
    button(tRow, 'NOCLIP', () => { Player.noclip = !Player.noclip; }, 'noclip');
    button(tRow, 'CAMERA VOLUMES', () => showVolumes(!camOn), 'cam');
    button(tRow, 'RE-CHECK', () => showVolumes(true, true), 'recheck');
    button(tRow, 'OUTAGE', () => { if (World.room) World.setOutage(!S.outage); }, 'outage');
    button(tRow, 'OUTAGE ⟳', () => { if (World.room) World.outageTransition(!S.outage); }, 'outageT');
    button(tRow, 'HEAL', () => { Player.heal(100); }, 'heal');
    button(tRow, 'SKIP', () => { skip(); }, 'skip');
    camEl = mk('div', 'cam', el);
    mk('h4', '', el, 'ENDING PRESETS');
    const eRow = mk('div', 'row', el);
    for (const k of Object.keys(PRESETS)) button(eRow, PRESETS[k].label, () => preset(k), 'p_' + k);
    const e2 = mk('div', 'row', el); e2.style.marginTop = '4px';
    button(e2, 'PLAY ENDING ▶', () => runEnding(), 'play');
    endEl = mk('div', 'hint', el);
    mk('div', 'hint', el, '` toggles this panel. Presets set F, A and the fate flags; PLAY ENDING runs Game.ending(Game.endingFor(S)).');
  }
  function toggle(v = !on) {
    build();
    on = !!v;
    el.classList.toggle('on', on);
    if (on) paint(true);
    return on;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------------------------------------------
  function flagHtml(k) { const v = S.flags && S.flags[k]; return `<span class="${v ? 'f1' : 'f0'}">${k.replace('Saved', '').replace('acceptedDeal', 'deal')}${v ? '✓' : '·'}</span>`; }
  function paint(force) {
    if (!on || !el) return;
    const now = performance.now();
    if (!force && now - lastPaint < 250) return;
    lastPaint = now;
    const st = safe(() => Render.stats(), {}) || {};
    const cam = safe(() => Cam.current, null);
    const p = safe(() => Player.pos, null);
    const script = safe(() => Script.active, null);
    const menu = safe(() => Menus.current, null);
    const mode = safe(() => Game.mode, '?');
    const lines = [
      `mode   <b>${mode}</b>${menu ? '  menu <b>' + menu + '</b>' : ''}${script ? '  script <b>' + script + '</b>' : ''}`,
      `room   <b>${safe(() => World.room, null) || '—'}</b>  ch <b>${S.chapter}</b>`,
      `camera <b>${cam ? cam.id : Cam.isScripted ? '(scripted)' : '—'}</b>${cam ? ' ' + cam.type : ''}`,
      p ? `pos    <b>${r2(p.x)} ${r2(p.y)} ${r2(p.z)}</b>  yaw <b>${Math.round(safe(() => Player.yawDeg, 0))}°</b>` : 'pos    —',
      `health <b>${Math.round(S.health)}</b> ${safe(() => Player.status(), '')}   outage <b>${S.outage ? 'ON' : 'off'}</b>`,
      `F <b>${S.F}</b>  A <b>${S.A}</b>  chaseHits <b>${S.chaseHits}</b>  play <b>${S.playthrough}</b>${S.ngPlus ? ' NG+' : ''}`,
      `${FATE.map(flagHtml).join(' ')}`,
      `fps <b>${Math.round(safe(() => Game.fps, 0))}</b>  calls <b>${st.calls ?? '?'}</b>  tris <b>${st.triangles ?? '?'}</b>  lights <b>${st.lights ?? '?'}</b>`,
      `ending now → <b>${safe(() => Game.endingFor(S), '?')}</b>   errors <b class="${errors.length ? 'warn' : ''}">${errors.length}</b>`,
    ];
    statusEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    for (let n = 0; n <= 8; n++) if (btn['ch' + n]) btn['ch' + n].disabled = !CHAPTERS[n];
    if (btn.test) btn.test.disabled = !ROOMS.test_room;
    if (btn.noclip) btn.noclip.classList.toggle('on', !!safe(() => Player.noclip, false));
    if (btn.cam) btn.cam.classList.toggle('on', camOn);
    if (btn.outage) btn.outage.classList.toggle('on', !!S.outage);
    if (camOn && lastProblemRoom !== safe(() => World.room, null)) showVolumes(true, true);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------------------------------------------
  function showVolumes(v, recheck) {
    camOn = !!v;
    if (!camOn) { Cam.debugDraw(false); if (camEl) camEl.textContent = ''; return null; }
    const room = World.room;
    let problems = [];
    if (room && (recheck || lastProblemRoom !== room || !lastProblems)) {
      try { problems = Cam.check(room); } catch (e) { console.error('[Debug] Cam.check', e); problems = []; }
      lastProblems = problems; lastProblemRoom = room;
    } else problems = lastProblems || [];
    Cam.debugDraw(true, problems);
    if (camEl) {
      const by = {};
      for (const q of problems) { const k = `${q.cam || '(none)'} ${q.why}${q.world && q.world !== 'fog' ? ' [' + q.world + ']' : ''}`; by[k] = (by[k] || 0) + 1; }
      camEl.textContent = room ? `Cam.check(${room}): ${problems.length} problem${problems.length === 1 ? '' : 's'}` + Object.entries(by).map(([k, n]) => `\n  ${n} × ${k}`).join('')
        + problems.slice(0, 12).map((q) => `\n   ${q.why} ${q.cam || '-'} @ ${q.x},${q.z}${q.h !== undefined ? ' h' + q.h : ''}`).join('') : 'no room loaded';
    }
    return problems;
  }
  function preset(name) {
    const p = PRESETS[name];
    if (!p) return null;
    p.apply(S);
    // the in-room parts of the endings (played by Chapter 8) count as unseen again so Game.ending plays them
    for (const id of ['E-C1', 'E-OC0', 'E-FT0']) if (S.done) delete S.done['cs:' + id];
    const e = Game.endingFor(S);
    if (endEl) endEl.textContent = `preset ${p.label} → Game.endingFor(S) = ${e}`;
    return e;
  }
  function runEnding(name) { return Game.ending(name || Game.endingFor(S)); }
  function skip() { let r = false; try { r = Script.skip(); } catch (e) { /* no script */ } try { UI.skip(); } catch (e) { /* no ui */ } return r; }

  // chapter select: a fresh state (keeping the difficulty and playthrough), the chapter's debugState, then the start
  async function chapter(n, o = {}) {
    n = Number(n);
    if (!CHAPTERS[n]) { console.warn(`[Debug] no chapter ${n}`); return false; }
    return Game.debugStart(n, o);
  }
  async function testRoom() {
    if (!ROOMS.test_room) { console.warn('[Debug] no test_room'); return false; }
    return Game.debugRoom('test_room', 'start');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Per frame (after Render.render)
  // ---------------------------------------------------------------------------------------------------------------
  function update() {
    let pressed = false;
    try { pressed = Input.pressed('debug'); } catch (e) { /* no input */ }
    if (pressed) toggle();
    paint(false);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // window.SH — the test API (contract §14)
  // ---------------------------------------------------------------------------------------------------------------
  const macro = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); res(); }; ch.port2.postMessage(0); });
  function state() {
    const cam = safe(() => Cam.current, null), p = safe(() => Player.pos, null);
    return {
      mode: safe(() => Game.mode, null), room: safe(() => World.room, null), cam: cam ? cam.id : null,
      pos: p ? [+r2(p.x), +r2(p.y), +r2(p.z)] : null, yaw: Math.round(safe(() => Player.yawDeg, 0)), health: S.health, F: S.F, A: S.A,
      outage: !!S.outage, chapter: S.chapter, script: safe(() => Script.active, null), menu: safe(() => Menus.current, null),
      cutscene: safe(() => Script.cutscene, false), letterbox: safe(() => UI.letterboxed, false), fade: safe(() => UI.faded, 0),
    };
  }
  function installSH() {
    const SH = window.SH = window.SH || {};
    SH.errors = errors;
    if (SH.ready === undefined) SH.ready = false;
    Object.defineProperty(SH, 'S', { get: () => S, configurable: true, enumerable: true });
    Object.defineProperty(SH, 'fps', { get: () => safe(() => Math.round(Game.fps * 10) / 10, 0), configurable: true, enumerable: true });
    Object.defineProperty(SH, 'mode', { get: () => safe(() => Game.mode, null), configurable: true, enumerable: true });
    Object.assign(SH, {
      newGame: (o = {}) => Game.newGame(o),
      chapter: (n, o = {}) => chapter(n, { card: false, ...o }),
      goto: (room, entry = null) => Game.debugRoom(room, entry),
      async advance(sec = 1) {
        const n = Math.max(1, Math.round(Number(sec) * 30));
        Game.manual(true);
        try {
          for (let i = 0; i < n; i++) { Game.tick(1 / 30, false); await macro(); }
        } finally { Game.manual(false); }
        return state();
      },
      skip,
      choose: (i) => { try { return Script.choose(i); } catch (e) { return false; } },
      press: (action, sec = 0) => { Input.inject(action, sec); return true; },
      teleport: (x, z, yawDeg) => { Player.teleport(x, z, yawDeg); return state(); },
      camCheck: (roomId) => Cam.check(roomId || World.room),
      rooms: () => Object.keys(ROOMS),
      run: (fn, o = {}) => Script.run(fn, { control: true, name: 'SH.run', persist: true, ...o }),
      screenshot: () => Render.capture(),
      // CONTRACT+ helpers
      state, debug: (v) => toggle(v), preset, ending: (name) => runEnding(name), testRoom,
      wait: (sec) => new Promise((r) => setTimeout(r, sec * 1000)),
      async until(fn, sec = 10) { const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { if (safe(fn, false)) return true; await new Promise((r) => setTimeout(r, 50)); } return false; },
      menu: (name, o) => { Menus.open(name, o); return true; },
      nav: (a) => Menus.nav(a),
    });
    return SH;
  }

  function init() { build(); installSH(); return api; }
  installSH();
  const api = {
    init, update, toggle, paint, showVolumes, preset, chapter, testRoom, state, skip, PRESETS, STICKERS,
    get on() { return on; },
    get problems() { return lastProblems; },
  };
  return api;
})();
