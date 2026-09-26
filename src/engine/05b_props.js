// ==== engine/05b_props.js — the prop library (ARCHITECTURE §5.3). No global: registers kinds with Kit.defineProp ====
// Every builder is (K, opts) → Object3D, built in prop-local space: origin on the FLOOR at the prop's centre (wall props:
// on the floor at the wall surface), facing +Z, metres. Everything is primitives + Tex kit materials + Canvas2D
// textures generated on first use (shared caches, never disposed). Geometry is cached per size; props are declared
// `static` so Kit merges them into the room's per-material batches — the parts that move or change are flagged
// kitMerge:false ("live"). Per-frame behaviour goes through K.animate / K.light (RoomBuild.animated / lights).
//
// Common opts (besides Kit's y/scale/world/collide/examine/name/static):
//   variant  — a style of the prop (listed per kind)      lit    — light/screen/lamp on (default per kind)
//   light    — false: no real pool light (glow/halo only)  bank   — light bank for the Outage blackout
//   seed     — variation seed (default: one draw from K.rng)   color / text / len / w / h / d / n as listed
// Wall props (posters, boards, clock, tv (wall), fuse_board, card_reader, rotary_dial, phone_socket, payphone_wall,
// extinguisher, first_aid_box, notice_board, lamp_panel, wall_phone, water_stain, exit_sign …) mount at a standard
// height; opts.mount overrides that centre height. Ceiling props (fluoro_tube, cable_tray, headset_hanging,
// receipt_strip, tether_hanging, receipt_curtain, cctv_camera) hang from opts.ceil (default 3.0 m; fluoro: opts.h).
// Tabletop props (mug, monitor, terminal, desk_phone, printer, answering_machine, modem, base_station, microwave,
// desk_lamp, pa_mic, sandwich, crossword, glasses …) rest on their origin: pass the surface height as opts.y.
//
// userData hooks (on the prop group returned by K.prop):
//   screens: userData.screen = Tex.screen object (draw(fn)/update()), userData.setOn(bool)   [tv, monitor, crt,
//     terminal, leaderboard, rankings_screen, projector_screen; cctv_bank has userData.screens[]]
//   modem.setState('off'|'boot'|'red'|'ok'), modem.boot(sec=4) → Promise (cycles, ends solid red "NO SERVICE")
//   answering_machine.setCount(n) / setBlink(bool);  base_station.setText(str) / setBlink(bool)
//   traffic_light.setMode('amber'|'off'|'red'|'green');  hatchback/car.setHazards(bool) / setHeadlights(bool)
//   roller_door / boom_gate / lift_doors / turnstile / shutter .setOpen(0..1)  (+ .collider record where it blocks)
//   locker_bank.setDoor(i, 0..1), returns_cage.setDoor(0..1) + .doorCollider, filing_cabinet.setDrawer(i, 0..1),
//   fuse_board.setSwitch(name, on) / setMain(on) / switches, switchboard & lamp_panel .setLamp(label|index, on|'blink'),
//   frame_rack.jacks [{label, pos (local)}]
//   payphone_*.setHanging(bool), rotary_dial.spin(digit) → Promise, ticket_machine.print() → Promise,
//   clock.setTime(h,m,s)/addMinutes(n,dur)/setRunning(bool), mast.platforms [y…] + ladder {x,z,y0,y1},
//   desk_phone.setRinging(bool) (message LED flashes), photocopier.setSweep(bool), pendant.setGlow(bool)
//   Setters that move a part need the part live: pass the matching opt (open/ringing/…), live:true or a name —
//   otherwise the part is merged into the room batch and the setter only warns once.
//
// Extra kinds beyond the §5.3 lists (33): street — gum_tree_small, shutter, awning, window_display, rf_sign, trolley,
// rubbish, leaf_pile; interior — wet_floor_sign, huddle_board, bedside_phone, wall_phone, cctv_camera, leaderboard,
// rankings_screen, emergency_phone, duress_button, alarm_lamp, headset, lamp_panel, jumper_wire, receipt_curtain,
// spotlight, meeting_table, projector_screen, sticky_note, roster, visitor_book, key_lockbox, exit_sign, water_stain,
// feedback_board, photo_wall — opts/hooks are documented at each definition.
// Radius-like opts are named `radius` (never `r`: K.prop reads opts.r as the examine radius).
(() => {
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const R = (d) => (d || 0) * D2R;
  const F = Tex.fonts, TU = Tex.util, BR = Tex.brand, OUTC = Tex.outageColors;
  const clamp = U.clamp, lerp = U.lerp;

  // ---------------------------------------------------------------------------------------------------------------
  // Geometry (cached per size; shared, never disposed). All helper geometry is centred on its origin.
  // ---------------------------------------------------------------------------------------------------------------
  const GEO = new Map();
  const q3 = (v) => Math.round(v * 1000) / 1000;
  const cg = (key, fn) => {
    let g = GEO.get(key);
    if (!g) { g = fn(); g.userData.shared = true; if (!g.boundingSphere) g.computeBoundingSphere(); GEO.set(key, g); }
    return g;
  };
  // s: world-UV scale (tiles per metre) or [su, sv] (separate scales for the faces' u and v directions)
  function gBox(sx, sy, sz, s = 0) {
    const su = Array.isArray(s) ? s[0] : s, sv = Array.isArray(s) ? s[1] : s;
    return cg(`b${q3(sx)},${q3(sy)},${q3(sz)},${q3(su)},${q3(sv)}`, () => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (su || sv) { // world-scaled UVs (texture tiles = metres × s); face order px nx py ny pz nz
        const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
        for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] * su, uv.getY(k) * dims[f][1] * sv); }
      }
      return g;
    });
  }
  function gCyl(rb, rt, h, seg = 12, s = 0, open = false) {
    return cg(`c${q3(rb)},${q3(rt)},${q3(h)},${seg},${q3(s)},${open ? 1 : 0}`, () => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
      if (s) {
        const uv = g.attributes.uv, side = (seg + 1) * 2, circ = Math.PI * (rb + rt);
        for (let i = 0; i < uv.count; i++) {
          if (i < side) uv.setXY(i, uv.getX(i) * circ * s, uv.getY(i) * h * s);
          else uv.setXY(i, uv.getX(i) * 2 * Math.max(rb, rt) * s, uv.getY(i) * 2 * Math.max(rb, rt) * s);
        }
      }
      g.clearGroups();
      return g;
    });
  }
  const gSph = (r, seg = 10, thetaLen = Math.PI) => cg(`s${q3(r)},${seg},${q3(thetaLen)}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.66)), 0, TAU, 0, thetaLen));
  const gPlane = (w, h) => cg(`p${q3(w)},${q3(h)}`, () => new THREE.PlaneGeometry(w, h));
  const gTorus = (r, t, rs = 6, ts = 16, arc = TAU) => cg(`t${q3(r)},${q3(t)},${rs},${ts},${q3(arc)}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
  const gCircle = (r, seg = 20) => cg(`o${q3(r)},${seg}`, () => new THREE.CircleGeometry(r, seg));
  const gIco = (r, detail = 0) => cg(`i${q3(r)},${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
  // extruded 2D profile (pts in the XY plane) through depth d along Z, centred on Z
  function gExtrude(key, pts, d, bevel = 0) {
    return cg('x' + key, () => {
      const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
      const g = new THREE.ExtrudeGeometry(sh, { depth: d - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
      g.translate(0, 0, -(d - bevel * 2) / 2);
      g.computeVertexNormals();
      return g;
    });
  }
  // merge a list of {geo, m:Matrix4} into one cached geometry
  const gMerged = (key, fn) => cg('m' + key, () => Kit.mergeGeometries(fn()));

  // ---------------------------------------------------------------------------------------------------------------
  // Materials. Specs are Kit specs: 'texname' | '#rrggbb' | {tex, color, roughness, …} | {color, …} | Texture | Material.
  // Kit.mat() caches them; uvs(spec) gives the world-UV scale for tiled textures.
  // ---------------------------------------------------------------------------------------------------------------
  function uvs(spec) {
    if (!spec) return 0;
    if (typeof spec === 'string') return spec[0] === '#' ? 0 : 1 / Tex.size(spec);
    if (spec.isMaterial) { const t = spec.map; return t && t.userData && t.userData.size ? 1 / t.userData.size : 0; }
    if (spec.isTexture) return spec.userData && spec.userData.size ? 1 / spec.userData.size : 0;
    if (typeof spec === 'object' && spec.tex) {
      const t = spec.tex;
      if (t.isTexture) return t.userData && t.userData.size ? (spec.uv ?? 1) / t.userData.size : 0;
      return (spec.uv ?? 1) / Tex.size(t);
    }
    return 0;
  }
  const MAT = (spec) => (spec && spec.isMaterial ? spec : Kit.mat(spec));
  const M = {
    alu: { tex: 'metal', color: '#c3c8c6', roughness: 0.38, metalness: 0.65 },
    galv: { tex: 'metal', color: '#a4aba6', roughness: 0.55 },
    steel: { tex: 'metal', color: '#8d9594' },
    steelDk: { tex: 'metal', color: '#4c5553' },
    iron: { tex: 'metal', color: '#3b3f3d', roughness: 0.7, metalness: 0.45 },
    chrome: { tex: 'metal', color: '#d9dcdc', roughness: 0.22, metalness: 0.9 },
    stainless: { tex: 'metal', color: '#d4d8d6', roughness: 0.32, metalness: 0.38 },
    rust: 'metal_rust',
    black: { color: '#161819', roughness: 0.55 },
    blackGloss: { color: '#0e1011', roughness: 0.25, metalness: 0.1 },
    rubber: { color: '#1b1c1c', roughness: 0.92 },
    white: { color: '#dedbd2', roughness: 0.6 },
    offwhite: { color: '#cfcbc0', roughness: 0.55 },
    beige: { color: '#cdc3a8', roughness: 0.5 },
    beigeDk: { color: '#b3a88e', roughness: 0.55 },
    greyPlastic: { color: '#5d6264', roughness: 0.5 },
    darkPlastic: { color: '#2a2d2e', roughness: 0.45 },
    laminate: { tex: 'metal', color: '#e2dfd4', roughness: 0.55, metalness: 0.02 },
    lamGrey: { tex: 'metal', color: '#b9b8b0', roughness: 0.6, metalness: 0.02 },
    teal: { color: '#0f8f8f', roughness: 0.5 },
    tealDk: { color: '#0b5e60', roughness: 0.55 },
    yellow: { color: '#e8b810', roughness: 0.5 },
    red: { color: '#a3231b', roughness: 0.5 },
    wood: 'wood',
    pine: { tex: 'wood', light: '#c8a877', dark: '#9d7a50' },
    oak: { tex: 'wood', light: '#a07c52', dark: '#6f5238' },
    timberGrey: { tex: 'wood', light: '#a8a08e', dark: '#7b7364' },     // weathered outdoor hardwood
    slat: { tex: 'wood', light: '#a07e5a', dark: '#71553b' },           // bench slats, oiled
    veneer: { tex: 'wood', light: '#b89468', dark: '#8a6a47' },         // office/reception veneer
    concrete: 'concrete',
    cardboard: 'cardboard',
    paper: 'paper',
    glass: 'glass',
    glassDark: { color: '#141a1b', roughness: 0.12, metalness: 0.3 },
    bulbOff: { color: '#8d9591', roughness: 0.4 },
  };
  // painted sheet steel (cabinets, lockers, shelving, doors): the metal texture with low metalness so it catches light
  const paint = (c, rough = 0.55) => ({ tex: 'metal', color: c, roughness: rough, metalness: 0.15 });
  // shared glow (cached, stays lit in the Outage); per-instance glow for things that blink or switch
  const glowS = (c, i = 1.4) => ({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4, outage: false });
  const glowMat = (c, i = 1.4) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), emissive: new THREE.Color(c), emissiveIntensity: i, roughness: 0.4 }); m.name = 'glow:' + c; return m; };
  // a lens/lamp whose base colour is its unlit look and whose emissive colour lights it (per instance)
  const lampMat = (off, on, i = 0) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(off), emissive: new THREE.Color(on), emissiveIntensity: i, roughness: 0.25 }); m.name = 'lamp:' + on; return m; };
  // texture-backed spec with options (emissive:number → emissive map = the texture)
  const TM = (tex, o = {}) => ({ tex, ...o });

  // ---------------------------------------------------------------------------------------------------------------
  // Mesh helpers (all in the parent's local space; rotations in degrees, Euler order YXZ like Kit)
  // ---------------------------------------------------------------------------------------------------------------
  function add(p, geo, spec, x, y, z, o = {}) {
    const m = new THREE.Mesh(geo, MAT(spec));
    m.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) m.rotation.set(R(o.rx), R(o.ry), R(o.rz), o.order || 'YXZ');
    if (o.s) { if (Array.isArray(o.s)) m.scale.set(o.s[0], o.s[1], o.s[2]); else m.scale.setScalar(o.s); }
    m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
    if (o.name) m.name = o.name;
    if (o.live) m.userData.kitMerge = false;
    if (o.order0) m.renderOrder = o.order0;
    if (p) p.add(m);
    return m;
  }
  const us = (spec, o) => (o.uv === false ? 0 : Array.isArray(o.uv) ? o.uv : uvs(spec) * (typeof o.uv === 'number' ? o.uv : 1));
  // box with its BOTTOM at y (like K.box); boxc: by centre
  const box = (p, x, y, z, sx, sy, sz, spec, o = {}) => add(p, gBox(sx, sy, sz, us(spec, o)), spec, x, y + sy / 2, z, o);
  const boxc = (p, x, y, z, sx, sy, sz, spec, o = {}) => add(p, gBox(sx, sy, sz, us(spec, o)), spec, x, y, z, o);
  // vertical cylinder with its bottom at y (o.r2 top radius); cylc: by centre (rotate with rx/rz)
  const cyl = (p, x, y, z, r, h, spec, o = {}) => add(p, gCyl(r, o.r2 ?? r, h, o.seg ?? 12, us(spec, o), !!o.open), spec, x, y + h / 2, z, o);
  const cylc = (p, x, y, z, r, h, spec, o = {}) => add(p, gCyl(r, o.r2 ?? r, h, o.seg ?? 12, us(spec, o), !!o.open), spec, x, y, z, o);
  const sph = (p, x, y, z, r, spec, o = {}) => add(p, gSph(r, o.seg ?? 10, o.theta ?? Math.PI), spec, x, y, z, o);
  // plane facing +Z, centred; flat: lying face-up (text top toward −Z)
  const pl = (p, x, y, z, w, h, spec, o = {}) => add(p, gPlane(w, h), spec, x, y, z, { cast: false, ...o });
  const flat = (p, x, y, z, w, d, spec, o = {}) => add(p, gPlane(w, d), spec, x, y, z, { cast: false, rx: -90, ...o });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  // cylinder from point a to point b (radius r at a, o.r2 at b)
  function rod(p, a, b, r, spec, o = {}) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    const len = Math.max(1e-4, _a.distanceTo(_b));
    const m = add(p, gCyl(r, o.r2 ?? r, len, o.seg ?? 8, us(spec, o), !!o.open), spec, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { ...o, rx: 0, ry: 0, rz: 0 });
    _b.sub(_a).normalize(); m.quaternion.setFromUnitVectors(_up, _b);
    return m;
  }
  // square-section bar from a to b (w across, d deep; o.roll spins it about its axis)
  function bar(p, a, b, w, d, spec, o = {}) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    const len = Math.max(1e-4, _a.distanceTo(_b));
    const m = add(p, gBox(w, len, d, us(spec, o)), spec, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { ...o, rx: 0, ry: 0, rz: 0 });
    _b.sub(_a).normalize(); m.quaternion.setFromUnitVectors(_up, _b);
    if (o.roll) m.rotateY(R(o.roll));
    return m;
  }
  // tube along points (not cached unless o.key)
  function tube(p, pts, r, spec, o = {}) {
    const make = () => {
      const c = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v[0], v[1], v[2])), !!o.closed, 'catmullrom', o.tension ?? 0.5);
      return new THREE.TubeGeometry(c, o.seg ?? Math.max(8, pts.length * 5), r, o.radial ?? 5, !!o.closed);
    };
    return add(p, o.key ? cg('tube' + o.key, make) : make(), spec, 0, 0, 0, o);
  }
  // points of a helix (coiled cord) from a to b: radius, turns, samples per turn
  function helix(a, b, rad, turns, per = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    d.normalize();
    const u = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(d).normalize() : new THREE.Vector3(1, 0, 0).cross(d).normalize();
    const v = d.clone().cross(u);
    const n = Math.max(8, Math.round(turns * per)), out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, ang = t * turns * TAU, e = Math.min(1, t * 8, (1 - t) * 8); // coil eases in at both ends
      out.push([A.x + d.x * L * t + (u.x * Math.cos(ang) + v.x * Math.sin(ang)) * rad * e, A.y + d.y * L * t + (u.y * Math.cos(ang) + v.y * Math.sin(ang)) * rad * e, A.z + d.z * L * t + (u.z * Math.cos(ang) + v.z * Math.sin(ang)) * rad * e]);
    }
    return out;
  }
  const grp = (p, x = 0, y = 0, z = 0, ry = 0, name) => { const g = new THREE.Group(); g.position.set(x, y, z); if (ry) g.rotation.y = R(ry); if (name) g.name = name; if (p) p.add(g); return g; };
  // Flag an object's meshes as live (never merged into the room's static batches). A group's DIRECT child meshes are
  // first merged per material (transforms baked relative to the group), so a moving part costs one draw call per
  // material instead of one per box. Sub-groups that move on their own must be live()'d first/separately.
  function live(obj, merge = true) {
    if (merge && obj.isGroup) {
      const buckets = new Map();
      for (const c of obj.children) {
        if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || Array.isArray(c.material) || c.userData.kitMerge === false) continue;
        const key = c.material.uuid + '|' + (c.castShadow ? 1 : 0);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(c);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const mesh = new THREE.Mesh(Kit.mergeGeometries(list.map((c) => { c.updateMatrix(); return { geo: c.geometry, m: c.matrix.clone() }; })), list[0].material);
        mesh.castShadow = list[0].castShadow; mesh.receiveShadow = true; mesh.name = 'live:' + (list[0].material.name || '');
        obj.add(mesh);
        for (const c of list) { c.removeFromParent(); if (!c.geometry.userData.shared) c.geometry.dispose(); }
      }
    }
    obj.traverse((c) => { if (c.isMesh || c.isSprite || c.isLine) c.userData.kitMerge = false; });
    return obj;
  }
  // true (and a one-time warning) when a part was baked into the room's static batch, so moving it shows nothing
  const WARNED = new Set();
  function baked(kind, obj) {
    if (!obj) { if (!WARNED.has(kind)) { WARNED.add(kind); console.warn(`[props] ${kind}: place it with {ringing:false|true}, {live:true} or a name to switch it at runtime`); } return true; }
    let has = false;
    obj.traverse((c) => { if (c.isMesh) has = true; });
    if (has && (!obj.isMesh || obj.parent)) return false;
    if (!WARNED.has(kind)) { WARNED.add(kind); console.warn(`[props] ${kind}: that part was merged into the room's static batch — place the prop with {live:true} or a name to animate it`); }
    return true;
  }
  // opts that ask for moving parts: live, a name (Kit keeps named props out of the batches anyway) or explicit state
  const dynamic = (o, ...keys) => !!(o.live || o.name || keys.some((k) => o[k] !== undefined));
  // colliders in prop-local space; skipped when opts.collide === false
  const col = (K, o, x0, z0, x1, z1, h = 1, y = 0) => (o.collide === false ? null : K.collider(x0, z0, x1, z1, { h, y }));
  const colR = (K, o, cx, cz, w, d, rot, h = 1) => (o.collide === false ? null : K.colliderRot(cx, cz, w, d, rot, { h }));
  // seeded variation per placement (opts.seed, else one draw from the room's K.rng)
  const rngOf = (K, o, salt = '') => U.rng(((o.seed !== undefined && o.seed !== null ? U.hash(String(o.seed)) : Math.floor(K.rng() * 4294967296)) ^ U.hash(String(salt))) >>> 0);
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  // animate only while the prop is attached (detached previews get userData.animated from Kit)
  const anim = (K, fn) => K.animate(fn);
  // define a kind: meta {collide, h, static(default true)}
  const def = (kind, meta, fn) => Kit.defineProp(kind, (K, o) => { const r = fn(K, o, K.group); return r || K.group; }, { static: true, ...meta });

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures owned by the prop library (drawn once per key, shared)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash(key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (o.size) t.userData.size = o.size;
    t.name = 'prop:' + key.slice(0, 40).replace(/[^\w|:.,-]/g, '_'); t.userData.shared = true;   // names reach shader #defines: keep them one-line
    TEXC.set(key, t);
    return t;
  }
  const txt = (ctx, s, x, y, o) => TU.text(ctx, String(s), x, y, o);
  const fit = (ctx, lines, w, h, fontFn, max) => TU.fitSize(ctx, lines, w, h, fontFn, max);
  const hand = (ctx, s, x, y, o) => Tex.handwriting(ctx, String(s), x, y, o);
  const rgba = TU.rgba;
  const specks = (ctx, w, h, r, n, col, a, sz = 2) => { for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(${col},${(r() * a).toFixed(3)})`; const s = 0.5 + r() * sz; ctx.fillRect(r() * w, r() * h, s, s); } };
  const grimeEdge = (ctx, w, h, a = 0.35) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(40,36,30,0)'); g.addColorStop(1, `rgba(40,36,30,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  const scan = (ctx, w, h, a = 0.18, step = 3) => { ctx.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1); };

  // Small printed labels / stickers: style 'label' (white, dark text) | 'warn' (yellow) | 'asset' (silver + barcode) |
  // 'red' | 'teal' | 'tag' (manila, handwritten). Returns a texture sized to the text.
  function labelTex(text, style = 'label') {
    return ctex(`lbl|${style}|${text}`, 256, 96, (ctx, w, h, r) => {
      const bg = { label: '#eeede6', warn: '#e8c21a', asset: '#b9bcbc', red: '#b3261e', teal: BR.teal, tag: '#d9c89a', dark: '#1c1f20' }[style] || '#eeede6';
      const fg = { warn: '#141414', red: '#f4f1ea', teal: '#ffffff', dark: '#e9e6dc' }[style] || '#1f2222';
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      if (style === 'warn') { ctx.strokeStyle = '#141414'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, w - 8, h - 8); }
      if (style === 'asset') { for (let x = 150; x < 246; x += 2 + Math.floor(r() * 3)) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, 16, 1 + Math.floor(r() * 2), 64); } }
      const lines = String(text).split('\n'), maxW = style === 'asset' ? 130 : w - 24;
      if (style === 'tag') {
        const s = fit(ctx, lines, maxW, h - 20, (q) => `${q}px ${F.hand}`, 48);
        lines.forEach((l, i) => hand(ctx, l, 14, h / 2 - ((lines.length - 1) * s * 0.6) + i * s * 1.2 + s * 0.35, { size: s, color: '#1f2c6e' }));
      } else {
        const s = fit(ctx, lines, maxW, h - 22, (q) => `bold ${q}px ${F.sans}`, 46);
        lines.forEach((l, i) => txt(ctx, l, style === 'asset' ? 12 : w / 2, h / 2 - ((lines.length - 1) * s * 0.6) + i * s * 1.2 + s * 0.36, { size: s, font: F.sans, weight: 'bold', color: fg, align: style === 'asset' ? 'left' : 'center' }));
      }
      TU.age(ctx, w, h, r, 0.5);
    });
  }
  // Handwritten note on paper: paper 'sticky' | 'white' | 'lined' | 'card' ; ink colour
  function noteTex(text, paper = 'sticky', ink = '#1f2c6e', w = 256, h = 256) {
    return ctex(`note|${paper}|${ink}|${w}x${h}|${text}`, w, h, (ctx, W, H, r) => {
      ctx.fillStyle = { sticky: '#f2e27a', white: '#f1efe7', lined: '#f0eee4', card: '#efe6d2', pink: '#f1b8c4', blue: '#bcd8ec' }[paper] || '#f1efe7';
      ctx.fillRect(0, 0, W, H);
      if (paper === 'lined') { ctx.fillStyle = 'rgba(80,120,180,0.35)'; for (let y = H * 0.16; y < H; y += H * 0.08) ctx.fillRect(0, y, W, 1.5); ctx.fillStyle = 'rgba(200,60,60,0.4)'; ctx.fillRect(W * 0.12, 0, 1.5, H); }
      if (paper === 'sticky') { const g = ctx.createLinearGradient(0, 0, 0, H * 0.18); g.addColorStop(0, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.18); }
      const size = Math.round(Math.min(W, H) * (text.length > 60 ? 0.075 : text.length > 30 ? 0.1 : 0.13));
      hand(ctx, text, W * 0.08, H * 0.2 + size * 0.4, { size, color: ink, maxWidth: W * 0.84, lineHeight: size * 1.3 });
      TU.age(ctx, W, H, r, 0.45);
    });
  }
  // Emissive-looking small displays (LCD / LED / VFD): kind 'lcd' (grey-green, dark text) | 'led' (red on black) |
  // 'vfd' (teal on black) | 'amber'
  function dispTex(text, kind = 'lcd', w = 128, h = 48) {
    return ctex(`disp|${kind}|${w}x${h}|${text}`, w, h, (ctx, W, H) => {
      const st = { lcd: ['#9aa88a', '#1e261c'], led: ['#140605', '#ff3b28'], vfd: ['#051212', '#58e3d0'], amber: ['#120a02', '#ffb13b'], green: ['#040d05', '#58f07a'] }[kind] || ['#9aa88a', '#1e261c'];
      ctx.fillStyle = st[0]; ctx.fillRect(0, 0, W, H);
      if (kind === 'lcd') { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      const lines = String(text).split('\n');
      const font = kind === 'lcd' ? F.mono : F.mono;
      const s = fit(ctx, lines, W * 0.9, H * 0.82, (q) => `bold ${q}px ${font}`, H * 0.8);
      if (kind !== 'lcd') { ctx.shadowColor = st[1]; ctx.shadowBlur = 6; }
      lines.forEach((l, i) => txt(ctx, l, W / 2, H / 2 - ((lines.length - 1) * s * 0.55) + i * s * 1.1 + s * 0.36, { size: s, font, weight: 'bold', color: st[1], align: 'center' }));
      ctx.shadowBlur = 0;
    });
  }
  // coiled-cord look for thin tubes (dark bands across a cylinder); tile = 1 cm
  const coilTex = (c = '#1a1b1b') => ctex('coil|' + c, 32, 32, (ctx, w, h) => {
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { const g = ctx.createLinearGradient(0, y, 0, y + 8); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = g; ctx.fillRect(0, y, w, 8); }
  }, { wrap: true, size: 0.02 });

  // --- screen content painters (used for defaults; content can redraw via userData.screen.draw) -------------------
  function paintStatic(ctx, w, h, r = Math.random, a = 1) {
    // (every pixel is overwritten: a fresh ImageData, never a readback — a static TV repaints 12 times a second into a
    // GPU-backed screen canvas, and getImageData there stalls on the GPU each time)
    const id = ctx.createImageData(w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (r() * 255 * a) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  function paintLock(ctx, w, h, time = '8:59', o = {}) {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    const pal = o.pal || ['#0b6f76', '#1aa3a0', '#e9c24a'];
    g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(w * 0.8, h * 0.75, w * 0.6, 0, TAU); ctx.fill();
    txt(ctx, time, w / 2, h * 0.3, { size: w * 0.34, font: F.sans, color: '#f4f6f4', align: 'center' });
    txt(ctx, o.date || 'Tuesday 31 March', w / 2, h * 0.38, { size: w * 0.075, font: F.sans, color: 'rgba(244,246,244,0.85)', align: 'center' });
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(w * 0.35, h * 0.94, w * 0.3, h * 0.008);
    txt(ctx, 'NO SERVICE', w * 0.06, h * 0.045, { size: w * 0.055, font: F.sans, color: 'rgba(255,255,255,0.8)' });
    ctx.fillRect(w * 0.82, h * 0.028, w * 0.1, h * 0.02);
  }
  function paintCRM(ctx, w, h) {
    ctx.fillStyle = '#0a2a4a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0e3a66'; ctx.fillRect(0, 0, w, h * 0.1);
    txt(ctx, 'CUSTOMER CARE SYSTEM  v4.2', w * 0.03, h * 0.07, { size: h * 0.05, font: F.mono, color: '#cfe3f0', weight: 'bold' });
    ctx.fillStyle = '#c7cdd2'; ctx.fillRect(w * 0.2, h * 0.28, w * 0.6, h * 0.46);
    ctx.fillStyle = '#16335a'; ctx.fillRect(w * 0.2, h * 0.28, w * 0.6, h * 0.08);
    txt(ctx, 'STAFF LOGIN', w * 0.23, h * 0.34, { size: h * 0.045, font: F.sans, color: '#ffffff', weight: 'bold' });
    txt(ctx, 'USERNAME', w * 0.24, h * 0.45, { size: h * 0.035, font: F.mono, color: '#222' });
    ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.45, h * 0.41, w * 0.3, h * 0.055);
    txt(ctx, 'AIDAN', w * 0.46, h * 0.455, { size: h * 0.04, font: F.mono, color: '#111' });
    txt(ctx, 'PIN', w * 0.24, h * 0.55, { size: h * 0.035, font: F.mono, color: '#222' });
    ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.45, h * 0.51, w * 0.3, h * 0.055);
    ctx.fillStyle = '#111'; ctx.fillRect(w * 0.46, h * 0.52, 2, h * 0.035);
    ctx.fillStyle = '#16335a'; ctx.fillRect(w * 0.56, h * 0.62, w * 0.19, h * 0.07);
    txt(ctx, 'LOG IN', w * 0.655, h * 0.67, { size: h * 0.035, font: F.sans, color: '#fff', align: 'center', weight: 'bold' });
    scan(ctx, w, h, 0.12, 2);
  }
  function paintCCTV(ctx, w, h, n = 1, r = Math.random) {
    ctx.fillStyle = '#1b1d1c'; ctx.fillRect(0, 0, w, h);
    // a grey perspective corridor/concourse sketch
    const vx = w * (0.4 + r() * 0.2), vy = h * (0.38 + r() * 0.1);
    const shade = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.fill(); };
    shade([[0, h], [w, h], [vx + w * 0.08, vy + h * 0.06], [vx - w * 0.08, vy + h * 0.06]], '#4a4d4b');
    shade([[0, 0], [vx - w * 0.08, vy - h * 0.06], [vx - w * 0.08, vy + h * 0.06], [0, h]], '#363837');
    shade([[w, 0], [vx + w * 0.08, vy - h * 0.06], [vx + w * 0.08, vy + h * 0.06], [w, h]], '#2e302f');
    shade([[0, 0], [w, 0], [vx + w * 0.08, vy - h * 0.06], [vx - w * 0.08, vy - h * 0.06]], '#3d3f3e');
    ctx.fillStyle = '#0c0d0d'; ctx.fillRect(vx - w * 0.08, vy - h * 0.06, w * 0.16, h * 0.12);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(210,210,200,0.5)'; const t = 0.2 + i * 0.2; ctx.fillRect(lerp(w * 0.1, vx - w * 0.02, t), lerp(h * 0.02, vy - h * 0.055, t), lerp(w * 0.3, w * 0.03, t), 2); }
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3 + (r() - 0.5) * 50; d[i] = d[i + 1] = d[i + 2] = clamp(v, 0, 255); }
    ctx.putImageData(id, 0, 0);
    scan(ctx, w, h, 0.25, 2);
    txt(ctx, `CAM 0${n}`, w * 0.05, h * 0.1, { size: h * 0.075, font: F.mono, color: '#e8e8e0' });
    txt(ctx, '31/03 20:59:0' + (n % 10), w * 0.95, h * 0.94, { size: h * 0.065, font: F.mono, color: '#e8e8e0', align: 'right' });
  }
  function paintTerminal(ctx, w, h, lines) {
    ctx.fillStyle = '#031006'; ctx.fillRect(0, 0, w, h);
    const s = h / 16;
    (lines || ['SIGNAL HILL EXCHANGE', 'LINE TEST ... 0 OK', '> _']).forEach((l, i) => txt(ctx, l, w * 0.05, s * (1.6 + i * 1.3), { size: s, font: F.mono, color: '#5cf07c' }));
    scan(ctx, w, h, 0.3, 2);
  }
  function paintAd(ctx, w, h, slide = 0) {
    const heads = ['UNLIMITED DATA', 'STAY CONNECTED', 'SWITCH & SAVE'], prices = ['$65', '$55', '$45'];
    ctx.fillStyle = slide === 1 ? BR.tealDark : BR.teal; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = BR.yellow; ctx.fillRect(0, h * 0.68, w, h * 0.32);
    txt(ctx, heads[slide % 3], w * 0.06, h * 0.3, { size: h * 0.16, font: F.heavy, weight: '900', color: '#fff' });
    txt(ctx, 'On our best network.*', w * 0.06, h * 0.45, { size: h * 0.07, font: F.sans, color: 'rgba(255,255,255,0.85)' });
    txt(ctx, prices[slide % 3], w * 0.06, h * 0.9, { size: h * 0.2, font: F.heavy, weight: '900', color: BR.ink });
    txt(ctx, '/mth', w * 0.3, h * 0.84, { size: h * 0.06, font: F.sans, weight: 'bold', color: BR.ink });
    Tex.drawWordmark(ctx, w * 0.66, h * 0.9, h * 0.1, { color: BR.tealDark });
    // phone silhouette
    ctx.fillStyle = '#16191a'; ctx.fillRect(w * 0.72, h * 0.12, w * 0.16, h * 0.5);
    const g = ctx.createLinearGradient(0, h * 0.14, 0, h * 0.6); g.addColorStop(0, '#34c9c3'); g.addColorStop(1, '#f2c84a');
    ctx.fillStyle = g; ctx.fillRect(w * 0.735, h * 0.14, w * 0.13, h * 0.46);
  }
  // a Tex.screen with a default painter; returns {mesh, screen, setOn}
  function screen(p, x, y, z, w, h, px, paint, o = {}) {
    const scr = Tex.screen(px[0], px[1]);
    if (paint) scr.draw(paint);
    const onMat = MAT(TM(scr.tex, { emissive: 1, emissiveIntensity: o.intensity ?? 0.95, roughness: 0.25, offset: false }));
    const offMat = MAT({ tex: 'screen_off' });
    const m = add(p, gPlane(w, h), onMat, x, y, z, { cast: false, rx: o.rx, ry: o.ry, rz: o.rz, live: true });
    let on = o.on !== false;
    const setOn = (v = true) => { on = !!v; m.material = on ? onMat : offMat; };
    setOn(on);
    return { mesh: m, screen: scr, setOn, get on() { return on; } };
  }

  // =================================================================================================================
  // STREET FURNITURE
  // =================================================================================================================
  // tapered box (frustum): bottom wb×db, top wt×dt, height h, top shifted by dz; bottom at y=0
  function gTaper(wb, db, wt, dt, h, dz = 0) {
    return cg(`tp${q3(wb)},${q3(db)},${q3(wt)},${q3(dt)},${q3(h)},${q3(dz)}`, () => {
      const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const top = p.getY(i) > 0;
        p.setXYZ(i, p.getX(i) * (top ? wt : wb), top ? h : 0, p.getZ(i) * (top ? dt : db) + (top ? dz : 0));
      }
      g.computeVertexNormals();
      return g;
    });
  }
  const taper = (p, x, y, z, wb, db, wt, dt, h, spec, o = {}) => add(p, gTaper(wb, db, wt, dt, h, o.dz || 0), spec, x, y, z, o);
  // half cylinder lying along Z with the arc on top, flat side at y=0
  const gArch = (r, len, seg = 12) => cg(`ar${q3(r)},${q3(len)},${seg}`, () => { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); return g; });

  // --- textures for the street ---
  const FLYERS = [
    ['LOST CAT', '"MISO"', 'Grey tabby, very shy.', 'Please call Deb'],
    ['GARAGE SALE', 'SAT 8AM', 'Unit 3, Hilltop Village', 'No early birds'],
    ['PIANO LESSONS', 'All ages', 'Patient teacher', 'Ring Marg'],
    ['ROOM FOR RENT', 'Quiet street', 'Close to the exchange', '$95 / wk'],
  ];
  const flyerTex = (i) => ctex('flyer|' + i, 160, 224, (ctx, w, h, r) => {
    const f = FLYERS[i % FLYERS.length];
    ctx.fillStyle = ['#f0ecdf', '#f3e59a', '#e6eef0', '#f1dcdc'][i % 4]; ctx.fillRect(0, 0, w, h);
    // (the title shrinks to fit the sheet with a margin: GARAGE SALE / PIANO LESSONS ran off both edges at 24 px)
    const ts = fit(ctx, [f[0]], w - 16, 30, (q) => `900 ${q}px ${F.heavy}`, 24);
    txt(ctx, f[0], w / 2, 34, { size: ts, font: F.heavy, weight: '900', color: '#1a1a1a', align: 'center' });
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.strokeRect(22, 46, w - 44, 70);
    ctx.fillStyle = 'rgba(60,60,60,0.35)'; ctx.beginPath(); ctx.ellipse(w / 2, 86, 28, 20, 0, 0, TAU); ctx.fill();
    const bs = fit(ctx, f.slice(1), w - 14, 60, (q) => `${q}px ${F.sans}`, 13);
    for (let k = 1; k < 4; k++) txt(ctx, f[k], w / 2, 118 + k * 18, { size: bs, font: F.sans, color: '#222', align: 'center' });
    for (let k = 0; k < 7; k++) { ctx.save(); ctx.translate(12 + k * 20, h - 4); ctx.rotate(-Math.PI / 2); txt(ctx, '04 2231', 0, 0, { size: 9, font: F.mono, color: '#333' }); ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(21 + k * 20, h - 46, 1, 46); }
    if (r() < 0.6) { ctx.clearRect(21 + 2 * 20, h - 46, 20, 46); }
    TU.age(ctx, w, h, r, 1.1, { sun: 0.35 });
  });
  // "No junk mail. No salespeople." style sticker: the first sentence in red, the rest in black
  const stickerTex = (text) => ctex('stk|' + text, 256, 96, (ctx, w, h, r) => {
    ctx.fillStyle = '#ecebe3'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, w - 10, h - 10);
    const parts = String(text).split(/(?<=\.)\s+/);
    const lines = parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : [text];
    const s = fit(ctx, lines, w - 28, h - 30, (q) => `bold ${q}px ${F.sans}`, 34);
    lines.forEach((l, i) => txt(ctx, l, w / 2, h / 2 - (lines.length - 1) * s * 0.6 + i * s * 1.2 + s * 0.36, { size: s, font: F.sans, weight: 'bold', color: i === 0 ? '#b3261e' : '#1c1c1c', align: 'center' }));
    TU.age(ctx, w, h, r, 1.3, { sun: 0.45 });
  });
  // painted lettering with a transparent background (letterbox names, house numbers, stencils)
  const paintTex = (text, col = '#ece6d4', font = F.hand, w = 256, h = 96) => ctex(`paint|${col}|${font}|${text}`, w, h, (ctx, W, H, r) => {
    ctx.clearRect(0, 0, W, H);
    const s = fit(ctx, [text], W * 0.92, H * 0.8, (q) => `bold ${q}px ${font}`, H * 0.8);
    if (font === F.hand || font === F.marker) hand(ctx, text, W / 2, H / 2 + s * 0.35, { size: s, color: col, font, align: 'center', weight: 'bold' });
    else txt(ctx, text, W / 2, H / 2 + s * 0.36, { size: s, font, weight: 'bold', color: col, align: 'center' });
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { ctx.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; ctx.fillRect(r() * W, r() * H, 1 + r() * 5, 1 + r() * 3); }
    ctx.globalCompositeOperation = 'source-over';
  });
  const paintMat = (text, col, font, w, h) => TM(paintTex(text, col, font, w, h), { transparent: true, alphaTest: 0.2 });
  // grey-green hanging gum foliage (alpha) — also tinted for shrubs
  const foliageTex = () => ctex('foliage', 256, 256, (ctx, w, h, r) => {
    ctx.clearRect(0, 0, w, h);
    const pal = ['#6f7a5d', '#7d876a', '#5e6a50', '#8a9275', '#687257', '#7a7a5c'];
    for (let k = 0; k < 16; k++) { // twigs
      ctx.strokeStyle = 'rgba(70,56,40,0.9)'; ctx.lineWidth = 1.5;
      const x = r() * w, y = r() * h * 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 60, y + 40, x + (r() - 0.5) * 80, y + 90 + r() * 60); ctx.stroke();
    }
    for (let k = 0; k < 900; k++) { // sickle-shaped leaves hanging mostly downward
      const x = r() * w, y = r() * h, L = 14 + r() * 16, a = Math.PI / 2 + (r() - 0.5) * 1.3, c = pick(pal, r);
      if (Math.hypot(x - w / 2, y - h / 2) > w * 0.5) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.22, L, 0); ctx.quadraticCurveTo(L * 0.5, L * 0.08, 0, 0); ctx.fill();
      ctx.restore();
    }
  });
  const foliageMat = (tint = '#ffffff') => TM(foliageTex(), { color: tint, alphaTest: 0.45, double: true, roughness: 0.9, offset: false });
  // pale eucalypt bark: cream, grey and salmon patches with vertical streaks
  const barkTex = () => ctex('gumbark', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#b9b2a2'; ctx.fillRect(0, 0, w, h);
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, cy: 6, oct: 4 }), 0.25);
    for (let k = 0; k < 40; k++) { const x = r() * w, y = r() * h, pw = 10 + r() * 40, ph = 30 + r() * 90; ctx.fillStyle = pick(['rgba(214,206,186,0.7)', 'rgba(150,146,132,0.6)', 'rgba(190,150,120,0.45)', 'rgba(120,118,104,0.5)'], r); ctx.beginPath(); ctx.ellipse(x, y, pw / 2, ph / 2, 0, 0, TAU); ctx.fill(); if (x + pw > w) { ctx.beginPath(); ctx.ellipse(x - w, y, pw / 2, ph / 2, 0, 0, TAU); ctx.fill(); } }
    for (let k = 0; k < 120; k++) { ctx.fillStyle = `rgba(70,62,50,${0.1 + r() * 0.25})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 10 + r() * 50); }
    ctx.fillStyle = 'rgba(30,26,20,0.12)'; ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }, { wrap: true, size: 1.2 });
  // timber palings (vertical weathered boards with dark gaps), 1.2 m tile
  const palingTex = () => ctex('paling', 256, 256, (ctx, w, h, r) => {
    const n = 8, bw = w / n;
    for (let i = 0; i < n; i++) {
      const c = TU.hex(pick(['#7d7465', '#857b6a', '#6f675a', '#8a806f', '#77705f'], r));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(i * bw, 0, bw, h);
      for (let k = 0; k < 14; k++) { ctx.fillStyle = `rgba(40,34,26,${0.1 + r() * 0.2})`; ctx.fillRect(i * bw + r() * bw, 0, 1, h); }
      ctx.fillStyle = 'rgba(20,16,12,0.85)'; ctx.fillRect(i * bw, 0, 2, h);
      ctx.fillStyle = 'rgba(30,26,20,0.6)'; ctx.fillRect(i * bw + bw * 0.45, h * 0.12, 2, 2); ctx.fillRect(i * bw + bw * 0.45, h * 0.82, 2, 2);
    }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 3, oct: 4 }), 0.2);
    const g = ctx.createLinearGradient(0, h * 0.7, 0, h); g.addColorStop(0, 'rgba(30,34,24,0)'); g.addColorStop(1, 'rgba(30,34,24,0.5)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { wrap: true, size: 1.2 });
  // corrugated steel (vertical ribs), 0.8 m tile
  const corrugTex = (col = '#555a55') => ctex('corrug|' + col, 128, 128, (ctx, w, h, r) => {
    const c = TU.hex(col);
    for (let x = 0; x < w; x++) { const k = 0.75 + 0.35 * Math.sin((x / w) * TAU * 10); ctx.fillStyle = `rgb(${clamp(c[0] * k, 0, 255)},${clamp(c[1] * k, 0, 255)},${clamp(c[2] * k, 0, 255)})`; ctx.fillRect(x, 0, 1, h); }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, oct: 3 }), 0.2);
    for (let k = 0; k < 6; k++) { const x = r() * w, y = r() * h * 0.5; const g = ctx.createLinearGradient(0, y, 0, y + h * 0.5); g.addColorStop(0, 'rgba(110,64,34,0.35)'); g.addColorStop(1, 'rgba(110,64,34,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, 2, h * 0.5); }
  }, { wrap: true, size: 0.8 });
  // enamel / painted plate with text (house numbers, pole tags, unit numbers)
  const plateTex = (text, bg = '#1d2a2a', fg = '#e8e4d8', w = 192, h = 96) => ctex(`plate|${bg}|${fg}|${w}|${text}`, w, h, (ctx, W, H, r) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(6, 6, W - 12, H - 12);
    const s = fit(ctx, [text], W - 30, H - 26, (q) => `bold ${q}px ${F.sans}`, H * 0.7);
    txt(ctx, text, W / 2, H / 2 + s * 0.36, { size: s, font: F.sans, weight: 'bold', color: fg, align: 'center' });
    TU.age(ctx, W, H, r, 0.8);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Label atlas: a prop's small canvas labels (plates, notes, tags, plaques) packed onto ONE texture, so they share
  // one material and merge into one draw call instead of one each. atlasOf(key, [tex…]) → {tex, rect(tex)};
  // atlasPlane(parent, atlas, tex, x, y, z, w, h, o) → a plane showing that label. Cached per key (shared).
  // ---------------------------------------------------------------------------------------------------------------
  const ATLAS = new Map();
  function atlasOf(key, list) {
    let a = ATLAS.get(key);
    if (a) return a;
    const PAD = 4, W = 512, rects = new Map();
    const items = [...new Set(list)].filter((t) => t && t.image && t.image.width).map((t) => {
      const k = Math.min(1, (W - PAD * 2) / t.image.width);
      return { t, w: Math.max(1, Math.round(t.image.width * k)), h: Math.max(1, Math.round(t.image.height * k)) };
    }).sort((p, q) => q.h - p.h);
    let x = PAD, y = PAD, rowH = 0;
    for (const it of items) {
      if (x + it.w + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; }
      it.x = x; it.y = y; x += it.w + PAD; rowH = Math.max(rowH, it.h);
    }
    let H = 16; while (H < y + rowH + PAD) H *= 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6b6f6b'; ctx.fillRect(0, 0, W, H);
    for (const it of items) {
      ctx.drawImage(it.t.image, it.x - 2, it.y - 2, it.w + 4, it.h + 4);        // edge bleed for mip filtering
      ctx.drawImage(it.t.image, it.x, it.y, it.w, it.h);
      rects.set(it.t, [it.x / W, 1 - (it.y + it.h) / H, (it.x + it.w) / W, 1 - it.y / H]);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true;
    tex.name = 'prop:atlas:' + key.slice(0, 32).replace(/[^\w|:.,-]/g, '_');
    a = { tex, rect: (t) => rects.get(t) || [0, 0, 1, 1], key };
    ATLAS.set(key, a);
    return a;
  }
  function atlasPlane(p, atlas, t, x, y, z, w, h, o = {}) {
    const [u0, v0, u1, v1] = atlas.rect(t);
    const geo = cg(`pa${q3(w)},${q3(h)}|${atlas.key}|${u0.toFixed(4)},${v0.toFixed(4)}`, () => {
      const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      return g;
    });
    return add(p, geo, TM(atlas.tex, o.mat || {}), x, y, z, { cast: false, ...o });
  }

  // sodium lamp head (street lights, power poles): housing + glowing bowl + pooled light or halo
  function sodiumHead(K, o, g, x, y, z, ry = 0) {
    const lit = o.lit !== false;
    const hg = grp(g, x, y, z, ry);
    sph(hg, 0, 0.03, 0, 0.2, M.galv, { s: [1.0, 0.36, 1.85], seg: 12 });
    box(hg, 0, 0.02, -0.34, 0.1, 0.07, 0.14, M.galv);
    const bowlMat = lit ? glowMat('#ffab55', 2.4) : null;
    add(hg, gSph(0.15, 12, Math.PI / 2), bowlMat || { color: '#8f8676', roughness: 0.3 }, 0, 0.0, 0, { rx: 180, s: [0.95, 0.5, 1.7], cast: false });
    let handle = null;
    if (lit) {
      if (o.light !== false) handle = K.light('street', x, y - 0.14, z, { bank: o.bank, flicker: o.flicker, haloSize: o.haloSize });
      else Render.halo([x, y - 0.12, z], { parent: g, color: '#ffad5c', size: o.haloSize ?? 2.4, opacity: 0.5 });
      if (handle) anim(K, () => { bowlMat.emissiveIntensity = handle.isOn ? 2.4 : 0.03; });
    }
    return { head: hg, handle };
  }

  // streetlight: galvanised pole, outreach arm toward +Z, sodium head. opts h (6.8), arm (1.8), lit, light, flicker
  def('streetlight', { collide: 0.14 }, (K, o, g) => {
    const H = o.h ?? 6.8, arm = o.arm ?? 1.8, r = rngOf(K, o, 'sl');
    cyl(g, 0, 0, 0, 0.19, 0.14, 'concrete', { seg: 10 });
    cyl(g, 0, 0.12, 0, 0.1, H - 0.12, M.galv, { r2: 0.066, seg: 10 });
    box(g, 0, 0.45, 0.084, 0.08, 0.28, 0.024, M.steelDk);
    cyl(g, 0, 0.12, 0, 0.13, 0.06, M.galv, { seg: 10 });
    pl(g, 0, 1.78, 0.094, 0.1, 0.05, TM(plateTex('SHC ' + (1000 + Math.floor(r() * 8000)), '#e9e7de', '#1b1b1b')), {});
    if (r() < 0.55) pl(g, 0, 1.32, 0.097, 0.14, 0.196, TM(flyerTex(Math.floor(r() * 4))), { rz: (r() - 0.5) * 10 });
    const top = H - 0.02;
    tube(g, [[0, top - 0.6, 0], [0, top - 0.05, 0.02], [0, top + 0.18, 0.4], [0, top + 0.27, arm * 0.75], [0, top + 0.29, arm]], 0.04, M.galv, { key: `sl${q3(top)}|${q3(arm)}`, radial: 7, seg: 20 });
    sodiumHead(K, o, g, 0, top + 0.26, arm + 0.12);
  });

  // power pole: weathered hardwood, crossarms across the wire run (Z), ceramic insulators, pole tag and step bolts.
  // opts h (9.5), span (m of wire toward +X, 0 = none), lamp (sodium arm toward +Z), stay (stay wire), variant 'transformer'
  def('power_pole', { collide: 0.18 }, (K, o, g) => {
    const H = o.h ?? 9.5, r = rngOf(K, o, 'pp');
    const hw = M.timberGrey;
    cyl(g, 0, 0, 0, 0.16, H, hw, { r2: 0.12, seg: 9 });
    const a1 = H - 0.4, a2 = H - 1.4;
    box(g, 0, a1, 0, 0.11, 0.1, 2.3, hw);
    box(g, 0, a2, 0, 0.1, 0.09, 1.5, hw);
    for (const s of [-1, 1]) { bar(g, [0.07, a1 - 0.55, 0], [0.07, a1 + 0.02, s * 0.6], 0.04, 0.01, M.galv); bar(g, [0.07, a2 - 0.45, 0], [0.07, a2 + 0.02, s * 0.45], 0.035, 0.01, M.galv); }
    const glaze = { color: '#6a4a36', roughness: 0.25 };
    const ins = [];
    const insulator = (y, z) => { cyl(g, 0, y, z, 0.012, 0.06, M.galv, { seg: 6 }); cyl(g, 0, y + 0.05, z, 0.05, 0.07, glaze, { r2: 0.036, seg: 10 }); cyl(g, 0, y + 0.12, z, 0.032, 0.05, glaze, { seg: 8 }); ins.push([0, y + 0.16, z]); };
    for (const z of [-1.05, -0.4, 0.4, 1.05]) insulator(a1 + 0.1, z);
    for (const z of [-0.62, 0, 0.62]) insulator(a2 + 0.09, z);
    pl(g, 0, 2.4, 0.149, 0.12, 0.08, TM(plateTex('P' + (3000 + Math.floor(r() * 6000)), '#1b1c1c', '#e3e0d4')), {});
    for (let y = 2.8; y < a2 - 0.3; y += 0.42) { const s = (Math.round(y / 0.42) % 2) ? 1 : -1; cylc(g, s * 0.16, y, 0, 0.012, 0.16, M.galv, { rz: 90, seg: 6 }); }
    if (o.variant === 'transformer') {
      cyl(g, 0, a2 - 1.6, 0.36, 0.3, 0.9, { tex: 'metal', color: '#7d8680' }, { seg: 14 });
      for (const z of [-0.12, 0, 0.12]) cyl(g, z, a2 - 0.7, 0.36, 0.03, 0.14, glaze, { seg: 8 });
      box(g, 0, a2 - 1.2, 0.13, 0.08, 0.3, 0.12, M.galv);
    }
    if (o.span > 0) {
      const L = o.span, sag = Math.min(1.2, L * 0.025);
      ins.forEach(([x, y, z], i) => {
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([x + L * t, y - sag * 4 * t * (1 - t) - (i > 3 ? 0.05 : 0), z]); }
        tube(g, pts, 0.008, M.black, { key: `ppw${q3(L)}|${q3(y)}|${q3(z)}`, radial: 4, seg: 16, cast: false });
      });
    }
    if (o.lamp) {
      const ly = H - 2.6;
      tube(g, [[0, ly - 0.3, 0.1], [0, ly, 0.3], [0, ly + 0.2, 1.1], [0, ly + 0.24, 1.7]], 0.035, M.galv, { key: 'pplamp', radial: 6, seg: 14 });
      sodiumHead(K, o, g, 0, ly + 0.2, 1.8);
    }
    if (o.stay) {
      rod(g, [0, H * 0.72, -0.12], [0, 0.02, -2.6], 0.006, M.galv, { seg: 4 });
      cyl(g, 0, 0, -2.45, 0.03, 2.0, { color: '#d9b422', roughness: 0.5 }, { seg: 8, rx: -18 });
      box(g, 0, 0, -2.62, 0.3, 0.05, 0.3, 'concrete');
    }
  });

  // letterbox: opts variant 'post' (steel box on a timber post) | 'brick' (brick pier); text (sticker on the front,
  // e.g. "No junk mail. No salespeople."), label (painted name/number on the side, e.g. "M. — Operator"), color
  def('letterbox', { collide: 'auto' }, (K, o, g) => {
    const v = o.variant || 'post', r = rngOf(K, o, 'lb');
    const col = o.color || pick(['#7c2a22', '#2f4f3a', '#3a4a5a', '#7e776a', '#5a3b2a'], r);
    const body = { tex: 'metal', color: col, roughness: 0.62, metalness: 0.25 };
    if (v === 'brick') {
      box(g, 0, 0, 0, 0.46, 1.05, 0.46, 'brick');
      box(g, 0, 1.05, 0, 0.54, 0.06, 0.54, 'concrete');
      box(g, 0, 0.8, 0.232, 0.24, 0.035, 0.006, M.black);
      box(g, 0, 0.82, 0.232, 0.28, 0.012, 0.012, M.galv);
      box(g, 0, 0.18, -0.232, 0.3, 0.4, 0.012, body);
      cyl(g, 0.1, 0.36, -0.24, 0.012, 0.01, M.chrome, { rx: 90, seg: 8 });
      if (o.label) pl(g, 0, 0.48, 0.234, 0.3, 0.12, paintMat(o.label, '#e8e2d0', F.sans), {});
      if (o.text) pl(g, 0, 0.93, 0.234, 0.2, 0.075, TM(stickerTex(o.text)), {});
    } else {
      const post = M.timberGrey;
      box(g, 0, 0, 0, 0.085, 1.0, 0.085, post);
      box(g, 0, 0.96, 0, 0.26, 0.04, 0.36, post);
      box(g, 0, 1.0, 0, 0.26, 0.2, 0.42, body);
      add(g, gArch(0.13, 0.42), body, 0, 1.2, 0, {});
      box(g, 0, 1.13, 0.212, 0.18, 0.03, 0.006, M.black);               // slot
      box(g, 0, 1.162, 0.214, 0.21, 0.012, 0.01, body);                 // slot hood
      box(g, 0, 1.02, -0.212, 0.22, 0.26, 0.01, body);                  // rear door
      cyl(g, 0.07, 1.13, -0.22, 0.012, 0.01, M.chrome, { rx: 90, seg: 8 });
      if (o.text) pl(g, 0, 1.06, 0.216, 0.19, 0.07, TM(stickerTex(o.text)), {});
      if (o.label) for (const s of [-1, 1]) pl(g, s * 0.132, 1.13, 0, 0.3, 0.11, paintMat(o.label, '#ece6d2', F.sans), { ry: s * 90 });
      // rust bloom along the bottom seam
      box(g, 0, 1.0, 0, 0.262, 0.02, 0.422, 'metal_rust', { cast: false });
    }
  });

  // bench frames + slats (shared by bench / bench_plaque)
  function benchBuild(K, o, g, style) {
    const len = o.len ?? 1.8;
    const frameM = style === 'memorial' ? { tex: 'metal', color: '#2a2d2b', roughness: 0.7 } : M.iron;
    const slat = style === 'memorial' ? M.slat : M.timberGrey;
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.1 + ((len - 0.2) * i) / (n - 1);
      bar(g, [x, 0, 0.2], [x, 0.43, 0.17], 0.045, 0.05, frameM);
      bar(g, [x, 0, -0.2], [x, 0.43, -0.18], 0.045, 0.05, frameM);
      bar(g, [x, 0.41, 0.23], [x, 0.41, -0.24], 0.04, 0.045, frameM);
      bar(g, [x, 0.42, -0.2], [x, 0.86, -0.31], 0.04, 0.045, frameM);
      if (i === 0 || i === n - 1) { bar(g, [x, 0.64, 0.22], [x, 0.66, -0.24], 0.05, 0.04, frameM); bar(g, [x, 0.43, 0.2], [x, 0.64, 0.2], 0.035, 0.035, frameM); }
      if (style === 'memorial') { box(g, x, 0, 0.2, 0.14, 0.03, 0.14, 'concrete'); box(g, x, 0, -0.2, 0.14, 0.03, 0.14, 'concrete'); }
    }
    for (let k = 0; k < 4; k++) box(g, 0, 0.44, 0.18 - k * 0.112, len, 0.035, 0.09, slat);
    const bs = [];
    for (let k = 0; k < 3; k++) { const t = 0.2 + k * 0.3, y = lerp(0.47, 0.86, t), z = lerp(-0.2, -0.31, t) + 0.035; bs.push([y, z]); boxc(g, 0, y, z, len, 0.09, 0.03, slat, { rx: -15 }); }
    const plaque = o.plaque ?? (style === 'memorial' ? 'In memory of the girls on the boards, 1961–1987' : null);
    if (plaque) {
      const [py, pz] = bs[1];
      const tex = Tex.sign(plaque, { style: 'plaque', w: 0.34, h: 0.075 });
      add(g, gBox(0.34, 0.075, 0.006), { tex: 'metal', color: '#6b5634', metalness: 0.6, roughness: 0.4 }, 0, py, pz + 0.018, { rx: -15 });
      add(g, gPlane(0.33, 0.07), TM(tex, { roughness: 0.4, metalness: 0.4 }), 0, py + 0.001, pz + 0.0215, { rx: -15, cast: false });
    }
    col(K, o, -len / 2, -0.34, len / 2, 0.26, 0.85);
  }
  // bench: street/park bench, opts len (1.8), plaque (text → brass plaque on the backrest)
  def('bench', { collide: true }, (K, o, g) => benchBuild(K, o, g, 'park'));
  // bench_plaque: the memorial bench (heavier, concrete pads) with a brass plaque; opts.text/plaque (default the
  // operators' memorial: "In memory of the girls on the boards, 1961–1987")
  def('bench_plaque', { collide: true }, (K, o, g) => benchBuild(K, { ...o, plaque: o.text ?? o.plaque }, g, 'memorial'));

  // bus shelter: steel frame, scratched back glazing, ad panel on the west side, bench, empty timetable frame, the
  // route flag on its own pole. opts w (3.4), route ('44'), stop ('SIGNAL HILL'), lit (ad panel glow)
  def('bus_shelter', {}, (K, o, g) => {
    const w = o.w ?? 3.4, d = 1.45, h = 2.45, r = rngOf(K, o, 'bs');
    const frame = paint('#76847f', 0.6);
    const zb = -d / 2 + 0.05, zf = d / 2 - 0.1;
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) { box(g, x, 0, zb, 0.08, h, 0.08, frame); box(g, x, 0, zf, 0.08, h - 0.08, 0.08, frame); }
    // back glazing (two panes) with a kick rail and mid rail
    box(g, 0, 0.12, zb, w - 0.1, 0.06, 0.05, frame);
    box(g, 0, 2.08, zb, w - 0.1, 0.06, 0.05, frame);
    box(g, 0, 0.18, zb, w - 0.1, 1.9, 0.012, 'glass', { cast: false });
    box(g, 0, 0.18, zb, 0.05, 1.9, 0.05, frame);
    // west side: advertising panel (faded plan poster), east side: half glass
    const ax = -w / 2 + 0.05;
    box(g, ax, 0.12, 0, 0.14, 2.0, d - 0.2, frame);
    const adTex = Tex.poster(null, { kind: 'faded', seed: 44 });
    const adMat = o.lit ? TM(adTex, { emissive: 0.35 }) : TM(adTex, { roughness: 0.3 });
    pl(g, ax + 0.071, 1.12, 0, 1.1, 1.6, adMat, { ry: 90 });
    pl(g, ax - 0.071, 1.12, 0, 1.1, 1.6, TM(Tex.poster('STAY CONNECTED', { kind: 'plan', seed: 7 }), { roughness: 0.3 }), { ry: -90 });
    box(g, w / 2 - 0.05, 0.9, 0, 0.012, 1.18, d - 0.25, 'glass', { cast: false });
    // roof: sloping steel canopy with a fascia
    box(g, 0, h, -0.02, w + 0.3, 0.07, d + 0.35, frame, { rx: -3 });
    box(g, 0, h - 0.12, d / 2 + 0.14, w + 0.3, 0.16, 0.04, frame);
    pl(g, 0, h - 0.04, d / 2 + 0.161, 1.4, 0.13, TM(Tex.sign('BUS STOP  ·  ROUTE ' + (o.route ?? '44'), { style: 'street', w: 1.4, h: 0.13, bg: '#1f3f5c' })), {});
    // bench along the back
    for (const x of [-w * 0.3, w * 0.3]) { box(g, x, 0, zb + 0.25, 0.05, 0.44, 0.05, frame); box(g, x, 0.42, zb + 0.13, 0.05, 0.05, 0.3, frame); }
    for (let k = 0; k < 3; k++) box(g, 0, 0.44, zb + 0.14 + k * 0.09, w * 0.75, 0.03, 0.07, { tex: 'metal', color: '#6d7572', roughness: 0.5 });
    // timetable frame (the doc goes in it) + route map
    box(g, w * 0.22, 1.1, zb + 0.03, 0.5, 0.66, 0.02, frame);
    pl(g, w * 0.22, 1.43, zb + 0.041, 0.44, 0.6, TM(routeMapTex(o.route ?? '44', o.stop ?? 'SIGNAL HILL')), {});
    // a faded sticker, the bin bracket
    pl(g, -w * 0.15, 1.6, zb + 0.008, 0.12, 0.05, TM(labelTex('NO SMOKING\nWITHIN 4m', 'label')), {});
    // route flag pole at the front east corner
    const fx = w / 2 + 0.35, fz = d / 2 + 0.1;
    cyl(g, fx, 0, fz, 0.035, 2.9, M.galv, { seg: 8 });
    const flag = busFlagTex(o.route ?? '44', o.stop ?? 'SIGNAL HILL');
    box(g, fx + 0.2, 2.0, fz, 0.36, 0.72, 0.02, M.galv);
    pl(g, fx + 0.2, 2.36, fz + 0.011, 0.34, 0.7, TM(flag), {});
    pl(g, fx + 0.2, 2.36, fz - 0.011, 0.34, 0.7, TM(flag), { ry: 180 });
    pl(g, fx, 1.4, fz + 0.036, 0.05, 0.3, TM(labelTex('CCTV', 'warn')), { rz: 90 });
    // colliders: back, west ad panel, east glass, flag pole
    col(K, o, -w / 2, zb - 0.06, w / 2, zb + 0.06, 2.4);
    col(K, o, ax - 0.08, -d / 2, ax + 0.08, d / 2 - 0.1, 2.4);
    col(K, o, w / 2 - 0.1, -d / 2 + 0.1, w / 2, d / 2 - 0.12, 2.4);
    col(K, o, -w * 0.4, zb, w * 0.4, zb + 0.34, 0.5);
    col(K, o, fx - 0.06, fz - 0.06, fx + 0.06, fz + 0.06, 2.9);
  });
  const routeMapTex = (route, stop) => ctex(`routemap|${route}|${stop}`, 192, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f3f5c'; ctx.fillRect(0, 0, w, 34);
    txt(ctx, 'ROUTE ' + route, 10, 24, { size: 18, font: F.sans, weight: 'bold', color: '#fff' });
    const stops = ['HIGHWAY', stop, 'RELAY ST', 'PLAZA', 'HILLTOP VILLAGE', 'EXCHANGE RD'];
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(40, 58); ctx.lineTo(40, 58 + 34 * (stops.length - 1)); ctx.stroke();
    stops.forEach((s, i) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(40, 58 + i * 34, 7, 0, TAU); ctx.fill(); ctx.stroke(); txt(ctx, s, 56, 63 + i * 34, { size: 13, font: F.sans, weight: i === 1 ? 'bold' : '', color: '#222' }); });
    txt(ctx, 'You are here', 56, 63 + 34 + 14, { size: 10, font: F.sans, color: '#c0392b' });
    TU.age(ctx, w, h, r, 1.2, { sun: 0.4 });
  });
  const busFlagTex = (route, stop) => ctex(`busflag|${route}|${stop}`, 128, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f5c3c'; ctx.fillRect(0, 0, w, 70);
    // bus pictogram
    ctx.fillStyle = '#f0efe8'; ctx.fillRect(22, 14, 84, 40); ctx.fillStyle = '#1f5c3c'; ctx.fillRect(28, 20, 72, 16); ctx.beginPath(); ctx.arc(40, 56, 7, 0, TAU); ctx.arc(88, 56, 7, 0, TAU); ctx.fill();
    txt(ctx, 'BUS', w / 2, 100, { size: 26, font: F.heavy, weight: '900', color: '#1f5c3c', align: 'center' });
    txt(ctx, 'STOP', w / 2, 128, { size: 26, font: F.heavy, weight: '900', color: '#1f5c3c', align: 'center' });
    ctx.fillStyle = '#e8c21a'; ctx.fillRect(16, 146, w - 32, 50);
    txt(ctx, route, w / 2, 186, { size: 40, font: F.heavy, weight: '900', color: '#141414', align: 'center' });
    txt(ctx, stop, w / 2, 222, { size: 12, font: F.sans, weight: 'bold', color: '#333', align: 'center' });
    TU.age(ctx, w, h, r, 1.1, { rust: true, sun: 0.3 });
  });

  // payphone unit (wall plate, body, keypad face, LCD, coin/card slots, hook). Handset on the hook or hanging on its
  // armoured cord (sways). Local: back plate on z=0 facing +Z, origin on the floor. → {setHanging}
  const payFaceTex = () => ctex('payface', 256, 512, (ctx, w, h, r) => {
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#8f9795'); g.addColorStop(0.5, '#b4bbb8'); g.addColorStop(1, '#8a9290');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#26312f'; ctx.fillRect(28, 26, w - 56, 58);                 // LCD bezel
    ctx.fillStyle = '#1b1f1e'; ctx.fillRect(40, 110, 70, 12); txt(ctx, 'COINS', 40, 140, { size: 13, font: F.sans, weight: 'bold', color: '#222' });
    ctx.fillStyle = '#1b1f1e'; ctx.fillRect(150, 106, 70, 20); txt(ctx, 'CARD', 150, 140, { size: 13, font: F.sans, weight: 'bold', color: '#222' });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    keys.forEach((k, i) => {
      const x = 58 + (i % 3) * 54, y = 176 + Math.floor(i / 3) * 52;
      ctx.fillStyle = '#2b2e2e'; ctx.fillRect(x - 3, y - 3, 46, 42);
      const kg = ctx.createLinearGradient(x, y, x, y + 36); kg.addColorStop(0, '#d9dcd9'); kg.addColorStop(1, '#9ea3a1');
      ctx.fillStyle = kg; ctx.fillRect(x, y, 40, 36);
      txt(ctx, k, x + 20, y + 27, { size: 22, font: F.sans, weight: 'bold', color: '#1b1b1b', align: 'center' });
    });
    ctx.fillStyle = '#e9e6da'; ctx.fillRect(30, 396, w - 60, 90);
    txt(ctx, 'PAYPHONE', w / 2, 420, { size: 18, font: F.sans, weight: 'bold', color: '#1f3f5c', align: 'center' });
    ['Local calls 50c', 'Emergency 000 — free', 'Faults 13 22 03'].forEach((l, i) => txt(ctx, l, w / 2, 444 + i * 16, { size: 12, font: F.sans, color: '#333', align: 'center' }));
    TU.age(ctx, w, h, r, 1.0);
  });
  function payUnit(K, o, g, z = 0) {
    const u = grp(g, 0, 0, z, 0, 'payphone_unit');
    const body = { tex: 'metal', color: '#9ea6a4', roughness: 0.42, metalness: 0.6 }, dk = { tex: 'metal', color: '#2f4346' };
    box(u, 0, 0.82, 0.01, 0.38, 0.98, 0.02, dk);
    box(u, 0, 0.99, 0.09, 0.31, 0.66, 0.14, body);
    box(u, 0, 1.64, 0.1, 0.35, 0.05, 0.19, dk);
    pl(u, 0, 1.32, 0.1605, 0.28, 0.56, TM(payFaceTex(), { roughness: 0.45, metalness: 0.3 }));
    pl(u, 0, 1.529, 0.1612, 0.19, 0.036, TM(dispTex('INSERT COINS', 'lcd', 192, 36), { emissive: 0.35 }));
    box(u, -0.178, 1.27, 0.1, 0.045, 0.17, 0.07, body);                 // cradle column
    box(u, -0.178, 1.44, 0.14, 0.05, 0.02, 0.025, M.black);             // hook
    box(u, 0.11, 0.99, 0.162, 0.06, 0.05, 0.02, M.steelDk);             // coin return
    const blk = { tex: 'metal', color: '#1b1d1e', roughness: 0.55, metalness: 0.2 };
    const handset = (p) => { box(p, 0, -0.2, 0, 0.042, 0.2, 0.034, blk); box(p, 0, -0.235, 0.012, 0.066, 0.07, 0.056, blk); box(p, 0, -0.035, 0.012, 0.062, 0.06, 0.052, blk); return p; };
    // hanging: pivot at the cord exit, handset dangling, armoured cord
    const piv = grp(u, -0.12, 0.99, 0.13, 0, 'handset_pivot');
    const hs = grp(piv, 0.02, -0.26, 0.03); hs.rotation.set(0.12, 0.35, 0.18);
    handset(hs);
    tube(piv, [[0, 0, 0], [0.01, -0.08, 0.03], [0.03, -0.18, 0.04], [0.025, -0.25, 0.05], [0.02, -0.28, 0.045]], 0.0075, { tex: 'metal', color: '#8d9493', roughness: 0.35, metalness: 0.8 }, { key: 'paycord', radial: 5, seg: 20 });
    // on the hook: upright along the cradle, cord looping down to the body
    const hk = grp(u, -0.178, 1.5, 0.15, 0, 'handset_hook');
    handset(hk);
    tube(hk, [[0, -0.27, 0], [0.02, -0.4, 0.03], [0.06, -0.52, 0.02], [0.08, -0.5, -0.02]], 0.0075, { tex: 'metal', color: '#8d9493', roughness: 0.35, metalness: 0.8 }, { key: 'paycord2', radial: 5, seg: 16 });
    live(hs); live(piv); live(hk);
    let hanging = o.hanging !== false;
    const setHanging = (v = true) => { hanging = !!v; piv.visible = hanging; hk.visible = !hanging; };
    setHanging(hanging);
    const ph = (U.hash(String(K.rng())) % 600) / 100;
    anim(K, (dt, t) => { if (!hanging) return; piv.rotation.z = Math.sin(t * 0.55 + ph) * 0.045; piv.rotation.x = Math.sin(t * 0.37 + ph * 2) * 0.03; });
    return { unit: u, setHanging };
  }
  // payphone_booth: aluminium booth open to +Z, PHONE sign both sides, directory shelf, the unit on the back wall.
  // opts hanging (handset on its cord, default true; userData.setHanging)
  def('payphone_booth', {}, (K, o, g) => {
    const alu = M.alu, panel = { tex: 'metal', color: '#3c5153' };
    for (const [px, pz] of [[-0.56, -0.44], [0.56, -0.44], [-0.56, 0.44], [0.56, 0.44]]) box(g, px, 0, pz, 0.05, 2.32, 0.05, alu);
    box(g, 0, 0.12, -0.44, 1.1, 2.1, 0.04, panel);
    for (const sx of [-1, 1]) {
      box(g, sx * 0.56, 0.42, 0, 0.018, 1.66, 0.84, 'glass', { cast: false });
      box(g, sx * 0.56, 0.36, 0, 0.04, 0.06, 0.86, alu); box(g, sx * 0.56, 2.08, 0, 0.04, 0.06, 0.86, alu);
      box(g, sx * 0.56, 0.0, 0, 0.05, 0.36, 0.86, panel);
    }
    box(g, 0, 2.3, 0.02, 1.26, 0.1, 1.02, { tex: 'metal', color: '#2e3f41' });
    box(g, 0, 2.4, 0.02, 1.12, 0.26, 0.14, { tex: 'metal', color: '#1f3a55' });
    const sign = TM(Tex.sign('PHONE', { style: 'shop', w: 1.0, h: 0.2, bg: '#1f4b73', fg: '#e8eef0', border: false }));
    pl(g, 0, 2.53, 0.0905, 1.0, 0.2, sign); pl(g, 0, 2.53, -0.0505, 1.0, 0.2, sign, { ry: 180 });
    box(g, 0, 0.9, -0.33, 0.6, 0.03, 0.2, panel);
    box(g, 0.18, 0.93, -0.34, 0.2, 0.04, 0.14, '#8e3325', { ry: 6 });          // directory nobody has opened in years
    pl(g, 0.3, 1.75, -0.418, 0.14, 0.1, TM(labelTex('THIS PHONE\nCANNOT RECEIVE\nCALLS', 'label')));
    const pu = payUnit(K, o, g, -0.42);
    g.userData.setHanging = pu.setHanging;
    col(K, o, -0.6, -0.5, 0.6, -0.4, 2.4);
    col(K, o, -0.6, -0.44, -0.52, 0.46, 2.4);
    col(K, o, 0.52, -0.44, 0.6, 0.46, 2.4);
  });
  // payphone_wall: the unit alone on a wall (Operators' Hall, food court, break rooms). opts hanging (default false)
  def('payphone_wall', { collide: false }, (K, o, g) => {
    const pu = payUnit(K, { ...o, hanging: o.hanging ?? false }, g, 0.0);
    box(g, 0, 1.72, 0.06, 0.4, 0.12, 0.1, { tex: 'metal', color: '#1f3a55' });
    pl(g, 0, 1.78, 0.111, 0.36, 0.08, TM(Tex.sign('PHONE', { style: 'shop', w: 0.36, h: 0.08, bg: '#1f4b73', fg: '#e8eef0', border: false })));
    g.userData.setHanging = pu.setHanging;
  });

  // barrier: opts variant 'aframe' (default: red/white striped boards on A-legs, amber lamp) | 'water' (plastic
  // water-filled barrier) | 'mesh' (temporary fence panel); len (1.8), lit (amber lamp blinks)
  def('barrier', { collide: true }, (K, o, g) => {
    const v = o.variant || 'aframe', len = o.len ?? (v === 'water' ? 1.2 : v === 'mesh' ? 2.4 : 1.8);
    if (v === 'water') {
      const pc = o.color || '#d25a1e';
      taper(g, 0, 0, 0, len, 0.46, len, 0.16, 0.82, { color: pc, roughness: 0.55 });
      box(g, 0, 0.82, 0, len - 0.04, 0.12, 0.15, { color: pc, roughness: 0.55 });
      box(g, 0, 0.5, 0.0, len * 0.7, 0.12, 0.33, { color: '#ecebe3', roughness: 0.5 });
      cyl(g, len * 0.3, 0.94, 0, 0.05, 0.03, { color: '#ecebe3', roughness: 0.5 }, { seg: 10 });
      return;
    }
    if (v === 'mesh') {
      for (const x of [-len / 2, len / 2]) { box(g, x, 0, 0, 0.6, 0.12, 0.2, 'concrete'); cyl(g, x, 0.1, 0, 0.022, 1.95, M.galv, { seg: 8 }); }
      box(g, 0, 0.1, 0, len, 1.95, 0.004, 'chainlink', { cast: false });
      for (const y of [0.1, 2.03]) rod(g, [-len / 2, y, 0], [len / 2, y, 0], 0.02, M.galv);
      box(g, 0, 0.9, 0.012, 1.0, 0.5, 0.004, { tex: 'cardboard', color: '#f0ecdf' }, { cast: false });
      pl(g, 0, 1.15, 0.016, 0.96, 0.46, TM(Tex.sign('KEEP OUT\nCONSTRUCTION SITE', { style: 'warning', w: 0.96, h: 0.46 })));
      return;
    }
    const legM = { tex: 'metal', color: '#c6c4bb', roughness: 0.5 };
    for (const s of [-1, 1]) {
      const x = s * (len / 2 - 0.08);
      bar(g, [x, 0, 0.32], [x, 1.02, 0.02], 0.035, 0.035, legM); bar(g, [x, 0, -0.32], [x, 1.02, -0.02], 0.035, 0.035, legM);
      box(g, x, 0, 0.32, 0.08, 0.02, 0.1, M.rubber); box(g, x, 0, -0.32, 0.08, 0.02, 0.1, M.rubber);
    }
    const stripes = TM(Kit.tex.stripes('#b8261c', '#e7e2d6'), { roughness: 0.55 });
    box(g, 0, 0.78, 0.08, len, 0.22, 0.022, stripes, { uv: [1, 1 / 0.22] });
    box(g, 0, 0.3, 0.2, len, 0.16, 0.022, stripes, { uv: [1, 1 / 0.16], rx: 17 });
    // amber lamp on the top
    box(g, len / 2 - 0.18, 1.0, 0.02, 0.05, 0.06, 0.05, M.black);
    const lampOn = o.lit !== false;
    const lm = lampOn ? glowMat('#ffae33', 2.2) : null;
    cylc(g, len / 2 - 0.18, 1.14, 0.02, 0.07, 0.12, lm || { color: '#7a5418', roughness: 0.3 }, { r2: 0.06, seg: 12 });
    if (lampOn) { const ph = K.rng(); anim(K, (dt, t) => { lm.emissiveIntensity = ((t * 0.9 + ph) % 1) < 0.35 ? 2.4 : 0.05; }); }
  });

  // road_sign: green guide sign on two posts with a council sign beneath. opts text ('SIGNAL HILL  2\nPOP. 1,900'),
  // sub ('MOBILE COVERAGE ENDS'; '' for none), w (1.7), h (0.8)
  def('road_sign', { collide: false }, (K, o, g) => {
    const text = o.text ?? 'SIGNAL HILL   2\nPOP. 1,900', sub = o.sub ?? 'MOBILE COVERAGE ENDS';
    const w = o.w ?? 1.7, h = o.h ?? 0.8, y0 = o.mount ?? 1.25, sh = sub ? 0.42 : 0;
    const top = y0 + sh + (sub ? 0.08 : 0) + h;
    for (const s of [-1, 1]) { cyl(g, s * w * 0.3, 0, -0.035, 0.032, top + 0.02, M.galv, { seg: 8 }); cyl(g, s * w * 0.3, top + 0.02, -0.035, 0.036, 0.02, M.galv, { seg: 8 }); }
    K.sign(text, 0, top - h / 2, 0, w, h, { style: 'street', bg: '#1f5c3c', border: '#e8ece8' });
    if (sub) K.sign(sub, 0, y0 + sh / 2, 0, w * 0.72, sh, { style: 'council' });
    for (const s of [-1, 1]) col(K, o, s * w * 0.3 - 0.06, -0.1, s * w * 0.3 + 0.06, 0.03, top);
  });
  // sign_post: one post with a sign. opts text ('RELAY ST'), text2 (second, crossing blade), style ('street' name blade;
  // 'council' | 'warning' | 'shop' → a rectangular sign), w, h (panel size), bg, fg
  def('sign_post', { collide: 0.07 }, (K, o, g) => {
    const style = o.style || 'street', H = o.post ?? (style === 'street' ? 2.9 : 2.5);
    cyl(g, 0, 0, 0, 0.034, H, M.galv, { seg: 8 });
    cyl(g, 0, H, 0, 0.038, 0.025, M.galv, { seg: 8 });
    if (style === 'street') {
      const w = o.w ?? 1.1;
      K.sign(o.text ?? 'RELAY ST', 0, H - 0.14, 0, w, 0.19, { style: 'street', double: true, bg: o.bg });
      if (o.text2) K.sign(o.text2, 0, H - 0.36, 0, w, 0.19, { style: 'street', double: true, rotY: 90, bg: o.bg });
    } else {
      const w = o.w ?? 0.6, h = o.h ?? 0.45;
      K.sign(o.text ?? 'NOTICE', 0, H - h / 2 - 0.05, 0.04, w, h, { style, bg: o.bg, fg: o.fg });
    }
  });

  // guardrail: galvanised W-beam on steel posts every 2 m, blocks, reflectors, flared ends. Runs along X, road side +Z.
  // opts len (8), variant 'rusty'
  const wbeamProfile = [[0, -0.155], [-0.085, -0.11], [-0.085, -0.05], [-0.025, 0], [-0.085, 0.05], [-0.085, 0.11], [0, 0.155], [0.012, 0.155], [-0.073, 0.11], [-0.073, 0.05], [-0.013, 0], [-0.073, -0.05], [-0.073, -0.11], [0.012, -0.155]];
  def('guardrail', { collide: false }, (K, o, g) => {
    const len = o.len ?? 8, rusty = o.variant === 'rusty';
    const beamM = rusty ? { tex: 'metal_rust', paint: '#8d928c' } : { tex: 'metal', color: '#b7bbb5', roughness: 0.5, metalness: 0.55 };
    const postM = rusty ? 'metal_rust' : { tex: 'metal', color: '#8e948f', roughness: 0.55 };
    add(g, gExtrude('wb' + q3(len), wbeamProfile, len), beamM, 0, 0.6, 0.02, { ry: 90 });
    const n = Math.max(2, Math.round(len / 2) + 1);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.15 + ((len - 0.3) * i) / (n - 1);
      box(g, x, 0, -0.16, 0.1, 0.72, 0.14, postM);
      box(g, x, 0.46, -0.07, 0.08, 0.3, 0.1, postM);
      if (i % 2 === 0) box(g, x, 0.74, -0.16, 0.06, 0.1, 0.02, { color: i % 4 ? '#e9e6dc' : '#b3261e', roughness: 0.35 }, { cast: false });
    }
    if (o.ends !== false) for (const s of [-1, 1]) add(g, gBox(0.5, 0.3, 0.012), beamM, s * (len / 2 + 0.2), 0.6, -0.08, { ry: s * 25 });
    col(K, o, -len / 2, -0.24, len / 2, 0.1, 0.8);
  });

  // fence: opts len (6), variant 'paling' (1.8 m timber) | 'picket' (1.0 m, painted) | 'colorbond' (corrugated steel) |
  // 'wire' (star pickets and wire), h, color. Runs along X; the "good" side faces +Z.
  def('fence', { collide: false }, (K, o, g) => {
    const v = o.variant || 'paling', len = o.len ?? 6, r = rngOf(K, o, 'fn');
    let H = o.h;
    if (v === 'picket') {
      H = H ?? 1.0;
      const paint = { color: o.color || '#d9d4c4', roughness: 0.75 };
      const n = Math.max(2, Math.round(len / 2.4) + 1);
      for (let i = 0; i < n; i++) { const x = -len / 2 + (len * i) / (n - 1); box(g, x, 0, -0.03, 0.09, H + 0.1, 0.09, paint); sph(g, x, H + 0.12, -0.03, 0.05, paint, { seg: 6 }); }
      for (const y of [0.2, H - 0.22]) box(g, 0, y, -0.06, len, 0.07, 0.03, paint);
      for (let x = -len / 2 + 0.08; x < len / 2 - 0.04; x += 0.13) {
        const hh = H - 0.05 + (r() - 0.5) * 0.02, tilt = r() < 0.06 ? (r() - 0.5) * 12 : 0;
        box(g, x, 0.04, 0, 0.07, hh, 0.018, paint, { rz: tilt });
        add(g, gCyl(0.05, 0.001, 0.07, 4), paint, x, 0.04 + hh + 0.03, 0, { ry: 45, s: [0.7, 1, 0.26] });
      }
    } else if (v === 'colorbond') {
      H = H ?? 1.8;
      const c = o.color || '#4d524c';
      box(g, 0, 0, 0, len, H, 0.03, TM(corrugTex(c)), { uv: 1 / 0.8 });
      box(g, 0, H, 0, len, 0.05, 0.06, { tex: 'metal', color: c });
      box(g, 0, 0, 0, len, 0.08, 0.05, { tex: 'metal', color: c });
      const n = Math.max(2, Math.round(len / 2.4) + 1);
      for (let i = 0; i < n; i++) box(g, -len / 2 + (len * i) / (n - 1), 0, -0.04, 0.08, H, 0.05, { tex: 'metal', color: c });
    } else if (v === 'wire') {
      H = H ?? 1.2;
      const n = Math.max(2, Math.round(len / 3) + 1);
      for (let i = 0; i < n; i++) { const x = -len / 2 + (len * i) / (n - 1); box(g, x, 0, 0, 0.035, H + 0.05, 0.035, { tex: 'metal', color: '#3d4a3b' }, { rz: (r() - 0.5) * 5 }); cyl(g, x, H + 0.02, 0, 0.022, 0.04, { color: '#e8e0c8' }, { seg: 6 }); }
      for (let k = 0; k < 4; k++) { const y = 0.25 + k * (H - 0.3) / 3; rod(g, [-len / 2, y, 0.02], [len / 2, y - 0.03, 0.02], 0.0025, M.galv, { seg: 4, cast: false }); }
    } else {
      H = H ?? 1.8;
      box(g, 0, 0.02, 0, len, H - 0.02, 0.02, TM(palingTex()), { uv: 1 / 1.2 });
      const wd = M.timberGrey;
      const n = Math.max(2, Math.round(len / 2.4) + 1);
      for (let i = 0; i < n; i++) box(g, -len / 2 + 0.05 + ((len - 0.1) * i) / (n - 1), 0, -0.07, 0.1, H + 0.02, 0.1, wd);
      for (const y of [0.25, H - 0.3]) box(g, 0, y, -0.045, len, 0.075, 0.035, wd);
      box(g, 0, 0, 0.0, len, 0.12, 0.04, M.timberGrey, { uv: 0.8 });                  // plinth board
    }
    col(K, o, -len / 2, -0.12, len / 2, 0.06, H);
  });

  // chainlink: galvanised posts every 2.5 m, top rail, mesh (alpha), optional barbed wire and sign. opts len (5), h (2.1),
  // barbed (true), sign (text, warning style)
  def('chainlink', { collide: false }, (K, o, g) => {
    const len = o.len ?? 5, H = o.h ?? 2.1;
    const n = Math.max(2, Math.round(len / 2.5) + 1);
    for (let i = 0; i < n; i++) { const x = -len / 2 + (len * i) / (n - 1); cyl(g, x, 0, -0.02, 0.028, H + (o.barbed === false ? 0.05 : 0.1), M.galv, { seg: 8 }); cyl(g, x, 0, -0.02, 0.07, 0.05, 'concrete', { seg: 8 }); }
    rod(g, [-len / 2, H, -0.02], [len / 2, H, -0.02], 0.02, M.galv, { seg: 8 });
    rod(g, [-len / 2, 0.06, -0.02], [len / 2, 0.06, -0.02], 0.004, M.galv, { seg: 4, cast: false });
    box(g, 0, 0.05, 0, len, H - 0.05, 0.004, 'chainlink', { cast: false });
    if (o.barbed !== false) {
      for (let i = 0; i < n; i++) { const x = -len / 2 + (len * i) / (n - 1); bar(g, [x, H + 0.08, -0.02], [x, H + 0.36, -0.3], 0.025, 0.025, M.galv); }
      for (let k = 0; k < 3; k++) { const t = (k + 1) / 3; rod(g, [-len / 2, H + 0.08 + 0.28 * t, -0.02 - 0.28 * t], [len / 2, H + 0.08 + 0.28 * t, -0.02 - 0.28 * t], 0.003, M.galv, { seg: 4, cast: false }); }
    }
    if (o.sign) K.sign(o.sign, 0, 1.45, 0.02, 0.6, 0.42, { style: 'warning' });
    col(K, o, -len / 2, -0.08, len / 2, 0.05, H);
  });

  // gum_tree: pale mottled trunk, forking limbs, sparse drooping canopy of leaf cards, bark strips at the base.
  // opts h (11), lean (deg), seed. gum_tree_small: a young tree (~4.5 m)
  function gumTree(K, o, g, H) {
    const r = rngOf(K, o, 'gum'), k = H / 11;
    const bark = TM(barkTex(), { roughness: 0.85 });
    const lean = (o.lean ?? (r() - 0.5) * 8) * D2R, lx = Math.sin(lean) * 3.5 * k;
    const trunkTop = [lx, 4.2 * k, 0];
    rod(g, [0, -0.05, 0], trunkTop, 0.3 * k, bark, { r2: 0.19 * k, seg: 10 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + r(); rod(g, [Math.cos(a) * 0.18 * k, 0, Math.sin(a) * 0.18 * k], [Math.cos(a) * 0.5 * k, -0.02, Math.sin(a) * 0.5 * k], 0.09 * k, bark, { r2: 0.02, seg: 5 }); }
    const fol = foliageMat(pick(['#b9c2aa', '#aab59c', '#c2c4ac'], r)), fol2 = foliageMat('#8f9a84');
    const clump = (x, y, z, s) => {
      for (let q = 0; q < 3; q++) pl(g, x, y, z, 2.2 * s, 2.0 * s, q === 1 ? fol2 : fol, { ry: q * 60 + r() * 30, rx: (r() - 0.5) * 20, cast: true });
      pl(g, x, y + 0.2 * s, z, 1.8 * s, 1.8 * s, fol, { rx: -90 + (r() - 0.5) * 30, ry: r() * 90, cast: true });
    };
    const limbs = 3 + Math.floor(r() * 2);
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * TAU + r() * 0.8, up = 0.55 + r() * 0.35, L = (3.2 + r() * 2.2) * k;
      const base = [trunkTop[0] * (0.8 + r() * 0.2), trunkTop[1] * (0.85 + r() * 0.15), 0];
      const end = [base[0] + Math.cos(a) * L * (1 - up * 0.6), base[1] + L * up, base[2] + Math.sin(a) * L * (1 - up * 0.6)];
      rod(g, base, end, 0.14 * k, bark, { r2: 0.05 * k, seg: 7 });
      const b2 = [end[0] + Math.cos(a + 0.8) * 1.4 * k, end[1] + 1.2 * k, end[2] + Math.sin(a + 0.8) * 1.4 * k];
      rod(g, end, b2, 0.05 * k, bark, { r2: 0.02 * k, seg: 5 });
      clump(end[0], end[1] + 0.3 * k, end[2], (1.2 + r() * 0.5) * k);
      clump(b2[0], b2[1], b2[2], (1.0 + r() * 0.4) * k);
      clump(lerp(base[0], end[0], 0.6), lerp(base[1], end[1], 0.6) + 0.4 * k, lerp(base[2], end[2], 0.6), (0.8 + r() * 0.3) * k);
    }
    clump(trunkTop[0], trunkTop[1] + 3.5 * k, 0, 1.4 * k);
    // shed bark strips hanging and lying at the base
    for (let i = 0; i < 5; i++) { const a = r() * TAU, d = 0.3 + r() * 0.9; flat(g, Math.cos(a) * d, 0.01 + i * 0.002, Math.sin(a) * d, 0.08, 0.5 + r() * 0.5, { color: '#8a7e6a', roughness: 0.95 }, { ry: r() * 180 }); }
    for (let i = 0; i < 3; i++) { const a = r() * TAU; pl(g, Math.cos(a) * 0.24 * k + lx * 0.4, 2.2 * k, Math.sin(a) * 0.24 * k, 0.07, 0.9, { color: '#9a8c74', roughness: 0.95, side: 'double' }, { ry: (-a * 180) / Math.PI + 90, rz: (r() - 0.5) * 10 }); }
  }
  def('gum_tree', { collide: 0.3 }, (K, o, g) => gumTree(K, o, g, o.h ?? 11));
  def('gum_tree_small', { collide: 0.12 }, (K, o, g) => gumTree(K, o, g, o.h ?? 4.5));

  // shrub: a rounded mass of leafy clumps (dense core + leaf cards). opts w (1.2), h (1.0), color, dead (brown, sparse)
  def('shrub', { collide: 'auto' }, (K, o, g) => {
    const w = o.w ?? 1.2, H = o.h ?? 1.0, r = rngOf(K, o, 'sh');
    const coreC = o.dead ? '#5a4a36' : (o.color || '#4a5a40');
    const tint = o.dead ? '#d8b488' : '#c4d4ac';
    const fol = foliageMat(tint);
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * w * 0.3, s = w * (0.28 + r() * 0.14);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = H * (0.35 + r() * 0.3);
      add(g, gIco(1, 1), { color: coreC, roughness: 0.95 }, x, y * 0.9, z, { s: [s * 0.7, H * 0.3, s * 0.7] });
      for (let q = 0; q < 3; q++) pl(g, x, y + 0.05, z, s * 2.8, H * 1.15, fol, { ry: q * 60 + r() * 40, rx: (r() - 0.5) * 20, cast: true });
      pl(g, x, y + H * 0.3, z, s * 2.4, s * 2.4, fol, { rx: -90 + (r() - 0.5) * 30, ry: r() * 90, cast: true });
    }
  });

  // =================================================================================================================
  // VEHICLES
  // =================================================================================================================
  // side-view profiles (x = car length, front +x; y up), extruded across the width. Arches are notched in.
  function archPts(cx, r, cy = 0.3, n = 7) { const out = []; for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  const CARS = {
    hatch: {
      L: 4.0, W: 1.72, xr: -1.26, xf: 1.33, wr: 0.3,
      body: () => [[-1.98, 0.34], [-1.66, 0.26], ...archPts(-1.26, 0.37), [-0.86, 0.24], [0.93, 0.24], ...archPts(1.33, 0.37), [1.72, 0.26], [1.98, 0.34], [2.02, 0.5], [2.0, 0.66], [1.86, 0.8], [1.2, 0.92], [0.74, 0.99], [-1.76, 1.02], [-1.94, 0.96], [-2.0, 0.62]],
      glass: [[0.74, 0.99], [0.06, 1.44], [-1.58, 1.45], [-1.78, 1.02]],
      aTop: [0.06, 1.44], aBot: [0.74, 0.99], dTop: [-1.58, 1.45], dBot: [-1.78, 1.02], bx: -0.5, roof: [-1.6, 0.08, 1.44],
      head: [1.95, 0.72], tail: [-1.98, 0.86],
    },
    sedan: {
      L: 4.7, W: 1.8, xr: -1.45, xf: 1.42, wr: 0.31,
      body: () => [[-2.32, 0.36], [-1.85, 0.27], ...archPts(-1.45, 0.38, 0.31), [-1.05, 0.25], [1.02, 0.25], ...archPts(1.42, 0.38, 0.31), [1.85, 0.27], [2.33, 0.36], [2.37, 0.52], [2.35, 0.68], [2.18, 0.8], [1.3, 0.91], [0.98, 0.95], [-1.6, 0.99], [-2.25, 0.97], [-2.36, 0.72]],
      glass: [[0.98, 0.95], [0.2, 1.4], [-0.95, 1.41], [-1.62, 0.99]],
      aTop: [0.2, 1.4], aBot: [0.98, 0.95], dTop: [-0.95, 1.41], dBot: [-1.62, 0.99], bx: -0.4, roof: [-0.98, 0.24, 1.4],
      head: [2.3, 0.72], tail: [-2.33, 0.86],
    },
    wagon: {
      L: 4.75, W: 1.8, xr: -1.5, xf: 1.42, wr: 0.31,
      body: () => [[-2.34, 0.36], [-1.9, 0.27], ...archPts(-1.5, 0.38, 0.31), [-1.1, 0.25], [1.02, 0.25], ...archPts(1.42, 0.38, 0.31), [1.85, 0.27], [2.33, 0.36], [2.37, 0.52], [2.35, 0.68], [2.18, 0.8], [1.3, 0.91], [0.98, 0.95], [-2.2, 1.0], [-2.34, 0.95], [-2.38, 0.7]],
      glass: [[0.98, 0.95], [0.2, 1.42], [-2.14, 1.43], [-2.26, 1.0]],
      aTop: [0.2, 1.42], aBot: [0.98, 0.95], dTop: [-2.14, 1.43], dBot: [-2.26, 1.0], bx: -0.45, roof: [-2.16, 0.24, 1.42],
      head: [2.3, 0.72], tail: [-2.36, 0.88],
    },
  };
  // planar side-projection UVs over the car length/height (for the panel texture)
  function sideUV(geo, L, H) { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + L / 2) / L, p.getY(i) / H); uv.needsUpdate = true; return geo; }
  // car paint panel texture (tinted by the paint colour): door seams, handles, sill grime, mud in the arches
  const carPanelTex = (kind) => ctex('carpanel|' + kind, 512, 192, (ctx, w, h, r) => {
    const c = CARS[kind], X = (x) => ((x + c.L / 2) / c.L) * w, Y = (y) => h - (y / 1.5) * h;
    ctx.fillStyle = '#e4e4e0'; ctx.fillRect(0, 0, w, h);
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 3, oct: 3 }), 0.06);
    ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = 2;
    const seams = kind === 'hatch' ? [0.72, -0.5, -1.7] : [0.95, -0.4, -1.55];
    for (const sx of seams) { ctx.beginPath(); ctx.moveTo(X(sx), Y(0.28)); ctx.lineTo(X(sx + 0.02), Y(1.0)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(X(seams[0]), Y(0.36)); ctx.lineTo(X(seams[2]), Y(0.36)); ctx.stroke();
    for (const hx of [seams[0] - 0.25, seams[1] - 0.25]) { ctx.fillStyle = 'rgba(40,40,40,0.8)'; ctx.fillRect(X(hx), Y(0.9), 22, 5); }
    ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.fillRect(0, Y(0.52), w, 3);                // rubbing strip
    const g = ctx.createLinearGradient(0, Y(0.55), 0, h); g.addColorStop(0, 'rgba(60,54,44,0)'); g.addColorStop(1, 'rgba(60,54,44,0.65)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (const ax of [c.xr, c.xf]) { const gg = ctx.createRadialGradient(X(ax), Y(0.3), 10, X(ax), Y(0.3), 70); gg.addColorStop(0, 'rgba(50,42,30,0.7)'); gg.addColorStop(1, 'rgba(50,42,30,0)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h); }
    for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(80,60,40,${r() * 0.3})`; ctx.fillRect(r() * w, Y(0.2 + r() * 0.4), 1 + r() * 3, 1 + r() * 2); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, Y(0.98), w, 4);
  });
  // fog-beaded dark glass (droplets catch the light)
  const beadGlassTex = () => ctex('beadglass', 256, 256, (ctx, w, h, r) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2c3538'); g.addColorStop(1, '#101415'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { const x = r() * w, y = r() * h, s = 0.6 + r() * 1.8; ctx.fillStyle = `rgba(200,210,208,${0.12 + r() * 0.3})`; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); }
    for (let k = 0; k < 14; k++) { const x = r() * w, y = r() * h * 0.6; ctx.fillStyle = 'rgba(20,26,28,0.6)'; ctx.fillRect(x, y, 2, h * (0.1 + r() * 0.3)); }
  }, { wrap: true, size: 0.6 });
  const plateCarTex = (text) => ctex('carplate|' + text, 192, 64, (ctx, w, h, r) => {
    ctx.fillStyle = '#ecebe2'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
    txt(ctx, text, w / 2, h * 0.7, { size: 38, font: F.narrow, weight: 'bold', color: '#1b2b5a', align: 'center' });
    txt(ctx, 'NSW', w / 2, h * 0.2, { size: 9, font: F.sans, color: '#1b2b5a', align: 'center' });
    TU.age(ctx, w, h, r, 0.7);
  });
  function carBuild(K, o, g, kind, interior) {
    const c = CARS[kind], r = rngOf(K, o, 'car');
    const paint = o.color || pick(['#6d2622', '#3a4a58', '#8b8a82', '#2f3a33', '#b8b4a6', '#4b3c2e', '#1f2629'], r);
    const cg0 = grp(g, 0, 0, 0, -90);             // car-local: +x forward (→ prop +Z), z across
    const bodyGeo = cg(`carbody|${kind}`, () => { const sh = new THREE.Shape(c.body().map((p) => new THREE.Vector2(p[0], p[1]))); const gg = new THREE.ExtrudeGeometry(sh, { depth: c.W - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 }); gg.translate(0, 0, -(c.W - 0.06) / 2); gg.computeVertexNormals(); return sideUV(gg, c.L, 1.5); });
    add(cg0, bodyGeo, TM(carPanelTex(kind), { color: paint, roughness: 0.38, metalness: 0.35, offset: false }), 0, 0, 0);
    const glassSpec = interior ? 'glass' : TM(beadGlassTex(), { roughness: 0.1, metalness: 0.4, offset: false });
    const gw = c.W - 0.26;
    add(cg0, gExtrude('carglass' + kind, c.glass, gw), glassSpec, 0, 0, 0, { cast: !interior });
    const trim = M.blackGloss, pillar = { color: paint, roughness: 0.38, metalness: 0.35 };
    for (const s of [-1, 1]) {
      const z = s * (gw / 2 + 0.01);
      bar(cg0, [c.aBot[0], c.aBot[1], z], [c.aTop[0], c.aTop[1], z], 0.07, 0.05, pillar);
      bar(cg0, [c.dBot[0], c.dBot[1], z], [c.dTop[0], c.dTop[1], z], 0.1, 0.05, pillar);
      bar(cg0, [c.bx, c.aBot[1], z], [c.bx, c.aTop[1], z], 0.08, 0.05, trim);
      bar(cg0, [c.dBot[0] + 0.05, c.dBot[1] + 0.005, z * 1.02], [c.aBot[0] - 0.03, c.aBot[1] + 0.005, z * 1.02], 0.02, 0.02, trim);
      // mirror
      box(cg0, c.aBot[0] - 0.08, c.aBot[1] - 0.02, s * (c.W / 2 + 0.07), 0.1, 0.1, 0.14, pillar);
    }
    box(cg0, (c.roof[0] + c.roof[1]) / 2, c.roof[2] - 0.01, 0, c.roof[1] - c.roof[0], 0.05, gw + 0.12, pillar);
    // bumpers, grille, plates
    const [hx, hy] = c.head, [tx, ty] = c.tail;
    box(cg0, hx + 0.02, 0.28, 0, 0.12, 0.22, c.W - 0.04, M.darkPlastic);
    box(cg0, tx - 0.02, 0.3, 0, 0.12, 0.22, c.W - 0.04, M.darkPlastic);
    box(cg0, hx + 0.035, 0.53, 0, 0.04, 0.12, c.W * 0.42, M.black);
    pl(cg0, hx + 0.09, 0.4, 0, 0.36, 0.12, TM(plateCarTex(o.plate || ('SH·' + (100 + Math.floor(r() * 899))))), { ry: 90 });
    pl(cg0, tx - 0.09, 0.62, 0, 0.36, 0.12, TM(plateCarTex(o.plate || ('SH·' + (100 + Math.floor(r() * 899))))), { ry: -90 });
    // lamps: headlights, tail lights, indicators (per-instance glow so hazards/headlights can switch)
    // lamps get per-instance materials only when hazards/headlights will be driven (parked cars share one batch)
    const dyn = dynamic(o, 'hazards', 'headlights');
    const headM = dyn ? glowMat('#fff4dc', 0) : { color: '#c9ccc6', roughness: 0.15, metalness: 0.3 }, tailM = dyn ? glowMat('#ff2a1c', 0.25) : { color: '#6a1410', roughness: 0.2 }, indM = dyn ? glowMat('#ffa22a', 0) : { color: '#8a5a1a', roughness: 0.2 };
    const headOff = { color: '#b9bdb8', roughness: 0.15, metalness: 0.4 };
    for (const s of [-1, 1]) {
      box(cg0, hx - 0.02, hy - 0.06, s * (c.W / 2 - 0.25), 0.1, 0.12, 0.3, headM);
      box(cg0, hx - 0.03, hy - 0.06, s * (c.W / 2 - 0.08), 0.08, 0.08, 0.1, indM);
      box(cg0, tx + 0.0, ty - 0.08, s * (c.W / 2 - 0.16), 0.08, 0.16, 0.24, tailM);
      box(cg0, tx + 0.0, ty - 0.2, s * (c.W / 2 - 0.16), 0.08, 0.06, 0.24, indM);
    }
    // wheels
    const tyre = gCyl(c.wr, c.wr, 0.2, 16), hub = gCyl(c.wr * 0.62, c.wr * 0.62, 0.21, 12);
    for (const wx of [c.xr, c.xf]) for (const s of [-1, 1]) {
      add(cg0, tyre, M.rubber, wx, c.wr, s * (c.W / 2 - 0.13), { rx: 90 });
      add(cg0, hub, { tex: 'metal', color: '#7b807e', roughness: 0.4, metalness: 0.6 }, wx, c.wr, s * (c.W / 2 - 0.13), { rx: 90 });
    }
    box(cg0, 0, 0.14, 0, c.L * 0.8, 0.14, c.W - 0.3, M.black, { cast: false });          // underbody shadow mass
    if (interior) {
      const seatM = { tex: 'fabric_knit', color: '#4a4e52', roughness: 0.95 };
      const seat = (x, z) => { box(cg0, x, 0.36, z, 0.5, 0.14, 0.5, seatM); box(cg0, x - 0.27, 0.46, z, 0.12, 0.6, 0.48, seatM, { rz: 12 }); box(cg0, x - 0.33, 1.02, z, 0.1, 0.18, 0.26, seatM, { rz: 8 }); };
      seat(0.05, 0.38); seat(0.05, -0.38);
      box(cg0, -1.0, 0.36, 0, 0.55, 0.14, c.W - 0.36, seatM);
      box(cg0, -1.27, 0.46, 0, 0.12, 0.52, c.W - 0.36, seatM, { rz: 14 });
      box(cg0, 0.72, 0.62, 0, 0.35, 0.36, c.W - 0.2, M.darkPlastic, { rz: -18 });       // dash
      add(cg0, gTorus(0.17, 0.015, 5, 16), M.black, 0.5, 0.86, 0.38, { ry: 90, rz: -25 });
      rod(cg0, [0.3, 0.4, 0], [0.33, 0.6, 0], 0.012, M.black, { seg: 6 });
      box(cg0, 0.62, 0.3, 0, 1.5, 0.08, c.W - 0.2, M.darkPlastic);                        // floor
      g.userData.seat = [0.38, 0.5, 0.05];                                                 // passenger seat (prop-local; AU: driver on the right = −X)
      g.userData.dash = [0, 0.84, 0.68];
    }
    // hazards / headlights
    if (dyn) {
      let hazards = !!o.hazards, headlights = !!o.headlights;
      const halos = [];
      for (const s of [-1, 1]) { const h1 = Render.halo([s * (c.W / 2 - 0.25), hy - 0.02, hx + 0.1], { parent: g, color: '#fff2d6', size: 1.2, opacity: 0.45 }); h1.visible = headlights; halos.push(h1); }
      const ind = [];
      for (const s of [-1, 1]) for (const zz of [hx + 0.05, tx - 0.05]) { const h1 = Render.halo([s * (c.W / 2 - 0.1), zz === hx + 0.05 ? hy - 0.05 : ty - 0.16, zz], { parent: g, color: '#ffa22a', size: 0.7, opacity: 0.5 }); h1.visible = false; ind.push(h1); }
      const apply = (blink) => { indM.emissiveIntensity = blink ? 2.6 : 0; for (const h1 of ind) h1.visible = blink; headM.emissiveIntensity = headlights ? 2.2 : 0; for (const h1 of halos) h1.visible = headlights; tailM.emissiveIntensity = headlights ? 1.2 : 0.2; };
      apply(false);
      anim(K, (dt, t) => { apply(hazards && (t % 0.8) < 0.4); });
      g.userData.setHazards = (v = true) => { hazards = !!v; apply(false); };
      g.userData.setHeadlights = (v = true) => { headlights = !!v; apply(false); };
    } else g.userData.setHazards = g.userData.setHeadlights = () => { baked(kind === 'hatch' ? 'hatchback' : 'car', null); };
    col(K, o, -c.W / 2, -c.L / 2, c.W / 2, c.L / 2, 1.45);
    return cg0;
  }
  // car: a parked sedan or wagon, fog-beaded dark glass. opts color, variant 'sedan'|'wagon', plate, hazards, headlights
  def('car', {}, (K, o, g) => { carBuild(K, o, g, o.variant === 'wagon' ? 'wagon' : 'sedan', false); });
  // hatchback: Aidan's small hatchback, clear glass with an interior (userData.seat = passenger seat top, local).
  // opts color ('#5b6b70'), hazards (blinking amber), headlights
  def('hatchback', {}, (K, o, g) => { carBuild(K, { color: '#5b6b70', plate: 'ADN·226', ...o }, g, 'hatch', true); });

  // bin: opts variant 'wheelie' (240 L council bin, lid colour by opts.color/lid) | 'street' (steel litter bin on a post)
  // | 'drum' (rusty 44-gallon drum); text (painted house number on the wheelie)
  def('bin', { collide: 'auto' }, (K, o, g) => {
    const v = o.variant || 'wheelie', r = rngOf(K, o, 'bin');
    if (v === 'street') {
      cyl(g, 0, 0, 0, 0.05, 0.25, 'concrete', { seg: 8 });
      cyl(g, 0, 0.22, 0, 0.26, 0.72, { tex: 'metal', color: '#2f4a3a' }, { r2: 0.28, seg: 14, open: true });
      cyl(g, 0, 0.22, 0, 0.25, 0.02, { tex: 'metal', color: '#2a2e2c' }, { seg: 14 });
      cyl(g, 0, 0.94, 0, 0.3, 0.06, { tex: 'metal', color: '#2f4a3a' }, { seg: 14 });
      add(g, gSph(0.3, 14, Math.PI / 2), { tex: 'metal', color: '#2f4a3a' }, 0, 1.0, 0, { s: [1, 0.35, 1] });
      box(g, 0, 0.9, 0.24, 0.26, 0.1, 0.06, M.black);
      pl(g, 0, 0.62, 0.28, 0.22, 0.12, TM(labelTex('LITTER\nSH COUNCIL', 'label')), {});
      cyl(g, 0, 0.3, 0, 0.18, 0.5, { color: '#1e1f1f', roughness: 0.6 }, { seg: 10 });   // liner bag
      return;
    }
    if (v === 'drum') {
      cyl(g, 0, 0, 0, 0.29, 0.88, { tex: 'metal_rust', paint: '#3e4b4e' }, { seg: 16 });
      for (const y of [0.29, 0.58]) cyl(g, 0, y, 0, 0.3, 0.025, 'metal_rust', { seg: 16 });
      cyl(g, 0, 0.88, 0, 0.3, 0.02, 'metal_rust', { seg: 16 });
      return;
    }
    const body = { color: o.color || '#2d4636', roughness: 0.6 };
    const lid = { color: o.lid || pick(['#8f2a22', '#c8a41f', '#2d4636'], r), roughness: 0.55 };
    taper(g, 0, 0.06, 0, 0.5, 0.6, 0.58, 0.72, 0.92, body);
    box(g, 0, 0.98, -0.02, 0.62, 0.05, 0.78, lid, { rx: -2 });
    box(g, 0, 0.9, -0.38, 0.54, 0.06, 0.06, body);
    cylc(g, 0, 0.94, -0.42, 0.018, 0.5, M.black, { rz: 90, seg: 6 });
    for (const s of [-1, 1]) cylc(g, s * 0.24, 0.1, -0.32, 0.1, 0.05, M.rubber, { rz: 90, seg: 12 });
    cylc(g, 0, 0.1, -0.32, 0.015, 0.54, M.steel, { rz: 90, seg: 6 });
    if (o.text) pl(g, 0, 0.62, 0.342, 0.3, 0.2, paintMat(o.text, '#f0ece0', F.sans), { rx: -4 });
    pl(g, 0.12, 0.8, 0.346, 0.14, 0.1, TM(labelTex('GENERAL\nWASTE', 'label')), { rx: -4 });
  });

  // traffic_light: junction pole, back-to-back three-aspect heads with black target boards, pedestrian button.
  // opts mode 'amber' (blinking, default) | 'amber_solid' | 'red' | 'green' | 'off'; light (real amber pool light);
  // glow (halo size factor, 1; 0 = none) — every lit lens gets a fog-soft halo that reads at 15–20 m
  def('traffic_light', { collide: 0.12 }, (K, o, g) => {
    const H = o.h ?? 3.3, glow = o.glow ?? 1, lensHalos = { red: [], green: [] };
    cyl(g, 0, 0, 0, 0.12, 0.08, 'concrete', { seg: 10 });
    cyl(g, 0, 0, 0, 0.07, H + 0.2, { tex: 'metal', color: '#6d726e', roughness: 0.6 }, { seg: 10 });
    const lens = { red: lampMat('#3a1512', '#ff3322'), amber: lampMat('#3a2a0c', '#ffab2e'), green: lampMat('#0c2a1c', '#3dff9a') };
    const halos = [];
    for (const [ry, zz] of [[0, 0.1], [180, -0.1]]) {
      const hg = grp(g, 0, H - 1.0, zz, ry);
      box(hg, 0, -0.05, 0.04, 0.52, 1.1, 0.02, M.black);
      box(hg, 0, -0.05, 0.045, 0.54, 1.12, 0.012, { color: '#d9c21f', roughness: 0.6 });
      box(hg, 0, -0.03, 0.12, 0.3, 1.02, 0.2, { color: '#1f2320', roughness: 0.55 });
      [['red', 0.8], ['amber', 0.47], ['green', 0.14]].forEach(([k, y]) => {
        add(hg, gCircle(0.1, 20), lens[k], 0, y, 0.225, {});
        add(hg, gArch(0.13, 0.2, 10), { color: '#161817', roughness: 0.6 }, 0, y + 0.01, 0.32, {});
      });
      if (glow > 0) {
        halos.push(Render.halo([0, H - 1.0 + 0.47, zz + (ry ? -0.25 : 0.25)], { parent: g, color: '#ffab2e', size: 1.5 * glow, opacity: 0.6, fog: 0.6 }));
        lensHalos.red.push(Render.halo([0, H - 1.0 + 0.8, zz + (ry ? -0.25 : 0.25)], { parent: g, color: '#ff3322', size: 1.5 * glow, opacity: 0.65, fog: 0.6 }));
        lensHalos.green.push(Render.halo([0, H - 1.0 + 0.14, zz + (ry ? -0.25 : 0.25)], { parent: g, color: '#3dff9a', size: 1.5 * glow, opacity: 0.55, fog: 0.6 }));
      }
    }
    // pedestrian button
    box(g, 0, 1.0, 0.07, 0.12, 0.2, 0.06, { color: '#d8c22a', roughness: 0.5 });
    cyl(g, 0, 1.12, 0.1, 0.022, 0.01, M.black, { rx: 90, seg: 10 });
    pl(g, 0, 1.03, 0.101, 0.1, 0.06, TM(labelTex('PRESS\nBUTTON', 'label')), {});
    let mode = o.mode || 'amber';
    const lh = o.light !== false ? K.light('point', 0, H - 0.5, 0.45, { color: '#ffae3a', intensity: 3, distance: 9, bank: o.bank }) : null;
    const base = 3;
    const apply = (blinkOn) => {
      const a = mode === 'amber_solid' || (mode === 'amber' && blinkOn);
      lens.amber.emissiveIntensity = a ? 2.6 : 0; lens.red.emissiveIntensity = mode === 'red' ? 2.4 : 0; lens.green.emissiveIntensity = mode === 'green' ? 2.4 : 0;
      for (const h of halos) { h.visible = a; }
      for (const h of lensHalos.red) h.visible = mode === 'red';
      for (const h of lensHalos.green) h.visible = mode === 'green';
      if (lh) lh.intensity = a ? base : 0.0001;
    };
    let last = null;
    anim(K, (dt, t) => { const b = (t % 1.1) < 0.55; if (b !== last) { last = b; apply(b); } });
    apply(true);
    g.userData.setMode = (m) => { mode = m; last = null; };
  });

  // bollard: opts variant 'steel' (yellow pipe, default) | 'galv' | 'concrete' | 'post' (timber with reflector)
  def('bollard', { collide: 0.13 }, (K, o, g) => {
    const v = o.variant || 'steel';
    if (v === 'concrete') { box(g, 0, 0, 0, 0.3, 0.85, 0.3, 'concrete'); box(g, 0, 0.62, 0, 0.305, 0.08, 0.305, { color: '#d9d4c4', roughness: 0.4 }); return; }
    if (v === 'post') { box(g, 0, 0, 0, 0.15, 0.95, 0.15, M.timberGrey); box(g, 0, 0.78, 0.076, 0.08, 0.12, 0.004, { color: '#e8e3d4', roughness: 0.2 }); return; }
    const c = v === 'galv' ? M.galv : { color: '#c9a822', roughness: 0.55 };
    cyl(g, 0, 0, 0, 0.08, 0.98, c, { seg: 12 });
    add(g, gSph(0.08, 12, Math.PI / 2), c, 0, 0.98, 0, {});
    cyl(g, 0, 0.8, 0, 0.081, 0.08, { color: '#e9e6dc', roughness: 0.25 }, { seg: 12 });
    cyl(g, 0, 0, 0, 0.1, 0.03, 'concrete', { seg: 12 });
  });

  // boom_gate: cabinet with key switch, striped arm (pivot; userData.setOpen(0..1)), fork rest post.
  // opts len (4.2), open (0..1), block (true: a named collider under the arm while closed → userData.collider)
  def('boom_gate', { collide: false }, (K, o, g) => {
    const len = o.len ?? 4.2;
    const cab = paint('#dedbd0', 0.5);
    box(g, 0, 0, 0, 0.42, 1.02, 0.36, cab);
    box(g, 0, 1.02, 0, 0.46, 0.04, 0.4, M.steelDk);
    box(g, 0, 0.0, 0, 0.5, 0.06, 0.44, 'concrete');
    box(g, 0, 0.18, 0.182, 0.3, 0.12, 0.004, TM(Kit.tex.stripes('#141414', '#e8c21a')), { uv: [1, 1 / 0.12] });
    box(g, -0.12, 0.72, 0.182, 0.1, 0.14, 0.012, M.steel);
    cyl(g, -0.12, 0.79, 0.19, 0.016, 0.012, M.chrome, { rx: 90, seg: 10 });
    box(g, -0.12, 0.79, 0.198, 0.004, 0.018, 0.002, M.black);
    pl(g, 0.08, 0.6, 0.182, 0.16, 0.08, TM(labelTex('KEY\nACCESS', 'warn')), {});
    const piv = grp(g, 0.24, 0.9, 0.0, 0, 'arm');
    const stripes = TM(Kit.tex.stripes('#b8261c', '#e7e2d6'), { roughness: 0.5 });
    box(piv, len / 2, -0.05, 0, len, 0.1, 0.06, stripes, { uv: [1, 10] });
    box(piv, 0.02, -0.12, 0, 0.14, 0.24, 0.14, M.steelDk);
    live(piv);
    // rest post
    cyl(g, len + 0.1, 0, 0, 0.04, 0.84, M.galv, { seg: 8 });
    box(g, len + 0.1, 0.82, 0, 0.12, 0.08, 0.1, M.galv);
    const armCol = o.block === false || o.collide === false ? null : K.collider(0.3, -0.05, len, 0.05, { h: 1.0 });
    let amt = 0;
    const setOpen = (v) => { amt = clamp(v); piv.rotation.z = amt * R(86); if (armCol) armCol.enabled = amt < 0.5; };
    setOpen(o.open ?? 0);
    g.userData.setOpen = setOpen; g.userData.collider = armCol;
    Object.defineProperty(g.userData, 'open', { get: () => amt, enumerable: false });
    col(K, o, -0.24, -0.2, 0.24, 0.2, 1.05);
    col(K, o, len + 0.03, -0.06, len + 0.17, 0.06, 0.9);
  });

  // cable_drum: timber cable reel with a wound black cable and stencils. opts variant 'standing' (on its flanges,
  // default) | 'flat' (on its side), radius (flange radius 0.8)
  const drumFaceTex = () => ctex('drumface', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#8b7355'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = `rgba(${60 + r() * 30},${46 + r() * 20},30,0.35)`; ctx.fillRect(0, i * 37, w, 2); }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, cy: 8, oct: 3 }), 0.25);
    ctx.fillStyle = '#1f1a14'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 16, 0, TAU); ctx.fill();
    txt(ctx, 'TELECOM', w / 2, h * 0.3, { size: 26, font: F.heavy, color: 'rgba(30,26,20,0.75)', align: 'center' });
    txt(ctx, '1200 PR  0.4', w / 2, h * 0.75, { size: 20, font: F.mono, weight: 'bold', color: 'rgba(30,26,20,0.75)', align: 'center' });
    txt(ctx, '→ ROLL THIS WAY', w / 2, h * 0.86, { size: 14, font: F.sans, weight: 'bold', color: 'rgba(30,26,20,0.6)', align: 'center' });
    TU.age(ctx, w, h, r, 1.2);
  });
  def('cable_drum', { collide: 'auto' }, (K, o, g) => {
    const Rr = o.radius ?? 0.8, flat0 = o.variant === 'flat';
    const d = grp(g, 0, flat0 ? 0 : Rr, 0, 0);
    if (!flat0) d.rotation.z = R(90);
    const face = TM(drumFaceTex(), { roughness: 0.9 }), rim = M.pine;
    for (const s of [-1, 1]) {
      const y = flat0 ? (s < 0 ? 0 : 0.86) : s * 0.43 - 0.03;
      add(d, gCyl(Rr, Rr, 0.06, 20), rim, 0, y + 0.03, 0, {});
      add(d, gCircle(Rr * 0.98, 20), face, 0, y + (s > 0 ? 0.061 : -0.001), 0, { rx: s > 0 ? -90 : 90 });
    }
    const yc = flat0 ? 0.46 : 0;
    add(d, gCyl(Rr * 0.72, Rr * 0.72, 0.8, 18, 1 / 0.02), TM(coilTex('#161616'), { roughness: 0.4 }), 0, yc, 0, {});
    tube(g, flat0 ? [[Rr * 0.72, 0.5, 0], [Rr + 0.3, 0.3, 0.2], [Rr + 0.8, 0.02, 0.6], [Rr + 1.6, 0.02, 0.5]] : [[0, Rr * 1.7, 0.1], [0.3, Rr * 0.9, 0.9], [0.4, 0.03, 1.4], [0.6, 0.02, 2.2]], 0.028, M.black, { key: 'drumtail' + (flat0 ? 'f' : 's') + q3(Rr), radial: 6, seg: 18 });
  });

  // =================================================================================================================
  // SHOPFRONTS, BUILDINGS, YARD PIECES
  // =================================================================================================================
  // roller shutter / roller door in an opening w × h (bottom at y0), curtain in the plane z. Per-instance curtain
  // geometry whose UVs follow the visible height, so the slats never stretch. → {setOpen, collider}
  function rollerBuild(K, o, g, w, h, x = 0, z = 0, y0 = 0, style = {}) {
    const housing = style.housing || M.galv;
    box(g, x, y0 + h, z - 0.16, w + 0.16, 0.38, 0.36, housing);
    for (const s of [-1, 1]) box(g, x + s * (w / 2 + 0.035), y0, z, 0.07, h, 0.09, style.guide || M.steelDk);
    const geo = new THREE.PlaneGeometry(w, 1); geo.translate(0, -0.5, 0);
    const base = geo.attributes.uv.array.slice();
    const tex = style.tex || Kit.tex.shutter();
    const cm = add(g, geo, TM(tex, { color: style.color || '#ffffff', roughness: 0.6, metalness: 0.35, double: true, offset: false }), x, y0 + h, z, { live: true });
    const rail = grp(g, x, 0, z);
    box(rail, 0, -0.03, 0, w, 0.06, 0.06, M.steelDk);
    for (const s of [-0.3, 0.3]) box(rail, s * w, 0.03, 0.035, 0.12, 0.03, 0.03, M.steel);
    cyl(rail, 0, -0.01, 0.035, 0.02, 0.012, M.chrome, { rx: 90, seg: 8 });
    live(rail);
    const collider = o.collide === false || style.collide === false ? null : K.collider(x - w / 2, z - 0.07, x + w / 2, z + 0.07, { h: h, y: y0 });
    let open = 0;
    const setOpen = (v) => {
      open = clamp(v, 0, 0.97);
      const vis = Math.max(0.03, h * (1 - open));
      cm.scale.y = vis;
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, base[i * 2] * w, (base[i * 2 + 1]) * vis);
      uv.needsUpdate = true;
      rail.position.y = y0 + h - vis;
      if (collider) collider.enabled = open < 0.72;
    };
    return { setOpen, collider, get open() { return open; } };
  }
  // shutter: a shop roller shutter in its own frame. opts w (3), h (2.6), open (0..1, default 0 = down), color
  def('shutter', { collide: false }, (K, o, g) => {
    const w = o.w ?? 3, h = o.h ?? 2.6;
    const rs = rollerBuild(K, o, g, w, h, 0, 0, 0, { color: o.color });
    rs.setOpen(o.open ?? 0);
    g.userData.setOpen = rs.setOpen; g.userData.collider = rs.collider;
    for (const s of [-1, 1]) col(K, o, s * (w / 2 + 0.07) - 0.05, -0.06, s * (w / 2 + 0.07) + 0.05, 0.06, h);
  });
  // roller_door: garage / loading-dock door. opts w (3), h (2.4), open (0..1), color (Colorbond panel colour)
  def('roller_door', { collide: false }, (K, o, g) => {
    const w = o.w ?? 3, h = o.h ?? 2.4;
    const rs = rollerBuild(K, o, g, w, h, 0, 0, 0, { tex: corrugTex('#b9bcb4'), color: o.color || '#d8d6cc', housing: { tex: 'metal', color: '#6d726c' } });
    rs.setOpen(o.open ?? 0);
    g.userData.setOpen = rs.setOpen; g.userData.collider = rs.collider;
    pl(g, w * 0.3, 1.1, 0.012, 0.3, 0.12, TM(labelTex('NO PARKING\nDRIVEWAY IN USE', 'label')));
    for (const s of [-1, 1]) col(K, o, s * (w / 2 + 0.07) - 0.05, -0.06, s * (w / 2 + 0.07) + 0.05, 0.06, h);
  });

  // awning: cantilevered shop verandah (corrugated roof, fascia, tie rods, soffit). opts w (6), d (2.2), h (3.0),
  // text (fascia sign), sign ({style,bg,fg}), hanging (under-awning blade sign text), color (fascia)
  def('awning', { collide: false }, (K, o, g) => {
    const w = o.w ?? 6, d = o.d ?? 2.2, h = o.h ?? 3.0;
    const fasc = { tex: 'metal', color: o.color || '#4e5a55', roughness: 0.6 };
    box(g, 0, h + 0.1, d / 2, w, 0.03, d, TM(corrugTex('#8a8f8a')), { rx: 4, uv: 1 / 0.8 });
    box(g, 0, h - 0.18, d - 0.02, w, 0.42, 0.05, fasc);
    box(g, 0, h - 0.06, d / 2, w, 0.02, d - 0.05, { color: '#bdb6a6', roughness: 0.9 });
    for (let x = -w / 2 + 0.6; x < w / 2; x += 1.6) { rod(g, [x, h + 1.0, 0.02], [x, h + 0.1, d - 0.08], 0.012, M.steelDk, { seg: 6 }); box(g, x, h + 0.92, 0.0, 0.08, 0.16, 0.04, M.steelDk); }
    // the sign width is quantised to 0.5 m so shopfronts of similar widths share one texture
    if (o.text) K.sign(o.text, 0, h + 0.03, d + 0.01, Math.max(1, Math.round((w - 0.4) * 2) / 2), 0.36, { style: (o.sign && o.sign.style) || 'shop', bg: o.sign && o.sign.bg, fg: o.sign && o.sign.fg, back: false });
    if (o.hanging) {
      for (const s of [-1, 1]) rod(g, [s * 0.5, h - 0.06, d - 0.5], [s * 0.5, h - 0.28, d - 0.5], 0.006, M.steel, { seg: 4 });
      K.sign(o.hanging, 0, h - 0.46, d - 0.5, 1.2, 0.34, { style: 'shop', double: true, depth: 0.02 });
    }
  });

  // --- window display contents (also used inside shopfronts) ---
  const productTex = () => ctex('products', 512, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#d8d4c8'; ctx.fillRect(0, 0, w, h);
    const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#e67e22', '#8e44ad', '#ecf0f1', '#16a085', '#d35400'];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) {
      const x = i * (w / 12) + 2, y = row * (h / 4) + 6, bw = w / 12 - 4, bh = h / 4 - 10;
      ctx.fillStyle = pick(cols, r); ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x + 3, y + bh * 0.4, bw - 6, bh * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 5, y + bh * 0.46, bw * 0.5, 2);
    }
    ctx.fillStyle = 'rgba(214,208,190,0.35)'; ctx.fillRect(0, 0, w, h);    // sun-faded
  });
  const magsTex = () => ctex('mags', 512, 256, (ctx, w, h, r) => {
    const heads = ['WHEELS', 'TV WEEK', 'NEW IDEA', 'FISHING', 'GARDEN', 'FOOTY', 'GOSSIP', 'KNITTING'];
    for (let i = 0; i < 16; i++) {
      const x = (i % 8) * (w / 8), y = Math.floor(i / 8) * (h / 2), bw = w / 8, bh = h / 2;
      ctx.fillStyle = `hsl(${r() * 360},${30 + r() * 30}%,${45 + r() * 20}%)`; ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 8, y + bh * 0.3, bw - 16, bh * 0.45);
      txt(ctx, pick(heads, r), x + bw / 2, y + 26, { size: 15, font: F.heavy, color: '#fff', align: 'center' });
    }
    ctx.fillStyle = 'rgba(220,214,190,0.45)'; ctx.fillRect(0, 0, w, h);
  });
  function displayBuild(K, o, p, w, v, r) {
    const d = 0.7;
    box(p, 0, 0, -d / 2, w, 0.45, d, { tex: 'fabric_knit', color: v === 'phones' ? '#1d5c5e' : '#5d5a52', roughness: 0.95 }, { uv: 0.3 });
    const top = 0.45;
    if (v === 'phones') {
      for (let i = 0; i < 5; i++) {
        const x = -w / 2 + 0.35 + (i * (w - 0.7)) / 4;
        box(p, x, top, -0.3, 0.12, 0.02, 0.1, { color: '#e8e8e8', roughness: 0.1, transparent: true, opacity: 0.5 });
        add(p, gBox(0.075, 0.15, 0.008), { color: '#16191a', roughness: 0.3 }, x, top + 0.1, -0.3, { rx: -12 });
        pl(p, x, top + 0.101, -0.2955, 0.066, 0.135, TM(lockTex('--:--'), { roughness: 0.3 }), { rx: -12 });
        pl(p, x, top + 0.012, -0.2, 0.08, 0.05, TM(labelTex('$' + (29 + Math.floor(r() * 60)) + '/mth', 'label')), { rx: -60 });
      }
      pl(p, w * 0.3, top + 0.55, -0.62, 0.5, 0.7, TM(Tex.poster(null, { kind: 'faded', seed: 3 })), { ry: -8 });
    } else if (v === 'pharmacy') {
      for (let s = 0; s < 3; s++) { box(p, 0, top + 0.35 + s * 0.4, -0.55, w - 0.2, 0.012, 0.28, { color: '#cfe0dc', roughness: 0.1, transparent: true, opacity: 0.45 }); box(p, 0, top + 0.36 + s * 0.4, -0.58, w - 0.3, 0.14, 0.12, TM(productTex()), { uv: false }); }
      for (const s of [-1, 1]) box(p, s * (w / 2 - 0.12), top, -0.55, 0.02, 1.4, 0.02, M.chrome);
    } else if (v === 'news') {
      box(p, 0, top, -0.55, w - 0.3, 0.9, 0.06, { color: '#6a6458', roughness: 0.8 }, { rx: -18 });
      box(p, 0, top + 0.05, -0.5, w - 0.4, 0.8, 0.012, TM(magsTex()), { rx: -18, uv: false });
      for (let i = 0; i < 4; i++) box(p, -w / 2 + 0.4 + i * 0.35, top, -0.18, 0.3, 0.05 + r() * 0.08, 0.42, { tex: 'paper', color: '#d8d0b4' }, { ry: (r() - 0.5) * 10 });
    } else if (v === 'bank') {
      box(p, w * 0.3, top, -0.35, 0.3, 0.9, 0.25, M.alu);
      box(p, w * 0.3, top + 0.5, -0.32, 0.26, 0.32, 0.16, TM(magsTex()), { rx: -15, uv: false });
      pl(p, -w * 0.2, top + 0.6, -0.62, 0.6, 0.8, TM(Tex.poster('HOME LOANS\nMADE SIMPLE', { kind: 'notice', seed: 9 })));
    } else {
      for (let i = 0; i < 3; i++) flat(p, (r() - 0.5) * (w - 0.6), top + 0.002 + i * 0.001, -0.3 - r() * 0.3, 0.21, 0.3, 'paper', { ry: r() * 360 });
      box(p, -w * 0.25, top, -0.4, 0.5, 0.36, 0.36, 'cardboard', { ry: 12 });
    }
  }
  // window_display: shop window contents. opts w (2.4), variant 'phones'|'pharmacy'|'news'|'bank'|'empty'
  def('window_display', { collide: false }, (K, o, g) => displayBuild(K, o, grp(g, 0, 0, 0.35), o.w ?? 2.4, o.variant || 'empty', rngOf(K, o, 'wd')));

  // --- paper for shop windows ---
  const lockTex = (time) => ctex('lock|' + time, 128, 256, (ctx, w, h) => paintLock(ctx, w, h, time));
  const newspaperTex = (head, date) => ctex(`news|${head}|${date}`, 384, 512, (ctx, w, h, r) => {
    ctx.fillStyle = '#e9e0c4'; ctx.fillRect(0, 0, w, h);
    txt(ctx, 'The Signal Hill Star', w / 2, 46, { size: 36, font: F.serif, weight: 'bold', color: '#1d1a14', align: 'center' });
    ctx.fillStyle = '#1d1a14'; ctx.fillRect(16, 56, w - 32, 2); ctx.fillRect(16, 76, w - 32, 1);
    txt(ctx, date, 20, 71, { size: 11, font: F.serif, color: '#333' }); txt(ctx, '40c', w - 20, 71, { size: 11, font: F.serif, color: '#333', align: 'right' });
    const lines = String(head).split('\n');
    const s = fit(ctx, lines, w - 36, 120, (q) => `900 ${q}px ${F.heavy}`, 54);
    lines.forEach((l, i) => txt(ctx, l, w / 2, 90 + s + i * s * 1.08, { size: s, font: F.heavy, weight: '900', color: '#141210', align: 'center' }));
    const py = 110 + lines.length * s * 1.08;
    ctx.fillStyle = '#8f8a7c'; ctx.fillRect(20, py, w * 0.58, 150);
    ctx.fillStyle = '#6c685c'; ctx.fillRect(40, py + 60, w * 0.5, 70); for (let i = 0; i < 9; i++) ctx.fillRect(46 + i * 22, py + 40, 12, 22);
    txt(ctx, 'The exchange on Exchange Road, 1961.', 20, py + 166, { size: 10, font: F.serif, color: '#333' });
    for (let c = 0; c < 3; c++) for (let i = 0; i < 16; i++) { const x = c === 2 ? w * 0.64 : 20 + c * (w * 0.3), y = (c === 2 ? py : py + 180) + i * 11; if (y > h - 12) continue; ctx.fillStyle = 'rgba(40,36,28,0.55)'; ctx.fillRect(x, y, (c === 2 ? w * 0.32 : w * 0.28) * (0.7 + r() * 0.3), 4); }
    TU.age(ctx, w, h, r, 1.3, { sun: 0.5 });
    ctx.fillStyle = 'rgba(214,190,120,0.25)'; ctx.fillRect(0, 0, w, h);
    for (const [x, y] of [[10, 6], [w - 50, 6]]) { ctx.fillStyle = 'rgba(230,220,180,0.7)'; ctx.fillRect(x, y, 40, 14); }
  });
  const noticeTex = (text) => ctex('notice|' + text, 256, 362, (ctx, w, h, r) => {
    ctx.fillStyle = '#f0eee6'; ctx.fillRect(0, 0, w, h);
    ctx.font = `bold 22px ${F.sans}`;
    const lines = TU.wrapText(ctx, text, w - 50);
    lines.forEach((l, i) => txt(ctx, l, w / 2, 80 + i * 30, { size: 22, font: F.sans, weight: 'bold', color: '#1c1c1c', align: 'center' }));
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(40, 50, w - 80, 2);
    txt(ctx, 'We apologise for any inconvenience.', w / 2, h - 60, { size: 12, font: F.sans, color: '#333', align: 'center' });
    for (const [x, y] of [[8, 4], [w - 48, 4]]) { ctx.fillStyle = 'rgba(230,222,190,0.8)'; ctx.fillRect(x, y, 40, 12); }
    TU.age(ctx, w, h, r, 1.0, { sun: 0.3 });
  });
  const SHOP = {
    shop: { name: 'GENERAL STORE', bg: '#2f3b39', fg: '#dcd3b8', facade: 'render_cracked', display: 'empty' },
    repair: { name: 'HILLTOP MOBILE REPAIRS', bg: '#1f4b73', fg: '#eef2f0', facade: 'render_cracked', display: 'phones', shutter: 1 },
    bank: { name: 'BANK', bg: '#23324f', fg: '#e8e2cc', facade: { tex: 'concrete', color: '#cdbd9c' }, display: 'bank', notice: 'This branch has closed. Visit us online.' },
    newsagent: { name: 'NEWSAGENCY', bg: '#6d1d1a', fg: '#f1e9d2', facade: 'brick', display: 'news', newspaper: ['EXCHANGE AUTOMATED:\n40 JOBS GONE', 'Tuesday, 3 March 1987'] },
    pharmacy: { name: 'PHARMACY', bg: '#1f6b3c', fg: '#f2f4ee', facade: 'render_cracked', display: 'pharmacy', poster: 'Medical alarm batteries. Ask in store.', posterKind: 'alarm' },
    optus: { name: 'optus', style: 'optus', facade: { tex: 'tile_white' }, display: 'phones', indoor: true },
    stall: { name: 'NOODLE BAR', bg: '#7a2a1a', fg: '#f4e2b0', facade: { tex: 'tile_white' }, display: 'empty', indoor: true, shutter: 1 },
    vacant: { name: '', bg: '#2f3b39', fg: '#dcd3b8', facade: 'render_cracked', display: 'empty', lease: true },
  };
  // shopfront: facade segment, street side +Z, building behind (−Z): pilasters, parapet, stallboard, glazing with an
  // aluminium door, shallow dark interior + window display, sign on an awning fascia (or bulkhead when indoor).
  // opts w (6), h (4.4), name, variant 'shop'|'repair'|'bank'|'newsagent'|'pharmacy'|'optus'|'stall'|'vacant',
  // shutter (true|0..1 closed), door ('left'|'center'|'right'|false), awning (bool), indoor (concourse shopfront),
  // poster (text) + posterKind, notice (text), newspaper ([headline, date]), lit (interior glow), number
  def('shopfront', {}, (K, o, g) => {
    const v = o.variant || 'shop', P = SHOP[v] || SHOP.shop, r = rngOf(K, o, 'sf');
    const w = o.w ?? 6, indoor = o.indoor ?? !!P.indoor, H = o.h ?? (indoor ? 3.6 : 4.4);
    const name = o.name ?? P.name, pw = 0.36, ow = w - pw * 2;
    const fac = o.facade || P.facade;
    const alu = M.alu;
    // pilasters, upper wall, parapet cap
    for (const s of [-1, 1]) box(g, s * (w / 2 - pw / 2), 0, -0.14, pw, H, 0.44, fac);
    box(g, 0, 3.0, -0.14, ow, H - 3.0, 0.4, fac);
    if (!indoor) { box(g, 0, H, -0.14, w + 0.08, 0.12, 0.5, 'concrete'); box(g, 0, 3.0, 0.06, ow, 0.08, 0.06, 'concrete'); }
    // stallboard (small dark tiles) and the glazing frame
    box(g, 0, 0, -0.04, ow, 0.5, 0.1, { tex: 'tile', color: '#4c5552' }, { uv: 2 });
    const doorSide = o.door === false ? null : (o.door || (w < 4.5 ? 'right' : 'center'));
    const dw = 0.95, dx = doorSide === 'left' ? -ow / 2 + dw / 2 + 0.1 : doorSide === 'right' ? ow / 2 - dw / 2 - 0.1 : 0;
    box(g, 0, 2.72, 0, ow, 0.07, 0.1, alu);
    box(g, 0, 0.5, 0, ow, 0.05, 0.1, alu);
    for (const s of [-1, 1]) box(g, s * (ow / 2 - 0.03), 0.5, 0, 0.06, 2.25, 0.1, alu);
    box(g, 0, 2.79, 0, ow, 0.2, 0.02, 'glass', { cast: false });
    // glass panes either side of the door
    const panes = [];
    if (doorSide) { const l0 = -ow / 2 + 0.06, l1 = dx - dw / 2, r0 = dx + dw / 2, r1 = ow / 2 - 0.06; if (l1 - l0 > 0.2) panes.push([l0, l1]); if (r1 - r0 > 0.2) panes.push([r0, r1]); } else panes.push([-ow / 2 + 0.06, ow / 2 - 0.06]);
    for (const [a, b] of panes) { box(g, (a + b) / 2, 0.55, 0, b - a, 2.17, 0.012, 'glass', { cast: false }); if (b - a > 2.4) box(g, (a + b) / 2, 0.55, 0, 0.05, 2.17, 0.08, alu); }
    if (doorSide) {
      for (const s of [-1, 1]) box(g, dx + s * (dw / 2 + 0.02), 0, 0, 0.05, 2.72, 0.1, alu);
      box(g, dx, 0, -0.02, dw - 0.04, 0.12, 0.06, alu); box(g, dx, 2.1, -0.02, dw - 0.04, 0.08, 0.06, alu);
      for (const s of [-1, 1]) box(g, dx + s * (dw / 2 - 0.05), 0, -0.02, 0.06, 2.16, 0.06, alu);
      box(g, dx, 0.12, -0.02, dw - 0.14, 1.98, 0.012, 'glass', { cast: false });
      box(g, dx + dw * 0.32, 0.9, 0.03, 0.03, 0.5, 0.03, M.chrome);
      pl(g, dx, 1.55, 0.0, 0.26, 0.11, TM(Tex.sign('CLOSED', { style: 'shop', w: 0.26, h: 0.11, bg: '#8a1f1a', fg: '#f4efe4', border: false })), { rz: 3 });
      pl(g, dx - 0.2, 1.15, 0.0, 0.14, 0.2, TM(noticeTex('TRADING HOURS\nMon–Fri 9–5\nSat 9–12\nSun CLOSED')), {});
      pl(g, dx + 0.28, 1.2, 0.0, 0.1, 0.06, TM(labelTex('MONITORED\n24 / 7', 'red')), {});
    }
    // dark interior behind the glass
    const inD = 2.6, lit = !!o.lit;
    const inMat = lit ? { color: '#9fb4b0', emissive: '#6f8c88', emissiveIntensity: 0.35, roughness: 0.9, outage: false } : { color: '#1b1d1c', roughness: 0.95 };
    pl(g, 0, 1.45, -inD, ow, 2.9, inMat, {});
    flat(g, 0, 0.01, -inD / 2, ow, inD, { tex: 'lino', color: '#6f6f68' }, {});
    add(g, gPlane(ow, inD), { color: '#141515', roughness: 1 }, 0, 2.9, -inD / 2, { rx: 90, cast: false });
    for (const s of [-1, 1]) pl(g, s * ow / 2, 1.45, -inD / 2, inD, 2.9, inMat, { ry: -s * 90 });
    if (!(o.shutter ?? P.shutter)) {
      displayBuild(K, o, grp(g, doorSide === 'left' ? ow * 0.15 : doorSide === 'right' ? -ow * 0.15 : 0, 0, -0.08), Math.min(2.8, ow * 0.6), o.display || P.display, r);
      if (v === 'phones' || P.display === 'phones') for (let i = 0; i < 2; i++) box(g, -ow / 3 + i * (ow * 0.66), 0, -1.9, 1.4, 0.9, 0.7, { color: '#dcdad2', roughness: 0.5 });
      else box(g, 0, 0, -2.3, ow * 0.8, 1.9, 0.4, { tex: 'metal', color: '#4d524f' });
    }
    // window paper: poster, notice, newspaper, lease sign
    const poster = o.poster ?? P.poster, notice = o.notice ?? P.notice, np = o.newspaper ?? P.newspaper;
    const px = panes.length ? (panes[0][0] + panes[0][1]) / 2 : 0;
    if (poster) pl(g, px, 1.55, -0.02, 0.6, 0.85, TM(Tex.poster(poster, { kind: o.posterKind || P.posterKind || 'notice', seed: 12 })), {});
    if (notice) pl(g, px + (poster ? 0.55 : 0), 1.5, -0.015, 0.3, 0.42, TM(noticeTex(notice)), { rz: -2 });
    if (np) pl(g, panes.length > 1 ? (panes[1][0] + panes[1][1]) / 2 : px, 1.45, -0.015, 0.44, 0.58, TM(newspaperTex(np[0], np[1] || 'Tuesday, 3 March 1987')), { rz: 1.5 });
    if (P.lease || o.lease) { pl(g, px, 1.6, -0.015, 0.8, 0.5, TM(Tex.sign('FOR LEASE\nCALL 04 2231 1947', { style: 'council', w: 0.8, h: 0.5, header: 'HILL REAL ESTATE' }))); box(g, 0, 0.55, -0.01, ow - 0.1, 2.1, 0.004, { color: '#d9d6cc', roughness: 1, transparent: true, opacity: 0.55 }, { cast: false }); }
    if (v === 'pharmacy') { const cx = w / 2 - 0.2; box(g, cx, 3.15, 0.1, 0.5, 0.5, 0.12, { color: '#e8e8e2' }); for (const [a, b] of [[0.42, 0.14], [0.14, 0.42]]) box(g, cx, 3.4 - b / 2, 0.165, a, b, 0.012, glowS('#2fae5a', o.lit ? 1.2 : 0.35)); }
    // roller shutter
    const sh = o.shutter ?? P.shutter;
    if (sh) {
      const rs = rollerBuild(K, o, g, ow, 2.72, 0, 0.12, 0, { collide: false });
      rs.setOpen(1 - (sh === true ? 1 : clamp(Number(sh))));
      g.userData.setShutter = (closed) => rs.setOpen(1 - closed);
      if (!indoor) pl(g, ow * 0.2, 1.3, 0.14, 0.5, 0.18, paintMat(pick(['NO JUNK', 'CLOSED', '4 LEASE'], r), '#2a2a2a', F.marker), { rz: -4 });
    }
    // sign: awning fascia outdoors, bulkhead indoors
    const signStyle = P.style || 'shop';
    if (indoor || o.awning === false) {
      if (name) K.sign(name, 0, 3.25, 0.08, Math.min(ow - 0.3, 3.2), 0.44, { style: signStyle, bg: o.bg || P.bg, fg: o.fg || P.fg, emissive: lit ? 0.6 : undefined });
    } else {
      K.prop('awning', 0, 0.08, 0, { w: w + 0.1, d: 2.3, h: 3.05, text: name || undefined, sign: { style: signStyle, bg: o.bg || P.bg, fg: o.fg || P.fg }, collide: false });
    }
    if (o.number) pl(g, w / 2 - pw / 2, 2.2, 0.085, 0.18, 0.12, TM(plateTex(String(o.number), '#1c2424', '#e9e4d6')));
    col(K, o, -w / 2, -0.38, w / 2, 0.1, H);
  });

  // --- houses ---------------------------------------------------------------------------------------------------
  // hip roof over a w×d plan (eaves overhang e), ridge along the long side, world-ish UVs for the roof texture
  function gHipRoof(w, d, rh, e = 0.45, s = 1) {
    return cg(`hip${q3(w)},${q3(d)},${q3(rh)},${q3(e)},${q3(s)}`, () => {
      const W = w + e * 2, D = d + e * 2, rl = Math.max(0.05, Math.abs(W - D));
      const g = W >= D ? gTaperRaw(W, D, rl, 0.04, rh) : gTaperRaw(W, D, 0.04, rl, rh);
      const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i)); uv.setXY(i, (ax > az ? p.getZ(i) : p.getX(i)) * s, p.getY(i) * 1.4 * s); }
      return g;
    });
  }
  function gTaperRaw(wb, db, wt, dt, h) { const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const top = p.getY(i) > 0; p.setXYZ(i, p.getX(i) * (top ? wt : wb), top ? h : 0, p.getZ(i) * (top ? dt : db)); } g.computeVertexNormals(); return g; }
  const curtainTex = (c) => ctex('curtain|' + c, 128, 128, (ctx, w, h, r) => {
    const base = TU.hex(c);
    for (let x = 0; x < w; x++) { const k = 0.75 + 0.25 * Math.sin((x / w) * TAU * 6 + Math.sin(x * 0.2)); ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; ctx.fillRect(x, 0, 1, h); }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, oct: 3 }), 0.2);
  }, { wrap: true, size: 1 });
  // a window: frame, glass, curtain behind; faces +Z at (x, sill y, z) in p
  function houseWindow(p, x, y, z, ww, wh, frameM, r, lit = false) {
    box(p, x, y - 0.06, z + 0.05, ww + 0.16, 0.06, 0.1, frameM);
    box(p, x, y + wh, z + 0.03, ww + 0.14, 0.08, 0.06, frameM);
    for (const s of [-1, 1]) box(p, x + s * (ww / 2 + 0.035), y, z + 0.03, 0.07, wh, 0.06, frameM);
    box(p, x, y + wh / 2 - 0.02, z + 0.03, ww, 0.05, 0.05, frameM);
    const cc = pick(['#8a7a62', '#6c5a4a', '#8c8a7c', '#5e6a64', '#8a6a5a'], r);
    pl(p, x, y + wh / 2, z + 0.004, ww, wh, lit ? TM(curtainTex(cc), { emissive: 0.45, roughness: 0.95 }) : TM(curtainTex(cc), { roughness: 0.95 }), {});
    box(p, x, y, z + 0.012, ww, wh, 0.008, { color: '#1a2224', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.62 }, { cast: false });
  }
  function houseBuild(K, o, g, cfg) {
    const r = rngOf(K, o, 'house');
    const w = o.w ?? cfg.w, d = o.d ?? cfg.d, v = cfg.variant;
    const brick = v === 'brick';
    const base = brick ? 0.15 : (cfg.raised ?? 0.5), wallH = 2.7;
    const paint = o.color || pick(['#d6d1c3', '#c9c2a8', '#b8c4be', '#cdb9a5', '#bfc6cc', '#d8cfb4'], r);
    const wallM = brick ? { tex: 'brick', color: '#c9b5a3' } : { tex: 'weatherboard', color: paint };
    const trim = { color: brick ? '#e1ddd0' : '#ece8dc', roughness: 0.7 };
    // base / stumps
    if (brick) box(g, 0, 0, 0, w + 0.06, base, d + 0.06, 'concrete');
    else { box(g, 0, 0, 0, w, base, d, 'brick'); for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2) box(g, x, 0.08, d / 2 + 0.001, 0.8, base - 0.16, 0.012, { color: '#5b574d', roughness: 0.9 }, { cast: false }); }
    box(g, 0, base, 0, w, wallH, d, wallM);
    box(g, 0, base + wallH - 0.05, 0, w + 0.06, 0.05, d + 0.06, trim);
    // roof
    const rh = cfg.roofH ?? 1.7, roofC = o.roof || (brick ? '#7a4a3a' : pick(['#6f3b30', '#6d736e', '#4f5a55', '#8a8a84'], r));
    add(g, gHipRoof(w, d, rh, 0.45, 1 / 0.8), TM(corrugTex(roofC), { roughness: 0.7, metalness: 0.2 }), 0, base + wallH, 0, {});
    // gutters
    for (const s of [-1, 1]) { box(g, 0, base + wallH - 0.14, s * (d / 2 + 0.47), w + 0.94, 0.12, 0.1, M.galv); box(g, s * (w / 2 + 0.47), base + wallH - 0.14, 0, 0.1, 0.12, d + 0.94, M.galv); }
    for (const [x, z] of [[-w / 2 - 0.05, d / 2 + 0.05], [w / 2 + 0.05, -d / 2 - 0.05]]) cyl(g, x, 0.1, z, 0.045, base + wallH - 0.2, M.galv, { seg: 8 });
    if (cfg.chimney) { box(g, w * 0.25, base + wallH - 0.2, -d * 0.1, 0.55, rh + 1.1, 0.5, 'brick'); box(g, w * 0.25, base + wallH + rh + 0.9, -d * 0.1, 0.65, 0.08, 0.6, 'concrete'); }
    // front: door (centre or offset), windows either side
    const doorX = cfg.doorX ?? (cfg.verandah ? 0 : -w * 0.22), fz = d / 2;
    const doorM = { tex: 'wood', light: '#8a5a3a', dark: '#5a3a26' };
    box(g, doorX, base, fz - 0.02, 1.02, 2.18, 0.08, trim);
    box(g, doorX, base, fz, 0.86, 2.08, 0.05, o.door || doorM);
    box(g, doorX, base + 0.95, fz + 0.03, 0.02, 0.02, 0.04, M.chrome);
    box(g, doorX + 0.33, base + 1.0, fz + 0.035, 0.03, 0.08, 0.03, { tex: 'metal', color: '#b89a52', metalness: 0.7, roughness: 0.35 });
    if (o.number !== undefined) pl(g, doorX + 0.62, base + 1.6, fz + 0.012, 0.18, 0.16, TM(plateTex(String(o.number), '#2a2622', '#e6ddc6', 128, 112)), {});
    // security screen door
    box(g, doorX, base, fz + 0.09, 0.9, 2.1, 0.02, { tex: 'grille', color: '#8a8f8c' }, { uv: 2 });
    const wins = cfg.verandah ? [-w * 0.3, w * 0.3] : w >= 8 ? [w * 0.08, w * 0.33] : [w * 0.2];
    for (const wx of wins) houseWindow(g, wx, base + 0.95, fz, 1.2, 1.25, trim, r, !!o.lit && r() < 0.5);
    for (const s of [-1, 1]) houseWindow(grp(g, s * w / 2, 0, 0, s * 90), 0, base + 0.95, 0, 1.0, 1.1, trim, r);
    // steps
    const steps = Math.max(1, Math.round(base / 0.17));
    for (let i = 0; i < steps; i++) box(g, doorX, 0, fz + 0.15 + i * 0.28, 1.2, (base * (steps - i)) / steps, 0.3, 'concrete');
    // porch / verandah
    if (cfg.verandah) {
      const vd = 1.8;
      box(g, 0, base - 0.08, fz + vd / 2, w, 0.08, vd, { tex: 'timber_floor' });
      for (const x of [-w / 2 + 0.1, -w / 6, w / 6, w / 2 - 0.1]) box(g, x, base, fz + vd - 0.1, 0.1, 2.3, 0.1, trim);
      box(g, 0, base + 2.3, fz + vd / 2, w + 0.2, 0.1, vd + 0.1, trim);
      box(g, 0, base + 2.4, fz + vd / 2 - 0.05, w + 0.3, 0.04, vd + 0.3, TM(corrugTex(roofC), { roughness: 0.7 }), { rx: 8, uv: 1 / 0.8 });
      for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.12) if (Math.abs(x - doorX) > 0.7) box(g, x, base, fz + vd - 0.1, 0.03, 0.85, 0.03, trim);
      box(g, 0, base + 0.85, fz + vd - 0.1, w, 0.05, 0.08, trim);
    } else {
      box(g, doorX, base + 2.35, fz + 0.6, 1.8, 0.06, 1.3, TM(corrugTex(roofC), { roughness: 0.7 }), { rx: 10, uv: 1 / 0.8 });
      for (const s of [-1, 1]) box(g, doorX + s * 0.8, 0, fz + 1.15, 0.08, base + 2.3, 0.08, trim);
    }
    // meter box, tap, porch light
    box(g, doorX + 1.2, base + 1.1, fz + 0.03, 0.45, 0.6, 0.12, { tex: 'metal', color: '#b8b9b0' });
    cyl(g, doorX - 1.3, base + 0.35, fz + 0.03, 0.015, 0.1, M.chrome, { rx: 90, seg: 6 });
    const plm = o.lit ? glowMat('#ffcf8a', 1.8) : { color: '#d8d2c0', roughness: 0.4 };
    sph(g, doorX - 0.6, base + 2.25, fz + 0.12, 0.08, plm, { seg: 10 });
    if (o.lit) Render.halo([doorX - 0.6, base + 2.25, fz + 0.2], { parent: g, color: '#ffcf8a', size: 1.2, opacity: 0.4 });
    // TV antenna
    if (r() < 0.7) { const ax = w * 0.2, ay = base + wallH + rh * 0.8; rod(g, [ax, ay - 0.6, 0], [ax, ay + 1.4, 0], 0.02, M.galv); rod(g, [ax, ay + 1.3, -0.8], [ax, ay + 1.3, 0.8], 0.012, M.galv); for (let k = -3; k <= 3; k++) rod(g, [ax - 0.35, ay + 1.3, k * 0.22], [ax + 0.35, ay + 1.3, k * 0.22], 0.006, M.galv, { seg: 4 }); }
    // rainwater tank beside the house
    if (cfg.tank !== false && r() < 0.6) { const tx = w / 2 + 0.9; cyl(g, tx, 0, -d * 0.2, 0.75, 1.9, TM(corrugTex('#7d8580')), { seg: 18, uv: 1 / 0.8 }); cyl(g, tx, 1.9, -d * 0.2, 0.78, 0.06, { tex: 'metal', color: '#6d726e' }, { seg: 18 }); col(K, o, tx - 0.75, -d * 0.2 - 0.75, tx + 0.75, -d * 0.2 + 0.75, 2); }
    col(K, o, -w / 2 - 0.05, -d / 2 - 0.05, w / 2 + 0.05, d / 2 + 0.05, base + wallH + rh);
    const sd = cfg.verandah ? 1.8 : 0.3 + steps * 0.28;
    if (cfg.verandah) { col(K, o, -w / 2, fz, doorX - 0.6, fz + 1.8, base + 0.9); col(K, o, doorX + 0.6, fz, w / 2, fz + 1.8, base + 0.9); } else col(K, o, doorX - 0.6, fz, doorX + 0.6, fz + sd, base);
  }
  // house: weatherboard house on stumps (or brick unit). opts w (10), d (9), variant 'weatherboard'|'brick', color, roof,
  // number (door plate), lit (porch light + a lit window), door (material spec)
  def('house', {}, (K, o, g) => houseBuild(K, o, g, { w: 10, d: 9, variant: o.variant === 'brick' ? 'brick' : 'weatherboard', raised: 0.5 }));
  // cottage: small weatherboard operator's cottage, full-width front verandah, chimney. opts w (7), d (7.5), color, number
  def('cottage', {}, (K, o, g) => houseBuild(K, o, g, { w: 7, d: 7.5, variant: 'weatherboard', raised: 0.6, verandah: true, chimney: true, roofH: 1.9, tank: true }));

  // hut: equipment hut (concrete plinth, colorbond walls, steel door with RF/authorised signs, vents, AC unit, cable
  // entry). opts w (3), d (2.4), h (2.6), text (door stencil, 'HUT 2')
  def('hut', { collide: true }, (K, o, g) => {
    const w = o.w ?? 3, d = o.d ?? 2.4, H = o.h ?? 2.6;
    box(g, 0, 0, 0, w + 0.3, 0.2, d + 0.3, 'concrete');
    box(g, 0, 0.2, 0, w, H, d, TM(corrugTex('#c9c4b2'), { roughness: 0.7, metalness: 0.1 }), { uv: 1 / 0.8 });
    box(g, 0, 0.2 + H, 0, w + 0.3, 0.12, d + 0.3, { tex: 'metal', color: '#8a8d86' }, { rx: -2 });
    for (const [x0, z0] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) box(g, x0, 0.2, z0, 0.06, H, 0.06, { tex: 'metal', color: '#9a9888' });
    const dz = d / 2 + 0.01;
    box(g, 0, 0.2, dz, 1.0, 2.15, 0.06, paint('#6f7c76', 0.6));
    box(g, 0.38, 1.2, dz + 0.04, 0.12, 0.04, 0.04, M.chrome);
    box(g, 0.38, 1.35, dz + 0.035, 0.1, 0.12, 0.02, M.steelDk);
    pl(g, 0, 1.75, dz + 0.035, 0.5, 0.36, TM(Tex.sign('DANGER\nRF RADIATION', { style: 'warning', w: 0.5, h: 0.36 })), {});
    pl(g, 0, 1.3, dz + 0.035, 0.46, 0.14, TM(Tex.sign('AUTHORISED PERSONNEL ONLY', { style: 'council', w: 0.46, h: 0.14 })), {});
    pl(g, 0, 0.8, dz + 0.035, 0.4, 0.12, paintMat(o.text ?? 'HUT 2', '#f0ece0', F.heavy), {});
    for (const s of [-1, 1]) box(g, s * (w / 2 - 0.45), 1.8, dz, 0.45, 0.3, 0.02, { tex: 'grille', color: '#7a7c76' }, { uv: 2 });
    box(g, w / 2 + 0.2, 0.9, 0, 0.35, 0.6, 0.8, { color: '#dedcd2', roughness: 0.5 });
    box(g, w / 2 + 0.38, 0.95, 0, 0.012, 0.5, 0.6, { tex: 'grille' }, { uv: 2 });
    box(g, 0, H - 0.2, -d / 2 - 0.15, 0.6, 0.12, 0.3, M.galv);
    for (let i = 0; i < 4; i++) cylc(g, -0.2 + i * 0.13, H - 0.35, -d / 2 - 0.12, 0.03, 0.3, M.black, { seg: 6 });
  });

  // substation: fenced transformer yard on gravel — transformer tank with radiator fins, bushings, conservator,
  // switch kiosk, DANGER signs. opts w (5), d (4)
  def('substation', { collide: false }, (K, o, g) => {
    const w = o.w ?? 5, d = o.d ?? 4;
    flat(g, 0, 0.012, 0, w, d, 'gravel', { uv: false });
    box(g, 0, 0, -0.2, 1.8, 0.2, 1.4, 'concrete');
    const tank = paint('#7a8a7e');
    box(g, 0, 0.2, -0.2, 1.3, 1.5, 0.9, tank);
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) box(g, -0.5 + i * 0.16, 0.35, -0.2 + s * 0.56, 0.04, 1.2, 0.22, tank);
    const glaze = { color: '#6a4a36', roughness: 0.25 };
    for (let i = 0; i < 3; i++) { const x = -0.4 + i * 0.4; for (let k = 0; k < 4; k++) cyl(g, x, 1.72 + k * 0.1, -0.35, 0.07 - k * 0.004, 0.08, glaze, { seg: 10 }); rod(g, [x, 2.14, -0.35], [x, 2.4, -0.35], 0.012, M.chrome, { seg: 5 }); }
    for (let i = 0; i < 3; i++) cyl(g, -0.3 + i * 0.3, 1.72, 0.05, 0.04, 0.2, glaze, { seg: 8 });
    cylc(g, 0, 2.15, 0.25, 0.22, 1.1, tank, { rz: 90, seg: 12 });
    for (const s of [-1, 1]) box(g, s * 0.45, 1.7, 0.2, 0.05, 0.3, 0.05, tank);
    box(g, w / 2 - 0.9, 0, d / 2 - 0.9, 1.0, 1.6, 0.6, paint('#4a6a52'));
    pl(g, w / 2 - 0.9, 1.2, d / 2 - 0.599, 0.3, 0.22, TM(Tex.sign('DANGER', { style: 'warning', w: 0.3, h: 0.22 })), {});
    // fence
    const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); K.prop('chainlink', (x0 + x1) / 2, (z0 + z1) / 2, (Math.atan2(z1 - z0, x1 - x0) * -180) / Math.PI, { len: L, h: 2.1, collide: false }); };
    fence(-w / 2, d / 2, -0.8, d / 2); fence(0.8, d / 2, w / 2, d / 2);
    fence(-w / 2, -d / 2, w / 2, -d / 2);
    fence(-w / 2, -d / 2, -w / 2, d / 2); fence(w / 2, d / 2, w / 2, -d / 2);
    // locked gate
    for (const s of [-1, 1]) { box(g, s * 0.4, 0.05, d / 2, 0.78, 1.95, 0.004, 'chainlink', { cast: false }); box(g, s * 0.4, 1.98, d / 2, 0.8, 0.04, 0.04, M.galv); box(g, s * 0.4, 0.05, d / 2, 0.8, 0.04, 0.04, M.galv); }
    box(g, 0, 1.0, d / 2 + 0.03, 0.05, 0.1, 0.04, M.steelDk);
    K.sign('DANGER\nHIGH VOLTAGE\nKEEP OUT', 0.9, 1.35, d / 2 + 0.03, 0.5, 0.42, { style: 'warning' });
    col(K, o, -w / 2, d / 2 - 0.06, w / 2, d / 2 + 0.06, 2.2); col(K, o, -w / 2, -d / 2 - 0.06, w / 2, -d / 2 + 0.06, 2.2);
    col(K, o, -w / 2 - 0.06, -d / 2, -w / 2 + 0.06, d / 2, 2.2); col(K, o, w / 2 - 0.06, -d / 2, w / 2 + 0.06, d / 2, 2.2);
  });

  // fountain: dry circular fountain — tiled basin, stained floor, central column with a bowl, leaves and coins.
  // opts radius (2.2), dry (true; false → dark still water)
  def('fountain', { collide: false }, (K, o, g) => {
    const Rr = o.radius ?? 2.2, n = 18, r = rngOf(K, o, 'ft');
    const tileM = { tex: 'tile', color: '#7d8f8c' }, cope = { tex: 'concrete', color: '#b8b2a4' };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * (Rr - 0.15), z = Math.sin(a) * (Rr - 0.15), segL = (TAU * Rr) / n + 0.05;
      box(g, x, 0, z, segL, 0.45, 0.3, tileM, { ry: (-a * 180) / Math.PI + 90 });
      box(g, Math.cos(a) * (Rr - 0.14), 0.45, Math.sin(a) * (Rr - 0.14), segL + 0.02, 0.07, 0.4, cope, { ry: (-a * 180) / Math.PI + 90 });
    }
    add(g, gCircle(Rr - 0.28, 24), o.dry === false ? { color: '#0c1211', roughness: 0.05, metalness: 0.3 } : { tex: 'concrete_wet', color: '#8a8a82' }, 0, o.dry === false ? 0.3 : 0.1, 0, { rx: -90, cast: false });
    add(g, gTorus(Rr - 0.35, 0.03, 4, 36), { color: '#5d5a4c', roughness: 1 }, 0, 0.26, 0, { rx: 90, cast: false });   // tide line stain
    cyl(g, 0, 0, 0, 0.3, 1.1, tileM, { seg: 14 });
    cyl(g, 0, 1.1, 0, 0.18, 0.05, cope, { seg: 14 });
    cyl(g, 0, 1.12, 0, 0.12, 0.2, cope, { r2: 0.9, seg: 18, open: true });
    cyl(g, 0, 1.13, 0, 0.12, 0.02, cope, { seg: 12 });
    add(g, gTorus(0.9, 0.035, 5, 24), cope, 0, 1.32, 0, { rx: 90 });
    cyl(g, 0, 1.32, 0, 0.06, 0.4, cope, { seg: 10 }); sph(g, 0, 1.74, 0, 0.08, cope, { seg: 10 });
    if (o.dry !== false) {
      for (let i = 0; i < 4; i++) { const a = r() * TAU, dd = 0.6 + r() * (Rr - 1.2); add(g, gSph(0.35 + r() * 0.3, 8, Math.PI / 2), { tex: 'leaves', opaque: true, uv: 1 }, Math.cos(a) * dd, 0.1, Math.sin(a) * dd, { s: [1, 0.22, 1], cast: false }); }
      for (let i = 0; i < 14; i++) { const a = r() * TAU, dd = 0.45 + r() * (Rr - 0.9); cyl(g, Math.cos(a) * dd, 0.102, Math.sin(a) * dd, 0.012, 0.003, { tex: 'metal', color: r() < 0.5 ? '#b9964a' : '#b9bcbc', metalness: 0.8, roughness: 0.3 }, { seg: 8, cast: false }); }
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; colR(K, o, Math.cos(a) * (Rr - 0.15), Math.sin(a) * (Rr - 0.15), (TAU * Rr) / 8 + 0.3, 0.4, (-a * 180) / Math.PI + 90, 0.5); }
    col(K, o, -0.3, -0.3, 0.3, 0.3, 1.8);
  });

  // escalator: dead escalator rising toward −Z from the origin (bottom landing); steps, glass balustrades, black
  // handrails, comb plates, and a chain across the entry with a CLOSED sign. opts h (rise 4.5), w (step width 1.0),
  // chain (true)
  def('escalator', { collide: false }, (K, o, g) => {
    const rise = o.h ?? 4.5, sw = o.w ?? 1.0, run = rise / Math.tan(R(30)), land = 1.1, W = sw + 0.3;
    const zTop = -(land + run), sideM = { tex: 'metal', color: '#8e9492', roughness: 0.45, metalness: 0.5 };
    // side trusses (extruded profile in the ZY plane)
    const prof = [[0, 0], [0, 0.95], [-land, 0.95], [-(land + run), rise + 0.95], [-(land * 2 + run), rise + 0.95], [-(land * 2 + run), rise - 0.35], [-(land + run) + 0.4, rise - 0.35], [-land + 0.4, -0.35], [0, -0.35]];
    for (const s of [-1, 1]) add(g, gExtrude('escside' + q3(rise), prof, 0.08), sideM, s * (W / 2 + 0.04), 0, 0, { ry: -90 });
    // steps
    const n = Math.round(rise / 0.2), stepM = { tex: 'metal', color: '#4f5553', roughness: 0.5, metalness: 0.5 }, cleat = { color: '#c9b12b', roughness: 0.5 };
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * (rise / n), z = -land - (i + 0.5) * (run / n);
      box(g, 0, y - 0.2, z, sw, 0.2, run / n + 0.005, stepM);
      box(g, 0, y - 0.004, z + run / n / 2 - 0.02, sw, 0.005, 0.03, cleat);
    }
    for (const [z0, y] of [[-land / 2, 0.0], [zTop - land / 2, rise]]) {
      box(g, 0, y, z0, sw + 0.3, 0.06, land, { tex: 'metal_grating', color: '#9aa09e' }, { uv: 2 });
      box(g, 0, y, z0 + (y ? land / 2 - 0.05 : -land / 2 + 0.05), sw + 0.3, 0.065, 0.1, cleat);
    }
    boxc(g, 0, rise / 2 - 0.3, -land - run / 2, W, 0.06, run / Math.cos(R(30)), sideM, { rx: 30 });
    // balustrades: glass along the incline + black handrail loop
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.02);
      const pts = [[x, 0.95, 0.05], [x, 1.0, -0.2], [x, 1.02, -land], [x, rise + 1.02, zTop], [x, rise + 1.02, zTop - land + 0.2], [x, rise + 0.95, zTop - land - 0.05]];
      tube(g, pts, 0.035, M.blackGloss, { key: `eschr${q3(rise)}|${s}`, radial: 6, seg: 40, tension: 0.2 });
      const gl = (a, b, hgt) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); boxc(g, x, (a[1] + b[1]) / 2 + hgt / 2, (a[0] + b[0]) / 2, 0.012, hgt, L, 'glass', { rx: (Math.atan2(b[1] - a[1], -(b[0] - a[0])) * 180) / Math.PI, cast: false }); };
      gl([-0.1, 0.1], [-land, 0.1], 0.85); gl([-land, 0.1], [zTop, rise + 0.1], 0.85); gl([zTop, rise + 0.1], [zTop - land + 0.2, rise + 0.1], 0.85);
    }
    // chain across the bottom entry with a sign
    if (o.chain !== false) {
      const L = W + 0.1, links = 18;
      for (const s of [-1, 1]) { cyl(g, s * (L / 2 + 0.05), 0, 0.5, 0.03, 0.95, M.chrome, { seg: 8 }); cyl(g, s * (L / 2 + 0.05), 0, 0.5, 0.12, 0.03, M.chrome, { seg: 12 }); }
      for (let i = 0; i < links; i++) { const t = (i + 0.5) / links, x = -L / 2 + t * L, y = 0.88 - Math.sin(t * Math.PI) * 0.18; add(g, gTorus(0.025, 0.006, 4, 8), M.chrome, x, y, 0.5, { ry: i % 2 ? 90 : 0, rz: 90, s: [1, 1.4, 1] }); }
      pl(g, 0, 0.62, 0.51, 0.36, 0.16, TM(Tex.sign('ESCALATOR\nCLOSED', { style: 'shop', w: 0.36, h: 0.16, bg: '#8a1f1a', fg: '#f4efe4', border: false })), {});
    }
    col(K, o, -W / 2 - 0.1, zTop - land * 2, W / 2 + 0.1, 0.55, rise + 1);
  });

  // planter: opts variant 'box' (concrete trough) | 'round' | 'pot' (terracotta), dead (twiggy dead shrub)
  def('planter', { collide: 'auto' }, (K, o, g) => {
    const v = o.variant || 'box', r = rngOf(K, o, 'pl');
    let top;
    if (v === 'round') { cyl(g, 0, 0, 0, 0.5, 0.55, 'concrete', { r2: 0.55, seg: 16 }); add(g, gCircle(0.5, 16), { tex: 'dirt' }, 0, 0.5, 0, { rx: -90, cast: false }); top = 0.5; }
    else if (v === 'pot') { cyl(g, 0, 0, 0, 0.2, 0.4, { color: '#a4583a', roughness: 0.8 }, { r2: 0.27, seg: 14 }); add(g, gCircle(0.25, 14), { tex: 'dirt' }, 0, 0.36, 0, { rx: -90, cast: false }); top = 0.36; }
    else { box(g, 0, 0, 0, 1.3, 0.55, 0.55, 'concrete'); flat(g, 0, 0.5, 0, 1.2, 0.45, { tex: 'dirt' }); top = 0.5; }
    if (o.dead !== false && r() < 0.6) {
      const tw = { color: '#4a3a2a', roughness: 0.9 };
      for (let i = 0; i < 6; i++) { const a = r() * TAU, l = 0.4 + r() * 0.5; rod(g, [(r() - 0.5) * 0.3, top, (r() - 0.5) * 0.15], [Math.cos(a) * l * 0.4, top + l, Math.sin(a) * l * 0.3], 0.01, tw, { r2: 0.003, seg: 4 }); }
    } else {
      const fol = foliageMat('#8a9a7c');
      for (let i = 0; i < 3; i++) pl(g, (r() - 0.5) * 0.4, top + 0.3, (r() - 0.5) * 0.1, 0.7, 0.6, fol, { ry: i * 60, cast: true });
    }
    for (let i = 0; i < 3; i++) flat(g, (r() - 0.5) * 0.8, top + 0.004, (r() - 0.5) * 0.2, 0.08, 0.1, { color: pick(['#c8c0a8', '#b3261e', '#e8e6dc'], r), roughness: 0.8 }, { ry: r() * 180 });
  });

  // gnome: garden gnome holding a little sign. opts text ('Welcome Friends')
  const gnomeSignTex = (t) => ctex('gnomesign|' + t, 192, 96, (ctx, w, h, r) => {
    ctx.fillStyle = '#b8966a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(80,56,30,0.3)'; ctx.fillRect(0, r() * h, w, 2); }
    hand(ctx, t, w / 2, h * 0.62, { size: 26, color: '#4a2a1a', font: F.hand, align: 'center', weight: 'bold' });
    TU.age(ctx, w, h, r, 1.2);
  });
  def('gnome', { collide: false }, (K, o, g) => {
    const chip = (c) => ({ color: c, roughness: 0.55 });
    box(g, -0.045, 0, 0.012, 0.065, 0.045, 0.1, chip('#3a2a1e')); box(g, 0.045, 0, 0.012, 0.065, 0.045, 0.1, chip('#3a2a1e'));
    cyl(g, 0, 0.04, 0, 0.095, 0.15, chip('#2f5f8a'), { r2: 0.078, seg: 14 });
    cyl(g, 0, 0.11, 0, 0.097, 0.025, chip('#3a2a1e'), { seg: 14 });
    box(g, 0, 0.113, 0.093, 0.03, 0.02, 0.008, chip('#c9a84a'));
    cyl(g, 0, 0.19, 0, 0.08, 0.05, chip('#b3372a'), { r2: 0.07, seg: 14 });
    sph(g, 0, 0.275, 0.0, 0.062, chip('#e2b89a'), { seg: 14 });
    sph(g, 0, 0.27, 0.062, 0.017, chip('#d88a78'), { seg: 8 });
    for (const s of [-1, 1]) sph(g, s * 0.022, 0.29, 0.054, 0.007, chip('#1c1c1c'), { seg: 6 });
    cylc(g, 0, 0.215, 0.035, 0.055, 0.1, chip('#ecebe4'), { r2: 0.018, seg: 12, rx: 180 - 15 });  // beard
    cyl(g, 0, 0.315, -0.005, 0.064, 0.02, chip('#b3372a'), { seg: 14 });
    cyl(g, 0, 0.33, -0.012, 0.058, 0.13, chip('#b3372a'), { r2: 0.004, seg: 14, rx: -12 });
    rod(g, [-0.08, 0.2, 0.0], [-0.07, 0.13, 0.06], 0.022, chip('#b3372a'), { seg: 6 });
    rod(g, [0.08, 0.2, 0.0], [0.12, 0.14, 0.05], 0.022, chip('#b3372a'), { seg: 6 });
    rod(g, [0.13, 0.0, 0.07], [0.13, 0.3, 0.07], 0.007, chip('#6a4a2a'), { seg: 5 });
    box(g, 0.13, 0.19, 0.078, 0.2, 0.085, 0.012, chip('#b8966a'), { ry: -10 });
    pl(g, 0.13, 0.2325, 0.0845, 0.19, 0.08, TM(gnomeSignTex(o.text ?? 'Welcome Friends')), { ry: -10 });
  });

  // pansies: a small bed of pansies (purple, yellow, white) in dark soil with brick edging. opts w (1.2), d (0.5),
  // variant 'bed' | 'ring' (a ring of flowers around the origin, e.g. around the gnome; opts radius)
  def('pansies', { collide: false }, (K, o, g) => {
    const ring = o.variant === 'ring', r = rngOf(K, o, 'pn');
    const w = o.w ?? 1.2, d = o.d ?? 0.5, rr = o.radius ?? 0.45;
    if (ring) add(g, gCircle(rr + 0.2, 18), { tex: 'dirt', color: '#6a5a46' }, 0, 0.012, 0, { rx: -90, cast: false });
    else { flat(g, 0, 0.012, 0, w, d, { tex: 'dirt', color: '#6a5a46' }); for (let x = -w / 2; x < w / 2 - 0.1; x += 0.23) box(g, x + 0.11, 0, d / 2 + 0.05, 0.22, 0.07, 0.1, 'brick', { rz: (r() - 0.5) * 6 }); }
    const petal = [['#5b2a7a', '#e8c21a'], ['#e0c52a', '#3a1a4a'], ['#ece8f0', '#5b2a7a'], ['#7a3a9a', '#f0e070']];
    const leaf = { color: '#3f5a36', roughness: 0.8 };
    const nF = ring ? 16 : Math.round(w * d * 45);
    for (let i = 0; i < nF; i++) {
      const [x, z] = ring ? [Math.cos((i / nF) * TAU) * rr, Math.sin((i / nF) * TAU) * rr] : [(r() - 0.5) * (w - 0.1), (r() - 0.5) * (d - 0.1)];
      add(g, gIco(0.06, 0), leaf, x, 0.04, z, { s: [1, 0.5, 1], ry: r() * 180 });
      for (let f = 0; f < 2; f++) {
        const [pc, cc] = pick(petal, r), fx = x + (r() - 0.5) * 0.06, fz = z + (r() - 0.5) * 0.06, fy = 0.09 + r() * 0.04;
        add(g, gCircle(0.036, 7), { color: pc, roughness: 0.7, side: 'double' }, fx, fy, fz, { rx: -55 - r() * 30, ry: r() * 360 });
        add(g, gCircle(0.01, 5), { color: cc, roughness: 0.7 }, fx, fy + 0.004, fz + 0.004, { rx: -70 });
      }
    }
  });

  // dumpster: commercial front-lift bin with a sloped front, plastic lids (one ajar), fork pockets, stencils
  def('dumpster', { collide: true }, (K, o, g) => {
    const c = o.color || '#2e4a36';
    const body = { tex: 'metal_rust', paint: c };
    taper(g, 0, 0.12, 0, 1.75, 1.0, 1.9, 1.25, 1.1, body, { dz: -0.1 });
    for (const s of [-1, 1]) { box(g, s * 1.0, 0.75, -0.1, 0.14, 0.18, 0.9, M.steelDk); cylc(g, s * 0.7, 0.07, s * 0.35, 0.07, 0.06, M.rubber, { rz: 90, seg: 10 }); }
    box(g, -0.47, 1.22, -0.08, 0.92, 0.05, 1.3, M.darkPlastic, { rx: -3 });
    box(g, 0.47, 1.25, -0.2, 0.92, 0.05, 1.3, M.darkPlastic, { rx: -22 });
    pl(g, 0, 0.7, 0.52, 0.8, 0.14, paintMat('NO HOT ASH', '#e8e4d6', F.heavy), { rx: -5 });
    pl(g, 0.6, 0.45, 0.555, 0.3, 0.12, TM(labelTex('JJ WASTE\n1300 552 231', 'label')), { rx: -5 });
  });

  // pallet: timber pallet; opts n (stacked count, 1), load ('boxes' | 'wrapped' | null)
  def('pallet', { collide: 'auto' }, (K, o, g) => {
    const n = o.n ?? 1, r = rngOf(K, o, 'pal'), wd = M.pine;
    for (let k = 0; k < n; k++) {
      const p = grp(g, (r() - 0.5) * 0.06, k * 0.144, (r() - 0.5) * 0.06, (r() - 0.5) * 4);
      for (const x of [-0.5, 0, 0.5]) box(p, x, 0, 0, 0.1, 0.022, 1.0, wd);
      for (const x of [-0.53, 0, 0.53]) box(p, x, 0.022, 0, 0.1, 0.1, 1.0, wd);
      for (let i = 0; i < 7; i++) box(p, 0, 0.122, -0.45 + i * 0.15, 1.2, 0.022, 0.1, wd);
    }
    const top = n * 0.144;
    if (o.load === 'boxes' || o.load === 'wrapped') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) box(g, -0.3 + i * 0.6, top + k * 0.42, -0.25 + j * 0.5, 0.58, 0.41, 0.48, 'cardboard', { ry: (r() - 0.5) * 3 });
      if (o.load === 'wrapped') box(g, 0, top, 0, 1.22, 0.86, 1.02, { tex: 'plastic_sheet', opacity: 0.6 }, { cast: false });
    }
  });

  // cone: traffic cone with reflective bands
  def('cone', { collide: 0.17 }, (K, o, g) => {
    box(g, 0, 0, 0, 0.38, 0.035, 0.38, M.rubber);
    cyl(g, 0, 0.03, 0, 0.16, 0.66, { color: o.color || '#e0561c', roughness: 0.55 }, { r2: 0.025, seg: 14 });
    cyl(g, 0, 0.3, 0, 0.114, 0.08, { color: '#e8e8e2', roughness: 0.2 }, { r2: 0.1, seg: 14 });
    cyl(g, 0, 0.45, 0, 0.082, 0.06, { color: '#e8e8e2', roughness: 0.2 }, { r2: 0.07, seg: 14 });
  });

  // floodlight: opts variant 'pole' (6 m pole, two heads) | 'tripod' (1.8 m work light); lit, light (true → a pooled
  // spot aimed down/forward; 'point' → a point light), h
  def('floodlight', { collide: 0.18 }, (K, o, g) => {
    const trip = o.variant === 'tripod', lit = o.lit !== false;
    const H = o.h ?? (trip ? 1.8 : 6.0);
    if (trip) { for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rod(g, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0, H * 0.55, 0], 0.014, M.darkPlastic); } cyl(g, 0, H * 0.5, 0, 0.02, H * 0.5, M.chrome, { seg: 6 }); }
    else { cyl(g, 0, 0, 0, 0.25, 0.3, 'concrete', { seg: 10 }); cyl(g, 0, 0.3, 0, 0.09, H - 0.3, M.galv, { r2: 0.07, seg: 10 }); box(g, 0, H - 0.1, 0.05, 1.0, 0.08, 0.08, M.galv); }
    const headM = lit ? glowMat('#fff6e2', 2.6) : { color: '#a9aca6', roughness: 0.2 };
    const heads = trip ? [[0, H, 0.05]] : [[-0.35, H - 0.2, 0.25], [0.35, H - 0.2, 0.25]];
    for (const [x, y, z] of heads) {
      const hg = grp(g, x, y, z); hg.rotation.x = R(trip ? 20 : 35);
      box(hg, 0, -0.17, 0, 0.42, 0.34, 0.14, { tex: 'metal', color: trip ? '#d8b928' : '#5c615e' });
      boxc(hg, 0, 0, 0.072, 0.36, 0.28, 0.01, headM);
      for (let i = 0; i < 6; i++) box(hg, -0.18 + i * 0.072, -0.17, -0.09, 0.02, 0.34, 0.05, M.steelDk);
      if (lit) Render.halo([x, y, z + 0.15], { parent: g, color: '#fff2d8', size: 2.2, opacity: 0.55 });
    }
    if (lit && o.light !== false) {
      const kind = o.light === 'point' ? 'point' : 'spot';
      const hL = K.light(kind, 0, H - 0.3, 0.5, kind === 'spot' ? { color: '#fff2dc', intensity: 60, distance: 25, angle: 50, target: [0, 0, 7], bank: o.bank } : { color: '#fff2dc', intensity: 12, distance: 16, bank: o.bank });
      anim(K, () => { headM.emissiveIntensity = hL.isOn ? 2.6 : 0.03; });
    }
  });

  // =================================================================================================================
  // INTERIOR FURNITURE
  // =================================================================================================================
  const slatTex = () => ctex('slatwall', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#d8d6ce'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { ctx.fillStyle = '#6c6c66'; ctx.fillRect(0, y, w, 5); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(0, y + 5, w, 2); }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, oct: 3 }), 0.08);
  }, { wrap: true, size: 1 });
  // accessory packs: blister cards (case, charger, cable, protector, earbuds, power bank)
  const packTex = (i) => ctex('pack|' + i, 64, 96, (ctx, w, h, r) => {
    const bg = ['#f2f2ee', '#101415', BR.teal, '#e9e6dc', '#1b2f3a', '#f1c40f'][i % 6];
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b8bcbc'; ctx.beginPath(); ctx.arc(w / 2, 8, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(w / 2, 8, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = ['#2a2a2a', '#e6e6e6', '#ffffff', '#c0392b', '#ffcc00', '#1b1b1b'][i % 6];
    if (i % 3 === 0) ctx.fillRect(16, 26, 32, 48); else if (i % 3 === 1) { ctx.fillRect(22, 24, 20, 30); ctx.fillRect(30, 54, 4, 20); } else { ctx.beginPath(); ctx.arc(32, 50, 16, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(12, 20, 40, 60);
    txt(ctx, ['CASE', 'FAST CHARGE', 'USB-C', 'SCREEN GUARD', 'EARBUDS', 'POWER BANK'][i % 6], w / 2, 90, { size: 8, font: F.sans, weight: 'bold', color: i % 6 === 1 || i % 6 === 4 ? '#fff' : '#111', align: 'center' });
    ctx.fillStyle = '#ffcc00'; ctx.fillRect(w - 20, 70, 18, 10); txt(ctx, '$' + (19 + i * 10), w - 11, 78, { size: 7, font: F.sans, weight: 'bold', color: '#111', align: 'center' });
  });
  const corkTex = () => ctex('cork', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#a5794d'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 5000; k++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '70,44,22' : '200,160,110'},${0.2 + r() * 0.4})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let k = 0; k < 30; k++) { ctx.fillStyle = 'rgba(40,24,12,0.5)'; ctx.fillRect(r() * w, r() * h, 1.5, 1.5); } // old pin holes
  }, { wrap: true, size: 0.6 });
  // roster: a printed weekly roster; opts cross = [names whose shifts are struck through with "call him?" beside]
  const rosterTex = (title = 'ROSTER — WEEK 14', cross = null) => ctex(`roster|${title}|${cross || ''}`, 384, 272, (ctx, w, h, r) => {
    ctx.fillStyle = '#f1efe7'; ctx.fillRect(0, 0, w, h);
    txt(ctx, title, 14, 26, { size: 18, font: F.sans, weight: 'bold', color: '#111' });
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], names = ['LUKA', 'CHLOE', 'AIDAN', 'PRIYA', 'JOSH', 'MEL', 'TOM'];
    const x0 = 80, cw = (w - x0 - 10) / days.length, y0 = 44, rh = 30;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    days.forEach((d, i) => txt(ctx, d, x0 + i * cw + cw / 2, y0 + 14, { size: 11, font: F.sans, weight: 'bold', color: '#222', align: 'center' }));
    names.forEach((n, j) => {
      const y = y0 + 22 + j * rh;
      txt(ctx, n, 12, y + 19, { size: 12, font: F.sans, weight: 'bold', color: '#222' });
      ctx.strokeRect(x0, y, cw * days.length, rh);
      days.forEach((d, i) => { if (r() < 0.62) txt(ctx, pick(['9–5', '10–6', '12–8', '8–4'], r), x0 + i * cw + cw / 2, y + 19, { size: 11, font: F.mono, color: '#222', align: 'center' }); });
      if (cross && n === cross) {
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3;
        for (let i = 3; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * cw + 4, y + 22); ctx.lineTo(x0 + (i + 1) * cw - 4, y + 8); ctx.stroke(); hand(ctx, 'call him?', x0 + i * cw + 2, y - 2, { size: 10, color: '#1f2c6e' }); }
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      }
    });
    TU.age(ctx, w, h, r, 0.7);
  });
  const partitionTex = (c = '#5e6a72') => ctex('partition|' + c, 128, 128, (ctx, w, h, r) => {
    const b = TU.hex(c); ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; ctx.fillRect(0, y, w, 1); }
    for (let k = 0; k < 900; k++) { ctx.fillStyle = `rgba(${b[0] + 40},${b[1] + 40},${b[2] + 40},${r() * 0.3})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, oct: 3 }), 0.1);
  }, { wrap: true, size: 0.5 });
  const floralTex = (c = '#8a6a5a') => ctex('floral|' + c, 256, 256, (ctx, w, h, r) => {
    const b = TU.hex(c); ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) {
      const x = r() * w, y = r() * h, s = 6 + r() * 8;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.fillStyle = `rgba(${b[0] + 60},${b[1] + 40},${b[2] + 30},0.55)`; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.45, s * 0.3, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(210,190,120,0.6)'; ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(70,90,60,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s, y + s, x + s * 2, y + s * 0.5); ctx.stroke();
    }
    for (let y = 0; y < h; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, y, w, 1); }
  }, { wrap: true, size: 0.5 });
  const quiltTex = (c = '#7a8aa0') => ctex('quilt|' + c, 256, 256, (ctx, w, h, r) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const b = TU.hex(c), k = 0.75 + r() * 0.4; ctx.fillStyle = `rgb(${clamp(b[0] * k, 0, 255)},${clamp(b[1] * k, 0, 255)},${clamp(b[2] * k, 0, 255)})`; ctx.fillRect(i * s, j * s, s, s); if ((i + j) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(i * s + s / 2, j * s + s / 2, s * 0.3, 0, TAU); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([3, 3]); for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke(); }
  }, { wrap: true, size: 0.6 });
  const lockerTex = () => ctex('lockerdoor', 128, 512, (ctx, w, h, r) => {
    ctx.fillStyle = '#8f9a98'; ctx.fillRect(0, 0, w, h);
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 2, oct: 3 }), 0.12);
    for (const y0 of [24, h - 90]) for (let i = 0; i < 6; i++) { ctx.fillStyle = '#2a2e2e'; ctx.fillRect(28, y0 + i * 11, w - 56, 5); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(28, y0 + i * 11 + 5, w - 56, 1); }
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
    for (let k = 0; k < 8; k++) { ctx.fillStyle = `rgba(210,214,212,${0.2 + r() * 0.3})`; ctx.fillRect(r() * w, r() * h, 2 + r() * 20, 1); }
  });
  // generic painted/printed photo (framed): subject 'family'|'staff1961'|'nan'|'percent'|'blank'|'landscape'
  const photoTex = (subject = 'family', text = '') => ctex(`photo|${subject}|${text}`, 192, 240, (ctx, w, h, r) => {
    const sepia = subject === 'staff1961';
    ctx.fillStyle = sepia ? '#b7a887' : '#8a9aa6'; ctx.fillRect(0, 0, w, h);
    if (subject === 'landscape') { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fb1bb'); g.addColorStop(0.6, '#c9c7b5'); g.addColorStop(1, '#6d7a52'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#56624a'; ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.quadraticCurveTo(w * 0.4, h * 0.5, w, h * 0.66); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); }
    else {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, sepia ? '#c8b894' : '#a7b9c3'); g.addColorStop(1, sepia ? '#8f7f5e' : '#6d7f5a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const people = subject === 'staff1961' ? 9 : subject === 'nan' ? 2 : subject === 'family' ? 3 : 1;
      for (let i = 0; i < people; i++) {
        const row = subject === 'staff1961' ? Math.floor(i / 5) : 0, per = subject === 'staff1961' ? 5 : people;
        const x = ((i % per) + 0.5) * (w / per) + (row ? w / 10 : 0), y = h * (0.42 + row * 0.2), s = subject === 'staff1961' ? 0.55 : subject === 'nan' && i === 1 ? 0.8 : 1;
        const body = sepia ? '#5e5240' : pick(['#3a5a7a', '#7a3a3a', '#3a6a4a', '#6a5a7a', '#2e3a5a'], r);
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y + h * 0.3 * s, w * 0.14 * s, h * 0.2 * s, 0, 0, TAU); ctx.fill();
        const faceC = subject === 'blank' ? '#f4f4f0' : sepia ? '#d8ccb0' : '#d8b89a';
        ctx.fillStyle = subject === 'nan' && i === 0 ? '#c9c7c2' : sepia ? '#3a3226' : pick(['#3a2a1e', '#6a4a2a', '#b89a6a', '#2a2a2a'], r);
        ctx.beginPath(); ctx.ellipse(x, y - h * 0.02 * s, w * 0.08 * s, h * 0.08 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = faceC; ctx.beginPath(); ctx.ellipse(x, y + h * 0.01 * s, w * 0.065 * s, h * 0.07 * s, 0, 0, TAU); ctx.fill();
        if (subject === 'staff1961' || subject === 'blank') { const f = ctx.createRadialGradient(x, y, 0, x, y, w * 0.1 * s); f.addColorStop(0, subject === 'blank' ? 'rgba(255,255,255,1)' : 'rgba(230,222,200,0.95)'); f.addColorStop(1, 'rgba(230,222,200,0)'); ctx.fillStyle = f; ctx.fillRect(x - w * 0.1, y - h * 0.1, w * 0.2, h * 0.2); }
        else if (subject !== 'percent') { ctx.fillStyle = 'rgba(30,20,10,0.6)'; ctx.fillRect(x - w * 0.025 * s, y, w * 0.012, h * 0.008); ctx.fillRect(x + w * 0.015 * s, y, w * 0.012, h * 0.008); ctx.fillRect(x - w * 0.02 * s, y + h * 0.035 * s, w * 0.04 * s, h * 0.006); }
        if (subject === 'nan' && i === 1) { ctx.fillStyle = '#1f2f5a'; ctx.fillRect(x - w * 0.1, y + h * 0.1, w * 0.2, h * 0.04); }
      }
      if (subject === 'percent') { ctx.fillStyle = '#e8e6de'; ctx.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.2); txt(ctx, text || '87%', w / 2, h * 0.45, { size: 34, font: F.heavy, weight: '900', color: '#141414', align: 'center' }); }
    }
    if (sepia) { TU.age(ctx, w, h, r, 2, { sun: 0.4 }); ctx.fillStyle = 'rgba(200,180,140,0.3)'; ctx.fillRect(0, 0, w, h); }
    else TU.age(ctx, w, h, r, 0.6, { sun: subject === 'blank' ? 0.6 : 0.15 });
    if (text && subject !== 'percent') txt(ctx, text, w / 2, h - 10, { size: 12, font: F.serif, color: '#f0ece0', align: 'center' });
  });

  // counter: service counter (front faces +Z / the customer; staff behind at −Z). opts len (2.4), variant 'store'
  // (teal front + wordmark, white top) | 'reception' (veneer + raised ledge) | 'servery' (stainless) | 'security' |
  // 'hospital'; printer (contract printer on top), duress (red button under the staff side), clutter (true),
  // monitor (true; false = no staff monitor and keyboard — a camera behind the counter; a number = its x offset)
  def('counter', { collide: true }, (K, o, g) => {
    const len = o.len ?? 2.4, v = o.variant || 'store', r = rngOf(K, o, 'ct');
    const d = 0.66, H = 1.0;
    if (v === 'servery') {
      box(g, 0, 0, 0, len, 0.9, d, M.stainless);
      box(g, 0, 0.9, 0, len + 0.04, 0.04, d + 0.04, M.stainless);
      for (const y of [0.78, 0.84]) cylc(g, 0, y, d / 2 + 0.12, 0.012, len, M.chrome, { rz: 90, seg: 6 });
      for (const x of [-len / 2 + 0.2, len / 2 - 0.2]) box(g, x, 0.75, d / 2, 0.03, 0.12, 0.14, M.chrome);
      box(g, 0, 0.94, -0.1, len * 0.9, 0.35, 0.02, { color: '#dfe6e6', roughness: 0.1, transparent: true, opacity: 0.3 }, { cast: false });
      col(K, o, -len / 2, -d / 2, len / 2, d / 2 + 0.2, 0.95);
      return;
    }
    const front = v === 'store' ? { color: BR.teal, roughness: 0.45 } : v === 'reception' ? M.veneer : v === 'hospital' ? { color: '#dcdcd4', roughness: 0.5 } : M.lamGrey;
    const top = v === 'store' ? { color: '#ecebe6', roughness: 0.35 } : v === 'reception' ? { color: '#d8d4c8', roughness: 0.4 } : M.laminate;
    box(g, 0, 0.08, 0, len, H - 0.12, d, front);
    box(g, 0, 0, 0.03, len - 0.04, 0.08, d - 0.06, M.black);
    box(g, 0, H - 0.04, -0.02, len + 0.02, 0.04, d + 0.08, top);
    if (v === 'store') {
      box(g, 0, H - 0.14, d / 2 + 0.002, len, 0.06, 0.004, { color: BR.yellow, roughness: 0.4 }, { cast: false });
      pl(g, len / 2 - 0.45, 0.55, d / 2 + 0.004, 0.6, 0.22, TM(Tex.wordmark({ w: 0.6, h: 0.22, bg: null })), { transparent: true });
      pl(g, -len / 2 + 0.3, 0.45, d / 2 + 0.004, 0.14, 0.1, TM(labelTex('WE ACCEPT\nALL CARDS', 'label')), {});
    } else if (v === 'reception' || v === 'hospital') {
      box(g, 0, H + 0.1, d / 2 - 0.12, len, 0.04, 0.26, top);
      box(g, 0, H - 0.04, d / 2 - 0.02, len, 0.16, 0.03, front);
      if (v === 'hospital') box(g, 0, 0.5, d / 2 + 0.002, len, 0.08, 0.004, { color: '#2f7a9a', roughness: 0.5 }, { cast: false });
    }
    // staff side: open shelves with paper and folders
    box(g, 0, 0.35, -d / 2 + 0.01, len - 0.1, 0.02, 0.02, M.steelDk);
    for (let i = 0; i < Math.floor(len / 0.6); i++) box(g, -len / 2 + 0.35 + i * 0.6, 0.4, -d / 2 + 0.18, 0.4, 0.02 + r() * 0.08, 0.3, { tex: 'paper', color: '#e6e2d6' });
    if (o.clutter !== false) {
      const T = H;
      // EFTPOS terminal on its stand, facing the customer
      box(g, len * 0.2, T, 0.05, 0.1, 0.03, 0.1, M.darkPlastic);
      add(g, gBox(0.085, 0.16, 0.035), M.darkPlastic, len * 0.2, T + 0.1, 0.06, { rx: -25 });
      pl(g, len * 0.2, T + 0.13, 0.083, 0.06, 0.04, TM(dispTex('INSERT\nCARD', 'lcd', 96, 64), { emissive: 0.4 }), { rx: -25 });
      // staff monitor, keyboard
      const mx = typeof o.monitor === 'number' ? o.monitor : -len * 0.18;
      if (o.monitor !== false) {
        K.prop('monitor', mx, -0.12, 180, { y: T, collide: false, content: v === 'store' ? 'login' : 'off', live: !!o.screen });
        box(g, mx, T, -0.02, 0.44, 0.02, 0.15, M.darkPlastic, { ry: (r() - 0.5) * 8 });
      } else r();
      // a pen on a chain, business cards, a sticky note
      rod(g, [len * 0.36, T + 0.005, 0.2], [len * 0.36 + 0.13, T + 0.005, 0.18], 0.004, M.black, { seg: 5 });
      box(g, -len * 0.4, T, 0.18, 0.1, 0.03, 0.06, { color: '#dcd8cc' });
      flat(g, -len * 0.05, T + 0.002, 0.12, 0.076, 0.076, TM(noteTex('call back\nTues?', 'sticky')), { ry: r() * 30 });
      if (o.printer) K.prop('printer', len * 0.36, -0.12, 180, { y: T, collide: false, variant: 'laser', warm: true });
    }
    if (o.duress) {
      box(g, len * 0.3, H - 0.15, -d / 2 + 0.05, 0.08, 0.06, 0.04, { color: '#e8e4d8' });
      cyl(g, len * 0.3, H - 0.14, -d / 2 + 0.03, 0.018, 0.02, glowS('#d0231c', 0.6), { rx: 90, seg: 10 });
    }
  });

  // demo_table: phone demo table — white top, teal plinth, phones on security pucks with coiled tethers, lock screens
  // (opts.time '8:59'), price cards. opts n (6), lit (screens on), len (1.6)
  def('demo_table', { collide: true }, (K, o, g) => {
    const len = o.len ?? 1.6, d = 0.8, H = 0.9, n = o.n ?? 6, r = rngOf(K, o, 'dt');
    box(g, 0, 0, 0, len - 0.4, H - 0.05, d - 0.3, { color: BR.teal, roughness: 0.45 });
    box(g, 0, 0, 0, len - 0.36, 0.06, d - 0.26, M.black);
    box(g, 0, H - 0.05, 0, len, 0.05, d, { color: '#eeede8', roughness: 0.3 });
    box(g, 0, H - 0.055, 0, len + 0.01, 0.02, d + 0.01, { color: BR.yellow, roughness: 0.4 }, { cast: false });
    const lit = o.lit !== false, time = o.time ?? '8:59';
    const scr = lit ? TM(lockTex(time), { emissive: 0.9, roughness: 0.2, offset: false }) : { tex: 'screen_off' };
    const cols = Math.ceil(n / 2), cordM = TM(coilTex('#1c1d1e'), { roughness: 0.5 });
    for (let i = 0; i < n; i++) {
      const row = i < cols ? 0 : 1, ci = i % cols;
      const x = -len / 2 + (len / cols) * (ci + 0.5), z = row ? -0.18 : 0.2, ry = row ? 180 : 0;
      const pg = grp(g, x, H, z, ry);
      cyl(pg, 0, 0, 0, 0.035, 0.03, M.greyPlastic, { seg: 12 });
      const ph = grp(pg, 0, 0.03, 0.02); ph.rotation.x = R(-55);
      const pw = 0.072 + r() * 0.012, pH = pw * 2.05;
      box(ph, 0, 0, 0, pw, pH, 0.008, { color: pick(['#16191a', '#d8d8d4', '#3a4a5a', '#2c2c30'], r), roughness: 0.3 }, {});
      pl(ph, 0, pH / 2, 0.0045, pw * 0.9, pH * 0.92, scr, {});
      tube(g, [[x, H + 0.01, z + (row ? 0.03 : -0.03)], [x + 0.03, H + 0.005, z + (row ? 0.09 : -0.09)], [x + 0.02, H + 0.005, z + (row ? 0.14 : -0.14)], [x, H - 0.02, z + (row ? 0.16 : -0.16)]], 0.004, cordM, { key: 'demotether' + row, radial: 4, seg: 10, cast: false });
      pl(pg, 0, 0.001, 0.1, 0.07, 0.045, TM(labelTex(pick(['$45/mth', '$55/mth', '$65/mth', '$79/mth'], r), 'label')), { rx: -90 });
    }
    g.userData.screensLit = lit;
  });

  // accessory_wall: slatwall bay with hooked blister packs, a header strip and a low shelf of boxes. opts len (2.4)
  def('accessory_wall', { collide: true }, (K, o, g) => {
    const len = o.len ?? 2.4, H = 2.3, r = rngOf(K, o, 'aw');
    box(g, 0, 0, -0.03, len, H, 0.06, TM(slatTex(), { roughness: 0.5 }), { uv: 1 });
    box(g, 0, H, -0.02, len, 0.26, 0.08, { color: BR.teal, roughness: 0.45 });
    pl(g, 0, H + 0.13, 0.021, Math.min(len - 0.2, 1.6), 0.18, TM(Tex.sign('ACCESSORIES', { style: 'shop', w: 1.6, h: 0.18, bg: BR.teal, fg: '#ffffff', border: false })), {});
    box(g, 0, 0, 0.12, len, 0.45, 0.36, { color: '#e2e0d8', roughness: 0.5 });
    const packs = [0, 1, 2, 3, 4, 5].map((i) => TM(packTex(i), { roughness: 0.4 }));
    for (let row = 0; row < 4; row++) {
      const y = 0.75 + row * 0.36;
      for (let x = -len / 2 + 0.15; x < len / 2 - 0.1; x += 0.2) {
        rod(g, [x, y + 0.2, 0.0], [x, y + 0.21, 0.16], 0.003, M.chrome, { seg: 4, cast: false });
        const c = r() < 0.15 ? 0 : 1 + Math.floor(r() * 2);
        for (let k = 0; k < c; k++) add(g, gBox(0.11, 0.17, 0.02), packs[Math.floor(r() * 6)], x, y + 0.1, 0.03 + k * 0.03, { rz: (r() - 0.5) * 3 });
      }
    }
    for (let i = 0; i < Math.floor(len / 0.3); i++) box(g, -len / 2 + 0.17 + i * 0.3, 0.45, 0.15, 0.24, 0.12 + r() * 0.08, 0.18, TM(packTex(Math.floor(r() * 6))), { uv: false });
  });

  // shelf: steel shelving with a load. opts len (1.8), h (2.1), d (0.5), load 'boxes'|'returns'|'paper'|'stock'|'mixed'|'empty'
  def('shelf', { collide: true }, (K, o, g) => {
    const len = o.len ?? 1.8, H = o.h ?? 2.1, d = o.d ?? 0.5, load = o.load || o.variant || 'boxes', r = rngOf(K, o, 'shf');
    const up = paint('#6a7a82', 0.5), sh = paint('#a8b0b0');
    for (const x of [-len / 2 + 0.02, len / 2 - 0.02]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) box(g, x, 0, z, 0.04, H, 0.04, up);
    const nS = Math.max(3, Math.round(H / 0.45));
    for (let i = 0; i < nS; i++) {
      const y = 0.1 + (i * (H - 0.15)) / (nS - 1);
      box(g, 0, y, 0, len, 0.025, d, sh);
      if (i === nS - 1 || load === 'empty') continue;
      const gap = (H - 0.15) / (nS - 1) - 0.05;
      let x = -len / 2 + 0.05;
      while (x < len / 2 - 0.15) {
        const kind = load === 'mixed' ? pick(['boxes', 'returns', 'paper'], r) : load;
        if (kind === 'returns') { const w = 0.3 + r() * 0.1; add(g, gBox(w, 0.12 + r() * 0.08, d * 0.8), { tex: 'plastic_sheet', color: '#9a9e9c', opacity: 1, roughness: 0.6 }, x + w / 2, y + 0.1, 0, { ry: (r() - 0.5) * 20, rz: (r() - 0.5) * 20 }); x += w + 0.02; }
        else if (kind === 'paper') { const w = 0.22; box(g, x + w / 2, y + 0.025, 0, w, Math.min(gap, 0.12 + r() * 0.2), 0.3, { tex: 'paper', color: '#e8e4d8' }, { ry: (r() - 0.5) * 6 }); x += w + 0.04; }
        else if (kind === 'stock') { const w = 0.14; box(g, x + w / 2, y + 0.025, 0.05, w, Math.min(gap, 0.2), 0.1, TM(packTex(Math.floor(r() * 6))), { uv: false }); x += w + 0.01; }
        else { if (r() < 0.12) { x += 0.2; continue; } const w = 0.25 + r() * 0.3, hh = Math.min(gap - 0.02, 0.18 + r() * 0.25); box(g, x + w / 2, y + 0.025, (r() - 0.5) * 0.06, w, hh, d - 0.08, 'cardboard', { ry: (r() - 0.5) * 6 }); x += w + 0.02; }
      }
    }
    pl(g, len / 2 - 0.2, 0.1 + (H - 0.15) / (nS - 1) - 0.06, d / 2 + 0.002, 0.14, 0.05, TM(labelTex('BAY ' + (1 + Math.floor(r() * 12)), 'label')), {});
  });

  // desk: office desk (laminate top on panel ends, modesty panel, drawer pedestal) + clutter. opts variant 'office' |
  // 'timber' (old double-pedestal desk), clutter (true: monitor, keyboard, phone, papers, mug, photo), w (1.5)
  def('desk', { collide: true }, (K, o, g) => {
    const w = o.w ?? 1.5, d = 0.75, H = 0.74, v = o.variant || 'office', r = rngOf(K, o, 'desk');
    if (v === 'timber') {
      box(g, 0, H - 0.035, 0, w, 0.035, d, M.oak);
      for (const s of [-1, 1]) { box(g, s * (w / 2 - 0.22), 0, 0, 0.42, H - 0.035, d - 0.04, M.oak); for (let k = 0; k < 3; k++) { box(g, s * (w / 2 - 0.22), 0.08 + k * 0.21, d / 2 - 0.01, 0.38, 0.18, 0.012, M.oak); box(g, s * (w / 2 - 0.22), 0.16 + k * 0.21, d / 2, 0.08, 0.015, 0.015, { tex: 'metal', color: '#b89a52', metalness: 0.7 }); } }
      box(g, 0, 0.3, -d / 2 + 0.02, w - 0.84, H - 0.34, 0.02, M.oak);
    } else {
      box(g, 0, H - 0.028, 0, w, 0.028, d, M.laminate);
      box(g, 0, H - 0.03, 0, w + 0.006, 0.012, d + 0.006, M.darkPlastic, { cast: false });
      box(g, -w / 2 + 0.025, 0, 0, 0.05, H - 0.03, d - 0.04, M.lamGrey);
      box(g, 0, 0.25, -d / 2 + 0.05, w - 0.1, 0.45, 0.02, M.lamGrey);
      box(g, w / 2 - 0.22, 0, 0.0, 0.42, H - 0.04, d - 0.06, M.lamGrey);
      for (let k = 0; k < 3; k++) { box(g, w / 2 - 0.22, 0.05 + k * 0.22, d / 2 - 0.03, 0.4, 0.2, 0.012, M.lamGrey); box(g, w / 2 - 0.22, 0.2 + k * 0.22, d / 2 - 0.02, 0.12, 0.012, 0.012, M.chrome); }
    }
    if (o.clutter !== false) {
      g.userData.monitor = K.prop('monitor', -0.1, -0.18, (r() - 0.5) * 12, { y: H, collide: false, content: o.content || 'off', live: !!o.screen });
      box(g, -0.08, H, 0.12, 0.44, 0.02, 0.14, M.darkPlastic, { ry: (r() - 0.5) * 6 });
      box(g, 0.25, H, 0.14, 0.06, 0.02, 0.1, M.darkPlastic);
      g.userData.phone = K.prop('desk_phone', 0.5, -0.1, -20 + r() * 10, { y: H, collide: false, ringing: o.ringing });
      for (let i = 0; i < 3; i++) flat(g, -0.5 + r() * 0.2, H + 0.002 + i * 0.001, 0.05 + r() * 0.15, 0.21, 0.297, 'paper', { ry: r() * 40 - 20 });
      if (r() < 0.6) K.prop('mug', 0.35, 0.22, r() * 360, { y: H, collide: false, text: o.mug });
      if (r() < 0.5) K.prop('framed_photo', -0.55, -0.25, 20, { y: H, collide: false, variant: 'stand' });
      cyl(g, 0.62, H, 0.2, 0.035, 0.1, M.darkPlastic, { seg: 10 });
      for (let i = 0; i < 3; i++) rod(g, [0.62, H + 0.05, 0.2], [0.62 + (r() - 0.5) * 0.04, H + 0.16, 0.2 + (r() - 0.5) * 0.04], 0.004, { color: pick(['#1f3f8a', '#141414', '#b3261e'], r) }, { seg: 4 });
      if (r() < 0.5) flat(g, 0.1, H + 0.003, 0.28, 0.076, 0.076, TM(noteTex(pick(['ring back', 'TL mtg 3pm', 'target!!', 'order toner'], r), 'sticky')), { ry: r() * 30 });
    }
  });

  // office_chair: 5-star base on castors, gas lift, fabric seat and back, arms. opts color, turn (seat yaw offset)
  def('office_chair', { collide: 'auto' }, (K, o, g) => {
    const r = rngOf(K, o, 'oc'), fab = { tex: 'fabric_knit', color: o.color || pick(['#2f3438', '#34404a', '#3a3a3e'], r), roughness: 0.95 };
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; bar(g, [0, 0.09, 0], [Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32], 0.035, 0.03, M.darkPlastic); sph(g, Math.cos(a) * 0.32, 0.03, Math.sin(a) * 0.32, 0.03, M.black, { seg: 6 }); }
    cyl(g, 0, 0.08, 0, 0.03, 0.3, M.chrome, { seg: 8 });
    const s = grp(g, 0, 0, 0, o.turn ?? (r() - 0.5) * 40);
    box(s, 0, 0.37, 0, 0.3, 0.05, 0.3, M.darkPlastic);
    box(s, 0, 0.41, 0.02, 0.48, 0.07, 0.46, fab);
    box(s, 0, 0.4, -0.22, 0.06, 0.2, 0.04, M.darkPlastic);
    add(s, gBox(0.44, 0.5, 0.06), fab, 0, 0.8, -0.26, { rx: -8 });
    for (const sx of [-1, 1]) { box(s, sx * 0.25, 0.44, 0.02, 0.03, 0.2, 0.04, M.darkPlastic); box(s, sx * 0.25, 0.64, 0.04, 0.06, 0.03, 0.24, M.darkPlastic); }
  });

  // chair: opts variant 'plastic' (stacking shell) | 'timber' (kitchen chair) | 'waiting' (padded, chrome) | 'folding'; color
  function chairBuild(p, v, r, color) {
    if (v === 'timber') {
      const wd = color ? { tex: 'wood', color } : M.oak;
      box(p, 0, 0.42, 0.02, 0.42, 0.035, 0.4, wd);
      for (const [x, z] of [[-0.18, 0.18], [0.18, 0.18]]) box(p, x, 0, z, 0.035, 0.42, 0.035, wd);
      for (const x of [-0.18, 0.18]) box(p, x, 0, -0.16, 0.035, 0.92, 0.035, wd, { rx: -4 });
      box(p, 0, 0.8, -0.18, 0.4, 0.09, 0.025, wd, { rx: -4 });
      for (const x of [-0.08, 0, 0.08]) box(p, x, 0.46, -0.17, 0.02, 0.34, 0.02, wd, { rx: -4 });
      box(p, 0, 0.15, 0.0, 0.36, 0.025, 0.025, wd);
    } else if (v === 'waiting') {
      for (const s of [-1, 1]) { rod(p, [s * 0.22, 0, 0.2], [s * 0.22, 0.42, 0.2], 0.012, M.chrome, { seg: 6 }); rod(p, [s * 0.22, 0, -0.2], [s * 0.22, 0.85, -0.24], 0.012, M.chrome, { seg: 6 }); rod(p, [s * 0.22, 0.62, 0.18], [s * 0.22, 0.62, -0.2], 0.012, M.chrome, { seg: 6 }); }
      box(p, 0, 0.4, 0.0, 0.48, 0.08, 0.44, { tex: 'fabric_knit', color: color || '#3d5160', roughness: 0.95 });
      add(p, gBox(0.48, 0.4, 0.07), { tex: 'fabric_knit', color: color || '#3d5160', roughness: 0.95 }, 0, 0.66, -0.22, { rx: -8 });
    } else if (v === 'folding') {
      const st = { tex: 'metal', color: '#5d6664' };
      for (const s of [-1, 1]) { rod(p, [s * 0.2, 0, 0.22], [s * 0.2, 0.86, -0.18], 0.012, st, { seg: 6 }); rod(p, [s * 0.2, 0, -0.2], [s * 0.2, 0.44, 0.05], 0.012, st, { seg: 6 }); }
      box(p, 0, 0.43, 0.02, 0.42, 0.025, 0.38, st);
      box(p, 0, 0.7, -0.13, 0.4, 0.14, 0.02, st, { rx: -20 });
    } else {
      const sh = { color: color || pick(['#4d6d6e', '#8a3a2a', '#3a4a5a', '#c9c3b2'], r), roughness: 0.6 };
      box(p, 0, 0.42, 0.02, 0.44, 0.03, 0.42, sh);
      add(p, gBox(0.42, 0.36, 0.025), sh, 0, 0.66, -0.2, { rx: -10 });
      for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) rod(p, [lx, 0, lz], [lx * 0.95, 0.42, lz * 0.95], 0.011, M.chrome, { seg: 6 });
    }
  }
  def('chair', { collide: 'auto' }, (K, o, g) => chairBuild(g, o.variant || 'plastic', rngOf(K, o, 'ch'), o.color));

  // stool: opts variant 'operator' (1960s switchboard stool with a back rest, default) | 'bar' | 'kitchen'
  def('stool', { collide: 'auto' }, (K, o, g) => {
    const v = o.variant || 'operator', H = v === 'bar' ? 0.75 : v === 'kitchen' ? 0.62 : 0.66;
    const legM = v === 'kitchen' ? M.pine : M.chrome;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; rod(g, [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], [Math.cos(a) * 0.14, H - 0.03, Math.sin(a) * 0.14], 0.013, legM, { seg: 6 }); }
    add(g, gTorus(0.19, 0.01, 4, 20), legM, 0, H * 0.35, 0, { rx: 90 });
    cyl(g, 0, H - 0.04, 0, 0.19, 0.07, v === 'kitchen' ? M.pine : { tex: 'fabric_knit', color: v === 'operator' ? '#5a3a2a' : '#2a2a2a', roughness: 0.9 }, { seg: 16 });
    if (v === 'operator') { rod(g, [0, H - 0.02, -0.16], [0, H + 0.28, -0.2], 0.014, M.chrome, { seg: 6 }); box(g, 0, H + 0.2, -0.22, 0.3, 0.14, 0.04, { tex: 'fabric_knit', color: '#5a3a2a', roughness: 0.9 }, { rx: -8 }); }
  });

  // table: opts variant 'laminate' (break-room table on chrome legs, 1.2×0.8) | 'timber' (kitchen table; cloth) |
  // 'folding' (trestle 1.8×0.75), w, d, cloth (bool, timber default true)
  def('table', { collide: true }, (K, o, g) => {
    const v = o.variant || 'laminate', r = rngOf(K, o, 'tb');
    const w = o.w ?? (v === 'folding' ? 1.8 : v === 'timber' ? 1.4 : 1.2), d = o.d ?? (v === 'folding' ? 0.75 : v === 'timber' ? 0.9 : 0.8), H = 0.74;
    if (v === 'timber') {
      box(g, 0, H - 0.035, 0, w, 0.035, d, M.oak);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, x * (w / 2 - 0.06), 0, z * (d / 2 - 0.06), 0.06, H - 0.035, 0.06, M.oak);
      box(g, 0, H - 0.12, 0, w - 0.14, 0.08, d - 0.14, M.oak);
      if (o.cloth !== false) { box(g, 0, H, 0, w * 0.6, 0.004, d * 0.6, { tex: 'fabric_knit', color: '#d8cfb6', roughness: 1 }, { ry: 12, cast: false }); }
    } else if (v === 'folding') {
      box(g, 0, H - 0.03, 0, w, 0.03, d, { tex: 'metal', color: '#c9c7be', roughness: 0.6, metalness: 0.05 });
      for (const s of [-1, 1]) { const x = s * (w / 2 - 0.2); bar(g, [x, 0, -d / 2 + 0.08], [x, H - 0.03, d / 2 - 0.12], 0.025, 0.025, M.steel); bar(g, [x, 0, d / 2 - 0.08], [x, H - 0.03, -d / 2 + 0.12], 0.025, 0.025, M.steel); }
    } else {
      box(g, 0, H - 0.03, 0, w, 0.03, d, { tex: 'metal', color: '#d6d2c6', roughness: 0.55, metalness: 0.05 });
      box(g, 0, H - 0.045, 0, w - 0.02, 0.018, d - 0.02, { color: '#7b776c' }, { cast: false });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, x * (w / 2 - 0.06), 0, z * (d / 2 - 0.06), 0.018, H - 0.045, M.chrome, { seg: 8 });
    }
    if (o.clutter) { K.prop('mug', w * 0.2, 0.1, r() * 360, { y: H, collide: false }); flat(g, -0.1, H + 0.002, -0.1, 0.3, 0.22, { tex: 'paper' }, { ry: r() * 40 }); }
  });

  // cafe_table: food-court round table on a pedestal. opts chairs (0), radius (0.4)
  def('cafe_table', { collide: 'auto' }, (K, o, g) => {
    const rr = o.radius ?? 0.4, r = rngOf(K, o, 'caf');
    cyl(g, 0, 0.72, 0, rr, 0.03, { color: '#dcd8cc', roughness: 0.4 }, { seg: 20 });
    cyl(g, 0, 0.705, 0, rr + 0.005, 0.015, M.chrome, { seg: 20 });
    cyl(g, 0, 0.02, 0, 0.04, 0.7, M.chrome, { seg: 8 });
    for (const a of [0, 90]) box(g, 0, 0, 0, 0.55, 0.03, 0.05, M.steelDk, { ry: a });
    const n = o.chairs ?? 0;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.3; const c = grp(g, Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62, (a * 180) / Math.PI + 180 + (r() - 0.5) * 20); chairBuild(c, 'plastic', r, '#8a3a2a'); }
    if (r() < 0.4) flat(g, 0.1, 0.753, 0.05, 0.2, 0.3, TM(receiptLooseTex()), { ry: r() * 90 });
  });
  const receiptLooseTex = () => ctex('receiptloose', 64, 192, (ctx, w, h, r) => { ctx.drawImage(Tex.canvas('receipt'), 0, 0, w, h); TU.age(ctx, w, h, r, 0.6); });

  // locker_bank: steel lockers with vents, number plates, name tags, a padlock or two. opts n (4), names ([…]),
  // tiers (1|2), open (index of a door left ajar). userData.setDoor(i, 0..1)
  def('locker_bank', { collide: true }, (K, o, g) => {
    const n = o.n ?? 4, lw = 0.38, H = 1.83, d = 0.46, r = rngOf(K, o, 'lk'), dyn = dynamic(o, 'open');
    const body = paint('#9aa4a2', 0.5), doorM = TM(lockerTex(), { color: '#ffffff', roughness: 0.5, metalness: 0.15 });
    const W = n * lw;
    box(g, 0, 0.08, 0, W, H - 0.08, d, body);
    box(g, 0, 0, 0.02, W, 0.08, d - 0.04, M.black);
    box(g, 0, H, 0, W + 0.02, 0.02, d + 0.02, body);
    const doors = [];
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 + i * lw;
      const piv = grp(g, x0 + 0.01, 0.1, d / 2 + 0.005, 0, 'door' + i);
      box(piv, (lw - 0.02) / 2, 0, 0.01, lw - 0.02, H - 0.14, 0.02, doorM, { uv: false });
      box(piv, lw - 0.07, H * 0.45, 0.025, 0.03, 0.12, 0.02, M.chrome);
      pl(piv, (lw - 0.02) / 2, H - 0.36, 0.0215, 0.07, 0.04, TM(plateTex(String(i + 1), '#e9e6dc', '#1b1b1b', 96, 56)), {});
      const nm = o.names && o.names[i];
      if (nm) pl(piv, (lw - 0.02) / 2, H - 0.46, 0.0215, 0.14, 0.05, TM(labelTex(nm, 'tag')), {});
      if (r() < 0.3) { cyl(piv, lw - 0.07, H * 0.45 - 0.06, 0.04, 0.018, 0.03, { tex: 'metal', color: '#b89a52', metalness: 0.7 }, { seg: 8 }); }
      if (r() < 0.25) pl(piv, 0.12, 0.7 + r() * 0.6, 0.0215, 0.07, 0.07, TM(Tex.label(pick(['OLLIE', 'GO TEAM'], r), { style: 'sticker' }), { alphaTest: 0.5 }), { rz: (r() - 0.5) * 30 });
      if (dyn) live(piv);
      doors.push(piv);
    }
    const setDoor = (i, v) => { const p = doors[i]; if (p && !baked('locker_bank', p)) p.rotation.y = -clamp(v) * R(100); };
    if (o.open !== undefined) setDoor(o.open, 0.35);
    g.userData.setDoor = setDoor; g.userData.doors = doors;
    if (r() < 0.6) box(g, (r() - 0.5) * W * 0.6, H + 0.02, 0, 0.4, 0.25, 0.3, 'cardboard', { ry: (r() - 0.5) * 20 });
  });

  // microwave (tabletop): door with a dark window, keypad, VFD clock (opts.time '8:59')
  def('microwave', { collide: false }, (K, o, g) => {
    box(g, 0, 0.01, 0, 0.5, 0.29, 0.38, { color: '#d6d4cc', roughness: 0.45 });
    for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) box(g, x, 0, z, 0.04, 0.012, 0.04, M.black);
    box(g, -0.07, 0.03, 0.19, 0.34, 0.25, 0.012, { color: '#1c1e1e', roughness: 0.2 });
    box(g, -0.08, 0.06, 0.197, 0.26, 0.18, 0.004, { color: '#2a3030', roughness: 0.05, metalness: 0.3 });
    box(g, 0.1, 0.07, 0.197, 0.012, 0.16, 0.012, M.chrome);
    box(g, 0.175, 0.03, 0.19, 0.13, 0.25, 0.012, M.greyPlastic);
    pl(g, 0.175, 0.24, 0.1965, 0.1, 0.035, TM(dispTex(o.time ?? '8:59', 'vfd', 96, 32), { emissive: 1 }), {});
    for (let i = 0; i < 9; i++) box(g, 0.145 + (i % 3) * 0.03, 0.1 + Math.floor(i / 3) * 0.03, 0.197, 0.022, 0.022, 0.004, { color: '#c8c8c0' });
  });

  // fridge: opts variant 'home' (cream two-door, magnets, a kid's drawing) | 'office' (white bar fridge) | 'drinks'
  // (glass-door display fridge, lit)
  def('fridge', { collide: true }, (K, o, g) => {
    const v = o.variant || 'home', r = rngOf(K, o, 'fr');
    if (v === 'drinks') {
      box(g, 0, 0, 0, 0.7, 1.9, 0.7, { color: '#1c1f20', roughness: 0.5 });
      pl(g, 0, 1.9 + 0.12, 0.351, 0.66, 0.2, TM(Tex.sign('COLD DRINKS', { style: 'shop', w: 0.66, h: 0.2, bg: '#b3261e', fg: '#fff', border: false }), { emissive: o.lit === false ? undefined : 0.6 }), {});
      box(g, 0, 1.9, 0, 0.7, 0.24, 0.7, { color: '#b3261e', roughness: 0.5 });
      pl(g, 0, 0.98, 0.34, 0.58, 1.6, TM(productTex(), { emissive: o.lit === false ? 0 : 0.35 }), {});
      box(g, 0, 0.1, 0.345, 0.62, 1.76, 0.012, 'glass', { cast: false });
      box(g, 0.27, 0.8, 0.36, 0.02, 0.6, 0.03, M.chrome);
      return;
    }
    const H = v === 'office' ? 0.86 : 1.72, W = v === 'office' ? 0.55 : 0.7;
    const body = { color: v === 'home' ? '#e2dccb' : '#e8e8e4', roughness: 0.4 };
    box(g, 0, 0.02, 0, W, H, 0.68, body);
    box(g, 0, 0, 0.01, W - 0.04, 0.05, 0.6, M.black);
    if (v === 'home') {
      box(g, 0, H * 0.72, 0.345, W - 0.02, 0.006, 0.004, M.black, { cast: false });
      for (const y of [H * 0.9, H * 0.55]) box(g, -W / 2 + 0.06, y - 0.15, 0.36, 0.03, 0.3, 0.03, { color: '#c8c2b0', roughness: 0.4 });
      const mag = ['#b3261e', '#2e86c1', '#f1c40f', '#27ae60'];
      for (let i = 0; i < 6; i++) cyl(g, (r() - 0.3) * W * 0.6, 0.9 + r() * 0.8, 0.345, 0.018, 0.012, { color: pick(mag, r), roughness: 0.4 }, { rx: 90, seg: 8 });
      pl(g, 0.12, 1.1, 0.3452, 0.2, 0.28, TM(drawingTex(o.drawing || 'NAN', 1)), { rz: -4 });
      pl(g, -0.05, 1.45, 0.3452, 0.14, 0.2, TM(noteTex('Thursday\nbingo 7pm', 'white')), { rz: 3 });
    } else {
      box(g, -W / 2 + 0.05, H * 0.5, 0.36, 0.03, 0.25, 0.03, M.chrome);
      pl(g, 0.05, H * 0.7, 0.3452, 0.2, 0.14, TM(noteTex('LABEL YOUR FOOD!!\n— mgmt', 'white', '#b3261e')), {});
    }
  });

  // sink_bench: kitchen bench — base cabinets, laminate top, stainless sink + mixer, tiled splashback, kettle, dish rack.
  // opts len (2.4), stove (true → cooktop + oven door), upper (wall cupboards), variant 'home'|'office'
  def('sink_bench', { collide: true }, (K, o, g) => {
    const len = o.len ?? 2.4, d = 0.6, H = 0.9, r = rngOf(K, o, 'sb'), home = o.variant !== 'office';
    const cab = home ? { color: '#d8cfb8', roughness: 0.55 } : { color: '#e2e0d8', roughness: 0.5 };
    box(g, 0, 0.1, 0, len, H - 0.14, d - 0.04, cab);
    box(g, 0, 0, 0.02, len, 0.1, d - 0.1, M.black);
    box(g, 0, H - 0.035, 0.01, len + 0.02, 0.035, d + 0.02, home ? { tex: 'metal', color: '#a89c80', roughness: 0.5, metalness: 0.02 } : M.laminate);
    const nd = Math.round(len / 0.6);
    for (let i = 0; i < nd; i++) { const x = -len / 2 + (i + 0.5) * (len / nd); box(g, x, 0.12, d / 2 - 0.02, len / nd - 0.02, H - 0.2, 0.02, cab); box(g, x + (i % 2 ? -1 : 1) * (len / nd / 2 - 0.06), 0.62, d / 2, 0.02, 0.1, 0.02, M.chrome); }
    const sx = -len * 0.2;
    box(g, sx, H - 0.03, 0.02, 0.62, 0.012, 0.44, M.stainless);
    box(g, sx, H - 0.2, 0.02, 0.5, 0.18, 0.36, { color: '#303434', roughness: 0.3, metalness: 0.6 });
    rod(g, [sx, H, -0.22], [sx, H + 0.28, -0.22], 0.015, M.chrome, { seg: 8 });
    rod(g, [sx, H + 0.28, -0.22], [sx, H + 0.3, -0.05], 0.013, M.chrome, { seg: 8 });
    box(g, 0, H, -d / 2 + 0.005, len, 0.6, 0.012, { tex: 'tile_white', color: home ? '#dfe6d8' : '#ffffff' }, { uv: 2 });
    // kettle, dish rack, detergent, tea canister
    cyl(g, len * 0.15, H, -0.1, 0.08, 0.2, M.stainless, { r2: 0.07, seg: 12 });
    box(g, len * 0.15 - 0.09, H + 0.08, -0.1, 0.03, 0.12, 0.03, M.black);
    box(g, sx + 0.45, H, 0.02, 0.3, 0.05, 0.3, M.chrome);
    for (let i = 0; i < 3; i++) K.prop('mug', sx + 0.36 + i * 0.08, 0.02, 90, { y: H + 0.05, collide: false });
    cyl(g, sx - 0.4, H, -0.18, 0.035, 0.2, { color: '#2e86c1', roughness: 0.3 }, { seg: 8 });
    cyl(g, len * 0.35, H, -0.2, 0.06, 0.16, { tex: 'metal', color: '#b8b4a8' }, { seg: 12 });
    if (o.stove) {
      const kx = len * 0.32;
      box(g, kx, H - 0.02, 0.02, 0.6, 0.02, 0.52, M.black);
      for (const [a, b] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.14], [0.14, 0.14]]) add(g, gTorus(0.07, 0.008, 4, 16), M.steelDk, kx + a, H + 0.004, 0.02 + b, { rx: 90 });
      box(g, kx, 0.12, d / 2 - 0.01, 0.58, 0.6, 0.03, M.black);
      box(g, kx, 0.3, d / 2 + 0.01, 0.4, 0.3, 0.005, { color: '#1c2222', roughness: 0.1 });
      cylc(g, kx, 0.68, d / 2 + 0.04, 0.012, 0.45, M.chrome, { rz: 90, seg: 6 });
    }
    if (o.upper) { box(g, 0, 1.5, -d / 2 + 0.17, len, 0.7, 0.34, cab); for (let i = 0; i < nd; i++) box(g, -len / 2 + (i + 0.5) * (len / nd) + (i % 2 ? -1 : 1) * (len / nd / 2 - 0.06), 1.55, -d / 2 + 0.35, 0.02, 0.1, 0.02, M.chrome); }
  });

  // corkboard (wall): cork with an aluminium frame and pinned papers. opts w (1.2), h (0.9), roster (bool), mount (1.5)
  def('corkboard', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.2, h = o.h ?? 0.9, y = (o.mount ?? 1.5) - h / 2, r = rngOf(K, o, 'cb');
    box(g, 0, y, 0.012, w, h, 0.024, TM(corkTex(), { roughness: 0.95 }), { uv: 1 / 0.6 });
    for (const s of [-1, 1]) { box(g, 0, y + (s > 0 ? h : -0.02), 0.014, w + 0.04, 0.02, 0.03, M.alu); box(g, s * (w / 2 + 0.01), y, 0.014, 0.02, h, 0.03, M.alu); }
    const papers = [];
    if (o.roster !== false) papers.push([TM(rosterTex()), 0.34, 0.24]);
    const pinned = () => pick([() => noteTex('Staff BBQ\nFri arvo!', 'white'), () => noteTex('Who took my\nstapler', 'sticky'), () => noticeTex('REMINDER: Offer the bundle on every sale.'), () => flyerTex(Math.floor(r() * 4))], r)();
    for (let i = 0; i < 4; i++) papers.push([TM(pinned()), 0.16 + r() * 0.08, 0.2 + r() * 0.08]);
    let px = -w / 2 + 0.06;
    for (const [m, pw, ph] of papers) {
      if (px + pw > w / 2 - 0.04) break;
      const py = y + h - 0.06 - ph / 2 - r() * (h - ph - 0.12);
      pl(g, px + pw / 2, py, 0.026, pw, ph, m, { rz: (r() - 0.5) * 6 });
      sph(g, px + pw / 2, py + ph / 2 - 0.02, 0.03, 0.008, { color: pick(['#b3261e', '#2e86c1', '#f1c40f', '#27ae60'], r) }, { seg: 6 });
      px += pw + 0.03 + r() * 0.04;
    }
  });

  // whiteboard: opts w (1.8), h (1.2), text (marker writing), variant 'wall' | 'mobile' (on a castor stand), mount (1.5)
  const markerTex = (text) => ctex('wb|' + text, 512, 342, (ctx, w, h, r) => {
    ctx.fillStyle = '#eef0ee'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 10; k++) { ctx.strokeStyle = `rgba(${pick(['40,60,140', '160,40,40', '30,30,30'], r)},0.08)`; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(r() * w, r() * h); ctx.quadraticCurveTo(r() * w, r() * h, r() * w, r() * h); ctx.stroke(); }
    const g2 = ctx.createLinearGradient(0, 0, w, h); g2.addColorStop(0, 'rgba(255,255,255,0.25)'); g2.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
    if (text) { const lines = String(text).split('\n'); lines.forEach((l, i) => hand(ctx, l, 30, 60 + i * 52, { size: 38, color: i === 0 ? '#1f3f8a' : pick(['#141414', '#b3261e', '#1f3f8a'], r), font: F.marker, weight: 'bold' })); }
  });
  def('whiteboard', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.8, h = o.h ?? 1.2, mob = o.variant === 'mobile', y = mob ? 0.75 : (o.mount ?? 1.5) - h / 2;
    const z = mob ? 0 : 0.015;
    box(g, 0, y, z, w, h, 0.02, M.white);
    pl(g, 0, y + h / 2, z + 0.0105, w - 0.02, h - 0.02, TM(markerTex(o.text || ''), { roughness: 0.25 }), {});
    for (const s of [-1, 1]) { box(g, 0, y + (s > 0 ? h : -0.02), z, w + 0.04, 0.025, 0.035, M.alu); box(g, s * (w / 2 + 0.01), y, z, 0.025, h, 0.035, M.alu); }
    box(g, 0, y - 0.04, z + 0.05, w * 0.6, 0.02, 0.07, M.alu);
    for (let i = 0; i < 3; i++) cylc(g, -0.2 + i * 0.1, y - 0.01, z + 0.05, 0.009, 0.13, { color: ['#1f3f8a', '#b3261e', '#141414'][i] }, { rz: 90, seg: 6 });
    box(g, 0.3, y - 0.02, z + 0.05, 0.13, 0.04, 0.05, { color: '#3a3a3a' });
    if (mob) { for (const s of [-1, 1]) { box(g, s * (w / 2 + 0.05), 0, 0, 0.04, y + h + 0.1, 0.04, M.alu); box(g, s * (w / 2 + 0.05), 0.06, 0, 0.06, 0.03, 0.55, M.alu); for (const zz of [-0.25, 0.25]) sph(g, s * (w / 2 + 0.05), 0.03, zz, 0.03, M.black, { seg: 6 }); } col(K, o, -w / 2 - 0.1, -0.3, w / 2 + 0.1, 0.3, y + h); }
  });
  // huddle_board: a mobile team-huddle whiteboard with the day's numbers. opts text (default huddle layout)
  def('huddle_board', { collide: true }, (K, o, g) => K.prop('whiteboard', 0, 0, 0, { ...o, variant: 'mobile', collide: false, text: o.text ?? 'HUDDLE — TODAY\nTARGET: 11\nBUNDLES!! offer every sale\nNPS: 72  ↓', name: undefined }) && null);

  // clock (wall): Kit.clock with settable hands. opts time ([8, 59]), running (false), mount (2.2)
  def('clock', { collide: false }, (K, o, g) => {
    const c = Kit.clock(o.time || [8, 59]);
    c.position.set(0, o.mount ?? 2.2, 0.03);
    g.add(c); live(c);
    c.userData.running = !!o.running;
    anim(K, (dt) => c.userData.tick(dt));
    g.userData.setTime = c.userData.setTime; g.userData.addMinutes = c.userData.addMinutes; g.userData.tick = c.userData.tick;
    g.userData.setRunning = (v = true) => { c.userData.running = !!v; };
    g.userData.clock = c;
  });

  // notice_board: glazed, lockable noticeboard with a header. opts title ('NOTICES'), w (1.0), h (0.8), variant 'wall' |
  // 'posts' (free-standing on two posts, outdoors), mount
  def('notice_board', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.0, h = o.h ?? 0.8, posts = o.variant === 'posts', y = posts ? 1.0 : (o.mount ?? 1.5) - h / 2, r = rngOf(K, o, 'nb');
    const frame = M.oak;
    if (posts) { for (const s of [-1, 1]) box(g, s * (w / 2 + 0.06), 0, 0, 0.08, y + h + 0.3, 0.08, M.timberGrey); box(g, 0, y + h + 0.24, 0.02, w + 0.3, 0.05, 0.3, { tex: 'metal', color: '#4e5a55' }, { rx: 8 }); }
    box(g, 0, y, 0.03, w + 0.08, h + 0.2, 0.06, frame);
    box(g, 0, y + 0.02, 0.04, w, h - 0.02, 0.04, TM(corkTex(), { roughness: 0.95 }), { uv: 1 / 0.6 });
    pl(g, 0, y + h + 0.08, 0.0605, w, 0.13, TM(Tex.sign(o.title ?? 'NOTICES', { style: 'shop', w, h: 0.13, bg: '#2a3a2a', fg: '#e8e2cc', border: false })), {});
    for (let i = 0; i < 5; i++) pl(g, -w / 2 + 0.12 + (i % 3) * (w / 3), y + h * (i < 3 ? 0.68 : 0.3), 0.081, 0.18, 0.24, TM(pick([noticeTex('BINGO — THURSDAY 7PM\nCommunity Hall'), noticeTex('Please sign the visitor book.'), noteTex('Lost: blue cardigan\nsee Unit 4', 'white'), flyerTex(Math.floor(r() * 4))], r)), { rz: (r() - 0.5) * 5 });
    box(g, 0, y + 0.02, 0.105, w, h - 0.02, 0.006, 'glass', { cast: false });
    box(g, w / 2 - 0.03, y + h / 2, 0.11, 0.02, 0.06, 0.02, M.chrome);
  });

  // framed_photo: opts subject 'family'|'staff1961'|'nan'|'percent'|'blank'|'landscape', text (caption / percentage),
  // variant 'wall' (default, hung at mount 1.6) | 'stand' (easel back, on a desk/dresser), w/h
  def('framed_photo', { collide: false }, (K, o, g) => {
    const stand = o.variant === 'stand', w = o.w ?? (stand ? 0.14 : 0.36), h = o.h ?? (stand ? 0.18 : 0.46);
    const sub = o.subject || (stand ? 'family' : 'landscape');
    const frame = { color: o.frame || (sub === 'staff1961' ? '#3a2a1a' : '#2a2622'), roughness: 0.5 };
    const p = grp(g, 0, stand ? 0 : (o.mount ?? 1.6) - h / 2, stand ? 0 : 0.012);
    if (stand) p.rotation.x = R(-12);
    box(p, 0, 0, 0, w, h, 0.02, frame);
    pl(p, 0, h / 2, 0.0105, w * 0.84, h * 0.84, TM(photoTex(sub, o.text || '')), {});
    box(p, 0, h * 0.08, 0.011, w * 0.84, h * 0.84, 0.002, { color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.12 }, { cast: false });
    if (stand) bar(g, [0, 0, -0.07], [0, h * 0.7, -0.01], 0.03, 0.006, frame);
  });

  // poster (wall): Tex.poster. opts text, style ('plan'|'faded'|'alarm'|'notice'; opts.kind is taken by Kit — it is
  // the prop kind), w (0.6), h (0.85), mount (1.5), sub
  def('poster', { collide: false }, (K, o, g) => {
    const w = o.w ?? 0.6, h = o.h ?? 0.85, r = rngOf(K, o, 'po');
    const style = o.style || o.variant || 'plan';
    pl(g, 0, o.mount ?? 1.5, 0.004, w, h, TM(Tex.poster(o.text ?? null, { kind: style, sub: o.sub, seed: o.seed ?? Math.floor(r() * 50) }), { transparent: true, alphaTest: 0.05 }), { rz: (r() - 0.5) * 2 });
  });

  // =================================================================================================================
  // SCREENS, PHONES, DEVICES
  // =================================================================================================================
  // A screen mesh whose Tex.screen canvas is created lazily (on the first userData.screen access or when a painter is
  // given), so rows of dead monitors cost nothing. Adds userData.screen / setOn / on to `ud`.
  function lazyScreen(K, ud, mesh, px, paint, on = true, intensity = 0.95, offSpec = null, isLive = true) {
    let scr = null, onMat = null, isOn = on && !!paint;
    const offMat = MAT(offSpec || { tex: 'screen_off' });
    const ensure = () => {
      if (!scr) { scr = Tex.screen(px[0], px[1]); scr.draw(paint || ((c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); })); onMat = MAT(TM(scr.tex, { emissive: 1, emissiveIntensity: intensity, roughness: 0.25, offset: false })); }
      return scr;
    };
    const apply = () => { mesh.material = isOn ? (ensure(), onMat) : offMat; };
    if (isLive) mesh.userData.kitMerge = false;
    apply();
    Object.defineProperty(ud, 'screen', { get() { const s = ensure(); if (!isOn) { isOn = true; apply(); } return s; }, enumerable: false, configurable: true });
    ud.setOn = (v = true) => { isOn = !!v; apply(); };
    Object.defineProperty(ud, 'on', { get: () => isOn, enumerable: false, configurable: true });
    return { ensure, get scr() { return scr; } };
  }
  const contentPainter = (content, r, arg) => {
    switch (content) {
      case 'login': case 'crm': return (c, w, h) => paintCRM(c, w, h);
      case 'cctv': return (c, w, h) => paintCCTV(c, w, h, arg || 1, r);
      case 'terminal': return (c, w, h) => paintTerminal(c, w, h, arg);
      case 'static': return (c, w, h) => paintStatic(c, w, h, r, 0.8);
      case 'ad': return (c, w, h) => paintAd(c, w, h, 0);
      case 'desktop': return (c, w, h) => { const g2 = c.createLinearGradient(0, 0, w, h); g2.addColorStop(0, '#0b4f52'); g2.addColorStop(1, '#00a8a8'); c.fillStyle = g2; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, h - 14, w, 14); Tex.drawWordmark(c, w * 0.3, h * 0.55, h * 0.16, { color: '#ffcc00' }); };
      case 'bars': return (c, w, h) => { ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach((col, i) => { c.fillStyle = col; c.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.75); }); c.fillStyle = '#111'; c.fillRect(0, h * 0.75, w, h * 0.25); };
      case 'lock': return (c, w, h) => paintLock(c, w, h, arg || '8:59');
      default: return null;
    }
  };

  // tv: flat TV. opts mount 'wall' (bracket, centre at mount 2.0) | 'stand' | 'ceiling' (hung at ceil 3.0), w (1.1),
  // content 'ad' (plan advertisement loop, default) | 'static' | 'bars' | 'off', lit/on, light (weak screen glow light)
  def('tv', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.1, h = w * 0.5625, m = o.mount || 'wall', r = rngOf(K, o, 'tv');
    let cy, cz = 0.06;
    if (m === 'stand') { box(g, 0, 0, 0, w * 0.9, 0.5, 0.45, M.oak); box(g, 0, 0.5, 0.0, 0.3, 0.02, 0.18, M.black); box(g, 0, 0.5, -0.02, 0.06, 0.12, 0.04, M.black); cy = 0.62 + h / 2; cz = 0; col(K, o, -w * 0.45, -0.225, w * 0.45, 0.225, 0.5); }
    else if (m === 'ceiling') { const ceil = o.ceil ?? 3.0; cy = ceil - 0.45 - h / 2; rod(g, [0, ceil, -0.05], [0, cy + h / 2 - 0.05, -0.05], 0.025, M.black); box(g, 0, cy - 0.1, -0.06, 0.25, 0.2, 0.04, M.black); box(g, 0, ceil - 0.01, -0.05, 0.2, 0.01, 0.2, M.black); cz = 0.02; }
    else { cy = o.mount === undefined || typeof o.mount === 'string' ? 2.0 : o.mount; box(g, 0, cy - 0.12, 0.02, 0.3, 0.24, 0.04, M.black); }
    const tvp = grp(g, 0, cy, cz); if (m === 'ceiling') tvp.rotation.x = R(12);
    boxc(tvp, 0, 0, 0, w + 0.04, h + 0.04, 0.05, M.blackGloss);
    const sm = add(tvp, gPlane(w, h), MAT({ tex: 'screen_off' }), 0, 0, 0.0255, { cast: false });
    box(tvp, w * 0.4, -h / 2 - 0.02, 0.026, 0.03, 0.006, 0.004, glowS('#ff3322', 0.8), { cast: false });
    const content = o.content ?? 'ad', on = o.lit !== false && o.on !== false && content !== 'off';
    const ls = lazyScreen(K, g.userData, sm, [320, 180], contentPainter(content, r) || (on ? contentPainter('ad', r) : null), on);
    if (on && content === 'ad') { let slide = 0, t0 = 0; anim(K, (dt, t) => { if (!g.userData.on || !ls.scr || g.userData.custom) return; if (t - t0 > 4) { t0 = t; slide = (slide + 1) % 3; ls.scr.draw((c, W, H) => paintAd(c, W, H, slide)); } }); }
    if (on && content === 'static') { let acc = 0; anim(K, (dt) => { if (!g.userData.on || !ls.scr || g.userData.custom) return; acc += dt; if (acc > 0.08) { acc = 0; ls.scr.draw((c, W, H) => paintStatic(c, W, H, Math.random, 0.8)); } }); }
    if (on && o.light) K.light('screen', 0, cy, cz + 0.4, { bank: o.bank, color: '#6fcfc6' });
  });

  // monitor (tabletop): LCD on a stand. opts content 'off' (default) | 'login' | 'desktop' | 'static' | 'terminal'
  def('monitor', { collide: false }, (K, o, g) => {
    const w = o.w ?? 0.52, h = w * 0.62, r = rngOf(K, o, 'mon');
    box(g, 0, 0, 0.02, 0.22, 0.015, 0.16, M.darkPlastic);
    box(g, 0, 0.015, -0.02, 0.05, 0.2, 0.03, M.darkPlastic);
    const mp = grp(g, 0, 0.12 + h / 2, 0.0); mp.rotation.x = R(-4);
    boxc(mp, 0, 0, 0, w + 0.03, h + 0.03, 0.035, M.darkPlastic);
    boxc(mp, 0, 0, -0.03, w * 0.5, h * 0.5, 0.04, M.darkPlastic);
    const sm = add(mp, gPlane(w, h), MAT({ tex: 'screen_off' }), 0, 0, 0.0181, { cast: false });
    box(mp, w * 0.44, -h / 2 - 0.012, 0.018, 0.012, 0.005, 0.004, glowS(o.content && o.content !== 'off' ? '#3dff9a' : '#ff9a2e', 0.6), { cast: false });
    if (o.note) pl(mp, w * 0.4, h * 0.4, 0.019, 0.076, 0.076, TM(noteTex(o.note, 'sticky')), { rz: 8 });
    const content = o.content || 'off';
    lazyScreen(K, g.userData, sm, [256, 160], contentPainter(content, r), content !== 'off', 0.95, null, o.live !== false);
  });

  // crt (tabletop): beige CRT monitor. opts content 'off' | 'cctv' | 'terminal' | 'static', cam (CCTV camera number)
  def('crt', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'crt'), beige = M.beige;
    box(g, 0, 0, -0.02, 0.26, 0.03, 0.24, beige);
    box(g, 0, 0.03, -0.02, 0.1, 0.03, 0.1, beige);
    const cp = grp(g, 0, 0.06, 0);
    box(cp, 0, 0, 0.02, 0.4, 0.34, 0.12, beige);
    add(cp, gTaper(0.38, 0.3, 0.24, 0.18, 0.3), beige, 0, 0.03, -0.04, { rx: -90 });
    box(cp, 0, 0.03, 0.078, 0.34, 0.27, 0.01, M.black);
    const sm = add(cp, gPlane(0.3, 0.23), MAT({ tex: 'screen_off' }), 0, 0.17, 0.084, { cast: false });
    box(cp, 0.14, 0.015, 0.081, 0.02, 0.012, 0.005, glowS('#3dff9a', 0.7), { cast: false });
    const content = o.content || 'off';
    lazyScreen(K, g.userData, sm, [192, 144], contentPainter(content, r, o.cam), content !== 'off', 0.8);
  });

  // cctv_bank: security desk with a steel rack of six CRTs showing grainy camera views, a recorder, joystick, logbook.
  // userData.screens[] (Tex.screen objects, index = camera − 1)
  def('cctv_bank', { collide: true }, (K, o, g) => {
    const r = rngOf(K, o, 'cctv');
    box(g, 0, 0.72, 0, 1.9, 0.03, 0.75, M.lamGrey);
    for (const s of [-1, 1]) box(g, s * 0.92, 0, 0, 0.05, 0.72, 0.7, M.lamGrey);
    box(g, 0, 0.3, -0.33, 1.8, 0.42, 0.02, M.lamGrey);
    const rack = paint('#4a5050');
    for (const s of [-1, 1]) box(g, s * 0.8, 0.75, -0.2, 0.04, 1.05, 0.35, rack);
    box(g, 0, 1.24, -0.2, 1.64, 0.03, 0.35, rack); box(g, 0, 1.78, -0.2, 1.64, 0.03, 0.35, rack);
    const screens = [];
    for (let i = 0; i < 6; i++) {
      const x = -0.52 + (i % 3) * 0.52, y = i < 3 ? 1.27 : 0.75;
      const c = grp(g, x, y, -0.2, (r() - 0.5) * 3);
      box(c, 0, 0, 0, 0.44, 0.4, 0.3, { color: '#2a2c2c', roughness: 0.5 });
      box(c, 0, 0.04, 0.15, 0.38, 0.32, 0.01, M.black);
      const sm = add(c, gPlane(0.33, 0.26), MAT({ tex: 'screen_off' }), 0, 0.2, 0.1555, { cast: false });
      const ud = {};
      lazyScreen(K, ud, sm, [192, 144], contentPainter('cctv', r, i + 1), true, 0.75);
      screens.push(ud.screen);
    }
    g.userData.screens = screens;
    box(g, -0.5, 0.75, 0.15, 0.42, 0.08, 0.3, M.black);
    pl(g, -0.5, 0.79, 0.3005, 0.1, 0.025, TM(dispTex('REC 20:59', 'vfd', 128, 32), { emissive: 1 }), {});
    box(g, 0.35, 0.75, 0.18, 0.3, 0.05, 0.18, M.darkPlastic);
    rod(g, [0.42, 0.8, 0.18], [0.42, 0.92, 0.16], 0.012, M.black, { seg: 6 }); sph(g, 0.42, 0.93, 0.16, 0.02, { color: '#b3261e' }, { seg: 8 });
    box(g, 0.0, 0.75, 0.2, 0.3, 0.02, 0.22, { color: '#2a3a5a', roughness: 0.8 }, { ry: 8 });
    K.prop('coffee_cup', 0.75, 0.2, 0, { y: 0.75, collide: false });
  });

  // terminal (tabletop): the back-office workstation — LCD with the retro CRM login, beige tower, keyboard, mouse.
  // opts content ('login'), note (sticky note text on the bezel)
  def('terminal', { collide: false }, (K, o, g) => {
    const mon = K.prop('monitor', 0, -0.05, 0, { collide: false, content: o.content ?? 'login', note: o.note });
    Object.defineProperty(g.userData, 'screen', { get: () => mon.userData.screen, enumerable: false, configurable: true });
    g.userData.setOn = (v) => mon.userData.setOn(v);
    box(g, 0.02, 0, 0.22, 0.46, 0.025, 0.16, M.beige);
    for (let i = 0; i < 4; i++) box(g, 0.02, 0.025, 0.17 + i * 0.035, 0.42, 0.006, 0.028, M.beigeDk, { cast: false });
    box(g, 0.32, 0, 0.23, 0.06, 0.025, 0.1, M.beige);
    box(g, 0.45, 0, -0.1, 0.2, 0.42, 0.45, M.beige);
    box(g, 0.45, 0.3, 0.126, 0.14, 0.02, 0.004, M.black);
    cyl(g, 0.5, 0.1, 0.126, 0.012, 0.004, glowS('#3dff9a', 0.9), { rx: 90, seg: 8 });
  });

  // printer (tabletop): opts variant 'laser' (contract printer, a printed page in the tray) | 'receipt' (thermal, a
  // curl of paper) | 'visitor' (label printer with a pass sticking out), text (visitor label)
  def('printer', { collide: false }, (K, o, g) => {
    const v = o.variant || 'laser';
    if (v === 'receipt') {
      box(g, 0, 0, 0, 0.14, 0.12, 0.2, M.darkPlastic);
      box(g, 0, 0.12, -0.02, 0.13, 0.03, 0.13, M.darkPlastic, { rx: -8 });
      tube(g, [[0, 0.13, 0.06], [0, 0.2, 0.09], [0, 0.22, 0.16], [0, 0.14, 0.22], [0, 0.02, 0.24]], 0.001, 'receipt', { key: 'rcptcurl', radial: 2, seg: 10 });
      add(g, gBox(0.06, 0.34, 0.001), 'receipt', 0, 0.13, 0.15, { rx: -60 });
      cyl(g, 0.05, 0.1, 0.101, 0.006, 0.004, glowS('#3dff9a', 0.9), { rx: 90, seg: 6 });
      return;
    }
    if (v === 'visitor') {
      box(g, 0, 0, 0, 0.14, 0.14, 0.2, M.white);
      box(g, 0, 0.14, -0.02, 0.12, 0.02, 0.14, M.greyPlastic);
      add(g, gBox(0.09, 0.055, 0.001), TM(labelTex(o.text || 'VISITOR', 'label')), 0, 0.09, 0.105, { rx: -30 });
      cyl(g, 0.05, 0.1, 0.101, 0.006, 0.004, glowS('#3dff9a', 0.9), { rx: 90, seg: 6 });
      return;
    }
    box(g, 0, 0, 0, 0.42, 0.24, 0.38, M.offwhite);
    box(g, 0, 0.24, -0.02, 0.4, 0.04, 0.3, M.greyPlastic, { rx: -3 });
    box(g, 0, 0.03, 0.2, 0.3, 0.02, 0.1, M.greyPlastic);
    box(g, 0, 0.05, 0.22, 0.21, 0.004, 0.14, 'paper', { rx: 4, cast: false });
    box(g, 0, 0.25, 0.1, 0.28, 0.006, 0.18, TM(contractPageTex()), { rx: -3, uv: false });
    box(g, 0.14, 0.18, 0.191, 0.1, 0.04, 0.004, M.darkPlastic);
    cyl(g, 0.17, 0.2, 0.193, 0.006, 0.004, glowS('#3dff9a', 1), { rx: 90, seg: 6 });
    pl(g, -0.12, 0.12, 0.1915, 0.1, 0.03, TM(labelTex('CONTRACTS', 'label')), {});
  });
  const contractPageTex = () => ctex('contractpage', 128, 180, (ctx, w, h, r) => {
    ctx.fillStyle = '#f2f0ea'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = BR.teal; ctx.fillRect(0, 0, w, 14);
    txt(ctx, 'SERVICE AGREEMENT', 8, 26, { size: 8, font: F.sans, weight: 'bold', color: '#222' });
    for (let i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(40,40,40,0.5)'; ctx.fillRect(8, 34 + i * 7, (w - 16) * (0.6 + r() * 0.4), 2); }
    ctx.fillStyle = '#222'; ctx.fillRect(8, h - 24, 60, 1); hand(ctx, 'Aidan', 10, h - 27, { size: 10, color: '#1f2c6e' });
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(w - 26, h - 34, 20, 10); txt(ctx, 'SIGN', w - 16, h - 26, { size: 6, font: F.sans, weight: 'bold', color: '#111', align: 'center' });
  });

  // photocopier: floor-standing copier with drawers, feeder lid, panel and a light bar that sweeps under the glass
  // every few seconds (opts.sweep, default true; light: a weak pooled glow that pulses with it)
  def('photocopier', { collide: true }, (K, o, g) => {
    const body = { color: '#d9d6cc', roughness: 0.5 };
    box(g, 0, 0, 0, 0.62, 0.55, 0.66, body);
    for (let i = 0; i < 3; i++) { box(g, 0, 0.05 + i * 0.16, 0.331, 0.58, 0.14, 0.01, { color: '#cfccc2', roughness: 0.5 }); box(g, 0, 0.13 + i * 0.16, 0.34, 0.16, 0.02, 0.02, M.greyPlastic); }
    box(g, 0, 0.55, 0, 0.62, 0.42, 0.66, body);
    box(g, -0.36, 0.72, 0.05, 0.14, 0.02, 0.36, M.greyPlastic, { rz: -6 });
    box(g, 0, 0.97, 0.0, 0.6, 0.012, 0.52, { color: '#1a2626', roughness: 0.05, metalness: 0.3 });
    box(g, 0, 0.982, -0.02, 0.62, 0.1, 0.58, M.greyPlastic);
    box(g, 0.22, 0.97, 0.3, 0.2, 0.05, 0.12, M.darkPlastic, { rx: -20 });
    pl(g, 0.2, 1.005, 0.345, 0.08, 0.035, TM(dispTex('READY', 'lcd', 96, 40), { emissive: 0.5 }), { rx: -70 });
    const barM = glowMat('#cfeee6', 0);
    const lb = box(g, 0, 0.955, 0, 0.56, 0.012, 0.03, barM, { cast: false, live: true });
    let sweep = o.sweep !== false;
    const hl = o.light ? K.light('screen', 0, 1.1, 0.3, { color: '#cfeee6', intensity: 0.001, distance: 5, bank: o.bank }) : null;
    anim(K, (dt, t) => {
      if (!sweep) { barM.emissiveIntensity = 0; return; }
      const k = (t % 6) / 6, on = k < 0.35, f = on ? k / 0.35 : 0;
      barM.emissiveIntensity = on ? 3 : 0; lb.position.z = -0.24 + f * 0.48;
      if (hl) hl.intensity = on ? 2.5 * Math.sin(f * Math.PI) : 0.001;
    });
    g.userData.setSweep = (v = true) => { sweep = !!v; };
  });

  // --- phones --------------------------------------------------------------------------------------------------
  const deskKeysTex = () => ctex('deskkeys', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#4a4f52'; ctx.fillRect(0, 0, w, h);
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach((k, i) => { const x = 12 + (i % 3) * 26, y = 44 + Math.floor(i / 3) * 21; ctx.fillStyle = '#d8d8d4'; ctx.fillRect(x, y, 22, 16); txt(ctx, k, x + 11, y + 13, { size: 12, font: F.sans, weight: 'bold', color: '#222', align: 'center' }); });
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#2a2e30'; ctx.fillRect(96, 44 + i * 20, 22, 14); }
    ctx.fillStyle = '#9aa88a'; ctx.fillRect(10, 8, 108, 26);
    txt(ctx, 'Line 1   08:59', 16, 25, { size: 11, font: F.mono, color: '#1e261c' });
  });
  function handsetBuild(p, col) { box(p, 0, 0, 0, 0.05, 0.03, 0.2, col); box(p, 0, -0.015, 0.085, 0.055, 0.04, 0.05, col); box(p, 0, -0.015, -0.085, 0.055, 0.04, 0.05, col); return p; }
  // desk_phone (tabletop): office phone — base, keypad, LCD, handset on the cradle (userData.handset), coiled cord,
  // message LED. opts ringing (LED flashes; userData.setRinging), color
  def('desk_phone', { collide: false }, (K, o, g) => {
    const col = { color: o.color || '#5a5f62', roughness: 0.45 };
    add(g, gTaper(0.2, 0.22, 0.2, 0.14, 0.06, -0.02), col, 0, 0, 0, {});
    pl(g, 0.02, 0.058, 0.0, 0.12, 0.13, TM(deskKeysTex()), { rx: -70 });
    const hs = grp(g, -0.075, 0.075, -0.0, 0, 'handset'); hs.rotation.x = R(-15);
    handsetBuild(hs, col);
    if (dynamic(o)) live(hs);
    tube(g, [[-0.1, 0.03, 0.06], [-0.12, 0.01, 0.1], [-0.08, 0.004, 0.14], [-0.02, 0.004, 0.13], [0.02, 0.01, 0.08]], 0.005, TM(coilTex('#3a3e40'), { roughness: 0.5 }), { key: 'deskcord', radial: 4, seg: 16, cast: false });
    // the message LED gets its own material only when the phone may ring (rows of dead phones stay one batch)
    if (dynamic(o, 'ringing')) {
      const led = lampMat('#402020', '#ff2a1c', 0);
      box(g, 0.08, 0.062, 0.07, 0.012, 0.006, 0.012, led, { cast: false, live: true });
      let ringing = !!o.ringing;
      anim(K, (dt, t) => { led.emissiveIntensity = ringing && (t % 0.5) < 0.25 ? 3 : 0; });
      g.userData.setRinging = (v = true) => { ringing = !!v; };
    } else {
      box(g, 0.08, 0.062, 0.07, 0.012, 0.006, 0.012, { color: '#402020', roughness: 0.3 }, { cast: false });
      g.userData.setRinging = () => { baked('desk_phone', null); };
    }
    g.userData.handset = hs;
  });
  const dialTex = () => ctex('rotarydial', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.48, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8ccb0'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.22, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (0.25 + (i / 12) * 1.55) + Math.PI / 2, x = w / 2 + Math.cos(a) * w * 0.34, y = h / 2 + Math.sin(a) * w * 0.34;
      ctx.fillStyle = '#f4f0e4'; ctx.beginPath(); ctx.arc(x, y, w * 0.07, 0, TAU); ctx.fill();
      txt(ctx, String((i + 1) % 10), x, y + 8, { size: 22, font: F.sans, weight: 'bold', color: '#222', align: 'center' });
      ctx.strokeStyle = '#8a8270'; ctx.lineWidth = 2; ctx.stroke();
    }
    txt(ctx, 'SH 4471', w / 2, h / 2 + 6, { size: 18, font: F.serif, color: '#5a4a30', align: 'center' });
    TU.age(ctx, w, h, r, 0.6);
  });
  // rotary_phone (tabletop): 1970s rotary phone (Nan's hall phone). opts color ('#cfc3a4'); userData.handset
  def('rotary_phone', { collide: false }, (K, o, g) => {
    const col = { color: o.color || '#cfc3a4', roughness: 0.35 };
    add(g, gTaper(0.2, 0.22, 0.14, 0.14, 0.1, -0.01), col, 0, 0, 0, {});
    add(g, gTaper(0.14, 0.14, 0.1, 0.07, 0.04, -0.01), col, 0, 0.1, -0.01, {});
    add(g, gCircle(0.058, 24), TM(dialTex(), { roughness: 0.4 }), 0, 0.085, 0.085, { rx: -50 });
    add(g, gTorus(0.058, 0.004, 4, 24), M.chrome, 0, 0.0852, 0.0852, { rx: -50 });
    for (const s of [-1, 1]) box(g, s * 0.06, 0.12, -0.02, 0.025, 0.04, 0.03, col);
    const hs = grp(g, 0, 0.15, -0.02, 90, 'handset');
    handsetBuild(hs, col); if (dynamic(o)) live(hs);
    tube(g, [[0.1, 0.05, -0.02], [0.14, 0.02, 0.02], [0.14, 0.004, 0.1], [0.12, 0.08, 0.06], [0.12, 0.13, -0.02]], 0.005, TM(coilTex('#b9ad8e'), { roughness: 0.4 }), { key: 'rotcord', radial: 4, seg: 16, cast: false });
    g.userData.handset = hs;
  });
  // bedside_phone (tabletop): beige hospital push-button phone with a small LCD. opts text (display, e.g.
  // 'SIGNAL HILL MAST'), display ('large': a raised, lit LCD on an angled bezel that reads in a close-up);
  // userData.setText(str), setRinging(bool), handset
  def('bedside_phone', { collide: false }, (K, o, g) => {
    const col = { color: '#d2c8ae', roughness: 0.4 };
    add(g, gTaper(0.19, 0.21, 0.17, 0.13, 0.065, -0.02), col, 0, 0, 0, {});
    const big = o.display === 'large';
    const dw = big ? 0.12 : 0.09, dh = big ? 0.034 : 0.025, dy = big ? 0.079 : 0.063, dz = big ? -0.038 : -0.03, drx = big ? -58 : -70;
    const dTex = (t) => TM(dispTex(t || '', 'lcd', big ? 256 : 160, big ? 72 : 40), { emissive: big ? 0.75 : 0.45 });
    if (big) box(g, 0.03, 0.062, dz, dw + 0.024, 0.024, dh + 0.012, { color: '#bdb398', roughness: 0.45 }, { rx: -32 });
    const disp = pl(g, 0.03, dy, dz, dw, dh, dTex(o.text), { rx: drx, live: true });
    for (let i = 0; i < 12; i++) box(g, 0.0 + (i % 3) * 0.028, 0.055, 0.0 + Math.floor(i / 3) * 0.022, 0.02, 0.01, 0.016, { color: '#ece6d4' });
    const hs = grp(g, -0.07, 0.078, 0, 0, 'handset'); hs.rotation.x = R(-12);
    handsetBuild(hs, col); if (dynamic(o)) live(hs);
    tube(g, [[-0.1, 0.03, 0.06], [-0.11, 0.01, 0.11], [-0.06, 0.004, 0.14], [0.0, 0.01, 0.1]], 0.005, TM(coilTex('#b9ad8e'), { roughness: 0.4 }), { key: 'bedcord', radial: 4, seg: 14, cast: false });
    const led = lampMat('#402020', '#ff2a1c', 0); box(g, 0.08, 0.06, 0.07, 0.012, 0.006, 0.012, led, { cast: false });
    let ringing = !!o.ringing;
    anim(K, (dt, t) => { led.emissiveIntensity = ringing && (t % 0.6) < 0.3 ? 3 : 0; });
    g.userData.setText = (t) => { disp.material = MAT(dTex(t)); };
    g.userData.setRinging = (v = true) => { ringing = !!v; };
    g.userData.handset = hs;
  });
  // wall_phone (wall): domestic wall phone with the handset hung on the body and a long coiled cord. mount (1.4)
  def('wall_phone', { collide: false }, (K, o, g) => {
    const col = { color: o.color || '#cfc3a4', roughness: 0.35 }, y = o.mount ?? 1.4;
    box(g, 0, y - 0.12, 0.03, 0.12, 0.24, 0.06, col);
    pl(g, 0, y - 0.02, 0.061, 0.08, 0.1, TM(deskKeysTex()), {});
    const hs = grp(g, 0, y - 0.05, 0.08, 0, 'handset'); hs.rotation.x = R(90); hs.rotation.z = R(90);
    handsetBuild(hs, col); if (dynamic(o)) live(hs);
    tube(g, [[0.05, y - 0.2, 0.08], [0.06, y - 0.5, 0.1], [0.02, y - 0.75, 0.1], [0.06, y - 0.6, 0.12], [0.07, y - 0.15, 0.1]], 0.006, TM(coilTex('#b9ad8e'), { roughness: 0.4 }), { key: 'wallcord' + q3(y), radial: 4, seg: 20, cast: false });
    g.userData.handset = hs;
  });
  // answering_machine (tabletop): 1990s machine with a cassette window, buttons and a blinking red message count.
  // opts count (1), blink (true); userData.setCount(n), setBlink(bool)
  def('answering_machine', { collide: false }, (K, o, g) => {
    box(g, 0, 0, 0, 0.22, 0.05, 0.16, M.darkPlastic);
    box(g, -0.03, 0.05, -0.02, 0.1, 0.006, 0.07, { color: '#333a3a', roughness: 0.1, metalness: 0.3 });
    add(g, gTorus(0.012, 0.004, 4, 10), M.black, -0.055, 0.051, -0.02, { rx: 90 }); add(g, gTorus(0.012, 0.004, 4, 10), M.black, -0.005, 0.051, -0.02, { rx: 90 });
    for (let i = 0; i < 5; i++) box(g, -0.08 + i * 0.035, 0.05, 0.05, 0.026, 0.008, 0.018, i === 2 ? { color: '#8a2a22' } : M.greyPlastic);
    const disp = pl(g, 0.075, 0.051, -0.03, 0.04, 0.03, TM(dispTex(String(o.count ?? 1), 'led', 48, 36), { emissive: 1.4 }), { rx: -90, live: true });
    let blink = o.blink !== false, count = o.count ?? 1;
    const offM = MAT({ color: '#140605' });
    const onM = () => MAT(TM(dispTex(String(count), 'led', 48, 36), { emissive: 1.4 }));
    let cur = onM();
    anim(K, (dt, t) => { disp.material = !blink || (t % 1) < 0.55 ? cur : offM; });
    g.userData.setCount = (n) => { count = n; cur = onM(); };
    g.userData.setBlink = (v = true) => { blink = !!v; };
    pl(g, 0.05, 0.051, 0.03, 0.05, 0.015, TM(labelTex('MSG', 'dark')), { rx: -90 });
  });
  // modem (tabletop): standing home modem with five status LEDs and two cables. opts state 'off'|'boot'|'red'|'ok',
  // variant 'standing' | 'flat'; userData.setState(s), boot(sec=4) → Promise (cycles, then solid red)
  def('modem', { collide: false }, (K, o, g) => {
    const flat0 = o.variant === 'flat';
    const body = { color: '#e4e2da', roughness: 0.35 };
    if (flat0) box(g, 0, 0, 0, 0.22, 0.04, 0.16, body);
    else { box(g, 0, 0, 0, 0.1, 0.02, 0.1, M.greyPlastic); box(g, 0, 0.02, 0, 0.16, 0.22, 0.045, body); box(g, 0, 0.24, 0, 0.16, 0.006, 0.045, { color: BR.teal, roughness: 0.4 }); }
    const labels = ['PWR', 'DSL', 'NET', 'WiFi', 'TEL'];
    const leds = labels.map((l, i) => {
      const m = lampMat('#2a2e2c', '#3dff9a', 0);
      if (flat0) box(g, -0.07 + i * 0.035, 0.04, 0.07, 0.01, 0.004, 0.006, m, { cast: false });
      else box(g, -0.05 + i * 0.025, 0.2, 0.0232, 0.008, 0.008, 0.002, m, { cast: false });
      return m;
    });
    if (!flat0) pl(g, 0, 0.18, 0.0232, 0.14, 0.012, TM(labelTex(labels.join('  '), 'label')), {});
    tube(g, [[0.04, 0.03, -0.02], [0.08, 0.004, -0.1], [0.2, 0.004, -0.2], [0.35, 0.004, -0.24]], 0.004, M.black, { key: 'modemc1', radial: 4, seg: 12, cast: false });
    tube(g, [[-0.03, 0.03, -0.02], [-0.06, 0.004, -0.12], [-0.1, 0.004, -0.3], [-0.05, 0.004, -0.45]], 0.003, { color: '#d8d4c8' }, { key: 'modemc2', radial: 4, seg: 12, cast: false });
    const GREEN = new THREE.Color('#3dff9a'), RED = new THREE.Color('#ff2a1c'), AMB = new THREE.Color('#ffab2e');
    const set = (i, on, col = GREEN) => { leds[i].emissive.copy(col); leds[i].emissiveIntensity = on ? 2.4 : 0; leds[i].color.set(on ? col : '#2a2e2c'); };
    let state = o.state || 'off', t0 = 0, dur = 4, resolve = null, tNow = 0;
    const setState = (s) => { state = s; t0 = tNow; if (s !== 'boot' && resolve) { const f = resolve; resolve = null; f(state); } };
    anim(K, (dt, t) => {
      tNow = t;
      if (state === 'off') { for (let i = 0; i < 5; i++) set(i, false); return; }
      if (state === 'ok') { for (let i = 0; i < 4; i++) set(i, true); set(4, (t % 0.3) < 0.15); return; }
      if (state === 'red') { set(0, true); set(1, (t % 1.2) < 0.6, AMB); set(2, true, RED); set(3, false); set(4, false); return; }
      const k = (t - t0) / dur;           // boot: power, then a chase across the LEDs, then everything blinks, then red
      set(0, true);
      if (k < 0.55) { const c = Math.floor((t - t0) * 8) % 4; for (let i = 1; i < 5; i++) set(i, i - 1 === c, i === 2 ? AMB : GREEN); }
      else if (k < 1) { const b = (t % 0.3) < 0.15; for (let i = 1; i < 5; i++) set(i, b, AMB); }
      else { state = 'red'; if (resolve) { const f = resolve; resolve = null; f('red'); } }
    });
    g.userData.setState = setState;
    g.userData.boot = (sec = 4) => new Promise((res) => { dur = sec; if (resolve) resolve('interrupted'); resolve = res; state = 'boot'; t0 = tNow; });
    Object.defineProperty(g.userData, 'state', { get: () => state, enumerable: false });
  });
  const modemBoxTex = () => ctex('modembox', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#f3f2ec'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = BR.teal; ctx.fillRect(0, 0, w, h * 0.3);
    Tex.drawWordmark(ctx, 14, h * 0.2, h * 0.11, { color: BR.yellow });
    txt(ctx, '5G HOME INTERNET', 14, h * 0.4, { size: 20, font: F.heavy, weight: '900', color: BR.ink });
    txt(ctx, 'Plug in. Switch on. Connected.*', 14, h * 0.47, { size: 11, font: F.sans, color: '#333' });
    ctx.fillStyle = '#e2e0d8'; ctx.fillRect(w * 0.55, h * 0.5, w * 0.28, h * 0.42); ctx.fillStyle = BR.teal; ctx.fillRect(w * 0.55, h * 0.5, w * 0.28, 6);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#3dff9a'; ctx.fillRect(w * 0.6 + i * 10, h * 0.62, 5, 3); }
    txt(ctx, '*Coverage varies by area.', 14, h * 0.95, { size: 9, font: F.sans, color: '#555' });
    TU.age(ctx, w, h, r, 0.8);
  });
  // modem_box: retail modem box. opts open (torn plastic, flaps up, modem half out), lights ('blink' → the modem's LED
  // blinks red), note (handwritten sticky note on the lid)
  def('modem_box', { collide: false }, (K, o, g) => {
    const bt = TM(modemBoxTex(), { roughness: 0.6 });
    box(g, 0, 0, 0, 0.32, 0.12, 0.26, bt, { uv: false });
    if (o.open) {
      for (const s of [-1, 1]) add(g, gBox(0.32, 0.004, 0.13), bt, 0, 0.12 + 0.05, s * 0.19, { rx: s * 70 });
      box(g, 0.02, 0.1, 0.0, 0.2, 0.22, 0.05, { color: '#e4e2da', roughness: 0.35 }, { rz: -20 });
      box(g, 0, 0.115, 0, 0.33, 0.01, 0.27, { tex: 'plastic_sheet', opacity: 0.7 }, { rz: 3, cast: false });
    } else box(g, 0, 0.12, 0, 0.325, 0.002, 0.265, { color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.18 }, { cast: false });
    if (o.lights === 'blink' || o.lights === true) { K.light('led', 0.06, o.open ? 0.27 : 0.125, o.open ? 0.02 : 0.1, { color: '#ff2a1c', blink: 1.1, duty: 0.5, size: 0.006, halo: 0.12 }); }
    if (o.note) flat(g, -0.06, 0.1225, 0.02, 0.076, 0.076, TM(noteTex(o.note, 'sticky', '#1f2c6e')), { ry: 12 });
  });
  // base_station (tabletop): medical alarm base — big red help button, grille, LCD ("NO LINE"), blinking red status LED.
  // opts text ('NO LINE'), blink (true); userData.setText(str), setBlink(bool)
  def('base_station', { collide: false }, (K, o, g) => {
    add(g, gTaper(0.2, 0.15, 0.18, 0.12, 0.06, -0.01), { color: '#ecebe4', roughness: 0.35 }, 0, 0, 0, {});
    cyl(g, 0.04, 0.052, 0.0, 0.04, 0.02, { color: '#b3261e', roughness: 0.35 }, { seg: 16, rx: -12 });
    pl(g, 0.04, 0.074, 0.0, 0.05, 0.02, TM(labelTex('HELP', 'red')), { rx: -78 });
    for (let i = 0; i < 5; i++) box(g, -0.06, 0.055, -0.03 + i * 0.012, 0.06, 0.004, 0.004, M.darkPlastic, { cast: false });
    const disp = pl(g, -0.055, 0.061, 0.04, 0.06, 0.02, TM(dispTex(o.text ?? 'NO LINE', 'lcd', 128, 40), { emissive: 0.3 }), { rx: -78, live: true });
    const led = lampMat('#402020', '#ff2a1c', 0);
    box(g, 0.075, 0.057, 0.05, 0.008, 0.005, 0.008, led, { cast: false });
    let blink = o.blink !== false;
    anim(K, (dt, t) => { led.emissiveIntensity = !blink || (t % 1.6) < 0.25 ? 3 : 0; });
    tube(g, [[-0.08, 0.02, -0.05], [-0.12, 0.004, -0.12], [-0.2, 0.004, -0.2], [-0.3, 0.004, -0.22]], 0.003, { color: '#d8d4c8' }, { key: 'basec', radial: 4, seg: 10, cast: false });
    g.userData.setText = (t) => { disp.material = MAT(TM(dispTex(t, 'lcd', 128, 40), { emissive: 0.3 })); };
    g.userData.setBlink = (v = true) => { blink = !!v; };
  });
  // pendant: personal alarm pendant (lying flat, lanyard loop coiled beside it — never worn). opts glow (Outage: the
  // button glows red with a halo; userData.setGlow)
  def('pendant', { collide: false }, (K, o, g) => {
    cyl(g, 0, 0, 0, 0.026, 0.012, { color: '#eeeeea', roughness: 0.35 }, { seg: 18 });
    const bm = lampMat('#b3261e', '#ff2a1c', 0);
    cyl(g, 0, 0.012, 0, 0.012, 0.004, bm, { seg: 14 });
    add(g, gTorus(0.06, 0.0025, 4, 20), { color: '#2a2a2e', roughness: 0.8 }, -0.07, 0.003, 0.01, { rx: 90, s: [1, 0.7, 1] });
    box(g, -0.02, 0.004, 0, 0.02, 0.006, 0.008, M.greyPlastic);
    let halo = null;
    const setGlow = (v = true) => {
      bm.emissiveIntensity = v ? 3.5 : 0;
      if (v && !halo) halo = Render.halo([0, 0.04, 0], { parent: g, color: '#ff3322', size: 0.8, opacity: 0.7 });
      if (halo) halo.visible = !!v;
    };
    setGlow(!!o.glow);
    if (o.glow) anim(K, (dt, t) => { if (bm.emissiveIntensity > 0) bm.emissiveIntensity = 2.8 + Math.sin(t * 2.2) * 0.8; });
    g.userData.setGlow = setGlow;
  });
  // phone_socket (wall, at skirting height): opts variant 'old' (cream 610 socket) | 'new' (white RJ11), plugged (a
  // plug with a cord along the skirting), mount (0.3)
  def('phone_socket', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 0.3, old = o.variant !== 'new';
    box(g, 0, y - 0.06, 0.006, 0.075, 0.12, 0.012, { color: old ? '#dcd2b8' : '#ecebe6', roughness: 0.4 });
    if (old) { box(g, 0, y - 0.03, 0.012, 0.035, 0.05, 0.004, M.black); for (const s of [-1, 1]) cyl(g, 0, y + s * 0.045, 0.0125, 0.004, 0.002, M.chrome, { rx: 90, seg: 6 }); }
    else box(g, 0, y - 0.015, 0.012, 0.02, 0.018, 0.004, M.black);
    pl(g, 0, y + 0.035, 0.0125, 0.05, 0.015, TM(labelTex('PHONE', 'label')), {});
    if (o.plugged) { box(g, 0, y - 0.035, 0.015, 0.03, 0.035, 0.03, { color: old ? '#cfc3a4' : '#e4e2da' }); tube(g, [[0, y - 0.05, 0.03], [0.02, y - 0.2, 0.04], [0.1, 0.02, 0.03], [0.6, 0.012, 0.02], [1.2, 0.012, 0.02]], 0.003, { color: '#d8d4c8' }, { key: 'sockcord' + q3(y), radial: 4, seg: 16, cast: false }); }
  });
  // tablet_box: a tablet still sealed in its box (shrink-wrap sheen, SEALED sticker)
  const tabletBoxTex = () => ctex('tabletbox', 256, 192, (ctx, w, h, r) => {
    ctx.fillStyle = '#f4f3ef'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#16191a'; ctx.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.62);
    const g2 = ctx.createLinearGradient(w * 0.22, h * 0.17, w * 0.78, h * 0.75); g2.addColorStop(0, '#2fc9c4'); g2.addColorStop(1, '#f2c84a');
    ctx.fillStyle = g2; ctx.fillRect(w * 0.22, h * 0.18, w * 0.56, h * 0.56);
    txt(ctx, 'TAB 10', w / 2, h * 0.9, { size: 18, font: F.sans, weight: 'bold', color: '#222', align: 'center' });
    Tex.drawWordmark(ctx, 10, h * 0.95, 12, { color: BR.tealDark });
    TU.age(ctx, w, h, r, 0.3);
  });
  def('tablet_box', { collide: false }, (K, o, g) => {
    box(g, 0, 0, 0, 0.28, 0.05, 0.2, TM(tabletBoxTex(), { roughness: 0.5 }), { uv: false });
    box(g, 0, 0.0505, 0, 0.281, 0.001, 0.201, { color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.22 }, { cast: false });
    flat(g, 0.1, 0.052, 0.07, 0.05, 0.03, TM(labelTex('SEALED', 'red')), { ry: 20 });
  });
  // card_reader (wall, 1.1 m): black proximity reader with a red/green LED. opts state 'red'|'green'|'off'; setState
  def('card_reader', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.1;
    box(g, 0, y - 0.07, 0.015, 0.08, 0.14, 0.03, M.darkPlastic);
    add(g, gTorus(0.018, 0.003, 4, 12), M.greyPlastic, 0, y - 0.01, 0.031, {});
    const led = lampMat('#302020', '#ff2a1c', 0);
    box(g, 0, y + 0.045, 0.03, 0.03, 0.008, 0.004, led, { cast: false });
    const setState = (s) => { led.emissive.set(s === 'green' ? '#3dff9a' : '#ff2a1c'); led.emissiveIntensity = s === 'off' ? 0 : 3; };
    setState(o.state || 'red');
    g.userData.setState = setState;
  });
  // rotary_dial (wall, 1.2 m): an old rotary dial on a steel plate beside a door + laminated card. opts card (text);
  // userData.spin(digit) → Promise (the finger wheel winds to the stop and runs back)
  def('rotary_dial', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.25;
    box(g, 0, y - 0.13, 0.008, 0.2, 0.26, 0.016, M.steelDk);
    for (const [x, yy] of [[-0.08, 0.1], [0.08, 0.1], [-0.08, -0.1], [0.08, -0.1]]) cyl(g, x, y + yy, 0.016, 0.006, 0.004, M.chrome, { rx: 90, seg: 6 });
    add(g, gCircle(0.075, 24), { color: '#1c1c1c', roughness: 0.4 }, 0, y, 0.0165, {});
    const wheel = grp(g, 0, y, 0.02, 0, 'dial');
    add(wheel, gCircle(0.072, 28), TM(dialTex(), { roughness: 0.35 }), 0, 0, 0, {});
    add(wheel, gTorus(0.072, 0.004, 4, 28), M.chrome, 0, 0, 0, {});
    live(wheel);
    box(g, 0.06, y - 0.055, 0.024, 0.03, 0.006, 0.01, M.chrome, { rz: -35 });                  // finger stop
    pl(g, 0, y - 0.35, 0.004, 0.2, 0.13, TM(noteTex(o.card ?? 'RECORDS — pulse dial.\nDial the number you hear.', 'card', '#222', 256, 168), { roughness: 0.2 }), {});
    let tw = null;
    anim(K, (dt) => { if (!tw) return; tw.t += dt; const k = tw.t / tw.dur; if (k >= 1) { wheel.rotation.z = 0; const f = tw.res; tw = null; f(); return; } wheel.rotation.z = -(k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55) * tw.ang; });
    g.userData.spin = (digit) => new Promise((res) => { const d0 = digit === 0 || digit === '0' ? 10 : Number(digit) || 1; if (tw) tw.res(); tw = { t: 0, dur: 0.35 + d0 * 0.12, ang: R(30 + d0 * 28), res }; });
  });
  // pa_mic (tabletop): paging microphone on a gooseneck, push-to-talk button
  def('pa_mic', { collide: false }, (K, o, g) => {
    box(g, 0, 0, 0, 0.16, 0.035, 0.12, M.darkPlastic);
    cyl(g, 0.04, 0.035, 0.03, 0.014, 0.01, { color: '#b3261e' }, { seg: 10 });
    pl(g, -0.03, 0.036, 0.03, 0.06, 0.018, TM(labelTex('TALK', 'dark')), { rx: -90 });
    tube(g, [[-0.03, 0.035, -0.02], [-0.03, 0.15, -0.03], [-0.02, 0.28, 0.02], [0.0, 0.33, 0.09]], 0.007, M.black, { key: 'pamic', radial: 5, seg: 16 });
    cylc(g, 0.0, 0.335, 0.12, 0.018, 0.07, M.darkPlastic, { rx: 70, seg: 10 });
    cylc(g, 0.0, 0.347, 0.152, 0.02, 0.012, { tex: 'grille' }, { rx: 70, seg: 10 });
  });
  // cctv_camera (ceiling/wall): opts variant 'dome' (ceiling, ceil 3.0) | 'bullet' (wall bracket at mount 2.6); red LED
  def('cctv_camera', { collide: false }, (K, o, g) => {
    if (o.variant === 'bullet') {
      const y = o.mount ?? 2.6;
      box(g, 0, y - 0.05, 0.02, 0.08, 0.1, 0.04, M.white);
      rod(g, [0, y, 0.04], [0, y + 0.02, 0.18], 0.012, M.white, { seg: 6 });
      const c = grp(g, 0, y + 0.02, 0.24); c.rotation.x = R(20);
      boxc(c, 0, 0, 0, 0.08, 0.08, 0.22, M.white); boxc(c, 0, 0.045, 0.02, 0.1, 0.01, 0.26, M.white);
      cylc(c, 0, 0, 0.112, 0.022, 0.004, M.black, { rx: 90, seg: 10 });
      K.light('led', 0.03, y - 0.0, 0.35, { color: '#ff2a1c', size: 0.005 });
    } else {
      const c = o.ceil ?? 3.0;
      cyl(g, 0, c - 0.03, 0, 0.08, 0.03, M.white, { seg: 16 });
      add(g, gSph(0.065, 14, Math.PI / 2), { color: '#1a1e20', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85 }, 0, c - 0.03, 0, { rx: 180 });
      K.light('led', 0.06, c - 0.04, 0.03, { color: '#ff2a1c', size: 0.005, blink: 2, duty: 0.1 });
    }
  });

  // leaderboard: rankings screen. opts variant 'store' (wall TV: CHLOE #1 … AIDAN 23rd of 24, default) | 'atrium'
  // (three-storey screen, w 10 × h 7.5: "CHLOE — #1 — 30 MONTHS"), rows ([[name, value]…]), text; userData.screen/setOn
  function paintBoard(c, w, h, rows, highlight, title) {
    c.fillStyle = '#081a1c'; c.fillRect(0, 0, w, h);
    c.fillStyle = BR.teal; c.fillRect(0, 0, w, h * 0.13);
    txt(c, title, w * 0.04, h * 0.095, { size: h * 0.07, font: F.heavy, weight: '900', color: '#ffffff' });
    Tex.drawWordmark(c, w * 0.72, h * 0.095, h * 0.06, { color: BR.yellow });
    const rh = (h * 0.85) / rows.length;
    rows.forEach(([n, v], i) => {
      const y = h * 0.14 + i * rh, hi = highlight && n === highlight;
      c.fillStyle = hi ? 'rgba(255,204,0,0.25)' : i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; c.fillRect(0, y, w, rh - 2);
      const s = Math.min(rh * 0.62, h * 0.06);
      txt(c, v[0] === '#' ? v : '#' + (i + 1), w * 0.05, y + rh * 0.7, { size: s, font: F.sans, weight: 'bold', color: i === 0 ? BR.yellow : '#c8d8d6' });
      txt(c, n, w * 0.2, y + rh * 0.7, { size: s, font: F.sans, weight: 'bold', color: hi || i === 0 ? '#ffffff' : '#9fb4b2' });
      txt(c, v[0] === '#' ? '' : v, w * 0.95, y + rh * 0.7, { size: s, font: F.mono, color: '#c8d8d6', align: 'right' });
    });
  }
  const STORE_ROWS = [['CHLOE', '142%'], ['PRIYA', '118%'], ['JOSH', '111%'], ['MEL', '104%'], ['TOM', '99%'], ['…', ''], ['AIDAN', '23rd / 24']];
  def('leaderboard', { collide: false }, (K, o, g) => {
    const atrium = o.variant === 'atrium';
    const w = o.w ?? (atrium ? 10 : 1.2), h = o.h ?? (atrium ? 7.5 : w * 0.5625), cy = o.mount ?? (atrium ? h / 2 + 1 : 2.1);
    boxc(g, 0, cy, 0.04, w + (atrium ? 0.3 : 0.04), h + (atrium ? 0.3 : 0.04), atrium ? 0.3 : 0.05, M.blackGloss);
    const sm = add(g, gPlane(w, h), MAT({ tex: 'screen_off' }), 0, cy, atrium ? 0.1905 : 0.0655, { cast: false });
    const rows = o.rows || STORE_ROWS;
    const paint = atrium ? (c, W, H) => { c.fillStyle = '#050d0e'; c.fillRect(0, 0, W, H); c.fillStyle = BR.teal; c.fillRect(0, H * 0.78, W, H * 0.22); const lt = o.text ?? 'CHLOE — #1 — 30 MONTHS', ls = fit(c, [lt], W * 0.9, H * 0.2, (q) => `900 ${q}px ${F.heavy}`, H * 0.13); txt(c, lt, W / 2, H * 0.55, { size: ls, font: F.heavy, weight: '900', color: '#ffffff', align: 'center' }); txt(c, 'REGIONAL LEADERBOARD', W / 2, H * 0.2, { size: H * 0.06, font: F.sans, weight: 'bold', color: BR.yellow, align: 'center', spacing: 6 }); Tex.drawWordmark(c, W * 0.4, H * 0.93, H * 0.1, { color: BR.yellow }); }
      : (c, W, H) => paintBoard(c, W, H, rows, 'AIDAN', o.text ?? 'STORE LEADERBOARD — MARCH');
    lazyScreen(K, g.userData, sm, atrium ? [512, 384] : [320, 180], paint, o.lit !== false, atrium ? 1.1 : 0.9);
    if (atrium && o.light !== false) K.light('screen', 0, cy, 2.5, { color: '#7fd6d0', intensity: 6, distance: 16, bank: o.bank });
  });
  // rankings_screen: lobby portrait screen on a stand scrolling store rankings — every name blurred except CHLOE at the
  // top. opts variant 'stand' (default) | 'wall' (mount 1.6); userData.screen (content can take over: userData.custom)
  def('rankings_screen', { collide: 'auto' }, (K, o, g) => {
    const wall = o.variant === 'wall', w = 0.62, h = 1.1, cy = wall ? (o.mount ?? 1.6) : 1.25;
    if (!wall) { box(g, 0, 0, 0, 0.5, 0.03, 0.4, M.stainless); box(g, 0, 0.03, -0.02, 0.1, cy - h / 2, 0.06, M.stainless); }
    boxc(g, 0, cy, 0.0, w + 0.04, h + 0.04, 0.05, M.blackGloss);
    const sm = add(g, gPlane(w, h), MAT({ tex: 'screen_off' }), 0, cy, 0.0255, { cast: false });
    const names = ['REGIONAL', 'NORTH', 'CITY', 'EAST', 'HARBOUR', 'WEST', 'VALLEY', 'CENTRAL', 'RIDGE', 'COAST', 'LAKES', 'PLAZA', 'PARK', 'HILL', 'BAY'];
    let off = 0;
    const paint = (c, W, H) => {
      c.fillStyle = '#071416'; c.fillRect(0, 0, W, H);
      c.fillStyle = BR.teal; c.fillRect(0, 0, W, 54); txt(c, 'STORE RANKINGS', W / 2, 36, { size: 22, font: F.heavy, weight: '900', color: '#fff', align: 'center' });
      c.fillStyle = 'rgba(255,204,0,0.22)'; c.fillRect(0, 60, W, 52);
      txt(c, '#1', 14, 96, { size: 24, font: F.sans, weight: 'bold', color: BR.yellow }); txt(c, 'CHLOE', 70, 96, { size: 24, font: F.sans, weight: 'bold', color: '#fff' }); txt(c, '142%', W - 12, 96, { size: 20, font: F.mono, color: '#fff', align: 'right' });
      c.save(); c.beginPath(); c.rect(0, 116, W, H - 116); c.clip(); c.filter = 'blur(3px)';
      for (let i = 0; i < 24; i++) { const y = 150 + i * 44 - (off % 44); const n = names[(i + Math.floor(off / 44)) % names.length]; txt(c, '#' + (i + 2 + Math.floor(off / 44)), 14, y, { size: 20, font: F.sans, weight: 'bold', color: '#9fb4b2' }); txt(c, n + ' ' + n.slice(0, 3), 70, y, { size: 20, font: F.sans, weight: 'bold', color: '#c8d8d6' }); txt(c, (130 - i * 3) + '%', W - 12, y, { size: 18, font: F.mono, color: '#c8d8d6', align: 'right' }); }
      c.restore();
    };
    const ls = lazyScreen(K, g.userData, sm, [256, 456], paint, o.lit !== false);
    let acc = 0;
    anim(K, (dt) => { if (!g.userData.on || !ls.scr || g.userData.custom) return; acc += dt; if (acc > 0.1) { off += acc * 18; acc = 0; ls.scr.draw(paint); } });
  });
  // emergency_phone: yellow emergency phone box on a fence/pole. opts open (lid up: handset + laminated card), mount (1.3)
  def('emergency_phone', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.3, yel = { color: '#d8b928', roughness: 0.5 };
    box(g, 0, y - 0.22, 0.08, 0.32, 0.44, 0.16, yel);
    pl(g, 0, y + 0.1, 0.161, 0.3, 0.07, TM(Tex.sign('EMERGENCY PHONE', { style: 'shop', w: 0.3, h: 0.07, bg: '#b3261e', fg: '#fff', border: false })), {});
    const lid = grp(g, 0, y + 0.02, 0.16);
    if (o.open) {
      lid.rotation.x = R(-118);
      box(g, 0, y - 0.2, 0.01, 0.28, 0.38, 0.01, M.darkPlastic);
      const hs = grp(g, -0.06, y - 0.05, 0.1, 0, 'handset'); hs.rotation.x = R(90); handsetBuild(hs, M.black);
      pl(g, 0.07, y - 0.1, 0.025, 0.11, 0.15, TM(noteTex('GATE: year the exchange opened (see plaque).', 'card', '#222', 200, 280)), {});
    }
    box(lid, 0, -0.42, 0.005, 0.3, 0.42, 0.02, yel);
    box(lid, 0, -0.38, 0.02, 0.08, 0.02, 0.02, M.black);
    live(lid);
  });
  // duress_button (wall or under a counter, mount 1.0): red mushroom button on a yellow box; userData.press() lights it
  def('duress_button', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.0;
    box(g, 0, y - 0.06, 0.03, 0.1, 0.12, 0.06, { color: '#d8b928', roughness: 0.5 });
    const bm = lampMat('#9a1a14', '#ff2a1c', 0);
    cylc(g, 0, y, 0.07, 0.03, 0.03, bm, { rx: 90, seg: 14 });
    pl(g, 0, y - 0.1, 0.0605, 0.08, 0.025, TM(labelTex('DURESS', 'red')), {});
    g.userData.press = () => { bm.emissiveIntensity = 2.5; };
    g.userData.reset = () => { bm.emissiveIntensity = 0; };
  });
  // alarm_lamp (wall, over a door, mount 2.3): red warning beacon; opts lit, flash (rotating-flash look); userData.setOn
  def('alarm_lamp', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 2.3;
    box(g, 0, y - 0.04, 0.03, 0.12, 0.08, 0.06, M.darkPlastic);
    const lm = lampMat('#5a1410', '#ff2a1c', 0);
    add(g, gSph(0.055, 12, Math.PI / 2), lm, 0, y + 0.04, 0.07, {});
    cyl(g, 0, y + 0.0, 0.07, 0.056, 0.04, lm, { seg: 12 });
    let on = !!o.lit, halo = Render.halo([0, y + 0.05, 0.12], { parent: g, color: '#ff3322', size: 1.2, opacity: 0.6 });
    anim(K, (dt, t) => { const k = on ? (o.flash === false ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 7))) : 0; lm.emissiveIntensity = k * 3; halo.visible = on; halo.userData.opacity = 0.6 * k; });
    g.userData.setOn = (v = true) => { on = !!v; };
  });
  // headset: call-centre headset. opts variant 'desk' (lying on a desk; tabletop) | 'hook' (hanging from a partition hook)
  def('headset', { collide: false }, (K, o, g) => {
    const hook = o.variant === 'hook', y = hook ? (o.mount ?? 1.1) : 0;
    const hg = grp(g, 0, y, hook ? 0.03 : 0);
    if (hook) { box(g, 0, y + 0.02, 0.01, 0.03, 0.04, 0.03, M.greyPlastic); hg.rotation.x = R(0); }
    else hg.rotation.x = R(-90);
    add(hg, gTorus(0.085, 0.008, 4, 16, Math.PI * 1.1), M.darkPlastic, 0, hook ? -0.09 : 0.004, 0, { rz: hook ? 190 : 0 });
    for (const s of [-1, 1]) cylc(hg, s * 0.085, hook ? -0.1 : 0.0, 0, 0.03, 0.02, M.black, { rz: 90, seg: 12 });
    rod(hg, [-0.085, hook ? -0.1 : 0, 0.0], [-0.02, hook ? -0.2 : 0.0, hook ? 0.06 : 0.1], 0.004, M.black, { seg: 4 });
    tube(g, hook ? [[-0.085, y - 0.12, 0.03], [-0.08, y - 0.4, 0.05], [-0.02, y - 0.62, 0.05], [0.1, y - 0.7, 0.1]] : [[-0.085, 0.01, 0], [-0.15, 0.005, 0.1], [-0.25, 0.005, 0.08], [-0.35, 0.005, 0.0]], 0.003, M.black, { key: 'hscord' + (hook ? q3(y) : 'd'), radial: 4, seg: 12, cast: false });
  });

  // =================================================================================================================
  // EXCHANGE: switchboards, lamp panels, distribution frames, fuse board — and the mast, ceiling props
  // =================================================================================================================
  // A multi-material "unit" built once and cached: fn(u) records parts with u.box/u.boxc/u.cyl/u.rod/u.tube(matKey, …);
  // returns { matKey: mergedGeometry }. Repeated units (switchboard positions, frame columns, mast panels) then cost
  // one mesh per material.
  const UNITS = new Map();
  function unit(key, fn) {
    let u = UNITS.get(key);
    if (u) return u;
    const parts = {}, tmp = new THREE.Object3D();
    const push = (mk, geo, x, y, z, o = {}) => {
      tmp.position.set(x, y, z); tmp.quaternion.identity(); tmp.scale.set(1, 1, 1);
      if (o.q) tmp.quaternion.copy(o.q); else tmp.rotation.set(R(o.rx), R(o.ry), R(o.rz), 'YXZ');
      if (o.s) tmp.scale.set(...(Array.isArray(o.s) ? o.s : [o.s, o.s, o.s]));
      tmp.updateMatrix();
      (parts[mk] = parts[mk] || []).push({ geo, m: tmp.matrix.clone() });
    };
    const q = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();
    fn({
      box: (mk, x, y, z, sx, sy, sz, o = {}) => push(mk, gBox(sx, sy, sz, o.uv || 0), x, y + sy / 2, z, o),
      boxc: (mk, x, y, z, sx, sy, sz, o = {}) => push(mk, gBox(sx, sy, sz, o.uv || 0), x, y, z, o),
      cyl: (mk, x, y, z, r, h, o = {}) => push(mk, gCyl(r, o.r2 ?? r, h, o.seg ?? 8), x, y + h / 2, z, o),
      cylc: (mk, x, y, z, r, h, o = {}) => push(mk, gCyl(r, o.r2 ?? r, h, o.seg ?? 8), x, y, z, o),
      rod: (mk, a, b, r, o = {}) => { va.set(...a); vb.set(...b); const L = va.distanceTo(vb); q.setFromUnitVectors(_up, vb.clone().sub(va).normalize()); push(mk, gCyl(r, o.r2 ?? r, L, o.seg ?? 5), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { q }); },
      bar: (mk, a, b, w, d) => { va.set(...a); vb.set(...b); const L = va.distanceTo(vb); q.setFromUnitVectors(_up, vb.clone().sub(va).normalize()); push(mk, gBox(w, L, d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { q }); },
      geo: (mk, geo, x = 0, y = 0, z = 0, o = {}) => push(mk, geo, x, y, z, o),
    });
    u = {};
    for (const k of Object.keys(parts)) { u[k] = Kit.mergeGeometries(parts[k]); u[k].userData.shared = true; u[k].computeBoundingSphere(); }
    UNITS.set(key, u);
    return u;
  }
  const placeUnit = (p, u, mats, x = 0, y = 0, z = 0, ry = 0) => { for (const k of Object.keys(u)) add(p, u[k], mats[k], x, y, z, { ry }); };

  // jack field: rows of jack holes with lamp caps above each, designation strips. One tile = one 0.9 m position.
  const jackTex = () => ctex('jackfield', 256, 320, (ctx, w, h, r) => {
    ctx.fillStyle = '#2a2320'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 9; row++) {
      const y = 14 + row * 34;
      ctx.fillStyle = '#d8ccae'; ctx.fillRect(4, y - 12, w - 8, 7);
      for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(40,30,20,0.7)'; ctx.fillRect(8 + i * 12.3, y - 11, 1, 5); }
      for (let i = 0; i < 20; i++) {
        const x = 9 + i * 12.3;
        ctx.fillStyle = '#6a5a3e'; ctx.beginPath(); ctx.arc(x, y + 2, 4.2, 0, TAU); ctx.fill();         // lamp cap (unlit)
        ctx.fillStyle = 'rgba(255,230,190,0.18)'; ctx.beginPath(); ctx.arc(x - 1, y + 1, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b89a52'; ctx.beginPath(); ctx.arc(x, y + 13, 4, 0, TAU); ctx.fill();           // jack ring
        ctx.fillStyle = '#080706'; ctx.beginPath(); ctx.arc(x, y + 13, 2.3, 0, TAU); ctx.fill();
      }
    }
    TU.age(ctx, w, h, r, 0.7);
  }, { wrap: true, size: 0.9 });
  // key shelf: lever keys and plug holes, printed so the unit geometry stays light
  const keyshelfTex = () => ctex('keyshelf', 256, 128, (ctx, w, h, r) => {
    ctx.fillStyle = '#3a2c22'; ctx.fillRect(0, 0, w, h);
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 4, cy: 1, oct: 3 }), 0.2);
    for (let i = 0; i < 16; i++) { const x = 10 + i * 15.5; ctx.fillStyle = '#0c0a08'; ctx.beginPath(); ctx.arc(x, 18, 4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x, 36, 4, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 16; i++) { const x = 10 + i * 15.5; ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 3, 60, 6, 14); ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x - 3, 78, 6, 5); }
    ctx.fillStyle = 'rgba(255,240,210,0.08)'; ctx.fillRect(0, 96, w, 3);
    for (let k = 0; k < 20; k++) { ctx.fillStyle = `rgba(220,200,170,${r() * 0.15})`; ctx.fillRect(r() * w, r() * h, 10 + r() * 30, 1); }
  }, { wrap: true, size: 0.9 });
  const SWB = { wood: { tex: 'wood', light: '#6e4a30', dark: '#48301f' }, bake: { color: '#141210', roughness: 0.35 }, brass: { tex: 'metal', color: '#b89a52', roughness: 0.3, metalness: 0.8 } };
  const swUnit = () => unit('switchpos', (u) => {
    u.box('wood', -0.448, 0, -0.1, 0.02, 0.76, 0.8);                  // position divider
    u.box('wood', -0.448, 0.78, -0.38, 0.02, 1.17, 0.18);             // upright divider
    // cord plugs standing in two rows: open 5-sided bodies + tips (they are 16 per position × hundreds of positions)
    for (let i = 0; i < 8; i++) { const x = -0.38 + i * 0.1; for (const z of [-0.06, 0.02]) { u.geo('bake', gCyl(0.009, 0.009, 0.07, 5, 0, true), x, 0.8, z); u.geo('brass', gCyl(0.006, 0.003, 0.03, 4, 0, false), x, 0.85, z); } }
    for (let i = 0; i < 8; i++) { const x = -0.38 + i * 0.1; u.box('bake', x, 0.77, 0.14, 0.012, 0.04, 0.02, { rx: -20 }); }
    // headset hook + hanging headset under the key shelf edge
    u.box('brass', 0.3, 0.62, 0.31, 0.012, 0.012, 0.06);
    u.geo('bake', gTorus(0.07, 0.006, 3, 8, Math.PI), 0.3, 0.56, 0.35, { rz: 180 });
    u.cylc('bake', 0.23, 0.5, 0.35, 0.025, 0.02, { rz: 90, seg: 7 }); u.cylc('bake', 0.37, 0.5, 0.35, 0.025, 0.02, { rz: 90, seg: 7 });
    u.rod('bake', [0.23, 0.5, 0.36], [0.26, 0.42, 0.42], 0.004);
  });
  // switchboard: a row of 1960s cord switchboard positions (0.9 m each) along X, operator side +Z: key shelf with cord
  // plugs and lever keys, an upright jack field with lamp caps, cornice with position numbers, a headset per position.
  // opts len (3.6), lit (true → lamps lit/blinking and cords patched: Wai's working board; number → that many lamps),
  // labels (named lamps, e.g. ['WAI'] — first position, top row), cords (number of patched cords per position).
  // userData.setLamp(label|index, on|'blink'), lamps (named lamp list)
  def('switchboard', { collide: true }, (K, o, g) => {
    const len = o.len ?? 3.6, n = Math.max(1, Math.round(len / 0.9)), L = n * 0.9, r = rngOf(K, o, 'swb');
    const mats = SWB, u = swUnit();
    // carcass as long pieces
    box(g, 0, 0, -0.1, L, 0.74, 0.76, SWB.wood, { uv: 0.8 });
    box(g, 0, 0, 0.26, L, 0.08, 0.02, SWB.bake);
    box(g, 0, 0.74, -0.02, L, 0.025, 0.66, TM(keyshelfTex(), { roughness: 0.4 }), { uv: [1 / 0.9, 1 / 0.66] });
    box(g, 0, 0.765, 0.3, L, 0.02, 0.04, SWB.brass);
    const up = grp(g, 0, 0.78, -0.33); up.rotation.x = R(-6);
    box(up, 0, 0, 0, L, 1.1, 0.1, SWB.wood);
    const fg = new THREE.PlaneGeometry(L, 1.0); { const a = fg.attributes.uv; for (let i = 0; i < a.count; i++) a.setX(i, a.getX(i) * n); }
    add(up, fg, TM(jackTex(), o.lit ? { roughness: 0.5, emissive: 0.16 } : { roughness: 0.5 }), 0, 0.57, 0.051, { cast: false });
    box(g, 0, 1.9, -0.36, L + 0.04, 0.16, 0.2, SWB.wood);
    for (const s of [-1, 1]) box(g, s * (L / 2 + 0.015), 0, -0.1, 0.03, 2.06, 0.8, SWB.wood);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.45 + i * 0.9;
      placeUnit(g, u, mats, x, 0, 0);
      pl(g, x, 1.98, -0.259, 0.12, 0.08, TM(plateTex(String(i + 1), '#d8ccae', '#2a2016', 96, 64)), {});
    }
    // lamps: named lamps + lit/blinking ones
    const lampsOn = o.lit === true ? Math.round(n * 9) : typeof o.lit === 'number' ? o.lit : 0;
    const lampGeo = gCircle(0.0095, 8), named = [], allLamps = [];
    const lampPos = (idx) => { const pos = Math.floor(idx / 180), rem = idx % 180, row = Math.floor(rem / 20), c = rem % 20; return [-L / 2 + pos * 0.9 + (9 + c * 12.3) / 256 * 0.9, 0.57 + 0.5 - ((14 + row * 34 + 2) / 320), 0.052]; };
    (o.labels || []).forEach((lab, i) => {
      const m = lampMat('#6a5a3e', '#ffd9a0', 0);
      const [x, y, z] = lampPos(i * 3);
      const mesh = add(up, lampGeo, m, x, y, z + 0.001, { cast: false, live: true });
      add(up, gPlane(0.05, 0.016), TM(labelTex(lab, 'label')), x + 0.001, y - 0.025, z + 0.002, { cast: false });
      named.push({ label: lab, mat: m, mesh, blink: false, on: false });
    });
    if (lampsOn) {
      const shared = MAT(glowS('#ffcf8a', 3.2));
      const blinkM = lampMat('#6a5a3e', '#ffcf8a', 0);
      for (let k = 0; k < lampsOn; k++) {
        const idx = Math.floor(r() * n * 180), [x, y, z] = lampPos(idx), blink = r() < 0.3;
        add(up, lampGeo, blink ? blinkM : shared, x, y, z + 0.001, { cast: false });
        if (!blink) allLamps.push(idx);
      }
      anim(K, (dt, t) => { blinkM.emissiveIntensity = (t % 0.9) < 0.45 ? 3.2 : 0; });
      if (o.light !== false) K.light('lamp', 0, 1.5, 0.6, { color: '#ffcf8a', intensity: 2.2, distance: 4, bank: o.bank });
    }
    // patched cords: plug on the shelf → arc → jack in the field
    const cords = o.cords ?? (o.lit ? 5 : 1);
    const cordM = { color: '#1a1614', roughness: 0.5 }, cordRed = { color: '#5a1a14', roughness: 0.5 };
    for (let i = 0; i < n; i++) for (let k = 0; k < cords; k++) {
      const x0 = -L / 2 + 0.45 + i * 0.9 - 0.38 + Math.floor(r() * 8) * 0.1, z0 = r() < 0.5 ? -0.06 : 0.02;
      const x1 = -L / 2 + i * 0.9 + 0.05 + r() * 0.8, y1 = 0.95 + r() * 0.8;
      const loose = !o.lit && r() < 0.6;
      const pts = loose ? [[x0, 0.86, z0], [x0 + 0.02, 0.9, z0 + 0.15], [x0 + 0.03, 0.74, 0.32], [x0 + 0.03, 0.5, 0.36]] : [[x0, 0.86, z0], [(x0 + x1) / 2, 0.8, 0.05], [x1, y1 - 0.2, -0.2], [x1, y1, -0.268 + (y1 - 0.78) * 0.1]];
      tube(g, pts, 0.0045, r() < 0.3 ? cordRed : cordM, { radial: 4, seg: 14, cast: false });
    }
    const setLamp = (key, v) => {
      const L0 = typeof key === 'number' ? named[key] : named.find((l) => l.label === key);
      if (!L0) return;
      L0.blink = v === 'blink'; L0.on = !!v; L0.mat.emissiveIntensity = v ? 2.6 : 0;
    };
    if (named.length) anim(K, (dt, t) => { for (const l of named) if (l.blink) l.mat.emissiveIntensity = (t % 0.8) < 0.4 ? 2.6 : 0; });
    g.userData.setLamp = setLamp; g.userData.lamps = named.map((l) => l.label);
    col(K, o, -L / 2 - 0.03, -0.5, L / 2 + 0.03, 0.34, 2.05);
  });

  // lamp_panel (wall): a panel of labelled indicator lamps. opts labels (['WAI', …]), cols (6), mount (1.6), lit
  // (labels lit at start); userData.setLamp(label|index, on|'blink')
  def('lamp_panel', { collide: false }, (K, o, g) => {
    const labels = o.labels || ['HALL', 'FRAME', 'RECORDS', 'BASEMENT', 'CANTEEN', 'MAST'], cols = o.cols ?? Math.min(6, labels.length);
    const rows = Math.ceil(labels.length / cols), w = cols * 0.12 + 0.1, h = rows * 0.12 + 0.12, y = (o.mount ?? 1.6) - h / 2;
    box(g, 0, y, 0.02, w, h, 0.04, SWB.wood);
    box(g, 0, y + 0.03, 0.041, w - 0.06, h - 0.06, 0.004, { color: '#1c1a18', roughness: 0.4 });
    const lamps = labels.map((lab, i) => {
      const x = -w / 2 + 0.11 + (i % cols) * 0.12, yy = y + h - 0.1 - Math.floor(i / cols) * 0.12;
      const m = lampMat('#5a3a26', '#ffcf8a', 0);
      cylc(g, x, yy, 0.05, 0.018, 0.02, m, { rx: 90, seg: 10 });
      add(g, gTorus(0.019, 0.003, 4, 12), SWB.brass, x, yy, 0.06, {});
      pl(g, x, yy - 0.04, 0.0445, 0.1, 0.022, TM(labelTex(lab, 'label')), {});
      return { label: lab, mat: m, blink: false };
    });
    const setLamp = (key, v) => { const l = typeof key === 'number' ? lamps[key] : lamps.find((q) => q.label === key); if (!l) return; l.blink = v === 'blink'; l.mat.emissiveIntensity = v ? 2.6 : 0; };
    (o.lit || []).forEach((k) => setLamp(k, true));
    anim(K, (dt, t) => { for (const l of lamps) if (l.blink) l.mat.emissiveIntensity = (t % 0.8) < 0.4 ? 2.6 : 0; });
    g.userData.setLamp = setLamp;
  });

  // --- main distribution frame -----------------------------------------------------------------------------------
  const blockTex = () => ctex('mdfblock', 64, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#d6d0c0'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 25; row++) for (let i = 0; i < 4; i++) { ctx.fillStyle = '#6a5a3a'; ctx.fillRect(8 + i * 13, 6 + row * 10, 6, 4); ctx.fillStyle = '#2a2420'; ctx.fillRect(10 + i * 13, 7 + row * 10, 2, 2); }
    ctx.fillStyle = '#2a4a6a'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3);
    TU.age(ctx, w, h, r, 0.9);
  });
  const mdfUnit = (H) => unit('mdfcol' + q3(H), (u) => {
    u.box('iron', 0, 0, 0.22, 0.05, H, 0.05); u.box('iron', 0, 0, -0.22, 0.05, H, 0.05);          // verticals
    for (let y = 0.25; y < H - 0.1; y += 0.3) u.box('iron', 0, y, 0, 0.03, 0.03, 0.46);            // rungs
    for (let k = 0; k < Math.floor((H - 0.4) / 0.24); k++) { u.box('block', 0, 0.3 + k * 0.24, 0.265, 0.08, 0.22, 0.04); u.box('iron', 0, 0.3 + k * 0.24 + 0.1, 0.24, 0.1, 0.02, 0.01); }
    for (let k = 0; k < Math.floor((H - 0.4) / 0.24); k++) u.box('conn', 0, 0.3 + k * 0.24, -0.26, 0.09, 0.2, 0.03);
    for (let y = 0.4; y < H - 0.2; y += 0.5) u.geo('iron', gTorus(0.03, 0.005, 3, 6), 0.06, y, 0.3, { ry: 90 });    // jumper rings
  });
  // jumper wires along a frame (cached per length/height/seed): catenaries between columns in bundled colours
  function jumperGeo(len, H, seed) {
    return cg(`jump${q3(len)}|${q3(H)}|${seed}`, () => {
      const rr = U.rng(seed), items = [];
      const cols = Math.max(2, Math.round(len / 0.3));
      for (let k = 0; k < cols * 2.4; k++) {
        const a = Math.floor(rr() * cols), b = Math.min(cols - 1, a + 1 + Math.floor(rr() * 5)), y0 = 0.4 + rr() * (H - 0.8), y1 = 0.4 + rr() * (H - 0.8);
        const xa = -len / 2 + (a + 0.5) * (len / cols), xb = -len / 2 + (b + 0.5) * (len / cols), sag = 0.1 + rr() * 0.35, z = 0.3 + rr() * 0.05;
        const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(lerp(xa, xb, t), lerp(y0, y1, t) - Math.sin(t * Math.PI) * sag, z + Math.sin(t * Math.PI) * 0.04)); }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0028, 3, false);
        const col = new THREE.Color(pick(['#d8d4c8', '#2e5aa0', '#c0392b', '#e8c21a', '#2a2a2a', '#d8d4c8'], rr));
        const cArr = new Float32Array(geo.attributes.position.count * 4); for (let i = 0; i < geo.attributes.position.count; i++) { cArr[i * 4] = col.r; cArr[i * 4 + 1] = col.g; cArr[i * 4 + 2] = col.b; cArr[i * 4 + 3] = 1; }
        geo.setAttribute('color', new THREE.BufferAttribute(cArr, 4));
        items.push({ geo, m: new THREE.Matrix4() });
      }
      const merged = Kit.mergeGeometries(items);
      // carry the per-vertex colours (Kit.mergeGeometries drops them): rebuild the colour attribute in order
      let n = 0; const C = new Float32Array(merged.attributes.position.count * 4);
      for (const it of items) { const c = it.geo.attributes.color.array; C.set(c, n); n += c.length; it.geo.dispose(); }
      merged.setAttribute('color', new THREE.BufferAttribute(C, 4));
      return merged;
    });
  }
  const jumperMat = () => { const m = MAT({ color: '#ffffff', roughness: 0.5 }).clone(); m.vertexColors = true; m.userData.shared = true; m.name = 'jumpers'; return m; };
  let JUMPER_MAT = null;
  // frame_rack: iron MDF frame along X — verticals every 0.3 m with protector blocks (line side, +Z), connection blocks
  // (−Z), rings, and bundles of coloured jumper wires; a cable ladder on top. opts len (4.8), h (2.7), labels (jack labels
  // on red tags, e.g. ['WAI-1']). userData.jacks [{label, pos:[x,y,z] (local)}]
  def('frame_rack', { collide: true }, (K, o, g) => {
    const len = o.len ?? 4.8, H = o.h ?? 2.7, cols = Math.max(2, Math.round(len / 0.3)), r = rngOf(K, o, 'mdf');
    const mats = { iron: M.iron, block: TM(blockTex(), { roughness: 0.6 }), conn: { color: '#8a8478', roughness: 0.6 } };
    const u = mdfUnit(H);
    for (let i = 0; i < cols; i++) placeUnit(g, u, mats, -len / 2 + (i + 0.5) * (len / cols), 0, 0);
    box(g, 0, H, 0, len + 0.1, 0.06, 0.5, M.iron);
    box(g, 0, 0, 0, len + 0.1, 0.06, 0.5, M.iron);
    // cable ladder on top with bundles rising to the ceiling
    for (const s of [-1, 1]) box(g, 0, H + 0.3, s * 0.2, len, 0.06, 0.03, M.iron);
    for (let x = -len / 2 + 0.15; x < len / 2; x += 0.3) box(g, x, H + 0.3, 0, 0.03, 0.03, 0.4, M.iron);
    for (let i = 0; i < 3; i++) cylc(g, 0, H + 0.4 + i * 0.03, -0.1 + i * 0.1, 0.04 + r() * 0.02, len, { color: pick(['#2a2a2a', '#5d5a4c', '#3a3a3a'], r), roughness: 0.6 }, { rz: 90, seg: 8 });
    if (!JUMPER_MAT) JUMPER_MAT = jumperMat();
    add(g, jumperGeo(len, H, Math.round(len * 10 + H) + (o.seed ? U.hash(String(o.seed)) % 7 : 0)), JUMPER_MAT, 0, 0, 0, { cast: false });
    const jacks = [];
    (o.labels || []).forEach((lab, i) => {
      const c = Math.floor(((i + 0.5) / (o.labels.length)) * cols), x = -len / 2 + (c + 0.5) * (len / cols), y = 0.6 + ((i * 0.7) % (H - 1.0));
      box(g, x, y, 0.29, 0.06, 0.08, 0.02, { color: '#b3261e', roughness: 0.5 });
      pl(g, x, y + 0.04, 0.301, 0.055, 0.03, TM(labelTex(lab, 'red')), {});
      cylc(g, x, y + 0.02, 0.3, 0.008, 0.02, SWB.brass, { rx: 90, seg: 8 });
      jacks.push({ label: lab, pos: [x, y + 0.04, 0.32] });
    });
    g.userData.jacks = jacks;
    col(K, o, -len / 2 - 0.05, -0.3, len / 2 + 0.05, 0.34, H + 0.4);
  });
  // jumper_wire: one jumper between two local points (opts from [x,y,z], to [x,y,z], color, sag) — e.g. a re-patch
  def('jumper_wire', { collide: false }, (K, o, g) => {
    const a = o.from || [0, 1.2, 0], b = o.to || [0.6, 1.4, 0], sag = o.sag ?? 0.15;
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, lerp(a[2], b[2], t) + Math.sin(t * Math.PI) * 0.03]); }
    tube(g, pts, 0.003, { color: o.color || '#e8c21a', roughness: 0.5 }, { radial: 4, seg: 20, cast: false });
  });

  // --- fuse board ----------------------------------------------------------------------------------------------------
  const FUSES = [['HALL', '4 A'], ['FRAME', '6 A'], ['RECORDS', '2 A'], ['BASEMENT', '3 A'], ['CANTEEN', '1 A'], ['MAST FEED', '8 A', 'DO NOT ENERGISE —\nMAST DECOMMISSIONED']];
  const ammeterTex = () => ctex('ammeter', 128, 128, (ctx, w, h, r) => {
    ctx.fillStyle = '#ece6d4'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.48, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.8 + (i / 12) * 1.4); ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * w * 0.36); ctx.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * w * 0.42); ctx.stroke(); if (i % 3 === 0) txt(ctx, String((i / 12) * 12 | 0), w / 2 + Math.cos(a) * w * 0.28, h / 2 + Math.sin(a) * w * 0.28 + 4, { size: 10, font: F.sans, color: '#222', align: 'center' }); }
    ctx.fillStyle = '#b3261e'; const a10 = Math.PI * (0.8 + (10 / 12) * 1.4); ctx.fillRect(w / 2 + Math.cos(a10) * w * 0.36 - 2, h / 2 + Math.sin(a10) * w * 0.36 - 2, 5, 5);
    txt(ctx, 'AMPERES', w / 2, h * 0.72, { size: 10, font: F.serif, color: '#333', align: 'center' });
    TU.age(ctx, w, h, r, 1.2);
  });
  // fuse_board (wall, centre mount 1.45): the 1961 board — varnished backboard, six knife-switch circuits with enamel
  // labels and handwritten load ratings, the MAST FEED red tag, a main breaker lever and an ammeter. opts circuits
  // ([[name, load, tag?]…], default spec §9), on (names switched on), main (true). userData.setSwitch(name, on),
  // setMain(on), switches {name: {on, set(on)}}, setAmps(a) (needle). The switches, main lever and needle move only
  // when the board is live — pass on / main / amps / live:true or a name — otherwise they are baked into the room
  // batch like the rest (the setters warn once). All plates, load notes and tags share one label atlas (1 draw call).
  def('fuse_board', { collide: false }, (K, o, g) => {
    const circuits = o.circuits || FUSES, cy = o.mount ?? 1.45, w = 1.05, h = 1.3, y0 = cy - h / 2;
    const dyn = dynamic(o, 'on', 'main', 'amps');
    box(g, 0, y0 - 0.05, 0.015, w + 0.12, h + 0.12, 0.03, SWB.wood);
    box(g, 0, y0, 0.03, w, h, 0.03, { tex: 'metal', color: '#4a5048', roughness: 0.6 });
    const plaque = Tex.sign('SIGNAL HILL EXCHANGE — DB 1 — 1961', { style: 'plaque', w: 0.6, h: 0.09 });
    const mainPlate = plateTex('MAIN 10 A', '#7a1a14', '#f0ece0', 256, 64);
    const labs = circuits.map(([name, load, tag]) => ({ plate: plateTex(name, '#1c2a2a', '#ece6d4', 256, 64), note: noteTex(load, 'white', '#1f2c6e', 128, 48), tag: tag ? noteTex(tag, 'pink', '#8a1a14', 200, 140) : null }));
    const atlas = atlasOf('fuse|' + circuits.map((c) => c.join('/')).join('|'), [plaque, mainPlate, ...labs.flatMap((l) => [l.plate, l.note, l.tag])]);
    atlasPlane(g, atlas, plaque, 0, y0 + h - 0.07, 0.061, 0.6, 0.09);
    const switches = {};
    const warn = () => { if (!dyn) baked('fuse_board', new THREE.Group()); };           // (warns once: "…merged…")
    circuits.forEach(([name], i) => {
      const col0 = i % 3, row = Math.floor(i / 3), x = -0.34 + col0 * 0.34, y = y0 + 0.78 - row * 0.5;
      box(g, x, y - 0.14, 0.06, 0.16, 0.28, 0.03, { color: '#ded6c2', roughness: 0.4 });             // porcelain base
      for (const s of [-1, 1]) box(g, x + s * 0.04, y - 0.12, 0.09, 0.012, 0.05, 0.02, SWB.brass);
      const piv = grp(g, x, y - 0.13, 0.1, 0, 'sw:' + name);
      box(piv, 0, 0, 0.0, 0.1, 0.02, 0.02, SWB.brass);
      box(piv, 0, 0, 0.0, 0.024, 0.2, 0.03, SWB.bake);
      boxc(piv, 0, 0.21, 0.0, 0.05, 0.03, 0.04, SWB.bake);
      if (dyn) live(piv);
      atlasPlane(g, atlas, labs[i].plate, x, y + 0.04, 0.0761, 0.2, 0.05);
      atlasPlane(g, atlas, labs[i].note, x, y - 0.32, 0.0761, 0.14, 0.05, { rz: (i % 2 ? 2 : -3) });
      if (labs[i].tag) {
        rod(g, [x + 0.05, y + 0.01, 0.1], [x + 0.08, y - 0.08, 0.11], 0.002, { color: '#d8d0b8' }, { seg: 3, cast: false });
        atlasPlane(g, atlas, labs[i].tag, x + 0.1, y - 0.16, 0.112, 0.14, 0.1, { rz: 8 });
        box(g, x + 0.1, y - 0.21, 0.108, 0.144, 0.104, 0.002, { color: '#b3261e', roughness: 0.6 }, { rz: 8, cast: false });
      }
      let on = (o.on || []).includes(name);
      const set = (v) => { on = !!v; piv.rotation.x = R(on ? -8 : -150); };
      set(on);
      switches[name] = { set: (v) => { warn(); set(v); }, get on() { return on; } };
    });
    // main breaker + ammeter on the right edge
    const mx = w / 2 - 0.02, my = y0 + 0.4;
    box(g, mx - 0.02, my - 0.2, 0.06, 0.16, 0.42, 0.05, { color: '#2a2e2c', roughness: 0.5 });
    atlasPlane(g, atlas, mainPlate, mx - 0.02, my + 0.27, 0.0761, 0.16, 0.05);
    const mp = grp(g, mx - 0.02, my, 0.12, 0, 'main');
    box(mp, 0, 0, 0, 0.04, 0.26, 0.04, { color: '#7a1a14', roughness: 0.4 }); boxc(mp, 0, 0.27, 0.02, 0.1, 0.04, 0.06, SWB.bake);
    if (dyn) live(mp);
    let mainOn = o.main !== false;
    const setMain = (v) => { mainOn = !!v; mp.rotation.x = R(mainOn ? -10 : -140); };
    setMain(mainOn);
    add(g, gCircle(0.08, 24), TM(ammeterTex(), { roughness: 0.3 }), 0.34, y0 + 1.07, 0.0762, {});
    const needle = grp(g, 0.34, y0 + 1.07, 0.078);
    box(needle, 0, 0, 0, 0.004, 0.065, 0.002, { color: '#141414' }, { cast: false });
    if (dyn) live(needle);
    const setAmps = (a) => { needle.rotation.z = R(126) - (clamp(a, 0, 12) / 12) * R(252); };
    setAmps(o.amps ?? 0);
    // conduits up to the ceiling
    for (let i = 0; i < 4; i++) cyl(g, -0.36 + i * 0.24, y0 + h + 0.05, 0.05, 0.02, 3.2 - (y0 + h), M.galv, { seg: 8 });
    g.userData.switches = switches;
    g.userData.setSwitch = (name, v) => { if (switches[name]) switches[name].set(v); };
    g.userData.setMain = (v) => { warn(); setMain(v); }; g.userData.setAmps = (a) => { warn(); setAmps(a); };
  });

  // cable_tray: ladder tray hung on threaded rods, loaded with cable bundles. Runs along X. opts len (4), w (0.45),
  // h (tray height 2.5), ceil (3.0), load (true)
  def('cable_tray', { collide: false }, (K, o, g) => {
    const len = o.len ?? 4, w = o.w ?? 0.45, H = o.h ?? 2.5, ceil = o.ceil ?? 3.0, r = rngOf(K, o, 'ct');
    for (const s of [-1, 1]) box(g, 0, H, s * w / 2, len, 0.08, 0.025, M.galv);
    for (let x = -len / 2 + 0.15; x < len / 2; x += 0.3) box(g, x, H, 0, 0.03, 0.02, w, M.galv);
    for (let x = -len / 2 + 0.3; x < len / 2; x += 1.5) for (const s of [-1, 1]) cyl(g, x, H - 0.02, s * (w / 2 + 0.03), 0.006, ceil - H + 0.02, M.galv, { seg: 5 });
    if (o.load !== false) for (let i = 0; i < 5; i++) cylc(g, 0, H + 0.04 + (i % 2) * 0.04, -w / 2 + 0.07 + i * (w - 0.14) / 4, 0.025 + r() * 0.02, len, { color: pick(['#1a1a1a', '#2a2a2a', '#5d5a4c', '#6a2a22'], r), roughness: 0.55 }, { rz: 90, seg: 7 });
  });

  // --- ceiling / hanging --------------------------------------------------------------------------------------------
  // fluoro_tube: ceiling batten at height h (2.7). opts len (1.2), lit (true), flicker, light (false → glow only, no pool
  // light), variant 'batten' | 'troffer' (recessed diffuser panel), bank
  // A lit tube is always a K.light (light:false only drops the real pool light — real:false), so glow-only tubes still
  // switch off with World.lightsOut / G.light(name).on(false) and die bank by bank in the Outage.
  // intensity / distance / decay / color / prio go to the K.light (defaults 7 cd, 9 m: raise them under high ceilings).
  def('fluoro_tube', { collide: false }, (K, o, g) => {
    const H = o.h ?? 2.7, len = o.len ?? 1.2, lit = o.lit !== false, real = o.light !== false;
    const lo = {};
    for (const k of ['intensity', 'distance', 'decay', 'color', 'prio', 'pin']) if (o[k] !== undefined) lo[k] = o[k];
    if (o.variant === 'troffer') {
      box(g, 0, H - 0.04, 0, len + 0.04, 0.04, 0.64, M.white);
      const dm = lit ? glowMat('#e8f4ef', 0.85) : { color: '#c9ccc6', roughness: 0.6 };
      const pane = add(g, gPlane(len, 0.58), dm, 0, H - 0.041, 0, { rx: 90, cast: false });
      if (lit) {
        pane.userData.kitMerge = false;
        const h = K.light('fluoro', 0, H - 0.04, 0, { len, fixture: false, flicker: o.flicker, bank: o.bank, real, name: o.lightName, ...lo });
        anim(K, () => { dm.emissiveIntensity = h.isOn ? 0.85 : 0; });
      }
      return;
    }
    if (lit) { K.light('fluoro', 0, H, 0, { len, flicker: o.flicker, bank: o.bank, diffuser: o.diffuser, real, name: o.lightName, ...lo }); return; }
    box(g, 0, H - 0.07, 0, len + 0.06, 0.07, 0.16, { tex: 'metal', color: '#b9bcb6', roughness: 0.6 });
    cylc(g, 0, H - 0.09, 0, 0.016, len, M.bulbOff, { rz: 90, seg: 8 });
  });
  // coiled cord hanging from the ceiling (cached by length)
  const hangCoil = (len, rad = 0.018, turns = null) => cg(`hcoil${q3(len)}|${q3(rad)}`, () => { const pts = helix([0, 0, 0], [0.02, -len, 0.01], rad, turns ?? len * 20, 5).map((p) => new THREE.Vector3(...p)); return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.0045, 3, false); });
  function hangSway(K, piv, amp = 0.05, speed = 0.6) { const ph = K.rng() * 10; anim(K, (dt, t) => { piv.rotation.z = Math.sin(t * speed + ph) * amp; piv.rotation.x = Math.sin(t * speed * 0.73 + ph * 1.7) * amp * 0.7; }); }
  // headset_hanging: a call-centre headset hanging from the ceiling on its curly cord (Outage vines); sways.
  // opts ceil (2.8), len (cord length, 0.8–1.6 random)
  def('headset_hanging', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'hh'), ceil = o.ceil ?? 2.8, len = o.len ?? Math.round((0.8 + r() * 0.8) * 10) / 10;
    const piv = grp(g, 0, ceil, 0, r() * 360, 'swing');
    add(piv, hangCoil(len), M.black, 0, 0, 0, { cast: false });
    const hs = grp(piv, 0.02, -len - 0.1, 0.01); hs.rotation.set(R(10), 0, R(80));
    add(hs, gTorus(0.085, 0.008, 4, 14, Math.PI * 1.1), M.black, 0, 0, 0, { rz: -8 });
    for (const s of [-1, 1]) cylc(hs, s * 0.083, -0.01, 0, 0.03, 0.022, M.black, { rz: 90, seg: 10 });
    rod(hs, [0.083, -0.02, 0.01], [0.03, -0.1, 0.09], 0.004, M.black, { seg: 4 });
    live(hs); live(piv); hangSway(K, piv, 0.06, 0.5 + r() * 0.3);
  });
  // tether_hanging: a coiled retail security tether hanging like a vine, ending in its sensor puck. opts ceil (3.0), len (1.8)
  def('tether_hanging', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'th'), ceil = o.ceil ?? 3.0, len = o.len ?? 1.8;
    const piv = grp(g, 0, ceil, 0, r() * 360, 'swing');
    add(piv, hangCoil(len, 0.022), { color: '#161718', roughness: 0.45 }, 0, 0, 0, { cast: false });
    cyl(piv, 0.02, -len - 0.05, 0.01, 0.028, 0.05, M.greyPlastic, { seg: 12 });
    cyl(piv, 0.02, -len - 0.02, 0.01, 0.01, 0.02, { color: '#b3261e' }, { seg: 8 });
    box(piv, 0.02, -len - 0.2, 0.01, 0.07, 0.15, 0.008, M.black);                                   // the dummy phone still on it
    cyl(piv, 0, -0.02, 0, 0.04, 0.02, M.greyPlastic, { seg: 10 });
    live(piv); hangSway(K, piv, 0.04, 0.4 + r() * 0.3);
  });
  // receipt strips (curling ribbons), cached by length
  const ribbonGeo = (len, seed) => cg(`ribbon${q3(len)}|${seed}`, () => {
    const rr = U.rng(seed), n = Math.max(6, Math.round(len * 10)), gb = new THREE.BufferGeometry(), P = [], T = [], I = [];
    const tw = (rr() - 0.5) * 1.5, curl = 0.08 + rr() * 0.12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -t * len, a = t * tw, cx = Math.sin(t * 3 + rr() * 0.2) * 0.02, cz = t > 0.8 ? Math.pow((t - 0.8) / 0.2, 2) * curl : 0;
      for (const s of [-1, 1]) { P.push(cx + Math.cos(a) * 0.04 * s, y + (t > 0.85 ? cz * 0.5 : 0), cz + Math.sin(a) * 0.04 * s); T.push((s + 1) / 2, (t * len) / 0.16); }
    }
    for (let i = 0; i < n; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    gb.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gb.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2)); gb.setIndex(I); gb.computeVertexNormals();
    return gb;
  });
  // receipt_strip: a strip of receipt paper hanging from the ceiling, curling at the end; sways. opts ceil (3.0), len (1.5)
  def('receipt_strip', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'rs'), ceil = o.ceil ?? 3.0, len = o.len ?? Math.round((1.0 + r() * 1.2) * 10) / 10;
    const piv = grp(g, 0, ceil, 0, r() * 360, 'swing');
    add(piv, ribbonGeo(len, Math.floor(r() * 5)), { tex: 'receipt', side: 'double' }, 0, 0, 0, { cast: false });
    live(piv); hangSway(K, piv, 0.03, 0.7 + r() * 0.4);
  });
  // receipt_curtain: a curtain of receipt strips across w (one merged, gently swaying piece). opts w (2), n (14), ceil, len
  def('receipt_curtain', { collide: false }, (K, o, g) => {
    const w = o.w ?? 2, n = o.n ?? 14, ceil = o.ceil ?? 3.0, len = o.len ?? 1.6, seed = o.seed ? U.hash(String(o.seed)) % 97 : 3;
    const geo = cg(`rcurtain${q3(w)}|${n}|${q3(len)}|${seed}`, () => { const rr = U.rng(seed), items = []; for (let i = 0; i < n; i++) { const m = new THREE.Matrix4().compose(new THREE.Vector3(-w / 2 + (i + 0.5) * (w / n) + (rr() - 0.5) * 0.05, 0, (rr() - 0.5) * 0.15), new THREE.Quaternion().setFromAxisAngle(_up, rr() * TAU), new THREE.Vector3(1, 0.6 + rr() * 0.5, 1)); items.push({ geo: ribbonGeo(len, Math.floor(rr() * 5)), m }); } return Kit.mergeGeometries(items); });
    const piv = grp(g, 0, ceil, 0, 0, 'swing');
    add(piv, geo, { tex: 'receipt', side: 'double' }, 0, 0, 0, { cast: false });
    live(piv); hangSway(K, piv, 0.012, 0.5);
  });
  // spotlight: theatre/track spotlight. opts variant 'stand' (on a floor stand, 2.2 m) | 'ceiling' (hung at ceil 4),
  // lit, light (true → pooled spot aimed at target [x,y,z] local, default 4 m ahead on the floor), color
  def('spotlight', { collide: false }, (K, o, g) => {
    const stand = o.variant !== 'ceiling', lit = o.lit !== false, H = stand ? (o.h ?? 2.2) : (o.ceil ?? 4.0) - 0.35;
    if (stand) { for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rod(g, [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0, 0.6, 0], 0.015, M.black); } cyl(g, 0, 0.6, 0, 0.02, H - 0.6, M.black, { seg: 6 }); }
    else { rod(g, [0, H + 0.35, 0], [0, H + 0.12, 0], 0.02, M.black); }
    const target = o.target || [0, 0, 4];
    const hg = grp(g, 0, H, 0); hg.lookAt(new THREE.Vector3(target[0], target[1], target[2]).sub(new THREE.Vector3(0, H, 0)).add(hg.position));
    add(hg, gBox(0.08, 0.2, 0.02), M.black, 0, -0.1, 0, {});
    cylc(hg, 0, 0, 0.05, 0.12, 0.3, M.black, { rx: 90, seg: 14 });
    const lm = lit ? glowMat(o.color || '#fff4e0', 2.5) : { color: '#8a8a84', roughness: 0.2 };
    add(hg, gCircle(0.1, 16), lm, 0, 0, 0.201, {});
    if (lit) Render.halo([0, H, 0.2], { parent: g, color: o.color || '#fff4e0', size: 1.4, opacity: 0.5 });
    if (lit && o.light !== false) { const h = K.light('spot', 0, H, 0.15, { target, angle: o.angle ?? 22, color: o.color || '#fff4e0', intensity: o.intensity ?? 40, distance: 20, bank: o.bank }); anim(K, () => { if (lm.isMaterial) lm.emissiveIntensity = h.isOn ? 2.5 : 0.03; }); }
  });

  // --- the mast --------------------------------------------------------------------------------------------------------
  const mastUnit = (H, flare, b0, b1) => unit(`mast${q3(H)}|${q3(flare)}`, (u) => {
    const half = (y) => (y < flare ? lerp(b0, b1, y / flare) : b1);
    const panel = 3.0, levels = [];
    for (let y = 0; y < H; y += panel) levels.push(y);
    levels.push(H);
    for (let i = 0; i < levels.length - 1; i++) {
      const ya = levels[i], yb = levels[i + 1], ha = half(ya), hb = half(yb);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) u.rod('steel', [sx * ha, ya, sz * ha], [sx * hb, yb, sz * hb], 0.07, { seg: 6 });
      // faces: X-bracing (the south face (+Z) keeps only the horizontals so the ladder is clear)
      const faces = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[-1, 1], [-1, -1]]];
      for (const [[ax, az], [bx, bz]] of faces) { u.rod('steel', [ax * ha, ya, az * ha], [bx * hb, yb, bz * hb], 0.03, { seg: 5 }); u.rod('steel', [bx * ha, ya, bz * ha], [ax * hb, yb, az * hb], 0.03, { seg: 5 }); }
      for (const [[ax, az], [bx, bz]] of yb < flare ? faces : [...faces, [[1, 1], [-1, 1]]]) u.rod('steel', [ax * hb, yb, az * hb], [bx * hb, yb, bz * hb], 0.028, { seg: 5 });
    }
    // ladder (vertical, just outside the upper south face) and its cage
    const lz = b1 + 0.28;
    for (const s of [-1, 1]) u.box('steel', s * 0.22, 0, lz, 0.05, H - 1, 0.02);
    for (let y = 0.3; y < H - 1; y += 0.3) u.cylc('steel', 0, y, lz, 0.013, 0.44, { rz: 90, seg: 5 });
    for (let y = 2.4; y < H - 1; y += 1.2) { u.geo('steel', gTorus(0.38, 0.012, 4, 12, Math.PI), 0, y, lz + 0.3, { rx: 90 }); for (const s of [-1, 1]) u.rod('steel', [s * 0.22, y, lz], [s * 0.38, y, lz + 0.3], 0.01); }
    for (let k = 0; k < 5; k++) { const a = Math.PI * (k / 4); u.box('steel', Math.cos(a) * 0.38, 2.4, lz + 0.3 + Math.sin(a) * 0.38, 0.04, H - 3.4, 0.008); }
    for (let y = 1.5; y < H - 1; y += 3) u.rod('steel', [0, y, b1], [0, y, lz], 0.015);
    // feeder cable ladder beside the ladder
    u.box('cable', 0.55, 0, b1 + 0.08, 0.12, H - 2, 0.06);
  });
  // mast: 60 m steel lattice tower — flared base, square shaft, ladder with a cage on the south face (+Z), 4×4 m grating
  // platforms, sector antennas and dishes at the top, the red aircraft light (blinking), RF signs at the base.
  // opts h (60), platforms ([20, 40, 56]). userData.platforms, ladder {x, z, y0, y1}, top
  def('mast', { collide: false }, (K, o, g) => {
    const H = o.h ?? 60, flare = Math.min(10, H * 0.17), b0 = 2.4, b1 = 1.3;
    placeUnit(g, mastUnit(H, flare, b0, b1), { steel: { tex: 'metal', color: '#8e928c', roughness: 0.6 }, cable: { color: '#1a1a1a', roughness: 0.6 } });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, sx * b0, 0, sz * b0, 0.8, 0.3, 0.8, 'concrete');
    const plats = (o.platforms || [20, 40, 56]).filter((y) => y < H);
    const grate = { tex: 'metal_grating', color: '#a8aca6' }, rail = { tex: 'metal', color: '#c9a822', roughness: 0.6 };
    const lz = b1 + 0.28;
    for (const y of plats) {
      // grating around a hatch for the ladder (x ±0.4, z from lz − 0.05 to lz + 0.7)
      const h0 = lz - 0.05, h1 = Math.min(1.97, lz + 0.7);
      box(g, 0, y - 0.05, (-2 + h0) / 2, 4, 0.05, h0 + 2, grate, { uv: 2 });
      box(g, 0, y - 0.05, (h1 + 2) / 2, 4, 0.05, 2 - h1, grate, { uv: 2 });
      for (const s of [-1, 1]) box(g, s * 1.2, y - 0.05, (h0 + h1) / 2, 1.6, 0.05, h1 - h0, grate, { uv: 2 });
      const edges = [[[-2, -2], [2, -2]], [[2, -2], [2, 2]], [[2, 2], [-2, 2]], [[-2, 2], [-2, -2]]];
      for (const [a, b] of edges) { for (const hh of [0.55, 1.1]) rod(g, [a[0], y + hh, a[1]], [b[0], y + hh, b[1]], 0.022, rail, { seg: 6 }); box(g, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) + 0.02, 0.1, Math.abs(b[1] - a[1]) + 0.02, rail); }
      for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2], [0, -2], [2, 0], [-2, 0], [0, 2]]) cyl(g, x, y, z, 0.022, 1.1, rail, { seg: 6 });
    }
    // top: sector antennas, dishes, lightning rod, aircraft light
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; box(g, Math.sin(a) * (b1 + 0.2), H - 2.4, Math.cos(a) * (b1 + 0.2), 0.3, 1.8, 0.1, { color: '#dcdad2', roughness: 0.5 }, { ry: (a * 180) / Math.PI }); }
    for (const [y, a] of [[H - 6, 0.8], [H - 9, 3.6]]) { const x = Math.sin(a) * (b1 + 0.35), z = Math.cos(a) * (b1 + 0.35); add(g, gSph(0.45, 14, Math.PI / 2), { color: '#dcdad2', roughness: 0.5, side: 'double' }, x, y, z, { rx: 90, ry: (a * 180) / Math.PI, s: [1, 0.35, 1] }); }
    rod(g, [0, H, 0], [0, H + 3, 0], 0.03, M.galv);
    // (the halo is deep red, 14 m wide and only lightly fogged — it reads across the summit; opts halo, haloFog)
    const aircraft = K.light('led', 0, H + 3.1, 0, { color: '#ff2a1c', haloColor: o.haloColor ?? '#ff1606', size: 0.18, blink: o.blink ?? 1.6, duty: 0.45, halo: o.halo ?? 14, haloOpacity: o.haloOpacity ?? 0.95, haloFog: o.haloFog ?? 0.3, intensity: 4, bank: o.bank });
    K.sign('DANGER\nRF RADIATION', 0, 1.6, b0 + 0.45, 0.5, 0.42, { style: 'warning' });
    g.userData.platforms = plats; g.userData.ladder = { x: 0, z: lz + 0.35, y0: 0, y1: H - 1 }; g.userData.top = H; g.userData.aircraft = aircraft;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) col(K, o, sx * b0 - 0.4, sz * b0 - 0.4, sx * b0 + 0.4, sz * b0 + 0.4, 3);
  });

  // =================================================================================================================
  // LOBBIES, OFFICES, HOMES, WARDS
  // =================================================================================================================
  // turnstile: stainless waist-high cabinet, lane on its +X side. opts variant 'tripod' (default) | 'glass' (speed gate
  // flap), open (0..1), block (true: a lane collider while shut → userData.collider). userData.setOpen(v)
  def('turnstile', { collide: false }, (K, o, g) => {
    const glass = o.variant === 'glass';
    box(g, 0, 0, 0, 0.24, 1.0, 1.3, M.stainless);
    box(g, 0, 1.0, 0, 0.26, 0.03, 1.32, { color: '#1a1e20', roughness: 0.1, metalness: 0.3 });
    pl(g, 0, 1.031, 0.35, 0.16, 0.16, TM(labelTex('TAP CARD\n▭', 'dark')), { rx: -90 });
    const xM = lampMat('#401010', '#ff2a1c', 2.2), okM = lampMat('#103020', '#3dff9a', 0);
    box(g, 0.121, 0.82, 0.45, 0.004, 0.06, 0.06, xM, { cast: false }); box(g, 0.121, 0.82, 0.55, 0.004, 0.06, 0.06, okM, { cast: false });
    const piv = grp(g, 0.14, 0.86, 0.1, 0, 'arms');
    let setOpen;
    if (glass) {
      box(piv, 0.3, -0.45, 0, 0.6, 0.9, 0.015, { color: '#cfe0dc', roughness: 0.05, transparent: true, opacity: 0.35 }, { cast: false });
      box(piv, 0.3, 0.44, 0, 0.6, 0.02, 0.02, M.chrome);
      setOpen = (v) => { piv.rotation.y = -clamp(v) * R(88); };
    } else {
      // hub axis tilted 45° toward +Z: the top arm lies horizontal across the lane, the other two drop into the cabinet
      const axis = grp(piv, 0.04, 0, 0); axis.rotation.x = R(45);
      cylc(axis, 0, 0, 0, 0.06, 0.08, M.chrome, { seg: 12 });
      const spin = grp(axis, 0, 0.03, 0);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; rod(spin, [0, 0, 0], [Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52], 0.018, M.chrome, { seg: 8 }); }
      live(spin);
      setOpen = (v) => { spin.rotation.y = clamp(v) * R(120); };
    }
    live(piv);
    const lane = o.block === false || o.collide === false ? null : K.collider(0.12, -0.05, 0.72, 0.25, { h: 1.0 });
    const so = (v) => { setOpen(v); if (lane) lane.enabled = v < 0.5; xM.emissiveIntensity = v < 0.5 ? 2.2 : 0; okM.emissiveIntensity = v < 0.5 ? 0 : 2.2; };
    so(o.open ?? 0);
    g.userData.setOpen = so; g.userData.collider = lane;
    col(K, o, -0.13, -0.66, 0.13, 0.66, 1.05);
  });

  // ticket_machine: queue-number dispenser on a pedestal with a red button and a ticket in the slot. opts text (ticket,
  // 'You are number 4,112.'), serving ('0412'); userData.print() → Promise (the ticket slides out)
  const ticketTex = (t) => ctex('ticket|' + t, 128, 192, (ctx, w, h, r) => {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, w, h);
    txt(ctx, 'CUSTOMER CARE', w / 2, 24, { size: 12, font: F.sans, weight: 'bold', color: '#222', align: 'center' });
    ctx.fillStyle = '#222'; ctx.fillRect(10, 32, w - 20, 1);
    const m = /([\d,]+)/.exec(t); txt(ctx, m ? m[1] : '4,112', w / 2, 96, { size: 34, font: F.mono, weight: 'bold', color: '#111', align: 'center' });
    ctx.font = `12px ${F.sans}`; TU.wrapText(ctx, t, w - 20).forEach((l, i) => txt(ctx, l, w / 2, 124 + i * 15, { size: 12, font: F.sans, color: '#333', align: 'center' }));
    txt(ctx, 'Please wait to be called.', w / 2, h - 16, { size: 9, font: F.sans, color: '#555', align: 'center' });
    TU.age(ctx, w, h, r, 0.3);
  });
  def('ticket_machine', { collide: 0.2 }, (K, o, g) => {
    cyl(g, 0, 0, 0, 0.18, 0.03, M.stainless, { seg: 14 });
    cyl(g, 0, 0.03, 0, 0.04, 0.95, M.stainless, { seg: 10 });
    box(g, 0, 0.95, 0, 0.3, 0.42, 0.2, { color: BR.teal, roughness: 0.45 });
    box(g, 0, 1.37, 0, 0.32, 0.03, 0.22, M.stainless);
    pl(g, 0, 1.26, 0.101, 0.26, 0.08, TM(Tex.sign('TAKE A NUMBER', { style: 'shop', w: 0.26, h: 0.08, bg: BR.teal, fg: '#fff', border: false })), {});
    pl(g, 0, 1.17, 0.101, 0.2, 0.06, TM(dispTex('NOW SERVING ' + (o.serving ?? '0412'), 'led', 256, 48), { emissive: 1.2 }), {});
    cylc(g, 0, 1.06, 0.105, 0.035, 0.03, { color: '#b3261e', roughness: 0.4 }, { rx: 90, seg: 14 });
    box(g, 0, 0.99, 0.095, 0.1, 0.012, 0.02, M.black);
    const tk = grp(g, 0, 0.995, 0.1);
    const tm = add(tk, gBox(0.06, 0.001, 0.09), TM(ticketTex(o.text ?? 'You are number 4,112.')), 0, 0, 0.03, { rx: -20 });
    live(tk);
    let tw = null;
    tk.position.z = 0.07; tm.visible = true;
    anim(K, (dt) => { if (!tw) return; tw.t += dt; const k = Math.min(1, tw.t / 0.8); tk.position.z = 0.07 + k * 0.06; tk.position.y = 0.995 - k * 0.01; if (k >= 1) { const f = tw.res; tw = null; f(); } });
    g.userData.print = () => new Promise((res) => { tk.position.z = 0.07; tw = { t: 0, res }; });
  });

  // vending_machine: snack/drink machine — lit glass front with product spirals, keypad, coin slot, pickup flap, a taped
  // sign (opts.sign 'OUT OF ORDER'; '' for none). opts lit (true), light (weak glow light)
  const vendTex = () => ctex('vend', 256, 512, (ctx, w, h, r) => {
    ctx.fillStyle = '#16181a'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 6; row++) {
      const y = 20 + row * 80;
      ctx.fillStyle = '#6a6e70'; ctx.fillRect(8, y + 62, w - 16, 5);
      for (let i = 0; i < 5; i++) {
        const x = 14 + i * 47; if (r() < 0.2) continue;
        ctx.strokeStyle = '#9aa0a0'; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + 20, y + 40 + k * 0, 18, 6, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = pick(['#c0392b', '#e67e22', '#f1c40f', '#2e86c1', '#27ae60', '#8e44ad', '#d35400'], r); ctx.fillRect(x + 6, y + 6, 30, 44);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 9, y + 16, 24, 8);
        txt(ctx, 'A' + row + i, x + 20, y + 76, { size: 9, font: F.mono, color: '#ddd', align: 'center' });
      }
    }
    const g2 = ctx.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(255,255,255,0.05)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g2.addColorStop(1, 'rgba(255,255,255,0.03)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  });
  def('vending_machine', { collide: true }, (K, o, g) => {
    const lit = o.lit !== false;
    box(g, 0, 0, 0, 0.95, 1.83, 0.8, { color: '#6d1a16', roughness: 0.45 });
    box(g, 0, 0, 0.02, 0.9, 0.06, 0.76, M.black);
    pl(g, -0.12, 1.02, 0.401, 0.6, 1.4, TM(vendTex(), lit ? { emissive: 0.55 } : {}), {});
    box(g, -0.12, 0.3, 0.39, 0.64, 1.48, 0.02, 'glass', { cast: false });
    box(g, 0.34, 0.9, 0.401, 0.2, 0.7, 0.012, M.darkPlastic);
    pl(g, 0.34, 1.18, 0.408, 0.16, 0.05, TM(dispTex('SELECT', 'vfd', 128, 36), { emissive: lit ? 1 : 0.1 }), {});
    for (let i = 0; i < 12; i++) box(g, 0.3 + (i % 3) * 0.04, 0.95 + Math.floor(i / 3) * 0.045, 0.407, 0.03, 0.03, 0.006, { color: '#c8c8c0' });
    box(g, 0.34, 0.78, 0.407, 0.05, 0.08, 0.006, M.chrome);
    box(g, -0.12, 0.1, 0.39, 0.6, 0.18, 0.03, M.black);
    box(g, 0, 1.83, 0, 0.95, 0.03, 0.8, M.black);
    const sign = o.sign ?? 'OUT OF ORDER';
    if (sign) pl(g, -0.12, 1.25, 0.405, 0.3, 0.2, TM(noteTex(sign, 'white', '#141414', 256, 170)), { rz: -4 });
    if (lit && o.light) K.light('screen', 0, 1.1, 0.8, { color: '#cfe4ea', intensity: 1.2, distance: 3, bank: o.bank });
  });

  // plinth: white display plinth with a backlit top edge. opts h (1.0), w (0.5), lit (true)
  def('plinth', { collide: 'auto' }, (K, o, g) => {
    const H = o.h ?? 1.0, w = o.w ?? 0.5, d = o.d ?? w;
    box(g, 0, 0, 0, w, 0.06, d, M.black);
    box(g, 0, 0.06, 0, w - 0.01, H - 0.1, d - 0.01, { color: '#eceae4', roughness: 0.3 });
    box(g, 0, H - 0.04, 0, w + 0.01, 0.04, d + 0.01, { color: '#f4f3ef', roughness: 0.25 });
    if (o.lit !== false) box(g, 0, H - 0.07, 0, w + 0.005, 0.025, d + 0.005, glowS('#eaf6f4', 1.4), { cast: false });
  });

  // plastic_sheet: hanging renovation sheeting with folds, taped to a batten; pools on the floor. opts w (3), h (2.8)
  const sheetGeo = (w, h, seed) => cg(`psheet${q3(w)}|${q3(h)}|${seed}`, () => {
    const nx = Math.max(6, Math.round(w * 6)), g2 = new THREE.PlaneGeometry(w, h, nx, 4), p = g2.attributes.position, rr = U.rng(seed);
    const ph = [rr() * 6, rr() * 6];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), t = (h / 2 - y) / h; p.setZ(i, Math.sin(x * 3.1 + ph[0]) * 0.05 * t + Math.sin(x * 7.3 + ph[1]) * 0.02 * t + t * t * 0.06); }
    const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
    g2.computeVertexNormals(); g2.translate(0, h / 2, 0); return g2;
  });
  def('plastic_sheet', { collide: false }, (K, o, g) => {
    const w = o.w ?? 3, h = o.h ?? 2.8, r = rngOf(K, o, 'ps');
    add(g, sheetGeo(w, h - 0.02, Math.floor(r() * 4)), { tex: 'plastic_sheet' }, 0, 0.02, 0, { cast: false });
    flat(g, 0, 0.012, 0.18, w, 0.36, { tex: 'plastic_sheet' }, {});
    box(g, 0, h - 0.04, -0.03, w, 0.05, 0.04, M.pine);
    for (let x = -w / 2 + 0.2; x < w / 2; x += 0.5 + r() * 0.3) box(g, x, h - 0.07, 0.005, 0.12, 0.05, 0.002, { color: '#b8a878', roughness: 0.5 }, { cast: false });
  });
  // drop_sheet: painter's canvas drop sheet. opts variant 'floor' (crumpled on the floor) | 'draped' (over a hidden shape
  // w × h × d), w, d, h
  const dropTex = () => ctex('dropsheet', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#d6cfbe'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { ctx.fillStyle = `rgba(120,110,90,${0.04 + r() * 0.05})`; ctx.fillRect(0, y, w, 1); }
    for (let k = 0; k < 40; k++) { const x = r() * w, y = r() * h, s = 2 + r() * 10; ctx.fillStyle = pick(['rgba(240,238,230,0.8)', 'rgba(180,190,196,0.7)', 'rgba(120,130,140,0.5)', 'rgba(210,200,160,0.7)'], r); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * s * 4, y + (r() - 0.5) * s * 4, s * 0.2, 0, TAU); ctx.fill(); } }
    TU.modulate(ctx, w, h, TU.fbm(w, h, r, { cells: 3, oct: 4 }), 0.18);
  }, { wrap: true, size: 1 });
  def('drop_sheet', { collide: false }, (K, o, g) => {
    const w = o.w ?? 2.4, d = o.d ?? 1.6, r = rngOf(K, o, 'ds'), tex = TM(dropTex(), { roughness: 0.95, double: true });
    if (o.variant === 'draped') {
      const h = o.h ?? 0.9;
      box(g, 0, h - 0.02, 0, w, 0.04, d, tex, { uv: 1 });
      for (const [x, z, ww, ry] of [[0, d / 2, w, 0], [0, -d / 2, w, 180], [w / 2, 0, d, 90], [-w / 2, 0, d, -90]]) {
        const sk = grp(g, x, 0, z, ry);
        add(sk, gTaper(ww + 0.02, 0.02, ww + 0.02, 0.02, h, 0), tex, 0, 0, 0.03, {});
        add(sk, gTaper(ww + 0.2, 0.06, ww, 0.02, 0.25, 0), tex, 0, 0, 0.06, {});
      }
      col(K, o, -w / 2 - 0.1, -d / 2 - 0.1, w / 2 + 0.1, d / 2 + 0.1, h);
      return;
    }
    const geo = cg(`dropfloor${q3(w)}|${q3(d)}`, () => { const gg = new THREE.PlaneGeometry(w, d, 10, 8), p = gg.attributes.position, rr = U.rng(7); for (let i = 0; i < p.count; i++) p.setZ(i, Math.max(0, Math.sin(p.getX(i) * 3.3 + rr()) * Math.cos(p.getY(i) * 2.7) * 0.05 + rr() * 0.015)); gg.computeVertexNormals(); gg.rotateX(-Math.PI / 2); gg.translate(0, 0.006, 0); return gg; });
    add(g, geo, tex, 0, 0, 0, { ry: r() * 30, cast: false });
  });
  // paint_tins: a cluster of paint tins (lids off, drips), a roller tray and a brush
  const tinTex = (c) => ctex('tin|' + c, 128, 64, (ctx, w, h, r) => {
    ctx.fillStyle = '#d8d8d2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c; ctx.fillRect(0, h * 0.3, w, h * 0.3);
    txt(ctx, 'WALLCOTE', w * 0.25, h * 0.22, { size: 10, font: F.heavy, color: '#1a3a5a', align: 'center' }); txt(ctx, 'LOW SHEEN · 4L', w * 0.25, h * 0.85, { size: 8, font: F.sans, color: '#333', align: 'center' });
    for (let k = 0; k < 5; k++) { ctx.fillStyle = c; ctx.fillRect(r() * w, 0, 2 + r() * 3, h * (0.2 + r() * 0.5)); }
    TU.age(ctx, w, h, r, 0.8);
  });
  def('paint_tins', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'pt');
    const cols = ['#e8e6de', '#9aa6ac', '#c9c3a8', '#6a7a82'];
    for (let i = 0; i < 4; i++) {
      const big = i < 2, rr = big ? 0.12 : 0.085, hh = big ? 0.25 : 0.18, x = (i % 2) * 0.3 - 0.15 + (r() - 0.5) * 0.05, z = Math.floor(i / 2) * 0.28 - 0.14 + (r() - 0.5) * 0.05, c = pick(cols, r);
      cyl(g, x, 0, z, rr, hh, TM(tinTex(c), { roughness: 0.5, metalness: 0.4 }), { seg: 16, uv: false });
      if (r() < 0.5) add(g, gCircle(rr * 0.95, 16), { color: c, roughness: 0.3 }, x, hh + 0.001, z, { rx: -90, cast: false });
      else cyl(g, x, hh, z, rr + 0.004, 0.01, M.steel, { seg: 16 });
      add(g, gTorus(rr * 0.7, 0.003, 3, 10, Math.PI), M.steel, x, hh, z, { ry: r() * 180 });
    }
    box(g, 0.45, 0, 0.1, 0.32, 0.05, 0.4, { color: '#3a3e40', roughness: 0.5 }, { ry: 20 });
    flat(g, 0.45, 0.04, 0.12, 0.28, 0.3, { color: '#e8e6de', roughness: 0.3 }, { ry: 20 });
    cylc(g, 0.45, 0.07, 0.0, 0.03, 0.22, { tex: 'fabric_knit', color: '#e8e6de' }, { rz: 90, ry: 20, seg: 10 });
    box(g, -0.4, 0.0, 0.25, 0.05, 0.015, 0.22, M.pine, { ry: 60 });
  });
  // mop_bucket: yellow mop bucket on castors with a wringer and a mop leaning in it. opts sign (true → wet floor sign)
  def('mop_bucket', { collide: 'auto' }, (K, o, g) => {
    const y = { color: '#d8b928', roughness: 0.45 };
    for (const [x, z] of [[-0.17, -0.14], [0.17, -0.14], [-0.17, 0.14], [0.17, 0.14]]) sph(g, x, 0.03, z, 0.03, M.black, { seg: 6 });
    taper(g, 0, 0.05, 0, 0.36, 0.3, 0.42, 0.36, 0.32, y);
    flat(g, 0, 0.3, 0, 0.36, 0.3, { color: '#4a4a3e', roughness: 0.1, metalness: 0.2 });
    box(g, 0.12, 0.37, 0, 0.14, 0.18, 0.3, { color: '#3a3e40', roughness: 0.5 });
    rod(g, [0.14, 0.55, 0], [0.24, 0.9, 0], 0.012, M.black, { seg: 6 });
    rod(g, [-0.05, 0.1, 0.02], [-0.25, 1.4, -0.1], 0.013, { color: '#5a7a9a', roughness: 0.5 }, { seg: 6 });
    add(g, gIco(0.1, 1), { tex: 'fabric_knit', color: '#9a9480' }, -0.04, 0.2, 0.02, { s: [1, 0.7, 1] });
    if (o.sign) K.prop('wet_floor_sign', 0.6, 0.2, 20, { collide: false });
  });
  // wet_floor_sign: yellow A-frame "CAUTION — WET FLOOR"
  def('wet_floor_sign', { collide: 'auto' }, (K, o, g) => {
    const t = TM(Tex.sign('CAUTION\nWET FLOOR', { style: 'warning', w: 0.3, h: 0.5 }));
    for (const s of [-1, 1]) { const p = grp(g, 0, 0, s * 0.12); p.rotation.x = R(s * 12); box(p, 0, 0, 0, 0.3, 0.62, 0.01, { color: '#e8c21a', roughness: 0.5 }); pl(p, 0, 0.36, s * 0.006, 0.28, 0.46, t, { ry: s > 0 ? 0 : 180 }); }
    box(g, 0, 0.62, 0, 0.1, 0.04, 0.08, { color: '#e8c21a', roughness: 0.5 });
  });

  // box: taped cardboard carton. opts w (0.45), h (0.35), d (0.35), open (flaps up), text (marker on the side),
  // variant 'plain' | 'returns' (label + tape) | 'crushed'
  function cartonBuild(p, x, y, z, w, h, d, ry, o, r) {
    const b = grp(p, x, y, z, ry);
    if (o.variant === 'crushed') { box(b, 0, 0, 0, w, h * 0.5, d, 'cardboard', { rz: 6, rx: -4 }); return b; }
    box(b, 0, 0, 0, w, h, d, 'cardboard');
    if (o.open) { for (const s of [-1, 1]) add(b, gBox(w, 0.004, d / 2), 'cardboard', 0, h + d * 0.2, s * (d / 2 + d * 0.12), { rx: s * 60 }); for (const s of [-1, 1]) add(b, gBox(w / 2, 0.004, d), 'cardboard', s * (w / 2 + w * 0.1), h + w * 0.18, 0, { rz: -s * 55 }); box(b, 0, h * 0.4, 0, w - 0.02, 0.01, d - 0.02, M.black); }
    else box(b, 0, h, 0, 0.07, 0.002, d + 0.002, { color: '#a88c5c', roughness: 0.4 }, { cast: false });
    if (o.text) pl(b, 0, h * 0.6, d / 2 + 0.002, w * 0.8, h * 0.4, paintMat(o.text, '#141414', F.marker, 256, 128), {});
    if (o.variant === 'returns') pl(b, w * 0.1, h * 0.5, d / 2 + 0.002, 0.14, 0.09, TM(labelTex('RETURN\nTO STORE', 'label')), { rz: (r() - 0.5) * 8 });
    return b;
  }
  def('box', { collide: 'auto' }, (K, o, g) => { const r = rngOf(K, o, 'box'); cartonBuild(g, 0, 0, 0, o.w ?? 0.45, o.h ?? 0.35, o.d ?? 0.35, 0, o, r); });
  // box_stack: an untidy pile of cartons. opts n (5)
  def('box_stack', { collide: 'auto' }, (K, o, g) => {
    const n = o.n ?? 5, r = rngOf(K, o, 'bxs');
    const base = Math.ceil(n * 0.6), placed = [];
    for (let i = 0; i < n; i++) {
      const w = 0.35 + r() * 0.25, h = 0.25 + r() * 0.2, d = 0.3 + r() * 0.2;
      if (i < base) { const x = (i - (base - 1) / 2) * 0.55 + (r() - 0.5) * 0.08, z = (r() - 0.5) * 0.2; cartonBuild(g, x, 0, z, w, h, d, (r() - 0.5) * 20, { variant: r() < 0.2 ? 'returns' : 'plain', text: r() < 0.2 ? pick(['RETURNS', 'FRAGILE', 'STOCK', 'DEMO'], r) : '' }, r); placed.push([x, h]); }
      else { const [x, hh] = placed[(i - base) % placed.length]; cartonBuild(g, x + (r() - 0.5) * 0.1, hh, (r() - 0.5) * 0.1, w * 0.85, h * 0.85, d * 0.85, (r() - 0.5) * 30, {}, r); }
    }
  });
  // satchel: grey courier returns satchel with a printed returns label; opts note (sticky-note text), modem (box inside)
  def('satchel', { collide: false }, (K, o, g) => {
    const bag = { tex: 'plastic_sheet', color: '#7d8280', opacity: 1, roughness: 0.55 };
    add(g, gSph(0.2, 12), { color: '#8a8e8c', roughness: 0.55 }, 0, 0.045, 0, { s: [1.05, 0.22, 0.8] });
    box(g, 0, 0.02, 0, 0.4, 0.06, 0.3, bag);
    flat(g, 0.03, 0.093, 0.02, 0.16, 0.11, TM(labelTex('RETURNS\nREPLY PAID 4471', 'label')), { ry: -6 });
    box(g, -0.18, 0.05, -0.12, 0.08, 0.04, 0.06, bag, { ry: 30, rz: 20 });
    if (o.modem) box(g, -0.1, 0.06, 0.05, 0.3, 0.1, 0.2, TM(modemBoxTex()), { ry: 15, uv: false });
    if (o.note) flat(g, 0.1, 0.1, -0.06, 0.08, 0.08, TM(noteTex(o.note, 'sticky', '#1a2a6e')), { ry: -14 });
  });
  // esky: blue-and-white cooler box
  def('esky', { collide: 'auto' }, (K, o, g) => {
    box(g, 0, 0, 0, 0.62, 0.3, 0.38, { color: o.color || '#2e5a8a', roughness: 0.45 });
    box(g, 0, 0.3, 0, 0.64, 0.07, 0.4, { color: '#e8e6de', roughness: 0.45 });
    for (const s of [-1, 1]) { box(g, s * 0.32, 0.22, 0, 0.03, 0.03, 0.2, M.darkPlastic); }
    cyl(g, 0.25, 0.04, 0.19, 0.015, 0.01, M.black, { rx: 90, seg: 8 });
    pl(g, 0, 0.18, 0.191, 0.2, 0.06, TM(labelTex('CHILLY BIN', 'label')), {});
  });
  // stacked_chairs: a stack of plastic chairs. opts n (8), color
  def('stacked_chairs', { collide: 'auto' }, (K, o, g) => {
    const n = o.n ?? 8, r = rngOf(K, o, 'stk'), c = o.color || '#3a4a5a';
    for (let i = 0; i < n; i++) { const p = grp(g, (r() - 0.5) * 0.02, i * 0.07, -i * 0.012, (r() - 0.5) * 3); chairBuild(p, 'plastic', r, c); }
  });
  // bingo_machine: ball blower — wood-grain cabinet, clear globe with balls, chute tray; a flashboard of 1–90 beside it
  // with the called numbers lit. opts board (true), called (count lit, 20)
  const bingoBoardTex = (called) => ctex('bingoboard|' + called, 512, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, w, h);
    txt(ctx, 'THURSDAY BINGO', w / 2, 26, { size: 22, font: F.heavy, color: '#e8c21a', align: 'center' });
    const lit = new Set(); const rr = U.rng(7); while (lit.size < called) lit.add(1 + Math.floor(rr() * 90));
    for (let i = 0; i < 90; i++) { const x = 16 + (i % 15) * 32, y = 50 + Math.floor(i / 15) * 34; const on = lit.has(i + 1); ctx.fillStyle = on ? '#ffcf5a' : '#2a2620'; ctx.fillRect(x, y, 28, 28); txt(ctx, String(i + 1), x + 14, y + 20, { size: 14, font: F.sans, weight: 'bold', color: on ? '#1a1206' : '#5a5040', align: 'center' }); }
  });
  def('bingo_machine', { collide: 'auto' }, (K, o, g) => {
    const r = rngOf(K, o, 'bingo');
    box(g, 0, 0, 0, 0.6, 0.85, 0.45, M.veneer);
    box(g, 0, 0.85, 0, 0.62, 0.03, 0.47, M.darkPlastic);
    cyl(g, 0, 0.88, 0, 0.09, 0.06, M.chrome, { seg: 12 });
    add(g, gSph(0.24, 18), { tex: 'glass', opacity: 0.4 }, 0, 1.18, 0, { cast: false });
    const ballC = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#ecf0f1'];
    for (let i = 0; i < 26; i++) { const a = r() * TAU, rr2 = r() * 0.16, y = 0.97 + r() * 0.12; sph(g, Math.cos(a) * rr2, y, Math.sin(a) * rr2, 0.022, { color: pick(ballC, r), roughness: 0.25 }, { seg: 8 }); }
    box(g, 0, 0.62, 0.23, 0.3, 0.03, 0.12, M.chrome, { rx: 10 });
    for (let i = 0; i < 3; i++) sph(g, -0.08 + i * 0.08, 0.66, 0.26, 0.022, { color: pick(ballC, r), roughness: 0.25 }, { seg: 8 });
    if (o.board !== false) {
      const bx = 1.3;
      for (const s of [-1, 1]) box(g, bx + s * 0.62, 0, -0.1, 0.05, 1.9, 0.05, M.steelDk);
      box(g, bx, 1.1, -0.1, 1.24, 0.66, 0.06, M.black);
      pl(g, bx, 1.43, -0.069, 1.2, 0.6, TM(bingoBoardTex(o.called ?? 20), { emissive: 0.6 }), {});
    }
  });
  // stage: community-hall stage — platform with a veneer fascia, steps at the +X end, red curtains and a valance.
  // opts w (6), d (3), h (0.8)
  def('stage', { collide: false }, (K, o, g) => {
    const w = o.w ?? 6, d = o.d ?? 3, H = o.h ?? 0.8;
    box(g, 0, 0, 0, w, H - 0.04, d, M.veneer);
    box(g, 0, H - 0.04, 0, w + 0.04, 0.04, d + 0.04, { tex: 'timber_floor' }, { uv: 1 / 1.2 });
    const steps = 4;
    for (let i = 0; i < steps; i++) box(g, w / 2 + 0.2 + (steps - 1 - i) * 0.28, 0, d / 2 - 0.5, 0.3, (H * (i + 1)) / steps, 0.9, M.veneer);
    const cm = TM(curtainTex('#6a1a1a'), { roughness: 0.95 });
    for (const s of [-1, 1]) { add(g, sheetGeo(1.4, 3.2, 2), cm, s * (w / 2 - 0.7), H, -d / 2 + 0.25, {}); }
    box(g, 0, H + 3.0, -d / 2 + 0.2, w + 0.2, 0.5, 0.1, cm, { uv: 1 });
    add(g, sheetGeo(w - 2.6, 3.0, 1), TM(curtainTex('#4a1414'), { roughness: 0.95 }), 0, H, -d / 2 + 0.05, {});
    col(K, o, -w / 2, -d / 2, w / 2, d / 2, H);
    col(K, o, w / 2, d / 2 - 0.95, w / 2 + 1.35, d / 2 - 0.05, H * 0.5);
  });
  // water_cooler: bottled water cooler with taps and a cup dispenser
  def('water_cooler', { collide: 'auto' }, (K, o, g) => {
    box(g, 0, 0, 0, 0.32, 0.95, 0.32, { color: '#dcdad2', roughness: 0.45 });
    box(g, 0, 0.62, 0.161, 0.2, 0.18, 0.012, M.greyPlastic);
    for (const [x, c] of [[-0.05, '#2e86c1'], [0.05, '#c0392b']]) box(g, x, 0.74, 0.18, 0.03, 0.04, 0.04, { color: c, roughness: 0.4 });
    box(g, 0, 0.6, 0.17, 0.18, 0.02, 0.06, M.greyPlastic);
    cyl(g, 0, 0.95, 0, 0.05, 0.08, { color: '#9cc4dc', roughness: 0.1, transparent: true, opacity: 0.55 }, { seg: 12 });
    cyl(g, 0, 1.02, 0, 0.14, 0.42, { color: '#9cc4dc', roughness: 0.1, transparent: true, opacity: 0.45 }, { seg: 16, cast: false });
    add(g, gSph(0.14, 16, Math.PI / 2), { color: '#9cc4dc', roughness: 0.1, transparent: true, opacity: 0.45 }, 0, 1.44, 0, { s: [1, 0.4, 1], cast: false });
    cyl(g, 0.2, 0.55, 0, 0.04, 0.35, { color: '#e8e6de', roughness: 0.3, transparent: true, opacity: 0.7 }, { seg: 10 });
  });
  // plant_pot: office plant. opts variant 'palm' (default) | 'fern' | 'dead' | 'fiddle'
  // (collides as the pot only — r 0.22 m, 0.42 m high: drooping fronds never block a corner or the examine beside it,
  // and never block a camera's view of Aidan)
  def('plant_pot', { collide: 0.22, h: 0.42 }, (K, o, g) => {
    const v = o.variant || 'palm', r = rngOf(K, o, 'pp2');
    cyl(g, 0, 0, 0, 0.17, 0.36, { color: '#3a3e40', roughness: 0.5 }, { r2: 0.21, seg: 16 });
    add(g, gCircle(0.19, 14), { tex: 'dirt' }, 0, 0.33, 0, { rx: -90, cast: false });
    const green = v === 'dead' ? '#e0b888' : '#c8e0b0', fol = foliageMat(green);
    if (v === 'palm' || v === 'dead') {
      const n = v === 'dead' ? 5 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r(), L = 0.8 + r() * 0.7, tipY = v === 'dead' ? 0.5 + r() * 0.3 : 0.35 + L, tip = [Math.cos(a) * L * (v === 'dead' ? 0.55 : 0.35), tipY, Math.sin(a) * L * (v === 'dead' ? 0.55 : 0.35)];
        rod(g, [0, 0.34, 0], tip, 0.008, { color: v === 'dead' ? '#6a5236' : '#4a6a3a', roughness: 0.8 }, { seg: 4 });
        pl(g, tip[0], tip[1] - 0.15, tip[2], 0.55, 0.45, fol, { ry: (-a * 180) / Math.PI, rx: v === 'dead' ? 60 : 20, cast: true });
      }
      if (v === 'dead') for (let i = 0; i < 6; i++) flat(g, (r() - 0.5) * 0.7, 0.004, (r() - 0.5) * 0.7, 0.1, 0.05, { color: '#7a5a3a', roughness: 0.9 }, { ry: r() * 180 });
    } else if (v === 'fern') { for (let i = 0; i < 5; i++) pl(g, 0, 0.55, 0, 0.9, 0.55, fol, { ry: i * 36, rx: (r() - 0.5) * 20, cast: true }); }
    else { rod(g, [0, 0.34, 0], [0.02, 1.4, 0], 0.012, { color: '#5a4a36' }, { seg: 5 }); for (let i = 0; i < 9; i++) { const y = 0.6 + i * 0.09, a = i * 2.4; add(g, gCircle(0.12, 8), { color: '#3f5a36', roughness: 0.6, side: 'double' }, Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, { rx: -40, ry: (-a * 180) / Math.PI, s: [1, 1.4, 1] }); } }
  });

  // mug (tabletop): opts text (printed round the mug, e.g. "World's Okayest Manager"), color, full (coffee inside)
  const mugTex = (text, c) => ctex(`mug|${c}|${text}`, 256, 96, (ctx, w, h, r) => {
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    if (text) { const lines = String(text).split('\n').length > 1 ? String(text).split('\n') : (String(text).length > 14 ? [String(text).replace(/^(\S+\s\S+)\s/, '$1\n')].join('').split('\n') : [String(text)]); const light = TU.hex(c).reduce((a, b) => a + b, 0) > 380; const s = fit(ctx, lines, w * 0.42, h * 0.7, (q) => `bold ${q}px ${F.serif}`, 26); lines.forEach((l, i) => txt(ctx, l, w * 0.5, h / 2 - (lines.length - 1) * s * 0.55 + i * s * 1.1 + s * 0.35, { size: s, font: F.serif, weight: 'bold', color: light ? '#1c1c1c' : '#f2efe6', align: 'center' })); }
    ctx.fillStyle = 'rgba(80,60,40,0.25)'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
    for (let k = 0; k < 20; k++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.12})`; ctx.fillRect(r() * w, r() * h, 3, 1); }
  });
  def('mug', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'mug'), c = o.color || pick(['#e8e6de', '#e8e6de', '#2f5d73', '#8a2a22', '#e0c050'], r);
    const text = o.text ?? pick(['', '', 'Best Nan', 'I ♥ SIGNAL HILL', 'Keep Calm and Close', ''], r);
    add(g, gCyl(0.04, 0.04, 0.095, 18, 0), TM(mugTex(text, c), { roughness: 0.3, offset: false }), 0, 0.0475, 0, { ry: 180 });
    add(g, gTorus(0.026, 0.007, 5, 10, Math.PI), { color: c, roughness: 0.3 }, 0.04, 0.05, 0, { rz: -90 });
    add(g, gCircle(0.036, 14), o.full === false ? { color: c } : { color: '#2a1a10', roughness: 0.15 }, 0, 0.085, 0, { rx: -90, cast: false });
  });
  // sandwich (tabletop): a half-eaten sandwich in cling wrap on a paper napkin
  def('sandwich', { collide: false }, (K, o, g) => {
    flat(g, 0, 0.001, 0, 0.24, 0.24, { color: '#ecebe4', roughness: 0.9 }, { ry: 10 });
    const bread = { color: '#d8c090', roughness: 0.85 }, crust = { color: '#9a6a36', roughness: 0.8 };
    const tri = [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06]], bitten = [[-0.06, -0.06], [0.06, -0.06], [0.02, -0.03], [0.03, 0.0], [-0.01, 0.01], [-0.02, 0.04], [-0.06, 0.06]];
    const half = (pts, key, x, z, ry) => {
      const p = grp(g, x, 0.004, z, ry);
      for (const [y, m] of [[0, bread], [0.028, bread]]) add(p, gExtrude(key, pts, 0.012), m, 0, y + 0.006, 0, { rx: -90 });
      add(p, gExtrude(key + 'f', pts.map(([a, b]) => [a * 0.97, b * 0.97]), 0.012), { color: '#6a8a3a', roughness: 0.7 }, 0, 0.018, 0, { rx: -90 });
      add(p, gExtrude(key + 'f2', pts.map(([a, b]) => [a * 0.95, b * 0.95]), 0.006), { color: '#d8928a', roughness: 0.6 }, 0, 0.024, 0, { rx: -90 });
      box(p, 0, 0, -0.06, 0.12, 0.04, 0.006, crust);
    };
    half(tri, 'sandtri', 0.03, 0.0, 0); half(bitten, 'sandbit', -0.04, 0.03, 160);
    box(g, 0, 0.002, 0.005, 0.22, 0.05, 0.2, { color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.18 }, { cast: false });
  });
  // drawing: a child's crayon drawing. opts text (caption, e.g. 'MUMMY AT WORK'), variant 'flat' (on a desk) | 'wall'
  // (taped up, mount 1.3)
  const drawingTex = (cap, v = 0) => ctex(`drawing|${cap}|${v}`, 256, 192, (ctx, w, h, r) => {
    ctx.fillStyle = '#f4f2ea'; ctx.fillRect(0, 0, w, h);
    const crayon = (c, wd, pts) => { ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + (r() - 0.5) * 2, y + (r() - 0.5) * 2) : ctx.moveTo(x, y))); ctx.stroke(); };
    crayon('#2a8a3a', 6, [[0, h * 0.82], [w * 0.3, h * 0.8], [w * 0.6, h * 0.84], [w, h * 0.81]]);
    crayon('#f1c40f', 4, [[w * 0.86, h * 0.1], [w * 0.95, h * 0.18], [w * 0.86, h * 0.27], [w * 0.77, h * 0.18], [w * 0.86, h * 0.1]]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; crayon('#f1c40f', 2, [[w * 0.86 + Math.cos(a) * 16, h * 0.185 + Math.sin(a) * 16], [w * 0.86 + Math.cos(a) * 26, h * 0.185 + Math.sin(a) * 26]]); }
    crayon('#c0392b', 4, [[w * 0.08, h * 0.8], [w * 0.08, h * 0.45], [w * 0.2, h * 0.28], [w * 0.32, h * 0.45], [w * 0.32, h * 0.8]]);
    crayon('#2e86c1', 3, [[w * 0.16, h * 0.55], [w * 0.24, h * 0.55], [w * 0.24, h * 0.66], [w * 0.16, h * 0.66], [w * 0.16, h * 0.55]]);
    const person = (x, s, c) => { ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, h * 0.5 - 30 * s, 9 * s, 0, TAU); ctx.stroke(); crayon(c, 4, [[x, h * 0.5 - 21 * s], [x, h * 0.5 + 10 * s]]); crayon('#222', 2.5, [[x - 14 * s, h * 0.5 - 8 * s], [x + 14 * s, h * 0.5 - 8 * s]]); crayon('#222', 2.5, [[x - 9 * s, h * 0.5 + 34 * s], [x, h * 0.5 + 10 * s], [x + 9 * s, h * 0.5 + 34 * s]]); };
    person(w * 0.45, 1.25, v ? '#8e44ad' : BR.teal); person(w * 0.62, 0.8, '#e67e22'); if (!v) person(w * 0.74, 0.7, '#c0392b');
    hand(ctx, cap, w * 0.08, h * 0.16, { size: 20, color: '#8e44ad', font: F.marker, weight: 'bold' });
    TU.age(ctx, w, h, r, 0.4);
  });
  def('drawing', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'draw'), tex = TM(drawingTex(o.text ?? pick(['MUMMY AT WORK', 'MY DAD', 'ME AND NAN', 'OUR HOUSE'], r), o.v ?? 0));
    if (o.variant === 'wall') { pl(g, 0, o.mount ?? 1.3, 0.003, 0.297, 0.21, tex, { rz: (r() - 0.5) * 6 }); for (const s of [-1, 1]) pl(g, s * 0.13, (o.mount ?? 1.3) + 0.1, 0.004, 0.05, 0.02, { color: '#e6dcb8', roughness: 0.4, transparent: true, opacity: 0.7 }, { rz: s * 20 }); }
    else flat(g, 0, 0.002, 0, 0.297, 0.21, tex, { ry: (r() - 0.5) * 30 });
  });
  // cardigan_chair: a chair with a knitted cardigan draped over its back. opts chair ('office'|'timber'|'plastic'),
  // color (cardigan)
  def('cardigan_chair', { collide: 'auto' }, (K, o, g) => {
    const r = rngOf(K, o, 'cc'), kind = o.chair || 'office';
    let backY, backZ;
    if (kind === 'office') { K.prop('office_chair', 0, 0, 0, { collide: false, turn: 0 }); backY = 1.05; backZ = -0.26; }
    else { chairBuild(g, kind, r); backY = kind === 'timber' ? 0.92 : 0.84; backZ = kind === 'timber' ? -0.19 : -0.22; }
    const knit = { tex: 'fabric_knit', color: o.color || pick(['#7a3a3a', '#b8a888', '#4a5a6a', '#8a7a5a'], r), roughness: 0.97 };
    box(g, 0, backY - 0.02, backZ, 0.5, 0.05, 0.12, knit, { uv: 1 / 0.2 });
    box(g, 0, backY - 0.36, backZ + 0.07, 0.46, 0.36, 0.025, knit, { rx: 6, uv: 1 / 0.2 });
    box(g, 0, backY - 0.52, backZ - 0.07, 0.5, 0.52, 0.025, knit, { rx: -4, uv: 1 / 0.2 });
    for (const s of [-1, 1]) rod(g, [s * 0.25, backY - 0.02, backZ - 0.02], [s * 0.3, backY - 0.62, backZ - 0.1], 0.045, knit, { r2: 0.035, seg: 7 });
    for (let i = 0; i < 4; i++) sph(g, 0.08, backY - 0.12 - i * 0.08, backZ + 0.087, 0.008, { color: '#d8c8a8', roughness: 0.3 }, { seg: 6 });
  });
  // returns_cage: chain-link returns cage — steel frame, mesh panels, a padlocked door, "RETURNS — DO NOT SELL" sign,
  // boxes and satchels piled inside. opts w (3), d (2.2), h (2.4), open (door open), fill (true).
  // userData.setDoor(0..1) (needs open/live/name), userData.doorCollider (the doorway's collider; enabled while shut)
  def('returns_cage', { collide: false }, (K, o, g) => {
    const w = o.w ?? 3, d = o.d ?? 2.2, H = o.h ?? 2.4, r = rngOf(K, o, 'rc');
    const fr = paint('#6a7472');
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, x * w / 2, 0, z * d / 2, 0.05, H, 0.05, fr);
    for (const y of [0.05, H - 0.03]) { box(g, 0, y, -d / 2, w, 0.04, 0.04, fr); box(g, 0, y, d / 2, w, 0.04, 0.04, fr); box(g, -w / 2, y, 0, 0.04, 0.04, d, fr); box(g, w / 2, y, 0, 0.04, 0.04, d, fr); }
    box(g, 0, 0.05, -d / 2, w, H - 0.08, 0.004, 'chainlink', { cast: false });
    box(g, -w / 2, 0.05, 0, 0.004, H - 0.08, d, 'chainlink', { cast: false });
    box(g, w / 2, 0.05, 0, 0.004, H - 0.08, d, 'chainlink', { cast: false });
    box(g, 0, H, 0, w, 0.004, d, 'chainlink', { cast: false });
    const dw = 1.0, dx = -w / 2 + 0.1;
    box(g, (dx + dw + w / 2) / 2, 0.05, d / 2, w / 2 - dx - dw, H - 0.08, 0.004, 'chainlink', { cast: false });
    const door = grp(g, dx, 0, d / 2, 0, 'door');
    box(door, dw / 2, 0.05, 0, dw, H - 0.1, 0.004, 'chainlink', { cast: false });
    for (const y of [0.06, H - 0.1]) box(door, dw / 2, y, 0, dw, 0.04, 0.04, fr);
    box(door, dw, 0.05, 0, 0.04, H - 0.1, 0.04, fr);
    box(door, dw + 0.03, 1.0, 0.03, 0.05, 0.1, 0.02, M.steelDk);
    if (!o.open) { add(door, gTorus(0.025, 0.006, 4, 10, Math.PI), M.chrome, dw + 0.05, 1.02, 0.05, {}); box(door, dw + 0.05, 0.94, 0.05, 0.05, 0.06, 0.02, { tex: 'metal', color: '#b89a52', metalness: 0.7 }); }
    door.rotation.y = o.open ? R(-100) : 0;
    if (dynamic(o, 'open')) live(door);
    let doorCol = null;
    g.userData.setDoor = (v) => { if (baked('returns_cage', door)) return; door.rotation.y = -clamp(v) * R(100); if (doorCol) doorCol.enabled = clamp(v) < 0.5; };
    K.sign('RETURNS\nDO NOT SELL', 0.5, 1.6, d / 2 + 0.03, 0.7, 0.4, { style: 'warning' });
    if (o.fill !== false) {
      K.prop('box_stack', -w * 0.15, -d * 0.1, 10, { n: 7, collide: false, seed: 'rc1' });
      K.prop('box_stack', w * 0.25, 0.1, -20, { n: 5, collide: false, seed: 'rc2' });
      for (let i = 0; i < 5; i++) K.prop('satchel', (r() - 0.5) * (w - 0.6), (r() - 0.5) * (d - 0.6), r() * 360, { collide: false });
    }
    col(K, o, -w / 2 - 0.03, -d / 2 - 0.03, w / 2 + 0.03, -d / 2 + 0.03, H);
    col(K, o, -w / 2 - 0.03, d / 2 - 0.03, dx, d / 2 + 0.03, H); col(K, o, dx + dw, d / 2 - 0.03, w / 2 + 0.03, d / 2 + 0.03, H);
    doorCol = col(K, o, dx, d / 2 - 0.03, dx + dw, d / 2 + 0.03, H);
    if (doorCol) { doorCol.enabled = !o.open; g.userData.doorCollider = doorCol; }
    col(K, o, -w / 2 - 0.03, -d / 2, -w / 2 + 0.03, d / 2, H); col(K, o, w / 2 - 0.03, -d / 2, w / 2 + 0.03, d / 2, H);
  });
  // lift_doors (wall): stainless centre-opening lift doors in an architrave, floor indicator above, call panel with an
  // OUT OF SERVICE label, darkness behind. opts floor ('4'), sign ('OUT OF SERVICE'; '' none), w (1.1), open (0..1),
  // back (true; false = no dark box behind the leaves — doors seen and forced from the shaft side), call (true; false = no
  // call panel). userData.setOpen(v), collider
  def('lift_doors', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.1, H = o.h ?? 2.1;
    for (const s of [-1, 1]) box(g, s * (w / 2 + 0.08), 0, 0.02, 0.16, H + 0.12, 0.05, M.stainless);
    box(g, 0, H, 0.02, w + 0.32, 0.12, 0.05, M.stainless);
    if (o.back !== false) {
      box(g, 0, 0, -0.6, w + 0.1, H, 0.02, { color: '#050606', roughness: 1 });
      box(g, 0, 0, -0.3, w + 0.1, 0.02, 0.6, { color: '#0a0b0b', roughness: 1 });
      for (const s of [-1, 1]) box(g, s * (w / 2 + 0.05), 0, -0.3, 0.02, H, 0.6, { color: '#0a0b0b', roughness: 1 });
    }
    const leaves = [-1, 1].map((s) => { const L = grp(g, 0, 0, 0); box(L, s * w / 4, 0, 0, w / 2 - 0.005, H, 0.03, { tex: 'metal', color: '#cfd4d2', roughness: 0.3, metalness: 0.35 }); box(L, s * w / 4, 0, 0.016, w / 2 - 0.01, 0.01, 0.004, M.black, { cast: false }); live(L); return [L, s]; });
    box(g, 0, 0, 0.05, w + 0.1, 0.012, 0.12, M.stainless);
    pl(g, 0, H + 0.24, 0.02, 0.22, 0.12, TM(dispTex(o.floor ?? '4', 'amber', 96, 52), { emissive: o.lit === false ? 0.1 : 1.1 }), {});
    const px = w / 2 + 0.35;
    if (o.call !== false) {
      box(g, px, 1.0, 0.01, 0.1, 0.24, 0.02, M.stainless);
      for (const y of [1.16, 1.06]) cylc(g, px, y, 0.025, 0.022, 0.012, { color: '#c9ccca', roughness: 0.3 }, { rx: 90, seg: 12 });
      const sign = o.sign ?? 'OUT OF SERVICE';
      if (sign) pl(g, px, 0.86, 0.025, 0.18, 0.12, TM(noteTex(sign, 'white', '#141414', 192, 128)), { rz: -3 });
    }
    const collider = o.collide === false ? null : K.collider(-w / 2, -0.05, w / 2, 0.05, { h: H });
    const setOpen = (v) => { v = clamp(v); for (const [L, s] of leaves) L.position.x = s * v * (w / 2 - 0.02); if (collider) collider.enabled = v < 0.6; };
    setOpen(o.open ?? 0);
    g.userData.setOpen = setOpen; g.userData.collider = collider;
    col(K, o, -w / 2 - 0.2, -0.05, -w / 2, 0.08, H); col(K, o, w / 2, -0.05, w / 2 + 0.2, 0.08, H);
  });
  // desk_lamp (tabletop): articulated lamp; opts lit (true), light (pooled warm 'lamp' light), color (shade)
  def('desk_lamp', { collide: false }, (K, o, g) => {
    const sh = { color: o.color || '#2a3a3a', roughness: 0.45, metalness: 0.3 }, lit = o.lit !== false;
    cyl(g, 0, 0, 0, 0.08, 0.025, sh, { seg: 16 });
    sph(g, 0, 0.03, 0, 0.015, M.chrome, { seg: 8 });
    const a = [0, 0.03, 0], b = [0.02, 0.33, -0.08], c = [0.2, 0.42, 0.04];
    rod(g, a, b, 0.008, sh, { seg: 6 }); rod(g, [a[0] + 0.02, a[1], a[2]], [b[0] + 0.02, b[1], b[2]], 0.004, M.chrome, { seg: 4 });
    sph(g, ...b, 0.014, M.chrome, { seg: 8 });
    rod(g, b, c, 0.008, sh, { seg: 6 });
    const hd = grp(g, ...c); hd.rotation.x = R(50); hd.rotation.z = R(-20);
    cylc(hd, 0, -0.05, 0, 0.07, 0.11, sh, { r2: 0.03, seg: 14, open: true });
    const bm = lit ? glowMat('#ffe2a8', 3) : { color: '#d8d2c0', roughness: 0.3 };
    sph(hd, 0, -0.07, 0, 0.026, bm, { seg: 10 });
    if (lit) {
      Render.halo([c[0] + 0.03, c[1] - 0.06, c[2] + 0.04], { parent: g, color: '#ffd9a0', size: 0.6, opacity: 0.45 });
      if (o.light !== false) { const h = K.light('lamp', c[0] + 0.05, c[1] - 0.12, c[2] + 0.06, { bank: o.bank }); anim(K, () => { bm.emissiveIntensity = h.isOn ? 3 : 0.05; }); }
    }
  });
  // contract_stack: a tall, untidy stack of printed contracts with SIGN HERE flags. opts h (0.6)
  const paperEdgeTex = () => ctex('paperedge', 64, 256, (ctx, w, h, r) => { ctx.fillStyle = '#e8e4d8'; ctx.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { ctx.fillStyle = `rgba(${120 + r() * 40},${116 + r() * 30},${100},${0.25 + r() * 0.3})`; ctx.fillRect(0, y, w, 1); } }, { wrap: true, size: 0.1 });
  def('contract_stack', { collide: 'auto' }, (K, o, g) => {
    const H = o.h ?? 0.6, r = rngOf(K, o, 'cs'), edge = TM(paperEdgeTex(), { roughness: 0.9 });
    let y = 0;
    while (y < H - 0.01) {
      const hh = Math.min(H - y, 0.05 + r() * 0.12);
      box(g, (r() - 0.5) * 0.02, y, (r() - 0.5) * 0.02, 0.215, hh, 0.3, edge, { ry: (r() - 0.5) * 6, uv: 1 / 0.1 });
      if (r() < 0.5) box(g, 0.1 + r() * 0.02, y + hh * 0.5, (r() - 0.5) * 0.2, 0.05, 0.004, 0.02, { color: pick(['#f1c40f', '#e67e22', '#e84a8a'], r), roughness: 0.4 }, { cast: false });
      y += hh;
    }
    flat(g, 0, H + 0.002, 0, 0.21, 0.297, TM(contractPageTex()), { ry: (r() - 0.5) * 8 });
  });
  // crossword (tabletop): a folded newspaper open at the crossword, half done in pen, with a biro
  const crosswordTex = () => ctex('crossword', 256, 192, (ctx, w, h, r) => {
    ctx.fillStyle = '#e8e2cc'; ctx.fillRect(0, 0, w, h);
    txt(ctx, 'CRYPTIC No. 4,471', 10, 16, { size: 12, font: F.serif, weight: 'bold', color: '#1d1a14' });
    const n = 11, s = 13, x0 = 10, y0 = 24;
    const rr = U.rng(3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const black = (i % 2 === 1 && j % 2 === 1) || rr() < 0.08;
      ctx.fillStyle = black ? '#141210' : '#f4f0e2'; ctx.fillRect(x0 + i * s, y0 + j * s, s - 1, s - 1);
      if (!black && j < 7 && rr() < 0.7) hand(ctx, String.fromCharCode(65 + Math.floor(rr() * 26)), x0 + i * s + 2, y0 + j * s + 11, { size: 11, color: '#1f2c6e', wobble: 0.4 });
    }
    for (let k = 0; k < 12; k++) { ctx.fillStyle = 'rgba(40,36,28,0.5)'; ctx.fillRect(160, 24 + k * 13, 60 + r() * 30, 3); }
    txt(ctx, 'ACROSS', 160, 20, { size: 10, font: F.serif, weight: 'bold', color: '#1d1a14' });
    TU.age(ctx, w, h, r, 0.6);
  });
  def('crossword', { collide: false }, (K, o, g) => {
    flat(g, 0, 0.003, 0, 0.34, 0.26, TM(crosswordTex()), {});
    flat(g, 0.01, 0.0015, -0.01, 0.35, 0.27, { tex: 'paper', color: '#ddd6c0' }, { ry: 2 });
    rod(g, [0.12, 0.007, 0.08], [0.2, 0.007, -0.02], 0.004, { color: '#1f3f8a', roughness: 0.4 }, { seg: 6 });
  });
  // tea_towel: opts variant 'floor' (crumpled on the floor, default) | 'hung' (over an oven rail / bench edge at mount 0.8)
  const teaTowelTex = () => ctex('teatowel', 128, 192, (ctx, w, h, r) => { ctx.fillStyle = '#eeeae0'; ctx.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { ctx.fillStyle = 'rgba(160,40,40,0.55)'; ctx.fillRect(x, 0, 5, h); } for (let y = 0; y < h; y += 16) { ctx.fillStyle = 'rgba(160,40,40,0.35)'; ctx.fillRect(0, y, w, 5); } TU.age(ctx, w, h, r, 0.5); });
  def('tea_towel', { collide: false }, (K, o, g) => {
    const t = TM(teaTowelTex(), { roughness: 0.95, double: true });
    if (o.variant === 'hung') { const y = o.mount ?? 0.8; box(g, 0, y, 0.02, 0.24, 0.01, 0.04, t); pl(g, 0, y - 0.18, 0.045, 0.24, 0.36, t, { rx: 4 }); pl(g, 0, y - 0.1, 0.0, 0.24, 0.2, t, { rx: -4 }); return; }
    flat(g, 0, 0.004, 0, 0.3, 0.2, t, { ry: 20 });
    add(g, gBox(0.18, 0.012, 0.12), t, 0.05, 0.012, 0.03, { ry: -35, rz: 8 });
    add(g, gBox(0.12, 0.01, 0.1), t, -0.06, 0.01, -0.02, { ry: 60, rx: 10 });
  });
  // fallen_chair: a timber kitchen chair lying on its side (Unit 9). opts variant ('timber'|'plastic'), color
  def('fallen_chair', { collide: 'auto' }, (K, o, g) => {
    const p = grp(g, 0.0, 0.215, 0); p.rotation.set(0, 0, R(90));   // on its side: the chair's −X side rests on the floor
    chairBuild(p, o.variant || 'timber', rngOf(K, o, 'fc'), o.color);
  });
  // glasses: folded reading glasses (tabletop / on a pillow)
  function glassesBuild(g, color) {
    const fr = { color: color || '#5a3a2a', roughness: 0.3 };
    for (const s of [-1, 1]) {
      add(g, gTorus(0.024, 0.0025, 4, 16), fr, s * 0.03, 0.012, 0, { rx: 75, s: [1, 0.8, 1] });
      add(g, gCircle(0.023, 14), { color: '#d8e4e8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 }, s * 0.03, 0.012, 0.001, { rx: -15, cast: false });
      box(g, s * 0.02, 0.006, -0.016, 0.1, 0.003, 0.004, fr, { ry: s * 8 });
    }
    box(g, 0, 0.018, 0.0, 0.014, 0.003, 0.004, fr);
  }
  def('glasses', { collide: false }, (K, o, g) => glassesBuild(g, o.color));
  // iv_stand: five-wheel IV pole with hooks and a bag. opts bag (true)
  def('iv_stand', { collide: 0.2 }, (K, o, g) => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; bar(g, [0, 0.06, 0], [Math.cos(a) * 0.28, 0.05, Math.sin(a) * 0.28], 0.025, 0.02, M.chrome); sph(g, Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28, 0.028, M.black, { seg: 6 }); }
    cyl(g, 0, 0.06, 0, 0.014, 1.95, M.chrome, { seg: 8 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; rod(g, [0, 2.0, 0], [Math.cos(a) * 0.12, 2.04, Math.sin(a) * 0.12], 0.005, M.chrome, { seg: 4 }); }
    if (o.bag !== false) { box(g, 0.12, 1.72, 0, 0.1, 0.24, 0.03, { color: '#dfe8ea', roughness: 0.1, transparent: true, opacity: 0.6 }, { cast: false }); tube(g, [[0.12, 1.72, 0], [0.14, 1.4, 0.02], [0.1, 1.0, 0.05], [0.2, 0.7, 0.12]], 0.002, { color: '#e8eef0', roughness: 0.1 }, { key: 'ivline', radial: 3, seg: 12, cast: false }); }
  });
  // wheelchair: hospital wheelchair facing +Z
  def('wheelchair', { collide: 'auto' }, (K, o, g) => {
    const fr = M.chrome, sling = { color: '#1c2a3a', roughness: 0.8 };
    for (const s of [-1, 1]) {
      const x = s * 0.3;
      add(g, gTorus(0.29, 0.018, 6, 24), M.rubber, x, 0.3, -0.05, { ry: 90 });
      add(g, gTorus(0.26, 0.006, 4, 24), fr, x + s * 0.03, 0.3, -0.05, { ry: 90 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; rod(g, [x, 0.3 + Math.cos(a) * 0.27, -0.05 + Math.sin(a) * 0.27], [x, 0.3 - Math.cos(a) * 0.27, -0.05 - Math.sin(a) * 0.27], 0.003, fr, { seg: 3, cast: false }); }
      cylc(g, s * 0.22, 0.06, 0.34, 0.06, 0.03, M.rubber, { rz: 90, seg: 10 });
      rod(g, [s * 0.24, 0.1, 0.34], [s * 0.24, 0.48, 0.28], 0.012, fr, { seg: 6 });
      rod(g, [s * 0.24, 0.48, 0.3], [s * 0.24, 0.48, -0.2], 0.012, fr, { seg: 6 });
      rod(g, [s * 0.24, 0.48, -0.2], [s * 0.24, 0.95, -0.26], 0.012, fr, { seg: 6 });
      rod(g, [s * 0.24, 0.95, -0.26], [s * 0.24, 0.97, -0.38], 0.014, M.black, { seg: 6 });
      rod(g, [s * 0.24, 0.66, 0.2], [s * 0.24, 0.66, -0.15], 0.018, M.black, { seg: 6 });
      box(g, s * 0.1, 0.12, 0.42, 0.14, 0.012, 0.12, M.darkPlastic);
    }
    box(g, 0, 0.46, 0.05, 0.46, 0.02, 0.44, sling);
    box(g, 0, 0.55, -0.23, 0.46, 0.38, 0.02, sling, { rx: -8 });
  });
  // keys_ring: a ring of keys. opts variant 'flat' (lying, tabletop) | 'hook' (hanging on a wall hook with a paper tag,
  // mount 1.5), text (tag, e.g. 'GATE')
  def('keys_ring', { collide: false }, (K, o, g) => {
    const hook = o.variant === 'hook', r = rngOf(K, o, 'keys');
    const p = grp(g, 0, hook ? (o.mount ?? 1.5) : 0.004, hook ? 0.03 : 0);
    if (hook) { box(g, 0, (o.mount ?? 1.5) + 0.02, 0.01, 0.02, 0.03, 0.03, M.chrome); p.rotation.x = R(90); }
    add(p, gTorus(0.022, 0.0025, 4, 16), M.chrome, 0, 0, 0, { rx: 90 });
    const n = 4 + Math.floor(r() * 3), a0 = hook ? Math.PI / 2 : r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.32 + (r() - 0.5) * 0.15, km = { tex: 'metal', color: r() < 0.5 ? '#c9b36a' : '#b9bcbc', metalness: 0.5, roughness: 0.3 };
      const kg = grp(p, Math.cos(a) * 0.022, (i % 2) * 0.002, Math.sin(a) * 0.022, 90 - (a * 180) / Math.PI);
      box(kg, 0, 0, 0.016, 0.024, 0.0025, 0.022, km); box(kg, 0.002, 0, 0.047, 0.008, 0.002, 0.042, km);
      for (let t = 0; t < 3; t++) box(kg, 0.006, 0, 0.035 + t * 0.012, 0.004, 0.002, 0.005, km);
    }
    if (o.text) add(p, gBox(0.05, 0.001, 0.03), TM(labelTex(o.text, 'tag')), -0.045, 0, 0.02, { ry: 30 });
  });
  // extinguisher: old red extinguisher with a service tag. opts variant 'wall' (bracket at 1.0 + FIRE EXTINGUISHER sign)
  // | 'floor', text (tag, 'SERVICED 03/78')
  def('extinguisher', { collide: false }, (K, o, g) => {
    const wall = o.variant !== 'floor', y = wall ? 0.95 : 0, z = wall ? 0.1 : 0;
    const red = { color: '#a3231b', roughness: 0.35 };
    if (wall) { box(g, 0, y + 0.18, 0.02, 0.1, 0.12, 0.04, M.steelDk); K.sign('FIRE\nEXTINGUISHER', 0, 1.9, 0.004, 0.3, 0.2, { style: 'shop', bg: '#a3231b', fg: '#ffffff', border: false }); }
    cyl(g, 0, y, z, 0.075, 0.48, red, { seg: 14 });
    add(g, gSph(0.075, 14, Math.PI / 2), red, 0, y + 0.48, z, {});
    cyl(g, 0, y + 0.52, z, 0.025, 0.07, M.black, { seg: 8 });
    box(g, 0.03, y + 0.6, z, 0.12, 0.012, 0.025, M.black, { rz: -8 });
    box(g, -0.02, y + 0.56, z, 0.08, 0.012, 0.025, M.black);
    add(g, gCircle(0.018, 12), { color: '#ece6d4' }, 0, y + 0.55, z + 0.027, {});
    tube(g, [[-0.03, y + 0.55, z], [-0.1, y + 0.45, z + 0.02], [-0.1, y + 0.2, z + 0.05], [-0.06, y + 0.1, z + 0.07]], 0.009, M.black, { key: 'extinghose' + q3(y), radial: 5, seg: 12 });
    pl(g, 0, y + 0.25, z + 0.076, 0.11, 0.16, TM(labelTex('DRY CHEM\nPOWDER\nTYPE ABE', 'label')), {});
    pl(g, 0.05, y + 0.42, z + 0.08, 0.05, 0.06, TM(labelTex(o.text ?? 'SERVICED\n03/78', 'tag')), { rz: 15 });
  });
  // first_aid_box: opts variant 'wall' (green cabinet with the white cross, mount 1.4) | 'kit' (soft case, tabletop/floor)
  def('first_aid_box', { collide: false }, (K, o, g) => {
    const wall = o.variant !== 'kit', y = wall ? (o.mount ?? 1.4) - 0.15 : 0, z = wall ? 0.06 : 0;
    const gM = { color: '#1f6b3c', roughness: 0.45 }, w = wall ? 0.36 : 0.3, h = wall ? 0.3 : 0.12, d = wall ? 0.12 : 0.2;
    box(g, 0, y, z, w, h, d, gM);
    const face = wall ? [0, y + h / 2, z + d / 2 + 0.001, 0] : [0, h + 0.001, 0, -90];
    for (const [a, b] of [[0.14, 0.045], [0.045, 0.14]]) add(g, gPlane(a, b), { color: '#f1f1ea', roughness: 0.4 }, face[0], face[1], face[2], { rx: face[3], cast: false });
    if (wall) { pl(g, 0, y + h + 0.06, 0.004, 0.3, 0.08, TM(Tex.sign('FIRST AID', { style: 'shop', w: 0.3, h: 0.08, bg: '#1f6b3c', fg: '#ffffff', border: false }))); box(g, w / 2 - 0.03, y + h / 2, z + d / 2, 0.02, 0.06, 0.02, M.chrome); }
    else box(g, 0, h, -0.06, 0.1, 0.02, 0.02, { color: '#d9d6cc' });
  });
  // coffee_cup (tabletop): takeaway cup with a sleeve and lid, a name on the side (opts.text, e.g. 'LUKA')
  const cupTex = (name) => ctex('cup|' + name, 128, 64, (ctx, w, h, r) => { ctx.fillStyle = '#ecebe4'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#8a6a4a'; ctx.fillRect(0, h * 0.35, w, h * 0.35); txt(ctx, 'HILL ST. COFFEE', w * 0.75, h * 0.56, { size: 7, font: F.sans, weight: 'bold', color: '#f0e6d0', align: 'center' }); if (name) hand(ctx, name, w * 0.18, h * 0.3, { size: 12, color: '#141414', font: F.marker }); TU.age(ctx, w, h, r, 0.4); });
  def('coffee_cup', { collide: false }, (K, o, g) => {
    add(g, gCyl(0.03, 0.043, 0.115, 16, 0), TM(cupTex(o.text || ''), { roughness: 0.6, offset: false }), 0, 0.0575, 0, { ry: 180 });
    cyl(g, 0, 0.113, 0, 0.045, 0.012, { color: '#f4f3ef', roughness: 0.3 }, { seg: 16 });
    cyl(g, 0, 0.125, 0, 0.037, 0.008, { color: '#f4f3ef', roughness: 0.3 }, { seg: 16 });
  });
  // energy_can (tabletop)
  const canTex = () => ctex('ecan', 128, 64, (ctx, w, h, r) => { ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#7fe03a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(w * 0.1 + i * 8, h); ctx.lineTo(w * 0.3 + i * 8, 0); ctx.lineTo(w * 0.34 + i * 8, 0); ctx.lineTo(w * 0.14 + i * 8, h); ctx.fill(); } txt(ctx, 'SURGE', w * 0.72, h * 0.62, { size: 16, font: F.heavy, weight: '900', color: '#7fe03a', align: 'center' }); txt(ctx, 'ENERGY', w * 0.72, h * 0.85, { size: 7, font: F.sans, color: '#ddd', align: 'center' }); });
  def('energy_can', { collide: false }, (K, o, g) => {
    add(g, gCyl(0.033, 0.033, 0.13, 16, 0), TM(canTex(), { roughness: 0.3, metalness: 0.5, offset: false }), 0, 0.068, 0, { ry: 180 });
    cyl(g, 0, 0, 0, 0.028, 0.004, M.chrome, { seg: 14 }); cyl(g, 0, 0.133, 0, 0.03, 0.008, M.chrome, { r2: 0.027, seg: 14 });
  });
  // bar_steel: the steel security bar snapped off a demo table. opts variant 'flat' (lying) | 'lean' (against a wall)
  def('bar_steel', { collide: false }, (K, o, g) => {
    const p = grp(g, 0, o.variant === 'lean' ? 0 : 0.015, 0);
    if (o.variant === 'lean') p.rotation.x = R(-15); else p.rotation.z = R(90);
    const st = { tex: 'metal', color: '#6f7676', roughness: 0.45, metalness: 0.7 };
    box(p, 0, 0, 0, 0.03, 0.88, 0.03, st);
    box(p, 0, 0.84, 0.015, 0.05, 0.06, 0.05, st); box(p, 0, 0.88, 0.04, 0.04, 0.012, 0.06, st);
    for (let i = 0; i < 3; i++) box(p, (i - 1) * 0.008, -0.02 - i * 0.008, 0, 0.012, 0.03, 0.03, st, { rz: (i - 1) * 25 });
  });
  // box_cutter (tabletop/floor)
  def('box_cutter', { collide: false }, (K, o, g) => {
    box(g, 0, 0, 0, 0.14, 0.02, 0.028, { color: '#d8b01e', roughness: 0.45 });
    box(g, -0.02, 0.02, 0, 0.08, 0.004, 0.02, M.darkPlastic);
    box(g, 0.085, 0.006, 0, 0.035, 0.006, 0.014, M.chrome);
    box(g, 0.02, 0.022, 0, 0.018, 0.006, 0.012, M.darkPlastic);
  });
  // jumper_tool: a small hooked metal tool with a worn wooden handle
  def('jumper_tool', { collide: false }, (K, o, g) => {
    cylc(g, -0.05, 0.012, 0, 0.012, 0.1, { tex: 'wood', light: '#c8a877', dark: '#8a6a44', roughness: 0.5 }, { rz: 90, seg: 10 });
    cylc(g, 0.005, 0.012, 0, 0.013, 0.012, { tex: 'metal', color: '#b89a52', metalness: 0.7 }, { rz: 90, seg: 10 });
    cylc(g, 0.055, 0.012, 0, 0.003, 0.09, M.steel, { rz: 90, seg: 6 });
    add(g, gTorus(0.008, 0.0028, 4, 10, Math.PI * 1.2), M.steel, 0.1, 0.02, 0, { rz: -90 });
  });
  // handset: a loose telephone handset with a cord stub. opts variant 'desk' | 'payphone' | 'beige'
  def('handset', { collide: false }, (K, o, g) => {
    const v = o.variant || 'desk', col0 = v === 'payphone' ? { tex: 'metal', color: '#1b1d1e', roughness: 0.55 } : v === 'beige' ? { color: '#cfc3a4', roughness: 0.35 } : { color: '#5a5f62', roughness: 0.45 };
    const p = grp(g, 0, 0.03, 0); handsetBuild(p, col0);
    tube(g, [[0, 0.02, -0.11], [0.02, 0.01, -0.18], [0.06, 0.006, -0.24], [0.04, 0.006, -0.32]], v === 'payphone' ? 0.007 : 0.005, v === 'payphone' ? M.steel : TM(coilTex('#3a3e40')), { key: 'hscord' + v, radial: 4, seg: 12, cast: false });
  });

  // filing_cabinet: steel drawer cabinet with label holders; opts n (4), variant 'lateral' (wide, 3 drawers), labels
  // ([…], e.g. 'AIDAN'), open (index ajar). userData.setDrawer(i, 0..1)
  def('filing_cabinet', { collide: true }, (K, o, g) => {
    const lat = o.variant === 'lateral', n = o.n ?? (lat ? 3 : 4), w = lat ? 0.9 : 0.47, d = 0.62, H = lat ? 1.1 : 1.32, r = rngOf(K, o, 'fc2'), dyn = dynamic(o, 'open');
    const body = paint(o.color || '#9aa29a');
    box(g, 0, 0, 0, w, H, d, body);
    const dh = (H - 0.04) / n, drawers = [];
    for (let i = 0; i < n; i++) {
      const y = 0.02 + (n - 1 - i) * dh, dr = grp(g, 0, y, d / 2, 0, 'drawer' + i);
      box(dr, 0, 0.005, 0, w - 0.02, dh - 0.01, 0.02, body);
      box(dr, 0, dh * 0.55, 0.02, 0.16, 0.025, 0.02, M.chrome);
      box(dr, 0, dh * 0.72, 0.012, 0.1, 0.045, 0.004, M.chrome);
      const lab = (o.labels && o.labels[i]) || pick(['A – F', 'G – L', 'M – R', 'S – Z', 'LOGS 1962', 'MISC'], r);
      pl(dr, 0, dh * 0.72 + 0.0225, 0.0145, 0.09, 0.035, TM(labelTex(lab, 'label')), {});
      box(dr, 0, 0.02, -0.28, w - 0.04, dh - 0.05, 0.54, { tex: 'metal', color: '#6a706a' });
      box(dr, 0, 0.03, -0.28, w - 0.08, dh - 0.12, 0.5, { tex: 'paper', color: '#d8d0b0' });
      if (dyn) live(dr);
      drawers.push(dr);
    }
    const setDrawer = (i, v) => { if (drawers[i] && !baked('filing_cabinet', drawers[i])) drawers[i].position.z = d / 2 + clamp(v) * 0.45; };
    if (o.open !== undefined) setDrawer(o.open, 0.5);
    g.userData.setDrawer = setDrawer; g.userData.drawers = drawers;
    if (r() < 0.4) box(g, (r() - 0.5) * 0.1, H, 0, 0.3, 0.1, 0.24, 'cardboard', { ry: 8 });
  });
  // binders_shelf: floor-to-ceiling shelves of dot-matrix binders (records room). opts len (2.4), h (2.4)
  const spineTex = (seed) => ctex('spines|' + seed, 512, 128, (ctx, w, h, r) => {
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, w, h);
    let x = 0; const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let mi = Math.floor(r() * 12), yr = 2019 + Math.floor(r() * 6);
    while (x < w) {
      const bw = 26 + r() * 14, c = pick(['#1f3f6a', '#2a2a2a', '#6a1f1a', '#2f4f3a', '#8a7a5a', '#1f3f6a'], r), hh = h * (0.86 + r() * 0.12);
      ctx.fillStyle = c; ctx.fillRect(x + 1, h - hh, bw - 2, hh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 1, h - hh, 2, hh);
      ctx.fillStyle = '#e8e4d8'; ctx.fillRect(x + 5, h - hh + 12, bw - 10, 40);
      ctx.save(); ctx.translate(x + bw / 2 + 4, h - hh + 50); ctx.rotate(-Math.PI / 2); txt(ctx, `CALL LOGS ${months[mi]} ${yr}`, 0, 0, { size: 8, font: F.mono, weight: 'bold', color: '#222' }); ctx.restore();
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x + bw / 2, h - 18, 5, 0, TAU); ctx.fill();
      mi = (mi + 1) % 12; if (!mi) yr++;
      x += bw;
    }
    TU.age(ctx, w, h, r, 0.5);
  }, { wrap: true, size: 1.2 });
  const fanfoldTex = () => ctex('fanfold', 128, 64, (ctx, w, h) => { ctx.fillStyle = '#eceae0'; ctx.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { ctx.fillStyle = 'rgba(120,180,130,0.35)'; ctx.fillRect(0, y, w, 4); } for (let y = 2; y < h; y += 4) { ctx.fillStyle = 'rgba(40,40,40,0.4)'; ctx.fillRect(12, y, w * 0.6, 1); } ctx.fillStyle = '#c8c4b8'; for (let y = 3; y < h; y += 6) { ctx.beginPath(); ctx.arc(5, y, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(w - 5, y, 1.5, 0, TAU); ctx.fill(); } });
  def('binders_shelf', { collide: true }, (K, o, g) => {
    const len = o.len ?? 2.4, H = o.h ?? 2.4, d = 0.36, r = rngOf(K, o, 'bnd');
    const wood = M.oak;
    box(g, 0, 0, -d / 2 + 0.01, len, H, 0.02, wood);
    for (const s of [-1, 1]) box(g, s * (len / 2 - 0.01), 0, 0, 0.02, H, d, wood);
    const nS = Math.max(3, Math.round(H / 0.4));
    for (let i = 0; i <= nS; i++) {
      const y = (i * (H - 0.03)) / nS;
      box(g, 0, y, 0, len - 0.04, 0.025, d, wood);
      if (i === nS) break;
      const gap = (H - 0.03) / nS - 0.03;
      const seg = r() < 0.2 ? 'fanfold' : 'binders';
      if (seg === 'fanfold') { for (let k = 0; k < 3; k++) box(g, -len / 2 + 0.3 + k * 0.45, y + 0.025, 0.02, 0.38, Math.min(gap, 0.08 + r() * 0.15), 0.28, TM(fanfoldTex()), { ry: (r() - 0.5) * 6, uv: false }); continue; }
      const bl = len - 0.1 - r() * 0.4;
      add(g, gBox(bl, gap * 0.92, 0.28, [1 / 1.2, 1 / (gap * 0.92)]), TM(spineTex(Math.floor(r() * 6)), { roughness: 0.6 }), -len / 2 + 0.03 + bl / 2, y + 0.025 + (gap * 0.92) / 2, 0.02, {});
      box(g, len / 2 - 0.2, y + 0.025, 0.03, 0.05, gap * 0.9, 0.28, { color: '#1f3f6a', roughness: 0.6 }, { rz: -18 });
    }
  });

  // couch: three-seat couch — frame, seat and back cushions, rolled arms, a crocheted throw. opts color (fabric),
  // len (2.0), variant 'floral' (default) | 'vinyl' (waiting-room)
  def('couch', { collide: true }, (K, o, g) => {
    const len = o.len ?? 2.0, d = 0.88, r = rngOf(K, o, 'couch'), vinyl = o.variant === 'vinyl';
    const fab = vinyl ? { color: o.color || '#3a2a22', roughness: 0.35 } : TM(floralTex(o.color || '#7a5a4a'), { roughness: 0.95 });
    box(g, 0, 0.1, 0, len, 0.32, d, fab, { uv: 2 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, x * (len / 2 - 0.06), 0, z * (d / 2 - 0.06), 0.05, 0.1, 0.05, M.oak);
    const n = 3, cw = (len - 0.36) / n;
    for (let i = 0; i < n; i++) { const x = -len / 2 + 0.18 + cw * (i + 0.5); box(g, x, 0.42, 0.06, cw - 0.02, 0.14, d - 0.2, fab, { uv: 2 }); add(g, gBox(cw - 0.04, 0.5, 0.2, 2), fab, x, 0.72, -d / 2 + 0.16, { rx: -12 }); }
    box(g, 0, 0.42, -d / 2 + 0.07, len, 0.55, 0.14, fab, { uv: 2 });
    for (const s of [-1, 1]) { box(g, s * (len / 2 - 0.09), 0.1, 0, 0.18, 0.5, d, fab, { uv: 2 }); cylc(g, s * (len / 2 - 0.09), 0.62, 0, 0.1, d, fab, { rx: 90, seg: 10 }); }
    if (!vinyl) { const knit = { tex: 'fabric_knit', color: pick(['#b8a070', '#8a4a5a', '#6a7a5a'], r), roughness: 0.97 }; box(g, len / 2 - 0.1, 0.72, 0.0, 0.26, 0.02, 0.7, knit, { uv: 5 }); box(g, len / 2 + 0.02, 0.35, 0.0, 0.02, 0.4, 0.7, knit, { uv: 5 }); box(g, -len * 0.25, 0.49, -0.12, 0.36, 0.14, 0.3, knit, { ry: 20, rx: -30, uv: 5 }); }
  });
  // bed: opts size 'single' | 'double' (default), color (doona)
  def('bed', { collide: true }, (K, o, g) => {
    const dbl = o.size !== 'single', w = dbl ? 1.4 : 0.95, L = 2.0, r = rngOf(K, o, 'bed');
    box(g, 0, 0.1, 0, w, 0.25, L, M.oak);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, x * (w / 2 - 0.04), 0, z * (L / 2 - 0.04), 0.06, 0.1, 0.06, M.oak);
    box(g, 0, 0.35, 0, w - 0.04, 0.2, L - 0.04, { color: '#e8e6de', roughness: 0.9 });
    box(g, 0, 0, -L / 2 - 0.02, w + 0.06, 1.05, 0.05, M.oak);
    box(g, 0, 0.53, 0.2, w + 0.06, 0.06, L - 0.44, TM(quiltTex(o.color || pick(['#7a8aa0', '#a07a7a', '#8a9a7a'], r)), { roughness: 0.95 }), { uv: 1 / 0.6 });
    for (const s of [-1, 1]) box(g, s * (w / 2 + 0.03), 0.3, 0.2, 0.02, 0.28, L - 0.44, TM(quiltTex(o.color || '#7a8aa0')), { uv: 1 / 0.6 });
    const pw = dbl ? 0.6 : 0.7;
    for (let i = 0; i < (dbl ? 2 : 1); i++) add(g, gBox(pw, 0.12, 0.38, 0), { color: '#ecebe4', roughness: 0.9 }, dbl ? (i - 0.5) * 0.66 : 0, 0.6, -L / 2 + 0.28, { rx: -8 });
  });
  // hospital_bed: adjustable bed with rails, wheels, raised head, blanket turned back. opts phone (a phone on the pillow,
  // lit), glasses (reading glasses folded on the pillow), empty (true: blanket turned back), chart (true)
  def('hospital_bed', { collide: true }, (K, o, g) => {
    const w = 0.95, L = 2.1, fr = { tex: 'metal', color: '#d8dad6', roughness: 0.4 };
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { cylc(g, x * (w / 2 - 0.08), 0.07, z * (L / 2 - 0.12), 0.07, 0.04, M.rubber, { rz: 90, seg: 10 }); rod(g, [x * (w / 2 - 0.08), 0.12, z * (L / 2 - 0.12)], [x * (w / 2 - 0.08), 0.42, z * (L / 2 - 0.12)], 0.022, fr, { seg: 6 }); }
    box(g, 0, 0.42, 0, w, 0.08, L, fr);
    box(g, 0, 0.5, 0.25, w - 0.06, 0.14, L - 0.6, { color: '#e8ecea', roughness: 0.8 });
    const hp = grp(g, 0, 0.55, -L / 2 + 0.55); hp.rotation.x = R(35);
    boxc(hp, 0, 0.0, -0.3, w - 0.06, 0.14, 0.62, { color: '#e8ecea', roughness: 0.8 });
    add(hp, gBox(0.62, 0.12, 0.34, 0), { color: '#f2f2ee', roughness: 0.9 }, 0, 0.12, -0.38, { rx: 0 });
    box(g, 0, 0.42, -L / 2 - 0.02, w + 0.02, 0.62, 0.05, { color: '#c9cfd2', roughness: 0.5 });
    box(g, 0, 0.42, L / 2 + 0.02, w + 0.02, 0.45, 0.05, { color: '#c9cfd2', roughness: 0.5 });
    for (const s of [-1, 1]) { const up = s < 0; const ry = up ? 0.72 : 0.38; box(g, s * (w / 2 + 0.03), ry, -0.2, 0.03, 0.03, 1.1, fr); box(g, s * (w / 2 + 0.03), ry - 0.2, -0.2, 0.03, 0.03, 1.1, fr); for (const z of [-0.7, 0.3]) box(g, s * (w / 2 + 0.03), ry - 0.2, z, 0.025, 0.22, 0.025, fr); }
    const blanket = { tex: 'fabric_knit', color: '#9ab0c0', roughness: 0.95 };
    if (o.empty !== false) { box(g, 0, 0.64, 0.55, w - 0.02, 0.04, 0.9, blanket, { uv: 3 }); box(g, 0, 0.66, 0.06, w - 0.02, 0.07, 0.14, blanket, { uv: 3 }); }
    else box(g, 0, 0.64, 0.2, w - 0.02, 0.1, 1.6, blanket, { uv: 3 });
    // things on the pillow sit in the tilted head section's frame (pillow top at local y 0.18, z −0.38)
    if (o.phone) { const pg = grp(hp, 0.06, 0.185, -0.36, 12); box(pg, 0, 0, 0, 0.075, 0.008, 0.155, { color: '#16191a', roughness: 0.3 }); flat(pg, 0, 0.0085, 0, 0.066, 0.142, TM(lockTex('8:59'), { emissive: 0.9 }), {}); }
    if (o.glasses) glassesBuild(grp(hp, -0.1, 0.18, -0.34, 20), o.glassesColor);
    if (o.chart !== false) { box(g, 0.2, 0.62, L / 2 + 0.05, 0.22, 0.3, 0.012, { color: '#6a6e70', roughness: 0.5 }); pl(g, 0.2, 0.76, L / 2 + 0.057, 0.2, 0.26, TM(noticeTex('PATIENT CHART\nWard 3 · Rm 12\nNIL BY MOUTH')), {}); }
  });
  // dresser: bedroom dresser with drawers, a tilting mirror, a doily, the framed photo (opts.photo 'nan' default), a
  // jewellery box and a perfume bottle
  def('dresser', { collide: true }, (K, o, g) => {
    const w = 1.2, d = 0.46, H = 0.8, r = rngOf(K, o, 'dr');
    box(g, 0, 0.06, 0, w, H - 0.06, d, M.oak);
    box(g, 0, 0, 0.0, w - 0.06, 0.06, d - 0.06, M.oak);
    for (let row = 0; row < 3; row++) for (let c = 0; c < 2; c++) { const x = (c - 0.5) * (w / 2), y = 0.1 + row * 0.23; box(g, x, y, d / 2, w / 2 - 0.04, 0.2, 0.015, M.oak); cyl(g, x, y + 0.1, d / 2 + 0.01, 0.012, 0.02, { tex: 'metal', color: '#b89a52', metalness: 0.7 }, { rx: 90, seg: 8 }); }
    for (const s of [-1, 1]) box(g, s * 0.45, H, -d / 2 + 0.06, 0.04, 0.55, 0.04, M.oak);
    const mp = grp(g, 0, H + 0.45, -d / 2 + 0.06); mp.rotation.x = R(-6);
    boxc(mp, 0, 0, 0, 0.84, 0.6, 0.03, M.oak); add(mp, gPlane(0.78, 0.54), { color: '#9aa8ac', roughness: 0.05, metalness: 0.9 }, 0, 0, 0.016, { cast: false });
    add(g, gCircle(0.2, 16), { color: '#ece6d4', roughness: 0.9 }, -0.2, H + 0.002, 0.02, { rx: -90, cast: false });
    K.prop('framed_photo', -0.22, 0.02, 12, { y: H, collide: false, variant: 'stand', subject: o.photo ?? 'nan' });
    box(g, 0.25, H, 0.0, 0.18, 0.08, 0.12, { color: '#6a2a3a', roughness: 0.5 });
    cyl(g, 0.45, H, 0.05, 0.025, 0.09, { color: '#d8c8e8', roughness: 0.05, transparent: true, opacity: 0.6 }, { seg: 10 });
    box(g, 0.05, H, 0.1, 0.22, 0.02, 0.05, { color: '#8a6a4a' }, { ry: r() * 30 });
  });
  // bedside_table: small timber table with a drawer; opts lamp (bedside lamp, lit), items (true: glass, tissues)
  def('bedside_table', { collide: 'auto' }, (K, o, g) => {
    const H = 0.6;
    box(g, 0, 0.05, 0, 0.45, H - 0.05, 0.4, M.oak);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, x * 0.2, 0, z * 0.17, 0.04, 0.05, 0.04, M.oak);
    box(g, 0, H - 0.17, 0.2, 0.4, 0.13, 0.012, M.oak); cyl(g, 0, H - 0.1, 0.21, 0.012, 0.02, { tex: 'metal', color: '#b89a52', metalness: 0.7 }, { rx: 90, seg: 8 });
    if (o.lamp) {
      cyl(g, -0.1, H, -0.06, 0.07, 0.02, { color: '#d8cfb8', roughness: 0.4 }, { seg: 14 }); cyl(g, -0.1, H + 0.02, -0.06, 0.015, 0.22, M.chrome, { seg: 8 });
      const lit = o.lit !== false, sm = lit ? { color: '#f0dcb0', emissive: '#ffcf8a', emissiveIntensity: 0.9, roughness: 0.9, outage: false, side: 'double' } : { color: '#e8dcc0', roughness: 0.9, side: 'double' };
      cyl(g, -0.1, H + 0.2, -0.06, 0.12, 0.16, sm, { r2: 0.08, seg: 14, open: true });
      if (lit && o.light !== false) K.light('lamp', -0.1, H + 0.25, -0.06, { intensity: 2, distance: 4, bank: o.bank });
    }
    if (o.items !== false) { cyl(g, 0.12, H, 0.08, 0.035, 0.1, { color: '#e8eef0', roughness: 0.05, transparent: true, opacity: 0.4 }, { seg: 10, cast: false }); box(g, 0.1, H, -0.1, 0.12, 0.08, 0.1, { color: '#b8d0e0', roughness: 0.6 }); }
  });
  // phone_table: narrow hall table with a doily, the phone (opts.phone 'rotary' default | 'desk' | false), the answering
  // machine (opts.machine, default true; count), a notepad and pen, a phone book
  def('phone_table', { collide: 'auto' }, (K, o, g) => {
    const w = 0.9, d = 0.34, H = 0.78;
    box(g, 0, H - 0.03, 0, w, 0.03, d, M.oak);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, x * (w / 2 - 0.04), 0, z * (d / 2 - 0.04), 0.035, H - 0.03, 0.035, M.oak, { rz: x * 2 });
    box(g, 0, 0.2, 0, w - 0.1, 0.02, d - 0.06, M.oak);
    box(g, 0.1, 0.22, 0.0, 0.28, 0.05, 0.22, { color: '#d8b928', roughness: 0.7 });
    add(g, gCircle(0.14, 16), { color: '#ece6d4', roughness: 0.9 }, -0.18, H + 0.001, 0, { rx: -90, cast: false });
    const ph = o.phone ?? 'rotary';
    if (ph) K.prop(ph === 'desk' ? 'desk_phone' : 'rotary_phone', -0.2, 0, 10, { y: H, collide: false });
    let machine = null;
    if (o.machine !== false) machine = K.prop('answering_machine', 0.16, -0.02, -8, { y: H, collide: false, count: o.count ?? 1 });
    flat(g, 0.34, H + 0.003, 0.06, 0.1, 0.14, { tex: 'paper', color: '#ece6d0' }, { ry: 8 });
    rod(g, [0.3, H + 0.008, 0.1], [0.4, H + 0.008, 0.02], 0.004, { color: '#1f3f8a' }, { seg: 5 });
    if (machine) { g.userData.setCount = machine.userData.setCount; g.userData.setBlink = machine.userData.setBlink; }
  });

  // --- offices --------------------------------------------------------------------------------------------------------
  // cubicle: call-centre cubicle opening to +Z — fabric partitions (1.3 m) on three sides, desk along the back, monitor,
  // desk phone, headset on a hook, name card, sticky notes, family photo, task chair. opts w (1.8), d (1.6), name,
  // chair (true), lamp (desk lamp, lit — Chase's), ringing (phone LED), content (monitor), color (partitions)
  def('cubicle', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.8, d = o.d ?? 1.6, H = 1.3, r = rngOf(K, o, 'cub');
    const fab = TM(partitionTex(o.color || '#5e6a72'), { roughness: 0.95 }), cap = { tex: 'metal', color: '#9aa0a0', roughness: 0.45 };
    const zb = -d / 2;
    box(g, 0, 0, zb, w, H, 0.06, fab, { uv: 2 });
    for (const s of [-1, 1]) box(g, s * (w / 2 - 0.03), 0, 0, 0.06, H, d, fab, { uv: 2 });
    box(g, 0, H, zb, w + 0.02, 0.02, 0.07, cap);
    for (const s of [-1, 1]) box(g, s * (w / 2 - 0.03), H, 0, 0.07, 0.02, d + 0.02, cap);
    box(g, 0, 0.72, zb + 0.39, w - 0.12, 0.028, 0.7, M.laminate);
    box(g, w / 2 - 0.32, 0, zb + 0.35, 0.4, 0.69, 0.55, M.lamGrey);
    g.userData.monitor = K.prop('monitor', -0.1, zb + 0.2, (r() - 0.5) * 10, { y: 0.748, collide: false, content: o.content || 'off', live: !!o.screen });
    box(g, -0.1, 0.748, zb + 0.5, 0.42, 0.02, 0.14, M.darkPlastic);
    const phone = K.prop('desk_phone', 0.4, zb + 0.35, -15, { y: 0.748, collide: false, ringing: o.ringing });
    K.prop('headset', 0.62, zb + 0.035, 0, { collide: false, variant: 'hook', mount: 1.05 });
    pl(g, 0, H - 0.1, zb + 0.032, 0.2, 0.07, TM(labelTex(o.name ?? pick(['PRIYA', 'JOSH', 'MEL', 'SAM', 'DEV', 'KIM', 'TOM', 'RUBY'], r), 'label')), {});
    for (let i = 0; i < 3; i++) pl(g, -w / 2 + 0.3 + i * 0.12 + r() * 0.05, 0.95 + r() * 0.2, zb + 0.032, 0.076, 0.076, TM(noteTex(pick(['ESCALATE?', 'cb 2pm', 'AHT!!', 'breathe', 'be nice'], r), 'sticky')), { rz: (r() - 0.5) * 10 });
    if (r() < 0.5) pl(g, w / 2 - 0.35, 1.0, zb + 0.032, 0.15, 0.2, TM(photoTex('family')), { rz: (r() - 0.5) * 6 });
    if (r() < 0.35) K.prop('drawing', -w / 2 + 0.35, zb + 0.035, 0, { variant: 'wall', mount: 1.02, collide: false });
    if (r() < 0.5) K.prop('mug', 0.15, zb + 0.55, r() * 360, { y: 0.748, collide: false });
    if (o.lamp) K.prop('desk_lamp', -w / 2 + 0.35, zb + 0.25, 30, { y: 0.748, collide: false, lit: o.lit !== false, light: o.light });
    if (o.chair !== false) K.prop('office_chair', (r() - 0.5) * 0.3, zb + 0.95 + r() * 0.15, 180 + (r() - 0.5) * 50, { collide: false });
    g.userData.phone = phone;
    col(K, o, -w / 2, zb - 0.03, w / 2, zb + 0.74, H); col(K, o, -w / 2, zb, -w / 2 + 0.06, d / 2, H); col(K, o, w / 2 - 0.06, zb, w / 2, d / 2, H);
  });
  // pod_desk: raised team-leader pod — a carpeted platform (0.3 m), an L-shaped standing-height desk with two monitors,
  // a desk phone, a team sign on a pole (opts.team 'TEAM 3'), drawers. opts ringing (the pod phone rings)
  def('pod_desk', { collide: false }, (K, o, g) => {
    const s = 2.6, r = rngOf(K, o, 'pod');
    box(g, 0, 0, 0, s, 0.3, s, { tex: 'carpet', color: '#6a7078' }, { uv: 1 });
    box(g, 0, 0.29, 0, s + 0.04, 0.02, s + 0.04, M.alu);
    const top = 0.3 + 1.02;
    box(g, 0, 0.3, -s / 2 + 0.45, s - 0.3, 1.0, 0.1, M.lamGrey);
    box(g, 0, top - 0.02, -s / 2 + 0.45, s - 0.2, 0.03, 0.7, M.laminate);
    box(g, s / 2 - 0.45, 0.3, 0.1, 0.1, 1.0, 1.3, M.lamGrey);
    box(g, s / 2 - 0.45, top - 0.02, 0.1, 0.7, 0.03, 1.4, M.laminate);
    box(g, -s / 2 + 0.6, 0.3, -s / 2 + 0.4, 0.45, 0.7, 0.55, M.lamGrey);
    for (let k = 0; k < 3; k++) box(g, -s / 2 + 0.6, 0.35 + k * 0.22, -s / 2 + 0.68, 0.42, 0.2, 0.012, M.lamGrey);
    K.prop('monitor', -0.35, -s / 2 + 0.3, 0, { y: top, collide: false, content: 'desktop', live: !!o.screen });
    K.prop('monitor', 0.35, -s / 2 + 0.3, -8, { y: top, collide: false, live: !!o.screen });
    const phone = K.prop('desk_phone', s / 2 - 0.5, 0.2, -80, { y: top, collide: false, ringing: o.ringing });
    cyl(g, s / 2 - 0.2, 0.3, -s / 2 + 0.2, 0.03, 2.3, M.alu, { seg: 8 });
    K.sign(o.team ?? 'TEAM 3', s / 2 - 0.2, 2.45, -s / 2 + 0.22, 0.6, 0.25, { style: 'office', double: true });
    for (let i = 0; i < 4; i++) flat(g, -0.6 + r() * 1.0, top + 0.002 + i * 0.001, -s / 2 + 0.6, 0.21, 0.297, 'paper', { ry: r() * 40 - 20 });
    K.prop('coffee_cup', 0.2, -s / 2 + 0.65, 0, { y: top, collide: false });
    K.prop('office_chair', 0, -0.2, 180, { collide: false, y: 0.3 });
    g.userData.phone = phone;
    col(K, o, -s / 2, -s / 2, s / 2, s / 2, 1.35);
  });
  // meeting_table: boardroom table with chairs around and a conference phone. opts len (3.0), chairs (6)
  def('meeting_table', { collide: false }, (K, o, g) => {
    const len = o.len ?? 3.0, d = 1.2, H = 0.74, r = rngOf(K, o, 'mt');
    box(g, 0, H - 0.04, 0, len, 0.04, d, M.veneer);
    for (const s of [-1, 1]) box(g, s * (len / 2 - 0.4), 0, 0, 0.1, H - 0.04, d - 0.4, M.steelDk);
    add(g, gCyl(0.14, 0.1, 0.05, 3), M.darkPlastic, 0, H + 0.025, 0, {});
    for (let i = 0; i < 4; i++) cyl(g, -len / 3 + i * (len / 4.5), H, 0.3 * (i % 2 ? 1 : -1), 0.035, 0.1, { color: '#e8eef0', roughness: 0.05, transparent: true, opacity: 0.4 }, { seg: 10, cast: false });
    const n = o.chairs ?? 6, per = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) { const side = i < per ? 1 : -1, k = i % per, x = -len / 2 + (len / per) * (k + 0.5); K.prop('office_chair', x + (r() - 0.5) * 0.1, side * (d / 2 + 0.35), side > 0 ? 180 : 0, { collide: false, turn: (r() - 0.5) * 30 }); }
    col(K, o, -len / 2, -d / 2, len / 2, d / 2, H);
  });
  // projector_screen: pull-down screen with a frozen slide + ceiling projector. opts text ('Q3: WHAT DOES WINNING LOOK
  // LIKE?'), w (2.0), ceil (2.8); userData.screen / setOn
  def('projector_screen', { collide: false }, (K, o, g) => {
    const w = o.w ?? 2.0, h = w * 0.66, ceil = o.ceil ?? 2.8, top = ceil - 0.15;
    cylc(g, 0, ceil - 0.08, 0.06, 0.06, w + 0.2, M.white, { rz: 90, seg: 10 });
    box(g, 0, top - h - 0.04, 0.06, w + 0.02, 0.03, 0.03, M.black);
    const sm = add(g, gPlane(w, h), MAT({ color: '#dcdad2', roughness: 0.9 }), 0, top - h / 2, 0.08, { cast: false });
    const text = o.text ?? 'Q3: WHAT DOES\nWINNING LOOK LIKE?';
    const paint = (c, W, H) => { c.fillStyle = '#e9ecee'; c.fillRect(0, 0, W, H); c.fillStyle = BR.teal; c.fillRect(0, 0, W, H * 0.12); Tex.drawWordmark(c, W * 0.04, H * 0.09, H * 0.07, { color: BR.yellow }); const lines = text.split('\n'); const s = fit(c, lines, W * 0.84, H * 0.5, (q) => `900 ${q}px ${F.heavy}`, H * 0.14); lines.forEach((l, i) => txt(c, l, W / 2, H * 0.42 + i * s * 1.15, { size: s, font: F.heavy, weight: '900', color: '#1a2a2a', align: 'center' })); c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(W * 0.2, H * 0.78, W * 0.6, 2); txt(c, 'Regional Sales Kick-off · Level 4', W / 2, H * 0.88, { size: H * 0.04, font: F.sans, color: '#445', align: 'center' }); };
    lazyScreen(K, g.userData, sm, [384, 256], paint, o.lit !== false, 0.8, { color: '#dcdad2', roughness: 0.9 });
    box(g, 0, ceil - 0.12, 3.0, 0.32, 0.1, 0.26, M.white);
    rod(g, [0, ceil, 3.0], [0, ceil - 0.08, 3.0], 0.02, M.greyPlastic, { seg: 6 });
    if (o.lit !== false) { add(g, gCircle(0.03, 12), glowS('#e8f0f4', 2), 0, ceil - 0.07, 2.869, { ry: 180 }); Render.halo([0, ceil - 0.07, 2.85], { parent: g, color: '#e8f0f4', size: 0.4, opacity: 0.5 }); }
  });

  // --- small dressing extras --------------------------------------------------------------------------------------------
  // sticky_note: a single sticky note. opts text, variant 'flat' (on a desk; tabletop) | 'wall' (mount 1.4), color ('sticky')
  def('sticky_note', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'sn'), m = TM(noteTex(o.text ?? '', o.color || 'sticky', o.ink || '#1f2c6e'));
    if (o.variant === 'wall') pl(g, 0, o.mount ?? 1.4, 0.002, 0.076, 0.076, m, { rz: (r() - 0.5) * 8 });
    else flat(g, 0, 0.002, 0, 0.076, 0.076, m, { ry: (r() - 0.5) * 30 });
  });
  // roster (wall): a printed roster pinned up. opts cross (a name whose last three shifts are struck through with
  // "call him?" beside each, e.g. 'AIDAN'), title, mount (1.5)
  def('roster', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.5;
    pl(g, 0, y, 0.003, 0.42, 0.3, TM(rosterTex(o.title ?? 'ROSTER — WEEK 14', o.cross ?? null)), { rz: 1 });
    for (const s of [-1, 1]) sph(g, s * 0.18, y + 0.13, 0.008, 0.008, { color: '#b3261e' }, { seg: 6 });
  });
  // visitor_book (tabletop): an open visitor book with ruled, handwritten entries and a pen on a chain. opts lines
  // (entries, newest last)
  const visitorTex = (lines) => ctex('visitor|' + lines.join('|'), 384, 256, (ctx, w, h, r) => {
    ctx.fillStyle = '#efe9d6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(w / 2 - 2, 0, 4, h);
    for (const px of [0, w / 2]) { txt(ctx, 'DATE     NAME     VISITING', px + 12, 18, { size: 10, font: F.sans, weight: 'bold', color: '#555' }); for (let y = 30; y < h; y += 22) { ctx.fillStyle = 'rgba(80,110,160,0.35)'; ctx.fillRect(px + 8, y, w / 2 - 16, 1); } }
    lines.forEach((l, i) => { const col0 = i < 10 ? 0 : 1, row = i % 10; hand(ctx, l, col0 * (w / 2) + 12, 26 + row * 22 + 16, { size: 13, color: pick(['#1f2c6e', '#141414', '#2a4a8a'], r), maxWidth: w / 2 - 20 }); });
    TU.age(ctx, w, h, r, 0.5);
  });
  def('visitor_book', { collide: false }, (K, o, g) => {
    const lines = o.lines || ['03/01  Marg B.  Unit 4', '17/02  Council — garden', '11/03  Deb  Unit 2', '02/05  Pharmacy delivery'];
    flat(g, 0, 0.012, 0, 0.44, 0.3, TM(visitorTex(lines)), {});
    box(g, 0, 0, 0, 0.46, 0.012, 0.31, { color: '#2a3a5a', roughness: 0.6 });
    rod(g, [0.26, 0.015, 0.05], [0.36, 0.015, -0.05], 0.004, M.black, { seg: 5 });
    tube(g, [[0.36, 0.015, -0.05], [0.4, 0.01, -0.1], [0.38, 0.004, -0.2], [0.3, 0.004, -0.18]], 0.0015, M.chrome, { key: 'vbchain', radial: 3, seg: 10, cast: false });
  });
  // key_lockbox (wall, 1.2 m): grey key safe with four combination wheels. opts code ('0000'); userData.setCode(str)
  def('key_lockbox', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.2;
    box(g, 0, y - 0.07, 0.03, 0.09, 0.14, 0.06, paint('#6a7072', 0.5));
    box(g, 0, y + 0.0, 0.061, 0.07, 0.02, 0.004, M.black);
    const disp = pl(g, 0, y + 0.01, 0.0635, 0.064, 0.018, TM(dispTex(o.code ?? '0000', 'lcd', 96, 28), { roughness: 0.4 }), { live: true });
    box(g, 0, y - 0.1, 0.06, 0.05, 0.02, 0.01, M.chrome);
    g.userData.setCode = (c) => { disp.material = MAT(TM(dispTex(String(c), 'lcd', 96, 28), { roughness: 0.4 })); };
  });
  // exit_sign (wall/ceiling, mount 2.3): lit green EXIT box sign. opts lit (true), text ('EXIT')
  def('exit_sign', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 2.3, lit = o.lit !== false;
    box(g, 0, y - 0.1, 0.03, 0.36, 0.2, 0.06, M.white);
    pl(g, 0, y, 0.0605, 0.32, 0.15, TM(Tex.sign(o.text ?? 'EXIT', { style: 'shop', w: 0.32, h: 0.15, bg: '#1f7a3a', fg: '#ffffff', border: false, clean: true }), lit ? { emissive: 1.1 } : {}), {});
    if (lit) Render.halo([0, y, 0.12], { parent: g, color: '#5aff8a', size: 0.7, opacity: 0.35 });
  });
  // rf_sign: "DANGER — RF RADIATION" warning sign. opts variant 'post' (on its own post) | 'fence' (mount 1.5), text
  def('rf_sign', { collide: false }, (K, o, g) => {
    const post = o.variant === 'post', y = post ? 1.7 : (o.mount ?? 1.5);
    if (post) cyl(g, 0, 0, -0.03, 0.03, 2.0, M.galv, { seg: 8 });
    K.sign(o.text ?? 'DANGER\nRF RADIATION\nKEEP OUT', 0, y, 0, 0.5, 0.5, { style: 'warning' });
  });
  // trolley: shopping trolley (abandoned in car parks)
  def('trolley', { collide: 'auto' }, (K, o, g) => {
    const wire = { tex: 'chainlink', color: '#c8ccca' };
    box(g, 0, 0.45, 0.05, 0.52, 0.5, 0.85, wire, { cast: false, uv: 2 });
    box(g, 0, 0.45, 0.05, 0.53, 0.02, 0.86, M.chrome);
    for (const [x, z] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.35], [0.22, 0.35]]) { cyl(g, x, 0.05, z, 0.01, 0.4, M.chrome, { seg: 6 }); cylc(g, x, 0.05, z, 0.05, 0.03, M.black, { rz: 90, seg: 10 }); }
    cylc(g, 0, 1.0, -0.42, 0.018, 0.54, { color: '#b3261e', roughness: 0.4 }, { rz: 90, seg: 8 });
    for (const s of [-1, 1]) rod(g, [s * 0.25, 0.95, -0.36], [s * 0.26, 1.0, -0.42], 0.012, M.chrome, { seg: 6 });
    box(g, 0, 0.12, 0.0, 0.46, 0.012, 0.6, wire, { cast: false, uv: 2 });
  });
  // rubbish: street litter — a chip packet, a crushed can, a paper cup, a sheet of newspaper, butts
  def('rubbish', { collide: false }, (K, o, g) => {
    const r = rngOf(K, o, 'rub');
    add(g, gIco(0.06, 0), { color: pick(['#c0392b', '#f1c40f', '#2e86c1'], r), roughness: 0.3, metalness: 0.3 }, (r() - 0.5) * 0.4, 0.02, (r() - 0.5) * 0.4, { s: [1.3, 0.35, 0.9], ry: r() * 180 });
    cylc(g, (r() - 0.5) * 0.5, 0.03, (r() - 0.5) * 0.5, 0.033, 0.09, TM(canTex(), { roughness: 0.4, metalness: 0.4 }), { rz: 90, ry: r() * 180, s: [1, 0.7, 1], seg: 10 });
    cylc(g, (r() - 0.5) * 0.5, 0.04, (r() - 0.5) * 0.5, 0.03, 0.1, TM(cupTex(''), { roughness: 0.6 }), { rz: 90, ry: r() * 180, r2: 0.04, seg: 10 });
    flat(g, (r() - 0.5) * 0.3, 0.004, (r() - 0.5) * 0.3, 0.4, 0.3, TM(newspaperTex('COUNCIL VOWS\nBETTER COVERAGE', 'Friday, 12 June 2026')), { ry: r() * 360, rx: -86 });
    for (let i = 0; i < 4; i++) cylc(g, (r() - 0.5) * 0.6, 0.006, (r() - 0.5) * 0.6, 0.004, 0.025, { color: '#d8c8a0' }, { rz: 90, ry: r() * 180, seg: 5, cast: false });
  });
  // leaf_pile: a drift of dry gum leaves. opts radius (0.6)
  def('leaf_pile', { collide: false }, (K, o, g) => {
    const rr = o.radius ?? 0.6, r = rngOf(K, o, 'lp');
    add(g, gSph(rr, 12, Math.PI / 2), { tex: 'leaves', opaque: true }, 0, 0, 0, { s: [1, 0.25, 0.8 + r() * 0.3], cast: false });
    for (let i = 0; i < 3; i++) { const a = r() * TAU, d = rr * (0.9 + r() * 0.5); add(g, gSph(rr * 0.35, 8, Math.PI / 2), { tex: 'leaves', opaque: true }, Math.cos(a) * d, 0, Math.sin(a) * d, { s: [1, 0.25, 1], cast: false }); }
    flat(g, 0, 0.004, 0, rr * 3.2, rr * 3.2, { tex: 'leaves' }, { ry: r() * 90 });
  });
  // water_stain: a water-stain decal. opts surface 'wall' (at mount 2.2, default) | 'ceiling' (at ceil 3.0) | 'floor',
  // w (1.0), h (0.8), rust (tint)
  const stainTex = (seed, rust) => ctex(`stain|${seed}|${rust ? 1 : 0}`, 256, 256, (ctx, w, h, r) => {
    ctx.clearRect(0, 0, w, h);
    TU.waterStain(ctx, w, h, r, w / 2, h * 0.4, w * 0.3, 2.2, rust ? [120, 80, 40] : [110, 92, 60]);
    TU.waterStain(ctx, w, h, r, w * (0.3 + r() * 0.4), h * 0.55, w * 0.18, 1.6, rust ? [120, 80, 40] : [110, 92, 60]);
    for (let k = 0; k < 6; k++) { const x = w * (0.3 + r() * 0.4), y = h * 0.5; const g2 = ctx.createLinearGradient(0, y, 0, h); g2.addColorStop(0, 'rgba(90,70,40,0.35)'); g2.addColorStop(1, 'rgba(90,70,40,0)'); ctx.fillStyle = g2; ctx.fillRect(x, y, 2 + r() * 3, h * (0.2 + r() * 0.3)); }
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const edge = Math.min(i / 4 % w, w - (i / 4 % w), Math.floor(i / 4 / w), h - Math.floor(i / 4 / w)); if (edge < 12) d[i + 3] *= edge / 12; }
    ctx.putImageData(img, 0, 0);
  });
  def('water_stain', { collide: false }, (K, o, g) => {
    const w = o.w ?? 1.0, h = o.h ?? 0.8, r = rngOf(K, o, 'ws'), m = TM(stainTex(Math.floor(r() * 4), !!o.rust), { transparent: true, roughness: 1, alphaTest: 0.02 });
    const s = o.surface || 'wall';
    if (s === 'ceiling') add(g, gPlane(w, h), m, 0, (o.ceil ?? 3.0) - 0.004, 0, { rx: 90, rz: r() * 360, cast: false });
    else if (s === 'floor') flat(g, 0, 0.004, 0, w, h, m, { ry: r() * 360 });
    else pl(g, 0, o.mount ?? 2.2, 0.004, w, h, m, {});
  });
  // feedback_board: "You said, we did" board with every card blank. opts title, mount (1.5)
  def('feedback_board', { collide: false }, (K, o, g) => {
    const y = o.mount ?? 1.5, w = 1.2, h = 0.9, r = rngOf(K, o, 'fb');
    box(g, 0, y - h / 2, 0.015, w, h, 0.03, { color: '#2f7a9a', roughness: 0.6 });
    pl(g, 0, y + h / 2 - 0.09, 0.0305, w - 0.1, 0.12, TM(Tex.sign(o.title ?? 'YOU SAID, WE DID', { style: 'shop', w: w - 0.1, h: 0.12, bg: '#2f7a9a', fg: '#ffffff', border: false, clean: true })), {});
    for (let i = 0; i < 8; i++) { const x = -w / 2 + 0.17 + (i % 4) * 0.29, yy = y + 0.08 - Math.floor(i / 4) * 0.33; pl(g, x, yy, 0.031, 0.2, 0.25, { color: '#f4f2ea', roughness: 0.9 }, { rz: (r() - 0.5) * 4 }); sph(g, x, yy + 0.11, 0.035, 0.007, { color: pick(['#b3261e', '#f1c40f', '#27ae60'], r) }, { seg: 6 }); }
  });
  // photo_wall: "Care Champion of the Month" — a header plaque over a grid of framed photos, every face faded to white.
  // opts n (8), title, subject ('blank')
  def('photo_wall', { collide: false }, (K, o, g) => {
    const n = o.n ?? 8, cols = Math.min(4, n);
    pl(g, 0, 2.05, 0.004, 1.3, 0.18, TM(Tex.sign(o.title ?? 'CARE CHAMPION OF THE MONTH', { style: 'plaque', w: 1.3, h: 0.18 })), {});
    for (let i = 0; i < n; i++) {
      const x = -((cols - 1) * 0.36) / 2 + (i % cols) * 0.36, y = 1.62 - Math.floor(i / cols) * 0.46;
      K.prop('framed_photo', x, 0, 0, { collide: false, subject: o.subject ?? 'blank', mount: y, w: 0.28, h: 0.36, text: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][i % 12] });
    }
  });

  // =================================================================================================================
  // Idle warm-up: generate the prop library's shared Canvas2D textures (and the Tex variants it asks for) in small
  // slices a few seconds after load (title screen / LOADING), so a room's first build does not pay for them.
  // One texture per slice; each is a few ms (the 512² wood variants ~40–60 ms, done first while nothing is playing).
  // =================================================================================================================
  const WARM = [
    ...[M.pine, M.oak, M.timberGrey, M.slat, M.veneer, SWB.wood].map((w) => () => Tex.get('wood', { light: w.light, dark: w.dark })),
    () => Tex.get('metal_rust', { paint: '#2e4a36' }), () => Tex.get('metal_rust', { paint: '#3e4b4e' }), () => Tex.get('leaves', { opaque: true }),
    foliageTex, barkTex, palingTex, () => corrugTex('#8a8f8a'), () => corrugTex('#b9bcb4'), () => corrugTex('#c9c4b2'), () => corrugTex('#7d8580'),
    () => partitionTex(), jackTex, keyshelfTex, blockTex, ...[0, 1, 2, 3, 4, 5].map((i) => () => spineTex(i)), () => lockTex('8:59'), () => lockTex('--:--'),
    payFaceTex, deskKeysTex, dialTex, () => coilTex(), () => coilTex('#3a3e40'), () => coilTex('#b9ad8e'), slatTex, corkTex, lockerTex,
    () => carPanelTex('sedan'), () => carPanelTex('hatch'), () => carPanelTex('wagon'), beadGlassTex, modemBoxTex, tabletBoxTex, vendTex, productTex, magsTex,
    fanfoldTex, paperEdgeTex, dropTex, () => floralTex(), () => quiltTex(), () => markerTex(''), drumFaceTex, contractPageTex, ammeterTex, teaTowelTex,
    crosswordTex, canTex, () => cupTex(''), () => routeMapTex('44', 'SIGNAL HILL'), () => busFlagTex('44', 'SIGNAL HILL'), () => rosterTex(),
    ...[0, 1, 2, 3].map((i) => () => flyerTex(i)), ...['#8a7a62', '#6c5a4a', '#8c8a7c', '#5e6a64', '#8a6a5a'].map((c) => () => curtainTex(c)),
    () => photoTex('family'), () => photoTex('blank'), () => photoTex('landscape'), () => stickerTex('No junk mail. No salespeople.'),
    // signs/posters/notices the defaults use (same option objects as the builders → same cache keys)
    ...Object.values(SHOP).filter((P) => P.name && P.name !== 'optus').flatMap((P) => [5, 5.5, 6, 6.5].map((sw) => () => kitSign(P.name, sw, 0.36, { style: P.style || 'shop', bg: P.bg, fg: P.fg }))),
    () => Tex.sign('CLOSED', { style: 'shop', w: 0.26, h: 0.11, bg: '#8a1f1a', fg: '#f4efe4', border: false }), () => noticeTex('TRADING HOURS\nMon–Fri 9–5\nSat 9–12\nSun CLOSED'),
    () => labelTex('MONITORED\n24 / 7', 'red'), () => noticeTex(SHOP.bank.notice), () => newspaperTex(SHOP.newsagent.newspaper[0], SHOP.newsagent.newspaper[1]),
    () => Tex.poster(SHOP.pharmacy.poster, { kind: 'alarm', seed: 12 }), () => Tex.poster('HOME LOANS\nMADE SIMPLE', { kind: 'notice', seed: 9 }),
    () => Tex.poster(null, { kind: 'faded', seed: 44 }), () => Tex.poster(null, { kind: 'faded', seed: 3 }), () => Tex.poster('STAY CONNECTED', { kind: 'plan', seed: 7 }),
    () => Tex.sign('BUS STOP  ·  ROUTE 44', { style: 'street', w: 1.4, h: 0.13, bg: '#1f3f5c' }), () => Tex.sign('In memory of the girls on the boards, 1961–1987', { style: 'plaque', w: 0.34, h: 0.075 }),
    () => kitSign('SIGNAL HILL   2\nPOP. 1,900', 1.7, 0.8, { style: 'street', bg: '#1f5c3c', border: '#e8ece8' }), () => kitSign('MOBILE COVERAGE ENDS', 1.7 * 0.72, 0.42, { style: 'council' }),
    () => kitSign('DANGER\nRF RADIATION\nKEEP OUT', 0.5, 0.5, { style: 'warning' }), () => kitSign('DANGER\nHIGH VOLTAGE\nKEEP OUT', 0.5, 0.42, { style: 'warning' }),
    () => Tex.sign('ESCALATOR\nCLOSED', { style: 'shop', w: 0.36, h: 0.16, bg: '#8a1f1a', fg: '#f4efe4', border: false }), () => Tex.wordmark({ w: 0.6, h: 0.22, bg: null }),
  ];
  // Tex.sign with the exact option object K.sign builds (so warmed textures hit the same cache key)
  const kitSign = (text, w, h, o = {}) => Tex.sign(text, { style: o.style || 'shop', w, h, bg: o.bg, fg: o.fg, font: o.font, size: o.size, border: o.border, header: o.header, age: o.age, clean: o.clean, seed: o.seed });
  let warmI = 0;
  const warmStep = () => {
    const t0 = performance.now();
    while (warmI < WARM.length && performance.now() - t0 < 8) { try { WARM[warmI](); } catch (e) { console.error('[props] warm-up', e); } warmI++; }
    if (warmI < WARM.length) setTimeout(warmStep, 25);
  };
  if (typeof window !== 'undefined' && typeof setTimeout === 'function') setTimeout(warmStep, 2500);

  // @@PARTS@@
})();
