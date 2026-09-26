// ==== engine/13_phone.js — Phone: signal bars, monster tells, static, calls, voicemails, notes, the phone's screen ====
// ARCHITECTURE §2/§12 · spec §2A (phone screen: teal on black, bars, battery, a clock reading "--:--" the whole game),
// §4 (bars 0 beyond 20 m → 5 within 3 m; 8 s call window, E answers, Q declines to voicemail; Notes journal),
// §6 (each monster's phone tell), §8 (Luka's calls: answer F+2, decline A+2 + voicemail, first play of a voicemail F+1).
//
// Phone.update(dt) (main loop, after World): reads Enemies.nearestThreat(Aidan) → bars, static and the tell:
//   Tethered  'eftpos'  an EFTPOS approved beep with each new bar
//   Reach     'pulse'   the bars pulse full and empty like a racing heartbeat (faster and higher as it closes in)
//   Standard  'battery' the bars stay still; the battery icon drains a notch at a time (and creeps back after)
//   Borrowed  'none'    nothing at all — no bars, no static
//   Unread    'vibrate' constant vibration (Snd 'vibrate' + gamepad rumble), bars as normal
//   Smile     'nobars'  no bars at all (the indicator disappears), no static
//   other / bosses → plain bars + static. The kind comes from nearestThreat().tell, else e.tell, else e.type.
//   The torch flicker within 6 m is Player's (it reads nearestThreat itself); Phone does not double-drive it.
// Overrides: Phone.override(spec, {room, tell}) / Phone.bars(nOrNull, o) (= G.bars): a number (fixed bars), 'noservice'
//   (the hospital: NO SERVICE, no bars), 'none', 'flicker' (the mast: random 0–5), {climb:to, from, dur, tell}
//   (scripted climb), {n, mode, battery, static}, or fn(dt, auto) → number | reading | null (null = automatic).
//   null/undefined clears. {room:true} clears on room:leave; {tell:'eftpos'} beeps when the override's bars rise.
// Calls: Phone.ring(callId, {parent, window=8, force, def}) → Promise<'answered'|'declined'> (after the conversation).
//   Rings (Snd 'ring' + UI.callPrompt + the in-hand screen) for 8 s; E answers — S.calls[id]='answered',
//   stats.callsAnswered++, F+2 for Luka's calls — and runs CALLS[id].answer(G) as a blocking script (nested in the
//   caller's script when rung through G.call); Q or the timeout declines — S.calls[id]='declined', A+2 for Luka's
//   calls, a voicemail {id, played:false} pushed onto S.voicemails. Bus 'call:ring'(id), 'call:end'(id, how).
//   "Luka's calls" = CALLS[id].track !== false and (caller 'LUKA' | id 'luka…' | track:true).
// Voicemails: Phone.playVoicemail(i) → Promise (first play: played=true, stats.voicemails++, F+1 for Luka's calls);
//   CALLS[id].voicemail is a string (italic phone subtitles; [beat]/[static]/[keys] tags work) or async (G) => {}.
// Notes: Phone.note(text, {id, done, replace, silent}) → note (S.notes, newest last, no duplicates; with {id} it updates
//   that entry), Phone.done(idOrText, v=true), Phone.notes (S.notes).
// Screen: Phone.drawScreen(ctx, w, h) draws the current phone (Aidan's in-hand model: Player.actor.phoneScreen is
//   redrawn by update when something changes). CONTRACT+: Phone.display(spec|null) — a scripted screen for cutscene
//   inserts: {title, lines:[…], caller, big, button, buttonColor, blink} (e.g. "ACCT 4471-0932", "Calling...").
// CONTRACT+: Phone.cancel(id) and ring(id, {until, cancelOnLeave}) (see ring), G.bars({n, battery, letterbox:true})
//   (the HUD indicator stays visible under a letterbox), voicemailText falls back to CALLS[id].voicemailText for
//   scripted voicemails.
// CONTRACT+: Phone.answer() / Phone.decline() (tests, SH), ringing (call id | null), inCall, reading (bars, mode,
//   battery, static, tell, dist), callLog(), voicemails(), voicemailText(i), reset(), tellOf(threat), unplayed.
// CONTRACT+ THE UNRELIABLE SIGNAL (META.options.signal: 'unreliable' — the default, also for a missing key — or
//   'classic'; read every frame, so a change in Options applies at once). CLASSIC is the radar above, unchanged: every
//   threat, the bars mapped from its distance at once. UNRELIABLE:
//   * only what has found Aidan transmits — the source is Enemies.nearestThreat(pos, {aware:true}) (Enemies.aware:
//     a Tethered that has noticed him, a Reach that sees him / still rages / pounds a door, a stirred Unread, a
//     Standard that has seen him or hunts; dormant ones read nothing; awareness stays warm 4 s);
//   * the shown strength trails the true reading (rise τ 1.2 s, fall τ 2.5 s) with a slow random walk of about ±0.6
//     bar on top; 5 bars only within 3 m; the static and every tell (the EFTPOS beep per bar, the pulse, the battery
//     drain, the vibration) follow the lagged reading, and a tell keeps sounding while its reading fades;
//   * phantoms: with no aware threat within 20 m and nothing else owning the phone or the player (override, call,
//     Phone.display insert, cutscene or blocking script, menu, keypad, Outage transition, death, no control), after a
//     quiet 50–140 s (Fog world) / 35–90 s (Outage) the reading climbs to 1–3 bars (rarely 4) over 1–2 s, holds 2–6 s
//     under rising static — ~40 % of them with one subtle fake tell (an EFTPOS beep, a buzz, distant keys) — then
//     fades. Only from Chapter 1 on, once S.done['signal:real'] is set (the first second of play with an aware threat
//     reading in range — set in either mode; Bus 'signal:real'). Bus 'signal:phantom'({peak, tell}) as one starts.
//   Game time (Phone.update's dt) and a seeded RNG (U.rng, reseeded from S at the first update after reset()); every
//   number is in Phone.TUNE (PHONE_TUNE — tests may change it). Overrides (G.bars …) still show exactly as authored and
//   fn overrides get this reading as `auto`. reading adds {signal, source, aware, target, lag, jitter, phantom,
//   phantoms}. Phone.signalMode → 'unreliable' | 'classic'.
const Phone = (() => {
  const LCD_ON = '#38d2c6', LCD_MID = '#1f9d94', LCD_DIM = '#0f5a55', LCD_OFF = '#07201e', LCD_BG = '#010504';
  const clamp = U.clamp;
  const sfx = (name, o) => { try { return Snd.play(name, o); } catch (e) { return null; } };
  const ui = (fn, ...a) => { try { if (typeof UI !== 'undefined' && UI && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[Phone] UI.' + fn, e); } return undefined; };
  const inp = (fn, ...a) => { try { if (typeof Input !== 'undefined' && Input && typeof Input[fn] === 'function') return Input[fn](...a); } catch (e) { /* input not ready */ } return undefined; };
  const menusOpen = () => { try { return typeof Menus !== 'undefined' && !!Menus && !!Menus.isOpen && !!Menus.isOpen(); } catch (e) { return false; } };

  // ---- state (transient: nothing here is saved; S holds calls, voicemails and notes) ----
  const st = {
    n: 0, autoN: 0, mode: 'normal', batt: 1, battSeg: 4, staticV: 0,
    tell: null, dist: Infinity, prox: 0,
    pulse: 0, vibT: 0, beepN: 0, ovBeepN: 0,
    ov: null, display: null,
    ring: null, inCall: null,
    scrKey: '', scrT: 0,
  };
  let clock = 0;
  // ---- the unreliable signal: tuning (Phone.TUNE) and state ----
  const PHONE_TUNE = {
    range: 20, full: 3,                        // m: nothing beyond `range`; 5 bars only within `full`
    riseTau: 1.2, fallTau: 2.5,                // s: the shown strength trails the true one (time constants up / down)
    minRate: 0.2,                              // bars/s: … and always arrives (an exponential alone never reaches a bar)
    jitter: 0.6, jitterTau: 2.2,               // bars: the random walk's limit (σ ≈ 0.55 × that); s: its pace
    hyst: 0.08,                                // bars: hysteresis on the bar count
    realAfter: 1.0,                            // s of play reading an aware threat before S.done['signal:real']
    quiet: { fog: [50, 140], outage: [35, 90] },   // s of quiet before a phantom (drawn once per interval)
    minChapter: 1,                             // phantoms from this chapter on (and after a real reading)
    phantomBars: [1, 3], phantomFour: 0.1,     // the peak: 1–3 bars, 4 with this chance
    phantomRise: [1, 2], phantomHold: [2, 6], phantomFall: [1.5, 3],   // s
    phantomStatic: [0.12, 0.4],                // the static through the hold: from → to (× peak / 3, at least half)
    phantomTell: 0.4,                          // the chance of one fake tell: an EFTPOS beep, a buzz or distant keys
    seed: 0x51c4a1,
  };
  const un = { mode: null, L: 0, J: 0, n: 0, kind: null, src: null, target: 0, dist: Infinity, quietT: 0, quietU: null, ph: null, realT: 0, rng: null, jrng: null, phantoms: 0, fromPh: false };

  // ---------------------------------------------------------------------------------------------------------------
  // Tells
  // ---------------------------------------------------------------------------------------------------------------
  const TELLS = {
    eftpos: 'eftpos', tethered: 'eftpos', beep: 'eftpos',
    pulse: 'pulse', heartbeat: 'pulse', reach: 'pulse',
    battery: 'battery', standard: 'battery', drain: 'battery',
    none: 'none', borrowed: 'none', silent: 'none',
    vibrate: 'vibrate', vibration: 'vibrate', unread: 'vibrate', buzz: 'vibrate',
    nobars: 'nobars', noservice: 'nobars', smile: 'nobars',
    plain: 'plain', bars: 'plain',
  };
  function tellOf(t) {
    if (!t) return null;
    let k = t.tell;
    if (typeof k === 'function') { try { k = k(t.e); } catch (e) { k = null; } }
    if (!k && t.e) k = t.e.tell || t.e.type;
    k = String(k || '').toLowerCase();
    return TELLS[k] || (t.e && TELLS[String(t.e.type || '').toLowerCase()]) || 'plain';
  }
  // lub-dub, 0..1 over one period
  const heart = (p) => Math.max(Math.exp(-(((p - 0.05) / 0.075) ** 2)), 0.78 * Math.exp(-(((p - 0.34) / 0.075) ** 2)));

  function autoReading(dt) {
    let near = null;
    try {
      if (typeof Enemies !== 'undefined' && Enemies && typeof Enemies.nearestThreat === 'function' && typeof Player !== 'undefined' && Player.actor) near = Enemies.nearestThreat(Player.pos);
    } catch (e) { near = null; }
    const d = near && isFinite(+near.dist) ? +near.dist : Infinity;
    const kind = near && d < 20 ? tellOf(near) : null;
    const prox = kind ? clamp((20 - d) / 17) : 0;
    st.tell = kind; st.dist = d; st.prox = prox;
    // bars from distance: 0 beyond 20 m, 5 within 3 m, 1–4 spread linearly between (with a little hysteresis so a
    // monster pacing on a boundary doesn't make the bars chatter)
    const raw = !kind ? 0 : d <= 3 ? 5 : 1 + ((20 - d) / 17) * 4;
    let n = st.autoN;
    if (raw <= 0) n = 0;
    else if (raw >= 5) n = 5;
    else {
      const f = Math.floor(raw);
      if (f > n) { if (n === 0 || raw >= f + 0.06) n = f; }
      else if (f < n && raw < n - 0.06) n = f;
    }
    // the Standard drains the battery instead; everything else lets it creep back
    if (kind === 'battery') {
      const target = 1 - prox * 0.999;
      st.batt = st.batt > target ? Math.max(target, st.batt - 0.3 * dt) : Math.min(1, st.batt + 0.04 * dt);
    } else st.batt = Math.min(1, st.batt + 0.05 * dt);
    let shown = n, mode = 'normal', stat = prox * 0.85;
    switch (kind) {
      case 'none': shown = 0; n = 0; stat = 0; break;
      case 'nobars': shown = 0; n = 0; mode = 'none'; stat = 0; break;
      case 'battery': shown = 0; stat = prox * 0.55; break;
      case 'pulse': {
        const period = U.lerp(0.8, 0.42, prox);
        const before = st.pulse;
        st.pulse = (st.pulse + dt / period) % 1;
        if (st.pulse < before) sfx('heartbeat', { vol: 0.12 + 0.4 * prox });      // one beat per period
        shown = Math.round(heart(st.pulse) * n);
        break;
      }
      case 'vibrate': {
        st.vibT -= dt;
        if (st.vibT <= 0) {
          st.vibT = U.lerp(1.0, 0.45, prox);
          const h = sfx('vibrate', { short: true, vol: 0.25 + 0.45 * prox });
          if (!h || !h.dur) inp('rumble', 0.05, 0.3 + 0.4 * prox, 300);
        }
        break;
      }
      case 'eftpos':
        if (n > st.beepN) sfx('eftpos', { vol: 0.3 + 0.4 * prox, lp: 5000 });
        break;
      default: break;
    }
    st.autoN = n;
    st.beepN = n;
    return { n: shown, mode, battery: st.batt, static: stat };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The unreliable signal (the default; see the header)
  // ---------------------------------------------------------------------------------------------------------------
  const signalMode = () => { try { return META && META.options && META.options.signal === 'classic' ? 'classic' : 'unreliable'; } catch (e) { return 'unreliable'; } };
  const hasEnemies = () => typeof Enemies !== 'undefined' && !!Enemies && typeof Enemies.nearestThreat === 'function';
  const hasPlayer = () => typeof Player !== 'undefined' && !!Player && !!Player.actor;
  function awareNear() {
    try { if (hasEnemies() && hasPlayer()) return Enemies.nearestThreat(Player.pos, { aware: true }); } catch (e) { /* not ready */ }
    return null;
  }
  const scriptBusy = () => { try { return typeof Script !== 'undefined' && !!Script && (!!Script.busy || !!Script.cutscene); } catch (e) { return false; } };
  // the player is playing: control, no blocking script, no menu
  const playerFree = () => { try { return hasPlayer() && !Player.dead && !!Player.canControl && !scriptBusy() && !menusOpen(); } catch (e) { return false; } };
  // anything that owns the phone or the player rules a phantom out (and ends one under way)
  function phantomBlocked() {
    if (st.ov || st.ring || st.inCall || st.display) return true;
    if (!playerFree()) return true;
    try { if (typeof UI !== 'undefined' && UI && UI.capturing && UI.capturing()) return true; } catch (e) { /* ui */ }
    try { if (typeof World !== 'undefined' && World && (World.outageBusy || World.transitioning)) return true; } catch (e) { /* world */ }
    return false;
  }
  const phantomGate = () => !!S && (S.chapter || 0) >= PHONE_TUNE.minChapter && !!(S.done && S.done['signal:real']);
  function seedSignal() {
    const base = ((PHONE_TUNE.seed >>> 0) ^ U.hash(`${(S && S.chapter) || 0}|${Math.floor((S && S.stats && S.stats.time) || 0)}|${(S && S.playthrough) || 1}`)) >>> 0;
    un.rng = U.rng(base);
    un.jrng = U.rng((base ^ 0x9e3779b9) >>> 0);
  }
  const between = (r, a) => a[0] + r() * (a[1] - a[0]);
  function gauss(r) { const a = Math.max(1e-9, r()), b = r(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
  // S.done['signal:real']: the first second of play with an aware threat reading in range (either mode)
  function markReal(real, dt, shown) {
    if (!real || !playerFree()) { un.realT = 0; return; }
    un.realT += dt;
    if (un.realT < PHONE_TUNE.realAfter || !shown || !S || (S.done && S.done['signal:real'])) return;
    S.done = S.done || {};
    S.done['signal:real'] = true;
    try { Bus.emit('signal:real'); } catch (e) { console.error('[Phone] signal:real', e); }
  }
  function startPhantom() {
    const T = PHONE_TUNE, r = un.rng;
    const lo = Math.round(T.phantomBars[0]), hi = Math.round(T.phantomBars[1]);
    const peak = r() < T.phantomFour ? 4 : clamp(lo + Math.floor(r() * (hi - lo + 1)), 1, 4);
    const rise = between(r, T.phantomRise), hold = between(r, T.phantomHold), fall = between(r, T.phantomFall);
    const tell = r() < T.phantomTell ? ['eftpos', 'vibrate', 'keys'][Math.floor(r() * 3) % 3] : null;
    un.ph = { t: 0, peak, rise, hold, fall, tell, tellAt: rise + r() * Math.min(1.5, hold * 0.5), told: false, top: 0 };
    un.phantoms++;
    try { Bus.emit('signal:phantom', { peak, tell }); } catch (e) { console.error('[Phone] signal:phantom', e); }
  }
  function endPhantom() { un.ph = null; un.quietT = 0; un.quietU = null; }
  // the phantom's own envelope → {v (bars, continuous), stat}
  function phantomStep(dt) {
    const P = un.ph, T = PHONE_TUNE;
    P.t += dt;
    const top = P.peak + 0.5, t = P.t;
    let k;
    if (t < P.rise) k = U.ease.inOut(t / P.rise);
    else if (t < P.rise + P.hold) k = 1;
    else if (t < P.rise + P.hold + P.fall) k = 1 - U.ease.inOut((t - P.rise - P.hold) / P.fall);
    else { endPhantom(); return null; }
    if (P.tell && !P.told && t >= P.tellAt) {
      P.told = true;
      if (P.tell === 'eftpos') sfx('eftpos', { vol: 0.24, lp: 3600 });
      else if (P.tell === 'vibrate') sfx('vibrate', { short: true, vol: 0.28 });
      else sfx('keys_far', { vol: 0.38, pan: (un.rng() - 0.5) * 1.2 });
    }
    const hk = clamp((t - P.rise) / Math.max(0.01, P.hold));
    const stat = k * U.lerp(T.phantomStatic[0], T.phantomStatic[1], hk) * Math.max(0.5, P.peak / 3);
    return { v: top * k, stat };
  }
  function unreliableReading(dt) {
    const T = PHONE_TUNE;
    if (!un.rng) seedSignal();
    const near = awareNear();
    const d = near && isFinite(+near.dist) ? +near.dist : Infinity;
    const kind = near && d < T.range ? tellOf(near) : null;
    const silent = kind === 'none' || kind === 'nobars';
    const target = !kind || silent ? 0 : d <= T.full ? 5 : 1 + ((T.range - d) / (T.range - T.full)) * 4;
    un.src = kind ? near.e : null; un.dist = d; un.target = target;
    // the lag: exponential toward the true strength (rise faster than fall), never slower than minRate
    const diff = target - un.L;
    if (diff !== 0 && dt > 0) {
      let step = diff * (1 - Math.exp(-dt / (diff > 0 ? T.riseTau : T.fallTau)));
      const minStep = T.minRate * dt;
      if (Math.abs(step) < minStep) step = Math.sign(diff) * Math.min(minStep, Math.abs(diff));
      un.L = clamp(un.L + step, 0, 5);
    }
    // the tell follows the reading: a silent source takes over at once; any other keeps its tell while its reading fades
    if (kind && (silent || target > 0)) un.kind = kind;
    else if (un.L <= 1e-3) un.kind = null;
    // the slow random walk (Ornstein–Uhlenbeck, σ ≈ 0.55 × jitter, clamped at ±jitter)
    if (dt > 0) {
      const tau = Math.max(0.05, T.jitterTau), sd = T.jitter * 0.55;
      un.J = clamp(un.J - (un.J * dt) / tau + sd * Math.sqrt((2 * dt) / tau) * gauss(un.jrng), -T.jitter, T.jitter);
    }
    // phantoms
    const quiet = !(near && d < T.range);
    const blocked = phantomBlocked(), gate = phantomGate();
    if (!quiet) { un.quietT = 0; un.quietU = null; if (un.ph) endPhantom(); }
    else if (un.ph && (blocked || !gate)) endPhantom();
    else if (!un.ph && gate && !blocked && dt > 0) {
      if (un.quietU === null) un.quietU = un.rng();
      un.quietT += dt;
      const q = S.outage ? T.quiet.outage : T.quiet.fog;
      if (un.quietT >= U.lerp(q[0], q[1], un.quietU)) startPhantom();
    }
    const ph = un.ph ? phantomStep(dt) : null;
    // what shows
    let eff = un.L + un.J * clamp(un.L), fromPh = false, phStat = 0;
    if (ph) { const e2 = ph.v + un.J * clamp(ph.v) * 0.7; phStat = ph.stat; if (e2 > eff) { eff = e2; fromPh = true; } }
    eff = Math.max(0, eff);
    let n = un.n;
    const f = Math.min(5, Math.floor(eff));
    if (f > n) n = eff >= f + T.hyst || f === 5 ? f : Math.max(n, f - 1);
    else if (f < n && eff < n - T.hyst) n = f;
    if (fromPh) n = Math.min(n, 4, un.ph ? un.ph.peak + 1 : 4);
    else if (!(kind && d <= T.full)) n = Math.min(n, 4);
    un.n = n; un.fromPh = fromPh;
    const prox = clamp((eff - 1) / 4);
    const tk = fromPh ? 'phantom' : un.kind;
    st.tell = fromPh ? null : un.kind; st.dist = d; st.prox = prox;
    markReal(!!kind && !silent, dt, un.L >= 1 || kind === 'battery');
    // the Standard drains the battery instead; everything else lets it creep back
    if (tk === 'battery') {
      const tgt = 1 - prox * 0.999;
      st.batt = st.batt > tgt ? Math.max(tgt, st.batt - 0.3 * dt) : Math.min(1, st.batt + 0.04 * dt);
    } else st.batt = Math.min(1, st.batt + 0.05 * dt);
    let shown = n, mode = 'normal', stat = prox * 0.85;
    const live = eff >= 0.5;                     // a tell sounds while there is a reading at all
    switch (tk) {
      case 'phantom': stat = Math.max(stat, phStat); break;
      case 'none': shown = 0; n = 0; stat = 0; break;
      case 'nobars': shown = 0; n = 0; mode = 'none'; stat = 0; break;
      case 'battery': shown = 0; stat = prox * 0.55; break;
      case 'pulse': {
        const period = U.lerp(0.8, 0.42, prox);
        const before = st.pulse;
        st.pulse = (st.pulse + dt / period) % 1;
        if (live && st.pulse < before) sfx('heartbeat', { vol: 0.12 + 0.4 * prox });
        shown = Math.round(heart(st.pulse) * n);
        break;
      }
      case 'vibrate': {
        st.vibT -= dt;
        if (live && st.vibT <= 0) {
          st.vibT = U.lerp(1.0, 0.45, prox);
          const h = sfx('vibrate', { short: true, vol: 0.25 + 0.45 * prox });
          if (!h || !h.dur) inp('rumble', 0.05, 0.3 + 0.4 * prox, 300);
        }
        break;
      }
      case 'eftpos':
        if (n > st.beepN) sfx('eftpos', { vol: 0.3 + 0.4 * prox, lp: 5000 });
        break;
      default: break;
    }
    st.autoN = n;
    st.beepN = n;
    return { n: shown, mode, battery: st.batt, static: stat };
  }
  // a switch of META.options.signal mid-game: the new mode starts from what the phone shows
  function switchSignal(to) {
    const from = un.mode;
    un.mode = to;
    if (from === null) return;
    endPhantom();
    un.J = 0; un.realT = 0;
    if (to === 'unreliable') { un.L = st.n; un.n = st.n; un.kind = st.tell; }
    else st.autoN = st.n;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Overrides
  // ---------------------------------------------------------------------------------------------------------------
  function flickerFn() {
    let n = 0, t = 0;
    return (dt) => {
      t -= dt;
      if (t <= 0) { t = 0.05 + Math.random() * 0.55; n = Math.random() < 0.3 ? 0 : Math.floor(Math.random() * 6); }
      return { n, static: (n / 5) * 0.4 };
    };
  }
  function climbFn(o) {
    const to = clamp(Math.round(+o.climb || 0), 0, 5), from = clamp(Math.round(o.from ?? st.n), 0, 5);
    const dur = Math.max(0.01, +o.dur || Math.abs(to - from) * 0.55 || 0.5);
    let t = 0;
    return (dt) => { t = Math.min(dur, t + dt); return { n: Math.round(U.lerp(from, to, t / dur)) }; };
  }
  function override(spec, o = {}) {
    if (spec === null || spec === undefined || spec === false) { st.ov = null; return null; }
    let fn = null;
    if (typeof spec === 'function') fn = spec;
    else if (typeof spec === 'number') { const v = clamp(Math.round(spec), 0, 5); fn = () => ({ n: v }); }
    else if (spec === 'noservice') fn = () => ({ n: 0, mode: 'noservice', static: 0 });
    else if (spec === 'none' || spec === 'nobars') fn = () => ({ n: 0, mode: 'none', static: 0 });
    else if (spec === 'flicker') fn = flickerFn();
    else if (spec === 'auto') { st.ov = null; return null; }
    else if (typeof spec === 'object') {
      if (spec.climb !== undefined) fn = climbFn(spec);
      else { const r = { n: clamp(Math.round(spec.n ?? 0), 0, 5), mode: spec.mode || 'normal', battery: spec.battery, static: spec.static, letterbox: spec.letterbox }; fn = () => r; }
      if (spec.tell && !o.tell) o = { ...o, tell: spec.tell };
    }
    if (!fn) { console.warn('[Phone] unknown override', spec); return null; }
    st.ov = { fn, room: !!o.room, tell: o.tell || null };
    st.ovBeepN = st.n;
    return st.ov;
  }
  const bars = (n, o = {}) => override(n, o);

  // ---------------------------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------------------------
  function update(dt) {
    if (dt === undefined) dt = (typeof Time !== 'undefined' && Time.dt) || 0;
    dt = Math.max(0, +dt || 0);
    clock += dt;
    const sm = signalMode();
    if (sm !== un.mode) switchSignal(sm);
    let auto;
    if (sm === 'classic') {
      auto = autoReading(dt);
      // (the classic radar reads every threat; the gate for phantoms still notes a first real, aware reading)
      if (!(S && S.done && S.done['signal:real'])) {
        const a = awareNear(), ad = a && isFinite(+a.dist) ? +a.dist : Infinity, ak = a && ad < PHONE_TUNE.range ? tellOf(a) : null;
        markReal(!!ak && ak !== 'none' && ak !== 'nobars', dt, true);
      }
    } else auto = unreliableReading(dt);
    let r = auto, fromOv = false;
    if (st.ov) {
      let v = null;
      try { v = st.ov.fn(dt, auto); } catch (e) { console.error('[Phone] override', e); st.ov = null; }
      if (v !== null && v !== undefined) { r = typeof v === 'number' ? { n: v } : v; fromOv = true; }
    }
    const n = clamp(Math.round(+r.n || 0), 0, 5);
    const mode = r.mode || 'normal';
    if (fromOv && st.ov && st.ov.tell && n > st.ovBeepN) {
      if (st.ov.tell === 'eftpos') sfx('eftpos', { vol: 0.55, lp: 5000 });
      else if (st.ov.tell === 'vibrate') sfx('vibrate', { short: true, vol: 0.5 });
    }
    if (fromOv) st.ovBeepN = n;
    const battery = r.battery !== undefined && r.battery !== null ? clamp(r.battery) : st.batt;
    const seg = Math.max(0, Math.ceil(battery * 4 - 1e-6));
    if (seg < st.battSeg) sfx('battery', { vol: 0.45 });
    st.battSeg = seg;
    let stat = r.static !== undefined && r.static !== null ? r.static : fromOv ? Math.max(auto.static, (n / 5) * 0.5) : auto.static;
    if (mode === 'noservice' || mode === 'none') stat = r.static ?? 0;
    try { if (typeof Script !== 'undefined' && Script.cutscene) stat *= 0.6; } catch (e) { /* no script */ }
    st.staticV = dt > 0 ? U.damp(st.staticV, clamp(stat), 5, dt) : clamp(stat);
    st.n = n; st.mode = mode; st.battery = battery;
    try { if (typeof Snd !== 'undefined' && Snd.staticLevel) Snd.staticLevel(st.staticV < 0.01 ? 0 : st.staticV); } catch (e) { /* audio */ }
    ui('bars', n, { mode, battery, letterbox: !!(fromOv && r.letterbox) });   // {letterbox:true}: shown under the letterbox too
    refreshScreen(dt);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Calls
  // ---------------------------------------------------------------------------------------------------------------
  const tracked = (def, id) => def.track !== false && (def.track === true || typeof def.track === 'object' || /^luka/i.test(String(def.caller || '')) || /^luka/i.test(String(id)));
  const callerOf = (def, id) => String(def.callerText || def.caller || String(id).replace(/\d+$/, '')).toUpperCase();
  function callDef(id, o = {}) {
    const base = (typeof CALLS !== 'undefined' && CALLS[id]) || null;
    if (!base && !o.def) return null;
    return { id, ...(base || {}), ...(o.def || {}) };
  }
  // ring(id, {window (s, default 8), force, until: () => bool, cancelOnLeave}) → 'answered' | 'declined' | 'cancelled'
  //   CONTRACT+ until / cancelOnLeave / Phone.cancel(id): a call that has not been answered yet is withdrawn — no
  //   S.calls entry, no F/A, no voicemail — when until() turns true, when Aidan leaves the room it was rung in
  //   (cancelOnLeave), or on Phone.cancel(id). Otherwise a pending call waits for any scene to hand control back.
  const cancelled = new Set();
  function ring(callId, o = {}) {
    const def = callDef(callId, o);
    if (!def) { console.warn(`[Phone] no call "${callId}"`); return Promise.resolve('declined'); }
    if (S.calls && S.calls[callId] && !o.force) return Promise.resolve(S.calls[callId]);
    cancelled.delete(callId);
    if (st.ring) {
      if (st.ring.id === callId) return st.ring.promise;
      // one call at a time: this one rings after the current one ends (unless it is cancelled meanwhile)
      return st.ring.promise.then(() => (cancelled.has(callId) ? (cancelled.delete(callId), 'cancelled') : ring(callId, o)));
    }
    const room = typeof World !== 'undefined' ? World.room : null;
    const R = { id: callId, def, caller: callerOf(def, callId), t: 0, force: null, promise: null, window: +o.window > 0 ? +o.window : 8, room };
    R.gone = () => {
      if (R.cancel) return true;
      try { if (typeof o.until === 'function' && o.until(S)) return (R.cancel = true); } catch (e) { console.error('[Phone] ring until()', e); }
      if (o.cancelOnLeave && typeof World !== 'undefined' && World.room !== R.room) return (R.cancel = true);
      return false;
    };
    st.ring = R;
    R.promise = Script.run((G) => ringFlow(G, R, o), { control: true, persist: true, name: 'ring:' + callId })
      .then((r) => (r === Script.ABORT || r === undefined ? (S.calls && S.calls[callId]) || 'declined' : r));
    return R.promise;
  }
  async function ringFlow(G, R, o) {
    const { id, def } = R;
    // the player must be able to answer: a call rung by a trigger waits for a running scene to hand control back, and
    // its 8 s window pauses (prompt hidden) whenever a blocking script or a menu owns the input
    const isFree = () => !R.force && !menusOpen() && !(typeof UI !== 'undefined' && UI.capturing && UI.capturing()) && (!Script.busy || Script.owns(o.parent));
    if (!isFree() && !R.force) await G.until(() => isFree() || !!R.force || R.gone());
    if (R.gone() && !R.force) { if (st.ring === R) st.ring = null; Bus.emit('call:end', id, 'cancelled'); return 'cancelled'; }
    R.live = true;
    Bus.emit('call:ring', id);
    const vib = !(typeof META !== 'undefined' && META.options && META.options.vibration === false);
    const h = sfx('ring', { buzz: vib, vol: 0.7 });
    let shown = false, how = 'declined';
    try {
      await G.loop((dt) => {
        if (R.force) { how = R.force; return true; }
        if (R.gone()) { how = 'cancelled'; return true; }
        const free = isFree();
        if (free !== shown) { shown = free; ui('callPrompt', free ? R.caller : null, { window: Math.max(0.5, R.window - R.t) }); }
        if (!free) return false;
        R.t += dt;
        if (inp('pressed', 'interact')) { inp('consume', 'interact'); how = 'answered'; return true; }
        if (inp('pressed', 'decline')) { inp('consume', 'decline'); how = 'declined'; return true; }
        if (R.t >= R.window) { how = 'declined'; return true; }
        return false;
      }, { interactive: true });
    } finally {
      if (h && h.stop) h.stop(0);
      ui('callPrompt', null);
      if (st.ring === R && how !== 'answered') st.ring = null;
    }
    if (how === 'cancelled') { if (st.ring === R) st.ring = null; Bus.emit('call:end', id, 'cancelled'); return 'cancelled'; }
    S.calls = S.calls || {};
    S.stats = S.stats || {};
    if (how === 'answered') {
      S.calls[id] = 'answered';
      S.stats.callsAnswered = (S.stats.callsAnswered || 0) + 1;
      if (tracked(def, id)) track('F', typeof def.track === 'object' && def.track.answer ? def.track.answer : 2, 'call:' + id);
      st.ring = null;
      st.inCall = { id, caller: R.caller, t0: clock };
      sfx('click', { vol: 0.5 });
      const act = typeof Player !== 'undefined' && Player.actor ? Player.actor : null;
      const prevPose = act && act.state && act.state.carry ? act.state.carry.R : null;
      if (act && act.armPose) act.armPose('R', 'phone_ear');
      try {
        if (typeof def.answer === 'function') {
          await Script.run((G2) => def.answer(G2), { control: def.control ?? false, letterbox: false, skippable: false, parent: o.parent || null, persist: true, name: 'call:' + id });
        }
      } finally {
        if (act && act.armPose) act.armPose('R', prevPose || 'phone');
        st.inCall = null;
        sfx('beep', { vol: 0.35 });
        Bus.emit('call:end', id, 'answered');
      }
      return 'answered';
    }
    S.calls[id] = 'declined';
    if (tracked(def, id)) track('A', typeof def.track === 'object' && def.track.decline ? def.track.decline : 2, 'call:' + id);
    if (def.voicemail !== undefined && def.voicemail !== null && def.voicemail !== false) {
      S.voicemails = S.voicemails || [];
      S.voicemails.push({ id, played: false });
      Script.run(async (G3) => { await G3.wait(1.6); G3.sfx('msgchime', { vol: 0.45 }); }, { control: true, persist: true, name: 'voicemail:notify' });
    }
    Bus.emit('call:end', id, 'declined');
    return 'declined';
  }
  function answer() { if (!st.ring) return false; st.ring.force = 'answered'; return true; }
  // CONTRACT+: Phone.cancel(id?) — withdraw a pending / ringing call (the current one when id is omitted) that has not
  // been answered: no S.calls entry, no F/A, no voicemail; G.call resolves 'cancelled'. A call queued behind another
  // one is dropped before it rings. → true if something was cancelled.
  function cancel(id) {
    if (st.ring && (id === undefined || id === null || st.ring.id === id) && !st.inCall) { st.ring.cancel = true; return true; }
    if (id) { cancelled.add(id); return true; }
    return false;
  }
  function decline() { if (!st.ring) return false; st.ring.force = 'declined'; return true; }

  // ---------------------------------------------------------------------------------------------------------------
  // Voicemails
  // ---------------------------------------------------------------------------------------------------------------
  function voicemailText(i) {
    const vm = S.voicemails && S.voicemails[i];
    if (!vm) return null;
    const def = callDef(vm.id) || {};
    if (typeof def.voicemail === 'string') return def.voicemail;
    // a scripted voicemail (async G => …): its transcript comes from CALLS[id].voicemailText (or .text, or a `text`
    // property on the function)
    const t = def.voicemailText ?? def.text ?? (def.voicemail && def.voicemail.text);
    return typeof t === 'string' ? t : '';
  }
  function playVoicemail(i) {
    const vm = S.voicemails && S.voicemails[i];
    if (!vm) return Promise.resolve(false);
    const def = callDef(vm.id) || { id: vm.id };
    if (!vm.played) {
      vm.played = true;
      S.stats.voicemails = (S.stats.voicemails || 0) + 1;
      if (tracked(def, vm.id)) track('F', 1, 'voicemail:' + vm.id);
      Bus.emit('voicemail', vm.id);
    }
    const caller = callerOf(def, vm.id);
    return Script.run(async (G) => {
      const act = typeof Player !== 'undefined' && Player.actor ? Player.actor : null;
      const prevPose = act && act.state && act.state.carry ? act.state.carry.R : null;
      if (act && act.armPose) act.armPose('R', 'phone_ear');
      st.inCall = { id: vm.id, caller, voicemail: true, t0: clock };
      try {
        G.sfx('beep', { vol: 0.35 });
        await G.wait(0.5);
        if (typeof def.voicemail === 'function') await def.voicemail(G);
        else {
          const text = String(def.voicemail || '');
          if (/\S/.test(text.replace(/\[[^\]]*\]/g, ''))) await G.say(`${caller} (phone)`, text, { phone: true });
          else if (text) await G.say(null, text, { phone: true });       // sound-only voicemails: "[static] [keys]"
          else { G.sfx('static', { dur: 2.5, vol: 0.5 }); await G.wait(2.5); }
        }
        await G.wait(0.3);
        G.sfx('beep', { vol: 0.35 });
      } finally {
        st.inCall = null;
        if (act && act.armPose) act.armPose('R', prevPose || 'phone');
      }
      return true;
    }, { control: true, persist: true, name: 'voicemail:' + vm.id });
  }
  function voicemails() {
    return (S.voicemails || []).map((v, i) => { const def = callDef(v.id) || {}; return { i, id: v.id, played: !!v.played, caller: callerOf(def, v.id), n: def.n ?? null, text: voicemailText(i) }; });
  }
  function callLog() {
    return Object.entries(S.calls || {}).map(([id, how]) => { const def = callDef(id) || {}; return { id, how, caller: callerOf(def, id), n: def.n ?? null }; })
      .sort((a, b) => (a.n ?? 99) - (b.n ?? 99));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Notes (Aidan's automatic journal)
  // ---------------------------------------------------------------------------------------------------------------
  function note(text, o = {}) {
    if (text === null || text === undefined || text === '') return null;
    text = String(text);
    S.notes = S.notes || [];
    if (o.replace !== undefined) done(o.replace, true);
    let n = o.id ? S.notes.find((x) => x.id === o.id) : S.notes.find((x) => x.text === text);
    if (n) {
      if (n.text !== text || (o.done !== undefined && !!o.done !== !!n.done)) {
        const changed = n.text !== text;
        n.text = text; n.done = !!o.done;
        if (changed) { S.notes.splice(S.notes.indexOf(n), 1); S.notes.push(n); if (!o.silent) sfx('scribble', { dur: 0.5, vol: 0.3 }); Bus.emit('note', n); }
      }
      return n;
    }
    n = { text, done: !!o.done };
    if (o.id) n.id = String(o.id);
    S.notes.push(n);
    if (!o.silent) sfx('scribble', { dur: 0.5, vol: 0.3 });
    Bus.emit('note', n);
    return n;
  }
  function done(key, v = true) {
    const n = (S.notes || []).find((x) => x.id === key || x.text === key);
    if (!n) return null;
    n.done = !!v;
    return n;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The phone's screen (teal-on-black LCD, a little dated)
  // ---------------------------------------------------------------------------------------------------------------
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
  const norm = (s) => String(s ?? '').toUpperCase().replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const textW = (s, px) => Math.max(0, norm(s).length * 6 - 1) * px;
  function txt(x, str, gx, gy, px, color) {
    x.fillStyle = color;
    let cx = gx;
    for (const ch of norm(str)) {
      const g = FONT5[ch] || FONT5[' '];
      for (let r = 0; r < 7; r++) { const row = g[r]; if (!row) continue; for (let c = 0; c < 5; c++) if (row & (16 >> c)) x.fillRect(cx + c * px, gy + r * px, px, px); }
      cx += 6 * px;
    }
  }
  const ctr = (x, str, cx, gy, px, color) => txt(x, str, Math.round(cx - textW(str, px) / 2), gy, px, color);
  // the largest pixel size (≤ max) that fits `str` into `w`
  const fitPx = (str, w, max) => { for (let p = max; p > 1; p--) if (textW(str, p) <= w) return p; return 1; };
  function drawBars(x, gx, gy, lit, mode) {
    for (let i = 0; i < 5; i++) {
      const h = 3 + i * 3;
      x.fillStyle = mode !== 'none' && i < lit ? LCD_ON : LCD_OFF;
      x.fillRect(gx + i * 5, gy + 15 - h, 3, h);
    }
  }
  function drawBattery(x, gx, gy, segs) {
    x.fillStyle = LCD_MID;
    x.fillRect(gx, gy, 20, 1); x.fillRect(gx, gy + 9, 20, 1); x.fillRect(gx, gy, 1, 10); x.fillRect(gx + 19, gy, 1, 10);
    x.fillRect(gx + 20, gy + 3, 2, 4);
    for (let j = 0; j < 4; j++) { x.fillStyle = j < segs ? LCD_ON : LCD_OFF; x.fillRect(gx + 2 + j * 4, gy + 2, 3, 6); }
  }
  function drawHandset(x, gx, gy, px, color, wob) {
    // an old handset glyph (11 × 7)
    const rows = ['01110001110', '11111111111', '11000000011', '11000000011', '11000000011', '00000000000', '00000000000'];
    x.fillStyle = color;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '1') x.fillRect(gx + i * px + (j < 2 ? wob : 0), gy + j * px, px, px); });
  }
  function drawEnvelope(x, gx, gy, color) {
    x.fillStyle = color;
    x.fillRect(gx, gy, 11, 1); x.fillRect(gx, gy + 7, 11, 1); x.fillRect(gx, gy, 1, 8); x.fillRect(gx + 10, gy, 1, 8);
    for (let i = 1; i < 5; i++) { x.fillRect(gx + i, gy + i, 1, 1); x.fillRect(gx + 10 - i, gy + i, 1, 1); }
  }
  // drawScreen(ctx, w, h): the whole screen in a 128 × 256 design space (scaled uniformly to the canvas)
  function drawScreen(x, w, h) {
    w = w || x.canvas.width; h = h || x.canvas.height;
    x.save();
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const k = Math.min(w / 128, h / 256);
    x.translate(Math.round((w - 128 * k) / 2), Math.round((h - 256 * k) / 2));
    x.scale(k, k);
    x.fillStyle = LCD_BG; x.fillRect(0, 0, 128, 256);
    // backlight: a weak teal glow, brighter toward the top
    const g = x.createRadialGradient(64, 70, 4, 64, 110, 170);
    g.addColorStop(0, 'rgba(24,82,76,0.42)'); g.addColorStop(0.55, 'rgba(10,40,37,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 256);
    const blink = Math.floor(clock * 2.5) % 2 === 0;
    const disp = st.display;
    // status row: bars (or NO SERVICE), battery
    const barsMode = disp && disp.bars !== undefined ? (disp.bars === 'noservice' ? 'noservice' : 'normal') : st.mode;
    const lit = disp && typeof disp.bars === 'number' ? disp.bars : st.n;
    if (barsMode === 'noservice' || (barsMode === 'normal' && lit === 0)) { drawBars(x, 6, 6, 0, 'none'); txt(x, 'NO SERVICE', 35, 11, 1, LCD_MID); }
    else if (barsMode === 'none') txt(x, '', 6, 11, 1, LCD_MID);
    else drawBars(x, 6, 6, lit, 'normal');
    drawBattery(x, 100, 9, st.battSeg);
    x.fillStyle = LCD_DIM; x.fillRect(4, 26, 120, 1);
    if (disp) drawDisplay(x, disp, blink);
    else if (st.ring && st.ring.live) {
      const R = st.ring;
      if (blink) ctr(x, 'INCOMING CALL', 64, 44, 1, LCD_MID);
      drawHandset(x, 42, 62, 4, LCD_ON, blink ? -2 : 2);
      const px = fitPx(R.caller, 118, 3);
      ctr(x, R.caller, 64, 106, px, LCD_ON);
      const left = Math.max(0, Math.ceil(R.window - R.t));
      ctr(x, String(left), 64, 150, 1, LCD_DIM);
      x.fillStyle = LCD_DIM; x.fillRect(4, 226, 120, 1);
      txt(x, 'ANSWER', 6, 234, 1, LCD_ON); txt(x, 'DECLINE', 122 - textW('DECLINE', 1), 234, 1, LCD_ON);
    } else if (st.inCall) {
      const c = st.inCall;
      ctr(x, c.voicemail ? 'VOICEMAIL' : 'CONNECTED', 64, 44, 1, LCD_MID);
      ctr(x, c.caller, 64, 66, fitPx(c.caller, 118, 3), LCD_ON);
      // a small level meter that twitches while the line is open
      for (let i = 0; i < 9; i++) { const hh = 2 + Math.round(Math.abs(Math.sin(clock * 7 + i * 1.7)) * 8); x.fillStyle = i % 2 ? LCD_DIM : LCD_MID; x.fillRect(37 + i * 6, 120 - hh, 4, hh); }
      x.fillStyle = LCD_DIM; x.fillRect(4, 226, 120, 1);
      txt(x, 'END', 122 - textW('END', 1), 234, 1, LCD_ON);
    } else {
      // home: the clock that never tells the time
      ctr(x, '--:--', 64, 52, 4, LCD_ON);
      ctr(x, '--/--', 64, 92, 1, LCD_DIM);
      const unplayed = (S.voicemails || []).filter((v) => !v.played).length;
      if (unplayed) { drawEnvelope(x, 48, 120, LCD_MID); txt(x, String(unplayed), 63, 120, 1, LCD_MID); }
      const openNotes = (S.notes || []).filter((nn) => !nn.done);
      if (openNotes.length) {
        const last = openNotes[openNotes.length - 1].text;
        wrap(last, 20).slice(0, 4).forEach((ln, i) => txt(x, ln, 6, 150 + i * 10, 1, LCD_DIM));
      }
      x.fillStyle = LCD_DIM; x.fillRect(4, 226, 120, 1);
      txt(x, 'MENU', 6, 234, 1, LCD_MID); txt(x, 'NOTES', 122 - textW('NOTES', 1), 234, 1, LCD_MID);
    }
    // LCD texture: dark gaps between pixel rows, a faint glass sheen
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let yy = 1; yy < 256; yy += 2) x.fillRect(0, yy, 128, 1);
    const sh = x.createLinearGradient(0, 0, 128, 256);
    sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.0)'); sh.addColorStop(1, 'rgba(255,255,255,0.02)');
    x.fillStyle = sh; x.fillRect(0, 0, 128, 256);
    x.restore();
  }
  function wrap(str, cols) {
    const words = norm(str).split(/\s+/), out = [];
    let line = '';
    for (const w0 of words) {
      const t = line ? line + ' ' + w0 : w0;
      if (t.length > cols && line) { out.push(line); line = w0; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
  function drawDisplay(x, d, blink) {
    let y = 40;
    if (d.title && (!d.blink || blink)) { ctr(x, d.title, 64, y, fitPx(d.title, 118, d.big ? 3 : 2), d.titleColor || LCD_MID); }
    y += d.big ? 30 : 24;
    if (d.caller) { const px = fitPx(d.caller, 118, 3); ctr(x, d.caller, 64, y, px, LCD_ON); y += px * 7 + 12; }
    for (const ln of d.lines || []) {
      for (const part of wrap(ln, 20)) { ctr(x, part, 64, y, 1, LCD_ON); y += 10; }
      y += 2;
    }
    if (d.button) {
      const bw = Math.max(40, textW(d.button, 2) + 16), bx = 64 - bw / 2, by = 196;
      x.fillStyle = d.buttonColor || '#2fbf5a'; x.fillRect(bx, by, bw, 22);
      ctr(x, d.button, 64, by + 4, 2, '#031008');
    }
  }
  function display(spec) { st.display = spec || null; st.scrKey = ''; return st.display; }
  function screenKey() {
    const animated = !!(st.ring || st.inCall || (st.display && st.display.blink));
    return [st.n, st.mode, st.battSeg, st.ring ? st.ring.id + Math.ceil(st.ring.window - st.ring.t) : '', st.inCall ? st.inCall.id : '', animated ? Math.floor(clock * 8) : '',
      st.display ? JSON.stringify(st.display) : '', (S.voicemails || []).filter((v) => !v.played).length, (S.notes || []).length].join('|');
  }
  function refreshScreen(dt) {
    const act = typeof Player !== 'undefined' && Player.actor ? Player.actor : null;
    const ps = act && act.phoneScreen;
    if (!ps || typeof ps.draw !== 'function') return;
    st.scrT -= dt;
    const key = screenKey();
    if (key === st.scrKey && st.scrT > 0) return;
    st.scrKey = key; st.scrT = 1.0;
    try { ps.draw((c, w, h) => drawScreen(c, w, h)); } catch (e) { console.error('[Phone] screen', e); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Reset / events
  // ---------------------------------------------------------------------------------------------------------------
  function reset() {
    if (st.ring) { st.ring.force = 'declined'; }
    st.ring = null; st.inCall = null; st.ov = null; st.display = null;
    st.batt = 1; st.battSeg = 4; st.autoN = 0; st.beepN = 0; st.n = 0; st.staticV = 0; st.scrKey = '';
    resetSignal();
    ui('callPrompt', null);
    ui('bars', 0, { mode: 'normal', battery: 1 });
    try { if (typeof Snd !== 'undefined' && Snd.staticLevel) Snd.staticLevel(0); } catch (e) { /* audio */ }
  }
  // the unreliable signal starts clean (and reseeds from S at the next update: a load replays the same phantoms)
  function resetSignal() {
    un.L = 0; un.J = 0; un.n = 0; un.kind = null; un.src = null; un.target = 0; un.dist = Infinity; un.realT = 0; un.fromPh = false;
    un.ph = null; un.quietT = 0; un.quietU = null; un.rng = null; un.jrng = null;
  }
  Bus.on('room:leave', () => { if (st.ov && st.ov.room) st.ov = null; st.autoN = 0; st.beepN = 0; un.L = 0; un.J = 0; un.n = 0; un.kind = null; if (un.ph) endPhantom(); });
  Bus.on('death', () => { st.ring = null; st.inCall = null; ui('callPrompt', null); });

  return {
    update, bars, override, ring, answer, decline, cancel, playVoicemail, voicemailText, voicemails, callLog,
    note, done, drawScreen, display, reset, tellOf,
    get notes() { return S.notes || []; },
    get ringing() { return st.ring ? st.ring.id : null; },
    get inCall() { return st.inCall ? st.inCall.id : null; },
    get unplayed() { return (S.voicemails || []).filter((v) => !v.played).length; },
    get reading() {
      const unrel = un.mode !== 'classic';
      return {
        bars: st.n, mode: st.mode, battery: st.battery ?? st.batt, static: st.staticV, tell: st.tell, dist: st.dist, override: !!st.ov,
        signal: un.mode || signalMode(), source: unrel && un.src ? un.src.id : null, aware: unrel ? !!un.src : null,
        target: unrel ? un.target : null, lag: unrel ? un.L : null, jitter: unrel ? un.J : null,
        phantom: unrel && !!un.ph, phantomPeak: un.ph ? un.ph.peak : null, phantomTell: un.ph ? un.ph.tell : null, phantoms: un.phantoms,
        quiet: unrel ? un.quietT : null,
      };
    },
    get signalMode() { return signalMode(); },
    TUNE: PHONE_TUNE,
  };
})();
