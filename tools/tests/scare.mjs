// tools/tests/scare.mjs — the jump-scare kit (ENGINE_NOTES §2 "Jump scares"): G.scare / G.glimpse (Script.scare /
// Script.glimpse), the scene duck of the ambient beds, and the motif stop rule (a motif is never chopped).
//
//   node tools/build.mjs --out .build/scare.html
//   node tools/run.mjs --file .build/scare.html --size 960x540 --quiet --script tools/tests/scare.mjs
//
// In the developer test_room (its monsters cleared and its bed off, so the audio has a quiet baseline):
//   1. a scare plays: resolves true ~0.6 s later, spends S.done['scare:<id>'], is recorded in SH.scares, pulses
//      Render.flash, plays its voices (stinger, gasp, heartbeat) and sets Aidan's scared face;
//   2. once per id (a spent id → false at once) and the 20 s game-time cooldown (→ false, nothing recorded; the id is
//      still spent); Script.scareReady follows it;
//   3. inside a letterboxed scene: the Outage/ordinary beds' scene duck is down (Snd.stats().sceneDuck) and a scare
//      plays; a line on screen in play ducks the Outage bed to 50 %; a SKIPPED scene's scare is a no-op (false, not
//      recorded, id spent — as the played scene leaves S) and its glimpse shows nothing;
//   4. G.glimpse for every usable kind (people and monsters): shown at once, no collider, not a threat, gone by itself
//      after dur, the Rig actor count back to where it was; onlyIfOnScreen (behind the camera: never shown, gives up
//      after `wait`; in front: shown); a glimpse is removed on a room change;
//   5. audio: every scare voice ends — Snd.stats() voices / nodes back to the quiet baseline; Snd.stopMusic(0.3)
//      lets the clipped Tomorrow ring out (still sounding 1.2 s later) while {hard:true} cuts it;
//   6. once Aidan is dead, G.scare / G.glimpse do nothing; zero SH.errors throughout.
// Prints `PASS scare`.
import { ev, report } from './lib.mjs';

