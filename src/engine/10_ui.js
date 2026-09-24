// ==== engine/10_ui.js — UI: every in-game overlay (ARCHITECTURE §10.1; spec §2A, §4, §6, §7, §8) ====
//
// DOM inside #ui plus ONE injected <style id="ui-style">. Spec §2A: black, serif, off-white and grey, no rounded
// corners, panels, gradients or modern icons; everything fades (0.3–0.5 s); nothing slides, bounces or scales in —
// except the cutscene letterbox bars, which slide in over 0.6 s (§7). Things UI draws that exist in the world (keypads,
// the CRM / terminal / phone screens, stamps, Unread badges) are diegetic objects and get proper materials.
//
// Timing: every fade, wait and timer steps in UI.update(dt). A dt > 0 is used as given (so SH.advance() is
// deterministic), otherwise real time is measured. If nobody calls UI.update for 250 ms (boot, partial builds) a
// requestAnimationFrame fallback drives it (and Input.update() too when there is no Game at all).
// While Menus.isOpen() the game overlays hide and their timers and input pause; fades, cards and grain stay.
//
// Layers inside .ui-root (z-index 20 in #ui), bottom → top:
//   badge · blur · stamp · letterbox · hud (bars) · screen · keypad · fade · black (cards, title text, text on black,
//   NO SIGNAL) · text (prompts, hold/mash, subtitles, messages, choice, call prompt) · skip.
// The DOM film grain (.ui-grain) is z-index 9000 in #ui, above Menus (keep Menus screens between z 50 and 8999).
//
// Input: overlays that capture input (choice, keypad, screen handle .choose) call Input.setMenu(true) while open,
// swallow the press that opened them and the press that closed them (Input.consume) and make UI.capturing() true.
// Player/Game must ignore gameplay input — including Esc → pause — while UI.capturing().
//
// Contract §10.1: init, update, subtitle, clearSubtitle, message, prompt, letterbox, fade, card, titleText, textOnBlack,
// choice, callPrompt, bars, badges, stamp, holdPrompt, keypad, screen, noSignal, showHud. CONTRACT+ additions are marked
// at their definitions (say, sting, mash, grainOverlay, capturing, dismissMessage, skippable, skip, clear, crmHtml …).
const UI = (() => {
  const TAU = Math.PI * 2;
  const SERIF = "Georgia, 'Times New Roman', Times, serif";
  const MONO = "'Courier New', Courier, monospace";
  const SANS = "Tahoma, Verdana, 'DejaVu Sans', Arial, sans-serif";
  const ARIAL = "Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif";
  const HEAVY = "'Arial Black', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";
  const LCD_ON = '#38d2c6', LCD_MID = '#1f9d94', LCD_DIM = '#0f5a55';
  const clamp = U.clamp;
  const R = Math.random;
  const rnow = () => performance.now() / 1000;
  const ez = (t) => U.ease.sine(clamp(t));
  const mod = (a, n) => ((a % n) + n) % n;

  // ---- small helpers ----------------------------------------------------------------------------------------------
  const sfx = (name, o) => { try { return Snd.play(name, o); } catch (e) { return null; } };
  const label = (a) => { try { return Input.label(a); } catch (e) { return String(a).toUpperCase(); } };
  const padDevice = () => { try { return Input.lastDevice === 'gamepad'; } catch (e) { return false; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Player-facing text: escaped; "{interact}" style tokens become the current device's key label; \n → line break.
  const fmt = (s) => esc(s).replace(/\{(\w+)\}/g, (m, a) => (Input.actions && Input.actions.includes(a) ? esc(label(a)) : m)).replace(/\n/g, '<br>');
  function mk(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const menuOpen = () => { try { return typeof Menus !== 'undefined' && !!Menus.isOpen && !!Menus.isOpen(); } catch (e) { return false; } };
  const hasGame = () => { try { return typeof Game !== 'undefined'; } catch (e) { return true; } };
  const renderLive = () => { try { return typeof Render !== 'undefined' && !!Render.renderer && !!Render.post; } catch (e) { return false; } };
  const shadeHex = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };

  // ---- animated values and waits (stepped by update) ------------------------------------------------------------
  const faders = new Set();
  class Fader {
    constructor(apply, v = 0) { this.apply = apply; this.v = v; this.a = v; this.b = v; this.t = 1; this.dur = 0; this.delay = 0; this.res = null; this.ease = ez; apply(v); }
    get target() { return this.b; }
    get busy() { return faders.has(this); }
    // animate to b over dur seconds (after delay) → Promise (also resolves when superseded)
    to(b, dur = 0.4, delay = 0, ease = ez) {
      this.settle();
      if (!(delay > 0) && Math.abs(this.v - b) < 1e-4) { this.a = this.b = this.v = b; this.t = 1; faders.delete(this); this.apply(b); return Promise.resolve(); }
      this.a = this.v; this.b = b; this.t = 0; this.dur = Math.max(0, dur); this.delay = Math.max(0, delay); this.ease = ease;
      if (this.dur === 0 && this.delay === 0) { this.v = b; this.t = 1; faders.delete(this); this.apply(b); return Promise.resolve(); }
      faders.add(this);
      return new Promise((r) => { this.res = r; });
    }
    jump(b) { this.settle(); this.a = this.b = this.v = b; this.t = 1; this.delay = 0; faders.delete(this); this.apply(b); }
    step(dt) {
      if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return; dt = -this.delay; this.delay = 0; }
      this.t = this.dur > 0 ? Math.min(1, this.t + dt / this.dur) : 1;
      this.v = this.a + (this.b - this.a) * this.ease(this.t);
      this.apply(this.v);
      if (this.t >= 1) this.finish();
    }
    finish() { this.v = this.b; this.t = 1; this.delay = 0; faders.delete(this); this.apply(this.b); this.settle(); }
    settle() { if (this.res) { const r = this.res; this.res = null; r(); } }
  }
  const opac = (...nodes) => (v) => {
    const o = v <= 0.002 ? 0 : v >= 0.998 ? 1 : +v.toFixed(3);
    for (const n of nodes) { n.style.opacity = o; n.style.visibility = o === 0 ? 'hidden' : 'visible'; }
  };
  const waits = new Set();
  const wait = (s) => (s > 0 ? new Promise((r) => waits.add({ t: s, r })) : Promise.resolve());

  // ---- state ------------------------------------------------------------------------------------------------------
  let inited = false, host = null, root = null;
  const L = {};
  let lcdS = 2, callS = 2; // LCD pixel size in CSS px (phone bars; the call prompt)
  let clock = 0;           // UI time (advances only while no menu is open)
  let hudOn = true, skippableFlag = false, subSize = '';
  let lastExt = -1e9, lastReal = 0;
  let capDepth = 0;
  let menuF = null, hudF = null, lbF = null;

  // =================================================================================================================
  // CSS (one <style> element)
  // =================================================================================================================
  const SHADOW = '0 0 .35em rgba(0,0,0,.95), 0 .06em .14em rgba(0,0,0,.95), 0 0 1.1em rgba(0,0,0,.6)';
  const CSS = `
#ui .ui-root{position:absolute;inset:0;z-index:20;pointer-events:none;font-family:${SERIF};color:#f0ede4;--lbh:0px;--subz:11vh;}
#ui .ui-l{position:absolute;inset:0;pointer-events:none;}
#ui .ui-l-badge{z-index:1}#ui .ui-l-blur{z-index:2}#ui .ui-l-stamp{z-index:3}#ui .ui-l-lb{z-index:4}#ui .ui-l-hud{z-index:5}
#ui .ui-l-screen{z-index:6}#ui .ui-l-kp{z-index:7}#ui .ui-l-fade{z-index:8}#ui .ui-l-black{z-index:9}#ui .ui-l-text{z-index:10}#ui .ui-l-skip{z-index:11}
#ui .ui-grain{position:absolute;inset:0;z-index:9000;pointer-events:none;visibility:hidden;opacity:0;background-repeat:repeat;}
#ui .ui-hudtext{position:absolute;inset:0;}
#ui .ui-sz-s{--fs:clamp(14px,2.05vh,27px)}#ui .ui-sz-m{--fs:clamp(16px,2.5vh,33px)}#ui .ui-sz-l{--fs:clamp(19px,3.1vh,41px)}
/* letterbox */
#ui .ui-lb{position:absolute;left:0;right:0;height:var(--lbh);background:#000;}
#ui .ui-lb.t{top:0}#ui .ui-lb.b{bottom:0}
/* fades */
#ui .ui-fadel{position:absolute;inset:0;visibility:hidden;}
/* subtitles + messages */
#ui .ui-subz{position:absolute;left:0;right:0;bottom:0;height:var(--subz);display:flex;align-items:center;justify-content:center;}
#ui .ui-sub{position:absolute;max-width:min(76vw,1180px);padding:0 2vw;text-align:center;font-size:var(--fs);line-height:1.36;letter-spacing:.012em;color:#f0ede4;text-shadow:${SHADOW};visibility:hidden;}
#ui .ui-sub.it{font-style:italic}
#ui .ui-sub.ph{text-shadow:${SHADOW},.07em 0 .02em rgba(120,205,200,.16),-.06em 0 .02em rgba(210,120,110,.12)}
#ui .ui-msg{position:absolute;left:6vw;right:6vw;bottom:calc(var(--subz) / 2);transform:translateY(50%);text-align:center;font-size:var(--fs);line-height:1.36;color:#f0ede4;text-shadow:${SHADOW};visibility:hidden;}
#ui .ui-msg.up{bottom:calc(var(--subz) + 2.2vh);transform:none}
/* tutorial prompts (lower left) */
#ui .ui-prompts{position:absolute;left:4.4vw;top:61vh;font-size:clamp(13px,1.8vh,23px);}
#ui .ui-prompt{position:absolute;left:0;white-space:nowrap;color:#d9d6cc;letter-spacing:.07em;text-shadow:${SHADOW};visibility:hidden;}
/* hold prompt / struggle */
#ui .ui-hold{position:absolute;left:0;right:0;bottom:calc(var(--subz) + 8vh);display:flex;flex-direction:column;align-items:center;visibility:hidden;}
#ui .ui-hold-t{font-size:clamp(13px,1.9vh,24px);color:#d9d6cc;letter-spacing:.06em;text-shadow:${SHADOW};}
#ui .ui-hold-l{position:relative;margin-top:.8em;width:12vw;min-width:110px;height:1px;background:rgba(217,214,204,.2);box-shadow:0 0 3px rgba(0,0,0,.8);}
#ui .ui-hold-f{position:absolute;left:0;top:0;bottom:0;width:100%;background:#d9d6cc;transform-origin:0 50%;transform:scaleX(0);}
#ui .ui-mash .ui-hold-l{width:15vw}
/* choice */
#ui .ui-choice{position:absolute;left:0;right:0;bottom:calc(var(--subz) + 4.5vh);display:flex;flex-direction:column;align-items:center;visibility:hidden;}
#ui .ui-ch-title{font-size:var(--fs);color:#f0ede4;text-shadow:${SHADOW};margin-bottom:1.8vh;text-align:center;max-width:70vw;}
#ui .ui-ch-it{pointer-events:auto;cursor:default;font-size:clamp(17px,1.8vh,22px);color:#6f6f6a;padding:.34em 1.4em;letter-spacing:.06em;text-shadow:0 0 .18em #000,0 0 .5em rgba(0,0,0,.95),0 0 1.1em rgba(0,0,0,.85),0 0 2.2em rgba(0,0,0,.6);transition:color .16s linear;}
#ui .ui-ch-it>span{display:inline-block;padding-bottom:.16em;border-bottom:1px solid transparent;transition:border-color .16s linear;}
#ui .ui-ch-it.sel{color:#e8e4d8}
#ui .ui-ch-it.sel>span{border-bottom-color:rgba(232,228,216,.7)}
#ui .ui-ch-it.br{font-style:italic}
#ui .ui-ch-timer{margin-top:1.5vh;height:1px;width:16vw;min-width:140px;background:#6f6f6a;transform-origin:50% 50%;box-shadow:0 0 3px rgba(0,0,0,.9);}
/* incoming call (the phone's own LCD, teal on black) */
#ui .ui-call{position:absolute;right:3.2vw;top:9.4vh;padding:2px;background:#000;border:1px solid #0f4a46;box-shadow:0 0 0 1px #000,0 0 18px rgba(0,0,0,.85);visibility:hidden;}
#ui .ui-call canvas,#ui .ui-bars canvas{display:block}
/* phone signal bars */
#ui .ui-bars{position:absolute;right:3.2vw;top:4.4vh;visibility:hidden;filter:drop-shadow(0 0 1px rgba(0,0,0,.95)) drop-shadow(0 0 5px rgba(0,0,0,.55));}
/* cards / titles / text on black / NO SIGNAL */
#ui .ui-card,#ui .ui-titlet,#ui .ui-tob,#ui .ui-nosig{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;visibility:hidden;}
#ui .ui-card-t{font-size:clamp(20px,3.3vh,46px);letter-spacing:.3em;padding-left:.3em;color:#d9d6cc;text-transform:uppercase;line-height:1.5;}
#ui .ui-card-s{margin-top:2.6vh;font-size:clamp(11px,1.45vh,19px);letter-spacing:.3em;padding-left:.3em;color:#6f6f6a;text-transform:uppercase;}
#ui .ui-titlet .ui-card-t{font-size:clamp(26px,5.2vh,74px);letter-spacing:.3em;padding-left:.3em;text-shadow:0 0 .6em rgba(0,0,0,.55),0 0 2em rgba(0,0,0,.35);}
#ui .ui-titlet .ui-card-s{text-shadow:0 0 .6em rgba(0,0,0,.7)}
#ui .ui-tob-t{font-size:clamp(16px,2.5vh,32px);line-height:1.62;color:#d9d6cc;max-width:62vw;}
#ui .ui-nosig-t{font-size:clamp(11px,1.6vh,20px);letter-spacing:.42em;padding-left:.42em;color:#d9d6cc;}
/* skip */
#ui .ui-skip{position:absolute;right:3vw;bottom:max(2.4vh,calc(var(--lbh) / 2 - .9em));visibility:hidden;text-align:right;}
#ui .ui-skip-t{font-size:clamp(10px,1.25vh,15px);letter-spacing:.32em;color:#6f6f6a;}
#ui .ui-skip-l{position:relative;height:1px;width:5.5vw;min-width:52px;background:rgba(111,111,106,.3);margin-top:.55em;margin-left:auto;}
#ui .ui-skip-f{position:absolute;inset:0;background:#8f8e87;transform-origin:0 50%;transform:scaleX(0);}
/* Unread badges, stamps, signatures */
#ui .ui-badge{position:absolute;transform:translate(-50%,-50%);visibility:hidden;}
#ui .ui-blurl{position:absolute;inset:0;visibility:hidden;}
#ui .ui-stamp{position:absolute;left:50%;top:45%;width:min(54vw,90vh);visibility:hidden;filter:drop-shadow(0 0 1px rgba(80,0,0,.5));}
#ui .ui-sig{position:absolute;width:min(40vw,72vh);visibility:hidden;filter:drop-shadow(0 0 2px rgba(255,255,255,.18));}
/* keypad overlay */
#ui .ui-kp{position:absolute;inset:0;pointer-events:auto;visibility:hidden;}
#ui .ui-kp.dim{background:rgba(0,0,0,.86);box-shadow:inset 0 0 24vh rgba(0,0,0,.95);}
#ui .ui-kp-title{position:absolute;top:8.5vh;left:0;right:0;text-align:center;font-size:clamp(12px,1.7vh,22px);letter-spacing:.3em;padding-left:.3em;color:#d9d6cc;text-transform:uppercase;}
#ui .ui-kp-cv{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);}
#ui .ui-kp-msg{position:absolute;left:0;right:0;bottom:21vh;text-align:center;font-size:clamp(14px,2.1vh,27px);color:#f0ede4;text-shadow:${SHADOW};visibility:hidden;}
#ui .ui-kp-hint{position:absolute;left:0;right:0;bottom:16vh;text-align:center;font-style:italic;font-size:clamp(14px,2vh,26px);color:#f0ede4;text-shadow:${SHADOW};}
#ui .ui-kp.term .ui-kp-hint{top:2.4vh;bottom:auto}
#ui .ui-root.kpo .ui-subz{bottom:4.6vh;height:9.5vh}
#ui .ui-kp-keys{position:absolute;left:0;right:0;bottom:2.6vh;text-align:center;font-size:clamp(10px,1.3vh,16px);letter-spacing:.24em;padding-left:.24em;color:#6f6f6a;white-space:pre;}
/* in-world screens: CRT monitor (crm / case / terminal) and the phone */
#ui .ui-scr{position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center;pointer-events:auto;visibility:hidden;--sh:min(86vh,63vw);}
#ui .ui-scr-bezel{position:relative;height:var(--sh);width:calc(var(--sh) * 4 / 3);padding:calc(var(--sh) * .045);background:#191b1a;box-shadow:inset 0 0 0 1px #2c302e,inset 0 0 calc(var(--sh) * .03) #060707,0 0 8vh rgba(0,0,0,.9);}
#ui .ui-scr-glass{position:relative;width:100%;height:100%;overflow:hidden;background:#070b0a;box-shadow:0 0 0 2px #050606;}
#ui .ui-scr-app{position:absolute;inset:0;display:flex;flex-direction:column;font-family:${SANS};font-size:calc(var(--sh) * .0235);line-height:1.3;color:#111716;background:#b3bdba;filter:contrast(1.04) saturate(.82) brightness(.93);}
#ui .scr-scan,#ui .scr-vig,#ui .scr-static,#ui .scr-sheen{position:absolute;inset:0;pointer-events:none;}
#ui .scr-scan{opacity:.32;background-size:2px 3px;}
#ui .scr-led{position:absolute;right:calc(var(--sh) * .06);bottom:calc(var(--sh) * .016);width:calc(var(--sh) * .009);height:calc(var(--sh) * .009);background:#57d86e;box-shadow:0 0 calc(var(--sh) * .012) rgba(80,230,110,.8);}
#ui .scr-vig{box-shadow:inset 0 0 calc(var(--sh) * .09) rgba(0,0,0,.62),inset 0 0 calc(var(--sh) * .02) rgba(0,0,0,.55);}
#ui .scr-sheen{background:radial-gradient(ellipse at 28% 18%,rgba(255,255,255,.07),rgba(255,255,255,0) 55%);}
#ui .scr-static{visibility:hidden;opacity:0;background-size:384px 288px;image-rendering:pixelated;}
#ui .scr-tear{position:absolute;left:-2%;right:-2%;visibility:hidden;background-size:384px 288px;image-rendering:pixelated;mix-blend-mode:screen;opacity:.55;}
#ui .crm-title{display:flex;align-items:center;gap:.8em;padding:.32em .7em;background:#00696b;color:#eef6f4;font-weight:bold;letter-spacing:.02em;border-bottom:2px solid #06393a;}
#ui .crm-title img{height:1.35em;display:block}
#ui .crm-title-t{flex:1}
#ui .crm-store{font-weight:normal;font-size:.85em;opacity:.85}
#ui .crm-menu{padding:.22em .7em;background:#c7cfcc;border-bottom:1px solid #7a8582;word-spacing:1.2em;}
#ui .crm-body{position:relative;flex:1;padding:1em 1.3em;overflow:hidden;}
#ui .crm-status{display:flex;justify-content:space-between;padding:.22em .7em;background:#c7cfcc;border-top:1px solid #7a8582;font-size:.86em;white-space:pre;}
#ui .crm-h{font-weight:bold;color:#044f51;border-bottom:2px solid #044f51;padding-bottom:.2em;margin-bottom:.9em;letter-spacing:.05em;}
#ui .crm-sub{font-weight:bold;color:#26312f;margin:1em 0 .4em;font-size:.9em;letter-spacing:.05em;}
#ui .crm-row{display:flex;align-items:center;margin:.38em 0;}
#ui .crm-k{width:12.5em;flex:none;font-size:.88em;color:#26302e;letter-spacing:.03em;}
#ui .crm-v{flex:1;min-height:1.55em;padding:.12em .45em;background:#f2f4f0;border:1px solid;border-color:#5f6a67 #fafcfa #fafcfa #5f6a67;font-family:${MONO};font-weight:bold;white-space:pre;overflow:hidden;}
#ui .crm-static{background-size:192px 144px;image-rendering:pixelated;color:transparent;}
#ui .crm-caret{display:inline-block;width:.55em;height:1em;margin-left:.1em;vertical-align:-.12em;background:#111716;}
#ui .crm-btns{margin-top:1.2em;display:flex;gap:.9em;flex-wrap:wrap;}
#ui .crm-btn{display:inline-block;padding:.3em 1.2em;background:#c7cfcc;border:2px solid;border-color:#f5f8f6 #45504d #45504d #f5f8f6;color:#111716;white-space:nowrap;}
#ui .crm-btn.sel{outline:1px dotted #111716;outline-offset:-5px;}
#ui .crm-btn.down{border-color:#45504d #f5f8f6 #f5f8f6 #45504d;}
#ui .crm-find{margin-left:.8em;padding:.12em .9em}
#ui .crm-panel{margin-top:1em;border:2px solid #8e1a14;background:#efd9d3;padding:.5em .8em .6em;font-family:${MONO};font-weight:bold;}
#ui .crm-panel-t{margin:-.5em -.8em .5em;padding:.2em .8em;background:#8e1a14;color:#fbeeea;font-family:${SANS};letter-spacing:.05em;}
#ui .crm-tab{border-collapse:collapse;width:100%;font-family:${MONO};font-size:.95em;background:#f2f4f0;}
#ui .crm-tab td{border:1px solid #8f9996;padding:.18em .5em;}
#ui .crm-text{margin-top:.8em;white-space:pre-wrap;}
#ui .crm-desk{position:absolute;inset:0;background:#2e5d5b;display:flex;align-items:center;justify-content:center;}
#ui .crm-desk-mark{position:absolute;right:1.2em;bottom:.9em;color:rgba(230,244,240,.22);font-weight:bold;letter-spacing:.2em;font-size:.9em;}
#ui .crm-dlg{width:62%;background:#c7cfcc;border:2px solid;border-color:#f5f8f6 #2f3836 #2f3836 #f5f8f6;box-shadow:.35em .35em 0 rgba(0,0,0,.35);}
#ui .crm-dlg-t{padding:.3em .6em;background:#00696b;color:#eef6f4;font-weight:bold;}
#ui .crm-dlg-b{padding:1em 1.3em 1.1em;}
#ui .crm-brand{display:flex;align-items:center;gap:.9em;margin-bottom:1em;padding-bottom:.8em;border-bottom:1px solid #8f9996;}
#ui .crm-brand img{height:2.1em;display:block;background:#00787a;padding:.3em .5em;}
#ui .crm-brand small{color:#3a4644}
#ui .crm-pin{display:flex;gap:.4em;flex:1}
#ui .crm-pin i{pointer-events:auto;display:block;width:1.9em;height:1.75em;line-height:1.7em;text-align:center;font-style:normal;font-family:${MONO};font-weight:bold;background:#f2f4f0;border:1px solid;border-color:#5f6a67 #fafcfa #fafcfa #5f6a67;}
#ui .crm-pin i.cur{background:#fbf6d8}
#ui .crm-msg{margin-top:.9em;min-height:1.3em;color:#26302e;}
#ui .crm-msg.err{color:#9b1710;font-weight:bold}
#ui .ui-scr-terminal .ui-scr-app{background:#030907;color:#63d8bf;font-family:${MONO};font-size:calc(var(--sh) * .028);padding:2.2em 2.4em;white-space:pre-wrap;text-shadow:0 0 .45em rgba(70,225,190,.55);filter:none;}
#ui .term-cur{display:inline-block;width:.6em;height:1.05em;vertical-align:-.15em;background:#63d8bf;box-shadow:0 0 .5em rgba(70,225,190,.6);}
#ui .ui-scr-phone{background:rgba(0,0,0,.9);}
#ui .ph-body{position:relative;height:86vh;width:48vh;background:#151819;box-shadow:inset 0 0 0 1px #2d3334,inset 0 0 0 .7vh #0d0f10,0 0 9vh rgba(0,0,0,.95);}
#ui .ph-ear{position:absolute;top:3.6vh;left:50%;width:10vh;height:.8vh;margin-left:-5vh;background:#050607;box-shadow:0 1px 0 #262b2c;}
#ui .ph-body .ui-scr-glass{position:absolute;left:4vh;right:4vh;top:8vh;height:37vh;width:auto;background:#010505;box-shadow:0 0 0 .5vh #060808,0 0 0 calc(.5vh + 1px) #2a3031;}
#ui .ph-app{position:absolute;inset:0;padding:1.5vh 1.8vh;color:#3bd0c4;font-family:'Lucida Console','DejaVu Sans Mono',${MONO};font-size:2.3vh;line-height:1.35;text-shadow:0 0 .7vh rgba(45,210,195,.5);}
#ui .ph-status{display:flex;justify-content:space-between;align-items:center;margin-bottom:2.2vh;padding-bottom:.9vh;border-bottom:1px solid #0f4a46;}
#ui .ph-status canvas{display:block}
#ui .ph-big{font-size:3.5vh;letter-spacing:.06em;margin:1.4vh 0 1vh;}
#ui .ph-dim{color:#1b958c}
#ui .ph-btns{position:absolute;left:1.8vh;right:1.8vh;bottom:1.8vh;display:flex;gap:1.2vh;justify-content:center;}
#ui .ph-btn{padding:.5vh 1.8vh;border:1px solid #1d8a82;letter-spacing:.08em;}
#ui .ph-btn.call{background:#1a8d3f;border-color:#3fcf6c;color:#e4faea;text-shadow:none;}
#ui .ph-btn.sel{outline:1px solid #8ff5ea;outline-offset:2px;}
#ui .ph-keys{position:absolute;left:5vh;right:5vh;top:50vh;bottom:4.5vh;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;gap:1.2vh;}
#ui .ph-keys b{display:flex;align-items:center;justify-content:center;background:#0c0e0f;border:1px solid #242a2c;color:#59625f;font:normal 2.1vh ${ARIAL};}
#ui .ph-keys b.g{border-bottom:2px solid #2f7a45}#ui .ph-keys b.r{border-bottom:2px solid #8a2e28}
`;

  // =================================================================================================================
  // Generated images: film grain, TV static, scanlines, grime (Canvas2D at load time)
  // =================================================================================================================
  const IMG = { grain: [], stat: [], scan: '', wordmark: null, ready: false };
  function genImages() {
    if (IMG.ready) return;
    IMG.ready = true;
    const tile = (w, h, fn) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); const im = x.createImageData(w, h); fn(im.data, w, h); x.putImageData(im, 0, 0);
      return c.toDataURL('image/png');
    };
    for (let k = 0; k < 4; k++) {
      IMG.grain.push(tile(160, 160, (d) => {
        for (let i = 0; i < d.length; i += 4) { let v = R() * 255; if (R() < 0.0018) v = 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      }));
      IMG.stat.push(tile(128, 96, (d, w, h) => {
        for (let y = 0; y < h; y++) {
          const row = 0.5 + R() * 0.65, hot = R() < 0.05 ? 1.7 : 1;
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, v = Math.min(255, Math.pow(R(), 1.3) * 255 * row * hot);
            d[i] = v * 0.96; d[i + 1] = v; d[i + 2] = v * 0.98; d[i + 3] = 255;
          }
        }
      }));
    }
    IMG.scan = tile(2, 3, (d) => { for (let i = 0; i < d.length; i += 4) { const row = Math.floor(i / 8); d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = row === 2 ? 150 : 0; } });
  }
  const pickImg = (arr) => arr[Math.floor(R() * arr.length) % arr.length];
  function wordmarkUrl() {
    if (IMG.wordmark !== null) return IMG.wordmark;
    IMG.wordmark = '';
    try {
      if (typeof Tex === 'undefined' || !Tex.drawWordmark) return '';
      const h = 40, probe = document.createElement('canvas').getContext('2d');
      const w = Math.ceil(Tex.drawWordmark(probe, 0, 0, h)) + 8;
      const c = document.createElement('canvas'); c.width = w; c.height = Math.ceil(h * 1.35);
      Tex.drawWordmark(c.getContext('2d'), 4, Math.round(h * 1.02), h, { color: '#ffcc00' });
      IMG.wordmark = c.toDataURL('image/png');
    } catch (e) { IMG.wordmark = ''; }
    return IMG.wordmark;
  }
  // Grime for the drawn objects: bilinear value noise (upscaled random tiles, multiplied) + specks. Drawn stretched
  // over an object's bounds with 'multiply' inside a clip.
  let grimeCv = null;
  function grime() {
    if (grimeCv) return grimeCv;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), r = U.rng(911);
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (const [n, a] of [[3, 0.3], [7, 0.26], [19, 0.2], [53, 0.16], [128, 0.1]]) {
      const t = document.createElement('canvas'); t.width = t.height = n;
      const tx = t.getContext('2d'), im = tx.createImageData(n, n);
      for (let i = 0; i < im.data.length; i += 4) { const v = 255 - r() * 255 * a * 2; im.data[i] = v; im.data[i + 1] = v * 0.985; im.data[i + 2] = v * 0.955; im.data[i + 3] = 255; }
      tx.putImageData(im, 0, 0);
      x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, S, S);
    }
    x.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(70,58,44,${0.08 + r() * 0.32})`; x.beginPath(); x.arc(r() * S, r() * S, 0.4 + r() * 1.5, 0, TAU); x.fill(); }
    for (let i = 0; i < 5; i++) { // water-stain rings
      const cx = r() * S, cy = r() * S, rad = 12 + r() * 40;
      x.strokeStyle = `rgba(110,90,60,${0.12 + r() * 0.12})`; x.lineWidth = 1 + r() * 2;
      x.beginPath(); x.ellipse(cx, cy, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, TAU); x.stroke();
    }
    grimeCv = c;
    return c;
  }

  // =================================================================================================================
  // 5×7 LCD font (the phone's dated little screen): rows top→bottom, bit 4 = leftmost column
  // =================================================================================================================
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
    '·': [0, 0, 0, 12, 12, 0, 0], '/': [0, 1, 2, 4, 8, 16, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
    '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], "'": [12, 4, 8, 0, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0],
    '#': [10, 10, 31, 10, 31, 10, 10], '+': [0, 4, 4, 31, 4, 4, 0], '&': [12, 18, 20, 8, 21, 18, 13], '%': [24, 25, 2, 4, 8, 19, 3],
    '_': [0, 0, 0, 0, 0, 0, 31], '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
  };
  const lcdNorm = (s) => String(s ?? '').toUpperCase().replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const lcdWidth = (s, k = 1) => Math.max(0, lcdNorm(s).length * 6 - 1) * k;
  // Draw text in LCD pixels at grid (gx, gy); s = CSS px per LCD pixel, k = glyph scale.
  function lcdText(x, str, gx, gy, s, color, k = 1) {
    x.fillStyle = color;
    let cx = gx;
    for (const ch of lcdNorm(str)) {
      const g = FONT5[ch] || FONT5[' '];
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        if (!row) continue;
        for (let c = 0; c < 5; c++) if (row & (16 >> c)) x.fillRect((cx + c * k) * s, (gy + r * k) * s, s * k, s * k);
      }
      cx += 6 * k;
    }
    return cx - gx - k;
  }
  // Signal bars + battery in LCD pixels: 5 bars (2 px wide, heights 2..10) and a 4-segment battery.
  function drawBarsLcd(x, gx, gy, s, lit, mode, segs, blinkSeg, blinkOn, unlit = 'rgba(0,0,0,0.5)') {
    if (mode === 'noservice') lcdText(x, 'NO SERVICE', gx, gy + 3, s, LCD_ON);
    else {
      for (let i = 0; i < 5; i++) {
        const h = 2 + i * 2;
        x.fillStyle = i < lit ? LCD_ON : unlit;
        x.fillRect((gx + i * 3) * s, (gy + 10 - h) * s, 2 * s, h * s);
        if (i >= lit) { x.fillStyle = 'rgba(56,210,198,0.12)'; x.fillRect((gx + i * 3) * s, (gy + 9) * s, 2 * s, s); }
      }
    }
    const bx = gx + (mode === 'noservice' ? 63 : 18), by = gy + 2;
    x.fillStyle = LCD_ON;
    x.fillRect(bx * s, by * s, 15 * s, s); x.fillRect(bx * s, (by + 6) * s, 15 * s, s);
    x.fillRect(bx * s, by * s, s, 7 * s); x.fillRect((bx + 14) * s, by * s, s, 7 * s);
    x.fillRect((bx + 15) * s, (by + 2) * s, s, 3 * s);
    for (let j = 0; j < 4; j++) {
      const on = j < segs || (j === blinkSeg && blinkOn);
      if (!on) continue;
      x.fillStyle = j === blinkSeg && j >= segs ? LCD_MID : LCD_ON;
      x.fillRect((bx + 2 + j * 3) * s, (by + 2) * s, 2 * s, 3 * s);
    }
    return bx + 16 - gx;
  }
  const heartPulse = (t) => {
    const p = (t % 0.46) / 0.46;
    return Math.max(Math.exp(-Math.pow((p - 0.05) / 0.075, 2)), 0.78 * Math.exp(-Math.pow((p - 0.34) / 0.075, 2)));
  };

  // =================================================================================================================
  // init / layout
  // =================================================================================================================
  const E = {};   // persistent elements
  function init() {
    if (inited) return api;
    inited = true;
    host = document.getElementById('ui');
    if (!host) { host = document.createElement('div'); host.id = 'ui'; host.style.cssText = 'position:fixed;inset:0;pointer-events:none;'; document.body.appendChild(host); }
    if (!document.getElementById('ui-style')) { const st = document.createElement('style'); st.id = 'ui-style'; st.textContent = CSS; document.head.appendChild(st); }
    genImages();
    root = mk('div', 'ui-root', host);
    for (const n of ['badge', 'blur', 'stamp', 'lb', 'hud', 'screen', 'kp', 'fade', 'black', 'text', 'skip']) L[n] = mk('div', 'ui-l ui-l-' + n, root);
    menuF = new Fader(opac(L.badge, L.blur, L.stamp, L.hud, L.screen, L.kp, L.text, L.skip), 1);
    L.text.classList.add('ui-sz-m'); subSize = 'm';

    // letterbox (the only thing that slides)
    E.lbT = mk('div', 'ui-lb t', L.lb); E.lbB = mk('div', 'ui-lb b', L.lb);
    lbF = new Fader((v) => {
      const k = +v.toFixed(4);
      E.lbT.style.transform = `translateY(${((k - 1) * 100).toFixed(2)}%)`;
      E.lbB.style.transform = `translateY(${((1 - k) * 100).toFixed(2)}%)`;
      E.lbT.style.visibility = E.lbB.style.visibility = k <= 0.001 ? 'hidden' : 'visible';
    }, 0);

    // HUD: phone bars (+ battery)
    E.bars = mk('div', 'ui-bars', L.hud); E.barsCv = mk('canvas', '', E.bars);
    barsSt.f = new Fader(opac(E.bars), 0);
    // text layer: hud text (prompts, hold, mash), subtitles, message, choice, call
    E.hudText = mk('div', 'ui-hudtext', L.text);
    hudF = new Fader(opac(E.hudText), 1);
    E.prompts = mk('div', 'ui-prompts', E.hudText);
    E.hold = mk('div', 'ui-hold', E.hudText, '<div class="ui-hold-t"></div><div class="ui-hold-l"><div class="ui-hold-f"></div></div>');
    E.mash = mk('div', 'ui-hold ui-mash', E.hudText, '<div class="ui-hold-t"></div><div class="ui-hold-l"><div class="ui-hold-f"></div></div>');
    holdSt.f = new Fader(opac(E.hold), 0); mashSt.f = new Fader(opac(E.mash), 0);
    E.subz = mk('div', 'ui-subz', L.text);
    subSt.els = [mk('div', 'ui-sub', E.subz), mk('div', 'ui-sub', E.subz)];
    subSt.els.forEach((el) => { el._f = new Fader(opac(el), 0); });
    E.msg = mk('div', 'ui-msg', L.text); msgSt.f = new Fader(opac(E.msg), 0);
    E.choice = mk('div', 'ui-choice', L.text); chF = new Fader(opac(E.choice), 0);
    E.call = mk('div', 'ui-call', L.text); E.callCv = mk('canvas', '', E.call); callSt.f = new Fader(opac(E.call), 0);
    // black layer: cards, titles, text on black, NO SIGNAL
    E.card = mk('div', 'ui-card', L.black); blackSt.card = new Fader(opac(E.card), 0);
    E.title = mk('div', 'ui-titlet', L.black); blackSt.title = new Fader(opac(E.title), 0);
    E.tob = mk('div', 'ui-tob', L.black); blackSt.tob = new Fader(opac(E.tob), 0);
    E.nosig = mk('div', 'ui-nosig', L.black, '<div class="ui-nosig-t">NO SIGNAL</div>'); blackSt.nosig = new Fader(opac(E.nosig), 0);
    // skip indicator
    E.skip = mk('div', 'ui-skip', L.skip, '<div class="ui-skip-t">SKIP</div><div class="ui-skip-l"><div class="ui-skip-f"></div></div>');
    skipSt.f = new Fader(opac(E.skip), 0);
    // blur fallback for Unread stings when the WebGL post chain is not running
    E.blur = mk('div', 'ui-blurl', L.blur);
    // film grain (above everything, Menus included)
    E.grain = mk('div', 'ui-grain', host);
    grainSt.f = new Fader((v) => { grainSt.v = v; }, 0);

    layout();
    window.addEventListener('resize', layout);
    lastReal = rnow();
    requestAnimationFrame(selfTick);
    return api;
  }
  const ensure = () => { if (!inited) init(); };

  function layout() {
    if (!root) return;
    const W = Math.max(2, window.innerWidth), H = Math.max(2, window.innerHeight);
    const bar = Math.max(0, (H - W / 2.39) / 2);
    root.style.setProperty('--lbh', bar.toFixed(1) + 'px');
    root.style.setProperty('--subz', Math.max(bar, H * 0.115).toFixed(1) + 'px');
    lcdS = Math.max(2, Math.round(H / 360));
    callS = Math.max(2, Math.floor(H / 420));
    barsSt.key = ''; callSt.key = '';
    if (kpSt.cur && kpSt.cur.cv) kpSize(kpSt.cur);
  }

  // =================================================================================================================
  // update
  // =================================================================================================================
  // UI.update(dt): called by the main loop every frame (after the game systems, before Render.render).
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
    if (t - lastExt < 0.25) return;
    if (!hasGame()) { try { Input.update(); } catch (e) { /* input not ready */ } }
    const d = Math.min(0.1, Math.max(0, t - lastReal));
    lastReal = t;
    tick(d);
  }

  function tick(dt) {
    const menu = menuOpen();
    if (menuF.target !== (menu ? 0 : 1)) menuF.to(menu ? 0 : 1, 0.3);
    const hudWant = hudOn && !kpSt.cur && !scrSt.cur;       // the HUD steps aside for keypads and in-world screens
    if (hudF.target !== (hudWant ? 1 : 0)) hudF.to(hudWant ? 1 : 0, 0.3);
    const kpo = !!(kpSt.cur && kpSt.cur.style !== 'terminal');   // subtitles sit above a lock's controls legend
    if (kpo !== root.classList.contains('kpo')) root.classList.toggle('kpo', kpo);
    for (const f of [...faders]) f.step(dt);
    for (const w of [...waits]) { w.t -= dt; if (w.t <= 0) { waits.delete(w); w.r(); } }
    for (let i = fades.length - 2; i >= 0; i--) { const l = fades[i]; if (l.f.v <= 0.002 && !l.f.busy) { fades.splice(i, 1); l.el.remove(); } }
    const sz = { small: 's', medium: 'm', large: 'l' }[(META && META.options && META.options.subs) || 'medium'] || 'm';
    if (sz !== subSize) { subSize = sz; L.text.classList.remove('ui-sz-s', 'ui-sz-m', 'ui-sz-l'); L.text.classList.add('ui-sz-' + sz); }
    if (!menu) {
      clock += dt;
      tickSubtitle(dt);
      tickMessage(dt);
      tickPrompts(dt);
      tickBadges(dt);
      tickStamps(dt);
      if (chSt.cur) tickChoice(chSt.cur, dt);
      if (kpSt.cur) tickKeypad(kpSt.cur, dt);
      if (scrSt.cur && scrSt.cur.chooser) tickChooser(scrSt.cur, dt);
    }
    if (kpSt.last && kpSt.last !== kpSt.cur) drawKeypad(kpSt.last, dt);
    tickBars(dt, menu);
    tickCall();
    tickMash(dt);
    tickRedLevel(dt);
    tickScreens(dt);
    tickSkip(menu);
    tickGrain(dt);
  }

  // Input captured by a UI overlay (Input.setMenu nests).
  function capOn() { capDepth++; try { Input.setMenu(true); } catch (e) { /* no input */ } }
  function capOff() { if (capDepth <= 0) return; capDepth--; try { Input.setMenu(false); } catch (e) { /* no input */ } }
  const swallow = (...acts) => { try { for (const a of acts) Input.consume(a); } catch (e) { /* no input */ } };
  const pressed = (a) => { try { return Input.pressed(a); } catch (e) { return false; } };
  const typed = () => { try { return Input.typedChars(); } catch (e) { return []; } };

  // =================================================================================================================
  // Subtitles (§7): centred low, #f0ede4, soft shadow, no box, no speaker names; phone voices italic with a faint
  // static wobble; each line in full, no typewriter.
  // =================================================================================================================
  const subSt = { els: [], cur: null, line: null, wobT: 0 };
  // UI.subtitle(text, {italic, phone, speaker, dur}) → Promise resolved when the line is cleared or replaced.
  // Without dur the line stays until clearSubtitle()/the next subtitle (Script times it); CONTRACT+: dur (seconds or
  // 'auto' = U.readTime) makes UI time it itself, and E / Enter / A ends it early.
  function subtitle(text, o = {}) {
    ensure();
    if (text == null || String(text).trim() === '') { clearSubtitle(); return Promise.resolve('cleared'); }
    const spk = String(o.speaker || '');
    const phone = !!(o.phone || /\(phone\)/i.test(spk));
    const italic = !!(o.italic || phone || /\(thought\)/i.test(spk));
    endLine('replaced');
    const old = subSt.cur;
    const next = old === subSt.els[0] ? subSt.els[1] : subSt.els[0];
    const swapping = !!old && old._f.target > 0 && old._f.v > 0.02;
    if (old) old._f.to(0, swapping ? 0.14 : 0.3);
    next.className = 'ui-sub' + (italic ? ' it' : '') + (phone ? ' ph' : '');
    next.style.transform = ''; next.style.filter = '';
    next.innerHTML = fmt(text);
    next._f.jump(0);
    next._f.to(1, 0.3, swapping ? 0.1 : 0);
    subSt.cur = next;
    if (msgSt.active) E.msg.classList.add('up');          // a message already up steps out of the subtitles' way
    const dur = o.dur === 'auto' ? U.readTime(text) : +o.dur || 0;
    return new Promise((r) => { subSt.line = { r, dur, t: 0, el: next }; });
  }
  function endLine(why) { const l = subSt.line; if (l) { subSt.line = null; l.r(why); } }
  function clearSubtitle(fadeDur = 0.3) {
    ensure();
    endLine('cleared');
    const c = subSt.cur;
    if (c) { c._f.to(0, fadeDur); subSt.cur = null; }
  }
  // CONTRACT+: UI.say(text, {italic, phone, speaker, dur='auto'}) → Promise — a whole line as §7 times it: [beat] /
  // [long beat] split it into subtitles with 0.8 s / 2 s silences; each part stays U.readTime or until E.
  let sayTok = 0;
  async function say(text, o = {}) {
    const tok = ++sayTok;                                   // a newer say() or clear() cancels this one
    const parts = String(text ?? '').split(/\[(long beat|beat)\]/i);
    for (let i = 0; i < parts.length; i++) {
      if (tok !== sayTok) return;
      if (i % 2 === 1) { clearSubtitle(); await wait(/long/i.test(parts[i]) ? 2 : 0.8); continue; }
      const t = parts[i].trim();
      if (t) await subtitle(t, { ...o, dur: o.dur ?? 'auto' });
    }
    if (tok === sayTok) clearSubtitle();
  }
  const subVisible = () => !!subSt.cur && subSt.cur._f.target > 0;
  function tickSubtitle(dt) {
    const l = subSt.line;
    if (l && l.dur > 0) {
      l.t += dt;
      if (l.t >= l.dur || (l.t > 0.25 && pressed('confirm'))) { if (l.t < l.dur) swallow('confirm'); if (subSt.cur === l.el) clearSubtitle(0.25); else endLine('done'); }
    }
    const c = subSt.cur;
    if (c && c.classList.contains('ph')) {       // faint static wobble on phone voices
      subSt.wobT -= dt;
      if (subSt.wobT <= 0) {
        subSt.wobT = 0.045 + R() * 0.05;
        const big = R() < 0.05, j = big ? 2.2 : 0.7;
        c.style.transform = `translate(${((R() - 0.5) * j).toFixed(2)}px,${((R() - 0.5) * j * 0.6).toFixed(2)}px)`;
        c.style.filter = R() < 0.07 ? `opacity(${(0.62 + R() * 0.2).toFixed(2)})` : '';
      }
    }
  }

  // =================================================================================================================
  // Messages (§2A): bottom one-liner in serif, no box, 2 s or until E
  // =================================================================================================================
  const msgSt = { f: null, active: false, t: 0, life: 2, r: null };
  // UI.message(text, dur=2) → Promise (CONTRACT+) resolved when it is gone.
  function message(text, dur = 2) {
    ensure();
    if (msgSt.r) { const r = msgSt.r; msgSt.r = null; r(); }
    if (text == null || text === '') { hideMessage(); return Promise.resolve(); }
    E.msg.classList.toggle('up', subVisible());
    E.msg.innerHTML = fmt(text);
    msgSt.active = true; msgSt.t = 0; msgSt.life = +dur > 0 ? +dur : 2;
    msgSt.f.jump(0); msgSt.f.to(1, 0.3);
    return new Promise((r) => { msgSt.r = r; });
  }
  function hideMessage() {
    if (!msgSt.active) return;
    msgSt.active = false;
    msgSt.f.to(0, 0.4);
    if (msgSt.r) { const r = msgSt.r; msgSt.r = null; r(); }
  }
  // CONTRACT+: UI.dismissMessage() → true if a message had been up ≥ 0.2 s and was dismissed. Player/World call it
  // first on an E press so that dismissing "It's locked." doesn't also re-try the door.
  function dismissMessage() { if (msgSt.active && msgSt.t >= 0.2) { hideMessage(); return true; } return false; }
  function tickMessage(dt) {
    if (!msgSt.active) return;
    msgSt.t += dt;
    if (msgSt.t >= msgSt.life || (msgSt.t > 0.25 && pressed('confirm'))) hideMessage();
  }

  // =================================================================================================================
  // Tutorial prompts (§8): lower left, once per id (S.done['prompt:<id>'])
  // =================================================================================================================
  const prompts = [];
  // UI.prompt(text, {id, dur, force, delay}) → true if shown. CONTRACT+: dur (default reading time + 3 s, Infinity =
  // until hidden), UI.prompt(null, {id}) hides that prompt early; {interact} tokens show the current device's key.
  function prompt(text, o = {}) {
    ensure();
    const id = String(o.id ?? text ?? '');
    if (text == null) { for (const p of prompts) if (p.id === id) p.life = Math.min(p.life, p.t); return false; }
    const key = 'prompt:' + id;
    try {
      if (!o.force && S && S.done && S.done[key]) return false;
      if (S && S.done) S.done[key] = true;
    } catch (e) { /* no state */ }
    if (prompts.some((p) => p.id === id && !p.out)) return false;
    let slot = 0;
    while (prompts.some((p) => p.slot === slot)) slot++;
    const el = mk('div', 'ui-prompt', E.prompts, fmt(text));
    el.style.top = (slot * 1.9).toFixed(2) + 'em';
    const p = { id, el, f: new Fader(opac(el), 0), t: 0, life: o.dur ?? Math.max(5, U.readTime(text) + 3), slot, out: false };
    p.f.to(1, 0.5, +o.delay || 0);
    prompts.push(p);
    return true;
  }
  function tickPrompts(dt) {
    for (const p of prompts.slice()) {
      p.t += dt;
      if (!p.out && p.t >= p.life) {
        p.out = true;
        p.f.to(0, 0.6).then(() => { p.el.remove(); const i = prompts.indexOf(p); if (i >= 0) prompts.splice(i, 1); });
      }
    }
  }

  // =================================================================================================================
  // Hold prompt and the struggle mash
  // =================================================================================================================
  const holdSt = { f: null, text: null };
  // UI.holdPrompt(text|null, progress 0..1): text + a thin progress line (call every frame while it applies).
  function holdPrompt(text, progress = 0) {
    ensure();
    if (text == null) { if (holdSt.f.target !== 0) holdSt.f.to(0, 0.35); holdSt.text = null; return; }
    if (text !== holdSt.text) { holdSt.text = text; E.hold.firstChild.innerHTML = fmt(text); }
    if (holdSt.f.target !== 1) holdSt.f.to(1, 0.3);
    E.hold.querySelector('.ui-hold-f').style.transform = `scaleX(${clamp(+progress || 0).toFixed(4)})`;
  }
  const mashSt = { f: null, text: null, last: 0, pulse: 0 };
  // CONTRACT+: UI.mash(progress|null, {text}) — struggle feedback (spec §6 Tethered: mash E for 1.5 s): a line of
  // text and a filling line that brightens with each press. null hides it.
  function mash(progress, o = {}) {
    ensure();
    if (progress == null) { if (mashSt.f.target !== 0) mashSt.f.to(0, 0.35); mashSt.last = 0; return; }
    const text = o.text || 'Tap {interact} to break free';
    if (text !== mashSt.text) { mashSt.text = text; E.mash.firstChild.innerHTML = fmt(text); }
    if (mashSt.f.target !== 1) mashSt.f.to(1, 0.2);
    const p = clamp(+progress || 0);
    if (p > mashSt.last + 1e-4) mashSt.pulse = 1;
    mashSt.last = p;
    E.mash.querySelector('.ui-hold-f').style.transform = `scaleX(${p.toFixed(4)})`;
  }
  function tickMash(dt) {
    if (mashSt.pulse <= 0.001 && !mashSt.f.busy) return;
    mashSt.pulse = Math.max(0, mashSt.pulse - dt * 5);
    E.mash.style.filter = mashSt.pulse > 0.01 ? `brightness(${(1 + mashSt.pulse * 0.7).toFixed(3)})` : '';
  }

  // =================================================================================================================
  // Letterbox (2.39:1 bars — the one thing that slides) and fades
  // =================================================================================================================
  // UI.letterbox(on, dur=0.6) → Promise
  function letterbox(on, dur = 0.6) { ensure(); return lbF.to(on ? 1 : 0, dur, 0, U.ease.inOut); }

  const fades = [];
  function fadeLayer(color) {
    const el = mk('div', 'ui-fadel', L.fade);
    el.style.background = color;
    const o = { el, color, f: null };
    o.f = new Fader(opac(el), 0);
    fades.push(o);
    return o;
  }
  // UI.fade(to 0..1, dur=0.5, color='#000') → Promise. Black, white or any colour; also used for room transitions.
  // Changing colour while a fade is up cross-fades to the new colour.
  function fade(to = 1, dur = 0.5, color = '#000') {
    ensure();
    to = clamp(+to || 0); color = color || '#000';
    let top = fades[fades.length - 1];
    if (!top) top = fadeLayer(color);
    if (to <= 0.001) return Promise.all(fades.map((l) => l.f.to(0, dur))).then(() => {});   // clearing: every layer goes
    if (top.color !== color) {
      if (top.f.v <= 0.002 && !top.f.busy) { top.color = color; top.el.style.background = color; }
      else {
        const below = fades.slice();
        top = fadeLayer(color);
        if (to < 1) for (const b of below) b.f.to(0, dur);
        const mine = top;
        const p = top.f.to(to, dur);
        p.then(() => {
          if (fades[fades.length - 1] !== mine || mine.f.busy) return;
          for (const b of below) { const i = fades.indexOf(b); if (i >= 0) { fades.splice(i, 1); b.el.remove(); } }
        });
        return p;
      }
    }
    return top.f.to(to, dur);
  }
  const fadeLevel = () => { const t = fades[fades.length - 1]; return t ? t.f.v : 0; };

  // =================================================================================================================
  // Cards and text on black
  // =================================================================================================================
  const blackSt = { card: null, title: null, tob: null, nosig: null, token: 0, titleTok: 0 };
  // card / text on black / NO SIGNAL share the black screen: starting one fades the others away
  const blackOnly = (keep) => { for (const k of ['card', 'tob', 'nosig']) if (k !== keep && blackSt[k].target > 0) blackSt[k].to(0, 0.3); };
  // UI.card(title, {sub, dur=4, clear=false}) → Promise. Chapter / area card: the screen goes black, the title fades in
  // in widely spaced serif capitals, holds `dur` s, fades out. The screen is LEFT BLACK (the room change that follows
  // fades in); CONTRACT+ clear:true fades back to the game instead.
  async function card(title, o = {}) {
    ensure();
    const tok = ++blackSt.token, live = () => tok === blackSt.token;   // a newer black-screen text or clear() cancels
    blackOnly('card');
    await fade(1, o.fadeIn ?? 0.8, '#000');
    if (!live()) return;
    E.card.innerHTML = `<div class="ui-card-t">${fmt(title)}</div>` + (o.sub ? `<div class="ui-card-s">${fmt(o.sub)}</div>` : '');
    await wait(0.3);
    if (live()) await blackSt.card.to(1, 1.4);
    if (live()) await wait(o.dur ?? 4);
    if (live()) await blackSt.card.to(0, 1.3);
    if (live()) await wait(0.35);
    if (o.clear && live()) await fade(0, 0.8);
  }
  // UI.titleText(text, {dur=3, sub}) → Promise (CONTRACT+): a title over the image ("SIGNAL HILL fades up and out").
  async function titleText(text, o = {}) {
    ensure();
    const tok = ++blackSt.titleTok, live = () => tok === blackSt.titleTok;
    E.title.innerHTML = `<div class="ui-card-t">${fmt(text)}</div>` + (o.sub ? `<div class="ui-card-s">${fmt(o.sub)}</div>` : '');
    await blackSt.title.to(1, o.fadeIn ?? 1.8);
    if (live()) await wait(o.dur ?? 3);
    if (live()) await blackSt.title.to(0, o.fadeOut ?? 1.8);
  }
  // UI.textOnBlack(text, dur) → Promise: sentence-case serif on black; the screen is left black.
  async function textOnBlack(text, dur) {
    ensure();
    const tok = ++blackSt.token, live = () => tok === blackSt.token;
    blackOnly('tob');
    await fade(1, 0.8, '#000');
    if (!live()) return;
    E.tob.innerHTML = `<div class="ui-tob-t">${fmt(text)}</div>`;
    await wait(0.4);
    if (live()) await blackSt.tob.to(1, 1.3);
    if (live()) await wait(dur ?? Math.max(3, U.readTime(text) * 1.4));
    if (live()) await blackSt.tob.to(0, 1.3);
    if (live()) await wait(0.3);
  }
  // UI.noSignal({dur=3, tone=false, keep=false, cut=true}) → Promise: death — black, then "NO SIGNAL" small and
  // centred for 3 s. The screen is left black for Menus' death options. tone:true plays the flat disconnected tone.
  async function noSignal(o = {}) {
    ensure();
    const tok = ++blackSt.token, live = () => tok === blackSt.token;
    blackOnly('nosig');
    await fade(1, o.cut === false ? 0.5 : 0, '#000');
    if (o.tone && live()) sfx('disconnected', { dur: (o.dur ?? 3) + 0.8 });
    if (live()) await wait(o.delay ?? 0.4);
    if (live()) await blackSt.nosig.to(1, 0.45);
    if (live()) await wait(o.dur ?? 3);
    if (!o.keep && live()) await blackSt.nosig.to(0, 0.5);
  }

  // =================================================================================================================
  // Choice (§7): up to three options in a quiet vertical list; timed choices show a subtle timer
  // =================================================================================================================
  let chF = null;
  const chSt = { cur: null };
  // UI.choice(options, {timer, def=0, start=0, cancel, title, caps}) → Promise<index>. On timeout resolves `def`.
  // CONTRACT+: cancel (index returned on Esc / B), title (a line above the list, e.g. "Pick up the receiver?"),
  // caps (menu-style capitals). Keyboard (W/S, arrows, 1–9), mouse and gamepad; UI tick/click sounds.
  function choice(options, o = {}) {
    ensure();
    if (chSt.cur) endChoice(chSt.cur, chSt.cur.def, true);
    const opts = (options || []).map((s) => String(s));
    if (!opts.length) return Promise.resolve(-1);
    E.choice.innerHTML = '';
    if (o.title) mk('div', 'ui-ch-title', E.choice, fmt(o.title));
    const c = {
      opts, items: [], sel: clamp(o.start | 0, 0, opts.length - 1), timer: +o.timer || 0, left: +o.timer || 0,
      def: clamp(o.def == null ? 0 : o.def | 0, 0, opts.length - 1), cancel: o.cancel == null ? null : clamp(o.cancel | 0, 0, opts.length - 1),
      t: 0, r: null, timerEl: null,
    };
    c.items = opts.map((txt, i) => {
      const it = mk('div', 'ui-ch-it' + (/^\s*\[.*\]\s*$/.test(txt) ? ' br' : ''), E.choice);
      mk('span', '', it, fmt(o.caps ? txt.toUpperCase() : txt));
      it.addEventListener('mouseenter', () => { if (chSt.cur === c && c.sel !== i) { c.sel = i; sfx('ui_move'); paintChoice(c); } });
      it.addEventListener('mousedown', (e) => { e.preventDefault(); if (chSt.cur === c && c.t > 0.2 && e.button === 0) { c.sel = i; pickChoice(c, i); } });
      return it;
    });
    if (c.timer > 0) c.timerEl = mk('div', 'ui-ch-timer', E.choice);
    chSt.cur = c;
    paintChoice(c);
    chF.to(1, 0.35);
    capOn();
    swallow('confirm', 'cancel');
    return new Promise((r) => { c.r = r; });
  }
  function paintChoice(c) { c.items.forEach((it, i) => it.classList.toggle('sel', i === c.sel)); }
  function pickChoice(c, i) { sfx('ui_confirm'); endChoice(c, i); }
  function endChoice(c, i) {
    if (chSt.cur !== c) return;
    chSt.cur = null;
    capOff();
    chF.to(0, 0.3);
    swallow('confirm', 'cancel');
    if (c.r) c.r(i);
  }
  function tickChoice(c, dt) {
    c.t += dt;
    if (c.timer > 0) {
      c.left = Math.max(0, c.left - dt);
      const k = c.left / c.timer;
      c.timerEl.style.transform = `scaleX(${k.toFixed(4)})`;
      c.timerEl.style.background = k < 0.3 ? '#7d4a44' : '#6f6f6a';
      if (c.left <= 0) { endChoice(c, c.def); return; }
    }
    if (c.t < 0.15) return;
    const n = c.opts.length;
    if (pressed('up') || pressed('left')) { c.sel = (c.sel + n - 1) % n; sfx('ui_move'); paintChoice(c); }
    else if (pressed('down') || pressed('right')) { c.sel = (c.sel + 1) % n; sfx('ui_move'); paintChoice(c); }
    for (const ch of typed()) { const d = +ch; if (/^[1-9]$/.test(ch) && d <= n) { c.sel = d - 1; paintChoice(c); pickChoice(c, d - 1); return; } }
    if (pressed('confirm')) pickChoice(c, c.sel);
    else if (c.cancel != null && pressed('cancel')) { sfx('ui_cancel'); c.sel = c.cancel; endChoice(c, c.cancel); }
  }

  // =================================================================================================================
  // Incoming call prompt (§4: 8 s window, E answer / Q decline) in the phone's teal-on-black LCD style
  // =================================================================================================================
  const callSt = { f: null, text: null, t0: 0, win: 8, key: '' };
  // UI.callPrompt(callerText|null, {window=8}) — display only; Phone handles the ring, the window and the keys.
  function callPrompt(text, o = {}) {
    ensure();
    if (text == null) { if (callSt.f.target !== 0) callSt.f.to(0, 0.35); callSt.text = null; return; }
    callSt.text = String(text); callSt.t0 = clock; callSt.win = +o.window > 0 ? +o.window : 8; callSt.key = '';
    if (callSt.f.target !== 1) callSt.f.to(1, 0.3);
    tickCall();
  }
  function tickCall() {
    if (!callSt.text && callSt.f.v <= 0) return;
    if (!callSt.text) return;
    const t = clock - callSt.t0, ph = t % 3;
    const blink = ph < 0.4 || (ph >= 0.6 && ph < 1.0);
    const rem = clamp(1 - t / callSt.win);
    const s = callS, big = lcdWidth(callSt.text, 2) <= 128;
    const hint = `${label('interact')} ANSWER · ${label('decline')} DECLINE`;
    const W = Math.max(lcdWidth('INCOMING CALL'), lcdWidth(callSt.text, big ? 2 : 1), lcdWidth(hint)) + 12;
    const H = big ? 47 : 40;
    const key = `${W}|${H}|${s}|${blink}|${Math.round(rem * (W - 12))}|${hint}`;
    if (key === callSt.key) return;
    callSt.key = key;
    const cv = E.callCv;
    if (cv.width !== W * s || cv.height !== H * s) { cv.width = W * s; cv.height = H * s; cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; }
    const x = cv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    const cx = (str, k = 1) => Math.round((W - lcdWidth(str, k)) / 2);
    if (blink) lcdText(x, 'INCOMING CALL', cx('INCOMING CALL'), 4, s, LCD_MID);
    lcdText(x, callSt.text, cx(callSt.text, big ? 2 : 1), 15, s, LCD_ON, big ? 2 : 1);
    const hy = big ? 33 : 26;
    lcdText(x, hint, cx(hint), hy, s, LCD_MID);
    const lw = Math.round(rem * (W - 12));
    x.fillStyle = LCD_DIM; x.fillRect(Math.round((W - lw) / 2) * s, (H - 3) * s, lw * s, s);
  }

  // =================================================================================================================
  // Phone signal bars (§4): 0–5, the only image besides item models; modes normal | pulse | none | noservice
  // =================================================================================================================
  const barsSt = { f: null, n: 0, mode: 'normal', batt: 1, segs: 4, blinkSeg: -1, blinkT: 0, active: -99, battAt: -99, key: '', forceShow: 0 };
  // UI.bars(n, {mode:'normal'|'pulse'|'none'|'noservice', battery 0..1}). Cheap to call every frame. The indicator fades in
  // while bars > 0 (or pulse / NO SERVICE) and out ~2.5 s after it goes idle; losing a battery notch blinks it and
  // shows the indicator for 4 s (the Standard's tell). Hidden while the letterbox is down or the HUD is off.
  function bars(n, o = {}) {
    ensure();
    barsSt.n = clamp(Math.round(+n || 0), 0, 5);
    barsSt.mode = ['normal', 'pulse', 'none', 'noservice'].includes(o.mode) ? o.mode : 'normal';
    if (o.battery != null) {
      const b = clamp(+o.battery), segs = Math.max(0, Math.ceil(b * 4 - 1e-6));
      if (segs < barsSt.segs) { barsSt.blinkSeg = segs; barsSt.blinkT = 1.4; barsSt.battAt = clock; }
      barsSt.batt = b; barsSt.segs = segs;
    }
    if (barsSt.mode === 'pulse' || barsSt.mode === 'noservice' || barsSt.n > 0) barsSt.active = clock;
  }
  function tickBars(dt, menu) {
    const b = barsSt;
    if (!menu) b.blinkT = Math.max(0, b.blinkT - dt);
    const want = hudF.target > 0 && lbF.v < 0.5 && b.mode !== 'none' &&
      (b.n > 0 || b.mode === 'pulse' || b.mode === 'noservice' || clock - b.active < 2.5 || clock - b.battAt < 4);
    if (b.f.target !== (want ? 1 : 0)) b.f.to(want ? 1 : 0, want ? 0.35 : 0.8);
    if (b.f.v <= 0 && !want) return;
    const s = lcdS, lit = b.mode === 'pulse' ? Math.round(heartPulse(clock) * 5) : b.n;
    const blinkOn = b.blinkT > 0 && Math.floor(b.blinkT * 6) % 2 === 0;
    const key = `${s}|${lit}|${b.mode}|${b.segs}|${b.blinkT > 0 ? b.blinkSeg : -1}|${blinkOn}`;
    if (key === b.key) return;
    b.key = key;
    const W = b.mode === 'noservice' ? 80 : 35, H = 11, cv = E.barsCv;
    if (cv.width !== W * s || cv.height !== H * s) { cv.width = W * s; cv.height = H * s; cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; }
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    drawBarsLcd(x, 0, 0, s, lit, b.mode, b.segs, b.blinkT > 0 ? b.blinkSeg : -1, blinkOn);
  }

  // =================================================================================================================
  // Unread badges (§6): red notification badges on the lens that blur vision for 6 s, up to 5 stacked
  // =================================================================================================================
  const badgeSt = { list: [], level: 0, wrote: false, seed: 1 };
  const BADGE_NUMS = ['1', '2', '3', '4', '7', '9', '12', '18', '24', '41', '99+'];
  function badgeCanvas(num) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 60, 128, 128, 127);
    g.addColorStop(0, 'rgba(255,40,28,0.55)'); g.addColorStop(1, 'rgba(255,40,28,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.beginPath(); x.arc(128, 128, 80, 0, TAU); x.fillStyle = '#d8231a'; x.fill();
    const hl = x.createRadialGradient(108, 96, 4, 128, 128, 80);
    hl.addColorStop(0, 'rgba(255,150,130,0.55)'); hl.addColorStop(0.6, 'rgba(255,90,70,0.08)'); hl.addColorStop(1, 'rgba(90,0,0,0.35)');
    x.fillStyle = hl; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,215,205,0.55)'; x.stroke();
    x.fillStyle = '#fff4f0'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${num.length > 2 ? 64 : num.length > 1 ? 84 : 100}px ${ARIAL}`;
    x.fillText(num, 128, 134);
    return c;
  }
  function makeBadge(life, managed) {
    const i = badgeSt.seed++;
    const r = U.rng(i * 7919 + 13);
    const c = badgeCanvas(BADGE_NUMS[Math.floor(r() * BADGE_NUMS.length)]);
    c.className = 'ui-badge';
    const size = 13 + r() * 10;
    c.style.width = c.style.height = size.toFixed(2) + 'vh';
    const a = i * 2.39996 + r() * 0.5, rad = 10 + r() * 20;   // golden-angle spread around the centre of vision
    c.style.left = (50 + Math.cos(a) * rad * 1.25).toFixed(2) + 'vw';
    c.style.top = (46 + Math.sin(a) * rad).toFixed(2) + 'vh';
    c.style.filter = `blur(${(0.25 + r() * 0.45).toFixed(2)}vh) saturate(1.1)`;
    L.badge.appendChild(c);
    const b = { el: c, f: new Fader(opac(c), 0), t: 0, life, managed, out: false };
    b.f.to(0.88, 0.12);
    return b;
  }
  function removeBadge(b, dur = 1.2) {
    if (b.out) return;
    b.out = true;
    b.f.to(0, dur).then(() => { b.el.remove(); const i = badgeSt.list.indexOf(b); if (i >= 0) badgeSt.list.splice(i, 1); });
  }
  // CONTRACT+: UI.sting({life=6}) — one Unread sting: a badge that lasts `life` s (max 5; a 6th refreshes the oldest).
  function sting(o = {}) {
    ensure();
    const own = badgeSt.list.filter((b) => !b.managed && !b.out);
    if (own.length >= 5) { own[0].t = 0; own[0].life = o.life ?? 6; }
    else badgeSt.list.push(makeBadge(o.life ?? 6, false));
    return badgeSt.list.filter((b) => !b.out).length;
  }
  // UI.badges(n) — set the number of badges exactly (the caller times them; 0 clears). UI.badges() → current count.
  function badges(n) {
    ensure();
    const live = badgeSt.list.filter((b) => !b.out);
    if (n === undefined) return live.length;
    n = clamp(n | 0, 0, 5);
    if (n === 0) { for (const b of live) removeBadge(b, 0.8); return 0; }
    const managed = live.filter((b) => b.managed);
    for (let i = managed.length; i < n; i++) badgeSt.list.push(makeBadge(Infinity, true));
    for (let i = n; i < managed.length; i++) removeBadge(managed[i], 1.0);
    return n;
  }
  function tickBadges(dt) {
    for (const b of badgeSt.list) {
      if (b.out || b.managed) continue;
      b.t += dt;
      if (b.t >= b.life - 1.2) removeBadge(b, Math.max(0.2, b.life - b.t));
    }
  }
  // The badges' red tint + blur go through the WebGL post chain (Render.post.redBadge); CSS backdrop blur otherwise.
  function tickRedLevel(dt) {
    const n = badgeSt.list.filter((b) => !b.out).length;
    const want = Math.min(1, n * 0.2);
    badgeSt.level = U.damp(badgeSt.level, want, want > badgeSt.level ? 10 : 2.5, dt);
    if (badgeSt.level < 0.004 && want === 0) badgeSt.level = 0;
    if (renderLive()) {
      if (badgeSt.level > 0 || badgeSt.wrote) { Render.post.redBadge = +badgeSt.level.toFixed(4); badgeSt.wrote = badgeSt.level > 0; }
      if (E.blur.style.visibility !== 'hidden') E.blur.style.visibility = 'hidden';
    } else {
      const v = badgeSt.level;
      E.blur.style.visibility = v > 0.004 ? 'visible' : 'hidden';
      if (v > 0.004) { E.blur.style.backdropFilter = `blur(${(v * 7).toFixed(2)}px)`; E.blur.style.background = `rgba(120,0,0,${(v * 0.12).toFixed(3)})`; }
    }
  }

  // =================================================================================================================
  // Stamps (§6): the Closer's signatures (three = signed) and the Smile's red "SIGNED"
  // =================================================================================================================
  const stampSt = { sigs: [], flashes: [], count: 0, seed: 3 };
  function stampCanvas(text) {
    const W = 900, H = 330, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), r = U.rng(U.hash(text) + stampSt.seed * 31), ink = '#b3141b';
    x.strokeStyle = ink; x.fillStyle = ink;
    x.lineWidth = 15; x.strokeRect(24, 24, W - 48, H - 48);
    x.lineWidth = 5; x.strokeRect(50, 50, W - 100, H - 100);
    let fs = 170;
    x.font = `900 ${fs}px ${HEAVY}`;
    const sp = 0.08;
    const measure = () => { let w = 0; for (const ch of text) w += x.measureText(ch).width; return w + sp * fs * (text.length - 1); };
    while (measure() > W - 170 && fs > 40) { fs -= 6; x.font = `900 ${fs}px ${HEAVY}`; }
    x.textBaseline = 'middle';
    let cx = (W - measure()) / 2;
    for (const ch of text) { x.fillText(ch, cx, H / 2 + fs * 0.04 + (r() - 0.5) * 3); cx += x.measureText(ch).width + sp * fs; }
    // worn rubber: ink starvation, specks, a dry edge
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { x.globalAlpha = 0.25 + r() * 0.75; x.beginPath(); x.arc(r() * W, r() * H, 0.6 + r() * 2.4, 0, TAU); x.fill(); }
    x.globalAlpha = 0.45; x.drawImage(grime(), 0, 0, W, H);
    for (let i = 0; i < 7; i++) { x.globalAlpha = 0.18 + r() * 0.25; x.beginPath(); x.ellipse(r() * W, r() * H, 40 + r() * 140, 8 + r() * 30, r() * 3, 0, TAU); x.fill(); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    return c;
  }
  // A signature, drawn as pen strokes (no font needed): a looping capital, a run of humps with one ascender, a
  // flourish back underneath, and the dotted line with an × it was signed on.
  function sigCanvas(seed) {
    const W = 760, H = 250, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), r = U.rng(seed * 977 + 5), ink = '#161f5c';
    x.strokeStyle = 'rgba(20,26,70,0.55)'; x.lineWidth = 2;
    x.setLineDash([6, 5]); x.beginPath(); x.moveTo(70, 205); x.lineTo(700, 205); x.stroke(); x.setLineDash([]);
    x.lineWidth = 3; x.beginPath(); x.moveTo(38, 186); x.lineTo(56, 204); x.moveTo(56, 186); x.lineTo(38, 204); x.stroke();
    const jit = (a = 6) => (r() - 0.5) * a;
    const strokes = [];
    const ax = 96 + r() * 24, capH = 26 + r() * 30, capW = 44 + r() * 26;
    // the capital: a tall peak with a looping crossbar (or a closed loop on some seeds)
    const cap = [[ax, 182], [ax + capW * 0.45 + jit(), 110], [ax + capW + jit(), capH], [ax + capW * 1.25, 110 + jit()], [ax + capW * 1.5, 180]];
    if (r() < 0.5) cap.push([ax + capW * 1.1, 150], [ax + capW * 0.5, 126], [ax + capW * 2.1, 112]);
    else cap.push([ax + capW * 1.7, 132], [ax + capW * 0.9, 118 + jit()], [ax + capW * 2.0, 128]);
    strokes.push(cap);
    // the run of the name: humps of varying size, one or two ascenders, then a flourish back underneath
    const run = [];
    let px = ax + capW * 2.0, py = 150;
    const humps = 4 + Math.floor(r() * 4), amp = 26 + r() * 26, step = 26 + r() * 14;
    const tallA = 1 + Math.floor(r() * (humps - 1)), tallB = r() < 0.4 ? Math.min(humps - 1, tallA + 2) : -1;
    run.push([px, py]);
    for (let i = 0; i < humps; i++) {
      const tall = i === tallA || i === tallB;
      const top = tall ? 40 + jit(14) : 150 - amp + jit(10);
      run.push([px + step * 0.35, top], [px + step * 0.7, tall ? top + 20 : top + 8], [px + step * 0.85, 158 + jit(8)]);
      px += step + jit(6);
    }
    const fl = r();
    if (fl < 0.45) run.push([px + 36, 136], [px + 110 + jit(20), 188], [px + 30, 216], [ax + 40, 202 + jit()], [ax - 24, 176]);
    else if (fl < 0.8) run.push([px + 30, 148], [px + 70, 120], [px + 40, 190], [px - 60, 214 + jit()], [ax + 10, 200]);
    else run.push([px + 26, 150], [px + 140, 176 + jit(10)], [px + 190, 150]);
    strokes.push(run);
    if (r() < 0.6) strokes.push([[ax + capW * 1.6 + jit(20), 96 + jit(10)], [ax + capW * 1.6 + 6, 92]]);   // a dot / tick
    const slant = -0.1 + r() * 0.35;
    x.setTransform(1, 0, -slant, 1, slant * 170, 0);
    x.strokeStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round';
    x.shadowColor = 'rgba(22,31,92,0.65)'; x.shadowBlur = 1.8;
    for (const pts of strokes) {
      // Catmull-Rom through the points, drawn in short segments so pen pressure can vary
      const seg = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let k = 0; k < 12; k++) {
          const t = k / 12, t2 = t * t, t3 = t2 * t;
          seg.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
        }
      }
      seg.push(pts[pts.length - 1]);
      for (let i = 1; i < seg.length; i++) {
        const u = i / seg.length;
        x.lineWidth = 3 + 5.2 * Math.sin(Math.PI * Math.min(1, u * 1.12)) * (0.8 + r() * 0.3);
        x.beginPath(); x.moveTo(seg[i - 1][0], seg[i - 1][1]); x.lineTo(seg[i][0], seg[i][1]); x.stroke();
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }
  const SIG_SLOTS = [[30, 60, -6], [66, 38, 4], [46, 22, -3], [24, 32, 7], [70, 66, -8], [50, 50, 2]];
  // UI.stamp(text|null, {count, max=3, dur=1.1, auto=true}).
  //   stamp('SIGNED')                 → the red rubber stamp flashes on screen (instant, holds `dur`, fades).
  //   stamp('signature', {count:n})  → the Closer's signatures: exactly n pen signatures stay on the lens; reaching
  //                                     `max` also flashes "SIGNED" (auto:false to skip). Returns the count.
  //   stamp(null)                     → clear everything.
  function stamp(text, o = {}) {
    ensure();
    if (text == null) {
      for (const s of stampSt.sigs) s.f.to(0, 0.5).then(() => s.el.remove());
      stampSt.sigs = []; stampSt.count = 0;
      for (const f of stampSt.flashes) f.life = Math.min(f.life, f.t);
      return 0;
    }
    if (o.count != null) {
      const want = clamp(o.count | 0, 0, SIG_SLOTS.length), before = stampSt.sigs.length;
      while (stampSt.sigs.length > want) { const s = stampSt.sigs.pop(); s.f.to(0, 0.5).then(() => s.el.remove()); }
      while (stampSt.sigs.length < want) {
        const i = stampSt.sigs.length, sl = SIG_SLOTS[i];
        const c = sigCanvas(++stampSt.seed);
        c.className = 'ui-sig';
        c.style.left = sl[0] + 'vw'; c.style.top = sl[1] + 'vh';
        c.style.transform = `translate(-50%,-50%) rotate(${sl[2] + (R() - 0.5) * 3}deg)`;
        L.stamp.appendChild(c);
        const s = { el: c, f: new Fader(opac(c), 0) };
        s.f.to(0.92, 0.18);
        stampSt.sigs.push(s);
      }
      if (want > before) { sfx('scribble', { dur: 0.45 }); sfx('stamp', { vol: 0.7 }); }
      stampSt.count = want;
      if (o.auto !== false && want >= (o.max ?? 3) && before < want) wait(0.45).then(() => stamp('SIGNED', { dur: o.dur }));
      return want;
    }
    const c = stampCanvas(String(text).toUpperCase());
    c.className = 'ui-stamp';
    c.style.transform = `translate(-50%,-50%) rotate(${(-8 + (R() - 0.5) * 5).toFixed(2)}deg)`;
    L.stamp.appendChild(c);
    const f = { el: c, f: new Fader(opac(c), 0), t: 0, life: o.dur ?? 1.1, out: false };
    f.f.jump(0.94);
    stampSt.flashes.push(f);
    sfx('stamp');
    return stampSt.count;
  }
  function tickStamps(dt) {
    for (const f of stampSt.flashes.slice()) {
      f.t += dt;
      if (!f.out && f.t >= f.life) {
        f.out = true;
        f.f.to(0, 0.55).then(() => { f.el.remove(); const i = stampSt.flashes.indexOf(f); if (i >= 0) stampSt.flashes.splice(i, 1); });
      }
    }
  }

  // =================================================================================================================
  // In-world screens: 'crm' / 'case' (a retro CRM on a CRT), 'terminal' (phosphor text), 'phone' (Aidan's phone)
  // =================================================================================================================
  const scrSt = { cur: null };
  const SCR_STYLES = ['crm', 'case', 'terminal', 'phone'];
  function buildScreen(style, o, parent) {
    const s = { style, o, root: mk('div', 'ui-scr ui-scr-' + style, parent), staticLv: 0, pulse: null, gl: null, chooser: null, flashTok: 0, statT: 0, flickT: 0 };
    if (style === 'phone') {
      s.bezel = mk('div', 'ph-body', s.root);
      mk('div', 'ph-ear', s.bezel);
      s.glass = mk('div', 'ui-scr-glass', s.bezel);
      s.app = mk('div', 'ph-app', s.glass);
      s.statusBar = mk('div', 'ph-status', s.app);
      s.statusCv = mk('canvas', '', s.statusBar);
      s.clock = mk('canvas', '', s.statusBar);
      s.body = mk('div', 'ph-content', s.app);
      mk('div', 'ph-keys', s.bezel, '<b class="g"></b><b></b><b class="r"></b>' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => `<b>${k}</b>`).join(''));
      s.phoneBars = o.bars ?? null;
      paintPhoneStatus(s);
    } else {
      s.bezel = mk('div', 'ui-scr-bezel', s.root);
      s.glass = mk('div', 'ui-scr-glass', s.bezel);
      s.app = mk('div', 'ui-scr-app', s.glass);
      if (style === 'terminal') s.body = s.app;
      else {
        const wm = wordmarkUrl();
        const title = mk('div', 'crm-title', s.app);
        if (wm) mk('img', '', title).src = wm;
        mk('span', 'crm-title-t', title, esc(o.title ?? (style === 'case' ? 'RETAIL CRM 4.2 — CASE MANAGEMENT' : 'RETAIL CRM 4.2 — CUSTOMER RECORDS')));
        if (o.store) mk('span', 'crm-store', title, esc(o.store));
        mk('div', 'crm-menu', s.app, '<u>F</u>ile <u>E</u>dit <u>C</u>ustomer C<u>a</u>se <u>R</u>eports <u>W</u>indow <u>H</u>elp');
        s.body = mk('div', 'crm-body', s.app);
        s.status = mk('div', 'crm-status', s.app);
        s.status.innerHTML = `<span>${esc(o.status ?? 'Connected — STORE SERVER')}</span><span>USER: ${esc(o.user ?? 'AIDAN')}</span>`;
      }
      s.scan = mk('div', 'scr-scan', s.glass); s.scan.style.backgroundImage = `url(${IMG.scan})`;
      mk('div', 'scr-led', s.bezel);
      mk('div', 'scr-sheen', s.glass);
      mk('div', 'scr-vig', s.glass);
    }
    s.stat = mk('div', 'scr-static', s.glass);
    s.tears = [0, 1, 2].map(() => mk('div', 'scr-tear', s.glass));
    s.handle = screenHandle(s);
    return s;
  }
  function paintPhoneStatus(s) {
    const lc = lcdS, mode = s.phoneBars === 'noservice' ? 'noservice' : 'normal';
    const n = typeof s.phoneBars === 'number' ? clamp(s.phoneBars | 0, 0, 5) : barsSt.n;
    const W = mode === 'noservice' ? 80 : 35, cv = s.statusCv;
    cv.width = W * lc; cv.height = 11 * lc; cv.style.width = W * lc + 'px'; cv.style.height = 11 * lc + 'px';
    const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
    drawBarsLcd(x, 0, 0, lc, n, mode, barsSt.segs, -1, false, '#0b3431');
    const ck = s.clock, cw = lcdWidth('--:--');
    ck.width = cw * lc; ck.height = 11 * lc; ck.style.width = cw * lc + 'px'; ck.style.height = 11 * lc + 'px';
    lcdText(ck.getContext('2d'), '--:--', 0, 2, lc, LCD_ON);
  }
  // CONTRACT+: UI.crmHtml(spec, style) → HTML for the CRM/case layout (UI.screen accepts the spec object directly):
  //   { heading, search, searchLabel, fields:[[label, value|null (a field full of static)]], panel:{title, lines[], alert},
  //     history:[[cells…]], historyTitle, text, buttons:[labels] (UI.screen(...).choose() picks one), html }
  function crmHtml(sp) {
    if (sp == null) return '';
    if (typeof sp === 'string') return sp;
    let h = '';
    if (sp.heading) h += `<div class="crm-h">${esc(sp.heading)}</div>`;
    if (sp.search != null) h += `<div class="crm-row"><span class="crm-k">${esc(sp.searchLabel || 'ACCOUNT NO.')}</span><span class="crm-v">${esc(sp.search)}<i class="crm-caret"></i></span><span class="crm-btn crm-find">Search</span></div>`;
    if (sp.fields) h += sp.fields.map(([k, v]) => `<div class="crm-row"><span class="crm-k">${esc(k)}</span><span class="crm-v${v == null ? ' crm-static' : ''}">${v == null ? '&nbsp;' : esc(v)}</span></div>`).join('');
    if (sp.panel) {
      const p = typeof sp.panel === 'string' ? { text: sp.panel } : sp.panel;
      h += `<div class="crm-panel">${p.title ? `<div class="crm-panel-t">${esc(p.title)}</div>` : ''}${(p.lines || []).map((l) => `<div>${esc(l)}</div>`).join('')}${p.text ? `<div>${esc(p.text)}</div>` : ''}</div>`;
    }
    if (sp.history) h += `<div class="crm-sub">${esc(sp.historyTitle || 'STATUS HISTORY')}</div><table class="crm-tab">${sp.history.map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
    if (sp.text) h += `<div class="crm-text">${fmt(sp.text)}</div>`;
    if (sp.buttons) h += `<div class="crm-btns">${sp.buttons.map((b) => `<span class="crm-btn">${esc(b)}</span>`).join('')}</div>`;
    if (sp.html) h += sp.html;
    return h;
  }
  function phoneHtml(sp) {
    if (sp == null) return '';
    if (typeof sp === 'string') return sp;
    let h = '';
    if (sp.title) h += `<div class="ph-dim">${esc(sp.title)}</div>`;
    if (sp.big) h += `<div class="ph-big">${esc(sp.big)}</div>`;
    for (const l of sp.lines || []) h += `<div>${esc(l)}</div>`;
    if (sp.html) h += sp.html;
    if (sp.buttons) h += `<div class="ph-btns">${sp.buttons.map((b) => `<span class="ph-btn${/^call$/i.test(String(b).trim()) ? ' call' : ''}">${esc(b)}</span>`).join('')}</div>`;
    return h;
  }
  function termHtml(sp) {
    if (sp == null) return '';
    if (typeof sp === 'string') return sp;
    return esc((sp.lines || []).join('\n')) + (sp.cursor === false ? '' : '<span class="term-cur"></span>');
  }
  function setScreen(s, content) {
    if (s.chooser) finishChooser(s, -1);
    s.body.innerHTML = s.style === 'phone' ? phoneHtml(content) : s.style === 'terminal' ? termHtml(content) : crmHtml(content);
    if (s.style === 'phone' && content && typeof content === 'object' && content.bars !== undefined) { s.phoneBars = content.bars; paintPhoneStatus(s); }
  }
  function screenHandle(s) {
    return {
      get el() { return s.body; },
      get style() { return s.style; },
      get open() { return scrSt.cur === s; },
      set(content) { setScreen(s, content); return this; },
      // flash(content, dur=0.33) → Promise: show other content for `dur`, then put the previous back.
      flash(content, dur = 0.33) {
        const prev = s.body.innerHTML, tok = ++s.flashTok;
        setScreen(s, content);
        return wait(dur).then(() => { if (s.flashTok === tok) s.body.innerHTML = prev; });
      },
      // static(dur=0.6, amount=1, {silent}) → Promise: a burst of TV static over the screen (with the static sound).
      static(dur = 0.6, amount = 1, o = {}) {
        s.pulse = { t: 0, dur: Math.max(0.05, dur), amt: clamp(amount) };
        if (!o.silent) sfx('static', { dur: Math.max(0.2, dur), vol: 0.35 + 0.5 * clamp(amount) });
        return wait(dur);
      },
      setStatic(v) { s.staticLv = clamp(+v || 0); return this; },          // persistent static level (0 = off)
      glitch(dur = 0.45, strength = 1) { s.gl = { t: 0, dur: Math.max(0.05, dur), str: strength }; return wait(dur); },
      choose(o) { return screenChoose(s, o || {}); },                     // → Promise<index of .crm-btn / .ph-btn>
      bars(v) { if (s.style === 'phone') { s.phoneBars = v; paintPhoneStatus(s); } return this; },
      close(fadeDur) { return scrSt.cur === s ? closeScreen(fadeDur) : Promise.resolve(); },
      query(sel) { return s.body.querySelector(sel); },
    };
  }
  // UI.screen(content|null, {style:'crm'|'case'|'terminal'|'phone', title, store, status, user, bars, fade=0.4}) → handle.
  // Full-screen in-world screen. `content` is HTML, or a spec (crm/case → crmHtml; phone → {title, big, lines, buttons,
  // bars}; terminal → {lines, cursor}). Same style while open → the content swaps instantly (an app page change).
  // Handle: set(content), flash(content, dur), static(dur, amount), setStatic(v), glitch(dur, strength), choose({start,
  // cancel}), bars(n|'noservice'), close(fade), el. UI.screen(null) closes (→ Promise).
  function screen(content, o = {}) {
    ensure();
    if (content == null) return closeScreen(o.fade ?? 0.4);
    const style = SCR_STYLES.includes(o.style) ? o.style : (scrSt.cur ? scrSt.cur.style : 'crm');
    const cur = scrSt.cur;
    if (cur && cur.style === style) { setScreen(cur, content); if (o.bars !== undefined && style === 'phone') cur.handle.bars(o.bars); return cur.handle; }
    if (cur) closeScreen(0.3);
    const s = buildScreen(style, o, L.screen);
    s.f = new Fader(opac(s.root), 0);
    setScreen(s, content);
    scrSt.cur = s;
    s.f.to(1, o.fade ?? 0.4);
    return s.handle;
  }
  function closeScreen(fadeDur = 0.4) {
    const s = scrSt.cur;
    if (!s) return Promise.resolve();
    scrSt.cur = null;
    if (s.chooser) finishChooser(s, -1);
    return s.f.to(0, fadeDur).then(() => s.root.remove());
  }
  function screenChoose(s, o) {
    const btns = [...s.body.querySelectorAll('.crm-btn:not(.crm-find), .ph-btn, .scr-btn')];
    if (!btns.length) return Promise.resolve(-1);
    if (s.chooser) finishChooser(s, -1);
    return new Promise((resolve) => {
      const c = { btns, sel: clamp(o.start | 0, 0, btns.length - 1), resolve, cancel: o.cancel ?? null, t: 0 };
      s.chooser = c;
      btns.forEach((b, i) => {
        b.style.pointerEvents = 'auto';
        b.onmouseenter = () => { if (s.chooser === c && c.sel !== i) { c.sel = i; sfx('ui_move'); paintChooser(c); } };
        b.onmousedown = (e) => { e.preventDefault(); if (s.chooser === c && c.t > 0.15 && e.button === 0) { c.sel = i; paintChooser(c); pickChooser(s, i); } };
      });
      paintChooser(c);
      capOn();
      swallow('confirm', 'cancel');
    });
  }
  function paintChooser(c) { c.btns.forEach((b, i) => b.classList.toggle('sel', i === c.sel)); }
  function pickChooser(s, i) {
    const c = s.chooser; if (!c) return;
    const b = c.btns[i];
    if (b) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 140); }
    sfx('click', { vol: 0.8 });
    finishChooser(s, i);
  }
  function finishChooser(s, i) {
    const c = s.chooser; if (!c) return;
    s.chooser = null;
    capOff();
    swallow('confirm', 'cancel');
    c.resolve(i);
  }
  function tickChooser(s, dt) {
    const c = s.chooser;
    c.t += dt;
    if (c.t < 0.15) return;
    const n = c.btns.length;
    if (pressed('left') || pressed('up')) { c.sel = (c.sel + n - 1) % n; sfx('ui_move'); paintChooser(c); }
    else if (pressed('right') || pressed('down')) { c.sel = (c.sel + 1) % n; sfx('ui_move'); paintChooser(c); }
    if (pressed('confirm')) pickChooser(s, c.sel);
    else if (c.cancel != null && pressed('cancel')) { sfx('ui_cancel'); finishChooser(s, c.cancel); }
  }
  // per-frame CRT life: flicker, static, glitch tearing, static-filled fields
  function screenFx(s, dt) {
    if (!s || !s.glass) return;
    let lv = s.staticLv;
    if (s.pulse) {
      s.pulse.t += dt;
      const k = s.pulse.t / s.pulse.dur;
      if (k >= 1) s.pulse = null;
      else lv = Math.max(lv, s.pulse.amt * (k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1));
    }
    s.statT -= dt;
    const refresh = s.statT <= 0;
    if (refresh) s.statT = 1 / 30;
    if (lv > 0.01) {
      s.stat.style.visibility = 'visible'; s.stat.style.opacity = lv.toFixed(3);
      if (refresh) { s.stat.style.backgroundImage = `url(${pickImg(IMG.stat)})`; s.stat.style.backgroundPosition = `${(R() * 384) | 0}px ${(R() * 288) | 0}px`; }
    } else if (s.stat.style.visibility !== 'hidden') s.stat.style.visibility = 'hidden';
    if (s.gl) {
      s.gl.t += dt;
      if (s.gl.t >= s.gl.dur) {
        s.gl = null;
        s.app.style.transform = ''; s.app.style.filter = '';
        for (const t of s.tears) t.style.visibility = 'hidden';
      } else if (refresh) {
        const st = s.gl.str * (0.4 + R() * 0.8);
        s.app.style.transform = `translate(${((R() - 0.5) * 16 * st).toFixed(1)}px,${(R() < 0.25 ? (R() - 0.5) * 8 * st : 0).toFixed(1)}px)`;
        s.app.style.filter = `drop-shadow(${(3 * st).toFixed(1)}px 0 0 rgba(255,40,40,.5)) drop-shadow(${(-3 * st).toFixed(1)}px 0 0 rgba(0,220,255,.45))`;
        for (const t of s.tears) {
          if (R() < 0.35) { t.style.visibility = 'hidden'; continue; }
          t.style.visibility = 'visible'; t.style.top = (R() * 92).toFixed(1) + '%'; t.style.height = (1 + R() * 7).toFixed(1) + '%';
          t.style.backgroundImage = `url(${pickImg(IMG.stat)})`; t.style.transform = `translateX(${((R() - 0.5) * 10).toFixed(1)}%)`;
        }
      }
    }
    if (s.style !== 'phone') {
      s.flickT -= dt;
      if (s.flickT <= 0) { s.flickT = 0.05 + R() * 0.08; s.glass.style.filter = `brightness(${(0.95 + R() * 0.06 - (R() < 0.03 ? 0.08 : 0)).toFixed(3)})`; }
    }
    if (refresh) for (const f of s.body.querySelectorAll('.crm-static')) { f.style.backgroundImage = `url(${pickImg(IMG.stat)})`; f.style.backgroundPosition = `${(R() * 192) | 0}px ${(R() * 144) | 0}px`; }
  }
  function tickScreens(dt) {
    if (scrSt.cur) screenFx(scrSt.cur, dt);
    const k = kpSt.cur || kpSt.last;
    if (k && k.scr) screenFx(k.scr, dt);
  }

  // =================================================================================================================
  // Keypads: 'terminal' (CRM PIN login), 'lockbox' (push-button key safe), 'padlock' (combination wheels),
  // 'rotary' (a pulse dial you operate digit by digit). → Promise<string|null>
  // =================================================================================================================
  const kpSt = { cur: null, last: null };
  const KP_TITLES = { terminal: '', lockbox: 'KEY LOCKBOX', padlock: 'COMBINATION LOCK', rotary: 'PULSE DIAL' };
  // UI.keypad({title, digits=4, style, hint, code, check, start, label, tag, user, keep, after}) → Promise<string|null>
  //   Digits from the number keys, W/S/A/D or arrows (and the D-pad / stick), E / Enter / A to enter, Esc / B to
  //   cancel (→ null); the mouse works on every style. CONTRACT+:
  //   code:'1403' or check:(code) => true | false | 'message' keeps the keypad open on a wrong code (with feedback and
  //   the lock's own failure sound) and only resolves with the right code (or null). Without either it resolves with
  //   whatever was entered. start:'0000' (padlock wheels), label (text on the rotary's centre card), tag (the paper
  //   tag on the lockbox key), user (terminal username, default AIDAN), keep:true (terminal: the CRM screen stays up
  //   via UI.screen after a correct PIN, showing `after` content — swap it with UI.screen(spec)).
  function keypad(o = {}) {
    ensure();
    if (kpSt.cur) kpFinish(kpSt.cur, null);
    const style = ['terminal', 'lockbox', 'padlock', 'rotary'].includes(o.style) ? o.style : 'padlock';
    const st = {
      style, o, digits: clamp((o.digits | 0) || 4, 1, 8), cur: 0, t: 0, lock: 0.12, err: 0, open: 0, opening: false,
      done: false, attempts: 0, mq: [], msgT: 0, r: null,
      check: typeof o.check === 'function' ? o.check : o.code != null ? (c) => c === String(o.code) : null,
    };
    st.root = mk('div', 'ui-kp' + (style === 'terminal' ? ' term' : ' dim'), L.kp);
    st.f = new Fader(opac(st.root), 0);
    st.root.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!st.done) st.mq.push({ k: 'cancel' }); });
    const title = o.title ?? KP_TITLES[style];
    if (style === 'terminal') buildTerminal(st);
    else {
      if (title) mk('div', 'ui-kp-title', st.root, fmt(title));
      st.cv = mk('canvas', 'ui-kp-cv', st.root);
      st.cv.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.button === 0) kpMouse(st, e); });
      st.cv.addEventListener('wheel', (e) => { e.preventDefault(); kpMouse(st, e, e.deltaY < 0 ? 1 : -1); }, { passive: false });
      st.msg = mk('div', 'ui-kp-msg', st.root); st.msgF = new Fader(opac(st.msg), 0);
      st.keys = mk('div', 'ui-kp-keys', st.root);
      kpSize(st);
    }
    if (o.hint) mk('div', 'ui-kp-hint', st.root, fmt(o.hint));
    KP[style].init(st);
    kpKeysText(st);
    kpSt.cur = st; kpSt.last = st;
    st.f.to(1, 0.4);
    if (style === 'padlock' || style === 'lockbox') sfx('handle', { vol: 0.3 });   // the lock taken in hand
    capOn();
    swallow('confirm', 'interact', 'cancel');
    if (st.cv) drawKeypad(st, 0);
    return new Promise((r) => { st.r = r; });
  }
  function kpSize(st) {
    const H = window.innerHeight, W = window.innerWidth;
    const css = Math.round(Math.min(H * 0.56, W * 0.7));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    st.css = css; st.dpr = dpr;
    st.cv.width = Math.round(css * dpr); st.cv.height = Math.round(css * dpr);
    st.cv.style.width = css + 'px'; st.cv.style.height = css + 'px';
  }
  function kpKeysText(st) {
    const pad = padDevice();
    const t = {
      padlock: pad ? 'D-PAD  TURN / WHEEL   ·   A  OPEN   ·   B  BACK' : 'W S  TURN   ·   A D  WHEEL   ·   0–9  SET   ·   E  OPEN   ·   ESC  BACK',
      lockbox: pad ? 'D-PAD  MOVE   ·   A  PRESS   ·   X  CLEAR   ·   B  BACK' : '0–9  PRESS   ·   W A S D  MOVE   ·   E  PRESS   ·   BACKSPACE  CLEAR   ·   ESC  BACK',
      rotary: pad ? 'D-PAD  CHOOSE   ·   A  DIAL   ·   X  HANG UP   ·   B  BACK' : 'A D  CHOOSE   ·   E  DIAL   ·   0–9  DIAL   ·   BACKSPACE  HANG UP   ·   ESC  BACK',
      terminal: pad ? 'D-PAD  CHANGE DIGIT     A  LOG IN     B  CANCEL' : 'ENTER  LOG IN     ESC  CANCEL     ← →  MOVE     ↑ ↓  CHANGE',
    }[st.style];
    st.keysKey = pad;
    if (st.style === 'terminal') { if (st.scr && st.scr.status) st.scr.status.innerHTML = `<span>${esc(t)}</span><span>USER: ${esc(st.o.user ?? 'AIDAN')}</span>`; }
    else st.keys.textContent = t;
  }
  function kpMsg(st, text, dur = 1.8) {
    if (st.style === 'terminal') { termStatus(st, text, true); return; }
    st.msg.innerHTML = fmt(text); st.msgT = dur; st.msgF.to(1, 0.25);
  }
  function kpFinish(st, result) {
    if (!st || st.done) return;
    st.done = true;
    if (kpSt.cur === st) kpSt.cur = null;
    capOff();
    swallow('confirm', 'interact', 'cancel');
    if (st.style === 'terminal' && result != null && st.o.keep) {
      screen(st.o.after ?? { heading: 'CUSTOMER SEARCH', search: '', text: 'Signed in as ' + (st.o.user ?? 'AIDAN') + '.' }, { style: 'crm', fade: 0, title: st.o.screenTitle, store: st.o.store, user: st.o.user });
    }
    st.f.to(0, 0.4).then(() => { st.root.remove(); if (kpSt.last === st) kpSt.last = null; });
    if (st.r) st.r(result);
  }
  function kpAttempt(st, code) {
    if (st.done) return;
    if (!st.check) { st.lock = 99; wait(0.18).then(() => kpFinish(st, code)); return; }
    let ok = false, msg = null;
    try { const res = st.check(code); ok = res === true; if (typeof res === 'string') msg = res; } catch (e) { console.error('[UI.keypad] check', e); }
    st.attempts++;
    if (ok) { st.lock = 99; KP[st.style].success(st, code); } else KP[st.style].fail(st, msg);
  }
  function kpMouse(st, e, wheelDir) {
    if (st.done || !st.hit) return;
    const rc = st.cv.getBoundingClientRect(), v = KP[st.style].view || [1, 320, 320];
    const x = (((e.clientX - rc.left) / rc.width) * 640 - v[1]) / v[0] + v[1], y = (((e.clientY - rc.top) / rc.height) * 640 - v[2]) / v[0] + v[2];
    for (const h of st.hit) {
      const inside = h.r != null ? Math.hypot(x - h.x, y - h.y) <= h.r : x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
      if (!inside) continue;
      if (wheelDir != null) { if (h.wheel != null) st.mq.push({ k: 'wheel', i: h.wheel, dir: wheelDir }); return; }
      if (h.wheel != null) st.mq.push({ k: 'wheel', i: h.wheel, dir: y < h.y + h.h / 2 ? 1 : -1 });
      else st.mq.push(h.ev);
      return;
    }
  }
  function tickKeypad(st, dt) {
    st.t += dt;
    st.err = Math.max(0, st.err - dt);
    if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0 && st.msgF) st.msgF.to(0, 0.5); }
    if (st.keysKey !== padDevice()) kpKeysText(st);
    const H = KP[st.style];
    if (H.step) H.step(st, dt);
    if (st.lock > 0) { st.lock -= dt; st.mq.length = 0; }
    else if (!st.done) {
      const ev = st.mq.splice(0);
      if (pressed('up')) ev.push({ k: 'up' });
      if (pressed('down')) ev.push({ k: 'down' });
      if (pressed('left')) ev.push({ k: 'left' });
      if (pressed('right')) ev.push({ k: 'right' });
      let back = false;
      for (const ch of typed()) {
        if (/^[0-9]$/.test(ch)) ev.push({ k: 'd', d: +ch });
        else if (ch === 'Backspace') { back = true; ev.push({ k: 'back' }); }
      }
      if (pressed('attack')) ev.push({ k: 'back' });
      if (pressed('confirm')) ev.push({ k: 'ok' });
      if (pressed('cancel') && !back) ev.push({ k: 'cancel' });
      for (const e of ev) {
        if (st.done || st.lock > 0) break;
        if (e.k === 'cancel') { sfx('ui_cancel'); kpFinish(st, null); break; }
        H.ev(st, e);
      }
    }
    if (st.cv) drawKeypad(st, dt);
  }
  function drawKeypad(st, dt) {
    if (!st.cv) return;
    if (st.done) { st.t += dt; st.err = Math.max(0, st.err - dt); if (KP[st.style].step) KP[st.style].step(st, dt); }
    const x = st.cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, st.cv.width, st.cv.height);
    const k = (st.css * st.dpr) / 640, v = KP[st.style].view || [1, 320, 320];
    x.setTransform(k * v[0], 0, 0, k * v[0], k * (v[1] - v[1] * v[0]), k * (v[2] - v[2] * v[0]));
    st.hit = [];
    KP[st.style].draw(st, x);
  }
  // nearest continuous wheel value showing digit d
  const nearestTurn = (v, d) => { const r = Math.round(v); let delta = d - mod(r, 10); if (delta > 5) delta -= 10; if (delta < -5) delta += 10; return r + delta; };

  // ---- shared drawing helpers (640×640 design units) ----------------------------------------------------------------
  function rr(x, X, Y, W, H, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
    x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
  }
  function grad(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
  function dirt(x, X, Y, W, H, a = 0.8) { x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = a; x.drawImage(grime(), X, Y, W, H); x.restore(); }
  function scratches(x, r, X, Y, W, H, n, rgb) {
    x.save(); x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const sx = X + r() * W, sy = Y + r() * H, a = r() * TAU, l = 5 + r() * 38;
      x.strokeStyle = `rgba(${rgb},${(0.08 + r() * 0.3).toFixed(3)})`; x.lineWidth = 0.6 + r() * 1.1;
      x.beginPath(); x.moveTo(sx, sy);
      x.quadraticCurveTo(sx + Math.cos(a) * l * 0.5 + (r() - 0.5) * 5, sy + Math.sin(a) * l * 0.5 + (r() - 0.5) * 5, sx + Math.cos(a) * l, sy + Math.sin(a) * l);
      x.stroke();
    }
    x.restore();
  }
  function engrave(x, text, cx, cy, font, spacing = 0, dark = 'rgba(30,22,8,0.8)', light = 'rgba(255,236,190,0.35)') {
    x.save(); x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    try { x.letterSpacing = spacing + 'px'; } catch (e) { /* older canvas */ }
    x.fillStyle = light; x.fillText(text, cx + spacing / 2, cy + 1.4);
    x.fillStyle = dark; x.fillText(text, cx + spacing / 2, cy);
    x.restore();
  }
  // the phone torch: the object is lit in a pool, falling off into the dark
  function torchPool(x, cx, cy, r0, r1, dark = 0.62) {
    x.save(); x.globalCompositeOperation = 'source-atop';
    const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, `rgba(0,0,0,${(dark * 0.35).toFixed(3)})`); g.addColorStop(1, `rgba(0,0,0,${dark})`);
    x.fillStyle = g; x.fillRect(0, 0, 640, 640);
    x.fillStyle = 'rgba(175,205,220,0.05)'; x.fillRect(0, 0, 640, 640);
    x.restore();
  }
  function contactShadow(x, cx, cy, rx, ry) {
    x.save(); x.filter = 'blur(14px)'; x.fillStyle = 'rgba(0,0,0,0.75)';
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.fill(); x.restore();
  }
  function screw(x, cx, cy, r = 7, a = 0.6) {
    x.save();
    x.fillStyle = grad(x, cx - r, cy - r, cx + r, cy + r, [[0, '#c9cdcd'], [0.5, '#7b8183'], [1, '#2e3234']]);
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke();
    x.strokeStyle = 'rgba(20,22,24,0.85)'; x.lineWidth = 1.8;
    x.beginPath(); x.moveTo(cx - Math.cos(a) * r * 0.75, cy - Math.sin(a) * r * 0.75); x.lineTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); x.stroke();
    x.restore();
  }
  const KP = {};

  // ---- padlock: brass body, steel shackle, black number wheels -------------------------------------------------------
  KP.padlock = {
    view: [1.08, 320, 250],
    init(st) {
      const s0 = String(st.o.start ?? '').padEnd(st.digits, '0');
      st.tgt = [...Array(st.digits)].map((_, i) => +s0[i] || 0);
      st.pos = st.tgt.slice();
    },
    code: (st) => st.tgt.map((v) => mod(Math.round(v), 10)).join(''),
    ev(st, e) {
      const n = st.digits;
      if (e.k === 'up' || e.k === 'down' || e.k === 'wheel') {
        const i = e.k === 'wheel' ? e.i : st.cur;
        if (e.k === 'wheel') st.cur = i;
        st.tgt[i] += e.k === 'up' || (e.k === 'wheel' && e.dir > 0) ? 1 : -1;
        sfx('click', { vol: 0.4 });
      } else if (e.k === 'left' || e.k === 'right') { st.cur = (st.cur + (e.k === 'right' ? 1 : n - 1)) % n; sfx('ui_move', { vol: 0.6 }); }
      else if (e.k === 'd') { st.tgt[st.cur] = nearestTurn(st.tgt[st.cur], e.d); sfx('click', { vol: 0.4 }); if (st.cur < n - 1) st.cur++; }
      else if (e.k === 'back') { if (st.cur > 0) { st.cur--; sfx('ui_move', { vol: 0.6 }); } }
      else if (e.k === 'ok') kpAttempt(st, KP.padlock.code(st));
    },
    step(st, dt) {
      for (let i = 0; i < st.digits; i++) st.pos[i] += (st.tgt[i] - st.pos[i]) * (1 - Math.exp(-dt * 20));
      if (st.opening) st.open = Math.min(1, st.open + dt / 0.3);
    },
    success(st, code) { sfx('unlock'); st.opening = true; wait(0.95).then(() => kpFinish(st, code)); },
    fail(st, msg) { sfx('door_locked', { vol: 0.8 }); st.err = 0.45; kpMsg(st, msg || "It won't open."); st.lock = 0.35; },
    draw(st, x) {
      const n = st.digits, r = U.rng(4127), ww = 58, gap = 8, winW = n * ww + (n - 1) * gap + 24;
      const bw = Math.max(340, winW + 96), bx = 320 - bw / 2, by = 292, bh = 300;
      const jig = st.err > 0 ? Math.sin(st.t * 80) * 5 * Math.min(1, st.err / 0.3) : 0;
      x.save(); x.translate(jig, 0);
      contactShadow(x, 326, by + bh + 14, bw * 0.56, 20);
      // shackle (hardened steel); the short right leg pops out of the body when it opens
      const sr = bw * 0.3, scy = by - 92;
      x.save(); x.translate(0, -st.open * 52);
      const leg = (rad, lw, style) => {
        x.beginPath(); x.moveTo(320 - rad, by + 95); x.lineTo(320 - rad, scy); x.arc(320, scy, rad, Math.PI, 0); x.lineTo(320 + rad, by + 28);
        x.lineWidth = lw; x.strokeStyle = style; x.stroke();
      };
      x.lineCap = 'butt';
      leg(sr, 54, '#101213');
      leg(sr, 46, grad(x, 320 - sr - 26, 0, 320 + sr + 26, 0, [[0, '#2c3033'], [0.07, '#c8cdcf'], [0.14, '#5f666a'], [0.5, '#8b9194'], [0.86, '#5c6266'], [0.93, '#b1b6b8'], [1, '#2a2e31']]));
      leg(sr - 13, 4, 'rgba(255,255,255,0.2)');
      leg(sr + 16, 2, 'rgba(0,0,0,0.35)');
      x.restore();
      // body
      rr(x, bx, by, bw, bh, 24);
      x.fillStyle = grad(x, bx, 0, bx + bw, 0, [[0, '#46330e'], [0.08, '#826226'], [0.3, '#c59a49'], [0.4, '#d9b462'], [0.62, '#a67f31'], [0.88, '#6a4e1b'], [1, '#3b2b0b']]);
      x.fill();
      x.save(); rr(x, bx, by, bw, bh, 24); x.clip();
      dirt(x, bx, by, bw, bh, 0.9);
      x.fillStyle = grad(x, 0, by, 0, by + bh, [[0, 'rgba(255,244,205,0.2)'], [0.22, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]); x.fillRect(bx, by, bw, bh);
      for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(38,60,40,${(0.05 + r() * 0.1).toFixed(3)})`; x.beginPath(); x.ellipse(bx + r() * bw, by + r() * bh, 10 + r() * 44, 6 + r() * 26, r() * 3, 0, TAU); x.fill(); }
      scratches(x, r, bx, by, bw, bh, 70, '255,236,190');
      x.restore();
      x.save(); rr(x, bx + 2.5, by + 2.5, bw - 5, bh - 5, 22); x.lineWidth = 3; x.strokeStyle = 'rgba(255,232,170,0.3)'; x.stroke(); x.restore();
      rr(x, bx, by, bw, bh, 24); x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,0.65)'; x.stroke();
      engrave(x, 'HARDENED', 320, by + 44, `bold 19px ${ARIAL}`, 5);
      engrave(x, `${n} DIAL · RESETTABLE`, 320, by + bh - 34, `bold 12px ${ARIAL}`, 3, 'rgba(30,22,8,0.55)', 'rgba(255,236,190,0.22)');
      // number window + wheels
      const wx0 = 320 - winW / 2, wy = by + 84, wh = 150, cy = wy + wh / 2;
      rr(x, wx0, wy, winW, wh, 8); x.fillStyle = '#0c0805'; x.fill();
      x.save(); rr(x, wx0, wy, winW, wh, 8); x.clip();
      for (let i = 0; i < n; i++) {
        const X = wx0 + 12 + i * (ww + gap);
        drawWheel(x, X, wy, ww, wh, st.pos[i], i === st.cur && !st.done);
        st.hit.push({ x: X, y: wy, w: ww, h: wh, wheel: i });
      }
      x.lineWidth = 12; x.strokeStyle = 'rgba(0,0,0,0.7)'; rr(x, wx0, wy, winW, wh, 8); x.stroke();
      x.restore();
      x.lineWidth = 2; x.strokeStyle = 'rgba(255,230,160,0.28)'; rr(x, wx0 - 2, wy - 2, winW + 4, wh + 4, 9); x.stroke();
      x.fillStyle = 'rgba(28,18,4,0.85)'; x.fillRect(wx0 - 18, cy - 1.5, 11, 3); x.fillRect(wx0 + winW + 7, cy - 1.5, 11, 3);
      if (!st.done) {
        const X = wx0 + 12 + st.cur * (ww + gap);
        x.fillStyle = 'rgba(240,236,224,0.85)'; x.fillRect(X + 9, wy - 13, ww - 18, 3); x.fillRect(X + 9, wy + wh + 10, ww - 18, 3);
      }
      torchPool(x, 300, by + 70, 70, 470, 0.6);
      x.restore();
    },
  };
  function drawWheel(x, X, Y, W, H, pos, sel) {
    const cy = Y + H / 2, Rw = H * 0.5;
    x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, '#000'], [0.17, '#1b1d1e'], [0.42, '#3a3d3f'], [0.5, '#45484a'], [0.58, '#3a3d3f'], [0.83, '#1b1d1e'], [1, '#000']]);
    x.fillRect(X, Y, W, H);
    const base = Math.round(pos);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 44px ${ARIAL}`;
    for (let k = -3; k <= 3; k++) {
      const v = base + k, off = v - pos, th = off * (TAU / 10);
      const tr = (off + 0.5) * (TAU / 10);
      if (Math.abs(tr) < 1.5) { const ry = cy + Math.sin(tr) * Rw; x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(X, ry - 1.2, W, 2.4); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(X, ry + 1.2, W, 1); }
      if (Math.abs(th) > 1.45) continue;
      const y = cy + Math.sin(th) * Rw, s = Math.cos(th);
      x.save(); x.translate(X + W / 2, y); x.scale(1, s);
      const l = Math.round(70 + 170 * Math.pow(s, 1.8));
      x.fillStyle = `rgb(${l},${l - 5},${l - 16})`;
      x.fillText(String(mod(v, 10)), 0, 2);
      x.restore();
    }
    x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(X, Y, 3, H); x.fillRect(X + W - 3, Y, 3, H);
    x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(X + 3, Y, 2, H);
    if (sel) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(X, Y, W, H); }
  }

  // ---- lockbox: powder-coated key safe, two columns of push buttons, CLEAR lever, a cover that drops away -------------
  const LB_LABEL = (i) => (i < 9 ? i + 1 : 0);
  KP.lockbox = {
    view: [1.05, 320, 318],
    init(st) { st.entered = []; st.pressed = new Set(); st.sel = 0; st.clr = 0; },
    ev(st, e) {
      if (e.k === 'up' || e.k === 'down') { const row = Math.floor(st.sel / 2), col = st.sel % 2; st.sel = ((row + (e.k === 'down' ? 1 : 4)) % 5) * 2 + col; sfx('ui_move', { vol: 0.5 }); }
      else if (e.k === 'left' || e.k === 'right') { st.sel ^= 1; sfx('ui_move', { vol: 0.5 }); }
      else if (e.k === 'd') { st.sel = e.d === 0 ? 9 : e.d - 1; lbPress(st, e.d); }
      else if (e.k === 'btn') { st.sel = e.i; lbPress(st, LB_LABEL(e.i)); }
      else if (e.k === 'ok') lbPress(st, LB_LABEL(st.sel));
      else if (e.k === 'back') lbClear(st);
    },
    step(st, dt) { st.clr = Math.max(0, st.clr - dt * 2.2); if (st.opening) st.open = Math.min(1, st.open + dt / 0.7); },
    success(st, code) {
      sfx('unlock'); st.opening = true;
      wait(0.35).then(() => sfx('keys', { vol: 0.45 }));
      wait(1.5).then(() => kpFinish(st, code));
    },
    fail(st, msg) {
      sfx('door_locked', { vol: 0.8 }); st.err = 0.4; kpMsg(st, msg || "It won't open."); st.lock = 0.7;
      wait(0.6).then(() => { if (!st.done) lbClear(st); });
    },
    draw(st, x) { drawLockbox(st, x); },
  };
  function lbPress(st, d) {
    if (st.entered.length >= st.digits) return;
    st.entered.push(d); st.pressed.add(d);
    sfx('click', { vol: 0.9 });
    if (st.entered.length === st.digits) { st.lock = 0.45; wait(0.4).then(() => { if (!st.done) kpAttempt(st, st.entered.join('')); }); }
  }
  function lbClear(st) {
    if (!st.entered.length && !st.pressed.size) return;
    st.entered = []; st.pressed.clear(); st.clr = 1;
    sfx('click', { vol: 0.7 }); sfx('handle', { vol: 0.35 });
  }
  function drawLockbox(st, x) {
    const r = U.rng(5521), bx = 185, by = 96, bw = 270, bh = 510;
    const jig = st.err > 0 ? Math.sin(st.t * 70) * 3.5 * Math.min(1, st.err / 0.3) : 0;
    x.save(); x.translate(jig, 0);
    contactShadow(x, 326, by + bh + 12, 170, 18);
    // shackle over a door handle
    x.lineCap = 'butt';
    const sh = (lw, style) => { x.beginPath(); x.moveTo(262, by + 30); x.lineTo(262, by - 8); x.arc(320, by - 8, 58, Math.PI, 0); x.lineTo(378, by + 30); x.lineWidth = lw; x.strokeStyle = style; x.stroke(); };
    sh(26, '#0f1112'); sh(19, grad(x, 240, 0, 400, 0, [[0, '#2c3033'], [0.1, '#b8bdbf'], [0.2, '#5a6064'], [0.5, '#7f8588'], [0.8, '#575d61'], [0.9, '#a9aeb0'], [1, '#2a2e31']]));
    // body
    rr(x, bx, by, bw, bh, 18);
    x.fillStyle = grad(x, bx, 0, bx + bw, 0, [[0, '#17191b'], [0.12, '#34393c'], [0.45, '#43484b'], [0.8, '#33373a'], [1, '#141618']]);
    x.fill();
    x.save(); rr(x, bx, by, bw, bh, 18); x.clip();
    dirt(x, bx, by, bw, bh, 0.75);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(150,158,160,${(0.08 + r() * 0.18).toFixed(3)})`; x.beginPath(); x.ellipse(bx + r() * bw, by + r() * bh, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, TAU); x.fill(); }
    scratches(x, r, bx, by, bw, bh, 45, '205,212,214');
    x.fillStyle = grad(x, 0, by, 0, by + bh, [[0, 'rgba(255,255,255,0.08)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]); x.fillRect(bx, by, bw, bh);
    x.restore();
    rr(x, bx, by, bw, bh, 18); x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,0.7)'; x.stroke();
    x.save(); rr(x, bx + 2, by + 2, bw - 4, bh - 4, 16); x.lineWidth = 1.5; x.strokeStyle = 'rgba(210,220,222,0.18)'; x.stroke(); x.restore();
    // the key compartment behind the cover
    const px = bx + 20, py = by + 34, pw = bw - 40, ph = bh - 58;
    if (st.open > 0) {
      rr(x, px, py, pw, ph, 8); x.fillStyle = '#060708'; x.fill();
      x.save(); rr(x, px, py, pw, ph, 8); x.clip();
      drawKey(x, 320, py + 36, st.o.tag);
      x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,0.75)'; rr(x, px, py, pw, ph, 8); x.stroke();
      x.restore();
    }
    // the front cover (drops down and away when it opens)
    x.save(); rr(x, px - 3, py - 3, pw + 6, ph + 6, 9); x.clip();
    x.translate(0, U.ease.in(st.open) * (ph + 30));
    rr(x, px, py, pw, ph, 8);
    x.fillStyle = grad(x, px, 0, px + pw, 0, [[0, '#2c3033'], [0.3, '#454b4e'], [0.6, '#4b5154'], [1, '#2a2e30']]); x.fill();
    x.save(); rr(x, px, py, pw, ph, 8); x.clip(); dirt(x, px, py, pw, ph, 0.55); scratches(x, r, px, py, pw, ph, 30, '215,222,224'); x.restore();
    rr(x, px, py, pw, ph, 8); x.lineWidth = 1.5; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.stroke();
    x.fillStyle = 'rgba(220,228,230,0.16)'; x.fillRect(px + 8, py + 1.5, pw - 16, 1.5);
    // counter windows
    const n = st.digits, cw = 40, cg = 10, cx0 = 320 - (n * cw + (n - 1) * cg) / 2, cyy = py + 24;
    for (let i = 0; i < n; i++) {
      const X = cx0 + i * (cw + cg);
      rr(x, X, cyy, cw, 50, 3); x.fillStyle = '#040505'; x.fill();
      x.strokeStyle = 'rgba(200,210,212,0.22)'; x.lineWidth = 1; x.stroke();
      const v = st.entered[i];
      x.textAlign = 'center'; x.textBaseline = 'middle';
      if (v != null) { x.font = `bold 32px ${MONO}`; x.fillStyle = '#e7e1ce'; x.fillText(String(v), X + cw / 2, cyy + 27); }
      else { x.fillStyle = 'rgba(231,225,206,0.16)'; x.fillRect(X + 12, cyy + 26, cw - 24, 2); }
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(X + 2, cyy + 2, cw - 4, 5);
    }
    // buttons
    for (let i = 0; i < 10; i++) {
      const col = i % 2, row = Math.floor(i / 2), bxc = 320 + (col ? 50 : -50), byc = py + 116 + row * 60;
      const lab = LB_LABEL(i);
      drawButton(x, bxc, byc, 24, lab, st.pressed.has(lab), i === st.sel && !st.done && st.open === 0);
      if (st.open === 0) st.hit.push({ x: bxc, y: byc, r: 30, ev: { k: 'btn', i } });
    }
    // CLEAR lever
    const ly = py + ph - 52;
    rr(x, 262, ly, 116, 20, 10); x.fillStyle = '#0a0b0c'; x.fill();
    const kx = 272 + st.clr * 76;
    rr(x, kx, ly - 5, 22, 30, 4); x.fillStyle = grad(x, kx, 0, kx + 22, 0, [[0, '#5d6366'], [0.4, '#d1d5d6'], [1, '#4f5558']]); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 1; x.stroke();
    engrave(x, 'CLEAR', 320, ly + 38, `bold 12px ${ARIAL}`, 3, 'rgba(10,12,13,0.85)', 'rgba(215,222,224,0.25)');
    if (st.open === 0) st.hit.push({ x: 262, y: ly - 6, w: 116, h: 32, ev: { k: 'back' } });
    screw(x, px + 14, py + 14, 6, 0.4); screw(x, px + pw - 14, py + 14, 6, 1.9); screw(x, px + 14, py + ph - 14, 6, 2.6); screw(x, px + pw - 14, py + ph - 14, 6, 0.9);
    x.restore();
    torchPool(x, 305, by + 150, 60, 430, 0.6);
    x.restore();
  }
  function drawButton(x, cx, cy, r, lab, down, sel) {
    x.fillStyle = '#0b0d0e'; x.beginPath(); x.arc(cx, cy + 1.5, r + 5, 0, TAU); x.fill();
    const off = down ? 2.5 : 0, k = down ? 0.62 : 1;
    x.fillStyle = (() => {
      const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.45 + off, 1, cx, cy + off, r);
      g.addColorStop(0, shadeHex('#f2f3f1', k)); g.addColorStop(0.35, shadeHex('#b3b8b9', k)); g.addColorStop(0.8, shadeHex('#6c7376', k)); g.addColorStop(1, shadeHex('#3a4043', k));
      return g;
    })();
    x.beginPath(); x.arc(cx, cy + off, r, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.65)'; x.lineWidth = 1.5; x.stroke();
    engrave(x, String(lab), cx, cy + off + 1, `bold 22px ${ARIAL}`, 0, down ? 'rgba(12,13,14,0.9)' : 'rgba(22,24,26,0.88)', 'rgba(255,255,255,0.35)');
    if (sel) { x.strokeStyle = 'rgba(240,236,224,0.85)'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, r + 9, 0, TAU); x.stroke(); }
  }
  function drawKey(x, cx, top, tag) {
    x.lineWidth = 5; x.strokeStyle = '#6d7275'; x.beginPath(); x.moveTo(cx, top - 30); x.lineTo(cx, top - 6); x.arc(cx + 8, top - 6, 8, Math.PI, 0.4 * Math.PI, true); x.stroke();
    x.lineWidth = 3.5; x.strokeStyle = '#a9aeb0'; x.beginPath(); x.arc(cx, top + 16, 15, 0, TAU); x.stroke();
    const brass = grad(x, cx - 32, 0, cx + 32, 0, [[0, '#6b5018'], [0.35, '#d9b666'], [0.55, '#b8913f'], [1, '#5c4413']]);
    x.fillStyle = brass; x.beginPath(); x.arc(cx, top + 62, 30, 0, TAU); x.fill();
    x.fillStyle = '#060708'; x.beginPath(); x.arc(cx, top + 48, 9, 0, TAU); x.fill();
    x.fillStyle = brass;
    x.beginPath(); x.moveTo(cx - 9, top + 88); x.lineTo(cx + 9, top + 88); x.lineTo(cx + 9, top + 128);
    for (let i = 0; i < 5; i++) { const y = top + 135 + i * 20; x.lineTo(cx + 22, y); x.lineTo(cx + 22, y + 8); x.lineTo(cx + 9, y + 14); }
    x.lineTo(cx + 9, top + 250); x.lineTo(cx - 3, top + 262); x.lineTo(cx - 9, top + 250); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(40,28,6,0.7)'; x.lineWidth = 1.2; x.stroke();
    x.strokeStyle = 'rgba(255,240,190,0.35)'; x.beginPath(); x.moveTo(cx - 5, top + 95); x.lineTo(cx - 5, top + 245); x.stroke();
    if (tag) {
      x.save(); x.translate(cx + 58, top + 128); x.rotate(-0.16);
      x.strokeStyle = 'rgba(210,200,170,0.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-6, -58); x.quadraticCurveTo(-40, -90, -58, -112); x.stroke();
      x.fillStyle = '#d6c595'; x.beginPath(); x.moveTo(-22, -46); x.lineTo(22, -46); x.lineTo(30, -34); x.lineTo(30, 66); x.lineTo(-30, 66); x.lineTo(-30, -34); x.closePath(); x.fill();
      dirt(x, -30, -46, 60, 112, 0.5);
      x.fillStyle = '#060708'; x.beginPath(); x.arc(0, -32, 5, 0, TAU); x.fill();
      x.fillStyle = '#1d2a6e'; x.font = `italic 22px ${"'Segoe Script','Bradley Hand','Comic Sans MS',cursive"}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      String(tag).split('\n').forEach((ln, i) => x.fillText(ln, 0, 6 + i * 26));
      x.restore();
    }
  }

  // ---- rotary: a pulse dial on a steel door plate --------------------------------------------------------------------
  const HOLE = (k) => U.rad(60 - (k * 30 + 25));   // k = 1..10 ('0' is 10): angle of the finger hole at rest
  let wheelCv = null;
  KP.rotary = {
    init(st) { st.entered = []; st.sel = 0; st.dial = 0; st.phase = 'idle'; st.q = []; st.pt = 0; },
    ev(st, e) {
      if (e.k === 'left' || e.k === 'up') { st.sel = (st.sel + 9) % 10; sfx('ui_move', { vol: 0.5 }); }
      else if (e.k === 'right' || e.k === 'down') { st.sel = (st.sel + 1) % 10; sfx('ui_move', { vol: 0.5 }); }
      else if (e.k === 'd') { if (st.entered.length + st.q.length < st.digits) st.q.push(e.d); }
      else if (e.k === 'hole') { st.sel = e.i; if (st.entered.length + st.q.length < st.digits) st.q.push(LB_LABEL(e.i)); }
      else if (e.k === 'ok') { if (st.entered.length + st.q.length < st.digits) st.q.push(LB_LABEL(st.sel)); }
      else if (e.k === 'back') { if (st.phase === 'idle' && (st.entered.length || st.q.length)) { st.entered = []; st.q = []; sfx('clunk', { vol: 0.6 }); } }
    },
    step(st, dt) {
      if (st.phase === 'idle') {
        if (st.q.length && !st.done && st.entered.length < st.digits) {
          const d = st.q.shift(), k = d === 0 ? 10 : d;
          st.sel = k - 1; st.dk = k; st.dd = d; st.target = k * 30 + 25; st.phase = 'wind'; st.pt = 0; st.wdur = 0.2 + k * 0.035;
          sfx('click', { vol: 0.3 });
        }
        return;
      }
      st.pt += dt;
      if (st.phase === 'wind') {
        st.dial = st.target * U.ease.out(Math.min(1, st.pt / st.wdur));
        if (st.pt >= st.wdur) { st.phase = 'hold'; st.pt = 0; }
      } else if (st.phase === 'hold') {
        if (st.pt >= 0.08) { st.phase = 'ret'; st.pt = 0; st.rdur = st.dk * 0.1 + 0.06; sfx('rotary_click', { n: st.dk }); }
      } else if (st.phase === 'ret') {
        st.dial = st.target * (1 - Math.min(1, st.pt / st.rdur));
        if (st.pt >= st.rdur) {
          st.dial = 0; st.phase = 'idle';
          if (!st.done) {
            st.entered.push(st.dd);
            if (st.entered.length >= st.digits) { st.q = []; st.lock = 0.45; wait(0.35).then(() => { if (!st.done) kpAttempt(st, st.entered.join('')); }); }
          }
        }
      }
    },
    success(st, code) { sfx('maglock'); if (st.o.okMsg) kpMsg(st, st.o.okMsg, 1.2); wait(1.1).then(() => kpFinish(st, code)); },
    fail(st, msg) {
      sfx('clunk', { vol: 0.7 }); kpMsg(st, msg || 'Nothing happens.'); st.lock = 0.8;
      wait(0.75).then(() => { if (!st.done) { st.entered = []; st.q = []; } });
    },
    draw(st, x) { drawRotary(st, x); },
  };
  function drawRotary(st, x) {
    const r = U.rng(7741), cx = 320, cy = 318, rot = U.rad(st.dial);
    // steel door plate
    rr(x, 44, 36, 552, 568, 12);
    x.fillStyle = grad(x, 44, 0, 596, 0, [[0, '#1d2022'], [0.2, '#383d40'], [0.55, '#444a4d'], [0.85, '#33383b'], [1, '#1a1c1e']]); x.fill();
    x.save(); rr(x, 44, 36, 552, 568, 12); x.clip(); dirt(x, 44, 36, 552, 568, 0.8); scratches(x, r, 44, 36, 552, 568, 60, '205,212,214'); x.restore();
    rr(x, 44, 36, 552, 568, 12); x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.stroke();
    screw(x, 72, 64, 8, 0.3); screw(x, 568, 64, 8, 1.2); screw(x, 72, 576, 8, 2.2); screw(x, 568, 576, 8, 0.8);
    // enamel dial plate
    x.save(); x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
    x.beginPath(); x.arc(cx, cy, 268, 0, TAU); x.fillStyle = '#cfc5ab'; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(cx, cy, 262, 0, TAU); x.clip();
    x.fillStyle = grad(x, cx - 262, cy - 262, cx + 262, cy + 262, [[0, '#ebe3cd'], [0.6, '#d8cfb6'], [1, '#b9ae92']]); x.fillRect(cx - 262, cy - 262, 524, 524);
    dirt(x, cx - 262, cy - 262, 524, 524, 0.55);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 240 + r() * 20; x.fillStyle = 'rgba(40,36,30,0.75)'; x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + r() * 7, 2 + r() * 4, a, 0, TAU); x.fill(); }
    x.restore();
    x.lineWidth = 10; x.strokeStyle = grad(x, cx - 270, cy - 270, cx + 270, cy + 270, [[0, '#e9ecec'], [0.3, '#8d9396'], [0.55, '#d6dadb'], [1, '#4b5154']]);
    x.beginPath(); x.arc(cx, cy, 266, 0, TAU); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 36px ${ARIAL}`;
    for (let k = 1; k <= 10; k++) { const a = HOLE(k); x.fillStyle = '#12100d'; x.fillText(String(k % 10), cx + Math.cos(a) * 205, cy + Math.sin(a) * 205 + 1); }
    // finger wheel (holes cut out) on its own layer
    if (!wheelCv) { wheelCv = document.createElement('canvas'); wheelCv.width = wheelCv.height = 640; }
    const w = wheelCv.getContext('2d');
    w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, 640, 640);
    w.translate(cx, cy); w.rotate(rot);
    const wg = w.createRadialGradient(-60, -80, 20, 0, 0, 246);
    wg.addColorStop(0, '#34373a'); wg.addColorStop(0.5, '#17191a'); wg.addColorStop(1, '#070808');
    w.fillStyle = wg; w.beginPath(); w.arc(0, 0, 246, 0, TAU); w.fill();
    w.strokeStyle = 'rgba(255,255,255,0.13)'; w.lineWidth = 2; w.beginPath(); w.arc(0, 0, 242, 0, TAU); w.stroke();
    w.globalCompositeOperation = 'destination-out';
    for (let k = 1; k <= 10; k++) { const a = HOLE(k); w.beginPath(); w.arc(Math.cos(a) * 205, Math.sin(a) * 205, 33, 0, TAU); w.fill(); }
    w.beginPath(); w.arc(0, 0, 118, 0, TAU); w.fill();
    w.globalCompositeOperation = 'source-over';
    for (let k = 1; k <= 10; k++) {
      const a = HOLE(k), hx = Math.cos(a) * 205, hy = Math.sin(a) * 205;
      w.strokeStyle = 'rgba(0,0,0,0.7)'; w.lineWidth = 4; w.beginPath(); w.arc(hx, hy, 35, 0, TAU); w.stroke();
      w.strokeStyle = 'rgba(255,255,255,0.16)'; w.lineWidth = 1.5; w.beginPath(); w.arc(hx, hy, 33.5, -2.6, -0.4); w.stroke();
    }
    w.strokeStyle = 'rgba(255,255,255,0.12)'; w.lineWidth = 2; w.beginPath(); w.arc(0, 0, 120, 0, TAU); w.stroke();
    w.setTransform(1, 0, 0, 1, 0, 0);
    x.save(); x.shadowColor = 'rgba(0,0,0,0.7)'; x.shadowBlur = 10; x.shadowOffsetY = 4; x.drawImage(wheelCv, 0, 0); x.restore();
    // finger stop
    x.save(); x.translate(cx, cy); x.rotate(U.rad(60));
    x.fillStyle = grad(x, 0, -9, 0, 9, [[0, '#f0f2f2'], [0.5, '#8a9093'], [1, '#3f4447']]);
    rr(x, 214, -9, 64, 18, 8); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke();
    x.restore();
    // centre card under a chrome ring: the label and the digits dialled so far
    x.beginPath(); x.arc(cx, cy, 112, 0, TAU); x.fillStyle = '#e6decb'; x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, 112, 0, TAU); x.clip(); dirt(x, cx - 112, cy - 112, 224, 224, 0.6); x.restore();
    x.lineWidth = 7; x.strokeStyle = grad(x, cx - 115, cy - 115, cx + 115, cy + 115, [[0, '#eef0f0'], [0.5, '#7d8386'], [1, '#c9cdce']]);
    x.beginPath(); x.arc(cx, cy, 115, 0, TAU); x.stroke();
    const lab = String(st.o.label ?? st.o.title ?? 'RECORDS').toUpperCase();
    x.fillStyle = '#2b2721'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${lab.length > 10 ? 16 : 20}px ${MONO}`;
    try { x.letterSpacing = '3px'; } catch (e) { /* older canvas */ }
    x.fillText(lab, cx + 1.5, cy - 36);
    try { x.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
    x.fillStyle = 'rgba(43,39,33,0.35)'; x.fillRect(cx - 70, cy - 16, 140, 1.5);
    x.font = `bold 38px ${MONO}`;
    const n = st.digits, sp = Math.min(40, 170 / n), x0 = cx - ((n - 1) * sp) / 2;
    for (let i = 0; i < n; i++) {
      const v = st.entered[i];
      x.fillStyle = v != null ? '#1c1915' : 'rgba(43,39,33,0.3)';
      x.fillText(v != null ? String(v) : '_', x0 + i * sp, cy + 26);
    }
    // selection ring around the chosen hole (idle only)
    if (st.phase === 'idle' && !st.done) {
      const a = HOLE(st.sel + 1);
      x.strokeStyle = 'rgba(240,236,224,0.9)'; x.lineWidth = 3;
      x.beginPath(); x.arc(cx + Math.cos(a) * 205, cy + Math.sin(a) * 205, 41, 0, TAU); x.stroke();
    }
    for (let k = 1; k <= 10; k++) { const a = HOLE(k); st.hit.push({ x: cx + Math.cos(a) * 205, y: cy + Math.sin(a) * 205, r: 36, ev: { k: 'hole', i: k - 1 } }); }
    torchPool(x, 300, 250, 110, 540, 0.55);
  }

  // ---- terminal: the store's retro CRM login (USERNAME: AIDAN prefilled, a 4-digit staff PIN) -------------------------
  function buildTerminal(st) {
    const o = st.o, user = o.user ?? 'AIDAN';
    const s = buildScreen('crm', { title: o.screenTitle ?? 'RETAIL CRM 4.2 — SIGN IN', store: o.store, user }, st.root);
    s.root.style.visibility = 'visible'; s.root.style.opacity = 1;
    st.scr = s;
    const wm = wordmarkUrl();
    s.body.innerHTML = `<div class="crm-desk"><div class="crm-desk-mark">STORE SYSTEMS</div><div class="crm-dlg">
      <div class="crm-dlg-t">${esc(o.title || 'Sign in')}</div>
      <div class="crm-dlg-b">
        <div class="crm-brand">${wm ? `<img src="${wm}">` : ''}<div><b>Retail CRM</b><br><small>Version 4.2 · Store Systems</small></div></div>
        <div class="crm-row"><span class="crm-k">USERNAME:</span><span class="crm-v">${esc(user)}</span></div>
        <div class="crm-row"><span class="crm-k">PIN:</span><span class="crm-pin">${'<i></i>'.repeat(st.digits)}</span></div>
        <div class="crm-msg"></div>
        <div class="crm-btns"><span class="crm-btn" data-a="ok">Log in</span><span class="crm-btn" data-a="cancel">Cancel</span></div>
      </div></div></div>`;
    st.pinEls = [...s.body.querySelectorAll('.crm-pin i')];
    st.msgEl = s.body.querySelector('.crm-msg');
    st.btnEls = [...s.body.querySelectorAll('.crm-btn')];
    st.pinEls.forEach((el, i) => el.addEventListener('mousedown', (e) => { e.preventDefault(); st.mq.push({ k: 'pos', i }); }));
    st.btnEls.forEach((b) => {
      b.style.pointerEvents = 'auto';
      b.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.button !== 0) return; b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 140); st.mq.push({ k: b.dataset.a === 'ok' ? 'ok' : 'cancel' }); });
    });
  }
  function termStatus(st, text, err = false) { if (!st.msgEl) return; st.msgEl.textContent = text; st.msgEl.classList.toggle('err', !!err); }
  function termPaint(st) {
    const blinkOn = Math.floor(st.t * 2) % 2 === 0;
    st.pinEls.forEach((el, i) => {
      const v = st.vals[i], cur = i === st.cur && !st.done;
      el.textContent = v == null ? (cur && blinkOn ? '_' : '') : cur && st.peek ? String(v) : '*';
      el.classList.toggle('cur', cur);
    });
    st.btnEls[0].classList.toggle('sel', !st.done);
  }
  KP.terminal = {
    init(st) {
      st.vals = Array(st.digits).fill(null); st.cur = 0; st.peek = false;
      termStatus(st, `Enter your ${st.digits}-digit staff PIN.`);
      termPaint(st);
    },
    ev(st, e) {
      const n = st.digits;
      if (e.k === 'd') { st.vals[st.cur] = e.d; st.peek = false; if (st.cur < n - 1) st.cur++; sfx('keypress'); termStatus(st, ''); }
      else if (e.k === 'up' || e.k === 'down') { const v = st.vals[st.cur]; st.vals[st.cur] = mod((v == null ? (e.k === 'up' ? -1 : 10) : v) + (e.k === 'up' ? 1 : -1), 10); st.peek = true; sfx('keypress', { vol: 0.7 }); }
      else if (e.k === 'left' || e.k === 'right') { st.cur = clamp(st.cur + (e.k === 'right' ? 1 : -1), 0, n - 1); st.peek = false; sfx('keypress', { vol: 0.5 }); }
      else if (e.k === 'pos') { st.cur = e.i; st.peek = false; }
      else if (e.k === 'back') {
        if (st.vals[st.cur] == null && st.cur > 0) st.cur--;
        st.vals[st.cur] = null; st.peek = false; sfx('keypress', { vol: 0.7 });
      } else if (e.k === 'ok') {
        if (st.vals.every((v) => v != null)) { sfx('keypress'); kpAttempt(st, st.vals.join('')); }
        else if (st.vals[st.cur] != null && st.cur < n - 1) { st.cur++; st.peek = false; sfx('keypress', { vol: 0.6 }); }
        else { sfx('error'); termStatus(st, `Enter your ${n}-digit staff PIN.`, true); }
      }
      termPaint(st);
    },
    step(st) { if (!st.done) termPaint(st); },
    success(st, code) {
      termStatus(st, 'Checking…'); sfx('keybeep');
      wait(0.6).then(() => { termStatus(st, `Welcome, ${st.o.user ?? 'AIDAN'}.`); sfx('ui_confirm'); });
      wait(1.3).then(() => kpFinish(st, code));
    },
    fail(st, msg) {
      st.lock = 0.5;
      termStatus(st, 'Checking…'); sfx('keybeep');
      wait(0.45).then(() => {
        if (st.done) return;
        sfx('error'); termStatus(st, msg || 'Invalid PIN. Try again.', true);
        st.vals = Array(st.digits).fill(null); st.cur = 0; st.peek = false; termPaint(st);
      });
    },
    draw() {},
  };

  // =================================================================================================================
  // Skip indicator (hold Esc 1 s, §3) and the film grain overlay
  // =================================================================================================================
  const skipSt = { f: null };
  // CONTRACT+: UI.skippable(on) — show the skip indicator for an in-engine skippable script without letterbox
  // (cutscenes with the letterbox show it automatically).
  function skippable(on) { skippableFlag = !!on; }
  function tickSkip(menu) {
    let p = 0;
    try { p = Input.skipProgress ? Input.skipProgress() : 0; } catch (e) { p = 0; }
    const show = !menu && p > 0.06 && (lbF.v > 0.5 || skippableFlag);
    if (skipSt.f.target !== (show ? 1 : 0)) skipSt.f.to(show ? 1 : 0, show ? 0.2 : 0.4);
    if (show) E.skip.lastChild.firstChild.style.transform = `scaleX(${clamp(p).toFixed(3)})`;
  }
  const grainSt = { f: null, v: 0, req: false, strength: 0.6, t: 0, on: false };
  // CONTRACT+: UI.grainOverlay(on, strength=0.6) — DOM film grain over everything (Menus), `strength` × the in-game
  // grain (0.6 = the menus' 60%). It also comes on by itself over black screens, keypads and in-world screens.
  // Honours META.options.noise / grain.
  function grainOverlay(on, strength = 0.6) { ensure(); grainSt.req = !!on; grainSt.strength = +strength > 0 ? +strength : 0.6; }
  function tickGrain(dt) {
    const opt = (META && META.options) || {};
    const auto = fadeLevel() > 0.6 || blackSt.card.v > 0.05 || blackSt.tob.v > 0.05 || blackSt.nosig.v > 0.05 || !!kpSt.cur || !!scrSt.cur;
    const want = opt.noise !== false && (grainSt.req || auto);
    if (grainSt.f.target !== (want ? 1 : 0)) grainSt.f.to(want ? 1 : 0, 0.45);
    // calibrated so the DOM grain over black matches `strength` × the WebGL grain's measured deviation on dark
    // frames (the tile is full-range noise; the game's grain is ±0.08 × 0.42, halved in the shadows)
    const k = grainSt.v * (grainSt.req ? grainSt.strength : 0.6) * 0.08 * (opt.grain ?? 1) * 0.42;
    const el = E.grain;
    if (k <= 0.001) { if (grainSt.on) { el.style.visibility = 'hidden'; grainSt.on = false; } return; }
    if (!grainSt.on) { el.style.visibility = 'visible'; grainSt.on = true; }
    el.style.opacity = k.toFixed(4);
    grainSt.t -= dt;
    if (grainSt.t <= 0) {
      grainSt.t = 1 / 24;
      const sz = Math.max(160, Math.round(window.innerHeight * 0.3));
      el.style.backgroundImage = `url(${pickImg(IMG.grain)})`;
      el.style.backgroundSize = `${sz}px ${sz}px`;
      el.style.backgroundPosition = `${(R() * sz) | 0}px ${(R() * sz) | 0}px`;
    }
  }

  // =================================================================================================================
  // HUD, capture state, skip, clear
  // =================================================================================================================
  // UI.showHud(bool): the phone bars, tutorial prompts and hold/struggle prompts (subtitles are unaffected).
  function showHud(on) { ensure(); hudOn = !!on; }
  // CONTRACT+: UI.capturing() → true while a choice, keypad or screen .choose() owns the input.
  function capturing() { return !!(chSt.cur || kpSt.cur || (scrSt.cur && scrSt.cur.chooser)); }
  // CONTRACT+: UI.skip() — jump every running fade/wait and end a timed subtitle line (Script's cutscene skip).
  // Choices and keypads keep waiting for the player.
  function skip() {
    for (const f of [...faders]) f.finish();
    for (const w of [...waits]) { waits.delete(w); w.r(); }
    if (subSt.line && subSt.line.dur > 0) clearSubtitle(0);
  }
  // CONTRACT+: UI.clear({fade:false, letterbox:true}) — remove every overlay (death, title, chapter select). A pending
  // choice resolves its default, a keypad null; fade:true also clears the black.
  function clear(o = {}) {
    ensure();
    clearSubtitle(0.2); hideMessage();
    for (const p of prompts) p.life = Math.min(p.life, p.t);
    holdPrompt(null); mash(null); callPrompt(null);
    if (chSt.cur) endChoice(chSt.cur, chSt.cur.def);
    if (kpSt.cur) kpFinish(kpSt.cur, null);
    if (scrSt.cur) closeScreen(0.2);
    badges(0); stamp(null);
    for (const k of ['card', 'title', 'tob', 'nosig']) blackSt[k].to(0, 0.3);
    blackSt.token++; blackSt.titleTok++; sayTok++;
    if (o.letterbox !== false) letterbox(false, 0.3);
    if (o.fade) fade(0, 0.3);
  }

  const api = {
    init, update,
    subtitle, clearSubtitle, say, message, dismissMessage, prompt, holdPrompt, mash,
    letterbox, fade, card, titleText, textOnBlack, noSignal,
    choice, callPrompt, bars, badges, sting, stamp,
    keypad, screen, crmHtml, showHud, grainOverlay, capturing, skippable, skip, clear,
    wait,                                                            // CONTRACT+: UI.wait(s) → Promise (UI time)
    get faded() { return fadeLevel(); },                             // CONTRACT+: current fade opacity 0..1
    get letterboxed() { return lbF ? lbF.target > 0 : false; },     // CONTRACT+
    get subtitleShown() { return subVisible(); },                    // CONTRACT+
    get messageShown() { return msgSt.active; },                     // CONTRACT+
    get hud() { return hudOn; },                                     // CONTRACT+
  };
  return api;
})();
