// ==== data/10_prologue.js — the Prologue "No Service" (spec §8 Prologue, §7A, §7B Prologue, §2A) — tag P0_ ====
// Rooms: p1_car (the hatchback interior set, cutscene only; reusable by the endings — marks p1:driver / p1:passenger),
//   p2_lookout (the highway shoulder: Aidan's dead car, the payphone booth with the Visitor Map, the road sign, the
//   guardrail over the fogged valley, the Hill Road turn-off; fog walls "The road's just... gone." both ways),
//   p3_hillroad (120 m descending S-curve east: guardrails, gum trees, the fire-trail gate at 60 m where the cardigan
//   figure crosses, the letterbox at 90 m), p4_busshelter (the Route 44 shelter under the only working streetlight, the
//   bin and flattened boxes with the box cutter, the first Tethered, sticker01, Relay Street to the north).
// Cutscenes: P-1 "Rehearsal" (shot by shot; p2 exterior ↔ p1 interior), P-4 (in-engine: the reveal). The Hill Road
//   crossing (P-3) is a short blocking beat without letterbox. Chapter 0 = P-1, then play at p2_lookout:car; walking
//   north into Relay Street the first time → G.startChapter(1) (its card is "SIGNAL HILL PLAZA").
// Items/docs used (defined elsewhere): returned_modem, map_town, box_cutter, coffee, energy_drink; timetable /
//   timetable_hard (Hard riddle level). Flags: p0_carDead. S.done keys: p4:reveal, p4:outcome, p3:crossed.
{
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const P0 = { hazard: false, fogLow: false, lastCam: null, insert: false };        // transient presentation state (never saved)

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function P0_tex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h, U.rng(U.hash('p0:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'p0:' + key;
    TEXC.set(key, t);
    return t;
  }
  const F = Tex.fonts;
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || F.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    if (o.spacing) { let cx = o.align === 'center' ? x - (ctx.measureText(s).width + o.spacing * (s.length - 1)) / 2 : x; ctx.textAlign = 'left'; for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + o.spacing; } }
    else ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };

  // the sticky note in shaky biro (legible in the P-1 insert)
  const noteTex = () => P0_tex('note', 512, 512, (x, w, h, r) => {
    x.fillStyle = '#eedf7c'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h * 0.22); g.addColorStop(0, 'rgba(90,70,0,0.13)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h * 0.22);
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(110,90,20,${r() * 0.07})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }
    // a corner crease and thumb smudge
    x.strokeStyle = 'rgba(120,100,30,0.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(w * 0.78, h); x.lineTo(w, h * 0.8); x.stroke();
    const sm = x.createRadialGradient(w * 0.84, h * 0.86, 4, w * 0.84, h * 0.86, 60); sm.addColorStop(0, 'rgba(60,50,30,0.12)'); sm.addColorStop(1, 'rgba(60,50,30,0)');
    x.fillStyle = sm; x.fillRect(0, 0, w, h);
    Tex.handwriting(x, 'You said it would work here.', w * 0.09, h * 0.33, { size: 62, color: '#1b2a7a', wobble: 2.8, seed: 11, maxWidth: w * 0.86, lineHeight: 92, weight: '' });
    age(x, w, h, r, 0.35);
  });
  // the Signal Hill Visitor Map (1994) pinned inside the booth
  const vmapTex = () => P0_tex('vmap', 256, 352, (x, w, h, r) => {
    x.fillStyle = '#e9e2cc'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#23466a'; x.fillRect(0, 0, w, 46);
    tx(x, 'SIGNAL HILL', w / 2, 24, 22, '#f3efe2', { font: F.serif, weight: 'bold', align: 'center', spacing: 3 });
    tx(x, 'VISITOR MAP — 1994', w / 2, 40, 11, '#cfd9e0', { font: F.sans, align: 'center' });
    // contours
    x.strokeStyle = 'rgba(140,110,70,0.35)'; x.lineWidth = 1;
    for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(w * 0.62, h * 0.34, 40 + k * 17, 26 + k * 13, -0.3, 0, Math.PI * 2); x.stroke(); }
    // roads
    const road = (pts, lw = 5) => { x.strokeStyle = '#8c7f66'; x.lineWidth = lw + 2; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); x.strokeStyle = '#f5f0e0'; x.lineWidth = lw; x.stroke(); };
    road([[0, 320], [w, 312]], 7);                                   // highway
    road([[36, 318], [70, 298], [95, 305], [118, 288]]);               // hill road
    road([[118, 288], [124, 200], [128, 150]]);                        // relay st
    road([[128, 150], [170, 140], [196, 110]]);                        // hilltop rd
    road([[196, 110], [150, 92], [110, 80]]);                          // exchange rd
    road([[110, 80], [70, 96], [48, 130]]);                            // wire lane / ring rd
    road([[48, 130], [90, 70], [170, 60], [200, 70]]);
    road([[200, 70], [178, 56], [160, 42 + 20]], 3);
    x.fillStyle = '#b9ae94';
    for (const [a, b, c, d] of [[132, 176, 28, 20], [200, 100, 26, 18], [96, 70, 22, 16], [34, 118, 22, 18], [60, 64, 24, 14], [196, 58, 22, 14]]) x.fillRect(a, b, c, d);
    const lab = (s, a, b) => tx(x, s, a, b, 8, '#3b3326', { font: F.sans, weight: 'bold' });
    lab('THE LOOKOUT', 12, 338); lab('HILL RD', 62, 292); lab('RELAY ST', 130, 230); lab('PLAZA', 136, 172);
    lab('HILLTOP VILLAGE', 168, 96); lab('EXCHANGE', 88, 66); lab('CARE CENTRE', 18, 114); lab('HOSPITAL', 190, 54);
    lab('THE MAST', 150, 50); lab('HIGHWAY', 170, 334);
    x.strokeStyle = '#5a4c34'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(166, 44); x.lineTo(166, 20 + 46); x.stroke();
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(166, 44, 3, 0, Math.PI * 2); x.fill();
    // "You are here" sticker
    x.fillStyle = '#d63a2a'; x.beginPath(); x.arc(40, 314, 9, 0, Math.PI * 2); x.fill();
    tx(x, 'YOU ARE HERE', 52, 306, 8, '#b02a1f', { font: F.sans, weight: 'bold' });
    // folds
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(w / 2, 46); x.lineTo(w / 2, h); x.moveTo(0, h * 0.58); x.lineTo(w, h * 0.58); x.stroke();
    age(x, w, h, r, 0.9, { sun: 0.4 });
  });
  // the lookout's painted panorama ("what you would see")
  const panoTex = () => P0_tex('pano', 512, 256, (x, w, h, r) => {
    const sky = x.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, '#9fc3d6'); sky.addColorStop(1, '#e7dcc0');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7c8f6a'; x.beginPath(); x.moveTo(0, h * 0.75); x.bezierCurveTo(w * 0.25, h * 0.55, w * 0.45, h * 0.3, w * 0.62, h * 0.32); x.bezierCurveTo(w * 0.8, h * 0.34, w * 0.9, h * 0.6, w, h * 0.62); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    x.fillStyle = '#5d7250'; x.beginPath(); x.moveTo(0, h * 0.88); x.bezierCurveTo(w * 0.3, h * 0.72, w * 0.6, h * 0.8, w, h * 0.74); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    const bld = (a, b, c, d, col) => { x.fillStyle = col; x.fillRect(a, b, c, d); };
    bld(w * 0.2, h * 0.62, 38, 14, '#d8d2c2'); bld(w * 0.36, h * 0.47, 30, 16, '#c7b89a'); bld(w * 0.5, h * 0.36, 26, 18, '#e2dccb');
    bld(w * 0.72, h * 0.44, 34, 18, '#e8e4da'); bld(w * 0.83, h * 0.56, 28, 12, '#d0c7b2');
    // the mast on the summit
    x.strokeStyle = '#6a5b4a'; x.lineWidth = 2; x.beginPath(); x.moveTo(w * 0.62, h * 0.33); x.lineTo(w * 0.62, h * 0.08); x.stroke();
    x.beginPath(); x.moveTo(w * 0.6, h * 0.33); x.lineTo(w * 0.62, h * 0.08); x.lineTo(w * 0.64, h * 0.33); x.stroke();
    x.fillStyle = '#d0331f'; x.beginPath(); x.arc(w * 0.62, h * 0.07, 3, 0, Math.PI * 2); x.fill();
    const lab = (s, a, b) => { x.strokeStyle = '#2d2a24'; x.lineWidth = 1; x.beginPath(); x.moveTo(a, b + 3); x.lineTo(a, b + 14); x.stroke(); tx(x, s, a, b, 10, '#2d2a24', { font: F.sans, weight: 'bold', align: 'center' }); };
    lab('PLAZA', w * 0.24, h * 0.56); lab('HILLTOP VILLAGE', w * 0.39, h * 0.41); lab('TRUNK EXCHANGE', w * 0.53, h * 0.3); lab('THE MAST', w * 0.62, h * 0.04 + 10);
    lab('DISTRICT HOSPITAL', w * 0.76, h * 0.38); lab('REGIONAL OFFICE', w * 0.87, h * 0.5);
    x.fillStyle = '#4a3a26'; x.fillRect(0, h - 30, w, 30);
    tx(x, 'SIGNAL HILL LOOKOUT', 12, h - 10, 17, '#f0e6cc', { font: F.serif, weight: 'bold', spacing: 2 });
    tx(x, 'On a clear day you can see the mast.', w - 12, h - 11, 11, '#e0d4b4', { font: F.serif, align: 'right' });
    age(x, w, h, r, 1.3, { sun: 0.8 });
  });
  // the instrument cluster (lit teal, needles at rest)
  const dialsTex = () => P0_tex('dials', 256, 112, (x, w, h, r) => {
    x.fillStyle = '#050707'; x.fillRect(0, 0, w, h);
    const dial = (cx, cy, rad, max, label) => {
      x.strokeStyle = 'rgba(80,220,205,0.85)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 2.25); x.stroke();
      for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; x.beginPath(); x.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); x.lineTo(cx + Math.cos(a) * (rad - (i % 2 ? 4 : 8)), cy + Math.sin(a) * (rad - (i % 2 ? 4 : 8))); x.stroke(); if (i % 2 === 0) tx(x, String(Math.round((i / 10) * max)), cx + Math.cos(a) * (rad - 16), cy + Math.sin(a) * (rad - 16) + 4, 9, '#6fe0d2', { align: 'center' }); }
      x.strokeStyle = '#ff7a22'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(Math.PI * 0.78) * (rad - 6), cy + Math.sin(Math.PI * 0.78) * (rad - 6)); x.stroke();
      x.fillStyle = '#222'; x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill();
      tx(x, label, cx, cy + rad * 0.55, 8, '#4fb8ad', { align: 'center' });
    };
    dial(66, 58, 46, 200, 'km/h'); dial(190, 58, 46, 8, 'x1000 r/min');
    // warning lamps (ignition on, engine off) + the hazard arrows (drawn dim; the LEDs blink over them)
    x.fillStyle = '#b8261c'; x.fillRect(114, 88, 10, 7); x.fillStyle = '#c9a117'; x.fillRect(130, 88, 10, 7);
    tx(x, 'ODO 184233', 128, 108, 9, '#3fa39a', { align: 'center', font: F.mono });
  });
  // car radio: searching
  const radioTex = () => P0_tex('radio', 128, 32, (x, w, h) => {
    x.fillStyle = '#041008'; x.fillRect(0, 0, w, h);
    tx(x, 'FM --.-  SEEK', w / 2, 21, 13, '#45d57a', { font: F.mono, weight: 'bold', align: 'center' });
  });
  const pPlateTex = () => P0_tex('pplate', 128, 128, (x, w, h) => {
    x.fillStyle = '#f2f0e8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1b1b1b'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    tx(x, 'P', w / 2, h * 0.84, 104, '#1f8a3a', { font: F.heavy, weight: '900', align: 'center' });
  });
  // fog on the glass: milky haze, beads of condensation, a few runs
  const condTex = () => P0_tex('cond', 256, 256, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(214,224,222,0.30)'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 700; k++) { const px = r() * w, py = r() * h, s = 0.6 + r() * 2.2; x.fillStyle = `rgba(236,242,240,${0.18 + r() * 0.4})`; x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill(); }
    for (let k = 0; k < 9; k++) { const px = r() * w, py = r() * h * 0.5; x.fillStyle = 'rgba(40,52,52,0.35)'; x.fillRect(px, py, 1.5, h * (0.15 + r() * 0.35)); }
  }, { wrap: true });
  // road markings (transparent, repeating along v)
  const dashTex = () => P0_tex('dash', 16, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(232,230,222,0.9)'; x.fillRect(0, 0, w, h * 0.25); }, { wrap: true });
  const lineTex = () => P0_tex('line', 16, 64, (x, w, h, r) => { x.clearRect(0, 0, w, h); for (let y = 0; y < h; y++) { x.fillStyle = `rgba(232,230,222,${0.72 + r() * 0.2})`; x.fillRect(0, y, w, 1); } }, { wrap: true });
  const chevTex = () => P0_tex('chev', 128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(232,230,222,0.8)';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w * 0.25, 0); x.lineTo(w, h * 0.75); x.lineTo(w, h); x.lineTo(w * 0.75, h); x.lineTo(0, h * 0.25); x.fill();
  }, { wrap: true });
  // CAUTION: kangaroos (yellow diamond)
  const rooTex = () => P0_tex('roo', 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.save(); x.translate(w / 2, h / 2); x.rotate(Math.PI / 4);
    x.fillStyle = '#1b1b1b'; x.fillRect(-88, -88, 176, 176); x.fillStyle = '#e8c21a'; x.fillRect(-80, -80, 160, 160); x.restore();
    x.fillStyle = '#141414';
    x.beginPath(); x.ellipse(128, 142, 34, 22, -0.5, 0, Math.PI * 2); x.fill();                 // body
    x.beginPath(); x.ellipse(104, 106, 12, 9, -0.2, 0, Math.PI * 2); x.fill();                  // head
    x.beginPath(); x.moveTo(98, 98); x.lineTo(94, 84); x.lineTo(104, 97); x.fill();             // ear
    x.beginPath(); x.moveTo(150, 150); x.quadraticCurveTo(190, 170, 196, 196); x.lineTo(188, 196); x.quadraticCurveTo(178, 176, 146, 162); x.fill();  // tail
    x.beginPath(); x.moveTo(126, 156); x.lineTo(120, 186); x.lineTo(146, 188); x.lineTo(142, 180); x.lineTo(130, 180); x.lineTo(136, 156); x.fill();  // leg
    x.beginPath(); x.moveTo(112, 128); x.lineTo(100, 142); x.lineTo(104, 144); x.lineTo(116, 134); x.fill();                                            // arm
  });
  const freshTex = () => P0_tex('fresh', 64, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#2d6b3a';
    x.beginPath(); x.moveTo(w / 2, 6); for (const [a, b] of [[54, 44], [42, 44], [58, 78], [40, 78], [60, 110], [4, 110], [24, 78], [6, 78], [22, 44], [10, 44]]) x.lineTo(a, b); x.closePath(); x.fill();
    x.fillStyle = '#6b4a2a'; x.fillRect(w / 2 - 4, 108, 8, 14);
    tx(x, 'PINE', w / 2, 90, 11, '#e8e0b0', { font: F.sans, weight: 'bold', align: 'center' });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Mesh builder: quads in room coordinates (one mesh per material), planar UVs in metres × s (or 0..1)
  // ---------------------------------------------------------------------------------------------------------------
  const MB = () => ({ p: [], uv: [], i: [] });
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  // a→b is u, a→d is v; `want` (optional) = the side the face should look toward
  function quad(g, a, b, c, d, s = 1, want = null, uv01 = false) {
    const n = g.p.length / 3;
    g.p.push(...a, ...b, ...c, ...d);
    if (uv01) g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    else { const lu = len3(sub(b, a)) * s, lv = len3(sub(d, a)) * s; g.uv.push(0, 0, lu, 0, lu, lv, 0, lv); }
    let flip = false;
    if (want) { const nn = cross(sub(b, a), sub(d, a)); flip = nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0; }
    if (flip) g.i.push(n, n + 2, n + 1, n, n + 3, n + 2); else g.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  // oriented box: centre c, size [sx,sy,sz], yaw / tilt (deg; tilt rotates about the box's own Z, then yaw about Y)
  function obox(g, c, size, yaw = 0, tilt = 0, s = 1) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw * D2R, tilt * D2R, 'YXZ'));
    const [hx, hy, hz] = size.map((v) => v / 2);
    const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); return [v.x + c[0], v.y + c[1], v.z + c[2]]; };
    const N = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); return [v.x, v.y, v.z]; };
    quad(g, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), s, N(0, 0, 1));
    quad(g, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), s, N(0, 0, -1));
    quad(g, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), s, N(1, 0, 0));
    quad(g, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), s, N(-1, 0, 0));
    quad(g, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), s, N(0, 1, 0));
    quad(g, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), s, N(0, -1, 0));
  }
  function mesh(K, g, spec, o = {}) {
    if (!g.i.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.i);
    geo.computeVertexNormals();
    const mat = spec && spec.isMaterial ? spec : K.mat(spec);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false;
    if (o.renderOrder) m.renderOrder = o.renderOrder;
    K.mesh(m, { static: o.static !== false && !mat.transparent, name: o.name, world: o.world });
    return m;
  }
  // a bag of builders keyed by material spec (one mesh each at the end)
  function Bags() {
    const list = new Map();
    return {
      g(key, spec) { let b = list.get(key); if (!b) { b = { g: MB(), spec }; list.set(key, b); } return b.g; },
      flush(K, o = {}) { for (const [, b] of list) mesh(K, b.g, b.spec, o); list.clear(); },
    };
  }
  const markMat = (tex, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...o });
    m.name = 'p0:mark';
    return m;
  };
  // guardrail prop from a to b ([x,y,z]), following the slope; the road is on the right-hand side walking a → b
  function railSeg(K, a, b, o = {}) {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
    if (L < 0.2) return null;
    const yaw = Math.atan2(-dz, dx) / D2R, tilt = Math.atan2(b[1] - a[1], L);
    const g = K.prop('guardrail', (a[0] + b[0]) / 2, (a[2] + b[2]) / 2, yaw, { len: L + (o.over ?? 0.12), y: (a[1] + b[1]) / 2, ends: o.ends ?? false, collide: o.collide, variant: o.variant });
    if (g) { g.rotation.order = 'YXZ'; g.rotation.set(0, yaw * D2R, tilt); }
    return g;
  }
  const isPad = () => { try { return Input.lastDevice === 'gamepad'; } catch (e) { return false; } };
  function readyPrompt(G) {
    G.prompt(isPad() ? '{ready}: ready weapon. {attack}: attack.' : 'Right mouse: ready weapon. Left click: attack.', { id: 'p0_ready' });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Hill Road geometry: a 120 m S-curve east (−Z is north, the valley side), 10 % down; y(x), z(x), offsets d (+ = south)
  // ---------------------------------------------------------------------------------------------------------------
  const HR = { L: 120, A: 7, grade: -0.1, rail: -4.7, bank: 5.0, hw: 3.5 };
  const hrZ = (x) => { if (x <= 0 || x >= HR.L) return 0; const w = 2 * Math.PI / 60; return x <= 60 ? HR.A * (1 - Math.cos(w * x)) / 2 : -HR.A * (1 - Math.cos(w * (x - 60))) / 2; };
  const hrDZ = (x) => { if (x <= 0 || x >= HR.L) return 0; const w = 2 * Math.PI / 60; return x <= 60 ? HR.A * w / 2 * Math.sin(w * x) : -HR.A * w / 2 * Math.sin(w * (x - 60)); };
  const hrY = (x) => HR.grade * clamp(x, 0, HR.L);
  const hrTh = (x) => Math.atan(hrDZ(x));
  const hrPt = (x, d) => { const th = hrTh(x); return [x - d * Math.sin(th), hrZ(x) + d * Math.cos(th)]; };
  // the bank's gully (the track at 60 m) and the driveway notch (90 m)
  const gully = (x) => Math.exp(-(((x - 60.6) / 2.4) ** 2));
  const drive = (x) => Math.exp(-(((x - 88.6) / 2.2) ** 2));
  // a ribbon between two rows (rowA(x), rowB(x) → [x,y,z]) along centre samples xs; continuous UVs (metres × s)
  function ribbon(g, xs, rowA, rowB, s, vA, vB, want) {
    let L = 0, prev = null, flip = null;
    const base = g.p.length / 3;
    xs.forEach((x, k) => {
      const c = [x, hrZ(x)];
      if (prev) L += Math.hypot(c[0] - prev[0], c[1] - prev[1]);
      prev = c;
      const A = rowA(x), B = rowB(x);
      g.p.push(...A, ...B);
      g.uv.push(L * s, vA * s, L * s, vB * s);
      if (k > 0) {
        const n = base + k * 2, a = n - 2, b = n, bb = n + 1, d = n - 1;       // a=A(k-1) b=A(k) c=B(k) d=B(k-1)
        if (flip === null) {
          const pa = g.p.slice(a * 3, a * 3 + 3), pb = g.p.slice(b * 3, b * 3 + 3), pd = g.p.slice(d * 3, d * 3 + 3);
          const nn = cross(sub(pb, pa), sub(pd, pa));
          flip = nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0;
        }
        if (flip) g.i.push(a, bb, b, a, d, bb); else g.i.push(a, b, bb, a, bb, d);
      }
    });
  }
  const hrRow = (d, dy) => (x) => { const [px, pz] = hrPt(x, d); return [px, hrY(px) + (typeof dy === 'function' ? dy(x) : dy), pz]; };

  // ---------------------------------------------------------------------------------------------------------------
  // The cardigan figure on Hill Road (a Rig preset: hunched, a blue knitted cardigan, a small box held out)
  // ---------------------------------------------------------------------------------------------------------------
  try {
    Rig.definePreset('p0_cardigan', {
      height: 1.5, build: 'frail', gender: 'f', age: 78, seed: 44, skin: '#c4ab98', hunch: 0.62,
      hair: { style: 'bun', color: '#a8a39a' },
      top: { kind: 'blouse', color: '#b8b0a0' }, layers: [{ kind: 'cardigan', color: '#4f6076', open: true }],
      pants: { kind: 'slacks', color: '#4a4640' }, shoes: { kind: 'flat', color: '#3a3430', sole: '#1e1a18' },
      style: { slouch: 0.9, stepLen: 0.62, armSwing: 0.2, narrow: 0.4 }, idleLife: false, walkSpeed: 1.2, detail: 'low',
    }, { hold: { R: 'box' } });
  } catch (e) { console.error('[P0] cardigan preset', e); }

  // =================================================================================================================
  // P1 — the car (interior set). Origin = the car's centre on the ground; the car faces +X (east); +Z is the driver's
  // side (Australia: right-hand drive). Floor pan 0.2, seat cushions 0.44, roof lining 1.42.
  // =================================================================================================================
  const CAR = { floor: 0.2, cushion: 0.44, roof: 1.42, belt: 0.92, zin: 0.66, drvZ: 0.36, psgZ: -0.36, seatX: -0.08 };
  defineRoom({
    id: 'p1_car', name: 'THE CAR', area: 'THE LOOKOUT', chapter: 0, outdoor: false, surface: 'carpet', ambient: 'none', cutsceneOnly: true,
    fog: { density: 0.11, color: '#7f8b89' }, env: { sheets: 0, specks: false, ambient: ['#7f918e', 0.55] },
    bounds: [-2.4, -1.4, 2.6, 1.4],
    entries: { seat: [CAR.seatX, CAR.drvZ, 90], start: [CAR.seatX, CAR.drvZ, 90] },
    cameras: [
      // (cutscene set: one covering camera from outside the windscreen; the scenes place their own shots)
      { id: 'p1_car:front', vol: [-1.4, -0.7, 1.0, 0.7], type: 'static', pos: [3.3, 1.3, 0.55], target: [-0.35, 1.0, 0.05], fov: 'fit' },
    ],
    build(K) {
      const bags = Bags();
      const PAINT = { color: '#5b6b70', roughness: 0.38, metalness: 0.35 };
      const TRIM = { color: '#2a2d30', roughness: 0.75 }, TRIM2 = { color: '#3a3e42', roughness: 0.7 };
      const FAB = { tex: 'fabric_knit', color: '#4a4f55', roughness: 0.95 }, FAB2 = { tex: 'fabric_knit', color: '#3c4146', roughness: 0.95 };
      const LINING = { tex: 'fabric_knit', color: '#8d8f88', roughness: 0.95 };
      const GLASS = { color: '#a8bdb9', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.16, side: 'double' };
      const g = (k, spec) => bags.g(k, spec);
      const F0 = CAR.floor, R0 = CAR.roof, BL = CAR.belt, ZI = CAR.zin;

      // ground outside (not walkable), the highway on the driver's side, the guardrail on the passenger side
      K.box(0, -0.06, 0, 40, 0.06, 40, 'gravel', { shadow: false });
      K.box(0, -0.055, 7.4, 40, 0.06, 7.5, 'bitumen', { shadow: false });
      K.plane(0, 0.004, 3.85, 40, 0.12, lineTex(), { rot: [-90, 0, 90], transparent: true, uv: false });
      K.prop('guardrail', 0, -2.4, 0, { len: 16, collide: false });
      K.prop('guardrail', -16, -2.4, 0, { len: 16, collide: false });
      for (const gx of [-9, 6, 21]) { K.box(gx, 0, 3.55, 0.1, 1.0, 0.1, '#e7e4da'); K.box(gx, 0.82, 3.605, 0.06, 0.12, 0.012, '#b3261e'); }

      // the cabin floor (a walkable pad so the room has somewhere to stand) + pedals/footwells
      K.floor(-1.35, -ZI, 0.98, ZI, { tex: 'carpet', color: '#2b2d30' }, { y: F0, skirt: false });
      obox(g('trim', TRIM), [0.95, F0 + 0.18, 0], [0.12, 0.36, ZI * 2], 0, -18);                     // firewall kick
      obox(g('trim', TRIM), [0.18, F0 + 0.13, 0], [0.9, 0.26, 0.2]);                                 // tunnel / console base
      obox(g('trim2', TRIM2), [0.12, F0 + 0.3, 0], [0.7, 0.07, 0.24]);                               // console top
      for (const pz of [0.26, 0.4, 0.5]) obox(g('metal', { color: '#6d7270', roughness: 0.4, metalness: 0.6 }), [0.78, F0 + 0.14, pz], [0.04, 0.2, 0.07], 0, 30);   // pedals
      // gear stick, handbrake, cup holder with the servo coffee
      K.cyl(0.36, F0 + 0.33, 0, 0.012, 0.22, '#1b1c1c', { rz: -12 });
      K.sphere(0.385, F0 + 0.57, 0, 0.032, '#222425');
      obox(g('trim', TRIM), [-0.05, F0 + 0.4, 0], [0.26, 0.04, 0.05], 0, 16);                        // handbrake lever
      K.prop('coffee_cup', 0.18, 0, 0, { y: F0 + 0.34 });

      // seats (front: cushion + bolsters + reclined backrest + headrest; rear bench)
      for (const sz of [CAR.drvZ, CAR.psgZ]) {
        obox(g('fab', FAB), [CAR.seatX + 0.02, CAR.cushion - 0.08, sz], [0.52, 0.16, 0.5]);
        for (const bz of [-0.22, 0.22]) obox(g('fab2', FAB2), [CAR.seatX + 0.02, CAR.cushion - 0.02, sz + bz], [0.5, 0.1, 0.07], 0, 0);
        obox(g('fab', FAB), [CAR.seatX - 0.33, CAR.cushion + 0.32, sz], [0.12, 0.66, 0.5], 0, 12);
        for (const bz of [-0.22, 0.22]) obox(g('fab2', FAB2), [CAR.seatX - 0.29, CAR.cushion + 0.3, sz + bz], [0.1, 0.6, 0.07], 0, 12);
        obox(g('fab', FAB), [CAR.seatX - 0.42, CAR.cushion + 0.78, sz], [0.1, 0.18, 0.26], 0, 8);
        for (const bz of [-0.07, 0.07]) K.cyl(CAR.seatX - 0.41, CAR.cushion + 0.6, sz + bz, 0.007, 0.12, { color: '#b9bdbd', metalness: 0.8, roughness: 0.3 });
        obox(g('trim', TRIM), [CAR.seatX + 0.02, F0 + 0.06, sz], [0.46, 0.12, 0.42]);                // seat base
      }
      obox(g('fab', FAB), [-0.98, CAR.cushion - 0.06, 0], [0.5, 0.14, ZI * 2 - 0.08]);                // rear bench
      obox(g('fab', FAB), [-1.24, CAR.cushion + 0.28, 0], [0.12, 0.6, ZI * 2 - 0.08], 0, 14);
      obox(g('trim', TRIM), [-0.98, F0 + 0.08, 0], [0.5, 0.16, ZI * 2 - 0.1]);

      // dashboard: body, top, binnacle, centre stack, glovebox, vents
      obox(g('trim', TRIM), [0.82, 0.72, 0], [0.32, 0.3, ZI * 2]);
      obox(g('trim2', TRIM2), [0.78, 0.88, 0], [0.42, 0.06, ZI * 2], 0, -8);
      obox(g('trim', TRIM), [0.62, 0.95, CAR.drvZ], [0.16, 0.1, 0.4], 0, -10);                       // binnacle hood
      obox(g('trim2', TRIM2), [0.63, 0.66, 0.0], [0.1, 0.3, 0.26]);                                   // centre stack
      obox(g('trim2', TRIM2), [0.68, 0.72, CAR.psgZ], [0.08, 0.14, 0.4]);                             // glovebox lid
      for (const vz of [-0.52, -0.1, 0.1, 0.56]) obox(g('vent', { color: '#121314', roughness: 0.6 }), [0.66, 0.83, vz], [0.02, 0.05, 0.12]);
      // (instrument cluster, radio and hazard button are lit planes)
      const dq = MB(); quad(dq, [0.66, 0.855, CAR.drvZ + 0.17], [0.66, 0.855, CAR.drvZ - 0.17], [0.68, 0.955, CAR.drvZ - 0.17], [0.68, 0.955, CAR.drvZ + 0.17], 1, [-1, 0.3, 0], true);
      mesh(K, dq, { tex: dialsTex(), emissive: true, emissiveIntensity: 0.9, roughness: 0.4 }, { static: false });
      K.plane(0.575, 0.74, 0, 0.18, 0.045, radioTex(), { rot: [0, -90, 0], emissive: true, emissiveIntensity: 0.55 });
      K.box(0.575, 0.66, 0.0, 0.012, 0.04, 0.05, '#7a1812', { name: 'p1:hazbtn' });
      // steering wheel + column + hub
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.016, 8, 28), K.mat({ color: '#18191a', roughness: 0.55 }));
      wheel.position.set(0.44, 0.93, CAR.drvZ); wheel.rotation.set(0, Math.PI / 2, 0); wheel.rotateX(-0.42);
      wheel.castShadow = true; K.mesh(wheel, { static: true });
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [0.44, 0.93, CAR.drvZ], [0.03, 0.06, 0.3], 0, 24);
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [0.44, 0.9, CAR.drvZ], [0.03, 0.16, 0.05], 0, 24);
      obox(g('trim', TRIM), [0.5, 0.9, CAR.drvZ], [0.06, 0.08, 0.1], 0, 24);
      obox(g('trim', TRIM), [0.6, 0.86, CAR.drvZ], [0.22, 0.07, 0.07], 0, 24);
      // receipts and a parking ticket on the dash, a tissue box on the passenger side
      K.plane(0.86, 0.915, -0.2, 0.08, 0.18, 'receipt', { rot: [-80, 12, 0] });
      K.plane(0.84, 0.918, -0.34, 0.07, 0.12, 'paper', { rot: [-82, -20, 0] });

      // body: sills, door cards (inner) and skins (outer), pillars, roof, lining
      for (const s of [-1, 1]) {
        const zi = s * ZI, zo = s * (ZI + 0.1);
        obox(g('paint', PAINT), [-0.2, 0.25, s * (ZI + 0.12)], [3.3, 0.3, 0.06]);                     // sill
        obox(g('paint', PAINT), [0.35, 0.58, zo], [1.2, 0.7, 0.04]);                                  // front door skin
        obox(g('paint', PAINT), [-0.8, 0.58, zo], [1.1, 0.7, 0.04]);                                  // rear door skin
        obox(g('doorcard', { tex: 'fabric_knit', color: '#54585c', roughness: 0.9 }), [0.35, 0.6, zi + s * 0.02], [1.18, 0.62, 0.04]);
        obox(g('doorcard', { tex: 'fabric_knit', color: '#54585c', roughness: 0.9 }), [-0.8, 0.6, zi + s * 0.02], [1.08, 0.62, 0.04]);
        obox(g('trim', TRIM), [0.3, 0.72, zi - s * 0.02], [0.5, 0.05, 0.08]);                         // armrest
        obox(g('trim2', TRIM2), [0.52, 0.86, zi - s * 0.005], [0.12, 0.04, 0.02]);                    // door handle
        obox(g('trim', TRIM), [0.2, 0.36, zi - s * 0.03], [0.45, 0.12, 0.05]);                        // door pocket
        K.cyl(0.62, 0.42, zi - s * 0.012, 0.06, 0.01, '#161718', { rx: 90 });                          // speaker grille
        obox(g('trim', TRIM), [0.05, 0.74, zi - s * 0.02], [0.02, 0.05, 0.05]);                       // window winder boss
        obox(g('chrome', { color: '#c9cdcc', roughness: 0.25, metalness: 0.85 }), [0.05, 0.72, zi - s * 0.05], [0.09, 0.015, 0.015]);
        obox(g('trim', TRIM), [-0.25, (BL + R0) / 2, zi + s * 0.02], [0.1, R0 - BL, 0.07]);          // B-pillar
        // A-pillar (from the dash corner up to the roof front) and C-pillar
        const ap = MB(); quad(ap, [0.98, BL, zi + s * 0.04], [0.9, BL, zi + s * 0.04], [0.32, R0, zi + s * 0.04], [0.4, R0, zi + s * 0.04], 1, [0, 0, -s]);
        mesh(K, ap, TRIM, { cast: false });
        const cp = MB(); quad(cp, [-1.3, BL, zi + s * 0.04], [-1.45, BL, zi + s * 0.04], [-1.4, R0, zi + s * 0.04], [-1.28, R0, zi + s * 0.04], 1, [0, 0, -s]);
        mesh(K, cp, TRIM, { cast: false });
        // side glass (front and rear) with condensation
        const gl = MB(); quad(gl, [0.9, BL, zi + s * 0.07], [-0.2, BL, zi + s * 0.07], [-0.2, R0 - 0.03, zi + s * 0.03], [0.4, R0 - 0.03, zi + s * 0.03], 1, [0, 0, -s]);
        quad(gl, [-0.3, BL, zi + s * 0.07], [-1.3, BL, zi + s * 0.07], [-1.28, R0 - 0.03, zi + s * 0.03], [-0.3, R0 - 0.03, zi + s * 0.03], 1, [0, 0, -s]);
        mesh(K, gl, GLASS, { static: false, receive: false });
        const cd = MB(); quad(cd, [0.9, BL, zi + s * 0.065], [-0.2, BL, zi + s * 0.065], [-0.2, R0 - 0.03, zi + s * 0.025], [0.4, R0 - 0.03, zi + s * 0.025], 1.6, [0, 0, -s]);
        quad(cd, [-0.3, BL, zi + s * 0.065], [-1.3, BL, zi + s * 0.065], [-1.28, R0 - 0.03, zi + s * 0.025], [-0.3, R0 - 0.03, zi + s * 0.025], 1.6, [0, 0, -s]);
        mesh(K, cd, { tex: condTex(), transparent: true, opacity: 0.8, double: true, roughness: 0.3 }, { static: false, receive: false });
        // wing mirror (outside) with the indicator repeater
        obox(g('paint', PAINT), [0.92, BL + 0.08, s * (ZI + 0.22)], [0.12, 0.1, 0.16]);
        obox(g('mirror', { color: '#8e9a98', roughness: 0.1, metalness: 0.9 }), [0.88, BL + 0.08, s * (ZI + 0.22)], [0.01, 0.08, 0.13]);
        K.light('led', 0.97, BL + 0.05, s * (ZI + 0.24), { color: '#ffa22a', intensity: 4, halo: 0.25, size: 0.018, name: 'p1:rep' + (s > 0 ? 'R' : 'L'), on: false });
      }
      obox(g('paint', PAINT), [-0.5, R0 + 0.035, 0], [2.0, 0.05, ZI * 2 + 0.16]);                    // roof skin
      obox(g('lining', LINING), [-0.5, R0 - 0.01, 0], [1.9, 0.03, ZI * 2]);                          // headlining
      for (const vz of [-0.36, 0.36]) obox(g('lining', LINING), [0.3, R0 - 0.04, vz], [0.2, 0.02, 0.36], 0, -6);   // sun visors
      K.plane(0.3, R0 - 0.052, -0.36, 0.13, 0.07, 'receipt', { rot: [90, 0, 0] });                   // a docket tucked in the visor
      // windscreen (raked), rear window, bonnet, dash top outside
      const ws = MB(); quad(ws, [0.98, BL, ZI], [0.98, BL, -ZI], [0.36, R0, -ZI], [0.36, R0, ZI], 1, [-0.5, -0.5, 0]);
      mesh(K, ws, GLASS, { static: false, receive: false });
      const wc = MB(); quad(wc, [0.975, BL + 0.005, ZI], [0.975, BL + 0.005, -ZI], [0.355, R0 - 0.004, -ZI], [0.355, R0 - 0.004, ZI], 1.2, [-0.5, -0.5, 0]);
      mesh(K, wc, { tex: condTex(), transparent: true, opacity: 0.55, double: true, roughness: 0.3 }, { static: false, receive: false });
      const rw = MB(); quad(rw, [-1.42, BL + 0.02, -ZI], [-1.42, BL + 0.02, ZI], [-1.3, R0 - 0.02, ZI], [-1.3, R0 - 0.02, -ZI], 1, [1, 0, 0]);
      mesh(K, rw, GLASS, { static: false, receive: false });
      K.plane(-1.36, 1.22, 0.36, 0.14, 0.14, pPlateTex(), { rot: [0, 90, -12] });                    // the green P plate
      const bn = MB(); quad(bn, [0.98, BL - 0.02, ZI + 0.1], [1.95, 0.8, ZI + 0.1], [1.95, 0.8, -ZI - 0.1], [0.98, BL - 0.02, -ZI - 0.1], 1, [0, 1, 0]);
      mesh(K, bn, PAINT, { cast: false });
      obox(g('paint', PAINT), [1.9, 0.45, 0], [0.12, 0.5, ZI * 2 + 0.2]);                            // nose
      obox(g('paint', PAINT), [1.45, 0.52, 0], [0.9, 0.5, ZI * 2 + 0.2], 0, 0);                      // engine bay / wings
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [1.97, 0.3, 0], [0.1, 0.18, ZI * 2 + 0.24]);   // bumper
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [1.97, 0.55, 0], [0.04, 0.1, 0.56]);           // grille
      for (const hz of [-0.56, 0.56]) obox(g('lamp', { color: '#c9ccc6', roughness: 0.15, metalness: 0.3 }), [1.96, 0.64, hz], [0.05, 0.1, 0.28]);
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [-1.6, 0.32, 0], [0.1, 0.2, ZI * 2 + 0.24]);  // rear bumper
      for (const tz of [-0.6, 0.6]) obox(g('tail', { color: '#6a1410', roughness: 0.2 }), [-1.62, 0.8, tz], [0.04, 0.16, 0.22]);
      for (const wx of [-1.2, 1.3]) for (const wz of [-0.72, 0.72]) K.cyl(wx, 0.3, wz, 0.3, 0.2, '#1b1c1c', { rx: 90, seg: 16 });
      obox(g('paint', PAINT), [-1.55, 0.6, 0], [0.12, 0.7, ZI * 2 + 0.2]);                           // tailgate
      // rear-view mirror with the air freshener
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [0.4, R0 - 0.07, 0], [0.03, 0.08, 0.02]);
      obox(g('black', { color: '#18191a', roughness: 0.55 }), [0.37, R0 - 0.14, 0], [0.04, 0.06, 0.24]);
      K.cyl(0.38, R0 - 0.3, 0.02, 0.0015, 0.16, '#d8d4c8');
      K.plane(0.38, R0 - 0.35, 0.02, 0.05, 0.1, freshTex(), { rot: [0, -70, 0], transparent: true, double: true });
      // the rear seat: a hoodie, a lanyard-less work bag, flattened returns boxes
      K.box(-1.0, CAR.cushion + 0.02, 0.3, 0.42, 0.08, 0.34, { tex: 'fabric_knit', color: '#2f3033' }, { rot: 20 });
      K.box(-0.98, CAR.cushion, -0.3, 0.46, 0.05, 0.36, 'cardboard', { rot: -8 });
      K.box(-0.98, CAR.cushion + 0.05, -0.28, 0.44, 0.03, 0.32, 'cardboard', { rot: 6 });
      K.box(-0.62, F0, 0.26, 0.3, 0.24, 0.14, { color: '#2a3a44', roughness: 0.8 });                   // his work bag in the footwell
      // passenger seat: the torn returns satchel, the modem box inside, the note (only before he takes the modem)
      if (!(S.taken && S.taken['p2_lookout:modem'])) {
        K.prop('satchel', CAR.seatX + 0.03, CAR.psgZ + 0.0, 92, { y: CAR.cushion, modem: true });
        K.plane(CAR.seatX + 0.07, CAR.cushion + 0.108, CAR.psgZ - 0.1, 0.09, 0.09, noteTex(), { rot: [-90, 0, 172], shadow: false });
        for (const [px, pz, a] of [[-0.16, 0.13, 30], [-0.1, 0.19, -25]]) K.plane(CAR.seatX + px, CAR.cushion + 0.14, CAR.psgZ + pz, 0.08, 0.06, 'plastic_sheet', { rot: [-50, a, 0], double: true, transparent: true, opacity: 0.6 });
      }
      K.box(0.62, F0, -0.4, 0.22, 0.12, 0.16, { color: '#7a6a4a', roughness: 0.95 }, { rot: 25 });  // a servo paper bag in the footwell
      bags.flush(K);

      // lights: the dash glow, the hazards (outside, blinking during P-1), the headlights (P-1 only)
      K.light('screen', 0.6, 0.9, CAR.drvZ - 0.05, { color: '#62d2c6', intensity: 0.9, distance: 1.8 });
      K.light('point', 1.6, 0.9, 0.0, { color: '#ffa030', intensity: 2.2, distance: 4.5, name: 'p1:hazard', on: false });
      K.light('spot', 1.95, 0.72, 0.0, { target: [10, 0, 0.4], angle: 26, intensity: 34, distance: 16, name: 'p1:head', on: false });
      K.light('led', 0.577, 0.66, 0.0, { color: '#ff4a2a', size: 0.012, intensity: 3, name: 'p1:hazled', on: false });
      K.light('point', 0.33, 1.06, 0.43, { color: '#6a8cff', intensity: 0.6, distance: 1.05, name: 'p1:face', on: false });
      K.light('screen', -0.95, CAR.cushion + 0.2, -0.08, { color: '#48c9bc', intensity: 0.32, distance: 0.6, name: 'p1:iglow', on: false });
      K.animate((dt, t) => {
        const on = P0.hazard && (t % 0.8) < 0.4;
        for (const n of ['p1:hazard', 'p1:repL', 'p1:repR', 'p1:hazled']) { const l = World.light && World.light(n); if (l && l.isOn !== on) l.on(on); }
      });
      // the insert phone (P-1's close-ups of the screen): a stand-in lying face up on the rear seat in the dark; its
      // screen is drawn by Phone.drawScreen (exactly what Aidan's phone shows) while P0.insert is on
      const icv = document.createElement('canvas'); icv.width = 256; icv.height = 512;
      const itex = new THREE.CanvasTexture(icv); itex.colorSpace = THREE.SRGBColorSpace; itex.anisotropy = 4;
      const IP = [-0.98, CAR.cushion + 0.075, -0.08];
      K.box(IP[0], IP[1] - 0.0095, IP[2], 0.15, 0.009, 0.074, { color: '#1e1f22', roughness: 0.35, metalness: 0.25 }, { name: 'p1:iphone' });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.139), new THREE.MeshBasicMaterial({ map: itex, toneMapped: false }));
      scr.position.set(IP[0], IP[1] + 0.0006, IP[2]); scr.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      K.mesh(scr, { name: 'p1:iscreen' });
      let iT = 0;
      K.animate((dt) => { const gl = World.light && World.light('p1:iglow'); if (gl && gl.isOn !== P0.insert) gl.on(P0.insert); if (!P0.insert) return; iT -= dt; if (iT > 0) return; iT = 0.08; try { Phone.drawScreen(icv.getContext('2d'), 256, 512); itex.needsUpdate = true; } catch (e) { /* no phone */ } });
      K.mark('p1:insert', IP[0], IP[1], IP[2], 0);
      K.mark('p1:driver', CAR.seatX, 0.02, CAR.drvZ, 90);
      K.mark('p1:passenger', CAR.seatX, CAR.cushion, CAR.psgZ, 90);
      // (a cutscene set — the examine spots exist for completeness / the endings)
      K.examine(0.62, 0.9, CAR.drvZ, ['The needles sit on zero. The fuel light is on.', 'I filled it up this morning.'], { id: 'p1:dash' });
      K.examine(0.18, 0.55, 0, 'Servo coffee. Cold since the highway.', { id: 'p1:coffee' });
      K.examine(-1.36, 1.2, 0.36, 'My P plates. Four more months.', { id: 'p1:pplate' });
      K.examine(0.38, 1.1, 0.02, 'It stopped smelling like pine years ago.', { id: 'p1:fresh' });
      K.examine(-0.98, 0.5, -0.3, 'Flattened boxes from work. I keep meaning to drop them back.', { id: 'p1:boxes' });
    },
  });

  // =================================================================================================================
  // P2 — The Lookout: the highway shoulder. x 0–44 (west → east), the guardrail and valley on the north (z ≈ 1),
  // the highway z 7–14, the verge and cutting on the south. Aidan's hatchback in the centre (22, 4.3) facing east.
  // The Hill Road turn-off leaves north at x 35–41.6 (exit north). Fog walls 20 m each way.
  // =================================================================================================================
  const CARP = { x: 22, z: 4.3 };
  const SHOT1 = { pos: [16.9, 0.55, 13.3], target: [22.6, 1.0, 4.1], fov: 38 };
  defineRoom({
    id: 'p2_lookout', name: 'THE LOOKOUT', area: 'THE LOOKOUT', chapter: 0, outdoor: true, surface: 'gravel', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [{ box: [0, 7, 44, 14], s: 'bitumen' }, { box: [34.8, -6, 41.8, 1.1], s: 'bitumen' }, { box: [0, 14, 44, 17], s: 'grass' }],
    bounds: [0, -6.5, 44, 17],
    entries: { car: [21.1, 5.9, 225], hill: [38.3, -4.3, 0], start: [21.1, 5.9, 225] },
    cameras: [
      // the opening shot: low, across the highway from the far verge (the car on the shoulder)
      { id: 'p2_lookout:wide', vol: [16.2, 1.2, 28.6, 8.6], type: 'static', pos: SHOT1.pos, target: SHOT1.target, fov: 'fit' },
      // high above the booth (west end)
      { id: 'p2_lookout:booth', vol: [1.4, 1.2, 9.8, 8.6], type: 'static', pos: [14.6, 6.6, 8.6], target: [4.9, 0.3, 3.4], fov: 'fit' },
      // from behind the guardrail near the panorama board, looking back at the car through fog (the lookout stretch)
      { id: 'p2_lookout:rail', vol: [9.8, 1.2, 16.2, 8.6], type: 'static', pos: [7.2, 1.35, -2.4], target: [16.8, 0.9, 5.2], fov: 'fit' },
      // the passenger side of the car, from behind the guardrail over the valley (the wide shot loses him behind the car)
      { id: 'p2_lookout:carN', vol: [18.4, 1.2, 25.8, 3.4], pri: 1, type: 'static', pos: [22.4, 1.75, -3.3], target: [22.0, 0.75, 3.2], fov: 'fit' },
      // the east end: the road sign and the turn-off
      { id: 'p2_lookout:east', vol: [28.6, 1.2, 42.6, 8.6], type: 'static', pos: [24.2, 2.1, 9.9], target: [35.8, 1.0, 3.6], fov: 'fit' },
      // down the Hill Road turn-off into the fog (hides what's below until the cut)
      { id: 'p2_lookout:branch', vol: [34.6, -6.4, 42.0, 1.25], pri: 1, type: 'static', pos: [38.3, 1.95, 5.7], target: [38.2, -1.4, -8.5], fov: 'fit' },
      // the highway and the far verge (pans with Aidan along the road)
      { id: 'p2_lookout:roadW', vol: [1.4, 8.6, 22, 17], type: 'pan', pos: [12, 3.1, 2.4], target: [12, 0.8, 12], fov: 40, pan: { lag: 0.3, yaw: 62, pitch: 24 } },
      { id: 'p2_lookout:roadE', vol: [22, 8.6, 42.6, 17], type: 'pan', pos: [32, 3.1, 2.4], target: [32, 0.8, 12], fov: 40, pan: { lag: 0.3, yaw: 62, pitch: 24 } },
    ],
    build(K) {
      const dead = !!(S.flags && S.flags.p0_carDead);
      const bags = Bags();
      // ---- ground: gravel shoulder, the highway, the verge, the turn-off --------------------------------------------
      K.floor(0, 1.1, 44, 7.0, 'gravel');
      K.road(0, 7.0, 44, 14.0, { axis: 'x', markings: 'center edge', kerb: false });
      K.floor(0, 14.0, 44, 16.9, 'grass');
      K.floor(34.9, -5.9, 41.7, 1.1, 'bitumen', { ramp: { axis: 'z', y0: -0.75, y1: 0 } });
      // the painted island between the highway and the turn-off, gravel wash along the shoulder edge
      K.plane(38.3, 0.008, 6.4, 6.6, 1.0, chevTex(), { rot: [-90, 0, 0], transparent: true });
      K.dress('leaves', [2, 14.2, 42, 16.4], 26, { seed: 21 });
      K.dress('papers', [3, 1.6, 40, 6.6], 6, { seed: 22 });
      // the turn-off continues down into the fog (visual), with an edge line
      const tq = bags.g('bitumen', 'bitumen');
      quad(tq, [34.9, -0.75, -5.9], [41.7, -0.75, -5.9], [41.7, -2.4, -16], [34.9, -2.4, -16], 1 / Tex.size('bitumen'), [0, 1, 0]);
      // the valley falls away beyond the rails (grass, then dirt, into white)
      const vq = bags.g('grass', { tex: 'grass', color: '#7c8470' }), vd = bags.g('dirt', 'dirt');
      quad(vq, [0, -0.02, 0.95], [34.7, -0.02, 0.95], [34.7, -4.8, -3.6], [0, -4.8, -3.6], 0.5, [0, 1, 0]);
      quad(vd, [0, -4.8, -3.6], [34.7, -4.8, -3.6], [34.7, -12, -9], [0, -12, -9], 0.5, [0, 1, 0]);
      quad(vq, [41.9, -0.02, 1.0], [48, -0.02, 1.0], [48, -4.6, -4.6], [41.9, -4.6, -4.6], 0.5, [0, 1, 0]);
      quad(vq, [34.7, -0.8, -5.9], [34.7, -0.02, 0.95], [31, -5, 0.95], [31, -5.5, -5.9], 0.5, [-1, 1, 0]);
      quad(vq, [41.9, -0.02, 1.0], [41.9, -0.8, -5.9], [45.5, -5.2, -5.9], [45.5, -4.6, 1.0], 0.5, [1, 1, 0]);
      // the cutting on the south side, above the verge
      const cq = bags.g('cut', { tex: 'dirt', color: '#8a7a64' });
      quad(cq, [-2, 0, 16.9], [46, 0, 16.9], [46, 3.6, 19.2], [-2, 3.6, 19.2], 0.5, [0, 0.5, -1]);
      quad(bags.g('grasstop', { tex: 'grass', color: '#6f7a62' }), [-2, 3.6, 19.2], [46, 3.6, 19.2], [46, 4.4, 26], [-2, 4.4, 26], 0.5, [0, 1, 0]);
      bags.flush(K);

      // ---- guardrails: along the valley, both sides of the turn-off; the wire fence on the south verge ----------------
      for (let x = 1.6; x < 34.7; x += 8.3) railSeg(K, [Math.min(x + 8.3, 34.8), 0, 1.08], [x, 0, 1.08], { ends: x === 1.6 });
      railSeg(K, [34.75, -0.75, -5.9], [34.75, 0, 1.08], { ends: true });
      railSeg(K, [41.85, 0, 1.08], [41.85, -0.75, -5.9], { ends: true });
      for (let x = 3; x < 44; x += 6) K.prop('fence', x, 16.45, 180, { variant: 'wire', len: 6 });
      K.collider(-1, 16.45, 45, 17.6, { h: 3 });
      K.examine(27.5, 0.7, 1.35, 'Can\'t see the valley. Can\'t see anything.', { id: 'p2:guardrail' });
      K.examine(38.3, 0.7, -5.2, ['The road drops away into the fog. Hill Road. [beat] Town\'s down there somewhere.', 'Somewhere.'], { id: 'p2:turnoff', r: 1.6 });

      K.exit({ id: 'p2_lookout:hill', box: [34.9, -6.5, 41.7, -5.35], to: 'p3_hillroad', entry: 'top' });
      // ---- the fog walls: back toward the city (west) and along the highway (east) -------------------------------------
      K.fogWall(0, 1.2, 1.6, 16.9, 'The road\'s just... gone.');
      K.fogWall(42.4, 1.2, 44, 16.9, 'The road\'s just... gone.');

      // ---- Aidan's hatchback: dead after P-1 --------------------------------------------------------------------------
      // (dead: a plain parked hatchback — no live lamps, not even the tail-light glow)
      K.prop('hatchback', CARP.x, CARP.z, 90, {
        ...(dead ? {} : { name: 'p2_car', hazards: true, headlights: false }),
        examine: ['Dead. Not even the hazards.', 'The key turns and nothing happens. Not even a click.', 'I\'ll deal with it after. After I\'ve fixed hers.'],
      });
      K.light('spot', CARP.x + 2.05, 0.72, CARP.z, { target: [CARP.x + 12, 0.1, CARP.z + 0.4], angle: 24, intensity: 36, distance: 18, name: 'p2:head', on: false });
      K.light('point', CARP.x, 1.0, CARP.z, { color: '#ffa030', intensity: 3.2, distance: 6.5, name: 'p2:hazard', on: false });
      K.animate((dt, t) => {
        const on = P0.hazard && (t % 0.8) < 0.4;
        const l = World.light && World.light('p2:hazard');
        if (l && l.isOn !== on) l.on(on);
      });
      // passenger seat: the torn returns satchel with the note; the modem box (the pickup)
      const seatY = 0.5, sx = CARP.x + 0.05, sz = CARP.z - 0.38;
      K.prop('satchel', sx - 0.02, sz, 100, { y: seatY, note: 'You said it would work here.' });
      const taken = !!(S.taken && S.taken['p2_lookout:modem']);
      let modemBox = null;
      if (!taken) modemBox = K.prop('modem_box', sx + 0.04, sz - 0.02, 96, { y: seatY + 0.03, open: true, name: 'p2_modembox' });
      let hModem = null;
      hModem = K.interact(sx, 0.75, sz, async (G) => {
        if (S.taken['p2_lookout:modem']) return;
        await G.think('The plastic\'s torn. [beat] She opened it. She plugged it in. It just didn\'t work.');
        G.sfx('handle', { pos: [sx, 0.9, sz - 0.6] });
        await Script.builtins.pickup(G, { id: 'p2_lookout:modem', item: 'returned_modem', obj: modemBox });
        G.sfx('door_close', { style: 'car', pos: [sx, 0.9, sz - 0.6], vol: 0.6 });
        if (hModem) hModem.remove();
      }, { id: 'p2_lookout:modem', r: 1.35, when: () => !(S.taken && S.taken['p2_lookout:modem']) });
      K.examine(sx - 0.1, 0.62, sz + 0.05, ['The note\'s still stuck to the satchel.', 'Blue biro. She pressed so hard it went through.'], { id: 'p2:satchel', r: 1.3, when: () => !!(S.taken && S.taken['p2_lookout:modem']) });

      // ---- the payphone booth (the first save point) with the Visitor Map on its inside glass ------------------------
      K.payphone(5.0, 2.5, 90, { id: 'p2_lookout:payphone' });
      K.light('fluoro', 5.0, 2.32, 2.5, { len: 0.5, intensity: 2.4, distance: 4.2, color: '#d9efe9', flicker: true, bank: 1 });
      const mapTaken = !!(S.taken && S.taken['p2_lookout:map']);
      const mapPlane = mapTaken ? null : K.plane(4.92, 1.42, 1.965, 0.26, 0.357, vmapTex(), { rot: [0, 0, 2], double: true, name: 'p2_vmap' });
      if (!mapTaken) { K.box(4.92, 1.59, 1.968, 0.012, 0.012, 0.01, '#c0392b', { name: 'p2_vmappin' }); }
      K.pickup('map_town', 4.92, 1.3, 2.02, { id: 'p2_lookout:map', model: false, r: 0.95 });
      K.animate(() => { if (S.taken && S.taken['p2_lookout:map']) { if (mapPlane && mapPlane.visible) mapPlane.visible = false; const p = World.obj && World.obj('p2_vmappin'); if (p && p.visible) p.visible = false; } });
      K.examine(5.95, 1.3, 1.75, ['A phone box. The handset\'s hanging off the hook, swinging a little.', 'Somebody left in a hurry. Or got tired of waiting.'], { id: 'p2:booth', r: 1.1 });

      // ---- the lookout: panorama board, coin binoculars, picnic table, bin, the brown sign ----------------------------
      // panorama board on two posts, angled up toward the viewer
      for (const px of [14.9, 17.1]) K.cyl(px, 0, 1.75, 0.045, 1.05, { tex: 'metal', color: '#4b4136' });
      K.box(16.0, 0.95, 1.72, 2.5, 0.07, 0.12, { tex: 'wood', color: '#5a4630' });
      const pb = MB(); quad(pb, [14.8, 1.0, 1.84], [17.2, 1.0, 1.84], [17.2, 1.55, 1.52], [14.8, 1.55, 1.52], 1, [0, 0.5, 1], true);
      mesh(K, pb, { tex: panoTex(), roughness: 0.7 });
      const pbk = MB(); quad(pbk, [17.2, 1.0, 1.82], [14.8, 1.0, 1.82], [14.8, 1.55, 1.5], [17.2, 1.55, 1.5], 1, [0, -0.5, -1]);
      mesh(K, pbk, { tex: 'wood', color: '#4a3a28' });
      K.collider(14.7, 1.4, 17.3, 1.95, { h: 1.6 });
      K.examine(16.0, 1.25, 1.9, ['A painting of the view. The mast, the exchange, the hospital. [beat] That\'s what\'s out there.', '"On a clear day you can see the mast." [beat] Not today.'], { id: 'p2:pano', r: 1.4 });
      // coin-operated binoculars
      K.cyl(19.6, 0, 1.7, 0.06, 1.12, { tex: 'metal', color: '#2f4a3a' });
      K.box(19.6, 1.12, 1.7, 0.2, 0.16, 0.26, { tex: 'metal', color: '#2f4a3a' }, { rot: 8 });
      for (const ex of [-0.05, 0.05]) K.cyl(19.6 + ex, 1.25, 1.84, 0.028, 0.08, '#16181a', { rx: 90 });
      K.box(19.6, 1.05, 1.82, 0.1, 0.08, 0.04, '#b9a35a');
      K.collider(19.45, 1.5, 19.75, 1.9, { h: 1.3 });
      K.examine(19.6, 1.2, 1.85, ['Coin-operated binoculars. Twenty cents. [beat] It\'d just be white.', 'The coin slot\'s rusted shut anyway.'], { id: 'p2:binos', r: 1.2 });
      // picnic table (timber) with somebody's lunch
      const PT = { tex: 'wood', color: '#7c6446' }, tx0 = 10.6, tz0 = 3.9;
      for (let k = 0; k < 4; k++) K.box(tx0, 0.72, tz0 - 0.33 + k * 0.22, 1.9, 0.045, 0.2, PT, { rot: 90 });
      for (const bz of [-0.72, 0.72]) K.box(tx0, 0.44, tz0 + bz, 1.9, 0.04, 0.26, PT);
      for (const lx of [-0.75, 0.75]) { K.box(tx0 + lx, 0, tz0, 0.08, 0.72, 1.2, PT); K.box(tx0 + lx, 0.32, tz0, 0.08, 0.08, 1.7, PT); }
      K.collider(tx0 - 1.0, tz0 - 0.85, tx0 + 1.0, tz0 + 0.85, { h: 0.75 });
      K.prop('sandwich', tx0 + 0.3, tz0 - 0.1, 30, { y: 0.765 });
      K.prop('energy_can', tx0 - 0.4, tz0 + 0.15, 0, { y: 0.765 });
      K.examine(tx0, 0.9, tz0, ['Somebody left half a sandwich. Still in the cling wrap.', 'Ham and pickle. [beat] They were going to come back for it.'], { id: 'p2:picnic', r: 1.4 });
      K.pickup('coffee', tx0 - 0.1, 0.765, tz0 + 0.3, { id: 'p2_lookout:coffee', extraOnEasy: true });
      K.prop('bin', 13.4, 1.75, 0, { variant: 'street' });
      K.examine(13.4, 0.9, 1.9, ['A servo receipt. Two pies and a coffee.', 'Paid cash. Nobody pays cash any more.'], { id: 'p2:bin' });
      K.prop('sign_post', 8.6, 1.55, 0, { style: 'council', text: 'SCENIC\nLOOKOUT', bg: '#5b3b22', fg: '#efe4cc', w: 0.9, h: 0.52 });
      K.examine(8.6, 2.0, 1.6, 'Scenic lookout. [beat] You can\'t see past the rail.', { id: 'p2:lookoutsign' });

      // ---- the east end: the road sign ("SIGNAL HILL 2 — POP. 1,900" / "MOBILE COVERAGE ENDS"), the turn-off -------
      K.prop('road_sign', 33.4, 2.1, -68, {});                                   // (turned a little toward the road and the east camera)
      K.examine(33.4, 1.8, 2.1, 'Mobile coverage ends. [beat] Great.', { id: 'p2:roadsign', r: 1.5 });
      K.prop('sign_post', 42.0, 1.6, 180, { text: 'HILL RD', text2: 'SIGNAL HILL 2' });
      // guide posts along the far verge, a power line running into the fog
      for (let x = 4; x < 44; x += 10) { K.box(x, 0, 14.5, 0.1, 1.0, 0.08, '#e7e4da'); K.box(x, 0.8, 14.455, 0.06, 0.12, 0.012, '#b3261e'); }
      K.prop('power_pole', 7, 18.2, 0, { span: 30 });
      K.prop('power_pole', 37, 18.2, 0, { span: 12 });
      K.prop('gum_tree', 12, 20.5, 0, { y: 3.8 }); K.prop('gum_tree', 29, 21.5, 0, { y: 3.9 }); K.prop('gum_tree_small', 4, 19.6, 0, { y: 3.7 });
      K.prop('gum_tree', 27, -7.5, 0, { y: -9.5 }); K.prop('gum_tree', 6, -8.5, 0, { y: -10.5 });
      K.examine(22, 0.4, 10.4, ['No cars. Not one since I pulled over.', 'You can hear a long way out here. [beat] There\'s nothing to hear.'], { id: 'p2:highway', r: 1.8 });
      K.mark('p2:driver', CARP.x + 0.05, 0.03, CARP.z + 0.38, 90);
    },
  });

  // =================================================================================================================
  // P3 — Hill Road: 120 m S-curve descending east. Guardrail on the valley side (north), a cut bank with gum trees on
  // the south. The fire-trail gate at 60 m (the figure crosses there), a driveway and letterbox at 90 m.
  // =================================================================================================================
  const XS = []; for (let x = -3; x <= 123.001; x += 1) XS.push(+x.toFixed(3));
  const XW = []; for (let x = -16; x <= 134.001; x += 1) XW.push(+x.toFixed(3));        // terrain + road run on past the ends into the fog
  const bumpy = (x) => 1 + 0.13 * Math.sin(x * 0.83) + 0.08 * Math.sin(x * 2.1 + 1.3) + 0.05 * Math.sin(x * 4.7);
  const bankY = { toe: 0, mid: (x) => 2.9 * bumpy(x) * (1 - 0.72 * gully(x) - 0.6 * drive(x)), lip: (x) => 3.3 * bumpy(x + 3) * (1 - 0.7 * gully(x) - 0.55 * drive(x)), top: (x) => 4.3 * (1 - 0.4 * gully(x) - 0.4 * drive(x)), far: (x) => 9.5 + 1.5 * Math.sin(x * 0.21) };
  defineRoom({
    id: 'p3_hillroad', name: 'HILL ROAD', area: 'HILL ROAD', chapter: 0, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [],
    bounds: [-3, -18, 123, 16],
    entries: { top: [-0.6, 0, 90], bottom: [120.6, 0, -90], start: [-0.6, 0, 90] },
    cameras: [
      // P-3: very high, looking down the curve, Aidan small at the top (§7B: a pan; a long lens so he still reads — a
      // wide static here left him a speck under the fog sheets)
      { id: 'p3_hillroad:high', vol: [-3.2, -8, 14, 12], type: 'pan', pos: [-10, 12, -9], target: [6, -0.6, 1.2], fov: 38, pan: { lag: 0.5, yaw: 45, pitch: 25 } },
      // low at the bend, from the valley side through the gum trunks (pans with him around the bend)
      { id: 'p3_hillroad:bend', vol: [14, -8, 44, 16], type: 'pan', pos: [29, hrY(29) + 0.9, -1.4], target: [29, hrY(29) + 0.5, 8], fov: 46, pan: { lag: 0.35, yaw: 78, pitch: 22 } },
      // from behind the fire-trail gate, looking back up the road (the empty road before he arrives)
      { id: 'p3_hillroad:gate', vol: [44, -12, 64, 12], type: 'pan', pos: [66.5, hrY(66) + 1.9, -6.2], target: [52, hrY(52) + 0.6, 1.2], fov: 44, pan: { lag: 0.3, yaw: 60, pitch: 26 } },
      // a rail along the guardrail on the valley side
      { id: 'p3_hillroad:rail', vol: [64, -16, 84, 8], type: 'rail', pos: [62, hrY(62) + 2.3, -8], fov: 50, rail: { a: [61.4, hrY(61.4) + 2.3, -8.06], b: [82.3, hrY(82.3) + 2.3, -14.15], look: [0, 0.9, 0], lag: 0.35 } },
      // the letterbox in the foreground, the road coming down past it
      { id: 'p3_hillroad:letterbox', vol: [84, -16, 92.2, 8], type: 'pan', pos: [...(() => { const [x, z] = hrPt(95.6, HR.bank - 0.35); return [x, hrY(x) + 1.45, z]; })()], target: [86, hrY(86) + 0.7, hrZ(86)], fov: 44, pan: { lag: 0.3, yaw: 70, pitch: 55 } },
      // the bottom: a rail out over the valley, looking a little ahead of him — down toward the one light at the bus
      // shelter (a static shot here lost him in the fog at the far end of a 30 m volume)
      { id: 'p3_hillroad:bottom', vol: [92.2, -12, 123.2, 8], type: 'rail', pos: [92.6, hrY(92.6) + 2.4, -15.1], fov: 50, rail: { a: [92.6, hrY(92.6) + 2.4, -15.1], b: [123, hrY(123) + 2.4, -8.2], look: [2.2, 0.9, 0], lag: 0.35 } },
    ],
    build(K) {
      const bags = Bags();
      const SB = 1 / Tex.size('bitumen');
      // ---- walkable strips (invisible ramps between the rail and the bank; the visible surfaces are ribbons) -----------
      for (let x0 = -3; x0 < 123; x0 += 2) {
        const x1 = Math.min(123, x0 + 2);
        let zmin = Infinity, zmax = -Infinity;
        for (let x = x0 - 3; x <= x1 + 3; x += 0.1) for (const d of [HR.rail, HR.bank]) { const [px, pz] = hrPt(x, d); if (px >= x0 - 0.001 && px <= x1 + 0.001) { if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz; } }
        const f = K.floor(x0, zmin - 0.05, x1, zmax + 0.05, 'bitumen', { ramp: { axis: 'x', y0: hrY(x0), y1: hrY(x1) }, skirt: false });
        if (f) f.visible = false;
      }
      // ---- the colliders: the rail line (valley side) and the bank toe (thick, so nothing past them is walkable) ----
      for (let x = -3.2; x < 123; x += 2) {
        for (const side of [-1, 1]) {
          const d = side < 0 ? HR.rail : HR.bank, depth = side < 0 ? 1.8 : 2.4;
          const [ax, az] = hrPt(x, d), [bx, bz] = hrPt(x + 2, d);
          const th = Math.atan2(bz - az, bx - ax), L = Math.hypot(bx - ax, bz - az) + 0.7;
          const ox = side < 0 ? Math.sin(th) : -Math.sin(th), oz = side < 0 ? -Math.cos(th) : Math.cos(th);
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, y0 = hrY(mx) - 2;
          if (side < 0 && mx > 58.1 && mx < 61.9) continue;          // the fire-trail gap has its own blocker
          const o = { h: 5, y: y0 };
          if (side > 0 && Math.abs(mx - 60.6) < 2.6) o.blocker = 'Just a track up into the trees. I\'m not going up there.';
          if (side > 0 && Math.abs(mx - 88.6) < 2.4) o.blocker = 'It\'s someone\'s driveway. I shouldn\'t.';
          K.colliderRot(mx + ox * depth / 2, mz + oz * depth / 2, L, depth, -th / D2R, o);
        }
      }
      { const [gx, gz] = hrPt(60, HR.rail); K.collider(57.9, gz - 1.9, 62.1, gz + 0.02, { h: 5, y: hrY(60) - 2, blocker: 'It drops straight down into the fog.' }); }
      // the ends: back up to the Lookout, on down to the bus shelter
      K.exit({ id: 'p3_hillroad:top', box: [-3.3, -6, -2.2, 6], to: 'p2_lookout', entry: 'hill' });
      K.exit({ id: 'p3_hillroad:bottom', box: [122.2, -6, 123.3, 6], to: 'p4_busshelter', entry: 'hill' });

      // ---- surfaces (ribbons): road, verges, the valley slope, the bank ---------------------------------------------
      ribbon(bags.g('road', 'bitumen'), XW, hrRow(HR.hw, 0.02), hrRow(-HR.hw, 0.02), SB, HR.hw, -HR.hw, [0, 1, 0]);
      ribbon(bags.g('gravel', 'gravel'), XW, hrRow(-HR.hw, 0.014), hrRow(HR.rail - 0.1, 0.012), 1 / Tex.size('gravel'), -HR.hw, HR.rail, [0, 1, 0]);
      ribbon(bags.g('verge', { tex: 'grass', color: '#7c8470' }), XW, hrRow(HR.bank + 0.1, 0.012), hrRow(HR.hw, 0.014), 0.5, HR.bank, HR.hw, [0, 1, 0]);
      ribbon(bags.g('valley', { tex: 'grass', color: '#727a66' }), XW, hrRow(HR.rail - 0.1, 0.0), hrRow(HR.rail - 4.2, -5.5), 0.5, 0, 5, [0, 1, 0]);
      ribbon(bags.g('valley2', 'dirt'), XW, hrRow(HR.rail - 4.2, -5.5), hrRow(HR.rail - 10, -13), 0.5, 5, 13, [0, 1, 0]);
      ribbon(bags.g('valley3', { tex: 'grass', color: '#5f6656' }), XW, hrRow(HR.rail - 10, -13), hrRow(HR.rail - 28, -27), 0.3, 13, 31, [0, 1, 0]);
      ribbon(bags.g('bank', { tex: 'dirt', color: '#8a7a64' }), XW, hrRow(HR.bank + 0.1, 0.0), hrRow(HR.bank + 1.7, bankY.mid), 0.5, 0, 3, [0, 0.4, -1]);
      ribbon(bags.g('bank', { tex: 'dirt', color: '#8a7a64' }), XW, hrRow(HR.bank + 1.7, bankY.mid), hrRow(HR.bank + 2.4, bankY.lip), 0.5, 3, 4, [0, 0.4, -1]);
      ribbon(bags.g('banktop', { tex: 'grass', color: '#68735c' }), XW, hrRow(HR.bank + 2.4, bankY.lip), hrRow(HR.bank + 12, bankY.top), 0.5, 0, 10, [0, 1, 0]);
      ribbon(bags.g('banktop', { tex: 'grass', color: '#68735c' }), XW, hrRow(HR.bank + 12, bankY.top), hrRow(HR.bank + 30, bankY.far), 0.5, 10, 28, [0, 1, 0]);
      // road markings: dashed centre line, solid edge lines
      const ml = MB(), el = MB();
      ribbon(ml, XW, hrRow(0.06, 0.027), hrRow(-0.06, 0.027), 1 / 12, 0, 1, [0, 1, 0]);
      ribbon(el, XW, hrRow(HR.hw - 0.25, 0.026), hrRow(HR.hw - 0.35, 0.026), 1 / 4, 0, 1, [0, 1, 0]);
      ribbon(el, XW, hrRow(-HR.hw + 0.35, 0.026), hrRow(-HR.hw + 0.25, 0.026), 1 / 4, 0, 1, [0, 1, 0]);
      for (let k = 0; k < ml.uv.length; k += 2) { const u = ml.uv[k], v = ml.uv[k + 1]; ml.uv[k] = v; ml.uv[k + 1] = u; }
      for (let k = 0; k < el.uv.length; k += 2) { const u = el.uv[k], v = el.uv[k + 1]; el.uv[k] = v; el.uv[k + 1] = u; }
      mesh(K, ml, markMat(dashTex()), { static: false, receive: true });
      mesh(K, el, markMat(lineTex()), { static: false, receive: true });
      // the driveway (gravel ramp up the notch into the fog) at 90 m
      { const dq = bags.g('drive', { tex: 'gravel', color: '#9a9080' });
        const p0 = hrPt(87.2, HR.bank), p1 = hrPt(90.0, HR.bank), p2 = hrPt(87.4, HR.bank + 9), p3 = hrPt(90.2, HR.bank + 9);
        quad(dq, [p0[0], hrY(p0[0]) + 0.02, p0[1]], [p1[0], hrY(p1[0]) + 0.02, p1[1]], [p3[0], hrY(p3[0]) + 2.2, p3[1]], [p2[0], hrY(p2[0]) + 2.2, p2[1]], 0.5, [0, 1, 0]); }
      bags.flush(K);

      // ---- guardrail along the valley side (2 m segments following the curve and the grade), the fire-trail gate ----
      for (let x = -15; x < 133; x += 2) {
        const xb = x + 2;
        if (x + 1 > 58.2 && x + 1 < 61.8) continue;
        const [ax, az] = hrPt(x, HR.rail), [bx, bz] = hrPt(xb, HR.rail);
        railSeg(K, [bx, hrY(bx), bz], [ax, hrY(ax), az], { collide: false, ends: (x + 1 > 56 && x + 1 < 58.2) || (x + 1 > 61.8 && x + 1 < 64) });
      }
      { // the fire-trail gate: two posts, a tubular gate chained shut, the sign
        const [gx, gz] = hrPt(60, HR.rail), y = hrY(60);
        for (const px of [58.3, 61.7]) K.cyl(px, y, gz - 0.1, 0.07, 1.25, { tex: 'metal', color: '#7d837d' });
        const GT = { tex: 'metal', color: '#9aa39c', roughness: 0.5 };
        for (const gy of [0.35, 0.72, 1.08]) K.box(59.55, y + gy, gz - 0.1, 2.5, 0.05, 0.05, GT);
        for (const bx0 of [58.4, 59.2, 60.0, 60.8]) K.box(bx0, y + 0.35, gz - 0.1, 0.04, 0.78, 0.04, GT);
        K.box(60.86, y + 0.7, gz - 0.13, 0.08, 0.18, 0.04, '#6a6a60');
        K.cyl(61.0, y + 0.72, gz - 0.12, 0.012, 0.3, '#5f635f', { rz: 90 });
        K.prop('sign_post', 57.7, gz + 0.35, 180, { style: 'council', text: 'FIRE TRAIL\nAUTHORISED\nVEHICLES ONLY', w: 0.62, h: 0.48, y });
        K.examine(59.8, y + 0.9, gz + 0.1, ['FIRE TRAIL. AUTHORISED VEHICLES ONLY. [beat] The chain\'s newer than the gate.', 'The trail just drops into the white.'], { id: 'p3:gate', r: 1.6 });
      }
      // ---- the letterbox at 90 m ("No junk mail. No salespeople."), the driveway, a guide post, the wildlife sign -------
      { const [lx, lz] = hrPt(90.4, HR.bank - 0.55), th = hrTh(90.4), rot = (Math.PI - th) / D2R;
        K.prop('letterbox', lx, lz, rot, { y: hrY(lx), text: 'No junk mail.\nNo salespeople.', label: '112', color: '#7c2a22' });
        K.examine(lx, hrY(lx) + 1.1, lz, 'Fair enough.', { id: 'p3:letterbox', r: 1.3 });
        const [ex, ez] = hrPt(88.6, HR.bank + 0.4);
        K.examine(ex, hrY(ex) + 1.0, ez, ['A driveway goes up into the fog. There\'s no house I can see.', 'Somebody lives up there. Somebody gets their mail.'], { id: 'p3:driveway', r: 1.6 });
        const [cx, cz] = hrPt(89.6, HR.bank - 0.3);
        K.pickup('energy_drink', cx, hrY(cx) + 0.02, cz, { id: 'p3_hillroad:energy', extraOnEasy: true });
      }
      { const [sx, sz] = hrPt(18, HR.bank - 0.3), th = hrTh(18);
        K.cyl(sx, hrY(sx), sz, 0.035, 2.2, { tex: 'metal', color: '#a4aba6' });
        const face = Math.atan2(-Math.cos(th), -Math.sin(th));
        K.plane(sx + Math.sin(face) * 0.04, hrY(sx) + 1.95, sz + Math.cos(face) * 0.04, 0.7, 0.7, rooTex(), { rot: [0, face / D2R, 0], transparent: true, alphaTest: 0.5 });
        K.plane(sx + Math.sin(face) * 0.04, hrY(sx) + 1.38, sz + Math.cos(face) * 0.04, 0.5, 0.2, Tex.sign('NEXT 3 km', { style: 'warning', w: 0.5, h: 0.2 }), { rot: [0, face / D2R, 0] });
        K.examine(sx, hrY(sx) + 1.5, sz, ['Kangaroos, next three kilometres. [beat] I haven\'t seen anything alive.', 'Not even a bird.'], { id: 'p3:roos', r: 1.4 });
      }
      for (let x = 8; x < 120; x += 16) {
        if (Math.abs(x - 60) < 4 || Math.abs(x - 88) < 4) continue;
        const [gx, gz] = hrPt(x, HR.bank - 0.35);
        K.box(gx, hrY(gx), gz, 0.1, 1.0, 0.08, '#e7e4da', { rot: -hrTh(x) / D2R });
        K.box(gx, hrY(gx) + 0.82, gz, 0.06, 0.12, 0.09, '#b3261e', { rot: -hrTh(x) / D2R });
      }
      // ---- gum trees: on the bank above, a few on the verge at the bend, tall ones rising out of the valley ----------
      const tree = (x, d, dy, kind = 'gum_tree', o = {}) => { const [tx0, tz0] = hrPt(x, d); K.prop(kind, tx0, tz0, (x * 37) % 360, { y: hrY(tx0) + dy, ...o }); };
      for (const [x, d] of [[6, 9], [15, 11], [27, 8.5], [37, 10], [47, 9], [55, 11.5], [67, 9], [74, 12], [81, 8.8], [97, 9.5], [106, 11], [114, 8.6]]) tree(x, d, bankY.top(x) * 0.8 + 0.2);
      tree(24.5, 5.8, 0.0); tree(33.8, 6.0, 0.0); tree(29.2, 6.4, 0.0, 'gum_tree_small');
      // (the ones below the rail cameras' paths — 64–123 m, 8 m out over the valley — stand further down the slope)
      tree(42, -8.2, -7.5, 'gum_tree', { h: 12 });
      for (const [x, d, y] of [[70, -15.5, -14.0], [86, -15.5, -14.0], [101, -16, -14.4], [112, -15.5, -14.0]]) tree(x, d, y, 'gum_tree', { h: 17 });
      // (both trunks stand a little further down the slope: closer in, they hid him from the bend camera)
      tree(25.0, -9.2, -6.1, 'gum_tree', { h: 19 }); tree(33.2, -9.4, -6.3, 'gum_tree', { h: 19 });
      // shrubs and rocks along the bank toe
      for (let x = 3; x < 120; x += 6.5) { if (Math.abs(x - 60.6) < 3 || Math.abs(x - 88.6) < 3) continue; const [sx0, sz0] = hrPt(x, HR.bank + 0.55); K.prop('shrub', sx0, sz0, 0, { y: hrY(sx0) + 0.1, w: 1.1 + ((x * 7) % 5) * 0.12, h: 0.9 + ((x * 3) % 4) * 0.15, dead: ((x * 13) % 7) < 2, collide: false }); }
      for (let x = 6; x < 120; x += 11) { if (Math.abs(x - 60.6) < 3 || Math.abs(x - 88.6) < 3) continue; const [rx, rz] = hrPt(x, HR.bank + 1.4); K.sphere(rx, hrY(rx) + 1.0 + (x % 3) * 0.3, rz, 0.5, { tex: 'concrete', color: '#8a8272' }, { scale: [1.5, 0.7, 1.1] }); }
      K.examine(...(() => { const [ex, ez] = hrPt(29.2, 5.4); return [ex, hrY(ex) + 1.2, ez]; })(), ['Gum trees. The bark\'s coming off in strips, like wet paper.', 'Something\'s been scratched into this one. Two letters. Too worn to read.'], { id: 'p3:gum', r: 1.6 });
      { const [ex, ez] = hrPt(76, HR.rail + 0.3); K.examine(ex, hrY(ex) + 0.7, ez, ['The rail\'s the only thing between the road and nothing.', 'Somebody\'s hit it here. Hard. It\'s been bent back.'], { id: 'p3:rail', r: 1.4 }); }
      { const [ex, ez] = hrPt(60.2, -0.8); K.examine(ex, hrY(ex) + 0.2, ez, 'A line in the grit, across the road. Like something was dragged.', { id: 'p3:drag', r: 1.8, when: () => !!S.done['p3:crossed'] }); }
      { const [ex, ez] = hrPt(104, 0); K.examine(ex, hrY(ex) + 0.3, ez, ['The line\'s been repainted. Someone still looks after this road.', 'The paint\'s newer than anything else out here.'], { id: 'p3:line', r: 1.6 }); }
      // a fallen branch across the track mouth at 60 m
      { const [bx, bz] = hrPt(60.6, HR.bank + 0.7); K.cyl(bx, hrY(bx) + 0.12, bz, 0.11, 3.2, { tex: 'wood', color: '#8a7e6a' }, { rz: 90, rot: -hrTh(60.6) / D2R + 8 }); }
      // the one light at the bottom of the hill, a glow in the fog; power poles on the bank
      K.light('street', 128.5, hrY(123) + 6.4, 2.2, { real: false, haloSize: 5.5, haloOpacity: 0.5 });
      for (const x of [34, 76, 110]) { const [px, pz] = hrPt(x, HR.bank + 3.2); K.prop('power_pole', px, pz, 0, { y: hrY(px) + bankY.lip(x) - 0.2 }); }
      // dressing: leaves on the verges
      for (let x = 4; x < 118; x += 12) { const [lx, lz] = hrPt(x, HR.bank - 0.7); K.dress('leaves', [lx - 2.5, lz - 0.6, lx + 2.5, lz + 0.6], 10, { seed: 31 + x, y: hrY(lx) + 0.03 }); }
      // the crossing trigger (halfway down)
      K.trigger([40.5, -4, 44.5, 14], (G) => P0_crossing(G), { id: 'p3_hillroad:crossing' });
    },
    onUpdate(dt) {
      const f = Render.fog;
      if (!f) return;
      const c = Cam.current, id = c ? c.id : null;
      const want = P0.fogLow ? 0.034 : id === 'p3_hillroad:high' ? 0.028 : 0.05;
      if (id !== P0.lastCam) { P0.lastCam = id; f.density = want; }
      else f.density += (want - f.density) * Math.min(1, dt * 1.5);
    },
    onLeave() { P0.fogLow = false; P0.lastCam = null; },
  });

  // P-3: halfway down, a hunched figure in a cardigan crosses the road far ahead and vanishes into the fog
  async function P0_crossing(G) {
    if (S.done['p3:crossed']) return;
    await G.run(async (G) => {
      const A = G.aidan;
      A.pose('idle');
      P0.fogLow = true;
      const a = A.pos;
      const cz = hrZ(60), cy = hrY(60);
      let dx = 60 - a.x, dz = cz - a.z; const dd = Math.hypot(dx, dz) || 1; dx /= dd; dz /= dd;
      await A.turn([60, cz], 0.5);
      // over his shoulder (head in frame), the crossing far ahead down the road
      G.cam({ pos: [a.x - dx * 2.7 + dz * 1.15, a.y + 1.95, a.z - dz * 2.7 - dx * 1.15], target: [60, cy + 0.9, cz + 0.5], fov: 34, to: { pos: [a.x - dx * 2.4 + dz * 1.1, a.y + 1.95, a.z - dz * 2.4 - dx * 1.1], fov: 29 }, dur: 11 });
      // the path: out of the track on the bank, across the road, through the gap by the gate, down into the white
      const pts = [[61.2, HR.bank + 3.2, 1.25], [60.9, HR.bank + 0.4, 0.05], [60.3, 0, 0.02], [59.9, HR.rail - 0.1, 0.0], [59.6, HR.rail - 2.2, -1.2], [59.2, HR.rail - 4.4, -2.8]]
        .map(([x, d, dy]) => { const [px, pz] = hrPt(x, d); return [px, hrY(px) + dy, pz]; });
      const fig = G.actor('p3_figure', 'p0_cardigan');
      fig.place(pts[0][0], pts[0][2], 0, { y: pts[0][1] });
      if (fig.raw) { fig.raw.idleLife = false; fig.raw.setAnim('walk', { blend: 0 }); fig.raw.root.rotation.y = Math.atan2(pts[1][0] - pts[0][0], pts[1][2] - pts[0][2]); }
      let seg = 0, u = 0, faded = false;
      const speed = 1.15;
      const walk = G.loop((dt) => {
        if (!fig.raw) return true;
        const r = fig.raw.root, p = pts[seg], q = pts[seg + 1];
        const L = Math.hypot(q[0] - p[0], q[2] - p[2]) || 0.01;
        u += (speed * dt) / L;
        if (u >= 1) { seg++; u -= 1; if (seg >= pts.length - 1) return true; }
        const P = pts[seg], Q = pts[seg + 1];
        r.position.set(P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u, P[2] + (Q[2] - P[2]) * u);
        r.rotation.y += U.angleDiff(r.rotation.y, Math.atan2(Q[0] - P[0], Q[2] - P[2])) * Math.min(1, dt * 4);
        if (seg >= 3 && !faded) { faded = true; fig.fade(0, 2.2).catch(() => {}); }
        return false;
      });
      await G.wait(1.4);
      G.bars(1, { tell: 'eftpos' });
      await G.wait(2.2);
      A.look(fig);
      await G.say('AIDAN', 'Hello? [beat] Excuse me!');
      await walk;
      A.look(null);
      await G.wait(1.3);
      // nothing answers
      S.done['p3:crossed'] = true;
      G.bars(null);
      fig.remove();
      P0.fogLow = false;
      G.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'P-3' });
    S.done['p3:crossed'] = true;
    P0.fogLow = false;
  }

  // =================================================================================================================
  // P4 — the bus shelter: the bottom of Hill Road. The Route 44 shelter on the north footpath under the only working
  // streetlight, the bin and flattened boxes (box cutter) on the east verge, Relay Street north, a drop to the south.
  // =================================================================================================================
  const SH_ = { x: 3.6, z: 1.35 };                                   // shelter centre (faces south)
  const TETH = { pos: [3.95, 1.37], seat: [2.85, 1.06] };
  defineRoom({
    id: 'p4_busshelter', name: 'BUS SHELTER', area: 'RELAY STREET', chapter: 0, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.06 },
    surfaces: [{ box: [0, 0.3, 7.95, 3.5], s: 'concrete' }, { box: [6.4, -7.5, 7.95, 0.3], s: 'concrete' }, { box: [12.5, 3.5, 14.4, 9.9], s: 'grass' }],
    bounds: [-1.6, -7.6, 14.5, 10],
    entries: { hill: [-0.3, 6.6, 90], relay: [10.2, -3.6, 180], start: [-0.3, 6.6, 90] },
    cameras: [
      // coming down out of the fog from Hill Road (the empty clearing first, the figure in the shelter at the frame edge)
      { id: 'p4_busshelter:entry', vol: [-1.6, 3.5, 3.4, 9.9], type: 'static', pos: [8.6, 1.7, 8.2], target: [0.2, 1.0, 5.6], fov: 'fit' },
      // low behind Aidan, facing the shelter
      // (just in front of the drop's fog curtain, high enough to look over the barrier boards)
      { id: 'p4_busshelter:low', vol: [3.4, 3.5, 9.4, 9.9], type: 'static', pos: [7.6, 1.45, 11.9], target: [4.4, 0.95, 2.6], fov: 'fit' },
      // high, from the streetlight, looking down on the shelter and the footpath
      { id: 'p4_busshelter:high', vol: [-1.6, 0.25, 6.2, 3.5], type: 'static', pos: [9.6, 6.3, 6.6], target: [3.0, 0.3, 1.6], fov: 'fit' },
      // into the shelter from the road (under its roof: the figure reading the timetable, the bench, the fight)
      { id: 'p4_busshelter:shelter', vol: [1.7, 0.25, 5.45, 2.35], pri: 1, type: 'static', pos: [3.1, 1.5, 7.9], target: [3.8, 1.0, 1.3], fov: 'fit' },
      // the bin and the boxes on the east verge
      { id: 'p4_busshelter:bin', vol: [9.4, 3.5, 14.4, 9.9], type: 'static', pos: [4.4, 2.5, 8.8], target: [12.8, 0.6, 5.6], fov: 'fit' },
      // Relay Street, north into the fog
      { id: 'p4_busshelter:relay', vol: [6.4, -7.6, 14.4, 3.5], type: 'static', pos: [10.2, 2.8, 8.4], target: [9.8, 0.8, -4.4], fov: 'fit' },
      // through the shelter's scratched back glass (from the footpath behind it)
      { id: 'p4_busshelter:glass', vol: [6.2, 0.25, 7.95, 3.5], pri: 1, type: 'static', pos: [2.15, 1.62, 1.25], target: [7.1, 0.85, 1.95], fov: 'fit' },
    ],
    spawns: [
      { id: 'p4_busshelter:teth', type: 'tethered', pos: TETH.pos, rot: 180, anchor: TETH.pos, cardigan: '#566474',
        seat: { pos: TETH.seat, rot: 0, h: 0.47 },
        get threat() { return !!(S.done && S.done['p4:reveal']); },
        get noticeRange() { return S.done && S.done['p4:reveal'] ? 5 : 1.8; } },
    ],
    build(K) {
      const bags = Bags();
      const riddle = (S.difficulty && S.difficulty.riddle) || 'normal';
      // ---- ground: the clearing, Relay Street north, the footpaths and kerbs, the verge --------------------------------
      K.floor(-1.6, 3.5, 12.5, 9.9, 'bitumen');
      K.floor(7.95, -7.6, 12.5, 3.5, 'bitumen');
      K.floor(-1.6, 0.25, 7.95, 3.5, 'footpath', { y: 0.14, skirt: false });
      K.floor(6.4, -7.6, 7.95, 0.25, 'footpath', { y: 0.14, skirt: false });
      K.floor(12.5, -7.6, 14.4, 9.9, { tex: 'grass', color: '#77806a' }, { y: 0.06, skirt: false });
      K.box(3.2, 0, 3.5, 9.5, 0.14, 0.16, 'kerb');
      K.box(7.95, 0, -3.65, 0.16, 0.14, 7.9, 'kerb');
      K.box(-1.6, 0, -7.6, 0.2, 0.2, 0.2, 'kerb');
      // Relay Street's centre line, the old stop line where Hill Road meets it
      K.plane(10.25, 0.006, -3.3, 0.12, 8.6, dashTex(), { rot: [-90, 0, 0], transparent: true });
      K.plane(9.9, 0.006, 3.2, 3.6, 0.3, lineTex(), { rot: [-90, 0, 90], transparent: true });
      // Hill Road runs on west into the fog (visual), Relay Street north (visual beyond the exit)
      K.box(-9, -0.05, 6.7, 15, 0.05, 6.4, 'bitumen', { shadow: false });
      K.box(10.2, -0.05, -14, 4.6, 0.05, 13, 'bitumen', { shadow: false });
      K.box(7.2, 0, -14, 1.5, 0.14, 13, 'footpath', { shadow: false });
      // the drop to the south: the road ends
      K.drop(-1.6, 9.9, 12.5, 12.2, { side: 'n', msg: 'The road ends here.' });
      K.examine(3.6, 1.2, 9.35, ['ROAD CLOSED — WORKS IN PROGRESS. [beat] There\'s nothing left to work on.', 'The road just stops. Like someone forgot the rest of it.'], { id: 'p4:drop', r: 1.6 });
      // the edges: the paling fence behind the footpath, the wire fence past the verge, scrub, fog
      // (the paling fence stops at the Relay Street footpath, then turns north along it)
      for (const [x, l] of [[0, 3.2], [3.2, 3.2], [5.6, 1.6]]) K.prop('fence', x, -1.6, 180, { variant: 'paling', len: l });
      for (const z of [-3.1, -6.1]) K.prop('fence', 6.3, z, -90, { variant: 'paling', len: 3 });
      K.box(2.4, 0, -0.68, 8.0, 0.02, 1.85, { tex: 'grass', color: '#6c745f' }, { shadow: false });
      K.dress('leaves', [-1.4, -1.4, 6.2, 0.1], 18, { seed: 41 });
      K.prop('shrub', 0.6, -0.8, 0, { w: 1.4, h: 1.2, collide: false }); K.prop('shrub', 5.8, -1.0, 0, { w: 1.1, h: 1.0, dead: true, collide: false });
      K.collider(-2, -7.8, 6.4, 0.25, { h: 3 });
      for (let z = -6; z < 10; z += 4) K.prop('fence', 14.35, z + 2, -90, { variant: 'wire', len: 4 });
      K.collider(14.35, -8, 15.4, 10, { h: 3 });
      K.blocker(-1.8, 0.2, -1.55, 3.5, 'Just bush that way.');
      K.prop('shrub', 13.8, -3.2, 0, { w: 1.6, h: 1.3 }); K.prop('shrub', 13.9, 8.6, 0, { w: 1.3, h: 1.1, dead: true });
      K.prop('gum_tree', 16.5, 2.5, 0, {}); K.prop('gum_tree_small', -1.5, -1.8, 0, {});
      K.prop('power_pole', 13.6, -6.8, 0, { span: 0 });
      bags.flush(K);

      // ---- the Route 44 shelter and the only working streetlight -----------------------------------------------------
      K.prop('bus_shelter', SH_.x, SH_.z, 0, { route: '44', stop: 'SIGNAL HILL' });
      K.prop('streetlight', 6.05, 0.5, 0, { bank: 1 });
      K.writing('IT\'LL BE FINE', SH_.x - 1.78, 1.25, SH_.z + 0.05, 0.9, { rotY: -90, world: 'fog' });
      // the timetable (Hard: with the depot footer) taped to the back glass, beside the route map
      K.doc(riddle === 'hard' ? 'timetable_hard' : 'timetable', SH_.x + 0.28, 1.47, SH_.z - 0.64, { id: 'p4_busshelter:timetable', model: 'paper', wall: true, rot: 0, r: 1.5 });
      K.sticker('sticker01', SH_.x + 1.08, 0.405, SH_.z - 0.3, 0, { pitch: -62 });
      K.examine(SH_.x - 1.5, 1.35, SH_.z + 0.25, ['Stay connected. [beat] It\'s our ad. Our old one.', 'Someone\'s written on it. "It\'ll be fine."'], { id: 'p4:ad', r: 1.2 });
      K.examine(SH_.x + 2.05, 2.2, SH_.z + 0.8, ['Route 44. Saturdays only.', 'The last bus home is at twenty to four.'], { id: 'p4:flag', r: 1.4 });
      K.examine(6.05, 1.3, 0.62, ['The only light that works on the whole road.', 'It buzzes. Like it\'s trying to say something.'], { id: 'p4:light', r: 1.2 });
      K.prop('bench', SH_.x + 3.6, 1.0, 0, { len: 1.5 });
      K.examine(SH_.x + 3.6, 0.6, 1.1, ['Someone\'s carved into the bench. A heart. Two initials. L and N.', 'Waiting for a bus that comes once a week.'], { id: 'p4:bench2', r: 1.1 });
      // ---- the east verge: the bin, the flattened boxes, the box cutter ---------------------------------------------
      K.prop('bin', 13.3, 6.35, -90, { variant: 'wheelie', lid: '#8f2a22', text: '44' });
      const CB = { tex: 'cardboard', color: '#b9a07a' };
      K.box(13.0, 0.06, 5.55, 1.1, 0.05, 0.75, CB, { rot: 12 });
      K.box(13.05, 0.11, 5.5, 0.9, 0.04, 0.62, CB, { rot: -9 });
      K.box(13.1, 0.15, 5.52, 0.78, 0.035, 0.55, CB, { rot: 5 });
      const lean = MB(); quad(lean, [13.45, 0.07, 5.2], [13.45, 0.07, 6.0], [13.62, 1.0, 6.0], [13.62, 1.0, 5.2], 1.5, [-1, 0.2, 0]);
      mesh(K, lean, CB);
      K.prop('box', 13.5, 4.3, 20, { w: 0.4, h: 0.3, d: 0.3, variant: 'returns', text: 'RETURNS', y: 0.06 });
      const cutterTaken = !!(S.taken && S.taken['p4_busshelter:cutter']);
      const cutter = cutterTaken ? null : K.prop('box_cutter', 13.0, 5.45, 28, { y: 0.19, name: 'p4_cutter' });
      let hCut = null;
      hCut = K.interact(13.0, 0.35, 5.45, async (G) => {
        if (S.taken['p4_busshelter:cutter']) return;
        await G.think('Someone\'s been breaking down boxes out here. Every store has one of these.');
        await Script.builtins.pickup(G, { id: 'p4_busshelter:cutter', item: 'box_cutter', obj: cutter });
        G.equip('box_cutter');
        if (hCut) hCut.remove();
        if (!S.done['p4:reveal']) await G.cutscene('P-4');
        else readyPrompt(G);
      }, { id: 'p4_busshelter:cutter', r: 1.35, when: () => !(S.taken && S.taken['p4_busshelter:cutter']) });
      K.examine(13.05, 0.4, 5.6, ['Accessory boxes. Screen guards, cases, chargers. All flattened.', 'Somebody did a whole delivery out here. Then just left.'], { id: 'p4:boxes', r: 1.3, when: () => !!(S.taken && S.taken['p4_busshelter:cutter']) });
      K.examine(13.3, 1.0, 6.5, ['The bin\'s full of packaging. Clamshells, twist ties, those little plastic windows.', 'All of it opened. All of it empty.'], { id: 'p4:bin', r: 1.2 });
      K.pickup('coffee', 12.8, 0.07, 7.6, { id: 'p4_busshelter:coffee', rot: 40 });
      K.pickup('coffee', SH_.x + 3.4, 0.47 + 0.14, 1.0, { id: 'p4_busshelter:coffee2', extraOnEasy: true });
      // a Plaza trolley on its side near the drop, a sign for Relay Street, the welcome sign
      K.prop('trolley', 9.6, 9.1, 100, {});
      K.examine(9.6, 0.6, 9.1, 'A trolley from the Plaza. It\'s come a long way downhill.', { id: 'p4:trolley', r: 1.3 });
      K.prop('sign_post', 7.6, -1.2, 45, { text: 'RELAY ST', text2: 'HILL RD', y: 0.14 });
      K.examine(7.5, 1.6, -1.1, ['Relay Street. [beat] The town\'s up there somewhere.', 'Her place is up there. Somewhere.'], { id: 'p4:relaysign', r: 1.2 });
      for (const pz of [8.45, 9.25]) K.cyl(0.6, 0, pz, 0.04, 1.6, { tex: 'metal', color: '#a4aba6' });
      K.sign('WELCOME TO\nSIGNAL HILL', 0.62, 1.95, 8.85, 1.7, 0.72, { rotY: -90, style: 'council', double: true });
      K.examine(0.9, 1.8, 8.85, ['Welcome to Signal Hill. [beat] Right.', 'Somebody\'s added a line underneath in texta. "Nobody can hear you."'], { id: 'p4:welcome', r: 1.4 });
      // a second, dead streetlight up Relay Street in the fog
      K.prop('streetlight', 7.25, -6.9, 90, { lit: false, y: 0.14 });
      // ---- Relay Street: the first time → the chapter card; afterwards an ordinary street exit ----------------------------
      K.trigger([6.4, -6.1, 12.6, -5.0], (G) => P0_toRelay(G), { id: 'p4_busshelter:relay', once: false, when: (s) => s.chapter === 0 });
      K.exit({ id: 'p4_busshelter:north', box: [6.4, -7.7, 12.6, -6.9], to: 'c1_relay', entry: 'south', when: (s) => s.chapter >= 1 });
      K.exit({ id: 'p4_busshelter:west', box: [-1.7, 3.5, -1.2, 9.9], to: 'p3_hillroad', entry: 'bottom' });
      // the shelter-front trigger: getting too close reveals it (without the box cutter)
      K.trigger([2.2, 1.9, 6.6, 3.6], (G) => G.cutscene('P-4'), { id: 'p4_busshelter:near', when: (s) => !(s.done && s.done['p4:reveal']) && !(s.spawns && s.spawns['p4_busshelter:teth']) });
    },
    async onEnter(G) {
      // the outcome lines (the engine already tracks F / A for cut free / stomp)
      const id = 'p4_busshelter:teth';
      if (S.spawns[id] || S.done['p4:outcome']) return;
      await G.until(() => !!S.spawns[id]);
      const how = S.spawns[id];
      S.done['p4:outcome'] = how;
      if (how === 'freed') {
        const e = G.enemy(id);
        // while the figure walks over to the shelter bench and sits (the engine takes it past the bench's low collider)
        await G.until(() => !e || e.removed || !e.data || !e.data.freeSeq, { timeout: 16 });
        await G.wait(0.5);
        await G.say('AIDAN', '...There. [beat] There you go.');
      } else {
        await G.wait(1.1);
        await G.say('AIDAN', 'It looked like— [beat] It wasn\'t a person. It wasn\'t.');
      }
    },
  });

  async function P0_toRelay(G) {
    if (S.chapter !== 0) return;
    // (the town note stays open: he hasn't got to her place yet — Chapter 1's chapter-select state agrees)
    await G.startChapter(1);
  }

  // =================================================================================================================
  // CUTSCENE P-1 "Rehearsal"
  // =================================================================================================================
  function seatAidan(G, x, z, y, seat) {
    const A = G.aidan;
    A.place(x, z, 90, { y });
    A.pose('sit', { seat, blend: 0 });
    if (A.raw) { A.raw.idleLife = false; A.raw.lookAt(null); A.raw.finishGestures && A.raw.finishGestures(); }
    return A;
  }
  function phoneShot(dist, fov, lift = 0.02) {
    const ph = Player.actor && Player.actor.held && Player.actor.held.R;
    if (!ph) return null;
    ph.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    ph.getWorldPosition(p); ph.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = p.clone().addScaledVector(n, dist).addScaledVector(up, lift);
    return { pos: [c.x, c.y, c.z], target: [p.x + up.x * 0.012, p.y + up.y * 0.012, p.z + up.z * 0.012], fov };
  }
  const setLight = (G, name, on) => { const l = G.light(name); if (l) l.on(on); };
  // holding the phone close to his chin to record (a custom carry pose; falls back to phone_look)
  function recPose(A) {
    if (!A.raw) return;
    try { const T = A.raw.D.T; A.raw.armPose('R', { w: [0.07, 0.1, T.chestD + 0.16], pole: [1, -1, -0.2], fing: [-0.35, 0.6, 0.75], palm: [-0.15, 0.5, -0.9], curl: 0.42, thumb: 0.45 }); }
    catch (e) { A.raw.armPose('R', 'phone_look'); }
  }
  defineCutscene('P-1', async (G) => {
    const ph = G.phone;
    G.hud(false);
    // ---- 1. static wide from the roadside, low: the hatchback on the shoulder, hazards ticking into the fog ------------
    await G.fade(1, 0);
    await G.goto('p2_lookout', 'car', { fade: false, sound: 'none' });
    G.ambient('none', 0);
    seatAidan(G, CARP.x + 0.05, CARP.z + 0.38, 0.03, 0.42);
    P0.hazard = true;
    { const car = G.obj('p2_car'); if (car && car.userData.setHazards) { car.userData.setHazards(true); car.userData.setHeadlights(true); } }
    setLight(G, 'p2:head', true);
    G.cam({ pos: SHOT1.pos, target: SHOT1.target, fov: SHOT1.fov });
    let hz = G.sfx('hazard', { loop: true, pos: [CARP.x, 0.8, CARP.z], vol: 0.9 });
    await G.fade(0, 1.6);
    await G.all([(async () => { await G.wait(0.6); await G.title('SIGNAL HILL', { fadeIn: 1.6, dur: 1.2, fadeOut: 1.6 }); })(), G.wait(4.4)]);

    // ---- 2. from the back seat, over his right shoulder, in dashboard glow: the voice memo ----------------------------
    await G.fade(1, 0);
    await G.goto('p1_car', 'seat', { fade: false, sound: 'none' });
    G.ambient('none', 0);
    const A = seatAidan(G, CAR.seatX, CAR.drvZ, 0.02, 0.42);
    recPose(A);
    if (A.raw) { A.raw.expr('tired'); A.raw.eyes('down'); A.raw.setPhoneLight(0.6); }
    setLight(G, 'p1:face', true);
    P0.hazard = true;
    setLight(G, 'p1:head', true);
    if (hz && hz.stop) hz.stop(0.05);
    hz = G.sfx('hazard', { loop: true, vol: 0.55 });
    if (ph) ph.display({ title: 'REC', blink: true, lines: ['NEW RECORDING', '0:02'], button: 'STOP', buttonColor: '#b8261c', bars: 'noservice' });
    G.cam({ pos: [-0.38, 1.38, 0.63], target: [0.4, 1.0, 0.43], fov: 42, to: { pos: [-0.3, 1.37, 0.61], target: [0.4, 1.01, 0.43], fov: 37 }, dur: 20 });
    await G.fade(0, 0.25);
    await G.wait(1.0);
    await G.say('AIDAN', 'Hi. Um. [beat] Hi, my name\'s Aidan, I\'m calling from— [beat] I served you. A few weeks ago. At the store.');
    await G.wait(0.5);
    // he stops the recording and deletes it
    G.sfx('click', { vol: 0.5 });
    if (ph) ph.display({ title: 'DELETE RECORDING?', lines: ['NEW RECORDING', '0:11'], button: 'DELETE', buttonColor: '#b8261c', bars: 'noservice' });
    await G.wait(1.1);
    G.sfx('click', { vol: 0.5 });
    if (ph) ph.display({ title: 'DELETED', lines: [], bars: 'noservice' });
    if (A.raw) A.raw.gesture('rub_neck', { hand: 'L' });
    await G.wait(1.6);
    // starts again
    G.sfx('beep', { vol: 0.3 });
    if (ph) ph.display({ title: 'REC', blink: true, lines: ['NEW RECORDING', '0:01'], button: 'STOP', buttonColor: '#b8261c', bars: 'noservice' });
    await G.wait(0.9);
    await G.say('AIDAN', 'Hi, it\'s Aidan, from the store. I just wanted to say I\'m really sorry about— [long beat]');
    // he stops; he doesn't delete this one
    G.sfx('click', { vol: 0.5 });
    if (ph) ph.display({ title: 'SAVED', lines: ['RECORDING 15', '0:09', '', 'RECORDING 14   0:04', 'RECORDING 13   0:06'], bars: 'noservice' });
    if (A.raw) A.raw.eyes('closed');
    await G.wait(1.8);

    // ---- 3. close on the passenger seat: the satchel, the modem box, the note. The Tomorrow motif, once ----------------
    G.cam({ pos: [0.12, 1.03, -0.63], target: [CAR.seatX + 0.05, CAR.cushion + 0.1, CAR.psgZ - 0.06], fov: 34, to: { pos: [0.1, 0.95, -0.6], target: [CAR.seatX + 0.07, CAR.cushion + 0.11, CAR.psgZ - 0.09], fov: 22 }, dur: 4.8 });
    G.music('tomorrow', { vol: 0.7 });
    await G.wait(4.4);

    // ---- 4. close on his face, lit blue by the screen (through the fogged windscreen) ----------------------------------
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('tired'); A.raw.setPhoneLight(0.18); }
    { const fl = G.light('p1:face'); if (fl && fl.set) fl.set({ color: '#4a74ff', intensity: 1.35 }); }
    G.bars('noservice');
    if (ph) ph.display({ title: '', lines: [], bars: 'noservice' });
    G.cam({ pos: [1.3, 1.34, 0.36], target: [-0.1, 1.17, 0.37], fov: 30, to: { pos: [1.26, 1.33, 0.36], target: [-0.1, 1.17, 0.37], fov: 25 }, dur: 10 });
    await G.wait(1.4);
    await G.say('AIDAN', 'It\'s fine. You\'re just going to fix it. [beat] Reset the modem. Check her alarm. Say sorry. Drive home.');
    await G.wait(0.6);

    // ---- 5. insert on the phone: NO SERVICE … one bar appears. It rings. ACCT 4471-0932 -------------------------------
    P0.insert = true;
    { const ip = G.pos('p1:insert'); if (ip) G.cam({ pos: [ip.x + 0.2, ip.y + 0.42, ip.z + 0.01], target: [ip.x - 0.004, ip.y, ip.z - 0.03], fov: 30, to: { pos: [ip.x + 0.17, ip.y + 0.36, ip.z + 0.01], target: [ip.x - 0.004, ip.y, ip.z - 0.03], fov: 30 }, dur: 7 }); }
    await G.wait(1.5);
    G.bars(1);
    if (ph) ph.display({ title: '', lines: [], bars: 1 });
    G.sfx('beep', { vol: 0.25 });
    await G.wait(1.2);
    const ring = G.sfx('ring', { loop: true, vol: 0.6 });
    if (ph) ph.display({ title: 'INCOMING CALL', blink: true, caller: 'ACCT 4471-0932', lines: [], button: 'ANSWER', buttonColor: '#2fbf5a', bars: 1 });
    await G.wait(3.4);
    // cut back to Aidan: he stares, then answers
    P0.insert = false;
    G.cam({ pos: [1.26, 1.33, 0.36], target: [-0.1, 1.17, 0.37], fov: 25 });
    if (A.raw) { A.raw.expr('wide'); A.raw.eyes('down'); }
    await G.wait(2.4);
    if (ring && ring.stop) ring.stop(0.05);
    G.sfx('click', { vol: 0.6 });
    if (A.raw) { A.raw.armPose('R', 'phone_ear'); A.raw.eyes('ahead'); A.raw.expr('scared'); }
    setLight(G, 'p1:face', false);
    if (ph) ph.display({ title: 'CONNECTED', caller: 'ACCT 4471-0932', lines: [], bars: 1 });
    G.sfx('static', { dur: 0.9, vol: 0.6, phone: true });
    G.bars({ n: 1, static: 0.55 });
    // in profile, through the passenger window: he stares ahead into the fog
    G.cam({ pos: [0.2, 1.3, -1.25], target: [-0.08, 1.18, 0.37], fov: 30, to: { pos: [0.16, 1.29, -1.15], fov: 26 }, dur: 16 });
    await G.wait(1.2);
    G.music('nan', { vol: 0.28 });
    await G.say('NAN (phone)', '...hello? Is that the young man? [static] ...it never connected, love. I kept pressing it. [long beat] I kept pressing it.');
    // the line drops to a flat disconnected tone
    G.stopMusic(0.6);
    G.bars('noservice');
    G.sfx('disconnected', { dur: 3.2, vol: 0.7 });
    if (ph) ph.display({ title: 'CALL ENDED', lines: [], bars: 'noservice' });
    await G.wait(1.2);
    await G.say('AIDAN', 'Hello? Hello— [beat] I\'m coming. I\'m going to fix it.');
    await G.wait(0.8);

    // ---- 6. the angle from shot 1: the hazards die, the headlights die, the engine ticks, the fog rolls in ---------------
    if (hz && hz.stop) hz.stop(0.05);
    await G.fade(1, 0);
    await G.goto('p2_lookout', 'car', { fade: false, sound: 'none' });
    G.ambient('none', 0);
    if (A.raw) { A.raw.armPose('R', 'phone_look'); A.raw.expr('tired'); }
    seatAidan(G, CARP.x + 0.05, CARP.z + 0.38, 0.03, 0.42);
    P0.hazard = true;
    { const car = G.obj('p2_car'); if (car && car.userData.setHazards) { car.userData.setHazards(true); car.userData.setHeadlights(true); } }
    setLight(G, 'p2:head', true);
    G.cam({ pos: SHOT1.pos, target: SHOT1.target, fov: SHOT1.fov });
    hz = G.sfx('hazard', { loop: true, pos: [CARP.x, 0.8, CARP.z], vol: 0.9 });
    await G.fade(0, 0.2);
    await G.wait(1.6);
    // the hazards die
    if (hz && hz.stop) hz.stop(0.02);
    P0.hazard = false;
    { const car = G.obj('p2_car'); if (car && car.userData.setHazards) car.userData.setHazards(false); }
    setLight(G, 'p2:hazard', false);
    await G.wait(0.9);
    // the headlights die
    { const car = G.obj('p2_car'); if (car && car.userData.setHeadlights) car.userData.setHeadlights(false); }
    setLight(G, 'p2:head', false);
    G.sfx('engine_tick', { dur: 7, pos: [CARP.x + 1.4, 0.6, CARP.z], vol: 0.9 });
    // the fog rolls across the road; three seconds of silence
    { const f = Render.fog, d0 = f ? f.density : 0.05; let k = 0;
      await G.loop((dt) => { k = Math.min(1, k + dt / 3.6); if (f) f.density = d0 + (0.07 - d0) * U.ease.inOut(k); return k >= 1; }); }
    await G.wait(0.4);
    await G.fade(1, 1.4);

    // ---- into gameplay (all state changes plain, so a skip lands here the same way) ----------------------------------
    G.set('p0_carDead', true);
    P0.hazard = false;
    { const car = G.obj('p2_car'); if (car && car.userData.setHazards) { car.userData.setHazards(false); car.userData.setHeadlights(false); } }
    setLight(G, 'p2:head', false); setLight(G, 'p2:hazard', false);
    if (hz && hz.stop) hz.stop(0.05);
    await G.goto('p2_lookout', 'car', { fade: false, sound: 'none' });          // rebuilt dead, behind the black
    if (Render.fog) Render.fog.density = 0.05;
    if (ph) ph.display(null);
    P0.insert = false;
    G.bars(null);
    const B = G.aidan;
    const e = (ROOMS.p2_lookout.entries || {}).car;
    B.place(e[0], e[1], e[2], { y: 0 });
    B.pose('idle', { blend: 0 });
    if (B.raw) { B.raw.armPose('R', 'phone'); B.raw.expr('neutral'); B.raw.eyes('ahead'); B.raw.idleLife = true; B.raw.setPhoneLight(0.28); }
    G.camRelease();
    try { Cam.snap(); } catch (err) { /* no camera */ }
    G.ambient('wind', 2);
    G.hud(true);
    await G.fade(0, 1.6);
  }, { letterbox: true, skippable: true });

  // P-4's low camera behind Aidan (the figure in the background): the ideal spot first, then swinging around him until
  // both he and the figure are in clear sight — never through the shelter's ad panel or glass, a fence, or the drop
  function P0_revealCam(a, ex, ez) {
    let dx = ex - a.x, dz = ez - a.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const side = d < 4.5 ? 0.95 : 0.55;
    const sight = { minH: 0.7, ignore: (c) => !!c.enemy };
    const ok = (x, z) => x > -1.2 && x < 14.1 && z > -7.2 && z < 9.0 && World.pointFree(x, z, 0.2)
      && World.los(x, z, ex, ez, sight) && World.los(x, z, a.x, a.z, sight);
    const ox = -dx, oz = -dz;                                            // behind him, then a little to his side
    for (const back of [1.7, 2.3, 1.3]) for (const deg of [0, 25, -25, 50, -50, 80, -80]) {
      const r = deg * D2R, c = Math.cos(r), sn = Math.sin(r);
      const px = ox * back + dz * side, pz = oz * back - dx * side;
      const x = a.x + px * c + pz * sn, z = a.z - px * sn + pz * c;
      if (ok(x, z)) return [x, z];
    }
    return [a.x + ox * 1.7 + dz * side, a.z + oz * 1.7 - dx * side];
  }

  // =================================================================================================================
  // IN-ENGINE P-4: the figure in the shelter turns. Bars climb to 2 with the EFTPOS beep; low behind Aidan.
  // =================================================================================================================
  defineCutscene('P-4', async (G) => {
    S.done['p4:reveal'] = true;
    const e = G.enemy('p4_busshelter:teth');
    const live = !!(e && !e.resolved && !e.removed);
    if (live) e.threat = true;
    G.bars({ climb: 2, from: 0, dur: 1.1, tell: 'eftpos' });
    if (live) {
      const ex = e.pos.x, ez = e.pos.z, ey = e.pos.y;
      const A = G.aidan;
      A.pose('idle');
      if (A.pos.x > 11.4) await A.walkTo(11.1, clamp(A.pos.z, 4.6, 6.2), { speed: 1.1 });
      await A.turn([ex, ez], 0.7);
      const a = A.pos;
      const [cx, cz] = P0_revealCam(a, ex, ez), d = Math.hypot(ex - a.x, ez - a.z);
      G.cam({ pos: [cx, a.y + 0.5, cz], target: [ex, ey + 1.0, ez], fov: Math.min(40, 14 + d * 2.4), to: { fov: Math.min(34, 11 + d * 2) }, dur: 5 });
      try { if (Player.setTorch) Player.setTorch(true); } catch (err) { /* no torch */ }
      if (!e.aware) {
        if (e.data) e.data.spoke = true;                 // this scene says its line itself
        e.alert();
        const from = e.yaw, want = Math.atan2(a.x - ex, a.z - ez), diff = U.angleDiff(from, want);
        let k = 0, offered = false;
        G.sfx('plastic', { pos: [ex, 1.2, ez], dur: 1.2, dens: 0.8 });
        await G.loop((dt) => {
          k = Math.min(1, k + dt / 1.2);
          e.yaw = from + diff * U.ease.inOut(k);
          if (k >= 0.5 && !offered && e.actor) { offered = true; e.actor.armPose('R', 'offer'); e.actor.lookAt(Player.actor); }
          return k >= 1;
        });
        e.yaw = from + diff;
        if (e.actor) { e.actor.armPose('R', 'offer'); e.actor.lookAt(Player.actor); }
      }
      G.sfx('plastic', { pos: [ex, 1.2, ez], dur: 0.8, dens: 1.1 });
      await G.wait(0.4);
      if (!G.skipping) {
        const src = typeof DIALOGUE !== 'undefined' ? DIALOGUE.tethered : null, l0 = Array.isArray(src) ? src[0] : src;
        const line = (typeof l0 === 'string' && l0) || (l0 && l0.text) || 'I only came in to...';
        try { Enemies.say(line, 'muffled', 2.8); } catch (err) { /* no voice */ }
        try { Snd.murmur('tethered', { pos: [ex, ey + 1.3, ez], vol: 0.9 }); } catch (err) { /* audio */ }
      }
      await G.wait(2.0);
      await G.say('AIDAN', 'What— what is that?');
      await G.wait(0.3);
    }
    G.bars(null);
    G.camRelease();
    if (G.has('box_cutter')) readyPrompt(G);
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // Chapter 0: P-1, then the Lookout. The three prompts, once, lower left.
  // =================================================================================================================
  defineChapter({
    n: 0, id: 'prologue', title: 'NO SERVICE', card: null,
    start: { room: 'p1_car', entry: 'seat' },
    debugState() { /* a fresh start: nothing carried yet */ },
    async begin(G) {
      await G.cutscene('P-1');
      await G.wait(0.9);
      G.prompt(isPad() ? 'Left stick: move' : 'WASD: move', { id: 'p0_move' });
      await G.wait(1.3);
      G.prompt('{torch}: phone torch', { id: 'p0_torch' });
      await G.wait(1.3);
      G.prompt('{interact}: examine', { id: 'p0_examine' });
      G.note('Get to her place. Reset the modem. Check her alarm. Say sorry.', { id: 'p0_town' });
    },
  });
}
