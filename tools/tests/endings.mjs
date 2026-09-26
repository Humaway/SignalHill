// tools/tests/endings.mjs — the title screen and the four endings, played through to the title (spec §2A Title screen
// steps 1–5 + Results, §12 Endings / Fate cards / Credits, §4 ending logic; CONTENT_PLAN §7 ending ids).
//
//   node tools/build.mjs --out .build/end.html && node tools/run.mjs --file .build/end.html --script tools/tests/endings.mjs
//   env: END_ONLY=connected,yes (a subset)   END_SKIP=0 (no skipped pass)   END_TITLE=0 (no title check)
//        END_SHOTS=<dir> (a screenshot at every camera cut / card / screen change, e.g. .build/endshots)
//
// Default run, one browser session:
//   1. the title from a fresh boot (§2A): 3 s of black (+ static hiss) → the Lookout vista fades up (t_title, the mast's
//      red light in frame, in its upper part) → "SIGNAL HILL" → "PRESS ANY KEY" ~2 s after the name is in → a key brings
//      the menu (NEW GAME / LOAD GAME / OPTIONS, no EXTRA before any ending) → 60 idle s → the attract sequence (silent
//      shots of c1_relay, c2_crescent, c3_hall, c5_atrium, no text) → a key brings the title back.
//   2. every ending PLAYED through (SH.advance only, nothing skipped): SH.newGame → SH.chapter(8) → the transmitter room
//      → SH.preset(name) → SH.ending(name) → the in-room part (E-C1 / E-OC0 / E-FT0) → the ending's scenes → credits (the
//      ending's music) → [E-C3] → [fate cards, 4 s each, exact §12 text, Connected and Out of Coverage only] → results (the
//      ending's name, the §2A rows, the star rank) → the title (EXTRA). Spec lines are checked in order.
//   3. every ending again with every scene skipped (SH.skip) — the flow must still reach the title and record the ending.
//   4. EXTRA lists the four endings; New Game+ starts with the steel bar and the stickers.
// SH.errors must stay empty.
//
// Exports (for chain.mjs / ch8.mjs): playEnding(h, name, o) — continue an ending already under way (SH.mode 'ending' …)
// to the title and check it (flow, credits music, fate cards, results, EXTRA; the spec lines only when spy(h) was
// installed before the ending began — o.since = the recorder's mark then); o.skip skips every scene, o.shots = a dir;
// o.deal: the Follow Up Tomorrow ending reached through the Closer's deal (8-2A — no E-FT0);
// startEnding(h, name) — a fresh game at the transmitter room with the preset, then SH.ending(name); titleCheck(h, notes);
// spy(h) — the line recorder (UI.subtitle / card / titleText / textOnBlack, Phone.display, ending canvases).
import { ev, advance, advanceUntil, mustReach, report } from './lib.mjs';

