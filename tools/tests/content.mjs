// tools/tests/content.mjs — spec §14 acceptance checks that read the content rather than play it:
//   1. NETWORK ("The only network request is the Three.js import from the CDN"): the built file is scanned for every URL
//      and every network API (fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, workers, <link>, @import,
//      url(http…), <img src=http…>): the only URLs allowed are the import map's cdn.jsdelivr.net/npm/three@… entries;
//      then the page is reloaded and every request it makes until the title is up (and through a room load) is listed:
//      only the page itself and cdn.jsdelivr.net/npm/three@… modules may appear (tools/run.mjs serves those from
//      node_modules and BLOCKS anything else — a blocked request fails the run as well).
//   2. EXAMINES ("Every room has at least five examine lines", §4 "Write at least 5 to 10 examine lines per room"): every
//      room in ROOMS is built (Kit.build) with its chapter's chapter-select state, and its examine interactables (K.examine,
//      and the `examine` opt of props and K.npc people, which register through it) are counted in each world the room is
//      walked in (both when it has Outage content). Rooms the player never walks are listed, not failed: cutsceneOnly sets,
//      the title backdrop, the ending sets (e_*: every ending scene holds the player) and the developer test rooms.
//      A world whose only use is a boss fight is named in FIGHT_ONLY.
//   3. CONTENT RULES (§1: no hanging imagery): nothing that hangs from a ceiling (a security tether, a headset on its cord,
//      receipt strips, a receipt curtain, a fluoro on chains) within 1.5 m (in plan) of an overturned chair — in every room,
//      both worlds.
// The visual half of §1 (what every figure wears round its neck; the monsters' damage states) is tools/tests/lineup.mjs.
//
//   node tools/build.mjs --out .build/content.html
//   node tools/run.mjs --file .build/content.html --size 640x360 --quiet --script tools/tests/content.mjs
// Prints a table and `PASS content`.
import fs from 'node:fs';
import path from 'node:path';
import { ev, report } from './lib.mjs';

const MIN_EXAMINES = 5;
// rooms whose Outage exists only for a boss fight (no free exploring in that world): the Fog-world count stands for them
const FIGHT_ONLY = { c3_frame: 'the Outage frame hall is the Restructure fight (E re-patches the jacks); the Outage lifts when it ends' };
const HANGING = ['tether_hanging', 'headset_hanging', 'receipt_strip', 'receipt_curtain'];

function fileArg() {
  const a = process.argv, i = a.indexOf('--file');
  return path.resolve(i >= 0 ? a[i + 1] : 'signal-hill.html');
}

