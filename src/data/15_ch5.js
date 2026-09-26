// ==== data/15_ch5.js — Chapter 5 "Level 4" (spec §10 Ch 5, §7A Ring Road, §7B Regional Office + the Standard's
// patrols, §6 the Standard / the Pedestal / the Borrowed / the Reach / the Tethered / the Unread, §8 Luka's calls 5 and 6,
// §13 Huddle Whiteboard 3 + Chloe's Pin) — tag C5_ ====
// Rooms (CONTENT_PLAN §2):
//   c5_ringroad   Ring Road: north from the business park gate (the park end, z 72) past the closed servo to the
//                 roundabout with the dry fountain (0,0); its west arm ends at a drop; the east arm runs past the
//                 Regional Office forecourt (x 44–60, north side → c5_forecourt:road) to a drop at x 78 — after Ch 6 the
//                 road simply continues (→ c7_ringroad:office, "That wasn't there before."). The tower looms over the
//                 forecourt, ten storeys of dark glass with only Level 4 lit. park → c4_park:ring.
//   c5_forecourt  The tower's forecourt: the "Regional Office — Excellence Every Day" monolith, planters, the canopy
//                 and the revolving door (→ c5_lobby:doors), the tower face with its one lit floor (a tall bent shape
//                 stands at one of the Level 4 windows — until you look again).
//   c5_lobby      24 × 16 m, double height: the security desk (visitor-pass printer → "AIDAN — VISITING: ESCALATIONS"
//                 opens a speed gate; first aid kit), the speed-gate line, the dead lifts ("OUT OF SERVICE" →
//                 "Stairs, then."), the rankings screen (every name blurred but CHLOE), the Directory (map_office), the
//                 payphone, Stairwell A's door (NE, behind the gates) → c5_stairs:ground.
//   c5_stairs     Stairwell A, ground → Level 4: a switchback stair round a 2 m void (floor-to-floor 3.6 m). Levels 2
//                 and 3 are locked (a rattle, "Locked."). CUTSCENE 5-1 on the first climb; GAMEPLAY 5-2 the chase —
//                 the Standard ("c5_climber", a custom type built on the engine's Standard) follows him up the flights
//                 at walking pace. The stacked flights share their XZ footprint, so the room re-orders its floor
//                 regions every frame (the level nearest Aidan's feet wins — see C5_stairFloors).
//   c5_level4     Level 4 (40 × 30): the open plan (west half), the north desks, the escalations office door (NW,
//                 card reader → c6_escalations:door), the kitchenette + break table (NE), Stairwell A's door (NE), three
//                 meeting rooms along the east balcony (doors are hiding spots), the dead lifts, the print room door
//                 (SE → c5_print:door), the south collaboration zone (Huddle Whiteboard 3, the fire stairs → c6_firestairs),
//                 the balcony ring round the 14 × 14 atrium void (the three-storey leaderboard on its north side, the
//                 feature stair down its west side → c5_atrium:stairs). The Standard patrols the ring clockwise,
//                 pausing 4 s at each meeting-room door; CALL 5 as he steps onto the floor (its keys on the stairs
//                 behind him); Tethered ×1, Reach ×1, the Borrowed "Chloe". After 5-2
//                 the Outage: contracts on every desk, circuit carpet, receipts, the Unread in the kitchenette, the
//                 Pedestal rising through the void.
//   c5_print      8 × 5 m print room: CUTSCENE 5-2 "Print Room"; chloe_pin on the floor; the copier prints rmap_office.
//   c5_atrium     The Level 2 atrium floor under the void: CUTSCENE 5-3 → BOSS "pedestal" → 5-4 / 5-4alt; CALL 6 on
//                 the way back up the feature stair → CHAPTER CARD "THE MIDDLE" (G.startChapter(6)).
// State: S.flags c5_pass (visitor pass printed), c5_chase (5-1 seen: the Standard is loose in the building), c5_l4
//   (reached Level 4), c5_chloe (5-2 done), c5_outage (Level 4 is in the Outage), c5_bossDone, c5_hitTop (the top
//   figure was hit), chloeSaved (fate), c5_done (5-4 played, keycard given); S.done c5:* keys.
{
  const D2R = Math.PI / 180;
  const clamp = U.clamp, lerp = U.lerp;
  const FN = Tex.fonts, BR = Tex.brand;
  const flag = (k) => !!(S.flags && S.flags[k]);
  const done = (k) => !!(S.done && S.done[k]);
  const q = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd.play) return Snd.play(name, o); } catch (e) { /* audio */ } return null; };
  const busy = () => { try { return !!Script.busy; } catch (e) { return false; } };
  // transient presentation state (never saved)
  const C5 = { stair: null, climber: null, std: null, tower: null, boss: null, breath: null, lastCam: null, hideT: 0 };

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function ctex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h, U.rng(U.hash('c5:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (o.linear) t.colorSpace = THREE.NoColorSpace;
    t.userData.shared = true; t.name = 'c5:' + key;
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
  const hand = (ctx, s, x, y, o) => { try { Tex.handwriting(ctx, s, x, y, o); } catch (e) { tx(ctx, s, x, y, o.size || 20, o.color || '#1f2c6e', { font: FN.hand }); } };
  const board = (key, lines, o = {}) => ctex('board|' + key, o.w || 512, o.h || 192, (x, w, h, r) => {
    x.fillStyle = o.bg || '#e9e4d2'; x.fillRect(0, 0, w, h);
    if (o.band) { x.fillStyle = o.band; x.fillRect(0, 0, w, o.bandH || h * 0.18); }
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); }
    const n = lines.length, top = o.band ? (o.bandH || h * 0.18) : 0, lh = (h - 20 - top) / n;
    lines.forEach((l, i) => { const sz = (Array.isArray(o.size) ? o.size[i] : o.size) || Math.min(lh * 0.62, 56); tx(x, l, o.align === 'left' ? 24 : w / 2, top + 12 + lh * (i + 0.72), sz, (Array.isArray(o.fg) ? o.fg[i] : o.fg) || '#1d1d1d', { font: o.font || FN.sans, weight: o.weight ?? 'bold', align: o.align || 'center' }); });
    if (o.bandText) tx(x, o.bandText, w / 2, (o.bandH || h * 0.18) * 0.72, (o.bandH || h * 0.18) * 0.6, o.bandFg || '#fff', { weight: 'bold', align: 'center' });
    age(x, w, h, r, o.age ?? 0.6, { sun: o.sun ?? 0.2 });
  });

  // the tower's curtain wall: nine office floors of dark glass (L2–L10), spandrels, mullions; `row` marks one floor
  const facadeTex = (bays, floors) => ctex(`facade${bays}x${floors}`, 1024, Math.round(1024 * floors * 3.6 / (bays * 2.5)), (x, w, h, r) => {
    const bw = w / bays, fh = h / floors;
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const x0 = b * bw, y0 = f * fh;
        const g = x.createLinearGradient(x0, y0, x0 + bw * 0.6, y0 + fh);
        const k = 0.8 + r() * 0.3;
        g.addColorStop(0, `rgb(${Math.round(52 * k)},${Math.round(64 * k)},${Math.round(68 * k)})`);
        g.addColorStop(0.5, `rgb(${Math.round(30 * k)},${Math.round(38 * k)},${Math.round(42 * k)})`);
        g.addColorStop(1, `rgb(${Math.round(22 * k)},${Math.round(27 * k)},${Math.round(30 * k)})`);
        x.fillStyle = g; x.fillRect(x0, y0 + fh * 0.22, bw, fh * 0.78);
        // a reflection streak of the fog sky, now and then a blind half down behind the glass
        if (r() < 0.35) { x.fillStyle = 'rgba(160,176,172,0.10)'; x.beginPath(); x.moveTo(x0 + bw * 0.2, y0 + fh * 0.22); x.lineTo(x0 + bw * 0.45, y0 + fh * 0.22); x.lineTo(x0 + bw * 0.15, y0 + fh); x.lineTo(x0, y0 + fh); x.closePath(); x.fill(); }
        if (r() < 0.25) { x.fillStyle = 'rgba(120,124,118,0.35)'; x.fillRect(x0 + 2, y0 + fh * 0.22, bw - 4, fh * (0.2 + r() * 0.4)); for (let s = 0; s < 8; s++) { x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(x0 + 2, y0 + fh * 0.24 + s * 4, bw - 4, 1); } }
      }
      // spandrel band (floor slab) and the sill line
      x.fillStyle = '#4c5553'; x.fillRect(0, f * fh, w, fh * 0.22);
      x.fillStyle = '#6d7572'; x.fillRect(0, f * fh + fh * 0.2, w, 2);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, f * fh, w, 2);
    }
    x.fillStyle = '#7d8683';
    for (let b = 0; b <= bays; b++) x.fillRect(Math.round(b * bw) - 2, 0, 4, h);
    // rain streaks and grime down from the slabs
    for (let i = 0; i < 60; i++) { const sx = r() * w, sy = Math.floor(r() * floors) * fh; x.fillStyle = `rgba(20,24,22,${0.08 + r() * 0.12})`; x.fillRect(sx, sy, 1 + r() * 2, fh * (0.4 + r() * 0.9)); }
    age(x, w, h, r, 0.35);
  });
  // Level 4 lit: warm office windows (ceilings of tubes, desk partitions, monitors), a couple dark
  const litTex = (bays) => ctex('lit' + bays, 1024, 96, (x, w, h, r) => {
    const bw = w / bays;
    x.fillStyle = '#4c5553'; x.fillRect(0, 0, w, h);
    for (let b = 0; b < bays; b++) {
      const x0 = b * bw, dark = r() < 0.12;
      const g = x.createLinearGradient(0, 14, 0, h);
      if (dark) { g.addColorStop(0, '#1d2426'); g.addColorStop(1, '#131819'); }
      else { g.addColorStop(0, '#fff2cf'); g.addColorStop(0.35, '#e9d7a6'); g.addColorStop(1, '#8e7f5e'); }
      x.fillStyle = g; x.fillRect(x0 + 2, 14, bw - 4, h - 14);
      if (!dark) {
        x.fillStyle = 'rgba(255,255,250,0.9)'; x.fillRect(x0 + bw * 0.15, 18, bw * 0.7, 3);
        x.fillStyle = 'rgba(40,40,36,0.55)'; x.fillRect(x0 + 2, h * 0.62, bw - 4, h * 0.38 * (0.5 + r() * 0.3));
        if (r() < 0.5) { x.fillStyle = 'rgba(120,200,220,0.8)'; x.fillRect(x0 + bw * (0.2 + r() * 0.5), h * 0.52, bw * 0.12, h * 0.1); }
      }
    }
    x.fillStyle = '#7d8683'; for (let b = 0; b <= bays; b++) x.fillRect(Math.round(b * bw) - 2, 0, 4, h);
  });
  // a tall, bent, thin silhouette standing at a lit window (alpha)
  const figureTex = () => ctex('stdfig', 128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(8,10,10,0.92)';
    x.beginPath();
    x.moveTo(w * 0.40, h); x.lineTo(w * 0.44, h * 0.45); x.lineTo(w * 0.36, h * 0.30); x.quadraticCurveTo(w * 0.40, h * 0.12, w * 0.62, h * 0.14);
    x.lineTo(w * 0.78, h * 0.22); x.lineTo(w * 0.74, h * 0.30); x.lineTo(w * 0.62, h * 0.26); x.lineTo(w * 0.58, h * 0.45); x.lineTo(w * 0.60, h);
    x.closePath(); x.fill();
    x.fillRect(w * 0.6, h * 0.24, w * 0.22, h * 0.04);           // the clipboard, flat under the bent head
  });
  // the servo's price pylon
  const pylonTex = () => ctex('pylon', 256, 512, (x, w, h, r) => {
    x.fillStyle = '#10302f'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 120);
    tx(x, 'RING ROAD', w / 2, 58, 40, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'FUEL', w / 2, 104, 40, BR.yellow, { font: FN.heavy, weight: '900', align: 'center' });
    [['UNLEADED 91', '---.-'], ['PREMIUM 95', '---.-'], ['DIESEL', '---.-'], ['LPG', '---.-']].forEach(([a, b], i) => {
      const y = 170 + i * 80;
      x.fillStyle = '#e9e6dc'; x.fillRect(12, y - 40, w - 24, 64);
      tx(x, a, 22, y - 14, 18, '#1d1d1d', { weight: 'bold' });
      x.fillStyle = '#0a0a0a'; x.fillRect(22, y - 8, w - 44, 26);
      tx(x, b, w / 2, y + 12, 24, '#ff5a30', { font: FN.mono, weight: 'bold', align: 'center' });
    });
    tx(x, 'CLOSED', w / 2, h - 18, 30, '#b3261e', { font: FN.heavy, weight: '900', align: 'center' });
    age(x, w, h, r, 0.9, { sun: 0.25 });
  });
  // the fuel bowsers' faces
  const bowserTex = () => ctex('bowser', 128, 256, (x, w, h, r) => {
    x.fillStyle = '#d9d6cc'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 40);
    tx(x, 'ULP 91', w / 2, 28, 20, '#fff', { weight: 'bold', align: 'center' });
    x.fillStyle = '#0c0d0c'; x.fillRect(12, 56, w - 24, 70);
    tx(x, '0.00', w - 20, 84, 20, '#3a6040', { font: FN.mono, align: 'right' });
    tx(x, '---.-', w - 20, 114, 20, '#3a6040', { font: FN.mono, align: 'right' });
    x.fillStyle = '#b3261e'; x.fillRect(12, 140, w - 24, 26); tx(x, 'OUT OF ORDER', w / 2, 159, 13, '#fff', { weight: 'bold', align: 'center' });
    x.fillStyle = '#9da09a'; x.fillRect(20, 190, w - 40, 50);
    age(x, w, h, r, 1.1);
  });
  // the office monolith sign on the forecourt
  const monolithTex = () => ctex('monolith', 512, 768, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a403f'); g.addColorStop(1, '#262a2a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; x.fillRect(r() * w, r() * h, 2, 2); }
    Tex.drawWordmark(x, 60, 170, 70, { color: BR.yellow });
    tx(x, 'Regional Office', w / 2, 330, 58, '#e8e4d8', { font: FN.serif, align: 'center' });
    x.fillStyle = BR.teal; x.fillRect(90, 360, w - 180, 4);
    tx(x, 'Excellence Every Day', w / 2, 430, 40, '#b8d8d4', { font: FN.serif, align: 'center' });
    tx(x, 'LEVEL 4 — RETAIL REGION', w / 2, 560, 22, '#8a9a98', { weight: 'bold', align: 'center', spacing: 3 });
    tx(x, 'VISITORS PLEASE REPORT TO SECURITY', w / 2, 600, 18, '#8a9a98', { align: 'center', spacing: 2 });
    age(x, w, h, r, 0.5);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Small builders shared by the rooms
  // ---------------------------------------------------------------------------------------------------------------
  const floorPlane = (K, x, y, z, w, d, mat, rotY = 0, o = {}) => K.plane(x, y, z, w, d, mat, { rot: [-90, 0, rotY], ...o });
  // a room's ambient (Fog / Outage), blended with the dissolve
  const AMB = { c0: new THREE.Color(), c1: new THREE.Color(), last: -1 };
  function C5_ambient(fog, out) {
    const k = clamp(Tex.outage || 0, 0, 1);
    const key = Math.round(k * 50) + fog[1] * 1000 + out[1] * 100000;
    if (key === AMB.last) return;
    AMB.last = key;
    AMB.c0.set(fog[0]).lerp(AMB.c1.set(out[0]), k);
    try { Render.setAmbient(AMB.c0.getStyle(), lerp(fog[1], out[1], k)); } catch (e) { /* render */ }
  }
  function C5_ambientOff() { AMB.last = -1; try { Render.setAmbient(null); } catch (e) { /* render */ } }

  // The Regional Office tower seen from outside: south face at z = tz, x from tx0 to tx0 + 40, 30 deep; a 5 m glass
  // podium (the lobby), nine office floors of dark glass above it; only Level 4 (y 12.2–15.8) is lit.
  const TOWER = { W: 40, D: 30, POD: 5, FL: 3.6, N: 9 };
  const towerTop = TOWER.POD + TOWER.FL * TOWER.N;
  function C5_tower(K, tx0, tz, o = {}) {
    const W = TOWER.W, D = TOWER.D, cx = tx0 + W / 2, H = towerTop, L4 = TOWER.POD + TOWER.FL * 2;
    K.box(cx, 0, tz - D / 2, W - 0.4, H, D - 0.4, { color: '#1f2527', roughness: 0.7 }, { shadow: false });
    const fac = facadeTex(16, 9), side = facadeTex(12, 9);
    K.plane(cx, TOWER.POD + TOWER.FL * TOWER.N / 2, tz + 0.02, W, TOWER.FL * TOWER.N, fac, {});
    K.plane(tx0 - 0.02, TOWER.POD + TOWER.FL * TOWER.N / 2, tz - D / 2, D, TOWER.FL * TOWER.N, side, { rotY: -90 });
    K.plane(tx0 + W + 0.02, TOWER.POD + TOWER.FL * TOWER.N / 2, tz - D / 2, D, TOWER.FL * TOWER.N, side, { rotY: 90 });
    // the one lit floor
    K.plane(cx, L4 + 1.95, tz + 0.06, W - 0.2, 3.1, litTex(16), { emissive: true, emissiveIntensity: o.litK ?? 1.25 });
    K.plane(tx0 - 0.06, L4 + 1.95, tz - D / 2, D - 0.2, 3.1, litTex(12), { rotY: -90, emissive: true, emissiveIntensity: (o.litK ?? 1.25) * 0.8 });
    K.plane(tx0 + W + 0.06, L4 + 1.95, tz - D / 2, D - 0.2, 3.1, litTex(12), { rotY: 90, emissive: true, emissiveIntensity: (o.litK ?? 1.25) * 0.8 });
    if (o.halos !== false) for (let i = 0; i < 5; i++) Render.halo([tx0 + 4 + i * 8, L4 + 2.2, tz + 0.6], { parent: K.root, color: '#ffe6b0', size: o.haloSize ?? 7, opacity: 0.28 });
    // podium: recessed dark glass, mullions, the canopy (the forecourt builds its own, close up)
    if (o.podium !== false) {
      K.box(cx, 0, tz - 1.2, W - 1.0, TOWER.POD, 0.1, { color: '#0d1112', roughness: 0.25, metalness: 0.2 });
      for (let x = tx0 + 1; x <= tx0 + W - 1 + 0.01; x += 2.5) K.box(x, 0, tz - 1.1, 0.12, TOWER.POD, 0.14, { tex: 'metal', color: '#7d8683' });
      K.box(cx, TOWER.POD - 0.35, tz - 0.6, W, 0.35, 1.3, { tex: 'concrete', color: '#8e928c' });
      K.light('screen', cx, 1.8, tz + 0.4, { color: '#5fd8d0', intensity: 1, distance: 5, real: false });
    } else K.box(cx, TOWER.POD - 0.35, tz + 0.2, W, 0.35, 0.5, { tex: 'concrete', color: '#8e928c' });
    // roof: parapet, plant room, a dead rooftop sign
    K.box(cx, H, tz - D / 2, W, 1.1, D, { tex: 'concrete', color: '#5a605e' }, { shadow: false });
    K.box(cx + 6, H + 1.1, tz - D / 2 - 3, 14, 3.2, 10, { tex: 'metal', color: '#4a504e' }, { shadow: false });
    if (o.sign !== false) K.plane(cx - 8, H + 2.4, tz + 0.05, 12, 2.4, Tex.wordmark({ w: 12, h: 2.4, bg: null, color: '#3a4040' }), {});
    // the Standard at a Level 4 window (from the forecourt) — gone once you've looked away and back
    if (o.figure) {
      const fig = K.plane(o.figure[0], L4 + 1.55, tz + 0.1, 0.9, 2.4, figureTex(), { transparent: true, name: 'c5:towerfig' });
      // (drawn after the lit floor's glazing: sorted by centre distance the wider glazing plane would otherwise paint
      // over it)
      fig.material.depthWrite = false; fig.renderOrder = 3;
      return fig;
    }
    return null;
  }

  // =================================================================================================================
  // 5A RING ROAD — from the business park gate (south, z 72) north past the servo to the roundabout (0,0); the west
  // arm ends at a drop (x −39); the east arm passes the Regional Office forecourt (x 44–60, north) to a drop at x 78
  // (after Ch 6 it continues → c7_ringroad:office). Carriageways 9 m, footpaths 1.8 m, fog a little thinner than the
  // other streets so the tower's lit floor reads.
  // =================================================================================================================
  const RR = { fp: 6.46, east: () => flag('c6_done') };
  defineRoom({
    id: 'c5_ringroad', name: 'RING ROAD', area: 'RING ROAD', chapter: 5, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.04 },
    surfaces: [
      { box: [-24.2, 30, -6.4, 52], s: 'concrete' }, { box: [-44, -13.2, 14, -9], s: 'concrete' },
      { box: [-6.5, 14, -4.5, 72.5], s: 'concrete' }, { box: [4.5, 14, 6.5, 72.5], s: 'concrete' },
      { box: [-44, -6.5, 97, -4.5], s: 'concrete' }, { box: [-44, 4.5, 97, 6.5], s: 'concrete' }, { box: [44, -9, 60, -6.4], s: 'concrete' },
    ],
    bounds: [-44, -13.2, 97, 72.6],
    entries: { park: [1.2, 69.6, 180], forecourt: [52, -7.5, 0], office: [91, 1.2, -90], start: [1.2, 69.6, 180] },
    cameras: [
      // the empty south end first: the road out of the fog from the business park gate, the camera on the east kerb
      { id: 'c5_ringroad:gate', vol: [-6.6, 57, 6.6, 72.6], type: 'pan', pos: [5.4, 3.3, 55.2], target: [0, 0.9, 66], fov: 46, pan: { lag: 0.3, yaw: 62, pitch: 26 } },
      // the servo: from over the retaining wall across the road to the canopy and the shuttered shop
      { id: 'c5_ringroad:servo', vol: [-24.5, 30, 6.6, 57], type: 'pan', pos: [9.6, 5.2, 42.5], target: [-8, 0.8, 42], fov: 50, pan: { lag: 0.3, yaw: 78, pitch: 36 } },
      // the upper south arm, from the roundabout island's lamp looking back down the road
      { id: 'c5_ringroad:south', vol: [-6.6, 14, 6.6, 30], type: 'pan', pos: [-1.2, 4.6, 7.4], target: [0, 0.8, 21], fov: 48, pan: { lag: 0.3, yaw: 58, pitch: 34 } },
      // the roundabout, south half: from the island, the fountain in the foreground
      { id: 'c5_ringroad:roundS', vol: [-14, 1.2, 14, 14], type: 'pan', pos: [0.6, 5.6, 21.5], target: [-1, 0.6, 3], fov: 52, pan: { lag: 0.3, yaw: 80, pitch: 40 } },
      // the roundabout, north half: from high on the east kerb, over the island to the hill's guardrail and the fog
      { id: 'c5_ringroad:roundN', vol: [-14, -13.2, 14, 1.2], type: 'pan', pos: [19.5, 6.4, 3.2], target: [-2, 0.6, -6.5], fov: 52, pan: { lag: 0.3, yaw: 70, pitch: 44 } },
      // the west arm: out along it to the barrier and the drop
      { id: 'c5_ringroad:west', vol: [-44, -6.6, -14, 6.6], type: 'pan', pos: [-10.5, 4.6, 9.2], target: [-28, 0.8, 0], fov: 46, pan: { lag: 0.3, yaw: 70, pitch: 38 } },
      // the east arm to the carpark entrance
      { id: 'c5_ringroad:east', vol: [14, -6.6, 40, 6.6], type: 'pan', pos: [27, 4.1, 7.2], target: [27, 0.8, 0], fov: 50, pan: { lag: 0.3, yaw: 82, pitch: 34 } },
      // low at the forecourt: the tower over him, ten floors of dark glass and one lit
      { id: 'c5_ringroad:office', vol: [40, -9.2, 66, 6.6], type: 'pan', pos: [52, 0.95, 10.4], target: [52, 4.6, -6], fov: 54, pan: { lag: 0.35, yaw: 70, pitch: 38 } },
      // the east end: the drop (or, after Chapter 6, the road going on into the fog)
      { id: 'c5_ringroad:end', vol: [66, -6.6, 97, 6.6], type: 'pan', pos: [62.4, 4.6, 9.4], target: [80, 0.8, 0], fov: 46, pan: { lag: 0.3, yaw: 70, pitch: 38 } },
    ],
    build(K) {
      const fp = RR.fp;
      const CONC = { tex: 'concrete', color: '#8a8880' };
      // ---- ground: the three arms, the junction, the servo apron, the forecourt apron --------------------------
      K.road(-4.5, 14, 4.5, 72.6, { axis: 'z', markings: 'center', footpath: 1.8 });
      K.road(-40, -4.5, -14, 4.5, { axis: 'x', markings: 'center', footpath: 1.8 });
      K.road(14, -4.5, RR.east() ? 97 : 86, 4.5, { axis: 'x', markings: 'center', footpath: 1.8 });
      // the junction: footpath all round, the carriageway ring on top of it (later floors win), the island
      for (const [x0, z0, x1, z1] of [[-14, -13.2, 14, -9], [-14, -9, -11, -4.5], [-14, 4.5, -11, 14], [11, -9, 14, -4.5], [11, 4.5, 14, 14], [-11, 11, -4.5, 14], [4.5, 11, 11, 14]]) K.floor(x0, z0, x1, z1, 'footpath', { y: 0.15, skirt: false });
      K.floor(-11, -9, 11, 11, 'bitumen');
      K.floor(-4.5, 11, 4.5, 14, 'bitumen');
      K.floor(-14, -4.5, -11, 4.5, 'bitumen');
      K.floor(11, -4.5, 14, 4.5, 'bitumen');
      const kerbM = { tex: 'kerb', color: '#9a978c' };
      for (const [x0, z0, x1, z1] of [[-11, -9.08, 11, -9], [-11.08, -9, -11, -4.5], [-11.08, 4.5, -11, 11], [11, -9, 11.08, -4.5], [11, 4.5, 11.08, 11], [-11, 11, -4.5, 11.08], [4.5, 11, 11, 11.08]]) K.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.max(0.16, x1 - x0), 0.15, Math.max(0.16, z1 - z0), kerbM);
      // the island: kerb ring, dead grass, the dry fountain, a council sign
      K.cyl(0, 0, 1.5, 5.2, 0.16, { tex: 'kerb', color: '#9a978c' }, { seg: 32 });
      K.cyl(0, 0, 1.5, 5.0, 0.2, { tex: 'grass', color: '#5d6452' }, { seg: 32 });
      K.prop('fountain', 0, 1.5, 0, { radius: 2.4, y: 0.2 });
      for (const a of [0, 45, 90, 135]) K.colliderRot(0, 1.5, 10.2, 4.2, a, { h: 1.2 });
      // the junction's outer edges (fences and the hill's wall)
      K.collider(-14.25, -13.2, -14, -6.5, { h: 2.2 }); K.collider(-14.25, 6.5, -14, 14, { h: 2.2 });
      K.collider(-14, 14, -fp, 14.25, { h: 2.2 }); K.collider(fp, 14, 14, 14.25, { h: 2.2 });
      K.collider(14, 6.5, 14.25, 14, { h: 2.2 }); K.collider(14, -13.2, 14.25, -6.5, { h: 2.2 });
      for (const [x, z, r, len] of [[-14.1, -9.85, 90, 6.7], [-14.1, 10.25, 90, 7.5], [-10.2, 14.1, 0, 7.6]]) K.prop('chainlink', x, z, r, { len, h: 2.0, collide: false });
      K.wall(fp, 14.15, 14.2, 14.15, 2.6, { tex: 'concrete', color: '#7e7d76' }, { thick: 0.25, grime: true, collide: false });
      K.wall(14.15, 14.2, 14.15, 6.5, 2.6, { tex: 'concrete', color: '#7e7d76' }, { thick: 0.25, grime: true, collide: false });
      for (let z = -12.2; z < -6.6; z += 2.1) K.prop('shrub', 14.4, z + 1, 0, { w: 2.0, h: 1.3 });
      K.sign('SIGNAL HILL\nA CONNECTED COMMUNITY', 0, 1.0, 6.25, 1.6, 0.6, { style: 'council', bg: '#e8e4d2' });
      K.box(-0.75, 0.2, 6.25, 0.06, 0.6, 0.06, { tex: 'metal', color: '#8d9594' }); K.box(0.75, 0.2, 6.25, 0.06, 0.6, 0.06, { tex: 'metal', color: '#8d9594' });
      K.dress('leaves', [-4, -2.5, 4, 5.5], 30, { seed: 501, y: 0.21 });
      // the north side of the junction: a guardrail over the embankment, the hill falling away into fog
      for (let x = -13; x < 14; x += 6) K.prop('guardrail', x, -13.1, 180, { len: 6, collide: false });
      K.collider(-44, -14, 14, -13.15, { h: 2 });
      K.box(0, -3.5, -20, 34, 3.2, 12, { tex: 'grass', color: '#4c5446' }, { shadow: false, rot: 0 });
      K.prop('gum_tree', -8, -18.5, 30, { y: -1.2 }); K.prop('gum_tree', 9, -19.5, 200, { y: -1.4 });
      // corner furniture: streetlights, give-way signs
      K.prop('streetlight', -12.8, 12.8, 135, { bank: 1 });
      K.prop('streetlight', 12.8, 12.8, -135, { lit: false });
      K.prop('streetlight', 12.8, -11.8, -45, { bank: 2 });
      K.prop('streetlight', -12.8, -11.8, 45, { light: false });
      K.prop('sign_post', -5.4, 12.2, 0, { style: 'council', text: 'GIVE WAY', bg: '#ffffff', fg: '#b3261e', w: 0.6, h: 0.5 });
      K.prop('sign_post', 12.3, -5.8, 90, { style: 'council', text: 'GIVE WAY', bg: '#ffffff', fg: '#b3261e', w: 0.6, h: 0.5 });
      K.prop('sign_post', -12.3, 5.6, -90, { text: 'RING RD', text2: 'OLD HILL RD →' });

      // ---- SOUTH ARM ---------------------------------------------------------------------------------------------
      // east: a concrete retaining wall holding up the hill (gum trees above it)
      K.wall(fp + 0.1, 72.8, fp + 0.1, 14, 2.6, { tex: 'concrete', color: '#7e7d76' }, { thick: 0.25, grime: true });
      K.box(fp + 4, 2.4, 42, 7.5, 0.3, 60, { tex: 'grass', color: '#4e5647' }, { shadow: false });
      for (const [z, s] of [[20, 1], [36, 0.8], [51, 1.1], [66, 0.9]]) K.prop('gum_tree', fp + 3.5, z, z * 7, { y: 2.6, scale: s });
      K.writing('FOLLOW UP TOMORROW', fp - 0.04, 1.35, 40, 3.0, { rotY: -90, world: 'fog' });
      K.writing('WHO ARE YOU TRYING TO REACH', fp - 0.04, 1.2, 62.5, 3.6, { rotY: -90, world: 'fog' });
      // west: chain-link round an empty lot, the servo between
      for (const [z0, z1] of [[14, 30], [52, 72]]) { K.collider(-fp - 0.25, z0, -fp - 0.05, z1, { h: 2.2 }); for (let z = z0; z < z1 - 0.1; z += 4) K.prop('chainlink', -fp - 0.15, z + 2, 90, { len: 4, h: 2.0, collide: false }); }
      K.box(-14, -0.05, 22, 15, 0.06, 16, { tex: 'dirt', color: '#5a5446' }, { shadow: false });
      K.box(-14, -0.05, 62, 15, 0.06, 20, { tex: 'dirt', color: '#5a5446' }, { shadow: false });
      K.sign('FOR LEASE\nDEVELOPMENT SITE\n2,400 m²', -8.4, 1.9, 60, 1.4, 1.0, { style: 'council', bg: '#ffffff', fg: '#0b4f52', rotY: 90 });
      K.box(-8.4, 0, 60.5, 0.08, 1.4, 0.08, { tex: 'metal', color: '#8d9594' }); K.box(-8.4, 0, 59.5, 0.08, 1.4, 0.08, { tex: 'metal', color: '#8d9594' });
      K.dress('leaves', [-6.4, 14, -4.6, 72], 40, { seed: 511, y: 0.16 });
      K.dress('leaves', [4.6, 14, 6.4, 72], 40, { seed: 512, y: 0.16 });
      K.dress('papers', [-4, 16, 4, 70], 8, { seed: 513 });
      K.prop('streetlight', fp - 0.3, 22, -90, { bank: 1 });
      K.prop('streetlight', -fp + 0.3, 38, 90, { lit: false });
      K.prop('streetlight', fp - 0.3, 52, -90, { bank: 2, flicker: true });
      K.prop('streetlight', fp - 0.3, 68, -90, { bank: 3 });
      K.prop('road_sign', fp - 0.9, 26, 0, { text: 'REGIONAL OFFICE  ↑\nHOSPITAL  ↑', sub: 'ROUNDABOUT AHEAD', w: 1.8 });
      K.prop('sign_post', fp - 0.5, 60.5, 0, { style: 'council', text: '40\nAREA', bg: '#ffffff', fg: '#1d1d1d', w: 0.5, h: 0.6 });
      K.prop('sign_post', -fp + 0.45, 29, 180, { text: 'RING RD' });
      // a car left on the kerb with its hazards going, a lanyard on the seat
      K.prop('car', 3.25, 47.2, 178, { color: '#6d7a84', hazards: true, name: 'c5rr_car' });
      K.prop('trolley', -5.4, 64.5, 130, {});
      K.prop('bin', 5.9, 33, -90, { variant: 'wheelie', color: '#2c4a2e' });
      K.box(5.2, 0.15, 33.9, 0.6, 0.62, 0.72, { color: '#2c4a2e', roughness: 0.6 }, { rot: 80 });
      K.prop('rubbish', 4.9, 34.6, 0, {});
      K.prop('leaf_pile', -5.3, 44, 0, { radius: 0.8, y: 0.15 });
      K.prop('bench', fp - 0.55, 58, -90, { len: 1.6, y: 0.15 });
      K.prop('sign_post', fp - 0.35, 56.8, -90, { style: 'council', text: 'BUS\nROUTE 44', bg: '#ffcc00', fg: '#1d1d1d', w: 0.45, h: 0.55 });

      // ---- THE SERVO (west of the south arm, z 30–52) ---------------------------------------------------------------
      K.floor(-24.2, 30, -fp + 0.1, 52, { tex: 'concrete', color: '#8f8d86' }, { y: 0.15, skirt: false });
      K.collider(-24.6, 29.7, -fp, 30, { h: 1.2 });
      K.collider(-24.6, 52, -fp, 52.3, { h: 1.2 });
      K.box(-15.3, 0.15, 29.85, 17.8, 0.9, 0.3, { tex: 'brick', color: '#7a6a5a' });
      K.box(-15.3, 0.15, 52.15, 17.8, 0.9, 0.3, { tex: 'brick', color: '#7a6a5a' });
      // the canopy on four columns
      for (const [x, z] of [[-19.5, 35], [-11, 35], [-19.5, 47], [-11, 47]]) K.box(x, 0.15, z, 0.45, 4.25, 0.45, { tex: 'metal', color: '#c8ccc8' }, { collide: true });
      K.box(-15.25, 4.4, 41, 12.5, 0.55, 15.5, { color: '#d8dad4', roughness: 0.6 }, { shadow: false });
      K.box(-15.25, 4.25, 41, 12.6, 0.18, 15.6, { color: '#0f6e6c', roughness: 0.5 }, { shadow: false });
      K.sign('RING ROAD FUEL', -15.25, 4.67, 48.8, 6, 0.5, { style: 'shop', bg: BR.teal, fg: '#ffffff' });
      K.sign('RING ROAD FUEL', -8.95, 4.67, 41, 6, 0.5, { style: 'shop', bg: BR.teal, fg: '#ffffff', rotY: 90 });
      // two pump islands, their bowsers
      for (const z of [38.2, 43.8]) {
        K.box(-15.25, 0.15, z, 6.4, 0.18, 1.0, { tex: 'concrete', color: '#b0ada2' }, { collide: true, h: 0.3 });
        for (const x of [-17.2, -13.3]) {
          K.box(x, 0.33, z, 0.62, 1.7, 0.42, { color: '#d9d6cc', roughness: 0.5 }, { collide: true });
          K.plane(x, 1.2, z + 0.215, 0.58, 1.16, bowserTex(), {});
          K.plane(x, 1.2, z - 0.215, 0.58, 1.16, bowserTex(), { rotY: 180 });
          K.box(x + 0.34, 1.0, z, 0.08, 0.3, 0.12, { color: '#1a1a1a', roughness: 0.5 });
        }
        K.box(-15.25, 0.33, z, 0.9, 0.9, 0.5, { color: '#b3261e', roughness: 0.6 });
      }
      K.prop('hatchback', -11.7, 38.4, 4, { color: '#8a2a24' });
      K.cyl(-12.35, 0.65, 38.6, 0.02, 1.0, { color: '#141414', roughness: 0.6 }, { rz: 70 });
      // the shop: a shuttered front facing the apron
      K.prop('shopfront', -24.2, 41, 90, { w: 13, variant: 'shop', name: 'RING ROAD FUEL — FOOD & DRINK', shutter: 0.75, door: 'center', poster: 'PREPAID\nTOP-UPS HERE', awning: false, notice: 'NO SIGNAL — DON\'T ASK' });
      K.box(-29.6, 0, 41, 9.2, 4.6, 14, { tex: 'render_cracked', color: '#b9b2a2' });
      K.collider(-24.6, 34, -24.25, 48.2, { h: 3 });
      K.box(-23.2, 0.15, 35.9, 1.4, 1.05, 0.8, { color: '#e8ecee', roughness: 0.4 }, { collide: true });
      K.sign('ICE', -23.2, 1.0, 36.31, 0.8, 0.3, { style: 'shop', bg: '#1f6fae', fg: '#ffffff' });
      K.box(-22.9, 0.15, 46.9, 0.5, 1.2, 0.4, { color: '#b3261e', roughness: 0.5 }, { collide: true });
      K.sign('AIR\nWATER', -22.9, 1.55, 46.9, 0.5, 0.4, { style: 'shop', bg: '#ffffff', fg: '#b3261e', rotY: 90 });
      K.prop('bin', -21.4, 48.6, 90, { variant: 'street' });
      K.box(-22.4, 0.15, 44.6, 0.9, 0.5, 0.6, { color: '#d8d0b8', roughness: 0.8 });
      K.sign('THE ADVOCATE\nNETWORK SWITCH-OFF:\nWHAT IT MEANS FOR YOU', -22.4, 1.05, 44.95, 0.8, 0.5, { style: 'council', bg: '#f4f2ea', fg: '#1d1d1d' });
      // the price pylon at the road
      K.box(-7.9, 0.15, 53.3, 0.3, 5.2, 0.3, { tex: 'metal', color: '#8d9594' }, { collide: true });
      K.box(-7.9, 2.2, 53.3, 1.5, 3.1, 0.35, { color: '#10302f', roughness: 0.5 });
      K.plane(-7.9, 3.75, 53.49, 1.4, 2.8, pylonTex(), {});
      K.plane(-7.9, 3.75, 53.11, 1.4, 2.8, pylonTex(), { rotY: 180 });
      // light: one tube under the canopy still flickering, the rest dead
      K.prop('fluoro_tube', -15.25, 38, 90, { h: 4.25, bank: 2, flicker: true, variant: 'troffer' });
      for (const [x, z] of [[-15.25, 44], [-19.5, 41], [-11, 41]]) K.prop('fluoro_tube', x, z, 90, { h: 4.25, lit: false, variant: 'troffer' });
      K.pickup('energy_drink', -23.35, 1.22, 36.0, { id: 'c5_ringroad:energy', extraOnEasy: true, rot: 20 });

      // ---- WEST ARM: to the drop ------------------------------------------------------------------------------------
      K.collider(-44, -6.75, -14, -6.5, { h: 2.2 }); K.collider(-44, 6.5, -14, 6.75, { h: 2.2 });
      for (let x = -40; x < -14; x += 6) { K.prop('guardrail', x + 3, 6.6, 0, { len: 6, collide: false }); K.prop('chainlink', x + 3, -6.6, 0, { len: 6, h: 2.0, collide: false }); }
      K.drop(-44, -6.6, -39, 6.6, { side: 'e', msg: 'The road ends here.' });
      K.prop('streetlight', -30, -6.2, 0, { bank: 3 });
      K.prop('cone', -36.2, -2.0, 0); K.prop('cone', -36.5, 1.6, 20); K.prop('cone', -35.8, 3.4, 60);
      K.prop('sign_post', -32, 6.1, 180, { style: 'council', text: 'NO THROUGH\nROAD', bg: '#ffffff', fg: '#1d1d1d', w: 0.6, h: 0.5 });
      K.dress('leaves', [-40, -6.4, -14, 6.4], 40, { seed: 521 });

      // ---- EAST ARM -----------------------------------------------------------------------------------------------------
      const endX = RR.east() ? 97 : 86;
      K.collider(14, 6.5, endX, 6.75, { h: 2.2 });
      for (let x = 14; x < endX - 1; x += 6) if (x + 6 <= 40 || x >= 66) K.prop('guardrail', x + 3, 6.6, 0, { len: 6, collide: false });
      // in front of the forecourt the rail gives way to low posts and a sagging chain (the camera sits out past them)
      for (let x = 40; x <= 66.01; x += 2.6) { K.box(x, 0.15, 6.62, 0.12, 0.62, 0.12, { tex: 'metal', color: '#9aa09e' }); if (x < 66) K.cyl(x + 1.3, 0.62, 6.62, 0.012, 2.6, { tex: 'metal', color: '#6a6e6c' }, { rz: 90, seg: 5 }); }
      K.box(40, -2.4, 12.2, 60, 2.45, 11.6, { tex: 'grass', color: '#4c5446' }, { shadow: false });
      // north side: hedge, the carpark entrance (a boom gate across a ramp going down), planters, the forecourt opening
      K.collider(14, -6.75, 44, -6.5, { h: 2.2 }); K.collider(60, -6.75, endX, -6.5, { h: 2.2 });
      K.collider(43.7, -9.3, 44, -6.5, { h: 1.2 }); K.collider(60, -9.3, 60.3, -6.5, { h: 1.2 });
      K.collider(44, -9.35, 60, -9.25, { h: 1.2 });
      for (const [x0, x1] of [[14, 22], [32.4, 44], [60, 78]]) for (let x = x0; x < x1 - 0.5; x += 2.1) K.prop('shrub', x + 1.05, -7.3, 0, { w: 2.0, h: 1.2, dead: x % 3 < 1 });
      K.box(27, -1.2, -12, 9, 1.2, 10, { tex: 'concrete', color: '#5c5a54' }, { shadow: false });
      K.prop('boom_gate', 23.2, -7.2, 90, { len: 7.5 });
      K.prop('hut', 32.9, -9.4, 0, { w: 1.6, d: 1.6, h: 2.4, text: 'PARKING' });
      K.sign('STAFF PARKING\nPERMIT HOLDERS ONLY', 27, 2.4, -7.0, 2.4, 0.7, { style: 'council', bg: '#e8e4d2' });
      K.box(25.8, 0, -7.0, 0.07, 2.0, 0.07, { tex: 'metal', color: '#8d9594' }); K.box(28.2, 0, -7.0, 0.07, 2.0, 0.07, { tex: 'metal', color: '#8d9594' });
      // the forecourt apron (walkable; its far edge is the way in)
      K.floor(44, -9.3, 60, -fp + 0.01, { tex: 'concrete', color: '#9a978e' }, { y: 0.15, skirt: false });
      K.box(52, 0.02, -19.4, 16.5, 0.12, 20, { tex: 'concrete', color: '#8e8c84' }, { shadow: false });
      for (const x of [44.6, 59.4]) K.prop('planter', x, -10.3, 0, { variant: 'box', dead: true });
      K.prop('bollard', 47.5, -8.8, 0, { variant: 'concrete' }); K.prop('bollard', 52, -8.8, 0, { variant: 'concrete' }); K.prop('bollard', 56.5, -8.8, 0, { variant: 'concrete' });
      K.box(47, 0, -21, 1.2, 3.6, 0.5, { color: '#2a2e2e', roughness: 0.6 });
      K.plane(47, 2.0, -20.74, 1.1, 1.65, monolithTex(), {});
      // the tower (south face at z −28.5)
      C5_tower(K, 32, -28.5, { haloSize: 8 });
      // the east arm's furniture
      K.prop('streetlight', 24, -fp + 0.3, 0, { bank: 3 });
      K.prop('streetlight', 40, fp - 0.3, 180, { lit: false });
      K.prop('streetlight', 56.5, -fp + 0.3, 0, { bank: 4 });
      K.prop('streetlight', 72, fp - 0.3, 180, { bank: 5, flicker: true });
      K.prop('bench_plaque', 66.5, -fp + 0.5, 0, { plaque: 'FOR EVERYONE WHO\nWORKED LATE' });
      K.prop('bin', 64.4, -fp + 0.4, 0, { variant: 'street' });
      K.box(69.6, 0.15, -5.3, 0.62, 0.9, 0.5, { color: '#1a1c1c', roughness: 0.7 }, { rot: 8, collide: true });
      K.plane(69.6, 0.72, -5.03, 0.55, 0.7, board('hiring', ['NOW HIRING', 'RETAIL', 'CONSULTANTS', 'uncapped commission!'], { w: 256, h: 320, bg: '#f4f2ea', fg: ['#b3261e', '#1d1d1d', '#1d1d1d', '#0b4f52'], size: [40, 34, 30, 22], age: 0.8 }), { rotY: 8 });
      K.prop('sign_post', 38.5, -fp + 0.5, 0, { style: 'council', text: 'REGIONAL OFFICE\nVISITORS: MAIN ENTRANCE →', bg: '#0b4f52', fg: '#ffffff', w: 1.2, h: 0.45 });
      K.dress('leaves', [14, -6.4, 78, -4.6], 50, { seed: 531, y: 0.16 });
      K.dress('leaves', [14, 4.6, 78, 6.4], 50, { seed: 532, y: 0.16 });
      K.dress('papers', [16, -4, 76, 4], 10, { seed: 533 });
      K.writing('DID YOU CHECK', 80.5, 1.2, 6.4, 1.6, { rotY: 180, world: 'fog' });
      // the east end: a drop until Chapter 6 is over; afterwards the road just goes on
      if (!RR.east()) {
        K.drop(78, -6.6, 86, 6.6, { side: 'w', msg: 'The road ends here.' });
      } else {
        K.prop('streetlight', 88, -fp + 0.3, 0, { bank: 5 });
        K.collider(96.5, -6.6, 97, 6.6, { h: 2 });
        K.exit({ id: 'c5_ringroad:hospital', box: [95, -6.6, 97, 6.6], to: 'c7_ringroad', entry: 'office', when: () => !!ROOMS.c7_ringroad, blockedMsg: 'The road goes on. [beat] Not yet.' });
        K.trigger([76, -6.6, 80, 6.6], async (G) => { await G.think('That wasn\'t there before.'); }, { id: 'c5_ringroad:before' });
      }

      // ---- exits ------------------------------------------------------------------------------------------------------
      K.exit({ id: 'c5_ringroad:park', box: [-6.6, 71.3, 6.6, 72.6], to: 'c4_park', entry: 'ring', when: () => !!ROOMS.c4_park, blockedMsg: 'The business park. [beat] I\'m not going back.' });
      K.exit({ id: 'c5_ringroad:forecourt', box: [44, -9.3, 60, -8.6], to: 'c5_forecourt', entry: 'road', sound: 'steps' });
      K.collider(-6.6, 72.55, 6.6, 72.8, { h: 2 });

      // ---- examine lines (Aidan) --------------------------------------------------------------------------------------
      K.examine(-7.9, 1.6, 52.6, ['Every price is just dashes.', 'Closed. Or free. [beat] Closed.'], { id: 'c5rr:pylon', r: 1.6 });
      K.examine(-23.6, 1.3, 41, ['"Prepaid top-ups here." Someone\'s taped a note under it.', '"No signal — don\'t ask."'], { id: 'c5rr:shop', r: 2.2 });
      K.examine(-12.2, 1.1, 38.8, ['The nozzle\'s still in the tank.', 'They were filling up and then they just... weren\'t.'], { id: 'c5rr:pumpcar', r: 1.7 });
      K.examine(-22.4, 0.9, 45.1, '"Network switch-off: what it means for you." [beat] I could have told her. I didn\'t.', { id: 'c5rr:paper', r: 1.2 });
      K.examine(0, 0.9, 6.9, ['A fountain in the middle of a roundabout. Dry.', 'There are coins in it anyway. People still made wishes.'], { id: 'c5rr:fountain', r: 1.8 });
      K.examine(3.25, 1.2, 45.9, ['Hazards on. Nobody in it.', 'There\'s a lanyard on the passenger seat. Somebody drove to work.'], { id: 'c5rr:car', r: 1.8 });
      K.examine(fp - 0.9, 1.6, 26.3, '"Regional Office." I\'ve only ever seen it in emails.', { id: 'c5rr:sign', r: 1.4 });
      K.examine(-34.5, 1.1, 0, 'The ring road just stops. [beat] Everything up here stops.', { id: 'c5rr:west', r: 2.4 });
      K.examine(52, 1.6, -8.2, ['Ten floors. One of them lit.', 'Level 4.'], { id: 'c5rr:tower', r: 2.6 });
      K.examine(27, 1.2, -6.9, ['Permit holders only.', 'I don\'t think I\'m on the list.'], { id: 'c5rr:permit', r: 1.6 });
      K.examine(69.6, 0.8, -4.9, ['"Now hiring. Retail consultants. Uncapped commission!"', 'That\'s how they got me.'], { id: 'c5rr:hiring', r: 1.4 });
      K.examine(66.5, 0.9, -5.7, '"For everyone who worked late." [beat] Somebody put a coffee cup on it. Full.', { id: 'c5rr:bench', r: 1.5 });
      K.examine(fp - 0.5, 1.4, 57.4, 'Route 44. It doesn\'t come up this far any more. Someone\'s crossed the stop out.', { id: 'c5rr:bus', r: 1.3 });
    },
    async onEnter(G) {
      if (S.chapter === 5 && G.once('c5:ringIn')) {
        await G.wait(1.6);
        await G.think('The ring road. [beat] The regional office is up here somewhere.');
      }
    },
  });

  // =================================================================================================================
  // 5A' THE FORECOURT — 32 × 22 m between the ring road (south, z 22) and the tower's south face (z 0, x −4…36): the
  // monolith sign, planters, benches, the canopy, the revolving door (x 16) → c5_lobby:doors. Low, looking up, the
  // tower is ten storeys of dark glass with one lit floor — and something tall at one of its windows.
  // =================================================================================================================
  const FC = { door: 16, figX: 19.75 };                                  // (figX: the middle of a lit bay)
  defineRoom({
    id: 'c5_forecourt', name: 'REGIONAL OFFICE FORECOURT', area: 'REGIONAL OFFICE', chapter: 5, outdoor: true, surface: 'concrete', ambient: 'wind',
    fog: { density: 0.035 },
    env: { sheets: 5 },
    bounds: [0, 1.2, 32, 22],
    entries: { road: [16, 20.8, 180], doors: [16, 3.2, 0], start: [16, 20.8, 180] },
    cameras: [
      // low from the road edge, looking up: ten floors of dark glass, one lit
      // (the pan can only dip a little: he stays low in the frame and the lit floor — and whoever stands at its
      // windows — stays in it)
      { id: 'c5_forecourt:low', vol: [8, 9, 24, 24.3], type: 'pan', pos: [16.4, 0.55, 27.2], target: [16, 11.2, 4], fov: 54, pan: { lag: 0.35, yaw: 55, pitch: 10 } },
      // across the forecourt from the monolith's side (west) and from the flagpoles (east)
      { id: 'c5_forecourt:west', vol: [0, 1.2, 8, 24.3], type: 'pan', pos: [13, 4.2, 12.5], target: [3, 0.6, 12.5], fov: 48, pan: { lag: 0.3, yaw: 75, pitch: 40 } },
      { id: 'c5_forecourt:east', vol: [24, 1.2, 32, 24.3], type: 'pan', pos: [19, 4.2, 12.5], target: [29, 0.6, 12.5], fov: 48, pan: { lag: 0.3, yaw: 75, pitch: 40 } },
      // under the canopy: the revolving door and the dark lobby behind the glass
      { id: 'c5_forecourt:door', vol: [8, 1.2, 24, 9], type: 'pan', pos: [18.2, 3.1, 12.2], target: [16, 1.1, 1.6], fov: 50, pan: { lag: 0.3, yaw: 66, pitch: 40 } },
    ],
    build(K) {
      const PAV = { tex: 'tile', color: '#8c8a82' };
      K.floor(0, 1.2, 32, 22, PAV);
      K.floor(0, 22, 32, 26, 'footpath', { y: 0.0 });
      K.box(16, -0.3, 30, 40, 0.3, 8, { tex: 'bitumen', color: '#3a3c3b' }, { shadow: false });
      // the tower
      const fig = C5_tower(K, -4, 0, { litK: 1.35, haloSize: 6, figure: [FC.figX, 0], podium: false });
      C5.towerFig = fig;
      // the podium glazing, the revolving door drum, side swing doors, the canopy with its downlights
      K.box(16, 0, 0.9, 40, 0.1, 0.4, { tex: 'concrete', color: '#4a4c48', roughness: 1 });
      K.collider(-4, 0, 36, 1.2, { h: 4 });
      for (let x = -3.5; x < 36; x += 2.5) K.box(x, 0, 1.1, 0.1, 4.6, 0.1, { tex: 'metal', color: '#8d9594' });
      K.box(16, 0, 1.12, 40, 4.6, 0.02, { color: '#0d1414', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55 });
      K.box(16, 0.0, 0.35, 34, 0.05, 1.4, { color: '#0b0d0d', roughness: 1 });
      // inside the glass: the lobby's dark shapes (security desk, gates, a plant)
      K.box(24, 0, -3.2, 5, 1.1, 1.2, { color: '#15191a', roughness: 0.7 });
      K.box(14, 0, -6, 6, 1.0, 0.3, { color: '#1a1e1e', roughness: 0.6 });
      K.light('screen', 24, 1.6, -2.4, { color: '#5fd8d0', intensity: 1.1, distance: 5, real: false });
      // the revolving door: a glass drum with four wings that turns a quarter now and then, by itself
      K.cyl(FC.door, 0, 0.7, 1.35, 2.5, { color: '#cfe0dc', roughness: 0.05, transparent: true, opacity: 0.25 }, { seg: 24, open: true, shadow: false });
      K.cyl(FC.door, 2.5, 0.7, 1.42, 0.3, { tex: 'metal', color: '#9aa3a2' }, { seg: 24 });
      K.cyl(FC.door, 0, 0.7, 1.42, 0.04, { tex: 'metal', color: '#9aa3a2' }, { seg: 24 });
      const wings = new THREE.Group(); wings.position.set(FC.door, 0.04, 0.7);
      const wm = new THREE.MeshStandardMaterial({ color: '#d8e6e2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const fm = new THREE.MeshStandardMaterial({ color: '#8d9594', roughness: 0.4, metalness: 0.6 });
      for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.02), wm); w.position.set(Math.cos(i * Math.PI / 2) * 0.66, 1.2, Math.sin(i * Math.PI / 2) * 0.66); w.rotation.y = -i * Math.PI / 2; wings.add(w); const f = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), fm); f.position.copy(w.position); f.position.y = 1.0; f.rotation.y = w.rotation.y; wings.add(f); }
      K.obj('c5:revolve', wings); K.mesh(wings);
      K.collider(FC.door - 1.45, 0.7, FC.door + 1.45, 2.1, { h: 2.6 });
      const rev = { t: 7, turn: 0, from: 0 };
      K.animate((dt) => { rev.t -= dt; if (rev.t <= 0 && rev.turn <= 0) { rev.turn = 1.6; rev.from = wings.rotation.y; rev.t = 9 + Math.random() * 9; sfx('whoosh', { pos: [FC.door, 1.2, 1], vol: 0.25 }); } if (rev.turn > 0) { rev.turn = Math.max(0, rev.turn - dt); wings.rotation.y = rev.from + (Math.PI / 2) * U.ease.inOut(1 - rev.turn / 1.6); } });
      K.interact(FC.door, 1.2, 2.3, (G) => C5_revolve(G), { id: 'c5_forecourt:revolve', r: 1.7 });
      // the swing doors either side of the drum: locked (glass leaves in aluminium frames, a push bar)
      for (const dx of [10.8, 21.2]) {
        K.box(dx, 0, 1.2, 1.9, 2.45, 0.06, { tex: 'metal', color: '#9aa3a2' });
        K.box(dx, 0.08, 1.24, 1.8, 2.3, 0.02, { color: '#1a2626', roughness: 0.05, metalness: 0.3 });
        K.box(dx, 1.05, 1.28, 1.4, 0.05, 0.05, { tex: 'metal', color: '#c9cdcb' });
        K.interact(dx, 1.2, 1.7, async (G) => { G.sfx('door_locked', { pos: [dx, 1.1, 1.3] }); await G.msg(dx > 16 ? 'Locked. A sign on the glass: "PLEASE USE THE REVOLVING DOOR."' : 'It\'s locked.'); }, { id: 'c5_forecourt:side' + Math.round(dx), r: 1.2 });
      }
      K.plane(21.2, 1.55, 1.285, 0.42, 0.28, board('revolve', ['PLEASE USE THE', 'REVOLVING DOOR'], { w: 256, h: 160, bg: '#f4f2ea', size: 26, age: 0.3 }), {});
      K.box(16, 4.3, 3.6, 16, 0.35, 5.2, { tex: 'concrete', color: '#a19e93' });
      K.box(16, 4.62, 6.12, 16, 0.5, 0.12, { color: '#0b4f52', roughness: 0.5 });
      K.plane(12, 4.87, 6.19, 4, 0.42, Tex.wordmark({ w: 4, h: 0.42, bg: null, color: BR.yellow }), {});
      K.sign('REGIONAL OFFICE', 19.5, 4.87, 6.19, 6.5, 0.4, { style: 'shop', bg: '#0b4f52', fg: '#f4f3ee' });
      for (const cx of [8.5, 23.5]) K.cyl(cx, 0, 5.8, 0.18, 4.3, { tex: 'concrete', color: '#b3ae9f' }, { collide: true });
      K.light('lamp', 16, 4.2, 4.2, { color: '#ffe0b0', intensity: 4, distance: 7, bank: 1, name: 'c5fc:canopy', flicker: true });
      for (const x of [10, 13, 19, 22]) K.cyl(x, 4.28, 3.6, 0.12, 0.02, { color: '#e8e4d8', roughness: 0.3 });
      // the monolith sign, the planters, benches, bins, flagpoles, bike rack
      { const a = 25 * D2R, s0 = Math.sin(a), c0 = Math.cos(a);
        K.box(6, 0, 16.5, 1.4, 4.2, 0.6, { color: '#2a2e2e', roughness: 0.55 }, { collide: true, rot: 25 });
        K.plane(6 + s0 * 0.31, 2.2, 16.5 + c0 * 0.31, 1.3, 1.95, monolithTex(), { rotY: 25 });
        K.plane(6 - s0 * 0.31, 2.2, 16.5 - c0 * 0.31, 1.3, 1.95, monolithTex(), { rotY: 205 }); }
      K.light('point', 6, 0.35, 17.6, { color: '#cfe8e4', intensity: 1.6, distance: 3.2, bank: 2 });
      for (const [x, z] of [[2.5, 8], [2.5, 12.5], [29.5, 8], [29.5, 12.5], [11, 13.5], [21, 13.5]]) K.prop('planter', x, z, 0, { variant: 'box', dead: true });
      K.prop('bench', 11, 16.4, 180, { len: 1.8 }); K.prop('bench', 21, 16.4, 180, { len: 1.8 });
      K.prop('bin', 25.5, 15.5, 0, { variant: 'street' });
      K.box(26.1, 0.0, 16.0, 0.3, 1.0, 0.3, { tex: 'metal', color: '#6a6e6c' }, { collide: true });
      K.prop('rubbish', 25.9, 16.6, 0, {});
      for (const fx of [27, 28.2, 29.4]) K.cyl(fx, 0, 18.8, 0.05, 8, { tex: 'metal', color: '#c2c6c4' }, { collide: true });
      for (let i = 0; i < 5; i++) K.box(3.2 + i * 0.7, 0, 19.6, 0.05, 0.8, 0.6, { tex: 'metal', color: '#9aa09e' }, { collide: i === 0 || i === 4 });
      K.box(4.6, 0.78, 19.6, 2.9, 0.05, 0.05, { tex: 'metal', color: '#9aa09e' });
      K.box(5.3, 0.1, 19.3, 1.6, 0.9, 0.05, { color: '#3a3c3e', roughness: 0.5 }, { rot: 8 });
      K.cyl(4.6, 0.45, 19.25, 0.33, 0.04, { color: '#1a1a1a', roughness: 0.7 }, { rx: 90, seg: 16 });
      K.cyl(6.0, 0.45, 19.35, 0.33, 0.04, { color: '#1a1a1a', roughness: 0.7 }, { rx: 90, seg: 16 });
      // a dry water feature along the east side, a courier's trolley left by the dock, the tenant board, a CCTV pole
      K.box(27, 0, 17.2, 7, 0.45, 1.6, { tex: 'concrete', color: '#8a8880' }, { collide: true });
      K.box(27, 0.3, 17.2, 6.6, 0.16, 1.2, { color: '#2a2c28', roughness: 0.9 });
      K.dress('leaves', [23.8, 16.6, 30.2, 17.8], 26, { seed: 543, y: 0.47 });
      K.sign('PLEASE DO NOT SIT ON\nTHE WATER FEATURE', 23.3, 0.75, 17.2, 0.6, 0.3, { style: 'council', bg: '#ffffff', fg: '#1d1d1d', rotY: -90 });
      K.box(2.4, 0, 8.6, 0.6, 1.0, 1.1, { tex: 'metal', color: '#8a8e8c' }, { collide: true, rot: 12 });
      K.prop('box_stack', 2.4, 8.6, 12, { n: 3, y: 0.25 });
      K.box(8.6, 0, 3.2, 1.1, 1.9, 0.12, { tex: 'metal', color: '#3a4040' }, { collide: true });
      K.plane(8.6, 1.3, 3.27, 1.0, 1.1, board('tenants', ['TOWER DIRECTORY', 'G  LOBBY · SECURITY', 'L2  ATRIUM · EVENTS', 'L3  TRAINING', 'L4  RETAIL REGION', 'L5–6  REFURBISHMENT', 'L7–10  FOR LEASE'], { w: 384, h: 420, bg: '#12302f', fg: ['#ffcc00', '#dfe8e6', '#dfe8e6', '#dfe8e6', '#ffffff', '#dfe8e6', '#dfe8e6'], size: [30, 22, 22, 22, 24, 22, 22], weight: 'bold', align: 'left', age: 0.5 }), {});
      K.cyl(30.4, 0, 3.2, 0.07, 5.2, { tex: 'metal', color: '#8d9594' }, { collide: true });
      K.prop('cctv_camera', 30.4, 3.2, -135, { variant: 'bullet', mount: 5.0 });
      K.sign('NO SKATEBOARDING\nNO LOITERING', 30.8, 1.6, 20.5, 0.7, 0.4, { style: 'council', bg: '#ffffff', fg: '#b3261e', rotY: -90 });
      K.prop('streetlight', 1.2, 21.3, 0, { bank: 3, light: false });
      K.prop('streetlight', 30.8, 21.3, 0, { bank: 3 });
      // west: the loading dock's roller door; east: the carpark ramp down, a closed roller door
      K.wall(0, 1.2, 0, 22.2, 3.0, { tex: 'brick', color: '#6d5b4d' }, { thick: 0.3, grime: true });
      K.wall(32, 22.2, 32, 1.2, 3.0, { tex: 'brick', color: '#6d5b4d' }, { thick: 0.3, grime: true });
      K.prop('roller_door', 0.2, 5.2, 90, { w: 3.2, h: 2.6, open: 0, color: '#6a7470' });
      K.sign('DELIVERIES — BUZZ SECURITY', 0.18, 3.2, 5.2, 2.2, 0.3, { style: 'council', bg: '#e8e4d2', rotY: 90 });
      K.prop('roller_door', 31.8, 7.2, -90, { w: 3.6, h: 2.6, open: 0, color: '#6a7470' });
      K.sign('CARPARK — PERMIT HOLDERS', 31.83, 3.1, 7.2, 2.6, 0.3, { style: 'council', bg: '#e8e4d2', rotY: -90 });
      K.interact(31.3, 1.2, 7.2, async (G) => { G.sfx('door_locked', { pos: [31.8, 1.2, 7.2] }); await G.msg('It\'s locked.'); await G.think('Permit holders only. [beat] Even the cars had to earn it.'); }, { id: 'c5_forecourt:carpark', r: 1.6 });
      K.writing('IT\'LL BE FINE', 0.18, 1.5, 13.5, 2.0, { rotY: 90, world: 'fog' });
      K.dress('leaves', [0.5, 2, 31.5, 21.5], 70, { seed: 541 });
      K.dress('papers', [4, 6, 28, 20], 10, { seed: 542 });
      // (low on the monolith's east end face: the slab stands at 25°, so that face points 115°)
      K.sticker('sticker08', 6.637, 0.3, 16.203, 115, { size: 0.06 });
      // the way back to the road
      K.exit({ id: 'c5_forecourt:road', box: [0.2, 23.4, 31.8, 24.3], to: 'c5_ringroad', entry: 'forecourt', sound: 'steps' });
      K.collider(0, 24.2, 32, 24.5, { h: 2 });
      // ---- examine lines (Aidan) --------------------------------------------------------------------------------------
      K.examine(6, 1.8, 17.4, async (G) => { await G.msg('"Regional Office — Excellence Every Day"'); await G.think('Every day.'); }, { id: 'c5fc:monolith', r: 1.6 });
      K.examine(11, 0.9, 15.8, 'A bench nobody sits on. It\'s facing the car park.', { id: 'c5fc:bench', r: 1.4 });
      K.examine(28.2, 1.4, 18.3, ['Three flagpoles. No flags.', 'The ropes keep tapping the poles. Like someone at a window.'], { id: 'c5fc:flags', r: 1.8 });
      K.examine(4.6, 0.8, 19.3, 'A bike still locked to the rack. Both tyres flat.', { id: 'c5fc:bike', r: 1.4 });
      K.examine(25.8, 1.1, 15.8, 'The smokers\' bin. This is where everyone stood to get away from their desks.', { id: 'c5fc:butts', r: 1.2 });
      K.examine(2.5, 1.0, 10.3, 'Planters full of something that died a long time ago.', { id: 'c5fc:planter', r: 1.6 });
      K.examine(0.5, 1.4, 5.2, ['"Deliveries — buzz security."', 'I don\'t think anyone\'s answering.'], { id: 'c5fc:dock', r: 1.8 });
      K.examine(8.6, 1.3, 3.8, ['Level 4. Retail Region.', 'Levels 5 and 6: refurbishment. Seven to ten: for lease. [beat] A whole tower for one floor of people.'], { id: 'c5fc:tenants', r: 1.2 });
      K.examine(27, 0.8, 16.3, 'A water feature with no water. "Please do not sit." Nobody has, for a long time.', { id: 'c5fc:water', r: 1.6 });
      K.examine(2.4, 1.1, 9.4, 'A courier\'s trolley. The boxes are addressed to Level 4. Signed for by nobody.', { id: 'c5fc:trolley', r: 1.4 });
      K.examine(16, 1.6, 12.8, async (G) => {
        await G.think('Level 4. The only floor with the lights on.');
        if (C5.towerFig && C5.towerFig.visible) { await G.beat(); await G.think('Somebody\'s standing at the window. [beat] Tall.'); }
      }, { id: 'c5fc:look', r: 2.4 });
    },
    onUpdate() {
      // the figure at the window: seen from the low camera, gone the next time it cuts back
      const f = C5.towerFig; if (!f || !f.parent) return;
      const cam = (typeof Cam !== 'undefined' && Cam.current) ? Cam.current.id : null;
      if (cam !== C5.lastCam) { if (C5.lastCam === 'c5_forecourt:low' && f.visible) C5.figSeen = true; else if (C5.figSeen && cam === 'c5_forecourt:low') f.visible = false; C5.lastCam = cam; }
      if (flag('c5_chase')) f.visible = false;
    },
    async onEnter(G) {
      C5.lastCam = null; C5.figSeen = false;
      if (S.chapter === 5 && G.once('c5:forecourtIn')) {
        await G.wait(1.4);
        await G.think('Ten floors. [beat] Only one of them lit.');
      }
    },
    onLeave() { C5.towerFig = null; },
  });
  // the revolving door: a push, a quarter turn, the lobby
  async function C5_revolve(G) {
    const w = G.obj('c5:revolve');
    G.sfx('whoosh', { pos: [FC.door, 1.2, 1], vol: 0.5 });
    if (w) { const from = w.rotation.y; let t = 0; await G.loop((dt) => { t += dt / 0.9; w.rotation.y = from + (Math.PI / 2) * U.ease.inOut(Math.min(1, t)); return t >= 1; }); }
    await G.goto('c5_lobby', 'doors', { sound: 'door', style: 'glass' });
  }


  // =================================================================================================================
  // 5B THE LOBBY — 24 × 16 m, 5 m ceiling. South: the glass facade and the revolving door (x 12). The speed-gate line
  // across z 7 (four glass gates, x 9.4–13.2; one opens for a printed visitor pass). South of it: the security desk
  // (east, the visitor-pass printer, first aid kit), the rankings screen, the Directory (west wall, map_office), the
  // payphone, seating. North of it: the dead lifts, Stairwell A's door (NE → c5_stairs:ground), a planted bed (west).
  // =================================================================================================================
  const LB = { H: 5.0, gateZ: 7.0, desk: [19.9, 10.6], printer: [18.6, 10.5], lane: 3, stairX: 21.9, lifts: [13.0, 15.7] };
  const GATES = [9.52, 10.36, 11.2, 12.04, 12.88];
  const rankTex = () => ctex('rankwall', 512, 256, (x, w, h, r) => {
    x.fillStyle = '#0d2e30'; x.fillRect(0, 0, w, h);
    Tex.drawWordmark(x, 30, 90, 56, { color: BR.yellow });
    tx(x, 'REGIONAL OFFICE', 30, 150, 34, '#e8f2f0', { weight: 'bold', spacing: 3 });
    tx(x, 'Excellence Every Day', 30, 200, 28, '#8fcfc8', { font: FN.serif });
    age(x, w, h, r, 0.3);
  });
  const directoryTex = () => ctex('directory', 512, 640, (x, w, h, r) => {
    x.fillStyle = '#16302f'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 70);
    tx(x, 'BUILDING DIRECTORY', w / 2, 48, 30, '#ffffff', { weight: 'bold', align: 'center', spacing: 2 });
    const rows = [['10', 'FOR LEASE'], ['9', 'FOR LEASE'], ['8', 'FOR LEASE'], ['7', 'FOR LEASE'], ['6', 'REFURBISHMENT'], ['5', 'REFURBISHMENT'], ['4', 'RETAIL REGION · ESCALATIONS'], ['3', 'TRAINING'], ['2', 'ATRIUM · EVENTS'], ['G', 'LOBBY · SECURITY']];
    rows.forEach(([n, t], i) => {
      const y = 110 + i * 52;
      x.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'; x.fillRect(16, y - 34, w - 32, 46);
      tx(x, n, 44, y, 28, n === '4' ? BR.yellow : '#9fc8c4', { font: FN.heavy, weight: '900', align: 'center' });
      tx(x, t, 90, y, 22, n === '4' ? '#ffffff' : '#c8dcda', { weight: 'bold' });
    });
    tx(x, 'Take a directory ↓', w / 2, h - 20, 20, '#8fcfc8', { font: FN.serif, align: 'center' });
    age(x, w, h, r, 0.4);
  });
  defineRoom({
    id: 'c5_lobby', name: 'REGIONAL OFFICE LOBBY', area: 'REGIONAL OFFICE', chapter: 5, outdoor: false, surface: 'tile', ambient: 'office',
    fog: { density: 0.03, color: '#39423f' },
    surfaces: [{ box: [0, 12.2, 24, 16], s: 'tile' }, { box: [4.9, 0, 24, 6.3], s: 'carpet' }],
    bounds: [0, 0, 24, 16],
    entries: { doors: [12, 13.3, 180], stairs: [LB.stairX, 1.1, 0], start: [12, 13.3, 180] },
    cameras: [
      // from the lifts, back through the gates to the glass: he comes in out of the fog, a shape against the white
      { id: 'c5_lobby:entry', vol: [0, 11.4, 24, 16], type: 'pan', pos: [12.4, 4.2, 3.6], target: [12, 0.9, 14.2], fov: 50, pan: { lag: 0.3, yaw: 70, pitch: 34 } },
      // wide over the hall from the south-west corner, high: the rankings screen, the Directory, the gates beyond
      { id: 'c5_lobby:hall', vol: [0, 7.4, 15.5, 11.4], type: 'pan', pos: [1.2, 4.5, 15.4], target: [9, 0.6, 8.6], fov: 48, pan: { lag: 0.3, yaw: 70, pitch: 44 } },
      // the security desk, side on
      { id: 'c5_lobby:desk', vol: [15.5, 7.4, 24, 11.4], type: 'static', pos: [9.4, 3.1, 13.2], target: [20.5, 0.6, 9.0], fov: 'fit' },
      // high over the turnstiles: through the gates to the dead lifts and Stairwell A's door (NE)
      { id: 'c5_lobby:gates', vol: [11, 0, 24, 7.4], type: 'pan', pos: [10.2, 4.55, 10.6], target: [18.5, 0.6, 1.8], fov: 50, pan: { lag: 0.3, yaw: 50, pitch: 46 } },
      // the CCTV dome over the gate line: back along the north wall to the photo wall and the dead garden
      { id: 'c5_lobby:cctv', vol: [5.4, 0, 11, 7.4], type: 'static', pos: [16.4, 4.55, 6.7], target: [7.6, 0.5, 2.8], fov: 'fit' },
    ],
    build(K) {
      const H = LB.H, TILE = { tex: 'tile', color: '#b1ada2' };
      K.floor(0, 0, 24, 16, TILE);
      K.floor(4.9, 0, 24, 6.3, { tex: 'carpet', color: '#3e4a4a' }, { y: 0.005 });
      K.ceiling(0, 0, 24, 16, H, { tex: 'ceiling_tile', color: '#8e8f88' });
      // south: the glass facade (the forecourt's fog pressing on it), the revolving door
      K.wall(-0.1, 16, 24.1, 16, H, 'plaster', { openings: [{ at: 12.1, w: 3.0, h: 2.7 }, { at: 5.2, w: 9.2, h: 4.5, sill: 0.1, glass: true }, { at: 19.0, w: 9.2, h: 4.5, sill: 0.1, glass: true }], skirting: true });
      K.plane(12, H / 2, 17.4, 30, H + 1, { color: '#6d7a76', roughness: 1, emissive: '#7d8a86', emissiveIntensity: 0.55 }, { rotY: 180 });
      K.light('street', 12, 4.6, 19.5, { real: false, haloSize: 5, haloOpacity: 0.3 });
      K.cyl(12, 0, 15.8, 1.35, 2.55, { color: '#cfe0dc', roughness: 0.05, transparent: true, opacity: 0.22 }, { seg: 24, open: true, shadow: false });
      K.cyl(12, 2.55, 15.8, 1.42, 0.3, { tex: 'metal', color: '#9aa3a2' }, { seg: 24 });
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; K.box(12 + Math.cos(a) * 0.66, 0.04, 15.8 + Math.sin(a) * 0.66, 1.3, 2.45, 0.02, { color: '#d8e6e2', roughness: 0.05, transparent: true, opacity: 0.3 }, { rot: -a / D2R, shadow: false }); }
      K.collider(10.55, 14.6, 13.45, 17, { h: 3 });
      K.interact(12, 1.3, 14.2, async (G) => { G.sfx('whoosh', { pos: [12, 1.2, 15.6], vol: 0.5 }); await G.goto('c5_forecourt', 'doors', { sound: 'door', style: 'glass' }); }, { id: 'c5_lobby:revolve', r: 1.3 });
      // west / east / north walls
      K.wall(0, 16.1, 0, -0.1, H, { tex: 'plaster', color: '#b9b4a6' }, { skirting: true, grime: true });
      K.wall(24, -0.1, 24, 16.1, H, { tex: 'plaster', color: '#b9b4a6' }, { skirting: true, grime: true });
      K.wall(24.1, 0, -0.1, 0, H, { tex: 'plaster', color: '#a9a498' }, { openings: [{ at: 24.1 - LB.stairX, w: 1.0, h: 2.15 }, { at: 24.1 - LB.lifts[0], w: 1.3, h: 2.3 }, { at: 24.1 - LB.lifts[1], w: 1.3, h: 2.3 }], skirting: true });
      // ---- the gate line --------------------------------------------------------------------------------------
      const glassM = { color: '#cfe0dc', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 };
      for (const [x0, x1] of [[0, 9.4], [13.0, 24]]) {
        K.box((x0 + x1) / 2, 0, LB.gateZ, x1 - x0, 1.15, 0.03, glassM, { collide: true, shadow: false });
        K.box((x0 + x1) / 2, 1.15, LB.gateZ, x1 - x0, 0.04, 0.07, { tex: 'metal', color: '#c9cdcb' });
      }
      GATES.forEach((x, i) => K.prop('turnstile', x, LB.gateZ, 0, { variant: 'glass', open: i === LB.lane && flag('c5_pass') ? 1 : 0, name: i < 4 ? 'c5_gate' + i : undefined, collide: i < 4 ? undefined : true, block: i < 4 }));
      K.sign('PLEASE TAP YOUR PASS', 11.2, 2.4, LB.gateZ, 3.4, 0.28, { style: 'shop', bg: '#0b4f52', fg: '#ffffff', double: true });
      K.box(11.2, 1.1, LB.gateZ, 0.05, 1.3, 0.05, { tex: 'metal', color: '#9aa09e' });
      // ---- the security desk ------------------------------------------------------------------------------------
      K.prop('counter', LB.desk[0], LB.desk[1], 0, { len: 5.0, variant: 'security', clutter: true });
      K.prop('printer', LB.printer[0], LB.desk[1] - 0.05, 20, { y: 1.0, variant: 'visitor', text: flag('c5_pass') ? '' : 'VISITOR', name: 'c5_passprinter' });
      K.prop('visitor_book', 20.4, LB.desk[1] + 0.05, -10, { y: 1.0 });
      K.prop('monitor', 21.6, LB.desk[1] - 0.2, 190, { y: 1.0, content: 'cctv', light: false });
      K.prop('desk_phone', 22.3, LB.desk[1] - 0.05, 170, { y: 1.0 });
      K.prop('coffee_cup', 19.3, LB.desk[1] - 0.2, 0, { y: 1.0 });
      K.prop('office_chair', 20.6, 9.3, 175, {});
      K.box(20.6, 0.55, 9.05, 0.5, 0.45, 0.06, { color: '#d6a21a', roughness: 0.8 }, { rot: 5 });
      K.box(20.6, 0.5, 9.1, 0.44, 0.08, 0.35, { color: '#c8c8c0', roughness: 0.8 }, { rot: 5 });
      K.sign('ALL VISITORS\nPLEASE SIGN IN', 17.6, 1.22, LB.desk[1] + 0.3, 0.46, 0.3, { style: 'council', bg: '#f4f2ea', fg: '#0b4f52' });
      K.pickup('first_aid', 22.25, 1.02, LB.desk[1] + 0.1, { id: 'c5_lobby:firstaid', rot: -12, glint: true });
      K.plane(23.93, 2.8, 10.4, 4.2, 2.1, rankTex(), { rotY: -90 });
      K.light('lamp', 23.2, 3.8, 10.4, { color: '#dff0ee', intensity: 2.2, distance: 5, bank: 2, name: 'c5lb:wall' });
      K.prop('cctv_bank', 22.6, 8.1, -90, { light: false });
      K.interact(LB.printer[0], 1.15, LB.desk[1] + 0.35, (G) => C5_visitorPass(G), { id: 'c5_lobby:printer', r: 1.1 });
      // ---- the rankings screen, the Directory, the payphone, the lost property box, seating ---------------------
      K.prop('rankings_screen', 6.6, 11.6, 25, { name: 'c5_rankings' });
      K.light('screen', 6.9, 1.3, 12.2, { color: '#5fd8d0', intensity: 1.4, distance: 4, bank: 1 });
      K.plane(0.07, 2.2, 9.6, 1.4, 1.75, directoryTex(), { rotY: 90 });
      K.box(0.05, 1.3, 9.6, 0.06, 1.95, 1.5, { tex: 'metal', color: '#3a4040' });
      K.box(0.18, 0.95, 9.6, 0.18, 0.28, 0.5, { color: '#b9bdbb', roughness: 0.3, transparent: true, opacity: 0.6 });
      K.pickup('map_office', 0.2, 1.08, 9.6, { id: 'c5_lobby:map', rot: 90, glint: true });
      K.payphone(0.08, 13.4, 90, { wall: true, id: 'c5_lobby:payphone' });
      K.prop('couch', 3.1, 14.8, 180, { variant: 'vinyl', color: '#2e3a3a', len: 2.2 });
      K.prop('couch', 8.4, 14.8, 180, { variant: 'vinyl', color: '#2e3a3a', len: 2.2 });
      K.box(5.7, 0, 13.6, 1.2, 0.42, 0.6, { tex: 'wood', color: '#4a3a2a' }, { collide: true });
      K.dress('papers', [5.2, 13.35, 6.2, 13.85], 4, { seed: 551, y: 0.43 });
      K.box(3.1, 0.45, 14.75, 0.18, 0.01, 0.25, { color: '#111416', roughness: 0.3 }, { rot: 20 });
      K.plane(3.1, 0.462, 14.75, 0.15, 0.22, { color: '#2f6a6a', roughness: 0.3, emissive: '#2f8a8a', emissiveIntensity: 0.6 }, { rot: [-90, 0, 20] });
      K.box(15.2, 0, 14.6, 0.6, 0.45, 0.45, { tex: 'cardboard', color: '#a08a60' }, { collide: true });
      K.sign('LOST PROPERTY', 15.2, 0.33, 14.37, 0.5, 0.12, { style: 'council', bg: '#f4f2ea', rotY: 180 });
      K.cyl(15.05, 0.45, 14.6, 0.02, 0.8, { color: '#1a1a2a', roughness: 0.6 }, { rz: 70 });
      K.box(15.3, 0.45, 14.5, 0.12, 0.1, 0.26, { color: '#6a4a3a', roughness: 0.8 }, { rot: 30 });
      for (const [x, z] of [[1.0, 11.8], [23.1, 14.8], [16.6, 14.9]]) K.prop('plant_pot', x, z, 0, { variant: x < 2 ? 'fiddle' : 'palm' });
      K.prop('water_cooler', 14.4, 11.9, 0, {});
      K.prop('exit_sign', 12, 15.9, 180, { mount: 3.0 });
      K.writing('ASK THEM', 23.92, 1.4, 3.2, 1.3, { rotY: -90, world: 'fog' });
      K.box(10.6, 0.002, 8.8, 0.3, 0.004, 0.06, { color: '#0f7a77', roughness: 0.7 }, { rot: 30 });
      K.box(10.75, 0.004, 8.7, 0.08, 0.005, 0.11, { color: '#e8e8e0', roughness: 0.5 }, { rot: 30 });
      // ---- north of the gates: the lift lobby, the planted bed, Stairwell A --------------------------------------
      for (const x of LB.lifts) K.prop('lift_doors', x, 0.02, 0, { floor: 'G', sign: 'OUT OF SERVICE', w: 1.1 });
      K.box(5.2, 0, 3.45, 0.4, 0.55, 6.9, { tex: 'concrete', color: '#8a8880' }, { collide: true });
      K.box(2.5, 0, 3.45, 5.0, 0.5, 6.9, { tex: 'dirt', color: '#3e3a30' }, { collide: true });
      for (const [x, z] of [[1.5, 1.2], [3.2, 2.8], [1.4, 4.6], [3.0, 5.8]]) K.prop('shrub', x, z, 0, { w: 1.4, h: 1.2, dead: true, collide: false, y: 0.5 });
      K.prop('photo_wall', 9.6, 0.06, 0, { n: 8, title: 'TOP PERFORMERS — REGION', subject: 'blank' });
      K.light('lamp', 9.6, 3.1, 0.6, { color: '#e6dcc4', intensity: 1.8, distance: 5.5, bank: 2, name: 'c5lb:photos' });
      K.prop('couch', 8.4, 3.4, 90, { variant: 'vinyl', color: '#2e3a3a', len: 2.0 });
      K.box(10.2, 0, 3.4, 0.7, 0.4, 1.2, { tex: 'wood', color: '#4a3a2a' }, { collide: true });
      K.prop('mug', 10.1, 3.2, 20, { y: 0.4, text: 'WORLD\'S OKAYEST MANAGER' });
      K.door({ id: 'c5_lobby:stairs', x: LB.stairX, z: 0, rot: 0, w: 1.0, style: 'fire', to: 'c5_stairs', entry: 'ground', sign: 'STAIRS A — LEVELS 2–4' });
      K.prop('exit_sign', LB.stairX, 0.08, 0, { mount: 2.5, text: 'STAIRS' });
      K.sign('LEVEL 4 — RETAIL REGION · ESCALATIONS\nPLEASE USE STAIRS A', 18.2, 3.0, 0.09, 3.4, 0.5, { style: 'office', bg: '#0b4f52', fg: '#ffffff' });
      K.prop('extinguisher', 23.9, 1.8, -90, { variant: 'wall' });
      // light: the lobby's downlights are dead; a tube over the gates flickers; the desk lamp; the screens
      K.prop('fluoro_tube', 11.2, 7.0, 90, { h: H - 0.05, variant: 'troffer', bank: 1, flicker: true });
      K.prop('fluoro_tube', 18, 3.0, 90, { h: H - 0.05, variant: 'troffer', bank: 2 });
      for (const [x, z] of [[5, 11], [11, 11], [17, 13.5], [6, 3]]) K.prop('fluoro_tube', x, z, 90, { h: H - 0.05, variant: 'troffer', lit: false });
      K.prop('desk_lamp', 22.9, LB.desk[1] - 0.25, -120, { y: 1.0, lit: true, bank: 2 });
      K.light('led', LB.stairX + 0.7, 1.25, 0.1, { color: '#2aff5a' });
      // ---- examine lines (Aidan) --------------------------------------------------------------------------------
      K.examine(6.6, 1.3, 12.3, async (G) => { await G.think('Store rankings, scrolling. Every name blurred except one. CHLOE, at the top.'); await G.think('She\'s always at the top.'); }, { id: 'c5lb:rankings', r: 1.5 });
      K.interact(LB.lifts[0] + 0.9, 1.1, 0.5, async (G) => { G.sfx('click', { pos: [LB.lifts[0] + 0.9, 1.1, 0.1] }); await G.msg('"OUT OF SERVICE"'); await G.think('Stairs, then.'); }, { id: 'c5lb:lift1', r: 0.9 });
      K.interact(LB.lifts[1] + 0.9, 1.1, 0.5, async (G) => { G.sfx('click', { pos: [LB.lifts[1] + 0.9, 1.1, 0.1] }); await G.msg('"OUT OF SERVICE"'); await G.think('Stairs, then.'); }, { id: 'c5lb:lift2', r: 0.9 });
      K.interact(11.2, 1.0, 7.9, async (G) => {
        if (flag('c5_pass')) { await G.think('Lane four\'s open. It\'s waiting for me.'); return; }
        G.sfx('error', { pos: [11.2, 1.0, 7.0], vol: 0.5 });
        await G.msg('The gates need a pass.');
      }, { id: 'c5lb:gates', r: 1.6 });
      K.examine(20.4, 1.2, LB.desk[1] + 0.45, ['The visitor book. Every line says the same thing.', '"VISITOR." Time in: blank. Time out: blank.'], { id: 'c5lb:book', r: 1.0 });
      K.examine(20.6, 0.9, 9.1, 'A hi-vis vest folded on the guard\'s chair. The coffee next to it\'s still got a skin on it.', { id: 'c5lb:guard', r: 1.2 });
      K.examine(22.6, 1.4, 8.4, ['The CCTV. Every camera\'s on a floor with nobody on it.', 'Level 4\'s the only one with the lights on.'], { id: 'c5lb:cctv', r: 1.3 });
      K.examine(9.6, 1.6, 0.5, ['"Top Performers — Region." Eight frames.', 'Every face has faded to white. Except the name under them. Chloe. Chloe. Chloe.'], { id: 'c5lb:wall', r: 1.8 });
      K.examine(15.2, 0.6, 14.3, 'Lost property. An umbrella, one shoe, a phone charger. Nobody came back for any of it.', { id: 'c5lb:lost', r: 1.2 });
      K.examine(3.1, 0.7, 14.3, 'A tablet left charging on the couch. Eleven per cent.', { id: 'c5lb:tablet', r: 1.3 });
      K.examine(18.8, 1.6, 15.4, 'The fog\'s right up against the glass. Like it\'s trying to see in.', { id: 'c5lb:glass', r: 1.3 });
      K.examine(2.2, 1.0, 6.6, 'A garden bed. Everything in it died waiting for someone to water it.', { id: 'c5lb:bed', r: 1.3 });
      K.examine(10.15, 0.6, 3.2, 'A mug on the coffee table. "World\'s Okayest Manager."', { id: 'c5lb:mug', r: 1.1 });
      K.examine(10.7, 0.3, 8.8, 'A lanyard on the floor by the gates. The card\'s blank.', { id: 'c5lb:lanyard', r: 0.9 });
    },
    onUpdate() { C5_ambient(['#5a6663', 0.42], ['#1f6f6a', 0.06]); },
    onLeave() { C5_ambientOff(); },
    async onEnter(G, from) {
      if (S.chapter === 5 && G.once('c5:lobbyIn')) {
        await G.wait(1.2);
        await G.think('Somebody left the lights on for me. [beat] Some of them.');
        note(G, 'The regional office. Level 4 — the escalations office.', 'c5_goal');
      }
    },
  });
  // the security desk's visitor-pass printer: it prints his name and opens a gate
  async function C5_visitorPass(G) {
    if (flag('c5_pass')) { await G.think('It\'s already printed. [beat] It knew my name.'); return; }
    const A = G.aidan;
    await A.turn([LB.printer[0], LB.desk[1]], 0.3);
    G.sfx('keybeep', { pos: [LB.printer[0], 1.1, LB.desk[1]], vol: 0.6 });
    await G.wait(0.4);
    G.sfx('printer', { pos: [LB.printer[0], 1.1, LB.desk[1]], vol: 0.9 });
    await G.wait(1.3);
    await G.msg('"AIDAN — VISITING: ESCALATIONS"');
    G.set('c5_pass', true);
    G.give('visitor_pass');
    // lane four's glass flaps swing open
    const gate = G.obj('c5_gate' + LB.lane);
    G.sfx('turnstile', { pos: [GATES[LB.lane], 1.0, LB.gateZ], vol: 0.8 });
    if (gate && gate.userData.setOpen) { let t = 0; await G.loop((dt) => { t += dt / 0.8; gate.userData.setOpen(Math.min(1, t)); return t >= 1; }); gate.userData.setOpen(1); }
    await G.think('I didn\'t type anything.');
    note(G, 'Stairwell A, behind the gates. Level 4.', 'c5_goal');
  }


  // =================================================================================================================
  // 5C STAIRWELL A — ground → Level 4. Inside 4.6 × 6.6 m; a 2 m void down the middle. Every floor (3.6 m) is two
  // flights: the west flight climbs north from the south landing to the north mid-landing, the east flight climbs
  // south to the next south landing. Doors on the south wall: G (→ lobby), L2, L3 (locked), L4 (→ Level 4).
  // The flights of different floors share their XZ footprint; Kit floors are 2D, so C5_stairFloors() keeps the floor
  // regions of the level nearest Aidan's feet last in the list (they win in Kit.floorAt). Level-bound interactables
  // use when() on Aidan's height.
  // =================================================================================================================
  const ST = { W: 4.6, D: 6.6, FH: 3.6, fw: 1.3, v0: 1.3, v1: 3.3, sz: 5.1, nz: 1.5, top: 10.8, roof: 14.4, doorX: 2.3 };
  const stY = (k) => k * ST.FH;
  // the Standard's path up the stairwell (x, y, z), ground landing → Level 4 landing
  const ST_ROUTE = (() => {
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const y = stY(k);
      pts.push([2.3, y, 5.85], [0.65, y, ST.sz - 0.05], [0.65, y + 1.8, ST.nz + 0.05], [2.3, y + 1.8, 0.75], [3.95, y + 1.8, ST.nz + 0.05], [3.95, y + 3.6, ST.sz - 0.05]);
    }
    pts.push([2.3, ST.top, 5.85]);
    const seg = [];
    let L = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seg.push({ a, b, l, s0: L }); L += l; }
    return { pts, seg, len: L };
  })();
  function C5_routeAt(s) {
    s = clamp(s, 0, ST_ROUTE.len);
    for (const g of ST_ROUTE.seg) if (s <= g.s0 + g.l + 1e-6) { const t = g.l ? (s - g.s0) / g.l : 0; return { x: lerp(g.a[0], g.b[0], t), y: lerp(g.a[1], g.b[1], t), z: lerp(g.a[2], g.b[2], t), dx: g.b[0] - g.a[0], dz: g.b[2] - g.a[2] }; }
    const g = ST_ROUTE.seg[ST_ROUTE.seg.length - 1];
    return { x: g.b[0], y: g.b[1], z: g.b[2], dx: g.b[0] - g.a[0], dz: g.b[2] - g.a[2] };
  }
  // Aidan's position projected onto the route (height weighted so a flight above never wins)
  function C5_routeProject(p) {
    let best = Infinity, bs = 0;
    for (const g of ST_ROUTE.seg) {
      const ax = g.a[0], ay = g.a[1], az = g.a[2], bx = g.b[0] - ax, by = g.b[1] - ay, bz = g.b[2] - az;
      const L2 = bx * bx + by * by + bz * bz || 1;
      const t = clamp(((p.x - ax) * bx + (p.y - ay) * by + (p.z - az) * bz) / L2, 0, 1);
      const dx = p.x - (ax + bx * t), dy = (p.y - (ay + by * t)) * 2.5, dz = p.z - (az + bz * t);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bs = g.s0 + t * g.l; }
    }
    return bs;
  }
  // the stairwell's stacked floors: the level nearest Aidan's feet wins
  function C5_stairFloors(force) {
    const b = World.build;
    if (!b || !b.def || b.def.id !== 'c5_stairs' || !Player.pos) return;
    const y = Player.pos.y;
    if (!force && C5.stairY !== undefined && Math.abs(C5.stairY - y) < 0.04) return;
    C5.stairY = y;
    const fl = b.floors, rest = [], tagged = [];
    for (const f of fl) (f.c5lv ? tagged : rest).push(f);
    const d = (f) => (y < f.c5lv[0] ? f.c5lv[0] - y : y > f.c5lv[1] ? y - f.c5lv[1] : 0);
    tagged.sort((a, c) => d(c) - d(a));
    fl.length = 0;
    for (const f of rest) fl.push(f);
    for (const f of tagged) fl.push(f);
  }
  const C5_stairLevel = () => (Player.pos ? Math.round(Player.pos.y / ST.FH) : 0);
  const levelTex = (t) => ctex('lev' + t, 128, 160, (x, w, h, r) => {
    x.clearRect(0, 0, w, h);
    tx(x, t, w / 2, h * 0.82, t.length > 1 ? 80 : 128, '#1f4a4a', { font: FN.heavy, weight: '900', align: 'center' });
    age(x, w, h, r, 0.4);
  });
  const stairPosterTex = () => ctex('stairposter', 256, 360, (x, w, h, r) => {
    x.fillStyle = '#f2efe4'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 70);
    tx(x, 'TAKE THE', w / 2, 32, 26, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'STAIRS!', w / 2, 62, 30, BR.yellow, { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, '10,000 steps a day', w / 2, 118, 20, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'keeps the sick days away :)', w / 2, 146, 16, '#1d1d1d', { font: FN.serif, align: 'center' });
    x.strokeStyle = '#0b4f52'; x.lineWidth = 6; x.beginPath(); for (let i = 0; i < 6; i++) { x.lineTo(40 + i * 30, 300 - i * 22); x.lineTo(70 + i * 30, 300 - i * 22); } x.stroke();
    tx(x, 'WELLNESS WEEK — PEOPLE & CULTURE', w / 2, h - 16, 11, '#555', { align: 'center' });
    age(x, w, h, r, 0.9, { sun: 0.2 });
  });

  // ---- the Standard on the stairs: a custom type built on the engine's Standard (look, form, mirror, name card) that
  //      walks the stairwell's route itself (its heights come from the route, not the floor regions) ----------------
  const STD_T = () => Enemies.types.standard;
  function C5_climberUpdate(e, dt, ai) {
    const D = e.data, a = e.actor;
    if (D.later) { for (const L of D.later) { L.t -= dt; if (L.t <= 0 && !L.done) { L.done = true; sfx('keys_far', { pos: L.pos, vol: L.vol }); } } if (D.later.every((L) => L.done)) D.later = null; }
    try { STD_T().update(e, dt, false); } catch (err) { /* form / mirror / name card only */ }
    D.vanished = true;                                            // (keeps the engine's own AI and keys loop out of it)
    const keysOn = !e.hidden && !D.gone && !e.removed;
    try { Snd.loop('standard_keys', keysOn, { id: 'c5:climbkeys', pos: [e.pos.x, e.pos.y + 1.4, e.pos.z], vol: 0.7 }); } catch (err) { /* audio */ }
    if (D.c5contact) { C5_climberContact(e, dt); return; }
    if (D.gone) {
      D.goneT -= dt;
      if (D.goneT <= 0 && ai) {
        // back: from whichever end of the stairwell Aidan is furthest from
        const sA = C5_routeProject(Player.pos);
        D.s = sA > ST_ROUTE.len / 2 ? 0 : ST_ROUTE.len;
        D.gone = false; Enemies.visible(e, true); e.noBody = false; a.setOpacity(1);
        C5_climberPlace(e, 0);
      }
      return;
    }
    if (D.scripted) return;
    if (!ai || World.room !== 'c5_stairs') { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 }); return; }
    const sA = C5_routeProject(Player.pos);
    D.sA = sA;
    const gap = sA - D.s;
    let moved = 0;
    if (Math.abs(gap) > 0.95) { const st = Math.min(Math.abs(gap) - 0.95, 1.1 * dt) * Math.sign(gap); D.s = clamp(D.s + st, 0, ST_ROUTE.len); moved = Math.abs(st); D.dir = Math.sign(gap); }
    C5_climberPlace(e, dt);
    a.setAnim(moved > 1e-4 ? 'walk' : 'idle', { blend: 0.4 });
    // its gaze: Aidan within a flight or so of it and in front
    if (Math.abs(gap) < 7.5) Player.setGaze(1);
    const d3 = Math.hypot(Player.pos.x - e.pos.x, (Player.pos.y - e.pos.y) * 1.5, Player.pos.z - e.pos.z);
    if (d3 < 1.35 && Math.abs(gap) < 1.6 && Player.mode === 'normal' && !Player.dead && (D.lastContact === undefined || D.t - D.lastContact > 5)) C5_climberStartContact(e);
    D.t = (D.t || 0) + dt;
  }
  function C5_climberPlace(e, dt) {
    const D = e.data, p = C5_routeAt(D.s);
    e.pos.set(p.x, p.y, p.z);
    let yaw = Math.atan2(p.dx * (D.dir || 1), p.dz * (D.dir || 1));
    if (Math.abs(p.dx) + Math.abs(p.dz) < 1e-4) yaw = e.yaw;
    e.yaw = dt > 0 ? U.wrapAngle(e.yaw + clamp(U.angleDiff(e.yaw, yaw), -3 * dt, 3 * dt)) : yaw;
  }
  // "Got a sec?" — a long hand on his shoulder, all sound drains away, 40 damage; it's gone for 45 s, keys fading
  function C5_climberStartContact(e) {
    const D = e.data, a = e.actor;
    D.c5contact = { t: 0 }; D.lastContact = D.t || 0;
    e.yaw = Math.atan2(Player.pos.x - e.pos.x, Player.pos.z - e.pos.z);
    a.setAnim('idle', { blend: 0.3 });
    a.gesture('hand_on_shoulder', { hand: 'L', target: Player.actor, dur: 3.2 });
    Player.lock('c5climb', true);
    try { Player.face(U.deg(Math.atan2(e.pos.x - Player.pos.x, e.pos.z - Player.pos.z))); } catch (err) { /* player */ }
    try { Snd.duck(1, 3); } catch (err) { /* audio */ }
    sfx('keys', { pos: [e.pos.x, e.pos.y + 1.4, e.pos.z], vol: 0.5 });
  }
  function C5_climberContact(e, dt) {
    const C = e.data.c5contact, a = e.actor;
    C.t += dt;
    if (C.t > 0.8 && !C.said) { C.said = true; Enemies.say('Got a sec?', 'quiet', 2.2); }
    if (C.t > 1.3 && !C.hit) { C.hit = true; if (!Player.dead) Player.damage(40, e, { force: true }); }
    if (C.t > 2.4 && !C.sigh) { C.sigh = true; sfx('sigh', { pos: [e.pos.x, e.pos.y + 2.6, e.pos.z] }); }
    if (C.t > 3.0 && !C.gone) {
      C.gone = true; Player.lock('c5climb', false); a.finishGestures();
      e.data.later = [0, 1, 2, 3].map((i) => ({ t: 0.2 + i * 0.9, pos: [e.pos.x, e.pos.y - 2 - i * 2, e.pos.z + (i % 2 ? 2 : -2)], vol: 0.8 - i * 0.18 }));
    }
    if (C.gone) {
      C.fade = (C.fade || 0) + dt;
      a.setOpacity(1 - clamp(C.fade / 1.2));
      if (C.fade >= 1.2) { e.data.c5contact = null; e.data.gone = true; e.data.goneT = 45; Enemies.visible(e, false); e.noBody = true; }
    }
  }
  Enemies.defineType('c5_climber', {
    hp: Infinity, radius: 0.35, height: 2.9, tell: 'battery', downs: false, invincible: true, stompable: false, lockable: true,
    create(e, def) { STD_T().create(e, def); e.puppet = true; e.data.vanished = true; e.data.s = def.s ?? 0; e.data.dir = 1; e.data.scripted = !!def.scripted; e.data.t = 0; C5_climberPlace(e, 0); },
    update: C5_climberUpdate,
    onHit(e) { sfx('thud', { pos: [e.pos.x, e.pos.y + 1.4, e.pos.z], vol: 0.4 }); if (Math.random() < 0.4) e.actor.gesture('pen_click', { hand: 'L' }); return false; },
    stun() { return false; }, knockdown() { return false; },
    threat: (e) => !e.hidden && !e.data.gone,
    remove(e) { try { Snd.loop('standard_keys', false, { id: 'c5:climbkeys', fade: 1.2 }); } catch (err) { /* audio */ } if (e.data.c5contact) Player.lock('c5climb', false); try { STD_T().remove(e); } catch (err) { /* dispose */ } if (C5.climber === e) C5.climber = null; },
  });
  function C5_spawnClimber(s, o = {}) {
    if (C5.climber && !C5.climber.removed) C5.climber.remove();
    const p = C5_routeAt(s);
    const e = Enemies.spawn({ id: 'c5_stairs:standard', type: 'c5_climber', pos: [p.x, p.z], y: p.y, rot: 0, s, scripted: !!o.scripted, persist: false, name: 'LUKA' });
    C5.climber = e;
    return e;
  }

  defineRoom({
    id: 'c5_stairs', name: 'STAIRWELL A', area: 'REGIONAL OFFICE', chapter: 5, outdoor: false, surface: 'concrete', ambient: 'office',
    fog: { density: 0.034, color: '#343c3a' },
    bounds: [0, 0, 4.6, 6.6],
    entries: { ground: [1.4, 5.95, 180], l4: [3.2, 5.95, 180], start: [1.4, 5.95, 180] },
    cameras: (() => {
      const cams = [];
      for (let k = 0; k <= 3; k++) {
        const y = stY(k);
        // each landing, from high over the mid-landing: looking down at him arriving, the flight below falling away
        cams.push({ id: 'c5_stairs:down' + k, vol: [0, 0, ST.W, ST.D], y: [k ? y - 0.9 : -1, y + 0.9], type: 'static', pos: [2.3, Math.min(y + 4.3, ST.roof - 0.5), 0.35], target: [2.3, y + 0.2, 5.3], fov: 'fit' });
        // each mid-landing, from low on the landing below it, up the void: whatever follows him climbs toward the lens
        if (k < 3) cams.push({ id: 'c5_stairs:up' + k, vol: [0, 0, ST.W, ST.D], y: [y + 0.9, y + 2.7], type: 'pan', pos: [2.3, y + 0.75, 6.25], target: [2.3, y + 2.4, 0.9], fov: 52, pan: { lag: 0.25, yaw: 40, pitch: 36 } });
      }
      return cams;
    })(),
    build(K) {
      const CONC = { tex: 'concrete', color: '#8c8d86' }, WALL = { tex: 'plaster', color: '#a8ab9f' }, RAIL = { tex: 'metal', color: '#c9a822', roughness: 0.55 };
      const tag = (range, fn) => { const n0 = K.build.floors.length; fn(); for (let i = n0; i < K.build.floors.length; i++) K.build.floors[i].c5lv = range; };
      // floors and flights, registered top-down (the ground floor wins until the room sorts them by Aidan's height)
      tag([ST.top, ST.top], () => K.floor(0, ST.sz, ST.W, ST.D, CONC, { y: ST.top, skirt: false }));
      for (let k = 2; k >= 0; k--) {
        const y = stY(k);
        tag([y + 1.8, y + 3.6], () => K.stairs(ST.v1, ST.nz, ST.W, ST.sz, y + 1.8, y + 3.6, { axis: 'z', rail: 'left', mat: CONC, solid: false }));
        tag([y + 1.8, y + 1.8], () => K.floor(0, 0, ST.W, ST.nz, CONC, { y: y + 1.8, skirt: false }));
        tag([y, y + 1.8], () => K.stairs(0, ST.nz, ST.fw, ST.sz, y + 1.8, y, { axis: 'z', rail: 'right', mat: CONC, solid: false }));
        tag([y, y], () => K.floor(0, ST.sz, ST.W, ST.D, k === 0 ? { tex: 'concrete_wet', color: '#7f807a' } : CONC, { y, skirt: false }));
      }
      // slabs under the landings, soffits under the flights, the pit at the bottom of the void
      const cm = K.mat(CONC);
      const soffit = (x, ya, yb) => { const L = Math.hypot(ST.sz - ST.nz, yb - ya), m = new THREE.Mesh(new THREE.BoxGeometry(ST.fw, 0.14, L), cm); m.position.set(x, (ya + yb) / 2 - 0.26, (ST.nz + ST.sz) / 2); m.rotation.x = Math.atan2(ya - yb, ST.sz - ST.nz); m.castShadow = true; m.receiveShadow = true; K.mesh(m, { static: true }); };
      for (let k = 0; k <= 3; k++) {
        const y = stY(k);
        if (k > 0) K.box(ST.W / 2, y - 0.25, (ST.sz + ST.D) / 2, ST.W, 0.25, ST.D - ST.sz, CONC);
        if (k < 3) {
          K.box(ST.W / 2, y + 1.8 - 0.25, ST.nz / 2, ST.W, 0.25, ST.nz, CONC);
          soffit(ST.fw / 2, y + 1.8, y); soffit(ST.v1 + ST.fw / 2, y + 1.8, y + 3.6);
        }
        // balustrades where the landings meet the void (a collider each, at that landing's height)
        const rail = (z, yy) => {
          K.box(2.3, yy, z, ST.v1 - ST.v0, 1.0, 0.04, { tex: 'grille', color: '#8a8e8c' }, { collide: true, h: 1.05 });
          K.box(2.3, yy + 1.0, z, ST.v1 - ST.v0 + 0.05, 0.05, 0.07, RAIL);
        };
        rail(ST.sz + 0.02, y);
        if (k < 3) rail(ST.nz - 0.02, y + 1.8);
      }
      K.box(2.3, -0.05, 3.3, ST.v1 - ST.v0, 0.05, ST.sz - ST.nz, { tex: 'concrete_wet', color: '#5f605a' });
      K.box(3.95, 0, 3.3, 1.3, 1.6, 3.6, { tex: 'cardboard', color: '#8a7658' });
      K.prop('box_stack', 3.95, 4.3, 12, { n: 4, y: 0 }); K.prop('mop_bucket', 2.0, 5.3, 200, {});
      K.dress('papers', [1.4, 1.6, 3.2, 5.0], 5, { seed: 561, y: 0.01 });
      K.ceiling(0, 0, ST.W, ST.D, ST.roof, CONC);
      // walls: four storeys of painted block, a door in the south wall of each landing
      for (let k = 0; k <= 3; k++) {
        const y = stY(k), h = k === 3 ? ST.roof - y : ST.FH;
        K.wall(-0.075, ST.D, -0.075, 0, h, WALL, { y, grime: true, skirting: k === 0 });
        K.wall(ST.W + 0.075, 0, ST.W + 0.075, ST.D, h, WALL, { y, grime: true });
        K.wall(ST.W + 0.15, -0.075, -0.15, -0.075, h, WALL, { y, grime: true });
        K.wall(-0.15, ST.D + 0.075, ST.W + 0.15, ST.D + 0.075, h, WALL, { y, openings: [{ at: ST.doorX + 0.15, w: 1.0, h: 2.15 }], grime: true, skirting: true });
        K.plane(3.55, y + 1.65, ST.D - 0.01, 0.5, 0.62, levelTex(['G', '2', '3', '4'][k]), { rotY: 180, transparent: true });
        K.prop('extinguisher', 0.02, 6.0, 90, { variant: 'wall', y });
      }
      const doorOn = (k) => () => C5_stairLevel() === k;
      K.door({ id: 'c5_stairs:ground', x: ST.doorX, z: ST.D, rot: 0, y: 0, w: 1.0, style: 'fire', to: 'c5_lobby', entry: 'stairs', sign: 'GROUND — LOBBY', when: doorOn(0) });
      K.door({ id: 'c5_stairs:l2', x: ST.doorX, z: ST.D, rot: 0, y: stY(1), w: 1.0, style: 'wired', locked: true, lockMsg: 'Locked.', sign: 'LEVEL 2 — ATRIUM', when: doorOn(1) });
      K.door({ id: 'c5_stairs:l3', x: ST.doorX, z: ST.D, rot: 0, y: stY(2), w: 1.0, style: 'wired', locked: true, lockMsg: 'Locked.', sign: 'LEVEL 3', when: doorOn(2) });
      K.door({ id: 'c5_stairs:l4', x: ST.doorX, z: ST.D, rot: 0, y: ST.top, w: 1.0, style: 'wired', to: 'c5_level4', entry: 'stairs', sign: 'LEVEL 4', when: doorOn(3) });
      K.sign('NO ACCESS\nEVENT SET-UP', ST.doorX + 0.02, stY(1) + 1.45, ST.D - 0.12, 0.34, 0.22, { style: 'council', bg: '#ffffff', fg: '#b3261e', rotY: 180 });
      // beyond the upper doors: dark offices through the wired glass (L2, L3), Level 4's light spilling through
      for (let k = 1; k <= 3; k++) K.box(ST.doorX, stY(k), ST.D + 0.9, 3, 2.6, 0.1, { color: k === 3 ? '#c9b98a' : '#070909', roughness: 1 });
      K.light('point', ST.doorX, ST.top + 1.6, ST.D - 0.6, { color: '#ffe2b0', intensity: 2.2, distance: 5, name: 'c5st:l4glow' });
      // lights: bulkheads — G steady, the first mid-landing steady (the shot), the second flickering, L3 dead
      const bulk = (x, y, z, rot, o) => { K.box(x, y, z, 0.32, 0.16, 0.1, { color: '#d8dcd6', roughness: 0.4, emissive: o.on === false ? undefined : '#e8f0ea', emissiveIntensity: o.on === false ? undefined : 1.2 }, { rot }); if (o.on !== false) K.light('point', x + (rot === 90 ? 0.35 : rot === -90 ? -0.35 : 0), y, z + (rot === 0 ? 0.35 : rot === 180 ? -0.35 : 0), { color: '#dfe8e0', intensity: o.i ?? 2.4, distance: o.d ?? 5.5, flicker: !!o.flicker, name: o.name, real: o.real }); };
      bulk(ST.doorX, 2.55, ST.D - 0.06, 180, { name: 'c5st:g' });
      bulk(0.06, 1.8 + 2.1, 0.75, 90, { name: 'c5st:m0', i: 2.8 });
      bulk(ST.doorX, stY(1) + 2.55, ST.D - 0.06, 180, { name: 'c5st:l2', i: 2.0 });
      bulk(0.06, stY(1) + 1.8 + 2.1, 0.75, 90, { name: 'c5st:m1', flicker: true, i: 2.2 });
      bulk(ST.doorX, stY(2) + 2.55, ST.D - 0.06, 180, { on: false });
      bulk(0.06, stY(2) + 1.8 + 2.1, 0.75, 90, { name: 'c5st:m2', i: 1.8 });
      K.prop('exit_sign', ST.doorX, ST.D - 0.02, 180, { mount: 2.4 });
      K.light('point', 1.5, stY(1) + 2.6, 3.4, { color: '#cfe0dc', intensity: 2.6, distance: 4.5, name: 'c5st:fill', on: false });
      // pipes and a cable tray up the north-east corner, the hose reel, posters, somebody's break spot on Level 3
      for (const [x, z, r] of [[4.42, 0.16, 0.05], [4.3, 0.16, 0.03], [0.17, 0.2, 0.04]]) K.cyl(x, 0, z, r, ST.roof, { tex: 'metal', color: '#7a2a22' }, { seg: 8 });
      K.box(4.52, 0, 3.3, 0.08, ST.roof, 0.3, { tex: 'metal', color: '#6a6e6c' });
      K.box(0.14, stY(1) + 1.8 + 0.9, 1.1, 0.25, 0.7, 0.7, { color: '#b3261e', roughness: 0.5 });
      K.sign('FIRE HOSE REEL', 0.28, stY(1) + 1.8 + 1.72, 1.1, 0.5, 0.12, { style: 'warning', rotY: 90 });
      K.plane(0.015, 1.55, 3.4, 0.42, 0.6, stairPosterTex(), { rotY: 90 });
      K.plane(4.585, stY(1) + 1.9, 3.1, 0.42, 0.6, stairPosterTex(), { rotY: -90 });
      K.prop('chair', 3.9, 5.75, -120, { y: stY(2) });
      K.prop('coffee_cup', 3.35, 6.3, 0, { y: stY(2) });
      K.box(3.6, stY(2) + 0.45, 5.7, 0.13, 0.03, 0.2, { color: '#8a2a24', roughness: 0.8 }, { rot: 30 });
      K.cyl(3.2, stY(2), 6.35, 0.08, 0.06, { tex: 'metal', color: '#6a6e6c' }, { seg: 10 });
      K.pickup('coffee', 3.35, stY(2) + 0.02, 6.1, { id: 'c5_stairs:coffee', extraOnEasy: true, rot: 40, glint: true });
      K.writing('DID YOU CHECK', 4.58, stY(1) + 1.8 + 1.4, 0.8, 1.2, { rotY: -90, world: 'fog' });
      K.writing('SEE ME', 0.02, stY(2) + 1.8 + 1.4, 0.8, 0.9, { rotY: 90, world: 'fog' });
      // CUTSCENE 5-1 the first time he reaches the Level 2 landing
      K.trigger([0, ST.sz, ST.W, ST.D], (G) => G.cutscene('5-1'), { id: 'c5_stairs:51', when: () => S.chapter === 5 && !flag('c5_chase') && Player.pos.y > 3.0 && Player.pos.y < 4.3 });
      // ---- examine lines (Aidan) — each tied to its landing ------------------------------------------------------
      const lv = (k) => () => C5_stairLevel() === k;
      K.examine(0.2, 1.4, 3.4, ['"Take the stairs! Ten thousand steps a day keeps the sick days away."', 'A smiley face. From People and Culture.'], { id: 'c5st:poster', r: 1.2, when: lv(0) });
      K.examine(3.95, 0.9, 3.5, 'Archive boxes under the stairs. "2019 — COACHING CONVERSATIONS". Dozens of them.', { id: 'c5st:boxes', r: 1.6, when: lv(0) });
      K.examine(2.3, 1.4, 5.3, 'The rail\'s cold. [beat] The void goes all the way down. I can hear it breathing. No. That\'s me.', { id: 'c5st:rail', r: 1.0, when: lv(1) });
      K.examine(3.9, stY(2) + 0.7, 5.8, ['A chair on the landing. A coffee. A book face down, half read.', 'Somebody came out here to hide for ten minutes. [beat] I get it.'], { id: 'c5st:chair', r: 1.3, when: lv(2) });
      K.examine(0.3, stY(1) + 1.8 + 1.2, 1.1, 'A fire hose. Serviced, according to the tag, before I was born.', { id: 'c5st:hose', r: 1.2, when: () => Player.pos.y > stY(1) + 1.2 && Player.pos.y < stY(1) + 2.6 });
      K.examine(3.55, ST.top + 1.6, 6.5, 'Four. [beat] The light\'s on in there.', { id: 'c5st:four', r: 1.4, when: lv(3) });
    },
    sortFloors() { C5.stairY = undefined; C5_stairFloors(true); },
    onUpdate(dt) {
      C5_stairFloors();
      C5_ambient(['#56625f', 0.34], ['#1f6f6a', 0.06]);
      // keys somewhere below while it's loose and not in here with him
      if (flag('c5_chase') && !flag('c5_outage') && (!C5.climber || C5.climber.removed) && !busy()) {
        C5.keysT = (C5.keysT ?? 4) - dt;
        if (C5.keysT <= 0) { C5.keysT = 6 + Math.random() * 6; sfx('keys_far', { pos: [2.3, Player.pos.y + (flag('c5_l4') ? 6 : -6), 3.3], vol: 0.45 }); }
      }
    },
    onLeave() {
      C5_ambientOff();
      const e = C5.climber;
      // how long it'd take to reach the Level 4 door (Level 4 starts its patrol then)
      C5.climbEta = e && !e.removed && !e.data.gone ? Math.max(2.5, (ST_ROUTE.len - e.data.s) / 1.1) : null;
      C5.climbS = e && !e.removed ? e.data.s : null;
      try { Snd.loop('standard_keys', false, { id: 'c5:climbkeys', fade: 1.0 }); } catch (err) { /* audio */ }
      C5.climber = null; C5.stairY = undefined;
    },
    async onEnter(G, from) {
      // which entry: the ground door (x 1.4) or Level 4's (x 3.2) — put him on that landing and sort the floors
      const top = Math.abs(Player.pos.x - 3.2) < 0.05 && Math.abs(Player.pos.z - 5.95) < 0.05;
      const snapTo = (y) => { Player.place(Player.pos.x, Player.pos.z, U.deg(Player.yaw), { y }); C5.stairY = undefined; C5_stairFloors(true); try { Cam.snap(); } catch (e) { /* cam */ } };
      if (top) snapTo(ST.top);
      else if (Player.pos.y > 1 && Math.abs(Player.pos.z - 5.95) < 0.05 && Math.abs(Player.pos.x - 1.4) < 0.05) snapTo(0);
      else { C5.stairY = undefined; C5_stairFloors(true); }
      // keep the floor order fresh before Player moves each frame (scripts update first)
      G.bg(async (G2) => { await G2.loop(() => { C5_stairFloors(); return false; }); }, { name: 'c5:stairfloors' });
      if (S.chapter !== 5 || flag('c5_outage')) return;
      // the chase is on: it's in here with him
      if (flag('c5_chase') && !flag('c5_l4') && from === 'c5_lobby') {
        C5_spawnClimber(C5.climbS != null ? clamp(C5.climbS, 0, 8) : 2);
      } else if (flag('c5_l4') && from === 'c5_level4') {
        // it saw him on Level 4: it follows him into the stairwell
        const st = Enemies.standard.state;
        if (st && st.mode === 'follow') {
          await G.wait(2.6);
          G.sfx('door_open', { pos: [ST.doorX, ST.top + 1, ST.D], vol: 0.8 });
          C5_spawnClimber(ST_ROUTE.len - 0.4);
          G.sfx('keys', { pos: [ST.doorX, ST.top + 1.4, ST.D - 0.5], vol: 0.9 });
          try { Enemies.standard.teleport('l4:door'); } catch (e) { /* graph */ }
        }
      }
      if (S.chapter === 5 && G.once('c5:stairsIn')) {
        await G.wait(1.0);
        await G.think('Four floors. [beat] Fine.');
      }
    },
  });


  // =================================================================================================================
  // Actor-relative framing for close shots: the head anchor's world position, the facing, a point f metres in front
  // of the head, l to its left, u up
  // =================================================================================================================
  const C5_headAt = (X) => {
    const r = X && X.raw, a = r && r.anchors && r.anchors.head;
    if (a) { a.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(a.matrixWorld); }
    const p = X ? X.pos : { x: 0, y: 0, z: 0 };
    return new THREE.Vector3(p.x, (p.y || 0) + 1.6, p.z);
  };
  const C5_fwd = (X) => { const y = (X ? X.yaw : 0) * D2R; return [Math.sin(y), Math.cos(y)]; };
  const C5_rel = (X, f, l, u = 0, H = C5_headAt(X)) => { const [fx, fz] = C5_fwd(X); return [H.x + fx * f + fz * l, H.y + u, H.z + fz * f - fx * l]; };
  const C5_worldOf = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
  // put Aidan somewhere exactly (height included) — the stairwell re-sorts its floors for the new height
  function C5_putAidan(x, y, z, yaw) {
    Player.place(x, z, yaw, { y });
    if (World.def && World.def.sortFloors) World.def.sortFloors();
  }

  // =================================================================================================================
  // CUTSCENE 5-1 "Got a Sec?" (c5_stairs, the Level 2 landing)
  // =================================================================================================================
  defineCutscene('5-1', async (G) => {
    const A = G.aidan, y2 = stY(1);
    G.set('c5_chase', true);
    note(G, 'Keep climbing. Level 4.', 'c5_goal');
    if (A.raw) A.raw.idleLife = false;
    try { Player.setTorch(true); } catch (e) { /* torch */ }
    C5_putAidan(2.7, y2, 5.85, 180);
    A.pose('idle');
    const e = C5_spawnClimber(0.3, { scripted: true });
    const setS = (s, dt = 0) => { e.data.s = s; e.data.dir = 1; C5_climberPlace(e, dt); };
    setS(0.3);
    // 1. SHOT — looking straight down the stairwell void from above. Aidan climbs, small. Far below, keys chime.
    const fill = G.light('c5st:fill'); if (fill) fill.on(true);
    G.cam({ pos: [3.0, ST.roof - 1.9, 2.9], target: [2.35, 0, 3.75], fov: 44, to: { pos: [3.02, ST.roof - 2.0, 2.95], fov: 39 }, dur: 8.5 });
    const climb = q(A.walkTo([[1.08, ST.sz + 0.12], [1.06, 3.7]], { speed: 0.9 }));
    await G.wait(2.4);
    G.sfx('door_close', { pos: [ST.doorX, 1.2, ST.D], vol: 0.6 });
    await G.wait(0.6);
    G.sfx('keys', { pos: [2.3, 1.2, 5.6], vol: 0.55, n: 3 });
    await climb;
    await G.wait(0.3);
    await A.turn(90, 0.7);
    A.look([2.3, 0.3, 3.8]);
    if (A.raw) A.raw.eyes('down');
    await G.wait(1.6);
    G.sfx('keys', { pos: [2.3, 1.2, 5.2], vol: 0.7, n: 2 });
    await G.wait(0.6);
    // 2. SHOT — low, from the landing below: a very tall figure, bent under the stairwell ceiling, climbs slowly,
    //    clipboard held flat against its face. Its lanyard swings into the light: LUKA.
    setS(0.3);
    e.actor.setAnim('walk', { blend: 0 });
    G.cam({ pos: [1.0, 1.8 + 0.24, 0.26], target: [0.7, 1.4, 4.8], fov: 54, follow: e.actor, dur: 0 });
    { let s = 0.3; await G.loop((dt) => { s = Math.min(4.35, s + 1.1 * 0.85 * dt); setS(s, dt); return s >= 4.35; }); }
    e.actor.setAnim('idle', { blend: 0.5 });
    await G.wait(0.5);
    //    … the lanyard, close, in the bulkhead's light
    {
      const card = e.actor.anchors && e.actor.anchors.card;
      const cp = card ? C5_worldOf(card) : new THREE.Vector3(e.pos.x, e.pos.y + 1.9, e.pos.z);
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      G.cam({ pos: [cp.x + fx * 0.55 + 0.08, cp.y + 0.1, cp.z + fz * 0.55], target: [cp.x, cp.y - 0.02, cp.z], fov: 24, to: { pos: [cp.x + fx * 0.47 + 0.06, cp.y + 0.08, cp.z + fz * 0.47], fov: 21 }, dur: 3.2 });
      G.sfx('keys', { pos: [cp.x, cp.y, cp.z], vol: 0.9, n: 2 });
      await G.wait(2.6);
    }
    // 3. SHOT — close on Aidan's face, eyes wide. The phone's battery icon drops a notch.
    //    (the head turned down toward the void, the eyes straight out of it — wide open, not lidded by a steep look)
    A.look([3.4, y2 + 1.2, 3.75]);
    if (A.raw) { A.raw.armPose('R', 'phone_look'); A.raw.expr('wide', { k: 1 }); A.raw.eyes('ahead'); }
    G.bars({ n: 0, battery: 0.75 });
    if (fill) fill.on(false);
    { const p0 = C5_rel(A, 0.52, -0.08, -0.36), p1 = C5_rel(A, 0.44, -0.07, -0.34), t0 = C5_rel(A, 0.1, 0, -0.2); G.cam({ pos: p0, target: t0, fov: 32, to: { pos: p1, target: t0, fov: 30 }, dur: 3 }); }
    await G.wait(1.6);
    //    … the phone in his hand: the battery icon drops a notch
    {
      const ph = A.raw && A.raw.held && A.raw.held.R, scr = ph && ph.userData && ph.userData.screen;
      let sp;
      if (scr && scr.geometry) { if (!scr.geometry.boundingBox) scr.geometry.computeBoundingBox(); const bb = scr.geometry.boundingBox; scr.updateWorldMatrix(true, false); sp = scr.localToWorld(new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y + (bb.max.y - bb.min.y) * 0.8, (bb.min.z + bb.max.z) / 2)); }
      else sp = C5_worldOf(A.raw.root).add(new THREE.Vector3(0, 1.1, 0));
      // his eye line down onto the screen, far enough back that the fingers round its edges stay at the edges of the
      // frame and the status row (NO SERVICE … the battery, top right) reads whole
      let nrm = null;
      if (scr && scr.geometry) { const bb = scr.geometry.boundingBox, c0 = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2); nrm = scr.localToWorld(c0.clone().add(new THREE.Vector3(0, 0, 1))).sub(scr.localToWorld(c0.clone())).normalize(); }
      const hp = C5_headAt(A);
      if (!nrm || nrm.dot(hp.clone().sub(sp)) < 0) nrm = hp.clone().sub(sp).normalize();
      const cp = sp.clone().addScaledVector(nrm, 0.3).lerp(hp, 0.15);
      G.cam({ pos: [cp.x, cp.y + 0.02, cp.z], target: [sp.x, sp.y - 0.012, sp.z], fov: 30 });
    }
    await G.wait(0.7);
    G.bars({ n: 0, battery: 0.5, letterbox: true });
    await G.wait(1.2);
    G.sfx('keys', { pos: [e.pos.x, e.pos.y + 1.6, e.pos.z], vol: 0.8, n: 2 });
    await G.wait(0.6);
    // state (plain statements: a skip lands here the same way)
    { const f = G.light('c5st:fill'); if (f) f.on(false); }
    C5_putAidan(0.9, y2 + (ST.sz - 3.7) / (ST.sz - ST.nz) * 1.8, 3.7, 180);
    setS(4.35);
    e.data.scripted = false;
    e.actor.setAnim('idle', { blend: 0.2 });
    G.bars(null);
    if (A.raw) { A.raw.armPose('R', 'phone'); A.raw.expr('scared'); A.raw.eyes('ahead'); A.raw.idleLife = true; }
    A.look(null);
    G.camRelease();
  }, { letterbox: true, skippable: true });


  // =================================================================================================================
  // Chapter 5
  // =================================================================================================================
  defineChapter({
    n: 5, id: 'ch5', title: 'LEVEL 4', card: 'LEVEL 4',
    start: { room: 'c5_ringroad', entry: 'park' },
    // what a player carries into Chapter 5 (chapter select): the Prologue and Chapters 1–4
    debugState(s) {
      const give = (id, n = 1) => { if (!ITEMS[id]) return; const e = s.inv.find((i) => i && i.id === id); if (e) { if (ITEMS[id].stack) e.n = (e.n || 1) + n; } else s.inv.push({ id, n }); };
      for (const id of ['box_cutter', 'steel_bar', 'extinguisher', 'jumper_tool', 'alarm_pendant', 'unit9_key', 'staff_key', 'first_day_badge', 'certificate', 'ticket', 'gate_key', 'map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'map_care', 'rmap_care']) if (!s.inv.some((i) => i && i.id === id)) give(id);
      give('coffee', 1); give('energy_drink', 1);
      s.inv = s.inv.filter((i) => i && i.id !== 'returned_modem');
      s.equipped = 'steel_bar';
      s.ammo = s.ammo || {}; s.ammo.extinguisher = Math.max(s.ammo.extinguisher | 0, 4);
      for (const id of ['map_town', 'map_plaza', 'rmap_plaza', 'map_village', 'rmap_village', 'map_exchange', 'rmap_exchange', 'map_care', 'rmap_care']) { const m = ITEMS[id] && ITEMS[id].map; if (m) s.maps[m] = true; }
      Object.assign(s.flags, {
        p0_carDead: true, c1_address: true, c1_wai: true, c1_pinKnown: true, c1_bossDone: true, standardName: 'LUKA',
        c2_modemIn: true, c2_chase: 3, c2_metChase: true, c2_loop: true, c2_loopN: 3, c2_loopBroken: true,
        c3_bossDone: true, waiSaved: s.flags.waiSaved ?? true,
        c4_metChase: true, c4_clicks: true, c4_logs: 'read', c4_bossDone: true, c4_done: true, chaseHurt: false,
      });
      if (!s.flags.waiSaved) s.flags.waiLost = true;
      s.done['c4:gateOpen'] = true;
      const lv = (s.difficulty && s.difficulty.riddle) || 'normal';
      const pick = (b) => (DOCUMENTS[`${b}_${lv}`] ? `${b}_${lv}` : b);
      for (const d of ['timetable', pick('pin_note'), pick('cert'), 'acct1', 'acct2', 'acct3', 'acct4', 'acct5', 'huddle1', 'huddle2', 'returns1', 'returns2', 'returns3', 'returns4', 'noticeboard', 'fridge_list', pick('lockbox_note'), 'plaque', 'wai_email', 'oplog1', 'oplog2', 'oplog3', 'oplog4', 'oplog6', pick('fuse_note'), 'call_logs', 'chase_notes', 'rotary_card']) if (DOCUMENTS[d]) s.docs[d] = { read: true };
      for (const c of ['luka1', 'luka2', 'luka3', 'luka4']) s.calls[c] = s.calls[c] || 'answered';
      s.stats.callsAnswered = Math.max(s.stats.callsAnswered || 0, 4);
      for (const id of ['P-1', 'P-4', '1-1', '1-2', '1-3', '1-4', '1-7', '1-8', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '3-3b', '4-1', '4-2', '4-3', '4-4']) s.done['cs:' + id] = true;
      Object.assign(s.done, { 'break:ch1': true, 'break:ch2': true, 'break:ch3': true, 'break:ch4': true });
      s.F = Math.max(s.F || 0, 22); s.A = Math.max(s.A || 0, 2); s.stats.freed = Math.max(s.stats.freed || 0, 4);
      s.chaseHits = s.chaseHits | 0;
      s.notes = (s.notes || []).filter((n) => n && !/^c[1-4]_/.test(n.id || ''));
      s.notes.push({ id: 'c5_goal', text: 'The regional office on the ring road. Level 4 — the escalations office.', done: false });
    },
    async begin(G) {
      G.bars(null);
      if (G.once('c5:begin')) note(G, 'The regional office on the ring road. Level 4 — the escalations office.', 'c5_goal');
    },
  });


  // =================================================================================================================
  // 5D/5E LEVEL 4 — 40 × 30 m, office ceiling 2.9. The atrium void (x 13–27, z 8–22) drops two floors to the Level 2
  // atrium floor (y −7.2); the leaderboard hangs on its north side, the feature stair runs down its west side. Round
  // the void the balcony ring (2.2 m); west of it the open plan; north the north desks and the escalations office
  // (NW, x 0–6, z 0–5); NE the kitchenette (x 29.2–35) and Stairwell A (x 35–40, door at x 37.5, z 6.2); along the
  // east walkway three meeting rooms (x 29.2–36.5) and the dead lifts; south the collaboration zone, the print room
  // (x 32–40, z 25–30, door on its west wall) and the fire stairs (SW).
  // =================================================================================================================
  const L4 = {
    H: 2.9, V: [13, 8, 27, 22], stair: [13.1, 15.2], stairEnd: 11.3, stairY: -1.75,
    esc: [3.0, 5.0], stairsDoor: [37.5, 6.2], printDoor: [32, 27.5], fire: [0, 27.4],
    mr: [{ z0: 8.2, z1: 13.0, door: 10.6, name: 'HARBOUR' }, { z0: 15.8, z1: 20.6, door: 18.2, name: 'SUMMIT' }, { z0: 20.6, z1: 25.0, door: 22.8, name: 'EXCELLENCE' }],
    mrX: [29.2, 36.5], lift: [13.0, 15.8], L2: -7.2, L3: -3.6,
  };
  const L4_GRAPH = {
    nodes: {
      'x:s0': { room: 'c5_x_stairwell', pos: [0, 0] }, 'x:s1': { room: 'c5_x_stairwell', pos: [3, 0] },
      'l4:door': { room: 'c5_level4', pos: [37.5, 7.25], door: true },
      ne: { room: 'c5_level4', pos: [28.1, 7.1] },
      // (1.7 m off each door: close enough to stare at it, too far for its hand to reach the handle)
      mr1: { room: 'c5_level4', pos: [27.5, 10.6], pause: 4, face: 90 },
      lift: { room: 'c5_level4', pos: [27.6, 14.4] },
      mr2: { room: 'c5_level4', pos: [27.5, 18.2], pause: 4, face: 90 },
      mr3: { room: 'c5_level4', pos: [27.5, 22.8], pause: 4, face: 90 },
      sm: { room: 'c5_level4', pos: [20, 23.15] },
      sw: { room: 'c5_level4', pos: [11.9, 23.15] },
      wm: { room: 'c5_level4', pos: [11.9, 15] },
      nw: { room: 'c5_level4', pos: [11.9, 6.9] },
      nm: { room: 'c5_level4', pos: [20, 6.85] },
    },
    edges: [['x:s0', 'x:s1'], ['x:s1', 'l4:door'], ['l4:door', 'ne'], ['ne', 'mr1'], ['mr1', 'lift'], ['lift', 'mr2'], ['mr2', 'mr3'], ['mr3', 'sm'], ['sm', 'sw'], ['sw', 'wm'], ['wm', 'nw'], ['nw', 'nm'], ['nm', 'ne']],
  };
  // clockwise round the ring (north → east → south → west), pausing at each meeting-room door
  const L4_ROUTE = ['ne', 'mr1', 'lift', 'mr2', 'mr3', 'sm', 'sw', 'wm', 'nw', 'nm'];
  const L4_std = () => flag('c5_chase') && !flag('c5_chloe') && !flag('c5_outage') && S.chapter === 5;
  function C5_startStandard(node, o = {}) {
    Enemies.standard.start({ graph: L4_GRAPH, node, name: 'LUKA', mode: 'patrol', route: L4_ROUTE });
    C5.stdOn = true;
  }
  const huddle3Text = 'REGION — MONTH TO DATE\n91%\nNeed 104% to hold\nour ranking.\nEvery store. Every rep.\nEvery sale.';
  const wallFameTex = () => ctex('l4fame', 512, 128, (x, w, h, r) => {
    x.fillStyle = '#0b4f52'; x.fillRect(0, 0, w, h);
    tx(x, 'REP OF THE MONTH — RETAIL REGION', w / 2, 52, 28, '#ffffff', { weight: 'bold', align: 'center', spacing: 2 });
    tx(x, 'Excellence Every Day', w / 2, 96, 26, BR.yellow, { font: FN.serif, align: 'center' });
    age(x, w, h, r, 0.3);
  });
  const gateSignTex = () => ctex('atriumgate', 256, 320, (x, w, h, r) => {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 64);
    tx(x, 'ATRIUM CLOSED', w / 2, 44, 28, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'Regional Kick-off', w / 2, 120, 26, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'SET-UP IN PROGRESS', w / 2, 160, 20, '#1d1d1d', { weight: 'bold', align: 'center' });
    tx(x, 'Please use Stairs A', w / 2, 230, 18, '#555', { align: 'center' });
    tx(x, 'Thank you for your patience!', w / 2, 270, 16, '#555', { font: FN.serif, align: 'center' });
    age(x, w, h, r, 0.4);
  });
  const emailTex = () => ctex('l4email', 320, 200, (x, w, h, r) => {
    x.fillStyle = '#e9edf0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1f5f8a'; x.fillRect(0, 0, w, 22);
    tx(x, 'New Message', 10, 16, 12, '#fff', { weight: 'bold' });
    tx(x, 'To: Region — All Stores', 10, 44, 12, '#333');
    tx(x, 'Subject: quick one', 10, 62, 12, '#333');
    x.fillStyle = '#ccc'; x.fillRect(10, 70, w - 20, 1);
    tx(x, 'Hi team, just a quick one —', 10, 92, 14, '#111');
    x.fillStyle = '#111'; if (r() < 2) x.fillRect(196, 80, 2, 15);
  });
  const blindsTex = () => ctex('blinds', 128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { x.fillStyle = 'rgba(214,212,202,0.9)'; x.fillRect(0, y, w, 5); x.fillStyle = 'rgba(120,118,110,0.6)'; x.fillRect(0, y + 5, w, 1); }
  }, { wrap: true });
  const frostTex = () => ctex('frost', 256, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(235,240,238,0.55)'; x.fillRect(0, 20, w, 24);
    for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(0,168,168,0.5)'; x.beginPath(); x.arc(8 + i * 16, 32, 4, 0, Math.PI * 2); x.fill(); }
  });

  // ---- the Pedestal: a tower of white backlit display plinths, a polished smiling rep kneeling on each, holding up
  //      the one above; at the top the figure with Chloe's face. Built from merged primitives (a rep is one draw call)
  const REP_M = { body: null, face: null, plinth: null, glow: null, chloe: null };
  function C5_repMats() {
    if (REP_M.body) return REP_M;
    REP_M.body = new THREE.MeshStandardMaterial({ color: '#f0ede6', roughness: 0.16, metalness: 0.06 }); REP_M.body.userData.shared = true;
    const ft = ctex('repface', 128, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.strokeStyle = '#2a2622'; x.lineWidth = 5; x.lineCap = 'round';
      for (const sx of [-1, 1]) { x.beginPath(); x.arc(w / 2 + sx * 24, 52, 11, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
      x.lineWidth = 6; x.beginPath(); x.arc(w / 2, 62, 40, Math.PI * 0.18, Math.PI * 0.82); x.stroke();
      x.fillStyle = '#f8f6f0'; x.beginPath(); x.moveTo(w / 2 - 34, 84); x.quadraticCurveTo(w / 2, 108, w / 2 + 34, 84); x.quadraticCurveTo(w / 2, 96, w / 2 - 34, 84); x.fill();
      x.strokeStyle = 'rgba(40,36,32,0.6)'; x.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(w / 2 + i * 9, 86 + Math.abs(i)); x.lineTo(w / 2 + i * 9, 97 - Math.abs(i)); x.stroke(); }
    });
    REP_M.face = new THREE.MeshStandardMaterial({ map: ft, transparent: true, roughness: 0.3, depthWrite: false }); REP_M.face.userData.shared = true;
    REP_M.plinth = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.3 }); REP_M.plinth.userData.shared = true;
    REP_M.glow = new THREE.MeshStandardMaterial({ color: '#dff6f2', emissive: '#dff6f2', emissiveIntensity: 1.6, roughness: 0.4 }); REP_M.glow.userData.shared = true;
    return REP_M;
  }
  const REP_G = {};
  // a kneeling rep (origin: knees on the plinth top, facing +Z, arms raised to y 1.55) — one merged geometry
  function C5_repGeo(pose) {
    if (REP_G[pose]) return REP_G[pose];
    const parts = [], M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const cyl = (r0, r1, h) => { const g = new THREE.CylinderGeometry(r1, r0, h, 10); return g; };
    const sph = (r) => new THREE.SphereGeometry(r, 12, 9);
    const add = (geo, m) => parts.push({ geo, m });
    if (pose === 'kneel') {
      for (const sx of [-1, 1]) {
        add(cyl(0.055, 0.05, 0.42), M4(sx * 0.1, 0.06, -0.2, Math.PI / 2));           // shins flat on the plinth
        add(new THREE.BoxGeometry(0.08, 0.06, 0.14), M4(sx * 0.1, 0.05, -0.45, -0.5));   // feet over the back edge
        add(cyl(0.08, 0.07, 0.5), M4(sx * 0.1, 0.3, 0.0, 0.08));                        // thighs up
      }
      add(new THREE.BoxGeometry(0.34, 0.18, 0.22), M4(0, 0.58, 0.0));
      add(cyl(0.14, 0.17, 0.46), M4(0, 0.86, 0.01, 0, 0, 0, 1, 1, 0.72));
      for (const sx of [-1, 1]) {
        add(sph(0.075), M4(sx * 0.2, 1.06, 0.0));
        add(cyl(0.05, 0.045, 0.34), M4(sx * 0.23, 1.25, 0.0, 0, 0, sx * 0.12));         // upper arms up
        add(cyl(0.045, 0.04, 0.3), M4(sx * 0.2, 1.52, 0.02, 0, 0, -sx * 0.08));        // forearms up
        add(sph(0.05), M4(sx * 0.18, 1.7, 0.02, 0, 0, 0, 1, 1.2, 0.8));                // hands gripping above
      }
      add(cyl(0.05, 0.05, 0.1), M4(0, 1.12, 0.0));
      add(sph(0.12), M4(0, 1.27, 0.01, 0, 0, 0, 0.95, 1.1, 1));
    } else {                                                                              // 'crawl': body horizontal, origin at the floor
      add(cyl(0.14, 0.16, 0.5), M4(0, 0.42, 0.0, Math.PI / 2, 0, 0, 1, 1, 0.72));
      add(new THREE.BoxGeometry(0.32, 0.16, 0.2), M4(0, 0.4, -0.3));
      add(sph(0.12), M4(0, 0.52, 0.38, 0, 0, 0, 0.95, 1.1, 1));
    }
    const g = Kit.mergeGeometries(parts);
    for (const p0 of parts) p0.geo.dispose();
    g.userData.shared = true;
    REP_G[pose] = g;
    return g;
  }
  function C5_rep(pose = 'kneel', o = {}) {
    const M = C5_repMats(), g = new THREE.Group();
    const body = new THREE.Mesh(C5_repGeo(pose), M.body); body.castShadow = false; body.receiveShadow = true; g.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), M.face);
    if (pose === 'kneel') face.position.set(0, 1.27, 0.122); else { face.position.set(0, 0.52, 0.505); }
    g.add(face);
    g.userData.face = face; g.userData.body = body;
    return g;
  }
  // the crawler's limbs (animated): four limb pivots on a crawl body
  function C5_crawler() {
    const M = C5_repMats(), g = C5_rep('crawl');
    const limbs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const piv = new THREE.Group(); piv.position.set(sx * 0.16, 0.45, sz * 0.22);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 8), M.body); up.position.y = -0.17; piv.add(up);
      const lo = new THREE.Group(); lo.position.y = -0.34; piv.add(lo);
      const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8), M.body); lm.position.set(0, -0.1, 0.1 * sz); lm.rotation.x = 0.7 * sz; lo.add(lm);
      g.add(piv); limbs.push({ piv, sx, sz });
    }
    g.userData.limbs = limbs;
    return g;
  }
  const TWR = { tiers: 5, tierH: 2.4, base: 0.4, plW: 0.95, plH: 0.8, topH: 1.0, topW: 0.66, ring: 2.0 };
  // the column: tiers T0…T4 (a plinth + a kneeling rep each) from y base, the top plinth, the figure on it
  function C5_towerColumn(parent, o = {}) {
    const M = C5_repMats(), col = new THREE.Group(); parent.add(col);
    const tiers = [];
    for (let i = 0; i < TWR.tiers; i++) {
      const t = new THREE.Group(); t.position.y = TWR.base + i * TWR.tierH;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(TWR.plW, TWR.plH, TWR.plW), M.plinth); pl.position.y = TWR.plH / 2; t.add(pl);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(TWR.plW + 0.02, 0.04, TWR.plW + 0.02), M.glow); gl.position.y = TWR.plH - 0.05; t.add(gl);
      const rep = C5_rep('kneel'); rep.position.y = TWR.plH; rep.rotation.y = (i % 2 ? Math.PI : 0) + i * 0.6; t.add(rep);
      t.userData.rep = rep; t.userData.spin = (i % 2 ? -1 : 1) * (0.14 + i * 0.03);
      col.add(t); tiers.push(t);
    }
    const top = new THREE.Group(); top.position.y = TWR.base + TWR.tiers * TWR.tierH;
    const tp = new THREE.Mesh(new THREE.BoxGeometry(TWR.topW, TWR.topH, TWR.topW), M.plinth); tp.position.y = TWR.topH / 2; top.add(tp);
    const tg = new THREE.Mesh(new THREE.BoxGeometry(TWR.topW + 0.02, 0.05, TWR.topW + 0.02), M.glow); tg.position.y = TWR.topH - 0.05; top.add(tg);
    col.add(top);
    return { col, tiers, top, figY: TWR.base + TWR.tiers * TWR.tierH + TWR.topH };
  }
  // the six base plinths round the column's foot, reps kneeling on them reaching up and in
  function C5_basePlinth(i) {
    const M = C5_repMats(), g = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.85), M.plinth); pl.position.y = 0.55; g.add(pl);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.04, 0.87), M.glow); gl.position.y = 1.05; g.add(gl);
    const rep = C5_rep('kneel'); rep.position.y = 1.1; rep.rotation.x = -0.12; g.add(rep);
    g.userData.rep = rep; g.userData.pl = pl;
    return g;
  }
  // a stylised mannequin with Chloe's face for the far views (Level 4's void); the atrium uses a Rig actor
  function C5_farChloe() {
    const M = C5_repMats(), g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: '#e8e2d8', roughness: 0.2 }); m.userData.shared = false;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 12), m); body.position.y = 1.0; g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.6, 12), m); legs.position.y = 0.3; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), m); head.position.y = 1.63; head.scale.set(0.9, 1.1, 1); g.add(head);
    const pony = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.015, 0.34, 8), new THREE.MeshStandardMaterial({ color: '#221812', roughness: 0.6 })); pony.position.set(0, 1.66, -0.14); pony.rotation.x = 0.5; g.add(pony);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), M.face); face.position.set(0, 1.63, 0.115); g.add(face);
    return g;
  }
  // the visual tower (Level 4 sees it rising through the void in the Outage)
  function C5_towerVisual(K, cx, y0, cz, o = {}) {
    const root = new THREE.Group(); root.position.set(cx, y0, cz); root.name = 'c5:towerVis';
    const tw = C5_towerColumn(root);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3, bp = C5_basePlinth(i); bp.position.set(Math.sin(a) * TWR.ring, 0, Math.cos(a) * TWR.ring); bp.rotation.y = a + Math.PI; root.add(bp); }
    const fig = C5_farChloe(); fig.position.y = tw.figY; tw.col.add(fig);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: '#020303' })); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.012; root.add(pit);
    K.mesh(root, { world: o.world || 'outage' });
    K.animate((dt) => { if (!root.visible) return; for (const t of tw.tiers) t.rotation.y += t.userData.spin * dt; fig.rotation.y += 0.25 * dt; });
    return { root, tw, fig };
  }

  defineRoom({
    id: 'c5_level4', name: 'LEVEL 4', area: 'REGIONAL OFFICE — LEVEL 4', chapter: 5, outdoor: false, surface: 'carpet', ambient: 'office',
    fog: { density: 0.03, color: '#39423f' },
    outageFog: { density: 0.032, color: '#081010' },
    surfaces: [{ box: [29.2, 0, 35, 6.2], s: 'lino' }, { box: [10.8, 5.8, 29.2, 24.2], s: 'tile' }, { box: [13, 8, 15.3, 12], s: 'metal' }],
    bounds: [0, 0, 40, 30],
    entries: {
      stairs: [L4.stairsDoor[0], 7.15, 0], print: [L4.printDoor[0] - 0.8, L4.printDoor[1], -90], atriumstairs: [14.15, 7.0, 0],
      escalations: [L4.esc[0], 5.8, 0], firestairs: [0.85, L4.fire[1], 90], kitchen: [31.3, 6.9, 180], start: [L4.stairsDoor[0], 7.15, 0],
    },
    cameras: [
      // the open plan: a rail along the west walkway at head height, looking across the desks to the windows
      { id: 'c5_level4:open', vol: [0, 5, 10.3, 30], type: 'rail', pos: [12.4, 2.4, 15], fov: 50, rail: { a: [12.4, 2.4, 5.5], b: [12.4, 2.4, 29.5], look: [0, 0.6, 0], lag: 0.35 } },
      // the north desks: a rail over the north walkway (behind the leaderboard) looking up the strip to the windows
      { id: 'c5_level4:north', vol: [6, 0, 29.2, 5.9], type: 'rail', pos: [17, 2.5, 7.55], fov: 52, rail: { a: [7, 2.5, 7.55], b: [28.5, 2.5, 7.55], look: [0, 0.4, -1.0], lag: 0.35 } },
      // the walkway between the north desks and the void: from high over the north desks by the windows, across to it —
      // the leaderboard's black back behind him, three storeys of it going down into the void
      { id: 'c5_level4:walk', vol: [10.3, 5.9, 27, 8.2], pri: 1, type: 'pan', pos: [18.6, 2.72, 0.7], target: [18.6, 0.9, 7.1], fov: 52, pan: { lag: 0.3, yaw: 62, pitch: 32 } },
      // the stair corridor from the north-west, low: whatever comes out of Stairwell A comes toward the lens
      { id: 'c5_level4:corridor', vol: [27, 5.8, 40, 8.2], pri: 1, type: 'static', pos: [25.0, 0.95, 6.9], target: [36, 1.5, 7.2], fov: 'fit' },
      // the kitchenette, through its (cut-away) east wall from inside the stair core
      { id: 'c5_level4:kitchen', vol: [29.2, 0, 35, 6.2], type: 'static', pos: [38.9, 2.55, 3.1], target: [31.6, 0.6, 3.1], fov: 'fit' },
      // the east walkway, low from its south end: the Standard's patrol comes toward the lens, stopping at each door
      { id: 'c5_level4:east', vol: [27, 8.2, 31.8, 24.2], type: 'pan', pos: [28.25, 0.85, 26.6], target: [28.3, 1.6, 14], fov: 48, pan: { lag: 0.3, yaw: 40, pitch: 36 } },
      // the three meeting rooms, from behind their (cut-away) back walls: the door and the walkway beyond it
      { id: 'c5_level4:mr1', vol: [29.2, 8.2, 36.5, 13.0], pri: 2, type: 'static', pos: [39.5, 2.45, 10.9], target: [31.2, 0.7, 10.6], fov: 'fit' },
      { id: 'c5_level4:mr2', vol: [29.2, 15.8, 36.5, 20.6], pri: 2, type: 'static', pos: [39.5, 2.45, 17.9], target: [31.2, 0.7, 18.2], fov: 'fit' },
      { id: 'c5_level4:mr3', vol: [29.2, 20.6, 36.5, 25.0], pri: 2, type: 'static', pos: [39.5, 2.45, 23.1], target: [31.2, 0.7, 22.8], fov: 'fit' },
      // the south zone: a rail out over the void's south edge, looking south across the collaboration area
      { id: 'c5_level4:south', vol: [10.3, 22, 32, 30], type: 'rail', pos: [20, 2.45, 20.6], fov: 52, rail: { a: [11.5, 2.45, 20.6], b: [27.5, 2.45, 20.6], look: [0, 0.5, 1.2], lag: 0.35 } },
      // the print-room corner: along the south zone from its west end, the print room's door at the far end
      { id: 'c5_level4:printdoor', vol: [28.9, 24.2, 32, 30], pri: 1, type: 'static', pos: [21.8, 2.2, 26.4], target: [31.2, 0.7, 27.6], fov: 'fit' },
      // out over the void, level with the balcony: the west walkway side-on, the feature stair falling away below
      { id: 'c5_level4:west', vol: [10.3, 8, 15.3, 22], pri: 1, type: 'rail', pos: [17.2, 2.2, 15], fov: 50, rail: { a: [17.2, 2.2, 9.5], b: [17.2, 2.2, 20.5], look: [0, 0.3, 0], lag: 0.35 } },
    ],
    spawns: [
      // hunched at the north windows under the Rep of the Month wall, facing the glass
      { id: 'c5_level4:teth', type: 'tethered', pos: [9.6, 1.35], rot: 180, anchor: [9.6, 1.35], cardigan: '#6a5a78', when: (s) => s.chapter === 5 },
      // among the south zone's couches, facing east along the walkway
      { id: 'c5_level4:reach', type: 'reach', pos: [16.8, 27.6], rot: 80, when: (s) => s.chapter === 5 },
      // "Chloe", typing at a desk by the west windows with her back to the room
      { id: 'c5_level4:chloe', type: 'borrowed', disguise: 'chloe', pos: [1.95, 15.6], rot: -90, anim: 'type', animOpts: { seated: true, seat: 0.47, desk: 0.745 }, world: 'fog', when: (s) => s.chapter === 5 && !(s.flags && s.flags.c5_chloe) },
      // the Unread, in the kitchenette, in the Outage
      { id: 'c5_level4:unread', type: 'unread', pos: [32, 1.2], count: 40, world: 'outage', when: (s) => s.chapter === 5, cluster: [[30.5, 2.2, 0.12], [31.6, 2.55, 0.12], [32.8, 2.0, 0.12], [33.6, 2.4, 0.12], [32.1, 2.86, 1.4], [31.0, 2.86, 2.2], [33.2, 1.7, 0.12]] },
    ],
    build(K) {
      const H = L4.H, V = L4.V;
      const CARPET = { tex: 'carpet', color: '#4a5656' }, TILEB = { tex: 'tile', color: '#9e9a90' };
      const PART = { tex: 'plaster', color: '#b8b5aa' };
      // ---- floors round the void (the void itself has none), the balcony ring's stone band on top ----------------
      K.floor(0, 0, 40, V[1], CARPET); K.floor(0, V[3], 40, 30, CARPET); K.floor(0, V[1], V[0], V[3], CARPET); K.floor(V[2], V[1], 40, V[3], CARPET);
      K.floor(29.2, 0, 35, 6.2, { tex: 'lino', color: '#8e9a94' }, { y: 0.004 });
      K.floor(32, 25, 40, 30, { tex: 'vinyl_retail', color: '#8a8a82' }, { y: 0.004 });
      for (const [x0, z0, x1, z1] of [[10.8, 5.8, 29.2, V[1]], [10.8, V[3], 29.2, 24.2], [10.8, V[1], V[0], V[3]], [V[2], V[1], 29.2, V[3]]]) K.floor(x0, z0, x1, z1, TILEB, { y: 0.003 });
      // ceilings round the void; over the void a dark glass roof (Fog) — in the Outage, nothing, just black
      for (const [x0, z0, x1, z1] of [[0, 0, 40, V[1]], [0, V[3], 40, 30], [0, V[1], V[0], V[3]], [V[2], V[1], 40, V[3]]]) K.ceiling(x0, z0, x1, z1, H, { tex: 'ceiling_tile', color: '#8f908a' });
      K.box(20, H + 0.7, 15, 14.4, 0.06, 14.4, { color: '#0d1414', roughness: 0.1, metalness: 0.3 }, { world: 'fog', shadow: false });
      for (let i = 0; i <= 4; i++) { K.box(V[0] + i * 3.5, H + 0.5, 15, 0.12, 0.2, 14.4, { tex: 'metal', color: '#5a605e' }, { world: 'fog' }); }
      // slab edges round the void, the Level 3 slab below (a band of glass balustrade and dark offices), the Level 2
      // atrium floor far below, the void's walls
      const slab = { tex: 'concrete', color: '#7f817b' };
      for (const [cx, cz, sx, sz] of [[20, V[1] - 0.2, 14.4, 0.4], [20, V[3] + 0.2, 14.4, 0.4], [V[0] - 0.2, 15, 0.4, 14.8], [V[2] + 0.2, 15, 0.4, 14.8]]) K.box(cx, -0.45, cz, sx, 0.45, sz, slab);
      for (const [cx, cz, sx, sz, ry] of [[20, V[1] + 0.05, 14, 0.1, 0], [20, V[3] - 0.05, 14, 0.1, 0], [V[0] + 0.05, 15, 0.1, 14, 0], [V[2] - 0.05, 15, 0.1, 14, 0]]) {
        K.box(cx, L4.L3 - 0.45, cz, sx, 0.45, sz, slab);
        K.box(cx, L4.L3, cz, sx, 1.05, sz, { color: '#b8cfcc', roughness: 0.05, transparent: true, opacity: 0.25 }, { shadow: false, rot: ry });
        K.box(cx, L4.L3 + 1.05, cz, sx + 0.04, 0.05, sz + 0.04, { tex: 'metal', color: '#c9cdcb' });
      }
      K.box(20, L4.L2 - 0.2, 15, 14.2, 0.2, 14.2, { tex: 'tile', color: '#a8a49a' });
      for (const [cx, cz, sx, sz] of [[20, V[1] - 0.1, 14.2, 0.2], [20, V[3] + 0.1, 14.2, 0.2], [V[0] - 0.1, 15, 0.2, 14.2], [V[2] + 0.1, 15, 0.2, 14.2]]) K.box(cx, L4.L2, cz, sx, -L4.L2 - 0.45, sz, { color: '#1a2022', roughness: 0.6 });
      // the leaderboard: three storeys high on the void's north side
      K.prop('leaderboard', 20, V[1] + 0.12, 0, { variant: 'atrium', w: 9, h: 9.4, mount: 4.7 + 0.2, y: L4.L2, name: 'c5_board', bank: 3 });
      K.collider(15.4, V[1] - 0.05, 24.6, V[1] + 0.4, { h: 3 });
      // the atrium floor in the Fog world: set up for the Regional Kick-off — rows of chairs, a lectern, banners
      K.fogOnly(() => {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) K.prop('chair', 16.8 + c * 1.1, 18.2 + r * 1.1, 180, { y: L4.L2, collide: false });
        K.box(20, L4.L2, 10.4, 5, 0.4, 2.2, { tex: 'wood', color: '#3a2e24' });
        K.box(20, L4.L2 + 0.4, 10.9, 0.6, 1.1, 0.45, { tex: 'wood', color: '#2a2220' });
        for (const x of [16, 24]) { K.box(x, L4.L2, 11, 0.8, 2.2, 0.05, { color: '#0b4f52', roughness: 0.5 }); K.plane(x, L4.L2 + 1.3, 11.04, 0.75, 1.6, board('kickoff', ['REGIONAL', 'KICK-OFF', 'Excellence', 'Every Day'], { w: 192, h: 384, bg: '#0b4f52', fg: ['#ffcc00', '#ffffff', '#b8dcd8', '#b8dcd8'], size: [34, 34, 26, 26], age: 0.2 }), {}); }
      });
      // ---- the balustrade round the void: glass on steel posts (the stair's own sides are glass too) ------------------
      const glass = { color: '#cfe0dc', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22 };
      const bal = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.max(0.04, x1 - x0), sz = Math.max(0.04, z1 - z0); K.box(cx, 0, cz, sx, 1.08, sz, glass, { collide: true, h: 1.2, shadow: false }); K.box(cx, 1.08, cz, sx + 0.03, 0.05, sz + 0.03, { tex: 'metal', color: '#c9cdcb' }); };
      bal(L4.stair[1], V[1] - 0.02, 15.5, V[1] + 0.02); bal(24.5, V[1] - 0.02, V[2], V[1] + 0.02);
      bal(V[2] - 0.02, V[1], V[2] + 0.02, V[3]); bal(V[0], V[3] - 0.02, V[2], V[3] + 0.02); bal(V[0] - 0.02, V[1], V[0] + 0.02, V[3]);
      // the feature stair: the top flight is walkable (to the atrium, → c5_atrium:stairs); the rest falls away below
      K.stairs(L4.stair[0], V[1], L4.stair[1], 21.6, 0, L4.L2, { axis: 'z', mat: { tex: 'metal', color: '#6a706e' }, solid: false, nosing: { tex: 'metal', color: '#c9cdcb' } });
      K.build.floors.pop();
      K.stairs(L4.stair[0], V[1], L4.stair[1], L4.stairEnd + 0.3, 0, L4.stairY - 0.3 * 7.2 / 13.6, { axis: 'z', mat: { tex: 'metal', color: '#6a706e' }, solid: false, name: 'c5:stairtop' });
      K.box(L4.stair[1] + 0.02, -7.2, 14.8, 0.04, 7.8, 13.6, glass, { collide: false, shadow: false });
      K.collider(L4.stair[1], V[1], L4.stair[1] + 0.1, L4.stairEnd + 0.4, { h: 2, y: -2 });
      K.collider(L4.stair[0] - 0.1, V[1] + 0.02, L4.stair[0], L4.stairEnd + 0.4, { h: 2, y: -2 });
      K.fogOnly(() => {
        // closed for the event: stanchions, a belt, an A-frame sign
        for (const x of [13.3, 15.0]) { K.cyl(x, 0, V[1] - 0.2, 0.18, 0.03, { tex: 'metal', color: '#c9cdcb' }); K.cyl(x, 0.03, V[1] - 0.2, 0.03, 0.95, { tex: 'metal', color: '#c9cdcb' }); }
        K.box(14.15, 0.86, V[1] - 0.2, 1.7, 0.05, 0.01, { color: '#b3261e', roughness: 0.6 });
        K.box(14.15, 0, V[1] - 0.55, 0.62, 0.9, 0.05, { color: '#f4f2ea', roughness: 0.7 }, { rot: 8 });
        K.plane(14.15, 0.55, V[1] - 0.52, 0.55, 0.7, gateSignTex(), { rotY: 8 });
        K.blocker(L4.stair[0], V[1] - 0.45, L4.stair[1], V[1] - 0.1, 'Closed for the event.');
      });
      K.exit({ id: 'c5_level4:atrium', box: [L4.stair[0], L4.stairEnd - 0.6, L4.stair[1], L4.stairEnd + 0.3], to: 'c5_atrium', entry: 'stairs', sound: 'steps', when: () => S.chapter === 5 && flag('c5_outage'), blockedMsg: 'Not back down there.' });
      // the Pedestal rising through the void (Outage)
      C5_towerVisual(K, 20, L4.L2, 15.2, { world: 'outage' });
      K.outageOnly(() => {
        K.light('spot', 20, 9.5, 15.2, { target: [20, 6.4, 15.2], angle: 16, color: '#fff4e0', intensity: 30, distance: 12, name: 'c5l4:topspot' });
        K.light('point', 20, L4.L2 + 1.5, 15.2, { color: '#dff6f2', intensity: 3, distance: 9, name: 'c5l4:plinthglow' });
      });

      // ---- exterior: glass curtain wall all round (the fog pressing on it) -------------------------------------------
      const fogM = { color: '#5d6a66', roughness: 1, emissive: '#6a7773', emissiveIntensity: 0.35 };
      const curtain = (x0, z0, x1, z1, skip = []) => {
        const L = Math.hypot(x1 - x0, z1 - z0), ops = [];
        for (let a = 1.25; a < L - 0.5; a += 2.5) if (!skip.some(([s0, s1]) => a > s0 && a < s1)) ops.push({ at: a, w: 2.2, h: 2.1, sill: 0.45, glass: true });
        K.wall(x0, z0, x1, z1, H, { tex: 'plaster', color: '#a9a69c' }, { openings: ops, skirting: true, grime: true });
      };
      curtain(-0.1, 0, 40.1, 0, [[0, 6.1]]); curtain(40.1, 30, -0.1, 30, [[0, 8.2]]);
      curtain(0, 30.1, 0, -0.1, [[1.9, 3.8], [25.1, 30.2]]); curtain(40, -0.1, 40, 30.1, [[0, 8.3], [8.3, 25.1], [25.1, 30.2]]);
      for (const [x, z, w, r] of [[20, -1.6, 44, 0], [20, 31.6, 44, 180], [-1.6, 15, 34, 90], [41.6, 15, 34, -90]]) K.plane(x, 1.5, z, w, 4, fogM, { rotY: r });
      // ---- the escalations office (NW): its door with the card reader (→ c6_escalations), a frosted sidelight ------
      K.wall(6, 0, 6, 5.07, H, PART, { skirting: true });
      K.wall(-0.1, 5, 6.07, 5, H, PART, { openings: [{ at: L4.esc[0] + 0.1, w: 1.0, h: 2.15 }, { at: 4.6, w: 0.8, h: 2.0, sill: 0.3, glass: true }], skirting: true });
      K.plane(4.5, 1.3, 5.08, 0.8, 0.5, frostTex(), { transparent: true });
      K.door({ id: 'c5_level4:escalations', x: L4.esc[0], z: 5, rot: 0, w: 0.95, style: 'wood', reader: 'card', locked: true, lockMsg: 'Keycard only.', key: ROOMS.c6_escalations ? 'keycard' : null, to: ROOMS.c6_escalations ? 'c6_escalations' : null, entry: 'door', sign: 'ESCALATIONS', color: '#5a4a3a', chapterLock: true });
      K.box(3, 0, 2.5, 5.9, 2.8, 4.9, { color: '#0a0c0c', roughness: 1 }, { collide: true, shadow: false });
      // ---- NE: the kitchenette (its east wall cut away for the camera in the stair core), Stairwell A's door ---------
      K.wall(29.2, -0.1, 29.2, 6.2, H, PART, { skirting: true });
      K.wall(28.9, 6.2, 40.1, 6.2, H, PART, { openings: [{ at: 31.3 - 28.9, w: 1.8, h: 2.3 }, { at: L4.stairsDoor[0] - 28.9, w: 1.0, h: 2.15 }], skirting: true });
      K.wall(35, 0, 35, 6.2, H, PART, { both: false, skirting: true });
      K.box(37.5, 0, 3.1, 5, H, 6.2, { color: '#0c0e0e', roughness: 1 }, { collide: true, shadow: false });
      K.door({ id: 'c5_level4:stairs', x: L4.stairsDoor[0], z: L4.stairsDoor[1], rot: 0, w: 1.0, style: 'fire', to: 'c5_stairs', entry: 'l4', sign: 'STAIRS A', signBack: 'LEVEL 4', when: () => !S.outage, world: 'fog' });
      K.prop('exit_sign', L4.stairsDoor[0], L4.stairsDoor[1] + 0.08, 180, { mount: 2.45, text: 'STAIRS' });
      K.outageOnly(() => {
        for (let i = 0; i < 6; i++) K.prop('contract_stack', 36.4 + i * 0.45, 6.55 + (i % 2) * 0.35, i * 23, { h: 1.6 + (i % 3) * 0.4 });
        K.blocker(35.6, 6.25, 39.9, 7.3, 'Contracts. Floor to ceiling. The stairs are behind them somewhere.');
      });
      // the kitchenette: bench, sink, fridge, microwave, the coffee machine, the break table, the noticeboard
      K.prop('sink_bench', 32.1, 0.36, 0, { len: 5.4, variant: 'office', upper: true });
      K.prop('fridge', 34.55, 1.4, -90, { variant: 'office' });
      K.prop('microwave', 30.4, 0.3, 0, { y: 0.92, time: '3:52' });
      K.box(33.4, 0.92, 0.3, 0.42, 0.5, 0.4, { color: '#1a1c1c', roughness: 0.35, metalness: 0.4 });
      K.light('led', 33.3, 1.3, 0.51, { color: '#ff2a1c', size: 0.008 });
      for (const [x, t] of [[31.2, 'WORLD\'S BEST TEAM LEADER'], [31.5, ''], [32.1, 'I ♥ TARGETS']]) K.prop('mug', x, 0.35, (x * 97) % 360, { y: 0.92, text: t });
      K.pickup('coffee', 32.6, 0.92, 0.42, { id: 'c5_level4:coffee', rot: 20 });
      K.breakTable(31.9, 3.6, 0, { id: 'c5_level4:break', time: [3, 52], clock: [29.28, 2.2, 3.4, 90] });
      K.prop('notice_board', 29.28, 1.6, 90, { title: 'KITCHEN', w: 1.0, h: 0.7, mount: 1.5 });
      K.prop('water_cooler', 34.5, 5.6, -90, {});
      K.prop('fluoro_tube', 32, 3.1, 0, { h: H - 0.03, variant: 'troffer', bank: 2, flicker: true, name: 'c5l4:kitchen' });
      K.outageOnly(() => { K.prop('receipt_strip', 31.2, 2.4, 0, { ceil: H, len: 1.3 }); K.prop('receipt_strip', 33.1, 4.6, 40, { ceil: H, len: 1.6 }); K.dress('receipts', [29.6, 1.0, 34.6, 5.8], 16, { seed: 571 }); });
      // ---- the east rooms: three meeting rooms with glass fronts and solid doors, the lift recess ------------------------
      const [mx0, mx1] = L4.mrX;
      K.wall(mx0, 8.2, 40.1, 8.2, H, PART, { skirting: true });
      for (const m of L4.mr) {
        K.wall(mx0, m.z0, mx0, m.z1, H, PART, { openings: [{ at: m.door - m.z0, w: 0.95, h: 2.15 }, { at: (m.door - m.z0) / 2, w: m.door - m.z0 - 0.8, h: 2.2, sill: 0.1, glass: true }, { at: (m.door - m.z0) + (m.z1 - m.door) / 2, w: m.z1 - m.door - 0.8, h: 2.2, sill: 0.1, glass: true }], skirting: true });
        K.wall(mx1, m.z0, mx1, m.z1, H, PART, { both: false, skirting: true });
        K.plane(mx0 + 0.02, 1.35, (m.z0 + m.door - 0.45) / 2, m.door - 0.45 - m.z0, 0.3, frostTex(), { rotY: -90, transparent: true });
        K.plane(mx0 + 0.02, 1.35, (m.door + 0.45 + m.z1) / 2, m.z1 - m.door - 0.45, 0.3, frostTex(), { rotY: -90, transparent: true });
        K.fogOnly(() => { K.plane(mx0 + 0.09, 1.55, (m.z0 + m.door - 0.45) / 2, m.door - 0.45 - m.z0 - 0.05, 1.1, blindsTex(), { rotY: -90, transparent: true, double: true }); });
        K.door({ id: 'c5_level4:mr' + m.name, x: mx0, z: m.door, rot: 90, w: 0.9, style: 'wood', sign: m.name, signBack: m.name, color: '#6a5a4a' });
        K.prop('meeting_table', (mx0 + mx1) / 2 + 0.3, (m.z0 + m.z1) / 2, 0, { len: 3.4, chairs: 6 });
        K.prop('fluoro_tube', (mx0 + mx1) / 2, (m.z0 + m.z1) / 2, 0, { h: H - 0.03, variant: 'troffer', lit: false });
      }
      for (const z of [13.0, 15.8, 20.6, 25.0]) K.wall(mx0, z, 40.1, z, H, PART, { skirting: true });
      K.box(34.15, 0, 14.4, 4.7, H, 2.8, { color: '#0c0e0e', roughness: 1 }, { collide: true, shadow: false });
      K.collider(mx1, 8.2, 40, 25.0, { h: H });
      for (const [i, z] of [[0, 13.7], [1, 15.1]]) K.prop('lift_doors', 31.8, z, -90, { floor: '4', sign: i ? '' : 'OUT OF SERVICE', w: 1.0 });
      K.collider(31.7, 13.0, 31.9, 15.8, { h: H });
      // MR1 "Harbour": a whiteboard with an objection-handling flow; MR2 "Summit": the projector; MR3: chairs pushed back
      K.prop('whiteboard', 32.9, 8.22, 0, { w: 2.2, h: 1.1, text: 'OBJECTION HANDLING\nFeel → Felt → Found\n"I understand how you feel"\nNEVER LET THEM LEAVE\nWITHOUT AN OFFER' });
      K.prop('projector_screen', 32.9, 15.84, 0, { w: 2.2, ceil: H, name: 'c5_projector' });
      K.light('screen', 32.9, 1.6, 16.7, { color: '#dde8ee', intensity: 1.6, distance: 5, name: 'c5l4:proj' });
      K.prop('desk_lamp', 34.5, 10.2, -120, { y: 0.74, lit: true, light: true });
      K.prop('monitor', 34.3, 23.3, -60, { y: 0.74, content: 'desktop' });
      K.light('screen', 34.0, 1.0, 23.0, { color: '#9ec8e8', intensity: 1.0, distance: 3.2 });
      K.pickup('coffee', 32.5, 0.74, 18.6, { id: 'c5_level4:mr2coffee', extraOnEasy: true, rot: 50 });
      K.prop('coffee_cup', 33.6, 17.8, 0, { y: 0.74 }); K.prop('coffee_cup', 31.8, 17.6, 0, { y: 0.74 });
      K.prop('fallen_chair', 34.8, 23.9, 30, {});
      K.prop('framed_photo', 32.8, 24.98, 180, { subject: 'percent', text: '104%', mount: 1.6, w: 0.5, h: 0.6 });
      // ---- the open plan (west): desk pods; "Chloe"'s desk by the window; the desk with the kid's drawing ----------
      const desk = (x, z, rot, o = {}) => { K.prop('desk', x, z, rot, { clutter: true, content: o.content, ...o }); const c = Math.cos(rot * D2R), sN = Math.sin(rot * D2R); if (o.chair !== false) K.prop('office_chair', x + sN * 0.7, z + c * 0.7, rot + 180 + (o.turn || 0), {}); };
      const pods = [[3.4, 8.2], [3.4, 12.2], [8.3, 8.2], [8.3, 12.2], [8.3, 16.2], [3.4, 20.6], [8.3, 20.6]];
      pods.forEach(([x, z], i) => { desk(x - 0.78, z - 0.42, 0, { turn: (i * 37) % 40 - 20 }); desk(x + 0.78, z - 0.42, 0, { chair: i % 3 !== 1 }); desk(x - 0.78, z + 0.42, 180, {}); desk(x + 0.78, z + 0.42, 180, { turn: 25 }); K.box(x, 0.74, z, 3.1, 0.35, 0.03, { tex: 'fabric_knit', color: '#35504e' }); });
      desk(0.85, 15.6, 90, { chair: false });
      K.prop('office_chair', 1.55, 15.6, -90, {});
      desk(0.85, 18.0, 90, {});
      // the kid's drawing and the photo frames with percentages for faces
      K.prop('drawing', 7.6, 16.0, 190, { y: 0.745, text: 'MY MUM AT WORK', variant: 'flat' });
      K.prop('framed_photo', 7.2, 15.72, 170, { variant: 'stand', subject: 'percent', text: '63%', y: 0.745 });
      K.prop('framed_photo', 2.8, 8.0, 10, { variant: 'stand', subject: 'percent', text: '87%', y: 0.745 });
      K.prop('framed_photo', 9.0, 12.0, -15, { variant: 'stand', subject: 'percent', text: '112%', y: 0.745 });
      K.prop('framed_photo', 3.9, 20.4, 5, { variant: 'stand', subject: 'percent', text: '94%', y: 0.745 });
      K.prop('cardigan_chair', 9.1, 17.0, 160, { chair: 'office', color: '#6a7a9a' });
      K.plane(2.42, 1.02, 11.78, 0.42, 0.26, emailTex(), { rot: [-8, 180, 0], emissive: true, emissiveIntensity: 0.7 });
      K.prop('filing_cabinet', 0.35, 23.4, 90, { n: 4 }); K.prop('filing_cabinet', 0.35, 24.0, 90, { n: 4 });
      K.prop('plant_pot', 0.6, 6.0, 0, { variant: 'dead' }); K.prop('plant_pot', 10.3, 24.0, 0, { variant: 'palm' });
      K.prop('printer', 5.6, 5.55, 180, { y: 0.74 }); K.box(5.6, 0, 5.55, 1.0, 0.74, 0.55, { color: '#3a3e40', roughness: 0.6 }, { collide: true });
      // the north desks, the Rep of the Month wall, a printer station
      for (let x = 7.8; x < 28; x += 3.4) { if (x > 14.2 && x < 25.5) { desk(x, 1.2, 180, { chair: x % 2 > 1 }); } else desk(x, 1.2, 180, {}); }
      K.plane(11, 2.35, 0.08, 3.2, 0.8, wallFameTex(), {});
      for (let i = 0; i < 6; i++) K.prop('framed_photo', 8.3 + i * 0.55, 0.08, 0, { subject: 'percent', text: ['118%', '142%', '142%', '142%', '96%', '142%'][i], mount: 1.55, w: 0.42, h: 0.5 });
      K.prop('photocopier', 27.5, 2.5, -90, { sweep: false });
      K.prop('stacked_chairs', 13.2, 4.8, 20, { n: 6 });
      // ---- the south zone: couches, a huddle board (Huddle Whiteboard 3), desks, the print room, the fire stairs --------
      K.prop('couch', 15.8, 28.9, 0, { variant: 'vinyl', color: '#2e4a4a', len: 2.2 });
      K.prop('couch', 19.0, 26.8, 90, { variant: 'vinyl', color: '#2e4a4a', len: 2.0 });
      K.box(16.6, 0, 26.9, 1.2, 0.4, 0.7, { tex: 'wood', color: '#4a3a2a' }, { collide: true });
      K.prop('huddle_board', 9.2, 27.0, 70, { text: huddle3Text });
      K.doc('huddle3', 9.2, 1.4, 27.0, { id: 'c5_level4:huddle3', model: 'none', r: 1.6 });
      for (let x = 22; x < 30; x += 3.2) desk(x, 28.6, 0, { chair: x < 28 });
      K.pickup('energy_drink', 22.3, 0.745, 28.4, { id: 'c5_level4:energy', rot: 70 });
      K.wall(32, 24.9, 40.1, 24.9, H, PART, { skirting: true });
      K.wall(32, 25, 32, 30.1, H, PART, { openings: [{ at: L4.printDoor[1] - 25, w: 0.95, h: 2.15 }], skirting: true });
      K.box(36, 0, 27.5, 7.8, H, 4.9, { color: '#0c0e0e', roughness: 1 }, { collide: true, shadow: false });
      K.door({ id: 'c5_level4:print', x: L4.printDoor[0], z: L4.printDoor[1], rot: 90, w: 0.9, style: 'wood', to: 'c5_print', entry: 'door', sign: 'PRINT ROOM', color: '#6a5a4a' });
      K.door({ id: 'c5_level4:fire', x: 0, z: L4.fire[1], rot: 90, w: 1.0, style: 'fire', to: ROOMS.c6_firestairs ? 'c6_firestairs' : null, entry: 'l4', sign: 'FIRE STAIRS B', locked: (s) => s.chapter < 6 || !ROOMS.c6_firestairs, lockMsg: 'It won\'t open from this side.' });
      K.prop('exit_sign', 0.08, L4.fire[1], 90, { mount: 2.45 });
      // ---- human leftovers, writing -------------------------------------------------------------------------------------
      K.dress('papers', [1, 6, 10, 23], 26, { seed: 581 });
      K.dress('papers', [6, 0.2, 28, 5.5], 14, { seed: 582 });
      K.dress('cups', [14, 25, 30, 29.5], 6, { seed: 583 });
      K.writing('FOLLOW UP TOMORROW', 6.02, 1.5, 3.2, 2.2, { rotY: 90 });
      K.writing('ASK THEM', 32.02, 1.4, 26.2, 1.2, { rotY: -90 });
      K.writing('IT\'LL BE FINE', 29.12, 1.5, 4.8, 1.6, { rotY: -90 });
      // ---- the Outage: contracts on every desk, receipts hanging, tethers, red LEDs, flickering tubes ------------------
      K.outageOnly(() => {
        pods.forEach(([x, z], i) => { for (const [dx, dz] of [[-0.9, -0.4], [0.7, -0.45], [-0.7, 0.4], [0.9, 0.45]]) K.prop('contract_stack', x + dx, z + dz, (i * 41 + dx * 90) % 360, { h: 0.5 + ((i + dx * 3) % 3) * 0.35, y: 0.745 }); });
        for (let x = 7.8; x < 28; x += 3.4) K.prop('contract_stack', x, 1.0, x * 30, { h: 0.9, y: 0.745 });
        for (const [x, z, l] of [[4, 10, 1.4], [8, 14, 1.9], [20, 3, 1.2], [18, 27, 1.6], [28.1, 12, 1.4], [28.1, 20, 1.8], [11.9, 18, 1.5], [24, 23, 1.3], [5, 22, 2.0]]) K.prop('receipt_strip', x, z, x * 20, { ceil: H, len: l });
        for (const [x, z] of [[6, 18], [11.9, 10], [22, 5], [28.1, 16.5]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len: 1.3 });
        K.prop('receipt_curtain', 11.9, 20.4, 0, { ceil: H, w: 2.2 });
        K.dress('receipts', [1, 6, 10, 23], 30, { seed: 584 });
        K.dress('contracts', [11, 22.2, 28.8, 24], 16, { seed: 585 });
        for (const [x, z] of [[6.1, 12], [15, 0.2], [30, 12], [22, 29.8], [0.1, 19]]) K.light('led', x, 1.9, z, { color: '#ff2a1c', blink: true, size: 0.01 });
        K.prop('fluoro_tube', 8.3, 14.2, 0, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 1 });
        K.prop('fluoro_tube', 20, 26.2, 90, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 2 });
        K.prop('fluoro_tube', 28.1, 18, 0, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 3, light: false });
        K.light('point', 3.4, 1.2, 15.6, { color: '#ff3b2a', intensity: 1.6, distance: 5 });
        K.light('point', 28.6, 2.1, 27.4, { color: '#8fb8b2', intensity: 2.2, distance: 8 });
        K.prop('fluoro_tube', 17, 3.0, 90, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 2 });
        // the way to the feature stair: a stuttering tube over the west walkway and one over the south zone, a cold
        // spill at the stair head (the Pedestal's light coming up out of the void)
        K.prop('fluoro_tube', 11.9, 16.5, 0, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 1 });
        K.prop('fluoro_tube', 24.5, 23.4, 90, { h: H - 0.03, variant: 'troffer', flicker: true, bank: 3 });
        K.light('point', 13.4, 2.2, 9.2, { color: '#9cc9c2', intensity: 2.4, distance: 6.5 });
      });
      // ---- light (Fog): tubes over the open plan and the ring (a few), the rest dead; screens ------------------------
      K.fogOnly(() => {
        K.prop('fluoro_tube', 5.8, 10.2, 0, { h: H - 0.03, variant: 'troffer', bank: 1, name: 'c5l4:open1' });
        K.prop('fluoro_tube', 5.8, 18.4, 0, { h: H - 0.03, variant: 'troffer', bank: 1, flicker: true });
        K.prop('fluoro_tube', 17, 3.0, 90, { h: H - 0.03, variant: 'troffer', bank: 2 });
        K.prop('fluoro_tube', 28.1, 11.8, 0, { h: H - 0.03, variant: 'troffer', bank: 3 });
        K.prop('fluoro_tube', 20, 26.8, 90, { h: H - 0.03, variant: 'troffer', bank: 2, light: false });
        for (const [x, z, r] of [[5.8, 22.5, 0], [11.9, 15, 0], [24, 3, 90], [11.9, 27, 90], [28.1, 21, 0]]) K.prop('fluoro_tube', x, z, r, { h: H - 0.03, variant: 'troffer', lit: false });
      });
      K.light('screen', 2.4, 1.1, 12.0, { color: '#9ec8e8', intensity: 0.9, distance: 3, real: false });
      K.light('screen', 1.25, 1.15, 15.6, { color: '#a8cfee', intensity: 1.5, distance: 3.6, world: 'fog', name: 'c5l4:chloescreen' });
      K.fogOnly(() => K.prop('fluoro_tube', 33.2, 7.2, 90, { h: H - 0.03, variant: 'troffer', bank: 1, flicker: true }));
      // ---- triggers: CALL 5 while the Standard roams; the print room's breathing is positional (onUpdate) ------------
      K.trigger([0, 5, 10.8, 30], (G) => C5_call5(G), { id: 'c5_level4:call5', once: false, when: () => L4_std() && !(S.calls && S.calls.luka5) && flag('c5_l4') && C5.stdOn });
      K.trigger([16, 24.2, 26, 30], (G) => C5_call5(G), { id: 'c5_level4:call5b', once: false, when: () => L4_std() && !(S.calls && S.calls.luka5) && flag('c5_l4') && C5.stdOn });
      // ---- examine lines (Aidan) --------------------------------------------------------------------------------------
      K.examine(7.4, 1.0, 16.2, 'Somebody\'s kid drew a picture on this desk. Their mum\'s a sixty-three.', { id: 'c5l4:drawing', r: 1.3 });
      K.examine(2.8, 1.0, 8.4, ['A photo frame on a desk. The face in it is just "87%".', 'On the next desk, "112%". Every frame. Every face.'], { id: 'c5l4:frames', r: 1.3 });
      K.examine(32.9, 1.4, 16.5, async (G) => { await G.msg('"Q3: WHAT DOES WINNING LOOK LIKE?"'); await G.think('Winning looks like everyone\'s asleep.'); }, { id: 'c5l4:projector', r: 2.4 });
      K.examine(20, 1.4, 22.4, ['The leaderboard. Three floors tall.', '"CHLOE — #1 — 30 MONTHS." [beat] Thirty months without a single bad one.'], { id: 'c5l4:board', r: 2.6, when: () => !S.outage });
      K.examine(26.6, 1.2, 15, 'It\'s a long way down. Two floors of nothing.', { id: 'c5l4:void', r: 1.4 });
      K.examine(9.8, 1.6, 0.6, ['"Rep of the Month." Six frames.', 'Four of them are the same number. One-forty-two. [beat] Hers.'], { id: 'c5l4:fame', r: 1.8 });
      K.examine(34.4, 1.3, 1.6, ['A tub of yoghurt with CHLOE on the lid in marker.', 'Seven weeks out of date. She never went home long enough to eat it.'], { id: 'c5l4:fridge', r: 1.2 });
      K.examine(29.4, 1.5, 1.6, ['"PLEASE WASH YOUR OWN MUGS."', 'Under it, in a different pen: "PLEASE HIT YOUR NUMBERS."'], { id: 'c5l4:notices', r: 1.2 });
      K.examine(9.1, 0.9, 17.0, 'A cardigan on the chair. Like she just went to get a coffee.', { id: 'c5l4:cardigan', r: 1.1 });
      K.examine(2.4, 1.0, 11.6, ['An email, half written. "Hi team, just a quick one —"', 'Then nothing. The cursor\'s still blinking.'], { id: 'c5l4:email', r: 1.2 });
      K.examine(31.5, 1.2, 14.4, ['The lifts. Every light on the panel says four.', 'Stuck on this floor. Same as me.'], { id: 'c5l4:lifts', r: 1.6 });
      K.examine(32.9, 1.3, 8.6, ['"Objection handling. Feel, felt, found."', '"Never let them leave without an offer." [beat] I used to say that one out loud.'], { id: 'c5l4:whiteboard', r: 1.8 });
      K.examine(20, 1.4, 0.3, 'Fog, all the way up the glass. I can\'t even see the car park.', { id: 'c5l4:window', r: 1.6 });
      K.examine(27.5, 1.1, 2.5, 'The copier\'s cold. Somebody left a stack of blank coaching forms in the tray.', { id: 'c5l4:copier', r: 1.3 });
      K.examine(13.2, 1.0, 4.8, 'Chairs stacked for the kick-off. Enough for the whole region.', { id: 'c5l4:chairs', r: 1.2 });
      K.examine(4.2, 1.1, 5.3, 'Frosted glass. "ESCALATIONS." There\'s a desk lamp in there, switched off.', { id: 'c5l4:escglass', r: 1.0 });
      K.examine(10, 1.2, 12.2, ['Contracts. Every desk. Every one of them signed.', 'Mine. Mine. Mine.'], { id: 'c5l4:contracts', r: 1.6, world: 'outage' });
      K.examine(14.5, 1.3, 14, ['They\'re holding each other up.', 'Every one of them smiling. [beat] She\'s at the top.'], { id: 'c5l4:tower', r: 2.2, world: 'outage' });
      K.examine(14.15, 1.0, 7.4, ['"Atrium closed — Regional Kick-off set-up in progress."', 'The stairs go down to Level 2. The rope\'s across them.'], { id: 'c5l4:gate', r: 1.3, world: 'fog' });
    },
    onUpdate(dt) {
      C5_ambient(['#5d6966', 0.44], ['#2a8a84', 0.5]);
      // the print room's breathing: slow, careful, close to the door
      const want = S.chapter === 5 && !flag('c5_chloe');
      if (want !== !!C5.breath) {
        try { Snd.loop('breath', want, { id: 'c5:printbreath', pos: [L4.printDoor[0] + 1.6, 1.0, L4.printDoor[1]], vol: 0.55, phone: false }); } catch (e) { /* audio */ }
        C5.breath = want;
      }
      // the meeting-room cameras look back across the whole floor: the far, static figures stay out of those frames
      const cam = Cam.current, mrCam = !!(cam && /^c5_level4:mr/.test(cam.id));
      if (mrCam !== !!C5.mrHide) {
        C5.mrHide = mrCam;
        for (const id of ['c5_level4:teth', 'c5_level4:reach', 'c5_level4:chloe']) {
          const en = Enemies.get(id);
          if (!en || en.removed) continue;
          if (mrCam) { if (!en.hidden) { en.hidden = true; en.data.c5hid = true; } } else if (en.data.c5hid) { en.hidden = false; en.data.c5hid = false; }
        }
      }
      // meeting rooms are hiding spots: inside one with its door shut, the Standard loses him
      const e = Enemies.standard.e;
      if (S.chapter === 5 && e && !e.removed && Player.pos && !busy()) {
        const p = Player.pos;
        for (const m of L4.mr) {
          if (p.x > L4.mrX[0] + 0.15 && p.x < L4.mrX[1] && p.z > m.z0 && p.z < m.z1) {
            const d = G_door('c5_level4:mr' + m.name);
            if (d && !d.isOpen) {
              if (e.data.seenT || e.data.lastSeen) { e.data.seenT = 0; e.data.lastSeen = null; }
              const st = Enemies.standard.state;
              if (st && st.mode !== 'patrol') Enemies.standard.patrol();
              C5.hidden = true;
            }
          }
        }
      }
    },
    onLeave() {
      C5_ambientOff();
      try { Snd.loop('breath', false, { id: 'c5:printbreath', fade: 0.5 }); } catch (e) { /* audio */ }
      C5.breath = false;
    },
    async onEnter(G, from) {
      if (S.chapter !== 5) return;
      if (from === 'c5_stairs' && !flag('c5_l4')) {
        G.set('c5_l4', true);
        note(G, 'Level 4. The escalations office — north-west.', 'c5_goal');
      }
      // the Standard roams Level 4 (from the moment it followed him up the stairwell until the Outage)
      if (L4_std() && !Enemies.standard.active) {
        if (from === 'c5_stairs' && C5.climbEta != null) {
          const eta = C5.climbEta; C5.climbEta = null;
          G.bg(async (G2) => {
            await G2.wait(Math.min(eta, 12));
            if (!L4_std() || Enemies.standard.active) return;
            G2.sfx('keys_far', { pos: [L4.stairsDoor[0], 1.4, L4.stairsDoor[1] - 1.5], vol: 0.8 });
            C5_startStandard('x:s0');
          });
        } else C5_startStandard(from === 'c5_print' ? 'nw' : 'sm');
      }
      if (from === 'c5_stairs' && G.once('c5:l4first')) {
        await G.wait(1.0);
        await G.think('Level 4. [beat] The lights are on. Nobody\'s here.');
        await G.wait(0.6);
        G.sfx('breath', { pos: [L4.printDoor[0] + 1.6, 1.0, L4.printDoor[1]], vol: 0.6, n: 2, phone: false });
      }
      // CALL 5 — the Standard is on the floor (or its keys are coming up the stairwell behind him): it rings as soon as
      // he is on Level 4, so no route to the print room can miss it (the open-plan triggers stay as a fallback)
      if (L4_std() && !(S.calls && S.calls.luka5)) { await G.wait(1.4); if (L4_std()) await C5_call5(G); }
    },
  });
  const G_door = (id) => { try { return World.door(id); } catch (e) { return null; } };
  // CALL 5 — while the Standard roams the floor
  async function C5_call5(G) {
    if ((S.calls && S.calls.luka5) || C5.call5Busy) return;
    C5.call5Busy = true;
    try { await G.call('luka5'); } finally { C5.call5Busy = false; }
  }


  // =================================================================================================================
  // 5F THE PRINT ROOM — 5.4 × 4.2 m, ceiling 2.6: the door in its west wall (z 2.1) → c5_level4:print; the copier
  // against the east wall — its sweeping light bar the only light; the paper shelves beside it; Chloe on the floor
  // between them. A lit stub of the south zone outside the door (seen through it). The north and south walls are
  // one-sided: the room's cameras sit outside them.
  // =================================================================================================================
  const PR = { W: 5.4, D: 4.2, H: 2.6, door: 2.1, copier: [4.95, 1.0], chloe: [4.66, 2.04], pin: [1.15, 2.42], tablet: [4.35, 1.62] };
  const printPosterTex = () => ctex('printposter', 256, 360, (x, w, h, r) => {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = BR.teal; x.fillRect(0, 0, w, 70);
    tx(x, 'PRINT', w / 2, 32, 26, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'RESPONSIBLY', w / 2, 60, 22, '#fff', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, 'Every page counts.', w / 2, 120, 22, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'Every rep counts.', w / 2, 152, 22, '#1d1d1d', { font: FN.serif, align: 'center' });
    tx(x, 'Double-sided by default.', w / 2, 220, 16, '#555', { align: 'center' });
    tx(x, 'Colour for customers only.', w / 2, 244, 16, '#555', { align: 'center' });
    Tex.drawWordmark(x, w * 0.3, h - 36, 26, { color: BR.teal });
    age(x, w, h, r, 0.5);
  });
  const certTex = () => ctex('printcert', 256, 180, (x, w, h, r) => {
    x.fillStyle = '#f7f3e4'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#b89a3a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    tx(x, 'TOP PERFORMER', w / 2, 52, 22, '#6a5418', { font: FN.serif, weight: 'bold', align: 'center' });
    tx(x, 'CHLOE', w / 2, 100, 34, '#1d1d1d', { font: FN.serif, weight: 'bold', align: 'center' });
    tx(x, '#1 — Retail Region', w / 2, 132, 16, '#444', { align: 'center' });
    tx(x, 'Month 30', w / 2, 156, 14, '#444', { align: 'center' });
    age(x, w, h, r, 0.2);
  });
  defineRoom({
    id: 'c5_print', name: 'PRINT ROOM', area: 'REGIONAL OFFICE — LEVEL 4', chapter: 5, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.03, color: '#303836' }, outageFog: { density: 0.034, color: '#0a1111' },
    bounds: [0, 0, PR.W, PR.D],
    entries: { door: [0.75, PR.door, 90], start: [0.75, PR.door, 90] },
    cameras: [
      // through the (cut-away) south wall: the whole room, following him
      { id: 'c5_print:south', vol: [0, 0, PR.W, PR.D], type: 'pan', pos: [2.55, 2.25, 7.5], target: [2.7, 0.6, 2.1], fov: 42, pan: { lag: 0.3, yaw: 30, pitch: 24 } },
      // through the (cut-away) north wall, low: the copier corner, the door beyond
      { id: 'c5_print:north', vol: [3.2, 0, PR.W, PR.D], pri: 1, type: 'static', pos: [2.2, 1.55, -3.1], target: [4.3, 0.55, 2.3], fov: 'fit' },
      // high in the corner over the paper shelves, back at the door: the lit strip of Level 4 beyond it
      { id: 'c5_print:door', vol: [0, 0, 1.6, PR.D], pri: 1, type: 'static', pos: [5.2, 2.4, 3.95], target: [0.6, 0.75, 2.05], fov: 'fit' },
      // through the (cut-away) north wall, down the room to the print-queue board: nothing between him and the wall
      { id: 'c5_print:queue', vol: [1.6, 2.2, 3.2, PR.D], pri: 1, type: 'static', pos: [1.1, 1.95, -2.7], target: [2.45, 0.5, 3.3], fov: 'fit' },
    ],
    build(K) {
      const W = PR.W, D = PR.D, H = PR.H, PART = { tex: 'plaster', color: '#b3b0a4' };
      K.floor(0, 0, W, D, { tex: 'lino', color: '#8a908a' });
      K.ceiling(0, 0, W, D, H, { tex: 'ceiling_tile', color: '#8a8b86' });
      K.wall(0, -0.08, 0, D + 0.08, H, PART, { openings: [{ at: PR.door + 0.08, w: 0.95, h: 2.15 }], skirting: true });
      K.wall(W, -0.08, W, D + 0.08, H, PART, { skirting: true });
      K.wall(-0.08, 0, W + 0.08, 0, H, PART, { both: false, skirting: true });
      K.wall(W + 0.08, D, -0.08, D, H, PART, { both: false, skirting: true });
      K.collider(-0.1, -0.3, W + 0.1, 0, { h: H }); K.collider(-0.1, D, W + 0.1, D + 0.3, { h: H });
      K.door({ id: 'c5_print:door', x: 0, z: PR.door, rot: 90, w: 0.9, style: 'wood', swing: -1, to: 'c5_level4', entry: 'print', sign: 'LEVEL 4', signBack: 'PRINT ROOM', color: '#6a5a4a' });
      // outside the door: a lit stub of the south zone (only ever seen through the doorway)
      K.floor(-3.2, 0, 0, D, { tex: 'vinyl_retail', color: '#8a8a82' });
      K.ceiling(-3.2, 0, 0, D, 2.9, { tex: 'ceiling_tile', color: '#8f908a' });
      K.wall(-3.2, D, -3.2, 0, 2.9, { tex: 'plaster', color: '#a9a69c' }, {});
      K.wall(-3.2, 0.02, 0, 0.02, 2.9, { tex: 'plaster', color: '#a9a69c' }, {});
      K.wall(0, D - 0.02, -3.2, D - 0.02, 2.9, { tex: 'plaster', color: '#a9a69c' }, {});
      K.collider(-3.3, 0, -0.02, D, { h: 3 });
      K.prop('fluoro_tube', -1.5, PR.door, 0, { h: 2.87, variant: 'troffer', bank: 1, name: 'c5pr:out' });
      K.prop('couch', -2.7, 1.2, 90, { variant: 'vinyl', color: '#2e4a4a', len: 1.8 });
      K.fogOnly(() => K.prop('plant_pot', -2.8, 0.55, 0, { variant: 'palm' }));
      // ---- the copier, its light bar the only light: a pooled glow pulsing with each sweep ------------------------------
      K.prop('photocopier', PR.copier[0], PR.copier[1], -90, { light: true, name: 'c5_copier' });
      K.light('point', 4.3, 1.15, 1.05, { color: '#cfeee6', intensity: 0.001, distance: 6.5, name: 'c5pr:sweep' });
      K.animate((dt, t) => {
        const l = C5.prSweep || (C5.prSweep = World.build && World.build.lights && (World.build.lights.find((x) => x.name === 'c5pr:sweep') || {}).handle);
        if (!l) return;
        const k = (t % 6) / 6, on = k < 0.35, f = on ? k / 0.35 : 0;
        const boost = C5.prFlash > 0 ? C5.prFlash : 0;
        l.set({ intensity: 0.02 + (on ? 5.5 * Math.sin(f * Math.PI) : 0) + boost, pos: [4.25, 1.15, 1.0 - 0.24 + f * 0.48] });
        if (C5.prFlash > 0) C5.prFlash = Math.max(0, C5.prFlash - dt * 40);
      });
      // the paper shelves; the trimmer bench; the recycling; the posters
      K.prop('shelf', 5.12, 3.45, -90, { len: 1.4, h: 1.8, d: 0.5, load: 'paper' });
      K.collider(4.86, 2.72, W, 4.18, { h: 1.8 });
      K.light('point', 0.85, 1.3, 2.3, { color: '#bcd6d0', intensity: 0.7, distance: 1.6, name: 'c5pr:fill', world: 'fog', on: false });
      K.box(2.6, 0, 0.35, 2.4, 0.9, 0.65, { tex: 'wood', color: '#6a5a48' }, { collide: true });
      K.box(2.6, 0.9, 0.35, 2.44, 0.04, 0.69, { color: '#d8d4ca', roughness: 0.5 });
      K.box(2.2, 0.94, 0.3, 0.46, 0.05, 0.36, { color: '#3a3a3a', roughness: 0.4 });
      K.box(2.2, 0.99, 0.12, 0.44, 0.1, 0.03, { tex: 'metal', color: '#b9bdbb' }, { rot: -18 });
      K.box(3.1, 0.94, 0.4, 0.3, 0.12, 0.22, { color: '#efece2', roughness: 0.8 });
      K.plane(3.4, 1.0, 0.32, 0.3, 0.21, certTex(), { rot: [-90, 0, 12] });
      K.plane(2.7, 1.0, 0.5, 0.3, 0.21, certTex(), { rot: [-90, 0, -8] });
      K.prop('box_stack', 4.08, 0.42, 20, { n: 3 });
      K.prop('bin', 0.5, 0.45, 0, { variant: 'recycling' });
      K.prop('bin', 1.05, 0.42, 0, { variant: 'office' });
      K.plane(1.4, 1.5, 0.02, 0.5, 0.7, printPosterTex(), {});
      K.prop('notice_board', 3.6, 3.12 + 1.06, 180, { title: 'PRINT QUEUE', w: 1.0, h: 0.6, mount: 1.55 });
      K.prop('fluoro_tube', 2.7, 2.1, 0, { h: H - 0.03, variant: 'troffer', lit: false });
      K.prop('exit_sign', 0.08, PR.door, 90, { mount: 2.4, text: 'EXIT' });
      K.dress('papers', [0.4, 0.8, 4.2, 3.9], 10, { seed: 591 });
      // Chloe's corner (before 5-2): her tablet face down on the floor
      if (!flag('c5_chloe')) K.box(PR.tablet[0], 0, PR.tablet[1], 0.26, 0.012, 0.19, { color: '#16181a', roughness: 0.3, metalness: 0.2 }, { rot: 20 });
      // ---- the Outage: the copier won't stop — receipts spilling off it; contracts to the ceiling; receipt strips ------
      K.outageOnly(() => {
        K.prop('receipt_curtain', PR.copier[0] - 0.2, PR.copier[1], 90, { ceil: H, w: 0.7 });
        for (const [x, z, l] of [[1.2, 1.2, 1.4], [2.4, 3.2, 1.8], [3.6, 1.8, 1.2], [0.9, 3.0, 1.1]]) K.prop('receipt_strip', x, z, x * 40, { ceil: H, len: l });
        for (let i = 0; i < 5; i++) K.prop('contract_stack', 0.45 + i * 0.42, 3.75 - (i % 2) * 0.3, i * 31, { h: 1.2 + (i % 3) * 0.45 });
        K.prop('tether_hanging', 3.3, 2.9, 0, { ceil: H, len: 1.2 });
        K.dress('receipts', [0.3, 0.6, 4.4, 3.9], 22, { seed: 592 });
        K.light('led', 5.36, 1.9, 2.0, { color: '#ff2a1c', blink: true, size: 0.01 });
        K.light('point', 1.8, 1.9, 2.8, { color: '#ff3b2a', intensity: 1.2, distance: 5 });
      });
      // the receipt map: the copier's output tray, printing on its own (after 5-2)
      K.pickup('rmap_office', PR.copier[0] - 0.42, 0.64, PR.copier[1] + 0.08, { id: 'c5_print:rmap', rot: 80, glint: true, when: () => flag('c5_chloe') && S.outage });
      // the pin she dropped on her way out: TOP PERFORMER (+ the doc)
      if (!(S.taken && S.taken['c5_print:pin'])) {
        let pinObj = null;
        try { pinObj = ITEMS.chloe_pin && ITEMS.chloe_pin.model ? ITEMS.chloe_pin.model() : null; } catch (e) { pinObj = null; }
        if (pinObj) { pinObj.position.set(PR.pin[0], 0.006, PR.pin[1]); pinObj.rotation.y = 0.7; pinObj.visible = flag('c5_chloe'); K.mesh(pinObj, {}); C5.pinObj = pinObj; }
        K.interact(PR.pin[0], 0.2, PR.pin[1], async (G) => {
          await Script.builtins.pickup(G, { item: 'chloe_pin', id: 'c5_print:pin', obj: C5.pinObj });
          await G.doc('chloe_pin');
        }, { id: 'c5_print:pinpick', r: 1.1, name: 'Top Performer pin', when: () => flag('c5_chloe') && !(S.taken && S.taken['c5_print:pin']) });
      }
      // ---- examine ----------------------------------------------------------------------------------------------------
      K.examine(PR.copier[0] - 0.4, 1.0, PR.copier[1], ['The copier. "READY."', 'The light bar goes back and forth under the glass. Nothing on it.'], { id: 'c5pr:copier', r: 1.2, world: 'fog' });
      K.examine(PR.copier[0] - 0.4, 1.0, PR.copier[1], ['It won\'t stop printing. Receipts. Metres of them.', 'Every one says the same total.'], { id: 'c5pr:copierO', r: 1.2, world: 'outage' });
      K.examine(4.5, 1.2, 3.45, 'Reams of paper. Enough to print everyone\'s numbers for a year.', { id: 'c5pr:shelves', r: 1.2 });
      K.examine(3.0, 1.0, 0.6, ['Certificates, fresh off the printer. "TOP PERFORMER — CHLOE."', 'Month thirty. [beat] She printed her own.'], { id: 'c5pr:certs', r: 1.3 });
      K.examine(1.4, 1.4, 0.3, '"Print responsibly. Every page counts." [beat] "Every rep counts."', { id: 'c5pr:poster', r: 1.2 });
      K.examine(3.6, 1.5, 4.0, ['The print queue. Forty jobs, all hers.', '"MONTH_END_FINAL.pdf." "MONTH_END_FINAL_v2.pdf." "MONTH_END_FINAL_v2_REAL.pdf."'], { id: 'c5pr:queue', r: 1.3 });
      K.examine(4.2, 0.4, 2.2, 'The floor where she was sitting. [beat] Still warm.', { id: 'c5pr:spot', r: 1.0, when: () => flag('c5_chloe') });
      K.examine(4.0, 1.0, 0.7, 'Boxes of glossy brochures. "The bundle — more of everything."', { id: 'c5pr:boxes', r: 1.2 });
    },
    onUpdate() { C5_ambient(['#46504e', 0.3], ['#2a8a84', 0.4]); },
    onLeave() { C5_ambientOff(); C5.prSweep = null; },
    async onEnter(G, from) {
      if (S.chapter !== 5) return;
      if (!flag('c5_chloe')) { await G.cutscene('5-2'); return; }
    },
  });

  // =================================================================================================================
  // CUTSCENE 5-2 "Print Room"
  // =================================================================================================================
  defineCutscene('5-2', async (G) => {
    const A = G.aidan;
    G.set('c5_chloe', true);
    // the Standard is done with this floor for now
    try { Enemies.standard.stop(); } catch (e) { /* none */ }
    C5.stdOn = false;
    const C = G.actor('chloe', 'chloe', { rig: { hold: {} } });
    if (C.raw) C.raw.idleLife = false;
    if (A.raw) A.raw.idleLife = false;
    const [cx, cz] = PR.chloe;
    C.place(cx, cz, -90); C.pose('sit_knees'); C.expr('flat'); C.eyes('down'); C.look(null);
    A.place(-0.75, PR.door, 90); A.pose('idle');
    const door = G.door('c5_print:door');
    const fill = G.light('c5pr:fill'); if (fill) fill.on(true);
    // 1. SHOT — a tight room lit only by the photocopier's light bar sweeping every few seconds. Chloe on the floor
    //    between the copier and the paper shelves, knees up, her tablet face down beside her, breathing slow.
    await G.fade(1, 0);
    G.cam({ pos: [2.1, 1.2, 3.55], target: [cx - 0.05, 0.62, cz], fov: 40, to: { pos: [2.75, 1.05, 3.2], target: [cx - 0.05, 0.62, cz], fov: 36 }, dur: 9 });
    await G.fade(0, 1.2);
    G.sfx('breath', { pos: [cx, 0.8, cz], vol: 0.55, n: 2, phone: false });
    await G.wait(2.6);
    G.sfx('breath', { pos: [cx, 0.8, cz], vol: 0.5, n: 2, phone: false });
    await G.wait(2.2);
    // 2. SHOT — Aidan in the doorway
    if (door) door.open();
    G.sfx('door_open', { pos: [0, 1.1, PR.door], vol: 0.7 });
    G.cam({ pos: [cx - 0.55, 0.72, cz + 0.42], target: [0.3, 1.42, PR.door], fov: 38 });
    await A.walkTo(0.38, PR.door, { speed: 0.8, face: 90 });
    A.look(C);
    await G.wait(0.5);
    await G.say('AIDAN', 'Chloe?');
    C.expr('smile_huge');
    await G.say('CHLOE', 'Hi! Sorry. Sorry. I just— I needed a minute. [beat] Can you keep watch? Just for a minute.');
    //    Aidan turns and stands in the doorway with his back to her.
    A.look(null);
    await A.turn(-90, 0.9);
    // 3. SHOT — over Chloe's shoulder onto Aidan's back, then close on Chloe
    {
      const h = C5_headAt(C);
      G.cam({ pos: [h.x + 0.36, h.y - 0.02, h.z - 0.3], target: [0.4, 1.25, PR.door], fov: 36, to: { pos: [h.x + 0.32, h.y - 0.02, h.z - 0.27], fov: 34 }, dur: 8 });
    }
    C.expr('flat');
    await G.say('CHLOE', 'I was going to submit my month. [beat] Eleven short. I\'ve never been short. Thirty months.');
    {
      C.look([cx - 2.5, 0.95, cz + 0.1]);
      const p0 = C5_rel(C, 0.62, 0.14, -0.2), p1 = C5_rel(C, 0.55, 0.12, -0.2), t0 = C5_rel(C, 0.05, 0, -0.06);
      G.cam({ pos: p0, target: t0, fov: 30, to: { pos: p1, target: t0, fov: 28 }, dur: 14 });
    }
    C.expr('tired'); C.eyes('ahead');
    await G.beat();
    await G.say('CHLOE', 'You know what happens the first month you\'re not number one?');
    await G.say('AIDAN', '...Nothing?');
    q(C.gesture('laugh'));                                          // (a laugh that isn't one)
    C.expr('sad');
    await G.say('CHLOE', 'Nothing. [beat] That\'s the thing. Nothing. And then it\'s just... me. With no number on it.');
    // 4. SHOT — two-shot (through the south wall). Aidan sits down against the door frame.
    G.cam({ pos: [1.4, 1.3, 7.6], target: [2.55, 0.55, 2.0], fov: 44, to: { pos: [1.45, 1.26, 7.3], fov: 43 }, dur: 30 });
    A.place(0.34, PR.door - 0.28, 150);
    A.pose('sit_floor', { blend: 1.2 });
    await G.wait(1.3);
    A.look(C); C.look(A); C.eyes('down');
    await G.say('AIDAN', 'You\'re the best rep I\'ve ever seen.');
    C.expr('smile');
    await G.say('CHLOE', 'I\'m the best rep you\'ve seen in six months. [beat] I taught you to always offer the bundle.');
    await G.say('AIDAN', 'Yeah.', { italic: false });
    C.eyes('at', A); C.expr('flat');
    await G.say('CHLOE', 'Did you? Offer it? To her? The one you\'re looking for?');
    //    … close on Aidan for the long beat
    {
      const p0 = C5_rel(A, 0.95, -0.26, -0.24), t0 = C5_rel(A, 0.05, 0, -0.2);
      G.cam({ pos: p0, target: t0, fov: 30, to: { pos: C5_rel(A, 0.86, -0.24, -0.23), target: t0, fov: 29 }, dur: 10 });
    }
    if (A.raw) { A.raw.expr('sad'); A.raw.eyes('down'); }
    await G.longBeat();
    await G.say('AIDAN', '...Yeah.');
    G.cam({ pos: [1.4, 1.3, 7.6], target: [2.55, 0.55, 2.0], fov: 44, to: { pos: [1.45, 1.26, 7.2], fov: 42 }, dur: 30 });
    C.expr('sad'); C.eyes('down');
    await G.say('CHLOE', 'I\'m sorry. [beat] I never said check what they actually need first. I never said that. I just said the bundle.');
    if (A.raw) A.raw.eyes('at', C.raw);
    await G.say('AIDAN', 'It\'s not your fault.');
    C.eyes('at', A);
    await G.say('CHLOE', 'It\'s not all yours either.');
    await G.wait(0.8);
    // 5. SHOT — the copier light sweeps, and in its flash, for a single frame, the room is Outage. The siren starts.
    G.cam({ pos: [2.3, 1.62, 0.7], target: [PR.copier[0] - 0.2, 0.85, 1.55], fov: 44 });
    // (the light banks die in the transition: a cold spill from the copier's glass keeps her readable through it)
    G.addLight('point', { pos: [PR.copier[0] - 0.6, 1.5, PR.copier[1] + 0.5], color: '#cfeee6', intensity: 2.2, distance: 3.6 });
    await G.wait(0.9);
    C5.prFlash = 9;
    G.sfx('copier', { pos: [PR.copier[0], 1.0, PR.copier[1]], vol: 0.9 });
    G.setOutage(true);
    await G.frame();
    G.setOutage(false);
    await G.frame();
    const outage = G.outage(true);                                   // the siren; the swap lands as she goes
    G.set('c5_outage', true);
    await G.wait(0.6);
    //    CHLOE (standing, smoothing her uniform, the bright voice back)
    C.pose('idle', { blend: 0.9 });
    q(C.gesture('stand_up'));
    await G.wait(1.0);
    q(C.gesture('smooth_uniform'));
    C.expr('smile_huge'); C.eyes('ahead'); C.look(null);
    G.cam({ pos: [1.7, 1.25, 3.05], target: [cx - 0.35, 1.35, cz - 0.05], fov: 40 });
    await G.say('CHLOE', 'Oh. That\'s me. [beat] They\'re calling the numbers.');
    if (A.raw) A.raw.expr('wide');
    await G.say('AIDAN', 'Chloe, wait—');
    //    She walks out past him. Her pins clink like the Standard's keys.
    G.cam({ pos: [3.7, 1.4, 3.75], target: [0.3, 1.05, PR.door], fov: 44 });
    const walk = q(C.walkTo([[cx - 1.2, cz + 0.3], [0.95, PR.door + 0.32], [-0.4, PR.door + 0.3], [-2.4, 3.3]], { speed: 1.3 }));
    for (let i = 0; i < 5; i++) { G.sfx('pins', { pos: [C.pos.x, 1.2, C.pos.z], vol: 0.75 }); await G.wait(0.62); }
    await walk;
    await outage;
    await G.wait(0.6);
    // state (plain statements)
    C.remove();
    { const f = G.light('c5pr:fill'); if (f) f.on(false); }
    if (C5.pinObj) C5.pinObj.visible = true;
    A.place(0.9, PR.door, 90);
    A.pose('idle');
    if (A.raw) { A.raw.expr('sad'); A.raw.eyes('ahead'); A.raw.idleLife = true; }
    A.look(null);
    if (!S.outage) G.setOutage(true);
    G.set('c5_outage', true);
    note(G, 'Chloe went down to the atrium. The feature stair.', 'c5_goal');
    G.camRelease();
  }, { letterbox: true, skippable: true });


  // =================================================================================================================
  // 5G THE ATRIUM — the Level 2 floor under the void (the same x/z as Level 4: x 13–27, z 8–22; y 0 here = Level 2).
  // Three storeys of balconies above (L3 at 3.6, L4 at 7.2), the leaderboard on the north side, the feature stair down
  // the west side (from Level 4 at z 8 to the floor at z 21.6). The Pedestal (Outage): the column at (20, 15.2) with
  // five kneeling tiers, the top plinth and the figure with Chloe's face; six base plinths round its foot; three
  // spotlights sweeping the floor from rigs on the Level 4 balustrade.
  // =================================================================================================================
  const AT = { V: [13, 8, 27, 22], cx: 20, cz: 15.2, sx: [13.1, 15.2], top: 8, bot: 21.6, L3: 3.6, L4: 7.2, roof: 10.8, entryZ: 11.3 };
  const AT_stairY = (z) => AT.L4 * clamp((AT.bot - z) / (AT.bot - AT.top), 0, 1);
  const BEAM_O = [[26.4, 8.7, 8.6], [26.4, 8.7, 21.5], [16.0, 8.7, 21.5]];
  const BEAM_R = 1.1;
  // a beam's haze: brightest at the lamp, thinning toward the floor (cylinder v: 0 at the wide end, 1 at the lamp)
  const beamTex = () => ctex('beamhaze', 8, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  const discTex = () => ctex('beamdisc', 128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,248,230,1)'); g.addColorStop(0.72, 'rgba(255,244,220,0.85)'); g.addColorStop(0.9, 'rgba(255,240,210,0.25)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // the leaderboard's screen, repainted (the countdown in 5-4)
  function C5_boardPaint(text) {
    return (c, W, H) => {
      c.fillStyle = '#050d0e'; c.fillRect(0, 0, W, H);
      c.fillStyle = BR.teal; c.fillRect(0, H * 0.78, W, H * 0.22);
      let sz = H * 0.13; c.font = `900 ${sz}px ${FN.heavy}`;
      while (c.measureText(text).width > W * 0.9 && sz > 10) { sz -= 2; c.font = `900 ${sz}px ${FN.heavy}`; }
      tx(c, text, W / 2, H * 0.55, sz, '#ffffff', { font: FN.heavy, weight: '900', align: 'center' });
      tx(c, 'REGIONAL LEADERBOARD', W / 2, H * 0.2, H * 0.06, BR.yellow, { weight: 'bold', align: 'center', spacing: 6 });
      try { Tex.drawWordmark(c, W * 0.4, H * 0.93, H * 0.1, { color: BR.yellow }); } catch (e) { /* cosmetic */ }
    };
  }
  function C5_board(G, text) {
    const b = (G && G.obj && G.obj('c5_board')) || null;
    const scr = b && b.userData && b.userData.screen;
    if (scr && scr.draw) scr.draw(C5_boardPaint(text));
  }

  // ---- the Pedestal's visual state (rebuilt with the room; the fight drives it) ----------------------------------
  function C5_pedBuild(K) {
    const P = C5.ped = { level: 0, colY: 0, broken: [false, false, false, false, false, false], fight: false, crawl: [], spawnT: 4, paT: 1.5, pa2T: 0, t: 0, hitFx: 0, beamPh: 0, figMode: 'top', figY: null, fall: null };
    const root = new THREE.Group(); root.name = 'c5:pedestal'; root.position.set(AT.cx, 0, AT.cz);
    P.root = root;
    P.tw = C5_towerColumn(root);
    P.base = [];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + Math.PI / 6, bp = C5_basePlinth(i);
      bp.position.set(Math.sin(a) * TWR.ring, 0, Math.cos(a) * TWR.ring); bp.rotation.y = a + Math.PI;
      root.add(bp); P.base.push(bp);
      const wx = AT.cx + Math.sin(a) * TWR.ring, wz = AT.cz + Math.cos(a) * TWR.ring;
      bp.userData.wpos = [wx, wz];
      K.collider(wx - 0.45, wz - 0.45, wx + 0.45, wz + 0.45, { h: 2.6, name: 'c5ped:pl' + i, world: 'outage' });
    }
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.95, 28), new THREE.MeshBasicMaterial({ color: '#010202' })); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.012; root.add(pit);
    K.collider(AT.cx - 0.6, AT.cz - 0.6, AT.cx + 0.6, AT.cz + 0.6, { h: 3, name: 'c5ped:col', world: 'outage' });
    // beams: a cone of light from each rig to its spot on the floor, the spot itself
    P.beams = BEAM_O.map((o, i) => {
      const cm = new THREE.MeshBasicMaterial({ map: beamTex(), color: '#fff2d6', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, BEAM_R, 1, 24, 1, true), cm); cone.renderOrder = 4;
      const dm = new THREE.MeshBasicMaterial({ map: discTex(), color: '#fff4dc', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(BEAM_R * 2.3, BEAM_R * 2.3), dm); disc.rotation.x = -Math.PI / 2; disc.renderOrder = 4;
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 12), new THREE.MeshStandardMaterial({ color: '#1a1c1c', roughness: 0.4, metalness: 0.6 }));
      housing.position.set(o[0], o[1], o[2]);
      const g = new THREE.Group(); g.add(cone); g.add(disc); g.add(housing);
      K.mesh(g, { world: 'outage' });
      return { o, cone, disc, housing, x: 20, z: 15, light: null };
    });
    K.mesh(root, { world: 'outage' });
    // the figure at the top: Chloe's face, polished, arms at her sides, turning
    const fig = K.npc('c5_topfig', 'chloe', AT.cx, AT.cz, 0, { world: 'outage', anim: 'stand_still', rig: { hold: {} } });
    if (fig && fig.root) {
      P.tw.col.add(fig.root); fig.root.position.set(0, P.tw.figY, 0);
      try { fig.expr('smile_huge'); fig.setTint('#f4f0e8', 0.4); fig.idleLife = false; } catch (e) { /* rig */ }
    }
    P.fig = fig;
    // lights: two of the beams are real spots; the figure's own glow; the plinths' cold backlight
    K.light('spot', BEAM_O[0][0], BEAM_O[0][1], BEAM_O[0][2], { target: [20, 0, 12], angle: 7.5, penumbra: 0.35, intensity: 90, distance: 18, color: '#fff1d8', name: 'c5at:beam0', world: 'outage' });
    K.light('spot', BEAM_O[1][0], BEAM_O[1][1], BEAM_O[1][2], { target: [20, 0, 18], angle: 7.5, penumbra: 0.35, intensity: 90, distance: 18, color: '#fff1d8', name: 'c5at:beam1', world: 'outage' });
    K.light('point', AT.cx, P.tw.figY + 2.4, AT.cz + 1.4, { color: '#fff4e0', intensity: 7, distance: 6, name: 'c5at:topglow', world: 'outage' });
    K.light('point', AT.cx, 1.3, AT.cz, { color: '#dff6f2', intensity: 3.2, distance: 7.5, name: 'c5at:baseglow', world: 'outage' });
    // the figure's pool of light from above (a pale cone into the dark)
    { const m = new THREE.MeshBasicMaterial({ map: beamTex(), color: '#fff6e4', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.75, 6, 20, 1, true), m); c.position.set(0, P.tw.figY + 4.6, 0); c.renderOrder = 4; P.tw.col.add(c); P.topCone = c; }
    // after the fight: how it was left
    if (flag('c5_bossDone')) {
      P.broken = [true, true, true, true, true, true]; P.level = 6;
      for (const bp of P.base) bp.visible = false;
      for (const t of P.tw.tiers) t.visible = false;
      P.tw.top.visible = false;
      if (!flag('chloeSaved') && fig && fig.root) { P.figMode = 'float'; P.figY = P.tw.figY; } else if (fig && fig.root) fig.root.visible = false;
      P.colY = 0;
      for (let i = 0; i < 6; i++) { const c = C5_collider('c5ped:pl' + i); if (c) c.enabled = false; }
    }
    K.animate((dt) => C5_pedAnim(dt));
  }
  const C5_collider = (name) => { try { return (World.build.colliders || []).find((c) => c.name === name) || null; } catch (e) { return null; } };
  // per frame (room animate): tiers turning, the figure turning, the column settling to its level, beams sweeping
  function C5_pedAnim(dt) {
    const P = C5.ped;
    if (!P || !P.root || !S.outage) return;
    P.t += dt;
    for (const t of P.tw.tiers) t.rotation.y += t.userData.spin * dt;
    for (const bp of P.base) if (bp.userData.rep && !bp.userData.broken) bp.userData.rep.rotation.y = Math.sin(P.t * 0.4 + bp.id) * 0.35;
    // the column: down a level for each broken plinth (five levels; the sixth brings it all down)
    const want = P.level >= 6 ? -TWR.tierH * 5 - 6 : -TWR.tierH * Math.min(5, P.level);
    if (Math.abs(P.colY - want) > 1e-3) {
      const was = P.colY;
      P.colY = want < P.colY ? Math.max(want, P.colY - 1.6 * dt) : Math.min(want, P.colY + 1.6 * dt);
      if (!P.rumble && Math.abs(was - P.colY) > 0) { P.rumble = true; sfx('lift_groan', { pos: [AT.cx, 2, AT.cz], vol: 0.9 }); try { Cam.shake(0.18, 1.4); } catch (e) { /* cam */ } }
    } else P.rumble = false;
    P.tw.col.position.y = P.colY;
    // tiers sunk under the floor go dark
    P.tw.tiers.forEach((t) => { t.visible = P.colY + t.position.y + TWR.plH > -0.05 && !(P.level >= 6); });
    P.tw.top.visible = P.level < 6 || P.figMode === 'float' ? P.level < 6 : false;
    // the figure: turning; flinching when struck; floating on after the tower's gone (5-4alt)
    const fig = P.fig;
    if (fig && fig.root) {
      fig.root.rotation.y += (0.32 + (P.hitFx > 0 ? 3 : 0)) * dt;
      if (P.hitFx > 0) { P.hitFx -= dt; fig.root.position.x = Math.sin(P.t * 60) * 0.03 * P.hitFx; } else fig.root.position.x = 0;
      if (P.figMode === 'float') {
        if (fig.root.parent !== P.root) { P.root.add(fig.root); if (P.topCone) P.root.add(P.topCone); }
        P.figY = P.figY == null ? P.tw.figY : P.figY + (P.tw.figY - P.figY) * Math.min(1, dt * 0.45);
        fig.root.position.y = P.figY + Math.sin(P.t * 0.7) * 0.05;
        if (P.topCone) P.topCone.position.y = P.figY + 4.6;
      }
      if (P.topCone) P.topCone.visible = P.level < 6 || P.figMode === 'float';
    }
    // lights follow
    const tg = C5_light('c5at:topglow');
    if (tg) { const fy = P.figMode === 'float' ? (P.figY ?? P.tw.figY) : P.colY + P.tw.figY; tg.set({ pos: [AT.cx, fy + 2.4, AT.cz + 1.4] }); tg.on(P.level < 6 || P.figMode === 'float'); }
    const bg = C5_light('c5at:baseglow'); if (bg) bg.on(P.level < 6 || P.figMode === 'float');
    // beams: three spots crossing the floor (faster as it comes down)
    P.beamPh += dt * (1 + 0.14 * P.level) * (P.beamsOff ? 0 : 1);
    const ph = P.beamPh;
    const tgt = [
      [20.8 + 4.8 * Math.sin(0.37 * ph), 15 + 5.2 * Math.sin(0.23 * ph + 1.3)],
      [20.8 + 4.8 * Math.sin(0.29 * ph + 2.1), 15 + 5.2 * Math.cos(0.31 * ph + 0.4)],
      [20.8 + 4.8 * Math.cos(0.21 * ph + 4.0), 15 + 5.2 * Math.sin(0.41 * ph + 2.2)],
    ];
    P.beams.forEach((b, i) => {
      const x = clamp(tgt[i][0], 16.2, 26.2), z = clamp(tgt[i][1], 8.9, 21.3);
      b.x = x; b.z = z;
      const on = !P.beamsOff && P.level < 6;
      b.cone.visible = on; b.disc.visible = on;
      if (!on) return;
      const o = b.o, dx = x - o[0], dy = 0 - o[1], dz = z - o[2], L = Math.hypot(dx, dy, dz);
      b.cone.position.set((o[0] + x) / 2, o[1] / 2, (o[2] + z) / 2);
      b.cone.scale.set(1, L, 1);
      b.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx / L, -dy / L, -dz / L));
      b.disc.position.set(x, 0.03, z);
      if (i < 2) { const l = C5_light('c5at:beam' + i); if (l) { l.set({ pos: o, target: [x, 0, z] }); l.on(on); } }
    });
    if (P.beamsOff || P.level >= 6) for (let i = 0; i < 2; i++) { const l = C5_light('c5at:beam' + i); if (l) l.on(false); }
  }
  const C5_light = (name) => { try { const l = (World.build.lights || []).find((x) => x.name === name); return l ? l.handle : null; } catch (e) { return null; } };

  // ---- the fight's enemies: the six base plinths (HP 40), the top figure (any hit: chloeSaved false), the reps ------
  Enemies.defineType('c5_plinth', {
    hp: 40, radius: 0.5, height: 2.4, downs: false, stompable: false, lockable: true, body: false, threat: false, tell: 'plain',
    // (pinned: a hit's push-back would move its hitbox off the plinth it stands for)
    create(e, def) { e.obj = new THREE.Group(); e.obj.name = 'c5_plinth'; e.pos = e.obj.position; e.data.i = def.idx; e.obj.position.set(def.pos[0], 0, def.pos[1]); e.placed = true; e.pinned = true; },
    // (r reaches past the corners of the plinth's own ±0.45 m collider: Enemies.hitTest checks the line of sight to the
    // hitbox's rim, and a rim point inside that collider would block every swing from a diagonal approach)
    hitbox: (e) => [{ x: e.pos.x, z: e.pos.z, r: 0.7, y0: 0, y1: 2.4 }],
    stun: () => false, knockdown: () => false,
    onHit(e, n) {
      const P = C5.ped, bp = P && P.base[e.data.i];
      if (bp) { bp.userData.hitT = 0.25; bp.rotation.z = (Math.random() - 0.5) * 0.06; }
      sfx('glass_knock', { pos: [e.pos.x, 1.0, e.pos.z], vol: 0.8 });
      return true;
    },
    update(e, dt) {
      const P = C5.ped, bp = P && P.base[e.data.i];
      if (bp && bp.userData.hitT > 0) { bp.userData.hitT -= dt; if (bp.userData.hitT <= 0) bp.rotation.z = 0; }
    },
    onDie(e) { C5_plinthBreak(e.data.i); setTimeout0(() => { try { e.remove(); } catch (err) { /* gone */ } }); },
  });
  // (a frame later, outside the engine's resolve loop)
  const setTimeout0 = (fn) => { C5.later = C5.later || []; C5.later.push({ t: 0.05, fn }); };
  function C5_laterTick(dt) {
    if (!C5.later || !C5.later.length) return;
    for (const l of C5.later.slice()) { l.t -= dt; if (l.t <= 0) { C5.later.splice(C5.later.indexOf(l), 1); try { l.fn(); } catch (e) { console.error('[c5] later', e); } } }
  }
  function C5_plinthBreak(i) {
    const P = C5.ped;
    if (!P || P.broken[i]) return;
    P.broken[i] = true;
    P.level = P.broken.filter(Boolean).length;
    const bp = P.base[i];
    const [wx, wz] = bp.userData.wpos;
    sfx('shatter', { pos: [wx, 1.0, wz], vol: 1.0 }); sfx('thud', { pos: [wx, 0.4, wz], vol: 0.9 });
    try { Cam.shake(0.3, 0.5); } catch (e) { /* cam */ }
    const c = C5_collider('c5ped:pl' + i); if (c) c.enabled = false;
    bp.userData.broken = true;
    // the plinth caves in; its rep slides off and lies still
    let t = 0;
    const rep = bp.userData.rep, pl = bp.userData.pl;
    C5.later = C5.later || [];
    const step = { t: 0, fn: null };
    const anim = (dt) => {
      t += dt; const k = Math.min(1, t / 0.7);
      pl.scale.y = 1 - 0.8 * k; pl.position.y = 0.55 * (1 - 0.8 * k);
      for (const ch of bp.children) if (ch !== pl && ch !== rep) ch.visible = k < 0.3;
      if (rep) { rep.position.y = 1.1 * (1 - k) + 0.05; rep.rotation.x = -0.12 - 1.35 * k; rep.position.z = 0.35 * k; }
      return k >= 1;
    };
    (C5.anims = C5.anims || []).push(anim);
    if (P.level === 5) G_bgThink('It\'s low enough. [beat] I could reach her.');
    if (P.level >= 6) { const cc = C5_collider('c5ped:col'); if (cc) cc.enabled = false; }
  }
  function C5_animTick(dt) { if (!C5.anims) return; C5.anims = C5.anims.filter((f) => { try { return !f(dt); } catch (e) { return false; } }); }
  // an aside while the fight runs (never blocks)
  function G_bgThink(text) { try { Script.run(async (G) => { await G.think(text); }, { control: true, name: 'c5:aside' }); } catch (e) { /* script */ } }

  Enemies.defineType('c5_top', {
    hp: 1e9, radius: 0.4, height: 1.7, downs: false, stompable: false, lockable: false, body: false, threat: false, tell: 'plain',
    create(e) { e.obj = new THREE.Group(); e.obj.name = 'c5_top'; e.pos = e.obj.position; e.obj.position.set(AT.cx, 0, AT.cz); e.placed = true; },
    hitbox(e) {
      const P = C5.ped;
      if (!P || !P.fight || P.level < 5 || P.level >= 6) return [];
      const feet = P.colY + P.tw.figY;
      // (r 0.9: past the corners of the column's ±0.6 m collider, or the line-of-sight test would refuse every swing)
      return feet > 2.0 ? [] : [{ x: AT.cx, z: AT.cz, r: 0.9, y0: feet, y1: feet + 1.7 }];
    },
    stun: () => false, knockdown: () => false,
    onHit(e) {
      const P = C5.ped;
      if (!P || !P.fight) return false;
      S.flags.c5_hitTop = true; S.flags.chloeSaved = false;
      P.hitFx = 0.6;
      sfx('glass_knock', { pos: [AT.cx, 2.2, AT.cz], vol: 1.0 }); sfx('static', { dur: 0.3, vol: 0.35 });
      try { Enemies.say('Welcome in!', 'distort', 1.4); } catch (err) { /* voice */ }
      return false;
    },
    update() { /* the column moves it */ },
  });

  // the reps: they let go of the tier above, drop, and crawl (HP 20)
  Enemies.defineType('c5_rep', {
    hp: 20, radius: 0.36, height: 0.75, downs: false, stompable: false, lockable: true, body: false, threat: (e) => !e.resolved && e.data.phase !== 'drop', tell: 'pulse',
    create(e, def) {
      const g = C5_crawler(); e.obj = g; e.pos = g.position;
      g.position.set(def.pos[0], def.y || 0, def.pos[1]); e.placed = true;
      Object.assign(e.data, { phase: def.y > 0.1 ? 'drop' : 'crawl', vy: 0, t: 0, cd: 0.8, wind: 0, spin: (Math.random() - 0.5) * 6, gait: Math.random() * 6 });
      if (e.data.phase === 'drop') g.rotation.x = -0.6;
    },
    hitbox: (e) => [{ x: e.pos.x, z: e.pos.z, r: 0.42, y0: e.pos.y, y1: e.pos.y + 0.8 }],
    knockdown: () => false,
    update(e, dt) { C5_repUpdate(e, dt); },
    onDie(e) {
      e.data.phase = 'dead'; e.data.deadT = 0;
      sfx('thud', { pos: [e.pos.x, 0.3, e.pos.z], vol: 0.8 });
    },
  });
  function C5_repUpdate(e, dt) {
    const D = e.data, g = e.obj;
    D.t += dt;
    if (D.phase === 'dead') {
      D.deadT += dt;
      g.scale.y = Math.max(0.35, 1 - D.deadT * 1.4);
      for (const l of g.userData.limbs || []) l.piv.rotation.x *= 0.9;
      if (D.deadT > 1.4) { g.traverse((o) => { if (o.material && o.material.opacity !== undefined && !o.userData.fadeMat) { o.material = o.material.clone(); o.material.transparent = true; o.userData.fadeMat = true; } if (o.userData.fadeMat) o.material.opacity = Math.max(0, 1 - (D.deadT - 1.4)); }); }
      if (D.deadT > 2.5 && !D.gone) { D.gone = true; setTimeout0(() => { try { e.remove(); } catch (err) { /* gone */ } }); }
      return;
    }
    if (D.phase === 'drop') {
      D.vy -= 11 * dt; e.pos.y += D.vy * dt; g.rotation.x += D.spin * dt * 0.3;
      if (e.pos.y <= 0) { e.pos.y = 0; D.phase = 'land'; D.landT = 0.6; g.rotation.x = 0; sfx('thud', { pos: [e.pos.x, 0.2, e.pos.z], vol: 1.0 }); sfx('skitter', { pos: [e.pos.x, 0.3, e.pos.z], vol: 0.7 }); }
      return;
    }
    if (D.phase === 'land') { D.landT -= dt; if (D.landT <= 0) D.phase = 'crawl'; return; }
    if (e.stunT > 0 || !Player.pos || Player.dead) { for (const l of g.userData.limbs || []) l.piv.rotation.x *= 0.9; return; }
    const p = Player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
    g.rotation.y += clamp(U.angleDiff(g.rotation.y, Math.atan2(dx, dz)), -4 * dt, 4 * dt);
    D.cd -= dt;
    if (D.wind > 0) {
      D.wind -= dt;
      g.position.y = Math.sin((1 - D.wind / 0.45) * Math.PI) * 0.22;
      if (D.wind <= 0) {
        g.position.y = 0;
        if (d < 1.25 && Math.abs(p.y - e.pos.y) < 1.2) Player.damage(10, 'boss:pedestal', { from: e.pos });
        D.cd = 1.5;
      }
      return;
    }
    if (d < 0.95 && D.cd <= 0) { D.wind = 0.45; sfx('unfold', { pos: [e.pos.x, 0.4, e.pos.z], vol: 0.8 }); return; }
    if (d > 0.8) {
      const sp = 1.15 * dt;
      const r = World.move(e.pos, dx / d * sp, dz / d * sp, 0.3, {});
      e.pos.set(r.x, r.y, r.z);
      D.gait += dt * 9;
      for (const l of g.userData.limbs || []) l.piv.rotation.x = Math.sin(D.gait + (l.sx * l.sz > 0 ? 0 : Math.PI)) * 0.55;
      if (Math.random() < dt * 0.8) sfx('skitter', { pos: [e.pos.x, 0.3, e.pos.z], vol: 0.35 });
    }
  }
  // a rep lets go of its tier: it's hidden up there and drops as a crawler down here
  function C5_detach() {
    const P = C5.ped;
    if (!P) return false;
    const alive = P.crawl.filter((e) => !e.removed && !e.resolved).length;
    if (alive >= 3) return false;
    const opts = P.tw.tiers.map((t, i) => ({ t, i, y: P.colY + t.position.y + TWR.plH })).filter((o) => o.t.visible && o.t.userData.rep.visible && o.y > 0.8 && o.y < 9.5);
    if (!opts.length) return false;
    const o = opts[0];
    o.t.userData.rep.visible = false; o.t.userData.regrow = 16;
    const pp = Player.pos || { x: AT.cx, z: AT.cz + 4 };
    const dx = pp.x - AT.cx, dz = pp.z - AT.cz, d = Math.hypot(dx, dz) || 1;
    const x = AT.cx + dx / d * 0.9, z = AT.cz + dz / d * 0.9;
    const e = Enemies.spawn({ id: 'c5_atrium:rep#' + (++C5.repN || (C5.repN = 1)), type: 'c5_rep', pos: [x, z], y: o.y, persist: false, world: 'outage' });
    if (e) { P.crawl.push(e); sfx('creak', { pos: [x, o.y, z], vol: 0.8 }); }
    return !!e;
  }
  // the fight, per frame
  function C5_pedTick(G, dt) {
    const P = C5.ped;
    if (!P) return;
    C5_laterTick(dt); C5_animTick(dt);
    // regrowing reps
    for (const t of P.tw.tiers) if (t.userData.regrow > 0) { t.userData.regrow -= dt; if (t.userData.regrow <= 0) t.userData.rep.visible = true; }
    if (!P.fight || Player.dead) return;
    // the beams burn (10 per second inside one)
    const p = Player.pos;
    if (p && p.y < 2.2 && P.level < 6) for (const b of P.beams) if (Math.hypot(p.x - b.x, p.z - b.z) < BEAM_R * 0.92) { Player.damage(10 * dt, 'boss:pedestal', { dot: true }); break; }
    // reps drop
    P.spawnT -= dt;
    if (P.spawnT <= 0) { P.spawnT = (C5_detach() ? 7.5 : 2.5) * (typeof DIFF !== 'undefined' && DIFF.name === 'easy' ? 1.4 : 1); }
    P.crawl = P.crawl.filter((e) => !e.removed);
    // the PA: "Welcome in! [beat] Welcome in!"
    P.paT -= dt;
    if (P.paT <= 0) { P.paT = 9 + Math.random() * 4; P.pa2T = 1.9; sfx('pa_ding', { vol: 0.8 }); try { Enemies.say('Welcome in!', 'muffled', 1.5); } catch (e) { /* voice */ } }
    if (P.pa2T > 0) { P.pa2T -= dt; if (P.pa2T <= 0) { try { Enemies.say('Welcome in!', 'muffled', 1.5); } catch (e) { /* voice */ } } }
  }
  defineBoss('pedestal', {
    async run(G) {
      const P = C5.ped;
      if (!P || !G.inRoom('c5_atrium')) return 'won';
      P.fight = true; P.spawnT = 3.5; P.paT = 4.6; P.beamsOff = false;            // (the PA waits for the objective line to clear)
      G.control(true);
      try { Player.setTorch(true); } catch (e) { /* torch */ }
      note(G, 'The six plinths at its base. Bring it down.', 'c5_goal');
      G.bg(async (G2) => { await G2.msg('Break the plinths at its base.', 4); });
      const plinths = [];
      P.base.forEach((bp, i) => { if (!P.broken[i]) { const e = Enemies.spawn({ id: 'c5_atrium:plinth' + i, type: 'c5_plinth', idx: i, pos: bp.userData.wpos, persist: false, world: 'outage' }); if (e) plinths.push(e); } });
      const top = Enemies.spawn({ id: 'c5_atrium:top', type: 'c5_top', pos: [AT.cx, AT.cz], persist: false, world: 'outage' });
      // the stage finds him: a faint pale follow-light over his head, so he never goes black on the black floor while
      // the beams sweep (the Outage floor is darker than his hoodie)
      const follow = G.addLight('point', { pos: [AT.cx, 2.6, AT.cz + 4], color: '#a9ddd4', intensity: 3.2, distance: 5.2 });
      const followTo = () => { const p = Player.pos; if (follow && p) follow.set({ pos: [p.x, p.y + 2.5, p.z] }); };
      followTo();
      try {
        await G.loop((dt) => { followTo(); C5_pedTick(G, dt); return P.broken.every(Boolean); });
      } finally {
        P.fight = false;
        for (const e of P.crawl) { try { if (!e.resolved) Enemies.kill(e); } catch (err) { /* gone */ } }
        for (const e of plinths) { try { if (!e.removed) e.remove(); } catch (err) { /* gone */ } }
        try { if (top && !top.removed) top.remove(); } catch (err) { /* gone */ }
      }
      // the last plinth: it all comes down
      await G.wait(0.4);
      G.sfx('lift_groan', { pos: [AT.cx, 3, AT.cz], vol: 1.0 });
      G.shake(0.5, 2.2);
      P.beamsOff = true;
      if (!flag('c5_hitTop')) G.set('chloeSaved', true);
      else { P.figY = P.colY + P.tw.figY; P.figMode = 'float'; }
      { let t = 0; await G.loop((dt) => { t += dt; C5_pedTick(G, dt); return P.colY <= -TWR.tierH * 5 - 5.9 || t > 8; }); }
      return 'won';
    },
  });

  defineRoom({
    id: 'c5_atrium', name: 'ATRIUM', area: 'REGIONAL OFFICE — LEVEL 2', chapter: 5, outdoor: false, surface: 'tile', ambient: 'office',
    fog: { density: 0.022, color: '#3a4442' }, outageFog: { density: 0.02, color: '#0a1010' },
    surfaces: [{ box: [AT.sx[0], AT.top, AT.sx[1], AT.bot], s: 'metal' }],
    bounds: [AT.V[0], AT.V[1], AT.V[2], AT.V[3]],
    entries: { stairs: [14.15, AT.entryZ, 180], start: [14.15, AT.entryZ, 180], floor: [16.4, 20.2, 60] },
    cameras: [
      // four pans from the Level 3 balcony, each watching a quarter of the floor past the tower (the tower stays to one
      // side of every sightline): the two north quarters from the south balcony, the leaderboard beyond the fight;
      // (the stair's solid flight hides the north-west quarter from the south-west corner, and the board's face runs
      // edge-on past a camera in the north-west one)
      { id: 'c5_atrium:nw', vol: [13, 8, 20, 15.2], type: 'pan', pos: [15.7, 6.0, 22.1], target: [17.6, 0.8, 11.8], fov: 46, pan: { lag: 0.35, yaw: 40, pitch: 42 } },
      { id: 'c5_atrium:ne', vol: [20, 8, 27, 15.2], type: 'pan', pos: [26.7, 6.0, 22.1], target: [23.4, 0.8, 11.6], fov: 46, pan: { lag: 0.35, yaw: 40, pitch: 42 } },
      { id: 'c5_atrium:se', vol: [20, 15.2, 27, 22], type: 'pan', pos: [26.3, 5.7, 8.7], target: [23.5, 0.8, 18.5], fov: 48, pan: { lag: 0.35, yaw: 42, pitch: 40 } },
      { id: 'c5_atrium:sw', vol: [13, 15.2, 20, 22], type: 'pan', pos: [26.3, 5.7, 21.3], target: [16.8, 0.8, 18.5], fov: 48, pan: { lag: 0.35, yaw: 42, pitch: 40 } },
    ],
    spawns: [],
    build(K) {
      const V = AT.V, glass = { color: '#cfe0dc', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22 };
      const slab = { tex: 'concrete', color: '#7f817b' }, dark = { color: '#0b0e0e', roughness: 1 };
      K.floor(V[0], V[1], V[2], V[3], { tex: 'tile', color: '#a8a49a' });
      // ---- Level 2's walls round the floor: glass into dark offices -------------------------------------------------
      const curtain = (x0, z0, x1, z1) => {
        const L = Math.hypot(x1 - x0, z1 - z0), ops = [];
        for (let a = 1.4; a < L - 0.6; a += 2.4) ops.push({ at: a, w: 2.1, h: 2.6, sill: 0.1, glass: true });
        K.wall(x0, z0, x1, z1, AT.L3, { tex: 'plaster', color: '#9a978c' }, { openings: ops, skirting: true });
      };
      curtain(V[0], V[3], V[0], V[1]); curtain(V[2], V[1], V[2], V[3]); curtain(V[2], V[3], V[0], V[3]);
      K.wall(V[0], V[1], V[2], V[1], AT.L3, { tex: 'plaster', color: '#9a978c' }, { skirting: true });
      for (const [cx, cz, sx, sz] of [[V[0] - 1.6, 15, 3, 14.4], [V[2] + 1.6, 15, 3, 14.4], [20, V[3] + 1.6, 14.4, 3], [20, V[1] - 1.6, 14.4, 3]]) K.box(cx, 0, cz, sx, AT.L3, sz, dark, { shadow: false });
      // ---- the balconies above: slab edges, glass balustrades, the dark floors behind; the roof (Fog) -----------------
      for (const [lv, h] of [[AT.L3, 3.6], [AT.L4, 3.6]]) {
        for (const [cx, cz, sx, sz] of [[20, V[1] - 0.2, 14.4, 0.4], [20, V[3] + 0.2, 14.4, 0.4], [V[0] - 0.2, 15, 0.4, 14.8], [V[2] + 0.2, 15, 0.4, 14.8]]) K.box(cx, lv - 0.45, cz, sx, 0.45, sz, slab, { shadow: false });
        for (const [cx, cz, sx, sz] of [[20, V[1] + 0.03, 14, 0.06], [20, V[3] - 0.03, 14, 0.06], [V[0] + 0.03, 15, 0.06, 14], [V[2] - 0.03, 15, 0.06, 14]]) {
          K.box(cx, lv, cz, sx, 1.05, sz, glass, { shadow: false, collide: false });
          K.box(cx, lv + 1.05, cz, sx + 0.04, 0.05, sz + 0.04, { tex: 'metal', color: '#c9cdcb' }, { collide: false });
        }
        for (const [cx, cz, sx, sz] of [[V[0] - 2.0, 15, 3, 14.4], [V[2] + 2.0, 15, 3, 14.4], [20, V[3] + 2.0, 14.4, 3], [20, V[1] - 2.0, 14.4, 3]]) K.box(cx, lv, cz, sx, h - 0.5, sz, dark, { shadow: false, collide: false });
      }
      K.box(20, AT.roof, 15, 14.4, 0.06, 14.4, { color: '#0d1414', roughness: 0.1, metalness: 0.3 }, { world: 'fog', shadow: false, collide: false });
      for (let i = 0; i <= 4; i++) K.box(V[0] + i * 3.5, AT.roof - 0.2, 15, 0.12, 0.2, 14.4, { tex: 'metal', color: '#5a605e' }, { world: 'fog', collide: false });
      // Level 4's lit office strips (Fog) / a few red emergency lights (Outage), seen from below
      K.fogOnly(() => { for (const [x, z, r] of [[20, V[1] - 1.2, 0], [20, V[3] + 1.2, 0], [V[0] - 1.2, 15, 90], [V[2] + 1.2, 15, 90]]) K.box(x, AT.L4 + 2.85, z, r ? 0.3 : 10, 0.03, r ? 10 : 0.3, { color: '#e8f2ee', emissive: '#e8f2ee', emissiveIntensity: 1.2 }, { collide: false, shadow: false }); });
      // pendant lights hung from the roof on long cables (Fog); in the Outage a few red emergency fills and the cold
      // backlight of the plinths
      K.fogOnly(() => {
        for (const [x, z] of [[17.2, 12.2], [23.2, 12.2], [17.2, 18.6], [23.2, 18.6]]) {
          K.box(x, 4.3, z, 0.012, AT.roof - 4.3, 0.012, { color: '#1a1a1a' }, { collide: false, shadow: false });
          K.cyl(x, 4.05, z, 0.32, 0.26, { color: '#20302e', roughness: 0.5, metalness: 0.4 }, { collide: false, shadow: false });
          K.light('point', x, 3.9, z, { color: '#ffe6c0', intensity: 5, distance: 11 });
        }
      });
      K.outageOnly(() => {
        K.light('point', 14.2, 2.4, 9.6, { color: '#ff3b2a', intensity: 2.0, distance: 8 });
        K.light('point', 17.0, 2.6, 20.0, { color: '#8fc2ba', intensity: 2.6, distance: 8 });
        K.light('point', 14.4, 7.6, 12.5, { color: '#9cc2bc', intensity: 2.4, distance: 9 });
        K.light('point', 20.5, 6.4, 18.8, { color: '#7fa6a0', intensity: 3.0, distance: 14 });
      });
      // ---- the leaderboard: three storeys, north side ---------------------------------------------------------------
      K.prop('leaderboard', 20, V[1] + 0.12, 0, { variant: 'atrium', w: 9, h: 9.4, mount: 4.9, y: 0, name: 'c5_board', bank: 3 });
      K.collider(15.4, V[1], 24.6, V[1] + 0.45, { h: 3 });
      // ---- the feature stair (walkable, the whole way), glass along its open side ------------------------------------
      K.stairs(AT.sx[0], AT.top, AT.sx[1], AT.bot, AT.L4, 0, { axis: 'z', solid: true, mat: { tex: 'metal', color: '#6a706e' }, nosing: { tex: 'metal', color: '#c9cdcb' }, name: 'c5at:stair' });
      for (let k = 0; k < 7; k++) {
        const z0 = AT.top + k * 1.94, z1 = z0 + 1.94, y = AT_stairY(z1);
        K.box(AT.sx[1] + 0.02, y, (z0 + z1) / 2, 0.04, 1.02, 1.94, glass, { collide: false, shadow: false });
        K.box(AT.sx[1] + 0.02, y + 1.02, (z0 + z1) / 2, 0.06, 0.05, 1.94, { tex: 'metal', color: '#c9cdcb' }, { collide: false });
      }
      K.collider(AT.sx[1], AT.top, AT.sx[1] + 0.12, AT.bot - 2.2, { h: 9 });
      K.collider(AT.sx[0] - 0.12, AT.top, AT.sx[0], AT.bot, { h: 9 });
      // ---- the Fog world: the Regional Kick-off set-up (and after the fight, one ordinary plinth) ---------------------
      K.fogOnly(() => {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) K.prop('chair', 16.8 + c * 1.1, 18.2 + r * 1.1, 180, { collide: false });
        K.collider(16.4, 17.8, 22.8, 21.9, { h: 0.9 });
        K.box(20, 0, 10.4, 5, 0.4, 2.2, { tex: 'wood', color: '#3a2e24' }, { collide: true });
        K.box(20, 0.4, 10.9, 0.6, 1.1, 0.45, { tex: 'wood', color: '#2a2220' }, { collide: true });
        K.prop('pa_mic', 20, 10.9, 180, { y: 1.5 });
        for (const x of [16, 24]) { K.box(x, 0, 11, 0.8, 2.2, 0.05, { color: '#0b4f52', roughness: 0.5 }); K.plane(x, 1.3, 11.04, 0.75, 1.6, board('kickoff', ['REGIONAL', 'KICK-OFF', 'Excellence', 'Every Day'], { w: 192, h: 384, bg: '#0b4f52', fg: ['#ffcc00', '#ffffff', '#b8dcd8', '#b8dcd8'], size: [34, 34, 26, 26], age: 0.2 }), {}); }
        K.prop('stacked_chairs', 25.8, 21.0, 20, { n: 5 });
        K.prop('plant_pot', 26.3, 8.8, 0, { variant: 'palm' });
        K.prop('plant_pot', 15.9, 8.8, 0, { variant: 'palm' });
      });
      C5.plinthObj = K.prop('plinth', AT.cx, AT.cz, 0, { h: 0.9, w: 0.6, name: 'c5at:plinth', collide: false });
      C5.plinthObj.visible = false;
      K.collider(AT.cx - 0.3, AT.cz - 0.3, AT.cx + 0.3, AT.cz + 0.3, { h: 0.9, world: 'fog', name: 'c5at:plinthcol' });
      // her shoes on the floor beside it
      if (flag('c5_bossDone') && flag('chloeSaved')) K.fogOnly(() => { for (const [dx, r] of [[-0.52, 20], [-0.64, -15]]) K.box(AT.cx + dx + 0.3, 0, AT.cz - 0.5 - (r > 0 ? 0 : 0.14), 0.09, 0.07, 0.24, { color: '#121212', roughness: 0.4 }, { rot: r, collide: false }); });
      // ---- the Outage: the Pedestal; contracts; receipts; tethers down from the balconies ----------------------------
      C5_pedBuild(K);
      K.outageOnly(() => {
        for (let i = 0; i < 7; i++) K.prop('contract_stack', 25.6 + (i % 2) * 0.6, 9.2 + i * 1.8, i * 37, { h: 1.2 + (i % 3) * 0.6 });
        for (const [x, z, l] of [[17, 9.2, 3.2], [23.5, 9.3, 4.0], [26.4, 12, 2.5], [26.4, 19, 3.6], [18, 21.6, 2.8], [22.5, 21.6, 3.4]]) K.prop('receipt_strip', x, z, x * 20, { ceil: AT.L3 - 0.45, len: l });
        for (const [x, z] of [[16.5, 21.7], [25.5, 21.7], [26.7, 10]]) K.prop('tether_hanging', x, z, 0, { ceil: AT.L3 - 0.45, len: 2.2 });
        K.dress('receipts', [15.6, 8.6, 26.6, 21.6], 36, { seed: 601 });
        K.dress('contracts', [15.6, 8.6, 26.6, 21.6], 14, { seed: 602 });
        for (const [x, y, z] of [[13.05, 2.2, 12], [26.95, 2.2, 18], [20, 2.2, 21.95], [20, AT.L3 + 1.5, 8.1]]) K.light('led', x, y, z, { color: '#ff2a1c', blink: true, size: 0.012 });
        K.light('point', 20, 2.6, 21.2, { color: '#ff3b2a', intensity: 2.2, distance: 8 });
      });
      // ---- pickups (Easy: a first aid kit at the foot of the stair) ----------------------------------------------------
      K.pickup('first_aid', 15.8, 0.02, 21.5, { id: 'c5_atrium:firstaid', extraOnEasy: true, rot: 30, glint: true });
      K.pickup('coffee', 16.1, 0.02, 9.2, { id: 'c5_atrium:coffee', rot: 70, when: () => !flag('c5_bossDone') });
      // ---- the stair: back up to Level 4 (before the fight), CALL 6 on the way up after it, the chapter's end -------
      K.exit({ id: 'c5_atrium:up', box: [AT.sx[0], AT.top - 0.2, AT.sx[1], AT.entryZ - 0.35], to: 'c5_level4', entry: 'atriumstairs', sound: 'steps', when: () => S.chapter === 5 && !flag('c5_bossDone'), blockedMsg: null, mapMark: false });
      // (just below the exit box: after the fight that exit's when() is false, and a closed exit is a wall)
      K.trigger([AT.sx[0], AT.entryZ - 0.35, AT.sx[1], AT.entryZ + 1.0], (G) => C5_toCh6(G), { id: 'c5_atrium:out', once: false, when: () => S.chapter === 5 && flag('c5_done') });
      K.trigger([AT.sx[0], 12.5, AT.sx[1], 19.5], (G) => C5_call6(G), { id: 'c5_atrium:call6', once: false, when: () => S.chapter === 5 && flag('c5_done') && !(S.calls && S.calls.luka6) });
      // CUTSCENE 5-3 at the foot of the stair
      K.trigger([AT.sx[0], 19.6, 17.2, AT.V[3]], (G) => G.cutscene('5-3'), { id: 'c5_atrium:53', once: false, when: () => S.chapter === 5 && !done('cs:5-3') && S.outage });
      // ---- examine ---------------------------------------------------------------------------------------------------
      K.examine(20, 2.2, 9.0, ['"CHLOE — #1 — 30 MONTHS."', 'Three storeys high. You could read it from the car park.'], { id: 'c5at:board', r: 2.6, when: () => !flag('c5_bossDone') });
      K.examine(20, 2.2, 9.0, 'Just her name. No number.', { id: 'c5at:board2', r: 2.6, when: () => flag('c5_bossDone') && flag('chloeSaved') });
      K.examine(20, 1.2, 12.9, ['They\'re holding each other up. Every one of them smiling.', 'Nobody on it is looking down.'], { id: 'c5at:tower', r: 2.2, world: 'outage', when: () => !flag('c5_bossDone') });
      K.examine(20, 1.0, 11.2, ['The lectern. "Regional Kick-off — Excellence Every Day."', 'A running sheet taped to it. "9:00 — Welcome in! 9:05 — Rankings. 9:30 — Recognition."'], { id: 'c5at:lectern', r: 1.4, world: 'fog' });
      K.examine(19.2, 0.8, 18.2, 'Chairs for the whole region. Every one of them facing the board.', { id: 'c5at:chairs', r: 1.4, world: 'fog' });
      K.examine(26.0, 1.2, 12, 'Contracts, stacked to the balcony. Every page signed.', { id: 'c5at:contracts', r: 1.5, world: 'outage' });
      K.examine(13.3, 1.3, 16.5, 'Offices behind the glass. Dark all the way back.', { id: 'c5at:glassW', r: 1.4 });
      K.examine(26.7, 1.3, 16.5, 'Offices behind the glass. Somebody\'s left a coat on every chair.', { id: 'c5at:glassE', r: 1.4 });
      K.examine(20, 1.1, AT.cz + 0.9, ['Just a display plinth. The kind they put new phones on.', 'Her shoes are on the floor beside it.'], { id: 'c5at:plinth', r: 1.3, world: 'fog', when: () => flag('c5_bossDone') && flag('chloeSaved') });
      K.examine(15.8, 1.0, 20.6, 'The feature stair. Four floors of it, all glass.', { id: 'c5at:stair', r: 1.2 });
    },
    onUpdate(dt) {
      C5_ambient(['#5a6461', 0.42], ['#2a8a84', 0.62]);
      if (C5.plinthObj) C5.plinthObj.visible = !S.outage && flag('c5_bossDone') && flag('chloeSaved');
      if (!(C5.ped && C5.ped.fight)) { C5_laterTick(dt); C5_animTick(dt); }
    },
    onLeave() { C5_ambientOff(); C5.ped = null; C5.anims = null; C5.later = null; },
    async onEnter(G, from) {
      if (S.chapter !== 5) return;
      if (!done('cs:5-3') || flag('c5_bossDone')) return;
      // a reload into the fight (the autosave before it): straight back in
      await G.run(async (G2) => {
        const r = await G2.boss('pedestal');
        if (r === 'won' || C5.ped && C5.ped.broken.every(Boolean)) await C5_after(G2);
      }, { control: false, name: 'c5:bossResume' });
    },
  });

  // after the fight: the fate, then 5-4 or 5-4alt (each in its own wrapper so a skip of 5-3 doesn't carry into it)
  async function C5_after(G) {
    G.set('c5_bossDone', true);
    G.set('chloeSaved', !flag('c5_hitTop'));
    const id = flag('chloeSaved') ? '5-4' : '5-4alt';
    await G.run(async (G2) => { await G2.cutscene(id); }, { control: false, skippable: false, inheritSkip: false, name: 'c5:after' });
  }
  // CALL 6 — on the way back up the feature stair
  async function C5_call6(G) {
    if ((S.calls && S.calls.luka6) || C5.call6Busy) return;
    C5.call6Busy = true;
    try { await G.call('luka6'); } finally { C5.call6Busy = false; }
  }
  // the top of the stair → CHAPTER CARD "THE MIDDLE"
  async function C5_toCh6(G) {
    if (S.chapter !== 5 || C5.leaving) return;
    if (!(S.calls && S.calls.luka6)) { await C5_call6(G); if (!(S.calls && S.calls.luka6)) return; }
    C5.leaving = true;
    try {
      note(G, 'Escalations. Chloe\'s keycard.', 'c5_goal', { done: true });
      if (S.outage) { await G.fade(1, 0.8); G.setOutage(false); }
      const ok = await G.startChapter(6);
      if (ok === false) {
        // (no Chapter 6 in this build: show its card and hand the atrium back)
        await G.card('THE MIDDLE');
        await G.fade(0, 1.0);
      }
    } finally { C5.leaving = false; }
  }


  // =================================================================================================================
  // CUTSCENE 5-3 "The Pedestal" (c5_atrium, the foot of the feature stair) → BOSS → 5-4 / 5-4alt
  // =================================================================================================================
  defineCutscene('5-3', async (G) => {
    const A = G.aidan, P = C5.ped;
    if (A.raw) A.raw.idleLife = false;
    if (P) { P.beamsOff = false; P.level = 0; }
    A.place(16.3, 20.5, 144); A.pose('idle');
    A.look([20, 8, 15.2]);
    // 1. SHOT — an extreme low angle from the atrium floor, looking up. The tower of plinths rises under crossing
    //    spotlights. At the top, Chloe turns slowly. Behind her the leaderboard: "CHLOE — #1 — 30 MONTHS".
    const fy = P ? P.colY + P.tw.figY : 13.4;
    //    (the board's "CHLOE — #1 — 30 MONTHS" low in the frame under the plinths first, then up the tower to her)
    G.cam({ pos: [21.3, 0.16, 21.7], target: [20.2, 7.1, 12.6], fov: 64, to: { pos: [21.3, 0.18, 21.6], target: [20, fy + 1.0, 15.2], fov: 17 }, dur: 11, ease: 'inOut' });
    G.sfx('smile_hum', { pos: [20, 3, 15.2], vol: 0.5 });
    await G.wait(4.2);
    //    CHLOE (her voice through the PA, echoing)
    G.sfx('pa_ding', { vol: 0.9 });
    await G.wait(0.7);
    await G.say('CHLOE', 'Welcome in! [beat] Welcome in! [beat] Welcome in!', { italic: true });
    await G.wait(0.6);
    // state (plain statements)
    if (A.raw) A.raw.idleLife = true;
    A.look(null);
    G.camRelease();
    try { G.autosave(); } catch (err) { /* save */ }
    // 2. BOSS: The Pedestal
    const r = await G.boss('pedestal');
    if (r === 'won' || (C5.ped && C5.ped.broken.every(Boolean))) await C5_after(G);
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 5-4 "Nothing" (chloeSaved)
  // =================================================================================================================
  defineCutscene('5-4', async (G) => {
    const A = G.aidan;
    G.set('c5_bossDone', true);
    G.set('chloeSaved', true);
    await G.fade(1, 1.2, '#ffffff');
    G.setOutage(false);
    C5_board(G, 'CHLOE — #1 — 30 MONTHS');
    const C = G.actor('chloe', 'chloe', { rig: { hair: { style: 'long', color: '#221812' }, shoes: { kind: 'sock', color: '#2a2a2e', sole: '#222226' }, hold: {} } });
    if (C.raw) C.raw.idleLife = false;
    if (A.raw) A.raw.idleLife = false;
    C.place(AT.cx, AT.cz + 0.02, 184); C.pose('sit', { seat: 0.9 }); C.expr('tired'); C.eyes('down');
    A.place(19.05, 14.7, 40); A.pose('idle'); A.look(C);
    // 1. SHOT — the atrium floor in the Fog world. Chloe sits on a single ordinary display plinth, shoes off, hair down.
    G.cam({ pos: [23.6, 1.35, 11.4], target: [20.0, 0.95, 15.3], fov: 40, to: { pos: [23.3, 1.32, 11.7], fov: 38 }, dur: 10 });
    await G.fade(0, 2.0);
    await G.wait(2.6);
    // 2. SHOT — behind her, the leaderboard. Her number counts down: 30... 12... 1... then just "CHLOE", no number.
    G.cam({ pos: [20.45, 1.35, 17.35], target: [20, 4.7, 8.2], fov: 48, to: { pos: [20.42, 1.33, 17.2], fov: 47 }, dur: 20 });
    C.look([20, 4.9, 8.2]); C.eyes('ahead');
    A.look([20, 4.9, 8.2]);
    await G.wait(1.0);
    for (const n of [30, 29, 27, 24, 21, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1]) {
      C5_board(G, `CHLOE — #1 — ${n} MONTH${n === 1 ? '' : 'S'}`);
      G.sfx('click', { pos: [20, 4.9, 8.4], vol: 0.35 });
      await G.wait(n === 30 || n === 12 || n === 1 ? 0.95 : 0.2);
    }
    C5_board(G, 'CHLOE');
    G.sfx('pa_ding', { vol: 0.35 });
    await G.wait(1.4);
    //    CHLOE (watching it)
    await G.say('CHLOE', 'Huh. [beat] Is it bad that this feels good? Being nothing for a minute?');
    A.look(C);
    await G.say('AIDAN', 'You\'re not nothing.');
    await G.say('CHLOE', 'No. [beat] I\'m eleven short.');
    //    She laughs, cries a little, and laughs again.
    C.expr('smile'); q(C.gesture('laugh'));
    await G.wait(1.3);
    C.expr('cry'); C.eyes('down'); q(C.gesture('wipe_eyes'));
    await G.wait(1.6);
    C.expr('smile'); q(C.gesture('laugh'));
    await G.wait(1.3);
    // 3. SHOT — close on hands. She gives him her Level 4 keycard.
    await C.turn(A, 0.8);
    C.look(A); C.eyes('at', A);
    await A.turn(C, 0.4);
    C.hold('L', 'card');
    {
      // side on to the two of them, the board behind: her hand coming out with the card, his coming up to take it
      const cp = C.pos, ap = A.pos;
      const mx = (cp.x + ap.x) / 2, mz = (cp.z + ap.z) / 2, dx = ap.x - cp.x, dz = ap.z - cp.z, l = Math.hypot(dx, dz) || 1;
      let px = -dz / l, pz = dx / l;
      if (pz < 0) { px = -px; pz = -pz; }
      G.cam({ pos: [mx + px * 1.25, 1.34, mz + pz * 1.25], target: [mx, 1.08, mz], fov: 36, to: { pos: [mx + px * 1.12, 1.32, mz + pz * 1.12], fov: 34 }, dur: 9 });
    }
    const handOff = [(C.pos.x + A.pos.x) / 2, 1.14, (C.pos.z + A.pos.z) / 2];
    q(C.gesture('reach', { hand: 'L', target: handOff, dur: 2.4 }));
    await G.say('CHLOE', 'Escalations. That\'s what you\'re after, isn\'t it?');
    if (A.raw) q(A.raw.gesture('reach', { hand: 'R', target: handOff, dur: 1.1 }));
    await G.wait(0.9);
    C.hold('L', null);
    G.give('keycard', 1, { silent: true });
    G.sfx('pickup', { vol: 0.6 });
    await G.beat();
    //    (serious)
    C.expr('flat');
    await G.say('CHLOE', 'Aidan.');
    await G.say('CHLOE', 'Luka\'s here. He\'s upstairs. He\'s looking for you.');
    // 4. SHOT — close on Aidan. Keys chime somewhere above.
    {
      const p0 = C5_rel(A, 0.8, 0.22, -0.18), t0 = C5_rel(A, 0.05, 0, -0.2);
      G.cam({ pos: p0, target: t0, fov: 30, to: { pos: C5_rel(A, 0.72, 0.2, -0.18), target: t0, fov: 28 }, dur: 12 });
    }
    if (A.raw) { A.raw.expr('scared'); A.raw.eyes('away', C.raw); }
    await G.wait(0.6);
    G.sfx('keys_far', { pos: [20, 9.5, 12], vol: 0.85 });
    await G.wait(1.4);
    A.look([AT.cx - 0.6, 3.3, 9.5]);
    await G.say('AIDAN', '...I can\'t.');
    if (A.raw) A.raw.eyes('at', C.raw);
    await G.say('CHLOE', 'He\'s not who you think he is.');
    await G.wait(1.2);
    // state (plain statements)
    if (!G.has('keycard')) G.give('keycard', 1, { silent: true });
    G.set('c5_done', true);
    note(G, 'Chloe\'s keycard. Back up the stair to Level 4 — the escalations office.', 'c5_goal');
    C.hold('R', null); C.look(null); C.eyes('down'); C.expr('tired');
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('sad'); A.raw.eyes('ahead'); }
    A.look(null);
    G.camRelease();
    G.bg(async (G2) => { await G2.msg('Aidan took the Level 4 keycard.', 3); });
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 5-4 (alternate) (not chloeSaved)
  // =================================================================================================================
  defineCutscene('5-4alt', async (G) => {
    const A = G.aidan, P = C5.ped;
    G.set('c5_bossDone', true);
    G.set('chloeSaved', false);
    if (P) { P.beamsOff = true; if (P.figMode !== 'float') { P.figY = P.colY + P.tw.figY; P.figMode = 'float'; } P.level = 6; }
    if (A.raw) A.raw.idleLife = false;
    A.place(17.6, 18.35, 142); A.pose('idle'); A.look([20, 13.5, 15.2]);
    // 1. SHOT — the same low angle. The figure at the top still turns under the spotlight, though the tower is gone.
    //    The keycard falls from above and lands at Aidan's feet.
    if (P) P.figY = P.tw.figY;
    G.cam({ pos: [21.3, 0.16, 21.7], target: [20, 13.8, 15.2], fov: 22, to: { pos: [21.3, 0.17, 21.6], target: [20, 14.3, 15.2], fov: 15 }, dur: 10 });
    G.sfx('smile_hum', { pos: [20, 12, 15.2], vol: 0.35 });
    await G.wait(3.4);
    let card = null;
    try { card = ITEMS.keycard && ITEMS.keycard.model ? ITEMS.keycard.model() : null; } catch (e) { card = null; }
    const feet = [17.95, 17.92];
    if (card && World.build && World.build.group) {
      card.position.set(AT.cx, 13.2, AT.cz); World.build.group.add(card);
      G.sfx('whoosh', { pos: [AT.cx, 8, AT.cz], vol: 0.3 });
      let t = 0; const T = 2.4;
      await G.loop((dt) => {
        t = Math.min(T, t + dt); const k = t / T;
        card.position.set(lerp(AT.cx, feet[0], k) + Math.sin(k * 9) * 0.25 * (1 - k), 13.2 * (1 - k * k) + 0.012, lerp(AT.cz, feet[1], k));
        card.rotation.set(Math.sin(t * 5) * 1.2 * (1 - k), t * 2.2, Math.cos(t * 4) * 0.9 * (1 - k));
        return t >= T;
      });
      card.rotation.set(0, 0.6, 0); card.position.y = 0.012;
      G.sfx('click', { pos: [feet[0], 0.1, feet[1]], vol: 0.6 });
    }
    G.cam({ pos: [feet[0] + 0.5, 0.34, feet[1] + 0.42], target: [feet[0], 0.02, feet[1]], fov: 34, to: { pos: [feet[0] + 0.44, 0.31, feet[1] + 0.37], fov: 31 }, dur: 6 });
    await G.wait(1.2);
    // 2. The PA, softly: "Welcome in." No other dialogue.
    G.sfx('pa_ding', { vol: 0.35 });
    await G.wait(0.5);
    await G.say('PA', 'Welcome in.', { italic: true });
    await G.wait(1.0);
    // state (plain statements)
    if (card && card.parent) card.parent.remove(card);
    if (!G.has('keycard')) G.give('keycard', 1, { silent: true });
    G.set('c5_done', true);
    note(G, 'Her keycard. Back up the stair to Level 4 — the escalations office.', 'c5_goal');
    if (A.raw) A.raw.idleLife = true;
    G.camRelease();
    G.bg(async (G2) => { await G2.msg('Aidan picked up the Level 4 keycard.', 3); });
  }, { letterbox: true, skippable: true });

  // ==== END OF CHAPTER 5 CONTENT ====
}
