// tools/tests/skipall.mjs — spec §14 "Every cutscene is skippable and still applies its state changes".
//
// For EVERY id in CUTSCENES (enumerated in the page at run time) the scene is run twice from the same game state — once
// PLAYED through (SH.advance only; every choice answered with option 0, an in-world screen's first button confirmed, E
// held for a G.hold, a reading view closed) and once SKIPPED (SH.skip() the moment its Bus 'cutscene' start fires, before
// its first line runs; a scene it starts in a skip chain of its own — inheritSkip:false, 8-1 → the hut → 8-2 — is skipped
// as it comes, as a player holding Esc would; the same answers) — and the two outcomes must match:
//   * the skip works (Script.skip → true) and ends the scene at once (only choices, screen buttons, E holds still wait);
//   * S when the scene ends: flags, F / A, inventory and equipped weapon, ammo, docs, maps and map marks, notes, calls,
//     voicemails, taken pickups, done keys, spawns / freed Tethered, stickers, chapter, room, Outage, health, stats …
//     (left out: play time and the walked / ran distances, S.pos / S.yaw — Aidan's live position is compared on its own,
//     within 0.35 m; cs:<id> markers are listed, never failed: they only say which scenes started); and the story part of
//     S again 10 s later (what its G.bg children did), without the done keys, stats, health and spawns that move on
//     their own with the room's timers and monsters;
//   * the scenes it started, the autosaves it wrote (room, chapter-start), the choices and screen choices it asked (a
//     reading view a skipped scene leaves out is listed, not failed: what the document adds to S is compared);
//   * the room as the scene leaves it: its people (within 0.35 m, shown or not) and monsters (within 0.5 m, freed or not)
//     as it ends; the people's loops, faces, hand props and arm poses, and the doors (open, locked) once settled (a
//     gesture in flight changes a face for a moment; a door swings for ~0.75 s);
//   * the moment it ends: letterbox, HUD, scripted camera, grade, room, Outage, Aidan shown; after 10 s of settling: the
//     letterbox, the HUD, the fade, the post chain (Render.post + grade), music playing or not, the ambient bed, the
//     scripted camera and the room camera, player control and locks, the running blocking script, Aidan's body (loop,
//     face, props, arm poses, torch, weapon), the phone's bars override — as the played run leaves them. A music cue the
//     scene itself started that still plays out after the played scene is listed, not failed (a skip drops a scene's
//     music cues — ENGINE_NOTES §2); and in either run, once nothing holds the player, no letterbox, scripted camera, skip,
//     lost control, hidden HUD or black screen may be left (the hand-overs to Game.ending — E-*, 8-2A — end on black).
// A scene that starts a boss fight (G.boss: 1-3, 4-2, 5-3) is compared at the moment the fight starts (the skip ends
// there — ENGINE_NOTES §2); what follows the fight (1-4, 4-3, 5-4 …) is a scene of its own and has its own test.
//
// The game state each scene starts from is a SNAPSHOT of a real playthrough, taken the moment the scene's function was
// called: S (minus the scene's own cs:<id> marker, which G.cutscene sets just before — so: the state right before the
// scene was asked for) with Aidan's live position, the room, the options its caller passed (inheritSkip …). It is
// restored the way a save is: written to save slot 3 and loaded with Game.continueFrom(2) (the room is built from S). A
// room that plays the scene itself on entering (an onEnter, a trigger under his feet) starts it during the load;
// otherwise what the room started on entering that would hold the player (a fight resumed from its autosave) is aborted
// and the scene is started with Script.playCutscene. Math.random is seeded alike before the load and again as the scene
// starts, so the two runs see the same world.
//
//   node tools/build.mjs --out .build/skip.html
//   node tools/run.mjs --file .build/skip.html --size 640x360 --quiet --script tools/tests/skipall.mjs
//
// Snapshots live in .build/skipall/<path>/<id>.json. When a path has none (or SH_CAPTURE=1), this script first plays the
// whole game on each of the four paths (tools/tests/chain.mjs — connected, coverage, tomorrow, deal — four browsers side by
// side, ~12 min) with the capture installed (SH_SKIPALL=capture, below): between them they reach every scene but E-YES
// (it needs a second playthrough with the twelve stickers) and TR-1 (the test room); those two — and any scene no
// snapshot exists for — start from a synthetic state: SH.chapter(n) (+ SH.preset('yes') for E-YES, SH.goto('test_room')
// for TR-1).
//
// env: SH_ONLY    a comma list of scene ids (default: every id in CUTSCENES)
//      SH_CAPTURE 1 — take new snapshots first, even when some exist; 0 — never (a scene without one starts synthetic)
//      SH_SNAPS   the snapshot directory (default .build/skipall)
//      SH_PATHS   the capture paths / the order a snapshot is looked for in (default connected,coverage,tomorrow,deal)
//      SH_ALLPATHS 1 — test every snapshot of a scene (one per path that reached it), not just the first found
//      SH_RELOAD  none (default) | cs | run — reload the page before each scene / each run. With 'none' a scene that
//                 mismatches is retried once with a reload before each of its runs (a leftover of an earlier scene in the
//                 page — module-level state in a chapter file — can't then fake a mismatch); only a mismatch that
//                 survives the retry counts.
//      SH_CHOICE  n — answer every choice with option n instead of 0 (the other branches of 4-4, 6-2, 6-terminal, 7-2,
//                 7-3, TR-1: SH_CHOICE=1)
//      SH_VERBOSE 1 — print every difference, not just the first few per scene, each run's timeline and the room it left
//      SH_SKIPALL capture — the capture mode (used by the replay mode itself): play tools/tests/chain.mjs (SH_PATH …) with
//                 a snapshot written for every scene the first time it starts
// Prints a table (one row per scene) and "PASS skipall" / "FAIL skipall".
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { ev, report } from './lib.mjs';

