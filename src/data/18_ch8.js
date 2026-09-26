// ==== data/18_ch8.js — Chapter 8 "The Mast" (spec §12 Chapter 8 + in-room endings, §7A Summit Road, §7B The Mast,
// §6 the Closer / the Standard / the common monsters, §2A riddle row "Ch 8 gate", §4 ending logic) — tag C8_ ====
// The whole chapter plays in the Outage: the siren sounds as the chapter starts (begin) on the summit road.
// Rooms (CONTENT_PLAN §2):
//   c8_summit       Summit Road: 160 m climbing from the hospital car park's chained gate (bottom, south-east) in three
//                   hairpins (legs A–D, x east, −z north) to the compound gate apron (top). Retaining walls between the
//                   terraces, guardrails over the drop, power poles, a telco tech's ute, a telephone pillar spilling the
//                   receipt map (rmap_mast). Every Tethered Aidan cut free sits on the uphill verges in the order he freed
//                   them (S.freedOrder), watching, never moving; none freed → an empty road. Reach ×2, Tethered ×3.
//                   The fog thins as he climbs; the mast's red light shows through it at the top.
//   c8_compound     The mast compound (30 × 20 m chain-link, x 0–30, z 0–20) and the gate apron south of it. Gate: a
//                   4-digit combination padlock (1961; Hard 1408), the Compound Diagram (map_mast) cable-tied to it, the
//                   emergency phone on the fence (Wai if waiSaved, else the laminated gate card), a payphone booth, the
//                   Borrowed "Luka" (badge LUAK) at the gate. Inside: the mast's inner enclosure (→ c8_mast:base), the
//                   east hut (first aid kit, energy drink), the locked west hut, the Unread on the floodlight pole.
//   c8_mast         The mast (60 m lattice, centre 0,0): the base yard, three ladder runs with cages (L1 south face 0→20,
//                   L2 east face 20→40, L3 north face 40→56) and three 4 × 4 m grating platforms staggered round the
//                   shaft so no walkable floor sits over another (P1 east y 20, P2 north y 40, P3 west y 56 — the top
//                   landing, beside the transmitter hut on the mast head). The Unread nest on L2 above P1 (climb it with
//                   the torch off); from P2 the Standard (AIDAN) climbs after him at walking pace. CUTSCENE 8-1 on P3.
//                   Phone bars flicker 0–5 at random (G.bars('flicker')). Heavy wind.
//   c8_transmitter  Inside the 6 × 6 m hut: an impossibly large 30 × 20 m glossy sales floor (the Closer's arena):
//                   white plinths, spotlights, a gleaming counter, windows full of fog and the town's faint lights.
// Cutscenes: 8-1 "The Mirror" (→ the Yes check at the hut door → G.ending('yes') | 8-2), 8-2 "The Pitch" → BOSS
//   'closer' (Phase 1 The Pitch: DIALOGUE.closer_pitch every 8 s, [Hold E] Lower your hands → 8-2A "Signed" →
//   acceptedDeal → G.ending('tomorrow'); attacking → Phase 2 The Close: HP 300, pen slashes, the lunge, the sweeping
//   spotlight, signatures (UI.stamp), DIALOGUE.closer_barks) → at 30 % 8-3 "The Callback" → BOSS 'closer_call' (crawl to
//   the phone) → 8-4 "Ringing" → Game.endingFor(S): E-C1 "Connected" | E-OC0 | E-FT0 → G.ending(name).
// Stickers: sticker11 (under the lookout bench on the second hairpin), sticker12 (mast platform 2, the kick plate).
// State: S.flags c8_luka (seen him), c8_phone (emergency phone used), c8_gate (padlock open), c8_nest (knocked off once),
//   c8_std (the Standard started), c8_top (reached P3), acceptedDeal (fate); S.done c8:* keys and cs:* ids.
{
  const D2R = Math.PI / 180;
  const clamp = U.clamp, lerp = U.lerp;
  const FN = Tex.fonts, BR = Tex.brand;
  const flag = (k) => !!(S.flags && S.flags[k]);
  const done = (k) => !!(S.done && S.done[k]);
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio */ } return null; };
  const sloop = (name, on, o) => { try { if (typeof Snd !== 'undefined' && Snd.loop) Snd.loop(name, on, o); } catch (e) { /* audio */ } };
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const riddle = () => (S.difficulty && S.difficulty.riddle) || 'normal';
  const pickDoc = (b) => (typeof DOC_pick === 'function' ? DOC_pick(b) : (DOCUMENTS[`${b}_${riddle()}`] ? `${b}_${riddle()}` : b));
  const gateCode = () => (riddle() === 'hard' ? '1408' : '1961');
  const busy = () => { try { return !!Script.busy; } catch (e) { return false; } };
  // transient presentation state (never saved)
  const C8 = { amb: -1, fogTo: null, ring: null, fight: null, std: null, nestT: 0, phone: null, orbitT: 0, gate: null, hutObj: null };
  try { if (typeof window !== 'undefined' && window.SH) window.SH.c8 = C8; } catch (e) { /* tests only */ }

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash('c8:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c8:' + key;
    TEXC.set(key, t);
    return t;
  }
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    if (o.spacing) { try { ctx.letterSpacing = o.spacing + 'px'; } catch (e) { /* old canvas */ } }
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  const hand = (ctx, s, x, y, o = {}) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };

  // a soft round dot (the town's lights far below, sodium through fog)
  const dotTex = () => ctex('dot', 64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // fog beyond glass: dark teal-grey, lighter toward the horizon, the town's sodium lights scattered low
  const fogWinTex = () => ctex('fogwin', 512, 256, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d2426'); g.addColorStop(0.5, '#3d4848'); g.addColorStop(0.72, '#4b5756'); g.addColorStop(1, '#262e2e');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 44; k++) {
      const px = r() * w, py = h * (0.7 + r() * 0.26), rad = 2 + r() * 7;
      const gg = x.createRadialGradient(px, py, 0, px, py, rad);
      gg.addColorStop(0, `rgba(255,${150 + r() * 40},70,${0.3 + r() * 0.4})`); gg.addColorStop(1, 'rgba(255,160,70,0)');
      x.fillStyle = gg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    for (let k = 0; k < 9; k++) { const y = r() * h, hh = 10 + r() * 40; x.fillStyle = `rgba(160,176,172,${0.03 + r() * 0.05})`; x.fillRect(0, y, w, hh); }
  }, { wrap: true });
  // the telco work sheet on the ute's seat
  const workSheetTex = () => ctex('worksheet', 256, 340, (x, w, h, r) => {
    x.fillStyle = '#f1efe6'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.tealDeep; x.fillRect(0, 0, w, 34);
    tx(x, 'FIELD WORK ORDER', 12, 23, 17, '#fff', { weight: 'bold' });
    const rows = [['SITE', '4401 SIGNAL HILL MAST'], ['FAULT', 'NO SERVICE — AREA'], ['REPORTED', '3 x (customer)'], ['PRIORITY', 'TOMORROW'], ['TECH', '—']];
    rows.forEach(([k, v], i) => { tx(x, k, 12, 66 + i * 30, 12, '#666', { font: FN.mono }); tx(x, v, 100, 66 + i * 30, 13, '#111', { font: FN.mono, weight: 'bold' }); x.fillStyle = '#ccc'; x.fillRect(12, 72 + i * 30, w - 24, 1); });
    hand(x, 'couldn\'t get up the hill.', 16, 250, { size: 17, color: '#1f2c6e' });
    hand(x, 'will try again tmrw', 16, 276, { size: 17, color: '#1f2c6e' });
    age(x, w, h, r, 0.55);
  });
  // the Compound Diagram: laminated A4 cable-tied to the gate (same drawing as the map item)
  const diagramTex = () => ctex('diagram', 300, 420, (x, w, h, r) => {
    x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, 44);
    tx(x, 'MAST COMPOUND', w / 2, 21, 20, '#fff', { weight: 'bold', align: 'center' });
    tx(x, 'SITE 4401 — DIAGRAM', w / 2, 38, 12, '#fff', { align: 'center' });
    x.strokeStyle = '#222'; x.lineWidth = 2; x.setLineDash([5, 3]); x.strokeRect(30, 70, 240, 180); x.setLineDash([]);
    x.lineWidth = 2; x.strokeRect(116, 76, 68, 70);
    x.beginPath(); x.moveTo(126, 86); x.lineTo(174, 136); x.moveTo(174, 86); x.lineTo(126, 136); x.stroke();
    tx(x, 'MAST', 150, 160, 11, '#222', { weight: 'bold', align: 'center' });
    x.fillStyle = '#9a9a92'; x.fillRect(46, 110, 42, 40); x.fillRect(214, 116, 44, 42);
    tx(x, 'HUT 1', 67, 166, 10, '#333', { align: 'center' }); tx(x, 'HUT 2', 236, 172, 10, '#333', { align: 'center' });
    x.fillStyle = '#b3261e'; x.fillRect(136, 244, 28, 8); tx(x, 'GATE', 150, 268, 11, '#b3261e', { weight: 'bold', align: 'center' });
    // the climb: a side elevation
    x.strokeStyle = '#333'; x.lineWidth = 2; x.beginPath(); x.moveTo(110, 405); x.lineTo(140, 290); x.lineTo(160, 290); x.lineTo(190, 405); x.stroke();
    for (const [yy, lab] of [[375, '20 m'], [335, '40 m'], [298, '56 m']]) { x.fillStyle = '#e8b810'; x.fillRect(166, yy - 3, 22, 6); tx(x, lab, 194, yy + 4, 10, '#333'); }
    tx(x, 'LADDER CAGE — HARNESS REQUIRED', 12, 286, 9, '#b3261e', { weight: 'bold' });
    tx(x, 'YOU ARE HERE ▲', 124, 290 - 44, 10, '#b3261e', { weight: 'bold' });
    age(x, w, h, r, 0.35);
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // the laminated card inside the emergency phone box (riddle-level wording, matching the gate_card docs)
  const gateCardTex = (lv) => ctex('gatecard|' + lv, 200, 280, (x, w, h, r) => {
    x.fillStyle = '#efe9d4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d8b928'; x.fillRect(0, 0, w, 28);
    tx(x, 'SITE ACCESS', w / 2, 20, 16, '#222', { weight: 'bold', align: 'center' });
    const t = lv === 'easy' ? ['GATE: 1961', '— year the', 'exchange', 'opened.'] : lv === 'hard' ? ['GATE: day and', 'month the', 'exchange opened', '(see plaque).'] : ['GATE: year the', 'exchange', 'opened', '(see plaque).'];
    t.forEach((s, i) => hand(x, s, 16, 70 + i * 36, { size: 22, color: '#141414' }));
    age(x, w, h, r, 0.4);
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // the climb register on its post at the ladder foot: the last line's already filled in
  const registerTex = () => ctex('register', 256, 360, (x, w, h, r) => {
    x.fillStyle = '#f2efe4'; x.fillRect(0, 0, w, h);
    tx(x, 'CLIMB REGISTER — SITE 4401', 10, 24, 13, '#222', { weight: 'bold' });
    tx(x, 'NAME          IN     REASON', 10, 46, 10, '#555', { font: FN.mono });
    x.fillStyle = '#aaa'; for (let i = 0; i < 9; i++) x.fillRect(10, 58 + i * 30, w - 20, 1);
    const rows = [['M.', '07:10', 'RF alarm'], ['J.', '11:40', 'antenna ck'], ['M.', '06:55', 'storm'], ['', '', ''], ['', '', '']];
    rows.forEach(([n, t, why], i) => { if (!n) return; hand(x, n, 12, 80 + i * 30, { size: 15, color: '#1f2c6e' }); hand(x, t, 118, 80 + i * 30, { size: 14, color: '#1f2c6e' }); hand(x, why, 170, 80 + i * 30, { size: 13, color: '#1f2c6e' }); });
    x.strokeStyle = '#1f2c6e'; x.lineWidth = 2; x.beginPath(); x.moveTo(12, 108); x.lineTo(244, 104); x.stroke();
    hand(x, 'AIDAN', 12, 230, { size: 18, color: '#141414' });
    hand(x, '—', 124, 230, { size: 16, color: '#141414' });
    age(x, w, h, r, 0.5);
  });
  // a chevron board for the hairpins (black on yellow)
  const chevronTex = (dir) => ctex('chev|' + dir, 256, 128, (x, w, h) => {
    x.fillStyle = '#e2b416'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#141414';
    for (let i = 0; i < 3; i++) {
      const cx = 44 + i * 80;
      x.beginPath();
      if (dir > 0) { x.moveTo(cx - 24, 16); x.lineTo(cx + 14, h / 2); x.lineTo(cx - 24, h - 16); x.lineTo(cx - 4, h - 16); x.lineTo(cx + 34, h / 2); x.lineTo(cx - 4, 16); }
      else { x.moveTo(cx + 24, 16); x.lineTo(cx - 14, h / 2); x.lineTo(cx + 24, h - 16); x.lineTo(cx + 4, h - 16); x.lineTo(cx - 34, h / 2); x.lineTo(cx + 4, 16); }
      x.closePath(); x.fill();
    }
    x.strokeStyle = '#141414'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  });
  // the Closer's tablet: a contract and a signature line (signed k 0..1 draws Aidan's signature across it)
  function contractPaint(c, w, h, k = 0) {
    c.fillStyle = '#f7f7f4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0b8f8c'; c.fillRect(0, 0, w, 26);
    c.fillStyle = '#fff'; c.font = `bold 13px ${FN.sans}`; c.fillText('SERVICE AGREEMENT — 36 MONTHS', 10, 18);
    c.fillStyle = '#222'; c.font = `11px ${FN.sans}`;
    const L = ['Customer: ACCT 4471-0932', 'Callback: FOLLOW UP TOMORROW', 'I understand everything will be fine.', 'I will not make that call.', 'Case 118-2231: resolved (no action).'];
    L.forEach((s, i) => c.fillText(s, 12, 50 + i * 18));
    c.fillStyle = '#bbb'; for (let i = 0; i < 6; i++) c.fillRect(12, 150 + i * 9, w - 24 - (i % 3) * 30, 3);
    c.fillStyle = '#b3261e'; c.font = `bold 11px ${FN.sans}`; c.fillText('SIGN HERE ▶', 12, h - 26);
    c.fillStyle = '#222'; c.fillRect(96, h - 22, w - 110, 2);
    if (k > 0) {
      c.save(); c.beginPath(); c.rect(96, h - 70, (w - 110) * k, 70); c.clip();
      c.strokeStyle = '#13235c'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath();
      const pts = [[100, h - 26], [112, h - 44], [118, h - 24], [126, h - 38], [131, h - 26], [140, h - 30], [146, h - 40], [150, h - 25], [158, h - 33], [166, h - 27], [176, h - 41], [182, h - 24], [194, h - 30], [206, h - 27], [220, h - 32], [236, h - 29]];
      c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]);
      c.stroke(); c.restore();
    }
  }
  // the tear decals (damage splits the uniform: layers of signed contracts beneath, ink running from the tears)
  const tearTex = (i) => ctex('tear|' + i, 128, 256, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    // the jagged split
    const pts = []; const n = 12;
    for (let k = 0; k <= n; k++) pts.push([w * (0.5 + (r() - 0.5) * 0.35), 20 + (h * 0.55) * (k / n)]);
    x.save(); x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) x.lineTo(px - 10 - r() * 14, py);
    for (let k = pts.length - 1; k >= 0; k--) x.lineTo(pts[k][0] + 10 + r() * 14, pts[k][1]);
    x.closePath(); x.clip();
    // paper, layer on layer, with signatures and typed lines
    x.fillStyle = '#ece8dc'; x.fillRect(0, 0, w, h);
    for (let y = 16; y < h * 0.7; y += 7) { x.fillStyle = `rgba(${40 + r() * 30},${40 + r() * 30},${50 + r() * 30},0.5)`; x.fillRect(w * 0.25 + r() * 10, y, w * 0.5 * (0.5 + r() * 0.5), 1.5); }
    for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(19,35,92,0.85)'; x.lineWidth = 1.6; x.beginPath(); let px = w * 0.3, py = 30 + r() * h * 0.5; x.moveTo(px, py); for (let s = 0; s < 6; s++) { px += 6 + r() * 5; py += (r() - 0.5) * 12; x.lineTo(px, py); } x.stroke(); }
    for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 20 + r() * h * 0.5, w, 1); }
    x.restore();
    // ink running down from the tear (never red)
    for (let k = 0; k < 5; k++) {
      const sx = w * (0.4 + r() * 0.2), sy = h * (0.4 + r() * 0.2), len = h * (0.15 + r() * 0.35);
      const g = x.createLinearGradient(0, sy, 0, sy + len); g.addColorStop(0, 'rgba(10,14,40,0.95)'); g.addColorStop(1, 'rgba(10,14,40,0)');
      x.fillStyle = g; x.fillRect(sx, sy, 2 + r() * 3, len);
      x.beginPath(); x.arc(sx + 1.5, sy + len * 0.85, 2.5, 0, Math.PI * 2); x.fillStyle = 'rgba(10,14,40,0.5)'; x.fill();
    }
  });
  // the sales floor's light boxes and banners
  const bannerTex = (key, lines, o = {}) => ctex('banner|' + key, o.w || 1024, o.h || 256, (x, w, h) => {
    x.fillStyle = o.bg || '#f6f7f4'; x.fillRect(0, 0, w, h);
    // the wordmark on the left, the words centred in what's left (shrunk to fit, never overlapping it)
    let x0 = 36;
    if (o.wordmark) { try { const r = Tex.drawWordmark(x, 40, h * 0.62, h * 0.42, { color: o.wm || BR.teal }); x0 = 40 + (typeof r === 'number' && r > 0 ? r : h * 1.45) + 48; } catch (e) { x0 = w * 0.36; } }
    const avail = w - x0 - 36;
    lines.forEach(([s, size, col, y], i) => {
      x.save(); x.font = `bold ${size}px ${FN.sans}`; try { x.letterSpacing = '4px'; } catch (e) { /* old canvas */ }
      const tw = x.measureText(s).width; x.restore();
      const sz = tw > avail ? Math.floor(size * avail / tw) : size;
      tx(x, s, x0 + avail / 2, y ?? (h * (0.45 + i * 0.3)), sz, col, { weight: 'bold', align: 'center', spacing: 4, font: FN.sans });
    });
  });
  // "EMPLOYEE OF THE MONTH — AIDAN": every frame on the wall
  const eotmTex = (m) => ctex('eotm|' + m, 192, 256, (x, w, h, r) => {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0b8f8c'; x.fillRect(0, 0, w, 30);
    tx(x, 'EMPLOYEE OF THE MONTH', w / 2, 20, 11, '#fff', { weight: 'bold', align: 'center' });
    x.fillStyle = '#cfd6d4'; x.fillRect(36, 44, 120, 140);
    x.fillStyle = '#d7ae92'; x.beginPath(); x.ellipse(96, 110, 34, 42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2a211a'; x.beginPath(); x.ellipse(96, 78, 36, 18, 0, Math.PI, Math.PI * 2); x.fill();
    x.fillStyle = '#19a5a0'; x.fillRect(46, 150, 100, 34);
    x.strokeStyle = '#3a1a14'; x.lineWidth = 3; x.beginPath(); x.arc(96, 116, 26, 0.18 * Math.PI, 0.82 * Math.PI); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(78, 124, 36, 5);
    tx(x, 'AIDAN', w / 2, 212, 20, '#111', { weight: 'bold', align: 'center', spacing: 3 });
    tx(x, m, w / 2, 236, 12, '#555', { align: 'center' });
    age(x, w, h, r, 0.12);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Mesh builder: quads in room coordinates (one mesh per material), planar UVs in metres × s
  // ---------------------------------------------------------------------------------------------------------------
  const MB = () => ({ p: [], uv: [], i: [] });
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  function quad(g, a, b, c, d, s = 1, want = null) {
    const n = g.p.length / 3;
    g.p.push(...a, ...b, ...c, ...d);
    const lu = len3(sub3(b, a)) * s, lv = len3(sub3(d, a)) * s; g.uv.push(0, 0, lu, 0, lu, lv, 0, lv);
    let flip = false;
    if (want) { const nn = cross3(sub3(b, a), sub3(d, a)); flip = nn[0] * want[0] + nn[1] * want[1] + nn[2] * want[2] < 0; }
    if (flip) g.i.push(n, n + 2, n + 1, n, n + 3, n + 2); else g.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
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
    m.userData.ownedGeo = true;
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
  // a hanging wire / cable between two points, sagging
  function sagPts(a, b, sag = 0.4, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag, lerp(a[2], b[2], t)]); }
    return out;
  }
  function wire(K, pts, r = 0.012, color = '#1b1c1c', o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 3), r, 4, false), K.mat({ color, roughness: 0.7 }));
    m.castShadow = false; m.userData.ownedGeo = true;
    K.mesh(m, { static: true, world: o.world });
    return m;
  }
  // rods (cylinders between two points) merged into one mesh per material: lattice steel, rails, struts
  function Rods() {
    const items = [];
    const unit = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
    const _a = V3(), _b = V3(), _q = new THREE.Quaternion(), UPY = V3(0, 1, 0);
    return {
      add(a, b, r) {
        _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
        const len = Math.max(1e-3, _a.distanceTo(_b));
        _q.setFromUnitVectors(UPY, _b.clone().sub(_a).normalize());
        const m = new THREE.Matrix4().compose(_a.clone().add(_b).multiplyScalar(0.5), _q.clone(), V3(r, len, r));
        items.push({ geo: unit, m });
      },
      flush(K, spec, o = {}) {
        if (!items.length) return null;
        const geo = Kit.mergeGeometries(items);
        const m = new THREE.Mesh(geo, K.mat(spec));
        m.castShadow = !!o.cast; m.receiveShadow = true; m.userData.ownedGeo = true;
        K.mesh(m, { static: o.static !== false, name: o.name, world: o.world });
        items.length = 0;
        return m;
      },
      get n() { return items.length; },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The lattice mast (spec §7B: 60 m steel lattice). Legs flare from ±base at the ground to ±half at `flare` m, then
  // run straight to `top`; horizontals every 3 m; X-bracing on every face except where a ladder runs
  // (skip(face, y0, y1) → true). Faces: 'n' (−z), 'e' (+x), 's' (+z), 'w' (−x). One merged mesh.
  // ---------------------------------------------------------------------------------------------------------------
  function C8_lattice(K, o) {
    const cx = o.cx || 0, cz = o.cz || 0, B0 = o.base ?? 3.0, B1 = o.half ?? 1.5, FL = o.flare ?? 12, H = o.top ?? 56, y0 = o.y0 ?? 0;
    const hw = (y) => (y < FL ? lerp(B0, B1, y / FL) : B1);
    const R = Rods();
    const corner = (sx, sz, y) => [cx + sx * hw(y), y0 + y, cz + sz * hw(y)];
    const levels = []; for (let y = 0; y < H; y += 3) levels.push(y); levels.push(H);
    const faces = { n: [[-1, -1], [1, -1]], e: [[1, -1], [1, 1]], s: [[1, 1], [-1, 1]], w: [[-1, 1], [-1, -1]] };
    for (let i = 0; i < levels.length - 1; i++) {
      const ya = levels[i], yb = levels[i + 1];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.add(corner(sx, sz, ya), corner(sx, sz, yb), 0.075);
      for (const [f, [[ax, az], [bx, bz]]] of Object.entries(faces)) {
        R.add(corner(ax, az, yb), corner(bx, bz, yb), 0.03);
        if (o.skip && o.skip(f, ya, yb)) continue;
        R.add(corner(ax, az, ya), corner(bx, bz, yb), 0.028); R.add(corner(bx, bz, ya), corner(ax, az, yb), 0.028);
      }
      // plan bracing every 12 m (the square stays square)
      if (i % 4 === 3) { R.add(corner(-1, -1, yb), corner(1, 1, yb), 0.025); R.add(corner(1, -1, yb), corner(-1, 1, yb), 0.025); }
    }
    R.flush(K, { tex: 'metal', color: o.color || '#8a8f8a', roughness: 0.62, metalness: 0.35 }, { world: o.world, cast: false });
    // the feeder cables up the west face (black, thick)
    const cb = Rods();
    for (let i = 0; i < levels.length - 1; i++) { const ya = levels[i], yb = levels[i + 1]; for (const d of [0.25, 0.4]) cb.add([cx - hw(ya) - 0.08, y0 + ya, cz + d], [cx - hw(yb) - 0.08, y0 + yb, cz + d], 0.035); }
    cb.flush(K, { color: '#121414', roughness: 0.6 }, { world: o.world });
    // concrete footings
    if (o.footings !== false) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box(cx + sx * B0, y0 - 0.05, cz + sz * B0, 0.9, 0.35, 0.9, { tex: 'concrete', color: '#8a8b84' }, { collide: !!o.collide, world: o.world });
    return { hw };
  }
  // a far mast silhouette for the road and the compound (the lattice alone, no footings), with the red lights
  function C8_farMast(K, x, z, y0, H, o = {}) {
    // seen from far off through the fog: a thick-limbed silhouette that ignores the fog (a shape, not a model)
    const R = Rods(), hw = (y) => (y < 12 ? lerp(3.2, 1.7, y / 12) : 1.7), c = (sx, sz, y) => [x + sx * hw(y), y0 + y, z + sz * hw(y)];
    for (let y = 0; y < H; y += 6) {
      const yb = Math.min(H, y + 6);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.add(c(sx, sz, y), c(sx, sz, yb), 0.32);
      for (const [[ax, az], [bx, bz]] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]]]) { R.add(c(ax, az, yb), c(bx, bz, yb), 0.16); R.add(c(ax, az, y), c(bx, bz, yb), 0.12); R.add(c(bx, bz, y), c(ax, az, yb), 0.12); }
    }
    R.add([x + 2, y0 + H, z - 0.6], [x + 2, y0 + H + 7, z - 0.6], 0.14);
    const sil = new THREE.MeshBasicMaterial({ color: '#0d1716', transparent: true, opacity: 0.5, fog: false, depthWrite: false });
    const m = R.flush(K, { color: '#0d1716' }, { cast: false, name: 'c8:farmast' });
    if (m) { m.material = sil; m.renderOrder = -1; }
    // the head: the transmitter hut and antennas on top
    { const hb = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 6), sil); hb.position.set(x + 2, y0 + H + 1.4, z - 0.6); hb.renderOrder = -1; K.mesh(hb, { name: 'c8:farhut' }); }
    K.light('led', x + 2, y0 + H + 7.3, z - 0.6, { color: '#ff2a1c', size: 0.25, blink: 1.6, duty: 0.45, halo: o.halo ?? 14, haloOpacity: 0.9, intensity: 5 });
    for (const y of [20, 40]) K.light('led', x - 1.55, y0 + y, z + 1.55, { color: '#ff2a1c', size: 0.12, blink: 2.2, duty: 0.5, phase: y / 60, halo: 5, haloOpacity: 0.7, intensity: 4 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The town far below: faint lights on the dark hillside, shown through the fog (fog:false points). Clusters along
  // a few crooked streets between r0 and r1 metres from (cx, cz), y metres below.
  // ---------------------------------------------------------------------------------------------------------------
  function C8_townLights(K, o = {}) {
    const cx = o.cx || 0, cz = o.cz || 0, r = U.rng(o.seed || 81), n = o.n || 260;
    const pos = [], col = [];
    const streets = [];
    for (let k = 0; k < (o.streets || 14); k++) streets.push({ a: r() * Math.PI * 2, rr: lerp(o.r0 || 60, o.r1 || 150, r()), len: 20 + r() * 50, dir: r() * Math.PI });
    for (let i = 0; i < n; i++) {
      const s = streets[i % streets.length];
      const t = (r() - 0.5) * s.len;
      const bx = cx + Math.sin(s.a) * s.rr + Math.cos(s.dir) * t + (r() - 0.5) * 4, bz = cz + Math.cos(s.a) * s.rr + Math.sin(s.dir) * t + (r() - 0.5) * 4;
      const d = Math.hypot(bx - cx, bz - cz);
      pos.push(bx, (o.y ?? -60) - (d - (o.r0 || 60)) * (o.slope ?? 0.18) + (r() - 0.5) * 2, bz);
      const k = r();
      const c = k < 0.8 ? [1.0, 0.62 + r() * 0.12, 0.3] : k < 0.93 ? [0.9, 0.95, 1.0] : [0.35, 0.95, 0.9];
      const b = 0.55 + r() * 0.45; col.push(c[0] * b, c[1] * b, c[2] * b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: o.size || 3.2, sizeAttenuation: false, map: dotTex(), transparent: true, opacity: o.opacity ?? 0.55, depthWrite: false, fog: false, vertexColors: true, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'c8:town'; pts.frustumCulled = false; pts.userData.ownedGeo = true; pts.renderOrder = -1;
    K.mesh(pts, { name: o.name || undefined, world: o.world });
    return pts;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Environment helpers: outdoor Outage rooms get a faint sick-teal sky light (the preset is near-black) so Aidan's
  // shape and the road read; the fog density eases toward C8.fogTo (the summit thins as he climbs). Skipped while
  // the Outage transition cross-fades the environment.
  // ---------------------------------------------------------------------------------------------------------------
  // the Outage look of the three outdoor rooms (as Chapter 2's village: a lighter sick-teal fog that dark figures read
  // against, and a sky light that shows the road — dark, never invisible)
  const C8_OUTFOG = '#23504a', C8_OUTAMB = 1.0;
  function C8_ambient(fogK, outK) {
    const k = clamp(Tex.outage || 0, 0, 1), want = Math.round(lerp(fogK, outK, k) * 100) / 100;
    if (want === C8.amb) return;
    C8.amb = want;
    try { if (want > 0) Render.setAmbient(k > 0.5 ? '#1f6f6a' : '#8e9996', want); else Render.setAmbient(null); } catch (e) { /* render */ }
  }
  function C8_ambientOff() { C8.amb = -1; try { Render.setAmbient(null); } catch (e) { /* render */ } }
  function C8_fogStep(dt) {
    const f = Render.fog;
    if (!f || C8.fogTo === null || C8.fogTo === undefined) return;
    try { if (World.outageBusy) return; } catch (e) { /* world */ }
    f.density += (C8.fogTo - f.density) * Math.min(1, dt * 1.4);
  }
  // actor-relative framing helpers for close shots
  const headAt = (X) => {
    const r = X && (X.raw || X), a = r && (r.faceMount || (r.bones && r.bones.head));
    if (a) { a.updateWorldMatrix(true, false); const v = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld); if (!r.faceMount) v.y += 0.1; return v; }
    const p = r && r.root ? r.root.position : { x: 0, y: 0, z: 0 };
    return new THREE.Vector3(p.x, (p.y || 0) + 1.62, p.z);
  };
  const fwdOf = (X) => { const r = X && (X.raw || X), y = r && r.root ? r.root.rotation.y : 0; return [Math.sin(y), Math.cos(y)]; };
  // a point f metres in front of the head, l to its left (−: right), u up
  const rel = (X, f, l, u = 0, H = headAt(X)) => { const [fx, fz] = fwdOf(X); return [H.x + fx * f + fz * l, H.y + u, H.z + fz * f - fx * l]; };
  const P3 = (v) => [v.x, v.y, v.z];

  // =================================================================================================================
  // 8A — SUMMIT ROAD. x east, −z north. The chained gate from the hospital car park (bottom apron, x 36–44, z −4…12,
  // y 0); leg A (z −4…4) climbs west 0 → 4.5 m; hairpin H1 (x 0–8, flat 4.5); leg B (z −18…−10) climbs east to 9;
  // H2 (x 36–44, flat 9); leg C (z −32…−24) climbs west to 13.5; H3 (x 0–8, flat 13.5); leg D (z −46…−38) climbs east
  // to 16.5; the top apron (x 30–44, z −60…−38) runs north to the compound gate. Each leg: a 1.2 m gravel verge on its
  // uphill (north) side against a concrete retaining wall; a guardrail and the drop on its downhill side.
  // =================================================================================================================
  const SR = {
    yA: (x) => lerp(4.5, 0, clamp((x - 8) / 28, 0, 1)),
    yB: (x) => lerp(4.5, 9, clamp((x - 8) / 28, 0, 1)),
    yC: (x) => lerp(13.5, 9, clamp((x - 8) / 28, 0, 1)),
    yD: (x) => lerp(13.5, 16.5, clamp((x - 8) / 22, 0, 1)),
  };
  // the bank tops between the terraces (the height of the leg above), and the wall foot (the leg below)
  const topAB = (x) => (x <= 8 ? 4.5 : x >= 36 ? 9 : SR.yB(x));
  const lowAB = (x) => (x >= 36 ? 0 : SR.yA(Math.max(8, x)));
  const topBC = (x) => (x <= 8 ? 13.5 : x >= 36 ? 9 : SR.yC(x));
  const lowBC = (x) => (x <= 8 ? 4.5 : SR.yB(Math.min(36, x)));
  const topCD = (x) => (x >= 30 ? 16.5 : SR.yD(Math.max(8, x)));
  const lowCD = (x) => (x >= 36 ? 9 : SR.yC(Math.max(8, x)));
  // where the freed Tethered sit: the uphill verges, bottom to top (road order), facing the road
  const C8_SEATS = [
    [32, -3.35, 0], [26, -3.35, 0], [20, -3.35, 0], [14.6, -3.35, 0],
    [12, -17.35, 0], [18, -17.35, 0], [24, -17.35, 0], [30, -17.35, 0],
    [32, -31.35, 0], [26, -31.35, 0], [20, -31.35, 0], [14, -31.35, 0],
    [12, -45.35, 0], [18, -45.35, 0], [24, -45.35, 0],
    [30.7, -48, 90], [30.7, -52.5, 90], [30.7, -57, 90],
  ];
  // the hill's last rise north of leg D, west of the top apron
  const C8_hillY = (x, z) => (x <= 8 ? 13.5 : x >= 30 ? 16.5 : SR.yD(x)) - 0.05 + 6.5 * (1 - Math.exp(-Math.max(0, -46 - z) / 5)) * clamp((30 - x) / 5, 0, 1) + Math.sin(x * 0.7 + z * 0.4) * 0.25 * clamp((-46.5 - z) / 3, 0, 1);
  const seatY = (x, z) => (z > -8 ? SR.yA(x) : z > -22 ? SR.yB(x) : z > -36 ? SR.yC(x) : x >= 30 ? 16.5 : SR.yD(x));
  // which seats are occupied: every freed Tethered in order, spread evenly along the seats
  function C8_rowPlan() {
    const ids = (S.freedOrder || []).filter((id) => S.spawns && S.spawns[id] === 'freed');
    const out = [];
    const n = ids.length, m = C8_SEATS.length;
    ids.forEach((id, k) => {
      let si = n === 1 ? Math.floor(m / 3) : n <= m ? Math.round((k * (m - 1)) / (n - 1)) : k % m;
      const s = C8_SEATS[si], extra = n > m ? Math.floor(k / m) : 0;
      out.push({ id, x: s[0] + extra * 1.3, z: s[1], rot: s[2] });
    });
    return out;
  }
  function C8_freedRow() {
    const plan = C8_rowPlan();
    C8.row = [];
    for (const p of plan) {
      try {
        const e = Enemies.spawn({ id: p.id, type: 'tethered', pos: [p.x, p.z], rot: p.rot, sit: 'floor', world: 'both', voice: false });
        if (e) { C8.row.push(e); if (e.actor) e.actor.idleLife = false; }
      } catch (err) { console.error('[c8] freed row', err); }
    }
    return C8.row;
  }
  // they don't move. Their heads follow him while he's near.
  const C8_ROW_R = 21;
  // which stretch of road a point is on: leg A, B, C, D, the top apron
  const C8_band = (x, z) => (z > -8 ? 0 : z > -22 ? 1 : z > -36 ? 2 : x < 30 ? 3 : 4);
  function C8_rowLook(dt) {
    if (!C8.row || !Player.pos) return;
    C8.lookT = (C8.lookT || 0) - dt;
    if (C8.lookT > 0) return;
    C8.lookT = 0.4;
    const band = C8_band(Player.pos.x, Player.pos.z);
    for (const e of C8.row) {
      if (!e || e.removed || !e.actor) continue;
      const d = Math.hypot(e.pos.x - Player.pos.x, e.pos.z - Player.pos.z), d3 = Math.hypot(d, e.pos.y - Player.pos.y);
      try { e.actor.lookAt(d < 9 ? Player.actor : null); } catch (err) { /* rig */ }
      // no occlusion culling: only the ones on his own stretch of road are drawn (the fog hides the rest anyway)
      const show = d3 < 8 || (C8_band(e.pos.x, e.pos.z) === band && d3 < C8_ROW_R);
      if (!!e.hidden === show) try { Enemies.visible(e, show); } catch (err) { /* enemies */ }
    }
    for (const e of Enemies.list) {
      if (!e || e.removed || e.resolved || C8.row.includes(e) || !/^c8_summit:/.test(e.id)) continue;
      const d3 = Math.hypot(e.pos.x - Player.pos.x, e.pos.z - Player.pos.z, e.pos.y - Player.pos.y);
      const show = d3 < 11 || (C8_band(e.pos.x, e.pos.z) === band && d3 < 21);
      if (!!e.hidden === show) try { Enemies.visible(e, show); } catch (err) { /* enemies */ }
    }
  }
  // a guardrail from a to b ([x,y,z]) following the slope; the road side is on the right walking a → b
  function railSeg(K, a, b, o = {}) {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
    if (L < 0.2) return null;
    const yaw = Math.atan2(-dz, dx) / D2R, tilt = Math.atan2(b[1] - a[1], L);
    const g = K.prop('guardrail', (a[0] + b[0]) / 2, (a[2] + b[2]) / 2, yaw, { len: L + 0.12, y: (a[1] + b[1]) / 2, collide: false, variant: o.variant });
    if (g) { g.rotation.order = 'YXZ'; g.rotation.set(0, yaw * D2R, tilt); }
    return g;
  }
  function railRun(K, pts, o = {}) { for (let i = 0; i + 1 < pts.length; i++) railSeg(K, pts[i], pts[i + 1], o); }
  // a run along x at z on the surface yf(x), the road side toward −z (north) when roadNorth
  function railX(K, x0, x1, z, yf, roadNorth, o = {}) {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 4)), pts = [];
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); pts.push([x, yf(x) + 0.02, z]); }
    // walking west (−x) the right-hand side is north
    if (roadNorth === x1 < x0) railRun(K, pts, o); else railRun(K, pts.reverse(), o);
  }
  function railZ(K, z0, z1, x, y, roadEast, o = {}) {
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 4)), pts = [];
    for (let i = 0; i <= n; i++) pts.push([x, y + 0.02, lerp(z0, z1, i / n)]);
    // walking north (−z) the right-hand side is east
    if (roadEast === z1 < z0) railRun(K, pts, o); else railRun(K, pts.reverse(), o);
  }
  // a power pole with its red Outage beacon
  function C8_pole(K, x, z, y, o = {}) {
    K.prop('power_pole', x, z, o.rot ?? 90, { y, h: 9.5, span: 0, variant: o.variant });
    K.outageOnly(() => K.light('led', x, y + 9.35, z + 0.05, { color: '#ff2a1c', size: 0.05, blink: 1.9, duty: 0.4, phase: (x * 0.13) % 1, halo: 1.6, haloOpacity: 0.7, intensity: 4 }));
    return [x, y + 9.1, z];
  }
  // the hairpin chevrons (both worlds)
  function C8_chevron(K, x, y, z, rot, dir) {
    K.cyl(x - 0.7, y, z, 0.035, 1.6, { tex: 'metal', color: '#9aa09a' }, { rot });
    K.cyl(x + 0.7, y, z, 0.035, 1.6, { tex: 'metal', color: '#9aa09a' }, { rot });
    K.plane(x, y + 1.25, z, 1.8, 0.9, chevronTex(dir), { rotY: rot });
  }

  defineRoom({
    id: 'c8_summit', name: 'SUMMIT ROAD', area: 'SUMMIT ROAD', chapter: 8, outdoor: true, surface: 'bitumen', ambient: 'wind_heavy',
    fog: { density: 0.062 }, outageFog: { density: 0.05, color: C8_OUTFOG },
    // the fog thins as he climbs (onUpdate eases toward this); Cam.check reads the same rule
    fogAt: (x, y, z, out) => { const k = clamp((12 - z) / 72, 0, 1); return out ? lerp(0.05, 0.024, k) : lerp(0.066, 0.04, k); },
    surfaces: [{ box: [8, -4, 36, -2.8], s: 'gravel' }, { box: [8, -18, 36, -16.8], s: 'gravel' }, { box: [8, -32, 36, -30.8], s: 'gravel' }, { box: [8, -46, 30, -44.8], s: 'gravel' }],
    bounds: [-1, -60.5, 45, 12.5],
    entries: { bottom: [40, 10.4, 180], top: [37, -57.6, 0], start: [40, 10.4, 180] },
    cameras: [
      // the chained gate: an empty shot of the apron and the work car before he walks in; the road bending away west
      { id: 'c8_summit:gate', vol: [36, -4, 44.2, 12.3], type: 'pan', pos: [38.4, 3.4, 17.4], target: [40.6, 0.9, 1.8], fov: 50, pan: { lag: 0.3, yaw: 30, pitch: 20 } },
      // leg A from out over the drop: the retaining wall behind him, the ones who sit along its foot
      { id: 'c8_summit:a', vol: [8, -4, 36.3, 4.3], type: 'rail', pos: [22, 5, 8.4], fov: 52, rail: { a: [8, SR.yA(8) + 2.5, 8.4], b: [36, 2.5, 8.4], look: [0, 0.8, 0], lag: 0.35 } },
      // H1 from out over the west drop behind him: the turn, leg B climbing away past the wall
      { id: 'c8_summit:h1', vol: [-0.2, -18, 8.3, 4.3], type: 'pan', pos: [-3.6, 9.6, 6.2], target: [5.2, 4.9, -9.5], fov: 52, pan: { lag: 0.3, yaw: 55, pitch: 30 } },
      // leg B from the bank below it (over leg A), low along the verge and the seated figures
      { id: 'c8_summit:b', vol: [7.7, -18, 36.3, -9.7], type: 'rail', pos: [22, 8.5, -6.2], fov: 50, rail: { a: [7.7, topAB(8) + 1.7, -6.2], b: [36.3, 9 + 1.7, -6.2], look: [0, 0.9, 0], lag: 0.35 } },
      // H2 from out over the east drop behind him: the turn, the lookout bench, leg C climbing away
      { id: 'c8_summit:h2', vol: [35.7, -32, 44.2, -9.7], type: 'pan', pos: [46.4, 12.2, -10.2], target: [39.2, 9.9, -24.5], fov: 52, pan: { lag: 0.3, yaw: 55, pitch: 30 } },
      // leg C from the bank below it
      { id: 'c8_summit:c', vol: [7.7, -32, 36.3, -23.7], type: 'rail', pos: [22, 13, -20.2], fov: 50, rail: { a: [7.7, topBC(8) + 1.7, -20.2], b: [36.3, 9 + 1.7, -20.2], look: [0, 0.9, 0], lag: 0.35 } },
      // H3 from out over the west drop behind him, the same turn again, higher
      { id: 'c8_summit:h3', vol: [-0.2, -46, 8.3, -23.7], type: 'pan', pos: [-3.6, 18.6, -21.8], target: [5.2, 13.9, -37.5], fov: 52, pan: { lag: 0.3, yaw: 55, pitch: 30 } },
      // leg D from the bank below it, the top of the hill thinning ahead
      { id: 'c8_summit:d', vol: [7.7, -46, 30.3, -37.7], type: 'rail', pos: [19, 17, -34.2], fov: 50, rail: { a: [7.7, topCD(8) + 1.8, -34.2], b: [30.3, 16.5 + 1.8, -34.2], look: [0, 0.9, 0], lag: 0.35 } },
      // the top: low from the drop's edge, up the apron at the compound fence, the mast's red light through the fog
      { id: 'c8_summit:top', vol: [29.7, -60.2, 44.2, -37.7], type: 'pan', pos: [40.4, 19.2, -34.4], target: [38.4, 30.5, -95], fov: 52, pan: { lag: 0.3, yaw: 40, pitch: 26 } },
    ],
    spawns: [
      { id: 'c8_summit:teth1', type: 'tethered', pos: [22.4, 3.0], rot: 10, anchor: [22.4, 3.2], world: 'outage', cardigan: '#5f6a74' },
      { id: 'c8_summit:teth2', type: 'tethered', pos: [25, -24.9], rot: 350, anchor: [25, -24.7], world: 'outage' },
      { id: 'c8_summit:teth3', type: 'tethered', pos: [19.5, -38.9], rot: 15, anchor: [19.5, -38.7], world: 'outage', cardigan: '#7b5e4a' },
      { id: 'c8_summit:reach1', type: 'reach', pos: [23.5, -13.2], rot: 95, world: 'outage' },
      { id: 'c8_summit:reach2', type: 'reach', pos: [3.4, -36.2], rot: 190, world: 'outage' },
    ],
    build(K) {
      const bags = Bags();
      // ---- walkable: the bottom apron, the four legs (+ verges), the hairpins, the top apron ----------------------
      K.floor(36, -4, 44, 12, 'bitumen', { skirt: false });
      K.road(8, -2.8, 36, 4, { axis: 'x', slope: { y0: 4.5, y1: 0 }, kerb: false, footpath: [1.2, 0], pathMat: 'gravel', markings: 'center', caps: false });
      K.floor(0, -18, 8, 4, 'bitumen', { y: 4.5, skirt: false });
      K.road(8, -16.8, 36, -10, { axis: 'x', slope: { y0: 4.5, y1: 9 }, kerb: false, footpath: [1.2, 0], pathMat: 'gravel', markings: 'center', caps: false });
      K.floor(36, -32, 44, -10, 'bitumen', { y: 9, skirt: false });
      K.road(8, -30.8, 36, -24, { axis: 'x', slope: { y0: 13.5, y1: 9 }, kerb: false, footpath: [1.2, 0], pathMat: 'gravel', markings: 'center', caps: false });
      K.floor(0, -46, 8, -24, 'bitumen', { y: 13.5, skirt: false });
      K.road(8, -44.8, 30, -38, { axis: 'x', slope: { y0: 13.5, y1: 16.5 }, kerb: false, footpath: [1.2, 0], pathMat: 'gravel', markings: 'center', caps: false });
      K.floor(30, -60, 44, -38, 'bitumen', { y: 16.5, skirt: false });
      // ---- exits ------------------------------------------------------------------------------------------------------
      K.exit({ id: 'c8_summit:bottom', box: [36.2, 11.5, 43.8, 12.3], to: 'c7_carpark', entry: 'summit', when: () => !!ROOMS.c7_carpark, blockedMsg: 'The car park\'s gone. Just fog down there.' });
      K.exit({ id: 'c8_summit:top', box: [30.2, -60.3, 43.8, -59.5], to: 'c8_compound', entry: 'gate', sound: 'steps' });

      // ---- retaining walls, bank tops, the drops --------------------------------------------------------------------
      const wallM = { tex: 'concrete', color: '#8e8a7e' }, vgM = { tex: 'grass', color: '#5f6a55' }, capM = { tex: 'concrete', color: '#a8a293' }, dirtM = { tex: 'dirt', color: '#7a6c58' };
      const wa = bags.g('wall', wallM), vg = bags.g('verge', vgM), cp = bags.g('cap', capM), dt = bags.g('dirt', dirtM);
      const terrace = (z, zBack, x0, x1, low, top) => {
        for (let x = x0; x < x1 - 1e-6; x += 2) {
          const xa = x, xb = Math.min(x1, x + 2);
          if (top(xa) - low(xa) > 0.05 || top(xb) - low(xb) > 0.05) quad(wa, [xa, low(xa) - 0.15, z + 0.02], [xb, low(xb) - 0.15, z + 0.02], [xb, top(xb), z + 0.02], [xa, top(xa), z + 0.02], 0.5, [0, 0, 1]);
          quad(vg, [xa, top(xa), z], [xb, top(xb), z], [xb, top(xb), zBack], [xa, top(xa), zBack], 0.5, [0, 1, 0]);
          if (top(xa) - low(xa) > 0.4) quad(cp, [xa, top(xa) + 0.14, z + 0.1], [xb, top(xb) + 0.14, z + 0.1], [xb, top(xb) + 0.14, z - 0.25], [xa, top(xa) + 0.14, z - 0.25], 1, [0, 1, 0]);
        }
      };
      terrace(-4, -10, 8, 44, lowAB, topAB);
      terrace(-18, -24, 0, 36, lowBC, topBC);
      terrace(-32, -38, 8, 44, lowCD, topCD);
      // the hill's last rise north of leg D and west of the top apron: one height field, flat at the road and apron edges
      {
        const hy = C8_hillY;
        for (let x = -2; x < 30; x += 2) for (let z = -46; z > -72; z -= 2) {
          const v = (xx, zz) => [xx, hy(xx, zz), zz];
          const steep = hy(x, z - 2) - hy(x, z) > 1.1;
          quad(steep ? dt : vg, v(x, z), v(x + 2, z), v(x + 2, z - 2), v(x, z - 2), steep ? 0.5 : 0.4, [0, 1, 0]);
        }
      }
      // the drops: the hillside falling away below the road into the fog
      for (let x = 0; x < 44; x += 2) { const ya = x <= 8 ? 4.5 : SR.yA(x), yb = x + 2 <= 8 ? 4.5 : SR.yA(x + 2); quad(dt, [x, ya - 0.02, 4.05], [x + 2, yb - 0.02, 4.05], [x + 2, yb - 5, 11], [x, ya - 5, 11], 0.5, [0, 1, 0.5]); quad(vg, [x, ya - 5, 11], [x + 2, yb - 5, 11], [x + 2, yb - 12, 26], [x, ya - 12, 26], 0.35, [0, 1, 0]); }
      for (const [z0, z1, y] of [[-18, 4, 4.5], [-46, -24, 13.5]]) { quad(dt, [-0.05, y - 0.02, z1], [-0.05, y - 0.02, z0], [-7, y - 6, z0], [-7, y - 6, z1], 0.5, [-1, 1, 0]); quad(vg, [-7, y - 6, z1], [-7, y - 6, z0], [-20, y - 14, z0], [-20, y - 14, z1], 0.35, [-1, 1, 0]); }
      quad(dt, [44.05, 8.98, -32], [44.05, 8.98, -10], [51, 2, -10], [51, 2, -32], 0.5, [1, 1, 0]);
      quad(dt, [44.05, -0.02, -4], [44.05, -0.02, 12], [51, -6, 12], [51, -6, -4], 0.5, [1, 1, 0]);
      quad(dt, [44.05, 16.48, -60], [44.05, 16.48, -38], [51, 10, -38], [51, 10, -60], 0.5, [1, 1, 0]);
      bags.flush(K);
      // below the hill, the town's lights through the fog
      C8_townLights(K, { cx: 22, cz: -20, y: -38, r0: 55, r1: 150, n: 240, seed: 811, opacity: 0.5, slope: 0.12 });

      // ---- guardrails over the drops, the edge blockers ----------------------------------------------------------
      railX(K, 8, 36, 4.1, (x) => SR.yA(x), true, {});
      railX(K, 8, 36, -9.9, (x) => SR.yB(x), true, {});
      railX(K, 8, 36, -23.9, (x) => SR.yC(x), true, {});
      railX(K, 8, 30, -37.9, (x) => SR.yD(x), true, {});
      railX(K, 30, 44, -37.9, () => 16.5, true, {});
      railX(K, 36, 44, -9.9, () => 9, true, { variant: 'rusty' });
      railX(K, 0, 8, 4.1, () => 4.5, true, {});
      railZ(K, -18, 4, -0.1, 4.5, true, {});
      railZ(K, -46, -24, -0.1, 13.5, true, {});
      railZ(K, -32, -10, 44.1, 9, false, {});
      railZ(K, -4, 11, 44.1, 0, false, { variant: 'rusty' });
      railZ(K, -60, -38, 44.1, 16.5, false, {});
      const drop = 'It drops away into the fog.';
      K.blocker(8, 4.0, 36, 4.5, drop, { y: -0.2 }); K.blocker(0, 4.0, 8, 4.5, drop, { y: 4.3 });
      K.blocker(8, -10, 36, -9.6, 'Straight down to the road below.', { y: 4.3 });
      K.blocker(8, -24, 36, -23.6, 'Straight down to the road below.', { y: 8.8 });
      K.blocker(8, -38, 44, -37.6, 'Straight down to the road below.', { y: 13.3 });
      K.blocker(36, -10, 44, -9.6, 'Straight down to the road below.', { y: 8.8 });
      K.blocker(-0.5, -18, -0.1, 4, drop, { y: 4.3 }); K.blocker(-0.5, -46, -0.1, -24, drop, { y: 13.3 });
      K.blocker(44.1, -32, 44.5, -10, drop, { y: 8.8 }); K.blocker(44.1, -4, 44.5, 11.5, drop, { y: -0.2 }); K.blocker(44.1, -60, 44.5, -38, drop, { y: 16.3 });

      // ---- the chained gate from the hospital car park: open, the chain on the ground --------------------------------
      const gm = { tex: 'metal', color: '#5d625e', roughness: 0.6 };
      for (const px of [36.25, 43.75]) { K.box(px, -0.05, 12.1, 0.16, 1.6, 0.16, gm, { collide: true }); K.sphere(px, 1.62, 12.1, 0.09, gm); }
      for (const [hx, dir] of [[36.4, 1], [43.6, -1]]) {
        // the leaves swung back against the fence line, pointing south
        for (let k = 0; k <= 7; k++) K.box(hx, 0.1, 12.2 + k * 0.5, 0.035, 1.25, 0.035, gm);
        K.box(hx, 0.12, 13.95, 0.05, 0.05, 3.6, gm); K.box(hx, 1.3, 13.95, 0.05, 0.05, 3.6, gm);
        for (let k = 0; k < 6; k++) K.box(hx, 0.2 + k * 0.2, 13.95, 0.02, 0.02, 3.6, gm, { shadow: false });
        void dir;
      }
      // the chain in a heap, the padlock still shut on it
      for (let k = 0; k < 9; k++) K.cyl(39.4 + Math.sin(k * 1.7) * 0.28, 0.02, 11.6 + Math.cos(k * 1.3) * 0.22, 0.03, 0.02, { tex: 'metal', color: '#6f6f68' }, { rz: 90, rot: k * 40 });
      K.box(39.8, 0.0, 11.55, 0.07, 0.09, 0.03, { tex: 'metal', color: '#b0973e' });
      K.prop('sign_post', 36.9, 11.3, 0, { style: 'council', text: 'SUMMIT RD\nMAST ACCESS ONLY\nNO THROUGH ROAD', w: 0.8, h: 0.6, post: 2.2 });
      K.examine(39.6, 0.4, 11.3, ['The chain\'s on the ground. The padlock\'s still locked.', 'Somebody cut the chain instead. [beat] Or it just let go.'], { id: 'c8su:chain', r: 1.4 });
      K.examine(36.9, 1.6, 11.0, ['"Summit Road. Mast access only. No through road."', 'No through road. [beat] It only goes up.'], { id: 'c8su:sign', r: 1.3 });

      // ---- the telco work car on the apron (the tech who couldn't get up the hill) ---------------------------------------
      K.prop('car', 41.6, 2.2, 180, { color: '#e3e1da', variant: 'wagon', plate: 'TEL 4401', hazards: true, name: 'c8su:car' });
      K.box(41.6, 0.9, 3.9, 1.3, 0.02, 0.9, { color: '#e8b810', roughness: 0.6 }, { shadow: false });
      // the dome light left on inside (the battery's nearly gone), and the car park's last lamp by the gate
      K.light('point', 41.6, 1.45, 2.3, { color: '#ffd49a', intensity: 2.2, distance: 5.5, flicker: true });
      K.prop('streetlight', 44.6, 8.2, -90, { y: 0, world: 'fog' });
      K.prop('streetlight', 44.6, 8.2, -90, { y: 0, lit: false, light: false, world: 'outage' });
      K.plane(41.3, 0.955, 3.95, 0.22, 0.3, workSheetTex(), { rot: [-90, 12, 0] });
      K.cyl(42.1, 1.47, 1.6, 0.045, 0.28, { color: '#2f5f8a', roughness: 0.4, metalness: 0.4 });
      K.box(40.72, 0.95, 2.5, 0.05, 0.6, 0.5, { color: '#d8e04a', roughness: 0.8 }, { rot: 8 });
      K.pickup('coffee', 42.05, 0.95, 4.05, { id: 'c8_summit:coffee', extraOnEasy: true, rot: 40 });
      K.examine(41.4, 1.1, 4.4, async (G) => {
        await G.think('A work order on the dash. "Site 4401, Signal Hill Mast. Fault: no service."');
        await G.think('Priority: tomorrow. [beat] "Couldn\'t get up the hill. Will try again tmrw."');
      }, { id: 'c8su:sheet', r: 1.2 });
      K.examine(40.5, 1.2, 1.8, ['A telco car. The hazards are still going.', 'Hi-vis on the mirror, a thermos on the roof. He\'s coming back for it. [beat] Tomorrow.'], { id: 'c8su:car', r: 1.9 });

      // ---- the telephone pillar on leg A's verge (Outage: the receipt map spilling out of it) --------------------------
      const pX = 11.2, pY = SR.yA(11.2);
      K.box(pX, pY, -3.45, 0.62, 1.12, 0.42, { tex: 'metal', color: '#3f5e45', roughness: 0.6 }, { collide: true });
      K.box(pX, pY + 1.12, -3.45, 0.68, 0.06, 0.48, { tex: 'metal', color: '#36503b' });
      K.plane(pX, pY + 0.8, -3.235, 0.3, 0.12, Tex.sign('PILLAR 4401', { style: 'council', w: 0.3, h: 0.12 }), {});
      K.outageOnly(() => {
        K.prop('receipt_strip', pX + 0.1, -3.2, 20, { ceil: pY + 1.05, len: 0.95 });
        K.dress('receipts', [pX - 1.4, -3.9, pX + 1.8, -1.2], 16, { seed: 8101 });
        K.light('led', pX + 0.25, pY + 1.0, -3.22, { color: '#ff2a1c', blink: 0.9, size: 0.012 });
      });
      K.pickup('rmap_mast', pX + 0.55, pY + 0.03, -2.85, { id: 'c8_summit:rmap', world: 'outage', glint: true, rot: 70, r: 1.3 });
      K.examine(pX, pY + 1.0, -3.0, async (G) => {
        if (S.outage) await G.think('It\'s printing. [beat] A telephone pillar, printing receipts into the gravel.');
        else await G.think('A telephone pillar. Every line up this hill goes through a box like this.');
      }, { id: 'c8su:pillar', r: 1.2 });

      // ---- power poles on the bank tops, the lines running up the hill ---------------------------------------------------
      const poles = [
        C8_pole(K, 34, -4.8, topAB(34)), C8_pole(K, 20, -4.8, topAB(20)), C8_pole(K, 0.7, -17.3, 4.5),
        C8_pole(K, 10, -18.8, topBC(10)), C8_pole(K, 24, -18.8, topBC(24)), C8_pole(K, 43.3, -31.3, 9),
        C8_pole(K, 32, -32.8, topCD(32)), C8_pole(K, 18, -32.8, topCD(18)), C8_pole(K, 0.7, -45.3, 13.5),
        C8_pole(K, 42.8, -56, 16.5),
      ];
      for (let i = 0; i + 1 < poles.length; i++) { const a = poles[i], b = poles[i + 1]; for (const dz of [-1.0, 0.4, 1.0]) wire(K, sagPts([a[0], a[1], a[2] + dz], [b[0], b[1], b[2] + dz], 0.7)); }
      // Outage: tethers hanging off the lines like vines, receipt paper caught on them
      K.outageOnly(() => {
        for (let i = 0; i + 1 < poles.length; i++) {
          const a = poles[i], b = poles[i + 1];
          for (const t of [0.4, 0.72]) {
            const x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t) + 0.4, y = lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 0.7;
            if ((i + t * 10) % 3 < 1.6) K.prop('tether_hanging', x, z, t * 90, { ceil: y, len: 1.6 + (t * 7 % 1.2) });
            else K.prop('receipt_strip', x, z, t * 90, { ceil: y, len: 1.2 + (t * 5 % 1.4) });
          }
        }
      });
      K.examine(20, topAB(20) + 1.2, -4.4, ['Power lines, running up the hill into the fog.', 'Up there, somewhere, they end at the mast.'], { id: 'c8su:lines', r: 1.6 });

      // ---- sodium lamps at the hairpins (Fog world); dead heads in the Outage; red pools in the Outage ------------------
      for (const [x, z, y, rot, bank] of [[0.6, -7.2, 4.5, 90, 1], [43.4, -21, 9, -90, 2], [0.6, -35.2, 13.5, 90, 3], [43.4, -48.5, 16.5, -90, 4]]) {
        K.prop('streetlight', x, z, rot, { y, bank, world: 'fog' });
        K.prop('streetlight', x, z, rot, { y, lit: false, light: false, world: 'outage' });
      }
      // the Outage's own light: work tubes somebody strapped to the retaining walls, flickering
      K.outageOnly(() => {
        for (const [x, y, z, rot] of [[40.5, 3.2, -3.84, 0], [24, SR.yA(24) + 3.0, -3.84, 0], [17, SR.yB(17) + 3.0, -17.84, 0], [27, SR.yC(27) + 3.0, -31.84, 0], [19, SR.yD(19) + 2.8, -45.9, 0], [0.7, 7.4, -7.2, 90], [43.3, 11.9, -21.4, 90], [0.7, 16.4, -35.2, 90], [37.5, 19.4, -59.2, 0], [30.3, 19.4, -49.5, 90]]) {
          K.light('fluoro', x, y, z, { color: '#cfe6df', intensity: 8, distance: 11, flicker: true, len: 1.2, rot });
          K.box(x, y - 0.02, z + (rot ? 0 : -0.05), rot ? 0.06 : 1.3, 0.04, rot ? 1.3 : 0.06, { tex: 'metal', color: '#5a5f5c' }, { rot: 0, shadow: false });
          if (rot) { K.cyl(x - 0.12, y - 3.1, z, 0.045, 3.1, { tex: 'metal', color: '#6a6f6b' }); K.box(x - 0.06, y - 0.08, z, 0.12, 0.05, 0.05, { tex: 'metal', color: '#6a6f6b' }); }
        }
      });
      K.outageOnly(() => {
        K.light('point', 4.2, 6.8, -9, { color: '#ff3b2a', intensity: 2.4, distance: 9 });
        K.light('point', 40, 11.4, -21.5, { color: '#ff3b2a', intensity: 2.2, distance: 9 });
        K.light('point', 4.2, 15.8, -36, { color: '#ff3b2a', intensity: 2.2, distance: 9 });
        K.light('point', 37, 19.2, -50, { color: '#ff3b2a', intensity: 2.0, distance: 10 });
        // phones glowing face-up in the gravel (their screens light nothing but themselves)
        for (const [x, z] of [[27.5, -2.4], [15.5, -16.2], [30.2, -30.4], [21.6, -44.3], [4.5, -2.6]]) {
          const y = seatY(x, z);
          K.box(x, y + 0.005, z, 0.075, 0.012, 0.15, { color: '#101213', roughness: 0.3 }, { rot: x * 17 });
          K.box(x, y + 0.018, z, 0.064, 0.002, 0.13, { color: '#6fe0d6', emissive: '#6fe0d6', emissiveIntensity: 1.3, outage: false }, { rot: x * 17, shadow: false });
        }
      });

      // ---- the hairpins: chevron boards, the lookout bench on H2 (sticker11 under the seat), the mirror on H1 -----------
      C8_chevron(K, 1.2, 4.5, -3.4, 90, -1);
      C8_chevron(K, 42.8, 9, -17, -90, 1);
      C8_chevron(K, 1.2, 13.5, -31.4, 90, -1);
      K.examine(1.4, 5.6, -3.4, 'The chevrons point back the way I came. [beat] The road folds, and folds again.', { id: 'c8su:chev', r: 1.6 });
      K.prop('bench', 42.9, -26.5, -90, { y: 9, len: 1.6 });
      K.sticker('sticker11', 42.84, 9.4, -26.5, -90, { pitch: -90, size: 0.06 });
      K.pickup('energy_drink', 42.7, 9.47, -27.0, { id: 'c8_summit:energy', extraOnEasy: true, rot: 20 });
      K.examine(42.4, 9.7, -26.5, ['A bench facing out over nothing. Somebody used to come up here for the view.', 'The whole town\'s down there somewhere. [beat] I can see a few lights.'], { id: 'c8su:bench', r: 1.5 });
      K.prop('sign_post', 7.2, -11.3, 0, { style: 'warning', text: 'SLOW\nHAIRPIN', w: 0.6, h: 0.6, y: 4.5 });
      K.prop('sign_post', 36.8, -29.2, 180, { style: 'warning', text: 'STEEP\nGRADE', w: 0.6, h: 0.6, y: 9 });
      K.prop('road_sign', 34, -58.8, 180, { text: 'SIGNAL HILL\nRADIO TERMINAL', sub: 'NO PUBLIC ACCESS', w: 1.8, h: 0.7, y: 16.5 });
      K.examine(34, 18, -58.3, ['"Signal Hill Radio Terminal." [beat] "No public access."', 'I\'m not the public. I work for the phone company. [beat] That\'s the joke.'], { id: 'c8su:terminal', r: 1.6 });
      // gum trees on the banks (along the wall tops, behind the rail cameras), their tops in the fog; dead shrubs
      for (const [x, z, y, h] of [[28, -4.9, topAB(28), 12], [14, -4.9, topAB(14), 10], [30, -18.9, topBC(30), 11], [16, -18.9, topBC(16), 12], [26, -32.9, topCD(26), 9], [12, -32.9, topCD(12), 11], [3, -50, C8_hillY(3, -50) - 0.1, 10], [10, -60, C8_hillY(10, -60) - 0.1, 12], [25.5, -62, C8_hillY(25.5, -62) - 0.1, 10]]) K.prop('gum_tree', x, z, (x * 41) % 360, { y, h });
      for (const [x, z, y] of [[22, -7.2, topAB(22)], [9, -21.2, topBC(9)], [34, -35.4, topCD(34)], [40, -44, 16.5]]) K.prop('shrub', x, z, 0, { y, w: 1.4, h: 1.0, collide: false, dead: true });
      K.dress('leaves', [9, -2.8, 35, 3.5], 18, { seed: 8102 }); K.dress('leaves', [9, -16.8, 35, -10.5], 18, { seed: 8103 });
      K.dress('leaves', [9, -30.8, 35, -24.5], 16, { seed: 8104 }); K.dress('leaves', [31, -58, 43, -40], 16, { seed: 8105 });

      // ---- writing on the retaining walls (faded marker in the Fog world, thick black marker in the Outage) ------------
      K.writing('WHO ARE YOU TRYING TO REACH', 40, 3.3, -3.96, 3.4, { rotY: 0 });
      K.writing('FOLLOW UP TOMORROW', 15, SR.yB(15) + 2.6, -17.96, 3.0, { rotY: 0 });
      K.writing("IT'LL BE FINE", 24, SR.yC(24) + 2.0, -31.96, 2.4, { rotY: 0 });
      K.writing('DID YOU CHECK', 33, SR.yA(33) + 2.2, -3.96, 2.2, { rotY: 0, style: 'receipt' });
      K.writing('ASK THEM', 14, SR.yD(14) + 1.6, -46.2, 1.6, { rotY: 0 });
      K.examine(40, 1.6, -3.4, async (G) => {
        if (S.outage) await G.think('"Who are you trying to reach." [beat] In letters taller than me.');
        else await G.think('Something\'s been written on the wall and scrubbed off. You can still read it. [beat] "Who are you trying to reach."');
      }, { id: 'c8su:wall1', r: 2.2 });
      K.examine(15, SR.yB(15) + 1.3, -17.4, ['"Follow up tomorrow." [beat] Up here too.', 'It\'s my handwriting. I know it is.'], { id: 'c8su:wall2', r: 1.8 });
      K.examine(24, SR.yC(24) + 1.3, -31.4, '"It\'ll be fine." [beat] It was never fine. I just said it.', { id: 'c8su:wall3', r: 1.8 });

      // ---- Outage dressing: contracts drifted against the walls, receipts in the gravel -------------------------------
      K.outageOnly(() => {
        for (const [x, z] of [[30.5, -3.5], [17, -17.5], [28.5, -31.5], [16.5, -45.5], [38, -44]]) for (let i = 0; i < 3; i++) K.prop('contract_stack', x + i * 0.45, z + (i % 2) * 0.2, x * 20 + i * 33, { h: 0.5 + (i % 3) * 0.3, y: seatY(x + i * 0.45, z) });
        K.dress('contracts', [9, -3.9, 35, -2.9], 10, { seed: 8111 });
        K.dress('receipts', [9, -16.8, 35, -10.4], 22, { seed: 8112 });
        K.dress('receipts', [9, -30.8, 35, -24.4], 22, { seed: 8113 });
        K.dress('contracts', [31, -58, 43, -41], 12, { seed: 8114 });
      });
      K.examine(35, 0.8, 3.6, ['Over the rail there\'s just the hill, going down into white.', 'Somewhere down there is the hospital. [beat] She\'s awake, Luka said.'], { id: 'c8su:drop', r: 1.6 });

      // ---- the mast, far up the hill: its lattice in the fog, the red light blinking ------------------------------------
      C8_farMast(K, 38, -118, 16, 40, { halo: 22 });
      // the compound fence where the road ends (the gate is in the next room)
      K.prop('chainlink', 37, -60.6, 0, { len: 18, h: 2.4 });
      for (const x of [31, 43]) K.prop('rf_sign', x, -60.55, 0, { variant: 'fence', mount: 1.5 });

      // ---- triggers: the first sight of the ones sitting by the road (or nobody); the ringing in the fog -----------------
      K.trigger([12, -4, 30, 4], async (G) => {
        if (!S.outage) return;
        if (C8.row && C8.row.length) { await G.wait(0.6); await G.think('People sitting by the road. [beat] The ones I cut loose.'); }
      }, { id: 'c8_summit:row', when: () => !!S.outage && !!(C8.row && C8.row.length) });
      K.trigger([12, -18, 30, -10], async (G) => {
        if (!S.outage || (C8.row && C8.row.length)) return;
        await G.wait(0.4);
        await G.think('Nobody. [beat] There\'s nobody up here.');
      }, { id: 'c8_summit:empty', when: () => !!S.outage && !(C8.row && C8.row.length) });
      K.trigger([30, -60, 44, -46], async (G) => { await G.think('The fog\'s thinner up here. [beat] I can see it now.'); }, { id: 'c8_summit:see' });
      // examine lines for the occupied seats
      const lines = [
        ['Sitting in the gravel, watching me go past.', 'It doesn\'t want anything from me. Not any more.'],
        ['The plastic\'s gone from its face. It just looks tired.', 'I cut it loose. [beat] It waited up here.'],
        ['Its hands are folded in its lap. Like it\'s waiting for a bus.', 'It turns its head when I move. That\'s all.'],
        ['Still here. [beat] Still watching.'],
      ];
      C8_rowPlan().forEach((p, i) => K.examine(p.x, seatY(p.x, p.z) + 0.8, p.z, lines[i % lines.length], { id: 'c8su:seat' + i, r: 1.4 }));
    },
    onUpdate(dt) {
      C8_ambient(0, C8_OUTAMB);
      const z = Player.pos ? Player.pos.z : 0;
      C8.fogTo = ROOMS.c8_summit.fogAt(0, 0, z, !!S.outage);
      C8_fogStep(dt);
      C8_rowLook(dt);
    },
    onLeave() { C8_ambientOff(); C8.fogTo = null; C8.row = null; },
    async onEnter(G) {
      C8_freedRow();
      G.bars(null);
      // phones ringing one room away, somewhere down the hill in the fog
      const tok = (C8.ringTok = (C8.ringTok || 0) + 1);
      for (;;) {
        await G.wait(14 + Math.random() * 16);
        if (tok !== C8.ringTok || !G.inRoom('c8_summit')) return;
        if (!S.outage || busy()) continue;
        const p = Player.pos, a = Math.random() * Math.PI * 2;
        sfx('ring', { n: 2, pos: [p.x + Math.sin(a) * 22, p.y - 6, p.z + Math.cos(a) * 22], vol: 0.35 });
      }
    },
  });

  // =================================================================================================================
  // 8B — THE MAST COMPOUND. Chain-link fence x 0–30, z 0–20 (−z north); the gate (x 13–17) on the south side; the gate
  // apron outside it (x 3–27, z 20–34) where the summit road ends. Inside: the mast (centre 15, 5) in its inner
  // enclosure (x 9.5–20.5, z 0.3–10.5; its gate at x 15 → c8_mast:base), HUT 1 (west, locked), HUT 2 (east, x 22–27,
  // z 5–9.5, walk-in: the first aid kit, the energy drink), the floodlight on its pole with the Unread (8.8, 14.2).
  // Fenced pens fill the ground behind both huts (no walkable spot a camera can't see).
  // =================================================================================================================
  const CP = { gate: [15, 20], phone: [10.4, 20.12], booth: [24.8, 24.6], flood: [8.8, 14.2], hut: [22, 5, 27, 9.5], door: [22, 7.25] };
  // the gate: two chain-link leaves on hinges at x 13 and 17, chained and padlocked until the code; they swing north
  function C8_gateBuild(K) {
    const frameM = K.mat({ tex: 'metal', color: '#9aa29c', roughness: 0.5, metalness: 0.4 });
    const meshM = K.mat({ tex: 'chainlink', color: '#b8bebb' });
    const leaf = (hx, dir) => {
      const piv = new THREE.Group(); piv.position.set(hx, 0, 20);
      const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = false; piv.add(o); return o; };
      const W = 2.0 * dir;
      add(new THREE.BoxGeometry(0.05, 2.2, 0.05), frameM, 0.05 * dir, 1.15, 0);
      add(new THREE.BoxGeometry(0.05, 2.2, 0.05), frameM, W - 0.03 * dir, 1.15, 0);
      add(new THREE.BoxGeometry(Math.abs(W), 0.05, 0.05), frameM, W / 2, 2.22, 0);
      add(new THREE.BoxGeometry(Math.abs(W), 0.05, 0.05), frameM, W / 2, 0.1, 0);
      add(new THREE.BoxGeometry(Math.abs(W), 0.04, 0.04), frameM, W / 2, 1.15, 0);
      add(new THREE.BoxGeometry(Math.abs(W) - 0.06, 2.1, 0.004), meshM, W / 2, 1.15, 0);
      K.mesh(piv, { name: 'c8c:leaf' + (dir > 0 ? 'L' : 'R') });
      return piv;
    };
    const L = leaf(13, 1), R = leaf(17, -1);
    const col = K.collider(13, 19.9, 17, 20.1, { h: 2.4, name: 'c8c:gatecol' });
    // the chain round the meeting stiles and the combination padlock on it (hidden once it's off)
    const chain = new THREE.Group(); chain.position.set(15, 0, 20);
    const cm = K.mat({ tex: 'metal', color: '#707068', roughness: 0.45, metalness: 0.6 });
    for (let k = 0; k < 8; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10), cm); l.position.set(Math.sin(k * 0.8) * 0.09, 1.05 - k * 0.035, Math.cos(k * 0.8) * 0.09); l.rotation.set(k * 0.7, k * 1.1, 0); chain.add(l); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.03), K.mat({ tex: 'metal', color: '#2b2e2d', roughness: 0.4, metalness: 0.6 }));
    lock.position.set(0, 0.8, 0.11); chain.add(lock);
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 10), K.mat({ tex: 'metal', color: '#c9b46a', roughness: 0.35, metalness: 0.7 })); w.rotation.z = Math.PI / 2; w.position.set(-0.024 + i * 0.016, 0.78, 0.128); chain.add(w); }
    K.mesh(chain, { name: 'c8c:chain' });
    const fallen = new THREE.Group(); fallen.position.set(15.3, 0.02, 20.5);
    for (let k = 0; k < 8; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10), cm); l.position.set(k * 0.05 - 0.2, 0.01, Math.sin(k) * 0.06); l.rotation.set(Math.PI / 2, 0, k); fallen.add(l); }
    const fl = lock.clone(); fl.position.set(0.25, 0.02, 0.05); fl.rotation.x = Math.PI / 2; fallen.add(fl);
    K.mesh(fallen, { name: 'c8c:chainoff' });
    C8.gate = { L, R, col, chain, fallen, k: flag('c8_gate') ? 1 : 0, want: flag('c8_gate') ? 1 : 0 };
    const apply = () => { const g = C8.gate; if (!g) return; const a = U.ease.inOut(g.k) * 1.75; g.L.rotation.y = a; g.R.rotation.y = -a; g.col.enabled = g.k < 0.5; g.chain.visible = g.want < 1; g.fallen.visible = g.want >= 1; };
    apply();
    K.animate((dt) => { const g = C8.gate; if (!g || g.k === g.want) return; g.k = g.want > g.k ? Math.min(g.want, g.k + dt / 1.6) : Math.max(g.want, g.k - dt / 1.6); apply(); });
    // (the chain visibility also has to hold on a rebuild)
    K.animate(() => { const g = C8.gate; if (g) { g.chain.visible = g.want < 1; g.fallen.visible = g.want >= 1; } });
  }
  function C8_gateOpen() { if (C8.gate) C8.gate.want = 1; sfx('clunk', { pos: [15, 1, 20] }); sfx('keys', { pos: [15, 0.6, 20.3], vol: 0.7 }); setTimeout0(() => sfx('creak', { pos: [15, 1.2, 20], vol: 0.9 }), 0.6); }
  // game-time "later" for small effects outside scripts
  function setTimeout0(fn, sec) { (C8.later = C8.later || []).push({ t: sec || 0.05, fn }); }
  function C8_laterTick(dt) {
    if (!C8.later || !C8.later.length) return;
    for (const l of C8.later.slice()) { l.t -= dt; if (l.t <= 0) { C8.later.splice(C8.later.indexOf(l), 1); try { l.fn(); } catch (e) { console.error('[c8] later', e); } } }
  }

  // the padlock: 1961 (Easy / Normal), 1408 (Hard: the day and month the exchange opened)
  async function C8_padlock(G) {
    if (flag('c8_gate')) return;
    const A = G.aidan;
    A.look([15, 0.85, 20.1]);
    if (G.once('c8:padFirst')) {
      note(G, riddle() === 'easy' ? 'The gate. A combination padlock — four numbers.' : 'The gate. A combination padlock. Four numbers.', 'c8_goal');
      await G.think('A combination padlock. [beat] Four wheels.');
    }
    const code = gateCode();
    const r = await G.keypad({ style: 'padlock', title: 'COMBINATION LOCK', code, start: '0000' });
    A.look(null);
    if (r !== code) {
      const knows = flag('c8_phone') || !!(S.docs && S.docs[pickDoc('gate_card')]);
      if (G.once('c8:padFail')) await G.think(knows ? 'The exchange. [beat] The plaque on the forecourt said when it opened.' : 'Four numbers. [beat] Somebody who worked up here would know them.');
      return;
    }
    G.set('c8_gate', true);
    C8_gateOpen();
    note(G, 'The gate. A combination padlock. Four numbers.', 'c8_goal', { done: true });
    note(G, 'The mast. Climb it.', 'c8_climb');
    try { G.mapMark('c8:gate', { at: [15, 20], t: 'tick' }); } catch (e) { /* maps */ }
    await G.wait(0.8);
    await G.think(riddle() === 'hard' ? 'Fourteen, oh-eight. [beat] The day the girls started on the boards.' : 'Nineteen sixty-one. [beat] The year the girls started on the boards.');
  }
  // the emergency phone on the fence: Wai (if he was saved), or the laminated card inside the box
  async function C8_emergency(G) {
    const A = G.aidan, [px, pz] = CP.phone;
    await A.turn([px, pz], 0.4);
    A.look([px, 1.3, pz]);
    if (flag('waiSaved')) {
      C8.inCall = true;
      if (C8.ring) { try { C8.ring.stop(0.1); } catch (e) { /* audio */ } C8.ring = null; }
      q(A.gesture('reach', { hand: 'L', target: [px, 1.2, pz + 0.1] }));
      G.sfx('handle', { pos: [px, 1.3, pz], vol: 0.6 });
      await G.wait(0.6);
      G.sfx('static', { dur: 0.4, vol: 0.35, phone: true });
      await G.wait(0.5);
      // (spec §2A, Easy: Wai states "1961")
      const mid = riddle() === 'easy' ? 'Every tech learned it. 1961. The year the exchange opened.'
        : riddle() === 'hard' ? 'Every tech learned it. The day and month the exchange opened.' : 'Every tech learned it. The year the exchange opened.';
      await G.say('WAI (phone)', `Gate's on the old combination. ${mid} [beat] Go on, mate. I'll put you through when you get there.`);
      G.set('c8_phone', true);
      await G.wait(0.5);
      G.sfx('clunk', { pos: [px, 1.3, pz], vol: 0.7 });
      A.look(null);
      await G.think(riddle() === 'easy' ? 'Nineteen sixty-one.' : riddle() === 'hard' ? 'The day and the month. [beat] The plaque on the exchange forecourt.' : 'The year the exchange opened. [beat] The plaque on the forecourt.');
      note(G, riddle() === 'easy' ? 'Gate code: 1961.' : riddle() === 'hard' ? 'Gate code: the day and month the exchange opened.' : 'Gate code: the year the exchange opened.', 'c8_code');
      C8.inCall = false;
      return;
    }
    // no Wai: a dead line, and the card taped inside the box
    if (!flag('c8_phone')) {
      q(A.gesture('reach', { hand: 'L', target: [px, 1.2, pz + 0.1] }));
      G.sfx('handle', { pos: [px, 1.3, pz], vol: 0.6 });
      await G.wait(0.8);
      await G.think('Nothing on the line. [beat] Not even a dial tone.');
      G.sfx('clunk', { pos: [px, 1.3, pz], vol: 0.6 });
      G.set('c8_phone', true);
      await G.think('There\'s a card taped inside the lid.');
    }
    A.look(null);
    await G.doc(pickDoc('gate_card'), { id: 'c8_compound:card' });
    note(G, riddle() === 'easy' ? 'Gate code: 1961.' : riddle() === 'hard' ? 'Gate code: the day and month the exchange opened.' : 'Gate code: the year the exchange opened.', 'c8_code');
  }

  defineRoom({
    id: 'c8_compound', name: 'MAST COMPOUND', area: 'THE MAST', chapter: 8, outdoor: true, surface: 'gravel', ambient: 'wind_heavy',
    fog: { density: 0.05 }, outageFog: { density: 0.04, color: C8_OUTFOG },
    surfaces: [{ box: [3, 23, 27, 34.2], s: 'bitumen' }, { box: [22.1, 5.1, 26.9, 9.4], s: 'concrete' }],
    bounds: [0, 0, 30, 34.2],
    entries: { gate: [15, 32.2, 180], mast: [15, 11.6, 0], start: [15, 32.2, 180] },
    cameras: [
      // wide from outside the fence: the apron, the gate, the fence running off into the fog, the mast behind it
      { id: 'c8_compound:apron', vol: [3, 19.85, 27, 34.2], type: 'pan', pos: [19.4, 3.1, 39.5], target: [14.6, 2.0, 20.5], fov: 50, pan: { lag: 0.3, yaw: 40, pitch: 16 } },
      // at the gate: low beside the emergency phone, the padlock and the diagram, whoever's standing by it
      { id: 'c8_compound:gate', vol: [11, 19.85, 20, 23.2], pri: 1, type: 'static', pos: [21.5, 1.35, 28.6], target: [14.3, 1.25, 20.3], fov: 'fit' },
      // high over the south-east corner of the fence, across the yard: the floodlight and its Unread, the enclosure, HUT 2
      { id: 'c8_compound:flood', vol: [11, 10.5, 29.7, 19.9], type: 'pan', pos: [27.6, 5.4, 23.4], target: [16.5, 0.6, 12.2], fov: 50, pan: { lag: 0.3, yaw: 50, pitch: 30 } },
      // the west of the yard from the east fence (the floodlight and whatever is on it in the foreground)
      { id: 'c8_compound:west', vol: [0.3, 10.5, 11, 19.9], type: 'pan', pos: [21.5, 4.4, 18.6], target: [5.5, 0.6, 14.5], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 30 } },
      // HUT 1 from across the yard
      { id: 'c8_compound:nw', vol: [0.3, 0.3, 9.6, 10.6], type: 'static', pos: [13.4, 4.6, 16.4], target: [4.6, 0.6, 5.2], fov: 'fit' },
      // HUT 2 from across the yard, the mast's legs in the frame edge
      { id: 'c8_compound:ne', vol: [20.4, 0.3, 29.7, 10.6], type: 'static', pos: [16.4, 4.6, 16.4], target: [25.2, 0.6, 5.6], fov: 'fit' },
      // inside HUT 2 through the chain-link and the missing wall
      { id: 'c8_compound:hut', vol: [22.1, 5.1, 26.9, 9.4], pri: 2, type: 'static', pos: [32.2, 2.05, 7.4], target: [24.2, 0.9, 7.1], fov: 'fit' },
      // the enclosure gate: low, looking up the mast into the fog
      { id: 'c8_compound:mast', vol: [12.4, 10.4, 17.6, 13.2], pri: 1, type: 'static', pos: [16.2, 0.55, 19.2], target: [15, 6.2, 6], fov: 'fit' },
    ],
    spawns: [
      // the Borrowed "Luka" at the gate: badge LUAK, the hands wrong. The real Luka isn't here.
      { id: 'c8_compound:luka', type: 'borrowed', disguise: 'luka', pos: [16.4, 22.5], rot: 185, anim: 'idle', world: 'both' },
      // the Unread round the floodlight pole
      { id: 'c8_compound:unread', type: 'unread', pos: [8.8, 14.2], count: 40, world: 'both', cluster: [[9.02, 2.35, 14.36], [8.58, 2.7, 14.38], [8.62, 3.05, 14.0], [9.02, 3.3, 14.02], [8.8, 2.0, 14.44]] },
    ],
    build(K) {
      const bags = Bags();
      // ---- ground ----------------------------------------------------------------------------------------------------
      K.floor(3, 19.85, 27, 34.2, 'bitumen', { skirt: false });
      K.floor(0.3, 10.5, 29.7, 19.85, 'gravel', { skirt: false });
      K.floor(0.3, 0.3, 9.5, 10.5, 'gravel', { skirt: false });
      K.floor(20.5, 0.3, 29.7, 10.5, 'gravel', { skirt: false });
      K.floor(22.1, 5.1, 26.9, 9.4, { tex: 'concrete', color: '#8f8f88' }, { y: 0.12, skirt: false });
      K.box(15, -0.05, 5.4, 11, 0.05, 10.2, { tex: 'gravel', color: '#6f6a60' }, { shadow: false });
      // the hilltop falling away round the compound; the road coming up from the south
      const dt = bags.g('dirt', { tex: 'dirt', color: '#6d6252' }), vg = bags.g('grass', { tex: 'grass', color: '#56604d' });
      for (const [a, b, c, d] of [[[0, -0.02, 0], [0, -0.02, 34], [-10, -6, 34], [-10, -6, 0]], [[30, -0.02, 34], [30, -0.02, 0], [40, -6, 0], [40, -6, 34]], [[30, -0.02, 0], [0, -0.02, 0], [0, -5, -10], [30, -5, -10]]]) quad(dt, a, b, c, d, 0.4, [0, 1, 0]);
      quad(vg, [0, 0, 20.1], [3, 0, 20.1], [3, 0, 34.2], [0, 0, 34.2], 0.5, [0, 1, 0]); quad(vg, [27, 0, 20.1], [30, 0, 20.1], [30, 0, 34.2], [27, 0, 34.2], 0.5, [0, 1, 0]);
      K.box(15, -0.06, 40, 8, 0.06, 12, 'bitumen', { shadow: false });
      bags.flush(K);
      C8_townLights(K, { cx: 15, cz: 10, y: -58, r0: 60, r1: 150, n: 220, seed: 812, opacity: 0.45 });
      K.exit({ id: 'c8_compound:road', box: [8, 33.5, 22, 34.3], to: 'c8_summit', entry: 'top', sound: 'steps' });
      K.blocker(3, 20.1, 3.3, 33.5, 'Just the hill, going down into the fog.'); K.blocker(26.7, 20.1, 27, 33.5, 'Just the hill, going down into the fog.');

      // ---- the fence (chain-link, barbed wire), RF signs, the gate ---------------------------------------------------
      const fence = (x0, z0, x1, z1, o = {}) => {
        const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0) / D2R;
        K.prop('chainlink', (x0 + x1) / 2, (z0 + z1) / 2, rot, { len: L, h: 2.3, sign: o.sign });
        K.collider(Math.min(x0, x1) - (x0 === x1 ? 0.08 : 0), Math.min(z0, z1) - (z0 === z1 ? 0.08 : 0), Math.max(x0, x1) + (x0 === x1 ? 0.08 : 0), Math.max(z0, z1) + (z0 === z1 ? 0.08 : 0), { h: 2.6 });
      };
      fence(0, 20, 12.85, 20); fence(17.15, 20, 30, 20); fence(0, 0, 30, 0);
      fence(0, 0, 0, 20); fence(30, 0, 30, 20);
      for (const x of [12.9, 17.1]) { K.box(x, -0.05, 20, 0.14, 2.6, 0.14, { tex: 'metal', color: '#8f9791' }, { collide: true }); K.sphere(x, 2.6, 20, 0.08, { tex: 'metal', color: '#8f9791' }); }
      C8_gateBuild(K);
      for (const x of [4, 9.5, 21, 26.5]) K.prop('rf_sign', x, 20.06, 0, { variant: 'fence', mount: 1.45 });
      for (const z of [5, 15]) { K.prop('rf_sign', 0.06, z, 90, { variant: 'fence', mount: 1.45 }); K.prop('rf_sign', 29.94, z, -90, { variant: 'fence', mount: 1.45 }); }
      K.sign('SIGNAL HILL RADIO TERMINAL\nSITE 4401\nAUTHORISED PERSONNEL ONLY', 18.4, 1.75, 20.1, 1.0, 0.5, { style: 'council' });
      K.examine(18.4, 1.6, 20.5, ['"Signal Hill Radio Terminal. Site 4401."', 'Authorised personnel only. [beat] Nobody authorised me to do anything.'], { id: 'c8c:plaque', r: 1.3 });
      K.examine(4, 1.45, 20.5, '"Danger — RF radiation — keep out." [beat] The paint\'s gone chalky. Somebody\'s drawn a smiley face on it.', { id: 'c8c:rf', r: 1.3 });
      // the padlock and the diagram
      K.interact(15, 1.0, 20.35, (G) => C8_padlock(G), { id: 'c8_compound:padlock', r: 1.25, when: () => !flag('c8_gate') });
      K.examine(15, 1.0, 20.35, 'The chain\'s off. [beat] The gate swings on its own in the wind.', { id: 'c8c:gateopen', r: 1.25, when: () => flag('c8_gate') });
      K.plane(14.05, 1.35, 20.07, 0.3, 0.42, diagramTex(), { name: 'c8c:diagram' });
      K.pickup('map_mast', 14.05, 1.2, 20.12, { id: 'c8_compound:map', model: false, r: 1.2 });
      K.animate(() => { const d = World.obj && World.obj('c8c:diagram'); if (d) d.visible = !(S.taken && S.taken['c8_compound:map']); });

      // ---- the emergency phone (Wai / the card) and the payphone ------------------------------------------------------
      const [epx, epz] = CP.phone;
      const wai = flag('waiSaved');
      K.prop('emergency_phone', epx, epz, 0, { open: !wai, mount: 1.3 });
      if (!wai) K.plane(epx + 0.07, 1.2, epz + 0.03, 0.11, 0.15, gateCardTex(riddle()), {});
      K.light('led', epx + 0.12, 1.55, epz + 0.17, { color: wai ? '#ff2a1c' : '#3dff9a', blink: wai ? 0.8 : false, size: 0.012 });
      K.interact(epx, 1.3, epz + 0.25, (G) => C8_emergency(G), { id: 'c8_compound:ephone', r: 1.2 });
      K.payphone(CP.booth[0], CP.booth[1], -90, { id: 'c8_compound:payphone' });
      K.examine(CP.booth[0] - 0.9, 1.3, CP.booth[1] + 1.1, ['A payphone booth at the top of a hill. For the techs, I suppose.', 'The handset\'s off the hook. It always is.'], { id: 'c8c:booth', r: 1.1 });
      // the phone's ring (Wai), started by the approach trigger below
      K.trigger([6, 20.2, 24, 27], async (G) => {
        if (!flag('waiSaved') || flag('c8_phone') || C8.ring) return;
        C8.ring = sfx('ring', { pos: [epx, 1.3, epz + 0.1], loop: true, vol: 0.9 });
        await G.wait(1.2);
        if (!C8.inCall && !flag('c8_phone') && G.once('c8:ringThought')) await G.think('The emergency phone. [beat] It\'s ringing.');
      }, { id: 'c8_compound:ring', once: false, when: () => flag('waiSaved') && !flag('c8_phone') });
      // the first sight of "Luka" at the gate
      K.trigger([5, 25.5, 25, 34], async (G) => {
        const e = G.enemy('c8_compound:luka');
        if (!e || e.resolved || !e.disguised) return;
        G.set('c8_luka', true);
        await G.wait(0.9);
        await G.think('Luka? [beat] ...He said he\'d be at the hospital.');
      }, { id: 'c8_compound:luka' });

      // ---- the mast (visual only here: the ladder, the platforms and the hut are the next room) ---------------------
      C8_mastBody(K, { cx: 15, cz: 5, walk: false });
      // the inner enclosure round its base: chain-link, the gate standing open (the lock cut long ago)
      for (const [x0, z0, x1, z1] of [[9.5, 10.5, 14.1, 10.5], [15.9, 10.5, 20.5, 10.5], [9.5, 0.3, 9.5, 10.5], [20.5, 0.3, 20.5, 10.5]]) {
        const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0) / D2R;
        K.prop('chainlink', (x0 + x1) / 2, (z0 + z1) / 2, rot, { len: L, h: 2.1, barbed: false });
      }
      K.collider(9.5, 10.42, 14.1, 10.58, { h: 2.4 }); K.collider(15.9, 10.42, 20.5, 10.58, { h: 2.4 });
      K.box(14.1, 0, 11.2, 0.05, 2.0, 1.4, { tex: 'chainlink', color: '#b8bebb' }, { rot: 20 });
      K.prop('sign_post', 16.2, 10.75, 0, { style: 'warning', text: 'CLIMBING\nHARNESS\nREQUIRED', w: 0.5, h: 0.5, post: 2.0 });
      K.exit({ id: 'c8_compound:mast', box: [14.1, 10.2, 15.9, 11.0], to: 'c8_mast', entry: 'base', sound: 'steps' });   // (the gravel ends at z 10.5)
      K.examine(15, 2.2, 11.2, ['The mast. [beat] It goes up into the fog and doesn\'t stop.', 'There\'s a red light up there somewhere. Blinking.'], { id: 'c8c:mast', r: 1.8 });

      // ---- HUT 1 (west): locked -----------------------------------------------------------------------------------
      K.prop('hut', 5.2, 5.2, 0, { w: 4.4, d: 4.0, h: 2.6, text: 'HUT 1' });
      K.interact(5.2, 1.2, 7.55, async (G) => {
        G.sfx('door_locked', { pos: [5.2, 1.1, 7.3] });
        await G.msg('It\'s locked.');
        try { G.mapMark('c8:hut1', { at: [5.2, 7.3], t: 'x' }); } catch (e) { /* maps */ }
        if (G.once('c8:hut1')) await G.think('Padlocked. Somebody\'s chalked on the door: "RF ON. DO NOT ENTER."');
      }, { id: 'c8_compound:hut1', r: 1.2 });
      K.writing('ASK THEM', 5.2, 1.65, 7.26, 1.1, { rotY: 0, style: 'receipt', world: 'outage' });

      // ---- HUT 2 (east): walk-in. Walls (the east wall one-sided for the camera outside), the door ajar -------------
      const [hx0, hz0, hx1, hz1] = CP.hut, HH = 2.7;
      const hutWall = { tex: 'metal', color: '#bdb8a5', roughness: 0.7, metalness: 0.1 };
      K.box((hx0 + hx1) / 2, 0, (hz0 + hz1) / 2, hx1 - hx0 + 0.3, 0.12, hz1 - hz0 + 0.3, { tex: 'concrete', color: '#8a8a84' });
      K.wall(hx0, hz0, hx1, hz0, HH, hutWall, { y: 0.12 });
      K.wall(hx1, hz1, hx0, hz1, HH, hutWall, { y: 0.12 });
      K.wall(hx0, hz1, hx0, hz0, HH, hutWall, { y: 0.12, openings: [{ at: hz1 - CP.door[1], w: 1.0, h: 2.1 }] });
      K.wall(hx1, hz0, hx1, hz1, HH, hutWall, { y: 0.12, both: false });
      K.box((hx0 + hx1) / 2, HH + 0.12, (hz0 + hz1) / 2, hx1 - hx0 + 0.5, 0.1, hz1 - hz0 + 0.5, { tex: 'metal', color: '#7d807a' });
      K.ceiling(hx0, hz0, hx1, hz1, HH + 0.1, { tex: 'metal', color: '#8b8d86' });
      K.door({ id: 'c8_compound:hut2', x: CP.door[0], z: CP.door[1], rot: 90, w: 0.95, style: 'metal', open: 0.8, sign: 'HUT 2' });
      K.prop('rf_sign', hx0 - 0.02, 5.8, -90, { variant: 'fence', mount: 1.6 });
      K.light('lamp', hx0 - 0.25, 2.5, CP.door[1], { color: '#ffd9a0', intensity: 2.2, distance: 5, bank: 2 });
      K.box(hx0 - 0.12, 2.36, CP.door[1], 0.2, 0.16, 0.24, { color: '#d9c890', emissive: '#ffd9a0', emissiveIntensity: 0.8, outage: false });
      K.writing('DID YOU CHECK', 24.5, 1.6, hz1 + 0.09, 1.7, { rotY: 0 });
      // inside: the transmitter racks (LEDs), the bench with the pickups, the logbook, a folding chair, a camp bed
      for (let i = 0; i < 3; i++) {
        const x = 22.7 + i * 0.66;
        K.box(x, 0.12, 5.45, 0.6, 2.1, 0.6, { tex: 'metal', color: '#3d4442', roughness: 0.5 }, { collide: true });
        for (let k = 0; k < 4; k++) K.light('led', x - 0.18 + k * 0.1, 1.2 + (k % 2) * 0.35, 5.76, { color: k % 3 ? '#3dff9a' : '#ffb020', blink: 0.6 + k * 0.37, size: 0.008 });
      }
      K.outageOnly(() => { for (let i = 0; i < 3; i++) K.light('led', 22.7 + i * 0.66, 1.8, 5.76, { color: '#ff2a1c', blink: 0.5 + i * 0.2, size: 0.012 }); });
      K.prop('table', 25.6, 8.85, 0, { variant: 'folding', w: 1.6, d: 0.7, y: 0.12 });
      K.pickup('first_aid', 26.1, 0.87, 8.8, { id: 'c8_compound:firstaid', rot: 20, glint: true });
      K.pickup('energy_drink', 25.0, 0.87, 8.95, { id: 'c8_compound:energy', rot: 60 });
      K.pickup('coffee', 23.3, 0.14, 8.95, { id: 'c8_compound:coffee', extraOnEasy: true, rot: 10 });
      K.prop('chair', 25.3, 8.1, 170, { variant: 'folding', y: 0.12 });
      K.prop('mug', 26.5, 8.9, 30, { y: 0.87, text: 'SITE 4401' });
      K.box(24.4, 0.86, 8.9, 0.24, 0.03, 0.32, { color: '#2e4c7a', roughness: 0.8 }, { rot: 8 });
      K.box(23.2, 0.12, 6.9, 0.7, 0.18, 1.8, { color: '#3f4a5c', roughness: 0.9 }, { rot: 2 });
      K.cyl(23.3, 0.3, 6.15, 0.14, 0.62, { color: '#6a3f32', roughness: 0.9 }, { rz: 90 });
      K.box(26.55, 0.12, 6.4, 0.4, 0.5, 0.25, { color: '#7a7d78', roughness: 0.5 });
      K.plane(24.6, 1.65, hz1 - 0.08, 0.4, 0.55, Tex.poster('AUGUST', { kind: 'notice', seed: 88 }), { rotY: 180 });
      K.fogOnly(() => K.light('point', 24.5, 2.4, 7.2, { color: '#cfe0da', intensity: 1.2, distance: 5 }));
      K.outageOnly(() => {
        K.prop('fluoro_tube', 24.5, 7.25, 90, { h: HH + 0.05, flicker: true, bank: 3 });
        K.prop('receipt_strip', 23.4, 7.8, 30, { ceil: HH + 0.1, len: 1.4 });
        K.prop('tether_hanging', 25.8, 6.4, 0, { ceil: HH + 0.1, len: 1.5 });
        K.dress('receipts', [22.3, 5.9, 26.7, 9.2], 12, { seed: 8121 });
      });
      K.examine(23.4, 1.3, 5.9, ['Transmitter racks. The lights are still going. Green, green, amber.', 'Everything up here is still sending. [beat] Just nothing\'s getting through.'], { id: 'c8c:racks', r: 1.3 });
      K.examine(24.4, 1.0, 8.9, async (G) => {
        await G.think('The site log. "Fault: no service, whole area." Then a lot of dates.');
        await G.think('Every entry after that says the same thing. [beat] "Follow up tomorrow."');
      }, { id: 'c8c:log', r: 1.1 });
      K.examine(23.2, 0.5, 6.9, ['A camp bed and a sleeping bag. Somebody stayed up here.', 'Waiting for a part, maybe. Or for someone to call back.'], { id: 'c8c:bed', r: 1.2 });
      K.examine(24.6, 1.65, 9.1, 'A calendar stuck on August. [beat] Nobody\'s turned it over.', { id: 'c8c:cal', r: 1.2 });

      // ---- the fenced pens behind the huts (so nobody walks round the back of a hut, out of every camera's sight): gas
      // bottles and the pole transformer behind HUT 1, the cable yard behind HUT 2. Chain-link: seen through, not walked.
      fence(0, 7.2, 3.0, 7.2); fence(7.4, 3.2, 7.4, 0);
      K.collider(0.3, 0.3, 2.95, 7.1, { h: 2.6 }); K.collider(2.95, 0.3, 7.3, 3.15, { h: 2.6 });
      fence(20.5, 5.0, 22.0, 5.0); fence(27.0, 9.5, 30, 9.5);
      K.collider(20.6, 0.3, 29.7, 4.95, { h: 2.6 }); K.collider(27.05, 4.95, 29.7, 9.4, { h: 2.6 });
      for (let i = 0; i < 4; i++) { K.cyl(0.9 + i * 0.42, 0, 6.5, 0.17, 1.25, { color: '#cfc9b8', roughness: 0.5, metalness: 0.2 }); K.cyl(0.9 + i * 0.42, 1.25, 6.5, 0.07, 0.12, { tex: 'metal', color: '#6c6f6a' }); }
      K.box(1.7, 0.75, 6.72, 1.8, 0.03, 0.03, { tex: 'metal', color: '#4a4c49' });
      K.box(5.4, 0, 1.4, 1.5, 1.45, 1.0, { tex: 'metal', color: '#6c7a70', roughness: 0.6 });
      K.box(5.4, 1.45, 1.4, 1.6, 0.06, 1.1, { tex: 'metal', color: '#5a655d' });
      for (let i = 0; i < 3; i++) K.cyl(4.9 + i * 0.5, 1.51, 1.4, 0.06, 0.34, { color: '#c9c5b6', roughness: 0.4 });
      K.prop('rf_sign', 7.46, 1.6, 90, { variant: 'fence', mount: 1.45 });
      K.prop('cable_drum', 24.2, 2.6, 25, {}); K.prop('cable_drum', 26.4, 1.6, 70, { variant: 'flat' }); K.prop('cable_drum', 28.4, 2.3, 90, {});
      K.prop('pallet', 22.2, 1.4, 5, { n: 2, load: 'wrapped' });
      K.examine(1.6, 1.2, 7.6, ['Gas bottles chained up in a pen. The gate\'s padlocked.', 'Everything up here is locked. [beat] Everything except the way up.'], { id: 'c8c:pen1', r: 1.3 });
      K.examine(28.5, 1.2, 9.9, ['Drums of cable, fenced in. Enough to wire every house on the hill.', 'None of it\'s connected to anything.'], { id: 'c8c:pen2', r: 1.3 });

      // ---- the yard: the floodlight (the Unread's), the generator, drums, the cable ladder to the mast ---------------
      K.prop('floodlight', CP.flood[0], CP.flood[1], 70, { light: 'point', bank: 1 });
      K.examine(CP.flood[0] + 0.5, 1.4, CP.flood[1] + 0.6, async (G) => {
        const e = G.enemy('c8_compound:unread');
        if (e && !e.removed) await G.think('Something\'s nested on the pole. Pulsing red, like notifications.');
        else await G.think('The floodlight. It lights nothing but fog.');
      }, { id: 'c8c:flood', r: 1.4 });
      K.box(24.5, 0, 15.4, 1.8, 1.15, 1.0, { color: '#d2a81c', roughness: 0.55 }, { collide: true });
      K.box(24.5, 1.15, 15.4, 1.6, 0.12, 0.9, { tex: 'metal', color: '#3b3f3d' });
      K.writing("IT'LL BE FINE", 24.5, 0.7, 15.92, 1.4, { rotY: 0 });
      K.examine(24.5, 1.0, 16.3, ['A generator. Out of fuel.', 'Somebody\'s written on it. [beat] "It\'ll be fine."'], { id: 'c8c:gen', r: 1.4 });
      K.prop('cable_drum', 27.6, 18.2, 20, {});
      K.prop('cable_drum', 2.6, 17.6, 80, { variant: 'flat' });
      K.prop('pallet', 27.2, 12.4, 10, { n: 2, load: 'wrapped' });
      K.prop('esky', 22.6, 18.9, 35, {});
      K.box(21.8, 0, 18.4, 0.5, 0.02, 0.3, { color: '#c8cc2a', roughness: 0.8 }, { rot: 20 });
      K.examine(22.6, 0.7, 18.9, ['An esky with a hard hat on it. The hard hat says "M."', 'Inside there\'s a thermos and half a sandwich. [beat] Somebody was coming back.'], { id: 'c8c:esky', r: 1.2 });
      for (const [x, z] of [[21.2, 7.2], [20.2, 7.0]]) K.box(x, 0, z, 0.08, 2.6, 0.08, { tex: 'metal', color: '#8f9791' });
      K.box(21, 2.6, 7.2, 2.2, 0.06, 0.4, { tex: 'metal', color: '#9aa09a' });
      K.box(20.4, 2.66, 7.2, 3.6, 0.1, 0.25, { color: '#161818', roughness: 0.6 });
      // Outage dressing: receipt paper woven into the chain-link, tethers off the barbed wire, contracts at the fence
      K.outageOnly(() => {
        for (const [x, z, r] of [[2, 20.05, 0], [7, 20.05, 0], [23, 20.05, 0], [28, 20.05, 0], [0.05, 9, 90], [0.05, 14, 90], [29.95, 3, 90], [29.95, 12, 90], [5, 0.05, 0], [25, 0.05, 0]]) K.prop('receipt_strip', x, z, r, { ceil: 2.3, len: 1.3 + (x % 3) * 0.3 });
        for (const [x, z] of [[11, 20.1], [19, 20.1], [0.1, 18], [29.9, 17], [28, 0.1]]) K.prop('tether_hanging', x, z, 0, { ceil: 2.5, len: 1.4 });
        for (const [x, z] of [[1.2, 19.2], [28.8, 19.1], [1.1, 11.5]]) for (let i = 0; i < 3; i++) K.prop('contract_stack', x + (i % 2) * 0.4, z - i * 0.5, i * 41, { h: 0.6 + i * 0.25 });
        K.dress('receipts', [1, 11, 29, 19.5], 30, { seed: 8122 });
        K.dress('contracts', [4, 21, 26, 33], 16, { seed: 8123 });
        K.light('point', 15, 2.4, 23.5, { color: '#ff3b2a', intensity: 2.2, distance: 9 });
        K.light('point', 26, 2.2, 13, { color: '#1f6f6a', intensity: 3, distance: 10 });
      });
      K.fogOnly(() => { K.dress('leaves', [4, 21, 26, 33], 16, { seed: 8124 }); });
      // a hi-vis vest hung on the fence by the gate
      K.box(11.8, 1.2, 20.1, 0.5, 0.62, 0.03, { color: '#d9e03a', roughness: 0.85 }, { rot: 4 });
      K.box(11.8, 1.36, 20.11, 0.48, 0.05, 0.03, { color: '#dcdcd4', roughness: 0.5 });
      K.examine(11.8, 1.4, 20.5, ['A hi-vis vest on the fence. "M. — LINES" in marker on the back.', 'It\'s been out here long enough to go grey.'], { id: 'c8c:vest', r: 1.1 });
    },
    onUpdate(dt) {
      C8_ambient(0, C8_OUTAMB);
      C8.fogTo = S.outage ? 0.036 : 0.045;
      C8_fogStep(dt);
      C8_laterTick(dt);
    },
    onLeave() { C8_ambientOff(); C8.fogTo = null; C8.inCall = false; if (C8.ring) { try { C8.ring.stop(0.2); } catch (e) { /* audio */ } C8.ring = null; } C8.gate = null; },
    async onEnter(G) {
      G.bars(null);
      if (S.chapter === 8 && !S.outage) G.setOutage(true);
    },
  });

  // =================================================================================================================
  // THE MAST BODY (shared by c8_compound, visual only, and c8_mast, walkable). Mast centre (cx, cz). Ladders in cages:
  // L1 on the south face (x +1.0) 0 → 20, L2 on the east face (z −1.2) 20 → 40, L3 on the north face (x −1.2) 40 → 56.
  // Platforms (4 × 4 m grating, yellow rails) staggered round the shaft so no walkable floor sits over another:
  // P1 east (x 1.5…5.5, z −1.0…2.85, y 20), P2 north (x −1…3, z −5.5…−1.6, y 40), P3 west (x −5.5…−1.05,
  // z −2.6…1.4, y 56, the hatch where L3 comes up). The transmitter hut on the mast head (x −1…5, z −3.6…2.4, y 56),
  // its door on the west wall at z −0.6 facing P3; antennas on its roof, the aircraft light above.
  // =================================================================================================================
  const MH = { P1: [1.5, -1.0, 5.5, 2.85, 20], P2: [-1.0, -5.5, 3.0, -1.6, 40], P3: [-5.5, -2.6, -1.05, 1.4, 56], hut: [-1.0, -3.6, 5.0, 2.4, 56], door: [-1.0, -0.6] };
  function C8_mastBody(K, o = {}) {
    const cx = o.cx || 0, cz = o.cz || 0, walk = !!o.walk;
    const X = (x) => cx + x, Z = (z) => cz + z;
    C8_lattice(K, { cx, cz, top: 56, base: 3.0, half: 1.5, flare: 12, skip: (f, ya, yb) => f === 's' && yb <= 21, collide: walk });
    const when = walk ? undefined : () => false;
    const tag = walk ? 'c8_mast' : 'c8c';
    K.ladder(X(1.0), Z(1.75), 0, 0, 20, { id: tag + ':l1', top: [X(2.25), Z(1.95)], bottom: [X(1.0), Z(3.35)], cage: true, when, r: 1.1 });
    K.ladder(X(1.75), Z(-1.2), 90, 20, 40, { id: tag + ':l2', top: [X(2.35), Z(-2.4)], bottom: [X(3.05), Z(-0.45)], cage: true, when, r: 1.1 });
    K.ladder(X(-1.2), Z(-1.75), 180, 40, 56, { id: tag + ':l3', top: [X(-2.35), Z(-2.1)], bottom: [X(-0.55), Z(-3.15)], cage: true, when, r: 1.1 });
    const grate = { tex: 'metal_grating', color: '#a9aea8' }, railM = { tex: 'metal', color: '#c9a822', roughness: 0.6 };
    const R = Rods(), S2 = Rods();
    // one platform: grating slab (walkable floors in the mast room), rails with gaps where the ladders meet it,
    // struts under it to the shaft
    const plat = (P, gaps, floors, strutTo) => {
      const [x0, z0, x1, z1, y] = P;
      // the grating follows the walkable floors (P3 keeps its hatch open over the last ladder)
      for (const f of floors) K.box(X((f[0] + f[2]) / 2), y - 0.07, Z((f[1] + f[3]) / 2), f[2] - f[0], 0.07, f[3] - f[1], grate, { shadow: false });
      if (walk) for (const f of floors) K.floor(X(f[0]), Z(f[1]), X(f[2]), Z(f[3]), grate, { y, skirt: false });
      const edges = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
      for (const [side, [a, b]] of Object.entries(edges)) {
        const g = gaps[side];
        if (g === 'none') continue;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const runs = []; let t = 0;
        for (const [g0, g1] of (g || [])) { if (g0 > t) runs.push([t, g0]); t = g1; }
        if (t < L) runs.push([t, L]);
        for (const [t0, t1] of runs) {
          const p = (tt) => [a[0] + (b[0] - a[0]) * (tt / L), a[1] + (b[1] - a[1]) * (tt / L)];
          const [ax, az] = p(t0), [bx, bz] = p(t1);
          for (const h of [0.55, 1.1]) R.add([X(ax), y + h, Z(az)], [X(bx), y + h, Z(bz)], 0.022);
          const n = Math.max(1, Math.round((t1 - t0) / 1.2));
          for (let i = 0; i <= n; i++) { const [px, pz] = p(t0 + (t1 - t0) * (i / n)); R.add([X(px), y, Z(pz)], [X(px), y + 1.1, Z(pz)], 0.024); }
          K.box(X((ax + bx) / 2), y, Z((az + bz) / 2), Math.abs(bx - ax) + 0.03, 0.1, Math.abs(bz - az) + 0.03, railM, { shadow: false });
          if (walk) K.collider(X(Math.min(ax, bx)) - 0.05, Z(Math.min(az, bz)) - 0.05, X(Math.max(ax, bx)) + 0.05, Z(Math.max(az, bz)) + 0.05, { h: 1.15, y });
        }
      }
      // struts from the outer corners down to the shaft
      for (const [sx, sz, tx2, tz2] of strutTo) S2.add([X(sx), y - 0.08, Z(sz)], [X(tx2), y - 2.6, Z(tz2)], 0.04);
      // the red obstruction light on the rail post at the platform's outer corner
      const ox = Math.abs(x0) > Math.abs(x1) ? x0 : x1, oz = Math.abs(z0) > Math.abs(z1) ? z0 : z1;
      K.light('led', X(ox), y + 1.2, Z(oz), { color: '#ff2a1c', size: 0.07, blink: 2.2, duty: 0.5, phase: y / 70, halo: 2.4, haloOpacity: 0.75, intensity: 4 });
    };
    plat(MH.P1, { w: [[0.2, 1.6]], n: [[2.6, 3.9]] }, [[1.5, -1.0, 5.5, 2.85]], [[5.4, -0.9, 1.5, -0.9], [5.4, 2.75, 1.5, 1.5]]);
    plat(MH.P2, { s: [[0.1, 1.5]], w: [[0, 1.2]] }, [[-1.0, -5.5, 3.0, -1.6]], [[-0.9, -5.4, -0.9, -1.5], [2.9, -5.4, 1.5, -1.5]]);
    plat(MH.P3, { e: 'none', s: [[0, 0.5]] }, [[-5.5, -2.6, -1.55, 1.4], [-1.55, -1.55, -1.05, 1.4]], [[-5.4, -2.5, -1.5, -1.5], [-5.4, 1.3, -1.5, 1.3]]);
    // the hatch frame round L3's top
    K.box(X(-1.3), 55.93, Z(-2.08), 0.55, 0.07, 1.05, { color: '#d8b928', roughness: 0.6 }, { shadow: false });
    // steady red obstruction lamps on the legs beside each ladder, halfway up: the only light on the climb
    for (const [lx, ly, lz] of [[2.24, 6.5, 2.24], [1.6, 15.5, 1.6], [1.62, 30, -1.62], [-1.62, 48, -1.62]]) {
      K.box(X(lx), ly - 0.12, Z(lz), 0.16, 0.12, 0.16, { tex: 'metal', color: '#3d403e' }, { shadow: false });
      K.light('led', X(lx), ly + 0.05, Z(lz), { color: '#ff2a1c', size: 0.07, halo: 1.6, haloOpacity: 0.6, intensity: 4 });
      if (walk) K.light('point', X(lx) + Math.sign(lx) * 0.3, ly + 0.2, Z(lz) + Math.sign(lz) * 0.3, { color: '#ff4a36', intensity: 4.2, distance: 7.5 });
    }
    R.flush(K, railM, { static: true });
    S2.flush(K, { tex: 'metal', color: '#7d827d' }, { static: true });
    // ---- the transmitter hut on the mast head (a group: 8-1 hides it for the mirror's close-up) -------------------------
    const [hx0, hz0, hx1, hz1, hy] = MH.hut, HH = 3.2;
    const hut = new THREE.Group(); hut.name = 'c8:hut';
    const cladM = K.mat({ tex: 'metal', color: '#9a9e98', roughness: 0.55, metalness: 0.3 }), darkM = K.mat({ tex: 'metal', color: '#5c615d', roughness: 0.6 });
    const bx = (sx, sy, sz, x, y, z, m) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); mm.position.set(x, y, z); mm.castShadow = false; mm.receiveShadow = true; hut.add(mm); return mm; };
    const hcx = X((hx0 + hx1) / 2), hcz = Z((hz0 + hz1) / 2), W = hx1 - hx0, D = hz1 - hz0;
    bx(W + 0.2, 0.25, D + 0.2, hcx, hy - 0.14, hcz, darkM);
    bx(W, 0.12, D, hcx, hy + HH + 0.06, hcz, darkM);
    bx(W + 0.3, 0.06, D + 0.3, hcx, hy + HH + 0.15, hcz, cladM);
    bx(W, HH, 0.08, hcx, hy + HH / 2, Z(hz0), cladM);
    bx(W, HH, 0.08, hcx, hy + HH / 2, Z(hz1), cladM);
    bx(0.08, HH, D, X(hx1), hy + HH / 2, hcz, cladM);
    // the west wall with the door opening (z −0.6, 1.0 wide, 2.15 high)
    const [dx, dz] = MH.door;
    const zA = hz0, zB = dz - 0.5, zC = dz + 0.5, zD = hz1;
    bx(0.08, HH, zB - zA, X(dx), hy + HH / 2, Z((zA + zB) / 2), cladM);
    bx(0.08, HH, zD - zC, X(dx), hy + HH / 2, Z((zC + zD) / 2), cladM);
    bx(0.08, HH - 2.15, 1.0, X(dx), hy + 2.15 + (HH - 2.15) / 2, Z(dz), cladM);
    // corrugation ribs
    for (let i = 0; i < 16; i++) { const t = (i + 0.5) / 16; bx(0.03, HH - 0.1, 0.03, X(hx0 + W * t), hy + HH / 2, Z(hz1) + 0.05, darkM); bx(0.03, HH - 0.1, 0.03, X(hx0 + W * t), hy + HH / 2, Z(hz0) - 0.05, darkM); }
    K.mesh(hut, { name: 'c8m:hut' });
    // the door leaf (hinged on its north edge, swings in) and the light that spills when it opens
    const dpiv = new THREE.Group(); dpiv.position.set(X(dx), hy, Z(dz - 0.48));
    const leafM = K.mat({ tex: 'metal', color: '#6c7470', roughness: 0.5, metalness: 0.3 });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.96), leafM); leaf.position.set(-0.02, 1.05, 0.48); dpiv.add(leaf);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), K.mat({ tex: 'metal', color: '#c8cccc', roughness: 0.3, metalness: 0.8 })); handle.position.set(-0.07, 1.05, 0.85); dpiv.add(handle);
    K.mesh(dpiv, { name: 'c8m:door' });
    K.plane(X(dx) + 0.3, hy + 1.07, Z(dz), 1.0, 2.15, { color: '#f4f6f2', emissive: '#f4f6f2', emissiveIntensity: 1.6, outage: false }, { rotY: -90, name: 'c8m:doorglow' });
    K.sign('TRANSMITTER\nROOM', X(dx) - 0.05, hy + 2.55, Z(dz), 0.7, 0.3, { style: 'warning', rotY: -90 });
    K.prop('rf_sign', X(dx) - 0.05, Z(dz - 1.1), -90, { variant: 'fence', mount: 1.6, y: hy });
    K.writing('FOLLOW UP TOMORROW', X(dx) - 0.06, hy + 1.35, Z(dz + 1.25), 1.3, { rotY: -90, world: 'outage' });
    // antennas and dishes on the roof, the lightning rod and the aircraft light
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; K.box(hcx + Math.sin(a) * 1.8, hy + HH + 0.2, hcz + Math.cos(a) * 1.8, 0.32, 2.0, 0.12, { color: '#dcdad2', roughness: 0.5 }, { rot: a / D2R }); }
    K.cyl(hcx - 1.5, hy + HH + 0.2, hcz + 1.4, 0.5, 0.18, { color: '#dcdad2', roughness: 0.5 }, { rx: 70 });
    K.cyl(hcx, hy + HH + 0.2, hcz, 0.04, 5, { tex: 'metal', color: '#9aa09a' });
    K.light('led', hcx, hy + HH + 5.3, hcz, { color: '#ff2a1c', size: 0.2, blink: 1.6, duty: 0.45, halo: 9, haloOpacity: 0.85, intensity: 5 });
    // the bulkhead lamp over the door (it flickers in the Outage)
    K.box(X(dx) - 0.1, hy + 2.3, Z(dz), 0.14, 0.12, 0.26, { color: '#d9c890', emissive: '#ffd9a0', emissiveIntensity: 0.9, outage: false });
    K.light('lamp', X(dx) - 0.45, hy + 2.25, Z(dz), { color: '#ffd9a0', intensity: 2.4, distance: 6, flicker: true });
    return { hut, dpiv };
  }

  // =================================================================================================================
  // The Standard on the mast (spec §6 + §12 8-3): a custom enemy built from the engine's Standard (its clipboard
  // form, mirror face, keys, name card AIDAN) that climbs the ladders at walking pace — slower than Aidan climbs —
  // and walks the platforms. It only catches up if he stops: then "Got a sec?" (40 damage), it fades, and comes back
  // 45 s later further down. Scripts (8-1) take it over with data.c8.mode = 'script'.
  // =================================================================================================================
  const STD = { climb: 0.6, walk: 1.1, gone: 45 };
  const STD_PATH = [
    { k: 'ladder', x: 2.13, z: -1.2, yaw: -90, y0: 20, y1: 40, lad: 'c8_mast:l2' },
    { k: 'walk', y: 40, pts: [[2.4, -2.35], [0.9, -3.3], [-0.55, -3.15], [-1.2, -2.2]] },
    { k: 'ladder', x: -1.2, z: -2.13, yaw: 0, y0: 40, y1: 55.2, lad: 'c8_mast:l3' },
  ];
  Enemies.defineType('c8_std', {
    hp: Infinity, radius: 0.35, height: 2.9, tell: 'battery', downs: false, invincible: true, stompable: false, lockable: false, body: false,
    create(e, def) {
      Enemies.types.standard.create(e, def);
      const p = def.pos || [0, 0];
      e.data.c8 = { mode: def.mode || 'climb', seg: def.seg ?? 0, pi: 0, y: def.y ?? 24, t: 0 };
      e.pos.set(p[0], e.data.c8.y, p[1]);
      e.obj.rotation.y = (def.rot || 0) * D2R;
      e.placed = true;
    },
    update(e, dt, ai) {
      const C = e.data.c8;
      // scripted with an animation of its own (8-1's climb, its steps): the body is the scene's; the keys follow it
      if (C && C.mode === 'script' && C.anim) {
        if (e.actor.anim !== C.anim) e.actor.setAnim(C.anim, { blend: 0.3 });
        sloop('standard_keys', true, { id: stdKeysId(e), pos: [e.pos.x, e.pos.y + 1.6, e.pos.z], vol: 0.85 });
        return;
      }
      if (!C || C.mode === 'idle' || C.mode === 'script') { Enemies.types.standard.update(e, dt, false); return; }
      C8_stdTick(e, dt, ai);
    },
    onHit(e) { sfx('thud', { pos: [e.pos.x, e.pos.y + 1.4, e.pos.z], vol: 0.4 }); return false; },
    stun: () => false, knockdown: () => false,
    threat: (e) => !e.hidden && !(e.data.c8 && e.data.c8.mode === 'gone'),
    remove(e) { try { Enemies.types.standard.remove(e); } catch (err) { /* gone */ } },
  });
  // (the engine's own keys loop for this enemy: same id, so the climb keeps it on the body)
  const stdKeysId = (e) => 'enemy:' + e.uid + ':standard_keys';
  function C8_stdTick(e, dt, ai) {
    const C = e.data.c8, a = e.actor, P = Player.pos;
    const keysOn = C.mode !== 'gone';
    sloop('standard_keys', keysOn, { id: stdKeysId(e), pos: [e.pos.x, e.pos.y + 1.6, e.pos.z], vol: 0.85, fade: keysOn ? 0.3 : 2.5 });
    if (C.mode === 'contact') { C8_stdContactTick(e, dt); return; }
    if (C.mode === 'gone') {
      C.t -= dt;
      if (C.t <= 0) C8_stdReturn(e);
      return;
    }
    if (!ai) { if (a.anim === 'walk') a.setAnim('idle', { blend: 0.4 }); return; }
    const seg = STD_PATH[C.seg];
    if (!seg) { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 }); return; }
    if (seg.k === 'ladder') {
      e.pos.set(seg.x, C.y, seg.z); e.yaw = seg.yaw * D2R;
      if (a.anim !== 'climb') a.setAnim('climb', { blend: 0.3 });
      // contact: he's on this ladder just above it (it reaches up; it never runs)
      const onSame = Player.mode === 'ladder' && Player.ladder && Player.ladder.id === seg.lad;
      if (onSame && P.y - C.y < 2.3 && P.y - C.y > -0.5) { C8_stdContact(e); return; }
      if (C.y < seg.y1) C.y = Math.min(seg.y1, C.y + STD.climb * dt);
      else { C.seg++; C.pi = 0; if (STD_PATH[C.seg] && STD_PATH[C.seg].k === 'walk') e.pos.y = STD_PATH[C.seg].y; }
      return;
    }
    // walking a platform: toward him if he's on it, else along its path to the next ladder
    const onPlat = P && Math.abs(P.y - seg.y) < 1.2 && Player.mode !== 'ladder';
    let tx, tz;
    if (onPlat) { tx = P.x; tz = P.z; if (Math.hypot(P.x - e.pos.x, P.z - e.pos.z) < 0.95) { C8_stdContact(e); return; } }
    else { const p = seg.pts[C.pi]; if (!p) { C.seg++; const nx = STD_PATH[C.seg]; if (nx && nx.k === 'ladder') C.y = nx.y0; return; } tx = p[0]; tz = p[1]; }
    const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08 && !onPlat) { C.pi++; return; }
    const st = Math.min(d, STD.walk * dt);
    e.pos.x += (dx / (d || 1)) * st; e.pos.z += (dz / (d || 1)) * st; e.pos.y = seg.y;
    e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, Math.atan2(dx, dz)), -3 * dt, 3 * dt);
    if (a.anim !== 'walk') a.setAnim('walk', { blend: 0.3 });
  }
  function C8_stdContact(e) {
    const C = e.data.c8, a = e.actor;
    C.mode = 'contact'; C.t = 0; C.hit = false; C.said = false;
    try { Player.lock('c8std', true); } catch (err) { /* player */ }
    a.setAnim(Player.mode === 'ladder' ? 'climb' : 'idle', { blend: 0.3 });
    const sh = Player.actor && Player.actor.bones && Player.actor.bones.shoulderL ? Player.actor.bones.shoulderL.getWorldPosition(V3()) : V3(Player.pos.x, Player.pos.y + 1.4, Player.pos.z);
    q(a.gesture('reach', { hand: 'L', target: sh, dur: 3.0, hold: true }));
    try { Snd.duck(1, 3); } catch (err) { /* audio */ }
    sfx('keys', { pos: [e.pos.x, e.pos.y + 1.6, e.pos.z], vol: 0.6 });
  }
  function C8_stdContactTick(e, dt) {
    const C = e.data.c8, a = e.actor;
    C.t += dt;
    if (C.t > 0.8 && !C.said) { C.said = true; try { Enemies.say('Got a sec?', 'quiet', 2.2); } catch (err) { /* ui */ } }
    if (C.t > 1.3 && !C.hit) { C.hit = true; try { Player.damage(40, e, { force: true }); } catch (err) { /* player */ } }
    if (C.t > 2.4 && !C.sigh) { C.sigh = true; sfx('sigh', { pos: [e.pos.x, e.pos.y + 2.6, e.pos.z] }); }
    if (C.t > 3.0 && !C.gone) {
      C.gone = true;
      try { Player.lock('c8std', false); } catch (err) { /* player */ }
      a.finishGestures();
      for (let i = 0; i < 4; i++) setTimeout0(() => sfx('keys_far', { pos: [e.pos.x, e.pos.y - 3 - i * 4, e.pos.z], vol: 0.8 - i * 0.18 }), 0.2 + i * 0.9);
    }
    if (C.gone) {
      const k = clamp((C.t - 3.0) / 1.2, 0, 1);
      a.setOpacity(1 - k);
      if (k >= 1) { C.mode = 'gone'; C.t = STD.gone; Enemies.visible(e, false); C.gone = false; C.sigh = false; }
    }
  }
  // back again, further down: on L2 below platform 2 (or on the ladder below wherever he is)
  function C8_stdReturn(e) {
    const C = e.data.c8, P = Player.pos;
    if (!P) return;
    if (P.y > 44) { C.seg = 2; C.y = Math.max(40, P.y - 12); }
    else { C.seg = 0; C.y = Math.max(20.5, Math.min(P.y - 12, 34)); }
    C.mode = 'climb'; C.pi = 0;
    const seg = STD_PATH[C.seg];
    e.pos.set(seg.x, C.y, seg.z);
    Enemies.visible(e, true); e.actor.setOpacity(1);
    sfx('keys_far', { pos: [seg.x, C.y + 1.6, seg.z], vol: 0.8 });
  }
  function C8_stdStart(G, force = false) {
    if ((!force && done('cs:8-1')) || Enemies.get('c8_mast:std')) return null;
    const e = Enemies.spawn({ id: 'c8_mast:std', type: 'c8_std', pos: [STD_PATH[0].x, STD_PATH[0].z], y: 23.2, rot: -90, name: 'AIDAN', persist: false, world: 'both' });
    if (e) { e.data.c8.y = 23.2; e.pos.y = 23.2; }
    return e;
  }

  // ---- the Unread nest on L2 above platform 1: the torch wakes them; among them on the ladder, he loses the rungs --
  function C8_nestTick(dt) {
    const e = Enemies.get('c8_mast:nest');
    if (!e || e.removed || !Player.pos) return;
    const D = e.data, L = Player.ladder, y = Player.pos.y;
    const onL2 = Player.mode === 'ladder' && L && L.id === 'c8_mast:l2';
    if (onL2 && Player.torchOn && D.swarm === 'rest' && y > 19.5 && y < 23.4 && !busy()) {
      D.swarm = 'swarm'; D.stingT = Math.min(D.stingT || 1, 1);
      for (const m of D.M) { m.v.set(Math.random() * 2 - 1, Math.random() - 0.5, Math.random() * 2 - 1); m.restK = 0; }
      sfx('vibrate', { pos: [2, 22.8, -1.2], vol: 0.9 });
      setTimeout0(() => sfx('msgchime', { pos: [2, 22.8, -1.2], vol: 0.5 }), 0.4);
    }
    if (onL2 && D.swarm === 'swarm' && y > 20.3 && y < 24.4) C8.nestT += dt; else C8.nestT = Math.max(0, C8.nestT - dt);
    if (C8.nestT > 1.2 && !busy()) {
      C8.nestT = 0;
      try { Player.place(3.05, -0.45, 250); Player.damage(6, 'fall', { force: true }); Cam.shake(0.5, 0.5); Cam.snap(); } catch (err) { console.error('[c8] nest', err); }
      sfx('thud', { pos: [3, 20.3, -0.4], vol: 0.9 });
      const first = !flag('c8_nest');
      S.flags.c8_nest = true;
      Script.run(async (G) => {
        await G.think(first ? 'They\'re all over the rungs— [beat] I can\'t see my hands.' : 'Not with the light on. [beat] They come to the light.');
        if (first) { note(G, 'The ladder above platform 1. They wake to the light.', 'c8_nest'); G.prompt('Light draws them. {torch}: torch off. Stay still.', { id: 'unread_first' }); }
      }, { control: true, name: 'c8:nest' });
    }
  }

  // =================================================================================================================
  // 8C — THE MAST: base yard (x −7.5…7.5, z 2.9…10.2, gate south → c8_compound:mast), the ladders and platforms, the
  // top landing P3 and the transmitter hut. Heavy wind; phone bars flicker 0–5 at random (nothing here is sure).
  // =================================================================================================================
  // the hut door: the Yes check (the door opens onto confetti), else the transmitter room and "The Pitch"
  async function C8_enterHut(G) {
    let yes = false;
    try { yes = Game.endingFor(S) === 'yes'; } catch (e) { yes = false; }
    // (in its own non-skippable wrapper, like 8-2: a skip of 8-1 must never carry into E-YES)
    if (yes) { await G.run(async (G2) => { await G2.ending('yes'); }, { control: false, skippable: false, inheritSkip: false, name: 'c8:yes' }); return; }
    C8.pitchChain = true;
    try {
      await G.goto('c8_transmitter', 'door', { sound: 'door' });
      await G.run(async (G2) => { await G2.cutscene('8-2'); }, { control: false, skippable: false, inheritSkip: false, name: 'c8:pitch' });
    } finally { C8.pitchChain = false; }
  }
  defineRoom({
    id: 'c8_mast', name: 'THE MAST', area: 'THE MAST', chapter: 8, outdoor: true, surface: 'gravel', ambient: 'wind_heavy',
    fog: { density: 0.035 }, outageFog: { density: 0.03, color: C8_OUTFOG },
    surfaces: [{ box: [-1.45, 1.6, 1.45, 2.9], s: 'concrete' }, { box: [1.5, -1.0, 5.5, 2.85], s: 'metal' }, { box: [-1.0, -5.5, 3.0, -1.6], s: 'metal' }, { box: [-5.5, -2.6, -1.05, 1.4], s: 'metal' }],
    bounds: [-7.5, -5.5, 7.5, 10.3],
    entries: { base: [0, 8.6, 180], top: [-3.2, -0.6, -90], start: [0, 8.6, 180] },
    cameras: [
      // the base: low from the gate, looking up the lattice into the fog — and up at him on the first ten metres of rungs
      { id: 'c8_mast:yard', vol: [-7.5, 1.2, 7.5, 10.3], y: [-1, 9.5], type: 'pan', pos: [0.2, 0.9, 16.2], target: [0.4, 5.2, 2.6], fov: 50, pan: { lag: 0.3, yaw: 40, pitch: 34 } },
      // straight down the ladder from out over the drop: Aidan small against his own torchlight on the steel, the
      // compound and the town's lights far below
      { id: 'c8_mast:l1hi', vol: [0.2, 1.2, 1.8, 2.9], y: [9.5, 19.7], type: 'pan', pos: [2.4, 25.2, 6.3], target: [1.0, 12, 2.1], fov: 46, pan: { lag: 0.25, yaw: 40, pitch: 30 } },
      // platform 1, from out over the compound: the ladder going on up, the red nest glowing on its rungs
      { id: 'c8_mast:p1', vol: [1.5, -1.0, 5.5, 2.85], y: [19.5, 20.6], type: 'static', pos: [9.4, 24.2, 6.6], target: [2.6, 21.4, -0.6], fov: 'fit' },
      // looking up the ladder at the nest from the platform's corner
      { id: 'c8_mast:l2lo', vol: [1.6, -1.8, 2.7, -0.6], y: [20.6, 27], type: 'pan', pos: [5.3, 20.9, 2.6], target: [1.9, 25, -1.2], fov: 48, pan: { lag: 0.25, yaw: 30, pitch: 50 } },
      // side-on from the fog, the whole height of the climb
      { id: 'c8_mast:l2hi', vol: [1.6, -1.8, 2.7, -0.6], y: [27, 39.7], type: 'pan', pos: [8.2, 34.2, -7.4], target: [1.9, 32.4, -1.2], fov: 48, pan: { lag: 0.25, yaw: 30, pitch: 40 } },
      // platform 2, high: the landing and, below the lip, the ladder he came up
      { id: 'c8_mast:p2', vol: [-1.0, -5.5, 3.0, -1.6], y: [39.5, 40.6], type: 'static', pos: [7.6, 46.2, -9.8], target: [0.9, 40.2, -3.3], fov: 'fit' },
      // the last ladder from below and behind: the top landing and the hut hanging over him in the fog
      // (pitch 75: it tilts down far enough to keep his feet in frame on the first rungs — Cam.check's ladder samples)
      { id: 'c8_mast:l3', vol: [-1.8, -2.8, -0.6, -1.5], y: [40.6, 55.8], type: 'pan', pos: [-3.6, 43.6, -8.4], target: [-1.2, 51.5, -2.1], fov: 52, pan: { lag: 0.25, yaw: 30, pitch: 75 } },
      // the top landing: wide from out in the fog, the hut door
      { id: 'c8_mast:p3', vol: [-5.5, -2.6, -1.05, 1.4], y: [55.5, 56.6], type: 'static', pos: [-10.8, 58.6, 5.6], target: [-3.1, 56.5, -0.8], fov: 'fit' },
    ],
    spawns: [
      { id: 'c8_mast:nest', type: 'unread', pos: [2.0, -1.2], count: 42, world: 'both', cluster: [[1.79, 22.35, -1.44], [1.79, 22.85, -0.96], [1.81, 23.2, -1.2], [1.78, 22.55, -1.2], [1.8, 23.05, -1.43]] },
    ],
    build(K) {
      // ---- the base yard -----------------------------------------------------------------------------------------------
      K.floor(-7.5, 2.9, 7.5, 10.3, 'gravel', { skirt: false });
      K.floor(-1.45, 1.6, 1.45, 2.9, { tex: 'concrete', color: '#8a8a82' }, { skirt: false });
      K.box(0, -0.05, -1.2, 16, 0.05, 8.6, { tex: 'gravel', color: '#5f5b52' }, { shadow: false });
      const dt = MB(); quad(dt, [-7.5, -0.03, 10.3], [7.5, -0.03, 10.3], [7.5, -0.03, 18], [-7.5, -0.03, 18], 0.4, [0, 1, 0]);
      for (const [a, b, c, d] of [[[-7.5, -0.04, -6], [-7.5, -0.04, 18], [-30, -8, 18], [-30, -8, -6]], [[7.5, -0.04, 18], [7.5, -0.04, -6], [30, -8, -6], [30, -8, 18]], [[7.5, -0.04, -6], [-7.5, -0.04, -6], [-7.5, -8, -30], [7.5, -8, -30]]]) quad(dt, a, b, c, d, 0.3, [0, 1, 0]);
      mesh(K, dt, { tex: 'gravel', color: '#56524a' });
      C8_townLights(K, { cx: 0, cz: 0, y: -60, r0: 55, r1: 140, n: 300, seed: 813, opacity: 0.6 });
      // the enclosure fence, its gate open to the compound
      for (const [x0, z0, x1, z1] of [[-7.6, 10.35, -1.1, 10.35], [1.1, 10.35, 7.6, 10.35], [-7.6, -6, -7.6, 10.35], [7.6, 10.35, 7.6, -6]]) {
        const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0) / D2R;
        K.prop('chainlink', (x0 + x1) / 2, (z0 + z1) / 2, rot, { len: L, h: 2.1, barbed: false });
      }
      K.collider(-7.6, 10.28, -1.1, 10.42, { h: 2.3 }); K.collider(1.1, 10.28, 7.6, 10.42, { h: 2.3 });
      K.exit({ id: 'c8_mast:gate', box: [-1.1, 9.95, 1.1, 10.35], to: 'c8_compound', entry: 'mast', sound: 'steps' });
      // the compound beyond: HUT 2, the floodlight glow, the fence in the fog
      K.box(10.35, 0, 2.3, 4.5, 2.8, 4.5, { tex: 'metal', color: '#9d9888' });
      K.prop('floodlight', -6.2, 12.4, 160, { light: false });
      // ---- the mast itself ---------------------------------------------------------------------------------------------
      const mb = C8_mastBody(K, { cx: 0, cz: 0, walk: true });
      C8.hutObj = mb.hut; C8.doorObj = mb.dpiv;
      // equipment cabinets on the slab under platform 1, the cable ladder in from the compound
      for (const [x, z] of [[2.4, 1.0], [3.6, 1.0], [4.8, 1.0]]) { K.box(x, 0, z, 0.9, 1.9, 0.7, { tex: 'metal', color: '#6f7a78', roughness: 0.5 }); K.light('led', x - 0.3, 1.6, z + 0.36, { color: x > 4 ? '#ff2a1c' : '#3dff9a', blink: 0.7 + x * 0.1, size: 0.01 }); }
      K.box(3.6, -0.02, 1.0, 4.2, 0.15, 1.6, { tex: 'concrete', color: '#8a8a82' });
      K.writing('DID YOU CHECK', 3.6, 1.2, 1.37, 1.6, { rotY: 0, style: 'receipt', world: 'outage' });
      for (const x of [7.4, 5.5]) K.box(x, 0, 2.1, 0.07, 2.5, 0.07, { tex: 'metal', color: '#8f9791' });
      K.box(6.4, 2.5, 2.1, 2.3, 0.05, 0.4, { tex: 'metal', color: '#9aa09a' }); K.box(6.4, 2.56, 2.1, 2.4, 0.09, 0.26, { color: '#161818' });
      // a work tube zip-tied under the cable tray: the base of the mast is the last lit thing on the way up
      K.light('fluoro', 6.4, 2.46, 2.1, { color: '#cfe6df', intensity: 7, distance: 10, flicker: true, len: 1.2 });
      // the climb register on its post, a harness on the leg, a hard hat on the footing
      K.box(-1.95, 0, 3.35, 0.06, 1.3, 0.06, { tex: 'metal', color: '#8f9791' });
      K.box(-1.95, 1.2, 3.39, 0.26, 0.36, 0.02, { color: '#5a4a36', roughness: 0.8 });
      K.plane(-1.95, 1.37, 3.405, 0.22, 0.3, registerTex(), {});
      K.examine(-1.95, 1.35, 3.75, async (G) => {
        await G.think('The climb register. Initials, times, reasons. M. J. M.');
        await G.think('The last line\'s filled in already. [beat] AIDAN. The reason\'s left blank.');
      }, { id: 'c8m:register', r: 1.2 });
      K.box(-3.05, 0.9, 2.95, 0.22, 0.9, 0.08, { color: '#d86a1c', roughness: 0.8 });
      K.box(-3.05, 1.25, 2.95, 0.3, 0.05, 0.1, { color: '#1a1a1a' });
      K.examine(-3.05, 1.1, 3.35, ['A harness on a hook. Somebody hung it up and went home.', 'I don\'t know how to put it on. [beat] I\'m going up anyway.'], { id: 'c8m:harness', r: 1.2 });
      K.sphere(3.05, 0.42, 3.05, 0.14, { color: '#e8e4d8', roughness: 0.4 }, { scale: [1, 0.75, 1.1] });
      K.sign('CLIMBING — AUTHORISED\nPERSONS ONLY\nHARNESS REQUIRED', 1.0, 2.25, 2.45, 0.8, 0.46, { style: 'warning' });
      K.examine(1.7, 1.6, 2.9, ['Twenty metres to the first platform. [beat] Then another twenty. Then more.', 'The rungs are wet. Cold enough to hurt.'], { id: 'c8m:ladder', r: 1.2 });
      K.examine(3.6, 1.2, 1.9, ['Equipment cabinets under the platform. Everything humming, nothing connecting.', 'A label: "FEEDER — DO NOT ISOLATE". Somebody\'s isolated it.'], { id: 'c8m:cab', r: 1.3 });
      K.examine(-5, 1.0, 9.6, 'The compound\'s back through the gate. [beat] There\'s nowhere else to go but up.', { id: 'c8m:back', r: 1.4 });
      // ---- the platforms: things to see, sticker12, the view ------------------------------------------------------------
      K.examine(4.9, 21.1, 2.4, ['The compound\'s a grey square down there. The huts are the size of matchboxes.', 'And past it, under the fog, the town. [beat] Little orange lights.'], { id: 'c8m:p1view', r: 1.4 });
      K.examine(2.2, 21.4, -0.6, async (G) => {
        const e = G.enemy('c8_mast:nest');
        if (e && !e.removed && e.data.swarm === 'rest') await G.think('Something\'s nested on the rungs above me. Red. Pulsing. [beat] Like a lock screen full of messages.');
        else await G.think('They\'re awake. [beat] The light brings them.');
      }, { id: 'c8m:nest', r: 1.3 });
      K.examine(2.8, 41.1, -5.0, ['Forty metres. The wind\'s trying to take my phone.', 'The town\'s lights down there. Everyone asleep, or waiting.'], { id: 'c8m:p2view', r: 1.4 });
      K.sticker('sticker12', -0.92, 40.05, -5.44, 0, { size: 0.06 });
      // Outage: receipt paper caught in the lattice, tethers hanging off the platforms
      K.outageOnly(() => {
        for (const [x, y, z] of [[5.4, 20, 0.5], [-0.9, 40, -4.5], [-5.4, 56, 0.6], [-2.2, 12, 2.6], [2.6, 32, 1.4]]) K.prop('receipt_strip', x, z, x * 30, { ceil: y + 0.02, len: 1.6 });
        for (const [x, y, z] of [[1.6, 20, 2.7], [2.9, 40, -5.4], [-5.4, 56, -2.4]]) K.prop('tether_hanging', x, z, 0, { ceil: y - 0.05, len: 2.2 });
        K.dress('receipts', [-6.8, 3.2, 6.8, 9.8], 16, { seed: 8131 });
      });
      // the hut door, from the top landing (after 8-1: the transmitter room)
      K.interact(MH.door[0] - 0.4, 57.1, MH.door[1], async (G) => {
        if (!done('cs:8-1')) { await G.cutscene('8-1'); return; }
        await C8_enterHut(G);
      }, { id: 'c8_mast:hutdoor', r: 1.3 });
      // ---- triggers: platform 2 → the Standard below; the top landing → 8-1 ---------------------------------------------
      K.trigger([-1.0, -5.5, 3.0, -1.6], async (G) => {
        if (done('cs:8-1') || flag('c8_std')) { if (!done('cs:8-1')) C8_stdStart(G); return; }
        G.set('c8_std', true);
        C8_stdStart(G);
        await G.wait(0.8);
        G.sfx('keys_far', { pos: [2.1, 24.5, -1.2], vol: 0.95 });
        await G.wait(1.4);
        await G.think('Keys. [beat] Below me.');
        note(G, 'Keep climbing. Don\'t stop.', 'c8_climb');
      }, { id: 'c8_mast:p2', once: false, when: () => Player.pos && Player.pos.y > 39.5 && Player.pos.y < 40.8 && Player.mode !== 'ladder' && !Enemies.get('c8_mast:std') });
      K.trigger([-5.5, -2.6, -1.05, 1.4], (G) => G.cutscene('8-1'), { id: 'c8_mast:top', once: false, when: () => !done('cs:8-1') && Player.pos && Player.pos.y > 55.5 && Player.mode !== 'ladder' });
    },
    onUpdate(dt) {
      C8_ambient(0, C8_OUTAMB);
      const y = Player.pos ? Player.pos.y : 0;
      C8.fogTo = (S.outage ? 0.032 : 0.036) - clamp(y / 56, 0, 1) * 0.008;
      C8_fogStep(dt);
      C8_laterTick(dt);
      C8_nestTick(dt);
      // the wind: gusts that grow as he climbs
      C8.gustT = (C8.gustT ?? 4) - dt;
      if (C8.gustT <= 0) { C8.gustT = Math.max(2.5, 9 - y * 0.1) + Math.random() * 5; sfx('wind_gust', { vol: 0.5 + clamp(y / 56, 0, 1) * 0.5 }); }
    },
    onLeave() { C8_ambientOff(); C8.fogTo = null; C8.hutObj = null; C8.doorObj = null; },
    async onEnter(G) {
      if (S.chapter === 8 && !S.outage) G.setOutage(true);
      // nothing here is sure: the bars flicker between 0 and 5 at random (cleared on leaving)
      G.bars('flicker', { room: true });
      if (flag('c8_std') && !done('cs:8-1') && Player.pos && Player.pos.y > 30) C8_stdStart(G);
      if (G.once('c8:mastIn')) { await G.wait(1.2); await G.think('Sixty metres. [beat] Come up where it\'s clearer.'); }
    },
  });

  // =================================================================================================================
  // 8D — THE TRANSMITTER ROOM. Outside: a 6 × 6 m steel hut. Inside: an impossibly large 30 × 20 m sales floor
  // (x 0–30, z 0–20, −z north): glossy white floor, white plinths down both sides, spotlights, the gleaming counter
  // (x 10–20, z 3.1–4.3) under a light box, tall windows east and west full of fog and the town's faint lights. The
  // door (south wall, x 15) is the hut's plain steel door; from inside it won't open.
  // =================================================================================================================
  const TR = { W: 30, D: 20, H: 4.6, counter: [10, 3.1, 20, 4.3], phone: [10.4, 12.6], thrown: [18.4, 12.6], centre: [15, 11] };
  const GLOSS = (c, r = 0.16) => ({ color: c, roughness: r, metalness: 0.05, outage: false });
  // the phone that skitters across the floor in 8-3 (its own screen canvas)
  function C8_phoneScreen() {
    if (!C8.phoneTex) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      C8.phoneTex = new THREE.CanvasTexture(c); C8.phoneTex.colorSpace = THREE.SRGBColorSpace; C8.phoneTex.userData.shared = true;
      C8.phoneCanvas = c;
    }
    return C8.phoneTex;
  }
  function C8_paintPhone(st = {}) {
    C8_phoneScreen();
    const c = C8.phoneCanvas.getContext('2d'), w = 128, h = 256;
    c.fillStyle = '#010504'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f9d94'; c.font = `bold 11px ${FN.mono}`; c.fillText('--:--', 8, 16);
    const bars = st.bars ?? 0;
    for (let i = 0; i < 5; i++) { c.fillStyle = i < bars ? '#38d2c6' : '#0f3a36'; c.fillRect(84 + i * 7, 16 - (i + 1) * 2.6, 5, (i + 1) * 2.6); }
    c.textAlign = 'center';
    if (st.mode === 'calling') {
      c.fillStyle = '#38d2c6'; c.font = `16px ${FN.sans}`; c.fillText('Calling...', w / 2, 70);
      c.font = `bold 12px ${FN.mono}`; c.fillText('CASE 118-2231', w / 2, 100);
      c.fillStyle = '#8fd8d0'; c.font = `11px ${FN.mono}`; c.fillText('ACCT 4471-0932', w / 2, 118);
      c.fillStyle = '#b3261e'; c.fillRect(34, 206, 60, 24); c.fillStyle = '#fff'; c.font = `bold 12px ${FN.sans}`; c.fillText('END', w / 2, 223);
    } else {
      c.fillStyle = '#38d2c6'; c.font = `bold 15px ${FN.mono}`; c.fillText('CASE', w / 2, 62); c.fillText('118-2231', w / 2, 82);
      c.fillStyle = '#8fd8d0'; c.font = `12px ${FN.mono}`; c.fillText('—', w / 2, 102); c.fillText('FOLLOW UP:', w / 2, 124);
      c.fillStyle = '#e8c21a'; c.font = `bold 14px ${FN.mono}`; c.fillText('TOMORROW', w / 2, 144);
      c.fillStyle = '#2fbf5a'; c.fillRect(24, 196, 80, 32); c.fillStyle = '#031008'; c.font = `bold 16px ${FN.sans}`; c.fillText('CALL', w / 2, 218);
    }
    c.textAlign = 'left';
    C8.phoneTex.needsUpdate = true;
  }
  function C8_phoneBuild(K) {
    const g = new THREE.Group(); g.name = 'c8t:phone';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.011, 0.148), K.mat({ color: '#141617', roughness: 0.3, metalness: 0.3, outage: false }));
    body.position.y = 0.0055; g.add(body);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.136), new THREE.MeshBasicMaterial({ map: C8_phoneScreen(), toneMapped: false }));
    scr.rotation.x = -Math.PI / 2; scr.position.y = 0.0115; g.add(scr);
    // the screen's glow on the polished floor: it reads from across the room
    try { Render.halo([0, 0.04, 0], { parent: g, color: '#8dffc0', size: 0.55, opacity: 0.5 }); } catch (e) { /* render */ }
    g.position.set(TR.phone[0], 0, TR.phone[1]); g.visible = false;
    K.mesh(g, { name: 'c8t:phone' });
    C8_paintPhone({});
    return g;
  }
  // the Closer's tablet (its own canvas: the contract and the signature line)
  function C8_tabletTex() {
    if (!C8.tabTex) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 340;
      C8.tabTex = new THREE.CanvasTexture(c); C8.tabTex.colorSpace = THREE.SRGBColorSpace; C8.tabTex.userData.shared = true;
      C8.tabCanvas = c;
    }
    return C8.tabTex;
  }
  function C8_signTablet(k) { C8_tabletTex(); contractPaint(C8.tabCanvas.getContext('2d'), 256, 340, k); C8.tabTex.needsUpdate = true; }

  // ---- the Closer: Aidan, perfected (spec §6): 2.5 m, a pressed uniform, flawless hair, a gleaming badge, the smile to
  // the ears with too many perfect teeth; the right hand a long silver pen fused into the bone, the left a tablet with a
  // contract. Damage splits the uniform: layers of signed contracts beneath, ink running from the tears. ----------------
  function C8_closerCreate(e, def) {
    const a = Rig.human({
      height: 2.5, build: 'slim', gender: 'm', age: 22, skin: '#e0b699', seed: 22,
      hair: { style: 'neat', color: '#221a14' },
      face: { eyes: '#4b3a2a', brows: '#2a2019', browThick: 1, bags: 0, stubble: 0, blush: 1.3 },
      top: { kind: 'polo', color: '#1aa7a2', logo: true, fresh: true },
      pants: { kind: 'work', color: '#101012' }, shoes: { kind: 'dress', color: '#0b0b0c', sole: '#050505' },
      lanyard: { color: '#0f7a77', card: 'AIDAN', role: 'TOP PERFORMER', pins: 5 }, badge: 'AIDAN — #1',
      style: { upright: 1, armSwing: 0.55, stepLen: 1.1 }, habits: [], posture: 1, idleLife: false, walkSpeed: 1.2,
    });
    a.idleLife = false;
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.5; e.height = 2.5; e.hp = e.maxHp = def.hp ?? 300;
    a.expr('smile_huge');
    const chrome = new THREE.MeshStandardMaterial({ color: '#dfe3e4', roughness: 0.14, metalness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: '#e0b699', roughness: 0.55 });
    const inkM = new THREE.MeshStandardMaterial({ color: '#0d1233', roughness: 0.3, metalness: 0.2 });
    e.data.mats = [chrome, skin, inkM];
    // the pen: fused into the right hand, running on past the fingers (its nib a point of ink)
    const hand = a.bones.handR, fore = a.bones.foreArmR;
    const pen = new THREE.Group(); pen.name = 'closer:pen';
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.66, 12), chrome); barrel.position.y = -0.36; pen.add(barrel);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.012), chrome); clip.position.set(0.02, -0.14, 0); pen.add(clip);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 10), chrome); nib.rotation.x = Math.PI; nib.position.y = -0.725; pen.add(nib);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), inkM); tip.position.y = -0.76; pen.add(tip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), skin); collar.position.y = -0.04; pen.add(collar);
    hand.add(pen);
    // silver running up under the skin of the forearm, where it's fused
    if (fore) for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2 + i * 0.05, 5), chrome); v.position.set(-0.02 + i * 0.02, -0.16 - i * 0.02, 0.035); v.rotation.z = (i - 1) * 0.12; fore.add(v); }
    e.data.pen = pen;
    // the tablet with the contract
    C8_signTablet(0);
    a.hold('L', 'tablet', { tex: C8_tabletTex(), pose: 'tablet_read' });
    // the tears (hidden; revealed as it's hurt): decals on the chest, back, arms and thighs
    const tears = [];
    const put = (bone, x, y, z, ry, s, i) => {
      if (!bone) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * s, 0.32 * s), new THREE.MeshStandardMaterial({ map: tearTex(i), transparent: true, alphaTest: 0.08, roughness: 0.6, depthWrite: false }));
      m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; m.visible = false; m.castShadow = false;
      bone.add(m); tears.push(m);
    };
    const B = a.bones, hs = a.height / 1.75;
    put(B.chest, 0.06 * hs, 0.02 * hs, 0.135 * hs, 0, hs * 0.9, 0);
    put(B.spine, -0.05 * hs, 0.04 * hs, 0.125 * hs, 0, hs * 0.8, 1);
    put(B.chest, -0.04 * hs, 0.0, -0.13 * hs, Math.PI, hs * 0.9, 2);
    put(B.upperArmL, 0.045 * hs, -0.12 * hs, 0.02 * hs, Math.PI / 2, hs * 0.55, 3);
    put(B.thighR, -0.06 * hs, -0.15 * hs, 0.02 * hs, -Math.PI / 2, hs * 0.6, 4);
    put(B.upperArmR, -0.045 * hs, -0.1 * hs, 0.02 * hs, -Math.PI / 2, hs * 0.55, 5);
    e.data.tears = tears;
    e.data.st = 'idle'; e.data.cd = 1.5; e.data.t = 0;
  }
  function C8_closerTears(e) {
    const T = e.data.tears || [], frac = e.hp / (e.maxHp || 300);
    const n = frac > 0.9 ? 0 : frac > 0.78 ? 1 : frac > 0.66 ? 2 : frac > 0.54 ? 3 : frac > 0.42 ? 4 : frac > 0.33 ? 5 : 6;
    T.forEach((m, i) => { m.visible = i < n; });
  }
  Enemies.defineType('closer', {
    hp: 300, radius: 0.5, height: 2.5, downs: false, stompable: false, lockable: true, tell: 'plain', steps: { stride: 1.1, vol: 0.9, heavy: true },
    threat: (e) => !!(C8.fight && C8.fight.phase >= 1 && C8.fight.phase < 4),
    create: (e, def) => C8_closerCreate(e, def),
    hitbox: (e) => [{ x: e.pos.x, z: e.pos.z, r: 0.55, y0: e.pos.y, y1: e.pos.y + 2.5 }],
    stun(e, sec) { e.data.stunT = Math.min(1.2, sec || 1); return false; },
    knockdown: () => false,
    onHit(e, dmg, weapon) { C8_closerHit(e, dmg, weapon); return false; },
    update: (e, dt, ai) => C8_closerUpdate(e, dt, ai),
    remove: (e) => { for (const m of e.data.mats || []) { try { m.dispose(); } catch (err) { /* gone */ } } if (C8.closer === e) C8.closer = null; },
  });
  const barks = () => (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.closer_barks) && DIALOGUE.closer_barks.length ? DIALOGUE.closer_barks : ['Sign here.', 'Initial there.', "It'll be fine.", 'Any other questions?']);
  const pitchLines = () => (typeof DIALOGUE !== 'undefined' && Array.isArray(DIALOGUE.closer_pitch) && DIALOGUE.closer_pitch.length ? DIALOGUE.closer_pitch : []);
  // lines while the fight runs (never block the loop)
  function C8_bgSay(who, line) { try { Script.run(async (G) => { await G.say(who, line); }, { control: true, name: 'c8:say' }); } catch (e) { /* script */ } try { if (C8.closer && C8.closer.actor) C8.closer.actor.talk(Math.min(3, 0.4 + line.length * 0.05)); } catch (e) { /* rig */ } }
  function C8_closerHit(e, dmg, weapon) {
    const F = C8.fight;
    if (!F || F.phase === 3 || F.phase >= 4) { sfx('thud', { pos: [e.pos.x, 1.4, e.pos.z], vol: 0.4 }); return; }
    if (F.phase === 1) { F.attacked = true; return; }
    e.hp = Math.max(0, e.hp - (dmg || 0));
    e.data.flinchT = 0.25;
    if (e.data.st === 'windup' && e.data.atk === 'slash') { e.data.st = 'recover'; e.data.t = 0; }
    sfx('paper_tear', { pos: [e.pos.x, 1.6, e.pos.z], vol: 0.8 });
    sfx('hit', { pos: [e.pos.x, 1.4, e.pos.z], vol: 0.6 });
    C8_closerTears(e);
    try { q(e.actor.gesture('flinch')); } catch (err) { /* rig */ }
  }
  // Player hit by the Closer: the damage, and a signature on the lens; three signatures and the contract is signed
  function C8_signHit(e, dmg, o = {}) {
    const F = C8.fight;
    if (!F || Player.dead) return;
    Player.damage(dmg, e, { force: true, push: o.push ?? 1.0, from: e.pos, knock: !!o.knock });
    if (Player.dead) return;
    F.sigs = (F.sigs | 0) + 1;
    try { UI.stamp('signature', { count: F.sigs }); } catch (err) { /* ui */ }
    if (F.sigs >= 3 && !F.restartT) F.restartT = 1.8;
  }
  function C8_closerMove(e, tx, tz, sp, dt, stop = 0.2) {
    const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
    if (d <= stop) return false;
    const st = Math.min(d - stop, sp * dt);
    const r = World.move(e.pos, (dx / d) * st, (dz / d) * st, 0.45, { ignore: (c) => !!c.enemy });
    e.pos.set(r.x, r.y, r.z);
    return true;
  }
  function C8_face(e, x, z, rate, dt) { e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, Math.atan2(x - e.pos.x, z - e.pos.z)), -rate * dt, rate * dt); }
  function C8_closerUpdate(e, dt, ai) {
    const F = C8.fight, a = e.actor, D = e.data;
    if (D.flinchT > 0) D.flinchT -= dt;
    if (D.stunT > 0) D.stunT -= dt;
    if (!F || !ai || !Player.pos || Player.dead) { if (a.anim === 'walk') a.setAnim('idle', { blend: 0.4 }); return; }
    const P = Player.pos, d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
    // ---- Phase 1, The Pitch: it circles him, facing him, talking ----
    if (F.phase === 1) {
      F.ang = (F.ang ?? Math.atan2(e.pos.x - P.x, e.pos.z - P.z)) + dt * 0.24;
      const R = 3.8, tx = P.x + Math.sin(F.ang) * R, tz = P.z + Math.cos(F.ang) * R;
      const moving = C8_closerMove(e, tx, tz, 1.0, dt, 0.15);
      C8_face(e, P.x, P.z, 2.5, dt);
      const an = moving ? 'walk' : 'idle';
      if (a.anim !== an) a.setAnim(an, { blend: 0.4 });
      return;
    }
    // ---- Phase 3, The Callback: it looms over him as he crawls, and swipes ----
    if (F.phase === 3) {
      const [px, pz] = TR.phone, bx = P.x - px, bz = P.z - pz, bl = Math.hypot(bx, bz) || 1;
      const hx = P.x + (bx / bl) * 1.3 + (bz / bl) * 0.9, hz = P.z + (bz / bl) * 1.3 - (bx / bl) * 0.9;
      const moving = C8_closerMove(e, hx, hz, 1.6, dt, 0.25);
      C8_face(e, P.x, P.z, 3, dt);
      D.swipeT = (D.swipeT ?? 2.2) - dt;
      if (D.st === 'swipe') {
        D.t += dt;
        if (D.t >= 0.6 && !D.hit) {
          D.hit = true;
          if (d < 2.8) {
            Player.damage(10, e, { force: true, minHealth: 1 });
            try { Player.knockback([px, 0, pz], 1.0); } catch (err) { /* player */ }
            sfx('swing', { pos: [e.pos.x, 1.8, e.pos.z], heavy: true });
          }
        }
        if (D.t >= 1.1) { D.st = 'idle'; D.swipeT = 2.3 + Math.random() * 0.9; }
      } else if (D.swipeT <= 0) {
        D.st = 'swipe'; D.t = 0; D.hit = false;
        q(a.gesture('swing', { hand: 'R', dur: 0.95 }));
        sfx('whoosh', { pos: [e.pos.x, 2, e.pos.z], vol: 0.6 });
        if (Math.random() < 0.5) try { Snd.play('murmur_closer', { pos: [e.pos.x, 2.3, e.pos.z], vol: 0.5, dur: 1.2 }); } catch (err) { /* audio */ }
      }
      const an = moving ? 'walk' : 'idle';
      if (a.anim !== an && D.st !== 'swipe') a.setAnim(an, { blend: 0.4 });
      return;
    }
    if (F.phase !== 2) return;
    // ---- Phase 2, The Close ----
    if (F.restartT) return;                                      // the contract's signed: it stands back, smoothing its uniform
    if (D.stunT > 0) { if (a.anim !== 'stagger') a.setAnim('stagger', { blend: 0.2 }); return; }
    D.cd -= dt;
    switch (D.st) {
      case 'windup': {
        D.t += dt;
        C8_face(e, P.x, P.z, D.atk === 'lunge' ? 1.5 : 3.0, dt);
        if (D.atk === 'slash' && D.t >= 0.55) {
          D.st = 'recover'; D.t = 0;
          const ang = Math.abs(U.angleDiff(e.yaw, Math.atan2(P.x - e.pos.x, P.z - e.pos.z)));
          sfx('swing', { pos: [e.pos.x, 1.8, e.pos.z], heavy: true });
          if (d <= 2.45 && ang < 58 * D2R && Math.abs(P.y - e.pos.y) < 1.3) C8_signHit(e, 20, { push: 1.2 });
        } else if (D.atk === 'lunge' && D.t >= 0.75) {
          D.st = 'lunge'; D.t = 0; D.hit = false; D.dir = e.yaw;
          sfx('whoosh', { pos: [e.pos.x, 1.6, e.pos.z], vol: 0.9 });
        }
        break;
      }
      case 'lunge': {
        D.t += dt;
        const sp = 7.5 * dt, r = World.move(e.pos, Math.sin(D.dir) * sp, Math.cos(D.dir) * sp, 0.45, { ignore: (c) => !!c.enemy });
        const blocked = Math.hypot(r.x - e.pos.x, r.z - e.pos.z) < sp * 0.4;
        e.pos.set(r.x, r.y, r.z);
        if (a.anim !== 'run') a.setAnim('run', { blend: 0.15 });
        if (!D.hit && Math.hypot(P.x - e.pos.x, P.z - e.pos.z) < 1.25) { D.hit = true; C8_signHit(e, 20, { push: 1.8, knock: true }); }
        if (D.t >= 0.65 || blocked) { D.st = 'recover'; D.t = 0; a.setAnim('idle', { blend: 0.3 }); }
        break;
      }
      case 'recover': {
        D.t += dt;
        if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.3 });
        if (D.t >= 0.9) { D.st = 'move'; D.cd = 1.1 + Math.random() * 0.9; }
        break;
      }
      default: {
        C8_face(e, P.x, P.z, 3.2, dt);
        if (D.cd <= 0 && d <= 2.3) { D.st = 'windup'; D.atk = 'slash'; D.t = 0; q(a.gesture('swing', { hand: 'R', dur: 0.95 })); sfx('penclick', { pos: [e.pos.x, 1.9, e.pos.z] }); break; }
        if (D.cd <= 0 && d > 3.2 && d < 7 && Math.random() < dt * 0.8) { D.st = 'windup'; D.atk = 'lunge'; D.t = 0; q(a.gesture('reach', { hand: 'R', target: Player.actor, dur: 1.2 })); sfx('penclick', { pos: [e.pos.x, 1.9, e.pos.z] }); break; }
        const moving = d > 1.9 && C8_closerMove(e, P.x, P.z, 1.35, dt, 1.8);
        const an = moving ? 'walk' : 'idle';
        if (a.anim !== an) a.setAnim(an, { blend: 0.35 });
      }
    }
  }
  // the sweeping spotlight (Phase 2): a hard white disc crossing the floor; standing in it is a signature
  function C8_beamTick(dt) {
    const F = C8.fight, B = C8.beam;
    if (!B) return;
    const on = !!(F && F.phase === 2 && !F.restartT);
    B.t += dt;
    const x = 15 + Math.sin(B.t * 0.33) * 10.5, z = 11 + Math.sin(B.t * 0.57 + 1.1) * 6.5;
    B.x = x; B.z = z;
    B.cone.visible = on; B.disc.visible = on;
    const L = World.light && World.light('c8t:beam');
    if (L) { L.on(on); if (on) L.set({ target: [x, 0, z] }); }
    if (!on) return;
    const o = B.o, dx = x - o[0], dy = -o[1], dz = z - o[2], len = Math.hypot(dx, dy, dz);
    B.cone.position.set((o[0] + x) / 2, o[1] / 2, (o[2] + z) / 2);
    B.cone.scale.set(1, len, 1);
    B.cone.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(-dx / len, -dy / len, -dz / len));
    B.disc.position.set(x, 0.02, z);
    B.cd = Math.max(0, (B.cd || 0) - dt);
    const P = Player.pos;
    if (P && !Player.dead && B.cd <= 0 && Math.hypot(P.x - x, P.z - z) < 1.2 && C8.closer) { B.cd = 2.4; sfx('stamp', { vol: 0.5 }); C8_signHit(C8.closer, 15, { push: 0.4 }); }
  }
  function C8_closerSpawn(o = {}) {
    let e = Enemies.get('c8_transmitter:closer');
    if (e && !e.removed) return e;
    e = Enemies.spawn({ id: 'c8_transmitter:closer', type: 'closer', pos: o.pos || [15, 1.9], rot: o.rot ?? 180, persist: false, world: 'both' });
    C8.closer = e;
    return e;
  }

  // ---- BOSS 'closer': Phase 1 The Pitch (→ 'deal'), Phase 2 The Close (→ 'callback' at 30 %) -------------------------------
  defineBoss('closer', {
    async run(G) {
      const e = C8_closerSpawn();
      if (!e) return 'callback';
      const F = C8.fight = { phase: 1, t: 0, line: 0, hold: 0, sigs: 0, attacked: false, restartT: 0, barkT: 4 };
      e.ai = true;
      G.control(true);
      try { Player.setTorch(false); } catch (err) { /* torch */ }
      const lines = pitchLines();
      let result = null;
      try {
        // Phase 1: it circles him and talks, a line every 8 s; "[Hold E] Lower your hands" the whole time
        await G.loop((dt) => {
          F.t += dt;
          if (F.t >= 1.2 + F.line * 8 && F.line < lines.length) { C8_bgSay('THE CLOSER', lines[F.line]); F.line++; }
          const down = !!(Input.down && Input.down('interact'));
          F.hold = down ? F.hold + dt : Math.max(0, F.hold - dt * 1.5);
          try { UI.holdPrompt('[Hold {interact}] Lower your hands', F.hold / 3); } catch (err) { /* ui */ }
          // the slow orbit: the camera circles the two of them
          const P = Player.pos;
          C8.orbitT += dt * 0.09;
          const mx = (P.x + e.pos.x) / 2, mz = (P.z + e.pos.z) / 2;
          const cx = clamp(mx + Math.sin(C8.orbitT) * 7.5, 1.2, 28.8), cz = clamp(mz + Math.cos(C8.orbitT) * 7.5, 1.2, 18.8);
          G.cam({ pos: [cx, 3.3, cz], target: [mx, 1.35, mz], fov: 46 });
          if (F.hold >= 3) { result = 'deal'; return true; }
          if (F.attacked || Player.attackState) return true;
          if (F.t >= 60) return true;
          return false;
        });
        try { UI.holdPrompt(null); } catch (err) { /* ui */ }
        G.camRelease();
        if (result === 'deal') return 'deal';
        // Phase 2: The Close
        F.phase = 2; F.t = 0;
        C8_bgSay('THE CLOSER', barks()[0]);
        await G.loop((dt) => {
          F.t += dt;
          C8_beamTick(dt);
          if (F.restartT) {
            F.restartT -= dt;
            if (F.restartT <= 0) {
              // the contract is signed: the phase restarts. The uniform smooths itself whole again.
              F.restartT = 0; F.sigs = 0; e.hp = e.maxHp; C8_closerTears(e);
              try { UI.stamp(null); } catch (err) { /* ui */ }
              q(e.actor.gesture('smooth_uniform'));
              C8_bgSay('THE CLOSER', barks()[3] || 'Any other questions?');
              e.data.st = 'recover'; e.data.t = 0;
            }
          }
          F.barkT -= dt;
          if (F.barkT <= 0) { F.barkT = 7 + Math.random() * 4; const b = barks(); C8_bgSay('THE CLOSER', b[Math.floor(Math.random() * Math.min(3, b.length))]); }
          return e.hp <= e.maxHp * 0.3;
        });
        return 'callback';
      } finally {
        try { UI.holdPrompt(null); } catch (err) { /* ui */ }
        if (C8.beam) { C8.beam.cone.visible = false; C8.beam.disc.visible = false; }
        try { const L = World.light('c8t:beam'); if (L) L.on(false); } catch (err) { /* world */ }
      }
    },
  });
  // ---- BOSS 'closer_call': Phase 3 (after 8-3) — crawl to the phone at 0.8 m/s; swipes knock him back; E presses Call ----
  defineBoss('closer_call', {
    async run(G) {
      const e = C8.closer || C8_closerSpawn();
      const F = C8.fight = C8.fight || { phase: 3 };
      F.phase = 3;
      if (e) { e.ai = true; e.data.st = 'idle'; e.data.swipeT = 2.4; }
      G.control(true);
      try { Player.crawl(true); } catch (err) { /* player */ }
      const [px, pz] = TR.phone;
      let called = false;
      if (G.once('c8:crawlPrompt')) G.prompt('Crawl to the phone. {interact} to call.', { id: 'c8_crawl' });
      try {
        await G.loop(() => {
          const P = Player.pos;
          if (!P) return false;
          if (S.health < 1) S.health = 1;
          const d = Math.hypot(P.x - px, P.z - pz);
          // behind him and off to the side, looking along the floor at the phone: Aidan on his belly in the middle of the
          // frame, the Closer rearing over him on the far side (never between the lens and him), the phone's glow ahead
          const bx = (P.x - px) / (Math.hypot(P.x - px, P.z - pz) || 1), bz = (P.z - pz) / (Math.hypot(P.x - px, P.z - pz) || 1);
          G.cam({ pos: [P.x + bx * 3.4 - bz * 1.8, 2.0, P.z + bz * 3.4 + bx * 1.8], target: [lerp(P.x, px, 0.4), 0.35, lerp(P.z, pz, 0.4)], fov: 52 });
          if (d < 1.05) {
            try { UI.holdPrompt('{interact} Call', 0); } catch (err) { /* ui */ }
            if (Input.pressed && Input.pressed('interact')) { try { Input.consume('interact'); } catch (err) { /* input */ } called = true; return true; }
          } else { try { UI.holdPrompt(null); } catch (err) { /* ui */ } }
          return false;
        });
      } finally {
        try { UI.holdPrompt(null); } catch (err) { /* ui */ }
        try { Player.crawl(false); } catch (err) { /* player */ }
        G.camRelease();
      }
      return called ? 'called' : 'aborted';
    },
  });
  // after the fight: the deal, or the callback and the call (each scene in its own wrapper so a skip of one never
  // carries into the next)
  // the Closer as a script actor (G.actor takes the enemy itself)
  function C8_clActor(G, e) { return e && e.actor ? G.actor(e) : null; }
  function C8_clRelease() { /* (nothing to undo: no alias is registered any more) */ }
  async function C8_after(G, r) {
    const run = (id) => G.run(async (G2) => { await G2.cutscene(id); }, { control: false, skippable: false, inheritSkip: false, name: 'c8:' + id });
    if (r === 'deal') {
      await run('8-2A');
      G.set('acceptedDeal', true);
      C8_clRelease();
      await G.ending('tomorrow');
      return;
    }
    await run('8-3');
    const r2 = await G.boss('closer_call');
    if (r2 !== 'called') return;
    await run('8-4');
    let name = 'coverage';
    try { name = Game.endingFor(S); } catch (e) { /* game */ }
    if (name === 'yes') { await G.ending('yes'); return; }
    await run(name === 'connected' ? 'E-C1' : name === 'tomorrow' ? 'E-FT0' : 'E-OC0');
    C8_clRelease();
    await G.ending(name);
  }

  defineRoom({
    id: 'c8_transmitter', name: 'TRANSMITTER ROOM', area: 'THE MAST', chapter: 8, outdoor: false, surface: 'vinyl', ambient: 'store',
    fog: { density: 0.012, color: '#cdd5d3' }, outageFog: { density: 0.012, color: '#c6cfcd' },
    env: { grade: 'hospital', ambient: ['#e2ebe8', 0.95], sheets: 0 },
    bounds: [0, 0, TR.W, TR.D],
    entries: { door: [15, 18.9, 180], start: [15, 18.9, 180] },
    cameras: [
      // low wide from the door: the whole floor running away to the counter and the light box
      { id: 'c8_transmitter:door', vol: [9.6, 5.2, 20.4, 13.6], type: 'static', pos: [15, 0.85, 19.4], target: [15, 2.1, 3.4], fov: 'fit' },
      // high over the counter
      { id: 'c8_transmitter:counter', vol: [8, 0.3, 22, 5.2], type: 'static', pos: [15, 3.95, 10.5], target: [15, 0.7, 2.4], fov: 'fit' },
      // the four corners of the floor, each from the far high corner (the plinths in the foreground; between the ceiling
      // panels, not under them)
      { id: 'c8_transmitter:nw', vol: [0.3, 0.3, 9.6, 10.4], type: 'pan', pos: [24, 3.7, 19.3], target: [5, 0.8, 5.2], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 30 } },
      { id: 'c8_transmitter:ne', vol: [20.4, 0.3, 29.7, 10.4], type: 'pan', pos: [6, 3.7, 19.3], target: [25, 0.8, 5.2], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 30 } },
      { id: 'c8_transmitter:sw', vol: [0.3, 10.4, 9.6, 19.7], type: 'pan', pos: [24, 3.7, 0.7], target: [5, 0.8, 15], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 30 } },
      { id: 'c8_transmitter:se', vol: [20.4, 10.4, 29.7, 19.7], type: 'pan', pos: [6, 3.7, 0.7], target: [25, 0.8, 15], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 30 } },
      // the door behind him: from the counter end of the floor, looking back at the only thing in here that's real
      { id: 'c8_transmitter:south', vol: [9.6, 13.6, 20.4, 19.7], type: 'static', pos: [15, 3.9, 4.8], target: [15, 1.0, 18.8], fov: 'fit' },
    ],
    spawns: [],
    build(K) {
      const W = TR.W, D = TR.D, H = TR.H;
      const wallM = GLOSS('#eef0ec', 0.3), trimM = GLOSS('#d9dcd8', 0.25);
      // ---- the floor (glossy white vinyl, a faint tile grid), the ceiling, the walls ----------------------------------
      K.floor(0, 0, W, D, GLOSS('#e3e6e2', 0.12));
      for (let x = 2; x < W; x += 2) K.box(x, 0.001, D / 2, 0.012, 0.002, D, GLOSS('#cfd3cf', 0.2), { shadow: false });
      for (let z = 2; z < D; z += 2) K.box(W / 2, 0.001, z, W, 0.002, 0.012, GLOSS('#cfd3cf', 0.2), { shadow: false });
      K.ceiling(0, 0, W, D, H, GLOSS('#f2f3f0', 0.5));
      for (let x = 3; x < W; x += 6) for (let z = 3; z < D; z += 5) K.box(x, H - 0.03, z, 1.6, 0.02, 0.6, { color: '#ffffff', emissive: '#f4fbf8', emissiveIntensity: 1.5, outage: false }, { shadow: false });
      const win = (n, at, L) => { const o = []; for (let i = 0; i < n; i++) o.push({ at: at + i * (L - 2 * at) / Math.max(1, n - 1), w: 2.6, h: 3.0, sill: 0.6, glass: true }); return o; };
      K.wall(0, D, 0, 0, H, wallM, { openings: win(4, 3.5, D) });
      K.wall(W, 0, W, D, H, wallM, { openings: win(4, 3.5, D) });
      K.wall(0, 0, W, 0, H, wallM, { openings: [{ at: 4.5, w: 5, h: 1.1, sill: 3.1, glass: true }, { at: 25.5, w: 5, h: 1.1, sill: 3.1, glass: true }] });
      K.wall(W, D, 0, D, H, wallM, { openings: [{ at: 15, w: 1.0, h: 2.15 }] });
      // beyond the glass: fog, and the town's faint lights far below
      for (const [x, rot] of [[-2.6, 90], [W + 2.6, -90]]) K.plane(x, H / 2, D / 2, D + 6, H + 3, fogWinTex(), { rotY: rot, emissive: 0.85 });
      K.plane(W / 2, 3.6, -2.4, W + 6, 2.5, fogWinTex(), { rotY: 0, emissive: 0.8 });
      C8_townLights(K, { cx: 15, cz: 10, y: -70, r0: 40, r1: 120, n: 180, seed: 814, opacity: 0.45 });
      // skirting, a trim line
      for (const [x0, z0, x1, z1] of [[0.05, 0.05, W - 0.05, 0.05], [0.05, D - 0.05, W - 0.05, D - 0.05]]) K.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.abs(x1 - x0) || 0.04, 0.12, Math.abs(z1 - z0) || 0.04, trimM, { shadow: false });
      // ---- the door: the hut's plain steel door, set in all this white (it won't open from this side) ------------------
      K.door({ id: 'c8_transmitter:door', x: 15, z: D, rot: 0, w: 0.95, style: 'metal', locked: true, lockMsg: 'It won\'t open from this side.', mapMark: false });
      K.examine(15.7, 1.3, D - 0.5, ['The hut\'s door. Grey steel, a dent by the handle. [beat] The only thing in here that\'s real.', 'It won\'t open from this side.'], { id: 'c8t:door', r: 1.2, when: () => !C8.fight });
      // ---- the counter under the light box ----------------------------------------------------------------------------
      const [cx0, cz0, cx1, cz1] = TR.counter;
      K.box((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2, cx1 - cx0, 1.0, cz1 - cz0, GLOSS('#0f9f9a', 0.22), { collide: true });
      K.box((cx0 + cx1) / 2, 1.0, (cz0 + cz1) / 2, cx1 - cx0 + 0.12, 0.05, cz1 - cz0 + 0.14, GLOSS('#fafbf8', 0.1));
      K.box((cx0 + cx1) / 2, 0.93, cz1 + 0.012, cx1 - cx0, 0.03, 0.02, { color: '#eafcf8', emissive: '#eafcf8', emissiveIntensity: 1.6, outage: false }, { shadow: false });
      K.plane((cx0 + cx1) / 2, 0.55, cz1 + 0.012, 2.6, 0.62, bannerTex('ctr', [['HERE TO HELP!', 64, '#ffffff', 170]], { w: 1024, h: 256, bg: '#0f9f9a', wordmark: true, wm: '#ffcc00' }), { rotY: 0 });
      for (const x of [11.2, 13.8, 16.2, 18.8]) { K.box(x, 1.05, 3.55, 0.36, 0.02, 0.24, GLOSS('#1a1c1d', 0.2)); K.box(x, 1.07, 3.55, 0.3, 0.004, 0.2, { color: '#8fe6dc', emissive: '#8fe6dc', emissiveIntensity: 0.9, outage: false }, { shadow: false }); }
      for (let i = 0; i < 3; i++) K.prop('contract_stack', 19.4, 3.45 + i * 0.001, 12 + i * 20, { h: 0.18 + i * 0.1, y: 1.05 });
      K.box(10.7, 1.05, 3.6, 0.12, 0.14, 0.12, GLOSS('#fafaf6', 0.2));
      K.box(12.5, 1.05, 3.55, 0.3, 0.07, 0.3, GLOSS('#d3a13a', 0.3));
      // the light box and the leaderboard behind the counter
      K.plane(15, 2.9, 0.1, 9.6, 2.0, bannerTex('lb', [["IT'LL BE FINE.", 88, '#0f9f9a', 160]], { w: 1024, h: 256, bg: '#fbfcfa', wordmark: true, wm: '#0f9f9a' }), { emissive: 0.9 });
      K.prop('leaderboard', 15, 0.1, 0, { variant: 'store', rows: [['AIDAN', '#1'], ['AIDAN', '#1'], ['AIDAN', '#1'], ['AIDAN', '#1'], ['AIDAN', '#1'], ['AIDAN', '#1']], mount: 1.45, w: 2.2, h: 1.3 });
      K.prop('accessory_wall', 5.2, 0.1, 0, { len: 7.2 });
      K.prop('accessory_wall', 24.8, 0.1, 0, { len: 7.2 });
      K.prop('demo_table', 6.4, 17.2, 90, { n: 6, lit: true, time: '9:00' });
      K.prop('demo_table', 23.6, 17.2, -90, { n: 6, lit: true, time: '9:00' });
      // white plinths down both sides, each with a phone under its own light
      for (const x of [4.2, 25.8]) for (const z of [6.2, 10.6, 15]) {
        K.prop('plinth', x, z, 0, { h: 1.05, w: 0.6 });
        K.box(x, 1.05, z, 0.075, 0.012, 0.15, GLOSS('#141617', 0.25), { rot: 20 });
        K.box(x, 1.063, z, 0.064, 0.002, 0.135, { color: '#9ff1e8', emissive: '#9ff1e8', emissiveIntensity: 1.2, outage: false }, { rot: 20, shadow: false });
      }
      K.prop('plinth', 8.3, 4.9, 0, { h: 1.4, w: 0.55 }); K.prop('plinth', 21.7, 4.9, 0, { h: 1.4, w: 0.55 });
      // the customer's chair facing the counter, a blue cardigan over it
      K.prop('cardigan_chair', 15, 6.0, 180, { color: '#3f6fb5' });
      K.examine(15, 0.9, 6.5, ['A chair for the customer. A blue cardigan over the back of it.', 'Hand-knitted. [beat] She sat right here. She sat right here and asked me.'], { id: 'c8t:chair', r: 1.2, when: () => !C8.fight });
      // employees of the month, both sides of the door
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
      months.forEach((m, i) => { const x = i < 4 ? 8.6 + i * 1.2 : 17.8 + (i - 4) * 1.2; K.plane(x, 1.75, D - 0.03, 0.62, 0.82, eotmTex(m), { rotY: 180 }); });
      K.examine(9.8, 1.6, D - 0.7, ['Employee of the month. Every month. [beat] Me.', 'I\'m smiling in every one. I don\'t remember any of them being taken.'], { id: 'c8t:eotm', r: 1.5, when: () => !C8.fight });
      // spotlights on stands in the corners (their glow; the room's own lights do the work)
      for (const [x, z, rot] of [[1.6, 1.6, 135], [W - 1.6, 1.6, -135], [1.6, D - 1.6, 45], [W - 1.6, D - 1.6, -45]]) K.prop('spotlight', x, z, rot, { light: false, h: 2.4, target: [0, 0, 5] });
      K.examine(25.8, 1.2, 15.5, ['A phone on a plinth, lit like it\'s in a museum.', 'The screen says 9:00. [beat] Opening time. It\'s always opening time.'], { id: 'c8t:plinth', r: 1.3, when: () => !C8.fight });
      K.examine(15, 1.3, 4.8, ['The counter. White, spotless, gleaming. [beat] Everything I ever wanted a shop to be.', 'A stack of contracts at the end. Signed. All of them signed.'], { id: 'c8t:counter', r: 1.4, when: () => !C8.fight });
      K.examine(0.6, 1.6, 10, ['Windows. Fog, and a long way down, the town.', 'We\'re sixty metres up a mast. [beat] This room doesn\'t fit.'], { id: 'c8t:winW', r: 1.4, when: () => !C8.fight });
      K.examine(15, 2.3, 1.0, '"It\'ll be fine." [beat] In letters a metre high. In my handwriting, made into a font.', { id: 'c8t:box', r: 2.4, when: () => !C8.fight });
      // ---- lights: five cool whites (the pool), the key light on the counter, the sweeping beam (Phase 2) -------------
      for (const [x, z] of [[7.5, 6.5], [22.5, 6.5], [7.5, 15], [22.5, 15]]) K.light('point', x, 4.2, z, { color: '#eef8f5', intensity: 7.5, distance: 17 });
      K.light('point', 15, 3.7, 2.8, { color: '#fff8ea', intensity: 5, distance: 9 });
      K.light('spot', 15, 4.45, 10, { name: 'c8t:beam', target: [15, 0, 11], angle: 13, intensity: 70, distance: 16, on: false, color: '#ffffff' });
      // the beam's visible cone and its disc on the floor
      const coneG = new THREE.CylinderGeometry(0.08, 1.2, 1, 20, 1, true); coneG.translate(0, -0.5, 0);
      const coneM = new THREE.MeshBasicMaterial({ color: '#fbfff8', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const cone = new THREE.Mesh(coneG, coneM); cone.visible = false; cone.renderOrder = 5;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.visible = false;
      K.mesh(cone, { name: 'c8t:cone' }); K.mesh(disc, { name: 'c8t:disc' });
      C8.beam = { cone, disc, o: [15, 4.45, 10], t: 0, x: 15, z: 11, cd: 0 };
      // the floor phone (8-3), and its call
      C8_phoneBuild(K);
    },
    onUpdate() {
      // (lit room: the torch isn't needed.) The Closer's floor is the one place the Outage never reaches: white, glossy,
      // perfect — the kit's props keep their Fog-world materials here (S.outage stays true; only the dissolve is held off)
      try { if (Tex.outage > 0 && !World.outageBusy) Tex.setOutage(0); } catch (e) { /* tex */ }
    },
    onLeave() { C8_clRelease(); C8.beam = null; C8.fight = null; C8.closer = null; try { UI.stamp(null); UI.holdPrompt(null); } catch (e) { /* ui */ } },
    async onEnter(G) {
      G.bars(0);
      if (C8.pitchChain) return;
      // a reload into the fight (the autosave before it): straight back into the Pitch
      if (S.chapter !== 8 || !done('cs:8-2') || flag('acceptedDeal') || flag('c8_rang')) return;
      C8_fightStart({
        intro: async (G2) => {
          const e = C8_closerSpawn({ pos: [15, 8.5], rot: 0 });
          if (e) e.ai = false;
          await G2.wait(0.8);
          await G2.say('THE CLOSER', 'Hi there! [beat] What brings you in today?');
        },
      });
    },
  });

  // =================================================================================================================
  // CUTSCENE 8-1 "The Mirror" (c8_mast, the top landing P3)
  // =================================================================================================================
  const stdFace = (e) => { const M = e && e.data && e.data.mirror; if (M && M.face) return M.face.getWorldPosition(V3()); return e ? V3(e.pos.x, e.pos.y + 2.85, e.pos.z) : V3(); };
  defineCutscene('8-1', async (G) => {
    const A = G.aidan;
    G.set('c8_top', true);
    if (A.raw) A.raw.idleLife = false;
    try { Player.setTorch(true); } catch (err) { /* torch */ }
    note(G, 'The mast. Climb it.', 'c8_climb', { done: true });
    // the Standard: taken over, seven metres down the last ladder
    let e = Enemies.get('c8_mast:std') || C8_stdStart(G, true);
    const SC = e ? e.data.c8 : null;
    if (e) {
      SC.mode = 'script'; SC.anim = 'climb';
      Enemies.visible(e, true); e.actor.setOpacity(1);
      e.data.straight = null; e.data.straightK = 0; e.actor.P.headTilt = 90;
      try { Enemies.clipboard(e, true); } catch (err) { /* enemies */ }
      e.pos.set(-1.2, 49.6, -2.13); e.yaw = 0;
    }
    A.place(-2.62, -1.62, 104); A.pose('idle');
    A.look([-1.2, 52, -2.1]); if (A.raw) { A.raw.eyes('down'); A.raw.expr('scared'); }
    // 1. SHOT — the top platform, looking down the ladder. The Standard climbs slowly, keys chiming.
    G.cam({ pos: [-2.95, 57.9, -3.45], target: [-1.2, 50.2, -2.0], fov: 50, to: { pos: [-2.9, 57.75, -3.38], fov: 44 }, dur: 7 });
    G.sfx('wind_gust', { vol: 0.8 });
    {
      let t = 0;
      await G.loop((dt) => { t += dt; if (e) e.pos.y = lerp(49.6, 53.2, clamp(t / 6.2, 0, 1)); return t >= 6.4; });
    }
    // 2. SHOT — low. It reaches the platform and unfolds to its full height in the wind. Aidan backs up against the door.
    G.cam({ pos: [-5.05, 56.32, 0.95], target: [-1.9, 57.9, -1.35], fov: 54, to: { pos: [-5.0, 56.3, 0.85], fov: 52 }, dur: 8 });
    const back = { t: 0 };
    {
      let t = 0;
      const a0 = [-2.62, -1.62], a1 = [-1.62, -0.5];
      await G.loop((dt) => {
        t += dt;
        if (e) {
          if (t < 1.9) { e.pos.y = lerp(53.2, 56.0, U.ease.inOut(clamp(t / 1.9, 0, 1))); }
          else if (t < 3.5) { SC.anim = 'walk'; const k = U.ease.inOut(clamp((t - 1.9) / 1.6, 0, 1)); e.pos.set(lerp(-1.2, -2.95, k), 56, lerp(-2.13, -1.2, k)); e.yaw = U.lerp(-1.2, 1.2, k); }
          else SC.anim = null;
        }
        // he backs away, toward the door, never taking his eyes off it
        const k = U.ease.inOut(clamp((t - 0.6) / 3.2, 0, 1));
        if (A.raw) { A.raw.root.position.set(lerp(a0[0], a1[0], k), 56, lerp(a0[1], a1[1], k)); if (e) A.raw.root.rotation.y = Math.atan2(e.pos.x - A.raw.root.position.x, e.pos.z - A.raw.root.position.z); }
        if (e) A.look([e.pos.x, e.pos.y + 2.2, e.pos.z]);
        back.t = t;
        return t >= 4.1;
      });
    }
    if (e) { SC.anim = null; e.pos.set(-2.95, 56, -1.2); e.yaw = Math.atan2(-1.62 + 2.95, -0.5 + 1.2); }
    A.place(-1.62, -0.5, e ? Math.atan2(e.pos.x + 1.62, e.pos.z + 0.5) / D2R : -100);
    if (A.raw && A.raw.bones) q(A.gesture('flinch'));
    // it unfolds
    if (e) e.data.straight = { from: 0, to: 1, t: 0, dur: 2.8 };
    G.sfx('wind_gust', { vol: 1.0 }); G.sfx('keys', { pos: [-2.95, 57.6, -1.2], vol: 0.7 });
    await G.wait(3.2);
    // 3. SHOT — it lowers the clipboard. The mirror face. Aidan's reflection, torchlit, exhausted.
    const face = stdFace(e);
    {
      // over his shoulder (the platform side, clear of the hut wall), up at the face
      const H = headAt(A), ux = face.x - H.x, uz = face.z - H.z, ul = Math.hypot(ux, uz) || 1, fx = ux / ul, fz = uz / ul;
      const sx = -fz, sz = fx, side = sz > 0 ? 1 : -1;
      const c0 = [H.x - fx * 0.36 + sx * side * 0.34, H.y + 0.1, H.z - fz * 0.36 + sz * side * 0.34];
      c0[0] = Math.min(c0[0], -1.12);
      G.cam({ pos: c0, target: [face.x, face.y - 0.05, face.z], fov: 44, to: { pos: [c0[0] - fx * 0.06, c0[1] + 0.02, c0[2] - fz * 0.06], fov: 40 }, dur: 6 });
    }
    A.look(face); if (A.raw) { A.raw.eyes('at', face); A.raw.expr('tired'); }
    await G.wait(1.0);
    if (e) { try { Enemies.clipboard(e, false); } catch (err) { /* enemies */ } }
    G.sfx('penclick', { pos: [face.x, face.y, face.z] });
    await G.wait(2.4);
    // 4. SHOT — close on the reflection: Aidan's face, and behind him in the glass, the fogged town. A long hold.
    if (C8.hutObj) C8.hutObj.visible = false;
    {
      const M = e && e.data.mirror, fw = stdFace(e);
      const n = M && M.face ? V3(0, 0, 1).transformDirection(M.face.matrixWorld) : V3(Math.sin(e ? e.yaw : 0), 0, Math.cos(e ? e.yaw : 0));
      const cp = fw.clone().addScaledVector(n, 0.8).add(V3(0.08, -0.06, 0));
      G.cam({ pos: [cp.x, cp.y, cp.z], target: [fw.x, fw.y, fw.z], fov: 34, to: { pos: [cp.x - n.x * 0.12, cp.y, cp.z - n.z * 0.12], fov: 30 }, dur: 9 });
    }
    G.sfx('wind_gust', { vol: 0.9 });
    await G.wait(4.2);
    await G.say('AIDAN', '...Yeah. [beat] I know.', { italic: false });
    await G.wait(1.2);
    // 5. SHOT — wide. The Standard straightens, turns aside, and fades into the fog. Its keys chime away to silence.
    if (C8.hutObj) C8.hutObj.visible = true;
    G.cam({ pos: [-11.6, 58.5, 5.4], target: [-2.8, 57.4, -1.0], fov: 38, to: { pos: [-11.3, 58.45, 5.1], fov: 36 }, dur: 9 });
    if (e) {
      try { Enemies.clipboard(e, true); } catch (err) { /* enemies */ }
      let t = 0; const y0 = e.yaw;
      await G.loop((dt) => {
        t += dt;
        const k = clamp(t / 1.4, 0, 1);
        e.yaw = lerp(y0, -2.2, U.ease.inOut(k));
        if (t > 1.2 && t < 3.2) { SC.anim = 'walk'; const kk = clamp((t - 1.2) / 2, 0, 1); e.pos.set(lerp(-2.95, -4.6, kk), 56, lerp(-1.2, -2.2, kk)); }
        else if (t >= 3.2) SC.anim = null;
        e.actor.setOpacity(1 - clamp((t - 1.6) / 3.2, 0, 1));
        return t >= 5.0;
      });
    }
    for (let i = 0; i < 4; i++) { G.sfx('keys_far', { pos: [-5 - i * 5, 56 - i * 3, -2.5 - i * 3], vol: 0.8 - i * 0.18 }); await G.wait(0.8); }
    if (e && !e.removed) e.remove();
    A.look(null);
    await G.wait(1.2);
    // 6. Aidan opens the transmitter room door.
    G.cam({ pos: [-3.5, 57.55, 0.75], target: [-1.0, 57.1, -0.6], fov: 42 });
    await A.turn(90, 0.8);
    if (A.raw) { A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    q(A.gesture('reach', { hand: 'L', target: [-1.05, 57.05, -0.25] }));
    await G.wait(0.5);
    G.sfx('handle', { pos: [-1.0, 57, -0.6] });
    {
      const d = C8.doorObj; let t = 0;
      await G.loop((dt) => { t += dt; if (d) d.rotation.y = 1.45 * U.ease.out(clamp(t / 1.3, 0, 1)); return t >= 1.3; });
      if (d) d.rotation.y = 1.45;
    }
    G.sfx('chime', { vol: 0.8 });
    await G.post({ white: 0.35, dur: 1.2 });
    // state (plain statements)
    if (e && !e.removed) e.remove();
    if (C8.hutObj) C8.hutObj.visible = true;
    if (A.raw) A.raw.idleLife = true;
    await C8_enterHut(G);
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 8-2 "The Pitch" (c8_transmitter) → BOSS 'closer'
  // =================================================================================================================
  const talk = (e, s) => { try { if (e && e.actor) e.actor.talk(s); } catch (err) { /* rig */ } };
  defineCutscene('8-2', async (G) => {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    try { Player.setTorch(false); } catch (err) { /* torch */ }
    G.bars(0);
    const e = C8_closerSpawn({ pos: [15.4, 1.95], rot: 180 });
    const Cl = e ? C8_clActor(G, e) : null;
    if (e) { e.ai = false; e.actor.setAnim('idle', { blend: 0 }); e.actor.expr('smile_huge'); }
    A.place(15, 18.9, 180); A.pose('idle');
    // 1. SHOT — the sales floor, impossibly large: white plinths, spotlights, a gleaming counter; beyond the windows,
    //    only fog and the faint lights of the town
    G.cam({ pos: [13.3, 0.95, 19.45], target: [15, 2.1, 2.4], fov: 50, to: { pos: [13.7, 1.05, 17.7], target: [15, 2.2, 2.4], fov: 44 }, dur: 10 });
    G.sfx('chime', { vol: 0.7 });
    await G.wait(1.0);
    const walkIn = q(A.walkTo(15, 16.2, { speed: 0.6 }));
    await G.wait(4.6);
    await walkIn;
    A.look([15, 2.2, 2]);
    // 2. SHOT — behind the counter, back turned, a very tall figure in a perfect uniform straightens a display. It turns.
    G.cam({ pos: [12.2, 1.55, 9.2], target: [15.3, 1.95, 1.9], fov: 36, to: { pos: [12.4, 1.55, 8.9], fov: 34 }, dur: 7 });
    if (Cl) { q(Cl.gesture('reach', { hand: 'L', target: [15.5, 2.3, 0.25], dur: 1.8 })); }
    await G.wait(2.0);
    if (Cl) q(Cl.gesture('smooth_uniform'));
    await G.wait(1.3);
    if (Cl) await Cl.turn(0, 1.5);
    // Aidan's face, perfected, the smile running to the ears
    if (e) {
      const H = headAt(e.actor);
      G.cam({ pos: [H.x - 0.25, H.y - 0.05, H.z + 1.25], target: [H.x, H.y - 0.02, H.z], fov: 30, to: { pos: [H.x - 0.2, H.y - 0.04, H.z + 1.05], fov: 27 }, dur: 7 });
    }
    await G.wait(1.4);
    talk(e, 2.4);
    await G.say('THE CLOSER', 'Hi there! [beat] What brings you in today?');
    // (reverse) Aidan
    G.cam({ pos: rel(A, 1.25, 0.3, -0.05), target: headAt(A).toArray(), fov: 32 });
    if (A.raw) { A.raw.expr('scared'); A.raw.eyes('away', e ? e.actor : null); }
    await G.wait(0.9);
    await G.say('AIDAN', '...No.');
    // it comes round the counter, unhurried
    G.cam({ pos: [9.6, 1.25, 12.8], target: [16.5, 1.9, 5.0], fov: 44 });
    if (Cl) q(Cl.walkTo([[20.9, 2.3], [20.6, 6.2], [17.6, 9.6]], { speed: 1.05 }));
    await G.wait(1.6);
    talk(e, 3.2);
    await G.say('THE CLOSER', 'Relax. I\'m you. [beat] The good version. The one who closes.');
    await G.wait(0.6);
    // state (plain statements)
    if (e) { e.pos.set(17.6, 0, 9.6); e.yaw = Math.atan2(15 - 17.6, 16.2 - 9.6); e.actor.setAnim('idle', { blend: 0.3 }); }
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    A.look(null);
    note(G, 'It\'s me. [beat] It wants me to sign.', 'c8_closer');
    G.camRelease();
    // the autosave before the fight: a reload lands in the transmitter room and the Pitch starts again (onEnter)
    S.done['cs:8-2'] = true;
    try { G.autosave(); } catch (err) { /* save */ }
    // 3. Phase 1 begins — as its own script, so the scenes that led here (8-1, the door) let go of the letterbox
    C8_fightStart();
  }, { letterbox: true, skippable: true });
  // the fight and everything after it, detached from the scenes that started it
  function C8_fightStart(o = {}) {
    if (C8.fightRun) return C8.fightRun;
    C8.fightRun = Script.run(async (G) => {
      try {
        if (o.intro) await o.intro(G);
        const r = await G.boss('closer');
        await C8_after(G, r);
      } finally { C8.fightRun = null; }
    }, { control: false, name: 'c8:fight', persist: true });
    return C8.fightRun;
  }

  // =================================================================================================================
  // CUTSCENE 8-2A "Signed" (Phase 1 → [Hold E] Lower your hands, 3 s) → Follow Up Tomorrow
  // =================================================================================================================
  defineCutscene('8-2A', async (G) => {
    const A = G.aidan, e = C8.closer || C8_closerSpawn(), Cl = e ? C8_clActor(G, e) : null;
    if (e) e.ai = false;
    if (C8.fight) C8.fight.phase = 5;
    if (A.raw) A.raw.idleLife = false;
    const P = Player.pos, yaw = Player.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (e) { e.pos.set(P.x + fx * 1.7, 0, P.z + fz * 1.7); e.yaw = Math.atan2(-fx, -fz); e.actor.setAnim('idle', { blend: 0.2 }); }
    // 1. SHOT — side-on: Aidan lowers his hands
    G.cam({ pos: [P.x + fz * 3.6 + fx * 0.9, 1.55, P.z - fx * 3.6 + fz * 0.9], target: [P.x + fx * 0.85, 1.4, P.z + fz * 0.85], fov: 42 });
    if (A.raw) { A.raw.expr('tired'); A.raw.eyes('down'); }
    q(A.gesture('hands_up', { hold: true }));
    await G.wait(1.3);
    if (A.raw) A.raw.finishGestures();
    G.sfx('breath', { vol: 0.4 });
    await G.wait(1.4);
    // 2. The Closer kneels and places the pen in his hand.
    if (Cl) { Cl.pose('kneel_one'); q(Cl.gesture('offer', { hand: 'R', target: A })); }
    await G.wait(1.4);
    q(A.gesture('reach', { hand: 'L', target: e ? [e.pos.x - fx * 0.9, 1.0, e.pos.z - fz * 0.9] : [P.x, 1, P.z] }));
    await G.wait(0.8);
    if (e && e.data.pen) e.data.pen.visible = false;
    A.hold('L', 'pen');
    G.sfx('penclick', { vol: 0.8 });
    await G.wait(0.6);
    // 3. He signs.
    if (e) { e.actor.hold('L', 'tablet', { tex: C8_tabletTex(), pose: 'offer' }); }
    await G.wait(0.5);
    {
      const tb = e && e.actor.held && e.actor.held.L ? e.actor.held.L.getWorldPosition(V3()) : V3(P.x + fx, 1.1, P.z + fz);
      G.cam({ pos: [tb.x - fx * 0.5 + fz * 0.15, tb.y + 0.55, tb.z - fz * 0.5 - fx * 0.15], target: [tb.x, tb.y, tb.z], fov: 34 });
    }
    q(A.gesture('reach', { hand: 'L', target: e ? [e.pos.x - fx * 0.6, 1.05, e.pos.z - fz * 0.6] : [P.x, 1, P.z], dur: 2.6 }));
    G.sfx('scribble', { dur: 2.2 });
    {
      let t = 0;
      await G.loop((dt) => { t += dt; C8_signTablet(clamp(t / 2.3, 0, 1)); return t >= 2.6; });
      C8_signTablet(1);
    }
    G.music('tomorrow', { clipped: true });
    await G.wait(0.8);
    // 4. The last shot: Aidan looks up, and the Closer's smile is on his face.
    G.cam({ pos: rel(A, 0.72, 0.05, 0.0), target: headAt(A).toArray(), fov: 30, to: { pos: rel(A, 0.6, 0.04, 0.0), fov: 27 }, dur: 6 });
    if (A.raw) { A.raw.eyes('ahead'); A.raw.expr('neutral'); }
    A.look(rel(A, 2, 0, 0.25));
    await G.wait(1.4);
    if (A.raw) A.raw.expr('smile_huge');
    await G.wait(2.6);
    await G.fade(1, 1.4);
    // state (plain statements)
    G.set('acceptedDeal', true);
    C8_signTablet(1);
    if (A.raw) A.raw.idleLife = true;
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 8-3 "The Callback" (at 30 % HP)
  // =================================================================================================================
  defineCutscene('8-3', async (G) => {
    const A = G.aidan, e = C8.closer || C8_closerSpawn(), Cl = e ? C8_clActor(G, e) : null;
    if (e) e.ai = false;
    if (C8.fight) C8.fight.phase = 2.5;
    try { UI.stamp(null); UI.holdPrompt(null); } catch (err) { /* ui */ }
    if (A.raw) A.raw.idleLife = false;
    const [tx, tz] = TR.thrown, [px, pz] = TR.phone;
    A.place(tx, tz, -90); A.pose('idle');
    if (e) { e.pos.set(tx + 1.25, 0, tz + 0.35); e.yaw = Math.atan2(tx - e.pos.x, tz - e.pos.z); e.actor.setAnim('idle', { blend: 0 }); }
    // 1. SHOT — the Closer's tablet shatters. Aidan is thrown to the floor.
    const tb = e && e.actor.held && e.actor.held.L ? e.actor.held.L.getWorldPosition(V3()) : V3(tx + 1, 1.3, tz);
    G.cam({ pos: [tb.x - 0.9, tb.y + 0.2, tb.z + 1.1], target: [tb.x, tb.y, tb.z], fov: 38 });
    await G.wait(0.6);
    G.sfx('shatter', { pos: [tb.x, tb.y, tb.z], vol: 1.0 });
    G.shake(0.5, 0.6);
    if (e) e.actor.hold('L', null);
    // shards
    const shards = [];
    if (World.build && World.build.group) {
      const sm = new THREE.MeshBasicMaterial({ color: '#dfe9ec', transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.05 + Math.random() * 0.06, 0.04 + Math.random() * 0.05), sm); s.position.copy(tb); World.build.group.add(s); shards.push({ s, v: V3((Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 4), r: V3(Math.random() * 9, Math.random() * 9, 0) }); }
      let t = 0;
      await G.loop((dt) => { t += dt; for (const sh of shards) { sh.v.y -= 9.8 * dt; sh.s.position.addScaledVector(sh.v, dt); if (sh.s.position.y < 0.01) { sh.s.position.y = 0.01; sh.v.set(sh.v.x * 0.3, 0, sh.v.z * 0.3); } sh.s.rotation.x += sh.r.x * dt; sh.s.rotation.y += sh.r.y * dt; } return t >= 0.9; });
    }
    A.pose('lie'); G.sfx('thud', { pos: [tx, 0.2, tz], vol: 1.0 }); G.sfx('hurt', { pos: [tx, 1, tz], heavy: true });
    // the bar goes out of his hand with the fall (he crawls with nothing; the call scenes after it show no weapon)
    G.equip(null);
    G.sfx('hit', { pos: [tx - 0.9, 0.1, tz + 0.6], vol: 0.5 });
    // His phone skitters across the polished floor and stops face up, 8 m away.
    A.hold('R', null);
    const ph = World.obj && World.obj('c8t:phone');
    C8_paintPhone({});
    // floor level beyond where it will stop: it comes sliding at us, Aidan down in the distance behind it
    G.cam({ pos: [px - 1.05, 0.2, pz + 0.42], target: [lerp(px, tx, 0.45), 0.2, lerp(pz, tz, 0.45)], fov: 40 });
    if (ph) {
      ph.visible = true; ph.position.set(tx - 0.4, 0, tz); ph.rotation.set(0, 0, 0);
      G.sfx('skitter', { pos: [tx - 1, 0.1, tz], vol: 0.8 });
      let t = 0;
      await G.loop((dt) => { t += dt; const k = U.ease.out(clamp(t / 1.5, 0, 1)); ph.position.set(lerp(tx - 0.4, px, k), 0, lerp(tz, pz, k)); ph.rotation.y = k * 7.5; return t >= 1.6; });
      ph.position.set(px, 0, pz); ph.rotation.y = 7.5;
    }
    // (insert) "CASE 118-2231 — FOLLOW UP: TOMORROW", a green CALL button
    G.cam({ pos: [px + 0.04, 0.34, pz + 0.16], target: [px, 0.01, pz], fov: 30, to: { pos: [px + 0.03, 0.29, pz + 0.13], fov: 28 }, dur: 4 });
    G.music('tomorrow', { clipped: true });
    await G.wait(2.6);
    // 2. SHOT — low. The Closer rears over him, shrieking in layered voices.
    if (e) {
      const H = headAt(e.actor);
      G.cam({ pos: [tx - 0.55, 0.3, tz + 0.95], target: [H.x, H.y - 0.3, H.z], fov: 50, to: { pos: [tx - 0.5, 0.28, tz + 0.9], fov: 46 }, dur: 5 });
      q(Cl.gesture('hands_up', { dur: 2.6 }));
      try { Snd.play('murmur_closer', { pos: [H.x, H.y, H.z], vol: 1.0 }); } catch (err) { /* audio */ }
      talk(e, 3.2);
    }
    G.shake(0.3, 1.5);
    await G.say('THE CLOSER', 'It\'ll be fine! It\'ll be fine! IT\'LL BE FINE!');
    // state (plain statements)
    for (const sh of shards) { if (sh.s.parent) sh.s.parent.remove(sh.s); sh.s.geometry.dispose(); }
    if (ph) { ph.visible = true; ph.position.set(px, 0, pz); }
    if (e) e.actor.hold('L', null);
    A.pose('crawl');
    if (A.raw) A.raw.idleLife = true;
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 8-4 "Ringing"
  // =================================================================================================================
  defineCutscene('8-4', async (G) => {
    const A = G.aidan, e = C8.closer, Cl = e ? C8_clActor(G, e) : null;
    if (e) e.ai = false;
    if (C8.fight) C8.fight.phase = 4;
    if (A.raw) A.raw.idleLife = false;
    const [px, pz] = TR.phone, ph = World.obj && World.obj('c8t:phone');
    // 1. SHOT — close on the phone screen: "Calling...". One bar. Two. The old double-burst ring.
    G.cam({ pos: [px + 0.03, 0.3, pz + 0.14], target: [px, 0.01, pz], fov: 28 });
    G.sfx('click', { pos: [px, 0.1, pz], vol: 0.8 });
    C8_paintPhone({ mode: 'calling', bars: 0 });
    await G.wait(1.0);
    C8_paintPhone({ mode: 'calling', bars: 1 });
    G.sfx('beep', { pos: [px, 0.1, pz], vol: 0.3 });
    await G.wait(1.0);
    C8_paintPhone({ mode: 'calling', bars: 2 });
    G.sfx('beep', { pos: [px, 0.1, pz], vol: 0.3 });
    await G.wait(0.5);
    if (C8.ringback) { try { C8.ringback.stop(0); } catch (err) { /* audio */ } }
    C8.ringback = sfx('ringback', { loop: true, vol: 0.9 });
    await G.wait(1.6);
    // 2. SHOT — the Closer freezes mid-lunge. The smile trembles.
    const P = Player.pos;
    if (e) {
      e.pos.set(P.x + 1.6, 0, P.z + 0.6); e.yaw = Math.atan2(P.x - e.pos.x, P.z - e.pos.z);
      e.actor.setAnim('idle', { blend: 0 });
      q(Cl.gesture('reach', { hand: 'R', target: [P.x, 0.9, P.z], hold: true }));
      await G.wait(0.35);
      const H = headAt(e.actor), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      G.cam({ pos: [H.x + fx * 1.25 - fz * 0.25, H.y - 0.32, H.z + fz * 1.25 + fx * 0.25], target: [H.x, H.y - 0.06, H.z], fov: 34 });
      q(Cl.gesture('tremor', { amount: 1, dur: 2.2 }));
      let t = 0;
      await G.loop((dt) => { t += dt; e.actor.expr(Math.floor(t * 14) % 2 ? 'grin' : 'smile_huge'); return t >= 2.0; });
    }
    // 3. SHOT — wide. The smile slowly falls. The uniform sags. It shrinks and shrinks until it's a 22-year-old in a
    //    store polo, sitting on the floor hugging his knees. Aidan. Two Aidans in frame.
    // he's up, the phone to his ear
    A.place(px + 0.35, pz + 0.1, 90); A.pose('idle');
    if (ph) ph.visible = false;
    A.hold('R', 'phone');
    try { A.raw.armPose('R', 'phone'); } catch (err) { /* rig */ }
    try { Player.setTorch(false); } catch (err) { /* torch */ }
    try { Phone.display({ title: 'Calling...', lines: ['CASE 118-2231', 'ACCT 4471-0932'] }); } catch (err) { /* phone */ }
    const sx = e ? e.pos.x : px + 3.2, sz = e ? e.pos.z : pz;
    const small = G.actor('c8_small', 'aidan', { rig: { layers: [], hold: {} } });
    if (small.raw) { small.raw.idleLife = false; small.raw.setOpacity(0); small.raw.visible(false); }
    small.place(sx, sz, Math.atan2(px - sx, pz - sz) / D2R);
    G.cam({ pos: [lerp(px, sx, 0.5) - 0.4, 1.7, sz + 5.6], target: [lerp(px, sx, 0.5), 0.9, sz], fov: 42, to: { pos: [lerp(px, sx, 0.5) - 0.3, 1.6, sz + 5.0], fov: 40 }, dur: 12 });
    if (e) {
      if (e.actor) e.actor.finishGestures();
      let t = 0;
      await G.loop((dt) => {
        t += dt;
        e.actor.expr(t < 1.2 ? 'grin' : t < 2.4 ? 'flat' : 'sad');
        const k = U.ease.inOut(clamp((t - 1.0) / 3.4, 0, 1));
        e.obj.scale.set(1 - 0.3 * k + 0.05 * Math.sin(k * Math.PI), 1 - 0.29 * k, 1 - 0.3 * k);
        if (t > 3.2) e.actor.setAnim('crouch', { blend: 0.5 });
        if (t > 4.0) { if (small.raw) { small.raw.visible(true); small.raw.setOpacity(clamp((t - 4.0) / 1.4, 0, 1)); } e.actor.setOpacity(1 - clamp((t - 4.0) / 1.4, 0, 1)); }
        return t >= 5.6;
      });
    }
    if (e && !e.removed) { Enemies.visible(e, false); }
    if (small.raw) { small.raw.visible(true); small.raw.setOpacity(1); }
    small.pose('sit_knees'); small.expr('sad'); small.eyes('down');
    await G.wait(1.4);
    // the sitting one looks up
    small.look(A); small.eyes('at', A);
    await G.wait(0.8);
    try { small.raw.talk(2.2); } catch (err) { /* rig */ }
    await G.say('SITTING AIDAN', 'I just wanted it to be fine.');
    // (kneeling beside him)
    await A.walkTo(sx - 1.1, sz + 0.3, { speed: 0.7 });
    await A.turn(small, 0.5);
    A.pose('kneel_one');
    A.look(small);
    try { A.raw.armPose('R', 'phone'); } catch (err) { /* rig */ }
    G.cam({ pos: [sx - 0.3, 1.15, sz + 2.9], target: [sx - 0.55, 0.62, sz + 0.1], fov: 42 });
    await G.wait(0.8);
    await G.say('AIDAN', 'I know. [beat] It wasn\'t.');
    await G.wait(1.2);
    // 4. SHOT — the sitting Aidan fades. The ringing continues.
    G.cam({ pos: [sx + 1.8, 1.5, sz + 3.6], target: [sx - 0.3, 0.7, sz], fov: 40, to: { pos: [sx + 1.6, 1.45, sz + 3.3], fov: 38 }, dur: 8 });
    await small.fade(0, 3.0);
    await G.wait(1.2);
    // state (plain statements)
    small.remove();
    if (e && !e.removed) e.remove();
    C8.closer = null;
    G.set('c8_rang', true);
    if (!C8.ringback || !C8.ringback.playing) C8.ringback = sfx('ringback', { loop: true, vol: 0.9 });
    if (A.raw) A.raw.idleLife = true;
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // The in-room part of each ending (Game.ending plays the rest): E-C1 "Connected", E-OC0, E-FT0
  // =================================================================================================================
  const stopRing = () => { if (C8.ringback) { try { C8.ringback.stop(0.05); } catch (err) { /* audio */ } C8.ringback = null; } };
  // Aidan up, the phone at his ear, close
  async function C8_callPose(G) {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    A.pose('idle');
    if (!(A.raw && A.raw.held && A.raw.held.R)) A.hold('R', 'phone');
    try { A.raw.armPose('R', 'phone_ear'); } catch (err) { /* rig */ }
    A.look(null);
    // near-frontal on a long lens from a metre off: his face, the phone at his ear, the raised elbow out at the frame's
    // edge (closer than that, or from the side, the elbow comes across his face)
    G.cam({ pos: rel(A, 1.15, 0.2, 0.06), target: headAt(A).toArray(), fov: 26, to: { pos: rel(A, 1.0, 0.17, 0.06), fov: 24 }, dur: 14 });
  }
  defineCutscene('E-C1', async (G) => {
    const A = G.aidan;
    const P = Player.pos;
    A.place(P.x, P.z, Player.yawDeg);
    await C8_callPose(G);
    if (!C8.ringback) C8.ringback = sfx('ringback', { loop: true, vol: 0.9 });
    await G.wait(1.6);
    // a soft click
    stopRing();
    G.sfx('click', { vol: 0.5 });
    try { Phone.display({ title: 'ACCT 4471-0932', lines: ['connected'] }); } catch (err) { /* phone */ }
    await G.wait(0.9);
    if (flag('waiSaved')) { await G.say('WAI (phone)', 'Putting you through, mate.'); await G.wait(0.7); }
    await G.say('NAN (phone)', 'Hello? [beat] Is that the young man?');
    if (A.raw) { A.raw.eyes('closed'); A.raw.expr('sad'); }
    G.sfx('breath', { vol: 0.35 });
    await G.wait(1.2);
    if (A.raw) A.raw.eyes('down');
    await G.say('AIDAN', 'It\'s Aidan. [beat] From the store. [beat] I\'m so sorry.');
    await G.wait(0.8);
    if (A.raw) A.raw.expr('cry');
    await G.say('NAN (phone)', 'Oh, love. [beat] Come and see me.');
    G.music('nan', { full: true });
    await G.wait(1.0);
    // the screen fades to white
    await G.fade(1, 3.5, '#ffffff');
    await G.wait(3.0);
    // state
    stopRing();
    try { Phone.display(null); } catch (err) { /* phone */ }
  }, { letterbox: true, skippable: true });
  defineCutscene('E-OC0', async (G) => {
    const A = G.aidan;
    const P = Player.pos;
    A.place(P.x, P.z, Player.yawDeg);
    await C8_callPose(G);
    if (!C8.ringback) C8.ringback = sfx('ringback', { loop: true, vol: 0.9 });
    // the call rings out
    await G.wait(6.2);
    stopRing();
    G.sfx('click', { vol: 0.6 });
    await G.wait(0.6);
    await G.say('RECORDING (phone)', 'The number you have called is not connected.');
    G.sfx('disconnected', { dur: 2.2, vol: 0.7 });
    await G.wait(1.0);
    // Aidan lowers the phone
    try { A.raw.armPose('R', 'phone'); } catch (err) { /* rig */ }
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('sad'); }
    G.cam({ pos: rel(A, 2.4, 0.8, -0.3), target: [Player.pos.x, Player.pos.y + 1.2, Player.pos.z], fov: 38 });
    await G.wait(3.2);
    stopRing();
  }, { letterbox: true, skippable: true });
  defineCutscene('E-FT0', async (G) => {
    const A = G.aidan;
    const P = Player.pos;
    A.place(P.x, P.z, Player.yawDeg);
    await C8_callPose(G);
    if (!C8.ringback) C8.ringback = sfx('ringback', { loop: true, vol: 0.9 });
    await G.wait(2.4);
    // the call connects — to the automated voice
    stopRing();
    G.sfx('click', { vol: 0.6 });
    await G.wait(0.5);
    await G.say('RECORDING (phone)', 'Your callback has been scheduled for: tomorrow.');
    // the Closer stands back up behind Aidan, smiling, and rests a hand on his shoulder
    const yaw = Player.yaw, bx = P.x - Math.sin(yaw) * 1.1, bz = P.z - Math.cos(yaw) * 1.1;
    const e = C8_closerSpawn({ pos: [bx, bz], rot: yaw / D2R });
    if (e) {
      e.ai = false; e.obj.scale.set(1, 1, 1); e.actor.setOpacity(1); Enemies.visible(e, true);
      e.actor.hold('L', null); if (e.data.pen) e.data.pen.visible = true;
      e.actor.setAnim('crouch', { blend: 0 }); e.actor.expr('smile_huge');
    }
    G.cam({ pos: [P.x + Math.sin(yaw) * 3.2 + Math.cos(yaw) * 0.6, 1.9, P.z + Math.cos(yaw) * 3.2 - Math.sin(yaw) * 0.6], target: [P.x, 1.9, P.z], fov: 40, to: { pos: [P.x + Math.sin(yaw) * 2.8 + Math.cos(yaw) * 0.5, 1.85, P.z + Math.cos(yaw) * 2.8 - Math.sin(yaw) * 0.5], fov: 38 }, dur: 10 });
    await G.wait(0.8);
    if (e) e.actor.setAnim('idle', { blend: 1.2 });
    G.music('tomorrow', {});
    await G.wait(1.6);
    if (e) { const Cl = C8_clActor(G, e); q(Cl.gesture('hand_on_shoulder', { hand: 'L', target: A, hold: true })); }
    if (A.raw) { A.raw.expr('flat'); A.raw.eyes('down'); }
    await G.wait(4.0);
    stopRing();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CHAPTER 8 — THE MAST
  // =================================================================================================================
  defineChapter({
    n: 8, id: 'ch8', title: 'THE MAST', card: 'THE MAST',
    start: { room: 'c8_summit', entry: 'bottom' },
    // what a player carries up the hill (chapter select): the Prologue and Chapters 1–7
    debugState(s) {
      const give = (id, n = 1) => { if (!ITEMS[id]) return; const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      const MAPS8 = ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'map_care', 'rmap_care', 'map_office', 'rmap_office', 'map_office_upper', 'map_hospital'];
      for (const id of ['box_cutter', 'steel_bar', 'extinguisher', 'jumper_tool', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate', 'ticket', 'gate_key', 'visitor_pass', 'keycard', 'chloe_pin', ...MAPS8]) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('energy_drink', 1); give('first_aid', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      s.ammo = s.ammo || {}; s.ammo.extinguisher = Math.max(s.ammo.extinguisher | 0, 4);
      for (const id of MAPS8) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true,
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
        c3_bossDone: true, waiSaved: true,
        c4_metChase: true, c4_clicks: true, c4_logs: 'read', c4_bossDone: true, c4_done: true, chaseHurt: false,
        c5_pass: true, c5_chase: true, c5_l4: true, c5_chloe: true, c5_bossDone: true, c5_done: true, chloeSaved: true,
        c6_file: true, c6_case: 'open', c6_power: true, c6_office: true, c6_voice: true, c6_doors: true, c6_setpiece: true, c6_done: true, lukaSaved: true,
        standardName: 'AIDAN', c7_room12: true, chaseSaved: true, lukeSaved: true,
      });
      // (a fresh state's fates are all false, so chapter select starts from the best run: everyone saved)
      Object.assign(s.done, { 'c4:gateOpen': true, 'unlocked:c5_level4:escalations': true });
      // the Tethered he cut free on the way, in order (they sit along the summit road)
      const FREED = ['p4_busshelter:teth', 'c1_relay:teth', 'c1_concourse:teth2', 'c2_hilltoprd:teth', 'c2_crescent:teth5', 'c2_crescent:teth11', 'c3_forecourt:teth', 'c4_park:teth', 'c5_level4:teth', 'c6_level5:teth'];
      if (!(s.freedOrder && s.freedOrder.length)) { s.freedOrder = FREED.slice(); for (const id of FREED) s.spawns[id] = 'freed'; }
      s.stats.freed = Math.max(s.stats.freed || 0, (s.freedOrder || []).length);
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'acct4', 'acct5', 'acct6', 'huddle1', 'huddle2', 'huddle3', 'huddle4', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note'), 'plaque', 'wai_email', 'oplog1', 'oplog2', 'oplog3', 'oplog4', 'oplog5', 'oplog6', pick('fuse_note'), 'call_logs', 'chase_notes', 'rotary_card', 'chloe_pin', 'case_file', 'luka_notes']) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      for (const c of ['luka1', 'luka2', 'luka3', 'luka4', 'luka5', 'luka6', 'luka7', 'luka8']) s.calls[c] = s.calls[c] || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 8);
      for (const id of ['P-1', 'P-4', '1-1', '1-2', '1-3', '1-4', '1-7', '1-8', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '3-3b', '4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4', '6-1', '6-2', '7-1', '7-2', '7-3', '7-4']) s.done['cs:' + id] = true;
      for (let n = 1; n <= 7; n++) s.done['break:ch' + n] = true;
      s.F = Math.max(s.F || 0, 38); s.A = Math.max(s.A || 0, 6);
      s.chaseHits = s.chaseHits | 0;
      s.notes = (s.notes || []).filter((n) => n && !/^c[1-7]_/.test(n.id || ''));
      s.notes.push({ id: 'c8_goal', text: 'The mast. Up where it\'s clearer.', done: false });
    },
    async begin(G, o = {}) {
      G.bars(null);
      // the siren as soon as the chapter starts: the streets go into the Outage here
      if (!S.outage) { await G.wait(0.5); await G.outage(true); }
      note(G, 'The mast. Up where it\'s clearer.', 'c8_goal');
      if (G.once('c8:begin')) { await G.wait(1.2); await G.think('"Come up where it\'s clearer." [beat] That\'s what she said.'); }
    },
  });

  // ==== END OF CHAPTER 8 CONTENT ====
}
