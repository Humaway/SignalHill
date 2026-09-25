// ==== engine/00_core.js — utilities, state, registries (see docs/ARCHITECTURE.md §3–4) ====
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const U = (() => {
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const TAU = Math.PI * 2;
  const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const angleDiff = (a, b) => wrapAngle(b - a);
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const dist2 = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
  // mulberry32
  const rng = (seed = 1) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hash = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];
  const ease = {
    linear: (t) => t,
    in: (t) => t * t,
    out: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const readTime = (text) => Math.max(1.8, 0.06 * String(text).length);
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const toV3 = (p, y = 0) => (p instanceof THREE.Vector3 ? p.clone() : Array.isArray(p) ? (p.length === 2 ? new THREE.Vector3(p[0], y, p[1]) : new THREE.Vector3(p[0], p[1], p[2])) : new THREE.Vector3());
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  return { clamp, lerp, invLerp, smooth, damp, TAU, wrapAngle, angleDiff, rad, deg, dist2, rng, hash, pick, ease, fmtTime, readTime, v3, toV3, deepClone };
})();

const Bus = (() => {
  const map = new Map();
  const on = (ev, fn) => { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => off(ev, fn); };
  const off = (ev, fn) => { map.get(ev)?.delete(fn); };
  const emit = (ev, ...a) => {
    const set = map.get(ev); if (!set) return;
    for (const fn of [...set]) { try { fn(...a); } catch (e) { console.error(`[Bus:${ev}]`, e); } }
  };
  const once = (ev, fn) => { const o = on(ev, (...a) => { o(); fn(...a); }); return o; };
  return { on, off, emit, once };
})();

const Time = { now: 0, real: 0, dt: 0, frame: 0, paused: false };

// ---- Registries -------------------------------------------------------------
const ROOMS = {}, CAMERAS = {}, CUTSCENES = {}, DIALOGUE = {}, DOCUMENTS = {}, CALLS = {}, ITEMS = {}, SPAWNS = {};
const CHAPTERS = [], MAPS = {}, BOSSES = {}, SCRIPTS = {}, PROPS = {};

const _dupe = (reg, id, kind) => { if (reg[id]) console.warn(`[define] duplicate ${kind} id: ${id}`); };
function defineRoom(def) {
  if (!def || !def.id) throw new Error('defineRoom: missing id');
  _dupe(ROOMS, def.id, 'room');
  ROOMS[def.id] = def;
  CAMERAS[def.id] = def.cameras || [];
  SPAWNS[def.id] = def.spawns || [];
  return def;
}
function defineCutscene(id, fn, opts = {}) { _dupe(CUTSCENES, id, 'cutscene'); CUTSCENES[id] = { id, fn, opts: { letterbox: true, skippable: true, control: false, ...opts } }; }
function defineScript(id, fn) { _dupe(SCRIPTS, id, 'script'); SCRIPTS[id] = fn; }
function defineDialogue(id, lines) { _dupe(DIALOGUE, id, 'dialogue'); DIALOGUE[id] = lines; }
function defineDoc(def) { _dupe(DOCUMENTS, def.id, 'doc'); DOCUMENTS[def.id] = def; }
function defineCall(def) { _dupe(CALLS, def.id, 'call'); CALLS[def.id] = def; }
function defineItem(def) { _dupe(ITEMS, def.id, 'item'); ITEMS[def.id] = def; }
function defineChapter(def) { if (CHAPTERS[def.n]) console.warn(`[define] duplicate chapter ${def.n}`); CHAPTERS[def.n] = def; }
function defineMap(def) { _dupe(MAPS, def.id, 'map'); MAPS[def.id] = def; }
function defineBoss(id, def) { _dupe(BOSSES, id, 'boss'); BOSSES[id] = { id, ...def }; }

// ---- State ------------------------------------------------------------------
function newState(opts = {}) {
  return {
    v: 1, playthrough: opts.playthrough || 1, ngPlus: !!opts.ngPlus,
    difficulty: { action: opts.action || 'normal', riddle: opts.riddle || 'normal' },
    chapter: 0,
    room: null, pos: [0, 0, 0], yaw: 0,
    outage: false,
    health: 100,
    F: 0, A: 0,
    flags: { waiSaved: false, chaseSaved: false, chloeSaved: false, lukaSaved: false, lukeSaved: false, acceptedDeal: false },
    chaseHits: 0,
    inv: opts.ngPlus ? [{ id: 'steel_bar', n: 1 }] : [],
    equipped: null,
    ammo: { extinguisher: 6 },
    docs: {}, maps: {}, mapMarks: {},
    calls: {}, voicemails: [], notes: [],
    taken: {}, done: {}, spawns: {}, freedOrder: [],
    stickers: {},
    waiLine: 0,
    saves: 0,
    stats: { time: 0, walked: 0, ran: 0, freed: 0, stomped: 0, killed: 0, itemsUsed: 0, damage: 0, voicemails: 0, callsAnswered: 0, memos: 0 },
  };
}
let S = newState();
function resetState(opts) { S = newState(opts); return S; }
function setState(obj) { S = obj; return S; }

const META_KEY = 'signalhill.meta';
function defaultMeta() {
  return {
    endingsSeen: [], results: [], stickers: {}, calibrated: false, completed: false,
    options: { brightness: 1, noise: true, grain: 1, subs: 'medium', control: 'camera', shake: true, master: 0.9, effects: 0.9, music: 0.8, invertExamine: false, vibration: true },
  };
}
let META = (() => {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) { const m = JSON.parse(raw); const d = defaultMeta(); return { ...d, ...m, options: { ...d.options, ...(m.options || {}) } }; }
  } catch (e) { /* storage unavailable */ }
  return defaultMeta();
})();
function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { /* ignore */ } }

function track(kind, n, reason = '') {
  if (kind !== 'F' && kind !== 'A') throw new Error('track: kind must be F or A');
  S[kind] += n;
  Bus.emit('track', kind, n, reason);
}
function setFlag(name, v = true) { S.flags[name] = v; Bus.emit('flag', name, v); }
function flag(name) { return S.flags[name]; }
function once(id) { const k = 'once:' + id; if (S.done[k]) return false; S.done[k] = true; return true; }

const DIFF = {
  dmg: (n) => Math.round(n * ({ easy: 0.5, normal: 1, hard: 1.5 }[S.difficulty.action] || 1)),
  rage: () => ({ easy: 1, normal: 1, hard: 1.5 }[S.difficulty.action] || 1),
  // Should a placed heal pickup exist? Hard removes ~30% deterministically; Easy keeps all (extra ones are
  // placed with opts.extraOnEasy and only exist on Easy — giving ~1.5x).
  pickup: (id, opts = {}) => {
    const a = S.difficulty.action;
    if (opts.extraOnEasy) return a === 'easy';
    if (a === 'hard') return (U.hash(id) % 100) >= 30;
    return true;
  },
  riddle: () => S.difficulty.riddle,
};

// Exposed early so that console debugging works even if boot fails.
window.SH = window.SH || {};
window.SH.errors = window.SH.errors || [];
window.addEventListener('error', (e) => { window.SH.errors.push(String(e.message || e)); });
// A script's Script.ABORT (a scene cancelled by a room change, death or a skip) is the normal way scripts end: an
// un-awaited actor walk / G call that rejects with it is not an error.
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && r.abort === true && String(r) === 'Script.ABORT') { e.preventDefault(); return; }
  window.SH.errors.push('unhandled: ' + String(r && (r.stack || r.message) || r));
});
