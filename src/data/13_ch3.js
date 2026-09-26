// ==== data/13_ch3.js — Chapter 3 "The Exchange" (spec §9 Chapter 3, §7A Exchange Road, §7B Signal Hill Trunk Exchange,
// §6 the Restructure / the Borrowed / the Unread, §2A riddle row "Ch 3 fuses", §13 Operator's Log + Exchange Plaque +
// Wai's Email, §8 Luka's call 3) — tag C3_ ====
// Rooms (CONTENT_PLAN §2, local metres, −z north):
//   c3_exchangerd  Exchange Road: 112 × 8 m climbing west from the village back gate (x 112, y 0) to the exchange
//                  (x 0, y 8). Six weatherboard operator cottages (four north, two south), one letterbox "M. — Operator",
//                  the Reach at a cottage fence, the lower branch toward Relay Street ending at a drop ("I can't go that
//                  way."), the payphone booth at the top.  gate → c2_crescent:backgate · top → c3_forecourt:road.
//   c3_forecourt   The 1961 brick facade, the brass plaque by the glass doors, the hum, the staff car park, a Tethered,
//                  CALL luka3.  road → c3_exchangerd:top · doors → c3_foyer:doors.
//   c3_foyer       10 × 8 m: the Fire Evacuation Plan (map_exchange), the dusty reception desk, the 1961 staff photo.
//   c3_hall        The Operators' Hall, 40 × 14 m: five 30.6 m rows of cord switchboards (two back-to-back suites and a
//                  wall row) either side of the centre aisle, Wai's lit board at the west end (Operator's Log 6 taped
//                  beneath, sticker05 under it), the circuit lamp panel, the frame-hall doors (maglock on HALL), the wall
//                  payphone, Tethered ×2 in the side aisles. CUTSCENE 3-1 on the first entry; Wai's talk cycle.
//   c3_records     Filing cabinets and binders: the drawer of Operator's Logs 1–3, the drawer labelled AIDAN (acct4).
//   c3_canteen     The break table, the fire extinguisher, coffee, the noticeboard (Operator's Log 4), sticker06.
//   c3_stairs      One flight down to the basement landing (fuse room east, cable vault west); the Borrowed "Wai".
//   c3_fuse        The 1961 fuse board (GAMEPLAY 3-4, riddle variants), Wai's taped note.
//   c3_vault       20 × 10 m under a low ceiling of cable trays: the Unread, Operator's Log 5.
//   c3_frame       The Main Distribution Frame hall, 20 × 14 m: the Restructure (boss), the receipt map; through its
//                  east doorway a slice of the Operators' Hall (Wai's board) for 3-3.  hall ↔ c3_hall:frame · side door
//                  (after the boss) ↔ c3_yard:frame.
//   c3_yard        The rear yard: cable drums, the yard gate (open after the boss) → G.startChapter(4) / c4_wirelane.
// Cutscenes: 3-1 "The Last Operator", 3-2 "Impacted", 3-3 "Keep the Line Open" / 3-3alt. In-engine: 3-3b (the Borrowed
//   on the stairs, driven by the engine's borrowed type), the fuse board (a board-side view: pick a switch, throw it),
//   the overload blackout, the acct4 line, Luka's call 3. Boss 'restructure' (enemy type c3_restructure).
// State: S.done['c3:circ'] (the switched-on circuits, '|'-joined; BASEMENT at first), S.flags c3_metWai, c3_fused,
//   c3_mastFeed, c3_borrowedMet, c3_bossDone (CONTENT_PLAN), waiSaved / waiLost. S.done c3:* keys.
{
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const flag = (n) => !!(S.flags && S.flags[n]);
  const done = (k) => !!(S.done && S.done[k]);
  const lvl = () => (S.difficulty && S.difficulty.riddle) || 'normal';
  const pickDoc = (b) => (typeof DOC_pick === 'function' ? DOC_pick(b) : b);
  // an actor move / gesture started without await: keep its rejection (Script.ABORT on a skip or room change) handled
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const FN = Tex.fonts;
  // transient presentation state (never saved; what must survive lives in S)
  const C3 = { boss: null, fuseUI: false, amb: 0, stairsBeat: false };

  // ---------------------------------------------------------------------------------------------------------------
  // The exchange's six circuits (spec §9 3-4). S.done['c3:circ'] lists the switched-on ones; BASEMENT runs at first.
  // ---------------------------------------------------------------------------------------------------------------
  const CIRC = ['HALL', 'FRAME', 'RECORDS', 'BASEMENT', 'CANTEEN', 'MAST FEED'];
  const AMPS = { HALL: 4, FRAME: 6, RECORDS: 2, BASEMENT: 3, CANTEEN: 1, 'MAST FEED': 8 };
  const WATTS = { HALL: '960 W', FRAME: '1,440 W', RECORDS: '480 W', BASEMENT: '720 W', CANTEEN: '240 W', 'MAST FEED': '1,920 W' };
  const circList = () => { const v = S.done && S.done['c3:circ']; return v === undefined || v === null ? ['BASEMENT'] : String(v).split('|').filter(Boolean); };
  const circOn = (n) => circList().includes(n);
  const setCirc = (list) => { S.done['c3:circ'] = CIRC.filter((c) => list.includes(c)).join('|'); };
  const loadOf = (list) => list.reduce((s, c) => s + (AMPS[c] || 0), 0);

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function C3_tex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d', { willReadFrequently: true }), w, h, U.rng(U.hash('c3:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c3:' + key;
    TEXC.set(key, t);
    return t;
  }
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    if (o.spacing) { let cx = o.align === 'center' ? x - (ctx.measureText(s).width + o.spacing * (s.length - 1)) / 2 : x; ctx.textAlign = 'left'; for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + o.spacing; } }
    else ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  const hand = (ctx, s, x, y, o = {}) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };

  // the raised steel letters over the entrance (transparent background)
  const nameTex = () => C3_tex('name', 1024, 128, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    const s = 'SIGNAL HILL TRUNK EXCHANGE';
    x.font = `bold 76px ${FN.serif}`; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillText(s, w / 2 + 4, h / 2 + 5);
    const g = x.createLinearGradient(0, 20, 0, 108); g.addColorStop(0, '#b9bdb6'); g.addColorStop(0.5, '#8d918a'); g.addColorStop(1, '#5e625c');
    x.fillStyle = g; x.fillText(s, w / 2, h / 2);
    // rust runs under a few letters, one letter gone
    for (let i = 0; i < 9; i++) { const cx = 60 + r() * (w - 120); const rg = x.createLinearGradient(0, h / 2, 0, h); rg.addColorStop(0, 'rgba(120,60,30,0.55)'); rg.addColorStop(1, 'rgba(120,60,30,0)'); x.fillStyle = rg; x.fillRect(cx, h / 2 + 10, 3 + r() * 5, h / 2 - 10); }
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fillRect(w * 0.585, 18, 44, 92); x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(80,80,74,0.8)'; x.lineWidth = 2; for (const k of [0, 1]) { x.beginPath(); x.arc(w * 0.585 + 10 + k * 22, h / 2, 2.5, 0, Math.PI * 2); x.stroke(); }
  });
  // a steel-framed window seen from outside at night: dark panes, a faint reflection, one cracked pane
  const winTex = (seed) => C3_tex('win' + seed, 128, 256, (x, w, h, r) => {
    x.fillStyle = '#3a3e3c'; x.fillRect(0, 0, w, h);
    const cols = 2, rows = 4, pw = (w - 12) / cols, ph = (h - 12) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px = 6 + i * pw + 2, py = 6 + j * ph + 2;
      const g = x.createLinearGradient(px, py, px + pw, py + ph); g.addColorStop(0, '#1d2524'); g.addColorStop(0.6, '#0e1413'); g.addColorStop(1, '#232b2a');
      x.fillStyle = g; x.fillRect(px, py, pw - 4, ph - 4);
      x.fillStyle = `rgba(160,180,176,${0.05 + r() * 0.07})`; x.beginPath(); x.moveTo(px, py + ph * 0.8); x.lineTo(px + pw * 0.5, py); x.lineTo(px + pw * 0.7, py); x.lineTo(px + pw * 0.1, py + ph - 4); x.fill();
    }
    if (seed % 3 === 1) { x.strokeStyle = 'rgba(200,210,205,0.5)'; x.lineWidth = 1; const cx = 6 + pw * 0.5, cy = 6 + ph * 1.5; for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 40); x.stroke(); } }
    if (seed % 4 === 2) { x.fillStyle = '#2a2016'; x.fillRect(6 + pw + 2, 6 + ph * 2 + 2, pw - 4, ph - 4); }       // a pane boarded up
    age(x, w, h, r, 0.6);
  });
  // the brass plaque (the text is the Exchange Plaque document)
  const plaqueTex = () => C3_tex('plaque', 512, 360, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#9a7f45'); g.addColorStop(0.5, '#c8a860'); g.addColorStop(1, '#7c6232');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#5a4520'; x.lineWidth = 8; x.strokeRect(12, 12, w - 24, h - 24);
    x.strokeStyle = 'rgba(255,240,200,0.35)'; x.lineWidth = 2; x.strokeRect(22, 22, w - 44, h - 44);
    const ink = '#3a2a10';
    tx(x, 'SIGNAL HILL', w / 2, 74, 34, ink, { font: FN.serif, weight: 'bold', align: 'center', spacing: 4 });
    tx(x, 'TRUNK EXCHANGE', w / 2, 114, 34, ink, { font: FN.serif, weight: 'bold', align: 'center', spacing: 4 });
    tx(x, 'Opened 14 August 1961', w / 2, 168, 24, ink, { font: FN.serif, align: 'center' });
    tx(x, '"Connecting the district to the world"', w / 2, 222, 21, ink, { font: FN.serif, align: 'center' });
    tx(x, 'Dedicated to the operators', w / 2, 272, 21, ink, { font: FN.serif, align: 'center' });
    tx(x, 'who keep us talking.', w / 2, 300, 21, ink, { font: FN.serif, align: 'center' });
    for (const [a, b] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) { x.fillStyle = '#5a4520'; x.beginPath(); x.arc(a, b, 7, 0, Math.PI * 2); x.fill(); }
    // verdigris and polish rubbed through where people touched the date
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(70,120,100,${r() * 0.18})`; x.beginPath(); x.arc(r() * w, r() * h, 3 + r() * 16, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = 'rgba(255,240,200,0.18)'; x.beginPath(); x.ellipse(w / 2, 162, 120, 20, 0, 0, Math.PI * 2); x.fill();
  });
  // small enamel / stencil signs
  const signTex = (key, lines, o = {}) => C3_tex('sign|' + key, o.w || 256, o.h || 128, (x, w, h, r) => {
    x.fillStyle = o.bg || '#e8e4d6'; x.fillRect(0, 0, w, h);
    if (o.border !== false) { x.strokeStyle = o.fg || '#1d1d1d'; x.lineWidth = o.lw || 5; x.strokeRect(6, 6, w - 12, h - 12); }
    const n = lines.length, lh = (h - 20) / n;
    lines.forEach((l, i) => tx(x, l, w / 2, 12 + lh * (i + 0.72), (Array.isArray(o.size) ? o.size[i] : o.size) || Math.min(lh * 0.62, 40), o.fg || '#1d1d1d', { font: o.font || FN.sans, weight: o.weight ?? 'bold', align: 'center', spacing: o.spacing }));
    age(x, w, h, r, o.age ?? 1.0, { sun: o.sun ?? 0.4 });
  });
  // a handwritten card / note (blue biro or pencil) on paper
  const noteTex = (key, text, o = {}) => C3_tex('note|' + key, o.w || 256, o.h || 256, (x, w, h, r) => {
    x.fillStyle = o.bg || '#ece8dc'; x.fillRect(0, 0, w, h);
    if (o.lines) { x.strokeStyle = 'rgba(80,110,170,0.3)'; x.lineWidth = 1; for (let y = 44; y < h; y += 24) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } }
    hand(x, text, o.x ?? 16, o.y ?? 50, { size: o.size || 22, color: o.ink || '#1b2a7a', wobble: 1.6, seed: U.hash(key) % 97, maxWidth: w - 30, lineHeight: (o.size || 22) * 1.35 });
    age(x, w, h, r, o.age ?? 0.6);
  });
  // a chalk tick (Easy: HALL and FRAME ticked on the fuse board)
  const chalkTickTex = () => C3_tex('chalktick', 128, 128, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(236,234,222,0.92)'; x.lineCap = 'round'; x.lineWidth = 11;
    for (let k = 0; k < 3; k++) { x.globalAlpha = 0.55 + r() * 0.3; x.beginPath(); x.moveTo(18 + r() * 4, 70 + r() * 4); x.lineTo(50 + r() * 4, 104 + r() * 3); x.lineTo(112 + r() * 4, 20 + r() * 4); x.stroke(); }
    x.globalAlpha = 1;
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Small geometry helpers
  // ---------------------------------------------------------------------------------------------------------------
  // a quad in room coordinates, corners (x0,z0) (x0,z1) (x1,z1) (x1,z0) at heights from yf(x, z): sloped ground
  function C3_ground(K, x0, z0, x1, z1, yf, mat, o = {}) {
    const P = (x, z) => [x, yf(x, z), z];
    const a = P(x0, z0), b = P(x0, z1), c = P(x1, z1), d = P(x1, z0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    const s = o.uv ?? (typeof mat === 'string' ? 1 / Tex.size(mat) : 0.3);
    g.setAttribute('uv', new THREE.Float32BufferAttribute([a[0] * s, -a[2] * s, b[0] * s, -b[2] * s, c[0] * s, -c[2] * s, d[0] * s, -d[2] * s], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, K.mat(mat)); m.receiveShadow = true; m.castShadow = false;
    m.userData.ownedGeo = true;
    K.mesh(m, { static: true, world: o.world });
    return m;
  }
  // a sagging wire / cable between points (tube)
  function C3_wire(K, a, b, sag = 0.4, r = 0.012, color = '#1b1c1c', o = {}) {
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(lerp(a[0], b[0], t), lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, lerp(a[2], b[2], t))); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 4, false), K.mat({ color, roughness: 0.7 }));
    m.castShadow = false; m.userData.ownedGeo = true;
    K.mesh(m, { static: o.static !== false, world: o.world, name: o.name });
    return m;
  }
  // a vertical run of timber battens (slats with gaps) from a to b ([x, z]), bottom heights yb0 → yb1, tops yt0 → yt1
  const C3_battenMat = (() => { let m = null; return () => m || (m = (() => {
    const t = C3_tex('battens', 32, 16, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#6a5a48'; x.fillRect(2, 0, 20, h); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(18, 0, 4, h); }, { wrap: true });
    const mm = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: '#9a8a74' });
    mm.userData.shared = true;
    return mm;
  })()); })();
  function C3_battens(K, a, b, yb0, yb1, yt0, yt1) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = L / 0.13;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], yb0, a[1], b[0], yb1, b[1], b[0], yt1, b[1], a[0], yt0, a[1]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, C3_battenMat()); m.castShadow = false; m.receiveShadow = true;
    m.userData.ownedGeo = true;
    K.mesh(m, { static: true });
    return m;
  }
  // colliders along a slope: split into short pieces, each with its own base height (colliders are 2D + y/h)
  function C3_slopeCol(K, x0, z0, x1, z1, yf, h = 2.4, o = {}) {
    const n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 5));
    for (let i = 0; i < n; i++) {
      const a = lerp(x0, x1, i / n), b = lerp(x0, x1, (i + 1) / n), ya = yf(a), yb = yf(b), lo = Math.min(ya, yb);
      const rec = { y: lo - 0.4, h: h + Math.abs(ya - yb) + 0.4, ...o };
      if (o.msg) K.blocker(Math.min(a, b), z0, Math.max(a, b), z1, o.msg, rec); else K.collider(Math.min(a, b), z0, Math.max(a, b), z1, rec);
    }
  }
  // a phone note in Aidan's voice (one entry per id)
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  const noteDone = (id) => { try { Phone.done && Phone.done(id); } catch (e) { /* no phone */ } };
  // interiors: a faint grey-teal ambient in the Fog world, a sick teal one in the Outage (follows the dissolve)
  const C3_AMB = { c0: new THREE.Color(), c1: new THREE.Color(), last: -1 };
  function C3_ambient(fog, out) {
    const k = clamp(Tex.outage || 0, 0, 1);
    const key = Math.round(k * 50) + fog[1] * 1000 + out[1] * 100000;
    if (key === C3_AMB.last) return;
    C3_AMB.last = key;
    C3_AMB.c0.set(fog[0]).lerp(C3_AMB.c1.set(out[0]), k);
    try { Render.setAmbient(C3_AMB.c0.getStyle(), U.lerp(fog[1], out[1], k)); } catch (e) { /* render */ }
  }
  function C3_ambientOff() { C3_AMB.last = -1; try { Render.setAmbient(null); } catch (e) { /* render */ } }

  // =================================================================================================================
  // 3A EXCHANGE ROAD — x 0 (the top, west, y 8) … 112 (the village back gate, east, y 0). Carriageway z 1.8…6.2, kerbs,
  // footpaths z 0.24…1.64 (north) and 6.36…7.76 (south); picket fences at z 0.1 / 7.9 bound the street. Cottages north
  // at x 96, 70, 47, 24 (M. — Operator is 47), south at x 100, 56 (the Reach waits at 56's fence). The lower branch
  // leaves south at x 74…80 and ends at a drop (z 20). The payphone booth at the top (x 7).
  // =================================================================================================================
  const ER = { L: 112, Y: 8.0, cotN: [96, 70, 47, 24], cotS: [100, 56], opX: 47, br: [74.2, 79.8], brEnd: 20.2 };
  const erY = (x) => ER.Y * (1 - clamp(x / ER.L, 0, 1));
  const erF = (x) => erY(x) + 0.15;
  const ER_TILT = Math.atan2(ER.Y, ER.L);
  // a picket/paling fence along x at z following the slope; side 'n' faces the road with its good side (+Z)
  function C3_fenceX(K, x0, x1, z, side, o = {}) {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 3.6));
    for (let i = 0; i < n; i++) {
      const a = lerp(x0, x1, i / n), b = lerp(x0, x1, (i + 1) / n), cx = (a + b) / 2, len = Math.abs(b - a) + 0.05;
      const rot = side === 'n' ? 0 : 180;
      const f = K.prop('fence', cx, z, rot, { variant: o.variant || 'picket', len, y: (o.yf || erF)(cx) - 0.03, collide: false, color: o.color, seed: o.seed ? o.seed + i : undefined });
      if (f) { f.rotation.order = 'YXZ'; f.rotation.set(0, rot * D2R, (side === 'n' ? -1 : 1) * ER_TILT); }
    }
  }
  defineRoom({
    id: 'c3_exchangerd', name: 'EXCHANGE ROAD', area: 'EXCHANGE ROAD', chapter: 3, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 }, far: 62,                         // (past ~50 m the fog is total: don't draw the rest of the street)
    surfaces: [{ box: [0, 0, 112, 1.66], s: 'concrete' }, { box: [0, 6.34, 112, 8], s: 'concrete' }],
    bounds: [-1, 0, 113, 21],
    entries: { gate: [108.6, 4.0, -90], top: [2.4, 4.0, 90], start: [108.6, 4.0, -90] },
    cameras: [
      // the village back gate: Aidan comes through toward the lens, the road climbing into the fog behind the camera
      { id: 'c3_exchangerd:gate', vol: [101.5, 0, 113, 8], type: 'static', pos: [96.2, erY(96) + 3.3, 6.9], target: [109.5, erY(109) + 0.4, 3.4], fov: 'fit' },
      // the lower cottages from the gate end, looking up the hill
      { id: 'c3_exchangerd:lower', vol: [86, 0, 101.5, 8], type: 'pan', pos: [105.4, erY(105) + 3.0, 7.3], target: [92, erY(92) + 0.8, 3.6], fov: 46, pan: { lag: 0.35, yaw: 34, pitch: 18 } },
      // the junction, from over the lower branch: the north cottage (70) across the road
      { id: 'c3_exchangerd:junction', vol: [68.5, 0, 86, 8], type: 'pan', pos: [77, erY(77) + 3.2, 13.2], target: [77, erY(77) + 0.6, 3.2], fov: 50, pan: { lag: 0.3, yaw: 48, pitch: 20 } },
      // down the branch to the drop, from inside the north cottage's yard (the road just stops in the white)
      { id: 'c3_exchangerd:branch', vol: [73.8, 7.85, 80.2, 21], pri: 1, type: 'pan', pos: [77, erY(77) + 4.4, -2.6], target: [77, erY(77) - 1.2, 16], fov: 44, pan: { lag: 0.35, yaw: 20, pitch: 22 } },
      // the Reach at 56's fence, revealed ahead in the fog as he climbs past the junction
      { id: 'c3_exchangerd:reach', vol: [51, 0, 68.5, 8], type: 'pan', pos: [73.5, erY(73.5) + 2.6, 0.9], target: [58, erY(58) + 1.0, 5.6], fov: 44, pan: { lag: 0.35, yaw: 30, pitch: 18 } },
      // M. — Operator: from uphill, low on the south footpath, the letterbox in the foreground as he comes up to it
      { id: 'c3_exchangerd:operator', vol: [33, 0, 51, 8], type: 'pan', pos: [29, erY(29) + 2.3, 7.4], target: [45, erY(45) + 0.9, 2.2], fov: 46, pan: { lag: 0.3, yaw: 36, pitch: 20 } },
      { id: 'c3_exchangerd:upper', vol: [12.5, 0, 33, 8], type: 'pan', pos: [37, erY(37) + 3.1, 7.3], target: [22, erY(22) + 0.8, 3.4], fov: 46, pan: { lag: 0.35, yaw: 34, pitch: 18 } },
      // the top: the payphone and the exchange's dark bulk looming out of the fog beyond
      { id: 'c3_exchangerd:top', vol: [-1, 0, 12.5, 8], type: 'static', pos: [16.6, erY(16.6) + 2.5, 5.9], target: [2, erY(2) + 1.6, 3.2], fov: 'fit' },
    ],
    spawns: [
      // the Reach, standing at a cottage fence (56, south side), facing the house — its back to the road
      { id: 'c3_exchangerd:reach', type: 'reach', pos: [56.2, 7.25], rot: 0 },
    ],
    build(K) {
      // ---- the road, kerbs and footpaths (a 7 % climb west) --------------------------------------------------------
      K.road(0, 1.8, 112, 6.2, { axis: 'x', markings: 'center', footpath: 1.4, slope: { y0: ER.Y, y1: 0 } });
      // the lower branch toward Relay Street: a narrow service road dropping south into the fog, then nothing
      K.road(ER.br[0], 7.76, ER.br[1], ER.brEnd, { axis: 'z', markings: 'none', kerb: false, footpath: 0, slope: { y0: erF(77), y1: erF(77) - 1.45 } });
      K.drop(ER.br[0] - 0.4, ER.brEnd, ER.br[1] + 0.4, 24.5, { side: 'n', msg: "I can't go that way." });
      // ---- the ground either side: yards on terraces north, the hillside falling away south --------------------------
      C3_ground(K, -2, -22, 114, 0.24, (x) => erF(x) - 0.006, 'grass');
      C3_ground(K, -2, 7.76, ER.br[0] - 0.05, 30, (x, z) => erF(x) - 0.006 - Math.max(0, z - 12) * 0.5, 'grass');
      C3_ground(K, ER.br[1] + 0.05, 7.76, 114, 30, (x, z) => erF(x) - 0.006 - Math.max(0, z - 12) * 0.5, 'grass');
      // ---- fences (the street's edges): north picket (gates at each cottage), south picket with the branch gap -------
      const gateGaps = (xs) => xs.map((x) => [x - 0.55, x + 0.55]);
      const run = (x0, x1, z, side, gaps, o) => {
        let a = x0;
        for (const [g0, g1] of gaps.filter(([g0]) => g0 > x0 && g0 < x1).sort((p, q2) => p[0] - q2[0])) { if (g0 - a > 0.3) C3_fenceX(K, a, g0, z, side, o); a = g1; }
        if (x1 - a > 0.3) C3_fenceX(K, a, x1, z, side, o);
      };
      run(0.5, 111, 0.1, 'n', gateGaps(ER.cotN.map((x) => x - 1.9)), { variant: 'picket', color: '#d9d4c4' });
      run(0.5, ER.br[0], 7.9, 's', gateGaps([ER.cotS[1] + 1.9]), { variant: 'picket', color: '#cfc8b4' });
      run(ER.br[1], 111, 7.9, 's', gateGaps([ER.cotS[0] + 1.9]), { variant: 'picket', color: '#cfc8b4' });
      // the gates themselves stand shut (low timber gates) — the yards aren't the way
      for (const x of ER.cotN.map((v) => v - 1.9)) { const g = K.prop('fence', x, 0.08, 0, { variant: 'picket', len: 1.05, y: erF(x) - 0.03, collide: false, color: '#e2ddcc' }); if (g) { g.rotation.order = 'YXZ'; g.rotation.set(0, 6 * D2R, -ER_TILT); } }
      for (const x of ER.cotS.map((v) => v + 1.9)) { const g = K.prop('fence', x, 7.92, 180, { variant: 'picket', len: 1.05, y: erF(x) - 0.03, collide: false, color: '#e2ddcc' }); if (g) { g.rotation.order = 'YXZ'; g.rotation.set(0, 174 * D2R, ER_TILT); } }
      C3_slopeCol(K, 0, -0.1, 111.2, 0.16, erF, 1.4);
      C3_slopeCol(K, 0, 7.84, ER.br[0], 8.1, erF, 1.4);
      C3_slopeCol(K, ER.br[1], 7.84, 111.2, 8.1, erF, 1.4);
      // the branch's sides: old paling fences down to the drop
      for (const [fx, rot] of [[ER.br[0] - 0.12, 90], [ER.br[1] + 0.12, -90]]) {
        const tilt = Math.atan2(1.45, ER.brEnd - 7.76);
        for (let z = 7.9; z < ER.brEnd - 0.2; z += 3.1) {
          const zc = Math.min(z + 1.55, ER.brEnd - 1.55), y = erF(77) - (zc - 7.76) / (ER.brEnd - 7.76) * 1.45;
          const f = K.prop('fence', fx, zc, rot, { variant: 'paling', len: 3.12, y: y - 0.05, collide: false, seed: 31 + Math.round(z) });
          if (f) { f.rotation.order = 'YXZ'; f.rotation.set(0, rot * D2R, (rot > 0 ? 1 : -1) * tilt); }
        }
        K.collider(fx - 0.12, 7.8, fx + 0.12, ER.brEnd, { y: erF(77) - 2.2, h: 4.2 });
      }
      // the ends of the street: the village back gate (east) and the exchange's forecourt (west)
      K.blocker(111.2, -0.4, 113, 8.4, null, { y: -1, h: 4 });
      K.exit({ id: 'c3_exchangerd:gate', box: [110.4, 0.2, 111.3, 7.8], to: 'c2_crescent', entry: 'backgate', when: () => !!ROOMS.c2_crescent, blockedMsg: "I don't want to go back in there.", mapMark: false });
      K.exit({ id: 'c3_exchangerd:top', box: [-1, 0.2, 0.25, 7.8], to: 'c3_forecourt', entry: 'road' });

      // ---- the village back gate (east end): iron gate leaves standing open onto the lane ----------------------------
      for (const [hx, dir] of [[110.9, 1], [110.9, -1]]) {
        const g = new THREE.Group();
        const iron = K.mat({ tex: 'metal', color: '#3b3f3c', roughness: 0.7 });
        const bar = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), iron); m.position.set(x, y, z); m.userData.ownedGeo = true; g.add(m); };
        for (let i = 0; i < 9; i++) bar(0, 0.65, dir * (0.2 + i * 0.36), 0.035, 1.3, 0.035);
        bar(0, 0.12, dir * 1.65, 0.05, 0.05, 3.2); bar(0, 1.26, dir * 1.65, 0.05, 0.05, 3.2);
        g.position.set(hx + 0.25, erF(111), 4.0 + dir * 3.5); g.rotation.y = dir * 80 * D2R;
        K.mesh(g, { static: true });
      }
      for (const z of [0.3, 7.7]) K.box(111.1, erF(111), z, 0.35, 1.6, 0.35, 'brick', { collide: true, h: 1.6 });
      K.sign('HILLTOP VILLAGE\nRESIDENTS ONLY', 111.3, erF(111) + 1.35, 0.6, 0.9, 0.34, { rotY: -90, style: 'council' });
      K.examine(109.8, erF(110) + 1.2, 4.0, ['The village\'s back gate. [beat] Hilltop Village is back through there.', 'I\'m not going back in there.'], { id: 'c3er:gate', r: 1.6 });

      // ---- the cottages: four north (facing the road, south), two south (facing north) -------------------------------
      const palette = ['#c9c2a8', '#b8c4be', '#cdb9a5', '#bfc6cc', '#d8cfb4', '#c7bba0'];
      ER.cotN.forEach((x, i) => {
        const y = erF(x) + 0.08;
        K.prop('cottage', x, -8.35, 0, { y, color: palette[i], number: [11, 9, 7, 5][i], lit: x === ER.opX, seed: 300 + i });
        K.prop('letterbox', x - 1.9 + 0.95, -0.35, 0, { y, variant: 'post', label: x === ER.opX ? 'M. — Operator' : undefined, color: x === ER.opX ? '#2f4f3a' : undefined, seed: 40 + i });
        K.prop('bin', x - 3.6, -0.55, 8, { y, variant: 'wheelie', color: i % 2 ? '#2f5a3a' : '#7a2a22' });
      });
      ER.cotS.forEach((x, i) => {
        const y = erF(x) + 0.08;
        K.prop('cottage', x, 16.35, 180, { y, color: palette[4 + i], number: [8, 6][i], seed: 320 + i });
        for (const dx of [-3.3, -1.1, 1.1, 3.3]) for (const z of [13.0, 16.35, 19.7]) {
          const gy = erF(x + dx) - 0.006 - Math.max(0, z - 12) * 0.5;
          K.box(x + dx, gy - 0.1, z, 0.16, y + 0.62 - gy, 0.16, { tex: 'wood', color: '#4a3f33' });
        }
        K.box(x, y + 0.45, 12.72, 7.0, 0.18, 0.08, { tex: 'wood', color: '#5a4c3c' });
        // timber battens between the stumps, front and sides, down to the falling ground (not a house floating on sticks)
        const gyAt = (xx, z) => erF(xx) - 0.006 - Math.max(0, z - 12) * 0.5;
        const top = y + 0.46;
        C3_battens(K, [x - 3.5, 12.76], [x + 3.5, 12.76], gyAt(x - 3.5, 12.76) - 0.05, gyAt(x + 3.5, 12.76) - 0.05, top, top);
        for (const sx of [-3.42, 3.42]) C3_battens(K, [x + sx, 12.76], [x + sx, 19.9], gyAt(x + sx, 12.76) - 0.05, gyAt(x + sx, 19.9) - 0.05, top, top);
        K.prop('letterbox', x + 1.9 - 0.95, 8.35, 180, { y, variant: 'brick', seed: 60 + i });
      });
      // side fences between the yards, sheds, gum trees, shrubs — the gaps between the houses go to fog
      for (const x of [ER.cotN[0] + 8.2, ER.cotN[0] - 8.2, ER.cotN[1] - 8.2, ER.cotN[2] + 8.6, ER.cotN[2] - 8.6, ER.cotN[3] - 8.2]) {
        const y = erF(x) + 0.05;
        const f = K.prop('fence', x, -5.2, 90, { variant: 'paling', len: 10.2, y, collide: false, seed: Math.round(x) });
        void f;
      }
      K.prop('gum_tree', 84, -6.5, 20, { y: erF(84) + 0.05, seed: 11 });
      K.prop('gum_tree', 58.6, -9.5, 140, { y: erF(58) + 0.05, seed: 12 });
      K.prop('gum_tree', 34.5, -4.5, 260, { y: erF(34) + 0.05, seed: 13 });
      K.prop('gum_tree_small', 90, 12.5, 30, { y: erF(90) - 0.3 });
      K.prop('gum_tree_small', 64, 13.2, 200, { y: erF(64) - 0.4 });
      K.prop('gum_tree', 17.5, 13.5, 80, { y: erF(17) - 0.6, seed: 14 });
      for (const [x, z, w] of [[92.5, -1.3, 1.4], [73.4, -1.1, 1.1], [44.2, -1.2, 1.5], [27.1, -1.4, 1.2], [103.6, 9.3, 1.3], [53, 9.2, 1.1], [60.4, 9.4, 1.4], [12.3, -1.2, 1.2], [8.5, 9.1, 1.0]]) K.prop('shrub', x, z, x * 7, { y: erF(x) + 0.03, w, h: 0.9, dead: x < 30 });
      K.prop('hut', 63.5, -8.5, 90, { y: erF(63.5) + 0.05, w: 2.4, d: 2.0, seed: 7 });
      // verandah leftovers
      K.prop('chair', ER.cotN[0] - 2.1, -3.7, 170, { y: erF(ER.cotN[0]) + 0.64, variant: 'timber' });
      K.prop('esky', ER.cotN[1] + 2.4, -3.5, 20, { y: erF(ER.cotN[1]) + 0.64 });
      K.prop('cardigan_chair', ER.opX + 2.2, -3.6, 200, { y: erF(ER.opX) + 0.64, chair: 'timber', color: '#5a6a8a' });
      K.prop('mug', ER.opX + 1.7, -3.3, 30, { y: erF(ER.opX) + 0.64 + 0.02, text: 'M' });
      K.prop('plant_pot', ER.cotN[3] + 2.6, -3.4, 0, { y: erF(ER.cotN[3]) + 0.64, variant: 'dead' });
      K.prop('stacked_chairs', ER.cotS[1] - 2.3, 12.9, 0, { y: erF(ER.cotS[1]) + 0.64, n: 3 });
      // a kid's bike in 70's yard; a FOR SALE board gone grey at 24
      { const y = erF(70) + 0.1; const bk = new THREE.Group(); const blk = K.mat({ color: '#2a2a2a', roughness: 0.6 }), red = K.mat({ color: '#9a2a24', roughness: 0.5 });
        for (const dx of [-0.42, 0.42]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 5, 16), blk); w.position.set(dx, 0.03, 0); w.rotation.x = Math.PI / 2; w.userData.ownedGeo = true; bk.add(w); }
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.05), red); fr.position.set(0, 0.06, 0.05); fr.userData.ownedGeo = true; bk.add(fr);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.46), red); hb.position.set(0.46, 0.09, 0.1); hb.userData.ownedGeo = true; bk.add(hb);
        bk.position.set(67.8, y, -2.1); bk.rotation.y = 0.5; K.mesh(bk, { static: true }); }
      K.sign('SOLD', 22.4, erF(24) + 1.2, -0.45, 0.8, 0.5, { rotY: 8, style: 'shop', bg: '#b3261e', fg: '#f4f0e6', age: 2 });
      K.box(22.4, erF(24), -0.52, 0.06, 1.0, 0.06, { tex: 'wood', color: '#6a5a44' });
      // bins out at the kerb, never collected; an old sedan parked nose-down with a brick behind the wheel
      K.prop('car', 39.5, 2.75, 90, { y: erY(39.5), color: '#6f6a58', variant: 'sedan', plate: 'SHT-061' });
      K.box(38.95, erY(38.95), 3.62, 0.1, 0.08, 0.22, 'brick');
      K.prop('bin', 88.2, 7.2, 180, { y: erF(88), variant: 'wheelie', color: '#2f5a3a' });
      K.prop('bin', 29.4, 7.25, 190, { y: erF(29), variant: 'wheelie', color: '#7a2a22' });
      K.prop('sign_post', 107.6, 7.55, 180, { y: erF(107.6), text: 'EXCHANGE RD' });
      K.prop('road_sign', 3.2, 7.95, 180, { y: erF(3), text: 'SIGNAL HILL\nTRUNK EXCHANGE', collide: false });
      K.prop('bollard', 1.2, 1.1, 0, { y: erF(1.2), variant: 'post' });
      // ---- street lights (sodium) and the old copper lines on hardwood poles --------------------------------------------
      K.prop('streetlight', 104, 0.42, 0, { y: erF(104), bank: 1 });
      K.prop('streetlight', 84, 7.62, 180, { y: erF(84), lit: false, light: false });
      K.prop('streetlight', 64, 0.42, 0, { y: erF(64), bank: 2 });
      K.prop('streetlight', 44, 7.62, 180, { y: erF(44), bank: 3, flicker: true });
      K.prop('streetlight', 24.5, 0.42, 0, { y: erF(24.5), bank: 4 });
      K.prop('streetlight', 5.5, 7.62, 180, { y: erF(5.5), bank: 5 });
      const poles = [110, 82, 54.5, 27, 1.5];
      poles.forEach((x) => K.prop('power_pole', x, -0.55, 0, { y: erF(x), h: 9, span: 0, seed: Math.round(x) }));
      for (let i = 0; i < poles.length - 1; i++) {
        const a = poles[i], b = poles[i + 1];
        for (const [dz, dy] of [[-1.05, 8.76], [-0.4, 8.76], [0.4, 8.76], [1.05, 8.76], [-0.62, 7.75], [0.62, 7.75]]) C3_wire(K, [a, erF(a) + dy, -0.55 + dz], [b, erF(b) + dy, -0.55 + dz], 0.55, 0.008);
      }
      // ---- the payphone at the top of the road (a save point) --------------------------------------------------------
      K.payphone(7.2, 0.62, 0, { id: 'c3_exchangerd:payphone', y: erF(7.2) });
      // ---- beyond the top: the exchange's dark brick bulk in the fog (the forecourt is its own room) --------------------
      K.box(-14, erF(0) - 0.2, -8, 22, 9.5, 14, { tex: 'brick', color: '#6d5a4c' });
      K.box(-14, erF(0) + 9.3, -8, 22.4, 0.5, 14.4, { tex: 'concrete', color: '#6a6c66' });
      for (let i = 0; i < 6; i++) K.plane(-23 + i * 3.4, erF(0) + 5.2, -0.98, 1.1, 2.3, winTex(i), { rotY: 0 });
      K.box(-3.2, erF(0) + 9.8, -10, 1.6, 4.2, 1.6, 'brick');                 // a stair tower / flue
      // ---- writing on a paling fence, fog-faded ----------------------------------------------------------------------------
      K.writing('DID YOU CHECK', 76.9, erF(77) - 0.7, 14.6, 1.6, { rotY: 90 });
      // ---- dressing -------------------------------------------------------------------------------------------------
      K.dress('leaves', [2, 0.3, 110, 1.6], 26, { seed: 331 });
      K.dress('leaves', [2, 6.4, 110, 7.7], 22, { seed: 332 });
      K.dress('leaves', [ER.br[0] + 0.3, 8, ER.br[1] - 0.3, 19.5], 12, { seed: 333 });
      for (const [x, z] of [[97.5, 5.8], [61, 2.4], [33, 5.9], [15, 2.1]]) K.prop('leaf_pile', x, z, x * 3, { y: erY(x), radius: 0.7 });
      K.prop('rubbish', 70.2, 7.1, 20, { y: erF(70) });

      // ---- examine ----------------------------------------------------------------------------------------------------
      K.examine(ER.opX - 0.95, erF(ER.opX) + 1.1, -0.2, 'Operators lived up here. Right next to work.', { id: 'c3er:operator', r: 1.5 });
      K.examine(ER.opX + 2.0, erF(ER.opX) + 1.1, 0.4, ['A cardigan over a chair on the verandah. A mug with an M on it.', 'The porch light\'s on. [beat] Nobody answers it.'], { id: 'c3er:verandah', r: 1.6 });
      K.examine(ER.cotN[0] - 2.2, erF(ER.cotN[0]) + 1.0, 0.4, 'A timber chair on the verandah, turned to face the road. Like someone sat out here waiting for the bus.', { id: 'c3er:chair', r: 1.6 });
      K.examine(68.3, erF(70) + 0.6, 0.4, 'A kid\'s bike on its side in the grass. [beat] Tassels on the handlebars.', { id: 'c3er:bike', r: 1.6 });
      K.examine(39.5, erY(39.5) + 1.0, 3.8, ['An old sedan, parked nose-down the hill. There\'s a brick behind the back wheel.', 'Just in case.'], { id: 'c3er:car', r: 2.2 });
      K.examine(88.2, erF(88) + 0.9, 6.9, 'Bins out for collection. [beat] Nobody\'s collected them.', { id: 'c3er:bins', r: 1.3 });
      K.examine(22.4, erF(24) + 1.1, 0.3, 'SOLD. The sticker\'s gone grey. The curtains are still up.', { id: 'c3er:sold', r: 1.6 });
      K.examine(77, erF(77) + 0.9, 8.4, ['The old road down to Relay Street. [beat] It just... stops.', 'There\'s nothing down there but white.'], { id: 'c3er:branch', r: 2.0 });
      K.examine(54.5, erF(54.5) + 1.5, 0.2, 'Copper lines, pole to pole. Heavy with fog. They all run up the hill.', { id: 'c3er:lines', r: 1.4 });
      K.examine(1.6, erF(1.6) + 1.5, 4.0, ['The exchange. [beat] It\'s bigger than I thought.', 'Wai said the top.'], { id: 'c3er:top', r: 2.2 });
    },
    // (the first time up, begin() has Aidan's thoughts: an onEnter one here spoke over them)
  });

  // =================================================================================================================
  // 3B THE FORECOURT — x 0…36, z 0…20. The 1961 facade along z 0 (x −2…36), the entrance canopy and the glass doors
  // (x 28), the brass plaque beside them; the staff car park south-west; the road in from the east (x 36, z 6…16).
  // =================================================================================================================
  const FC = { doorX: 28, teth: [13.4, 11.2] };
  defineRoom({
    id: 'c3_forecourt', name: 'EXCHANGE FORECOURT', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: true, surface: 'concrete', ambient: 'hum',
    fog: { density: 0.042 },
    surfaces: [{ box: [3.5, 7.5, 24, 19.5], s: 'bitumen' }],
    bounds: [0, 0, 37, 20],
    entries: { road: [34.6, 11, -90], doors: [FC.doorX, 1.35, 0], start: [34.6, 11, -90] },
    cameras: [
      // arriving from Exchange Road: low beyond the south fence, the facade looming up and away
      { id: 'c3_forecourt:arrive', vol: [26.5, 6.2, 37, 20], type: 'pan', pos: [18.6, 0.85, 17.8], target: [31.5, 3.2, 4.0], fov: 46, pan: { lag: 0.35, yaw: 30, pitch: 22 } },
      // the entrance from high under the car-park lights: the canopy, the doors, the plaque
      { id: 'c3_forecourt:doors', vol: [20.5, 0, 37, 6.2], type: 'pan', pos: [23.4, 4.1, 10.2], target: [29, 0.8, 1.6], fov: 48, pan: { lag: 0.35, yaw: 40, pitch: 26 } },
      // the car park from the canopy corner, looking out into the fog (the Tethered among the bays)
      { id: 'c3_forecourt:carpark', vol: [11.5, 6.2, 26.5, 20], type: 'pan', pos: [33.6, 3.5, 6.6], target: [12, 0.6, 13], fov: 46, pan: { lag: 0.35, yaw: 40, pitch: 22 } },
      // the far bays, the supervisor's wagon and the fence into the fog, from the south fence
      { id: 'c3_forecourt:lot', vol: [0, 6.2, 11.5, 20], type: 'pan', pos: [-0.9, 4.1, 21.6], target: [7.0, 0.8, 12.0], fov: 46, pan: { lag: 0.35, yaw: 44, pitch: 36 } },
      // along the facade to the locked side gate
      { id: 'c3_forecourt:west', vol: [0, 0, 20.5, 6.2], type: 'static', pos: [24.6, 2.6, 3.5], target: [3.5, 1.0, 2.6], fov: 'fit' },
    ],
    spawns: [
      { id: 'c3_forecourt:teth', type: 'tethered', pos: FC.teth, rot: 262, anchor: FC.teth },
    ],
    build(K) {
      K.floor(0, 0, 37, 20, 'concrete');
      // the ground round the forecourt (fog beyond), and Exchange Road dropping away east
      C3_ground(K, -24, 20, 70, 44, () => -0.05, 'grass');
      C3_ground(K, -24, -12, 0, 20, () => -0.05, 'grass');
      C3_ground(K, 37, -12, 70, 6.2, (x) => -0.05 - (x - 37) * 0.06, 'grass');
      C3_ground(K, 37, 15.8, 70, 20, (x) => -0.05 - (x - 37) * 0.06, 'grass');
      C3_ground(K, 37, 6.2, 70, 15.8, (x) => -(x - 37) * 0.0714, 'bitumen');
      // the car park: bitumen, faded bays, wheel stops, the supervisor's bay
      K.floor(3.5, 7.5, 24, 19.5, 'bitumen');
      for (let i = 0; i <= 7; i++) K.plane(4.2 + i * 2.6, 0.012, 11.2, 0.1, 4.6, { color: '#d8d4c4', roughness: 0.9 }, { rot: [-90, 0, 0] });
      for (let i = 0; i < 7; i++) K.box(5.5 + i * 2.6, 0, 8.4, 1.5, 0.12, 0.2, 'concrete');
      K.plane(5.5, 0.013, 12.6, 1.8, 0.3, signTex('supbay', ['SUPERVISOR'], { w: 256, h: 48, bg: '#2a2a28', fg: '#d8d4c4', border: false, age: 1.6 }), { rot: [-90, 0, 0] });
      // ---- the facade: brick, two storeys, steel windows, the canopy and the doors ------------------------------------
      K.wall(-2, -0.2, 36, -0.2, 9, { tex: 'brick', color: '#7a6250' }, { openings: [{ at: FC.doorX + 2, w: 1.9, h: 2.25 }], grime: true, thick: 0.4 });
      K.box(17, 9, -0.35, 38.6, 0.5, 0.7, { tex: 'concrete', color: '#76786f' });            // parapet
      K.box(36.1, 0, -9, 0.4, 9, 18, { tex: 'brick', color: '#735c4b' }, { collide: true });  // the east side wall running back
      K.box(15, 0, -0.42, 40, 0.5, 0.1, { tex: 'concrete', color: '#6d6f68' });                // plinth course
      K.box(17, 4.55, 0.02, 38, 0.22, 0.16, { tex: 'concrete', color: '#7e8079' });            // string course between the storeys
      for (let i = 0; i <= 13; i++) { const px = -0.3 + i * 2.9; if (Math.abs(px - FC.doorX) < 3.0) continue; K.box(px, 0, 0.06, 0.42, 9, 0.16, { tex: 'brick', color: '#6a5444' }); }
      // wall-pack sodium lamps on the facade, washing the brick and the name
      for (const [x, b] of [[FC.doorX, 1], [10.5, 2]]) { K.box(x, 5.35, 0.12, 0.34, 0.2, 0.22, { tex: 'metal', color: '#3a3d3a' }); K.light('street', x, 5.3, 0.55, { intensity: 16, distance: 13, bank: b, halo: true, haloSize: 1.6 }); }
      for (let i = 0; i < 9; i++) {
        const wx = 1.2 + i * 2.9; if (Math.abs(wx - FC.doorX) < 3.2) continue;
        K.plane(wx, 2.3, 0.02, 1.1, 2.1, winTex(i), {});
        K.plane(wx, 6.3, 0.02, 1.1, 2.1, winTex(i + 3), {});
        K.box(wx, 1.18, 0.02, 1.25, 0.08, 0.14, 'concrete'); K.box(wx, 5.18, 0.02, 1.25, 0.08, 0.14, 'concrete');
      }
      // the entrance: a concrete canopy on two columns; the glass doors; the name in raised steel letters
      K.box(FC.doorX, 3.2, 1.75, 7.5, 0.3, 3.9, { tex: 'concrete', color: '#8a8b84' });
      for (const x of [FC.doorX - 3.3, FC.doorX + 3.3]) K.cyl(x, 0, 3.35, 0.16, 3.2, { tex: 'concrete', color: '#8e8f88' }, { collide: true });
      K.plane(FC.doorX, 4.3, 0.05, 8.2, 1.02, nameTex(), { transparent: true });
      K.door({ id: 'c3_forecourt:doors', x: FC.doorX, z: -0.2, rot: 0, w: 1.8, style: 'glass_double', to: 'c3_foyer', entry: 'doors' });
      K.plane(FC.doorX, 1.2, -0.28, 1.7, 2.2, { color: '#050706', roughness: 1 }, { rotY: 0 });   // the dark foyer behind the glass
      // the brass plaque, right of the doors (DOC Exchange Plaque)
      K.box(FC.doorX + 2.45, 1.25, 0.0, 0.66, 0.48, 0.03, { tex: 'metal', color: '#5a4a30' });
      K.plane(FC.doorX + 2.45, 1.49, 0.036, 0.62, 0.44, plaqueTex(), { roughness: 0.35 });
      K.doc('plaque', FC.doorX + 2.45, 1.49, 0.3, { id: 'c3_forecourt:plaque', model: 'none', r: 1.1 });
      // a louvred plant-room vent that hums; a locked plant-room door; the locked side gate to the rear yard
      K.box(11.2, 0.6, 0.0, 1.6, 1.2, 0.06, { tex: 'grille', color: '#6a6f6b' });
      K.examine(11.2, 1.2, 0.5, 'Something in there is still running.', { id: 'c3fc:hum', r: 1.6 });
      K.door({ id: 'c3_forecourt:plant', x: 15.6, z: -0.2, rot: 0, w: 1.0, style: 'metal', locked: true, lockMsg: "It's locked.", sign: 'PLANT ROOM' });
      K.sign('DANGER\nHIGH VOLTAGE', 16.6, 1.6, 0.03, 0.34, 0.26, { style: 'warning' });
      K.prop('chainlink', 0.6, 3.2, 90, { len: 6, h: 2.2 });
      K.door({ id: 'c3_forecourt:sidegate', x: 0.6, z: 3.1, rot: 90, w: 1.6, style: 'wired', locked: true, lockMsg: "It's locked.", sign: 'NO ENTRY' });
      K.examine(1.4, 1.2, 3.1, ['A side gate to the back of the building. Padlocked from the other side.', 'The yard must be back there.'], { id: 'c3fc:gate', r: 1.3 });
      // ---- the flagpole, the sign plinth, the bench and the butts bin ---------------------------------------------------
      K.cyl(34, 0, 3.6, 0.06, 9.5, { tex: 'metal', color: '#b8bdb8' }, { r2: 0.035, collide: true });
      K.sphere(34, 9.55, 3.6, 0.07, { tex: 'metal', color: '#c9a84a' });
      const halyard = C3_wire(K, [34.06, 9.3, 3.6], [34.12, 1.1, 3.65], -0.05, 0.006, '#c9c2a8', { static: false, name: 'c3fc_halyard' });
      K.animate((dt, t) => { if (halyard) halyard.rotation.x = Math.sin(t * 0.9) * 0.012; });
      K.examine(33.5, 1.3, 4.0, ['The flagpole. No flag. [beat] The clip on the halyard still taps against it.', 'Tink. Tink. Like somebody tapping to be let in.'], { id: 'c3fc:flag', r: 1.4 });
      K.box(30.2, 0, 19.1, 3.2, 0.9, 0.5, { tex: 'brick', color: '#735c4b' }, { collide: true });
      K.sign('SIGNAL HILL\nTRUNK EXCHANGE\n— TELECOMMUNICATIONS —', 30.2, 1.55, 18.83, 2.8, 0.9, { style: 'council', rotY: 180 });
      K.prop('planter', 7, 6.4, 0, { variant: 'box', dead: true });
      K.prop('planter', 13, 6.4, 0, { variant: 'box', dead: true });
      K.prop('planter', 17.2, 6.4, 0, { variant: 'box', dead: true });
      K.prop('bench', FC.doorX - 2.1, 2.3, 180, { len: 1.8 });
      K.prop('bin', FC.doorX + 3.9, 2.3, 180, { variant: 'street' });
      K.examine(FC.doorX + 3.9, 1.0, 2.6, 'A sand bin full of old butts. Lipstick on one of them.', { id: 'c3fc:butts', r: 1.1 });
      K.examine(FC.doorX - 2.1, 0.8, 2.6, 'A bench under the canopy. Worn pale where people sat out their breaks.', { id: 'c3fc:bench', r: 1.2 });
      // cable markers, a pit lid, a NO PUBLIC ACCESS sign
      for (const [x, z] of [[27, 9], [27, 13], [27, 17]]) { K.box(x, 0, z, 0.12, 0.7, 0.12, { color: '#d8c23a', roughness: 0.6 }); K.plane(x, 0.55, z + 0.065, 0.1, 0.16, signTex('cable', ['CABLE', 'BELOW'], { w: 64, h: 96, bg: '#e8c21a', size: 14 }), {}); }
      K.examine(27, 0.7, 13.4, 'Cable markers. "DO NOT DIG." [beat] The whole hill\'s wired underneath.', { id: 'c3fc:cable', r: 1.2 });
      K.box(25.4, 0.005, 11, 1.0, 0.03, 0.7, { tex: 'metal', color: '#4d534f' });
      K.sign('NO PUBLIC ACCESS\nBEYOND THIS POINT', 3.8, 1.5, 0.06, 1.0, 0.4, { style: 'council' });
      // the staff car: the supervisor's, dusty, one window down an inch
      K.prop('car', 5.5, 11.2, 0, { color: '#7c7462', variant: 'wagon', plate: 'EXC-1961' });
      K.examine(5.5, 1.2, 13.6, ['A station wagon in the supervisor\'s bay. Dust on the windscreen like snow.', 'A cardigan on the back seat. A thermos. Somebody\'s whole shift, waiting.'], { id: 'c3fc:car', r: 1.9 });
      K.prop('car', 12.6, 16.3, 180, { color: '#3a4a5a', variant: 'sedan' });
      K.prop('trolley', 20.8, 9.5, 40, {});
      // fences into the fog on the south and west; a gum tree over them
      K.prop('chainlink', 12, 19.6, 0, { len: 24, h: 2.1 });
      K.prop('chainlink', 0.6, 13, 90, { len: 13, h: 2.1 });
      K.collider(0, 19.45, 26.5, 19.8, { h: 2.4 }); K.collider(0.4, 6.2, 0.8, 19.6, { h: 2.4 });
      K.prop('chainlink', 31.5, 19.6, 0, { len: 10, h: 2.1 }); K.collider(26.5, 19.45, 37, 19.8, { h: 2.4 });
      K.collider(36.2, 0, 36.6, 6.0, { h: 3 }); K.collider(36.2, 16.2, 36.6, 20, { h: 3 });
      K.prop('gum_tree', -2.5, 17, 40, { seed: 21 });
      K.prop('floodlight', 24.8, 18.6, 0, { variant: 'pole', lit: false, light: false });
      // lights: the canopy lamp (warm, weak), a sodium lamp at the road mouth
      K.light('lamp', FC.doorX, 3.05, 2.2, { color: '#ffd8a0', intensity: 3.2, distance: 7, bank: 1, flicker: true, name: 'c3fc:canopy' });
      K.prop('streetlight', 35.5, 17, -90, { bank: 2 });
      K.prop('streetlight', 10, 19.2, 180, { bank: 3, light: true });
      // writing, faded, on the plant-room door
      K.writing('ASK THEM', 15.6, 1.6, 0.0, 0.9, { rotY: 0 });
      K.dress('leaves', [1, 6.4, 25, 19], 24, { seed: 341 });
      K.dress('leaves', [1, 0.6, 35, 6], 16, { seed: 342 });
      K.dress('papers', [20, 0.6, 35, 5.5], 5, { seed: 343 });
      // CALL 3: Luka, as Aidan steps onto the forecourt
      // (not once: a call still ringing when he steps back out onto the road is withdrawn, so it rings again next time)
      K.trigger([29.5, 5.5, 36, 17], async (G) => {
        if (S.chapter !== 3 || (S.calls && S.calls.luka3) || C3.luka3) return;
        C3.luka3 = true;
        // (after his first thought on the forecourt, so the ring and the call never talk over it)
        try { await G.wait(0.8); await G.until(() => !C3.fcThought); await G.wait(0.6); await G.call('luka3'); } finally { C3.luka3 = false; }
      }, { id: 'c3_forecourt:luka3', once: false, when: () => S.chapter === 3 && !(S.calls && S.calls.luka3) });
      K.exit({ id: 'c3_forecourt:road', box: [36.2, 6.1, 37, 16.1], to: 'c3_exchangerd', entry: 'top' });
    },
    async onEnter(G, from) {
      if (from === 'c3_exchangerd' && G.once('c3:forecourt')) {
        C3.fcThought = true;
        try {
          note(G, 'Wai. Inside the exchange.', 'c3_goal');
          await G.wait(1.0);
          await G.think('The old exchange. [beat] There\'s a hum coming off it.');
        } finally { C3.fcThought = false; }
      }
    },
  });

  // =================================================================================================================
  // 3C THE FOYER — 10 × 8 m, the glass doors in the south wall (x 6.5), the hall door in the north wall (x 2.4). The
  // north wall is a cutaway for the high corner camera. The only light: the EXIT sign and the fog through the glass.
  // =================================================================================================================
  const FY = { H: 3.4, doorX: 6.5, hallX: 2.4 };
  const planTex = () => C3_tex('evacplan', 512, 384, (x, w, h, r) => {
    x.fillStyle = '#f2f1ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1f7a3e'; x.fillRect(0, 0, w, 52);
    tx(x, 'FIRE EVACUATION PLAN', w / 2, 36, 28, '#ffffff', { font: FN.heavy, weight: '900', align: 'center', spacing: 2 });
    tx(x, 'SIGNAL HILL TRUNK EXCHANGE — GROUND FLOOR', 16, 72, 12, '#2a2a2a', { weight: 'bold' });
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; x.strokeRect(16, 80, 330, 150);
    x.lineWidth = 1.5; for (let i = 0; i < 5; i++) x.strokeRect(70, 96 + i * 24, 220, 10);
    x.strokeRect(16, 80, 50, 150); tx(x, 'FRAME', 20, 160, 10, '#2a2a2a');
    x.strokeRect(120, 80, 60, 14); tx(x, 'RECORDS', 124, 91, 9, '#2a2a2a');
    x.strokeRect(290, 216, 56, 14); tx(x, 'CANTEEN', 292, 227, 9, '#2a2a2a');
    x.strokeRect(300, 230, 46, 36); tx(x, 'FOYER', 304, 252, 10, '#2a2a2a');
    x.strokeRect(318, 80, 28, 26); tx(x, 'STAIRS', 319, 97, 7, '#2a2a2a');
    tx(x, 'BASEMENT', 16, 262, 12, '#2a2a2a', { weight: 'bold' });
    x.strokeRect(16, 270, 210, 70); x.strokeRect(226, 270, 60, 40); x.strokeRect(286, 270, 60, 40);
    tx(x, 'CABLE VAULT', 70, 310, 11, '#2a2a2a'); tx(x, 'LANDING', 230, 295, 9, '#2a2a2a'); tx(x, 'FUSES', 296, 295, 10, '#2a2a2a');
    x.strokeStyle = '#1f7a3e'; x.lineWidth = 5; x.beginPath(); x.moveTo(300, 160); x.lineTo(330, 160); x.lineTo(330, 262); x.lineTo(346, 262); x.stroke();
    x.fillStyle = '#1f7a3e'; x.beginPath(); x.moveTo(360, 262); x.lineTo(346, 254); x.lineTo(346, 270); x.fill();
    x.fillStyle = '#c0261d'; x.beginPath(); x.arc(322, 250, 7, 0, Math.PI * 2); x.fill();
    tx(x, 'YOU ARE HERE', 360, 110, 13, '#c0261d', { weight: 'bold' });
    x.fillStyle = '#1f7a3e'; x.fillRect(372, 150, 120, 80); tx(x, 'ASSEMBLY AREA', 432, 185, 12, '#ffffff', { weight: 'bold', align: 'center' }); tx(x, 'FORECOURT', 432, 205, 12, '#ffffff', { align: 'center' });
    tx(x, 'In case of fire: leave by the nearest exit. Do not use the switchboards.', 16, 368, 11, '#333');
    age(x, w, h, r, 0.8, { sun: 0.3 });
  });
  // the 1961 staff photo: three rows of operators and technicians in front of the new building; every face faded out
  const staffTex = () => C3_tex('staff1961', 640, 420, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#cdbd98'); g.addColorStop(0.55, '#b5a37e'); g.addColorStop(1, '#8a7a58');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(90,70,50,0.35)'; x.fillRect(0, 40, w, 150);                             // the brick facade behind them
    for (let i = 0; i < 26; i++) x.fillRect(20 + i * 24, 60, 12, 30);
    const rows = [[11, 250, 0.9], [12, 300, 1.0], [12, 352, 1.08]];
    rows.forEach(([n, y, s], ri) => {
      for (let i = 0; i < n; i++) {
        const cx = w / 2 + (i - (n - 1) / 2) * 50 * s + (r() - 0.5) * 4, cy = y;
        x.fillStyle = ri === 2 && i % 3 === 1 ? '#6a5c44' : '#4e4232';
        x.beginPath(); x.ellipse(cx, cy + 36 * s, 21 * s, 34 * s, 0, 0, Math.PI * 2); x.fill();          // body
        x.fillStyle = '#3a3024'; x.beginPath(); x.ellipse(cx, cy - 8 * s, 12 * s, 12 * s, 0, 0, Math.PI * 2); x.fill();  // hair
        x.fillStyle = '#d8ccb0'; x.beginPath(); x.ellipse(cx, cy, 10 * s, 12 * s, 0, 0, Math.PI * 2); x.fill();          // face…
        const f = x.createRadialGradient(cx, cy, 0, cx, cy, 17 * s); f.addColorStop(0, 'rgba(236,228,206,1)'); f.addColorStop(1, 'rgba(236,228,206,0)');
        x.fillStyle = f; x.fillRect(cx - 18 * s, cy - 18 * s, 36 * s, 36 * s);                                           // …faded to nothing
      }
    });
    tx(x, 'SIGNAL HILL TRUNK EXCHANGE — OPENING STAFF — AUGUST 1961', w / 2, h - 14, 15, '#3a2e20', { font: FN.serif, align: 'center' });
    age(x, w, h, r, 2.2, { sun: 0.6 });
    x.fillStyle = 'rgba(214,200,170,0.28)'; x.fillRect(0, 0, w, h);
  });
  const honourTex = () => C3_tex('honour', 256, 400, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#4a3020'); g.addColorStop(1, '#2e1c10'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#c9a84a'; x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20);
    tx(x, 'OPERATORS', w / 2, 44, 20, '#e6c870', { font: FN.serif, weight: 'bold', align: 'center', spacing: 3 });
    tx(x, '1961 — 1987', w / 2, 68, 15, '#e6c870', { font: FN.serif, align: 'center' });
    const names = ['Margaret H.', 'June O.', 'Dorothy K.', 'Beryl T.', 'Maureen S.', 'Joan W.', 'Pat L.', 'Val R.', 'Shirley M.', 'Irene D.', 'Jean F.', 'Nola B.'];
    names.forEach((n, i) => tx(x, n, w / 2, 102 + i * 23, 14, '#e6c870', { font: FN.serif, align: 'center' }));
    age(x, w, h, r, 0.8);
  });
  const letterboardTex = () => C3_tex('letterboard', 320, 256, (x, w, h, r) => {
    x.fillStyle = '#141414'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.05)'; for (let y = 8; y < h; y += 6) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
    const L = ['GROUND FLOOR', "  OPERATORS' HALL", '  RECORDS', '  CANTEEN', '', 'BASEMENT', '  PLANT . FUSES', '  CABLE VAULT'];
    L.forEach((s, i) => tx(x, s, 20, 32 + i * 27, 17, i === 0 || i === 5 ? '#f2eee2' : '#dcd8cc', { font: FN.sans, weight: 'bold', spacing: 1 }));
    x.fillStyle = '#f2eee2'; x.save(); x.translate(250, 196); x.rotate(0.4); x.fillRect(0, 0, 9, 14); x.restore();      // a fallen letter
    age(x, w, h, r, 0.6);
  });
  defineRoom({
    id: 'c3_foyer', name: 'FOYER', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'tile', ambient: 'hum',
    fog: { density: 0.032, color: '#3b4543' },
    bounds: [0, 0, 10, 8],
    entries: { doors: [FY.doorX, 7.05, 180], hall: [FY.hallX, 0.95, 0], start: [FY.doorX, 7.05, 180] },
    cameras: [
      // high corner (past the cutaway north wall): the glass doors, the fog, the dust
      { id: 'c3_foyer:high', vol: [0, 2.8, 10, 8], type: 'static', pos: [9.3, 3.15, -0.3], target: [4.4, 0.35, 5.6], fov: 'fit' },
      // low from the doors: the reception desk and, above the hall door, the staff photo
      { id: 'c3_foyer:low', vol: [0, 0, 10, 2.8], type: 'static', pos: [5.6, 0.72, 7.55], target: [5.3, 1.6, 0.2], fov: 'fit' },
      // across the foyer from the doors' corner: the evacuation plan, the heritage case, the visitors' chairs
      { id: 'c3_foyer:plan', vol: [0, 3.4, 3.6, 8], pri: 1, type: 'static', pos: [9.0, 2.95, 7.45], target: [0.4, 0.95, 5.0], fov: 'fit' },
      // the reception desk from the plan wall: the dust, the bell, the sign-in sheet
      { id: 'c3_foyer:desk', vol: [6.2, 1.6, 10, 6.4], pri: 1, type: 'static', pos: [0.9, 2.7, 7.6], target: [8.7, 0.85, 3.4], fov: 'fit' },
    ],
    build(K) {
      const H = FY.H;
      K.floor(0, 0, 10, 8, { tex: 'tile', color: '#8f8a7c' });
      K.ceiling(0, 0, 10, 8, H, { tex: 'plaster', color: '#b8b3a4' });
      const wall = { tex: 'plaster', color: '#c4bca4' };
      K.wall(-0.075, 0, 10.075, 0, H, wall, { openings: [{ at: FY.hallX + 0.075, w: 1.0, h: 2.2 }], both: false, skirting: true });
      K.wall(0, 8, 0, 0, H, wall, { skirting: true, grime: true });
      K.wall(10, 0, 10, 8, H, wall, { skirting: true });
      K.wall(10.075, 8, -0.075, 8, H, { tex: 'brick', color: '#7a6250' }, { openings: [{ at: 10.075 - FY.doorX, w: 1.9, h: 2.25 }, { at: 10.075 - 2.3, w: 2.2, h: 1.5, sill: 0.9, glass: true }] });
      K.door({ id: 'c3_foyer:doors', x: FY.doorX, z: 8, rot: 0, w: 1.8, style: 'glass_double', to: 'c3_forecourt', entry: 'doors' });
      K.door({ id: 'c3_foyer:hall', x: FY.hallX, z: 0, rot: 180, w: 0.95, style: 'wood', to: 'c3_hall', entry: 'foyer', sign: "OPERATORS' HALL", color: '#b89a72' });
      // the fog light through the glass, cold; the EXIT sign
      K.light('point', FY.doorX, 2.2, 9.3, { color: '#9fb4b0', intensity: 3.0, distance: 7.5, bank: 1, name: 'c3fy:fog' });
      K.prop('exit_sign', FY.doorX, 7.92, 180, { mount: 2.6 });
      // ---- the reception desk (east), dust on everything ------------------------------------------------------------
      K.prop('counter', 8.35, 3.7, -90, { len: 2.8, variant: 'reception' });
      K.prop('office_chair', 9.3, 3.4, -100, {});
      K.prop('rotary_phone', 8.1, 2.8, -80, { y: 1.02, color: '#2a2a2a' });
      K.box(8.05, 1.02, 4.3, 0.08, 0.03, 0.08, { tex: 'metal', color: '#c9c2a8', metalness: 0.7, roughness: 0.3 });   // the desk bell
      K.sphere(8.05, 1.08, 4.3, 0.035, { tex: 'metal', color: '#d8d0b0', metalness: 0.8, roughness: 0.25 });
      K.plane(8.15, 1.025, 3.7, 0.3, 0.4, noteTex('visitors', 'VISITORS — PLEASE SIGN IN\n\n12/9/87  Council — meters\n30/9/87  P&C — J. Hartley\n2/10/87', { w: 256, h: 340, lines: true, size: 18, y: 30 }), { rot: [-90, 0, 12] });
      K.prop('desk_lamp', 8.3, 4.8, -120, { y: 1.02, lit: false });
      K.prop('keys_ring', 9.9, 2.4, -90, { variant: 'hook', mount: 1.6 });
      K.prop('water_stain', 8.5, 1.5, 0, { surface: 'ceiling', ceil: H });
      // phone books tied with string by the desk; a dead palm; waiting chairs with an umbrella hooked on one
      for (let i = 0; i < 4; i++) K.box(7.35, i * 0.07, 6.1, 0.28, 0.07, 0.22, { color: ['#d8c34a', '#c9b448', '#e0cf6a', '#cfbf52'][i], roughness: 0.9 }, { rot: i * 7 });
      K.prop('plant_pot', 9.4, 7.4, 0, { variant: 'dead' });
      for (let i = 0; i < 3; i++) K.prop('chair', 0.8 + i * 0.62, 7.45, 180, { variant: 'waiting' });
      K.cyl(1.45, 0.02, 7.2, 0.018, 0.85, { color: '#1a1a1a', roughness: 0.6 }, { rz: 14 });
      // ---- the west wall: the evacuation plan (map_exchange) and the honour board -----------------------------------
      const planTaken = !!(S.taken && S.taken['c3_foyer:map']);
      K.box(0.03, 1.1, 5.6, 0.04, 0.78, 1.0, { color: '#3a3a36' });
      K.plane(0.06, 1.49, 5.6, 0.92, 0.69, planTaken ? { color: '#c9c2ae', roughness: 1 } : planTex(), { rotY: 90, name: 'c3fy_plan' });
      K.pickup('map_exchange', 0.35, 1.3, 5.6, { id: 'c3_foyer:map', model: false, r: 1.1 });
      K.animate(() => { if (S.taken && S.taken['c3_foyer:map']) { const p = World.obj && World.obj('c3fy_plan'); if (p && p.material && p.material.map) { p.material = K.mat({ color: '#c9c2ae', roughness: 1 }); } } });
      K.plane(0.06, 1.75, 2.3, 0.62, 0.97, honourTex(), { rotY: 90 });
      // ---- the north wall: the 1961 staff photo, the letter board, the stopped clock --------------------------------------
      K.box(6.3, 1.2, 0.09, 1.46, 1.0, 0.05, { tex: 'wood', color: '#3a2a1a' });
      K.plane(6.3, 1.7, 0.12, 1.32, 0.87, staffTex(), {});
      K.plane(4.2, 1.55, 0.06, 0.8, 0.64, letterboardTex(), {});
      K.prop('clock', FY.hallX, 0.075, 0, { mount: 2.75, time: [2, 40] });
      // ---- the heritage case: a candlestick phone and a headset under dusty glass ---------------------------------------------
      K.box(2.6, 0, 4.9, 1.2, 0.9, 0.7, { tex: 'wood', color: '#5a3c26' }, { collide: true, h: 1.5 });
      K.cyl(2.35, 0.9, 4.9, 0.06, 0.02, { color: '#1a1a1a', roughness: 0.4 });
      K.cyl(2.35, 0.92, 4.9, 0.018, 0.26, { color: '#1a1a1a', roughness: 0.4 });
      K.cyl(2.35, 1.18, 4.9, 0.035, 0.05, { color: '#1a1a1a', roughness: 0.4 });
      K.prop('headset', 2.85, 4.9, 30, { y: 0.9 });
      K.box(2.6, 0.9, 4.9, 1.16, 0.55, 0.66, { color: '#dfe8e6', roughness: 0.1, transparent: true, opacity: 0.16 }, { shadow: false });
      K.plane(2.6, 0.91, 5.12, 0.5, 0.12, signTex('heritage', ['A PROUD HISTORY OF SERVICE'], { w: 384, h: 64, bg: '#efe8d4', size: 22, border: false }), { rot: [-90, 0, 0] });
      K.pickup('coffee', 8.1, 1.02, 3.25, { id: 'c3_foyer:coffee', extraOnEasy: true, heal: true, rot: 40 });
      K.dress('papers', [0.6, 1.2, 7.0, 7.2], 5, { seed: 351 });
      K.dress('leaves', [4.8, 6.2, 8.4, 7.8], 7, { seed: 352 });
      // ---- examine ------------------------------------------------------------------------------------------------------
      K.examine(6.3, 1.7, 0.7, ['The whole staff, nineteen sixty-one. [beat] Every face has faded to nothing.', 'You can still see the uniforms. The shoes. Somebody\'s handbag on their knee.', 'Just not the faces.'], { id: 'c3fy:photo', r: 1.6 });
      K.examine(7.9, 1.1, 3.7, ['The reception desk. Dust on everything. [beat] Somebody drew a smiley face in it, a long time ago.', 'The sign-in sheet. The last visitor signed in October 1987. [beat] Nobody signed out.'], { id: 'c3fy:desk', r: 1.4 });
      K.examine(7.9, 1.1, 4.45, async (G) => { G.sfx('beep', { vol: 0.25, pos: [8.05, 1.1, 4.3] }); await G.think('Ring for attention. [beat] Nobody comes.'); }, { id: 'c3fy:bell', r: 0.9 });
      K.examine(0.5, 1.6, 2.3, 'OPERATORS, 1961 to 1987. First names and an initial, in gold paint.', { id: 'c3fy:honour', r: 1.4 });
      K.examine(2.6, 1.2, 5.45, 'A candlestick phone and a headset under glass. "A proud history of service." [beat] The dust is on the inside.', { id: 'c3fy:case', r: 1.4 });
      K.examine(4.2, 1.5, 0.55, 'GROUND: OPERATORS\' HALL. RECORDS. CANTEEN. [beat] BASEMENT: PLANT. FUSES. CABLE VAULT.', { id: 'c3fy:board', r: 1.3 });
      K.examine(FY.hallX, 2.4, 0.6, 'The clock stopped at twenty to three.', { id: 'c3fy:clock', r: 1.4 });
      K.examine(7.35, 0.4, 6.1, 'Phone books. Nineteen eighty-six. Tied up with string to go somewhere, and never went.', { id: 'c3fy:books', r: 1.1 });
      K.examine(1.4, 0.8, 7.2, 'Three chairs for visitors. Somebody left their umbrella hooked on one.', { id: 'c3fy:chairs', r: 1.3 });
    },
    onUpdate() { C3_ambient(['#6f7c79', 0.46], ['#2a8a84', 0.3]); },
    onLeave() { C3_ambientOff(); },
  });

  // =================================================================================================================
  // 3D THE OPERATORS' HALL — 40 × 14 m, 5 m ceiling, clerestory windows north. Five rows of cord switchboards run
  // x 6.4…37 (34 positions = 30.6 m): row 1 (faces north, operators in the north aisle) and row 2 (faces south) back to
  // back; row 3 (north) and row 4 (south) back to back; row 5 against the south wall (north). The centre aisle
  // (z 4.66…8.6) runs from the foyer door (east wall, z 6.63) to the frame-hall doors (west wall, z 6.63). Wai's lit
  // board is row 2's westmost two positions (x 6.4…8.2). Records (north wall, x 22), canteen (south wall, x 38.6),
  // stairs (east wall, z 1.6), the wall payphone (east wall, z 11.5), the circuit lamp panel beside the frame doors.
  // =================================================================================================================
  const HL = {
    H: 5.0, x0: 6.4, mid: 6.63, fdZ: 6.63,
    rows: [{ z: 3.315, rot: 180 }, { z: 4.315, rot: 0, wai: true }, { z: 8.94, rot: 180 }, { z: 9.94, rot: 0 }, { z: 13.4, rot: 180 }],
    wai: [6.85, 5.12], stool2: [7.75, 5.12], doorsW: [1.7, 5.2],
  };
  // the rows of switchboards (also used, clipped, for the slice of the hall seen through the frame hall's doorway)
  // o: {dx, dz} offset, xMax (clip the rows), light (Wai's board lamp), name suffix, stools
  function C3_rows(K, o = {}) {
    const dx = o.dx || 0, dz = o.dz || 0, xMax = o.xMax ?? 99, r = U.rng(911 + (o.seed || 0));
    HL.rows.forEach((row, ri) => {
      const segs = row.wai ? [2, 8, 8, 8, 8] : [9, 9, 9, 7];
      let xs = HL.x0;
      segs.forEach((n, si) => {
        const len = n * 0.9;
        if (xs < xMax) {
          const L = Math.min(len, Math.max(0.9, Math.floor((xMax - xs) / 0.9) * 0.9));
          const isWai = row.wai && si === 0;
          K.prop('switchboard', xs + L / 2 + dx, row.z + dz, row.rot, isWai
            ? { len: L, lit: o.waiLit !== false, light: false, labels: ['WAI', '27'], cords: o.waiLit !== false ? 6 : 2, name: 'c3_waiboard' + (o.suffix || ''), seed: 77 }
            : { len: L, lit: false, cords: 1 + ((ri + si) % 2), seed: 100 + ri * 10 + si });
        }
        xs += len;
      });
      // operator stools on the working side, some pushed back, some turned, one or two on their side
      if (o.stools === false) return;
      const side = row.rot === 0 ? 1 : -1, every = ri === 4 ? 3 : ri === 3 ? 0 : 2;
      if (!every) return;
      for (let p = 0; p < 34; p++) {
        if (row.wai && p < 2) continue;
        if ((p + ri) % every) continue;
        const x = HL.x0 + p * 0.9 + 0.45 + (r() - 0.5) * 0.12;
        if (x > xMax) continue;
        const z = row.z + side * (0.72 + r() * (ri === 4 ? 0.06 : 0.22)), rot = (row.rot + 180) + (r() - 0.5) * 50;
        const fallen = r() < 0.06 && ri !== 4;
        const st = K.prop('stool', x + dx, z + dz, rot, { variant: 'operator', collide: !fallen });
        if (fallen && st) { st.rotation.order = 'YXZ'; st.rotation.set(0, rot * D2R, 88 * D2R); st.position.y = 0.21; }
      }
    });
  }
  // the pendant lamps on the HALL circuit (enamel shades on rods); five hold real pool lights over the centre aisle
  const HL_PEND = [[10.4, 6.63, 1], [16.6, 6.63, 1], [22.8, 6.63, 1], [29, 6.63, 1], [35.2, 6.63, 1], [13.5, 1.3, 0], [25.5, 1.3, 0], [19.5, 11.7, 0], [31.5, 11.7, 0], [3.2, 6.63, 1]];
  // (spec §1: nothing around necks. The wai rig preset hangs his reading glasses on a retainer cord behind the neck;
  // every Wai in this chapter wears them without it)
  function C3_noCord(a) {
    const g = a && a.glassesObj;
    if (g) g.traverse((m) => { if (m.name === 'glassesCord') m.visible = false; });
  }
  // his hands free in the quiet scenes: the equipped weapon leaves his left hand until the scene ends
  function C3_emptyHands(A) { try { A.hold('L', new THREE.Group(), { pose: null }); } catch (e) { /* actor */ } }
  function C3_waiTalkLine(G) {
    const L = (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.wai_talk) && DIALOGUE.wai_talk.length) ? DIALOGUE.wai_talk
      : ["Got an email Tuesday. 'Your role has been identified as impacted.' [beat] Impacted. Like a tooth.", "Eighteen years. You'd think they'd at least call.", 'Go on. Basement.'];
    const n = S.done['c3:waiTalk'] | 0;
    S.done['c3:waiTalk'] = n + 1;
    return L[n % L.length];
  }
  async function C3_waiTalk(G) {
    if (!done('cs:3-1')) return;
    const W = G.actor('wai', 'wai');
    if (W.raw) W.raw.idleLife = false;
    try {
      if (flag('c3_bossDone')) {
        W.look(G.aidan); W.eyes('at', G.aidan);
        await G.say('WAI', 'Go on, mate. [beat] I\'ll be on the board.');
        return;
      }
      if (flag('c3_borrowedMet') && !done('c3:waiStairs')) {
        S.done['c3:waiStairs'] = true;
        W.look(G.aidan); W.eyes('at', G.aidan);
        await G.wait(0.4);
        await G.say('WAI', 'Wasn\'t me on the stairs, mate. Check the hands next time.');
        return;
      }
      if (flag('c3_fused') && !done('cs:3-2')) { await C3_impacted(G); return; }
      W.look(G.aidan);
      await G.wait(0.3);
      W.eyes('at', G.aidan);
      await G.say('WAI', C3_waiTalkLine(G));
    } finally {
      W.look(null); W.eyes('ahead');
      if (W.raw) W.raw.idleLife = true;
    }
  }
  // where Wai is in the hall (rebuilt on entry): at his board, waiting by the frame doors, or gone
  const waiAt = () => {
    if (!flag('c3_fused')) return 'board';
    if (!done('cs:3-2')) return 'doors';
    if (!flag('c3_bossDone')) return 'gone';
    return flag('waiSaved') ? 'board' : 'lost';
  };
  const hallCams = [
    // the long symmetrical shot from the east end, down the centre aisle to Wai's lit board and the frame doors (it tilts
    // down to Aidan only when he is right under it, at the end of the aisle)
    { id: 'c3_hall:long', vol: [9.6, 4.66, 37, 8.6], type: 'pan', pos: [39.35, 3.25, HL.mid], target: [4.0, 1.25, HL.mid], fov: 34, pan: { lag: 0.45, yaw: 10, pitch: 46 } },
    // the east end (the cross aisle: foyer door, stairs, payphone, the supervisor's desk), from high over the ends of
    // the rows, looking back down on it — from anywhere further into the hall the ends of the boards hide its corners
    { id: 'c3_hall:east', vol: [37, 0, 40, 14], type: 'pan', pos: [36.5, 4.7, HL.mid], target: [39.0, 0.8, HL.mid], fov: 52, pan: { lag: 0.35, yaw: 78, pitch: 55 } },
    // the side aisles (the boards hide them from anywhere else), each shot down its length from both ends: the east
    // halves from the cross aisle (the records door, a Tethered at the boards) …
    { id: 'c3_hall:north', vol: [20, 0, 37, 2.98], pri: 1, type: 'pan', pos: [38.3, 2.9, 1.55], target: [20, 0.9, 1.45], fov: 40, pan: { lag: 0.35, yaw: 36, pitch: 44 } },
    { id: 'c3_hall:south', vol: [20, 10.28, 37, 14], pri: 1, type: 'pan', pos: [38.3, 2.9, 11.6], target: [20, 0.9, 11.6], fov: 40, pan: { lag: 0.35, yaw: 36, pitch: 44 } },
    // the west end from high over Wai's end of the centre aisle: the lamp panel, the frame doors, the ends of the rows
    { id: 'c3_hall:west', vol: [0, 0, 9.6, 14], type: 'pan', pos: [9.5, 4.6, HL.mid], target: [1.0, 0.9, HL.mid], fov: 52, pan: { lag: 0.35, yaw: 80, pitch: 55 } },
    // … and the west halves from the frame-doors end, looking back east along them
    { id: 'c3_hall:westN', vol: [3, 0, 20, 2.98], pri: 1, type: 'pan', pos: [0.5, 3.0, 1.45], target: [20, 0.9, 1.45], fov: 40, pan: { lag: 0.35, yaw: 36, pitch: 46 } },
    { id: 'c3_hall:westS', vol: [3, 10.28, 20, 14], pri: 1, type: 'pan', pos: [0.5, 3.0, 11.8], target: [20, 0.9, 11.6], fov: 40, pan: { lag: 0.35, yaw: 36, pitch: 46 } },
    // close static at Wai's board
    { id: 'c3_hall:wai', vol: [5.8, 4.66, 9.6, 7.8], pri: 1, type: 'static', pos: [13.9, 2.2, 7.95], target: [6.9, 1.05, 5.1], fov: 'fit' },
  ];
  defineRoom({
    id: 'c3_hall', name: "OPERATORS' HALL", area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'lino', ambient: 'hum',
    fog: { density: 0.026, color: '#39423f' }, outageFog: { density: 0.03, color: '#17312e' },
    bounds: [0, 0, 40, 14],
    entries: { foyer: [38.9, HL.mid, -90], records: [22, 0.95, 0], canteen: [38.6, 13.1, 180], stairs: [39.0, 1.6, -90], frame: [1.05, HL.mid, 90], start: [38.9, HL.mid, -90] },
    cameras: hallCams,
    spawns: [
      // Tethered ×2 in the side aisles, each standing at a board as if waiting to be put through
      { id: 'c3_hall:tethN', type: 'tethered', pos: [18.6, 1.35], rot: 0, anchor: [18.6, 1.35] },
      { id: 'c3_hall:tethS', type: 'tethered', pos: [27.4, 11.75], rot: 180, anchor: [27.4, 11.75] },
    ],
    build(K) {
      const H = HL.H;
      K.floor(0, 0, 40, 14, { tex: 'lino', color: '#6e5e4a' });
      K.ceiling(0, 0, 40, 14, H, { tex: 'plaster', color: '#a9a595' });
      const up = { tex: 'plaster', color: '#bdb7a0' };
      // clerestory windows along the north wall (fog-grey night beyond)
      const clere = []; for (let x = 4; x < 38; x += 4.2) clere.push({ at: x, w: 2.2, h: 1.1, sill: 3.35, glass: true });
      K.wall(-0.075, 0, 40.075, 0, H, up, { openings: [{ at: 22.075, w: 1.0, h: 2.2 }, ...clere], skirting: true, grime: true });
      K.wall(40.075, 14, -0.075, 14, H, up, { openings: [{ at: 40.075 - 38.6, w: 1.0, h: 2.2 }], skirting: true, grime: true });
      K.wall(40, -0.075, 40, 14.075, H, up, { openings: [{ at: 1.675, w: 1.1, h: 2.2 }, { at: HL.mid + 0.075, w: 1.05, h: 2.25 }], skirting: true });
      K.wall(0, 14.075, 0, -0.075, H, up, { openings: [{ at: 14.075 - HL.fdZ, w: 1.84, h: 2.35 }], skirting: true });
      // the 1960s green-tiled dado round the walls (door gaps left bare)
      const dado = { tex: 'tile', color: '#5d7a66' };
      const dadoRun = (x0, z0, x1, z1, gaps) => {
        const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz, nz = ux;
        let a = 0;
        for (const [g0, g1] of [...gaps, [L, L]].sort((p, q2) => p[0] - q2[0])) {
          if (g0 - a > 0.1) { const c = (a + g0) / 2; K.box(x0 + ux * c + nx * 0.085, 0, z0 + uz * c + nz * 0.085, Math.abs(ux) > 0.5 ? g0 - a : 0.02, 1.45, Math.abs(ux) > 0.5 ? 0.02 : g0 - a, dado); }
          a = g1;
        }
      };
      dadoRun(0, 0, 40, 0, [[21.45, 22.55]]);
      dadoRun(40, 14, 0, 14, [[40 - 39.15, 40 - 38.05]]);
      dadoRun(40, 0, 40, 14, [[1.05, 2.15], [HL.mid - 0.6, HL.mid + 0.6]]);
      dadoRun(0, 14, 0, 0, [[14 - HL.fdZ - 0.98, 14 - HL.fdZ + 0.98]]);
      // ---- the switchboards ---------------------------------------------------------------------------------------------
      C3_rows(K, { waiLit: waiAt() !== 'lost' });
      // Wai's stool and the one beside it (where Aidan sits in 3-1)
      K.prop('stool', HL.wai[0], HL.wai[1], 180, { variant: 'operator' });
      K.prop('stool', HL.stool2[0], HL.stool2[1], 160, { variant: 'operator', name: 'c3h_stool2' });
      // Wai's board: its lamp (the exchange batteries keep it lit), Operator's Log 6 taped beneath, sticker05 under the shelf
      K.light('lamp', 7.3, 1.55, 5.05, { color: '#ffcf8a', intensity: 3.0, distance: 5.5, world: 'fog', name: 'c3h:waiLamp', on: waiAt() !== 'lost' });
      K.doc('oplog6', 6.62, 0.5, 4.6, { id: 'c3_hall:oplog6', model: 'paper', wall: true, rot: 0, r: 1.1, glint: 0.12 });
      K.sticker('sticker05', 7.98, 0.16, 4.6, 0, { size: 0.06 });
      const lost = waiAt() === 'lost';
      if (lost) {
        // the alternate: his headset on the empty stool, the note under it
        K.prop('headset', HL.wai[0], HL.wai[1] + 0.02, 20, { y: 0.7 });
        K.plane(HL.wai[0] + 0.05, 0.695, HL.wai[1] - 0.05, 0.12, 0.09, noteTex('wainote', 'Your mate went to the call centre. Heard phones. Good luck, mate.', { w: 256, h: 192, size: 20, y: 40 }), { rot: [-90, 0, 14] });
        K.examine(HL.wai[0] + 0.2, 0.9, HL.wai[1] + 0.3, async (G) => { await G.think('His headset. His note. [beat] "Good luck, mate."'); }, { id: 'c3h:wainote', r: 1.2 });
      }
      // Wai
      const wa = waiAt();
      if (wa === 'board') {
        const W = K.npc('wai', 'wai', HL.wai[0], HL.wai[1] - 0.02, 180, { talk: (G) => C3_waiTalk(G), r: 1.8 });
        if (W) { W.setAnim('work', { seated: true, seat: 0.64, blend: 0 }); try { W.wear('headset', true); } catch (e) { /* rig */ } C3_noCord(W); }
      } else if (wa === 'doors') {
        const W = K.npc('wai', 'wai', HL.doorsW[0], HL.doorsW[1], 125, { talk: (G) => C3_waiTalk(G), r: 1.8 });
        if (W) { W.setAnim('idle', { blend: 0 }); try { W.hold('R', 'candybar'); W.armPose('R', 'phone_look'); } catch (e) { /* rig */ } C3_noCord(W); }
      }
      // ---- the west wall: the frame-hall doors (a maglock on HALL), the circuit lamp panel, a big stopped clock ----------
      // (rot 90: the door's local +x is world −z, so the outer hinges are 'right' on the north leaf and 'left' on the south)
      for (const [z, hinge, leaf] of [[HL.fdZ - 0.46, 'right', 'A'], [HL.fdZ + 0.46, 'left', 'B']]) {
        K.door({ id: 'c3_hall:frame' + leaf, x: 0, z, rot: 90, w: 0.9, style: 'metal', hinge, to: 'c3_frame', entry: 'hall', color: '#5a6660',
          when: () => flag('c3_fused') && done('cs:3-2') });
      }
      K.box(0.1, 2.36, HL.fdZ, 0.1, 0.07, 0.42, { tex: 'metal', color: '#8d9594' });                   // the maglock
      K.light('led', 0.17, 2.34, HL.fdZ + 0.12, { color: '#2aff5a', intensity: 2.5, name: 'c3h:maglock', on: circOn('HALL') });
      K.light('led', 0.17, 2.34, HL.fdZ + 0.18, { color: '#ff2a1c', intensity: 1.2, name: 'c3h:maglockOff', on: !circOn('HALL') });
      K.sign('FRAME ROOM\nAUTHORISED STAFF ONLY', 0.09, 2.75, HL.fdZ, 1.4, 0.36, { rotY: 90, style: 'warning' });
      K.interact(0.8, 1.2, HL.fdZ, async (G) => {
        G.sfx('door_locked', { pos: [0.1, 1.1, HL.fdZ], vol: 0.8 });
        await G.msg('It\'s locked.');
        if (G.once('c3:frameLocked')) { await G.think('A maglock. [beat] There\'s no power to it.'); note(G, 'The frame room\'s locked. No power to the maglock.', 'c3_frame'); }
      }, { id: 'c3_hall:framelocked', r: 1.3, when: () => !flag('c3_fused') });
      K.interact(0.8, 1.2, HL.fdZ, (G) => C3_impacted(G), { id: 'c3_hall:frameopen', r: 1.3, when: () => flag('c3_fused') && !done('cs:3-2') });
      K.trigger([0.2, 5.6, 1.4, 7.7], (G) => C3_impacted(G), { id: 'c3_hall:impacted', when: () => flag('c3_fused') && !done('cs:3-2') });
      K.prop('lamp_panel', 0.08, 4.05, 90, { mount: 1.75, labels: ['HALL', 'FRAME', 'RECORDS', 'BASEMENT', 'CANTEEN', 'MAST'], cols: 3, name: 'c3h_panel', lit: CIRC.filter((c) => circOn(c)).map((c) => (c === 'MAST FEED' ? 'MAST' : c)) });
      K.sign('CIRCUITS', 0.09, 2.2, 4.05, 0.42, 0.1, { rotY: 90, style: 'plaque' });
      K.prop('clock', 0.08, 11.2, 90, { mount: 3.1, time: [2, 0] });
      K.prop('extinguisher', 0.08, 2.3, 90, { variant: 'wall' });
      // ---- the east wall: the foyer door, the stairs, the payphone, the supervisor's desk --------------------------------
      K.door({ id: 'c3_hall:foyer', x: 40, z: HL.mid, rot: -90, w: 0.95, style: 'wood', to: 'c3_foyer', entry: 'hall', color: '#b89a72', sign: 'FOYER' });
      K.door({ id: 'c3_hall:stairs', x: 40, z: 1.6, rot: -90, w: 1.0, style: 'fire', to: 'c3_stairs', entry: 'top', sign: 'STAIRS — BASEMENT' });
      K.door({ id: 'c3_hall:records', x: 22, z: 0, rot: 180, w: 0.9, style: 'wood', to: 'c3_records', entry: 'door', color: '#a88a64', sign: 'RECORDS' });
      K.door({ id: 'c3_hall:canteen', x: 38.6, z: 14, rot: 0, w: 0.9, style: 'wood', to: 'c3_canteen', entry: 'door', color: '#a88a64', sign: 'CANTEEN' });
      const pay = K.payphone(39.92, 11.5, -90, { wall: true, id: 'c3_hall:payphone' });
      if (pay && pay.obj && pay.obj.userData.setHanging) pay.obj.userData.setHanging(true);
      K.prop('exit_sign', 39.92, HL.mid, -90, { mount: 2.6 });
      K.prop('exit_sign', 39.92, 1.6, -90, { mount: 2.6, text: 'STAIRS' });
      K.prop('clock', 39.92, 4.1, -90, { mount: 3.0, time: [2, 0] });
      K.prop('desk', 39.1, 4.15, -90, { variant: 'office' });
      K.prop('office_chair', 38.35, 4.2, 80, {});
      K.prop('rotary_phone', 39.35, 3.75, -70, { y: 0.745, color: '#cfc3a4' });
      K.prop('desk_lamp', 39.45, 4.6, -120, { y: 0.745, lit: false });
      K.prop('mug', 38.9, 4.5, 30, { y: 0.745, text: 'SUPERVISOR' });
      K.plane(38.95, 0.75, 3.95, 0.42, 0.3, noteTex('suplog', 'Night supervisor —\n2:04  L27 lit again\n2:05  answered (M.)\n2:31  cleared', { w: 320, h: 240, lines: true, size: 18, y: 30 }), { rot: [-90, 0, -8] });
      // the tea trolley, left at the end of the aisle
      K.box(37.9, 0, 9.6, 0.9, 0.08, 0.5, { tex: 'metal', color: '#b8bdb8' }); K.box(37.9, 0.75, 9.6, 0.9, 0.04, 0.5, { tex: 'metal', color: '#b8bdb8' });
      for (const [sx, sz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) K.cyl(37.9 + sx, 0.04, 9.6 + sz, 0.012, 0.75, { tex: 'metal', color: '#b8bdb8' });
      K.collider(37.4, 9.3, 38.4, 9.9, { h: 0.9 });
      for (let i = 0; i < 5; i++) K.prop('mug', 37.6 + (i % 3) * 0.22, 9.5 + Math.floor(i / 3) * 0.2, i * 60, { y: 0.79, color: '#e8e2d0' });
      K.cyl(38.2, 0.79, 9.7, 0.1, 0.34, { tex: 'metal', color: '#c9ccc6', metalness: 0.6, roughness: 0.3 });   // the urn
      // the noticeboard at the east end of the north wall
      K.prop('corkboard', 35.2, 0.075, 0, { w: 1.3, h: 0.9, mount: 1.6, roster: true });
      K.plane(35.45, 1.55, 0.1, 0.24, 0.3, noteTex('cupsnote', 'PLEASE do not leave cups on the key shelf.\n— Mgmt', { w: 256, h: 320, size: 20, y: 44 }), {});
      K.writing('WHO ARE YOU TRYING TO REACH', 39.9, 3.4, 9.2, 3.2, { rotY: -90 });
      K.writing('DID YOU CHECK', 20.2, 1.9, 0.09, 1.5, { rotY: 0 });
      // ---- the HALL circuit's pendant lamps; the clerestory's fog light ------------------------------------------------------
      const hallOn = circOn('HALL');
      HL_PEND.forEach(([x, z, real], i) => {
        K.cyl(x, 3.72, z, 0.012, H - 3.72, { tex: 'metal', color: '#4a4e4a' });
        K.cyl(x, 3.52, z, 0.32, 0.2, { tex: 'metal', color: '#2f4a3e', roughness: 0.4 }, { r2: 0.06, open: true });
        K.light('led', x, 3.5, z, { color: '#ffd9a0', size: 0.055, intensity: 3, halo: 0.9, name: 'c3h:bulb' + i, on: hallOn, world: 'fog' });
        if (real) K.light('point', x, 3.3, z, { color: '#ffd4a0', intensity: 6, distance: 11, name: 'c3h:pend' + i, on: hallOn, world: 'fog', bank: 1 + (i % 4) });
      });
      K.light('point', 20, 4.3, 1.2, { color: '#8fa6a2', intensity: 1.4, distance: 9, real: true, bank: 2, name: 'c3h:clere' });
      K.light('point', 35.2, 4.3, 1.2, { color: '#8fa6a2', intensity: 2.2, distance: 10.5, bank: 3, name: 'c3h:clereE', world: 'fog' });
      K.light('point', 5.2, 4.3, 1.2, { color: '#8fa6a2', intensity: 1.8, distance: 9.5, bank: 4, name: 'c3h:clereW', world: 'fog' });
      // the grey through the fanlight over the foyer door washes the east wall: whoever walks there is a shape against it
      K.box(39.9, 2.3, HL.mid, 0.04, 0.34, 1.0, { color: '#9fb0ac', roughness: 0.2, emissive: '#3a4a47', emissiveIntensity: 0.6 });
      K.light('point', 39.3, 2.75, HL.mid, { color: '#93aaa6', intensity: 2.4, distance: 8, bank: 3, name: 'c3h:fanlight', world: 'fog' });
      K.light('led', 39.8, 2.66, HL.mid, { color: '#2aff5a', size: 0.02, intensity: 1.5 });
      // the STAIRS exit sign's green on the stairs door; the grey through the canteen's fanlight on the payphone corner
      K.light('point', 39.35, 2.45, 1.6, { color: '#3aff8a', intensity: 1.4, distance: 4.8, name: 'c3h:stairsGlow' });
      K.box(38.6, 2.3, 13.9, 1.0, 0.34, 0.04, { color: '#9fb0ac', roughness: 0.2, emissive: '#3a4a47', emissiveIntensity: 0.6 });
      K.light('point', 38.6, 2.6, 13.3, { color: '#93aaa6', intensity: 2.0, distance: 7, bank: 3, name: 'c3h:canteenFan', world: 'fog' });
      // ---- the Outage (3-2, briefly): receipt paper hanging down the centre aisle, tethers, red lamps ---------------------------
      K.outageOnly(() => {
        for (let i = 0; i < 9; i++) K.prop('receipt_strip', 3 + i * 3.6, HL.mid + (i % 2 ? 0.9 : -0.8), i * 20, { ceil: H, len: 2.2 + (i % 3) * 0.8 });
        for (let i = 0; i < 6; i++) K.prop('tether_hanging', 8 + i * 5.2, i % 2 ? 1.4 : 11.9, 0, { ceil: H, len: 2.4 });
        for (let i = 0; i < 5; i++) K.prop('contract_stack', 1.8 + (i % 2) * 0.5, 9.6 + i * 0.6, i * 23, { h: 0.9 + (i % 3) * 0.3 });
        K.light('point', 3.2, 2.4, HL.mid, { color: '#ff3322', intensity: 3.5, distance: 8, name: 'c3h:outred', flicker: true });
        K.light('point', 22, 3.0, HL.mid, { color: '#1f6f6a', intensity: 3.0, distance: 12 });
        K.writing('FOLLOW UP TOMORROW', 0.09, 3.3, 10.2, 2.6, { rotY: 90, world: 'outage' });
        K.dress('receipts', [1, 4.8, 36, 8.4], 30, { seed: 361 });
      });
      K.dress('papers', [1, 0.3, 37, 2.5], 10, { seed: 362 });
      K.dress('papers', [1, 5.3, 36, 7.9], 8, { seed: 363 });
      K.dress('cups', [36.5, 0.4, 39.6, 13.5], 5, { seed: 364 });
      // ---- examine --------------------------------------------------------------------------------------------------------
      K.examine(14, 1.3, 5.2, ['Hundreds of little holes. [beat] Every one of them was somebody\'s line.', 'The cords are still up in some of them. Calls nobody ever cleared.'], { id: 'c3h:boards', r: 1.3 });
      K.examine(26.5, 1.3, 8.2, ['Headsets on hooks, one at every position. Like everyone just stepped out.', 'A cup on the key shelf. Lipstick on the rim.'], { id: 'c3h:headsets', r: 1.3 });
      K.examine(0.5, 1.7, 4.05, async (G) => {
        const on = CIRC.filter((c) => circOn(c));
        if (!on.length) await G.think('A panel of little lamps. HALL. FRAME. RECORDS. BASEMENT. CANTEEN. MAST. [beat] All dark.');
        else await G.think('The circuit lamps. [beat] ' + on.map((c) => (c === 'MAST FEED' ? 'MAST' : c)).join(', ') + (on.length > 1 ? '. Lit.' : '. Lit, on its own.'));
      }, { id: 'c3h:panel', r: 1.3 });
      K.examine(38.95, 0.95, 3.9, ['The night supervisor\'s log. "Two-oh-four. L27 lit again."', '"Answered." [beat] Somebody always answered.'], { id: 'c3h:suplog', r: 1.2 });
      K.examine(37.9, 1.0, 9.6, 'The tea trolley. Cups set out for a break nobody took.', { id: 'c3h:trolley', r: 1.3 });
      K.examine(35.2, 1.6, 0.6, ['The roster on the board. Every night shift has a name. [beat] Most of them start with M.', '"Please do not leave cups on the key shelf."'], { id: 'c3h:roster', r: 1.3 });
      K.examine(20, 2.6, 0.7, 'High windows. Nothing out there but grey.', { id: 'c3h:windows', r: 2.0 });
      K.examine(0.4, 3.1, 11.2, 'Two o\'clock. [beat] Every clock in here says two o\'clock.', { id: 'c3h:clock', r: 2.2 });
      K.examine(33, 1.1, 12.3, 'A stool pushed back from the board, turned toward the door. Like she heard someone come in.', { id: 'c3h:stool', r: 1.2 });
    },
    async onEnter(G, from) {
      if (!done('cs:3-1') && from === 'c3_foyer') { await G.cutscene('3-1'); return; }
      if (!done('cs:3-1')) return;
      if (from === 'c3_stairs' && flag('c3_fused') && !done('cs:3-2') && G.once('c3:upFused')) {
        await G.wait(0.6);
        await G.think('The lights are on. [beat] The frame room.');
      }
    },
    onUpdate() { C3_ambient(['#6a7774', 0.44], ['#2a8a84', 0.34]); },
    onLeave() { C3_ambientOff(); },
  });

  // =================================================================================================================
  // 3E THE RECORDS ROOM — 10 × 8 m, door south (x 5). Cabinets down both walls, binders to the ceiling on the north
  // wall, a table of dockets. The LOGS drawer (west wall) holds Operator's Logs 1–3; the drawer labelled AIDAN (east
  // wall) holds Account Note 4. RECORDS circuit: dark unless switched on at the board.
  // =================================================================================================================
  const RC = { H: 3.2, logs: [0.36, 2.6], aidan: [9.64, 4.4] };
  defineRoom({
    id: 'c3_records', name: 'RECORDS ROOM', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'lino', ambient: 'hum',
    fog: { density: 0.034, color: '#343d3b' },
    bounds: [0, 0, 10, 8],
    entries: { door: [5, 7.1, 180], start: [5, 7.1, 180] },
    cameras: [
      // static from the doorway, looking in along the cabinets
      { id: 'c3_records:doorway', vol: [0, 0, 10, 3.6], type: 'static', pos: [5.3, 2.35, 7.75], target: [4.8, 0.55, 0.9], fov: 'fit' },
      // from the far corner back toward the door
      { id: 'c3_records:back', vol: [0, 3.6, 10, 8], type: 'static', pos: [0.45, 2.95, 0.45], target: [6.2, 0.4, 6.4], fov: 'fit' },
      // a high corner looking down on the drawer labelled AIDAN
      { id: 'c3_records:drawer', vol: [6.6, 2.4, 10, 6.6], pri: 1, type: 'static', pos: [1.6, 3.05, 7.6], target: [9.3, 0.7, 4.4], fov: 'fit' },
      // across the table to the operators' log cabinet on the west wall
      { id: 'c3_records:logs', vol: [0, 0.9, 3.2, 4.4], pri: 1, type: 'static', pos: [8.9, 2.9, 7.3], target: [0.9, 0.85, 2.6], fov: 'fit' },
    ],
    build(K) {
      const H = RC.H;
      K.roomBox(0, 0, 10, 8, { h: H, floor: { tex: 'lino', color: '#5e5446' }, wall: { tex: 'plaster', color: '#b9b29a' }, ceiling: { tex: 'ceiling_tile', color: '#a8a492' }, doors: [{ side: 's', at: 5, w: 1.0 }], skirting: '#4a3e30' });
      K.door({ id: 'c3_records:door', x: 5, z: 8, rot: 0, w: 0.9, style: 'wood', to: 'c3_hall', entry: 'records', color: '#a88a64', sign: 'RECORDS', signBack: 'HALL' });
      // the binders, floor to ceiling, along the north wall
      K.prop('binders_shelf', 2.6, 0.3, 0, { len: 4.6, h: 2.6 });
      K.prop('binders_shelf', 7.6, 0.3, 0, { len: 4.0, h: 2.6 });
      // filing cabinets down the west wall (the LOGS cabinet among them)
      const on = circOn('RECORDS');
      for (let i = 0; i < 6; i++) {
        const z = 1.4 + i * 0.52;
        if (Math.abs(z - RC.logs[1]) < 0.3) continue;
        K.prop('filing_cabinet', 0.36, z, 90, { n: 4, seed: 500 + i });
      }
      const logsOpen = done('c3:logs');
      K.prop('filing_cabinet', RC.logs[0], RC.logs[1], 90, { n: 4, labels: ['EXCH. 1961', "OPS' LOG 61–71", "OPS' LOG 72–79", "OPS' LOG 80–87"], name: 'c3r_logs', open: logsOpen ? 1 : undefined });
      // down the east wall; the one with a drawer that shouldn't exist
      for (let i = 0; i < 6; i++) {
        const z = 1.5 + i * 0.52;
        if (Math.abs(z - RC.aidan[1]) < 0.3) continue;
        K.prop('filing_cabinet', 9.64, z, -90, { n: 4, variant: i === 5 ? 'lateral' : undefined, seed: 520 + i });
      }
      const aidanOpen = done('c3:aidanDrawer');
      K.prop('filing_cabinet', RC.aidan[0], RC.aidan[1], -90, { n: 4, labels: ['ACCTS 1984', 'ACCTS 1985', 'AIDAN', 'ACCTS 1987'], name: 'c3r_aidan', open: aidanOpen ? 2 : undefined, color: '#8f978f' });
      // the table of dockets, a microfiche reader, a desk lamp; boxes on the floor; a step ladder
      K.prop('table', 5, 3.9, 0, { variant: 'folding', w: 2.2, d: 0.8 });
      K.prop('crt', 4.4, 3.75, 10, { y: 0.74, content: 'off' });
      K.prop('desk_lamp', 5.8, 3.7, -30, { y: 0.74, lit: on, light: false });
      K.prop('chair', 5.1, 4.65, 170, { variant: 'timber' });
      for (let i = 0; i < 6; i++) K.plane(5.2 + (i % 3) * 0.24, 0.745 + i * 0.002, 3.95 + Math.floor(i / 3) * 0.2, 0.2, 0.14, noteTex('docket' + (i % 3), ['FAULT DOCKET\nL27 — no line\nNFF', 'FAULT DOCKET\nL27 — spare\ncaller persists', 'FAULT DOCKET\nL27 — see log'][i % 3], { w: 192, h: 128, size: 14, y: 26, bg: '#e8d8a0' }), { rot: [-90, 0, (i * 17) % 30 - 15] });
      K.prop('box_stack', 8.2, 6.9, 20, { n: 4 });
      K.prop('box', 1.5, 6.9, -10, { text: 'DOCKETS 1986', open: true });
      K.prop('box', 2.1, 7.3, 30, { text: 'DO NOT DESTROY' });
      K.box(8.8, 0, 1.3, 0.5, 1.5, 0.12, { tex: 'metal', color: '#8d9594' });
      K.prop('water_stain', 6.5, 0.3, 0, { surface: 'ceiling', ceil: H });
      K.box(9.93, 2.35, 6.6, 0.04, 0.5, 0.9, { tex: 'grille', color: '#8d9594' });
      K.light('point', 9.2, 2.6, 6.6, { color: '#8fa6a2', intensity: 1.6, distance: 7, name: 'c3r:vent' });
      // lights: the RECORDS circuit (off unless switched on at the board)
      K.prop('fluoro_tube', 3, 4, 0, { h: H - 0.02, lightName: 'c3r:tube1', lit: on, bank: 1 });
      K.prop('fluoro_tube', 7, 4, 0, { h: H - 0.02, lit: on, light: false, flicker: true });
      K.dress('papers', [1.2, 1.2, 8.8, 7.2], 16, { seed: 371 });
      // ---- the logs drawer: Operator's Logs 1–3 --------------------------------------------------------------------------
      K.interact(RC.logs[0] + 0.7, 1.0, RC.logs[1], async (G) => {
        const cab = G.obj('c3r_logs');
        if (!done('c3:logs')) {
          G.sfx('handle', { pos: [RC.logs[0] + 0.4, 1.0, RC.logs[1]], vol: 0.6 });
          if (cab && cab.userData.setDrawer) { let k = 0; await G.loop((dt) => { k = Math.min(1, k + dt / 0.5); cab.userData.setDrawer(1, U.ease.inOut(k)); return k >= 1; }); }
          S.done['c3:logs'] = true;
          await G.think('The operators\' log. [beat] Handwritten.');
        }
        await G.doc('oplog1', { id: 'c3_records:oplog1' });
        await G.doc('oplog2', { id: 'c3_records:oplog2' });
        await G.doc('oplog3', { id: 'c3_records:oplog3' });
      }, { id: 'c3_records:logs', r: 1.2 });
      // ---- the drawer labelled AIDAN: Account Note 4 --------------------------------------------------------------------------
      K.interact(RC.aidan[0] - 0.7, 1.0, RC.aidan[1], async (G) => {
        const cab = G.obj('c3r_aidan');
        if (!done('c3:aidanDrawer')) {
          await G.think('A drawer with my name on it. [beat] This place closed before I was born.');
          G.sfx('handle', { pos: [RC.aidan[0] - 0.4, 0.8, RC.aidan[1]], vol: 0.6 });
          if (cab && cab.userData.setDrawer) { let k = 0; await G.loop((dt) => { k = Math.min(1, k + dt / 0.7); cab.userData.setDrawer(2, U.ease.inOut(k)); return k >= 1; }); }
          S.done['c3:aidanDrawer'] = true;
        }
        const first = !(S.docs && S.docs.acct4 && S.docs.acct4.read);
        await G.doc('acct4', { id: 'c3_records:acct4' });
        if (first && G.once('c3:acct4said')) {
          if (G.aidan.raw) { G.aidan.raw.idleLife = false; G.aidan.raw.eyes('down'); }
          await G.wait(0.6);
          await G.say('AIDAN', '\'Check alarm compat.\' [long beat] I wrote that.');
          if (G.aidan.raw) { G.aidan.raw.idleLife = true; G.aidan.raw.eyes('ahead'); }
        }
      }, { id: 'c3_records:aidan', r: 1.2 });
      // ---- examine --------------------------------------------------------------------------------------------------------------
      K.examine(2.6, 1.6, 0.9, ['Binders. Years of them. Traffic figures, fault dockets, rosters.', 'Nineteen eighty-seven is the last one. After that the shelf is just dust.'], { id: 'c3r:binders', r: 1.5 });
      K.examine(5.4, 0.95, 3.9, ['Fault dockets. Three of them for lamp twenty-seven.', '"No line." "Spare." "Caller persists." [beat] Then nothing.'], { id: 'c3r:dockets', r: 1.3 });
      K.examine(4.4, 1.0, 3.6, 'A microfiche reader. Screen dark. There\'s still a card in it.', { id: 'c3r:fiche', r: 1.1 });
      K.examine(2.1, 0.5, 7.0, '"DO NOT DESTROY." [beat] Somebody cared about this, once.', { id: 'c3r:boxes', r: 1.2 });
      K.examine(9.2, 1.2, 2.6, 'Cabinet after cabinet of account records. A lot of them aren\'t even from here.', { id: 'c3r:cabinets', r: 1.2 });
      K.examine(8.8, 1.0, 1.55, 'A step ladder folded against the shelves. For the top row of binders. [beat] Nobody\'s needed the top row in a long time.', { id: 'c3r:ladder', r: 1.1 });
      K.examine(9.5, 2.0, 6.6, 'A vent. Cold air comes through it, and the hum from the hall.', { id: 'c3r:vent', r: 1.4 });
    },
    onUpdate() { C3_ambient(['#5f6b69', 0.4], ['#2a8a84', 0.28]); },
    onLeave() { C3_ambientOff(); },
  });

  // =================================================================================================================
  // 3F THE CANTEEN — 10 × 8 m, door north (x 8.6). The servery down the west wall, the break table, the noticeboard
  // (Operator's Log 4), the fire extinguisher by the door, coffee. CANTEEN circuit: dark unless switched on.
  // =================================================================================================================
  const CT = { H: 3.0, door: 8.6 };
  defineRoom({
    id: 'c3_canteen', name: 'CANTEEN', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'lino', ambient: 'hum',
    fog: { density: 0.034, color: '#363f3d' },
    bounds: [0, 0, 10, 8],
    entries: { door: [CT.door, 0.95, 0], start: [CT.door, 0.95, 0] },
    cameras: [
      // wide from the servery corner
      { id: 'c3_canteen:servery', vol: [3.8, 0, 10, 8], type: 'static', pos: [0.55, 2.65, 0.55], target: [7.2, 0.45, 5.4], fov: 'fit' },
      // low at the table, across the room to the servery
      { id: 'c3_canteen:table', vol: [0, 0, 3.8, 8], type: 'static', pos: [9.4, 0.95, 7.55], target: [1.2, 1.1, 2.8], fov: 'fit' },
      // the door end from the kitchen corner: the extinguisher on its bracket, the noticeboard
      { id: 'c3_canteen:door', vol: [6.6, 0, 10, 4.1], pri: 1, type: 'static', pos: [1.3, 2.55, 7.4], target: [9.2, 0.95, 1.9], fov: 'fit' },
      // high over the servery's end, down on the break table and its crossword
      { id: 'c3_canteen:break', vol: [4.2, 4.1, 8.6, 8], pri: 1, type: 'static', pos: [0.9, 2.5, 0.9], target: [6.4, 0.55, 5.9], fov: 'fit' },
    ],
    build(K) {
      const H = CT.H;
      K.roomBox(0, 0, 10, 8, { h: H, floor: { tex: 'lino', color: '#7a6a52' }, wall: { tex: 'plaster', color: '#c9bf9e' }, ceiling: { tex: 'ceiling_tile', color: '#b0ab98' }, doors: [{ side: 'n', at: CT.door, w: 1.0 }], windows: [{ side: 's', at: 4.5, w: 2.4, h: 1.1, sill: 1.1 }], skirting: '#5a4a3a' });
      K.door({ id: 'c3_canteen:door', x: CT.door, z: 0, rot: 180, w: 0.9, style: 'wood', to: 'c3_hall', entry: 'canteen', color: '#a88a64', sign: 'CANTEEN', signBack: 'HALL' });
      const on = circOn('CANTEEN');
      // the servery down the west wall: urn, cups, a cake tin, the tea roster
      K.prop('counter', 0.6, 3.6, 90, { len: 4.2, variant: 'servery' });
      K.cyl(0.55, 1.0, 2.2, 0.16, 0.46, { tex: 'metal', color: '#c9ccc6', metalness: 0.6, roughness: 0.3 });
      K.cyl(0.55, 1.46, 2.2, 0.06, 0.05, { color: '#1a1a1a' });
      for (let i = 0; i < 6; i++) K.prop('mug', 0.45 + (i % 2) * 0.16, 3.0 + Math.floor(i / 2) * 0.18, i * 50, { y: 1.0, color: ['#e8e2d0', '#d8c9a0', '#9ab0b4'][i % 3], text: i === 0 ? 'M' : undefined });
      K.cyl(0.55, 1.0, 4.6, 0.13, 0.12, { tex: 'metal', color: '#8a3a2a', roughness: 0.5 });
      K.pickup('coffee', 0.62, 1.0, 5.2, { id: 'c3_canteen:coffee', rot: 70 });
      K.plane(0.08, 1.7, 3.6, 0.4, 0.55, noteTex('tearoster', 'TEA ROSTER\nMon — June\nTue — Dot\nWed — Maureen\nThu — Beryl\nFri — M.', { w: 256, h: 352, lines: true, size: 20, y: 40 }), { rotY: 90 });
      // the kitchen corner: sink bench, fridge (door ajar), a radio on the sill
      K.prop('sink_bench', 3.2, 7.62, 180, { len: 2.2 });
      K.prop('fridge', 1.0, 7.45, 180, { variant: 'office' });
      K.box(5.5, 1.1, 7.93, 0.3, 0.16, 0.1, { color: '#6a4a36', roughness: 0.5 });
      // tables with ashtrays; chairs pushed back; the break table (the chapter's fifteen minutes)
      for (const [x, z, r0] of [[4.6, 2.2, 5], [6.8, 2.4, -8]]) {
        K.prop('table', x, z, r0, { variant: 'laminate' });
        K.prop('chair', x - 0.4, z - 0.7, r0 + 10, { variant: 'plastic', color: '#8a6a3a' });
        K.prop('chair', x + 0.5, z + 0.75, r0 + 190, { variant: 'plastic', color: '#8a6a3a' });
        K.cyl(x + 0.25, 0.745, z - 0.1, 0.07, 0.025, { tex: 'glass', color: '#b8c4c0', roughness: 0.2 });
      }
      K.breakTable(6.3, 5.3, 0, { id: 'c3_canteen:break', time: [2, 45] });
      K.prop('crossword', 6.1, 5.25, 12, { y: 0.745 });
      K.prop('mug', 6.6, 5.1, 40, { y: 0.745, text: 'World\'s Okayest Operator' });
      K.sticker('sticker06', 4.6, 0.715, 2.2, 0, { pitch: -90, size: 0.06 });
      // the noticeboard on the east wall: Operator's Log 4, a postcard, the NO SMOKING sign that came later
      K.prop('corkboard', 9.925, 3.2, -90, { w: 1.4, h: 0.9, mount: 1.5 });
      K.doc('oplog4', 9.86, 1.5, 3.25, { id: 'c3_canteen:oplog4', model: 'paper', wall: true, rot: -90, r: 1.2 });
      K.plane(9.87, 1.62, 2.75, 0.16, 0.11, noteTex('postcard', 'Wish you were here! x', { w: 192, h: 128, size: 18, y: 50, bg: '#cfe0e4' }), { rotY: -90 });
      K.sign('NO SMOKING\nBY ORDER 1985', 9.92, 2.3, 4.6, 0.46, 0.3, { rotY: -90, style: 'warning' });
      // the fire extinguisher on its bracket by the door (EXAMINE + pick it up in one press)
      const extTaken = !!(S.taken && S.taken['c3_canteen:extinguisher']);
      K.box(9.93, 0.95, 1.4, 0.04, 0.12, 0.1, { tex: 'metal', color: '#3a3f3d' });
      K.sign('FIRE\nEXTINGUISHER', 9.93, 1.95, 1.4, 0.3, 0.2, { rotY: -90, style: 'shop', bg: '#a3231b', fg: '#ffffff' });
      if (!extTaken) {
        const ext = Kit.itemModel('extinguisher');
        if (ext) { ext.position.set(9.83, 0.4, 1.4); ext.rotation.y = -Math.PI / 2; K.obj('c3c_ext', ext); K.mesh(ext, { name: 'c3c_ext' }); }
      }
      K.interact(9.3, 1.0, 1.4, async (G) => {
        if (S.taken['c3_canteen:extinguisher']) return;
        await G.think('Still charged. Nineteen seventy-something.');
        await Script.builtins.pickup(G, { id: 'c3_canteen:extinguisher', item: 'extinguisher', obj: G.obj('c3c_ext') });
      }, { id: 'c3_canteen:ext', r: 1.2, when: () => !(S.taken && S.taken['c3_canteen:extinguisher']) });
      // lights: the CANTEEN circuit, and a cold light through the window
      K.prop('fluoro_tube', 3.5, 4, 0, { h: H - 0.02, lit: on, bank: 1 });
      K.prop('fluoro_tube', 7, 4, 0, { h: H - 0.02, lit: on, light: false });
      K.light('point', 4.5, 1.9, 8.8, { color: '#9fb4b0', intensity: 1.8, distance: 6, bank: 2 });
      K.dress('cups', [3.6, 1.2, 9.0, 6.8], 4, { seed: 381 });
      K.dress('papers', [2.5, 0.6, 9.5, 7.5], 5, { seed: 382 });
      // ---- examine -------------------------------------------------------------------------------------------------------
      K.examine(0.9, 1.3, 2.2, 'The urn. Stone cold. [beat] Somebody filled it for a shift that never started.', { id: 'c3c:urn', r: 1.2 });
      K.examine(0.5, 1.7, 3.6, 'The tea roster. Monday June, Tuesday Dot, Wednesday Maureen. [beat] Friday just says "M."', { id: 'c3c:roster', r: 1.2 });
      K.examine(4.9, 0.9, 2.1, 'An ashtray, glass, full. They smoked in here right up until the sign went up.', { id: 'c3c:ashtray', r: 1.2 });
      K.examine(6.1, 0.9, 5.2, ['A crossword, half done. In pen.', 'Twelve across: "Hold the line." Nine letters. [beat] She never filled it in.'], { id: 'c3c:crossword', r: 1.2 });
      K.examine(9.9, 1.6, 2.75, 'A postcard from somewhere sunny. "Wish you were here!" [beat] Pinned up with everyone\'s rosters.', { id: 'c3c:postcard', r: 1.2 });
      K.examine(1.0, 1.2, 7.1, 'The fridge door\'s been left open a crack. Whatever was in there gave up years ago.', { id: 'c3c:fridge', r: 1.3 });
      K.examine(5.5, 1.3, 7.6, 'A transistor radio on the sill. Dial set between stations.', { id: 'c3c:radio', r: 1.2 });
    },
    onUpdate() { C3_ambient(['#5f6b69', 0.4], ['#2a8a84', 0.28]); },
    onLeave() { C3_ambientOff(); },
  });

  // a caged bulb on a conduit box (the basement's lights); name → G.light(name) for the real light and name+':b' the bulb
  function C3_cagedBulb(K, x, y, z, name, on, o = {}) {
    K.box(x, y + 0.08, z, 0.14, 0.06, 0.14, { tex: 'metal', color: '#6d726e' });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; K.cyl(x + Math.cos(a) * 0.075, y - 0.1, z + Math.sin(a) * 0.075, 0.005, 0.18, { tex: 'metal', color: '#3a3d3a' }); }
    K.light('led', x, y, z, { color: o.color || '#ffd9a0', size: 0.045, intensity: 3, halo: 0.8, name: name + ':b', on, world: o.world });
    if (o.real !== false) K.light('point', x, y - 0.12, z, { color: o.color || '#ffcf94', intensity: o.intensity ?? 3.2, distance: o.distance ?? 7, name, on, world: o.world, bank: o.bank ?? 1, flicker: o.flicker });
  }

  // =================================================================================================================
  // 3G THE STAIRWELL — 4 × 9 m, double height. The hall door at the top (north wall, y 0), one flight down (z 1.8…5.8)
  // to the basement landing (y −3, z 5.8…9): the fuse room door east, the cable vault door west. After the fuse board
  // is set, "Wai" stands on the landing in the dark, back to the camera, facing the wall (IN-ENGINE 3-3b).
  // =================================================================================================================
  // (the Borrowed stands in the landing's east half, back to the top camera: a player who comes out of the fuse room
  // and steps back from it steps back up the flight, not into the wall)
  const ST = { top: 0, low: -3.0, fuse: 6.7, vault: 6.7, borrowed: [3.55, 8.45] };
  const stairsCams = [
    // looking down the flight from the top: the landing, the two doors — and whatever stands there
    { id: 'c3_stairs:top', vol: [0, 3.9, 4, 9], type: 'static', pos: [2.0, 2.85, 0.32], target: [2.0, -3.05, 7.6], fov: 'fit' },
    // from high over the landing, up the flight to the door at the top
    { id: 'c3_stairs:landing', vol: [0, 0, 4, 2.4], type: 'static', pos: [2.9, 1.5, 8.7], target: [2.0, 0.5, 0.8], fov: 'fit' },
    // a low shot from the landing up the flight (spec §7B): the stairs climbing away into the dark
    { id: 'c3_stairs:low', vol: [0, 2.4, 4, 3.9], type: 'static', pos: [0.45, -2.35, 8.7], target: [2.3, -0.7, 2.6], fov: 'fit' },
    // the landing's west half, the vault door, from high in the corner at the foot of the flight
    { id: 'c3_stairs:vault', vol: [0, 5.8, 1.9, 9], pri: 1, type: 'pan', pos: [3.72, -0.65, 5.95], target: [0.6, -2.1, 7.4], fov: 50, pan: { lag: 0.3, yaw: 40, pitch: 28 } },
  ];
  defineRoom({
    id: 'c3_stairs', name: 'STAIRWELL', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'concrete', ambient: 'hum',
    fog: { density: 0.036, color: '#2f3836' },
    bounds: [0, 0, 4, 9],
    entries: { top: [2.0, 0.95, 0], landing: [3.35, ST.fuse, -90], vault: [0.65, ST.vault, 90], start: [2.0, 0.95, 0] },
    cameras: stairsCams,
    spawns: [
      // the Borrowed "Wai": on the landing, facing the wall; the engine's borrowed type does Talk / Examine / Step back
      { id: 'c3_stairs:borrowed', type: 'borrowed', disguise: 'wai', pos: ST.borrowed, rot: 0, anim: 'stand_still', when: (s) => !!(s.flags && s.flags.c3_fused) && s.chapter === 3 },
    ],
    build(K) {
      const wall = { tex: 'plaster', color: '#a9a38e' }, conc = { tex: 'concrete', color: '#8a8b84' };
      K.floor(0, 0, 4, 1.8, conc);
      K.stairs(0.12, 1.8, 3.88, 5.8, 0, ST.low, { axis: 'z', rail: 'both', mat: conc });
      K.floor(0, 5.8, 4, 9, { tex: 'concrete_wet', color: '#7a7c76' }, { y: ST.low });
      K.box(2, ST.low, 0.9, 4, 3.0, 1.8, conc);                                              // under the top landing
      K.ceiling(0, 0, 4, 9, 3.2, { tex: 'plaster', color: '#8f8b7c' });
      K.wall(-0.075, 0, 4.075, 0, 3.2, wall, { openings: [{ at: 2.075, w: 1.05, h: 2.2 }], skirting: true });
      K.wall(4, -0.075, 4, 9.075, 6.2, wall, { y: ST.low, openings: [{ at: ST.fuse + 0.075, w: 1.0, h: 2.2 }], grime: true });
      K.wall(0, 9.075, 0, -0.075, 6.2, wall, { y: ST.low, openings: [{ at: 9.075 - ST.vault, w: 1.0, h: 2.2 }], grime: true });
      K.wall(4.075, 9, -0.075, 9, 6.2, wall, { y: ST.low, grime: true });
      K.door({ id: 'c3_stairs:top', x: 2.0, z: 0, rot: 180, w: 1.0, style: 'fire', to: 'c3_hall', entry: 'stairs', sign: 'GROUND' });
      K.door({ id: 'c3_stairs:fuse', x: 4, z: ST.fuse, rot: -90, y: ST.low, w: 0.9, style: 'metal', to: 'c3_fuse', entry: 'door', sign: 'FUSE ROOM', color: '#6a7068' });
      K.door({ id: 'c3_stairs:vault', x: 0, z: ST.vault, rot: 90, y: ST.low, w: 0.9, style: 'metal', to: 'c3_vault', entry: 'door', sign: 'CABLE VAULT', color: '#6a7068' });
      // painted level letters, pipes and conduits running down the walls, a first aid cabinet
      K.plane(3.92, ST.low + 2.4, 8.2, 0.5, 0.6, signTex('levB', ['B'], { w: 128, h: 160, bg: '#c9c2aa', fg: '#8a2a22', size: 110, border: false, font: FN.heavy, age: 1.6 }), { rotY: -90 });
      K.plane(0.08, 1.9, 1.0, 0.4, 0.5, signTex('levG', ['G'], { w: 128, h: 160, bg: '#c9c2aa', fg: '#1f4a6b', size: 110, border: false, font: FN.heavy, age: 1.6 }), { rotY: 90 });
      for (const [x, r0, c] of [[0.18, 0.04, '#7a2a22'], [0.32, 0.025, '#8d9594'], [3.82, 0.035, '#8d9594']]) K.cyl(x, ST.low, 8.85, r0, 6.2, { tex: 'metal', color: c });
      K.cyl(3.84, ST.low, 0.2, 0.03, 6.2, { tex: 'metal', color: '#8d9594' });
      K.prop('first_aid_box', 0.08, 8.1, 90, { variant: 'wall', mount: 1.45, y: ST.low });
      K.prop('mop_bucket', 1.1, 8.5, 200, { y: ST.low });
      K.prop('exit_sign', 2.0, 0.075, 0, { mount: 2.45, text: 'EXIT' });
      K.prop('exit_sign', 0.075, ST.vault + 0.85, 90, { mount: 2.4, y: ST.low, text: 'EXIT' });
      K.light('point', 0.6, ST.low + 2.3, 7.7, { color: '#3aff8a', intensity: 1.5, distance: 5.6 });                // its glow on the landing
      K.writing('IT\'LL BE FINE', 3.92, ST.low + 1.5, 7.6, 1.4, { rotY: -90 });
      // lights: the top (on HALL), the landing (on BASEMENT)
      C3_cagedBulb(K, 2.0, 2.85, 1.0, 'c3s:top', circOn('HALL'), { intensity: 2.6, distance: 6 });
      C3_cagedBulb(K, 2.0, ST.low + 2.9, 7.4, 'c3s:landing', circOn('BASEMENT'), { intensity: 3.0, distance: 7 });
      K.dress('papers', [0.3, 6.0, 3.7, 8.8], 4, { seed: 391 });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(3.6, 1.0, 1.5, 'Mind the stairs, he said. [beat] They go down further than they should.', { id: 'c3s:top', r: 1.2 });
      K.examine(3.7, ST.low + 1.8, 8.2, 'B. Basement. Painted by hand, a long time ago.', { id: 'c3s:b', r: 1.4 });
      K.examine(0.5, ST.low + 1.4, 8.1, 'A first aid cabinet. Empty except for a roll of tape and a note: "WHO TOOK THE PANADOL".', { id: 'c3s:firstaid', r: 1.2 });
      K.examine(1.1, ST.low + 0.8, 8.5, 'A mop in a bucket of black water. The water\'s still moving.', { id: 'c3s:mop', r: 1.1 });
      K.examine(0.4, 0.9, 3.4, 'The handrail\'s worn smooth. Forty years of hands going down to fix something.', { id: 'c3s:rail', r: 1.3 });
      K.examine(3.9, ST.low + 1.5, 7.6, 'Someone wrote on the wall. [beat] It keeps turning up.', { id: 'c3s:writing', r: 1.3 });
    },
    async onEnter(G, from) {
      const e = G.enemy('c3_stairs:borrowed');
      // IN-ENGINE 3-3b: on the way back up from the fuse room — "Wai", on the landing, in the dark, facing the wall
      if (from === 'c3_fuse' && e && e.disguised && !e.resolved && G.once('c3:borrowedSeen')) {
        await G.run(async (G2) => {
          const A = G2.aidan;
          if (A.raw) A.raw.idleLife = false;
          // he turns to it and puts the light on it: a man's back, facing the wall, very still
          Player.setTorch(true);
          const [bx, bz] = ST.borrowed, p = Player.pos;
          await A.turn([bx, bz], 0.7);
          A.look([bx, ST.low + 1.6, bz]);
          await G2.wait(0.5);
          // over his right shoulder; the phone: no bars at all
          const L = Math.hypot(bx - p.x, bz - p.z) || 1, dx = (bx - p.x) / L, dz = (bz - p.z) / L;
          const cx = p.x - dx * 0.85 - dz * 0.4, cz = p.z - dz * 0.85 + dx * 0.4;
          G2.cam({ pos: [cx, ST.low + 1.72, cz], target: [bx, ST.low + 1.3, bz], fov: 44, to: { pos: [cx + dx * 0.25, ST.low + 1.7, cz + dz * 0.25], fov: 38 }, dur: 4 });
          await G2.wait(3.2);
          G2.camRelease();
          A.look(null);
          if (A.raw) A.raw.idleLife = true;
        }, { control: false, letterbox: false, skippable: true, name: 'c3:3-3b' });
      }
    },
    onUpdate() {
      const e = World.spawned && World.spawned.get('c3_stairs:borrowed');
      if (e && !e.disguised && !flag('c3_borrowedMet')) setFlag('c3_borrowedMet', true);
      C3_ambient(['#5a6664', 0.38], ['#2a8a84', 0.28]);
    },
    onLeave() { C3_ambientOff(); },
  });
  // "Afterward, AIDAN: 'It had his voice.' [beat] 'It had his voice.'"
  Bus.on('enemy:killed', (e) => {
    if (!e || e.id !== 'c3_stairs:borrowed') return;
    setFlag('c3_borrowedMet', true);
    Script.run(async (G) => {
      await G.wait(1.6);
      if (G.aidan.raw) { G.aidan.raw.eyes('down'); }
      await G.say('AIDAN', 'It had his voice. [beat] It had his voice.');
      if (G.aidan.raw) G.aidan.raw.eyes('ahead');
      note(G, 'Back up to the hall. The frame room.', 'c3_goal');
    }, { control: true, persist: true, name: 'c3:hisVoice', id: 'c3:hisVoice' });
  });

  // =================================================================================================================
  // 3H THE FUSE ROOM — 6 × 5 m, door west (z 2.5). The 1961 board on the east wall (x 5.925, z 2.3), Wai's note taped
  // beside it (and on Hard the watts spec sheet), the exchange battery rack, the workbench. GAMEPLAY 3-4: HALL + FRAME
  // (exactly 10 A) is the answer; over 10 A the main trips and the basement goes dark for 5 s while something moves.
  // The north wall is a cutaway for the camera over the board.
  // =================================================================================================================
  const FU = { H: 2.8, bx: 5.925, bz: 2.3, door: 2.5 };
  // the board's switch i in room coordinates (the board faces west: local +X → world +Z, local +Z → world −X)
  const fuseAt = (i, ly = 0, lz = 0.12) => { const col = i % 3, row = Math.floor(i / 3), lx = -0.34 + col * 0.34, y = 0.8 + 0.78 - row * 0.5; return [FU.bx - lz, y + ly, FU.bz + lx]; };
  const selTex = () => C3_tex('fusesel', 64, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(232,194,26,0.95)'; x.lineWidth = 5;
    const L = 16;
    for (const [a, b, dx, dy] of [[3, 3, 1, 1], [w - 3, 3, -1, 1], [3, h - 3, 1, -1], [w - 3, h - 3, -1, -1]]) { x.beginPath(); x.moveTo(a + dx * L, b); x.lineTo(a, b); x.lineTo(a, b + dy * L); x.stroke(); }
  });
  function fuseCircuits() {
    const hard = lvl() === 'hard';
    return CIRC.map((c) => {
      const load = hard ? ' ' : AMPS[c] + ' A';
      return c === 'MAST FEED' ? [c, load, 'DO NOT ENERGISE —\nMAST DECOMMISSIONED'] : [c, load];
    });
  }
  function fuseLights(G, list) {
    const on = list.includes('BASEMENT');
    for (const n of ['c3f:bulb', 'c3f:bulb:b']) { const l = G.light(n); if (l) l.on(on); }
  }
  // the overload: the main bangs out, every switch drops, the basement goes dark for five seconds — and something moves
  async function C3_trip(G) {
    const board = G.obj('c3f_board');
    const n = (S.done['c3:trips'] | 0) + 1;
    S.done['c3:trips'] = n;
    G.sfx('thud', { vol: 1.0, pos: [FU.bx, 1.2, FU.bz] });
    G.sfx('clunk', { vol: 1.0, pos: [FU.bx, 1.2, FU.bz] });
    G.sfx('static', { dur: 0.5, vol: 0.5 });
    G.shake(0.25, 0.4);
    if (board && board.userData) { try { board.userData.setMain(false); for (const c of CIRC) board.userData.setSwitch(c, false); if (lvl() !== 'hard') board.userData.setAmps(0); } catch (e) { /* board */ } }
    setCirc([]);
    fuseLights(G, []);
    const torch0 = !!Player.torchOn;
    try { Player.setTorch(false); } catch (e) { /* player */ }
    const sel = G.obj('c3f_sel'); if (sel) sel.visible = false;
    // pull back into the dark
    G.cam({ pos: [1.2, 1.9, 4.4], target: [5.4, 1.1, 2.0], fov: 50 });
    G.duck(0.5, 5);
    await G.wait(0.9);
    G.sfx('skitter', { pos: [-1.2, 0.2, 3.4], vol: 0.6 });
    await G.wait(0.9);
    for (let k = 0; k < 4; k++) { try { Snd.footstep('concrete', false, { pos: [-1.0 - k * 0.3, 0, 1.6 + k * 0.9], vol: 0.55 }); } catch (e) { /* audio */ } await G.wait(0.42); }
    G.sfx('creak', { pos: [0, 1.1, FU.door], vol: 0.7 });
    if (n === 1) { const door = G.door('c3_fuse:door'); if (door && door.rec && door.rec.setOpen) door.rec.setOpen(0.28); }
    await G.wait(0.8);
    G.sfx('breath', { n: 1, vol: 0.5, pos: [1.6, 1.5, 3.9] });
    if (n === 1) { const a = G.obj('c3f_stool'), b = G.obj('c3f_stoolDown'); if (a) a.visible = false; if (b) b.visible = true; S.done['c3:stoolDown'] = true; }
    await G.wait(0.9);
    // the main clunks back in by itself; everything else stays off
    G.sfx('clunk', { vol: 0.8, pos: [FU.bx, 1.2, FU.bz] });
    if (board && board.userData) { try { board.userData.setMain(true); } catch (e) { /* board */ } }
    await G.wait(0.25);
    try { Player.setTorch(true); } catch (e) { /* player */ }
    G.sfx('tube_flicker', { vol: 0.3, dur: 0.4 });
    await G.wait(0.5);
    if (!torch0) { /* he wants it on now */ }
    if (n === 1) await G.think('Too much. It tripped. [beat] Something was moving out there.');
    else if (n === 3) await G.think('Too much again. [beat] "Don\'t be greedy."');
    else await G.think('Too much.');
  }
  // the board-side view: pick a switch (left/right, up/down), throw it (E), step back (Esc / Q)
  async function C3_fuseBoard(G) {
    if (C3.fuseUI) return;
    const board = G.obj('c3f_board'), sel = G.obj('c3f_sel');
    const A = G.aidan;
    if (flag('c3_fused')) { await G.think('Hall and frame. Exactly ten. [beat] Leave it.'); return; }
    C3.fuseUI = true;
    try {
      A.place(5.05, 1.35, 90);
      A.pose('idle');
      if (A.raw) A.raw.idleLife = false;
      G.cam({ pos: [4.22, 1.58, 2.52], target: [5.92, 1.3, 2.28], fov: 36 });
      G.prompt('{left} {right} {up} {down}: choose a switch.  {interact}: throw it.  {cancel}: step back.', { id: 'c3_fuseui' });
      let i = C3.fuseSel ?? 0;
      const show = () => {
        if (!sel) return;
        const [x, y, z] = fuseAt(i, -0.07, 0.115);
        sel.position.set(x, y, z); sel.visible = true;
        A.look([x - 0.1, y, z]);
      };
      const label = () => { const c = CIRC[i]; try { UI.message(lvl() === 'hard' ? c : `${c} — ${AMPS[c]} A`, 1.4); } catch (e) { /* ui */ } };
      await G.until(() => !C3.fuseThought);                // (his first look at the board finishes before the labels)
      show(); label();
      for (;;) {
        let act = null;
        await G.loop(() => {
          if (typeof Menus !== 'undefined' && Menus.isOpen && Menus.isOpen()) return false;
          const P = (a) => Input.pressed(a);
          if (P('cancel') || P('decline')) { Input.consume('cancel'); Input.consume('decline'); act = 'back'; return true; }
          if (P('left')) { i = (i + 5) % 6; show(); label(); G.sfx('ui_move', { vol: 0.4 }); }
          else if (P('right')) { i = (i + 1) % 6; show(); label(); G.sfx('ui_move', { vol: 0.4 }); }
          else if (P('up') && i >= 3) { i -= 3; show(); label(); G.sfx('ui_move', { vol: 0.4 }); }
          else if (P('down') && i < 3) { i += 3; show(); label(); G.sfx('ui_move', { vol: 0.4 }); }
          if (P('interact')) { Input.consume('interact'); act = 'throw'; return true; }
          return false;
        }, { interactive: true });
        C3.fuseSel = i;
        if (act === 'back') break;
        const c = CIRC[i], list = circList(), turningOn = !list.includes(c);
        if (c === 'MAST FEED' && turningOn && G.once('c3:mastTag')) {
          if (sel) sel.visible = false;
          await G.think('A red tag on it. "DO NOT ENERGISE. MAST DECOMMISSIONED." [beat] Somebody meant that.');
          show();
          continue;
        }
        // throw it
        const [sx, sy, sz] = fuseAt(i, -0.13, 0.12);
        q(A.gesture('reach', { hand: 'R', target: [sx, sy, sz] }));
        await G.wait(0.3);
        G.sfx('clunk', { vol: 0.75, pos: [sx, sy, sz] });
        G.sfx('hit', { vol: 0.25, pos: [sx, sy, sz] });
        const next = turningOn ? [...list, c] : list.filter((k) => k !== c);
        if (board && board.userData) { try { board.userData.setSwitch(c, turningOn); } catch (e) { /* board */ } }
        const before = loadOf(list), after = loadOf(next);
        if (lvl() !== 'hard' && board && board.userData) {
          let k = 0;
          await G.loop((dt) => { k = Math.min(1, k + dt / 0.45); try { board.userData.setAmps(lerp(before, Math.min(after, 12), U.ease.out(k))); } catch (e) { /* board */ } return k >= 1; });
        } else await G.wait(0.35);
        if (after > 10) { await C3_trip(G); show(); continue; }
        setCirc(next);
        fuseLights(G, next);
        if (turningOn) G.sfx('tube_flicker', { vol: 0.2, dur: 0.3 });
        // HALL and FRAME only: exactly ten
        if (next.length === 2 && next.includes('HALL') && next.includes('FRAME')) {
          if (sel) sel.visible = false;
          G.set('c3_fused', true);
          G.sfx('maglock', { vol: 0.35 });
          await G.wait(0.4);
          G.sfx('clunk', { vol: 0.35 });
          await G.wait(0.8);
          await G.think('Exactly ten. [beat] Hall and frame.');
          noteDone('c3_fuse');
          note(G, 'The frame room. Back up to the hall.', 'c3_goal');
          break;
        }
      }
    } finally {
      C3.fuseUI = false;
      const s2 = G.obj('c3f_sel'); if (s2) s2.visible = false;
      if (A.raw) { A.raw.idleLife = true; A.raw.lookAt(null); }
      G.camRelease();
    }
  }
  defineRoom({
    id: 'c3_fuse', name: 'FUSE ROOM', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'concrete', ambient: 'hum',
    fog: { density: 0.036, color: '#2c3432' },
    bounds: [0, 0, 6, 5],
    entries: { door: [0.9, FU.door, 90], start: [0.9, FU.door, 90] },
    cameras: [
      // high in the corner over the battery rack, across to the board
      { id: 'c3_fuse:board', vol: [3.4, 0, 6, 5], type: 'static', pos: [1.2, 2.5, 0.9], target: [5.6, 1.0, 2.6], fov: 'fit' },
      // from the board end back to the doorway, the dark behind it
      { id: 'c3_fuse:doorway', vol: [0, 0, 3.4, 5], type: 'static', pos: [5.72, 2.35, 4.72], target: [0.4, 1.0, 2.3], fov: 'fit' },
      // through the cutaway north wall, over the battery jars: the middle of the room
      { id: 'c3_fuse:jars', vol: [1.4, 1.2, 4.4, 3.4], pri: 1, type: 'static', pos: [2.9, 2.35, -2.9], target: [2.9, 0.7, 2.7], fov: 'fit' },
      // the workbench and the stool, from high over the board
      { id: 'c3_fuse:bench', vol: [0.6, 3.4, 4.6, 5], pri: 1, type: 'pan', pos: [5.6, 2.45, 0.4], target: [2.6, 0.8, 4.2], fov: 46, pan: { lag: 0.3, yaw: 36, pitch: 26 } },
    ],
    build(K) {
      const H = FU.H, wall = { tex: 'plaster', color: '#a8a28c' };
      K.floor(0, 0, 6, 5, { tex: 'concrete', color: '#7e7f78' });
      K.ceiling(0, 0, 6, 5, H, { tex: 'concrete', color: '#8a8b84' });
      K.wall(-0.075, 0, 6.075, 0, H, wall, { both: false, skirting: true });
      K.wall(6, -0.075, 6, 5.075, H, wall, { grime: true });
      K.wall(6.075, 5, -0.075, 5, H, wall, { grime: true });
      K.wall(0, 5.075, 0, -0.075, H, wall, { openings: [{ at: 5.075 - FU.door, w: 1.0, h: 2.2 }] });
      K.door({ id: 'c3_fuse:door', x: 0, z: FU.door, rot: 90, w: 0.9, style: 'metal', to: 'c3_stairs', entry: 'landing', color: '#6a7068' });
      // ---- the 1961 board ------------------------------------------------------------------------------------------------
      const list = circList();
      K.box(FU.bx - 0.35, 0.005, FU.bz, 0.7, 0.02, 1.2, { color: '#151515', roughness: 0.95 });              // rubber mat
      K.prop('fuse_board', FU.bx, FU.bz, -90, { circuits: fuseCircuits(), on: list, main: true, amps: lvl() === 'hard' ? 0 : loadOf(list), name: 'c3f_board' });
      const sel = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.5), new THREE.MeshBasicMaterial({ map: selTex(), transparent: true, depthWrite: false, fog: false }));
      sel.rotation.y = -Math.PI / 2; sel.visible = false; sel.userData.ownedGeo = true; sel.renderOrder = 5;
      K.mesh(sel, { name: 'c3f_sel' });
      K.interact(5.2, 1.35, FU.bz, (G) => C3_fuseBoard(G), { id: 'c3_fuse:board', r: 1.3 });
      K.sign('DANGER\n415 VOLTS', FU.bx - 0.01, 2.35, 3.3, 0.36, 0.26, { rotY: -90, style: 'warning' });
      // Wai's note, taped beside the board (per riddle level); Easy: chalk ticks by HALL and FRAME; Hard: the spec sheet
      K.doc(pickDoc('fuse_note'), FU.bx - 0.01, 1.62, 3.08, { id: 'c3_fuse:note', model: 'sticky', wall: true, rot: -90, r: 1.2, glint: 0.1 });
      if (lvl() === 'easy') for (const i of [0, 1]) { const [x, y, z] = fuseAt(i, 0.04, 0.085); K.plane(x, y, z + 0.14, 0.1, 0.1, chalkTickTex(), { rotY: -90, transparent: true }); }
      if (lvl() === 'hard') {
        K.doc('fuse_spec_hard', FU.bx - 0.01, 1.45, 1.35, { id: 'c3_fuse:spec', model: 'paper', wall: true, rot: -90, r: 1.2 });
        const [ax, ay, az] = [FU.bx - 0.09, 1.87, FU.bz + 0.34];
        K.plane(ax, ay, az, 0.17, 0.17, noteTex('cracked', ' ', { w: 64, h: 64, bg: 'rgba(0,0,0,0)', size: 4 }), { rotY: -90, transparent: true, opacity: 0.2 });
        K.examine(ax - 0.5, ay, az, 'The ammeter glass is smashed. The needle\'s stuck on nothing.', { id: 'c3f:ammeter', r: 0.9 });
      }
      // ---- the exchange battery (glass-jar cells), the workbench, a wall phone ----------------------------------------------
      for (let t = 0; t < 2; t++) {
        K.box(2.6, 0.05 + t * 0.62, 0.45, 3.6, 0.05, 0.6, { tex: 'wood', color: '#4a3a2a' });
        for (let i = 0; i < 9; i++) {
          const x = 0.98 + i * 0.4, y = 0.1 + t * 0.62;
          K.box(x, y, 0.45, 0.3, 0.42, 0.34, { color: '#9fb8b0', roughness: 0.15, transparent: true, opacity: 0.35 }, { shadow: false });
          K.box(x, y + 0.02, 0.45, 0.26, 0.32, 0.3, { color: '#5a6a3a', roughness: 0.6 }, { shadow: false });
          K.cyl(x - 0.07, y + 0.42, 0.45, 0.02, 0.05, { color: '#b3261e' }); K.cyl(x + 0.07, y + 0.42, 0.45, 0.02, 0.05, { color: '#1a1a1a' });
        }
      }
      K.collider(0.7, 0.1, 4.5, 0.8, { h: 1.3 });
      // (on the west wall: anything hung on the north wall shows its back to the camera through the cutaway)
      K.sign('EXCHANGE BATTERY\n— 50 V —', 0.09, 1.85, 1.0, 0.9, 0.3, { style: 'plaque', rotY: 90 });
      K.box(3.0, 0.0, 4.6, 2.6, 0.9, 0.7, { tex: 'wood', color: '#5a4632' }, { collide: true });
      K.prop('box', 2.2, 4.6, 12, { y: 0.9, w: 0.3, h: 0.14, d: 0.22, text: 'FUSES 30A' });
      K.cyl(3.4, 0.9, 4.55, 0.05, 0.3, { color: '#3a5a8a', roughness: 0.4 });               // a thermos
      K.box(3.9, 0.9, 4.6, 0.3, 0.06, 0.12, { color: '#1a1a1a', roughness: 0.5 });           // a torch, its batteries out
      K.prop('handset', 2.8, 4.55, 70, { y: 0.9, variant: 'beige' });
      K.prop('wall_phone', 0.08, 4.1, 90, { mount: 1.45 });
      // the stool (after the first trip it's on its side and the door's ajar)
      const down = done('c3:stoolDown');
      K.prop('stool', 4.2, 3.7, 200, { variant: 'kitchen', name: 'c3f_stool' });
      const sd = K.prop('stool', 4.35, 3.9, 110, { variant: 'kitchen', name: 'c3f_stoolDown', collide: false });
      if (sd) { sd.rotation.order = 'YXZ'; sd.rotation.set(0, 110 * D2R, 88 * D2R); sd.position.y = 0.2; }
      K.animate(() => { const a = World.obj && World.obj('c3f_stool'), b = World.obj && World.obj('c3f_stoolDown'); const d = done('c3:stoolDown'); if (a && a.visible === d) a.visible = !d; if (b && b.visible !== d) b.visible = d; });
      void down;
      for (let i = 0; i < 4; i++) K.cyl(FU.bx - 0.05, 2.1, FU.bz - 0.36 + i * 0.24, 0.02, H - 2.1, { tex: 'metal', color: '#a4aba6' });
      // lights: the caged bulb on BASEMENT
      C3_cagedBulb(K, 3.0, H - 0.25, 2.5, 'c3f:bulb', list.includes('BASEMENT'), { intensity: 3.4, distance: 7.5 });
      K.dress('papers', [0.4, 1.0, 5.2, 4.2], 4, { seed: 401 });
      // ---- examine --------------------------------------------------------------------------------------------------------
      K.examine(2.6, 1.0, 1.0, ['Glass jars full of acid and lead. The exchange ran on these when the power went.', 'They\'re still warm.'], { id: 'c3f:battery', r: 1.4 });
      K.examine(3.0, 1.1, 4.1, ['A tin of spare fuses, a thermos, a torch with its batteries taken out.', 'Wai\'s been down here. [beat] Or somebody has.'], { id: 'c3f:bench', r: 1.3 });
      K.examine(0.5, 1.5, 4.1, 'A wall phone. Dead. [beat] Somebody wrote "HALL — 214" on the wall beside it.', { id: 'c3f:phone', r: 1.1 });
      K.examine(5.7, 2.35, 3.3, 'DANGER. Four hundred and fifteen volts. [beat] Okay.', { id: 'c3f:danger', r: 1.1 });
      K.examine(4.3, 0.6, 3.8, 'A kitchen stool. For sitting and staring at the board, working it out.', { id: 'c3f:stool', r: 1.0 });
      K.examine(FU.bx - 0.5, 0.3, FU.bz + 0.45, 'A rubber mat in front of the board. Worn right through where people stood.', { id: 'c3f:mat', r: 0.9 });
      K.examine(FU.bx - 0.2, 2.4, FU.bz - 0.3, 'Four fat conduits out of the top of the board and up into the ceiling. [beat] The whole building runs through this one box.', { id: 'c3f:conduits', r: 1.1 });
    },
    async onEnter(G, from) {
      if (from === 'c3_stairs' && !flag('c3_fused') && G.once('c3:fuseIn')) {
        C3.fuseThought = true;
        try {
          await G.wait(0.7);
          await G.think('The fuse board. [beat] Nineteen sixty-one.');
          note(G, 'The fuse board. The frame room needs power.', 'c3_fuse');
        } finally { C3.fuseThought = false; }
      }
    },
    onUpdate() { C3_ambient(['#5a6664', 0.38], ['#2a8a84', 0.28]); },
    onLeave() { C3_ambientOff(); },
  });

  // =================================================================================================================
  // 3I THE CABLE VAULT — 20 × 10 m, a 2.5 m ceiling, three runs of cable tray just over Aidan's head. The door on the
  // east wall (z 5). The Unread cluster on the north wall and ceiling mid-way; the jointers' bench at the far west end
  // (Operator's Log 5, an energy drink).
  // =================================================================================================================
  const VT = { H: 2.5, door: 5.0 };
  defineRoom({
    id: 'c3_vault', name: 'CABLE VAULT', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'concrete', ambient: 'hum',
    fog: { density: 0.04, color: '#27302e' },
    surfaces: [{ box: [13.5, 7.2, 16.5, 9.8], s: 'metal' }],
    bounds: [0, 0, 20, 10],
    entries: { door: [19.1, VT.door, -90], start: [19.1, VT.door, -90] },
    cameras: [
      // a low rail beneath the trays, following him along the vault
      { id: 'c3_vault:rail', vol: [0, 0, 20, 10], type: 'rail', pos: [12, 0.95, 11.7], fov: 54, rail: { a: [2.4, 0.95, 11.7], b: [19.2, 0.95, 11.7], look: [0, 0.95, 0], lag: 0.3 } },
      // a static from the far end, back toward the door: the middle of the vault, where the wall is crawling
      { id: 'c3_vault:far', vol: [5.2, 0, 13.2, 10], pri: 1, type: 'static', pos: [0.45, 1.85, 8.9], target: [12, 0.9, 4.2], fov: 'fit' },
      // the door end, from under the trays: coming in, the vault opening up ahead
      { id: 'c3_vault:door', vol: [15.4, 1.4, 20, 8.6], pri: 1, type: 'static', pos: [9.4, 1.85, 8.9], target: [19.4, 0.8, 4.6], fov: 'fit' },
      // the jointers' bench at the far end (Operator's Log 5), looking back from the middle
      { id: 'c3_vault:bench', vol: [0, 1.4, 5.2, 8.6], pri: 1, type: 'static', pos: [10.6, 1.85, 8.9], target: [0.9, 0.8, 4.9], fov: 'fit' },
    ],
    spawns: [
      { id: 'c3_vault:unread', type: 'unread', pos: [10.6, 1.2], count: 44, cluster: [[9.4, 1.6, 0.1], [10.1, 2.05, 0.1], [10.9, 1.45, 0.1], [11.6, 1.95, 0.1], [10.5, VT.H - 0.03, 0.9], [9.8, VT.H - 0.03, 1.6], [11.3, VT.H - 0.03, 1.2]] },
    ],
    build(K) {
      const H = VT.H;
      const conc = { tex: 'concrete', color: '#80817a' };
      K.floor(0, 0, 20, 10, { tex: 'concrete_wet', color: '#6e706a' });
      K.ceiling(0, 0, 20, 10, H, { tex: 'concrete', color: '#76776f' });
      K.wall(-0.075, 0, 20.075, 0, H, conc, { grime: true });
      K.wall(20.075, 10, -0.075, 10, H, conc, { both: false });                 // the cutaway for the low rail
      K.wall(0, 10.075, 0, -0.075, H, conc, { grime: true });
      K.wall(20, -0.075, 20, 10.075, H, conc, { openings: [{ at: VT.door + 0.075, w: 1.0, h: 2.2 }] });
      K.door({ id: 'c3_vault:door', x: 20, z: VT.door, rot: -90, w: 0.9, style: 'metal', to: 'c3_stairs', entry: 'vault', color: '#6a7068', sign: 'STAIRS' });
      // the trays, right over his head, loaded; cables sagging between them, some down to eye level
      for (const z of [2.2, 5.0, 7.8]) for (let x = 2.4; x < 19; x += 4.1) K.prop('cable_tray', x, z, 0, { len: 4.0, w: 0.5, h: 2.06, ceil: H, seed: Math.round(x * 10 + z) });
      for (const [x, z, s] of [[5.2, 2.2, 0.28], [8.6, 7.8, 0.34], [13.4, 5.0, 0.3], [16.1, 2.2, 0.36], [3.1, 7.8, 0.25]]) C3_wire(K, [x - 1.1, 2.12, z - 0.12], [x + 1.1, 2.12, z + 0.1], s, 0.03, '#1b1b1b');
      // vertical cable ladders on the long walls, cables climbing into the ceiling
      for (const [x, z, rot] of [[4, 0.12, 0], [15, 0.12, 0], [9.5, 0.12, 0]]) {
        K.box(x, 0, z, 0.5, H, 0.06, { tex: 'metal', color: '#a4aba6' });
        for (let i = 0; i < 4; i++) K.cyl(x - 0.18 + i * 0.12, 0, z + (rot ? -0.08 : 0.08), 0.022, H, { color: '#1c1c1c', roughness: 0.6 });
      }
      // lead-sleeved joints on the floor runs, a jointers' tent, the sump and its pump
      for (const [x, z] of [[6.5, 8.9], [11.8, 8.8], [9.0, 1.1]]) { K.cyl(x, 0.16, z, 0.12, 0.6, { tex: 'metal', color: '#6a6e70', roughness: 0.4 }, { rz: 90 }); K.cyl(x - 1.2, 0.16, z, 0.05, 2.4, { color: '#1c1c1c' }, { rz: 90 }); }
      K.box(15, 0, 8.5, 3.0, 0.02, 2.6, { tex: 'metal_grating', color: '#6a6e6a' });
      K.box(16.9, 0, 9.2, 0.8, 0.9, 0.7, { tex: 'metal', color: '#4a5a52' }, { collide: true });
      K.light('led', 16.9, 0.8, 8.84, { color: '#ff2a1c', blink: 1.4, intensity: 3, halo: 0.3 });
      K.cyl(16.6, 0.9, 9.2, 0.04, H - 0.9, { tex: 'metal', color: '#8d9594' });
      K.prop('drop_sheet', 6.2, 5.0, 20, { variant: 'draped' });
      K.box(1.2, 0, 1.6, 0.6, 0.02, 0.6, { tex: 'metal', color: '#4d534f' });                 // the manhole, the ladder up to a sealed hatch
      K.box(0.95, 0, 1.6, 0.05, H, 0.4, { tex: 'metal', color: '#8d9594' });
      for (let y = 0.3; y < H; y += 0.3) K.cyl(1.0, y, 1.6, 0.012, 0.4, { tex: 'metal', color: '#8d9594' }, { rx: 90 });
      // the jointers' bench at the far end: Operator's Log 5, the energy drink, a kettle and two cups, a dead lamp
      K.box(0.6, 0, 5.0, 0.9, 0.85, 2.4, { tex: 'wood', color: '#5a4632' }, { collide: true });
      K.doc('oplog5', 0.7, 0.86, 4.6, { id: 'c3_vault:oplog5', model: 'binder', r: 1.2, glint: 0.12 });
      K.pickup('energy_drink', 0.75, 0.86, 5.55, { id: 'c3_vault:energy', rot: 30, extraOnEasy: true });   // (spec 3-2's pickups: the canteen coffee)
      K.cyl(0.55, 0.86, 6.0, 0.08, 0.2, { tex: 'metal', color: '#b8bdb8', metalness: 0.6, roughness: 0.3 });
      K.prop('mug', 0.8, 6.1, 20, { y: 0.86, color: '#d8c9a0' }); K.prop('mug', 0.95, 5.95, 80, { y: 0.86 });
      K.prop('desk_lamp', 0.4, 4.1, 60, { y: 0.86, lit: false });
      K.light('led', 0.35, 1.2, 3.8, { color: '#5aff8a', intensity: 1.2, halo: 0.25 });          // a pilot lamp on the bench panel
      K.sign('CABLE VAULT\nNO NAKED FLAMES', 19.9, 1.8, 3.4, 0.7, 0.3, { rotY: -90, style: 'warning' });
      // lights: two caged bulbs on the BASEMENT circuit
      const on = circOn('BASEMENT');
      C3_cagedBulb(K, 17, H - 0.18, 5.0, 'c3v:bulb1', on, { intensity: 2.6, distance: 7 });
      C3_cagedBulb(K, 4, H - 0.18, 5.0, 'c3v:bulb2', on, { intensity: 2.2, distance: 6, flicker: true });
      K.dress('cables', [1.5, 0.5, 19, 9.5], 18, { seed: 411 });
      K.dress('papers', [0.5, 3.5, 3, 7], 3, { seed: 412 });
      // ---- examine --------------------------------------------------------------------------------------------------------
      K.examine(16.5, 1.7, 5.0, ['Cable trays, right over my head. Thousands of pairs. [beat] Every house on the hill.', 'I have to duck.'], { id: 'c3v:trays', r: 1.6 });
      K.examine(6.5, 0.6, 8.3, 'Lead sleeves over the joints. Somebody sat down here and made every one of these by hand.', { id: 'c3v:joints', r: 1.3 });
      K.examine(15, 0.4, 8.0, 'Water in the sump. It smells like old pennies. [beat] The pump\'s still trying.', { id: 'c3v:sump', r: 1.4 });
      K.examine(1.3, 1.2, 1.6, 'A ladder up to a hatch. Bolted from the other side.', { id: 'c3v:hatch', r: 1.2 });
      K.examine(1.2, 1.1, 6.0, 'A kettle and two cups. The jointers had their tea down here in the dark.', { id: 'c3v:kettle', r: 1.2 });
      K.examine(6.2, 1.0, 5.0, 'A drop sheet over something. [beat] I don\'t lift it.', { id: 'c3v:sheet', r: 1.3 });
      K.examine(14.2, 1.6, 1.0, ['Something on the wall down there. Little red lights. [beat] Like missed calls.', 'Don\'t point the light at them.'], { id: 'c3v:wall', r: 2.4 });
    },
    async onEnter(G, from) {
      if (G.once('c3:vaultIn')) { await G.wait(0.8); await G.think('It hums down here. [beat] And something\'s buzzing.'); }
    },
    onUpdate() { C3_ambient(['#4c5856', 0.34], ['#2a8a84', 0.26]); },
    onLeave() { C3_ambientOff(); },
  });

  // =================================================================================================================
  // 3J THE FRAME HALL — 20 × 14 m, 5.4 m ceiling. The Main Distribution Frame along the west wall (three 3.8 m racks,
  // line side east, x ≈ 1.25), two frame rows across the floor (north z 3.8, south z 10.2; x 7…14), the double doors
  // to the hall in the east wall (z 7) and the yard door in the north wall (x 17). In the Outage the frame is the
  // Restructure: an org chart of cages holding lanyards in copper jumper, the chatbot screen at the top, switch-arms on
  // rails, WAI-1 / WAI-2 / WAI-3. Beyond the east doorway: a slice of the Operators' Hall (Wai's board), hall coords
  // offset by (+20, +0.37), seen through the open doors in 3-3.
  // =================================================================================================================
  const FR = {
    H: 5.4, doorZ: 7.0, yardX: 17.0, face: 1.26,
    rowN: 3.8, rowS: 10.2, rx0: 7, rx1: 14,
    jacks: [
      { label: 'WAI-1', pos: [1.3, 0.95, 5.35], rot: 90, stand: [2.05, 5.35] },
      { label: 'WAI-2', pos: [10.2, 1.25, 3.47], rot: 180, stand: [10.2, 2.7] },
      { label: 'WAI-3', pos: [11.0, 1.25, 10.53], rot: 0, stand: [11.0, 11.3] },
    ],
    wai: [3.55, 7.6], waiSit: [1.78, 7.95], arms: [
      { axis: 'z', x: 1.62, y: 5.08, from: 12.6, to: 5.35, dipTo: 1.05 },
      { axis: 'x', z: 3.38, y: 3.02, from: 13.8, to: 10.2, dipTo: 1.35 },
      { axis: 'x', z: 10.62, y: 3.02, from: 13.8, to: 11.0, dipTo: 1.35 },
    ],
    replica: { dx: 20, dz: 0.37 },
  };
  // the org chart: the chatbot at the top, three managers, six leads, twelve of the lines crew — Wai among them
  const ORG = (() => {
    const L1 = [3.2, 7.0, 10.8], L2 = [2.1, 4.3, 5.9, 8.1, 9.7, 11.9];
    const L3 = []; L2.forEach((z) => { L3.push(z - 0.55, z + 0.55); });
    const names1 = ['DENISE — REGIONAL', 'GRAHAM — NETWORK', 'SANDRA — SERVICE'];
    const names2 = ['KEV — LINES', 'TONY — LINES', 'RAY — FRAME', 'COL — FRAME', 'BEV — FAULTS', 'LYN — FAULTS'];
    const names3 = ['MICK', 'STEVE', 'DAZ', 'PHIL', 'WAI', 'NEV', 'JOHNNO', 'BRUCE', 'TREV', 'GAZZA', 'SHANE', 'PAULIE'];
    const nodes = [];
    L1.forEach((z, i) => nodes.push({ lv: 1, z, y: 3.4, name: names1[i], parent: -1 }));
    L2.forEach((z, i) => nodes.push({ lv: 2, z, y: 2.42, name: names2[i], parent: Math.floor(i / 2) }));
    L3.forEach((z, i) => nodes.push({ lv: 3, z, y: 1.5, name: names3[i], parent: 3 + Math.floor(i / 2) }));
    const wai = nodes.findIndex((n) => n.name === 'WAI');
    // the order the arms take them in: furthest from Wai first, closing in
    const order = nodes.map((n, i) => i).filter((i) => i !== wai).sort((a, b) => Math.abs(nodes[b].z - nodes[wai].z) + nodes[b].lv * 0.3 - (Math.abs(nodes[a].z - nodes[wai].z) + nodes[a].lv * 0.3));
    return { nodes, wai, order, screen: { z: 7.0, y: 4.45 } };
  })();
  // the org chart's name labels: one transparent canvas over the frame face, redrawn as names are erased
  const ORGC = { canvas: null, ctx: null, tex: null, erased: new Set() };
  const ORG_Z0 = 0.9, ORG_Z1 = 13.1, ORG_Y0 = 0.7, ORG_Y1 = 4.0;
  function C3_orgDraw() {
    if (!ORGC.canvas) {
      ORGC.canvas = document.createElement('canvas'); ORGC.canvas.width = 1024; ORGC.canvas.height = 320;
      ORGC.ctx = ORGC.canvas.getContext('2d');
      ORGC.tex = new THREE.CanvasTexture(ORGC.canvas); ORGC.tex.colorSpace = THREE.SRGBColorSpace; ORGC.tex.userData.shared = true;
    }
    const x = ORGC.ctx, w = 1024, h = 320;
    x.clearRect(0, 0, w, h);
    const px = (z) => ((z - ORG_Z0) / (ORG_Z1 - ORG_Z0)) * w, py = (y) => ((ORG_Y1 - y) / (ORG_Y1 - ORG_Y0)) * h;
    ORG.nodes.forEach((n, i) => {
      const gone = ORGC.erased.has(i);
      const X = px(n.z), Y = py(n.y - 0.3);
      const size = n.lv === 1 ? 15 : n.lv === 2 ? 13 : 14;
      x.font = `bold ${size}px ${FN.sans}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const tw = x.measureText(n.name).width + 10;
      x.fillStyle = gone ? 'rgba(30,26,22,0.55)' : 'rgba(236,230,212,0.92)'; x.fillRect(X - tw / 2, Y - size * 0.75, tw, size * 1.5);
      if (!gone) { x.fillStyle = i === ORG.wai ? '#8a1a14' : '#1d1d1d'; x.fillText(n.name, X, Y + 1); }
      else { x.strokeStyle = 'rgba(200,190,170,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X - tw / 2 + 4, Y); x.lineTo(X + tw / 2 - 4, Y); x.stroke(); }
    });
    ORGC.tex.needsUpdate = true;
  }
  // the chatbot's face: pastel, round eyes, a smile. st: {blink 0..1, talk 0..1, mode:'on'|'glitch'|'dead'}
  const FACE = { canvas: null, ctx: null, tex: null, t: 0 };
  function C3_faceDraw(st) {
    if (!FACE.canvas) {
      FACE.canvas = document.createElement('canvas'); FACE.canvas.width = 256; FACE.canvas.height = 192;
      FACE.ctx = FACE.canvas.getContext('2d');
      FACE.tex = new THREE.CanvasTexture(FACE.canvas); FACE.tex.colorSpace = THREE.SRGBColorSpace; FACE.tex.userData.shared = true;
    }
    const x = FACE.ctx, w = 256, h = 192;
    if (st.mode === 'dead') { x.fillStyle = '#050606'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(246,217,228,0.05)'; x.beginPath(); x.arc(w * 0.36, h * 0.42, 18, 0, Math.PI * 2); x.arc(w * 0.64, h * 0.42, 18, 0, Math.PI * 2); x.fill(); FACE.tex.needsUpdate = true; return; }
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f7dbe6'); g.addColorStop(1, '#ddd8f6');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,170,190,0.45)'; x.beginPath(); x.ellipse(w * 0.24, h * 0.62, 18, 11, 0, 0, Math.PI * 2); x.ellipse(w * 0.76, h * 0.62, 18, 11, 0, 0, Math.PI * 2); x.fill();
    const ey = h * 0.42, er = 19, open = 1 - (st.blink || 0);
    for (const ex of [w * 0.36, w * 0.64]) {
      x.fillStyle = '#3b3452'; x.beginPath(); x.ellipse(ex, ey, er, Math.max(1.5, er * open), 0, 0, Math.PI * 2); x.fill();
      if (open > 0.4) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(ex - 6, ey - 7 * open, 5, 0, Math.PI * 2); x.fill(); }
    }
    const talk = st.talk || 0;
    x.strokeStyle = '#3b3452'; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath(); x.moveTo(w * 0.38, h * 0.66); x.quadraticCurveTo(w * 0.5, h * (0.78 + talk * 0.05), w * 0.62, h * 0.66); x.stroke();
    if (talk > 0.05) { x.fillStyle = '#6a3a50'; x.beginPath(); x.ellipse(w * 0.5, h * 0.72, 16, 4 + talk * 12, 0, 0, Math.PI); x.fill(); }
    x.font = `bold 13px ${FN.sans}`; x.fillStyle = 'rgba(59,52,82,0.7)'; x.textAlign = 'center'; x.fillText('Hi! I\'m here to help.', w / 2, h - 12);
    for (let yy = 0; yy < h; yy += 3) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, yy, w, 1); }
    if (st.mode === 'glitch') {
      for (let k = 0; k < 9; k++) { const yy = Math.random() * h, hh = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 60; x.drawImage(FACE.canvas, 0, yy, w, hh, dx, yy, w, hh); }
      for (let k = 0; k < 500; k++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)'; x.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
    }
    FACE.tex.needsUpdate = true;
  }
  // a jack plate (red tag, label, brass jack) on a frame face; rot faces the plate
  const jackTex = (label) => C3_tex('jack|' + label, 128, 64, (x, w, h) => {
    x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#f0ece0'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8);
    tx(x, label, w / 2, 44, 30, '#f4f0e6', { font: FN.heavy, weight: '900', align: 'center' });
  });
  function C3_jackPlate(K, j, o = {}) {
    const J = FR.jacks[j], [x, y, z] = J.pos, r = J.rot * D2R, fx = Math.sin(r), fz = Math.cos(r);
    K.box(x - fx * 0.01, y - 0.07, z - fz * 0.01, Math.abs(fz) > 0.5 ? 0.2 : 0.03, 0.2, Math.abs(fz) > 0.5 ? 0.03 : 0.2, { color: '#2a2622', roughness: 0.6 }, { world: o.world });
    K.plane(x + fx * 0.012, y + 0.08, z + fz * 0.012, 0.16, 0.08, jackTex(J.label), { rotY: J.rot, world: o.world });
    K.cyl(x + fx * 0.02, y - 0.02, z + fz * 0.02, 0.018, 0.03, { tex: 'metal', color: '#b89a52', metalness: 0.8, roughness: 0.3 }, { rx: Math.abs(fz) > 0.5 ? 90 : 0, rz: Math.abs(fx) > 0.5 ? 90 : 0, world: o.world });
    // the re-patch: a yellow jumper looped from the jack along the frame (shown once patched)
    const along = Math.abs(fx) > 0.5 ? [0, 0, 0.55] : [0.55, 0, 0];
    const jw = K.prop('jumper_wire', x + fx * 0.03, z + fz * 0.03, 0, { from: [0, y - 0.02, 0], to: [along[0], y + 0.35, along[2]], sag: 0.22, color: '#e8c21a', name: 'c3fr_jump' + j, world: o.world });
    if (jw) jw.visible = !!o.patched;
  }
  // the boss state lives on the enemy (transient); FR_ARM(e, j) positions the arm's carriage and dip
  function C3_armPose(j, k, dip) {
    const A = FR.arms[j], obj = World.obj && World.obj('c3fr_arm' + j);
    if (!obj) return;
    const p = lerp(A.from, A.to, k);
    if (A.axis === 'z') obj.position.set(A.x, A.y, p); else obj.position.set(p, A.y, A.z);
    const arm = obj.getObjectByName('c3arm_rod');
    if (arm) { const full = A.y - A.dipTo; arm.scale.y = lerp(0.35, 1, dip); arm.position.y = -full * lerp(0.35, 1, dip) / 2; }
    const hand = obj.getObjectByName('c3arm_hand');
    if (hand) hand.position.y = -(A.y - A.dipTo) * lerp(0.35, 1, dip);
  }
  // ---- the Restructure: the frame's body for hits (nothing it takes matters), its lashes, its sweeping arms ----------
  const RS = { total: 150, lashDmg: 15, sweepDmg: 12, lines: () => ((typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.restructure) && DIALOGUE.restructure.length) ? DIALOGUE.restructure : ["Hi! I'm here to help.", "We're simplifying the way we work.", 'Your role has been identified as impacted.', 'Thank you for your contribution.']) };
  // the frame surfaces lashes come from: [x0,z0,x1,z1] segments (x constant or z constant)
  const FR_FACES = [[FR.face, 1.3, FR.face, 12.7], [FR.rx0, 3.46, FR.rx1, 3.46], [FR.rx0, 4.14, FR.rx1, 4.14], [FR.rx0, 9.86, FR.rx1, 9.86], [FR.rx0, 10.54, FR.rx1, 10.54]];
  const nearFace = (px, pz) => {
    let best = null;
    for (const [x0, z0, x1, z1] of FR_FACES) {
      const x = clamp(px, Math.min(x0, x1), Math.max(x0, x1)), z = clamp(pz, Math.min(z0, z1), Math.max(z0, z1)), d = Math.hypot(px - x, pz - z);
      if (!best || d < best.d) best = { x, z, d };
    }
    return best;
  };
  const segDist = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, t = clamp(((px - ax) * vx + (pz - az) * vz) / L2, 0, 1); return Math.hypot(px - (ax + vx * t), pz - (az + vz * t)); };
  const SWEEPS = [
    { pivot: [19.5, 13.45], len: 5.2, a: -90, b: -178, ph: 0 },      // the south-east corner: along the south wall ↔ along the east wall
    { pivot: [1.95, 13.4], len: 5.2, a: 90, b: 178, ph: 4.6 },        // the south-west corner: along the south wall ↔ up the frame face
  ];
  const SW_T = { rest: 3.0, move: 1.5, warn: 0.75 };
  function C3_bossFx(e) {
    const D = e.data, copper = new THREE.MeshStandardMaterial({ color: '#8a5a2a', roughness: 0.45, metalness: 0.6, emissive: '#3a1a08', emissiveIntensity: 0.4 });
    const iron = new THREE.MeshStandardMaterial({ color: '#3a3d3a', roughness: 0.6, metalness: 0.5 });
    const warn = new THREE.MeshStandardMaterial({ color: '#5a1410', emissive: '#ff2a1c', emissiveIntensity: 0 });
    for (const m of [copper, iron, warn]) e.data.mats = (e.data.mats || []).concat(m);
    // two whips: chains of short segments
    const segG = new THREE.CylinderGeometry(0.03, 0.03, 1, 5); segG.userData.ownedGeo = true;
    D.whips = [0, 1].map(() => { const g = new THREE.Group(); g.visible = false; const segs = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(segG, copper); m.castShadow = false; g.add(m); segs.push(m); } e.fx.add(g); return { g, segs }; });
    // the sweeping arms: a post, a motor, the arm at knee height, lamps at the pivot and the tip
    const armG = new THREE.BoxGeometry(0.13, 0.13, 1); armG.translate(0, 0, 0.5); armG.userData.ownedGeo = true;
    D.sweeps = SWEEPS.map((S0) => {
      const g = new THREE.Group(); g.position.set(S0.pivot[0], 0, S0.pivot[1]);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10), iron); post.position.y = 0.55; post.geometry.userData.ownedGeo = true; g.add(post);
      const piv = new THREE.Group(); piv.position.y = 0.42; g.add(piv);
      const arm = new THREE.Mesh(armG, iron); arm.scale.z = S0.len; piv.add(arm);
      const lampM = warn.clone(); e.data.mats.push(lampM);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lampM); lamp.position.y = 1.15; lamp.geometry.userData.ownedGeo = true; g.add(lamp);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lampM); tip.position.set(0, 0, S0.len); tip.geometry.userData.ownedGeo = true; piv.add(tip);
      e.fx.add(g);
      return { S0, g, piv, lampM, t: S0.ph, yaw: S0.a, hit: false, moving: false, at: 'a' };
    });
  }
  function C3_whipPose(w, a, b, k, curl) {
    // a → b; k = how far along it reaches (0…1); curl lifts it into a rearing arc
    const n = w.segs.length, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * k;
      const x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t);
      const y = lerp(a[1], b[1], t) + Math.sin(t * Math.PI) * 0.35 + curl * Math.sin((i / n) * Math.PI) * 1.4;
      pts.push(new THREE.Vector3(x - curl * (b[0] - a[0]) * 0.15 * (i / n), y, z - curl * (b[2] - a[2]) * 0.15 * (i / n)));
    }
    for (let i = 0; i < n; i++) {
      const m = w.segs[i], p0 = pts[i], p1 = pts[i + 1], L = p0.distanceTo(p1);
      m.position.copy(p0).add(p1).multiplyScalar(0.5);
      m.scale.set(1, Math.max(0.001, L), 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    }
  }
  function C3_bossUpdate(e, dt, ai) {
    const D = e.data;
    D.clock = (D.clock || 0) + dt;
    // the face: blinks, talks while a line is up, glitches at the end
    D.faceT = (D.faceT || 0) + dt;
    D.blinkT = (D.blinkT ?? 3) - dt;
    if (D.blinkT < 0) { D.blinkT = 2.5 + Math.random() * 3; D.blink = 0.18; }
    if (D.blink > 0) D.blink = Math.max(0, D.blink - dt);
    D.talkT = Math.max(0, (D.talkT || 0) - dt);
    if (D.faceT > 0.08) {
      D.faceT = 0;
      C3_faceDraw({ blink: D.blink > 0 ? 1 : 0, talk: D.talkT > 0 ? 0.5 + 0.5 * Math.sin(D.clock * 18) : 0, mode: D.faceMode || 'on' });
    }
    // lanyards falling
    for (const f of D.falls || []) {
      if (f.done) continue;
      f.v += 9 * dt; f.obj.position.y = Math.max(f.floor, f.obj.position.y - f.v * dt); f.obj.rotation.z += f.spin * dt;
      if (f.obj.position.y <= f.floor) { f.done = true; f.obj.rotation.set(-Math.PI / 2 + 0.2, f.spin, 0.3); }
    }
    // arms: glide toward their jacks as the time runs; dips and clicks
    const kT = clamp((D.t || 0) / RS.total, 0, 1);
    for (let j = 0; j < 3; j++) {
      const A = D.arms[j];
      if (!D.patched[j] && D.fight && !D.result) A.k = (A.k0 || 0) + (1 - (A.k0 || 0)) * kT;
      A.dipT = Math.max(0, A.dipT - dt);
      const dip = A.dipT > 0 ? Math.sin((1 - A.dipT / 0.5) * Math.PI) : 0;
      C3_armPose(j, A.k, D.patched[j] ? 0.5 + Math.sin(D.clock * 23 + j) * 0.04 : dip);
    }
    if (!D.fight || D.result) {
      for (const sw of D.sweeps || []) sw.lampM.emissiveIntensity = 0;
      for (const w of D.whips || []) w.g.visible = false;
      return;
    }
    if (!ai || !Player.pos || Player.mode === 'dead') return;
    D.t += dt;
    const P = Player.pos;
    // switch-arms click along: each dip unplugs a jack; the chart loses one name every few seconds
    for (let j = 0; j < 3; j++) {
      const A = D.arms[j];
      if (D.patched[j]) { A.sparkT = (A.sparkT ?? 1) - dt; if (A.sparkT <= 0) { A.sparkT = 0.8 + Math.random() * 1.4; try { Snd.play('static', { dur: 0.25, vol: 0.35, pos: A.pos() }); } catch (err) { /* audio */ } } continue; }
      A.clickT -= dt;
      if (A.clickT <= 0) { A.clickT = 1.1 + Math.random() * 0.7 - kT * 0.4; A.dipT = 0.5; try { Snd.play('click', { vol: 0.7, pos: A.pos() }); Snd.play('plug', { vol: 0.35, pos: A.pos(), rate: 0.8 }); } catch (err) { /* audio */ } }
    }
    const dropsDue = Math.floor(kT * ORG.order.length * 0.999);
    while ((D.drops | 0) < dropsDue) { C3_dropLanyard(ORG.order[D.drops | 0], D); D.drops = (D.drops | 0) + 1; }
    // its calm, cheerful voice
    D.lineT -= dt;
    if (D.lineT <= 0) {
      const L = RS.lines(); const line = L[D.lineN % L.length]; D.lineN++;
      D.lineT = 13 + Math.random() * 5; D.talkT = U.readTime(line);
      try { Enemies.say(line, 'quiet', D.talkT); } catch (err) { /* voice */ }
    }
    // lashes: a bundle of jumper rears off the nearest frame and whips at where he stands
    D.lashCd = Math.max(0, D.lashCd - dt);
    const L0 = D.lash;
    if (!L0 && D.lashCd <= 0) {
      const f = nearFace(P.x, P.z);
      if (f && f.d < 3.6) {
        const w = D.whips[D.lashN++ % 2];
        D.lash = { w, t: 0, a: [f.x, 1.7 + Math.random() * 0.5, f.z], b: [P.x, 1.0, P.z], hit: false };
        w.g.visible = true;
        try { Snd.play('skitter', { pos: [f.x, 1.8, f.z], vol: 0.75 }); } catch (err) { /* audio */ }
      }
    } else if (L0) {
      L0.t += dt;
      const T1 = 0.75, T2 = T1 + 0.18, T3 = T2 + 0.55;
      if (L0.t < T1) C3_whipPose(L0.w, L0.a, L0.b, 0.25 + 0.1 * (L0.t / T1), U.ease.out(L0.t / T1));
      else if (L0.t < T2) {
        if (!L0.snd) { L0.snd = true; try { Snd.play('whip', { pos: L0.b, vol: 1 }); } catch (err) { /* audio */ } }
        C3_whipPose(L0.w, L0.a, L0.b, lerp(0.35, 1, (L0.t - T1) / (T2 - T1)), 0);
      } else if (L0.t < T3) {
        if (!L0.hit) {
          L0.hit = true;
          if (segDist(P.x, P.z, L0.a[0], L0.a[2], L0.b[0], L0.b[2]) < 0.7 && Player.mode !== 'dead') Player.damage(RS.lashDmg, e, { push: 0.9, from: [L0.a[0], P.y, L0.a[2]] });
        }
        C3_whipPose(L0.w, L0.a, L0.b, lerp(1, 0, (L0.t - T2) / (T3 - T2)), 0);
      } else { L0.w.g.visible = false; D.lash = null; D.lashCd = (lvl() === 'hard' ? 2.2 : 2.9) + Math.random() * 1.4; }
    }
    // sweeping arms at knee height: rest, warn, sweep across, rest, sweep back
    for (const sw of D.sweeps) {
      sw.t += dt;
      const cyc = SW_T.rest + SW_T.move, ph = sw.t % (cyc * 2), half = ph < cyc ? 0 : 1, u = ph - half * cyc;
      const from = half ? sw.S0.b : sw.S0.a, to = half ? sw.S0.a : sw.S0.b;
      let yaw = from;
      sw.lampM.emissiveIntensity = u > SW_T.rest - SW_T.warn && u < SW_T.rest ? (Math.sin(D.clock * 20) > 0 ? 3 : 0.6) : u >= SW_T.rest ? 3 : 0.4;
      if (u >= SW_T.rest) {
        const k = U.ease.inOut((u - SW_T.rest) / SW_T.move); yaw = lerp(from, to, k);
        if (!sw.moving) { sw.moving = true; sw.hit = false; try { Snd.play('lift_groan', { pos: [sw.S0.pivot[0], 0.6, sw.S0.pivot[1]], vol: 0.6, dur: 1.4 }); } catch (err) { /* audio */ } }
        const tipX = sw.S0.pivot[0] + Math.sin(yaw * D2R) * sw.S0.len, tipZ = sw.S0.pivot[1] + Math.cos(yaw * D2R) * sw.S0.len;
        if (!sw.hit && Player.mode === 'normal' && segDist(P.x, P.z, sw.S0.pivot[0], sw.S0.pivot[1], tipX, tipZ) < 0.45) {
          sw.hit = true;
          Player.damage(RS.sweepDmg, e, { knock: true, push: 0.8, from: [sw.S0.pivot[0], P.y, sw.S0.pivot[1]] });
          try { Snd.play('hit_heavy', { pos: [P.x, 0.5, P.z], vol: 0.8 }); } catch (err) { /* audio */ }
        }
      } else if (sw.moving) { sw.moving = false; try { Snd.play('clunk', { pos: [sw.S0.pivot[0], 0.6, sw.S0.pivot[1]], vol: 0.8 }); } catch (err) { /* audio */ } }
      if (u > SW_T.rest - SW_T.warn && !sw.warned && u < SW_T.rest) { sw.warned = true; try { Snd.play('clunk', { pos: [sw.S0.pivot[0], 1.0, sw.S0.pivot[1]], vol: 0.5 }); } catch (err) { /* audio */ } }
      if (u < 0.1) sw.warned = false;
      sw.yaw = yaw; sw.piv.rotation.y = yaw * D2R;
    }
    // done: all three in time — or the time runs out
    if (D.patched.every(Boolean)) D.result = 'saved';
    else if (D.t >= RS.total) D.result = 'lost';
  }
  function C3_dropLanyard(i, D) {
    const obj = World.obj && World.obj('c3fr_lan' + i);
    ORGC.erased.add(i); C3_orgDraw();
    if (!obj) return;
    D.falls = D.falls || [];
    D.falls.push({ obj, v: 0, floor: 0.02, spin: (Math.random() - 0.5) * 3, done: false });
    try { Snd.play('paper', { pos: [obj.position.x, obj.position.y, obj.position.z], vol: 0.5 }); } catch (err) { /* audio */ }
  }
  Enemies.defineType('c3_restructure', {
    hp: 1e9, radius: 0.6, height: 4.6, downs: false, invincible: true, stompable: false, lockable: false, body: false, tell: 'plain',
    threat: (e) => !!e.data.fight && !e.data.result,
    threatDist: (e, pos) => { const f = nearFace(pos.x, pos.z); return f ? f.d : 99; },
    create(e) {
      e.obj = new THREE.Group(); e.obj.name = 'c3_restructure'; e.pos = e.obj.position; e.obj.position.set(1.4, 0, 7.0);
      Object.assign(e.data, { t: 0, fight: false, result: null, patched: [false, false, false], drops: 0, lineT: 4, lineN: 0, lashCd: 3, lashN: 0, lash: null, faceMode: 'on', falls: [] });
      e.data.arms = FR.arms.map((A) => { const o = { k: 0, clickT: 0.6 + Math.random(), dipT: 0 }; o.pos = () => { const p = lerp(A.from, A.to, o.k); return A.axis === 'z' ? [A.x, 2.5, p] : [p, 2.2, A.z]; }; return o; });
      C3_bossFx(e);
      e.threat = false;
    },
    hitbox() { const out = []; for (let z = 1.6; z < 12.6; z += 1.3) out.push({ x: FR.face + 0.2, z, r: 0.75, y0: 0, y1: 4.6 }); return out; },
    stun() { return false; }, knockdown() { return false; },
    onHit(e) {
      // damaging it does nothing: a clang, and it smiles
      const D = e.data;
      try { Snd.play('hit_heavy', { pos: [FR.face, 1.4, Player.pos ? Player.pos.z : 7], vol: 0.6 }); Snd.play('static', { dur: 0.2, vol: 0.25 }); } catch (err) { /* audio */ }
      if ((D.hitLineT || 0) < D.clock) { D.hitLineT = D.clock + 9; D.talkT = 2.2; try { Enemies.say("Hi! I'm here to help.", 'quiet', 2.2); } catch (err) { /* voice */ } }
      return false;
    },
    update(e, dt, ai) { C3_bossUpdate(e, dt, ai); },
    onDie() { /* it doesn't */ },
    remove(e) { for (const m of e.data.mats || []) { try { m.dispose(); } catch (err) { /* gone */ } } if (C3.boss === e) C3.boss = null; },
  });
  // re-patch WAI-j (hold E 3 s with the jumper tool)
  async function C3_patch(G, j) {
    const e = C3.boss;
    if (!e || !e.data.fight || e.data.result || e.data.patched[j]) return;
    if (!G.has('jumper_tool')) { await G.think('I need something to hook it back in with.'); return; }
    e.data.patched[j] = true;
    const jw = G.obj('c3fr_jump' + j); if (jw) jw.visible = true;
    const J = FR.jacks[j];
    G.sfx('plug', { pos: J.pos, vol: 1 });
    G.sfx('static', { dur: 0.4, vol: 0.4, pos: J.pos });
    S.done['c3:patch' + j] = true;
    const n = e.data.patched.filter(Boolean).length;
    if (n < 3) { e.data.talkT = 2.5; try { Enemies.say(n === 1 ? 'Your role has been identified as impacted.' : 'We\'re simplifying the way we work.', 'quiet', 2.6); } catch (err) { /* voice */ } }
  }

  // ---- the frame hall itself ---------------------------------------------------------------------------------------------
  const frameCams = [
    // low inside the doors, up at the frame: the chatbot at the top, WAI-1 below it
    { id: 'c3_frame:doors', vol: [0, 4.3, 7.2, 9.7], type: 'static', pos: [19.1, 0.55, 7.0], target: [1.3, 2.9, 7.0], fov: 'fit' },
    // the frame face from its ends: the cages, the lanyards, the names
    { id: 'c3_frame:westN', vol: [0, 0, 7.2, 4.3], type: 'static', pos: [6.8, 3.4, 12.6], target: [1.4, 1.2, 1.8], fov: 'fit' },
    { id: 'c3_frame:westS', vol: [0, 9.7, 7.2, 14], type: 'static', pos: [6.8, 3.4, 1.4], target: [1.4, 1.2, 12.2], fov: 'fit' },
    // high over the frame, down the centre aisle between the rows
    { id: 'c3_frame:high', vol: [7.2, 3.8, 15.5, 10.2], type: 'static', pos: [1.9, 5.15, 7.0], target: [15.5, 0.2, 7.0], fov: 'fit' },
    // side statics along the jack rows
    { id: 'c3_frame:north', vol: [7.2, 0, 15.5, 3.8], type: 'static', pos: [19.55, 2.55, 1.0], target: [7.0, 0.7, 1.9], fov: 'fit' },
    { id: 'c3_frame:south', vol: [7.2, 10.2, 15.5, 14], type: 'static', pos: [19.3, 2.55, 12.3], target: [7.0, 0.7, 12.2], fov: 'fit' },
    // the doors end, from the opposite corners
    { id: 'c3_frame:eastN', vol: [15.5, 0, 20, 7.0], type: 'static', pos: [19.5, 3.2, 13.6], target: [17.2, 0.4, 2.2], fov: 'fit' },
    { id: 'c3_frame:eastS', vol: [15.5, 7.0, 20, 14], type: 'static', pos: [19.5, 3.2, 0.45], target: [17.4, 0.4, 11.4], fov: 'fit' },
  ];
  defineRoom({
    id: 'c3_frame', name: 'FRAME HALL', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: false, surface: 'concrete', ambient: 'hum',
    fog: { density: 0.028, color: '#353e3c' }, outageFog: { density: 0.03, color: '#15302c' },
    surfaces: [{ box: [0, 0, 20, 14], s: 'metal', world: 'outage' }],
    bounds: [0, 0, 20, 14],
    entries: { hall: [18.9, FR.doorZ, -90], yard: [FR.yardX, 0.95, 0], start: [18.9, FR.doorZ, -90] },
    cameras: frameCams,
    build(K) {
      const H = FR.H, wall = { tex: 'plaster', color: '#a7a391' };
      K.floor(0, 0, 20, 14, { tex: 'concrete', color: '#7c7d76' });
      K.ceiling(0, 0, 20, 14, H, { tex: 'plaster', color: '#9c998a' });
      K.wall(-0.075, 0, 20.075, 0, H, wall, { openings: [{ at: FR.yardX + 0.075, w: 1.0, h: 2.2 }], skirting: true, grime: true });
      K.wall(20.075, 14, -0.075, 14, H, wall, { skirting: true, grime: true });
      K.wall(0, 14.075, 0, -0.075, H, wall, { grime: true });
      K.wall(20, -0.075, 20, 14.075, H, wall, { openings: [{ at: FR.doorZ + 0.075, w: 1.84, h: 2.35 }], skirting: true });
      const doorsOpen = done('c3:doorsOpen');
      // (rot −90: local +x is world +z, so the outer hinges are 'left' on the north leaf and 'right' on the south)
      for (const [z, hinge, leaf] of [[FR.doorZ - 0.46, 'left', 'A'], [FR.doorZ + 0.46, 'right', 'B']]) {
        K.door({ id: 'c3_frame:hall' + leaf, x: 20, z, rot: -90, w: 0.9, style: 'metal', hinge, swing: -1, to: 'c3_hall', entry: 'frame', color: '#5a6660', open: doorsOpen ? 0.92 : 0 });
      }
      K.door({ id: 'c3_frame:yard', x: FR.yardX, z: 0, rot: 180, w: 0.9, style: 'metal', to: 'c3_yard', entry: 'frame', color: '#5a6660', sign: 'YARD',
        locked: (s) => !(s.flags && s.flags.c3_bossDone), lockMsg: "It's locked." });
      K.prop('exit_sign', FR.yardX, 0.075, 0, { mount: 2.45 });
      // ---- the Main Distribution Frame along the west wall, the two frame rows --------------------------------------------
      for (const z of [3.2, 7.0, 10.8]) K.prop('frame_rack', 0.92, z, 90, { len: 3.8, h: 4.2, seed: 'mdf' + z });
      K.box(0.92, 4.6, 7.0, 0.7, 0.12, 11.6, { tex: 'metal', color: '#3d403d' });
      K.prop('frame_rack', 10.5, FR.rowN, 180, { len: FR.rx1 - FR.rx0, h: 2.3, seed: 'rowN' });
      K.prop('frame_rack', 10.5, FR.rowS, 0, { len: FR.rx1 - FR.rx0, h: 2.3, seed: 'rowS' });
      for (let j = 0; j < 3; j++) C3_jackPlate(K, j, { patched: flag('c3_bossDone') ? !!(flag('waiSaved') || done('c3:patch' + j)) : false });
      // switch-arm rails over the frame and the rows (the arms themselves only move in the Outage)
      K.box(1.62, FR.arms[0].y + 0.15, 7.0, 0.1, 0.08, 12.2, { tex: 'metal', color: '#4a4e4a' });
      K.box(10.5, FR.arms[1].y + 0.15, FR.arms[1].z, 7.4, 0.08, 0.1, { tex: 'metal', color: '#4a4e4a' });
      K.box(10.5, FR.arms[2].y + 0.15, FR.arms[2].z, 7.4, 0.08, 0.1, { tex: 'metal', color: '#4a4e4a' });
      // ---- the Fog world: a rolling ladder, the jumper trolley, test sets on hooks, the frame records, FRAME lights ------------
      K.fogOnly(() => {
        K.box(2.2, 0, 9.4, 0.5, 3.4, 0.08, { tex: 'metal', color: '#8d9594' });
        for (let y = 0.3; y < 3.3; y += 0.3) K.box(2.2, y, 9.4, 0.5, 0.03, 0.06, { tex: 'metal', color: '#8d9594' });
        K.box(4.6, 0, 11.8, 0.9, 0.85, 0.6, { tex: 'metal', color: '#6a6e6a' }, { collide: true });
        for (let i = 0; i < 3; i++) K.cyl(4.35 + i * 0.25, 0.85, 11.8, 0.1, 0.08, { color: ['#e8c21a', '#d8d4c8', '#2e5aa0'][i], roughness: 0.5 }, { rx: 90 });
        K.prop('desk', 17.6, 12.9, 180, { variant: 'office' });
        K.plane(17.6, 0.75, 12.8, 0.5, 0.34, noteTex('framecards', 'JUMPER CARDS\n— see Col —\n\nL27: spare, do not use', { w: 320, h: 220, size: 17, y: 34, bg: '#e8e4d0' }), { rot: [-90, 0, 180] });
        K.prop('fluoro_tube', 10.5, 7.0, 90, { h: H - 0.05, lit: circOn('FRAME'), bank: 1, len: 1.5, intensity: 15, distance: 12 });
        K.prop('fluoro_tube', 4.2, 7.0, 90, { h: H - 0.05, lit: circOn('FRAME'), bank: 2, len: 1.5, intensity: 12, distance: 10.5 });
        K.prop('fluoro_tube', 16.6, 7.0, 90, { h: H - 0.05, lit: circOn('FRAME'), bank: 3, len: 1.5, flicker: true, intensity: 12, distance: 10.5 });
        K.sign('FRAME — NO UNAUTHORISED JUMPERING', 12.0, 3.4, 13.92, 2.2, 0.26, { rotY: 180, style: 'warning' });
        // a jointer's work lamp on a stand, turned toward the frame (on after the Restructure: Wai's light to sit by)
        K.cyl(3.1, 0, 10.1, 0.025, 1.55, { tex: 'metal', color: '#3a3d3a' });
        for (const a of [0, 120, 240]) K.box(3.1 + Math.sin(a * D2R) * 0.2, 0, 10.1 + Math.cos(a * D2R) * 0.2, 0.04, 0.03, 0.42, { tex: 'metal', color: '#3a3d3a' }, { rot: a });
        K.box(3.1, 1.5, 10.1, 0.26, 0.2, 0.18, { color: '#c9a21a', roughness: 0.5 }, { rot: 35 });
        K.light('point', 2.85, 1.45, 9.75, { color: '#ffd8a8', intensity: 1.8, distance: 5, name: 'c3fr:work', on: flag('c3_bossDone'), world: 'fog' });
      });
      for (let i = 0; i < 4; i++) K.prop('headset', 7.2 + i * 0.4, FR.rowS + 0.56, 0, { variant: 'hook', mount: 1.55 });
      // ---- the Outage: the org chart of cages, the chatbot screen, the arms, receipts, tethers climbing the frame ---------------
      K.outageOnly(() => {
        const cop = { color: '#8a5a2a', roughness: 0.45, metalness: 0.6, emissive: '#3a1a08', emissiveIntensity: 0.35 };
        const fx = FR.face + 0.2;
        const node = (i) => ORG.nodes[i];
        // copper org-chart lines: each child up to a bus, the bus across, the parent down to it
        const levels = [[-1, ORG.screen.y - 0.5], [0, 3.4], [1, 2.42]];
        void levels;
        const lineV = (z, y0, y1) => K.box(fx - 0.02, Math.min(y0, y1), z, 0.035, Math.abs(y1 - y0), 0.035, cop);
        const lineH = (z0, z1, y) => K.box(fx - 0.02, y - 0.0175, (z0 + z1) / 2, 0.035, 0.035, Math.abs(z1 - z0) + 0.035, cop);
        const lvl1 = ORG.nodes.filter((n) => n.lv === 1);
        const busY0 = 3.9; lineV(ORG.screen.z, busY0, ORG.screen.y - 0.45); lineH(lvl1[0].z, lvl1[2].z, busY0);
        ORG.nodes.forEach((n) => {
          if (n.lv === 1) { lineV(n.z, n.y + 0.21, busY0); return; }
          const p = n.lv === 2 ? lvl1[n.parent] : node(n.parent), busY = (p.y + n.y) / 2 - 0.05;
          lineV(n.z, n.y + 0.21, busY); lineV(p.z, p.y - 0.21, busY); lineH(Math.min(n.z, p.z), Math.max(n.z, p.z), busY);
        });
        // the cages, each holding a lanyard (the lanyards drop as names are erased)
        const bar = { tex: 'metal', color: '#2c2f2c', roughness: 0.6 };
        ORG.nodes.forEach((n, i) => {
          const s = n.lv === 1 ? 0.46 : 0.4, cx = fx + 0.12, y0 = n.y - s / 2;
          for (const [dy, dz] of [[0, -1], [0, 1], [1, -1], [1, 1]]) K.box(cx, y0 + dy * s - 0.01, n.z + dz * s / 2, 0.3, 0.02, 0.02, bar);
          for (const dz of [-1, 1]) for (const dx of [-1, 1]) K.box(cx + dx * 0.14, y0, n.z + dz * s / 2, 0.02, s, 0.02, bar);
          for (let k = 1; k < 4; k++) K.box(cx + 0.15, y0, n.z - s / 2 + (k * s) / 4, 0.012, s, 0.012, bar);
          const erasedNow = flag('c3_bossDone') && (i !== ORG.wai || !flag('waiSaved'));
          const lan = new THREE.Group(); lan.name = 'c3fr_lan' + i;
          const strap = K.mat({ color: i === ORG.wai ? '#1f6f6a' : '#00a8a8', roughness: 0.6 });
          for (const sgn of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.018), strap); m.position.set(0, -0.1, sgn * 0.04); m.rotation.x = sgn * 0.3; m.userData.ownedGeo = true; lan.add(m); }
          const card = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.1), K.mat({ color: '#f0ece0', roughness: 0.5 })); card.position.set(0.012, -0.26, 0); card.rotation.y = Math.PI / 2; card.geometry.userData.ownedGeo = true; lan.add(card);
          lan.position.set(cx, erasedNow ? 0.02 : n.y + 0.1, n.z + (erasedNow ? (i % 3 - 1) * 0.3 : 0));
          if (erasedNow) { lan.position.x = cx + 0.6 + (i % 4) * 0.25; lan.rotation.set(-Math.PI / 2 + 0.2, i, 0.3); }
          K.mesh(lan, { name: 'c3fr_lan' + i, world: 'outage' });
        });
        // the names, on one transparent sheet over the frame face
        ORGC.erased = new Set(flag('c3_bossDone') ? ORG.nodes.map((n, i) => i).filter((i) => i !== ORG.wai || !flag('waiSaved')) : []);
        C3_orgDraw();
        K.plane(fx + 0.31, (ORG_Y0 + ORG_Y1) / 2, (ORG_Z0 + ORG_Z1) / 2, ORG_Z1 - ORG_Z0, ORG_Y1 - ORG_Y0, ORGC.tex, { rotY: 90, transparent: true, alphaTest: 0.05, name: 'c3fr_names' });
        // the chatbot screen at the top of the frame, in a steel bezel
        K.box(fx + 0.02, ORG.screen.y - 0.52, ORG.screen.z, 0.12, 1.04, 1.44, { tex: 'metal', color: '#1a1c1c' });
        C3_faceDraw({ mode: flag('c3_bossDone') ? 'dead' : 'on' });
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), new THREE.MeshBasicMaterial({ map: FACE.tex, toneMapped: false }));
        scr.position.set(fx + 0.09, ORG.screen.y, ORG.screen.z); scr.rotation.y = Math.PI / 2; scr.userData.ownedGeo = true;
        K.mesh(scr, { name: 'c3fr_screen', world: 'outage' });
        K.light('point', fx + 1.2, ORG.screen.y - 0.2, ORG.screen.z, { color: '#f4c8dc', intensity: 6.5, distance: 12, name: 'c3fr:screenGlow' });
        // a red warning wash over the WAI-1 end of the frame, and the cold light off the one tube still burning overhead
        K.light('point', 3.1, 3.6, 5.4, { color: '#ff5a40', intensity: 3.4, distance: 8.5, flicker: true });
        K.light('point', 10.5, 4.7, 7.0, { color: '#8fd0cc', intensity: 4.6, distance: 13 });
        // the switch-arms: a carriage on its rail, a rod that dips to the frame, a gripper, a red lamp
        FR.arms.forEach((A, j) => {
          const g = new THREE.Group(); g.name = 'c3fr_arm' + j;
          const iron = K.mat({ tex: 'metal', color: '#3a3d3a', roughness: 0.55, metalness: 0.5 });
          const car = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), iron); car.userData.ownedGeo = true; g.add(car);
          const rod = new THREE.Mesh(new THREE.BoxGeometry(0.06, A.y - A.dipTo, 0.06), iron); rod.name = 'c3arm_rod'; rod.userData.ownedGeo = true; g.add(rod);
          const hand = new THREE.Group(); hand.name = 'c3arm_hand'; g.add(hand);
          for (const sgn of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), iron); f.position.set(A.axis === 'z' ? -0.08 : sgn * 0.05, -0.05, A.axis === 'z' ? sgn * 0.05 : (A.z < 7 ? 0.08 : -0.08)); f.rotation.z = sgn * 0.25; f.userData.ownedGeo = true; hand.add(f); }
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1c', toneMapped: false })); lamp.position.y = 0.13; lamp.userData.ownedGeo = true; g.add(lamp);
          K.mesh(g, { name: 'c3fr_arm' + j, world: 'outage' });
        });
        K.animate(() => { if (!C3.boss) for (let j = 0; j < 3; j++) C3_armPose(j, flag('c3_bossDone') ? 0.9 : 0, 0.3); });
        // wire bundles hanging from the cable ladders; they move when the frame wakes
        const bundles = [];
        for (const [x, z] of [[1.3, 2.4], [1.3, 5.9], [1.3, 9.2], [1.3, 12.1], [9.2, FR.rowN], [12.4, FR.rowS], [8.1, FR.rowS], [13.1, FR.rowN]]) {
          const top = x < 2 ? 4.6 : 2.7;
          bundles.push(C3_wire(K, [x + 0.2, top, z - 0.5], [x + 0.2, top, z + 0.5], 1.4 + (z % 1) * 0.5, 0.035, '#2a2a2a', { static: false, name: 'c3fr_bundle' + bundles.length, world: 'outage' }));
        }
        K.animate((dt, t) => { const a = C3.wires || 0; bundles.forEach((b, i) => { if (b) { b.rotation.x = Math.sin(t * (1.3 + i * 0.21) + i) * 0.08 * a; b.rotation.z = Math.sin(t * (0.9 + i * 0.17)) * 0.05 * a; } }); });
        for (let i = 0; i < 8; i++) K.prop('receipt_strip', 4 + i * 2.0, i % 2 ? 1.6 : 12.4, i * 30, { ceil: H, len: 2.2 + (i % 3) });
        for (let i = 0; i < 6; i++) K.prop('tether_hanging', 1.6, 1.8 + i * 2.1, 0, { ceil: H, len: 2.6 + (i % 2) });
        for (let i = 0; i < 4; i++) K.prop('contract_stack', 18.6 + (i % 2) * 0.45, 2.2 + i * 0.5, i * 31, { h: 1.0 + (i % 3) * 0.3 });
        for (const [x, z] of [[7.2, 3.44], [9.8, 3.44], [12.6, 3.44], [8.4, 10.56], [11.6, 10.56], [13.4, 10.56], [1.28, 3.1], [1.28, 9.6], [1.28, 11.9]]) K.light('led', x, 1.9 + (x % 1) * 0.6, z, { color: '#ff2a1c', blink: 0.7 + (z % 1), intensity: 3 });
        K.light('point', 18.6, 2.6, FR.doorZ, { color: '#ff3322', intensity: 3.0, distance: 7.5, flicker: true });
        K.prop('fluoro_tube', 10.5, 7.0, 90, { h: H - 0.05, flicker: true, len: 1.5, bank: 2 });
        K.writing('THANK YOU FOR YOUR CONTRIBUTION', 19.92, 3.3, 11.0, 3.0, { rotY: -90, style: 'receipt', world: 'outage' });
        K.writing('WHO ARE YOU TRYING TO REACH', 10.0, 3.6, 13.92, 3.2, { rotY: 180, world: 'outage' });
        K.dress('receipts', [2, 0.5, 19, 13.5], 34, { seed: 421 });
        K.dress('contracts', [15.5, 0.5, 19.5, 5.5], 10, { seed: 422 });
      });
      // the receipt map, curled on the floor by the doors: it came with the Outage and it stays after (both worlds, so it
      // can't be missed once the fight is over; the Fog frame hall is only reachable after CUTSCENE 3-2)
      K.pickup('rmap_exchange', 17.4, 0.02, 8.2, { id: 'c3_frame:rmap', glint: true, r: 1.2 });
      // the WAI jacks (the boss's hold-E points)
      FR.jacks.forEach((J, j) => K.interact(J.stand[0], J.pos[1] + 0.1, J.stand[1], (G) => C3_patch(G, j),
        { id: 'c3_frame:jack' + j, r: 1.25, hold: 3, holdText: 'Re-patch the line', world: 'outage', when: () => !!(C3.boss && C3.boss.data.fight && !C3.boss.data.result && !C3.boss.data.patched[j]) }));
      // ---- through the east doorway: the west end of the Operators' Hall (Wai's board) -----------------------------------------
      const R = FR.replica;
      K.box(25.5, -0.05, 7.0, 11, 0.05, 13.5, { tex: 'lino', color: '#6e5e4a' });
      K.box(25.5, HL.H, 7.0, 11, 0.05, 13.5, { tex: 'plaster', color: '#a9a595' });
      K.box(31.2, 0, 7.0, 0.3, HL.H, 13.5, { color: '#0a0c0c', roughness: 1 });
      K.box(25.5, 0, 0.25, 11, HL.H, 0.2, { tex: 'plaster', color: '#bdb7a0' });
      K.box(25.5, 0, 13.85, 11, HL.H, 0.2, { tex: 'plaster', color: '#bdb7a0' });
      C3_rows(K, { dx: R.dx, dz: R.dz, xMax: 11, stools: false, suffix: '_fr', seed: 3 });
      K.prop('stool', HL.wai[0] + R.dx, HL.wai[1] + R.dz, 180, { variant: 'operator', collide: false });
      K.prop('stool', HL.stool2[0] + R.dx, HL.stool2[1] + R.dz, 160, { variant: 'operator', collide: false });
      const altHs = K.prop('headset', HL.wai[0] + R.dx, HL.wai[1] + R.dz + 0.02, 20, { y: 0.7, name: 'c3fr_altHeadset' });
      const altNote = K.plane(HL.wai[0] + R.dx + 0.05, 0.695, HL.wai[1] + R.dz - 0.05, 0.12, 0.09, noteTex('wainote', 'Your mate went to the call centre. Heard phones. Good luck, mate.', { w: 256, h: 192, size: 20, y: 40 }), { rot: [-90, 0, 14], name: 'c3fr_altNote' });
      if (altHs) altHs.visible = flag('waiLost'); if (altNote) altNote.visible = flag('waiLost');
      K.light('point', 27.3, 1.7, 6.35, { color: '#a8bcc8', intensity: 1.6, distance: 3.2, name: 'c3fr:noteLight', on: flag('waiLost'), world: 'fog' });
      K.light('point', 7.1 + R.dx, 1.6, 5.1 + R.dz, { color: '#ffcf8a', intensity: 3.4, distance: 6, name: 'c3fr:waiLamp', on: flag('c3_bossDone') && flag('waiSaved'), world: 'fog' });
      // the WAI lamp's glow (a camera-facing halo, so it reads from the doorway at the board's shallow angle)
      K.light('led', WB.lampWai[0] + R.dx, WB.lampWai[1], WB.lampWai[2] + R.dz + 0.05, { color: '#ffc870', size: 0.02, intensity: 4, halo: 0.3, name: 'c3fr:waiLed', on: flag('c3_bossDone') && flag('waiSaved'), world: 'fog' });
      for (let i = 0; i < 3; i++) K.light('led', 22 + i * 3.4, 3.5, 6.63 + R.dz, { color: '#ffd9a0', size: 0.05, intensity: 2.5, halo: 0.7, on: circOn('HALL'), world: 'fog' });
      K.light('point', 25.4, 3.3, 6.63 + R.dz, { color: '#ffcf94', intensity: 2.6, distance: 9, on: circOn('HALL'), world: 'fog' });
      // ---- examine ------------------------------------------------------------------------------------------------------------
      K.examine(2.2, 1.5, 3.2, ['The main frame. Every line on the hill comes in here and gets pinned to a number.', 'Jumper wire, thousands of runs of it. Somebody knew where every one went.'], { id: 'c3fr:frame', r: 1.6, world: 'fog' });
      K.examine(10.5, 1.4, 4.6, 'Frame rows. Rings full of wire. [beat] It smells like hot dust in here.', { id: 'c3fr:rows', r: 1.5, world: 'fog' });
      K.examine(4.6, 1.1, 11.2, 'A jumper trolley. Reels of yellow, white, blue. A pair of pliers left on top.', { id: 'c3fr:trolley', r: 1.3, world: 'fog' });
      K.examine(17.6, 1.0, 12.5, '"Jumper cards — see Col." [beat] "L27: spare. Do not use."', { id: 'c3fr:cards', r: 1.3, world: 'fog' });
      K.examine(7.8, 1.6, FR.rowS + 0.9, 'Test sets on hooks. The lineman\'s phones. [beat] One of them\'s still warm.', { id: 'c3fr:testsets', r: 1.3, world: 'fog' });
      K.examine(FR.jacks[0].stand[0], 1.2, FR.jacks[0].stand[1], async (G) => {
        if (flag('waiSaved')) await G.think('WAI-1. [beat] Still patched. Yellow jumper, hooked back in.');
        else await G.think('WAI-1. [beat] The jumper hangs loose.');
      }, { id: 'c3fr:wai1', r: 1.0, world: 'fog', when: () => flag('c3_bossDone') });
    },
    onUpdate() { C3_ambient(['#6a7774', 0.44], ['#3a7580', 0.5]); },
    onLeave() { C3_ambientOff(); C3.wires = 0; },
  });

  // the boss: re-patch WAI-1, WAI-2 and WAI-3 within 150 seconds; waiSaved if all three are in time
  defineBoss('restructure', {
    async run(G) {
      let e = C3.boss || G.enemy('c3_frame:restructure');
      if (!e) e = G.spawn({ id: 'c3_frame:restructure', type: 'c3_restructure', persist: false, pos: [1.4, 7.0], rot: 90, world: 'outage' });
      if (!e) return 'lost';
      C3.boss = e;
      const D = e.data;
      D.fight = true; D.t = 0; D.result = null; D.patched = [false, false, false];
      for (const a of D.arms || []) a.k0 = a.k || 0;          // (the arms carry on from where CUTSCENE 3-2 left them)
      e.threat = true;
      C3.wires = 1;
      G.control(true);
      G.prompt('Hold {interact} at a WAI jack: re-patch the line.', { id: 'c3_repatch' });
      note(G, 'WAI-1, WAI-2, WAI-3. Patch them back in before it gets to him.', 'c3_goal');
      await G.until(() => !!D.result || e.removed);
      D.fight = false; e.threat = false;
      const r = D.result || 'lost';
      return r;
    },
  });

  // =================================================================================================================
  // 3K THE REAR YARD — 20 × 10 m behind the building. The frame hall's side door in the south wall (x 16), the yard
  // gate west (z 5) onto Wire Lane — locked until the Restructure is beaten; then open, and the way on (Chapter 4).
  // =================================================================================================================
  const YD = { door: 16, gateZ: 5.0 };
  defineRoom({
    id: 'c3_yard', name: 'REAR YARD', area: 'SIGNAL HILL TRUNK EXCHANGE', chapter: 3, outdoor: true, surface: 'gravel', ambient: 'wind',
    fog: { density: 0.042 },
    surfaces: [{ box: [0, 7.5, 20, 10], s: 'concrete' }],
    bounds: [-3.6, 0, 20, 10],
    entries: { frame: [YD.door, 8.95, 180], lane: [1.3, YD.gateZ, 90], start: [YD.door, 8.95, 180] },
    cameras: [
      // high from the frame hall's roofline, over the yard to the gate
      // (the west third belongs to the gate camera: from up here Aidan was lost in the fog down by the gate)
      { id: 'c3_yard:roof', vol: [5.2, 0, 13, 6.2], type: 'static', pos: [16.5, 6.9, 9.7], target: [6.5, 0, 2.8], fov: 'fit' },
      // the gate itself, from inside the yard: the open leaves, the lane dropping away into the fog beyond
      { id: 'c3_yard:gate', vol: [-3.6, 0, 5.2, 7.4], pri: 1, type: 'static', pos: [9.6, 2.6, 8.95], target: [-1.0, 0.9, 4.4], fov: 'fit' },
      // the drums, the skip and the side door he comes out of, from across the yard
      { id: 'c3_yard:east', vol: [13, 0, 20, 10], type: 'static', pos: [6.4, 3.2, 1.0], target: [18.2, 0.3, 4.2], fov: 'fit' },
      // along the building from outside the gate corner: the smokers' bench, the dead floodlight
      { id: 'c3_yard:wall', vol: [0, 6.2, 13, 10], type: 'static', pos: [-1.6, 3.2, -1.0], target: [7.5, 0.6, 8.4], fov: 'fit' },
    ],
    build(K) {
      K.floor(0, 0, 20, 10, 'gravel');
      K.floor(0, 7.5, 20, 10, 'concrete');
      // the building's back wall (south), the side door
      K.wall(-0.2, 10.2, 20.2, 10.2, 7.5, { tex: 'brick', color: '#735c4b' }, { openings: [{ at: YD.door + 0.2, w: 1.0, h: 2.2 }], thick: 0.4, grime: true });
      for (let i = 0; i < 6; i++) K.plane(2 + i * 3.2, 4.6, 9.98, 1.1, 2.1, winTex(i + 5), { rotY: 180 });
      K.door({ id: 'c3_yard:frame', x: YD.door, z: 10.2, rot: 0, w: 0.9, style: 'metal', to: 'c3_frame', entry: 'yard', color: '#5a6660', sign: 'EXCHANGE — STAFF ONLY' });
      // chain-link and barbed wire round the yard; the gate in the west fence
      K.prop('chainlink', 10, 0.1, 0, { len: 20, h: 2.4, barbed: true });
      K.prop('chainlink', 19.9, 5, -90, { len: 10, h: 2.4, barbed: true });
      K.prop('chainlink', 0.1, 1.5, 90, { len: 3, h: 2.4, barbed: true });
      K.prop('chainlink', 0.1, 8.6, 90, { len: 3.2, h: 2.4, barbed: true });
      K.collider(0, -0.1, 20, 0.3, { h: 2.6 }); K.collider(19.7, 0, 20.1, 10, { h: 2.6 });
      K.collider(-0.1, 0, 0.3, YD.gateZ - 2.0, { h: 2.6 }); K.collider(-0.1, YD.gateZ + 2.0, 0.3, 10, { h: 2.6 });
      const open = flag('c3_bossDone');
      const leaf = (z0, dir) => {
        const g = new THREE.Group();
        const galv = K.mat({ tex: 'metal', color: '#a4aba6', roughness: 0.5 });
        const mesh = K.mat({ tex: 'chainlink', color: '#b8bdb8', transparent: true, alphaTest: 0.3 }).clone(); mesh.side = THREE.DoubleSide; mesh.userData.shared = false;
        const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.userData.ownedGeo = true; g.add(o); return o; };
        add(new THREE.BoxGeometry(0.05, 2.2, 0.05), galv, 0, 1.1, 0); add(new THREE.BoxGeometry(0.05, 2.2, 0.05), galv, 0, 1.1, dir * 1.95);
        add(new THREE.BoxGeometry(0.04, 0.04, 1.95), galv, 0, 2.18, dir * 0.975); add(new THREE.BoxGeometry(0.04, 0.04, 1.95), galv, 0, 0.1, dir * 0.975);
        const p = add(new THREE.PlaneGeometry(1.9, 2.05), mesh, 0, 1.12, dir * 0.975); p.rotation.y = Math.PI / 2;
        g.position.set(0.1, 0, z0); g.rotation.y = open ? -dir * 70 * D2R : 0;
        K.mesh(g, { static: true });
      };
      leaf(YD.gateZ - 2.0, 1); leaf(YD.gateZ + 2.0, -1);
      if (!open) {
        K.box(0.12, 0.95, YD.gateZ, 0.05, 0.08, 0.1, { tex: 'metal', color: '#b69a4a', metalness: 0.7, roughness: 0.35 });
        K.blocker(-0.1, YD.gateZ - 2.0, 0.35, YD.gateZ + 2.0, "It's locked.", { mapMark: true });
      }
      K.examine(1.0, 1.2, YD.gateZ, async (G) => {
        if (flag('c3_bossDone')) { await G.think('The gate\'s open. [beat] Wire Lane, down the hill.'); return; }
        await G.think('The yard gate. Chained and padlocked. [beat] Wire Lane\'s on the other side.');
      }, { id: 'c3yd:gate', r: 1.6 });
      // beyond the gate: the lane dropping away west into the fog (walkable a few metres out, so the gate's trigger / the
      // exit to Wire Lane can be reached — without a floor there Aidan stops at the yard's edge, short of the box)
      K.box(-6, -0.4, YD.gateZ, 12, 0.4, 5.0, 'gravel');
      K.floor(-3.4, YD.gateZ - 2.0, 0, YD.gateZ + 2.0, 'gravel', { visible: false });
      K.blocker(-3.6, YD.gateZ - 2.2, -3.2, YD.gateZ + 2.2, null);
      K.prop('power_pole', -4, 2.2, 0, { h: 9, span: 0 });
      // the yard: cable drums, a stack of pallets, a skip, the old lines truck, a smokers' bench, a dead floodlight
      K.prop('cable_drum', 5.2, 2.2, 20, { variant: 'standing' });
      K.prop('cable_drum', 7.0, 1.6, 80, {});
      K.prop('cable_drum', 11.6, 2.6, -10, { variant: 'standing' });
      K.prop('pallet', 14.2, 1.4, 12, { n: 4, load: 'wrapped' });
      K.prop('dumpster', 17.8, 2.0, -90, {});
      K.prop('car', 8.2, 8.5, 90, { color: '#d8d6cc', variant: 'wagon', plate: 'LINES-7' });   // (against the building: from the roofline camera it hid the yard)
      K.prop('bench', 13.2, 9.5, 180, { len: 1.6 });
      K.cyl(12.4, 0, 9.55, 0.12, 0.28, { tex: 'metal', color: '#8a6a3a' });
      K.prop('floodlight', 3.0, 9.2, 30, { variant: 'pole', lit: false, light: false });
      K.prop('gum_tree', -3.5, -2.5, 60, { seed: 31 });
      K.light('street', 18.6, 5.6, 9.6, { bank: 1 });
      K.box(18.6, 0, 9.85, 0.12, 5.6, 0.12, { tex: 'metal', color: '#a4aba6' });
      K.box(18.6, 5.5, 9.3, 0.08, 0.08, 1.2, { tex: 'metal', color: '#a4aba6' });
      K.dress('leaves', [0.5, 0.5, 19.5, 7.3], 18, { seed: 431 });
      K.dress('cables', [3, 0.5, 13, 4], 6, { seed: 432 });
      // the way on: through the open gate (the chapter card), or back to Wire Lane once Chapter 4 exists
      // (the trigger sits in the gate's mouth, in front of the exit box: an exit whose when() is false is a blocker, so a
      // trigger inside it could never be entered)
      K.trigger([0.3, YD.gateZ - 1.9, 1.3, YD.gateZ + 1.9], (G) => C3_toWireLane(G), { id: 'c3_yard:out', once: false, when: () => flag('c3_bossDone') && S.chapter === 3 });
      K.exit({ id: 'c3_yard:lane', box: [-1.2, YD.gateZ - 1.9, 0.25, YD.gateZ + 1.9], to: 'c4_wirelane', entry: 'yard', when: () => S.chapter >= 4 && !!ROOMS.c4_wirelane, blockedMsg: null, mapMark: false });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(8.2, 1.2, 7.4, ['The old lines truck. "LINES 7" stencilled on the door.', 'Ladders on the roof rack, a flask on the dash. [beat] Somebody\'s whole day, parked.'], { id: 'c3yd:truck', r: 2.2 });
      K.examine(5.2, 1.0, 2.2, 'Cable drums. Hundreds of metres of copper nobody\'s ever going to lay now.', { id: 'c3yd:drums', r: 1.5 });
      K.examine(13.2, 0.8, 9.3, 'The smokers\' bench. A coffee tin full of butts. [beat] Somebody took their breaks out here in the cold.', { id: 'c3yd:bench', r: 1.4 });
      K.examine(17.8, 1.0, 2.0, 'A skip full of old handsets. Hundreds of them, cords all knotted together.', { id: 'c3yd:skip', r: 1.6 });
      K.examine(3.0, 1.4, 9.0, 'A floodlight on a pole, dead. Pointing at nothing.', { id: 'c3yd:flood', r: 1.4 });
    },
    async onEnter(G, from) {
      if (from === 'c3_frame' && flag('c3_bossDone') && S.chapter === 3 && G.once('c3:yardIn')) {
        await G.wait(0.9);
        await G.think('Air. [beat] The gate\'s open.');
        G.mapMark('c3_yardgate', { at: [0.5, YD.gateZ], t: 'circle' });
      }
    },
  });
  // the yard gate → CHAPTER CARD "CUSTOMER CARE" (G.startChapter(4) goes to c4_wirelane:yard)
  async function C3_toWireLane(G) {
    if (S.chapter !== 3 || C3.leaving) return;
    C3.leaving = true;
    try {
      noteDone('c3_goal');
      const ok = await G.startChapter(4);
      if (ok === false) {
        // (no Chapter 4 in this build: show its card and hand the yard back)
        await G.card('CUSTOMER CARE');
        await G.fade(0, 1.0);
      }
    } finally { C3.leaving = false; }
  }

  // =================================================================================================================
  // CUTSCENE 3-1 "The Last Operator" (the Operators' Hall, first entry from the foyer)
  // =================================================================================================================
  // world positions on Wai's board (row 2's westmost two positions, centre x 7.3): its named lamps WAI and 27
  const WB = { lamp27: [6.56, 1.8, 3.93], lampWai: [6.43, 1.8, 3.93], shelf: [7.3, 0.78, 4.35], plug: [7.1, 1.35, 3.99] };
  function C3_camOnHand(G, W, hand, off, toff, fov) {
    const hp = new THREE.Vector3(), g = W && W.raw && W.raw.anchors && W.raw.anchors['grip' + hand];
    if (!g) return false;
    g.getWorldPosition(hp);
    G.cam({ pos: [hp.x + off[0], hp.y + off[1], hp.z + off[2]], target: [hp.x + toff[0], hp.y + toff[1], hp.z + toff[2]], fov });
    return true;
  }
  function C3_wai(G, o = {}) {
    const W = G.actor('wai', 'wai', o);
    if (W.raw) W.raw.idleLife = false;
    C3_noCord(W.raw);
    return W;
  }
  defineCutscene('3-1', async (G) => {
    const A = G.aidan, W = C3_wai(G);
    const board = G.obj('c3_waiboard');
    const torch0 = !!Player.torchOn;
    // Wai at his board, headset on, working the cords
    W.place(HL.wai[0], HL.wai[1] - 0.02, 180);
    W.pose('work', { seated: true, seat: 0.64 });
    if (W.raw) { try { W.raw.wear('headset', true); } catch (e) { /* rig */ } W.raw.eyes('down'); }
    if (A.raw) A.raw.idleLife = false;
    Player.setTorch(true);                                   // (the hall is dark: his light goes down the aisle ahead of him)
    // the lit board's glow on the faces of the two men sitting at it (the board lamp alone lights only their backs)
    G.addLight('point', { pos: [7.25, 1.42, 4.66], color: '#ffc47e', intensity: 1.15, distance: 1.9 });
    // 1. SHOT — a long symmetrical shot down the hall: rows of dark boards; at the far end one board lit, a man at it.
    await G.fade(1, 0);
    C3_emptyHands(A);
    A.place(37.6, HL.mid, -90);
    A.pose('idle');
    // (Aidan walks into the bottom of the frame, his light going down the aisle ahead of him toward the lit board)
    // (the letterbox crops the frame: the lens tilts down enough to find him under it, the lit board still at the top)
    G.cam({ pos: [39.35, 3.2, HL.mid], target: [5.0, -2.9, HL.mid], fov: 40, to: { pos: [38.7, 3.15, HL.mid], target: [5.0, -2.7, HL.mid], fov: 38 }, dur: 11, ease: 'linear' });
    G.music('line', { vol: 0.55 });
    await G.fade(0, 1.4);
    await G.wait(1.6);
    const walk1 = q(A.walkTo(31.4, HL.mid - 0.1, { speed: 0.95 }));
    await G.wait(4.2);
    if (board && board.userData.setLamp) board.userData.setLamp('27', 'blink');
    await G.wait(1.2);
    await walk1;
    // 2. SHOT — side medium: Wai works without looking up, reading glasses on. Pulls a cord, plugs it elsewhere, listens.
    A.place(9.6, 5.95, -100);
    G.cam({ pos: [4.55, 1.45, 6.55], target: [7.0, 1.12, 5.0], fov: 40, to: { pos: [4.65, 1.44, 6.45], fov: 38 }, dur: 9 });
    await G.wait(0.4);
    q(W.gesture('reach', { hand: 'R', target: WB.plug }));
    G.sfx('plug', { pos: WB.plug, vol: 0.6 });
    await G.wait(1.1);
    q(A.walkTo(8.55, 5.55, { speed: 0.85 }));
    await G.wait(0.6);
    q(W.gesture('reach', { hand: 'R', target: [7.5, 1.55, 3.99] }));
    G.sfx('click', { pos: [7.5, 1.55, 3.99], vol: 0.6 });
    await G.wait(1.0);
    await G.say('WAI', 'Take a seat, mate. [beat] I\'m on a call.');
    // Aidan sits on the operator's stool beside him
    await A.walkTo(HL.stool2[0] + 0.05, HL.stool2[1] + 0.35, { speed: 0.8 });
    await A.turn(180, 0.5);
    A.place(HL.stool2[0], HL.stool2[1], 180);
    A.pose('sit', { seat: 0.64 });
    await G.wait(0.9);
    // 3. SHOT — close on Wai listening. Faint, unintelligible voices leak from the headset.
    G.cam({ pos: [6.2, 1.55, 4.66], target: [HL.wai[0] + 0.05, 1.34, HL.wai[1] - 0.02], fov: 34, to: { pos: [6.24, 1.54, 4.68], fov: 31 }, dur: 12 });
    W.pose('sit', { seat: 0.64 });
    if (W.raw) W.raw.eyes('down');
    try { Snd.murmur('tethered', { pos: [HL.wai[0], 1.4, HL.wai[1]], dur: 2.6, vol: 0.3 }); } catch (e) { /* audio */ }
    await G.wait(2.4);
    await G.say('WAI', 'Yes. [beat] No, love. I can\'t put you through. That number\'s not connected. [beat] I know. I\'m sorry.');
    await G.wait(0.4);
    q(W.gesture('reach', { hand: 'R', target: [7.5, 1.55, 3.99] }));
    G.sfx('click', { pos: [7.5, 1.55, 3.99], vol: 0.7 });
    await G.wait(1.3);
    // 4. SHOT — two-shot: side by side at the board, looking at it more than at each other
    G.cam({ pos: [9.55, 1.42, 6.05], target: [7.25, 1.12, 5.0], fov: 38, to: { pos: [9.45, 1.41, 5.95], fov: 36 }, dur: 20 });
    W.look(G.aidan);
    await G.wait(0.5);
    q(W.gesture('offer', { hand: 'L', target: [HL.stool2[0], 1.0, HL.stool2[1] - 0.2] }));
    await G.say('WAI', 'Wai.');
    q(A.gesture('reach', { hand: 'L', target: [7.3, 1.0, 5.0] }));
    await G.say('AIDAN', 'Aidan. [beat] Who was that?');
    W.look(null); if (W.raw) W.raw.eyes('down');
    await G.wait(0.6);
    await G.say('WAI', 'Someone trying to reach someone. It\'s all it ever is. [beat] Lines come in here that shouldn\'t. Always have. The women who worked these boards used to log them.');
    A.look(W);
    await G.say('AIDAN', 'You work for us? The company?');
    await G.wait(0.3);
    W.look(G.aidan);
    await G.say('WAI', 'Eighteen years. Started right here, actually. Tech on the copper, last crew before they switched it off. [beat] Now I fix cracked screens in a shopping centre.');
    W.look(null); A.look(null);
    // 5. SHOT — close on hands: he takes Aidan's phone, taps it twice against the board, plugs a cord in beside it
    Player.setTorch(false);
    const ph = Player.actor && Player.actor.held && Player.actor.held.R;
    if (ph) ph.visible = false;
    W.pose('work', { seated: true, seat: 0.64 });
    W.hold('L', 'phone');
    await G.wait(0.1);                                       // (the rig takes the pose and the phone on its next frame)
    if (!C3_camOnHand(G, W, 'L', [0.14, 0.42, -0.36], [0, -0.03, 0.02], 40)) G.cam({ pos: [6.9, 1.3, 4.45], target: [6.8, 0.86, 4.8], fov: 40 });
    await G.wait(0.7);
    q(W.gesture('tap_bar', { hand: 'L' }));
    await G.wait(0.35); G.sfx('glass_knock', { pos: WB.shelf, vol: 0.6 });
    await G.wait(0.35); G.sfx('glass_knock', { pos: WB.shelf, vol: 0.6 });
    await G.wait(0.5);
    q(W.gesture('reach', { hand: 'R', target: [7.25, 1.3, 3.99] }));
    G.sfx('plug', { pos: WB.plug, vol: 0.8 });
    G.bars('flicker');
    G.sfx('static', { dur: 0.8, vol: 0.4, phone: true });
    await G.wait(1.6);
    G.bars(null);
    W.hold('L', null);
    if (ph) ph.visible = true;
    Player.setTorch(torch0);
    G.cam({ pos: [9.3, 1.4, 5.9], target: [7.3, 1.13, 5.0], fov: 34, to: { pos: [9.2, 1.4, 5.82], fov: 32 }, dur: 30 });
    W.look(G.aidan);
    await G.say('WAI', 'There. You\'ll get bars now when they\'re close. The closer they are, the more.');
    await G.say('AIDAN', 'On the phone, you said—');
    await G.say('WAI', 'Full bars means something\'s found you. Nothing gets signal in Signal Hill. Nothing that\'s supposed to.');
    W.look(null); if (W.raw) W.raw.eyes('down');
    await G.say('AIDAN', 'What are they?');
    await G.longBeat();
    W.look(G.aidan); if (W.raw) W.raw.eyes('at', G.aidan);
    await G.say('WAI', 'What do you reckon they are?');
    // Aidan says nothing
    if (A.raw) A.raw.eyes('down');
    await G.wait(2.4);
    W.look(null); if (W.raw) W.raw.eyes('ahead');
    await G.say('WAI', 'It doesn\'t punish you, mate. The town. [beat] It just stops letting you look away.');
    if (A.raw) A.raw.eyes('ahead');
    await G.wait(0.6);
    // 6. SHOT — insert: a small hooked metal tool with a worn wooden handle
    W.hold('R', 'jumper_tool');
    q(W.gesture('offer', { hand: 'R', target: [HL.stool2[0], 1.0, HL.stool2[1] - 0.15] }));
    await G.wait(0.55);                                      // (the hand comes out with it; then the cut to the insert)
    if (!C3_camOnHand(G, W, 'R', [0.06, 0.36, -0.42], [0.05, -0.04, 0.05], 36)) G.cam({ pos: [7.4, 1.35, 4.45], target: [7.4, 0.95, 4.95], fov: 36 });
    await G.say('WAI', 'Jumper tool. For the frame. You\'ll want it.');
    q(A.gesture('reach', { hand: 'L', target: [7.35, 1.0, 5.05] }));
    await G.wait(0.5);
    W.hold('R', null);
    // state: the jumper tool (plain statements — a skip lands here the same way); its pickup message waits for the end
    // of the scene, so the [beat] before "Now." stays a beat
    if (!G.has('jumper_tool')) { G.give('jumper_tool', 1, { silent: true }); S.done['c3:toolMsg'] = true; }
    G.cam({ pos: [9.55, 1.42, 6.05], target: [7.25, 1.12, 5.0], fov: 36 });
    await G.say('WAI', '[beat] Now. Who are you trying to reach?');
    await G.say('AIDAN', 'A customer. Her number\'s disconnected, but she— she rang me. Tonight.');
    W.look(G.aidan);
    await G.say('WAI', 'Give me the number.');
    W.look(null);
    // Aidan says it; Wai plugs a cord
    if (A.raw) A.raw.talk(2.2);
    await G.wait(2.3);
    q(W.gesture('reach', { hand: 'R', target: WB.lamp27 }));
    G.sfx('plug', { pos: WB.lamp27, vol: 0.8 });
    await G.wait(0.7);
    // 7. SHOT — close on a lamp lighting up. Ringing in the headset. Wai passes it to Aidan.
    G.cam({ pos: [6.62, 1.7, 4.5], target: WB.lamp27, fov: 24 });
    if (board && board.userData.setLamp) board.userData.setLamp('27', true);
    const ring = G.sfx('ringback', { loop: true, vol: 0.35, pos: [HL.wai[0], 1.35, HL.wai[1]] });
    await G.wait(2.2);
    if (W.raw) { try { W.raw.wear('headset', false); } catch (e) { /* rig */ } }
    if (A.raw) { try { A.raw.wear('headset', true); } catch (e) { /* rig */ } }
    // 8. SHOT — close on Aidan with the headset on. A click. A cheerful automated voice.
    G.cam({ pos: [7.58, 1.5, 4.56], target: [HL.stool2[0], 1.32, HL.stool2[1]], fov: 36, to: { pos: [7.6, 1.49, 4.6], fov: 32 }, dur: 14 });
    await G.wait(1.2);
    if (ring && ring.stop) ring.stop(0.05);
    G.sfx('click', { vol: 0.8, phone: true });
    await G.wait(0.6);
    G.music('tomorrow', { vol: 0.5 });
    await G.say('RECORDING (phone)', 'Thank you for calling. Your case, one-one-eight, two-two-three-one, has been updated. [beat] Status: follow up tomorrow.');
    // he pulls the headset off like it burned him
    q(A.gesture('flinch'));
    if (A.raw) { try { A.raw.wear('headset', false); } catch (e) { /* rig */ } A.raw.expr('scared'); }
    G.sfx('handle', { vol: 0.4 });
    await G.wait(1.2);
    G.cam({ pos: [9.55, 1.42, 6.05], target: [7.25, 1.12, 5.0], fov: 36 });
    W.look(G.aidan); if (W.raw) W.raw.eyes('at', G.aidan);
    await G.say('WAI', 'Not who you wanted?');
    if (A.raw) A.raw.eyes('down');
    await G.say('AIDAN', 'Wrong number.');
    W.look(null); if (W.raw) W.raw.eyes('down');
    await G.say('WAI', 'Mm. [beat] Power\'s going in and out. If you want anything else from this place, I need the frame room lit. Fuse room\'s in the basement. Mind the stairs.');
    await G.wait(0.5);
    G.stopMusic(2);
    // state (plain statements)
    if (!G.has('jumper_tool')) G.give('jumper_tool', 1, { silent: true });
    if (board && board.userData.setLamp) board.userData.setLamp('27', false);
    if (W.raw) { try { W.raw.wear('headset', true); } catch (e) { /* rig */ } W.raw.idleLife = true; W.raw.eyes('ahead'); W.raw.lookAt(null); }
    W.place(HL.wai[0], HL.wai[1] - 0.02, 180);
    W.pose('work', { seated: true, seat: 0.64 });
    A.place(8.4, 5.75, 90);
    A.pose('idle');
    if (A.raw) { try { A.raw.wear('headset', false); } catch (e) { /* rig */ } A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); A.raw.lookAt(null); A.raw.posture = Math.max(A.raw.posture || 0, 0.2); }
    Player.setTorch(torch0);
    G.bars(null);
    G.set('c3_metWai', true);
    noteDone('c2_goal');
    note(G, 'The fuse room. Basement — the stairs at the east end of the hall.', 'c3_goal');
    G.mapMark('c3_fuse', { at: [39.5, 1.6], t: 'circle' });
    G.camRelease();
    if (S.done['c3:toolMsg']) { delete S.done['c3:toolMsg']; try { UI.message('Aidan picked up the jumper tool.'); } catch (e) { /* ui */ } }
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 3-2 "Impacted" (at the frame-hall doors, the fuses set) → the Outage → the frame hall → BOSS → 3-3 / alt.
  // The chain runs from the doors / Wai / the trigger; 3-2 ends with the fight about to start, so a skip of 3-2 never
  // swallows 3-3.
  // =================================================================================================================
  async function C3_impacted(G) {
    if (done('cs:3-2') && (flag('c3_bossDone') || World.room !== 'c3_hall')) return;
    G.persist();
    await G.cutscene('3-2');
    if (World.room !== 'c3_frame') return;
    const r = await G.boss('restructure');
    await G.cutscene(r === 'saved' ? '3-3' : '3-3alt');
  }
  defineCutscene('3-2', async (G) => {
    const A = G.aidan, W = C3_wai(G);
    const panel = G.obj('c3h_panel');
    if (A.raw) A.raw.idleLife = false;
    C3_emptyHands(A);
    // 1. SHOT — the frame hall doors. Wai stands reading his old candy-bar phone.
    await G.fade(1, 0.35);
    W.place(HL.doorsW[0], HL.doorsW[1], 125);
    W.pose('idle');
    W.hold('R', 'candybar');
    if (W.raw) { try { W.raw.armPose('R', 'phone_look'); W.raw.wear('headset', false); } catch (e) { /* rig */ } W.raw.eyes('down'); }
    A.place(3.6, 7.5, -110);
    A.pose('idle');
    G.cam({ pos: [6.3, 1.62, 9.3], target: [1.2, 1.32, 6.0], fov: 40, to: { pos: [6.1, 1.6, 9.1], fov: 38 }, dur: 12 });
    await G.fade(0, 0.8);
    await G.wait(1.2);
    W.look(G.aidan);
    await G.say('WAI', 'Lights are on. Good lad. [beat]');
    await W.turn(G.aidan, 0.6);
    q(W.gesture('offer', { hand: 'R', target: [3.2, 1.2, 7.1] }));
    await G.say('WAI', 'Look at this.');
    // 2. SHOT — insert on the tiny screen: Wai's Email
    {
      const hp = new THREE.Vector3(); const g = W.raw && W.raw.anchors && W.raw.anchors.gripR;
      if (g) g.getWorldPosition(hp); else hp.set(HL.doorsW[0] + 0.3, 1.2, HL.doorsW[1] + 0.35);
      G.cam({ pos: [hp.x + 0.28, hp.y + 0.22, hp.z + 0.32], target: [hp.x, hp.y + 0.04, hp.z], fov: 28 });
    }
    await G.wait(1.2);
    await G.doc('wai_email', { id: 'c3:waiEmail', open: !G.skipping });
    G.cam({ pos: [5.25, 1.5, 7.95], target: [2.4, 1.35, 6.0], fov: 38, to: { pos: [5.15, 1.49, 7.88], fov: 36 }, dur: 30 });
    W.look(null); if (W.raw) { W.raw.eyes('down'); W.raw.expr('flat'); }
    await G.say('WAI', 'They\'ve got a chatbot doing the screen bookings now. \'Hi! I\'m here to help!\' [beat] I trained the kid who built the booking page.');
    if (W.raw) W.raw.expr('neutral');
    A.look(W);
    await G.say('AIDAN', 'They can\'t just—');
    W.look(G.aidan);
    await G.say('WAI', 'They can, mate. They did it here. Whole crew. One afternoon. [beat] I was the one they kept. I used to think that meant something.');
    W.look(null); A.look(null);
    await G.wait(0.8);
    // 3. The siren begins. Wai looks at the ceiling.
    const outP = G.outage(true);
    await G.wait(1.6);
    W.look([HL.doorsW[0], 4.6, HL.doorsW[1] + 0.4]);
    if (W.raw) W.raw.eyes('ahead');
    await G.say('WAI', 'Ah. [beat] There she goes.');
    // the MAST FEED switch in the basement throws itself on — the town, not the player
    G.cam({ pos: [1.05, 1.78, 4.35], target: [0.08, 1.72, 4.05], fov: 28 });
    G.sfx('thud', { vol: 0.5, pos: [0, -2, 4] });
    G.sfx('clunk', { vol: 0.6, pos: [0, -1, 4] });
    if (panel && panel.userData.setLamp) panel.userData.setLamp('MAST', 'blink');
    await outP;
    // state (plain statements)
    setCirc([...circList().filter((c) => c !== 'MAST FEED'), 'MAST FEED']);
    G.set('c3_mastFeed', true);
    W.hold('R', null);
    // 4. SHOT — low inside the frame hall. The doors swing open on their own. The jumper wires begin to move.
    await G.goto('c3_frame', 'hall', { sound: 'none' });
    const W2 = C3_wai(G);
    W2.place(20.7, 6.55, -90); W2.pose('idle');
    if (W2.raw) { try { W2.raw.wear('headset', false); } catch (e) { /* rig */ } W2.raw.eyes('ahead'); }
    A.place(21.0, 7.55, -90, { y: 0 }); A.pose('idle');
    let e = G.enemy('c3_frame:restructure');
    if (!e) e = G.spawn({ id: 'c3_frame:restructure', type: 'c3_restructure', persist: false, pos: [1.4, 7.0], rot: 90, world: 'outage' });
    C3.boss = e;
    G.cam({ pos: [12.4, 0.42, 8.7], target: [19.6, 1.45, 7.0], fov: 46 });
    await G.fade(0, 1.0);
    await G.wait(1.1);
    G.sfx('handle', { pos: [20, 1, 7], vol: 0.7 });
    G.door('c3_frame:hallA').open(); G.door('c3_frame:hallB').open();
    G.sfx('creak', { pos: [20, 1, 7], vol: 0.8 });
    S.done['c3:doorsOpen'] = true;
    C3.wires = 1;
    try { Snd.play('skitter', { pos: [1.4, 3, 7], vol: 0.8 }); } catch (err) { /* audio */ }
    await G.wait(1.4);
    // Wai walks in and stands in front of the frame, very still
    G.cam({ pos: [12.4, 0.42, 8.7], fov: 46, follow: W2.raw, followOffset: [0, -0.2, 0], dur: 0 });
    const wWalk = q(W2.walkTo([[18.6, 6.9], [9.0, 7.2], FR.wai], { speed: 0.85 }));
    await G.wait(1.2);
    q(A.walkTo(17.6, 7.5, { speed: 0.8 }));
    // (the low camera turns to follow him down the aisle between the rows, until he's nearly at the frame)
    for (let k = 0; k < 40 && !G.skipping; k++) { const r = W2.raw && W2.raw.root; if (!r || r.position.x < 6.4) break; await G.wait(0.4); }
    // the switch-arms start clicking toward the jack labelled WAI: low by the WAI-1 plate, up the frame to the arm
    // (from the aisle, low: the red WAI-1 plate under his name on the chart, the arm's red lamp far up the frame, coming)
    G.cam({ pos: [5.0, 1.3, 3.55], target: [1.35, 2.45, 7.5], fov: 52, to: { pos: [4.75, 1.26, 3.8], fov: 47 }, dur: 5 });
    for (let k = 0; k < 4; k++) {
      if (e && e.data && e.data.arms) for (const a of e.data.arms) { a.dipT = 0.5; a.k = Math.min(0.2, (a.k || 0) + 0.05); }
      G.sfx('click', { pos: [1.6, 4.6, 11], vol: 0.8 }); G.sfx('plug', { pos: [1.6, 4.6, 11], vol: 0.4, rate: 0.8 });
      await G.wait(1.1);
    }
    await wWalk;
    G.cam({ pos: [15.5, 1.5, 9.4], target: [2.2, 2.2, 6.8], fov: 40, to: { pos: [15.0, 1.5, 9.2], fov: 38 }, dur: 6 });
    await W2.turn(-90, 0.8);
    W2.pose('stand_still');
    await G.wait(2.4);
    // state (plain statements): Wai at the frame, Aidan inside the doors, the frame awake
    W2.place(FR.wai[0], FR.wai[1], -90); W2.pose('stand_still');
    A.place(17.6, 7.5, -90); A.pose('idle');
    if (A.raw) A.raw.idleLife = true;
    S.done['c3:doorsOpen'] = true;
    C3.wires = 1;
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 3-3 "Keep the Line Open" (waiSaved) / 3-3 (alternate) — the frame hall, the Outage lifting
  // =================================================================================================================
  // the frame dies (or finishes its work), the Outage lifts on the frame hall; shared by both endings
  async function C3_frameDies(G, saved) {
    const e = C3.boss;
    if (e && e.data) { e.data.fight = false; e.data.faceMode = 'glitch'; }
    G.cam({ pos: [16.8, 0.6, 8.6], target: [1.3, 3.2, 7.0], fov: 36, to: { pos: [16.4, 0.6, 8.5], fov: 34 }, dur: 8 });
    G.sfx('static', { dur: 1.4, vol: 0.6 });
    await G.wait(1.4);
    if (!saved) {
      // the last arm reaches WAI: his name goes, his lanyard drops
      if (e && e.data) { for (const a of e.data.arms) a.dipT = 0.5; C3_dropLanyard(ORG.wai, e.data); }
      G.sfx('click', { pos: [1.6, 1.2, 5.35], vol: 1 }); G.sfx('plug', { pos: [1.6, 1.2, 5.35], vol: 0.6, rate: 0.7 });
      try { Enemies.say('Thank you for your contribution.', 'quiet', 3.2); } catch (err) { /* voice */ }
      await G.wait(2.6);
    }
    if (e && e.data) e.data.faceMode = 'dead';
    C3.wires = 0;
    await G.outage(false);
    if (e) { try { e.remove(); } catch (err) { /* gone */ } }
    C3.boss = null;
  }
  defineCutscene('3-3', async (G) => {
    const A = G.aidan, W = C3_wai(G);
    if (A.raw) A.raw.idleLife = false;
    C3_emptyHands(A);
    W.look(null);
    await C3_frameDies(G, true);
    // state first (plain statements: a skip lands here the same way)
    G.set('waiSaved', true); G.set('waiLost', false); G.set('c3_bossDone', true);
    const fr = G.obj('c3_waiboard_fr');
    // 1. SHOT — the frame hall in the Fog world, quiet. Through the doorway, on the operators' board, one lamp lights: WAI.
    W.place(FR.waiSit[0], FR.waiSit[1], 90);
    W.pose('sit_floor');
    A.place(18.4, 5.9, 80); A.pose('idle');                    // (by the doors, looking through)
    // (a slow push from the quiet frame hall to the doorway, the dark board beyond it; then close on the lamp)
    G.cam({ pos: [15.6, 1.5, 9.0], target: [26.4, 1.6, 4.9], fov: 44, to: { pos: [18.5, 1.5, 8.3], target: [26.43, 1.7, 4.4], fov: 24 }, dur: 5.5 });
    await G.wait(3.6);
    if (fr && fr.userData.setLamp) fr.userData.setLamp('WAI', true);
    { const l = G.light('c3fr:waiLamp'); if (l) l.on(true); const d = G.light('c3fr:waiLed'); if (d) d.on(true); }
    G.sfx('click', { vol: 0.5, pos: [26.4, 1.8, 4.3] });
    G.music('line', { vol: 0.5 });
    await G.wait(1.6);
    { const L = [WB.lampWai[0] + FR.replica.dx, WB.lampWai[1], WB.lampWai[2] + FR.replica.dz]; G.cam({ pos: [L[0] + 0.3, L[1] - 0.08, L[2] + 0.62], target: L, fov: 26, to: { pos: [L[0] + 0.26, L[1] - 0.08, L[2] + 0.52], fov: 24 }, dur: 3 }); }
    await G.wait(2.4);
    // 2. SHOT — Wai sits on the floor against the frame, glasses off.
    if (W.raw) { try { W.raw.glassesState('off'); } catch (e) { /* rig */ } W.raw.eyes('down'); W.raw.expr('tired'); }
    { const l = G.light('c3fr:work'); if (l) l.on(true); }
    A.place(3.1, 6.75, -47); A.pose('idle');
    G.cam({ pos: [5.6, 1.1, 9.6], target: [2.5, 0.85, 7.5], fov: 40, to: { pos: [5.45, 1.09, 9.5], fov: 38 }, dur: 30 });
    await G.wait(1.6);
    await G.say('WAI', 'Huh. [beat] You plugged me back in.');
    await G.say('AIDAN', 'It was going to disconnect you.');
    W.look(G.aidan);
    await G.say('WAI', 'Yeah. [beat] I was gonna let it.');
    W.look(null);
    await G.longBeat();
    if (W.raw) W.raw.eyes('ahead');
    await G.say('WAI', 'Go on. Whatever brought you here, it\'s not in this building. [beat] I\'ll stay on the board. Someone should keep the line open. [beat] Every payphone in town comes through here. You pick one up, I\'ll be on the other end.');
    await G.wait(0.6);
    // … and as Aidan leaves
    G.cam({ pos: [2.35, 1.15, 9.35], target: [12.5, 1.05, 4.6], fov: 42 });
    q(A.walkTo([[6.5, 5.6], [15.2, 5.6], [15.6, 2.4]], { speed: 1.0 }));
    await G.wait(1.8);
    W.look(G.aidan);
    await G.say('WAI', 'Your mate came by, by the way. Big lad, loud. Went down to the call centre. Said he could hear phones.');
    await G.wait(0.8);
    G.stopMusic(2.5);
    // state (plain statements)
    A.place(15.6, 2.4, 160); A.pose('idle');
    if (A.raw) { A.raw.idleLife = true; A.raw.posture = Math.max(A.raw.posture || 0, 0.28); A.raw.lookAt(null); }
    W.place(FR.waiSit[0], FR.waiSit[1], 90); W.pose('sit_floor'); W.look(null);
    await C3_objective(G);
    G.camRelease();
  }, { letterbox: true, skippable: true });
  defineCutscene('3-3alt', async (G) => {
    const A = G.aidan, W = C3_wai(G);
    if (A.raw) A.raw.idleLife = false;
    C3_emptyHands(A);
    // Wai turns from the frame and walks off into the dark between the rows, and is gone
    q(W.walkTo([[5.5, 8.6], [8.2, 12.6]], { speed: 0.7 }));
    q(W.fade(0, 4.5));
    await C3_frameDies(G, false);
    // state first (plain statements)
    G.set('waiSaved', false); G.set('waiLost', true); G.set('c3_bossDone', true);
    W.remove();
    const fr = G.obj('c3_waiboard_fr');
    { const hs = G.obj('c3fr_altHeadset'), nt = G.obj('c3fr_altNote'); if (hs) hs.visible = true; if (nt) nt.visible = true; }
    // 1. SHOT — the same doorway. The WAI lamp goes dark. Wai's headset lies on his empty chair.
    A.place(18.4, 5.9, 80); A.pose('idle');
    if (fr && fr.userData.setLamp) fr.userData.setLamp('WAI', true);
    { const l = G.light('c3fr:waiLamp'); if (l) l.on(true); const d = G.light('c3fr:waiLed'); if (d) d.on(true); }
    G.cam({ pos: [18.5, 1.5, 8.3], target: [HL.wai[0] + FR.replica.dx, 1.05, HL.wai[1] + FR.replica.dz - 0.1], fov: 24 });
    await G.wait(2.4);
    if (fr && fr.userData.setLamp) fr.userData.setLamp('WAI', false);
    { const l = G.light('c3fr:waiLamp'); if (l) l.on(false); const d = G.light('c3fr:waiLed'); if (d) d.on(false); }
    G.sfx('click', { vol: 0.5, pos: [26.4, 1.8, 4.3] });
    await G.wait(2.2);
    // 2. AIDAN: "Wai?" [long beat] Silence.
    G.cam({ pos: [19.55, 1.5, 7.3], target: [18.4, 1.5, 5.9], fov: 36 });
    A.look([26, 1.4, 5.4]);
    await G.say('AIDAN', 'Wai? [long beat]');
    await G.wait(1.2);
    // 3. A note under the headset in Wai's writing
    A.place(19.6, 6.8, 100); A.pose('idle');
    { const l = G.light('c3fr:noteLight'); if (l) l.on(true); }
    G.cam({ pos: [HL.wai[0] + FR.replica.dx + 0.66, 1.12, HL.wai[1] + FR.replica.dz - 0.02], target: [HL.wai[0] + FR.replica.dx + 0.02, 0.69, HL.wai[1] + FR.replica.dz - 0.03], fov: 34, to: { pos: [HL.wai[0] + FR.replica.dx + 0.58, 1.08, HL.wai[1] + FR.replica.dz - 0.02], fov: 32 }, dur: 5 });
    await G.wait(1.0);
    await G.say(null, '"Your mate went to the call centre. Heard phones. Good luck, mate."', { italic: true });
    await G.wait(0.8);
    // state (plain statements)
    A.place(17.2, 7.9, -90); A.pose('idle'); A.look(null);
    if (A.raw) { A.raw.idleLife = true; A.raw.lookAt(null); }
    G.camRelease();
    await C3_objective(G);
    G.camRelease();
  }, { letterbox: true, skippable: true });
  // "Chase went to the call centre. Wai says it keeps every call log in the district. [beat] If there's a real number
  // for her, it's there." — the objective, then the way out through the yard
  async function C3_objective(G) {
    G.set('c3_bossDone', true);
    noteDone('c3_goal');
    note(G, 'Chase went to the call centre. Wai says it keeps every call log in the district. If there\'s a real number for her, it\'s there.', 'c3_callcentre');
    G.mapMark('c3_yard', { at: [FR.yardX, 0.2], t: 'circle' });
    await G.think('Chase went to the call centre. Wai says it keeps every call log in the district. [beat] If there\'s a real number for her, it\'s there.');
  }

  // =================================================================================================================
  // Chapter 3
  // =================================================================================================================
  defineChapter({
    n: 3, id: 'ch3', title: 'THE EXCHANGE', card: 'SIGNAL HILL TRUNK EXCHANGE',
    start: { room: 'c3_exchangerd', entry: 'gate' },
    // what a player carries into Chapter 3 (chapter select): the Prologue, Chapters 1 and 2
    debugState(s) {
      const give = (id, n = 1) => { const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id] && ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      for (const id of ['box_cutter', 'steel_bar', 'map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate']) if (ITEMS[id] && !s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('first_aid', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      for (const id of ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village']) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true, standardName: s.flags.standardName || 'LUKA',
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
      });
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'huddle1', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note')]) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      s.calls.luka1 = s.calls.luka1 || 'answered'; s.calls.luka2 = s.calls.luka2 || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 2);
      Object.assign(s.done, { 'cs:P-1': true, 'cs:P-4': true, 'cs:1-1': true, 'cs:1-2': true, 'cs:1-3': true, 'cs:1-4': true, 'cs:1-7': true, 'cs:1-8': true, 'cs:2-1': true, 'cs:2-2': true, 'cs:2-3': true, 'break:ch1': true, 'break:ch2': true });
      s.F = Math.max(s.F || 0, 11); s.A = Math.max(s.A || 0, 1); s.stats.freed = Math.max(s.stats.freed || 0, 2);
      s.notes = (s.notes || []).filter((n) => n && n.id !== 'c2_goal');
      s.notes.push({ id: 'c2_goal', text: 'Wai. The old exchange — up Exchange Road, through the back gate.', done: false });
    },
    async begin(G) {
      G.bars(null);
      if (G.once('c3:begin')) {
        note(G, 'Wai. The old exchange, top of Exchange Road.', 'c2_goal');
        await G.wait(1.2);
        await G.think('Exchange Road. [beat] All uphill.');
        await G.wait(0.5);
        await G.think('The exchange is at the top. [beat] Wai.');
      }
    },
  });
}
