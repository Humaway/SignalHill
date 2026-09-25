// ==== data/00_items.js — every ITEMS entry (CONTENT_PLAN §3; spec §2A Items screen, §4 weapons / healing) ====
// Names are as the items screen shows them; `desc` is Aidan's one-line italic description; `details` are the close-up
// reveals of the Examine view (each shows while its model-local `face` direction points at the viewer). model() builds
// a small, detailed Object3D from primitives + Canvas2D textures, in metres, origin on the floor at its centre, the
// printed side of flat things facing +Y. Models are shown rotating on the items screen under one key light and are
// merged into world pickups, so every geometry / material / texture here is cached and flagged userData.shared (Menus
// and room unloads never dispose them). Heal items are handled by Script.builtins.useItem / Menus (heal values here);
// weapons equip; map items open their map. Chapters attach story behaviour themselves (e.g. ITEMS.alarm_pendant.use).
//
// Riddle level (spec §2A): the certificate's model and its examine detail follow S.difficulty.riddle (Easy / Normal
// "completed 14/03/2026", Hard "the fourteenth of March") — `details` is a getter, read by Menus every frame.
// Map ids: `map` is a getter that resolves the MAPS id defined by data/21_maps.js ('plaza' …, and the receipt maps by
// MAPS[id].kind === 'receipt' && of === '<paper map id>'), falling back to the plain names.
{
  const TAU = Math.PI * 2;
  const R = (d) => (d * Math.PI) / 180;
  const F = Tex.fonts, BR = Tex.brand;
  const lvl = () => (S.difficulty && S.difficulty.riddle) || 'normal';

  // ---------------------------------------------------------------------------------------------------------------
  // Caches (shared: never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const GEO = new Map(), MAT = new Map(), TEX = new Map();
  const q = (v) => Math.round(v * 100000) / 100000;
  const cg = (key, fn) => {
    let g = GEO.get(key);
    if (!g) { g = fn(); g.userData.shared = true; if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingSphere(); GEO.set(key, g); }
    return g;
  };
  const gBox = (w, h, d) => cg(`b${q(w)},${q(h)},${q(d)}`, () => new THREE.BoxGeometry(w, h, d));
  const gCyl = (rt, rb, h, seg = 20, open = false, t0 = 0, tl = TAU) => cg(`c${q(rt)},${q(rb)},${q(h)},${seg},${open ? 1 : 0},${q(t0)},${q(tl)}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl));
  const gSph = (r, ws = 18, hs = 12, t0 = 0, tl = Math.PI) => cg(`s${q(r)},${ws},${hs},${q(t0)},${q(tl)}`, () => new THREE.SphereGeometry(r, ws, hs, 0, TAU, t0, tl));
  const gTor = (r, t, rs = 8, ts = 28, arc = TAU) => cg(`t${q(r)},${q(t)},${rs},${ts},${q(arc)}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
  const gPlane = (w, h) => cg(`p${q(w)},${q(h)}`, () => new THREE.PlaneGeometry(w, h));
  const gCircle = (r, seg = 28) => cg(`o${q(r)},${seg}`, () => new THREE.CircleGeometry(r, seg));
  const gLathe = (key, pts, seg = 28) => cg('l' + key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
  const gTube = (key, pts, r, seg = 48, rs = 6, closed = false) => cg('u' + key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', 0.5), seg, r, rs, closed));
  // extruded 2D shape (XY) through depth along Z, centred; flat:true lays it down (thickness along Y, shape Y → −Z);
  // uv:true gives the caps 0..1 UVs over the shape's bounds
  const gExt = (key, shapeFn, depth, o = {}) => cg('x' + key, () => {
    const bev = o.bevel || 0;
    const g = new THREE.ExtrudeGeometry(shapeFn(), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: o.bevelSize ?? bev, bevelSegments: o.bs || 2, curveSegments: o.curve || 10 });
    g.translate(0, 0, -depth / 2);
    if (o.uv) {
      g.computeBoundingBox();
      const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x || 1), (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1));
    }
    if (o.flat) g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
  // a height-field sheet over the XZ rectangle (normals up); fy(x, z, u, v) → y; o.warp(x,z,u,v,i,j) → [x,z]; o.uv
  const gGrid = (key, x0, z0, x1, z1, nx, nz, fy, o = {}) => cg('g' + key, () => {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz;
      let x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
      if (o.warp) { const w = o.warp(x, z, u, v, i, j); if (w) { x = w[0]; z = w[1]; } }
      pos.push(x, fy(x, z, u, v), z);
      const t = o.uv ? o.uv(x, z, u, v) : [u, 1 - v];
      uv.push(t[0], t[1]);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  });
  // a ribbon along a centreline in the XY plane (pts [[x,y]…]), width along Z; uv u across, v along
  const gRibbon = (key, pts, width) => cg('r' + key, () => {
    const pos = [], uv = [], idx = [];
    let L = 0; const acc = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    pts.forEach((p, i) => { pos.push(p[0], p[1], -width / 2, p[0], p[1], width / 2); const v = 1 - acc[i] / L; uv.push(0, v, 1, v); });
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  });
  const rrect = (w, h, r) => () => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  // a flat rounded slab (thickness along Y, centred)
  const gSlab = (w, d, t, r, bev = 0) => gExt(`slab${q(w)},${q(d)},${q(t)},${q(r)},${q(bev)}`, rrect(w - 2 * bev, d - 2 * bev, Math.max(0.0001, r - bev)), Math.max(0.0001, t - 2 * bev), { bevel: bev, flat: true, uv: true });

  const mat = (key, o = {}) => {
    let m = MAT.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
      m.name = 'itm:' + key; m.userData.shared = true; MAT.set(key, m);
    }
    return m;
  };
  const ctex = (key, w, h, draw, o = {}) => {
    let t = TEX.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    try { draw(x, w, h, U.rng(U.hash(key))); } catch (e) { console.error('[items] texture ' + key, e); }
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; TEX.set(key, t);
    return t;
  };
  const tmat = (key, w, h, draw, o = {}) => mat('t:' + key, { map: ctex(key, w, h, draw, o), roughness: o.roughness ?? 0.72, metalness: o.metalness ?? 0, alphaTest: o.alphaTest || 0, side: o.side || THREE.FrontSide, ...(o.extra || {}) });

  const add = (p, geo, m, x = 0, y = 0, z = 0, o = {}) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) me.rotation.set(R(o.rx || 0), R(o.ry || 0), R(o.rz || 0), o.ord || 'XYZ');
    if (o.s != null) { if (Array.isArray(o.s)) me.scale.set(o.s[0], o.s[1], o.s[2]); else me.scale.setScalar(o.s); }
    me.castShadow = o.cast !== false; me.receiveShadow = true;
    p.add(me);
    return me;
  };
  const grp = (p, x = 0, y = 0, z = 0, o = {}) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) g.rotation.set(R(o.rx || 0), R(o.ry || 0), R(o.rz || 0), o.ord || 'XYZ');
    if (o.s != null) g.scale.setScalar(o.s);
    if (p) p.add(g);
    return g;
  };
  // a printed face lying on top of something (faces +Y) / underneath (faces −Y) / on a +Z face
  const decalUp = (p, w, d, m, x, y, z, rot = 0) => add(p, gPlane(w, d), m, x, y, z, { rx: -90, rz: rot, cast: false });
  const decalDown = (p, w, d, m, x, y, z, rot = 0) => add(p, gPlane(w, d), m, x, y, z, { rx: 90, rz: rot, cast: false });

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas helpers
  // ---------------------------------------------------------------------------------------------------------------
  const T = (x, s, X, Y, o = {}) => Tex.util.text(x, s, X, Y, o);
  const HW = (x, s, X, Y, o = {}) => Tex.handwriting(x, s, X, Y, { font: F.hand, ...o });
  // ageing: a few shared grime overlays (Tex.util.age run once on a white 256² sheet), multiplied over each canvas —
  // far cheaper than ageing every label at full resolution
  const GRIME = new Map();
  const grime = (amt, v) => {
    const k = Math.round(amt * 4) + ':' + v;
    let c = GRIME.get(k);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
      try { Tex.util.age(x, 256, 256, U.rng(977 + v * 131 + Math.round(amt * 40)), Math.max(0.1, Math.round(amt * 4) / 4)); } catch (e) { /* helper missing */ }
      GRIME.set(k, c);
    }
    return c;
  };
  const age = (x, w, h, r, a = 0.5, o = {}) => {
    if (a <= 0) return;
    if (o.sun) { x.fillStyle = `rgba(214,218,212,${o.sun})`; x.fillRect(0, 0, w, h); }
    x.save(); x.globalCompositeOperation = 'multiply';
    const v = Math.floor(r() * 3), fx = r() < 0.5, fy = r() < 0.5;
    x.translate(fx ? w : 0, fy ? h : 0); x.scale(fx ? -1 : 1, fy ? -1 : 1);
    x.drawImage(grime(Math.min(1.5, a), v), 0, 0, w, h);
    x.restore();
  };
  const fitSize = (x, s, maxW, size, font, weight = '') => {
    let sz = size;
    for (let k = 0; k < 60; k++) { x.font = `${weight} ${sz}px ${font}`.trim(); if (x.measureText(s).width <= maxW || sz <= 6) break; sz -= 1; }
    return sz;
  };
  const TF = (x, s, X, Y, maxW, size, o = {}) => T(x, s, X, Y, { ...o, size: fitSize(x, s, maxW, size, o.font || F.sans, o.weight || '') });
  const speck = (x, w, h, r, n, col, a = 0.2, sz = 1.5) => { x.fillStyle = col; for (let i = 0; i < n; i++) { x.globalAlpha = a * (0.3 + r()); x.fillRect(r() * w, r() * h, sz * (0.5 + r()), sz * (0.5 + r())); } x.globalAlpha = 1; };
  const scratches = (x, w, h, r, n, col, a = 0.25, len = 30) => {
    x.strokeStyle = col; x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      x.globalAlpha = a * (0.3 + r() * 0.7); x.lineWidth = 0.5 + r() * 1.2;
      const sx = r() * w, sy = r() * h, an = (r() - 0.5) * 0.6 + (r() < 0.5 ? 0 : Math.PI / 2) * 0.2, L = len * (0.3 + r());
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(an) * L, sy + Math.sin(an) * L); x.stroke();
    }
    x.globalAlpha = 1;
  };
  const rrPath = (x, X, Y, W, H, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); };
  const barcode = (x, X, Y, W, H, r, col = '#1a1a1a') => { x.fillStyle = col; let cx = X; while (cx < X + W - 2) { const bw = 1 + Math.floor(r() * 3); if (r() < 0.62) x.fillRect(cx, Y, bw, H); cx += bw + 1; } };
  const tick = (x, X, Y, s, col = '#1f2c6e', lw = 2) => { x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + s * 0.35, Y + s * 0.4); x.lineTo(X + s, Y - s * 0.55); x.stroke(); };
  const paper = (x, w, h, r, col = '#f2efe6', amt = 0.35) => { x.fillStyle = col; x.fillRect(0, 0, w, h); speck(x, w, h, r, Math.round(w * h / 900), '#6b6150', 0.1, 1.2); age(x, w, h, r, amt); };
  const plastic = (x, w, h, r, col, amt = 0.25) => { x.fillStyle = col; x.fillRect(0, 0, w, h); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); x.fillStyle = g; x.fillRect(0, 0, w, h); scratches(x, w, h, r, 12, '#ffffff', 0.12, w * 0.1); age(x, w, h, r, amt); };
  const wood = (x, w, h, r, c0 = '#9a6f43', c1 = '#6b4527') => {
    x.fillStyle = c0; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { x.strokeStyle = r() < 0.5 ? c1 : '#b88a58'; x.globalAlpha = 0.15 + r() * 0.3; x.lineWidth = 0.6 + r() * 2.2; const y0 = r() * h; x.beginPath(); x.moveTo(0, y0); for (let xx = 0; xx <= w; xx += w / 8) x.lineTo(xx, y0 + Math.sin(xx * 0.05 + i) * (2 + r() * 4)); x.stroke(); }
    x.globalAlpha = 1;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Shared materials
  // ---------------------------------------------------------------------------------------------------------------
  const M = {
    brass: () => mat('brass', { color: '#c9a44c', metalness: 0.55, roughness: 0.3 }),
    nickel: () => mat('nickel', { color: '#c3c7c8', metalness: 0.55, roughness: 0.28 }),
    steel: () => mat('steel', { color: '#a3a9ab', metalness: 0.5, roughness: 0.3 }),
    steelDk: () => mat('steelDk', { color: '#50585a', metalness: 0.45, roughness: 0.45 }),
    chrome: () => mat('chrome', { color: '#d7dadb', metalness: 0.6, roughness: 0.18 }),
    black: () => mat('black', { color: '#1b1d1e', roughness: 0.55 }),
    rubber: () => mat('rubber', { color: '#151617', roughness: 0.9 }),
    white: () => mat('white', { color: '#e9e7df', roughness: 0.45 }),
    cream: () => mat('cream', { color: '#ece8da', roughness: 0.5 }),
    greyPl: () => mat('greyPl', { color: '#8f9597', roughness: 0.45 }),
    paperEdge: () => mat('paperEdge', { color: '#e6e1d3', roughness: 0.9 }),
    clear: () => mat('clear', { color: '#e8f2f2', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    gold: () => mat('gold', { color: '#d9ae43', metalness: 0.55, roughness: 0.26 }),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Keys (flat, lying down): a key outline with bitting, a bow and a hole
  // ---------------------------------------------------------------------------------------------------------------
  const keyShape = (o) => () => {
    const L = o.len, bh = o.blade, bowR = o.bowR, cx = -bowR - 0.004;
    const s = new THREE.Shape();
    s.moveTo(-0.003, -bh / 2);
    s.lineTo(L - 0.004, -bh / 2); s.lineTo(L, -bh / 2 + 0.003); s.lineTo(L, bh / 2 - 0.0015);
    const cuts = o.cuts, n = cuts.length, step = (L - 0.006) / n;
    for (let i = 0; i < n; i++) { const x0 = L - 0.004 - i * step; s.lineTo(x0 - step * 0.35, bh / 2 - cuts[i]); s.lineTo(x0 - step * 0.7, bh / 2); }
    s.lineTo(-0.003, bh / 2); s.lineTo(-0.005, bh / 2 + 0.0025);
    if (o.square) { s.lineTo(-0.005, bowR); s.lineTo(cx * 2 + 0.005, bowR); s.quadraticCurveTo(cx * 2 - 0.001, bowR, cx * 2 - 0.001, bowR - 0.006); s.lineTo(cx * 2 - 0.001, -bowR + 0.006); s.quadraticCurveTo(cx * 2 - 0.001, -bowR, cx * 2 + 0.005, -bowR); s.lineTo(-0.005, -bowR); }
    else { const a = Math.asin(Math.min(0.95, (bh / 2 + 0.0025) / bowR)); s.lineTo(cx + Math.cos(a) * bowR, Math.sin(a) * bowR); s.absarc(cx, 0, bowR, a, TAU - a, false); }
    s.lineTo(-0.005, -bh / 2 - 0.0025);
    s.lineTo(-0.003, -bh / 2);
    const hole = new THREE.Path(); hole.absarc(o.square ? cx * 2 + 0.006 : cx - bowR * 0.45, 0, o.holeR, 0, TAU, true); s.holes.push(hole);
    return s;
  };
  // returns the key's group and the hole position (for the ring)
  function key(p, id, o, m) {
    const g = grp(p, 0, 0.0014, 0);
    add(g, gExt('key:' + id, keyShape(o), 0.0018, { bevel: 0.00035, flat: true }), m);
    add(g, gBox(o.len * 0.72, 0.0003, 0.0012), mat('keyway', { color: '#6a5a2c', metalness: 0.4, roughness: 0.5 }), o.len * 0.42, 0.0012, 0.0005, { cast: false });
    const cx = -o.bowR - 0.004;
    return { g, hole: [o.square ? cx * 2 + 0.006 : cx - o.bowR * 0.45, 0] };
  }
  const ringAt = (p, x, z, r, t = 0.0011, tilt = 8) => add(p, gTor(r, t, 6, 32), M.steel(), x, 0.0024, z, { rx: 90 - tilt });

  // =================================================================================================================
  // MODELS
  // =================================================================================================================
  const MODELS = {};

  // ---- BREAK-ROOM COFFEE: a paper cup, sleeve, sip lid, a stirrer; a name on it crossed out --------------------------
  MODELS.coffee = () => {
    const g = new THREE.Group(); g.name = 'item:coffee';
    const cup = tmat('coffee_cup', 512, 256, (x, w, h, r) => {
      x.fillStyle = '#f2f0e8'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1d8c89'; x.fillRect(0, h * 0.035, w, h * 0.05);
      x.fillStyle = '#e9c21c'; x.fillRect(0, h * 0.09, w, h * 0.015);
      for (const cx of [0.3, 0.7]) {
        T(x, 'HAVE A GOOD BREAK', w * cx, h * 0.84, { size: 17, font: F.sans, weight: 'bold', color: '#1d8c89', align: 'center', spacing: 2 });
        x.strokeStyle = '#1d8c89'; x.lineWidth = 3; x.globalAlpha = 0.8;
        for (let k = 0; k < 3; k++) { x.beginPath(); const sx = w * cx - 18 + k * 18; x.moveTo(sx, h * 0.62); x.bezierCurveTo(sx - 10, h * 0.55, sx + 10, h * 0.5, sx, h * 0.42); x.stroke(); }
        x.globalAlpha = 1;
      }
      // someone's name in marker, crossed out
      HW(x, 'SHAZ', w * 0.86, h * 0.225, { size: 30, color: '#171717', font: F.marker, weight: 'bold' });
      x.strokeStyle = '#171717'; x.lineWidth = 4; x.beginPath(); x.moveTo(w * 0.85, h * 0.18); x.lineTo(w * 0.99, h * 0.16); x.stroke();
      // a dribble down from the rim
      x.fillStyle = 'rgba(96,58,26,0.45)'; x.fillRect(w * 0.12, h * 0.16, 5, h * 0.22); x.beginPath(); x.arc(w * 0.12 + 2.5, h * 0.38, 4.5, 0, TAU); x.fill();
      age(x, w, h, r, 0.35);
    }, { roughness: 0.75 });
    add(g, gCyl(0.043, 0.03, 0.108, 32, true), mat('t:coffee_cup'), 0, 0.054, 0);
    add(g, gCircle(0.03, 24), M.white(), 0, 0.001, 0, { rx: 90 });
    add(g, gTor(0.0432, 0.0022, 6, 36), M.white(), 0, 0.108, 0, { rx: 90 });
    const sleeve = tmat('coffee_sleeve', 256, 64, (x, w, h, r) => {
      x.fillStyle = '#a97f52'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 4) { x.fillStyle = i % 8 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; x.fillRect(i, 0, 2, h); }
      x.strokeStyle = 'rgba(60,34,16,0.6)'; x.lineWidth = 2; x.beginPath(); x.arc(w * 0.5, h * 0.5, h * 0.3, 0, TAU); x.stroke();
      T(x, 'HOT', w * 0.5, h * 0.58, { size: 11, font: F.sans, weight: 'bold', color: 'rgba(60,34,16,0.7)', align: 'center' });
      age(x, w, h, r, 0.3);
    }, { roughness: 0.9 });
    add(g, gCyl(0.0413, 0.0358, 0.046, 32, true), mat('t:coffee_sleeve'), 0, 0.058, 0, { ry: 40 });
    // sip lid
    const lid = mat('coffee_lid', { color: '#eceae3', roughness: 0.35, side: THREE.DoubleSide });
    add(g, gLathe('coffeelid', [[0, 0.1195], [0.026, 0.1195], [0.03, 0.1205], [0.0355, 0.1235], [0.04, 0.1235], [0.0455, 0.1175], [0.046, 0.1105], [0.0435, 0.1075]], 32), lid);
    add(g, gBox(0.013, 0.0025, 0.004), M.black(), 0, 0.1235, 0.0345, { cast: false });
    // a wooden stirrer through the sip hole
    add(g, gBox(0.005, 0.1, 0.0014), mat('stirrer', { color: '#cfae7c', roughness: 0.8 }), 0.003, 0.145, 0.029, { rz: -10, rx: -8 });
    return g;
  };

  // ---- ENERGY DRINK: a 250 mL can -----------------------------------------------------------------------------------
  MODELS.energy_drink = () => {
    const g = new THREE.Group(); g.name = 'item:energy_drink';
    const label = tmat('ecan', 512, 256, (x, w, h, r) => {
      x.fillStyle = '#0f1213'; x.fillRect(0, 0, w, h);
      const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.06)'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      // a jagged lightning slash, twice round the can
      for (const ox of [0, w / 2]) {
        x.fillStyle = '#86e83a';
        x.beginPath(); x.moveTo(ox + w * 0.06, h * 0.95); x.lineTo(ox + w * 0.16, h * 0.45); x.lineTo(ox + w * 0.12, h * 0.47); x.lineTo(ox + w * 0.22, h * 0.05); x.lineTo(ox + w * 0.18, h * 0.5); x.lineTo(ox + w * 0.22, h * 0.48); x.closePath(); x.fill();
        x.save(); x.translate(ox + w * 0.36, h * 0.56); x.rotate(-0.08);
        x.font = `900 ${h * 0.34}px ${F.heavy}`; x.textAlign = 'center';
        x.lineWidth = 6; x.strokeStyle = '#0b2b09'; x.strokeText('SURGE', 0, 0); x.fillStyle = '#9af04a'; x.fillText('SURGE', 0, 0);
        x.restore();
        T(x, 'ENERGY  ·  250mL', ox + w * 0.36, h * 0.74, { size: 16, font: F.sans, weight: 'bold', color: '#e8ece6', align: 'center', spacing: 2 });
        T(x, 'NO SLEEP. NO LIMITS.', ox + w * 0.36, h * 0.86, { size: 11, font: F.sans, color: '#9aa39c', align: 'center', spacing: 2 });
      }
      x.fillStyle = '#e9ece8'; x.fillRect(w * 0.9, h * 0.3, w * 0.07, h * 0.4); barcode(x, w * 0.905, h * 0.33, w * 0.06, h * 0.3, r);
      scratches(x, w, h, r, 30, '#d8dcd8', 0.25, 20);
    }, { roughness: 0.32, metalness: 0.35 });
    const alu = mat('alu', { color: '#c9cdcf', metalness: 0.55, roughness: 0.3 });
    add(g, gCyl(0.033, 0.026, 0.012, 28), alu, 0, 0.006, 0);
    add(g, gCyl(0.033, 0.033, 0.106, 28, true), label, 0, 0.065, 0, { ry: 20 });
    add(g, gCyl(0.028, 0.033, 0.012, 28, true), alu, 0, 0.124, 0);
    add(g, gCircle(0.0275, 28), mat('alu_top', { color: '#b8bcbe', metalness: 0.55, roughness: 0.35 }), 0, 0.1285, 0, { rx: -90 });
    add(g, gTor(0.0283, 0.0017, 6, 32), alu, 0, 0.1297, 0, { rx: 90 });
    // pull tab
    add(g, gSlab(0.02, 0.011, 0.0008, 0.004), alu, 0.004, 0.1302, 0.004, { ry: 20 });
    add(g, gCyl(0.0022, 0.0022, 0.0012, 10), M.steelDk(), -0.001, 0.1305, 0.002);
    return g;
  };

  // ---- FIRST AID KIT: the store's green hard case --------------------------------------------------------------------
  MODELS.first_aid = () => {
    const g = new THREE.Group(); g.name = 'item:first_aid';
    const green = mat('aid_green', { color: '#2a8a4c', roughness: 0.42 });
    add(g, gSlab(0.26, 0.18, 0.052, 0.022, 0.005), green, 0, 0.026, 0);
    add(g, gSlab(0.262, 0.182, 0.006, 0.022, 0.001), mat('aid_seam', { color: '#1c5f34', roughness: 0.5 }), 0, 0.054, 0);
    add(g, gSlab(0.258, 0.178, 0.026, 0.022, 0.005), green, 0, 0.069, 0);
    const top = tmat('aid_top', 512, 352, (x, w, h, r) => {
      x.fillStyle = '#2a8a4c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f3f2ec'; rrPath(x, w * 0.04, h * 0.06, w * 0.92, h * 0.88, 22); x.fill();
      x.fillStyle = '#2a8a4c'; const cx = w * 0.3, cy = h * 0.5, s = h * 0.5;
      x.fillRect(cx - s * 0.17, cy - s * 0.5, s * 0.34, s); x.fillRect(cx - s * 0.5, cy - s * 0.17, s, s * 0.34);
      T(x, 'FIRST AID', w * 0.72, h * 0.34, { size: 46, font: F.heavy, weight: '900', color: '#1f6b3c', align: 'center' });
      T(x, 'STORE 0412', w * 0.72, h * 0.43, { size: 18, font: F.sans, weight: 'bold', color: '#444', align: 'center', spacing: 3 });
      // the monthly check sticker: two ticks, then nobody
      x.fillStyle = '#fbf6d8'; x.fillRect(w * 0.53, h * 0.52, w * 0.38, h * 0.36); x.strokeStyle = '#9a9070'; x.lineWidth = 1.5; x.strokeRect(w * 0.53, h * 0.52, w * 0.38, h * 0.36);
      T(x, 'KIT CHECKED', w * 0.72, h * 0.59, { size: 15, font: F.sans, weight: 'bold', color: '#555', align: 'center', spacing: 2 });
      ['MAR', 'APR', 'MAY', 'JUN'].forEach((mo, i) => {
        const yy = h * (0.66 + i * 0.055);
        T(x, mo, w * 0.56, yy, { size: 14, font: F.mono, color: '#555' });
        x.fillStyle = '#bbb'; x.fillRect(w * 0.63, yy + 2, w * 0.25, 1);
        if (i < 2) { tick(x, w * 0.66, yy - 4, 14); HW(x, 'AL', w * 0.72, yy, { size: 15, color: '#1f2c6e' }); }
      });
      age(x, w, h, r, 0.4);
    }, { roughness: 0.5 });
    decalUp(g, 0.236, 0.158, top, 0, 0.0825, 0);
    // carry handle folded flat along the front edge, and two latches
    add(g, gTube('aidhandle', [[-0.06, 0.06, 0.088], [-0.055, 0.058, 0.108], [0, 0.057, 0.112], [0.055, 0.058, 0.108], [0.06, 0.06, 0.088]], 0.0055, 24, 8), mat('aid_handle', { color: '#dfe1dc', roughness: 0.5 }));
    for (const sx of [-1, 1]) add(g, gBox(0.026, 0.024, 0.008), M.greyPl(), sx * 0.085, 0.052, 0.09);
    return g;
  };

  // ---- BOX CUTTER: yellow body, black grips, slider, a snap-off blade with three segments left ------------------------
  MODELS.box_cutter = () => {
    const g = new THREE.Group(); g.name = 'item:box_cutter';
    const body = () => {
      const s = new THREE.Shape();
      s.moveTo(-0.074, -0.011); s.lineTo(0.044, -0.011); s.quadraticCurveTo(0.058, -0.009, 0.062, -0.004);
      s.lineTo(0.062, 0.004); s.lineTo(0.05, 0.0105); s.lineTo(-0.068, 0.0125); s.quadraticCurveTo(-0.076, 0.012, -0.076, 0.004); s.lineTo(-0.076, -0.006); s.quadraticCurveTo(-0.076, -0.011, -0.074, -0.011);
      return s;
    };
    const y0 = 0.011;
    add(g, gExt('cutterbody', body, 0.017, { bevel: 0.002, flat: true }), mat('cutter_yellow', { color: '#e3b514', roughness: 0.42 }), 0, y0, 0);
    const grip = tmat('cutter_grip', 256, 64, (x, w, h) => {
      x.fillStyle = '#1c1e1f'; x.fillRect(0, 0, w, h);
      for (let i = 6; i < w - 4; i += 9) { x.fillStyle = '#34383a'; x.fillRect(i, 6, 4, h - 12); }
    }, { roughness: 0.9 });
    decalUp(g, 0.075, 0.0145, grip, -0.028, y0 + 0.0106, -0.0005);
    decalDown(g, 0.075, 0.0145, grip, -0.028, y0 - 0.0106, -0.0005);
    // slider track and thumb slider on the top edge
    add(g, gBox(0.07, 0.008, 0.0015), mat('cutter_slot', { color: '#6d5a12', roughness: 0.6 }), -0.012, y0, -0.0118, { cast: false });
    const sl = grp(g, 0.012, y0, -0.0135);
    add(sl, gBox(0.017, 0.012, 0.004), M.black());
    for (let i = 0; i < 4; i++) add(sl, gBox(0.0015, 0.0125, 0.0012), mat('cutter_ridge', { color: '#383c3e' }), -0.006 + i * 0.004, 0, -0.0024, { cast: false });
    // blade: three segments, score lines, angled tip
    const blade = tmat('cutter_blade', 256, 64, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#dfe3e5'); gr.addColorStop(0.5, '#b9bec1'); gr.addColorStop(1, '#8e9496'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(40,44,46,0.8)'; x.lineWidth = 2;
      for (let i = 1; i < 4; i++) { const xx = w * (i / 3.6); x.beginPath(); x.moveTo(xx - 12, h); x.lineTo(xx + 12, 0); x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, h * 0.08, w, 3);
    }, { roughness: 0.22, metalness: 0.5 });
    const bladeShape = () => { const s = new THREE.Shape(); s.moveTo(0.054, -0.0045); s.lineTo(0.092, -0.0045); s.lineTo(0.104, 0.0045); s.lineTo(0.054, 0.0045); s.closePath(); return s; };
    add(g, gExt('cutterblade', bladeShape, 0.0006, { flat: true, uv: true }), blade, 0, y0, 0);
    // metal end cap with the blade-snapper slot
    add(g, gBox(0.008, 0.019, 0.02), M.chrome(), -0.073, y0, 0.0005);
    add(g, gBox(0.0085, 0.0025, 0.012), M.black(), -0.073, y0 + 0.0086, 0.0005, { cast: false });
    return g;
  };

  // ---- STEEL SECURITY BAR: square steel off a demo table, the mounting foot at one end, snapped at the other ---------
  MODELS.steel_bar = () => {
    const g = new THREE.Group(); g.name = 'item:steel_bar';
    const paint = tmat('bar_paint', 1024, 64, (x, w, h, r) => {
      x.fillStyle = '#4b5254'; x.fillRect(0, 0, w, h);
      speck(x, w, h, r, 900, '#2e3436', 0.25, 2);
      scratches(x, w, h, r, 120, '#b9c0c2', 0.5, 40);
      scratches(x, w, h, r, 40, '#1f2324', 0.4, 60);
      for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(140,90,50,0.25)'; x.fillRect(r() * w, 0, 6 + r() * 20, h); }
    }, { roughness: 0.55, metalness: 0.35 });
    const L = 0.84, s = 0.028, yc = 0.006 + s / 2;
    add(g, gBox(L, s, s), paint, 0, yc, 0);
    // mounting foot: a plate with two bolts, a torn bracket tab
    const plate = mat('bar_plate', { color: '#6b7274', metalness: 0.45, roughness: 0.4 });
    add(g, gBox(0.08, 0.006, 0.07), plate, -L / 2 + 0.03, 0.003, 0);
    for (const sz of [-1, 1]) { add(g, gCyl(0.0065, 0.0065, 0.004, 6), M.steel(), -L / 2 + 0.012, 0.008, sz * 0.024); add(g, gCyl(0.0065, 0.0065, 0.004, 6), M.steel(), -L / 2 + 0.05, 0.008, sz * 0.024); }
    add(g, gBox(0.006, 0.03, 0.05), plate, -L / 2 - 0.006, 0.02, 0, { rz: 12 });
    // the D-ring the demo phones' cables clipped to
    add(g, gTor(0.012, 0.0022, 6, 20, Math.PI), M.steel(), -L / 2 + 0.11, yc + s / 2, 0, { rz: 0 });
    // asset sticker
    const sticker = tmat('bar_sticker', 256, 64, (x, w, h, r) => {
      x.fillStyle = '#f1efe6'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w * 0.22, h); Tex.drawWordmark(x, w * 0.02, h * 0.66, h * 0.36, { color: BR.yellow });
      T(x, 'ASSET 0412-DT3', w * 0.26, h * 0.42, { size: 18, font: F.sans, weight: 'bold', color: '#222' });
      T(x, 'DEMO TABLE · DO NOT REMOVE', w * 0.26, h * 0.8, { size: 12, font: F.sans, color: '#444' });
      age(x, w, h, r, 0.8); scratches(x, w, h, r, 10, '#777', 0.4, 50);
    }, { roughness: 0.6 });
    decalUp(g, 0.1, 0.025, sticker, -L / 2 + 0.2, yc + s / 2 + 0.0004, 0);
    // the snapped end: the hollow section torn open, bright metal at the break
    const bright = mat('bar_break', { color: '#b7bdbf', metalness: 0.55, roughness: 0.35 });
    add(g, gPlane(s * 0.8, s * 0.8), mat('bar_hollow', { color: '#101213', roughness: 0.9 }), L / 2 + 0.0005, yc, 0, { ry: 90, cast: false });
    const shards = [[0.018, 0.012, 0.004, 0, 1, 14], [0.011, 0.004, 0.02, 1, 0, -8], [0.024, 0.01, 0.004, 0, -1, -20], [0.008, 0.004, 0.016, -1, 0, 10], [0.014, 0.004, 0.008, 0.6, 0.6, 25]];
    for (const [len, a, b, sy, sz, rot] of shards) add(g, gBox(len, a || 0.003, b || 0.003), bright, L / 2 + len / 2 - 0.002, yc + sy * s * 0.42, sz * s * 0.42, { rz: rot, ry: rot * 0.5 });
    return g;
  };

  // ---- FIRE EXTINGUISHER: old red dry-powder extinguisher, gauge, pin and seal, hose, the service tag ---------------
  MODELS.extinguisher = () => {
    const g = new THREE.Group(); g.name = 'item:extinguisher';
    const red = mat('ext_red', { color: '#b3261d', roughness: 0.33, metalness: 0.12 });
    add(g, gCyl(0.071, 0.071, 0.016, 28), M.black(), 0, 0.008, 0);
    add(g, gCyl(0.068, 0.068, 0.43, 28), red, 0, 0.23, 0);
    add(g, gSph(0.068, 28, 12, 0, Math.PI / 2), red, 0, 0.445, 0, { s: [1, 0.55, 1] });
    const lab = tmat('ext_label', 512, 512, (x, w, h, r) => {
      x.fillStyle = '#efe5c9'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#a3231b'; x.fillRect(0, 0, w, h * 0.2);
      T(x, 'FIRE EXTINGUISHER', w / 2, h * 0.13, { size: 44, font: F.heavy, weight: '900', color: '#fff6e8', align: 'center' });
      T(x, 'DRY CHEMICAL POWDER', w / 2, h * 0.28, { size: 30, font: F.sans, weight: 'bold', color: '#2a2622', align: 'center' });
      T(x, 'TYPE ABE  ·  4.5 kg', w / 2, h * 0.35, { size: 22, font: F.sans, color: '#2a2622', align: 'center' });
      // class pictograms (plain shapes and letters)
      [['A', '#2d7d3a'], ['B', '#c0402a'], ['E', '#2c4f9a']].forEach(([l, c], i) => {
        const cx = w * (0.28 + i * 0.22), cy = h * 0.47;
        x.fillStyle = c; x.fillRect(cx - 36, cy - 36, 72, 72);
        T(x, l, cx, cy + 20, { size: 54, font: F.heavy, weight: '900', color: '#fff', align: 'center' });
      });
      ['1. PULL THE PIN', '2. AIM AT THE BASE OF THE FIRE', '3. SQUEEZE THE LEVER', '4. SWEEP SIDE TO SIDE'].forEach((s, i) => T(x, s, w * 0.12, h * (0.64 + i * 0.065), { size: 22, font: F.sans, weight: 'bold', color: '#2a2622' }));
      for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(40,36,30,0.35)'; x.fillRect(w * 0.12, h * (0.9 + i * 0.016), w * (0.5 + r() * 0.3), 3); }
      age(x, w, h, r, 0.9, { sun: 0.12 });
    }, { roughness: 0.6 });
    add(g, gCyl(0.0686, 0.0686, 0.2, 28, true, -R(70), R(140)), lab, 0, 0.25, 0);
    // neck, valve head, handle and lever
    add(g, gCyl(0.02, 0.024, 0.03, 16), mat('ext_brass', { color: '#a88a45', metalness: 0.5, roughness: 0.35 }), 0, 0.485, 0);
    add(g, gBox(0.045, 0.034, 0.04), M.black(), 0, 0.515, 0);
    add(g, gBox(0.13, 0.01, 0.026), M.black(), -0.035, 0.528, 0, { rz: -4 });
    add(g, gBox(0.12, 0.009, 0.024), M.black(), -0.03, 0.552, 0, { rz: 10 });
    // pressure gauge on the front of the head
    const gauge = tmat('ext_gauge', 128, 128, (x, w, h) => {
      x.fillStyle = '#f4f1e6'; x.beginPath(); x.arc(w / 2, h / 2, w * 0.48, 0, TAU); x.fill();
      x.lineWidth = 12; x.strokeStyle = '#c43a2a'; x.beginPath(); x.arc(w / 2, h * 0.58, w * 0.34, Math.PI * 1.05, Math.PI * 1.3); x.stroke();
      x.strokeStyle = '#2f8a3e'; x.beginPath(); x.arc(w / 2, h * 0.58, w * 0.34, Math.PI * 1.35, Math.PI * 1.65); x.stroke();
      x.strokeStyle = '#c43a2a'; x.beginPath(); x.arc(w / 2, h * 0.58, w * 0.34, Math.PI * 1.7, Math.PI * 1.95); x.stroke();
      x.strokeStyle = '#111'; x.lineWidth = 4; x.beginPath(); x.moveTo(w / 2, h * 0.58); x.lineTo(w * 0.62, h * 0.3); x.stroke();
      x.strokeStyle = '#888'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2, h / 2, w * 0.47, 0, TAU); x.stroke();
    }, { roughness: 0.3 });
    add(g, gCyl(0.013, 0.013, 0.008, 16), M.chrome(), 0.012, 0.515, 0.024, { rx: 90 });
    add(g, gCircle(0.0115, 20), gauge, 0.012, 0.515, 0.0282);
    // safety pin with its ring and a yellow tamper seal
    add(g, gCyl(0.002, 0.002, 0.05, 6), M.chrome(), -0.012, 0.532, 0, { rx: 90 });
    add(g, gTor(0.011, 0.0018, 6, 20), M.chrome(), -0.012, 0.532, 0.036);
    add(g, gBox(0.006, 0.012, 0.003), mat('ext_seal', { color: '#e8c21a', roughness: 0.5 }), -0.012, 0.52, 0.03);
    // hose down the side to the nozzle, clipped to the body
    add(g, gTube('exthose', [[0.022, 0.51, 0.0], [0.06, 0.49, 0.01], [0.078, 0.42, 0.02], [0.074, 0.3, 0.03], [0.07, 0.2, 0.034]], 0.0075, 32, 8), mat('ext_hose', { color: '#141516', roughness: 0.85 }));
    add(g, gCyl(0.009, 0.006, 0.05, 12), M.black(), 0.07, 0.17, 0.034);
    add(g, gBox(0.02, 0.012, 0.02), M.black(), 0.068, 0.24, 0.036, { cast: false });
    // the service tag on a string, turned to the front
    const tag = tmat('ext_tag', 128, 192, (x, w, h, r) => {
      x.fillStyle = '#efe7cf'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#b8b0a0'; x.beginPath(); x.arc(w / 2, h * 0.08, 8, 0, TAU); x.fill();
      T(x, 'SERVICED', w / 2, h * 0.22, { size: 20, font: F.sans, weight: 'bold', color: '#7a1d17', align: 'center', spacing: 1 });
      const mo = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      mo.forEach((m, i) => { const cx = w * (0.14 + (i % 6) * 0.145), cy = h * (0.36 + Math.floor(i / 6) * 0.1); x.strokeStyle = '#8a8070'; x.lineWidth = 1; x.strokeRect(cx - 8, cy - 12, 16, 16); T(x, m, cx, cy + 1, { size: 12, font: F.sans, color: '#555', align: 'center' }); if (i === 2) { x.fillStyle = '#222'; x.beginPath(); x.arc(cx, cy - 4, 6, 0, TAU); x.fill(); } });
      T(x, '19', w * 0.3, h * 0.72, { size: 30, font: F.mono, weight: 'bold', color: '#333', align: 'center' });
      T(x, '7', w * 0.55, h * 0.72, { size: 30, font: F.mono, weight: 'bold', color: '#333', align: 'center' });
      x.fillStyle = 'rgba(80,70,55,0.55)'; x.fillRect(w * 0.64, h * 0.6, w * 0.2, h * 0.14);
      HW(x, 'R.T.', w * 0.2, h * 0.9, { size: 22, color: '#1f2c6e' });
      age(x, w, h, r, 1.2);
    }, { roughness: 0.85, side: THREE.DoubleSide });
    add(g, gTube('exttagstr', [[-0.012, 0.525, 0.037], [-0.017, 0.51, 0.06], [-0.018, 0.5, 0.072]], 0.0007, 8, 4), mat('ext_string', { color: '#d8d0bb' }), 0, 0, 0, { cast: false });
    add(g, gPlane(0.038, 0.057), tag, -0.018, 0.4715, 0.074, { rx: -6, ry: 6, cast: false });
    return g;
  };

  // ---- RETURNED MODEM: the torn grey returns satchel, the modem box half out of it, her sticky note ------------------
  const modemBoxMats = () => {
    const face = (k, draw) => tmat('mbox_' + k, 512, 512, draw, { roughness: 0.55 });
    const base = (x, w, h) => { x.fillStyle = '#f3f2ec'; x.fillRect(0, 0, w, h); };
    const top = face('top', (x, w, h, r) => {
      base(x, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.34);
      Tex.drawWordmark(x, w * 0.06, h * 0.24, h * 0.13, { color: BR.yellow });
      T(x, '5G HOME INTERNET', w * 0.06, h * 0.47, { size: 50, font: F.heavy, weight: '900', color: BR.ink });
      T(x, 'Plug in. Switch on. Connected.*', w * 0.06, h * 0.55, { size: 24, font: F.sans, color: '#333' });
      // the modem, drawn
      x.fillStyle = '#e1dfd8'; rrPath(x, w * 0.58, h * 0.6, w * 0.3, h * 0.34, 16); x.fill(); x.fillStyle = BR.teal; x.fillRect(w * 0.58, h * 0.6, w * 0.3, 10);
      for (let i = 0; i < 5; i++) { x.fillStyle = '#3dcf8a'; x.fillRect(w * 0.63 + i * 22, h * 0.72, 10, 5); }
      T(x, '*Coverage varies by area.', w * 0.06, h * 0.95, { size: 18, font: F.sans, color: '#666' });
      age(x, w, h, r, 0.45); scratches(x, w, h, r, 20, '#8a8a80', 0.3, 60);
    });
    const front = face('front', (x, w, h, r) => {
      base(x, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.14);
      T(x, '5G HOME INTERNET', w * 0.05, h * 0.36, { size: 58, font: F.heavy, weight: '900', color: BR.ink });
      T(x, 'Modem · power supply · cables', w * 0.05, h * 0.5, { size: 26, font: F.sans, color: '#444' });
      // the returns label with her account number
      x.save(); x.translate(w * 0.56, h * 0.56); x.rotate(-0.03);
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w * 0.4, h * 0.38); x.strokeStyle = '#999'; x.lineWidth = 2; x.strokeRect(0, 0, w * 0.4, h * 0.38);
      T(x, 'RETURN AUTHORISED', w * 0.02, h * 0.06, { size: 18, font: F.sans, weight: 'bold', color: '#222' });
      T(x, 'ACCT 4471-0932', w * 0.02, h * 0.15, { size: 30, font: F.mono, weight: 'bold', color: '#111' });
      T(x, 'SIGNAL HILL', w * 0.02, h * 0.21, { size: 18, font: F.mono, color: '#222' });
      barcode(x, w * 0.02, h * 0.24, w * 0.36, h * 0.1, r);
      x.restore();
      age(x, w, h, r, 0.5);
    });
    const side = face('side', (x, w, h, r) => {
      base(x, w, h); x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.14); x.fillStyle = BR.yellow; x.fillRect(0, h * 0.14, w, h * 0.03);
      T(x, 'IN THE BOX', w * 0.08, h * 0.35, { size: 30, font: F.sans, weight: 'bold', color: '#222' });
      ['1 × 5G modem', '1 × power supply', '1 × ethernet cable', 'Quick start guide'].forEach((s, i) => T(x, s, w * 0.08, h * (0.47 + i * 0.1), { size: 26, font: F.sans, color: '#444' }));
      age(x, w, h, r, 0.5);
    });
    const plain = mat('mbox_plain', { color: '#e9e7de', roughness: 0.6 });
    return [side, side, top, plain, front, side];     // px nx py ny pz nz
  };
  MODELS.returned_modem = () => {
    const g = new THREE.Group(); g.name = 'item:returned_modem';
    const W = 0.5, D = 0.36, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
    const bx0 = -0.14, bx1 = 0.14, bz0 = -0.08, bz1 = 0.12, BH = 0.1, tear = 0.02;
    // the box, half out of the torn satchel
    add(g, gBox(bx1 - bx0, BH, bz1 - bz0), modemBoxMats(), (bx0 + bx1) / 2, 0.004 + BH / 2, (bz0 + bz1) / 2, { ry: 0 });
    // satchel texture (grey outside, a printed courier panel and the returns label)
    const bagTex = (x, w, h, r) => {
      x.fillStyle = '#7d8584'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.12)'; x.lineWidth = 1 + r() * 4; x.beginPath(); const sx = r() * w, sy = r() * h; x.moveTo(sx, sy); x.quadraticCurveTo(sx + (r() - 0.5) * w * 0.3, sy + (r() - 0.5) * h * 0.2, sx + (r() - 0.5) * w * 0.5, sy + (r() - 0.5) * h * 0.3); x.stroke(); }
      T(x, 'REPLY PAID — RETURNS', w * 0.5, h * 0.09, { size: 30, font: F.sans, weight: 'bold', color: 'rgba(240,240,236,0.85)', spacing: 3, align: 'center' });
      x.save(); x.translate(w * 0.05, h * 0.15); x.rotate(-0.05);
      x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w * 0.32, h * 0.26);
      T(x, 'RETURNS — REPLY PAID 4471', w * 0.012, h * 0.045, { size: 14, font: F.sans, weight: 'bold', color: '#222' });
      T(x, 'TO: RETURNS CENTRE, CITY', w * 0.012, h * 0.09, { size: 13, font: F.mono, color: '#333' });
      T(x, 'FROM: UNIT 9, HILLTOP VILLAGE', w * 0.012, h * 0.13, { size: 13, font: F.mono, color: '#333' });
      barcode(x, w * 0.012, h * 0.15, w * 0.29, h * 0.08, r);
      x.restore();
      age(x, w, h, r, 0.35);
    };
    const bag = tmat('satchel_out', 512, 368, bagTex, { roughness: 0.5 });
    const inside = mat('satchel_in', { color: '#262829', roughness: 0.7, side: THREE.DoubleSide });
    add(g, gPlane(W, D), inside, 0, 0.0025, 0, { rx: -90, cast: false });
    add(g, gBox(W, 0.002, D), mat('satchel_base', { color: '#6f7776', roughness: 0.6 }), 0, 0.001, 0);
    // top layer: loose plastic draped over the back of the box, torn open across the lid (the lip curls up a little)
    const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const hgt = (x, z) => {
      const dx = Math.max(bx0 - x, 0, x - bx1), dz = Math.max(bz0 - z, 0, z - bz1), d = Math.hypot(dx, dz);
      const wr = 0.0035 * Math.sin(x * 70 + z * 20) * Math.sin(z * 55 - x * 13);
      const over = 0.005 + (BH + 0.002) * (1 - sm(d / 0.1)) + wr * sm(d / 0.03);
      const edge = sm(Math.min(x - x0, x1 - x, z - z0) / 0.025);
      const lip = z > tear - 0.02 ? (z - tear + 0.02) / 0.02 * 0.005 * (d < 0.001 ? 1 : 0) : 0;
      return Math.max(0.004, 0.004 + (over - 0.004) * edge) + lip;
    };
    const jag = (x, z, u, v, i, j) => (j === 14 ? [x, z + ((U.hash('t' + i) % 100) / 100) * 0.026 - 0.01] : null);
    const uvF = (x, z) => [(x - x0) / W, 1 - (z - z0) / D];
    const top = gGrid('satchtop2', x0, z0, x1, tear, 30, 14, hgt, { warp: jag, uv: uvF });
    add(g, top, bag);
    add(g, top, mat('satchel_under', { color: '#232526', roughness: 0.75, side: THREE.BackSide }), 0, -0.0015, 0, { cast: false });
    // a torn flap of the plastic, flipped back onto the lid (its dark inside up)
    const flapH = (x, z) => BH + 0.0062 + Math.max(0, z - 0.035) * 0.08 + Math.sin(x * 60) * 0.0012;
    const fjag = (x, z, u, v, i, j) => (j === 4 ? [x, z + ((U.hash('f' + i) % 100) / 100) * 0.014] : i === 0 || i === 6 ? [x + (i ? -1 : 1) * v * 0.012, z] : null);
    add(g, gGrid('satchflap', -0.1, tear - 0.004, -0.03, tear + 0.03, 6, 4, flapH, { warp: fjag }), inside, 0, 0, 0, { cast: false });
    // her sticky note on the exposed lid of the box
    const note = tmat('modem_note', 256, 256, (x, w, h, r) => {
      x.fillStyle = '#f0de72'; x.fillRect(0, 0, w, h);
      const gr = x.createLinearGradient(0, 0, 0, h * 0.2); gr.addColorStop(0, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h * 0.2);
      HW(x, 'You said it would work here.', w * 0.1, h * 0.36, { size: 40, color: '#1c2a6a', maxWidth: w * 0.84, wobble: 2.4, lineHeight: 52 });
      age(x, w, h, r, 0.4);
    }, { roughness: 0.8 });
    decalUp(g, 0.076, 0.076, note, 0.05, 0.0045 + BH + 0.0008, 0.075, 9);
    return g;
  };

  // ---- STAFF ROOM KEY: a brass key, split ring, red plastic tag "Staff Rm — L1" --------------------------------------
  const tagTex = (key, text, o = {}) => tmat(key, 256, 112, (x, w, h, r) => {
    x.fillStyle = o.bg || '#f4f1e6'; x.fillRect(0, 0, w, h);
    if (o.lines !== false) { x.fillStyle = 'rgba(80,120,180,0.3)'; x.fillRect(0, h * 0.72, w, 2); }
    HW(x, text, w * 0.06, h * 0.62, { size: o.size || 44, color: o.ink || '#1f2c6e', maxWidth: w * 0.9, wobble: 1.2 });
    age(x, w, h, r, 0.5);
  }, { roughness: 0.8 });
  MODELS.staff_key = () => {
    const g = new THREE.Group(); g.name = 'item:staff_key';
    const k = key(g, 'staff', { len: 0.034, blade: 0.0085, bowR: 0.0125, holeR: 0.0032, cuts: [0.003, 0.0012, 0.0035, 0.002, 0.0028, 0.001] }, M.brass());
    k.g.position.x = 0.02;
    ringAt(g, k.hole[0] + 0.02 - 0.011, 0, 0.0115);
    // the tag
    const tg = grp(g, k.hole[0] + 0.02 - 0.043, 0, 0.001, { ry: 6 });
    add(tg, gSlab(0.054, 0.024, 0.003, 0.006, 0.0006), mat('tag_red', { color: '#b72a22', roughness: 0.4 }), 0, 0.0015, 0);
    add(tg, gCyl(0.0028, 0.0028, 0.0034, 12), mat('tag_hole', { color: '#3a0e0b' }), 0.021, 0.0015, 0, { cast: false });
    decalUp(tg, 0.036, 0.016, tagTex('tag_staff', 'Staff Rm — L1'), -0.005, 0.0032, 0);
    add(tg, gBox(0.038, 0.0004, 0.018), M.clear(), -0.005, 0.0034, 0, { cast: false });
    return g;
  };

  // ---- INDUCTION CERTIFICATE (the riddle level decides how the date is written) ----------------------------------------
  MODELS.certificate = () => {
    const L = lvl() === 'hard' ? 'hard' : 'normal';
    const g = new THREE.Group(); g.name = 'item:certificate';
    const tex = tmat('cert_' + L, 512, 724, (x, w, h, r) => {
      x.fillStyle = '#f5f0e2'; x.fillRect(0, 0, w, h);
      speck(x, w, h, r, 300, '#8a7a5a', 0.08, 1.2);
      x.strokeStyle = BR.teal; x.lineWidth = 10; x.strokeRect(18, 18, w - 36, h - 36);
      x.strokeStyle = '#c9a44c'; x.lineWidth = 3; x.strokeRect(34, 34, w - 68, h - 68);
      Tex.drawWordmark(x, w / 2 - 62, 108, 44, { color: BR.tealDark });
      T(x, 'CERTIFICATE', w / 2, 190, { size: 42, font: F.serif, color: '#1b2626', align: 'center', spacing: 6 });
      T(x, 'OF COMPLETION', w / 2, 226, { size: 20, font: F.serif, color: '#4a5050', align: 'center', spacing: 6 });
      T(x, 'This certifies that', w / 2, 290, { size: 20, font: F.serif, color: '#555', align: 'center' });
      x.save(); x.font = `italic 64px ${F.hand}`; x.fillStyle = '#1b2f55'; x.textAlign = 'center'; x.fillText('Aidan', w / 2, 368); x.restore();
      x.fillStyle = '#b9ae94'; x.fillRect(w * 0.22, 382, w * 0.56, 2);
      T(x, 'has completed', w / 2, 420, { size: 20, font: F.serif, color: '#555', align: 'center' });
      T(x, 'SALES INDUCTION', w / 2, 462, { size: 30, font: F.serif, weight: 'bold', color: '#1b2626', align: 'center', spacing: 3 });
      T(x, 'Retail Sales — New Starter Program', w / 2, 492, { size: 16, font: F.serif, color: '#666', align: 'center' });
      if (L === 'hard') {
        T(x, 'completed on the fourteenth of March,', w / 2, 546, { size: 22, font: F.serif, color: '#222', align: 'center' });
        T(x, 'two thousand and twenty-six', w / 2, 574, { size: 22, font: F.serif, color: '#222', align: 'center' });
      } else T(x, 'completed 14/03/2026', w / 2, 556, { size: 26, font: F.serif, color: '#222', align: 'center' });
      for (const [sx, who, sig] of [[0.25, 'Store Leader', 'Luka'], [0.75, 'Induction Trainer', 'Chloe']]) {
        HW(x, sig, w * sx - 50, 606, { size: 34, color: '#1f2c6e', wobble: 1.6 });
        x.fillStyle = '#777'; x.fillRect(w * sx - 70, 618, 140, 1.5);
        T(x, who, w * sx, 638, { size: 14, font: F.serif, color: '#666', align: 'center' });
      }
      // a coffee ring and the pin hole it hung from
      x.strokeStyle = 'rgba(120,80,40,0.18)'; x.lineWidth = 7; x.beginPath(); x.arc(w * 0.84, h * 0.6, 46, 0.3, 5.6); x.stroke();
      x.fillStyle = '#3a342a'; x.beginPath(); x.arc(w / 2, 46, 3, 0, TAU); x.fill();
      age(x, w, h, r, 0.45);
    }, { roughness: 0.85, side: THREE.DoubleSide });
    const curl = (x, z) => 0.0015 + Math.max(0, Math.abs(x) - 0.075) ** 2 * 1.4 + Math.max(0, z - 0.1) ** 2 * 0.9;
    add(g, gGrid('cert', -0.105, -0.1485, 0.105, 0.1485, 10, 14, curl), tex);
    // the gold seal sticker
    const seal = tmat('cert_seal', 128, 128, (x, w, h) => {
      const gr = x.createRadialGradient(w * 0.4, h * 0.4, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, '#f6de8a'); gr.addColorStop(1, '#b48a2c');
      x.fillStyle = gr; x.beginPath(); for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, rr = i % 2 ? w * 0.47 : w * 0.42; x.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } x.closePath(); x.fill();
      x.strokeStyle = 'rgba(110,80,20,0.7)'; x.lineWidth = 2; x.beginPath(); x.arc(w / 2, h / 2, w * 0.3, 0, TAU); x.stroke();
      x.fillStyle = '#8a6418'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? w * 0.09 : w * 0.22; x.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } x.closePath(); x.fill();
    }, { roughness: 0.3, metalness: 0.4, alphaTest: 0.5 });
    decalUp(g, 0.034, 0.034, seal, 0, 0.0034, 0.132);
    return g;
  };

  // ---- FIRST-DAY BADGE: "AIDAN — HERE TO HELP!", a gold star sticker, the bent pin on the back ------------------------
  MODELS.first_day_badge = () => {
    const g = new THREE.Group(); g.name = 'item:first_day_badge';
    const b = grp(g, 0, 0.0035, 0);
    add(b, gSlab(0.078, 0.027, 0.0028, 0.004, 0.0005), M.white(), 0, 0.0014, 0);
    const face = tmat('badge_face', 512, 176, (x, w, h, r) => {
      x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.3);
      Tex.drawWordmark(x, w * 0.04, h * 0.23, h * 0.18, { color: BR.yellow });
      T(x, 'AIDAN', w * 0.5, h * 0.66, { size: fitSize(x, 'AIDAN', w * 0.8, 74, F.heavy, '900'), font: F.heavy, weight: '900', color: BR.ink, align: 'center', spacing: 3 });
      x.fillStyle = BR.yellow; x.fillRect(w * 0.2, h * 0.75, w * 0.6, h * 0.19);
      T(x, 'HERE TO HELP!', w * 0.5, h * 0.9, { size: 30, font: F.sans, weight: 'bold', color: BR.ink, align: 'center', spacing: 2 });
      const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      scratches(x, w, h, r, 12, '#ffffff', 0.25, 40);
    }, { roughness: 0.3 });
    decalUp(b, 0.075, 0.0255, face, 0, 0.0029, 0);
    // a small gold star sticker in the corner (Chloe gave everyone one on day one)
    const star = () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? 0.0024 : 0.0058; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } s.closePath(); return s; };
    add(b, gExt('badgestar', star, 0.0003, { flat: true }), M.gold(), 0.031, 0.0032, -0.0065, { ry: 12 });
    // the back: pin bar, a bent pin, the catch; a strip of tape with DAY 1 in marker
    const back = grp(g, 0, 0.0035, 0);
    add(back, gBox(0.052, 0.0016, 0.007), M.steel(), 0, -0.0008, -0.002);
    add(back, gCyl(0.0007, 0.0007, 0.05, 6), M.chrome(), 0.001, -0.0022, -0.002, { rz: 90, rx: 3 });
    add(back, gCyl(0.0022, 0.0022, 0.004, 10), M.steel(), 0.024, -0.0022, -0.002, { rx: 90 });
    add(back, gBox(0.004, 0.0035, 0.0035), M.steel(), -0.025, -0.0018, -0.002);
    return g;
  };

  // ---- UNIT 9 KEY: a nickel key, a round tag "UNIT 9", a small crocheted flower -------------------------------------
  MODELS.unit9_key = () => {
    const g = new THREE.Group(); g.name = 'item:unit9_key';
    const k = key(g, 'unit9', { len: 0.03, blade: 0.0078, bowR: 0.0115, holeR: 0.003, cuts: [0.0022, 0.0034, 0.001, 0.0028, 0.0018] }, M.nickel());
    k.g.position.set(0.028, 0, 0.002); k.g.rotation.y = R(-10);
    ringAt(g, -0.0034, -0.0016, 0.011);
    // round tag: blue rim, paper disc "UNIT 9"
    const t = grp(g, -0.024, 0, -0.012);
    add(t, gTor(0.0125, 0.0022, 8, 32), mat('tag_blue', { color: '#2f5f99', roughness: 0.4 }), 0, 0.0022, 0, { rx: 90 });
    add(t, gCyl(0.0125, 0.0125, 0.0012, 28), mat('tag_blue_back', { color: '#2a5588', roughness: 0.45 }), 0, 0.0008, 0);
    const disc = tmat('tag_unit9', 128, 128, (x, w, h, r) => {
      x.fillStyle = '#f3f0e4'; x.fillRect(0, 0, w, h);
      T(x, 'UNIT 9', w / 2, h * 0.6, { size: 30, font: F.sans, weight: 'bold', color: '#1f2c6e', align: 'center', spacing: 2 });
      x.fillStyle = 'rgba(80,120,180,0.35)'; x.fillRect(w * 0.15, h * 0.68, w * 0.7, 1.5);
      age(x, w, h, r, 0.5);
    }, { roughness: 0.8 });
    add(t, gCircle(0.0112, 24), disc, 0, 0.0021, 0, { rx: -90, cast: false });
    add(t, gTor(0.004, 0.0008, 5, 14), M.steel(), 0.013, 0.0016, 0.004, { rx: 80 });
    // the crocheted flower
    const wool = tmat('wool_pink', 64, 64, (x, w, h, r) => { x.fillStyle = '#d97b98'; x.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(90,20,40,0.2)'; x.lineWidth = 1.2; x.beginPath(); const cx = r() * w, cy = r() * h; x.arc(cx, cy, 2 + r() * 2, 0, Math.PI); x.stroke(); } }, { roughness: 0.95 });
    const f = grp(g, -0.006, 0.002, -0.026);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; add(f, gSph(0.0055, 10, 8), wool, Math.cos(a) * 0.0068, 0.0015, Math.sin(a) * 0.0068, { s: [1.3, 0.38, 0.8], ry: -(a * 180) / Math.PI }); }
    add(f, gSph(0.0042, 10, 8), mat('wool_yellow', { color: '#e8c24a', roughness: 0.95 }), 0, 0.0028, 0, { s: [1, 0.55, 1] });
    return g;
  };

  // ---- ALARM PENDANT: her pendant, the big red button worn shiny, the cord coiled beside it; the back label -----------
  const pendantBody = (g, key, o = {}) => {
    const oval = () => { const s = new THREE.Shape(); s.absellipse(0, 0, 0.02, 0.026, 0, TAU, false, 0); return s; };
    const body = mat(key + '_body', { color: o.color || '#e6e3d6', roughness: 0.38 });
    add(g, gExt('pendoval', oval, 0.008, { bevel: 0.0026, bs: 3, flat: true }), body, 0, 0.0067, 0);
    add(g, gTor(0.0152, 0.0014, 6, 36), mat('pend_bezel', { color: '#a2a8aa', roughness: 0.35, metalness: 0.2 }), 0, 0.0133, 0.003, { rx: 90 });
    add(g, gCyl(0.0138, 0.0142, 0.0034, 32), mat('pend_red', { color: '#c0271e', roughness: 0.3 }), 0, 0.0145, 0.003);
    const top = tmat(key + '_btn', 128, 128, (x, w, h) => {
      const gr = x.createRadialGradient(w * 0.45, h * 0.45, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, o.worn ? '#ef6a58' : '#d5372b'); gr.addColorStop(o.worn ? 0.35 : 0.2, '#c62a20'); gr.addColorStop(1, '#9a1a14'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,220,210,0.35)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, h / 2, w * 0.32, 0, TAU); x.stroke();
      T(x, 'HELP', w / 2, h * 0.58, { size: 26, font: F.sans, weight: 'bold', color: 'rgba(255,230,222,0.55)', align: 'center', spacing: 2 });
    }, { roughness: 0.28 });
    add(g, gCircle(0.0138, 32), top, 0, 0.0163, 0.003, { rx: -90, cast: false });
    add(g, gSph(0.0012, 8, 6), mat(key + '_led', { color: o.led || '#2b3a2e', emissive: o.led || '#000000', emissiveIntensity: o.led ? 0.6 : 0, roughness: 0.3 }), 0, 0.0128, -0.0195);
    // the lug for the cord
    add(g, gTor(0.0038, 0.0014, 6, 16), body, 0, 0.0065, -0.0285, { rx: 90 });
  };
  MODELS.alarm_pendant = () => {
    const g = new THREE.Group(); g.name = 'item:alarm_pendant';
    pendantBody(g, 'pend', { worn: true });
    const back = tmat('pend_back', 256, 320, (x, w, h, r) => {
      x.fillStyle = '#e6e3d6'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fbfaf5'; rrPath(x, w * 0.08, h * 0.14, w * 0.84, h * 0.72, 16); x.fill();
      T(x, 'PRESS & HOLD', w / 2, h * 0.33, { size: 30, font: F.sans, weight: 'bold', color: '#b3261e', align: 'center' });
      T(x, '3 SEC', w / 2, h * 0.47, { size: 46, font: F.heavy, weight: '900', color: '#b3261e', align: 'center' });
      T(x, 'PERSONAL ALARM', w / 2, h * 0.6, { size: 17, font: F.sans, weight: 'bold', color: '#333', align: 'center', spacing: 1 });
      T(x, 'TEST MONTHLY · WATERPROOF', w / 2, h * 0.68, { size: 13, font: F.sans, color: '#555', align: 'center' });
      T(x, 'SN 20-7741-09', w / 2, h * 0.77, { size: 14, font: F.mono, color: '#444', align: 'center' });
      age(x, w, h, r, 0.6);
    }, { roughness: 0.6 });
    add(g, gPlane(0.032, 0.04), back, 0, -0.0001, 0, { rx: 90, cast: false });
    // the neck cord, coiled loose beside it (never worn), with its breakaway clasp
    const pts = [[0, 0.006, -0.029], [-0.006, 0.004, -0.038]];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * TAU * 2 - 0.4, rr = 0.033 - t * 0.007 + Math.sin(t * 13) * 0.0018;
      pts.push([-0.035 + Math.cos(a) * rr * 1.08, 0.0022 + t * 0.0034 + Math.sin(t * 23) * 0.0006, -0.058 + Math.sin(a) * rr * 0.92]);
    }
    pts.push([-0.006, 0.0064, -0.036], [0.002, 0.006, -0.031]);
    add(g, gTube('pendcord2', pts, 0.0017, 120, 5), mat('pend_cord', { color: '#243152', roughness: 0.85 }));
    add(g, gBox(0.009, 0.004, 0.005), mat('pend_clasp', { color: '#1c2640', roughness: 0.5 }), -0.07, 0.0035, -0.052, { ry: 80 });
    return g;
  };

  // ---- JUMPER TOOL: a hooked steel tool with a worn wooden handle (Wai's) -------------------------------------------
  MODELS.jumper_tool = () => {
    const g = new THREE.Group(); g.name = 'item:jumper_tool';
    const woodM = tmat('jumper_wood', 256, 256, (x, w, h, r) => {
      wood(x, w, h, r, '#9b6c3e', '#5e3b1f');
      // worn pale where a thumb goes, darker where a palm grips; a W scratched in
      const gr = x.createRadialGradient(w * 0.25, h * 0.55, 4, w * 0.25, h * 0.55, w * 0.22); gr.addColorStop(0, 'rgba(236,210,160,0.75)'); gr.addColorStop(1, 'rgba(236,210,160,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(40,24,10,0.25)'; x.fillRect(0, h * 0.2, w, h * 0.25);
      x.strokeStyle = 'rgba(40,24,12,0.8)'; x.lineWidth = 3; x.beginPath(); x.moveTo(w * 0.62, h * 0.5); x.lineTo(w * 0.66, h * 0.64); x.lineTo(w * 0.7, h * 0.54); x.lineTo(w * 0.74, h * 0.64); x.lineTo(w * 0.78, h * 0.5); x.stroke();
    }, { roughness: 0.65 });
    const h = grp(g, -0.055, 0.0128, 0, { rz: -90 });
    add(h, gLathe('jumperhandle', [[0.0001, -0.052], [0.006, -0.0515], [0.0105, -0.047], [0.0122, -0.035], [0.0114, -0.012], [0.0126, 0.018], [0.0118, 0.038], [0.0095, 0.047], [0.0088, 0.052]], 28), woodM);
    add(g, gCyl(0.0092, 0.0092, 0.012, 20), mat('jumper_ferrule', { color: '#b8994f', metalness: 0.5, roughness: 0.35 }), 0.003, 0.0128, 0, { rz: 90 });
    add(g, gCyl(0.0025, 0.0028, 0.078, 10), M.steel(), 0.047, 0.0128, 0, { rz: 90 });
    // the hook at the tip, and a small spur
    add(g, gTor(0.0058, 0.0021, 6, 16, R(210)), M.steel(), 0.087, 0.0128 + 0.0045, 0, { rz: -70 });
    add(g, gCyl(0.0001, 0.0019, 0.008, 8), M.steel(), 0.082, 0.0128 + 0.0098, 0, { rz: 150 });
    return g;
  };

  // ---- VISITOR PASS: a thermal-printed pass in a clear sleeve with a clip --------------------------------------------
  MODELS.visitor_pass = () => {
    const g = new THREE.Group(); g.name = 'item:visitor_pass';
    const card = tmat('visitor_pass', 512, 336, (x, w, h, r) => {
      x.fillStyle = '#f7f6f1'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#c0261d'; x.fillRect(0, 0, w, h * 0.24);
      T(x, 'VISITOR', w / 2, h * 0.18, { size: 56, font: F.heavy, weight: '900', color: '#ffffff', align: 'center', spacing: 10 });
      T(x, 'REGIONAL OFFICE', w * 0.06, h * 0.33, { size: 18, font: F.sans, weight: 'bold', color: '#555', spacing: 2 });
      T(x, 'AIDAN', w * 0.06, h * 0.52, { size: 64, font: F.mono, weight: 'bold', color: '#181818' });
      T(x, 'VISITING: ESCALATIONS', w * 0.06, h * 0.65, { size: 30, font: F.mono, weight: 'bold', color: '#222' });
      T(x, 'DATE: --/--/----', w * 0.06, h * 0.76, { size: 20, font: F.mono, color: '#333' });
      T(x, 'TIME IN: --:--    TIME OUT:', w * 0.06, h * 0.84, { size: 20, font: F.mono, color: '#333' });
      barcode(x, w * 0.06, h * 0.88, w * 0.55, h * 0.08, r, '#222');
      // thermal print fading at one edge
      const gr = x.createLinearGradient(w * 0.7, 0, w, 0); gr.addColorStop(0, 'rgba(247,246,241,0)'); gr.addColorStop(1, 'rgba(247,246,241,0.55)'); x.fillStyle = gr; x.fillRect(0, h * 0.26, w, h * 0.74);
      age(x, w, h, r, 0.25);
    }, { roughness: 0.7 });
    const p = grp(g, 0, 0.0016, 0);
    add(p, gBox(0.09, 0.0006, 0.06), mat('pass_board', { color: '#ecebe4', roughness: 0.8 }), 0, 0.0003, 0.004);
    decalUp(p, 0.086, 0.0565, card, 0, 0.00065, 0.004);
    add(p, gBox(0.096, 0.0022, 0.068), M.clear(), 0, 0.0004, 0.004, { cast: false });
    // clip and strap at the top edge
    add(p, gBox(0.014, 0.0012, 0.012), M.clear(), 0, 0.0008, -0.035, { cast: false });
    add(p, gBox(0.012, 0.0035, 0.02), M.chrome(), 0, 0.0014, -0.05);
    add(p, gTor(0.0028, 0.001, 5, 12), M.chrome(), 0, 0.0014, -0.061, { rx: 90 });
    return g;
  };

  // ---- LEVEL 4 KEYCARD: Chloe's card on her badge reel ---------------------------------------------------------------
  MODELS.keycard = () => {
    const g = new THREE.Group(); g.name = 'item:keycard';
    const front = tmat('keycard_front', 512, 324, (x, w, h, r) => {
      x.fillStyle = '#f6f6f3'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.22);
      Tex.drawWordmark(x, w * 0.05, h * 0.16, h * 0.11, { color: BR.yellow });
      T(x, 'REGIONAL OFFICE', w * 0.95, h * 0.14, { size: 18, font: F.sans, weight: 'bold', color: '#e8fbfb', align: 'right', spacing: 2 });
      // her photo: pale backdrop, a high ponytail, the smile she gives customers
      const px = w * 0.06, py = h * 0.3, pw = w * 0.28, ph = h * 0.6;
      const bg = x.createLinearGradient(0, py, 0, py + ph); bg.addColorStop(0, '#c9d6d9'); bg.addColorStop(1, '#a9b9bd'); x.fillStyle = bg; x.fillRect(px, py, pw, ph);
      x.fillStyle = '#2f2420'; x.beginPath(); x.ellipse(px + pw * 0.5, py + ph * 0.36, pw * 0.26, ph * 0.26, 0, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(px + pw * 0.66, py + ph * 0.08, pw * 0.1, ph * 0.1, 0.6, 0, TAU); x.fill();
      x.fillStyle = '#e6bfa2'; x.beginPath(); x.ellipse(px + pw * 0.5, py + ph * 0.42, pw * 0.19, ph * 0.21, 0, 0, TAU); x.fill();
      x.strokeStyle = '#8a4a40'; x.lineWidth = 2.5; x.beginPath(); x.arc(px + pw * 0.5, py + ph * 0.45, pw * 0.08, 0.3, Math.PI - 0.3); x.stroke();
      x.fillStyle = '#2a2a2a'; for (const s of [-1, 1]) { x.beginPath(); x.arc(px + pw * (0.5 + s * 0.07), py + ph * 0.39, 2.4, 0, TAU); x.fill(); }
      x.fillStyle = BR.teal; x.beginPath(); x.ellipse(px + pw * 0.5, py + ph * 1.02, pw * 0.42, ph * 0.3, 0, Math.PI, TAU); x.fill();
      T(x, 'CHLOE', w * 0.4, h * 0.44, { size: 58, font: F.heavy, weight: '900', color: BR.ink, spacing: 3 });
      T(x, 'LEVEL 4 ACCESS', w * 0.4, h * 0.58, { size: 28, font: F.sans, weight: 'bold', color: '#333', spacing: 1 });
      T(x, 'RETAIL — REGION', w * 0.4, h * 0.67, { size: 20, font: F.sans, color: '#666', spacing: 1 });
      const holo = x.createLinearGradient(w * 0.78, h * 0.72, w * 0.94, h * 0.92); holo.addColorStop(0, '#b6e3e0'); holo.addColorStop(0.5, '#e7d3f0'); holo.addColorStop(1, '#f2ebb3'); x.fillStyle = holo; x.fillRect(w * 0.8, h * 0.74, w * 0.13, h * 0.17);
      scratches(x, w, h, r, 10, '#ffffff', 0.3, 50);
    }, { roughness: 0.3 });
    const back = tmat('keycard_back', 512, 324, (x, w, h, r) => {
      x.fillStyle = '#f2f2ef'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#18191a'; x.fillRect(0, h * 0.12, w, h * 0.2);
      x.fillStyle = '#ffffff'; x.fillRect(w * 0.06, h * 0.42, w * 0.56, h * 0.13); x.strokeStyle = '#bbb'; x.strokeRect(w * 0.06, h * 0.42, w * 0.56, h * 0.13);
      HW(x, 'Chloe', w * 0.1, h * 0.52, { size: 36, color: '#1a1a1a', wobble: 0.6 });
      T(x, 'IF FOUND, PLEASE RETURN TO', w / 2, h * 0.7, { size: 22, font: F.sans, weight: 'bold', color: '#444', align: 'center' });
      T(x, 'LEVEL 4 RECEPTION', w / 2, h * 0.79, { size: 22, font: F.sans, weight: 'bold', color: '#444', align: 'center' });
      T(x, 'ID 00412-0187', w / 2, h * 0.9, { size: 16, font: F.mono, color: '#666', align: 'center' });
      scratches(x, w, h, r, 16, '#999', 0.3, 40);
    }, { roughness: 0.35 });
    const c = grp(g, 0.01, 0.0005, 0.008);
    add(c, gSlab(0.0856, 0.054, 0.0008, 0.0032), M.white(), 0, 0.0004, 0);
    decalUp(c, 0.0852, 0.0536, front, 0, 0.00085, 0);
    decalDown(c, 0.0852, 0.0536, back, 0, -0.00005, 0);
    // the badge reel with a clear strap, a little gold "#1" sticker on it
    const reel = grp(g, 0.01, 0, -0.045);
    add(reel, gCyl(0.016, 0.016, 0.008, 28), M.white(), 0, 0.004, -0.012);
    const stk = tmat('reel_sticker', 128, 128, (x, w, h) => {
      const gr = x.createRadialGradient(w * 0.4, h * 0.4, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, '#f7e08a'); gr.addColorStop(1, '#b8892c');
      x.fillStyle = gr; x.beginPath(); x.arc(w / 2, h / 2, w * 0.48, 0, TAU); x.fill();
      T(x, '#1', w / 2, h * 0.64, { size: 54, font: F.heavy, weight: '900', color: '#6a4a12', align: 'center' });
    }, { roughness: 0.3, metalness: 0.3, alphaTest: 0.5 });
    add(reel, gCircle(0.012, 24), stk, 0, 0.0082, -0.012, { rx: -90, cast: false });
    add(reel, gBox(0.009, 0.0006, 0.022), M.clear(), 0, 0.001, 0.008, { cast: false });
    add(reel, gBox(0.012, 0.0012, 0.004), M.chrome(), 0, 0.0012, 0.019);
    return g;
  };

  // ---- GATE KEY: a heavy steel key, a second small key, a yellow industrial tag -------------------------------------
  MODELS.gate_key = () => {
    const g = new THREE.Group(); g.name = 'item:gate_key';
    const k = key(g, 'gate', { len: 0.046, blade: 0.01, bowR: 0.013, holeR: 0.0036, square: true, cuts: [0.004, 0.0015, 0.0045, 0.002, 0.0035, 0.001, 0.003] }, M.steel());
    k.g.position.set(0.04, 0, 0.004);
    const k2 = key(g, 'gate2', { len: 0.026, blade: 0.007, bowR: 0.009, holeR: 0.0026, cuts: [0.002, 0.003, 0.001, 0.0025] }, M.brass());
    k2.g.position.set(0.0176, 0.0021, -0.0205); k2.g.rotation.y = R(28);
    ringAt(g, -0.007, 0.004, 0.019, 0.0017, 5);
    const tg = grp(g, -0.05, 0, 0.01, { ry: -12 });
    add(tg, gSlab(0.07, 0.032, 0.003, 0.004, 0.0005), mat('tag_yellow', { color: '#e5bd18', roughness: 0.45 }), 0, 0.0015, 0);
    add(tg, gCyl(0.003, 0.003, 0.0034, 12), mat('tag_hole_dk', { color: '#2a2408' }), 0.029, 0.0015, 0, { cast: false });
    const tex = tmat('tag_gate', 384, 176, (x, w, h, r) => {
      x.fillStyle = '#e5bd18'; x.fillRect(0, 0, w, h);
      T(x, 'BOOM GATE', w * 0.45, h * 0.42, { size: 44, font: F.heavy, weight: '900', color: '#141414', align: 'center' });
      T(x, '— EAST —', w * 0.45, h * 0.66, { size: 28, font: F.sans, weight: 'bold', color: '#141414', align: 'center', spacing: 3 });
      T(x, 'RETURN TO SECURITY', w * 0.45, h * 0.86, { size: 16, font: F.sans, color: '#3a3208', align: 'center', spacing: 2 });
      scratches(x, w, h, r, 30, '#fff4c0', 0.3, 40); age(x, w, h, r, 0.6);
    }, { roughness: 0.5 });
    decalUp(tg, 0.058, 0.0265, tex, -0.004, 0.00305, 0);
    return g;
  };

  // ---- QUEUE TICKET: a thermal ticket from the Care Centre machine ----------------------------------------------------
  MODELS.ticket = () => {
    const g = new THREE.Group(); g.name = 'item:ticket';
    const tex = tmat('queue_ticket', 256, 448, (x, w, h, r) => {
      x.fillStyle = '#f1efe8'; x.fillRect(0, 0, w, h);
      // torn serrated top edge (alpha)
      x.globalCompositeOperation = 'destination-out';
      x.beginPath(); x.moveTo(0, 0); for (let xx = 0; xx <= w; xx += 12) x.lineTo(xx, (xx / 12) % 2 ? 10 : 2); x.lineTo(w, 0); x.closePath(); x.fill();
      x.globalCompositeOperation = 'source-over';
      const ink = '#2c2c2e';
      T(x, 'CUSTOMER CARE CENTRE', w / 2, 52, { size: 18, font: F.mono, weight: 'bold', color: ink, align: 'center' });
      T(x, 'Please take a seat.', w / 2, 80, { size: 16, font: F.mono, color: ink, align: 'center' });
      x.fillStyle = ink; for (let xx = 16; xx < w - 16; xx += 8) x.fillRect(xx, 100, 4, 2);
      T(x, 'You are number', w / 2, 150, { size: 22, font: F.mono, color: ink, align: 'center' });
      T(x, '4,112.', w / 2, 238, { size: 76, font: F.mono, weight: 'bold', color: '#161618', align: 'center' });
      for (let xx = 16; xx < w - 16; xx += 8) x.fillRect(xx, 272, 4, 2);
      T(x, 'Customers ahead: 4,111', w / 2, 306, { size: 15, font: F.mono, color: ink, align: 'center' });
      T(x, 'Estimated wait: --:--', w / 2, 330, { size: 15, font: F.mono, color: ink, align: 'center' });
      T(x, '--/--/----  --:--', w / 2, 366, { size: 15, font: F.mono, color: ink, align: 'center' });
      T(x, 'Thank you for your patience.', w / 2, 410, { size: 13, font: F.mono, color: ink, align: 'center' });
      // thermal fade
      for (let i = 0; i < 6; i++) { const gr = x.createRadialGradient(r() * w, r() * h, 2, r() * w, r() * h, 40 + r() * 60); gr.addColorStop(0, 'rgba(241,239,232,0.55)'); gr.addColorStop(1, 'rgba(241,239,232,0)'); x.fillStyle = gr; x.fillRect(0, 12, w, h); }
    }, { roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide });
    const curl = (x, z) => 0.0012 + Math.max(0, z - 0.02) ** 2 * 2.6 + Math.abs(x) ** 2 * 0.6;
    add(g, gGrid('ticket', -0.029, -0.05, 0.029, 0.05, 6, 12, curl), tex);
    return g;
  };

  // ---- TOP PERFORMER PIN: one of Chloe's gold pins; "enough?" scratched into the back --------------------------------
  MODELS.chloe_pin = () => {
    const g = new THREE.Group(); g.name = 'item:chloe_pin';
    const p = grp(g, 0, 0.0085, 0);
    const front = tmat('pin_front', 256, 256, (x, w, h, r) => {
      const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f3d67a'); gr.addColorStop(0.45, '#d0a23c'); gr.addColorStop(1, '#a97a22'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { x.strokeStyle = r() < 0.5 ? 'rgba(255,245,200,0.12)' : 'rgba(90,60,10,0.1)'; x.lineWidth = 1; x.beginPath(); x.arc(w / 2, h / 2, 10 + r() * w * 0.45, r() * TAU, r() * TAU + 0.4); x.stroke(); }
      x.fillStyle = BR.teal; x.beginPath(); x.arc(w / 2, h / 2, w * 0.34, 0, TAU); x.fill();
      x.strokeStyle = '#8a6418'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, h / 2, w * 0.34, 0, TAU); x.stroke();
      // lettering round the rim
      const s = 'TOP PERFORMER  ·  TOP PERFORMER  ·  ';
      x.font = `bold ${w * 0.075}px ${F.sans}`; x.fillStyle = '#6a4a12'; x.textAlign = 'center';
      [...s].forEach((ch, i) => { const a = -Math.PI / 2 + (i / s.length) * TAU; x.save(); x.translate(w / 2 + Math.cos(a) * w * 0.41, h / 2 + Math.sin(a) * w * 0.41); x.rotate(a + Math.PI / 2); x.fillText(ch, 0, 0); x.restore(); });
      T(x, 'AUG 2026', w / 2, h * 0.76, { size: 20, font: F.sans, weight: 'bold', color: '#e8f8f6', align: 'center', spacing: 1 });
    }, { roughness: 0.25, metalness: 0.45 });
    const back = tmat('pin_back', 256, 256, (x, w, h, r) => {
      const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e1c064'); gr.addColorStop(1, '#a57b26'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { x.strokeStyle = 'rgba(80,55,10,0.12)'; x.lineWidth = 1; x.beginPath(); const yy = r() * h; x.moveTo(0, yy); x.lineTo(w, yy + (r() - 0.5) * 6); x.stroke(); }
      // "enough?", scratched in with a key: pale bright scratches over dark gouges
      HW(x, 'enough?', w * 0.13, h * 0.37, { size: 50, color: 'rgba(60,38,6,0.95)', wobble: 2.2, seed: 11, weight: 'bold' });
      HW(x, 'enough?', w * 0.13 - 1.8, h * 0.37 - 1.8, { size: 50, color: 'rgba(255,244,200,0.9)', wobble: 2.2, seed: 11 });
      T(x, 'MADE IN CHINA', w / 2, h * 0.86, { size: 14, font: F.sans, color: 'rgba(90,60,12,0.6)', align: 'center' });
    }, { roughness: 0.3, metalness: 0.45 });
    add(p, gCyl(0.0125, 0.0125, 0.0022, 36), M.gold());
    add(p, gTor(0.0125, 0.0009, 6, 40), M.gold(), 0, 0.0011, 0, { rx: 90 });
    add(p, gCircle(0.0123, 36), front, 0, 0.00115, 0, { rx: -90, cast: false });
    add(p, gCircle(0.0123, 36), back, 0, -0.00115, 0, { rx: 90, cast: false });
    const star = () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? 0.0023 : 0.0056; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } s.closePath(); return s; };
    add(p, gExt('pinstar', star, 0.0006, { bevel: 0.0003, flat: true }), M.gold(), 0, 0.0016, 0.0008);
    // post and butterfly clutch
    add(p, gCyl(0.0007, 0.0007, 0.008, 8), M.gold(), 0, -0.005, 0);
    add(p, gBox(0.009, 0.0012, 0.005), M.gold(), 0, -0.0078, 0);
    for (const s of [-1, 1]) add(p, gCyl(0.0016, 0.0016, 0.005, 10), M.gold(), s * 0.0045, -0.0072, 0, { rx: 90 });
    return g;
  };

  // ---- ALARM PENDANT (NEW): a new pendant in its open box, "TESTED" and three ticks in Aidan's writing ---------------
  MODELS.new_pendant = () => {
    const g = new THREE.Group(); g.name = 'item:new_pendant';
    const boxTex = tmat('np_box', 512, 256, (x, w, h, r) => {
      x.fillStyle = '#f6f6f2'; x.fillRect(0, 0, w, h);
      x.fillStyle = BR.teal; x.fillRect(0, h * 0.78, w, h * 0.22);
      T(x, 'PERSONAL ALARM PENDANT', w * 0.05, h * 0.3, { size: 32, font: F.sans, weight: 'bold', color: BR.ink });
      T(x, 'Works with your home phone service', w * 0.05, h * 0.45, { size: 22, font: F.sans, color: '#444' });
      // Aidan's sticker
      x.save(); x.translate(w * 0.64, h * 0.5); x.rotate(-0.05);
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w * 0.32, h * 0.26); x.strokeStyle = '#aaa'; x.lineWidth = 1.5; x.strokeRect(0, 0, w * 0.32, h * 0.26);
      HW(x, 'TESTED', w * 0.02, h * 0.15, { size: 34, color: '#1f2c6e' });
      for (let i = 0; i < 3; i++) tick(x, w * 0.2 + i * 18, h * 0.11, 16, '#1f2c6e', 3);
      x.restore();
      age(x, w, h, r, 0.2);
    }, { roughness: 0.55 });
    const card = mat('np_card', { color: '#f3f3ef', roughness: 0.6 });
    const W = 0.11, D = 0.085, Hh = 0.034;
    // the tray: floor, four walls (front wall printed)
    add(g, gBox(W, 0.002, D), card, 0, 0.001, 0);
    add(g, gBox(W, Hh, 0.002), card, 0, Hh / 2, -D / 2);
    for (const s of [-1, 1]) add(g, gBox(0.002, Hh, D), card, s * W / 2, Hh / 2, 0);
    add(g, gBox(W, Hh, 0.002), [card, card, card, card, boxTex, card], 0, Hh / 2, D / 2);
    // foam insert and the new pendant sitting in it, a neat coil of cord
    add(g, gBox(W - 0.004, 0.02, D - 0.004), mat('np_foam', { color: '#3a3d40', roughness: 0.95 }), 0, 0.011, 0);
    const pn = grp(g, -0.018, 0.02, 0.004);
    pendantBody(pn, 'np', { color: '#f4f3ee', led: '#39e07a' });
    add(g, gTor(0.014, 0.0016, 5, 28), mat('np_cord', { color: '#243152', roughness: 0.8 }), 0.03, 0.0215, 0.006, { rx: 90 });
    add(g, gTor(0.011, 0.0016, 5, 28), mat('np_cord'), 0.03, 0.0232, 0.006, { rx: 90 });
    // the lid, open, a folded instruction leaflet inside it
    const lid = grp(g, 0, Hh, -D / 2, { rx: -104 });
    add(lid, gBox(W + 0.003, 0.003, D + 0.002), card, 0, 0.0015, D / 2);
    const leaflet = tmat('np_leaflet', 256, 192, (x, w, h, r) => {
      x.fillStyle = '#fbfbf7'; x.fillRect(0, 0, w, h);
      T(x, 'QUICK START', w * 0.08, h * 0.18, { size: 20, font: F.sans, weight: 'bold', color: BR.tealDark });
      ['1. Press & hold 3 sec to call for help.', '2. Test monthly.', '3. Keep the base plugged in.'].forEach((s, i) => T(x, s, w * 0.08, h * (0.38 + i * 0.16), { size: 13, font: F.sans, color: '#333' }));
      age(x, w, h, r, 0.15);
    }, { roughness: 0.7 });
    add(lid, gPlane(0.08, 0.06), leaflet, 0, -0.0005, D / 2, { rx: 90, cast: false });
    return g;
  };

  // ---- Maps: folded paper maps and laminated sheets; the Outage receipt maps curl ------------------------------------
  // cover(x,w,h,r) draws the front; plan(x,w,h,r) the inside (thin ink linework)
  const planLines = (x, w, h, r, o = {}) => {
    x.strokeStyle = o.ink || '#3a3a36'; x.lineWidth = o.lw || 2; x.fillStyle = o.fill || 'rgba(0,0,0,0)';
    const n = o.n || 14;
    for (let i = 0; i < n; i++) { const bw = w * (0.08 + r() * 0.2), bh = h * (0.06 + r() * 0.18), bx = w * 0.05 + r() * (w * 0.9 - bw), by = h * 0.12 + r() * (h * 0.8 - bh); if (o.fill) x.fillRect(bx, by, bw, bh); x.strokeRect(bx, by, bw, bh); }
    if (o.roads) { x.lineWidth = o.roadW || 8; x.strokeStyle = o.road || 'rgba(80,80,74,0.55)'; for (let i = 0; i < o.roads; i++) { x.beginPath(); const y0 = h * (0.2 + r() * 0.6); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + (r() - 0.5) * h * 0.4, w * 0.6, y0 + (r() - 0.5) * h * 0.4, w, y0 + (r() - 0.5) * h * 0.3); x.stroke(); } }
  };
  const MAPSTYLE = {
    map_town: {
      kind: 'folded', pw: 0.11, ph: 0.21, n: 6,
      cover: (x, w, h, r) => {
        paper(x, w, h, r, '#efe6cf', 0.6);
        x.fillStyle = '#6a8a6a'; x.beginPath(); x.moveTo(0, h * 0.72); x.bezierCurveTo(w * 0.3, h * 0.42, w * 0.6, h * 0.38, w, h * 0.6); x.lineTo(w, h); x.lineTo(0, h); x.fill();
        x.fillStyle = '#8fa98a'; x.beginPath(); x.moveTo(0, h * 0.82); x.bezierCurveTo(w * 0.4, h * 0.66, w * 0.7, h * 0.7, w, h * 0.78); x.lineTo(w, h); x.lineTo(0, h); x.fill();
        x.strokeStyle = '#4b4b48'; x.lineWidth = 3; x.beginPath(); x.moveTo(w * 0.52, h * 0.42); x.lineTo(w * 0.52, h * 0.3); x.stroke();
        x.fillStyle = '#c0261d'; x.beginPath(); x.arc(w * 0.52, h * 0.295, 4, 0, TAU); x.fill();
        for (let i = 0; i < 9; i++) { x.fillStyle = r() < 0.5 ? '#d9cfb5' : '#b8a888'; x.fillRect(w * (0.15 + r() * 0.7), h * (0.66 + r() * 0.12), 10, 8); }
        T(x, 'SIGNAL HILL', w / 2, h * 0.14, { size: 40, font: F.serif, weight: 'bold', color: '#2b3a2e', align: 'center', spacing: 3 });
        T(x, 'VISITOR MAP', w / 2, h * 0.2, { size: 24, font: F.serif, color: '#2b3a2e', align: 'center', spacing: 6 });
        T(x, '— 1994 —', w / 2, h * 0.25, { size: 18, font: F.serif, color: '#5a5a50', align: 'center' });
        T(x, 'Signal Hill Tourist Association', w / 2, h * 0.95, { size: 13, font: F.serif, color: '#f4efe0', align: 'center' });
      },
      plan: (x, w, h, r) => {
        paper(x, w, h, r, '#efe6cf', 0.5);
        planLines(x, w, h, r, { n: 18, roads: 4, road: 'rgba(200,170,110,0.9)', roadW: 10, ink: '#6b5a3a', lw: 1.5 });
        x.fillStyle = '#c0261d'; x.beginPath(); x.arc(w * 0.2, h * 0.84, 16, 0, TAU); x.fill();
        T(x, 'YOU ARE', w * 0.2, h * 0.84 - 1, { size: 9, font: F.sans, weight: 'bold', color: '#fff', align: 'center' });
        T(x, 'HERE', w * 0.2, h * 0.84 + 9, { size: 9, font: F.sans, weight: 'bold', color: '#fff', align: 'center' });
        T(x, 'RELAY ST', w * 0.55, h * 0.52, { size: 14, font: F.serif, color: '#5a4a2a', align: 'center', spacing: 2 });
      },
    },
    map_plaza: {
      kind: 'folded', pw: 0.1, ph: 0.21, n: 3, gloss: true,
      cover: (x, w, h, r) => {
        x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#1d7f86'; x.fillRect(0, 0, w, h * 0.42);
        x.fillStyle = '#e8b62a'; x.fillRect(0, h * 0.42, w, h * 0.02);
        x.strokeStyle = '#f4f3ee'; x.lineWidth = 6; rrPath(x, w * 0.3, h * 0.12, w * 0.4, h * 0.2, 10); x.stroke();
        x.beginPath(); x.arc(w * 0.5, h * 0.12, w * 0.08, Math.PI, TAU); x.stroke();
        T(x, 'SIGNAL HILL', w / 2, h * 0.53, { size: 34, font: F.sans, weight: 'bold', color: '#1d4f56', align: 'center', spacing: 2 });
        T(x, 'PLAZA', w / 2, h * 0.61, { size: 50, font: F.heavy, weight: '900', color: '#1d7f86', align: 'center', spacing: 4 });
        T(x, 'DIRECTORY', w / 2, h * 0.69, { size: 24, font: F.sans, color: '#444', align: 'center', spacing: 6 });
        T(x, 'Over 30 specialty stores · Open 7 days', w / 2, h * 0.9, { size: 13, font: F.sans, color: '#666', align: 'center' });
        age(x, w, h, r, 0.4);
      },
      plan: (x, w, h, r) => {
        x.fillStyle = '#f6f5f0'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#d7ecec'; x.fillRect(w * 0.05, h * 0.42, w * 0.9, h * 0.14);
        planLines(x, w, h, r, { n: 16, ink: '#1d7f86', lw: 2, fill: 'rgba(29,127,134,0.08)' });
        for (let i = 0; i < 14; i++) T(x, String(i + 1), w * (0.1 + (i % 7) * 0.13), h * (0.3 + Math.floor(i / 7) * 0.4), { size: 14, font: F.sans, weight: 'bold', color: '#1d4f56' });
        age(x, w, h, r, 0.3);
      },
    },
    map_village: {
      kind: 'folded', pw: 0.105, ph: 0.148, n: 2, tape: true,
      cover: (x, w, h, r) => {
        paper(x, w, h, r, '#ecebe6', 0.4);
        speck(x, w, h, r, 1400, '#2a2a2a', 0.18, 1.3);
        T(x, 'HILLTOP VILLAGE', w / 2, h * 0.1, { size: 30, font: F.sans, weight: 'bold', color: '#2a2a2a', align: 'center', spacing: 2 });
        T(x, 'SITE PLAN — Independent Living', w / 2, h * 0.15, { size: 16, font: F.sans, color: '#3a3a3a', align: 'center' });
        x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; x.beginPath(); x.ellipse(w / 2, h * 0.55, w * 0.34, h * 0.28, 0, 0, TAU); x.stroke();
        x.lineWidth = 2; x.strokeRect(w * 0.36, h * 0.47, w * 0.28, h * 0.16); T(x, 'HALL', w / 2, h * 0.56, { size: 14, font: F.sans, color: '#2a2a2a', align: 'center' });
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + Math.PI / 2, cx = w / 2 + Math.cos(a) * w * 0.43, cy = h * 0.55 + Math.sin(a) * h * 0.36; x.strokeRect(cx - 12, cy - 9, 24, 18); T(x, String(i + 1), cx, cy + 5, { size: 12, font: F.sans, color: '#2a2a2a', align: 'center' }); }
        HW(x, 'Office →', w * 0.08, h * 0.95, { size: 18, color: '#1f2c6e' });
      },
      plan: (x, w, h, r) => { paper(x, w, h, r, '#ecebe6', 0.4); speck(x, w, h, r, 1000, '#2a2a2a', 0.15, 1.3); planLines(x, w, h, r, { n: 10, ink: '#2a2a2a', lw: 2 }); },
    },
    map_exchange: {
      kind: 'sheet', w: 0.21, h: 0.148, gloss: true, holes: 'corners',
      cover: (x, w, h, r) => {
        x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#1f7a3e'; x.fillRect(0, 0, w, h * 0.14);
        T(x, 'FIRE EVACUATION PLAN', w / 2, h * 0.1, { size: 34, font: F.heavy, weight: '900', color: '#ffffff', align: 'center', spacing: 2 });
        T(x, 'SIGNAL HILL TRUNK EXCHANGE — GROUND FLOOR & BASEMENT', w / 2, h * 0.2, { size: 15, font: F.sans, weight: 'bold', color: '#333', align: 'center' });
        x.strokeStyle = '#333'; x.lineWidth = 3; x.strokeRect(w * 0.06, h * 0.26, w * 0.66, h * 0.66);
        for (let i = 0; i < 5; i++) { x.lineWidth = 1.5; x.strokeRect(w * 0.12, h * (0.34 + i * 0.09), w * 0.46, h * 0.04); }
        x.strokeStyle = '#1f7a3e'; x.lineWidth = 5; x.beginPath(); x.moveTo(w * 0.62, h * 0.4); x.lineTo(w * 0.66, h * 0.86); x.lineTo(w * 0.72, h * 0.86); x.stroke();
        x.fillStyle = '#1f7a3e'; x.beginPath(); x.moveTo(w * 0.75, h * 0.86); x.lineTo(w * 0.71, h * 0.83); x.lineTo(w * 0.71, h * 0.89); x.fill();
        x.fillStyle = '#c0261d'; x.beginPath(); x.arc(w * 0.64, h * 0.8, 8, 0, TAU); x.fill();
        T(x, 'YOU ARE HERE', w * 0.86, h * 0.36, { size: 14, font: F.sans, weight: 'bold', color: '#c0261d', align: 'center' });
        x.fillStyle = '#1f7a3e'; x.fillRect(w * 0.76, h * 0.5, w * 0.2, h * 0.2);
        T(x, 'ASSEMBLY', w * 0.86, h * 0.59, { size: 14, font: F.sans, weight: 'bold', color: '#fff', align: 'center' });
        T(x, 'FORECOURT', w * 0.86, h * 0.66, { size: 13, font: F.sans, color: '#fff', align: 'center' });
        age(x, w, h, r, 0.6, { sun: 0.1 });
      },
    },
    map_care: {
      kind: 'folded', pw: 0.148, ph: 0.21, n: 2, staple: true,
      cover: (x, w, h, r) => {
        paper(x, w, h, r, '#f3f2ee', 0.25);
        x.strokeStyle = 'rgba(70,110,160,0.22)'; x.lineWidth = 1; for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let i = 0; i < h; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
        T(x, 'CUSTOMER CARE CENTRE', w / 2, h * 0.1, { size: 30, font: F.sans, weight: 'bold', color: '#1b3a5a', align: 'center' });
        T(x, 'FLOOR PLAN — LEVEL 1', w / 2, h * 0.16, { size: 18, font: F.sans, color: '#1b3a5a', align: 'center', spacing: 3 });
        x.strokeStyle = '#1b3a5a'; x.lineWidth = 2;
        for (let row = 0; row < 8; row++) for (let c = 0; c < 9; c++) x.strokeRect(w * (0.1 + c * 0.09), h * (0.24 + row * 0.07), w * 0.07, h * 0.045);
        x.strokeRect(w * 0.08, h * 0.82, w * 0.4, h * 0.12); T(x, 'LOBBY', w * 0.28, h * 0.89, { size: 16, font: F.sans, color: '#1b3a5a', align: 'center' });
        age(x, w, h, r, 0.3);
      },
      plan: (x, w, h, r) => { paper(x, w, h, r, '#f3f2ee', 0.25); planLines(x, w, h, r, { n: 12, ink: '#1b3a5a', lw: 1.5 }); },
    },
    map_office: {
      kind: 'folded', pw: 0.1, ph: 0.21, n: 3, gloss: true,
      cover: (x, w, h, r) => {
        const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e3f4a'); gr.addColorStop(1, '#0a2a30'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
        x.fillStyle = '#86b9c0'; for (let i = 0; i < 10; i++) for (let c = 0; c < 5; c++) { x.globalAlpha = i === 6 ? 0.95 : 0.25; x.fillRect(w * (0.3 + c * 0.08), h * (0.12 + i * 0.045), w * 0.06, h * 0.035); }
        x.globalAlpha = 1;
        Tex.drawWordmark(x, w * 0.1, h * 0.7, h * 0.05, { color: BR.yellow });
        T(x, 'REGIONAL OFFICE', w / 2, h * 0.8, { size: 30, font: F.sans, weight: 'bold', color: '#e8f4f4', align: 'center', spacing: 2 });
        T(x, 'BUILDING DIRECTORY', w / 2, h * 0.86, { size: 18, font: F.sans, color: '#9fd0d4', align: 'center', spacing: 4 });
        T(x, 'Excellence Every Day', w / 2, h * 0.94, { size: 14, font: F.serif, color: '#9fd0d4', align: 'center' });
      },
      plan: (x, w, h, r) => {
        x.fillStyle = '#f2f5f5'; x.fillRect(0, 0, w, h);
        ['L10', 'L9', 'L8', 'L7', 'L6', 'L5', 'L4 — Retail Region', 'L3', 'L2 — Atrium', 'G — Lobby'].forEach((s, i) => { T(x, s, w * 0.1, h * (0.1 + i * 0.085), { size: 17, font: F.sans, weight: i === 6 ? 'bold' : '', color: '#0e3f4a' }); x.fillStyle = 'rgba(14,63,74,0.2)'; x.fillRect(w * 0.1, h * (0.12 + i * 0.085), w * 0.8, 1); });
      },
    },
    map_office_upper: {
      kind: 'sheet', w: 0.21, h: 0.148, gloss: true, holes: 'top',
      cover: (x, w, h, r) => {
        x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, h * 0.15);
        T(x, 'FIRE STAIRS PLAN — LEVELS 5 & 6', w / 2, h * 0.1, { size: 28, font: F.heavy, weight: '900', color: '#ffffff', align: 'center' });
        for (const [lx, lab] of [[0.06, 'LEVEL 5'], [0.53, 'LEVEL 6']]) {
          T(x, lab, w * (lx + 0.2), h * 0.24, { size: 16, font: F.sans, weight: 'bold', color: '#333', align: 'center', spacing: 2 });
          x.strokeStyle = '#333'; x.lineWidth = 2.5; x.strokeRect(w * lx, h * 0.28, w * 0.41, h * 0.6);
          x.lineWidth = 1; x.setLineDash([6, 5]); for (let i = 0; i < 4; i++) x.strokeRect(w * (lx + 0.03 + (i % 2) * 0.19), h * (0.33 + Math.floor(i / 2) * 0.27), w * 0.16, h * 0.22); x.setLineDash([]);
          x.fillStyle = '#b3261e'; x.fillRect(w * (lx + 0.01), h * 0.8, w * 0.06, h * 0.07); T(x, 'B', w * (lx + 0.04), h * 0.855, { size: 14, font: F.sans, weight: 'bold', color: '#fff', align: 'center' });
        }
        age(x, w, h, r, 0.4);
      },
    },
    map_hospital: {
      kind: 'folded', pw: 0.1, ph: 0.21, n: 3, gloss: true,
      cover: (x, w, h, r) => {
        x.fillStyle = '#f5f7f8'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#23508a'; x.fillRect(0, 0, w, h * 0.34);
        x.fillStyle = '#ffffff'; rrPath(x, w * 0.38, h * 0.06, w * 0.24, h * 0.2, 10); x.fill();
        T(x, 'H', w / 2, h * 0.225, { size: 60, font: F.heavy, weight: '900', color: '#23508a', align: 'center' });
        T(x, 'SIGNAL HILL', w / 2, h * 0.45, { size: 30, font: F.sans, weight: 'bold', color: '#23508a', align: 'center', spacing: 2 });
        T(x, 'DISTRICT HOSPITAL', w / 2, h * 0.51, { size: 24, font: F.sans, weight: 'bold', color: '#23508a', align: 'center' });
        T(x, 'VISITOR DIRECTORY', w / 2, h * 0.6, { size: 18, font: F.sans, color: '#555', align: 'center', spacing: 4 });
        T(x, 'Visiting hours 10 am – 8 pm', w / 2, h * 0.9, { size: 14, font: F.sans, color: '#666', align: 'center' });
        age(x, w, h, r, 0.35);
      },
      plan: (x, w, h, r) => {
        x.fillStyle = '#f5f7f8'; x.fillRect(0, 0, w, h);
        ['Reception', 'Waiting Room', 'Ward 1 — Medical', 'Ward 2 — Surgical', 'Ward 3 — Orthopaedics', 'Radiology', 'Café'].forEach((s, i) => T(x, s, w * 0.1, h * (0.12 + i * 0.07), { size: 16, font: F.sans, weight: i === 4 ? 'bold' : '', color: '#23508a' }));
        planLines(x, w, h, r, { n: 6, ink: '#23508a', lw: 1.5 });
      },
    },
    map_mast: {
      kind: 'sheet', w: 0.21, h: 0.148, gloss: true, holes: 'ties',
      cover: (x, w, h, r) => {
        x.fillStyle = '#f2efe4'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#e8c21a'; x.fillRect(0, 0, w, h * 0.06);
        for (let i = -h; i < w; i += 24) { x.fillStyle = '#1a1a1a'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 12, 0); x.lineTo(i + 12 + h * 0.06, h * 0.06); x.lineTo(i + h * 0.06, h * 0.06); x.fill(); }
        T(x, 'MAST COMPOUND — SITE DIAGRAM', w / 2, h * 0.15, { size: 24, font: F.heavy, weight: '900', color: '#1a1a1a', align: 'center' });
        x.fillStyle = '#e8c21a'; x.fillRect(w * 0.62, h * 0.2, w * 0.34, h * 0.12);
        T(x, 'DANGER — RF RADIATION', w * 0.79, h * 0.28, { size: 13, font: F.sans, weight: 'bold', color: '#1a1a1a', align: 'center' });
        x.strokeStyle = '#333'; x.lineWidth = 2; x.setLineDash([8, 5]); x.strokeRect(w * 0.08, h * 0.36, w * 0.84, h * 0.56); x.setLineDash([]);
        x.strokeRect(w * 0.14, h * 0.44, w * 0.16, h * 0.14); T(x, 'HUT W', w * 0.22, h * 0.53, { size: 12, font: F.sans, color: '#333', align: 'center' });
        x.strokeRect(w * 0.7, h * 0.44, w * 0.16, h * 0.14); T(x, 'HUT E', w * 0.78, h * 0.53, { size: 12, font: F.sans, color: '#333', align: 'center' });
        x.beginPath(); x.moveTo(w * 0.5, h * 0.48); x.lineTo(w * 0.44, h * 0.8); x.lineTo(w * 0.56, h * 0.8); x.closePath(); x.stroke();
        T(x, 'MAST', w * 0.5, h * 0.86, { size: 13, font: F.sans, weight: 'bold', color: '#333', align: 'center' });
        T(x, 'GATE', w * 0.5, h * 0.965, { size: 12, font: F.sans, weight: 'bold', color: '#333', align: 'center' });
        age(x, w, h, r, 0.8, { sun: 0.15 });
      },
    },
  };
  function mapModel(id) {
    const st = MAPSTYLE[id];
    const g = new THREE.Group(); g.name = 'item:' + id;
    const cover = tmat('map_cover_' + id, 512, Math.round(512 * (st.kind === 'sheet' ? st.h / st.w : st.ph / st.pw)), st.cover, { roughness: st.gloss ? 0.35 : 0.85, side: THREE.DoubleSide });
    if (st.kind === 'sheet') {
      // a laminated sheet off a wall: glossy, a slight curl, holes where it was fixed up
      const curl = (x, z) => 0.0014 + Math.max(0, Math.abs(z) - st.h * 0.3) ** 2 * 1.2 + Math.max(0, x - st.w * 0.3) ** 2 * 0.8;
      add(g, gGrid('sheet_' + id, -st.w / 2, -st.h / 2, st.w / 2, st.h / 2, 10, 8, curl), cover);
      const holes = st.holes === 'corners' ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : st.holes === 'top' ? [[-1, -1], [1, -1]] : [[-1, 0], [1, 0]];
      for (const [sx, sz] of holes) add(g, gCircle(0.0026, 12), mat('map_hole', { color: '#141414' }), sx * (st.w / 2 - 0.008), 0.0029, sz * (st.h / 2 - 0.008), { rx: -90, cast: false });
      if (st.holes === 'ties') for (const sx of [-1, 1]) add(g, gBox(0.0035, 0.0012, 0.03), mat('cable_tie', { color: '#e9e7de', roughness: 0.5 }), sx * (st.w / 2 - 0.008), 0.003, 0.012, { ry: sx * 20 });
      return g;
    }
    // folded: a stack of panels, the cover panel lifted a little off the inside print
    const plan = tmat('map_plan_' + id, 512, Math.round(512 * st.ph / st.pw), st.plan || st.cover, { roughness: st.gloss ? 0.4 : 0.85, side: THREE.DoubleSide });
    const th = Math.max(0.002, st.n * 0.00055);
    add(g, gBox(st.pw, th, st.ph), M.paperEdge(), 0, th / 2, 0);
    decalUp(g, st.pw * 0.995, st.ph * 0.995, plan, 0, th + 0.0003, 0);
    const lid = grp(g, -st.pw / 2, th + 0.0006, 0, { rz: 22 });
    add(lid, gPlane(st.pw, st.ph), cover, st.pw / 2, 0.0004, 0, { rx: -90, cast: false });
    add(lid, gPlane(st.pw, st.ph), plan, st.pw / 2, 0.0001, 0, { rx: 90, cast: false });
    // the fold along the lifted panel's hinge
    add(g, gCyl(0.0013, 0.0013, st.ph, 8), M.paperEdge(), -st.pw / 2, th * 0.6, 0, { rx: 90 });
    if (st.tape) for (const sz of [-1, 1]) add(g, gPlane(0.03, 0.012), mat('sellotape', { color: '#f3e7b0', roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false }), st.pw * 0.34, th + 0.0022, sz * (st.ph / 2 - 0.006), { rx: -90, rz: 35 * sz, cast: false });
    if (st.staple) add(g, gBox(0.012, 0.0008, 0.0014), M.chrome(), st.pw * 0.3, th + 0.001, -st.ph / 2 + 0.008, { cast: false });
    return g;
  }

  // receipt maps: a long thermal strip, flat at one end, curling up into a loose roll at the other
  const RMAP_AREAS = { rmap_plaza: 'SIGNAL HILL PLAZA', rmap_village: 'HILLTOP VILLAGE', rmap_exchange: 'TRUNK EXCHANGE', rmap_care: 'CUSTOMER CARE', rmap_office: 'REGIONAL OFFICE', rmap_mast: 'THE MAST' };
  function receiptModel(id) {
    const g = new THREE.Group(); g.name = 'item:' + id;
    const area = RMAP_AREAS[id] || 'SIGNAL HILL';
    const tex = tmat('rmap_' + id, 192, 1024, (x, w, h, r) => {
      x.fillStyle = '#eceae2'; x.fillRect(0, 0, w, h);
      const ink = 'rgba(60,60,62,0.85)';
      T(x, '*** RECEIPT ***', w / 2, 40, { size: 16, font: F.mono, weight: 'bold', color: ink, align: 'center' });
      T(x, area, w / 2, 66, { size: fitSize(x, area, w * 0.9, 16, F.mono, 'bold'), font: F.mono, weight: 'bold', color: ink, align: 'center' });
      T(x, '--/--/----  --:--', w / 2, 88, { size: 12, font: F.mono, color: ink, align: 'center' });
      for (let xx = 10; xx < w - 10; xx += 7) { x.fillStyle = ink; x.fillRect(xx, 100, 4, 2); }
      // the layout, in dotted thermal print
      x.strokeStyle = 'rgba(70,70,72,0.7)'; x.lineWidth = 2; x.setLineDash([3, 3]);
      for (let i = 0; i < 16; i++) { const bw = w * (0.15 + r() * 0.4), bh = 30 + r() * 90, bx = 10 + r() * (w - 20 - bw), by = 120 + r() * (h - 320); x.strokeRect(bx, by, bw, bh); }
      x.beginPath(); x.moveTo(w * 0.5, 120); for (let yy = 120; yy < h - 200; yy += 40) x.lineTo(w * (0.35 + r() * 0.3), yy); x.stroke(); x.setLineDash([]);
      // Aidan's notes in teal marker
      x.strokeStyle = '#1f8a82'; x.lineWidth = 4; x.beginPath(); x.arc(w * 0.6, h * 0.45, 22, 0, TAU); x.stroke();
      x.beginPath(); x.moveTo(w * 0.2, h * 0.3); x.lineTo(w * 0.36, h * 0.34); x.moveTo(w * 0.36, h * 0.3); x.lineTo(w * 0.2, h * 0.34); x.stroke();
      tick(x, w * 0.3, h * 0.62, 26, '#1f8a82', 4);
      HW(x, '?', w * 0.72, h * 0.2, { size: 40, color: '#1f8a82', font: F.marker, weight: 'bold' });
      for (let xx = 10; xx < w - 10; xx += 7) { x.fillStyle = ink; x.fillRect(xx, h - 150, 4, 2); }
      T(x, 'THANK YOU FOR', w / 2, h - 110, { size: 13, font: F.mono, color: ink, align: 'center' });
      T(x, 'YOUR PATIENCE', w / 2, h - 92, { size: 13, font: F.mono, color: ink, align: 'center' });
      for (let i = 0; i < 8; i++) { const gr = x.createRadialGradient(r() * w, r() * h, 2, r() * w, r() * h, 30 + r() * 70); gr.addColorStop(0, 'rgba(236,234,226,0.7)'); gr.addColorStop(1, 'rgba(236,234,226,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }
    }, { roughness: 0.55, side: THREE.DoubleSide });
    // centreline: 0.2 m flat, then a curl that winds up into a loose roll ~2 cm across
    const pts = [];
    const flat = 0.2, N = 60;
    for (let i = 0; i <= 12; i++) { const s = (i / 12) * flat; pts.push([-0.13 + s, 0.0012 + Math.sin(s * 30) * 0.0006 + (i === 0 ? 0.003 : 0)]); }
    let px = -0.13 + flat, py = 0.0012, a = 0;
    for (let i = 1; i <= N; i++) { const t = i / N, rad = 0.028 - t * 0.017, da = (Math.PI * 2.6) / N; a += da; px += Math.cos(a) * rad * da; py += Math.sin(a) * rad * da; pts.push([px, py]); }
    add(g, gRibbon('rmap', pts, 0.058), tex);
    return g;
  }

  // =================================================================================================================
  // Map ids are fixed by docs/CONTENT_PLAN §3 (21_maps.js defines them): paper maps are the base name ('plaza'),
  // receipt maps 'rmap_<base>' with kind:'receipt', of:'<base>'
  // =================================================================================================================

  // =================================================================================================================
  // ITEMS
  // =================================================================================================================
  const item = (def) => defineItem(def);

  // ---- healing (Script.builtins.useItem / the items screen use these amounts, difficulty-independent) -----------------
  item({ id: 'coffee', name: 'BREAK-ROOM COFFEE', cat: 'item', stack: true, heal: 25,
    desc: 'Lukewarm, too much sugar. It tastes like every break room I\'ve ever sat in.',
    details: [{ text: 'Somebody wrote SHAZ on it and crossed it out.', face: [-0.45, 0, 0.9], min: 0.7 }],
    model: MODELS.coffee });
  item({ id: 'energy_drink', name: 'ENERGY DRINK', cat: 'item', stack: true, heal: 50,
    desc: 'Sugar and something that tastes like a battery. We lived on these at close.',
    model: MODELS.energy_drink });
  item({ id: 'first_aid', name: 'FIRST AID KIT', cat: 'item', stack: true, heal: 100,
    desc: 'The store kit. Everything in it still in its wrapper.',
    details: [{ text: 'KIT CHECKED. Two ticks, then nobody.', face: [0, 1, 0] }],
    model: MODELS.first_aid });

  // ---- weapons (spec §4: box cutter 8 fast; steel bar 20 slow, 30% knockdown; extinguisher 12 slow bash + 6 sprays) --
  item({ id: 'box_cutter', name: 'BOX CUTTER', cat: 'weapon',
    desc: 'For opening stock. Every store has one of these.',
    weapon: { dmg: 8, speed: 'fast', range: 1.1, arc: 70, knock: 0 },
    details: [{ text: 'A snap-off blade. Three segments left.', face: [0, 1, 0] }],
    model: MODELS.box_cutter });
  item({ id: 'steel_bar', name: 'STEEL SECURITY BAR', cat: 'weapon',
    desc: 'Snapped off a demo table. Heavy.',
    weapon: { dmg: 20, speed: 'slow', range: 1.5, arc: 90, knock: 0.3 },
    details: [{ text: 'ASSET 0412-DT3. DO NOT REMOVE.', face: [0, 1, 0] }, { text: 'Two bolts still through the foot. Something tore it off the table.', face: [0, -1, 0] }],
    model: MODELS.steel_bar });
  item({ id: 'extinguisher', name: 'FIRE EXTINGUISHER', cat: 'weapon', ammo: 6,
    desc: 'Dry powder. Still charged. Heavy enough to swing.',
    weapon: { dmg: 12, speed: 'slow', range: 1.3, arc: 80, knock: 0, spray: true },
    details: [{ text: 'The service tag. Nineteen seventy-something. The last number\'s worn off.', face: [0, 0, 1], min: 0.85 }],
    model: MODELS.extinguisher });

  // ---- key items -----------------------------------------------------------------------------------------------------
  item({ id: 'returned_modem', name: 'RETURNED MODEM', cat: 'key',
    desc: 'Her modem, in the satchel she sent it back in.',
    details: [
      { text: 'The returns label. ACCT 4471-0932.', face: [0, 0, 1], min: 0.82 },
      { text: 'The note, in shaky biro: "You said it would work here."', face: [0, 1, 0], min: 0.82 },
    ],
    model: MODELS.returned_modem });
  item({ id: 'staff_key', name: 'STAFF ROOM KEY', cat: 'key',
    desc: 'A brass key on a red plastic tag.',
    details: [{ text: 'The tag says "Staff Rm — L1".', face: [0, 1, 0] }],
    model: MODELS.staff_key });
  item({ id: 'certificate', name: 'INDUCTION CERTIFICATE', cat: 'key',
    desc: 'My induction certificate. Somebody pinned it up and kept it.',
    get details() {
      return [lvl() === 'hard'
        ? { text: '"Aidan — Sales Induction — completed on the fourteenth of March."', face: [0, 1, 0] }
        : { text: '"Aidan — Sales Induction — completed 14/03/2026."', face: [0, 1, 0] }];
    },
    model: MODELS.certificate });
  item({ id: 'first_day_badge', name: 'FIRST-DAY BADGE', cat: 'key',
    desc: 'Day one. I thought I\'d be good at this.',
    details: [
      { text: '"AIDAN — HERE TO HELP!"', face: [0, 1, 0] },
      { text: 'The pin\'s bent. I stuck it through my thumb on day one.', face: [0, -1, 0] },
    ],
    model: MODELS.first_day_badge });
  item({ id: 'unit9_key', name: 'UNIT 9 KEY', cat: 'key', pickupName: 'Unit 9 key',
    desc: 'Her front door key. Somebody crocheted a flower for it.',
    details: [{ text: 'UNIT 9, in careful capitals.', face: [0, 1, 0] }],
    model: MODELS.unit9_key });
  item({ id: 'alarm_pendant', name: 'ALARM PENDANT', cat: 'key',
    desc: 'Press and hold for three seconds.',
    details: [
      { text: 'The button\'s worn shiny in the middle.', face: [0, 1, 0] },
      { text: 'On the back: "PRESS & HOLD 3 SEC".', face: [0, -1, 0] },
    ],
    model: MODELS.alarm_pendant });
  item({ id: 'jumper_tool', name: 'JUMPER TOOL', cat: 'key',
    desc: 'Wai\'s. For the frame. The handle\'s worn smooth.',
    details: [{ text: 'A W scratched into the handle. Worn pale where his thumb goes.', face: [0, 1, 0] }],
    model: MODELS.jumper_tool });
  item({ id: 'visitor_pass', name: 'VISITOR PASS', cat: 'key',
    desc: 'It printed my name like it was expecting me.',
    details: [{ text: '"AIDAN — VISITING: ESCALATIONS". Time in: --:--.', face: [0, 1, 0] }],
    model: MODELS.visitor_pass });
  item({ id: 'keycard', name: 'LEVEL 4 KEYCARD', cat: 'key',
    desc: 'Chloe\'s card. Level 4.',
    details: [
      { text: 'Her photo. The same smile she gives customers.', face: [0, 1, 0] },
      { text: '"IF FOUND, PLEASE RETURN TO LEVEL 4 RECEPTION."', face: [0, -1, 0] },
    ],
    model: MODELS.keycard });
  item({ id: 'gate_key', name: 'GATE KEY', cat: 'key',
    desc: 'The key to the boom gate on the business park\'s east side.',
    details: [{ text: 'BOOM GATE — EAST.', face: [0, 1, 0] }],
    model: MODELS.gate_key });
  item({ id: 'ticket', name: 'QUEUE TICKET', cat: 'key',
    desc: 'Four thousand one hundred and twelve.',
    details: [{ text: '"You are number 4,112." Estimated wait: --:--.', face: [0, 1, 0] }],
    model: MODELS.ticket });
  item({ id: 'chloe_pin', name: 'TOP PERFORMER PIN', cat: 'key', pickupName: 'Top Performer pin',
    desc: 'One of Chloe\'s. Lighter than it looks.',
    details: [
      { text: 'TOP PERFORMER. August.', face: [0, 1, 0] },
      { text: 'Scratched into the back with a key: "enough?"', face: [0, -1, 0] },
    ],
    model: MODELS.chloe_pin });
  item({ id: 'new_pendant', name: 'ALARM PENDANT (NEW)', cat: 'key', pickupName: 'new alarm pendant',
    desc: 'A new alarm pendant. Set up properly this time.',
    details: [{ text: 'TESTED. Three ticks. My writing.', face: [0, 0, 1], min: 0.75 }],
    model: MODELS.new_pendant });

  // ---- maps (the items screen's USE opens the map; picking one up sets S.maps[map]) --------------------------------------
  const paperMap = (id, base, name, desc) => item({ id, name, cat: 'map', desc, map: base, model: () => mapModel(id) });
  paperMap('map_town', 'town', 'SIGNAL HILL VISITOR MAP', 'Signal Hill, 1994. Nobody\'s printed a new one since.');
  paperMap('map_plaza', 'plaza', 'PLAZA DIRECTORY', 'Over thirty specialty stores. Most of them were already gone.');
  paperMap('map_village', 'village', 'HILLTOP VILLAGE SITE PLAN', 'A photocopy off the office wall. Twelve units round the loop.');
  paperMap('map_exchange', 'exchange', 'EXCHANGE FIRE EVACUATION PLAN', 'You are here. Assembly area: the forecourt.');
  paperMap('map_care', 'care', 'CARE CENTRE FLOOR PLAN', 'Eight rows of cubicles. Every one of them a phone.');
  paperMap('map_office', 'office', 'REGIONAL OFFICE DIRECTORY', 'Ten floors. Only one of them has its lights on.');
  paperMap('map_office_upper', 'office_upper', 'FIRE STAIRS PLAN, LEVELS 5 AND 6', 'Levels 5 and 6. Half of it says "under refurbishment".');
  paperMap('map_hospital', 'hospital', 'HOSPITAL DIRECTORY', 'Ward 3 — Orthopaedics.');
  paperMap('map_mast', 'mast', 'MAST COMPOUND DIAGRAM', 'The compound, the huts, the ladder. Cable-tied to the gate.');
  const receiptMap = (id, base, desc) => item({ id, name: 'RECEIPT MAP', cat: 'map', desc, map: 'rmap_' + base, model: () => receiptModel(id) });
  receiptMap('rmap_plaza', 'plaza', 'The Plaza, printed on a receipt. It won\'t stay flat.');
  receiptMap('rmap_village', 'village', 'The village on a receipt. The loop doesn\'t close where it should.');
  receiptMap('rmap_exchange', 'exchange', 'The exchange on a receipt. The ink\'s already fading.');
  receiptMap('rmap_care', 'care', 'The call centre on a receipt. The rows don\'t line up any more.');
  receiptMap('rmap_office', 'office', 'Level 4 on a receipt. Longer than the floor is.');
  receiptMap('rmap_mast', 'mast', 'The summit on a receipt. It just keeps printing.');
}