export default async function (page, h) {
  const notes = [];
  const bad = (m) => notes.push('BUG: ' + m);
  const note = (m) => notes.push(m);
  const t0 = Date.now();
  try {
    const room = await ev(h, "await SH.testRoom(); for (let i = 0; i < 80 && SH.mod.World.room !== 'test_room'; i++) await SH.advance(0.25); return SH.mod.World.room");
    if (room !== 'test_room') bad(`the test room did not load (${room})`);
    // a quiet world: no bed, no monsters (their loops), so the audio node count has a baseline. Audio waits run on the
    // AUDIO clock (a busy headless machine can render sound slower than the wall clock): untilA(t) waits for it,
    // settle(maxA) waits until no voice is left (→ the audio seconds it took)
    const quiet = `const M = SH.mod, AC = M.Snd.ctx; M.Enemies.clear(); M.Snd.ambient('none', 0.05); M.Snd.stopLoops(0);
      const untilA = async (t) => { const w0 = performance.now(); while (AC && AC.state === 'running' && AC.currentTime < t && performance.now() - w0 < 20000) await SH.wait(0.05); };
      const settle = async (maxA, base = 0) => { if (!AC || AC.state !== 'running') return 0; const a0 = AC.currentTime, w0 = performance.now(); while (M.Snd.stats().voices > base && AC.currentTime - a0 < maxA && performance.now() - w0 < 30000) await SH.wait(0.05); return AC.currentTime - a0; };`;
    const q0 = await ev(h, `${quiet} await SH.advance(0.5); await settle(8); await SH.advance(0.2); await untilA(AC ? AC.currentTime + 0.5 : 0);
      const s = M.Snd.stats(); return { audio: s.state, voices: s.voices, nodes: s.nodes, rig: M.Rig.actors.size, ready: M.Script.scareReady, errors: SH.errors.length }`);
    const audio = q0.audio === 'running';
    note(`quiet baseline: audio ${q0.audio}, voices ${q0.voices}, nodes ${q0.nodes}, Rig actors ${q0.rig}, scareReady ${q0.ready}`);
    if (!q0.ready) bad('Script.scareReady is false at the start');

    // ---- 1. a scare plays --------------------------------------------------------------------------------------------
    const r1 = await ev(h, `const M = SH.mod, n = (SH.scares || []).length, s0 = M.Snd.stats().voices;
      const p = M.Script.scare({ id: 't:a', kind: 'stab', heart: 1.2 });
      let settled = null; p.then((v) => { settled = v; });
      await SH.advance(0.1);
      const early = settled, fl = M.Render.flashLevel, v = M.Snd.stats().voices - s0, expr = M.Player.actor.faceState.expr, lock = M.Player.locked;
      await SH.advance(0.7);
      const res = await p;
      return { early, res, done: !!SH.S.done['scare:t:a'], rec: (SH.scares || []).length - n, last: (SH.scares || []).slice(-1)[0] || null, flash: +fl.toFixed(3), voices: v, expr, lock, ready: M.Script.scareReady }`);
    note(`scare 1: resolved ${r1.res} (not before 0.1 s: ${r1.early === null}), spent ${r1.done}, recorded ${JSON.stringify(r1.last)}, flash ${r1.flash}, +${r1.voices} voices, Aidan ${r1.expr}, control locked ${r1.lock}`);
    if (r1.res !== true) bad('the first scare did not resolve true');
    if (r1.early !== null) bad('the scare resolved before ~0.6 s');
    if (!r1.done) bad("S.done['scare:t:a'] not set");
    if (r1.rec !== 1 || !r1.last || r1.last.id !== 't:a' || r1.last.kind !== 'stab') bad('SH.scares did not record the scare');
    if (!(r1.flash > 0)) bad('no Render.flash pulse');
    if (r1.expr !== 'scared') bad(`Aidan's face ${r1.expr}, want scared`);
    if (r1.lock) bad('lock:0 froze the player');
    if (audio && r1.voices < 3) bad(`only ${r1.voices} new voices (want the stinger, the gasp and the heartbeat)`);
    if (r1.ready) bad('scareReady right after a scare (the cooldown)');

    // ---- 2. once per id; the cooldown --------------------------------------------------------------------------------
    const r2 = await ev(h, `const M = SH.mod, n = (SH.scares || []).length;
      const again = await M.Script.scare({ id: 't:a' });
      const cool = await M.Script.scare({ id: 't:b', kind: 'slam' });
      const coolSpent = !!SH.S.done['scare:t:b'], rec = (SH.scares || []).length - n;
      await SH.advance(20.2);
      const ready = M.Script.scareReady;
      const once = await M.Script.scare({ id: 't:a' });
      const p = M.Script.scare({ kind: 'screech', heart: 0, lock: 0.4, flinch: false });
      await SH.advance(0.1); const locked = M.Player.locked;
      await SH.advance(0.7);
      const fresh = await p, unlocked = !M.Player.locked;
      return { again, cool, coolSpent, rec, ready, once, fresh, locked, unlocked, total: (SH.scares || []).length - n }`);
    note(`once/cooldown: spent id → ${r2.again}; within 20 s → ${r2.cool} (id spent ${r2.coolSpent}, recorded ${r2.rec}); 20 s later ready ${r2.ready}, the spent id → ${r2.once}, a fresh scare → ${r2.fresh} (lock 0.4 s: locked ${r2.locked}, released ${r2.unlocked})`);
    if (r2.again !== false) bad('a spent id played again');
    if (r2.cool !== false || r2.rec !== 0) bad('a scare within the cooldown played');
    if (!r2.coolSpent) bad('the id swallowed by the cooldown was not spent');
    if (!r2.ready) bad('scareReady false 20 s after the last scare');
    if (r2.once !== false) bad('a spent id played after the cooldown');
    if (r2.fresh !== true || r2.total !== 1) bad('a fresh scare after the cooldown did not play');
    if (!r2.locked || !r2.unlocked) bad('lock:0.4 did not freeze and release control');

    // ---- 3. scenes: the scene duck, a played scene's scare, a skipped scene's scare and glimpse ------------------------
    const r3 = await ev(h, `const M = SH.mod, n = (SH.scares || []).length; window.__sc = {};
      await SH.advance(20.2);
      const played = SH.run(async (G) => {
        await G.wait(0.6);
        window.__sc.cs = M.Script.cutscene; window.__sc.duck = M.Snd.stats().sceneDuck;
        window.__sc.res = await G.scare({ id: 't:cs', kind: 'swell', heart: 0 });
        await G.wait(0.3);
      }, { control: false, letterbox: true, skippable: true, name: 'test:scare-played' });
      await SH.advance(2.2);
      await played;
      const after0 = M.Snd.stats().sceneDuck;
      await SH.advance(1.6);
      const after1 = M.Snd.stats().sceneDuck;
      // a line on screen in play (a background script's subtitle)
      const line = SH.run(async (G) => { await G.say('AIDAN', 'Testing the line duck.', { dur: 2.5 }); });
      await SH.advance(0.5);
      const lineDuck = { shown: M.UI.subtitleShown, ...M.Snd.stats().sceneDuck };
      await SH.advance(3.8);
      await line;
      const afterLine = M.Snd.stats().sceneDuck;
      await SH.advance(20.2);
      const skipped = SH.run(async (G) => {
        await G.wait(1.5);
        window.__sc.skipRes = await G.scare({ id: 't:skip' });
        window.__sc.skipGl = G.glimpse({ kind: 'reach', pos: [5.2, 6.4] }).done;
        await G.wait(1);
      }, { control: false, letterbox: true, skippable: true, name: 'test:scare-skipped' });
      await SH.advance(0.3);
      const sk = SH.skip();
      await SH.advance(0.6);
      await skipped;
      return { ...window.__sc, after0, after1, lineDuck, afterLine, sk, spent: !!SH.S.done['scare:t:skip'], rec: (SH.scares || []).length - n, glimpses: M.Script.glimpses }`);
    note(`played scene: cutscene ${r3.cs}, scene duck ${JSON.stringify(r3.duck)}, scare → ${r3.res}; just after it ${JSON.stringify(r3.after0)}, 1.6 s later ${JSON.stringify(r3.after1)}`);
    note(`a line in play: subtitle ${r3.lineDuck.shown}, duck out ${r3.lineDuck.out} bed ${r3.lineDuck.bed}; after it ${JSON.stringify(r3.afterLine)}`);
    note(`skipped scene (skip ${r3.sk}): scare → ${r3.skipRes} (id spent ${r3.spent}), glimpse shown nothing ${r3.skipGl}; scares recorded in part 3: ${r3.rec}`);
    if (!r3.cs) bad('Script.cutscene false inside the letterboxed scene');
    if (!r3.duck || r3.duck.out > 0.25 || r3.duck.bed > 0.75) bad(`scene duck in a cutscene ${JSON.stringify(r3.duck)}, want out 0.22 / bed 0.7`);
    if (r3.res !== true) bad('the scare inside a played scene did not play');
    if (!r3.after1 || r3.after1.out !== 1 || r3.after1.bed !== 1) bad(`the scene duck did not come back after the scene (${JSON.stringify(r3.after1)})`);
    if (!r3.lineDuck.shown || r3.lineDuck.out !== 0.5 || r3.lineDuck.bed !== 1) bad(`a line in play: ${JSON.stringify(r3.lineDuck)}, want the Outage bed at 0.5`);
    if (!r3.afterLine || r3.afterLine.out !== 1) bad('the line duck did not come back');
    if (!r3.sk) bad('SH.skip() did not skip the test scene');
    if (r3.skipRes !== false) bad('a scare in a skipped scene played');
    if (!r3.spent) bad("a skipped scene's scare id was not spent (S would differ from the played scene's)");
    if (r3.skipGl !== true) bad('a glimpse in a skipped scene showed');
    if (r3.rec !== 1) bad(`${r3.rec} scares recorded in part 3, want 1 (the played scene's)`);

    // ---- 4. glimpses -------------------------------------------------------------------------------------------------
    const kinds = ['customer', 'wai', 'old_man', 'tethered', 'reach', 'standard', 'borrowed', 'smile', 'closer'];
    const r4 = await ev(h, `const M = SH.mod, out = [], rig0 = M.Rig.actors.size;
      for (const kind of ${JSON.stringify(kinds)}) {
        const g = M.Script.glimpse({ kind, pos: [5.4, 6.4], lookAt: 'player', dur: 0.6, expr: 'flat' });
        await SH.advance(0.15);
        const es = M.Enemies.list.filter((e) => e.glimpse);
        const threat = M.Enemies.nearestThreat(M.Player.pos);
        const during = { live: M.Script.glimpses, shown: g.shown, actor: !!g.actor, enemy: es.map((e) => e.type).join(','), col: es.some((e) => e.col && e.col.enabled), threat: !!threat,
          hit: M.Enemies.hitTest(M.Player.pos.clone().setY(M.Player.pos.y + 1.2), Math.PI / 2, 6, 120).length };
        await SH.advance(0.8);
        out.push({ kind, ...during, done: g.done, after: M.Script.glimpses, enemies: M.Enemies.list.length, rig: M.Rig.actors.size - rig0 });
      }
      // a fade-out
      const gf = M.Script.glimpse({ kind: 'customer', pos: [5.4, 6.4], dur: 0.3, fadeOut: 0.5 });
      await SH.advance(0.5); const midFade = { done: gf.done, op: gf.actor ? gf.actor.opacity : null };
      await SH.advance(0.6); const fadeDone = gf.done;
      // onlyIfOnScreen: behind the camera (never shown, gives up after wait) and in front (shown)
      const c = M.Render.camera, d = new M.THREE.Vector3(); c.getWorldDirection(d); d.y = 0; d.normalize();
      const bp = c.position.clone().addScaledVector(d, -3), fp = M.Player.pos.clone();
      const gb = M.Script.glimpse({ kind: 'customer', pos: [bp.x, bp.z], onlyIfOnScreen: true, wait: 1, dur: 0.5 });
      const gi = M.Script.glimpse({ kind: 'customer', pos: [fp.x + 0.8, fp.z], onlyIfOnScreen: true, wait: 1, dur: 0.5 });
      await SH.advance(0.2);
      const os = { behindShown: gb.shown, behindLive: !gb.done, frontShown: gi.shown };
      await SH.advance(1.2);
      os.behindDone = gb.done; os.frontDone = gi.done;
      return { out, midFade, fadeDone, os, rig: M.Rig.actors.size - rig0, live: M.Script.glimpses }`);
    for (const k of r4.out) {
      note(`glimpse ${k.kind.padEnd(9)}: live ${k.live}, shown ${k.shown}, actor ${k.actor}${k.enemy ? ', as enemy ' + k.enemy : ''}, collider ${k.col}, threat ${k.threat}, hittable ${k.hit}; after dur: done ${k.done}, live ${k.after}, enemies ${k.enemies}, Rig Δ ${k.rig}`);
      if (k.live !== 1 || !k.shown || !k.actor) bad(`glimpse ${k.kind} was not shown`);
      if (k.col) bad(`glimpse ${k.kind} has a live collider`);
      if (k.threat) bad(`glimpse ${k.kind} is a threat`);
      if (k.hit) bad(`glimpse ${k.kind} can be hit`);
      if (!k.done || k.after !== 0 || k.enemies !== 0 || k.rig !== 0) bad(`glimpse ${k.kind} did not remove itself`);
    }
    note(`fade-out: mid-fade done ${r4.midFade.done} opacity ${r4.midFade.op}; after it done ${r4.fadeDone}`);
    if (r4.midFade.done || !r4.fadeDone) bad('fadeOut: the glimpse did not fade and go');
    note(`onlyIfOnScreen: behind the camera shown ${r4.os.behindShown} (waiting ${r4.os.behindLive}, gave up ${r4.os.behindDone}); in front shown ${r4.os.frontShown} (done ${r4.os.frontDone})`);
    if (r4.os.behindShown || !r4.os.behindLive || !r4.os.behindDone) bad('onlyIfOnScreen: the glimpse behind the camera showed or never gave up');
    if (!r4.os.frontShown || !r4.os.frontDone) bad('onlyIfOnScreen: the glimpse in view did not show');
    if (r4.rig !== 0 || r4.live !== 0) bad(`glimpses left behind: Rig Δ ${r4.rig}, live ${r4.live}`);

    // ---- 5. audio: every voice ends; the motif stop rule ---------------------------------------------------------------
    if (audio) {
      // (a stray game sound — an idle habit's pen click — may start at any tick: the checks follow the voices by name)
      const r5 = await ev(h, `${quiet} await SH.advance(3); const took = await settle(10);
        const s = M.Snd.stats(), base = { voices: s.voices, nodes: s.nodes, playing: s.playing };
        const mus = () => M.Snd.stats().playing.filter((n) => /^music:/.test(n)).length;
        const musGone = async (maxA) => { const a0 = AC.currentTime, w0 = performance.now(); while (mus() > 0 && AC.currentTime - a0 < maxA && performance.now() - w0 < 30000) await SH.wait(0.05); return AC.currentTime - a0; };
        const m = M.Snd.music('tomorrow', { clipped: true }); const dur = m.dur;
        await untilA(AC.currentTime + 0.4); M.Snd.stopMusic(0.3);
        const ts = AC.currentTime; await untilA(ts + 1.2); const soft = mus();
        const softGone = +(1.2 + await musGone(6)).toFixed(2);
        M.Snd.music('tomorrow', { clipped: true });
        await untilA(AC.currentTime + 0.4); M.Snd.stopMusic(0.3, { hard: true });
        const hardGone = +(await musGone(4)).toFixed(2);
        const took2 = await settle(10);
        const e = M.Snd.stats();
        return { took: +took.toFixed(2), base, dur, soft, softGone, hardGone, end: { voices: e.voices, nodes: e.nodes, playing: e.playing, took: +took2.toFixed(2) } }`);
      const kitSounds = /^(scare|gasp|heartbeat|whisper|knock|reach_breath|standard_keys|smile_hum|tethered_crinkle|music:)/;
      note(`audio after every scare and glimpse: silent after ${r5.took} s of audio time — voices ${r5.base.voices}, nodes ${r5.base.nodes} (quiet baseline ${q0.voices} / ${q0.nodes})${r5.base.playing.length ? '; still playing: ' + r5.base.playing.join(',') : ''}`);
      note(`clipped Tomorrow: ${r5.dur} s; stopMusic(0.3) → still sounding 1.2 s later ${r5.soft > 0}, gone after ${r5.softGone} s; stopMusic(0.3, {hard:true}) → gone after ${r5.hardGone} s (audio clock); then silent after ${r5.end.took} s: voices ${r5.end.voices}, nodes ${r5.end.nodes}`);
      if (r5.base.playing.some((n) => kitSounds.test(n))) bad(`a scare / glimpse voice never ended: ${r5.base.playing.join(',')}`);
      if (r5.base.voices === 0 && r5.base.nodes !== q0.nodes) bad(`nodes leaked: ${r5.base.nodes} with no voice left (baseline ${q0.nodes})`);
      if (r5.base.voices !== 0) note(`(a stray game sound was still playing: ${r5.base.playing.join(',')})`);
      if (!(r5.dur >= 5)) bad(`clipped Tomorrow lasts ${r5.dur} s (it should ring out, ≈ 6 s)`);
      if (!(r5.soft > 0) || !(r5.softGone >= 2.3 && r5.softGone <= 4)) bad('stopMusic(0.3) chopped the motif (or never let it go)');
      if (!(r5.hardGone < 1)) bad('stopMusic(0.3, {hard:true}) did not cut the motif');
      if (r5.end.playing.some((n) => kitSounds.test(n))) bad(`a voice never ended after the music: ${r5.end.playing.join(',')}`);
      if (r5.end.voices === 0 && r5.end.nodes !== q0.nodes) bad(`nodes leaked after the music: ${r5.end.nodes}`);
    } else note('audio is not running in this browser: the voice / node checks are skipped');

    // ---- 6. a room change removes a glimpse; nothing once Aidan is dead ------------------------------------------------
    const r6 = await ev(h, `const M = SH.mod;
      const g = M.Script.glimpse({ kind: 'reach', pos: [5.4, 6.4], dur: 30 });
      await SH.advance(0.2); const before = M.Script.glimpses;
      await SH.goto('test_room2', 'door');
      for (let i = 0; i < 40 && M.World.room !== 'test_room2'; i++) await SH.advance(0.25);
      const after = { room: M.World.room, live: M.Script.glimpses, done: g.done, glimpseEnemies: M.Enemies.list.filter((e) => e.glimpse).length };
      await SH.advance(21);
      M.Player.kill();
      await SH.advance(0.5);
      const dead = M.Player.dead, res = await M.Script.scare({ id: 't:dead' }), gl = M.Script.glimpse({ kind: 'customer', pos: [5, 12] }).done;
      return { before, after, dead, res, gl, spent: !!SH.S.done['scare:t:dead'], errors: SH.errors.slice(0, 5) }`);
    note(`room change: ${r6.before} glimpse → in ${r6.after.room}: live ${r6.after.live}, done ${r6.after.done}, glimpse enemies ${r6.after.glimpseEnemies}`);
    note(`Aidan dead ${r6.dead}: scare → ${r6.res}, glimpse shows nothing ${r6.gl}`);
    if (r6.before !== 1 || r6.after.live !== 0 || !r6.after.done || r6.after.glimpseEnemies !== 0) bad('a glimpse survived the room change');
    if (!r6.dead) bad('Player.kill() did not kill');
    if (r6.res !== false) bad('a scare played with Aidan dead');
    if (r6.gl !== true) bad('a glimpse showed with Aidan dead');
    if (r6.errors.length) bad('SH.errors: ' + JSON.stringify(r6.errors));
  } catch (e) { bad('threw: ' + String(e.message || e).split('\n').slice(0, 3).join(' | ')); }
  for (const n of notes) console.log('  ' + n);
  const fails = notes.filter((n) => n.startsWith('BUG'));
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  report('scare', fails.length === 0, fails.length ? `${fails.length} problem(s)` : '');
}