const SPEC = {
  fates: {
    waiSaved: ['Wai trains the new starters now. He still picks up on the first ring.', "The operators' board in Signal Hill has one lamp that never lights."],
    chaseSaved: ["Chase told his leader what really happened that night. His store doesn't roster anyone alone on late shifts anymore.", 'Nobody has heard from Chase. His phone rings out.'],
    chloeSaved: ['Chloe finished the month eleven short. Nothing happened.', 'Chloe was number one again that month. And the next.'],
    lukaSaved: ['Luka stopped writing the number first.', 'Luka is still looking for the road out.'],
    lukeSaved: ['Luke visits on Sundays.', "Luke is still ringing a number that doesn't pick up."],
  },
  lines: {
    connected: [
      '?Putting you through, mate.', 'Hello? [beat] Is that the young man?', "It's Aidan. [beat] From the store. [beat] I'm so sorry.", 'Oh, love. [beat] Come and see me.',
      "Oh. [beat] It's the lovely young man.", 'Hi. [beat] Can I sit down?', 'I need to tell you something. [beat] About your alarm. About me.',
      "You came all this way. [beat] You came back. [beat] Most people don't come back, love.", 'This one works. I checked. [beat] I checked three times.',
      'I never asked your name.', 'SIGNAL HILL',
      "I just need a new phone. Whatever's best.", 'Sure. [beat] Before we look at anything, tell me what you need it to work with.',
    ],
    coverage: ['The number you have called is not connected.', "Hi Luka, I'm resigning effective immediately. Sorry.", 'He never found out if she was okay.'],
    // (the leaderboard and the back-office monitor are drawn as E-FT sets the store up, before anyone speaks)
    tomorrow: ['Your callback has been scheduled for: tomorrow.', 'AIDAN — #1', 'CASE 118-2231', 'TOMORROW',
      "Hello, love. They said my phone's going to stop working. [beat] I don't really know what I need.", "Hi there! [beat] That'll all be fine."],
    yes: ['SURPRISE!', 'Aidan! You found all twelve of me!', '...Yes.'],
  },
  // the Game.ending flow per ending (loading gaps dropped): the screens that must follow each other
  flow: {
    connected: ['ending', 'credits', 'ending', 'fates', 'results', 'title'],
    coverage: ['ending', 'credits', 'fates', 'results', 'title'],
    tomorrow: ['ending', 'credits', 'results', 'title'],
    yes: ['ending', 'credits', 'results', 'title'],
  },
  music: { connected: 'nan', coverage: 'static', tomorrow: null, yes: 'hold' },
  names: { connected: 'CONNECTED', coverage: 'OUT OF COVERAGE', tomorrow: 'FOLLOW UP TOMORROW', yes: 'YES' },
};
const FATE_KEYS = ['waiSaved', 'chaseSaved', 'chloeSaved', 'lukaSaved', 'lukeSaved'];
const ALL = ['connected', 'coverage', 'tomorrow', 'yes'];

// ---- page-side recorder: every line / card / phone display, installed once ------------------------------------------
export async function spy(h) {
  await ev(h, `if (!window.__endSpy) { window.__endSpy = true; window.__endLines = [];
    const push = (s) => { try { window.__endLines.push(String(s)); } catch (e) {} };
    const U = SH.mod.UI;
    for (const fn of ['subtitle', 'card', 'titleText', 'textOnBlack']) { const o = U[fn]; if (typeof o !== 'function') continue; U[fn] = function (t, ...a) { push(fn + ':' + t); return o.call(this, t, ...a); }; }
    const P = SH.mod.Phone, pd = P.display;
    P.display = function (o, ...a) { if (o) push('phone:' + (o.title || '') + ' | ' + (o.lines || []).join(' | ')); return pd.call(this, o, ...a); };
    // canvases drawn by the ending sets (the leaderboard, the back-office monitor): record their fillText calls
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (window.__endCanvasSpy && typeof t === 'string' && t.length > 3) push('canvas:' + t); return ft.call(this, t, ...a); };
  } return 1;`);
}
const lineMark = (h) => ev(h, 'return window.__endLines.length');
const parts = (t) => String(t).split(/\s*\[(?:long )?beat\]\s*/).filter(Boolean);
// every spec line (its [beat] parts) in order in the recorded lines since `since`; '?'-prefixed lines are optional
async function linesInOrder(h, lines, since) {
  return ev(h, `const L = window.__endLines.slice(${since}); let at = -1; const miss = [];
    for (const raw of ${JSON.stringify(lines)}) { const opt = raw[0] === '?', t = opt ? raw.slice(1) : raw;
      const ps = t.split(/\\s*\\[(?:long )?beat\\]\\s*/).filter(Boolean); let ok = true, here = at;
      for (const p of ps) { const i = L.findIndex((l, k) => k > here && l.includes(p)); if (i < 0) { ok = false; break; } here = i; }
      if (ok) at = here; else if (!opt) miss.push(t); }
    return miss;`);
}