const SNAPS = process.env.SH_SNAPS || '.build/skipall';
const PATHS = (process.env.SH_PATHS || 'connected,coverage,tomorrow,deal').split(',').filter(Boolean);
const CHOICE = Number(process.env.SH_CHOICE || 0) | 0;

// the built file this run loads (tools/run.mjs --file) and a short hash of it (snapshots remember the build they came from)
function buildFile() { const i = process.argv.indexOf('--file'); return i >= 0 ? process.argv[i + 1] : 'signal-hill.html'; }
function buildHash() { try { return crypto.createHash('sha1').update(fs.readFileSync(buildFile())).digest('hex').slice(0, 12); } catch (e) { return '?'; } }

// ---------------------------------------------------------------------------------------------------------------------
// Capture: a snapshot of the game each time a scene's function is called for the first time in this page
// ---------------------------------------------------------------------------------------------------------------------
export async function installCapture(h, dir) {
  fs.mkdirSync(dir, { recursive: true });
  await h.page.exposeFunction('__shSnap', (id, json) => { try { fs.writeFileSync(path.join(dir, String(id).replace(/[^\w.-]/g, '_') + '.json'), json); } catch (e) { console.log('[skipall] could not write', id, e.message); } });
  await ev(h, `const M = SH.mod; window.__snapSeen = window.__snapSeen || {};
    for (const [id, cs] of Object.entries(M.CUTSCENES)) {
      if (cs.__snapWrapped) continue;
      const fn = cs.fn;
      cs.fn = function (G, arg) {
        try {
          if (!window.__snapSeen[id]) {
            window.__snapSeen[id] = true;
            const S = M.S, s = JSON.parse(JSON.stringify(S)), P = M.Player, p = P.pos, c = G.ctx;
            s.pos = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; s.yaw = +(P.yawDeg).toFixed(1);
            if (M.World.room) s.room = M.World.room;
            const o = {};
            for (const k of ['inheritSkip', 'keepPost', 'keepPose']) if (c.opts[k] !== undefined) o[k] = c.opts[k];
            const snap = { id, S: s, room: M.World.room, mode: M.Game.mode, parent: c.parent ? c.parent.name : null, opts: o,
              scripts: M.Script.list().map((x) => x.name), time: +((S.stats && S.stats.time) || 0).toFixed(1), path: window.__snapPath || null };
            window.__shSnap(id, JSON.stringify(snap));
          }
        } catch (e) { console.warn('[skipall] snapshot of ' + id + ' failed: ' + (e && e.message)); }
        return fn.call(this, G, arg);
      };
      cs.__snapWrapped = true;
    }
    return Object.keys(M.CUTSCENES).length;`);
}

async function captureMode(page, h) {
  const p = process.env.SH_PATH || 'connected';
  const dir = path.join(SNAPS, p);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
  await installCapture(h, dir);
  fs.writeFileSync(path.join(dir, '_build.txt'), buildHash() + '\n');
  await ev(h, `window.__snapPath = ${JSON.stringify(p)}; return 1`);
  const chain = (await import('./chain.mjs')).default;
  const ok = await chain(page, h);
  console.log(`capture ${p}: ${fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length} snapshots in ${dir}`);
  return ok;
}

