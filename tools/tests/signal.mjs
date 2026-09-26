// tools/tests/signal.mjs — THE UNRELIABLE SIGNAL (the default, META.options.signal = 'unreliable') and its CLASSIC switch:
//
//   node tools/build.mjs --out .build/signal.html
//   node tools/run.mjs --file .build/signal.html --size 960x540 --quiet --script tools/tests/signal.mjs
//
// All of it in TEST STREET (test_room2: a 24 m road, nothing spawned), Aidan in control, the torch off, facing north:
//   A  only what has found Aidan transmits — each monster type spawned DORMANT in range (a Tethered facing away, one
//      seated, a Reach out of its 12 m sight, an Unread resting on the wall, a Standard facing away, a disguised Borrowed)
//      reads 0 bars, no static, no battery drain, no source (and stays dormant); the same monster in CLASSIC reads at
//      once. Enemies.aware: each type AWARE (the Tethered alerted, the Reach seeing him, the Unread scattered, the
//      Standard gazing at him) is the phone's source; a custom type is aware unless T.aware / def.aware says no; the
//      4 s warm after awareness is lost; nearestThreat without {aware} still returns dormant threats (the torch flicker).
//   B  the lagged, noisy reading: bars rise with lag (≈63 % of the true strength after τ = 1.2 s, not at once) and fall
//      with lag (τ 2.5 s) after the source goes; the EFTPOS tell beeps once per bar as the LAGGED reading climbs (CLASSIC:
//      one beep at once); 5 bars only within 3 m (4 at most at 3.5 m); the wobble moves the bars at a fixed distance;
//      S.done['signal:real'] is set by the first second of play reading an aware threat (not by dormant ones).
//      Phantoms (PHONE_TUNE sped up): none before Chapter 1, none before signal:real, then they come — 1–4 bars under
//      static with no source, with the fake tells when asked for; never while an override shows (the override's bars
//      exactly as authored), a cutscene / blocking script runs, a Phone.display insert is up, a menu is open (one under
//      way ends as the menu opens), or an aware threat is within 20 m (a dormant one doesn't stop them); the same S and
//      seed give the same phantoms; with the real tuning the first comes 50–140 s into a quiet Fog world (35–90 s in the
//      Outage).
//   E  CLASSIC restores the old reading exactly: tick by tick along a moving threat's path the bars equal the old radar's
//      (nearest threat of any kind, 0 beyond 20 m, 5 within 3 m, 1–4 between, 0.06 hysteresis) and no phantom comes;
//      a switch mid-reading carries the bars across; the SIGNAL row in Options (real keys) switches it live and saves
//      it; a META without the key reads UNRELIABLE.
// Prints its evidence and `PASS signal`.
import { ev, report } from './lib.mjs';

// ---- the page-side helpers (installed once) ----------------------------------------------------------------------------
function install() {
  const SH = window.SH, M = SH.mod;
  const Z = window.__sig = {};
  // the live loop stays off for the whole test: game time moves only by SH.advance's 1/30 s ticks (exact lag timings)
  M.Game.manual(true);
  const DEF_TUNE = JSON.parse(JSON.stringify(M.Phone.TUNE));
  Z.tune = (o) => { const T = M.Phone.TUNE; for (const k of Object.keys(DEF_TUNE)) T[k] = JSON.parse(JSON.stringify(DEF_TUNE[k])); Object.assign(T, o || {}); };
  Z.mode = (m) => { M.META.options.signal = m; };
  Z.clear = () => { for (const e of M.Enemies.list.slice()) e.remove(); };
  Z.fresh = async () => { Z.clear(); M.Phone.bars(null); M.Phone.display(null); M.Phone.reset(); M.Player.setTorch(false); SH.teleport(5, 19.5, 180); S().health = 100; await SH.advance(0.2); };
  const S = () => SH.S;
  // a threat that is only a point: aware by default (a custom type) — aware:false on its type or def turns that off
  if (!M.Enemies.types.sig_probe) {
    M.Enemies.defineType('sig_probe', { hp: 1e9, invincible: true, downs: false, body: false, stompable: false, lockable: false, tell: 'plain' });
    M.Enemies.defineType('sig_probe_beep', { hp: 1e9, invincible: true, downs: false, body: false, stompable: false, lockable: false, tell: 'eftpos' });
    M.Enemies.defineType('sig_probe_dormant', { hp: 1e9, invincible: true, downs: false, body: false, stompable: false, lockable: false, tell: 'plain', aware: false });
  }
  Z.probe = (id, d, o = {}) => M.Enemies.spawn({ id, type: o.type || 'sig_probe', pos: [5, 19.5 - d], persist: false, ...o.def });
  Z.at = (e, d) => { e.pos.set(5, e.pos.y, 19.5 - d); };
  // the sounds Phone plays (Snd.play wrapped: name + the phone's reading as it was)
  Z.sounds = [];
  if (!M.Snd.__sig) { const f = M.Snd.play; M.Snd.play = function (name, o) { Z.sounds.push({ name, t: +(Z.t || 0).toFixed(3) }); return f.call(this, name, o); }; M.Snd.__sig = true; }
  // step `sec` of game time in 1/30 s ticks; fn(t) after each tick, t = the game time since this run began (return true
  // to stop). Z.t is the test's own game clock (the sound log's times).
  Z.t = 0;
  Z.run = async (sec, fn) => { const n = Math.round(sec * 30); for (let i = 1; i <= n; i++) { await SH.advance(1 / 30); Z.t += 1 / 30; if (fn && fn(i / 30) === true) break; } };
  Z.rd = () => M.Phone.reading;
  // sample the reading for `sec`: max / min bars, max static, min battery, phantoms seen, sources seen
  Z.sample = async (sec, o = {}) => {
    const r = { maxBars: 0, minBars: 9, maxStatic: 0, minBatt: 1, phantomTicks: 0, sources: {}, bars: {}, maxPeak: 0, override: 0, modes: {} };
    const p0 = M.Phone.reading.phantoms;
    await Z.run(sec, () => {
      const q = M.Phone.reading;
      r.maxBars = Math.max(r.maxBars, q.bars); r.minBars = Math.min(r.minBars, q.bars); r.maxStatic = Math.max(r.maxStatic, q.static);
      r.minBatt = Math.min(r.minBatt, q.battery); if (q.phantom) { r.phantomTicks++; r.maxPeak = Math.max(r.maxPeak, q.bars); }
      if (q.source) r.sources[q.source] = 1; r.bars[q.bars] = (r.bars[q.bars] || 0) + 1; r.modes[q.mode] = 1;
      if (q.override) r.override++;
      if (o.each) o.each(q);
    });
    r.phantoms = M.Phone.reading.phantoms - p0;
    r.maxStatic = +r.maxStatic.toFixed(3); r.minBatt = +r.minBatt.toFixed(3);
    return r;
  };
  return 1;
}

