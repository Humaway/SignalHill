// ==== data/12_ch2.js — Chapter 2 "Hilltop Village" (spec §9 Ch 2, §7A Hilltop Road, §7B Hilltop Village, §6 the Reach,
// §2A riddle row "Ch 2 lockbox", §8 Luka's call 2) — tag C2_ ====
// Rooms (CONTENT_PLAN §2):
//   c2_hilltoprd   Hilltop Road: 140 m climbing east from Relay Street's north end in two switchbacks (segments A, B, C
//                  and hairpins H1, H2), letterboxes over the drop, Route 44 stop 2 (the timetable), the lookout bench over
//                  the fog (H1), a Tethered standing at a letterbox, the village gate and its sign at the top (CALL luka2).
//                  bottom → c1_relay:north · top → c2_crescent:gate.
//   c2_crescent    The Crescent: the 60 × 40 m loop road round the island and the community hall; twelve identical units
//                  (1–3 south, 4–6 east, 7–9 north, 10–12 west), a modem box blinking red on every doorstep (Account Note 3
//                  and Returns Notes 10–12 inside four of them), the "Welcome Friends" gnome in the pansies, Tethered ×3
//                  waiting at doors, the Tethered watching from Unit 4's window (a through-the-glass camera), Unit 9's key
//                  lockbox (1947), the village office just inside the gate, the NE lane to the garages, the padlocked back
//                  gate (NW) onto Exchange Road. The Outage loop (2-5): the back gate returns Aidan to the front gate, more
//                  numbers read 9 each time (all twelve on the third), and any door reading 9 opens into Unit 9;
//                  Tethered ×4, the Reach from the second loop. After the pendant the back gate lets him out and the
//                  Outage lifts on the way up Exchange Road → G.startChapter(3).
//   c2_office      Village office + foyer: visitor book (Luke's entry, his sticky note per riddle level), noticeboard, the
//                  birthday card per riddle level, the Site Plan (map_village), first aid, coffee, the chapter's break
//                  table, the key cabinet, the foyer payphone. A camera through the office window from the gate.
//   c2_unit9       Hall (phone + answering machine "1"), lounge (phone socket, couch: the modem), kitchen (the fallen chair
//                  Aidan never looks at, the tea towel, the base station "NO LINE", the fridge list, the crossword),
//                  bedroom (the dresser photo, the sealed tablet), the bathroom door. In the Outage the kitchen doorway is a
//                  door into c2_kitchen_out.
//   c2_kitchen_out The swollen 20 × 20 m kitchen (Outage only): the chair on its side at the centre, the pendant glowing red.
//   c2_hall        The community hall: stage, bingo machine, stacked chairs, sticker04; the Unread + energy drink (Outage).
//   c2_garages     The lane behind units 7–9: six bays, Bay 4's roller door half up; the Outage starts as Aidan leaves.
//   c2_bay4        Chase's hiding place (2-3); a first aid kit in the Outage.
// Cutscenes: 2-1 "Unit 9", 2-2 "Are You From the Phone Company?", 2-3 "Legend". In-engine: the modem (ITEMS.returned_modem
//   .use / the socket), its restarts, the answering machine, the fridge list, the chase (enemy types c2_luke + c2_flank),
//   the Outage and the loop, the pendant (ITEMS.alarm_pendant.use), the way up.
// State: S.flags c2_modemIn, c2_chase (0 → 1 running → 2 under the door → 3 met Chase), c2_metChase, c2_loop, c2_loopN
//   (times out through the back gate), c2_loopBroken (CONTENT_PLAN). S.done c2:restarts, c2:machine, c2:fridge,
//   c2:lockbox, c2:book, c2:loop<n>, plus the engine's trig:/cs:/ex: keys.
{
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const FN = Tex.fonts;
  const riddle = () => (S.difficulty && S.difficulty.riddle) || 'normal';
  const docPick = (base) => (typeof DOC_pick === 'function' ? DOC_pick(base) : base);
  const flag = (k) => !!(S.flags && S.flags[k]);
  const loopN = () => ((S.flags && S.flags.c2_loopN) | 0);
  const inLoop = () => !!S.outage && flag('c2_loop') && !flag('c2_loopBroken');
  const chasing = () => ((S.flags && S.flags.c2_chase) | 0) === 1;
  const isPad = () => { try { return Input.lastDevice === 'gamepad'; } catch (e) { return false; } };
  // transient presentation state (never saved): fog pushes, the chase handles, looping room sounds
  const C2 = { fog: null, fogTo: null, lastCam: null, chaseWalls: [], tick: null, hum: null, pursuer: null };

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h, U.rng(U.hash('c2:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c2:' + key;
    TEXC.set(key, t);
    return t;
  }
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    if (o.spacing) {
      let cx = o.align === 'center' ? x - (ctx.measureText(s).width + o.spacing * (s.length - 1)) / 2 : x;
      ctx.textAlign = 'left';
      for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + o.spacing; }
    } else ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  const hand = (ctx, s, x, y, o) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };

  // enamel unit number plate ("UNIT" + the numeral); flip: the plate hangs upside down (a 6 reads 9)
  const plateTex = (n, flip = false) => ctex('plate|' + n + (flip ? 'f' : ''), 160, 200, (x, w, h, r) => {
    if (flip) { x.translate(w, h); x.rotate(Math.PI); }
    x.fillStyle = '#1d2323'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e6dfc9'; x.fillRect(7, 7, w - 14, h - 14);
    x.strokeStyle = '#1d2323'; x.lineWidth = 3; x.strokeRect(14, 14, w - 28, h - 28);
    tx(x, 'UNIT', w / 2, 46, 24, '#1d2323', { font: FN.serif, weight: 'bold', align: 'center', spacing: 3 });
    tx(x, String(n), w / 2, 168, n >= 10 ? 96 : 118, '#1d2323', { font: FN.serif, weight: 'bold', align: 'center' });
    for (const [a, b] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { x.fillStyle = '#8a8676'; x.beginPath(); x.arc(a, b, 4, 0, Math.PI * 2); x.fill(); }
    age(x, w, h, r, 0.9, { sun: 0.3 });
  });
  // the gate sign: "HILLTOP VILLAGE — Independent Living. Visitors please sign in."
  const gateSignTex = () => ctex('gatesign', 512, 256, (x, w, h, r) => {
    x.fillStyle = '#1f3a2e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#e7e0c8'; x.lineWidth = 5; x.strokeRect(10, 10, w - 20, h - 20);
    tx(x, 'HILLTOP VILLAGE', w / 2, 82, 44, '#efe8d0', { font: FN.serif, weight: 'bold', align: 'center', spacing: 2 });
    x.fillStyle = '#c9a84a'; x.fillRect(w / 2 - 150, 104, 300, 3);
    tx(x, 'Independent Living', w / 2, 150, 32, '#efe8d0', { font: FN.serif, align: 'center' });
    tx(x, 'Visitors please sign in.', w / 2, 206, 26, '#d8d0b4', { font: FN.serif, align: 'center' });
    // a leaf motif either side
    for (const s of [-1, 1]) { x.fillStyle = '#c9a84a'; x.beginPath(); x.ellipse(w / 2 + s * 205, 66, 18, 8, s * 0.6, 0, Math.PI * 2); x.fill(); }
    age(x, w, h, r, 1.1, { sun: 0.5 });
  });
  // the Site Plan pinned on the office wall (the map_village pickup)
  const sitePlanTex = () => ctex('siteplan', 384, 272, (x, w, h, r) => {
    x.fillStyle = '#ecebe4'; x.fillRect(0, 0, w, h);
    tx(x, 'HILLTOP VILLAGE — SITE PLAN', w / 2, 24, 16, '#262626', { font: FN.sans, weight: 'bold', align: 'center', spacing: 1 });
    tx(x, 'Independent Living · Please keep this plan on display', w / 2, 40, 10, '#444', { font: FN.sans, align: 'center' });
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 3;
    const cx = w / 2, cy = 150;
    x.beginPath(); x.ellipse(cx, cy, 120, 74, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(cx, cy, 86, 44, 0, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2; x.strokeRect(cx - 34, cy - 20, 68, 40); tx(x, 'HALL', cx, cy + 5, 12, '#2a2a2a', { font: FN.sans, align: 'center' });
    const units = [[-70, 92], [0, 92], [70, 92], [140, 60], [150, 0], [140, -60], [70, -92], [0, -92], [-70, -92], [-140, -60], [-150, 0], [-140, 60]];
    units.forEach(([ux, uy], i) => { x.strokeRect(cx + ux - 14, cy + uy - 10, 28, 20); tx(x, String(i + 1), cx + ux, cy + uy + 5, 12, '#2a2a2a', { font: FN.sans, weight: 'bold', align: 'center' }); });
    x.strokeRect(cx - 170, cy + 88, 40, 26); tx(x, 'OFFICE', cx - 150, cy + 105, 8, '#2a2a2a', { font: FN.sans, align: 'center' });
    tx(x, 'GATE', cx - 110, h - 8, 10, '#2a2a2a', { font: FN.sans, weight: 'bold', align: 'center' });
    for (let i = 0; i < 6; i++) x.strokeRect(cx - 90 + i * 30, cy - 136, 26, 16);
    tx(x, 'GARAGES', cx, cy - 140, 9, '#2a2a2a', { font: FN.sans, align: 'center' });
    tx(x, 'BACK GATE →', cx - 190, cy - 118, 9, '#2a2a2a', { font: FN.sans });
    tx(x, 'EXCHANGE RD', cx - 190, cy - 106, 8, '#555', { font: FN.sans });
    hand(x, 'bins out Mon night', 250, 250, { size: 13, color: '#1f2c6e' });
    age(x, w, h, r, 0.6, { sun: 0.4 });
  });
  // the birthday card pinned to the noticeboard (Easy/Normal: "Happy 79th"; Hard: the Route 44 depot riddle)
  const cardTex = (hard) => ctex('card' + (hard ? 'H' : ''), 256, 320, (x, w, h, r) => {
    x.fillStyle = '#f4ecd8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8b8c0'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(r() * w, r() * 90, 6 + r() * 10, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#6a8ac0'; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(r() * w, h - r() * 70, 5 + r() * 8, 0, Math.PI * 2); x.fill(); }
    if (!hard) { tx(x, 'Happy', w / 2, 118, 40, '#8a2a4a', { font: FN.serif, weight: 'bold', align: 'center' }); tx(x, '79th', w / 2, 176, 64, '#8a2a4a', { font: FN.serif, weight: 'bold', align: 'center' }); tx(x, 'BIRTHDAY', w / 2, 212, 26, '#8a2a4a', { font: FN.serif, align: 'center', spacing: 3 }); }
    else { tx(x, 'Happy', w / 2, 130, 44, '#8a2a4a', { font: FN.serif, weight: 'bold', align: 'center' }); tx(x, 'BIRTHDAY', w / 2, 176, 30, '#8a2a4a', { font: FN.serif, align: 'center', spacing: 3 }); }
    // a cake
    x.fillStyle = '#e8d8b0'; x.fillRect(w / 2 - 34, 236, 68, 26); x.fillStyle = '#c0506a'; x.fillRect(w / 2 - 34, 236, 68, 6);
    for (let i = 0; i < 5; i++) { x.fillStyle = '#e8e0f0'; x.fillRect(w / 2 - 26 + i * 12, 222, 3, 14); x.fillStyle = '#f0c040'; x.beginPath(); x.arc(w / 2 - 24.5 + i * 12, 218, 3, 0, Math.PI * 2); x.fill(); }
    age(x, w, h, r, 0.5, { sun: 0.4 });
  });
  // a home-made cardboard sign / banner / board: text in marker or paint
  const boardTex = (key, lines, o = {}) => ctex('board|' + key, o.w || 512, o.h || 128, (x, w, h, r) => {
    x.fillStyle = o.bg || '#efe6cc'; x.fillRect(0, 0, w, h);
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12); }
    const n = lines.length, lh = (h - 20) / n;
    lines.forEach((l, i) => {
      const sz = (Array.isArray(o.size) ? o.size[i] : o.size) || Math.min(lh * 0.7, 60);
      if (o.hand) hand(x, l, w / 2, 14 + lh * (i + 0.72), { size: sz, color: o.fg || '#1f2c6e', align: 'center', font: o.font === 'marker' ? FN.marker : FN.hand, weight: o.weight || '' });
      else tx(x, l, w / 2, 14 + lh * (i + 0.72), sz, o.fg || '#1d1d1d', { font: o.font || FN.sans, weight: o.weight ?? 'bold', align: 'center', spacing: o.spacing });
    });
    age(x, w, h, r, o.age ?? 0.8, { sun: o.sun ?? 0.3 });
  });
  // the kitchen calendar (last month; one Saturday circled)
  const calendarTex = () => ctex('calendar', 256, 320, (x, w, h, r) => {
    x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#6a8a5a'; x.fillRect(0, 0, w, 120);
    x.fillStyle = '#8fb07a'; for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(r() * w, 40 + r() * 80, 4 + r() * 10, 0, Math.PI * 2); x.fill(); }
    tx(x, 'MAY', w / 2, 150, 24, '#333', { font: FN.serif, weight: 'bold', align: 'center', spacing: 4 });
    for (let i = 0; i < 35; i++) {
      const cx = 14 + (i % 7) * 33, cy = 168 + Math.floor(i / 7) * 28;
      x.strokeStyle = '#bbb'; x.lineWidth = 1; x.strokeRect(cx, cy, 31, 26);
      const d = i - 3 + 1; if (d >= 1 && d <= 31) tx(x, String(d), cx + 3, cy + 11, 9, '#555', { font: FN.sans });
    }
    x.strokeStyle = '#c0261d'; x.lineWidth = 3; x.beginPath(); x.ellipse(14 + 6 * 33 + 15, 168 + 2 * 28 + 13, 17, 13, 0, 0, Math.PI * 2); x.stroke();
    hand(x, 'CITY', 14 + 6 * 33 + 3, 168 + 2 * 28 + 24, { size: 9, color: '#c0261d' });
    hand(x, 'Bingo', 14 + 4 * 33 + 2, 168 + 1 * 28 + 23, { size: 9, color: '#1f2c6e' });
    hand(x, 'Luke tea', 14 + 0 * 33 + 2, 168 + 3 * 28 + 23, { size: 8, color: '#1f2c6e' });
    age(x, w, h, r, 0.4);
  });
  // the honour board in the community hall
  const honourTex = () => ctex('honour', 256, 384, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#5a3a22'); g.addColorStop(1, '#3a2414'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#c9a84a'; x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20);
    tx(x, 'THURSDAY BINGO', w / 2, 46, 20, '#e6c870', { font: FN.serif, weight: 'bold', align: 'center', spacing: 2 });
    tx(x, 'CHAMPIONS', w / 2, 72, 18, '#e6c870', { font: FN.serif, align: 'center', spacing: 3 });
    const rows = [['2019', 'Unit 4'], ['2020', '—'], ['2021', 'Unit 2'], ['2022', 'Unit 11'], ['2023', 'Unit 9'], ['2024', 'Unit 9'], ['2025', 'Unit 9'], ['2026', '']];
    rows.forEach(([y, n], i) => { tx(x, y, 44, 118 + i * 32, 16, '#e6c870', { font: FN.serif }); tx(x, n, w - 44, 118 + i * 32, 16, '#e6c870', { font: FN.serif, align: 'right' }); });
    age(x, w, h, r, 0.7);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Mesh builder: quads in room coordinates (one mesh per material), planar UVs in metres × s
  // ---------------------------------------------------------------------------------------------------------------
  const MB = () => ({ p: [], uv: [], i: [] });
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  function quad(g, a, b, c, d, s = 1, want = null, uv01 = false) {
    const n = g.p.length / 3;
    g.p.push(...a, ...b, ...c, ...d);
    if (uv01) g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    else { const lu = len3(sub3(b, a)) * s, lv = len3(sub3(d, a)) * s; g.uv.push(0, 0, lu, 0, lu, lv, 0, lv); }
    let flip = false;
    if (want) { const nn = cross3(sub3(b, a), sub3(d, a)); flip = nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0; }
    if (flip) g.i.push(n, n + 2, n + 1, n, n + 3, n + 2); else g.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  function tri(g, a, b, c, s = 1, want = null) {
    const n = g.p.length / 3;
    g.p.push(...a, ...b, ...c);
    g.uv.push(0, 0, len3(sub3(b, a)) * s, 0, 0, len3(sub3(c, a)) * s);
    let flip = false;
    if (want) { const nn = cross3(sub3(b, a), sub3(c, a)); flip = nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0; }
    if (flip) g.i.push(n, n + 2, n + 1); else g.i.push(n, n + 1, n + 2);
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
    K.mesh(m, { static: o.static !== false && !mat.transparent, name: o.name, world: o.world });
    return m;
  }
  function Bags() {
    const list = new Map();
    return {
      g(key, spec) { let b = list.get(key); if (!b) { b = { g: MB(), spec }; list.set(key, b); } return b.g; },
      flush(K, o = {}) { for (const [, b] of list) mesh(K, b.g, b.spec, o); list.clear(); },
    };
  }
  // hip roof over a w × d plan centred at (cx, cz) with the eaves at y; ridge along the longer side; rot (deg)
  function hipRoof(g, cx, y, cz, w, d, rh, rot = 0, e = 0.45, s = 1.2) {
    const c = Math.cos(rot * D2R), sn = Math.sin(rot * D2R);
    const P = (lx, ly, lz) => [cx + lx * c + lz * sn, y + ly, cz - lx * sn + lz * c];
    const W = w / 2 + e, D = d / 2 + e, ridge = Math.max(0.05, (Math.max(W, D) - Math.min(W, D)));
    const up = [0, 1, 0];
    if (W >= D) {
      const a = P(-W, 0, D), b = P(W, 0, D), cc = P(W, 0, -D), dd = P(-W, 0, -D), r0 = P(-ridge, rh, 0), r1 = P(ridge, rh, 0);
      quad(g, a, b, r1, r0, s, up); quad(g, cc, dd, r0, r1, s, up); tri(g, b, cc, r1, s, up); tri(g, dd, a, r0, s, up);
    } else {
      const a = P(-W, 0, D), b = P(W, 0, D), cc = P(W, 0, -D), dd = P(-W, 0, -D), r0 = P(0, rh, D - W), r1 = P(0, rh, -(D - W));
      quad(g, b, cc, r1, r0, s, up); quad(g, dd, a, r0, r1, s, up); tri(g, a, b, r0, s, up); tri(g, cc, dd, r1, s, up);
    }
  }
  // gable roof: ridge along local X
  function gableRoof(g, gEnd, cx, y, cz, w, d, rh, rot = 0, e = 0.5, s = 1.2) {
    const c = Math.cos(rot * D2R), sn = Math.sin(rot * D2R);
    const P = (lx, ly, lz) => [cx + lx * c + lz * sn, y + ly, cz - lx * sn + lz * c];
    const W = w / 2 + e, D = d / 2 + e, up = [0, 1, 0];
    quad(g, P(-W, 0, D), P(W, 0, D), P(W, rh, 0), P(-W, rh, 0), s, up);
    quad(g, P(W, 0, -D), P(-W, 0, -D), P(-W, rh, 0), P(W, rh, 0), s, up);
    if (gEnd) for (const sx of [-1, 1]) tri(gEnd, P(sx * w / 2, 0, d / 2), P(sx * w / 2, 0, -d / 2), P(sx * w / 2, rh * (1 - e / D), 0), s, [sx * c, 0, -sx * sn]);
  }
  // a hanging wire / cable between two points, sagging
  function sagPts(a, b, sag = 0.4, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, lerp(a[2], b[2], t)]); }
    return out;
  }
  function wire(K, pts, r = 0.012, color = '#1b1c1c', o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 3), r, 4, false), K.mat({ color, roughness: 0.7 }));
    m.castShadow = false;
    K.mesh(m, { static: true, world: o.world });
    return m;
  }
  // local → room transform helper for things built facing a direction (units, bays)
  const Frame = (ox, oz, rot) => {
    const c = Math.cos(rot * D2R), s = Math.sin(rot * D2R);
    return {
      ox, oz, rot,
      p: (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c],
      x: (lx, lz) => ox + lx * c + lz * s,
      z: (lx, lz) => oz - lx * s + lz * c,
      r: (d = 0) => rot + d,
      box: (lx0, lz0, lx1, lz1) => { const a = [ox + lx0 * c + lz0 * s, oz - lx0 * s + lz0 * c], b = [ox + lx1 * c + lz1 * s, oz - lx1 * s + lz1 * c]; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; },
    };
  };
  // fog push (street scenes): Render.fog.density eases toward C2.fogTo while set
  function fogStep(dt, base) {
    const f = Render.fog;
    if (!f) return;
    const want = C2.fogTo ?? base;
    if (want === null || want === undefined) return;
    f.density += (want - f.density) * Math.min(1, dt * 1.6);
  }
  const say = (G, who, line) => G.say(who, line);
  const heart = (p) => Math.max(Math.exp(-(((p - 0.05) / 0.075) ** 2)), 0.78 * Math.exp(-(((p - 0.34) / 0.075) ** 2)));
  // the Reach tell on the phone at a fixed number of bars (2-2's insert: "the bars jump to 4 and pulse")
  function pulseBars(n) {
    let ph = 0;
    return (dt) => {
      const before = ph;
      ph = (ph + dt / 0.62) % 1;
      if (ph < before) { try { Snd.play('heartbeat', { vol: 0.4 }); } catch (e) { /* audio */ } }
      // full on the beat, never quite empty between (the insert has to read "four bars")
      return { n: Math.max(2, Math.round((0.35 + 0.65 * heart(ph)) * n)), static: 0.45 };
    };
  }
  // the room's own camera id for a scene to return to
  const camRel = (G) => { G.camRelease(); try { Cam.snap(); } catch (e) { /* no camera */ } };
  function phoneShot(dist, fov, lift = 0.02, aim = 0.012) {
    const ph = Player.actor && Player.actor.held && Player.actor.held.R;
    if (!ph) return null;
    ph.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    ph.getWorldPosition(p); ph.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = p.clone().addScaledVector(n, dist).addScaledVector(up, lift);
    return { pos: [c.x, c.y, c.z], target: [p.x + up.x * aim, p.y + up.y * aim, p.z + up.z * aim], fov };
  }
  const aidanHead = () => { const h = Player.actor && Player.actor.bones && Player.actor.bones.head; const v = new THREE.Vector3(); if (h) h.getWorldPosition(v); else if (Player.pos) v.copy(Player.pos).add(new THREE.Vector3(0, 1.62, 0)); return v; };
  const anchorPos = (actor, name) => { const a = actor && actor.anchors && actor.anchors[name]; const v = new THREE.Vector3(); if (a) a.getWorldPosition(v); return v; };

  // =================================================================================================================
  // GAMEPLAY 2-4 — the chase. Luke as the town dresses him: a silhouette in the fog, never seen clearly, with two Reaches
  // rising out of the fog either side of him, his shouts layered and distorted like a Reach's (DIALOGUE.luke_chase).
  // A scripted pursuer, fair: his speed is rubber-banded (he closes in when Aidan stops or doubles back, drops back a
  // little while Aidan runs), a catch shoves Aidan and hurts — never below 12 health, he's a person — then he stands
  // and shouts for two seconds. The phone reads him as a Reach (tell 'pulse'), although he is a person.
  // =================================================================================================================
  const LUKE_SHOUTS = () => (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.luke_chase) && DIALOGUE.luke_chase.length
    ? DIALOGUE.luke_chase : ['Three times! I rang three times!', "She's in the hospital! Did you know that?", 'Come back here!']);
  const LK = { near: 2.2, mid: 2.75, far: 3.45, catchR: 1.15, pause: 2.2, dmg: 14 };
  // darken every material of a Rig actor (its own materials; held props get their own clones) → a silhouette
  function silhouette(actor, keep) {
    if (!actor) return;
    const dark = (m) => { if (m.color) m.color.set('#050707'); if (m.emissive) { m.emissive.set('#000000'); m.emissiveIntensity = 0; } if ('roughness' in m) m.roughness = 1; if ('metalness' in m) m.metalness = 0; };
    for (const m of actor.mats || []) dark(m);
    for (const s of ['L', 'R']) {
      const h = actor.held && actor.held[s];
      if (!h) continue;
      h.traverse((o) => { if (!o.isMesh || !o.material) return; o.material = Array.isArray(o.material) ? o.material.map((m) => { const c = m.clone(); dark(c); keep.push(c); return c; }) : (() => { const c = o.material.clone(); dark(c); keep.push(c); return c; })(); });
    }
  }
  Enemies.defineType('c2_luke', {
    hp: Infinity, radius: 0.38, height: 1.85, tell: 'pulse', downs: false, invincible: true, stompable: false, lockable: false,
    threat: (e) => !e.data.gone,
    steps: { stride: 0.9, vol: 0.85, heavy: true },
    create(e, def) {
      const a = Rig.create('luke', {});
      a.idleLife = false;
      e.actor = a; e.obj = a.root; e.pos = a.root.position;
      e.data.clones = [];
      silhouette(a, e.data.clones);
      a.setAnim('idle', { blend: 0 });
      a.eyes('closed');
      e.untouchable = true;
      e.data.delay = def.delay ?? 1.2;
      e.data.shoutT = def.shoutAt ?? 0.4;
      e.data.si = def.shoutIndex ?? 0;
      e.data.pause = 0; e.data.pathT = 9; e.data.path = null;
    },
    remove(e) { for (const m of e.data.clones || []) { try { m.dispose(); } catch (err) { /* gone */ } } },
    onHit() { return false; },
    update(e, dt, ai) {
      const a = e.actor, D = e.data;
      if (D.gone) return;
      if (!ai || !Player.pos) { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 }); return; }
      const p = Player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz);
      // shouts, layered and distorted like a Reach
      D.shoutT -= dt;
      if (D.shoutT <= 0) {
        D.shoutT = 4.4 + Math.random() * 2.4;
        const L = LUKE_SHOUTS(), line = L[D.si % L.length]; D.si++;
        try { Enemies.say(line, 'distort', 2.8); } catch (err) { /* voice */ }
        try { Snd.murmur('reach', { pos: [e.pos.x, e.pos.y + 1.7, e.pos.z], dur: 1.8, vol: 0.9 }); } catch (err) { /* audio */ }
      }
      const faceTo = (yaw, rate) => { e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, yaw), -rate * dt, rate * dt); };
      if (D.delay > 0 || D.pause > 0) {
        if (D.delay > 0) D.delay -= dt; else D.pause -= dt;
        faceTo(Math.atan2(dx, dz), 4);
        if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.35 });
        return;
      }
      // a catch: he gets a hand on Aidan — a shove, a hit of pain; then he stands and shouts
      if (d < LK.catchR && Math.abs(p.y - e.pos.y) < 1.2 && Player.mode === 'normal') {
        D.pause = LK.pause; D.shoutT = Math.min(D.shoutT, 0.3);
        try { Player.damage(LK.dmg, e, { minHealth: 12, push: 1.6, from: e.pos.clone(), force: true }); } catch (err) { /* player */ }
        try { Cam.shake(0.3, 0.45); Snd.play('thud', { pos: [p.x, p.y + 1, p.z], vol: 0.8 }); } catch (err) { /* fx */ }
        a.gesture('reach', { hand: 'R', target: Player.actor, dur: 0.7 });
        return;
      }
      const sp = d > 9 ? LK.far : d > 5 ? LK.mid : LK.near;
      let wx = p.x, wz = p.z;
      const clear = World.los(e.pos.x, e.pos.z, p.x, p.z, { minH: 0.6, ignore: (c) => !!c.enemy });
      if (!clear) {
        D.pathT += dt;
        if (!D.path || D.pathT > 0.6) { D.pathT = 0; try { D.path = Enemies.path(e.pos.x, e.pos.z, p.x, p.z) || null; } catch (err) { D.path = null; } }
        if (D.path && D.path.length) {
          while (D.path.length > 1 && Math.hypot(D.path[0][0] - e.pos.x, D.path[0][1] - e.pos.z) < 0.4) D.path.shift();
          [wx, wz] = D.path[0];
        }
      } else D.path = null;
      const wd = Math.hypot(wx - e.pos.x, wz - e.pos.z) || 1;
      const step = Math.min(sp * dt, Math.max(0, d - 0.6));
      const r = World.move(e.pos, (wx - e.pos.x) / wd * step, (wz - e.pos.z) / wd * step, e.radius, { ignore: (c) => !!c.enemy, maxStep: 0.5, maxDrop: 1.2 });
      const moved = Math.hypot(r.x - e.pos.x, r.z - e.pos.z);
      e.pos.set(r.x, r.y, r.z);
      if (moved > 1e-4) faceTo(Math.atan2(wx - e.pos.x, wz - e.pos.z), 5);
      a.setAnim(moved > 1e-3 ? 'run' : 'idle', { blend: 0.25 });
      a.lookAt(Player.actor);
    },
  });
  // the two Reaches that rise out of the fog either side of him (visual; the catch is his)
  Enemies.defineType('c2_flank', {
    hp: Infinity, radius: 0.42, height: 1.9, downs: false, invincible: true, stompable: false, lockable: false, body: false,
    threat: false, tell: 'pulse',
    steps: { stride: 0.95, vol: 0.7, heavy: true },
    create(e, def) {
      const R = Enemies.types && Enemies.types.reach;
      if (R && R.create) R.create(e, def);
      else { const a = Rig.create('man_counter', {}); e.actor = a; e.obj = a.root; e.pos = a.root.position; }
      e.untouchable = true; e.threat = false;
      e.data.side = def.side || 1; e.data.rise = 0; e.data.leader = def.leader;
      if (e.actor) { e.actor.setOpacity(0.01); e.actor.setTint('#8a1a10', 0.55, { skin: true }); e.actor.setAnim('idle', { blend: 0 }); }
    },
    update(e, dt) {
      const a = e.actor, D = e.data;
      if (!a) return;
      const L = Enemies.get(D.leader);
      if (!L || L.removed || L.data.gone) { D.rise = Math.max(0, D.rise - dt / 0.8); a.setOpacity(Math.max(0.01, D.rise)); if (D.rise <= 0) e.remove(); return; }
      D.rise = Math.min(1, D.rise + dt / 1.7);
      a.setOpacity(Math.max(0.01, D.rise));
      const yaw = L.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
      let off = 2.4 - (1 - D.rise) * -2.5;              // they close in from wide as they rise
      let tx = L.pos.x + rx * off * D.side - fx * 1.1, tz = L.pos.z + rz * off * D.side - fz * 1.1;
      for (let k = 0; k < 4 && !(World.pointFree(tx, tz, 0.35) && World.heightAt(tx, tz) !== null); k++) { off *= 0.55; tx = L.pos.x + rx * off * D.side - fx * 1.1; tz = L.pos.z + rz * off * D.side - fz * 1.1; }
      const dx = tx - e.pos.x, dz = tz - e.pos.z, dd = Math.hypot(dx, dz);
      const sp = Math.min(dd, (dd > 2 ? 5 : 3.6) * dt);
      if (dd > 0.02) { e.pos.x += dx / dd * sp; e.pos.z += dz / dd * sp; }
      const fy = World.heightAt(e.pos.x, e.pos.z); if (fy !== null && fy !== undefined) e.pos.y = fy;
      e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, dd > 0.1 ? Math.atan2(dx, dz) : yaw), -4 * dt, 4 * dt);
      a.setAnim(L.actor && L.actor.anim === 'run' ? 'run' : 'idle', { blend: 0.3 });
      if (Player.actor) a.lookAt(Player.actor);
      try { Snd.loop('reach_breath', true, { id: 'enemy:' + e.uid + ':reach_breath', pos: [e.pos.x, e.pos.y + 1.7, e.pos.z], vol: 0.55, intensity: 0.7 }); } catch (err) { /* audio */ }
    },
  });
  // start (or continue) the pursuit in this room: Luke at (x, z), the Reaches either side
  function startPursuit(G, x, z, yawDeg, o = {}) {
    const e = G.spawn({ id: 'c2:luke', type: 'c2_luke', persist: false, pos: [x, z], rot: yawDeg, delay: o.delay ?? 1.2, shoutAt: o.shoutAt ?? 0.5, shoutIndex: o.shoutIndex ?? 0 });
    for (const side of [-1, 1]) G.spawn({ id: 'c2:flank' + (side < 0 ? 'L' : 'R'), type: 'c2_flank', persist: false, pos: [x - Math.cos(yawDeg * D2R) * side * 5, z + Math.sin(yawDeg * D2R) * side * 5], rot: yawDeg, side, leader: 'c2:luke' });
    G.bars(null);
    return e;
  }
  function endPursuit() {
    for (const id of ['c2:luke', 'c2:flankL', 'c2:flankR']) { const e = Enemies.get(id); if (e && !e.removed) { if (id === 'c2:luke') e.data.gone = true; e.remove(); } }
  }

  // =================================================================================================================
  // Items: the returned modem goes into Unit 9's lounge socket; the pendant breaks the loop (GAMEPLAY 2-3 / 2-5)
  // =================================================================================================================
  const U9 = { socket: [5.55, 3.72], modem: [5.55, 0.62, 4.02], couchArm: [6.5, 4.35] };
  const nearSocket = () => World.room === 'c2_unit9' && Player.pos && Math.hypot(Player.pos.x - U9.socket[0], Player.pos.z - U9.socket[1]) < 2.4 && !S.outage;
  if (ITEMS.returned_modem) {
    const prev = ITEMS.returned_modem.use;
    ITEMS.returned_modem.use = async (G) => {
      if (nearSocket() && !flag('c2_modemIn')) { await G.run((G2) => plugModem(G2), { control: false, letterbox: false, skippable: true, name: 'c2:modem' }); return true; }
      if (typeof prev === 'function') return prev(G);
      if (World.room === 'c2_unit9' && !S.outage && !flag('c2_modemIn')) { await G.think('Not here. [beat] The phone socket. The lounge.'); return false; }
      await G.msg('Nothing happens.');
      return false;
    };
  }
  if (ITEMS.alarm_pendant) {
    const prev = ITEMS.alarm_pendant.use;
    ITEMS.alarm_pendant.use = async (G) => {
      if (S.chapter === 2 && inLoop()) { await G.run((G2) => pendantScene(G2), { control: false, letterbox: false, skippable: true, name: 'c2:pendant' }); return true; }
      if (typeof prev === 'function') return prev(G);
      await G.think("It won't connect. [beat] It never did.");
      return false;
    };
  }

  // =================================================================================================================
  // 2A — HILLTOP ROAD. x east, −z north. Segment A (z 0…8) climbs east 0 → 3.5 m, hairpin H1 (x 40…48), segment B
  // (z −14…−6) climbs west 3.5 → 7 m, hairpin H2 (x 0…8), segment C (z −28…−20) climbs east 7 → 10.5 m, and the top
  // (G, x 44…52) turns north through the village gate. Banks with retaining walls between the terraces; the drop and
  // the fog beyond the guardrails.
  // =================================================================================================================
  const HR = {
    yA: (x) => lerp(0, 3.5, clamp(x / 40, 0, 1)),
    yB: (x) => lerp(7.0, 3.5, clamp((x - 8) / 32, 0, 1)),
    yC: (x) => lerp(7.0, 10.5, clamp((x - 8) / 36, 0, 1)),
  };
  const topAB = (x) => (x <= 8 ? 7.0 : x >= 40 ? 3.5 : HR.yB(x));
  const topBC = (x) => (x <= 8 ? 7.0 : x >= 44 ? 10.5 : HR.yC(x));
  const lowBC = (x) => (x <= 40 ? HR.yB(Math.max(8, x)) : 3.5);
  // a guardrail from a to b ([x,y,z]) following the slope; the road side is on the right walking a → b
  function railSeg(K, a, b, o = {}) {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
    if (L < 0.2) return null;
    const yaw = Math.atan2(-dz, dx) / D2R, tilt = Math.atan2(b[1] - a[1], L);
    const g = K.prop('guardrail', (a[0] + b[0]) / 2, (a[2] + b[2]) / 2, yaw, { len: L + 0.12, y: (a[1] + b[1]) / 2, ends: o.ends ?? false, collide: false, variant: o.variant });
    if (g) { g.rotation.order = 'YXZ'; g.rotation.set(0, yaw * D2R, tilt); }
    return g;
  }
  // a run of guardrail along x at z, from x0 to x1, on the surface y(x) (the road side toward +z when side > 0)
  function railRunX(K, x0, x1, z, yf, side = 1, o = {}) {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 4));
    for (let i = 0; i < n; i++) {
      const a = lerp(x0, x1, i / n), b = lerp(x0, x1, (i + 1) / n);
      if (side > 0) railSeg(K, [b, yf(b), z], [a, yf(a), z], { ends: o.ends && (i === 0 || i === n - 1), variant: o.variant });
      else railSeg(K, [a, yf(a), z], [b, yf(b), z], { ends: o.ends && (i === 0 || i === n - 1), variant: o.variant });
    }
  }
  function railRunZ(K, z0, z1, x, yf, side = 1, o = {}) {
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 4));
    for (let i = 0; i < n; i++) {
      const a = lerp(z0, z1, i / n), b = lerp(z0, z1, (i + 1) / n);
      if (side > 0) railSeg(K, [x, yf(a), a], [x, yf(b), b], { ends: o.ends && (i === 0 || i === n - 1), variant: o.variant });
      else railSeg(K, [x, yf(b), b], [x, yf(a), a], { ends: o.ends && (i === 0 || i === n - 1), variant: o.variant });
    }
  }
  defineRoom({
    id: 'c2_hilltoprd', name: 'HILLTOP ROAD', area: 'HILLTOP ROAD', chapter: 2, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [{ box: [0, 6.2, 40, 8.2], s: 'concrete' }, { box: [8, -7.8, 40, -5.9], s: 'concrete' }, { box: [8, -28.1, 44, -26.2], s: 'concrete' }, { box: [48, -5, 50.5, 1], s: 'concrete' }],
    bounds: [-3, -38, 52, 8.5],
    entries: { bottom: [-1.2, 3.2, 90], top: [48, -34.2, 0], start: [-1.2, 3.2, 90] },
    cameras: [
      // coming up from Relay Street: the empty bend first, the blinking amber down behind him (from out over the drop)
      { id: 'c2_hilltoprd:bottom', vol: [-3, 0, 10.6, 8.3], type: 'static', pos: [17.5, HR.yA(17.5) + 3.3, 10.2], target: [2.5, 0.7, 3.4], fov: 'fit' },
      // segment A from out over the drop, through the guardrail and the letterboxes: the retaining wall (and its writing)
      // behind him, the Tethered at its letterbox between him and the lens as he passes
      { id: 'c2_hilltoprd:a', vol: [10.3, -0.3, 40.3, 8.3], type: 'rail', pos: [20, HR.yA(20) + 2.3, 13.6], fov: 48, rail: { a: [10.3, HR.yA(10.3) + 2.3, 13.6], b: [40.3, 3.5 + 2.3, 13.6], look: [0, 0.9, 0], lag: 0.35 } },
      // the first hairpin from out over the drop, beyond the lookout bench
      { id: 'c2_hilltoprd:h1', vol: [40, -14.3, 50.6, 8.3], type: 'pan', pos: [52.6, 8.8, 4.2], target: [45, 3.5, -4], fov: 50, pan: { lag: 0.3, yaw: 78, pitch: 58 } },
      // low along the bank beside segment B, the retaining wall up to C behind him
      { id: 'c2_hilltoprd:b', vol: [7.7, -14.3, 40.3, -5.7], type: 'rail', pos: [24, topAB(24) + 1.3, -2.4], fov: 48, rail: { a: [7.7, 7.0 + 1.3, -2.4], b: [40.3, 3.5 + 1.3, -2.4], look: [0, 1.0, 0], lag: 0.35 } },
      // high over the second hairpin (the convex mirror, the drop)
      { id: 'c2_hilltoprd:h2', vol: [0, -28.3, 8.3, -5.7], type: 'static', pos: [13.2, 12.6, -2.4], target: [3.2, 7.1, -17.2], fov: 'fit' },
      // along segment C from the bank below it
      { id: 'c2_hilltoprd:c', vol: [7.7, -28.3, 52.3, -19.7], type: 'rail', pos: [24, topBC(24) + 1.4, -16.2], fov: 48, rail: { a: [7.7, 7.0 + 1.4, -16.2], b: [47.2, 10.5 + 1.4, -16.2], look: [0, 1.0, 0], lag: 0.35 } },
      // the top: low, looking up at the village gate and its sign
      { id: 'c2_hilltoprd:gate', vol: [43.7, -38.3, 52.3, -27.4], pri: 1, type: 'static', pos: [50.9, 11.5, -22.6], target: [47.2, 11.7, -35.4], fov: 'fit' },
      // the last steps to the gate: low beside the gatepost, looking up past him at the sign
      { id: 'c2_hilltoprd:sign', vol: [47.4, -37.4, 50.7, -33.6], pri: 2, type: 'static', pos: [50.7, 10.95, -30.2], target: [46.0, 12.25, -35.2], fov: 'fit' },
    ],
    spawns: [
      // a Tethered standing at a letterbox, facing it (away from the road)
      { id: 'c2_hilltoprd:teth', type: 'tethered', pos: [22.2, 7.1], rot: 0, anchor: [22.2, 7.1], cardigan: '#6a5a4a' },
    ],
    build(K) {
      const bags = Bags();
      const SB = 1 / Tex.size('bitumen');
      // ---- walkable: the Relay Street apron, the three segments, the hairpins, the top ------------------------------
      K.floor(-3, 0, 0, 8, 'bitumen');
      K.road(0, 0, 40, 6.2, { axis: 'x', slope: { y0: 0, y1: 3.5 }, sides: 'right', footpath: [0, 1.6], markings: 'center' });
      K.floor(40, -14, 48, 8, 'bitumen', { y: 3.5 });
      K.floor(48, -5, 50.4, 1, 'footpath', { y: 3.65 });
      K.road(8, -14, 40, -7.8, { axis: 'x', slope: { y0: 7.0, y1: 3.5 }, sides: 'right', footpath: [0, 1.6], markings: 'center' });
      K.floor(0, -28, 8, -6, 'bitumen', { y: 7.0 });
      K.road(8, -26.2, 44, -20, { axis: 'x', slope: { y0: 7.0, y1: 10.5 }, sides: 'left', footpath: [1.6, 0], markings: 'center' });
      K.floor(44, -38, 52, -20, 'bitumen', { y: 10.5 });
      // ---- the exits --------------------------------------------------------------------------------------------------
      K.exit({ id: 'c2_hilltoprd:bottom', box: [-3.1, -0.2, -2.3, 8.2], to: 'c1_relay', entry: 'north' });
      K.exit({ id: 'c2_hilltoprd:top', box: [43.8, -38.4, 52.2, -37.3], to: 'c2_crescent', entry: 'gate', sound: 'steps' });

      // ---- retaining walls between the terraces, the bank tops (verges), coping ---------------------------------------
      const wallM = { tex: 'concrete', color: '#9a927e' }, verge = { tex: 'grass', color: '#6f7862' }, capM = { tex: 'concrete', color: '#b3ab96' };
      const wa = bags.g('wall', wallM), vg = bags.g('verge', verge), cp = bags.g('cap', capM), dirt = bags.g('dirt', { tex: 'dirt', color: '#86765e' });
      for (let x = 0; x < 40; x += 2) {                                   // A's north wall (z 0) up to B / H2's level
        const x1 = x + 2;
        quad(wa, [x, HR.yA(x) - 0.1, 0.02], [x1, HR.yA(x1) - 0.1, 0.02], [x1, topAB(x1), 0.02], [x, topAB(x), 0.02], 0.5, [0, 0, 1]);
        quad(vg, [x, topAB(x), 0], [x1, topAB(x1), 0], [x1, topAB(x1), -6.05], [x, topAB(x), -6.05], 0.5, [0, 1, 0]);
        if (topAB(x) - HR.yA(x) > 0.3) quad(cp, [x, topAB(x) + 0.12, 0.08], [x1, topAB(x1) + 0.12, 0.08], [x1, topAB(x1) + 0.12, -0.25], [x, topAB(x) + 0.12, -0.25], 1, [0, 1, 0]);
      }
      for (let x = 8; x < 48; x += 2) {                                   // B / H1's north wall (z −14) up to C / G's level
        const x1 = x + 2;
        quad(wa, [x, lowBC(x) - 0.1, -13.98], [x1, lowBC(x1) - 0.1, -13.98], [x1, topBC(x1), -13.98], [x, topBC(x), -13.98], 0.5, [0, 0, 1]);
        quad(vg, [x, topBC(x), -14], [x1, topBC(x1), -14], [x1, topBC(x1), -20.05], [x, topBC(x), -20.05], 0.5, [0, 1, 0]);
        quad(cp, [x, topBC(x) + 0.12, -13.92], [x1, topBC(x1) + 0.12, -13.92], [x1, topBC(x1) + 0.12, -14.25], [x, topBC(x) + 0.12, -14.25], 1, [0, 1, 0]);
      }
      // the wall's end at the hairpin H1 (x 48), the bank top running on to the top's edge, the scrub falling away east
      // (the wall runs on east past the hairpin into the fog, its foot following the drop; the bank top above it)
      quad(wa, [48, 3.4, -13.98], [54, -2.1, -13.98], [54, 10.5, -13.98], [48, 10.5, -13.98], 0.5, [0, 0, 1]);
      quad(wa, [54, -2.1, -13.98], [62, -2.1, -13.98], [62, 10.5, -13.98], [54, 10.5, -13.98], 0.5, [0, 0, 1]);
      quad(cp, [48, 10.62, -13.92], [62, 10.62, -13.92], [62, 10.62, -14.25], [48, 10.62, -14.25], 1, [0, 1, 0]);
      quad(vg, [48, 10.5, -14], [62, 10.5, -14], [62, 10.5, -20.05], [48, 10.5, -20.05], 0.5, [0, 1, 0]);
      for (let x = -2; x < 52; x += 2) {
        const x1 = x + 2, y0 = (xx) => (xx <= 8 ? 7.0 : xx >= 44 ? 10.5 : HR.yC(xx)) + (xx > 8 && xx < 44 ? 0.15 : 0);
        if (x >= 44) continue;
        quad(dirt, [x, y0(x) - 0.05, -28.0], [x1, y0(x1) - 0.05, -28.0], [x1, y0(x1) + 2.6, -30.5], [x, y0(x) + 2.6, -30.5], 0.5, [0, 0.5, 1]);
        quad(vg, [x, y0(x) + 2.6, -30.5], [x1, y0(x1) + 2.6, -30.5], [x1, y0(x1) + 4.0, -40], [x, y0(x) + 4.0, -40], 0.4, [0, 1, 0]);
      }
      // the cutting's east end, where the gate's brick fence meets it (closes the slope's open wedge)
      quad(dirt, [44.02, 10.4, -28], [44.02, 10.4, -40], [44.02, 14.5, -40], [44.02, 13.1, -30.5], 0.5, [1, 0, 0]);
      // the drop below A (south): scrub falling away, the roofs of the houses below
      for (let x = -3; x < 50; x += 2) {
        const x1 = x + 2, y0 = (xx) => HR.yA(clamp(xx, 0, 40)) + (xx > 0 && xx < 40 ? 0.15 : 0);
        quad(dirt, [x, y0(x) - 0.02, 8.05], [x1, y0(x1) - 0.02, 8.05], [x1, y0(x1) - 4.5, 13], [x, y0(x) - 4.5, 13], 0.5, [0, 1, 0.4]);
        quad(vg, [x, y0(x) - 4.5, 13], [x1, y0(x1) - 4.5, 13], [x1, y0(x1) - 9, 26], [x, y0(x) - 9, 26], 0.4, [0, 1, 0]);
      }
      // the drop off H1's east side, H2's west side, G's east side
      quad(dirt, [48.05, 3.4, -14], [48.05, 3.4, 8], [54, -2, 8], [54, -2, -14], 0.5, [1, 1, 0]);
      quad(dirt, [-0.05, 6.9, -6], [-0.05, 6.9, -28], [-6, 1, -28], [-6, 1, -6], 0.5, [-1, 1, 0]);
      quad(dirt, [-3.05, -0.05, 8], [-3.05, -0.05, -6], [-3.05, 7.0, -6], [-3.05, 7.0, 0], 0.5, [-1, 0, 0]);
      quad(dirt, [52.05, 10.4, -38], [52.05, 10.4, -20], [58, 4, -20], [58, 4, -38], 0.5, [1, 1, 0]);
      // Relay Street runs north–south below the junction (in the fog), the drop beside the bank
      K.box(-10, -0.05, 4, 14, 0.05, 50, 'bitumen', { shadow: false });
      K.box(-3.9, 0, 4, 0.16, 0.15, 50, 'kerb', { shadow: false });
      bags.flush(K);

      // ---- guardrails and the edge colliders ----------------------------------------------------------------------------
      // A's south edge: guardrail with gaps for three driveways (letterboxes) that drop down to the houses below
      const DRIVES = [10, 22.2, 34];
      const yAf = (x) => HR.yA(x) + 0.15;
      let rx = 0.4;
      for (const dvx of [...DRIVES, 40]) { if (dvx - 1.4 > rx + 0.5) railRunX(K, rx, dvx - 1.4, 8.1, yAf, 1, { ends: true }); rx = dvx + 1.4; }
      for (const dvx of DRIVES) {
        K.blocker(dvx - 1.4, 7.97, dvx + 1.4, 8.6, "Somebody's driveway. It drops straight down into the fog.");
        const dq = MB(); quad(dq, [dvx - 1.3, yAf(dvx) - 0.02, 8.0], [dvx + 1.3, yAf(dvx) - 0.02, 8.0], [dvx + 1.4, yAf(dvx) - 3.2, 15], [dvx - 1.2, yAf(dvx) - 3.2, 15], 0.5, [0, 1, 0]);
        mesh(K, dq, { tex: 'gravel', color: '#9a9080' });
      }
      railRunZ(K, -14, 8, 48.15, () => 3.5, -1, { ends: true });
      railRunZ(K, -5.2, 1.2, 50.55, () => 3.65, -1, {});
      railRunX(K, 0, 40.2, -6.05, (x) => topAB(x), -1, { ends: true });
      railRunZ(K, -28, -6, -0.15, () => 7.0, 1, { ends: true });
      railRunX(K, 8, 52, -20.05, (x) => topBC(x), -1, { ends: true });
      railRunZ(K, -38, -20, 52.15, () => 10.5, -1, { ends: true });
      K.collider(48.0, -14, 48.4, -5, { h: 1.2, y: 3.4 }); K.collider(48.0, 1, 48.4, 8, { h: 1.2, y: 3.4 });
      K.collider(50.4, -5.2, 50.8, 1.2, { h: 1.2, y: 3.5 }); K.collider(48, -5.4, 50.8, -5.0, { h: 1.2, y: 3.5 }); K.collider(48, 1.0, 50.8, 1.4, { h: 1.2, y: 3.5 });
      K.blocker(-0.5, -28, -0.1, -6, 'It drops away into the fog.', { y: 6.8 });
      K.blocker(52.1, -38, 52.5, -20, 'It drops away into the fog.', { y: 10.3 });
      K.blocker(48.1, -14, 48.5, 8, 'Just fog down there. Fog and a long way down.', { y: 3.3 });

      // ---- Route 44, stop 2 (the timetable), a bench -------------------------------------------------------------------
      const bsx = 14.6, bsz = 7.55;
      K.prop('sign_post', bsx, bsz, 180, { style: 'council', text: 'ROUTE 44\nSTOP 2\nSAT ONLY', w: 0.42, h: 0.5, bg: '#1d4f6e', fg: '#f2efe4', y: yAf(bsx) });
      K.box(bsx + 0.45, yAf(bsx) + 1.05, bsz + 0.02, 0.36, 0.5, 0.04, { tex: 'metal', color: '#6d7470' });
      K.doc(riddle() === 'hard' ? 'timetable_hard' : 'timetable', bsx + 0.45, yAf(bsx) + 1.32, bsz - 0.005, { id: 'c2_hilltoprd:timetable', model: 'paper', wall: true, rot: 180, r: 1.3 });
      K.prop('bench', bsx + 2.3, 7.45, 180, { len: 1.5, y: yAf(bsx + 2.3) });
      K.examine(bsx, yAf(bsx) + 1.6, bsz - 0.2, ['Route 44, stop 2. [beat] Saturdays only.', "She'd have waited here. Every Saturday. For the one bus."], { id: 'c2hr:stop', r: 1.4 });
      K.examine(bsx + 2.3, yAf(bsx + 2.3) + 0.6, 7.3, ['A bench for the bus. Somebody\'s left a folded newspaper on it.', 'The crossword\'s done. In pen.'], { id: 'c2hr:busbench', r: 1.2 });
      K.pickup('coffee', bsx + 2.7, yAf(bsx + 2.7) + 0.47, 7.35, { id: 'c2_hilltoprd:coffee', extraOnEasy: true, rot: 40 });

      // ---- letterboxes (A: over the drop; C: up the driveways), the houses in the fog ----------------------------------
      const LB = [
        [10, 7.75, 0, { text: 'No junk mail\nplease', color: '#2f4f3a' }, ['A letterbox stuffed with catalogues. [beat] Months of them.', 'Nobody\'s been down to get the mail in a long time.']],
        [22.2, 7.75, 0, { text: 'PARCELS TO\nVILLAGE OFFICE', color: '#7c2a22' }, ['"Parcels to village office." [beat] Everything goes to the office up there.', 'The flag\'s up. Somebody\'s waiting on something.']],
        [34, 7.75, 0, { color: '#3a4a5a' }, ['This one\'s rusted shut.', 'Somebody taped a note over the slot. "Moved in with my daughter."']],
      ];
      for (const [x, z, rot, o, lines] of LB) {
        K.prop('letterbox', x, z, rot, { ...o, y: yAf(x) });
        K.examine(x, yAf(x) + 1.0, z - 0.2, lines, { id: 'c2hr:lb' + x, r: 1.2 });
      }
      for (const [x, lab] of [[16, '38'], [28, '44'], [35.5, '52']]) {
        const y = HR.yC(x) + 0.15;
        K.prop('letterbox', x - 1.9, -27.75, 180, { y, variant: 'brick', label: lab });
        const dq = MB(); quad(dq, [x - 1.2, y - 0.02, -28], [x + 1.2, y - 0.02, -28], [x + 1.3, y + 3.4, -36], [x - 1.1, y + 3.4, -36], 0.5, [0, 1, 0]);
        mesh(K, dq, { tex: 'gravel', color: '#9a9080' });
        K.blocker(x - 1.3, -28.4, x + 1.3, -27.96, "It's someone's driveway. I shouldn't.", { y: y - 0.2 });
      }
      K.examine(28 - 1.9, HR.yC(28) + 1.1, -27.5, ['Number 44. Brick, with the number painted on the side.', 'The driveway goes up into the fog. There\'s a porch light on up there. [beat] No. It\'s gone.'], { id: 'c2hr:lb44', r: 1.3 });
      K.examine(16 - 1.9, HR.yC(16) + 1.1, -27.5, 'Number 38. A Neighbourhood Watch sticker, faded to white.', { id: 'c2hr:lb38', r: 1.3 });
      // the houses below the road (only their roofs clear the edge) and up the driveways above C
      for (const [x, z, y, rot] of [[9, 17.5, -8.2, 186], [21.5, 18.5, -7.4, 176], [33.5, 17.8, -6.4, 183], [45, 16.5, -5.8, 172]]) K.prop('house', x, z, rot, { y, w: 9, d: 7.5, collide: false, roof: x > 30 ? '#4f5a55' : '#6f3b30' });
      for (const [x, z, y, rot] of [[16, -40.5, HR.yC(16) + 3.4, 4], [28, -41.5, HR.yC(28) + 3.4, -3], [34.5, -42.5, HR.yC(35.5) + 3.6, 2]]) K.prop('house', x, z, rot, { y, w: 9, d: 7, collide: false, variant: x === 28 ? 'brick' : 'weatherboard' });
      K.examine(28, HR.yA(28) + 0.8, 7.7, ['Roofs down there in the fog. [beat] Not one light on in any of them.'], { id: 'c2hr:roofs', r: 1.5 });

      // ---- the lookout bench over the fog (H1), the power poles, the retaining-wall writing ---------------------------
      K.prop('bench_plaque', 49.4, -2.0, 90, { y: 3.65, text: 'FOR DOREEN\nWHO WALKED UP HERE\nEVERY MORNING' });
      K.examine(49.3, 4.3, -2.0, ["\"For Doreen, who walked up here every morning.\" [beat] She'd have had a view once.", 'There\'s no view. Just white, all the way down.'], { id: 'c2hr:lookout', r: 1.6 });
      K.examine(47.2, 4.4, 5.5, ['The road folds back on itself. Below the rail there\'s just more road, then nothing.'], { id: 'c2hr:fold', r: 1.6 });
      K.writing("IT'LL BE FINE", 21, HR.yA(21) + 1.55, 0.05, 1.8, { rotY: 0 });
      K.examine(21, HR.yA(21) + 1.3, 0.6, ['Somebody\'s written on the wall. "It\'ll be fine." [beat] Same as the bus shelter.', 'My words. [beat] I say that. I say that every day.'], { id: 'c2hr:writing', r: 1.6 });
      K.writing('FOLLOW UP TOMORROW', 29, HR.yB(29) + 1.7, -13.93, 2.4, { rotY: 0, world: 'fog' });
      K.examine(29, HR.yB(29) + 1.2, -13.4, 'Faded marker on the wall. "Follow up tomorrow." [beat] Somebody else\'s handwriting. Somebody else.', { id: 'c2hr:wall2', r: 1.6 });
      const PP = [[4, 9.4, HR.yA(4) - 0.9], [30, 9.4, HR.yA(30) - 0.9], [18, -29.4, HR.yC(18) + 1.4], [40, -29.4, HR.yC(40) + 1.4]];
      for (const [x, z, y] of PP) K.prop('power_pole', x, z, 0, { y, span: 0 });
      for (const [i, j] of [[0, 1], [2, 3]]) wire(K, sagPts([PP[i][0], PP[i][2] + 8.6, PP[i][1]], [PP[j][0], PP[j][2] + 8.6, PP[j][1]], 0.8));
      wire(K, sagPts([30, PP[1][2] + 8.6, 9.4], [58, 9, 9.4], 0.8)); wire(K, sagPts([40, PP[3][2] + 8.6, -29.4], [60, 16, -29.4], 0.8));
      K.examine(18, HR.yC(18) + 1.2, -27.3, ['Power lines, running up the hill into the fog.', 'Somewhere up there there\'s a phone on the end of them.'], { id: 'c2hr:pole', r: 1.4 });
      // H2: the convex mirror on the bend, the elderly-residents sign, the dead streetlight
      K.cyl(0.7, 7.0, -26.8, 0.05, 2.6, { tex: 'metal', color: '#9aa39c' });
      const mir = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), K.mat({ color: '#b8c0c2', roughness: 0.08, metalness: 0.95 }));
      mir.position.set(0.9, 7.0 + 2.5, -26.6); mir.rotation.set(-Math.PI / 2 + 0.35, 0, 0); mir.rotation.order = 'YXZ'; mir.rotation.y = 135 * D2R;
      K.mesh(mir, { static: true });
      K.cyl(0.9, 7.0 + 2.14, -26.6, 0.46, 0.06, { color: '#e8a01a', roughness: 0.5 }, { rx: 90 });
      K.examine(1.2, 8.4, -26, ['A mirror on a pole, for cars coming round the bend. [beat] I look tired.', 'I look like someone who hasn\'t slept.'], { id: 'c2hr:mirror', r: 1.6 });
      K.prop('sign_post', 7.2, -6.9, 0, { style: 'warning', text: 'SLOW\nELDERLY\nRESIDENTS', w: 0.6, h: 0.6, y: 7.0 });
      K.examine(7.2, 8.6, -7.2, ['Slow. Elderly residents. [beat] I should have slowed down. With her. With everything.'], { id: 'c2hr:slow', r: 1.3 });
      K.prop('streetlight', 26, -6.35, 180, { y: HR.yB(26) + 0.15, lit: false, light: false });
      K.examine(26, HR.yB(26) + 1.3, -6.7, "This one's out. The bulb's black.", { id: 'c2hr:deadlight', r: 1.2 });
      // lit streetlights (sodium) along the climb
      K.prop('streetlight', 27, 7.85, 180, { y: yAf(27), bank: 1 });
      K.prop('streetlight', 47.6, -9.5, -90, { y: 3.5, bank: 2 });
      K.prop('streetlight', 0.4, -18, 90, { y: 7.0, bank: 3, flicker: true });
      K.prop('streetlight', 30, -27.8, 0, { y: HR.yC(30) + 0.15, bank: 4 });
      K.prop('streetlight', 51.6, -29, -90, { y: 10.5, bank: 5 });
      // the traffic light at the bottom of the hill, blinking amber down on Relay Street
      const amber = K.light('led', -6.2, 3.9, 11, { color: '#ffb020', size: 0.09, halo: 1.6, haloOpacity: 0.55, blink: 1.2, duty: 0.5, name: 'c2hr:amber', intensity: 4 });
      K.box(-6.2, 0, 11.3, 0.12, 3.2, 0.12, { tex: 'metal', color: '#3b3f3d' });
      K.box(-6.2, 3.3, 11.1, 0.3, 0.9, 0.25, '#1b1c1c');
      K.examine(-2.2, 1.0, 5.5, ['The traffic light down on Relay Street. Still blinking amber for nobody.', 'The town\'s down there. [beat] She\'s up here.'], { id: 'c2hr:amber', r: 1.6 });
      K.prop('sign_post', 1.2, 7.0, 180, { text: 'HILLTOP RD', text2: 'RELAY ST', y: 0.15 });
      K.examine(1.2, 1.9, 6.8, ['Hilltop Road. [beat] Unit 9, Hilltop Village. It\'s up there.'], { id: 'c2hr:roadsign', r: 1.3 });
      // gum trees on the banks, shrubs along the cuttings
      for (const [x, z, y] of [[20, -5.2, topAB(20)], [35, -5.3, topAB(35)], [30, -19.3, topBC(30)], [4.2, -32, 9.8], [20, -33, HR.yC(20) + 3.2], [40.5, -33.2, HR.yC(40.5) + 3.2], [5, -3.4, 7.0]]) K.prop('gum_tree', x, z, (x * 37) % 360, { y });
      for (const [x, z, y] of [[18, -4.4, topAB(18)], [33, -1.8, topAB(33)], [14, -18.2, topBC(14)], [35, -18.4, topBC(35)]]) K.prop('shrub', x, z, 0, { y, w: 1.3, h: 1.0, collide: false, dead: x % 2 === 0 });
      K.dress('leaves', [1, 0.4, 39, 5.8], 26, { seed: 202 });
      K.dress('leaves', [9, -13.6, 39, -8.2], 22, { seed: 203 });
      K.dress('leaves', [9, -25.8, 43, -20.4], 22, { seed: 204 });

      // ---- the top: the village gate, its sign, the brick fence ----------------------------------------------------------
      const GY = 10.5;
      for (const px of [44.3, 51.7]) { K.box(px, GY, -36, 0.7, 2.1, 0.7, 'brick', { collide: true }); K.box(px, GY + 2.1, -36, 0.84, 0.14, 0.84, 'concrete'); K.sphere(px, GY + 2.42, -36, 0.18, 'concrete'); }
      K.box(41.5, GY, -36.1, 5, 1.4, 0.35, 'brick', { collide: true }); K.box(41.5, GY + 1.4, -36.1, 5.1, 0.1, 0.45, 'concrete');
      K.box(44.1, GY, -31, 0.3, 1.0, 10, 'brick', { collide: true }); K.box(44.1, GY + 1.0, -31, 0.4, 0.08, 10.1, 'concrete');
      // the gates, swung open against the fence
      const gateM = { tex: 'metal', color: '#2a2c2a', roughness: 0.6 };
      for (const [hx, dir] of [[44.8, 1], [51.2, -1]]) {
        for (let k = 0; k <= 8; k++) K.box(hx - dir * 0.05 + dir * 0.02, GY + 0.1, -36.3 + 0.02 - k * 0.36, 0.03, 1.5, 0.03, gateM);
        K.box(hx, GY + 0.15, -37.7, 0.04, 0.04, 2.9, gateM); K.box(hx, GY + 1.55, -37.7, 0.04, 0.04, 2.9, gateM);
      }
      K.box(45.2, GY, -34.9, 0.08, 1.5, 0.08, { tex: 'metal', color: '#4b4136' }); K.box(47.3, GY, -34.9, 0.08, 1.5, 0.08, { tex: 'metal', color: '#4b4136' });
      K.box(46.25, GY + 1.5, -34.95, 2.3, 1.2, 0.06, { tex: 'metal', color: '#1f3a2e' });
      for (const px of [44.3, 51.7]) { K.box(px, GY + 1.55, -35.6, 0.16, 0.26, 0.16, { color: '#2a2c2a' }); K.light('lamp', px, GY + 1.68, -35.5, { color: '#ffcf8a', intensity: 2.6, distance: 5, bank: 6 }); }
      K.plane(46.25, GY + 2.1, -34.91, 2.2, 1.1, gateSignTex(), { rotY: 0 });
      // a little hooded lamp over the sign (the village keeps its welcome lit)
      K.box(46.25, GY + 2.72, -34.72, 0.5, 0.06, 0.34, { tex: 'metal', color: '#2a2c2a' }); K.box(46.25, GY + 2.66, -34.9, 0.04, 0.08, 0.04, { color: '#2a2c2a' });
      K.light('lamp', 46.25, GY + 2.64, -34.62, { color: '#ffd9a0', intensity: 2.4, distance: 3.2, bank: 6 });
      K.collider(45.1, -35.05, 47.4, -34.75, { h: 2.6, y: GY });
      K.examine(46.25, GY + 1.8, -34.3, ['"Hilltop Village. Independent Living. Visitors please sign in."', 'I\'m a visitor. [beat] I suppose that\'s what I am.'], { id: 'c2hr:gatesign', r: 1.8 });
      K.prop('shrub', 42.5, -34, 0, { y: GY, w: 1.6, h: 1.2 }); K.prop('shrub', 49.9, -37.4, 0, { y: GY, w: 1.1, h: 0.9, collide: false });
      K.prop('pansies', 48.2, -35.3, 0, { y: GY, w: 1.8, d: 0.5 });
      // beyond the gate: the village drive into the fog
      K.box(48, GY - 0.05, -44, 8, 0.05, 12, 'bitumen', { shadow: false });
      // Luka's call 2 rings at the village gate
      K.trigger([43.8, -34, 52.2, -24], (G) => G.call('luka2'), { id: 'c2_hilltoprd:call2' });
    },
    // at the lookout the fog thins a little while that shot holds (the view over the edge; the Prologue's trick)
    onUpdate(dt) { const c = Cam.current; C2.fogTo = c && c.id === 'c2_hilltoprd:h1' ? 0.032 : 0.05; fogStep(dt, null); },
    onLeave() { C2.fogTo = null; },
  });

  // =================================================================================================================
  // 2B/2C — THE CRESCENT. The loop road (x 0…60, z 0…40, 8 m wide) round the island (x 8…52, z 8…32) and the
  // community hall (x 21…39, z 14…26); footpaths (y 0.15) and front yards outside the ring; the units' facades at
  // z −5 (7–9), x 65 (4–6), z 45 (1–3), x −5 (10–12). The drive comes in through the gate at the SW (x 0…8, z 40…54)
  // past the office (x −11…−2, z 42…50). The NE lane (x 55…61) runs north to the garages; the back-gate lane (x 1…7)
  // north to the gate at z −10.5 and Exchange Road beyond (z −12…−32.5, climbing).
  // =================================================================================================================
  const UNITS = [
    [1, 18.5, 45, 180], [2, 34.5, 45, 180], [3, 50.5, 45, 180],
    [4, 65, 33.5, -90], [5, 65, 20, -90], [6, 65, 6.5, -90],
    [7, 48.5, -5, 0], [8, 31.5, -5, 0], [9, 14.5, -5, 0],
    [10, -5, 9.5, 90], [11, -5, 23, 90], [12, -5, 36.5, 90],
  ];
  const unitFrame = (n) => { const u = UNITS[n - 1]; return Frame(u[1], u[2], u[3]); };
  const U9F = unitFrame(9);
  const U9DOOR = U9F.p(-1.6, 0);
  // the loop: which unit numbers read 9 on each pass (0 = the first time round in the Outage; all twelve on the third loop)
  const NINES = [[6], [6, 3, 11, 1], [6, 3, 11, 1, 8, 5, 12, 2]];
  const shownNum = (n) => { if (!inLoop()) return n; const p = loopN(); if (p >= 3) return 9; return NINES[p].includes(n) ? 9 : n; };
  const plateFor = (n) => (n === 6 && inLoop() && loopN() < 3 ? plateTex(6, true) : plateTex(shownNum(n)));
  const curtainTex = (c) => ctex('curtain|' + c, 128, 128, (x, w, h, r) => {
    const col = new THREE.Color(c);
    for (let i = 0; i < w; i++) { const k = 0.7 + 0.3 * Math.sin((i / w) * Math.PI * 12 + Math.sin(i * 0.3)); x.fillStyle = `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`; x.fillRect(i, 0, 1, h); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, h - 10, w, 10);
    age(x, w, h, r, 0.5);
  });
  // lines for the doorstep modem boxes (docs are placed in four of them)
  const BOXDOC = { 7: 'acct3', 3: 'returns10', 12: 'returns11', 5: 'returns12' };
  const BOXLINES = {
    1: ['A modem box on the doorstep. Still in the plastic. [beat] Same as hers.', 'The light on it\'s blinking red. It isn\'t plugged into anything.'],
    2: ['Another one. Opened, taped shut again, left out for the courier.', 'Nobody came for it.'],
    4: ['RETURN TO SENDER, in careful capitals. [beat] Then crossed out. Then written again.'],
    6: ['Never opened. The receipt\'s still taped to the lid.', 'Sold on a Saturday. Everybody here came in on a Saturday.'],
    8: ['The box is soft from the rain. The modem inside\'s still blinking.', 'Blinking red. On every doorstep.'],
    9: ['Her box is gone. [beat] I brought it back with me. It\'s in my bag.'],
    10: ['A modem box on a pile of newspapers. None of them unrolled.'],
    11: ['The flaps are open. Somebody tried. [beat] The instructions are still folded in the bottom.'],
  };
  const LOCKMSG = { 2: "It's locked. [beat] Nobody's opening it.", 5: "It's locked.", 11: "It's locked." };
  const PORCH_LIT = new Set([1, 3, 5, 7, 8, 10, 12]);
  // the unit doors: locked (a message), Unit 9 (key → her hall), and in the Outage every door that reads 9 opens into her hall
  async function unitDoor(G, n) {
    const f = unitFrame(n), [dx, dz] = f.p(-1.6, 0);
    const pos = [dx, 1.1, dz];
    if (S.chapter > 2) { G.sfx('door_locked', { pos }); await G.msg("It won't open. Not anymore."); return; }
    if (chasing()) { G.sfx('door_locked', { pos }); if (n === 9) await G.think("No— he'll just follow me in."); else await G.msg("It's locked."); return; }
    if (S.outage && (n === 9 || shownNum(n) === 9)) {
      if (n !== 9 && G.once('c2:ninedoor')) G.sfx('handle', { pos });
      await G.goto('c2_unit9', 'door', { sound: 'door' });
      return;
    }
    if (n === 9) {
      if (!S.done['unlocked:c2_crescent:u9']) {
        if (G.has('unit9_key')) {
          S.done['unlocked:c2_crescent:u9'] = true;
          G.mapMark('auto:door:c2_crescent:u9', { at: [dx, dz], t: 'tick' });
          G.sfx('unlock', { pos });
          await G.msg('The key fits.');
          await G.wait(0.8);
        } else {
          G.sfx('door_locked', { pos });
          G.mapMark('auto:door:c2_crescent:u9', { at: [dx, dz], t: 'x' });
          await G.msg("It's locked.");
          return;
        }
      }
      await G.goto('c2_unit9', 'door', { sound: 'door' });
      return;
    }
    G.sfx('door_locked', { pos });
    if (G.once('c2:knock' + n) && n % 4 === 1) { await G.msg("It's locked."); await G.wait(0.4); G.sfx('glass_knock', { pos }); await G.think('I knock. [beat] Nobody comes.'); return; }
    await G.msg(LOCKMSG[n] || "It's locked.");
  }
  // Unit 9's key lockbox (spec §2A riddle levels: the code is her birth year, 1947)
  async function lockbox(G) {
    if (S.done['c2:lockbox']) { await G.think('Empty. The key\'s in my pocket.'); return; }
    const noteRead = !!(S.docs && (S.docs.lockbox_note || S.docs.lockbox_note_hard || S.docs.lockbox_note_easy));
    const hint = !noteRead ? undefined : riddle() === 'easy' ? 'Luke\'s note: 1947.' : 'Her birth year.';
    G.sfx('handle', { vol: 0.4 });
    const code = await G.keypad({ style: 'lockbox', code: '1947', digits: 4, tag: 'UNIT 9', hint });
    if (code !== '1947') { await G.think(noteRead ? 'Her birth year. [beat] I don\'t know it. Not yet.' : 'Four numbers. [beat] I don\'t know them.'); return; }
    S.done['c2:lockbox'] = true;
    G.sfx('clunk', { vol: 0.6 });
    await Script.builtins.pickup(G, { id: 'c2_crescent:unit9key', item: 'unit9_key' });
    G.note('Unit 9. Plug the modem in. Check her alarm.', { id: 'c2_goal' });
    G.mapMark('c2_lockbox', { at: [U9DOOR[0] - 0.9, U9DOOR[1]], t: 'tick' });
  }
  // build one unit (facade, mass, roof, porch, door, plate, window, garden, modem box, letterbox, leftovers)
  function buildUnit(K, n) {
    const f = unitFrame(n), rot = f.rot, win4 = n === 4;
    const R = (lx, lz) => f.p(lx, lz);
    const brick = { tex: 'brick', color: ['#c9b5a3', '#bfa894', '#c4ae9a'][n % 3] };
    const trim = { color: '#e6e1d4', roughness: 0.7 };
    const winOp = win4 ? { at: 4.5 + 1.8, w: 3.0, h: 1.5, sill: 0.7, glass: true, frame: true } : { at: 4.5 + 1.9, w: 2.0, h: 1.2, sill: 0.95, glass: true, frame: true };
    const [ax, az] = R(-4.5, 0), [bx, bz] = R(4.5, 0);
    K.wall(ax, az, bx, bz, 3.05, brick, { thick: 0.22, openings: [{ at: 4.5 - 1.6, w: 1.0, h: 2.3 }, winOp], grime: true });
    // the mass behind the facade (Unit 4: hollow around its lounge so the watcher stands behind real glass)
    if (!win4) { const [mx, mz] = R(0, -4.1); K.box(mx, 0, mz, 9, 3.05, 7.8, brick, { rot, collide: true }); }
    else {
      const [m1x, m1z] = R(-2.3, -4.1); K.box(m1x, 0, m1z, 4.4, 3.05, 7.8, brick, { rot, collide: true });
      const [m2x, m2z] = R(2.25, -6.35); K.box(m2x, 0, m2z, 4.5, 3.05, 3.3, brick, { rot, collide: true });
      const [s1x, s1z] = R(4.45, -2.35); K.box(s1x, 0, s1z, 0.1, 3.05, 4.3, brick, { rot, collide: true });
      // the lounge inside: carpet, dim walls, a couch, a standard lamp (off), a TV, the curtains open
      const lb = f.box(-0.1, -4.7, 4.4, -0.11);
      K.floor(lb[0], lb[1], lb[2], lb[3], { tex: 'carpet', color: '#4a3e36' }, { y: 0.15 });
      K.collider(lb[0], lb[1], lb[2], lb[3], { h: 2.6 });
      K.ceiling(lb[0], lb[1], lb[2], lb[3], 2.75, { tex: 'plaster', color: '#6a6660' });
      const [cx, cz] = R(2.2, -4.2); K.prop('couch', cx, cz, rot, { y: 0.15, color: '#5a4a3e', collide: false });
      const [tvx, tvz] = R(0.5, -3.5); K.prop('tv', tvx, tvz, rot + 90, { y: 0.15, collide: false, variant: 'crt', lit: false });
      // in the Outage the telly comes on by itself: snow, lighting the watcher from behind
      { const [lx, lz] = R(0.9, -3.4); K.light('screen', lx, 0.75, lz, { color: '#8fd8d0', intensity: 2.2, distance: 5, flicker: true, world: 'outage' }); }
      const [px, pz] = R(3.9, -0.6); K.prop('plant_pot', px, pz, 0, { y: 0.15, variant: 'dead', collide: false });
      const [fx, fz] = R(2.2, -4.6); K.prop('framed_photo', fx, fz, rot, { mount: 1.7, subject: 'family', collide: false });
      for (const s of [-1, 1]) { const [qx, qz] = R(1.8 + s * 1.62, -0.16); K.plane(qx, 1.45, qz, 0.28, 1.5, curtainTex('#6c5a4a'), { rotY: rot }); }
    }
    // roof, gutter, fascia
    const rb = MB(); const [rcx, rcz] = R(0, -4.0); hipRoof(rb, rcx, 3.0, rcz, 9.1, 8.1, 1.7, rot, 0.5, 1.1);
    mesh(K, rb, { tex: 'metal', color: n % 2 ? '#6f3b30' : '#7a4a3a', roughness: 0.7 });
    { const [gx, gz] = R(0, 0.46); K.box(gx, 2.86, gz, 10.1, 0.14, 0.12, { tex: 'metal', color: '#b9bcb4' }, { rot }); }
    // porch: slab, skillion roof on two posts, the light, the door, the plate
    const pb = f.box(-2.9, -0.06, -0.3, 1.35);
    K.floor(pb[0], pb[1], pb[2], pb[3], { tex: 'concrete', color: '#a8a296' }, { y: 0.3 });
    { const [sx, sz] = R(-1.6, 0.72); K.box(sx, 2.44, sz, 2.8, 0.06, 1.6, { tex: 'metal', color: '#9aa39c' }, { rot }); }
    for (const lx of [-2.8, -0.4]) { const [qx, qz] = R(lx, 1.3); K.box(qx, 0.3, qz, 0.08, 2.14, 0.08, trim, { rot, collide: true }); }
    const [dx, dz] = R(-1.6, 0);
    const door = K.door({ id: 'c2_crescent:u' + n, x: dx, z: dz, rot, w: 0.95, h: 2.1, y: 0.3, style: 'wood', color: ['#5a3a2a', '#3a4a5a', '#6a2a22', '#2f4a3a'][n % 4], when: () => false, mapMark: false });
    K.interact(...(() => { const [ix, iz] = R(-1.6, 0.5); return [ix, 1.2, iz]; })(), (G) => unitDoor(G, n), { id: 'c2_crescent:door' + n, r: 1.3 });
    // the porch light: left on at most of them (hers is dark — nobody's home to switch it on)
    { const [lx, lz] = R(-2.55, 0.14);
      K.box(lx, 2.17, lz, 0.12, 0.05, 0.1, { color: '#6a6a60' }, { rot });
      if (PORCH_LIT.has(n)) {
        K.fogOnly(() => { K.sphere(lx, 2.25, lz, 0.07, { color: '#f4e2b8', emissive: '#ffcf8a', emissiveIntensity: 1.5 });
          const [px, pz] = R(-2.4, 0.45); K.light('lamp', px, 2.05, pz, { color: '#ffcf8a', intensity: 2.3, distance: 5.2, bank: 1 + (n % 5) }); });
        K.outageOnly(() => K.sphere(lx, 2.25, lz, 0.07, { color: '#2a2622', roughness: 0.5 }));
      } else K.sphere(lx, 2.25, lz, 0.07, { color: '#d8d2c0', roughness: 0.4 }); }
    { const [qx, qz] = R(-0.8, 0.125); K.plane(qx, 1.72, qz, 0.2, 0.25, plateTex(n), { rotY: rot, world: 'fog' }); K.plane(qx, 1.72, qz, 0.2, 0.25, plateFor(n), { rotY: rot, world: 'outage', name: 'c2_plateO' + n }); }
    if (!win4) { const [qx, qz] = R(1.9, -0.13); K.plane(qx, 1.55, qz, 2.0, 1.2, curtainTex(['#8a7a62', '#6c5a4a', '#8c8a7c', '#5e6a64', '#8a6a5a'][n % 5]), { rotY: rot }); }
    // garden: pansies under the window, a shrub at the corner, the path to the footpath
    { const [qx, qz] = R(1.9, 0.55); K.prop('pansies', qx, qz, rot, { y: 0.15, w: 2.4, d: 0.5 }); }
    { const [qx, qz] = R(4.0, 0.7); K.prop('shrub', qx, qz, 0, { y: 0.15, w: 1.0, h: 0.9, dead: n % 3 === 0 }); }
    { const [qx, qz] = R(-1.6, 2.3); K.box(qx, 0.15, qz, 1.0, 0.018, 1.95, { tex: 'footpath', color: '#b0aa9c' }, { rot, shadow: false }); }
    // the modem box on the doorstep, blinking red (docs in four of them)
    { const [mx, mz] = R(-0.75, 0.55); K.prop('modem_box', mx, mz, rot + 18 - (n % 3) * 14, { y: 0.3, lights: 'blink', open: n % 3 === 2 });
      // its red light carries through the fog: a row of them round the loop, blinking out of step
      K.light('led', mx, n % 3 === 2 ? 0.58 : 0.44, mz, { color: '#ff2a1c', size: 0.007, halo: 0.6, haloOpacity: 0.6, blink: 1.05 + (n % 4) * 0.11, duty: 0.45 });
      if (BOXDOC[n]) K.doc(BOXDOC[n], mx, 0.45, mz, { id: 'c2_crescent:box' + n, model: 'none', r: 1.0 });
      else if (BOXLINES[n]) K.examine(mx, 0.45, mz, BOXLINES[n], { id: 'c2cr:box' + n, r: 1.0 }); }
    // letterbox by the footpath
    { const [lx, lz] = R(2.9, 2.75); K.prop('letterbox', lx, lz, rot, { y: 0.15, color: ['#7c2a22', '#2f4f3a', '#3a4a5a', '#7e776a'][n % 4] }); }
    return { f, door };
  }
  // the human leftovers that make twelve identical units somebody's (one or two per unit)
  function unitLeftovers(K) {
    const at = (n, lx, lz) => unitFrame(n).p(lx, lz), rt = (n, d = 0) => unitFrame(n).rot + d;
    { const [x, z] = at(1, -1.6, 1.05); K.box(x, 0.3, z, 0.8, 0.012, 0.5, { tex: 'carpet', color: '#6a4a3a' }, { rot: rt(1), shadow: false }); K.examine(x, 0.5, z, ['"WELCOME." The mat\'s worn through where people stood.'], { id: 'c2cr:mat1', r: 1.0 }); }
    { const [x, z] = at(2, -2.45, 0.6); const g = new THREE.Group(); const M = K.mat({ tex: 'metal', color: '#b9bcb6', roughness: 0.35, metalness: 0.6 });
      for (const [a, b] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.82, 6), M); leg.position.set(a, 0.41, b); g.add(leg); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), K.mat({ color: '#c8d640', roughness: 0.9 })); ball.position.set(a, 0.035, b); g.add(ball); }
      for (const b of [-0.2, 0.2]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6), M); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.8, b); g.add(bar); }
      const fr = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), M); fr.rotation.x = Math.PI / 2; fr.position.set(-0.25, 0.8, 0); g.add(fr);
      g.position.set(x, 0.3, z); g.rotation.y = rt(2, 30) * D2R; K.mesh(g, { static: true });
      K.examine(x, 0.8, z, ['A walking frame by the door. Tennis balls on the feet.', 'Whoever lives here didn\'t go far without it.'], { id: 'c2cr:frame2', r: 1.1 }); }
    { const [x, z] = at(3, 3.3, 0.9); K.sphere(x, 0.24, z, 0.09, { color: '#4a7a3a', roughness: 0.5 }, { scale: [1.2, 0.8, 1] }); K.examine(x, 0.4, z, 'A concrete frog in the pansies. Somebody painted it green, a long time ago.', { id: 'c2cr:frog3', r: 1.0 }); }
    { const [x, z] = at(5, -1.6, 1.2); for (let i = 0; i < 5; i++) K.cyl(x - 0.16 + i * 0.08, 1.8 + (i % 2) * 0.1, z, 0.012, 0.32 + i * 0.05, { color: '#c9cdcc', metalness: 0.8, roughness: 0.3 }, { name: 'c2_chime' + i }); K.cyl(x, 2.2, z, 0.2, 0.02, { color: '#6a4a2a' }, { name: 'c2_chimetop' });
      K.animate((dt, t) => { for (let i = 0; i < 5; i++) { const o = World.obj && World.obj('c2_chime' + i); if (o) o.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.05; } });
      K.examine(x, 1.9, z + 0.2, ['A wind chime. [beat] There\'s no wind. It\'s still moving.'], { id: 'c2cr:chime5', r: 1.2 }); }
    { const [x, z] = at(6, 2.6, 1.3); K.box(x, 0.15, z, 0.7, 0.55, 1.3, { tex: 'plastic_sheet', color: '#3f4a52' }, { rot: rt(6, 10), collide: true }); K.box(x, 0.7, z - 0.2, 0.5, 0.35, 0.2, { tex: 'plastic_sheet', color: '#3f4a52' }, { rot: rt(6, 10) });
      K.examine(x, 0.8, z, ['A mobility scooter under a plastic cover. The charger lead runs in under the door.'], { id: 'c2cr:scooter6', r: 1.3 }); }
    { const [x, z] = at(7, 3.8, 0.4); K.cyl(x, 0.15, z, 0.25, 0.25, { color: '#2f5a3a', roughness: 0.6 }, { collide: true }); K.cyl(x, 0.28, z, 0.22, 0.04, { color: '#3a6a3a' }); K.examine(x, 0.5, z, 'A hose, coiled neat as anything. Somebody still waters these.', { id: 'c2cr:hose7', r: 1.1 }); }
    { const [x, z] = at(8, 3.2, 2.0); K.cyl(x, 0.15, z, 0.03, 1.4, { tex: 'wood', color: '#6a5a44' }); K.box(x, 1.5, z, 0.36, 0.04, 0.36, { tex: 'wood', color: '#6a5a44' }); K.cyl(x, 1.54, z, 0.14, 0.04, { color: '#d8d0b8' });
      K.examine(x, 1.4, z, ['A bird feeder. Full. [beat] No birds.'], { id: 'c2cr:feeder8', r: 1.1 }); }
    { const [x, z] = at(9, 0.6, 0.6); K.prop('plant_pot', x, z, 0, { y: 0.3, variant: 'dead', collide: false }); }
    { const [x, z] = at(10, -0.8, 0.95); for (let i = 0; i < 6; i++) K.cyl(x + (i % 3) * 0.12 - 0.12, 0.3 + Math.floor(i / 3) * 0.08, z + (i % 2) * 0.06, 0.04, 0.3, { tex: 'paper', color: '#d8d2c0' }, { rz: 90, rot: rt(10, 15 + i * 7) });
      K.examine(x, 0.5, z, ['Newspapers, still rolled in their plastic. Six of them.', 'Six weeks. Nobody noticed.'], { id: 'c2cr:papers10', r: 1.1 }); }
    { const [x, z] = at(11, -0.2, 1.15); K.prop('chair', x, z, rt(11, 160), { y: 0.3, variant: 'plastic' }); }
    { const [x, z] = at(12, 1.9, -0.1); K.light('screen', x, 1.4, z, { color: '#6f9fcf', intensity: 0.8, distance: 2.4, flicker: true, real: false });
      K.examine(x, 1.4, z + 0.5, ['The telly\'s on in there. I can see it through the curtains, flickering.', 'I knock on the glass. Nobody gets up.'], { id: 'c2cr:tv12', r: 1.3 }); }
  }
  // the Unit 4 watcher (spawned as a watching Tethered: never moves, can't be reached)
  const U4F = unitFrame(4), U4W = U4F.p(1.8, -0.9), U4CAM = U4F.p(1.8, -3.3);
  // the island: a rounded grass bed and kerb (extruded shapes, one draw each)
  function roundedRect(x0, z0, x1, z1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, -z0); s.lineTo(x1 - r, -z0); s.quadraticCurveTo(x1, -z0, x1, -z0 - r);
    s.lineTo(x1, -z1 + r); s.quadraticCurveTo(x1, -z1, x1 - r, -z1); s.lineTo(x0 + r, -z1); s.quadraticCurveTo(x0, -z1, x0, -z1 + r);
    s.lineTo(x0, -z0 - r); s.quadraticCurveTo(x0, -z0, x0 + r, -z0);
    return s;
  }
  function flatShape(K, shape, h, spec, uvs, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvs, uv.getY(i) * uvs);
    const m = new THREE.Mesh(g, K.mat(spec)); m.receiveShadow = true; m.position.y = o.y || 0;
    K.mesh(m, { static: true, world: o.world });
    return m;
  }
  // the chase blockers (fog closing the other ways while he's coming) — built hidden unless a chase is running
  function chaseWall(K, box, msg) {
    const fw = K.fogWall(box[0], box[1], box[2], box[3], msg, { h: 7, layers: 6, name: 'c2_chasefog' + C2.chaseWalls.length, mapMark: false });
    C2.chaseWalls.push(fw);
    const on = chasing();
    if (fw.mesh) fw.mesh.visible = on;
    if (fw.collider) fw.collider.enabled = on;
  }
  function setChaseWalls(on) {
    for (const fw of C2.chaseWalls) { if (fw.mesh) fw.mesh.visible = !!on; if (fw.collider) fw.collider.enabled = !!on; }
  }

  defineRoom({
    id: 'c2_crescent', name: 'THE CRESCENT', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.042 }, outageFog: { density: 0.05, color: '#14302d' },
    // the outdoor Outage preset is near-black: a faint sick-teal sky light reads the road and Aidan's shape
    outageAmbient: ['#1f6f6a', 0.7],
    surfaces: [
      { box: [-2.2, -5.2, 62.2, 0], s: 'concrete' }, { box: [8, 40, 65.2, 45.2], s: 'concrete' }, { box: [60, -2, 65.2, 45], s: 'concrete' }, { box: [-5.2, -2, 0, 52], s: 'concrete' },
      { box: [22, 25.8, 38, 32], s: 'concrete' }, { box: [54.8, -15.5, 61.2, -5], s: 'gravel' }, { box: [0, -33, 8, -5], s: 'gravel' },
    ],
    bounds: [-5.5, -33, 65.5, 54.2],
    entries: {
      gate: [4, 51.6, 180], office: [-1.1, 46, 90], unit9: [U9DOOR[0], U9DOOR[1] + 0.85, 0], hall: [30, 27.3, 0],
      garages: [58, -13.2, 0], backgate: [4, -30.6, 0], start: [4, 51.6, 180],
    },
    cameras: [
      // the gate and the drive: the empty entrance, the office window lit on the left
      { id: 'c2_crescent:gate', vol: [-2.3, 39.7, 8.3, 54.3], type: 'static', pos: [13.2, 3.9, 37.6], target: [2.6, 0.8, 48.4], fov: 'fit' },
      // "low along the footpath": a rail along the island's south kerb, looking at the unit fronts (1–3)
      { id: 'c2_crescent:south', vol: [8.3, 31.7, 65.3, 45.3], type: 'rail', pos: [30, 1.45, 29.2], fov: 50, rail: { a: [9.5, 1.45, 29.2], b: [63.5, 1.45, 29.2], look: [0, 0.9, 0], lag: 0.35 } },
      // the hall forecourt and path: the doors under the porch roof, the gnome in its pansies
      { id: 'c2_crescent:hall', vol: [22, 25.8, 37.6, 35.5], pri: 1, type: 'static', pos: [33.8, 3.3, 43.2], target: [29.4, 0.9, 28.2], fov: 'fit' },
      // THROUGH THE WINDOW OF UNIT 4: the watcher's back in the dark lounge, Aidan passing outside the glass
      { id: 'c2_crescent:win4', vol: [52.5, 31.8, 61.0, 38.8], pri: 1, type: 'static', pos: [U4CAM[0], 1.62, U4CAM[1]], target: [55.5, 0.9, U4W[1]], fov: 'fit' },
      // the east side and the NE corner, from over the island
      { id: 'c2_crescent:east', vol: [52.3, -5.3, 65.3, 31.8], type: 'pan', pos: [45.2, 5.4, 14.5], target: [58.5, 0.8, 13], fov: 50, pan: { lag: 0.3, yaw: 72, pitch: 30 } },
      // up the NE lane toward the garages (the turn at the top hidden in the fog)
      { id: 'c2_crescent:lane', vol: [54.7, -15.6, 61.3, -2.1], pri: 1, type: 'static', pos: [57.8, 3.0, 7.5], target: [58, 0.9, -12.5], fov: 'fit' },
      // along the north side from the island's kerb: the chase runs here
      { id: 'c2_crescent:north', vol: [16.5, -5.3, 54.7, 8.3], type: 'rail', pos: [30, 2.1, 10.2], fov: 50, rail: { a: [18.5, 2.1, 10.2], b: [57, 2.1, 10.2], look: [0, 1.0, 0], lag: 0.3 } },
      // Unit 9's front: her porch, her door, the lockbox (the chase starts here, running at the lens)
      { id: 'c2_crescent:u9', vol: [7.9, -5.3, 16.6, 2.6], pri: 1, type: 'static', pos: [21.8, 2.5, 5.2], target: [12.2, 1.0, -4.3], fov: 'fit' },
      // the NW corner: Unit 9, her lockbox, the back gate
      { id: 'c2_crescent:nw', vol: [-5.3, -10.6, 16.5, 8.3], type: 'pan', pos: [10.2, 3.1, 10.4], target: [2.5, 0.9, -3.5], fov: 50, pan: { lag: 0.3, yaw: 70, pitch: 50 } },
      // up Exchange Road beyond the back gate (the last shot of the chapter: walking away into the fog)
      { id: 'c2_crescent:backgate', vol: [-0.3, -33.3, 8.3, -10.5], pri: 1, type: 'static', pos: [4.2, 2.8, -3.2], target: [4, 1.6, -26], fov: 'fit' },
      // the west side (units 10–12) from over the island
      { id: 'c2_crescent:west', vol: [-5.3, 8.3, 8.3, 41.4], type: 'pan', pos: [15.4, 4.2, 24], target: [2, 0.8, 24], fov: 50, pan: { lag: 0.3, yaw: 70, pitch: 30 } },
    ],
    spawns: [
      // Fog world: three waiting at doors, as if to be let in; the watcher in Unit 4's window
      { id: 'c2_crescent:teth2', type: 'tethered', world: 'fog', pos: unitFrame(2).p(-1.6, 0.78), rot: unitFrame(2).rot + 180, anchor: unitFrame(2).p(-1.6, 0.78), cardigan: '#5a6a7a' },
      { id: 'c2_crescent:teth5', type: 'tethered', world: 'fog', pos: unitFrame(5).p(-1.6, 0.78), rot: unitFrame(5).rot + 180, anchor: unitFrame(5).p(-1.6, 0.78), cardigan: '#7a5a5a' },
      { id: 'c2_crescent:teth11', type: 'tethered', world: 'fog', pos: unitFrame(11).p(-1.6, 0.78), rot: unitFrame(11).rot + 180, anchor: unitFrame(11).p(-1.6, 0.78), cardigan: '#6a6a4a' },
      { id: 'c2_crescent:watcher', type: 'tethered', pos: U4W, rot: -90, anchor: U4W, watching: true, threat: false, voice: false, persist: false, cardigan: '#4f5f70' },
      // the Outage: four more, and from the second loop the Reach on the west side
      { id: 'c2_crescent:oteth1', type: 'tethered', world: 'outage', pos: unitFrame(1).p(-1.6, 3.1), rot: 0, anchor: unitFrame(1).p(-1.6, 3.1), cardigan: '#4a5a5a' },
      { id: 'c2_crescent:oteth2', type: 'tethered', world: 'outage', pos: [56.5, 21.5], rot: 90, anchor: [56.5, 21.5], cardigan: '#5a4a4a' },
      { id: 'c2_crescent:oteth3', type: 'tethered', world: 'outage', pos: unitFrame(8).p(-1.6, 0.78), rot: 180, anchor: unitFrame(8).p(-1.6, 0.78), cardigan: '#6a5a4a' },
      { id: 'c2_crescent:oteth4', type: 'tethered', world: 'outage', pos: [3.2, -1.4], rot: 200, anchor: [3.2, -1.4], cardigan: '#50505a' },
      { id: 'c2_crescent:reach', type: 'reach', world: 'outage', pos: [4.2, 22], rot: 180, when: (s) => ((s.flags && s.flags.c2_loopN) | 0) >= 2 && !(s.flags && s.flags.c2_loopBroken) },
    ],
    build(K) {
      C2.chaseWalls = [];
      const bags = Bags();
      // ---- walkable ground --------------------------------------------------------------------------------------------
      K.floor(0, 0, 60, 8, 'bitumen'); K.floor(0, 32, 60, 40, 'bitumen'); K.floor(0, 8, 8, 32, 'bitumen'); K.floor(52, 8, 60, 32, 'bitumen');
      K.floor(0, 40, 8, 54.3, 'bitumen');
      K.floor(-2.2, -2.2, 62.2, 0, 'footpath', { y: 0.15, skirt: false });      // north footpath
      K.floor(-2.2, -5, 62.2, -2.2, { tex: 'grass', color: '#6f7a62' }, { y: 0.15, skirt: false });
      K.floor(8, 40, 62.2, 42.2, 'footpath', { y: 0.15, skirt: false });        // south
      K.floor(8, 42.2, 65, 45, { tex: 'grass', color: '#6f7a62' }, { y: 0.15, skirt: false });
      K.floor(60, -2.2, 62.2, 42.2, 'footpath', { y: 0.15, skirt: false });      // east
      K.floor(62.2, -5, 65, 45, { tex: 'grass', color: '#6f7a62' }, { y: 0.15, skirt: false });
      K.floor(-2.2, -2.2, 0, 52, 'footpath', { y: 0.15, skirt: false });         // west + beside the drive
      K.floor(-5, -5, -2.2, 41.2, { tex: 'grass', color: '#6f7a62' }, { y: 0.15, skirt: false });
      K.floor(54.8, -15.6, 61.2, -5, { tex: 'gravel', color: '#948c7c' }, { y: 0.15, skirt: false });        // NE lane
      K.floor(0.8, -12, 7.2, -5, { tex: 'gravel', color: '#948c7c' }, { y: 0.15, skirt: false });           // back-gate lane
      K.floor(0, -33.3, 8, -12, { tex: 'gravel', color: '#8e8676' }, { ramp: { axis: 'z', y0: 2.6, y1: 0.15 }, skirt: false });   // Exchange Road, beyond
      K.floor(28.5, 28.2, 31.5, 32, 'footpath', { y: 0.15, skirt: false });      // the hall path and forecourt
      K.floor(22.5, 25.9, 37.5, 28.2, 'footpath', { y: 0.15, skirt: false });
      // kerbs along the outer edge of the ring
      const kerb = 'kerb';
      K.box(30, 0, -0.08, 60, 0.15, 0.16, kerb, { shadow: false }); K.box(35, 0, 40.08, 50, 0.15, 0.16, kerb, { shadow: false });
      K.box(-0.08, 0, 20, 0.16, 0.15, 40, kerb, { shadow: false }); K.box(60.08, 0, 20, 0.16, 0.15, 40, kerb, { shadow: false });
      K.box(-0.08, 0, 46, 0.16, 0.15, 12, kerb, { shadow: false }); K.box(8.08, 0, 47, 0.16, 0.15, 14, kerb, { shadow: false });
      // road markings: a dashed centre ring (faded), give-way lines at the drive, "SLOW" on the bitumen
      const mk = bags.g('mark', { color: '#d8d6cc', roughness: 0.8 });
      for (let x = 4; x < 56; x += 3) { quad(mk, [x, 0.008, 3.95], [x + 1.4, 0.008, 3.95], [x + 1.4, 0.008, 4.07], [x, 0.008, 4.07], 1, [0, 1, 0]); quad(mk, [x, 0.008, 35.95], [x + 1.4, 0.008, 35.95], [x + 1.4, 0.008, 36.07], [x, 0.008, 36.07], 1, [0, 1, 0]); }
      for (let z = 10; z < 31; z += 3) { quad(mk, [3.95, 0.008, z], [4.07, 0.008, z], [4.07, 0.008, z + 1.4], [3.95, 0.008, z + 1.4], 1, [0, 1, 0]); quad(mk, [55.95, 0.008, z], [56.07, 0.008, z], [56.07, 0.008, z + 1.4], [55.95, 0.008, z + 1.4], 1, [0, 1, 0]); }
      for (let x = 0.3; x < 7.8; x += 0.7) quad(mk, [x, 0.008, 41.2], [x + 0.4, 0.008, 41.2], [x + 0.4, 0.008, 41.5], [x, 0.008, 41.5], 1, [0, 1, 0]);
      K.plane(4, 0.009, 44.5, 2.6, 1.0, boardTex('slow', ['SLOW'], { bg: 'rgba(0,0,0,0)', fg: '#d8d6cc', w: 256, h: 96, age: 0.2 }), { rot: [-90, 0, 180], transparent: true });

      // ---- the island: rounded grass bed, kerb, the community hall ---------------------------------------------------
      flatShape(K, roundedRect(8.18, 8.18, 51.82, 31.82, 4.2), 0.15, { tex: 'grass', color: '#66725a' }, 1 / Tex.size('grass'));
      { const s = roundedRect(8, 8, 52, 32, 4.4); s.holes.push(new THREE.Path(roundedRect(8.18, 8.18, 51.82, 31.82, 4.2).getPoints(24).reverse()));
        flatShape(K, s, 0.16, 'kerb', 1 / Tex.size('kerb')); }
      K.collider(8, 8, 52, 25.85, { h: 1.0 }); K.collider(8, 25.85, 22.4, 32, { h: 1.0 }); K.collider(37.6, 25.85, 52, 32, { h: 1.0 });
      K.collider(22.4, 28.3, 28.4, 32, { h: 1.0 }); K.collider(31.6, 28.3, 37.6, 32, { h: 1.0 });
      // the hall: weatherboard walls on a brick base, a gable roof, the double glass doors under a porch roof
      const HWB = { tex: 'weatherboard', color: '#c9c2a8' };
      K.box(30, 0, 19.95, 18, 0.5, 11.9, 'brick', { collide: true });
      K.box(30, 0.5, 19.95, 18, 3.3, 11.9, HWB, { collide: true });
      K.wall(39.1, 26, 20.9, 26, 3.8, HWB, { thick: 0.2, openings: [{ at: 9.1, w: 1.9, h: 2.4 }, { at: 3.5, w: 2.4, h: 1.2, sill: 1.1, glass: true, frame: true }, { at: 14.7, w: 2.4, h: 1.2, sill: 1.1, glass: true, frame: true }] });
      { const gr = MB(), ge = MB(); gableRoof(gr, ge, 30, 3.8, 20, 18.2, 12.3, 2.4, 0, 0.6, 1.1); mesh(K, gr, { tex: 'metal', color: '#5a6360', roughness: 0.6 }); mesh(K, ge, HWB); }
      K.door({ id: 'c2_crescent:halldoor', x: 30, z: 26, rot: 0, w: 1.8, h: 2.3, style: 'glass_double', to: 'c2_hall', entry: 'door' });
      K.box(30, 2.62, 27.1, 4.6, 0.08, 2.4, { tex: 'metal', color: '#9aa39c' });
      for (const px of [27.9, 32.1]) K.box(px, 0.15, 28.2, 0.1, 2.47, 0.1, { color: '#e6e1d4' }, { collide: true });
      K.sign('HILLTOP VILLAGE COMMUNITY HALL', 30, 3.15, 26.13, 5.4, 0.42, { style: 'shop', bg: '#2a3a2a', fg: '#e8e2cc' });
      K.prop('notice_board', 34.8, 27.9, 0, { variant: 'posts', title: 'WHAT\'S ON', w: 0.9, h: 0.6, y: 0.15 });
      K.examine(34.8, 1.3, 28.2, ['What\'s on. Thursday Bingo, 1 pm. Everyone welcome.', 'Somebody\'s pinned a lost-cat notice over the top. Ginger. "Answers to Biscuit."'], { id: 'c2cr:whatson', r: 1.3 });
      K.examine(25.2, 1.4, 26.4, ['The hall. Every window\'s dark.', 'Thursday Bingo. [beat] She never missed one. It\'s in her calendar.'], { id: 'c2cr:hallfront', r: 1.5 });
      // the "Welcome Friends" gnome in its pansies (by the hall path)
      K.prop('gnome', 26.9, 30.6, 20, { y: 0.15 });
      K.prop('pansies', 26.9, 30.6, 0, { y: 0.15, variant: 'ring', radius: 0.42 });
      K.examine(27.2, 0.45, 30.6, 'Someone planted pansies around it. Still alive.', { id: 'c2cr:gnome', r: 1.9 });
      K.prop('bench', 34.5, 30.9, 0, { len: 1.6, y: 0.15 });
      K.examine(34.5, 0.8, 30.9, ['A bench facing the road. Facing everyone\'s front door.', 'Somebody sat here and watched who came and went.'], { id: 'c2cr:bench', r: 2.0 });
      for (const [x, z] of [[14, 14], [46, 14], [14, 26], [46, 26], [20, 30.5], [40, 9.8]]) K.prop('shrub', x, z, 0, { y: 0.15, w: 1.6, h: 1.1 });
      for (const [x, z] of [[11.5, 11], [48.5, 29]]) K.prop('gum_tree_small', x, z, 0, { y: 0.15 });
      K.cyl(18, 0.15, 29.5, 0.25, 0.6, 'concrete'); K.cyl(18, 0.75, 29.5, 0.42, 0.1, 'concrete');
      K.examine(18, 0.9, 30.2, ['A bird bath. Dry. A cup of dead leaves.'], { id: 'c2cr:birdbath', r: 2.0 });

      // ---- the twelve units ------------------------------------------------------------------------------------------
      for (let n = 1; n <= 12; n++) buildUnit(K, n);
      unitLeftovers(K);
      // the fences between them (building line), the side gates
      const fenceX = (x0, x1, z) => { K.prop('fence', (x0 + x1) / 2, z, 0, { variant: 'colorbond', len: x1 - x0, y: 0.15, color: '#5f6b64', collide: false }); K.collider(x0, z - 0.08, x1, z + 0.08, { h: 2.0 }); };
      const fenceZ = (z0, z1, x) => { K.prop('fence', x, (z0 + z1) / 2, 90, { variant: 'colorbond', len: z1 - z0, y: 0.15, color: '#5f6b64', collide: false }); K.collider(x - 0.08, z0, x + 0.08, z1, { h: 2.0 }); };
      fenceX(-5, 0.8, -5.2); fenceX(7.2, 10, -5.2); fenceX(19, 27, -5.2); fenceX(36, 44, -5.2); fenceX(53, 54.8, -5.2); fenceX(61.2, 65, -5.2);
      fenceZ(-5, 2, 65.2); fenceZ(11, 15.5, 65.2); fenceZ(24.5, 29, 65.2); fenceZ(38, 45, 65.2);
      for (let x = 8.6; x < 14; x += 1.1) K.cyl(x, 0.15, 45.2, 0.09, 0.45, { tex: 'wood', color: '#6a5a44' }); K.box(11.2, 0.5, 45.2, 5.6, 0.1, 0.1, { tex: 'wood', color: '#6a5a44' }); fenceX(23, 30, 45.2); fenceX(39, 46, 45.2); fenceX(55, 65, 45.2);
      fenceZ(-5, 5, -5.2); fenceZ(14, 18.5, -5.2); fenceZ(27.5, 32, -5.2);
      K.collider(-5.4, -5.4, -5.1, 41.3, { h: 2.0 }); K.collider(64.9, -5.4, 65.4, 45.3, { h: 2.0 }); K.collider(8.3, 45.0, 65.3, 45.4, { h: 2.0 });
      // NE lane sides, the back-gate lane sides, the drive's east hedge
      fenceZ(-15.6, -5.2, 54.7); fenceZ(-15.6, -5.2, 61.3);
      fenceZ(-12, -5.2, 0.7); fenceZ(-12, -5.2, 7.3);
      K.collider(8.1, 41.2, 8.5, 52, { h: 1.4 });
      for (let z = 42.5; z < 52; z += 1.6) K.prop('shrub', 9.4, z, 0, { y: 0.15, w: 1.5, h: 1.3, collide: false });

      // ---- the gate (south), the office (SW), the visitor parking ------------------------------------------------------
      for (const px of [-2.7, 8.7]) { K.box(px, 0, 51.8, 0.72, 2.1, 0.72, 'brick', { collide: true }); K.box(px, 2.1, 51.8, 0.86, 0.14, 0.86, 'concrete'); K.sphere(px, 2.42, 51.8, 0.18, 'concrete'); }
      K.box(-6.7, 0, 51.9, 7.4, 1.4, 0.35, 'brick', { collide: true }); K.box(12.5, 0, 51.9, 6.8, 1.4, 0.35, 'brick', { collide: true });
      K.box(1.0, 1.5, 52.05, 2.3, 1.2, 0.06, { tex: 'metal', color: '#1f3a2e' });
      K.box(-0.05, 0.15, 52.05, 0.08, 1.4, 0.08, { tex: 'metal', color: '#4b4136' }); K.box(2.05, 0.15, 52.05, 0.08, 1.4, 0.08, { tex: 'metal', color: '#4b4136' });
      K.plane(1.0, 2.1, 52.01, 2.2, 1.1, gateSignTex(), { rotY: 180 });
      K.examine(1.0, 1.8, 51.4, ['The back of the sign. [beat] "Visitors please sign in." I read it on the way in.'], { id: 'c2cr:gatesign', r: 1.4 });
      K.exit({ id: 'c2_crescent:gate', box: [-2.3, 53.4, 8.4, 54.4], to: 'c2_hilltoprd', entry: 'top', world: 'fog' });
      // the office: brick, the door onto the drive, its window toward the gate, the sign
      const OB = { tex: 'brick', color: '#c4ae9a' };
      K.wall(-2, 41.9, -2, 50.1, 3.0, OB, { thick: 0.22, openings: [{ at: 4.1, w: 1.1, h: 2.3 }, { at: 6.9, w: 1.6, h: 1.1, sill: 1.0, glass: true, frame: true }, { at: 1.6, w: 1.6, h: 1.1, sill: 1.0, glass: true, frame: true }] });
      K.wall(-2, 50, -11, 50, 3.0, OB, { thick: 0.22, openings: [{ at: 6.4, w: 2.6, h: 1.3, sill: 0.9, glass: true, frame: true }] });
      K.box(-6.6, 0, 45.95, 9, 3.0, 7.8, OB, { collide: true });
      { const rb = MB(); hipRoof(rb, -6.5, 2.95, 46, 9.3, 8.3, 1.6, 0, 0.5, 1.1); mesh(K, rb, { tex: 'metal', color: '#5a6360', roughness: 0.6 }); }
      K.door({ id: 'c2_crescent:officedoor', x: -2, z: 46, rot: 90, w: 1.0, h: 2.2, style: 'glass', to: 'c2_office', entry: 'door' });
      K.sign('VILLAGE OFFICE', -1.86, 2.55, 46, 1.9, 0.36, { rotY: 90, style: 'shop', bg: '#1f3a2e', fg: '#efe8d0' });
      K.plane(-1.87, 1.5, 44.2, 0.5, 0.36, boardTex('signin', ['PLEASE', 'SIGN IN'], { w: 256, h: 184, bg: '#f2efe6', fg: '#1f3a2e', border: '#1f3a2e' }), { rotY: 90 });
      // the office lamp glows in the window (the one light left on in the village)
      K.light('lamp', -4.2, 1.4, 48.4, { color: '#ffcf8a', intensity: 2.4, distance: 5, bank: 1 });
      K.box(-4.2, 0, 48.6, 1.2, 0.74, 0.6, { tex: 'wood', color: '#5a4a38' });
      K.sphere(-4.3, 1.3, 48.7, 0.12, { color: '#f0dcb0', emissive: '#ffcf8a', emissiveIntensity: 1.2 });
      K.examine(-1.4, 1.4, 48.1, ['There\'s a lamp on in the office. [beat] The only light on in the whole village.'], { id: 'c2cr:officewin', r: 1.3 });
      K.examine(-1.3, 1.3, 44.2, '"Please sign in." [beat] So they know who came.', { id: 'c2cr:signin', r: 1.2 });
      K.prop('bench', -2.9, 43.4, 90, { len: 1.3, y: 0.15 });
      K.prop('bin', -1.1, 50.9, 0, { variant: 'street' });
      // visitor parking: one white car. A hi-vis shirt on the passenger seat.
      K.box(12.0, 0.15, 48.5, 5.4, 0.02, 6.8, { tex: 'bitumen', color: '#4e4f4c' }, { shadow: false });
      K.prop('car', 12.0, 47.8, 180, { color: '#dcd8cc' });
      K.prop('sign_post', 13.9, 44.0, 0, { style: 'council', text: 'VISITOR\nPARKING', w: 0.5, h: 0.4, y: 0.15 });
      K.examine(12.0, 1.0, 45.4, ['A white car in visitor parking. There\'s a hi-vis shirt on the passenger seat. Navy and orange.', 'Somebody\'s visiting. [beat] Somebody drove up here.'], { id: 'c2cr:car', r: 1.9 });
      // the Outage: the road out through the front gate is a trench of cable
      K.outageOnly(() => {
        K.box(3, -0.6, 53.3, 11.6, 0.62, 1.6, { color: '#0c0f0f', roughness: 1 }, { shadow: false });
        K.dress('cables', [-2.2, 52.6, 8.2, 54.2], 26, { seed: 211 });
        K.blocker(-2.3, 52.6, 8.4, 53.2, "It's all cable. [beat] There's no road any more.");
      });

      // ---- the NE lane to the garages, the back gate (NW) and Exchange Road beyond ---------------------------------------
      K.exit({ id: 'c2_crescent:garages', box: [54.8, -15.7, 61.2, -15.0], to: 'c2_garages', entry: 'crescent' });
      K.prop('sign_post', 55.3, -5.8, 180, { style: 'council', text: 'GARAGES\nRESIDENTS ONLY', w: 0.56, h: 0.4, y: 0.15 });
      K.examine(55.6, 1.6, -6.2, ['"Garages. Residents only." [beat] The lane goes up behind the units.'], { id: 'c2cr:garsign', r: 1.2 });
      for (const [x, z] of [[56, -9], [60.2, -12.4]]) K.prop('bin', x, z, 90, { variant: 'wheelie', lid: x < 58 ? '#8f2a22' : '#2a5a2a' });
      K.examine(56.4, 1.0, -9.2, ['Bins out for collection. [beat] Nobody\'s come to collect them.'], { id: 'c2cr:bins', r: 1.2 });
      // the back gate: a steel pipe double gate, chained and padlocked in the Fog world until the loop is broken
      const gateOpen = flag('c2_loopBroken');
      const GM = { tex: 'metal', color: '#7d837d', roughness: 0.5 };
      for (const px of [0.75, 7.25]) K.cyl(px, 0.15, -10.5, 0.08, 1.6, GM);
      const gateLeaf = (hx, dir, open, world) => {
        const g = new THREE.Group(); const M = K.mat(GM);
        for (const gy of [0.3, 0.75, 1.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 0.05), M); b.position.set(dir * 1.6, gy, 0); g.add(b); }
        for (let k = 0; k <= 5; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.04), M); b.position.set(dir * (0.1 + k * 0.6), 0.75, 0); g.add(b); }
        g.position.set(hx, 0.15, -10.5); g.rotation.y = open ? -dir * 100 * D2R : 0;
        K.mesh(g, { static: true, world });
      };
      if (gateOpen) { gateLeaf(0.8, 1, true, 'both'); gateLeaf(7.2, -1, true, 'both'); }
      else {
        gateLeaf(0.8, 1, false, 'fog'); gateLeaf(7.2, -1, false, 'fog');
        gateLeaf(0.8, 1, true, 'outage'); gateLeaf(7.2, -1, true, 'outage');
        K.fogOnly(() => {
          K.box(3.95, 0.72, -10.46, 0.06, 0.08, 0.03, { tex: 'metal', color: '#b69a4a', metalness: 0.7, roughness: 0.35 });
          const links = []; for (let i = 0; i <= 10; i++) links.push([3.6 + i * 0.07, 0.95 - Math.sin((i / 10) * Math.PI) * 0.18, -10.44]);
          wire(K, links, 0.012, '#8d9594', { world: 'fog' });
          K.blocker(0.8, -10.75, 7.2, -10.25, "It's padlocked.", { mapMark: true });
        });
      }
      K.examine(4, 1.0, -9.6, async (G) => {
        if (S.chapter > 2 || gateOpen) { await G.think('The back gate. Exchange Road\'s up there.'); return; }
        if (S.outage) { await G.think('It\'s open. [beat] It wasn\'t before.'); return; }
        await G.think('The back gate. Exchange Road\'s on the other side. [beat] It\'s padlocked.');
      }, { id: 'c2cr:backgate', r: 1.4 });
      K.prop('sign_post', 7.9, -11.3, 0, { text: 'EXCHANGE RD', y: 0.2 });
      // Exchange Road beyond: a gravel lane climbing between old fences into the fog
      // old paling fences either side, following the climb (each run tilted to the slope)
      { const exY = (z) => lerp(2.6, 0.15, clamp((z + 33.3) / 21.3, 0, 1)), tilt = Math.atan2(2.45, 21.3);
        for (let z = -33.3; z < -11.2; z += 3.7) {
          const zc = z + 1.85, y = exY(zc) - 0.06;
          for (const [fx, rot, sgn] of [[-0.15, 90, 1], [8.15, -90, -1]]) {
            const f = K.prop('fence', fx, zc, rot, { variant: 'paling', len: 3.72, y, collide: false });
            if (f) { f.rotation.order = 'YXZ'; f.rotation.set(0, rot * D2R, sgn * tilt); }
          }
        } }
      K.collider(-0.4, -33.3, 0, -10.8, { h: 2.5 }); K.collider(8, -33.3, 8.4, -10.8, { h: 2.5 });
      K.prop('power_pole', 8.9, -22, 0, { y: 1.3, span: 0 });
      K.prop('streetlight', 0.35, -8.2, 90, { y: 0.15, bank: 4 });
      K.examine(4, 2.2, -28, ['Exchange Road. [beat] Wai said the old exchange was at the top.'], { id: 'c2cr:exrd', r: 2.5 });
      K.exit({ id: 'c2_crescent:backgate', box: [-0.2, -33.4, 8.2, -32.6], to: 'c3_exchangerd', entry: 'gate', when: (s) => s.chapter >= 3 && !!ROOMS.c3_exchangerd, blockedMsg: null, world: 'fog', mapMark: false });
      // the Outage loop: out through the open back gate … and back at the front gate
      K.trigger([0.8, -16.5, 7.2, -12.2], (G) => loopBack(G), { id: 'c2_crescent:loop', once: false, world: 'outage', when: () => inLoop() && S.chapter === 2 });
      // the loop broken: the Outage lifts on the way up, then the chapter card
      K.trigger([0.8, -15.5, 7.2, -11.2], (G) => liftOnTheWayUp(G), { id: 'c2_crescent:lift', once: false, world: 'outage', when: () => S.chapter === 2 && flag('c2_loopBroken') && !World.outageBusy });
      K.trigger([0, -31.9, 8, -29.4], (G) => toTheExchange(G), { id: 'c2_crescent:up', once: false, when: () => S.chapter === 2 && flag('c2_loopBroken') });

      // ---- Unit 9's lockbox, the chase blockers --------------------------------------------------------------------------
      { const [lx, lz] = U9F.p(-2.55, 0.12); K.prop('key_lockbox', lx, lz, U9F.rot, { y: 0.15, mount: 1.25, code: S.done['c2:lockbox'] ? '1947' : '0000' });
        K.interact(lx, 1.3, lz + 0.25, (G) => lockbox(G), { id: 'c2_crescent:lockbox', r: 0.95 }); }
      chaseWall(K, [-2.4, 9.4, 8.2, 10.4], 'No— not that way. Not toward him.');
      chaseWall(K, [52, 9.4, 62.4, 10.4], 'Not that way—');
      chaseWall(K, [0.8, -12.4, 7.2, -11.4], 'It\'s a dead end—');

      // ---- streetlights (sodium) round the ring; the Outage's red LEDs ---------------------------------------------------
      K.prop('streetlight', 13, 8.55, 180, { y: 0.15, bank: 1, world: 'fog' });
      K.prop('streetlight', 44, 8.55, 180, { y: 0.15, bank: 2, world: 'fog' });
      K.prop('streetlight', 16, 31.45, 0, { y: 0.15, bank: 3, world: 'fog' });
      K.prop('streetlight', 44, 31.45, 0, { y: 0.15, lit: false, light: false });
      K.prop('streetlight', 8.45, 14.5, -90, { y: 0.15, bank: 4, world: 'fog' });
      K.prop('streetlight', 51.55, 20, 90, { y: 0.15, bank: 5, flicker: true, world: 'fog' });
      K.prop('streetlight', 9.3, 44.6, -90, { y: 0.15, bank: 6, world: 'fog' });
      K.prop('streetlight', 61.9, -9.5, -90, { y: 0.15, bank: 7, world: 'fog' });
      K.outageOnly(() => {
        for (const [x, z, rot] of [[13, 8.55, 180], [44, 8.55, 180], [16, 31.45, 0], [8.45, 14.5, -90], [51.55, 20, 90], [9.3, 44.6, -90], [61.9, -9.5, -90]]) {
          K.prop('streetlight', x, z, rot, { y: 0.15, lit: false, light: false });
          K.prop('receipt_strip', x + Math.sin(rot * D2R) * 1.4, z + Math.cos(rot * D2R) * 1.4, rot, { ceil: 6.9, len: 3.8 });
        }
        K.light('point', U9DOOR[0] - 0.95, 2.2, U9DOOR[1] + 0.3, { color: '#ff3322', intensity: 3.2, distance: 6, name: 'c2cr:u9red' });
        // every porch light burns red now, the doorsteps a ring of red rooms in the dark
        for (let n = 1; n <= 12; n++) { if (n === 9) continue; const [x, z] = unitFrame(n).p(-2.2, 1.0); K.light('point', x, 2.1, z, { color: '#ff2a1c', intensity: 2.6, distance: 7, flicker: n % 4 === 1 }); }
        // the island: a sick teal glow from the grass, like a screen left on
        for (const [x, z] of [[14, 20], [46, 20], [30, 11], [30, 30]]) K.light('point', x, 1.0, z, { color: '#1f6f6a', intensity: 3.0, distance: 11 });
        K.light('point', 30, 3.2, 28.4, { color: '#ff2a1c', intensity: 1.8, distance: 6, flicker: true });
        K.light('point', 4, 2.8, -10.2, { color: '#e8c21a', intensity: 2.2, distance: 7, flicker: true });
        for (let n = 1; n <= 12; n++) { const [x, z] = unitFrame(n).p(-2.55, 0.14); K.light('led', x, 2.25, z, { color: '#ff2a1c', size: 0.05, halo: 0.6, blink: n === 9 ? false : 2.2, intensity: n === 9 ? 5 : 2.5 }); }
        K.dress('receipts', [1, 1, 59, 7], 26, { seed: 221 }); K.dress('receipts', [1, 33, 59, 39], 22, { seed: 222 });
        K.dress('receipts', [1, 9, 7, 31], 14, { seed: 223 }); K.dress('receipts', [53, 9, 59, 31], 14, { seed: 224 });
        K.dress('contracts', [-4.5, -4.5, 60, -2.6], 18, { seed: 225 });
        K.writing('WHO ARE YOU TRYING TO REACH', 30, 2.3, 26.13, 4.4, { style: 'receipt', world: 'outage' });
        K.writing('FOLLOW UP TOMORROW', U9DOOR[0] + 2.8, 2.2, U9DOOR[1] + 0.13, 2.4, { world: 'outage' });
        K.writing('DID YOU CHECK', unitFrame(3).x(1.9, 0.14), 2.35, unitFrame(3).z(1.9, 0.14), 1.6, { rotY: 180, world: 'outage' });
        K.writing('ASK THEM', unitFrame(11).x(1.9, 0.14), 2.35, unitFrame(11).z(1.9, 0.14), 1.3, { rotY: 90, world: 'outage' });
        // receipt paper curling down off the gutters; security tether coiled through the pansies like a creeper
        for (const n of [2, 5, 7, 8, 10, 12]) { const [x, z] = unitFrame(n).p(2.4 + (n % 3) * 0.7, 0.42); K.prop('receipt_strip', x, z, unitFrame(n).rot + 20, { ceil: 2.86, len: 1.1 + (n % 2) * 0.5 }); }
        for (const n of [3, 4, 6, 9, 11]) { const b = unitFrame(n).box(0.6, 0.3, 3.2, 0.8); K.dress('cables', b, 4, { seed: 300 + n }); }
      });
      K.writing("IT'LL BE FINE", unitFrame(7).x(3.4, 0.13), 2.3, unitFrame(7).z(3.4, 0.13), 1.5, { rotY: 0, world: 'fog' });
      K.examine(unitFrame(7).x(3.4, 0.6), 1.6, unitFrame(7).z(3.4, 0.6), 'Somebody\'s written on the bricks. "It\'ll be fine." [beat] It keeps turning up.', { id: 'c2cr:writing7', r: 1.3 });
      // examine lines for the street itself
      K.examine(13, 1.4, 8.1, ['The light makes a room in the fog. [beat] Nothing past it.'], { id: 'c2cr:light', r: 1.3 });
      K.examine(30, 1.0, 0.5, ['Twelve units. All the same. Brick, a porch, a letterbox, a box on the step.', 'Every one of them blinking red.'], { id: 'c2cr:units', r: 1.4 });
      K.examine(unitFrame(4).x(1.8, 0.7), 1.5, unitFrame(4).z(1.8, 0.7), ['There\'s someone standing in there. [beat] Just standing. Watching me.', 'It hasn\'t moved.'], { id: 'c2cr:win4', r: 1.6 });
      K.dress('leaves', [1, 1, 59, 7], 20, { seed: 231 }); K.dress('leaves', [1, 33, 59, 39], 18, { seed: 232 });
      K.dress('leaves', [1, 9, 7, 31], 10, { seed: 233 }); K.dress('leaves', [53, 9, 59, 31], 10, { seed: 234 });
      bags.flush(K);
    },
    async onEnter(G, from) {
      // first time through the gate
      if (from === 'c2_hilltoprd' && G.once('c2:arrive')) {
        G.note('Unit 9, Hilltop Village. Visitors sign in at the office.', { id: 'c2_goal' });
        G.mapMark('c2_unit9', { at: [U9DOOR[0], U9DOOR[1]], t: 'circle' });
        await G.wait(0.8);
        await G.think('Twelve of them. All the same. [beat] Nine\'s somewhere round the loop.');
      }
      // out of her unit with the modem in: 2-2, then the chase
      if (from === 'c2_unit9' && flag('c2_modemIn') && !S.done['cs:2-2'] && !S.outage) {
        await G.cutscene('2-2');
        return;
      }
      // a chase resumed from a save: he's back there in the fog
      if (chasing() && !Enemies.get('c2:luke')) { C2.fogTo = 0.06; startPursuit(G, U9DOOR[0], 1.5, 90, { delay: 2.0, shoutAt: 1.0 }); }
      if (flag('c2_loopBroken') && S.chapter === 2 && G.once('c2:gateMark')) G.mapMark('c2_backgate', { at: [4, -10.5], t: 'circle' });
      if (S.outage && inLoop()) {
        if (from === 'c2_garages' && G.once('c2:loopIn')) { await G.wait(1.0); await G.think('The numbers on the doors. [beat] That one\'s upside down.'); }
        const n = loopN();
        if (from === 'c2_crescent' && n > 0 && G.once('c2:loop' + n)) {
          await G.wait(0.6);
          G.sfx('static', { dur: 0.6, vol: 0.35, phone: true });
          if (n === 1) { await G.think('...That\'s the front gate. [beat] I went out the back.'); G.note('It keeps bringing me back. [beat] Back to her door.', { id: 'c2_loop' }); }
          else if (n === 2) { await G.think('Again. [beat] More of them say nine.'); G.note('Every door says nine. Her door.', { id: 'c2_loop' }); }
          else { await G.think('All of them. [beat] Every one of them is hers.'); G.note('Go back in. Unit 9.', { id: 'c2_loop' }); }
        }
      }
    },
    onUpdate(dt) { fogStep(dt, null); },
    onLeave() { C2.fogTo = null; C2.chaseWalls = []; },
  });

  // the loop (GAMEPLAY 2-5): out through the back gate … and back in at the front gate, with more nines
  async function loopBack(G) {
    if (!inLoop() || World.outageBusy) return;
    S.flags.c2_loopN = loopN() + 1;
    G.sfx('dialup', { dur: 1.2, vol: 0.35 });
    await G.goto('c2_crescent', 'gate', { sound: 'steps' });
  }
  // after the pendant: the Outage lifts on the way up Exchange Road
  async function liftOnTheWayUp(G) {
    if (!S.outage || World.outageBusy) return;
    G.control(true);
    await G.outage(false);
    if (G.once('c2:lifted')) { await G.wait(0.8); await G.think('Just fog. [beat] Just fog again.'); G.note('The old exchange. Top of Exchange Road. Wai.', { id: 'c2_goal' }); }
  }
  // …and the chapter card: SIGNAL HILL TRUNK EXCHANGE
  async function toTheExchange(G) {
    if (S.chapter !== 2) return;
    if (World.outageBusy) await G.until(() => !World.outageBusy, { timeout: 8 });
    if (S.outage) G.setOutage(false);
    try { Phone.done && Phone.done('c2_goal'); } catch (e) { /* notes */ }
    const ok = await G.startChapter(3);
    if (ok === false) {
      // (no Chapter 3 in this build: show its card and hand the road back)
      await G.card('SIGNAL HILL TRUNK EXCHANGE');
      await G.fade(0, 1.0);
    }
  }

  // =================================================================================================================
  // 2B — THE VILLAGE OFFICE. Main office x 0…8 (the counter at x 4.6: staff side west, visitors east), the foyer
  // x 8…10.6 (the payphone, the door out onto the drive at x 10.6), the window onto the gate in the south wall.
  // =================================================================================================================
  const bookTex = () => ctex('vbook', 512, 320, (x, w, h, r) => {
    x.fillStyle = '#efe9d6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d8cfb4'; x.fillRect(w / 2 - 3, 0, 6, h);
    x.strokeStyle = 'rgba(90,120,180,0.35)'; x.lineWidth = 1;
    for (let yy = 40; yy < h; yy += 30) { x.beginPath(); x.moveTo(8, yy); x.lineTo(w / 2 - 8, yy); x.moveTo(w / 2 + 8, yy); x.lineTo(w - 8, yy); x.stroke(); }
    for (const [cx, lab] of [[12, 'DATE'], [62, 'NAME'], [162, 'VISITING'], [w / 2 + 12, 'DATE'], [w / 2 + 62, 'NAME'], [w / 2 + 162, 'VISITING']]) tx(x, lab, cx, 26, 11, '#6a5a44', { font: FN.sans, weight: 'bold' });
    const L = [['03/11', 'Marg B.', 'Unit 4'], ['17/02', 'Council', 'gutters'], ['11/05', 'Deb', 'Unit 2'], ['20/06', 'Luke', 'Nan (Unit 9)']];
    L.forEach(([d, n, v], i) => {
      const left = i < 2, bx = left ? 0 : w / 2, yy = 60 + (i % 2) * 60 + (left ? 0 : 60);
      hand(x, d, bx + 12, yy, { size: 18, color: i === 3 ? '#141414' : '#1f2c6e' });
      hand(x, n, bx + 62, yy, { size: 22, color: i === 3 ? '#141414' : '#1f2c6e' });
      hand(x, v, bx + 162, yy, { size: i === 3 ? 18 : 20, color: i === 3 ? '#141414' : '#1f2c6e' });
    });
    age(x, w, h, r, 0.5);
  });
  const keyCabTex = () => ctex('keycab', 256, 200, (x, w, h, r) => {
    x.fillStyle = '#8a8f8a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d6d2c4'; x.fillRect(8, 8, w - 16, h - 16);
    tx(x, 'SPARE KEYS — UNITS', w / 2, 30, 14, '#333', { font: FN.sans, weight: 'bold', align: 'center' });
    for (let i = 0; i < 12; i++) {
      const cx = 28 + (i % 6) * 40, cy = 64 + Math.floor(i / 6) * 70;
      x.fillStyle = '#555'; x.beginPath(); x.arc(cx, cy, 4, 0, Math.PI * 2); x.fill();
      tx(x, String(i + 1), cx, cy - 10, 11, '#333', { font: FN.sans, align: 'center' });
      if (i !== 8) { x.strokeStyle = '#b89a52'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy + 12, 7, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#e8e2c8'; x.fillRect(cx - 7, cy + 20, 14, 18); }
    }
    age(x, w, h, r, 0.6);
  });
  const pamphletTex = () => ctex('pamphlet', 128, 192, (x, w, h, r) => {
    x.fillStyle = '#f2f0e8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#00a8a8'; x.fillRect(0, 0, w, 42);
    tx(x, 'IS YOUR', w / 2, 18, 12, '#fff', { font: FN.sans, weight: 'bold', align: 'center' });
    tx(x, 'MEDICAL ALARM', w / 2, 34, 12, '#fff', { font: FN.sans, weight: 'bold', align: 'center' });
    tx(x, 'READY?', w / 2, 64, 20, '#b3261e', { font: FN.heavy, weight: '900', align: 'center' });
    for (let i = 0; i < 7; i++) { x.fillStyle = '#9a9a92'; x.fillRect(12, 86 + i * 12, w - 24 - (i % 3) * 14, 4); }
    x.fillStyle = '#ffcc00'; x.fillRect(0, h - 22, w, 22);
    age(x, w, h, r, 0.4);
  });
  async function visitorBook(G) {
    const first = !S.done['c2:book'];
    S.done['c2:book'] = true;
    if (first) {
      await G.run(async (G2) => {
        G2.cam({ pos: [5.3, 1.72, 1.74], target: [4.82, 1.15, 1.75], fov: 40, to: { pos: [5.24, 1.66, 1.74], fov: 36 }, dur: 6 });
        await G2.wait(2.4);
        await G2.think('Luke.');
        await G2.wait(0.8);                                             // [beat]
        await G2.aidan.gesture('pen_click', { hand: 'L' });              // (pen click)
        await G2.think("I don't know a Luke.");
        G2.camRelease();
      }, { control: false, letterbox: false, skippable: true, name: 'c2:book' });
      await G.think("There's a sticky note tucked inside the cover.");
    }
    await G.doc(docPick('lockbox_note'));
    if (first || G.once('c2:notethought')) await G.think('Her birth year. I never even asked her age.');
    G.note(riddle() === 'easy' ? 'Unit 9\'s lockbox: 1947. Her birth year.' : 'Unit 9\'s lockbox: her birth year.', { id: 'c2_code' });
  }
  async function birthdayCard(G) {
    const hard = riddle() === 'hard';
    await G.doc(hard ? 'birthday_card_hard' : 'birthday_card');
    if (!hard) { await G.think('Seventy-nine this year.'); G.note('Seventy-nine this year. June.', { id: 'c2_card' }); }
    else { await G.think('Born the year the Route 44 depot opened. [beat] Whenever that was.'); G.note('Born the year the Route 44 depot opened.', { id: 'c2_card' }); }
  }
  defineRoom({
    id: 'c2_office', name: 'VILLAGE OFFICE', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: false, surface: 'vinyl', ambient: 'interior',
    fog: { density: 0.032, color: '#3b4543' },
    surfaces: [{ box: [8, 0, 10.6, 6], s: 'lino' }],
    bounds: [0, 0, 10.6, 6],
    entries: { door: [9.85, 3.8, -90], start: [9.85, 3.8, -90] },
    cameras: [
      // high, from behind the counter: the visitors' side, the book on the counter, the noticeboard
      { id: 'c2_office:counter', vol: [4.5, 0, 8.1, 6], type: 'static', pos: [0.45, 2.5, 0.45], target: [6.6, 0.7, 3.9], fov: 'fit' },
      // through the office window, from out by the gate: the desk lamp, the staff side
      { id: 'c2_office:window', vol: [0, 0, 4.6, 3.9], type: 'static', pos: [2.45, 2.4, 10.4], target: [2.2, 0.7, 1.4], fov: 'fit' },
      // over the counter at the break table and the kitchenette
      { id: 'c2_office:staff', vol: [0, 3.85, 4.6, 6], type: 'static', pos: [7.6, 2.55, 0.5], target: [2.0, 0.6, 4.8], fov: 'fit' },
      // the foyer from its north end (past the cutaway wall): the payphone off the hook at the far end, the glass door
      { id: 'c2_office:foyer', vol: [7.9, 0, 10.6, 6], pri: 1, type: 'static', pos: [9.55, 2.3, -4.6], target: [9.2, 0.85, 3.6], fov: 'fit' },
    ],
    build(K) {
      const H = 2.7;
      K.floor(0, 0, 8, 6, { tex: 'vinyl_retail', color: '#8a8472' });
      K.floor(8, 0, 10.6, 6, { tex: 'lino', color: '#7a7466' });
      K.ceiling(0, 0, 10.6, 6, H, 'ceiling_tile');
      const PW = { tex: 'plaster', color: '#b8b09a' };
      K.wall(-0.075, 0, 8, 0, H, PW, { skirting: true });                                                  // north (office)
      K.wall(8, 0, 10.675, 0, H, PW, { skirting: true, both: false });                                     // north (foyer: cutaway)
      K.wall(0, 6.075, 0, -0.075, H, PW, { skirting: true });                                              // west
      K.wall(0, 6, 10.6, 6, H, PW, { skirting: true, openings: [{ at: 2.5, w: 2.6, h: 1.3, sill: 0.9, glass: true, frame: true }] });   // south (the window onto the gate)
      K.wall(10.6, 0, 10.6, 6, H, PW, { skirting: true, both: false, openings: [{ at: 3.8, w: 1.1, h: 2.25 }, { at: 1.3, w: 1.2, h: 1.1, sill: 1.0, glass: true, frame: true }] });   // east (cutaway)
      K.wall(8, 0, 8, 6, H, PW, { skirting: true, openings: [{ at: 3.8, w: 1.8, h: 2.3 }] });            // office | foyer
      K.door({ id: 'c2_office:door', x: 10.6, z: 3.8, rot: 90, w: 1.0, h: 2.2, style: 'glass', to: 'c2_crescent', entry: 'office' });
      // the counter (staff behind to the west), the visitor book with its pen on a chain, the bell
      K.prop('counter', 4.6, 2.55, 90, { len: 4.0, variant: 'reception', clutter: false });
      // (on the raised visitors' ledge: top at 1.14 m, x 4.68…4.94)
      K.box(4.82, 1.14, 1.75, 0.3, 0.014, 0.44, { color: '#2a3a5a', roughness: 0.6 });
      K.plane(4.82, 1.1555, 1.75, 0.42, 0.28, bookTex(), { rot: [-90, 0, 90] });
      K.box(4.9, 1.157, 1.98, 0.012, 0.006, 0.12, { color: '#1b1c1c' });                       // the pen on its chain
      K.cyl(4.8, 1.14, 2.3, 0.035, 0.03, { tex: 'metal', color: '#c9a84a', metalness: 0.8, roughness: 0.3 }); K.sphere(4.8, 1.19, 2.3, 0.04, { tex: 'metal', color: '#c9a84a', metalness: 0.8, roughness: 0.3 });
      K.interact(4.95, 1.15, 1.75, (G) => visitorBook(G), { id: 'c2_office:book', r: 1.25 });
      K.examine(4.95, 1.15, 2.35, ['A bell on the counter. [beat] I don\'t ring it.', 'Who would come?'], { id: 'c2of:bell', r: 0.8 });
      // the visitors' side: the noticeboard and the birthday card, the Site Plan, pamphlets, two chairs
      K.prop('notice_board', 6.4, 5.93, 180, { title: 'RESIDENTS\' NOTICES', w: 1.3, h: 0.9, mount: 1.55 });
      K.doc('noticeboard', 6.2, 1.45, 5.82, { id: 'c2_office:notices', model: 'none', r: 1.2 });
      K.plane(7.0, 1.22, 5.86, 0.2, 0.25, cardTex(riddle() === 'hard'), { rotY: 180 });
      K.interact(7.0, 1.25, 5.7, (G) => birthdayCard(G), { id: 'c2_office:card', r: 0.8 });
      K.doc(riddle() === 'hard' ? 'timetable_hard' : 'timetable', 5.5, 1.3, 5.86, { id: 'c2_office:timetable', model: 'paper', wall: true, rot: 180, r: 0.75 });
      const planTaken = !!(S.taken && S.taken['c2_office:map']);
      K.box(7.05, 1.12, 0.03, 0.96, 0.7, 0.02, { color: '#3a3a36' });
      if (!planTaken) K.plane(7.05, 1.47, 0.045, 0.9, 0.64, sitePlanTex(), { name: 'c2_siteplan' });
      else K.plane(7.05, 1.47, 0.045, 0.9, 0.64, { color: '#c9c2ae', roughness: 1 });
      K.pickup('map_village', 7.05, 1.3, 0.25, { id: 'c2_office:map', model: false, r: 1.0 });
      K.animate(() => { if (S.taken && S.taken['c2_office:map']) { const p = World.obj && World.obj('c2_siteplan'); if (p && p.visible) p.visible = false; } });
      K.box(5.7, 0.9, 0.05, 0.5, 0.7, 0.06, { tex: 'metal', color: '#6a6e6a' });
      for (let i = 0; i < 3; i++) K.plane(5.55 + i * 0.15, 1.2, 0.09, 0.12, 0.18, pamphletTex(), { rot: [-8, 0, 0] });
      K.examine(5.7, 1.2, 0.35, ['"Is your medical alarm ready?" [beat] A whole rack of them.', 'Nobody\'s taken one.'], { id: 'c2of:pamphlets', r: 1.0 });
      K.prop('cardigan_chair', 7.55, 4.6, -90, { chair: 'plastic', color: '#6a7a8a' });
      K.prop('chair', 7.55, 3.9, -90, { variant: 'plastic' });
      K.examine(7.4, 0.8, 4.3, ['Two chairs for visitors. Somebody left a cardigan on one.', 'It\'s been folded over the back. Like they meant to come back for it.'], { id: 'c2of:chairs', r: 1.1 });
      K.prop('plant_pot', 7.6, 0.4, 0, { variant: 'fern' });
      // the staff side: the desk (the lamp that's still on), the key cabinet, filing cabinets, the break table
      K.prop('desk', 1.6, 0.75, 0, { variant: 'timber', clutter: false });
      K.prop('office_chair', 1.6, 1.5, 180);
      K.prop('crt', 1.35, 0.55, 10, { y: 0.745, content: 'off' });
      K.prop('desk_phone', 2.1, 0.6, -15, { y: 0.745 });
      K.prop('desk_lamp', 0.95, 0.6, 30, { y: 0.745, lit: true, bank: 1 });
      K.prop('mug', 2.3, 0.95, 0, { y: 0.745, text: 'I\'D RATHER BE AT BINGO' });
      K.box(1.9, 0.745, 0.95, 0.3, 0.05, 0.22, { tex: 'paper', color: '#e8e2d0' }, { rot: 8 });
      K.examine(1.4, 1.0, 0.9, ['The office computer. Beige. It\'s older than me.', 'A sticky note on the screen: "Council about the gutters!!"'], { id: 'c2of:crt', r: 1.1 });
      K.examine(2.1, 0.95, 0.75, ['A label on the phone: "AFTER HOURS — RING THE ON-CALL NURSE." The number\'s been crossed out.', 'Nobody wrote a new one.'], { id: 'c2of:phone', r: 1.0 });
      K.examine(0.9, 1.0, 0.7, 'The desk lamp\'s on. [beat] Somebody was working late, and then they weren\'t.', { id: 'c2of:lamp', r: 1.0 });
      K.box(0.06, 1.1, 2.3, 0.08, 0.62, 0.8, { tex: 'metal', color: '#8a8f8a' }, { rot: 0 });
      K.plane(0.105, 1.41, 2.3, 0.72, 0.56, keyCabTex(), { rotY: 90 });
      K.examine(0.5, 1.4, 2.3, ['Spare keys for every unit, each on its own hook. [beat] Except 9.', 'The hook for 9 is empty.'], { id: 'c2of:keys', r: 1.1 });
      K.prop('filing_cabinet', 0.3, 3.35, 90); K.prop('filing_cabinet', 0.3, 3.9, 90);
      K.examine(0.6, 1.0, 3.6, ['RESIDENTS A–M. RESIDENTS N–Z. [beat] I\'m not going through their files.'], { id: 'c2of:files', r: 1.0 });
      K.pickup('first_aid', 0.32, 1.32, 3.6, { id: 'c2_office:firstaid' });
      K.prop('first_aid_box', 3.4, 0.075, 0, { mount: 1.55 });
      K.prop('roster', 3.0, 5.925, 180, { title: 'HILLTOP VILLAGE — JUNE', mount: 1.55 });
      K.examine(3.0, 1.5, 5.6, ['Lawn mowing Tuesday. Bingo Thursday. Bins Monday night.', 'Every week the same. Somebody liked it that way.'], { id: 'c2of:roster', r: 1.0 });
      K.prop('sink_bench', 0.32, 5.1, 90, { len: 1.5, variant: 'office' });
      K.prop('microwave', 0.3, 5.5, 90, { y: 0.9, time: '--:--' });
      K.examine(0.5, 1.1, 5.1, ['A mug in the microwave. Tea, gone cold. [beat] They never came back for it.'], { id: 'c2of:microwave', r: 1.0 });
      K.prop('fridge', 0.4, 4.3, 90, { variant: 'office' });
      K.breakTable(2.4, 4.75, 0, { id: 'c2_office:break', time: [3, 25], clock: [0.09, 2.1, 4.6, 90] });
      K.pickup('coffee', 2.2, 0.745, 4.65, { id: 'c2_office:coffee', rot: 20 });
      K.examine(2.2, 1.1, 5.9, 'You can see the gate from this window. [beat] Somebody sat here and watched who came in.', { id: 'c2of:window', r: 1.2 });
      K.prop('water_stain', 5.8, 5.93, 180, { w: 0.9, h: 0.6, mount: 2.3 });
      K.prop('water_stain', 2.6, 3.0, 0, { surface: 'ceiling', ceil: H, w: 1.3, h: 1.0 });
      K.dress('papers', [0.6, 1.8, 4.2, 3.6], 6, { seed: 241 });
      // the foyer: the wall payphone (save), the umbrella stand, "please sign in"
      K.payphone(9.3, 5.92, 180, { wall: true, id: 'c2_office:payphone' });
      K.cyl(10.2, 0, 0.5, 0.14, 0.55, { tex: 'metal', color: '#3a3a36' }); K.cyl(10.24, 0.2, 0.52, 0.012, 0.8, '#1b1c1c', { rz: 8 });
      K.box(9.9, 0, 3.8, 0.9, 0.012, 0.6, { tex: 'carpet', color: '#4a3a2a' }, { shadow: false });
      K.plane(8.08, 1.55, 1.6, 0.4, 0.3, boardTex('signin2', ['PLEASE SIGN', 'IN AT THE', 'COUNTER →'], { w: 256, h: 192, bg: '#f2efe6', fg: '#1f3a2e', border: '#1f3a2e' }), { rotY: 90 });
      K.examine(10.1, 0.8, 0.6, ['An umbrella stand. One umbrella, still wet. [beat] It hasn\'t rained.'], { id: 'c2of:umbrella', r: 1.0 });
      K.plane(8.08, 1.35, 5.1, 0.34, 0.46, boardTex('residentsphone', ['RESIDENTS\'', 'PHONE', '', 'Local calls', 'free'], { w: 192, h: 256, bg: '#efe9d6', fg: '#1f3a2e', size: [30, 30, 10, 20, 20], border: '#1f3a2e' }), { rotY: 90 });
      K.prop('exit_sign', 10.52, 3.8, -90, { mount: 2.45 });
      // lights: the desk lamp (above); the foyer tube flickers; the Outage's own
      K.fogOnly(() => { K.prop('fluoro_tube', 9.3, 3.0, 90, { h: H - 0.02, flicker: true, bank: 2 }); K.prop('fluoro_tube', 4.0, 3.0, 0, { h: H - 0.02, lit: false, light: false }); });
      K.outageOnly(() => {
        K.prop('fluoro_tube', 4.0, 3.0, 0, { h: H - 0.02, flicker: true });
        K.light('led', 4.35, 1.08, 1.2, { color: '#ff2a1c', blink: 0.9, size: 0.02, halo: 0.3 });
        K.prop('receipt_strip', 6.2, 2.4, 20, { ceil: H, len: 1.6 }); K.prop('receipt_strip', 2.2, 2.8, 70, { ceil: H, len: 1.2 });
        K.prop('receipt_strip', 9.2, 2.2, 30, { ceil: H, len: 1.1 });
        K.dress('receipts', [4.8, 0.4, 7.8, 5.6], 16, { seed: 242 });
        K.writing('ASK THEM', 7.99, 1.9, 1.4, 1.3, { rotY: -90, world: 'outage' });
        K.writing('VISITORS PLEASE SIGN IN', 2.5, 1.9, 0.08, 2.4, { style: 'receipt', world: 'outage' });
      });
    },
  });

  // =================================================================================================================
  // 2D — UNIT 9. Local: x 0…10, z 0…8, the front door in the south wall at x 4.0. Hall x 3.3…4.7 (z 1.2…8), lounge east
  // (x 4.7…10, z 3.6…8), bedroom (x 4.7…10, z 0…3.6), kitchen west (x 0…3.3, z 0…5), bathroom (z 5…8, closed). Cameras
  // sit outside one-sided walls (cutaways). In the Outage the kitchen doorway is a door into c2_kitchen_out.
  // =================================================================================================================
  const U9K = { chair: [1.55, 2.35], base: [0.34, 1.0, 1.35], fridge: [2.75, 0.42], table: [1.95, 3.55] };
  async function modemBoot(G, m) {
    const lcd = G.obj('c2_modemlcd');
    if (lcd) lcd.visible = false;
    if (!m || !m.userData || !m.userData.boot) { await G.wait(4); if (lcd) lcd.visible = true; return; }
    G.sfx('modem_boot', { pos: [U9.modem[0], U9.modem[1] + 0.1, U9.modem[2]], vol: 0.7 });
    if (G.skipping) m.userData.setState('red');
    else { const p = m.userData.boot(4); let done = false; p.then(() => { done = true; }); await G.until(() => done || G.skipping, { timeout: 6 }); if (!done) m.userData.setState('red'); }
    if (lcd) lcd.visible = true;
    G.sfx('beep', { pos: [U9.modem[0], U9.modem[1], U9.modem[2]], vol: 0.3 });
  }
  async function plugModem(G) {
    const A = G.aidan;
    await A.walkTo(U9.socket[0] + 0.1, U9.socket[1] + 0.85, { speed: 1.2 });
    await A.turn([U9.socket[0], U9.socket[1]], 0.4);
    G.cam({ pos: [7.1, 1.35, 5.9], target: [5.55, 0.45, 3.95], fov: 36, to: { fov: 30 }, dur: 6 });
    A.pose('crouch');
    G.sfx('plastic', { vol: 0.6, dur: 0.8 });
    await G.wait(1.0);
    // state first (a skip lands here the same way)
    G.take('returned_modem', 1);
    G.set('c2_modemIn', true);
    const m = G.obj('c2_modem'); if (m) m.visible = true;
    const pl = G.obj('c2_modemplug'); if (pl) pl.visible = true;
    G.sfx('click', { vol: 0.7 });
    await G.wait(0.4);
    await modemBoot(G, m);
    await G.wait(0.8);
    A.pose('idle');
    G.camRelease();
    G.note('It won\'t connect. [beat] NO SERVICE.', { id: 'c2_goal' });
    G.prompt('{interact}: restart the modem', { id: 'c2_restart' });
  }
  async function restartModem(G) {
    const n = (S.done['c2:restarts'] | 0) + 1;
    S.done['c2:restarts'] = n;
    const m = G.obj('c2_modem');
    await G.run(async (G2) => {
      const A = G2.aidan;
      await A.turn([U9.socket[0], U9.socket[1]], 0.3);
      A.pose('crouch');
      G2.sfx('click', { vol: 0.6 });
      if (n < 3) G2.cam({ pos: [6.3, 0.7, 5.0], target: [5.55, 0.62, 4.0], fov: 32 });
      await modemBoot(G2, m);
      if (n === 1) { await G2.say('AIDAN', 'Come on.'); A.pose('idle'); }
      else if (n === 2) { await G2.say('AIDAN', 'Come on, come on.'); A.pose('idle'); }
      else {
        // silence. He sits down on the arm of the couch. The restart prompt disappears.
        try { UI.prompt(null, { id: 'c2_restart' }); } catch (e) { /* ui */ }
        A.pose('idle');
        await A.walkTo(U9.couchArm[0], U9.couchArm[1], { speed: 0.9 });
        await A.turn(200, 0.6);
        G2.cam({ pos: [9.3, 1.05, 7.3], target: [6.55, 0.9, 4.35], fov: 40, to: { pos: [9.1, 1.08, 7.1], fov: 34 }, dur: 9 });
        A.pose('sit', { seat: 0.62 });
        if (A.raw) { A.raw.idleLife = false; A.raw.eyes('down'); A.raw.expr('tired'); }
        await G2.wait(5.5);
        if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); }
        await A.gesture('stand_up', { to: 'idle' });
        G2.note('It won\'t connect. Nothing up here connects.', { id: 'c2_goal' });
      }
      G2.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'c2:restart' + n });
  }
  async function answeringMachine(G) {
    const pt = G.obj('c2_phonetable');
    if (S.done['c2:machine']) { G.sfx('beep', { vol: 0.3 }); await G.think('No new messages. [beat] Just the one. The one I already heard.'); return; }
    await G.run(async (G2) => {
      const A = G2.aidan;
      await A.turn([3.52, 4.7], 0.4);
      G2.cam({ pos: [4.45, 1.55, 5.9], target: [3.55, 0.85, 4.7], fov: 34, to: { fov: 28 }, dur: 12 });
      A.gesture('reach', { hand: 'L', target: [3.55, 0.85, 4.75], dur: 0.7 }).catch(() => {});
      G2.sfx('click', { vol: 0.6 }); await G2.wait(0.6);
      G2.sfx('beep', { vol: 0.4 }); await G2.wait(0.7);
      if (pt && pt.userData.setBlink) pt.userData.setBlink(false);
      G2.music('tomorrow', { clipped: true, vol: 0.45 });
      await G2.say('ANSWERING MACHINE (phone)', 'This is a courtesy message regarding case one-one-eight, two-two-three-one. Your callback has been scheduled for: tomorrow.');
      S.done['c2:machine'] = true;
      G2.track('F', 1, 'unit9 answering machine');
      if (pt && pt.userData.setCount) pt.userData.setCount(0);
      G2.sfx('beep', { vol: 0.4 });
      await G2.wait(1.4);
      G2.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'c2:machine' });
  }
  async function fridgeList(G) {
    const first = !S.done['c2:fridge'];
    await G.doc('fridge_list');
    if (!first) return;
    S.done['c2:fridge'] = true;
    await G.run(async (G2) => {
      const A = G2.aidan;
      if (A.raw) { A.raw.idleLife = false; A.raw.eyes('down'); }
      G2.cam({ pos: [2.1, 1.7, 1.9], target: [2.75, 1.25, 0.6], fov: 38, to: { fov: 32 }, dur: 8 });
      await G2.wait(3.0);                       // a long silence
      await G2.say('AIDAN', 'She asked. [beat] I said...');
      await G2.wait(1.6);
      if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); }
      G2.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'c2:fridge' });
  }
  async function dresserPhoto(G) {
    await G.run(async (G2) => {
      G2.cam({ pos: [5.75, 1.25, 0.95], target: [4.98, 0.9, 0.62], fov: 30 });
      await G2.think('On the back, in pencil: "Me and Luke, Year 7 sports day."');
      await G2.think('Luke.');
      G2.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'c2:photo' });
  }
  async function leaveUnit9(G) {
    if (!flag('c2_modemIn') && !S.outage) { await G.think('The modem first. That\'s what I came for.'); return; }
    await G.goto('c2_crescent', 'unit9', { sound: 'door' });
  }
  // 2-1's fog spilling in over the hall carpet when the front door opens (six drifting layers of the fog texture; hidden
  // until C2.spill is set, then it rolls in about three metres and thins away)
  function buildSpill(K) {
    const g = new THREE.Group(); g.name = 'c2u9:spill';
    // soft-edged wisps (radial falloff × blotches) so no layer shows an edge
    const tex = ctex('spill', 256, 256, (x, w, h, r) => {
      x.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const cx = w * (0.18 + r() * 0.64), cy = h * (0.12 + r() * 0.76), rad = w * (0.06 + r() * 0.16);
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gr.addColorStop(0, `rgba(255,255,255,${0.1 + r() * 0.12})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
      const m = x.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5);
      m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = m; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
    });
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#c4ccc9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25 - (i % 3) * 0.1, 1.6 + i * 0.35), mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = (i - 2.5) * 0.08;
      m.position.set(4.0 + ((i % 2) ? 0.07 : -0.07), 0.05 + i * 0.09, 8.4);
      m.renderOrder = 5;
      g.add(m); parts.push(m);
    }
    // the door's own breath of fog: a vertical sheet in the doorway
    const vmat = new THREE.MeshBasicMaterial({ map: tex, color: '#c4ccc9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const vs = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), vmat); vs.position.set(4.0, 1.05, 8.1); vs.renderOrder = 5; g.add(vs);
    g.visible = false;
    K.mesh(g, { static: false, name: 'c2u9:spill', world: 'fog' });
    K.animate((dt) => {
      if (C2.spill === null || C2.spill === undefined) { if (g.visible) g.visible = false; return; }
      C2.spill += dt;
      const t = C2.spill;
      if (t > 11) { C2.spill = null; g.visible = false; return; }
      g.visible = true;
      parts.forEach((m, i) => {
        const k = clamp((t - i * 0.12) / 3.2, 0, 1), e = 1 - (1 - k) * (1 - k);
        m.position.z = 8.4 - e * (1.6 + i * 0.28);
        m.material.opacity = Math.min(e * 3, 1) * (0.95 - i * 0.08) * (1 - clamp((t - 5.5) / 5, 0, 1));
        m.rotation.z = (i - 2.5) * 0.08 + Math.sin(t * 0.3 + i) * 0.05;
      });
      vs.material.opacity = 0.8 * clamp(t / 0.6, 0, 1) * (1 - clamp((t - 1.4) / 2.2, 0, 1));
      vs.position.z = 8.1 - clamp(t / 3, 0, 1) * 0.6;
    });
  }
  defineRoom({
    id: 'c2_unit9', name: 'UNIT 9', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: false, surface: 'carpet', ambient: 'interior',
    fog: { density: 0.034, color: '#343e3c' },
    surfaces: [{ box: [0, 0, 3.3, 5], s: 'lino' }],
    bounds: [0, 0, 10, 8],
    entries: { door: [4.0, 7.35, 180], kitchen: [3.98, 3.0, 90], start: [4.0, 7.35, 180] },
    cameras: [
      // from the far end of the hall, high under the ceiling: the front door, the bathroom door, the lounge doorway
      { id: 'c2_unit9:hall', vol: [3.2, 5.0, 4.8, 8], type: 'static', pos: [4.0, 2.36, 1.32], target: [4.0, 0.75, 7.4], fov: 'fit' },
      // the reverse, from over the front door: the long hall to the linen press, her doorways either side
      { id: 'c2_unit9:hallN', vol: [3.2, 1.2, 4.8, 5.0], type: 'static', pos: [4.0, 2.36, 7.86], target: [4.0, 0.7, 1.9], fov: 'fit' },
      // the lounge, from out past its east wall (cutaway): the couch, the socket at the far end, the window's orange glow
      { id: 'c2_unit9:lounge', vol: [4.8, 3.6, 10, 8], type: 'static', pos: [14.3, 2.22, 6.4], target: [6.7, 0.62, 5.5], fov: 'fit' },
      // the bedroom, from out past the east wall
      { id: 'c2_unit9:bedroom', vol: [4.8, 0, 10, 3.65], type: 'static', pos: [14.4, 2.1, 1.8], target: [6.8, 0.55, 1.8], fov: 'fit' },
      // the kitchen, high, like CCTV
      { id: 'c2_unit9:kitchen', vol: [0, 0, 3.35, 5], type: 'static', pos: [2.5, 2.45, -3.9], target: [1.55, 0.35, 3.1], fov: 'fit', world: 'fog' },
      // low, past the fallen chair he never looks at, toward the doorway
      { id: 'c2_unit9:chair', vol: [1.9, 2.2, 3.35, 4.2], pri: 1, type: 'static', pos: [0.62, 0.36, 1.3], target: [3.25, 1.05, 3.05], fov: 'fit', world: 'fog' },
    ],
    build(K) {
      const H = 2.5;
      const WP = { tex: 'plaster', color: '#b7ae94' }, WK = { tex: 'plaster', color: '#c3c0a6' };
      // floors and ceilings
      K.floor(3.3, 1.2, 4.7, 8, { tex: 'carpet', color: '#5a4436' });
      K.floor(4.7, 3.6, 10, 8, { tex: 'carpet', color: '#6a5a44' });
      K.floor(4.7, 0, 10, 3.6, { tex: 'carpet', color: '#5e5a66' });
      K.floor(0, 0, 3.3, 5, { tex: 'lino', color: '#9a8e6a' }, { world: 'fog' });
      K.ceiling(0, 0, 10, 8, H, { tex: 'plaster', color: '#8a867a' });
      // exterior walls (cutaways where a camera stands outside)
      K.wall(-0.075, 8, 4.7, 8, H, WP, { skirting: true, openings: [{ at: 4.075, w: 1.0, h: 2.15 }] });
      K.wall(10.075, 8, 4.7, 8, H, WP, { skirting: true, both: false, openings: [{ at: 2.6, w: 2.0, h: 1.3, sill: 0.8, glass: true, frame: true }] });
      K.wall(-0.075, 0, 3.3, 0, H, WK, { skirting: true, both: false });
      K.wall(3.3, 0, 4.7, 0, H, WP, { both: false });
      K.wall(4.7, 0, 10.075, 0, H, WP, { skirting: true, openings: [{ at: 3.2, w: 1.4, h: 1.1, sill: 1.0, glass: true, frame: true }] });
      K.box(12.2, -0.3, 4, 4.3, 0.28, 8.3, { color: '#161a19', roughness: 1 }, { shadow: false });   // (outside: dark ground under the east cutaways)
      K.wall(0, 8.075, 0, -0.075, H, WK, { skirting: true, openings: [{ at: 5.9, w: 1.2, h: 0.9, sill: 1.15, glass: true, frame: true }] });
      K.wall(10, 3.6, 10, 8.075, H, WP, { skirting: true, both: false });
      K.wall(10, -0.075, 10, 3.6, H, WP, { skirting: true, both: false });
      // interior walls
      K.wall(3.3, 1.2, 3.3, 8, H, WP, { skirting: true, openings: [{ at: 1.8, w: 0.95, h: 2.1 }, { at: 5.2, w: 0.8, h: 2.05 }] });
      K.wall(4.7, 1.2, 4.7, 8, H, WP, { skirting: true, openings: [{ at: 1.2, w: 0.85, h: 2.05 }, { at: 4.8, w: 1.4, h: 2.1 }] });
      K.wall(3.3, 1.2, 4.7, 1.2, H, WP, { both: false });
      K.wall(4.7, 1.2, 4.7, 0, H, WP, {});
      K.wall(0, 5.0, 3.3, 5.0, H, WK, { skirting: true });
      K.wall(4.7, 3.6, 10, 3.6, H, WP, { skirting: true });
      // doors: the front door (its own interaction), the bathroom (closed), the bedroom (ajar), the linen press
      K.door({ id: 'c2_unit9:front', x: 4.0, z: 8, rot: 0, w: 0.95, h: 2.1, style: 'wood', color: '#5a3a2a', when: () => false, mapMark: false });
      K.interact(4.0, 1.1, 7.45, (G) => leaveUnit9(G), { id: 'c2_unit9:frontdoor', r: 1.1 });
      K.door({ id: 'c2_unit9:bath', x: 3.3, z: 6.4, rot: 90, w: 0.8, h: 2.0, style: 'wood', color: '#e6dfcb', when: () => false, mapMark: false });
      K.examine(3.45, 1.1, 6.4, "It's just the bathroom.", { id: 'c2u9:bath', r: 0.9 });
      K.door({ id: 'c2_unit9:bed', x: 4.7, z: 2.4, rot: 90, w: 0.85, h: 2.0, style: 'wood', color: '#e6dfcb', open: 0.85, swing: 1 });
      K.wall(3.55, 1.215, 4.45, 1.215, 2.02, { tex: 'wood', color: '#e6dfcb' }, { both: false, thick: 0.02 });
      K.box(4.3, 1.0, 1.24, 0.03, 0.12, 0.03, { tex: 'metal', color: '#b8b09a' });
      K.examine(4.0, 1.2, 1.45, ['The linen press. Towels, folded in thirds.', 'Lavender bags between the sheets. [beat] It smells like her.'], { id: 'c2u9:linen', r: 0.8 });
      // ---- the hall: the phone table (rotary phone, the answering machine blinking "1"), photos, coats -----------------
      K.prop('phone_table', 3.55, 4.7, 90, { name: 'c2_phonetable', machine: true, count: S.done['c2:machine'] ? 0 : 1 });
      K.interact(3.6, 0.95, 4.82, (G) => answeringMachine(G), { id: 'c2_unit9:machine', r: 0.8 });
      K.examine(3.6, 0.95, 4.45, ['Her phone. [beat] It\'s plugged into the wall. The wall\'s plugged into nothing.', 'A pad beside it. "Luke — Sunday" and a phone number, underlined twice.'], { id: 'c2u9:phone', r: 0.7 });
      if (S.done['c2:machine']) Promise.resolve().then(() => { const pt = World.obj && World.obj('c2_phonetable'); if (pt && pt.userData.setBlink) pt.userData.setBlink(false); });
      K.prop('framed_photo', 3.39, 2.4, 90, { mount: 1.55, subject: 'family', w: 0.3, h: 0.38 });
      K.prop('framed_photo', 4.61, 4.2, -90, { mount: 1.6, subject: 'landscape', w: 0.34, h: 0.28 });
      K.prop('framed_photo', 3.39, 7.3, 90, { mount: 1.6, subject: 'family', w: 0.26, h: 0.34 });
      K.examine(4.3, 1.55, 4.2, ['Photos all down the hall. A wedding. A boy on a bike. Christmases.', 'The same boy in all of them, getting taller.'], { id: 'c2u9:photos', r: 0.9 });
      for (const zz of [7.1, 7.35]) K.cyl(4.62, 1.55, zz, 0.012, 0.08, { tex: 'metal', color: '#8a8f8a' }, { rz: 90 });
      K.box(4.52, 0.55, 7.2, 0.16, 1.0, 0.36, { tex: 'fabric_knit', color: '#6a7a8a' });
      K.box(4.45, 0, 6.85, 0.32, 0.55, 0.3, { tex: 'fabric_knit', color: '#5a3a4a' });
      K.cyl(4.45, 0.55, 6.85, 0.012, 0.35, '#1b1c1c');
      K.examine(4.35, 0.8, 7.0, ['Her shopping trolley bag, packed and ready by the door.', 'A raincoat on the hook. [beat] For Saturdays. For the bus.'], { id: 'c2u9:trolley', r: 0.8 });
      // ---- the lounge: the phone socket (the modem), the couch, the lost glasses, the telly, her chair -----------------
      K.prop('phone_socket', U9.socket[0], 3.675, 0, { variant: 'old', mount: 0.3 });
      K.box(U9.socket[0], 0, 4.02, 0.42, 0.6, 0.36, { tex: 'wood', color: '#6a4a30' }, { collide: true });
      K.prop('modem', U9.modem[0], U9.modem[2], 0, { y: U9.modem[1], state: flag('c2_modemIn') ? 'red' : 'off', name: 'c2_modem' });
      K.plane(U9.modem[0], U9.modem[1] + 0.13, U9.modem[2] + 0.026, 0.12, 0.028, boardTex('noservice', ['NO SERVICE'], { w: 256, h: 60, bg: '#200404', fg: '#ff3b2a', font: FN.mono, weight: 'bold', size: 30, age: 0.1 }), { emissive: true, emissiveIntensity: 1.2, name: 'c2_modemlcd' });
      K.box(U9.socket[0] + 0.02, 0.2, 3.76, 0.03, 0.04, 0.03, { color: '#d8d4c8' }, { name: 'c2_modemplug' });
      K.animate(() => {
        const on = flag('c2_modemIn'), m = World.obj && World.obj('c2_modem'), l = World.obj && World.obj('c2_modemlcd'), p = World.obj && World.obj('c2_modemplug');
        if (m && m.visible !== on) m.visible = on;
        if (p && p.visible !== on) p.visible = on;
        if (l && !on && l.visible) l.visible = false;
      });
      K.interact(U9.socket[0], 0.45, 3.85, async (G) => {
        if (flag('c2_modemIn')) { await G.think('It\'s plugged in. It just doesn\'t connect.'); return; }
        if (!G.has('returned_modem')) { await G.think('The phone socket. [beat] The modem. Where\'s the modem?'); return; }
        const c = await G.choice(['YES', 'NO'], { title: 'Use the returned modem?', cancel: 1, def: 0, caps: true });
        if (c === 0) await G.run((G2) => plugModem(G2), { control: false, letterbox: false, skippable: true, name: 'c2:modem' });
      }, { id: 'c2_unit9:socket', r: 1.2, when: () => !flag('c2_modemIn') });
      K.interact(U9.modem[0], 0.7, U9.modem[2] + 0.1, (G) => restartModem(G), { id: 'c2_unit9:restart', r: 1.2, when: () => flag('c2_modemIn') && (S.done['c2:restarts'] | 0) < 3 && !S.outage });
      K.examine(U9.modem[0], 0.7, U9.modem[2] + 0.1, ['Solid red. NO SERVICE.', 'It\'s not the modem. It was never the modem.'], { id: 'c2u9:modemdone', r: 1.2, when: () => flag('c2_modemIn') && (S.done['c2:restarts'] | 0) >= 3 });
      K.prop('couch', 7.6, 4.1, 0, { len: 2.0, color: '#7a6a52' });
      K.prop('glasses', 6.72, 4.18, 80, { y: 0.44, color: '#6a4a2a' });
      K.examine(6.75, 0.5, 4.3, ['Tortoiseshell reading glasses, down the side of the couch.', 'The ones on the noticeboard. [beat] They were here the whole time.'], { id: 'c2u9:glasses', r: 0.7 });
      K.examine(8.2, 0.7, 4.3, ['A crocheted blanket over the back of the couch. Every square a different colour.'], { id: 'c2u9:couch', r: 1.0 });
      K.box(7.6, 0, 5.4, 1.0, 0.42, 0.55, { tex: 'wood', color: '#5a3e2a' }, { collide: true });
      K.plane(7.6, 0.425, 5.4, 0.36, 0.26, { tex: 'fabric_knit', color: '#e8e0cc' }, { rot: [-90, 0, 10] });
      K.box(7.9, 0.42, 5.35, 0.18, 0.02, 0.26, { tex: 'paper', color: '#d8d0c0' });
      K.prop('tv', 9.55, 7.4, -135, { mount: 'stand', w: 0.7, content: 'off' });
      K.examine(9.3, 1.0, 7.1, ['The telly. The TV guide on top, this week circled. [beat] Last week.'], { id: 'c2u9:tv', r: 1.1 });
      K.prop('cardigan_chair', 5.5, 7.3, 150, { chair: 'timber', color: '#4f6a8f' });
      K.examine(5.6, 0.9, 7.1, ['Her cardigan. Blue, hand-knitted. [beat] I shouldn\'t touch it.'], { id: 'c2u9:cardigan', r: 1.0 });
      K.prop('framed_photo', 7.6, 3.675, 0, { mount: 1.65, subject: 'family', w: 0.5, h: 0.4 });
      K.box(9.45, 0, 3.87, 0.9, 1.1, 0.5, { tex: 'wood', color: '#5a3e2a' }, { collide: true });
      for (let i = 0; i < 5; i++) K.box(9.12 + i * 0.16, 0.62 + (i % 2) * 0.02, 4.06, 0.12, 0.3 - (i % 3) * 0.03, 0.04, { color: ['#7a2a22', '#2f4a6a', '#6a5a2a', '#3a5a3a', '#5a3a5a'][i] });
      K.examine(9.45, 1.0, 4.3, ['Photo albums. Years of them, labelled on the spines. [beat] The last one stops at 2019.'], { id: 'c2u9:albums', r: 1.0 });
      K.examine(7.5, 1.6, 7.8, ['The streetlight comes in orange through the net curtains.'], { id: 'c2u9:window', r: 1.1 });
      K.plane(7.5, 1.45, 7.93, 2.0, 1.3, curtainTex('#d8d0bc'), { transparent: true, opacity: 0.55, rotY: 180 });
      // ---- the kitchen (Fog world): the chair on its side, the tea towel, the base station, the fridge, the crossword -----
      K.fogOnly(() => {
        K.prop('sink_bench', 0.32, 2.2, 90, { len: 2.4, variant: 'home', stove: true, upper: true });
        K.prop('base_station', U9K.base[0], U9K.base[2], 90, { y: 0.9, text: 'NO LINE', name: 'c2_base' });
        K.examine(U9K.base[0] + 0.2, 1.0, U9K.base[2], ['The alarm base station. "NO LINE." [beat] It\'s been saying that the whole time.', 'The red button, for help. It just beeps.'], { id: 'c2u9:base', r: 0.9 });
        K.prop('fridge', U9K.fridge[0], U9K.fridge[1], 0, { variant: 'home' });
        K.plane(U9K.fridge[0] + 0.1, 1.3, U9K.fridge[1] + 0.36, 0.2, 0.26, { tex: 'paper', color: '#efece2' }, { rotY: 0 });
        K.interact(U9K.fridge[0], 1.3, U9K.fridge[1] + 0.6, (G) => fridgeList(G), { id: 'c2_unit9:fridge', r: 1.0 });
        K.prop('table', U9K.table[0], U9K.table[1], 90, { variant: 'timber', w: 1.0, d: 0.8 });
        K.prop('chair', U9K.table[0] + 0.62, U9K.table[1] - 0.05, -90, { variant: 'timber' });
        K.prop('crossword', U9K.table[0] + 0.05, U9K.table[1] - 0.05, 80, { y: 0.745 });
        K.examine(U9K.table[0] + 0.05, 0.9, U9K.table[1], 'A crossword on the table, half done, in pen. [beat] In pen. Confident.', { id: 'c2u9:crossword', r: 0.8 });
        K.prop('fallen_chair', U9K.chair[0], U9K.chair[1], 35, { variant: 'timber' });
        K.interact(U9K.chair[0], 0.4, U9K.chair[1], async (G) => { await G.msg('Leave it.'); }, { id: 'c2_unit9:chair', r: 0.9, look: false });
        K.prop('tea_towel', 0.95, 1.75, 30, { variant: 'floor' });
        K.plane(1.2, 1.55, 0.085, 0.36, 0.45, calendarTex(), { rotY: 0 });
        K.examine(1.2, 1.4, 0.4, ['The calendar\'s still on May. One Saturday circled in red: "CITY."', 'The day she came into the store. [beat] My store.'], { id: 'c2u9:calendar', r: 0.8 });
        K.prop('clock', 1.8, 4.92, 180, { time: [9, 41], running: true, mount: 1.95 });
        K.box(2.85, 0, 4.55, 0.7, 2.1, 0.8, { tex: 'wood', color: '#d8cfb8' }, { collide: true });
        K.examine(2.7, 1.2, 4.1, ['The pantry. Tins, all facing front. Tea, two kinds.'], { id: 'c2u9:pantry', r: 0.9 });
        K.examine(0.5, 1.3, 2.9, ['The kettle\'s cold. One cup upside down on the rack.', 'The window over the sink looks straight at the next unit\'s wall. [beat] Nobody would have seen.'], { id: 'c2u9:sink', r: 0.9 });
        K.light('point', -0.7, 1.8, 2.2, { color: '#8fa2aa', intensity: 3.2, distance: 5.5, name: 'c2u9:kwin' });
        // the light over the stove, still on (she always left it on)
        K.light('lamp', 0.55, 1.42, 2.75, { color: '#ffd29a', intensity: 2.6, distance: 4.2, name: 'c2u9:stove' });
        K.examine(0.55, 1.3, 3.0, ['The light over the stove\'s still on. [beat] She always left it on. So the house wasn\'t dark when she came in.'], { id: 'c2u9:stovelight', r: 0.8 });
        K.light('led', U9K.base[0] + 0.02, 0.97, U9K.base[2] + 0.06, { color: '#ff2a1c', blink: 1.6, duty: 0.16, size: 0.012, halo: 0.25 });
      });
      // ---- the bedroom: the bed, the dresser (the photo), the bedside table (the sealed tablet), the wardrobe --------------
      K.prop('bed', 7.6, 1.08, 0, { size: 'double', color: '#7a8aa0' });
      K.examine(7.6, 0.7, 2.2, ['The bed\'s made. Tight corners. [beat] Nobody\'s slept in it for a while.'], { id: 'c2u9:bed', r: 1.2 });
      K.prop('dresser', 4.98, 0.9, 90, { photo: 'nan' });
      K.interact(5.2, 1.0, 0.72, (G) => dresserPhoto(G), { id: 'c2_unit9:photo', r: 0.9 });
      K.examine(5.25, 1.0, 1.35, ['A jewellery box. A bottle of perfume, nearly full. Saved for good.'], { id: 'c2u9:dresser', r: 0.7 });
      K.prop('bedside_table', 6.35, 0.35, 0, { lamp: true, lit: false, items: true });
      K.prop('tablet_box', 6.4, 0.38, 12, { y: 0.6 });
      K.examine(6.4, 0.75, 0.5, 'A tablet on the bedside table, still sealed in its box. [beat] She never even opened it.', { id: 'c2u9:tablet', r: 0.8 });
      K.box(8.6, 0, 3.3, 1.6, 2.1, 0.55, { tex: 'wood', color: '#6a4a30' }, { collide: true });
      K.examine(8.6, 1.2, 2.9, ['The wardrobe door\'s open a crack. Cardigans. All of them blue.'], { id: 'c2u9:wardrobe', r: 1.0 });
      K.examine(8.0, 1.5, 0.3, ['The bedroom window. Just fog, pressed up against the glass.'], { id: 'c2u9:bedwin', r: 1.2 });
      K.light('point', 7.9, 1.7, -0.7, { color: '#8fa2aa', intensity: 2.6, distance: 5.2, world: 'fog', name: 'c2u9:bwin' });
      // ---- outside the front door: the porch slab and the lit fog (only ever seen through the open door in 2-1) --------------
      K.floor(3.3, 8.0, 4.7, 9.3, { tex: 'concrete', color: '#8f8a80' }, { y: 0.0, skirt: false });
      K.plane(4.0, 1.3, 9.35, 2.6, 2.8, { color: '#7c8783', emissive: '#7c8783', emissiveIntensity: 0.85 }, { rotY: 180, world: 'fog' });
      buildSpill(K);
      // 2-1's torchlight on his face (off until the scene)
      K.light('point', 3.42, 1.63, 3.66, { color: '#fff1dc', intensity: 2.2, distance: 1.35, on: false, name: 'c2u9:face', world: 'fog' });
      // 2-1's grey fog-light through the open front door (off until the scene)
      K.light('point', 4.0, 2.0, 7.55, { color: '#a7b6b3', intensity: 4.5, distance: 7.5, on: false, name: 'c2u9:door', world: 'fog' });
      // ---- light: the streetlight through the lounge window; the Outage's own ----------------------------------------------
      K.light('street', 7.4, 4.6, 11.5, { real: true, intensity: 16, distance: 12, haloSize: 3, world: 'fog' });
      K.outageOnly(() => {
        K.door({ id: 'c2_unit9:kitchen', x: 3.3, z: 3.0, rot: 90, w: 0.9, h: 2.05, style: 'wood', color: '#6a2a22', to: 'c2_kitchen_out', entry: 'hall', world: 'outage', mapMark: false });
        K.light('point', 4.0, 2.2, 4.4, { color: '#e8c21a', intensity: 2.2, distance: 5.5, flicker: true });
        K.light('point', 3.4, 1.6, 3.0, { color: '#ff2a1c', intensity: 1.6, distance: 3.5 });
        K.light('led', 3.3, 1.1, 2.55, { color: '#ff2a1c', blink: 0.8, size: 0.02, halo: 0.4 });
        K.prop('receipt_strip', 4.0, 5.6, 0, { ceil: H, len: 1.3 }); K.prop('receipt_strip', 7.5, 5.8, 50, { ceil: H, len: 1.6 });
        K.prop('receipt_strip', 8.6, 2.2, 40, { ceil: H, len: 0.9 }); K.prop('receipt_strip', 8.8, 6.5, 10, { ceil: H, len: 1.0 });
        K.dress('receipts', [3.4, 1.4, 4.6, 7.8], 12, { seed: 251 }); K.dress('receipts', [4.9, 4.8, 9.6, 7.6], 16, { seed: 252 });
        K.writing('FOLLOW UP TOMORROW', 3.39, 1.7, 5.9, 1.6, { rotY: 90, world: 'outage' });
        K.writing('DID YOU CHECK', 7.4, 1.85, 3.69, 1.6, { rotY: 0, world: 'outage' });
        K.examine(3.45, 1.1, 3.0, ['The kitchen door. [beat] There was never a door here.'], { id: 'c2u9:kdoor', r: 0.6 });
      });
    },
    async onEnter(G, from) {
      stopRoomSounds();
      C2.tick = Snd.play('clock_tick', { loop: true, pos: [1.8, 1.95, 4.9], vol: 0.45 });
      if (from === 'c2_crescent' && !S.done['cs:2-1'] && !S.outage) { await G.cutscene('2-1'); return; }
      if (S.outage && from === 'c2_crescent' && G.once('c2:u9outage')) { await G.wait(0.8); await G.think('Her hall. [beat] The kitchen door\'s shut.'); }
    },
    onUpdate(dt) {
      if (S.outage || !World.build) return;
      C2.beepT = (C2.beepT || 0) + dt;
      if (C2.beepT > 4.2) { C2.beepT = 0; try { Snd.play('beep', { pos: [U9K.base[0], 1.0, U9K.base[2]], vol: 0.12 }); } catch (e) { /* audio */ } }
    },
    onLeave() { stopRoomSounds(); },
  });
  function stopRoomSounds() { if (C2.tick && C2.tick.stop) C2.tick.stop(0.2); C2.tick = null; if (C2.hum && C2.hum.stop) C2.hum.stop(0.3); C2.hum = null; }

  // =================================================================================================================
  // 2-5 — THE SWOLLEN KITCHEN (Outage only): 20 × 20 m, her kitchen stretched to nothing. The chair on its side at the
  // centre, the pendant glowing red on the lino beside it, the fridge a long way off with the list still on it.
  // =================================================================================================================
  const KO = { chair: [10, 10], pendant: [10.85, 10.55] };
  async function takePendant(G) {
    if (S.taken['c2_kitchen_out:pendant']) return;
    await G.run(async (G2) => {
      const A = G2.aidan;
      await A.walkTo(KO.pendant[0] + 0.55, KO.pendant[1] + 0.35, { speed: 1.0 });
      await A.turn([KO.pendant[0], KO.pendant[1]], 0.4);
      G2.cam({ pos: [KO.pendant[0] + 0.2, 7.5, KO.pendant[1] + 1.6], target: [KO.pendant[0], 0, KO.pendant[1] - 0.2], fov: 38, to: { fov: 30 }, dur: 5 });
      A.pose('kneel');
      await G2.wait(1.2);
      await Script.builtins.pickup(G2, { id: 'c2_kitchen_out:pendant', item: 'alarm_pendant', obj: G2.obj('c2_pendant') });
      const hl = G2.light('c2ko:pendant'); if (hl) hl.on(false);
      A.pose('idle');
      A.hold('L', 'pendant', { pose: 'card' });
      if (A.raw) A.raw.eyes('down');
      await G2.wait(0.35);
      {
        // over his left shoulder, down at the pendant in his hand: the worn button, the lettering on the back
        const hp = anchorPos(Player.actor, 'gripL'), hd = aidanHead(), yw = Player.actor ? Player.actor.root.rotation.y : 0;
        const fx = Math.sin(yw), fz = Math.cos(yw), lx = Math.cos(yw), lz = -Math.sin(yw);
        if (!hp.lengthSq()) hp.set(KO.pendant[0] + 0.4, 1.0, KO.pendant[1] + 0.2);
        G2.cam({ pos: [hd.x - fx * 0.32 + lx * 0.26, hd.y + 0.16, hd.z - fz * 0.32 + lz * 0.26], target: [hp.x, hp.y, hp.z], fov: 34, to: { fov: 28 }, dur: 5 });
      }
      await G2.wait(0.6);
      await G2.think('Press and hold for three seconds.');
      if (A.raw) A.raw.eyes('ahead');
      A.pose('idle');
      A.hold('L', null);
      G2.camRelease();
    }, { control: false, letterbox: false, skippable: true, name: 'c2:pendant-pickup' });
    G.note('Press and hold for three seconds.', { id: 'c2_loop' });
    G.prompt(isPad() ? '{inventory}: items. USE the pendant.' : '{inventory}: items. USE the pendant.', { id: 'c2_usependant' });
  }
  // Use it: a long tone, then a recorded voice. The loop breaks.
  async function pendantScene(G) {
    const A = G.aidan;
    const inKitchen = World.room === 'c2_kitchen_out';
    A.hold('L', 'pendant', { pose: 'card' });
    try { UI.prompt(null, { id: 'c2_usependant' }); } catch (e) { /* ui */ }
    if (inKitchen) G.cam({ pos: [Player.pos.x + 1.6, 1.5, Player.pos.z + 1.2], target: [Player.pos.x, 1.2, Player.pos.z], fov: 34 });
    const ok = await G.hold('Hold {interact}: press the button', 3);
    if (!ok) { A.hold('L', null); G.camRelease(); await G.think('Press and hold for three seconds.'); return false; }
    const tone = G.sfx('alarm_tone', { dur: 4.2, vol: 0.8 });
    if (inKitchen) G.cam({ pos: [KO.chair[0] + 0.4, 6.4, KO.chair[1] + 2.4], target: [KO.chair[0] + 0.3, 0, KO.chair[1] + 0.1], fov: 42, to: { pos: [KO.chair[0] + 0.5, 8.8, KO.chair[1] + 3.2], fov: 46 }, dur: 9 });
    await G.wait(4.2);
    if (tone && tone.stop) tone.stop(0.1);
    G.sfx('static', { dur: 0.4, vol: 0.4, phone: true });
    await G.say('RECORDED VOICE (phone)', 'Your call cannot be connected.');
    await G.wait(2.0);                                                  // [long beat]
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('sad'); }
    await G.say('AIDAN', "...I'm sorry.");
    // the loop breaks
    G.set('c2_loopBroken', true);
    G.note('The back gate. Exchange Road. The old exchange.', { id: 'c2_loop', replace: true });
    try { Phone.done && Phone.done('c2_loop'); } catch (e) { /* notes */ }
    refreshPlates();
    if (inKitchen) {
      stopRoomSounds();
      const b = G.light('c2ko:pool'); if (b) b.set({ color: '#ffe6c4' });
      G.sfx('exhale_static', { vol: 0.5 });
      await G.wait(1.6);
    }
    if (A.raw) { A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    A.hold('L', null);
    G.camRelease();
    await G.wait(0.4);
    await G.think('The gate. [beat] The back gate.');
    return true;
  }
  function refreshPlates() {
    if (!World.build || World.room !== 'c2_crescent') return;
    for (let n = 1; n <= 12; n++) { const o = World.obj(`c2_plateO${n}`); if (o && o.material) { const m = o.material.clone(); m.map = plateTex(n); m.needsUpdate = true; o.material = m; } }
  }
  defineRoom({
    id: 'c2_kitchen_out', name: 'THE KITCHEN', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: false, surface: 'lino', ambient: 'interior',
    fog: { density: 0.028, color: '#161b1a' },
    bounds: [0, 0, 20, 20],
    entries: { hall: [10, 18.7, 180], start: [10, 18.7, 180] },
    cameras: [
      // the whole room from its far end, low: the chair in its pool of light in the middle ground, the door tiny beyond
      { id: 'c2_kitchen_out:door', vol: [4.5, 13.2, 15.5, 20], pri: 1, type: 'static', pos: [10.9, 0.95, 1.4], target: [10.05, 1.05, 19], fov: 'fit' },
      // high over the door, panning across the floor (the rest of the room)
      { id: 'c2_kitchen_out:far', vol: [0, 0, 20, 20], type: 'pan', pos: [10, 4.3, 19.3], target: [10, 0.4, 7.5], fov: 50, pan: { lag: 0.3, yaw: 100, pitch: 55 } },
      // straight down from the dark over the chair
      { id: 'c2_kitchen_out:chair', vol: [7.4, 7.4, 12.6, 12.6], pri: 2, type: 'static', pos: [10.25, 12.6, 12.7], target: [10, 0, 9.85], fov: 'fit' },
      // the fridge end: from across the floor, the list still on the door, the chair's light behind him
      { id: 'c2_kitchen_out:fridge', vol: [10.5, 0, 20, 6.2], pri: 1, type: 'static', pos: [8.2, 3.3, 12.4], target: [15.6, 0.6, 2.2], fov: 'fit' },
    ],
    build(K) {
      const H = 4.6;
      K.ambient('#1f6f6a', 0.26);                                     // the Outage's sick teal, just enough to read the room
      K.floor(0, 0, 20, 20, { tex: 'lino', color: '#9a8e6a' });
      const WK = { tex: 'plaster', color: '#c3c0a6' };
      K.wall(-0.075, 0, 20.075, 0, H, WK, { skirting: true });
      K.wall(0, 20.075, 0, -0.075, H, WK, { skirting: true });
      K.wall(20, -0.075, 20, 20.075, H, WK, { skirting: true });
      K.wall(20.075, 20, -0.075, 20, H, WK, { skirting: true, openings: [{ at: 10.075, w: 0.95, h: 2.1 }] });
      K.door({ id: 'c2_kitchen_out:door', x: 10, z: 20, rot: 0, w: 0.9, h: 2.05, style: 'wood', color: '#6a2a22', to: 'c2_unit9', entry: 'kitchen', mapMark: false });
      // her benches, stretched the length of the west wall; the window over the sink showing only red
      for (let z = 1.4; z < 18.6; z += 2.4) K.prop('sink_bench', 0.32, z + 1.2, 90, { len: 2.4, variant: 'home', stove: Math.abs(z + 1.2 - 12.2) < 1, upper: true });
      K.plane(0.1, 2.05, 7.4, 1.6, 1.0, { color: '#300808', emissive: '#6a0a0a', emissiveIntensity: 1.0 }, { rotY: 90 });
      K.examine(0.9, 1.3, 7.4, ['The window over the sink. [beat] Just red on the other side.'], { id: 'c2ko:window', r: 1.2 });
      K.prop('base_station', 0.34, 5.2, 90, { y: 0.9, text: 'NO LINE' });
      K.light('led', 0.36, 0.97, 5.26, { color: '#ff2a1c', blink: 1.6, duty: 0.16, size: 0.012, halo: 0.3 });
      K.examine(0.6, 1.0, 5.2, ['"NO LINE." [beat] Still.'], { id: 'c2ko:base', r: 0.9 });
      // the stove light she always left on, a long way down the bench
      K.light('lamp', 0.6, 1.45, 12.2, { color: '#ffd29a', intensity: 2.2, distance: 4, flicker: true });
      K.examine(0.7, 1.3, 12.2, ['The light over the stove. [beat] Still on. It\'s always on.'], { id: 'c2ko:stove', r: 1.0 });
      // the fridge, far across the lino, the list still on it
      K.prop('fridge', 14, 0.42, 0, { variant: 'home' });
      K.plane(14.1, 1.3, 0.78, 0.2, 0.26, { tex: 'paper', color: '#efece2' }, { rotY: 0 });
      K.examine(14, 1.2, 1.1, ['The list\'s still on the fridge. [beat] I\'ve read it.', 'Will my alarm still work. [beat] Important.'], { id: 'c2ko:fridge', r: 1.0 });
      K.light('point', 14, 1.0, 1.5, { color: '#dfe8e8', intensity: 1.6, distance: 4 });
      // the table and its crossword, the calendar, the clock over the door (so loud in here)
      K.prop('table', 5.5, 14.5, 90, { variant: 'timber', w: 1.0, d: 0.8 });
      K.prop('chair', 6.1, 14.4, -90, { variant: 'timber' });
      K.prop('crossword', 5.55, 14.45, 80, { y: 0.745 });
      K.examine(5.6, 0.9, 14.5, 'The crossword. [beat] Seven across is still empty.', { id: 'c2ko:crossword', r: 0.9 });
      K.prop('clock', 10, 19.92, 180, { time: [9, 41], running: true, mount: 3.4 });
      K.examine(10, 1.8, 19.3, ['The clock\'s so loud in here.'], { id: 'c2ko:clock', r: 1.0 });
      K.plane(3.0, 1.55, 0.085, 0.36, 0.45, calendarTex(), { rotY: 0 });
      K.examine(3.0, 1.4, 0.5, ['The calendar. May. [beat] "CITY," circled in red.'], { id: 'c2ko:calendar', r: 0.9 });
      // the chair at the centre in a pool of light from nowhere; the tea towel; the pendant glowing red on the lino
      K.prop('fallen_chair', KO.chair[0], KO.chair[1], 35, { variant: 'timber' });
      K.interact(KO.chair[0], 0.4, KO.chair[1], async (G) => { await G.msg('Leave it.'); }, { id: 'c2_kitchen_out:chair', r: 1.0, look: false });
      K.prop('tea_towel', 9.2, 10.9, 30, { variant: 'floor' });
      K.light('spot', 10, 6.4, 10.3, { target: [10, 0, 10.2], angle: 24, penumbra: 0.55, intensity: 150, distance: 11, color: '#d6e2de', name: 'c2ko:pool' });
      const taken = !!(S.taken && S.taken['c2_kitchen_out:pendant']);
      if (!taken) K.prop('pendant', KO.pendant[0], KO.pendant[1], 20, { glow: true, name: 'c2_pendant' });
      K.light('point', KO.pendant[0], 0.35, KO.pendant[1], { color: '#ff2a1c', intensity: taken ? 0 : 2.6, distance: 3.2, name: 'c2ko:pendant', on: !taken });
      K.interact(KO.pendant[0], 0.3, KO.pendant[1], (G) => takePendant(G), { id: 'c2_kitchen_out:pendantpick', r: 1.2, when: () => !(S.taken && S.taken['c2_kitchen_out:pendant']) });
      // the Outage dressing, kept to the edges: receipt paper curling down out of the dark, contracts stacked along the
      // walls, receipts drifted across the floor, the writing
      for (const [x, z, len] of [[3.5, 3.5, 3.0], [16.5, 3.5, 2.6], [3.2, 17, 2.8], [17, 16.5, 3.4], [16.8, 9.8, 2.2], [9.5, 2.6, 2.8]]) K.prop('receipt_strip', x, z, (x * 31) % 180, { ceil: H, len });
      for (let i = 0; i < 9; i++) K.prop('contract_stack', 19.4 - (i % 2) * 0.35, 2 + i * 1.9, i * 23, { h: 0.9 + (i % 3) * 0.4 });
      for (let i = 0; i < 6; i++) K.prop('contract_stack', 2.6 + i * 2.7 + (i > 2 ? 1.6 : 0), 19.4, i * 41, { h: 0.7 + (i % 2) * 0.5 });
      K.dress('receipts', [2, 2, 18, 18], 40, { seed: 261 });
      K.writing('FOLLOW UP TOMORROW', 19.92, 2.6, 10, 4.2, { rotY: -90, world: 'outage' });
      K.writing('WHO ARE YOU TRYING TO REACH', 9, 3.1, 0.09, 5.0, { style: 'receipt', world: 'outage' });
      K.writing("IT'LL BE FINE", 4, 2.2, 19.91, 2.4, { rotY: 180, world: 'outage' });
      K.examine(10, 1.0, 17.6, ['It\'s her kitchen. [beat] It\'s just her kitchen.', 'The walls keep going. The floor keeps going.'], { id: 'c2ko:size', r: 1.6 });
      K.examine(16.5, 1.0, 14.5, ['Receipts. Mine. [beat] Every one of them has her account number.'], { id: 'c2ko:receipts', r: 1.6 });
      K.examine(19.2, 1.2, 6.5, ['Contracts, stacked to my chest. [beat] My signature on the bottom of every one.'], { id: 'c2ko:contracts', r: 1.4 });
      K.light('point', 19, 2.4, 13, { color: '#e8c21a', intensity: 1.8, distance: 6, flicker: true });
      K.light('point', 1.3, 2.2, 7.4, { color: '#ff3b2a', intensity: 2.0, distance: 5 });
      K.light('point', 10, 2.3, 19.2, { color: '#e8c21a', intensity: 1.2, distance: 4, flicker: true });
    },
    async onEnter(G) {
      stopRoomSounds();
      C2.tick = Snd.play('clock_tick', { loop: true, pos: [10, 3.4, 19.8], vol: 0.95 });
      if (G.once('c2:kitchenout')) {
        await G.wait(1.2);
        await G.think('This isn\'t her kitchen. [beat] It is. It\'s just— bigger.');
        G.note('The kitchen. The chair. [beat] Something red on the floor.', { id: 'c2_loop' });
      }
    },
    onLeave() { stopRoomSounds(); },
  });

  // =================================================================================================================
  // 2E — THE COMMUNITY HALL. x 0…18, z 0…12, the doors in the south wall (x 9); the stage at the north end (y 0.8);
  // tables for Thursday Bingo, stacked chairs, the bingo machine, the honour board, her birthday banner still up.
  // The Outage: the Unread on the ceiling over the tables; the energy drink on the stage.
  // =================================================================================================================
  defineRoom({
    id: 'c2_hall', name: 'COMMUNITY HALL', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: false, surface: 'wood', ambient: 'interior',
    fog: { density: 0.03, color: '#39423f' },
    surfaces: [{ box: [4.5, 0, 13.5, 3.2], s: 'wood' }],
    bounds: [0, 0, 18, 12],
    entries: { door: [9, 10.9, 180], start: [9, 10.9, 180] },
    cameras: [
      // high from the stage, down the length of the hall to the doors
      { id: 'c2_hall:stage', vol: [0, 5.3, 18, 12], type: 'pan', pos: [9, 3.7, 0.9], target: [9, 0.4, 9.4], fov: 52, pan: { lag: 0.3, yaw: 72, pitch: 45 } },
      // low among the chairs, up toward the stage and the banner
      { id: 'c2_hall:chairs', vol: [0, 0, 18, 5.3], type: 'static', pos: [7.4, 0.95, 11.7], target: [9.0, 1.3, 1.6], fov: 'fit' },
      // across the room from the stacked chairs: the urn, the servery hatch, lost property (the west wall)
      { id: 'c2_hall:west', vol: [0, 2.0, 3.6, 12], pri: 1, type: 'static', pos: [15.2, 3.1, 11.3], target: [1.4, 0.8, 7.6], fov: 'fit' },
      // on the stage: from the side, across the boards
      { id: 'c2_hall:onstage', vol: [4.4, 0, 13.6, 3.25], y: [0.5, 1.6], pri: 1, type: 'static', pos: [17.4, 2.6, 5.4], target: [8.6, 1.0, 1.6], fov: 'fit' },
    ],
    spawns: [
      { id: 'c2_hall:unread', type: 'unread', world: 'outage', pos: [9, 5], count: 44, cluster: [[7.6, 3.97, 5.2], [8.8, 3.97, 5.8], [10.2, 3.97, 4.9], [9.3, 3.97, 4.2], [11.0, 3.97, 6.1], [8.1, 3.97, 6.6]] },
    ],
    build(K) {
      const H = 4.0;
      K.floor(0, 0, 18, 12, { tex: 'timber_floor', color: '#8a6a4a' });
      K.ceiling(0, 0, 18, 12, H, { tex: 'ceiling_tile', color: '#9a9888' });
      const WH = { tex: 'plaster', color: '#c9c2a8' };
      K.wall(-0.075, 0, 18.075, 0, H, WH, { skirting: true });
      K.wall(0, 12.075, 0, -0.075, H, WH, { skirting: true, openings: [{ at: 3.5, w: 1.6, h: 1.2, sill: 1.6, glass: true, frame: true }, { at: 8.5, w: 1.6, h: 1.2, sill: 1.6, glass: true, frame: true }] });
      K.wall(18, -0.075, 18, 12.075, H, WH, { skirting: true, openings: [{ at: 3.5, w: 1.6, h: 1.2, sill: 1.6, glass: true, frame: true }, { at: 8.5, w: 1.6, h: 1.2, sill: 1.6, glass: true, frame: true }] });
      K.wall(18.075, 12, -0.075, 12, H, WH, { skirting: true, both: false, openings: [{ at: 9.075, w: 1.9, h: 2.4 }] });
      K.door({ id: 'c2_hall:door', x: 9, z: 12, rot: 0, w: 1.8, h: 2.3, style: 'glass_double', to: 'c2_crescent', entry: 'hall' });
      // the stage
      K.prop('stage', 9, 1.5, 0, { w: 9, d: 3, h: 0.8 });
      K.floor(4.5, 0, 13.5, 3.0, { tex: 'timber_floor', color: '#6a4a30' }, { y: 0.8, skirt: false });
      K.stairs(13.65, 1.1, 15.0, 1.9, 0.8, 0, { axis: 'x', mat: { tex: 'wood', color: '#6a4a30' } });
      K.floor(13.5, 1.0, 13.7, 2.0, { tex: 'timber_floor', color: '#6a4a30' }, { y: 0.8, skirt: false });
      K.box(9, 3.3, 0.35, 8.2, 0.9, 0.05, { tex: 'fabric_knit', color: '#d8c8a0' });
      K.plane(9, 3.75, 0.39, 6.4, 0.72, boardTex('banner79', riddle() === 'hard' ? ['HAPPY BIRTHDAY CHAMP!'] : ['HAPPY 79TH!'], { w: 1024, h: 128, bg: '#e8d8b0', fg: '#8a2a4a', font: FN.serif, size: 84, age: 0.7 }), { rot: [0, 0, 1.5] });
      for (let i = 0; i < 7; i++) K.sphere(5.2 + i * 1.25, 3.2 - (i % 2) * 0.25, 0.5, 0.13, { color: ['#c0506a', '#6a8ac0', '#e8c040'][i % 3], roughness: 0.5 }, { scale: [0.85, 0.7, 0.85] });
      K.examine(9, 1.8, 3.6, ['A birthday banner, still up over the stage. [beat] Thursday Bingo threw her a party.', 'The balloons have gone soft.'], { id: 'c2ha:banner', r: 1.8 });
      // the bingo machine and its flashboard, the tables with the cards half daubed, stacked chairs
      K.prop('bingo_machine', 6.2, 4.0, 0, { called: 23 });
      K.examine(6.2, 1.1, 4.4, ['The bingo cage. [beat] Somebody\'s left it halfway through a game.', 'Twenty-three numbers called. Nobody called house.'], { id: 'c2ha:bingo', r: 1.2 });
      K.sticker('sticker04', 5.92, 0.42, 4.235, 0, {});
      const cardT = boardTex('bingocard', ['B I N G O', '4 · 17 · 33 · 51 · 70', '9 · 22 · ✱ · 58 · 66', '11 · 28 · 41 · 49 · 72'], { w: 256, h: 192, bg: '#f2ecd8', fg: '#2a2a2a', font: FN.mono, size: [28, 18, 18, 18], age: 0.5 });
      for (let row = 0; row < 3; row++) {
        for (const x of [4.6, 8.6, 12.6]) {
          const z = 6.2 + row * 1.7;
          K.prop('table', x, z, 0, { variant: 'folding' });
          for (const dx of [-0.6, 0, 0.6]) { K.prop('chair', x + dx, z + 0.62, 180 + ((x + dx + row) * 23) % 20 - 10, { variant: 'plastic', color: '#3a4a5a' }); if ((x + row) % 3 < 2) K.plane(x + dx, 0.75, z + 0.1, 0.22, 0.16, cardT, { rot: [-90, 0, (dx * 30) % 12] }); }
          K.sphere(x - 0.3, 0.8, z - 0.15, 0.03, { color: '#c02a4a' }, { scale: [1, 2.2, 1] });
        }
      }
      K.examine(8.6, 0.9, 7.9, ['Bingo cards, half daubed. They just stood up and left.', 'Somebody\'s written "UNIT 9 = LUCKY" on the back of one.'], { id: 'c2ha:cards', r: 1.4 });
      for (const [x, z] of [[17.4, 3.2], [17.4, 4.1], [17.4, 5.0], [17.4, 9.8]]) K.prop('stacked_chairs', x, z, -90, { n: 9, color: '#3a4a5a' });
      K.examine(17.0, 1.0, 4.1, ['Plastic chairs, stacked nearly to the ceiling.'], { id: 'c2ha:chairs', r: 1.3 });
      // the urn and cups on a trestle by the servery hatch; the honour board; the photo wall; lost property
      K.prop('table', 1.0, 6.4, 90, { variant: 'folding' });
      K.cyl(0.95, 0.745, 6.0, 0.16, 0.45, { tex: 'metal', color: '#c9cdcc', metalness: 0.7, roughness: 0.3 });
      for (let i = 0; i < 12; i++) K.cyl(0.8 + (i % 3) * 0.12, 0.745, 6.5 + Math.floor(i / 3) * 0.14, 0.04, 0.08, { color: '#ece6d4', roughness: 0.4 });
      K.examine(1.2, 1.0, 6.4, ['The urn\'s cold. Forty cups upside down, waiting.', 'Somebody brought scones every Thursday. There\'s a roster.'], { id: 'c2ha:urn', r: 1.2 });
      K.box(0.05, 1.1, 9.0, 0.08, 1.0, 1.8, { tex: 'wood', color: '#6a4a30' });
      K.plane(0.1, 1.6, 9.0, 1.6, 0.4, boardTex('backsoon', ['BACK SOON'], { w: 512, h: 128, bg: '#efe6cc', fg: '#1f2c6e', hand: true, size: 60, age: 0.4 }), { rotY: 90 });
      K.examine(0.5, 1.4, 9.0, ['The servery hatch is shut. A paper plate taped to it: "BACK SOON."'], { id: 'c2ha:hatch', r: 1.1 });
      K.plane(17.93, 1.85, 7.2, 0.9, 1.35, honourTex(), { rotY: -90 });
      K.examine(17.4, 1.6, 7.2, ['Thursday Bingo champions. [beat] Unit 9. Unit 9. Unit 9.', 'Three years running.'], { id: 'c2ha:honour', r: 1.2 });
      K.prop('photo_wall', 17.95, 10.4, -90, { n: 6, title: 'CHRISTMAS LUNCH', subject: 'family' });
      K.examine(17.4, 1.5, 10.4, ['Christmas lunch, every year. Same faces, a bit older each time.', 'She\'s in all of them. [beat] I think that\'s her.'], { id: 'c2ha:photos', r: 1.2 });
      K.prop('box', 1.0, 11.2, 20, { w: 0.5, h: 0.35, d: 0.4, text: 'LOST PROPERTY' });
      K.examine(1.1, 0.6, 11.0, ['Lost property. Scarves, a hearing aid, somebody\'s good gloves.'], { id: 'c2ha:lost', r: 1.0 });
      K.prop('notice_board', 12.5, 11.93, 180, { title: 'HALL NOTICES', w: 1.0, h: 0.7 });
      K.examine(12.5, 1.5, 11.5, ['Scone roster. Hall hire. "Chair yoga — cancelled until further notice."'], { id: 'c2ha:notices', r: 1.1 });
      K.prop('exit_sign', 9, 11.93, 180, { mount: 2.65 });
      K.examine(9, 2.2, 11.4, 'The only light in here is the exit sign.', { id: 'c2ha:exit', r: 1.2, world: 'fog' });
      for (const [x, z] of [[5, 6], [13, 6]]) { K.cyl(x, H - 0.3, z, 0.02, 0.3, '#1b1c1c'); K.cyl(x, H - 0.4, z, 0.12, 0.1, '#6a6a60'); for (let b = 0; b < 3; b++) K.box(x, H - 0.36, z, 1.3, 0.02, 0.16, { tex: 'wood', color: '#5a4a38' }, { rot: b * 60 }); }
      K.fogOnly(() => {
        for (const [x, z] of [[4, 4], [14, 4], [4, 9], [14, 9]]) K.prop('fluoro_tube', x, z, 90, { h: H - 0.02, lit: false, light: false });
        // the grey of the fog coming in through the high windows, both sides
        for (const [x, z] of [[0.9, 3.55], [0.9, 8.55], [17.1, 3.45], [17.1, 8.45]]) K.light('point', x, 2.45, z, { color: '#8fa2aa', intensity: 2.0, distance: 6.5 });
        // the bingo machine's flashboard is still lit
        K.light('point', 6.2, 1.6, 4.9, { color: '#e8c070', intensity: 1.2, distance: 3.5 });
      });
      K.outageOnly(() => {
        for (const [x, z] of [[4, 9], [14, 9]]) K.prop('fluoro_tube', x, z, 90, { h: H - 0.02, flicker: true });
        K.pickup('energy_drink', 10.2, 0.8, 1.6, { id: 'c2_hall:energy', world: 'outage' });
        K.light('led', 6.2, 1.2, 4.2, { color: '#ff2a1c', blink: 0.7, size: 0.02, halo: 0.3 });
        K.prop('receipt_strip', 9, 8, 0, { ceil: H, len: 2.4 }); K.prop('receipt_strip', 12, 5, 40, { ceil: H, len: 2.0 });
        K.prop('receipt_strip', 3, 3, 0, { ceil: H, len: 2.2 });
        K.dress('receipts', [2, 5, 16, 11], 30, { seed: 271 });
        K.writing('WHO ARE YOU TRYING TO REACH', 0.09, 2.6, 4.5, 3.6, { rotY: 90, world: 'outage' });
        K.examine(10.2, 1.0, 2.0, ['An energy drink on the stage, where the caller would stand.'], { id: 'c2ha:energyx', r: 1.0, world: 'outage' });
      });
      K.pickup('energy_drink', 16.6, 0, 11.3, { id: 'c2_hall:energyEasy', extraOnEasy: true, world: 'fog' });
    },
  });

  // =================================================================================================================
  // 2F — THE GARAGES. The lane behind units 7–9: x 0…32, z 0…6; six bays on the north side (x 4…24.4, Bay 1 east), the
  // back fences of the units along the south; the way back to the Crescent at the east end. Bay 4's roller door is half up.
  // =================================================================================================================
  const BAYX = (k) => 24.4 - (k - 0.5) * 3.4;   // bay k centre (k 1…6, east → west)
  async function slideUnder(G) {
    if (World.outageBusy) return;
    const wasChase = chasing();
    await G.run(async (G2) => {
      const A = G2.aidan;
      const bx = BAYX(4);
      if (wasChase) { S.flags.c2_chase = 2; endPursuitSoon(); }
      await A.walkTo(bx, 1.0, { run: wasChase, speed: wasChase ? 3.2 : 1.2 });
      await A.turn(180, 0.25);
      G2.cam({ pos: [bx + 2.4, 0.4, 3.2], target: [bx, 0.4, 0], fov: 40 });
      A.pose('crawl');
      G2.sfx('bar_concrete', { vol: 0.35 });
      await A.walkTo(bx, 0.15, { speed: 1.0, anim: 'crawl' });
      await G2.fade(1, 0.25);
    }, { control: false, letterbox: false, skippable: false, name: 'c2:slide' });
    await G.goto('c2_bay4', 'door', { sound: 'none', fade: false });
    if (S.done['cs:2-3'] || (S.flags.c2_chase | 0) !== 2) await G.fade(0, 0.6);
  }
  function endPursuitSoon() { for (const id of ['c2:luke', 'c2:flankL', 'c2:flankR']) { const e = Enemies.get(id); if (e && !e.removed) { e.ai = false; } } }
  defineRoom({
    id: 'c2_garages', name: 'THE GARAGES', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: true, surface: 'concrete', ambient: 'wind',
    fog: { density: 0.05 }, outageFog: { density: 0.055, color: '#14302d' }, outageAmbient: ['#1f6f6a', 0.6],
    bounds: [0, 0, 32, 6],
    entries: { crescent: [30.4, 3.2, -90], bay4: [BAYX(4), 1.25, 0], start: [30.4, 3.2, -90] },
    cameras: [
      // from the east end where the lane bends in, high: the row of doors going away into the fog
      { id: 'c2_garages:east', vol: [20.5, 0, 32, 6], type: 'static', pos: [36.6, 3.5, 3.9], target: [22.5, 0.6, 1.9], fov: 'fit' },
      // from over the back fences, looking down at the doors
      { id: 'c2_garages:mid', vol: [7.5, 0, 20.8, 6], type: 'rail', pos: [14, 3.35, 7.45], fov: 50, rail: { a: [7.5, 3.35, 7.45], b: [20.8, 3.35, 7.45], look: [0, 0.8, 0], lag: 0.35 } },
      // floor level at Bay 4's door
      { id: 'c2_garages:bay4', vol: [BAYX(4) - 1.9, 0, BAYX(4) + 1.9, 2.4], pri: 1, type: 'static', pos: [BAYX(4) + 3.6, 0.32, 4.4], target: [BAYX(4) - 0.2, 0.55, 0.2], fov: 'fit' },
      // the dead end (west), from the lane
      { id: 'c2_garages:west', vol: [0, 0, 7.8, 6], type: 'static', pos: [12.4, 2.6, 4.4], target: [2.2, 0.5, 2.6], fov: 'fit' },
    ],
    build(K) {
      K.floor(0, 0, 32, 6, { tex: 'concrete', color: '#8a867a' });
      // the lane runs on east round the bend toward the Crescent (seen, not walked: the exit is at x 31.3)
      K.box(37, -0.05, 3, 10, 0.05, 6, { tex: 'concrete', color: '#8a867a' }, { shadow: false });
      K.prop('fence', 28.3, -0.1, 0, { variant: 'colorbond', len: 7.4, color: '#5f6b64', collide: false }); K.collider(24.6, -0.2, 32, 0.02, { h: 2.0 });
      K.prop('gum_tree', 29, -4.5, 40, {}); K.prop('power_pole', 33.5, -0.8, 0, { span: 0 });
      // the bays: a block of six under one skillion roof, brick piers between the doors
      const BR = { tex: 'brick', color: '#b8a494' };
      K.box(14.2, 0, -3.1, 20.8, 2.6, 6.2, BR, { collide: true });
      K.box(14.2, 2.6, -3.0, 21.2, 0.12, 6.8, { tex: 'metal', color: '#7a817d' }, { rot: 0 });
      for (let k = 0; k <= 6; k++) K.box(24.4 - k * 3.4, 0, 0.08, 0.3, 2.62, 0.25, BR, { collide: true });
      for (let k = 1; k <= 6; k++) {
        const x = BAYX(k);
        if (k === 4) continue;
        K.prop('roller_door', x, 0.05, 0, { w: 3.0, h: 2.3, open: k === 2 ? 0.08 : 0, color: ['#c9c4b2', '#8a9a8a', '#b8a888', '#9aa0a8', '#c0b4a0', '#8a8f8a'][k - 1] });
        K.collider(x - 1.5, -0.05, x + 1.5, 0.15, { h: 2.4 });
        K.plane(x + 1.0, 2.05, 0.07, 0.24, 0.24, boardTex('bay' + k, [String(k)], { w: 128, h: 128, bg: '#e8e2d0', fg: '#1d1d1d', size: 90, font: FN.heavy, age: 0.9 }));
        K.examine(x, 1.1, 0.5, k === 2 ? ['Bay 2. The door\'s stuck an inch off the ground. [beat] Too dark to see under.'] : [`Bay ${k}. Padlocked.`], { id: 'c2ga:bay' + k, r: 1.3 });
      }
      // Bay 4: half up, dark underneath (Chase's hiding place)
      const b4 = BAYX(4);
      K.prop('roller_door', b4, 0.05, 0, { w: 3.0, h: 2.3, open: 0.52, color: '#9aa0a8', name: 'c2_bay4door' });
      K.plane(b4 + 1.0, 2.05, 0.07, 0.24, 0.24, boardTex('bay4', ['4'], { w: 128, h: 128, bg: '#e8e2d0', fg: '#1d1d1d', size: 90, font: FN.heavy, age: 0.9 }));
      K.box(b4, 0, -0.6, 2.9, 1.15, 0.04, { color: '#050606', roughness: 1 });
      K.collider(b4 - 1.5, -0.1, b4 + 1.5, 0.12, { h: 2.4 });
      K.interact(b4, 0.6, 0.45, (G) => slideUnder(G), { id: 'c2_garages:bay4', r: 1.2 });
      K.trigger([b4 - 1.3, 0, b4 + 1.3, 1.1], (G) => (chasing() ? slideUnder(G) : null), { id: 'c2_garages:slide', once: false, when: () => chasing() });
      K.examine(b4 + 0.9, 0.9, 0.8, ['Bay 4\'s door is half up. It\'s pitch black under there.'], { id: 'c2ga:bay4x', r: 1.0, when: () => !chasing() });
      // the south side: the units' back fences, clotheslines and roofs over them, bins, a dumped couch
      for (let x = 1; x < 32; x += 3) K.prop('fence', x + 1.5, 6.15, 180, { variant: 'colorbond', len: 3, color: '#5f6b64', collide: false });
      K.collider(0, 6.05, 32, 6.4, { h: 2.0 });
      K.collider(-0.4, -0.2, 0.05, 6.4, { h: 2.2, blocker: 'Just the fence. Fog on the other side.' });
      K.prop('chainlink', 0.1, 3, 90, { len: 6, h: 2.1 });
      for (const [x, rot] of [[4.5, 0], [14.5, 180], [24.5, 0]]) { const rb = MB(); hipRoof(rb, x, 2.9, 12.5, 9, 8, 1.6, rot); mesh(K, rb, { tex: 'metal', color: '#6f3b30', roughness: 0.7 }); K.box(x, 0, 12.5, 9, 2.9, 8, { tex: 'brick', color: '#c4ae9a' }); }
      K.cyl(9.5, 0, 9.2, 0.04, 2.2, { tex: 'metal', color: '#9aa39c' }); for (let i = 0; i < 4; i++) K.box(9.5, 2.1, 9.2, 2.6, 0.02, 0.02, '#b9bcb6', { rot: i * 45 });
      K.prop('couch', 18.2, 5.35, 180, { len: 1.8, color: '#5a5040', collide: true });
      K.examine(18.2, 0.8, 5.0, ['Somebody dumped a couch against the fence. It\'s been rained on a hundred times.'], { id: 'c2ga:couch', r: 1.3 });
      for (const [x, z, lid] of [[27.5, 5.5, '#8f2a22'], [28.3, 5.5, '#2a5a2a'], [8.2, 5.5, '#8f2a22']]) K.prop('bin', x, z, 180, { variant: 'wheelie', lid });
      K.box(25.2, 1.2, 0.2, 0.18, 0.12, 0.04, { color: '#dcd8cc' });
      K.plane(25.2, 1.45, 0.23, 0.3, 0.12, boardTex('scooter', ['SCOOTER CHARGING ONLY'], { w: 256, h: 96, bg: '#f2efe6', fg: '#b3261e', size: 26, age: 0.5 }));
      K.examine(25.2, 1.3, 0.6, ['A power point on the pier. "Scooter charging only."'], { id: 'c2ga:power', r: 1.0 });
      K.examine(12, 0.2, 2.5, ['An oil stain on the concrete, shaped like somebody\'s car. [beat] Nobody here drives any more.'], { id: 'c2ga:oil', r: 1.4 });
      K.examine(1.2, 1.2, 3, 'Just the fence. Fog on the other side.', { id: 'c2ga:end', r: 1.5 });
      K.prop('streetlight', 31.4, 5.8, -90, { bank: 1, world: 'fog' });
      K.prop('fluoro_tube', BAYX(5), 0.8, 0, { h: 2.55, flicker: true, bank: 2, world: 'fog' });
      K.exit({ id: 'c2_garages:crescent', box: [31.3, 0, 32.1, 6], to: 'c2_crescent', entry: 'garages', when: () => !chasing() && !World.outageBusy, blockedMsg: chasing() ? 'I can\'t go back that way.' : null });
      // leaving the garages after Chase: the Outage (GAMEPLAY 2-5)
      K.trigger([21.5, 0, 31.2, 6], (G) => outageBegins(G), { id: 'c2_garages:outage', when: () => flag('c2_metChase') && !flag('c2_loop') && S.chapter === 2 });
      K.outageOnly(() => {
        K.pickup('rmap_village', 27.0, 0, 3.4, { id: 'c2_garages:rmap', glint: true });
        K.light('point', BAYX(4), 1.4, 1.2, { color: '#ff2a1c', intensity: 2.2, distance: 5, flicker: true });
        K.light('point', 29, 2.4, 3, { color: '#e8c21a', intensity: 2.6, distance: 7, flicker: true });
        // tubes over the bays, most of them failing
        for (const k of [1, 3, 5, 6]) K.light('fluoro', BAYX(k), 2.45, 0.35, { flicker: k !== 5, intensity: 5, distance: 7, len: 1.2 });
        K.light('point', 6, 1.8, 4.2, { color: '#1f6f6a', intensity: 2.4, distance: 7 });
        K.light('point', 17, 1.8, 4.2, { color: '#1f6f6a', intensity: 2.0, distance: 7 });
        for (let k = 1; k <= 6; k++) K.light('led', BAYX(k) - 1.2, 2.2, 0.2, { color: '#ff2a1c', size: 0.03, halo: 0.4, blink: 1 + k * 0.3 });
        K.dress('cables', [4, 0.2, 9, 1.4], 8, { seed: 283 }); K.dress('cables', [15, 0.2, 20, 1.2], 7, { seed: 284 });
        K.dress('receipts', [2, 1, 30, 5], 26, { seed: 281 });
        K.writing('FOLLOW UP TOMORROW', BAYX(2), 1.4, 0.08, 2.4, { world: 'outage' });
      });
      K.pickup('energy_drink', 2.2, 0, 5.2, { id: 'c2_garages:energyEasy', extraOnEasy: true });
      K.dress('leaves', [1, 1, 31, 5.6], 22, { seed: 282 });
    },
    async onEnter(G, from) {
      if (from === 'c2_crescent' && chasing()) {
        // he comes round the corner a moment after
        await G.wait(1.0);
        startPursuit(G, 32.6, 3.2, -90, { delay: 0.4, shoutAt: 0.2, shoutIndex: 1 });
      }
    },
  });
  // the Outage begins as Aidan leaves the garages
  async function outageBegins(G) {
    if (flag('c2_loop') || World.outageBusy) return;
    G.set('c2_loop', true);
    S.flags.c2_loopN = 0;
    G.control(true);
    await G.outage(true);
    await G.wait(0.8);
    await G.think('No. [beat] Not again.');
    G.note('Get out of here. The back gate — Exchange Road.', { id: 'c2_goal' });
  }

  // =================================================================================================================
  // BAY 4 — Chase's hiding place: a 3 × 6 m garage, the door half up at the south end (z 6). A resident's mobility
  // scooter under a sheet, a workbench, Christmas boxes, an old esky. Cameras outside one-sided walls.
  // =================================================================================================================
  async function rollOut(G) {
    await G.run(async (G2) => {
      const A = G2.aidan;
      await A.walkTo(1.5, 5.3, { speed: 1.2 });
      await A.turn(0, 0.3);
      A.pose('crawl');
      G2.sfx('bar_concrete', { vol: 0.3 });
      await A.walkTo(1.5, 5.95, { speed: 0.9, anim: 'crawl' });
      await G2.fade(1, 0.25);
    }, { control: false, letterbox: false, skippable: false, name: 'c2:rollout' });
    await G.goto('c2_garages', 'bay4', { sound: 'none', fade: false });
    await G.fade(0, 0.6);
  }
  defineRoom({
    id: 'c2_bay4', name: 'BAY 4', area: 'HILLTOP VILLAGE', chapter: 2, outdoor: false, surface: 'concrete', ambient: 'garage',
    fog: { density: 0.03, color: '#2e3534' },
    bounds: [0, 0, 3, 6],
    entries: { door: [1.5, 5.15, 180], start: [1.5, 5.15, 180] },
    cameras: [
      // a dark static from the back of the bay (out past the back wall): the half-open door, grey light under it
      { id: 'c2_bay4:back', vol: [0, 4.2, 3, 6], type: 'static', pos: [1.6, 1.7, -3.2], target: [1.5, 0.5, 4.8], fov: 'fit' },
      // floor level from the door end (out past the door): the back of the bay, the esky, the scooter
      { id: 'c2_bay4:door', vol: [0, 0, 3, 2.65], type: 'static', pos: [1.2, 0.55, 8.4], target: [1.5, 0.6, 0.8], fov: 'fit' },
      // across the middle of the bay from past the west wall (cutaway), over the boxes: the esky, the bench, his corner
      { id: 'c2_bay4:side', vol: [0, 2.3, 3, 4.3], pri: 1, type: 'static', pos: [-4.4, 2.2, 3.1], target: [1.9, 0.55, 3.2], fov: 'fit' },
      // high from the door end (past the west wall), down into the back corner: the pegboard, the shape under the sheet
      { id: 'c2_bay4:corner', vol: [0, 0, 3, 1.25], pri: 2, type: 'static', pos: [-3.3, 2.45, 5.3], target: [2.3, 0.75, 0.9], fov: 'fit' },
    ],
    build(K) {
      const H = 2.5;
      K.floor(0, 0, 3, 6, { tex: 'concrete', color: '#7a766a' });
      K.ceiling(0, 0, 3, 6, H, { tex: 'metal', color: '#6a6e6a' });
      const BR = { tex: 'brick', color: '#9a8a7a' };
      K.wall(-0.075, 0, 3.075, 0, H, BR, { both: false });
      K.wall(0, 6.075, 0, -0.075, H, BR, { both: false });
      K.wall(3, -0.075, 3, 6.075, H, BR, {});
      // the roller door (half up) — seen from inside; grey light under it
      K.prop('roller_door', 1.5, 6.05, 180, { w: 3.0, h: 2.3, open: 0.52, color: '#9aa0a8', collide: false });
      K.collider(0, 5.95, 3, 6.3, { h: 2.4 });
      K.light('point', 1.5, 0.35, 6.6, { color: '#9aa6a8', intensity: 2.4, distance: 4 });
      // a fibreglass skylight panel, grey with fog: the only light in here besides the gap under the door
      K.plane(1.5, H - 0.012, 2.4, 0.62, 1.2, { color: '#8e9a9c', emissive: '#56605f', emissiveIntensity: 0.7 }, { rot: [90, 0, 0] });
      K.light('point', 1.5, 2.2, 2.4, { color: '#7f8f92', intensity: 2.2, distance: 4.6, name: 'c2b4:sky' });
      // 2-3's fill: the grey light under the door, lifted (off until the scene)
      K.light('point', 0.9, 1.9, 5.2, { color: '#8c9a9c', intensity: 2.2, distance: 4.5, on: false, name: 'c2b4:fill', world: 'fog' });
      K.interact(1.5, 0.6, 5.55, (G) => rollOut(G), { id: 'c2_bay4:out', r: 1.1, when: () => (S.flags.c2_chase | 0) !== 2 || !!S.done['cs:2-3'] });
      // the scooter under its sheet, the workbench and pegboard, boxes, paint tins, the esky, Chase's cans
      K.box(0.55, 0, 1.3, 0.7, 0.75, 1.3, { tex: 'plastic_sheet', color: '#4a5058' }, { collide: true });
      K.box(0.55, 0.75, 0.75, 0.5, 0.45, 0.25, { tex: 'plastic_sheet', color: '#4a5058' });
      K.examine(0.8, 0.9, 1.6, ['A mobility scooter under a sheet. [beat] Somebody\'s, once.'], { id: 'c2b4:scooter', r: 1.0 });
      K.box(2.65, 0, 1.5, 0.6, 0.9, 1.8, { tex: 'wood', color: '#6a5a44' }, { collide: true });
      K.box(2.95, 1.1, 1.5, 0.04, 0.9, 1.6, { tex: 'wood', color: '#b8a888' });
      for (let i = 0; i < 6; i++) K.box(2.9, 1.3 + (i % 2) * 0.35, 0.9 + i * 0.22, 0.03, 0.22, 0.06, { tex: 'metal', color: '#6d7470' });
      K.examine(2.5, 1.2, 1.5, ['Tools on a pegboard, an outline drawn round every one. [beat] One outline\'s empty.'], { id: 'c2b4:bench', r: 1.0 });
      K.prop('box_stack', 0.45, 3.1, 90, { n: 3 });
      K.prop('box', 0.45, 3.9, 10, { w: 0.5, h: 0.35, d: 0.4, text: 'XMAS DECS' });
      K.examine(0.7, 0.6, 3.5, ['Boxes. "XMAS DECS," in thick marker. "TAX 2014."'], { id: 'c2b4:boxes', r: 0.9 });
      K.prop('paint_tins', 2.6, 3.6, 0);
      K.examine(2.5, 0.4, 3.6, ['Paint tins. "HALL — TRIM." "UNIT 4 — FRONT DOOR."'], { id: 'c2b4:paint', r: 0.8 });
      K.prop('esky', 1.5, 2.7, 90, {});
      for (const [x, z] of [[1.9, 3.3], [2.05, 3.15], [1.1, 3.4]]) K.prop('energy_can', x, z, x * 60, {});
      K.examine(1.5, 0.5, 2.4, ['An old esky. Chase\'s energy drink cans lined up beside it. [beat] All empty.'], { id: 'c2b4:esky', r: 0.9 });
      // his corner: flattened boxes laid out like a bed, a hoodie for a pillow, a phone charger going nowhere
      K.box(0.68, 0, 4.95, 0.9, 0.02, 1.5, { tex: 'cardboard', color: '#9a8466' }, { rot: 6, shadow: false });
      K.box(0.62, 0.02, 5.45, 0.5, 0.1, 0.34, { tex: 'fabric_knit', color: '#2a3034' }, { rot: 12 });
      K.cyl(0.95, 0.02, 4.6, 0.004, 0.9, '#e8e6e0', { rz: 90, rot: 30 });
      K.examine(0.7, 0.3, 4.9, ['Flattened boxes on the floor, laid out like a bed. A hoodie for a pillow.', 'Couple of hours, he said. [beat] He\'s been in here longer than that.'], { id: 'c2b4:bed', r: 0.9 });
      K.examine(1.5, 2.3, 2.4, ['A fibreglass panel in the roof. Grey. [beat] The fog pressed flat against it.'], { id: 'c2b4:sky', r: 1.2 });
      K.examine(2.7, 1.0, 4.6, ['From in here you\'d see anyone\'s feet go past under the door. [beat] Before they saw you.'], { id: 'c2b4:watch', r: 0.8 });
      K.outageOnly(() => {
        K.pickup('first_aid', 1.55, 0.4, 2.7, { id: 'c2_bay4:firstaid', world: 'outage' });
        K.light('point', 1.5, 2.1, 3, { color: '#ff2a1c', intensity: 1.3, distance: 4, flicker: true });
        K.prop('receipt_strip', 1.2, 4.2, 0, { ceil: H, len: 0.9 });
        K.dress('receipts', [0.3, 0.3, 2.7, 5.6], 10, { seed: 291 });
      });
    },
    async onEnter(G, from) {
      if (from === 'c2_garages' && (S.flags.c2_chase | 0) === 2 && !S.done['cs:2-3']) await G.cutscene('2-3');
    },
  });

  // =================================================================================================================
  // CUTSCENE 2-1 "Unit 9" — the hall from its far end: the door, the fog spilling in, the door closing; silence, then the
  // clock. The kitchen from a high corner like CCTV. The base station: "NO LINE". His face, half in torchlight.
  // =================================================================================================================
  const C21 = { out: [4.0, 8.95], inside: [4.0, 6.85], face: [4.02, 3.55] };
  defineCutscene('2-1', async (G) => {
    const A = G.aidan;
    const door = G.door('c2_unit9:front');
    const torch0 = !!Player.torchOn;
    if (A.raw) A.raw.idleLife = false;
    stopRoomSounds();
    // 1. SHOT — from the far end of the hallway: he opens the door and the fog spills in. The door closes. Silence.
    await G.fade(1, 0);
    A.place(C21.out[0], C21.out[1], 180, { y: 0 });
    A.pose('idle');
    Player.setTorch(true);
    G.cam({ pos: [4.08, 1.72, 1.4], target: [4.0, 1.1, 8.0], fov: 38, to: { pos: [4.06, 1.7, 1.7], fov: 37 }, dur: 14 });
    await G.fade(0, 0.9);
    await G.wait(0.9);
    G.sfx('unlock', { pos: [4, 1.1, 8.1], vol: 0.6 });
    await G.wait(0.7);
    door.open();
    C2.spill = 0;
    { const dl = G.light('c2u9:door'); if (dl) dl.on(true); }
    await G.wait(1.1);
    await A.walkTo(C21.inside[0], C21.inside[1], { speed: 0.85, collide: false });
    await A.turn(0, 0.7);
    door.close();
    await G.wait(0.45);
    { const dl = G.light('c2u9:door'); if (dl) dl.on(false); }
    await A.turn(180, 0.8);
    await G.wait(2.2);                                                   // silence …
    C2.tick = Snd.play('clock_tick', { loop: true, pos: [1.8, 1.95, 4.9], vol: 0.45 });   // … then a clock ticking
    await G.wait(2.4);
    // 2. SHOT — the kitchen, high corner, like CCTV: the chair on its side on the lino, the tea towel, the base station
    G.post({ desat: 0.6, grain: 0.32, vignette: 0.75 });
    G.cam({ pos: [1.0, 2.4, 4.86], target: [1.2, 0.3, 1.45], fov: 66 });
    await G.wait(4.2);
    G.post({ desat: 0, grain: null, vignette: null });
    // 3. SHOT — close on the base station's display: "NO LINE". It beeps softly every few seconds.
    G.cam({ pos: [0.68, 1.1, 1.47], target: [0.37, 0.955, 1.4], fov: 26, to: { pos: [0.62, 1.08, 1.45], fov: 24 }, dur: 5 });
    await G.wait(1.0);
    G.sfx('beep', { pos: [U9K.base[0], 1.0, U9K.base[2]], vol: 0.2 });
    await G.wait(2.6);
    G.sfx('beep', { pos: [U9K.base[0], 1.0, U9K.base[2]], vol: 0.2 });
    await G.wait(1.2);
    // 4. SHOT — his face, half in torchlight. He doesn't look at the chair.
    A.place(C21.face[0], C21.face[1], 0);
    A.pose('idle');
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('tired'); A.raw.lookAt(null); }
    Player.setTorch(true);
    { const fl = G.light('c2u9:face'); if (fl) fl.on(true); }
    G.cam({ pos: [4.26, 1.62, 4.72], target: [4.0, 1.58, C21.face[1]], fov: 30, to: { pos: [4.24, 1.62, 4.6], fov: 27 }, dur: 8 });
    await G.wait(1.4);
    if (A.raw) A.raw.eyes('ahead');
    await G.say('AIDAN', 'Okay. Okay. The modem. That\'s all it is.');
    await G.wait(0.8);
    // state (plain statements: a skip lands here the same way)
    { const fl = G.light('c2u9:face'); if (fl) fl.on(false); }
    { const dl = G.light('c2u9:door'); if (dl) dl.on(false); }
    Player.setTorch(torch0);
    door.close({ instant: true, silent: true });
    C2.spill = null;
    if (!C2.tick) C2.tick = Snd.play('clock_tick', { loop: true, pos: [1.8, 1.95, 4.9], vol: 0.45 });
    A.place(C21.face[0], C21.face[1] + 0.1, 0);
    if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); A.raw.expr('neutral'); }
    G.note('The modem. The phone socket\'s in the lounge.', { id: 'c2_goal' });
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 2-2 "Are You From the Phone Company?" — out of Unit 9 into thick fog: a figure at the end of the path under
  // the streetlight, only a silhouette. The lanyard. The figure coming, fast. The bars jumping to four and pulsing like a
  // heartbeat — the Reach tell, although Luke is a person. He runs (→ GAMEPLAY 2-4, the chase).
  // =================================================================================================================
  const C22 = { step: [U9DOOR[0], U9DOOR[1] - 0.35], stop: [U9DOOR[0] + 0.05, -0.35], luke: [12.45, 4.4], lukeTo: [12.75, 1.9], run: [17.2, -0.95] };
  defineCutscene('2-2', async (G) => {
    const A = G.aidan;
    const door = G.door('c2_crescent:u9');
    if (A.raw) A.raw.idleLife = false;
    C2.fogTo = 0.078;
    try { if (Render.fog) Render.fog.density = 0.078; } catch (e) { /* no fog */ }
    const L = G.actor('luke', 'luke', { at: [C22.luke[0], C22.luke[1], 180] });
    const keep = [];
    if (L.raw) { silhouette(L.raw, keep); L.raw.idleLife = false; L.raw.eyes('closed'); }
    L.pose('idle');
    // 1. SHOT — low from the footpath: he steps out of Unit 9. Thick fog. A tall figure stands at the end of the path,
    //    backlit by the streetlight, only a silhouette.
    await G.fade(1, 0);
    A.place(C22.step[0], C22.step[1], 0);
    A.pose('idle');
    G.cam({ pos: [13.85, 0.62, -3.3], target: [12.95, 2.25, 4.2], fov: 52, to: { pos: [13.82, 0.6, -3.1], fov: 50 }, dur: 12 });
    await G.fade(0, 0.8);
    await G.wait(0.5);
    door.open();
    await G.wait(0.6);
    await A.walkTo([[C22.step[0], U9DOOR[1] + 1.0], C22.stop], { speed: 1.05, collide: false });
    door.close();
    await G.wait(0.4);
    if (A.raw) A.raw.lookAt(L.raw);
    await G.wait(1.1);
    await G.say('LUKE', 'Oi. [beat] Are you from the phone company?');
    await G.wait(0.3);
    // 2. SHOT — close on his lanyard with the store logo. He covers it with his hand.
    {
      const c = anchorPos(Player.actor, 'card'), yw = Player.actor ? Player.actor.root.rotation.y : 0, fx = Math.sin(yw), fz = Math.cos(yw);
      if (!c.lengthSq()) c.set(C22.stop[0], 1.25, C22.stop[1]);
      G.cam({ pos: [c.x + fx * 0.62 - fz * 0.1, c.y + 0.1, c.z + fz * 0.62 + fx * 0.1], target: [c.x, c.y + 0.03, c.z], fov: 32 });
    }
    await G.wait(0.7);
    A.gesture('cover_lanyard', { hold: true }).catch(() => {});
    await G.wait(1.6);
    // 3. SHOT — wide. The figure starts toward him, fast, heavy boots on concrete.
    G.cam({ pos: [19.4, 2.2, 2.6], target: [13.2, 1.05, 1.2], fov: 50 });
    if (A.raw) A.raw.expr('scared');
    let boots = true;
    const bootsP = (async () => {
      while (boots && !G.skipping) {
        const p = L.pos;
        try { Snd.footstep('concrete', true, { pos: [p.x, p.y, p.z], vol: 1.0, heavy: true }); } catch (e) { /* audio */ }
        await G.wait(0.34);
      }
    })();
    const walkP = L.walkTo(C22.lukeTo[0], C22.lukeTo[1], { speed: 2.3, anim: 'walk' });
    await G.wait(0.5);
    await G.say('LUKE', 'Hey! I\'m talking to you! Do you work for them?');
    // 4. SHOT — insert on his phone: the bars jump to 4 and pulse like a heartbeat.
    G.bars(pulseBars(4));
    if (A.raw) { A.raw.finishGestures(); A.raw.armPose('R', 'phone_up'); A.raw.eyes('down'); }
    await G.wait(0.15);
    await G.wait(0.3);
    { const ps = phoneShot(0.26, 24, 0.03, 0.035); if (ps) G.cam(ps); }
    await G.wait(2.4);
    // … he runs
    G.cam({ pos: [21.5, 1.7, 3.4], target: [15.2, 1.1, -0.9], fov: 46 });
    if (A.raw) { A.raw.armPose('R', 'phone'); A.raw.lookAt(null); A.raw.eyes('ahead'); }
    const runP = A.walkTo(C22.run[0], C22.run[1], { run: true, speed: 3.8 });
    await G.wait(0.9);
    boots = false;
    await Promise.all([bootsP, walkP, runP].map((p) => Promise.resolve(p).catch(() => {})));
    // state (plain statements): the chase is on
    boots = false;
    const lp = L.pos ? [L.pos.x, L.pos.z] : C22.lukeTo;
    L.remove();
    for (const m of keep) { try { m.dispose(); } catch (e) { /* gone */ } }
    door.close({ instant: true, silent: true });
    if (A.raw) { A.raw.finishGestures(); A.raw.armPose('R', 'phone'); A.raw.idleLife = true; A.raw.expr('scared'); }
    A.place(C22.run[0], C22.run[1], 90);
    S.flags.c2_chase = 1;
    setChaseWalls(true);
    C2.fogTo = 0.06;
    startPursuit(G, lp[0], lp[1], 90, { delay: 0.6, shoutAt: 1.4, shoutIndex: 0 });
    G.note('RUN. The lane by the garages.', { id: 'c2_goal' });
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 2-3 "Legend" — Bay 4, dark. He rolls under the door; the shouting fades. Behind him a shape rises with a steel
  // bar raised: Chase, mid-swing, frozen inches from his head. The esky, the earbuds, the shaking hands; he rolls out.
  // =================================================================================================================
  const C23 = { outside: [1.5, 6.85], in: [1.5, 4.85], hide: [1.95, 1.65], strike: [1.72, 4.02], esky: [1.5, 2.7], stand: [1.22, 4.35], up: [1.55, 3.4] };
  // freeze Chase's held swing at a fraction of the gesture (the swing's key poses: 0.32 raised, 0.46 at the strike)
  function swingAt(C, u, run = false) {
    const r = C && C.raw;
    if (!r || !r.state || !r.state.gest) return;
    for (const slot of Object.keys(r.state.gest)) {
      const g = r.state.gest[slot];
      if (g && g.name === 'swing') { if (u !== null) g.t = g.dur * u; g.speed = run ? 1 : 0; }
    }
  }
  const swingU = (C) => { const r = C && C.raw; if (!r || !r.state) return 0; for (const g of Object.values(r.state.gest)) if (g && g.name === 'swing') return g.t / g.dur; return 0; };
  defineCutscene('2-3', async (G) => {
    const A = G.aidan;
    const torch0 = !!Player.torchOn;
    if (A.raw) A.raw.idleLife = false;
    const C = G.actor('chase', 'chase', { at: [C23.hide[0], C23.hide[1], 0] });
    if (C.raw) C.raw.idleLife = false;
    C.pose('crouch');
    C.look(null);
    // 1. SHOT — floor level inside the dark garage. He rolls under the door, breathing hard. Outside, the shouting fades.
    await G.fade(1, 0);
    Player.setTorch(false);
    A.place(C23.outside[0], C23.outside[1], 180, { y: 0 });
    A.pose('crawl');
    G.cam({ pos: [0.78, 0.24, 2.4], target: [1.5, 0.62, 5.9], fov: 54 });
    await G.fade(0, 0.35);
    G.sfx('bar_concrete', { vol: 0.25 });
    await A.walkTo(C23.in[0], C23.in[1], { speed: 1.1, anim: 'crawl', collide: false, end: 'kneel' });
    A.pose('kneel');
    if (A.raw) { A.raw.lookAt([1.5, 0.6, 6.4]); A.raw.expr('scared'); }
    G.sfx('breath', { n: 4, vol: 0.9, phone: false });
    await G.wait(0.6);
    try { Enemies.say(LUKE_SHOUTS()[2], 'quiet', 2.0); } catch (e) { /* voice */ }
    G.sfx('murmur_reach', { pos: [1.5, 1.7, 14], vol: 0.35, dur: 1.6 });
    await G.wait(2.6);
    await G.wait(1.6);                                                   // silence
    // 2. SHOT — behind him. In the dark a shape rises with a steel bar raised. The torch catches it: Chase, mid-swing.
    G.cam({ pos: [1.05, 0.95, 5.75], target: [1.75, 1.15, 1.9], fov: 48 });
    G.sfx('creak', { pos: [C23.hide[0], 0.5, C23.hide[1]], vol: 0.5 });
    await G.wait(0.5);
    C.pose('idle', { blend: 0.9 });
    C.gesture('swing', { hold: true, dur: 1.2 }).catch(() => {});
    await G.wait(0.05);
    swingAt(C, 0.08, true);
    await G.until(() => swingU(C) >= 0.3 || G.skipping, { timeout: 2 });
    swingAt(C, 0.31);
    await A.turn(180, 0.35);
    G.sfx('torch', { vol: 0.7 });
    Player.setTorch(true);
    if (A.raw) A.raw.lookAt(C.raw);
    await G.wait(0.9);
    // 3. SHOT — Chase freezes, the bar stopped inches from his head.
    const lunge = C.walkTo([[2.1, 2.6], C23.strike], { speed: 2.8 });
    swingAt(C, null, true);
    await G.until(() => swingU(C) >= 0.46 || G.skipping, { timeout: 1.2 });
    swingAt(C, 0.46);
    await Promise.resolve(lunge).catch(() => {});
    C.place(C23.strike[0], C23.strike[1], -15);
    A.gesture('flinch').catch(() => {});
    { const fl = G.light('c2b4:fill'); if (fl) fl.on(true); }
    G.cam({ pos: [0.2, 1.02, 4.5], target: [1.62, 1.36, 4.45], fov: 58 });
    G.sfx('whoosh', { vol: 0.5 });
    await G.wait(1.3);
    C.expr('wide');
    await G.say('CHASE', 'Whoa— [beat] Mate! Legend!');
    C.expr('grin');
    if (C.raw) C.raw.finishGestures();
    C.pose('idle');
    C.gesture('laugh').catch(() => {});                                                  // (laughs too loud)
    await G.wait(0.9);
    await G.say('CHASE', 'Thought you were one of them!');
    if (A.raw) A.raw.expr('wide');
    await G.say('AIDAN', 'Chase? What are you— you nearly—');
    C.expr('smile_huge');
    await G.say('CHASE', 'Nearly! Nearly\'s fine. Nearly\'s a good day. [beat] What are you doing out here? You\'re city store, yeah? Aidan?');
    // 4. SHOT — two-shot: Chase sits on the old esky, earbuds hanging, tapping the bar against his boot.
    await G.fade(1, 0.2);
    A.place(C23.stand[0], C23.stand[1], 180);
    A.pose('idle');
    if (A.raw) { A.raw.expr('tired'); A.raw.lookAt(C.raw); }
    C.place(C23.esky[0], C23.esky[1] - 0.04, 0, { y: 0 });
    C.pose('sit', { seat: 0.38, blend: 0 });
    if (C.raw) { C.raw.setEarbuds(false); C.raw.lookAt(A.raw); }
    C.expr('grin');
    G.cam({ pos: [2.72, 1.32, 5.25], target: [1.36, 0.92, 3.45], fov: 46, to: { pos: [2.66, 1.3, 5.1], fov: 44 }, dur: 30 });
    await G.fade(0, 0.25);
    C.gesture('tap_bar').catch(() => {});
    await G.say('CHASE', 'Car died at the turn-off. Walked in. Reckon I\'ve been here, what, couple of hours?');
    await G.say('AIDAN', 'Mine died there too.');
    C.gesture('tap_bar').catch(() => {});
    await G.say('CHASE', 'Weird, eh. [beat] You seen them? The big ones with the mouths? The arms?');
    if (A.raw) A.raw.eyes('down');
    await G.say('AIDAN', '...Yeah.');
    // (grinning, bouncing on his heels)
    await C.gesture('stand_up', { to: 'idle' });
    await C.walkTo(C23.up[0], C23.up[1], { speed: 1.2 });
    G.cam({ pos: [2.74, 1.42, 5.35], target: [1.42, 1.3, 3.5], fov: 48 });
    C.expr('smile_huge');
    C.gesture('bounce').catch(() => {});
    await G.say('CHASE', 'I\'ve done three. You just gotta hit \'em first. That\'s the trick. Hit \'em first.');
    if (A.raw) A.raw.eyes('ahead');
    await G.say('AIDAN', 'There was a guy chasing me. A real guy. I think.');
    // (a beat too serious)
    C.expr('flat');
    await G.wait(0.5);
    await G.say('CHASE', 'Yeah? [beat] Customer?');
    await G.say('AIDAN', '...I don\'t know.');
    C.expr('grin');
    await G.say('CHASE', 'They\'re all customers here, mate.');
    C.gesture('laugh').catch(() => {});                                                  // he laughs. Nobody else does.
    await G.wait(1.4);
    C.expr('neutral');
    await G.wait(0.8);
    // 5. SHOT — close on Chase's hands. They're shaking. He puts his earbuds back in.
    C.gesture('tremor', { amount: 1 }).catch(() => {});
    await G.wait(0.1);
    {
      const hr = anchorPos(C.raw, 'gripR');
      if (!hr.lengthSq()) hr.set(C23.up[0] - 0.25, 0.95, C23.up[1] + 0.1);
      G.cam({ pos: [hr.x - 0.3, hr.y + 0.2, hr.z + 0.5], target: [hr.x + 0.08, hr.y + 0.02, hr.z], fov: 36 });
    }
    await G.wait(1.9);
    G.cam({ pos: [C23.up[0] - 0.45, 1.3, C23.up[1] + 1.15], target: [C23.up[0] - 0.02, 1.22, C23.up[1]], fov: 46 });
    C.gesture('earbud_in').catch(() => {});
    await G.wait(1.5);
    G.cam({ pos: [2.72, 1.4, 5.3], target: [1.35, 1.2, 3.2], fov: 42 });
    C.expr('smile');
    await G.say('CHASE', 'Where you headed?');
    await G.say('AIDAN', 'Someone rang me. Wai. He\'s at the old exchange.');
    C.expr('grin');
    await G.say('CHASE', 'Sweet. I\'m gonna check the servo for a car battery. Meet you up there. [beat] Don\'t die, legend.');
    // … he rolls out under the door and is gone
    G.cam({ pos: [1.95, 1.45, 0.45], target: [1.5, 0.5, 5.7], fov: 48 });
    if (A.raw) A.raw.lookAt(C.raw);
    await C.walkTo([[1.75, 4.2], [1.55, 5.2]], { speed: 1.5 });
    C.pose('crawl');
    G.sfx('bar_concrete', { vol: 0.3 });
    await C.walkTo(1.55, 6.9, { speed: 1.2, anim: 'crawl', end: 'crawl' });
    await G.wait(1.4);
    // state (plain statements: a skip lands here the same way)
    C.remove();
    endPursuit();
    G.bars(null);
    { const fl = G.light('c2b4:fill'); if (fl) fl.on(false); }
    Player.setTorch(torch0);
    A.place(C23.stand[0] + 0.1, C23.stand[1] - 0.3, 0);
    A.pose('idle');
    if (A.raw) { A.raw.lookAt(null); A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    S.flags.c2_chase = 3;
    G.set('c2_metChase', true);
    setChaseWalls(false);
    G.note('Wai. The old exchange — up Exchange Road, through the back gate.', { id: 'c2_goal' });
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // @@C2_CHAPTER@@
  defineChapter({
    n: 2, id: 'ch2', title: 'HILLTOP VILLAGE', card: 'HILLTOP VILLAGE',
    start: { room: 'c2_hilltoprd', entry: 'bottom' },
    // what a player carries into Chapter 2 (chapter select): the Prologue and Chapter 1
    debugState(s) {
      const give = (id, n = 1) => { const e = s.inv.find((i) => i && i.id === id); if (e) e.n = (e.n || 1) + (ITEMS[id] && ITEMS[id].stack === false ? 0 : n); else s.inv.push({ id, n }); };
      for (const id of ['returned_modem', 'box_cutter', 'steel_bar', 'map_town', 'map_plaza', 'rmap_plaza', 'staff_key', 'first_day_badge', 'certificate']) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1);
      s.equipped = 'steel_bar';
      for (const id of ['map_town', 'map_plaza', 'rmap_plaza']) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, { c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true, standardName: s.flags.standardName || 'LUKA', p0_carDead: true });
      const lvl = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lvl}`] ? `${b}_${lvl}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'huddle1', 'returns1', 'returns2', 'returns3', 'returns4']) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      s.calls.luka1 = s.calls.luka1 || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 1);
      Object.assign(s.done, { 'cs:P-1': true, 'cs:P-4': true, 'cs:1-1': true, 'cs:1-2': true, 'cs:1-7': true, 'cs:1-8': true });
      s.F = Math.max(s.F || 0, 5); s.A = Math.max(s.A || 0, 1); s.stats.freed = Math.max(s.stats.freed || 0, 1);
      if (!s.notes.some((n) => n && n.id === 'c2_goal')) s.notes.push({ id: 'c2_goal', text: 'Unit 9, Hilltop Village. Up the hill.', done: false });
    },
    async begin(G) {
      G.bars(null);
      if (G.once('c2:begin')) {
        G.note('Unit 9, Hilltop Village. Up the hill.', { id: 'c2_goal' });
        await G.wait(1.2);
        await G.think('Hilltop Village. [beat] Up there somewhere.');
      }
    },
  });
}
