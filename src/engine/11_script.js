// ==== engine/11_script.js — Script: async script runner, cutscenes, the G API (ARCHITECTURE §11; spec §7, §2A, §4) ====
//
// Every piece of content logic is `async (G) => { … }`. Script.run(fn, opts) starts one; each run gets its own
// context (ctx) and its own G, so G.skipping, cancellation and player control belong to that script.
//
//   Script.run(fn, {control, letterbox, skippable, name, id, parent, persist, room, keepPost, arg}) → Promise<result>
//     control:false  = BLOCKING (a cutscene or a blocking beat): Player is locked, only one runs at a time — another
//                      blocking request queues until it finishes, unless it is started from inside the running blocking
//                      script (opts.parent = that script's G or ctx: G.cutscene, G.call, G.boss …) or the running one
//                      has handed control back (G.control(true)), in which case it starts at once (no deadlocks).
//     control:true   = BACKGROUND (room hooks, triggers, ambient beats): any number run side by side.
//     Defaults: control = !letterbox, skippable = letterbox.
//     Background scripts started by World (they carry an `id`) and G.bg children are ROOM-BOUND: they are aborted on
//     room:leave unless they are the ones inside G.goto; G.persist() / opts.persist opts out.
//   Waits step on GAME time in Script.update(dt) (called by the main loop before Player.update, so E presses that
//   advance subtitles or answer calls are consumed before Player sees them).
//   Cancellation: Script.abort(ctx) / Script.abortAll('death'|'load'|…) reject the pending await with Script.ABORT
//     (the runner swallows it; run() then resolves with Script.ABORT). Any later G call from that script throws it too.
//   Skipping (spec §7): holding Esc 1 s (Input 'skip') or Script.skip() while the running blocking script is skippable
//     marks it (and its children) G.skipping: waits, lines, camera moves, fades, walks, turns and gestures resolve at
//     once, cards/titles jump to their end state, one-shot sounds and music cues are dropped — but choices, keypads,
//     G.hold and calls still wait for the player, and every state change still happens. A skip covers the outermost
//     contiguous chain of skippable blocking scripts (a cutscene that plays another cutscene skips both). G.boss runs its
//     fight in a non-skippable child while the calling cutscene is suspended (no letterbox, control back to the player).
//
// Dialogue (§7): G.say(speaker, text) splits `[beat]` (0.8 s) and `[long beat]` (2 s) into separate subtitles with
//   silences; each subtitle stays U.readTime(text) or until E (never sooner than 0.3 s). Speakers "NAME (phone)" are
//   italic with the static wobble, "(thought)" italic. CONTRACT+ inline tags: [static] (a static burst + 0.6 s pause),
//   [pen click], [click], [keys], [clunk], [beep] (sounds); any other [stage direction] is dropped from the text.
//   The speaking actor's mouth moves (Rig talk) when the speaker's name matches an actor in the room.
//
// CONTRACT+ (beyond ARCHITECTURE §11): Script.update(dt), skip(), skippable/busy/cutscene/active getters, abort(ctx),
//   abortAll(reason), playCutscene(id, opts), seen(id), owns(G|ctx) (runs inside the blocking script that has the
//   input), choose(i) (answer the open G.choice — tests/SH), advance()
//   (end the current subtitle line), wait(s) (game-time Promise for engine code), readDoc(docId) (mark read + apply
//   the doc's track once — for the Memos screen), list() (debug), time. Bus: 'cutscene'(id, 'start'|'end'|'skip'),
//   'script'(phase, name). G extras: G.shot(spec)/G.shots([…]) (declarative cutscene shots), G.waitInput(), G.persist(),
//   G.heal(n), G.damage(n, source, o), G.equip(id), G.menu(name, o), G.screen(content, o), G.stamp(text, o),
//   G.phone (Phone), G.enemies (Enemies), G.ctx, G.name, G.world (World), A.say(text, o), A.talk(s), A.yaw, A.id.
const Script = (() => {
  const ABORT = Object.freeze({ abort: true, toString() { return 'Script.ABORT'; } });
  const D2R = Math.PI / 180;
  const LINE_MIN = 0.3;                 // a subtitle can't be dismissed sooner than this (a held E never skips a scene)
  const noop = () => {};
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const hasUI = () => typeof UI !== 'undefined' && !!UI;
  const hasWorld = () => typeof World !== 'undefined' && !!World;
  const hasPlayer = () => typeof Player !== 'undefined' && !!Player;
  const hasCam = () => typeof Cam !== 'undefined' && !!Cam;
  const hasEnemies = () => typeof Enemies !== 'undefined' && !!Enemies;
  const hasPhone = () => typeof Phone !== 'undefined' && !!Phone;
  const hasSave = () => typeof Save !== 'undefined' && !!Save;
  const hasGame = () => typeof Game !== 'undefined' && !!Game;
  const hasMenus = () => typeof Menus !== 'undefined' && !!Menus && typeof Menus.open === 'function';
  const menusOpen = () => { try { return hasMenus() && !!Menus.isOpen && !!Menus.isOpen(); } catch (e) { return false; } };
  const ui = (fn, ...a) => { try { if (hasUI() && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[Script] UI.' + fn, e); } return undefined; };
  const snd = (fn, ...a) => { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[fn] === 'function') return Snd[fn](...a); } catch (e) { console.error('[Script] Snd.' + fn, e); } return undefined; };
  const inp = (fn, ...a) => { try { if (typeof Input !== 'undefined' && Input && typeof Input[fn] === 'function') return Input[fn](...a); } catch (e) { /* input not ready */ } return undefined; };
  const floorAt = (x, z) => { try { return hasWorld() && World.build ? World.heightAt(x, z) : null; } catch (e) { return null; } };
  const itemDef = (id) => (typeof ITEMS !== 'undefined' && ITEMS[id]) || null;
  const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(noop); return p; };

  // ---------------------------------------------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------------------------------------------
  let clock = 0, frameNo = 0, nextId = 1;
  const live = new Set();          // running contexts
  const queue = [];                // blocking contexts waiting for the slot
  const blockStack = [];           // running blocking contexts, in start order
  let waits = [];                  // pending game-time waits
  let lbCount = 0;                 // contexts that currently want the letterbox
  let camOwner = null;             // the context that last started a scripted camera
  let choiceSt = null;             // the open G.choice { ctx, override }
  const actorReg = new Map();      // script-created actors when no room is loaded
  let subTok = 0, subOwner = 0;    // which say() owns the one subtitle slot (so a script never clears another's line)

  class Ctx {
    constructor(fn, opts, parent) {
      this.id = nextId++;
      this.fn = fn; this.opts = opts; this.parent = parent || null;
      this.name = String(opts.name || opts.id || (fn && fn.name) || 'script');
      this.blocking = opts.control === false;
      this.letterbox = !!opts.letterbox;
      this.skippable = !!opts.skippable;
      this.skipping = false; this.aborted = null; this.done = false; this.started = false; this.queued = false;
      this.children = new Set(); this.pending = new Set();
      this.lockHeld = false; this.lb = false; this.suspended = 0; this.inGoto = 0;
      this.loops = new Set();          // looping sound handles started through G.sfx (stopped at the end)
      this.postSaved = null;           // Render.post fields this script changed (restored at the end of a cutscene)
      this.music = false; this.saying = false; this.holding = false; this.choosing = false;
      this.roomBound = opts.room ?? opts.roomBound ?? (!this.blocking && !opts.persist && (!!opts.id || !!opts.bg));
      this.result = undefined;
      this.G = makeG(this);
    }
  }
  const ctxOf = (x) => (x instanceof Ctx ? x : x && x.ctx instanceof Ctx ? x.ctx : null);
  function chk(ctx) { if (ctx && ctx.aborted) throw ABORT; }
  function isWithin(ctx, anc) { for (let c = ctx; c; c = c.parent) if (c === anc) return true; return false; }

  // ---------------------------------------------------------------------------------------------------------------
  // Waits (game time)
  // ---------------------------------------------------------------------------------------------------------------
  function addWait(ctx, w) {
    chk(ctx);
    w.ctx = ctx; w.t0 = clock;
    const p = new Promise((res, rej) => { w.resolve = res; w.reject = rej; });
    waits.push(w);
    return quiet(p);
  }
  function settle(w, v, err) {
    const i = waits.indexOf(w);
    if (i < 0) return;
    waits.splice(i, 1);
    if (err !== undefined) w.reject(err); else w.resolve(v);
  }
  function waitTime(ctx, s) {
    chk(ctx);
    if (ctx && ctx.skipping) return Promise.resolve();
    if (!(s > 0)) return Promise.resolve();
    return addWait(ctx, { kind: 'time', until: clock + s });
  }
  function waitFrame(ctx) { return addWait(ctx, { kind: 'frame', frame: frameNo }); }
  function waitUntil(ctx, pred, o = {}) {
    chk(ctx);
    try { if (pred()) return Promise.resolve(true); } catch (e) { return Promise.reject(e); }
    return addWait(ctx, { kind: 'until', pred, timeout: o.timeout > 0 ? o.timeout : 0 });
  }
  // loop(fn(dt, skipping) → true to stop). While skipping, non-interactive loops are fast-forwarded (up to 20 steps of
  // 0.1 s per frame) so time-based loops finish at once.
  function waitLoop(ctx, fn, o = {}) {
    chk(ctx);
    return addWait(ctx, { kind: 'loop', fn, interactive: !!o.interactive });
  }
  function waitLine(ctx, dur, o = {}) { return addWait(ctx, { kind: 'line', until: clock + dur, shown: clock, bg: !ctx || !ctx.blocking, ...o }); }
  function waitInput(ctx, action = 'confirm') { chk(ctx); if (ctx && ctx.skipping) return Promise.resolve(); return addWait(ctx, { kind: 'input', action }); }
  // an external promise, made abortable
  function guard(ctx, p) {
    chk(ctx);
    return quiet(new Promise((res, rej) => {
      const rec = { reject: rej };
      if (ctx) ctx.pending.add(rec);
      Promise.resolve(p).then(
        (v) => { if (ctx) ctx.pending.delete(rec); if (ctx && ctx.aborted) rej(ABORT); else res(v); },
        (e) => { if (ctx) ctx.pending.delete(rec); rej(ctx && ctx.aborted ? ABORT : e); },
      );
    }));
  }

  function stepWait(w, dt) {
    const c = w.ctx, skip = !!(c && c.skipping);
    try {
      switch (w.kind) {
        case 'time': if (skip || clock >= w.until) settle(w); break;
        case 'frame': if (frameNo > w.frame) settle(w); break;
        case 'line': if (skip || clock >= w.until) settle(w, 'time'); break;
        case 'input': if (skip) settle(w); break;
        case 'until':
          if (w.pred()) settle(w, true);
          else if (w.timeout && (skip || clock - w.t0 >= w.timeout)) settle(w, false);
          break;
        case 'loop': {
          if (skip && !w.interactive) {
            for (let i = 0; i < 20; i++) { if (w.fn(0.1, true)) { settle(w, true); break; } if (!waits.includes(w)) break; }
          } else if (w.fn(dt, skip)) settle(w, true);
          break;
        }
        default: break;
      }
    } catch (e) { settle(w, undefined, e); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Running, finishing, aborting
  // ---------------------------------------------------------------------------------------------------------------
  const holder = () => blockStack.find((c) => c.lockHeld && !c.suspended && !c.done) || null;
  // does this script (G or ctx) run inside the blocking script that currently owns the player's input?
  function owns(x) {
    const c = ctxOf(x);
    if (!c) return false;
    for (const b of blockStack) if (b.lockHeld && !b.suspended && !b.done && isWithin(c, b)) return true;
    return false;
  }
  function mustQueue(ctx) {
    const h = holder();
    if (!h) return false;
    for (const b of blockStack) if (ctx.parent && isWithin(ctx.parent, b)) return false;   // nested inside a running one
    return true;
  }
  function run(fn, opts = {}) {
    if (typeof fn !== 'function') return Promise.resolve(undefined);
    opts = { ...opts };
    if (opts.control === undefined) opts.control = !opts.letterbox;
    if (opts.skippable === undefined) opts.skippable = !!opts.letterbox;
    const parent = ctxOf(opts.parent);
    const ctx = new Ctx(fn, opts, parent);
    ctx.promise = new Promise((r) => { ctx.resolve = r; });
    if (parent && parent.aborted) { ctx.done = true; ctx.resolve(ABORT); return ctx.promise; }
    if (ctx.blocking && mustQueue(ctx)) { ctx.queued = true; queue.push(ctx); }
    else start(ctx);
    return ctx.promise;
  }
  function start(ctx) {
    ctx.queued = false; ctx.started = true;
    live.add(ctx);
    if (ctx.parent) {
      ctx.parent.children.add(ctx);
      if (ctx.parent.skipping && ctx.opts.inheritSkip !== false) ctx.skipping = true;
    }
    if (ctx.blocking) { blockStack.push(ctx); setLock(ctx, true); }
    if (ctx.letterbox) setLetterbox(ctx, true);
    refreshSkippable();
    if (ctx.opts.cutscene) Bus.emit('cutscene', ctx.opts.cutscene, 'start');
    Bus.emit('script', 'start', ctx.name);
    (async () => {
      let result;
      try { result = await ctx.fn(ctx.G, ctx.opts.arg); }
      catch (e) {
        if (e === ABORT || ctx.aborted) result = ABORT;
        else { console.error(`[Script] "${ctx.name}" failed:`, e && e.stack ? e.stack : e); result = undefined; }
      }
      finish(ctx, ctx.aborted ? ABORT : result);
    })();
  }
  function finish(ctx, result) {
    if (ctx.done) return;
    ctx.done = true;
    live.delete(ctx);
    // waits the script left behind (not awaited) die with it
    const mine = waits.filter((w) => w.ctx === ctx);
    if (mine.length) { waits = waits.filter((w) => w.ctx !== ctx); for (const w of mine) (ctx.aborted ? w.reject : w.resolve)(ctx.aborted ? ABORT : undefined); }
    // presentation this script owns
    if (ctx.saying) { ctx.saying = false; if (subOwner === ctx.subTok) ui('clearSubtitle', 0.25); }
    if (ctx.holding) { ctx.holding = false; ui('holdPrompt', null); }
    if (ctx.choosing && ctx.aborted) {
      if (choiceSt && choiceSt.ctx === ctx) { choiceSt.override = -1; ui('choice', []); }
      else ui('clear', { letterbox: false });                       // an open keypad (resolves null)
    }
    for (const h of ctx.loops) { try { h.stop(0.4); } catch (e) { /* gone */ } }
    ctx.loops.clear();
    if (ctx.music && ctx.skipping) snd('stopMusic', 1);
    if (ctx.postSaved && !ctx.opts.keepPost) restorePost(ctx);
    if (camOwner === ctx) { camOwner = null; try { if (hasCam() && Cam.isScripted) Cam.release(); } catch (e) { console.error('[Script] Cam.release', e); } }
    if (ctx.lb) setLetterbox(ctx, false);
    setLock(ctx, false);
    if (ctx.blocking) { const i = blockStack.indexOf(ctx); if (i >= 0) blockStack.splice(i, 1); }
    if (ctx.parent) ctx.parent.children.delete(ctx);
    refreshSkippable();
    if (ctx.opts.cutscene) Bus.emit('cutscene', ctx.opts.cutscene, 'end');
    Bus.emit('script', 'end', ctx.name);
    ctx.result = result;
    ctx.resolve(result);
    pumpQueue();
  }
  function pumpQueue() {
    while (queue.length && !holder()) {
      const next = queue.shift();
      if (next.aborted || next.done) continue;
      start(next);
    }
  }
  function abort(target, reason = 'abort') {
    const ctx = ctxOf(target) || (typeof target === 'string' ? [...live].find((c) => c.name === target) : null);
    if (!ctx || ctx.done || ctx.aborted) return false;
    ctx.aborted = reason;
    for (const ch of [...ctx.children]) abort(ch, reason);
    if (ctx.queued) {
      const i = queue.indexOf(ctx); if (i >= 0) queue.splice(i, 1);
      ctx.done = true; ctx.resolve(ABORT);
      return true;
    }
    for (const rec of [...ctx.pending]) rec.reject(ABORT);
    ctx.pending.clear();
    finish(ctx, ABORT);
    return true;
  }
  function abortAll(reason = 'abort') {
    const hadChoice = !!choiceSt;
    for (const c of [...queue]) abort(c, reason);
    for (const c of [...live]) if (!c.parent || !live.has(c.parent)) abort(c, reason);
    for (const c of [...live]) abort(c, reason);
    queue.length = 0; blockStack.length = 0; waits = [];
    lbCount = 0; camOwner = null; choiceSt = null;
    ui('letterbox', false, 0.3); ui('clearSubtitle', 0.2); ui('holdPrompt', null); ui('skippable', false);
    if (hadChoice) ui('choice', []);
    if (reason === 'load') ui('clear', { letterbox: true });
    return true;
  }
  function setLock(ctx, on) {
    on = !!on;
    if (ctx.lockHeld === on) return;
    ctx.lockHeld = on;
    try { if (hasPlayer() && Player.lock) Player.lock('script#' + ctx.id, on); } catch (e) { console.error('[Script] Player.lock', e); }
  }
  function setLetterbox(ctx, on) {
    if (on === ctx.lb) return;
    ctx.lb = on;
    lbCount = Math.max(0, lbCount + (on ? 1 : -1));
    const fast = ctx.skipping;
    if (on && lbCount === 1) ui('letterbox', true, fast ? 0 : 0.6);
    if (!on && lbCount === 0) ui('letterbox', false, fast ? 0.25 : 0.6);
  }
  function refreshSkippable() {
    const top = activeBlocking();
    ui('skippable', !!(top && top.skippable && !top.letterbox && !top.suspended));
  }
  function activeBlocking() {
    for (let i = blockStack.length - 1; i >= 0; i--) { const c = blockStack[i]; if (!c.done && !c.aborted) return c; }
    return null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Skipping
  // ---------------------------------------------------------------------------------------------------------------
  function skipTarget() {
    for (let i = blockStack.length - 1; i >= 0; i--) {
      const c = blockStack[i];
      if (c.done || c.aborted) continue;
      if (c.suspended || !c.skippable) return null;
      let t = c;
      for (let p = t.parent; p && p.blocking && p.skippable && !p.suspended && !p.done && !p.aborted; p = p.parent) t = p;
      return t;
    }
    return null;
  }
  function markSkipping(ctx) {
    ctx.skipping = true;
    for (const ch of ctx.children) if (ch.opts.inheritSkip !== false) markSkipping(ch);
  }
  function skip() {
    const t = skipTarget();
    if (!t || t.skipping) return false;
    markSkipping(t);
    ui('clearSubtitle', 0);
    ui('skip');
    try { if (hasCam()) Cam.finish(); } catch (e) { /* no camera */ }
    for (const w of waits.slice()) if (w.ctx && w.ctx.skipping) stepWait(w, 0);
    if (t.opts.cutscene) Bus.emit('cutscene', t.opts.cutscene, 'skip');
    Bus.emit('script', 'skip', t.name);
    return true;
  }
  const anySkipping = () => { for (const c of live) if (c.skipping) return true; return false; };

  // ---------------------------------------------------------------------------------------------------------------
  // Per-frame update (game time)
  // ---------------------------------------------------------------------------------------------------------------
  function update(dt) {
    if (dt === undefined) dt = (typeof Time !== 'undefined' && Time.dt) || 0;
    dt = Math.max(0, +dt || 0);
    clock += dt;
    frameNo++;
    if (!menusOpen()) handleInput();
    if (anySkipping()) {
      ui('skip');
      if (camOwner && camOwner.skipping) { try { Cam.finish(); } catch (e) { /* no camera */ } }
    }
    const list = waits.slice();
    for (const w of list) if (waits.includes(w)) stepWait(w, dt);
  }
  function handleInput() {
    const top = activeBlocking();
    // hold Esc / Start 1 s → skip; a plain Esc press doesn't open the pause menu during a skippable scene
    if (top && top.skippable && !top.suspended) {
      if (inp('pressed', 'skip')) skip();
      if (inp('pressed', 'pause')) inp('consume', 'pause');
    }
    if (hasUI() && UI.capturing && UI.capturing()) return;
    if (inp('pressed', 'confirm')) {
      // E: answer 'input' waits first, then end the newest line (blocking scripts always; background lines only when
      // E has nothing else to do in the world)
      const inW = waits.filter((w) => w.kind === 'input' && w.action === 'confirm');
      if (inW.length) { inp('consume', 'confirm'); for (const w of inW) settle(w); return; }
      const lines = waits.filter((w) => w.kind === 'line' && clock - w.shown >= LINE_MIN);
      if (lines.length) {
        const freeE = !hasPlayer() || !Player.canControl || !Player.interactTarget;
        const pick = lines.filter((w) => !w.bg || freeE);
        if (pick.length) { inp('consume', 'confirm'); settle(pick[pick.length - 1], 'input'); }
      }
    }
    for (const w of waits.filter((x) => x.kind === 'input' && x.action !== 'confirm')) if (inp('pressed', w.action)) { inp('consume', w.action); settle(w); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------------------------------------------
  const TAGS = {
    'beat': { pause: 0.8 }, 'long beat': { pause: 2 },
    'static': { sfx: ['static', { dur: 0.6, vol: 0.55 }], pause: 0.6 },
    'pen click': { sfx: ['penclick', {}] }, 'click': { sfx: ['click', {}] }, 'keys': { sfx: ['keys', {}], pause: 0.4 },
    'clunk': { sfx: ['clunk', {}] }, 'beep': { sfx: ['beep', {}] },
  };
  // text → [{text} | {pause} | {sfx}]
  function parseLine(text) {
    const out = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0, m;
    const pushText = (s) => { const t = s.replace(/\s+/g, ' ').trim(); if (t) out.push({ text: t }); };
    while ((m = re.exec(text))) {
      pushText(text.slice(last, m.index));
      last = m.index + m[0].length;
      const tag = TAGS[m[1].trim().toLowerCase()];
      if (!tag) continue;                                   // any other stage direction: dropped
      if (tag.sfx) out.push({ sfx: tag.sfx });
      if (tag.pause) out.push({ pause: tag.pause });
    }
    pushText(text.slice(last));
    return out;
  }
  const bareName = (spk) => String(spk || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
  function talkerFor(spk) {
    const n = bareName(spk);
    if (!n || /\(phone\)|\(thought\)|\(voicemail|\(pa\)/i.test(String(spk))) return null;
    if (n === 'aidan') return hasPlayer() && Player.actor ? Player.actor : null;
    const raw = findRaw(n) || findRaw(n.replace(/\s+/g, '_'));
    return raw && typeof raw.talk === 'function' ? raw : null;
  }
  async function say(ctx, speaker, text, o = {}) {
    chk(ctx);
    if (Array.isArray(text)) { for (const t of text) await say(ctx, speaker, t, o); return; }
    if (text == null) return;
    const spk = speaker == null ? '' : String(speaker);
    const phone = o.phone ?? /\(phone\)|\(voicemail/i.test(spk);
    const italic = o.italic ?? (phone || /\(thought\)/i.test(spk));
    const parts = parseLine(String(text));
    const talker = o.talk === false ? null : talkerFor(spk);
    try {
      for (const p of parts) {
        chk(ctx);
        if (ctx.skipping) continue;
        if (p.pause) { if (ctx.saying) { if (subOwner === ctx.subTok) ui('clearSubtitle', 0.25); ctx.saying = false; } await waitTime(ctx, p.pause); continue; }
        if (p.sfx) { snd('play', p.sfx[0], { ...p.sfx[1], phone: phone || undefined }); continue; }
        const dur = o.dur > 0 ? o.dur : U.readTime(p.text);
        ui('subtitle', p.text, { italic, phone, speaker: spk });
        ctx.saying = true; ctx.subTok = subOwner = ++subTok;
        if (talker) { try { talker.talk(Math.min(dur, 0.055 * p.text.length + 0.35)); } catch (e) { /* no mouth */ } }
        const how = await waitLine(ctx, dur);
        if (talker && how === 'input') { try { talker.talk(false); } catch (e) { /* no mouth */ } }
      }
    } finally {
      if (ctx.saying) { ctx.saying = false; if (subOwner === ctx.subTok) ui('clearSubtitle', ctx.skipping ? 0 : 0.3); }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Positions and actors
  // ---------------------------------------------------------------------------------------------------------------
  function toPos(t, yDefault) {
    if (t == null) return null;
    if (t.isVector3) return t.clone();
    if (Array.isArray(t)) {
      if (t.length === 2) { const y = yDefault ?? floorAt(t[0], t[1]) ?? 0; return V3(t[0], y, t[1]); }
      return V3(t[0], t[1], t[2]);
    }
    if (typeof t === 'string') { const m = hasWorld() && World.mark ? World.mark(t) : null; return m ? m.pos.clone() : null; }
    if (t.raw && t.raw.root) return t.raw.root.position.clone();
    if (t.root && t.root.isObject3D) return t.root.getWorldPosition(V3());
    if (t.isObject3D) return t.getWorldPosition(V3());
    if (t.pos && t.pos.isVector3) return t.pos.clone();
    if (typeof t.x === 'number' && typeof t.z === 'number') return V3(t.x, t.y || 0, t.z);
    return null;
  }
  // a look / eyes target for Rig: Actor | Vector3 | null
  function lookTarget(t) {
    if (t == null || t === false) return null;
    if (t === 'camera') return Render.camera.position;
    if (t.raw && t.raw.root) return t.raw;
    if (t.bones && t.root) return t;
    if (t.actor && t.actor.bones) return t.actor;               // an enemy with a Rig body
    if (typeof t === 'string') { const m = hasWorld() && World.mark ? World.mark(t) : null; if (m) return m.pos.clone().add(V3(0, 1.55, 0)); const a = findRaw(t); return a || null; }
    if (t.pos && t.pos.isVector3 && !t.isVector3) return t.pos.clone().add(V3(0, 1.5, 0));
    if (Array.isArray(t) && t.length === 2) return V3(t[0], (floorAt(t[0], t[1]) ?? 0) + 1.55, t[1]);
    return toPos(t);
  }
  function findRaw(id) {
    if (!id) return null;
    if (id === 'aidan' || id === 'player') return hasPlayer() ? Player.actor : null;
    try { const b = hasWorld() ? World.build : null; if (b && b.npcs && b.npcs[id]) return b.npcs[id]; } catch (e) { /* no room */ }
    return actorReg.get(id) || null;
  }
  function createRaw(id, preset, o = {}) {
    if (typeof Rig === 'undefined' || !Rig || !Rig.create) return null;
    let raw;
    try { raw = Rig.create(preset || id, o.rig || {}); } catch (e) { console.error(`[Script] Rig.create("${preset || id}") failed`, e); return null; }
    if (raw.id === undefined) raw.id = id;
    raw.npcId = id;
    const b = hasWorld() ? World.build : null;
    if (b && b.group) { b.group.add(raw.root); if (b.npcs) b.npcs[id] = raw; }
    else { Render.scene.add(raw.root); actorReg.set(id, raw); }
    if (o.anim) raw.setAnim(o.anim, { blend: 0 });
    if (o.hidden) raw.visible(false);
    return raw;
  }
  const turnToward = (cur, want, maxStep) => cur + U.clamp(U.angleDiff(cur, want), -maxStep, maxStep);
  const DUMMY_ACTOR = (id) => {
    const p = () => Promise.resolve();
    const self = { id, raw: null, pos: V3(), yaw: 0, place: () => self, walkTo: p, turn: p, look: () => self, eyes: () => self, pose: () => self,
      gesture: p, expr: () => self, hold: () => null, show: () => self, hide: () => self, fade: p, remove: noop, say: p, talk: () => self };
    return self;
  };
  function mkActor(ctx, raw, id, isPlayer) {
    if (!raw) return DUMMY_ACTOR(id);
    const root = raw.root;
    const setYaw = (r) => { root.rotation.y = U.wrapAngle(r); if (isPlayer && hasPlayer()) Player.yaw = root.rotation.y; };
    const A = {
      id, raw, isPlayer,
      get pos() { return root.position; },
      get yaw() { return root.rotation.y / D2R; },
      // place(x, z, rotDeg) | place(markName) | place([x, z], rotDeg) | place(Vector3, rotDeg)
      place(a, b, c, o = {}) {
        chk(ctx);
        let x, z, rot, y;
        if (typeof a === 'number') { x = a; z = b; rot = c; }
        else if (typeof a === 'string') {
          const m = hasWorld() ? World.mark(a) : null;
          if (!m) { console.warn(`[Script] place: no mark "${a}"`); return A; }
          x = m.pos.x; z = m.pos.z; y = m.pos.y; rot = b ?? m.rot;
        } else { const p = toPos(a); if (!p) return A; x = p.x; z = p.z; if (Array.isArray(a) && a.length === 3 && b === undefined) { rot = a[2]; y = undefined; } else rot = b; }
        if (o && o.y !== undefined) y = o.y;
        if (y === undefined || y === null) y = floorAt(x, z) ?? root.position.y;
        if (isPlayer && hasPlayer()) Player.place(x, z, rot ?? A.yaw, { y });
        else {
          root.position.set(x, y, z);
          if (rot !== undefined && rot !== null) setYaw(rot * D2R);
          if (raw.state) raw.state.hasPrev = false;
          raw.visible(true);
        }
        return A;
      },
      // walkTo(x, z, o) | walkTo(mark|[x,z]|Vector3|actor, o) | walkTo([[x,z], …], o) — straight lines, walk/run loop
      async walkTo(a, b, c) {
        chk(ctx);
        let pts, o;
        if (typeof a === 'number') { pts = [[a, b]]; o = c || {}; }
        else if (Array.isArray(a) && (Array.isArray(a[0]) || typeof a[0] === 'string' || (a[0] && a[0].isVector3))) { pts = a; o = b || {}; }
        else { pts = [a]; o = b || {}; }
        const targets = pts.map((p) => toPos(p)).filter(Boolean);
        if (!targets.length) return A;
        const run = !!o.run;
        const speed = o.speed ?? (run ? raw.runSpeed || 3.4 : raw.walkSpeed || 1.3);
        const collide = o.collide ?? !!isPlayer;
        const endAnim = o.end === undefined ? 'idle' : o.end;
        const snap = (tp, from) => {
          const dx = tp.x - from.x, dz = tp.z - from.z;
          if (Math.hypot(dx, dz) > 0.01) setYaw(Math.atan2(dx, dz));
          root.position.set(tp.x, floorAt(tp.x, tp.z) ?? tp.y, tp.z);
          if (raw.state) raw.state.hasPrev = false;
        };
        if (ctx.skipping) {
          let from = root.position.clone();
          for (const tp of targets) { snap(tp, from); from = tp; }
        } else {
          raw.setAnim(o.anim || (run ? 'run' : 'walk'), { blend: 0.25 });
          for (const tp of targets) {
            let stuck = 0, lastD = Infinity;
            await waitLoop(ctx, (dt) => {
              if (ctx.skipping) { snap(tp, root.position.clone()); return true; }
              const p = root.position, dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz);
              if (d < 0.03) return true;
              if (!(dt > 0)) return false;
              setYaw(turnToward(root.rotation.y, Math.atan2(dx, dz), (o.turnRate ?? 8) * dt));
              const step = Math.min(d, speed * dt);
              let nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step, ny;
              if (collide && hasWorld() && World.build) { const r = World.move(p, nx - p.x, nz - p.z, 0.3, {}); nx = r.x; nz = r.z; ny = r.y; }
              else ny = floorAt(nx, nz) ?? p.y;
              p.set(nx, ny, nz);
              if (d > lastD - 0.002) { stuck += dt; if (stuck > 1.2) return true; } else stuck = 0;
              lastD = d;
              return false;
            });
          }
        }
        if (endAnim) raw.setAnim(endAnim, { blend: ctx.skipping ? 0 : 0.3 });
        if (o.face !== undefined && o.face !== null) await A.turn(o.face, 0.4);
        return A;
      },
      // turn(rotDeg | target, dur=0.6)
      async turn(t, dur = 0.6) {
        chk(ctx);
        let want;
        if (typeof t === 'number') want = t * D2R;
        else { const p = toPos(t && t.raw ? t.raw.root.position : t); if (!p) return A; want = Math.atan2(p.x - root.position.x, p.z - root.position.z); }
        const from = root.rotation.y, diff = U.angleDiff(from, want);
        if (ctx.skipping || !(dur > 0) || Math.abs(diff) < 0.01) { setYaw(from + diff); return A; }
        let k = 0;
        await waitLoop(ctx, (dt) => {
          k = Math.min(1, k + dt / dur);
          setYaw(from + diff * U.ease.inOut(k));
          return k >= 1;
        });
        return A;
      },
      look(t) { chk(ctx); raw.lookAt(lookTarget(t)); return A; },
      eyes(mode, t) { chk(ctx); raw.eyes(mode, lookTarget(t)); return A; },
      pose(anim, o = {}) { chk(ctx); raw.setAnim(anim, ctx.skipping ? { ...o, blend: 0 } : o); return A; },
      async gesture(name, o = {}) {
        chk(ctx);
        const tgt = o.target !== undefined ? { ...o, target: lookTarget(o.target) || toPos(o.target) } : o;
        const p = raw.gesture(name, ctx.skipping ? { ...tgt, instant: true } : tgt);
        if (ctx.skipping) { try { raw.finishGestures && !o.hold && raw.finishGestures(); } catch (e) { /* ok */ } return A; }
        await guardSkippable(ctx, p);
        return A;
      },
      expr(name) { chk(ctx); raw.expr(name); return A; },
      hold(hand, prop, o) { chk(ctx); return raw.hold(hand, prop, o); },
      show() { chk(ctx); raw.visible(true); return A; },
      hide() { chk(ctx); raw.visible(false); return A; },
      async fade(a, dur = 0.8) {
        chk(ctx);
        const from = raw.opacity ?? 1;
        if (a > 0) raw.visible(true);
        if (ctx.skipping || !(dur > 0)) { raw.setOpacity(a); return A; }
        let k = 0;
        await waitLoop(ctx, (dt) => { k = Math.min(1, k + dt / dur); raw.setOpacity(U.lerp(from, a, k)); return k >= 1; });
        return A;
      },
      remove() {
        chk(ctx);
        if (isPlayer) { raw.visible(false); return; }
        root.removeFromParent();
        try { const b = hasWorld() ? World.build : null; if (b && b.npcs && b.npcs[id] === raw) delete b.npcs[id]; } catch (e) { /* no room */ }
        if (actorReg.get(id) === raw) actorReg.delete(id);
        try { raw.dispose(); } catch (e) { console.error('[Script] actor dispose', e); }
      },
      say(text, o = {}) { return say(ctx, o.speaker || String(id).toUpperCase(), text, o); },
      talk(s = true) { raw.talk(s); return A; },
    };
    return A;
  }
  // gestures resolve on their own; a skip mid-gesture finishes it
  function guardSkippable(ctx, p) {
    let done = false;
    const pr = Promise.resolve(p).then(() => { done = true; });
    return guard(ctx, Promise.race([pr, waitLoop(ctx, () => done || ctx.skipping)]));
  }
  function actorFor(ctx, id, preset, o = {}) {
    chk(ctx);
    if (id === 'aidan' || id === 'player') return mkActor(ctx, hasPlayer() ? Player.actor : null, 'aidan', true);
    let raw = findRaw(id);
    if (!raw) raw = createRaw(id, preset, o);
    const A = mkActor(ctx, raw, id, false);
    if (raw && o.at !== undefined) { if (Array.isArray(o.at)) A.place(...o.at); else A.place(o.at); }
    if (raw && o.pose) raw.setAnim(o.pose, { blend: 0 });
    return A;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Presentation helpers
  // ---------------------------------------------------------------------------------------------------------------
  const POST_KEYS = ['grain', 'ca', 'vignette', 'desat', 'noise', 'white', 'dim', 'blur', 'exposure', 'redBadge', 'brightness'];
  function savePost(ctx, k) {
    if (!ctx.letterbox) return;
    if (!ctx.postSaved) ctx.postSaved = {};
    if (!(k in ctx.postSaved)) ctx.postSaved[k] = Render.post[k];
  }
  function restorePost(ctx) {
    for (const [k, v] of Object.entries(ctx.postSaved)) Render.post[k] = v;
    ctx.postSaved = null;
  }
  function post(ctx, spec, o = {}) {
    chk(ctx);
    if (spec === null) { Render.resetPost(); return Promise.resolve(); }
    spec = spec || {};
    const dur = ctx.skipping ? 0 : (spec.dur ?? o.dur ?? 0);
    if (spec.grade) { try { Render.setGrade(spec.grade, ctx.skipping ? 0 : (spec.gradeDur ?? dur)); } catch (e) { console.error('[Script] grade', e); } }
    const keys = POST_KEYS.filter((k) => spec[k] !== undefined);
    if (!keys.length) return Promise.resolve();
    for (const k of keys) savePost(ctx, k);
    if (!(dur > 0)) { for (const k of keys) Render.post[k] = spec[k]; return Promise.resolve(); }
    const from = {};
    for (const k of keys) from[k] = Render.post[k] ?? (k === 'dim' || k === 'exposure' ? 1 : 0);
    let t = 0;
    return waitLoop(ctx, (dt) => {
      t = Math.min(1, t + dt / dur);
      for (const k of keys) Render.post[k] = spec[k] === null ? (t >= 1 ? null : from[k]) : U.lerp(from[k], spec[k], U.ease.inOut(t));
      return t >= 1;
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Items (inventory: S.inv [{id, n}], category from ITEMS[id].cat)
  // ---------------------------------------------------------------------------------------------------------------
  function stackable(id) { const d = itemDef(id); return d ? (d.stack ?? d.cat === 'item') : false; }
  function invCount(id) { const e = Array.isArray(S.inv) ? S.inv.find((i) => i && i.id === id) : null; return e ? (e.n ?? 1) : 0; }
  function itemName(id) {
    const d = itemDef(id);
    if (d && d.pickupName) return d.pickupName;
    const nm = String((d && d.name) || id.replace(/_/g, ' '));
    if (d && d.cat === 'map' && !/^RECEIPT MAP$/i.test(nm)) {
      return nm.toLowerCase().replace(/(^|[\s(\-—])([a-z])([a-z]*)/g, (m, a, b, rest, off) => (off > 0 && /^(and|of|the|to|at)$/.test(b + rest) ? m : a + b.toUpperCase() + rest));
    }
    const s = nm.toLowerCase();
    return s.replace(/^(level \d)/, (m) => m[0].toUpperCase() + m.slice(1));
  }
  function give(id, n = 1, o = {}) {
    if (!id) return 0;
    n = Math.max(1, n | 0);
    if (!Array.isArray(S.inv)) S.inv = [];
    const d = itemDef(id);
    const e = S.inv.find((i) => i && i.id === id);
    if (e) { if (stackable(id)) e.n = (e.n ?? 1) + n; }
    else S.inv.push({ id, n: stackable(id) ? n : 1 });
    if (d && d.map) { S.maps = S.maps || {}; S.maps[d.map] = true; }
    if (d && d.cat === 'weapon' && !S.equipped && o.equip !== false) S.equipped = id;
    // ammo weapons (spec §4: "6 sprays each"): the first one sets the count, every further one adds its charge
    const per = id === 'extinguisher' ? ((d && d.ammo) ?? 6) : d && d.ammo ? d.ammo : 0;
    if (per > 0 && o.ammo !== false) {
      S.ammo = S.ammo || {};
      S.ammo[id] = e ? Math.max(0, S.ammo[id] | 0) + per * n : per * n;
    }
    Bus.emit('pickup', id);
    if (!o.silent) ui('message', o.msg || `Aidan picked up the ${itemName(id)}.`);
    return invCount(id);
  }
  function take(id, n = 1) {
    if (!Array.isArray(S.inv)) return false;
    const e = S.inv.find((i) => i && i.id === id);
    if (!e) return false;
    e.n = (e.n ?? 1) - Math.max(1, n | 0);
    if (e.n <= 0) { S.inv.splice(S.inv.indexOf(e), 1); if (S.equipped === id) S.equipped = null; }
    return true;
  }
  function stat(name, n = 1) { S.stats = S.stats || {}; S.stats[name] = (S.stats[name] || 0) + n; return S.stats[name]; }

  // map marks: spec {map, floor, t, x, y, text} in map units, or {at:[x,z]} / {x, z} in room coordinates (converted
  // with the current room's map.xform)
  function mapMark(id, spec) {
    S.mapMarks = S.mapMarks || {};
    if (spec === null || spec === false) { delete S.mapMarks[id]; return null; }
    const room = (hasWorld() && World.def) || (S.room && ROOMS[S.room]) || null;
    const rm = room && room.map ? room.map : null;
    const m = { map: spec.map ?? (rm && rm.id), floor: spec.floor ?? (rm && rm.floor) ?? 'G', t: spec.t || 'x', text: spec.text };
    let x = spec.x, y = spec.y;
    const at = spec.at || (spec.z !== undefined && spec.y === undefined ? [spec.x, spec.z] : null);
    if (at && rm && rm.xform) {
      const [ox, oz, sc = 1, rot = 0] = rm.xform, c = Math.cos(rot * D2R), s = Math.sin(rot * D2R);
      x = ox + (at[0] * c - at[1] * s) * sc; y = oz + (at[0] * s + at[1] * c) * sc;
    }
    m.x = x ?? 0; m.y = y ?? 0;
    S.mapMarks[id] = m;
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------------------------------------------
  function readDoc(docId) {
    S.docs = S.docs || {};
    const first = !S.docs[docId];
    if (first) { S.docs[docId] = { read: true }; stat('memos'); Bus.emit('doc', docId); }
    S.docs[docId].read = true;
    const d = (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[docId]) || null;
    if (d && d.track && !S.done['doctrack:' + docId]) {
      S.done['doctrack:' + docId] = true;
      for (const k of ['F', 'A']) if (d.track[k]) track(k, d.track[k], 'doc:' + docId);
    }
    return first;
  }
  async function openDocView(G, docId) {
    const d = (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[docId]) || null;
    if (hasMenus()) { await G.menu('doc', { id: docId }); return; }
    // partial build without Menus: the text on an in-world terminal screen, E to close
    const lines = [(d && d.title) || docId, ''].concat(String((d && d.text) || '').split('\n'));
    if (d && d.hand) lines.push('', String(d.hand));
    const h = ui('screen', { lines, cursor: false }, { style: 'terminal' });
    if (!h) { ui('message', (d && d.title) || docId); return; }
    await G.wait(0.4);
    await G.waitInput('confirm');
    await guard(G.ctx, Promise.resolve(ui('screen', null)));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The G factory
  // ---------------------------------------------------------------------------------------------------------------
  function makeG(ctx) {
    const G = {
      ctx,
      get name() { return ctx.name; },
      get S() { return S; },
      get skipping() { return !!ctx.skipping; },
      get player() { return hasPlayer() ? Player : null; },
      get world() { return hasWorld() ? World : null; },
      get phone() { return hasPhone() ? Phone : null; },
      get enemies() { return hasEnemies() ? Enemies : null; },
      get aidan() { return mkActor(ctx, hasPlayer() ? Player.actor : null, 'aidan', true); },
      get time() { return clock; },

      // ---- flow ----
      wait: (s) => waitTime(ctx, s),
      beat: () => waitTime(ctx, 0.8),
      longBeat: () => waitTime(ctx, 2),
      until: (pred, o) => waitUntil(ctx, pred, o),
      frame: () => waitFrame(ctx),
      loop: (fn, o) => waitLoop(ctx, fn, o),
      all: (list) => guard(ctx, Promise.all(list || [])),
      waitInput: (action) => waitInput(ctx, action),
      waitOrInput: (s) => { chk(ctx); return ctx.skipping ? Promise.resolve('skip') : waitLine(ctx, Math.max(0, +s || 0)); },
      bg(fn, o = {}) { chk(ctx); return run(fn, { ...o, control: true, parent: ctx, bg: true, name: o.name || ctx.name + ':bg' }); },
      persist() { ctx.roomBound = false; return G; },
      async cutscene(id, o = {}) {
        chk(ctx);
        const cs = typeof CUTSCENES !== 'undefined' ? CUTSCENES[id] : null;
        if (!cs) { console.warn(`[Script] no cutscene "${id}"`); return undefined; }
        S.done['cs:' + id] = true;
        const r = await guard(ctx, run(cs.fn, { ...cs.opts, ...o, name: 'cs:' + id, cutscene: id, parent: ctx }));
        return r === ABORT ? undefined : r;
      },
      run: (fn, o = {}) => guard(ctx, run(fn, { ...o, parent: ctx })),

      // ---- presentation ----
      letterbox(on = true) { chk(ctx); setLetterbox(ctx, !!on); },
      fade(to = 1, dur = 0.5, color) { chk(ctx); return guard(ctx, Promise.resolve(ui('fade', to, ctx.skipping ? 0 : dur, color))); },
      fadeIn(dur = 0.5) { return G.fade(0, dur); },
      fadeOut(dur = 0.5) { return G.fade(1, dur); },
      cam(spec) {
        chk(ctx);
        if (!hasCam()) return Promise.resolve();
        camOwner = ctx;
        const p = Cam.scripted(spec || {});
        if (ctx.skipping) Cam.finish();
        return guard(ctx, p);
      },
      camDone() { chk(ctx); if (!hasCam()) return Promise.resolve(); if (ctx.skipping) { Cam.finish(); return Promise.resolve(); } return waitUntil(ctx, () => !Cam.busy || (ctx.skipping && (Cam.finish(), true))); },
      camRelease() { chk(ctx); if (hasCam()) Cam.release(); if (camOwner === ctx) camOwner = null; },
      shake(a = 0.3, dur = 0.4) { chk(ctx); if (!ctx.skipping && hasCam()) Cam.shake(a, dur); },
      async card(text, o = {}) { chk(ctx); if (ctx.skipping) { ui('fade', 1, 0); return; } await guard(ctx, Promise.resolve(ui('card', text, o))); },
      async title(text, o = {}) { chk(ctx); if (ctx.skipping) return; await guard(ctx, Promise.resolve(ui('titleText', text, o))); },
      async textOnBlack(text, dur) { chk(ctx); if (ctx.skipping) { ui('fade', 1, 0); return; } await guard(ctx, Promise.resolve(ui('textOnBlack', text, dur))); },
      post(spec, o) { return post(ctx, spec, o); },
      hud(on = true) { chk(ctx); ui('showHud', !!on); },
      screen(content, o) { chk(ctx); return ui('screen', content, o); },
      stamp(text, o) { chk(ctx); return ui('stamp', text, o); },

      // ---- dialogue ----
      say: (speaker, text, o) => say(ctx, speaker, text, o || {}),
      think: (text, o = {}) => say(ctx, 'AIDAN (thought)', text, { italic: true, ...o }),
      async choice(options, o = {}) {
        chk(ctx);
        const st = { ctx, override: null };
        choiceSt = st; ctx.choosing = true;
        try {
          const i = await guard(ctx, Promise.resolve(ui('choice', options, o)));
          return st.override !== null && st.override >= 0 ? st.override : i;
        } finally { ctx.choosing = false; if (choiceSt === st) choiceSt = null; }
      },
      msg(text, dur) { chk(ctx); return guard(ctx, Promise.resolve(ui('message', text, dur))); },
      prompt(text, o) { chk(ctx); return ui('prompt', text, o); },

      // ---- actors ----
      actor: (id, preset, o) => actorFor(ctx, id, preset, o || {}),
      control(on = true) { chk(ctx); setLock(ctx, !on); },

      // ---- audio ----
      sfx(name, o = {}) {
        chk(ctx);
        if (ctx.skipping && !o.loop) return null;
        const h = snd('play', name, o) || null;
        if (h && o.loop && !o.persist) ctx.loops.add(h);
        return h;
      },
      music(motif, o) { chk(ctx); if (ctx.skipping) return null; ctx.music = true; return snd('music', motif, o) || null; },
      stopMusic(fade = 2) { chk(ctx); snd('stopMusic', fade); },
      ambient(name, fade) { chk(ctx); snd('ambient', name, fade); },
      duck(a = 1, dur = 3) { chk(ctx); if (ctx.skipping) return Promise.resolve(); return guard(ctx, Promise.resolve(snd('duck', a, dur))); },

      // ---- state ----
      flag: (n) => (S.flags || {})[n],
      set(n, v = true) { chk(ctx); setFlag(n, v); return v; },
      track(kind, n, reason) { chk(ctx); track(kind, n, reason || ctx.name); },
      give(id, n = 1, o = {}) { chk(ctx); return give(id, n, o); },
      take(id, n = 1) { chk(ctx); return take(id, n); },
      has: (id) => invCount(id) > 0,
      count: (id) => invCount(id),
      equip(id) { chk(ctx); if (!id || invCount(id) > 0) S.equipped = id || null; return S.equipped; },
      note(text, o) { chk(ctx); return hasPhone() ? Phone.note(text, o) : (S.notes.push({ text, done: false }), S.notes[S.notes.length - 1]); },
      async doc(docId, o = {}) { chk(ctx); return builtins.doc(G, { id: o.id || 'script:' + docId, docId, open: o.open ?? true }); },
      once: (id) => once(id),
      mapMark(id, spec) { chk(ctx); return mapMark(id, spec); },
      stat(name, n = 1) { chk(ctx); return stat(name, n); },
      heal(n) { chk(ctx); return hasPlayer() ? Player.heal(n) : ((S.health = Math.min(100, S.health + n)), n); },
      damage(n, source = 'script', o) { chk(ctx); return hasPlayer() ? Player.damage(n, source, o) : undefined; },

      // ---- world ----
      async goto(roomId, entry, o = {}) {
        chk(ctx);
        if (!hasWorld()) return false;
        ctx.inGoto++;
        try { return await guard(ctx, World.goto(roomId, entry ?? null, ctx.skipping ? { ...o, black: 0 } : o)); } finally { ctx.inGoto--; }
      },
      async outage(on = true) {
        chk(ctx);
        if (!hasWorld()) return false;
        if (ctx.skipping) { World.setOutage(!!on); return true; }
        // resolves when World's sequence does (the siren cut, 6.25 s in); a skip jumps the swap to its end
        let done = false;
        Promise.resolve(World.outageTransition(!!on)).then(() => { done = true; }, () => { done = true; });
        await waitLoop(ctx, () => {
          if (ctx.skipping) { if (World.outageBusy) World.setOutage(!!on); return true; }
          return done;
        });
        return true;
      },
      setOutage(on = true) { chk(ctx); return hasWorld() ? World.setOutage(!!on) : false; },
      spawn(def) { chk(ctx); if (!hasEnemies() || !Enemies.spawn) { console.warn('[Script] G.spawn: Enemies not available'); return null; } const e = Enemies.spawn(def); if (e && hasWorld() && World.spawned && def && def.id) World.spawned.set(def.id, e); return e; },
      enemy(id) { if (hasEnemies() && Enemies.get) { const e = Enemies.get(id); if (e) return e; } return hasWorld() && World.spawned ? World.spawned.get(id) || null : null; },
      pos(mark) { const m = hasWorld() ? World.mark(mark) : null; return m ? m.pos.clone() : null; },
      region: (name) => (hasWorld() ? World.region(name) : null),
      obj: (name) => (hasWorld() ? World.obj(name) : null),
      door: (id) => (hasWorld() ? World.door(id) : null),
      light: (name) => (hasWorld() ? World.light(name) : null),
      async lightsOut(o = {}) {
        chk(ctx);
        if (!hasWorld()) return false;
        const p = World.lightsOut(o);
        if (ctx.skipping) return true;
        return guard(ctx, p);
      },
      async call(callId, o = {}) {
        chk(ctx);
        if (!hasPhone()) { console.warn('[Script] G.call: Phone not available'); return 'declined'; }
        return guard(ctx, Phone.ring(callId, { ...o, parent: ctx }));
      },
      async keypad(o = {}) {
        chk(ctx);
        ctx.choosing = true;
        try { return await guard(ctx, Promise.resolve(ui('keypad', o))); } finally { ctx.choosing = false; }
      },
      // hold E for `seconds` (progress decays when released). → true when completed, false if cancelled (Esc / B,
      // o.until() turning true, or o.timeout seconds passing)
      async hold(text, seconds = 2, o = {}) {
        chk(ctx);
        const need = Math.max(0.1, +seconds || 2);
        let t = 0, res = false;
        const t0 = clock;
        ctx.holding = true;
        try {
          await waitLoop(ctx, (dt) => {
            if (menusOpen()) return false;
            // (consumed: the same Esc must not also open the pause menu later this frame)
            if (o.cancel !== false && inp('pressed', 'cancel')) { inp('consume', 'cancel'); res = false; return true; }
            if (o.until && o.until()) { res = false; return true; }
            if (o.timeout > 0 && clock - t0 >= o.timeout) { res = false; return true; }
            const down = !!inp('down', 'interact');
            t = down ? t + dt : Math.max(0, t - dt * (o.decay ?? 1.5));
            ui('holdPrompt', text || 'Hold {interact}', t / need);
            if (t >= need) { res = true; return true; }
            return false;
          }, { interactive: true });
        } finally { ctx.holding = false; ui('holdPrompt', null); }
        return res;
      },
      bars(n, o) { chk(ctx); return hasPhone() ? Phone.bars(n, o) : undefined; },
      async boss(id, o = {}) {
        chk(ctx);
        const b = typeof BOSSES !== 'undefined' ? BOSSES[id] : null;
        if (!b || typeof b.run !== 'function') { console.warn(`[Script] no boss "${id}"`); return undefined; }
        // the fight is gameplay: the calling scene steps aside (no letterbox, control back) and can't be skipped
        const hadLb = ctx.lb, hadLock = ctx.lockHeld;
        ctx.suspended++;
        if (hadLb) setLetterbox(ctx, false);
        if (hadLock) setLock(ctx, false);
        if (camOwner === ctx && hasCam()) { Cam.release(); camOwner = null; }
        refreshSkippable();
        try {
          const r = await guard(ctx, run((G2) => b.run(G2, o), { control: o.control ?? true, name: 'boss:' + id, parent: ctx, inheritSkip: false, skippable: false, persist: true }));
          return r === ABORT ? undefined : r;
        } finally {
          ctx.suspended = Math.max(0, ctx.suspended - 1);
          if (!ctx.aborted) { if (hadLb) setLetterbox(ctx, true); if (hadLock) setLock(ctx, true); }
          refreshSkippable();
        }
      },
      // CONTRACT+: o = {card:false (the scene showed its own), skipIntro}. The calling script survives the room change
      // (like G.goto), so `await G.startChapter(n)` returns normally.
      async startChapter(n, o = {}) {
        chk(ctx);
        if (hasGame() && Game.startChapter) {
          ctx.inGoto++;
          try { return await guard(ctx, Promise.resolve(Game.startChapter(n, o))); } finally { ctx.inGoto--; }
        }
        // partial build: minimal chapter start (card, autosave, go to the start, run begin)
        const ch = typeof CHAPTERS !== 'undefined' ? CHAPTERS[n] : null;
        S.chapter = n;
        Bus.emit('chapter', n);
        if (!ch) return false;
        await G.card(ch.card || ch.title || '');
        if (hasSave()) Save.autosave(ch.start && ch.start.room ? { room: ch.start.room, entry: ch.start.entry ?? null, chapterStart: n } : { chapterStart: n });
        if (ch.start && hasWorld()) await G.goto(ch.start.room, ch.start.entry, { fade: false, sound: 'none' });
        ui('fade', 0, 0.8);
        if (typeof ch.begin === 'function') run(ch.begin, { control: true, name: 'chapter' + n, persist: true });
        return true;
      },
      // the ending's cutscenes run nested in this script (no queueing behind it) and it survives their room changes
      async ending(name) {
        chk(ctx);
        if (hasGame() && Game.ending) {
          ctx.inGoto++;
          try { return await guard(ctx, Promise.resolve(Game.ending(name, { parent: ctx }))); } finally { ctx.inGoto--; }
        }
        console.warn('[Script] G.ending without Game:', name);
        await G.textOnBlack(String(name).toUpperCase(), 3);
        return name;
      },
      autosave() { chk(ctx); if (hasGame() && typeof Game.autosave === 'function') return Game.autosave(); return hasSave() ? Save.autosave() : false; },
      inRoom: (id) => (hasWorld() ? World.room === id : false),
      dist(a, b) {
        const pa = toPos(a && a.raw ? a.raw.root.position : a);
        const pb = b === undefined ? (hasPlayer() ? Player.pos.clone() : null) : toPos(b && b.raw ? b.raw.root.position : b);
        return pa && pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : Infinity;
      },
      menu(name, o) { chk(ctx); if (!hasMenus()) return Promise.resolve(null); return guard(ctx, Promise.resolve(Menus.open(name, o))); },

      // ---- declarative shots (§7: camera, actors, lines, sfx, music, fades, duration or wait-for-input) ----
      shot: (spec) => shot(ctx, spec),
      async shots(list) { for (const s of list || []) await shot(ctx, s); },
    };
    return G;
  }

  // A shot: { cam, letterbox, fade:(to | {to, dur, color, wait}), actors:{ id:{preset, place, show, hide, pose, look,
  //   eyes:(mode | [mode, target]), expr, hold:[hand, prop, o], opacity, turn, walk:(target | [target, o]), gesture:(name |
  //   [name, o]), wait:true (await the walk/gesture)} }, sfx:(name | [name, o] | [[name, o], …]), music:(motif | [motif, o]),
  //   do:async G => {}, lines:[ ['SPEAKER', 'text', o] | {who, text, …} | 'narration' | seconds | async G => {} ],
  //   camDone:true, dur:(seconds from the shot's start | 'input'), out:(fade to | {to, dur, color}) }
  async function shot(ctx, sp = {}) {
    chk(ctx);
    const G = ctx.G, t0 = clock;
    if (sp.letterbox !== undefined) G.letterbox(sp.letterbox);
    if (sp.fade !== undefined) { const f = typeof sp.fade === 'object' ? sp.fade : { to: sp.fade }; const p = G.fade(f.to ?? 0, f.dur ?? 0.6, f.color); if (f.wait) await p; }
    if (sp.cam) G.cam(sp.cam);
    const pend = [];
    for (const [id, a] of Object.entries(sp.actors || {})) {
      const A = id === 'aidan' ? G.aidan : G.actor(id, a.preset, a);
      if (a.place !== undefined) {
        if (Array.isArray(a.place) && typeof a.place[0] === 'number') A.place(...a.place);
        else A.place(a.place, a.rot);
      }
      if (a.show) A.show();
      if (a.hide) A.hide();
      if (a.opacity !== undefined && A.raw) A.raw.setOpacity(a.opacity);
      if (a.pose) A.pose(a.pose);
      if (a.look !== undefined) A.look(a.look);
      if (a.eyes !== undefined) { if (Array.isArray(a.eyes)) A.eyes(a.eyes[0], a.eyes[1]); else A.eyes(a.eyes); }
      if (a.expr) A.expr(a.expr);
      if (a.hold) A.hold(...a.hold);
      if (a.turn !== undefined) { const p = A.turn(a.turn); if (a.wait) pend.push(p); }
      if (a.walk !== undefined) { const p = Array.isArray(a.walk) && a.walk.length === 2 && typeof a.walk[1] === 'object' && !Array.isArray(a.walk[1]) ? A.walkTo(a.walk[0], a.walk[1]) : A.walkTo(a.walk); quiet(p); if (a.wait) pend.push(p); }
      if (a.gesture) { const p = Array.isArray(a.gesture) ? A.gesture(a.gesture[0], a.gesture[1] || {}) : A.gesture(a.gesture); quiet(p); if (a.wait) pend.push(p); }
    }
    if (sp.sfx) { const list = typeof sp.sfx === 'string' ? [[sp.sfx]] : Array.isArray(sp.sfx[0]) ? sp.sfx : [sp.sfx]; for (const [n, o] of list) G.sfx(n, o || {}); }
    if (sp.music) { const [m, o] = Array.isArray(sp.music) ? sp.music : [sp.music]; G.music(m, o || {}); }
    if (typeof sp.do === 'function') await sp.do(G);
    for (const line of sp.lines || []) {
      if (typeof line === 'function') await line(G);
      else if (typeof line === 'number') await G.wait(line);
      else if (typeof line === 'string') await G.say(null, line);
      else if (Array.isArray(line)) await G.say(line[0], line[1], line[2] || {});
      else if (line && line.text !== undefined) await G.say(line.who ?? line.speaker ?? null, line.text, line);
    }
    if (pend.length) await G.all(pend);
    if (sp.camDone) await G.camDone();
    if (sp.dur === 'input') await G.waitInput('confirm');
    else if (sp.dur > 0) await G.wait(Math.max(0, sp.dur - (clock - t0)));
    if (sp.out !== undefined) { const f = typeof sp.out === 'object' ? sp.out : { to: sp.out }; await G.fade(f.to ?? 1, f.dur ?? 0.6, f.color); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Built-in flows (ARCHITECTURE §11.1) — Kit's interactables call these
  // ---------------------------------------------------------------------------------------------------------------
  const WAI_LINES = ["Line's open, mate.", "Take your time. I'm not going anywhere.", "You sound tired. That's alright.", 'The girls used to say: you don\'t hang up first.', 'Still here.'];
  const lineText = (l) => (l && typeof l === 'object' ? l.text ?? l.line ?? '' : String(l ?? ''));
  const findInteractable = (id) => { try { return hasWorld() && World.build ? World.build.interactables.find((it) => it.id === id) || null : null; } catch (e) { return null; } };
  async function faceThing(G, it) {
    if (!it || !it.pos || !hasPlayer() || !Player.actor) return;
    const dx = it.pos.x - Player.pos.x, dz = it.pos.z - Player.pos.z;
    if (Math.hypot(dx, dz) > 0.15) await G.aidan.turn([it.pos.x, it.pos.z], 0.35);
  }
  // the save slot picker: Menus 'save' when present (it may save itself or resolve a slot index), else a quiet list
  async function pickAndSave(G) {
    if (!hasSave()) return false;
    const before = Save.seq;
    if (hasMenus()) {
      const r = await G.menu('save', {});
      if (Save.seq !== before) return true;
      const slot = typeof r === 'number' ? r : r && typeof r.slot === 'number' ? r.slot : null;
      if (slot === null || slot < 0) return false;
      return !!Save.save(slot);
    }
    const list = Save.list();
    const opts = list.map((e, i) => (e ? `${i + 1}.  ${e.chapterName} — ${e.area}   ${e.playTimeText}   SAVES ${e.saves}` : `${i + 1}.  NO DATA`));
    opts.push('CANCEL');
    const i = await G.choice(opts, { cancel: opts.length - 1, caps: true });
    if (i < 0 || i >= list.length) return false;
    if (list[i]) {
      const c = await G.choice(['YES', 'NO'], { title: 'Overwrite this save?', cancel: 1, def: 1, caps: true });
      if (c !== 0) return false;
    }
    return !!Save.save(i);
  }

  const builtins = {
    // italic thoughts in order
    async examine(G, lines) {
      for (const l of Array.isArray(lines) ? lines : [lines]) if (l != null && l !== '') await G.think(String(l));
    },
    // give the item, S.taken[id], hide the world model, "Aidan picked up the <name>."; maps: 1 s marker scribble
    async pickup(G, o = {}) {
      const item = o.item || o.itemId;
      if (!item || (o.id && S.taken[o.id])) return false;
      const d = itemDef(item);
      const it = o.id ? findInteractable(o.id) : null;
      if (it) await faceThing(G, it);
      if (hasPlayer() && Player.actor && it && it.pos) {
        quiet(G.aidan.gesture('reach', { hand: 'L', target: [it.pos.x, it.pos.y, it.pos.z] }));
        await G.wait(0.35);
      }
      if (o.id) S.taken[o.id] = true;
      if (o.obj) o.obj.visible = false;
      G.give(item, o.n ?? 1, { silent: true });
      G.sfx('pickup', { vol: 0.8 });
      if (d && d.map) {
        G.sfx('scribble', { dur: 1 });
        await G.msg(o.msg || `Aidan picked up the ${itemName(item)}.`);
        return true;
      }
      await G.msg(o.msg || `Aidan picked up the ${itemName(item)}.`);
      return true;
    },
    // add to S.docs, open the reading view (awaits close), apply the doc's track once, stats.memos++
    async doc(G, o = {}) {
      const docId = o.docId || o.id;
      if (!docId) return false;
      S.docs = S.docs || {};
      const first = !S.docs[docId];
      G.sfx('paper', { vol: 0.8 });
      if (o.open === false) {
        if (first) { S.docs[docId] = { read: false }; stat('memos'); Bus.emit('doc', docId); }
        return first;
      }
      if (first) { S.docs[docId] = { read: false }; stat('memos'); Bus.emit('doc', docId); }
      await openDocView(G, docId);
      S.docs[docId].read = true;
      const d = (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[docId]) || null;
      if (d && d.track && !S.done['doctrack:' + docId]) {
        S.done['doctrack:' + docId] = true;
        for (const k of ['F', 'A']) if (d.track[k]) G.track(k, d.track[k], 'doc:' + docId);
      }
      if (d && typeof d.after === 'function') await d.after(G, first);
      return first;
    },
    // §2A Saving: "Pick up the receiver?" → breathing (or Wai's next line) → "Save your progress?" → slots →
    // "Progress saved." → the handset goes back with a clunk
    async payphone(G, o = {}) {
      const it = o.id ? findInteractable(o.id) : null;
      await faceThing(G, it);
      const pick = await G.choice(['YES', 'NO'], { title: 'Pick up the receiver?', cancel: 1, def: 1, caps: true });
      if (pick !== 0) return false;
      if (it && it.pos && hasPlayer() && Player.actor) quiet(G.aidan.gesture('reach', { hand: 'L', target: [it.pos.x, it.pos.y, it.pos.z] }));
      G.sfx('click', { vol: 0.6 });
      G.sfx('static', { dur: 0.35, vol: 0.35, phone: true });
      await G.wait(0.6);
      const wai = !!(S.flags && S.flags.waiSaved) && S.chapter > 3;
      let line = null, lineIdx = -1, breath = null;
      if (wai) {
        const list = (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.wai_payphone) && DIALOGUE.wai_payphone.length) ? DIALOGUE.wai_payphone : WAI_LINES;
        lineIdx = Math.min(S.waiLine | 0, list.length - 1);
        line = lineText(list[lineIdx]);
        await G.wait(0.5);
        await G.say('WAI (phone)', line, { phone: true });
      } else {
        breath = G.sfx('breath', { n: 2, vol: 0.9 });
        await G.wait(1.2);
        await G.waitOrInput(3.6);
      }
      if (!S.done['payphone:first']) { S.done['payphone:first'] = true; G.prompt('Payphones save your progress.', { id: 'payphone' }); }
      const sv = await G.choice(['YES', 'NO'], { title: 'Save your progress?', cancel: 1, def: 1, caps: true });
      let saved = false;
      if (sv === 0) {
        const prevLine = S.waiLine | 0;
        if (wai) S.waiLine = prevLine + 1;                         // one Wai line per save, in order
        saved = await pickAndSave(G);
        if (!saved) S.waiLine = prevLine;
      }
      if (breath && breath.stop) breath.stop(0.4);
      if (saved) await G.msg('Progress saved.', 2);
      G.sfx('clunk', { vol: 0.9 });
      await G.wait(0.3);
      return saved;
    },
    // once per chapter: the screen fades while the wall clock visibly jumps forward 15 minutes; full heal;
    // AIDAN: "Fifteen-minute break."
    async breakTable(G, o = {}) {
      const key = 'break:ch' + S.chapter;
      if (S.done[key]) { await G.think("Break's over."); return false; }
      const it = o.id ? findInteractable(o.id) : null;
      const c = await G.choice(['YES', 'NO'], { title: 'Take your break?', cancel: 1, def: 1, caps: true });
      if (c !== 0) return false;
      S.done[key] = true;
      const wall = o.clock || (it && it.obj && it.obj.userData && it.obj.userData.clock) || null;
      await G.fade(1, 0.8);
      // sit Aidan at the table (on its near side), facing it
      if (it && hasPlayer() && Player.actor) {
        const tbl = it.obj, yaw = tbl ? tbl.rotation.y : 0;
        const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
        const lx = -0.3, lz = -0.62;
        const x = it.pos.x + lx * c0 + lz * s0, z = it.pos.z - lx * s0 + lz * c0;
        G.aidan.place(x, z, yaw / D2R);
        G.aidan.pose('sit', { blend: 0 });
      }
      if (wall && wall.userData && typeof wall.userData.addMinutes === 'function' && hasCam()) {
        const cp = wall.getWorldPosition(V3());
        const n = V3(0, 0, 1).transformDirection(wall.matrixWorld);
        const eye = cp.clone().addScaledVector(n, 1.7).add(V3(0.25, -0.3, 0));
        G.cam({ pos: [eye.x, eye.y, eye.z], target: [cp.x, cp.y, cp.z], fov: 32 });
        await G.fade(0.55, 0.9);
        wall.userData.addMinutes(15, G.skipping ? 0 : 2.4);
        const tick = G.sfx('clock_tick', { loop: true, vol: 0.5 });
        await G.wait(2.6);
        if (tick && tick.stop) tick.stop(0.2);
        await G.fade(1, 0.7);
        G.camRelease();
      } else await G.wait(1.5);
      G.heal(100);
      if (hasPlayer() && Player.actor) G.aidan.pose('idle', { blend: 0 });
      await G.wait(0.4);
      await G.fade(0, 0.9);
      await G.say('AIDAN', 'Fifteen-minute break.');
      return true;
    },
    // locked / key / chapter-lock messages or the 1.5 s transition (World owns the door flow)
    door(G, door) { if (hasWorld() && World.useDoor) return World.useDoor(door, G); return false; },
    // heal items (coffee 25, energy 50, first aid 100 — difficulty-independent), weapons equip, keys on the door ahead
    async useItem(G, itemId) {
      const d = itemDef(itemId);
      if (!itemId || invCount(itemId) <= 0) return false;
      if (d && typeof d.use === 'function') { const r = await d.use(G); stat('itemsUsed'); return r ?? true; }
      const heal = (d && d.heal) || { coffee: 25, energy_drink: 50, first_aid: 100 }[itemId] || 0;
      if (heal > 0) {
        if (S.health >= 100) { G.msg("I'm alright for now."); return false; }
        G.take(itemId, 1);
        G.heal(heal);
        stat('itemsUsed');
        G.sfx(itemId === 'first_aid' ? 'plastic' : itemId === 'energy_drink' ? 'click' : 'paper', { vol: 0.7 });
        return true;
      }
      if (d && d.cat === 'weapon') { S.equipped = itemId; G.sfx('handle', { vol: 0.5 }); return true; }
      // a key on the locked door Aidan is facing
      const tgt = hasPlayer() ? Player.interactTarget : null;
      if (tgt && tgt.kind === 'door' && hasWorld()) {
        const rec = (World.doors || {})[tgt.id] || Object.values(World.doors || {}).find((dr) => dr.obj === tgt.obj);
        if (rec && rec.key === itemId) {
          World.door(rec.id).unlock();
          G.sfx('unlock', { vol: 0.8 });
          stat('itemsUsed');
          await G.msg(`Used the ${itemName(itemId)}.`);
          return true;
        }
      }
      await G.msg('Nothing happens.');
      return false;
    },
    // Ollie stickers: kept across playthroughs (META) for the Yes ending
    async sticker(G, o = {}) {
      if (!o.id) return false;
      S.stickers = S.stickers || {};
      S.stickers[o.id] = true;
      if (typeof META !== 'undefined') { META.stickers = META.stickers || {}; META.stickers[o.id] = true; try { saveMeta(); } catch (e) { /* storage */ } }
      if (o.obj) o.obj.visible = false;
      G.sfx('tape', { vol: 0.6 });
      await G.msg('Aidan picked up the Ollie sticker.');
      return true;
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------------------------------------------
  // a script survives the room change while it — or anything it is waiting on (a cutscene it played) — is inside G.goto
  const gotoBusy = (c) => c.inGoto > 0 || [...c.children].some(gotoBusy);
  Bus.on('room:leave', () => {
    for (const c of [...live]) if (c.roomBound && !c.aborted && !gotoBusy(c)) abort(c, 'room');
    for (const [id, raw] of actorReg) { try { raw.root.removeFromParent(); raw.dispose(); } catch (e) { /* gone */ } actorReg.delete(id); }
  });
  Bus.on('death', () => abortAll('death'));

  function playCutscene(id, o = {}) {
    const cs = typeof CUTSCENES !== 'undefined' ? CUTSCENES[id] : null;
    if (!cs) { console.warn(`[Script] no cutscene "${id}"`); return Promise.resolve(undefined); }
    S.done['cs:' + id] = true;
    return run(cs.fn, { ...cs.opts, ...o, name: 'cs:' + id, cutscene: id });
  }
  function choose(i) {
    if (!choiceSt) return false;
    const st = choiceSt;
    st.override = i | 0;
    choiceSt = null;               // Script.choosing is false at once (the G.choice finishes on the next microtask)
    ui('choice', []);              // closes the open list (resolves it); G.choice returns the override
    return true;
  }
  function advance() {
    const lines = waits.filter((w) => w.kind === 'line' || (w.kind === 'input' && w.action === 'confirm'));
    if (!lines.length) return false;
    settle(lines[lines.length - 1], 'input');
    return true;
  }

  const api = {
    ABORT, run, update, skip, abort, abortAll, playCutscene, choose, advance, builtins, readDoc, owns,
    seen: (id) => !!(S.done && S.done['cs:' + id]),
    wait: (s) => waitTime(null, s),
    until: (pred, o) => waitUntil(null, pred, o),
    list: () => [...live, ...queue].map((c) => ({ id: c.id, name: c.name, blocking: c.blocking, skipping: c.skipping, letterbox: c.lb, queued: c.queued, roomBound: c.roomBound, suspended: c.suspended > 0, control: !c.lockHeld })),
    get time() { return clock; },
    get busy() { return !!holder(); },
    get active() { const c = activeBlocking(); return c ? c.name : null; },
    get cutscene() { const c = activeBlocking(); return !!(c && c.letterbox && !c.suspended); },
    get skippable() { return !!skipTarget(); },
    get skipping() { return anySkipping(); },
    get choosing() { return !!choiceSt; },
    get queued() { return queue.length; },
  };
  return api;
})();
