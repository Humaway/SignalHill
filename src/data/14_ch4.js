// ==== data/14_ch4.js — Chapter 4 "Customer Care" (spec §10 Ch 4, §7A Wire Lane + the business park, §7B Customer Care
// Centre, §6 the Escalation / the Reach / the Unread, §2A riddle row "Ch 4 pulse dial", §8 Luka's call 4) — tag C4_ ====
// Rooms (CONTENT_PLAN §2):
//   c4_wirelane   Wire Lane: 90 × 8 m, descending west from the exchange's rear yard (x 90, y 3.2) to the business park
//                 (x 0): the cable depot's chain-link fence and its stacked drums (north), the humming substation behind
//                 its fence (south; a camera looks through it), cable drums, power poles, a payphone booth, an exchange van.
//                 yard → c3_yard:lane · park → c4_park:lane. Quiet: no enemies.
//   c4_park       The business park: a 60 × 40 m courtyard round a T-junction. The Customer Care Centre along the north
//                 (entrance canopy, glass doors → c4_lobby:entrance), its car park (Reach ×1), two locked warehouses south,
//                 the dead bus stop + payphone (Tethered ×1), the security boom gate east ("The boom gate's locked. There's
//                 a key slot." — gate_key after 4-3 → c5_ringroad:park; walking through it = CHAPTER CARD "LEVEL 4"), the
//                 west drop. CALL 4 rings on entering. lane → c4_wirelane:park.
//   c4_lobby      20 × 12 m: reception counter (map_care; "We are experiencing higher than normal call volumes."), dead
//                 turnstiles, the ticket machine ("You are number 4,112."), the Care Champion wall, the waiting area,
//                 the security back office door (east, maglock) → c4_secoffice:door, the floor door (north, Fog only).
//   c4_secoffice  5 × 4 m safe room: lockable door with a wired-glass window (a slice of the lobby / the old store is
//                 built outside it for the view), duress-alarm panel, first aid kit, the gate key on the key board.
//   c4_floor      The open plan, 50 × 28 m under a 4 m ceiling: eight cubicle rows (west block x 1.5–17.7, east block
//                 32.3–48.5, nine cubicles each), four raised team-leader pods in the centre (TEAM 3 SW: huddle2, the ringing
//                 phone with the pulse clicks; TEAM 1: acct5 in a drawer), the wallboard monitor bank on the north wall (the
//                 Unread), Chase's lamp-lit cubicle (row 6 west, 4-1), every desk phone ringing (each stops within 2 m;
//                 picking one up = DIALOGUE.desk_phone), Reach ×2, the rail camera with the draped arm, the records door
//                 (rotary dial 2231) NW, the break room door E. Outage: the west block becomes a maze (rows 2/4/6 gone, tall
//                 contract walls on rows 3/5/7, the walkway blocked beside rows 3 and 7), the centre sealed, headsets hanging
//                 like vines, receipt strips, every phone ringing; Reach ×3 + the Unread; the lobby doors (SW) → c4_oldstore.
//   c4_break      10 × 8 m break room: payphone, the break table, coffee ×2, energy drink.
//   c4_records    10 × 8 m: floor-to-ceiling dot-matrix shelves, the open binder under the lamp (IN-ENGINE 4-4), the
//                 printer that prints the receipt map (rmap_care) when the Outage takes the building.
//   c4_oldstore   The lobby as Chase's old store at 8:50 pm (Outage): counter, demo tables, the roller shutter half down,
//                 the red duress button under the counter, the maglocked back office (→ c4_secoffice). Cutscene 4-2 and
//                 the Escalation (enemy type c4_escalation, boss 'escalation').
// Cutscenes: 4-1 "A Funny Story" (c4_floor), 4-2 "Hit 'Em First" (c4_oldstore → the boss), 4-3 "Safe Room" (+ the
//   chaseHits ≥ 4 variant; c4_secoffice), in-engine 4-4 (the call logs, c4_records).
// State: S.flags c4_metChase, c4_clicks (the case number logged), c4_logs ('read'|'torn'), c4_outage, c4_bossDone,
//   c4_done (CONTENT_PLAN), chaseHurt (CONTENT_PLAN), S.chaseHits; S.done c4:* keys (listens, duress, gate …).
{
  const D2R = Math.PI / 180;
  const clamp = U.clamp, lerp = U.lerp;
  const FN = Tex.fonts, BR = Tex.brand;
  const riddle = () => (S.difficulty && S.difficulty.riddle) || 'normal';
  const flag = (k) => !!(S.flags && S.flags[k]);
  const done = (k) => !!(S.done && S.done[k]);
  const fv = (k) => (S.flags || {})[k];
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  const thinkAll = (...lines) => async (G) => { for (const l of lines) await G.think(l); };
  const busy = () => { try { return !!Script.busy || !!Enemies.paused; } catch (e) { return false; } };
  const weaponKind = () => { try { const w = Player.weapon(); return w && !w.shove ? w.rig || null : null; } catch (e) { return null; } };
  // transient presentation state (never saved)
  const C4 = { ring: null, far: [], esc: null, chase: null, fight: null, arm: null, armCam: false, podLed: null, bag: [], logs: null, pieces: null, lastCam: null };
  try { if (typeof window !== 'undefined' && window.SH) window.SH.c4 = C4; } catch (e) { /* tests only */ }

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash('c4:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c4:' + key;
    TEXC.set(key, t);
    return t;
  }
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  const hand = (ctx, s, x, y, o) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };

  // the reception's LED ticker: "We are experiencing higher than normal call volumes." (amber dot-matrix on black)
  const tickerTex = () => ctex('ticker', 1024, 96, (x, w, h) => {
    x.fillStyle = '#0b0906'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,150,40,0.08)';
    for (let yy = 6; yy < h; yy += 7) for (let xx = 6; xx < w; xx += 7) x.fillRect(xx, yy, 3, 3);
    x.save(); x.shadowColor = '#ff9a2e'; x.shadowBlur = 10;
    tx(x, 'We are experiencing higher than normal call volumes.', w / 2, 62, 38, '#ffb04a', { font: FN.mono, weight: 'bold', align: 'center' });
    x.restore();
  });
  // the acrylic desk sign on the counter (same words, printed)
  const deskSignTex = () => ctex('desksign', 384, 192, (x, w, h, r) => {
    x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 30);
    tx(x, 'CUSTOMER CARE', 14, 22, 18, '#fff', { weight: 'bold' });
    tx(x, 'We are experiencing', w / 2, 82, 26, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'higher than normal', w / 2, 116, 26, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'call volumes.', w / 2, 150, 26, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'Thank you for your patience.', w / 2, 180, 14, '#555', { align: 'center' });
    age(x, w, h, r, 0.4, { sun: 0.2 });
  });
  // the wallboard over the open plan (queue stats) — Fog / Outage
  const wallboardTex = (i, out) => ctex('wallboard' + i + (out ? 'o' : ''), 256, 160, (x, w, h, r) => {
    x.fillStyle = out ? '#050808' : '#06121a'; x.fillRect(0, 0, w, h);
    const rows = out
      ? [['CALLS WAITING', '∞'], ['LONGEST WAIT', 'TOMORROW'], ['SERVICE LEVEL', '0%'], ['AGENTS FREE', '0'], ['CALLBACKS DUE', '3'], ['WHO ARE YOU', 'TRYING TO REACH']]
      : [['CALLS WAITING', '4,112'], ['LONGEST WAIT', '2:14:07'], ['SERVICE LEVEL', '3%'], ['AGENTS FREE', '0'], ['AVG HANDLE', '11:42'], ['CALLBACKS DUE', '1,208']];
    const [k, v] = rows[i % rows.length];
    tx(x, k, w / 2, 40, 20, out ? '#c8302a' : '#7fd8d0', { weight: 'bold', align: 'center' });
    x.save(); x.shadowColor = out ? '#ff2a1c' : '#ffb02a'; x.shadowBlur = 12;
    tx(x, v, w / 2, v.length > 8 ? 108 : 122, v.length > 8 ? 30 : 64, out ? '#ff4030' : '#ffc040', { font: FN.mono, weight: 'bold', align: 'center' });
    x.restore();
    for (let y = 0; y < h; y += 3) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, y, w, 1); }
    age(x, w, h, r, 0.15);
  });
  // hanging aisle markers ("ROW 1" … "ROW 8")
  const rowTex = (n) => ctex('row' + n, 256, 96, (x, w, h, r) => {
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.yellow; x.fillRect(0, h - 12, w, 12);
    tx(x, 'ROW ' + n, w / 2, 62, 46, '#ffffff', { font: FN.heavy, align: 'center' });
    age(x, w, h, r, 0.5, { sun: 0.3 });
  });
  // the first page of the call log in the open binder (4-4): dot-matrix, Luke's three calls highlighted
  const LOG_LINES = [
    ['INBOUND CALL LOG — STORE 0412 (CITY)', 0],
    ['', 0],
    ['MON 09:14 · Caller: Luke (grandson of', 1], ['  account holder 4471-0932) · 6 min', 1],
    ['  Medical alarm not working since service', 0], ['  change on Saturday. Requesting callback.', 0], ['  Customer upset.', 0],
    ['  CALLBACK ASSIGNED: AIDAN.', 2],
    ['', 0],
    ['TUE 12:52 · Caller: Luke · 4 min', 1],
    ['  2nd call. No callback received. Account', 0], ['  holder is 79, lives alone, alarm not', 0], ['  connecting. URGENT.', 0],
    ['', 0],
    ['WED 17:30 · Caller: Luke · 2 min', 1],
    ['  3rd call. Very distressed. Advised', 0], ['  callback is scheduled.', 0],
  ];
  const logPageTex = () => ctex('logpage', 640, 820, (x, w, h, r) => {
    x.fillStyle = '#eef0e5'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 44) { x.fillStyle = 'rgba(120,180,130,0.22)'; x.fillRect(46, y, w - 92, 22); }
    for (let y = 14; y < h; y += 26) { x.fillStyle = '#d8d6c8'; x.beginPath(); x.arc(22, y, 7, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(w - 22, y, 7, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(80,80,70,0.25)'; x.setLineDash([4, 5]); x.beginPath(); x.moveTo(40, 0); x.lineTo(40, h); x.moveTo(w - 40, 0); x.lineTo(w - 40, h); x.stroke(); x.setLineDash([]);
    LOG_LINES.forEach(([s, hl], i) => {
      const y = 70 + i * 40;
      // (21 px mono: the longest line, 42 characters, fits the 640 px sheet inside the tractor holes)
      if (hl) { x.fillStyle = hl === 2 ? 'rgba(255,214,40,0.72)' : 'rgba(255,230,60,0.55)'; x.fillRect(52 + (r() - 0.5) * 4, y - 23, (s.length * 12.7) + 12, 30); }
      tx(x, s, 56, y, 21, hl === 2 ? '#141414' : '#2f302b', { font: FN.mono, weight: hl ? 'bold' : '' });
    });
    hand(x, 'Luke x3 — ?', w - 250, h - 60, { size: 26, color: '#b3261e' });
    tx(x, 'PAGE 1', w / 2, h - 18, 16, '#555', { font: FN.mono, align: 'center' });
    age(x, w, h, r, 0.35);
  });
  // the key board in the safe room
  const keyBoardTex = () => ctex('keyboard', 320, 256, (x, w, h, r) => {
    x.fillStyle = '#c9c1a8'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#5a4a30'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
    tx(x, 'KEYS — SIGN OUT / SIGN IN', w / 2, 30, 16, '#2a2a2a', { weight: 'bold', align: 'center' });
    const labs = ['DOCK', 'BIN STORE', 'ROOF', 'COMMS', 'BOOM GATE', 'LIFT', 'CAR 2', 'MAIL'];
    labs.forEach((s, i) => { const cx = 50 + (i % 4) * 74, cy = 80 + Math.floor(i / 4) * 96; x.fillStyle = '#e8e2cc'; x.fillRect(cx - 30, cy + 28, 60, 20); tx(x, s, cx, cy + 43, 11, '#222', { weight: 'bold', align: 'center' }); x.fillStyle = '#6a6a62'; x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill(); });
    hand(x, 'RETURN THE GATE KEY!!', 40, h - 12, { size: 16, color: '#1f2c6e' });
    age(x, w, h, r, 0.8);
  });
  // the duress-alarm panel in the safe room
  const duressPanelTex = () => ctex('duresspanel', 256, 320, (x, w, h, r) => {
    x.fillStyle = '#d8d4c4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#8a1f1a'; x.fillRect(0, 0, w, 44);
    tx(x, 'DURESS ALARM', w / 2, 30, 22, '#fff', { weight: 'bold', align: 'center' });
    ['LOBBY', 'FLOOR 1', 'RECORDS', 'DOCK', 'SECURITY'].forEach((s, i) => { const y = 84 + i * 40; x.fillStyle = '#3a1210'; x.beginPath(); x.arc(40, y - 7, 10, 0, Math.PI * 2); x.fill(); tx(x, s, 64, y, 18, '#222', { weight: 'bold' }); });
    tx(x, 'ACTIVATION RELEASES', w / 2, h - 40, 12, '#333', { align: 'center' });
    tx(x, 'SECURITY OFFICE MAGLOCK', w / 2, h - 22, 12, '#333', { weight: 'bold', align: 'center' });
    age(x, w, h, r, 0.6);
  });
  // "shouting faces" under the Escalation's split skin: pale faces, open mouths, eyes screwed shut (no blood — dark seams)
  const facesTex = () => ctex('faces', 256, 256, (x, w, h, r) => {
    x.fillStyle = '#231a1a'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 9; k++) {
      const cx = 30 + (k % 3) * 98 + (r() - 0.5) * 20, cy = 36 + Math.floor(k / 3) * 90 + (r() - 0.5) * 16, s = 26 + r() * 14;
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, s * 1.3); g.addColorStop(0, '#d7b8a4'); g.addColorStop(0.7, '#b58f7c'); g.addColorStop(1, 'rgba(60,40,36,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, s, s * 1.2, (r() - 0.5) * 0.6, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#3a2622'; x.lineWidth = 3;
      for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(cx + sx * s * 0.45 - 7, cy - s * 0.25); x.quadraticCurveTo(cx + sx * s * 0.45, cy - s * 0.18, cx + sx * s * 0.45 + 7, cy - s * 0.25); x.stroke(); }
      x.fillStyle = '#120808'; x.beginPath(); x.ellipse(cx, cy + s * 0.42, s * 0.34, s * 0.42, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(230,220,200,0.6)'; x.fillRect(cx - s * 0.2, cy + s * 0.08, s * 0.4, 4);
    }
    // seams between the faces
    x.strokeStyle = '#0c0707'; x.lineWidth = 6;
    for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(r() * w, 0); x.bezierCurveTo(r() * w, h * 0.3, r() * w, h * 0.7, r() * w, h); x.stroke(); }
  });
  // the split seam around a face patch (alpha edge)
  const seamTex = () => ctex('seam', 128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.72, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // a sheet torn from the call log (4-4 "Tear it up")
  const scrapTex = (i) => ctex('scrap' + i, 96, 96, (x, w, h, r) => {
    x.fillStyle = '#eef0e5'; x.beginPath(); x.moveTo(0, r() * 10); for (let k = 1; k < 7; k++) x.lineTo((k / 6) * w, r() * 14); x.lineTo(w, h - r() * 12); for (let k = 5; k > 0; k--) x.lineTo((k / 6) * w, h - r() * 14); x.lineTo(0, h); x.closePath(); x.fill();
    for (let y = 16; y < h - 8; y += 12) { x.fillStyle = 'rgba(50,50,44,0.55)'; x.fillRect(8, y, 20 + r() * 60, 3); }
    if (r() < 0.4) { x.fillStyle = 'rgba(255,220,50,0.5)'; x.fillRect(6, 30, 70, 12); }
  });
  // warehouse and park signs
  const boardTex = (key, lines, o = {}) => ctex('board|' + key, o.w || 512, o.h || 192, (x, w, h, r) => {
    x.fillStyle = o.bg || '#e9e4d2'; x.fillRect(0, 0, w, h);
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); }
    const n = lines.length, lh = (h - 20) / n;
    lines.forEach((l, i) => { const sz = (Array.isArray(o.size) ? o.size[i] : o.size) || Math.min(lh * 0.62, 56); tx(x, l, w / 2, 12 + lh * (i + 0.72), sz, o.fg || '#1d1d1d', { font: o.font || FN.sans, weight: o.weight ?? 'bold', align: 'center' }); });
    age(x, w, h, r, o.age ?? 0.9, { sun: o.sun ?? 0.35 });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Small builders shared by the rooms
  // ---------------------------------------------------------------------------------------------------------------
  // a flat plane lying on the floor
  const floorPlane = (K, x, y, z, w, d, mat, rotY = 0, o = {}) => K.plane(x, y, z, w, d, mat, { rot: [-90, 0, rotY], ...o });
  // a room's ambient (grey-teal in the Fog, sick teal in the Outage), blended with the Outage dissolve
  const AMB = { c0: new THREE.Color(), c1: new THREE.Color(), last: -1 };
  function C4_ambient(fog, out) {
    const k = clamp(Tex.outage || 0, 0, 1);
    const key = Math.round(k * 50) + fog[1] * 1000 + out[1] * 100000;
    if (key === AMB.last) return;
    AMB.last = key;
    AMB.c0.set(fog[0]).lerp(AMB.c1.set(out[0]), k);
    try { Render.setAmbient(AMB.c0.getStyle(), lerp(fog[1], out[1], k)); } catch (e) { /* render */ }
  }
  function C4_ambientOff() { AMB.last = -1; try { Render.setAmbient(null); } catch (e) { /* render */ } }
  // looping room sound that stops when the room unloads
  function C4_stopRing() {
    if (C4.ring) { for (const h of C4.ring.near.values()) { try { h.stop(0.12); } catch (e) { /* audio */ } } C4.ring.near.clear(); }
    for (const h of C4.far) { try { h.stop(0.4); } catch (e) { /* audio */ } }
    C4.far = [];
  }
  function C4_farRing(n, vol, lp) {
    for (const h of C4.far) { try { h.stop(0.3); } catch (e) { /* audio */ } }
    C4.far = [];
    if (typeof Snd === 'undefined') return;
    for (let i = 0; i < n; i++) { try { C4.far.push(Snd.play('ring', { loop: true, far: true, lp: lp + i * 300, vol: vol * (1 - i * 0.2), delay: i * 0.73 + 0.2 })); } catch (e) { /* audio */ } }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The ringing floor: every desk phone of the open plan (spec 4-2 / 4-5). Fog: each stops ringing for good when Aidan
  // comes within 2 m (its red message light goes out); Outage: every phone rings at once. One InstancedMesh carries the
  // blinking message lights; the three nearest ringing phones get real positional rings, a far bed carries the rest.
  // ---------------------------------------------------------------------------------------------------------------
  function C4_ringField(K, phones) {
    const n = phones.length;
    const geo = new THREE.BoxGeometry(0.03, 0.012, 0.03);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.name = 'c4:leds'; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    phones.forEach((p, i) => { m4.makeTranslation(p.x + 0.06, p.y + 0.066, p.z + 0.088); im.setMatrixAt(i, m4); im.setColorAt(i, col.set('#200808')); p.phase = (i * 0.37) % 1; p.ringing = true; });
    im.instanceMatrix.needsUpdate = true;
    K.mesh(im, { name: 'c4:leds' });
    const RF = { phones, im, near: new Map(), t: 0, pick: 0, onRed: new THREE.Color('#ff2a1c'), off: new THREE.Color('#1a0606') };
    C4.ring = RF;
    K.animate((dt) => {
      if (!RF.im.parent) return;
      RF.t += dt;
      const out = !!S.outage;
      const P = (typeof Player !== 'undefined' && Player.pos) ? Player.pos : null;
      for (let i = 0; i < n; i++) {
        const p = phones[i];
        const exists = !p.world || (p.world === 'outage') === out;
        if (!out && p.ringing && P && Math.abs(P.x - p.x) < 2 && Math.abs(P.z - p.z) < 2 && Math.hypot(P.x - p.x, P.z - p.z) < 2) p.ringing = false;
        const ring = exists && (out || p.ringing) && !p.special;
        const on = ring && ((RF.t * (out ? 1.3 : 0.9) + p.phase) % 1) < 0.45;
        RF.im.setColorAt(i, exists ? (on ? RF.onRed : RF.off) : col.set('#000000'));
      }
      if (RF.im.instanceColor) RF.im.instanceColor.needsUpdate = true;
      // the three nearest ringing phones ring for real
      RF.pick -= dt;
      if (RF.pick > 0 || !P || typeof Snd === 'undefined') return;
      RF.pick = 0.45;
      const cand = [];
      for (const p of phones) {
        if (p.special) continue;
        if (p.world && (p.world === 'outage') !== out) continue;
        if (!(out || p.ringing)) continue;
        const d = Math.hypot(P.x - p.x, P.z - p.z);
        if (d < (out ? 0.8 : 2) || d > 14) continue;
        cand.push([d, p]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const want = new Set(cand.slice(0, out ? 4 : 3).map((c) => c[1]));
      for (const [p, h] of [...RF.near]) if (!want.has(p)) { try { h.stop(0.08); } catch (e) { /* audio */ } RF.near.delete(p); }
      for (const p of want) if (!RF.near.has(p)) { try { RF.near.set(p, Snd.play('ring', { loop: true, pos: [p.x, p.y + 0.1, p.z], vol: out ? 0.7 : 0.5, rate: 0.96 + (p.phase * 0.08) })); } catch (e) { /* audio */ } }
    });
    return RF;
  }
  // picking up any desk phone: a short distorted snippet, in random order (DIALOGUE.desk_phone)
  function C4_snippet() {
    const lines = (DIALOGUE.desk_phone && DIALOGUE.desk_phone.length) ? DIALOGUE.desk_phone : ['Is anyone there?'];
    if (!C4.bag.length) { C4.bag = lines.map((l, i) => i); for (let i = C4.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [C4.bag[i], C4.bag[j]] = [C4.bag[j], C4.bag[i]]; } }
    const l = lines[C4.bag.pop()];
    return typeof l === 'string' ? l : (l && l.text) || 'Is anyone there?';
  }
  async function C4_deskPhone(G, p) {
    const A = G.aidan;
    p.ringing = false;
    const nh = C4.ring && C4.ring.near.get(p); if (nh) { try { nh.stop(0.05); } catch (e) { /* audio */ } C4.ring.near.delete(p); }
    await A.turn([p.x, p.z], 0.3);
    G.sfx('clunk', { pos: [p.x, p.y + 0.1, p.z], vol: 0.35 });
    A.hold('L', 'handset', { pose: 'phone_ear' });
    if (A.raw) A.raw.idleLife = false;
    await G.wait(0.5);
    G.sfx('static', { dur: 0.8, vol: 0.45 });
    await G.wait(0.5);
    G.sfx('murmur_crowd', { n: 1, dur: 2.4, phone: true, vol: 0.55 });
    await G.say('VOICE (phone)', C4_snippet());
    G.sfx('static', { dur: 0.5, vol: 0.4 });
    await G.wait(0.5);
    G.sfx('clunk', { pos: [p.x, p.y + 0.1, p.z], vol: 0.5 });
    A.hold('L', weaponKind());
    if (A.raw) A.raw.idleLife = true;
    S.done['c4:snippets'] = (S.done['c4:snippets'] | 0) + 1;
    if (S.done['c4:snippets'] === 2) await G.think('Every one of them has someone on it.');
  }

  // =================================================================================================================
  // 4A WIRE LANE — 90 × 8 m, descending west from the exchange's rear yard (x 90, y 3.2) to the business park (x 0).
  // Carriageway z −2.8…2.8, footpaths to ±4.2. North: the cable company's brick despatch wall (x 6–44), then the lines
  // depot's chain-link fence with its stacked drums (x 46–88). South: a guardrail over the fog (x 2–32), the substation
  // (x 35–42), a verge of poles and drums, the exchange van. The payphone booth outside the depot (x 57.5).
  // =================================================================================================================
  const WL = { H: 3.2, L: 90 };
  const wlY = (x) => clamp(x, 0, WL.L) * WL.H / WL.L;
  defineRoom({
    id: 'c4_wirelane', name: 'WIRE LANE', area: 'WIRE LANE', chapter: 4, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [{ box: [-1, -4.3, 91, -2.8], s: 'concrete' }, { box: [-1, 2.8, 91, 4.3], s: 'concrete' }],
    bounds: [-1, -4.3, 91, 4.3],
    entries: { yard: [88.3, 0.4, -90], park: [1.7, -0.4, 90], start: [88.3, 0.4, -90] },
    cameras: [
      // the empty lane first: from down the hill looking back up at the yard gate he comes out of
      { id: 'c4_wirelane:east', vol: [74, -4.3, 91, 4.3], type: 'static', pos: [66.5, wlY(66.5) + 3.6, 3.2], target: [84.5, wlY(84.5) + 0.7, -0.6], fov: 'fit' },
      // outside the lines depot: a rail along the south verge, him side-on against the chain-link, the stacked drums and
      // the payphone booth (a far pan lost him in the fog past 25 m)
      { id: 'c4_wirelane:phone', vol: [44, -4.3, 74, 4.3], type: 'rail', pos: [59, wlY(59) + 3.0, 7.0], fov: 50, rail: { a: [44, wlY(44) + 3.0, 7.0], b: [74, wlY(74) + 3.0, 7.0], look: [0, 0.9, -1.6], lag: 0.4 } },
      // through two chain-link fences and past the transformer: the substation hums in the foreground
      { id: 'c4_wirelane:sub', vol: [34, -4.3, 44, 4.3], type: 'pan', pos: [40.6, wlY(40.6) + 3.9, 9.4], target: [38, wlY(38) + 0.6, 0], fov: 50, pan: { lag: 0.25, yaw: 60, pitch: 30 } },
      // along the despatch wall: a rail out over the embankment, looking back at him and the bricks
      { id: 'c4_wirelane:rail', vol: [8, -4.3, 34, 4.3], type: 'rail', pos: [18, wlY(18) + 2.3, 6.2], fov: 50, rail: { a: [7, wlY(7) + 2.3, 6.2], b: [35, wlY(35) + 2.3, 6.2], look: [0, 1.0, -1.2], lag: 0.4 } },
      // the bottom of the lane: it bends away into the fog toward the business park (nothing past the bend until he commits)
      { id: 'c4_wirelane:west', vol: [-1, -4.3, 8, 4.3], type: 'static', pos: [15.8, wlY(15.8) + 2.5, -1.8], target: [2.2, 0.4, 0.8], fov: 'fit' },
    ],
    build(K) {
      // ---- ground ---------------------------------------------------------------------------------------------------
      K.road(-1, -2.8, 91, 2.8, { axis: 'x', markings: 'center', footpath: 1.4, slope: { y0: -WL.H / WL.L, y1: WL.H + WL.H / WL.L } });
      K.dress('leaves', [0, -4.1, 88, -3.0], 60, { seed: 41 });
      K.dress('leaves', [0, 3.0, 88, 4.1], 50, { seed: 42 });
      K.dress('papers', [2, -2.5, 86, 2.5], 10, { seed: 43 });
      // boundaries (the ends are exits)
      K.collider(-2, -7, 92, -4.28, { h: 3 });
      K.collider(-2, 4.28, 92, 7, { h: 3 });

      // ---- NORTH: the cable company's despatch wall ----------------------------------------------------------------------
      K.wall(6, -4.36, 44.5, -4.36, 6.2, { tex: 'brick', color: '#8d7462' }, { thick: 0.3, grime: true });
      K.box(25.25, 6.2, -4.45, 38.8, 0.3, 0.55, { tex: 'concrete', color: '#7b7d77' });
      K.prop('roller_door', 24, -4.15, 0, { w: 3.6, h: 3.0, open: 0, color: '#8a9088', y: wlY(24) + 0.15 });
      K.sign('SIGNAL HILL CABLE & LINE — DESPATCH', 24, wlY(24) + 3.8, -4.2, 4.8, 0.45, { style: 'shop', bg: '#2a3a44', fg: '#e8e4d2' });
      K.sign('NO PARKING\nDRIVEWAY IN CONSTANT USE', 30.4, wlY(30.4) + 1.9, -4.2, 0.9, 0.5, { style: 'council' });
      K.writing('WHO ARE YOU TRYING TO REACH', 13.2, wlY(13) + 1.55, -4.2, 2.8, { rotY: 0, world: 'fog' });
      for (const x of [8.5, 16, 34, 41]) K.box(x, wlY(x) + 2.6, -4.22, 1.3, 0.9, 0.05, { color: '#15191a', roughness: 0.2, metalness: 0.3 });
      K.prop('bin', 29, -3.75, 0, { variant: 'wheelie' });
      K.prop('pallet', 19.4, -3.8, 8);
      // ---- NORTH: the lines depot fence and its drums --------------------------------------------------------------------
      K.box(45.4, 0, -4.5, 0.5, 6.2 + 1.7, 0.5, { tex: 'brick', color: '#8d7462' });
      for (let x = 49; x < 89; x += 6) K.prop('chainlink', x, -4.4, 0, { len: 6, h: 2.2, y: wlY(x) + 0.12 });
      const DR = [[48.5, -6.2, 0.8], [51, -7.4, 0.8], [53.8, -6.1, 0.6], [57, -8.2, 0.9], [60.2, -6.3, 0.8], [62.8, -7.6, 0.7], [66, -6.2, 0.8], [69, -8.4, 0.9], [72.4, -6.3, 0.8], [75.5, -7.5, 0.7], [79, -6.2, 0.8], [82.4, -8.3, 0.9], [85.6, -6.4, 0.8]];
      DR.forEach(([x, z, r], i) => K.prop('cable_drum', x, z, i % 2 ? 90 : 0, { radius: r, y: wlY(x) }));
      for (const [x, z] of [[51, -7.4], [69, -8.4], [82.4, -8.3]]) K.prop('cable_drum', x, z, 90, { radius: 0.6, y: wlY(x) + 1.62, variant: 'flat' });
      K.prop('hut', 76, -11.5, 0, { w: 4, d: 3, text: 'LINES DEPOT', y: wlY(76) - 0.05 });
      K.box(66, wlY(66) - 0.1, -9, 42, 0.1, 9, { tex: 'gravel', color: '#77766c' }, { shadow: false });
      K.sign('TELECOM LINES DEPOT\nAUTHORISED VEHICLES ONLY', 47.4, wlY(47.4) + 1.55, -4.32, 1.4, 0.6, { style: 'council', bg: '#e8e4d2' });
      // ---- street furniture -------------------------------------------------------------------------------------------
      K.prop('streetlight', 14, -3.95, 0, { bank: 1 });
      K.prop('streetlight', 38, -3.95, 0, { lit: false });
      K.prop('streetlight', 62, -3.95, 0, { bank: 2, flicker: true });
      K.prop('streetlight', 84, -3.95, 0, { bank: 3 });
      K.payphone(57.5, -3.62, 0, { id: 'c4_wirelane:payphone' });
      K.prop('sign_post', 5.8, -3.85, 0, { text: 'WIRE LN', text2: 'BUSINESS PARK →' });
      for (const x of [48, 66, 84]) K.prop('power_pole', x, 4.9, 0, { span: 18, y: wlY(x) });

      // ---- SOUTH: guardrail over the fog, the substation, the verge ------------------------------------------------------
      for (let x = 5; x < 32; x += 6) K.prop('guardrail', x, 4.36, 0, { len: 6, collide: false, y: wlY(x) + 0.1 });
      K.box(17, wlY(17) - 1.4, 7.5, 32, 1.2, 6, { tex: 'grass', color: '#636b58' }, { shadow: false });
      K.prop('substation', 38.5, 7.2, 180, { w: 7, d: 5.2, y: wlY(38.5) });
      K.box(38.5, wlY(38.5) - 0.02, 7.2, 7.2, 0.05, 5.4, { tex: 'gravel', color: '#6f6e66' }, { shadow: false });
      K.box(66, wlY(66) - 0.05, 6.5, 44, 0.06, 4.4, { tex: 'grass', color: '#5f6656' }, { shadow: false });
      K.prop('cable_drum', 52.2, 6.2, 0, { radius: 0.8, y: wlY(52.2) });
      K.prop('cable_drum', 55, 6.0, 0, { radius: 0.7, y: wlY(55), variant: 'flat' });
      K.prop('cable_drum', 74.5, 6.3, 90, { radius: 0.8, y: wlY(74.5) });
      K.prop('cable_drum', 65.2, 3.55, 0, { radius: 0.55, variant: 'flat' });
      K.prop('cable_drum', 79.2, 1.7, 90, { radius: 0.7 });
      K.prop('car', 70.4, 5.9, 90, { color: '#d9d8cf', variant: 'wagon', y: wlY(70.4) });
      K.sign('LINES', 70.4, wlY(70.4) + 0.95, 5.02, 0.9, 0.22, { style: 'shop', bg: '#e8e6dc', fg: '#0b4f52', rotY: 180 });
      K.prop('cone', 60.6, 3.4, 0); K.prop('cone', 59.2, 3.5, 30);
      K.box(60, wlY(60) + 0.15, 3.6, 0.9, 0.02, 0.6, { color: '#070808', roughness: 1 });
      K.box(60.7, wlY(60) + 0.15, 3.95, 0.9, 0.05, 0.6, { tex: 'concrete', color: '#8a8a82' }, { rot: 12 });
      K.prop('bollard', 33.2, 4.0, 0); K.prop('bollard', 43.6, 4.0, 0);
      // the exchange yard gate at the top (open since the Restructure) and the back of the exchange in the fog
      K.box(90.6, wlY(90), -4.4, 0.5, 2.6, 0.5, { tex: 'brick', color: '#7d6a5a' }, { collide: true });
      K.box(90.6, wlY(90), 4.4, 0.5, 2.6, 0.5, { tex: 'brick', color: '#7d6a5a' }, { collide: true });
      K.prop('chainlink', 92.2, -2.6, 70, { len: 3.4, h: 2.2, collide: false });
      K.box(104, wlY(90) - 0.2, 0, 14, 6.4, 26, { tex: 'brick', color: '#6d5b4d' });
      K.box(104, wlY(90) + 6.2, 0, 14.4, 0.5, 26.4, { tex: 'concrete', color: '#6a6a64' });
      for (const z of [-9, -4.5, 4.5, 9]) K.box(96.95, wlY(90) + 2.6, z, 0.1, 1.6, 1.2, { color: '#101314', roughness: 0.3 });
      K.box(94.5, wlY(90) - 0.02, 0, 7, 0.04, 10, { tex: 'concrete', color: '#8a8880' }, { shadow: false });
      K.sign('SIGNAL HILL TRUNK EXCHANGE\nREAR YARD — NO ENTRY', 90.3, wlY(90) + 1.8, -4.12, 1.4, 0.55, { style: 'council', rotY: 0 });
      K.light('street', 94, wlY(94) + 5.5, 1.5, { real: false, haloSize: 3.4, haloOpacity: 0.35 });
      // human leftovers
      K.box(33, wlY(33) + 0.01, -1.4, 0.12, 0.13, 0.3, { color: '#3a2c20', roughness: 0.8 }, { rot: 30 });
      K.cyl(65.4, wlY(65.4) + 0.15 + 0.92, 3.4, 0.045, 0.3, { tex: 'metal', color: '#6a8a7a' });
      K.writing('IT\'LL BE FINE', 38.8, wlY(38.8) + 1.35, -4.2, 1.4, { rotY: 0, world: 'fog' });

      // ---- exits --------------------------------------------------------------------------------------------------------
      K.exit({ id: 'c4_wirelane:yard', box: [89.4, -4.3, 90.9, 4.3], to: 'c3_yard', entry: 'lane', when: () => !!ROOMS.c3_yard, blockedMsg: 'The phones are the other way.' });
      K.exit({ id: 'c4_wirelane:park', box: [-1, -4.3, 0.4, 4.3], to: 'c4_park', entry: 'lane' });
      // the lane carries on round the bend into the fog (visual only; the exit takes him first)
      K.box(-16, -0.62, 0, 30, 0.6, 5.6, { tex: 'bitumen', color: '#3a3c3b' }, { shadow: false, rot: -2 });
      for (const zz of [-3.5, 3.5]) K.box(-16, -0.5, zz, 30, 0.6, 1.4, { tex: 'footpath', color: '#8a8880' }, { shadow: false, rot: -2 });
      for (let x = -3; x > -30; x -= 6) K.prop('chainlink', x, -4.45, 0, { len: 6, h: 2.0, collide: false, y: -0.1 + x * 0.03 });
      K.prop('streetlight', -9, -3.9, 0, { real: false, bank: 1, y: -0.3 });

      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      K.examine(60.2, wlY(60) + 1.4, -4.2, ['Cable drums. Enough copper on them to wire the whole hill.', 'Stacked like somebody planned to come back for them.'], { id: 'c4wl:drums', r: 1.6 });
      K.examine(38.5, wlY(38.5) + 1.4, 4.2, ['It\'s humming. [beat] The only thing on this hill that\'s still switched on.', 'Danger. High voltage. Keep out. [beat] Everything up here has a sign that says keep out.'], { id: 'c4wl:sub', r: 1.8 });
      K.examine(24, wlY(24) + 1.4, -4.1, ['Cable and Line, despatch. The roller door\'s padlocked at the bottom.', 'Somebody chalked a tally on it. Days, maybe. It stops at forty-one.'], { id: 'c4wl:despatch', r: 1.8 });
      K.examine(70.4, wlY(70.4) + 1.1, 4.1, ['An exchange van. LINES on the door. Moss on the windscreen.', 'A hi-vis vest on the passenger seat. Folded, like he was coming back.'], { id: 'c4wl:van', r: 1.6 });
      K.examine(60, wlY(60) + 0.5, 3.6, 'A cable pit with the lid off. Rainwater and old copper, all tangled.', { id: 'c4wl:pit', r: 1.3 });
      K.examine(65.2, wlY(65.2) + 0.9, 3.5, 'A thermos on a cable drum. Half full. Stone cold.', { id: 'c4wl:thermos', r: 1.2 });
      K.examine(33, wlY(33) + 0.4, -1.4, 'One work boot. The laces are still done up.', { id: 'c4wl:boot', r: 1.2 });
      K.examine(48, wlY(48) + 1.5, 4.1, ['A notice on the pole. "Your new network is here!"', 'Nobody told the hill.'], { id: 'c4wl:poster', r: 1.4 });
      K.examine(17, wlY(17) + 1.1, 4.1, ['Past the rail it just drops away into white.', 'The whole town\'s down there somewhere. I can\'t see any of it.'], { id: 'c4wl:rail', r: 2.0 });
      K.examine(5.8, 1.5, -3.6, 'Wire Lane. Down the hill to the business park.', { id: 'c4wl:sign', r: 1.4 });
      K.examine(89, wlY(89) + 1.4, 0, async (G) => {
        if (flag('waiSaved')) await G.think('The exchange. [beat] Wai\'s back on his board. Keeping the line open.');
        else await G.think('The exchange. [beat] Nobody\'s on the board now.');
      }, { id: 'c4wl:yard', r: 2.2 });
      K.pickup('coffee', 64.95, wlY(64.95) + 0.15 + 0.92, 3.72, { id: 'c4_wirelane:coffee', extraOnEasy: true, rot: 30 });
    },
    async onEnter(G) {
      // somewhere down the hill, a lot of phones are ringing
      C4_farRing(1, 0.05, 520);
      if (S.chapter === 4 && G.once('c4:laneThought')) {
        await G.wait(2.5);
        await G.think('Phones. [beat] Somewhere down the hill, a lot of phones.');
      }
    },
    onLeave() { C4_stopRing(); },
  });

  // =================================================================================================================
  // 4A THE BUSINESS PARK — 60 × 40 m round a T-junction. The Customer Care Centre's facade along z 3.5 (the glass doors
  // at x 30 under the canopy), its car park (z 3.6–14.5), the park road (carriageway z 16–23, footpaths to 14.5 / 24.5)
  // from the west drop (x 0–3) to the security boom gate (x 53) and the ring road beyond (x 60); south: warehouse A
  // (x 3–21), the dead bus stop + payphone (x 21–35), the stem down to Wire Lane (x 35–43), warehouse B (x 44–60).
  // =================================================================================================================
  const BOOM = { x: 53.1, z: 23.75, len: 7.9 };
  defineRoom({
    id: 'c4_park', name: 'BUSINESS PARK', area: 'SIGNAL HILL BUSINESS PARK', chapter: 4, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    surfaces: [{ box: [3, 14.4, 60, 16], s: 'concrete' }, { box: [3, 23, 60, 27.6], s: 'concrete' }, { box: [26.8, 3.5, 33.2, 14.4], s: 'concrete' }],
    bounds: [0, 3.5, 60.6, 40.6],
    entries: { lane: [39, 38.7, 180], lobby: [30, 5.4, 0], ring: [57.9, 19.5, -90], start: [39, 38.7, 180] },
    cameras: [
      // the empty stem from the junction, then him walking up it out of the fog
      { id: 'c4_park:stem', vol: [35, 24.6, 43, 40.6], type: 'static', pos: [39, 3.9, 20.2], target: [39, 0.3, 33.5], fov: 'fit' },
      // across the road at the dead bus stop (the Tethered waiting inside, facing the back glass)
      { id: 'c4_park:busstop', vol: [21, 23.4, 35, 27.6], pri: 1, type: 'static', pos: [28, 2.4, 13.6], target: [28, 0.9, 25.6], fov: 'fit' },
      // along the road, west: from behind the warehouse front and the bus shelter's scratched back glass
      { id: 'c4_park:roadW', vol: [3, 14.4, 35, 24.6], type: 'rail', pos: [18, 2.3, 27.25], fov: 50, rail: { a: [3.5, 2.3, 27.25], b: [34.5, 2.3, 27.25], look: [0, 1.0, -1.5], lag: 0.4 } },
      // along the road, east: from the car park, the warehouses and the stem behind him
      { id: 'c4_park:roadE', vol: [35, 14.4, 53, 27.6], type: 'rail', pos: [44, 3.4, 11.2], fov: 48, rail: { a: [35.5, 3.4, 11.2], b: [52.5, 3.4, 11.2], look: [0, 1.0, 1.5], lag: 0.4 } },
      // high over the west car park from the road (the Reach among the cars): a rail, so the fog never swallows him
      { id: 'c4_park:carW', vol: [3, 3.6, 22, 14.4], type: 'rail', pos: [12, 4.2, 16.6], fov: 50, rail: { a: [3, 4.2, 16.6], b: [22, 4.2, 16.6], look: [0, 0.9, -1.2], lag: 0.4 } },
      // low from the road, up at the canopy and the sign
      { id: 'c4_park:entrance', vol: [22, 3.6, 38, 14.4], type: 'pan', pos: [30.2, 0.45, 19.2], target: [30.2, 2.4, 4.5], fov: 54, pan: { lag: 0.3, yaw: 66, pitch: 34 } },
      { id: 'c4_park:carE', vol: [38, 3.6, 53.2, 14.4], type: 'rail', pos: [45, 4.2, 16.6], fov: 50, rail: { a: [38, 4.2, 16.6], b: [53.2, 4.2, 16.6], look: [0, 0.9, -1.2], lag: 0.4 } },
      // the security gate: the boom, the gatehouse, the ring road lost in the fog beyond
      { id: 'c4_park:gate', vol: [53, 14.4, 60.6, 27.6], type: 'static', pos: [46.2, 3.6, 12.2], target: [56.5, 0.8, 19.6], fov: 'fit' },
    ],
    spawns: [
      // waiting in the bus shelter, facing its back glass
      { id: 'c4_park:teth', type: 'tethered', pos: [26.3, 25.9], rot: 5, anchor: [26.3, 25.9], cardigan: '#5a6a4a' },
      // among the cars, back to the entrance path
      { id: 'c4_park:reach', type: 'reach', pos: [13.2, 9.4], rot: -100 },
    ],
    build(K) {
      // ---- ground -------------------------------------------------------------------------------------------------------
      K.road(3, 16, 60.6, 23, { axis: 'x', markings: 'center', footpath: 1.5 });
      K.road(36.5, 24.5, 41.5, 40.6, { axis: 'z', markings: 'none', footpath: 1.3 });
      K.floor(3, 3.5, 53.2, 14.5, 'bitumen');
      K.floor(26.8, 3.5, 33.2, 14.5, { tex: 'concrete', color: '#8e8c84' }, { y: 0.02 });
      K.floor(21, 24.5, 35.2, 27.6, { tex: 'concrete', color: '#8a8880' }, { y: 0.15 });
      K.box(12, 0, 26.05, 18, 0.55, 2.9, { tex: 'concrete', color: '#7f7c73' }, { collide: true });
      K.box(12, 0.55, 26.05, 17.6, 0.04, 2.6, { tex: 'dirt', color: '#4a4236' }, { shadow: false });
      for (const px of [5, 9.5, 14, 18.5]) K.prop('shrub', px, 26.1, 0, { w: 1.4, h: 0.8, dead: true, collide: false, y: 0.58 });
      K.floor(42.8, 24.5, 60.6, 27.5, { tex: 'concrete', color: '#85837b' }, { y: 0.15 });
      K.box(57, -0.02, 9, 7.6, 0.04, 11, { tex: 'gravel', color: '#76746a' }, { shadow: false });
      // bays: two rows of white lines either side of the entrance path
      for (const [x0, x1] of [[5, 26], [34, 53]]) {
        for (let x = x0; x <= x1 + 0.01; x += 2.6) { floorPlane(K, x, 0.012, 7.3, 0.1, 4.6, { color: '#d9d6cc', roughness: 0.8 }); floorPlane(K, x, 0.012, 12.2, 0.1, 3.6, { color: '#d9d6cc', roughness: 0.8 }); }
        floorPlane(K, (x0 + x1) / 2, 0.012, 5.0, x1 - x0, 0.1, { color: '#d9d6cc', roughness: 0.8 });
      }
      floorPlane(K, 24.3, 0.013, 12.2, 2.2, 3.2, { color: '#1f5a8a', roughness: 0.8, transparent: true, opacity: 0.35 });
      K.dress('leaves', [3.2, 14.5, 52, 16], 50, { seed: 51, y: 0.16 });
      K.dress('leaves', [3.2, 3.8, 52, 14], 70, { seed: 52 });
      K.dress('papers', [4, 16, 52, 23], 12, { seed: 53 });
      K.dress('leaves', [36.6, 25, 41.4, 40], 40, { seed: 54 });

      // ---- NORTH: the Customer Care Centre ----------------------------------------------------------------------------------
      const FAC = { tex: 'concrete', color: '#9a978c' };
      const wins = []; for (let x = 3; x < 58; x += 4.2) if (Math.abs(x + 1.4 - 30) > 3.6) wins.push({ at: x + 1.4, w: 3.2, h: 1.5, sill: 1.0, glass: true });
      K.wall(-0.2, 3.5, 60.8, 3.5, 5.6, FAC, { thick: 0.35, openings: [{ at: 30.2, w: 1.95, h: 2.45 }, ...wins], grime: true });
      K.box(30.3, 0, 1.6, 61, 5.6, 0.1, { color: '#070909', roughness: 1 });
      for (let x = 1; x < 60; x += 8.4) K.box(x, 0, 3.72, 0.35, 5.6, 0.12, { tex: 'concrete', color: '#aaa699' });
      K.box(30.3, 5.6, 3.5, 61, 0.35, 0.55, { tex: 'concrete', color: '#85827a' });
      K.plane(30.2, 4.75, 3.7, 2.2, 0.8, Tex.wordmark({ w: 2.2, h: 0.8, bg: BR.teal, age: 0.6 }), { rotY: 0, emissive: true, emissiveIntensity: 0.55 });
      K.light('point', 30.2, 4.6, 4.6, { color: '#6fd8d0', intensity: 3, distance: 6, bank: 1, name: 'c4park:sign', flicker: true });
      K.sign('CUSTOMER CARE CENTRE', 30, 3.95, 3.69, 5.2, 0.5, { style: 'shop', bg: '#0b4f52', fg: '#f4f3ee' });
      K.door({ id: 'c4_park:doors', x: 30.2, z: 3.5, rot: 0, w: 1.9, h: 2.4, style: 'glass_double', to: 'c4_lobby', entry: 'entrance' });
      // the entrance canopy on two columns, a bench, the smokers' bin, three bare flagpoles
      K.box(30.2, 2.95, 5.2, 6.4, 0.28, 3.4, { tex: 'concrete', color: '#a19e93' });
      K.box(30.2, 3.23, 6.85, 6.4, 0.3, 0.12, { color: '#0b4f52', roughness: 0.5 });
      for (const cx of [27.3, 33.1]) K.cyl(cx, 0.02, 6.5, 0.14, 2.95, { tex: 'concrete', color: '#b3ae9f' }, { collide: true });
      K.light('lamp', 30.2, 2.85, 5.0, { color: '#ffd9a0', intensity: 5, distance: 7, bank: 1, name: 'c4park:canopy' });
      K.prop('bench', 35.6, 4.4, 180, { len: 1.6 });
      K.prop('bin', 34.2, 4.3, 180, { variant: 'street' });
      K.cyl(25.4, 0.02, 4.3, 0.18, 1.0, { tex: 'metal', color: '#6a6e6c' }, { collide: true });
      for (const fx of [37.2, 38.2, 39.2]) K.cyl(fx, 0.02, 5.6, 0.05, 7.2, { tex: 'metal', color: '#c2c6c4' }, { collide: true });
      for (const [px, pz] of [[20.5, 4.3], [40.5, 4.3], [13, 4.3]]) K.prop('shrub', px, pz, 0, { w: 1.6, h: 0.9, dead: true, collide: false });
      K.writing('DID YOU CHECK', 18.3, 1.45, 3.7, 1.6, { rotY: 0, world: 'fog' });
      // ---- the car park -----------------------------------------------------------------------------------------------------
      K.prop('hatchback', 8.3, 11.3, 180, { color: '#7a7f86' });
      K.prop('car', 16.1, 11.6, 3, { color: '#54606e' });
      K.prop('car', 21.2, 7.0, 188, { color: '#8a8478', variant: 'wagon' });
      K.prop('car', 44.1, 11.4, 180, { color: '#7a2a24' });
      K.prop('hatchback', 49.3, 7.2, 5, { color: '#c9c6ba' });
      K.prop('sign_post', 24.3, 13.9, 180, { style: 'council', text: 'RESERVED\nTEAM LEADER\nOF THE MONTH', bg: '#e8e4d2', w: 0.7, h: 0.6 });
      K.prop('trolley', 11.2, 5.6, 60, {});
      K.sticker('sticker07', 24.35, 0.62, 14.0, 180, {});
      // the west edge: a rail, then nothing
      K.prop('guardrail', 2.7, 9.0, 90, { len: 11, collide: false });
      K.collider(0, 3.5, 2.95, 14.45, { h: 2 });
      K.box(-6, -0.4, 9, 12, 0.3, 11, { tex: 'grass', color: '#5a6250' }, { shadow: false });
      // the east edge: a palisade fence to the gatehouse
      K.collider(53.2, 3.5, 53.6, 16, { h: 2.4 });
      for (let z = 3.8; z < 15.5; z += 3.9) K.prop('chainlink', 53.4, z + 1.95, 90, { len: 3.9, h: 2.1, collide: false });
      K.prop('hut', 56.8, 11.2, 0, { w: 3.2, d: 2.6, text: 'SECURITY' });
      K.collider(53.6, 14.25, 60.7, 14.45, { h: 2.2 });
      for (let x = 53.6; x < 60.6; x += 3.5) K.prop('chainlink', x + 1.75, 14.35, 0, { len: 3.5, h: 2.1, collide: false, y: 0.15 });
      K.sign('ALL VISITORS PLEASE\nREPORT TO RECEPTION', 55.3, 1.6, 14.42, 1.2, 0.5, { style: 'council', rotY: 0 });

      // ---- the road -----------------------------------------------------------------------------------------------------------
      K.drop(-2, 14.4, 3, 24.6, { side: 'e', msg: 'The road ends here.' });
      K.prop('streetlight', 10, 14.9, 0, { bank: 2 });
      K.prop('streetlight', 26, 14.9, 0, { lit: false });
      K.prop('streetlight', 46, 14.9, 0, { bank: 2, flicker: true });
      K.prop('streetlight', 33, 24.1, 180, { bank: 3 });
      K.prop('sign_post', 43.3, 24.1, 180, { text: 'CARE WAY', text2: 'WIRE LN ↓' });
      K.prop('sign_post', 50.6, 15.0, 0, { style: 'council', text: 'SECURITY GATE\nSTOP — KEY ACCESS', bg: '#e8e4d2', w: 0.9, h: 0.5 });
      // the security boom gate (gate_key after Chapter 4 ends)
      K.prop('boom_gate', BOOM.x, BOOM.z, 90, { len: BOOM.len, name: 'c4_boom', open: done('c4:gateOpen') ? 1 : 0 });
      K.collider(52.9, 23.9, 53.3, 27.6, { h: 2.2 });
      K.collider(52.95, 14.2, 53.25, 15.8, { h: 2.2 });
      K.prop('chainlink', 53.1, 15.0, 90, { len: 1.6, h: 2.0, collide: false, y: 0.15 });
      K.prop('chainlink', 53.1, 25.7, 90, { len: 3.6, h: 2.0, collide: false, y: 0.15 });
      K.interact(BOOM.x - 0.1, 1.0, BOOM.z + 0.1, (G) => C4_boomGate(G), { id: 'c4_park:boom', r: 1.5 });
      K.examine(55.5, 1.2, 15.2, ['The gatehouse. Empty. A radio on the desk, turned right down.', 'The sign-in sheet\'s blank for weeks.'], { id: 'c4pk:hut', r: 1.8 });
      // the ring road: through the gate (the chapter card as he walks on)
      K.trigger([56.2, 14.5, 58.8, 24.5], (G) => C4_toLevel4(G), { id: 'c4_park:toCh5', once: false, when: (s) => s.chapter === 4 && !!(s.done && s.done['c4:gateOpen']) });
      K.exit({ id: 'c4_park:ring', box: [59.4, 14.4, 60.7, 24.6], to: 'c5_ringroad', entry: 'park', when: (s) => !!(s.done && s.done['c4:gateOpen']) && s.chapter >= 5 && !!ROOMS.c5_ringroad, blockedMsg: 'The ring road. [beat] Not like this.' });

      // ---- SOUTH: warehouse A, the bus stop, the stem, warehouse B -----------------------------------------------------------
      const WH = { tex: 'concrete', color: '#8f8b80' };
      K.box(12, 0, 34.1, 18.2, 7.2, 13.2, WH, { collide: true });
      K.box(52.3, 0, 34.1, 16.6, 7.2, 13.2, WH, { collide: true });
      for (const [x, n] of [[7.4, 1], [15.8, 2]]) { K.prop('roller_door', x, 27.48, 180, { w: 3.8, h: 3.4, open: 0, color: '#7d8a86' }); K.sign('UNIT ' + n, x, 3.85, 27.48, 1.0, 0.3, { style: 'shop', bg: '#1d2d33', fg: '#e8e4d2', rotY: 180 }); }
      K.sign('SIGNAL HILL FREIGHT', 12, 5.6, 27.47, 6, 0.7, { style: 'shop', bg: '#3a2a1a', fg: '#e8d090', rotY: 180 });
      K.prop('roller_door', 50.4, 27.48, 180, { w: 4.2, h: 3.6, open: 0, color: '#6a7470' });
      K.sign('UNIT 4 — LEASED', 50.4, 4.1, 27.47, 2.6, 0.35, { style: 'shop', bg: '#e8e4d2', fg: '#1d1d1d', rotY: 180 });
      K.sign('TO LET\nFLEXIBLE TERMS', 56.2, 2.2, 27.47, 1.2, 0.8, { style: 'council', bg: '#b3261e', fg: '#ffffff', rotY: 180 });
      K.writing('FOLLOW UP TOMORROW', 3.8 + 0.1, 1.5, 27.46, 2.2, { rotY: 180, world: 'fog' });
      // the dead bus stop and its payphone
      K.prop('bus_shelter', 27, 26.35, 180, { route: '44', stop: 'CARE WAY' });
      K.payphone(32.2, 26.0, 180, { id: 'c4_park:payphone' });
      K.collider(21, 27.55, 35.2, 27.75, { h: 2.4 });
      for (let x = 22; x < 35; x += 3.4) K.prop('chainlink', x + 1.7, 27.65, 0, { len: 3.4, h: 2.0, collide: false });
      K.pickup('coffee', 26.2 + 0.9, 0.15 + 0.46, 26.75, { id: 'c4_park:coffee', extraOnEasy: true, rot: 60 });
      // the stem's sides
      K.collider(34.9, 27.6, 35.25, 40.6, { h: 2.4 });
      K.collider(42.75, 24.5, 44, 40.6, { h: 2.4 });
      for (let z = 28.5; z < 40; z += 3.4) K.prop('chainlink', 35.1, z + 1.2, 90, { len: 3.4, h: 2.0, collide: false });
      K.prop('streetlight', 42.5, 33, -90, { bank: 4 });
      K.exit({ id: 'c4_park:lane', box: [35.3, 39.7, 42.7, 40.7], to: 'c4_wirelane', entry: 'park' });
      K.box(39, -0.3, 52, 7.6, 0.3, 22.8, { tex: 'bitumen', color: '#3a3c3b' }, { shadow: false });
      for (const xx of [35.8, 42.2]) K.box(xx, -0.2, 52, 1.3, 0.35, 22.8, { tex: 'footpath', color: '#8a8880' }, { shadow: false });
      // CALL 4 rings on entering the business park
      K.trigger([35.3, 27.5, 42.7, 36.5], (G) => G.call('luka4'), { id: 'c4_park:call4', when: (s) => s.chapter === 4 && !(s.calls && s.calls.luka4) });

      // ---- examine lines (Aidan) ---------------------------------------------------------------------------------------------
      K.examine(26.4, 1.8, 5.0, ['Customer Care Centre.', 'Every call I ever put on hold ended up somewhere like this.'], { id: 'c4pk:sign', r: 1.5 });
      K.examine(7.4, 1.4, 27.2, ['Signal Hill Freight. Padlocked.', 'Everything out here is.'], { id: 'c4pk:whA', r: 1.8 });
      K.examine(50.4, 1.4, 27.2, ['Unit 4. Leased.', 'To nobody, by the look of it.'], { id: 'c4pk:whB', r: 1.8 });
      K.examine(27.9, 1.5, 25.2, ['Route 44. "Every thirty minutes."', 'Somebody\'s painted over the times.'], { id: 'c4pk:timetable', r: 1.4 });
      K.examine(8.3, 1.1, 10.4, ['A lanyard hanging off the rear-view mirror.', 'They drove in for a shift. The car\'s still here.'], { id: 'c4pk:car', r: 1.5 });
      K.examine(24.3, 1.2, 13.6, ['Reserved. Team Leader of the Month.', 'Nobody parked in it.'], { id: 'c4pk:reserved', r: 1.4 });
      K.examine(34.2, 1.0, 4.6, 'A bin full of butts. This is where everyone took their breaks.', { id: 'c4pk:butts', r: 1.3 });
      K.examine(38.2, 1.5, 5.9, ['Three flagpoles. No flags.', 'The ropes keep tapping against the poles. Like someone knocking.'], { id: 'c4pk:flags', r: 1.6 });
      K.examine(4.2, 1.2, 19.5, ['The road just stops. Past the barrier it\'s white.', 'Somebody built a whole business park on the edge of nothing.'], { id: 'c4pk:drop', r: 2.2 });
      K.examine(16.1, 1.1, 10.5, ['A company car. Parking permit on the dash.', 'Tier 2 Support. Bay 14.'], { id: 'c4pk:car2', r: 1.5 });
    },
    async onEnter(G) {
      // the whole building rings (muffled through the glass)
      C4_farRing(2, 0.11, 700);
      if (S.chapter === 4 && G.once('c4:parkNote')) note(G, 'The call centre. Chase went in there. Wai said it keeps every call log in the district.', 'c4_goal');
    },
    onLeave() { C4_stopRing(); },
  });

  // the boom gate: locked until the gate key (Chapter 4's safe room), then it lifts for good
  async function C4_boomGate(G) {
    const g = G.obj('c4_boom'), setOpen = g && g.userData.setOpen;
    if (done('c4:gateOpen')) { await G.think('It\'s up. The ring road\'s through there.'); return; }
    if (!G.has('gate_key')) {
      G.sfx('door_locked', { pos: [BOOM.x, 1.0, BOOM.z] });
      await G.msg('The boom gate\'s locked. There\'s a key slot.');
      try { G.mapMark('auto:blk:c4_park:boom', { at: [BOOM.x, 19.5], t: 'x' }); } catch (e) { /* map */ }
      return;
    }
    G.sfx('unlock', { pos: [BOOM.x, 1.0, BOOM.z] });
    await G.msg('The key fits.');
    S.done['c4:gateOpen'] = true;
    G.sfx('turnstile', { pos: [BOOM.x, 1.0, BOOM.z], vol: 0.8 });
    let t = 0;
    if (setOpen) await G.loop((dt) => { t += dt / 2.2; setOpen(U.ease.inOut(Math.min(1, t))); return t >= 1; });
    if (setOpen) setOpen(1);
    try { G.mapMark('auto:blk:c4_park:boom', { at: [BOOM.x, 19.5], t: 'tick' }); } catch (e) { /* map */ }
    note(G, 'The regional office. Ring Road — Level 4.', 'c4_goal');
  }
  // Chapter 4 → 5: through the open boom gate (the card as he walks on)
  async function C4_toLevel4(G) {
    if (S.chapter !== 4 || !done('c4:gateOpen')) return;
    note(G, 'The regional office. Ring Road — Level 4.', 'c4_goal', { done: true });
    const ok = await G.startChapter(5);
    if (ok === false) {
      // (no Chapter 5 in this build: show its card and hand the road back)
      await G.card('LEVEL 4');
      await G.fade(0, 1.0);
    }
  }

  // =================================================================================================================
  // 4B THE LOBBY — 20 × 12 m, ceiling 3.6. South: the glass entrance (x 10) onto the park. North: the frosted glazing
  // onto the open plan, the floor door (x 10) behind a line of dead turnstiles. The reception counter NE under the LED
  // ticker; the Care Champion wall (west); the waiting area; the security back office door (east wall, z 8.5, maglock).
  // =================================================================================================================
  const LB = { H: 3.6 };
  const LOBBY_CHASE = [
    'Nobody\'s come in. [beat] Reckon nobody\'s coming.',
    'Records room, legend. Down the back. Go on.',
    'I\'m right. [beat] I\'m right.',
  ];
  defineRoom({
    id: 'c4_lobby', name: 'CARE CENTRE LOBBY', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'tile', ambient: 'office',
    fog: { density: 0.032, color: '#3b4543' },
    surfaces: [{ box: [8.4, 10.6, 11.6, 12], s: 'carpet' }],
    bounds: [0, 0, 20, 12],
    entries: { entrance: [10.2, 10.9, 180], floor: [10.1, 1.0, 0], secoffice: [19.0, 8.5, -90], start: [10.2, 10.9, 180] },
    cameras: [
      // wide from the entrance, through the glass doors
      { id: 'c4_lobby:wide', vol: [5, 0, 15, 6.5], type: 'static', pos: [10.1, 3.3, 11.85], target: [10.3, 0.7, 2.6], fov: 'fit' },
      // high over reception, from the far corner
      { id: 'c4_lobby:reception', vol: [13, 0, 20, 7], pri: 1, type: 'static', pos: [19.5, 3.35, 11.5], target: [15.5, 0.8, 3.0], fov: 'fit' },
      // low across the room at the Care Champion wall
      { id: 'c4_lobby:champion', vol: [0, 0, 5, 12], type: 'static', pos: [11.2, 1.5, 6.2], target: [1, 1.25, 6], fov: 'fit' },
      // the CCTV corner: high in the north-west corner, down over the waiting area to the doors
      { id: 'c4_lobby:cctv', vol: [5, 6.5, 20, 12], type: 'static', pos: [0.45, 3.45, 0.45], target: [12, 0.5, 9.4], fov: 'fit' },
      // low at the turnstiles: the floor door ahead, nothing past it until he commits
      { id: 'c4_lobby:turnstiles', vol: [5, 0, 13, 3.5], pri: 2, type: 'static', pos: [10.4, 0.5, 8.9], target: [10, 1.3, 1.0], fov: 'fit' },
    ],
    build(K) {
      const H = LB.H;
      K.floor(0, 0, 20, 12, { tex: 'tile', color: '#a9a69c' });
      K.ceiling(0, 0, 20, 12, H, 'ceiling_tile');
      // south: the glass entrance and full-height glazing either side
      K.wall(-0.1, 12, 20.1, 12, H, 'plaster', { openings: [{ at: 10.2, w: 1.95, h: 2.45 }, { at: 4.4, w: 7.4, h: 2.8, sill: 0.12, glass: true }, { at: 15.9, w: 7.4, h: 2.8, sill: 0.12, glass: true }], skirting: true });
      K.door({ id: 'c4_lobby:entrance', x: 10.2, z: 12, rot: 0, w: 1.9, h: 2.4, style: 'glass_double', to: 'c4_park', entry: 'lobby' });
      K.light('street', 10.2, 4.2, 16.5, { real: false, haloSize: 4.5, haloOpacity: 0.45 });
      // north: frosted glazing onto the dark open plan, the floor door
      K.wall(20.1, 0, -0.1, 0, H, 'plaster', { openings: [{ at: 10, w: 1.05, h: 2.2 }, { at: 4.2, w: 5.6, h: 1.6, sill: 1.0, glass: true }, { at: 15.6, w: 3.0, h: 1.4, sill: 1.2, glass: true }], skirting: true });
      K.box(10, 0, -0.9, 20, H, 0.1, { color: '#050707', roughness: 1 });
      K.door({ id: 'c4_lobby:floor', x: 10, z: 0, rot: 0, w: 1.0, h: 2.15, style: 'glass', to: 'c4_floor', entry: 'lobby', sign: 'FLOOR 1 — STAFF' });
      // west, east
      K.wall(0, 12.1, 0, -0.1, H, 'plaster_stained', { skirting: true, grime: true });
      K.wall(20, -0.1, 20, 12.1, H, 'plaster', { openings: [{ at: 8.5, w: 1.0, h: 2.15 }], skirting: true });
      K.door({ id: 'c4_lobby:sec', x: 20, z: 8.5, rot: -90, w: 0.95, style: 'wired', reader: 'maglock', to: 'c4_secoffice', entry: 'door', sign: 'SECURITY', signBack: 'SECURITY', locked: (s) => !(s.flags && s.flags.c4_bossDone), lockMsg: 'It\'s locked. A maglock — no handle on this side.' });
      K.prop('cctv_camera', 19.9, 7.2, -90, { variant: 'bullet', mount: 2.7 });
      K.prop('exit_sign', 10.2, 11.95, 180, { mount: 2.75 });
      // the reception counter under the ticker
      K.prop('counter', 15.2, 4.2, 0, { len: 4.6, variant: 'reception', clutter: true });
      K.plane(15.2, 2.75, 0.09, 3.6, 0.34, tickerTex(), { emissive: true, emissiveIntensity: 1.1 });
      K.light('screen', 15.2, 2.5, 0.6, { color: '#ffa040', intensity: 1.2, distance: 4, real: false });
      K.plane(15.2, 1.95, 0.085, 2.8, 0.9, Tex.wordmark({ w: 2.8, h: 0.9, bg: BR.teal, age: 0.3 }), {});
      K.box(13.9, 1.08, 4.35, 0.32, 0.18, 0.02, { color: '#dfe7e6', roughness: 0.1, transparent: true, opacity: 0.5 }, { rot: -8 });
      K.plane(13.9, 1.17, 4.37, 0.3, 0.15, deskSignTex(), { rotY: -8 });
      K.prop('monitor', 15.3, 4.05, 180, { y: 1.0, content: 'login', light: false });
      K.prop('desk_phone', 17.0, 4.1, 170, { y: 1.0 });
      K.prop('office_chair', 15.6, 3.1, 170, {});
      K.pickup('map_care', 16.35, 1.01, 4.3, { id: 'c4_lobby:map', rot: 8, glint: true });
      K.prop('water_cooler', 18.9, 1.1, -90, {});
      K.prop('plant_pot', 12.2, 0.5, 0, {});
      // the dead turnstiles and the glass barrier line
      for (const [x, v] of [[7.4, null], [8.4, null], [9.4, null], [10.62, 'glass'], [11.9, null]]) K.prop('turnstile', x, 2.1, 0, { variant: v || undefined, open: v ? 1 : 0 });
      K.box(5.2, 0, 2.1, 4.2, 1.0, 0.04, 'glass', { collide: true });
      K.box(5.2, 1.0, 2.1, 4.2, 0.04, 0.06, { tex: 'metal', color: '#c9cdcb' });
      K.box(12.6, 0, 1.2, 0.04, 1.0, 1.8, 'glass', { collide: true });
      // the Care Champion wall; the waiting area; the TV; the feedback board; the ticket machine; queue lanes
      K.prop('photo_wall', 0.08, 6.1, 90, { n: 12, title: 'CARE CHAMPION OF THE MONTH' });
      K.box(0.1, 2.3, 6.1, 0.12, 0.06, 1.6, { tex: 'metal', color: '#b8b09a' });
      K.light('lamp', 0.45, 2.25, 6.1, { color: '#ffe6c0', intensity: 3.2, distance: 4.5, bank: 1, name: 'c4lb:picture' });
      for (const [x, z, r] of [[2.3, 7.4, 90], [2.3, 8.0, 90], [2.3, 8.6, 90], [2.3, 9.2, 90], [4.2, 7.4, -90], [4.2, 8.0, -90], [4.2, 8.6, -90]]) K.prop('chair', x, z, r, {});
      K.prop('cardigan_chair', 4.2, 9.2, -90, { color: '#6a5a4a' });
      K.box(3.25, 0, 8.3, 0.7, 0.42, 1.6, { tex: 'wood', color: '#6a5a44' }, { collide: true });
      K.dress('papers', [2.95, 7.6, 3.55, 9.0], 5, { seed: 61, y: 0.43 });
      K.prop('tv', 5.4, 0.08, 0, { mount: 2.55, w: 1.0, content: 'static', light: false });
      K.prop('feedback_board', 1.8, 0.08, 0, { mount: 1.55 });
      K.prop('ticket_machine', 7.3, 10.3, 0, { name: 'c4_ticketmachine', text: 'You are number 4,112.', serving: '0412' });
      for (const [x, z] of [[12.2, 6.2], [12.2, 9.4], [14.2, 6.2], [14.2, 9.4], [16.2, 6.2], [16.2, 9.4]]) { K.cyl(x, 0, z, 0.2, 0.03, { tex: 'metal', color: '#c7cbc9' }); K.cyl(x, 0.03, z, 0.035, 0.92, { tex: 'metal', color: '#c7cbc9' }, { collide: true }); }
      for (const [x, z] of [[13.2, 6.2], [15.2, 6.2], [13.2, 9.4], [15.2, 9.4]]) K.box(x, 0.86, z, 2.0, 0.07, 0.02, { color: '#0b4f52', roughness: 0.6 }, { collide: true, h: 0.95 });
      K.box(16.2, 0.86, 7.8, 0.02, 0.07, 3.2, { color: '#0b4f52', roughness: 0.6 }, { collide: true, h: 0.95 });
      floorPlane(K, 10.2, 0.01, 11.3, 3.0, 1.4, { color: '#26302f', roughness: 1 });
      K.prop('plant_pot', 0.6, 11.3, 0, {}); K.prop('plant_pot', 19.3, 11.4, 0, {});
      K.box(1.7, 0, 11.6, 1.2, 1.4, 0.3, { tex: 'metal', color: '#9aa09e' }, { collide: true });
      K.plane(1.7, 1.15, 11.44, 1.1, 0.5, Tex.poster('TALK TO US\nWE\'RE HERE 24/7', { kind: 'plan', seed: 23 }), { rotY: 180 });
      K.prop('poster', 19.92, 3.0, -90, { style: 'plan', text: 'YOUR CALL\nMATTERS', mount: 1.8 });
      K.prop('poster', 0.08, 10.5, 90, { style: 'faded', text: 'NPS 9+\nEVERY CALL', mount: 1.7 });
      K.writing('ASK THEM', 19.92, 1.6, 5.2, 1.3, { rotY: -90, world: 'fog' });
      K.prop('clock', 10.2, 0.08, 0, { mount: 3.0, time: [3, 12] });
      // his phone on the floor against the counter (after the safe room)
      if (flag('c4_bossDone')) {
        K.box(14.1, 0.005, 5.05, 0.075, 0.009, 0.15, { color: '#101214', roughness: 0.3 }, { rot: 23 });
        K.plane(14.1, 0.012, 5.05, 0.065, 0.13, { color: '#8fb8c8', roughness: 0.2 }, { rot: [-90, 0, 23], emissive: '#6f9fb0', emissiveIntensity: 0.8 });
        K.examine(14.1, 0.4, 5.1, ['His phone. Screen up. Still lit.', 'He\'s gone. [beat] He just needed a SIM.'], { id: 'c4lb:manphone', r: 1.3 });
      }
      // light: two tubes still work (one flickering), the rest dead
      K.prop('fluoro_tube', 10, 4.0, 90, { h: H - 0.05, variant: 'troffer', bank: 1, flicker: true });
      K.prop('fluoro_tube', 15.5, 7.5, 90, { h: H - 0.05, variant: 'troffer', bank: 2 });
      for (const [x, z] of [[4.5, 4], [4.5, 8.5], [10, 8.5], [15.5, 3.0]]) K.prop('fluoro_tube', x, z, 90, { h: H - 0.05, variant: 'troffer', lit: false });
      K.light('led', 19.93, 2.35, 8.5, { color: '#ff2a1c', blink: true });
      // Chase watches the lobby after 4-1 (until the Outage)
      K.npc('chase', 'chase', 12.6, 10.2, 170, {
        anim: 'idle', when: () => flag('c4_metChase') && !flag('c4_bossDone') && !S.outage && !flag('c4_outage'),
        talk: async (G) => {
          const k = 'c4:chaseLobby', n = S.done[k] | 0;
          S.done[k] = n + 1;
          const C = G.actor('chase');
          C.look(G.aidan);
          await G.say('CHASE', LOBBY_CHASE[Math.min(n, LOBBY_CHASE.length - 1)]);
          C.look(null);
        },
      });

      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      K.interact(7.3, 1.1, 10.55, (G) => C4_ticket(G), { id: 'c4_lobby:ticket', r: 1.2 });
      K.examine(13.9, 1.2, 4.6, async (G) => { await G.msg('"We are experiencing higher than normal call volumes."'); await G.think('Always.'); }, { id: 'c4lb:volumes', r: 1.5 });
      K.examine(0.5, 1.4, 6.1, ['Every one of them\'s smiling.', 'Care Champion of the Month. Every face faded to white. [beat] You can still tell.'], { id: 'c4lb:champion', r: 2.0 });
      K.examine(9.4, 1.1, 2.6, ['Dead. Tap your card, nothing happens.', 'The disabled gate\'s just hanging open.'], { id: 'c4lb:turnstiles', r: 1.3 });
      K.examine(4.2, 0.9, 9.2, ['A cardigan on the back of a chair. A queue ticket in the pocket.', 'Three thousand nine hundred and eighty. They waited all that time.'], { id: 'c4lb:cardigan', r: 1.2 });
      K.examine(5.4, 2.1, 0.5, ['The TV\'s just static.', 'For a second it said "Your call is important to us." Then static again.'], { id: 'c4lb:tv', r: 2.2 });
      K.examine(1.8, 1.4, 0.4, ['"You said, we did."', 'Every card\'s blank.'], { id: 'c4lb:feedback', r: 1.4 });
      K.examine(18.9, 1.1, 1.4, 'The bottle\'s empty. There\'s a ring of dust where the cups used to be.', { id: 'c4lb:cooler', r: 1.2 });
      K.examine(1.7, 1.2, 11.2, ['"Talk to us — we\'re here 24/7."', 'The rack\'s full. Nobody took one.'], { id: 'c4lb:brochures', r: 1.3 });
      K.examine(14.2, 0.95, 7.8, ['Queue lanes. Back and forth, back and forth.', 'For nobody.'], { id: 'c4lb:queue', r: 1.5 });
      K.examine(12.2, 0.6, 0.6, 'A plastic plant. Even that\'s gone grey.', { id: 'c4lb:plant', r: 1.1 });
    },
    onUpdate() { C4_ambient(['#5a6664', 0.28], ['#1f6f6a', 0.05]); },
    onLeave() { C4_ambientOff(); C4_stopRing(); },
    async onEnter(G) {
      // the whole floor rings through the glazing
      C4_farRing(2, 0.2, 900);
      if (S.chapter === 4 && G.once('c4:lobbyIn')) {
        await G.wait(1.2);
        await G.think('Phones. Hundreds of them. [beat] Nobody answering.');
      }
    },
  });
  // the ticket machine prints a ticket
  async function C4_ticket(G) {
    const m = G.obj('c4_ticketmachine');
    G.sfx('beep', { pos: [7.3, 1.1, 10.4], vol: 0.6 });
    G.sfx('printer', { pos: [7.3, 1.0, 10.4], vol: 0.8 });
    if (m && m.userData.print) await Promise.race([m.userData.print(), G.wait(1.0)]);
    await G.msg('"You are number 4,112."');
    await G.think('Four thousand one hundred and twelve.');
    if (!G.has('ticket')) G.give('ticket');
  }

  // =================================================================================================================
  // 4H THE SECURITY BACK OFFICE (the safe room) — 5 × 4 m, ceiling 2.7. Door (west wall, z 2) with a wired-glass
  // window: Fog → c4_lobby, Outage → c4_oldstore. Outside the door, a slice of the lobby (Fog) / of the old store
  // (Outage) is built for the view through the window (4-3). The east wall is a cutaway for the corner camera.
  // =================================================================================================================
  const SO = { H: 2.7, door: [0, 2.0] };
  const SECO_CHASE = ['Go on. [beat] I\'ll catch up.', 'Still here, legend.', 'Where to next? [beat] Yeah. You said.'];
  defineRoom({
    id: 'c4_secoffice', name: 'SECURITY OFFICE', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 5, 4],
    entries: { door: [0.75, 2.0, 90], start: [0.75, 2.0, 90] },
    cameras: [
      // static from the corner: from the east (the east wall is a cutaway) onto the door and the corner where Chase sits,
      // framed inside the room (no void past its walls)
      { id: 'c4_secoffice:corner', vol: [0, 0, 3.4, 4], type: 'static', pos: [7.6, 2.45, 2.0], target: [1.2, 0.6, 2.0], fov: 40 },
      // high in the north-west corner, down past the desk to the key board, the first aid box and the lockers
      { id: 'c4_secoffice:desk', vol: [3.4, 0, 5, 4], type: 'static', pos: [0.35, 2.5, 0.35], target: [4.0, 0.6, 2.7], fov: 'fit' },
      // from above the lockers: him just inside the door, the wired glass behind him
      { id: 'c4_secoffice:door', vol: [0, 0.9, 1.3, 3.1], pri: 1, type: 'static', pos: [4.65, 2.45, 3.65], target: [0.3, 0.95, 1.9], fov: 'fit' },
      // from the lobby side, through the wired glass in the door
      { id: 'c4_secoffice:window', vol: [2.4, 1.3, 4.6, 2.7], pri: 1, type: 'static', pos: [-1.8, 1.5, 2.0], target: [3.6, 1.0, 2.0], fov: 40 },
    ],
    build(K) {
      const H = SO.H;
      K.floor(0, 0, 5, 4, { tex: 'lino', color: '#7d8278' });
      K.ceiling(0, 0, 5, 4, H, 'ceiling_tile');
      K.wall(5.1, 0, -0.1, 0, H, 'plaster_stained', { skirting: true });
      K.wall(-0.1, 4, 5.1, 4, H, 'plaster', { skirting: true });
      K.wall(0, 4.1, 0, -0.1, H, 'plaster', { openings: [{ at: 2.1, w: 1.0, h: 2.15 }], skirting: true });
      K.wall(5, -0.1, 5, 4.1, H, 'plaster', { both: false });                   // cutaway: faces into the room
      // the door: to the lobby (Fog) / back into the old store (Outage)
      K.door({ id: 'c4_secoffice:door', x: 0, z: SO.door[1], rot: 90, w: 0.95, style: 'wired', reader: 'maglock', to: 'c4_lobby', entry: 'secoffice', sign: 'SECURITY', world: 'fog' });
      K.door({ id: 'c4_secoffice:doorO', x: 0, z: SO.door[1], rot: 90, w: 0.95, style: 'wired', reader: 'maglock', to: 'c4_oldstore', entry: 'office', world: 'outage', locked: true, lockMsg: 'Not back out there.' });
      K.prop('alarm_lamp', 0.08, 3.0, 90, { mount: 2.4, name: 'c4so:lamp', lit: false });
      // desk with the CCTV monitors, the radio, the logbook
      K.prop('desk', 2.4, 0.45, 0, {});
      K.prop('office_chair', 2.4, 1.25, 190, {});
      K.prop('crt', 2.0, 0.35, 8, { y: 0.745, content: 'cctv', cam: 3 });
      K.prop('crt', 2.75, 0.33, -6, { y: 0.745, content: 'static' });
      K.box(3.3, 0.745, 0.45, 0.22, 0.12, 0.12, { color: '#1c1e1f', roughness: 0.5 });
      K.box(3.28, 0.865, 0.45, 0.05, 0.22, 0.05, { color: '#1c1e1f', roughness: 0.5 });
      K.box(1.7, 0.745, 0.6, 0.3, 0.03, 0.22, { color: '#2a3a6a', roughness: 0.8 }, { rot: 12 });
      K.prop('mug', 3.0, 0.72, 0, { y: 0.745, text: 'NIGHT SHIFT' });
      K.prop('desk_lamp', 1.8, 0.22, 25, { y: 0.745, lit: true });
      // the duress-alarm panel, the key board (gate key), first aid, lockers, a hi-vis vest on a hook
      K.plane(4.3, 1.5, 0.085, 0.5, 0.62, duressPanelTex(), {});
      K.light('led', 4.1, 1.72, 0.1, { color: '#ff2a1c', blink: true, world: 'outage' });
      K.plane(1.2, 1.55, 3.92, 0.64, 0.5, keyBoardTex(), { rotY: 180 });
      K.pickup('gate_key', 1.05, 1.47, 3.86, { id: 'c4_secoffice:gatekey', glint: true, rot: 0, when: () => flag('c4_done') });
      K.prop('first_aid_box', 3.2, 3.92, 180, { mount: 1.45 });
      K.pickup('first_aid', 3.55, 0.745, 0.62, { id: 'c4_secoffice:firstaid', rot: 15 });
      K.prop('locker_bank', 4.5, 3.7, 180, { n: 2 });
      K.box(2.2, 1.3, 3.9, 0.45, 0.7, 0.08, { color: '#d9701f', roughness: 0.8 });
      K.box(2.2, 1.6, 3.87, 0.46, 0.06, 0.02, { color: '#dcdcd0', roughness: 0.3 });
      K.prop('bin', 0.5, 0.4, 0, { variant: 'office' });
      K.prop('fluoro_tube', 2.5, 2.0, 0, { h: H - 0.05, bank: 1, flicker: true });
      // the view through the door window: a slice of the lobby (Fog) / the old store (Outage)
      K.box(-6, -0.02, 0.75, 12, 0.02, 14.5, { tex: 'tile', color: '#a9a69c' }, { world: 'fog', shadow: false });
      K.box(-6, 3.6, 0.75, 12, 0.05, 14.5, { tex: 'ceiling_tile', color: '#9a9890' }, { world: 'fog', shadow: false });
      K.prop('counter', -4.8, -2.3, 0, { len: 4.6, variant: 'reception', world: 'fog', collide: false });
      K.box(-6, 0, -6.5, 12, 3.6, 0.1, { color: '#48504e', roughness: 1 }, { world: 'fog' });
      K.box(-12, 0, 0.75, 0.1, 3.6, 14.5, { color: '#56605c', roughness: 1 }, { world: 'fog' });
      K.plane(-4.8, 2.75, -6.4, 3.6, 0.34, tickerTex(), { emissive: true, emissiveIntensity: 1.1, world: 'fog' });
      K.light('screen', -4.8, 2.4, -5.6, { color: '#ffa040', intensity: 1.5, distance: 5, world: 'fog' });
      K.prop('fluoro_tube', -3.5, -1.5, 90, { h: 3.55, variant: 'troffer', world: 'fog', light: false });
      K.light('point', -3.4, 2.9, -0.6, { color: '#b8c6c2', intensity: 7, distance: 9, world: 'fog', name: 'c4so:setlight' });
      K.light('point', 0.18, 2.05, 1.95, { color: '#c9d4cf', intensity: 1.1, distance: 1.5, world: 'fog', name: 'c4so:winfill', on: false });
      for (const [x, z] of [[-7.8, 0.3], [-5.8, 0.3], [-7.8, 3.5]]) K.cyl(x, 0, z, 0.035, 0.95, { tex: 'metal', color: '#c7cbc9' }, { world: 'fog' });
      K.box(-6.8, 0.86, 0.3, 2.0, 0.07, 0.02, { color: '#0b4f52', roughness: 0.6 }, { world: 'fog' });
      K.box(-6, -0.02, 0.75, 12, 0.02, 14.5, { tex: 'vinyl_retail', color: '#8a8478' }, { world: 'outage', shadow: false });
      K.prop('counter', -4.8, -2.3, 0, { len: 5.5, variant: 'store', world: 'outage', collide: false });
      K.prop('demo_table', -6.5, 2.8, 20, { world: 'outage', lit: true, time: '8:51', collide: false });
      K.box(-5, 0, -6.5, 10, 4.4, 0.1, { color: '#1d2a29', roughness: 1 }, { world: 'outage' });
      K.light('point', -4, 2.6, 0.5, { color: '#ff3b2a', intensity: 3, distance: 8, world: 'outage', flicker: true });
      // Chase, sitting against the wall by the door after 4-3
      K.npc('chase', 'chase', 0.45, 3.35, 90, {
        anim: flag('chaseHurt') ? 'sit_floor' : 'sit_knees', when: () => flag('c4_done'),
        talk: async (G) => {
          const k = 'c4:chaseSafe', n = S.done[k] | 0;
          S.done[k] = n + 1;
          const C = G.actor('chase');
          C.look(G.aidan);
          await G.say('CHASE', flag('chaseHurt') && n === 0 ? 'Go. [beat] I\'m breathing. Go.' : SECO_CHASE[n % SECO_CHASE.length]);
          C.look(null);
        },
      });

      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      K.examine(4.3, 1.5, 0.3, ['The duress panel. Lobby, Floor 1, Records, Dock.', '"Activation releases security office maglock." [beat] That\'s why it opened.'], { id: 'c4so:panel', r: 1.3 });
      K.examine(2.4, 1.1, 0.6, ['CCTV. Camera 3 is the lobby.', 'It\'s empty. [beat] Every time I look, it\'s empty.'], { id: 'c4so:cctv', r: 1.2 });
      K.examine(1.7, 0.9, 0.6, ['The night logbook. "22:10 — all quiet." "23:40 — all quiet."', 'Every line, all quiet. In the same pen.'], { id: 'c4so:log', r: 1.1 });
      K.examine(1.2, 1.5, 3.7, ['The key board. Dock, bin store, roof, comms.', '"Return the gate key!!" Somebody underlined it twice.'], { id: 'c4so:keys', r: 1.2, when: () => !flag('c4_done') || S.inv.some((i) => i.id === 'gate_key') });
      K.examine(2.2, 1.4, 3.7, 'A hi-vis vest on a hook. Somebody\'s name on the back in marker. It\'s rubbed off.', { id: 'c4so:vest', r: 1.1 });
      K.examine(4.5, 1.4, 3.5, 'Lockers. Somebody\'s left a jumper and a birthday card in one. "To the best security guard in the building."', { id: 'c4so:lockers', r: 1.1 });
    },
    onUpdate() { C4_ambient(['#56605e', 0.26], ['#1f6f6a', 0.06]); },
    onLeave() { C4_ambientOff(); },
    async onEnter(G) {
      // a reload into the safe room before its scene: play it
      if (flag('c4_bossDone') && !done('cs:4-3')) await G.cutscene('4-3', { inheritSkip: false });
    },
  });

  // =================================================================================================================
  // 4C FLOOR 1, THE OPEN PLAN — 50 × 28 m under a 4 m ceiling. Eight cubicle rows (north → south, row n's back panel at
  // FL.rows[n-1], cubicles 1.6 deep opening south onto the aisle behind), each a west block (x 1.5–17.7) and an east
  // block (x 32.3–48.5) of nine cubicles; a walkway along the west wall (x 0–1.5); the centre (x 17.7–32.3): four raised
  // team-leader pods, the wallboard monitor bank on the north wall. Doors: records (north wall x 7, rotary dial), break
  // room (east wall z 7), lobby (south wall x 25, Fog), the SW door (west wall z 26.3: a locked fire exit in the Fog,
  // "LOBBY" in the Outage → c4_oldstore:side).
  // The Outage maze (west block): rows 2, 4 and 6 are gone; tall contract walls stand on the back lines of rows 3, 5, 7
  // (gaps: row 3 and 7 at the east end, row 5 at the walkway); the walkway is blocked beside rows 3 and 7; a contract wall
  // at x 18 seals the centre. Route: records door → west → C1 east → C2 west → walkway → C3 east → A7 west → A8 → SW door.
  // =================================================================================================================
  const FL = { H: 4.0, rows: [1.4, 4.5, 7.6, 10.7, 13.8, 16.9, 20.0, 23.1], cw: 1.8, W0: 1.5, E0: 32.3 };
  const cubX = (B, k) => (B === 'W' ? FL.W0 : FL.E0) + FL.cw * (k + 0.5);
  const PODS = [{ n: 1, x: 22.0, z: 6.5 }, { n: 2, x: 28.2, z: 6.5 }, { n: 3, x: 22.0, z: 17.6 }, { n: 4, x: 28.2, z: 17.6 }];
  const CHASE_CUB = { x: 6.0, z: 17.7, chair: [6.0, 18.3] };
  const ARM = { x: 13.3, z: 16.9 };
  const DIAL = { x: 8.05, z: 0.08, code: '2231' };
  // the draped arm (4-2 CAM moment): a Reach's three-jointed arm over row 5's back partition, hand on the desk, still
  function C4_armMesh() {
    const g = new THREE.Group(); g.name = 'c4:arm';
    const skin = new THREE.MeshStandardMaterial({ color: '#c08a6c', roughness: 0.72 });
    const vein = new THREE.MeshStandardMaterial({ color: '#4d3f5e', roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#141617', roughness: 0.4 });
    const UPV = new THREE.Vector3(0, 1, 0);
    const seg = (a, b, r0, r1, mat) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), L = va.distanceTo(vb);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, 9), mat);
      m.position.copy(va).lerp(vb, 0.5); m.quaternion.setFromUnitVectors(UPV, vb.clone().sub(va).normalize());
      m.castShadow = true; g.add(m); return m;
    };
    const P = [[0.0, 1.0, -0.55], [0.06, 1.66, -0.1], [0.28, 1.46, 0.16], [0.44, 1.02, 0.3], [0.5, 0.8, 0.36]];
    seg(P[0], P[1], 0.075, 0.062, skin); seg(P[1], P[2], 0.06, 0.052, skin); seg(P[2], P[3], 0.052, 0.044, skin); seg(P[3], P[4], 0.044, 0.04, skin);
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[i + 1]; seg([a[0] + 0.03, a[1] + 0.01, a[2] + 0.02], [b[0] + 0.03, b[1] + 0.01, b[2] + 0.02], 0.012, 0.01, vein); }
    for (const p of P.slice(1, 4)) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); s.position.set(...p); g.add(s); }
    const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), skin); hnd.position.set(0.52, 0.78, 0.42); hnd.rotation.y = 0.4; g.add(hnd);
    for (let f = 0; f < 4; f++) { const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.09, 6), new THREE.MeshStandardMaterial({ color: '#e8d8cc', roughness: 0.6 })); fg.position.set(0.47 + f * 0.028, 0.78, 0.52); fg.rotation.x = 1.3; g.add(fg); }
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.15), dark); ph.position.set(0.53, 0.765, 0.47); ph.rotation.y = 0.5; g.add(ph);
    g.traverse((c) => { if (c.isMesh) c.userData.ownedGeo = true; });
    return g;
  }
  // a hanging aisle marker on two rods
  function C4_rowSign(K, n, x, z, o = {}) {
    K.plane(x, 2.95, z, 0.9, 0.34, rowTex(n), { rotY: 90, double: true, ...o });
    for (const dz of [-0.35, 0.35]) K.box(x, 3.12, z + dz, 0.01, FL.H - 3.12, 0.01, { tex: 'metal', color: '#6a6e6c' }, o);
  }
  defineRoom({
    id: 'c4_floor', name: 'FLOOR 1 — OPEN PLAN', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'carpet', ambient: 'office',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 50, 28],
    entries: { lobby: [25, 27.1, 180], westwall: [0.85, 26.3, 90], break: [49.1, 7.0, -90], records: [7.0, 0.85, 0], start: [25, 27.1, 180] },
    cameras: [
      // along the rows from the centre aisle, looking west down the row he's in (Fog: over the partitions; Outage: down
      // the corridors of the maze — the contract wall at x 18 is one-sided, the corridors beside his hidden until he turns)
      { id: 'c4_floor:west', vol: [9, 0, 18, 28], type: 'rail', pos: [20.4, 2.95, 14], fov: 50, rail: { a: [20.4, 2.95, -0.6], b: [20.4, 2.95, 28.6], look: [0, 0.7, 0], lag: 0.35 } },
      // the far half of the west block: hanging over the middle of the rows, down his row to the west wall (Outage: down
      // the maze's corridors to the walkway, the SW door at the end of the last one)
      { id: 'c4_floor:westfar', vol: [0, 0, 9, 28], type: 'rail', pos: [10.6, 2.7, 14], fov: 50, rail: { a: [10.6, 2.7, -0.2], b: [10.6, 2.7, 28.2], look: [0, 0.75, 0], lag: 0.35 } },
      // the rail at head height along the south aisle, looking north across the rows (the draped arm, for one pass)
      { id: 'c4_floor:rail', vol: [0, 19.3, 18, 28], pri: 1, world: 'fog', type: 'rail', pos: [9, 1.75, 30.6], fov: 50, rail: { a: [0.5, 1.75, 30.6], b: [18, 1.75, 30.6], look: [0, 0.9, -2.5], lag: 0.4 } },
      // high, looking down over the partitions: the centre north (the pods, the wallboard and what's on it)
      { id: 'c4_floor:centreN', vol: [18, 0, 32.3, 12.5], type: 'static', pos: [25.1, 3.75, 20.8], target: [25.1, 0.6, 5.4], fov: 'fit' },
      { id: 'c4_floor:centreS', vol: [18, 12.5, 32.3, 28], type: 'static', pos: [25.1, 3.75, 4.4], target: [25.1, 0.4, 21], fov: 'fit' },
      // low from the aisle, up at the Team 3 pod
      { id: 'c4_floor:pod3', vol: [18.4, 14.3, 25.2, 21.2], pri: 1, world: 'fog', type: 'static', pos: [28.6, 0.45, 23.6], target: [22, 1.45, 17.6], fov: 'fit' },
      // the east block: two rails under the cable trays, each looking east down the row he's in (the far one ends on the
      // STAFF ROOM door at the end of its aisle)
      { id: 'c4_floor:eastW', vol: [32.3, 0, 41, 28], type: 'rail', pos: [29.9, 2.75, 14], fov: 50, rail: { a: [29.9, 2.75, -0.2], b: [29.9, 2.75, 28.2], look: [0, 0.75, 0], lag: 0.35 } },
      { id: 'c4_floor:eastE', vol: [41, 0, 50, 28], type: 'rail', pos: [38.2, 2.75, 14], fov: 50, rail: { a: [38.2, 2.75, -0.2], b: [38.2, 2.75, 28.2], look: [0, 0.75, 0], lag: 0.35 } },
    ],
    spawns: [
      // Fog: two Reaches in the rows (their arms come over the partitions), the Unread on the wallboard
      // (each stands in a cubicle's mouth, back to the aisle — out of the rail cameras' line down the aisles)
      { id: 'c4_floor:reach1', type: 'reach', pos: [13.2, 5.75], rot: 175, world: 'fog' },
      { id: 'c4_floor:reach2', type: 'reach', pos: [40.4, 11.95], rot: 185, world: 'fog' },
      { id: 'c4_floor:unread', type: 'unread', pos: [25, 1.2], count: 40, world: 'fog', cluster: [[22.9, 2.3, 0.16], [24.1, 2.75, 0.16], [25.3, 2.25, 0.16], [26.5, 2.7, 0.16], [27.2, 1.95, 0.16], [23.6, 1.55, 0.16], [25.9, 1.5, 0.16]] },
      // Outage: three Reaches in the maze, the Unread on the west-wall wallboard in C3
      { id: 'c4_floor:oreach1', type: 'reach', pos: [9.5, 5.3], rot: 180, world: 'outage' },
      { id: 'c4_floor:oreach2', type: 'reach', pos: [6.0, 11.6], rot: 90, world: 'outage' },
      { id: 'c4_floor:oreach3', type: 'reach', pos: [10.5, 26.4], rot: -90, world: 'outage' },
      { id: 'c4_floor:ounread', type: 'unread', pos: [0.9, 17.6], count: 36, world: 'outage', cluster: [[0.12, 1.9, 16.9], [0.12, 2.3, 17.6], [0.12, 1.7, 18.2], [0.12, 2.6, 17.1], [0.12, 1.4, 17.8]] },
    ],
    build(K) {
      const H = FL.H;
      K.floor(0, 0, 50, 28, { tex: 'carpet', color: '#5a6168' });
      K.ceiling(0, 0, 50, 28, H, 'ceiling_tile');
      // walls: north (records door, the wallboard), east (break room door), south (lobby door; its west part one-sided
      // for the head-height rail), west (the SW door)
      K.wall(-0.1, 0, 50.1, 0, H, 'plaster_stained', { openings: [{ at: 7.2, w: 1.0, h: 2.15 }], skirting: true, grime: true });
      K.wall(50, -0.1, 50, 28.1, H, 'plaster', { openings: [{ at: 7.2, w: 1.0, h: 2.15 }], skirting: true });
      K.wall(19, 28, -0.1, 28, H, 'plaster', { both: false, skirting: true });
      K.wall(50.1, 28, 19, 28, H, 'plaster', { openings: [{ at: 25.0, w: 1.05, h: 2.2 }], skirting: true });
      K.wall(0, 28.1, 0, -0.1, H, 'plaster_stained', { openings: [{ at: 1.8, w: 1.0, h: 2.15 }], skirting: true, grime: true });
      // exposed services under the ceiling
      for (const z of [3.8, 9.9, 16.1, 22.3]) { K.prop('cable_tray', 9.6, z, 0, { len: 16, ceil: H, h: 3.45 }); K.prop('cable_tray', 40.4, z, 0, { len: 16, ceil: H, h: 3.45 }); }

      // ---- the cubicles (and every desk phone) --------------------------------------------------------------------------
      const phones = [];
      const PAL = ['#5e6a72', '#606b66', '#5a6470', '#646a6a'];
      for (let idx = 0; idx < 8; idx++) {
        const zb = FL.rows[idx], cz = zb + 0.8;
        for (const B of ['W', 'E']) for (let k = 0; k < 9; k++) {
          const cx = cubX(B, k);
          const gone = B === 'W' && ([1, 3, 5].includes(idx) || ((idx === 2 || idx === 6) && k === 8));   // not there in the Outage
          const isChase = B === 'W' && idx === 5 && k === 2;
          const armCub = B === 'W' && idx === 5 && k === 6;
          const glow = armCub || (idx * 7 + k * 3 + (B === 'E' ? 5 : 0)) % 17 === 0;
          const o = { w: FL.cw, d: 1.6, color: PAL[(idx + k) % PAL.length], chair: isChase ? false : undefined, lamp: isChase, lit: isChase, light: isChase ? undefined : false, content: glow ? (armCub || k % 2 ? 'login' : 'static') : 'off', screen: armCub };
          if (gone) o.world = 'fog';
          K.prop('cubicle', cx, cz, 0, o);
          const ph = { x: cx + 0.4, y: 0.748, z: cz - 0.45, world: gone ? 'fog' : null, special: isChase };
          phones.push(ph);
          if (!isChase) K.interact(ph.x, 0.95, ph.z, (G) => C4_deskPhone(G, ph), { id: `c4_floor:ph${idx}${B}${k}`, r: 0.85, world: gone ? 'fog' : undefined });
        }
        C4_rowSign(K, idx + 1, 0.75, cz);
        C4_rowSign(K, idx + 1, 49.25, cz);
      }
      C4.phoneList = phones;
      // Chase's cubicle (row 6 west): his own chair, his phone on the desk after 4-1
      K.prop('office_chair', CHASE_CUB.chair[0], CHASE_CUB.chair[1], 180, { world: 'fog' });
      // a warm, low spill off the lamp into the aisle (4-1's close shots only; off otherwise)
      K.light('point', 7.0, 1.55, 19.3, { name: 'c4fl:csfill', color: '#ffc98e', intensity: 1.6, distance: 3.4, on: false, world: 'fog' });
      const cp = new THREE.Group(); cp.name = 'c4:chasephone';
      { const b = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.15), new THREE.MeshStandardMaterial({ color: '#121416', roughness: 0.3 })); b.userData.ownedGeo = true; cp.add(b);
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.135), new THREE.MeshStandardMaterial({ color: '#10302c', emissive: '#2fb8a8', emissiveIntensity: 0.9, roughness: 0.2 })); sc.rotation.x = -Math.PI / 2; sc.position.y = 0.0052; sc.userData.ownedGeo = true; cp.add(sc); }
      cp.position.set(CHASE_CUB.x + 0.22, 0.752, CHASE_CUB.z - 0.42); cp.rotation.y = 0.35;
      K.mesh(cp, { name: 'c4:chasephone', world: 'fog' });
      K.animate(() => { cp.visible = done('cs:4-1') && !S.outage; });
      K.doc('chase_notes', CHASE_CUB.x + 0.22, 0.76, CHASE_CUB.z - 0.42, { id: 'c4_floor:chasenotes', model: 'none', r: 1.45, world: 'fog', when: () => done('cs:4-1') });
      const npc = K.npc('chase', 'chase', CHASE_CUB.chair[0], CHASE_CUB.chair[1] - 0.05, 180, { anim: 'sit', when: () => !done('cs:4-1') && !S.outage && !flag('c4_outage'), world: 'fog' });
      if (npc) { try { npc.wear('headset', true); npc.hold('R', null); npc.idleLife = false; } catch (e) { /* rig */ } }
      if (!done('cs:4-1') && !flag('c4_outage')) {
        const bar = Rig.prop('bar');
        bar.position.set(CHASE_CUB.x, 0.66, CHASE_CUB.chair[1] - 0.32); bar.rotation.set(0, 0, Math.PI / 2);
        K.mesh(bar, { name: 'c4:lapbar', world: 'fog' });
      }
      // the draped arm, three rows ahead of the south aisle (gone after its one pass)
      if (!done('c4:arm') && !flag('c4_outage')) {
        const arm = C4_armMesh(); arm.position.set(ARM.x, 0, ARM.z); arm.rotation.y = 0;
        K.mesh(arm, { name: 'c4:arm', world: 'fog' });
        C4.arm = arm; C4.armCam = false;
        K.light('screen', ARM.x - 0.3, 1.2, ARM.z + 0.7, { color: '#b8e4ea', intensity: 3.2, distance: 4.2, world: 'fog', name: 'c4fl:armglow' });
        K.animate(() => {
          if (!C4.arm || !C4.arm.visible) return;
          const cur = Cam.current;
          if (cur && cur.id === 'c4_floor:rail') C4.armCam = true;
          const P = Player.pos, near = P && Math.hypot(P.x - ARM.x, P.z - ARM.z) < 5.5;
          if ((C4.armCam && (!cur || cur.id !== 'c4_floor:rail')) || near) { C4.arm.visible = false; S.done['c4:arm'] = true; }
        });
      }

      // ---- the centre: four raised team-leader pods ---------------------------------------------------------------------
      for (const p of PODS) {
        K.prop('pod_desk', p.x, p.z, 0, { team: 'TEAM ' + p.n, ringing: p.n === 3 ? !flag('c4_clicks') : undefined, name: 'c4_pod' + p.n, screen: false });
        if (p.n !== 3) phones.push({ x: p.x + 0.8, y: 1.32, z: p.z + 0.2 });
      }
      // Team 3: the huddle board (huddle2), the ringing phone with the clicks
      K.prop('huddle_board', 19.5, 17.6, 90, { text: 'TEAM 3 — Avg handle time\ntarget 6:00 · Current 11:42\n\nKEEP CALLS SHORT\n\nOffer callbacks to\nclear the queue!' });
      K.doc('huddle2', 19.65, 1.45, 17.6, { id: 'c4_floor:huddle2', model: 'none', r: 1.4 });
      K.interact(22.8, 1.35, 17.8, (G) => C4_listen(G), { id: 'c4_floor:pod3phone', r: 1.7 });
      K.prop('desk_lamp', 21.1, 16.75, 200, { y: 1.32, lit: true, world: 'fog' });
      C4.podLed = K.light('led', 22.9, 1.39, 17.87, { color: '#ff2a1c', name: 'c4fl:podled', on: false });
      // Team 1: Account Note 5 in a drawer
      K.interact(21.3, 0.9, 5.2, async (G) => {
        if (done('c4:drawer')) { await G.think('Paperclips. A dead highlighter. That\'s all that\'s left.'); return; }
        S.done['c4:drawer'] = true;
        G.sfx('handle', { pos: [21.3, 0.8, 5.4], vol: 0.6 });
        await G.think('The top drawer\'s not locked. [beat] One page, folded in half.');
        await G.doc('acct5', { id: 'c4_floor:acct5' });
      }, { id: 'c4_floor:drawer', r: 1.5 });
      K.pickup('coffee', 28.9, 1.33, 6.1, { id: 'c4_floor:coffee', extraOnEasy: true, rot: 40 });
      // the wallboard on the north wall (the Unread rest on it in the Fog world)
      for (let i = 0; i < 6; i++) {
        const x = 22.9 + (i % 3) * 2.1, y = i < 3 ? 2.62 : 1.78;
        K.box(x, y - 0.42, 0.06, 1.3, 0.84, 0.1, { color: '#1a1c1d', roughness: 0.5 });
        K.plane(x, y, 0.115, 1.2, 0.75, wallboardTex(i, false), { emissive: true, emissiveIntensity: 0.8, world: 'fog' });
        K.plane(x, y, 0.115, 1.2, 0.75, wallboardTex(i, true), { emissive: true, emissiveIntensity: 0.9, world: 'outage' });
      }
      K.light('screen', 25, 2.2, 1.2, { color: '#7fd8d0', intensity: 1.6, distance: 6, world: 'fog', name: 'c4fl:board' });
      K.light('screen', 25, 2.2, 1.2, { color: '#ff3b2a', intensity: 1.6, distance: 6, world: 'outage' });

      // ---- doors ----------------------------------------------------------------------------------------------------------
      K.door({ id: 'c4_floor:records', x: 7.1, z: 0, rot: 0, w: 0.95, style: 'metal', to: 'c4_records', entry: 'door', locked: true, lockMsg: 'It\'s locked. There\'s an old dial beside it.', sign: 'RECORDS' });
      K.prop('rotary_dial', DIAL.x, DIAL.z, 0, { mount: 1.3, name: 'c4_dial' });
      K.interact(DIAL.x, 1.3, 0.25, (G) => C4_dial(G), { id: 'c4_floor:dial', r: 1.0 });
      // (the card sits under the dial on the same plate: until it has been read, E reads the card first)
      K.doc('rotary_card', DIAL.x, 0.95, 0.1, { id: 'c4_floor:rotarycard', model: 'none', wall: true, r: 1.0, prio: -0.3, when: () => !(S.docs && S.docs.rotary_card) });
      K.light('lamp', 7.6, 2.35, 0.35, { color: '#e8d8b0', intensity: 2.2, distance: 4.5, name: 'c4fl:recordslamp' });
      K.door({ id: 'c4_floor:break', x: 50, z: 7.1, rot: -90, w: 0.95, style: 'wood', to: 'c4_break', entry: 'door', sign: 'STAFF ROOM', world: 'fog' });
      K.door({ id: 'c4_floor:breakO', x: 50, z: 7.1, rot: -90, w: 0.95, style: 'wood', world: 'outage', locked: true, lockMsg: 'The handle won\'t turn.' });
      K.prop('exit_sign', 49.92, 7.1, -90, { mount: 2.45 });
      K.light('lamp', 49.55, 2.3, 7.1, { color: '#e8d8b0', intensity: 2.0, distance: 4.5, world: 'fog', name: 'c4fl:breaklamp' });
      K.door({ id: 'c4_floor:lobby', x: 25.1, z: 28, rot: 180, w: 1.0, h: 2.15, style: 'glass', to: 'c4_lobby', entry: 'floor', world: 'fog', sign: 'LOBBY' });
      K.door({ id: 'c4_floor:fire', x: 0, z: 26.3, rot: 90, w: 0.95, style: 'fire', world: 'fog', locked: true, lockMsg: 'A fire door. Alarmed, and locked.' });
      K.door({ id: 'c4_floor:side', x: 0, z: 26.3, rot: 90, w: 0.95, style: 'glass', world: 'outage', to: 'c4_oldstore', entry: 'side', sign: 'LOBBY' });
      K.prop('exit_sign', 0.08, 26.3, 90, { mount: 2.45 });

      // ---- lights (Fog): half the tubes dead; a few burn over the rows (some flickering), enough to read him by --------------
      for (let x = 5; x < 50; x += 10) for (const z of [5, 14, 23]) {
        if (x === 25 && z !== 14) continue;
        const lit = (x === 25 && z === 14) || (x === 45 && z === 14) || (x === 5 && z === 23) || (x === 15 && z === 5) || (x === 35 && z === 23) || (x === 45 && z === 5) || (x === 5 && z === 14) || (x === 5 && z === 5);
        K.prop('fluoro_tube', x, z, 90, { h: 3.2, lit, flicker: x === 25 || x === 5 || (x === 35 && z === 23), bank: lit ? (x === 25 ? 1 : 2) : undefined, world: 'fog', light: lit ? undefined : false });
      }
      K.light('led', 0.08, 2.3, 26.3, { color: '#2aff5a', world: 'fog' });
      K.writing('FOLLOW UP TOMORROW', 49.92, 1.7, 18.5, 2.0, { rotY: -90, world: 'fog' });
      K.writing('IT\'LL BE FINE', 30.5, 1.5, 0.08, 1.6, { rotY: 0, world: 'fog' });
      K.dress('papers', [18.5, 1, 31.5, 27], 20, { seed: 71 });
      K.dress('papers', [0.1, 1, 1.4, 27], 10, { seed: 72 });

      // ---- the Outage: the maze, the headsets like vines, receipt strips, every phone ringing ------------------------------------
      K.outageOnly(() => {
        const CT = { tex: 'contracts', color: '#d8d2c0' };
        // tall walls on the back lines of rows 3, 5, 7 (gaps: rows 3 and 7 at the east end; row 5 at the walkway)
        K.box(8.85, 0, FL.rows[2] - 0.14, 14.7, 2.5, 0.26, CT, { collide: true });
        K.box(9.6, 0, FL.rows[4] - 0.14, 16.2, 2.5, 0.26, CT, { collide: true });
        K.box(8.85, 0, FL.rows[6] - 0.14, 14.7, 2.5, 0.26, CT, { collide: true });
        // the walkway blocked beside rows 3 and 7
        K.box(0.75, 0, FL.rows[2] + 0.8, 1.5, 2.5, 1.9, CT, { collide: true });
        K.box(0.75, 0, FL.rows[6] + 0.8, 1.5, 2.5, 1.9, CT, { collide: true });
        // the centre sealed off (seen only from the west). Its collider is a metre thick: a Reach walking into Aidan
        // while he stands against a thin wall shoves him through it (engine), and the sealed centre is a dead end
        K.wall(18.1, 0, 18.1, 28, 2.6, CT, { both: false });
        const seal = K.collider(18.02, -0.1, 19.3, 28.1, { h: 2.6 });
        if (seal) seal.oneSided = [-1, 0];                       // (like the cutaway: the cameras in the centre see through it)
        // the lobby door behind a wall of paper
        K.box(25.1, 0, 27.4, 3.0, 2.6, 0.8, CT, { collide: true });
        for (const [x, z, t] of [[9, 7.35, 'FOLLOW UP TOMORROW'], [6, 13.55, 'WHO ARE YOU TRYING TO REACH'], [12, 19.75, 'DID YOU CHECK']]) K.writing(t, x, 1.6, z, 2.6, { rotY: 180, style: 'marker' });
        K.writing('ASK THEM', 0.1, 1.5, 22.5, 1.4, { rotY: 90, style: 'receipt' });
        // the wallboard on the west wall (the Unread rest on it)
        K.box(0.06, 1.15, 17.5, 0.1, 1.5, 2.1, { color: '#1a1c1d', roughness: 0.5 });
        K.plane(0.115, 1.9, 17.5, 1.95, 1.3, wallboardTex(5, true), { rotY: 90, emissive: true, emissiveIntensity: 0.9 });
        K.light('screen', 0.8, 1.9, 17.5, { color: '#ff3b2a', intensity: 1.4, distance: 5 });
        // headsets hanging on their curly cords like vines; receipt paper in strips
        const HS = [[3, 2.2], [7, 3.6], [12, 5.8], [15.5, 4.1], [5, 10.3], [9.6, 12.1], [14, 10.8], [2.6, 16.2], [7.5, 18.7], [11.8, 16.9], [16.2, 18.2], [4, 22.4], [9, 25.9], [13.5, 22.3], [16.8, 26.5], [0.8, 12], [0.8, 19.6], [22, 11], [28, 13], [35, 5], [41, 9], [46, 15], [38, 21], [44, 25]];
        HS.forEach(([x, z], i) => K.prop('headset_hanging', x, z, i * 47, { ceil: H, len: 1.3 + (i % 4) * 0.35 }));
        const RS = [[4.5, 5.9], [10.6, 3.4], [2.2, 11.8], [12.4, 12.9], [8.2, 17.2], [14.6, 15.8], [6.4, 26.8], [12.8, 25.1], [30, 3], [37, 18]];
        RS.forEach(([x, z], i) => K.prop('receipt_strip', x, z, i * 31, { ceil: H, len: 1.6 + (i % 3) * 0.5 }));
        K.prop('receipt_curtain', 17.0, 8.4, 0, { ceil: H, w: 1.6, len: 2.0 });
        K.prop('receipt_curtain', 17.0, 20.8, 0, { ceil: H, w: 1.6, len: 2.0 });
        K.dress('receipts', [0.2, 0.2, 17.6, 27.8], 60, { seed: 73 });
        // flickering tubes along the corridors, red LEDs, a red wash by the lobby doors
        for (const [x, z, real] of [[9, 2.2, true], [8, 5.3, true], [9, 11.5, true], [8, 17.7, true], [9, 25.5, true], [25, 14, false], [42, 14, false]]) K.prop('fluoro_tube', x, z, 0, { h: 3.2, flicker: true, light: real ? undefined : false, bank: real ? 3 : undefined });
        K.light('point', 1.2, 2.4, 26.2, { color: '#ff3b2a', intensity: 3, distance: 6, name: 'c4fl:redwash' });
        for (const [x, z] of [[1.5, 3.1], [17.3, 9.3], [1.5, 13.9], [17.3, 21.7]]) K.light('led', x, 1.2, z, { color: '#ff2a1c', blink: true });
        K.pickup('coffee', 6.6, 0.02, 0.7, { id: 'c4_floor:ocoffee', rot: 20 });
        K.pickup('energy_drink', 12.2, 0.75, 9.55, { id: 'c4_floor:oenergy', extraOnEasy: true });
      });

      // ---- the ringing floor ----------------------------------------------------------------------------------------------------
      C4_ringField(K, phones);

      // ---- triggers ---------------------------------------------------------------------------------------------------------------
      // CUTSCENE 4-1 as he comes into Chase's aisle
      K.trigger([0.2, 16.9, 11.5, 20.0], (G) => G.cutscene('4-1'), { id: 'c4_floor:41', when: (s) => !s.outage && !(s.flags && s.flags.c4_outage) && !(s.done && s.done['cs:4-1']) });

      // ---- examine lines (Aidan) --------------------------------------------------------------------------------------------------
      K.examine(25, 1.8, 0.6, ['Calls waiting: four thousand one hundred and twelve. Longest wait: two hours, fourteen minutes.', 'Service level: three percent. [beat] Nobody\'s been answering for a long time.'], { id: 'c4fl:board', r: 2.6, world: 'fog' });
      K.examine(25, 1.8, 0.6, ['"Longest wait: tomorrow."', '"Who are you trying to reach."'], { id: 'c4fl:boardO', r: 2.6, world: 'outage' });
      K.examine(4.2, 1.1, 2.6, ['Sticky notes on the partition. "ESCALATE?" "cb 2pm" "breathe".', 'Somebody wrote "be nice" and underlined it. Then crossed it out.'], { id: 'c4fl:notes', r: 1.3 });
      K.examine(13.8, 1.0, 21.2, ['A kid\'s drawing pinned to the partition. A house and a sun and a phone.', 'The phone\'s the biggest thing in it.'], { id: 'c4fl:drawing', r: 1.3, world: 'fog' });
      K.examine(36.6, 1.0, 3.4, ['A headset on the desk, still warm-looking. The cord\'s been chewed.', 'Eleven hours logged in. The status just says "Wrap-up".'], { id: 'c4fl:headset', r: 1.3 });
      K.examine(44.4, 1.0, 12.1, ['A mug. "I survived my first 100 calls."', 'There\'s a line under it in biro: "barely".'], { id: 'c4fl:mug', r: 1.3 });
      K.examine(41.4, 1.0, 21.4, ['A sandwich in cling wrap, one bite gone.', 'They didn\'t even get to finish lunch.'], { id: 'c4fl:sandwich', r: 1.3 });
      K.examine(49.2, 1.5, 5.0, ['Row 1. [beat] The row signs go all the way back.', 'Eight rows. Nine desks a row, both sides. That\'s a hundred and forty-four phones.'], { id: 'c4fl:rows', r: 1.6, world: 'fog' });
      K.examine(28.2, 1.4, 19.2, ['Team 4\'s pod. Four monitors, one chair.', 'Somebody sat up here and watched everyone else be on hold.'], { id: 'c4fl:pod4', r: 1.8 });
      // the Outage maze (every one of these stands on its route)
      K.examine(8.85, 1.3, 7.2, ['The partitions are gone. It\'s paper now. Contracts, stacked higher than me.', 'Every one of them\'s signed.'], { id: 'c4fl:owall', r: 1.5, world: 'outage' });
      K.examine(9.6, 1.9, 12.1, ['Headsets, hanging off the ceiling on their cords.', 'Every one of them\'s got someone on hold.'], { id: 'c4fl:oheadsets', r: 1.5, world: 'outage' });
      K.examine(12.4, 1.5, 12.9, ['Receipt paper, hanging in strips.', 'Callback. Callback. Callback. [beat] Every one of them says tomorrow.'], { id: 'c4fl:oreceipts', r: 1.3, world: 'outage' });
      K.examine(0.4, 1.9, 17.5, ['"Who are you trying to reach."', 'It used to count the calls waiting. Now it just asks.'], { id: 'c4fl:owallboard', r: 1.6, world: 'outage' });
      K.examine(6.6, 0.95, 21.5, ['A desk. The phone on it\'s ringing like all the rest.', 'The chair\'s pushed back, like they just stood up and walked out.'], { id: 'c4fl:odesk', r: 1.2, world: 'outage' });
    },
    onUpdate() {
      C4_ambient(['#5a6664', 0.32], ['#1f6f6a', 0.15]);
      // the far bed of phones follows the world
      const w = S.outage ? 'o' : 'f';
      if (C4.floorBed !== w) { C4.floorBed = w; if (S.outage) C4_farRing(3, 0.34, 1900); else C4_farRing(2, 0.2, 1300); }
    },
    onLeave() { C4_ambientOff(); C4_stopRing(); C4.floorBed = null; C4.arm = null; },
    async onEnter(G, from) {
      if (S.chapter !== 4) return;
      if (!S.outage && G.once('c4:floorIn')) {
        await G.wait(1.5);
        await G.think('Every phone in here is ringing.');
        note(G, 'Find Chase. Then the call logs — the records room.', 'c4_goal');
      }
      if (S.outage && G.once('c4:mazeIn')) {
        await G.wait(1.2);
        await G.think('The rows have moved. [beat] The lobby. Along the wall.');
        note(G, 'Get back to the lobby. Chase is out there on his own. Along the west wall.', 'c4_goal');
      }
    },
  });

  // the Team 3 pod phone: static, then clean pulse clicks — 2, 2, 3, 1 — repeating while the handset is up (spec 4-3,
  // §2A "Ch 4 pulse dial": Easy logs the digits after one listen, Normal after two, Hard never, and the clicks are faster)
  const PULSE = [2, 2, 3, 1];
  async function C4_listen(G) {
    const A = G.aidan, lvl = riddle(), fast = lvl === 'hard';
    const need = lvl === 'easy' ? 1 : lvl === 'hard' ? Infinity : 2;
    const pod = G.obj('c4_pod3'), ph = pod && pod.userData.phone;
    if (flag('c4_clicks')) {
      await A.turn([22.8, 17.8], 0.3);
      await G.think('Twenty-two thirty-one. [beat] It\'s stopped ringing.');
      return;
    }
    await A.turn([22.8, 17.8], 0.3);
    if (ph && ph.userData.setRinging) ph.userData.setRinging(false);
    G.sfx('clunk', { pos: [22.8, 1.4, 17.8], vol: 0.45 });
    A.hold('L', 'handset', { pose: 'phone_ear' });
    if (A.raw) A.raw.idleLife = false;
    // close on him, the handset at his ear, the pod behind
    const p = Player.pos;
    G.cam({ pos: [p.x + 1.3, 1.55, p.z + 1.4], target: [p.x, 1.45, p.z], fov: 38, to: { pos: [p.x + 1.15, 1.55, p.z + 1.25], fov: 34 }, dur: 20 });
    G.sfx('static', { dur: 1.3, vol: 0.5 });
    await G.wait(1.5);
    G.prompt('{interact}: hang up.', { id: 'c4_hangup' });
    const per = fast ? 0.07 : 0.1, gapD = fast ? 0.55 : 0.95, gapR = fast ? 1.5 : 2.4;
    let hung = false;
    const led = G.light('c4fl:podled');
    const waitOr = async (sec) => {
      let t = 0;
      await G.loop((dt) => {
        if (Input.pressed('interact') || Input.pressed('cancel')) { hung = true; try { Input.consume('interact'); Input.consume('cancel'); } catch (e) { /* input */ } return true; }
        t += dt; return t >= sec;
      }, { interactive: true });
    };
    while (!hung) {
      for (const d of PULSE) {
        G.sfx('rotary_click', { n: d, fast, vol: 0.9 });
        // the message light winks with every click
        for (let i = 0; i < d && !hung; i++) { if (led) led.on(true); await waitOr(per * 0.5); if (led) led.on(false); if (!hung) await waitOr(per * 0.5); }
        if (hung) break;
        await waitOr(gapD);
        if (hung) break;
      }
      if (hung) break;
      S.done['c4:listens'] = (S.done['c4:listens'] | 0) + 1;
      // (listens add up across pick-ups: hanging up after the first one and listening again later still counts twice)
      if (S.done['c4:listens'] >= need) {
        // the digits are logged
        G.set('c4_clicks', true);
        note(G, 'Clicks: 2... 2... 3... 1.', 'c4_clicks');
        await G.say('AIDAN', 'Twenty-two thirty-one. [beat] ...That\'s the case number.');
        note(G, 'The records room. The dial by the door.', 'c4_goal');
        break;
      }
      await waitOr(gapR);
    }
    if (led) led.on(false);
    G.sfx('static', { dur: 0.4, vol: 0.35 });
    G.sfx('clunk', { pos: [22.8, 1.4, 17.8], vol: 0.6 });
    A.hold('L', weaponKind());
    if (A.raw) A.raw.idleLife = true;
    G.camRelease();
    if (!flag('c4_clicks')) {
      if (ph && ph.userData.setRinging) ph.userData.setRinging(true);
      if (G.once('c4:clicksThought')) await G.think(lvl === 'hard' ? 'Clicks. Groups of them. [beat] Too fast to be sure.' : 'Clicks. Groups of clicks. [beat] It\'s a number.');
    }
  }
  // the records door's rotary dial: dialling 2231 opens it
  async function C4_dial(G) {
    if (done('unlocked:c4_floor:records')) { await G.think('It\'s open. Two, two, three, one.'); return; }
    const code = await G.keypad({ style: 'rotary', digits: 4, label: 'RECORDS', check: (c) => (c === DIAL.code ? true : 'Nothing. Just a dial tone.') });
    if (code !== DIAL.code) return;
    const dl = G.obj('c4_dial');
    for (const d of DIAL.code) { if (dl && dl.userData.spin) await Promise.race([dl.userData.spin(d), G.wait(1.6)]); G.sfx('rotary_click', { n: +d, pos: [DIAL.x, 1.3, 0.2] }); }
    G.door('c4_floor:records').unlock();
    G.sfx('maglock', { pos: [7.1, 2.0, 0.1] });
    await G.wait(0.4);
    G.sfx('clunk', { pos: [7.1, 1.0, 0.1], vol: 0.8 });
    await G.think('It took it.');
    note(G, 'The records room. The call logs.', 'c4_goal');
  }

  // =================================================================================================================
  // 4F THE BREAK ROOM — 10 × 8 m, ceiling 2.8. The door on its west wall (onto the floor's east wall); the payphone and
  // the noticeboard (north), the kitchenette (east), lockers and a couch (south), the break table in the middle.
  // The west wall is a cutaway for "static from the doorway".
  // =================================================================================================================
  defineRoom({
    id: 'c4_break', name: 'BREAK ROOM', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 10, 8],
    entries: { door: [0.85, 4.0, 90], start: [0.85, 4.0, 90] },
    cameras: [
      { id: 'c4_break:door', vol: [3.6, 0, 10, 8], type: 'static', pos: [-1.7, 2.5, 7.3], target: [6.4, 0.6, 3.3], fov: 'fit' },
      { id: 'c4_break:corner', vol: [0, 0, 3.6, 8], type: 'static', pos: [9.4, 2.55, 7.4], target: [1.6, 0.7, 3.2], fov: 'fit' },
      // over the couch, up at the payphone and the noticeboard wall
      { id: 'c4_break:payphone', vol: [0.8, 0, 6.6, 2.2], pri: 1, type: 'static', pos: [5.2, 2.45, 7.7], target: [3.4, 0.9, 0.6], fov: 'fit' },
      // low from beside the door, across the table to the kitchenette
      { id: 'c4_break:kitchen', vol: [7.6, 1.4, 10, 6.6], pri: 1, type: 'static', pos: [3.0, 1.35, 1.0], target: [9.4, 1.0, 4.2], fov: 'fit' },
    ],
    build(K) {
      const H = 2.8;
      K.floor(0, 0, 10, 8, { tex: 'lino', color: '#8a8472' });
      K.ceiling(0, 0, 10, 8, H, 'ceiling_tile');
      K.wall(-0.1, 0, 10.1, 0, H, 'plaster', { skirting: true });
      K.wall(10, -0.1, 10, 8.1, H, 'plaster_stained', { skirting: true, grime: true });
      K.wall(10.1, 8, -0.1, 8, H, 'plaster', { skirting: true });
      K.wall(0, 8.1, 0, -0.1, H, 'plaster', { both: false, openings: [{ at: 4.1, w: 1.0, h: 2.15 }] });
      K.door({ id: 'c4_break:door', x: 0, z: 4.0, rot: 90, w: 0.95, style: 'wood', to: 'c4_floor', entry: 'break', sign: 'FLOOR 1' });
      // north: the payphone, the noticeboard, the vending machine
      K.payphone(1.9, 0.08, 0, { wall: true, id: 'c4_break:payphone' });
      K.prop('notice_board', 4.6, 0.08, 0, { mount: 1.55 });
      K.prop('roster', 4.1, 0.09, 0, { mount: 1.45 });
      K.plane(5.3, 1.62, 0.09, 0.42, 0.55, Tex.poster('FEELING\nOVERWHELMED?\nTALK TO SOMEONE.\nEAP — FREE &\nCONFIDENTIAL', { kind: 'notice', seed: 31 }), {});
      K.prop('vending_machine', 8.4, 0.5, 0, { light: false });
      // east: the kitchenette
      K.prop('sink_bench', 9.62, 3.2, -90, { len: 3.0 });
      K.prop('microwave', 9.7, 2.3, -90, { y: 0.92, time: '12:00' });
      K.prop('fridge', 9.55, 5.6, -90, {});
      K.prop('mug', 9.6, 3.4, 30, { y: 0.92, text: 'DEB' });
      K.prop('mug', 9.55, 3.75, 200, { y: 0.92, text: "World's Okayest Team Leader" });
      K.prop('coffee_cup', 9.6, 4.1, 0, { y: 0.92 });
      K.pickup('coffee', 9.58, 0.93, 2.9, { id: 'c4_break:coffee1', rot: 10 });
      K.pickup('coffee', 9.6, 0.93, 4.4, { id: 'c4_break:coffee2', rot: 70 });
      K.box(9.55, 0.92, 4.9, 0.36, 0.12, 0.3, { color: '#f0e8d8', roughness: 0.8 });
      // south: lockers, the couch, a side table (the energy drink)
      K.prop('locker_bank', 2.4, 7.63, 180, { n: 4 });
      K.prop('couch', 6.6, 7.4, 180, { variant: 'vinyl', color: '#4a5a5a' });
      K.box(8.55, 0, 7.35, 0.5, 0.5, 0.5, { tex: 'wood', color: '#6a5a44' }, { collide: true });
      K.pickup('energy_drink', 8.55, 0.5, 7.35, { id: 'c4_break:energy' });
      K.box(6.2, 0.46, 7.2, 0.5, 0.12, 0.4, { color: '#5a3a4a', roughness: 0.9 }, { rot: 20 });
      K.prop('tv', 6.6, 7.92, 180, { mount: 2.05, w: 0.9, content: 'off' });
      // the break table (the clock jumps fifteen minutes)
      K.breakTable(4.9, 3.8, 0, { id: 'c4_break:break', time: [3, 40], clock: [6.9, 2.05, 0.08, 0] });
      K.prop('mug', 4.6, 3.7, 40, { y: 0.74, text: 'HANG IN THERE' });
      K.box(5.25, 0.74, 3.95, 0.34, 0.1, 0.34, { color: '#e8e0d0', roughness: 0.85 });
      // a sagging banner
      K.plane(5, 2.35, 0.09, 3.4, 0.36, Tex.sign('HAPPY BIRTHDAY DEB!', { style: 'shop', w: 3.4, h: 0.36, bg: '#e8b8c0', fg: '#8a2a4a', border: false }), { rot: [0, 0, -3] });
      K.prop('fluoro_tube', 5, 4, 90, { h: H - 0.05, variant: 'troffer', bank: 1 });
      K.prop('fluoro_tube', 2, 4, 90, { h: H - 0.05, variant: 'troffer', lit: false });
      K.prop('fluoro_tube', 8, 4, 90, { h: H - 0.05, variant: 'troffer', light: false, flicker: true });
      K.writing('IT\'LL BE FINE', 9.92, 1.9, 6.6, 1.2, { rotY: -90, world: 'fog' });
      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      K.examine(4.1, 1.45, 0.3, ['The roster. Every shift for a month.', 'Somebody\'s written "SICK" over their own name in pencil. Then rubbed it out.'], { id: 'c4br:roster', r: 1.3 });
      K.examine(5.3, 1.6, 0.3, ['"Feeling overwhelmed? Talk to someone."', 'There\'s a number. Nobody\'s torn one off.'], { id: 'c4br:eap', r: 1.2 });
      K.examine(8.4, 1.2, 1.0, ['Every row\'s sold out except the one with the energy drinks.', 'Somebody\'s taped a note to the glass. "IT TOOK MY $2 AGAIN — J."'], { id: 'c4br:vend', r: 1.3 });
      K.examine(9.4, 1.3, 5.6, ['The fridge. "Label your food." [beat] A lunchbox with a name on it: DEB.', 'Birthday cake. One slice left, still in the box.'], { id: 'c4br:fridge', r: 1.3 });
      K.examine(5, 2.2, 0.4, ['Happy birthday, Deb.', 'Half the balloons are on the floor. Nobody picked them up.'], { id: 'c4br:banner', r: 2.0 });
      K.examine(9.55, 1.05, 3.75, '"World\'s Okayest Team Leader." Someone gave that to someone as a joke. They kept using it.', { id: 'c4br:mug', r: 1.0 });
      K.examine(6.2, 0.7, 7.2, 'A jumper on the couch. Somebody took a nap on their break and never came back for it.', { id: 'c4br:jumper', r: 1.2 });
      K.examine(9.7, 1.1, 2.3, 'The microwave\'s flashing twelve o\'clock.', { id: 'c4br:micro', r: 1.0 });
    },
    onUpdate() { C4_ambient(['#5e6866', 0.3], ['#1f6f6a', 0.06]); },
    onLeave() { C4_ambientOff(); C4_stopRing(); },
    async onEnter(G) { C4_farRing(1, 0.12, 900); },
  });

  // =================================================================================================================
  // 4E THE RECORDS ROOM — 10 × 8 m, ceiling 3.0. The door on its south wall (x 7.1, onto the floor's north wall).
  // Floor-to-ceiling shelves of dot-matrix printouts along the east and west walls and in two freestanding runs; the
  // table in the middle under a hanging lamp, one binder open on it (IN-ENGINE 4-4). The north and south walls are
  // cutaways for the high cameras. Outage: the shelves turn to contracts, receipt paper hangs, the printer prints the
  // receipt map (rmap_care).
  // =================================================================================================================
  const RC = { table: [5, 3.9], door: [7.1, 8] };
  defineRoom({
    id: 'c4_records', name: 'RECORDS ROOM', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 10, 8],
    entries: { door: [7.1, 7.15, 180], start: [7.1, 7.15, 180] },
    cameras: [
      // high over the table under the lamp
      { id: 'c4_records:table', vol: [0, 0, 10, 4.4], type: 'static', pos: [5, 2.86, 9.6], target: [5, 0.5, 2.4], fov: 'fit' },
      { id: 'c4_records:door', vol: [0, 4.4, 10, 8], type: 'static', pos: [5, 2.86, -1.5], target: [5.6, 0.4, 6.4], fov: 'fit' },
      // down the two aisles between the shelves, at eye level from their south ends
      { id: 'c4_records:aisleW', vol: [0.4, 0.4, 1.75, 3.6], pri: 1, type: 'static', pos: [1.15, 1.7, 7.5], target: [1.1, 1.0, 0.8], fov: 'fit' },
      { id: 'c4_records:aisleE', vol: [8.25, 0.4, 9.4, 3.6], pri: 1, type: 'static', pos: [8.85, 1.7, 7.55], target: [8.85, 1.0, 0.8], fov: 'fit' },
    ],
    build(K) {
      const H = 3.0;
      K.floor(0, 0, 10, 8, { tex: 'lino', color: '#7a7a70' });
      K.ceiling(0, 0, 10, 8, H, 'ceiling_tile');
      K.wall(0, 0, 10, 0, H, 'plaster_stained', { both: false });
      K.wall(10, 8, 0, 8, H, 'plaster', { both: false, openings: [{ at: 2.9, w: 1.0, h: 2.15 }] });
      K.wall(10, -0.1, 10, 8.1, H, 'plaster', { skirting: true });
      K.wall(0, 8.1, 0, -0.1, H, 'plaster', { skirting: true });
      K.door({ id: 'c4_records:door', x: RC.door[0], z: RC.door[1], rot: 180, w: 0.95, style: 'metal', to: 'c4_floor', entry: 'records', sign: 'FLOOR 1' });
      // floor-to-ceiling shelves of dot-matrix printouts
      K.fogOnly(() => {
        for (const z of [1.3, 3.5, 5.7]) { K.prop('binders_shelf', 0.2, z, 90, { len: 2.1, h: 2.9 }); K.prop('binders_shelf', 9.8, z, -90, { len: 2.1, h: 2.9 }); }
        for (const x of [2.1, 7.9]) { K.prop('binders_shelf', x - 0.19, 2.1, -90, { len: 2.4, h: 2.6 }); K.prop('binders_shelf', x + 0.19, 2.1, 90, { len: 2.4, h: 2.6 }); }
        K.dress('papers', [0.6, 0.5, 9.4, 7.6], 16, { seed: 81 });
        for (const [x, z, r] of [[3.2, 6.9, 10], [3.8, 7.2, 40], [1.2, 6.8, 80]]) K.prop('box', x, z, r, {});
      });
      K.outageOnly(() => {
        for (const z of [1.3, 3.5, 5.7]) { K.prop('contract_stack', 0.45, z, 0, { h: 2.6 }); K.prop('contract_stack', 9.55, z, 30, { h: 2.4 }); }
        for (const x of [2.1, 7.9]) for (const z of [1.3, 2.9]) K.prop('contract_stack', x, z, x * 20, { h: 2.2 });
        K.collider(0, 0.2, 0.9, 6.9, { h: 2.4 }); K.collider(9.1, 0.2, 10, 6.9, { h: 2.4 });
        K.collider(1.75, 0.9, 2.45, 3.3, { h: 2.4 }); K.collider(7.55, 0.9, 8.25, 3.3, { h: 2.4 });
        for (const [x, z] of [[1.5, 5], [3.5, 1.8], [6.5, 1.5], [8.4, 5.4], [4.2, 6.3], [2.6, 3.6], [7.2, 3.8]]) K.prop('receipt_strip', x, z, x * 33, { ceil: H, len: 1.8 });
        K.prop('headset_hanging', 3.2, 5.1, 20, { ceil: H, len: 1.1 });
        K.dress('receipts', [0.6, 0.5, 9.4, 7.6], 30, { seed: 82 });
        K.writing('FOLLOW UP TOMORROW', 0.08, 1.7, 7.0, 1.6, { rotY: 90, style: 'receipt' });
        K.light('point', 5, 2.5, 6.5, { color: '#ff3b2a', intensity: 2.2, distance: 6, flicker: true });
        K.pickup('rmap_care', 8.55, 0.98, 6.25, { id: 'c4_records:rmap', glint: true, rot: 80 });
      });
      K.collider(1.75, 0.9, 2.45, 3.3, { h: 2.6, world: 'fog' }); K.collider(7.55, 0.9, 8.25, 3.3, { h: 2.6, world: 'fog' });
      K.prop('filing_cabinet', 9.6, 7.2, -90, {});
      K.prop('filing_cabinet', 0.4, 7.2, 90, {});
      // the table under the lamp, the binder open on it
      K.prop('table', RC.table[0], RC.table[1], 0, { len: 2.0 });
      K.prop('chair', RC.table[0] - 0.4, RC.table[1] + 0.75, 170, {});
      K.box(RC.table[0], 0.74, RC.table[1] - 0.02, 0.62, 0.035, 0.42, { color: '#1f4a6b', roughness: 0.6 });
      if (!flag('c4_logs')) K.plane(RC.table[0] + 0.155, 0.779, RC.table[1] - 0.02, 0.29, 0.38, logPageTex(), { rot: [-90, 0, 0], name: 'c4_logpage' });
      K.plane(RC.table[0] - 0.155, 0.779, RC.table[1] - 0.02, 0.29, 0.38, { tex: 'paper', color: '#e8eae0' }, { rot: [-90, 0, 0] });
      K.box(RC.table[0] - 0.6, 0.74, RC.table[1] + 0.1, 0.24, 0.26, 0.32, { tex: 'cardboard', color: '#b89a70' });
      K.cyl(RC.table[0], H - 0.6, RC.table[1], 0.008, 0.6, { tex: 'metal', color: '#2a2c2c' });
      K.cyl(RC.table[0], H - 0.82, RC.table[1], 0.28, 0.22, { color: '#243a38', roughness: 0.5 }, { r2: 0.07, open: true });
      K.light('lamp', RC.table[0], H - 0.9, RC.table[1], { color: '#ffdca8', intensity: 5, distance: 6, bank: 1, name: 'c4rc:lamp' });
      // the dot-matrix printer on its trolley (it prints the receipt map in the Outage)
      K.box(8.55, 0, 6.25, 0.8, 0.72, 0.55, { tex: 'metal', color: '#6a6e6c' }, { collide: true });
      K.prop('printer', 8.55, 6.25, -90, { y: 0.72 });
      K.plane(8.55, 0.4, 6.53, 0.6, 0.6, { tex: 'paper', color: '#e8eae0' }, { rotY: 0 });
      K.plane(3.4, 1.55, 0.09, 0.6, 0.8, Tex.poster('RETENTION\nSCHEDULE\nCALL LOGS: 7 YEARS', { kind: 'notice', seed: 41 }), { world: 'fog' });
      // the torn pages hang in the air (after "Tear it up")
      if (fv('c4_logs') === 'torn') { const pc = C4_pieces(); K.mesh(pc.group, { name: 'c4:pieces' }); K.animate(pc.tick); }
      // IN-ENGINE 4-4 as he reaches the table
      K.trigger([3.4, 4.35, 6.8, 6.4], (G) => G.cutscene('4-4'), { id: 'c4_records:44', when: (s) => !(s.flags && s.flags.c4_logs) });
      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      K.examine(0.5, 1.5, 3.5, ['Binders of printouts, all the way up. Dates on the spines.', 'Somebody logged every call this place ever took.'], { id: 'c4rc:shelves', r: 1.4, world: 'fog' });
      K.examine(9.5, 1.5, 3.5, ['STORE 0410. STORE 0411. STORE 0412.', 'Mine\'s here. Of course mine\'s here.'], { id: 'c4rc:stores', r: 1.4, world: 'fog' });
      K.examine(8.55, 1.0, 6.0, ['A dot-matrix printer. The paper\'s still feeding.', 'It stopped halfway through a line.'], { id: 'c4rc:printer', r: 1.2, world: 'fog' });
      K.examine(3.4, 1.5, 0.3, ['Retention schedule. Call logs: seven years.', 'Everything anyone ever asked for. Kept.'], { id: 'c4rc:retention', r: 1.3, world: 'fog' });
      K.examine(5.6, 0.85, 4.0, ['A box of highlighters. All yellow. All dried out.', 'Except one.'], { id: 'c4rc:box', r: 1.1 });
      K.examine(0.5, 1.5, 3.5, ['Contracts. All the way up.', 'Every one of them signed. Every one of them mine.'], { id: 'c4rc:contracts', r: 1.4, world: 'outage' });
      K.examine(8.55, 1.0, 6.0, ['The printer\'s still going. Receipt paper now.', 'It printed the building. [beat] A map of the way out.'], { id: 'c4rc:oprinter', r: 1.2, world: 'outage' });
      K.examine(4.2, 1.5, 6.3, ['Strips of receipt paper from the ceiling.', 'Call logs. Every one of them.'], { id: 'c4rc:ostrips', r: 1.2, world: 'outage' });
      K.examine(0.3, 1.7, 7.0, ['"Follow up tomorrow."', 'It\'s my handwriting.'], { id: 'c4rc:owriting', r: 1.4, world: 'outage' });
      K.examine(RC.table[0], 0.9, RC.table[1], async (G) => {
        if (fv('c4_logs') === 'read') await G.think('Callback assigned: Aidan. [beat] I\'ve read it.');
        else await G.think('I tore it up. [beat] It\'s still up there. All of it.');
      }, { id: 'c4rc:binder', r: 1.2, when: () => !!flag('c4_logs') });
    },
    onUpdate() { C4_ambient(['#5e6866', 0.26], ['#1f6f6a', 0.07]); },
    onLeave() { C4_ambientOff(); C4_stopRing(); C4.pieces = null; },
    async onEnter(G) { C4_farRing(1, 0.1, 800); },
  });
  // the torn pages of the call log, hanging in the air instead of falling (slowly turning)
  function C4_pieces() {
    const g = new THREE.Group(); g.name = 'c4:pieces';
    const r = U.rng(2231);
    const items = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09 + r() * 0.07, 0.08 + r() * 0.07), new THREE.MeshStandardMaterial({ map: scrapTex(i % 6), side: THREE.DoubleSide, roughness: 0.9, transparent: true, alphaTest: 0.2 }));
      m.userData.ownedGeo = true;
      const base = new THREE.Vector3(RC.table[0] + (r() - 0.5) * 2.2, 0.9 + r() * 1.5, RC.table[1] + (r() - 0.5) * 1.8);
      m.position.copy(base); m.rotation.set(r() * 6, r() * 6, r() * 6);
      g.add(m); items.push({ m, base, w: new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3), ph: r() * 6 });
    }
    const tick = (dt, t) => { for (const it of items) { it.m.rotation.x += it.w.x * dt; it.m.rotation.y += it.w.y * dt; it.m.rotation.z += it.w.z * dt; it.m.position.y = it.base.y + Math.sin(t * 0.4 + it.ph) * 0.03; } };
    return { group: g, items, tick };
  }

  // =================================================================================================================
  // 4G THE OLD STORE — the lobby as Chase's old store at 8:50 pm (Outage only), 20 × 12 m, ceiling 4.4. The counter
  // (x 10.2–16.2, z 3.5; the duress button under its staff side), demo tables, the accessory walls, the roller shutter
  // half down across the store front (south), the side door (west, from the floor), the maglocked back office door
  // (east wall, z 8.5 → c4_secoffice) with its red lamp. Cutscene 4-2 and the Escalation.
  // =================================================================================================================
  const OS = { H: 4.4, counter: [13.2, 3.5], duress: [15.6, 3.16], office: [20, 8.5], side: [0, 9.0] };
  defineRoom({
    id: 'c4_oldstore', name: 'THE OLD STORE', area: 'CUSTOMER CARE CENTRE', chapter: 4, outdoor: false, surface: 'vinyl', ambient: 'store',
    fog: { density: 0.028, color: '#3b4543' },
    bounds: [0, 0, 20, 12],
    entries: { side: [0.85, OS.side[1], 90], office: [19.1, OS.office[1], -90], start: [0.85, OS.side[1], 90] },
    cameras: [
      // wide from the side door
      { id: 'c4_oldstore:wide', vol: [9, 0, 20, 12], type: 'static', pos: [1.2, 3.9, 11.4], target: [14.6, 0.8, 5.0], fov: 'fit' },
      { id: 'c4_oldstore:high', vol: [0, 0, 9, 12], type: 'static', pos: [19.4, 4.2, 0.7], target: [4.0, 0.2, 7.4], fov: 'fit' },
      // low at the back office door: the monster from below
      { id: 'c4_oldstore:office', vol: [15, 5.2, 20, 11.2], pri: 1, type: 'static', pos: [8.2, 0.9, 11.4], target: [19.4, 2.0, 7.4], fov: 'fit' },
      // behind the counter, over the demo tables
      { id: 'c4_oldstore:counter', vol: [9.4, 0, 17.8, 3.12], pri: 1, type: 'static', pos: [13.3, 3.0, 9.9], target: [13.4, 0.8, 1.7], fov: 'fit' },
    ],
    spawns: [
      { id: 'c4_oldstore:esc', type: 'c4_escalation', pos: [13.2, 4.25], rot: 0, when: (s) => !(s.flags && s.flags.c4_bossDone) },
    ],
    build(K) {
      const H = OS.H;
      // (the shell keeps its shop finish in the Outage — a store lit for trade at ten to nine — while the receipts, the
      // strips and the marker are the Outage's own)
      const SW = { tex: 'plaster', color: '#dcd8cc', outage: false };
      K.floor(0, 0, 20, 12, { tex: 'vinyl_retail', color: '#b7b3a6', outage: false });
      K.ceiling(0, 0, 20, 12, H, { tex: 'ceiling_tile', outage: false });
      K.wall(-0.1, 0, 20.1, 0, H, { tex: 'plaster', color: '#2a7c78', outage: false }, { skirting: true });
      K.wall(20, -0.1, 20, 12.1, H, SW, { openings: [{ at: OS.office[1] + 0.1, w: 1.0, h: 2.15 }], skirting: true });
      K.wall(20.1, 12, -0.1, 12, H, SW, { openings: [{ at: 10.1, w: 6.1, h: 2.9 }], skirting: true });
      K.wall(0, 12.1, 0, -0.1, H, SW, { openings: [{ at: 12.1 - OS.side[1], w: 1.0, h: 2.15 }], skirting: true });
      // the store: wordmark, counter, duress button, demo tables, accessory walls, posters, the clock at 8:50
      K.plane(13.2, 3.35, 0.09, 3.0, 1.1, Tex.wordmark({ w: 3.0, h: 1.1, bg: BR.teal }), { emissive: true, emissiveIntensity: 0.45 });
      K.prop('counter', OS.counter[0], OS.counter[1], 0, { len: 6, variant: 'store', printer: true, clutter: true });
      K.prop('duress_button', OS.duress[0], OS.duress[1], 180, { mount: 0.74, name: 'c4_duress' });
      K.prop('accessory_wall', 4.4, 0.25, 0, { len: 4.2 });
      K.prop('accessory_wall', 17.8, 0.25, 0, { len: 3.4 });
      K.prop('accessory_wall', 0.25, 3.6, 90, { len: 4.2 });
      K.prop('demo_table', 5.8, 5.2, 12, { lit: true, time: '8:50', len: 1.8 });
      K.prop('demo_table', 9.2, 8.4, -8, { lit: true, time: '8:50', len: 1.8 });
      K.prop('demo_table', 4.4, 9.8, 28, { lit: true, time: '8:50', len: 1.6 });
      K.prop('clock', 17.6, 0.08, 0, { mount: 3.1, time: [8, 50] });
      K.prop('poster', 19.92, 3.4, -90, { style: 'notice', text: 'PLEASE BE PATIENT\nWITH OUR STAFF.\nABUSE WILL NOT\nBE TOLERATED.', mount: 1.7 });
      K.prop('poster', 0.08, 7.2, 90, { style: 'plan', text: 'NEW PLANS\nFROM $39', mount: 1.8 });
      K.prop('roster', 9.6, 0.09, 0, { mount: 1.6 });
      K.prop('ticket_machine', 2.6, 10.9, 45, {});
      // (the staff stools stand tucked in at the counter: one out in the staff aisle left a pocket between it and the
      // counter that wedged Aidan — with Chase held back and the Escalation in the aisle — on his way to the duress button)
      K.prop('stool', 11.8, 2.92, 0, {}); K.prop('stool', 14.6, 2.92, 8, {});
      K.prop('plant_pot', 19.3, 11.3, 0, {});
      floorPlane(K, 13.2, 0.01, 5.6, 1.6, 0.5, { color: '#e8c21a', roughness: 0.8 });
      K.writing('HIT \'EM FIRST', 19.92, 1.6, 5.4, 1.4, { rotY: -90, style: 'marker' });
      // the store front: the roller shutter half down; the dark mall beyond
      K.prop('shutter', 10.1, 12, 0, { w: 6, h: 2.9, open: 0.5, collide: false });
      K.blocker(6.9, 12.0, 13.3, 12.7, 'The shutter\'s stuck halfway. Outside there\'s nothing. Just dark.');
      K.box(10, -0.02, 15, 12, 0.02, 6, { tex: 'tile', color: '#3a3c3a' }, { shadow: false });
      K.box(10, 0, 18, 12, 4, 0.1, { color: '#0a0c0c', roughness: 1 });
      K.light('point', 10, 2.8, 14.5, { color: '#5a7a78', intensity: 1.2, distance: 5, real: false });
      // the doors: the side door he came in by; the back office (maglock, released by the duress button)
      K.door({ id: 'c4_oldstore:side', x: OS.side[0], z: OS.side[1], rot: 90, w: 0.95, style: 'glass', to: 'c4_floor', entry: 'westwall', locked: (s) => !!(s.done && s.done['cs:4-2']) && !(s.flags && s.flags.c4_bossDone), lockMsg: 'It won\'t open from this side.' });
      K.door({ id: 'c4_oldstore:office', x: OS.office[0], z: OS.office[1], rot: -90, w: 0.95, style: 'wired', reader: 'maglock', to: 'c4_secoffice', entry: 'door', sign: 'STAFF ONLY', locked: true, when: () => false });
      K.interact(OS.office[0] - 0.55, 1.1, OS.office[1], (G) => C4_officeDoor(G), { id: 'c4_oldstore:officedoor', r: 1.4 });
      K.prop('alarm_lamp', 19.92, OS.office[1], -90, { mount: 2.45, name: 'c4_alarmlamp', lit: done('c4:duress') });
      K.light('point', 19.2, 2.3, OS.office[1], { color: '#ff2a1c', intensity: 2.6, distance: 6, name: 'c4os:red', on: done('c4:duress') });
      // (once pressed, it stops taking E during the fight: Aidan re-grabs Chase right beside it)
      K.interact(OS.duress[0], 0.74, OS.duress[1] - 0.25, (G) => C4_duress(G), { id: 'c4_oldstore:duress', r: 1.05, when: () => !(C4.fight && done('c4:duress')) });
      // light: the store's tubes, bright; one flickers
      // (the troffers glow; the store's light is four strong pools under them — a shop lit for trade at ten to nine)
      K.prop('fluoro_tube', 7, 4, 90, { h: H - 0.05, variant: 'troffer', light: false });
      K.prop('fluoro_tube', 13, 7, 90, { h: H - 0.05, variant: 'troffer', light: false });
      K.prop('fluoro_tube', 13, 2.5, 90, { h: H - 0.05, variant: 'troffer', light: false });
      K.prop('fluoro_tube', 6, 9.5, 90, { h: H - 0.05, variant: 'troffer', light: false, flicker: true });
      K.prop('fluoro_tube', 17.5, 9.5, 90, { h: H - 0.05, variant: 'troffer', light: false, flicker: true });
      K.light('point', 7, H - 0.5, 4.2, { color: '#dcebe4', intensity: 20, distance: 12, bank: 1 });
      K.light('point', 13.2, H - 0.5, 2.7, { color: '#e4efe8', intensity: 18, distance: 11, bank: 2 });
      K.light('point', 13, H - 0.5, 7.4, { color: '#dcebe4', intensity: 20, distance: 12, bank: 2 });
      K.light('point', 5.6, H - 0.5, 9.6, { color: '#d6e8e0', intensity: 16, distance: 10, bank: 3, flicker: true });
      K.light('point', 17.4, H - 0.5, 9.4, { color: '#d6e8e0', intensity: 14, distance: 9, bank: 3, flicker: true });
      K.dress('receipts', [1, 5, 19, 11.5], 24, { seed: 91 });
      K.prop('receipt_strip', 3.5, 6.5, 0, { ceil: H, len: 2.2 }); K.prop('receipt_strip', 16.5, 10.5, 40, { ceil: H, len: 1.8 });
      K.prop('headset_hanging', 8.2, 3.2, 10, { ceil: H, len: 1.9 });
      // Chase behind the counter, the bar raised
      const ch = K.npc('chase', 'chase', OS.counter[0], 2.85, 0, { anim: 'idle', when: () => !flag('c4_bossDone') });
      if (ch) { try { ch.idleLife = false; ch.hold('R', 'bar', { pose: 'bar_ready' }); ch.expr('angry'); } catch (e) { /* rig */ } }
      // ---- examine lines (Aidan) ----------------------------------------------------------------------------------------
      // (not during the fight: there E is "Hold him back" — an examine in reach would take the press and stop him for a
      // thought while Chase swings)
      const calm = () => !C4.fight;
      K.examine(17.6, 2.6, 0.4, ['Ten to nine. [beat] Ten minutes before close.', 'It\'s not moving.'], { id: 'c4os:clock', r: 2.4, when: calm });
      K.examine(5.8, 1.1, 5.2, ['Demo phones on their security cables. Every lock screen says 8:50.', 'One of the cables is snapped. The phone that was on it isn\'t here.'], { id: 'c4os:demo', r: 1.4, when: calm });
      K.examine(19.6, 1.7, 3.4, ['"Please be patient with our staff. Abuse will not be tolerated."', 'It\'s a laminated sign. That\'s all it ever was.'], { id: 'c4os:sign', r: 1.4, when: calm });
      K.examine(9.6, 1.6, 0.4, ['The roster. Thursday: CHASE — CLOSE.', 'Just his name. Nobody else on.'], { id: 'c4os:roster', r: 1.3, when: calm });
      K.examine(10.1, 1.5, 11.6, ['The shutter\'s half down. Like closing time.', 'Past it there\'s no mall. Just dark.'], { id: 'c4os:shutter', r: 2.0, when: calm });
      K.examine(4.4, 1.4, 0.5, 'Cases, chargers, screen protectors. Every one still in its packet.', { id: 'c4os:acc', r: 1.5, when: calm });
    },
    onUpdate() { C4_ambient(['#6a7472', 0.3], ['#5d807a', 0.36]); },
    onLeave() { C4_ambientOff(); C4_stopRing(); if (C4.fight) C4_fightEnd(); },
    async onEnter(G) {
      C4_farRing(2, 0.1, 1200);
      if (flag('c4_bossDone')) return;
      if (!done('cs:4-2')) { await G.cutscene('4-2'); return; }
      // a reload into the fight (the autosave before the boss): straight back into it
      await G.run(async (G2) => {
        const e = C4.esc || G2.enemy('c4_oldstore:esc');
        if (e) { e.data.level = Math.max(1, e.data.level); e.data.vis = e.data.level; }
        const r = await G2.boss('escalation');
        if (r === 'won' || flag('c4_bossDone')) await G2.cutscene('4-3', { inheritSkip: false });
      }, { control: false, name: 'c4:bossResume' });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // THE ESCALATION (spec §6): the ordinary tired man at the counter, holding up his phone. Every hit it takes — Chase's
  // or Aidan's — pushes it up a level: L1 2 m, reddening; L2 3 m, the skin split to more shouting faces, a second pair
  // of arms torn free; L3 4 m, filling the store, fists like engine blocks, still holding up the phone. It can't be hurt.
  // Its attacks (jab → four-armed sweep → the slam and the roar) make standing and fighting a losing plan.
  // ---------------------------------------------------------------------------------------------------------------
  const ESC = {
    lv: [{ s: 1.0, tint: 0.0, speed: 0.7, cd: 1.9 }, { s: 1.11, tint: 0.32, speed: 0.85, cd: 1.6 }, { s: 1.67, tint: 0.52, speed: 1.0, cd: 1.3 }, { s: 2.22, tint: 0.7, speed: 1.15, cd: 1.1 }],
    atk: {
      jab: { reach: 1.55, wind: 0.55, rec: 0.6, dmg: 12, arc: 80, push: 0.8 },
      sweep: { reach: 2.7, wind: 0.8, rec: 0.8, dmg: 18, arc: 150, push: 1.3 },
      slam: { reach: 3.0, wind: 1.1, rec: 1.2, dmg: 28, radius: 2.2, knock: true },
      roar: { reach: 7.0, wind: 0.65, rec: 0.9, dmg: 6, arc: 60, push: 2.2 },
    },
    lines: ['I just need a new SIM.', 'I don\'t have ID.', 'Do it anyway.', 'I just need it.', 'Do it anyway.'],
  };
  const now = () => (typeof Time !== 'undefined' ? Time.now : performance.now() / 1000);
  const fdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // attach a mesh to a bone/anchor so that its local size is in metres at the actor's rest scale
  function C4_attach(a, parent, mesh, pos, rot) {
    const ws = new THREE.Vector3(); a.root.updateMatrixWorld(true); parent.getWorldScale(ws);
    const k = 1 / (ws.x || 1);
    const g = new THREE.Group(); g.scale.setScalar(k); g.add(mesh);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    parent.add(g);
    return g;
  }
  function C4_escCreate(e) {
    const a = Rig.create('man_counter', { extraArms: 1, idleLife: false });
    a.idleLife = false;
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.42; e.height = 1.8; e.hp = e.maxHp = 9999;
    const D = e.data;
    Object.assign(D, { level: 0, vis: 0, fight: false, state: 'idle', t: 0, cd: 2.2, aggro: 'aidan', aggroT: -99, lastEsc: -99, shoutT: 5, grab: null, grabbed: false, atk: null, path: null, pathT: 0, patches: [], fists: [], extra: [], hit: false });
    for (const s of ['L', 'R']) { const sh = a.bones.extra && a.bones.extra[0] && a.bones.extra[0]['shoulder' + s]; if (sh) D.extra.push(sh); }
    // the splits: patches of shouting faces under the skin (level at which each opens)
    const fm = new THREE.MeshStandardMaterial({ map: facesTex(), alphaMap: seamTex(), transparent: true, roughness: 0.85, emissive: '#2a0808', emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    const P = (w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fm); m.userData.ownedGeo = true; m.renderOrder = 2; return m; };
    const A = a.anchors || {}, B = a.bones;
    const spots = [
      [A.chest || B.chest, [0.03, -0.03, 0.03], [0, 0, 0.2], 0.2, 0.26, 1],
      [B.neck, [0, 0.04, 0.07], [0, 0, 0], 0.12, 0.1, 1],
      [A.chest || B.chest, [-0.1, 0.1, 0.04], [0, 0.3, -0.3], 0.16, 0.2, 2],
      [B.upperArmL, [0.06, -0.12, 0.02], [0, Math.PI / 2, 0], 0.12, 0.18, 2],
      [B.upperArmR, [-0.06, -0.12, 0.02], [0, -Math.PI / 2, 0], 0.12, 0.18, 2],
      [A.back || B.chest, [0, 0, -0.02], [0, Math.PI, 0], 0.26, 0.3, 2],
      [B.spine, [0.08, 0.02, 0.12], [0, 0.25, 0], 0.16, 0.14, 3],
      [B.head, [0.07, 0.03, 0.09], [0, 0.6, 0], 0.08, 0.08, 3],
    ];
    for (const [par, pos, rot, w, h, lv] of spots) { if (!par) continue; const g = C4_attach(a, par, P(w, h), pos, rot); g.scale.multiplyScalar(0.001); D.patches.push({ g, lv, k: g.scale.x / 0.001 }); }
    // fists like engine blocks (level 3): the left hand and both extra hands (the right hand keeps holding up the phone)
    const fistM = new THREE.MeshStandardMaterial({ color: '#b86a52', roughness: 0.75 });
    const knuckM = new THREE.MeshStandardMaterial({ color: '#e6cfc2', roughness: 0.6 });
    const fist = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.2), fistM); b.userData.ownedGeo = true; g.add(b); for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.05), knuckM); n.userData.ownedGeo = true; n.position.set(-0.075 + i * 0.05, -0.03, 0.1); g.add(n); } return g; };
    const hands = [B.handL, ...(B.extra && B.extra[0] ? [B.extra[0].handL, B.extra[0].handR] : [])].filter(Boolean);
    for (const h of hands) { const g = C4_attach(a, h, fist(), [0, -0.06, 0.02]); const k = g.scale.x; g.scale.setScalar(k * 0.001); D.fists.push({ g, k }); }
    a.setAnim('idle', { blend: 0 });
    a.eyes('down');
    C4.esc = e;
  }
  // push it up a level (Chase's hit or Aidan's)
  function C4_escalate(e, who) {
    const D = e.data, t = now();
    D.aggro = who; D.aggroT = t;
    if (t - D.lastEsc < 0.7) return;
    D.lastEsc = t;
    const p = [e.pos.x, 1.6 * ESC.lv[D.level].s, e.pos.z];
    try { Snd.play('hit_heavy', { pos: p }); } catch (err) { /* audio */ }
    if (D.level < 3) {
      D.level++;
      D.growT = 1.3;
      try { Snd.play('murmur_reach', { pos: p, line: D.level % 3, vol: 1.0 }); Snd.play('thud', { pos: p, vol: 0.9 }); } catch (err) { /* audio */ }
      try { Enemies.say(ESC.lines[(D.level + 1) % ESC.lines.length], 'distort', 2.2); } catch (err) { /* voice */ }
      try { Cam.shake(0.25 + D.level * 0.12, 0.6); } catch (err) { /* cam */ }
    } else {
      try { Snd.play('murmur_reach', { pos: p, vol: 1.0 }); } catch (err) { /* audio */ }
    }
    if (D.state === 'windup' && D.atk !== 'slam') { D.state = 'recover'; D.t = 0; e.actor.finishGestures(); }
  }
  function C4_escVisual(e, dt) {
    const D = e.data, a = e.actor;
    const want = D.level;
    if (D.vis < want) D.vis = Math.min(want, D.vis + dt / 1.2);
    const lo = Math.floor(D.vis), hi = Math.min(3, lo + 1), f = D.vis - lo;
    const L0 = ESC.lv[lo], L1 = ESC.lv[hi];
    let s = lerp(L0.s, L1.s, f);
    if (D.growT > 0) { D.growT -= dt; s *= 1 + Math.sin(D.growT * 30) * 0.012 * D.growT; }
    a.root.scale.setScalar(s);
    e.radius = 0.42 * s; e.height = 1.8 * s; D.s = s;
    const tint = lerp(L0.tint, L1.tint, f);
    if (Math.abs((D.tintV ?? -1) - tint) > 0.01) { D.tintV = tint; a.setTint('#d8240e', tint, { skin: true }); }
    // the splits open, the extra arms tear free, the fists
    for (const p of D.patches) { const k = clamp(D.vis - (p.lv - 1), 0, 1); p.g.scale.setScalar(p.k * Math.max(0.001, k)); p.g.visible = k > 0.02; }
    const ea = clamp(D.vis - 1, 0, 1);
    for (const sh of D.extra) sh.scale.setScalar(Math.max(0.001, ea));
    const fk = clamp(D.vis - 2, 0, 1);
    for (const f2 of D.fists) { f2.g.scale.setScalar(f2.k * Math.max(0.001, fk)); f2.g.visible = fk > 0.02; }
  }
  function C4_escUpdate(e, dt, ai) {
    const D = e.data, a = e.actor;
    C4_escVisual(e, dt);
    if (!D.fight || !ai || D.grabbed) { if (!D.grab && D.state !== 'idle' && !D.fight) { D.state = 'idle'; a.setAnim('idle', { blend: 0.4 }); } return; }
    const lv = ESC.lv[D.level], t = now();
    // the grab: once, when Chase has hit it four times, Level 3 takes hold of him
    if (D.grab) { C4_grabTick(e, dt); return; }
    const F = C4.fight, chRaw = F && F.ch && F.ch.raw;
    if (D.level >= 3 && (S.chaseHits | 0) >= 4 && !flag('c4_chaseGrabbed') && chRaw && F.state !== 'grabbed' && D.state !== 'windup') { D.grab = { t: 0, phase: 'reach' }; D.state = 'grab'; a.finishGestures(); return; }
    // target: whoever hit it last (for a few seconds), otherwise Aidan
    let tp = Player.pos, tgt = 'aidan';
    if (D.aggro === 'chase' && t - D.aggroT < 5 && chRaw && F.state !== 'held' && F.state !== 'down') { tp = chRaw.root.position; tgt = 'chase'; }
    const d = fdist(e.pos, tp);
    const yawTo = Math.atan2(tp.x - e.pos.x, tp.z - e.pos.z);
    D.cd -= dt; D.shoutT -= dt;
    if (D.shoutT <= 0) {
      D.shoutT = 6 + Math.random() * 5;
      try { Snd.play('murmur_reach', { pos: [e.pos.x, 1.7 * (D.s || 1), e.pos.z], vol: 0.6 + D.level * 0.1 }); } catch (err) { /* audio */ }
      if (Math.random() < 0.5) { try { Enemies.say(ESC.lines[Math.floor(Math.random() * ESC.lines.length)], 'distort', 2.0); } catch (err) { /* voice */ } }
    }
    const turn = (rate) => { e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, yawTo), -rate * dt, rate * dt); };
    const pick = () => {
      if (D.level >= 3) return d <= ESC.atk.slam.reach ? 'slam' : d <= ESC.atk.roar.reach && Math.random() < 0.35 ? 'roar' : null;
      if (D.level >= 2) return d <= ESC.atk.sweep.reach ? 'sweep' : d <= ESC.atk.roar.reach && d > 3.2 && Math.random() < 0.3 ? 'roar' : null;
      return d <= ESC.atk.jab.reach * (D.s || 1) ? 'jab' : null;
    };
    switch (D.state) {
      case 'idle': case 'move': {
        turn(2.4);
        const at = D.cd <= 0 ? pick() : null;
        if (at) { D.state = 'windup'; D.atk = at; D.t = 0; D.tgt = tgt; a.setAnim('idle', { blend: 0.25 });
          if (at === 'slam') q(a.gesture('hands_up', { dur: ESC.atk.slam.wind + 0.2 }));
          else if (at === 'roar') { q(a.gesture('raise_phone', { dur: 0.9 })); try { Snd.play('murmur_reach', { pos: [e.pos.x, 2, e.pos.z], vol: 1.0, dur: 1.4 }); } catch (err) { /* audio */ } }
          else q(a.gesture('reach', { hand: 'L', target: Player.actor, dur: ESC.atk[at].wind + 0.3 }));
          try { Snd.play('whoosh', { pos: [e.pos.x, 1.5, e.pos.z], vol: 0.5 }); } catch (err) { /* audio */ }
          break; }
        const stopAt = (tgt === 'chase' ? 1.2 : 1.1) * (D.s || 1);
        if (d > stopAt) {
          D.pathT -= dt;
          if (D.pathT <= 0) { D.pathT = 0.6; D.path = null; try { const pth = Enemies.path(e.pos.x, e.pos.z, tp.x, tp.z); if (pth && pth.length > 1) D.path = pth; } catch (err) { /* nav */ } }
          let gx = tp.x, gz = tp.z;
          if (D.path) { while (D.path.length > 1 && Math.hypot(D.path[0][0] - e.pos.x, D.path[0][1] - e.pos.z) < 0.5) D.path.shift(); gx = D.path[0][0]; gz = D.path[0][1]; }
          const mdx = gx - e.pos.x, mdz = gz - e.pos.z, ml = Math.hypot(mdx, mdz) || 1, sp = lv.speed * dt;
          const r = World.move(e.pos, (mdx / ml) * sp, (mdz / ml) * sp, Math.min(0.55, e.radius), { ignore: (c) => !!c.enemy });
          e.pos.set(r.x, r.y, r.z);
          if (a.anim !== 'walk') a.setAnim('walk', { blend: 0.3 });
          D.state = 'move';
        } else if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.3 });
        break;
      }
      case 'windup': {
        turn(D.atk === 'slam' ? 1.2 : 2.0);
        D.t += dt;
        const A = ESC.atk[D.atk];
        if (D.t >= A.wind) C4_escStrike(e, D.atk, tgt, tp);
        break;
      }
      case 'recover': D.t += dt; if (D.t >= (ESC.atk[D.atk] || { rec: 0.8 }).rec) { D.state = 'move'; D.cd = lv.cd; } break;
      default: D.state = 'move';
    }
  }
  function C4_escStrike(e, atk, tgt, tp) {
    const D = e.data, A = ESC.atk[atk], s = D.s || 1, a = e.actor;
    D.state = 'recover'; D.t = 0;
    const P = Player.pos, fw = [Math.sin(e.yaw), Math.cos(e.yaw)];
    const inArc = (px, pz, reach, arc) => { const dx = px - e.pos.x, dz = pz - e.pos.z, d = Math.hypot(dx, dz); if (d > reach) return false; const ang = Math.abs(U.angleDiff(e.yaw, Math.atan2(dx, dz))) / D2R; return d < 0.9 || ang <= arc / 2; };
    let hitA = false, hitC = false;
    const F = C4.fight, chRaw = F && F.ch && F.ch.raw;
    if (atk === 'slam') {
      q(a.gesture('swing', { hand: 'L', dur: 0.45 }));
      const ix = e.pos.x + fw[0] * 1.5 * s * 0.6, iz = e.pos.z + fw[1] * 1.5 * s * 0.6;
      try { Snd.play('slam', { pos: [ix, 0.2, iz] }); Snd.play('thud', { pos: [ix, 0.2, iz], vol: 1 }); Cam.shake(0.6, 0.7); } catch (err) { /* fx */ }
      hitA = Math.hypot(P.x - ix, P.z - iz) <= A.radius;
      if (chRaw) hitC = Math.hypot(chRaw.root.position.x - ix, chRaw.root.position.z - iz) <= A.radius;
    } else {
      q(a.gesture('swing', { hand: 'L', dur: 0.5 }));
      try { Snd.play('swing', { pos: [e.pos.x, 1.4, e.pos.z], heavy: true }); } catch (err) { /* audio */ }
      const reach = atk === 'jab' ? A.reach * s : A.reach;
      hitA = inArc(P.x, P.z, reach, A.arc);
      if (chRaw) hitC = inArc(chRaw.root.position.x, chRaw.root.position.z, reach, A.arc);
      if (atk === 'roar') { try { Cam.shake(0.3, 0.8); } catch (err) { /* cam */ } }
    }
    if (hitA && !Player.dead) Player.damage(A.dmg, e, { push: A.push || 1.4, from: e.pos, knock: !!A.knock, force: true });
    if (hitC && F) C4_chaseKnocked(F, e);
  }
  // Level 3 takes hold of Chase: lifts him, shakes him, throws him against the counter (he's hurt in the next scene)
  function C4_grabTick(e, dt) {
    const D = e.data, G0 = D.grab, F = C4.fight, ch = F && F.ch && F.ch.raw;
    if (!ch) { D.grab = null; D.state = 'move'; return; }
    const cp = ch.root.position, a = e.actor;
    G0.t += dt;
    const yawTo = Math.atan2(cp.x - e.pos.x, cp.z - e.pos.z);
    e.yaw = e.yaw + clamp(U.angleDiff(e.yaw, yawTo), -3 * dt, 3 * dt);
    if (G0.phase === 'reach') {
      const d = fdist(e.pos, cp);
      if (d > 2.2 && G0.t < 3) { const sp = 1.4 * dt, r = World.move(e.pos, Math.sin(yawTo) * sp, Math.cos(yawTo) * sp, 0.55, { ignore: (c) => !!c.enemy }); e.pos.set(r.x, r.y, r.z); if (a.anim !== 'walk') a.setAnim('walk'); return; }
      G0.phase = 'hold'; G0.t = 0; G0.from = cp.clone();
      F.state = 'grabbed'; F.held = false;
      a.setAnim('idle'); q(a.gesture('reach', { hand: 'L', target: ch, dur: 1.6, hold: true }));
      ch.setAnim('struggle', { blend: 0.2 }); ch.expr('pain');
      try { Snd.play('grab', { pos: [cp.x, 1.2, cp.z] }); Snd.play('murmur_reach', { pos: [e.pos.x, 3, e.pos.z], vol: 1 }); } catch (err) { /* audio */ }
      S.flags.c4_chaseGrabbed = true;
    } else if (G0.phase === 'hold') {
      const k = Math.min(1, G0.t / 0.5);
      cp.y = G0.from.y + k * 0.7 + Math.sin(G0.t * 18) * 0.05 * k;
      if (G0.t >= 1.6) {
        G0.phase = 'throw'; G0.t = 0;
        G0.to = new THREE.Vector3(OS.counter[0] - 1.5, 0, OS.counter[1] + 1.2);
        try { Snd.play('whoosh', { pos: [cp.x, 1.4, cp.z] }); } catch (err) { /* audio */ }
        a.finishGestures(); q(a.gesture('swing', { hand: 'L', dur: 0.5 }));
      }
    } else if (G0.phase === 'throw') {
      const k = Math.min(1, G0.t / 0.45);
      const fx = lerp(G0.from.x, G0.to.x, k), fz = lerp(G0.from.z, G0.to.z, k);
      const r = World.move(cp, fx - cp.x, fz - cp.z, 0.3, {});
      cp.set(r.x, (G0.from.y + 0.7) * (1 - k) + Math.sin(k * Math.PI) * 0.4, r.z);
      if (k >= 1) {
        cp.y = World.heightAt(cp.x, cp.z) ?? 0;
        try { Snd.play('thud', { pos: [cp.x, 0.3, cp.z], vol: 1 }); Snd.play('hit_heavy', { pos: [cp.x, 0.6, cp.z] }); Cam.shake(0.4, 0.5); } catch (err) { /* fx */ }
        ch.setAnim('sit_floor', { blend: 0.2 }); ch.expr('pain');
        F.state = 'down'; F.downT = 3.2; F.hurt = true;
        D.grab = null; D.state = 'recover'; D.atk = 'slam'; D.t = 0; D.aggro = 'aidan';
      }
    }
  }
  Enemies.defineType('c4_escalation', {
    hp: 9999, radius: 0.42, height: 1.8, downs: false, stompable: false, lockable: true, tell: 'pulse', steps: { stride: 0.9, vol: 0.8, heavy: true },
    threat: (e) => !!e.data.fight,
    create: (e, def) => C4_escCreate(e, def),
    hitbox: (e) => { const s = e.data.s || 1; return [{ x: e.pos.x, z: e.pos.z, r: 0.5 * s, y0: 0, y1: 1.8 * s }]; },
    stun: () => false,
    knockdown: () => false,
    onHit(e) { if (e.data.fight) C4_escalate(e, 'aidan'); return false; },
    update: (e, dt, ai) => C4_escUpdate(e, dt, ai),
    post(e) {
      // at Level 3 it hunches under the ceiling
      const D = e.data, a = e.actor, k = clamp((D.vis || 0) - 2, 0, 1);
      if (k > 0 && a.bones.spine) { a.bones.spine.rotation.x += 0.28 * k; a.bones.neck.rotation.x -= 0.2 * k; }
    },
    remove: (e) => { if (C4.esc === e) C4.esc = null; },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Chase in the fight: he goes at it and swings every 4 s — unless Aidan is within 2 m holding E ("Hold him back"),
  // which pulls him toward Aidan. Every hit that lands counts in S.chaseHits (and pushes it up a level).
  // ---------------------------------------------------------------------------------------------------------------
  function C4_fightStart(G, e) {
    const ch = G.actor('chase', 'chase');
    if (ch.raw) { ch.raw.idleLife = false; ch.hold('R', 'bar', { pose: 'bar_ready' }); ch.expr('angry'); }
    C4.fight = { e, ch, state: 'attack', held: false, relT: 0, swingT: 2.5, downT: 0, hurt: false, path: null, pathT: 0, said: 0, promptT: 0 };
    e.data.fight = true; e.data.level = Math.max(1, e.data.level); e.data.cd = 2.0; e.data.state = 'move';
    return C4.fight;
  }
  function C4_fightEnd() {
    const F = C4.fight;
    if (F && F.e) F.e.data.fight = false;
    try { UI.holdPrompt(null); } catch (err) { /* ui */ }
    C4.fight = null;
  }
  function C4_chaseKnocked(F, e) {
    if (F.state === 'grabbed' || F.state === 'down') return;
    const raw = F.ch.raw, cp = raw.root.position;
    const ax = cp.x - e.pos.x, az = cp.z - e.pos.z, l = Math.hypot(ax, az) || 1;
    const r = World.move(cp, (ax / l) * 1.1, (az / l) * 1.1, 0.3, {});
    cp.set(r.x, r.y, r.z);
    raw.setAnim('stagger', { blend: 0.15 });
    F.state = 'down'; F.downT = 1.0;
    try { Snd.play('hit', { pos: [cp.x, 1.2, cp.z] }); } catch (err) { /* audio */ }
  }
  const CHASE_HELD = ['Let me go, mate—', 'He\'s coming over! He\'s coming over—', 'Aidan—'];
  function C4_chaseTick(G, dt) {
    const F = C4.fight;
    if (!F || !F.ch || !F.ch.raw) return;
    if (busy() || Player.dead) return;
    const raw = F.ch.raw, cp = raw.root.position, e = F.e, P = Player.pos;
    const dA = fdist(cp, P);
    // hold him back
    // (physically held: the E press that started the hold may also have used the duress button or dismissed the
    // objective message — that press is consumed, but the key is still down)
    const holding = !!(Input.held ? Input.held('interact') : Input.down && Input.down('interact'));
    const canHold = F.state !== 'grabbed' && F.state !== 'down';
    if (canHold && holding && dA < (F.held ? 2.7 : 2.0)) { if (!F.held && F.said < CHASE_HELD.length && Math.random() < 0.6) { const l = CHASE_HELD[F.said++]; G.bg(async (G2) => { await G2.say('CHASE', l); }); } F.held = true; F.relT = 0; }
    else if (F.held) { F.relT += dt; if (F.relT > 0.8 || dA > 3.4) F.held = false; }
    try { UI.holdPrompt(dA < 2.3 && canHold ? 'Hold {interact}: Hold him back' : null, F.held ? 1 : 0); } catch (err) { /* ui */ }
    // (held, he slips past the Escalation's body: its dynamic collider stands between the counter and the back office,
    // and walking straight into it left him stuck behind it — out of Aidan's reach — while Aidan walked on to the door)
    const mo = F.held ? { ignore: (c) => !!c.dynamic } : {};
    const moveTo = (x, z, sp, stop) => {
      const d = Math.hypot(x - cp.x, z - cp.z);
      if (d <= stop) return false;
      F.pathT -= dt;
      if (F.pathT <= 0) { F.pathT = 0.5; F.path = null; try { const p = Enemies.path(cp.x, cp.z, x, z); if (p && p.length > 1) F.path = p; } catch (err) { /* nav */ } }
      let gx = x, gz = z;
      if (F.path) { while (F.path.length > 1 && Math.hypot(F.path[0][0] - cp.x, F.path[0][1] - cp.z) < 0.4) F.path.shift(); gx = F.path[0][0]; gz = F.path[0][1]; }
      const dx = gx - cp.x, dz = gz - cp.z, l = Math.hypot(dx, dz) || 1, st = Math.min(l, sp * dt);
      const r = World.move(cp, (dx / l) * st, (dz / l) * st, 0.3, mo);
      cp.set(r.x, r.y, r.z);
      raw.root.rotation.y = raw.root.rotation.y + clamp(U.angleDiff(raw.root.rotation.y, Math.atan2(dx, dz)), -6 * dt, 6 * dt);
      return true;
    };
    const face = (x, z) => { raw.root.rotation.y += clamp(U.angleDiff(raw.root.rotation.y, Math.atan2(x - cp.x, z - cp.z)), -5 * dt, 5 * dt); };
    if (F.state === 'grabbed') return;
    if (F.state === 'down') { F.downT -= dt; if (F.downT <= 0) { F.state = 'attack'; raw.setAnim(F.hurt ? 'hurt' : 'idle', { blend: 0.4 }); F.swingT = Math.max(F.swingT, 1.5); } return; }
    if (F.held) {
      F.state = 'held';
      const sp = F.hurt ? 1.3 : 1.7;
      const moving = moveTo(P.x, P.z, sp, 1.0);
      if (!moving) face(e.pos.x, e.pos.z);
      const an = moving ? 'walk' : (F.hurt ? 'hurt' : 'idle');
      if (raw.anim !== an) raw.setAnim(an, { blend: 0.3 });
      F.swingT = Math.max(F.swingT, 1.2);
      return;
    }
    F.state = 'attack';
    const reach = 1.25 + (e.radius || 0.42) * 0.8;
    const d = fdist(cp, e.pos);
    const moving = moveTo(e.pos.x, e.pos.z, F.hurt ? 1.2 : 1.6, reach);
    if (!moving) face(e.pos.x, e.pos.z);
    const an = moving ? 'walk' : (F.hurt ? 'hurt' : 'idle');
    if (raw.anim !== an && !F.swinging) raw.setAnim(an, { blend: 0.3 });
    F.swingT -= dt;
    if (F.swingT <= 0 && d <= reach + 0.35 && !F.swinging) {
      F.swingT = 4.0; F.swinging = true;
      raw.gesture('swing', { dur: 0.8, onStrike: () => {
        if (!C4.fight || C4.fight !== F) return;
        if (F.state === 'attack' && fdist(raw.root.position, e.pos) <= reach + 0.6) { S.chaseHits = (S.chaseHits | 0) + 1; C4_escalate(e, 'chase'); }
        else { try { Snd.play('swing', { pos: [cp.x, 1.3, cp.z] }); } catch (err) { /* audio */ } }
      } }).then(() => { F.swinging = false; }, () => { F.swinging = false; });
    }
  }
  // the duress button: the maglock on the back office releases, the red lamp over the door lights
  async function C4_duress(G) {
    if (done('c4:duress')) { await G.think('It\'s pressed. [beat] The back office is open.'); return; }
    S.done['c4:duress'] = true;
    const b = G.obj('c4_duress'); if (b && b.userData.press) b.userData.press();
    G.sfx('click', { pos: [OS.duress[0], 0.75, OS.duress[1]] });
    G.sfx('buzzer', { pos: [OS.office[0], 2.4, OS.office[1]], vol: 0.8 });
    const lamp = G.obj('c4_alarmlamp'); if (lamp && lamp.userData.setOn) lamp.userData.setOn(true);
    const red = G.light('c4os:red'); if (red) red.on(true);
    const led = G.light('c4_oldstore:office:led'); if (led && led.set) led.set({ color: '#2aff5a' });
    G.door('c4_oldstore:office').unlock();
    G.sfx('maglock', { pos: [OS.office[0], 2.0, OS.office[1]] });
    note(G, 'The back office. Get Chase in there.', 'c4_goal');
    G.bg(async (G2) => { await G2.think('The back office. [beat] Get him in there.'); });
  }
  // the back office door: locked until the duress button; then both of them, or not at all
  async function C4_officeDoor(G) {
    if (flag('c4_bossDone')) return;
    if (!done('c4:duress')) {
      G.sfx('door_locked', { pos: [OS.office[0], 1.0, OS.office[1]] });
      if (G.once('c4:officeLocked')) await G.think('Maglocked. [beat] The duress button. There\'s always one under the counter.');
      else await G.msg('It\'s locked.');
      return;
    }
    const F = C4.fight, ch = F && F.ch && F.ch.raw;
    const near = ch && fdist(ch.root.position, Player.pos) < 2.9 && F.state !== 'grabbed';
    if (F && !near) { await G.think('Not without Chase.'); return; }
    G.set('c4_bossDone', true);
  }
  defineBoss('escalation', {
    async run(G) {
      const e = C4.esc || G.enemy('c4_oldstore:esc');
      if (!e) return 'none';
      C4_fightStart(G, e);
      G.control(true);
      note(G, 'Get Chase to the back office.', 'c4_goal');
      G.bg(async (G2) => { await G2.msg('Get Chase to the back office.', 4); });
      G.prompt('Hold {interact} next to Chase: hold him back.', { id: 'c4_holdback' });
      try {
        await G.loop((dt) => { C4_chaseTick(G, dt); return flag('c4_bossDone'); });
      } finally { C4_fightEnd(); }
      return 'won';
    },
  });

  // =================================================================================================================
  // CUTSCENE 4-1 "A Funny Story" (c4_floor, Chase's cubicle, row 6 west)
  // =================================================================================================================
  // actor-relative framing for the close shots: the head anchor's world position, the body's facing, and a point
  // f metres in front of the head, l metres to its left, u up (negative l = to its right)
  const C4_headAt = (X) => {
    const r = X && X.raw, a = r && r.anchors && r.anchors.head;
    if (a) { a.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(a.matrixWorld); }
    const p = X ? X.pos : { x: 0, z: 0 };
    return new THREE.Vector3(p.x, 1.6, p.z);
  };
  const C4_fwd = (X) => { const y = (X ? X.yaw : 0) * Math.PI / 180; return [Math.sin(y), Math.cos(y)]; };
  const C4_rel = (X, f, l, u = 0, H = C4_headAt(X)) => { const [fx, fz] = C4_fwd(X); return [H.x + fx * f + fz * l, H.y + u, H.z + fz * f - fx * l]; };

  defineCutscene('4-1', async (G) => {
    const A = G.aidan, C = G.actor('chase', 'chase');
    const [cx, cz] = CHASE_CUB.chair;
    const fill = G.light('c4fl:csfill');
    if (A.raw) A.raw.idleLife = false;
    if (C.raw) { C.raw.idleLife = false; try { C.raw.wear('headset', true); C.raw.setEarbuds(true); } catch (e) { /* rig */ } }
    C.place(cx, cz - 0.05, 180); C.pose('sit', { seat: 0.47 }); C.hold('R', null);
    C.look(null); C.eyes('down'); C.expr('flat');
    const lap = G.obj('c4:lapbar');
    // 1. SHOT — high over the cubicle walls. Rows of dark cubicles, one lit by a desk lamp. Chase in it with a headset
    //    on, facing a dead monitor, the bar across his knees.
    await G.fade(1, 0.25);
    A.place(12.4, 19.25, -90); A.pose('idle');
    G.cam({ pos: [11.8, 3.85, 24.2], target: [6.2, 0.7, 17.7], fov: 42, to: { pos: [11.0, 3.8, 23.4], target: [6.1, 0.75, 17.8], fov: 38 }, dur: 9 });
    await G.fade(0, 0.8);
    const walk = q(A.walkTo([[9.8, 19.25], [7.35, 19.15]], { speed: 0.75 }));
    await G.wait(4.4);
    // 2. SHOT — low, behind Chase's chair, as Aidan approaches
    G.cam({ pos: [5.05, 0.85, 18.75], target: [8.8, 1.3, 19.4], fov: 50 });
    await walk;
    await A.turn(C, 0.5);
    A.look(C);
    await G.wait(0.7);
    await G.say('AIDAN', 'Chase?');
    await G.wait(0.6);
    // CHASE (not turning)
    await G.say('CHASE', 'They keep ringing. [beat] Every phone in here. I picked one up.');
    q(C.gesture('laugh'));                                                   // (a small laugh)
    await G.wait(0.8);
    await G.say('CHASE', 'Bloke yelling. Thought it was him.');
    await G.say('AIDAN', 'Who?');
    // (he slides the headset off; it goes on the desk)
    if (C.raw) { try { C.raw.wear('headset', false); } catch (e) { /* rig */ } }
    if (fill) fill.on(true);
    // 3. SHOT — close side profile (his left: the scarred brow toward the lamp). Chase takes one earbud out. The scar
    //    catches the lamplight.
    {
      const p0 = C4_rel(C, 0.6, 0.95, -0.2), p1 = C4_rel(C, 0.55, 0.86, -0.2), t0 = C4_rel(C, 0.24, 0, -0.15);
      p0[0] = Math.max(p0[0], cx - 0.8); p1[0] = Math.max(p1[0], cx - 0.8);
      G.cam({ pos: p0, target: t0, fov: 34, to: { pos: p1, target: t0, fov: 31 }, dur: 30 });
    }
    await G.wait(0.6);
    await C.gesture('earbud_out');
    await G.wait(0.5);
    await G.say('CHASE', 'You know how I said it was footy?');
    // He touches the eyebrow (the left one).
    await C.gesture('reach', { hand: 'L', target: C4_rel(C, 0.11, 0.035, -0.02), dur: 1.3 });
    await G.say('CHASE', 'Wasn\'t footy.');
    await G.beat();
    C.eyes('down');
    await G.say('CHASE', 'Late shift. Thursday. Guy comes in ten minutes before close. Wants a new SIM, no ID. I say I can\'t do it without ID. He says do it anyway. I say, mate, I can\'t. [beat] He comes over the counter. Just— over it. Like it wasn\'t there. [beat] Shoves me into the back wall. Rips a demo phone off the table and throws it at my head.');
    // 4. SHOT — Aidan's face
    const ap = A.pos;
    G.cam({ pos: [ap.x - 0.9, 1.52, ap.z - 0.85], target: [ap.x, 1.55, ap.z], fov: 30, to: { pos: [ap.x - 0.82, 1.52, ap.z - 0.78], fov: 28 }, dur: 20 });
    if (A.raw) { A.raw.expr('sad'); A.raw.eyes('at', C.raw); }
    await G.wait(0.6);
    await G.say('CHASE', 'Leader was on break. I was on my own. [beat] I went back in the next day. Told everyone it was funny.');
    // 5. SHOT — Chase finally turns to Aidan. His eyes are wet. The grin is trying to hold. (over Aidan's right
    //    shoulder, high enough to clear it)
    {
      const hc = C4_headAt(C);
      const p0 = C4_rel(A, -0.42, -0.36, 0.02), p1 = C4_rel(A, -0.36, -0.33, 0.0);
      G.cam({ pos: p0, target: [hc.x, hc.y - 0.12, hc.z], fov: 32, to: { pos: p1, target: [hc.x, hc.y - 0.1, hc.z], fov: 29 }, dur: 30 });
    }
    await C.turn(A, 1.2);
    C.look(A); C.eyes('at', A); C.expr('grin');
    if (A.raw) A.raw.eyes('at', C.raw);
    await G.wait(0.7);
    await G.say('CHASE', 'It\'s a funny story, right? [beat] It\'s a funny story.');
    await G.say('AIDAN', '...It\'s not funny, Chase.');
    // (the grin collapses; long beat)
    C.expr('cry'); C.eyes('down');
    await G.longBeat();
    await G.say('CHASE', 'Nah. [beat] Nah. It\'s not.');
    C.eyes('away', A);
    await G.say('CHASE', 'I keep thinking. If I\'d just hit him first.');
    await G.say('AIDAN', 'Then you\'d be the one who—');
    // (sharp) … (softer)
    C.expr('angry'); C.eyes('at', A);
    await G.say('CHASE', 'Don\'t.');
    await G.beat();
    C.expr('sad'); C.eyes('down');
    await G.say('CHASE', 'Don\'t.');
    await G.wait(1.0);
    // 6. SHOT — Chase stands and puts the earbud back in (from his front-right, down the aisle; Aidan off frame right)
    {
      const [fx, fz] = C4_fwd(C), dx = (fx - fz) / Math.SQRT2, dz = (fz + fx) / Math.SQRT2, cp = C.pos;
      const px = cp.x + dx * 1.75, pz = Math.min(cp.z + dz * 1.75, 19.9);
      G.cam({ pos: [px, 1.55, pz], target: [cp.x + fx * 0.1, 1.45, cp.z + fz * 0.1], fov: 42, to: { pos: [px, 1.62, pz], target: [cp.x + fx * 0.1, 1.62, cp.z + fz * 0.1], fov: 40 }, dur: 3.2 });
    }
    if (lap) lap.visible = false;
    C.hold('R', 'bar');
    await C.gesture('stand_up', { to: 'idle' });
    C.expr('flat');
    await C.gesture('earbud_in');
    C.look(A);
    await G.say('CHASE', 'Records room\'s down the back. Heard you and the old fella talking about it. [beat] I\'ll watch the lobby.');
    C.look(null);
    // he goes: down the aisle to the east, past Aidan (from the aisle's west end)
    G.cam({ pos: [2.6, 1.5, 19.3], target: [8.6, 1.35, 19.25], fov: 44, to: { pos: [2.6, 1.5, 19.3], target: [10.5, 1.4, 19.3], fov: 44 }, dur: 4 });
    const out = q(C.walkTo([[cx + 0.3, cz + 1.38], [8.6, 19.68], [11.5, 19.45], [17.2, 19.4]], { speed: 1.35 }));
    await G.wait(1.2);
    A.look(C);
    await G.wait(2.4);
    void out;
    // state (plain statements: a skip lands here the same way)
    if (fill) fill.on(false);
    if (lap) lap.visible = false;
    C.remove();
    A.pose('idle');
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); A.raw.lookAt(null); }
    G.set('c4_metChase', true);
    note(G, 'The records room — the back of the floor, north-west. The call logs.', 'c4_goal');
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // IN-ENGINE 4-4 "The call logs" (c4_records): the binder open under the lamp, the first page (Luke's three calls
  // highlighted, CALLBACK ASSIGNED: AIDAN in view); Read on (F+3 + the thought) / Tear it up (A+3; the pieces hang in
  // the air). Either way the siren, and the Outage takes the building.
  // =================================================================================================================
  defineCutscene('4-4', async (G) => {
    const A = G.aidan;
    const [tx, tz] = RC.table;
    if (A.raw) A.raw.idleLife = false;
    // 1. the records room: he goes to the table under the lamp
    await A.walkTo(tx + 0.1, tz + 0.72, { speed: 0.9 });
    await A.turn(180, 0.4);
    A.look([tx + 0.15, 0.78, tz - 0.02]);
    if (A.raw) A.raw.eyes('down');
    // 2. the first page, close: Luke's three calls highlighted, CALLBACK ASSIGNED: AIDAN
    G.cam({ pos: [tx + 0.16, 1.55, tz + 0.2], target: [tx + 0.155, 0.78, tz - 0.02], fov: 30, to: { pos: [tx + 0.156, 1.3, tz + 0.1], fov: 29 }, dur: 9 });
    G.sfx('paper', { vol: 0.6 });
    await G.wait(2.6);
    //    DOC Call Logs opens by itself on the first page: Luke's three calls highlighted, CALLBACK ASSIGNED: AIDAN in view
    await G.doc('call_logs', { id: 'c4_records:logs', page: 0, highlight: ['Caller: Luke', 'CALLBACK ASSIGNED: AIDAN'] });
    await G.wait(0.4);
    // 3. the choice — low across the table, up at his face bent over the binder (the page's print would fight the
    //    choice's text); the lamp's light comes back up off the white pages onto his face
    const bounce = G.addLight('point', { pos: [tx + 0.12, 0.95, tz + 0.25], color: '#ffe2b0', intensity: 1.4, distance: 1.7 });
    //    (him in the left third: the choice sits over the dark wall beside him)
    G.cam({ pos: [tx - 0.6, 1.0, tz - 1.15], target: [tx + 0.72, 1.4, tz + 0.72], fov: 38, to: { pos: [tx - 0.55, 1.02, tz - 1.05], fov: 36 }, dur: 12 });
    if (A.raw) A.raw.expr('scared', { k: 0.5 });
    await G.wait(0.8);
    const i = await G.choice(['Read on', 'Tear it up']);
    if (i === 0) {
      G.set('c4_logs', 'read');
      G.track('F', 3, 'Ch 4: read the call logs');
      //  → the full document (the status history to the end: Follow up tomorrow, three times)
      await G.doc('call_logs', { id: 'c4_records:logs' });
      G.cam({ pos: [tx - 0.6, 1.0, tz - 1.15], target: [tx + 0.1, 1.5, tz + 0.72], fov: 32, to: { pos: [tx - 0.5, 1.02, tz - 1.0], fov: 29 }, dur: 14 });
      if (A.raw) A.raw.expr('sad');
      await G.think('\'Assigned: Aidan.\' [beat] They assign those all over the place. That\'s not— [beat] I\'d remember.');
    } else {
      G.set('c4_logs', 'torn');
      G.track('A', 3, 'Ch 4: tore up the call logs');
      G.cam({ pos: [tx - 1.5, 1.7, tz + 1.7], target: [tx, 1.1, tz], fov: 44 });
      await A.gesture('reach', { hand: 'L', target: [tx + 0.15, 0.8, tz] });
      G.sfx('paper_tear', { pos: [tx, 1.0, tz] });
      await G.wait(0.3);
      G.sfx('paper_tear', { pos: [tx, 1.0, tz] });
      const pg = G.obj('c4_logpage'); if (pg) pg.visible = false;
      // the pieces hang in the air instead of falling
      const pc = C4_pieces();
      try { World.build.group.add(pc.group); World.build.animated.push(pc.tick); } catch (e) { /* room */ }
      for (const it of pc.items) { it.m.position.set(tx + 0.1, 0.9, tz); }
      let t = 0;
      await G.loop((dt) => { t += dt; const k = Math.min(1, t / 1.6); for (const it of pc.items) it.m.position.lerpVectors(new THREE.Vector3(tx + 0.1, 0.9, tz), it.base, U.ease.out(k)); return k >= 1; });
      for (const it of pc.items) it.m.position.copy(it.base);
      await G.wait(1.4);
    }
    if (bounce && bounce.free) bounce.free();
    // 4. either way: the siren, and the Outage takes the building (he keeps control)
    if (A.raw) { A.raw.idleLife = true; A.raw.eyes('ahead'); A.raw.expr('scared'); }
    A.look(null);
    G.set('c4_outage', true);
    G.camRelease();
    G.control(true);
    await G.outage(true);
    if (A.raw) A.raw.expr('neutral');
    // the printer on the trolley chatters: the receipt map
    G.sfx('printer', { pos: [8.55, 1.0, 6.25], vol: 0.9 });
    note(G, 'Get back to the lobby. Chase is out there on his own.', 'c4_goal');
    try { G.autosave(); } catch (e) { /* save */ }
    await G.wait(0.8);
    await G.think('The printer. [beat] Something\'s printing.');
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // CUTSCENE 4-2 "Hit 'Em First" (c4_oldstore) → BOSS: the Escalation
  // =================================================================================================================
  defineCutscene('4-2', async (G) => {
    const A = G.aidan, C = G.actor('chase', 'chase');
    const e = C4.esc || G.enemy('c4_oldstore:esc');
    const man = e && e.actor;
    const [kx, kz] = OS.counter;
    if (A.raw) A.raw.idleLife = false;
    if (C.raw) { C.raw.idleLife = false; C.hold('R', 'bar', { pose: 'bar_ready' }); }
    // (Chase close behind the counter, the man right up against its front: the bar reaches across it)
    C.place(kx, 2.85, 0); C.pose('idle'); C.expr('angry'); C.look(null);
    if (e) { e.pos.set(kx, 0, 4.25); e.yaw = 0; e.data.level = 0; e.data.vis = 0; }
    if (man) { man.setAnim('idle', { blend: 0 }); man.expr('tired'); man.eyes('down'); }
    // 1. SHOT — wide from the side door: the store at 8:50 pm. Chase behind the counter with the bar raised, alone.
    try { if (e) Enemies.visible(e, false); } catch (err) { /* enemies */ }
    A.place(0.55, OS.side[1] + 0.1, 90); A.pose('idle');
    G.cam({ pos: [1.2, 1.85, 10.9], target: [13.6, 1.3, 3.2], fov: 46, to: { pos: [1.5, 1.85, 10.6], fov: 44 }, dur: 10 });
    const hold = G.sfx('hold', { loop: true, speed: 0.55, vol: 0.25 });
    await G.wait(3.6);
    // 2. SHOT — over Chase's shoulder: a man at the counter with his back to us, holding up a phone
    try { if (e) Enemies.visible(e, true); } catch (err) { /* enemies */ }
    G.cam({ pos: [kx + 0.55, 1.8, 1.8], target: [kx - 0.1, 1.45, 5.2], fov: 42, to: { pos: [kx + 0.5, 1.78, 2.0], fov: 40 }, dur: 16 });
    await G.wait(1.4);
    // MAN (normal voice, tired)
    await G.say('MAN', 'I just need a new SIM. [beat] I don\'t have ID. I just need it.');
    // CHASE (shaking)
    q(C.gesture('tremor', { amount: 1 }));
    await G.say('CHASE', 'Can\'t do it without ID, mate.');
    // MAN (his voice begins to double)
    G.sfx('murmur_reach', { pos: [kx, 1.7, 4.25], vol: 0.35, line: 'waiting' });
    await G.say('MAN', 'Do it anyway.');
    // 3. SHOT — Aidan in the side doorway
    G.cam({ pos: [4.6, 1.5, 8.1], target: [0.5, 1.35, OS.side[1]], fov: 42 });
    if (A.raw) A.raw.expr('scared');
    A.look(C);
    await G.wait(0.4);
    await G.say('AIDAN', 'Chase, don\'t—');
    C.expr('grin');
    await G.say('CHASE', 'Hit \'em first, right? [beat] Hit \'em first.');
    // 4. SHOT — low. Chase swings. The bar connects. The man's skin floods red and swells. He turns: more mouths under the first.
    //    (from the floor off the counter's east end: Chase side-on behind it; the man turns through the lens)
    G.cam({ pos: [16.5, 0.72, 6.3], target: [kx + 0.1, 1.55, 3.7], fov: 48, to: { pos: [16.75, 0.66, 6.5], target: [kx + 0.1, 1.95, 3.9], fov: 54 }, dur: 5 });
    if (hold && hold.stop) hold.stop(0.3);
    C.expr('angry');
    await C.gesture('swing', { dur: 0.8, onStrike: () => { try { Snd.play('hit_heavy', { pos: [kx, 1.5, 4.2] }); } catch (err) { /* audio */ } } });
    if (e) { e.data.level = 1; e.data.growT = 1.3; }
    G.shake(0.35, 0.5);
    G.sfx('murmur_reach', { pos: [kx, 1.8, 4.25], vol: 1.0 });
    await G.wait(0.9);
    if (e) { let t = 0; await G.loop((dt) => { t += dt; e.yaw = Math.PI * U.ease.inOut(Math.min(1, t / 1.4)); return t >= 1.4; }); e.yaw = Math.PI; }
    if (man) { man.expr('shout'); man.eyes('closed'); }
    await G.wait(1.3);
    // state (plain statements)
    if (e) { e.data.level = Math.max(1, e.data.level); e.yaw = Math.PI; }
    Enemies.visible && e && Enemies.visible(e, true);
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); }
    A.look(null);
    G.camRelease();
    try { G.autosave(); } catch (err) { /* save */ }
    // 5. BOSS: the Escalation. Objective text: "Get Chase to the back office."
    const r = await G.boss('escalation');
    // (a skip of 4-2 made before the fight ends with the fight: 4-3 plays, and can be skipped itself)
    if (r === 'won' || flag('c4_bossDone')) await G.cutscene('4-3');
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 4-3 "Safe Room" (c4_secoffice) — and the chaseHits ≥ 4 variant
  // =================================================================================================================
  defineCutscene('4-3', async (G) => {
    const A = G.aidan;
    const hurt = (S.chaseHits | 0) >= 4;
    // state first
    G.set('c4_bossDone', true);
    G.set('chaseHurt', hurt);
    if (!G.inRoom('c4_secoffice')) await G.goto('c4_secoffice', 'door', { sound: 'door' });
    const C = G.actor('chase', 'chase');
    if (A.raw) A.raw.idleLife = false;
    if (C.raw) { C.raw.idleLife = false; try { C.raw.setEarbuds(true); } catch (e) { /* rig */ } }
    C.hold('R', null);
    C.place(0.42, 2.05, 90); C.pose(hurt ? 'hurt' : 'idle'); C.expr(hurt ? 'pain' : 'scared');
    A.place(1.75, 1.45, -70); A.pose('idle');
    // 1. SHOT — the back office under a buzzing fluorescent tube. Chase slides down the locked door to the floor.
    //    Outside: pounding, then silence.
    G.sfx('maglock', { pos: [0.1, 2.0, 2.0] });
    G.sfx('clunk', { pos: [0.1, 1.0, 2.0], vol: 0.8 });
    const lamp = G.obj('c4so:lamp'); if (lamp && lamp.userData.setOn) lamp.userData.setOn(true);
    G.cam({ pos: [4.4, 2.3, 3.45], target: [0.6, 0.75, 2.0], fov: 46, to: { pos: [4.2, 2.25, 3.35], fov: 44 }, dur: 14 });
    G.sfx('tube_flicker', { pos: [2.5, 2.6, 2.0], vol: 0.6 });
    await G.wait(0.6);
    C.pose('sit_floor', { blend: 1.3 });
    if (hurt && C.raw) { try { C.raw.armPose('L', 'ribs'); } catch (e) { /* rig */ } G.sfx('breath', { n: 3, vol: 0.9, phone: false }); }
    await G.wait(1.0);
    for (let i = 0; i < 3; i++) { G.sfx('pound', { pos: [-0.3, 1.4, 2.0], vol: 1 }); G.shake(0.12 + i * 0.05, 0.3); await G.wait(0.7 - i * 0.12); }
    await G.wait(0.5);
    G.sfx('pound', { pos: [-0.3, 1.4, 2.0], vol: 0.7 });
    await G.wait(1.6);                                                                 // silence
    await G.outage(false);
    if (lamp && lamp.userData.setOn) lamp.userData.setOn(false);
    await G.wait(0.6);
    // 2. SHOT — through the door's small wired-glass window. The lobby, back in the Fog world. A man sits on the floor
    //    against the counter, holding his phone in both hands, shoulders shaking. Normal size.
    const M = G.actor('c4_man', 'man_counter');
    M.place(-4.9, -1.55, 0); M.pose('sit_floor'); M.hold('R', 'phone', { pose: 'phone_look', screen: false }); M.expr('cry'); M.eyes('down');
    if (M.raw) M.raw.idleLife = false;
    C.pose(hurt ? 'hurt' : 'idle', { blend: 0 }); C.place(0.42, 2.1, -90);
    if (C.raw) C.raw.armPose && hurt && C.raw.armPose('L', 'ribs');
    C.look([-4.9, 0.8, -1.5]);
    A.place(1.05, 1.5, -75);
    A.look([-4.9, 0.8, -1.5]);
    //    (from the glass itself, out across the lobby to him)
    G.cam({ pos: [-0.14, 1.52, 2.02], target: [-4.9, 0.62, -1.45], fov: 30, to: { pos: [-0.2, 1.5, 1.98], target: [-4.9, 0.6, -1.45], fov: 27 }, dur: 20 });
    C4.manShake = true;
    G.bg(async (G2) => { while (C4.manShake) { try { if (M.raw) M.raw.gesture('tremor', { amount: 1 }); } catch (e) { /* rig */ } await G2.wait(1.3); } });
    await G.wait(1.6);
    await G.say('CHASE', '...He\'s just a bloke.');
    await G.say('AIDAN', 'Yeah.');
    //    (the reverse: the two of them behind the wired glass, a little of the lobby's light on their faces)
    const winFill = G.light('c4so:winfill'); if (winFill) winFill.on(true);
    { const hc = C4_headAt(C); G.cam({ pos: [-1.15, 1.6, 1.62], target: [hc.x + 0.2, hc.y - 0.12, hc.z - 0.1], fov: 34, to: { pos: [-1.05, 1.6, 1.66], target: [hc.x + 0.2, hc.y - 0.12, hc.z - 0.1], fov: 32 }, dur: 20 }); }
    await G.say('CHASE', 'He\'s just having a shocker of a day.');
    await G.beat();
    await G.say('CHASE', 'Doesn\'t mean I have to stand there and take it, though. Right?');
    await G.say('AIDAN', 'No. [beat] It means you get to leave.');
    // 3. SHOT — close on Chase. A small, real laugh.
    if (winFill) winFill.on(false);
    A.place(1.75, 1.6, -100);                                             // (he has stepped back from the door)
    A.look(C);
    await C.turn(A, 0.8);
    C.look(A); C.eyes('at', A);
    { const p0 = C4_rel(C, 0.8, -0.34, -0.08), p1 = C4_rel(C, 0.74, -0.31, -0.08), t0 = C4_rel(C, 0.02, 0.07, -0.1); G.cam({ pos: p0, target: t0, fov: 36, to: { pos: p1, target: t0, fov: 33 }, dur: 30 }); }
    C.expr('smile');
    q(C.gesture('laugh'));
    await G.wait(1.0);
    await G.say('CHASE', 'Look at you. Six months in and giving pep talks. [beat] Where to next, legend?');
    if (A.raw) { A.raw.eyes('down'); }
    await G.say('AIDAN', 'The call log said the case got escalated. Regional office on the ring road. Level 4. [beat] If I can get to it, I can fix it.');
    C.expr('flat');
    await G.say('CHASE', 'Fix it? [beat] Or bin it?');
    // Aidan doesn't answer.
    if (A.raw) A.raw.eyes('away', C.raw);
    await G.wait(2.0);
    if (hurt) {
      C.expr('pain');
      await G.say('CHASE', 'Go. I\'m alright. [beat] I\'m not alright. Go anyway.');
    } else {
      C.expr('tired');
      await G.say('CHASE', 'I\'ll catch up. Gonna sit here a sec.');
    }
    // he sits back down against the wall by the door (wide, from the corner: the close framing would hold on the empty
    // door while he moved)
    G.cam({ pos: [4.4, 2.3, 3.45], target: [0.9, 0.7, 2.6], fov: 46, to: { pos: [4.3, 2.28, 3.4], fov: 45 }, dur: 6 });
    C.place(0.45, 3.35, 90); C.pose(hurt ? 'sit_floor' : 'sit_knees', { blend: 0.6 });
    await G.wait(1.6);
    // state (plain statements)
    C4.manShake = false;
    { const wf = G.light('c4so:winfill'); if (wf) wf.on(false); }
    try { M.remove(); } catch (e) { /* gone */ }
    C.place(0.45, 3.35, 90); C.pose(hurt ? 'sit_floor' : 'sit_knees');
    C.look(null);
    if (C.raw) C.raw.idleLife = true;
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); A.raw.eyes('ahead'); A.raw.posture = Math.max(A.raw.posture || 0, 0.36); }
    A.look(null);
    G.set('c4_done', true);
    G.set('c4_outage', false);
    if (S.outage) G.setOutage(false);
    note(G, 'Get Chase to the back office.', 'c4_goal', { done: true });
    note(G, 'The regional office on the ring road. Level 4. The gate key — the boom gate out of the business park.', 'c4_goal');
    G.camRelease();
    Script.run(async (G2) => { await G2.wait(1.2); if (G2.inRoom('c4_secoffice') && !G2.has('gate_key')) await G2.think('The key board. [beat] "Boom gate."'); }, { control: true, name: 'c4:keyhint' });
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // Chapter 4
  // =================================================================================================================
  defineChapter({
    n: 4, id: 'ch4', title: 'CUSTOMER CARE', card: 'CUSTOMER CARE',
    start: { room: 'c4_wirelane', entry: 'yard' },
    // what a player carries into Chapter 4 (chapter select): the Prologue and Chapters 1–3
    debugState(s) {
      const give = (id, n = 1) => { if (!ITEMS[id]) return; const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      for (const id of ['box_cutter', 'steel_bar', 'extinguisher', 'jumper_tool', 'map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate']) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('energy_drink', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      s.ammo = s.ammo || {}; s.ammo.extinguisher = Math.max(s.ammo.extinguisher | 0, 4);
      for (const id of ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange']) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true, standardName: s.flags.standardName || 'LUKA',
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
        c3_bossDone: true, waiSaved: s.flags.waiSaved ?? true,
      });
      if (!s.flags.waiSaved) s.flags.waiLost = true;
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'acct4', 'huddle1', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note'), 'plaque', 'wai_email', 'oplog1', 'oplog2', 'oplog3', 'oplog4', 'oplog6', pick('fuse_note')]) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      for (const c of ['luka1', 'luka2', 'luka3']) s.calls[c] = s.calls[c] || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 3);
      for (const id of ['P-1', 'P-4', '1-1', '1-2', '1-3', '1-4', '1-7', '1-8', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '3-3b']) s.done['cs:' + id] = true;
      Object.assign(s.done, { 'break:ch1': true, 'break:ch2': true, 'break:ch3': true });
      s.F = Math.max(s.F || 0, 16); s.A = Math.max(s.A || 0, 2); s.stats.freed = Math.max(s.stats.freed || 0, 3);
      s.chaseHits = 0;
      s.notes = (s.notes || []).filter((n) => n && n.id !== 'c2_goal' && n.id !== 'c3_goal');
      s.notes.push({ id: 'c4_goal', text: 'The call centre. Chase went there. The call logs — a real number for her.', done: false });
    },
    async begin(G) {
      G.bars(null);
      if (G.once('c4:begin')) {
        note(G, 'The call centre. Chase went there. The call logs — a real number for her.', 'c4_goal');
        await G.wait(1.4);
        await G.think('Wire Lane. [beat] Down the hill, the call centre.');
      }
    },
  });
}