// the four capture runs, side by side (child processes: node tools/run.mjs … --script tools/tests/skipall.mjs)
async function runCaptures(paths) {
  const file = buildFile();
  const runJs = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'run.mjs');
  const me = new URL(import.meta.url).pathname;
  fs.mkdirSync(SNAPS, { recursive: true });
  console.log(`capturing snapshots: ${paths.join(', ')} (tools/tests/chain.mjs with the capture; logs in ${SNAPS}/<path>.log)`);
  const t0 = Date.now();
  const res = await Promise.all(paths.map((p) => new Promise((resolve) => {
    const log = fs.openSync(path.join(SNAPS, p + '.log'), 'w');
    const ch = spawn(process.execPath, [runJs, '--file', file, '--size', '640x360', '--quiet', '--script', me], {
      env: { ...process.env, SH_SKIPALL: 'capture', SH_PATH: p, SH_RIDDLE: 'normal', SH_ACTION: 'normal', SH_SNAPS: SNAPS, SH_DEATH: '', SH_RESUME: '', SH_FROM: '', SH_FROM_AUTO: '' },
      stdio: ['ignore', log, log],
    });
    ch.on('exit', (code) => { fs.closeSync(log); resolve({ p, code }); });
  })));
  for (const r of res) {
    const txt = fs.readFileSync(path.join(SNAPS, r.p + '.log'), 'utf8');
    const last = txt.split('\n').filter((l) => /^(PASS|FAIL) chain|^capture /.test(l)).join(' · ');
    console.log(`  capture ${r.p}: exit ${r.code} — ${last || '(no result line)'}`);
  }
  console.log(`  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay: the page-side runner
// ---------------------------------------------------------------------------------------------------------------------
async function installRunner(h) {
  // nothing is drawn (as in chain.mjs): the scenes' logic, timers and post values run exactly as before
  await ev(h, `const r = SH.mod.Render.renderer; if (r && !r.__render) { r.__render = r.render; r.render = function () {}; } return 1`);
  await ev(h, `if (window.__SA) return 1;
  const M = SH.mod;
  const clone = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));
  let rs = 1;
  const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const seed = (n) => { rs = n | 0; Math.random = rnd; };
  const POST = ['grain', 'ca', 'vignette', 'desat', 'noise', 'white', 'dim', 'blur', 'exposure', 'redBadge', 'brightness'];
  const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  const holdShown = () => { const e = document.querySelector('#ui .ui-hold'); return !!e && +(e.style.opacity || 0) > 0.5; };
  // music: which cue plays, and whether the scene under test started it (Snd.music wrapped once)
  const MU = { last: null };
  if (!M.Snd.__saMusic) {
    const mf = M.Snd.music;
    M.Snd.music = function (name, o) { const hd = mf.call(this, name, o); MU.last = { name, h: hd, scene: !!MU.live }; return hd; };
    M.Snd.__saMusic = true;
  }
  // the presentation a scene leaves behind
  function pres() {
    const st = M.Snd && M.Snd.stats ? M.Snd.stats() : {};
    const post = {}; for (const k of POST) post[k] = r3(M.Render.post[k] ?? null);
    const rd = M.Phone.reading || {};
    let vis = null; try { vis = M.Player.actor.root.visible; } catch (e) { /* no actor */ }
    const cue = st.music && MU.last ? MU.last : null;
    return {
      letterbox: !!M.UI.letterboxed, hud: !!M.UI.hud, fade: Math.round((M.UI.faded || 0) * 20) / 20, grade: M.Render.grade, post,
      music: !!st.music, bed: st.bed || null, outageBed: !!st.outageBed, static: r3(st.static || 0),
      camScripted: !!M.Cam.isScripted, cam: M.Cam.current ? M.Cam.current.id : null,
      control: !!M.Player.canControl, locked: !!M.Player.locked, busy: !!M.Script.busy, active: M.Script.active, skipping: !!M.Script.skipping,
      aidanVisible: vis, room: M.World.room, outage: !!M.S.outage, menu: M.Menus.current || null,
      barsOverride: !!rd.override, subtitle: !!M.UI.subtitleShown, mode: SH.mode,
      fight: M.Script.list().some((c) => /^boss:/.test(c.name)),
      aidan: (() => { try { const a = M.Player.actor; return { ...body(a), idleLife: a.idleLife !== false, torch: !!M.Player.torchOn, weapon: M.S.equipped || null }; } catch (e) { return null; } })(),
      _cue: cue ? { name: cue.name, scene: cue.scene } : null,
    };
  }
  // a body's loop, face, hand props and arm carry poses (a scene's pose left on after a skip shows)
  const kindOf = (o) => (o ? (o.userData && o.userData.kind) || o.name || 'object' : null);
  const carryOf = (c) => (c == null ? null : typeof c === 'string' ? c : 'custom');
  function body(raw) {
    if (!raw) return {};
    const c = (raw.state && raw.state.carry) || {};
    return { anim: raw.anim || null, expr: raw.faceState ? raw.faceState.expr : null, held: [kindOf(raw.held && raw.held.L), kindOf(raw.held && raw.held.R)], carry: [carryOf(c.L), carryOf(c.R)] };
  }
  // the room's people and things a scene moves: its NPCs (where, shown), its doors (open, locked), its monsters
  function world() {
    const b = M.World.build, npcs = {}, doors = {}, enemies = {};
    if (b) {
      for (const [nid, raw] of Object.entries(b.npcs || {})) { if (!raw || !raw.root) continue; const p = raw.root.position; npcs[nid] = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), shown: !!raw.root.visible && raw.root.parent !== null, ...body(raw) }; }
      for (const [did, d] of Object.entries(b.doors || {})) doors[did] = { open: !!d.open, locked: !!d.locked };
    }
    const seen = {};
    for (const e of M.Enemies.list || []) {
      if (!e || e.removed) continue;
      const k = String(e.id || e.type || 'enemy'); seen[k] = (seen[k] || 0) + 1;
      enemies[seen[k] > 1 ? k + '#' + seen[k] : k] = { x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), resolved: !!e.resolved, shown: e.actor && e.actor.root ? !!e.actor.root.visible : e.obj ? !!e.obj.visible : null };
    }
    return { npcs, doors, enemies };
  }
  function me() { const p = M.Player.pos; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: Math.round(M.Player.yawDeg) }; }
  async function adv(s) { await SH.advance(s); }
  const snapS = (snap) => { const s = clone(snap.S); if (s.done) delete s.done['cs:' + snap.id]; return s; };
  // One run of a scene from its snapshot. The snapshot's S is the state the scene's function saw minus its own cs:<id>
  // marker (G.cutscene sets it just before) — the state right before the scene was asked for — restored as a save is
  // loaded (slot 3 → Game.continueFrom(2)). A room that plays the scene itself on entering (an onEnter, a trigger under
  // Aidan's feet) starts it during the load; otherwise, once the room is loaded and idle, what the room started on
  // entering that would hold the player (a blocking beat, a fight resumed from its autosave — both runs alike) is aborted
  // and the scene is started with Script.playCutscene (with the options its caller used). Its start and end are taken
  // from Bus 'cutscene' events: S is read at its 'end' (after its own clean-up, before anything that waited on it runs).
  // mode 'skip': SH.skip() the moment it starts (and again when a new skippable chain starts inside it).
  async function run(snapJson, mode, o = {}) {
    const snap = JSON.parse(snapJson), id = snap.id, sd = o.seed || 12345;
    const out = { id, mode, notes: [], choices: [], screens: 0, menus: [], holds: 0, reskips: 0, started: [], saves: [], boss: null, advanced: 0, damage: [], tl: [] };
    const e0 = SH.errors.length;
    const st = { depth: 0, started: false, fin: null, bossAt: null, t0: 0, loading: true, how: null };
    MU.live = false;
    const offs = [];
    const finish = () => { st.fin = { S: clone(M.S), room: M.World.room, t: M.Script.time, at: me(), pres0: pres(), world: world() }; MU.live = false; };
    offs.push(M.Bus.on('cutscene', (cid, what) => {
      if (st.fin) return;
      if (what === 'start') {
        if (cid === id && !st.started) {
          st.started = true; st.t0 = M.Script.time; st.s0 = clone(M.S); st.how = st.loading ? 'started by the room on load' : 'playCutscene';
          MU.live = true;
          seed(sd + 1);                                        // the scene sees the same random numbers in both runs
          if (mode === 'skip') out.skipOk = !!SH.skip();       // it must be skippable (Script.skip → true)
        }
        if (st.started) { out.started.push(cid); if (cid === id) st.depth++; }
      } else if (what === 'end' && cid === id && st.started && --st.depth <= 0) finish();
    }));
    const tl = (x) => { if (st.started && !st.fin) out.tl.push((M.Script.time - st.t0).toFixed(1) + ' ' + x); };
    offs.push(M.Bus.on('cutscene', (cid, what) => tl(cid + ':' + what)));
    offs.push(M.Bus.on('script', (what, name) => { if (what !== 'skip') tl('script ' + name + ':' + what); }));
    offs.push(M.Bus.on('room:enter', (r) => tl('room ' + r)));
    offs.push(M.Bus.on('save', (slot) => { if (slot === 'auto' && st.started && !st.fin) { let e = null; try { e = JSON.parse(localStorage.getItem(M.Save._key('auto'))); } catch (x) { /* none */ } out.saves.push({ room: e && e.start ? e.start.room : e && e.S ? e.S.room : null, chapterStart: e ? e.chapterStart : null }); } }));
    offs.push(M.Bus.on('script', (what, name) => {
      if (what === 'start' && /^boss:/.test(String(name)) && st.started && !st.bossAt && !st.fin) st.bossAt = { S: clone(M.S), room: M.World.room, t: M.Script.time, at: me(), boss: String(name), skipping: !!M.Script.skipping, world: world() };
    }));
    offs.push(M.Bus.on('damage', (n, src) => { if (st.started && !st.fin) out.damage.push(Math.round(n) + ' from ' + (src && (src.id || src.type) || src)); }));
    try {
      // 1. the load
      seed(sd);
      const env = { game: 'signalhill', v: 1, slot: 2, meta: { chapter: snap.S.chapter, room: snap.S.room, date: Date.now() }, S: snapS(snap), chapterStart: null };
      localStorage.setItem(M.Save._key(2), JSON.stringify(env));
      M.Game.continueFrom(2);
      let t = 0;
      for (; t < 40; t += 0.1) {
        await adv(0.1);
        if (M.Game.flow === null && M.World.room && !M.World.transitioning && ((M.UI.faded || 0) < 0.02 || st.started) && (!M.Menus.isOpen() || st.started)) break;
      }
      if (t >= 40) { out.fail = 'the snapshot did not load: ' + JSON.stringify(SH.state()); return out; }
      st.loading = false;
      if (!st.started) {
        for (let k = 0; k < 10 && !st.started; k++) await adv(0.1);
      }
      if (!st.started) {
        const hold = M.Script.list().filter((c) => c.blocking || /^boss:/.test(c.name));
        if (hold.length) { out.notes.push('aborted after the load: ' + hold.map((c) => c.name).join(', ')); for (const c of hold) M.Script.abort(c.name, 'skipall'); await adv(0.2); }
        if (M.Menus.isOpen()) { await M.Menus.close(null); await adv(0.2); }
        M.Script.playCutscene(id, snap.opts || {});
      } else out.notes.push(st.how);
      out.loaded = { room: M.World.room, outage: !!M.S.outage };
      // 2. the scene
      const maxT = mode === 'skip' ? 240 : 900;
      let lastMenu = -1, lastScr = -9, wasCap = false;
      t = 0;
      while (!st.fin && !st.bossAt && t < maxT) {
        // (a scene it starts in a skip chain of its own — inheritSkip:false, 8-1 → the hut → 8-2 — is skipped as it comes)
        if (mode === 'skip' && M.Script.skippable) { if (M.Script.skip()) out.reskips++; }
        if (M.Script.choosing) { out.choices.push(t.toFixed(1)); SH.choose(o.choice || 0); }
        // an in-world screen's buttons (6-terminal's case screen): the first one, confirmed as a player would
        const cap = !M.Script.choosing && !!(M.UI.capturing && M.UI.capturing());
        if (cap && !wasCap) out.screens++;
        wasCap = cap;
        if (cap && t - lastScr > 1) { for (let k = 0; k < (o.choice || 0); k++) { SH.press('right'); await adv(0.1); } SH.press('confirm'); lastScr = t; }
        if (M.Menus.isOpen()) {
          const cur = M.Menus.current;
          if (M.Menus._top && M.Menus._top.ready && lastMenu < 0) { out.menus.push(cur); SH.nav('cancel'); lastMenu = t; }
          else if (lastMenu >= 0 && t - lastMenu > 1.5) { M.Menus.close(null); lastMenu = -1; }
        } else lastMenu = -1;
        if (holdShown() && !(M.Input.down && M.Input.down('interact'))) { out.holds++; SH.press('interact', 3.2); }
        // (an 'input' wait — a line that waits for E — would hold a played run for ever: after 5 min, E once a second)
        if (mode === 'play' && t > 300 && Math.abs(t % 1) < 0.05) { if (M.Script.advance()) out.advanced++; }
        await adv(0.1); t += 0.1;
      }
      if (st.bossAt && !st.fin) {
        // compared as the fight starts (the skip ends there); then the fight is dropped
        await adv(0.5);
        st.fin = { ...st.bossAt, pres0: pres() };
        out.boss = st.bossAt.boss;
        out.pres = st.fin.pres0;
        M.Script.abortAll('skipall');
        await adv(0.3);
      } else if (!st.fin) {
        out.fail = (st.started ? 'the scene did not end within ' + maxT + ' s of game time: ' : 'the scene never started: ') + JSON.stringify(SH.state()) + ' scripts ' + JSON.stringify(M.Script.list().map((c) => c.name));
        M.Script.abortAll('skipall');
      } else {
        // settle (an Outage coming on — G.outage swaps at once when skipped — runs ~9 s in all), then the presentation
        for (let k = 0; k < 100; k++) await adv(0.1);
        out.pres = pres();
        out.world2 = world();
        out.S2 = clone(M.S);
      }
    } finally { for (const f of offs) f(); MU.live = false; }
    out.fin = st.fin;
    if (st.fin) out.dur = +(st.fin.t - st.t0).toFixed(1);
    out.s0 = st.s0 || null;
    out.errors = SH.errors.slice(e0);
    return out;
  }
  // a synthetic snapshot when no playthrough reached the scene: the chapter's debugState at its start (+ extras)
  async function synth(id, o = {}) {
    const n = /^P-/.test(id) ? 0 : /^E-/.test(id) ? 8 : /^TR-/.test(id) ? 0 : Number(String(id).match(/^(\\d)/)?.[1] ?? 0);
    await SH.newGame({ skipIntro: true });
    await SH.chapter(n);
    let t = 0;
    for (; t < 30; t += 0.2) { if (M.Script.skippable) SH.skip(); if (M.Script.choosing) SH.choose(0); await adv(0.2); if (SH.mode === 'play' && !M.Script.busy && !M.World.transitioning) break; }
    if (/^TR-/.test(id)) { await SH.goto('test_room', 'start'); for (let k = 0; k < 40 && (M.World.room !== 'test_room' || M.World.transitioning); k++) await adv(0.1); await adv(0.3); }
    if (id === 'E-YES') SH.preset('yes');
    const s = clone(M.S), p = M.Player.pos;
    s.pos = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; s.yaw = +M.Player.yawDeg.toFixed(1); s.room = M.World.room;
    return JSON.stringify({ id, S: s, room: M.World.room, mode: SH.mode, parent: null, opts: {}, scripts: [], synthetic: 'SH.chapter(' + n + ')' + (id === 'E-YES' ? ' + preset yes' : '') + (/^TR-/.test(id) ? ' + test_room' : ''), path: null });
  }
  window.__SA = { run, synth, pres };
  return 1;`);
}

async function reloadPage(h) {
  await h.page.reload();
  await h.page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: 120000 });
  await installRunner(h);
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------------------------------
const TIMING_STATS = ['time', 'walked', 'ran'];
const STORY_KEYS = ['chapter', 'room', 'outage', 'F', 'A', 'flags', 'chaseHits', 'inv', 'equipped', 'ammo', 'docs', 'maps', 'mapMarks', 'calls', 'voicemails', 'notes', 'taken', 'freedOrder', 'stickers', 'waiLine', 'saves'];
function normS(s) {
  const c = JSON.parse(JSON.stringify(s || {}));
  delete c.pos; delete c.yaw;
  if (c.stats) for (const k of TIMING_STATS) delete c.stats[k];
  const cs = {};
  for (const k of Object.keys(c.done || {})) if (k.startsWith('cs:')) { cs[k] = c.done[k]; delete c.done[k]; }
  return { s: c, cs };
}
function deepDiff(a, b, p, out, tol = 1e-3) {
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > tol) out.push(`${p}: ${a} ≠ ${b}`); return out; }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) out.push(`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return out; }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const q = p ? `${p}.${k}` : k;
    if (!(k in a)) { out.push(`${q}: (missing) ≠ ${JSON.stringify(b[k])}`); continue; }
    if (!(k in b)) { out.push(`${q}: ${JSON.stringify(a[k])} ≠ (missing)`); continue; }
    deepDiff(a[k], b[k], q, out, tol);
  }
  return out;
}
const PRES_TOL = { fade: 0.051, static: 0.05 };
function compare(A, B) {
  const sd = [], pd = [], info = [];
  if (A.fail || B.fail) return { sd, pd, info, fail: [A.fail && 'played: ' + A.fail, B.fail && 'skipped: ' + B.fail].filter(Boolean) };
  const a = normS(A.fin.S), b = normS(B.fin.S);
  deepDiff(a.s, b.s, 'S', sd);
  const csd = deepDiff(a.cs, b.cs, 'cs', []);
  if (csd.length) info.push('cs markers: ' + csd.join('; '));
  if ((A.fin.room || null) !== (B.fin.room || null)) sd.push(`room: ${A.fin.room} ≠ ${B.fin.room}`);
  const da = A.fin.at, db = B.fin.at;
  if (da && db && (Math.hypot(da.x - db.x, da.z - db.z) > 0.35 || Math.abs(da.y - db.y) > 0.35)) sd.push(`Aidan at the end: ${da.x},${da.y},${da.z} ≠ ${db.x},${db.y},${db.z}`);
  if (A.boss !== B.boss) sd.push(`boss fight: ${A.boss} ≠ ${B.boss}`);
  // S again once settled: what the scene left running (its G.bg children — a skipped scene's finish at once) is done.
  // Only the story state: done keys, stats, health and spawns move on their own with the room's timers and monsters
  // (6-power: the walls' voices count up in S.done every 26–44 s of room time — a played scene shifts the count)
  if (A.S2 && B.S2 && !sd.length) {
    const pick = (x) => { const o = {}; for (const k of STORY_KEYS) o[k] = x[k]; return o; };
    for (const x of deepDiff(pick(normS(A.S2).s), pick(normS(B.S2).s), 'S', [])) sd.push('10 s later, ' + x);
  }
  // the room as the scene leaves it: people within 0.35 m and shown or not, monsters within 0.5 m and freed or not (as it
  // ends); the people's loops, faces, hand props and arm poses, and the doors (once settled: a gesture in flight changes a
  // face for a moment, a door swings for ~0.75 s — a skipped scene ends as its door starts to open)
  const wa = A.fin.world || {}, wb = B.fin.world || {};
  const sa = A.world2 || wa, sb = B.world2 || wb;
  for (const [kind, tol] of [['npcs', 0.35], ['enemies', 0.5]]) {
    const xa = wa[kind] || {}, xb = wb[kind] || {};
    for (const k of new Set([...Object.keys(xa), ...Object.keys(xb)])) {
      const p = xa[k], q = xb[k];
      if (!p || !q) { sd.push(`${kind}.${k}: ${p ? 'present' : 'absent'} ≠ ${q ? 'present' : 'absent'}`); continue; }
      if (Math.hypot(p.x - q.x, p.z - q.z) > tol || Math.abs(p.y - q.y) > tol) sd.push(`${kind}.${k} at ${p.x},${p.y},${p.z} ≠ ${q.x},${q.y},${q.z}`);
      for (const f of ['shown', 'resolved']) if (f in p && p[f] !== q[f]) sd.push(`${kind}.${k}.${f}: ${p[f]} ≠ ${q[f]}`);
      const p2 = (sa[kind] || {})[k], q2 = (sb[kind] || {})[k];
      if (!p2 || !q2) continue;
      for (const f of ['anim', 'expr', 'held', 'carry']) if (f in p2 && JSON.stringify(p2[f]) !== JSON.stringify(q2[f])) sd.push(`${kind}.${k}.${f}: ${JSON.stringify(p2[f])} ≠ ${JSON.stringify(q2[f])}`);
    }
  }
  deepDiff(sa.doors || {}, sb.doors || {}, 'doors', sd);
  if (A.choices.length !== B.choices.length) sd.push(`choices asked: ${A.choices.length} ≠ ${B.choices.length}`);
  if (A.screens !== B.screens) sd.push(`screen choices: ${A.screens} ≠ ${B.screens}`);
  // (a reading view a skipped scene leaves out — 3-2's email — is presentation: what it adds to S is compared above)
  if (JSON.stringify(A.menus) !== JSON.stringify(B.menus)) info.push(`menus opened: ${JSON.stringify(A.menus)} ≠ ${JSON.stringify(B.menus)}`);
  if (A.holds !== B.holds && (A.holds === 0) !== (B.holds === 0)) sd.push(`E holds: ${A.holds} ≠ ${B.holds}`);
  if (JSON.stringify(A.started) !== JSON.stringify(B.started)) sd.push(`scenes started: ${A.started.join(' ')} ≠ ${B.started.join(' ')}`);
  if (JSON.stringify(A.saves) !== JSON.stringify(B.saves)) sd.push(`autosaves: ${JSON.stringify(A.saves)} ≠ ${JSON.stringify(B.saves)}`);
  const pa = A.pres || {}, pb = B.pres || {};
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    if (k === '_cue') continue;
    if (k === 'post') { deepDiff(pa.post, pb.post, 'post', pd, 0.02); continue; }
    // a music cue the scene itself started still playing out after the played scene: a skip drops the scene's music
    // cues (ENGINE_NOTES §2) — not a wrong state; music the skipped run leaves playing that the played one doesn't is
    if (k === 'music' && pa.music && !pb.music && pa._cue && pa._cue.scene) { info.push(`music: the scene's "${pa._cue.name}" cue still plays out after the played scene (a skip drops it)`); continue; }
    if (typeof pa[k] === 'number' && typeof pb[k] === 'number') { if (Math.abs(pa[k] - pb[k]) > (PRES_TOL[k] ?? 1e-3)) pd.push(`${k}: ${pa[k]} ≠ ${pb[k]}`); continue; }
    if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) pd.push(`${k}: ${JSON.stringify(pa[k])} ≠ ${JSON.stringify(pb[k])}`);
  }
  // skippable at all, and the skip ends it at once (only choices, screen buttons and E holds still wait for the player)
  if (!B.skipOk) sd.push('the scene could not be skipped (SH.skip() as it started did nothing)');
  const allowed = 2 + 3 * (B.holds || 0) + 1.5 * (B.screens || 0) + 0.5 * B.choices.length;
  if (B.dur > allowed) sd.push(`the skipped run took ${B.dur} s of game time (${allowed} s allowed for its choices / holds)`);
  // the moment the scene ends (its own clean-up done): the things that switch at once
  const a0 = (A.fin && A.fin.pres0) || {}, b0 = (B.fin && B.fin.pres0) || {};
  for (const k of ['letterbox', 'hud', 'camScripted', 'grade', 'room', 'outage', 'aidanVisible']) {
    if (JSON.stringify(a0[k]) !== JSON.stringify(b0[k])) pd.push(`as it ends, ${k}: ${JSON.stringify(a0[k])} ≠ ${JSON.stringify(b0[k])}`);
  }
  // and in either run, once nothing holds the player any more (no blocking script, no fight): no letterbox, no scripted
  // camera, no skip still on, the player in control, the HUD up, the screen not black — except after the scenes that
  // hand over to Game.ending (E-*, and 8-2A → Follow Up Tomorrow): they end on black, the HUD down, by design
  for (const [k, R] of [['played', A], ['skipped', B]]) {
    const p = R.pres;
    if (!p || p.busy || p.fight || A.boss || /^E-/.test(A.id) || A.id === '8-2A') continue;
    const bad = [];
    if (p.letterbox) bad.push('the letterbox');
    if (p.camScripted) bad.push('a scripted camera');
    if (p.skipping) bad.push('a skip still running');
    if (!p.control && p.mode === 'play') bad.push('no player control');
    if (!p.hud) bad.push('the HUD hidden');
    if (p.fade > 0.5) bad.push(`the screen faded out (${p.fade})`);
    if (bad.length) pd.push(`${k}: 10 s after the scene, with nothing running: ${bad.join(', ')}`);
  }
  // a skip must end at once — or at the fight, a choice, a hold
  if (B.errors.length) sd.push('errors (skipped): ' + B.errors.slice(0, 3).join(' | '));
  if (A.errors.length) sd.push('errors (played): ' + A.errors.slice(0, 3).join(' | '));
  return { sd, pd, info, fail: [] };
}

