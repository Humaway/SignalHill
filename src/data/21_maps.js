// ==== data/21_maps.js — every MAPS entry, each room's map field and Aidan's map marks (spec §2A Map screen, §7A the
// town + the map items table, §7B building layouts; CONTENT_PLAN §3 map ids) — tag MAP_ ====
// Loads after every chapter file, so it can read ROOMS and assign room.map directly (chapter files never set it).
//
// How it works
//   * Placements: every room sits on its map's FRAME (metres, x east, z south — the rooms' own convention) at
//     [px, pz] with a rotation (deg) and a scale k (1 = true size; the Closer's impossible sales floor is squeezed into
//     its 6 × 6 m hut with k 0.4). A map's frame turns into map units with the frame origin and a scale (units per
//     metre), so room.map.xform = [(px - ox)·sc, (pz - oz)·sc, sc·k, rot] — exactly the engine's
//     mapX = ox + (x·cos − z·sin)·scale, mapY = oz + (x·sin + z·cos)·scale. Placements were solved from the rooms'
//     real doors/exits (a door in one room lands on the matching door of the next), so the drawings line up with the
//     geometry and the red arrow sits where Aidan stands, facing the way he faces.
//   * Drawings are generated FROM the placements: a rectangle given in a room's local metres is transformed into map
//     units, so what is drawn is where the room really is. Street maps draw roads along the rooms' real centre lines.
//   * Receipt maps (the Outage) reuse the paper placements under a rigid rotation (the strip runs top to bottom),
//     and draw the Outage layout (the kitchen route, the store that stretches back, the loop, the swollen kitchen, the
//     west-wall route, contracts across the stairs…) in faded thermal ink with teal marks.
//   * Printed maps show the town as it was in 1994: roads that now end at drops still run on the paper; Aidan's red
//     X (automatic, the engine) marks where they really stop.
//   * Marks: MAPS[id].marks with when(S) — a red circle on the current objective, a tick on solved points, short notes
//     ("PIN?", "key → security office", "lockbox = birth year?", "fuses: only 10 A", "Records: 2231?", "Level 4 —
//     escalations", "Room 12", "gate code = ?" …), derived from the chapters' own flags. The chapters' stored marks
//     (S.mapMarks: their circles, the automatic door/road Xs) are tidied as the story moves: a circle whose objective
//     is done becomes a tick, and an automatic X on a door or road that has since opened becomes a tick.
//   * c6_shaft's map transform is a getter: the lift car interior is built beside the shaft, so while Aidan is in the
//     car its position maps back onto the shaft.
{
  const D2R = Math.PI / 180;
  const fl = (s, k) => !!(s && s.flags && s.flags[k]);
  const dn = (s, k) => !!(s && s.done && s.done[k]);
  const ch = (s) => (s && s.chapter) | 0;
  const lvl = (s) => (s && s.difficulty && s.difficulty.riddle) || 'normal';
  const read = (s, ...ids) => ids.some((id) => !!(s && s.docs && s.docs[id]));
  const has = (s, id) => !!(s && Array.isArray(s.inv) && s.inv.some((i) => i && i.id === id && (i.n ?? 1) > 0));
  const mk = (s, id) => !!(s && s.mapMarks && s.mapMarks[id]);
  const out = (s) => !!(s && s.outage);

  // =================================================================================================================
  // Placements: room-local metres → a map's frame (metres)
  // =================================================================================================================
  const PL = {};            // `${map}|${room}` → {map, floor, room, px, pz, rot, k}
  const HOME = {};          // room → paper map id   (room.map.id)
  const RHOME = {};         // room → receipt map id (room.map.outage)
  // o.draw: a drawing-only placement (not the room's home); o.receipt: the room's receipt placement
  function put(map, floor, room, px, pz, rot = 0, k = 1, o = {}) {
    PL[map + '|' + room] = { map, floor, room, px, pz, rot, k };
    if (room[0] === '@' || o.draw) return;
    if (o.receipt) RHOME[room] = map; else HOME[room] = map;
  }
  const pl = (map, room) => PL[map + '|' + room] || null;
  // frame metres of a room-local point
  function fpt(p, x, z) {
    const c = Math.cos(p.rot * D2R), s = Math.sin(p.rot * D2R);
    return [p.px + (x * c - z * s) * p.k, p.pz + (x * s + z * c) * p.k];
  }
  // a receipt map: the paper placements of `rooms` under one rigid rotation (+ an optional per-floor rename)
  function derive(rmap, base, rot, rooms, floors = {}) {
    const c = Math.cos(rot * D2R), s = Math.sin(rot * D2R);
    for (const r of ['@F', ...rooms]) {
      const b = pl(base, r);
      if (!b) continue;
      PL[rmap + '|' + r] = { map: rmap, floor: floors[b.floor] || b.floor, room: r, px: b.px * c - b.pz * s, pz: b.px * s + b.pz * c, rot: b.rot + rot, k: b.k };
      if (r[0] !== '@') RHOME[r] = rmap;
    }
  }

  // ---- the town (frame T: metres; the Lookout's own coordinates; x east, z south) -------------------------------------
  // Every street room chained exit to exit: the Lookout → Hill Road → the bus shelter → Relay Street (→ the Plaza car
  // park) → Hilltop Road → the village gate … the back gate → Exchange Road → the forecourt; the rear yard → Wire Lane
  // → the business park → Ring Road (roundabout, office forecourt) → Ring Road east → the hospital car park → Summit
  // Road → the compound. The route climbs clockwise from the highway (bottom) to the mast (top), spec §7A.
  put('town', 'G', 'p2_lookout', 0, 0);
  put('town', 'G', 'p1_car', 21.9, 4.7);                 // the hatchback interior, where the car stands on the shoulder
  put('town', 'G', 'p3_hillroad', 41, -11);
  put('town', 'G', 'p4_busshelter', 165.2, -17.7);
  put('town', 'G', 'c1_relay', 166.1, -31);
  put('town', 'G', 'c1_carpark', 183.2, -96);
  put('town', 'G', 'c2_hilltoprd', 193, -206);
  put('town', 'G', 'c2_crescent', 238, -297.7, 0, 1, { draw: true });   // drawing only (its home is the Site Plan)
  put('town', 'G', 'c3_exchangerd', 131.1, -334.7);
  put('town', 'G', 'c3_forecourt', 94.1, -341.8);
  put('town', 'G', '@exchange', 75.6, -358.8);                // the Operators' Hall frame (the exchange plan's origin)
  put('town', 'G', 'c4_wirelane', -33.55, -369.4);
  put('town', 'G', 'c4_park', -72.85, -413.4);
  put('town', 'G', '@care', -67.95, -449.9);                  // the call-centre open plan's frame
  put('town', 'G', 'c5_ringroad', 19, -466.5);
  put('town', 'G', 'c5_forecourt', 55, -499.3);
  put('town', 'G', '@office', 43.4, -520.3);                  // the tower's Level 4 frame
  put('town', 'G', 'c7_ringroad', 114.55, -466.5);
  put('town', 'G', 'c7_carpark', 202.1, -506.5);
  put('town', 'G', '@hospital', 213.5, -518.5);               // reception's frame
  put('town', 'G', 'c8_summit', 264, -514.3);
  put('town', 'G', 'c8_compound', 286, -608.1, 0, 1, { draw: true });
  put('town', 'G', 'c1_mastshot', 301, -615);                 // the cutscene set: the mast on the summit

  // every building map's own frame, as a pseudo room: receipts rotate it with the rooms, so frame-metre drawings follow
  for (const m of ['plaza', 'village', 'exchange', 'care', 'office', 'office_upper', 'hospital', 'mast']) put(m, 'G', '@F', 0, 0);

  // ---- Signal Hill Plaza (frame: the concourse) ---------------------------------------------------------------------
  put('plaza', 'G', 'c1_concourse', 0, 0);
  put('plaza', 'G', 'c1_foodcourt', -8, -22);        // its south opening (15, 21) → the concourse's food exit (7, −1)
  put('plaza', 'G', 'c1_store', 41, -18);            // (10, 16.7) → the store exit (51, −1.3)
  put('plaza', 'G', 'c1_backoffice', 57.3, -23);     // its store door (1.2, 5) → the store's office door (17.5, 0)
  put('plaza', 'G', 'c1_stockroom', 63.3, -27.5);    // (0, 7) → the back office's stock door (6, 2.5)
  put('plaza', 'G', 'c1_kitchen', 47.3, -24);        // (10, 3) → the back office's kitchen door (0, 3.4)
  put('plaza', 'G', 'c1_corridor', 38, 12);          // its fire door (5, 0) → the concourse's fire door (43, 12)
  put('plaza', 'G', 'c1_security', 65, 15);          // (4, 0) → the corridor's security door (31, 3)
  put('plaza', 'G', 'c1_staffroom', 47, 15);         // (4, 0) → the corridor's staff door (13, 3)
  put('plaza', 'G', 'c1_dock', 78, 29, -90);         // its corridor door (15.5, 0) → the corridor's east door (40, 1.5)

  // ---- Hilltop Village (frame: the Crescent) ------------------------------------------------------------------------
  put('village', 'G', 'c2_crescent', 0, 0);
  put('village', 'G', 'c2_office', -12.6, 42.2);     // its door (10.6, 3.8) → the crescent's office door (−2, 46)
  put('village', 'G', 'c2_hall', 21, 14);            // (9, 12) → the hall door (30, 26)
  put('village', 'G', 'c2_unit9', 8.9, -13);         // her front door (4, 8) → Unit 9's door (12.9, −5)
  put('village', 'G', 'c2_garages', 26.3, -19);      // its east end (31.7, 3) → the NE lane (58, −16)
  put('village', 'G', 'c2_bay4', 37.3, -25);         // its door (1.5, 6) → the yard at bay 4 (12.5, 0)
  put('village', 'G', 'c2_kitchen_out', -7.8, 0, -90); // the swollen kitchen: its door (10, 20) → Unit 9's kitchen door

  // ---- Signal Hill Trunk Exchange (frame: the Operators' Hall) ------------------------------------------------------
  put('exchange', 'G', 'c3_hall', 0, 0);
  put('exchange', 'G', 'c3_records', 17, -8);        // (5, 8) → the hall's records door (22, 0)
  put('exchange', 'G', 'c3_canteen', 30, 14);        // (8.6, 0) → (38.6, 14)
  put('exchange', 'G', 'c3_foyer', 40, 9);           // the south-east corner: its hall door (2.4, 0) → the lobby off the hall's east door
  put('exchange', 'G', 'c3_frame', -20, -0.4);       // (20, 6.5–7.5) → the hall's west doors (0, 6.2–7.1)
  put('exchange', 'G', 'c3_yard', -19, -10.6);       // (16, 10.2) → the frame hall's yard door (17, 0)
  put('exchange', 'B', 'c3_stairs', 40, 3.6, -90);   // its top door (2, 0) → the hall's stairs door (40, 1.6)
  put('exchange', 'B', 'c3_fuse', 44.2, -0.4, -90);  // (0, 2.5) → the landing's fuse door (4, 6.7)
  put('exchange', 'B', 'c3_vault', 41.7, 23.6, -90); // (20, 5) → the landing's vault door (0, 6.7)
  put('exchange', 'G', 'c3_forecourt', 18.5, 17.2, 0, 1, { draw: true });   // the assembly area (drawing only)

  // ---- Customer Care Centre (frame: the open plan) ------------------------------------------------------------------
  put('care', 'G', 'c4_floor', 0, 0);
  put('care', 'G', 'c4_lobby', 15.1, 28);            // (10, 0) → the floor's lobby door (25.1, 28)
  put('care', 'G', 'c4_oldstore', 15.1, 28);         // the lobby as Chase's old store (Outage): the same box
  put('care', 'G', 'c4_secoffice', 35.1, 34.5);      // (0, 2) → the lobby's security door (20, 8.5)
  put('care', 'G', 'c4_break', 50, 3.1);             // (0, 4) → the floor's break door (50, 7.1)
  put('care', 'G', 'c4_records', 0, -8);             // (7.1, 8) → the records door (7.1, 0)
  put('care', 'G', 'c4_park', -4.9, 36.5, 0, 1, { draw: true });

  // ---- Regional Office (frame: Level 4, 40 × 30) --------------------------------------------------------------------
  put('office', 'G', 'c5_lobby', 15.6, 6.2);         // its stair door (21.9, 0) → Stairwell A (37.5, 6.2), NE
  put('office', 'G', 'c5_stairs', 35.2, -0.4);       // every landing door at (2.3, 6.6) → (37.5, 6.2)
  put('office', 'G', 'c5_forecourt', 11.6, 21, 0, 1, { draw: true });
  put('office', 'L2', 'c5_atrium', 0, 0);            // built in Level 4's own coordinates (the void, 13–27)
  put('office', 'L4', 'c5_level4', 0, 0);
  put('office', 'L4', 'c5_print', 32, 25.4);         // (0, 2.1) → the print door (32, 27.5)
  put('office', 'L4', 'c6_escalations', 0, 0);       // the NW corner room, built in Level 4's coordinates

  // ---- Levels 5 and 6 (frame: the half-stripped floors, 32 × 24) ----------------------------------------------------
  put('office_upper', 'L5', 'c6_level5', 0, 0);
  put('office_upper', 'L5', 'c6_firestairs', 4.85, 29.8, 180);  // the landings face north onto the floors' SW doors
  put('office_upper', 'L6', 'c6_level6', 0, 0);
  put('office_upper', 'L6', 'c6_lukaoffice', 7.8, 20);          // (1.2, 0) → the spine corridor door (9, 20)
  put('office_upper', 'L6', 'c6_shaft', 26, 11.8);              // the sill (0, 2.7) → Lift B's doorway (26, 14.5)

  // ---- District Hospital (frame: reception) -------------------------------------------------------------------------
  put('hospital', 'G', 'c7_reception', 0, 0);
  put('hospital', 'G', 'c7_waiting', -12, 2.2);      // (12, 5) → reception's west door (0, 7.2)
  put('hospital', 'G', 'c7_tearoom', -1.5, -5);      // (4.5, 5) → the door behind the desk (3, 0)
  put('hospital', 'G', 'c7_corridor', 16, 3);        // (0, 2) → reception's east door (16, 5)
  put('hospital', 'G', 'c7_nurses', 8, -20.5);       // (8, 3.5) → the corridor's far door (0, −20)
  put('hospital', 'G', 'c7_ward3', 10.5, -21);       // (1.5, 0) → the station's ward doors (4, −0.5)
  put('hospital', 'G', 'c7_room12', 10.8, -55);      // (1.2, 4) → the ward's end door (1.5, −30)
  put('hospital', 'G', 'c7_carpark', -11.4, 12, 0, 1, { draw: true });

  // ---- The Mast (frame: the compound) -------------------------------------------------------------------------------
  put('mast', 'G', 'c8_compound', 0, 0);
  put('mast', 'G', 'c8_mast', 15, 0.2);              // its gate (0, 10.2) → the compound's mast exit (15, 10.4)
  put('mast', 'G', '@head', 44, 4, 0, 2);            // the mast head at 56 m, drawn twice size in an inset
  put('mast', 'G', 'c8_transmitter', 50, -3.2, 90, 0.4);  // the 30 × 20 floor inside the hut: its door (15, 20) → the hut door

  // ---- receipt maps (the Outage) ------------------------------------------------------------------------------------
  derive('rmap_plaza', 'plaza', 90, ['c1_concourse', 'c1_foodcourt', 'c1_store', 'c1_backoffice', 'c1_stockroom', 'c1_kitchen', 'c1_corridor', 'c1_security', 'c1_staffroom', 'c1_dock']);
  derive('rmap_village', 'village', 0, ['c2_crescent', 'c2_office', 'c2_hall', 'c2_unit9', 'c2_garages', 'c2_bay4', 'c2_kitchen_out']);
  derive('rmap_exchange', 'exchange', 90, ['c3_hall', 'c3_records', 'c3_canteen', 'c3_foyer', 'c3_frame', 'c3_yard', 'c3_stairs', 'c3_fuse', 'c3_vault']);
  derive('rmap_care', 'care', 90, ['c4_floor', 'c4_lobby', 'c4_oldstore', 'c4_secoffice', 'c4_break', 'c4_records']);
  derive('rmap_office', 'office', 90, ['c5_level4', 'c5_print', 'c6_escalations', 'c5_atrium']);
  derive('rmap_office', 'office_upper', 90, ['c6_level5', 'c6_firestairs', 'c6_level6', 'c6_lukaoffice', 'c6_shaft']);
  { const b = pl('rmap_office', 'c5_level4'), p = fpt(b, 35.2, -0.4); put('rmap_office', 'L4', 'c5_stairs', p[0], p[1], 90, 1, { receipt: true }); }
  // the summit road with the compound on top of it (its gate apron (15, 34) → the road's top (37, −60))
  const RC = { receipt: true };
  put('rmap_mast', 'G', 'c8_summit', 0, 0, 0, 1, RC);
  put('rmap_mast', 'G', 'c8_compound', 22, -94, 0, 1, RC);
  put('rmap_mast', 'G', 'c8_mast', 37, -93.8, 0, 1, RC);
  put('rmap_mast', 'G', '@head', 60, -100, 0, 2);
  put('rmap_mast', 'G', 'c8_transmitter', 66, -107.2, 90, 0.4, RC);   // its door (15, 20) → the hut door, head (−1, −0.6)

  // =================================================================================================================
  // Frames: frame metres → map units. [x0, z0, x1, z1] in frame metres and a scale (units per metre).
  // =================================================================================================================
  const FR = {};
  function frame(map, box, sc) {
    const [x0, z0, x1, z1] = box;
    FR[map] = { ox: x0, oz: z0, sc, w: Math.round((x1 - x0) * sc), h: Math.round((z1 - z0) * sc) };
  }
  // receipts fit their placements automatically (every room's bounds, rotated) to a strip about 400 units wide
  function frameAuto(map, extra = [], wMax = 400, hMax = 820, pad = 3, padR = 16) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const add = (p) => { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); };
    for (const p of Object.values(PL)) {
      if (p.map !== map || p.room[0] === '@') continue;
      const b = (typeof ROOMS !== 'undefined' && ROOMS[p.room] && ROOMS[p.room].bounds) || null;
      if (!b) continue;
      for (const [x, z] of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) add(fpt(p, x, z));
    }
    for (const e of extra) add(e);
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = 40; z1 = 40; }
    x0 -= pad; z0 -= pad; x1 += padR; z1 += pad;                 // room on the right for Aidan's notes
    const sc = Math.min(wMax / (x1 - x0), hMax / (z1 - z0));
    frame(map, [x0, z0, x1, z1], Math.round(sc * 100) / 100);
  }
  frame('town', [-95, -628, 330, 34], 1.5);
  frame('plaza', [-26, -31, 94, 62], 7.2);
  frame('village', [-18, -37, 76, 64], 7.5);
  frame('exchange', [-24, -14, 55, 44], 10.8);
  frame('care', [-4, -11, 63, 53], 11.8);
  frame('office', [-9, -3, 45, 44], 16);
  frame('office_upper', [-3, -3, 35, 31], 22);
  frame('hospital', [-33, -58, 50, 47], 7.2);
  frame('mast', [-3, -8, 75, 37], 11);

  // =================================================================================================================
  // Drawing helpers. A "sheet" collects shapes for one map floor. Points may be frame metres [X, Z] or room-local
  // ['room', x, z] (transformed through that room's placement on this map).
  // =================================================================================================================
  const SHEETS = {};
  function sheet(map, floor, w, h) {
    const f = FR[map];
    const s = { map, floor, f, shapes: [], receipt: /^rmap_/.test(map) };
    SHEETS[map + '|' + floor] = s;
    return s;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  function mu(sh, X, Z) { return [r1((X - sh.f.ox) * sh.f.sc), r1((Z - sh.f.oz) * sh.f.sc)]; }
  function P(sh, p) {
    if (typeof p[0] === 'string') {
      const q = pl(sh.map, p[0]);
      if (!q) return mu(sh, 0, 0);
      const [X, Z] = fpt(q, p[1], p[2]);
      return mu(sh, X, Z);
    }
    const F = pl(sh.map, '@F');
    if (F) { const [X, Z] = fpt(F, p[0], p[1]); return mu(sh, X, Z); }
    return mu(sh, p[0], p[1]);
  }
  const M = (sh, m) => m * sh.f.sc;           // metres → units
  // a rectangle: frame metres [x0,z0,x1,z1], or a room-local box when `room` is given
  function rect(sh, room, x0, z0, x1, z1, label, o = {}) {
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => P(sh, room ? [room, x, z] : [x, z]));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const q = pl(sh.map, room || '@F');
    const axis = !q || (((q.rot % 90) + 90) % 90) === 0;
    let s;
    if (axis) { const X0 = Math.min(...xs), Y0 = Math.min(...ys); s = { t: 'rect', x: X0, y: Y0, w: r1(Math.max(...xs) - X0), h: r1(Math.max(...ys) - Y0) }; }
    else s = { t: 'poly', pts };
    if (label) s.label = label;
    Object.assign(s, o);
    sh.shapes.push(s);
    return s;
  }
  function poly(sh, room, pts, label, o = {}) {
    const s = { t: 'poly', pts: pts.map((p) => P(sh, room ? [room, p[0], p[1]] : p)) };
    if (label) s.label = label;
    Object.assign(s, o);
    sh.shapes.push(s);
    return s;
  }
  function road(sh, pts, wm, o = {}) {
    const s = { t: 'road', pts: pts.map((p) => P(sh, p)), w: r1(Math.max(6, M(sh, wm))) };
    Object.assign(s, o);
    sh.shapes.push(s);
    return s;
  }
  function line(sh, pts, o = {}) {
    const s = { t: 'line', pts: pts.map((p) => P(sh, p)) };
    Object.assign(s, o);
    sh.shapes.push(s);
    return s;
  }
  function text(sh, p, str, size, o = {}) {
    const [x, y] = P(sh, p);
    const s = { t: 'text', x, y, text: str, size };
    Object.assign(s, o);
    sh.shapes.push(s);
    return s;
  }
  // a small printed arrow (evacuation routes, the loop): a line with a head at the end
  function arrow(sh, pts, o = {}) {
    line(sh, pts, o);
    const a = P(sh, pts[pts.length - 2]), b = P(sh, pts[pts.length - 1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = o.head || 7;
    const h1 = [b[0] - Math.cos(ang - 0.45) * hl, b[1] - Math.sin(ang - 0.45) * hl], h2 = [b[0] - Math.cos(ang + 0.45) * hl, b[1] - Math.sin(ang + 0.45) * hl];
    sh.shapes.push({ t: 'line', pts: [h1, b, h2], lw: o.lw || 1 });
  }
  // a door swing symbol for a K.door {x, z, rot, w} of `room`: hinge at one end of the opening, the arc swinging into
  // the room it belongs to (or away from it with `flip`)
  function door(sh, room, x, z, rot, w, o = {}) {
    const q = pl(sh.map, room);
    if (!q) return;
    const a = [Math.cos(rot * D2R), -Math.sin(rot * D2R)];                    // the opening's axis (room-local)
    const c0 = P(sh, [room, x, z]), c1 = P(sh, [room, x + a[0], z + a[1]]);
    let A = [c1[0] - c0[0], c1[1] - c0[1]];
    const L = Math.hypot(A[0], A[1]) || 1; A = [A[0] / L, A[1] / L];
    const b = (typeof ROOMS !== 'undefined' && ROOMS[room] && ROOMS[room].bounds) || [x - 1, z - 1, x + 1, z + 1];
    const cen = P(sh, [room, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    let th = Math.atan2(A[1], A[0]);
    const R = Math.max(4, M(sh, w) * q.k);
    let hinge = [c0[0] - A[0] * R / 2, c0[1] - A[1] * R / 2];
    const n = [Math.sin(th), -Math.cos(th)];                                     // the side the arc bulges to
    const into = (cen[0] - c0[0]) * n[0] + (cen[1] - c0[1]) * n[1] > 0;
    if (into === !!o.flip) { hinge = [c0[0] + A[0] * R / 2, c0[1] + A[1] * R / 2]; th += Math.PI; }
    sh.shapes.push({ t: 'door', x: r1(hinge[0]), y: r1(hinge[1]), r: r1(R), rot: r1(th / D2R) });
  }
  // stairs: a room-local box with treads across `axis` ('x' = climbing along x) — the axis follows the rotation
  function stairs(sh, room, x0, z0, x1, z1, axis = 'x', label) {
    const s = rect(sh, room, x0, z0, x1, z1, null, {});
    const q = pl(sh.map, room || '@F');
    const rot = q ? (((q.rot % 180) + 180) % 180) : 0;
    const ax = rot === 90 ? (axis === 'x' ? 'y' : 'x') : (axis === 'x' ? 'x' : 'y');
    if (s.t === 'rect') { s.t = 'stairs'; s.axis = ax; }
    if (label) text(sh, room ? [room, (x0 + x1) / 2, (z0 + z1) / 2] : [(x0 + x1) / 2, (z0 + z1) / 2], label, 6.5);
    return s;
  }
  // an n-gon (fountain, roundabout, bin …) centred on p
  function ngon(sh, p, rm, n = 8, label, o = {}) {
    const c = P(sh, p), R = M(sh, rm);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / n; pts.push([r1(c[0] + Math.cos(a) * R), r1(c[1] + Math.sin(a) * R)]); }
    const s = { t: 'poly', pts, ...o };
    if (label) s.label = label;
    sh.shapes.push(s);
    return s;
  }
  const fill = true;

  // =================================================================================================================
  // THE TOWN — "SIGNAL HILL — VISITOR MAP — 1994" (the Lookout payphone booth, Prologue)
  // =================================================================================================================
  function MAP_town() {
    const T = sheet('town', 'G');
    const hrZ = (x) => { if (x <= 0 || x >= 120) return 0; const w = 2 * Math.PI / 60; return x <= 60 ? 3.5 * (1 - Math.cos(w * x)) : -3.5 * (1 - Math.cos(w * (x - 60))); };
    // ---- roads (printed as they were in 1994: the highway both ways, Exchange Road's lower branch down to Relay
    // Street, Ring Road all the way round) ----
    road(T, [[-95, 10.5], [330, 10.5]], 9);                                                        // the highway
    const hill = [['p2_lookout', 38.3, 7], ['p2_lookout', 38.3, -6]];
    for (let x = 0; x <= 120; x += 6) hill.push(['p3_hillroad', x, hrZ(x)]);
    hill.push(['p4_busshelter', -1.6, 6.7], ['p4_busshelter', 10.2, 6.7], ['p4_busshelter', 10.2, -7.6]);
    road(T, hill, 7);
    road(T, [['c1_relay', 7, 41.5], ['c1_relay', 7, -183]], 11);                                  // Relay Street
    road(T, [['c1_relay', 11, -60], ['c1_carpark', 0, 5]], 6);                                     // the car park entry
    road(T, [['c1_relay', 12, -171], ['c2_hilltoprd', -3, 4], ['c2_hilltoprd', 44, 4], ['c2_hilltoprd', 44, -10], ['c2_hilltoprd', 4, -10], ['c2_hilltoprd', 4, -24], ['c2_hilltoprd', 48, -24], ['c2_hilltoprd', 48, -38], ['c2_crescent', 4, 54], ['c2_crescent', 4, 36]], 7);
    road(T, [['c2_crescent', 4, 20], ['c2_crescent', 4, 4], ['c2_crescent', 56, 4], ['c2_crescent', 56, 36], ['c2_crescent', 4, 36], ['c2_crescent', 4, 20]], 7);
    road(T, [['c2_crescent', 4, 4], ['c2_crescent', 4, -33], ['c3_exchangerd', 111, 4], ['c3_exchangerd', 0, 4], ['c3_forecourt', 36.6, 11]], 6);
    road(T, [['c2_crescent', 58, 4], ['c2_crescent', 58, -16], ['c2_crescent', 26.3, -16]], 4.5);
    road(T, [['c3_exchangerd', 77, 4], ['c3_exchangerd', 77, 20], [196, -292], [172, -248], ['c1_relay', -4, -196], ['c1_relay', 7, -183]], 6);   // the lower branch, as printed
    road(T, [['c4_wirelane', 90.2, 0], ['c4_wirelane', 0, 0], ['c4_park', 39, 44], ['c4_park', 39, 24]], 6);
    road(T, [['c4_park', 3, 19.5], ['c4_park', 60.6, 19.5], ['c5_ringroad', 0, 72.6], ['c5_ringroad', 0, 0]], 8);
    road(T, [['c5_ringroad', -40, 0], ['c5_ringroad', 86, 0], ['c7_ringroad', 0, 0], ['c7_ringroad', 95.5, 0], ['c7_carpark', 8, 42], ['c7_carpark', 8, 30]], 8);
    road(T, [['c5_ringroad', 52, -3], ['c5_ringroad', 52, -9]], 7);                                // the office forecourt
    road(T, [['c7_carpark', 40.3, 4.5], ['c7_carpark', 56, 4.5], ['c8_summit', 40, 12], ['c8_summit', 40, 0], ['c8_summit', 4, 0], ['c8_summit', 4, -14], ['c8_summit', 40, -14], ['c8_summit', 40, -28], ['c8_summit', 4, -28], ['c8_summit', 4, -42], ['c8_summit', 37, -42], ['c8_summit', 37, -60], ['c8_compound', 15, 34], ['c8_compound', 15, 20]], 6);
    ngon(T, ['c5_ringroad', 0, 0], 7.5, 10);                                                       // the roundabout
    ngon(T, ['c5_ringroad', 0, 0], 2.2, 8, null, { fill });                                        // its dry fountain
    // ---- the Lookout, Hill Road, the bus shelter ----
    rect(T, 'p2_lookout', 0, 1.1, 44, 7, null, { dash: true });
    rect(T, 'p2_lookout', 4.4, 1.9, 5.6, 3.1, null, { fill });                                    // the payphone booth
    // the "You are here" sticker, stuck on beside the booth where the map hung
    poly(T, 'p2_lookout', [[-6, -13], [16, -13], [17.5, -8], [16, -3], [7.4, -3], [5, 0.8], [3.8, -3], [-6, -3]], 'YOU ARE HERE', { fill: '#e4c65a', size: 8, lw: 0.8, lx: P(T, ['p2_lookout', 5.6, -8])[0], ly: P(T, ['p2_lookout', 5.6, -8])[1] });
    text(T, ['p2_lookout', 22, 24], 'The Lookout', 11, { italic: true });
    text(T, ['p2_lookout', 22, 30], 'rest area · public telephone', 6.5);
    rect(T, 'p4_busshelter', 2.4, 0.6, 5.5, 2.1, null, { fill });
    text(T, ['p4_busshelter', 17, 3], 'Route 44\nbus stop', 6.5, { align: 'left' });
    text(T, ['p3_hillroad', 90, 5.5], 'letterbox', 5.5);
    text(T, ['p3_hillroad', 60.5, 12], 'fire trail', 5.5);
    for (const [x, d] of [[14, 10], [22, -10], [44, 10], [96, -10], [104, 10], [112, -10]]) ngon(T, ['p3_hillroad', x, hrZ(x) + d], 1.6, 6);   // gum trees
    // ---- Relay Street: the west side's shopfronts (metres from the south end = −z), the Plaza on the east ----
    const shops = [[-3, -11, ''], [-12, -28, 'Hilltop Mobile Repairs'], [-29, -36, ''], [-37, -53, 'Bank'], [-54, -66, ''], [-67, -83, 'Newsagent'], [-84, -91, ''], [-92, -108, 'Pharmacy'], [-109, -126, ''], [-127, -142, ''], [-143, -160, '']];
    for (const [a, b, name] of shops) {
      rect(T, 'c1_relay', -10.5, b, -0.3, a, null, { fill });
      if (name) text(T, ['c1_relay', -12.5, (a + b) / 2], name, 7, { align: 'right' });
    }
    text(T, ['c1_relay', -12.5, -79.5], '(public telephone)', 5.5, { align: 'right', italic: true });
    text(T, ['c1_relay', -12.5, -162], 'memorial bench', 6, { align: 'right', italic: true });
    ngon(T, ['c1_relay', 1.2, -165], 1.1, 4, null, { fill });
    text(T, ['c1_relay', -12.5, -172.5], 'traffic lights', 5.5, { align: 'right', italic: true });
    rect(T, 'c1_relay', 14.3, -56, 26, -8, null, { fill });                                         // the east side, south of the car park
    // the Plaza: one long block behind the Relay Street facade, its car park and loading dock to the south
    poly(T, null, [[180.2, -178], [262, -178], [262, -104], [240, -104], [240, -97], [180.2, -97], [180.2, -136], [184, -136], [184, -146], [180.2, -146]], 'Signal Hill\nPlaza', { fill, size: 12, lx: P(T, [221, -150])[0], ly: P(T, [221, -150])[1] });
    text(T, [221, -128], 'over thirty specialty stores', 6, { italic: true });
    rect(T, 'c1_carpark', 0, 0, 40, 30, 'car park', { dash: true, size: 7 });
    rect(T, null, 225.5, -76, 243, -63, 'dock', { fill, size: 6 });
    // ---- Hilltop Road and the village ----
    text(T, ['c2_hilltoprd', 22, 11], 'Route 44 stop 2', 5.5);
    text(T, ['c2_hilltoprd', -7, -31], 'lookout bench', 5.5, { align: 'right', italic: true });
    const units = [[18.5, 45, 180], [34.5, 45, 180], [50.5, 45, 180], [65, 33.5, -90], [65, 20, -90], [65, 6.5, -90], [48.5, -5, 0], [31.5, -5, 0], [14.5, -5, 0], [-5, 9.5, 90], [-5, 23, 90], [-5, 36.5, 90]];
    for (const [x, z, r] of units) {
      if (r === 180) rect(T, 'c2_crescent', x - 4.5, z, x + 4.5, z + 8, null, { fill });
      else if (r === 0) rect(T, 'c2_crescent', x - 4.5, z - 8, x + 4.5, z, null, { fill });
      else if (r === -90) rect(T, 'c2_crescent', x, z - 4.5, x + 8, z + 4.5, null, { fill });
      else rect(T, 'c2_crescent', x - 8, z - 4.5, x, z + 4.5, null, { fill });
    }
    rect(T, 'c2_crescent', 21, 14, 39, 26, null, { fill });
    rect(T, 'c2_crescent', -12.6, 42.2, -2, 48.2, null, { fill });
    rect(T, 'c2_crescent', 30, -25, 51, -19, null, { fill });
    text(T, ['c2_crescent', 30, 72], 'Hilltop Village', 11, { italic: true });
    text(T, ['c2_crescent', 30, 80], 'independent living', 6);
    // ---- Exchange Road, the operators' cottages, the exchange ----
    for (const x of [96, 70, 47, 24]) rect(T, 'c3_exchangerd', x - 4, -9, x + 4, -2, null, { fill });
    for (const x of [100, 56]) rect(T, 'c3_exchangerd', x - 4, 11, x + 4, 18, null, { fill });
    text(T, ['c3_exchangerd', 60, -15], "operators' cottages", 6, { italic: true });
    poly(T, '@exchange', [[-20, -0.4], [17, -0.4], [17, -8], [27, -8], [27, -0.4], [50, -0.4], [50, 17], [-20, 17]], null, { fill, lw: 1.3 });
    rect(T, '@exchange', -19, -10.6, 1, -0.6, null, { dash: true });
    text(T, ['@exchange', 15, -16], 'Trunk Exchange', 11, { italic: true });
    text(T, ['@exchange', 15, -10.5], 'est. 1961', 6);
    rect(T, 'c3_forecourt', 0, 0, 37, 20, null, { dash: true });
    // ---- Wire Lane, the business park, the call centre ----
    rect(T, 'c4_wirelane', 35, 5, 42, 10, null, { fill });
    text(T, ['c4_wirelane', 38.5, 15], 'substation', 5.5);
    rect(T, 'c4_wirelane', 46, -12, 88, -5, null, { dash: true });
    text(T, ['c4_wirelane', 67, -15.5], 'cable depot', 5.5);
    rect(T, 'c4_park', 3, 3.5, 53.2, 14.5, null, { dash: true });
    rect(T, 'c4_park', 3, 27.6, 21, 40.6, 'warehouse', { fill, size: 5.5 });
    rect(T, 'c4_park', 42.8, 27.5, 60.6, 40.6, 'warehouse', { fill, size: 5.5 });
    text(T, ['c4_park', -3, 29], 'Business Park', 8, { italic: true, align: 'right' });
    text(T, ['c4_park', 62, 27.5], 'boom gate', 5.5, { align: 'left' });
    poly(T, '@care', [[0, -8], [10, -8], [10, 0], [50, 0], [50, 3.1], [60, 3.1], [60, 11.1], [50, 11.1], [50, 28], [40.1, 28], [40.1, 38.5], [35.1, 38.5], [35.1, 40], [15.1, 40], [15.1, 28], [0, 28]], null, { fill, lw: 1.3 });
    text(T, ['@care', 30, 14], 'Customer Care\nCentre', 9, { italic: true });
    // ---- Ring Road, the servo, the Regional Office ----
    rect(T, 'c5_ringroad', -24.2, 30, -6.4, 52, null, { fill });
    text(T, ['c5_ringroad', -15.3, 56.5], 'service station', 6);
    text(T, ['c5_ringroad', 12, 12], 'fountain', 5.5, { align: 'left', italic: true });
    rect(T, '@office', 0, 0, 40, 22.2, null, { fill, lw: 1.3 });
    rect(T, '@office', 0, 22.2, 40, 30, null, { dash: true });
    rect(T, 'c5_forecourt', 0, 1.2, 32, 22, null, { dash: true });
    text(T, ['@office', 20, -7], 'Regional Office', 11, { italic: true });
    // ---- Ring Road east, the hospital, Summit Road, the mast ----
    text(T, ['c7_ringroad', 48, 11], 'bus stop', 5.5);
    rect(T, 'c7_carpark', -18, 0, 0, 30, 'multi-\nstorey', { fill, size: 5.5 });
    rect(T, 'c7_carpark', 0, 0, 40, 30, null, { dash: true });
    poly(T, '@hospital', [[-12, 2.2], [-1.5, 2.2], [-1.5, -5], [8, -5], [8, -21.2], [7, -21.2], [7, -55], [18, -55], [18, -21.2], [16, -21.2], [16, -19], [48, -19], [48, 13], [16, 13], [16, 12], [-12, 12.2]], null, { fill, lw: 1.3 });
    text(T, ['@hospital', -16, -30], 'District\nHospital', 10, { italic: true, align: 'right' });
    rect(T, 'c8_compound', 0, 0, 30, 20, null, { dash: true });
    rect(T, 'c8_compound', 3, 3, 8, 7.5, null, { fill });
    rect(T, 'c8_compound', 22, 5, 27, 9.5, null, { fill });
    line(T, [['c8_compound', 12.5, 8], ['c8_compound', 15, -1], ['c8_compound', 17.5, 8]], { lw: 1.4 });   // the lattice, in plan
    line(T, [['c8_compound', 13.2, 5.5], ['c8_compound', 16.8, 5.5]]);
    text(T, ['c8_compound', 15, -9], 'The Mast', 11, { italic: true });
    text(T, ['c8_compound', 15, -4], 'RF facility — no public access', 5.5);
    // ---- bush and forest where there are no streets (the fog, in practice) ----
    // a scatter of little tree marks round a label (kept clear of the label itself)
    const trees = (cx, cz, rx, rz, n, seed, label, size = 8) => {
      const r = U.rng(seed), hw = label ? label.length * size * 0.33 / T.f.sc : 0, hh = label ? 5 : 0;
      for (let i = 0, k = 0; i < n && k < n * 4; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()), x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d, rr = 1.3 + r() * 1.2;
        if (label && Math.abs(x - cx) < hw && Math.abs(z - cz) < hh) continue;
        ngon(T, [x, z], rr, 6); i++;
      }
      if (label) text(T, [cx, cz], label, size, { italic: true });
    };
    trees(-45, -575, 42, 30, 34, 11, 'Signal Hill State Forest');
    trees(290, -400, 30, 45, 26, 12, 'bushland');
    trees(120, -420, 45, 18, 22, 13, 'bushland');
    trees(290, -60, 30, 30, 22, 14, 'valley — steep', 7);
    trees(80, -60, 25, 30, 20, 15);
    // ---- street names (small capitals) ----
    const st = (p, s, rot, size = 8.5) => text(T, p, s, size, { rot, spacing: 0.25 });
    st([-60, 3.5], 'Highway', 0); st([270, 3.5], 'Highway', 0);
    text(T, [-88, 17.5], '← to the city', 6, { align: 'left', italic: true });
    text(T, [323, 17.5], 'to the coast →', 6, { align: 'right', italic: true });
    st(['p3_hillroad', 70, -12], 'Hill Road', -8);
    st(['c1_relay', 7, -28], 'Relay Street', -90, 8);
    st(['c2_hilltoprd', 24, -17], 'Hilltop Road', 0, 6.3);
    st(['c3_exchangerd', 30, 13], 'Exchange Road', 0, 7.5);
    st([186, -265], 'Exchange Rd', -63, 6.5);
    st(['c4_wirelane', 22, 8.5], 'Wire Lane', 0, 7);
    st(['c5_ringroad', 12, 58], 'Ring Road', -90, 7.5);
    st(['c5_ringroad', -28, -9.5], 'Ring Road', 0, 7);
    st(['c7_ringroad', 30, -10], 'Ring Road', 0, 7.5);
    st(['c8_summit', 22, 7.5], 'Summit Road', 0, 6.5);
    // ---- the legend, the welcome, a scale bar ----
    const LX = -88;
    text(T, [LX, -250], 'Places of interest', 9, { align: 'left', spacing: 0.2 });
    const places = ['The Lookout — highway rest area', 'Signal Hill Plaza — shopping', 'Hilltop Village — independent living', 'Trunk Exchange — the town\'s telephone exchange', 'Business Park · Customer Care Centre', 'Regional Office', 'District Hospital — 24 hr emergency', 'The Mast — no public access'];
    places.forEach((p, i) => text(T, [LX, -240 + i * 6.5], p, 5.6, { align: 'left' }));
    line(T, [[LX, -254.5], [-20, -254.5]]);
    text(T, [LX, -150], 'Welcome to Signal Hill', 9, { align: 'left', italic: true });
    text(T, [LX, -143], 'Pop. 1,900 · elevation 610 m', 6, { align: 'left' });
    text(T, [LX, -137], 'Public telephones: Lookout, Relay St, Plaza,', 5.2, { align: 'left' });
    text(T, [LX, -132], 'Hilltop Village, Exchange Rd, Wire Lane.', 5.2, { align: 'left' });
    line(T, [[LX, -110], [LX + 100, -110]], { lw: 1.2 });
    for (const x of [0, 25, 50, 75, 100]) line(T, [[LX + x, -112.5], [LX + x, -107.5]]);
    text(T, [LX, -103], '0', 5.5); text(T, [LX + 50, -103], '50', 5.5); text(T, [LX + 100, -103], '100 m', 5.5);
    return T;
  }

  // =================================================================================================================
  // SIGNAL HILL PLAZA — DIRECTORY (the security office, Ch 1). Paper: the ground floor; receipt: the Outage plaza.
  // =================================================================================================================
  function MAP_plaza(sh) {
    if (sh.receipt) return MAP_plazaOutage(sh);
    poly(sh, null, [[-8, -24.5], [47, -24.5], [47, -27.5], [75.5, -27.5], [75.5, -17.5], [78, -17.5], [78, 21], [38, 21], [38, 26], [0, 26], [0, -1], [-8, -1]], null, { lw: 2.2 });
    road(sh, [[-17, -31], [-17, 62]], 8.5);
    road(sh, [[-17, 45], [40, 45]], 5.5);
    rect(sh, null, 40, 31, 92, 60, 'Car park', { dash: true, size: 13 });
    text(sh, [-17, 18], 'Relay Street', 11, { rot: -90, spacing: 0.25 });
    text(sh, [-5.5, 6], 'main\nentrance', 7, { align: 'right' });
    // the concourse, the food court, the store
    rect(sh, 'c1_concourse', 0, -1, 60, 12, null, { lw: 1.2 });
    text(sh, ['c1_concourse', 16, 3.2], 'Concourse', 15, { spacing: 0.2 });
    ngon(sh, ['c1_concourse', 12, 5.5], 2.4, 8, null, {});
    text(sh, ['c1_concourse', 12, 9.7], 'fountain', 6.5);
    stairs(sh, 'c1_concourse', 26, 10.4, 38, 12, 'x');
    text(sh, ['c1_concourse', 32, 8.8], 'escalator (L1 closed)', 6);
    rect(sh, 'c1_foodcourt', 0, 0, 30, 21, null, {});
    text(sh, ['c1_foodcourt', 15, 10], 'Food Court', 15, { spacing: 0.2 });
    for (const [x, z] of [[6, 5], [14, 5], [22, 5], [6, 16], [14, 16], [22, 16]]) ngon(sh, ['c1_foodcourt', x, z], 1.1, 6);
    text(sh, ['c1_foodcourt', 3, 13.2], 'phone', 6, { align: 'left' });
    rect(sh, 'c1_foodcourt', 0.2, 0.2, 29.8, 1.4, null, { fill });                          // the shuttered stalls
    rect(sh, 'c1_store', 0, 0, 20, 16, null, { lw: 1.4, fill: 'rgba(40,110,112,0.14)' });
    text(sh, ['c1_store', 10, 8.6], 'Optus', 14, { spacing: 0.3 });
    text(sh, ['c1_store', 10, 10.6], 'mobile · internet · home phone', 6.5, { italic: true });
    rect(sh, 'c1_store', 5, 2.5, 15, 3.6, null, { fill });                                   // the counter
    for (const [x, z] of [[5, 6], [10, 6], [15, 6], [5, 13.5], [10, 13.5], [15, 13.5]]) rect(sh, 'c1_store', x - 1, z - 0.4, x + 1, z + 0.4, null, {});
    rect(sh, 'c1_backoffice', 0, 0, 6, 5, 'Staff\nonly', { size: 6.5 });
    rect(sh, 'c1_stockroom', 0, 0, 12, 10, 'Stock', { size: 8 });
    rect(sh, 'c1_corridor', 0, 0, 40, 3, 'service corridor', { size: 7 });
    rect(sh, 'c1_security', 0, 0, 8, 6, 'Security', { size: 8 });
    rect(sh, 'c1_staffroom', 0, 0, 8, 6, 'Staff\nroom', { size: 7.5 });
    rect(sh, 'c1_dock', 0, 0, 20, 12, 'Loading\ndock', { size: 8, dash: true });
    // the other shops (closed)
    const shop = (x0, z0, x1, z1, n) => rect(sh, 'c1_concourse', x0, z0, x1, z1, n, { size: 6.5 });
    shop(22, -14, 28.5, -1, '12\nvacant'); shop(28.5, -14, 34.5, -1, '14\nnews'); shop(34.5, -14, 41, -1, '16\nshoes');
    shop(0, 12, 9.5, 26, '2\nchemist'); shop(9.5, 12, 19, 26, '4\nbank'); shop(19, 12, 28.5, 26, '6\nvariety'); shop(28.5, 12, 38, 26, '8\ntoys');
    shop(61, -17.5, 78, -1, '20\ncinema'); shop(61, -1, 78, 12, '22\nvacant');
    shop(55, 15, 65, 21, 'toilets'); shop(38, 15, 47, 21, 'plant'); shop(73, 15, 78, 21, '');
    // doors
    door(sh, 'c1_concourse', 43, 12, 0, 0.95); door(sh, 'c1_concourse', 0, 6, 90, 1.8, { flip: true });
    door(sh, 'c1_foodcourt', 27.6, 0, 0, 0.95); door(sh, 'c1_foodcourt', 0, 6, 90, 1.6);
    door(sh, 'c1_kitchen', 10, 3, 90, 0.9); door(sh, 'c1_store', 17.5, 0, 0, 0.9, { flip: true });
    door(sh, 'c1_backoffice', 6, 2.5, 90, 0.9, { flip: true });
    door(sh, 'c1_corridor', 40, 1.5, 90, 0.95); door(sh, 'c1_corridor', 31, 3, 0, 0.9, { flip: true }); door(sh, 'c1_corridor', 13, 3, 0, 0.9, { flip: true });
    line(sh, [['c1_dock', 3.5, 0], ['c1_dock', 6.5, 0]], { lw: 3 });                         // the roller door, half up
    // the kitchen and the service passage (staff only)
    rect(sh, 'c1_kitchen', 0, 0, 10, 6, 'Kitchen', { size: 7, dash: true });
    poly(sh, null, [[18.4, -22], [18.4, -24.2], [47.3, -24.2], [47.3, -19.8], [22, -19.8], [22, -22]], null, { dash: true });
    text(sh, [33, -26.2], 'service — staff only', 6, { italic: true });
    return sh;
  }
  // the Outage Plaza, printed on a receipt: the concourse sealed with stacked contracts, the only way to the store
  // through the food court kitchen and the service passage, the store's floor stretching back into the dark, the
  // stockroom open behind the back office. (The service corridor side is not printed at all.)
  function MAP_plazaOutage(sh) {
    rect(sh, 'c1_concourse', 0, -1, 43, 12, 'CONCOURSE', { size: 8 });
    ngon(sh, ['c1_concourse', 12, 5.5], 2.2, 8, null, {});
    rect(sh, 'c1_concourse', 41.4, -1, 43, 12, null, { fill: 'rgba(40,44,52,0.6)' });
    text(sh, ['c1_concourse', 39, 5.5], 'PAPER', 6, { rot: 0 });
    rect(sh, 'c1_foodcourt', 0, 0, 30, 21, 'FOOD COURT', { size: 8 });
    text(sh, ['c1_foodcourt', 15, 13.5], 'CIRCUIT BOARD', 5);
    text(sh, ['c1_foodcourt', 2.5, 13.2], 'PHONE', 5, { align: 'left' });
    rect(sh, 'c1_kitchen', 0, 0, 10, 6, 'KITCHEN', { size: 6.5 });
    poly(sh, null, [[18.4, -22], [18.4, -24.2], [47.3, -24.2], [47.3, -19.8], [22, -19.8], [22, -22]], null, {});
    rect(sh, 'c1_backoffice', 0, 0, 6, 5, 'OFFICE', { size: 5.5 });
    rect(sh, 'c1_stockroom', 0, 0, 12, 10, 'STOCK', { size: 7 });
    text(sh, ['c1_stockroom', 6, 7.8], 'RETURNS', 5);
    rect(sh, 'c1_store', 0, 0, 20, 16, null, { lw: 1.3 });
    rect(sh, 'c1_store', 0, 16, 20, 56, null, { dash: true });
    rect(sh, 'c1_store', 5, 2.5, 15, 3.6, null, { fill });
    for (let z = 6; z < 54; z += 5) for (const x of [6.5, 13.5]) rect(sh, 'c1_store', x - 1, z - 0.4, x + 1, z + 0.4, null, {});
    text(sh, ['c1_store', 10, 9.5], 'STORE 0288', 7);
    text(sh, ['c1_store', 10, 30], 'EVERY PHONE RINGING', 5);
    text(sh, ['c1_store', 10, 51.5], 'NO END', 6.5);
    door(sh, 'c1_foodcourt', 27.6, 0, 0, 0.95); door(sh, 'c1_kitchen', 10, 3, 90, 0.9);
    door(sh, 'c1_store', 17.5, 0, 0, 0.9, { flip: true }); door(sh, 'c1_backoffice', 6, 2.5, 90, 0.9, { flip: true });
    return sh;
  }

  // =================================================================================================================
  // HILLTOP VILLAGE — SITE PLAN (the village office wall, Ch 2); receipt: the loop, every door a 9
  // =================================================================================================================
  const MAP_UNITS = [[1, 18.5, 45, 180], [2, 34.5, 45, 180], [3, 50.5, 45, 180], [4, 65, 33.5, -90], [5, 65, 20, -90], [6, 65, 6.5, -90], [7, 48.5, -5, 0], [8, 31.5, -5, 0], [9, 14.5, -5, 0], [10, -5, 9.5, 90], [11, -5, 23, 90], [12, -5, 36.5, 90]];
  function MAP_village(sh) {
    const R = sh.receipt;
    const C = 'c2_crescent';
    road(sh, [[C, 4, 20], [C, 4, 4], [C, 56, 4], [C, 56, 36], [C, 4, 36], [C, 4, 20]], 8);
    road(sh, [[C, 4, 36], [C, 4, 63]], 8);
    road(sh, [[C, 4, 4], [C, 4, -36]], 6.4);
    road(sh, [[C, 58, 4], [C, 58, -13.2]], 6);
    rect(sh, C, 8, 8, 52, 32, null, { dash: true });                                          // the island
    rect(sh, 'c2_hall', 0, 0, 18, 12, R ? 'HALL' : 'Community\nhall', { size: R ? 8 : 9, fill: R ? undefined : true });
    door(sh, C, 30, 26, 0, 1.8, { flip: true });
    for (const [n, x, z, r] of MAP_UNITS) {
      let box;
      if (n === 9) box = [8.9, -13, 18.9, -5];
      else if (r === 180) box = [x - 5, z, x + 5, z + 8];
      else if (r === 0) box = [x - 5, z - 8, x + 5, z];
      else if (r === -90) box = [x, z - 5, x + 8, z + 5];
      else box = [x - 8, z - 5, x, z + 5];
      const label = R ? '9' : (n === 9 ? null : String(n));
      rect(sh, C, box[0], box[1], box[2], box[3], label, { size: R ? 11 : 11, fill: n === 9 ? undefined : true, lw: n === 9 ? 1.4 : 1 });
      const d = r === 180 ? [x - 1.6, z, 0] : r === 0 ? [x - 1.6, z, 0] : [x, z + (r === -90 ? 1.6 : -1.6), 90];
      door(sh, C, d[0], d[1], d[2], 0.95, { flip: true });
    }
    // Unit 9 inside: hall, lounge (right), kitchen (back left), bedroom (back right), bathroom
    const U9 = 'c2_unit9';
    rect(sh, U9, 0, 0, 3.3, 5, R ? null : 'kitchen', { size: 5 });
    rect(sh, U9, 0, 5, 3.3, 8, R ? null : 'bath', { size: 5 });
    rect(sh, U9, 4.7, 0, 10, 3.5, R ? null : 'bedroom', { size: 5 });
    rect(sh, U9, 4.7, 3.5, 10, 8, R ? null : 'lounge', { size: 5 });
    text(sh, [U9, 5, 9.6], R ? 'UNIT 9' : 'Unit 9', R ? 6.5 : 8);
    door(sh, U9, 3.3, 6.4, 90, 0.8); door(sh, U9, 4.7, 2.4, 90, 0.85);
    // the office, the gate, the garages, the back gate
    rect(sh, 'c2_office', 0, 0, 10.6, 6, R ? 'OFFICE' : 'Office', { size: 8, fill: R ? undefined : true });
    door(sh, 'c2_office', 10.6, 3.8, 90, 1);
    text(sh, [C, -8, 55], R ? 'GATE' : 'front gate', 6.5);
    line(sh, [[C, -0.5, 53.3], [C, 8.5, 53.3]], { lw: 2 });
    text(sh, [C, 4, 66], R ? 'HILLTOP RD' : 'to Hilltop Road', 6.5, { italic: !R });
    const bayW = (24.4 - 3.9) / 6;
    for (let i = 0; i < 6; i++) {
      const x0 = 3.9 + i * bayW, n = 6 - i;
      rect(sh, 'c2_garages', x0, -6, x0 + bayW, 0, String(n), { size: 6.5 });
    }
    rect(sh, 'c2_garages', 0, 0, 32, 6, null, {});
    text(sh, ['c2_garages', 14, 4.1], R ? 'GARAGES' : 'garages', 6);
    line(sh, [[C, 0.8, -10.5], [C, 7.2, -10.5]], { lw: 2 });
    text(sh, [C, -1.5, -10.5], R ? 'BACK GATE' : 'back gate', 6, { align: 'right' });
    text(sh, [C, 4, -39.5], R ? 'EXCHANGE RD' : 'to Exchange Road', 6.5, { italic: !R });
    if (!R) {
      text(sh, [C, 30, 29.6], 'community garden', 6.5, { italic: true });
      text(sh, [C, 30, 4.2], 'The Crescent', 8.5, { spacing: 0.25 });
      text(sh, [C, 30, 36.2], 'The Crescent', 8.5, { spacing: 0.25 });
      text(sh, [C, 44, 12], 'gnome', 5, { italic: true });
      text(sh, [C, -14, 30], 'Visitors please\nsign in at the office', 6, { italic: true, align: 'left' });
      text(sh, [C, 70, 58], 'Units 1–12 · independent living', 6.5, { align: 'right', italic: true });
    } else {
      // the loop: out through the back gate, back in at the front gate
      arrow(sh, [[C, 4, -30], [C, -15, -30], [C, -15, 58], [C, 1, 58]], { dash: true, head: 8 });
      text(sh, [C, -17, 14], 'BACK TO HER DOOR', 6.5, { rot: -90 });
      // the kitchen, swollen to twenty metres: the chair on its side, the pendant glowing at the centre
      rect(sh, 'c2_kitchen_out', 0, 0, 20, 20, 'KITCHEN', { dash: true, size: 9 });
      ngon(sh, ['c2_kitchen_out', 10, 10], 0.9, 8, null, { fill: 'rgba(160,40,32,0.5)' });
    }
    return sh;
  }

  // =================================================================================================================
  // SIGNAL HILL TRUNK EXCHANGE — FIRE EVACUATION PLAN (the foyer wall, Ch 3): ground floor and basement
  // =================================================================================================================
  function MAP_exchangeG(sh) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    rect(sh, 'c3_hall', 0, 0, 40, 14, null, { lw: 1.3 });
    text(sh, ['c3_hall', 19, 6.6], R ? "OPERATORS' HALL" : "Operators' Hall", R ? 9 : 13, { spacing: 0.2 });
    for (const z of [3.2, 10.6]) rect(sh, 'c3_hall', 6.3, z - 1.1, 36.9, z + 1.1, null, { fill });
    rect(sh, 'c3_hall', 6.3, 12.6, 36.9, 13.6, null, { fill });
    rect(sh, 'c3_hall', 0.6, 5.2, 2.2, 8.2, null, { fill: R ? 'rgba(40,44,52,0.4)' : 'rgba(150,110,40,0.35)' });   // Wai's lit board
    text(sh, ['c3_hall', 3.3, 4.4], lab("Wai's board"), 5.5, { align: 'left' });
    rect(sh, 'c3_records', 0, 0, 10, 8, lab('Records'), { size: 8 });
    rect(sh, 'c3_canteen', 0, 0, 10, 8, lab('Canteen'), { size: 8 });
    rect(sh, 'c3_foyer', 0, 0, 10, 8, lab('Foyer'), { size: 8 });
    rect(sh, 'c3_frame', 0, 0, 20, 14, null, {});
    text(sh, ['c3_frame', 10, 7], R ? 'MAIN\nDISTRIBUTION\nFRAME' : 'Main\ndistribution\nframe', R ? 7 : 8.5);
    for (const x of [4, 8, 12, 16]) rect(sh, 'c3_frame', x - 0.4, 2, x + 0.4, 12, null, { fill });
    rect(sh, 'c3_yard', 0, 0, 20, 10, lab('Rear yard'), { size: 8, dash: true });
    rect(sh, null, 40, 3.6, 50, 9, lab('lobby'), { size: 6 });                           // between the hall and the foyer
    stairs(sh, 'c3_stairs', 0.4, 0.3, 3.6, 6, 'y', R ? 'DOWN' : 'down');
    rect(sh, 'c3_stairs', 0, 0, 4, 9, null, {});
    // doors
    door(sh, 'c3_hall', 0, 6.17, 90, 0.9); door(sh, 'c3_hall', 0, 7.09, 90, 0.9, { flip: true });
    door(sh, 'c3_hall', 40, 6.63, 90, 0.95); door(sh, 'c3_hall', 40, 1.6, 90, 1, { flip: true });
    door(sh, 'c3_hall', 22, 0, 0, 0.9, { flip: true }); door(sh, 'c3_hall', 38.6, 14, 0, 0.9, { flip: true });
    door(sh, 'c3_foyer', 6.5, 8, 0, 1.8); door(sh, 'c3_foyer', 2.4, 0, 0, 0.95);
    door(sh, 'c3_frame', 17, 0, 0, 0.9);
    line(sh, [['c3_yard', 0, 3.1], ['c3_yard', 0, 6.9]], { lw: 2.2 });                     // the yard gate
    text(sh, ['c3_yard', -1.2, 5], lab('gate'), 5.5, { align: 'right' });
    text(sh, ['c3_yard', -1.2, 8.2], R ? 'WIRE LN' : 'to Wire Lane', 5.5, { align: 'right', italic: !R });
    if (!R) {
      poly(sh, null, [[-20, -0.4], [17, -0.4], [17, -8], [27, -8], [27, -0.4], [50, -0.4], [50, 17], [40, 17], [40, 22], [30, 22], [30, 14], [-20, 14]], null, { lw: 2.2 });
      rect(sh, null, 18.5, 24, 55.5, 39, null, { dash: true });
      text(sh, [37, 30.5], 'ASSEMBLY AREA', 12, { spacing: 0.3 });
      text(sh, [37, 34.5], 'the forecourt', 8, { italic: true });
      text(sh, [55, 37.5], 'to Exchange Road →', 6.5, { align: 'right', italic: true });
      // escape routes: out through the foyer to the forecourt; the frame hall through the yard
      arrow(sh, [['c3_hall', 30, 7.5], ['c3_hall', 39.3, 7.5], [42.4, 7.5], [42.4, 12.5], [46.5, 12.5], [46.5, 26.5]], { dash: true, head: 8 });
      arrow(sh, [['c3_frame', 10, 4], ['c3_frame', 17, 1.5], ['c3_yard', 16, 6]], { dash: true, head: 8 });
      text(sh, [47.5, 19.5], 'EXIT', 7, { align: 'left' });
      text(sh, ['c3_yard', 10, 3], 'EXIT', 7);
      // the "you are here" dot where the plan hangs (the foyer's west wall)
      ngon(sh, ['c3_foyer', 0.9, 5.6], 0.55, 10, null, { fill: '#b8261f', lw: 0.6 });
      text(sh, ['c3_foyer', 1.7, 6.9], 'you are here', 5.5, { align: 'left' });
      text(sh, [-22, 40.5], 'In case of fire: raise the alarm, leave by the nearest exit, do not use the lift.', 6.5, { align: 'left', italic: true });
      const leg = ['Legend', '- - ->   escape route', 'EXIT   fire exit', '●   you are here', 'Extinguishers: canteen, foyer, frame hall.', 'Basement: fuse room and cable vault, stair at the east end.'];
      leg.forEach((t, i) => text(sh, [-21, 21 + i * 2.5], t, i ? 6.3 : 8, { align: 'left', italic: !i, spacing: i ? 0.1 : 0.2 }));
    } else {
      rect(sh, 'c3_hall', 1.5, 6, 38.5, 7.2, null, { dash: true });                          // receipt paper down the aisle
      text(sh, ['c3_frame', 10, 12.3], 'WAI-1  WAI-2  WAI-3', 5.5);
    }
    return sh;
  }
  function MAP_exchangeB(sh) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    if (!R) poly(sh, null, [[-20, -0.4], [17, -0.4], [17, -8], [27, -8], [27, -0.4], [50, -0.4], [50, 17], [40, 17], [40, 22], [30, 22], [30, 14], [-20, 14]], null, { dash: true });
    if (!R) text(sh, [15, 7], 'ground floor above', 9, { italic: true });
    rect(sh, 'c3_stairs', 0, 0, 4, 9, null, { lw: 1.2 });
    stairs(sh, 'c3_stairs', 0.4, 0.3, 3.6, 6, 'y', R ? 'UP' : 'up');
    text(sh, ['c3_stairs', 2, 7.6], lab('landing'), 5.5);
    rect(sh, 'c3_fuse', 0, 0, 6, 5, R ? 'FUSES' : 'Fuse\nroom', { size: 7.5, lw: 1.2 });
    rect(sh, 'c3_fuse', 5.2, 1.2, 5.9, 3.8, null, { fill });
    rect(sh, 'c3_vault', 0, 0, 20, 10, R ? 'CABLE VAULT' : 'Cable\nvault', { size: 9, lw: 1.2 });
    for (const z of [2.5, 5, 7.5]) line(sh, [['c3_vault', 1, z], ['c3_vault', 18.5, z]], { dash: true });
    door(sh, 'c3_stairs', 4, 6.7, 90, 0.9); door(sh, 'c3_stairs', 0, 6.7, 90, 0.9, { flip: true });
    return sh;
  }

  // =================================================================================================================
  // CUSTOMER CARE CENTRE — FLOOR PLAN (reception counter, Ch 4); receipt: the maze, the west-wall route, the old store
  // =================================================================================================================
  function MAP_care(sh) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    const F = 'c4_floor';
    rect(sh, F, 0, 0, 50, 28, null, { lw: 1.3 });
    text(sh, [F, 25, 13], R ? 'OPEN PLAN' : 'Open plan', R ? 9 : 12, { spacing: 0.25 });
    const rows = [2.4, 5.4, 8.4, 11.4, 14.4, 17.4, 20.4, 23.4];
    rows.forEach((z, i) => {
      if (R && [1, 3, 5].includes(i)) return;                                                // gone in the Outage
      rect(sh, F, 1.5, z - 0.6, 17.7, z + 0.6, null, { fill: R && [2, 4, 6].includes(i) ? 'rgba(40,44,52,0.45)' : true });
      rect(sh, F, 32.3, z - 0.6, 48.5, z + 0.6, null, { fill });
    });
    text(sh, [F, 0.8, 18.9], R ? '' : 'row 6', 5, { align: 'left', italic: true });
    rect(sh, F, 1.6, 16.6, 4.6, 18.4, null, { lw: 1.4 });                                     // Chase's cubicle
    for (const [x, z, n] of [[21, 7.3, 1], [27, 7.3, 2], [21, 17.8, 3], [27, 17.8, 4]]) rect(sh, F, x - 1.6, z - 1.6, x + 1.6, z + 1.6, R ? null : 'team\n' + n, { size: 5.5 });
    rect(sh, F, 17, 0.1, 33, 0.8, null, { fill });                                           // the wallboard monitors
    text(sh, [F, 25, 1.9], lab('wallboards'), 5.5);
    rect(sh, 'c4_records', 0, 0, 10, 8, lab('Records'), { size: 8 });
    rect(sh, 'c4_break', 0, 0, 10, 8, R ? 'BREAK' : 'Break\nroom', { size: 8 });
    rect(sh, 'c4_secoffice', 0, 0, 5, 4, R ? 'OFFICE' : 'Security', { size: 6 });
    door(sh, F, 7.1, 0, 0, 0.95); door(sh, F, 50, 7.1, 90, 0.95); door(sh, F, 25.1, 28, 0, 1); door(sh, F, 0, 26.3, 90, 0.95, { flip: true });
    door(sh, 'c4_lobby', 20, 8.5, 90, 0.95);
    if (!R) {
      rect(sh, 'c4_lobby', 0, 0, 20, 12, null, {});
      text(sh, ['c4_lobby', 10, 4.5], 'Lobby', 11, { spacing: 0.2 });
      rect(sh, 'c4_lobby', 12.5, 3.5, 18.5, 5, 'reception', { size: 5.5, fill });
      for (const x of [7, 8.5, 10, 11.5]) line(sh, [['c4_lobby', x, 1.2], ['c4_lobby', x, 2.6]]);
      text(sh, ['c4_lobby', 5, 3.2], 'turnstiles', 5.5, { align: 'right' });
      door(sh, 'c4_lobby', 10.2, 12, 0, 1.9, { flip: true });
      poly(sh, null, [[0, -8], [10, -8], [10, 0], [50, 0], [50, 3.1], [60, 3.1], [60, 11.1], [50, 11.1], [50, 28], [40.1, 28], [40.1, 38.5], [35.1, 38.5], [35.1, 40], [15.1, 40], [15.1, 28], [0, 28]], null, { lw: 2.2 });
      rect(sh, 'c4_park', 3, 3.5, 53.2, 14.5, null, { dash: true });
      text(sh, ['c4_park', 9, 9], 'visitor parking', 6.5, { italic: true });
      text(sh, ['c4_park', 30, 11], 'Business Park', 8, { spacing: 0.25 });
      text(sh, [-2, -9.5], 'Visitors must report to reception. Staff only beyond the turnstiles.', 6.5, { align: 'left', italic: true });
    } else {
      // the lobby is Chase's old store now (8:50 pm, the shutter half down); the way there is along the west wall
      rect(sh, 'c4_oldstore', 0, 0, 20, 12, 'OLD STORE', { size: 8 });
      rect(sh, 'c4_oldstore', 5, 3.5, 15, 4.6, null, { fill });
      text(sh, ['c4_oldstore', 10, 10.8], '8:50 PM', 5.5);
      rect(sh, F, 17.7, 0, 18.3, 28, null, { fill: 'rgba(40,44,52,0.55)' });                  // the centre sealed
      poly(sh, null, [[-2.2, 25.5], [-2.2, 38], [15.1, 38], [15.1, 36], [-0.3, 36], [-0.3, 25.5]], 'WEST WALL', { dash: true, size: 5 });
      line(sh, [[F, 23.6, 28], [F, 26.6, 28]], { lw: 2.5 });
      text(sh, [F, 34, 29.8], 'HEADSETS', 5.5);
    }
    return sh;
  }

  // =================================================================================================================
  // REGIONAL OFFICE — BUILDING DIRECTORY (tower lobby, Ch 5): ground, Level 2 atrium floor, Level 4
  // =================================================================================================================
  function MAP_officeTower(sh, fl) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    const L = 'c5_level4';
    if (fl === 'G') {
      rect(sh, null, 0, 0, 40, 22.2, null, { lw: 2.2 });
      rect(sh, null, 0, 22.2, 40, 30, null, { dash: true });
      text(sh, [20, 27.8], 'canopy · levels above', 7, { italic: true });
      rect(sh, 'c5_lobby', 0, 0, 24, 16, null, { lw: 1.2 });
      text(sh, ['c5_lobby', 10, 10.5], 'Lobby', 12, { spacing: 0.2 });
      rect(sh, 'c5_lobby', 17.5, 10.5, 22.5, 11.8, 'security desk', { size: 5, fill });
      for (const x of [9.5, 11, 12.5, 14, 15.5, 17]) line(sh, [['c5_lobby', x, 6.8], ['c5_lobby', x, 8]]);
      text(sh, ['c5_lobby', 8.4, 7.4], 'gates', 5.5, { align: 'right' });
      rect(sh, 'c5_lobby', 9.8, 0, 12.2, 0.9, null, { fill }); rect(sh, 'c5_lobby', 13, 0, 15.4, 0.9, null, { fill });
      text(sh, ['c5_lobby', 12.6, 2.2], 'lifts', 5.5);
      text(sh, ['c5_lobby', 1.2, 9.6], 'directory', 5.5, { align: 'left', italic: true });
      ngon(sh, ['c5_lobby', 12, 16.4], 1.3, 10, null, {});
      text(sh, ['c5_lobby', 12, 18.6], 'revolving doors', 5.5);
      rect(sh, 'c5_stairs', 0, 0, 4.6, 6.6, null, { lw: 1.2 });
      stairs(sh, 'c5_stairs', 0.4, 0.4, 4.2, 5.2, 'y');
      text(sh, ['c5_stairs', 2.3, -1.4], 'Stairs A', 6);
      door(sh, 'c5_lobby', 21.9, 0, 0, 1, { flip: true });
      rect(sh, null, 0, 0, 15.6, 22.2, 'plant · mail', { size: 7, fill });
      rect(sh, 'c5_forecourt', 0, 1.2, 32, 22, null, { dash: true });
      text(sh, ['c5_forecourt', 16, 11], 'Forecourt', 9, { italic: true });
      text(sh, ['c5_forecourt', 16, 19.5], 'Ring Road', 7, { spacing: 0.25 });
      return sh;
    }
    if (fl === 'L2') {
      rect(sh, null, 0, 0, 40, 30, null, { lw: R ? 1 : 2.2, dash: true });
      rect(sh, 'c5_atrium', 13, 8, 27, 22, null, { lw: 1.4 });
      text(sh, ['c5_atrium', 20, 15], R ? 'ATRIUM\nFLOOR' : 'Atrium floor', R ? 8 : 11, { spacing: 0.2 });
      stairs(sh, 'c5_atrium', 13.1, 8, 15.2, 12, 'y', null);
      text(sh, ['c5_atrium', 14.2, 7.2], lab('feature stair'), 5.5);
      if (!R) text(sh, [20, 26], 'Level 2 — closed for the event', 8, { italic: true });
      else { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ngon(sh, ['c5_atrium', 20 + Math.cos(a) * 3.6, 15 + Math.sin(a) * 3.6], 0.5, 4, null, { fill }); } }
      return sh;
    }
    // Level 4
    rect(sh, L, 0, 0, 40, 30, null, { lw: R ? 1.2 : 2.2 });
    rect(sh, L, 13, 8, 27, 22, null, { dash: true });
    text(sh, [L, 20, 15], R ? 'VOID' : 'atrium void', 8, { italic: !R });
    rect(sh, L, 13.5, 8.1, 26.5, 8.7, null, { fill });
    text(sh, [L, 20, 9.8], lab('leaderboard'), 5.5);
    stairs(sh, L, 13.1, 8.3, 15.2, 11.6, 'y');
    text(sh, [L, 11.7, 11.2], lab('feature\nstair'), 5, { align: 'right' });
    rect(sh, 'c6_escalations', 0, 0, 6, 5, R ? 'ESCAL.' : 'Escalations', { size: 6, lw: 1.2 });
    rect(sh, L, 29.2, 0, 35.2, 6.2, lab('Kitchen'), { size: 6.5 });
    rect(sh, L, 29.2, 8, 36, 13, lab('Harbour'), { size: 6 });
    rect(sh, L, 36, 8, 40, 16, null, { fill });
    rect(sh, L, 29.2, 16, 36, 21, lab('Summit'), { size: 6 });
    rect(sh, L, 29.2, 21, 36, 25, lab('Excellence'), { size: 5.5 });
    rect(sh, L, 36, 16, 40, 25, null, { fill });
    rect(sh, 'c5_print', 0, 0, 5.4, 4.2, lab('Print'), { size: 6.5 });
    rect(sh, 'c5_stairs', 0, 0, 4.6, 6.6, null, {});
    stairs(sh, 'c5_stairs', 0.4, 0.4, 4.2, 5.2, 'y');
    text(sh, ['c5_stairs', 2.3, -1.2], lab('Stairs A'), 5.5);
    rect(sh, L, 16.5, 0, 20.5, 2, null, { fill }); rect(sh, L, 21.5, 0, 25.5, 2, null, { fill });
    text(sh, [L, 21, 3.2], lab('lifts'), 5.5);
    rect(sh, null, -6, 24, 0, 30, null, { lw: 1 });
    stairs(sh, null, -5.5, 24.6, -0.5, 29.4, 'x');
    text(sh, [-3, 23], lab('fire stairs B'), 5.5);
    for (const [x, z] of [[4, 9], [4, 13.5], [9, 9], [9, 13.5], [9, 18], [4, 22], [9, 22]]) rect(sh, L, x - 1.6, z - 0.9, x + 1.6, z + 0.9, null, { fill });
    text(sh, [L, 6.5, 26.5], lab('open plan'), R ? 6 : 8, { italic: !R });
    door(sh, L, 3, 5, 0, 0.95, { flip: true }); door(sh, L, 37.5, 6.2, 0, 1, { flip: true });
    door(sh, L, 29.2, 10.6, 90, 0.9, { flip: true }); door(sh, L, 29.2, 18.2, 90, 0.9, { flip: true }); door(sh, L, 29.2, 22.8, 90, 0.9, { flip: true });
    door(sh, L, 32, 27.5, 90, 0.9, { flip: true }); door(sh, L, 0, 27.4, 90, 1, { flip: true });
    if (R) {
      rect(sh, L, 35.6, 6.2, 39.9, 7.3, null, { fill: 'rgba(40,44,52,0.55)' });            // contracts across Stairs A
      text(sh, [L, 34, 7.8], 'PAPER', 5, { align: 'right' });
    }
    return sh;
  }
  // FIRE STAIRS PLAN, LEVELS 5 AND 6 (taped to the Level 5 stair door, Ch 6)
  function MAP_officeUpper(sh, fl) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    const Lr = fl === 'L5' ? 'c6_level5' : 'c6_level6';
    rect(sh, Lr, 0, 0, 32, 24, null, { lw: R ? 1.2 : 2.2 });
    rect(sh, Lr, 4, 4, 20, fl === 'L5' ? 20 : 16, null, { fill: R ? undefined : true });
    text(sh, [Lr, 12, 10], fl === 'L5' ? (R ? 'SHEETED BAYS' : 'sheeted bays\nrefurbishment') : (R ? 'BAYS' : 'fit-out in progress'), 7, { italic: !R });
    rect(sh, Lr, 20, 4, 28, 15, null, { lw: 1.2 });
    text(sh, [Lr, 24, 7], lab('core'), 6.5);
    text(sh, [Lr, 16, 2.2], lab('loop corridor'), 5.5, { italic: !R });
    rect(sh, null, -1, 24, 4.85, 29.8, null, { lw: 1 });
    stairs(sh, null, -0.6, 24.4, 4.4, 29.4, 'x');
    text(sh, [2, 31], lab('fire stairs B'), 5.5);
    door(sh, Lr, 2, 24, 0, 0.9);
    if (fl === 'L5') {
      rect(sh, Lr, 27.6, 8.6, 28.3, 9.8, null, { fill });
      text(sh, [Lr, 29, 11.2], lab('temp\npower'), 5, { align: 'left' });
      door(sh, Lr, 17, 24, 0, 0.9); door(sh, Lr, 28, 17, 90, 0.85); door(sh, Lr, 28, 6, 90, 0.85);
      text(sh, [Lr, 17, 22.6], lab('plant'), 5); text(sh, [Lr, 30, 17], lab('WC'), 5); text(sh, [Lr, 30, 6], lab('riser'), 5);
      text(sh, [Lr, 22.5, 16.4], lab('lifts'), 5);
      if (!R) text(sh, [14, 28], 'Level 5 — keep clear of sheeted areas. Hard hats beyond this point.', 6.5, { italic: true, align: 'left' });
    } else {
      rect(sh, 'c6_lukaoffice', 0, 0, 7, 5.5, R ? 'STORE 0412' : "back office", { size: 6 });
      rect(sh, Lr, 13, 20, 20, 24, lab('site office'), { size: 5.5 });
      door(sh, Lr, 9, 20, 0, 0.95); door(sh, Lr, 15, 20, 0, 0.9);
      rect(sh, Lr, 21.1, 14.6, 22.9, 15, null, { fill }); rect(sh, Lr, 25.1, 14.6, 26.9, 15, null, { fill });
      text(sh, [Lr, 22, 16.2], lab('lift A'), 5); text(sh, [Lr, 26, 16.2], lab('lift B'), 5);
      text(sh, [Lr, 24, 20], lab('lift lobby'), 6, { italic: !R });
      rect(sh, 'c6_shaft', -1.5, -1.5, 1.5, 1.5, null, { dash: true });
      if (R) text(sh, ['c6_shaft', 0, 0], 'DOWN', 5);
      if (!R) text(sh, [14, 28], 'Level 6 — lift lobby, site office. Stair B to Levels 4 and 5.', 6.5, { italic: true, align: 'left' });
    }
    return sh;
  }

  // =================================================================================================================
  // DISTRICT HOSPITAL — VISITOR DIRECTORY (reception, Ch 7): the ground floor corridors and Ward 3
  // =================================================================================================================
  function MAP_hospital(sh) {
    rect(sh, 'c7_reception', 0, 0, 16, 12, null, { lw: 1.2 });
    text(sh, ['c7_reception', 8, 7.5], 'Reception', 10, { spacing: 0.2 });
    rect(sh, 'c7_reception', 5, 3.5, 11, 4.6, null, { fill });
    rect(sh, 'c7_waiting', 0, 0, 12, 10, 'Waiting\nroom', { size: 8 });
    rect(sh, 'c7_tearoom', 0, 0, 6, 5, 'staff', { size: 6 });
    // the U corridor: east, north, west
    const Cr = 'c7_corridor';
    poly(sh, Cr, [[0, 0], [22, 0], [22, -18], [0, -18], [0, -22], [26, -22], [26, 4], [0, 4]], null, { lw: 1.2 });
    text(sh, [Cr, 11, 2.1], 'corridor', 6.5, { italic: true });
    text(sh, [Cr, 24, -9], 'corridor', 6.5, { italic: true, rot: -90 });
    text(sh, [Cr, 11, -19.9], 'corridor', 6.5, { italic: true });
    rect(sh, Cr, 7, 4, 13, 10, 'X-ray', { size: 5.5 });
    rect(sh, Cr, 14, -7, 22, 0, 'outpatients', { size: 5.5 });
    rect(sh, Cr, 26, -17, 32, -5, 'day\nsurgery', { size: 5.5 });
    rect(sh, Cr, 13, 4, 26, 10, null, { fill }); rect(sh, Cr, 0, -18, 14, -7, null, { fill });
    rect(sh, 'c7_nurses', 0, -0.7, 8, 6, "Nurses'\nstation", { size: 6 });
    rect(sh, 'c7_ward3', 0, -30, 3, 0, null, { lw: 1.2 });
    text(sh, ['c7_ward3', 1.5, -15], 'Ward 3 — Orthopaedics', 6.5, { rot: -90 });
    const rooms = [[1, -3.5], [3, -8.5], [5, -13.5], [7, -18.5], [9, -23.5], [11, -27.2]];
    for (const [n, z] of rooms) { rect(sh, 'c7_ward3', -4, z - 2.4, 0, z + 2.4, String(n), { size: 5.5 }); door(sh, 'c7_ward3', 0, z, 90, 0.95, { flip: true }); }
    for (const [n, z] of [[2, -5.5], [4, -10.5], [6, -15.5], [8, -20.5], [10, -25]]) { rect(sh, 'c7_ward3', 3, z - 2.4, 7, z + 2.4, String(n), { size: 5.5 }); door(sh, 'c7_ward3', 3, z, 90, 0.95, { flip: true }); }
    rect(sh, 'c7_room12', 0, 0, 6, 4, '12', { size: 7, lw: 1.3 });
    door(sh, 'c7_room12', 1.2, 4, 0, 1);
    door(sh, 'c7_reception', 8, 12, 0, 2.2, { flip: true }); door(sh, 'c7_reception', 0, 7.2, 90, 1.2, { flip: true });
    door(sh, 'c7_reception', 3, 0, 0, 0.95, { flip: true }); door(sh, 'c7_reception', 16, 5, 90, 1.2, { flip: true });
    door(sh, 'c7_nurses', 8, 3.5, 90, 1.2);
    // outside: the car park, the multi-storey, the summit gate
    rect(sh, 'c7_carpark', 0, 0, 40, 30, null, { dash: true });
    text(sh, ['c7_carpark', 20, 17], 'Car park', 11, { spacing: 0.2 });
    rect(sh, 'c7_carpark', -18, 0, 0, 30, 'Multi-\nstorey', { size: 7, fill });
    road(sh, [['c7_carpark', 40.3, 4.5], ['c7_carpark', 56, 4.5]], 5.5);
    line(sh, [['c7_carpark', 40.1, 1.8], ['c7_carpark', 40.1, 7.2]], { lw: 2.2 });
    text(sh, ['c7_carpark', 47, 10.5], 'Summit Road\n(no public access)', 5.5);
    text(sh, ['c7_carpark', 8, 33], 'Ring Road', 7, { spacing: 0.25 });
    poly(sh, null, [[-12, 2.2], [-1.5, 2.2], [-1.5, -5], [8, -5], [8, -21.2], [7, -21.2], [7, -55], [18, -55], [18, -21.2], [16, -21.2], [16, -19], [48, -19], [48, 13], [16, 13], [16, 12], [-12, 12.2]], null, { lw: 2.2 });
    text(sh, [-31, -52], 'Visiting hours 10 am – 8 pm.\nPlease sign the visitor book.', 6.5, { italic: true, align: 'left' });
    return sh;
  }

  // =================================================================================================================
  // MAST COMPOUND — SITE DIAGRAM (cable-tied to the gate, Ch 8): the compound, huts, ladder and platforms
  // =================================================================================================================
  function MAP_mast(sh) {
    const R = sh.receipt;
    const lab = (s) => (R ? s.toUpperCase() : s);
    const Cp = 'c8_compound', Ms = 'c8_mast';
    rect(sh, Cp, 0, 0, 30, 20, null, { dash: true, lw: 1.3 });
    text(sh, [Cp, 3, 1.6], lab('chain-link fence'), 5.5, { align: 'left', italic: !R });
    rect(sh, Cp, 9, 0.3, 20.5, 10.5, null, { dash: true });
    rect(sh, Cp, 3, 3, 8, 7.5, R ? 'HUT' : 'hut\n(west)', { size: 6, fill });
    rect(sh, Cp, 22, 5, 27, 9.5, R ? 'HUT' : 'hut\n(east)', { size: 6, fill });
    door(sh, Cp, 22, 7.25, 90, 0.95);
    line(sh, [[Cp, 13, 20], [Cp, 14.9, 18.6]], { lw: 1.6 }); line(sh, [[Cp, 17, 20], [Cp, 15.1, 18.6]], { lw: 1.6 });
    text(sh, [Cp, 15, 22], lab('gate'), 6.5);
    rect(sh, Cp, 8, 20, 22, 34.2, null, { dash: true });
    text(sh, [Cp, 15, 31.5], R ? 'SUMMIT RD' : 'to Summit Road', 6, { italic: !R });
    rect(sh, Cp, 10.1, 19.85, 10.7, 20.3, null, { fill });                                    // the emergency phone
    text(sh, [Cp, 10.4, 23.3], lab('phone'), 5);
    ngon(sh, [Cp, 8.8, 14.2], 0.45, 6, null, { fill });
    text(sh, [Cp, 8.8, 15.8], lab('floodlight'), 5);
    // the mast in plan: the lattice legs, the ladder runs, the three platforms (staggered, never over one another)
    rect(sh, Ms, -1.5, -1.5, 1.5, 1.5, null, { lw: 1.3 });
    line(sh, [[Ms, -1.5, -1.5], [Ms, 1.5, 1.5]]); line(sh, [[Ms, 1.5, -1.5], [Ms, -1.5, 1.5]]);
    rect(sh, Ms, 1.5, -1, 5.5, 2.85, R ? 'P1' : 'P1\n20 m', { size: 5.5 });
    rect(sh, Ms, -1, -5.5, 3, -1.6, R ? 'P2' : 'P2 40 m', { size: 5.5 });
    rect(sh, Ms, -5.5, -2.6, -1.05, 1.4, R ? 'P3' : 'P3\n56 m', { size: 5.5 });
    text(sh, [Ms, 0, 7.2], lab('mast base'), 6);
    line(sh, [[Ms, 0.6, 1.75], [Ms, 1.4, 1.75]], { lw: 2.4 });                                  // ladder L1 (south face)
    if (!R) text(sh, [Cp, 15, -6.8], 'Lattice mast, 60 m · ladder cage on the south face', 6, { italic: true });
    // the inset: the mast head at 56 m, twice size — P3 and the transmitter hut beside it
    const H = '@head';
    if (!R) rect(sh, null, 30.5, -6.5, 56.5, 11.5, null, { lw: 0.8 });
    text(sh, R ? [H, 0, -6] : [43.5, -5], lab('mast head — 56 m'), 6.5, { italic: !R });
    rect(sh, H, -5.5, -2.6, -1.05, 1.4, 'P3', { size: 6 });
    rect(sh, H, -1, -3.6, 5, 2.4, null, { lw: 1.4 });
    text(sh, [H, 2, 1.3], lab('transmitter hut'), 5.5);
    door(sh, H, -1, -0.6, 90, 0.95, { flip: true });
    line(sh, [[H, -1.2, -1.75], [H, -1.2, -0.9]], { lw: 2 });
    if (!R) {
      // the elevation: the lattice from the ground to the aircraft light; platforms and the ladder cage
      const gx = 64.5, gz = 32, s = 0.6, zy = (h) => gz - h * s;
      text(sh, [gx, 36.2], 'elevation', 6.5, { italic: true });
      line(sh, [[gx - 4.5, gz], [gx - 0.7, zy(56)]], { lw: 1.2 }); line(sh, [[gx + 4.5, gz], [gx + 0.7, zy(56)]], { lw: 1.2 });
      for (let h = 0; h < 56; h += 7) {
        const a = 4.5 - (3.8 * h) / 56, b = 4.5 - (3.8 * (h + 7)) / 56;
        line(sh, [[gx - a, zy(h)], [gx + b, zy(h + 7)]]); line(sh, [[gx + a, zy(h)], [gx - b, zy(h + 7)]]);
      }
      for (const [h, n] of [[20, 'P1 · 20 m'], [40, 'P2 · 40 m'], [56, 'P3 · 56 m']]) {
        const w = 4.5 - (3.8 * h) / 56 + 2.2;
        line(sh, [[gx - w, zy(h)], [gx + w, zy(h)]], { lw: 1.8 });
        text(sh, [gx + w + 0.8, zy(h)], n, 5.5, { align: 'left' });
      }
      rect(sh, null, gx - 2, zy(60), gx + 2, zy(56), null, { fill });
      text(sh, [gx + 2.8, zy(58.5)], 'hut', 5.5, { align: 'left' });
      line(sh, [[gx, zy(60)], [gx, zy(63)]]);
      text(sh, [gx + 1.5, zy(62.6)], 'red light', 5, { italic: true, align: 'left' });
      line(sh, [[gx - 1.2, gz], [gx - 1.2, zy(56)]], { dash: true });
      text(sh, [gx - 2, zy(10)], 'ladder\ncage', 5, { align: 'right' });
      line(sh, [[gx - 7, gz], [gx + 7, gz]], { lw: 1.4 });
      text(sh, [gx, gz + 2], 'ground', 5.5);
      text(sh, [-2, 35.5], 'DANGER — RF RADIATION. Authorised personnel only. Climb with a harness. Report faults to the exchange.', 6.2, { align: 'left' });
      const notes = ['Climbing route', 'L1 — south face, ground to P1 (20 m)', 'L2 — east face, P1 to P2 (40 m)', 'L3 — north face, P2 to P3 (56 m)', 'Transmitter hut on the mast head, door facing P3.', 'Aircraft warning light: check monthly.'];
      notes.forEach((t, i) => text(sh, [33, 16 + i * 2.6], t, i ? 6 : 7.5, { align: 'left', italic: !i, spacing: i ? 0.1 : 0.2 }));
    }
    return sh;
  }

  // =================================================================================================================
  // Build every sheet
  // =================================================================================================================
  MAP_town();
  MAP_plaza(sheet('plaza', 'G'));
  MAP_village(sheet('village', 'G'));
  MAP_exchangeG(sheet('exchange', 'G')); MAP_exchangeB(sheet('exchange', 'B'));
  MAP_care(sheet('care', 'G'));
  for (const f of ['G', 'L2', 'L4']) MAP_officeTower(sheet('office', f), f);
  for (const f of ['L5', 'L6']) MAP_officeUpper(sheet('office_upper', f), f);
  MAP_hospital(sheet('hospital', 'G'));
  MAP_mast(sheet('mast', 'G'));
  // receipts: frames fitted to their placements (rotated), then the same drawings in thermal print
  frameAuto('rmap_plaza', [[-60, -12], [30, 95]]);
  frameAuto('rmap_village', [[-20, -40], [74, 68]], 400, 760);
  frameAuto('rmap_exchange', [], 380, 820);
  frameAuto('rmap_care', [[-40, -4], [12, 62]]);
  frameAuto('rmap_office', [[-31, -7], [-24, 42]], 400, 760);
  frameAuto('rmap_mast', [[-1, -110], [72, 13]], 390, 820);
  MAP_plaza(sheet('rmap_plaza', 'G'));
  MAP_village(sheet('rmap_village', 'G'));
  MAP_exchangeG(sheet('rmap_exchange', 'G')); MAP_exchangeB(sheet('rmap_exchange', 'B'));
  MAP_care(sheet('rmap_care', 'G'));
  for (const f of ['L2', 'L4']) MAP_officeTower(sheet('rmap_office', f), f);
  for (const f of ['L5', 'L6']) MAP_officeUpper(sheet('rmap_office', f), f);
  {
    // the Mast receipt: Summit Road's hairpins climbing to the compound
    const sh = sheet('rmap_mast', 'G');
    road(sh, [['c8_summit', 40, 12], ['c8_summit', 40, 0], ['c8_summit', 4, 0], ['c8_summit', 4, -14], ['c8_summit', 40, -14], ['c8_summit', 40, -28], ['c8_summit', 4, -28], ['c8_summit', 4, -42], ['c8_summit', 37, -42], ['c8_summit', 37, -60]], 7.5);
    text(sh, ['c8_summit', 22, -7], 'SUMMIT RD', 6.5);
    text(sh, ['c8_summit', 40, 15.5], 'HOSPITAL', 6);
    text(sh, ['c8_summit', 22, -35], 'BENCH', 5);
    for (const [x, z] of [[14, 5.5], [26, -8.5], [18, -19.5], [30, -22.5], [16, -33.5], [22, -47.5]]) ngon(sh, ['c8_summit', x, z], 0.7, 5, null, {});
    text(sh, ['c8_summit', 22, 7.5], 'THEY SIT AND WATCH', 5);
    MAP_mast(sh);
  }

  // =================================================================================================================
  // Marks: Aidan's red marker (teal on the receipts). when(S) decides; positions come from the placements.
  // =================================================================================================================
  const MARKS = {};
  function mark(map, floor, id, t, p, when, o = {}) {
    const sh = SHEETS[map + '|' + floor];
    if (!sh) return;
    const [x, y] = P(sh, p);
    (MARKS[map] = MARKS[map] || []).push({ id: 'm:' + id, floor, t, x, y, when, ...o });
  }
  // ---- the town ----
  mark('town', 'G', 't0-town', 'circle', ['c1_relay', 7, -4], (s) => ch(s) === 0, { r: 22, text: 'into town' });
  mark('town', 'G', 't0-car', 'note', ['p2_lookout', 16, -22], (s) => ch(s) >= 1 || fl(s, 'p0_carDead'), { text: 'car — dead', textSize: 12 });
  mark('town', 'G', 't1-plaza', 'circle', [221, -137], (s) => ch(s) === 1 && !fl(s, 'c1_address'), { r: 34, text: 'store — her address' });
  mark('town', 'G', 't1-plaza-ok', 'tick', [221, -137], (s) => fl(s, 'c1_address'));
  mark('town', 'G', 't1-addr', 'note', ['c1_relay', 30, -186], (s) => ch(s) <= 1 && !fl(s, 'c1_address') && mk(s, 'auto:blk:c1_relay:c1_relay:hilltop'), { text: 'address?', textSize: 13 });
  mark('town', 'G', 't1-wai', 'circle', ['@exchange', 15, 6], (s) => fl(s, 'c1_wai') && !fl(s, 'c3_metWai') && ch(s) <= 3, { r: 44, text: 'Wai' });
  mark('town', 'G', 't3-wai-ok', 'tick', ['@exchange', 15, 6], (s) => fl(s, 'c3_bossDone'));
  mark('town', 'G', 't3-care', 'circle', ['@care', 25, 16], (s) => ch(s) >= 3 && ch(s) <= 4 && fl(s, 'c3_bossDone') && !fl(s, 'c4_logs'), { r: 42, text: 'call logs' });
  mark('town', 'G', 't4-care-ok', 'tick', ['@care', 25, 16], (s) => !!(s.flags && s.flags.c4_logs));
  mark('town', 'G', 't4-gatekey', 'note', ['c4_park', 50, 30.5], (s) => ch(s) === 4 && fl(s, 'c4_done') && !has(s, 'gate_key') && !dn(s, 'c4:gateOpen'), { text: 'key → security office', textSize: 12 });
  mark('town', 'G', 't4-office', 'circle', ['@office', 20, 11], (s) => (fl(s, 'c4_done') || ch(s) >= 5) && !fl(s, 'c6_file') && ch(s) <= 6, { r: 36, text: 'Level 4 — escalations' });
  mark('town', 'G', 't6-office-ok', 'tick', ['@office', 20, 11], (s) => fl(s, 'c6_done'));
  mark('town', 'G', 't6-road', 'note', ['c5_ringroad', 70, 9], (s) => fl(s, 'c6_done') && ch(s) <= 7, { text: "wasn't there before", textSize: 11 });
  mark('town', 'G', 't6-hospital', 'circle', ['@hospital', 16, -10], (s) => ch(s) >= 6 && ch(s) <= 7 && fl(s, 'c6_done') && !fl(s, 'c7_room12'), { r: 42, text: 'the hospital' });
  mark('town', 'G', 't7-room12-ok', 'tick', ['@hospital', 16, -10], (s) => fl(s, 'c7_room12'));
  mark('town', 'G', 't7-chain', 'x', ['c7_carpark', 44, 4.5], (s) => ch(s) === 7 && fl(s, 'c7_arrived') && !fl(s, 'c7_room12'), { text: 'chained' });
  mark('town', 'G', 't7-chain-ok', 'tick', ['c7_carpark', 44, 4.5], (s) => fl(s, 'c7_room12'));
  mark('town', 'G', 't7-mast', 'circle', ['c8_compound', 15, 8], (s) => ch(s) >= 7 && fl(s, 'c7_room12') && !fl(s, 'c8_top'), { r: 34, text: 'the mast' });
  // ---- the Plaza ----
  mark('plaza', 'G', 'p1-store', 'circle', ['c1_store', 10, 8], (s) => ch(s) === 1 && !dn(s, 'cs:1-1') && !fl(s, 'c1_address'), { r: 62, text: 'store' });
  mark('plaza', 'G', 'p1-term', 'circle', ['c1_backoffice', 3, 2.5], (s) => ch(s) === 1 && dn(s, 'cs:1-1') && !fl(s, 'c1_address'), { r: 30, text: 'terminal' });
  mark('plaza', 'G', 'p1-pin', 'note', ['c1_backoffice', 7.5, 7], (s) => ch(s) === 1 && dn(s, 'c1:termFirst') && !fl(s, 'c1_pinKnown') && !fl(s, 'c1_address'), { text: 'PIN?', textSize: 16 });
  mark('plaza', 'G', 'p1-pin2', 'note', ['c1_backoffice', 7.5, 7], (s) => ch(s) === 1 && fl(s, 'c1_pinKnown') && !fl(s, 'c1_address'), { text: lvlText({ easy: 'PIN = induction date, DDMM', normal: 'PIN: 14 March', hard: 'PIN: 14 March — day first' }), textSize: 13 });
  mark('plaza', 'G', 'p1-term-ok', 'tick', ['c1_backoffice', 3, 2.5], (s) => fl(s, 'c1_address'));
  mark('plaza', 'G', 'p1-staffkey', 'note', ['c1_staffroom', -1, 8.4], (s) => ch(s) === 1 && mk(s, 'auto:door:c1_corridor:staff') && !dn(s, 'unlocked:c1_corridor:staff') && !has(s, 'staff_key'), { text: 'key → security office', textSize: 12, rot: -2 });
  mark('plaza', 'G', 'p1-cert', 'circle', ['c1_staffroom', 4, 3], (s) => ch(s) === 1 && dn(s, 'c1:termFirst') && !fl(s, 'c1_pinKnown') && (has(s, 'staff_key') || dn(s, 'unlocked:c1_corridor:staff')), { r: 26, text: 'my first day?' });
  mark('plaza', 'G', 'p1-phone', 'circle', ['c1_foodcourt', 1.5, 13.2], (s) => ch(s) === 1 && fl(s, 'c1_address') && !fl(s, 'c1_wai'), { r: 22, text: 'ringing' });
  mark('plaza', 'G', 'p1-done', 'tick', ['c1_stockroom', 6, 5], (s) => fl(s, 'c1_bossDone'));
  // the Outage plaza (receipt)
  mark('rmap_plaza', 'G', 'rp-kitchen', 'circle', ['c1_foodcourt', 27.6, 0.8], (s) => ch(s) === 1 && fl(s, 'c1_wai') && !fl(s, 'c1_bossDone') && !dn(s, 'c1:kitchenIn'), { r: 18, text: 'another way?' });
  mark('rmap_plaza', 'G', 'rp-wall', 'x', ['c1_concourse', 42.2, 5.5], (s) => ch(s) === 1 && fl(s, 'c1_wai') && !fl(s, 'c1_bossDone'));
  mark('rmap_plaza', 'G', 'rp-stock', 'circle', ['c1_stockroom', 6, 5], (s) => ch(s) === 1 && fl(s, 'c1_wai') && !fl(s, 'c1_bossDone'), { r: 26, text: 'stockroom' });
  mark('rmap_plaza', 'G', 'rp-done', 'tick', ['c1_stockroom', 6, 5], (s) => fl(s, 'c1_bossDone'));
  // ---- the village ----
  mark('village', 'G', 'v2-office', 'circle', ['c2_office', 5.3, 3], (s) => ch(s) === 2 && !dn(s, 'c2:book'), { r: 36, text: 'sign in' });
  mark('village', 'G', 'v2-office-ok', 'tick', ['c2_office', 5.3, 3], (s) => dn(s, 'c2:book'));
  mark('village', 'G', 'v2-lockbox', 'note', ['c2_crescent', 10.8, 0.8], (s) => ch(s) === 2 && !dn(s, 'c2:lockbox') && read(s, 'lockbox_note', 'lockbox_note_hard') && lvl(s) !== 'easy', { text: 'lockbox = birth year?', textSize: 12 });
  mark('village', 'G', 'v2-lockbox-e', 'note', ['c2_crescent', 10.8, 0.8], (s) => ch(s) === 2 && !dn(s, 'c2:lockbox') && read(s, 'lockbox_note_easy'), { text: 'lockbox = 1947', textSize: 13 });
  mark('village', 'G', 'v2-card', 'note', ['c2_office', -1, 9.5], (s) => ch(s) === 2 && !dn(s, 'c2:lockbox') && read(s, 'birthday_card') && lvl(s) === 'normal', { text: '79 this year', textSize: 12 });
  mark('village', 'G', 'v2-card-h', 'note', ['c2_office', -1, 9.5], (s) => ch(s) === 2 && !dn(s, 'c2:lockbox') && read(s, 'birthday_card_hard'), { text: 'born = depot year?', textSize: 12 });
  mark('village', 'G', 'v2-run', 'circle', ['c2_crescent', 58, -8], (s) => ch(s) === 2 && ((s.flags && s.flags.c2_chase) | 0) === 1, { r: 26, text: 'the lane!' });
  mark('rmap_village', 'G', 'rv-nine', 'circle', ['c2_unit9', 5, 4], (s) => ch(s) === 2 && fl(s, 'c2_loop') && !fl(s, 'c2_loopBroken'), { r: 30, text: 'hers' });
  mark('rmap_village', 'G', 'rv-red', 'circle', ['c2_kitchen_out', 10, 10], (s) => ch(s) === 2 && fl(s, 'c2_loop') && !fl(s, 'c2_loopBroken') && dn(s, 'c2:kitchenout') && !has(s, 'alarm_pendant'), { r: 22, text: 'something red' });
  mark('rmap_village', 'G', 'rv-loop', 'note', ['c2_crescent', -13, 32], (s) => ch(s) === 2 && fl(s, 'c2_loop') && !fl(s, 'c2_loopBroken') && ((s.flags && s.flags.c2_loopN) | 0) >= 1, { text: 'loops back', textSize: 12, rot: -90 });
  mark('rmap_village', 'G', 'rv-out', 'circle', ['c2_crescent', 4, -12], (s) => fl(s, 'c2_loopBroken') && ch(s) === 2, { r: 22, text: 'out' });
  mark('rmap_village', 'G', 'rv-ok', 'tick', ['c2_unit9', 5, 4], (s) => fl(s, 'c2_loopBroken'));
  // ---- the exchange ----
  mark('exchange', 'G', 'x3-wai', 'circle', ['c3_hall', 3, 6.6], (s) => ch(s) === 3 && !fl(s, 'c3_metWai'), { r: 30, text: 'Wai' });
  mark('exchange', 'G', 'x3-nopower', 'note', ['c3_hall', 2.5, 9.5], (s) => ch(s) === 3 && dn(s, 'c3:frameLocked') && !fl(s, 'c3_fused'), { text: 'maglock — no power', textSize: 11 });
  mark('exchange', 'G', 'x3-frame', 'circle', ['c3_frame', 10, 7], (s) => ch(s) === 3 && fl(s, 'c3_fused') && !fl(s, 'c3_bossDone'), { r: 50, text: 'frame room' });
  mark('exchange', 'G', 'x3-frame-ok', 'tick', ['c3_frame', 10, 7], (s) => fl(s, 'c3_bossDone'));
  mark('exchange', 'B', 'x3-fuse', 'circle', ['c3_fuse', 3, 2.5], (s) => ch(s) === 3 && (fl(s, 'c3_metWai') || dn(s, 'c3:waiStairs')) && !fl(s, 'c3_fused'), { r: 30 });
  mark('exchange', 'B', 'x3-fusenote', 'note', ['c3_fuse', 7.5, -3], (s) => ch(s) === 3 && !fl(s, 'c3_fused') && read(s, 'fuse_note', 'fuse_note_easy', 'fuse_note_hard'), { text: lvlText({ easy: 'fuses: the chalk ticks', normal: 'fuses: only 10 A', hard: 'fuses: only 2,400 W' }), textSize: 13 });
  mark('exchange', 'B', 'x3-fuse-ok', 'tick', ['c3_fuse', 3, 2.5], (s) => fl(s, 'c3_fused'));
  mark('rmap_exchange', 'G', 'rx-frame', 'circle', ['c3_frame', 10, 7], (s) => ch(s) === 3 && out(s) && !fl(s, 'c3_bossDone'), { r: 40, text: 'Wai' });
  mark('rmap_exchange', 'G', 'rx-ok', 'tick', ['c3_frame', 10, 7], (s) => fl(s, 'c3_bossDone'));
  // ---- the call centre ----
  mark('care', 'G', 'c4-chase', 'circle', ['c4_floor', 3.1, 17.5], (s) => ch(s) === 4 && !fl(s, 'c4_metChase'), { r: 30, text: 'Chase?' });
  mark('care', 'G', 'c4-clicks', 'circle', ['c4_floor', 21, 17.8], (s) => ch(s) === 4 && fl(s, 'c4_metChase') && !fl(s, 'c4_clicks') && !dn(s, 'unlocked:c4_floor:records'), { r: 26, text: 'ringing' });
  mark('care', 'G', 'c4-code', 'note', ['c4_records', 11, 10.3], (s) => ch(s) === 4 && fl(s, 'c4_clicks') && !dn(s, 'unlocked:c4_floor:records'), { text: 'Records: 2231?', textSize: 13 });
  mark('care', 'G', 'c4-logs', 'circle', ['c4_records', 5, 4], (s) => ch(s) === 4 && fl(s, 'c4_metChase') && !(s.flags && s.flags.c4_logs), { r: 36, text: 'call logs' });
  mark('care', 'G', 'c4-logs-ok', 'tick', ['c4_records', 5, 4], (s) => !!(s.flags && s.flags.c4_logs));
  mark('care', 'G', 'c4-safe', 'circle', ['c4_secoffice', 2.5, 2], (s) => ch(s) === 4 && fl(s, 'c4_bossDone') && !fl(s, 'c4_done'), { r: 24, text: 'safe room' });
  mark('care', 'G', 'c4-key', 'note', ['c4_secoffice', 6, 1], (s) => ch(s) === 4 && fl(s, 'c4_done') && !has(s, 'gate_key') && !dn(s, 'c4:gateOpen'), { text: 'gate key', textSize: 12 });
  mark('care', 'G', 'c4-safe-ok', 'tick', ['c4_secoffice', 2.5, 2], (s) => fl(s, 'c4_done'));
  mark('rmap_care', 'G', 'rc-west', 'circle', ['c4_floor', 0.5, 26.3], (s) => ch(s) === 4 && fl(s, 'c4_outage') && !fl(s, 'c4_bossDone'), { r: 20, text: 'west wall' });
  mark('rmap_care', 'G', 'rc-lobby', 'x', ['c4_floor', 25.1, 27.5], (s) => ch(s) === 4 && fl(s, 'c4_outage') && !fl(s, 'c4_bossDone'));
  mark('rmap_care', 'G', 'rc-chase', 'circle', ['c4_oldstore', 10, 6], (s) => ch(s) === 4 && fl(s, 'c4_outage') && !fl(s, 'c4_bossDone'), { r: 34, text: 'Chase' });
  mark('rmap_care', 'G', 'rc-ok', 'tick', ['c4_oldstore', 10, 6], (s) => fl(s, 'c4_bossDone'));
  // ---- the Regional Office ----
  mark('office', 'G', 'o5-pass', 'note', ['c5_lobby', 16, 8.9], (s) => ch(s) === 5 && !fl(s, 'c5_pass') && !fl(s, 'c5_l4'), { text: 'visitor pass?', textSize: 12 });
  mark('office', 'G', 'o5-stairs', 'circle', ['c5_stairs', 2.3, 3.3], (s) => ch(s) === 5 && fl(s, 'c5_pass') && !fl(s, 'c5_l4'), { r: 30, text: 'Stairs A' });
  mark('office', 'L4', 'o5-esc', 'circle', ['c6_escalations', 3, 2.5], (s) => (ch(s) === 5 || ch(s) === 6) && !fl(s, 'c6_file'), { r: 36, text: 'Level 4 — escalations' });
  mark('office', 'L4', 'o5-card', 'note', ['c5_level4', 7, 7.8], (s) => ch(s) >= 5 && ch(s) <= 6 && mk(s, 'auto:door:c5_level4:escalations') && !has(s, 'keycard') && !dn(s, 'unlocked:c5_level4:escalations'), { text: 'card lock — keycard?', textSize: 11 });
  mark('office', 'L4', 'o5-atrium', 'circle', ['c5_level4', 14.2, 10], (s) => ch(s) === 5 && fl(s, 'c5_chloe') && !fl(s, 'c5_bossDone'), { r: 26, text: 'down' });
  mark('office', 'L2', 'o5-pedestal', 'circle', ['c5_atrium', 20, 15], (s) => ch(s) === 5 && fl(s, 'c5_chloe') && !fl(s, 'c5_bossDone'), { r: 60, text: 'Chloe' });
  mark('office', 'L2', 'o5-ped-ok', 'tick', ['c5_atrium', 20, 15], (s) => fl(s, 'c5_bossDone'));
  mark('office', 'L4', 'o6-esc-ok', 'tick', ['c6_escalations', 3, 2.5], (s) => fl(s, 'c6_file'));
  mark('office', 'L4', 'o6-fire', 'circle', ['c5_level4', -1.5, 27], (s) => ch(s) === 6 && fl(s, 'c6_file') && !fl(s, 'c6_office'), { r: 30, text: 'up — Luka' });
  mark('rmap_office', 'L4', 'ro-down', 'circle', ['c5_level4', 14.2, 10], (s) => ch(s) === 5 && fl(s, 'c5_outage') && !fl(s, 'c5_bossDone'), { r: 24, text: 'down' });
  mark('rmap_office', 'L2', 'ro-ped', 'circle', ['c5_atrium', 20, 15], (s) => ch(s) === 5 && fl(s, 'c5_outage') && !fl(s, 'c5_bossDone'), { r: 40 });
  mark('rmap_office', 'L6', 'ro-shaft', 'circle', ['c6_shaft', 0, 0], (s) => ch(s) === 6 && fl(s, 'c6_doors') && !fl(s, 'c6_setpiece'), { r: 24, text: 'Luka' });
  // ---- Levels 5 and 6 ----
  mark('office_upper', 'L5', 'u6-power', 'circle', ['c6_level5', 28, 9.2], (s) => ch(s) === 6 && dn(s, 'c6:noteRead') && !fl(s, 'c6_power'), { r: 28, text: 'site power' });
  mark('office_upper', 'L5', 'u6-power-ok', 'tick', ['c6_level5', 28, 9.2], (s) => fl(s, 'c6_power'));
  mark('office_upper', 'L6', 'u6-office', 'circle', ['c6_lukaoffice', 3.5, 2.7], (s) => ch(s) === 6 && fl(s, 'c6_power') && !fl(s, 'c6_office'), { r: 34, text: 'Luka?' });
  mark('office_upper', 'L6', 'u6-office-ok', 'tick', ['c6_lukaoffice', 3.5, 2.7], (s) => fl(s, 'c6_office'));
  mark('office_upper', 'L6', 'u6-lift', 'circle', ['c6_level6', 26, 14.2], (s) => ch(s) === 6 && fl(s, 'c6_voice') && !fl(s, 'c6_setpiece'), { r: 26, text: 'Lift B' });
  mark('office_upper', 'L6', 'u6-lift-ok', 'tick', ['c6_level6', 26, 14.2], (s) => fl(s, 'c6_setpiece'));
  // ---- the hospital ----
  mark('hospital', 'G', 'h7-book', 'circle', ['c7_reception', 8, 4], (s) => ch(s) === 7 && !fl(s, 'c7_visitor'), { r: 26, text: 'visitor book' });
  mark('hospital', 'G', 'h7-room12', 'circle', ['c7_room12', 3, 2], (s) => ch(s) === 7 && fl(s, 'c7_visitor') && !fl(s, 'c7_room12'), { r: 30, text: 'Room 12' });
  mark('hospital', 'G', 'h7-ward', 'note', ['c7_ward3', 5, -1.5], (s) => ch(s) === 7 && fl(s, 'c7_visitor') && !fl(s, 'c7_room12'), { text: 'Ward 3', textSize: 12 });
  mark('hospital', 'G', 'h7-room12-ok', 'tick', ['c7_room12', 3, 2], (s) => fl(s, 'c7_room12'));
  mark('hospital', 'G', 'h7-chain', 'x', ['c7_carpark', 44, 4.5], (s) => ch(s) === 7 && fl(s, 'c7_arrived') && !fl(s, 'c7_room12'), { text: 'chained' });
  mark('hospital', 'G', 'h7-mast', 'circle', ['c7_carpark', 50, 4.5], (s) => fl(s, 'c7_room12') && ch(s) === 7, { r: 26, text: 'the mast' });
  // ---- the mast ----
  const gateKnown = (s) => fl(s, 'c8_phone') || read(s, 'gate_card', 'gate_card_easy', 'gate_card_hard');
  mark('mast', 'G', 'm8-gate', 'note', ['c8_compound', 17.5, 25.5], (s) => ch(s) === 8 && !fl(s, 'c8_gate') && !gateKnown(s), { text: 'gate code = ?', textSize: 13 });
  mark('mast', 'G', 'm8-gate2', 'note', ['c8_compound', 17.5, 25.5], (s) => ch(s) === 8 && !fl(s, 'c8_gate') && gateKnown(s), { text: lvlText({ easy: 'gate code = 1961', normal: 'gate code = year it opened', hard: 'gate code = day + month it opened' }), textSize: 12 });
  mark('mast', 'G', 'm8-climb', 'circle', ['c8_mast', 0, 0], (s) => ch(s) === 8 && fl(s, 'c8_gate') && !fl(s, 'c8_top'), { r: 44, text: 'climb' });
  mark('mast', 'G', 'm8-nest', 'note', ['c8_mast', 6.5, -1.5], (s) => ch(s) === 8 && !!(s.flags && s.flags.c8_nest) && !fl(s, 'c8_top'), { text: 'torch off', textSize: 12 });
  mark('mast', 'G', 'm8-top', 'tick', ['@head', -3.3, -0.6], (s) => fl(s, 'c8_top'));
  mark('mast', 'G', 'm8-hut', 'circle', ['@head', 2, -0.6], (s) => ch(s) === 8 && fl(s, 'c8_top'), { r: 40 });
  mark('rmap_mast', 'G', 'rm-gate', 'circle', ['c8_compound', 15, 20], (s) => ch(s) === 8 && !fl(s, 'c8_gate'), { r: 24, text: 'gate' });
  mark('rmap_mast', 'G', 'rm-up', 'circle', ['c8_mast', 0, 0], (s) => ch(s) === 8 && fl(s, 'c8_gate') && !fl(s, 'c8_top'), { r: 30, text: 'up' });
  mark('rmap_mast', 'G', 'rm-top', 'tick', ['@head', -3.3, -0.6], (s) => fl(s, 'c8_top'));
  // a note whose wording follows the riddle level (the map is re-composed each time it opens)
  function lvlText(t) {
    return { toString() { const l = (typeof S !== 'undefined' && S && S.difficulty && S.difficulty.riddle) || 'normal'; return t[l] || t.normal; } };
  }

  // =================================================================================================================
  // defineMap
  // =================================================================================================================
  const floorsOf = (map) => {
    const o = {};
    for (const sh of Object.values(SHEETS)) if (sh.map === map) o[sh.floor] = { w: sh.f.w, h: sh.f.h, shapes: sh.shapes };
    return o;
  };
  const DEFS = [
    { id: 'town', title: 'Signal Hill — Visitor Map — 1994', sub: 'Streets, landmarks and places of interest', publisher: 'Signal Hill Shire Council · Tourist Information', printed: '1994', scale: 'Distances approximate', stains: 2 },
    { id: 'plaza', title: 'Signal Hill Plaza — Directory', sub: 'Ground floor · over thirty specialty stores', publisher: 'Signal Hill Plaza Centre Management', printed: '1998' },
    { id: 'village', title: 'Hilltop Village — Site Plan', sub: 'Independent living · units 1–12 · community hall', publisher: 'Hilltop Village Residents\' Committee', printed: '2003 (photocopy)', stains: 2 },
    { id: 'exchange', title: 'Signal Hill Trunk Exchange — Fire Evacuation Plan', sub: 'Ground floor and basement', publisher: 'Telecommunications Department · Property Branch', printed: '1979', floorOrder: ['B', 'G'] },
    { id: 'care', title: 'Customer Care Centre — Floor Plan', sub: 'Ground floor', publisher: 'Facilities Management', printed: '2011' },
    { id: 'office', title: 'Regional Office — Building Directory', sub: 'Ground · Level 2 atrium · Level 4', publisher: 'Building Management', printed: '2019', floorOrder: ['G', 'L2', 'L4'] },
    { id: 'office_upper', title: 'Fire Stairs Plan — Levels 5 & 6', sub: 'Stair B · refurbishment in progress', publisher: 'Site Safety — keep this plan on the door', printed: '2025', floorOrder: ['L5', 'L6'] },
    { id: 'hospital', title: 'District Hospital — Visitor Directory', sub: 'Ground floor · Ward 3', publisher: 'District Health Service', printed: '2016' },
    { id: 'mast', title: 'Mast Compound — Site Diagram', sub: 'Compound, huts, ladder and platforms', publisher: 'Signal Hill Trunk Exchange · Site SH-01', printed: '1961', stains: 2 },
    { id: 'rmap_plaza', kind: 'receipt', of: 'plaza', title: 'Signal Hill Plaza', sub: 'Store 0288 · no service' },
    { id: 'rmap_village', kind: 'receipt', of: 'village', title: 'Hilltop Village', sub: 'Unit 9 · Unit 9 · Unit 9' },
    { id: 'rmap_exchange', kind: 'receipt', of: 'exchange', title: 'Trunk Exchange', sub: 'Est. 1961 · line held', floorOrder: ['B', 'G'] },
    { id: 'rmap_care', kind: 'receipt', of: 'care', title: 'Customer Care', sub: 'You are number 4,112' },
    { id: 'rmap_office', kind: 'receipt', of: 'office', title: 'Regional Office', sub: 'Excellence every day', floorOrder: ['L2', 'L4', 'L5', 'L6'] },
    { id: 'rmap_mast', kind: 'receipt', of: 'mast', title: 'The Mast', sub: 'Summit Rd · signal found' },
  ];
  for (const d of DEFS) {
    if (typeof MAPS !== 'undefined' && MAPS[d.id]) continue;
    defineMap({ kind: 'paper', ...d, floors: floorsOf(d.id), marks: MARKS[d.id] || [] });
  }

  // =================================================================================================================
  // Rooms' map fields. room.map = {id, floor, xform, outage, rxform, rfloor}
  // =================================================================================================================
  const xf = (map, room) => {
    const p = pl(map, room), f = FR[map];
    if (!p || !f) return null;
    return [r1((p.px - f.ox) * f.sc), r1((p.pz - f.oz) * f.sc), Math.round(f.sc * p.k * 1000) / 1000, p.rot];
  };
  if (typeof ROOMS !== 'undefined') {
    for (const room of Object.keys(HOME)) {
      const def = ROOMS[room];
      if (!def) continue;
      const map = HOME[room], p = pl(map, room);
      const m = { id: map, floor: p.floor, xform: xf(map, room) };
      const rmap = RHOME[room];
      if (rmap && pl(rmap, room)) { m.outage = rmap; m.rxform = xf(rmap, room); m.rfloor = pl(rmap, room).floor; }
      def.map = m;
    }
    // the lift car interior is built beside the shaft (x ≈ 11.6): while Aidan is in it, map it back onto the shaft
    const sh6 = ROOMS.c6_shaft && ROOMS.c6_shaft.map;
    if (sh6) {
      const inCar = () => { try { return typeof World !== 'undefined' && World.room === 'c6_shaft' && Player.pos.x > 6; } catch (e) { return false; } };
      // the car sits at shaft-local (11.6, −0.3); shift it back by that (the receipt is rotated 90°: x runs along y)
      const a = sh6.xform, b = sh6.rxform, fu = FR.office_upper.sc, fr = FR.rmap_office.sc;
      const ac = a ? [r1(a[0] - 11.6 * fu), r1(a[1] + 0.3 * fu), a[2], a[3]] : a;
      const bcar = b ? [r1(b[0] - 0.3 * fr), r1(b[1] - 11.6 * fr), b[2], b[3]] : null;
      Object.defineProperty(sh6, 'xform', { get: () => (inCar() ? ac : a), enumerable: true, configurable: true });
      if (b) Object.defineProperty(sh6, 'rxform', { get: () => (inCar() ? bcar : b), enumerable: true, configurable: true });
    }
  }

  // =================================================================================================================
  // Tidying Aidan's stored marks as the story moves (S.mapMarks): the chapters' objective circles turn into ticks when
  // done; an automatic X on a door that has since opened, a road that now continues, or a blocker that is gone turns
  // into a tick. One-way: a tick never turns back.
  // =================================================================================================================
  const TIDY = [
    ['c1:village', (s) => fl(s, 'c2_modemIn') || ch(s) >= 3],
    ['c2_unit9', (s) => fl(s, 'c2_modemIn')],
    ['c2_backgate', (s) => ch(s) >= 3],
    ['c3_fuse', (s) => fl(s, 'c3_fused')],
    ['c3_yard', (s) => ch(s) >= 4],
    ['c3_yardgate', (s) => ch(s) >= 4],
    ['auto:blk:c1_relay:c1_relay:hilltop', (s) => fl(s, 'c1_address')],
    ['auto:door:c1_backoffice:stock', (s) => fl(s, 'c1_bossDone')],
    ['auto:door:c6_firestairs:l6', (s) => fl(s, 'c6_power')],
    ['auto:door:c3_hall:frameA', (s) => fl(s, 'c3_fused')],
    ['auto:door:c3_hall:frameB', (s) => fl(s, 'c3_fused')],
  ];
  function tick(id) {
    const m = S.mapMarks && S.mapMarks[id];
    if (m && m.t !== 'tick') m.t = 'tick';
    const r = S.mapMarks && S.mapMarks[id + ':r'];
    if (r && r.t !== 'tick') r.t = 'tick';
  }
  function MAP_tidy() {
    if (typeof S === 'undefined' || !S || !S.mapMarks) return;
    // Chapter 1 circles Hilltop Village through Relay Street's transform at a guessed point (the top of Hilltop Road);
    // put the circle on Unit 9 itself
    const v = S.mapMarks['c1:village'];
    if (v && v.map === 'town' && !v.moved) { const p = P(SHEETS['town|G'], ['c2_crescent', 14, -1]); v.x = p[0]; v.y = p[1]; v.moved = true; }
    for (const [id, when] of TIDY) { try { if (S.mapMarks[id] && when(S)) tick(id); } catch (e) { /* state */ } }
    // (the automatic door / blocked-road marks of the room Aidan is in tick themselves: World.recheckMarks)
  }
  if (typeof Bus !== 'undefined') {
    for (const ev of ['room:enter', 'flag', 'chapter', 'outage', 'pickup']) Bus.on(ev, () => { try { MAP_tidy(); } catch (e) { console.error('[maps] tidy', e); } });
  }
  try { if (typeof window !== 'undefined' && window.SH) window.SH.maps = { PL, FR, SHEETS, xf, tidy: MAP_tidy, pl, fpt }; } catch (e) { /* tests only */ }
}
