// ==== data/17_ch7.js — Chapter 7 "District Hospital" (spec §11 Ch 7, §7A Ring Road east + Summit Road gate, §7B District
// Hospital, §6 the Smile + the Tethered, §8 Luka's call 8, §4 Face/Avoid: Luke's voicemails, the standoff) — tag C7_ ====
// Rooms (CONTENT_PLAN §2):
//   c7_ringroad   Ring Road east: the road that "wasn't there before" — from the office forecourt (west, → c5_ringroad
//                 :office) round the hill to the hospital car park (east, → c7_carpark:road). The old barrier and the
//                 ROAD CLOSED sign lie pushed onto the verge where the drop used to be; a bus stop with flowers nobody
//                 collected, a car with a baby seat, the blue H signs, a balloon caught on the guardrail.
//   c7_carpark    40 × 30 m south of the hospital: the concrete multi-storey to the west (CAR PARK FULL), parked cars
//                 beaded with fog, the one working sodium light over a bench on a garden island (CUTSCENE 7-3), the
//                 main entrance under its canopy (→ c7_reception:entrance), the chained Summit Road gate on the NE edge
//                 ("Chained."; after Room 12 the chain lies on the ground → CHAPTER CARD "THE MAST" / c8_summit:bottom).
//   c7_reception  16 × 12 m: the visitor book ("Luke — Ward 3, Rm 12." → "Room twelve."), the directory ("Ward 3 —
//                 Orthopaedics" → "Broken bones." [beat] pen click = map_hospital), the blank "You said, we did" board,
//                 first aid kit, the payphone; doors to the waiting room (W), the staff tea room (N, behind the desk)
//                 and the corridor (E).
//   c7_waiting    12 × 10 m: rows of chairs, Tethered ×2 seated facing a TV looping one plan advertisement, the vending
//                 machine ("Out of order. Of course."), the kids' corner; sticker10.
//   c7_tearoom    6 × 5 m: the chapter's break table.
//   c7_corridor   The U corridor, ~70 m × 4 m (east, north, west) to the nurses' station. Built by S.flags.c7_store:
//                 the Fog-world hospital (dim lino, handrails, fire doors held open, locked side rooms) or, from
//                 CUTSCENE 7-1 until 7-2, the Smile store (teal walls, glossy retail vinyl, clinical light, hospital
//                 beds down the middle like demo tables with a phone on each pillow, the side rooms as store bays, the
//                 front counter by the reception door, security gates in the fire doorways, NO SERVICE). Smiles ×3:
//                 one stands in the SE fire doorway, one walks the first leg, one walks the second and third.
//   c7_nurses     8 × 6 m nurses' station: the PA microphone ("Patient paging." → the page), energy drink, coffee; three
//                 doors into Ward 3 on the north wall, a Smile standing in each (store only).
//   c7_ward3      Ward 3 corridor, 30 × 3 m north from the nurses' station, locked rooms either side, Luke's plastic chair
//                 outside Room 12 at the far end (CUTSCENE 7-2 "Three Times").
//   c7_room12     6 × 4 m: the empty bed, her glasses on the pillow, the beige bedside phone, the window toward the mast
//                 (CUTSCENE 7-4 "Room 12").
//   c7_flashback  (cutscene only) Aidan's city store back office in ordinary daylight, the shop floor and the huddle board
//                 through the office window (7-2's flashback).
// Cutscenes: 7-1 "Hi There!" (c7_corridor; the corridor changes as he walks in: chime, clinical light, rebuilt as the
//   store under the white-out), 7-page (in-engine: the PA), 7-2 "Three Times" (c7_ward3 → c7_flashback → c7_ward3),
//   7-3 "Standoff" (c7_carpark, the timed choice), 7-4 "Room 12". CALL 8 as Aidan steps out of the hospital after
//   Room 12. The summit gate → G.startChapter(8).
// The Smile (spec §6): custom enemy type 'c7_smile' — friendly walk, never runs, stands in doorways; a touch pins Aidan:
//   the pen pressed into his hand, a red SIGNED stamp, 20 damage (Action level applies), pushed back to the last doorway
//   he walked through; hits make it flinch, never harm it; no phone bars (tell 'smile' → Phone 'nobars').
// State: S.flags c7_arrived, c7_store (the corridors are the Smile store), c7_paged (the PA was used once), c7_luke (7-2
//   done), c7_standoff (7-3 done), c7_standoffPick ('step'|'talk'|'run'), c7_room12 (CONTENT_PLAN: summit chain down),
//   c7_visitor (visitor book read), chaseSaved / lukeSaved (fate); S.done c7:* keys.
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
  const now = () => (typeof Time !== 'undefined' ? Time.now : 0);
  const store = () => flag('c7_store');
  // transient presentation state (never saved)
  const C7 = { lastCross: null, sides: {}, pinning: false, pageUntil: -1, voiceT: -99, entered: null, reachFx: null, amb: null, fill: null };
  try { if (typeof window !== 'undefined' && window.SH) window.SH.c7 = C7; } catch (e) { /* tests only */ }

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h, U.rng(U.hash('c7:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c7:' + key;
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
  const wordmark = (ctx, x, y, s, col) => { try { Tex.drawWordmark(ctx, x, y, s, { color: col || BR.yellow }); } catch (e) { tx(ctx, 'optus', x, y, s, col || BR.yellow, { weight: '900', font: FN.heavy }); } };

  // the lens flare over a Smile's eyes: a hard white core, a long horizontal streak, a faint teal ghost ring
  const flareTex = () => ctex('flare', 256, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const st = x.createLinearGradient(0, cy, w, cy);
    st.addColorStop(0, 'rgba(160,255,245,0)'); st.addColorStop(0.35, 'rgba(190,255,250,0.35)'); st.addColorStop(0.5, 'rgba(255,255,255,0.95)'); st.addColorStop(0.65, 'rgba(190,255,250,0.35)'); st.addColorStop(1, 'rgba(160,255,245,0)');
    x.fillStyle = st; x.fillRect(0, cy - 2.5, w, 5);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, h * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.95)'); g.addColorStop(0.42, 'rgba(170,250,240,0.35)'); g.addColorStop(1, 'rgba(120,230,220,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, h * 0.5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(140,240,230,0.22)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, h * 0.36, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(cx - 1, cy - h * 0.46, 2, h * 0.92);
  });
  // the directory board at reception (the map)
  const directoryTex = () => ctex('directory', 512, 640, (x, w, h, r) => {
    x.fillStyle = '#eef0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d5d78'; x.fillRect(0, 0, w, 96);
    tx(x, 'DISTRICT HOSPITAL', 28, 50, 36, '#ffffff', { weight: 'bold', spacing: 2 });
    tx(x, 'SIGNAL HILL  ·  GROUND FLOOR DIRECTORY', 28, 80, 17, '#cfe6ee', { spacing: 1 });
    const rows = [['Reception', '←  here'], ['Waiting Room', '←'], ['Ward 1 — General Medicine', '→'], ['Ward 2 — Maternity', '→'], ['Ward 3 — Orthopaedics', '→'], ['Ward 4 — Rehabilitation', '→'], ['Radiology', '→'], ['Pathology', '→'], ['Chapel', '→'], ['Café', 'CLOSED'], ['Emergency', 'OUTSIDE — EAST']];
    rows.forEach(([a, b], i) => {
      const y = 140 + i * 44;
      x.fillStyle = i % 2 ? '#e4e8e2' : '#f4f5f0'; x.fillRect(16, y - 30, w - 32, 42);
      tx(x, a, 32, y, 22, i === 4 ? '#0f2f3f' : '#26343a', { weight: i === 4 ? 'bold' : '' });
      tx(x, b, w - 34, y, 20, '#1d5d78', { align: 'right', weight: 'bold' });
    });
    x.fillStyle = '#1d5d78'; x.fillRect(0, h - 44, w, 44);
    tx(x, 'Visiting hours 10am – 8pm. Please sign the visitor book.', w / 2, h - 16, 16, '#ffffff', { align: 'center' });
    age(x, w, h, r, 0.5);
  });
  // the TV in the waiting room: one plan advertisement, on loop
  function paintAd(c, w, h, t) {
    const k = (t % 9) / 9;
    c.fillStyle = BR.teal; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w * 0.72, h * 0.4, 4, w * 0.72, h * 0.4, w * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,50,50,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // a smiling grandmother on a phone, drawn flat and bright (the stock photo)
    const px = w * 0.72, py = h * 0.52, s = h * (0.34 + k * 0.03);
    c.fillStyle = '#5a7aa3'; c.beginPath(); c.ellipse(px, py + s * 0.95, s * 0.72, s * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8c6b1'; c.beginPath(); c.arc(px, py, s * 0.42, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d6d2cb'; c.beginPath(); c.arc(px, py - s * 0.18, s * 0.44, Math.PI, Math.PI * 2); c.fill();
    c.strokeStyle = '#3b2a22'; c.lineWidth = 3; c.beginPath(); c.arc(px, py + s * 0.08, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#1a1d1e'; c.fillRect(px - s * 0.6, py - s * 0.28, s * 0.16, s * 0.38);
    c.fillStyle = '#ffffff';
    const head = ['STAY CLOSE.', 'STAY CONNECTED.'][Math.floor(t / 4.5) % 2];
    tx(c, head, w * 0.06, h * 0.26, h * 0.13, '#ffffff', { weight: '900', font: FN.heavy });
    tx(c, 'The Seniors Plan', w * 0.06, h * 0.38, h * 0.07, '#e8fbf9', {});
    c.fillStyle = BR.yellow; c.fillRect(0, h * 0.64, w * 0.52, h * 0.2);
    tx(c, '$35', w * 0.06, h * 0.8, h * 0.15, BR.ink, { weight: '900', font: FN.heavy });
    tx(c, '/mth  — home phone & internet', w * 0.25, h * 0.77, h * 0.045, BR.ink, { weight: 'bold' });
    tx(c, 'Coverage varies by area. Ask in store.', w * 0.06, h * 0.93, h * 0.04, 'rgba(255,255,255,0.8)', {});
    wordmark(c, w * 0.78, h * 0.93, h * 0.07, BR.yellow);
    // a slow wipe of light across the frame, the only motion
    const wx = ((t * 0.2) % 1.6 - 0.3) * w;
    const wg = c.createLinearGradient(wx - 40, 0, wx + 40, 0);
    wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = wg; c.fillRect(0, 0, w, h);
  }
  // Luke's phone: the call log (the insert "Outgoing — Store (3)")
  function paintCallLog(c, w, h, playing) {
    c.fillStyle = '#0c1012'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b2327'; c.fillRect(0, 0, w, h * 0.12);
    tx(c, 'Recents', w * 0.08, h * 0.085, h * 0.05, '#e8eef0', { weight: 'bold' });
    tx(c, 'THIS WEEK', w * 0.08, h * 0.25, h * 0.032, '#6f7c80', { weight: 'bold', spacing: 2 });
    const rows = [['Store', 'Outgoing', '(3)', true], ['Nan', 'Missed', '(2)', false], ['Work — Dave', 'Incoming', '', false], ['Nan', 'Outgoing', '', false]];
    rows.forEach(([n, k, cnt, hi], i) => {
      const y = h * (0.36 + i * 0.12);
      if (hi) { c.fillStyle = 'rgba(56,210,198,0.16)'; c.fillRect(0, y - h * 0.065, w, h * 0.11); }
      tx(c, n + (cnt ? '  ' + cnt : ''), w * 0.08, y, h * 0.052, hi ? '#ffffff' : '#c8d0d4', { weight: hi ? 'bold' : '' });
      tx(c, k, w * 0.08, y + h * 0.04, h * 0.035, k === 'Missed' ? '#e05a4a' : '#8a979c', {});
      tx(c, ['Tue', 'Mon', 'Mon', 'Sun'][i], w * 0.92, y, h * 0.035, '#8a979c', { align: 'right' });
    });
    if (playing) {
      c.fillStyle = '#1b2327'; c.fillRect(0, h * 0.84, w, h * 0.16);
      tx(c, 'Voicemail — ' + playing, w * 0.08, h * 0.915, h * 0.04, '#38d2c6', {});
      c.fillStyle = '#38d2c6'; c.fillRect(w * 0.08, h * 0.945, w * 0.84 * 0.4, 3);
    }
  }
  // the flashback terminal: case 118-2231, the two buttons, the cursor
  function paintCase(c, w, h, st) {
    c.fillStyle = '#eef2f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = BR.teal; c.fillRect(0, 0, w, h * 0.1);
    tx(c, 'CUSTOMER CARE  ·  CASES', w * 0.03, h * 0.07, h * 0.045, '#ffffff', { weight: 'bold' });
    tx(c, 'STORE 0412 — CITY', w * 0.97, h * 0.07, h * 0.04, '#e8fbf9', { align: 'right' });
    tx(c, 'CASE 118-2231', w * 0.05, h * 0.2, h * 0.07, '#10282a', { weight: 'bold' });
    const lines = ['Account: 4471-0932 (Signal Hill)', 'Contact: LUKE (grandson)  ·  Inbound calls: ' + (st.day || 1), 'Issue: medical alarm not working since', '  landline moved to home internet', 'Assigned: AIDAN', 'Status: CALLBACK DUE'];
    lines.forEach((l, i) => tx(c, l, w * 0.05, h * (0.29 + i * 0.065), h * 0.042, '#2a3a3c', {}));
    const btn = (x, y, bw, bh, label, col, hov) => {
      c.fillStyle = hov ? '#ffffff' : col; c.fillRect(x, y, bw, bh);
      c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(x, y, bw, bh);
      tx(c, label, x + bw / 2, y + bh * 0.64, bh * 0.4, hov ? col : '#ffffff', { align: 'center', weight: 'bold' });
    };
    btn(w * 0.05, h * 0.76, w * 0.4, h * 0.11, 'Call customer', '#1f8a55', st.hover === 'call');
    btn(w * 0.53, h * 0.76, w * 0.42, h * 0.11, 'Follow up tomorrow', '#7a7f80', st.hover === 'tomorrow');
    if (st.done) { c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(w * 0.05, h * 0.9, w * 0.9, h * 0.07); tx(c, 'Callback rescheduled: TOMORROW', w * 0.5, h * 0.95, h * 0.04, '#7a2a22', { align: 'center', weight: 'bold' }); }
    if (st.cursor) {
      const [cx, cy] = st.cursor;
      c.fillStyle = '#ffffff'; c.strokeStyle = '#000000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy + 22); c.lineTo(cx + 6, cy + 17); c.lineTo(cx + 11, cy + 27); c.lineTo(cx + 15, cy + 25); c.lineTo(cx + 10, cy + 15); c.lineTo(cx + 17, cy + 15); c.closePath(); c.fill(); c.stroke();
    }
  }
  // the view from Room 12: the hill above the fog, the mast on it, a night sky that is only the fog's glow
  const mastViewTex = () => ctex('mastview', 1024, 512, (x, w, h, r) => {
    const sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#11181a'); sky.addColorStop(0.55, '#2c3638'); sky.addColorStop(1, '#6f7a78');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    // the hill: a dark shoulder rising right of centre
    x.fillStyle = '#0b0f10';
    x.beginPath(); x.moveTo(0, h * 0.78); x.bezierCurveTo(w * 0.3, h * 0.72, w * 0.48, h * 0.52, w * 0.62, h * 0.47); x.bezierCurveTo(w * 0.72, h * 0.45, w * 0.86, h * 0.56, w, h * 0.6); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    // the mast: a lattice tapering up from the summit
    const mx = w * 0.63, base = h * 0.47, top = h * 0.07;
    x.strokeStyle = '#050707'; x.lineWidth = 2;
    const L = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
    L(mx - 16, base, mx - 2, top); L(mx + 16, base, mx + 2, top);
    for (let i = 0; i < 14; i++) { const t0 = i / 14, t1 = (i + 1) / 14; const y0 = lerp(base, top, t0), y1 = lerp(base, top, t1), hw0 = lerp(16, 2, t0), hw1 = lerp(16, 2, t1); x.lineWidth = 1.2; L(mx - hw0, y0, mx + hw1, y1); L(mx + hw0, y0, mx - hw1, y1); L(mx - hw1, y1, mx + hw1, y1); }
    x.lineWidth = 3; L(mx, top, mx, top - h * 0.03);
    for (const yy of [0.33, 0.22, 0.13]) { const y = h * yy; x.fillStyle = '#050707'; x.fillRect(mx - 9, y - 2, 18, 4); }
    // the fog bank swallowing the town below the hill
    for (let i = 0; i < 70; i++) {
      const fx = r() * w, fy = h * (0.6 + r() * 0.35), rr = 40 + r() * 140;
      const fg = x.createRadialGradient(fx, fy, 0, fx, fy, rr);
      fg.addColorStop(0, 'rgba(150,160,158,0.28)'); fg.addColorStop(1, 'rgba(150,160,158,0)');
      x.fillStyle = fg; x.fillRect(fx - rr, fy - rr, rr * 2, rr * 2);
    }
    const band = x.createLinearGradient(0, h * 0.62, 0, h);
    band.addColorStop(0, 'rgba(140,150,148,0)'); band.addColorStop(0.35, 'rgba(140,150,148,0.7)'); band.addColorStop(1, 'rgba(160,170,168,0.95)');
    x.fillStyle = band; x.fillRect(0, h * 0.62, w, h * 0.38);
  });
  // signage helpers
  const plate = (key, text, o = {}) => ctex('plate|' + key, o.w || 512, o.h || 128, (x, w, h, r) => {
    x.fillStyle = o.bg || '#1d5d78'; x.fillRect(0, 0, w, h);
    const lines = String(text).split('\n');
    const size = o.size || Math.min(h * 0.5 / lines.length * 1.3, h * 0.45);
    lines.forEach((l, i) => tx(x, l, o.align === 'left' ? w * 0.06 : w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.2 + size * 0.36, size, o.fg || '#ffffff', { align: o.align || 'center', weight: o.weight ?? 'bold', font: o.font || FN.sans, spacing: o.spacing }));
    if (o.age !== 0) age(x, w, h, r, o.age ?? 0.4);
  });
  const storeTex = (key, text, o = {}) => ctex('store|' + key, o.w || 512, o.h || 160, (x, w, h) => {
    x.fillStyle = o.bg || BR.teal; x.fillRect(0, 0, w, h);
    if (o.logo !== false) wordmark(x, w * 0.04, h * 0.64, h * 0.34, BR.yellow);
    const lines = String(text).split('\n');
    const size = o.size || h * 0.3;
    lines.forEach((l, i) => tx(x, l, o.logo === false ? w / 2 : w * 0.6, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15 + size * 0.36, size, o.fg || '#ffffff', { align: 'center', weight: '900', font: FN.heavy }));
  });
  const priceTex = (key, head, price, sub) => ctex('price|' + key, 256, 192, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, h * 0.3);
    tx(x, head, w / 2, h * 0.21, h * 0.13, '#ffffff', { align: 'center', weight: 'bold' });
    tx(x, price, w / 2, h * 0.66, h * 0.3, BR.ink, { align: 'center', weight: '900', font: FN.heavy });
    tx(x, sub, w / 2, h * 0.88, h * 0.08, '#51605f', { align: 'center' });
  });
  const cardTex = (key, lines, o = {}) => ctex('card|' + key, o.w || 256, o.h || 192, (x, w, h, r) => {
    x.fillStyle = o.bg || '#f4f1e6'; x.fillRect(0, 0, w, h);
    lines.forEach((l, i) => { if (o.hand) hand(x, l, w * 0.08, h * (0.22 + i * 0.17), { size: o.size || 20, color: o.ink || '#1f2c6e', maxWidth: w * 0.86 }); else tx(x, l, w * 0.08, h * (0.2 + i * 0.16), o.size || 18, o.ink || '#222', { font: o.font || FN.sans, weight: i === 0 ? 'bold' : '' }); });
    age(x, w, h, r, o.age ?? 0.6);
  });

  // =================================================================================================================
  // THE SMILE (spec §6) — salespeople in spotless uniforms, the smile ear to ear, a lens flare where the eyes are, a pen
  // and a tablet, every badge AIDAN. They walk up friendly and never run; they stand in doorways; a touch pins him.
  // def: post:[x, z, faceDeg] (stands in that doorway) | route:[[x, z, pauseSec?, faceDeg?], …] (walks it), seed, colR
  // =================================================================================================================
  const SM = { walk: 0.8, approach: 1.1, notice: 7, close: 2.6, cone: 160, giveUp: 11, lost: 3.5, touch: 0.95, postNotice: 5.8, postReach: 2.0, postLeash: 1.25, voiceCd: 3.2, ownCd: 8 };
  const SMILE_LINES = () => (DIALOGUE && Array.isArray(DIALOGUE.smile) && DIALOGUE.smile.length ? DIALOGUE.smile : ['Hi there! What brings you in today?', "That'll all be fine.", 'Can I interest you in anything else?']);
  const smileSay = (e, i, force) => {
    const t = now();
    if (!force && (t - C7.voiceT < SM.voiceCd || t - (e.data.voiceT ?? -99) < SM.ownCd)) return;
    C7.voiceT = t; e.data.voiceT = t;
    try { Enemies.say(SMILE_LINES()[i % 3], 'quiet', 2.8); } catch (err) { /* voice */ }
  };
  let flareMat = null;
  function smileRig(seed) {
    const a = Rig.create('rep', {
      seed, top: { kind: 'polo', color: '#19a3a0', logo: true, fresh: true }, pants: { kind: 'slacks', color: '#121214' },
      shoes: { kind: 'dress', color: '#0b0b0c', sole: '#070707' }, lanyard: { color: '#0f7a77', card: 'AIDAN', role: 'HERE TO HELP' },
      badge: 'AIDAN', eyes: false, glasses: null, beard: null, style: { upright: 1, armSwing: 0.45, stepLen: 0.94, tension: 0 }, habits: [],
      face: { bags: 0, stubble: 0, wrinkles: 0, blush: 1.1 },
      hold: { L: ['tablet', { pose: 'shield' }], R: 'pen' }, expr: 'smile_huge',
    });
    a.idleLife = false;
    a.walkSpeed = SM.approach;
    if (!flareMat) { flareMat = new THREE.SpriteMaterial({ map: flareTex(), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }); flareMat.userData.shared = true; }
    a.flares = [];
    for (const s of ['L', 'R']) {
      const anc = a.eyeAnchors && a.eyeAnchors[s];
      if (!anc) continue;
      const sp = new THREE.Sprite(flareMat); sp.scale.set(0.2, 0.075, 1); sp.position.z += 0.056; sp.renderOrder = 3;
      anc.add(sp); a.flares.push(sp);
    }
    return a;
  }
  const flat = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const turnTo = (e, want, rate, dt) => { e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, want), -rate * dt, rate * dt); };
  const losTo = (e, p) => { try { return World.los(e.pos.x, e.pos.z, p.x, p.z, { minH: 1.4, ignore: (c) => !!c.enemy }); } catch (err) { return true; } };
  // walk toward (tx, tz) along the room's nav grid; true on arrival
  function smMove(e, tx0, tz0, speed, dt, stopAt = 0.15) {
    const D = e.data, a = e.actor;
    const d = Math.hypot(tx0 - e.pos.x, tz0 - e.pos.z);
    if (d <= stopAt) { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.35 }); D.stuck = 0; return true; }
    let wx = tx0, wz = tz0;
    let clear = true;
    try { clear = World.los(e.pos.x, e.pos.z, tx0, tz0, { minH: 0.25, ignore: (c) => !!c.enemy }); } catch (err) { clear = true; }
    if (!clear) {
      D.pathT = (D.pathT ?? 9) + dt;
      if (!D.path || D.pathT > 0.7 || Math.hypot((D.ptx ?? 0) - tx0, (D.ptz ?? 0) - tz0) > 0.8 || (D.stuck || 0) > 0.5) {
        try { D.path = Enemies.path(e.pos.x, e.pos.z, tx0, tz0) || null; } catch (err) { D.path = null; }
        D.pathT = 0; D.ptx = tx0; D.ptz = tz0;
      }
      if (D.path && D.path.length) {
        while (D.path.length > 1 && Math.hypot(D.path[0][0] - e.pos.x, D.path[0][1] - e.pos.z) < 0.35) D.path.shift();
        [wx, wz] = D.path[0];
      }
    } else D.path = null;
    const wd = Math.hypot(wx - e.pos.x, wz - e.pos.z) || 1;
    const step = Math.min(speed * dt, Math.max(0, d - stopAt));
    const r = World.move(e.pos, (wx - e.pos.x) / wd * step, (wz - e.pos.z) / wd * step, e.radius, { ignore: (c) => !!c.enemy, maxStep: 0.5, maxDrop: 1.2 });
    const moved = Math.hypot(r.x - e.pos.x, r.z - e.pos.z);
    e.pos.set(r.x, r.y, r.z);
    if (moved > 1e-4) turnTo(e, Math.atan2(wx - e.pos.x, wz - e.pos.z), 4.5, dt);
    D.stuck = moved < step * 0.3 ? (D.stuck || 0) + dt : Math.max(0, (D.stuck || 0) - dt);
    if (moved > 5e-4) { if (a.anim !== 'walk') a.setAnim('walk', { blend: 0.3 }); }
    else if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 });
    // hopelessly stuck while nobody is looking: step to the goal (keeps the store's staff where they belong)
    if (D.stuck > 4 && Player.pos && flat(e.pos, Player.pos) > 7) { e.pos.set(tx0, World.heightAt(tx0, tz0) ?? e.pos.y, tz0); D.stuck = 0; return true; }
    return false;
  }
  const homeOf = (e) => {
    const D = e.data;
    if (D.post) return [D.post[0], D.post[1]];
    const rt = D.route || [[e.home.x, e.home.z]];
    let best = 0, bd = Infinity;
    rt.forEach((p, i) => { const d = Math.hypot(p[0] - e.pos.x, p[1] - e.pos.z); if (d < bd) { bd = d; best = i; } });
    D.ri = best;
    return [rt[best][0], rt[best][1]];
  };
  Enemies.defineType('c7_smile', {
    hp: 1e9, radius: 0.34, height: 1.8, tell: 'smile', downs: false, invincible: true, stompable: false, lockable: true,
    threat: (e) => !e.hidden && !e.data.away && !e.data.away2,
    steps: { stride: 0.68, vol: 0.32 },
    create(e, def) {
      const a = smileRig(def.seed ?? 7);
      e.actor = a; e.obj = a.root; e.pos = a.root.position;
      const D = e.data;
      D.post = def.post || null; D.route = def.route || null; D.ri = 0; D.pause = 0;
      D.state = D.post ? 'post' : 'patrol';
      D.name = def.name || e.id;
      if (def.colR) e.colR = def.colR;
      a.setAnim('idle', { blend: 0 });
      if (D.post) { e.placed = true; e.pos.set(D.post[0], 0, D.post[1]); e.obj.rotation.y = (D.post[2] || 0) * D2R; }
    },
    remove(e) { try { Snd.loop('smile_hum', false, { id: 'c7sm:' + e.uid, fade: 0.4 }); } catch (err) { /* audio */ } },
    onHit(e) {
      // hits make them flinch but never harm them; the smile never changes
      if (e.actor) q(e.actor.gesture('flinch', { dur: 0.55 }));
      e.data.flinch = 0.55;
      return false;
    },
    update(e, dt, ai) {
      const D = e.data, a = e.actor;
      if (!a) return;
      const hum = !e.hidden && !D.away;
      try { Snd.loop('smile_hum', hum, { id: 'c7sm:' + e.uid, pos: [e.pos.x, e.pos.y + 1.6, e.pos.z], vol: 0.5 }); } catch (err) { /* audio */ }
      if (!ai || D.scripted) { if (!D.scripted && a.anim === 'walk') a.setAnim('idle', { blend: 0.3 }); return; }
      if (D.flinch > 0) { D.flinch -= dt; return; }
      const P = Player.pos;
      if (!P) return;
      const d = flat(e.pos, P);
      const paging = C7.pageUntil > now();
      const toP = Math.atan2(P.x - e.pos.x, P.z - e.pos.z);
      const canPin = !C7.pinning && Player.mode === 'normal' && !Player.dead && Math.abs(P.y - e.pos.y) < 1.2;
      // the page: every one of them answers
      if (paging && D.state !== 'page' && D.state !== 'pinning') { D.state = 'page'; D.path = null; }
      if (!paging && D.state === 'page') {
        D.state = 'return';
        if (D.away) { D.away = false; Enemies.visible(e, true); if (D.backDoor) e.pos.set(D.backDoor[0], e.pos.y, D.backDoor[1]); }
      }
      switch (D.state) {
        case 'page': {
          if (D.away) return;
          const tg = D.pageTarget || homeOf(e);
          if (smMove(e, tg[0], tg[1], SM.walk + 0.15, dt, 0.2)) {
            if (D.pageExit) { D.away = true; Enemies.visible(e, false); return; }
            if (D.pageFace !== undefined) turnTo(e, D.pageFace * D2R, 3, dt);
            a.lookAt(null);
          }
          return;
        }
        case 'cool': {
          D.coolT -= dt;
          a.lookAt(Player.actor);
          if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 });
          if (D.coolT <= 0) { D.state = 'return'; if (d > 3 && d < 9) smileSay(e, 2); }
          return;
        }
        case 'pinning': return;
        case 'return': {
          const [hx, hz] = homeOf(e);
          if (D.route && d < SM.notice && losTo(e, P) && Math.abs(U.angleDiff(e.yaw, toP)) < SM.cone * D2R / 2) { D.state = 'approach'; D.lostT = 0; smileSay(e, 0); return; }
          if (smMove(e, hx, hz, SM.walk, dt, 0.18)) { D.state = D.post ? 'post' : 'patrol'; D.pause = 0.6; }
          return;
        }
        case 'post': {
          const [px, pz, pf] = D.post;
          const off = Math.hypot(e.pos.x - px, e.pos.z - pz);
          const sees = d < SM.postNotice && losTo(e, P);
          if (sees) {
            turnTo(e, toP, 3.2, dt);
            a.lookAt(Player.actor);
            if (!D.greeted) { D.greeted = true; smileSay(e, 0); q(a.gesture('offer', { hand: 'R', dur: 1.4 })); }
            if (d < SM.postReach && canPin) {
              // one step out of the doorway toward him, no more
              const tx0 = px + (P.x - px) * 0.6, tz0 = pz + (P.z - pz) * 0.6;
              const ox = tx0 - px, oz = tz0 - pz, ol = Math.hypot(ox, oz) || 1, k = Math.min(1, SM.postLeash / ol);
              smMove(e, px + ox * k, pz + oz * k, SM.approach, dt, 0.1);
              if (d < SM.touch) C7_pin(e);
            } else if (off > 0.12) smMove(e, px, pz, SM.walk, dt, 0.08);
            else if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 });
          } else {
            D.greeted = d < SM.postNotice + 2 ? D.greeted : false;
            a.lookAt(null);
            if (off > 0.12) smMove(e, px, pz, SM.walk, dt, 0.08);
            else { turnTo(e, (pf || 0) * D2R, 2.2, dt); if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 }); }
          }
          return;
        }
        case 'patrol': {
          if ((d < SM.notice && losTo(e, P) && Math.abs(U.angleDiff(e.yaw, toP)) < SM.cone * D2R / 2) || (d < SM.close && losTo(e, P))) {
            D.state = 'approach'; D.lostT = 0; smileSay(e, 0); return;
          }
          a.lookAt(null);
          if (D.pause > 0) {
            D.pause -= dt;
            const cur = D.route[D.ri];
            if (cur && cur[3] !== undefined) turnTo(e, cur[3] * D2R, 2.2, dt);
            if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.4 });
            return;
          }
          const p = D.route[D.ri];
          if (smMove(e, p[0], p[1], SM.walk, dt, 0.15)) { D.pause = p[2] || 0.4; D.ri = (D.ri + 1) % D.route.length; }
          return;
        }
        case 'approach': {
          a.lookAt(Player.actor);
          const seen = losTo(e, P);
          D.lostT = seen ? 0 : (D.lostT || 0) + dt;
          if (d > SM.giveUp || D.lostT > SM.lost) { D.state = 'return'; if (d < 14) smileSay(e, 2); return; }
          smMove(e, P.x, P.z, SM.approach, dt, 0.55);
          if (d < SM.touch && canPin) C7_pin(e);
          return;
        }
        default: D.state = D.post ? 'post' : 'patrol';
      }
    },
    post(e) {
      const a = e.actor;
      if (!a || !a.flares) return;
      const t = now() + e.uid * 1.7;
      const k = 1 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 17.1) * 0.05;
      for (const sp of a.flares) sp.scale.set(0.2 * k, 0.075 * (2 - k), 1);
    },
  });

  // ---- doorways: where "the last doorway" is (spec §6: pushed back to the last doorway) ------------------------------
  // n = the doorway's normal (unit, XZ); inside = the side of n that is inside this room (room-entry doors only)
  const C7_DOORS = {
    c7_corridor: [
      { id: 'rec', x: 0, z: 2, nx: 1, nz: 0, w: 1.6, entry: 'reception', inside: 1 },
      { id: 'nur', x: 0, z: -20, nx: 1, nz: 0, w: 1.4, entry: 'nurses', inside: 1 },
      { id: 'f1', x: 17, z: 2, nx: 1, nz: 0, w: 1.4 },
      { id: 'f2', x: 24, z: -11, nx: 0, nz: -1, w: 1.4 },
      { id: 'b1', x: 10, z: 4, nx: 0, nz: 1, w: 1.2 },
      { id: 'b2s', x: 14.5, z: 0, nx: 0, nz: -1, w: 1.2 },
      { id: 'b2e', x: 22, z: -4, nx: 1, nz: 0, w: 1.2 },
      { id: 'b3s', x: 26, z: -6.5, nx: 1, nz: 0, w: 1.2 },
      { id: 'b3n', x: 26, z: -15.5, nx: 1, nz: 0, w: 1.2 },
    ],
    c7_nurses: [
      { id: 'cor', x: 8, z: 3.5, nx: -1, nz: 0, w: 1.4, entry: 'corridor', inside: 1 },
      { id: 'w3', x: 4, z: 0, nx: 0, nz: 1, w: 1.4, entry: 'ward', inside: 1 },
    ],
  };
  function C7_trackDoors(room) {
    const doors = C7_DOORS[room], P = Player.pos;
    if (!doors || !P || busy()) return;
    for (const d of doors) {
      const rx = P.x - d.x, rz = P.z - d.z;
      const along = rx * -d.nz + rz * d.nx, across = rx * d.nx + rz * d.nz;
      if (Math.abs(along) > d.w / 2 + 0.25 || Math.abs(across) > 1.1) { delete C7.sides[room + d.id]; continue; }
      if (Math.abs(across) < 0.22) continue;
      const s = Math.sign(across), prev = C7.sides[room + d.id];
      if (prev && prev !== s) C7.lastCross = { room, d, from: prev };
      C7.sides[room + d.id] = s;
    }
  }
  function C7_enterDoors(room, from) {
    C7.sides = {};
    const doors = C7_DOORS[room] || [];
    const entry = from === 'c7_reception' ? 'reception' : from === 'c7_nurses' ? 'nurses' : from === 'c7_corridor' ? 'corridor' : from === 'c7_ward3' ? 'ward' : null;
    const d = doors.find((x) => x.entry === entry) || doors.find((x) => x.entry);
    C7.lastCross = d ? { room, d, from: d.inside } : null;
  }
  // the spot just on the near side of the last doorway (free of bodies), facing the way he was going
  function C7_backTo() {
    const room = World.room, lc = C7.lastCross && C7.lastCross.room === room ? C7.lastCross : null;
    const smiles = Enemies.byType ? Enemies.byType('c7_smile') : [];
    const free = (x, z) => { try { if (World.heightAt(x, z) === null || !World.pointFree(x, z, 0.34)) return false; } catch (err) { return false; } return !smiles.some((s) => !s.hidden && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.3); };
    const tryDoor = (d, s) => {
      for (const k of [0.85, 1.4, 2.0, 2.7, 3.5, 4.4]) {
        for (const off of [0, 0.45, -0.45]) {
          const x = d.x + d.nx * s * k + -d.nz * off, z = d.z + d.nz * s * k + d.nx * off;
          if (free(x, z)) return { x, z, yaw: Math.atan2(-d.nx * s, -d.nz * s) / D2R };
        }
      }
      return null;
    };
    if (lc) { const r = tryDoor(lc.d, lc.from); if (r) return r; }
    // (crowded: the nearest other doorway, on the side he is standing — never one across the map)
    const P = Player.pos;
    const near = (C7_DOORS[room] || []).filter((d) => !lc || d !== lc.d).map((d) => ({ d, dist: Math.hypot(P.x - d.x, P.z - d.z) })).filter((o) => o.dist < 9).sort((a, b) => a.dist - b.dist);
    for (const { d } of near) { const side = Math.sign((P.x - d.x) * d.nx + (P.z - d.z) * d.nz) || d.inside || 1; const r = tryDoor(d, side); if (r) return r; }
    return { x: P.x, z: P.z, yaw: Player.yawDeg || 0 };
  }
  // a touch: it pins him and presses a pen into his hand — SIGNED — 20 damage — pushed back to the last doorway
  function C7_pin(e) {
    if (C7.pinning || !Player.pos || Player.dead || busy()) return;
    C7.pinning = true;
    const D = e.data;
    D.state = 'pinning';
    Script.run(async (G) => {
      const A = G.aidan, a = e.actor;
      try {
        e.yaw = Math.atan2(A.pos.x - e.pos.x, A.pos.z - e.pos.z);
        a.setAnim('idle', { blend: 0.2 });
        a.lookAt(Player.actor);
        try { Player.pin(true, { anim: 'brace' }); } catch (err) { /* player */ }
        await A.turn([e.pos.x, e.pos.z], 0.2);
        // (A.hold on his left hand takes it from the equipped weapon until A.hold('L', null) / the scene's end)
        const hp = V3(); try { (Player.actor.anchors.gripL || Player.actor.bones.handL).getWorldPosition(hp); } catch (err) { hp.copy(A.pos).add(V3(0, 1.0, 0)); }
        q(a.gesture('reach', { hand: 'R', target: [hp.x, hp.y, hp.z], dur: 0.9 }));
        G.sfx('penclick', { pos: [e.pos.x, 1.2, e.pos.z], vol: 0.9 });
        await G.wait(0.5);
        A.hold('L', 'pen');
        a.hold('R', null);
        G.sfx('stamp', { vol: 1 });
        G.stamp('SIGNED');
        G.shake(0.22, 0.3);
        G.damage(20, e, { force: true });
        if (Player.dead || S.health <= 0) return;
        await G.wait(0.7);
        smileSay(e, 1, true);
        await G.wait(0.5);
        await G.fade(1, 0.16, '#eef6f4');
        A.hold('L', null);
        a.hold('R', 'pen');
        const t = C7_backTo();
        try { Player.pin(false); } catch (err) { /* player */ }
        Player.teleport(t.x, t.z, t.yaw);
        try { Cam.snap(); } catch (err) { /* cam */ }
        D.state = 'cool'; D.coolT = 3.2;
        await G.wait(0.1);
        await G.fade(0, 0.35, '#eef6f4');
      } finally {
        try { if (Player.mode === 'pinned') Player.pin(false); } catch (err) { /* player */ }
        if (D.state === 'pinning') { D.state = 'cool'; D.coolT = 3; }
        C7.pinning = false;
      }
    }, { control: false, letterbox: false, skippable: false, name: 'c7:pin' });
  }
  // the store's spawns and page targets
  const C7_FRONT = [[2.1, 3.0, 180], [3.1, 3.05, 180], [4.1, 3.0, 180], [5.1, 3.05, 180], [2.6, 2.2, 180], [3.6, 2.2, 180]];
  function C7_assignPage(room) {
    const list = (Enemies.byType ? Enemies.byType('c7_smile') : []).filter((s) => !s.removed);
    list.forEach((s, i) => {
      const D = s.data;
      D.state = 'page'; D.path = null; D.greeted = false;
      if (room === 'c7_nurses') { D.pageTarget = [7.55, 3.5]; D.pageExit = true; D.backDoor = [7.4, 3.5]; D.pageFace = 90; }
      else { const f = C7_FRONT[i % C7_FRONT.length]; D.pageTarget = [f[0], f[1]]; D.pageFace = f[2]; D.pageExit = false; }
    });
  }

  // ---- small builders used by several rooms ----------------------------------------------------------------------
  // a bouquet in cellophane lying on its side (flowers nobody picked up)
  function bouquet(K, x, y, z, rot, o = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot * D2R; g.rotation.z = Math.PI / 2 - 0.12;
    const cel = new THREE.MeshStandardMaterial({ color: '#e8f0f0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 10, 1, true), cel); cone.position.y = 0.08; cone.rotation.x = Math.PI; g.add(cone);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 6), new THREE.MeshStandardMaterial({ color: '#4d6a3a', roughness: 0.8 })); stem.position.y = -0.2; g.add(stem);
    const cols = o.colors || ['#c9b27a', '#b98a8a', '#d8d2c4', '#a88fa8', '#caa06a'];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 0.03 + (i % 3) * 0.028; const f = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 2) * 0.01, 7, 5), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.9 })); f.position.set(Math.cos(a) * rr, 0.26 + (i % 4) * 0.012, Math.sin(a) * rr); g.add(f); }
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.06), new THREE.MeshStandardMaterial({ map: cardTex('getwell', ['Get well soon', 'Nan x'], { hand: true, w: 128, h: 96, size: 16, age: 0.3 }), roughness: 0.9, side: THREE.DoubleSide }));
    card.position.set(0.05, 0.05, 0.1); card.rotation.y = 0.4; g.add(card);
    K.mesh(g, { static: true });
    return g;
  }
  // a deflated foil balloon on a ribbon, caught on something
  function balloon(K, x, y, z, rot) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot * D2R;
    const foil = new THREE.MeshStandardMaterial({ map: cardTex('balloon', ['GET', 'WELL', 'SOON'], { bg: '#b8bcc0', ink: '#6a2a3a', w: 128, h: 128, size: 26, age: 0.2 }), color: '#d4d8dc', roughness: 0.25, metalness: 0.75, side: THREE.DoubleSide });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), foil); b.scale.set(1, 0.9, 0.16); b.position.set(0.05, -0.12, 0.02); b.rotation.z = 1.2; g.add(b);
    const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0.02, -0.02, 0.01), V3(0.05, -0.08, 0.02)]), 6, 0.003, 3), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.6 }));
    g.add(rib);
    K.mesh(g, { static: true });
    return g;
  }
  // a length of chain lying on the ground (or wrapped round the gate): torus links along a polyline
  function chainAlong(pts, o = {}) {
    const g = new THREE.Group(); g.name = o.name || 'chain';
    const m = new THREE.MeshStandardMaterial({ color: '#8a8e8a', roughness: 0.45, metalness: 0.7 });
    const link = new THREE.TorusGeometry(0.035, 0.009, 4, 8);
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)));
    const L = curve.getLength(), n = Math.max(2, Math.floor(L / 0.06));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      const k = new THREE.Mesh(link, m); k.position.copy(p);
      k.quaternion.setFromUnitVectors(V3(1, 0, 0), tg); k.rotateX(i % 2 ? Math.PI / 2 : 0);
      k.castShadow = false; g.add(k);
    }
    return g;
  }
  const padlock = (x, y, z, rotY = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY * D2R;
    const brass = new THREE.MeshStandardMaterial({ color: '#b69a4a', roughness: 0.35, metalness: 0.7 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.03), brass); g.add(b);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 5, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#c8ccc8', roughness: 0.3, metalness: 0.9 })); sh.position.y = 0.04; g.add(sh);
    return g;
  };

  // a non-walkable ground quad with its own corner heights [y(x0,z0), y(x1,z0), y(x0,z1), y(x1,z1)] (banks, verges)
  function slab(K, x0, z0, x1, z1, ys, mat) {
    const [a, b, c, d] = ys;
    const geo = new THREE.BufferGeometry();
    const ts = 0.25;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, a, z0, x1, b, z0, x0, c, z1, x1, d, z1], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([x0 * ts, -z0 * ts, x1 * ts, -z0 * ts, x0 * ts, -z1 * ts, x1 * ts, -z1 * ts], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, Kit.mat(mat));
    m.receiveShadow = true;
    K.mesh(m, { static: true });
    return m;
  }

  // =================================================================================================================
  // 7A RING ROAD EAST — "That wasn't there before." Where the drop used to be (x 0–6) the old barrier and the ROAD
  // CLOSED sign lie pushed onto the verge; the road runs on east round the hill, climbing a little, to the hospital car
  // park entrance (x 96). Retaining wall and gums on the north (uphill) side, a guardrail over the fog on the south.
  // =================================================================================================================
  const RR7 = { L: 96, fp: 6.46, climb: 1.2 };
  const rrY = (x) => lerp(0, RR7.climb, clamp(x / RR7.L));
  defineRoom({
    id: 'c7_ringroad', name: 'RING ROAD EAST', area: 'RING ROAD', chapter: 7, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [{ box: [0, -6.6, 96, -4.5], s: 'concrete' }, { box: [0, 4.5, 96, 6.6], s: 'concrete' }],
    bounds: [-2, -8, 98, 8],
    entries: { office: [2.4, 1.2, 90], hospital: [93.0, -1.4, -90], start: [2.4, 1.2, 90] },
    cameras: [
      // the old road end: low, behind the pushed-aside barrier — the road simply goes on into the fog
      { id: 'c7_ringroad:before', vol: [0, -6.6, 15, 6.6], type: 'pan', pos: [-4.2, 1.9, -3.4], target: [9, 0.9, 1.2], fov: 50, pan: { lag: 0.3, yaw: 55, pitch: 30 } },
      // the bus stop from out over the guardrail, looking back west
      { id: 'c7_ringroad:stop', vol: [15, -6.6, 31, 6.6], type: 'pan', pos: [35.5, 4.4, 9.0], target: [22, 0.8, -1], fov: 48, pan: { lag: 0.3, yaw: 66, pitch: 34 } },
      // along the north footpath, eye level: the blue H sign ahead
      { id: 'c7_ringroad:sign', vol: [31, -6.6, 47, 6.6], type: 'pan', pos: [27.2, 2.3, -5.6], target: [42, 1.0, 1.6], fov: 50, pan: { lag: 0.3, yaw: 58, pitch: 30 } },
      // high over the guardrail: the balloon, the fog below the road
      { id: 'c7_ringroad:rail', vol: [47, -6.6, 63, 6.6], type: 'pan', pos: [67.5, 5.6, 10.2], target: [55, 1.0, 0], fov: 50, pan: { lag: 0.3, yaw: 66, pitch: 38 } },
      // low from the wall's foot, the writing on it
      { id: 'c7_ringroad:wall', vol: [63, -6.6, 79, 6.6], type: 'pan', pos: [59.2, 1.6, -5.9], target: [72, 1.3, 0.6], fov: 50, pan: { lag: 0.3, yaw: 58, pitch: 30 } },
      // the hospital's sign and the car park entrance ahead, the building a darker shape in the fog
      { id: 'c7_ringroad:gate', vol: [79, -6.6, 96, 6.6], type: 'pan', pos: [74.5, 4.2, 7.6], target: [89, 1.6, -1.5], fov: 50, pan: { lag: 0.3, yaw: 62, pitch: 32 } },
    ],
    build(K) {
      const fp = RR7.fp;
      K.road(0, -4.5, RR7.L, 4.5, { axis: 'x', markings: 'center', footpath: 1.8, slope: { y0: 0, y1: RR7.climb } });
      // the seam where the old road stopped: a raw joint across the bitumen, the new surface darker beyond it
      // (the road back west toward the office, behind the exit: the old road end's camera looks over it)
      K.road(-16, -4.5, 0, 4.5, { axis: 'x', markings: 'center', footpath: 1.8 });
      K.wall(-16, -fp - 0.1, 0, -fp - 0.1, 3.0, { tex: 'concrete', color: '#7e7d76' }, { thick: 0.3, grime: true, y: -0.2 });
      K.box(-8, 2.6, -fp - 4.2, 16, 0.4, 8, { tex: 'grass', color: '#4c5446' }, { shadow: false });
      for (let x = -16; x < 0; x += 6) K.prop('guardrail', x + 3, fp + 0.12, 0, { len: 6, y: 0.15, collide: false });
      K.box(5.2, rrY(5.2) - 0.02, 0, 0.14, 0.035, 9, { color: '#171818', roughness: 0.9 }, { shadow: false });
      K.box(5.35, rrY(5.35) - 0.02, 0, 0.05, 0.03, 9, { color: '#3a3a36', roughness: 0.9 }, { shadow: false });
      // north: the retaining wall holding the hill up, grass and gums above; south: guardrail, the slope falling to fog
      K.wall(0, -fp - 0.1, RR7.L, -fp - 0.1, 3.0, { tex: 'concrete', color: '#7e7d76' }, { thick: 0.3, grime: true, y: -0.2 });
      K.box(RR7.L / 2, 2.6, -fp - 4.2, RR7.L + 2, 0.4, 8, { tex: 'grass', color: '#4c5446' }, { shadow: false });
      for (const [x, s] of [[9, 1.0], [26, 0.85], [44, 1.1], [61, 0.9], [83, 1.05]]) K.prop('gum_tree', x, -fp - 3.2, x * 13, { y: 2.9, scale: s });
      K.collider(0, fp + 0.05, RR7.L, fp + 0.3, { h: 2.2 });
      for (let x = 0; x < RR7.L - 0.5; x += 6) K.prop('guardrail', x + 3, fp + 0.12, 0, { len: 6, y: rrY(x + 3) + 0.15, collide: false });
      K.plane((RR7.L - 16) / 2, -2.3, fp + 5.2, RR7.L + 22, 10.5, { tex: 'grass', color: '#2f352c', roughness: 1 }, { rot: [-62, 0, 0] });
      for (const [x, s] of [[18, 0.8], [52, 0.7], [77, 0.9]]) K.prop('gum_tree', x, fp + 6.5, x * 7, { y: -2.4, scale: s });
      K.collider(-16.5, -fp - 0.2, 0, fp + 0.3, { h: 3 });
      K.collider(RR7.L, -fp - 0.2, RR7.L + 0.3, fp + 0.3, { h: 3 });

      // ---- x 0–8: where the drop was ---------------------------------------------------------------------------
      const bar = K.prop('barrier', 2.6, -5.35, 74, { name: 'c7rr:barrier', lit: false, y: 0.15 });
      if (bar) { bar.rotation.z = -1.35; bar.position.y = 0.32; }
      K.collider(1.6, -5.9, 3.6, -4.8, { h: 0.6 });
      const rs = K.sign('ROAD CLOSED\nWORKS IN PROGRESS', 4.4, 0.2, 5.6, 1.3, 0.62, { style: 'warning', name: 'c7rr:rcsign' });
      if (rs) { rs.rotation.set(-1.42, 0.3, 0.1); rs.position.y = 0.24; }
      for (const [x, z, r] of [[1.3, 3.2, 90], [6.2, -3.1, 20], [3.3, 5.3, 0]]) { const c = K.prop('cone', x, z, r, { name: 'c7rr:cone' + x, y: x === 3.3 ? 0.15 : undefined }); if (c && x !== 3.3) { c.rotation.z = Math.PI / 2; c.position.y += 0.17; } }
      K.examine(3.0, 0.6, -5.2, ['The barrier. Somebody\'s pushed it onto the footpath.', 'The road used to stop right here. [beat] I stood here. It stopped.'], { id: 'c7rr:barrier', r: 1.7 });
      K.examine(4.4, 0.4, 5.3, ['"Road closed. Works in progress."', 'Nobody\'s working. The road\'s just... finished.'], { id: 'c7rr:rcsign', r: 1.5 });
      K.examine(5.3, 0.3, 0, ['A seam in the bitumen. Old road, then new road.', 'Like someone laid the rest of it while I wasn\'t looking.'], { id: 'c7rr:seam', r: 1.4 });
      K.dress('leaves', [0, -6.4, RR7.L, -4.7], 60, { seed: 701 });
      K.dress('leaves', [0, 4.7, RR7.L, 6.4], 60, { seed: 702 });
      K.dress('papers', [3, -4, RR7.L - 3, 4], 9, { seed: 703 });

      // ---- the bus stop (x 12–17): Route 44, "Hospital"; flowers on the seat -----------------------------------------
      K.prop('bus_shelter', 14.5, -5.55, 0, { route: '44', stop: 'HOSPITAL', y: rrY(14.5) + 0.15 });
      bouquet(K, 13.9, rrY(14) + 0.15 + 0.49, -5.85, 80);
      K.prop('sign_post', 17.0, -4.9, 0, { style: 'council', text: 'BUS STOP\nROUTE 44 — HOSPITAL', bg: '#ffcc00', fg: '#1d1d1d', w: 0.55, h: 0.5, y: rrY(17) + 0.15 });
      K.examine(13.9, rrY(14) + 0.8, -5.7, ['Flowers on the bench. Still in the cellophane.', 'The card says "Get well soon. Nan x". [beat] Somebody bought them for her. Or someone like her.', 'Nobody came back for them.'], { id: 'c7rr:flowers', r: 1.4 });
      K.examine(15.4, rrY(15) + 1.4, -6.0, ['Route 44. "Hospital." The timetable\'s been sun-bleached white.', 'Every bus in this town goes somewhere I need to be. None of them come.'], { id: 'c7rr:stop', r: 1.6 });
      K.prop('streetlight', 21, -fp + 0.35, 0, { bank: 1, y: rrY(21) + 0.15 });
      K.prop('power_pole', 24, fp - 0.35, 0, { span: 25, y: rrY(24) + 0.15 });
      K.prop('bin', 18.2, -fp + 0.45, 0, { variant: 'street', y: rrY(18) + 0.15 });

      // ---- a car on the south kerb (x 28–33): hazards on, a baby seat in the back ------------------------------
      K.prop('hatchback', 30.2, 3.3, 92, { color: '#5b6b70', hazards: true, name: 'c7rr:car', y: rrY(30.2) });
      K.box(29.7, rrY(29.7) + 0.55, 3.3, 0.36, 0.42, 0.4, { color: '#3a4a5a', roughness: 0.8 }, { rot: 2 });
      K.examine(30.2, rrY(30) + 1.0, 2.2, ['Hazards going. The keys are in it.', 'A baby seat in the back. Empty. [beat] Of course it\'s empty.', 'I keep checking the seats. I don\'t know what I\'d do if they weren\'t.'], { id: 'c7rr:car', r: 2.0 });
      K.prop('streetlight', 36, fp - 0.35, 180, { lit: false, y: rrY(36) + 0.15 });

      // ---- the blue H: the hospital sign (x 40) ------------------------------------------------------------------
      for (const s of [-1, 1]) K.cyl(41 + s * 0.8, rrY(41) + 0.15, -5.5, 0.04, 2.75, { tex: 'metal', color: '#a4aba6' });
      K.plane(41, rrY(41) + 2.25, -5.42, 2.1, 1.1, plate('hospsign', 'H   DISTRICT HOSPITAL\nVISITOR PARKING  ·  200 m  →', { bg: '#1f4f9a', w: 512, h: 256, size: 36, age: 0.5 }), {});
      K.examine(41, rrY(41) + 2.0, -5.0, ['"District Hospital." [beat] Two hundred metres.', 'That\'s where she is. That\'s where the case said.'], { id: 'c7rr:hsign', r: 2.0 });
      // the speed hump and the zone sign (x 47)
      K.box(47, rrY(47) - 0.02, 0, 0.9, 0.09, 9, { color: '#2a2a28', roughness: 0.85 }, { shadow: false });
      for (const dz of [-3, -1, 1, 3]) K.box(47, rrY(47) + 0.071, dz, 0.3, 0.005, 0.5, { color: '#d8c83a', roughness: 0.7 }, { shadow: false });
      K.prop('sign_post', 46, fp - 0.45, 180, { style: 'council', text: 'HOSPITAL\nZONE\n40', bg: '#ffffff', fg: '#1d1d1d', w: 0.55, h: 0.7, y: rrY(46) + 0.15 });
      K.prop('power_pole', 49, fp - 0.35, 0, { span: 25, y: rrY(49) + 0.15 });

      // ---- the balloon on the guardrail (x 55) -------------------------------------------------------------------
      balloon(K, 55.2, rrY(55) + 0.85, fp + 0.02, 0);
      K.examine(55.2, rrY(55) + 0.8, fp - 0.3, ['A balloon. "Get well soon." It\'s caught on the rail.', 'Somebody let go of it. Or it let go of them.'], { id: 'c7rr:balloon', r: 1.5 });
      K.prop('streetlight', 58, fp - 0.35, 180, { bank: 2, flicker: true, y: rrY(58) + 0.15 });

      // ---- the wall (x 64–72): writing ---------------------------------------------------------------------------
      K.writing('ASK THEM', 66, rrY(66) + 1.45, -fp + 0.06, 1.9, { rotY: 0, world: 'fog' });
      K.writing('WHO ARE YOU TRYING TO REACH', 71.5, rrY(71.5) + 1.1, -fp + 0.06, 3.3, { rotY: 0, world: 'fog' });
      K.examine(68, rrY(68) + 1.3, -fp + 0.6, ['"Ask them." [beat] Ask who.', '"Who are you trying to reach." [beat] Her. I\'m trying to reach her.'], { id: 'c7rr:writing', r: 2.4 });
      K.prop('power_pole', 74, fp - 0.35, 0, { span: 22, y: rrY(74) + 0.15 });
      K.prop('streetlight', 77, -fp + 0.35, 0, { bank: 3, y: rrY(77) + 0.15 });
      K.prop('road_sign', 80.5, -fp + 0.75, 0, { text: 'SUMMIT RD  ↑\nHOSPITAL  →', sub: 'MAST — NO PUBLIC ACCESS', w: 1.8, y: rrY(80.5) + 0.15 });
      K.examine(80.5, rrY(80) + 2.0, -fp + 1.1, ['"Summit Road." The mast.', 'Up there you\'d get a signal. If anywhere would.'], { id: 'c7rr:summit', r: 1.8 });

      // ---- the car park entrance (x 86–96) -----------------------------------------------------------------------
      K.prop('boom_gate', 88.5, 5.1, -90, { len: 5.5, open: 1, name: 'c7rr:boom' });
      for (const s of [-1, 1]) K.cyl(91.5 + s * 1.2, rrY(91) + 0.15, -5.7, 0.05, 3.3, { tex: 'metal', color: '#a4aba6' });
      K.plane(91.5, rrY(91) + 2.75, -5.62, 2.9, 1.0, plate('cpsign', 'DISTRICT HOSPITAL\nVISITOR CAR PARK  ·  PAY & DISPLAY', { bg: '#1d5d78', w: 768, h: 256, size: 44, age: 0.4 }), {});
      K.prop('sign_post', 94.5, fp - 0.5, 180, { style: 'council', text: 'FIRST 30 MIN\nFREE', bg: '#ffffff', fg: '#1d5d78', w: 0.55, h: 0.45, y: rrY(94.5) + 0.15 });
      K.examine(91.5, rrY(91) + 2.4, -5.2, ['"Visitor car park. Pay and display." [beat] I don\'t have coins.', 'I don\'t think anyone\'s checking.'], { id: 'c7rr:cpsign', r: 2.0 });
      // the hospital itself: a long dark mass in the fog, one row of windows a shade paler than the rest
      K.box(122, 0, -22, 44, 14, 26, { tex: 'render_cracked', color: '#5f625c' }, { shadow: false });
      for (let i = 0; i < 9; i++) K.box(102 + i * 4.6, 3.2, -8.9, 2.2, 1.3, 0.1, { color: '#1a2222', roughness: 0.2, metalness: 0.4 }, { shadow: false });
      for (let i = 0; i < 9; i++) K.box(102 + i * 4.6, 7.2, -8.9, 2.2, 1.3, 0.1, { color: i === 5 ? '#3a4442' : '#1a2222', roughness: 0.2, metalness: 0.4 }, { shadow: false });

      // ---- exits ----------------------------------------------------------------------------------------------------
      K.exit({ id: 'c7_ringroad:office', box: [0, -6.4, 0.9, 6.4], to: 'c5_ringroad', entry: 'office', when: () => !!ROOMS.c5_ringroad, blockedMsg: 'The office is behind me. [beat] Keep going.' });
      K.exit({ id: 'c7_ringroad:carpark', box: [95.1, -6.4, 96, 6.4], to: 'c7_carpark', entry: 'road' });
      K.trigger([5.5, -6.6, 11, 6.6], async (G) => {
        if (done('trig:c5_ringroad:before') || done('c7:before')) return;
        S.done['c7:before'] = true; S.done['trig:c5_ringroad:before'] = true;
        await G.think('That wasn\'t there before.');
      }, { id: 'c7_ringroad:before' });
    },
    async onEnter(G, from) {
      G.bars(null);
      if (from === 'c7_carpark' && flag('c7_room12') && G.once('c7:rrBack')) { await G.wait(1.2); await G.think('Not that way. [beat] Up. The mast.'); }
    },
  });

  // =================================================================================================================
  // 7A THE HOSPITAL CAR PARK — 40 × 30 m south of the hospital. The facade and the main entrance canopy on the north
  // edge (z 0), the concrete multi-storey along the west (FULL), the road in from the ring road on the south edge, the
  // Summit Road gate on the north-east (chained until Room 12). The one working sodium light stands over a bench on a
  // garden island (x 26–33, z 7–11.5): CUTSCENE 7-3 happens there.
  // =================================================================================================================
  const CP = { bench: [29.5, 9.9], light: [31.8, 9.55], gate: [40, 4.5] };
  const hospNameTex = () => ctex('hospname', 1024, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    tx(x, 'SIGNAL HILL DISTRICT HOSPITAL', w / 2, h * 0.72, h * 0.62, '#d9dcd4', { align: 'center', weight: 'bold', spacing: 6 });
  });
  const emergTex = () => ctex('emerg', 256, 96, (x, w, h) => { x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, h); tx(x, 'EMERGENCY  →', w / 2, h * 0.66, h * 0.44, '#ffffff', { align: 'center', weight: 'bold' }); });
  const fullTex = () => ctex('full', 256, 96, (x, w, h) => { x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, w, h); tx(x, 'FULL', w / 2, h * 0.7, h * 0.6, '#ff3a26', { align: 'center', weight: 'bold', font: FN.mono, spacing: 8 }); });
  const payTex = () => ctex('pay', 192, 256, (x, w, h, r) => {
    x.fillStyle = '#e8e6de'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d5d78'; x.fillRect(0, 0, w, h * 0.16);
    tx(x, 'PAY & DISPLAY', w / 2, h * 0.11, h * 0.07, '#ffffff', { align: 'center', weight: 'bold' });
    x.fillStyle = '#0d1a14'; x.fillRect(w * 0.15, h * 0.24, w * 0.7, h * 0.16);
    tx(x, 'CARD ONLY', w / 2, h * 0.345, h * 0.06, '#7cff9a', { align: 'center', font: FN.mono });
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(w * 0.2, h * 0.3); x.lineTo(w * 0.78, h * 0.37); x.stroke();
    hand(x, 'NO SIGNAL', w * 0.2, h * 0.52, { size: 20, color: '#141414' });
    x.fillStyle = '#9aa0a0'; x.fillRect(w * 0.35, h * 0.62, w * 0.3, h * 0.05);
    tx(x, 'Tickets valid 4 hrs', w / 2, h * 0.84, h * 0.05, '#333', { align: 'center' });
    age(x, w, h, r, 0.8);
  });
  const dropTex = () => ctex('dropoff', 512, 128, (x, w, h) => { x.clearRect(0, 0, w, h); tx(x, 'DROP OFF — 5 MIN', w / 2, h * 0.72, h * 0.62, 'rgba(232,200,60,0.85)', { align: 'center', weight: 'bold', font: FN.narrow }); });
  const mastLightTex = () => ctex('mastlight', 64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,90,70,1)'); g.addColorStop(0.5, 'rgba(255,40,30,0.35)'); g.addColorStop(1, 'rgba(255,30,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  // the mast's red light, far off above the fog (after Room 12): fog-proof sprite, blinking
  function mastLight(K, x, y, z, size) {
    const m = new THREE.SpriteMaterial({ map: mastLightTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const sp = new THREE.Sprite(m); sp.scale.set(size, size, 1); sp.position.set(x, y, z); sp.renderOrder = 2;
    K.mesh(sp, { name: 'c7:mastlight' });
    K.animate((dt, t) => { const k = t % 2.2; sp.material.opacity = k < 0.9 ? 1 : k < 1.1 ? 0.4 : 0.06; });
    return sp;
  }

  defineRoom({
    id: 'c7_carpark', name: 'HOSPITAL CAR PARK', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.06 },
    surfaces: [{ box: [13.5, 0, 24.5, 6.4], s: 'concrete' }, { box: [26, 7, 33, 11.5], s: 'grass' }],
    bounds: [-18, -3, 56, 32],
    entries: { road: [8, 27.6, 180], entrance: [19, 1.7, 0], summit: [38.3, 4.5, -90], start: [8, 27.6, 180] },
    cameras: [
      // the multi-storey's face: the decks, FULL, the road in from the south-west
      { id: 'c7_carpark:ms', vol: [0, 12, 10.9, 30], type: 'static', pos: [19.5, 3.0, 22.5], target: [3.0, 1.4, 21.0], fov: 'fit' },
      // the north-west corner: the cars nosed up to the building, the facade and the decks meeting
      { id: 'c7_carpark:deck', vol: [0, 0, 13.5, 12], type: 'static', pos: [16.2, 3.4, 17.6], target: [5.5, 0.6, 5.0], fov: 'fit' },
      // high from the multi-storey's corner (a CCTV mount): the middle of the car park
      { id: 'c7_carpark:high', vol: [11, 11, 26, 30], type: 'static', pos: [0.5, 8.6, 30.5], target: [18.5, 0.2, 19.5], fov: 'fit' },
      // the main entrance, square on: the canopy, the dark glass doors, MAIN ENTRANCE
      { id: 'c7_carpark:entrance', vol: [13.5, 0, 26, 11], type: 'static', pos: [19.4, 2.3, 17.8], target: [19.2, 1.35, 2.2], fov: 'fit' },
      // low at the bench: the one sodium light, the fog behind it
      { id: 'c7_carpark:bench', vol: [26, 7, 40, 18], type: 'static', pos: [21.8, 0.75, 22.2], target: [31, 1.5, 10.5], fov: 'fit' },
      // the chained gate at the north-east corner
      { id: 'c7_carpark:gate', vol: [26.2, 0, 40, 6.9], type: 'static', pos: [34.5, 3.6, 17.8], target: [36.5, 1.0, 3.8], fov: 'fit' },
      // the south rows, from out past the wall
      { id: 'c7_carpark:south', vol: [16, 18, 40, 30], type: 'pan', pos: [27.5, 5.0, 35.0], target: [27, 0.6, 23], fov: 52, pan: { lag: 0.3, yaw: 62, pitch: 36 } },
      // Summit Road, climbing away from the gate into the fog
      { id: 'c7_carpark:summit', vol: [40, 0, 56, 9], type: 'pan', pos: [36.2, 3.6, 12.6], target: [48, 1.8, 4.2], fov: 50, pan: { lag: 0.3, yaw: 55, pitch: 32 } },
    ],
    build(K) {
      const open = flag('c7_room12');
      K.floor(0, 0, 40, 30, { tex: 'bitumen', color: '#6a6a66' });
      // the entrance apron under the canopy (a step up of a kerb)
      K.floor(13.5, 0, 24.5, 6.4, { tex: 'footpath', color: '#9a978e' }, { y: 0.12 });
      // ---- the hospital facade (z 0) --------------------------------------------------------------------------------
      K.wall(-0.4, -0.15, 40.4, -0.15, 9.2, { tex: 'render_cracked', color: '#a4a497' }, { thick: 0.3, grime: true, openings: [{ at: 19.4, w: 2.4, h: 2.45 }] });
      K.box(20, 9.2, -0.2, 41, 0.35, 0.5, { tex: 'concrete', color: '#7e7d76' });
      for (let i = 0; i < 10; i++) {
        const x = 1.6 + i * 4.1;
        if (x > 13 && x < 25.5) continue;
        K.box(x, 1.0, 0.02, 2.3, 1.5, 0.08, { color: '#161c1c', roughness: 0.15, metalness: 0.45 }, { shadow: false });
        K.box(x, 0.95, 0.07, 2.4, 0.06, 0.12, { tex: 'concrete', color: '#8a8a82' }, { shadow: false });
      }
      for (let i = 0; i < 10; i++) K.box(1.6 + i * 4.1, 4.3, 0.02, 2.3, 1.5, 0.08, { color: '#161c1c', roughness: 0.15, metalness: 0.45 }, { shadow: false });
      K.plane(20, 7.0, 0.04, 12.5, 1.2, hospNameTex(), { transparent: true });
      K.plane(36.2, 2.95, 0.05, 1.5, 0.56, emergTex(), { emissive: 1.1 });
      K.light('led', 36.2, 2.95, 0.4, { color: '#ff3326' });
      // the entrance: dark glass doors (→ reception), a lobby glimpsed behind them, the green exit sign inside
      K.door({ id: 'c7_carpark:entrance', x: 19.4, z: -0.15, rot: 0, w: 2.2, h: 2.4, style: 'glass_double', to: 'c7_reception', entry: 'entrance', sign: 'MAIN ENTRANCE' });
      K.box(19.4, 0, -2.3, 4.5, 3.0, 0.1, { color: '#0c1010', roughness: 0.9 }, { shadow: false });
      K.box(17.2, 0, -1.25, 0.1, 3.0, 2.2, { color: '#0c1010', roughness: 0.9 }, { shadow: false });
      K.box(21.6, 0, -1.25, 0.1, 3.0, 2.2, { color: '#0c1010', roughness: 0.9 }, { shadow: false });
      K.box(19.4, -0.02, -1.3, 4.4, 0.02, 2.0, { tex: 'lino_hospital', color: '#6a7270' }, { shadow: false });
      K.prop('exit_sign', 19.4, -2.24, 0, { mount: 2.5 });
      // the canopy over the drop-off, four columns, MAIN ENTRANCE on its fascia
      K.box(19.4, 3.45, 3.2, 11.2, 0.35, 6.7, { tex: 'concrete', color: '#b8b6ac' });
      for (const x of [14.2, 24.6]) for (const z of [6.1]) K.box(x, 0, z, 0.36, 3.45, 0.36, { tex: 'concrete', color: '#a8a69c' }, { collide: true });
      K.plane(19.4, 3.62, 6.56, 3.6, 0.3, plate('mainent', 'MAIN ENTRANCE', { bg: '#1d5d78', w: 512, h: 64, size: 40, age: 0.3 }), {});
      for (const x of [16.2, 19.4, 22.6]) K.cyl(x, 3.38, 3.2, 0.18, 0.07, { color: '#d8d8d0', roughness: 0.4 });
      // the drop-off lane: zebra stripes and DROP OFF painted on the bitumen
      for (let i = 0; i < 6; i++) K.box(17.4 + i * 0.8, 0.005, 7.9, 0.45, 0.012, 2.4, { color: '#c9c6ba', roughness: 0.8 }, { shadow: false });
      K.plane(27.0, 0.012, 8.4, 3.4, 0.85, dropTex(), { rot: [-90, 0, 0], transparent: true });
      // the smokers' corner: sand bin, sign
      K.cyl(12.6, 0, 1.0, 0.24, 0.8, { tex: 'metal', color: '#6a6e6c' }, { collide: true });
      K.cyl(12.6, 0.8, 1.0, 0.22, 0.02, { tex: 'dirt', color: '#b8a888' });
      K.sign('NO SMOKING\nWITHIN 4 METRES\nOF ENTRANCE', 11.3, 1.7, 0.2, 0.8, 0.6, { style: 'council', bg: '#ffffff', fg: '#b3261e' });
      K.examine(12.6, 0.9, 1.0, ['A sand bin full of butts. The nurses come out here.', 'Came.'], { id: 'c7cp:butts', r: 1.2 });
      K.examine(19.4, 1.6, 0.8, ['"District Hospital." [beat] She\'s in there.', 'Somewhere in there.'], { id: 'c7cp:doors', r: 1.4, when: () => !flag('c7_arrived') });
      K.examine(36.2, 2.6, 0.6, ['Emergency\'s round the side.', 'The side is just fog.'], { id: 'c7cp:emerg', r: 1.6 });

      // ---- the multi-storey on the west: three decks, parapets, a ramp, FULL ------------------------------------------
      const MS = { x0: -17, x1: -0.35 };
      for (const y of [2.9, 5.8, 8.7]) {
        K.box((MS.x0 + MS.x1) / 2, y, 14, MS.x1 - MS.x0, 0.35, 36, { tex: 'concrete', color: '#8a8982' }, { shadow: false });
        K.box(MS.x1 - 0.1, y + 0.35, 14, 0.2, 0.95, 36, { tex: 'concrete', color: '#96958d' }, { shadow: false });
        K.box(MS.x1 - 0.1, y - 0.25, 14, 0.24, 0.25, 36, { tex: 'concrete', color: '#6e6d67' }, { shadow: false });
      }
      for (let z = -3; z <= 31; z += 6.8) K.box(MS.x1 - 0.3, 0, z, 0.5, 8.7, 0.5, { tex: 'concrete', color: '#8f8e86' }, { shadow: false });
      K.box(-9, 0, 27, 6, 2.9, 0.3, { tex: 'concrete', color: '#7a7972' }, { shadow: false, rot: 0 });
      K.box(-8, 1.2, 12, 10, 0.3, 4.2, { tex: 'concrete', color: '#7f7e77' }, { shadow: false, rot: 0 });
      // ground level: a low wall along the edge, the entrance with its boom and the FULL sign
      for (const [z0, z1] of [[-1, 19], [25, 31]]) K.box(-0.5, 0, (z0 + z1) / 2, 0.3, 1.1, z1 - z0, { tex: 'concrete', color: '#8a8982' });
      K.collider(-0.8, -1, -0.2, 19, { h: 3 });
      K.collider(-0.8, 25, -0.2, 31, { h: 3 });
      K.blocker(-0.8, 19, -0.15, 25, 'The car park\'s shut. It says FULL.');
      K.prop('boom_gate', -0.6, 24.2, 180, { len: 5.2, open: 0 });
      K.box(-0.6, 2.2, 22, 0.2, 0.9, 2.4, { color: '#141414', roughness: 0.6 });
      K.plane(-0.49, 2.65, 22, 1.8, 0.62, fullTex(), { rotY: 90, emissive: 1.3 });
      K.light('led', -0.3, 2.65, 22, { color: '#ff3a26' });
      K.plane(-0.49, 1.7, 22, 1.2, 0.3, plate('msname', 'CAR PARK B  ·  LEVELS 1–3', { bg: '#1d5d78', w: 512, h: 128, size: 40 }), { rotY: 90 });
      K.examine(-0.2, 2.2, 22, ['"Full."', 'I can\'t see a single car in there.'], { id: 'c7cp:full', r: 2.2 });

      // ---- the south edge: a low wall and a hedge, the road in --------------------------------------------------------
      for (const [x0, x1] of [[-0.5, 4], [12, 40.4]]) { K.box((x0 + x1) / 2, 0, 30.2, x1 - x0, 0.7, 0.35, { tex: 'brick', color: '#7a6a5a' }); K.collider(x0, 30.02, x1, 30.4, { h: 1.5 }); }
      for (let x = 13; x < 40; x += 2.2) K.prop('shrub', x, 30.9, 0, { w: 2.1, h: 1.1, dead: x % 3 < 1 });
      for (const x of [3.6, 12.4]) K.prop('bollard', x, 29.7, 0, { variant: 'concrete' });
      K.prop('sign_post', 12.8, 28.9, 180, { style: 'council', text: 'ENTRY\nVISITORS', bg: '#1d5d78', fg: '#ffffff', w: 0.5, h: 0.45 });

      // ---- the east edge: chain-link, the Summit Road gate (z 1.5–7.5) -------------------------------------------------
      K.collider(40, 7.5, 40.3, 30.4, { h: 2.2 });
      K.collider(40, -0.4, 40.3, 1.5, { h: 2.2 });
      for (let z = 7.5; z < 30; z += 4.5) K.prop('chainlink', 40.15, z + 2.25, 90, { len: 4.5, collide: false });
      K.prop('chainlink', 40.15, 0.6, 90, { len: 1.6, collide: false });
      for (const z of [1.5, 7.5]) K.cyl(40.15, 0, z, 0.05, 2.35, { tex: 'metal', color: '#9aa09c' });
      const panel = (z0, dir, ang) => {
        const g = new THREE.Group(); g.position.set(40.15, 0, z0); g.rotation.y = ang * D2R;
        K.mesh(g, { static: true });
        const f = new THREE.MeshStandardMaterial({ color: '#a4aba6', roughness: 0.5, metalness: 0.6 });
        const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, f); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
        const L = 2.95;
        add(new THREE.BoxGeometry(0.05, 2.0, 0.05), 0, 1.02, dir * 0.05);
        add(new THREE.BoxGeometry(0.05, 2.0, 0.05), 0, 1.02, dir * L);
        add(new THREE.BoxGeometry(0.04, 0.04, L), 0, 2.0, dir * L / 2);
        add(new THREE.BoxGeometry(0.04, 0.04, L), 0, 0.08, dir * L / 2);
        add(new THREE.BoxGeometry(0.04, 0.04, L), 0, 1.05, dir * L / 2);
        const clt = Tex.get('chainlink').clone(); const cs = Tex.size('chainlink') || 0.5;
        clt.wrapS = clt.wrapT = THREE.RepeatWrapping; clt.repeat.set(L / cs, 1.9 / cs); clt.needsUpdate = true;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.9), new THREE.MeshStandardMaterial({ map: clt, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
        mesh.rotation.y = Math.PI / 2; mesh.position.set(0, 1.04, dir * L / 2); g.add(mesh);
        return g;
      };
      if (!open) {
        panel(1.5, 1, 0); panel(7.5, -1, 0);
        const ch = chainAlong([[40.05, 1.1, 4.3], [40.25, 1.18, 4.42], [40.28, 1.05, 4.62], [40.05, 0.98, 4.66], [40.02, 1.12, 4.4], [40.2, 0.9, 4.5], [40.24, 0.62, 4.52]], { name: 'c7cp:chain' });
        K.mesh(ch, { static: true });
        K.mesh(padlock(40.25, 0.56, 4.52, 90), { static: true });
        K.blocker(39.8, 1.5, 40.5, 7.5, 'Chained.');
        K.examine(39.7, 1.1, 4.5, ['Chained. A padlock the size of my fist.', 'Summit Road. [beat] The mast\'s up there. I can\'t see it.'], { id: 'c7cp:gate', r: 1.5 });
      } else {
        panel(1.5, 1, 72); panel(7.5, -1, -68);
        const ch = chainAlong([[40.6, 0.03, 3.9], [40.9, 0.03, 4.2], [40.7, 0.03, 4.6], [41.1, 0.03, 4.9], [41.4, 0.03, 4.5], [41.2, 0.03, 4.1]], { name: 'c7cp:chain' });
        K.mesh(ch, { static: true });
        const pl0 = padlock(41.5, 0.03, 4.8, 30); pl0.rotation.x = Math.PI / 2; K.mesh(pl0, { static: true });
        K.collider(40.1, 1.5, 42.9, 1.75, { h: 2.2 });
        K.collider(40.1, 7.25, 42.9, 7.5, { h: 2.2 });
        K.examine(40.9, 0.4, 4.4, ['The chain\'s on the ground.', 'Nobody cut it. [beat] It just let go.'], { id: 'c7cp:chaindown', r: 1.4 });
      }
      K.sign('SUMMIT RD\nMAST ACCESS\nAUTHORISED VEHICLES ONLY', 40.35, 1.55, 0.55, 0.9, 0.6, { style: 'warning', rotY: -90 });
      // Summit Road beyond the gate: climbing east into the fog
      K.road(40.3, 1.5, 56, 7.5, { axis: 'x', markings: 'none', footpath: 0, kerb: false, slope: { y0: 0, y1: 2.6 } });
      K.collider(40.3, 1.2, 56, 1.5, { h: 2.5 }); K.collider(40.3, 7.5, 56, 7.8, { h: 2.5 });
      slab(K, 40.3, -14, 60, 1.5, [2.2, 7.5, 0.1, 2.7], { tex: 'grass', color: '#3a4236' });
      slab(K, 40.3, 7.5, 60, 26, [0.05, 2.6, -2.5, -0.5], { tex: 'grass', color: '#353c32' });
      for (let x = 42; x < 56; x += 4.5) { K.prop('guardrail', x + 2.2, 1.35, 180, { len: 4.5, y: lerp(0, 2.6, (x + 2.2 - 40.3) / 15.7), collide: false }); }
      K.prop('power_pole', 47, 8.4, 0, { span: 20, y: 1.2 });
      K.prop('rf_sign', 52, 7.9, 180, { variant: 'post', y: lerp(0, 2.6, 11.7 / 15.7) });
      if (open && S.chapter >= 8) K.exit({ id: 'c7_carpark:summit', box: [54.8, 1.5, 56, 7.5], to: 'c8_summit', entry: 'bottom', when: () => !!ROOMS.c8_summit, blockedMsg: 'Up. [beat] Not yet.' });
      else if (open) K.trigger([44, 1.5, 46, 7.5], (G) => C7_toMast(G), { id: 'c7_carpark:mast', once: false, when: () => S.chapter === 7 });
      K.blocker(55.6, 1.5, 56, 7.5, 'The road climbs into the fog.');

      // ---- the parking rows -----------------------------------------------------------------------------------------
      const line = (x, z0, z1) => K.box(x, 0.004, (z0 + z1) / 2, 0.09, 0.01, z1 - z0, { color: '#c8c6bc', roughness: 0.8 }, { shadow: false });
      for (let x = 2; x <= 24.1; x += 2.6) line(x, 12.5, 17.2);
      for (let x = 34; x <= 39.3; x += 2.6) line(x, 12.5, 17.2);
      for (let x = 13.5; x <= 39.3; x += 2.6) line(x, 20.8, 25.5);
      for (let x = 2; x <= 11.1; x += 2.6) line(x, 20.8, 25.5);
      for (let i = 0; i < 8; i++) K.box(3.3 + i * 2.6, 0, 12.75, 1.5, 0.12, 0.2, { tex: 'concrete', color: '#9a978e' });
      K.box(20, 0.004, 18.95, 36, 0.01, 0.12, { color: '#c8c6bc', roughness: 0.8 }, { shadow: false });
      // the cars, beaded with fog; nobody has moved them in days
      K.prop('car', 3.3, 14.9, 180, { color: '#6d2622' });
      K.prop('hatchback', 8.5, 14.8, 176, { color: '#3a4a58' });
      K.prop('car', 33.0, 23.2, 2, { color: '#8b8a82', hazards: true, name: 'c7cp:hazards' });
      K.prop('hatchback', 3.3, 23.3, 178, { color: '#b8b4a6' });
      K.prop('car', 22.6, 23.2, 2, { color: '#2f3a33' });
      K.prop('car', 28.9, 23.1, 0, { color: '#4b3c2e' });
      K.prop('hatchback', 37.7, 23.2, -3, { color: '#1f2629' });
      K.prop('car', 6.2, 23.2, 178, { color: '#5b6b70', variant: 'wagon' });
      // the patient-transport wagon in the drop-off
      K.prop('car', 27.6, 4.3, 90, { color: '#e2e2dc', variant: 'wagon' });
      K.plane(27.6, 0.95, 5.27, 2.2, 0.28, plate('pt', 'PATIENT TRANSPORT', { bg: '#e2e2dc', fg: '#1d5d78', w: 512, h: 64, size: 36, age: 0.2 }), {});
      K.plane(27.6, 0.95, 3.33, 2.2, 0.28, plate('pt', 'PATIENT TRANSPORT', { bg: '#e2e2dc', fg: '#1d5d78', w: 512, h: 64, size: 36, age: 0.2 }), { rotY: 180 });
      K.examine(27.6, 1.2, 5.4, ['Patient transport. The back doors are shut.', 'I\'m not opening them.'], { id: 'c7cp:transport', r: 2.2 });
      K.examine(3.3, 1.2, 13.0, ['Fog\'s beaded on every windscreen.', 'Nobody\'s moved these in days. [beat] Visiting hours never ended.'], { id: 'c7cp:cars', r: 2.2 });
      K.examine(33.0, 1.1, 21.0, ['Hazards on. Someone pulled in fast.', 'Someone who got a call.'], { id: 'c7cp:hazards', r: 2.0 });
      K.prop('wheelchair', 12.4, 18.9, 38, {});
      K.examine(12.4, 0.8, 18.9, ['A wheelchair, left in the middle of the car park.', 'Somebody got where they were going. [beat] Or somebody didn\'t.'], { id: 'c7cp:wheelchair', r: 1.4 });
      // pay and display
      K.box(12.3, 0, 7.6, 0.45, 1.45, 0.32, { color: '#1d5d78', roughness: 0.5 }, { collide: true });
      K.plane(12.3, 1.05, 7.77, 0.4, 0.55, payTex(), {});
      K.examine(12.3, 1.2, 8.0, ['"Card only." [beat] Somebody\'s scratched NO SIGNAL into the screen.', 'I don\'t think anyone\'s checking the tickets.'], { id: 'c7cp:pay', r: 1.3 });
      K.dress('leaves', [0.5, 0.5, 39.5, 29.5], 90, { seed: 711 });
      K.dress('papers', [2, 8, 38, 28], 10, { seed: 712 });
      K.prop('rubbish', 23.6, 19.5, 0, {});
      K.prop('leaf_pile', 1.2, 28.8, 0, { radius: 0.9 });

      // ---- the island: the bench under the one sodium light (7-3) ------------------------------------------------------
      K.floor(26, 7, 33, 11.5, { tex: 'dirt', color: '#5a5446' }, { y: 0.15 });
      const kb = { tex: 'kerb', color: '#9a978c' };
      K.box(29.5, 0, 6.95, 7.1, 0.16, 0.12, kb); K.box(29.5, 0, 11.55, 7.1, 0.16, 0.12, kb);
      K.box(25.95, 0, 9.25, 0.12, 0.16, 4.7, kb); K.box(33.05, 0, 9.25, 0.12, 0.16, 4.7, kb);
      K.prop('bench_plaque', CP.bench[0], CP.bench[1], 0, { plaque: 'FOR THOSE\nWHO WAIT', y: 0.15 });
      K.prop('streetlight', CP.light[0], CP.light[1], -90, { bank: 1, y: 0.15, haloSize: 3.2 });
      K.prop('gum_tree_small', 26.9, 10.7, 40, { y: 0.15 });
      K.prop('bin', 26.9, 7.7, 0, { variant: 'street', y: 0.15 });
      K.dress('leaves', [26.2, 7.2, 32.8, 11.3], 26, { seed: 713, y: 0.16 });
      K.mark('c7:bench', CP.bench[0], 0.15, CP.bench[1], 0);
      K.examine(CP.bench[0], 0.7, CP.bench[1] + 0.4, ['A bench under the only light that works.', 'There\'s a plaque. "For those who wait."'], { id: 'c7cp:bench', r: 1.4 });
      // the other lamps: dead
      K.prop('streetlight', 1.2, 18.6, 90, { lit: false });
      K.prop('streetlight', 38.8, 18.6, -90, { lit: false });
      K.prop('streetlight', 12.0, 29.4, 180, { lit: false });
      K.examine(38.6, 2.0, 18.6, 'Dead. All of them but one.', { id: 'c7cp:deadlamp', r: 1.2 });
      // after Room 12: the mast's red light, blinking above the fog for the first time
      if (open) mastLight(K, 118, 58, -95, 5.5);

      // after the standoff: whoever stayed, by the bench
      if (flag('c7_standoff') && flag('lukeSaved')) K.npc('luke', 'luke', CP.bench[0] + 0.35, CP.bench[1] + 0.12, 0, { anim: 'sit_lean', y: 0.15, talk: (G) => C7_lukeTalk(G), rig: { hold: { L: ['phone', { case: '#8a6f94', screen: false }] } } });
      if (flag('c7_standoff') && flag('chaseSaved')) K.npc('chase', 'chase', 33.7, 12.6, -70, { anim: 'idle', talk: (G) => C7_chaseTalk(G) });
      // ---- exits -------------------------------------------------------------------------------------------------------
      K.exit({ id: 'c7_carpark:road', box: [4, 29.4, 12, 30], to: 'c7_ringroad', entry: 'hospital' });
    },
    async onEnter(G, from) {
      C7_freeFill();
      G.bars(null);
      // (7-2 ended here but the chain that plays 7-3 was lost: play it now)
      if (flag('c7_luke') && !flag('c7_standoff') && !C7.chain) { await G.wait(0.3); if (!flag('c7_standoff') && !C7.chain) await G.cutscene('7-3'); return; }
      if (from === 'c7_ringroad' && G.once('c7:carpark1')) {
        await G.wait(1.3);
        await G.think('District Hospital. [beat] Ward 3. Room 12.');
        note(G, 'District Hospital. Find her room.', 'c7_goal');
      }
      // CALL 8 — as Aidan leaves the hospital for the Mast
      if (from === 'c7_reception' && flag('c7_room12') && !(S.calls && S.calls.luka8)) {
        await G.wait(1.6);
        if (!(S.calls && S.calls.luka8)) await G.call('luka8');
        note(G, 'The mast. Summit Road — the gate, north-east of the car park.', 'c7_mast');
      }
    },
  });

  // after the standoff, by the bench: a word, no more
  async function C7_lukeTalk(G) {
    const L = G.actor('luke');
    L.look(G.aidan);
    if (flag('c7_room12')) await G.say('LUKE', 'Go on, then. [beat] Whatever it is.');
    else await G.say('LUKE', 'Go on. [beat] Room twelve.');
    L.look(null);
  }
  async function C7_chaseTalk(G) {
    const C = G.actor('chase');
    C.look(G.aidan);
    if (flag('c7_room12')) await G.say('CHASE', 'Up the hill? [beat] Course it\'s up a hill. Go, legend.');
    else await G.say('CHASE', 'Go. [beat] I\'ve got him.');
    C.look(null);
  }

  // the chain is down and the call has come: up Summit Road → CHAPTER CARD "THE MAST"
  async function C7_toMast(G) {
    if (S.chapter !== 7 || !flag('c7_room12')) return;
    if (!(S.calls && S.calls.luka8)) { await G.call('luka8'); }
    try { if (G.phone && G.phone.done) { G.phone.done('c7_mast'); G.phone.done('c7_goal'); } } catch (e) { /* phone */ }
    S.done['c7:toMast'] = true;
    const ok = await G.startChapter(8);
    if (ok === false) {
      // (no Chapter 8 in this build yet: show its card and hand the car park back)
      await G.card('THE MAST');
      S.chapter = 7;
      await G.goto('c7_carpark', 'summit', { fade: false, sound: 'none' });
      await G.fade(0, 1.0);
    }
  }

  // =================================================================================================================
  // Hospital interiors: pale sage paint over a grey-green dado and a timber bumper rail, hospital lino, tiled ceilings
  // at 2.9 m. In the Smile store the same walls are gloss teal with a yellow band.
  // =================================================================================================================
  const HW = {
    wall: { tex: 'plaster', color: '#b4b8a3' }, dado: { tex: 'plaster', color: '#6b7a72', roughness: 0.6 }, rail: { tex: 'wood', color: '#8a7358', roughness: 0.5 },
    floor: { tex: 'lino_hospital', color: '#8c948c' }, ceil: 'ceiling_tile', fog: { density: 0.032, color: '#3b4543' },
    swall: { tex: 'plaster', color: '#0e9c98', roughness: 0.28 }, sband: { color: '#ffcc00', roughness: 0.35 }, swhite: { color: '#eef2ef', roughness: 0.3 },
    sfloor: { tex: 'vinyl_retail', color: '#e8ecea', roughness: 0.18 },
  };
  // a wall with the hospital dado (or the store's gloss and band) on its faces; openings as K.wall
  function hwall(K, x0, z0, x1, z1, h, o = {}) {
    const st = !!o.store;
    const w = K.wall(x0, z0, x1, z1, h, o.mat || (st ? HW.swall : HW.wall), { thick: o.thick ?? 0.15, openings: o.openings || [], skirting: st ? '#e8ecea' : '#3e4640', grime: !st, both: o.both, collide: o.collide });
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.05 || o.dado === false) return w;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz, nz = ux, t = (o.thick ?? 0.15) / 2, yaw = Math.atan2(-uz, ux) / D2R;
    const doors = (o.openings || []).filter((op) => (op.sill ?? 0) <= 0.01).map((op) => [op.at - (op.w ?? 1) / 2, op.at + (op.w ?? 1) / 2]).sort((a, b) => a[0] - b[0]);
    const spans = []; let a = 0;
    for (const [d0, d1] of doors) { if (d0 - a > 0.05) spans.push([a, d0]); a = Math.max(a, d1); }
    if (L - a > 0.05) spans.push([a, L]);
    const faces = o.both === false ? [1] : [1, -1];
    for (const [s0, s1] of spans) {
      const m = (s0 + s1) / 2, cx = x0 + ux * m, cz = z0 + uz * m, len = s1 - s0;
      for (const f of faces) {
        const px = cx + nx * f * (t + 0.007), pz = cz + nz * f * (t + 0.007);
        if (st) {
          K.box(px, 0.95, pz, len, 0.12, 0.014, HW.sband, { rot: yaw, shadow: false });
          K.box(px, 1.07, pz, len, 0.03, 0.014, HW.swhite, { rot: yaw, shadow: false });
        } else {
          K.box(px, 0.1, pz, len, 0.92, 0.012, HW.dado, { rot: yaw, shadow: false });
          K.box(cx + nx * f * (t + 0.03), 0.9, cz + nz * f * (t + 0.03), len, 0.1, 0.05, HW.rail, { rot: yaw, shadow: false });
        }
      }
    }
    return w;
  }
  // a row of troffers along a line; `real` picks which ones hold real pool lights (index list), the rest glow only
  function tubes(K, pts, o = {}) {
    pts.forEach(([x, z, rot], i) => {
      const lit = o.lit === undefined ? true : typeof o.lit === 'function' ? o.lit(i) : o.lit;
      K.prop('fluoro_tube', x, z, rot ?? 0, { h: o.h ?? 2.88, variant: 'troffer', len: o.len ?? 1.2, lit, light: (o.real || []).includes(i), flicker: (o.flicker || []).includes(i), bank: o.bank ?? 1 });
    });
  }

  // a dark, unlit annex outside a cut-away wall (visual only): floor, ceiling and the named outer walls, so a camera
  // standing in it looks into the room from a darker space instead of from the void
  function annex(K, x0, z0, x1, z1, h, sides, o = {}) {
    const dk = o.mat || { tex: 'plaster', color: '#3a403c' };
    K.box((x0 + x1) / 2, -0.03, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, o.floor || { tex: 'lino', color: '#3f4540' }, { shadow: false });
    K.ceiling(x0, z0, x1, z1, h, o.ceil || { tex: 'ceiling_tile', color: '#5a5e58' });
    const t = 0.1;
    if (sides.includes('n')) K.box((x0 + x1) / 2, 0, z0 - t / 2, x1 - x0 + t * 2, h, t, dk, { shadow: false });
    if (sides.includes('s')) K.box((x0 + x1) / 2, 0, z1 + t / 2, x1 - x0 + t * 2, h, t, dk, { shadow: false });
    if (sides.includes('w')) K.box(x0 - t / 2, 0, (z0 + z1) / 2, t, h, z1 - z0, dk, { shadow: false });
    if (sides.includes('e')) K.box(x1 + t / 2, 0, (z0 + z1) / 2, t, h, z1 - z0, dk, { shadow: false });
  }

  // =================================================================================================================
  // 7B RECEPTION — 16 × 12 m inside the main entrance (south). The desk across the north side with the staff strip and
  // the tea room door behind it; the waiting room through double doors on the west wall; the corridor to the wards
  // through double doors on the east wall, the directory beside them; the payphone by the entrance.
  // =================================================================================================================
  const RC = { W: 16, D: 12, H: 2.95, desk: [1.5, 9.6, 2.62] };
  defineRoom({
    id: 'c7_reception', name: 'RECEPTION', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino', ambient: 'hospital',
    fog: HW.fog,
    bounds: [0, 0, 16, 12],
    entries: { entrance: [8, 10.9, 180], waiting: [1.1, 7.2, 90], tea: [3, 0.95, 0], corridor: [14.9, 5, -90], start: [8, 10.9, 180] },
    cameras: [
      // wide from the entrance: the desk, the dark doors to the wards on the right
      { id: 'c7_reception:wide', vol: [0, 3.2, 9.5, 12], type: 'static', pos: [15.2, 2.6, 11.4], target: [4.2, 0.9, 5.6], fov: 'fit' },
      // high over the desk, looking back at the glass doors and the fog outside
      { id: 'c7_reception:desk', vol: [9.5, 5.6, 16, 12], type: 'static', pos: [4.6, 2.75, 1.0], target: [12.5, 0.6, 9.2], fov: 'fit' },
      // the corridor doors and the directory, from the waiting room side
      { id: 'c7_reception:east', vol: [9.5, 0, 16, 5.6], type: 'static', pos: [2.4, 2.6, 9.6], target: [13.2, 0.9, 2.8], fov: 'fit' },
      // behind the desk: the staff strip, the tea room door (a CCTV corner)
      { id: 'c7_reception:staff', vol: [0, 0, 9.5, 3.2], type: 'static', pos: [9.0, 2.7, 8.4], target: [3.6, 0.6, 1.2], fov: 'fit' },
    ],
    build(K) {
      const H = RC.H;
      K.floor(0, 0, RC.W, RC.D, HW.floor);
      K.ceiling(0, 0, RC.W, RC.D, H, HW.ceil);
      // walls: north (tea room door), east (corridor doors), south (entrance + windows), west (waiting room doors)
      hwall(K, -0.08, 0, RC.W + 0.08, 0, H, { openings: [{ at: 3.08, w: 0.95, h: 2.1 }] });
      hwall(K, RC.W, -0.08, RC.W, RC.D + 0.08, H, { openings: [{ at: 5.08, w: 1.2, h: 2.2 }] });
      hwall(K, RC.W + 0.08, RC.D, -0.08, RC.D, H, { openings: [{ at: 8.08, w: 2.2, h: 2.4 }, { at: 12.6, w: 3.2, h: 1.9, sill: 0.5, glass: true }, { at: 3.6, w: 3.2, h: 1.9, sill: 0.5, glass: true }] });
      hwall(K, 0, RC.D + 0.08, 0, -0.08, H, { openings: [{ at: 4.88, w: 1.2, h: 2.2 }] });
      K.door({ id: 'c7_reception:entrance', x: 8, z: RC.D, rot: 0, w: 2.2, h: 2.4, style: 'glass_double', to: 'c7_carpark', entry: 'entrance' });
      K.door({ id: 'c7_reception:waiting', x: 0, z: 7.2, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_waiting', entry: 'door' });
      K.door({ id: 'c7_reception:tea', x: 3, z: 0, rot: 0, w: 0.95, style: 'wood', to: 'c7_tearoom', entry: 'door', sign: 'STAFF ONLY' });
      K.door({ id: 'c7_reception:corridor', x: RC.W, z: 5, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_corridor', entry: 'reception' });
      K.plane(RC.W - 0.09, 2.5, 5, 1.8, 0.32, plate('wards', 'WARDS 1 – 4  →   RADIOLOGY   CHAPEL', { bg: '#1d5d78', w: 768, h: 128, size: 40, age: 0.3 }), { rotY: -90 });
      K.plane(0.09, 2.5, 7.2, 1.4, 0.3, plate('waitsign', 'WAITING ROOM', { bg: '#1d5d78', w: 512, h: 112, size: 44, age: 0.3 }), { rotY: 90 });
      // the glass and the fog beyond it: a pale fog wall a little way out, the canopy's underside
      K.box(8, 0, RC.D + 2.5, 18, 3.2, 0.1, { color: '#57625f', roughness: 1 }, { shadow: false });
      K.box(8, 2.95, RC.D + 1.3, 12, 0.1, 2.4, { tex: 'concrete', color: '#6e6d67' }, { shadow: false });
      // ---- the desk: across the north side, a return at its east end; the staff strip behind -----------------------
      K.prop('counter', 5.55, RC.desk[2], 0, { len: 8.1, variant: 'hospital', clutter: false });
      K.box(9.45, 0, 1.3, 0.66, 1.0, 2.6, { color: '#dcdcd4', roughness: 0.5 }, { collide: true });
      K.box(9.45, 0.97, 1.3, 0.72, 0.04, 2.64, { color: '#d8d4c8', roughness: 0.4 });
      K.prop('monitor', 4.4, RC.desk[2] - 0.12, 180, { y: 1.0, content: 'off' });
      K.prop('monitor', 7.6, RC.desk[2] - 0.12, 200, { y: 1.0, content: 'login' });
      K.prop('desk_phone', 5.3, RC.desk[2] - 0.05, 170, { y: 1.0 });
      K.prop('visitor_book', 6.6, RC.desk[2] + 0.12, 180, { y: 1.1, lines: ['14/09  Pam  Ward 1, Rm 3', '15/09  Dave & kids  Ward 2', '15/09  Courier — Pathology', '16/09  Marg B.  Ward 4, Rm 9', '17/09  Luke  Ward 3, Rm 12', '17/09  Luke  Ward 3, Rm 12', '18/09  Luke — Ward 3, Rm 12.'] });
      K.cyl(3.4, 1.1, RC.desk[2] + 0.16, 0.045, 0.05, { tex: 'metal', color: '#c9c3b2', metalness: 0.7, roughness: 0.3 });
      K.sphere(3.4, 1.17, RC.desk[2] + 0.16, 0.012, { color: '#1a1a1a' });
      K.box(2.4, 1.1, RC.desk[2] + 0.14, 0.12, 0.2, 0.08, { color: '#e8eef0', roughness: 0.3 });
      K.box(8.6, 1.1, RC.desk[2] + 0.15, 0.24, 0.12, 0.14, { color: '#7aa0c8', roughness: 0.6 });
      K.plane(4.9, 1.34, RC.desk[2] + 0.24, 0.5, 0.18, plate('waitcall', 'PLEASE WAIT\nTO BE CALLED', { bg: '#f4f2ea', fg: '#1d5d78', w: 256, h: 96, size: 30, age: 0.3 }), { rotY: 0 });
      K.box(1.8, 1.1, RC.desk[2] + 0.1, 0.18, 0.24, 0.14, { color: '#b3261e', roughness: 0.5 });
      K.plane(1.8, 1.2, RC.desk[2] + 0.172, 0.16, 0.12, plate('aux', 'HOSPITAL\nAUXILIARY', { bg: '#b3261e', w: 128, h: 96, size: 26, age: 0.2 }), {});
      // behind the desk: chairs, a cabinet, the printer, the first aid kit on the shelf
      K.prop('office_chair', 4.3, 1.8, 10, {});
      K.prop('office_chair', 7.4, 1.7, -20, {});
      K.prop('filing_cabinet', 8.6, 0.35, 0, { n: 4 });
      K.prop('shelf', 6.2, 0.3, 0, { len: 1.6, h: 1.9, d: 0.4, load: 'paper' });
      K.pickup('first_aid', 6.0, 1.32, 0.32, { id: 'c7_reception:firstaid', rot: 0 });
      K.prop('printer', 5.1, 0.45, 0, { y: 0.0 });
      K.prop('clock', 5.5, 0.08, 0, { mount: 2.35, time: [3, 50] });
      K.prop('key_lockbox', 7.4, 0.08, 0, { mount: 1.5, code: '----' });
      K.prop('notice_board', 1.6, 0.08, 0, { title: 'STAFF NOTICES', w: 0.9, h: 0.7, mount: 1.55 });
      // ---- the east wall: the directory (the map), a leaflet rack -------------------------------------------------
      K.box(RC.W - 0.06, 0.95, 8.4, 0.05, 1.5, 1.2, { color: '#e8e8e0', roughness: 0.6 });
      K.plane(RC.W - 0.09, 1.7, 8.4, 1.1, 1.36, directoryTex(), { rotY: -90 });
      K.box(RC.W - 0.2, 0.7, 8.4, 0.25, 0.22, 0.7, { tex: 'metal', color: '#c3c8c6' });
      for (let i = 0; i < 4; i++) K.box(RC.W - 0.24, 0.84, 8.15 + i * 0.17, 0.02, 0.2, 0.12, { color: ['#1d5d78', '#e8e4d8', '#1d5d78', '#e8e4d8'][i], roughness: 0.7 }, { rot: 90 });
      K.interact(RC.W - 0.5, 1.4, 8.4, (G) => C7_directory(G), { id: 'c7_reception:directory', r: 1.5 });
      // ---- the west wall: the blank feedback board -------------------------------------------------------------------
      K.prop('feedback_board', 0.08, 10.1, 90, { title: 'YOU SAID, WE DID', mount: 1.6 });
      K.examine(0.4, 1.5, 10.1, 'Nobody said anything.', { id: 'c7rc:feedback', r: 1.5 });
      // ---- the south: the payphone by the doors, chairs under the windows, a wheelchair ----------------------------
      K.payphone(RC.W - 0.08, 10.5, -90, { wall: true, id: 'c7_reception:payphone' });
      for (let i = 0; i < 4; i++) K.prop('chair', 1.4 + i * 0.56, RC.D - 0.45, 180, { variant: 'waiting', color: '#3d5160' });
      for (let i = 0; i < 3; i++) K.prop('chair', 11.8 + i * 0.56, RC.D - 0.45, 180, { variant: 'waiting', color: '#3d5160' });
      K.prop('wheelchair', 10.4, 10.9, -30, {});
      K.sign('COURTESY WHEELCHAIRS\nPLEASE RETURN', 10.9, 1.6, RC.D - 0.09, 0.7, 0.3, { style: 'hospital', rotY: 180 });
      K.prop('water_cooler', 0.45, 5.2, 90, {});
      K.prop('plant_pot', 15.4, 0.6, 0, { variant: 'fiddle' });
      K.prop('wet_floor_sign', 12.2, 6.9, 30, {});
      K.prop('poster', 0.08, 2.4, 90, { style: 'alarm', text: 'PERSONAL ALARMS\nSAVE LIVES', sub: 'Test yours every month.', mount: 1.55 });
      K.prop('poster', RC.W - 0.08, 10.9, -90, { style: 'notice', text: 'FALLS PREVENTION\nAre you at risk? Loose rugs, poor lighting, living alone. Ask us about a personal alarm.', mount: 1.55 });
      K.prop('poster', RC.W - 0.08, 1.4, -90, { style: 'notice', text: 'HAND HYGIENE\nClean your hands on the way in and on the way out.', mount: 1.55 });
      K.prop('extinguisher', RC.W - 0.08, 3.4, -90, { variant: 'wall' });
      K.prop('exit_sign', 8, RC.D - 0.08, 180, { mount: 2.6 });
      K.prop('water_stain', 11.5, 4.5, 0, { surface: 'ceiling', ceil: H });
      K.prop('water_stain', 2.2, 9.2, 0, { surface: 'ceiling', ceil: H });
      K.dress('papers', [1, 3.5, 15, 11], 8, { seed: 721 });
      K.writing('IT\'LL BE FINE', 0.09, 1.9, 1.4, 1.3, { rotY: 90, world: 'fog' });
      // light: the tube over the desk stutters; the one by the doors is dead
      tubes(K, [[5.5, 3.6, 0], [10.5, 3.6, 0], [5.5, 8.2, 0], [10.5, 8.2, 0]], { lit: (i) => i === 0 || i === 3, real: [0, 3], flicker: [0], h: H - 0.02 });
      K.light('led', 7.4, 1.62, 0.14, { color: '#ff2a1c', blink: 1.5 });
      // ---- examine ------------------------------------------------------------------------------------------------------
      K.examine(6.6, 1.2, RC.desk[2] + 0.35, (G) => C7_visitorBook(G), { id: 'c7rc:book', r: 1.2 });
      K.examine(3.4, 1.2, RC.desk[2] + 0.4, ['A bell on the counter.', 'I don\'t ring it. [beat] I don\'t want to know what comes.'], { id: 'c7rc:bell', r: 1.0 });
      K.examine(1.8, 1.2, RC.desk[2] + 0.4, ['"Hospital Auxiliary. Every gold coin helps." It\'s full.', 'Nobody\'s emptied it. Nobody\'s taken any either.'], { id: 'c7rc:aux', r: 1.0 });
      K.examine(7.6, 1.3, RC.desk[2] - 0.05, ['The screen\'s on the login page.', 'A sticky note on the edge: "Ward 3 rang — Rm 12 visitor after hours OK".'], { id: 'c7rc:screen', r: 1.3 });
      K.examine(0.4, 1.5, 2.4, ['"Personal alarms save lives. Test yours every month."', 'Press and hold for help. [beat] If there\'s a line on the other end.'], { id: 'c7rc:alarm', r: 1.3 });
      K.examine(RC.W - 0.4, 1.5, 10.9, ['"Falls prevention. Are you at risk?"', '"Living alone." [beat] She was.'], { id: 'c7rc:falls', r: 1.3 });
      K.examine(10.4, 0.8, 10.9, ['"Courtesy wheelchairs. Please return."', 'There\'s one missing. [beat] I saw it. In the car park.'], { id: 'c7rc:wheelchair', r: 1.4 });
      K.examine(0.5, 1.1, 5.2, 'The cooler gurgles as I walk past. Like it\'s clearing its throat.', { id: 'c7rc:cooler', r: 1.1 });
      K.examine(5.5, 2.3, 0.3, ['Ten to four. [beat] In the morning, I think.', 'It hasn\'t moved since I came in.'], { id: 'c7rc:clock', r: 2.2 });
      K.examine(12.2, 0.5, 6.9, 'Caution, wet floor. The floor\'s dry. It\'s been dry a long time.', { id: 'c7rc:wet', r: 1.1 });
      K.examine(8, 1.4, RC.D - 0.5, 'The car park, through the glass. Grey, then nothing.', { id: 'c7rc:glass', r: 1.6, when: () => !flag('c7_room12') });
    },
    async onEnter(G, from) {
      G.bars(null);
      if (from === 'c7_carpark' && !flag('c7_arrived')) {
        G.set('c7_arrived', true);
        G.sfx('chime', { vol: 0.35, pos: [8, 2.2, 12] });
        await G.wait(1.6);
        await G.think('Somebody should be at the desk. [beat] Somebody\'s always at the desk.');
        note(G, 'Find her room. The visitor book?', 'c7_goal');
      }
      if (from === 'c7_corridor' && flag('c7_store') && G.once('c7:storeBack')) { await G.wait(1.0); await G.think('It\'s just a hospital out here. [beat] In there it\'s the store.'); }
    },
  });

  // the visitor book: the last entry
  async function C7_visitorBook(G) {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    await A.turn([6.6, RC.desk[2]], 0.3);
    A.look([6.6, 1.1, RC.desk[2] + 0.1]);
    await G.think('The visitor book. The last entry:');
    await G.think('"Luke — Ward 3, Rm 12."');
    await G.wait(0.5);
    await G.think('Room twelve.');
    A.look(null);
    if (A.raw) A.raw.idleLife = true;
    if (!flag('c7_visitor')) { G.set('c7_visitor', true); note(G, 'Ward 3, Room 12. Through the corridor.', 'c7_goal'); }
  }
  // the directory: "Ward 3 — Orthopaedics" → "Broken bones." [beat] (pen click) — and the map from the rack
  async function C7_directory(G) {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    await A.turn(90, 0.3);
    A.look([RC.W, 1.7, 8.4]);
    await G.think('"Ward 3 — Orthopaedics."');
    await G.think('Broken bones.');
    await G.wait(0.8);
    G.sfx('penclick', { vol: 0.9 });
    await A.gesture('pen_click');
    A.look(null);
    if (A.raw) A.raw.idleLife = true;
    if (!S.taken['c7_reception:map']) await Script.builtins.pickup(G, { id: 'c7_reception:map', item: 'map_hospital' });
  }

  // =================================================================================================================
  // 7B WAITING ROOM — 12 × 10 m west of reception. Rows of chairs face a TV on the north wall that plays one plan
  // advertisement, over and over. Two Tethered sit in the front row, watching it. The vending machine, the kids' corner.
  // =================================================================================================================
  const WR = { W: 12, D: 10, H: 2.9, tv: [6.2, 0.08] };
  defineRoom({
    id: 'c7_waiting', name: 'WAITING ROOM', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino', ambient: 'hospital',
    fog: HW.fog,
    bounds: [0, 0, 12, 10],
    entries: { door: [10.85, 5, -90], start: [10.85, 5, -90] },
    cameras: [
      // from behind the TV, over its shoulder, down at the seated figures
      { id: 'c7_waiting:tv', vol: [0, 2.4, 9.2, 10], type: 'static', pos: [6.1, 2.84, -1.2], target: [5.0, 0.45, 6.2], fov: 'fit' },
      // the door end, low: the backs of the chairs, the TV's glow beyond them
      { id: 'c7_waiting:door', vol: [9.2, 0, 12, 10], type: 'static', pos: [2.2, 1.35, 8.9], target: [10.8, 0.9, 3.6], fov: 'fit' },
      // the front of the room under the TV (the vending machine's corner)
      { id: 'c7_waiting:front', vol: [0, 0, 9.2, 2.4], type: 'static', pos: [8.6, 2.5, 9.4], target: [3.2, 0.7, 1.0], fov: 'fit' },
    ],
    spawns: [
      { id: 'c7_waiting:teth1', type: 'tethered', pos: [4.25, 3.95], rot: 180, anchor: [4.25, 3.95], sit: true, seatH: 0.48, seat: { pos: [4.25, 3.95], rot: 180, h: 0.48 }, noticeRange: 4.2 },
      { id: 'c7_waiting:teth2', type: 'tethered', pos: [7.6, 3.95], rot: 180, anchor: [7.6, 3.95], sit: true, seatH: 0.48, seat: { pos: [7.6, 3.95], rot: 180, h: 0.48 }, noticeRange: 4.2, cardigan: '#7a5a3c' },
    ],
    build(K) {
      const H = WR.H;
      K.floor(0, 0, WR.W, WR.D, HW.floor);
      K.ceiling(0, 0, WR.W, WR.D, H, HW.ceil);
      // north wall cut away (front face only) for the camera behind the TV
      hwall(K, -0.08, 0, WR.W + 0.08, 0, H, { both: false });
      hwall(K, WR.W, -0.08, WR.W, WR.D + 0.08, H, { openings: [{ at: 5.08, w: 1.2, h: 2.2 }] });
      hwall(K, WR.W + 0.08, WR.D, -0.08, WR.D, H, { openings: [{ at: 6.08, w: 2.6, h: 1.4, sill: 0.9, glass: true }] });
      hwall(K, 0, WR.D + 0.08, 0, -0.08, H);
      annex(K, 3.6, -1.6, 9.2, 0, H, ['n', 'w', 'e']);
      K.door({ id: 'c7_waiting:door', x: WR.W, z: 5, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_reception', entry: 'waiting' });
      K.box(6, 0, WR.D + 1.6, 8, 3, 0.1, { color: '#4e5856', roughness: 1 }, { shadow: false });
      // the TV and its advertisement, on loop
      const tv = K.prop('tv', WR.tv[0], WR.tv[1], 0, { w: 1.3, mount: 2.05, content: 'ad', light: true, name: 'c7wr:tv' });
      K.animate((dt, t) => {
        const o = tv && tv.userData;
        if (!o || !o.screen) return;
        o.custom = true;
        o._c7t = (o._c7t || 0) + dt;
        if (o._c7t < 0.12) return;
        o._c7t = 0;
        try { o.screen.draw((c, w, h) => paintAd(c, w, h, t)); } catch (e) { /* screen */ }
      });
      // three rows of chairs facing the TV (the two in the front row are theirs)
      for (const z of [3.95, 5.75, 7.55]) for (let i = 0; i < 11; i++) {
        const x = 2.6 + i * 0.55;
        if (z === 7.55 && i > 8) continue;
        K.prop('chair', x, z, 180, { variant: 'waiting', color: i % 4 === 1 ? '#4a5a6a' : '#3d5160' });
      }
      K.prop('coffee_cup', 5.9, 5.8, 20, { y: 0.48, text: 'KAREN' });
      K.prop('cardigan_chair', 9.6, 7.5, 200, {});
      // the vending machine against the west wall (lit, OUT OF ORDER), a bin beside it
      K.prop('vending_machine', 0.52, 2.3, 90, { light: true });
      K.pickup('energy_drink', 1.12, 0.0, 1.95, { id: 'c7_waiting:energy', extraOnEasy: true, rot: 70 });
      K.prop('bin', 0.4, 3.3, 90, {});
      // kids' corner (south-west): a low table, crayons, a drawing, a toy box, a play mat
      K.box(2.0, 0, 8.6, 2.4, 0.01, 1.8, { color: '#6a8a5a', roughness: 0.95 }, { shadow: false });
      K.box(1.7, 0, 8.6, 0.8, 0.42, 0.55, { color: '#d8c89a', roughness: 0.6 }, { collide: true });
      K.prop('drawing', 1.65, 8.55, 10, { y: 0.42 });
      for (let i = 0; i < 5; i++) K.cyl(1.9 + i * 0.03, 0.43, 8.8, 0.005, 0.08, { color: ['#b3261e', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad'][i] }, { rz: 90 });
      K.box(0.55, 0, 9.3, 0.6, 0.4, 0.45, { color: '#b8703a', roughness: 0.7 }, { collide: true });
      for (let i = 0; i < 4; i++) K.box(0.4 + i * 0.1, 0.4, 9.2 + (i % 2) * 0.08, 0.07, 0.07, 0.07, { color: ['#d8b04a', '#4a7ab0', '#b04a4a', '#6ab04a'][i] }, { rot: i * 20 });
      // the take-a-number and the NOW SERVING board by the door
      K.box(WR.W - 0.3, 0, 7.9, 0.3, 1.1, 0.3, { color: '#b3261e', roughness: 0.5 }, { collide: true });
      K.plane(WR.W - 0.08, 2.2, 7.4, 0.8, 0.36, plate('nowserving', 'NOW SERVING  0', { bg: '#0b0b0b', fg: '#ff4a2a', w: 256, h: 96, size: 38, font: FN.mono, age: 0 }), { rotY: -90, emissive: 1.1 });
      K.light('led', WR.W - 0.2, 2.2, 7.4, { color: '#ff3a26' });
      K.prop('magazine' in PROPS ? 'magazine' : 'box', 9.9, 9.4, 12, { w: 0.5, h: 0.4, d: 0.35 });
      K.prop('poster', WR.W - 0.08, 2.3, -90, { style: 'notice', text: 'EMERGENCY WAIT TIMES\nYou will be seen in order of need, not order of arrival. Thank you for your patience.', mount: 1.55 });
      K.prop('poster', 0.08, 6.4, 90, { style: 'plan', text: 'STAY CONNECTED', mount: 1.55 });
      K.prop('clock', 0.08, 7.6, 90, { mount: 2.3, time: [3, 50] });
      K.prop('water_stain', 3.2, 6.5, 0, { surface: 'ceiling', ceil: H });
      K.prop('plant_pot', 11.4, 9.4, 0, { variant: 'dead' });
      K.dress('papers', [1, 2, 11, 9], 6, { seed: 731 });
      K.writing('DID YOU CHECK', 0.09, 1.9, 4.9, 1.3, { rotY: 90, world: 'fog' });
      // sticker10: low on the vending machine's side panel, facing the corner
      K.sticker('sticker10', 0.62, 0.16, 2.79, 0, { size: 0.06 });
      // light: the TV, the vending machine, and one tube over the door that can't decide
      tubes(K, [[3.5, 3, 0], [8.5, 3, 0], [3.5, 7, 0], [8.5, 7, 0]], { lit: (i) => i === 3, real: [3], flicker: [3], h: H - 0.02 });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(0.95, 1.2, 2.3, ['Out of order. Of course.', 'B6 is a packet of lollies I could just about reach. [beat] I don\'t.'], { id: 'c7wr:vending', r: 1.3 });
      K.examine(WR.tv[0], 1.6, 1.2, ['"Stay close. Stay connected." [beat] The Seniors Plan.', 'I\'ve sold that plan. [beat] I\'ve sold it to people like her.', 'It just keeps playing.'], { id: 'c7wr:tv', r: 2.0 });
      K.examine(1.7, 0.6, 8.6, ['A kid\'s drawing. A house, a sun, a lady in a bed.', '"GET BETTER NANA."'], { id: 'c7wr:drawing', r: 1.3 });
      K.examine(0.55, 0.6, 9.3, 'Wooden blocks. One of them has a phone painted on it.', { id: 'c7wr:blocks', r: 1.0 });
      K.examine(WR.W - 0.3, 1.2, 7.9, ['"Take a number." [beat] "Now serving: 0."', 'Nobody\'s been served. Nobody\'s left, either.'], { id: 'c7wr:number', r: 1.4 });
      K.examine(5.9, 0.7, 5.8, 'Somebody\'s coffee, still on the seat. Lipstick on the lid. "Karen."', { id: 'c7wr:coffee', r: 0.9 });
      K.examine(9.6, 0.9, 7.5, 'A cardigan over a chair. Brown. [beat] Not hers. Hers is blue.', { id: 'c7wr:cardigan', r: 1.1 });
      K.examine(9.9, 0.5, 9.4, ['Magazines from two years ago.', '"Is your home phone ready for the switch-off?"'], { id: 'c7wr:mags', r: 1.1 });
      K.examine(WR.W - 0.4, 1.5, 2.3, '"You will be seen in order of need." [beat] Not in order of calls.', { id: 'c7wr:waittimes', r: 1.3 });
    },
    async onEnter(G) {
      G.bars(null);
      if (G.once('c7:waiting1')) { await G.wait(1.4); await G.think('They\'re watching the ad. [beat] They\'re not blinking.'); }
    },
  });

  // =================================================================================================================
  // 7B STAFF TEA ROOM — 6 × 5 m behind reception: the break table under the wall clock, the sink bench, lockers.
  // =================================================================================================================
  const TR7 = { W: 6, D: 5, H: 2.7 };
  defineRoom({
    id: 'c7_tearoom', name: 'STAFF TEA ROOM', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino', ambient: 'interior',
    fog: HW.fog,
    bounds: [0, 0, 6, 5],
    entries: { door: [4.5, 4.1, 180], start: [4.5, 4.1, 180] },
    cameras: [
      // static from the doorway (the south wall cut away): the table, the clock, the bench
      { id: 'c7_tearoom:door', vol: [0, 0, 6, 3.4], type: 'static', pos: [4.9, 2.45, 8.6], target: [2.6, 0.7, 1.6], fov: 'fit' },
      // the door end, from the lockers' corner, high
      { id: 'c7_tearoom:lockers', vol: [0, 3.4, 6, 5], type: 'static', pos: [0.6, 2.55, 0.4], target: [4.4, 0.4, 4.3], fov: 'fit' },
    ],
    build(K) {
      const H = TR7.H;
      K.floor(0, 0, TR7.W, TR7.D, { tex: 'lino', color: '#8a8a7c' });
      K.ceiling(0, 0, TR7.W, TR7.D, H, HW.ceil);
      hwall(K, -0.08, 0, TR7.W + 0.08, 0, H, { mat: { tex: 'plaster', color: '#c4c1ac' }, dado: false });
      hwall(K, TR7.W, -0.08, TR7.W, TR7.D + 0.08, H, { mat: { tex: 'plaster', color: '#c4c1ac' }, dado: false });
      hwall(K, TR7.W + 0.08, TR7.D, -0.08, TR7.D, H, { both: false, dado: false, openings: [{ at: 1.58, w: 0.95, h: 2.1 }], mat: { tex: 'plaster', color: '#c4c1ac' } });
      hwall(K, 0, TR7.D + 0.08, 0, -0.08, H, { mat: { tex: 'plaster', color: '#c4c1ac' }, dado: false });
      annex(K, 0, TR7.D, 6, 9.4, H, ['w', 'e', 's']);
      K.door({ id: 'c7_tearoom:door', x: 4.5, z: TR7.D, rot: 0, w: 0.95, style: 'wood', to: 'c7_reception', entry: 'tea', signBack: 'STAFF ONLY' });
      K.breakTable(2.5, 2.3, 0, { id: 'c7_tearoom:break', time: [3, 50], clock: [2.5, 2.2, 0.08, 0] });
      K.prop('chair', 1.6, 2.2, 90, { variant: 'plastic', color: '#4d6d6e' });
      K.prop('cardigan_chair', 3.4, 2.4, -90, { color: '#1c2a44' });
      K.prop('sink_bench', 4.4, 0.33, 0, { len: 2.4, upper: true, variant: 'office' });
      K.prop('microwave', 5.1, 0.32, 0, { y: 0.92, time: '3:50' });
      K.prop('mug', 3.8, 0.35, 30, { y: 0.92, text: "WORLD'S BEST NURSE" });
      K.prop('mug', 4.05, 0.28, -20, { y: 0.92, text: 'WARD 3' });
      K.prop('fridge', 5.62, 1.6, -90, { variant: 'office' });
      K.prop('locker_bank', 0.3, 3.5, 90, { n: 4, names: ['DEB', 'PRIYA', 'T. NGUYEN', 'MEL'], open: 2 });
      K.prop('roster', 0.08, 1.4, 90, { title: 'WARD 3 — NIGHTS — SEPTEMBER', mount: 1.55 });
      K.prop('corkboard', TR7.W - 0.08, 3.6, -90, { w: 0.9, h: 0.7, mount: 1.55 });
      K.plane(TR7.W - 0.1, 1.62, 3.4, 0.24, 0.18, cardTex('thanks', ['Thank you for', 'looking after Mum.', 'You were all so kind.', '— the Harrisons'], { hand: true, size: 15, age: 0.3 }), { rotY: -90 });
      K.plane(4.4, 1.55, 0.09, 0.42, 0.14, plate('washcups', 'PLEASE WASH YOUR OWN CUPS', { bg: '#fffbe8', fg: '#b3261e', w: 512, h: 96, size: 30, age: 0.5 }), {});
      K.box(2.8, 0.745, 2.1, 0.16, 0.012, 0.11, { color: '#f0e6c8', roughness: 0.9 }, { rot: 20 });
      K.box(2.1, 0.745, 2.4, 0.2, 0.1, 0.2, { color: '#b8a070', roughness: 0.4 });
      K.pickup('coffee', 2.35, 0.745, 2.55, { id: 'c7_tearoom:coffee', extraOnEasy: true, rot: 40 });
      K.prop('plant_pot', 0.45, 0.45, 0, { variant: 'fern' });
      K.prop('fluoro_tube', 3, 2.5, 0, { h: H - 0.02, bank: 1 });
      // ---- examine ------------------------------------------------------------------------------------------------------
      K.examine(5.4, 1.4, 1.6, 'A note on the fridge: "Whoever took Deb\'s yoghurt: we know."', { id: 'c7tr:fridge', r: 1.2 });
      K.examine(0.4, 1.5, 1.4, ['Nights, Ward 3. Three names a shift.', 'Somebody\'s written "short again" along the bottom.'], { id: 'c7tr:roster', r: 1.2 });
      K.examine(TR7.W - 0.4, 1.6, 3.4, ['"Thank you for looking after Mum. You were all so kind."', 'They pin these up. [beat] So they remember why.'], { id: 'c7tr:card', r: 1.2 });
      K.examine(3.9, 1.0, 0.4, '"World\'s best nurse." Chipped on the handle.', { id: 'c7tr:mug', r: 1.0 });
      K.examine(4.6, 1.0, 0.35, ['The kettle\'s warm.', 'It can\'t be. [beat] It is.'], { id: 'c7tr:kettle', r: 0.9 });
      K.examine(0.5, 1.2, 3.5, ['Somebody\'s sneakers. Somebody\'s umbrella.', 'Nobody\'s going home.'], { id: 'c7tr:lockers', r: 1.3 });
      K.examine(3.4, 0.9, 2.4, 'A navy cardigan on the chair. It smells like hand sanitiser.', { id: 'c7tr:cardigan', r: 1.0 });
      K.examine(4.4, 1.5, 0.4, '"Please wash your own cups." Underlined three times.', { id: 'c7tr:sign', r: 1.2 });
      K.examine(2.8, 0.85, 2.1, 'A birthday card, half signed. "Happy 60th Marg!!" [beat] Half the ward never got to it.', { id: 'c7tr:bday', r: 0.9 });
    },
    async onEnter(G) {
      G.bars(null);
      if (G.once('c7:tea1')) { await G.wait(1.2); await G.think('The tea room. [beat] It\'s warmer in here.'); }
    },
  });

  // =================================================================================================================
  // 7C THE U CORRIDOR — ~70 m, 4 m wide: east from reception (z 0–4), north (x 22–26), west (z −22 to −18) to the
  // nurses' station. Fire doors across the first leg (F1, x 17) and the second (F2, z −11); side rooms: Bay 1 (south of
  // the first leg, a dead end), Bay 2 (inside the U: a way round F1 into the second leg), Bay 3 (east of the second leg:
  // a way round F2). Fog world: a dim hospital corridor, the side rooms locked. Luke's world (S.flags.c7_store): the Smile
  // store — gloss teal, retail vinyl, beds down the middle like demo tables with a phone on each pillow, the side rooms
  // open as store bays, the front counter by the door from reception, security gates in the doorways. Too bright.
  // =================================================================================================================
  const CO = { H: 2.9 };
  const coBeds = { bl: [5.4, 8.5, 12.6], rl: [-3.2, -7.8, -14.6], tl: [18.6, 14.4, 10.3, 6.2] };
  defineRoom({
    id: 'c7_corridor', name: 'CORRIDOR', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino',
    get ambient() { return store() ? 'store' : 'hospital'; },
    get fog() { return store() ? { density: 0.014, color: '#26302e' } : HW.fog; },
    get grade() { return store() ? 'hospital' : undefined; },
    get surfaces() { return store() ? [{ box: [-1, -30, 40, 12], s: 'vinyl' }] : []; },
    bounds: [0, -22, 32, 10],
    entries: { reception: [1.1, 2, 90], nurses: [1.1, -20, 90], start: [1.1, 2, 90] },
    cameras: [
      // the first leg, straight down its length both ways (symmetrical)
      { id: 'c7_corridor:blW', vol: [0, 0, 9.2, 4], type: 'pan', pos: [14.6, 2.55, 2.0], target: [0, 1.1, 2.0], fov: 44, pan: { lag: 0.3, yaw: 20, pitch: 26 } },
      { id: 'c7_corridor:blE', vol: [8.9, 0, 17.3, 4], type: 'pan', pos: [2.6, 2.55, 2.0], target: [17, 1.1, 2.0], fov: 44, pan: { lag: 0.3, yaw: 20, pitch: 26 } },
      // the south-east corner behind F1: empty until something steps into it
      { id: 'c7_corridor:se', vol: [16.9, 0, 21.7, 4], type: 'static', pos: [25.85, 2.65, 3.55], target: [17.2, 0.5, 1.5], fov: 'fit' },
      { id: 'c7_corridor:corner', vol: [21.7, -0.3, 26, 4], type: 'static', pos: [24.0, 2.65, -6.3], target: [23.6, 0.4, 2.0], fov: 'fit' },
      // the second leg, both ways, F2 in the middle of the frame
      { id: 'c7_corridor:rlS', vol: [22, -11.2, 26, 0.2], type: 'pan', pos: [24.0, 2.6, 6.2], target: [24.0, 1.0, -10.5], fov: 44, pan: { lag: 0.3, yaw: 22, pitch: 36 } },
      { id: 'c7_corridor:rlN', vol: [22, -17.6, 26, -10.8], type: 'pan', pos: [24.0, 2.6, -21.6], target: [24.0, 1.0, -11.0], fov: 44, pan: { lag: 0.3, yaw: 22, pitch: 36 } },
      // the north-east corner, from down the second leg: an empty corner, the third leg hidden round it
      { id: 'c7_corridor:ne', vol: [21.7, -22, 26, -17.4], type: 'static', pos: [24.0, 2.7, -12.4], target: [23.6, 0.5, -20.3], fov: 'fit' },
      // the third leg, both ways; the nurses' station door at the far end
      { id: 'c7_corridor:tlE', vol: [10.6, -22, 22, -18], type: 'pan', pos: [2.4, 2.55, -20.0], target: [22, 1.1, -20.0], fov: 44, pan: { lag: 0.3, yaw: 20, pitch: 26 } },
      { id: 'c7_corridor:tlW', vol: [0, -22, 10.9, -18], type: 'pan', pos: [18.4, 2.55, -20.0], target: [0, 1.1, -20.0], fov: 44, pan: { lag: 0.3, yaw: 20, pitch: 26 } },
      // the bays (open only in the store), shot through their cut-away back walls
      { id: 'c7_corridor:b1', vol: [7, 4, 13, 10], type: 'static', pos: [10.0, 2.75, 14.6], target: [10.0, 0.5, 6.4], fov: 'fit' },
      { id: 'c7_corridor:b2', vol: [14, -7, 22, 0], type: 'static', pos: [9.3, 2.75, -3.5], target: [18.2, 0.5, -3.5], fov: 'fit' },
      { id: 'c7_corridor:b3', vol: [26, -17, 32, -5], type: 'static', pos: [37.6, 2.75, -11.0], target: [28.6, 0.5, -11.0], fov: 'fit' },
    ],
    spawns: [
      { id: 'c7_corridor:s1', type: 'c7_smile', seed: 71, pos: [17.0, 2.0], rot: -90, post: [17.0, 2.0, -90], colR: 0.46, when: () => flag('c7_store') },
      { id: 'c7_corridor:s2', type: 'c7_smile', seed: 72, pos: [3.0, 0.8], rot: 90, when: () => flag('c7_store'),
        route: [[3.0, 0.8, 2.5, 90], [14.6, 0.8, 0.4], [15.8, 2.0, 2.0, -90], [14.6, 3.2, 0.4], [3.0, 2.9, 2.5, 0]] },
      { id: 'c7_corridor:s3', type: 'c7_smile', seed: 73, pos: [24.0, -10.9], rot: 0, when: () => flag('c7_store'),
        route: [[24.0, -10.9, 6, 0], [22.8, -12.4], [22.8, -17.0], [24.0, -19.9, 1.2], [20.0, -21.2], [11.6, -21.2, 3, 90], [20.0, -21.2], [24.0, -19.9, 1], [22.8, -17.0], [22.8, -12.4]] },
    ],
    build(K) {
      const st = store(), H = CO.H;
      const hw = (x0, z0, x1, z1, o = {}) => hwall(K, x0, z0, x1, z1, H, { store: st, ...o });
      const floorMat = st ? HW.sfloor : HW.floor;
      // ---- floors and ceilings: the U; the bays are walkable only in the store ---------------------------------------
      K.floor(0, 0, 26, 4, floorMat);
      K.floor(22, -18, 26, 0, floorMat);
      K.floor(0, -22, 26, -18, floorMat);
      const bay = (x0, z0, x1, z1) => { if (st) K.floor(x0, z0, x1, z1, floorMat); else K.box((x0 + x1) / 2, -0.02, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, HW.floor, { shadow: false }); K.ceiling(x0, z0, x1, z1, H, st ? { color: '#f2f4f2', roughness: 0.6 } : HW.ceil); };
      bay(7, 4, 13, 10); bay(14, -7, 22, 0); bay(26, -17, 32, -5);
      annex(K, 7, 10, 13, 15.3, H, ['w', 'e', 's']);
      annex(K, 8.9, -7, 14, 0, H, ['w', 'n']);
      annex(K, 32, -17, 38.1, -5, H, ['n', 's', 'e']);
      annex(K, 17, 4, 26, 7.0, H, ['w', 'e', 's']);
      K.ceiling(0, 0, 26, 4, H, st ? { color: '#f2f4f2', roughness: 0.6 } : HW.ceil);
      K.ceiling(22, -18, 26, 0, H, st ? { color: '#f2f4f2', roughness: 0.6 } : HW.ceil);
      K.ceiling(0, -22, 26, -18, H, st ? { color: '#f2f4f2', roughness: 0.6 } : HW.ceil);
      // ---- walls --------------------------------------------------------------------------------------------------------
      hw(-0.08, 4, 7.08, 4);                                                        // first leg, south (west of Bay 1)
      hw(7, 4, 13, 4, { openings: [{ at: 3.0, w: 1.2, h: 2.2 }, { at: 1.2, w: 1.5, h: 1.3, sill: 0.8, glass: true }, { at: 4.8, w: 1.5, h: 1.3, sill: 0.8, glass: true }] });
      hw(12.92, 4, 17.08, 4);
      hw(26.08, 4, 16.92, 4, { both: false });                                       // (cut away: the corner's cameras look in from the south)
      hw(26, 4.08, 26, -22.08, { openings: [{ at: 10.5, w: 1.2, h: 2.2 }, { at: 19.5, w: 1.2, h: 2.2 }, { at: 15, w: 2.6, h: 1.3, sill: 0.8, glass: true }] });
      hw(26.08, -22, -0.08, -22);                                                   // third leg, north
      hw(0, -17.92, 0, -22.08, { openings: [{ at: 2.0, w: 1.2, h: 2.2 }] });      // west end of the third leg (nurses' door)
      hw(0, 4.08, 0, -0.08, { openings: [{ at: 2.08, w: 1.2, h: 2.2 }] });        // west end of the first leg (reception door)
      hw(-0.08, 0, 14.08, 0);                                                       // first leg, north (inner block)
      hw(13.92, 0, 22.08, 0, { openings: [{ at: 0.58, w: 1.2, h: 2.2 }, { at: 4.6, w: 2.6, h: 1.3, sill: 0.8, glass: true }] });
      hw(22, 0.08, 22, -18.08, { openings: [{ at: 4.08, w: 1.2, h: 2.2 }] });    // second leg, west (inner block)
      hw(22.08, -18, -0.08, -18);                                                   // third leg, south (inner block)
      // the bays' other walls (their back walls are cut away for the cameras outside them)
      hw(7, 10.08, 7, 3.92); hw(13, 3.92, 13, 10.08);
      hw(13.92, 10, 7.08, 10, { dado: false, both: false, mat: st ? HW.swall : HW.wall });
      hw(14, 0, 14, -7.08, { both: false, dado: false });
      hw(13.92, -7, 22.08, -7);
      hw(25.92, -5, 32.08, -5); hw(32.08, -17, 25.92, -17);
      hw(32, -17, 32, -5, { both: false, dado: false });
      // the fire doors: F1 across the first leg, F2 across the second
      hw(17, -0.08, 17, 4.08, { openings: [{ at: 2.08, w: 1.4, h: 2.2 }] });
      hw(26.08, -11, 21.92, -11, { openings: [{ at: 2.08, w: 1.4, h: 2.2 }] });
      K.box(17, 2.2, 2, 0.2, 0.7, 1.45, st ? HW.swhite : { tex: 'metal', color: '#9aa09c' });
      K.box(24, 2.2, -11, 1.45, 0.7, 0.2, st ? HW.swhite : { tex: 'metal', color: '#9aa09c' });
      K.mark('c7:f1', 17, 0, 2, -90); K.mark('c7:f2', 24, 0, -11, 0);
      // ---- the doors out: reception (west end of the first leg), the nurses' station (west end of the third) --------
      K.door({ id: 'c7_corridor:reception', x: 0, z: 2, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_reception', entry: 'corridor' });
      K.door({ id: 'c7_corridor:nurses', x: 0, z: -20, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_nurses', entry: 'corridor' });
      if (st) C7_storeCorridor(K); else C7_hospCorridor(K);
    },
    onUpdate(dt) { C7_trackDoors('c7_corridor'); },
    async onEnter(G, from) {
      C7_enterDoors('c7_corridor', from);
      if (store()) {
        G.bars('noservice', { room: true });
        if (from === 'c7_reception') G.sfx('chime', { vol: 0.8 });
        if (C7.pageUntil > now()) C7_assignPage('c7_corridor');
        if (G.once('c7:storeTip') && flag('c7_s71')) { /* the first time back in after 7-1 */ }
        return;
      }
      G.bars(null);
      if (flag('c7_luke') && !flag('c7_room12') && G.once('c7:corrQuiet')) { await G.wait(1.4); await G.think('Just a corridor. [beat] Just a hospital.'); }
    },
  });

  // ---- the Fog-world corridor: dim, lino, handrails, fire doors held open, the side rooms locked --------------------
  function C7_hospCorridor(K) {
    const H = CO.H;
    // fire door leaves held back flat against the partitions by magnets
    const leaf = { tex: 'wood', color: '#a8906a' };
    K.box(16.87, 0.02, 0.95, 0.05, 2.14, 0.66, leaf); K.box(16.87, 0.02, 3.05, 0.05, 2.14, 0.66, leaf);
    K.box(22.95, 0.02, -10.87, 0.66, 2.14, 0.05, leaf); K.box(25.05, 0.02, -10.87, 0.66, 2.14, 0.05, leaf);
    for (const [x, z] of [[16.87, 0.66], [16.87, 3.34], [22.66, -10.87], [25.34, -10.87]]) K.box(x, 1.9, z, 0.08, 0.08, 0.08, { tex: 'metal', color: '#6a6e6c' });
    // the side rooms, locked
    K.door({ id: 'c7_corridor:b1', x: 10, z: 4, rot: 0, w: 1.0, style: 'wood', locked: true, lockMsg: 'It\'s locked.', sign: 'OUTPATIENTS 2' });
    K.door({ id: 'c7_corridor:b2s', x: 14.5, z: 0, rot: 0, w: 1.0, style: 'wood', locked: true, lockMsg: 'It\'s locked.', sign: 'RADIOLOGY' });
    K.door({ id: 'c7_corridor:b2e', x: 22, z: -4, rot: 90, w: 1.0, style: 'wood', locked: true, lockMsg: 'It\'s locked.', sign: 'RADIOLOGY' });
    K.door({ id: 'c7_corridor:b3s', x: 26, z: -6.5, rot: 90, w: 1.0, style: 'wood', locked: true, lockMsg: 'It\'s locked.', sign: 'PATHOLOGY' });
    K.door({ id: 'c7_corridor:b3n', x: 26, z: -15.5, rot: 90, w: 1.0, style: 'wood', locked: true, lockMsg: 'The handle won\'t turn.', sign: 'PATHOLOGY' });
    // behind the glass: dark rooms with a few shapes
    for (let i = 0; i < 4; i++) K.prop('chair', 8.2 + i * 0.6, 8.6, 0, { variant: 'waiting', color: '#3d5160' });
    K.prop('hospital_bed', 18, -3.5, 90, { empty: false, chart: false });
    K.prop('shelf', 31.5, -11, -90, { len: 3, h: 1.9, load: 'boxes' });
    // hanging direction signs
    const hang = (x, z, rot, text, key) => { K.box(x, H - 0.35, z, rot ? 0.03 : 1.3, 0.35, rot ? 1.3 : 0.03, { color: '#1d5d78', roughness: 0.5 }); K.plane(x + (rot ? 0.02 : 0), H - 0.175, z + (rot ? 0 : 0.02), 1.26, 0.3, plate(key, text, { bg: '#1d5d78', w: 512, h: 128, size: 46, age: 0.3 }), { rotY: rot ? 90 : 0 }); K.plane(x - (rot ? 0.02 : 0), H - 0.175, z - (rot ? 0 : 0.02), 1.26, 0.3, plate(key, text, { bg: '#1d5d78', w: 512, h: 128, size: 46, age: 0.3 }), { rotY: rot ? -90 : 180 }); for (const d of [-0.5, 0.5]) K.cyl(x + (rot ? 0 : d), H - 0.35, z + (rot ? d : 0), 0.008, 0.35, { tex: 'metal', color: '#9aa09c' }); };
    hang(6, 2, 90, 'WARD 3  →', 'w3a');
    hang(24, -8, 0, 'WARD 3  ↑', 'w3b');
    hang(14, -20, 90, '←  WARD 3', 'w3c');
    // dressing: parked beds, wheelchairs, an IV stand, a linen trolley, the cleaner's cart, a water fountain
    K.prop('hospital_bed', 3.4, 3.4, 90, { empty: true, chart: false, phone: flag('c7_luke'), name: flag('c7_luke') ? 'c7co:phonebed' : undefined });
    K.prop('wheelchair', 15.6, 3.3, 200, {});
    K.prop('iv_stand', 20.4, 0.5, 0, {});
    K.box(25.3, 0, -1.6, 0.6, 1.1, 1.2, { tex: 'metal', color: '#b8bcb8' }, { collide: true });
    K.box(25.3, 1.1, -1.6, 0.62, 0.05, 1.22, { color: '#e8e4d8', roughness: 0.9 });
    K.prop('mop_bucket', 22.6, -16.4, 30, {});
    K.prop('wet_floor_sign', 23.3, -15.6, 10, {});
    K.prop('hospital_bed', 25.4, -19.0, 0, { empty: true, chart: false });
    K.prop('wheelchair', 12.2, -21.4, 170, {});
    K.prop('iv_stand', 4.5, -18.5, 0, { bag: false });
    K.box(8.5, 0, -21.72, 0.5, 0.95, 0.35, { tex: 'metal', color: '#c8ccc8' }, { collide: true });
    K.prop('notice_board', 8.0, 0.08, 0, { title: 'VISITORS', w: 1.0, h: 0.7, mount: 1.55 });
    K.prop('poster', 20.0, -17.92, 0, { style: 'notice', text: 'VISITING HOURS\n10am to 8pm. Two visitors per bed. Please be quiet — patients are resting.', mount: 1.55 });
    K.prop('extinguisher', 25.92, 2.5, -90, { variant: 'wall' });
    K.prop('exit_sign', 0.1, 2, 90, { mount: 2.45 });
    K.box(21.9, 1.3, -1.2, 0.08, 0.26, 0.14, { color: '#e8eef0', roughness: 0.3 });
    K.writing('FOLLOW UP TOMORROW', 21.9, 1.6, -9.2, 2.6, { rotY: 90, world: 'fog' });
    K.prop('water_stain', 9.5, 2.2, 0, { surface: 'ceiling', ceil: H });
    K.prop('water_stain', 24.2, -14, 0, { surface: 'ceiling', ceil: H });
    K.dress('papers', [1, 0.3, 25, 3.7], 10, { seed: 741 });
    K.dress('papers', [22.3, -17.5, 25.7, -0.5], 6, { seed: 742 });
    K.dress('papers', [1, -21.7, 25, -18.3], 8, { seed: 743 });
    // light: most tubes dead; five still working down the U
    const T = [[2, 2, 90], [6, 2, 90], [10, 2, 90], [14, 2, 90], [19.6, 2, 90], [24, 2, 0], [24, -3.5, 0], [24, -7.5, 0], [24, -14, 0], [24, -20, 0], [20, -20, 90], [16, -20, 90], [12, -20, 90], [8, -20, 90], [4, -20, 90]];
    tubes(K, T, { lit: (i) => [1, 4, 7, 9, 11, 14].includes(i), real: [1, 4, 7, 9, 11, 14], flicker: [7], h: H - 0.02 });
    // ---- examine ----------------------------------------------------------------------------------------------------
    K.examine(6, 2.3, 2, 'Ward 3. [beat] Round the corner, and round again.', { id: 'c7co:sign', r: 2.2 });
    K.examine(3.4, 0.9, 3.4, flag('c7_luke') ? ['A phone on the pillow. The screen\'s still lit.', 'NO SERVICE. [beat] Somebody left it behind. Or put it there for me.'] : ['A bed parked against the wall. The sheets are tucked so tight you could bounce a coin off them.', 'Somebody made this bed for someone who isn\'t coming.'], { id: 'c7co:bed', r: 1.5 });
    K.examine(15.6, 0.8, 3.3, 'A wheelchair with a blanket folded on the seat. Folded carefully.', { id: 'c7co:wheelchair', r: 1.3 });
    K.examine(20.4, 1.3, 0.5, 'An IV stand. The bag\'s empty and dry.', { id: 'c7co:iv', r: 1.2 });
    K.examine(17.0, 2.0, 0.5, 'The fire doors are held open by magnets. If the power goes, they close.', { id: 'c7co:magnets', r: 1.3 });
    K.examine(21.9, 1.4, -1.2, 'Hand gel. Empty. I press it anyway.', { id: 'c7co:gel', r: 1.0 });
    K.examine(21.9, 1.6, -9.2, ['"Follow up tomorrow."', 'That\'s my handwriting. [beat] That\'s how I write my Fs.'], { id: 'c7co:writing', r: 2.0 });
    K.examine(8.0, 1.6, 0.3, '"Visitors: please use the hand gel." Somebody\'s drawn a smiley face in the O.', { id: 'c7co:notice', r: 1.4 });
    K.examine(22.9, 0.7, -16.0, 'A mop in a bucket. The water\'s grey and still warm.', { id: 'c7co:mop', r: 1.3 });
    K.examine(25.3, 1.2, -1.6, 'A linen trolley. Clean sheets, folded into squares. Nobody to put them on.', { id: 'c7co:linen', r: 1.3 });
    K.examine(8.5, 1.1, -21.5, 'A drinking fountain. It gurgles when I lean over it, then nothing comes.', { id: 'c7co:fountain', r: 1.2 });
    K.examine(10, 1.5, 3.7, 'Outpatients 2, through the glass. Chairs in a row, facing a wall.', { id: 'c7co:b1', r: 1.8 });
    K.examine(19, 1.5, 0.3, 'Radiology. A bed in there, made up, under a dead light.', { id: 'c7co:b2', r: 1.8 });
    K.examine(25.7, 1.5, -11, 'Pathology. Shelves of boxes behind the glass.', { id: 'c7co:b3', r: 1.8 });
    // CUTSCENE 7-1 — a few steps in, the corridor changes
    K.trigger([3.3, 0, 5.2, 4], (G) => G.cutscene('7-1'), { id: 'c7_corridor:71', when: () => !flag('c7_s71') && !flag('c7_luke') });
  }

  // ---- Luke's world: the Smile store ---------------------------------------------------------------------------------
  function C7_storeCorridor(K) {
    const H = CO.H;
    K.ambient('#e2f2ef', 1.35);
    // the front counter by the door from reception
    K.prop('counter', 2.7, 3.55, 180, { len: 3.0, variant: 'store', clutter: true });
    K.plane(2.7, 2.3, 3.9, 2.6, 0.5, storeTex('front', 'FRONT COUNTER', { w: 512, h: 96, size: 36 }), { rotY: 180, emissive: 0.5 });
    K.plane(0.1, 2.55, 2, 1.1, 0.3, storeTex('welcome', 'WELCOME IN!', { w: 512, h: 128, size: 50, logo: false }), { rotY: 90 });
    K.plane(2.7, 0.7, 3.2, 1.3, 0.14, plate('pleasewait', 'PLEASE WAIT HERE', { bg: '#ffcc00', fg: '#1b2626', w: 512, h: 64, size: 34, age: 0 }), { rotY: 180 });
    // the beds down the middle, like demo tables: a phone on every pillow, a price card at every foot
    const bed = (x, z, rot, key) => {
      K.prop('hospital_bed', x, z, rot, { phone: true, empty: false, chart: false });
      const f = V3(Math.sin(rot * D2R), 0, Math.cos(rot * D2R));
      K.box(x + f.x * 1.25, 0, z + f.z * 1.25, 0.05, 1.0, 0.05, { tex: 'metal', color: '#d8dad6' });
      K.plane(x + f.x * 1.25, 1.12, z + f.z * 1.25, 0.34, 0.25, priceTex('bed', 'RECOVERY BUNDLE', '$0', 'upfront* on a 36 mth plan'), { rotY: rot, emissive: 0.25 });
    };
    coBeds.bl.forEach((x, i) => bed(x, 2, i % 2 ? 90 : -90, 'bl' + i));
    coBeds.rl.forEach((z, i) => bed(24, z, i % 2 ? 0 : 180, 'rl' + i));
    coBeds.tl.forEach((x, i) => bed(x, -20, i % 2 ? 90 : -90, 'tl' + i));
    // security gates at the fire doorways and the bay doors (the store's front door, many times over)
    const gate = (x, z, alongX) => { for (const s of [-0.82, 0.82]) { const gx = x + (alongX ? s : 0), gz = z + (alongX ? 0 : s); K.box(gx, 0, gz, alongX ? 0.1 : 0.34, 1.55, alongX ? 0.34 : 0.1, { color: '#eef2ef', roughness: 0.3 }, { collide: true }); K.box(gx, 1.3, gz, alongX ? 0.11 : 0.35, 0.05, alongX ? 0.35 : 0.11, { color: '#19c8c0', emissive: '#19c8c0', emissiveIntensity: 0.8, roughness: 0.3 }); } };
    gate(17.35, 2, false); gate(16.65, 2, false); gate(24, -10.65, true); gate(24, -11.35, true);
    // banners hung across the legs
    const banner = (x, z, rot, text, key) => { for (const [r, o] of [[rot, 0.012], [rot + 180, -0.012]]) K.plane(x + Math.sin(rot * D2R) * o, H - 0.36, z + Math.cos(rot * D2R) * o, 2.8, 0.44, storeTex(key, text, { w: 768, h: 140, size: 58, logo: false }), { rotY: r }); for (const d of [-1.3, 1.3]) K.cyl(x + Math.cos(rot * D2R) * d, H - 0.2, z - Math.sin(rot * D2R) * d, 0.006, 0.2, { tex: 'metal', color: '#c8ccc8' }); };
    banner(9.5, 2, 90, 'HI THERE!', 'hi');
    banner(24, -5.5, 0, 'WHAT BRINGS YOU IN TODAY?', 'what');
    banner(15, -20, 90, "WE'RE HERE TO HELP", 'help');
    // the bays: Bay 1 PLANS, Bay 2 ACCESSORIES, Bay 3 BUNDLES
    K.plane(10, 2.45, 4.1, 1.8, 0.34, storeTex('bay1', 'BAY 1 — PLANS', { w: 512, h: 96, size: 38, logo: false }), { emissive: 0.4 });
    K.plane(14.5, 2.45, -0.1, 1.8, 0.34, storeTex('bay2', 'BAY 2 — ACCESSORIES', { w: 512, h: 96, size: 34, logo: false }), { rotY: 180, emissive: 0.4 });
    K.plane(21.9, 2.45, -4, 1.8, 0.34, storeTex('bay2', 'BAY 2 — ACCESSORIES', { w: 512, h: 96, size: 34, logo: false }), { rotY: -90, emissive: 0.4 });
    K.plane(26.1, 2.45, -6.5, 1.8, 0.34, storeTex('bay3', 'BAY 3 — BUNDLES', { w: 512, h: 96, size: 38, logo: false }), { rotY: 90, emissive: 0.4 });
    K.plane(26.1, 2.45, -15.5, 1.8, 0.34, storeTex('bay3', 'BAY 3 — BUNDLES', { w: 512, h: 96, size: 38, logo: false }), { rotY: 90, emissive: 0.4 });
    // Bay 1 (dead end): plan posters, a demo table, a standee with AIDAN on its badge
    K.prop('demo_table', 10, 7.4, 0, { n: 6, lit: true, time: '8:59' });
    for (const [x, t] of [[7.9, 'SWITCH & SAVE'], [10, 'STAY CONNECTED'], [12.1, 'MORE GB. MORE YOU.']]) K.prop('poster', x, 9.92, 180, { style: 'plan', text: t, mount: 1.55, w: 0.7, h: 1.0 });
    K.box(7.6, 0, 5.2, 0.5, 1.78, 0.03, { color: '#dfe6e4', roughness: 0.6 }, { rot: 70 });
    K.plane(7.62, 0.95, 5.22, 0.5, 1.7, cardTex('standee', ['', '', '', '', 'AIDAN', 'Here to help!'], { bg: '#19a3a0', ink: '#ffffff', w: 128, h: 384, size: 18, age: 0 }), { rotY: 70 });
    // Bay 2 (through to the second leg): accessory walls, a table of cases; a pendant alarm on a hook
    K.prop('accessory_wall', 18, -6.6, 0, { len: 3.6 });
    K.prop('accessory_wall', 21.7, -5.9, -90, { len: 2.0 });
    K.prop('demo_table', 18.2, -3.2, 0, { n: 4, lit: true, len: 1.4 });
    K.box(19.8, 1.35, -6.72, 0.1, 0.16, 0.02, { color: '#e8e6e0', roughness: 0.4 });
    K.sphere(19.8, 1.3, -6.7, 0.025, { color: '#b3261e' });
    // Bay 3 (round F2): white plinths with tablets, bundles stacked, a returns cage in the corner
    for (const [x, z] of [[27.6, -8], [30.2, -9.6], [27.6, -11.6], [30.2, -13.4]]) { K.prop('plinth', x, z, 0, { h: 1.0, lit: true }); K.prop('tablet_box', x, z, 20, { y: 1.02 }); }
    K.prop('box_stack', 31.2, -6, 0, { n: 5 });
    // leftovers of the hospital under the store: an IV stand with a price tag, a wheelchair with a SALE sticker
    K.prop('iv_stand', 20.6, 0.55, 0, {});
    K.box(20.6, 1.25, 0.62, 0.12, 0.08, 0.005, { color: '#ffcc00', roughness: 0.5 });
    K.prop('wheelchair', 25.3, -19.0, 180, {});
    K.box(25.3, 0.55, -19.3, 0.2, 0.12, 0.01, { color: '#b3261e', roughness: 0.5 });
    // light: every tube on, clinical white; a handful of them real
    const T = [[2, 2, 90], [6, 2, 90], [10, 2, 90], [14, 2, 90], [19.6, 2, 90], [24, 2, 0], [24, -3.5, 0], [24, -7.5, 0], [24, -14, 0], [24, -20, 0], [20, -20, 90], [16, -20, 90], [12, -20, 90], [8, -20, 90], [4, -20, 90], [10, 7, 90], [18, -3.5, 90], [29, -11, 0]];
    tubes(K, T, { lit: true, real: [1, 3, 6, 8, 12, 16], h: H - 0.02 });   // (6 real + the two lit fittings in the bays: the 8-light pool)
    // ---- examine --------------------------------------------------------------------------------------------------------
    K.examine(5.4, 1.0, 1.0, ['A phone on every pillow. All the same lock screen. [beat] 8:59.', 'One minute before open.'], { id: 'c7st:phones', r: 1.4 });
    K.examine(6.65, 1.1, 2, ['"The Recovery Bundle. Zero dollars upfront."', 'Upfront.'], { id: 'c7st:price', r: 1.0 });
    K.examine(2.7, 1.2, 3.0, ['"Front counter. Please wait here."', 'Nobody comes. [beat] Somebody always comes.'], { id: 'c7st:counter', r: 1.4 });
    K.examine(9.5, 2.3, 2, '"Hi there!" In letters as tall as I am.', { id: 'c7st:banner', r: 2.4 });
    K.examine(17.35, 1.2, 2.9, ['Security gates. Like the ones at the store\'s front door.', 'They beep when you walk out with something you haven\'t paid for.'], { id: 'c7st:gate', r: 1.1 });
    K.examine(7.6, 1.2, 5.2, ['A cardboard cut-out. A smiling rep, thumbs up.', 'The badge says AIDAN. [beat] They all say AIDAN.'], { id: 'c7st:standee', r: 1.3 });
    K.examine(10, 1.1, 7.0, 'Demo phones on their tethers. Every one of them says NO SERVICE.', { id: 'c7st:demo', r: 1.5 });
    K.examine(19.8, 1.35, -6.4, ['A medical alarm pendant on a hook. $49.95.', 'Compatible with most home phone services. [beat] Most.'], { id: 'c7st:pendant', r: 1.1 });
    K.examine(20.6, 1.3, 0.8, 'An IV stand with a price tag on it. "Ask about our payment plans."', { id: 'c7st:iv', r: 1.2 });
    K.examine(29, 1.2, -11, ['Tablets on plinths, still sealed.', 'She had one of these. [beat] She never opened it.'], { id: 'c7st:tablets', r: 1.8 });
    K.examine(24, 2.3, -5.5, '"What brings you in today?" [beat] I don\'t know anymore.', { id: 'c7st:what', r: 2.4 });
    // the empty corner (north-east) and the one who steps into it
    K.trigger([21.7, -18.3, 26, -17.4], (G) => C7_cornerStep(G), { id: 'c7_corridor:ne', when: () => flag('c7_store') && !(C7.pageUntil > now()) });
  }
  // cuts to an empty corner before a Smile steps into it (spec §7B)
  async function C7_cornerStep(G) {
    const e = G.enemy('c7_corridor:s3');
    if (!e || e.removed || !Player.pos) return;
    if (Math.hypot(e.pos.x - 24, e.pos.z + 20) < 5.5 || Math.hypot(e.pos.x - Player.pos.x, e.pos.z - Player.pos.z) < 6) return;
    const D = e.data;
    D.scripted = true;
    e.pos.set(18.6, 0, -21.1); e.yaw = 90 * D2R; D.state = 'patrol';
    await G.wait(1.3);
    D.scripted = false;
    D.state = 'approach'; D.lostT = 0;
    smileSay(e, 0, true);
  }

  // =================================================================================================================
  // 7D THE NURSES' STATION — 8 × 6 m at the far end of the U. The corridor door on the east wall; three doors into
  // Ward 3 on the north wall (a double door between two singles); the station desk across the middle with the PA
  // microphone ("Patient paging."), the energy drink and a coffee. In the store a Smile stands in each Ward 3 door.
  // =================================================================================================================
  const NU = { W: 8, D: 6, H: 2.9, doors: [[1.6, 1.0], [4.0, 1.4], [6.4, 1.0]], mic: [2.3, 3.28] };
  const pageCardText = () => {
    const lv = (S.difficulty && S.difficulty.riddle) || 'normal';
    return lv === 'easy' ? ['PAGING STAFF', 'Press TALK and ask for', 'them by name. They will', 'come to the front counter.'] : lv === 'hard' ? null : ['PAGING', 'Press TALK.', 'Speak clearly.'];
  };
  defineRoom({
    id: 'c7_nurses', name: 'NURSES\' STATION', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino',
    get ambient() { return store() ? 'store' : 'hospital'; },
    get fog() { return store() ? { density: 0.014, color: '#26302e' } : HW.fog; },
    get grade() { return store() ? 'hospital' : undefined; },
    get surfaces() { return store() ? [{ box: [-1, -2, 9, 7], s: 'vinyl' }] : []; },
    bounds: [0, -0.7, 8, 6],
    entries: { corridor: [7.0, 3.5, -90], ward: [4.0, 0.95, 0], start: [7.0, 3.5, -90] },
    cameras: [
      // high over the desk from behind the staff side (the south wall cut away): the three doors, square on
      { id: 'c7_nurses:desk', vol: [0, -0.7, 5.6, 6], type: 'static', pos: [4.0, 2.78, 10.3], target: [4.0, 0.5, 1.4], fov: 'fit' },
      // the CCTV corner over the Ward 3 doors, down at the corridor door and the desk's end
      { id: 'c7_nurses:door', vol: [5.6, -0.7, 8, 6], pri: 1, type: 'static', pos: [0.35, 2.72, 0.35], target: [6.8, 0.5, 3.9], fov: 'fit' },
    ],
    spawns: [
      { id: 'c7_nurses:d1', type: 'c7_smile', seed: 81, pos: [1.6, 0.15], rot: 0, post: [1.6, 0.15, 0], colR: 0.44, when: () => flag('c7_store') && !(C7.pageUntil > now()) },
      { id: 'c7_nurses:d2', type: 'c7_smile', seed: 82, pos: [4.0, 0.15], rot: 0, post: [4.0, 0.15, 0], colR: 0.52, when: () => flag('c7_store') && !(C7.pageUntil > now()) },
      { id: 'c7_nurses:d3', type: 'c7_smile', seed: 83, pos: [6.4, 0.15], rot: 0, post: [6.4, 0.15, 0], colR: 0.44, when: () => flag('c7_store') && !(C7.pageUntil > now()) },
    ],
    build(K) {
      const st = store(), H = NU.H;
      const hw = (x0, z0, x1, z1, o = {}) => hwall(K, x0, z0, x1, z1, H, { store: st, ...o });
      K.floor(0, -0.7, NU.W, NU.D, st ? HW.sfloor : HW.floor);
      K.ceiling(0, 0, NU.W, NU.D, H, st ? { color: '#f2f4f2', roughness: 0.6 } : HW.ceil);
      hw(-0.08, 0, NU.W + 0.08, 0, { openings: NU.doors.map(([x, w]) => ({ at: x + 0.08, w, h: 2.2 })) });
      hw(NU.W, -0.08, NU.W, NU.D + 0.08, { openings: [{ at: 3.58, w: 1.2, h: 2.2 }] });
      hw(NU.W + 0.08, NU.D, -0.08, NU.D, { both: false, dado: false });
      hw(0, NU.D + 0.08, 0, -0.08);
      annex(K, 0, NU.D, NU.W, 10.6, H, ['w', 'e', 's']);
      K.door({ id: 'c7_nurses:corridor', x: NU.W, z: 3.5, rot: 90, w: 1.2, h: 2.2, style: 'fire', to: 'c7_corridor', entry: 'nurses' });
      // the Ward 3 doors: open doorways onto the dark ward, the leaves propped back; walking through = Ward 3
      K.collider(0, -0.75, NU.W, -0.7, { h: 2.5 });
      for (const [x, w] of NU.doors) {
        K.box(x, 0, -1.25, w + 0.2, 2.3, 0.1, { color: '#0d1110', roughness: 1 }, { shadow: false });
        K.exit({ id: 'c7_nurses:ward' + x, box: [x - w / 2 + 0.05, -0.7, x + w / 2 - 0.05, -0.32], to: 'c7_ward3', entry: 'nurses', sound: 'door', blockedMsg: 'Not that way.' });
        K.box(x, 2.2, 0, w + 0.14, 0.08, 0.2, st ? HW.swhite : { tex: 'metal', color: '#9aa09c' });
      }
      K.plane(4.0, 2.55, 0.1, 1.9, 0.34, st ? storeTex('ward3s', 'WARD 3', { w: 512, h: 96, size: 48, logo: false }) : plate('ward3', 'WARD 3 — ORTHOPAEDICS', { bg: '#1d5d78', w: 768, h: 128, size: 50, age: 0.3 }), { emissive: st ? 0.5 : undefined });
      // the station desk across the middle: the counter faces the ward doors, the staff side behind it
      K.prop('counter', 3.2, 3.55, 0, { len: 3.6, variant: st ? 'store' : 'hospital', clutter: false });
      K.box(5.35, 0, 4.55, 0.66, 1.0, 2.2, st ? { color: BR.teal, roughness: 0.45 } : { color: '#dcdcd4', roughness: 0.5 }, { collide: true });
      K.box(5.35, 0.97, 4.55, 0.72, 0.04, 2.24, { color: '#ecebe6', roughness: 0.4 });
      K.prop('pa_mic', NU.mic[0], NU.mic[1], 180, { y: 1.0 });
      const card = pageCardText();
      if (card) K.plane(NU.mic[0] + 0.3, 1.005, NU.mic[1] - 0.02, 0.2, 0.13, cardTex('page|' + card.length, card, { bg: '#eef4f2', size: card.length > 3 ? 14 : 18, w: 256, h: 160, age: 0.3 }), { rot: [-90, 180, 0] });
      K.prop('monitor', 3.6, 3.75, 180, { y: 1.0, content: st ? 'desktop' : 'off' });
      K.prop('desk_phone', 4.4, 3.72, 200, { y: 1.0 });
      K.prop('office_chair', 3.2, 4.6, 10, {});
      K.prop('office_chair', 1.6, 4.5, -30, {});
      K.pickup('energy_drink', 1.2, 1.0, 3.4, { id: 'c7_nurses:energy', rot: 30 });
      K.pickup('coffee', 5.4, 1.01, 5.0, { id: 'c7_nurses:coffee', rot: 70 });
      // behind the desk: the bed board, the medication trolley, the charts
      K.prop('whiteboard', 2.6, NU.D - 0.08, 180, { text: st ? 'TODAY\'S TARGET: 12\nACHIEVED: 12  ✓\nEVERY CUSTOMER\nLEAVES WITH A PLAN' : 'WARD 3 — BEDS\n1 —   2 —   3 —   4 —\n5 —   6 —   7 —   8 —\n9 —  10 —  11 —  12 ?', mount: 1.6, w: 1.6, h: 1.0 });
      K.box(0.55, 0, 5.3, 0.6, 1.0, 0.45, { tex: 'metal', color: '#c8ccc8' }, { collide: true });
      for (let i = 0; i < 4; i++) K.box(0.55, 0.2 + i * 0.2, 5.55, 0.54, 0.16, 0.02, { color: ['#5a8ab0', '#b35a5a', '#5ab07a', '#d8c85a'][i], roughness: 0.6 });
      K.prop('filing_cabinet', 7.55, 5.55, -90, { n: 4 });
      K.prop('clock', 0.08, 2.5, 90, { mount: 2.3, time: [3, 52] });
      K.prop('notice_board', 0.08, 1.2, 90, { title: st ? 'THIS MONTH\'S STARS' : 'WARD NOTICES', w: 0.9, h: 0.7, mount: 1.55 });
      K.box(7.9, 1.3, 1.6, 0.08, 0.26, 0.14, { color: '#e8eef0', roughness: 0.3 });
      K.sign('CALL, DON\'T FALL', 7.91, 1.9, 1.6, 0.7, 0.34, { style: 'hospital', rotY: -90 });
      if (st) {
        K.ambient('#e2f2ef', 1.3);
        K.plane(3.2, 2.45, NU.D - 0.1, 2.6, 0.42, storeTex('cs', 'CUSTOMER SERVICE', { w: 768, h: 128, size: 50 }), { rotY: 180, emissive: 0.5 });
        for (const [x, w] of NU.doors) for (const s of [-1, 1]) { K.box(x + s * (w / 2 + 0.15), 0, 0.35, 0.1, 1.55, 0.34, { color: '#eef2ef', roughness: 0.3 }, { collide: true }); K.box(x + s * (w / 2 + 0.15), 1.3, 0.35, 0.11, 0.05, 0.35, { color: '#19c8c0', emissive: '#19c8c0', emissiveIntensity: 0.8 }); }
        tubes(K, [[2, 1.6, 90], [6, 1.6, 90], [2, 4.6, 90], [6, 4.6, 90]], { lit: true, real: [0, 1, 3], h: H - 0.02 });
      } else {
        tubes(K, [[2, 1.6, 90], [6, 1.6, 90], [2, 4.6, 90], [6, 4.6, 90]], { lit: (i) => i === 2, real: [2], flicker: [2], h: H - 0.02 });
        K.light('lamp', 3.0, 1.25, 3.7, { color: '#ffcf8a', intensity: 1.4, distance: 3.5 });
        K.writing('ASK THEM', 7.92, 1.5, 4.8, 1.2, { rotY: -90, world: 'fog' });
      }
      // ---- the PA ------------------------------------------------------------------------------------------------------
      K.interact(NU.mic[0], 1.2, NU.mic[1] - 0.45, (G) => C7_paMic(G), { id: 'c7_nurses:pa', r: 1.2 });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(2.6, 1.6, NU.D - 0.3, st ? ['"Today\'s target: twelve. Achieved: twelve."', '"Every customer leaves with a plan."'] : ['The bed board. Every bed a dash.', 'Twelve has a question mark next to it.'], { id: 'c7nu:board', r: 1.6 });
      K.examine(7.6, 1.8, 1.6, ['"Call, don\'t fall."', 'She couldn\'t call. [beat] That was the whole point of the pendant.'], { id: 'c7nu:callsign', r: 1.4 });
      K.examine(0.55, 1.1, 5.3, 'The medication trolley. Every drawer labelled. Every drawer locked.', { id: 'c7nu:trolley', r: 1.2 });
      K.examine(0.3, 2.2, 2.5, 'Eight minutes to four.', { id: 'c7nu:clock', r: 1.6 });
      K.examine(4.4, 1.2, 3.5, 'The phone on the desk. A red light: one message. [beat] I leave it.', { id: 'c7nu:phone', r: 1.0 });
      K.examine(0.3, 1.5, 1.2, st ? '"This month\'s stars." Every photo is the same smile.' : '"Handover at seven." Somebody\'s drawn a little clock with a sad face.', { id: 'c7nu:notices', r: 1.3 });
      if (!st) K.examine(4.0, 1.4, -0.3, ['Ward 3. Orthopaedics.', 'She\'s in there. [beat] Room twelve.'], { id: 'c7nu:ward', r: 1.8 });
    },
    onUpdate() { C7_trackDoors('c7_nurses'); C7_nursesReturn(); },
    async onEnter(G, from) {
      C7_enterDoors('c7_nurses', from);
      if (store()) {
        G.bars('noservice', { room: true });
        if (C7.pageUntil > now()) C7.nuAway = true;
        if (G.once('c7:nurses1')) {
          await G.wait(1.2);
          await G.think('The doors to Ward 3. [beat] They\'re standing in them.');
          note(G, 'Ward 3. They\'re standing in the doors.', 'c7_goal');
        }
        return;
      }
      G.bars(null);
    },
  });
  // the page is over: the three come back through the corridor door to their doors
  function C7_nursesReturn() {
    if (!C7.nuAway || C7.pageUntil > now() || !store() || busy()) return;
    C7.nuAway = false;
    for (const id of ['c7_nurses:d1', 'c7_nurses:d2', 'c7_nurses:d3']) {
      if (Enemies.get(id)) continue;
      const def = (SPAWNS.c7_nurses || []).find((s) => s.id === id);
      if (!def) continue;
      const e = Enemies.spawn({ ...def, pos: [7.4, 3.5], rot: -90, when: undefined });
      if (e) { e.data.state = 'return'; e.pos.set(7.4, e.pos.y, 3.5); e.yaw = -90 * D2R; }
    }
  }
  // the PA microphone: EXAMINE "Patient paging." — then use it
  async function C7_paMic(G) {
    await G.think('Patient paging.');
    if (!store()) return;
    const c = await G.choice(['YES', 'NO'], { title: 'Use the microphone?', cancel: 1, def: 1, caps: true });
    if (c !== 0) return;
    await G.cutscene('7-page');
  }

  // =================================================================================================================
  // 7E WARD 3 — a corridor 30 × 3 m running north from the nurses' station; rooms either side, all locked; Room 12's
  // door at the north end, Luke's plastic chair beside it. The Fog world again, dim. CUTSCENE 7-2 "Three Times".
  // =================================================================================================================
  const W3 = { W: 3, L: 30, H: 2.8, chair: [2.5, -28.1], door12: [1.5, -30] };
  defineRoom({
    id: 'c7_ward3', name: 'WARD 3', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino', ambient: 'hospital',
    fog: { density: 0.03, color: '#323b39' },
    bounds: [0, -30, 3, 0],
    entries: { nurses: [1.5, -1.3, 180], room12: [1.5, -28.8, 0], start: [1.5, -1.3, 180] },
    cameras: [
      // the long symmetrical shot: from the ward doors, down the whole corridor to Room 12
      { id: 'c7_ward3:long', vol: [0, -30, 3, -4.6], type: 'static', pos: [1.5, 2.3, -0.35], target: [1.5, 1.05, -29.5], fov: 'fit' },
      // the ward doors, from a third of the way down
      { id: 'c7_ward3:doors', vol: [0, -4.8, 3, 0], type: 'pan', pos: [1.5, 2.45, -10.5], target: [1.5, 0.9, -1.0], fov: 44, pan: { lag: 0.3, yaw: 22, pitch: 26 } },
      // Room 12's door and the chair, from the west wall a few doors down
      { id: 'c7_ward3:end', vol: [0, -30, 3, -22.5], pri: 1, type: 'static', pos: [0.35, 2.45, -17.6], target: [2.0, 0.85, -27.9], fov: 'fit' },
    ],
    build(K) {
      const H = W3.H;
      K.floor(0, -W3.L, W3.W, 0, HW.floor);
      K.ceiling(0, -W3.L, W3.W, 0, H, HW.ceil);
      // west rooms 1, 3, 5, 7, 9, 11; east rooms 2, 4, 6, 8, 10
      const west = [[-3.5, 1], [-8.5, 3], [-13.5, 5], [-18.5, 7], [-23.5, 9], [-27.2, 11]], east = [[-5.5, 2], [-10.5, 4], [-15.5, 6], [-20.5, 8], [-25.0, 10]];
      hwall(K, 0, 0.08, 0, -W3.L - 0.08, H, { openings: west.map(([z]) => ({ at: -z + 0.08, w: 0.95, h: 2.1 })) });
      hwall(K, W3.W, -W3.L - 0.08, W3.W, 0.08, H, { openings: east.map(([z]) => ({ at: z + W3.L + 0.08, w: 0.95, h: 2.1 })) });
      hwall(K, -0.08, -W3.L, W3.W + 0.08, -W3.L, H, { openings: [{ at: 1.58, w: 1.0, h: 2.1 }] });
      hwall(K, W3.W + 0.08, 0, -0.08, 0, H, { openings: [{ at: 1.58, w: 1.4, h: 2.2 }] });
      K.box(1.5, 0, 1.2, 2.2, 2.4, 0.1, { color: '#26302e', roughness: 1 }, { shadow: false });
      K.exit({ id: 'c7_ward3:nurses', box: [0.3, -0.38, 2.7, 0], to: 'c7_nurses', entry: 'ward', sound: 'door' });
      const lockMsgs = ['It\'s locked.', 'It\'s locked.', 'The handle won\'t turn.', 'It\'s locked.'];
      for (const [z, n] of west) {
        K.door({ id: 'c7_ward3:r' + n, x: 0, z, rot: 90, w: 0.95, style: 'fire', locked: true, lockMsg: lockMsgs[n % 4] });
        K.box(0.2, 0, z, 0.25, 2.1, 0.9, { color: '#0b0e0d', roughness: 1 }, { shadow: false });
        K.plane(0.09, 1.55, z - 0.72, 0.16, 0.16, plate('rn' + n, String(n), { bg: '#1d5d78', w: 64, h: 64, size: 38, age: 0.2 }), { rotY: 90 });
      }
      for (const [z, n] of east) {
        K.door({ id: 'c7_ward3:r' + n, x: W3.W, z, rot: 90, w: 0.95, style: 'fire', locked: true, lockMsg: lockMsgs[n % 4] });
        K.plane(W3.W - 0.09, 1.55, z + 0.72, 0.16, 0.16, plate('rn' + n, String(n), { bg: '#1d5d78', w: 64, h: 64, size: 38, age: 0.2 }), { rotY: -90 });
      }
      // Room 12: the door at the north end, its number, the call light over it
      K.door({ id: 'c7_ward3:room12', x: W3.door12[0], z: W3.door12[1], rot: 0, w: 1.0, style: 'wood', to: 'c7_room12', entry: 'door', when: () => true });
      K.plane(2.3, 1.55, -W3.L + 0.09, 0.2, 0.2, plate('rn12', '12', { bg: '#1d5d78', w: 64, h: 64, size: 34, age: 0.2 }), {});
      K.box(1.5, 2.2, -W3.L + 0.08, 0.2, 0.08, 0.08, { color: '#e8e4d8', roughness: 0.5 });
      K.light('led', 1.5, 2.24, -W3.L + 0.13, { color: '#ff9a3a', blink: 2.2 });
      // Luke's plastic chair outside Room 12 (he sits in it until the standoff)
      K.prop('chair', W3.chair[0], W3.chair[1], -90, { variant: 'plastic', color: '#c9c3b2' });
      K.npc('luke', 'luke', W3.chair[0] - 0.04, W3.chair[1], -90, { anim: 'sit', when: () => !flag('c7_luke'), rig: { anim: 'sit', hold: { L: ['phone', { case: '#8a6f94', screen: false, pose: 'phone_look' }] } } });
      // dressing: WARD 3, "Call, don't fall", a hoist, a linen skip, a wheelchair, an IV stand
      K.plane(1.5, 2.45, -0.1, 1.6, 0.26, plate('w3in', 'WARD 3 — ORTHOPAEDICS', { bg: '#1d5d78', w: 512, h: 96, size: 38, age: 0.3 }), { rotY: 180 });
      K.sign('CALL, DON\'T FALL\nPress the button. We\'ll come.', W3.W - 0.02, 1.7, -8.0, 0.8, 0.5, { style: 'hospital', rotY: -90 });
      for (const [x, z] of [[0.55, -12.0], [0.55, -12.9]]) K.box(x, 0, z, 0.06, 1.9, 0.06, { tex: 'metal', color: '#b8bcb8' });
      K.box(0.55, 1.85, -12.45, 0.06, 0.06, 1.0, { tex: 'metal', color: '#b8bcb8' });
      K.box(0.55, 0, -12.45, 0.5, 0.06, 1.1, { tex: 'metal', color: '#8a8e8a' }, { collide: true, h: 1.9 });
      K.prop('wheelchair', 2.45, -17.4, 190, {});
      K.prop('iv_stand', 0.45, -21.0, 0, {});
      K.box(2.55, 0, -2.6, 0.6, 0.95, 0.7, { color: '#3a6a8a', roughness: 0.9 }, { collide: true });
      K.pickup('coffee', 2.5, 0.95, -2.5, { id: 'c7_ward3:coffee', extraOnEasy: true, rot: 25 });
      K.box(0.2, 1.3, -6.3, 0.08, 0.26, 0.14, { color: '#e8eef0', roughness: 0.3 });
      K.prop('water_stain', 1.5, -15, 0, { surface: 'ceiling', ceil: H });
      K.dress('papers', [0.3, -29, 2.7, -1], 6, { seed: 751 });
      K.writing('WHO ARE YOU TRYING TO REACH', 2.93, 1.55, -13.0, 3.0, { rotY: -90, world: 'fog' });
      // light: one tube halfway, one over Room 12; the rest dead
      tubes(K, [[1.5, -3, 0], [1.5, -9, 0], [1.5, -15, 0], [1.5, -21, 0], [1.5, -27.4, 0]], { lit: (i) => i === 2 || i === 4, real: [2, 4], h: H - 0.02 });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(W3.W - 0.3, 1.7, -8.0, ['"Call, don\'t fall. Press the button. We\'ll come."', 'She pressed it. [beat] Nobody came.'], { id: 'c7w3:sign', r: 1.4 });
      K.examine(0.6, 1.2, -12.45, 'A patient hoist, folded up against the wall. For lifting people who can\'t get up on their own.', { id: 'c7w3:hoist', r: 1.3 });
      K.examine(0.3, 1.5, -3.5, 'Room 1, through the little window. A bed, made. Nobody in it.', { id: 'c7w3:r1', r: 1.2 });
      K.examine(W3.W - 0.3, 1.5, -10.5, 'Room 4. The curtain\'s drawn round the bed. I don\'t look.', { id: 'c7w3:r4', r: 1.2 });
      K.examine(2.55, 0.9, -2.6, 'A linen skip. Somebody\'s sheets, balled up. Somebody went home. [beat] Or didn\'t.', { id: 'c7w3:linen', r: 1.2 });
      K.examine(W3.chair[0] - 0.3, 0.8, W3.chair[1], flag('c7_luke') ? ['His chair. It\'s still warm.', 'He sat here for days. [beat] Waiting for her. Waiting for me, maybe.'] : 'A plastic chair outside Room 12.', { id: 'c7w3:chair', r: 1.1, when: () => flag('c7_luke') });
      K.examine(1.5, 2.2, -W3.L + 0.3, 'The call light over Room 12. Blinking. [beat] Somebody\'s pressing it.', { id: 'c7w3:calllight', r: 1.8, when: () => flag('c7_standoff') && !flag('c7_room12') });
      K.examine(2.93, 1.5, -13.0, '"Who are you trying to reach." [beat] You know who.', { id: 'c7w3:writing', r: 1.6 });
      // CUTSCENE 7-2 — straight away, the first time in
      K.trigger([0, -3.2, 3, 0], (G) => C7_threeTimes(G), { id: 'c7_ward3:72', when: () => !flag('c7_luke') });
    },
    async onEnter(G, from) {
      G.bars(null);
      if (flag('c7_luke') && !flag('c7_room12') && flag('c7_standoff') && G.once('c7:w3back')) { await G.wait(1.2); await G.think('The chair\'s empty. [beat] Room twelve.'); }
    },
  });

  // =================================================================================================================
  // 7F ROOM 12 — 6 × 4 m: the bed (its head to the west wall) with the blanket turned back and her glasses on the
  // pillow; the bedside table and the beige phone; the window on the north wall toward the mast; the door (south).
  // =================================================================================================================
  const R12 = { W: 6, D: 4, H: 2.8, bed: [1.35, 2.05], phone: [0.4, 3.12], win: [3.5, 2.4] };
  const r12Lcd = (t) => ctex('r12lcd|' + t, 160, 40, (x, w, h) => {
    x.fillStyle = '#9aa88a'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (t) tx(x, t, w / 2, h * 0.66, h * 0.38, '#1e261c', { align: 'center', weight: 'bold', font: FN.mono });
  });
  defineRoom({
    id: 'c7_room12', name: 'ROOM 12', area: 'DISTRICT HOSPITAL', chapter: 7, outdoor: false, surface: 'lino', ambient: 'hospital',
    fog: { density: 0.022, color: '#323b39' },
    bounds: [0, 0, 6, 4],
    entries: { door: [1.2, 3.1, 180], start: [1.2, 3.1, 180] },
    cameras: [
      // from the doorway side (the south wall cut away): the bed, the window
      { id: 'c7_room12:door', vol: [2.0, 0, 6, 4], type: 'static', pos: [2.7, 2.35, 8.3], target: [2.2, 0.8, 1.3], fov: 'fit' },
      // the window corner, back at the door: the empty bed in the foreground
      { id: 'c7_room12:window', vol: [0, 0, 2.0, 4], pri: 1, type: 'static', pos: [5.75, 2.45, 0.3], target: [1.1, 0.7, 2.8], fov: 'fit' },
    ],
    build(K) {
      const H = R12.H;
      K.floor(0, 0, R12.W, R12.D, { tex: 'lino_hospital', color: '#94998e' });
      K.ceiling(0, 0, R12.W, R12.D, H, HW.ceil);
      hwall(K, -0.08, 0, R12.W + 0.08, 0, H, { openings: [{ at: R12.win[0] + 0.08, w: R12.win[1], h: 1.5, sill: 0.8, glass: true }], mat: { tex: 'plaster', color: '#c2c6b2' } });
      hwall(K, R12.W, -0.08, R12.W, R12.D + 0.08, H, { mat: { tex: 'plaster', color: '#c2c6b2' } });
      hwall(K, R12.W + 0.08, R12.D, -0.08, R12.D, H, { both: false, dado: false, openings: [{ at: R12.W - 1.2 + 0.08, w: 1.0, h: 2.1 }], mat: { tex: 'plaster', color: '#c2c6b2' } });
      hwall(K, 0, R12.D + 0.08, 0, -0.08, H, { mat: { tex: 'plaster', color: '#c2c6b2' } });
      annex(K, 0, R12.D, R12.W, 8.6, H, ['w', 'e', 's']);
      K.door({ id: 'c7_room12:door', x: 1.2, z: R12.D, rot: 0, w: 1.0, style: 'wood', to: 'c7_ward3', entry: 'room12' });
      // the view: the hill above the fog, the mast; its red light (fog-proof)
      const vm = new THREE.MeshBasicMaterial({ map: mastViewTex(), fog: false });
      const view = new THREE.Mesh(new THREE.PlaneGeometry(34, 17), vm); view.position.set(R12.win[0], -1.0, -13.5);
      K.mesh(view, { name: 'c7r12:view' });
      mastLight(K, R12.win[0] + 0.13 * 34, -1.0 + 0.43 * 17 + 0.35, -13.4, 1.1);
      // the bed: blanket turned back, her reading glasses folded on the pillow
      K.prop('hospital_bed', R12.bed[0], R12.bed[1], 90, { empty: true, glasses: true, chart: true });
      K.prop('bedside_table', R12.phone[0], R12.phone[1], 90, { items: true });
      K.prop('bedside_phone', R12.phone[0] + 0.02, R12.phone[1] + 0.04, 100, { y: 0.6, text: '', name: 'c7r12:phone' });
      K.prop('iv_stand', 0.5, 0.95, 0, { bag: false });
      // (the phone's own little display sits inside its body; a readable LCD laid on top of it)
      const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.024), new THREE.MeshBasicMaterial({ map: r12Lcd(''), color: 0xb8b8b8 }));
      lcd.rotation.set(-70 * D2R, 100 * D2R, 0, 'YXZ');
      lcd.position.set(R12.phone[0] + 0.02 - 0.0347, 0.6 + 0.071, R12.phone[1] + 0.04 - 0.0243);
      K.mesh(lcd, { name: 'c7r12:lcd' });
      K.prop('chair', 2.9, 3.2, -150, { variant: 'waiting', color: '#5a6a5a' });
      // the overbed table with a jug, a cup and a get-well card; flowers on the windowsill
      K.box(2.55, 0, 1.2, 0.08, 0.88, 0.08, { tex: 'metal', color: '#b8bcb8' });
      K.box(2.35, 0.88, 1.2, 0.5, 0.03, 0.8, { color: '#d8d2c4', roughness: 0.5 }, { collide: true });
      K.cyl(2.3, 0.91, 1.0, 0.05, 0.18, { color: '#e8eef0', roughness: 0.1, transparent: true, opacity: 0.5 });
      K.box(2.3, 0.91, 1.45, 0.14, 0.18, 0.005, { color: '#f4ecd8', roughness: 0.9 }, { rot: 20 });
      K.plane(2.31, 1.0, 1.46, 0.13, 0.17, cardTex('r12card', ['Get well', 'soon Nan', '', 'love from', 'Luke x'], { hand: true, size: 16, w: 128, h: 160, age: 0.2 }), { rotY: 20 });
      K.cyl(4.6, 0.8, 0.14, 0.06, 0.2, { color: '#b8d0d8', roughness: 0.1, transparent: true, opacity: 0.5 });
      for (let i = 0; i < 5; i++) K.sphere(4.58 + (i % 3 - 1) * 0.04, 1.06 + (i % 2) * 0.03, 0.14 + (i - 2) * 0.02, 0.03, { color: ['#c9b27a', '#8a6a6a', '#b8aa8a'][i % 3], roughness: 0.9 });
      K.prop('whiteboard', R12.W - 0.08, 2.1, -90, { text: 'ROOM 12\nYour nurse today: —\nGoal: sit out in the chair\nMobility: 2 assist', mount: 1.55, w: 1.1, h: 0.8 });
      K.prop('clock', 3.5, R12.D - 0.08, 180, { mount: 2.35, time: [3, 54] });
      K.box(3.1, H - 0.05, 2.0, 0.04, 0.04, 3.6, { tex: 'metal', color: '#b8bcb8' });
      K.plane(3.1, 1.6, 3.35, 1.2, 2.3, { color: '#8fa8b0', roughness: 0.95 }, { rotY: 90, double: true });
      K.box(4.9, 0, 3.6, 0.9, 1.8, 0.55, { tex: 'wood', color: '#b0946a' }, { collide: true });
      K.prop('water_stain', 4.5, 1.2, 0, { surface: 'ceiling', ceil: H });
      K.light('lamp', R12.phone[0] + 0.1, 1.0, R12.phone[1] + 0.3, { color: '#ffd9a0', intensity: 1.2, distance: 3.2, name: 'c7r12:lamp' });
      K.light('point', R12.win[0], 1.6, -0.6, { color: '#8fa0a8', intensity: 0.6, distance: 5 });
      // ---- examine --------------------------------------------------------------------------------------------------
      K.examine(R12.bed[0] - 0.4, 0.9, R12.bed[1], ['Her glasses. Folded on the pillow, the way you do before you go to sleep.', 'She\'s not here.'], { id: 'c7r12:glasses', r: 1.1 });
      K.examine(R12.bed[0] + 0.6, 0.8, R12.bed[1], 'The blanket\'s turned back. Like she just got up.', { id: 'c7r12:bed', r: 1.3 });
      K.examine(2.3, 1.1, 1.45, ['"Get well soon Nan. Love from Luke."', 'The x is pressed so hard it went through the card.'], { id: 'c7r12:card', r: 1.0 });
      K.examine(R12.W - 0.3, 1.6, 2.1, ['"Goal: sit out in the chair."', 'One goal. For a whole day.'], { id: 'c7r12:board', r: 1.3 });
      K.examine(4.6, 1.0, 0.3, 'Flowers on the windowsill, going brown at the edges. [beat] Luke must have brought them.', { id: 'c7r12:flowers', r: 1.2 });
      K.examine(R12.win[0], 1.6, 0.35, (G) => C7_window(G), { id: 'c7r12:window', r: 1.5 });
      K.examine(2.9, 0.8, 3.2, 'The visitor\'s chair. It\'s been pulled right up to the bed.', { id: 'c7r12:chair', r: 1.0 });
      K.examine(R12.phone[0], 0.8, R12.phone[1], (G) => G.think(flag('c7_room12') ? 'The phone\'s quiet now. [beat] The display\'s gone blank.' : 'A beige hospital phone. The little screen is blank.'), { id: 'c7r12:phone', r: 1.0 });
      // CUTSCENE 7-4 — after the standoff, walking in
      K.trigger([0, 0, 6, 3.6], (G) => G.cutscene('7-4'), { id: 'c7_room12:74', when: () => flag('c7_standoff') && !flag('c7_room12') });
    },
    async onEnter(G) {
      G.bars(null);
      if (!flag('c7_standoff') && G.once('c7:r12early')) { await G.wait(1.0); await G.think('Empty. [beat] Luke said she was sleeping.'); }
    },
  });
  async function C7_window(G) {
    if (flag('c7_room12')) { await G.think('The mast. The red light, blinking. [beat] Above the fog.'); return; }
    await G.think('Fog, right up against the glass.');
  }

  // =================================================================================================================
  // 7-2's FLASHBACK (cutscene only) — Aidan's city store back office, STORE 0412, in ordinary daylight. The desk with the
  // terminal against the north wall; the office window (east) onto the shop floor, where the huddle board stands.
  // =================================================================================================================
  const FB = { W: 7, D: 5, H: 2.7, desk: [0.42, 2.4], chair: [1.1, 2.4], door: [7, 4.3], board: [10.3, 2.3], luka: [9.55, 1.9, 62] };
  defineRoom({
    id: 'c7_flashback', name: 'BACK OFFICE (MEMORY)', area: 'STORE 0412 — CITY', outdoor: false, surface: 'carpet', ambient: 'office',
    noFog: true, grade: 'flashback',
    env: { ambient: ['#f4efe4', 1.35], sheets: false, specks: false },
    bounds: [0, -3, 16, 8],
    entries: { desk: [4.6, 3.4, 0], start: [4.6, 3.4, 0] },
    cameras: [
      { id: 'c7_flashback:office', vol: [0, 0, 4.2, 5], type: 'static', pos: [6.6, 2.45, 0.3], target: [1.6, 0.7, 3.6], fov: 'fit' },
      { id: 'c7_flashback:door', vol: [4.2, 0, 7, 5], type: 'static', pos: [0.4, 2.45, 4.6], target: [5.6, 0.7, 1.6], fov: 'fit' },
      { id: 'c7_flashback:floor', vol: [7, -3, 16, 3.5], type: 'static', pos: [15.7, 2.8, 7.7], target: [9.5, 0.5, 0.5], fov: 'fit' },
      { id: 'c7_flashback:till', vol: [7, 3.5, 16, 8], type: 'static', pos: [15.7, 2.8, -2.7], target: [9.8, 0.5, 5.8], fov: 'fit' },
    ],
    build(K) {
      const H = FB.H;
      K.floor(0, 0, FB.W, FB.D, { tex: 'carpet', color: '#6a6e72' });
      K.ceiling(0, 0, FB.W, FB.D, H, 'ceiling_tile');
      const pw = { tex: 'plaster', color: '#dcdad0' };
      K.wall(-0.08, 0, FB.W + 0.08, 0, H, pw, { skirting: true });
      K.wall(0, FB.D + 0.08, 0, -0.08, H, pw, { skirting: true });
      K.wall(FB.W + 0.08, FB.D, -0.08, FB.D, H, pw, { skirting: true });
      K.wall(FB.W, -0.08, FB.W, FB.D + 0.08, H, pw, { skirting: true, openings: [{ at: 2.48, w: 2.6, h: 1.3, sill: 0.95, glass: true }, { at: FB.door[1] + 0.08, w: 0.95, h: 2.1 }] });
      K.door({ id: 'c7_flashback:door', x: FB.door[0], z: FB.door[1], rot: 90, w: 0.95, style: 'metal', color: '#6a7472', hinge: 'right' });
      // the desk against the west wall, the terminal (case 118-2231), the desk phone, the chair
      K.prop('desk', FB.desk[0], FB.desk[1], 90, { clutter: false, w: 1.6 });
      K.prop('monitor', FB.desk[0] - 0.05, FB.desk[1], 90, { y: 0.745, content: 'crm', name: 'c7fb:term' });
      K.box(FB.desk[0] + 0.22, 0.745, FB.desk[1], 0.15, 0.02, 0.44, { color: '#2a2d2e', roughness: 0.5 });
      K.box(FB.desk[0] + 0.24, 0.745, FB.desk[1] - 0.38, 0.11, 0.03, 0.07, { color: '#2a2d2e', roughness: 0.5 });
      K.prop('desk_phone', FB.desk[0] + 0.02, FB.desk[1] + 0.62, 75, { y: 0.745, name: 'c7fb:phone' });
      K.prop('office_chair', FB.chair[0], FB.chair[1], -90, {});
      K.prop('mug', FB.desk[0] + 0.05, FB.desk[1] - 0.55, 30, { y: 0.745, text: 'BEST TEAM 0412' });
      K.box(FB.desk[0] - 0.1, 0.745, FB.desk[1] - 0.3, 0.3, 0.01, 0.22, { color: '#f4f2ea', roughness: 0.9 }, { rot: 8 });
      // stock shelving (north), the store sign, the roster, a coat hook with hoodies
      K.prop('shelf', 2.6, 0.3, 0, { len: 2.4, h: 2.0, load: 'stock' });
      K.plane(5.2, 2.2, 0.08, 1.4, 0.35, storeTex('fbsign', 'STORE 0412 — CITY', { w: 512, h: 128, size: 36 }), {});
      K.prop('roster', 0.08, 0.9, 90, { title: 'ROSTER — STORE 0412', mount: 1.55 });
      K.box(0.1, 1.55, 4.3, 0.05, 0.05, 0.5, { tex: 'wood', color: '#6a5436' });
      K.box(0.18, 0.95, 4.15, 0.12, 0.6, 0.34, { color: '#2d3a52', roughness: 0.9 });
      K.box(0.18, 1.0, 4.5, 0.12, 0.55, 0.32, { color: '#6a3a34', roughness: 0.9 });
      K.prop('sink_bench', 3.2, FB.D - 0.33, 180, { len: 1.8, variant: 'office' });
      K.prop('fridge', 5.0, FB.D - 0.38, 180, { variant: 'office' });
      K.prop('mug', 2.7, FB.D - 0.3, 20, { y: 0.92, text: 'LUKA' });
      K.prop('poster', 4.2, 0.08, 0, { style: 'plan', text: 'HAVE YOU OFFERED THE BUNDLE?', mount: 1.6 });
      K.prop('clock', 3.3, FB.D - 0.08, 180, { mount: 2.2, time: [11, 20] });
      tubes(K, [[1.8, 1.6, 90], [4.6, 1.6, 90], [1.8, 3.6, 90], [4.6, 3.6, 90]], { lit: true, real: [0, 3], h: H - 0.02 });
      // the day's light through a high window over the shelves: a spot whose colour changes day to day
      K.light('spot', 3.4, 2.55, 0.25, { color: '#fff4e0', intensity: 5, distance: 9, target: [1.0, 0.7, 2.4], angle: 0.7, name: 'c7fb:sun' });
      K.box(3.4, 2.1, 0.05, 1.4, 0.45, 0.04, { color: '#fffaf0', emissive: '#fffaf0', emissiveIntensity: 1.2, roughness: 0.4 });
      // the shop floor through the window: the huddle board, demo tables, the counter, daylight at the front
      K.floor(FB.W, -3, 16, 8, { tex: 'vinyl_retail', color: '#e6eae8', roughness: 0.2 });
      K.ceiling(FB.W, -3, 16, 8, 3.0, { color: '#f2f4f2', roughness: 0.6 });
      K.prop('huddle_board', FB.board[0], FB.board[1], -118, { text: 'HUDDLE — TODAY\nTARGET: 11\nBUNDLES!!\nNPS: 72  ↓' });
      K.prop('demo_table', 12.4, -0.4, 90, { n: 6, lit: true, time: '11:20' });
      K.prop('demo_table', 12.4, 4.6, 90, { n: 6, lit: true, time: '11:20' });
      K.prop('accessory_wall', 8.2, -2.7, 0, { len: 2.4 });
      K.prop('counter', 14.2, 2.0, -90, { len: 3.2, variant: 'store' });
      K.box(15.95, 0, 2.5, 0.1, 3.0, 11, { color: '#f8f8f4', emissive: '#f8f8f4', emissiveIntensity: 1.4, roughness: 0.3 }, { shadow: false });
      for (const [x, t] of [[9.6, 'SWITCH & SAVE'], [11.2, 'UNLIMITED DATA']]) K.prop('poster', x, -2.92, 0, { style: 'plan', text: t, mount: 1.6 });
      K.box(11.5, 0, -3.05, 9.2, 3.0, 0.1, { color: '#0e9c98', roughness: 0.4 }); K.box(11.5, 0, 8.05, 9.2, 3.0, 0.1, { color: '#0e9c98', roughness: 0.4 });
      tubes(K, [[9.5, 0, 0], [12.5, 0, 0], [9.5, 5, 0], [12.5, 5, 0]], { lit: true, real: [0, 2], h: 2.98 });
    },
  });

  // =================================================================================================================
  // Cutscene helpers
  // =================================================================================================================
  const wpos = (o) => { const v = V3(); if (o) { o.updateWorldMatrix(true, false); o.getWorldPosition(v); } return v; };
  const headOf = (A) => wpos(A && A.raw && A.raw.bones && A.raw.bones.head);
  const cardOf = (A) => wpos(A && A.raw && ((A.raw.parts && A.raw.parts.card) || (A.raw.anchors && A.raw.anchors.card) || A.raw.bones.chest));
  const fwdOf = (A) => { const y = (A.yaw || 0) * D2R; return V3(Math.sin(y), 0, Math.cos(y)); };
  const arr = (v) => [v.x, v.y, v.z];
  // a close shot on something on an actor's front (the lanyard card, the face): `d` metres in front of it
  const closeOn = (A, p, d = 0.4, fov = 24, lift = 0.02, side = 0, f = fwdOf(A)) => { const r = V3(f.z, 0, -f.x); return { pos: [p.x + f.x * d + r.x * side, p.y + lift, p.z + f.z * d + r.z * side], target: arr(p), fov }; };
  // the way a face is actually pointing (the head bone, flattened): close-ups land in front of it whatever the body does
  const headFwd = (A) => {
    const hb = A && A.raw && A.raw.bones && A.raw.bones.head;
    if (!hb) return fwdOf(A);
    const q0 = new THREE.Quaternion(); hb.updateWorldMatrix(true, false); hb.getWorldQuaternion(q0);
    const v = V3(0, 0, 1).applyQuaternion(q0); v.y = 0;
    return v.lengthSq() < 0.04 ? fwdOf(A) : v.normalize();
  };
  const faceOn = (A, d, fov, lift, side) => closeOn(A, headOf(A), d, fov, lift, side, headFwd(A));
  // a Smile in the room, handed to the script (and registered under an alias so G.actor(alias) can walk it)
  function smileActor(G, id, alias) {
    const e = G.enemy(id);
    if (!e || e.removed || !e.actor) return null;
    e.data.scripted = true;
    try { if (World.build && World.build.npcs) World.build.npcs[alias] = e.actor; } catch (err) { /* room */ }
    return { e, A: G.actor(alias) };
  }
  function releaseSmiles(ids, cool = 0) {
    for (const id of ids) {
      const e = Enemies.get(id);
      if (!e || e.removed) continue;
      e.data.scripted = false; e.data.path = null;
      e.data.state = e.data.post ? 'return' : 'patrol';
      if (cool > 0 && !e.data.post) { e.data.state = 'cool'; e.data.coolT = cool; }   // (they stand and smile a moment first)
      try { if (e.actor && e.actor.held && e.actor.held.L) e.actor.hold('L', 'tablet', { pose: 'shield' }); } catch (err) { /* rig */ }
    }
    try { for (const k of Object.keys(World.build.npcs || {})) if (/^sm\d/.test(k)) delete World.build.npcs[k]; } catch (err) { /* room */ }
  }

  // =================================================================================================================
  // CUTSCENE 7-1 "Hi There!" — no siren. A few steps into the corridor it changes: the tubes flicker, a door chime, the
  // light goes clinical and bright — and it is the store (the room is rebuilt as the Smile store under the white-out).
  // =================================================================================================================
  defineCutscene('7-1', async (G) => {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    const px = clamp(A.pos.x, 3.4, 5.2), pz = clamp(A.pos.z, 1.0, 3.0);
    A.pose('idle');
    G.cam({ pos: [px - 1.5, 1.62, pz + 0.95], target: [16, 1.3, 2.0], fov: 38, to: { pos: [px - 1.3, 1.6, pz + 0.9], fov: 36 }, dur: 6 });
    await A.turn(90, 0.4);
    A.look([16, 1.5, 2]);
    await G.wait(1.0);
    // the tubes, one after another down the corridor; a door chime from nowhere
    for (const [x, d] of [[14, 0.28], [10, 0.24], [6, 0.3]]) { G.sfx('tube_flicker', { pos: [x, 2.8, 2], vol: 0.9 }); await G.wait(d); }
    G.sfx('chime', { vol: 1.0 });
    await G.post({ exposure: 2.6, white: 0.94, dur: 0.9 });
    // (state) the corridor is the store now; NO SERVICE, no bars at all
    G.set('c7_store', true); G.set('c7_s71', true);
    await G.goto('c7_corridor', { pos: [px, pz], yaw: 90 }, { fade: false, sound: 'none' });
    G.bars('noservice', { room: true });
    note(G, 'Ward 3. Through the store.', 'c7_goal');
    const s1 = smileActor(G, 'c7_corridor:s1', 'sm1'), s2 = smileActor(G, 'c7_corridor:s2', 'sm2'), s3 = smileActor(G, 'c7_corridor:s3', 'sm3');
    if (s1) { s1.A.place(15.9, 2.0, 90); s1.A.pose('idle'); }
    if (s2) { s2.A.place(0.9, 2.9, 90); s2.A.pose('idle'); }
    if (s3) { s3.A.place(10.0, 5.1, 180); s3.A.pose('idle'); }
    // (the tablets go under the arm for the scene, so the badge inserts can see the lanyard cards)
    for (const s of [s1, s2]) if (s && s.A.raw) s.A.raw.hold('L', 'tablet', { pose: 'tuck' });
    A.place(px, pz, 90);
    A.look([16, 1.5, 2]);
    // 1. a long, too-bright corridor dressed as a phone store; at the far end a salesperson turns around
    G.cam({ pos: [px - 1.5, 1.58, pz + 0.95], target: [16, 1.35, 2.0], fov: 34, to: { pos: [px - 1.2, 1.58, pz + 0.9], fov: 24 }, dur: 7 });
    await G.post({ white: 0, exposure: 1.1, dur: 1.5 });
    await G.wait(0.8);
    if (s1) await s1.A.turn(-90, 1.2);
    await G.wait(0.5);
    // the smile; the lens-flare eyes
    if (s1) G.cam({ ...closeOn(s1.A, headOf(s1.A), 0.72, 30, 0.02), to: { fov: 26 }, dur: 4 });
    await G.wait(0.9);
    await G.say('SMILE', 'Hi there! [beat] What brings you in today?');
    // the badge: AIDAN
    if (s1) G.cam(closeOn(s1.A, cardOf(s1.A), 0.36, 20, 0.03));
    await G.wait(1.5);
    // 2. reverse: behind him, one steps out of the corridor he came from, another out of a side room
    G.cam({ pos: [12.9, 1.62, 0.85], target: [1.6, 1.15, 2.7], fov: 42 });
    A.look([1.5, 1.5, 2.6]);
    await G.wait(0.4);
    const w2 = s2 ? s2.A.walkTo([[1.7, 2.8], [2.6, 2.5]], { speed: 0.95 }) : null;
    await G.wait(0.7);
    const w3 = s3 ? s3.A.walkTo(10.0, 3.2, { speed: 0.95 }) : null;
    await G.all([w2, w3].filter(Boolean));
    if (s2) q(s2.A.turn(A, 0.6));
    if (s3) q(s3.A.turn(A, 0.6));
    await A.turn(-60, 0.8);
    await G.wait(0.6);
    // 3. insert: his badge, a Smile's badge. Same font. Same name.
    G.cam(closeOn(A, cardOf(A), 0.34, 20, 0.03));
    await G.wait(1.3);
    if (s2) G.cam(closeOn(s2.A, cardOf(s2.A), 0.34, 20, 0.03));
    await G.say('SMILE', 'That\'ll all be fine.');
    G.cam(closeOn(A, cardOf(A), 0.3, 18, 0.03));
    await G.wait(0.9);
    // (back to the store: they go about their business)
    releaseSmiles(['c7_corridor:s1', 'c7_corridor:s2', 'c7_corridor:s3'], 4.5);
    A.look(null);
    if (A.raw) A.raw.idleLife = true;
  }, { letterbox: true, skippable: true });

  // ---- 7-page (in-engine): the PA. Every Smile turns its head at once and walks to the front counter ---------------
  defineCutscene('7-page', async (G) => {
    const A = G.aidan, [mx, mz] = NU.mic;
    G.set('c7_paged', true);
    C7.pageUntil = now() + 60;                               // (reset to 30 s once he has control again)
    C7.nuAway = true;
    if (A.raw) A.raw.idleLife = false;
    await A.walkTo(mx, mz - 0.64, { speed: 1.0 });
    await A.turn(0, 0.3);
    G.cam({ pos: [mx - 1.3, 1.5, mz - 2.3], target: [mx + 0.1, 1.2, mz - 0.1], fov: 36 });
    q(A.gesture('reach', { hand: 'L', target: [mx + 0.04, 1.04, mz - 0.03], dur: 1.0 }));
    await G.wait(0.5);
    G.sfx('click', { vol: 0.6 });
    G.sfx('pa_ding', { vol: 1.0 });
    await G.wait(1.0);
    await G.say('AIDAN', 'Would... would Aidan please come to the front counter.');
    G.sfx('pa_ding', { vol: 0.7 });
    const ds = ['c7_nurses:d1', 'c7_nurses:d2', 'c7_nurses:d3'].map((id) => G.enemy(id)).filter((e) => e && !e.removed && !e.hidden);
    for (const e of ds) { e.data.scripted = true; e.actor.lookAt(null); e.actor.setAnim('idle', { blend: 0.2 }); }
    // the three in the doors: every head turns at once
    G.cam({ pos: [4.0, 1.5, 2.95], target: [4.0, 1.55, 0.1], fov: 50 });
    await G.wait(1.0);
    const counter = V3(9.5, 1.6, 3.6);
    for (const e of ds) e.actor.lookAt(counter);
    await G.wait(1.2);
    // (state) they answer: the front counter
    C7_assignPage('c7_nurses');
    let t = 0;
    await G.loop((dt) => {
      t += dt;
      for (const e of ds) { if (e.data.away || e.removed) continue; if (smMove(e, 7.55, 3.5, 1.0, dt, 0.25)) { e.data.away = true; Enemies.visible(e, false); } }
      return t > 2.6;
    });
    for (const e of ds) e.data.scripted = false;
    G.camRelease();
    await G.think('They all answered.');
    C7.pageUntil = now() + 30;                               // the doorways stay clear for thirty seconds
    if (A.raw) A.raw.idleLife = true;
    note(G, 'The doors are clear. Not for long.', 'c7_goal');
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // CUTSCENE 7-2 "Three Times" (c7_ward3; the flashback in c7_flashback) — then 7-3 in the car park
  // =================================================================================================================
  async function C7_threeTimes(G) {
    G.persist();
    C7.chain = true;
    try {
      await G.cutscene('7-2');
      if (!flag('c7_standoff') && G.inRoom('c7_carpark')) await G.cutscene('7-3');
    } finally { C7.chain = false; }
  }
  // Luke's phone: the call log, and which voicemail is playing
  function C7_log(L, playing) {
    const sc = L && L.raw && L.raw.phoneScreen;
    if (!sc) return;
    try { sc.draw((c, w, h) => paintCallLog(c, w, h, playing)); } catch (e) { /* screen */ }
  }
  // (framed on the lower two-thirds of the screen: his fingers wrap the top edge)
  const phoneShot = (L, d = 0.3, fov = 22, dy = -0.018) => {
    const ph = L && L.raw && L.raw.held && L.raw.held.R, scr = ph && ph.userData && ph.userData.screen;
    const p = wpos(scr || ph), n = V3(0, 0, 1), up = V3(0, 1, 0);
    if (scr) { const q0 = new THREE.Quaternion(); scr.getWorldQuaternion(q0); n.applyQuaternion(q0); up.applyQuaternion(q0); }
    p.addScaledVector(up, dy);
    return { pos: [p.x + n.x * d, p.y + n.y * d + 0.02, p.z + n.z * d], target: arr(p), fov };
  };
  defineCutscene('7-2', async (G) => {
    const A = G.aidan;
    // (state) Luke's world is gone: the Fog world again
    G.set('c7_store', false);
    G.bars(null);
    C7.pageUntil = -1;
    if (A.raw) A.raw.idleLife = false;
    let L = G.actor('luke', 'luke');
    if (L.raw) { L.raw.idleLife = false; if (!L.raw.root.parent) L.place(W3.chair[0] - 0.04, W3.chair[1], -90); }
    L.expr('tired'); L.eyes('down');
    // 1. the long symmetrical corridor, dim; Luke hunched on the plastic chair outside Room 12, holding Nan's phone
    A.place(1.5, -1.4, 180);
    G.cam({ pos: [1.5, 1.5, -0.3], target: [1.5, 1.2, -29.5], fov: 21, to: { fov: 17 }, dur: 9 });
    const walk = A.walkTo(1.5, -20.6, { speed: 1.05 });
    await G.wait(3.6);
    L.look(A); L.eyes('at', A);
    await G.wait(1.2);
    // 2. Luke stands. Tired, not monstrous. Hi-vis, a visitor sticker, scraped knuckles.
    G.cam({ pos: [0.42, 1.5, -24.3], target: [2.35, 1.35, -28.0], fov: 36, to: { fov: 33 }, dur: 5 });
    await walk;
    await L.gesture('stand_up', { to: 'idle' });
    L.hold('L', null);                                       // (Nan's phone into his pocket)
    await L.turn(A, 0.5);
    await G.wait(0.4);
    await G.say('LUKE', 'It\'s you. [beat] From the store.');
    G.cam({ ...faceOn(A, 1.3, 30, -0.05, 0.25) });
    await G.wait(0.4);
    await G.say('AIDAN', 'Yeah.');
    // 3. Luke closes the distance fast. Aidan flinches. A metre away, fists clenched — then his own phone instead.
    G.cam({ pos: [0.32, 1.55, -18.3], target: [1.7, 1.35, -21.9], fov: 40 });
    q(L.walkTo(1.55, -21.65, { speed: 2.4 }));
    await G.wait(0.75);
    q(A.gesture('flinch', { dur: 0.8 }));
    L.expr('angry');
    await G.wait(0.6);
    await L.gesture('clench', { dur: 1.1 });
    await G.wait(0.5);
    L.hold('R', 'phone', { screen: true, case: '#1d1f22', pose: 'phone_up' });
    C7_log(L, null);
    L.expr('tired');
    G.cam({ pos: [2.55, 1.62, -20.1], target: [1.45, 1.45, -21.7], fov: 34 });
    await G.say('LUKE', 'You know what this is? [beat] My call log.');
    // 4. insert on the screen: "Outgoing — Store (3)"
    G.cam({ ...phoneShot(L, 0.3, 24), to: phoneShot(L, 0.24, 22), dur: 4 });
    await G.wait(1.2);
    await G.say('LUKE', 'Three times. I rang three times.');
    G.sfx('beep', { vol: 0.6 });
    C7_log(L, '1 of 3');
    // his own voice through the tiny speaker
    G.cam({ ...faceOn(A, 1.1, 28, -0.04, -0.3), to: { fov: 24 }, dur: 9 });
    G.sfx('static', { loop: true, vol: 0.06, phone: true });
    await G.wait(0.5);
    await G.say('LUKE (phone)', 'Yeah, this is Luke. My Nan was in last Saturday, your bloke sold her a whole heap of stuff and now her alarm doesn\'t work. Can someone call me back.');
    await G.beat();
    C7_log(L, '2 of 3');
    G.cam({ ...faceOn(L, 1.05, 28, -0.05, 0.28) });
    await G.say('LUKE (phone)', 'It\'s Luke again. Nobody\'s called. Her alarm is not working. She\'s seventy-nine and she lives on her own. Call me back.');
    // 5. before the third
    G.cam({ ...faceOn(A, 0.9, 26, -0.03, -0.2), to: { fov: 22 }, dur: 8 });
    const i = await G.choice(['[Listen]', '[Turn away]']);
    if (i === 0) {
      G.track('F', 2, 'Ch 7: listened to the voicemails');
      G.set('c7_listened', true);
      A.eyes('at', L); A.look(L);
      await G.wait(1.2);
    } else {
      G.track('A', 3, 'Ch 7: tried to stop the voicemails');
      G.set('c7_listened', false);
      A.look([0.2, 1.4, -20]); A.eyes('away', L);
      q(A.turn(-120, 0.5));
      await G.say('AIDAN', 'Stop— turn it off—');
      G.cam({ ...faceOn(L, 0.95, 28, -0.05, 0.25) });
      L.expr('angry');
      await G.say('LUKE', 'No. You listen.');
      G.cam({ ...faceOn(A, 1.0, 28, -0.03, 0.2) });
    }
    C7_log(L, '3 of 3');
    L.expr('sad');
    await G.say('LUKE (phone)', 'Mate. It\'s Luke. [beat] She\'s got no alarm. She\'s on her own up there. Please, mate. Just call me back.');
    await G.wait(0.8);
    // 6. FLASHBACK — the only one in the game
    const back = { a: [A.pos.x, A.pos.z, A.yaw], l: [L.pos.x, L.pos.z, L.yaw] };
    await C7_flashback(G);
    // 7. back in the corridor. Aidan is shaking.
    await G.goto('c7_ward3', { pos: [back.a[0], back.a[1]], yaw: back.a[2] }, { fade: false, sound: 'none' });
    G.post({ desat: 0, noise: 0, grain: null });
    L = G.actor('luke', 'luke');
    if (L.raw) L.raw.idleLife = false;
    L.place(back.l[0], back.l[1], back.l[2]); L.pose('idle'); L.expr('sad'); L.look(A); L.eyes('at', A);
    L.hold('R', 'phone', { screen: true, case: '#1d1f22', pose: 'phone' });
    C7_log(L, null);
    G.aidan.show();
    A.pose('idle'); A.expr('scared'); A.eyes('down');
    q(A.gesture('tremor', { amount: 1.6, hold: true }));
    G.cam({ ...faceOn(A, 1.25, 30, -0.06, 0.3), to: { fov: 27 }, dur: 8 });
    await G.fade(0, 0.8, '#f4f2ea');
    await G.wait(1.0);
    await G.say('AIDAN', 'I knew. [beat] I knew. I had it for three days. I could have— one call. It was one call.');
    G.cam({ ...faceOn(L, 1.1, 30, -0.05, 0.3) });
    await G.say('LUKE', 'Yeah. [beat] It was.');
    // 8. Luke sits back down heavily. A long beat.
    L.hold('R', null);
    G.cam({ pos: [0.75, 1.62, -19.4], target: [2.4, 1.0, -27.9], fov: 34 });
    await L.walkTo([[1.9, -26.9], [W3.chair[0] - 0.55, W3.chair[1]]], { speed: 0.9 });
    await L.turn(-90, 0.5);
    L.place(W3.chair[0] - 0.04, W3.chair[1], -90);
    L.pose('sit', { seat: 0.45 });
    await G.longBeat();
    L.look(A); L.eyes('at', A);
    await G.say('LUKE', 'You know what she said about you? [beat] She said you were lovely. \'Such a lovely young man. So patient with me.\'');
    // Aidan can't speak
    G.cam({ ...faceOn(A, 0.95, 26, -0.04, -0.2), to: { fov: 23 }, dur: 5 });
    A.expr('cry'); A.eyes('down');
    await G.wait(2.6);
    // 9. close on Luke looking at Nan's phone in his hands
    L.hold('L', 'phone', { case: '#8a6f94', screen: false, pose: 'phone_look' });
    L.expr('sad');
    await G.wait(0.5);
    { const np = wpos(L.raw && L.raw.held && L.raw.held.L); if (np.lengthSq() > 0) { L.look(arr(np)); L.eyes('at', arr(np)); } }
    // (a soft fill from the corridor light bouncing off the floor: his bowed face stays readable)
    const fill = C7.fill = Render.allocLight('point', { color: '#c4cfca', intensity: 1.1, distance: 2.4, pos: [W3.chair[0] - 0.85, 0.95, W3.chair[1] + 0.2], pin: true });
    await G.wait(0.3);
    G.cam({ pos: [W3.chair[0] - 1.05, 0.95, W3.chair[1] + 0.6], target: [W3.chair[0] - 0.35, 1.04, W3.chair[1] + 0.05], fov: 36, to: { fov: 31 }, dur: 14 });
    await G.wait(0.8);
    await G.say('LUKE', 'I hadn\'t rung her in two weeks. [beat] Before she fell. Two weeks. I set her up out here on her own \'cause it was cheap and it was quiet and I said I\'d visit every weekend. [beat] I didn\'t visit every weekend.');
    G.cam({ ...faceOn(A, 1.0, 28, -0.04, 0.2) });
    await G.say('AIDAN', 'Luke—');
    L.hold('L', null); L.look(A); L.eyes('at', A);
    await G.wait(0.35);
    G.cam({ ...faceOn(L, 1.05, 30, -0.1, -0.25) });
    await G.say('LUKE', 'I\'m not saying it\'s not on you. It\'s on you. [beat] It\'s just not only on you.');
    await G.longBeat();
    L.eyes('away', A);
    await G.say('LUKE', 'Doctor says she\'s sleeping. Can\'t go in till she wakes. [beat] I need air.');
    C7_freeFill();
    // (state)
    G.set('c7_luke', true);
    note(G, 'Ward 3, Room 12.', 'c7_goal', { done: true });
    q(A.gesture('tremor', { amount: 0, dur: 0.1 }));
    if (A.raw) { A.raw.finishGestures(); A.raw.idleLife = true; }
    A.expr('neutral'); A.eyes('ahead');
    await G.fade(1, 1.2);
    await G.wait(0.6);
    await G.goto('c7_carpark', { pos: [27.9, 11.35], yaw: 90 }, { fade: false, sound: 'none' });
  }, { letterbox: true, skippable: true });

  // (the cutscene's pinned fill light: freed at the end of 7-2, or by the next room if the scene was skipped)
  function C7_freeFill() { try { if (C7.fill) C7.fill.free(); } catch (e) { /* light */ } C7.fill = null; }
  // the flashback: the city store's back office, three days. Desaturated, grainy, brightly and ordinarily lit.
  async function C7_flashback(G) {
    G.sfx('static', { vol: 0.5 });
    await G.fade(1, 0.45, '#f4f2ea');
    await G.goto('c7_flashback', 'desk', { fade: false, sound: 'none' });
    G.aidan.hide();
    G.post({ grade: 'flashback', desat: 0.62, noise: 0.05, grain: 0.3 });
    G.music('tomorrow', { full: true });
    const term = G.obj('c7fb:term'), phone = G.obj('c7fb:phone'), sun = G.light('c7fb:sun');
    const scr = term && term.userData ? term.userData : null;
    const draw = (st) => { if (!scr) return; scr.custom = true; try { scr.screen.draw((c, w, h) => paintCase(c, w, h, st)); } catch (e) { /* screen */ } };
    const days = [
      { hood: '#393a3d', sun: ['#fff1d8', 5.5], amb: ['#f4efe4', 1.35] },
      { hood: '#2d3a52', sun: ['#c8d4de', 2.4], amb: ['#dfe4e8', 1.1] },
      { hood: '#6a3a34', sun: ['#ffb46a', 6.5], amb: ['#f6dcc0', 1.25] },
    ];
    const lk = G.actor('fbLuka', 'luka', { rig: { hold: { R: 'pen', L: ['tablet', { pose: 'tuck' }] } } });
    lk.place(FB.luka[0], FB.luka[1], FB.luka[2]); lk.pose('work'); lk.look([FB.board[0], 1.55, FB.board[1]]);
    if (lk.raw) lk.raw.idleLife = false;
    const call = [215, 190], later = [330, 190];
    const wide = { pos: [3.3, 1.7, 0.75], target: [0.75, 1.0, 2.45], fov: 42 };
    const insert = { pos: [1.15, 1.5, 1.55], target: [0.42, 1.0, 2.45], fov: 30 };
    for (let d = 0; d < 3; d++) {
      const D = days[d];
      try { if (sun) sun.set({ color: D.sun[0], intensity: D.sun[1] }); Render.setAmbient(D.amb[0], D.amb[1]); } catch (e) { /* light */ }
      const A = G.actor('fbA' + d, 'aidan', { rig: { layers: [{ kind: 'hoodie', color: D.hood, open: true }], hold: {} } });
      if (A.raw) A.raw.idleLife = false;
      A.place(FB.chair[0] - 0.08, FB.chair[1], -90);
      A.pose('type', { seated: true, seat: 0.5, desk: 0.745 });
      A.look([FB.desk[0], 1.1, FB.desk[1]]); A.eyes('at', [FB.desk[0], 1.05, FB.desk[1]]); A.expr('tired');
      const st = { day: d + 1, hover: 'call', cursor: call.slice(), done: false };
      draw(st);
      G.cam(d === 1 ? { ...wide, to: { fov: 42 }, dur: 4 } : { ...wide, to: { fov: 40 }, dur: 8 });
      await G.fade(0, d === 0 ? 0.5 : 0.25, '#f4f2ea');
      await G.wait(d === 0 ? 1.6 : 0.6);
      if (d === 0) {
        // through the office window: Luka's shape at the huddle board, writing a number
        G.cam({ pos: [1.7, 1.52, 1.95], target: [FB.luka[0], 1.45, FB.luka[1] + 0.2], fov: 30, to: { fov: 27 }, dur: 2.2 });
        await G.wait(2.0);
        // the cursor over "Call customer"
        G.cam(insert);
        await G.wait(1.4);
        G.cam(wide);
        // he picks up the desk phone, dials two digits, puts it down
        const hs = phone && phone.userData && phone.userData.handset;
        q(A.gesture('reach', { hand: 'L', target: [FB.desk[0] + 0.02, 0.85, FB.desk[1] + 0.62], dur: 0.8 }));
        await G.wait(0.6);
        if (hs) hs.visible = false;
        A.hold('L', 'handset', { color: '#5a5f62' });
        await G.wait(0.7);
        q(A.gesture('reach', { hand: 'R', target: [FB.desk[0] + 0.05, 0.8, FB.desk[1] + 0.62], dur: 0.5 }));
        G.sfx('beep', { vol: 0.35 }); await G.wait(0.35); G.sfx('beep', { vol: 0.35 });
        await G.wait(0.9);
        A.hold('L', null);
        if (hs) hs.visible = true;
        G.sfx('clunk', { vol: 0.6 });
        A.pose('type', { seated: true, seat: 0.5, desk: 0.745 });
        await G.wait(0.5);
      }
      // "Follow up tomorrow" — click
      G.cam(insert);
      for (let k = 0; k <= 8; k++) { st.cursor = [lerp(call[0], later[0], k / 8), call[1]]; st.hover = k < 4 ? 'call' : 'tomorrow'; draw(st); await G.wait(0.05); }
      await G.wait(d === 0 ? 0.5 : 0.25);
      G.sfx('click', { vol: 0.8 });
      st.done = true; draw(st);
      if (d === 2) await G.think('Tomorrow.');
      await G.wait(d === 1 ? 0.5 : 0.8);
      if (d === 2) {
        // the third day: his head in his hands for one second; he stands, fixes his smile, walks back onto the floor
        G.cam({ pos: [3.4, 1.45, 3.9], target: [1.0, 1.1, 2.45], fov: 34 });
        await A.gesture('head_in_hands', { dur: 1.0 });
        await A.gesture('stand_up', { to: 'idle' });
        A.place(FB.chair[0] + 0.25, FB.chair[1], 90);
        q(A.gesture('smooth_uniform'));
        await G.wait(0.4);
        A.expr('smile'); A.eyes('ahead');
        await G.wait(0.5);
        G.cam({ pos: [2.0, 1.6, 1.1], target: [7.0, 1.3, 4.3], fov: 40 });
        await A.walkTo([[4.6, 3.6], [6.3, 4.3]], { speed: 1.2 });
        try { G.door('c7_flashback:door').open(); } catch (e) { /* door */ }
        G.sfx('chime', { vol: 1.0 });
        await A.walkTo(7.9, 4.3, { speed: 1.2 });
        await G.wait(0.4);
      }
      await G.fade(1, d === 2 ? 0.9 : 0.25, '#f4f2ea');
      A.remove();
    }
    try { Render.setAmbient(null); } catch (e) { /* light */ }
    G.aidan.show();
  }

  // =================================================================================================================
  // CUTSCENE 7-3 "Standoff" — the car park, fog, one sodium light. Chase bursts out of the fog, bar in hand.
  // =================================================================================================================
  Enemies.defineType('c7_lukereach', {
    hp: 1e9, invincible: true, stompable: false, lockable: false, body: false, threat: false, downs: false, radius: 0.4, height: 1.9,
    create(e, def) {
      const R = Enemies.types && Enemies.types.reach;
      if (R && R.create) R.create(e, def);
      else { const a = Rig.create('man_counter', {}); e.actor = a; e.obj = a.root; e.pos = a.root.position; }
      e.untouchable = true; e.threat = false; e.ai = false;
      if (e.actor) { e.actor.setTint('#8a1a10', 0.45, { skin: true }); e.actor.setAnim('idle', { blend: 0 }); }
    },
    update() { /* a shape in Chase's eyes, nothing more */ },
  });
  const SO = { luke: [29.35, 11.95], aidan: [27.95, 11.35], chaseFrom: [34.0, 27.0], chase: [30.3, 16.7] };
  defineCutscene('7-3', async (G) => {
    const A = G.aidan, hits = S.chaseHits | 0, hurt = !!flag('chaseHurt');
    if (A.raw) A.raw.idleLife = false;
    const L = G.actor('luke7', 'luke');
    if (L.raw) L.raw.idleLife = false;
    L.place(SO.luke[0], SO.luke[1], 170); L.pose('idle'); L.expr('tired'); L.eyes('away');
    A.place(SO.aidan[0], SO.aidan[1], 70); A.pose('idle'); A.look(L);
    const C = G.actor('chase7', 'chase');
    if (C.raw) C.raw.idleLife = false;
    C.place(SO.chaseFrom[0], SO.chaseFrom[1], -20); C.hide();
    // 1. the car park, fog, one sodium light; Luke and Aidan by the bench. Running footsteps.
    G.cam({ pos: [22.2, 1.35, 16.6], target: [29.4, 1.5, 10.8], fov: 40, to: { pos: [22.6, 1.35, 16.2], fov: 38 }, dur: 8 });
    await G.fade(0, 1.4);
    await G.wait(1.6);
    let steps = true;
    G.bg(async (G2) => { let k = 0; while (steps && k < 30) { try { Snd.footstep('bitumen', true, { pos: [C.pos.x, 0.05, C.pos.z], vol: 0.9 }); } catch (e) { /* audio */ } k++; await G2.wait(hurt ? 0.36 : 0.29); } });
    await G.wait(1.2);
    C.show(); C.expr('scared');
    await C.walkTo(SO.chase[0], SO.chase[1], { run: true, speed: hurt ? 2.6 : 3.4, anim: hurt ? 'run_bad' : 'run' });
    steps = false;
    C.pose('idle'); C.look(L);
    if (C.raw) C.raw.armPose('R', 'bar_ready');
    // 2. Chase's point of view, distorted: for one second Luke's shape flickers into a Reach
    G.cam({ pos: [SO.chase[0], 1.72, SO.chase[1]], target: [SO.luke[0], 1.45, SO.luke[1]], fov: 44 });
    C.hide();                                                // (the lens is where his eyes are)
    G.post({ desat: 0.35, ca: 1.3, noise: 0.14, blur: 0.18 });
    G.shake(0.4, 1.3);
    const rf = G.spawn({ id: 'c7:reachflash', type: 'c7_lukereach', pos: [SO.luke[0], SO.luke[1]], rot: 170, persist: false });
    for (let k = 0; k < 5; k++) { L.hide(); if (rf) Enemies.visible(rf, true); await G.wait(0.14); L.show(); if (rf) Enemies.visible(rf, false); await G.wait(0.07); }
    if (rf) Enemies.visible(rf, true);
    L.hide();
    G.sfx('static', { vol: 0.5 });
    await G.say('CHASE', 'AIDAN, GET AWAY FROM HIM!');
    if (rf) rf.remove();
    L.show(); C.show();
    G.post({ desat: 0, ca: null, noise: 0, blur: 0 });
    // 3. Luke turns, hands half up, half fists
    G.cam({ pos: [26.6, 1.55, 13.9], target: [29.6, 1.45, 12.6], fov: 36 });
    await L.turn(C, 0.45);
    L.expr('angry'); L.look(C); L.eyes('at', C);
    q(L.gesture('hands_up', { dur: 1.4, hold: true }));
    await G.say('LUKE', 'Who the hell are you?');
    G.cam({ ...faceOn(C, 1.4, 32, -0.1, 0.35) });
    q(C.gesture('tremor', { amount: 1.4, hold: true }));
    await G.say('CHASE', 'Back off. [beat] Back OFF.');
    // 4. TIMED CHOICE — ten seconds, heartbeat, the camera slowly pushing in
    const mid = V3((SO.luke[0] + SO.chase[0]) / 2, 1.35, (SO.luke[1] + SO.chase[1]) / 2);
    G.cam({ pos: [25.4, 1.62, 15.9], target: arr(mid), fov: 40, to: { pos: [26.6, 1.58, 15.0], fov: 30 }, dur: 10 });
    A.look(C);
    const hb = G.sfx('heartbeat', { loop: true, bpm: 118, vol: 1.0 });
    const i = await G.choice(['[Step between them]', '[Talk him down]', '[Run]'], { timer: 10, def: 2 });
    try { if (hb) hb.stop(0.3); } catch (e) { /* audio */ }
    const pick = ['step', 'talk', 'run'][i] || 'run';
    G.set('c7_standoffPick', pick);
    let chaseSaved = false, lukeSaved = false;
    const chaseRuns = async () => { C.expr('scared'); await C.walkTo([[33.5, 20.5], [36.5, 27.5]], { run: true, speed: hurt ? 2.6 : 3.2, anim: hurt ? 'run_bad' : 'run' }); await C.fade(0, 0.8); C.hide(); };
    if (pick === 'step') {
      await A.walkTo(29.6, 13.55, { speed: 1.4 });
      await A.turn(C, 0.4);
      if (hits < 4) {
        G.cam({ ...faceOn(A, 1.25, 32, -0.05, -0.3) });
        await G.say('AIDAN', 'Chase. Look at him. [beat] He\'s just a bloke.');
        // Chase's eyes: the man behind Aidan is only a man
        G.cam({ pos: [SO.chase[0], 1.72, SO.chase[1]], target: [SO.luke[0], 1.5, SO.luke[1]], fov: 42 });
        C.hide();
        G.post({ desat: 0.3, ca: 1.0, noise: 0.08 });
        await G.post({ desat: 0, ca: 0.2, noise: 0, dur: 1.6 });
        G.post({ ca: null });
        C.show();
        G.cam({ ...faceOn(C, 1.3, 30, -0.1, 0.3) });
        q(C.gesture('tremor', { amount: 0, dur: 0.1 })); if (C.raw) { C.raw.finishGestures(); C.raw.armPose('R', null); }
        C.expr('sad');
        await C.gesture('sigh');
        await G.say('CHASE', '...He\'s just a bloke.');
        chaseSaved = true; lukeSaved = true;
      } else {
        // Chase can't hear him. He swings. (Aidan takes the hit.)
        G.cam({ ...faceOn(C, 1.6, 34, -0.1, 0.4) });
        C.expr('shout');
        q(C.gesture('swing', { hand: 'R' }));
        await G.wait(0.45);
        G.sfx('hit_heavy', { vol: 1.0 });
        await G.fade(1, 0.05);
        G.damage(30, 'story', { minHealth: 5, force: true });
        await G.wait(0.9);
        A.pose('kneel_one');
        L.gesture('hands_up', { dur: 0.1 });
        G.cam({ pos: [31.8, 1.5, 15.2], target: [30.0, 1.1, 13.9], fov: 36 });
        await G.fade(0, 0.8);
        // he stares at what he's done
        C.expr('wide'); C.look(A); C.eyes('at', A);
        await G.wait(2.2);
        if (C.raw) C.raw.hold('R', null);
        G.sfx('bar_concrete', { vol: 1.0, pos: [SO.chase[0], 0.1, SO.chase[1]] });
        C7_droppedBar(G, SO.chase[0] + 0.3, SO.chase[1] - 0.2);
        await G.wait(0.8);
        await chaseRuns();
        chaseSaved = false; lukeSaved = true;
      }
    } else if (pick === 'talk') {
      G.cam({ ...faceOn(A, 1.3, 32, -0.05, -0.4) });
      if (hits < 2) {
        await G.say('AIDAN', 'Chase! It\'s okay. He\'s her grandson. He\'s not— he\'s not him.');
        G.cam({ ...faceOn(C, 1.35, 32, -0.1, 0.3) });
        q(C.gesture('tremor', { amount: 0, dur: 0.1 })); if (C.raw) { C.raw.finishGestures(); C.raw.armPose('R', null); }
        C.expr('sad');
        await C.gesture('sigh');
        await G.wait(0.8);
        chaseSaved = true; lukeSaved = true;
      } else {
        await G.say('AIDAN', 'Chase! It\'s okay. He\'s her grandson. He\'s not— he\'s not him.');
        // Chase lunges. Luke shoves him away. Chase falls, scrambles up and runs into the fog.
        G.cam({ pos: [26.2, 1.5, 15.6], target: [29.9, 1.1, 14.2], fov: 38 });
        C.expr('shout');
        await C.walkTo(29.8, 13.3, { run: true, speed: 4 });
        q(L.gesture('reach', { hand: 'R', target: C, dur: 0.6 }));
        G.sfx('thud', { vol: 0.9 });
        C.place(30.2, 14.6); C.pose('collapse');
        await G.wait(1.2);
        await C.gesture('stand_up', { to: 'idle' });
        if (C.raw) C.raw.hold('R', null);
        G.sfx('bar_concrete', { vol: 0.9, pos: [30.2, 0.1, 14.6] });
        C7_droppedBar(G, 30.5, 14.9);
        await chaseRuns();
        chaseSaved = false; lukeSaved = true;
      }
    } else {
      // Run, or the timer runs out: Aidan backs away. Cut to black on a steel bar hitting concrete.
      G.track('A', 5, 'Ch 7: ran from the standoff');
      G.cam({ pos: [23.6, 1.5, 11.0], target: [28.0, 1.2, 12.2], fov: 38 });
      let t = 0;
      await G.loop((dt) => { t += dt; const p = A.pos; p.x -= dt * 0.9; p.z += dt * 0.15; if (A.raw) A.raw.setAnim('walk', { speed: -0.7 }); return t > 1.8; });
      A.pose('idle');
      await G.fade(1, 0.12);
      G.sfx('bar_concrete', { vol: 1.0 });
      await G.wait(2.4);
      L.remove(); C.remove();
      A.place(25.2, 13.3, 60);
      G.cam({ pos: [22.2, 1.35, 16.6], target: [29.4, 1.5, 10.8], fov: 40 });
      await G.fade(0, 1.6);
      await G.wait(2.2);
      chaseSaved = false; lukeSaved = false;
    }
    // (state)
    G.set('chaseSaved', chaseSaved);
    G.set('lukeSaved', lukeSaved);
    G.set('c7_standoff', true);
    // 5. both saved
    if (chaseSaved && lukeSaved) {
      G.cam({ pos: [25.2, 1.55, 14.3], target: [29.8, 1.3, 14.3], fov: 44, to: { fov: 40 }, dur: 6 });
      L.expr('tired'); q(L.gesture('hands_up', { dur: 0.1 })); if (L.raw) L.raw.finishGestures();
      C.look(L); C.eyes('down');
      await G.say('CHASE', 'Sorry. Sorry, mate. [beat] I thought you were someone else.');
      L.eyes('away', C);
      await G.wait(1.2);
      G.cam({ pos: [33.8, 1.6, 12.2], target: [29.8, 1.3, 14.4], fov: 42 });
      await G.wait(0.8);
      await G.say('LUKE', 'Yeah. [beat] Me too.');
      await G.wait(1.0);
    }
    note(G, 'Room 12. She might be awake.', 'c7_goal');
    await G.fade(1, 1.0);
    // (the car park after: whoever stayed)
    try { L.remove(); } catch (e) { /* actor */ }
    try { C.remove(); } catch (e) { /* actor */ }
    if (A.raw) { A.raw.finishGestures(); A.raw.idleLife = true; }
    A.pose('idle'); A.expr('neutral'); A.look(null);
    await G.goto('c7_carpark', { pos: [27.6, 13.2], yaw: 0 }, { fade: false, sound: 'none' });
    await G.fade(0, 1.2);
  }, { letterbox: true, skippable: true });
  // a snapped steel bar lying on the bitumen (dressing for the rest of the scene)
  function C7_droppedBar(G, x, z) {
    try {
      const b = Rig.prop('bar', {});
      b.position.set(x, 0.03, z); b.rotation.set(Math.PI / 2, 0, 0.7);
      if (World.build && World.build.group) World.build.group.add(b);
    } catch (e) { /* prop */ }
  }

  // =================================================================================================================
  // CUTSCENE 7-4 "Room 12" — the empty bed; the beige phone rings: SIGNAL HILL MAST; Nan; the mast through the window
  // =================================================================================================================
  defineCutscene('7-4', async (G) => {
    const A = G.aidan;
    if (A.raw) A.raw.idleLife = false;
    const ph = G.obj('c7r12:phone'), [px, pz] = R12.phone;
    // 1. Room 12, dim. The bed is empty, the blanket turned back. Her reading glasses lie folded on the pillow.
    G.cam({ pos: [3.6, 1.75, 0.5], target: [1.4, 0.95, 2.7], fov: 42, to: { pos: [3.4, 1.7, 0.62], fov: 38 }, dur: 6 });
    await A.walkTo(1.9, 3.05, { speed: 0.9 });
    await A.turn([0.6, 2.05], 0.5);
    A.look([0.6, 0.75, 2.05]); A.eyes('down');
    await G.wait(1.6);
    G.cam({ pos: [0.95, 1.12, 2.35], target: [0.5, 0.74, 2.1], fov: 30, to: { fov: 27 }, dur: 4 });
    await G.wait(2.4);
    // 2. the beige bedside phone rings; its little display reads SIGNAL HILL MAST
    try { ph.userData.setText('SIGNAL HILL MAST'); ph.userData.setRinging(true); } catch (e) { /* prop */ }
    const lcd = G.obj('c7r12:lcd');
    if (lcd && lcd.material) lcd.material.map = r12Lcd('SIGNAL HILL MAST');
    const ring = G.sfx('ring', { loop: true, pos: [px, 0.75, pz], vol: 0.9 });
    G.cam({ pos: [px + 0.36, 0.96, pz + 0.03], target: [px - 0.015, 0.67, pz + 0.016], fov: 22 });
    await G.wait(2.6);
    // 3. close on Aidan answering. Static, then a faint, patient voice.
    G.cam({ pos: [2.3, 1.55, 2.2], target: [0.8, 1.0, 3.1], fov: 36 });
    A.look(null);
    await A.walkTo(0.95, 3.1, { speed: 1.0 });
    await A.turn(-90, 0.4);
    q(A.gesture('reach', { hand: 'L', target: [px, 0.7, pz], dur: 0.7 }));
    await G.wait(0.55);
    try { if (ring) ring.stop(0.05); ph.userData.setRinging(false); if (ph.userData.handset) ph.userData.handset.visible = false; } catch (e) { /* prop */ }
    A.hold('L', 'handset', { color: '#d2c8ae', pose: { w: [0.07, 0.13, 0.02], pole: [1, -1, -0.3], fing: [0, 1, 0], palm: [-1, 0, 0.1], curl: 0.6, thumb: 0.45 } });
    G.sfx('click', { vol: 0.5 });
    G.cam({ ...faceOn(A, 0.7, 30, 0.05, 0.4), to: { fov: 26 }, dur: 12 });
    const hiss = G.sfx('static', { loop: true, vol: 0.22, phone: true });
    await G.wait(1.6);
    try { if (hiss) hiss.setVol(0.08, 1.0); } catch (e) { /* audio */ }
    G.music('nan');
    A.eyes('down'); A.expr('sad');
    await G.say('NAN (phone)', '...is that you, love? [beat] It\'s alright. I\'m still here. [static] Come up where it\'s clearer.');
    A.eyes('ahead');
    await G.wait(0.8);
    // 4. through the window: the mast on the hill, its red light blinking, above the fog for the first time
    G.cam({ pos: [2.4, 1.25, 2.7], target: [7.6, 5.9, -13.4], fov: 34, to: { pos: [2.55, 1.3, 2.4], fov: 30 }, dur: 7 });
    A.look([7.6, 5.9, -13.4]);
    await G.wait(4.6);
    // (state) the call is over; the chain on the summit gate lies on the ground now
    G.set('c7_room12', true);
    try { if (hiss) hiss.stop(0.4); } catch (e) { /* audio */ }
    A.hold('L', null);
    try { if (ph.userData.handset) ph.userData.handset.visible = true; ph.userData.setText(''); } catch (e) { /* prop */ }
    if (lcd && lcd.material) lcd.material.map = r12Lcd('');
    G.sfx('clunk', { vol: 0.8 });
    note(G, 'Room 12.', 'c7_goal', { done: true });
    note(G, 'The mast. Summit Road — the gate, north-east of the car park.', 'c7_mast');
    A.look(null);
    if (A.raw) A.raw.idleLife = true;
    await G.wait(0.6);
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // Chapter 7
  // =================================================================================================================
  defineChapter({
    n: 7, id: 'ch7', title: 'DISTRICT HOSPITAL', card: 'DISTRICT HOSPITAL',
    start: { room: 'c7_ringroad', entry: 'office' },
    // what a player carries into Chapter 7 (chapter select): the Prologue and Chapters 1–6
    debugState(s) {
      const give = (id, n = 1) => { if (!ITEMS[id]) return; const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      const MAPS7 = ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'map_care', 'rmap_care', 'map_office', 'rmap_office', 'map_office_upper'];
      for (const id of ['box_cutter', 'steel_bar', 'extinguisher', 'jumper_tool', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate', 'ticket', 'gate_key', 'visitor_pass', 'keycard', 'chloe_pin', ...MAPS7]) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('energy_drink', 1); give('first_aid', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      s.ammo = s.ammo || {}; s.ammo.extinguisher = Math.max(s.ammo.extinguisher | 0, 3);
      for (const id of MAPS7) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true,
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
        c3_bossDone: true, waiSaved: s.flags.waiSaved ?? true,
        c4_metChase: true, c4_clicks: true, c4_logs: 'read', c4_bossDone: true, c4_done: true, chaseHurt: (s.chaseHits | 0) >= 4,
        c5_pass: true, c5_chase: true, c5_l4: true, c5_chloe: true, c5_bossDone: true, c5_done: true, chloeSaved: s.flags.chloeSaved ?? true,
        c6_file: true, c6_case: 'open', c6_power: true, c6_office: true, c6_voice: true, c6_doors: true, c6_setpiece: true, c6_answer: 'no',
        lukaSaved: s.flags.lukaSaved ?? true, standardName: 'AIDAN', c6_done: true,
      });
      if (!s.flags.waiSaved) s.flags.waiLost = true;
      Object.assign(s.done, { 'c4:gateOpen': true, 'unlocked:c5_level4:escalations': true });
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'acct4', 'acct5', 'acct6', 'huddle1', 'huddle2', 'huddle3', 'huddle4', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note'), 'plaque', 'wai_email', 'oplog1', 'oplog2', 'oplog3', 'oplog4', 'oplog6', pick('fuse_note'), 'call_logs', 'chase_notes', 'rotary_card', 'chloe_pin', 'case_file', 'luka_notes']) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      for (const c of ['luka1', 'luka2', 'luka3', 'luka4', 'luka5', 'luka6', 'luka7']) s.calls[c] = s.calls[c] || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 7);
      for (const id of ['P-1', 'P-4', '1-1', '1-2', '1-3', '1-4', '1-7', '1-8', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '3-3b', '4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4', '6-case', '6-terminal', '6-1', '6-2']) s.done['cs:' + id] = true;
      Object.assign(s.done, { 'break:ch1': true, 'break:ch2': true, 'break:ch3': true, 'break:ch4': true, 'break:ch5': true, 'break:ch6': true });
      s.F = Math.max(s.F || 0, 33); s.A = Math.max(s.A || 0, 3); s.stats.freed = Math.max(s.stats.freed || 0, 6);
      s.chaseHits = s.chaseHits | 0;
      s.health = 100;
      s.notes = (s.notes || []).filter((n) => n && !/^c[1-6]_/.test(n.id || ''));
      s.notes.push({ id: 'c7_goal', text: 'The hospital. District Hospital — the ring road, east.', done: false });
    },
    async begin(G, o = {}) {
      G.bars(null);
      C7.pageUntil = -1; C7.pinning = false;
      if (G.once('c7:begin')) {
        note(G, 'The hospital. District Hospital — the ring road, east.', 'c7_goal');
      }
    },
  });
}