export default async function (page, h) {
  const t0 = Date.now();
  const notes = [];
  const bad = (m) => notes.push('BUG: ' + m);
  const say = (m) => notes.push(m);
  const J = (o) => JSON.stringify(o);

  try {
    // ---- setup: a new game, TEST STREET, Aidan in control, Chapter 1 -------------------------------------------------
    await ev(h, `let s = 20260926; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      await SH.newGame({ skipIntro: true }); await SH.advance(2); await SH.goto('test_room2', 'south'); await SH.advance(2);
      SH.mod.Script.abortAll('signal'); await SH.advance(0.5); SH.S.chapter = 1; return 1`);
    await ev(h, `return (${install})()`);
    await ev(h, 'await __sig.fresh(); return 1');
    const boot = await ev(h, "return { mode: SH.mode, room: SH.mod.World.room, ctl: SH.mod.Player.canControl, signal: SH.mod.Phone.signalMode, meta: SH.mod.META.options.signal, busy: SH.mod.Script.busy }");
    say(`setup: ${J(boot)}`);
    if (!boot.ctl || boot.busy || boot.room !== 'test_room2') bad('the setup did not leave Aidan in control in TEST STREET');
    if (boot.signal !== 'unreliable' || boot.meta !== 'unreliable') bad(`the default signal is ${boot.signal} (META ${boot.meta}), not UNRELIABLE`);

    // =========================================================================================================== A ====
    // each type dormant in range: UNRELIABLE reads nothing, CLASSIC reads it at once
    const DORMANT = [
      ['tethered, idle facing away, 8 m', "{ id: 'sig:teth', type: 'tethered', pos: [5, 11.5], rot: 180, anchor: [5, 11.5], persist: false }", "e.state === 'idle'"],
      ['tethered, seated, 8 m', "{ id: 'sig:tsit', type: 'tethered', pos: [5, 11.5], rot: 180, anchor: [5, 11.5], sit: true, persist: false }", "e.state === 'sit'"],
      ['reach, still, 15 m (beyond its 12 m sight)', "{ id: 'sig:reach', type: 'reach', pos: [5, 4.5], rot: 180, persist: false }", "e.state === 'still' && e.data.rage === 0"],
      ['unread, resting on the wall, ~7 m', "{ id: 'sig:unread', type: 'unread', pos: [9.4, 13.5], count: 30, cluster: [[9.6, 2.2, 13.4], [9.6, 2.5, 13.8]], persist: false }", "e.data.swarm === 'rest'"],
      ['standard, patrol facing away, 10 m', "{ id: 'sig:std', type: 'standard', pos: [5, 9.5], rot: 180, persist: false }", "!e.data.seenT"],
      ['borrowed, disguised, 7 m', "{ id: 'sig:borrowed', type: 'borrowed', disguise: 'wai', pos: [2.4, 12.8], rot: 180, persist: false }", 'e.disguised'],
    ];
    for (const [what, def, still] of DORMANT) {
      const r = await ev(h, `await __sig.fresh(); delete SH.S.done['signal:real']; __sig.mode('unreliable');
        const e = SH.mod.Enemies.spawn(${def}); if (!e) return { err: 'no spawn' };
        const u = await __sig.sample(3); const uAware = SH.mod.Enemies.aware(e), uStill = !!(${still});
        const near = SH.mod.Enemies.nearestThreat(SH.mod.Player.pos), nearA = SH.mod.Enemies.nearestThreat(SH.mod.Player.pos, { aware: true });
        __sig.mode('classic');
        const c = await __sig.sample(2); const cStill = !!(${still});
        const real = !!SH.S.done['signal:real'];
        __sig.mode('unreliable'); e.remove();
        return { u, c, uAware, uStill, cStill, near: near ? +near.dist.toFixed(1) : null, nearA: nearA ? nearA.e.id : null, real, threat: e.type !== 'borrowed' };`);
      if (r.err) { bad(`${what}: ${r.err}`); continue; }
      say(`A dormant ${what}: UNRELIABLE bars ≤ ${r.u.maxBars}, static ≤ ${r.u.maxStatic}, battery ≥ ${r.u.minBatt}, sources ${J(Object.keys(r.u.sources))}, aware ${r.uAware}, nearestThreat ${r.near} m / {aware} ${r.nearA}; CLASSIC bars ≤ ${r.c.maxBars}, static ≤ ${r.c.maxStatic}, battery ≥ ${r.c.minBatt}; still dormant ${r.uStill}/${r.cStill}`);
      if (!r.uStill || !r.cStill) bad(`${what}: it did not stay dormant through the check`);
      if (r.u.maxBars !== 0 || r.u.maxStatic > 0.001 || r.u.minBatt < 0.999 || Object.keys(r.u.sources).length || r.uAware || r.nearA) bad(`${what}: UNRELIABLE reads a dormant monster`);
      if (r.real) bad(`${what}: a dormant monster set S.done['signal:real']`);
      if (r.threat) {
        if (r.near === null) bad(`${what}: Enemies.nearestThreat(pos) without {aware} lost the dormant threat (the torch flicker reads it)`);
        if (!(r.c.maxBars > 0 || r.c.minBatt < 0.95) || !(r.c.maxStatic > 0.02)) bad(`${what}: CLASSIC does not read it at once`);
      } else if (r.c.maxBars !== 0) bad(`${what}: a disguised Borrowed reads in CLASSIC`);
    }
    // all of them at once
    {
      const r = await ev(h, `await __sig.fresh();
        const es = [${DORMANT.map((d) => d[1]).join(', ')}].map((d) => SH.mod.Enemies.spawn(d));
        const u = await __sig.sample(4); const aware = es.filter((e) => SH.mod.Enemies.aware(e)).map((e) => e.id);
        for (const e of es) e.remove(); return { u, aware }`);
      say(`A all six dormant at once: bars ≤ ${r.u.maxBars}, static ≤ ${r.u.maxStatic}, battery ≥ ${r.u.minBatt}, aware ${J(r.aware)}`);
      if (r.u.maxBars || r.u.maxStatic > 0.001 || r.u.minBatt < 0.999 || r.aware.length) bad('six dormant monsters together read on the UNRELIABLE phone');
    }

    // each type AWARE: it is the source, and the reading comes
    {
      const r = await ev(h, `const out = {};
        const E = SH.mod.Enemies;
        // Tethered: alerted (the turn, then the offer)
        await __sig.fresh(); let e = E.spawn({ id: 'sig:teth', type: 'tethered', pos: [5, 11.5], rot: 0, anchor: [5, 11.5], persist: false }); e.alert();
        let s = await __sig.sample(3); out.tethered = { aware: E.aware(e), state: e.state, src: Object.keys(s.sources), maxBars: s.maxBars, maxStatic: s.maxStatic }; e.remove();
        // Reach: facing him 9 m off, it sees him (rage builds)
        await __sig.fresh(); e = E.spawn({ id: 'sig:reach', type: 'reach', pos: [5, 10.5], rot: 0, persist: false });
        s = await __sig.sample(2.5); out.reach = { aware: E.aware(e), state: e.state, rage: +e.data.rage.toFixed(0), src: Object.keys(s.sources), maxBars: s.maxBars, maxStatic: s.maxStatic }; e.remove();
        // Unread: scattered off its wall
        await __sig.fresh(); e = E.spawn({ id: 'sig:unread', type: 'unread', pos: [9.4, 13.5], count: 30, cluster: [[9.6, 2.2, 13.4], [9.6, 2.5, 13.8]], persist: false }); e.scatter();
        s = await __sig.sample(1.8); out.unread = { aware: E.aware(e), state: e.data.swarm, src: Object.keys(s.sources), maxBars: s.maxBars, maxStatic: s.maxStatic };
        // … the warm: aware for 4 s after it settles (scatter 2.2 s, then settling), then not
        await __sig.run(0.6); const swarm0 = e.data.swarm; await __sig.run(3.0); out.unreadWarm = { swarm: swarm0, after3: E.aware(e), swarm3: e.data.swarm };
        await __sig.run(1.6); out.unreadWarm.after46 = E.aware(e); e.remove();
        // Standard: facing him 10 m off (its gaze) — the battery drains
        await __sig.fresh(); e = E.spawn({ id: 'sig:std', type: 'standard', pos: [5, 9.5], rot: 0, persist: false });
        s = await __sig.sample(2.5); out.standard = { aware: E.aware(e), seen: !!e.data.seenT, src: Object.keys(s.sources), maxBars: s.maxBars, minBatt: s.minBatt, maxStatic: s.maxStatic }; e.remove();
        // custom types: aware unless T.aware / def.aware says otherwise
        await __sig.fresh(); const a = __sig.probe('sig:p1', 8), b = __sig.probe('sig:p2', 6, { type: 'sig_probe_dormant' }), c = __sig.probe('sig:p3', 5, { def: { aware: false } });
        await __sig.run(0.5); out.custom = { plain: E.aware(a), typeFalse: E.aware(b), defFalse: E.aware(c), nearestAware: (E.nearestThreat(SH.mod.Player.pos, { aware: true }) || {}).e?.id, nearest: (E.nearestThreat(SH.mod.Player.pos) || {}).e?.id };
        __sig.clear(); SH.S.health = 100;
        return out;`);
      say(`A aware: ${J(r)}`);
      for (const k of ['tethered', 'reach', 'unread', 'standard']) {
        const x = r[k];
        if (!x.aware || !x.src.includes('sig:' + (k === 'tethered' ? 'teth' : k === 'standard' ? 'std' : k))) bad(`${k}: aware, but not the phone's source (${J(x)})`);
        if (!(x.maxStatic > 0.05)) bad(`${k}: aware, but no static`);
      }
      if (!(r.tethered.maxBars > 0 && r.reach.maxBars > 0 && r.unread.maxBars > 0)) bad('an aware Tethered / Reach / Unread shows no bars');
      if (!(r.standard.minBatt < 0.95 && r.standard.maxBars === 0)) bad("an aware Standard does not drain the battery (its tell)");
      if (!(r.unreadWarm.after3 === true && r.unreadWarm.after46 === false)) bad(`the awareness warm is not ~4 s (${J(r.unreadWarm)})`);
      if (!(r.custom.plain === true && r.custom.typeFalse === false && r.custom.defFalse === false && r.custom.nearestAware === 'sig:p1' && r.custom.nearest === 'sig:p3')) bad(`custom types' awareness is wrong: ${J(r.custom)}`);
    }

    // =========================================================================================================== B ====
    // lag: a plain probe appears 8 m off (true 3.82 → 3 bars): the bars climb over seconds; it goes: they fall over seconds
    {
      const r = await ev(h, `await __sig.fresh(); delete SH.S.done['signal:real'];
        const T = SH.mod.Phone.TUNE; T.jitter = 0;                      // (the wobble off: the lag alone)
        const e = __sig.probe('sig:lag', 8);
        const tl = []; await __sig.run(6, (t) => { const q = __sig.rd(); tl.push([+t.toFixed(3), q.bars, +q.lag.toFixed(3), +q.target.toFixed(3), +q.static.toFixed(3)]); });
        const real = !!SH.S.done['signal:real'];
        e.remove(); const fall = []; await __sig.run(8, (t) => { const q = __sig.rd(); fall.push([+t.toFixed(3), q.bars, +q.lag.toFixed(3)]); });
        // CLASSIC for comparison
        await __sig.fresh(); __sig.mode('classic'); const c = __sig.probe('sig:lagc', 8); await __sig.run(1 / 30); const cb = __sig.rd().bars;
        c.remove(); await __sig.run(1 / 30); const cb0 = __sig.rd().bars; __sig.mode('unreliable'); __sig.tune();
        return { tl, fall, real, cb, cb0 }`);
      const at = (tl, t) => tl.reduce((b, x) => (Math.abs(x[0] - t) < Math.abs(b[0] - t) ? x : b), tl[0]);
      const r12 = at(r.tl, 1.2), first = (tl, n) => { const x = tl.find((y) => y[1] >= n); return x ? x[0] : null; };
      const t1 = first(r.tl, 1), t3 = first(r.tl, 3), fall0 = r.fall.find((x) => x[1] === 0);
      const f15 = at(r.fall, 1.5);
      say(`B lag (no wobble): a probe 8 m off (true ${r.tl[0][3]} → CLASSIC ${r.cb} bars at once): UNRELIABLE 1 bar at ${t1} s, 3 at ${t3} s; at 1.2 s strength ${r12[2]} of ${r12[3]} (${(r12[2] / r12[3] * 100).toFixed(0)} %), static ${r12[4]}; gone → 1.5 s later still ${f15[1]} bar(s) (strength ${f15[2]}), 0 at ${fall0 ? fall0[0] : '-'} s (CLASSIC: ${r.cb0} at once); signal:real ${r.real}`);
      if (r.cb !== 3 || r.cb0 !== 0) bad(`CLASSIC does not map at once (${r.cb} / ${r.cb0})`);
      if (!(t1 > 0.2 && t3 > 1.0 && t3 < 5)) bad('the bars do not rise with lag');
      if (!(r12[2] / r12[3] > 0.55 && r12[2] / r12[3] < 0.72)) bad('the rise is not τ ≈ 1.2 s');
      if (!(f15[1] >= 1 && fall0 && fall0[0] > 2 && fall0[0] < 8)) bad('the bars do not fall with lag');
      if (!r.real) bad("S.done['signal:real'] was not set by an aware reading in play");
    }
    // a skipped scene resolves the lag at once: it leaves the reading (and the static) the played scene leaves
    {
      const r = await ev(h, `const once = async (skip) => { await __sig.fresh(); SH.mod.Phone.TUNE.jitter = 0; let e = null;
          SH.mod.Script.run(async (G) => { e = __sig.probe('sig:skip', 8); await G.wait(8); }, { control: false, letterbox: true, skippable: true, name: 'signal:skip' });
          await __sig.run(0.2); if (skip) SH.skip(); await __sig.run(20, () => !SH.mod.Script.busy); const q = __sig.rd(); const at = { lag: +q.lag.toFixed(2), target: +q.target.toFixed(2) };
          await __sig.run(1.5); const st = +__sig.rd().static.toFixed(3); if (e) e.remove(); __sig.tune(); return { ...at, static: st }; };
        return { played: await once(false), skipped: await once(true) }`);
      say(`B skip: a scene that brings an aware probe 8 m off — played: strength ${r.played.lag} of ${r.played.target} as it ends, static 1.5 s later ${r.played.static}; skipped: ${r.skipped.lag} of ${r.skipped.target}, static ${r.skipped.static}`);
      if (!(Math.abs(r.skipped.lag - r.skipped.target) < 0.02 && Math.abs(r.played.lag - r.skipped.lag) < 0.05 && Math.abs(r.played.static - r.skipped.static) < 0.02)) bad('a skipped scene leaves a different reading from the played one');
    }
    // the EFTPOS tell follows the lagged reading: one beep per bar as it climbs (CLASSIC: one beep, at once)
    {
      const r = await ev(h, `await __sig.fresh(); SH.mod.Phone.TUNE.jitter = 0;
        let e = __sig.probe('sig:beep', 6, { type: 'sig_probe_beep' }); __sig.sounds.length = 0; const t0 = __sig.t;
        await __sig.run(5); const u = __sig.sounds.filter((s) => s.name === 'eftpos').map((s) => +(s.t - t0).toFixed(2)); const ub = __sig.rd().bars; e.remove();
        await __sig.fresh(); __sig.mode('classic'); e = __sig.probe('sig:beepc', 6, { type: 'sig_probe_beep' }); __sig.sounds.length = 0; const t1 = __sig.t;
        await __sig.run(5); const c = __sig.sounds.filter((s) => s.name === 'eftpos').map((s) => +(s.t - t1).toFixed(2)); const cb = __sig.rd().bars; e.remove();
        __sig.mode('unreliable'); __sig.tune(); return { u, ub, c, cb }`);
      say(`B tells: a Tethered-tell probe 6 m off — UNRELIABLE beeps at ${J(r.u)} s (${r.ub} bars); CLASSIC at ${J(r.c)} s (${r.cb} bars)`);
      if (!(r.u.length === r.ub && r.u.length >= 3 && r.u[r.u.length - 1] - r.u[0] > 1)) bad('the EFTPOS tell does not follow the lagged bars (one beep per bar as they climb)');
      if (!(r.c.length === 1 && r.c[0] < 0.1)) bad('CLASSIC does not beep once, at once');
    }
    // 5 bars only within ~3 m; the wobble moves the bars at a fixed distance
    {
      const r = await ev(h, `await __sig.fresh();
        let e = __sig.probe('sig:near', 3.5); let s = await __sig.sample(12); const at35 = s.maxBars; e.remove(); await __sig.run(6);
        e = __sig.probe('sig:close', 2.5); s = await __sig.sample(12); const at25 = s.maxBars; e.remove(); await __sig.run(6);
        e = __sig.probe('sig:mid', 11); await __sig.run(6); const w = await __sig.sample(40); e.remove();
        return { at35, at25, wobble: w.bars }`);
      say(`B range: max bars at 3.5 m ${r.at35}, at 2.5 m ${r.at25}; at 11 m (true 3.1 → 3 bars) over 40 s the bars read ${J(r.wobble)}`);
      if (r.at35 !== 4 || r.at25 !== 5) bad('5 bars are not reserved for ~3 m');
      if (Object.keys(r.wobble).length < 2) bad('the reading does not wobble at a fixed distance');
    }

    // phantoms (sped up) ------------------------------------------------------------------------------------------------
    const FAST = "{ quiet: { fog: [3, 5], outage: [2, 3] }, phantomRise: [0.5, 0.8], phantomHold: [1, 1.5], phantomFall: [0.5, 0.8] }";
    {
      const r = await ev(h, `await __sig.fresh(); __sig.tune(${FAST});
        SH.S.chapter = 0; SH.S.done['signal:real'] = true; const ch0 = await __sig.sample(30);
        SH.S.chapter = 1; delete SH.S.done['signal:real']; const noReal = await __sig.sample(30);
        SH.S.done['signal:real'] = true; SH.mod.Phone.TUNE.phantomTell = 1; __sig.sounds.length = 0;
        const peaks = [], tells = []; let was = false;
        const on = await __sig.sample(40, { each: (q) => { if (q.phantom && !was) { peaks.push(q.phantomPeak); tells.push(q.phantomTell); } was = q.phantom; } });
        const fake = __sig.sounds.filter((s) => ['eftpos', 'vibrate', 'keys_far'].includes(s.name)).map((s) => s.name);
        SH.mod.Phone.TUNE.phantomTell = 0; await __sig.run(10, () => !SH.mod.Phone.reading.phantom); __sig.sounds.length = 0; const quietTells = await __sig.sample(20); const fake0 = __sig.sounds.filter((s) => ['eftpos', 'vibrate', 'keys_far'].includes(s.name)).length;
        return { ch0, noReal, on, peaks, tells, fake, quietTells, fake0 }`);
      say(`B phantoms: Chapter 0 → ${r.ch0.phantoms} in 30 s; Chapter 1 without signal:real → ${r.noReal.phantoms}; with it → ${r.on.phantoms} in 40 s (peaks ${J(r.peaks)}, bars seen ${J(r.on.bars)}, static ≤ ${r.on.maxStatic}, sources ${J(Object.keys(r.on.sources))}), fake tells ${J(r.tells)} → sounds ${J(r.fake)}; tells off → ${r.quietTells.phantoms} phantoms, ${r.fake0} tell sounds`);
      if (r.ch0.phantoms || r.ch0.maxBars) bad('a phantom came before Chapter 1');
      if (r.noReal.phantoms || r.noReal.maxBars) bad("a phantom came before the first real reading (S.done['signal:real'])");
      if (!(r.on.phantoms >= 3 && r.on.maxPeak >= 1 && r.on.maxPeak <= 4 && r.on.maxBars <= 4 && r.on.maxStatic > 0.05 && !Object.keys(r.on.sources).length)) bad('phantoms do not come as specified (1–4 bars, static, no source)');
      // (a phantom still rising as the window closes has not played its tell yet)
      const told = r.tells.filter(Boolean).length;
      if (!(r.fake.length <= told && r.fake.length >= told - 1 && r.fake.length >= 3)) bad('the fake tells do not play once per phantom');
      if (!(r.quietTells.phantoms >= 2 && r.fake0 === 0)) bad('with phantomTell 0 a phantom still plays a tell');
    }
    // never during an override (shown exactly), a cutscene, a display insert, a menu; not with an aware threat in range
    {
      const r = await ev(h, `await __sig.fresh(); __sig.tune(${FAST}); SH.S.chapter = 1; SH.S.done['signal:real'] = true;
        const P = SH.mod.Phone, out = {};
        P.bars(2); out.ov2 = await __sig.sample(30); P.bars('noservice'); out.ovNs = await __sig.sample(12); P.bars({ climb: 3, from: 0, dur: 1.2 }); out.ovClimb = await __sig.sample(12); P.bars('flicker'); out.ovFl = await __sig.sample(12); P.bars(null);
        // a letterboxed blocking scene
        let done = false; SH.mod.Script.run(async (G) => { await G.wait(25); }, { control: false, letterbox: true, skippable: false, name: 'signal:scene' }).then(() => { done = true; });
        await __sig.run(0.2); out.cutscene = SH.mod.Script.cutscene; out.cs = await __sig.sample(24); await __sig.run(1.5); out.csDone = done;
        // a phone insert
        P.display({ title: 'TEST', lines: ['NOTHING HERE'] }); out.disp = await __sig.sample(20); P.display(null);
        // an aware threat within 20 m (a probe 15 m off): no phantoms; a dormant one 8 m off: they still come
        let e = __sig.probe('sig:aw', 15); out.aware = await __sig.sample(30); e.remove(); await __sig.run(6);
        e = __sig.probe('sig:dorm', 8, { type: 'sig_probe_dormant' }); out.dormant = await __sig.sample(30); e.remove();
        // a real threat mid-phantom ends it: its bars are the threat's
        await __sig.run(20, () => P.reading.phantom);
        out.midPh = P.reading.phantom; e = __sig.probe('sig:mid', 18); await __sig.run(1 / 30); out.midAfter = { phantom: P.reading.phantom, source: P.reading.source }; e.remove(); await __sig.run(6);
        // a menu opened mid-phantom ends it; none while the menu is open; the override mid-phantom shows as authored at once
        await __sig.run(20, () => P.reading.phantom); out.menuPh = { phantom: P.reading.phantom, bars: P.reading.bars };
        SH.menu('pause'); await SH.advance(0.1); out.menuOpen = { menu: SH.mod.Menus.current, phantom: P.reading.phantom, bars: P.reading.bars };
        const n0 = P.reading.phantoms; await SH.advance(15); out.menuLong = { phantoms: P.reading.phantoms - n0, bars: P.reading.bars, quiet: P.reading.quiet };
        const closing = SH.mod.Menus.close(null); await SH.advance(0.8); await closing;
        await __sig.run(20, () => P.reading.phantom); out.ovPh = P.reading.phantom; P.bars(1); await __sig.run(1 / 30); out.ovAfter = { phantom: P.reading.phantom, bars: P.reading.bars }; P.bars(null);
        return out;`);
      const sm = (x) => `${x.phantoms} phantoms, bars ${J(x.bars)}`;
      say(`B never: override 2 → ${sm(r.ov2)}; 'noservice' → ${sm(r.ovNs)} ${J(Object.keys(r.ovNs.modes))}; a climb → ${sm(r.ovClimb)}; 'flicker' → ${r.ovFl.phantoms} phantoms; a letterboxed scene (cutscene ${r.cutscene}) → ${sm(r.cs)}; a display insert → ${sm(r.disp)}; an aware probe 15 m off → ${r.aware.phantoms} phantoms (sources ${J(Object.keys(r.aware.sources))}); a dormant one 8 m off → ${r.dormant.phantoms}`);
      say(`B ending one: mid-phantom (${r.midPh}) a real threat 18 m off → ${J(r.midAfter)}; mid-phantom ${J(r.menuPh)} the pause menu → ${J(r.menuOpen)}, 15 s with it open → ${J(r.menuLong)}; mid-phantom (${r.ovPh}) G.bars(1) → ${J(r.ovAfter)}`);
      if (r.ov2.phantoms || r.ov2.maxBars !== 2 || r.ov2.minBars !== 2) bad('an override does not show exactly as authored / a phantom came under it');
      if (r.ovNs.phantoms || r.ovNs.maxBars || !r.ovNs.modes.noservice) bad("'noservice' is not shown as authored");
      if (r.ovClimb.phantoms || r.ovClimb.maxBars !== 3) bad('a climb override is not shown as authored');
      if (r.ovFl.phantoms) bad("a phantom came under 'flicker'");
      if (!r.cutscene || r.cs.phantoms || r.cs.maxBars || !r.csDone) bad('a phantom came during a cutscene');
      if (r.disp.phantoms || r.disp.maxBars) bad('a phantom came under a Phone.display insert');
      if (r.aware.phantoms || !r.aware.sources['sig:aw']) bad('a phantom came with an aware threat within 20 m');
      if (!(r.dormant.phantoms >= 2)) bad('a dormant monster in range stops phantoms (it should not)');
      if (!(r.midPh && !r.midAfter.phantom && r.midAfter.source === 'sig:mid')) bad('a real threat does not end a phantom');
      if (!(r.menuPh.phantom && r.menuOpen.menu && !r.menuOpen.phantom && r.menuOpen.bars === 0 && r.menuLong.phantoms === 0)) bad('a phantom shows in (or comes during) a menu');
      if (!(r.ovPh && !r.ovAfter.phantom && r.ovAfter.bars === 1)) bad('an override mid-phantom is not shown at once as authored');
    }
    // the same S + seed → the same phantoms (game clock, seeded RNG)
    {
      const r = await ev(h, `const runOnce = async (seed) => { await __sig.fresh(); __sig.tune(Object.assign(${FAST}, seed ? { seed } : {})); SH.S.chapter = 1; SH.S.done['signal:real'] = true; SH.S.stats.time = 1234.5; SH.mod.Phone.reset();
          const log = []; let was = false, t = 0; await __sig.run(40, () => { t += 1 / 30; const q = SH.mod.Phone.reading; if (q.phantom && !was) log.push([+t.toFixed(2), q.phantomPeak, q.phantomTell]); was = q.phantom; }); return log; };
        const a = await runOnce(), b = await runOnce(), c = await runOnce(99); __sig.tune(); return { a, b, c }`);
      say(`B determinism: two runs from the same S → ${J(r.a)} / ${J(r.b)}; another seed → ${J(r.c)}`);
      if (J(r.a) !== J(r.b) || !r.a.length) bad('the same S and seed do not give the same phantoms');
      if (J(r.a) === J(r.c)) bad('the seed does not change the phantoms');
    }
    // the real tuning: the first phantom 50–140 s into a quiet Fog world, 35–90 s into the Outage
    {
      const r = await ev(h, `const first = async (outage) => { await __sig.fresh(); __sig.tune(); SH.S.chapter = 1; SH.S.done['signal:real'] = true;
          if (!!SH.S.outage !== outage) { const p = SH.run(async (G) => G.setOutage(outage)); await SH.advance(0.5); await p; SH.mod.Phone.reset(); }
          let t = 0, at = null, peak = null; await __sig.run(outage ? 100 : 150, () => { t += 1 / 30; const q = SH.mod.Phone.reading; if (q.phantom) { at = +t.toFixed(1); return true; } });
          if (at !== null) await __sig.run(10, () => { const q = SH.mod.Phone.reading; peak = Math.max(peak || 0, q.bars); return !q.phantom; });
          return { at, peak }; };
        const out = { fog: [], outage: [] };
        for (let i = 0; i < 3; i++) { SH.S.stats.time = 100 + i * 777; out.fog.push(await first(false)); }
        for (let i = 0; i < 3; i++) { SH.S.stats.time = 200 + i * 555; out.outage.push(await first(true)); }
        const p = SH.run(async (G) => G.setOutage(false)); await SH.advance(0.5); await p; return out`);
      say(`B real tuning: the first phantom (s into the quiet, peak bars): Fog ${J(r.fog)}; Outage ${J(r.outage)}`);
      if (!r.fog.every((x) => x.at !== null && x.at >= 49.9 && x.at <= 141)) bad('the Fog world quiet interval is not 50–140 s');
      if (!r.outage.every((x) => x.at !== null && x.at >= 34.9 && x.at <= 91)) bad('the Outage quiet interval is not 35–90 s');
    }

    // =========================================================================================================== E ====
    // CLASSIC, tick by tick, against the old radar (nearest threat of any kind; 0.06 hysteresis)
    {
      const r = await ev(h, `await __sig.fresh(); __sig.tune(${FAST}); SH.S.chapter = 1; SH.S.done['signal:real'] = true; __sig.mode('classic');
        const E = SH.mod.Enemies, P = SH.mod.Phone;
        const dorm = E.spawn({ id: 'sig:cteth', type: 'tethered', pos: [2.2, 3.5], rot: 180, anchor: [2.2, 3.5], persist: false });   // dormant, 16.2 m
        const e = __sig.probe('sig:cmove', 24);
        let refN = 0, ticks = 0, mism = [], phantomTicks = 0, lagSeen = 0;
        const ref = () => {
          const near = E.nearestThreat(SH.mod.Player.pos), d = near ? near.dist : Infinity;
          const raw = !(near && d < 20) ? 0 : d <= 3 ? 5 : 1 + ((20 - d) / 17) * 4;
          if (raw <= 0) refN = 0; else if (raw >= 5) refN = 5;
          else { const f = Math.floor(raw); if (f > refN) { if (refN === 0 || raw >= f + 0.06) refN = f; } else if (f < refN && raw < refN - 0.06) refN = f; }
          return refN;
        };
        // a path in and out, with pauses on bar boundaries (the hysteresis) — 22 s
        const path = (t) => t < 8 ? 24 - t * 2.9 : t < 11 ? 0.8 + Math.sin(t * 3) * 0.3 : t < 16 ? 0.8 + (t - 11) * 3.2 : t < 19 ? 15.93 + Math.sin(t * 7) * 0.05 : 16 + (t - 19) * 3;
        await __sig.run(1);
        // (the probe moves after each tick; the next tick's Phone.update reads it there, and so does ref() after that tick)
        let t = 0; refN = P.reading.bars;
        await __sig.run(22, () => { const want = ref(); const got = P.reading.bars; ticks++; if (got !== want && mism.length < 5) mism.push([+t.toFixed(2), got, want]); if (P.reading.phantom) phantomTicks++; if (P.reading.lag !== null) lagSeen++; t += 1 / 30; __sig.at(e, path(t)); });
        const ph = await __sig.sample(20);
        e.remove(); dorm.remove(); __sig.mode('unreliable'); __sig.tune();
        return { ticks, mism, phantomTicks, lagSeen, ph: ph.phantoms, sig: P.reading.signal }`);
      say(`E CLASSIC vs the old radar: ${r.ticks} ticks along a path (24 m → 0.8 m → 25 m, lingering on boundaries, a dormant Tethered 16 m off) → ${r.mism.length} mismatches ${J(r.mism)}; phantoms ${r.phantomTicks} ticks + ${r.ph} in 20 s with the gate open; unreliable fields ${r.lagSeen ? 'present' : 'null'}`);
      if (r.mism.length || r.ticks < 600) bad('CLASSIC does not match the old radar tick for tick');
      if (r.phantomTicks || r.ph) bad('a phantom came in CLASSIC');
    }
    // switching mid-reading carries the bars across
    {
      const r = await ev(h, `await __sig.fresh(); __sig.mode('classic'); const e = __sig.probe('sig:sw', 8); await __sig.run(1); const c = __sig.rd().bars;
        __sig.mode('unreliable'); await __sig.run(1 / 30); const u1 = __sig.rd().bars; await __sig.run(3); const u3 = __sig.rd().bars;
        __sig.mode('classic'); await __sig.run(1 / 30); const c2 = __sig.rd().bars; e.remove(); __sig.mode('unreliable'); return { c, u1, u3, c2 }`);
      say(`E switch: CLASSIC ${r.c} bars → UNRELIABLE next tick ${r.u1}, 3 s later ${r.u3} → CLASSIC next tick ${r.c2}`);
      if (!(r.c === 3 && r.u1 >= 2 && r.u3 >= 2 && r.c2 === 3)) bad('a switch mid-reading drops or jumps the bars');
    }
    // the Options row (real keys), live, saved; a META without the key reads UNRELIABLE
    {
      const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await ev(h, 'await SH.advance(0.12); return 1'); } };
      const waitMenu = (name) => ev(h, `for (let i = 0; i < 100; i++) { const t = SH.mod.Menus._top; if (SH.mod.Menus.current === ${J(name)} && t && t.ready) return true; await SH.advance(0.1); } return false`);
      await ev(h, "await __sig.fresh(); SH.menu('options'); return 1");
      const up = await waitMenu('options');
      const labels = up ? await ev(h, 'return SH.mod.Menus._top.st.rows.map((r) => r.o.label)') : [];
      const i = labels.indexOf('SIGNAL');
      const v0 = up ? await ev(h, "return SH.mod.Menus._top.el.innerText.match(/SIGNAL\\s+(\\S+)/)?.[1] || null") : null;
      if (i >= 0) { await key('s', i); await key('e'); }
      const after = await ev(h, "return { meta: SH.mod.META.options.signal, live: SH.mod.Phone.signalMode, stored: (JSON.parse(localStorage.getItem('signalhill.meta') || '{}').options || {}).signal, shown: SH.mod.Menus._top.el.innerText.match(/SIGNAL\\s+(\\S+)/)?.[1] || null }");
      if (i >= 0) await key('d');
      const back = await ev(h, "return { meta: SH.mod.META.options.signal, live: SH.mod.Phone.signalMode, stored: (JSON.parse(localStorage.getItem('signalhill.meta') || '{}').options || {}).signal }");
      await ev(h, 'const c = SH.mod.Menus.close(null); await SH.advance(0.8); await c; return 1');
      const missing = await ev(h, "const o = SH.mod.META.options; delete o.signal; await SH.advance(0.1); const m = SH.mod.Phone.signalMode; o.signal = 'unreliable'; return m");
      say(`E Options: rows ${J(labels)}; SIGNAL shows ${v0}; E → ${J(after)}; D → ${J(back)}; a META without the key → ${missing}`);
      if (i < 0 || v0 !== 'UNRELIABLE') bad('Options has no SIGNAL row reading UNRELIABLE by default');
      if (!(after.meta === 'classic' && after.live === 'classic' && after.stored === 'classic' && after.shown === 'CLASSIC')) bad('the SIGNAL row does not switch to CLASSIC live and save it');
      if (!(back.meta === 'unreliable' && back.live === 'unreliable' && back.stored === 'unreliable')) bad('the SIGNAL row does not switch back');
      if (missing !== 'unreliable') bad('a META without the signal key does not read UNRELIABLE');
    }
  } catch (e) { bad('threw: ' + String(e.message).split('\n').slice(0, 3).join(' ')); }
  await ev(h, 'SH.mod.Game.manual(false); return 1').catch(() => {});
  for (const n of notes) console.log('  ' + n);
  const errs = await ev(h, 'return SH.errors').catch(() => []);
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); notes.push('BUG: page errors'); }
  report('signal (unreliable signal: awareness, lag, wobble, phantoms; CLASSIC exact; the SIGNAL option)', !notes.some((n) => n.startsWith('BUG')), `${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