export default async function (page, h) {
  const t0 = Date.now();
  let ok = true;
  // ---- 1. network ---------------------------------------------------------------------------------------------------
  {
    const notes = [];
    const html = fs.readFileSync(fileArg(), 'utf8');
    const urls = [...html.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'`)<>]*)?/gi)].map((m) => m[0]);
    const allowed = (u) => /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\//.test(u);
    const other = [...new Set(urls.filter((u) => !allowed(u)))];
    notes.push(`URLs in the build: ${[...new Set(urls)].join(', ')}`);
    if (other.length) { notes.push(`BUG: URLs other than the three.js import map: ${other.join(', ')}`); }
    const apis = { fetch: /\bfetch\s*\(/g, XMLHttpRequest: /\bXMLHttpRequest\b/g, WebSocket: /\bWebSocket\b/g, EventSource: /\bEventSource\b/g, sendBeacon: /\bsendBeacon\b/g,
      Worker: /\bnew\s+(?:Shared)?Worker\b/g, serviceWorker: /\bserviceWorker\b/g, importScripts: /\bimportScripts\b/g, 'dynamic import()': /\bimport\s*\(\s*['"`]/g,
      '<link> (not a data: icon)': /<link\b(?![^>]*href="data:)/gi, '@import': /@import\b/g, 'url(http)': /url\(\s*['"]?https?:/gi, 'src=http': /\bsrc\s*=\s*['"]https?:/gi, '<iframe>': /<iframe\b/gi, 'window.open': /\bwindow\.open\s*\(/g };
    for (const [k, re] of Object.entries(apis)) { const n = (html.match(re) || []).length; if (n) { notes.push(`BUG: ${k} × ${n} in the build`); } }
    const mods = [...html.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    notes.push(`module imports: ${[...new Set(mods)].join(', ')}`);
    if (mods.some((m) => !/^three(\/addons\/.*)?$/.test(m))) notes.push('BUG: a module import that is not three / three/addons');
    // every request the page makes from a fresh load to the title, a new game and a room load
    const seen = [];
    const onReq = (r) => seen.push(r.url());
    page.on('request', onReq);
    await page.reload();
    await page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: 60000 });
    await ev(h, "await SH.newGame({ skipIntro: true }); await SH.advance(2); await SH.goto('c1_relay', 'south'); await SH.advance(2); return 1");
    page.off('request', onReq);
    const outside = seen.filter((u) => u !== 'http://signalhill.local/index.html' && !allowed(u) && !/^(data|blob):/.test(u));
    const three = [...new Set(seen.filter(allowed).map((u) => u.replace(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\//, '')))];
    notes.push(`requests from boot to a room: ${seen.length} — the page, ${three.length} three.js module(s) (${three.join(', ')})${outside.length ? ', and ' + outside.join(', ') : ''}`);
    if (outside.length) notes.push(`BUG: requests outside the three.js CDN: ${outside.join(', ')}`);
    for (const n of notes) console.log('  ' + n);
    ok = report('network: the only requests are the three.js CDN import (§1, §14)', !notes.some((n) => n.startsWith('BUG'))) && ok;
  }
  // ---- 2. + 3. every room built on its own -------------------------------------------------------------------------------
  const rows = await ev(h, `
    const M = SH.mod, fresh = JSON.stringify(M.S), HANG = ${JSON.stringify(HANGING)};
    const out = [];
    const matchW = (w, outage) => !w || w === 'both' || (w === 'outage') === !!outage;
    for (const id of Object.keys(M.ROOMS)) {
      const def = M.ROOMS[id];
      const ch = Number.isFinite(def.chapter) ? def.chapter : /^e_/.test(id) ? 8 : null;
      const s = JSON.parse(fresh);
      try { if (ch !== null && M.CHAPTERS[ch] && M.CHAPTERS[ch].debugState) M.CHAPTERS[ch].debugState(s); } catch (e) { /* no chapter */ }
      s.chapter = ch ?? 0; s.room = id;
      Object.keys(M.S).forEach((k) => delete M.S[k]); Object.assign(M.S, s);
      // record the room-level props (hanging things, overturned chairs) as the build places them
      const placed = [];
      const orig = def.build;
      let rb = null;
      try {
        def.build = function (K) {
          const kp = K.prop; let depth = 0;
          K.prop = (kind, x, z, rot, o = {}) => {
            if (depth === 0 && (HANG.includes(kind) || kind === 'fallen_chair' || (kind === 'fluoro_tube' && o.chains))) placed.push({ kind, x, z, world: o.world || null });
            depth++; try { return kp(kind, x, z, rot, o); } finally { depth--; }
          };
          return orig.call(this, K);
        };
        rb = M.Kit.build(def);
      } catch (e) { out.push({ id, err: String(e && e.message || e) }); continue; }
      finally { def.build = orig; }
      const ex = rb.interactables.filter((i) => i.kind === 'examine');
      const hasOutage = !!(def.outageFog || def.outageAmbient || def.outageEnv) || (M.CAMERAS[id] || []).some((c) => c.world === 'outage') ||
        (M.SPAWNS[id] || []).some((sp) => sp && sp.world === 'outage') || rb.floors.some((f) => f.world === 'outage') || rb.tagged.some((t) => t.world === 'outage');
      const count = (outage) => ex.filter((i) => matchW(i.world, outage)).length;
      const lines = (outage) => ex.filter((i) => matchW(i.world, outage)).map((i) => i.id);
      const chairs = placed.filter((p) => p.kind === 'fallen_chair'), hangs = placed.filter((p) => p.kind !== 'fallen_chair');
      const over = [];
      for (const c of chairs) for (const p of hangs) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < 1.5) over.push(p.kind + ' ' + d.toFixed(2) + ' m from the chair at ' + c.x + ',' + c.z); }
      out.push({ id, ch, cs: !!def.cutsceneOnly, fog: count(false), outage: hasOutage ? count(true) : null, chairs: chairs.length, hangs: hangs.length, over, ids: lines(false).length < 5 ? lines(false) : null });
      try { rb.dispose(); } catch (e) { /* gone */ }
    }
    Object.keys(M.S).forEach((k) => delete M.S[k]); Object.assign(M.S, JSON.parse(fresh));
    return out;`);
  {
    const notes = [];
    const walked = (r) => !r.cs && r.id !== 't_title' && !/^e_/.test(r.id) && !/^test_/.test(r.id);
    let nWalk = 0, minRoom = null;
    for (const r of rows) {
      if (r.err) { notes.push(`BUG: ${r.id} did not build: ${r.err}`); continue; }
      const tag = !walked(r) ? (r.cs ? ' (cutscene set)' : r.id === 't_title' ? ' (title backdrop)' : /^e_/.test(r.id) ? ' (ending set)' : ' (developer room)') : '';
      notes.push(`${r.id.padEnd(16)} ch${String(r.ch ?? '-').padEnd(2)} examines: Fog ${String(r.fog).padStart(2)}${r.outage !== null ? ' · Outage ' + String(r.outage).padStart(2) : ''}${tag}`);
      if (!walked(r)) continue;
      nWalk++;
      const least = Math.min(r.fog, r.outage === null || FIGHT_ONLY[r.id] ? Infinity : r.outage);
      if (!minRoom || least < minRoom.n) minRoom = { id: r.id, n: least };
      if (r.fog < MIN_EXAMINES) notes.push(`BUG: ${r.id} has ${r.fog} examine lines in the Fog world (${(r.ids || []).join(', ')})`);
      if (r.outage !== null && r.outage < MIN_EXAMINES) {
        if (FIGHT_ONLY[r.id]) notes.push(`  (${r.id}: ${r.outage} in the Outage — ${FIGHT_ONLY[r.id]})`);
        else notes.push(`BUG: ${r.id} has ${r.outage} examine lines in the Outage`);
      }
    }
    notes.push(`${nWalk} walkable rooms; the fewest examine lines in any walkable world: ${minRoom ? `${minRoom.n} (${minRoom.id})` : '-'}`);
    for (const n of notes) console.log('  ' + n);
    ok = report(`examines: every walkable room has ≥ ${MIN_EXAMINES} examine lines in every world it is walked in (§4, §14)`, !notes.some((n) => n.startsWith('BUG'))) && ok;
  }
  {
    const notes = [];
    let chairs = 0, hangs = 0;
    for (const r of rows) {
      if (r.err) continue;
      chairs += r.chairs; hangs += r.hangs;
      for (const o of r.over) notes.push(`BUG: ${r.id}: ${o}`);
    }
    notes.push(`${chairs} overturned chair(s), ${hangs} hanging tether / headset / receipt prop(s) across every room; none within 1.5 m of a chair`);
    for (const n of notes) console.log('  ' + n);
    ok = report('content rules: nothing hangs over an overturned chair (§1)', !notes.some((n) => n.startsWith('BUG'))) && ok;
  }
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) console.log('  SH.errors:', errs.slice(0, 6).join(' | '));
  report('content', ok && !errs.length, `${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