// ---------------------------------------------------------------------------------------------------------------------
async function replayMode(page, h) {
  const reload = process.env.SH_RELOAD || 'none';
  const verbose = process.env.SH_VERBOSE === '1';
  const T0 = Date.now();
  // 1. snapshots (capture the missing paths first)
  const have = (p) => { try { return fs.readdirSync(path.join(SNAPS, p)).some((f) => f.endsWith('.json')); } catch (e) { return false; } };
  const need = process.env.SH_CAPTURE === '1' ? PATHS : process.env.SH_CAPTURE === '0' ? [] : PATHS.filter((p) => !have(p));
  if (need.length) await runCaptures(need);
  await installRunner(h);
  const bh = buildHash();
  for (const p of PATHS) {
    let was = null; try { was = fs.readFileSync(path.join(SNAPS, p, '_build.txt'), 'utf8').trim(); } catch (e) { /* none */ }
    if (was && was !== bh) console.log(`(the ${p} snapshots come from another build, ${was} — this one is ${bh}; SH_CAPTURE=1 takes new ones)`);
  }
  const ids = await ev(h, 'return Object.keys(SH.mod.CUTSCENES)');
  const only = (process.env.SH_ONLY || '').split(',').filter(Boolean);
  const list = only.length ? ids.filter((id) => only.includes(id)) : ids;
  for (const id of only) if (!ids.includes(id)) console.log(`(SH_ONLY: no cutscene "${id}")`);
  console.log(`skipall: ${list.length} of ${ids.length} scenes · snapshots from ${SNAPS} (${PATHS.join(', ')}) · reload ${reload}${CHOICE ? ' · choices: option ' + CHOICE : ''}`);
  const jobs = [];
  for (const id of list) {
    const found = [];
    for (const p of PATHS) {
      const f = path.join(SNAPS, p, id.replace(/[^\w.-]/g, '_') + '.json');
      if (fs.existsSync(f)) { found.push({ from: p, json: fs.readFileSync(f, 'utf8') }); if (process.env.SH_ALLPATHS !== '1') break; }
    }
    if (!found.length) found.push({ from: 'synthetic', json: null });
    for (const f of found) jobs.push({ id, ...f });
  }
  const rows = [], bad = [];
  for (const job of jobs) {
    const tj = Date.now();
    let json = job.json;
    if (!json) { json = await ev(h, `return await window.__SA.synth(${JSON.stringify(job.id)})`); job.from = 'synthetic: ' + JSON.parse(json).synthetic; }
    const snap = JSON.parse(json);
    const where = `${job.from === 'synthetic' || job.from.startsWith('synthetic') ? job.from : job.from} ch${snap.S.chapter} ${snap.room || snap.S.room}`;
    const once = async (withReload) => {
      if (withReload === 'cs' || withReload === 'run') await reloadPage(h);
      const A = await ev(h, `return await window.__SA.run(${JSON.stringify(json)}, 'play', { choice: ${CHOICE} })`);
      if (withReload === 'run') await reloadPage(h);
      const B = await ev(h, `return await window.__SA.run(${JSON.stringify(json)}, 'skip', { choice: ${CHOICE} })`);
      return { A, B, c: compare(A, B) };
    };
    let r;
    try {
      r = await once(reload);
      let retried = false;
      if (reload === 'none' && (r.c.sd.length || r.c.pd.length || r.c.fail.length)) {
        const r2 = await once('run');
        retried = true;
        const same = JSON.stringify([r2.c.sd, r2.c.pd, r2.c.fail]) === JSON.stringify([r.c.sd, r.c.pd, r.c.fail]);
        const firstTry = [...r.c.fail, ...r.c.sd, ...r.c.pd];
        r = r2; r.retried = same ? 'same after a reload' : 'reloaded';
        if (!same) r.c.info.push('in the shared page first: ' + firstTry.slice(0, 4).join(' | ') + (firstTry.length > 4 ? ` … (${firstTry.length})` : ''));
      }
      r.retriedAny = retried;
    } catch (e) {
      r = { A: {}, B: {}, c: { sd: [], pd: [], info: [], fail: ['THREW: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')] } };
      try { await reloadPage(h); } catch (e2) { /* next job */ }
    }
    const { A, B, c } = r;
    const ok = !c.sd.length && !c.pd.length && !c.fail.length;
    const row = { id: job.id, where, played: A.dur, skipped: B.dur, sd: c.sd.length, pd: c.pd.length, ok, notes: [], real: (Date.now() - tj) / 1000 };
    const extra = [];
    if (A.boss) extra.push(`boss ${A.boss.replace('boss:', '')}`);
    if (A.choices && A.choices.length) extra.push(`${A.choices.length} choice${A.choices.length > 1 ? 's' : ''}`);
    if (A.screens) extra.push(`${A.screens} screen choice${A.screens > 1 ? 's' : ''}`);
    if (A.menus && A.menus.length) extra.push('menus ' + A.menus.join('+'));
    if (A.holds) extra.push('hold E');
    if (B.reskips) extra.push(`${B.reskips} re-skip${B.reskips > 1 ? 's' : ''}`);
    if (A.advanced) extra.push(`E×${A.advanced} (played run waited for input)`);
    if (A.started && A.started.length > 1) extra.push('nested ' + A.started.slice(1).join(' '));
    if (r.retried) extra.push(r.retried);
    row.extra = extra.join(', ');
    rows.push(row);
    // what the scene changed in S (the played run): the state changes a skip must still make
    if (A.s0 && A.fin && A.fin.S) {
      const ch = deepDiff(normS(A.s0).s, normS(A.fin.S).s, 'S', []).filter((x) => !/^S\.health|^S\.stats\.damage/.test(x));
      row.changes = ch.length;
      row.changed = ch.map((x) => x.slice(2, x.indexOf(': '))).map((x) => x.replace(/^(flags|done|docs|taken|maps|mapMarks|calls|spawns|stickers|notes)\.([^.]+).*$/, '$1.$2')).filter((x, i, a) => a.indexOf(x) === i);
    }
    const lim = verbose ? 1e9 : 8;
    const lines = [...c.fail.map((x) => 'FAIL ' + x), ...c.sd.slice(0, lim).map((x) => 'S    ' + x), ...(c.sd.length > lim ? [`S    … ${c.sd.length - lim} more`] : []),
      ...c.pd.slice(0, lim).map((x) => 'AFTER ' + x), ...(c.pd.length > lim ? [`AFTER … ${c.pd.length - lim} more`] : []), ...c.info.map((x) => 'info ' + x),
      ...((A.notes || []).concat(B.notes || [])).filter((x, i, arr) => arr.indexOf(x) === i).map((x) => 'note ' + x),
      ...(!ok && A.damage && A.damage.length ? ['note damage (played): ' + A.damage.slice(0, 6).join(', ')] : []),
      ...(!ok && B.damage && B.damage.length ? ['note damage (skipped): ' + B.damage.slice(0, 6).join(', ')] : [])];
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${job.id.padEnd(10)} ${where.padEnd(34)} played ${String(A.dur ?? '-').padStart(6)} s · skipped ${String(B.dur ?? '-').padStart(5)} s${row.extra ? ' · ' + row.extra : ''}  (${row.real.toFixed(0)} s real)`);
    if (row.changed && (verbose || row.changed.length)) console.log(`       changes ${row.changes}: ${row.changed.slice(0, verbose ? 99 : 10).join(' ')}${!verbose && row.changed.length > 10 ? ' …' : ''}`);
    for (const l of lines) console.log('       ' + l);
    if (verbose) for (const [k, R] of [['played', A], ['skipped', B]]) {
      if (R.tl && R.tl.length) console.log(`       ${k}: ${R.tl.join(' · ')}`);
      const w = R.fin && R.fin.world;
      if (w) console.log(`       ${k}: the room at the end: people ${Object.entries(w.npcs).map(([n, v]) => `${n} ${v.x},${v.z} ${v.anim}/${v.expr}${v.shown ? '' : ' (hidden)'}`).join('; ') || '-'} · monsters ${Object.keys(w.enemies).join(' ') || '-'} · doors open ${Object.entries((R.world2 || w).doors).filter(([, d]) => d.open).map(([n]) => n).join(' ') || '-'}; Aidan ${JSON.stringify(R.pres && R.pres.aidan)}`);
    }
    if (!ok) bad.push(job.id);
  }
  // the table
  console.log('\nSKIP TABLE  (game seconds from the start of the scene to its end — or to the boss fight it starts)');
  console.log('  scene       from                                 played  skipped  S changes  S diffs  after diffs  result');
  for (const r of rows) console.log(`  ${r.id.padEnd(10)}  ${r.where.padEnd(35)}  ${String(r.played ?? '-').padStart(6)}  ${String(r.skipped ?? '-').padStart(7)}  ${String(r.changes ?? '-').padStart(9)}  ${String(r.sd).padStart(7)}  ${String(r.pd).padStart(11)}  ${r.ok ? 'ok' : 'FAIL'}${r.extra ? '  (' + r.extra + ')' : ''}`);
  const missing = ids.filter((id) => !list.includes(id));
  console.log(`  ${rows.filter((r) => r.ok).length}/${rows.length} scenes match${missing.length && !only.length ? ' · not run: ' + missing.join(' ') : ''} · ${((Date.now() - T0) / 60000).toFixed(1)} min real`);
  return report('skipall', !bad.length, bad.length ? 'mismatch: ' + bad.join(' ') : `${rows.length} scenes, played = skipped`);
}

export default async function (page, h) {
  if (process.env.SH_SKIPALL === 'capture') return captureMode(page, h);
  return replayMode(page, h);
}