// ---- title ------------------------------------------------------------------------------------------------------------
const titleSt = (h) => ev(h, `const t = SH.mod.Menus._top; if (!t || SH.mod.Menus.current !== 'title') return null; const o = (e) => e ? +(+getComputedStyle(e).opacity).toFixed(2) : 0;
  return { t: t.st.t, stage: t.st.stage, cover: o(t.st.cover), name: o(t.st.name), press: o(t.st.press), menu: o(t.st.menuBox), attract: !!t.st.attract,
    items: t.st.list ? t.st.list.items.filter((x) => !x.hidden).map((x) => x.label) : [] };`);
// the rooms on stage (Game builds the backdrop / attract rooms straight into the scene: 'room:<id>')
const stageRooms = (h) => ev(h, `return SH.mod.Render.scene.children.map((c) => c.name).filter((n) => /^room:/.test(n)).map((n) => n.slice(5))`);
export async function titleCheck(h, notes) {
  const bad = (m) => { notes.push('BUG: ' + m); };
  let st = await titleSt(h);
  if (!st) { bad(`the title screen is not up (mode ${await ev(h, 'return SH.mode')})`); return false; }
  if (st.stage !== 'black') notes.push(`(title already past the black: stage ${st.stage} at ${st.t.toFixed(1)} s — no intro timing check)`);
  const T = {};
  // step in game time (SH.advance → Menus.update) and note each stage's start (the menu's own clock, st.t)
  for (let i = 0; i < 200 && st && st.stage !== 'press'; i++) {
    await advance(h, 0.1);
    st = await titleSt(h);
    if (!st) break;
    if (!T[st.stage]) T[st.stage] = st.t;
    if (T.fade && !T.vista && st.cover <= 0.02) T.vista = st.t;
    if (T.name && !T.nameIn && st.name >= 0.98) T.nameIn = st.t;
  }
  notes.push(`title: black → fade ${T.fade?.toFixed(2)} s, vista up ${T.vista?.toFixed(2)} s, name ${T.name?.toFixed(2)} s (in at ${T.nameIn?.toFixed(2)}), PRESS ANY KEY ${T.press?.toFixed(2)} s`);
  if (!(T.fade >= 2.9 && T.fade <= 3.3)) bad(`the title's black lasts ${T.fade} s of game time (spec: 3 s)`);
  if (!(T.vista && T.vista - T.fade <= 4)) bad('the vista does not fade up within 4 s of the black ending');
  if (!(T.press && T.nameIn && T.press - T.nameIn >= 1.6 && T.press - T.nameIn <= 2.6)) bad(`"PRESS ANY KEY" ${T.press} s is not ~2 s after "SIGNAL HILL" (${T.nameIn} s)`);
  const rooms = await stageRooms(h);
  if (!rooms.includes('t_title')) bad(`the title backdrop is not t_title (on stage: ${rooms.join(', ')})`);
  // the mast's red light is in frame, in the upper part of it (not against the edge)
  const red = await ev(h, `const R = SH.mod.Render, THREE = SH.mod.THREE; let g = null; R.scene.traverse((o) => { if (o.name === 't_title:lights') g = o; });
    if (!g) return null; const reds = []; g.traverse((o) => { if (o.isSprite && o.material.color.r > 0.9 && o.material.color.g < 0.3) reds.push(o); });
    reds.sort((a, b) => b.position.y - a.position.y); if (!reds.length) return null;
    R.camera.updateMatrixWorld(); const p = reds[0].getWorldPosition(new THREE.Vector3()).project(R.camera); return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(3)];`);
  notes.push(`title: the mast light at NDC ${JSON.stringify(red)}`);
  if (!red || Math.abs(red[0]) > 0.9 || red[1] < 0.15 || red[1] > 0.85 || red[2] > 1) bad(`the mast's red light is not well inside the upper frame (NDC ${JSON.stringify(red)})`);
  // any key → the menu (EXTRA only after an ending)
  await ev(h, "SH.nav('any'); return 1");
  await advance(h, 1.5);
  st = await titleSt(h);
  const seen = await ev(h, 'return (SH.mod.META.endingsSeen || []).length');
  if (!st || st.stage !== 'menu' || st.menu < 0.9) bad(`no menu after a key (${JSON.stringify(st)})`);
  else {
    const want = ['NEW GAME', 'LOAD GAME', 'OPTIONS', ...(seen ? ['EXTRA'] : [])];
    if (JSON.stringify(st.items) !== JSON.stringify(want)) bad(`title menu ${JSON.stringify(st.items)}, want ${JSON.stringify(want)}`);
  }
  // 60 idle seconds → the attract sequence: its rooms, no text, then back
  await advance(h, 61);
  st = await titleSt(h);
  if (!st || !st.attract) { bad('no attract sequence after 60 idle seconds'); return false; }
  const shown = new Set();
  for (let i = 0; i < 44; i++) {
    await advance(h, 1);
    for (const r of await stageRooms(h)) shown.add(r);
    const text = await ev(h, `const t = SH.mod.Menus._top.st; return [t.name, t.press, t.menuBox].some((e) => +getComputedStyle(e).opacity > 0.05)`);
    if (text && (await titleSt(h)).attract && i > 2 && i < 30) { bad('text on screen during the attract shots'); break; }
    if (!(await titleSt(h)).attract) break;
  }
  const want = ['c1_relay', 'c2_crescent', 'c3_hall', 'c5_atrium'].filter((r) => r);
  notes.push(`attract: ${[...shown].filter((r) => r !== 't_title').join(', ')}`);
  for (const r of want) if (!shown.has(r)) bad(`the attract never showed ${r}`);
  await advanceUntil(h, "SH.mod.Menus.current === 'title' && !SH.mod.Menus._top.st.attract", 20, { step: 0.5 });
  st = await titleSt(h);
  if (!st || st.attract) bad('the attract did not return to the title');
  else if (!(await stageRooms(h)).includes('t_title')) bad('the title backdrop did not come back after the attract');
  return true;
}

