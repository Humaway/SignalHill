// ==== engine/14_save.js — Save: localStorage slots, autosave, META (ARCHITECTURE §2, §4; spec §1, §2A Saving, §14) ====
//
// Three manual slots (payphones) + one autosave (start of each chapter). A save stores the ENTIRE game state S —
// room, position and facing, health, inventory, F and A, fate flags, chaseHits, calls, voicemails, notes, docs, maps,
// map marks, taken pickups, once/cutscene ids, freed and killed Tethered (S.spawns, S.freedOrder), stickers, stats —
// as JSON in an envelope { game, v, slot, meta, h, S }. Loading restores a deep copy of S (missing fields filled from
// newState(), so older saves keep working) and hands Game the room and entry to load.
//
// Slots are 0, 1, 2 (the indices of Save.list()) and 'auto'.
//   Save.list() → [entry|null, entry|null, entry|null] (+ list.auto = entry|null)
//     entry = { slot, label:'SLOT 1'|'AUTOSAVE', chapter, chapterName, area, playTime (s), playTimeText, saves, date (ms),
//               dateText, room, outage }
//   Save.save(slot) → entry | false      S.saves++ (manual slots only), Player.saveState() first, Bus 'save'(slot)
//   Save.load(slot|'auto') → { slot, room, entry:{pos:[x,y,z], yaw} | entryName, chapter, outage, chapterStart } | null
//     chapterStart = n for a chapter-start autosave, else null
//     aborts running scripts (Script.abortAll('load')), resets the Phone, replaces S — Game then loads the room
//     (World.load(room, entry)). Bus 'load'(slot).
//   Save.autosave({room, entry, chapterStart}) → entry | false
//     {chapterStart:n, room, entry}: the chapter-start autosave (Game.startChapter takes it before its goto). The
//     envelope records env.chapterStart = n and env.start = {room, entry}; continuing from it loads that room/entry
//     and re-runs CHAPTERS[n].begin(G, {resumed:true}) — whether or not Aidan already stood in the start room.
//     {room, entry} alone: resume at that room/entry (no begin re-run). No options: where Aidan stands now.
//   Save.hasAny(), Save.has(slot), Save.remove(slot), Save.latest() → the newest entry, Save.seq (count of manual saves
//   this session — the payphone flow uses it to tell whether the save screen saved).
//   META (persistent across playthroughs: endings seen, results, stickers for NG+, calibrated, completed, options):
//   Save.meta() → META, Save.saveMeta(), Save.setMeta(key, value), Save.setOption(key, value),
//   Save.recordEnding(name, results) (endingsSeen + results + completed), Save.addSticker(id).
// Corrupt data (unparsable JSON, a wrong envelope, a malformed S) reads as an empty slot and is logged, never thrown.
// When localStorage is unavailable (private mode, quota) saves are kept in memory for the session.
const Save = (() => {
  const VERSION = 1;
  const PREFIX = 'signalhill.save.';
  const SLOTS = 3;
  const mem = new Map();
  let seq = 0;
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (warned.has(k)) return; warned.add(k); console.warn(...a); };

  const CH_NAMES = ['NO SERVICE', 'THE PLAZA', 'HILLTOP VILLAGE', 'THE EXCHANGE', 'CUSTOMER CARE', 'LEVEL 4', 'THE MIDDLE', 'DISTRICT HOSPITAL', 'THE MAST', 'THE END'];

  function norm(slot) {
    if (slot === 'auto') return 'auto';
    const n = Number(slot);
    if (Number.isInteger(n) && n >= 0 && n < SLOTS) return n;
    warnOnce('slot:' + slot, `[Save] invalid slot ${JSON.stringify(slot)} (slots are 0, 1, 2 and 'auto')`);
    return null;
  }
  const key = (slot) => PREFIX + (slot === 'auto' ? 'auto' : String(slot + 1));
  function readRaw(k) {
    try { const v = localStorage.getItem(k); if (v !== null && v !== undefined) return v; } catch (e) { warnOnce('ls-read', '[Save] localStorage unavailable; using session memory'); }
    return mem.has(k) ? mem.get(k) : null;
  }
  function writeRaw(k, v) {
    try { localStorage.setItem(k, v); mem.delete(k); return 'disk'; }
    catch (e) { warnOnce('ls-write', '[Save] could not write localStorage — this save lasts for the session only', e && e.message); mem.set(k, v); return 'memory'; }
  }
  function removeRaw(k) { try { localStorage.removeItem(k); } catch (e) { /* unavailable */ } mem.delete(k); }

  // ---- state helpers -------------------------------------------------------------------------------------------
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  // fill fields missing from an older / partial save with the defaults (one level into plain objects)
  function migrate(s) {
    const d = newState({ playthrough: s.playthrough, ngPlus: s.ngPlus });
    for (const k of Object.keys(d)) {
      if (s[k] === undefined || (s[k] === null && d[k] !== null)) { s[k] = d[k]; continue; }
      if (isObj(d[k]) && isObj(s[k]) && ['flags', 'stats', 'difficulty', 'ammo'].includes(k)) {
        for (const kk of Object.keys(d[k])) if (s[k][kk] === undefined) s[k][kk] = d[k][kk];
      }
    }
    if (!Array.isArray(s.inv)) s.inv = [];
    const inv = [];
    for (const i of s.inv) {
      if (!i || typeof i.id !== 'string') continue;
      const n = Number.isFinite(+i.n) && +i.n > 0 ? Math.floor(+i.n) : 1;
      const e = inv.find((x) => x.id === i.id);
      if (e) e.n += n; else inv.push({ id: i.id, n });
    }
    s.inv = inv;
    if (!Array.isArray(s.voicemails)) s.voicemails = [];
    if (!Array.isArray(s.notes)) s.notes = [];
    if (!Array.isArray(s.freedOrder)) s.freedOrder = [];
    if (!Array.isArray(s.pos) || s.pos.length < 2 || s.pos.some((v) => !Number.isFinite(+v))) s.pos = [0, 0, 0];
    for (const k of ['F', 'A', 'health', 'chaseHits', 'saves', 'waiLine', 'chapter', 'yaw']) if (!Number.isFinite(+s[k])) s[k] = d[k]; else s[k] = +s[k];
    s.v = VERSION;
    return s;
  }
  function valid(env) {
    if (!isObj(env) || env.game !== 'signalhill' || !isObj(env.S)) return false;
    const s = env.S;
    return isObj(s.flags) && (Array.isArray(s.inv) || s.inv === undefined) && Number.isFinite(+s.F) && Number.isFinite(+s.A) && Number.isFinite(+s.chapter);
  }
  const chapterName = (n) => {
    const ch = typeof CHAPTERS !== 'undefined' ? CHAPTERS[n] : null;
    return String((ch && (ch.title || ch.card)) || CH_NAMES[n] || `CHAPTER ${n}`).toUpperCase();
  };
  function areaOf(roomId, outage) {
    const r = roomId && typeof ROOMS !== 'undefined' ? ROOMS[roomId] : null;
    const a = String((r && (r.area || r.name)) || 'SIGNAL HILL').toUpperCase();
    return outage ? `${a} — ???` : a;
  }
  const dateText = (ms) => {
    try { const d = new Date(ms); const p = (v) => String(v).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; } catch (e) { return ''; }
  };
  function metaFor(s) {
    return {
      chapter: s.chapter | 0, chapterName: chapterName(s.chapter | 0), area: areaOf(s.room, s.outage), room: s.room,
      outage: !!s.outage, playTime: Math.floor((s.stats && s.stats.time) || 0), saves: s.saves | 0, date: Date.now(),
      playthrough: s.playthrough || 1, ngPlus: !!s.ngPlus, difficulty: s.difficulty,
    };
  }
  function entryOf(env, slot) {
    const m = env.meta || metaFor(env.S);
    return {
      slot, label: slot === 'auto' ? 'AUTOSAVE' : `SLOT ${slot + 1}`,
      chapter: m.chapter, chapterName: m.chapterName || chapterName(m.chapter), area: m.area || areaOf(m.room, m.outage),
      playTime: m.playTime || 0, playTimeText: U.fmtTime(m.playTime || 0), saves: m.saves | 0,
      date: m.date || 0, dateText: dateText(m.date || 0), room: (env.start && env.start.room) || m.room, outage: !!m.outage,
      ngPlus: !!m.ngPlus,
    };
  }
  function readEnv(slot) {
    const raw = readRaw(key(slot));
    if (raw === null || raw === '') return null;
    let env;
    try { env = JSON.parse(raw); } catch (e) { warnOnce('corrupt:' + slot, `[Save] slot ${slot} is corrupt (unreadable) — treated as empty`); return null; }
    if (!valid(env)) { warnOnce('invalid:' + slot, `[Save] slot ${slot} holds no valid save — treated as empty`); return null; }
    if (env.v > VERSION) warnOnce('newer:' + slot, `[Save] slot ${slot} was written by a newer version (${env.v}); loading what can be read`);
    if (env.h !== undefined && env.h !== U.hash(JSON.stringify(env.S))) warnOnce('hash:' + slot, `[Save] slot ${slot} checksum mismatch — the data was edited or damaged; loading it anyway`);
    return env;
  }

  // ---- API -------------------------------------------------------------------------------------------------------
  function list() {
    const out = [];
    for (let i = 0; i < SLOTS; i++) { const e = readEnv(i); out.push(e ? entryOf(e, i) : null); }
    const a = readEnv('auto');
    out.auto = a ? entryOf(a, 'auto') : null;
    return out;
  }
  function pack(slot, start, chapterStart = null) {
    const snap = U.deepClone(S);
    const env = { game: 'signalhill', v: VERSION, slot, meta: metaFor(snap), h: U.hash(JSON.stringify(snap)), S: snap, chapterStart };
    if (start) { env.start = start; env.meta.room = start.room; env.meta.area = areaOf(start.room, snap.outage); }
    return env;
  }
  function write(slot, start, chapterStart) {
    const env = pack(slot, start, chapterStart);
    let json;
    try { json = JSON.stringify(env); } catch (e) { console.error('[Save] state is not serialisable', e); return null; }
    writeRaw(key(slot), json);
    return env;
  }
  function save(slot) {
    slot = norm(slot);
    if (slot === null) return false;
    if (slot === 'auto') return autosave();
    try { if (typeof Player !== 'undefined' && Player && Player.actor && Player.saveState) Player.saveState(); } catch (e) { console.error('[Save] Player.saveState', e); }
    S.saves = (S.saves | 0) + 1;
    const env = write(slot);
    if (!env) { S.saves = Math.max(0, (S.saves | 0) - 1); return false; }
    seq++;
    Bus.emit('save', slot);
    return entryOf(env, slot);
  }
  function autosave(o = {}) {
    o = o || {};
    try { if (typeof Player !== 'undefined' && Player && Player.actor && Player.saveState) Player.saveState(); } catch (e) { console.error('[Save] Player.saveState', e); }
    let start = null;
    const n = Number.isInteger(+o.chapterStart) && o.chapterStart !== null && o.chapterStart !== undefined && o.chapterStart !== false ? +o.chapterStart : null;
    const ch = n !== null && typeof CHAPTERS !== 'undefined' ? CHAPTERS[n] : null;
    if (o.room) start = { room: o.room, entry: o.entry ?? null };
    else if (ch && ch.start && ch.start.room) start = { room: ch.start.room, entry: ch.start.entry ?? null };
    const env = write('auto', start, n);
    if (!env) return false;
    Bus.emit('save', 'auto');
    return entryOf(env, 'auto');
  }
  function load(slot) {
    slot = norm(slot);
    if (slot === null) return null;
    const env = readEnv(slot);
    if (!env) return null;
    let s;
    try { s = migrate(U.deepClone(env.S)); } catch (e) { console.error('[Save] could not restore slot ' + slot, e); return null; }
    try { if (typeof Script !== 'undefined' && Script && Script.abortAll) Script.abortAll('load'); } catch (e) { console.error('[Save] Script.abortAll', e); }
    try { if (typeof Phone !== 'undefined' && Phone && Phone.reset) Phone.reset(); } catch (e) { console.error('[Save] Phone.reset', e); }
    setState(s);
    Bus.emit('load', slot);
    const start = env.start && env.start.room ? env.start : null;
    // chapter-start flag; autosaves written before the flag existed carried a `start` only when taken at a chapter start
    let chapterStart = Number.isInteger(env.chapterStart) ? env.chapterStart : null;
    if (!('chapterStart' in env) && slot === 'auto' && start) chapterStart = s.chapter;
    return {
      slot, chapter: s.chapter, outage: !!s.outage, chapterStart,
      room: start ? start.room : s.room,
      entry: start ? start.entry : { pos: s.pos.slice(), yaw: s.yaw },
    };
  }
  const has = (slot) => { slot = norm(slot); return slot !== null && !!readEnv(slot); };
  function hasAny() { for (let i = 0; i < SLOTS; i++) if (readEnv(i)) return true; return !!readEnv('auto'); }
  function latest() {
    const l = list(), all = [...l.filter(Boolean), l.auto].filter(Boolean);
    return all.sort((a, b) => b.date - a.date)[0] || null;
  }
  function remove(slot) { slot = norm(slot); if (slot === null) return false; removeRaw(key(slot)); return true; }

  // ---- META ------------------------------------------------------------------------------------------------------
  const meta = () => META;
  function persistMeta() { try { saveMeta(); return true; } catch (e) { console.error('[Save] saveMeta', e); return false; } }
  function setMeta(k, v) { META[k] = v; persistMeta(); return v; }
  function setOption(k, v) { META.options = META.options || {}; META.options[k] = v; persistMeta(); return v; }
  function recordEnding(name, results = {}) {
    META.endingsSeen = Array.isArray(META.endingsSeen) ? META.endingsSeen : [];
    if (name && !META.endingsSeen.includes(name)) META.endingsSeen.push(name);
    META.results = Array.isArray(META.results) ? META.results : [];
    META.results.push({ ending: name, date: Date.now(), playthrough: S.playthrough || 1, ...results });
    if (META.results.length > 50) META.results.splice(0, META.results.length - 50);
    META.completed = true;
    persistMeta();
    return META;
  }
  function addSticker(id) { META.stickers = META.stickers || {}; META.stickers[id] = true; persistMeta(); return Object.keys(META.stickers).length; }

  return {
    list, save, load, autosave, hasAny, has, latest, remove,
    meta, saveMeta: persistMeta, setMeta, setOption, recordEnding, addSticker,
    get seq() { return seq; },
    SLOTS, VERSION,
    // CONTRACT+: exposed for tests/tools
    _key: key, _readEnv: readEnv,
  };
})();
