// ==== engine/10b_menus.js — Menus: every screen outside play (ARCHITECTURE §10.2; spec §2A, §12) ====
//
// Screens: title, newgame, calibrate, pause, items (3D), map, memos, doc (reading view), phone, options, save, load,
// death, results, credits, fates, extra. Spec §2A throughout: black, quiet, serif, off-white and grey; no panels or
// modern icons; every screen fades through black over 0.3–0.5 s (the pause menu fades in over the game dimmed to 40 %,
// the phone over the blurred, dimmed game); nothing slides, bounces or scales in; film grain stays on (UI.grainOverlay at
// 60 %, Render.post.menu); UI sounds on every move / confirm / cancel / page (Snd ui_move, ui_confirm, ui_cancel, paper,
// whoosh, keypress on the phone). Keyboard, mouse (hover selects, click confirms, right click backs out, wheel, drag)
// and gamepad (D-pad / stick navigate, A confirms, B backs out, LB/RB switch tabs and floors, Start closes pause).
// DOM lives in one .mn root (z-index 50 inside #ui, under UI's grain) plus one <style id="mn-style">.
//
// API (contract §10.2)
//   Menus.open(name, opts) → Promise<result>  Opens a screen. With a screen already open, the new one opens over it and
//                                             returns to it when closed. Opening the screen already on top returns
//                                             that screen's promise.
//   Menus.close(result) → Promise             Closes every open screen; each resolves `result` (default null) mapped
//                                             by its screen (pause → 'resume').
//   Menus.isOpen()  true while a screen is up or a menu transition (incl. the fade back to the game) is running.
//   Menus.current   name of the top screen | null.
//   Menus.update(dt) main loop (before Script.update). dt > 0 is used as given, else real time is measured. If nobody
//                    calls it for 250 ms while a screen is open, a requestAnimationFrame fallback drives it (and
//                    Render.render too when there is no Game, so partial builds and tests work).
// Results (what each screen's promise resolves with) and options
//   title    {choice:'newgame', action, riddle} | {choice:'load', slot} | {choice:'ngplus', action, riddle}. Text only —
//            Game renders the Lookout backdrop behind it. NEW GAME runs the setup and, the first time ever
//            (!META.calibrated), the brightness calibration; LOAD GAME runs the slot picker; OPTIONS; EXTRA (after the
//            first ending). A distant phone rings (Snd 'ring', far) until the first keypress, which cuts it mid-ring.
//            opts: {intro:true (3 s of black and static hiss first), onIdle({signal}) → Promise (called after idleTime
//            (60) idle seconds: play the attract sequence and resolve when it ends; `signal` (AbortSignal) aborts when
//            the player touches anything — the title then fades back), idleTime}.
//   newgame  {choice:'newgame'|'ngplus', action:'easy'|'normal'|'hard', riddle} | null.  opts {ngplus, action, riddle,
//            calibrate:true (also run the calibration afterwards)}.
//   calibrate  the chosen brightness (META.options.brightness, applied live; META.calibrated = true) | null when backed
//            out (opened from Options: the old value is restored). opts {first} (Esc then also accepts).
//   pause    'resume' | 'title' (QUIT TO TITLE asks first).         items, map, memos, phone, options, doc → null.
//   items    opts {tab: 0|1|2, id}.  map  opts {id (map id or map item id), floor, force}.  phone  opts {tab: 0..3}.
//   doc      opts {id, mark:true (marks the doc found/read via Script.readDoc, applying its track once)}.
//   save     {slot, saved:true} | null — the screen writes the save itself (Save.save). opts {message:true → also shows
//            "Progress saved."; the payphone flow shows it after the screen closes}.
//   load     0 | 1 | 2 | 'auto' | null.
//   death    'continue' | 'load' | 'title' ('load' = the player chose LOAD GAME: Game opens Menus.open('load') and
//            reopens death if that returns null). Opens over UI.noSignal({keep:true}) without a flicker and clears the
//            UI's own NO SIGNAL underneath. opts {delay, noSignal:true}.
//   results  {ending, endingName, stars, time, saves, walked, ran, freed, stomped, killed, itemsUsed, damage,
//            voicemails, callsAnswered, memos, memosTotal, lost, playthrough}. opts {ending:'connected'|'coverage'|
//            'tomorrow'|'yes', name, stats, memos, memosTotal, record (true → Save.recordEnding(ending, result))}.
//   credits  true. opts {lines (strings, '' = a gap, {title}, {head}, {role, name}, {text, italic}; default
//            DIALOGUE.credits), ending (picks the music), music:'nan'|'static'|'hold'|null, speed (vh/s, 3.9)}.
//            Hold confirm to speed it up.
//   fates    true. opts {cards: string[]} (default Menus.fateCards(S): spec §12 texts by the five fate flags).
//   extra    {choice:'ngplus', action, riddle} | null.
// Screens that end the game view — title (when it resolves), newgame, load, death, results, credits, fates, extra, and
// pause → 'title' — leave the screen BLACK (UI.fade(1)) when they close: Game fades in when the next thing is ready.
// In-game screens restore the game view (Render post / freeze / overlay are saved on open and restored on close).
// Items: USE on a heal item heals in place (coffee 25, energy drink 50, first aid 100 unless ITEMS[id].heal), weapons
// equip, map items open that map; keys facing their door and ITEMS[id].use close the menus and run
// Script.builtins.useItem in the game; anything else: "Nothing happens.". Phone: playing a voicemail closes the menus
// and plays it (Phone.playVoicemail).
//
// CONTRACT+: Menus.back(result) (close only the top screen), Menus.stack (names, bottom → top), Menus.busy,
//   Menus.rank(stats) (§2A star rules), Menus.results(opts) (the results record without showing it),
//   Menus.fateCards(S), Menus.memoCount() → {found, total} (riddle-level variants count once), Menus.nav(action)
//   (inject 'up'|'down'|'left'|'right'|'confirm'|'cancel'|'any' — tests), Menus._top (the top screen instance — tests),
//   Menus.SCREENS. Bus: 'menu'(open, name) for every screen, 'title:idle', 'equip'(id), 'item:use'(id),
//   'item:combine'(a, b, result), 'item:detail'(itemId, i) when an examine detail is first seen (also sets
//   S.done['detail:<id>:<i>']).
//   Data read here: ITEMS[id].{name, cat, desc, model(), heal, map, ammo, details:[{text, face:[x,y,z] (model-local
//   direction that must face the viewer; omit = always shown), zoom (minimum examine zoom), min (dot threshold, 0.8)}],
//   combine:{otherId:{result, n, msg, keep}} | fn(otherId, G)}; DOCUMENTS[id].{title, group, paper, text, hand} (a line
//   written ~~like this~~ is struck through); MAPS[id] per contract §10.6 plus {sub, printed, publisher, scale,
//   floorOrder, stains, of:'<paper map id>' (receipt maps), sameFrame}, shapes also {t:'line', pts, dash},
//   {t:'stairs', x,y,w,h, axis}, {dash, fill, lw, size, rot, lx, ly}; room.map.{outage (receipt map id), rxform,
//   rfloor} — without rxform (or MAPS[receipt].sameFrame) the receipt map shows no arrow.
// CONTRACT+ (maintenance): ITEMS desc / details / detail text may be functions of S; the doc view grows short texts
//   (≤ 1.6× design size) and takes opts.page / opts.highlight; map floor names (MAPS floorNames or B/G/L4 → words), a
//   third zoom step, notes kept on the sheet, Bus 'menu:before'(name, opts) before a screen is built.
const Menus = (() => {
  const SERIF = "Georgia, 'Times New Roman', Times, serif";
  const MONO = "'Courier New', Courier, monospace";
  const SANS = "Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif";
  const COL = { title: '#d9d6cc', dim: '#6f6f6a', sel: '#e8e4d8', text: '#f0ede4', off: '#35352f', faint: '#4b4b46' };
  const TAU = Math.PI * 2;
  const clamp = U.clamp;
  const rnow = () => performance.now() / 1000;
  const ez = (t) => U.ease.sine(clamp(t));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (name, o) => { try { return Snd.play(name, o); } catch (e) { return null; } };
  const ui = (fn, ...a) => { try { if (typeof UI !== 'undefined' && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[Menus] UI.' + fn, e); } return undefined; };
  const inp = (fn, ...a) => { try { if (typeof Input[fn] === 'function') return Input[fn](...a); } catch (e) { /* input not ready */ } return undefined; };
  const renderLive = () => { try { return !!Render.renderer; } catch (e) { return false; } };
  const hasGame = () => typeof Game !== 'undefined';
  const hasSave = () => typeof Save !== 'undefined' && !!Save;
  const hasScript = () => typeof Script !== 'undefined' && !!Script;
  const hasPhone = () => typeof Phone !== 'undefined' && !!Phone;
  const itemDef = (id) => (typeof ITEMS !== 'undefined' && ITEMS[id]) || null;
  const persistMeta = () => { try { if (hasSave()) Save.saveMeta(); else saveMeta(); } catch (e) { /* storage */ } };
  const gamepadUsed = () => { try { return Input.lastDevice === 'gamepad'; } catch (e) { return false; } };
  const DPR = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  function mk(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  const upper = (s) => String(s ?? '').toUpperCase();
  const status = (h) => (h >= 70 ? 'FINE' : h >= 35 ? 'CAUTION' : 'DANGER');
  const fmtDist = (m) => { m = Math.max(0, +m || 0); return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; };

  // =================================================================================================================
  // Tweens (stepped by update; real time)
  // =================================================================================================================
  const tweens = new Set();
  class Tw {
    constructor(apply, v = 0) { this.apply = apply; this.v = v; this.a = v; this.b = v; this.t = 1; this.dur = 0; this.delay = 0; this.res = null; apply(v); }
    get target() { return this.b; }
    get busy() { return tweens.has(this); }
    to(b, dur = 0.35, delay = 0) {
      this.settle();
      if (!(delay > 0) && (!(dur > 0) || Math.abs(this.v - b) < 1e-4)) { this.jump(b); return Promise.resolve(); }
      this.a = this.v; this.b = b; this.t = 0; this.dur = Math.max(1e-3, dur); this.delay = Math.max(0, delay);
      tweens.add(this);
      return new Promise((r) => { this.res = r; });
    }
    jump(b) { this.settle(); this.a = this.b = this.v = b; this.t = 1; this.delay = 0; tweens.delete(this); this.apply(b); }
    step(dt) {
      if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return; dt = -this.delay; this.delay = 0; }
      this.t = Math.min(1, this.t + dt / this.dur);
      this.v = this.a + (this.b - this.a) * ez(this.t);
      this.apply(this.v);
      if (this.t >= 1) { tweens.delete(this); this.settle(); }
    }
    settle() { if (this.res) { const r = this.res; this.res = null; r(); } }
  }
  const opac = (...els) => (v) => {
    const o = v <= 0.002 ? 0 : v >= 0.998 ? 1 : +v.toFixed(3);
    for (const el of els) { el.style.opacity = o; el.style.visibility = o === 0 ? 'hidden' : 'visible'; }
  };
  const fader = (el, v = 0) => new Tw(opac(el), v);

  // =================================================================================================================
  // CSS
  // =================================================================================================================
  const SH_ = '0 0 .3em rgba(0,0,0,.9),0 0 1em rgba(0,0,0,.7)';
  const CSS = `
#ui .mn{position:absolute;inset:0;z-index:50;pointer-events:none;visibility:hidden;font-family:${SERIF};color:${COL.title};}
#ui .mn.on{visibility:visible;pointer-events:auto;}
#ui .mn-back,#ui .mn-cur{position:absolute;inset:0;background:#000;visibility:hidden;opacity:0;}
#ui .mn-back{z-index:1}#ui .mn-scr{position:absolute;inset:0;z-index:2}#ui .mn-cur{z-index:3;pointer-events:none}
#ui .mn-s{position:absolute;inset:0;visibility:hidden;opacity:0;overflow:hidden;}
#ui .mn-abs{position:absolute}
#ui .mn-list{position:absolute;display:flex;flex-direction:column;}
#ui .mn-it{font-size:clamp(18px,1.85vh,20px);letter-spacing:.16em;color:${COL.dim};text-transform:uppercase;padding:.34em 0;cursor:default;white-space:nowrap;text-shadow:${SH_};}
#ui .mn-it>span{display:inline-block;padding-bottom:.14em;border-bottom:1px solid transparent;}
#ui .mn-it.sel{color:${COL.sel}}#ui .mn-it.sel>span{border-bottom-color:rgba(232,228,216,.72)}
#ui .mn-it.off{color:${COL.off}}#ui .mn-it.off.sel{color:#55554f}#ui .mn-it.off.sel>span{border-bottom-color:rgba(85,85,79,.6)}
#ui .mn-h{font-size:clamp(11px,1.38vh,17px);letter-spacing:.34em;color:${COL.dim};text-transform:uppercase;white-space:nowrap;}
#ui .mn-legend{position:absolute;left:0;right:0;bottom:3.3vh;text-align:center;font-size:clamp(10px,1.2vh,14px);letter-spacing:.26em;color:${COL.faint};text-transform:uppercase;white-space:pre;text-shadow:0 0 .4em rgba(0,0,0,.9);}
#ui .mn-msg{position:absolute;left:8vw;right:8vw;text-align:center;font-size:clamp(16px,2.4vh,30px);line-height:1.4;color:${COL.text};text-shadow:${SH_};}
#ui .mn-list.mn-row,#ui .mn-row{display:flex;flex-direction:row;justify-content:center;gap:3.2em;}
#ui .mn-dot{display:inline-block;width:.34em;height:.34em;border-radius:50%;background:#b9b5a8;margin-right:.9em;vertical-align:.18em;}
#ui .mn-nodot{display:inline-block;width:.34em;margin-right:.9em;}
#ui .mn-ticks{display:inline-flex;gap:.28em;align-items:flex-end;height:.9em;vertical-align:-.05em;}
#ui .mn-ticks i{display:block;width:2px;height:100%;background:#2a2a27;}
#ui .mn-ticks i.on{background:currentColor}
#ui .mn-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;}
/* title */
#ui .tt-cover{position:absolute;inset:0;background:#000;}
#ui .tt-shade{position:absolute;inset:0;background:radial-gradient(ellipse 75% 46% at 50% 100%,rgba(0,0,0,.88),rgba(0,0,0,.46) 55%,rgba(0,0,0,0) 100%),radial-gradient(ellipse 60% 22% at 50% 40%,rgba(0,0,0,.22),rgba(0,0,0,0) 100%);}
#ui .tt-name{position:absolute;left:0;right:0;top:36%;text-align:center;font-size:clamp(28px,5.6vh,80px);letter-spacing:.3em;padding-left:.3em;color:${COL.title};text-shadow:0 0 .5em rgba(0,0,0,.6),0 0 1.6em rgba(0,0,0,.4);}
#ui .tt-press{position:absolute;left:0;right:0;top:49%;text-align:center;font-size:clamp(11px,1.5vh,19px);letter-spacing:.44em;padding-left:.44em;color:#a8a59b;text-shadow:${SH_};}
#ui .tt-menu{left:0;right:0;bottom:8vh;align-items:center;}
#ui .tt-menu .mn-it{padding:.26em 0;color:${COL.dim}}
#ui .tt-menu .mn-it.sel{color:${COL.sel}}
#ui .tt-menu .mn-it.off{color:rgba(120,118,110,.5)}
/* new game */
#ui .ng-wrap{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;}
#ui .ng-sec{display:flex;flex-direction:column;align-items:center;margin-bottom:6.5vh;}
#ui .ng-h{font-size:clamp(12px,1.5vh,19px);letter-spacing:.36em;padding-left:.36em;color:${COL.dim};margin-bottom:2.2vh;}
#ui .ng-sec.sel .ng-h{color:${COL.title}}
#ui .ng-opts{display:flex;gap:3.4em;}
#ui .ng-o{font-size:clamp(18px,1.85vh,20px);letter-spacing:.16em;color:${COL.off};cursor:default;}
#ui .ng-o>span{display:inline-block;padding-bottom:.14em;border-bottom:1px solid transparent;}
#ui .ng-o.cur{color:${COL.dim}}#ui .ng-sec.sel .ng-o.cur{color:${COL.sel}}
#ui .ng-o.cur>span{border-bottom-color:rgba(111,111,106,.6)}#ui .ng-sec.sel .ng-o.cur>span{border-bottom-color:rgba(232,228,216,.72)}
#ui .ng-d{margin-top:1.9vh;font-style:italic;font-size:clamp(13px,1.7vh,21px);color:#8d8b83;height:1.4em;white-space:nowrap;}
#ui .ng-sec.sel .ng-d{color:#bdb9ae}
#ui .ng-go{margin-top:1vh}
/* calibrate */
#ui .cb-bar{position:absolute;left:50%;top:38%;width:1.1vh;height:9vh;transform:translate(-50%,-50%);background:#060606;}
#ui .cb-t{position:absolute;left:0;right:0;top:58%;text-align:center;font-size:clamp(15px,2.2vh,28px);color:${COL.text};}
/* pause */
#ui .ps-list{left:11vw;top:50%;transform:translateY(-50%);}
#ui .ps-area{position:absolute;right:4.2vw;top:5.2vh;font-size:clamp(11px,1.4vh,17px);letter-spacing:.3em;color:${COL.title};text-shadow:${SH_};white-space:nowrap;}
#ui .mn-ask{position:absolute;left:0;right:0;bottom:17vh;display:flex;flex-direction:column;align-items:center;visibility:hidden;opacity:0;}
#ui .mn-ask-t{font-size:clamp(15px,2.1vh,26px);color:${COL.text};margin-bottom:.4em;text-shadow:${SH_};}
#ui .mn-ask-s{font-size:clamp(12px,1.55vh,19px);font-style:italic;color:#8d8b83;margin-bottom:1.4em;}
/* items */
#ui .it-tabs{position:absolute;left:0;right:0;top:5.4vh;text-align:center;font-variant:small-caps;font-size:clamp(16px,2.2vh,27px);letter-spacing:.14em;color:${COL.faint};white-space:nowrap;}
#ui .it-tab{display:inline-block;padding-bottom:.08em;border-bottom:1px solid transparent;cursor:default;}
#ui .it-tab.sel{color:${COL.sel};border-bottom-color:rgba(232,228,216,.7)}
#ui .it-sep{display:inline-block;margin:0 1.1em;color:${COL.off}}
#ui .it-status{position:absolute;left:4.4vw;top:5vh;}
#ui .it-status canvas{display:block;margin:1vh 0 .8vh;}
#ui .it-word{font-size:clamp(10px,1.3vh,16px);letter-spacing:.34em;}
#ui .it-eq{position:absolute;right:4.4vw;top:19.5vh;width:17vw;text-align:center;}
#ui .it-eq-n{font-size:clamp(10px,1.3vh,16px);letter-spacing:.28em;color:${COL.title};white-space:nowrap;}
#ui .it-eq-a{margin-top:.5em;font-size:clamp(12px,1.55vh,19px);letter-spacing:.12em;color:${COL.dim};}
#ui .it-name{position:absolute;left:0;right:0;top:73.5vh;text-align:center;font-size:clamp(17px,2.35vh,29px);letter-spacing:.22em;padding-left:.22em;color:${COL.sel};text-shadow:${SH_};white-space:nowrap;}
#ui .it-qty{letter-spacing:.06em;color:${COL.dim};margin-left:.6em}
#ui .it-desc{position:absolute;left:12vw;right:12vw;top:79vh;text-align:center;font-style:italic;font-size:clamp(14px,1.9vh,23px);color:#b3afa4;text-shadow:${SH_};}
#ui .it-msg{position:absolute;left:10vw;right:10vw;top:84.5vh;text-align:center;font-size:clamp(14px,1.95vh,24px);color:${COL.text};text-shadow:${SH_};visibility:hidden;opacity:0;}
#ui .it-cmd{left:62vw;top:40vh;visibility:hidden;opacity:0;}
#ui .it-cmd .mn-it{font-size:clamp(15px,1.8vh,22px);padding:.26em 0}
#ui .it-comb{position:absolute;left:0;right:0;top:67.5vh;text-align:center;font-size:clamp(11px,1.4vh,17px);letter-spacing:.34em;color:#a8a59b;visibility:hidden;opacity:0;}
#ui .it-none{position:absolute;left:0;right:0;top:52vh;text-align:center;font-style:italic;font-size:clamp(14px,1.9vh,23px);color:${COL.faint};}
#ui .it-row2d{position:absolute;left:0;right:0;top:55vh;display:flex;justify-content:center;gap:4vw;font-size:clamp(13px,1.6vh,20px);letter-spacing:.2em;color:${COL.dim};}
#ui .it-row2d .sel{color:${COL.sel}}
#ui .it-exd{position:absolute;left:12vw;right:12vw;bottom:11vh;text-align:center;font-style:italic;font-size:clamp(15px,2.15vh,27px);color:${COL.text};text-shadow:${SH_};visibility:hidden;opacity:0;}
#ui .it-exn{position:absolute;left:0;right:0;top:5.4vh;text-align:center;font-size:clamp(12px,1.5vh,19px);letter-spacing:.34em;padding-left:.34em;color:${COL.dim};}
/* map */
#ui .mp-floors{position:absolute;left:0;right:0;top:3.6vh;text-align:center;font-variant:small-caps;font-size:clamp(14px,1.9vh,24px);letter-spacing:.2em;color:#77746b;white-space:nowrap;text-shadow:${SH_};}
#ui .mp-f{display:inline-block;margin:0 .9em;padding-bottom:.06em;border-bottom:1px solid transparent;cursor:default;}
#ui .mp-f.sel{color:${COL.sel};border-bottom-color:rgba(232,228,216,.7)}
/* memos */
#ui .mm-head{position:absolute;left:6vw;top:6vh;}
#ui .mm-view{position:absolute;left:9vw;top:13vh;bottom:11vh;width:52vw;overflow:hidden;}
#ui .mm-list{position:absolute;left:0;right:0;top:0;}
#ui .mm-list .mn-it.mm-g{font-size:clamp(10px,1.3vh,16px);letter-spacing:.36em;color:${COL.faint};padding:2.2vh 0 .5vh;text-shadow:none;}
#ui .mm-list .mn-it.mm-g:first-child{padding-top:0}
#ui .mm-list .mn-it{padding:.22em 0;font-size:clamp(16px,1.9vh,24px)}
#ui .mm-count{position:absolute;right:6vw;top:6vh;}
/* doc */
#ui .dc-page{position:absolute;left:0;right:0;bottom:2.2vh;text-align:center;font-size:clamp(10px,1.25vh,15px);letter-spacing:.3em;color:${COL.faint};}
/* phone */
#ui .ph-wrap{position:absolute;inset:0;}
#ui .ph-wrap canvas{position:absolute;display:block;}
#ui .ph-lcd{image-rendering:pixelated;image-rendering:crisp-edges;}
/* options */
#ui .op-head{position:absolute;left:0;right:0;top:9vh;text-align:center;}
#ui .op-rows{position:absolute;left:24vw;right:24vw;top:17vh;}
#ui .op-row{display:flex;justify-content:space-between;align-items:baseline;}
#ui .op-v{letter-spacing:.12em;}
/* save / load */
#ui .sv-head{position:absolute;left:0;right:0;top:12vh;text-align:center;}
#ui .sv-rows{position:absolute;left:16vw;right:16vw;top:23vh;}
#ui .sv-row{display:grid;grid-template-columns:9em 1fr 6.5em 6.5em;align-items:baseline;padding:1.5vh 0;border-bottom:1px solid transparent;color:${COL.dim};cursor:default;font-size:clamp(15px,1.85vh,23px);letter-spacing:.1em;text-shadow:${SH_};}
#ui .sv-row.sel{color:${COL.sel};border-bottom-color:rgba(232,228,216,.35)}
#ui .sv-slot{letter-spacing:.24em;font-size:.82em}
#ui .sv-a{display:block;font-size:.78em;letter-spacing:.2em;color:${COL.faint};margin-top:.35em}
#ui .sv-row.sel .sv-a{color:#8f8c83}
#ui .sv-t,#ui .sv-n{text-align:right;font-size:.86em}
#ui .sv-empty{font-style:italic;letter-spacing:.06em;color:${COL.off}}
#ui .sv-row.sel .sv-empty{color:${COL.dim}}
/* death */
#ui .dt-ns{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:clamp(11px,1.6vh,20px);letter-spacing:.42em;padding-left:.42em;color:${COL.title};}
#ui .dt-list{left:0;right:0;top:61%;align-items:center;}
/* results */
#ui .rs-name{position:absolute;left:0;right:0;top:9vh;text-align:center;font-size:clamp(20px,3.3vh,44px);letter-spacing:.3em;padding-left:.3em;color:${COL.title};}
#ui .rs-rows{position:absolute;left:32vw;right:32vw;top:20vh;}
#ui .rs-row{display:flex;justify-content:space-between;font-size:clamp(13px,1.7vh,21px);letter-spacing:.14em;color:${COL.dim};padding:.42vh 0;}
#ui .rs-row b{font-weight:normal;color:${COL.sel};letter-spacing:.08em}
#ui .rs-gap{height:1.6vh}
#ui .rs-rank{position:absolute;left:0;right:0;top:80vh;display:flex;flex-direction:column;align-items:center;}
#ui .rs-rank svg{display:block;margin-top:1.4vh;}
/* credits / fates */
#ui .cr-roll{position:absolute;left:0;right:0;top:0;text-align:center;}
#ui .cr-title{font-size:clamp(24px,4.4vh,62px);letter-spacing:.3em;padding-left:.3em;color:${COL.title};margin:2vh 0;}
#ui .cr-head{font-size:clamp(10px,1.35vh,17px);letter-spacing:.38em;padding-left:.38em;color:${COL.dim};margin:5vh 0 1.4vh;text-transform:uppercase;}
#ui .cr-line{font-size:clamp(14px,2.1vh,27px);line-height:1.7;color:${COL.title};letter-spacing:.06em;}
#ui .cr-line.it{font-style:italic;color:#b3afa4;letter-spacing:.02em}
#ui .cr-pair{display:flex;justify-content:center;gap:2.4em;font-size:clamp(13px,1.95vh,25px);line-height:1.75;letter-spacing:.1em;}
#ui .cr-pair span:first-child{flex:1;text-align:right;color:${COL.dim};font-size:.8em;letter-spacing:.26em;}
#ui .cr-pair span:last-child{flex:1;text-align:left;color:${COL.title};}
#ui .cr-gap{height:4.5vh}
#ui .ft-card{position:absolute;left:14vw;right:14vw;top:50%;transform:translateY(-50%);text-align:center;font-size:clamp(16px,2.55vh,33px);line-height:1.62;color:${COL.title};}
/* extra */
#ui .ex-list{left:11vw;top:50%;transform:translateY(-50%);}
#ui .ex-panel{position:absolute;left:44vw;right:8vw;top:50%;transform:translateY(-50%);font-size:clamp(14px,1.8vh,22px);color:${COL.dim};letter-spacing:.1em;line-height:2.1;}
#ui .ex-panel b{font-weight:normal;color:${COL.sel}}
#ui .ex-panel .it{font-style:italic;letter-spacing:.02em;color:#8d8b83;line-height:1.5}
#ui .ex-res{display:grid;grid-template-columns:1fr auto auto;gap:0 2.2em;align-items:center;}
`;

  // =================================================================================================================
  // DOM root, stack, transitions
  // =================================================================================================================
  let inited = false, root = null, backEl = null, scrEl = null, curEl = null;
  let backF = null, curF = null;
  const stack = [];
  let busyN = 0;
  let chain = Promise.resolve();
  const enqueue = (fn) => { busyN++; chain = chain.then(fn).catch((e) => console.error('[Menus] transition', e)).then(() => { busyN--; }); return chain; };
  let sess = null;            // what the first screen found (Render post/freeze/overlay) — restored when the last closes
  let lastExt = -1e9, lastReal = 0, selfTickOn = false;
  const mouseQ = { cancel: false, drag: { dx: 0, dy: 0 }, down: false, lx: 0, ly: 0 };
  const injected = [];
  let padPrev = [];
  let W = 0, H = 0;

  function init() {
    if (inited) return api;
    inited = true;
    ui('init');
    const host = document.getElementById('ui') || document.body;
    if (!document.getElementById('mn-style')) { const st = document.createElement('style'); st.id = 'mn-style'; st.textContent = CSS; document.head.appendChild(st); }
    root = mk('div', 'mn', host);
    backEl = mk('div', 'mn-back', root);
    scrEl = mk('div', 'mn-scr', root);
    curEl = mk('div', 'mn-cur', root);
    backF = new Tw(opac(backEl), 0);
    curF = new Tw(opac(curEl), 0);
    // mouse: right button backs out; left-button drag rotates (examine) / pans (map)
    root.addEventListener('mousedown', (e) => {
      if (e.button === 2) { mouseQ.cancel = true; e.preventDefault(); }
      if (e.button === 0) { mouseQ.down = true; mouseQ.lx = e.clientX; mouseQ.ly = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseQ.down = false; });
    window.addEventListener('mousemove', (e) => {
      if (!mouseQ.down || !isOpen()) return;
      mouseQ.drag.dx += e.clientX - mouseQ.lx; mouseQ.drag.dy += e.clientY - mouseQ.ly;
      mouseQ.lx = e.clientX; mouseQ.ly = e.clientY;
    });
    W = window.innerWidth; H = window.innerHeight;
    lastReal = rnow();
    return api;
  }
  const ensure = () => { if (!inited) init(); };
  const top = () => stack[stack.length - 1] || null;
  // open while any screen is up or a menu transition is still running (the last fade back to the game included)
  function isOpen() { return stack.length > 0 || busyN > 0; }

  let uid = 0;
  function makeScreen(name, opts, parent) {
    const def = SCREENS[name];
    let res;
    const promise = new Promise((r) => { res = r; });
    const sc = { id: ++uid, name, def, opts: opts || {}, parent: parent || null, el: null, fade: null, st: {}, t: 0, ready: false, closing: false, built: false, resolve: res, promise, then: null };
    sc.close = (v) => closeScreen(sc, v);
    sc.exit = (v, then) => exitStack(v, then);
    sc.push = (n, o) => pushChild(sc, n, o);
    sc.replace = (n, o) => replaceScreen(sc, n, o);
    return sc;
  }
  function open(name, opts = {}) {
    ensure();
    if (!SCREENS[name]) { console.warn(`[Menus] unknown screen "${name}"`); return Promise.resolve(null); }
    const live = stack.filter((s) => !s.closing), t = live[live.length - 1] || null;
    if (t && t.name === name && top() === t) return t.promise;
    if (t) return pushChild(t, name, opts);
    const sc = makeScreen(name, opts, null);
    if (!stack.length) { stack.push(sc); enqueue(() => enterFirst(sc)); }
    else enqueue(() => { stack.push(sc); return enterFirst(sc); });     // after the closing screens have gone
    return sc.promise;
  }
  function pushChild(parent, name, opts) {
    ensure();
    if (!SCREENS[name]) { console.warn(`[Menus] unknown screen "${name}"`); return Promise.resolve(null); }
    const sc = makeScreen(name, opts, parent);
    parent.ready = false;
    stack.push(sc);
    enqueue(() => swap(parent, sc, false));
    return sc.promise;
  }
  function replaceScreen(sc, name, opts) {
    if (sc.closing || !SCREENS[name]) return sc.promise;
    sc.closing = true; sc.ready = false;
    const nsc = makeScreen(name, opts, sc.parent);
    nsc.resolve = sc.resolve; nsc.promise = sc.promise;
    const i = stack.indexOf(sc);
    if (i >= 0) stack[i] = nsc; else stack.push(nsc);
    enqueue(() => swap(sc, nsc, true));
    return nsc.promise;
  }
  function closeScreen(sc, v) {
    if (sc.closing) return sc.promise;
    sc.closing = true; sc.ready = false;
    const i = stack.indexOf(sc);
    if (i < 0) { sc.resolve(v); return sc.promise; }
    if (i === 0) {
      const all = stack.slice();
      for (const s of all) { s.closing = true; s.ready = false; }
      enqueue(async () => { await exitAll(v); resolveAll(v, all); });
      return sc.promise;
    }
    enqueue(async () => {
      const parent = stack[stack.indexOf(sc) - 1] || sc.parent;
      stack.splice(stack.indexOf(sc), 1);
      await swap(sc, parent, true);
      sc.resolve(v);
    });
    return sc.promise;
  }
  // close the whole stack in one transition; every screen resolves its def.onExit(v) (default v); then() afterwards
  function exitStack(v, then) {
    if (!stack.length) { if (then) then(); return Promise.resolve(v); }
    const all = stack.slice();
    for (const s of all) { s.closing = true; s.ready = false; }
    const p = enqueue(async () => { await exitAll(v); resolveAll(v, all); });
    if (then) p.then(() => { try { then(); } catch (e) { console.error('[Menus] after close', e); } });
    return p.then(() => v);
  }
  function resolveAll(v, list) {
    const all = (list || []).slice().reverse();
    for (const s of all) { let r = v; try { if (s.def.onExit) r = s.def.onExit(v, s); } catch (e) { console.error(e); } s.resolve(r); }
  }

  // ---- backdrops: 'black' (DOM black), 'overlay' (Render.overlay 3D scene), 'dim' (game at 40 %), 'blur' (game
  // blurred and dimmed), 'none' (the game view as it is — the title)
  const backdropOf = (sc) => (typeof sc.def.backdrop === 'function' ? sc.def.backdrop(sc) : sc.def.backdrop) || 'black';
  const postTw = {
    dim: new Tw((v) => { if (sess && renderLive()) Render.post.dim = v; }, 1),
    blur: new Tw((v) => { if (sess && renderLive()) Render.post.blur = v; }, 0),
  };
  function applyBackdrop(sc, dur = 0) {
    const bd = backdropOf(sc);
    const dim = bd === 'dim' ? 0.4 : bd === 'blur' ? 0.55 : sess ? sess.post.dim ?? 1 : 1;
    const blur = bd === 'blur' ? 0.85 : sess ? sess.post.blur || 0 : 0;
    if (dur > 0) { postTw.dim.to(dim, dur); postTw.blur.to(blur, dur); } else { postTw.dim.jump(dim); postTw.blur.jump(blur); }
    backF.jump(bd === 'black' ? 1 : 0);
    // film grain at 60 % of in-game (spec §2A): over the game view ('dim', 'blur', 'none') and the 3D item scene
    // ('overlay') the WebGL post pass already draws it (Render.post.menu → ×0.6); the DOM grain only covers DOM black
    ui('grainOverlay', bd === 'black' || !renderLive(), 0.6);
    if (renderLive()) {
      if (bd === 'overlay' && sc.def.overlay) {
        const ov = sc.def.overlay(sc);
        Render.overlay = ov || null;
        if (ov && ov.camera && ov.camera.isPerspectiveCamera) { ov.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); ov.camera.updateProjectionMatrix(); }
        for (const k of ['desat', 'noise', 'fade', 'white', 'redBadge']) Render.post[k] = 0;
      } else {
        Render.overlay = sess ? sess.overlay : null;
        if (sess) for (const k of ['desat', 'noise', 'fade', 'white', 'redBadge']) Render.post[k] = sess.post[k] ?? 0;
      }
    }
  }
  function beginSession(sc) {
    const post = renderLive() ? { ...Render.post } : {};
    sess = { post, frozen: renderLive() ? Render.frozen : false, overlay: renderLive() ? Render.overlay : null, inGame: !!sc.def.inGame };
    postTw.dim.jump(post.dim ?? 1); postTw.blur.jump(post.blur || 0);
    if (renderLive()) {
      Render.post.menu = true;
      if (sc.def.inGame) Render.freeze(true);
    }
    root.classList.add('on');
    consumeAll();
  }
  function endSession() {
    if (!sess) return;
    if (renderLive()) {
      Render.overlay = sess.overlay || null;
      for (const k of ['dim', 'blur', 'menu', 'desat', 'noise', 'fade', 'white', 'redBadge']) if (k in sess.post) Render.post[k] = sess.post[k];
      Render.freeze(!!sess.frozen);
    }
    sess = null;
    injected.length = 0;
    ui('grainOverlay', false);
    consumeAll();
  }
  function buildScreen(sc) {
    if (sc.built) return;
    // CONTRACT+ Bus 'menu:before'(name, opts): content can refresh what a screen shows (map marks) just before it's built
    try { Bus.emit('menu:before', sc.name, sc.opts); } catch (e) { console.error('[Menus] menu:before', e); }
    sc.built = true;
    sc.el = mk('div', 'mn-s mn-' + sc.name, scrEl);
    sc.fade = fader(sc.el, 0);
    try { sc.def.build(sc); } catch (e) { console.error(`[Menus] ${sc.name} build`, e); }
    Bus.emit('menu', true, sc.name);
  }
  function disposeScreen(sc) {
    if (!sc.built) return;
    sc.built = false;
    try { if (sc.def.dispose) sc.def.dispose(sc); } catch (e) { console.error(`[Menus] ${sc.name} dispose`, e); }
    if (sc.el) sc.el.remove();
    Bus.emit('menu', false, sc.name);
  }
  const callShow = (sc) => { try { if (sc.def.show) sc.def.show(sc); } catch (e) { console.error(`[Menus] ${sc.name} show`, e); } };
  const callHide = (sc) => { try { if (sc.def.hide) sc.def.hide(sc); } catch (e) { console.error(`[Menus] ${sc.name} hide`, e); } };
  function consumeAll() { for (const a of ['confirm', 'cancel', 'pause', 'inventory', 'map', 'phone', 'interact', 'turn', 'decline']) inp('consume', a); }

  async function enterFirst(sc) {
    beginSession(sc);
    buildScreen(sc);
    const bd = backdropOf(sc);
    if (bd === 'dim' || bd === 'blur' || bd === 'none') {
      applyBackdrop(sc, 0.35);
      callShow(sc);
      await sc.fade.to(1, 0.35);
    } else {
      await curF.to(1, 0.22);
      applyBackdrop(sc);
      sc.fade.jump(1);
      callShow(sc);
      await curF.to(0, 0.28);
    }
    if (!sc.closing) sc.ready = true;
  }
  async function swap(from, to, disposeFrom) {
    from.ready = false;
    consumeAll();
    await curF.to(1, 0.2);
    if (from.fade) from.fade.jump(0);
    if (disposeFrom) disposeScreen(from); else callHide(from);
    buildScreen(to);
    applyBackdrop(to);
    to.fade.jump(1);
    callShow(to);
    await curF.to(0, 0.26);
    if (!to.closing && top() === to) to.ready = true;
    consumeAll();
  }
  async function exitAll(v) {
    const topSc = top(), rootSc = stack[0];
    if (!topSc) return;
    topSc.ready = false;
    consumeAll();
    let black = false;
    try { black = !!(rootSc.def.keepBlack && rootSc.def.keepBlack(v, rootSc)); } catch (e) { black = false; }
    const bd = backdropOf(topSc);
    const teardown = () => { for (const s of stack.slice().reverse()) disposeScreen(s); stack.length = 0; };
    if (black) {
      await curF.to(1, 0.3);
      ui('fade', 1, 0, '#000');
      teardown(); backF.jump(0); endSession();
      curF.jump(0);
    } else if (bd === 'dim' || bd === 'blur' || bd === 'none') {
      if (sess) { postTw.dim.to(sess.post.dim ?? 1, 0.3); postTw.blur.to(sess.post.blur || 0, 0.3); }
      await topSc.fade.to(0, 0.3);
      teardown(); backF.jump(0); endSession();
    } else {
      await curF.to(1, 0.22);
      teardown(); backF.jump(0); endSession();
      await curF.to(0, 0.28);
    }
    if (!stack.length) root.classList.remove('on');
  }
  // Menus.close(result): close everything (a game event — death, a forced cut — or the Game's own flow)
  function close(v = null) { if (!stack.length) return Promise.resolve(v); return exitStack(v); }
  function back(v = null) { const t = top(); return t ? closeScreen(t, v) : Promise.resolve(v); }

  // =================================================================================================================
  // Input helpers (menu context: Input maps D-pad / stick to up/down/left/right with auto-repeat, right mouse = cancel)
  // =================================================================================================================
  const inj = (a) => { const i = injected.indexOf(a); if (i < 0) return false; injected.splice(i, 1); return true; };
  const K = {
    up: () => inp('pressed', 'up') || inj('up'),
    down: () => inp('pressed', 'down') || inj('down'),
    left: () => inp('pressed', 'left') || inj('left'),
    right: () => inp('pressed', 'right') || inj('right'),
    confirm: () => inp('pressed', 'confirm') || inj('confirm'),
    cancel: () => { if (mouseQ.cancel) { mouseQ.cancel = false; return true; } return !!inp('pressed', 'cancel') || inj('cancel'); },
    key: (code) => !!inp('keyPressed', code),
    held: (a) => !!inp('down', a),
    any: () => { if (injected.length) { if (injected[0] === 'any') injected.shift(); return true; } return !!inp('anyPressed'); },
  };
  function padEdge(i) { const p = inp('pad'); const b = (p && p.buttons) || []; return !!b[i] && !padPrev[i]; }
  function legendText(pairs, sep) {
    const g = gamepadUsed();
    return pairs.filter(Boolean).map(([k, p, t]) => `${g ? p : k}  ${t}`).join(sep || '       ');
  }
  function setLegend(sc, el, pairsFn) {
    const t = legendText(pairsFn(), sc.st.legendSep);
    if (el.textContent !== t) el.textContent = t;
  }

  // A vertical (or horizontal) list of menu items: {label, off, value}. Hover selects, click confirms.
  function makeList(parent, items, o = {}) {
    const L = { el: mk('div', 'mn-list ' + (o.cls || ''), parent), items: [], i: o.start || 0, click: -1, horizontal: !!o.horizontal };
    if (L.horizontal) L.el.classList.add('mn-row');
    L.set = (items2) => {
      L.el.innerHTML = '';
      L.items = items2.map((it, idx) => {
        const e = mk('div', 'mn-it' + (it.off ? ' off' : '') + (it.cls ? ' ' + it.cls : ''), L.el, `<span>${it.html || esc(it.label)}</span>`);
        e.addEventListener('mouseenter', () => { if (!it.skip && L.i !== idx) { L.i = idx; sfx('ui_move'); paint(); if (L.onMove) L.onMove(idx); } });
        e.addEventListener('mousedown', (ev) => { if (ev.button === 0 && !it.skip) { L.i = idx; L.click = idx; paint(); } });
        return { ...it, e };
      });
      if (L.i >= L.items.length) L.i = Math.max(0, L.items.length - 1);
      if (L.items[L.i] && L.items[L.i].skip) { const j = L.items.findIndex((x) => !x.skip); L.i = j < 0 ? 0 : j; }
      paint();
    };
    const paint = () => L.items.forEach((it, idx) => it.e.classList.toggle('sel', idx === L.i));
    L.paint = paint;
    L.select = (i) => { L.i = clamp(i, 0, Math.max(0, L.items.length - 1)); paint(); };
    // step: returns {pick:item} | {cancel:true} | null
    L.step = (sc, keys = {}) => {
      if (!sc.ready || !L.items.length) { L.click = -1; return null; }
      const prevK = L.horizontal ? 'left' : 'up', nextK = L.horizontal ? 'right' : 'down';
      let d = 0;
      if (K[prevK]()) d = -1; else if (K[nextK]()) d = 1;
      if (d) {
        const n = L.items.length;
        let j = L.i;
        for (let k = 0; k < n; k++) { j = (j + d + n) % n; if (!L.items[j].skip && !(L.items[j].off && o.skipOff !== false)) break; }
        if (j !== L.i) { L.i = j; sfx(o.moveSfx || 'ui_move', o.moveSfxOpts); paint(); if (L.onMove) L.onMove(j); }
      }
      if (L.click >= 0) { const c = L.click; L.click = -1; return pick(c); }
      if (K.confirm()) return pick(L.i);
      if (keys.cancel !== false && K.cancel()) return { cancel: true };
      return null;
    };
    const pick = (i) => {
      const it = L.items[i];
      if (!it || it.skip) return null;
      if (it.off) { sfx('ui_cancel', { vol: 0.6 }); return null; }
      return { pick: it, i };
    };
    L.set(items);
    return L;
  }
  // a YES / NO question over the current screen → Promise<bool>
  function ask(sc, title, sub) {
    const box = mk('div', 'mn-ask', sc.el, `<div class="mn-ask-t">${esc(title)}</div>` + (sub ? `<div class="mn-ask-s">${esc(sub)}</div>` : ''));
    const f = fader(box, 0);
    const L = makeList(box, [{ label: 'YES', v: true }, { label: 'NO', v: false }], { horizontal: true, start: 1 });
    L.el.style.position = 'relative';
    f.to(1, 0.3);
    return new Promise((resolve) => {
      sc.st.ask = {
        step() {
          const r = L.step(sc);
          if (!r) return;
          sc.st.ask = null;
          const yes = !!(r.pick && r.pick.v);
          sfx(yes ? 'ui_confirm' : 'ui_cancel');
          f.to(0, 0.25).then(() => box.remove());
          resolve(yes);
        },
      };
    });
  }
  function ticks(v, n = 10) { let s = '<span class="mn-ticks">'; for (let i = 0; i < n; i++) s += `<i class="${i < Math.round(v * n) ? 'on' : ''}"></i>`; return s + '</span>'; }
  function starsSvg(n, total = 10, px = 18) {
    const pts = (cx, cy, R, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; p.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`); } return p.join(' '); };
    const gap = px * 1.45;
    let s = `<svg width="${Math.round(gap * total)}" height="${px + 2}" viewBox="0 0 ${gap * total} ${px + 2}">`;
    for (let i = 0; i < total; i++) {
      const on = i < n;
      s += `<polygon points="${pts(gap * i + gap / 2, px / 2 + 1.5, px / 2, px / 4.6)}" fill="${on ? COL.sel : 'none'}" stroke="${on ? COL.sel : '#6f6f6a'}" stroke-width="1" stroke-linejoin="miter"/>`;
    }
    return s + '</svg>';
  }

  // =================================================================================================================
  // Per-frame update
  // =================================================================================================================
  function update(dt) {
    ensure();
    const t = rnow();
    const d = typeof dt === 'number' && dt > 0 ? Math.min(0.1, dt) : Math.min(0.1, Math.max(0, t - lastReal));
    lastExt = t; lastReal = t;
    tick(d);
  }
  function selfTick() {
    requestAnimationFrame(selfTick);
    const t = rnow();
    if (t - lastExt < 0.25 || (!stack.length && !tweens.size)) { lastReal = t; return; }
    if (typeof UI === 'undefined' && !hasGame()) inp('update');
    const d = Math.min(0.1, Math.max(0, t - lastReal));
    lastReal = t;
    tick(d);
    if (!hasGame() && renderLive()) { try { Render.render(d); } catch (e) { /* renderer not ready */ } }
  }
  function tick(dt) {
    for (const tw of [...tweens]) tw.step(dt);
    if (window.innerWidth !== W || window.innerHeight !== H) {
      W = window.innerWidth; H = window.innerHeight;
      for (const s of stack) if (s.built && s.def.resize) { try { s.def.resize(s); } catch (e) { console.error(e); } }
    }
    const t = top();
    if (t && t.built) {
      t.t += dt;
      try { if (t.st.ask && t.ready) t.st.ask.step(); else t.def.update(t, dt); } catch (e) { console.error(`[Menus] ${t.name} update`, e); }
      if (t.el && t.st.legendEl && t.st.legendFn) setLegend(t, t.st.legendEl, t.st.legendFn);
    }
    const p = inp('pad');
    padPrev = p && p.buttons ? p.buttons.slice() : [];
    mouseQ.drag.dx = 0; mouseQ.drag.dy = 0; mouseQ.cancel = false;
  }
  const legend = (sc, fn) => { sc.st.legendEl = mk('div', 'mn-legend', sc.el); sc.st.legendFn = fn; setLegend(sc, sc.st.legendEl, fn); };
  const takeDrag = () => { const d = { dx: mouseQ.drag.dx, dy: mouseQ.drag.dy }; mouseQ.drag.dx = 0; mouseQ.drag.dy = 0; return d; };

  const SCREENS = {};

  // =================================================================================================================
  // TITLE (§2A steps 1–5). Text only — Game renders the Lookout behind it.
  // =================================================================================================================
  function titleMenuItems() {
    const items = [{ label: 'NEW GAME', value: 'new' }, { label: 'LOAD GAME', value: 'load', off: !(hasSave() && Save.hasAny()) }, { label: 'OPTIONS', value: 'options' }];
    if ((META.endingsSeen && META.endingsSeen.length) || META.completed) items.push({ label: 'EXTRA', value: 'extra' });
    return items;
  }
  SCREENS.title = {
    backdrop: 'none',
    keepBlack: (v) => v != null,
    onExit: (v) => (v == null ? null : typeof v === 'object' ? v : { choice: 'load', slot: v }),
    build(sc) {
      const st = sc.st, intro = sc.opts.intro !== false;
      ui('fade', 0, 0);                         // our own cover is black; clear any black left by boot / the last game
      st.shade = mk('div', 'tt-shade', sc.el); st.shadeF = fader(st.shade, 0);
      st.cover = mk('div', 'tt-cover', sc.el); st.coverF = fader(st.cover, 1);
      st.name = mk('div', 'tt-name', sc.el, 'SIGNAL HILL'); st.nameF = fader(st.name, 0);
      st.press = mk('div', 'tt-press', sc.el, 'PRESS ANY KEY'); st.pressF = fader(st.press, 0);
      st.menuBox = mk('div', 'mn-abs', sc.el); st.menuBox.style.inset = '0';
      st.list = makeList(st.menuBox, titleMenuItems(), { cls: 'tt-menu' });
      st.menuF = fader(st.menuBox, 0);
      st.stage = 'black'; st.t = 0; st.blackDur = intro ? 3 : 0.4; st.idle = 0; st.menuSeen = false; st.px = null;
      try { Snd.init(); } catch (e) { /* no audio */ }
      if (intro) titleHiss(st, true);
    },
    show(sc) { if (sc.st.list) { const i = sc.st.list.i; sc.st.list.set(titleMenuItems()); sc.st.list.select(i); } },
    dispose(sc) { titleHiss(sc.st, false); titleRingStop(sc.st, 0.5); if (sc.st.attract) sc.st.attract.ctl.abort(); },
    update(sc, dt) {
      const st = sc.st;
      st.t += dt;
      // the phone has been ringing the whole time (as soon as audio is allowed to run)
      if (!st.ringDone && !st.ring && !st.attract && st.stage !== 'menu' && Snd.ready) titleRingStart(st);
      if (!st.hissStarted && st.stage === 'black' && Snd.ready && sc.opts.intro !== false) titleHiss(st, true);
      if (st.stage === 'black' && st.t >= st.blackDur) { st.stage = 'fade'; st.coverF.to(0, 3.2); titleHiss(st, false, 2.8); st.at = st.t + 3.6; }
      else if (st.stage === 'fade' && st.t >= st.at) { st.stage = 'name'; st.nameF.to(1, 2.2); st.shadeF.to(1, 2.2); st.at = st.t + 4.2; }
      else if (st.stage === 'name' && st.t >= st.at) { st.stage = 'press'; st.pressF.to(1, 1.4); st.at = st.t + 1.4; }
      else if (st.stage === 'press' && st.t >= st.at && !st.pressF.busy) st.press.style.opacity = (0.62 + 0.38 * Math.cos((st.t - st.at) * 1.9)).toFixed(3);
      if (st.fakeRing && st.t >= st.fakeRing.at) { titleRingStop(st, 0); st.fakeRing = null; }
      if (st.fakeRing === null && st.fakeWait != null) {
        st.fakeWait -= dt;
        if (Snd.ready) { titleRingStart(st); st.fakeRing = { at: st.t + 0.32 }; st.fakeWait = null; } else if (st.fakeWait <= 0) st.fakeWait = null;
      }
      if (!sc.ready) return;
      // attract sequence (§2A step 5) — any input brings the title back
      const pt = Input.pointer, moved = st.px && (Math.abs(pt.x - st.px[0]) + Math.abs(pt.y - st.px[1]) > 3);
      st.px = [pt.x, pt.y];
      const mv = inp('move') || { x: 0, y: 0 };
      const anyKey = K.any();
      const active = anyKey || moved || Math.abs(mv.x) + Math.abs(mv.y) > 0.3;
      if (st.attract) {
        if (active && !st.attract.ctl.signal.aborted) st.attract.ctl.abort();
        if (st.attract.done || (st.attract.ctl.signal.aborted && st.t > st.attract.abortAt + 4)) titleBack(sc);
        return;
      }
      if (active) st.idle = 0; else st.idle += dt;
      if (st.idle >= (sc.opts.idleTime || 60) && typeof sc.opts.onIdle === 'function') { titleAttract(sc); return; }
      if (st.stage !== 'menu') { if (anyKey) titleToMenu(sc); return; }
      const r = st.list.step(sc, { cancel: false });
      if (r) titleAct(sc, r.pick.value);
    },
  };
  function titleHiss(st, on, fade = 0.6) {
    if (on) { if (st.hiss || !Snd.ready) { st.hissStarted = st.hissStarted || !!st.hiss; return; } st.hiss = sfx('static', { loop: true, vol: 0.32, intensity: 0.35, lp: 5200 }); st.hissStarted = true; return; }
    if (st.hiss) { st.hiss.stop(fade); st.hiss = null; }
    st.hissStarted = true;
  }
  function titleRingStart(st) { st.ring = sfx('ring', { far: true, lp: 1150, vol: 0.2, pan: -0.32, verb: 0.85 }); }
  function titleRingStop(st, fade) { if (st.ring) { st.ring.stop(fade); st.ring = null; } }
  function titleToMenu(sc) {
    const st = sc.st;
    // "a distant phone that's been ringing the whole time stops mid-ring" — if audio was still waiting for this first
    // gesture, the ring is heard for a moment and cut dead mid-burst.
    if (st.ring) { titleRingStop(st, 0); st.ringDone = true; }
    else if (!st.ringDone) { st.ringDone = true; st.fakeRing = null; st.fakeWait = 0.8; }
    titleHiss(st, false, 0.3);
    st.stage = 'menu'; st.menuSeen = true; st.idle = 0;
    st.coverF.to(0, 0.6);
    st.nameF.to(1, 0.6); st.shadeF.to(1, 0.6);
    st.pressF.to(0, 0.35);
    st.list.set(titleMenuItems()); st.list.select(0);
    st.menuF.to(1, 0.6, 0.35);
    inp('consume', 'confirm');
    injected.length = 0;
  }
  async function titleAct(sc, v) {
    const st = sc.st;
    if (v === 'new') {
      sfx('ui_confirm');
      await sc.push('newgame', { exit: true });
    } else if (v === 'load') {
      sfx('ui_confirm');
      await sc.push('load', { exit: true });
    } else if (v === 'options') {
      sfx('ui_confirm');
      await sc.push('options', {});
    } else if (v === 'extra') {
      sfx('ui_confirm');
      await sc.push('extra', { exit: true });
    }
    st.idle = 0;
  }
  function titleAttract(sc) {
    const st = sc.st;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: { aborted: false }, abort() { this.signal.aborted = true; } };
    const a = { ctl, done: false, abortAt: 0 };
    const origAbort = ctl.abort.bind(ctl);
    ctl.abort = () => { if (!ctl.signal.aborted) { a.abortAt = st.t; origAbort(); } };
    st.attract = a;
    titleRingStop(st, 1.2); titleHiss(st, false, 1);
    st.nameF.to(0, 1.2); st.pressF.to(0, 1.2); st.menuF.to(0, 1.2); st.coverF.to(0, 0.5); st.shadeF.to(0, 1.2);
    Bus.emit('title:idle');
    let p = null;
    try { p = sc.opts.onIdle({ signal: ctl.signal }); } catch (e) { console.error('[Menus] onIdle', e); }
    if (p && typeof p.then === 'function') p.then(() => { a.done = true; }, () => { a.done = true; });
    else a.done = true;
  }
  function titleBack(sc) {
    const st = sc.st;
    st.attract = null; st.idle = 0;
    st.nameF.to(1, 1.6); st.shadeF.to(1, 1.6);
    if (st.menuSeen) { st.stage = 'menu'; st.menuF.to(1, 1.2, 0.6); }
    else { st.stage = 'press'; st.pressF.to(1, 1.2, 0.8); st.at = st.t + 2.1; }
    inp('consume', 'confirm');
  }

  // =================================================================================================================
  // NEW GAME setup (§2A): ACTION LEVEL and RIDDLE LEVEL on black, one-line descriptions beneath
  // =================================================================================================================
  const LEVELS = ['easy', 'normal', 'hard'];
  const DESC = {
    action: {
      easy: 'Enemies deal 50% damage. Healing pickups are 1.5 times as common.',
      normal: 'Enemies and supplies as the town intends.',
      hard: "Enemies deal 150% damage, a Reach's rage builds 1.5 times faster, and there are 30% fewer pickups.",
    },
    riddle: {
      easy: 'The clues all but give you the answer.',
      normal: 'The clues are written as they were left.',
      hard: 'The clues are oblique. Some of them take working out.',
    },
  };
  SCREENS.newgame = {
    backdrop: 'black',
    keepBlack: (v) => v != null,
    build(sc) {
      const st = sc.st;
      st.v = { action: LEVELS.indexOf(sc.opts.action || 'normal'), riddle: LEVELS.indexOf(sc.opts.riddle || 'normal') };
      if (st.v.action < 0) st.v.action = 1;
      if (st.v.riddle < 0) st.v.riddle = 1;
      st.row = 0;
      const wrap = mk('div', 'ng-wrap', sc.el);
      st.secs = ['action', 'riddle'].map((k, ri) => {
        const sec = mk('div', 'ng-sec', wrap);
        mk('div', 'ng-h', sec, k === 'action' ? 'ACTION LEVEL' : 'RIDDLE LEVEL');
        const row = mk('div', 'ng-opts', sec);
        const opts = LEVELS.map((lv, i) => {
          const o = mk('div', 'ng-o', row, `<span>${lv.toUpperCase()}</span>`);
          o.addEventListener('mouseenter', () => { if (st.row !== ri) { st.row = ri; sfx('ui_move'); ngPaint(sc); } });
          o.addEventListener('mousedown', (e) => { if (e.button === 0 && sc.ready) { st.row = ri; if (st.v[k] !== i) { st.v[k] = i; sfx('ui_move'); } ngPaint(sc); } });
          return o;
        });
        const d = mk('div', 'ng-d', sec);
        sec.addEventListener('mouseenter', () => { if (st.row !== ri) { st.row = ri; sfx('ui_move'); ngPaint(sc); } });
        return { k, sec, opts, d };
      });
      st.go = mk('div', 'ng-sec ng-go', wrap);
      st.goIt = mk('div', 'mn-it', st.go, `<span>${sc.opts.ngplus ? 'BEGIN NEW GAME+' : 'BEGIN'}</span>`);
      st.goIt.addEventListener('mouseenter', () => { if (st.row !== 2) { st.row = 2; sfx('ui_move'); ngPaint(sc); } });
      st.goIt.addEventListener('mousedown', (e) => { if (e.button === 0) { st.row = 2; st.click = true; ngPaint(sc); } });
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['A D', 'D-PAD', 'CHANGE'], ['E', 'A', 'BEGIN'], ['ESC', 'B', 'BACK']]);
      ngPaint(sc);
    },
    update(sc) {
      const st = sc.st;
      if (!sc.ready) { st.click = false; return; }
      if (K.up()) { st.row = (st.row + 2) % 3; sfx('ui_move'); ngPaint(sc); }
      else if (K.down()) { st.row = (st.row + 1) % 3; sfx('ui_move'); ngPaint(sc); }
      if (st.row < 2) {
        const k = st.secs[st.row].k;
        if (K.left() && st.v[k] > 0) { st.v[k]--; sfx('ui_move'); ngPaint(sc); }
        else if (K.right() && st.v[k] < 2) { st.v[k]++; sfx('ui_move'); ngPaint(sc); }
      }
      const go = st.click || K.confirm();
      st.click = false;
      if (go) {
        if (st.row < 2) { st.row++; sfx('ui_move'); ngPaint(sc); return; }
        sfx('ui_confirm');
        const v = { choice: sc.opts.ngplus ? 'ngplus' : 'newgame', action: LEVELS[st.v.action], riddle: LEVELS[st.v.riddle] };
        const needCal = sc.opts.calibrate === true || (sc.opts.exit && sc.opts.calibrate !== false && !META.calibrated);
        if (needCal) sc.replace('calibrate', { first: true, value: v, exit: !!sc.opts.exit });
        else if (sc.opts.exit) sc.exit(v); else sc.close(v);
        return;
      }
      if (K.cancel()) { sfx('ui_cancel'); sc.close(null); }
    },
  };
  function ngPaint(sc) {
    const st = sc.st;
    st.secs.forEach((s, ri) => {
      s.sec.classList.toggle('sel', st.row === ri);
      s.opts.forEach((o, i) => o.classList.toggle('cur', st.v[s.k] === i));
      s.d.textContent = DESC[s.k][LEVELS[st.v[s.k]]];
    });
    st.goIt.classList.toggle('sel', st.row === 2);
  }

  // =================================================================================================================
  // BRIGHTNESS CALIBRATION: a single signal bar on black — "Adjust until the bar is barely visible."
  // The bar is drawn in the 3D overlay so it goes through the real post chain (grade, grain, brightness curve).
  // =================================================================================================================
  const BAR_LIN = 0.0034;   // linear value of the bar: at brightness 1 it lands just above black after the grade
  SCREENS.calibrate = {
    backdrop: () => (renderLive() ? 'overlay' : 'black'),
    keepBlack: (v) => v != null,
    overlay(sc) { return sc.st.ov; },
    build(sc) {
      const st = sc.st;
      st.start = META.options.brightness ?? 1;
      if (renderLive()) {
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
        const cam = new THREE.PerspectiveCamera(30, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 20);
        cam.position.set(0, 0, 4);
        const k = 4 * Math.tan(U.rad(15));
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(BAR_LIN, BAR_LIN, BAR_LIN, THREE.LinearSRGBColorSpace) });
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.028 * k, 0.18 * k), mat);
        bar.position.set(0, 0.24 * k, 0);
        scene.add(bar);
        st.ov = { scene, camera: cam };
        st.mesh = bar;
      } else { st.bar = mk('div', 'cb-bar', sc.el); }
      mk('div', 'cb-t', sc.el, 'Adjust until the bar is barely visible.');
      legend(sc, () => [['A D', 'D-PAD', 'ADJUST'], ['E', 'A', 'CONFIRM'], sc.opts.first ? null : ['ESC', 'B', 'BACK']]);
      calPaint(sc);
    },
    dispose(sc) { if (sc.st.mesh) { sc.st.mesh.geometry.dispose(); sc.st.mesh.material.dispose(); } },
    update(sc) {
      const st = sc.st;
      if (!sc.ready) return;
      const o = META.options;
      let d = 0;
      if (K.left()) d = -1; else if (K.right()) d = 1;
      const wh = inp('wheel') || 0;
      if (wh) d = wh > 0 ? -1 : 1;
      if (d) {
        const nv = +clamp((o.brightness ?? 1) + d * 0.05, 0.5, 2).toFixed(2);
        if (nv !== o.brightness) { o.brightness = nv; sfx('ui_move'); calPaint(sc); }
      }
      if (K.confirm()) {
        sfx('ui_confirm');
        META.calibrated = true; persistMeta();
        const v = sc.opts.value !== undefined ? sc.opts.value : o.brightness;
        if (sc.opts.exit) sc.exit(v); else sc.close(v);
      } else if (K.cancel()) {
        if (sc.opts.first) { sfx('ui_confirm'); META.calibrated = true; persistMeta(); const v = sc.opts.value !== undefined ? sc.opts.value : o.brightness; if (sc.opts.exit) sc.exit(v); else sc.close(v); return; }
        sfx('ui_cancel'); o.brightness = st.start; persistMeta(); sc.close(null);
      }
    },
  };
  function calPaint(sc) {
    const st = sc.st, b = META.options.brightness ?? 1;
    if (st.bar) {
      // no renderer: approximate what the post chain does to the bar (sRGB of the graded value, then the curve)
      const v = Math.pow(0.0224, 1 / Math.max(0.05, b));
      const c = Math.round(clamp(v) * 255);
      st.bar.style.background = `rgb(${c},${c},${c})`;
    }
  }

  // =================================================================================================================
  // PAUSE: the game frozen and dimmed to 40 %; a vertical serif list at centre left; the area name top right
  // =================================================================================================================
  function areaName() {
    let a = '';
    try { const d = (typeof World !== 'undefined' && World.def) || (S.room && ROOMS[S.room]) || null; a = d ? d.area || d.name || '' : ''; } catch (e) { a = ''; }
    a = upper(a);
    return a && S.outage ? `${a} — ???` : a;
  }
  SCREENS.pause = {
    backdrop: 'dim', inGame: true,
    keepBlack: (v) => v === 'title',
    onExit: (v) => (v === 'title' ? 'title' : 'resume'),
    build(sc) {
      const st = sc.st;
      st.list = makeList(sc.el, ['RESUME', 'ITEMS', 'MAP', 'MEMOS', 'PHONE', 'OPTIONS', 'QUIT TO TITLE'].map((l) => ({ label: l, value: l })), { cls: 'ps-list' });
      st.area = mk('div', 'ps-area', sc.el, esc(areaName()));
    },
    show(sc) { sc.st.area.textContent = areaName(); },
    update(sc) {
      const st = sc.st;
      if (sc.ready && (inp('pressed', 'pause') && !inp('pressed', 'cancel'))) { sfx('ui_cancel'); sc.close('resume'); return; }
      const r = st.list.step(sc);
      if (!r) return;
      if (r.cancel) { sfx('ui_cancel'); sc.close('resume'); return; }
      const v = r.pick.value;
      if (v === 'RESUME') { sfx('ui_confirm'); sc.close('resume'); }
      else if (v === 'QUIT TO TITLE') {
        sfx('ui_confirm');
        ask(sc, 'Quit to the title?', 'Anything since your last save will be lost.').then((yes) => { if (yes && !sc.closing) sc.close('title'); });
      } else {
        sfx('ui_confirm');
        sc.push({ ITEMS: 'items', MAP: 'map', MEMOS: 'memos', PHONE: 'phone', OPTIONS: 'options' }[v], {});
      }
    },
  };

  // =================================================================================================================
  // ITEMS (§2A): a black void; the carried things in a row of lit, rotating 3D models under one key light from above
  // left; tabs ITEMS · WEAPONS · KEY ITEMS; name + italic description; USE / EQUIP / EXAMINE / COMBINE / CANCEL;
  // Status (AIDAN + ECG) top left; the equipped weapon top right.
  // =================================================================================================================
  const TABS = [{ key: 'item', label: 'Items' }, { key: 'weapon', label: 'Weapons' }, { key: 'key', label: 'Key Items' }];
  const HEAL = { coffee: 25, energy_drink: 50, first_aid: 100 };
  const tabOf = (id) => { const d = itemDef(id); const c = d && d.cat; return c === 'item' ? 0 : c === 'weapon' ? 1 : 2; };
  const itemName = (id) => { const d = itemDef(id); return upper((d && d.name) || String(id).replace(/_/g, ' ')); };
  const healOf = (id) => { const d = itemDef(id); return (d && d.heal) || HEAL[id] || 0; };
  const invEntries = (tab) => (S.inv || []).filter((e) => e && e.n > 0 && tabOf(e.id) === tab);
  const IT = { TARGET: 0.5, SIDE: 0.64, R: 2.2, STEP: 0.52, EX: 0.95, REST: 0.62, EQ: 0.17 };
  function takeItem(id, n = 1) {
    const e = (S.inv || []).find((x) => x.id === id);
    if (!e) return false;
    e.n -= n;
    if (e.n <= 0) { S.inv.splice(S.inv.indexOf(e), 1); if (S.equipped === id) S.equipped = null; }
    return true;
  }
  function giveItem(id, n = 1) {
    const d = itemDef(id);
    const e = (S.inv || []).find((x) => x.id === id);
    if (e && (!d || d.stack !== false)) e.n += n; else S.inv.push({ id, n });
  }
  function disposeObj(o) {
    if (!o) return;
    o.traverse((c) => {
      if (c.geometry && !(c.geometry.userData && c.geometry.userData.shared)) c.geometry.dispose();
      const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
      for (const m of ms) if (!(m.userData && m.userData.shared) && m.userData.menus) { if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose(); m.dispose(); }
    });
  }
  // the fallback when an item has no model: a small grey card box with the item's name on it
  function fallbackModel(id) {
    const c = canvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#cfc9b8'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = 'rgba(40,36,30,0.5)'; x.lineWidth = 3; x.strokeRect(6, 6, 244, 116);
    x.fillStyle = '#2a2722'; x.font = `bold 26px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const words = itemName(id).split(' '); const lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 220 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => x.fillText(l, 128, 64 + (i - (Math.min(3, lines.length) - 1) / 2) * 30));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.9 }); side.userData.menus = true;
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }); front.userData.menus = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.07), [side, side, side, side, front, side]);
    const g = new THREE.Group(); g.add(m); m.position.y = 0.06;
    return g;
  }
  function itemModel(id) {
    let obj = null;
    try {
      if (typeof Kit !== 'undefined' && Kit.itemModel) obj = Kit.itemModel(id);
      else { const d = itemDef(id); if (d && typeof d.model === 'function') obj = d.model(); }
    } catch (e) { console.error('[Menus] item model ' + id, e); obj = null; }
    if (!obj || !obj.isObject3D) obj = fallbackModel(id);
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty() || !isFinite(box.min.x)) { obj = fallbackModel(id); obj.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); }
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group(); holder.add(obj); holder.position.set(-c.x, -c.y, -c.z);
    const tilt = new THREE.Group(); tilt.add(holder);
    const mx = Math.max(size.x, size.y, size.z, 1e-3);
    const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
    const flat = size.y < 0.18 * Math.max(size.x, size.z);
    const long = dims[0] > 4 * Math.max(1e-4, dims[1]);
    // row pose: flat things (keys, cards, maps) lifted toward the viewer; long thin things (the bar) laid diagonally
    const exQ = new THREE.Quaternion(), rowQ = new THREE.Quaternion();
    if (long) {
      const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
      if (ax === 'y') exQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      else if (ax === 'z') exQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      rowQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5).multiply(exQ);
    } else if (flat) rowQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.85);
    tilt.quaternion.copy(rowQ);
    const pivot = new THREE.Group();
    pivot.add(tilt);
    pivot.userData = { base: (long ? 1.3 : 1) / mx, id, obj, tilt, flat, rowQ, exQ, anim: (obj.userData && obj.userData.animated) || null, yaw: IT.REST };
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return pivot;
  }
  function itemsScene(st) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 3.7, 6.2);
    const cam = new THREE.PerspectiveCamera(30, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 60);
    cam.position.set(0, 0.56, 3.55); cam.lookAt(0, 0.12, 0);
    const key = new THREE.DirectionalLight(0xfff0dc, 3.4);            // the single key light, above left
    key.position.set(-2.4, 3.8, 2.3); scene.add(key); scene.add(key.target);
    scene.add(new THREE.HemisphereLight(0x75817f, 0x000000, 0.09));    // just enough that the far side isn't a hole
    st.ov = { scene, camera: cam };
    st.row = new THREE.Group(); scene.add(st.row);
    st.eqHolder = new THREE.Group(); scene.add(st.eqHolder);
    st.exHolder = new THREE.Group(); st.exHolder.position.set(0, 0.12, 0); scene.add(st.exHolder);
  }
  // ECG status line: steady green at FINE, faster yellow at CAUTION, fast jagged red at DANGER. No numbers.
  const ECG = { FINE: { bpm: 64, col: '#5ea866', noise: 0, jag: 0 }, CAUTION: { bpm: 100, col: '#d0b43b', noise: 0.035, jag: 0.15 }, DANGER: { bpm: 142, col: '#c6382c', noise: 0.11, jag: 1 } };
  function ecgWave(p) {
    const g = (m, w) => Math.exp(-((p - m) * (p - m)) / (2 * w * w));
    return 0.1 * g(0.12, 0.024) - 0.1 * g(0.2, 0.008) + 1 * g(0.222, 0.0105) - 0.3 * g(0.245, 0.01) + 0.2 * g(0.44, 0.045);
  }
  function ecgTick(E, dt) {
    const cv = E.cv, dpr = DPR();
    const cw = Math.max(40, Math.round(cv.clientWidth * dpr)), chh = Math.max(12, Math.round(cv.clientHeight * dpr));
    if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; E.buf = new Float32Array(cw); E.head = 0; }
    const w = cv.width, h = cv.height, cfg = ECG[status(S.health)];
    const speed = w / 2.6;
    E.acc = (E.acc || 0) + speed * dt;
    let n = Math.floor(E.acc); E.acc -= n;
    n = Math.min(n, w);
    for (let k = 0; k < n; k++) {
      E.head = (E.head + 1) % w;
      E.phase = (E.phase || 0) + cfg.bpm / 60 / speed;
      if (E.phase >= 1) { E.phase -= 1; E.amp = cfg.jag ? 0.7 + Math.random() * 0.45 * (1 + cfg.jag) : 1; E.skew = cfg.jag ? (Math.random() - 0.5) * 0.04 * cfg.jag : 0; }
      let y = ecgWave(clamp(E.phase + (E.skew || 0), 0, 0.999)) * (E.amp || 1);
      if (cfg.noise) y += (Math.random() - 0.5) * cfg.noise * 2;
      if (cfg.jag && Math.random() < 0.012 * cfg.jag) y += (Math.random() - 0.3) * 0.6;
      E.buf[E.head] = y;
    }
    const x = E.ctx;
    x.clearRect(0, 0, w, h);
    const mid = h * 0.64, amp = h * 0.5, gap = Math.round(w * 0.06);
    x.lineWidth = Math.max(1, dpr * (cfg.jag > 0.5 ? 1.2 : 1));
    x.lineJoin = cfg.jag > 0.5 ? 'miter' : 'round';
    x.strokeStyle = cfg.col;
    x.shadowColor = cfg.col; x.shadowBlur = 3 * dpr;
    // oldest → newest, fading with age; a gap just ahead of the sweep
    for (let seg = 0; seg < 6; seg++) {
      x.globalAlpha = 0.22 + 0.78 * ((seg + 1) / 6);
      x.beginPath();
      let started = false;
      for (let k = Math.floor((seg * w) / 6); k <= Math.floor(((seg + 1) * w) / 6); k++) {
        const age = w - 1 - k;
        if (age > w - gap) { started = false; continue; }
        const col = (E.head - age + w * 2) % w;
        const X = col, Y = mid - E.buf[col] * amp;
        if (!started || col === 0) { x.moveTo(X, Y); started = true; } else x.lineTo(X, Y);
      }
      x.stroke();
    }
    x.globalAlpha = 1; x.shadowBlur = 0;
    const hx = E.head, hy = mid - E.buf[E.head] * amp;
    x.fillStyle = cfg.col; x.fillRect(hx - dpr, hy - dpr, 2 * dpr, 2 * dpr);
    const word = status(S.health);
    if (E.word !== word) { E.word = word; E.wordEl.textContent = word; E.wordEl.style.color = cfg.col; }
  }

  SCREENS.items = {
    backdrop: () => (renderLive() ? 'overlay' : 'black'), inGame: true,
    overlay(sc) { return sc.st.ov; },
    build(sc) {
      const st = sc.st;
      st.models = new Map(); st.list = []; st.sel = 0; st.pos = 0; st.idx = [0, 0, 0];
      st.tab = sc.opts.tab != null ? clamp(+sc.opts.tab, 0, 2) : 0;
      if (!invEntries(st.tab).length) { const t = [0, 1, 2].find((i) => invEntries(i).length); if (t != null) st.tab = t; }
      if (sc.opts.id) { st.tab = tabOf(sc.opts.id); st.idx[st.tab] = Math.max(0, invEntries(st.tab).findIndex((e) => e.id === sc.opts.id)); }
      st.three = renderLive();
      if (st.three) itemsScene(st);
      // tabs
      st.tabsEl = mk('div', 'it-tabs', sc.el);
      st.tabEls = TABS.map((t, i) => {
        if (i) mk('span', 'it-sep', st.tabsEl, '·');
        const e = mk('span', 'it-tab', st.tabsEl, t.label);
        e.addEventListener('mousedown', (ev) => { if (ev.button === 0 && sc.ready && !st.ex && !st.cmd) itemsTab(sc, i); });
        return e;
      });
      // status
      st.statusEl = mk('div', 'it-status', sc.el);
      mk('div', 'mn-h', st.statusEl, 'Aidan').style.fontVariant = 'small-caps';
      st.statusEl.firstChild.style.textTransform = 'none';
      st.statusEl.firstChild.style.fontSize = 'clamp(13px,1.75vh,21px)';
      st.statusEl.firstChild.style.letterSpacing = '.2em';
      const ecgCv = mk('canvas', '', st.statusEl);
      ecgCv.style.width = 'clamp(140px,14.5vw,290px)'; ecgCv.style.height = 'clamp(30px,5vh,62px)';
      st.ecg = { cv: ecgCv, ctx: ecgCv.getContext('2d'), buf: new Float32Array(2), head: 0, wordEl: mk('div', 'it-word', st.statusEl) };
      // equipped
      st.eqEl = mk('div', 'it-eq', sc.el, '<div class="it-eq-n"></div><div class="it-eq-a"></div>');
      // name / description / messages / command list / combine prompt
      st.nameEl = mk('div', 'it-name', sc.el); st.nameF = fader(st.nameEl, 1);
      st.descEl = mk('div', 'it-desc', sc.el); st.descF = fader(st.descEl, 1);
      st.noneEl = mk('div', 'it-none', sc.el);
      st.msgEl = mk('div', 'it-msg', sc.el); st.msgF = fader(st.msgEl, 0); st.msgT = 0;
      st.combEl = mk('div', 'it-comb', sc.el, 'COMBINE WITH'); st.combF = fader(st.combEl, 0);
      st.cmdBox = mk('div', 'mn-abs', sc.el); st.cmdBox.style.inset = '0'; st.cmdBox.style.pointerEvents = 'none';
      st.cmdF = fader(st.cmdBox, 0);
      if (!st.three) st.row2d = mk('div', 'it-row2d', sc.el);
      // examine
      st.exName = mk('div', 'it-exn', sc.el); st.exNameF = fader(st.exName, 0);
      st.exDetail = mk('div', 'it-exd', sc.el); st.exDetailF = fader(st.exDetail, 0);
      legend(sc, () => (st.ex
        ? [['W A S D / DRAG', 'STICKS', 'ROTATE'], ['WHEEL', 'LB RB', 'ZOOM'], ['ESC', 'B', 'BACK']]
        : st.cmd ? [['W S', 'D-PAD', 'CHOOSE'], ['E', 'A', 'CONFIRM'], ['ESC', 'B', 'CANCEL']]
          : st.combine ? [['A D', 'D-PAD', 'CHOOSE'], ['E', 'A', 'COMBINE'], ['ESC', 'B', 'CANCEL']]
            : [['A D', 'D-PAD', 'SELECT'], ['W S', 'LB RB', 'TAB'], ['E', 'A', 'CHOOSE'], ['TAB', 'B', 'BACK']]));
      st.sel = st.idx[st.tab];                          // (itemsTab stores the current selection for this tab first)
      itemsTab(sc, st.tab, true);
      itemsEquipRefresh(sc);
    },
    show(sc) { itemsRefresh(sc); itemsEquipRefresh(sc); },
    resize(sc) { if (sc.st.ov) { sc.st.ov.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); sc.st.ov.camera.updateProjectionMatrix(); } },
    dispose(sc) {
      const st = sc.st;
      for (const m of st.models.values()) disposeObj(m);
      if (st.eqModel) disposeObj(st.eqModel);
      st.models.clear();
    },
    update(sc, dt) {
      const st = sc.st;
      ecgTick(st.ecg, dt);
      if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) st.msgF.to(0, 0.4); }
      if (st.three) itemsAnimate(sc, dt);
      if (!sc.ready || st.busy) return;
      if (st.ex) { examineInput(sc, dt); return; }
      if (st.cmd) {
        const r = st.cmd.list.step(sc);
        if (!r) return;
        if (r.cancel || r.pick.value === 'cancel') { sfx('ui_cancel'); itemsCmd(sc, false); return; }
        sfx('ui_confirm');
        itemsCmd(sc, false);
        itemsDo(sc, r.pick.value);
        return;
      }
      // row navigation
      const n = st.list.length;
      if (K.left() && n > 1) { itemsSelect(sc, (st.sel - 1 + n) % n, 'left'); }
      else if (K.right() && n > 1) { itemsSelect(sc, (st.sel + 1) % n, 'right'); }
      let t = -1;
      if (K.up() || padEdge(4)) t = (st.tab + 2) % 3; else if (K.down() || padEdge(5)) t = (st.tab + 1) % 3;
      for (let i = 0; i < 3; i++) if (K.key('Digit' + (i + 1))) t = i;
      if (t >= 0 && t !== st.tab) itemsTab(sc, t);
      if (st.combine) {
        if (K.confirm()) { sfx('ui_confirm'); itemsCombine(sc, st.combine, st.list[st.sel] && st.list[st.sel].id); }
        else if (K.cancel()) { sfx('ui_cancel'); itemsCombineMode(sc, null); }
        return;
      }
      if (K.confirm() && n) { sfx('ui_confirm'); itemsCmd(sc, true); return; }
      if (K.cancel() || K.key('Tab')) { sfx('ui_cancel'); sc.close(null); }
    },
  };
  function itemsTab(sc, t, silent) {
    const st = sc.st;
    st.idx[st.tab] = st.sel;
    st.tab = t;
    if (!silent) sfx('ui_move');
    st.tabEls.forEach((e, i) => e.classList.toggle('sel', i === t));
    itemsRefresh(sc, true);
  }
  // rebuild the row for the current tab (after a tab change or when the inventory changed)
  function itemsRefresh(sc, tabChanged) {
    const st = sc.st;
    const prevId = st.list[st.sel] && st.list[st.sel].id;
    st.list = invEntries(st.tab);
    if (tabChanged) st.sel = clamp(st.idx[st.tab] || 0, 0, Math.max(0, st.list.length - 1));
    else { const j = st.list.findIndex((e) => e.id === prevId); st.sel = clamp(j >= 0 ? j : st.sel, 0, Math.max(0, st.list.length - 1)); }
    if (tabChanged) st.pos = st.sel;
    if (st.three) {
      for (const c of [...st.row.children]) st.row.remove(c);
      st.list.forEach((e) => {
        let m = st.models.get(e.id);
        if (!m) { m = itemModel(e.id); st.models.set(e.id, m); }
        st.row.add(m);
      });
    } else {
      st.row2d.innerHTML = st.list.map((e, i) => `<span class="${i === st.sel ? 'sel' : ''}">${esc(itemName(e.id))}</span>`).join('');
    }
    st.noneEl.textContent = st.list.length ? '' : 'Nothing.';
    itemsText(sc, !tabChanged);
  }
  // CONTRACT+: ITEMS[id].desc, .details and a detail's .text may be functions of S (riddle-level wording)
  const valOf = (v) => { if (typeof v !== 'function') return v; try { return v(S); } catch (e) { console.error('[Menus] item text', e); return null; } };
  function itemsText(sc, quiet) {
    const st = sc.st, e = st.list[st.sel];
    const d = e ? itemDef(e.id) : null;
    st.nameEl.innerHTML = e ? esc(itemName(e.id)) + (e.n > 1 ? `<span class="it-qty">×${e.n}</span>` : '') + (S.equipped === e.id ? '<span class="it-qty">· EQUIPPED</span>' : '') : '';
    st.descEl.textContent = e ? (d && valOf(d.desc)) || '' : '';
    if (!quiet) { st.nameF.jump(0); st.descF.jump(0); st.nameF.to(1, 0.3); st.descF.to(1, 0.35); }
    if (st.row2d) [...st.row2d.children].forEach((c, i) => c.classList.toggle('sel', i === st.sel));
  }
  function itemsSelect(sc, i, dir) {
    const st = sc.st;
    if (i === st.sel) return;
    st.sel = i;
    sfx('whoosh', { dur: 0.45, dir, vol: 0.55 });
    itemsText(sc);
  }
  function itemsMsg(sc, text, dur = 2.4) {
    const st = sc.st;
    st.msgEl.textContent = text;
    st.msgF.jump(0); st.msgF.to(1, 0.3);
    st.msgT = dur;
  }
  function itemsEquipRefresh(sc) {
    const st = sc.st, id = S.equipped && (S.inv || []).some((e) => e.id === S.equipped) ? S.equipped : null;
    const nEl = st.eqEl.querySelector('.it-eq-n'), aEl = st.eqEl.querySelector('.it-eq-a');
    nEl.textContent = id ? itemName(id) : '';
    // sprays left / the charge of the canisters carried ("4/6"; a second extinguisher's 6 add up: "10/12")
    const per = (id && itemDef(id) && itemDef(id).ammo) || 6, left = Math.max(0, (S.ammo && S.ammo[id]) ?? 0);
    aEl.textContent = id === 'extinguisher' || (id && itemDef(id) && itemDef(id).ammo) ? `${left}/${per * Math.max(1, Math.ceil(left / per))}` : '';
    if (!st.three) return;
    if (st.eqId !== id) {
      if (st.eqModel) { st.eqHolder.remove(st.eqModel); disposeObj(st.eqModel); st.eqModel = null; }
      st.eqId = id;
      if (id) { st.eqModel = itemModel(id); st.eqHolder.add(st.eqModel); }
    }
  }
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
  function itemsAnimate(sc, dt) {
    const st = sc.st, cam = st.ov.camera;
    const tnow = rnow();
    st.pos = U.damp(st.pos, st.sel, 10, dt);
    st.list.forEach((e, i) => {
      const m = st.models.get(e.id);
      if (!m || (st.ex && st.ex.m === m)) return;
      const o = i - st.pos, a = o * IT.STEP;
      m.visible = !st.ex && Math.abs(o) < 3.3;
      if (!m.visible) return;
      m.position.set(Math.sin(a) * IT.R, 0, (Math.cos(a) - 1) * IT.R);
      const s = U.lerp(IT.SIDE, 1, clamp(1 - Math.abs(o)));
      m.scale.setScalar(m.userData.base * IT.TARGET * s);
      const u = m.userData;
      if (i === st.sel) u.yaw += dt * 0.55;
      else u.yaw += U.angleDiff(u.yaw, IT.REST) * (1 - Math.exp(-3 * dt));
      m.rotation.set(0, u.yaw, 0);
      if (u.anim) for (const f of u.anim) { try { f(dt, tnow); } catch (err) { u.anim = null; break; } }
    });
    // the equipped weapon, small, under the top-right label
    if (st.eqModel) {
      const W_ = window.innerWidth, H_ = window.innerHeight;
      const r = st.eqEl.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top - H_ * 0.08;
      _v.set((cx / W_) * 2 - 1, 1 - (cy / H_) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
      st.eqModel.position.copy(cam.position).addScaledVector(_v, 2.7);
      st.eqModel.scale.setScalar(st.eqModel.userData.base * IT.EQ);
      st.eqModel.userData.yaw += dt * 0.4;
      st.eqModel.rotation.set(0, st.eqModel.userData.yaw, 0);
      st.eqModel.visible = !st.ex;
    }
    if (st.ex) examineAnimate(sc, dt);
  }

  // ---- the command list ---------------------------------------------------------------------------------------------
  function itemsCmd(sc, on) {
    const st = sc.st;
    if (!on) { if (st.cmd) { const box = st.cmd.list.el; st.cmdF.to(0, 0.2).then(() => { if (!st.cmd || st.cmd.list.el !== box) box.remove(); }); st.cmd = null; } return; }
    const e = st.list[st.sel];
    if (!e) return;
    const d = itemDef(e.id), weapon = !!(d && d.cat === 'weapon') || tabOf(e.id) === 1;
    const distinct = new Set((S.inv || []).filter((x) => x.n > 0).map((x) => x.id)).size;
    st.cmdBox.innerHTML = '';
    const list = makeList(st.cmdBox, [
      { label: 'USE', value: 'use' },
      { label: 'EQUIP', value: 'equip', off: !weapon || S.equipped === e.id },
      { label: 'EXAMINE', value: 'examine' },
      { label: 'COMBINE', value: 'combine', off: distinct < 2 },
      { label: 'CANCEL', value: 'cancel' },
    ], { cls: 'it-cmd' });
    list.el.style.visibility = 'visible'; list.el.style.opacity = '1'; list.el.style.pointerEvents = 'auto';
    st.cmd = { list, id: e.id };
    st.cmdF.jump(0); st.cmdF.to(1, 0.22);
  }
  function itemsDo(sc, what) {
    const st = sc.st, e = st.list[st.sel];
    if (!e) return;
    if (what === 'use') itemsUse(sc, e.id);
    else if (what === 'equip') itemsEquip(sc, e.id);
    else if (what === 'examine') examineOpen(sc, e.id);
    else if (what === 'combine') itemsCombineMode(sc, e.id);
  }
  function itemsEquip(sc, id) {
    S.equipped = id;
    sfx('handle', { vol: 0.5 });
    Bus.emit('equip', id);
    itemsEquipRefresh(sc);
    itemsText(sc, true);
  }
  function facingDoorFor(id) {
    try {
      const tgt = typeof Player !== 'undefined' ? Player.interactTarget : null;
      if (!tgt || tgt.kind !== 'door' || typeof World === 'undefined') return false;
      const doors = World.doors || {};
      const rec = doors[tgt.id] || Object.values(doors).find((dr) => dr.obj === tgt.obj);
      return !!(rec && rec.key === id);
    } catch (e) { return false; }
  }
  // leave the menus and run the item in the game (keys on the door ahead, scripted uses)
  function leaveAndUse(sc, id) {
    sc.exit(null, () => {
      if (hasScript() && Script.builtins && Script.builtins.useItem) Script.run(async (G) => Script.builtins.useItem(G, id), { control: true, name: 'use:' + id });
      else ui('message', 'Nothing happens.');
    });
  }
  function itemsUse(sc, id) {
    const d = itemDef(id);
    if (d && typeof d.use === 'function') { leaveAndUse(sc, id); return; }
    const heal = healOf(id);
    if (heal > 0) {
      if (S.health >= 100) { itemsMsg(sc, "I'm alright for now."); return; }
      takeItem(id, 1);
      try { if (typeof Player !== 'undefined' && Player.heal) Player.heal(heal); else S.health = Math.min(100, S.health + heal); } catch (e) { S.health = Math.min(100, S.health + heal); }
      S.stats.itemsUsed = (S.stats.itemsUsed || 0) + 1;
      sfx(id === 'first_aid' ? 'plastic' : id === 'energy_drink' ? 'click' : 'paper', { vol: 0.7 });
      Bus.emit('item:use', id);
      itemsRefresh(sc);
      return;
    }
    if ((d && d.cat === 'weapon') || tabOf(id) === 1) { if (S.equipped !== id) itemsEquip(sc, id); return; }
    const mapId = d && (d.map || (d.cat === 'map' ? String(id).replace(/^r?map_/, '') : null));
    if (mapId) { sc.push('map', { id: mapId }); return; }
    if (facingDoorFor(id)) { leaveAndUse(sc, id); return; }
    itemsMsg(sc, 'Nothing happens.');
  }
  function itemsCombineMode(sc, id) {
    const st = sc.st;
    st.combine = id || null;
    st.combF.to(id ? 1 : 0, 0.25);
    if (id) {
      // start on a neighbour, not the item itself
      const n = st.list.length;
      if (n > 1) itemsSelect(sc, (st.sel + 1) % n, 'right');
    }
  }
  function combineRecipe(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const d = itemDef(x);
      if (!d || !d.combine) continue;
      if (typeof d.combine === 'function') return { fn: d.combine, owner: x, other: y };
      if (d.combine[y]) return { ...d.combine[y], owner: x, other: y };
    }
    return null;
  }
  function itemsCombine(sc, a, b) {
    itemsCombineMode(sc, null);
    if (!b || a === b) { itemsMsg(sc, "That doesn't work."); return; }
    const r = combineRecipe(a, b);
    if (!r) { itemsMsg(sc, "That doesn't work."); return; }
    if (r.fn) { sc.exit(null, () => { if (hasScript()) Script.run(async (G) => r.fn(r.other, G), { control: true, name: 'combine:' + r.owner }); }); return; }
    if (!r.keep) { takeItem(a, 1); takeItem(b, 1); }
    if (r.result) giveItem(r.result, r.n || 1);
    sfx('plastic', { vol: 0.5 });
    Bus.emit('item:combine', a, b, r.result || null);
    itemsRefresh(sc);
    if (r.result) { const j = invEntries(tabOf(r.result)).findIndex((e) => e.id === r.result); if (tabOf(r.result) !== sc.st.tab) itemsTab(sc, tabOf(r.result), true); if (j >= 0) { sc.st.sel = j; itemsText(sc); } }
    itemsMsg(sc, r.msg || (r.result ? `Aidan made the ${itemName(r.result).toLowerCase()}.` : 'Done.'));
  }

  // ---- examine: the model fills the screen; rotate it; details show up close -------------------------------------------
  async function examineOpen(sc, id) {
    const st = sc.st;
    const d = itemDef(id);
    if (!st.three) { itemsMsg(sc, (d && valOf(d.desc)) || itemName(id), 3); return; }
    const m = st.models.get(id);
    if (!m) return;
    st.busy = true;
    await curF.to(1, 0.2);
    st.ex = { id, m, yaw: m.userData.yaw, pitch: m.userData.flat ? 0.9 : 0.3, zoom: 1, vy: 0, vp: 0, found: new Set(), shown: -2, idle: 0, whooshT: 0 };
    st.row.remove(m); st.exHolder.add(m); m.position.set(0, 0, 0); m.visible = true;
    m.userData.tilt.quaternion.copy(m.userData.exQ);      // examine shows it as it is; the player turns it
    for (const el of [st.tabsEl, st.statusEl, st.eqEl, st.nameEl, st.descEl, st.noneEl, st.msgEl]) el.style.visibility = 'hidden';
    st.exName.textContent = itemName(id);
    st.exNameF.jump(1);
    st.exDetailF.jump(0);
    examineAnimate(sc, 0);
    await curF.to(0, 0.26);
    sfx('whoosh', { dur: 0.8, vol: 0.4 });
    st.busy = false;
  }
  async function examineClose(sc) {
    const st = sc.st, ex = st.ex;
    if (!ex) return;
    st.busy = true;
    await curF.to(1, 0.2);
    st.exHolder.remove(ex.m); st.row.add(ex.m); ex.m.userData.yaw = ex.yaw;
    ex.m.userData.tilt.quaternion.copy(ex.m.userData.rowQ); ex.m.rotation.set(0, ex.yaw, 0);
    st.ex = null;
    for (const el of [st.tabsEl, st.statusEl, st.eqEl, st.nameEl, st.descEl, st.noneEl, st.msgEl]) el.style.visibility = '';
    st.msgF.jump(0); st.msgT = 0;
    st.nameF.jump(1); st.descF.jump(1);
    st.exNameF.jump(0); st.exDetailF.jump(0);
    itemsAnimate(sc, 0);
    await curF.to(0, 0.26);
    st.busy = false;
  }
  function examineInput(sc, dt) {
    const st = sc.st, ex = st.ex;
    if (K.cancel() || K.confirm() || K.key('Tab')) { sfx('ui_cancel'); examineClose(sc); return; }
    const inv = META.options.invertExamine ? -1 : 1;
    const mv = inp('move') || { x: 0, y: 0 };
    const md = takeDrag(), pd = inp('drag') || { dx: 0, dy: 0 };
    let vy = mv.x * 2.1 * inv, vp = -mv.y * 1.7 * inv;
    ex.yaw += vy * dt + (md.dx + pd.dx) * 0.0085 * inv;
    ex.pitch += vp * dt + (md.dy + pd.dy) * 0.0085 * inv;
    ex.pitch = clamp(ex.pitch, -1.35, 1.35);
    const moving = Math.abs(vy) + Math.abs(vp) > 0.2 || Math.abs(md.dx) + Math.abs(md.dy) + Math.abs(pd.dx) + Math.abs(pd.dy) > 2;
    ex.whooshT -= dt;
    if (moving) { if (ex.idle > 0.6 && ex.whooshT <= 0) { sfx('whoosh', { dur: 0.7, vol: 0.3, dir: vy < 0 ? 'left' : 'right' }); ex.whooshT = 1.2; } ex.idle = 0; } else ex.idle += dt;
    const wh = inp('wheel') || 0;
    if (wh) ex.zoom = clamp(ex.zoom - wh * 0.12, 0.75, 1.8);
    if (inp('pad') && inp('pad').buttons) { const b = inp('pad').buttons; if (b[5]) ex.zoom = clamp(ex.zoom + dt * 0.9, 0.75, 1.8); if (b[4]) ex.zoom = clamp(ex.zoom - dt * 0.9, 0.75, 1.8); }
    if (K.key('Equal') || K.key('NumpadAdd')) ex.zoom = clamp(ex.zoom + 0.15, 0.75, 1.8);
    if (K.key('Minus') || K.key('NumpadSubtract')) ex.zoom = clamp(ex.zoom - 0.15, 0.75, 1.8);
  }
  function examineAnimate(sc, dt) {
    const st = sc.st, ex = st.ex, m = ex.m, cam = st.ov.camera;
    if (ex.idle > 2.5) ex.yaw += dt * 0.12;                 // it keeps turning, very slowly, when left alone
    m.scale.setScalar(m.userData.base * IT.EX * ex.zoom);
    m.rotation.set(ex.pitch, ex.yaw, 0, 'XYZ');
    m.updateMatrixWorld(true);
    // details: revealed while their face points at the viewer (and close enough)
    const d = itemDef(ex.id), dv = d ? valOf(d.details) : null, details = Array.isArray(dv) ? dv : [];
    let best = -1, bestDot = 0;
    m.getWorldPosition(_v2);
    const toCam = _v.copy(cam.position).sub(_v2).normalize();
    details.forEach((det, i) => {
      if (!det) return;
      if (det.zoom && ex.zoom < det.zoom) return;
      if (!det.face) { if (best < 0) { best = i; bestDot = 0.5; } return; }
      const f = _v2.set(det.face[0] || 0, det.face[1] || 0, det.face[2] || 0);
      if (f.lengthSq() < 1e-6) return;
      f.transformDirection(m.userData.obj.matrixWorld);
      const dot = f.dot(toCam);
      if (dot > (det.min || 0.8) && dot > bestDot) { best = i; bestDot = dot + 1; }
    });
    if (best !== ex.shown) {
      ex.shown = best;
      if (best >= 0) {
        st.exDetail.textContent = valOf(details[best].text) || '';
        st.exDetailF.jump(0); st.exDetailF.to(1, 0.4);
        if (!ex.found.has(best)) {
          ex.found.add(best);
          const k = `detail:${ex.id}:${best}`;
          if (S.done && !S.done[k]) { S.done[k] = true; Bus.emit('item:detail', ex.id, best); }
        }
      } else st.exDetailF.to(0, 0.3);
    }
    if (m.userData.anim) for (const f of m.userData.anim) { try { f(dt, rnow()); } catch (err) { m.userData.anim = null; break; } }
  }

  // =================================================================================================================
  // MAP (§2A, contract §10.6): a paper map on a dark desk under a vignette — thin ink outlines, street names in small
  // capitals, compass rose, printed title and print date; Aidan's notes in red marker (X, circle, tick, notes); a red
  // arrow for his position and facing; two zoom levels; floor tabs. In the Outage: the receipt map (a curling thermal
  // strip, faded print, teal marker). Without the map: "You don't have a map of this area."
  // =================================================================================================================
  const MAP_K = 2;                                   // sheet pixels per map unit
  const sheetCache = new Map();
  let deskCache = null;
  let grainTile = null;
  function noiseTile() {
    if (grainTile) return grainTile;
    const c = canvas(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256), r = U.rng(4242);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0);
    grainTile = c;
    return c;
  }
  // soft noise field, generated small and scaled up (cheap for big sheets)
  function noiseField(w, h, r, cells = 4, cy = null) {
    const sw = 96, sh = Math.max(8, Math.round(96 * h / w));
    const n = Tex.util.fbm(sw, sh, r, { cells, cy: cy || Math.max(1, Math.round(cells * sh / sw)), oct: 4 });
    const c = canvas(sw, sh), x = c.getContext('2d'), im = x.createImageData(sw, sh);
    for (let i = 0; i < n.length; i++) { const v = n[i] * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    return c;
  }
  const roomDef = () => { try { return (typeof World !== 'undefined' && World.def) || (S.room && ROOMS[S.room]) || null; } catch (e) { return null; } };
  function receiptFor(baseId, rm) {
    if (rm && (rm.outage || rm.receipt)) return rm.outage || rm.receipt;
    if (!baseId || typeof MAPS === 'undefined') return null;
    for (const [id, m] of Object.entries(MAPS)) if (m && m.kind === 'receipt' && (m.of === baseId || m.base === baseId || m.for === baseId)) return id;
    for (const id of ['r_' + baseId, 'rmap_' + baseId, baseId + '_receipt', baseId + '_r', 'receipt_' + baseId]) if (MAPS[id]) return id;
    return null;
  }
  const FLOOR_RANK = (f) => { const m = /^([A-Z]+)(\d*)$/.exec(String(f).toUpperCase()); if (!m) return 0; const n = +(m[2] || 1); return m[1] === 'B' ? -n : m[1] === 'LG' ? -0.5 : m[1] === 'G' ? 0 : m[1] === 'M' ? 0.5 : m[1] === 'L' ? n : m[1] === 'P' ? 50 + n : 0; };
  function floorsOf(def) {
    const ks = Object.keys((def && def.floors) || {});
    if (def && Array.isArray(def.floorOrder)) return def.floorOrder.filter((f) => ks.includes(f));
    return ks.slice().sort((a, b) => FLOOR_RANK(a) - FLOOR_RANK(b));
  }
  function mapTarget(opts) {
    const room = roomDef(), rm = room && room.map ? room.map : null;
    let id = opts.id || null;
    if (id && typeof MAPS !== 'undefined' && !MAPS[id]) { const alt = String(id).replace(/^r?map_/, ''); if (MAPS[alt]) id = alt; }
    if (!id && rm) id = S.outage ? receiptFor(rm.id, rm) : rm.id;
    const def = id && typeof MAPS !== 'undefined' ? MAPS[id] : null;
    const owned = !!def && (!!(S.maps && S.maps[id]) || !!opts.force);
    let xform = null, floor = null;
    if (rm && def) {
      if (id === rm.id) { xform = rm.xform || null; floor = rm.floor ?? null; }
      else if (id === receiptFor(rm.id, rm)) { xform = rm.rxform || (def.sameFrame ? rm.xform : null) || null; floor = rm.rfloor ?? rm.floor ?? null; }
      // (a function / a list of {box, xform}: resolved where Aidan stands — World.mapXform)
      if (xform && typeof World !== 'undefined' && World.mapXform) { let px = 0, pz = 0; try { px = Player.pos.x; pz = Player.pos.z; } catch (e) { /* no player */ } xform = World.mapXform(xform, px, pz); }
    }
    const floors = floorsOf(def);
    if (floor == null || !floors.includes(floor)) floor = opts.floor && floors.includes(opts.floor) ? opts.floor : floors.includes('G') ? 'G' : floors[0];
    return { id, def, owned, xform, here: xform ? floor : null, floor, floors };
  }
  // map units of the player (room coords → map via xform [ox, oz, scale, rotDeg])
  function playerOnMap(xf) {
    if (!xf) return null;
    let px, pz, yaw;
    try {
      if (typeof World !== 'undefined' && World.room && typeof Player !== 'undefined') { const p = Player.pos; px = p.x; pz = p.z; yaw = Player.yaw; }
      else { px = S.pos[0]; pz = S.pos[2] ?? S.pos[1]; yaw = U.rad(S.yaw || 0); }
    } catch (e) { return null; }
    if (!isFinite(px) || !isFinite(pz)) return null;
    const [ox, oz, sc = 1, rot = 0] = xf, c = Math.cos(U.rad(rot)), s = Math.sin(U.rad(rot));
    const x = ox + (px * c - pz * s) * sc, y = oz + (px * s + pz * c) * sc;
    const dx = Math.sin(yaw || 0), dz = Math.cos(yaw || 0);
    return { x, y, ang: Math.atan2(dx * s + dz * c, dx * c - dz * s) };
  }

  // ---- sheet: paper (or thermal strip) + ink, cached per map/floor ------------------------------------------------------
  function drawPaperBase(x, W, H, r, receipt) {
    x.fillStyle = receipt ? '#e9e6dc' : '#ddd4bb'; x.fillRect(0, 0, W, H);
    // mottling and yellowing
    const n = noiseField(W, H, r, receipt ? 3 : 5);
    x.save(); x.globalAlpha = receipt ? 0.1 : 0.16; x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = true; x.drawImage(n, 0, 0, W, H); x.restore();
    for (let i = 0; i < (receipt ? 8 : 26); i++) {
      const cx = r() * W, cy = r() * H, rad = (0.05 + r() * 0.2) * Math.max(W, H), lite = r() < 0.35;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, lite ? 'rgba(250,246,232,0.10)' : 'rgba(150,118,62,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    // edges: darker, more handled
    const e = Math.min(W, H) * (receipt ? 0.05 : 0.06);
    for (const [x0, y0, x1, y1] of [[0, 0, e, 0], [W, 0, W - e, 0], [0, 0, 0, e], [0, H, 0, H - e]]) {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, receipt ? 'rgba(120,112,96,0.22)' : 'rgba(112,84,44,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    // grain
    x.save(); x.globalAlpha = 0.07; x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, W, H); x.restore();
    // fibres
    x.lineWidth = 1;
    for (let i = 0; i < W * H / 9000; i++) {
      const fx = r() * W, fy = r() * H, a = r() * TAU, l = 3 + r() * 9;
      x.strokeStyle = r() < 0.5 ? 'rgba(255,252,240,0.14)' : 'rgba(90,70,40,0.07)';
      x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + Math.cos(a) * l, fy + Math.sin(a) * l); x.stroke();
    }
  }
  function drawFolds(x, W, H, r) {
    const fold = (vertical, at) => {
      const p = vertical ? at * W : at * H;
      const g = vertical ? x.createLinearGradient(p - 34, 0, p + 34, 0) : x.createLinearGradient(0, p - 34, 0, p + 34);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.48, 'rgba(80,60,30,0.07)'); g.addColorStop(0.5, 'rgba(60,45,25,0.2)'); g.addColorStop(0.53, 'rgba(255,250,236,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      if (vertical) x.fillRect(p - 34, 0, 68, H); else x.fillRect(0, p - 34, W, 68);
      // wear along the crease
      for (let i = 0; i < 40; i++) {
        const t = r() * (vertical ? H : W), l = 6 + r() * 26;
        x.fillStyle = `rgba(255,250,238,${0.08 + r() * 0.14})`;
        if (vertical) x.fillRect(p - 1 + r() * 2, t, 1.5, l); else x.fillRect(t, p - 1 + r() * 2, l, 1.5);
      }
    };
    fold(true, 1 / 3); fold(true, 2 / 3); fold(false, 0.5);
  }
  function drawStains(x, W, H, r, n) {
    for (let i = 0; i < n; i++) {
      const cx = W * (0.18 + r() * 0.64), cy = H * (0.2 + r() * 0.6), rad = Math.min(W, H) * (0.05 + r() * 0.08);
      try { Tex.util.waterStain(x, W * 50, H * 50, r, cx, cy, rad, 0.9); } catch (e) { /* tex helpers missing */ }
    }
    if (r() < 0.8) {   // a coffee ring
      const cx = W * (0.62 + r() * 0.3), cy = H * (0.12 + r() * 0.25), rad = Math.min(W, H) * (0.045 + r() * 0.02);
      x.save(); x.lineWidth = rad * 0.1; x.strokeStyle = 'rgba(112,72,34,0.2)';
      const a0 = r() * TAU; x.beginPath(); x.ellipse(cx, cy, rad, rad * 0.94, r(), a0, a0 + TAU * (0.72 + r() * 0.25)); x.stroke();
      x.lineWidth = rad * 0.03; x.strokeStyle = 'rgba(100,62,28,0.2)'; x.beginPath(); x.ellipse(cx, cy, rad * 0.93, rad * 0.88, r(), 0, TAU); x.stroke();
      x.restore();
    }
  }
  // hand-inked polyline: subdivided with a slow wobble
  function inkPath(x, pts, closed, r, amp = 0.5) {
    const P = closed ? [...pts, pts[0]] : pts;
    let o = 0;
    x.beginPath();
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1];
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 9)), nx = -(by - ay) / (L || 1), ny = (bx - ax) / (L || 1);
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        o = o * 0.6 + (r() - 0.5) * amp * 0.8;
        const px = ax + (bx - ax) * t + nx * o, py = ay + (by - ay) * t + ny * o;
        if (i === 0 && k === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
    }
    if (closed) x.closePath();
  }
  function smallCaps(x, text, px, py, size, o = {}) {
    x.save();
    x.font = `${o.italic ? 'italic ' : ''}${o.mono ? 'bold ' : 'small-caps '}${size}px ${o.mono ? MONO : SERIF}`;
    x.textAlign = o.align || 'center'; x.textBaseline = 'middle';
    x.fillStyle = o.color || x.fillStyle;
    try { x.letterSpacing = `${(o.spacing ?? 0.12) * size}px`; } catch (e) { /* older canvas */ }
    x.translate(px, py); if (o.rot) x.rotate(o.rot);
    const lines = String(text).split('\n');
    lines.forEach((l, i) => x.fillText(o.mono ? l.toUpperCase() : l, 0, (i - (lines.length - 1) / 2) * size * 1.15));
    x.restore();
  }
  function fitLabel(x, text, maxW, size, o = {}) {
    x.save(); x.font = `${o.mono ? 'bold ' : 'small-caps '}${size}px ${o.mono ? MONO : SERIF}`;
    const w = Math.max(...String(text).split('\n').map((l) => x.measureText(l).width * (1 + (o.spacing ?? 0.12))));
    x.restore();
    return w > maxW ? Math.max(5, size * maxW / w) : size;
  }
  function drawShapes(x, shapes, r, receipt) {
    const ink = receipt ? 'rgba(46,52,64,0.78)' : 'rgba(33,29,24,0.92)', roadFill = receipt ? '#e9e6dc' : '#e6dec8';
    const lw = receipt ? 1.35 : 1.05;
    x.lineJoin = 'round'; x.lineCap = 'round';
    const by = (t) => shapes.filter((s) => s && s.t === t);
    const seeds = new Map(); shapes.forEach((s, i) => seeds.set(s, U.hash(JSON.stringify([s.t, s.x, s.y, s.pts, i])) || 1));
    const rs = (s) => U.rng(seeds.get(s));
    // roads: all edges first, then all fills, so junctions merge
    const roads = by('road');
    for (const pass of [0, 1]) for (const s of roads) {
      if (!s.pts || s.pts.length < 2) continue;
      inkPath(x, s.pts, false, rs(s), 0.35);
      x.lineWidth = pass ? Math.max(1, (s.w || 12)) : (s.w || 12) + lw * 2.2;
      x.strokeStyle = pass ? roadFill : ink;
      x.lineCap = 'butt';
      x.stroke();
      x.lineCap = 'round';
    }
    // areas / buildings
    for (const s of shapes) {
      if (!s) continue;
      x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = (s.lw || 1) * lw;
      x.setLineDash(s.dash ? [5, 4] : []);
      if (s.t === 'rect') {
        const pts = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
        inkPath(x, pts, true, rs(s), 0.45);
        if (s.fill) { x.save(); x.fillStyle = typeof s.fill === 'string' ? s.fill : receipt ? 'rgba(40,44,52,0.13)' : 'rgba(96,82,58,0.14)'; x.fill(); x.restore(); }
        x.stroke();
      } else if (s.t === 'poly' && s.pts && s.pts.length > 2) {
        inkPath(x, s.pts, true, rs(s), 0.45);
        if (s.fill) { x.save(); x.fillStyle = typeof s.fill === 'string' ? s.fill : receipt ? 'rgba(40,44,52,0.13)' : 'rgba(96,82,58,0.14)'; x.fill(); x.restore(); }
        x.stroke();
      } else if (s.t === 'line' && s.pts && s.pts.length > 1) {
        inkPath(x, s.pts, false, rs(s), 0.4); x.stroke();
      } else if (s.t === 'stairs') {
        const pts = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
        inkPath(x, pts, true, rs(s), 0.3); x.stroke();
        const n = Math.max(3, Math.round((s.axis === 'y' ? s.h : s.w) / 5));
        for (let i = 1; i < n; i++) {
          x.beginPath();
          if (s.axis === 'y') { const yy = s.y + (s.h * i) / n; x.moveTo(s.x, yy); x.lineTo(s.x + s.w, yy); } else { const xx = s.x + (s.w * i) / n; x.moveTo(xx, s.y); x.lineTo(xx, s.y + s.h); }
          x.lineWidth = lw * 0.7; x.stroke();
        }
      } else if (s.t === 'door') {
        const R = s.r || 7;
        x.save(); x.translate(s.x, s.y); x.rotate(U.rad(s.rot || 0));
        x.lineWidth = lw * 0.9;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(R, 0); x.stroke();
        x.setLineDash([1.6, 1.8]); x.beginPath(); x.arc(0, 0, R, 0, -Math.PI / 2, true); x.stroke();
        x.restore();
      }
      x.setLineDash([]);
    }
    // labels
    x.fillStyle = ink;
    for (const s of shapes) {
      if (!s) continue;
      if (s.t === 'road' && s.label && s.pts && s.pts.length > 1) {
        let best = 0, bi = 0;
        for (let i = 0; i < s.pts.length - 1; i++) { const L = Math.hypot(s.pts[i + 1][0] - s.pts[i][0], s.pts[i + 1][1] - s.pts[i][1]); if (L > best) { best = L; bi = i; } }
        const [ax, ay] = s.pts[bi], [bx, bz] = s.pts[bi + 1];
        let ang = Math.atan2(bz - ay, bx - ax);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const size = s.size || Math.min(12, Math.max(7, (s.w || 12) * 0.62));
        smallCaps(x, s.label, (ax + bx) / 2, (ay + bz) / 2, fitLabel(x, s.label, best * 0.9, size, { mono: receipt, spacing: 0.22 }), { rot: ang, mono: receipt, spacing: 0.22 });
      } else if ((s.t === 'rect' || s.t === 'poly') && s.label) {
        let cx, cy, mw;
        if (s.t === 'rect') { cx = s.x + s.w / 2; cy = s.y + s.h / 2; mw = s.w * 0.86; }
        else { cx = 0; cy = 0; for (const p of s.pts) { cx += p[0]; cy += p[1]; } cx /= s.pts.length; cy /= s.pts.length; const xs = s.pts.map((p) => p[0]); mw = (Math.max(...xs) - Math.min(...xs)) * 0.7; }
        if (s.lx != null) { cx = s.lx; cy = s.ly; }
        const base = s.size || Math.min(16, Math.max(7, (s.t === 'rect' ? Math.min(s.w, s.h) : mw) * 0.22));
        smallCaps(x, s.label, cx, cy, fitLabel(x, s.label, mw, base, { mono: receipt }), { mono: receipt, rot: s.rot ? U.rad(s.rot) : 0 });
      } else if (s.t === 'text' && s.text != null) {
        smallCaps(x, s.text, s.x, s.y, s.size || 11, { mono: receipt, italic: s.italic, align: s.align, rot: s.rot ? U.rad(s.rot) : 0, spacing: s.spacing });
      }
    }
  }
  function drawCompass(x, cx, cy, R, ink) {
    x.save(); x.translate(cx, cy);
    x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = R * 0.035;
    x.beginPath(); x.arc(0, 0, R * 0.62, 0, TAU); x.stroke();
    x.beginPath(); x.arc(0, 0, R * 0.56, 0, TAU); x.lineWidth = R * 0.018; x.stroke();
    for (let i = 0; i < 4; i++) {
      x.save(); x.rotate((i * Math.PI) / 2);
      const L = i === 0 ? R : R * 0.78, w = R * 0.16;
      x.beginPath(); x.moveTo(0, -L); x.lineTo(w, 0); x.lineTo(0, 0); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(0, -L); x.lineTo(-w, 0); x.lineTo(0, 0); x.closePath(); x.lineWidth = R * 0.03; x.stroke();
      x.restore();
    }
    for (let i = 0; i < 4; i++) { x.save(); x.rotate(Math.PI / 4 + (i * Math.PI) / 2); x.beginPath(); x.moveTo(0, -R * 0.5); x.lineTo(R * 0.07, 0); x.lineTo(-R * 0.07, 0); x.closePath(); x.lineWidth = R * 0.02; x.stroke(); x.restore(); }
    smallCaps(x, 'N', 0, -R * 1.22, R * 0.36, { color: ink, spacing: 0 });
    x.restore();
  }
  function inkFade(ix, W, H, r, amt, streaky) {
    // erase the ink by a soft noise field (alpha = 1 - noise): faded thermal print / uneven ink. Built small, drawn big.
    const sw = 96, sh = Math.max(8, Math.round(96 * H / W));
    const n = Tex.util.fbm(sw, sh, r, { cells: streaky ? 3 : 6, cy: streaky ? 22 : Math.max(1, Math.round(6 * sh / sw)), oct: 4 });
    const c = canvas(sw, sh), x = c.getContext('2d'), im = x.createImageData(sw, sh);
    for (let i = 0; i < n.length; i++) { im.data[i * 4 + 3] = (1 - n[i]) * 255; }
    x.putImageData(im, 0, 0);
    ix.save();
    ix.globalCompositeOperation = 'destination-out';
    ix.globalAlpha = amt;
    ix.imageSmoothingEnabled = true;
    ix.drawImage(c, 0, 0, W, H);
    ix.restore();
  }
  function mapSheet(id, fl) {
    const key = id + '|' + fl;
    if (sheetCache.has(key)) return sheetCache.get(key);
    const def = MAPS[id], F = (def.floors && def.floors[fl]) || { w: 1000, h: 700, shapes: [] };
    const receipt = def.kind === 'receipt';
    const w = F.w || 1000, h = F.h || 700;
    const M = receipt ? { l: 34, r: 34, t: 190, b: 176 } : { l: 64, r: 64, t: 122, b: 96 };
    const k = MAP_K * Math.min(1, 2400 / (w + M.l + M.r), 2400 / (h + M.t + M.b));
    const SW = Math.round((w + M.l + M.r) * k), SH = Math.round((h + M.t + M.b) * k);
    const cv = canvas(SW, SH), x = cv.getContext('2d');
    const r = U.rng(U.hash('map:' + key));
    drawPaperBase(x, SW, SH, r, receipt);
    if (!receipt) { drawFolds(x, SW, SH, r); drawStains(x, SW, SH, r, def.stains ?? 1); }
    else { // thermal head lines
      x.fillStyle = 'rgba(80,86,96,0.025)'; for (let yy = 0; yy < SH; yy += 3) x.fillRect(0, yy, SW, 1);
    }
    const ink = canvas(SW, SH), ix = ink.getContext('2d');
    const inkCol = receipt ? 'rgba(46,52,64,0.78)' : 'rgba(33,29,24,0.92)';
    ix.save(); ix.translate(M.l * k, M.t * k); ix.scale(k, k);
    drawShapes(ix, F.shapes || [], r, receipt);
    ix.restore();
    ix.fillStyle = inkCol; ix.strokeStyle = inkCol;
    const floors = floorsOf(def);
    if (!receipt) {
      // frame: a double rule
      const fx0 = (M.l - 16) * k, fy0 = (M.t - 16) * k, fx1 = SW - (M.r - 16) * k, fy1 = SH - (M.b - 16) * k;
      ix.lineWidth = 2.2 * k * 0.5; ix.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
      ix.lineWidth = 0.8 * k * 0.5; ix.strokeRect(fx0 - 5 * k, fy0 - 5 * k, fx1 - fx0 + 10 * k, fy1 - fy0 + 10 * k);
      smallCaps(ix, upper(def.title || id), SW / 2, (M.t - 16) * k * 0.46, Math.min(26 * k, (SW * 0.8) / Math.max(8, String(def.title || id).length * 0.82)), { color: inkCol, spacing: 0.16 });
      const sub = [def.sub, floors.length > 1 ? floorName(def, fl) : null].filter(Boolean).join(' · ');
      if (sub) smallCaps(ix, sub, SW / 2, (M.t - 16) * k * 0.8, 11 * k, { italic: true, color: inkCol, spacing: 0.08 });
      const fy = SH - (M.b - 16) * k * 0.45;
      smallCaps(ix, def.scale || 'Not to scale', (M.l - 16) * k, fy, 9 * k, { align: 'left', color: inkCol, spacing: 0.2 });
      if (def.printed || def.publisher) smallCaps(ix, [def.publisher, def.printed ? `Printed ${def.printed}` : null].filter(Boolean).join(' · '), SW / 2, fy, 9 * k, { color: inkCol, spacing: 0.2 });
      drawCompass(ix, SW - (M.r - 16) * k - 30 * k, fy - 6 * k, 22 * k, inkCol);
    } else {
      const cx = SW / 2, mono = { mono: true, color: inkCol, spacing: 0.06 };
      let y = 44 * k;
      smallCaps(ix, '* * * * * * * * * * * *', cx, y, 10 * k, mono); y += 30 * k;
      smallCaps(ix, upper(def.title || id), cx, y, fitLabel(ix, upper(def.title || id), SW * 0.9, 15 * k, { mono: true }), mono); y += 26 * k;
      if (def.sub) { smallCaps(ix, upper(def.sub), cx, y, 10 * k, mono); y += 22 * k; }
      if (floors.length > 1) { smallCaps(ix, upper(floorName(def, fl)), cx, y, 10 * k, mono); y += 22 * k; }
      smallCaps(ix, '-'.repeat(Math.max(10, Math.round(SW / (7.5 * k)))), cx, (M.t - 18) * k, 10 * k, mono);
      const fy = SH - M.b * k;
      smallCaps(ix, '-'.repeat(Math.max(10, Math.round(SW / (7.5 * k)))), cx, fy + 18 * k, 10 * k, mono);
      smallCaps(ix, 'KEEP THIS RECEIPT', cx, fy + 46 * k, 10 * k, mono);
      const bw = SW * 0.62, bx = cx - bw / 2, rr = U.rng(U.hash(id));
      for (let bxx = bx; bxx < bx + bw;) { const ww = (1 + Math.floor(rr() * 3)) * k; if (rr() < 0.6) ix.fillRect(bxx, fy + 64 * k, ww, 38 * k); bxx += ww + k * (0.6 + rr()); }
      smallCaps(ix, def.printed ? `${def.printed}  --:--` : '--/--  --:--', cx, fy + 118 * k, 10 * k, mono);
      smallCaps(ix, 'THANK YOU', cx, fy + 144 * k, 10 * k, mono);
    }
    inkFade(ix, SW, SH, r, receipt ? 0.8 : 0.2, receipt);
    x.drawImage(ink, 0, 0);
    const sh = { cv, SW, SH, k, M, w, h, receipt, id, fl };
    sheetCache.set(key, sh);
    return sh;
  }
  // a floor tab's printed name: MAPS[id].floorNames[fl] if given, else B → Basement, G → Ground, LG → Lower Ground,
  // M → Mezzanine, L4 → Level 4, P1 → Parking 1, 3 → Level 3 (other keys as they are)
  function floorName(def, fl) {
    const names = def && def.floorNames;
    if (names && names[fl]) return names[fl];
    const f = String(fl), m = /^([A-Za-z]*)(\d*)$/.exec(f);
    if (!m) return f;
    const n = m[2], base = { B: 'Basement', G: 'Ground', LG: 'Lower Ground', UG: 'Upper Ground', M: 'Mezzanine', L: 'Level', P: 'Parking', R: 'Roof' }[m[1].toUpperCase()];
    if (!m[1] && n) return 'Level ' + n;
    if (!base) return f;
    return n ? `${base} ${n}` : base === 'Level' ? f : base;
  }
  function mapMarks(id, fl) {
    const def = MAPS[id], floors = floorsOf(def), f0 = floors.includes('G') ? 'G' : floors[0];
    const out = [];
    for (const m of def.marks || []) {
      if (!m || (m.floor ?? f0) !== fl) continue;
      if (m.when) { try { if (!m.when(S)) continue; } catch (e) { continue; } }
      out.push(m);
    }
    for (const [mid, m] of Object.entries(S.mapMarks || {})) if (m && m.map === id && (m.floor ?? f0) === fl) out.push({ id: mid, ...m });
    return out;
  }
  // Aidan's marker: wobbly, slightly translucent, a little overshoot
  function drawMark(x, m, receipt, maxX = Infinity) {
    const col = receipt ? 'rgba(18,128,118,0.9)' : 'rgba(176,34,28,0.86)';
    const r = U.rng(U.hash(String(m.id || '') + m.t + m.x + ',' + m.y) || 7);
    const j = (a) => (r() - 0.5) * a;
    x.save();
    x.translate(m.x || 0, m.y || 0);
    x.strokeStyle = col; x.fillStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
    if (!receipt) x.globalCompositeOperation = 'multiply';
    const stroke = (pts, w) => { x.lineWidth = w; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); };
    const s = m.size || 9;
    if (m.t === 'x') {
      stroke([[-s + j(2), -s + j(2)], [j(1.5), j(1.5)], [s + 1.5 + j(2), s + 1 + j(2)]], 2.8);
      stroke([[s + j(2), -s - 1 + j(2)], [j(1.5), j(1.5)], [-s - 1.5 + j(2), s + j(2)]], 2.8);
    } else if (m.t === 'circle') {
      const rx = m.r || 16, ry = (m.r || 16) * 0.8, a0 = r() * TAU, turns = 1.12 + r() * 0.1, pts = [];
      for (let i = 0; i <= 44; i++) { const a = a0 + (i / 44) * TAU * turns, k = 1 + Math.sin(i * 0.5 + a0) * 0.04 + (i / 44) * 0.08; pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]); }
      stroke(pts, 2.4);
    } else if (m.t === 'tick') {
      stroke([[-7 + j(1), -1 + j(1)], [-2 + j(1), 6 + j(1)], [4, -2 + j(1)], [11 + j(2), -11 + j(2)]], 2.8);
    } else if (m.t === 'arrow') {
      x.rotate(U.rad(m.rot || 0));
      stroke([[-14, j(2)], [0, j(1)], [13, 0]], 2.6);
      stroke([[5, -6 + j(1)], [13, 0], [5, 6 + j(1)]], 2.6);
    }
    if (m.text) {
      const font = (Tex.fonts && Tex.fonts.marker) || "'Comic Sans MS', cursive";
      let tx = m.t === 'note' ? 0 : s + 6;
      const ty = m.t === 'note' ? 0 : 5;
      // text that would run off the sheet (narrow receipt strips) goes to the left of the mark instead
      if (isFinite(maxX)) {
        x.font = `bold ${m.textSize || 15}px ${font}`;
        const tw = x.measureText(String(m.text)).width * 1.08;
        if ((m.x || 0) + tx + tw > maxX) tx = m.t === 'note' ? Math.max(-(m.x || 0), maxX - (m.x || 0) - tw) : -(s + 6) - tw;
      }
      x.rotate(U.rad(m.t === 'note' ? (m.rot ?? -3) : -2));
      try { Tex.handwriting(x, String(m.text), tx, ty, { size: m.textSize || 15, color: col, font, wobble: 1.1, weight: 'bold' }); }
      catch (e) { x.font = `bold 15px ${font}`; x.fillText(String(m.text), tx, ty); }
    }
    x.restore();
  }
  function composeSheet(sh, id, fl) {
    const cv = canvas(sh.SW, sh.SH), x = cv.getContext('2d');
    x.drawImage(sh.cv, 0, 0);
    x.save(); x.translate(sh.M.l * sh.k, sh.M.t * sh.k); x.scale(sh.k, sh.k);
    const maxX = sh.SW / sh.k - sh.M.l - 4;                 // the sheet's right edge in map units
    for (const m of mapMarks(id, fl)) { try { drawMark(x, m, sh.receipt, maxX); } catch (e) { console.error('[Menus] map mark', e); } }
    x.restore();
    return cv;
  }
  // the desk (dark, worn laminate over timber), lamp light and vignette at screen size
  function mapDesk(W, H) {
    const c = canvas(W, H), x = c.getContext('2d'), r = U.rng(77);
    x.fillStyle = '#16120e'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < H / 2; i++) {
      const y = r() * H, a = 0.02 + r() * 0.05, dark = r() < 0.6;
      x.strokeStyle = dark ? `rgba(0,0,0,${a * 2})` : `rgba(120,92,60,${a})`;
      x.lineWidth = 0.6 + r() * 2.4;
      x.beginPath(); x.moveTo(0, y);
      for (let xx = 0; xx <= W; xx += W / 8) x.lineTo(xx, y + Math.sin(xx * 0.004 + i) * 4 + (r() - 0.5) * 2);
      x.stroke();
    }
    x.save(); x.globalAlpha = 0.06; x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, W, H); x.restore();
    for (let i = 0; i < 18; i++) { x.strokeStyle = `rgba(160,140,110,${0.03 + r() * 0.05})`; x.lineWidth = 1; const sx = r() * W, sy = r() * H, a = r() * TAU, l = 20 + r() * 120; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
    return c;
  }
  function mapVignette(W, H) {
    const c = canvas(W, H), x = c.getContext('2d');
    const lamp = x.createRadialGradient(W * 0.34, H * 0.22, 0, W * 0.34, H * 0.22, Math.max(W, H) * 0.9);
    lamp.addColorStop(0, 'rgba(255,214,160,0.07)'); lamp.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lamp; x.fillRect(0, 0, W, H);
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(0,0,0,0.42)'); v.addColorStop(1, 'rgba(0,0,0,0.88)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    return c;
  }

  SCREENS.map = {
    backdrop: 'black', inGame: true,
    build(sc) {
      const st = sc.st;
      const tg = mapTarget(sc.opts);
      st.tg = tg;
      if (!tg.def || !tg.owned) {
        st.none = true;
        mk('div', 'mn-msg', sc.el, "You don't have a map of this area.").style.top = '47%';
        st.t0 = 0;
        return;
      }
      st.floor = tg.floor;
      st.cv = mk('canvas', 'mn-cv', sc.el);
      st.ctx = st.cv.getContext('2d');
      st.cvF = fader(st.cv, 1);
      if (tg.floors.length > 1) {
        st.floorsEl = mk('div', 'mp-floors', sc.el);
        st.floorEls = tg.floors.map((f) => {
          const e = mk('span', 'mp-f', st.floorsEl, esc(f));
          e.addEventListener('mousedown', (ev) => { if (ev.button === 0 && sc.ready && !st.busy) mapFloor(sc, f); });
          return e;
        });
      }
      st.zoom = 0;
      st.rot = U.rad(((U.hash(tg.id) % 100) / 100 - 0.5) * 2.2);
      mapLoadFloor(sc, st.floor);
      st.view = { ...st.goal };
      legend(sc, () => [st.zoom ? ['W A S D', 'L STICK', 'MOVE'] : null, ['E', 'A', st.zoom === 2 ? 'AREA' : 'CLOSER'], tg.floors.length > 1 ? ['Q R', 'LB RB', 'FLOOR'] : null, ['ESC', 'B', 'BACK']]);
      mapResize(sc);
    },
    show(sc) { if (!sc.st.none) { sfx('paper', { vol: 0.9 }); sc.st.dirty = true; } },
    resize(sc) { if (!sc.st.none) mapResize(sc); },
    update(sc, dt) {
      const st = sc.st;
      if (st.none) {
        st.t0 += dt;
        if (sc.ready && (K.any() || st.t0 > 2.6)) { if (st.t0 > 0.25) { sfx('ui_cancel'); sc.close(null); } }
        return;
      }
      if (sc.ready && !st.busy) mapInput(sc, dt);
      const v = st.view, g = st.goal;
      const k = 1 - Math.exp(-11 * dt);
      const before = v.cx + v.cy * 7 + v.s * 1000;
      v.cx += (g.cx - v.cx) * k; v.cy += (g.cy - v.cy) * k; v.s += (g.s - v.s) * k;
      if (Math.abs(before - (v.cx + v.cy * 7 + v.s * 1000)) > 0.01) st.dirty = true;
      if (st.dirty) { st.dirty = false; mapDraw(sc); }
    },
  };
  function mapLoadFloor(sc, f) {
    const st = sc.st;
    st.floor = f;
    st.sheet = mapSheet(st.tg.id, f);
    st.work = composeSheet(st.sheet, st.tg.id, f);
    st.me = st.tg.here === f ? playerOnMap(st.tg.xform) : null;
    if (st.floorEls) st.floorEls.forEach((e, i) => e.classList.toggle('sel', st.tg.floors[i] === f));
    mapGoal(sc, true);
    st.dirty = true;
  }
  function mapResize(sc) {
    const st = sc.st, dpr = DPR();
    st.dpr = dpr;
    st.cv.width = Math.round(window.innerWidth * dpr); st.cv.height = Math.round(window.innerHeight * dpr);
    const key = st.cv.width + 'x' + st.cv.height;
    if (!deskCache || deskCache.key !== key) deskCache = { key, desk: mapDesk(st.cv.width, st.cv.height), vig: mapVignette(st.cv.width, st.cv.height) };
    st.desk = deskCache.desk; st.vig = deskCache.vig;
    mapGoal(sc, false);
    st.view.s = st.goal.s;
    st.dirty = true;
  }
  function mapFit(st) { const sh = st.sheet; return Math.min((window.innerWidth * 0.86) / sh.SW, (window.innerHeight * 0.84) / sh.SH); }
  function mapGoal(sc, recentre) {
    const st = sc.st, sh = st.sheet, fit = mapFit(st);
    // three steps: the whole sheet, the building (≤ 1.25 sheet px per screen px), close (≤ 2.5 — small labels on a small
    // window read at this one)
    const s1 = Math.min(Math.max(fit * 2.5, fit * 1.4), 1.25);
    const s = st.zoom === 2 ? Math.max(s1 * 1.6, Math.min(fit * 5, 2.5)) : st.zoom ? s1 : fit;
    const g = st.goal || { cx: sh.SW / 2, cy: sh.SH / 2, s };
    g.s = s;
    if (!st.zoom) { g.cx = sh.SW / 2; g.cy = sh.SH / 2; }
    else if (recentre) {
      if (st.me) { g.cx = (sh.M.l + st.me.x) * sh.k; g.cy = (sh.M.t + st.me.y) * sh.k; } else { g.cx = sh.SW / 2; g.cy = sh.SH / 2; }
    }
    st.goal = g;
    mapClamp(st);
  }
  function mapClamp(st) {
    const g = st.goal, sh = st.sheet, hw = window.innerWidth / (2 * g.s), hh = window.innerHeight / (2 * g.s);
    g.cx = sh.SW > hw * 2 ? clamp(g.cx, hw * 0.9, sh.SW - hw * 0.9) : sh.SW / 2;
    g.cy = sh.SH > hh * 2 ? clamp(g.cy, hh * 0.9, sh.SH - hh * 0.9) : sh.SH / 2;
  }
  async function mapFloor(sc, f) {
    const st = sc.st;
    if (f === st.floor || st.busy) return;
    st.busy = true;
    sfx('paper', { vol: 0.8 });
    await st.cvF.to(0, 0.16);
    mapLoadFloor(sc, f);
    st.view = { ...st.goal };
    mapDraw(sc);
    await st.cvF.to(1, 0.22);
    st.busy = false;
  }
  function mapInput(sc, dt) {
    const st = sc.st, fl = st.tg.floors;
    if (K.cancel() || K.key('KeyM') || padEdge(8)) { sfx('ui_cancel'); sc.close(null); return; }
    const wh = inp('wheel') || 0;
    const conf = K.confirm();
    if (conf || (wh < 0 && st.zoom < 2) || (wh > 0 && st.zoom)) {
      st.zoom = conf ? (st.zoom + 1) % 3 : clamp(st.zoom + (wh < 0 ? 1 : -1), 0, 2);
      sfx('paper', { vol: 0.45, dur: 0.3 }); mapGoal(sc, true);
    }
    if (fl.length > 1) {
      let d = 0;
      if (K.key('KeyQ') || K.key('BracketLeft') || K.key('PageDown') || padEdge(4)) d = -1;
      if (K.key('KeyR') || K.key('BracketRight') || K.key('PageUp') || padEdge(5)) d = 1;
      for (let i = 0; i < Math.min(9, fl.length); i++) if (K.key('Digit' + (i + 1))) { mapFloor(sc, fl[i]); return; }
      if (d) { const i = clamp(fl.indexOf(st.floor) + d, 0, fl.length - 1); if (fl[i] !== st.floor) mapFloor(sc, fl[i]); else sfx('ui_cancel', { vol: 0.5 }); return; }
    }
    if (st.zoom) {
      const mv = inp('move') || { x: 0, y: 0 }, md = takeDrag();
      const sp = 820 / st.goal.s;
      if (mv.x || mv.y || md.dx || md.dy) {
        st.goal.cx += mv.x * sp * dt - md.dx / st.goal.s;
        st.goal.cy -= mv.y * sp * dt + md.dy / st.goal.s;
        mapClamp(st);
      }
    }
  }
  function mapDraw(sc) {
    const st = sc.st, x = st.ctx, cv = st.cv, dpr = st.dpr, sh = st.sheet, v = st.view;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(st.desk, 0, 0);
    x.save();
    x.translate(cv.width / 2, cv.height / 2);
    x.scale(v.s * dpr, v.s * dpr);
    x.rotate(st.rot);
    x.translate(-v.cx, -v.cy);
    const path = () => {
      x.beginPath();
      if (!sh.receipt) { x.rect(0, 0, sh.SW, sh.SH); return; }
      // torn-off top edge; the rolled end below
      const tw = 16 * sh.k;
      x.moveTo(0, 6 * sh.k);
      for (let xx = 0, i = 0; xx < sh.SW; xx += tw, i++) x.lineTo(Math.min(sh.SW, xx + tw / 2), i % 2 ? 6 * sh.k : 0), x.lineTo(Math.min(sh.SW, xx + tw), 6 * sh.k);
      x.lineTo(sh.SW, sh.SH); x.lineTo(0, sh.SH); x.closePath();
    };
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 34 * dpr; x.shadowOffsetX = 9 * dpr; x.shadowOffsetY = 16 * dpr;
    path(); x.fillStyle = sh.receipt ? '#dcd9cf' : '#cfc6ab'; x.fill();
    x.restore();
    x.save(); path(); x.clip(); x.drawImage(st.work, 0, 0);
    if (sh.receipt) {
      // curl: the strip's long edges lift off the desk
      const e = sh.SW * 0.09;
      for (const [x0, x1] of [[0, e], [sh.SW, sh.SW - e]]) {
        const g = x.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(40,36,30,0.42)'); g.addColorStop(0.18, 'rgba(255,255,250,0.16)'); g.addColorStop(0.45, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(Math.min(x0, x1), 0, e, sh.SH);
      }
      const g = x.createLinearGradient(0, sh.SH - 90 * sh.k, 0, sh.SH);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,28,24,0.35)');
      x.fillStyle = g; x.fillRect(0, sh.SH - 90 * sh.k, sh.SW, 90 * sh.k);
    }
    x.restore();
    if (sh.receipt) {
      // the rest of the roll, curled under at the bottom
      const ry = sh.SH, rh = 46 * sh.k;
      const g = x.createLinearGradient(0, ry, 0, ry + rh);
      g.addColorStop(0, '#9c998f'); g.addColorStop(0.3, '#e4e1d7'); g.addColorStop(0.62, '#c9c6bc'); g.addColorStop(1, '#5b5850');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, ry); x.lineTo(sh.SW, ry); x.quadraticCurveTo(sh.SW + 10 * sh.k, ry + rh / 2, sh.SW, ry + rh); x.lineTo(0, ry + rh); x.quadraticCurveTo(-10 * sh.k, ry + rh / 2, 0, ry); x.fill();
    }
    // Aidan: a small red printed arrow (only on maps he owns — this one)
    if (st.me && st.me.x >= -10 && st.me.y >= -10 && st.me.x <= sh.w + 10 && st.me.y <= sh.h + 10) {
      const px = (sh.M.l + st.me.x) * sh.k, py = (sh.M.t + st.me.y) * sh.k, s = 15 * sh.k;
      x.save(); x.translate(px, py); x.rotate(st.me.ang);
      x.beginPath(); x.moveTo(s * 1.25, 0); x.lineTo(-s * 0.8, -s * 0.72); x.lineTo(-s * 0.35, 0); x.lineTo(-s * 0.8, s * 0.72); x.closePath();
      x.fillStyle = sh.receipt ? '#b8261f' : '#c4221a'; x.fill();
      x.lineWidth = 0.9 * sh.k; x.strokeStyle = 'rgba(60,10,8,0.8)'; x.stroke();
      x.restore();
    }
    x.restore();
    x.drawImage(st.vig, 0, 0);
  }

  // =================================================================================================================
  // MEMOS (§2A): titles on black grouped Story / Account Notes / Operator's Log / Whiteboards / Returns Notes /
  // Personal; unread entries have a small dot. Confirm opens the reading view.
  // =================================================================================================================
  const GROUPS = ['Story', 'Account Notes', "Operator's Log", 'Whiteboards', 'Returns Notes', 'Personal'];
  function normGroup(g) {
    const k = String(g || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!k || k === 'story' || k === 'puzzle' || k === 'clue') return 'Story';
    if (k.startsWith('account')) return 'Account Notes';
    if (k.startsWith('operator')) return "Operator's Log";
    if (k.includes('whiteboard') || k.startsWith('huddle')) return 'Whiteboards';
    if (k.startsWith('return')) return 'Returns Notes';
    if (k.startsWith('personal')) return 'Personal';
    return String(g);
  }
  const docDef = (id) => (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[id]) || null;
  function memoItems() {
    const order = Object.keys(typeof DOCUMENTS !== 'undefined' ? DOCUMENTS : {});
    const ids = Object.keys(S.docs || {}).sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
    const groups = new Map(GROUPS.map((g) => [g, []]));
    for (const id of ids) {
      const d = docDef(id), g = normGroup(d && d.group);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ id, title: (d && d.title) || id, unread: !(S.docs[id] && S.docs[id].read) });
    }
    const items = [];
    for (const [g, list] of groups) {
      if (!list.length) continue;
      items.push({ label: g, skip: true, cls: 'mm-g' });
      for (const e of list) items.push({ value: e.id, html: `<i class="${e.unread ? 'mn-dot' : 'mn-nodot'}"></i>${esc(upper(e.title))}` });
    }
    return items;
  }
  SCREENS.memos = {
    backdrop: 'black', inGame: true,
    build(sc) {
      const st = sc.st;
      mk('div', 'mn-h mm-head', sc.el, 'Memos');
      st.view = mk('div', 'mm-view', sc.el);
      st.list = makeList(st.view, [], { cls: 'mm-list' });
      st.list.el.style.position = 'absolute';
      st.scroll = 0;
      st.empty = mk('div', 'mn-msg', sc.el); st.empty.style.top = '46%'; st.empty.style.fontStyle = 'italic'; st.empty.style.color = COL.faint;
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['E', 'A', 'READ'], ['ESC', 'B', 'BACK']]);
      memosRefresh(sc, sc.opts.id);
    },
    show(sc) { memosRefresh(sc); },
    update(sc, dt) {
      const st = sc.st;
      // keep the selection in view
      const it = st.list.items[st.list.i];
      if (it) {
        const vh = st.view.clientHeight, y = it.e.offsetTop, h = it.e.offsetHeight;
        let want = st.scroll;
        if (y - want < vh * 0.18) want = y - vh * 0.18; else if (y + h - want > vh * 0.82) want = y + h - vh * 0.82;
        want = clamp(want, 0, Math.max(0, st.list.el.offsetHeight - vh));
        st.scroll = U.damp(st.scroll, want, 14, dt);
        st.list.el.style.transform = `translateY(${(-st.scroll).toFixed(1)}px)`;
      }
      const wh = inp('wheel') || 0;
      if (wh && sc.ready) { const n = st.list.items.length; let j = st.list.i; for (let k = 0; k < n; k++) { j = clamp(j + Math.sign(wh), 0, n - 1); if (!st.list.items[j].skip) break; } if (!st.list.items[j].skip && j !== st.list.i) { st.list.select(j); sfx('ui_move'); } }
      const r = st.list.step(sc);
      if (r && r.pick) { sfx('ui_confirm'); sc.push('doc', { id: r.pick.value }); return; }
      if ((r && r.cancel) || (sc.ready && !st.list.items.length && K.cancel())) { sfx('ui_cancel'); sc.close(null); }
    },
  };
  function memosRefresh(sc, selId) {
    const st = sc.st, L = st.list;
    const cur = selId || (L.items[L.i] && L.items[L.i].value);
    L.set(memoItems());
    const j = cur != null ? L.items.findIndex((x) => x.value === cur) : -1;
    if (j >= 0) L.select(j);
    else { const k = L.items.findIndex((x) => !x.skip); if (k >= 0) L.select(k); }
    st.empty.textContent = L.items.length ? '' : 'No memos.';
  }

  // =================================================================================================================
  // DOC — the reading view: full-screen paper with a generated texture per type; handwriting in a cursive system font
  // with an uneven baseline; page turns rustle. `~~text~~` lines are struck through.
  // =================================================================================================================
  const HANDF = () => (Tex.fonts && Tex.fonts.hand) || "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive";
  const MARKF = () => (Tex.fonts && Tex.fonts.marker) || "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  const PAPER = {
    lined: { aspect: 0.72, bg: '#eeebe1', ink: '#1f2c6e', hand: true, rules: 'rgba(84,118,182,0.36)', margin: 'rgba(196,70,70,0.42)', holes: true, size: 21 },
    notebook: { aspect: 0.74, bg: '#ebe5d2', ink: '#1f2c6e', hand: true, rules: 'rgba(84,118,182,0.3)', margin: 'rgba(196,70,70,0.36)', spiral: true, size: 21 },
    dotmatrix: { aspect: 0.8, bg: '#eef0e5', ink: '#2f302b', font: MONO, bars: true, tractor: true, size: 44, dots: true },
    email: { aspect: 0.707, bg: '#f2f1ec', ink: '#1e1e1e', font: SANS, email: true, size: 40 },
    sticky: { aspect: 1, bg: '#e8d565', ink: '#1f2c6e', hand: true, sticky: true, size: 11 },
    whiteboard: { aspect: 1.38, photo: true, ink: '#1d3f94', hand: 'marker', size: 19 },
    laminated: { aspect: 1.52, bg: '#f4f4ef', ink: '#1c1c1c', font: SANS, laminated: true, size: 24, bold: true },
    receipt: { aspect: 0.38, bg: '#ebe8df', ink: '#46464a', font: MONO, receipt: true, size: 21, bold: true },
    plaque: { aspect: 1.75, plaque: true, ink: '#2b2112', font: SERIF, size: 22 },
    card: { aspect: 0.72, bg: '#efe6d3', ink: '#2a2340', hand: true, card: true, size: 19 },
    phone: { aspect: 0.52, phone: true, ink: '#3cc7b6', font: SANS, size: 17 },
    paper: { aspect: 0.707, bg: '#eeebe2', ink: '#262624', font: MONO, size: 40 },
  };
  function paperKind(d) { const k = d && d.paper; return PAPER[k] ? k : k === 'board' ? 'whiteboard' : 'paper'; }
  function docParas(d) {
    const out = [];
    const push = (str, hand) => {
      for (const raw of String(str).split('\n')) {
        let t = raw, strike = false;
        const m = /^\s*~~(.*)~~\s*$/.exec(t); if (m) { t = m[1]; strike = true; }
        out.push({ t, hand, strike });
      }
    };
    if (d && d.text) push(d.text, false);
    if (d && d.hand) { if (out.length) out.push({ t: '', hand: true, gap: true }); push(d.hand, true); }
    if (!out.length) out.push({ t: (d && d.title) || '', hand: false });
    return out;
  }
  function docLayout(d, CW, CH, dpr) {
    const kind = paperKind(d), P = PAPER[kind];
    let h = CH * (P.receipt ? 0.95 : P.sticky ? 0.7 : P.plaque || P.laminated ? 0.62 : 0.92), w = h * P.aspect;
    if (w > CW * 0.9) { w = CW * 0.9; h = w / P.aspect; }
    // text box inside the paper
    const box = P.photo ? { x: 0.13, y: 0.14, w: 0.74, h: 0.66 } : P.sticky ? { x: 0.12, y: 0.2, w: 0.78, h: 0.7 } : P.receipt ? { x: 0.09, y: 0.07, w: 0.82, h: 0.86 }
      : P.plaque ? { x: 0.12, y: 0.16, w: 0.76, h: 0.68 } : P.laminated ? { x: 0.08, y: 0.2, w: 0.84, h: 0.72 } : P.phone ? { x: 0.14, y: 0.19, w: 0.72, h: 0.66 }
        : P.tractor ? { x: 0.14, y: 0.08, w: 0.72, h: 0.84 } : P.card ? { x: 0.14, y: 0.2, w: 0.72, h: 0.7 } : { x: 0.17, y: 0.1, w: 0.73, h: 0.82 };
    const bx = box.x * w, by = box.y * h, bw = box.w * w, bh = box.h * h;
    const handFont = P.hand === 'marker' ? MARKF() : HANDF();
    const probe = canvas(4, 4).getContext('2d');
    let size = w / P.size;
    const paras = docParas(d);
    const fontFor = (hand, sz) => (hand || P.hand ? `${P.hand === 'marker' ? 'bold ' : ''}${sz}px ${handFont}` : `${P.bold ? 'bold ' : ''}${sz}px ${P.font || MONO}`);
    const lhFor = (sz) => sz * (P.hand ? 1.5 : P.receipt ? 1.45 : 1.42);
    const wrapAll = (sz) => {
      const lines = [];
      for (const p of paras) {
        if (p.gap) { lines.push({ t: '', hand: true, gap: true }); continue; }
        const hand = p.hand || !!P.hand;
        probe.font = fontFor(hand, sz);
        const txt = (P.receipt || P.plaque) && !p.hand ? p.t.toUpperCase() : p.t;
        const wr = Tex.util && Tex.util.wrapText ? Tex.util.wrapText(probe, txt, bw * (hand ? 0.94 : 1)) : [txt];
        wr.forEach((t, i) => lines.push({ t, hand, strike: p.strike, cont: i > 0 }));
      }
      return lines;
    };
    let lines = wrapAll(size);
    // shrink a little before paginating (never below 72 % of the design size)
    for (let k = 0; k < 6 && lines.length * lhFor(size) > bh && size > (w / P.size) * 0.72; k++) { size *= 0.93; lines = wrapAll(size); }
    // a short text on a big page grows (up to 1.6× the design size) until it fills about 60 % of the text box
    if (lines.length * lhFor(size) < bh * 0.4 && !P.phone) {
      for (let k = 0; k < 10; k++) {
        const s2 = size * 1.07;
        if (s2 > (w / P.size) * 1.6) break;
        const l2 = wrapAll(s2);
        if (l2.length * lhFor(s2) > bh * 0.6) break;
        size = s2; lines = l2;
      }
    }
    const lh = lhFor(size), per = Math.max(1, Math.floor(bh / lh));
    const pages = [];
    for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
    return { kind, P, w, h, bx, by, bw, bh, size, lh, pages, handFont, fontFor, dpr, rot: U.rad(((U.hash(d ? d.id || '' : '') % 100) / 100 - 0.5) * 1.4) };
  }
  // the paper itself (cached per doc and size)
  function docPaper(L, d) {
    const P = L.P, w = Math.round(L.w), h = Math.round(L.h), r = U.rng(U.hash('doc:' + (d && d.id)));
    const c = canvas(w, h), x = c.getContext('2d');
    const base = (col, amt = 1) => {
      x.fillStyle = col; x.fillRect(0, 0, w, h);
      const n = noiseField(w, h, r, 4);
      x.save(); x.globalAlpha = 0.1 * amt; x.globalCompositeOperation = 'multiply'; x.drawImage(n, 0, 0, w, h); x.restore();
      for (let i = 0; i < 10 * amt; i++) { const cx = r() * w, cy = r() * h, rad = (0.1 + r() * 0.3) * Math.max(w, h); const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(150,120,70,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
      const e = Math.min(w, h) * 0.05;
      for (const [x0, y0, x1, y1] of [[0, 0, e, 0], [w, 0, w - e, 0], [0, 0, 0, e], [0, h, 0, h - e]]) { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, `rgba(110,90,58,${0.22 * amt})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    };
    const grain = (a = 0.07) => { x.save(); x.globalAlpha = a; x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, w, h); x.restore(); };
    const fold = (yf) => { const y = h * yf, g = x.createLinearGradient(0, y - 14, 0, y + 14); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(70,55,35,0.14)'); g.addColorStop(0.55, 'rgba(255,252,240,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, y - 14, w, 28); };
    const stain = (a = 0.8) => { try { Tex.util.waterStain(x, w * 50, h * 50, r, w * (0.2 + r() * 0.6), h * (0.25 + r() * 0.55), Math.min(w, h) * (0.08 + r() * 0.1), a); } catch (e) { /* helper missing */ } };
    const lh = L.lh, top = L.by;
    if (P.photo) {
      // a photo of a whiteboard: print border, board, aluminium frame, marker tray, glare, ghosting
      x.fillStyle = '#ecebe6'; x.fillRect(0, 0, w, h);
      const m = w * 0.035, bw = w - m * 2, bh = h - m * 2;
      x.save(); x.translate(m, m);
      x.fillStyle = '#7d8382'; x.fillRect(0, 0, bw, bh);
      const f = bw * 0.022;
      const board = x.createLinearGradient(0, 0, bw, bh); board.addColorStop(0, '#dfe3e1'); board.addColorStop(0.5, '#eef0ee'); board.addColorStop(1, '#c9cecc');
      x.fillStyle = board; x.fillRect(f, f, bw - 2 * f, bh - 2 * f - f * 1.4);
      const glare = x.createRadialGradient(bw * 0.62, bh * 0.36, 0, bw * 0.62, bh * 0.36, bw * 0.34); glare.addColorStop(0, 'rgba(255,255,255,0.75)'); glare.addColorStop(0.35, 'rgba(255,255,255,0.18)'); glare.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = glare; x.fillRect(f, f, bw - 2 * f, bh - 2 * f);
      x.strokeStyle = 'rgba(40,70,140,0.07)'; for (let i = 0; i < 9; i++) { x.lineWidth = bh * (0.02 + r() * 0.04); x.beginPath(); const sx = bw * (0.1 + r() * 0.6), sy = bh * (0.15 + r() * 0.6); x.moveTo(sx, sy); x.bezierCurveTo(sx + bw * 0.1, sy - bh * 0.04, sx + bw * 0.2, sy + bh * 0.05, sx + bw * (0.2 + r() * 0.2), sy + bh * 0.01); x.stroke(); }
      x.fillStyle = '#a4aaa9'; x.fillRect(0, bh - f * 2.4, bw, f * 2.4);
      x.fillStyle = '#6a706f'; x.fillRect(0, bh - f * 2.4, bw, f * 0.3);
      for (const [cx, col] of [[0.18, '#1d3f94'], [0.24, '#1a1a1a'], [0.3, '#b0241c']]) { x.fillStyle = col; x.fillRect(bw * cx, bh - f * 2.05, bw * 0.05, f * 0.9); x.fillStyle = '#e8e8e2'; x.fillRect(bw * (cx + 0.035), bh - f * 2.05, bw * 0.015, f * 0.9); }
      const v = x.createRadialGradient(bw / 2, bh / 2, bw * 0.25, bw / 2, bh / 2, bw * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,24,20,0.38)');
      x.fillStyle = v; x.fillRect(0, 0, bw, bh);
      x.restore();
      grain(0.1);
      return c;
    }
    if (P.plaque) {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#6f5a34'); g.addColorStop(0.35, '#a88a52'); g.addColorStop(0.55, '#8c7040'); g.addColorStop(1, '#5d4a2a');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.save(); x.globalAlpha = 0.18; x.globalCompositeOperation = 'overlay'; x.drawImage(noiseField(w, h, r, 3, 20), 0, 0, w, h); x.restore();
      const b = Math.min(w, h) * 0.05;
      x.strokeStyle = 'rgba(255,230,170,0.35)'; x.lineWidth = 2; x.strokeRect(b, b, w - 2 * b, h - 2 * b);
      x.strokeStyle = 'rgba(40,28,10,0.55)'; x.lineWidth = 2; x.strokeRect(b + 3, b + 3, w - 2 * b - 6, h - 2 * b - 6);
      for (const [sx, sy] of [[b * 0.55, b * 0.55], [w - b * 0.55, b * 0.55], [b * 0.55, h - b * 0.55], [w - b * 0.55, h - b * 0.55]]) {
        const sg = x.createRadialGradient(sx - 2, sy - 2, 0, sx, sy, b * 0.3); sg.addColorStop(0, '#d8c28c'); sg.addColorStop(1, '#4d3c20');
        x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, b * 0.28, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(30,20,8,0.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(sx - b * 0.2, sy); x.lineTo(sx + b * 0.2, sy); x.stroke();
      }
      for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(60,90,70,${0.05 + r() * 0.08})`; const vx = r() * w, vy = r() * h; x.beginPath(); x.ellipse(vx, vy, w * (0.03 + r() * 0.08), h * (0.03 + r() * 0.06), r(), 0, TAU); x.fill(); }
      return c;
    }
    if (P.phone) {
      x.fillStyle = '#0c0d0e'; x.fillRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.1, 'rgba(255,255,255,0)'); g.addColorStop(0.9, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      const sx = w * 0.08, sy = h * 0.1, sw = w * 0.84, shh = h * 0.8;
      x.fillStyle = '#081111'; x.fillRect(sx, sy, sw, shh);
      const glow = x.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.4, h * 0.6); glow.addColorStop(0, 'rgba(40,120,110,0.16)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = glow; x.fillRect(sx, sy, sw, shh);
      x.fillStyle = 'rgba(60,199,182,0.55)'; x.font = `${Math.round(w / 26)}px ${SANS}`; x.textBaseline = 'middle';
      x.fillText('Notes', sx + sw * 0.06, sy + shh * 0.045);
      x.fillRect(sx + sw * 0.06, sy + shh * 0.085, sw * 0.88, 1);
      x.fillStyle = '#1c1f21'; x.fillRect(w * 0.4, h * 0.045, w * 0.2, h * 0.012);
      x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 1; for (let i = 0; i < 4; i++) { x.beginPath(); const a = r() * w; x.moveTo(a, sy + r() * shh); x.lineTo(a + w * 0.3 * (r() - 0.5), sy + r() * shh); x.stroke(); }
      return c;
    }
    base(P.bg, P.sticky ? 0.6 : 1);
    if (P.rules) {
      const first = top + lh * 0.72;
      for (let y = first; y < h - lh * 0.4; y += lh) { x.fillStyle = P.rules; x.fillRect(0, Math.round(y), w, Math.max(1, L.dpr)); }
      x.fillStyle = P.margin; x.fillRect(Math.round(w * 0.13), 0, Math.max(1, L.dpr * 1.2), h);
      x.fillStyle = 'rgba(84,118,182,0.25)'; x.fillRect(0, Math.round(top - lh * 0.4), w, Math.max(1, L.dpr));
      if (P.holes) for (const f of [0.18, 0.5, 0.82]) { x.fillStyle = '#000'; x.beginPath(); x.arc(w * 0.055, h * f, w * 0.018, 0, TAU); x.fill(); }
      if (P.spiral) {
        for (let xx = w * 0.05; xx < w * 0.96; xx += w * 0.045) {
          x.fillStyle = '#000'; x.beginPath(); x.arc(xx, h * 0.022, w * 0.009, 0, TAU); x.fill();
          x.strokeStyle = '#8b8e90'; x.lineWidth = w * 0.006; x.beginPath(); x.arc(xx, h * 0.006, w * 0.014, Math.PI * 0.15, Math.PI * 0.95); x.stroke();
        }
      }
    }
    if (P.bars) {
      const band = lh * 2;
      for (let y = top - lh * 0.3; y < h; y += band * 2) { x.fillStyle = 'rgba(126,172,120,0.2)'; x.fillRect(w * 0.1, y, w * 0.8, band); }
    }
    if (P.tractor) {
      for (const sx of [w * 0.045, w * 0.955]) for (let y = h * 0.025; y < h; y += w * 0.052) { x.fillStyle = '#000'; x.beginPath(); x.arc(sx, y, w * 0.013, 0, TAU); x.fill(); }
      x.fillStyle = 'rgba(80,80,72,0.4)';
      for (const sx of [w * 0.088, w * 0.912]) for (let y = 0; y < h; y += 6) x.fillRect(sx, y, 1, 3);
      for (let xx = 0; xx < w; xx += 6) x.fillRect(xx, h * 0.985, 3, 1);
    }
    if (P.email) {
      x.font = `${Math.round(w / 64)}px ${SANS}`; x.fillStyle = 'rgba(40,40,40,0.65)'; x.textBaseline = 'alphabetic';
      x.fillText('Mail — Message', w * 0.06, h * 0.035);
      x.textAlign = 'right'; x.fillText('Page 1 of 1', w * 0.94, h * 0.972); x.textAlign = 'left';
      x.fillStyle = 'rgba(0,120,122,0.8)'; x.fillRect(w * 0.06, h * 0.05, w * 0.88, Math.max(2, h * 0.004));
    }
    if (P.laminated) {
      x.fillStyle = '#00a3a3'; x.fillRect(0, 0, w, h * 0.1);
      x.fillStyle = '#ffcc00'; x.fillRect(0, h * 0.1, w, h * 0.012);
    }
    if (P.card) {
      x.strokeStyle = 'rgba(160,70,90,0.55)'; x.lineWidth = w * 0.006; x.strokeRect(w * 0.06, h * 0.05, w * 0.88, h * 0.9);
      x.strokeStyle = 'rgba(70,110,150,0.45)'; x.lineWidth = w * 0.003; x.strokeRect(w * 0.075, h * 0.062, w * 0.85, h * 0.876);
      for (let i = 0; i < 5; i++) { const cx = w * (0.3 + i * 0.1), cy = h * 0.12; x.fillStyle = ['#c65a6e', '#e3b23c', '#5a8fc6', '#7bb06a', '#c65a6e'][i]; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(cx, cy, w * 0.03, w * 0.038, 0, 0, TAU); x.fill(); x.globalAlpha = 1; x.strokeStyle = 'rgba(80,70,60,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, cy + w * 0.038); x.lineTo(w * 0.5, h * 0.2); x.stroke(); }
    }
    if (P.sticky) {
      x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(0, 0, w, h * 0.12);
      const g = x.createLinearGradient(0, h * 0.7, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,10,0.22)');
      x.fillStyle = g; x.fillRect(0, h * 0.7, w, h * 0.3);
    }
    if (P.receipt) { x.fillStyle = 'rgba(80,86,96,0.03)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1); }
    if (!P.sticky && !P.receipt && !P.laminated) { fold(1 / 3); fold(2 / 3); }
    if (!P.laminated && r() < 0.8) stain(P.sticky ? 0.5 : 0.8);
    if (P.laminated) {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(0.58, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = Math.max(2, w * 0.006); x.strokeRect(1, 1, w - 2, h - 2);
    }
    grain(P.receipt ? 0.05 : 0.08);
    return c;
  }
  // dot-matrix look: glyphs broken into dots
  let dotPat = null;
  function dotMask(x, size) {
    const s = Math.max(2, Math.round(size / 8.5));
    if (!dotPat || dotPat.s !== s) {
      const c = canvas(s, s), cx = c.getContext('2d');
      cx.fillStyle = '#000'; cx.beginPath(); cx.arc(s / 2, s / 2, s * 0.48, 0, TAU); cx.fill();
      dotPat = { s, c };
    }
    return x.createPattern(dotPat.c, 'repeat');
  }
  function docDraw(sc) {
    const st = sc.st, L = st.L, x = st.ctx, cv = st.cv, d = st.d;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    x.save();
    x.translate(cv.width / 2, cv.height / 2); x.rotate(L.rot); x.translate(-L.w / 2, -L.h / 2);
    const clipPath = () => {
      x.beginPath();
      if (L.P.receipt) {
        const tw = L.w / 14;
        x.moveTo(0, tw * 0.3);
        for (let xx = 0, i = 0; xx < L.w; xx += tw, i++) { x.lineTo(xx + tw / 2, i % 2 ? tw * 0.3 : 0); x.lineTo(Math.min(L.w, xx + tw), tw * 0.3); }
        x.lineTo(L.w, L.h - tw * 0.3);
        for (let xx = L.w, i = 0; xx > 0; xx -= tw, i++) { x.lineTo(xx - tw / 2, i % 2 ? L.h - tw * 0.3 : L.h); x.lineTo(Math.max(0, xx - tw), L.h - tw * 0.3); }
        x.closePath();
      } else x.rect(0, 0, L.w, L.h);
    };
    x.save(); x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 40 * L.dpr; x.shadowOffsetY = 10 * L.dpr; clipPath(); x.fillStyle = '#222'; x.fill(); x.restore();
    x.save(); clipPath(); x.clip(); x.drawImage(st.paper, 0, 0);
    const lines = L.pages[st.page] || [];
    const tl = canvas(Math.ceil(L.w), Math.ceil(L.h)), tx = tl.getContext('2d');
    const marks = [];                                       // highlighter bands (opts.highlight), drawn under the ink
    const r = U.rng(U.hash('ink:' + d.id + ':' + st.page));
    let y = L.by + L.size * (L.P.hand ? 0.95 : 0.9);
    const MARKER_COLS = ['#1d3f94', '#1a1a1a', '#b0241c'];
    lines.forEach((ln, i) => {
      if (ln.gap) { y += L.lh * 0.6; return; }
      const hand = ln.hand;
      const col = L.P.photo ? MARKER_COLS[Math.min(2, (i % 5 === 4 ? 2 : i % 3 === 2 ? 1 : 0))] : hand && !L.P.hand ? '#1f2c6e' : L.P.ink;
      let wdt = 0;
      if (hand) {
        const res = Tex.handwriting(tx, ln.t, L.bx + (ln.cont ? 0 : 0), y, { size: L.size * (L.P.hand ? 1 : 1.15), color: col, font: L.handFont, wobble: L.P.photo ? 0.8 : 1.1, weight: L.P.hand === 'marker' ? 'bold' : '', seed: i + 3 });
        wdt = res ? res.w : 0;
      } else {
        tx.font = L.fontFor(false, L.size);
        tx.fillStyle = col; tx.globalAlpha = L.P.receipt ? 0.62 + r() * 0.25 : 0.92;
        tx.textBaseline = 'alphabetic';
        const kv = L.P.email ? /^(From|To|Cc|Subject|Sent|Date):\s*(.*)$/.exec(ln.t) : null;
        if (L.P.plaque) {
          tx.textAlign = 'center';
          tx.fillStyle = 'rgba(255,236,190,0.35)'; tx.fillText(ln.t, L.bx + L.bw / 2 + 1.2 * L.dpr, y + 1.2 * L.dpr);
          tx.fillStyle = col; tx.fillText(ln.t, L.bx + L.bw / 2, y);
          wdt = tx.measureText(ln.t).width; tx.textAlign = 'left';
        } else if (kv) {
          tx.font = `bold ${L.size}px ${L.P.font}`; tx.fillText(kv[1] + ':', L.bx, y);
          const kw = tx.measureText(kv[1] + ': ').width;
          tx.font = L.fontFor(false, L.size); tx.fillText(kv[2], L.bx + kw, y);
          wdt = kw + tx.measureText(kv[2]).width;
        } else { tx.fillText(ln.t, L.bx, y); wdt = tx.measureText(ln.t).width; }
        tx.globalAlpha = 1;
      }
      if (wdt > 0 && docHighlighted(st, ln.t)) marks.push({ x: L.P.plaque ? L.bx + (L.bw - wdt) / 2 : L.bx, y, w: wdt });
      if (ln.strike && wdt > 0) {
        const sx = L.P.plaque ? L.bx + (L.bw - wdt) / 2 : L.bx;
        tx.strokeStyle = col; tx.lineWidth = Math.max(1.5, L.size * 0.09); tx.lineCap = 'round';
        tx.beginPath(); tx.moveTo(sx - L.size * 0.2, y - L.size * 0.3 + (r() - 0.5) * 3);
        tx.quadraticCurveTo(sx + wdt / 2, y - L.size * 0.36 + (r() - 0.5) * 5, sx + wdt + L.size * 0.25, y - L.size * 0.28 + (r() - 0.5) * 3);
        tx.stroke();
      }
      y += L.lh;
    });
    if (L.P.dots) { tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = dotMask(tx, L.size); tx.fillRect(0, 0, tl.width, tl.height); tx.globalCompositeOperation = 'source-over'; }
    if (L.P.receipt) {  // thermal print fades in patches
      tx.globalCompositeOperation = 'destination-out'; tx.globalAlpha = 0.45;
      tx.drawImage(noiseField(tl.width, tl.height, r, 3, 18), 0, 0, tl.width, tl.height);
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
    }
    if (marks.length) {                                     // a yellow highlighter pass, a little uneven
      x.save(); x.globalCompositeOperation = L.P.phone ? 'source-over' : 'multiply';
      const hr = U.rng(U.hash('hl:' + d.id + ':' + st.page));
      for (const m of marks) {
        x.fillStyle = L.P.phone ? 'rgba(60,199,182,0.22)' : `rgba(255,${226 + Math.floor(hr() * 14)},${70 + Math.floor(hr() * 30)},0.62)`;
        const pad = L.size * 0.25, top = m.y - L.size * 0.92 + (hr() - 0.5) * L.size * 0.08;
        x.fillRect(m.x - pad, top, m.w + pad * 2 + (hr() - 0.5) * L.size * 0.3, L.size * 1.22);
      }
      x.restore();
    }
    x.globalCompositeOperation = L.P.phone ? 'source-over' : 'multiply';
    x.drawImage(tl, 0, 0);
    x.globalCompositeOperation = 'source-over';
    if (L.P.phone) { const g = x.createLinearGradient(0, 0, L.w, L.h); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, L.w, L.h); }
    x.restore();
    x.restore();
  }
  // opts.highlight: strings (a line containing one is highlighted), RegExps, or line numbers (0-based, whole document)
  function docHighlighted(st, text) {
    const hl = st.hl;
    if (!hl || !hl.length || !text) return false;
    for (const h of hl) {
      if (typeof h === 'string' && h && String(text).includes(h)) return true;
      if (h instanceof RegExp && h.test(text)) return true;
    }
    return false;
  }
  function docSetup(sc) {
    const st = sc.st, dpr = DPR();
    st.cv.width = Math.round(window.innerWidth * dpr); st.cv.height = Math.round(window.innerHeight * dpr);
    st.L = docLayout(st.d, st.cv.width, st.cv.height, dpr);
    st.paper = docPaper(st.L, st.d);
    st.page = clamp(st.page || 0, 0, st.L.pages.length - 1);
    st.pageEl.textContent = st.L.pages.length > 1 ? `${st.page + 1} / ${st.L.pages.length}` : '';
    docDraw(sc);
  }
  SCREENS.doc = {
    backdrop: 'black', inGame: true,
    build(sc) {
      const st = sc.st;
      st.d = docDef(sc.opts.id) || { id: sc.opts.id || 'unknown', title: String(sc.opts.id || ''), text: '' };
      if (!st.d.id) st.d = { ...st.d, id: sc.opts.id };
      st.cv = mk('canvas', 'mn-cv', sc.el); st.ctx = st.cv.getContext('2d'); st.cvF = fader(st.cv, 1);
      st.pageEl = mk('div', 'dc-page', sc.el);
      // CONTRACT+ opts.page (0-based) and opts.highlight ([strings | RegExps]): G.doc(id, {page, highlight}) opens the
      // document at that page with those lines marked; with a highlight and no page it opens on the first highlighted page
      st.page = 0;
      st.hl = Array.isArray(sc.opts.highlight) ? sc.opts.highlight : sc.opts.highlight ? [sc.opts.highlight] : null;
      legend(sc, () => [st.L && st.L.pages.length > 1 ? ['A D', 'D-PAD', 'TURN'] : null, ['E', 'A', st.L && st.page < st.L.pages.length - 1 ? 'NEXT' : 'CLOSE'], ['ESC', 'B', 'BACK']]);
      st.legendEl.style.bottom = '0.9vh';
      docSetup(sc);
      if (typeof sc.opts.page === 'number') st.page = clamp(sc.opts.page | 0, 0, st.L.pages.length - 1);
      else if (st.hl) { const i = st.L.pages.findIndex((pg) => pg.some((ln) => docHighlighted(st, ln.t))); if (i > 0) st.page = i; }
      if (st.page) { st.pageEl.textContent = `${st.page + 1} / ${st.L.pages.length}`; docDraw(sc); }
      if (sc.opts.mark !== false && sc.opts.id && hasScript() && Script.readDoc) { try { Script.readDoc(sc.opts.id); } catch (e) { console.error(e); } }
      else if (sc.opts.mark !== false && sc.opts.id) { S.docs = S.docs || {}; S.docs[sc.opts.id] = { ...(S.docs[sc.opts.id] || {}), read: true }; }
    },
    show() { sfx('paper', { vol: 0.9 }); },
    resize(sc) { docSetup(sc); },
    update(sc) {
      const st = sc.st;
      if (!sc.ready || st.busy) return;
      const n = st.L.pages.length;
      if (K.cancel()) { sfx('ui_cancel'); sc.close(null); return; }
      let d = 0;
      if (K.right()) d = 1; else if (K.left()) d = -1;
      if (K.confirm()) { if (st.page < n - 1) d = 1; else { sfx('paper', { vol: 0.5, dur: 0.3 }); sc.close(null); return; } }
      if (d && st.page + d >= 0 && st.page + d < n) docTurn(sc, st.page + d);
    },
  };
  async function docTurn(sc, p) {
    const st = sc.st;
    st.busy = true;
    sfx('paper', { vol: 0.85 });
    await st.cvF.to(0, 0.15);
    st.page = p;
    st.pageEl.textContent = `${st.page + 1} / ${st.L.pages.length}`;
    docDraw(sc);
    await st.cvF.to(1, 0.22);
    st.busy = false;
  }

  // =================================================================================================================
  // PHONE (§2A): raised into frame over the blurred, dimmed game; teal on black, a little dated; signal bars, battery,
  // a clock that reads "--:--" the whole game; tabs CALLS, VOICEMAIL, NOTES, MAP (a shortcut to the map screen).
  // =================================================================================================================
  const LCD = { on: '#38d2c6', mid: '#1f9d94', dim: '#11605a', off: '#062422', bg: '#010605', W: 160, H: 200 };
  const FONT5 = {
    ' ': [0, 0, 0, 0, 0, 0, 0], '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
    '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14],
    '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
    A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '-': [0, 0, 0, 31, 0, 0, 0], ':': [0, 12, 12, 0, 12, 12, 0],
    '/': [0, 1, 2, 4, 8, 16, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
    '?': [14, 17, 1, 2, 4, 0, 4], "'": [12, 4, 8, 0, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0], '#': [10, 10, 31, 10, 31, 10, 10],
    '+': [0, 4, 4, 31, 4, 4, 0], '&': [12, 18, 20, 8, 21, 18, 13], '%': [24, 25, 2, 4, 8, 19, 3], '=': [0, 0, 31, 0, 31, 0, 0],
    '*': [0, 4, 21, 14, 21, 4, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8], '_': [0, 0, 0, 0, 0, 0, 31], '·': [0, 0, 0, 12, 12, 0, 0],
  };
  const lcdNorm = (s) => String(s ?? '').toUpperCase().replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/⇄/g, '<>');
  const lcdW = (s) => Math.max(0, lcdNorm(s).length * 6 - 1);
  function lcdText(x, str, gx, gy, color) {
    x.fillStyle = color;
    let cx = gx;
    for (const ch of lcdNorm(str)) {
      const g = FONT5[ch] || FONT5[' '];
      for (let r = 0; r < 7; r++) { const row = g[r]; if (!row) continue; for (let c = 0; c < 5; c++) if (row & (16 >> c)) x.fillRect(cx + c, gy + r, 1, 1); }
      cx += 6;
    }
    return cx - gx;
  }
  function lcdWrap(str, cols) {
    const words = lcdNorm(str).split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (const w0 of words) { const t = line ? line + ' ' + w0 : w0; if (t.length > cols && line) { out.push(line); line = w0; } else line = t; }
    if (line) out.push(line);
    return out.length ? out : [''];
  }
  const PH_TABS = ['CALLS', 'VOICEMAIL', 'NOTES', 'MAP'];
  function phoneRows(tab) {
    if (!hasPhone()) return [];
    if (tab === 0) return Phone.callLog().map((c) => ({ l: c.caller || 'UNKNOWN', r: c.how === 'answered' ? 'ANSWERED' : 'MISSED' }));
    if (tab === 1) return Phone.voicemails().map((v, i) => ({ l: `${i + 1} ${v.caller || 'UNKNOWN'}`, r: v.played ? 'PLAYED' : 'NEW', blink: !v.played, i: v.i }));
    if (tab === 2) {
      const notes = (Phone.notes || []).slice().reverse();
      return notes.map((n) => ({ lines: lcdWrap(n.text, 24), done: !!n.done }));
    }
    return [{ l: 'OPEN MAP', center: true }];
  }
  function drawPhoneBody(st) {
    const cw = st.body.width, ch = st.body.height, x = st.bctx, w = cw, r = U.rng(31);
    x.clearRect(0, 0, cw, ch);
    const rad = w * 0.09;
    const shape = () => { x.beginPath(); x.moveTo(rad, 0); x.lineTo(w - rad, 0); x.quadraticCurveTo(w, 0, w, rad); x.lineTo(w, ch); x.lineTo(0, ch); x.lineTo(0, rad); x.quadraticCurveTo(0, 0, rad, 0); x.closePath(); };
    x.save(); x.shadowColor = 'rgba(0,0,0,0.85)'; x.shadowBlur = w * 0.12; shape(); x.fillStyle = '#131516'; x.fill(); x.restore();
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#0c0d0e'); g.addColorStop(0.12, '#25292a'); g.addColorStop(0.5, '#1b1e1f'); g.addColorStop(0.88, '#222627'); g.addColorStop(1, '#0a0b0b');
    shape(); x.fillStyle = g; x.fill();
    x.save(); shape(); x.clip();
    x.globalAlpha = 0.06; x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, w, ch);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(200,210,210,${0.03 + r() * 0.05})`; x.lineWidth = 1; const sx = r() * w, sy = r() * ch * 0.8, a = r() * TAU, l = 6 + r() * w * 0.2; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
    x.restore();
    // earpiece
    x.fillStyle = '#050606'; x.fillRect(w * 0.36, ch * 0.035, w * 0.28, w * 0.022);
    for (let i = 0; i < 7; i++) { x.fillStyle = '#2a2f30'; x.fillRect(w * 0.37 + i * w * 0.038, ch * 0.037, w * 0.02, w * 0.012); }
    // bezel around the glass
    const s = st.scr;
    x.fillStyle = '#070808'; x.fillRect(s.x - w * 0.03, s.y - w * 0.03, s.w + w * 0.06, s.h + w * 0.06);
    x.strokeStyle = '#2d3334'; x.lineWidth = 1; x.strokeRect(s.x - w * 0.03 + 0.5, s.y - w * 0.03 + 0.5, s.w + w * 0.06 - 1, s.h + w * 0.06 - 1);
    // soft keys, nav disc, call / end
    const ky = s.y + s.h + w * 0.09, kw = w * 0.2, kh = w * 0.075;
    const key = (kx, kyy, kww, khh, edge) => {
      const kg = x.createLinearGradient(0, kyy, 0, kyy + khh); kg.addColorStop(0, '#2c3132'); kg.addColorStop(1, '#141718');
      x.fillStyle = kg; x.fillRect(kx, kyy, kww, khh);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(kx, kyy, kww, 1);
      if (edge) { x.fillStyle = edge; x.fillRect(kx, kyy + khh - 2, kww, 2); }
    };
    key(w * 0.08, ky, kw, kh); key(w * 0.72, ky, kw, kh);
    key(w * 0.08, ky + kh * 1.35, kw, kh, '#2f8a4a'); key(w * 0.72, ky + kh * 1.35, kw, kh, '#8a302a');
    const cx = w / 2, cy = ky + kh * 1.2, cr = w * 0.13;
    const dg = x.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr); dg.addColorStop(0, '#343a3b'); dg.addColorStop(1, '#121415');
    x.fillStyle = dg; x.beginPath(); x.arc(cx, cy, cr, 0, TAU); x.fill();
    x.fillStyle = '#0d0f10'; x.beginPath(); x.arc(cx, cy, cr * 0.42, 0, TAU); x.fill();
    // keypad (runs off the bottom of the screen)
    const labels = ['1', '2 ABC', '3 DEF', '4 GHI', '5 JKL', '6 MNO', '7 PQRS', '8 TUV', '9 WXYZ', '*', '0 +', '#'];
    const ky0 = ky + kh * 3.1, kxw = w * 0.25, kyh = w * 0.105;
    labels.forEach((lab, i) => {
      const col = i % 3, row = Math.floor(i / 3), kx = w * 0.095 + col * (kxw + w * 0.03), kyy = ky0 + row * (kyh + w * 0.03);
      key(kx, kyy, kxw, kyh);
      const [dgt, let_] = lab.split(' ');
      x.fillStyle = '#7d8584'; x.font = `${Math.round(kyh * 0.5)}px ${SANS}`; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(dgt, kx + kxw * 0.18, kyy + kyh / 2);
      if (let_) { x.font = `${Math.round(kyh * 0.26)}px ${SANS}`; x.fillStyle = '#5b6262'; x.fillText(let_, kx + kxw * 0.45, kyy + kyh / 2 + 1); }
    });
  }
  function drawPhoneLcd(st) {
    const x = st.lctx, W_ = LCD.W, H_ = LCD.H;
    x.fillStyle = LCD.bg; x.fillRect(0, 0, W_, H_);
    const g = x.createRadialGradient(80, 60, 4, 80, 100, 150); g.addColorStop(0, 'rgba(24,82,76,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W_, H_);
    const blink = Math.floor(st.clock * 2.5) % 2 === 0;
    const rd = hasPhone() ? Phone.reading : { bars: 0, mode: 'normal', battery: 1 };
    // status row: bars · --:-- · battery
    if (rd.mode === 'noservice') lcdText(x, 'NO SVC', 4, 4, LCD.mid);
    else for (let i = 0; i < 5; i++) { const h = 2 + i * 2; x.fillStyle = rd.mode !== 'none' && i < rd.bars ? LCD.on : LCD.off; x.fillRect(4 + i * 3, 12 - h, 2, h); }
    lcdText(x, '--:--', 80 - Math.floor(lcdW('--:--') / 2), 4, LCD.on);
    const segs = Math.max(0, Math.min(4, Math.ceil((rd.battery ?? 1) * 4 - 0.01)));
    x.fillStyle = LCD.mid; x.fillRect(138, 4, 16, 1); x.fillRect(138, 11, 16, 1); x.fillRect(138, 4, 1, 8); x.fillRect(153, 4, 1, 8); x.fillRect(154, 6, 2, 4);
    for (let j = 0; j < 4; j++) { x.fillStyle = j < segs ? LCD.on : LCD.off; x.fillRect(140 + j * 3.5, 6, 2.5, 4); }
    x.fillStyle = LCD.dim; x.fillRect(3, 16, 154, 1);
    // tabs
    let tx = Math.round((W_ - (PH_TABS.reduce((a, t) => a + lcdW(t), 0) + 5 * (PH_TABS.length - 1))) / 2);
    st.tabX = [];
    PH_TABS.forEach((t, i) => {
      const w = lcdW(t);
      st.tabX.push([tx - 2, tx + w + 2]);
      if (i === st.tab) { x.fillStyle = LCD.on; x.fillRect(tx - 2, 19, w + 4, 11); lcdText(x, t, tx, 21, LCD.bg); }
      else lcdText(x, t, tx, 21, LCD.mid);
      tx += w + 5;
    });
    x.fillStyle = LCD.dim; x.fillRect(3, 32, 154, 1);
    // content
    const rows = st.rows, top = 37, bottom = 184;
    if (!rows.length) {
      const msg = ['NO CALLS', 'NO MESSAGES', 'NO NOTES', ''][st.tab];
      lcdText(x, msg, 80 - Math.floor(lcdW(msg) / 2), 96, LCD.dim);
    } else if (st.tab === 2) {
      // notes: several lines each; scroll to keep the selected one in view
      const heights = rows.map((n) => n.lines.length * 9 + 4);
      let y0 = 0; for (let i = 0; i < st.sel; i++) y0 += heights[i];
      const need = y0 + heights[st.sel] - (bottom - top);
      st.scrollN = Math.max(0, Math.min(y0, Math.max(st.scrollN || 0, need)));
      let y = top - st.scrollN;
      rows.forEach((n, i) => {
        const col = n.done ? LCD.dim : i === st.sel ? LCD.on : LCD.mid;
        n.lines.forEach((l, j) => {
          const yy = y + j * 9;
          if (yy < top - 2 || yy > bottom - 7) return;
          if (j === 0) lcdText(x, i === st.sel ? '>' : '-', 4, yy, col);
          lcdText(x, l, 12, yy, col);
          if (n.done) { x.fillStyle = LCD.dim; x.fillRect(12, yy + 3, lcdW(l), 1); }
        });
        y += heights[i];
      });
    } else if (st.tab === 3) {
      const t = 'OPEN MAP', w = lcdW(t), yy = 90;
      x.fillStyle = LCD.on; x.fillRect(80 - w / 2 - 4, yy - 3, w + 8, 13); lcdText(x, t, Math.round(80 - w / 2), yy, LCD.bg);
    } else {
      const per = 14, first = Math.max(0, Math.min(st.sel - per + 2, rows.length - per));
      rows.slice(first, first + per).forEach((rw, k) => {
        const i = first + k, y = top + k * 10;
        const sel = i === st.sel && st.tab === 1;
        if (sel) { x.fillStyle = LCD.dim; x.fillRect(3, y - 2, 154, 11); }
        lcdText(x, rw.l, 6, y, sel ? LCD.on : LCD.mid);
        if (rw.r && (!rw.blink || blink)) lcdText(x, rw.r, 154 - lcdW(rw.r), y, rw.blink ? LCD.on : LCD.dim);
      });
    }
    // soft keys
    x.fillStyle = LCD.dim; x.fillRect(3, 186, 154, 1);
    const left = st.tab === 1 && rows.length ? 'PLAY' : st.tab === 3 ? 'OPEN' : '';
    if (left) lcdText(x, left, 5, 190, LCD.mid);
    lcdText(x, 'BACK', 155 - lcdW('BACK'), 190, LCD.mid);
    // LCD texture: dark row gaps, a faint sheen
    x.fillStyle = 'rgba(0,0,0,0.22)'; for (let yy = 1; yy < H_; yy += 2) x.fillRect(0, yy, W_, 0.5);
  }
  function phoneLayout(sc) {
    const st = sc.st, W_ = window.innerWidth, H_ = window.innerHeight, dpr = DPR();
    const bh = H_ * 1.02, bw = Math.min(W_ * 0.44, bh * 0.43);
    const left = Math.round(W_ * 0.5 - bw / 2), topY = Math.round(H_ * 0.07);
    st.body.style.left = left + 'px'; st.body.style.top = topY + 'px';
    st.body.style.width = bw + 'px'; st.body.style.height = bh + 'px';
    st.body.width = Math.round(bw * dpr); st.body.height = Math.round(bh * dpr);
    const sw = bw * 0.8, sh = sw * (LCD.H / LCD.W);
    st.scr = { x: bw * 0.1 * dpr, y: bh * 0.085 * dpr, w: sw * dpr, h: sh * dpr };
    st.lcd.style.left = left + bw * 0.1 + 'px'; st.lcd.style.top = topY + bh * 0.085 + 'px';
    st.lcd.style.width = sw + 'px'; st.lcd.style.height = sh + 'px';
    drawPhoneBody(st);
    drawPhoneLcd(st);
  }
  SCREENS.phone = {
    backdrop: 'blur', inGame: true,
    build(sc) {
      const st = sc.st;
      st.tab = clamp(sc.opts.tab ?? 0, 0, 3); st.sel = 0; st.clock = 0; st.scrollN = 0;
      const wrap = mk('div', 'ph-wrap', sc.el);
      st.body = mk('canvas', '', wrap); st.bctx = st.body.getContext('2d');
      st.lcd = mk('canvas', 'ph-lcd', wrap); st.lcd.width = LCD.W; st.lcd.height = LCD.H; st.lctx = st.lcd.getContext('2d');
      st.lcd.style.pointerEvents = 'auto';
      st.lcd.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !sc.ready) return;
        const r = st.lcd.getBoundingClientRect(), lx = ((e.clientX - r.left) / r.width) * LCD.W, ly = ((e.clientY - r.top) / r.height) * LCD.H;
        if (ly >= 17 && ly <= 32 && st.tabX) { const i = st.tabX.findIndex(([a, b]) => lx >= a && lx <= b); if (i >= 0 && i !== st.tab) { phoneTab(sc, i); return; } }
        if (ly > 186) { if (lx > 110) st.clickBack = true; else st.clickOk = true; return; }
        if (st.tab === 1 && ly > 35) { const i = Math.floor((ly - 35) / 10); if (i < st.rows.length) { st.sel = i; st.clickOk = true; } }
        if (st.tab === 3) st.clickOk = true;
      });
      st.rows = phoneRows(st.tab);
      legend(sc, () => [['A D', 'D-PAD', 'TAB'], ['W S', 'D-PAD', 'SCROLL'], ['E', 'A', 'SELECT'], ['C / ESC', 'B', 'BACK']]);
      Object.assign(st.legendEl.style, { left: '4vw', right: 'auto', textAlign: 'left', whiteSpace: 'pre-line', lineHeight: '2.2', bottom: '5vh' });
      st.legendSep = '\n';
      phoneLayout(sc);
    },
    show(sc) { const st = sc.st; st.rows = phoneRows(st.tab); st.sel = clamp(st.sel, 0, Math.max(0, st.rows.length - 1)); drawPhoneLcd(st); },
    resize(sc) { phoneLayout(sc); },
    update(sc, dt) {
      const st = sc.st;
      st.clock += dt;
      st.redraw = (st.redraw || 0) - dt;
      if (st.redraw <= 0) { st.redraw = 0.2; st.rows = phoneRows(st.tab); st.sel = clamp(st.sel, 0, Math.max(0, st.rows.length - 1)); drawPhoneLcd(st); }
      if (!sc.ready) { st.clickOk = st.clickBack = false; return; }
      if (K.cancel() || K.key('KeyC') || st.clickBack) { st.clickBack = false; sfx('ui_cancel'); sc.close(null); return; }
      if (K.left() || padEdge(4)) phoneTab(sc, (st.tab + 3) % 4);
      else if (K.right() || padEdge(5)) phoneTab(sc, (st.tab + 1) % 4);
      const n = st.rows.length;
      if (st.tab !== 3 && n) {
        let d = 0;
        if (K.up()) d = -1; else if (K.down()) d = 1;
        const wh = inp('wheel') || 0; if (wh) d = Math.sign(wh);
        if (d) { const j = clamp(st.sel + d, 0, n - 1); if (j !== st.sel) { st.sel = j; sfx('keypress', { vol: 0.5 }); drawPhoneLcd(st); } }
      }
      const ok = K.confirm() || st.clickOk;
      st.clickOk = false;
      if (!ok) return;
      if (st.tab === 1 && n) {
        const vm = st.rows[st.sel];
        sfx('ui_confirm');
        sc.exit(null, () => { try { Phone.playVoicemail(vm.i); } catch (e) { console.error('[Menus] voicemail', e); } });
      } else if (st.tab === 3) { sfx('ui_confirm'); sc.push('map', {}); }
      else sfx('keypress', { vol: 0.35 });
    },
  };
  function phoneTab(sc, t) {
    const st = sc.st;
    st.tab = t; st.sel = 0; st.scrollN = 0;
    st.rows = phoneRows(t);
    sfx('keypress', { vol: 0.6 });
    drawPhoneLcd(st);
  }

  // =================================================================================================================
  // OPTIONS (§2A): a black serif list with values on the right; changes write META.options and apply live
  // =================================================================================================================
  const OPTS = [
    { k: 'brightness', label: 'BRIGHTNESS', type: 'calib' },
    { k: 'noise', label: 'NOISE EFFECT', type: 'bool' },
    { k: 'grain', label: 'GRAIN STRENGTH', type: 'range', min: 0, max: 1.5, step: 0.15 },
    { k: 'subs', label: 'SUBTITLE SIZE', type: 'enum', values: ['small', 'medium', 'large'], names: ['SMALL', 'MEDIUM', 'LARGE'] },
    { k: 'control', label: 'CONTROL TYPE', type: 'enum', values: ['camera', 'tank'], names: ['CAMERA-RELATIVE', 'CLASSIC TANK'] },
    { k: 'shake', label: 'CAMERA SHAKE', type: 'bool' },
    { k: 'master', label: 'MASTER VOLUME', type: 'range', min: 0, max: 1, step: 0.1, vol: true },
    { k: 'effects', label: 'EFFECTS VOLUME', type: 'range', min: 0, max: 1, step: 0.1, vol: true },
    { k: 'music', label: 'MUSIC VOLUME', type: 'range', min: 0, max: 1, step: 0.1, vol: true },
    { k: 'invertExamine', label: 'INVERT EXAMINE ROTATION', type: 'bool' },
    { k: 'vibration', label: 'VIBRATION', type: 'bool' },
  ];
  function optValue(o) {
    const v = META.options[o.k];
    if (o.type === 'bool') return v ? 'ON' : 'OFF';
    if (o.type === 'enum') return o.names[Math.max(0, o.values.indexOf(v))];
    if (o.type === 'range') return ticks(clamp(((v ?? o.max) - o.min) / (o.max - o.min)), 10);
    if (o.type === 'calib') return ticks(clamp(((v ?? 1) - 0.5) / 1.5), 10);
    return '';
  }
  function optChange(o, d) {
    const opt = META.options;
    if (o.type === 'bool') opt[o.k] = !opt[o.k];
    else if (o.type === 'enum') { const i = Math.max(0, o.values.indexOf(opt[o.k])); opt[o.k] = o.values[(i + d + o.values.length) % o.values.length]; }
    else if (o.type === 'range') { const nv = +clamp((opt[o.k] ?? o.max) + d * o.step, o.min, o.max).toFixed(3); if (nv === opt[o.k]) return false; opt[o.k] = nv; }
    else return false;
    persistMeta();
    if (o.vol) { try { Snd.setVolumes(opt); } catch (e) { /* audio */ } }
    if (o.k === 'vibration' && opt.vibration) inp('rumble', 0.35, 0.35, 180);
    return true;
  }
  SCREENS.options = {
    backdrop: 'black', inGame: true,
    build(sc) {
      const st = sc.st;
      mk('div', 'mn-h op-head', sc.el, 'Options');
      st.box = mk('div', 'op-rows', sc.el);
      st.i = 0;
      st.rows = OPTS.map((o, i) => {
        const e = mk('div', 'mn-it op-row', st.box, `<span>${esc(o.label)}</span><em class="op-v" style="font-style:normal"></em>`);
        e.addEventListener('mouseenter', () => { if (st.i !== i) { st.i = i; sfx('ui_move'); optPaint(sc); } });
        e.addEventListener('mousedown', (ev) => { if (ev.button === 0 && sc.ready) { st.i = i; st.click = true; optPaint(sc); } });
        return { o, e, v: e.querySelector('.op-v') };
      });
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['A D', 'D-PAD', 'CHANGE'], ['ESC', 'B', 'BACK']]);
      optPaint(sc);
    },
    show(sc) { optPaint(sc); },
    update(sc) {
      const st = sc.st;
      if (!sc.ready) { st.click = false; return; }
      const n = st.rows.length;
      if (K.up()) { st.i = (st.i + n - 1) % n; sfx('ui_move'); optPaint(sc); }
      else if (K.down()) { st.i = (st.i + 1) % n; sfx('ui_move'); optPaint(sc); }
      const o = st.rows[st.i].o;
      let d = 0;
      if (K.left()) d = -1; else if (K.right()) d = 1;
      const conf = K.confirm() || st.click;
      st.click = false;
      if (o.type === 'calib' && (conf || d)) { sfx('ui_confirm'); sc.push('calibrate', {}); return; }
      if (conf && o.type !== 'range') d = 1;
      if (d) {
        if (optChange(o, d)) { sfx(o.vol ? 'ui_confirm' : 'ui_move'); optPaint(sc); } else sfx('ui_cancel', { vol: 0.4 });
      }
      if (K.cancel()) { sfx('ui_cancel'); sc.close(null); }
    },
  };
  function optPaint(sc) {
    const st = sc.st;
    st.rows.forEach((r, i) => { r.e.classList.toggle('sel', i === st.i); r.v.innerHTML = optValue(r.o); });
  }

  // =================================================================================================================
  // SAVE / LOAD: three slots, each with chapter name, area, play time and number of saves; overwriting asks first
  // =================================================================================================================
  function slotRows(sc, withAuto) {
    const st = sc.st;
    const list = hasSave() ? Save.list() : [null, null, null];
    const rows = [0, 1, 2].map((i) => ({ slot: i, e: list[i] }));
    if (withAuto) rows.push({ slot: 'auto', e: list.auto || null });
    st.box.innerHTML = '';
    st.rows = rows.map((rw, i) => {
      const label = rw.slot === 'auto' ? 'AUTOSAVE' : `SLOT ${rw.slot + 1}`;
      const e = rw.e;
      const html = e
        ? `<span class="sv-slot">${label}</span><span>${esc(e.chapterName)}<span class="sv-a">${esc(e.area)}</span></span><span class="sv-t">${esc(e.playTimeText)}</span><span class="sv-n">${e.slot === 'auto' ? '' : `${e.saves} SAVE${e.saves === 1 ? '' : 'S'}`}</span>`
        : `<span class="sv-slot">${label}</span><span class="sv-empty">No data</span><span></span><span></span>`;
      const el = mk('div', 'sv-row', st.box, html);
      el.addEventListener('mouseenter', () => { if (st.i !== i && !st.st2) { st.i = i; sfx('ui_move'); slotPaint(sc); } });
      el.addEventListener('mousedown', (ev) => { if (ev.button === 0 && sc.ready && !st.st2) { st.i = i; st.click = true; slotPaint(sc); } });
      return { ...rw, el };
    });
    st.i = clamp(st.i ?? 0, 0, st.rows.length - 1);
    slotPaint(sc);
  }
  function slotPaint(sc) { sc.st.rows.forEach((r, i) => r.el.classList.toggle('sel', i === sc.st.i)); }
  function slotNav(sc) {
    const st = sc.st, n = st.rows.length;
    if (K.up()) { st.i = (st.i + n - 1) % n; sfx('ui_move'); slotPaint(sc); }
    else if (K.down()) { st.i = (st.i + 1) % n; sfx('ui_move'); slotPaint(sc); }
    const c = K.confirm() || st.click;
    st.click = false;
    return c;
  }
  SCREENS.save = {
    backdrop: 'black', inGame: true,
    build(sc) {
      const st = sc.st;
      mk('div', 'mn-h sv-head', sc.el, 'Save');
      st.box = mk('div', 'sv-rows', sc.el);
      st.msg = mk('div', 'mn-msg', sc.el); st.msg.style.top = '70%'; st.msgF = fader(st.msg, 0);
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['E', 'A', 'SAVE'], ['ESC', 'B', 'CANCEL']]);
      slotRows(sc, false);
      const latest = hasSave() && Save.latest();
      if (latest && typeof latest.slot === 'number') { st.i = latest.slot; slotPaint(sc); }
    },
    update(sc) {
      const st = sc.st;
      if (st.closeAt != null && sc.t >= st.closeAt) { st.closeAt = null; sc.close({ slot: st.saved, saved: true }); return; }
      if (!sc.ready || st.st2) { st.click = false; return; }
      if (slotNav(sc)) {
        const row = st.rows[st.i];
        sfx('ui_confirm');
        const go = () => {
          if (!hasSave()) { sc.close(null); return; }
          const res = Save.save(row.slot);
          if (!res) { st.msg.textContent = 'The save could not be written.'; st.msgF.to(1, 0.3); st.st2 = false; return; }
          slotRows(sc, false);
          st.i = row.slot; slotPaint(sc);
          if (sc.opts.message) { st.msg.textContent = 'Progress saved.'; st.msgF.to(1, 0.3); }
          st.st2 = true;
          st.closeAt = sc.t + (sc.opts.message ? 1.5 : 0.8); st.saved = row.slot;
        };
        if (row.e) { st.st2 = true; ask(sc, 'Overwrite this save?').then((yes) => { st.st2 = false; if (yes && !sc.closing) go(); }); }
        else go();
        return;
      }
      if (K.cancel()) { sfx('ui_cancel'); sc.close(null); }
    },
  };
  SCREENS.load = {
    backdrop: 'black',
    keepBlack: (v) => v != null,
    build(sc) {
      const st = sc.st;
      mk('div', 'mn-h sv-head', sc.el, 'Load');
      st.box = mk('div', 'sv-rows', sc.el);
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['E', 'A', 'LOAD'], ['ESC', 'B', 'BACK']]);
      slotRows(sc, true);
      const latest = hasSave() && Save.latest();
      if (latest) { st.i = latest.slot === 'auto' ? 3 : latest.slot; slotPaint(sc); }
    },
    update(sc) {
      const st = sc.st;
      if (!sc.ready) { st.click = false; return; }
      if (slotNav(sc)) {
        const row = st.rows[st.i];
        if (!row.e) { sfx('ui_cancel', { vol: 0.6 }); return; }
        sfx('ui_confirm');
        if (sc.opts.exit) sc.exit(row.slot); else sc.close(row.slot);
        return;
      }
      if (K.cancel()) { sfx('ui_cancel'); sc.close(null); }
    },
  };

  // =================================================================================================================
  // DEATH (§2A): after "NO SIGNAL" — CONTINUE (from the last save), LOAD GAME, TITLE
  // =================================================================================================================
  SCREENS.death = {
    // over UI.noSignal's black: our own black and "NO SIGNAL" fade in exactly on top of it, so nothing flickers
    backdrop: 'none',
    keepBlack: () => true,
    build(sc) {
      const st = sc.st;
      mk('div', 'tt-cover', sc.el);
      if (sc.opts.noSignal !== false) mk('div', 'dt-ns', sc.el, 'NO SIGNAL');
      const any = hasSave() && Save.hasAny();
      st.list = makeList(sc.el, [{ label: 'CONTINUE', value: 'continue', off: !any }, { label: 'LOAD GAME', value: 'load', off: !any }, { label: 'TITLE', value: 'title' }], { cls: 'dt-list', start: any ? 0 : 2 });
      st.listF = fader(st.list.el, 0);
      st.listF.to(1, 0.6, sc.opts.delay ?? 0.5);
      st.cleared = false;
    },
    update(sc) {
      const st = sc.st;
      if (!st.cleared && sc.t > 0.4) { st.cleared = true; ui('clear', { letterbox: true }); }   // the UI's own NO SIGNAL, now under ours
      if (st.listF.v < 0.5) return;
      const r = st.list.step(sc, { cancel: false });
      if (r && r.pick) { sfx('ui_confirm'); sc.close(r.pick.value); }
    },
  };

  // =================================================================================================================
  // RESULTS (§2A): the ending's name, the counts, and a 1–10 star ranking
  // =================================================================================================================
  const ENDING_NAMES = { connected: 'CONNECTED', coverage: 'OUT OF COVERAGE', tomorrow: 'FOLLOW UP TOMORROW', yes: 'YES' };
  const FATE_KEYS = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukaSaved', 'lukeSaved'];
  // memos found (x of y): each riddle-level variant group (id, id_easy, id_hard) counts once, as the level's version
  function memoCount() {
    const docs = typeof DOCUMENTS !== 'undefined' ? DOCUMENTS : {};
    const lvl = (S.difficulty && S.difficulty.riddle) || 'normal';
    const groups = new Map();
    for (const id of Object.keys(docs)) {
      const d = docs[id];
      if (!d || d.count === false || d.hidden) continue;
      if (d.riddle && d.riddle !== lvl) continue;
      const m = /^(.*)_(easy|hard)$/.exec(id);
      if (m && docs[m[1]]) { const g = groups.get(m[1]) || []; g.push(id); groups.set(m[1], g); continue; }
      if (m && m[2] !== lvl) continue;
      const g = groups.get(id) || []; g.push(id); groups.set(id, g);
    }
    let found = 0;
    for (const [base, ids] of groups) {
      const mine = docs[`${base}_${lvl}`] ? `${base}_${lvl}` : base;
      if ((S.docs && (S.docs[mine] || ids.some((i) => S.docs[i])))) found++;
    }
    return { found, total: groups.size };
  }
  function rank(st) {
    let s = 10;
    if ((st.time || 0) > 120 * 60) s--;
    if ((st.saves || 0) > 12) s--;
    if ((st.stomped || 0) > 5) s--;
    if ((st.memosTotal || 0) > 0 && (st.memos || 0) < st.memosTotal / 2) s--;
    s -= st.lost != null ? st.lost : FATE_KEYS.filter((k) => !(S.flags && S.flags[k])).length;
    return Math.max(1, s);
  }
  function results(o = {}) {
    const s = { ...(S.stats || {}), ...(o.stats || {}) };
    const mc = memoCount();
    const r = {
      ending: o.ending || null, endingName: o.name || ENDING_NAMES[o.ending] || upper(o.ending || ''),
      time: s.time || 0, saves: o.saves ?? S.saves ?? 0, walked: s.walked || 0, ran: s.ran || 0,
      freed: s.freed || 0, stomped: s.stomped || 0, killed: s.killed || 0, itemsUsed: s.itemsUsed || 0, damage: Math.round(s.damage || 0),
      voicemails: s.voicemails || 0, callsAnswered: s.callsAnswered || 0,
      memos: o.memos ?? mc.found, memosTotal: o.memosTotal ?? mc.total,
      lost: FATE_KEYS.filter((k) => !(S.flags && S.flags[k])).length,
      playthrough: S.playthrough || 1,
    };
    r.stars = rank(r);
    return r;
  }
  SCREENS.results = {
    backdrop: 'black',
    keepBlack: () => true,
    build(sc) {
      const st = sc.st, r = results(sc.opts);
      st.r = r;
      if (sc.opts.record && r.ending && hasSave()) { try { Save.recordEnding(r.ending, r); } catch (e) { console.error('[Menus] recordEnding', e); } }
      mk('div', 'rs-name', sc.el, esc(r.endingName));
      const box = mk('div', 'rs-rows', sc.el);
      const rows = [
        ['TOTAL TIME', U.fmtTime(r.time)], ['SAVES', r.saves], ['DISTANCE WALKED', fmtDist(r.walked)], ['DISTANCE RUN', fmtDist(r.ran)], null,
        ['TETHERED FREED', r.freed], ['TETHERED STOMPED', r.stomped], ['OTHER ENEMIES DEFEATED', r.killed], null,
        ['ITEMS USED', r.itemsUsed], ['DAMAGE TAKEN', r.damage], null,
        ['VOICEMAILS PLAYED', r.voicemails], ['CALLS ANSWERED', r.callsAnswered], ['MEMOS FOUND', `${r.memos} OF ${r.memosTotal}`],
      ];
      st.rowF = rows.map((rw) => { const e = rw ? mk('div', 'rs-row', box, `<span>${esc(rw[0])}</span><b>${esc(rw[1])}</b>`) : mk('div', 'rs-gap', box); return fader(e, 0); });
      const rk = mk('div', 'rs-rank', sc.el, `<div class="mn-h">Rank</div>${starsSvg(r.stars)}`);
      st.rankF = fader(rk, 0);
      st.t = 0;
      st.legend = mk('div', 'mn-legend', sc.el); st.legend.textContent = ''; st.legF = fader(st.legend, 0);
    },
    update(sc, dt) {
      const st = sc.st;
      st.t += dt;
      st.rowF.forEach((f, i) => { if (f.target === 0 && st.t > 0.8 + i * 0.14) f.to(1, 0.5); });
      if (st.rankF.target === 0 && st.t > 1.2 + st.rowF.length * 0.14) st.rankF.to(1, 0.9);
      if (st.legF.target === 0 && st.t > 3.2) { st.legend.textContent = legendText([['E', 'A', 'CONTINUE']]); st.legF.to(1, 0.6); }
      if (!sc.ready || st.t < 1.5) return;
      if (K.confirm() || K.cancel()) {
        if (st.rankF.v < 0.99) { st.rowF.forEach((f) => f.jump(1)); st.rankF.jump(1); st.t = Math.max(st.t, 3.2); return; }
        sfx('ui_confirm'); sc.close(st.r);
      }
    },
  };

  // =================================================================================================================
  // CREDITS (§12): a slow scroll in the title serif on black. opts.lines: strings ('' = a gap), {title}, {head},
  // {role, name}, {text, italic}. opts.music: 'nan' (Connected), 'static' (Out of Coverage: wind and static),
  // 'hold' (Yes: the hold music). Hold confirm to speed it up.
  // =================================================================================================================
  const DEFAULT_CREDITS = [{ title: 'SIGNAL HILL' }, '', { head: 'With' }, { role: 'AIDAN', name: 'Aidan' }, { role: 'WAI', name: 'Wai' }, { role: 'CHASE', name: 'Chase' },
    { role: 'CHLOE', name: 'Chloe' }, { role: 'LUKA', name: 'Luka' }, { role: 'LUKE', name: 'Luke' }, { role: 'NAN', name: 'and Nan' }, '', '', { text: 'Thank you for playing.', italic: true }];
  SCREENS.credits = {
    backdrop: 'black',
    keepBlack: () => true,
    build(sc) {
      const st = sc.st, o = sc.opts;
      const lines = Array.isArray(o.lines) && o.lines.length ? o.lines : (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.credits) && DIALOGUE.credits.length ? DIALOGUE.credits : DEFAULT_CREDITS);
      st.roll = mk('div', 'cr-roll', sc.el);
      for (const l of lines) {
        if (l == null || l === '') mk('div', 'cr-gap', st.roll);
        else if (typeof l === 'string') mk('div', 'cr-line', st.roll, esc(l));
        else if (l.title) mk('div', 'cr-title', st.roll, esc(l.title));
        else if (l.head) mk('div', 'cr-head', st.roll, esc(l.head));
        else if (l.role !== undefined) mk('div', 'cr-pair', st.roll, `<span>${esc(l.role)}</span><span>${esc(l.name ?? '')}</span>`);
        else if (l.text !== undefined) mk('div', 'cr-line' + (l.italic ? ' it' : ''), st.roll, esc(l.text));
      }
      st.y = window.innerHeight * 1.02;
      st.roll.style.transform = `translateY(${st.y}px)`;
      st.speed = (o.speed || 3.9) * window.innerHeight / 100;           // vh per second
      st.done = false; st.hold = 0;
      // music by ending (§12): Connected the Nan motif, Out of Coverage wind and static, Yes the hold music
      const m = o.music !== undefined ? o.music : { connected: 'nan', coverage: 'static', yes: 'hold' }[o.ending] || null;
      st.music = m;
      try {
        if (m === 'nan') st.mus = Snd.music('nan', { full: true });
        else if (m === 'hold') st.mus = Snd.play('hold', { loop: true, vol: 0.8, bus: 'music' });
        else if (m === 'static') { Snd.ambient('wind', 3); st.mus = Snd.play('static', { loop: true, vol: 0.18, intensity: 0.3 }); st.windOn = true; }
      } catch (e) { /* audio */ }
    },
    dispose(sc) {
      const st = sc.st;
      try { if (st.mus && st.mus.stop) st.mus.stop(2); if (st.music === 'nan') Snd.stopMusic(2.5); if (st.windOn) Snd.ambient('none', 3); } catch (e) { /* audio */ }
    },
    update(sc, dt) {
      const st = sc.st;
      if (st.done) return;
      const fast = sc.ready && (K.held('confirm') || K.held('interact'));
      st.y -= st.speed * dt * (fast ? 5 : 1);
      st.roll.style.transform = `translateY(${st.y.toFixed(1)}px)`;
      const endY = -(st.roll.offsetHeight - window.innerHeight * 0.5);
      if (st.y <= endY) {
        st.y = endY;
        st.hold += dt;
        if (st.hold > 3.5) { st.done = true; sc.close(true); }
      }
    },
  };

  // =================================================================================================================
  // FATES (§12): one card per character on black, 4 s each (Connected and Out of Coverage only)
  // =================================================================================================================
  const FATES = [
    ['waiSaved', 'Wai trains the new starters now. He still picks up on the first ring.', 'The operators\' board in Signal Hill has one lamp that never lights.'],
    ['chaseSaved', 'Chase told his leader what really happened that night. His store doesn\'t roster anyone alone on late shifts anymore.', 'Nobody has heard from Chase. His phone rings out.'],
    ['chloeSaved', 'Chloe finished the month eleven short. Nothing happened.', 'Chloe was number one again that month. And the next.'],
    ['lukaSaved', 'Luka stopped writing the number first.', 'Luka is still looking for the road out.'],
    ['lukeSaved', 'Luke visits on Sundays.', 'Luke is still ringing a number that doesn\'t pick up.'],
  ];
  const fateCards = (s = S) => FATES.map(([k, saved, lost]) => (s && s.flags && s.flags[k] ? saved : lost));
  SCREENS.fates = {
    backdrop: 'black',
    keepBlack: () => true,
    build(sc) {
      const st = sc.st;
      st.cards = (Array.isArray(sc.opts.cards) && sc.opts.cards.length ? sc.opts.cards : fateCards()).map((c) => (typeof c === 'string' ? c : c && c.text) || '');
      st.el = mk('div', 'ft-card', sc.el); st.f = fader(st.el, 0);
      st.i = -1; st.t = 0; st.phase = 'gap'; st.dur = 0.6;
    },
    update(sc, dt) {
      const st = sc.st;
      st.t += dt;
      if (st.phase === 'gap' && st.t >= st.dur) {
        st.i++;
        if (st.i >= st.cards.length) { st.phase = 'end'; sc.close(true); return; }
        st.el.textContent = st.cards[st.i];
        st.f.to(1, 0.8); st.phase = 'in'; st.t = 0;
      } else if (st.phase === 'in' && st.t >= 0.8) { st.phase = 'hold'; st.t = 0; }
      else if (st.phase === 'hold' && (st.t >= 2.6 || (sc.ready && st.t > 0.6 && K.confirm()))) { st.f.to(0, 0.6); st.phase = 'out'; st.t = 0; }
      else if (st.phase === 'out' && st.t >= 0.6) { st.phase = 'gap'; st.t = 0; st.dur = 0.45; }
    },
  };

  // =================================================================================================================
  // EXTRA (after the first ending): endings seen, past results, New Game+
  // =================================================================================================================
  const ENDING_ORDER = ['connected', 'coverage', 'tomorrow', 'yes'];
  function extraPanel(sc, what) {
    const st = sc.st, seen = META.endingsSeen || [];
    if (what === 'endings') {
      st.panel.innerHTML = ENDING_ORDER.map((e) => (seen.includes(e) ? `<div><b>${ENDING_NAMES[e]}</b></div>` : '<div>? ? ?</div>')).join('')
        + `<div class="it" style="margin-top:1.6em">${seen.filter((e) => ENDING_ORDER.includes(e)).length} of ${ENDING_ORDER.length} endings seen.</div>`;
    } else if (what === 'results') {
      const res = (META.results || []).slice(-8).reverse();
      st.panel.innerHTML = res.length
        ? `<div class="ex-res">${res.map((r) => `<span><b>${esc(ENDING_NAMES[r.ending] || upper(r.ending || ''))}</b></span><span>${esc(U.fmtTime(r.time || 0))}</span><span>${starsSvg(r.stars || 1, 10, 11)}</span>`).join('')}</div>`
        : '<div class="it">No results yet.</div>';
    } else {
      st.panel.innerHTML = '<div class="it">Start again from the Lookout.<br>Your Ollie stickers come with you,<br>and so does the steel bar.</div>';
    }
  }
  SCREENS.extra = {
    backdrop: 'black',
    keepBlack: (v) => v != null,
    build(sc) {
      const st = sc.st;
      st.list = makeList(sc.el, [{ label: 'ENDINGS SEEN', value: 'endings' }, { label: 'PAST RESULTS', value: 'results' }, { label: 'NEW GAME+', value: 'ngplus' }], { cls: 'ex-list' });
      st.list.onMove = (i) => extraPanel(sc, st.list.items[i].value);
      st.panel = mk('div', 'ex-panel', sc.el);
      legend(sc, () => [['W S', 'D-PAD', 'CHOOSE'], ['E', 'A', 'SELECT'], ['ESC', 'B', 'BACK']]);
      extraPanel(sc, 'endings');
    },
    update(sc) {
      const st = sc.st;
      const r = st.list.step(sc);
      if (!r) return;
      if (r.cancel) { sfx('ui_cancel'); sc.close(null); return; }
      if (r.pick.value === 'ngplus') { sfx('ui_confirm'); sc.push('newgame', { ngplus: true, exit: !!sc.opts.exit, calibrate: false }); }
      else sfx('ui_move');
    },
  };

  // =================================================================================================================
  // API
  // =================================================================================================================
  const api = {
    open, close, back, update, isOpen, init,
    get current() { const t = top(); return t ? t.name : null; },
    get stack() { return stack.map((s) => s.name); },
    get busy() { return busyN > 0; },
    get _top() { return top(); },                 // CONTRACT+ (tests): the top screen instance {name, st, ready …}
    rank, results, fateCards, memoCount,
    // CONTRACT+: Menus.nav(action) — inject a menu action for tests ('up'|'down'|'left'|'right'|'confirm'|'cancel'|'any')
    // (an injected nav with no screen open is dropped, and leftovers die with the menu session: a SH.nav('confirm')
    // sent during a cutscene must never confirm the next menu that opens — the pause menu's RESUME)
    nav(a) { ensure(); if (!stack.length) return 0; injected.push(a); return injected.length; },
    SCREENS,
  };
  requestAnimationFrame(selfTick);
  return api;
})();