// ---- endings ------------------------------------------------------------------------------------------------------------
export async function startEnding(h, name) {
  await ev(h, 'await SH.newGame({ skipIntro: true }); return 1');
  await ev(h, 'await SH.chapter(8); return 1');
  await mustReach(h, "SH.mode === 'play' && SH.mod.World.room === 'c8_summit' && !SH.mod.World.transitioning", 30, 'Chapter 8 loaded');
  await advance(h, 8);                                    // begin(): the siren and the Outage
  await ev(h, "await SH.goto('c8_transmitter', 'door'); return 1");
  await mustReach(h, "SH.mod.World.room === 'c8_transmitter' && !SH.mod.World.transitioning", 20, 'the transmitter room');
  await advance(h, 1);
  const want = await ev(h, `return SH.preset(${JSON.stringify(name)})`);
  await ev(h, `SH.ending(${JSON.stringify(name)}); return 1`);
  await advance(h, 0.2);
  return want;
}

// continue an ending under way to the title; o.skip: skip every skippable scene; o.shots: a directory for screenshots
export async function playEnding(h, name, o = {}) {
  const notes = [], bad = (m) => notes.push('BUG: ' + m);
  // (the line check needs the recorder installed before the ending began — a caller that didn't gets no line check)
  const spied = await ev(h, 'return !!window.__endSpy');
  if (!spied) { await spy(h); notes.push('(the line recorder was installed mid-ending: no line check)'); }
  const since = spied ? (o.since ?? 0) : await lineMark(h);
  const flags = await ev(h, 'return { ...SH.S.flags }');
  const t0 = Date.now();
  // page-side loop: 0.1 s steps; returns at a camera cut / screen change (for screenshots) or after `chunk` s
  const step = async (chunk) => ev(h, `
    const C = window.__endCap || (window.__endCap = {}), cam = SH.mod.Render.camera, M = SH.mod.Menus;
    const ev = [], T0 = C.T || 0; let t = 0;
    const fateText = () => { const e = document.querySelector('#ui .ft-card'); return e && +getComputedStyle(e).opacity > 0.02 ? e.textContent : ''; };
    while (t < ${chunk}) {
      ${o.skip ? "if (SH.mod.Script.skippable && !SH.mod.Script.skipping) SH.skip();" : ''}
      await SH.advance(0.1); t += 0.1; C.T = T0 + t;
      const mode = SH.mode;
      if (mode !== C.mode) { ev.push({ k: 'mode', v: mode, T: C.T, music: mode === 'credits' && M._top ? (M._top.st.music ?? null) : undefined }); C.mode = mode; }
      if (mode === 'fates') { const f = fateText(); if (f && f !== C.fate) ev.push({ k: 'fate', v: f, T: C.T }); if (f !== C.fate) C.fate = f; }
      if (mode === 'results' && M.current === 'results' && M._top && M._top.ready && !C.res) { C.res = true; ev.push({ k: 'results', v: M._top.st.r, text: [...document.querySelectorAll('#ui .rs-row')].map((e) => e.textContent).join(' | '), T: C.T }); }
      if (mode === 'results' && C.res && M._top && M._top.st.t > 3.6) { SH.nav('confirm'); }
      const p = cam.position, q = cam.quaternion;
      if (C.p && (Math.hypot(p.x - C.p[0], p.y - C.p[1], p.z - C.p[2]) > 1.5 || Math.abs(q.x * C.q[0] + q.y * C.q[1] + q.z * C.q[2] + q.w * C.q[3]) < 0.985)) ev.push({ k: 'cut', T: C.T });
      C.p = [p.x, p.y, p.z]; C.q = [q.x, q.y, q.z, q.w];
      if (mode === 'title') break;
      if (${!!o.shots} && ev.length) break;
    }
    return { ev, T: C.T, mode: SH.mode, room: SH.mod.World.room, script: SH.mod.Script.active };`);
  await ev(h, 'window.__endCap = { T: 0, mode: null }; window.__endCanvasSpy = true; return 1');
  const events = [];
  let shotN = 0, last = null;
  for (let i = 0; i < 400; i++) {
    const r = await step(o.shots ? 2 : 20);
    events.push(...r.ev);
    last = r;
    if (o.shots && shotN < 120 && r.mode !== 'title' && (r.ev.length || i % 3 === 0)) {
      await h.shot(`${o.shots}/${name}${o.skip ? '_skip' : ''}_${String(shotN++).padStart(3, '0')}.png`);
    }
    if (r.mode === 'title') break;
    if (r.T > 1200) { bad(`the ending never reached the title (${JSON.stringify(r)})`); break; }
  }
  await ev(h, 'window.__endCanvasSpy = false; return 1');
  // ---- the flow
  const modes = events.filter((e) => e.k === 'mode' && e.v !== 'loading').map((e) => e.v).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  // (a caller may hand over mid-flow — Ch 8 after the in-room scene, or already at the credits: compare from there)
  const wantAll = SPEC.flow[name];
  const start = modes.findIndex((m) => wantAll.includes(m));
  const got = start >= 0 ? modes.slice(start) : modes;
  const wantFlow = wantAll.slice(Math.max(0, wantAll.indexOf(got[0])));
  if (JSON.stringify(got) !== JSON.stringify(wantFlow)) bad(`flow ${got.join(' → ')}, want ${wantFlow.join(' → ')}`);
  // ---- credits music
  const cr = events.find((e) => e.k === 'mode' && e.v === 'credits');
  if (!cr) bad('no credits');
  else if ((cr.music ?? null) !== SPEC.music[name]) bad(`credits music ${cr.music}, want ${SPEC.music[name]}`);
  // ---- fate cards: exact text by the fate flags, in order, ~4 s each; none after Tomorrow / Yes
  const fates = events.filter((e) => e.k === 'fate');
  if (name === 'connected' || name === 'coverage') {
    const want = FATE_KEYS.map((k) => SPEC.fates[k][flags[k] ? 0 : 1]);
    const texts = fates.map((f) => f.v);
    if (JSON.stringify(texts) !== JSON.stringify(want)) bad(`fate cards ${JSON.stringify(texts)}, want ${JSON.stringify(want)}`);
    const gaps = fates.slice(1).map((f, i) => +(f.T - fates[i].T).toFixed(2));
    if (gaps.some((g) => g < 3.8 || g > 5.2)) bad(`fate cards not ~4 s each: ${gaps.join(', ')} s apart`);
    notes.push(`fates: ${texts.length} cards, ${gaps.join('/')} s apart`);
  } else if (fates.length) bad(`fate cards after ${name}: ${fates.map((f) => f.v).join(' / ')}`);
  // ---- results
  const res = events.find((e) => e.k === 'results');
  if (!res) bad('no results screen');
  else {
    const r = res.v;
    if (r.endingName !== SPEC.names[name]) bad(`results name ${r.endingName}, want ${SPEC.names[name]}`);
    for (const row of ['TOTAL TIME', 'SAVES', 'DISTANCE WALKED', 'DISTANCE RUN', 'TETHERED FREED', 'TETHERED STOMPED', 'OTHER ENEMIES DEFEATED', 'ITEMS USED', 'DAMAGE TAKEN', 'VOICEMAILS PLAYED', 'CALLS ANSWERED', 'MEMOS FOUND']) {
      if (!res.text.toUpperCase().includes(row)) bad(`results screen has no "${row}" row`);
    }
    if (!/\d+ OF \d+/.test(res.text)) bad('results: memos found is not "x of y"');
    const lost = FATE_KEYS.filter((k) => !flags[k]).length;
    const rank = Math.max(1, 10 - ((r.time || 0) > 7200 ? 1 : 0) - ((r.saves || 0) > 12 ? 1 : 0) - ((r.stomped || 0) > 5 ? 1 : 0) - ((r.memos || 0) < (r.memosTotal || 0) / 2 ? 1 : 0) - lost);
    if (r.stars !== rank) bad(`results stars ${r.stars}, want ${rank} (lost ${lost})`);
    notes.push(`results: ${r.endingName} ★${r.stars} memos ${r.memos}/${r.memosTotal} freed ${r.freed} calls ${r.callsAnswered}`);
  }
  // ---- the spec's lines, in order (only when played: a skipped scene shows no lines)
  if (!o.skip && spied && o.lines !== false) {
    // (after the Closer's deal, 8-2A: E-FT0 — the automated voice — never plays)
    const lines = o.deal ? SPEC.lines[name].filter((l) => l !== 'Your callback has been scheduled for: tomorrow.') : SPEC.lines[name];
    const miss = await linesInOrder(h, lines, since);
    if (miss.length) bad(`lines missing / out of order: ${miss.join(' / ')}`);
  }
  // ---- recorded, and the title offers EXTRA
  const meta = await ev(h, 'return { seen: SH.mod.META.endingsSeen || [], completed: !!SH.mod.META.completed, results: (SH.mod.META.results || []).length }');
  if (!meta.seen.includes(name)) bad(`META.endingsSeen ${JSON.stringify(meta.seen)} lacks ${name}`);
  if (!meta.completed) bad('META.completed not set');
  await advanceUntil(h, "SH.mod.Menus.current === 'title' && SH.mod.Menus._top.ready", 10, { step: 0.25 });
  await ev(h, "SH.nav('any'); return 1"); await advance(h, 1.2);
  const tst = await titleSt(h);
  if (!tst || !tst.items.includes('EXTRA')) bad(`no EXTRA on the title after ${name} (${JSON.stringify(tst && tst.items)})`);
  notes.push(`${name}${o.skip ? ' (skipped)' : ''}: ${got.join(' → ')}; game ${last ? last.T.toFixed(0) : '?'} s, ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
  return { ending: name, ok: !notes.some((n) => n.startsWith('BUG')), notes, flow: got };
}

export default async function (page, h) {
  const t0 = Date.now();
  const only = (process.env.END_ONLY || '').split(',').filter(Boolean);
  const list = only.length ? ALL.filter((n) => only.includes(n)) : ALL;
  const shots = process.env.END_SHOTS || '';
  if (shots) { const fs = await import('node:fs'); fs.mkdirSync(shots, { recursive: true }); }
  const notes = [];
  let ok = true;
  await spy(h);
  // 1. the title from the fresh boot
  if (process.env.END_TITLE !== '0') {
    const tn = [];
    try { await titleCheck(h, tn); } catch (e) { tn.push('BUG: title check threw: ' + e.message); }
    for (const n of tn) console.log('  ' + n);
    ok = report('title screen (§2A steps 1–5)', !tn.some((n) => n.startsWith('BUG'))) && ok;
  }
  // 2. + 3. every ending played, then skipped
  const passes = [false, ...(process.env.END_SKIP === '0' ? [] : [true])];
  for (const skip of passes) {
    for (const name of list) {
      let r;
      try {
        const e0 = await ev(h, 'return SH.errors.length');
        const since = await lineMark(h);
        const want = await startEnding(h, name);
        if (want !== name) console.log(`  (preset ${name} → Game.endingFor = ${want})`);
        r = await playEnding(h, name, { skip, since, shots: shots && !skip ? shots : '' });
        const errs = await ev(h, `return SH.errors.slice(${e0})`);
        if (errs.length) r.notes.push(`BUG: SH.errors: ${errs.slice(0, 5).join(' | ')}`);
      } catch (e) { r = { ending: name, notes: ['BUG: threw: ' + (e.stack || e.message)] }; }
      for (const n of r.notes) console.log('  ' + n);
      ok = report(`ending ${name}${skip ? ' (every scene skipped)' : ' (played through)'}`, !r.notes.some((n) => n.startsWith('BUG'))) && ok;
    }
  }
  // 4. EXTRA: the endings seen; New Game+ keeps the stickers and starts with the steel bar
  {
    const xn = [];
    const seen = await ev(h, 'return SH.mod.META.endingsSeen || []');
    for (const n of list) if (!seen.includes(n)) xn.push(`BUG: EXTRA/endings seen lacks ${n}`);
    await ev(h, "SH.menu('extra', {}); return 1");
    await advanceUntil(h, "SH.mod.Menus.current === 'extra' && SH.mod.Menus._top.ready", 10, { step: 0.2 });
    const panel = await ev(h, "const t = SH.mod.Menus._top; return { items: t.st.list.items.map((x) => x.label), text: t.st.panel.innerText }");
    xn.push(`EXTRA: ${panel.items.join(' / ')} — ${panel.text.replace(/\s+/g, ' ')}`);
    if (JSON.stringify(panel.items) !== JSON.stringify(['ENDINGS SEEN', 'PAST RESULTS', 'NEW GAME+'])) xn.push('BUG: EXTRA items ' + JSON.stringify(panel.items));
    for (const n of list) if (!panel.text.includes(SPEC.names[n])) xn.push(`BUG: EXTRA does not list ${SPEC.names[n]}`);
    await ev(h, 'SH.mod.Menus.close(); return 1'); await advance(h, 1);
    await ev(h, 'SH.mod.META.stickers = { ...(SH.mod.META.stickers || {}), sticker03: true }; await SH.newGame({ skipIntro: true, ngPlus: true }); return 1');
    await advance(h, 2);
    const ng = await ev(h, "return { ngPlus: !!SH.S.ngPlus, bar: SH.S.inv.some((i) => i.id === 'steel_bar'), sticker: !!(SH.S.stickers && SH.S.stickers.sticker03), playthrough: SH.S.playthrough }");
    xn.push(`New Game+: ${JSON.stringify(ng)}`);
    if (!ng.ngPlus || !ng.bar || !ng.sticker || !(ng.playthrough >= 2)) xn.push('BUG: New Game+ does not start with the steel bar / the stickers / playthrough ≥ 2');
    for (const n of xn) console.log('  ' + n);
    ok = report('EXTRA and New Game+', !xn.some((n) => n.startsWith('BUG'))) && ok;
  }
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) console.log('  SH.errors:', errs.slice(0, 8).join(' | '));
  report(`endings suite (${list.join(', ')})`, ok && !errs.length, `${((Date.now() - t0) / 1000).toFixed(0)} s real`);
  void page; void notes;
}
