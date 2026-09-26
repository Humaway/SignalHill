// ==== data/16_ch6.js — Chapter 6 "The Middle" (spec §11 Ch 6, §7B Regional Office Levels 5 and 6 + the lift shaft + the
// Standard's patrol on 5–6, §6 the Middle / the Standard / the Reach / the Tethered, §8 Luka's call 7, §4 lukaSaved,
// §13 Case File / Luka's Meeting Notes / Account Note 6 / Huddle Whiteboard 4) — tag C6_ ====
// Rooms (CONTENT_PLAN §2):
//   c6_escalations  6 × 5 m, NW corner of Level 4 (card lock; its door → c5_level4:escalations). A single desk, a
//                   terminal, a paper file under a lamp; blinds on the north windows. GAMEPLAY 6-1: the Case File opens
//                   by itself ('6-case'), then the terminal's two buttons ('6-terminal': Close case → A+5 / Leave it
//                   open → F+2). The fire stairs won't take him up until he has answered the terminal.
//   c6_firestairs   Fire stairs B, Level 4 → Level 6: four flights that step east as they climb round two narrow
//                   wells (no flight sits over another, so the room has one floor height at every point). Doors on
//                   the south wall: L4 (→ c5_level4:firestairs), L5 (→ c6_level5:stairs; the Fire Stairs Plan =
//                   map_office_upper taped to it), L6 (→ c6_level6:stairs; maglocked until the Level 5 site power is
//                   on — c6_power).
//   c6_level5       Level 5, half stripped: a 4 m loop of bare concrete round sheeted bays and the lift core; dust
//                   barriers (plastic curtains) across the corridors that part when anything walks through them; the
//                   builders' temporary power board on the core (→ c6_power: the festoon lights and the Level 6
//                   maglock); CALL 7; Tethered ×1, Reach ×1; lift B groaning behind its doors.
//   c6_level6       Level 6, half fitted out: the same loop, a spine corridor south of the bays with Luka's back
//                   office door (→ c6_lukaoffice:door), the carpeted lift lobby (centre-east) with the payphone and
//                   lift B ajar; Tethered ×1. After the office: the strained voice from lift B; forcing its doors
//                   brings the Outage (the lobby dissolves; the doorway → c6_shaft:top). Cutscene 6-2 plays here.
//   c6_lukaoffice   Impossibly, Luka's store back office (STORE 0412 — CITY): door chime; Huddle Whiteboard 4, his
//                   Meeting Notes, Account Note 6 on the corkboard in Aidan's hand, the cold coffee, the roster with
//                   "call him?" (an insert shot; Aidan looks away), first aid kit, coffee, the break table.
//   c6_shaft        The lift shaft (Outage only in play): the sill, the maintenance ladder down to the stalled car's
//                   roof (the giant hands swat across it — SET PIECE part 1), and the car's interior (built beside
//                   the shaft; the drop through the roof hatch cuts to it): carpet-tile skin walls, the jaw doors,
//                   the floor grating with the small hands in teal sleeves round Luka's ankles (part 2).
// Cutscenes: 6-1 "The Middle" (c6_shaft) → BOSS 'middle' (the set piece) → 6-2 "Is That All of It?" (c6_level6, Fog
//   world) → CHAPTER CARD "DISTRICT HOSPITAL" (G.startChapter(7)). In-engine beats: 6-case, 6-terminal, 6-roster,
//   6-lift (the voice / the doors / the Outage).
// The Standard (name LUKA) roams c6_level5 ↔ c6_firestairs ↔ c6_level6 on C6_GRAPH (restarted from every room's
//   onEnter while it isn't running); Luka's voice calls through the walls at intervals (DIALOGUE.luka_walls), from
//   behind the camera, never where Aidan is looking.
// State: S.flags c6_file (case file read), c6_case ('closed'|'open'), c6_power, c6_office (back office visited),
//   c6_voice (lift voice heard), c6_doors (lift B forced; the Outage), c6_setpiece (the Middle beaten), lukaSaved
//   (fate), standardName ('AIDAN' from 6-2), c6_done (CONTENT_PLAN); S.done c6:* keys.
{
  const D2R = Math.PI / 180;
  const clamp = U.clamp, lerp = U.lerp;
  const FN = Tex.fonts, BR = Tex.brand;
  const flag = (k) => !!(S.flags && S.flags[k]);
  const fv = (k) => (S.flags || {})[k];
  const done = (k) => !!(S.done && S.done[k]);
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio */ } return null; };
  const busy = () => { try { return !!Script.busy; } catch (e) { return false; } };
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  // transient presentation state (never saved)
  const C6 = { walls: 0, mid: null, lastCam: null, hands: null, car: null, amb: -1 };
  try { if (typeof window !== 'undefined' && window.SH) window.SH.c6 = C6; } catch (e) { /* tests only */ }

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash('c6:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c6:' + key;
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
  const strike = (ctx, x0, x1, y, col = '#1f2c6e', lw = 3) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y); ctx.bezierCurveTo(x0 + (x1 - x0) * 0.3, y - 3, x0 + (x1 - x0) * 0.7, y + 3, x1, y - 1); ctx.stroke(); };

  // fog beyond the curtain walls: grey-teal, darker up high, a few sodium lights far below in the town
  const fogTex = () => ctex('fogwin', 512, 256, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b2224'); g.addColorStop(0.45, '#394446'); g.addColorStop(0.72, '#4a5655'); g.addColorStop(1, '#2c3434');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 26; k++) {
      const px = r() * w, py = h * (0.62 + r() * 0.3), rad = 4 + r() * 16;
      const gg = x.createRadialGradient(px, py, 0, px, py, rad);
      gg.addColorStop(0, `rgba(255,160,70,${0.18 + r() * 0.3})`); gg.addColorStop(1, 'rgba(255,160,70,0)');
      x.fillStyle = gg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    for (let k = 0; k < 9; k++) { const y = r() * h, hh = 10 + r() * 40; x.fillStyle = `rgba(160,176,172,${0.03 + r() * 0.05})`; x.fillRect(0, y, w, hh); }
  }, { wrap: true });
  // the manila folder under the lamp
  const folderTex = () => ctex('folder', 512, 360, (x, w, h, r) => {
    x.fillStyle = '#d9bf85'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#cfb274'; x.fillRect(w * 0.62, 0, w * 0.3, h * 0.07);
    for (let k = 0; k < 600; k++) { x.fillStyle = `rgba(120,90,40,${r() * 0.08})`; x.fillRect(r() * w, r() * h, 2, 2); }
    x.fillStyle = '#f3efe2'; x.fillRect(w * 0.1, h * 0.14, w * 0.62, h * 0.2);
    tx(x, 'CASE 118-2231', w * 0.14, h * 0.24, 38, '#1e1e1e', { font: FN.mono, weight: 'bold' });
    tx(x, 'ESCALATION — ACCT 4471-0932', w * 0.14, h * 0.31, 17, '#333', { font: FN.mono });
    x.save(); x.translate(w * 0.62, h * 0.66); x.rotate(-0.14);
    x.strokeStyle = 'rgba(179,38,30,0.85)'; x.lineWidth = 7; x.strokeRect(-110, -34, 220, 68);
    tx(x, 'OPEN', 0, 18, 54, 'rgba(179,38,30,0.85)', { font: FN.heavy, weight: '900', align: 'center', spacing: 8 });
    x.restore();
    x.strokeStyle = 'rgba(90,60,30,0.35)'; x.lineWidth = 5; x.beginPath(); x.arc(w * 0.22, h * 0.72, 44, 0.3, 5.9); x.stroke();
    hand(x, 'Leader to discuss w/ rep — L', w * 0.12, h * 0.9, { size: 22, color: '#1f2c6e' });
    age(x, w, h, r, 0.5);
  });
  // the terminal (Tex.screen 256 × 160): the case, open / closed / reopened
  function C6_paintCase(c, w, h, st) {
    c.fillStyle = '#e9e7df'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0b4f52'; c.fillRect(0, 0, w, 16);
    c.font = `bold 9px ${FN.sans}`; c.fillStyle = '#fff'; c.fillText('RETAIL CRM 4.2 — CASE MANAGEMENT', 6, 11);
    c.fillStyle = '#1e1e1e'; c.font = `bold 13px ${FN.mono}`; c.fillText('CASE 118-2231', 8, 34);
    c.font = `9px ${FN.mono}`;
    [['ACCOUNT', '4471-0932'], ['REP', 'AIDAN'], ['LEADER', 'LUKA'], ['CALLBACK', '6 DAYS']].forEach(([k, v], i) => { c.fillStyle = '#555'; c.fillText(k, 8, 50 + i * 12); c.fillStyle = '#111'; c.fillText(v, 80, 50 + i * 12); });
    const lab = st === 'closed' ? 'CLOSED' : st === 'reopened' ? 'REOPENED' : 'OPEN';
    c.fillStyle = st === 'reopened' ? '#b3261e' : st === 'closed' ? '#555' : '#1b6e3a';
    c.fillRect(8, 104, 92, 18); c.fillStyle = '#fff'; c.font = `bold 11px ${FN.mono}`; c.fillText('STATUS: ' + lab, 12, 117);
    if (st === 'reopened') { c.fillStyle = '#b3261e'; c.font = `bold 10px ${FN.mono}`; c.fillText('FOLLOW UP: TOMORROW', 8, 140); }
    else { c.fillStyle = '#c9c6ba'; c.fillRect(120, 104, 60, 18); c.fillRect(186, 104, 60, 18); c.fillStyle = '#333'; c.font = `8px ${FN.sans}`; c.fillText('Close case', 126, 116); c.fillText('Leave open', 192, 116); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, y, w, 1); }
  }
  // big stencilled level numbers in the stairwell
  const levelTex = (n) => ctex('level' + n, 256, 320, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(20,22,22,0.88)';
    x.font = `900 250px ${FN.heavy}`; x.textAlign = 'center'; x.fillText(String(n), w / 2, 232);
    x.font = `bold 34px ${FN.sans}`; x.fillText('LEVEL ' + n, w / 2, 294);
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.6})`; x.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3); }
    x.fillRect(w * 0.5 - 3, 0, 6, 250);
    x.globalCompositeOperation = 'source-over';
  });
  // the Fire Stairs Plan taped to the Level 5 door (same drawing as the map item's cover)
  const planTex = () => ctex('fsplan', 384, 512, (x, w, h, r) => {
    x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, h * 0.12);
    tx(x, 'FIRE STAIRS PLAN', w / 2, h * 0.06, 30, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'LEVELS 5 & 6', w / 2, h * 0.1, 20, '#fff', { font: FN.sans, weight: 'bold', align: 'center' });
    for (const [y0, lab] of [[0.16, 'LEVEL 6'], [0.56, 'LEVEL 5']]) {
      tx(x, lab, w * 0.08, h * (y0 + 0.03), 18, '#333', { weight: 'bold' });
      x.strokeStyle = '#333'; x.lineWidth = 3; x.strokeRect(w * 0.08, h * (y0 + 0.05), w * 0.84, h * 0.32);
      x.lineWidth = 1; x.setLineDash([6, 5]); x.strokeRect(w * 0.2, h * (y0 + 0.11), w * 0.44, h * 0.2); x.setLineDash([]);
      x.fillStyle = '#9a9a92'; x.fillRect(w * 0.64, h * (y0 + 0.11), w * 0.2, h * 0.2);
      x.fillStyle = '#b3261e'; x.fillRect(w * 0.09, h * (y0 + 0.31), w * 0.1, h * 0.05);
      tx(x, 'B', w * 0.14, h * (y0 + 0.35), 16, '#fff', { weight: 'bold', align: 'center' });
      tx(x, 'UNDER REFURBISHMENT', w * 0.42, h * (y0 + 0.22), 13, '#777', { align: 'center' });
    }
    tx(x, 'YOU ARE HERE', w * 0.2, h * 0.95, 14, '#b3261e', { weight: 'bold' });
    age(x, w, h, r, 0.5);
  });
  // the builders' programme whiteboard on Level 5
  const siteBoardTex = () => ctex('siteboard', 512, 342, (x, w, h, r) => {
    x.fillStyle = '#eef0ee'; x.fillRect(0, 0, w, h);
    const L = [['L5 STRIP-OUT ✓', '#1f3f8a'], ['L6 CARPET — WK 3', '#141414'], ['LIFT B — DO NOT USE', '#b3261e'], ['temp power: L5 core E', '#141414'], ['NO ONE ON L6 AFTER 6', '#1f3f8a']];
    L.forEach(([s, c], i) => hand(x, s, 26, 56 + i * 56, { size: 34, color: c, font: FN.marker, weight: 'bold' }));
    hand(x, 'who keeps leaving the lights on??', 40, h - 18, { size: 20, color: '#b3261e', font: FN.marker });
    for (let k = 0; k < 10; k++) { x.strokeStyle = 'rgba(40,60,140,0.07)'; x.lineWidth = 9; x.beginPath(); x.moveTo(r() * w, r() * h); x.lineTo(r() * w, r() * h); x.stroke(); }
  });
  // Luka's huddle whiteboard (Huddle Whiteboard 4): the old line crossed out, underneath in the same hand
  const huddleTex = () => ctex('huddle4', 640, 440, (x, w, h, r) => {
    x.fillStyle = '#f0f1ee'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(${['40,60,140', '30,30,30', '160,40,40'][k % 3]},0.06)`; x.lineWidth = 10; x.beginPath(); x.moveTo(r() * w, r() * h); x.quadraticCurveTo(r() * w, r() * h, r() * w, r() * h); x.stroke(); }
    hand(x, 'TODAY:', 40, 92, { size: 52, color: '#1f3f8a', font: FN.marker, weight: 'bold' });
    hand(x, '14', 250, 104, { size: 92, color: '#1f3f8a', font: FN.marker, weight: 'bold' });
    hand(x, '"Nobody leaves till we hit it"', 50, 214, { size: 38, color: '#141414', font: FN.marker, weight: 'bold' });
    strike(x, 40, 600, 202, '#141414', 5); strike(x, 44, 596, 208, '#141414', 3);
    hand(x, 'Proud of you all. — L', 90, 318, { size: 44, color: '#141414', font: FN.marker, weight: 'bold' });
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // Luka's legal pad on the desk (his Meeting Notes)
  const padTex = () => ctex('lukapad', 320, 440, (x, w, h, r) => {
    x.fillStyle = '#f3e98f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, 26);
    for (let y = 60; y < h; y += 24) { x.fillStyle = 'rgba(60,110,170,0.35)'; x.fillRect(0, y, w, 1); }
    x.fillStyle = 'rgba(179,38,30,0.4)'; x.fillRect(38, 26, 1.5, h);
    const L = ['Team meeting — Monday', '(didn\'t run it)', '1. Tell them they matter', '   more than the number.', '2. Ask Aidan how he\'s', '   actually going. Not', '   "good?" Actually.', '3. Stop writing the', '   number first.', '4. Ring him again.'];
    L.forEach((s, i) => hand(x, s, 46, 56 + i * 24 + (i > 1 ? 14 : 0), { size: 17, color: '#1f2c6e' }));
    age(x, w, h, r, 0.35);
  });
  // Account Note 6 pinned to the corkboard: Aidan's handwriting, lined paper
  const acct6Tex = () => ctex('acct6', 300, 400, (x, w, h, r) => {
    x.fillStyle = '#f5f3ec'; x.fillRect(0, 0, w, h);
    for (let y = 44; y < h; y += 22) { x.fillStyle = 'rgba(80,120,190,0.35)'; x.fillRect(0, y, w, 1); }
    x.fillStyle = 'rgba(200,60,60,0.35)'; x.fillRect(30, 0, 1.5, h);
    const L = ['Note to self (the week', 'the modem came back):', 'Stop saying "it\'ll be', 'fine" when you don\'t', 'know. Say "let me check."', 'Let me check.', 'Let me check.', 'Let me check.'];
    L.forEach((s, i) => hand(x, s, 36, 40 + i * 22 + (i > 1 ? 22 : 0) + (i > 4 ? 22 : 0), { size: 16, color: '#141414' }));
    age(x, w, h, r, 0.3);
  });
  // the store's own signs in the back office
  const storeSignTex = () => ctex('store0412', 512, 128, (x, w, h, r) => {
    x.fillStyle = '#0b4f52'; x.fillRect(0, 0, w, h);
    try { Tex.drawWordmark(x, 22, 86, 58, { color: BR.yellow }); } catch (e) { /* brand */ }
    tx(x, 'STORE 0412 — CITY', w - 20, 60, 30, '#ffffff', { weight: 'bold', align: 'right' });
    tx(x, 'staff only', w - 20, 96, 20, '#9fdcd6', { align: 'right' });
    age(x, w, h, r, 0.3);
  });
  // the Level 6 lobby's feature wall lettering
  const featureTex = () => ctex('feature', 1024, 160, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    tx(x, 'EXCELLENCE EVERY DAY', w / 2, 104, 86, '#0f8a86', { font: FN.heavy, weight: '900', align: 'center', spacing: 6 });
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(0,0,0,${r() * 0.5})`; x.fillRect(r() * w, r() * h, 3 + r() * 20, 1 + r() * 4); }
    x.globalCompositeOperation = 'source-over';
  });
  // a sheet of A4 taped to the stairwell door on Level 6
  const powerNoteTex = () => ctex('nopower', 256, 180, (x, w, h, r) => {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
    tx(x, 'NO SITE POWER', w / 2, 44, 28, '#b3261e', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'L6 access control on', w / 2, 86, 18, '#222', { align: 'center' });
    tx(x, 'temp board — L5 core', w / 2, 110, 18, '#222', { align: 'center' });
    hand(x, 'don\'t prop this door!!', 22, 158, { size: 20, color: '#1f2c6e' });
    x.fillStyle = 'rgba(240,230,170,0.6)'; x.fillRect(0, 0, 40, 14); x.fillRect(w - 40, 0, 40, 14);
    age(x, w, h, r, 0.4);
  });

  // carpet-tile skin: the lift car's walls (pale, pored, the tile seams like stitching) — never red, never wet
  Tex.define('c6_skincarpet', {
    px: 256, size: 0.5, mat: { roughness: 0.72 },
    gen(x, w, h, r) {
      // one carpet tile: a loop-pile weave gone to pale, pored skin; its seams stitched like a wound that healed
      x.fillStyle = '#d2a996'; x.fillRect(0, 0, w, h);
      for (let yy = 0; yy < h; yy += 4) for (let xx = (yy / 4) % 2 ? 2 : 0; xx < w; xx += 4) { x.fillStyle = `rgba(${r() < 0.5 ? '150,96,84' : '236,200,186'},${0.12 + r() * 0.14})`; x.fillRect(xx, yy, 2, 2); }
      for (let k = 0; k < 14; k++) {
        const px = r() * w, py = r() * h, rad = 20 + r() * 60, gg = x.createRadialGradient(px, py, 0, px, py, rad);
        gg.addColorStop(0, `rgba(${r() < 0.6 ? '196,122,112' : '140,150,176'},${0.18 + r() * 0.16})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      for (let k = 0; k < 8; k++) { x.strokeStyle = `rgba(96,110,150,${0.14 + r() * 0.12})`; x.lineWidth = 1 + r() * 1.5; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let s = 0; s < 7; s++) { px += (r() - 0.5) * 46; py += (r() - 0.5) * 46; x.lineTo(px, py); } x.stroke(); }
      for (let k = 0; k < 320; k++) { x.fillStyle = `rgba(70,40,36,${0.3 + r() * 0.35})`; x.beginPath(); x.arc(r() * w, r() * h, 0.8 + r() * 1.3, 0, Math.PI * 2); x.fill(); }
      // the seams (the tile edges): a dark crease, a pale ridge, the stitches across it
      x.fillStyle = 'rgba(70,38,34,0.85)'; x.fillRect(0, 0, w, 4); x.fillRect(0, 0, 4, h);
      x.fillStyle = 'rgba(240,210,196,0.55)'; x.fillRect(0, 4, w, 2); x.fillRect(4, 0, 2, h);
      x.strokeStyle = 'rgba(40,24,22,0.9)'; x.lineWidth = 2;
      for (let i = 8; i < w; i += 16) { x.beginPath(); x.moveTo(i, -3); x.lineTo(i + 5, 8); x.stroke(); x.beginPath(); x.moveTo(-3, i); x.lineTo(8, i + 5); x.stroke(); }
    },
  });
  const SKIN_WALL = { tex: 'c6_skincarpet', emissive: '#ffffff', emissiveMap: true, emissiveIntensity: 0.28, outage: false, bump: 0.015 };

  // ---------------------------------------------------------------------------------------------------------------
  // Shared materials and custom meshes (cached, flagged shared so room unloads keep them)
  // ---------------------------------------------------------------------------------------------------------------
  const MATS = {};
  function smat(key, make) { let m = MATS[key]; if (!m) { m = make(); m.userData.shared = true; MATS[key] = m; } return m; }
  const GEOS = {};
  function sgeo(key, make) { let g = GEOS[key]; if (!g) { g = make(); g.userData.shared = true; GEOS[key] = g; } return g; }
  const skinMat = () => smat('skin', () => new THREE.MeshStandardMaterial({ color: '#dcd3c8', roughness: 0.6, emissive: '#5a544e', emissiveIntensity: 0.85 }));   // (pale out of the dark: a faint cold glow)
  const nailMat = () => smat('nail', () => new THREE.MeshStandardMaterial({ color: '#e6dcd0', roughness: 0.3 }));
  const cuffMat = () => smat('cuff', () => new THREE.MeshStandardMaterial({ color: '#e9e7e0', roughness: 0.55 }));
  const suitMat = () => smat('suit', () => new THREE.MeshStandardMaterial({ color: '#1d2433', roughness: 0.8 }));
  const tealMat = () => smat('teal', () => new THREE.MeshStandardMaterial({ color: '#12918c', roughness: 0.85 }));
  const kidSkinMat = () => smat('kskin', () => new THREE.MeshStandardMaterial({ color: '#e0bda3', roughness: 0.6, emissive: '#3a2a22', emissiveIntensity: 0.5 }));
  function mesh(geo, mat, x = 0, y = 0, z = 0, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) m.rotation.set((o.rx || 0) * D2R, (o.ry || 0) * D2R, (o.rz || 0) * D2R);
    if (o.s) m.scale.set(...o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    return m;
  }
  // An enormous pale hand in a suit cuff: the wrist at the origin, the fingers pointing down (−Y) and the palm facing
  // +Z. hand.userData.curl(k 0..1) closes the fingers; the suit sleeve rises out of frame (+Y).
  function C6_bigHand(scale = 1, o = {}) {
    const g = new THREE.Group(); g.name = 'c6:bighand';
    const sk = skinMat();
    const cap = (r, l) => sgeo(`cap${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
    g.add(mesh(sgeo('sleeve', () => new THREE.CylinderGeometry(0.2, 0.22, 3.2, 14)), suitMat(), 0, 1.72, 0));
    g.add(mesh(sgeo('cuff', () => new THREE.CylinderGeometry(0.175, 0.18, 0.16, 14)), cuffMat(), 0, 0.12, 0));
    g.add(mesh(sgeo('link', () => new THREE.CylinderGeometry(0.025, 0.025, 0.012, 8)), smat('gold', () => new THREE.MeshStandardMaterial({ color: '#b89a52', metalness: 0.8, roughness: 0.3 })), 0.16, 0.12, 0.06, { rz: 90 }));
    g.add(mesh(cap(0.14, 0.1), sk, 0, -0.02, 0, { s: [1, 1, 0.75] }));
    const palm = mesh(sgeo('palm', () => new THREE.BoxGeometry(0.34, 0.36, 0.12, 2, 2, 1)), sk, 0, -0.26, 0);
    g.add(palm);
    const fingers = [];
    const F = [[-0.12, 0.32], [-0.04, 0.37], [0.04, 0.36], [0.12, 0.3]];
    for (const [fx, len] of F) {
      const base = new THREE.Group(); base.position.set(fx, -0.43, 0.0); g.add(base);
      let parent = base; const segs = [];
      for (let s = 0; s < 3; s++) {
        const L = len * [0.42, 0.33, 0.25][s];
        const j = new THREE.Group(); if (s > 0) j.position.y = -len * [0.42, 0.33, 0.25][s - 1];
        parent.add(j);
        j.add(mesh(cap(0.034 - s * 0.003, L - 0.05), sk, 0, -L / 2, 0));
        if (s === 2) j.add(mesh(sgeo('nail', () => new THREE.BoxGeometry(0.045, 0.05, 0.012)), nailMat(), 0, -L + 0.035, 0.028));
        segs.push(j); parent = j;
      }
      fingers.push(segs);
    }
    const th = new THREE.Group(); th.position.set(-0.17, -0.2, 0.04); th.rotation.z = -0.7; g.add(th);
    th.add(mesh(cap(0.04, 0.16), sk, 0, -0.12, 0));
    g.scale.setScalar(scale);
    g.userData.curl = (k) => { for (const segs of fingers) segs.forEach((j, i) => { j.rotation.x = k * [0.5, 0.8, 0.7][i]; }); th.rotation.x = k * 0.5; };
    g.userData.curl(o.curl ?? 0.2);
    g.traverse((m) => { if (m.isMesh) m.castShadow = o.cast !== false; });
    return g;
  }
  // A small hand in a teal sleeve reaching up through the grating to hold an ankle (forearm along +Y from below)
  function C6_smallHand(o = {}) {
    const g = new THREE.Group(); g.name = 'c6:smallhand';
    const sk = kidSkinMat();
    g.add(mesh(sgeo('ksleeve', () => new THREE.CylinderGeometry(0.045, 0.052, 0.9, 10)), tealMat(), 0, -0.45, 0));
    g.add(mesh(sgeo('kcuff', () => new THREE.CylinderGeometry(0.047, 0.047, 0.03, 10)), smat('tealdk', () => new THREE.MeshStandardMaterial({ color: '#0b6b67', roughness: 0.8 })), 0, 0.0, 0));
    g.add(mesh(sgeo('kwrist', () => new THREE.CapsuleGeometry(0.03, 0.06, 3, 8)), sk, 0, 0.05, 0));
    g.add(mesh(sgeo('kpalm', () => new THREE.BoxGeometry(0.07, 0.07, 0.03)), sk, 0, 0.12, 0));
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group(); f.position.set(-0.026 + i * 0.017, 0.155, 0); g.add(f);
      f.add(mesh(sgeo('kfing', () => new THREE.CapsuleGeometry(0.009, 0.04, 3, 6)), sk, 0, 0.03, 0));
      fingers.push(f);
    }
    const t = new THREE.Group(); t.position.set(0.04, 0.12, 0.01); t.rotation.z = -0.6; g.add(t);
    t.add(mesh(sgeo('kthumb', () => new THREE.CapsuleGeometry(0.01, 0.03, 3, 6)), sk, 0, 0.025, 0));
    g.userData.grip = (k) => { for (const f of fingers) f.rotation.x = -0.4 - k * 1.1; t.rotation.x = -k * 0.8; };
    g.userData.grip(o.grip ?? 0.8);
    return g;
  }
  // a battery work light on a tripod (warm white); returns the light handle
  function C6_workLight(K, x, z, rot, o = {}) {
    const leg = { tex: 'metal', color: '#2a2c2c' };
    for (let i = 0; i < 3; i++) { const a = (rot + i * 120) * D2R; K.cyl(x + Math.sin(a) * 0.28, 0, z + Math.cos(a) * 0.28, 0.012, 1.25, leg, { rx: Math.cos(a) * 12, rz: -Math.sin(a) * 12 }); }
    K.cyl(x, 0.9, z, 0.016, 0.75, leg);
    K.box(x, 1.58, z, 0.34, 0.26, 0.12, { color: '#d8b928', roughness: 0.5 }, { rot });
    const lx = x + Math.sin(rot * D2R) * 0.08, lz = z + Math.cos(rot * D2R) * 0.08;
    K.plane(lx, 1.71, lz, 0.28, 0.18, { color: '#fff4dc', emissive: '#fff4dc', emissiveIntensity: o.on === false ? 0 : 2.2 }, { rotY: rot, name: o.name ? o.name + ':face' : undefined });
    const h = K.light('point', x + Math.sin(rot * D2R) * 0.9, 1.9, z + Math.cos(rot * D2R) * 0.9, { color: '#ffe8c4', intensity: o.intensity ?? 7, distance: o.distance ?? 10, name: o.name, bank: o.bank, on: o.on, world: o.world });
    K.box(x + 0.25, 0, z - 0.1, 0.22, 0.2, 0.14, { color: '#2b2b2b' }, { rot: 20 });
    return h;
  }
  // a festoon of site bulbs strung along a line (a bulb every 1.5 m) — one merged mesh per string; every festoon
  // shares one bulb material, so the site power switches them all (C6_festoonOn)
  const festoonMat = () => smat('festoon', () => new THREE.MeshStandardMaterial({ color: '#efe6d2', emissive: '#ffd49a', emissiveIntensity: 0, roughness: 0.4 }));
  function C6_festoonOn(on) { festoonMat().emissiveIntensity = on ? 2.4 : 0; }
  function C6_festoon(K, a, b, y) {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
    const items = [];
    const bulbG = sgeo('bulb', () => new THREE.SphereGeometry(0.045, 8, 6)), dropG = sgeo('bulbdrop', () => new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4));
    const wireItems = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), yy = y - 0.1 - (i % 2) * 0.06;
      items.push({ geo: bulbG, m: new THREE.Matrix4().makeTranslation(x, yy - 0.1, z) });
      wireItems.push({ geo: dropG, m: new THREE.Matrix4().makeTranslation(x, yy - 0.02, z) });
    }
    const bulbs = new THREE.Mesh(Kit.mergeGeometries(items), festoonMat()); bulbs.userData.ownedGeo = true; bulbs.castShadow = false;
    K.mesh(bulbs, {});
    const drops = new THREE.Mesh(Kit.mergeGeometries(wireItems), smat('wire', () => new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.6 }))); drops.userData.ownedGeo = true; drops.castShadow = false;
    K.mesh(drops, {});
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    K.box((a[0] + b[0]) / 2, y - 0.04, (a[1] + b[1]) / 2, Math.abs(dx) > Math.abs(dz) ? len : 0.008, 0.008, Math.abs(dx) > Math.abs(dz) ? 0.008 : len, { color: '#151515', roughness: 0.6 }, { shadow: false });
  }
  const C6_CURTAIN_OPACITY = 0.4;
  // A dust barrier across a corridor: two overlapping plastic panels hanging from a batten. They lean away from whatever
  // pushes through (Aidan, the Standard) with a crinkle — and anything behind them shows as a silhouette first.
  function C6_curtain(K, x, z, rot, w, h, id) {
    const g = new THREE.Group(); g.name = 'c6:curtain:' + id; g.position.set(x, 0, z); g.rotation.y = rot * D2R;
    // (thinner than the bays' sheeting: the cameras look down the legs through these, and Aidan has to read through them
    // even when his torch lights the plastic in front of him)
    const mat = K.mat({ tex: 'plastic_sheet', opacity: C6_CURTAIN_OPACITY });
    const pw = w / 2 + 0.3;
    const geo = sgeo(`curtain${w}|${h}`, () => {
      const gg = new THREE.PlaneGeometry(pw, h - 0.05, 8, 6), p = gg.attributes.position, rr = U.rng(17);
      const ph = rr() * 6;
      for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i), t = (h / 2 - py) / h; p.setZ(i, Math.sin(px * 4.1 + ph) * 0.04 * (0.3 + t) + Math.sin(px * 9 + ph * 2) * 0.012); }
      const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pw / 2, uv.getY(i) * h / 2);
      gg.translate(0, -(h - 0.05) / 2, 0); gg.computeVertexNormals();
      return gg;
    });
    const panels = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * (w / 4 - 0.15), h, s * 0.03); g.add(piv);
      const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.renderOrder = 2; piv.add(m);
      panels.push({ piv, s, a: 0 });
    }
    g.add(mesh(sgeo(`batten${w}`, () => new THREE.BoxGeometry(w + 0.2, 0.05, 0.05)), smat('pine', () => new THREE.MeshStandardMaterial({ color: '#b39b72', roughness: 0.7 })), 0, h - 0.02, 0));
    K.mesh(g, { name: 'c6curtain:' + id });
    const inv = new THREE.Matrix4();
    const lp = V3();
    let crinkle = 0;
    K.animate((dt) => {
      g.updateMatrixWorld(); inv.copy(g.matrixWorld).invert();
      const pushers = [];
      try { if (Player.pos) pushers.push(Player.pos); } catch (e) { /* player */ }
      try { const e = Enemies.standard.e; if (e && !e.removed) pushers.push(e.pos); } catch (e) { /* enemies */ }
      try { for (const e of Enemies.list || []) if (e && e.type !== 'standard' && e.pos && !e.resolved) pushers.push(e.pos); } catch (e) { /* enemies */ }
      crinkle = Math.max(0, crinkle - dt);
      for (const P of panels) {
        let want = 0;
        for (const p of pushers) {
          lp.copy(p).applyMatrix4(inv);
          if (Math.abs(lp.x) > w / 2 + 0.2 || Math.abs(lp.z) > 0.95) continue;
          if (lp.x * P.s < -0.35) continue;                                     // the other panel's half
          const k = 1 - Math.abs(lp.z) / 0.95;
          const a = -Math.sign(lp.z || 1) * (0.25 + k * 0.85);
          if (Math.abs(a) > Math.abs(want)) want = a;
        }
        const prev = P.a;
        P.a += (want - P.a) * Math.min(1, dt * 6);
        P.piv.rotation.x = P.a;
        P.piv.rotation.z = -P.s * Math.abs(P.a) * 0.25;
        if (Math.abs(P.a - prev) > dt * 0.8 && crinkle <= 0) { crinkle = 0.9; sfx('plastic', { pos: [x, 1.4, z], vol: 0.45, dur: 0.6 }); }
      }
    });
    return g;
  }
  // a curtain wall: aluminium mullions every 1.5 m, glass, and the fog outside (collider along the line)
  function C6_glazing(K, x0, z0, x1, z1, H, o = {}) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const nx = uz, nz = -ux;                   // outward normal (the left-hand side walking x0 → x1 is outside)
    const alu = { tex: 'metal', color: '#6c7372', roughness: 0.45, metalness: 0.5 };
    const n = Math.max(1, Math.round(L / 1.5));
    const along = Math.abs(dx) > Math.abs(dz);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + dx * t, z = z0 + dz * t;
      K.box(x, 0, z, along ? 0.07 : 0.14, H, along ? 0.14 : 0.07, alu);
    }
    K.box((x0 + x1) / 2, 0, (z0 + z1) / 2, along ? L : 0.16, 0.12, along ? 0.16 : L, alu);
    K.box((x0 + x1) / 2, H - 0.12, (z0 + z1) / 2, along ? L : 0.16, 0.12, along ? 0.16 : L, alu);
    if (o.transom !== false) K.box((x0 + x1) / 2, 0.85, (z0 + z1) / 2, along ? L : 0.1, 0.05, along ? 0.1 : L, alu);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.atan2(nx, nz) / D2R + 180;
    K.plane(cx, H / 2, cz, L, H, { color: '#9fb2ae', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.16 }, { rotY: ry, double: true });
    if (o.fog !== false) K.plane(cx + nx * (o.dist ?? 2.2), H / 2, cz + nz * (o.dist ?? 2.2), L + 6, H + 3, fogTex(), { rotY: ry, emissive: o.glow ?? 0.8 });
    K.collider(Math.min(x0, x1) - (along ? 0 : 0.1), Math.min(z0, z1) - (along ? 0.1 : 0), Math.max(x0, x1) + (along ? 0 : 0.1), Math.max(z0, z1) + (along ? 0.1 : 0), { h: H });
  }
  // a run of renovation sheeting hung along a line (props every ~3 m) with a collider behind it
  function C6_sheetRun(K, x0, z0, x1, z1, H, o = {}) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / 2.9));
    const rot = Math.atan2(dz, dx) / D2R;         // the sheet faces along the run's normal
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      K.prop('plastic_sheet', x0 + dx * t, z0 + dz * t, -rot + (o.flip ? 180 : 0), { w: L / n + 0.25, h: H - 0.02, seed: (o.seed || 1) + i });
    }
    if (o.collide !== false) K.collider(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, { h: H });
  }
  // metal stud framing (a partition that was never lined): studs every 0.6 m between top and bottom tracks
  function C6_studs(K, x0, z0, x1, z1, H) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / 0.6)), along = Math.abs(dx) > Math.abs(dz);
    const st = { tex: 'metal', color: '#9aa2a0', roughness: 0.45, metalness: 0.4 };
    for (let i = 0; i <= n; i++) { const t = i / n; K.box(x0 + dx * t, 0, z0 + dz * t, along ? 0.035 : 0.075, H, along ? 0.075 : 0.035, st); }
    K.box((x0 + x1) / 2, 0, (z0 + z1) / 2, along ? L : 0.08, 0.04, along ? 0.08 : L, st);
    K.box((x0 + x1) / 2, H - 0.04, (z0 + z1) / 2, along ? L : 0.08, 0.04, along ? 0.08 : L, st);
  }
  // a mobile aluminium scaffold tower
  function C6_scaffold(K, x, z, rot, o = {}) {
    const al = { tex: 'metal', color: '#b8bcba', roughness: 0.4, metalness: 0.5 };
    const w = 1.3, d = 0.75, h = o.h ?? 3.0, c = Math.cos(rot * D2R), s = Math.sin(rot * D2R);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const [px, pz] = P(lx, lz); K.cyl(px, 0.12, pz, 0.025, h - 0.12, al); K.cyl(px, 0.0, pz, 0.05, 0.1, '#1a1a1a'); }
    for (const y of [0.4, 1.3, 2.2]) {
      const [ax, az] = P(0, -d / 2), [bx, bz] = P(0, d / 2);
      K.box(ax, y, az, w, 0.035, 0.035, al, { rot }); K.box(bx, y, bz, w, 0.035, 0.035, al, { rot });
    }
    const [mx, mz] = P(0, 0);
    K.box(mx, 2.2, mz, w - 0.05, 0.05, d - 0.05, { tex: 'wood', color: '#6e5a3e' }, { rot });
    if (o.collide !== false) K.colliderRot(mx, mz, w + 0.1, d + 0.1, rot, { h: 2.4 });
  }
  // a folded A-frame step ladder leaning on a wall / standing open
  function C6_stepLadder(K, x, z, rot) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot * D2R;
    const al = smat('alu', () => new THREE.MeshStandardMaterial({ color: '#b5b9b7', roughness: 0.4, metalness: 0.5 }));
    const rail = sgeo('ldrail', () => new THREE.BoxGeometry(0.05, 1.9, 0.03));
    for (const s of [-1, 1]) { g.add(mesh(rail, al, s * 0.24, 0.93, 0.25, { rx: -14 })); g.add(mesh(rail, al, s * 0.24, 0.93, -0.25, { rx: 14 })); }
    const rung = sgeo('ldrung', () => new THREE.BoxGeometry(0.5, 0.03, 0.08));
    for (let i = 0; i < 5; i++) g.add(mesh(rung, al, 0, 0.3 + i * 0.33, 0.33 - i * 0.075, {}));
    g.add(mesh(sgeo('ldtop', () => new THREE.BoxGeometry(0.56, 0.06, 0.2)), smat('ldtopm', () => new THREE.MeshStandardMaterial({ color: '#c8a020', roughness: 0.6 })), 0, 1.86, 0));
    K.mesh(g, { static: true });
    K.colliderRot(x, z, 0.6, 0.7, rot, { h: 1.9 });
  }
  // a hard hat (half dome + brim)
  function C6_hardHat(K, x, y, z, color, o = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set((o.rx || 0) * D2R, (o.ry || 0) * D2R, (o.rz || 0) * D2R);
    const m = smat('hat' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
    g.add(mesh(sgeo('hatdome', () => new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, 0, 0, { s: [1, 0.9, 1.15] }));
    g.add(mesh(sgeo('hatbrim', () => new THREE.CylinderGeometry(0.155, 0.16, 0.012, 14)), m, 0, 0.005, 0.025, { s: [1, 1, 1.2] }));
    K.mesh(g, { static: true });
  }
  // flat stacks of plasterboard leaning or lying
  const board = (K, x, z, rot, n = 8) => { for (let i = 0; i < n; i++) K.box(x, i * 0.013, z, 1.2, 0.013, 2.4, { color: i % 2 ? '#e2e0d8' : '#d8d6ce', roughness: 0.9 }, { rot }); };
  // things lying around on the floor
  const tape = (K, x0, z0, x1, z1, col = '#d8b928') => { const L = Math.hypot(x1 - x0, z1 - z0); K.box((x0 + x1) / 2, 0.002, (z0 + z1) / 2, 0.05, 0.003, L, { color: col, roughness: 0.5 }, { rot: Math.atan2(x1 - x0, z1 - z0) / D2R }); };
  const glueScar = (K, x, z, w, d, rot = 0) => K.box(x, 0.001, z, w, 0.002, d, { color: '#4d4f4a', roughness: 0.95 }, { rot, shadow: false });

  // ---------------------------------------------------------------------------------------------------------------
  // Ambient lift: keep interiors dark but readable (the torch does the work)
  // ---------------------------------------------------------------------------------------------------------------
  const AMB = { c0: new THREE.Color(), c1: new THREE.Color(), last: -1 };
  function C6_ambient(fog, out) {
    const k = clamp(Tex.outage || 0, 0, 1);
    const key = Math.round(k * 50) + fog[1] * 1000 + out[1] * 100000;
    if (key === AMB.last) return;
    AMB.last = key;
    AMB.c0.set(fog[0]).lerp(AMB.c1.set(out[0]), k);
    try { Render.setAmbient(AMB.c0.getStyle(), lerp(fog[1], out[1], k)); } catch (e) { /* render */ }
  }
  function C6_ambientOff() { AMB.last = -1; try { Render.setAmbient(null); } catch (e) { /* render */ } }

  // ---------------------------------------------------------------------------------------------------------------
  // The Standard on Levels 5 and 6 (spec §7B): a waypoint graph between the sheeted bays of both floors and fire stairs
  // B. Name card LUKA. It pauses at the power board, the lifts and Luka's office door. The engine's graph controller
  // follows Aidan through any door (the stairwell) once it has seen him; the back office has no node — it never goes in.
  // ---------------------------------------------------------------------------------------------------------------
  const C6_GRAPH = {
    nodes: {
      'l5:door': { room: 'c6_level5', pos: [2, 23.1], door: true }, 'l5:sw': { room: 'c6_level5', pos: [2, 18] },
      'l5:w': { room: 'c6_level5', pos: [2, 9] }, 'l5:nw': { room: 'c6_level5', pos: [2, 2] },
      'l5:n1': { room: 'c6_level5', pos: [11, 2] }, 'l5:n2': { room: 'c6_level5', pos: [21, 2] },
      'l5:ne': { room: 'c6_level5', pos: [30, 2] }, 'l5:e': { room: 'c6_level5', pos: [30.2, 11], pause: 3, face: -90 },
      'l5:se': { room: 'c6_level5', pos: [30, 22] }, 'l5:lifts': { room: 'c6_level5', pos: [24, 21.8], pause: 4, face: 180 },
      'l5:s': { room: 'c6_level5', pos: [12, 22] },
      'fs:l5': { room: 'c6_firestairs', pos: [2.85, 5.05], door: true }, 'fs:l6': { room: 'c6_firestairs', pos: [4.95, 5.05], door: true },
      'l6:door': { room: 'c6_level6', pos: [2, 23.1], door: true }, 'l6:sw': { room: 'c6_level6', pos: [2, 18] },
      'l6:w': { room: 'c6_level6', pos: [2, 9] }, 'l6:nw': { room: 'c6_level6', pos: [2, 2] },
      'l6:n1': { room: 'c6_level6', pos: [12, 2] }, 'l6:n2': { room: 'c6_level6', pos: [22, 2] },
      'l6:ne': { room: 'c6_level6', pos: [30, 2] }, 'l6:e': { room: 'c6_level6', pos: [30, 10] },
      'l6:lobby': { room: 'c6_level6', pos: [27.6, 16.6], pause: 4, face: 180 }, 'l6:spine': { room: 'c6_level6', pos: [15, 18] },
      'l6:office': { room: 'c6_level6', pos: [9, 18.4], pause: 4, face: 0 },
    },
    edges: [
      ['l5:door', 'l5:sw'], ['l5:sw', 'l5:w'], ['l5:w', 'l5:nw'], ['l5:nw', 'l5:n1'], ['l5:n1', 'l5:n2'], ['l5:n2', 'l5:ne'], ['l5:ne', 'l5:e'],
      ['l5:e', 'l5:se'], ['l5:se', 'l5:lifts'], ['l5:lifts', 'l5:s'], ['l5:s', 'l5:sw'],
      ['l5:door', 'fs:l5'], ['fs:l5', 'fs:l6'], ['fs:l6', 'l6:door'],
      ['l6:door', 'l6:sw'], ['l6:sw', 'l6:w'], ['l6:w', 'l6:nw'], ['l6:nw', 'l6:n1'], ['l6:n1', 'l6:n2'], ['l6:n2', 'l6:ne'], ['l6:ne', 'l6:e'],
      ['l6:e', 'l6:lobby'], ['l6:lobby', 'l6:spine'], ['l6:spine', 'l6:office'], ['l6:office', 'l6:sw'],
    ],
  };
  const C6_ROUTE = ['l6:e', 'l6:lobby', 'l6:spine', 'l6:office', 'l6:sw', 'l6:door', 'fs:l6', 'fs:l5', 'l5:door', 'l5:sw', 'l5:w', 'l5:nw', 'l5:n1', 'l5:n2', 'l5:ne',
    'l5:e', 'l5:se', 'l5:lifts', 'l5:s', 'l5:sw', 'l5:door', 'fs:l5', 'fs:l6', 'l6:door', 'l6:sw', 'l6:w', 'l6:nw', 'l6:n1', 'l6:n2', 'l6:ne'];
  // (re)start it whenever Aidan walks into one of its floors and it isn't running (chapter start, load, death, a
  // chapter-select start); it comes back in far from the room he's in
  function C6_std(room) {
    try {
      if (S.chapter !== 6 || flag('c6_doors') || Enemies.standard.active) return;
      const node = room === 'c6_level5' ? 'l6:ne' : room === 'c6_level6' ? 'l5:ne' : 'l6:e';
      Enemies.standard.start({ graph: C6_GRAPH, node, name: fv('standardName') || 'LUKA', mode: 'patrol', route: C6_ROUTE });
    } catch (e) { console.error('[c6] standard', e); }
  }

  // Luka's voice through the walls (DIALOGUE.luka_walls): at intervals, muffled, from behind Aidan — never from where
  // he's looking, never from where the Standard is
  async function C6_walls(G, room) {
    const tok = ++C6.walls;
    const lines = (typeof DIALOGUE !== 'undefined' && DIALOGUE.luka_walls) || ['Aidan?', 'Mate, is that you?', "I can hear you. It's alright."];
    await G.wait(9 + Math.random() * 8);
    for (;;) {
      if (tok !== C6.walls || !G.inRoom(room)) return;
      const ok = S.chapter === 6 && !flag('c6_voice') && !busy() && !World.transitioning && Player.control !== false;
      if (ok) {
        const p = Player.pos, yaw = Player.yaw + Math.PI + (Math.random() - 0.5) * 1.4, d = 6 + Math.random() * 3.5;
        let x = p.x + Math.sin(yaw) * d, z = p.z + Math.cos(yaw) * d;
        const b = (ROOMS[room] && ROOMS[room].bounds) || [0, 0, 32, 24];
        x = clamp(x, b[0] - 1.5, b[2] + 1.5); z = clamp(z, b[1] - 1.5, b[3] + 1.5);
        const se = Enemies.standard.e;
        if (!se || Math.hypot(se.pos.x - x, se.pos.z - z) > 6) {
          const n = (S.done['c6:wallsN'] | 0);
          S.done['c6:wallsN'] = n + 1;
          const line = lines[n % lines.length];
          try { Snd.murmur('crowd', { pos: [x, p.y + 1.5, z], n: 1, dur: 1.1 + line.length * 0.04, vol: 0.85 }); } catch (e) { /* audio */ }
          try { Enemies.say(line, 'muffled', Math.max(2.4, U.readTime(line))); } catch (e) { /* ui */ }
        }
      }
      await G.wait(26 + Math.random() * 18);
    }
  }

  // =================================================================================================================
  // 6B THE ESCALATIONS OFFICE — 6 × 5 m, ceiling 2.75, the NW corner of Level 4. North: the building's glass behind
  // half-drawn blinds (a camera looks in through them). A single desk facing the door, the terminal, the paper file
  // under the lamp. The door (south, x 4.6) → c5_level4:escalations. North, east and south walls are one-sided (the
  // cameras stand outside them).
  // =================================================================================================================
  const ES = { H: 2.75, door: [3.0, 5], desk: [2.9, 1.85], file: [2.55, 0.752, 1.95], term: [3.2, 1.9] };
  defineRoom({
    id: 'c6_escalations', name: 'ESCALATIONS OFFICE', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'carpet', ambient: 'office',
    fog: { density: 0.032, color: '#3b4543' },
    bounds: [0, 0, 6, 5],
    entries: { door: [ES.door[0], 4.3, 180], start: [ES.door[0], 4.3, 180] },
    cameras: [
      // through the blinds from outside the north window: the door, and whoever comes in
      { id: 'c6_escalations:blinds', vol: [0, 2.3, 6, 5], type: 'static', pos: [1.3, 2.25, -2.9], target: [4.0, 0.75, 3.9], fov: 'fit' },
      // high from the doorway side: the desk under the lamp, Aidan's face over it
      { id: 'c6_escalations:desk', vol: [0, 0, 4.3, 2.3], type: 'static', pos: [1.0, 2.45, 7.5], target: [2.6, 0.7, 1.0], fov: 'fit' },
      // the ceiling corner (CCTV): the east side, the shelves and the whiteboard
      { id: 'c6_escalations:corner', vol: [4.3, 0, 6, 2.3], type: 'static', pos: [-2.4, 2.6, 4.2], target: [5.2, 0.8, 1.0], fov: 'fit' },
      // behind the desk, at the terminal: close and low from the east
      { id: 'c6_escalations:term', vol: [2.0, 0.25, 4.1, 1.55], pri: 1, type: 'static', pos: [-2.5, 1.45, 1.9], target: [3.0, 1.05, 1.0], fov: 'fit' },
    ],
    build(K) {
      const H = ES.H;
      K.floor(0, 0, 6, 5, { tex: 'carpet', color: '#4c5660' });
      K.ceiling(0, 0, 6, 5, H, 'ceiling_tile');
      // north: the glass (blinds) — one-sided so the camera outside sees in
      K.wall(-0.1, 0, 6.1, 0, H, 'plaster', { both: false, openings: [{ at: 3.1, w: 5.4, h: 1.75, sill: 0.8 }] });
      K.box(3.1, 0, -0.02, 5.6, 0.8, 0.12, { color: '#6c7372', roughness: 0.5 }, {});
      for (const x of [0.6, 1.95, 3.1, 4.25, 5.6]) K.box(x, 0.8, -0.02, 0.06, 1.75, 0.1, { tex: 'metal', color: '#6c7372', metalness: 0.5 });
      K.plane(3.1, 1.68, -0.03, 5.4, 1.75, { color: '#9fb2ae', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.14 }, { double: true });
      K.plane(3.1, 1.6, -4.4, 12, 5, fogTex(), { emissive: 0.5 });
      // the blinds: half down, one slat bent, the cord hanging
      for (let i = 0; i < 13; i++) { const y = 2.5 - i * 0.07; const bent = i === 9; K.box(3.1, y, 0.06, 5.35, 0.008, 0.045, { color: '#d9d6cb', roughness: 0.5 }, { rot: bent ? 2 : 0 }); }
      K.box(3.1, 2.53, 0.06, 5.45, 0.04, 0.07, { color: '#cfcbbd' });
      K.cyl(5.55, 1.2, 0.09, 0.004, 1.3, { color: '#e8e4d8' });
      K.box(5.55, 1.15, 0.09, 0.02, 0.06, 0.02, { color: '#e8e4d8' });
      // west: bare (one-sided: two cameras stand outside it); east: the shelves, the whiteboard, the clock, the poster;
      // south: the door (one-sided)
      K.wall(0, 5.1, 0, -0.1, H, 'plaster', { both: false, skirting: true });
      K.wall(6, -0.1, 6, 5.1, H, 'plaster', { skirting: true });
      K.wall(6.1, 5, -0.1, 5, H, 'plaster_stained', { both: false, skirting: true, openings: [{ at: 6.1 - ES.door[0], w: 1.0, h: 2.15 }, { at: 6.1 - 4.6, w: 0.8, h: 2.0, sill: 0.3 }] });
      K.plane(4.6, 1.3, 4.93, 0.8, 2.0, { color: '#b9c4c2', roughness: 0.2, transparent: true, opacity: 0.45 }, { rotY: 180 });
      K.door({ id: 'c6_escalations:door', x: ES.door[0], z: ES.door[1], rot: 0, w: 0.95, style: 'wood', to: 'c5_level4', entry: 'escalations', sign: 'ESCALATIONS', signBack: 'ESCALATIONS', reader: 'card' });
      // the desk, the chair behind it (facing the door), the visitor's chair
      K.prop('desk', ES.desk[0], ES.desk[1], 180, { clutter: false, w: 1.6 });
      K.prop('office_chair', ES.desk[0] + 0.1, 1.15, 0, { turn: 12 });
      K.prop('chair', ES.desk[0] - 0.15, 2.75, 185, { variant: 'waiting', color: '#44525a' });
      K.prop('monitor', ES.term[0], ES.term[1] + 0.12, 180, { y: 0.745, content: 'crm', name: 'c6esc:term' });
      K.box(ES.term[0] - 0.05, 0.745, ES.term[1] - 0.2, 0.44, 0.02, 0.14, { color: '#1c1e1f', roughness: 0.6 }, { rot: 4 });
      K.box(ES.term[0] - 0.4, 0.745, ES.term[1] - 0.22, 0.06, 0.02, 0.1, { color: '#1c1e1f', roughness: 0.6 });
      K.box(3.95, 0, 1.95, 0.2, 0.42, 0.45, { color: '#cfc8b4', roughness: 0.7 });
      K.prop('desk_lamp', 2.05, 1.95, 200, { y: 0.745, lit: true, light: false });
      K.light('lamp', 2.25, 1.35, 1.95, { color: '#ffcf8a', intensity: 2.8, distance: 4.5, name: 'c6esc:lamp' });
      // the file, under the lamp
      K.box(ES.file[0], 0.745, ES.file[2], 0.32, 0.012, 0.23, { color: '#c9ad70', roughness: 0.8 }, { rot: 8 });
      K.plane(ES.file[0], 0.759, ES.file[2], 0.31, 0.22, folderTex(), { rot: [-90, 8, 0] });
      K.prop('desk_phone', 3.6, 1.65, 200, { y: 0.745, ringing: false });
      K.box(3.7, 0.745, 2.05, 0.2, 0.1, 0.11, { color: '#e8e4dc', roughness: 0.9 }, { rot: -12 });
      K.box(3.7, 0.845, 2.05, 0.06, 0.03, 0.04, { color: '#fbfbf8', roughness: 1 }, { rot: -12 });
      K.prop('mug', 2.1, 2.1, 30, { y: 0.745, text: 'REGION 4' });
      // east wall: the binders shelf (one binder), the whiteboard, the filing cabinet
      K.prop('binders_shelf', 5.72, 3.7, -90, { len: 1.6, h: 1.9 });
      K.prop('filing_cabinet', 5.62, 0.55, -90, {});
      K.prop('whiteboard', 5.93, 2.1, -90, { w: 1.5, h: 1.0, mount: 1.55, text: 'ESCALATIONS — OPEN\n118-2231  OVERDUE\nleader to discuss w/ rep' });
      K.prop('clock', 5.92, 4.3, -90, { mount: 2.25, time: [9, 14] });
      K.prop('framed_photo', 5.93, 0.55, -90, { subject: 'blank', mount: 1.75, w: 0.4, h: 0.32 });
      K.plane(5.92, 1.55, 4.45, 0.5, 0.7, Tex.poster('OUR PROMISE\nWE\'LL CALL\nYOU BACK', { kind: 'notice', seed: 61 }), { rotY: -90 });
      K.prop('plant_pot', 0.45, 0.45, 0, { variant: 'dead', collide: false }); K.collider(0.2, 0.2, 0.7, 0.7, { h: 0.6 });
      K.prop('water_stain', 1.5, 1.2, 0, { surface: 'ceiling', ceil: H });
      K.prop('fluoro_tube', 3.0, 2.5, 90, { h: H - 0.02, variant: 'troffer', lit: false });
      K.light('point', 3.1, 1.4, -1.2, { color: '#8fa6a4', intensity: 1.6, distance: 6 });   // the fog's grey through the blinds
      K.dress('papers', [0.4, 3.2, 3.6, 4.7], 5, { seed: 604 });
      // ---- examine lines ----
      K.examine(5.9, 1.55, 2.1, ['"Escalations — open." [beat] There\'s one line under it.', 'Leader to discuss with rep. [beat] That\'s me. I\'m the rep.'], { id: 'c6es:board', r: 1.3 });
      K.examine(5.7, 1.2, 3.7, ['Binders by store number. 0410. 0411. [beat] 0412\'s the thin one.', 'Everything in the others got sorted out. Somebody rang somebody back.'], { id: 'c6es:shelf', r: 1.3 });
      K.examine(5.8, 2.1, 4.3, 'Fourteen minutes past nine. [beat] Monday. His first call was Monday, 9:14.', { id: 'c6es:clock', r: 1.6 });
      K.examine(5.8, 1.55, 4.45, ['"Our promise: we\'ll call you back."', 'Somebody laminated it.'], { id: 'c6es:poster', r: 1.3 });
      K.examine(ES.desk[0] - 0.15, 0.7, 2.75, ['The chair on this side of the desk. For whoever gets called in.', 'Somebody\'s pushed the tissues across so they\'re closer to it.'], { id: 'c6es:chair', r: 1.1 });
      K.examine(3.1, 1.3, 0.2, ['The blinds are half down. Out there it\'s just fog, four floors down.', 'Somewhere under it there\'s a car park. And my car, probably.'], { id: 'c6es:blinds', r: 1.6 });
      K.examine(0.45, 0.6, 0.45, 'A peace lily. Somebody\'s job was to water it.', { id: 'c6es:plant', r: 1.0 });
      K.examine(3.6, 0.9, 1.65, 'The message light\'s on. [beat] I don\'t want to know who it\'s from.', { id: 'c6es:phone', r: 0.8 });
      K.examine(ES.file[0], 0.85, ES.file[2], async (G) => {
        if (fv('c6_case') === 'closed') await G.think('"Status: open." [beat] It still says open. It\'s printed. It can\'t change.');
        else await G.think('Case 118-2231. [beat] Status: open.');
      }, { id: 'c6es:file', r: 0.9, when: () => flag('c6_file') });
      // ---- the terminal: the two buttons (after the file) ----
      K.interact(ES.term[0], 1.05, ES.term[1] - 0.35, (G) => G.cutscene('6-terminal'), { id: 'c6es:terminal', r: 1.0, when: () => flag('c6_file') && !fv('c6_case') });
      K.examine(ES.term[0], 1.05, ES.term[1] - 0.35, async (G) => {
        if (fv('c6_case') === 'closed') await G.think('"Follow up: tomorrow." [beat] I didn\'t press that. I didn\'t.');
        else await G.think('Open. [beat] It stays open.');
      }, { id: 'c6es:termdone', r: 1.0, when: () => !!fv('c6_case') });
      // the first time in: the file opens by itself
      K.trigger([0, 0, 6, 5], (G) => G.cutscene('6-case'), { id: 'c6_escalations:case', when: () => !flag('c6_file') });
      // paint the in-world terminal to match the case
      K.animate(() => {
        const t = World.obj && World.obj('c6esc:term');
        const st = fv('c6_case') === 'closed' ? 'reopened' : 'open';
        if (!t || t.userData.c6st === st) return;
        t.userData.c6st = st; t.userData.custom = true;
        try { t.userData.screen.draw((c, w, h) => C6_paintCase(c, w, h, st)); } catch (e) { /* screen */ }
      });
    },
    onUpdate() { C6_ambient(['#56606a', 0.22], ['#1f6f6a', 0.06]); },
    onLeave() { C6_ambientOff(); },
    async onEnter(G) {
      G.bars(null);
      if (!flag('c6_file')) return;
      if (fv('c6_case') && G.once('c6:escBack')) { await G.wait(1.0); }
    },
  });

  // ---- 6-case (in-engine): the file under the lamp opens by itself; "Hospital." — the Tomorrow motif -------------
  defineCutscene('6-case', async (G) => {
    const A = G.aidan;
    const [fx, fy, fz] = ES.file;
    if (A.raw) A.raw.idleLife = false;
    // the lamp and the file, before he's close (the empty desk)
    G.cam({ pos: [1.2, 1.55, 3.5], target: [fx + 0.1, 0.8, fz - 0.1], fov: 34, to: { pos: [1.45, 1.45, 3.1], target: [fx + 0.1, 0.78, fz - 0.1], fov: 31 }, dur: 7 });
    await G.wait(0.4);
    // (to the desk's corner beside the visitor's chair — the chair takes the middle)
    await A.walkTo([[ES.door[0] + 0.35, 3.5], [2.15, 3.1], [2.1, 2.6]], { speed: 0.8 });
    await A.turn(145, 0.5);                                                       // (toward the file)
    A.look([fx, fy, fz]);
    if (A.raw) A.raw.eyes('down');
    await G.wait(0.5);
    // close: the folder under the lamp
    G.cam({ pos: [fx + 0.05, 1.5, fz + 0.45], target: [fx, 0.76, fz - 0.02], fov: 30, to: { pos: [fx + 0.04, 1.3, fz + 0.3], fov: 29 }, dur: 5 });
    G.sfx('paper', { vol: 0.6, pos: [fx, 0.9, fz] });
    await G.wait(1.4);
    G.set('c6_file', true);
    await G.doc('case_file', { id: 'c6_escalations:case' });
    // after reading it: close on him, the lamp from below (placed from where his head is: in front of his face, low,
    // over the desk's edge)
    {
      const hp = V3(2.1, 1.62, 2.6);
      try { A.raw.bones.head.getWorldPosition(hp); } catch (e) { /* rig */ }
      const fwx = Math.sin(145 * D2R), fwz = Math.cos(145 * D2R), rx = -fwz, rz = fwx;
      const cp = (d, s, dy) => [hp.x + fwx * d + rx * s, hp.y + dy, hp.z + fwz * d + rz * s];
      G.cam({ pos: cp(0.78, 0.22, -0.4), target: [hp.x, hp.y - 0.02, hp.z], fov: 34, to: { pos: cp(0.7, 0.2, -0.38), fov: 31 }, dur: 12 });
    }
    A.look(null);
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('sad'); }
    G.music('tomorrow');
    await G.wait(0.6);
    await G.say('AIDAN', 'Hospital. [beat] She fell. [long beat] She fell and the alarm didn\'t— [beat] it didn\'t—');
    await G.wait(1.2);
    // the terminal wakes: the case, two buttons
    G.sfx('beep', { pos: [ES.term[0], 1.0, ES.term[1]], vol: 0.6 });
    G.cam({ pos: [4.6, 1.9, 0.4], target: [3.0, 0.95, 1.9], fov: 38 });
    A.look([ES.term[0], 1.0, ES.term[1]]);
    await G.wait(1.6);
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    A.look(null);
    note(G, 'The terminal. The case is still open.', 'c6_goal');
  }, { letterbox: false, skippable: true });

  // (his reaction at the terminal: from over the desk, low and to his left — his face, not the back of his head)
  function C6_faceCam(A) {
    const hp = V3(ES.term[0] - 0.05, 1.6, 1.08);
    try { A.raw.bones.head.getWorldPosition(hp); } catch (e) { /* rig */ }
    return { pos: [hp.x + 0.55, hp.y - 0.28, hp.z + 0.66], target: [hp.x, hp.y - 0.02, hp.z], fov: 34 };
  }
  // ---- 6-terminal (in-engine): "Close case (no further action)" → A+5 / "Leave it open" → F+2 ------------------------
  defineCutscene('6-terminal', async (G) => {
    const A = G.aidan;
    if (fv('c6_case')) return;
    if (A.raw) A.raw.idleLife = false;
    // to the terminal's side of the desk, beside the office chair (the chair stands on the spot in front of the screen:
    // a walk there stopped short against it, while a skip snapped him into it); from the east end he goes round the
    // chair by the window. Where he ends up is state: a plain placement after the walk (spec §14 skip)
    const TX = 2.35, TZ = 1.05;
    await A.walkTo(A.pos.x > ES.desk[0] ? [[Math.min(A.pos.x, 4.2), 0.45], [TX, 0.45], [TX, TZ]] : [[TX, TZ]], { speed: 0.8 });
    A.place(TX, TZ);
    await A.turn(0, 0.4);
    A.look([ES.term[0], 1.0, ES.term[1]]);
    G.cam({ pos: [ES.term[0] - 0.9, 1.75, 0.35], target: [ES.term[0], 0.98, ES.term[1] + 0.05], fov: 36 });
    await G.wait(0.5);
    const spec = (extra = {}) => ({
      heading: 'CASE 118-2231 — ESCALATION',
      fields: [['ACCOUNT', '4471-0932 (SIGNAL HILL)'], ['REP', 'AIDAN'], ['STORE LEADER', 'LUKA'], ['PRIOR CONTACT', '3 inbound calls (grandson)'], ['CALLBACK', 'Outstanding — 6 days'], ['STATUS', 'OPEN']],
      historyTitle: 'STATUS HISTORY', history: [['MON', 'Follow up tomorrow'], ['TUE', 'Follow up tomorrow'], ['WED', 'Follow up tomorrow']],
      ...extra,
    });
    let h = G.screen(spec({ buttons: ['Close case (no further action)', 'Leave it open'] }), { style: 'case', store: 'REGION 4 — ESCALATIONS', user: 'AIDAN' });
    await G.wait(0.4);
    const i = await h.choose({ start: 0 });
    if (i === 0) {
      // Close case → TRACK A +5. "Case closed." One second later it reopens itself.
      G.set('c6_case', 'closed');
      G.track('A', 5, 'Ch 6: closed the case');
      G.sfx('click', { vol: 0.8 });
      h = G.screen(spec({ fields: undefined, history: undefined, historyTitle: undefined, text: 'Case closed.' }), { style: 'case' });
      await G.wait(1.0);
      G.sfx('error', { vol: 0.7 });
      try { q(h.glitch(0.5, 1.2)); } catch (e) { /* ui */ }
      h = G.screen(spec({ fields: undefined, history: undefined, historyTitle: undefined, text: 'CASE 118-2231 — REOPENED — FOLLOW UP: TOMORROW' }), { style: 'case' });
      G.music('tomorrow', { clipped: true });
      await G.wait(2.4);
      await G.screen(null);
      G.cam(C6_faceCam(A));
      if (A.raw) { A.raw.expr('scared'); A.raw.eyes('down'); }
      await G.say('AIDAN', 'No. No, I didn\'t mean—');
      await G.wait(0.6);
    } else {
      // Leave it open → TRACK F +2
      G.set('c6_case', 'open');
      G.track('F', 2, 'Ch 6: left the case open');
      G.sfx('click', { vol: 0.6 });
      await G.wait(0.8);
      await G.screen(null);
      G.cam(C6_faceCam(A));
      if (A.raw) { A.raw.expr('sad'); A.raw.eyes('down'); }
      await G.say('AIDAN', 'No. [beat] It stays open.');
      await G.wait(0.4);
    }
    // far above, keys
    G.sfx('keys_far', { pos: [3, 6, 2.5], vol: 0.55 });
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); }
    A.look(null);
    note(G, 'The terminal. The case is still open.', 'c6_goal', { done: true });
    note(G, 'Luka\'s upstairs. Chloe said. The fire stairs — Level 5, 6.', 'c6_up');
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // 6C FIRE STAIRS B — Level 4 → Level 6 (floor to floor 3.6 m). Four flights of 1.15 m climb round two narrow wells,
  // stepping east as they rise, so no flight sits over another: L4 landing (x 0–1.6, y 0) → F1 north → half landing 1
  // (y 1.8) → F2 south → L5 landing (x 1.65–4.05, y 3.6) → F3 north → half landing 2 (y 5.4) → F4 south → L6 landing
  // (x 4.1–5.85, y 7.2). Doors on the south wall. The stair mass is solid concrete to the ground.
  // =================================================================================================================
  const FS = { W: 5.85, D: 5.8, H: 10.2, zN: 1.4, zS: 4.2, l4: 0.8, l5: 2.85, l6: 4.95 };
  defineRoom({
    id: 'c6_firestairs', name: 'FIRE STAIRS B', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'concrete', ambient: 'interior',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, FS.W, FS.D],
    entries: { l4: [FS.l4, 5.05, 180], l5: [FS.l5, 5.1, 180], l6: [FS.l6, 5.1, 180], start: [FS.l4, 5.05, 180] },
    cameras: [
      // straight down the stair void from above
      { id: 'c6_firestairs:well', vol: [0, 0, 2.85, FS.D], y: [-1, 3.3], type: 'static', pos: [1.42, 7.5, 2.4], target: [1.4, 0, 2.9], fov: 'fit' },
      // the Level 4 landing (the arrival), from up the first flight: the door he came through, the stairs going up
      { id: 'c6_firestairs:l4', vol: [0, 4.15, 1.65, FS.D], y: [-0.5, 0.6], pri: 2, type: 'static', pos: [1.35, 4.3, 0.3], target: [0.75, 0.85, 5.2], fov: 'fit' },
      // high in the north-west corner, following him round the upper flights
      { id: 'c6_firestairs:upper', vol: [1.6, 0, FS.W, FS.D], y: [3.2, 8], type: 'pan', pos: [0.45, 9.85, 0.45], target: [3.6, 5.0, 3.6], fov: 50, pan: { lag: 0.3, yaw: 52, pitch: 30 } },
      // the Level 5 door (the plan taped to it), from over the half landing
      { id: 'c6_firestairs:l5door', vol: [1.65, 4.15, 4.05, FS.D], y: [3.4, 3.8], pri: 1, type: 'static', pos: [3.3, 7.25, 1.05], target: [2.75, 4.1, 5.4], fov: 'fit' },
      // low from the Level 5 landing, up at the Level 6 door (whatever comes down comes down in this shot)
      { id: 'c6_firestairs:l6door', vol: [4.1, 3.9, FS.W, FS.D], y: [7.0, 8], pri: 1, type: 'static', pos: [0.9, 5.7, 5.25], target: [5.1, 8.3, 4.75], fov: 'fit' },
    ],
    build(K) {
      const H = FS.H, conc = { tex: 'concrete', color: '#8a8d88' }, paint = { tex: 'plaster', color: '#7f8b86' };
      // the ground at the bottom of the wells (not walkable)
      K.box(FS.W / 2, -0.2, FS.D / 2, FS.W, 0.2, FS.D, { tex: 'concrete', color: '#4a4d4a' });
      // landings (their skirts make the concrete mass beneath them)
      K.floor(0, FS.zS, 1.6, FS.D, conc, { y: 0 });
      K.floor(0, 0, 2.8, FS.zN, conc, { y: 1.8 });
      K.floor(1.65, FS.zS, 4.05, FS.D, conc, { y: 3.6 });
      K.floor(2.9, 0, FS.W, FS.zN, conc, { y: 5.4 });
      K.floor(4.1, FS.zS, FS.W, FS.D, conc, { y: 7.2 });
      // flights (solid to the ground)
      K.stairs(0, FS.zS, 1.15, FS.zN, 0, 1.8, { axis: 'z', rail: 'right', mat: conc, bottom: 0 });
      K.stairs(1.65, FS.zN, 2.8, FS.zS, 1.8, 3.6, { axis: 'z', rail: 'left', mat: conc, bottom: 0 });
      K.stairs(2.9, FS.zS, 4.05, FS.zN, 3.6, 5.4, { axis: 'z', rail: 'right', mat: conc, bottom: 0 });
      K.stairs(4.55, FS.zN, 5.7, FS.zS, 5.4, 7.2, { axis: 'z', rail: 'left', mat: conc, bottom: 0 });
      K.box(5.78, 0, 2.8, 0.15, 7.2, 2.8, conc);                                      // the strip east of F4 (solid)
      // yellow nosing paint on the landing edges
      for (const [x0, x1, z, y] of [[0, 1.15, FS.zS, 0], [1.65, 2.8, FS.zN, 1.8], [2.9, 4.05, FS.zS, 3.6], [4.55, 5.7, FS.zN, 5.4]]) K.box((x0 + x1) / 2, y, z, x1 - x0, 0.005, 0.06, { color: '#c9a22a', roughness: 0.6 });
      // the well-edge rails on the half landings
      for (const [x0, x1, z, y] of [[1.15, 1.65, FS.zN, 1.8], [4.05, 4.55, FS.zN, 5.4]]) { K.box((x0 + x1) / 2, y + 0.9, z + 0.03, x1 - x0 + 0.05, 0.04, 0.04, { tex: 'metal', color: '#8d9594' }); K.collider(x0, z, x1, z + 0.08, { h: 1, y }); }
      // balustrades where a landing drops to the one below (steel posts, rail, mid-rail; a painted edge)
      const rail = { tex: 'metal', color: '#8d9594', roughness: 0.5, metalness: 0.4 };
      for (const [x, z0, z1, y] of [[1.65, FS.zS, FS.D, 3.6], [4.1, FS.zS, FS.D, 7.2], [2.9, 0, FS.zN, 5.4]]) {
        const L = z1 - z0;
        K.box(x + 0.03, y + 0.95, (z0 + z1) / 2, 0.05, 0.05, L, rail); K.box(x + 0.03, y + 0.5, (z0 + z1) / 2, 0.025, 0.025, L, rail);
        for (let zz = z0 + 0.1; zz <= z1 - 0.05; zz += 0.75) K.box(x + 0.03, y, zz, 0.04, 0.97, 0.04, rail);
        K.box(x + 0.06, y, (z0 + z1) / 2, 0.12, 0.006, L, { color: '#c9a22a', roughness: 0.6 });
        K.box(x - 0.01, y - 0.25, (z0 + z1) / 2, 0.03, 0.25, L, { tex: 'concrete', color: '#6e716c' });
      }
      // walls (painted concrete; a darker dado) — the south wall in three bands, each with its door
      K.wall(-0.1, 0, FS.W + 0.1, 0, H, paint, {});
      K.wall(0, FS.D + 0.1, 0, -0.1, H, paint, {});
      K.wall(FS.W, -0.1, FS.W, FS.D + 0.1, H, paint, {});
      K.wall(FS.W + 0.1, FS.D, -0.1, FS.D, 3.6, paint, { openings: [{ at: FS.W + 0.1 - FS.l4, w: 1.0, h: 2.15 }] });
      K.wall(FS.W + 0.1, FS.D, -0.1, FS.D, 3.6, paint, { y: 3.6, openings: [{ at: FS.W + 0.1 - FS.l5, w: 1.0, h: 2.15 }] });
      K.wall(FS.W + 0.1, FS.D, -0.1, FS.D, 3.0, paint, { y: 7.2, openings: [{ at: FS.W + 0.1 - FS.l6, w: 1.0, h: 2.15 }] });
      K.ceiling(0, 0, FS.W, FS.D, H, 'concrete');
      for (const y of [0, 1.8, 3.6, 5.4, 7.2]) K.box(FS.W / 2, y + 0.95, 0.03, FS.W, 0.06, 0.02, { color: '#5b6a64', roughness: 0.8 }, { shadow: false });
      // the doors
      K.door({ id: 'c6_firestairs:l4', x: FS.l4, z: FS.D, y: 0, rot: 0, w: 0.9, style: 'fire', to: 'c5_level4', entry: 'firestairs', sign: 'LEVEL 4', signBack: 'LEVEL 4' });
      K.door({ id: 'c6_firestairs:l5', x: FS.l5, z: FS.D, y: 3.6, rot: 0, w: 0.9, style: 'fire', to: 'c6_level5', entry: 'stairs', signBack: 'LEVEL 5' });
      const power = flag('c6_power');
      K.door({ id: 'c6_firestairs:l6', x: FS.l6, z: FS.D, y: 7.2, rot: 0, w: 0.9, style: 'fire', to: 'c6_level6', entry: 'stairs', signBack: 'LEVEL 6', reader: 'maglock', locked: !power, lockMsg: 'It won\'t open. The maglock light is red.' });
      // stencilled level numbers beside each door, exit signs, emergency bulkheads
      K.plane(FS.l4 + 0.1, 2.9, FS.D - 0.08, 0.5, 0.62, levelTex(4), { rotY: 180, transparent: true });
      K.plane(FS.l5 + 0.85, 5.35, FS.D - 0.08, 0.6, 0.75, levelTex(5), { rotY: 180, transparent: true });
      K.plane(FS.l6 - 0.62, 8.95, FS.D - 0.08, 0.6, 0.75, levelTex(6), { rotY: 180, transparent: true });
      K.sign('FIRE STAIRS B\nLEVELS 4 — 6', 1.4, 1.8 + 1.55, 0.08, 0.6, 0.3, { style: 'shop', bg: '#1f4a38', fg: '#e8ece6' });
      for (const [x, y] of [[FS.l4, 0], [FS.l5, 3.6], [FS.l6, 7.2]]) K.prop('exit_sign', x, FS.D - 0.08, 180, { mount: y + 2.45 });
      const bulk = (x, y, z, rot, o = {}) => { K.box(x, y, z, 0.32, 0.12, 0.1, { color: '#dcdad2', roughness: 0.5 }, { rot }); return K.light('point', x, y - 0.1, z + (rot === 180 ? -0.25 : 0.25), { color: '#dfeae6', intensity: o.i ?? 2.6, distance: 5.5, flicker: !!o.flicker, bank: o.bank }); };
      bulk(0.8, 3.1, FS.D - 0.08, 180, { bank: 1 });
      bulk(1.4, 4.6, 0.08, 0, { bank: 1, i: 2.0 });
      bulk(2.85, 6.7, FS.D - 0.08, 180, { bank: 2, flicker: true });
      bulk(4.4, 8.3, 0.08, 0, { bank: 2, i: 2.0 });
      bulk(4.95, 9.9, FS.D - 0.08, 180, { bank: 3 });
      // leftovers: the smoko chair and the butt tin on the first half landing; a hose reel on the L5 landing
      K.prop('chair', 0.55, 0.6, 150, { variant: 'plastic', color: '#d8d4c8', y: 1.8 });
      K.cyl(1.0, 1.8, 0.35, 0.06, 0.1, { tex: 'metal', color: '#9a8a4a', metalness: 0.5 });
      for (let i = 0; i < 5; i++) K.cyl(0.96 + i * 0.02, 1.9, 0.33 + (i % 2) * 0.03, 0.005, 0.03, { color: '#e8e4d8' }, { rz: 70 + i * 10 });
      K.box(3.75, 3.6 + 1.0, FS.D - 0.14, 0.6, 0.7, 0.2, { color: '#9e2a20', roughness: 0.5 });
      K.cyl(3.75, 3.6 + 1.3, FS.D - 0.12, 0.22, 0.12, { color: '#b3261e', roughness: 0.5 }, { rx: 90 });
      K.writing('DID YOU CHECK', 3.8, 7.0, 0.08, 1.3, { rotY: 0 });
      K.prop('water_stain', 2.0, 5.2, 0, { surface: 'wall', mount: 7.0 });
      // the Fire Stairs Plan taped to the Level 5 door (map_office_upper)
      const planTaken = !!(S.taken && S.taken['c6_firestairs:plan']);
      K.plane(FS.l5 + 0.02, 3.6 + 1.45, FS.D - 0.115, 0.3, 0.4, planTaken ? { color: '#c6c1b0', roughness: 1 } : planTex(), { rotY: 180, name: 'c6fs:plan' });
      K.pickup('map_office_upper', FS.l5, 3.6 + 1.3, FS.D - 0.4, { id: 'c6_firestairs:plan', model: false, r: 1.2 });
      K.animate(() => { if (S.taken && S.taken['c6_firestairs:plan']) { const p = World.obj && World.obj('c6fs:plan'); if (p && p.material && p.material.map) p.material = K.mat({ color: '#c6c1b0', roughness: 1 }); } });
      // the taped sheet on the Level 6 door (until the power's on)
      if (!power) K.plane(FS.l6 + 0.02, 7.2 + 1.35, FS.D - 0.115, 0.3, 0.21, powerNoteTex(), { rotY: 180 });
      // not up before the terminal
      if (!fv('c6_case')) K.blocker(0, 3.55, 1.15, 4.3, 'Escalations first. I have to see it.');
      // ---- examine lines ----
      K.examine(1.4, 1.8 + 1.5, 0.3, ['"Fire stairs B. Levels four to six."', 'It doesn\'t go down from here. Only up.'], { id: 'c6fs:sign', r: 1.3 });
      K.examine(1.4, 0.6, 3.0, ['The well goes down a long way past four floors.', 'I dropped my keys down one of these once. I never heard them land.'], { id: 'c6fs:well', r: 1.2 });
      K.examine(0.9, 2.3, 0.6, ['A plastic chair and a tin of cigarette butts.', 'Somebody used to come out here to breathe.'], { id: 'c6fs:chair', r: 1.2 });
      K.examine(3.75, 4.9, FS.D - 0.3, 'Fire hose. Inspected in March. [beat] Everything in this building gets inspected.', { id: 'c6fs:hose', r: 1.1 });
      K.examine(1.7, 2.6, 2.9, 'The handrail\'s warm. [beat] Like somebody just let go of it.', { id: 'c6fs:rail', r: 1.1 });
      K.examine(2.15, 3.6 + 1.7, FS.D - 0.3, 'The emergency light\'s on its battery. It\'ll go eventually.', { id: 'c6fs:bulk', r: 1.3 });   // (the light is high over the Level 5 door: looked at from the landing)
      K.examine(3.8, 7.0, 0.35, ['"DID YOU CHECK." [beat] In marker, on the concrete.', 'It\'s old. It\'s been painted over and it came back through.'], { id: 'c6fs:writing', r: 1.4 });
      // the taped note (only while the power's off — it isn't there once the maglock is green); read before the door is
      // tried: with the kinds' default priorities the door always won the E press and the note could not be read
      K.examine(FS.l6 + 0.02, 8.55, FS.D - 0.4, async (G) => {
        S.done['c6:noteRead'] = true;
        await G.think('"No site power. Level 6 access control on the temp board — Level 5 core."');
        await G.think('So the power\'s on Level 5.');
        note(G, 'Level 6 won\'t open. The site power board — Level 5, the core.', 'c6_power');
      }, { id: 'c6fs:note', r: 1.0, prio: -0.1, when: () => !done('c6:noteRead') && !flag('c6_power') });
    },
    onUpdate() { C6_ambient(['#58625e', 0.2], ['#1f6f6a', 0.06]); },
    onLeave() { C6_ambientOff(); },
    async onEnter(G, from) {
      G.bars(null);
      C6_std('c6_firestairs');
      if (fv('c6_case')) G.bg((G2) => C6_walls(G2, 'c6_firestairs'));
      if (from === 'c5_level4' && fv('c6_case') && G.once('c6:stairsIn')) {
        await G.wait(1.2);
        G.sfx('keys_far', { pos: [4, 8.5, 3], vol: 0.5 });
        await G.wait(1.2);
        await G.think('Keys. [beat] Up there.');
      }
    },
  });

  // =================================================================================================================
  // 6C LEVEL 5 — the floor stripped back to the slab (32 × 24 m, ceiling 3.4): a 4 m loop of bare concrete round the
  // sheeted bays (x 4–20, z 4–20) and the lift core (x 20–28, z 4–20). Glass on the north, west and east; the stair
  // door (SW, x 2) on the south wall. Dust barriers hang across all four legs of the loop. The builders' temporary
  // power board is on the core's east face (→ c6_power: the festoons here, the maglock on Level 6).
  // =================================================================================================================
  const L5 = { W: 32, D: 24, H: 3.4, board: [28.12, 9.2], lifts: [22.5, 25.5] };
  const L5_FEST = [[2, 7.5], [10, 2], [22, 2], [30, 15], [15, 22]];
  defineRoom({
    id: 'c6_level5', name: 'LEVEL 5', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'concrete', ambient: 'interior',
    fog: { density: 0.034, color: '#3b4543' },
    bounds: [0, 0, L5.W, L5.D],
    entries: { stairs: [2, 22.9, 180], start: [2, 22.9, 180] },
    cameras: [
      // the arrival: from along the south corridor, back at the stair door and the west leg going north into the dark
      // (from the east: a camera up the west leg lost him behind the bays' sheeting as soon as he turned the corner)
      { id: 'c6_level5:door', vol: [0, 19.6, 7.2, 24], type: 'static', pos: [12.2, 2.9, 22.7], target: [2.4, 0.7, 21.6], fov: 'fit' },
      // the west leg, from its north end: the dust barrier halfway, whatever's behind it
      { id: 'c6_level5:west', vol: [0, 3.7, 4, 19.6], type: 'pan', pos: [2.0, 2.7, 0.45], target: [2.0, 0.9, 9.5], fov: 50, pan: { lag: 0.3, yaw: 26, pitch: 30 } },
      // the north leg, west half: from the far end, back toward the corner
      { id: 'c6_level5:northw', vol: [0, 0, 16, 3.7], type: 'pan', pos: [21.5, 2.7, 3.3], target: [8, 0.9, 2], fov: 48, pan: { lag: 0.3, yaw: 30, pitch: 22 } },
      // the north leg, east half: low, through the dust barrier at x 10 (the Standard's shot)
      { id: 'c6_level5:northe', vol: [16, 0, 32, 3.7], type: 'pan', pos: [9.3, 0.45, 1.3], target: [24, 1.9, 2.1], fov: 46, pan: { lag: 0.35, yaw: 22, pitch: 16 } },
      // the east leg: from its north end, down past the power board toward the lifts
      { id: 'c6_level5:east', vol: [28, 3.7, 32, 19.8], type: 'pan', pos: [30.6, 2.7, 0.45], target: [30, 0.9, 11], fov: 48, pan: { lag: 0.3, yaw: 26, pitch: 30 } },
      // the lifts: from the south corridor's west half, through the dust barrier at x 14
      { id: 'c6_level5:lifts', vol: [16, 19.8, 32, 24], type: 'static', pos: [9.8, 2.7, 23.4], target: [24.5, 0.9, 21.4], fov: 'fit' },
      // the south corridor, west half: from the east end looking back through the barrier toward the door
      { id: 'c6_level5:south', vol: [7.2, 19.8, 16, 24], type: 'pan', pos: [21.8, 2.95, 23.2], target: [9, 0.9, 22], fov: 46, pan: { lag: 0.3, yaw: 26, pitch: 22 } },
    ],
    spawns: [
      { id: 'c6_level5:teth', type: 'tethered', pos: [17.2, 1.25], rot: 160, anchor: [17.2, 1.25] },
      { id: 'c6_level5:reach', type: 'reach', pos: [26.4, 22.6], rot: 180 },
    ],
    build(K) {
      const H = L5.H, conc = { tex: 'concrete', color: '#8d8f89' }, power = flag('c6_power');
      // ---- floors (the loop only), the slab under the bays, the ceiling ----
      K.floor(0, 0, L5.W, 4, conc); K.floor(0, 4, 4, 20, conc); K.floor(28, 4, L5.W, 20, conc); K.floor(0, 20, L5.W, L5.D, conc);
      K.box(12, -0.03, 12, 16, 0.03, 16, conc);
      K.ceiling(0, 0, L5.W, L5.D, H, 'concrete');
      // ---- the building's glass (N, W, E) and the south wall (stair door, plant room) ----
      C6_glazing(K, 0, 0, L5.W, 0, H); C6_glazing(K, 0, L5.D, 0, 0, H); C6_glazing(K, L5.W, 0, L5.W, L5.D, H);
      K.wall(L5.W + 0.1, L5.D, -0.1, L5.D, H, 'plaster_stained', { skirting: true, grime: true, openings: [{ at: L5.W + 0.1 - 2, w: 1.0, h: 2.15 }, { at: L5.W + 0.1 - 17, w: 1.0, h: 2.15 }] });
      K.door({ id: 'c6_level5:stairs', x: 2, z: L5.D, rot: 0, w: 0.9, style: 'fire', to: 'c6_firestairs', entry: 'l5', sign: 'FIRE STAIRS B' });
      K.door({ id: 'c6_level5:plant', x: 17, z: L5.D, rot: 0, w: 0.9, style: 'metal', locked: true, lockMsg: 'It\'s locked. "PLANT ROOM — AUTHORISED PERSONS ONLY."', sign: 'PLANT ROOM' });
      K.prop('exit_sign', 2, L5.D - 0.08, 180, { mount: 2.45 });
      // ---- the lift core: lifts on its south face, the riser and the toilets on its east face ----
      K.wall(28, 4, 20, 4, H, 'plaster', { skirting: true });
      K.wall(28, 20, 28, 4, H, 'plaster', { skirting: true, openings: [{ at: 20 - 17, w: 1.0, h: 2.15 }, { at: 20 - 6, w: 1.0, h: 2.15 }] });
      K.wall(20, 20, 28, 20, H, 'plaster', { skirting: true, openings: [{ at: L5.lifts[0] - 20, w: 1.22, h: 2.2 }, { at: L5.lifts[1] - 20, w: 1.22, h: 2.2 }] });
      K.wall(20, 4, 20, 20, H, 'plaster', {});
      K.box(24, 0, 12, 7.8, H, 15.8, { tex: 'concrete', color: '#5a5c58' });
      K.prop('lift_doors', L5.lifts[0], 20.09, 0, { floor: '5' });
      K.prop('lift_doors', L5.lifts[1], 20.09, 0, { floor: '5', sign: 'DO NOT USE' });
      // lift B: the car is stuck just above this floor — its light leaks through the top of the doors
      K.box(L5.lifts[1], 2.08, 20.1, 1.0, 0.025, 0.02, { color: '#e8f4ef', emissive: '#dff2ec', emissiveIntensity: 1.6 }, { shadow: false });
      K.light('point', L5.lifts[1], 2.2, 20.6, { color: '#cfe8e2', intensity: 1.1, distance: 3.2, flicker: true, real: false });
      K.door({ id: 'c6_level5:toilets', x: 28, z: 17, rot: 90, w: 0.85, style: 'wood', locked: true, lockMsg: 'It\'s locked. "OUT OF ORDER — PLEASE USE LEVEL 4."', sign: 'TOILETS' });
      K.door({ id: 'c6_level5:riser', x: 28, z: 6, rot: 90, w: 0.85, style: 'metal', locked: true, lockMsg: 'It\'s locked. "ELECTRICAL RISER."', sign: 'RISER' });
      // ---- the sheeted bays (not walkable): sheeting on battens, partitions inside, what's left of an office ----
      C6_sheetRun(K, 4, 4, 4, 20, H, { seed: 3 }); C6_sheetRun(K, 4, 4, 20, 4, H, { seed: 11 }); C6_sheetRun(K, 4, 20, 20, 20, H, { seed: 19 });
      C6_sheetRun(K, 4, 12, 20, 12, H, { seed: 27, collide: false }); C6_sheetRun(K, 12, 4, 12, 20, H, { seed: 35, collide: false });
      K.box(4, H - 0.08, 12, 0.06, 0.06, 16, { color: '#b39b72' }); K.box(12, H - 0.08, 4, 16, 0.06, 0.06, { color: '#b39b72' }); K.box(12, H - 0.08, 20, 16, 0.06, 0.06, { color: '#b39b72' });
      for (const [x, z, r] of [[6.4, 6.8, 0], [9.2, 7.2, 10], [6.8, 9.6, -5]]) K.prop('drop_sheet', x, z, r, { variant: 'draped', w: 1.6, d: 0.8, h: 0.75 });
      K.prop('stacked_chairs', 9.8, 9.8, 20, {});
      C6_scaffold(K, 16, 7.5, 0, { collide: false, h: 3.0 });
      board(K, 16.5, 10.2, 90, 10);
      K.prop('stacked_chairs', 6.2, 17.6, 0, {});
      for (let i = 0; i < 4; i++) K.cyl(8.2 + i * 0.35, 0, 14.4, 0.14, 1.9, { tex: 'carpet', color: '#4c5660' });
      K.box(16, 0, 16, 1.3, 1.0, 2.2, { color: '#c46a1c', roughness: 0.6 }); K.box(16, 1.0, 16, 1.1, 0.12, 2.0, { tex: 'metal', color: '#6a6e6c' }); K.box(16, 1.1, 16, 1.2, 0.9, 0.04, { tex: 'metal', color: '#c46a1c' });
      K.prop('paint_tins', 14.2, 17.8, 30, {});
      C6_studs(K, 4.3, 20.0, 4.3, 14, H);
      // ---- dust barriers across the loop ----
      C6_curtain(K, 2, 12.6, 0, 4, H, 'l5w'); C6_curtain(K, 10, 2, 90, 4, H, 'l5n'); C6_curtain(K, 30, 13.4, 0, 4, H, 'l5e'); C6_curtain(K, 14, 22, 90, 4, H, 'l5s');
      // ---- services overhead: a duct and a cable tray along the north leg, hanging ends where the ceiling came down ----
      K.box(15.5, H - 0.5, 1.2, 21, 0.4, 0.6, { tex: 'metal', color: '#9aa09c', roughness: 0.5, metalness: 0.4 });
      for (const x of [5, 26]) K.box(x, H - 0.5, 1.2, 0.05, 0.42, 0.62, { color: '#2a2c2c' });
      K.prop('cable_tray', 16, 3.0, 90, { ceil: H, len: 30 });
      for (const [x, z] of [[6, 2.8], [13, 1.7], [25, 2.9], [30.5, 9], [2.8, 16], [21, 22.6]]) K.cyl(x, H - 0.9, z, 0.01, 0.9, { color: '#1a1a1a' }, { rz: 8 });
      for (const [x, z] of [[1.4, 5], [3.2, 13.5], [8, 22.7], [24, 1.2], [30.8, 18]]) K.box(x, H - 0.03, z, 1.2, 0.02, 0.025, { tex: 'metal', color: '#c9ccca' });
      // ---- the floor: carpet-glue scars, chalk lines, tape where the new walls go, drop sheets, cables ----
      for (const [x, z, w, d, r] of [[2, 9, 2.4, 3.1, 4], [10, 2.2, 3.3, 2.6, -8], [21, 22, 2.8, 3.2, 12], [30, 7, 2.2, 3.4, 0], [26, 1.8, 3, 2.1, 20]]) glueScar(K, x, z, w, d, r);
      tape(K, 0.6, 5, 3.6, 5); tape(K, 26.2, 0.6, 26.2, 3.4); tape(K, 28.6, 20.4, 31.4, 20.4, '#e8e4d8'); tape(K, 7, 20.6, 7, 23.4, '#e8e4d8');
      K.prop('drop_sheet', 2.4, 4.8, 12, { w: 2.2, d: 1.5 }); K.prop('drop_sheet', 23.5, 2.3, -6, { w: 2.6, d: 1.6 }); K.prop('drop_sheet', 11, 22.8, 4, { w: 2.4, d: 1.4 });
      K.dress('cables', [0.5, 20.5, 16, 23.5], 5, { seed: 511 }); K.dress('papers', [28.5, 4.5, 31.5, 19.5], 6, { seed: 512 }); K.dress('boxes', [0.5, 0.5, 3.5, 3.5], 2, { seed: 513 });
      // ---- the arrival (SW): the site notice, the hard hats, the builders' lunch ----
      K.sign('LEVEL 5 — REFURBISHMENT\nCONTRACTORS ONLY', 6.4, 1.75, L5.D - 0.1, 1.3, 0.55, { style: 'warning', rotY: 180 });
      K.box(9.2, 1.45, L5.D - 0.06, 1.1, 0.12, 0.05, { tex: 'wood', color: '#7a6242' });
      C6_hardHat(K, 8.85, 1.36, L5.D - 0.2, '#e8e4d8', { rx: -60 }); C6_hardHat(K, 9.55, 1.36, L5.D - 0.2, '#d8b928', { rx: -60 });
      K.box(10.2, 0.95, L5.D - 0.05, 0.42, 0.62, 0.03, { color: '#e87a1c', roughness: 0.8 });
      K.box(10.2, 1.2, L5.D - 0.035, 0.42, 0.04, 0.01, { color: '#d8dcd6', roughness: 0.3, metalness: 0.6 });
      K.prop('esky', 5.4, 23.2, 10, {});
      K.prop('sandwich', 5.35, 23.2, 30, { y: 0.42 });
      K.cyl(5.75, 0.42, 23.05, 0.045, 0.28, { color: '#2a4a8a', roughness: 0.4, metalness: 0.4 });
      K.box(7.6, 0, 23.3, 0.36, 0.3, 0.36, { color: '#2a5a3a', roughness: 0.8 });
      K.box(7.6, 0.3, 23.3, 0.28, 0.16, 0.12, { color: '#3a3a3a', roughness: 0.6 }, { rot: 15 });
      K.pickup('energy_drink', 7.55, 0.47, 23.32, { id: 'c6_level5:energy', extraOnEasy: true, rot: 40 });
      C6_stepLadder(K, 1.2, 15.5, 90);
      K.prop('paint_tins', 3.3, 21.2, 0, {});
      board(K, 0.75, 20.8, 0, 6);
      K.prop('mop_bucket', 13, 23.4, 200, {});
      K.writing('IT\'LL BE FINE', 24, 1.7, 3.93, 1.7, { rotY: 180 });
      // ---- the east leg: the temporary power board, the builders' programme ----
      const [bx, bz] = L5.board;
      K.box(bx + 0.18, 0.55, bz, 0.34, 0.95, 0.62, { tex: 'metal', color: '#6f7571', roughness: 0.5, metalness: 0.4 }, {});
      K.box(bx + 0.36, 0.7, bz - 0.12, 0.02, 0.5, 0.26, { color: '#1c1e1e' });
      K.box(bx + 0.36, 1.25, bz + 0.16, 0.03, 0.12, 0.12, { color: '#d8b928', roughness: 0.5 });
      const lever = new THREE.Group(); lever.position.set(bx + 0.39, 1.31, bz + 0.16);
      lever.add(mesh(sgeo('lever', () => new THREE.BoxGeometry(0.04, 0.16, 0.035)), smat('leverRed', () => new THREE.MeshStandardMaterial({ color: '#c0281e', roughness: 0.5 })), 0, 0.05, 0));
      lever.rotation.x = power ? 0 : 1.4;
      K.mesh(lever, { name: 'c6l5:lever' });
      for (let i = 0; i < 5; i++) K.box(bx + 0.36, 0.72 + i * 0.1, bz - 0.12, 0.03, 0.05, 0.22, { color: '#e8e4d8', roughness: 0.5 });
      K.cyl(bx + 0.18, 0, bz, 0.02, 0.55, { tex: 'metal', color: '#5a5e5c' });
      K.sign('TEMP SUPPLY — L5 / L6\nDO NOT ISOLATE', bx + 0.03, 1.95, bz, 0.9, 0.34, { style: 'warning', rotY: 90 });
      K.light('led', bx + 0.38, 1.1, bz + 0.3, { color: power ? '#2aff5a' : '#ff2a1c', name: 'c6l5:led', blink: !power });
      K.cyl(bx + 0.5, 0.02, bz - 0.4, 0.03, 0.03, { color: '#141414' }, { rz: 90 });
      K.dress('cables', [28.4, 7.6, 31.6, 11.2], 4, { seed: 514 });
      // (screwed to the core's east face between the riser door and the power board)
      K.box(28.095, 0.98, 7.55, 0.03, 1.1, 1.58, { color: '#dcdcd6', roughness: 0.4 });
      K.plane(28.115, 1.55, 7.55, 1.5, 1.0, siteBoardTex(), { rotY: 90 });
      K.box(28.14, 0.95, 7.55, 0.06, 0.04, 1.56, { tex: 'metal', color: '#c3c8c6' });
      C6_scaffold(K, 31.1, 17.3, 90, {});
      // ---- light: two battery work lights; the festoons (dead until the site power's back) ----
      C6_workLight(K, 3.4, 21.3, -40, { intensity: 5.5, distance: 9, bank: 1 });
      C6_workLight(K, 31.3, 7.4, -135, { intensity: 5.0, distance: 8, bank: 2 });
      C6_workLight(K, 14.2, 3.6, -80, { intensity: 4.6, distance: 9, bank: 2 });
      C6_festoon(K, [2, 1.2], [2, 22.5], H); C6_festoon(K, [2.5, 2], [29.5, 2], H); C6_festoon(K, [30, 2.5], [30, 22.5], H); C6_festoon(K, [2.5, 22], [29.5, 22], H);
      C6_festoonOn(power);
      L5_FEST.forEach(([x, z], i) => K.light('point', x, H - 0.4, z, { color: '#ffd49a', intensity: 3.6, distance: 8.5, name: 'c6l5:fest' + i, on: power, bank: 3 }));
      // ---- the power board: throw the isolator (c6_power) ----
      K.interact(bx + 0.45, 1.2, bz, (G) => G.cutscene('6-power'), { id: 'c6l5:board', r: 1.3, when: () => !flag('c6_power') });
      K.examine(bx + 0.45, 1.2, bz, 'The isolator\'s on. [beat] Somebody\'s written "WHO TURNED THIS OFF??" on the lid.', { id: 'c6l5:boardon', r: 1.3, when: () => flag('c6_power') });
      // CALL 7, as the lights come back (he's standing at the board)
      K.trigger([bx - 0.3, bz - 2.2, L5.W, bz + 2.2], (G) => G.call('luka7'), { id: 'c6_level5:call7', when: (s) => s.chapter === 6 && !!(s.flags && s.flags.c6_power) && !(s.calls && s.calls.luka7) });
      // ---- examine lines ----
      K.examine(6.4, 1.75, L5.D - 0.35, ['"Refurbishment in progress. Contractors only."', 'Nobody\'s been contracted to anything in a while, by the look of it.'], { id: 'c6l5:notice', r: 1.4 });
      K.examine(9.2, 1.35, L5.D - 0.35, ['Two hard hats and a hi-vis vest on a hook.', 'Everybody left at the same time. Nobody took their hat.'], { id: 'c6l5:hats', r: 1.3 });
      K.examine(5.4, 0.6, 23.1, ['A sandwich in cling wrap on an esky. "DAZ" in marker on the lid.', 'Half eaten. He was coming back for it.'], { id: 'c6l5:lunch', r: 1.2 });
      K.examine(4.1, 1.6, 9, ['Plastic sheeting all the way up. Something behind it — desks under dust sheets.', 'The whole floor\'s holding its breath.'], { id: 'c6l5:sheetW', r: 1.5 });
      K.examine(12, 1.6, 4.1, ['Somebody cut a slit in the plastic here. Then taped it shut again.', 'From the inside.'], { id: 'c6l5:slit', r: 1.4 });
      K.examine(L5.lifts[1], 1.4, 20.4, async (G) => { G.sfx('lift_groan', { pos: [L5.lifts[1], 2.4, 19.8], vol: 0.7 }); await G.think('There\'s light at the top of the doors. [beat] The car\'s stuck just above this floor.'); await G.think('Something in there is holding a lot of weight.'); }, { id: 'c6l5:liftB', r: 1.3 });
      K.examine(L5.lifts[0], 1.4, 20.4, '"Out of service." [beat] They\'ve been out of service since I came in.', { id: 'c6l5:liftA', r: 1.3 });
      K.examine(28.3, 1.5, 7.55, ['The builders\' programme. "L6 carpet — week 3. Lift B — do not use."', '"Who keeps leaving the lights on?" [beat] Nobody. Nobody\'s been here.'], { id: 'c6l5:programme', r: 1.4 });
      K.examine(31.4, 1.2, 12, ['Glass all the way down. Out there it\'s fog, and under the fog the town.', 'A few streetlights, very far down. Orange, like bruises.'], { id: 'c6l5:window', r: 1.6 });
      K.examine(24, 1.5, 3.7, ['"IT\'LL BE FINE." Written in marker, then sanded, then painted over.', 'It came back through the paint.'], { id: 'c6l5:writing', r: 1.5 });
      K.examine(16, 1.2, 4.1, 'A scaffold tower behind the plastic. Somebody\'s left a coffee cup up on the top boards.', { id: 'c6l5:scaffold', r: 1.3 });
      K.examine(1.2, 1.0, 15.5, 'A step ladder, folded open. Paint on every rung. Brilliant White.', { id: 'c6l5:ladder', r: 1.2 });
    },
    onUpdate() { C6_ambient(['#5c6763', flag('c6_power') ? 0.36 : 0.3], ['#1f6f6a', 0.06]); },
    onLeave() { C6_ambientOff(); },
    async onEnter(G, from) {
      G.bars(null);
      C6_std('c6_level5');
      G.bg((G2) => C6_walls(G2, 'c6_level5'));
      // lift B groans now and then
      G.bg(async (G2) => { for (;;) { await G2.wait(14 + Math.random() * 14); if (!G2.inRoom('c6_level5')) return; G2.sfx('lift_groan', { pos: [L5.lifts[1], 2.4, 19.6], vol: 0.55 }); } });
      if (from === 'c6_firestairs' && G.once('c6:l5in')) {
        await G.wait(1.4);
        await G.think('Level 5. [beat] Half of it\'s been pulled out.');
      }
    },
  });

  // ---- 6-power (in-engine): the isolator on the temporary board — the festoons, and upstairs the maglock lets go ----
  defineCutscene('6-power', async (G) => {
    const A = G.aidan, [bx, bz] = L5.board;
    if (flag('c6_power')) return;
    if (A.raw) A.raw.idleLife = false;
    await A.walkTo(bx + 0.95, bz + 0.15, { speed: 0.9 });
    await A.turn(-90, 0.4);
    A.look([bx + 0.4, 1.3, bz + 0.16]);
    G.cam({ pos: [bx + 2.6, 1.85, bz + 2.2], target: [bx + 0.35, 1.2, bz + 0.1], fov: 38 });
    await G.wait(0.4);
    q(A.gesture('reach', { hand: 'L', target: [bx + 0.4, 1.33, bz + 0.16] }));
    await G.wait(0.5);
    // state first
    G.set('c6_power', true);
    const lever = G.obj('c6l5:lever'); if (lever) lever.rotation.x = 0;
    G.sfx('clunk', { pos: [bx + 0.4, 1.3, bz + 0.16], vol: 1 });
    const led = G.light('c6l5:led'); if (led) led.set({ color: '#2aff5a' });
    await G.wait(0.5);
    // the festoons come on one string at a time (a hum, a tick, the bulbs)
    C6_festoonOn(true);
    G.sfx('tube_flicker', { pos: [30, 3, 12], vol: 0.6 });
    for (let i = 0; i < L5_FEST.length; i++) { const h = G.light('c6l5:fest' + i); if (h) h.on(true); if (!G.skipping) await G.wait(0.18); }
    G.cam({ pos: [30.6, 2.9, 1.0], target: [30, 1.1, 12], fov: 48 });
    await G.wait(0.8);
    // somewhere above: the maglock on Level 6 lets go
    G.sfx('maglock', { pos: [2, 6.5, 24], vol: 0.6 });
    await G.wait(0.8);
    if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); }
    A.look(null);
    await G.think('Something upstairs just unlocked.');
    note(G, 'Level 6 won\'t open. The site power board — Level 5, the core.', 'c6_power', { done: true });
    note(G, 'The power\'s on. Level 6 — the fire stairs.', 'c6_up6');
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // 6C/6E LEVEL 6 — half fitted out (32 × 24 m, ceiling 2.9, the grid half tiled): the west leg from the stair door
  // (SW), the north leg along the glass, the east leg past the core, a spine corridor south of the sheeted bays with
  // Luka's back office door (x 9) and the locked site office, and the carpeted lift lobby (x 20–32, z 14–24): the
  // feature wall, lift A dead, lift B ajar (the car stuck just below), the payphone. Cutscene 6-2 plays in the lobby.
  // In the Outage (after lift B is forced) the lobby dissolves and the doorway leads down into the shaft.
  // =================================================================================================================
  const L6 = { W: 32, D: 24, H: 2.9, liftA: 22, liftB: 26, office: 9, planter: [25.4, 18.4] };
  defineRoom({
    id: 'c6_level6', name: 'LEVEL 6', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'concrete', ambient: 'office',
    fog: { density: 0.032, color: '#3b4543' },
    surfaces: [{ box: [20, 14, 32, 24], s: 'carpet' }, { box: [4, 16, 20, 20], s: 'carpet' }],
    bounds: [0, 0, L6.W, L6.D],
    entries: { stairs: [2, 22.9, 180], office: [L6.office, 19.1, 180], lifts: [25.2, 18.6, 180], start: [2, 22.9, 180] },
    cameras: [
      // the arrival: from up the west leg, back at the stair door (the spine opening off to the left)
      { id: 'c6_level6:door', vol: [0, 17.6, 4.3, 24], type: 'static', pos: [2.3, 2.55, 11.4], target: [2.4, 0.6, 22.2], fov: 'fit' },
      // the west leg from its north end, through the dust barrier
      { id: 'c6_level6:west', vol: [0, 3.7, 4, 17.6], type: 'pan', pos: [2.0, 2.4, 0.45], target: [2.0, 0.9, 10], fov: 50, pan: { lag: 0.3, yaw: 26, pitch: 30 } },
      // the north leg, west half: from beyond the barrier at x 16.5 (Aidan through the plastic)
      { id: 'c6_level6:northw', vol: [0, 0, 16.3, 3.7], type: 'pan', pos: [21.6, 2.35, 3.2], target: [8, 0.9, 2], fov: 46, pan: { lag: 0.3, yaw: 28, pitch: 20 } },
      // the north leg, east half: low from the west, through the barrier
      { id: 'c6_level6:northe', vol: [16.3, 0, 32, 3.7], type: 'pan', pos: [11.6, 0.45, 1.1], target: [25, 1.8, 2.2], fov: 46, pan: { lag: 0.35, yaw: 22, pitch: 16 } },
      // the east leg, from its north end, down into the lobby
      { id: 'c6_level6:east', vol: [28, 3.7, 32, 14.4], pri: 1, type: 'pan', pos: [30.5, 2.4, 0.45], target: [30, 0.9, 9], fov: 48, pan: { lag: 0.3, yaw: 26, pitch: 30 } },
      // the spine, from the lobby end: Luka's door on the left, the barrier at the far end
      { id: 'c6_level6:spine', vol: [4.3, 15.8, 20, 20], type: 'pan', pos: [22.4, 2.45, 17.2], target: [9, 0.9, 18], fov: 44, pan: { lag: 0.3, yaw: 20, pitch: 18 } },
      // the lift lobby: a static from the corner by the payphone, the lifts and the feature wall
      { id: 'c6_level6:lobby', vol: [20, 13.2, 27.1, 24], type: 'static', pos: [31.7, 2.5, 23.65], target: [23.4, 0.95, 15.4], fov: 'fit' },
      // the payphone end, from beside the lifts
      { id: 'c6_level6:phone', vol: [27.1, 13.8, 32, 24], type: 'static', pos: [21.0, 2.7, 14.5], target: [30.2, 0.8, 21.4], fov: 'fit' },
    ],
    spawns: [
      { id: 'c6_level6:teth', type: 'tethered', pos: [1.7, 6.4], rot: 180, anchor: [1.7, 6.4] },
    ],
    build(K) {
      const H = L6.H, conc = { tex: 'concrete', color: '#8d8f89' }, carpet = { tex: 'carpet', color: '#3f4a55' };
      const doorsForced = flag('c6_doors');
      // ---- floors ----
      K.floor(0, 0, 4, L6.D, conc); K.floor(4, 0, L6.W, 4, conc); K.floor(28, 4, L6.W, 14, conc);
      K.floor(4, 16, 20, 20, carpet); K.floor(20, 14, L6.W, L6.D, carpet);
      K.box(12, -0.03, 10, 16, 0.03, 12, conc); K.box(12, -0.03, 22, 16, 0.03, 4, conc);
      // ---- ceilings: raw slab over the legs, the grid half tiled over the spine, finished over the lobby ----
      K.ceiling(0, 0, L6.W, L6.D, H + 0.5, 'concrete');
      K.ceiling(20, 14, L6.W, L6.D, H, 'ceiling_tile');
      K.ceiling(4, 16, 12, 20, H, 'ceiling_tile');
      for (let x = 4; x <= 20; x += 1.2) K.box(x, H - 0.01, 18, 0.03, 0.02, 4, { tex: 'metal', color: '#c9ccca' });
      for (let z = 16; z <= 20; z += 0.6) K.box(16, H - 0.01, z, 8, 0.02, 0.03, { tex: 'metal', color: '#c9ccca' });
      // ---- the glass, the south wall ----
      C6_glazing(K, 0, 0, L6.W, 0, H + 0.5); C6_glazing(K, 0, L6.D, 0, 0, H + 0.5); C6_glazing(K, L6.W, 0, L6.W, L6.D, H + 0.5);
      K.wall(L6.W + 0.1, L6.D, -0.1, L6.D, H + 0.5, 'plaster', { skirting: true, openings: [{ at: L6.W + 0.1 - 2, w: 1.0, h: 2.15 }] });
      K.door({ id: 'c6_level6:stairs', x: 2, z: L6.D, rot: 0, w: 0.9, style: 'fire', to: 'c6_firestairs', entry: 'l6', sign: 'FIRE STAIRS B', reader: 'maglock', locked: () => flag('c6_doors') && S.outage, lockMsg: 'Not now. He\'s down there.' });
      K.prop('exit_sign', 2, L6.D - 0.08, 180, { mount: 2.45 });
      // ---- the south rooms off the spine: Luka's back office door (the store's own door), the site office ----
      K.wall(20, 20, 4, 20, H, 'plaster', { skirting: true, openings: [{ at: 20 - L6.office, w: 1.0, h: 2.15 }, { at: 20 - 15, w: 1.0, h: 2.15 }] });
      K.wall(20, 24, 20, 20, H, 'plaster', {});
      K.wall(4, 16, 4, 20.1, H, 'plaster', { both: false });
      K.door({ id: 'c6_level6:office', x: L6.office, z: 20, rot: 180, w: 0.95, style: 'metal', color: '#6a7472', to: 'c6_lukaoffice', entry: 'door', sign: 'STAFF ONLY', locked: () => flag('c6_doors') && S.outage, lockMsg: 'Not now. He\'s down there.' });
      K.box(L6.office, 2.2, 19.93, 0.14, 0.06, 0.08, { color: '#e8e6de', roughness: 0.5 });
      K.box(L6.office + 0.33, 1.0, 19.88, 0.1, 0.3, 0.012, { tex: 'metal', color: '#d9dcdc', roughness: 0.3, metalness: 0.8 });
      K.plane(L6.office - 0.95, 1.55, 19.92, 0.9, 0.225, storeSignTex(), { rotY: 180 });
      K.door({ id: 'c6_level6:siteoffice', x: 15, z: 20, rot: 180, w: 0.9, style: 'wood', locked: true, lockMsg: 'It\'s locked. "SITE OFFICE — KEYS FROM L4 RECEPTION."', sign: 'SITE OFFICE' });
      // ---- the sheeted bays, the core ----
      C6_sheetRun(K, 4, 4, 4, 16, H + 0.5, { seed: 41 }); C6_sheetRun(K, 4, 4, 20, 4, H + 0.5, { seed: 47 }); C6_sheetRun(K, 4, 16, 20, 16, H + 0.5, { seed: 53 });
      C6_sheetRun(K, 12, 4, 12, 16, H + 0.5, { seed: 59, collide: false });
      for (const [x, z, r] of [[6.5, 7, 0], [9.2, 7.3, 8], [6.8, 12.8, -4], [15, 8, 90], [15.5, 12.5, 90]]) K.prop('drop_sheet', x, z, r, { variant: 'draped', w: 1.6, d: 0.8, h: 0.75 });
      K.prop('stacked_chairs', 9.6, 12.6, 10, {}); K.prop('stacked_chairs', 18.2, 6.2, -20, {});
      C6_scaffold(K, 17.8, 13.4, 0, { collide: false, h: 3.2 });
      K.wall(28, 4, 20, 4, H + 0.5, 'plaster', { skirting: true });
      K.wall(28, 14, 28, 4, H + 0.5, 'plaster', { skirting: true });
      K.wall(20, 14, 28, 14, H + 0.5, 'plaster', { skirting: true, openings: [{ at: L6.liftA - 20, w: 1.22, h: 2.2 }, { at: L6.liftB - 20, w: 1.22, h: 2.2 }] });
      K.wall(20, 4, 20, 16, H + 0.5, 'plaster', {});
      K.box(24, 0, 9, 7.8, H + 0.5, 9.8, { tex: 'concrete', color: '#5a5c58' });
      // the feature wall between the lifts, the lifts (A dead, B ajar: a light from the car just below)
      K.plane(24, 2.45, 14.08, 3.4, 0.53, featureTex(), { transparent: true, world: 'fog' });
      K.box(24, 0, 14.09, 1.9, 2.25, 0.02, { color: '#0f6f6c', roughness: 0.7 });
      K.prop('lift_doors', L6.liftA, 14.09, 0, { floor: '6' });
      const liftB = K.prop('lift_doors', L6.liftB, 14.09, 0, { floor: '6', sign: '', name: 'c6l6:liftB', open: doorsForced ? 0.75 : 0.09 });
      void liftB;
      K.box(L6.liftB, -0.35, 13.6, 1.05, 0.02, 0.8, { color: '#dff2ec', emissive: '#dff2ec', emissiveIntensity: 1.4 }, { shadow: false });
      K.light('point', L6.liftB, 0.2, 13.4, { color: '#cfe8e2', intensity: 1.6, distance: 3.5, flicker: true, name: 'c6l6:liftglow' });
      // ---- the lobby: finished — the payphone, chairs still wrapped, a dead plant, the directory ----
      K.payphone(29.4, L6.D - 0.08, 180, { wall: true, id: 'c6_level6:payphone' });
      K.sign('LEVEL 6\nREGIONAL LEADERSHIP — RELOCATING', 31.9, 1.7, 18.2, 1.1, 0.42, { style: 'office', rotY: -90 });
      for (let i = 0; i < 3; i++) { K.prop('chair', 25.3 + i * 0.62, 23.35, 180, { variant: 'waiting', color: '#3d5160' }); K.box(25.3 + i * 0.62, 0.35, 23.35, 0.52, 0.72, 0.5, { color: '#dfe4e2', roughness: 0.2, transparent: true, opacity: 0.25 }, { shadow: false }); }
      K.prop('plant_pot', 31.3, 14.6, 0, { variant: 'dead', collide: false }); K.collider(31.05, 14.35, 31.55, 14.85, { h: 0.6 });
      // a long, low planter in the lobby (Aidan sits against it in 6-2) — low, so the lobby's two cameras see over it
      // (a floor-to-ceiling column here hid Aidan from both of them)
      {
        const [px, pz] = L6.planter;
        K.box(px, 0, pz, 1.64, 0.08, 0.54, { color: '#2a2c2c' });
        K.box(px, 0.08, pz, 1.6, 0.52, 0.5, { tex: 'plaster', color: '#b7b3a8' }, { collide: true });
        K.box(px, 0.6, pz, 1.66, 0.04, 0.56, { color: '#2e3232', roughness: 0.55 });
        K.box(px, 0.6, pz, 1.5, 0.05, 0.42, { tex: 'dirt', color: '#5a4a3a' });
        for (let i = 0; i < 11; i++) { const x = px - 0.66 + i * 0.132, z = pz - 0.12 + ((i * 7) % 5) * 0.06; K.cyl(x, 0.64, z, 0.006, 0.18 + ((i * 5) % 4) * 0.07, { color: '#6a5236', roughness: 0.9 }, { rx: ((i * 13) % 9) - 4, rz: ((i * 11) % 13) - 6 }); }
        for (let i = 0; i < 5; i++) K.box(px - 0.5 + i * 0.26, 0.655, pz + 0.05 - (i % 2) * 0.12, 0.08, 0.004, 0.035, { color: '#8a6a44', roughness: 0.9 }, { rot: i * 37 });
      }
      // the far end of the spine: a tube that flickers on in 6-2
      K.light('point', 6.7, 2.5, 18.2, { color: '#d7ece6', intensity: 5, distance: 6.5, name: 'c6l6:farlight', on: false, world: 'fog' });
      K.box(23.2, 0, 23.3, 0.9, 0.45, 0.5, { tex: 'wood', color: '#4a3a2c' }, { collide: true });
      K.pickup('coffee', 23.05, 0.46, 23.3, { id: 'c6_level6:coffee', extraOnEasy: true, rot: 20 });
      for (let i = 0; i < 6; i++) K.box(30.8, i * 0.03, 22.6, 0.62, 0.03, 0.62, { color: '#e2e0d6', roughness: 0.9 }, { rot: i * 3 });
      K.prop('fluoro_tube', 24.5, 17.5, 90, { h: H - 0.02, variant: 'troffer', bank: 1, world: 'fog' });
      K.prop('fluoro_tube', 28.5, 21, 90, { h: H - 0.02, variant: 'troffer', light: false, flicker: true, world: 'fog' });
      K.prop('fluoro_tube', 12, 18, 0, { h: H - 0.02, variant: 'troffer', bank: 2, world: 'fog' });
      K.prop('fluoro_tube', 6.5, 18, 0, { h: H - 0.02, variant: 'troffer', light: false, flicker: true, world: 'fog' });
      // the west end: a work lamp by the stairs (the light the lanyard swings into, 6-2)
      C6_workLight(K, 1.0, 20.6, 60, { intensity: 4.2, distance: 8, name: 'c6l6:westlamp', bank: 3 });
      C6_workLight(K, 24.5, 3.2, -95, { intensity: 4.0, distance: 8, bank: 3 });
      // ---- dust barriers ----
      C6_curtain(K, 2, 9, 0, 4, H + 0.5, 'l6w'); C6_curtain(K, 16.5, 2, 90, 4, H + 0.5, 'l6n'); C6_curtain(K, 5.5, 18, 90, 4, H, 'l6s');
      // ---- leftovers on the legs ----
      board(K, 0.8, 12.5, 0, 7); C6_stepLadder(K, 31.5, 2.6, -90); K.prop('paint_tins', 3.2, 2.2, 20, {}); K.prop('drop_sheet', 23, 1.9, 8, { w: 2.4, d: 1.4 });
      K.prop('box_stack', 31.2, 1.2, 0, { n: 3 }); K.dress('cables', [0.5, 0.5, 3.5, 16], 4, { seed: 611 }); K.dress('papers', [4.5, 16.5, 19.5, 19.5], 6, { seed: 612 });
      for (const [x, z, w, d, r] of [[2, 14, 2.4, 3, 6], [12, 2.1, 3.2, 2.6, -6], [30, 9, 2.2, 3.2, 0]]) glueScar(K, x, z, w, d, r);
      K.prop('cardigan_chair', 16.9, 19.35, 200, {});
      K.writing('ASK THEM', 20, 1.6, 15.2, 1.1, { rotY: -90, world: 'fog' });
      // ---- the Outage (after lift B): the lobby dissolves; receipts, tethers, the red; the doorway down ----
      K.outageOnly(() => {
        for (const [x, z, L] of [[21.5, 16.5, 1.8], [24, 19, 2.2], [27.5, 16, 1.6], [29.5, 20.5, 2.0], [22.5, 21.8, 1.4], [26, 22.6, 1.9], [30.6, 17.2, 1.2]]) K.prop('receipt_strip', x, z, x * 37, { ceil: H, len: L });
        for (const [x, z, L] of [[23.2, 17.2, 1.4], [28.2, 18.6, 1.7], [25.8, 21.2, 1.1]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len: L });
        K.prop('headset_hanging', 21.4, 19.6, 30, { ceil: H, len: 1.2 });
        K.writing('WHO ARE YOU TRYING TO REACH', 24, 2.35, 14.1, 3.2, { style: 'receipt' });
        for (const [x, z] of [[20.6, 23.2], [31.3, 15.2]]) K.prop('contract_stack', x, z, x * 13, { h: 1.2 });
        K.light('point', 26, 2.4, 18.5, { color: '#ff3b2a', intensity: 3.2, distance: 9, flicker: true, name: 'c6l6:red' });
        K.light('led', L6.liftA + 0.5, 2.38, 14.12, { color: '#ff2a1c', blink: true });
        K.light('led', L6.liftB + 0.5, 2.38, 14.12, { color: '#ff2a1c', blink: 0.6 });
        K.prop('fluoro_tube', 26, 20, 90, { h: H - 0.02, variant: 'troffer', flicker: true });
        K.exit({ id: 'c6_level6:shaft', box: [L6.liftB - 0.55, 13.35, L6.liftB + 0.55, 13.95], to: 'c6_shaft', entry: 'top', sound: 'none', when: () => flag('c6_doors') && !World.outageBusy, blockedMsg: 'Not yet.' });
      });
      K.collider(L6.liftB - 0.62, 13.2, L6.liftB + 0.62, 13.3, { h: 2.5 });
      K.floor(L6.liftB - 0.6, 13.3, L6.liftB + 0.6, 14, { tex: 'metal', color: '#6f7472' });          // the sill
      // ---- the voice from lift B (after the back office) ----
      K.trigger([20, 14, L6.W, 21], (G) => G.cutscene('6-voice'), { id: 'c6_level6:voice', when: (s) => s.chapter === 6 && !!(s.flags && s.flags.c6_office) && !(s.flags && s.flags.c6_voice) });
      // lift B: before the voice, after it (hold E: force the doors)
      K.interact(L6.liftB, 1.2, 14.45, async (G) => {
        if (!flag('c6_voice')) { G.sfx('lift_groan', { pos: [L6.liftB, 0.5, 13.6], vol: 0.6 }); await G.think('The doors are open a hand\'s width. Cold air coming up. [beat] And a light, down there.'); return; }
        await G.cutscene('6-lift');
      }, { id: 'c6l6:liftB', r: 1.2, when: () => !flag('c6_doors') });
      // ---- examine lines ----
      K.examine(24, 2.2, 14.4, ['"Excellence every day." [beat] In letters a foot high.', 'Somebody has to walk past that every morning on the way to tell people their number.'], { id: 'c6l6:feature', r: 2.0, world: 'fog' });
      K.examine(L6.liftA, 1.4, 14.45, 'Lift A. Dead. The floor light says six and nothing else.', { id: 'c6l6:liftA', r: 1.2 });
      K.examine(26.2, 0.7, 23.35, ['New chairs, still in their plastic.', 'They were going to move everyone up here. Leadership. Nearer the top.'], { id: 'c6l6:chairs', r: 1.4 });
      K.examine(31.5, 1.7, 18.2, '"Level 6. Regional leadership — relocating." [beat] Relocating where?', { id: 'c6l6:directory', r: 1.4 });
      K.trigger([L6.office - 1.4, 17.6, L6.office + 1.4, 20], async (G) => { await G.think('That\'s— [beat] that\'s our door. The back office door, from the store. The chime box over it.'); await G.think('It can\'t be up here.'); }, { id: 'c6_level6:officedoor', when: () => !flag('c6_office') });
      K.examine(31.2, 0.8, 22.6, 'Carpet tiles, stacked for the rest of the floor. Nobody laid them.', { id: 'c6l6:tiles', r: 1.2 });
      K.examine(L6.planter[0], 0.7, L6.planter[1], 'A planter. Everything in it died standing up.', { id: 'c6l6:planter', r: 1.2 });
      K.examine(12, 1.5, 16.1, ['Desks under dust sheets, on the other side of the plastic.', 'They look like people sitting very still.'], { id: 'c6l6:bays', r: 1.5 });
      K.examine(16.9, 1.0, 19.3, 'A cardigan on a chair against the wall. Like someone stood up to answer a phone.', { id: 'c6l6:cardigan', r: 1.2 });
      K.examine(31.4, 1.4, 8, ['Six floors up. The fog\'s the same up here.', 'You can see the ring road, if you know where to look. Two lines of orange going nowhere.'], { id: 'c6l6:window', r: 1.6 });
      K.examine(20.3, 1.6, 15.2, '"ASK THEM." [beat] Somebody wrote it where the lift doors would see it.', { id: 'c6l6:askthem', r: 1.3, world: 'fog' });
      K.examine(24, 1.5, 14.6, ['"WHO ARE YOU TRYING TO REACH." [beat] Printed. Over and over.', 'Him. I\'m trying to reach him.'], { id: 'c6l6:reach', r: 2.0, world: 'outage' });
    },
    onUpdate() { C6_ambient(['#5a6566', 0.3], ['#1f6f6a', 0.3]); },
    onLeave() { C6_ambientOff(); },
    async onEnter(G, from) {
      G.bars(null);
      if (!flag('c6_doors')) {
        C6_std('c6_level6');
        G.bg((G2) => C6_walls(G2, 'c6_level6'));
      }
      if (from === 'c6_firestairs' && G.once('c6:l6in')) {
        await G.wait(1.3);
        await G.think('Level 6. [beat] Carpet, up this end.');
      }
    },
  });

  // ---- 6-voice (in-engine): "Is someone there? Help— I can't hold it—" from lift B -------------------------------
  defineCutscene('6-voice', async (G) => {
    const A = G.aidan;
    G.set('c6_voice', true);
    note(G, 'Lift B. Luka\'s in the lift.', 'c6_lift');
    G.sfx('lift_groan', { pos: [L6.liftB, 0.2, 13.6], vol: 1 });
    await G.wait(0.5);
    await A.turn([L6.liftB, 14], 0.6);
    A.look([L6.liftB, 1.0, 14]);
    G.cam({ pos: [L6.liftB - 1.7, 1.3, 17.2], target: [L6.liftB, 0.6, 14.0], fov: 40, to: { pos: [L6.liftB - 1.35, 1.2, 16.4], fov: 36 }, dur: 6 });
    try { Snd.murmur('crowd', { pos: [L6.liftB, -0.6, 13.4], n: 1, dur: 2.2, vol: 1 }); } catch (e) { /* audio */ }
    await G.say('LUKA', 'Is someone there? Help— I can\'t hold it—');
    G.sfx('lift_groan', { pos: [L6.liftB, -0.4, 13.6], vol: 0.8 });
    await G.wait(0.5);
    if (A.raw) A.raw.expr('scared');
    await G.think('That\'s him. [beat] That\'s Luka.');
    A.look(null);
    if (A.raw) A.raw.expr('neutral');
  }, { letterbox: false, skippable: true });

  // ---- 6-lift (in-engine): hold E to force lift B → the Outage takes the lobby; the doorway leads down ------------
  defineCutscene('6-lift', async (G) => {
    const A = G.aidan;
    if (flag('c6_doors')) return;
    await A.walkTo(L6.liftB, 14.55, { speed: 1.0 });
    await A.turn(180, 0.4);
    A.look([L6.liftB, 1.0, 14]);
    G.cam({ pos: [L6.liftB + 1.9, 1.5, 16.6], target: [L6.liftB - 0.1, 1.0, 14.1], fov: 42 });
    A.pose('brace');
    const ok = await G.hold('Hold {interact}: force the doors', 2.2);
    A.pose('idle');
    if (!ok) { A.look(null); return; }
    // state first
    G.set('c6_doors', true);
    note(G, 'Lift B. Luka\'s in the lift.', 'c6_lift', { done: true });
    note(G, 'Down the shaft. Get to him.', 'c6_shaft');
    try { Enemies.standard.stop(); } catch (e) { /* enemies */ }
    const d = G.obj('c6l6:liftB');
    G.sfx('lift_groan', { pos: [L6.liftB, 1.0, 14], vol: 1 });
    let t = 0;
    if (d && d.userData.setOpen) await G.loop((dt) => { t += dt / 1.4; d.userData.setOpen(lerp(0.09, 0.75, U.ease.out(Math.min(1, t)))); return t >= 1; });
    if (d && d.userData.setOpen) d.userData.setOpen(0.75);
    G.shake(0.2, 0.5);
    await G.wait(0.4);
    // the Outage (he keeps control; the doorway is the way down)
    G.camRelease();
    G.control(true);
    await G.outage(true);
    try { G.autosave(); } catch (e) { /* save */ }
    G.bg(async (G2) => { await G2.wait(0.6); await G2.think('Down there.'); });
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // 6D LUKA'S BACK OFFICE — impossibly, the back office of his store in the city (STORE 0412), 7 × 5.5 m, ceiling 2.7.
  // The door (north, x 1.2; the chime) → c6_level6:office. East: his desk under the corkboard (Account Note 6 in
  // Aidan's handwriting) and the roster. South: the huddle whiteboard (Huddle Whiteboard 4), the kitchenette. North:
  // stock shelving. The break table in the middle. The west wall is one-sided (the desk camera stands outside it).
  // =================================================================================================================
  const LO = { W: 7, D: 5.5, H: 2.7, door: 1.2, desk: [6.3, 2.2], board: [2.5, 5.5], roster: [6.9, 3.85] };
  defineRoom({
    id: 'c6_lukaoffice', name: 'BACK OFFICE', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'lino', ambient: 'store',
    fog: { density: 0.028, color: '#3b4543' },
    bounds: [0, 0, LO.W, LO.D],
    entries: { door: [LO.door, 0.85, 0], start: [LO.door, 0.85, 0] },
    cameras: [
      // his desk wall, from outside the west wall: the corkboard, the roster, the chair
      { id: 'c6_lukaoffice:desk', vol: [3.6, 0, LO.W, LO.D], type: 'static', pos: [-2.9, 2.25, 3.7], target: [6.3, 1.05, 2.2], fov: 'fit' },
      // the door end, high from the far corner (the empty office before he walks in)
      { id: 'c6_lukaoffice:door', vol: [0, 0, 3.6, 2.6], type: 'static', pos: [6.8, 2.55, 5.3], target: [1.6, 0.7, 1.2], fov: 'fit' },
      // the huddle board and the break table, from the door corner
      { id: 'c6_lukaoffice:board', vol: [0, 2.6, 3.6, LO.D], type: 'static', pos: [6.8, 2.5, 0.2], target: [1.8, 0.9, 4.3], fov: 'fit' },
      // the CCTV corner over the desk (sitting at the break table / at the desk)
      { id: 'c6_lukaoffice:cctv', vol: [4.9, 1.2, LO.W, 3.3], pri: 1, type: 'static', pos: [-2.6, 2.6, 0.5], target: [6.2, 1.0, 2.3], fov: 'fit' },
    ],
    build(K) {
      const H = LO.H;
      K.floor(0, 0, LO.W, LO.D, { tex: 'lino', color: '#7d7a6c' });
      K.ceiling(0, 0, LO.W, LO.D, H, 'ceiling_tile');
      K.wall(-0.1, 0, LO.W + 0.1, 0, H, 'plaster', { skirting: true, openings: [{ at: LO.door + 0.1, w: 1.0, h: 2.15 }] });
      K.wall(LO.W, -0.1, LO.W, LO.D + 0.1, H, 'plaster_stained', { skirting: true });
      K.wall(LO.W + 0.1, LO.D, -0.1, LO.D, H, 'plaster', { skirting: true });
      K.wall(0, LO.D + 0.1, 0, -0.1, H, 'plaster', { both: false, skirting: true });
      K.door({ id: 'c6_lukaoffice:door', x: LO.door, z: 0, rot: 0, w: 0.95, style: 'metal', color: '#6a7472', to: 'c6_level6', entry: 'office', signBack: 'STORE' });
      K.box(LO.door, 2.2, 0.07, 0.14, 0.06, 0.08, { color: '#e8e6de', roughness: 0.5 });
      K.light('led', LO.door + 0.05, 2.23, 0.12, { color: '#ff2a1c', blink: 2 });
      K.plane(3.8, 2.2, 0.08, 1.4, 0.35, storeSignTex(), {});
      // ---- north: stock shelving (boxed phones, accessories), the first aid kit ----
      K.prop('shelf', 3.3, 0.35, 0, { len: 1.6, h: 2.0 });
      K.prop('shelf', 5.1, 0.35, 0, { len: 1.6, h: 2.0 });
      for (let i = 0; i < 12; i++) { const x = 2.65 + (i % 6) * 0.55 + (i > 5 ? 0.1 : 0), y = i < 6 ? 0.42 : 1.22; K.box(x, y, 0.36, 0.2, 0.26, 0.12, { color: i % 3 ? '#e8e8e2' : '#0f7a77', roughness: 0.5 }, { rot: (i * 17) % 9 - 4 }); }
      for (let i = 0; i < 6; i++) K.box(4.3 + i * 0.18, 0.82, 0.3, 0.14, 0.2, 0.05, { color: ['#1a1a1a', '#e8e4d8', '#0f7a77'][i % 3], roughness: 0.4 });
      K.pickup('first_aid', 5.6, 1.62, 0.36, { id: 'c6_lukaoffice:firstaid', rot: 0 });
      // ---- east: his desk, the corkboard (Account Note 6), the roster ----
      K.prop('desk', LO.desk[0], LO.desk[1], -90, { clutter: false, w: 1.5 });
      K.prop('office_chair', LO.desk[0] - 0.75, LO.desk[1] + 0.1, 90, { turn: -20 });
      K.box(LO.desk[0] - 0.95, 0.52, LO.desk[1] + 0.15, 0.06, 0.55, 0.44, { color: '#1c2a33', roughness: 0.9 });       // his jacket over the chair back
      K.prop('monitor', LO.desk[0] + 0.15, LO.desk[1] - 0.25, -90, { y: 0.745, content: 'login' });
      K.prop('desk_lamp', LO.desk[0] + 0.2, LO.desk[1] + 0.55, -120, { y: 0.745, lit: true, light: false });
      K.light('lamp', LO.desk[0] - 0.05, 1.3, LO.desk[1] + 0.4, { color: '#ffcf8a', intensity: 2.6, distance: 4.5, name: 'c6lo:lamp' });
      K.prop('coffee_cup', LO.desk[0] - 0.22, LO.desk[1] + 0.08, 20, { y: 0.745 });
      K.plane(LO.desk[0] - 0.08, 0.753, LO.desk[1] - 0.48, 0.21, 0.29, padTex(), { rot: [-90, 60, 0] });
      K.box(LO.desk[0] + 0.12, 0.745, LO.desk[1] - 0.2, 0.18, 0.012, 0.28, { color: '#2a2c2c' });              // the tablet, face down
      K.prop('framed_photo', LO.desk[0] + 0.25, LO.desk[1] + 0.62, -110, { y: 0.745, variant: 'stand', subject: 'staff1961' });
      K.box(LO.desk[0] + 0.1, 0, LO.desk[1] - 0.45, 0.45, 0.55, 0.45, { tex: 'metal', color: '#3a3e40', metalness: 0.5 }, {});            // the safe
      K.prop('corkboard', 6.93, 2.2, -90, { w: 1.5, h: 0.95, mount: 1.65, roster: false });
      K.plane(6.9, 1.72, 2.6, 0.2, 0.27, acct6Tex(), { rotY: -90 });
      K.sphere(6.89, 1.84, 2.6, 0.008, { color: '#b3261e' });
      K.prop('roster', LO.roster[0], LO.roster[1], -90, { cross: 'AIDAN', title: 'ROSTER — WEEK 14 — STORE 0412', mount: 1.5 });
      K.prop('clock', 6.93, 4.8, -90, { mount: 2.25, time: [8, 52] });
      // lanyard hooks by the door with the spare keys
      K.box(2.15, 1.55, 0.1, 0.4, 0.06, 0.04, { tex: 'wood', color: '#6a5436' });
      K.prop('keys_ring', 2.1, 0.12, 0, { variant: 'hook', mount: 1.5 });
      // ---- south: the huddle whiteboard (Huddle Whiteboard 4), the kitchenette ----
      K.box(LO.board[0], 0.92, LO.D - 0.1, 1.66, 1.1, 0.03, { color: '#dcdcd6' });
      K.plane(LO.board[0], 1.47, LO.D - 0.118, 1.6, 1.1, huddleTex(), { rotY: 180 });
      K.box(LO.board[0], 0.88, LO.D - 0.15, 1.0, 0.03, 0.08, { tex: 'metal', color: '#c3c8c6' });
      K.prop('sink_bench', 5.6, LO.D - 0.33, 180, { len: 2.2 });
      K.box(6.25, 0.92, LO.D - 0.28, 0.2, 0.24, 0.16, { color: '#e8e6de', roughness: 0.4 });                          // the kettle
      K.light('led', 6.25, 0.97, LO.D - 0.37, { color: '#2aff5a' });
      K.prop('mug', 5.1, LO.D - 0.3, 20, { y: 0.92, text: 'LUKA' });
      K.prop('mug', 4.8, LO.D - 0.32, 200, { y: 0.92, text: 'BEST TEAM 0412' });
      K.pickup('coffee', 5.45, 0.93, LO.D - 0.3, { id: 'c6_lukaoffice:coffee', rot: 70 });
      K.prop('microwave', 4.7, LO.D - 0.3, 180, { y: 0.92, time: '8:52' });
      // ---- the break table, the fan, the CCTV monitor ----
      K.breakTable(2.3, 2.9, 20, { id: 'c6_lukaoffice:break', time: [8, 52], clock: false });
      K.prop('crt', 3.2, 0.3, 0, { y: 2.0, content: 'cctv', cam: 2 });
      K.box(3.2, 1.95, 0.25, 0.5, 0.05, 0.4, { tex: 'metal', color: '#3a3e40' });
      K.prop('poster', 0.08, 2.9, 90, { style: 'plan', text: 'HAVE YOU\nOFFERED THE\nBUNDLE?', mount: 1.6 });
      K.prop('fluoro_tube', 3.5, 2.7, 90, { h: H - 0.02, variant: 'troffer', flicker: true, bank: 1 });
      K.prop('water_stain', 1.5, 4.2, 0, { surface: 'ceiling', ceil: H });
      K.sticker('sticker09', LO.desk[0] - 0.42, 0.3, LO.desk[1] - 0.72, -90, { size: 0.06 });
      // ---- documents ----
      K.doc('huddle4', LO.board[0], 1.3, LO.D - 0.3, { id: 'c6_lukaoffice:huddle4', model: 'none' });
      K.doc('luka_notes', LO.desk[0] - 0.12, 0.86, LO.desk[1] - 0.48, { id: 'c6_lukaoffice:notes', model: 'none', r: 1.0 });
      K.doc('acct6', 6.75, 1.72, 2.6, { id: 'c6_lukaoffice:acct6', model: 'none', r: 1.7 });
      // ---- the roster (in-engine insert; Aidan looks away), the cold coffee ----
      K.interact(LO.roster[0] - 0.25, 1.4, LO.roster[1], (G) => G.cutscene('6-roster'), { id: 'c6lo:roster', r: 1.1 });
      K.examine(LO.desk[0] - 0.22, 0.85, LO.desk[1] + 0.08, 'Cold. He never drinks them.', { id: 'c6lo:coffee', r: 0.7 });
      // ---- examine lines ----
      K.examine(3.8, 2.1, 0.3, ['"Store 0412 — City." [beat] That\'s our sign. That\'s our back office.', 'Six floors up. It can\'t be. [beat] It is.'], { id: 'c6lo:sign', r: 1.6 });
      K.examine(3.3, 1.2, 0.5, ['Our stock. Same boxes, same shelf, same broken price gun on the end.', 'I did the count on this shelf every Tuesday.'], { id: 'c6lo:shelf', r: 1.3 });
      K.examine(3.2, 2.1, 0.4, ['The camera on the shop floor. The store\'s dark. Nobody at the counter.', 'Nobody waiting.'], { id: 'c6lo:cctv', r: 1.6 });
      K.examine(LO.desk[0] + 0.25, 0.85, LO.desk[1] + 0.62, ['The team photo. The Christmas one. I\'m at the back.', 'He\'s got his hand on my shoulder. I\'d forgotten that.'], { id: 'c6lo:photo', r: 0.8 });
      K.examine(LO.desk[0] - 0.95, 1.0, LO.desk[1] + 0.15, 'His jacket\'s on the chair. He left in a hurry.', { id: 'c6lo:jacket', r: 1.0 });
      K.examine(2.15, 1.5, 0.3, ['The spare keys. Luka\'s always got the big ring on him.', 'These are just the spares. Nobody\'s touched them.'], { id: 'c6lo:keys', r: 0.9 });
      K.examine(5.1, 1.0, LO.D - 0.4, ['His mug says LUKA. We got it printed. He pretended he hated it.', 'He uses it every day.'], { id: 'c6lo:mug', r: 1.0 });
      K.examine(0.2, 1.6, 2.9, '"Have you offered the bundle?" [beat] Every day. Every sale.', { id: 'c6lo:poster', r: 1.2 });
      K.examine(LO.desk[0] + 0.12, 0.8, LO.desk[1] - 0.2, 'His tablet, face down. The number\'s on it. He turned it over.', { id: 'c6lo:tablet', r: 1.2, prio: 0.2 });   // (it sits beside his notes pad, which always won the E press)
      K.examine(6.93, 2.2, 4.8, 'Eight fifty-two. [beat] Eight minutes before we open.', { id: 'c6lo:clock', r: 1.5 });
    },
    onUpdate() { C6_ambient(['#5a605c', 0.26], ['#1f6f6a', 0.06]); },
    onLeave() { C6_ambientOff(); },
    async onEnter(G, from) {
      G.bars(null);
      if (from === 'c6_level6') G.sfx('chime', { vol: 0.8 });
      C6_std('c6_lukaoffice');
      // keys outside the door when it stops there (it never comes in)
      G.bg(async (G2) => {
        for (;;) {
          await G2.wait(2.5);
          if (!G2.inRoom('c6_lukaoffice')) return;
          const st = Enemies.standard.state;
          if (st && (st.node === 'l6:office' || st.next === 'l6:office') && !busy()) { G2.sfx('keys_far', { pos: [LO.door, 1.5, -0.8], vol: 0.7 }); await G2.wait(3.5); }
        }
      });
      if (!flag('c6_office')) {
        G.set('c6_office', true);
        await G.wait(1.4);
        await G.think('This is— [beat] this is our back office.');
        note(G, 'Luka\'s office. Our back office. Up here.', 'c6_office');
      }
    },
  });

  // ---- 6-roster (in-engine): the roster, close — his last three shifts crossed out, "call him?" beside each ----------
  defineCutscene('6-roster', async (G) => {
    const A = G.aidan, [rx, rz] = LO.roster;
    if (A.raw) A.raw.idleLife = false;
    await A.walkTo(rx - 0.85, rz, { speed: 0.9 });
    await A.turn(90, 0.4);
    A.look([rx, 1.5, rz]);
    G.cam({ pos: [rx - 0.62, 1.52, rz + 0.08], target: [rx, 1.5, rz], fov: 30, to: { pos: [rx - 0.5, 1.51, rz + 0.05], fov: 28 }, dur: 5 });
    await G.wait(3.2);
    await G.waitOrInput(1.6);
    // Aidan looks away
    G.cam({ pos: [rx - 2.0, 1.55, rz - 1.3], target: [rx - 0.8, 1.5, rz], fov: 38 });
    await G.wait(0.3);
    A.look([rx - 3, 1.2, rz + 2.2]);
    if (A.raw) { A.raw.eyes('down'); A.raw.expr('sad'); }
    await A.turn(210, 0.9);
    await G.wait(1.8);
    if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); A.raw.expr('neutral'); }
    A.look(null);
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // 6E THE LIFT SHAFT (played in the Outage) — the sill at Level 6 (y 0, the lobby's red behind it), a 3 × 3 m shaft,
  // the maintenance ladder on the south wall down to the roof of the stalled car (y −8; the hatch open, its light
  // spilling up). The car's interior is built beside the shaft (x 10.8–13.2): dropping through the hatch cuts to it.
  // SET PIECE "The Middle" (spec §6): part 1 — the ladder, while giant pale fingers in suit cuffs swat across it (20 per
  // hit); part 2 — in the car, hold E beside Luka to brace; three times the lights flash red as the hands shove: let go
  // during the flash, hold again after; missing twice drops the car a level (10) and restarts part 2. Win: the doors
  // force open.
  // =================================================================================================================
  const SHF = { roof: -8, hatch: [0.32, -0.52], CX: 12, brace: [11.62, -0.3], luka: [12.52, -0.34], bands: [-2.3, -5.35], L: 6, sc: 2.2, ceil: 2.26 };
  const [lxx, lzz] = SHF.luka;
  // the big hands: a pivot (pendulum) → the hand (wrist at the origin, fingers down)
  function C6_handRig(K, name) {
    const piv = new THREE.Group(); piv.name = name;
    const h = C6_bigHand(SHF.sc, { curl: 0.3 });
    piv.add(h);
    piv.position.set(0, 30, 0);
    K.mesh(piv, { name });
    piv.userData.hand = h;
    return piv;
  }
  // press pose: fingers down onto the roof at (x, z); k = how far down (0 up in the dark … 1 pressing)
  function C6_handPress(piv, x, z, k, yTip = SHF.roof) {
    if (!piv) return;
    const tip = 0.8 * SHF.sc, wrist = lerp(yTip + 14, yTip + tip - 0.02, k);
    piv.rotation.set(0, 0, 0);
    piv.position.set(x, wrist + (SHF.L - tip), z);
    piv.userData.hand.position.set(0, -(SHF.L - tip), 0);
    piv.userData.hand.rotation.set(0, 0, 0);
  }
  // swat pose: a pendulum across the ladder line at band height, θ in radians (−0.25 west … +0.25 east)
  function C6_handSwing(piv, band, th, dir) {
    if (!piv) return;
    const tip = 0.8 * SHF.sc;
    piv.position.set(0, band + SHF.L, 1.0);
    piv.rotation.set(0, 0, th);
    piv.userData.hand.position.set(0, -(SHF.L - tip), 0);
    piv.userData.hand.rotation.set(0, dir > 0 ? 90 * D2R : -90 * D2R, 0);
  }
  defineRoom({
    id: 'c6_shaft', name: 'LIFT SHAFT', area: 'REGIONAL OFFICE', chapter: 6, outdoor: false, surface: 'metal', ambient: 'none',
    fog: { density: 0.05, color: '#1c2524' }, outageFog: { density: 0.05, color: '#141c1b' },
    surfaces: [{ box: [-1.6, 1.5, 1.6, 3.6], s: 'carpet' }],
    bounds: [-1.7, -1.6, 13.4, 3.6],
    entries: { top: [0, 2.7, 180], car: [SHF.brace[0], SHF.brace[1], 180], start: [0, 2.7, 180] },
    cameras: [
      // the sill, from out over the shaft: the lobby's red behind him
      { id: 'c6_shaft:sill', vol: [-1.6, 1.45, 1.6, 3.6], y: [-0.6, 1], type: 'static', pos: [0.9, 3.1, -1.25], target: [0, 0.85, 2.6], fov: 'fit' },
      // straight down from above the Level 6 doors (the upper ladder) — it tilts to keep him in frame: a fixed shot
      // straight down lost him at the top of the ladder, right under the lens
      { id: 'c6_shaft:down', vol: [-1.5, -1.5, 1.5, 1.45], y: [-3.9, 1.0], type: 'pan', pos: [0.45, 3.4, -1.1], target: [0.05, -6, 1.0], fov: 55, pan: { lag: 0.2, yaw: 40, pitch: 48 } },
      // side-on from the far corner (the lower ladder), tilting with him
      { id: 'c6_shaft:side', vol: [-1.5, -1.5, 1.5, 1.45], y: [-7.7, -3.9], type: 'pan', pos: [1.3, -1.6, -1.35], target: [0, -5.8, 1.0], fov: 52, pan: { lag: 0.2, yaw: 30, pitch: 45 } },
      // the car roof, from above in the corner
      { id: 'c6_shaft:roof', vol: [-1.3, -1.35, 1.3, 1.3], y: [-8.5, -7.6], pri: 1, type: 'pan', pos: [-1.25, -4.3, -1.3], target: [0.3, -7.4, 0.4], fov: 52, pan: { lag: 0.25, yaw: 40, pitch: 30 } },
      // inside the car, low (from beyond its back wall)
      { id: 'c6_shaft:car', vol: [10.8, -1.2, 13.2, 1.2], type: 'static', pos: [12.05, 0.5, -4.4], target: [12.1, 1.35, 0.15], fov: 'fit' },
    ],
    build(K) {
      const conc = { tex: 'concrete', color: '#6f726d' }, steel = { tex: 'metal', color: '#5d6462', roughness: 0.5, metalness: 0.5 };
      const CX = SHF.CX;
      // ---- the shaft ----
      K.wall(-1.6, -1.5, 1.6, -1.5, 19, conc, { y: -11 });
      K.wall(1.5, -1.6, 1.5, 1.6, 19, conc, { y: -11 });
      K.wall(-1.5, 1.6, -1.5, -1.6, 19, conc, { y: -11 });
      K.wall(1.6, 1.5, -1.6, 1.5, 11, conc, { y: -11 });
      K.wall(1.6, 1.5, -1.6, 1.5, 8, conc, { y: 0, openings: [{ at: 1.6, w: 1.15, h: 2.2 }] });
      K.box(0, -12, 0, 3.2, 1, 3.2, { color: '#0b0d0d' });
      // guide rails (east / west), their brackets; the counterweight rails and the counterweight on the north wall
      for (const sx of [-1, 1]) { K.box(sx * 1.4, -11, 0, 0.06, 19, 0.12, steel); K.box(sx * 1.44, -11, 0, 0.02, 19, 0.2, steel); for (let y = -10; y < 7; y += 2.2) K.box(sx * 1.46, y, 0, 0.08, 0.1, 0.35, steel); }
      for (const x of [-0.6, 0.6]) K.box(x, -11, -1.42, 0.06, 19, 0.08, steel);
      K.box(0, -4.6, -1.3, 1.1, 1.6, 0.22, { tex: 'metal', color: '#3a3e3c' });
      for (let i = 0; i < 4; i++) K.cyl(-0.12 + i * 0.08, -3.0, -1.3, 0.012, 10, { color: '#2a2c2b', metalness: 0.6 });
      // the landing indicator lights down the shaft (red in the Outage), the doors' sills at each floor (dead)
      for (const y of [-3.6, -7.2]) K.box(0, y, 1.47, 1.2, 0.06, 0.12, steel);
      // ---- the sill (the lobby's edge): carpet, the forced doors pushed apart, the red behind ----
      K.floor(-1.6, 1.5, 1.6, 3.6, { tex: 'carpet', color: '#3f4a55' });
      K.wall(-1.6, 3.6, -1.6, 1.4, 3.0, 'plaster', {}); K.wall(1.6, 1.4, 1.6, 3.6, 3.0, 'plaster', {}); K.wall(1.7, 3.6, -1.7, 3.6, 3.0, 'plaster', {});
      K.ceiling(-1.6, 1.5, 1.6, 3.6, 2.9, 'ceiling_tile');
      for (const sx of [-1, 1]) K.box(sx * 0.86, 0, 1.6, 0.56, 2.15, 0.04, { tex: 'metal', color: '#cfd4d2', roughness: 0.3, metalness: 0.35 });
      K.box(0, 2.2, 1.6, 1.4, 0.14, 0.08, { tex: 'metal', color: '#bfc4c2', metalness: 0.5 });
      K.blocker(-1.6, 3.2, 1.6, 3.6, 'He\'s down there.');
      K.outageOnly(() => {
        K.prop('receipt_strip', -0.9, 3.0, 20, { ceil: 2.9, len: 1.6 }); K.prop('tether_hanging', 1.0, 2.6, 0, { ceil: 2.9, len: 1.3 });
        K.light('point', 0, 2.3, 3.3, { color: '#ff3b2a', intensity: 2.6, distance: 6, flicker: true });
        K.writing('FOLLOW UP TOMORROW', -1.52, 1.6, 2.5, 1.4, { rotY: 90, style: 'receipt' });
        for (const [x, y, z] of [[-1.3, 1.5, 0.8], [1.3, -1.2, -0.4], [-1.25, -3.8, -0.9], [1.28, -6.1, 0.7], [0.4, 3.5, -1.3]]) K.prop('tether_hanging', x, z, 0, { ceil: y + 1.4, len: 1.3 });
        K.prop('receipt_strip', 1.1, 0.9, 0, { ceil: 4.5, len: 3.2 }); K.prop('receipt_strip', -1.0, -0.8, 60, { ceil: 3.0, len: 4.4 });
        for (const y of [-3.45, -7.05]) K.light('led', 0.45, y, 1.44, { color: '#ff2a1c', blink: 0.8 });
      });
      // ---- the ladder (south wall, under the sill) ----
      const lr = { tex: 'metal', color: '#8a908d', roughness: 0.5, metalness: 0.5 };
      for (const sx of [-0.23, 0.23]) K.box(sx, SHF.roof, 1.42, 0.04, 8.2, 0.05, lr);
      for (let y = SHF.roof + 0.3; y < 0.1; y += 0.3) K.box(0, y, 1.4, 0.46, 0.03, 0.03, lr);
      K.ladder(0, 1.42, 180, SHF.roof, 0, { id: 'c6_shaft:ladder', top: [0, 2.05], bottom: [0, 0.62] });
      // ---- the car roof: the crosshead and ropes, the balustrade, the hatch (open, the light coming up) ----
      K.floor(-1.25, -1.3, 1.25, 1.28, { tex: 'metal', color: '#6b6f6c', roughness: 0.55 }, { y: SHF.roof });
      K.box(0, SHF.roof - 2.6, -0.01, 2.5, 2.58, 2.58, { tex: 'metal', color: '#4c504e' });
      K.box(0, SHF.roof, -0.95, 2.5, 0.28, 0.2, steel, { collide: true });
      for (let i = 0; i < 4; i++) K.cyl(-0.15 + i * 0.1, SHF.roof + 0.28, -0.95, 0.012, 16, { color: '#2a2c2b', metalness: 0.6 });
      K.box(0, SHF.roof, -1.22, 2.5, 1.0, 0.04, steel); K.box(-1.22, SHF.roof, 0, 0.04, 1.0, 2.5, steel);
      K.box(-1.22, SHF.roof + 1.0, 0, 0.06, 0.05, 2.5, steel); K.box(0, SHF.roof + 1.0, -1.22, 2.5, 0.05, 0.06, steel);
      K.sign('MAX LOAD 1000 kg\n13 PERSONS', -1.195, SHF.roof + 0.8, 0.55, 0.26, 0.11, { style: 'office', rotY: 90 });
      const [hx, hz] = SHF.hatch;
      K.plane(hx, SHF.roof + 0.012, hz, 0.62, 0.62, { color: '#e8f4ef', emissive: '#dff2ec', emissiveIntensity: 1.8 }, { rot: [-90, 0, 0] });
      K.box(hx, SHF.roof, hz - 0.33, 0.64, 0.03, 0.04, steel); K.box(hx, SHF.roof, hz + 0.33, 0.64, 0.03, 0.04, steel);
      K.box(hx + 0.34, SHF.roof, hz, 0.02, 0.62, 0.64, steel);
      K.light('point', hx, SHF.roof + 0.5, hz, { color: '#d8efe9', intensity: 4.5, distance: 7, name: 'c6sh:hatchlight', flicker: true });
      K.light('point', 0.2, -4.2, 0.4, { color: '#8fa29e', intensity: 1.4, distance: 7 });
      K.light('point', -0.6, 3.6, -1.0, { color: '#b9ccc8', intensity: 3.4, distance: 11, name: 'c6sh:toplight' });            // cold light from the dark above (catches the hands)
      // ---- the two enormous hands (hidden above until 6-1) ----
      C6_handRig(K, 'c6sh:handL'); C6_handRig(K, 'c6sh:handR');
      // ---- the car's interior (the drop through the hatch cuts here) ----
      const skin = SKIN_WALL;
      K.floor(10.8, -1.2, 12.02, 1.2, { tex: 'metal_grating', color: '#8a8f8c' });
      K.floor(12.02, -1.2, 13.2, 1.2, null, { name: 'c6sh:grate', visible: false });    // walkable, no mesh (the bars are the floor)
      // the open grating under Luka: bars over the dark, the sleeves reaching up through it
      for (let x = 12.06; x < 13.2; x += 0.085) K.box(x, -0.03, 0, 0.018, 0.03, 2.4, { tex: 'metal', color: '#7a807d', metalness: 0.5 });
      for (let z = -1.15; z < 1.2; z += 0.3) K.box(12.61, -0.035, z, 1.18, 0.025, 0.02, { tex: 'metal', color: '#7a807d', metalness: 0.5 });
      K.box(12.61, -1.6, 0, 1.18, 1.55, 2.4, { color: '#040606', roughness: 1 });
      K.light('point', 12.55, -0.5, -0.3, { color: '#2fb3aa', intensity: 2.6, distance: 3.2 });
      K.light('point', lxx - 0.55, 0.45, lzz - 0.6, { color: '#cfe3de', intensity: 2.0, distance: 1.9 });                 // low fill on his ankles
      const [lx, lz] = SHF.luka;
      // two small hands round each ankle (Luka faces north: his left foot is west of him), palms to the ankle,
      // forearms leaning away down through the bars
      // (they follow his ankles every frame — whatever his legs do, the hands stay on them)
      const small = [[0, -90], [0, 10], [1, 90], [1, 190]];
      const smallW = small.map(([ai, th], i) => {
        const w = new THREE.Group(), h = C6_smallHand({ grip: 0.9 });
        w.position.set(lx + (ai ? 0.13 : -0.13) + Math.sin(th * D2R) * 0.095, -0.02, lz + Math.cos(th * D2R) * 0.095); w.rotation.y = th * D2R;
        h.rotation.x = -0.62; h.scale.setScalar(1.3); w.add(h);
        K.mesh(w, { name: 'c6sh:small' + i });
        return { w, h, ai, th };
      });
      const _fv = V3();
      K.animate((dt, t) => {
        const a = World.build && World.build.npcs && World.build.npcs.luka;
        if (!a || !a.bones) return;
        for (const S0 of smallW) {
          const b = S0.ai ? a.bones.footR : a.bones.footL;
          if (!b) continue;
          b.getWorldPosition(_fv);
          S0.w.position.set(_fv.x + Math.sin(S0.th * D2R) * 0.095, -0.02, _fv.z + Math.cos(S0.th * D2R) * 0.095);
          S0.h.userData.grip(0.85 + Math.sin(t * 7 + S0.th) * 0.05);
        }
      });
      // walls: carpet-tile skin (north / east / west one-sided: the cameras stand outside), a handrail, the panel
      K.wall(10.8, -1.2, 13.2, -1.2, 2.45, skin, { both: false });
      K.wall(13.2, -1.2, 13.2, 1.2, 2.45, skin, { both: false });
      K.wall(10.8, 1.2, 10.8, -1.2, 2.45, skin, { both: false });
      // (the handrail runs along the east wall only: one on the north wall crossed the low camera's frame at hip height)
      K.box(13.14, 0.92, 0, 0.05, 0.04, 2.3, { tex: 'metal', color: '#d9dcdc', metalness: 0.8, roughness: 0.25 });
      K.box(13.15, 0.95, 0.85, 0.03, 0.55, 0.22, { tex: 'metal', color: '#b8bdbb', metalness: 0.6 });
      for (let i = 0; i < 6; i++) K.cyl(13.13, 1.02 + (i % 3) * 0.12, 0.8 + Math.floor(i / 3) * 0.1, 0.014, 0.01, { color: i === 4 ? '#ffcc66' : '#dcdcd6', emissive: i === 4 ? '#ffaa33' : undefined, emissiveIntensity: 1 }, { rz: 90 });
      K.box(13.13, 1.6, 0.85, 0.02, 0.1, 0.16, { color: '#200806', emissive: '#ff3322', emissiveIntensity: 1.2 });
      // the doors: a jaw (named — the set piece opens and snaps them)
      for (const [name, sx] of [['c6sh:jawL', -1], ['c6sh:jawR', 1]]) {
        const g = new THREE.Group(); g.name = name; g.position.set(CX, 0, 1.18);
        g.add(mesh(sgeo('jawleaf', () => new THREE.BoxGeometry(1.2, 2.3, 0.05)), smat('jawmetal', () => new THREE.MeshStandardMaterial({ color: '#8a8886', roughness: 0.45, metalness: 0.4 })), sx * 0.6, 1.15, 0));
        g.add(mesh(sgeo('jawgum', () => new THREE.BoxGeometry(0.05, 2.3, 0.07)), smat('jawgummat', () => new THREE.MeshStandardMaterial({ color: '#8c5f5a', roughness: 0.6 })), sx * 0.02, 1.15, 0));
        for (let i = 0; i < 14; i++) g.add(mesh(sgeo('tooth', () => new THREE.BoxGeometry(0.06, 0.1, 0.035)), smat('toothmat', () => new THREE.MeshStandardMaterial({ color: '#e6ddc6', roughness: 0.35 })), sx * -0.02, 0.15 + i * 0.155, i % 2 ? 0.012 : -0.012, { rz: sx * 12 }));
        g.userData.sx = sx;
        K.mesh(g, { name });
      }
      K.box(CX - 1.2, 0, 1.16, 0.02, 2.4, 0.08, { tex: 'metal', color: '#6a6e6c' }); K.box(CX + 1.2, 0, 1.16, 0.02, 2.4, 0.08, { tex: 'metal', color: '#6a6e6c' });
      K.collider(10.8, 1.1, 13.2, 1.3, { h: 2.4 });
      // outside the jaw: nothing but the shaft wall
      K.box(CX, 0, 1.75, 2.8, 2.6, 0.1, conc);
      // the ceiling (named — it buckles), its light panel, the hatch with the fingertips pressing through
      const ceil = new THREE.Group(); ceil.name = 'c6sh:ceil'; ceil.position.set(CX, SHF.ceil, 0);
      const cm = smat('carceil', () => new THREE.MeshStandardMaterial({ color: '#9a9c98', roughness: 0.4, metalness: 0.45 }));
      ceil.add(mesh(sgeo('ceilA', () => new THREE.BoxGeometry(2.4, 0.04, 1.3)), cm, 0, 0, -0.55));
      ceil.add(mesh(sgeo('ceilB', () => new THREE.BoxGeometry(1.4, 0.04, 1.1)), cm, -0.5, 0, 0.65));
      ceil.add(mesh(sgeo('ceilC', () => new THREE.BoxGeometry(0.4, 0.04, 1.1)), cm, 1.0, 0, 0.65));
      const panelMat = smat('carpanel', () => new THREE.MeshStandardMaterial({ color: '#f2f6f4', emissive: '#e4f2ee', emissiveIntensity: 1.3, roughness: 0.3 }));
      ceil.add(mesh(sgeo('ceilPanel', () => new THREE.BoxGeometry(1.1, 0.02, 0.5)), panelMat, -0.2, -0.03, -0.55, { cast: false }));
      const fh = C6_bigHand(1.5, { curl: 0.15 });
      fh.position.set(0.5, 0.98, 0.66); fh.rotation.set(0.12, 0.4, 0);
      ceil.add(fh);
      K.mesh(ceil, { name: 'c6sh:ceil' });
      K.light('point', CX - 0.2, 2.15, -0.5, { color: '#dfeee9', intensity: 3.2, distance: 5.5, name: 'c6sh:carlight' });
      // Luka, braced, arms up against the ceiling
      K.npc('luka', 'luka', lx, lz, 180, { anim: 'brace' });
      // ---- the hatch: drop through (the set piece opens it) ----
      K.interact(hx, SHF.roof + 0.5, hz, async (G) => { if (C6.mid) C6.mid.drop = true; }, { id: 'c6_shaft:hatch', r: 1.1, when: () => !!(C6.mid && C6.mid.part === 'roof') });
      K.examine(0, SHF.roof + 0.9, -1.1, 'The ropes are stretched like they\'re holding twice what they\'re meant to.', { id: 'c6sh:ropes', r: 1.0 });
      K.examine(1.0, SHF.roof + 1.2, -1.15, ['The counterweight\'s up there in the dark.', 'Every time the car goes down, it comes up.'], { id: 'c6sh:counterweight', r: 0.9 });
      K.examine(-1.1, SHF.roof + 0.9, 0.55, ['A plate on the car\'s railing. "Max load 1000 kg. 13 persons."', 'There\'s one person in there. [beat] It\'s holding more than that.'], { id: 'c6sh:plate', r: 0.9 });
      K.examine(-0.55, SHF.roof + 0.4, -0.3, ['A hand the size of a car door. Shirt cuff. A cufflink.', 'Somebody\'s boss. [beat] Somebody\'s boss\'s boss.'], { id: 'c6sh:hand', r: 0.9, when: () => !!(C6.mid && C6.mid.part === 'roof') });
      K.examine(-1.3, 0.9, 2.4, 'Behind me the lobby\'s printing itself. Ahead of me it\'s just down.', { id: 'c6sh:sill', r: 1.2 });
    },
    onUpdate() { C6_ambient(['#56605e', 0.26], ['#34463f', 0.3]); },
    onLeave() { C6_ambientOff(); try { UI.holdPrompt(null); } catch (e) { /* ui */ } },
    async onEnter(G, from) {
      G.persist();
      G.bars(null);
      const L = G.actor('luka');
      try { L.hold('L', null); L.hold('R', null); L.expr('pain'); L.eyes('closed'); if (L.raw) L.raw.idleLife = false; } catch (e) { /* actor */ }
      if (flag('c6_setpiece')) return;
      C6.mid = { part: 'intro', drop: false };
      if (!done('cs:6-1')) await G.cutscene('6-1');
      else await G.wait(0.6);
      const r = await G.boss('middle');
      if (r !== 'won') return;
      await G.cutscene('6-2');
    },
  });

  // =================================================================================================================
  // CUTSCENE 6-1 "The Middle"
  // =================================================================================================================
  defineCutscene('6-1', async (G) => {
    const A = G.aidan, hL = G.obj('c6sh:handL'), hR = G.obj('c6sh:handR');
    if (A.raw) A.raw.idleLife = false;
    A.place(0, 1.78, 180); A.pose('idle');
    A.look([0, -8, 0]);
    if (A.raw) A.raw.eyes('down');
    C6_handPress(hL, -0.55, -0.3, 0); C6_handPress(hR, 0.62, 0.2, 0);
    // 1. SHOT — high, looking down the open lift shaft. The car below, its roof hatch open, the light spilling out.
    //    Two enormous pale hands in suit cuffs descend out of the darkness past Aidan and press down on the car.
    G.cam({ pos: [0.4, 5.4, -1.25], target: [0.0, -6.4, 0.85], fov: 60, to: { pos: [0.36, 5.1, -1.2], fov: 57 }, dur: 9 });
    G.sfx('lift_groan', { pos: [0, -7.5, 0], vol: 0.8 });
    await G.wait(1.4);
    G.sfx('whoosh', { pos: [0, 4, 0], vol: 0.6 });
    let t = 0;
    await G.loop((dt) => {
      t += dt;
      C6_handPress(hL, -0.55, -0.3, U.ease.inOut(clamp(t / 3.8)));
      C6_handPress(hR, 0.62, 0.2, U.ease.inOut(clamp((t - 0.7) / 3.8)));
      if (A.raw && t > 1.0 && !C6.flinch) { C6.flinch = true; q(A.gesture('flinch')); }
      return t >= 4.6;
    });
    C6.flinch = false;
    C6_handPress(hL, -0.55, -0.3, 1); C6_handPress(hR, 0.62, 0.2, 1);
    G.sfx('thud', { pos: [0, -8, 0], vol: 1 }); G.sfx('lift_groan', { pos: [0, -8, 0], vol: 1 });
    G.shake(0.25, 0.6);
    await G.wait(1.2);
    // 2. SHOT — inside the car, low. Luka stands braced, arms up against the buckling ceiling. Below the floor grating,
    //    small hands in teal sleeves reach up and hold his ankles. They aren't pulling. They're holding on.
    const L = G.actor('luka');
    const [lx, lz] = SHF.luka;
    L.place(lx, lz, 180); L.pose('brace'); L.hold('L', null); L.hold('R', null); L.expr('pain'); L.eyes('closed');
    const ceil = G.obj('c6sh:ceil'); if (ceil) ceil.position.y = SHF.ceil - 0.06;
    // (the ankles first: the small hands holding on)
    G.cam({ pos: [lx - 0.3, 0.42, lz - 0.95], target: [lx, 0.02, lz], fov: 32, to: { pos: [lx - 0.26, 0.38, lz - 0.86], fov: 30 }, dur: 4 });
    G.sfx('lift_groan', { pos: [lx, 2.4, lz], vol: 0.9 });
    await G.wait(3.2);
    // (then up at him from the floor: arms against the ceiling, the fingers coming through the hatch)
    G.cam({ pos: [lx + 0.5, 0.36, lz - 1.05], target: [lx + 0.02, 1.68, lz + 0.02], fov: 46, to: { pos: [lx + 0.46, 0.36, lz - 0.98], fov: 44 }, dur: 9 });
    await G.wait(1.0);
    await G.say('LUKA', 'Don\'t let go. [beat] I\'ve got you. I\'ve got you. Don\'t let go.');
    await G.wait(0.8);
    // back to the sill: he gets onto the ladder (from out over the shaft: his face, the lobby's red behind him)
    G.cam({ pos: [0.8, 2.55, -0.95], target: [0, 1.05, 2.0], fov: 46 });
    A.look(null);
    if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); A.raw.expr('scared'); }
    await G.wait(0.8);
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // SET PIECE — the Middle (BOSS 'middle')
  // =================================================================================================================
  function C6_lukaSaved() {
    const answered = Object.values(S.calls || {}).some((v) => v === 'answered') || (S.stats && S.stats.callsAnswered > 0);
    const played = (S.voicemails || []).some((v) => v && v.played) || (S.stats && S.stats.voicemails > 0);
    return !!(answered || played);
  }
  C6.lukaSaved = C6_lukaSaved;
  defineBoss('middle', {
    async run(G) {
      const M = C6.mid || (C6.mid = { part: 'intro', drop: false });
      const hL = G.obj('c6sh:handL'), hR = G.obj('c6sh:handR');
      const ladder = World.build && World.build.ladders && World.build.ladders[0];
      // ---------------- part 1: the ladder ----------------
      if (M.part !== 'car') {
        M.part = 'ladder';
        if (ladder && Player.pos.y > -1 && Player.mode !== 'ladder') q(Player.climb(ladder, 'top'));
        G.prompt('{up} / {down}: climb.', { id: 'c6_ladder' });
        // the hands rise off the car and take turns across the ladder: a tell against the wall, then the swat
        const sw = [{ piv: hL, band: SHF.bands[0], dir: 1, st: 'up', t: 0 }, { piv: hR, band: SHF.bands[1], dir: -1, st: 'up', t: 0.9 }];
        let lift = 0, turn = 0, gap = 1.2;
        await G.loop((dt) => {
          lift = Math.min(1, lift + dt / 1.4);
          if (lift < 1) { C6_handPress(hL, -0.55, -0.3, 1 - lift); C6_handPress(hR, 0.62, 0.2, 1 - lift); return false; }
          const p = Player.pos, onLadder = Player.mode === 'ladder';
          if (!onLadder && p.y < SHF.roof + 0.5) return true;                        // he's on the roof
          // pick the next band to swat: the one he's about to pass (or inside)
          gap -= dt;
          for (const H of sw) {
            if (H.st === 'up') { C6_handSwing(H.piv, H.band + 18, 0, H.dir); continue; }
            H.t += dt;
            if (H.st === 'tell') {
              const k = U.ease.out(clamp(H.t / 1.05));
              H.piv.userData.hand.userData.curl(0.2 + 0.5 * k);
              C6_handSwing(H.piv, H.band + (1 - k) * 5, -H.dir * 0.25, H.dir);
              if (H.t >= 1.05) { H.st = 'swat'; H.t = 0; H.hit = false; G.sfx('whoosh', { pos: [0, H.band + 0.5, 1], vol: 1 }); }
            } else if (H.st === 'swat') {
              const k = clamp(H.t / 0.34), th = lerp(-H.dir * 0.25, H.dir * 0.25, U.ease.inOut(k));
              H.piv.userData.hand.userData.curl(0.7 - 0.5 * k);
              C6_handSwing(H.piv, H.band, th, H.dir);
              const cx = Math.sin(th) * (SHF.L - 0.9);
              if (!H.hit && onLadder && Math.abs(cx) < 0.62 && H.band - 0.05 < p.y + 1.75 && H.band + 0.62 > p.y) {
                H.hit = true;
                Player.damage(20, 'boss:middle', { force: true });
                G.sfx('hit_heavy', { pos: [p.x, p.y + 1, p.z], vol: 1 }); G.shake(0.35, 0.4);
              }
              if (H.t >= 0.34) { H.st = 'back'; H.t = 0; G.sfx('creak', { pos: [0, H.band + 2, 1], metal: false, vol: 0.5 }); }
            } else if (H.st === 'back') {
              const k = clamp(H.t / 0.8);
              C6_handSwing(H.piv, H.band + k * 18, H.dir * 0.25 * (1 - k), H.dir);
              if (H.t >= 0.8) { H.st = 'up'; H.t = 0; H.dir = -H.dir; }
            }
          }
          if (gap <= 0 && onLadder && sw.every((H) => H.st === 'up')) {
            // the band nearest ahead of him (the one whose danger zone he's in or is about to enter)
            let best = null, bd = 1e9;
            for (const H of sw) { const d = Math.abs((p.y + 0.8) - (H.band + 0.3)); if (p.y > H.band - 1.9 && d < bd) { bd = d; best = H; } }
            if (best) { best.st = 'tell'; best.t = 0; G.sfx('creak', { pos: [-best.dir * 1.3, best.band + 1, 1], vol: 0.8 }); G.sfx('breath', { pos: [0, best.band + 3, 0], vol: 0.35, n: 1 }); }
            gap = 0.55 + Math.random() * 0.4;
            turn++;
          }
          return false;
        });
        // on the roof: the hands press the car down again; the hatch
        M.part = 'roof';
        let k = 0;
        await G.loop((dt) => { k = Math.min(1, k + dt / 1.6); C6_handPress(hL, -0.55, -0.3, k); C6_handPress(hR, 0.62, 0.2, k); return k >= 1; });
        G.sfx('thud', { pos: [0, -8, 0], vol: 1 }); G.shake(0.2, 0.5);
        note(G, 'The hatch. Into the car.', 'c6_hatch');
        await G.wait(0.3);
        await G.think('The hatch.');
        await G.until(() => M.drop);
        // the drop into the car
        G.control(false);
        G.sfx('thud', { vol: 0.9 });
        await G.fade(1, 0.35);
        M.part = 'car';
        Player.teleport(SHF.brace[0], SHF.brace[1], 180);
        try { Cam.snap(); } catch (e) { /* cam */ }
        await G.wait(0.3);
        await G.fade(0, 0.5);
      }
      // ---------------- part 2: in the car — brace ----------------
      const L = G.actor('luka');
      const ceil = G.obj('c6sh:ceil'), light = G.light('c6sh:carlight'), jaw = [G.obj('c6sh:jawL'), G.obj('c6sh:jawR')];
      const panel = MATS.carpanel;
      const setRed = (on) => { if (light) light.set({ color: on ? '#ff2a1c' : '#dfeee9', intensity: on ? 5.5 : 3.2 }); if (panel) { panel.emissive.set(on ? '#ff2a1c' : '#e4f2ee'); panel.emissiveIntensity = on ? 2.4 : 1.3; } };
      const jawSet = (v) => { for (const j of jaw) if (j) j.position.x = SHF.CX + j.userData.sx * v * 0.55; };
      Player.lock('c6brace', true);
      G.control(true);
      Player.teleport(SHF.brace[0], SHF.brace[1], 180);
      const act = Player.actor;
      const braceAnim = (on) => { try { act.setAnim(on ? 'brace' : 'idle', { blend: 0.25 }); } catch (e) { /* rig */ } };
      L.place(SHF.luka[0], SHF.luka[1], 180); L.pose('brace'); L.hold('L', null); L.hold('R', null); L.expr('pain');
      G.prompt('Hold {interact}: brace. When the lights flash red, let go — then hold again.', { id: 'c6_brace', dur: 9 });
      let result = null;
      for (let round = 0; !result; round++) {
        let wins = 0, misses = 0, brace = 0, ceilY = SHF.ceil, jawT = 1.5, jawV = 0;
        M.wins = 0; M.misses = 0; M.round = round;
        setRed(false);
        if (round > 0) { G.prompt('Hold {interact}. Let go in the red.', { id: 'c6_brace2', dur: 5, force: true }); }
        while (wins < 3 && misses < 2) {
          // the calm: hold on (letting go too long is a miss)
          const calm = 2.2 + Math.random() * 1.2;
          let t = 0, slack = 0;
          await G.loop((dt) => {
            t += dt;
            const down = !!Input.down('interact');
            brace = clamp(brace + (down ? dt / 0.5 : -dt / 0.4), 0, 1);
            braceAnim(brace > 0.3);
            if (!down) slack += dt;
            try { UI.holdPrompt('Hold {interact}: brace', brace); } catch (e) { /* ui */ }
            M.phase = 'calm';
            ceilY = lerp(ceilY, SHF.ceil - (1 - brace) * 0.16, Math.min(1, dt * 3));
            if (ceil) ceil.position.y = ceilY;
            jawT -= dt; if (jawT <= 0) { jawT = 1.6 + Math.random() * 2; jawV = 0.35; G.sfx('slam', { pos: [SHF.CX, 1.2, 1.2], vol: 0.5 }); }
            jawV = Math.max(0, jawV - dt * 0.9); jawSet(jawV > 0.2 ? 0.25 : jawV);
            return t >= calm || slack > 1.3;
          });
          if (slack > 1.3) { misses++; M.misses = misses; G.sfx('lift_groan', { vol: 1 }); G.shake(0.3, 0.5); if (ceil) ceil.position.y = SHF.ceil - 0.2; await G.wait(0.5); continue; }
          // the shove: the lights flash red — let go
          try { UI.holdPrompt(null); } catch (e) { /* ui */ }
          setRed(true); G.sfx('lift_groan', { pos: [SHF.CX, 2.4, 0], vol: 1 }); G.sfx('thud', { vol: 0.8 }); G.shake(0.3, 0.9);
          let ft = 0, released = 0;
          M.phase = 'flash';
          await G.loop((dt) => {
            ft += dt;
            if (!Input.down('interact')) released += dt;
            if (ceil) ceil.position.y = SHF.ceil - Math.sin(clamp(ft / 1.0) * Math.PI) * 0.2;
            braceAnim(false);
            return ft >= 1.0;
          });
          setRed(false);
          // hold again, after
          let at = 0, regrip = false;
          M.phase = 'regrip';
          await G.loop((dt) => { at += dt; if (Input.down('interact')) { regrip = true; brace = Math.max(brace, 0.4); } return regrip || at >= 1.25; });
          if (released >= 0.2 && regrip) {
            wins++; M.wins = wins;
            G.sfx('clunk', { vol: 0.6 });
            try { if (L.raw) L.raw.gesture('grip'); } catch (e) { /* rig */ }
          } else {
            misses++; M.misses = misses;
            G.sfx('lift_groan', { vol: 1 }); G.shake(0.35, 0.6);
            if (ceil) ceil.position.y = SHF.ceil - 0.2;
            await G.wait(0.4);
          }
        }
        if (wins >= 3) { result = 'won'; break; }
        // missing twice: the car drops a level (10 damage), part 2 starts again
        try { UI.holdPrompt(null); } catch (e) { /* ui */ }
        setRed(true);
        if (light) light.on(false);
        G.sfx('lift_groan', { vol: 1 }); G.sfx('siren_cut', { vol: 0.5 });
        G.shake(0.7, 1.4);
        Player.damage(10, 'fall', { force: true });
        await G.wait(1.4);
        if (Player.dead || S.health <= 0) { Player.lock('c6brace', false); return 'dead'; }
        if (light) light.on(true);
        setRed(false);
        if (ceil) ceil.position.y = SHF.ceil;
        M.drops = (M.drops | 0) + 1;
        await G.wait(0.8);
      }
      // ---------------- win: the doors force open ----------------
      try { UI.holdPrompt(null); } catch (e) { /* ui */ }
      G.set('c6_setpiece', true);
      G.set('lukaSaved', C6_lukaSaved());
      G.control(false);
      Player.lock('c6brace', false);
      braceAnim(false);
      G.sfx('lift_groan', { vol: 1 }); G.sfx('slam', { pos: [SHF.CX, 1.2, 1.2], vol: 1 });
      G.cam({ pos: [SHF.CX - 1.05, 1.5, -1.0], target: [SHF.CX + 0.1, 1.2, 1.2], fov: 46 });
      let o = 0;
      M.phase = 'won';
      await G.loop((dt) => { o = Math.min(1, o + dt / 1.2); jawSet(U.ease.out(o) * 1.0); if (ceil) ceil.position.y = lerp(SHF.ceil, SHF.ceil + 0.2, o); return o >= 1; });
      for (let i = 0; i < 4; i++) { const h = G.obj('c6sh:small' + i); if (h) h.visible = false; }
      G.shake(0.3, 0.6);
      await G.fade(1, 0.8, '#c9d2cf');
      return 'won';
    },
  });

  // =================================================================================================================
  // CUTSCENE 6-2 "Is That All of It?" — the lift lobby, Level 6, back in the Fog world
  // =================================================================================================================
  defineCutscene('6-2', async (G) => {
    // state first
    G.set('c6_setpiece', true);
    G.setOutage(false);
    await G.goto('c6_level6', 'lifts', { sound: 'none', fade: false });
    await G.fade(1, 0);
    const A = G.aidan, L = G.actor('luka', 'luka');
    const [cx, cz] = L6.planter;
    const liftB = G.obj('c6l6:liftB'); if (liftB && liftB.userData.setOpen) liftB.userData.setOpen(0.5);
    const glow = G.light('c6l6:liftglow'); if (glow) glow.on(false);
    const far = G.light('c6l6:farlight'); if (far) far.on(false);
    L.hold('L', null); L.hold('R', null);
    if (L.raw) L.raw.idleLife = false;
    if (A.raw) A.raw.idleLife = false;
    // 1. SHOT — both men on the carpet, breathing hard, the lift doors half open and dark behind them
    A.place(25.55, 15.75, 150); A.pose('sit_floor'); A.expr('pain'); A.eyes('down');
    L.place(26.75, 15.2, 205); L.pose('sit_floor'); L.expr('tired'); L.eyes('closed');
    G.cam({ pos: [28.9, 0.72, 18.9], target: [26.0, 0.55, 14.8], fov: 44, to: { pos: [28.7, 0.74, 18.6], fov: 42 }, dur: 8 });
    await G.fade(0, 1.4);
    G.sfx('breath', { vol: 0.8, n: 3, pos: [25.7, 1, 15.9] });
    await G.wait(2.6);
    // (they've sat back against opposite walls)
    A.place(cx, cz - 0.62, 180); A.pose('sit_floor'); A.expr('tired'); A.eyes('down');
    L.place(24.2, 14.48, 0); L.pose('sit_knees'); L.expr('tired'); L.eyes('down');
    const lh = () => { const v = new THREE.Vector3(); try { L.raw.bones.head.getWorldPosition(v); } catch (e) { v.set(24.2, 0.95, 14.6); } return v; };
    const ah = () => { const v = new THREE.Vector3(); try { A.raw.bones.head.getWorldPosition(v); } catch (e) { v.set(cx, 0.95, cz - 0.7); } return v; };
    await G.wait(0.1);
    // 2. SHOT — close on Luka. Tired, beard unkempt, a lanyard with ordinary keys. No clipboard, no mirror. Just a man.
    { const h = lh(); G.cam({ pos: [h.x + 0.32, h.y + 0.02, h.z + 1.12], target: [h.x, h.y - 0.04, h.z], fov: 31, to: { pos: [h.x + 0.3, h.y + 0.01, h.z + 1.0], fov: 30 }, dur: 14 }); }
    await G.wait(1.2);
    L.eyes('at', A); L.look(A);
    await G.say('LUKA', '...Aidan. [beat] You\'re a hard man to get hold of.');
    { const h = ah(); G.cam({ pos: [h.x - 0.3, h.y + 0.05, h.z - 0.9], target: [h.x, h.y - 0.05, h.z], fov: 32 }); }
    A.look(L); A.eyes('down'); A.expr('scared');
    await G.say('AIDAN', 'I\'m sorry. I\'m sorry, I know I didn\'t come in, I know—');
    { const h = lh(); G.cam({ pos: [h.x + 0.32, h.y + 0.02, h.z + 1.12], target: [h.x, h.y - 0.04, h.z], fov: 31 }); }
    await G.say('LUKA', 'Mate. [beat] Stop. [beat] I\'m not here to fire you.');
    await G.wait(0.6);
    // 3. SHOT — side-on two-shot. They sit against opposite walls of the lobby and don't look at each other.
    L.look(null); L.eyes('away', A); A.look(null); A.eyes('away', L);
    G.cam({ pos: [29.8, 1.05, 16.1], target: [24.8, 0.75, 16.1], fov: 42, to: { pos: [29.4, 1.05, 16.1], fov: 41 }, dur: 20 });
    await G.wait(1.4);
    await G.say('LUKA', 'The complaint came to me the morning after she fell. [beat] I read the case. Then I rang you. Then I rang you again. [beat] Then I got in the car.');
    await G.say('AIDAN', 'Why?');
    await G.say('LUKA', 'Because nobody could reach you. And that\'s my job. Knowing my people are okay.');
    await G.wait(0.8);
    // 4. SHOT — close on Luka looking at his hands
    L.eyes('down'); L.expr('sad');
    { const h = lh(); G.cam({ pos: [h.x - 0.5, h.y + 0.04, h.z + 1.25], target: [h.x + 0.02, h.y - 0.15, h.z + 0.2], fov: 40, to: { pos: [h.x - 0.46, h.y + 0.04, h.z + 1.15], fov: 38 }, dur: 16 }); }
    await G.wait(0.8);
    await G.say('LUKA', 'I write the number on the whiteboard every morning. Eleven. Fourteen. Whatever they send me. [beat] I never once wrote what it cost. [beat] I\'m scared too, mate. Every month. There\'s someone above me with a whiteboard.');
    await G.wait(1.0);
    // 5. SHOT — close on Aidan
    { const h = ah(); G.cam({ pos: [h.x - 0.35, h.y + 0.04, h.z - 0.95], target: [h.x, h.y - 0.04, h.z], fov: 31, to: { pos: [h.x - 0.3, h.y + 0.03, h.z - 0.85], fov: 29 }, dur: 18 }); }
    A.expr('sad'); A.eyes('down');
    await G.wait(1.0);
    await G.say('AIDAN', 'I sold her the wrong thing. [beat] The internet doesn\'t work at her place. Her alarm ran through the landline, and I moved the landline, and I didn\'t check. She asked me. She asked me and I said it\'d be fine. [beat] It was an accident.');
    // 6. SHOT — Luka. A long beat. Then, gently:
    { const h = lh(); G.cam({ pos: [h.x + 0.3, h.y + 0.02, h.z + 1.1], target: [h.x, h.y - 0.04, h.z], fov: 30 }); }
    L.eyes('at', A); L.look(A); L.expr('neutral');
    await G.longBeat();
    await G.say('LUKA', 'Okay. [beat] Is that all of it?');
    // 7. CHOICE (no timer; the camera holds on Aidan)
    { const h = ah(); G.cam({ pos: [h.x - 0.32, h.y + 0.03, h.z - 0.9], target: [h.x, h.y - 0.04, h.z], fov: 30 }); }
    A.eyes('down');
    const i = await G.choice(['[Stay silent]', '"That\'s all of it."', '"...No."']);
    if (i === 0) {
      G.set('c6_answer', 'silent');
      await G.wait(1.6);
      { const h = lh(); G.cam({ pos: [h.x + 0.3, h.y + 0.02, h.z + 1.1], target: [h.x, h.y - 0.04, h.z], fov: 30 }); }
      await G.say('LUKA', 'Okay. [beat] When you\'re ready.');
    } else if (i === 1) {
      G.set('c6_answer', 'all');
      G.track('A', 3, 'Ch 6: "That\'s all of it."');
      await G.say('AIDAN', 'That\'s all of it.');
      { const h = lh(); G.cam({ pos: [h.x + 0.3, h.y + 0.02, h.z + 1.1], target: [h.x, h.y - 0.04, h.z], fov: 30, to: { pos: [h.x + 0.27, h.y + 0.02, h.z + 0.98], fov: 28 }, dur: 6 }); }
      L.eyes('at', A);
      await G.wait(2.4);                                                     // he looks at him for a long moment
      await G.say('LUKA', '...Okay.');
      L.eyes('away', A);                                                      // he doesn't believe it
      await G.wait(1.0);
    } else {
      G.set('c6_answer', 'no');
      G.track('F', 3, 'Ch 6: "...No."');
      await G.say('AIDAN', '...No.');
      { const h = lh(); G.cam({ pos: [h.x + 0.3, h.y + 0.02, h.z + 1.1], target: [h.x, h.y - 0.04, h.z], fov: 30 }); }
      await G.wait(0.8);
      q(L.gesture('nod'));
      await G.wait(0.9);
      await G.say('LUKA', 'Okay. [beat] When you\'re ready. I\'m not going anywhere.');
    }
    await G.wait(0.6);
    // 8. SHOT — over Aidan's shoulder, down the corridor. Keys chime. The Standard stands at the far end, stooped,
    //    clipboard raised. Its lanyard swings into the light: AIDAN. Luka sees nothing.
    G.set('standardName', 'AIDAN');
    try { Enemies.standard.stop(); } catch (e) { /* enemies */ }
    const std = G.spawn({ id: 'c6_level6:std62', type: 'standard', pos: [6.4, 18.2], rot: 90, name: 'AIDAN', persist: false });
    if (std) { std.ai = false; std.yaw = 90 * D2R; }
    A.look([6.4, 2.2, 18.2]); A.eyes('ahead');
    { const h = ah(); G.cam({ pos: [h.x + 1.4, h.y + 0.14, h.z - 0.3], target: [5.4, 1.75, 18.3], fov: 24, to: { pos: [h.x + 1.3, h.y + 0.14, h.z - 0.28], fov: 21 }, dur: 9 }); }
    G.sfx('keys', { pos: [6.4, 1.6, 18.2], vol: 0.9 });
    await G.wait(1.2);
    G.sfx('tube_flicker', { pos: [6.6, 2.5, 18.2], vol: 0.8 });
    if (far) { far.on(true); await G.wait(0.12); far.on(false); await G.wait(0.2); far.on(true); }
    G.sfx('keys', { pos: [6.4, 1.6, 18.2], vol: 0.7 });
    await G.wait(1.6);
    // (insert) the card swings into the light: AIDAN
    const card = (() => { const v = V3(6.4, 1.95, 18.2); try { const a = std && std.actor; const b = a && (a.anchors.card || a.bones.chest); if (b) b.getWorldPosition(v); } catch (e) { /* rig */ } return v; })();
    if (far) far.intensity = 2;                                              // (so the card reads, not burns)
    G.cam({ pos: [card.x + 0.95, card.y - 0.1, card.z - 0.05], target: [card.x, card.y - 0.08, card.z], fov: 13, to: { pos: [card.x + 0.9, card.y - 0.1, card.z - 0.05], fov: 12 }, dur: 3 });
    G.sfx('keys', { pos: [6.4, 1.6, 18.2], vol: 0.6 });
    await G.wait(2.4);
    G.cam({ pos: [27.7, 1.25, 19.8], target: [24.7, 0.75, 15.7], fov: 40 });
    L.look(A); L.eyes('at', A); L.expr('neutral');
    await G.say('LUKA', 'What is it?');
    { const h = ah(); G.cam({ pos: [h.x - 0.33, h.y + 0.03, h.z - 0.88], target: [h.x, h.y - 0.02, h.z], fov: 30 }); }
    await G.say('AIDAN', 'It was never you.');
    await G.say('LUKA', 'What?');
    A.look(L); A.eyes('at', L);
    await G.say('AIDAN', 'Nothing. [beat] I have to go to the hospital.');
    { const h = lh(); G.cam({ pos: [h.x + 0.32, h.y + 0.02, h.z + 1.12], target: [h.x, h.y - 0.04, h.z], fov: 31 }); }
    L.expr('tired');
    await G.say('LUKA', 'I\'ll drive.');
    await G.beat();
    L.expr('smile'); q(L.gesture('laugh'));
    await G.say('LUKA', 'If I can find the car.');
    await G.beat();
    L.expr('neutral');
    await G.say('LUKA', 'Go. I\'ll find the road and meet you there.');
    // (state — plain statements)
    G.set('c6_done', true);
    try { if (std) std.remove(); } catch (e) { /* enemies */ }
    if (A.raw) { A.raw.idleLife = true; A.raw.posture = Math.max(A.raw.posture || 0, 0.5); }
    note(G, 'Down the shaft. Get to him.', 'c6_shaft', { done: true });
    note(G, 'The hospital. District Hospital — the ring road, east.', 'c7_goal');
    await G.wait(0.8);
    await G.fade(1, 1.2);
    // CHAPTER CARD "DISTRICT HOSPITAL"
    const ok = await G.startChapter(7);
    if (ok === false) {
      // (no Chapter 7 in this build: show its card and hand the lobby back)
      await G.card('DISTRICT HOSPITAL');
      A.place(cx + 0.6, cz - 1.4, 180); A.pose('idle');
      try { L.remove(); } catch (e) { /* actor */ }
      await G.fade(0, 1.0);
    }
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // Chapter 6
  // =================================================================================================================
  defineChapter({
    n: 6, id: 'ch6', title: 'THE MIDDLE', card: 'THE MIDDLE',
    start: { room: 'c5_level4', entry: 'escalations' },
    // what a player carries into Chapter 6 (chapter select): the Prologue and Chapters 1–5
    debugState(s) {
      const give = (id, n = 1) => { if (!ITEMS[id]) return; const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      const MAPS6 = ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'map_care', 'rmap_care', 'map_office', 'rmap_office'];
      for (const id of ['box_cutter', 'steel_bar', 'extinguisher', 'jumper_tool', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate', 'ticket', 'gate_key', 'visitor_pass', 'keycard', 'chloe_pin', ...MAPS6]) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('energy_drink', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      s.ammo = s.ammo || {}; s.ammo.extinguisher = Math.max(s.ammo.extinguisher | 0, 3);
      for (const id of MAPS6) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true, standardName: 'LUKA',
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
        c3_bossDone: true, waiSaved: s.flags.waiSaved ?? true,
        c4_metChase: true, c4_clicks: true, c4_logs: 'read', c4_bossDone: true, c4_done: true, chaseHurt: false,
        c5_pass: true, c5_chase: true, c5_l4: true, c5_chloe: true, c5_bossDone: true, c5_done: true, chloeSaved: s.flags.chloeSaved ?? true,
      });
      if (!s.flags.waiSaved) s.flags.waiLost = true;
      Object.assign(s.done, { 'c4:gateOpen': true });                             // (the escalations door: the keycard opens it)
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'acct4', 'acct5', 'huddle1', 'huddle2', 'huddle3', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note'), 'plaque', 'wai_email', 'oplog1', 'oplog2', 'oplog3', 'oplog4', 'oplog6', pick('fuse_note'), 'call_logs', 'chase_notes', 'rotary_card', 'chloe_pin']) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      for (const c of ['luka1', 'luka2', 'luka3', 'luka4', 'luka5', 'luka6']) s.calls[c] = s.calls[c] || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 6);
      for (const id of ['P-1', 'P-4', '1-1', '1-2', '1-3', '1-4', '1-7', '1-8', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '3-3b', '4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4']) s.done['cs:' + id] = true;
      Object.assign(s.done, { 'break:ch1': true, 'break:ch2': true, 'break:ch3': true, 'break:ch4': true, 'break:ch5': true });
      s.F = Math.max(s.F || 0, 28); s.A = Math.max(s.A || 0, 3); s.stats.freed = Math.max(s.stats.freed || 0, 5);
      s.chaseHits = s.chaseHits | 0;
      s.notes = (s.notes || []).filter((n) => n && !/^c[1-5]_/.test(n.id || ''));
      s.notes.push({ id: 'c6_goal', text: 'Escalations. Chloe\'s keycard.', done: false });
    },
    async begin(G, o = {}) {
      G.bars(null);
      // (a build without Level 4 yet: start at the escalations office itself)
      if (!ROOMS.c5_level4 && !o.resumed) await G.goto('c6_escalations', 'door', { sound: 'none' });
      if (G.once('c6:begin')) {
        note(G, 'Escalations. Chloe\'s keycard.', 'c6_goal');
        await G.wait(1.4);
        if (G.inRoom('c5_level4')) await G.think('Escalations. [beat] Her keycard.');
      }
    },
  });
}
