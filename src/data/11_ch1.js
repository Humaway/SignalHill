// ==== data/11_ch1.js — Chapter 1 "The Plaza" (spec §8 Chapter 1, §7B Relay Street + Signal Hill Plaza, §6 the Returns
// Cage, the Tethered, the Unread; §2A riddle row "Ch 1 terminal PIN") — tag C1_ ====
// Rooms (CONTENT_PLAN §2): c1_relay (Relay Street, 180 m, metres from the south end = −z), c1_carpark (40 × 30 m),
//   c1_dock (loading dock), c1_corridor (service corridor, 40 × 3 m), c1_security, c1_staffroom (8 × 6 m each),
//   c1_concourse (60 × 12 m), c1_foodcourt (30 × 20 m), c1_kitchen (Outage only), c1_store (20 × 16 m; in the Outage the
//   floor stretches back into the dark), c1_backoffice (6 × 5 m), c1_stockroom (12 × 10 m, the boss arena) and
//   c1_mastshot (a cutscene-only set: the mast on the summit through the fog, for 1-2).
// Cutscenes: 1-1 "Welcome In", 1-7 (the case screen, in-engine), 1-8 (the food court payphone, in-engine), 1-2 "The
//   Tone", 1-3 "Returns", 1-4 "I'm Going to Fix It". Boss: 'returns_cage' (custom enemy type 'c1_cage').
// Flow / flags (S.flags): c1_address (terminal done — Hilltop Road opens), c1_wai (Wai's call answered → 1-2 and the
//   Outage), c1_pinKnown (the certificate read), c1_bossDone (1-4 played; the Outage lifted). S.done keys: 'c1:…'.
// The chapter ends walking up Hilltop Road the first time after 1-4: await G.startChapter(2) (its card: HILLTOP VILLAGE).
{
  const D2R = Math.PI / 180;
  // transient presentation state (never saved; everything that must survive lives in S.flags / S.done)
  const C1 = { ring: null, ringKey: '', cctv: { seenT: 0, away: false }, boss: null, phones: [], noteMeshes: [] };
  const flag = (n) => !!(S.flags && S.flags[n]);
  const done = (k) => !!(S.done && S.done[k]);
  const lvl = () => (S.difficulty && S.difficulty.riddle) || 'normal';
  const ringing = () => flag('c1_address') && !flag('c1_wai');
  const pickDoc = (base) => (typeof DOC_pick === 'function' ? DOC_pick(base) : base);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isPad = () => { try { return Input.lastDevice === 'gamepad'; } catch (e) { return false; } };

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas textures (drawn once, shared, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const TEXC = new Map();
  function C1_tex(key, w, h, draw, o = {}) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h, U.rng(U.hash('c1:' + key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.shared = true; t.name = 'c1:' + key;
    TEXC.set(key, t);
    return t;
  }
  const FN = Tex.fonts;
  function tx(ctx, s, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${o.font || FN.sans}`.trim();
    ctx.fillStyle = color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    if (o.spacing) { let cx = o.align === 'center' ? x - (ctx.measureText(s).width + o.spacing * (s.length - 1)) / 2 : x; ctx.textAlign = 'left'; for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + o.spacing; } }
    else ctx.fillText(s, x, y);
    ctx.restore();
  }
  const age = (ctx, w, h, r, k, o) => { try { Tex.util.age(ctx, w, h, r, k, o); } catch (e) { /* cosmetic */ } };
  // a handwritten slip (returns notes, the stockroom sign): sticky yellow or lined white, blue biro
  const slipTex = (text, o = {}) => C1_tex('slip|' + text + '|' + (o.paper || 'sticky'), 256, 256, (x, w, h, r) => {
    x.fillStyle = o.paper === 'white' ? '#ece8dc' : '#ecdc78'; x.fillRect(0, 0, w, h);
    if (o.paper === 'white') { x.strokeStyle = 'rgba(80,110,170,0.35)'; x.lineWidth = 1; for (let y = 40; y < h; y += 26) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } }
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(110,90,20,${r() * 0.06})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }
    Tex.handwriting(x, text, 18, 70, { size: o.size || 30, color: o.ink || '#1b2a7a', wobble: 2.2, seed: U.hash(text) % 97, maxWidth: w - 34, lineHeight: (o.size || 30) * 1.3 });
    age(x, w, h, r, 0.5);
  });
  // a faded Signal Hill Star front page for inserts / walls (the newsagent's window uses the prop's own)
  const dogPhoneTex = () => C1_tex('dogphone', 128, 256, (x, w, h, r) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f2c14e'); g.addColorStop(1, '#e2733a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a dog in a party hat
    x.fillStyle = '#7a5334'; x.beginPath(); x.ellipse(w / 2, h * 0.62, 40, 46, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a3a22'; x.beginPath(); x.ellipse(w / 2 - 36, h * 0.56, 12, 28, 0.35, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(w / 2 + 36, h * 0.56, 12, 28, -0.35, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#d8b48a'; x.beginPath(); x.ellipse(w / 2, h * 0.7, 20, 16, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1a1210'; x.beginPath(); x.ellipse(w / 2, h * 0.66, 7, 5, 0, 0, Math.PI * 2); x.fill();
    for (const s of [-1, 1]) { x.beginPath(); x.arc(w / 2 + s * 15, h * 0.56, 4, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#2e86c1'; x.beginPath(); x.moveTo(w / 2 - 20, h * 0.47); x.lineTo(w / 2 + 16, h * 0.46); x.lineTo(w / 2 - 4, h * 0.25); x.fill();
    x.fillStyle = '#f1c40f'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(w / 2 - 12 + i * 10, h * 0.43 - i * 7, 3, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w / 2 - 4, h * 0.245, 5, 0, Math.PI * 2); x.fill();
    tx(x, '8:59', w / 2, h * 0.2, 30, 'rgba(255,255,255,0.92)', { align: 'center' });
    tx(x, 'NO SERVICE', 8, 14, 9, 'rgba(255,255,255,0.8)');
  });
  const plazaPosterTex = (i) => C1_tex('plposter' + i, 256, 362, (x, w, h, r) => {
    const heads = [['CAP PLANS', 'FROM $29'], ['NOW WITH', 'VIDEO CALLING'], ['BACK TO', 'SCHOOL SALE'], ['EASTER', 'TRADING HOURS'], ['THE PLAZA', 'GROWS WITH YOU'], ['CHRISTMAS', 'LATE NIGHTS']];
    const [a, b] = heads[i % heads.length];
    const bg = ['#1f6f8a', '#b54a2a', '#2f7a3a', '#7a3a6a', '#1d3d4a', '#8a2a22'][i % 6];
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(w * 0.8, h * 0.3, 120, 0, Math.PI * 2); x.fill();
    tx(x, a, w / 2, 90, 34, '#fbf6e8', { font: FN.heavy, weight: '900', align: 'center' });
    tx(x, b, w / 2, 130, 26, '#ffd23a', { font: FN.heavy, weight: '900', align: 'center' });
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(30, 170, w - 60, 120);
    for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(40,40,40,0.4)'; x.fillRect(44, 186 + k * 16, (w - 88) * (0.6 + r() * 0.4), 5); }
    tx(x, 'SIGNAL HILL PLAZA', w / 2, h - 30, 14, '#fbf6e8', { font: FN.serif, weight: 'bold', align: 'center', spacing: 2 });
    age(x, w, h, r, 1.6, { sun: 0.9 });
    x.fillStyle = 'rgba(214,206,186,0.35)'; x.fillRect(0, 0, w, h);
  });
  // the Plaza's own directory board ("YOU ARE HERE") — a wall sign in the concourse and on the street
  const directoryTex = () => C1_tex('directory', 512, 384, (x, w, h, r) => {
    x.fillStyle = '#16323a'; x.fillRect(0, 0, w, h);
    tx(x, 'SIGNAL HILL PLAZA', 20, 38, 26, '#e8e0c8', { font: FN.serif, weight: 'bold', spacing: 3 });
    tx(x, 'STORE DIRECTORY', w - 20, 36, 14, '#9fc4c0', { align: 'right', spacing: 2 });
    x.fillStyle = '#e8e0c8'; x.fillRect(20, 50, w - 40, 2);
    x.strokeStyle = '#9fc4c0'; x.lineWidth = 2; x.strokeRect(30, 70, w - 60, 200);
    x.fillStyle = 'rgba(159,196,192,0.18)';
    for (const [a, b, c, d] of [[34, 74, 120, 80], [w - 150, 74, 116, 80], [w - 150, 190, 116, 76], [34, 190, 96, 76], [140, 190, 80, 76], [230, 190, 80, 76]]) x.fillRect(a, b, c, d);
    x.fillStyle = 'rgba(159,196,192,0.35)'; x.fillRect(34, 158, w - 68, 30);
    const lab = (s, a, b) => tx(x, s, a, b, 11, '#dfe9e6', { weight: 'bold' });
    lab('FOOD COURT', 44, 110); lab('STORE', w - 136, 110); lab('STOCK', w - 136, 128); lab('SECURITY', w - 136, 230); lab('STAFF', 150, 230); lab('DOCK', 240, 230); lab('CONCOURSE', 200, 177);
    x.fillStyle = '#d63a2a'; x.beginPath(); x.arc(60, 173, 7, 0, Math.PI * 2); x.fill();
    tx(x, 'YOU ARE HERE', 72, 177, 11, '#ffb8a8', { weight: 'bold' });
    const shops = ['Food Court ........ 1–9', 'Hilltop Chemist ...... 12', 'Plaza Newsagency ...... 14', 'Signal Hill Shoe Repair .. 17', 'Optus .................. 22', 'Post Office ........... 24'];
    shops.forEach((s, i) => tx(x, s, 30 + (i % 2) * 240, 300 + Math.floor(i / 2) * 24, 13, '#e8e0c8', { font: FN.mono }));
    age(x, w, h, r, 1.2, { sun: 0.4 });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Small builders shared by the rooms
  // ---------------------------------------------------------------------------------------------------------------
  // a phone note in Aidan's voice; ids keep one entry per objective
  const note = (G, text, id, o = {}) => { try { G.note(text, { id, ...o }); } catch (e) { /* no phone */ } };
  // examine with a function body (several thoughts in one press)
  const thinkAll = (...lines) => async (G) => { for (const l of lines) await G.think(l); };
  // a flat plane lying on the floor (y = floor top)
  const flatPlane = (K, x, y, z, w, d, mat, rotY = 0, o = {}) => K.plane(x, y, z, w, d, mat, { rot: [-90, 0, rotY], ...o });
  // the ring of the food court payphone: positional in the food court, muffled one room away elsewhere in the Plaza
  function C1_ringTick(roomId) {
    let want = '';
    if (ringing()) {
      if (roomId === 'c1_foodcourt') want = 'near';
      else if (roomId === 'c1_concourse') want = 'mid';
      else if (roomId === 'c1_store' || roomId === 'c1_backoffice') want = 'far';
    }
    if (want === C1.ringKey) return;
    C1_ringStop();
    C1.ringKey = want;
    if (!want || typeof Snd === 'undefined') return;
    try {
      if (want === 'near') C1.ring = Snd.play('ring', { loop: true, pos: C1.ringPos || [3.1, 1.4, 0.3], vol: 1.0 });
      else C1.ring = Snd.play('ring', { loop: true, far: true, lp: want === 'mid' ? 1800 : 900, vol: want === 'mid' ? 0.45 : 0.22 });
    } catch (e) { C1.ring = null; }
  }
  // the Plaza's interiors: a faint grey-teal ambient in the Fog world, a sick teal one in the Outage (blended through
  // the Outage's surface dissolve, so the transition carries it)
  const C1_AMB = { c0: new THREE.Color(), c1: new THREE.Color(), last: -1 };
  function C1_ambient(fog, out) {
    const k = clamp(Tex.outage || 0, 0, 1);
    const key = Math.round(k * 50) + fog[1] * 1000 + out[1] * 100000;
    if (key === C1_AMB.last) return;
    C1_AMB.last = key;
    C1_AMB.c0.set(fog[0]).lerp(C1_AMB.c1.set(out[0]), k);
    Render.setAmbient(C1_AMB.c0.getStyle(), U.lerp(fog[1], out[1], k));
  }
  function C1_ambientOff() { C1_AMB.last = -1; Render.setAmbient(null); }
  function C1_ringStop() { if (C1.ring && C1.ring.stop) { try { C1.ring.stop(0.08); } catch (e) { /* audio */ } } C1.ring = null; C1.ringKey = ''; }

  // =================================================================================================================
  // 1A RELAY STREET — 180 × 14 m, south → north. x: west footpath −0.16…2.84, carriageway 3…11, east footpath 11…14.3;
  // z = −(metres from the south end). West: shops from 9 m to 155 m (repair 20, bank 45, newsagent 75 + payphone,
  // pharmacy 100), the operators' memorial bench (165) in a scrap of park, Exchange Road's lower branch (180) ending at a
  // drop. East: fence and a vacant lot, the car park entrance (60), the Plaza facade (64–152) with the chained front
  // doors (110), the blinking traffic light and Hilltop Road climbing east (170). South: back to the bus shelter.
  // =================================================================================================================
  const RL = { west: -0.25, kerbE: 11, eastEdge: 14.3, doorsZ: -110 };
  defineRoom({
    id: 'c1_relay', name: 'RELAY STREET', area: 'RELAY STREET', chapter: 1, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.052 },
    surfaces: [{ box: [-0.2, -176, 3, 6], s: 'concrete' }, { box: [11, -166, 14.4, 6], s: 'concrete' }],
    bounds: [-16, -190, 25, 7],
    entries: { south: [7.2, 2.6, 180], carpark: [13.2, -60, -90], north: [21.5, -171, -90], start: [7.2, 2.6, 180] },
    cameras: [
      // the south end: from up the street looking back toward the fog he came out of (the empty street first)
      { id: 'c1_relay:south', vol: [-0.3, -12, 14.4, 6.5], type: 'static', pos: [10.2, 3.3, -19.5], target: [6.8, 0.5, -1.5], fov: 'fit' },
      // rails along both footpaths: from the east gutter looking west at him and the shopfronts behind him …
      { id: 'c1_relay:railE', vol: [-0.3, -152, 8.2, -12], type: 'rail', pos: [10.3, 3.4, -40], fov: 50, rail: { a: [10.3, 3.4, -8], b: [10.3, 3.4, -156], look: [0, 1.05, 0], lag: 0.4 } },
      // … and from the west gutter looking east at him and the Plaza's long blank wall (the car park's mouth)
      { id: 'c1_relay:railW', vol: [8.2, -152, 16.2, -12], type: 'rail', pos: [5.6, 3.3, -40], fov: 50, rail: { a: [5.6, 3.3, -8], b: [5.6, 3.3, -156], look: [0, 1.05, 0], lag: 0.4 } },
      // through the newsagent's window (from inside, past the magazines and the back of the 1987 front page)
      { id: 'c1_relay:news', vol: [-0.3, -76.6, 6.2, -67.5], pri: 1, type: 'static', pos: [-2.2, 1.45, -78.05], target: [3.2, 0.95, -71.6], fov: 'fit' },
      // low under the entrance canopy, up at the chained doors and the sign
      { id: 'c1_relay:doors', vol: [8.2, -118, 14.4, -102], pri: 1, type: 'static', pos: [3.4, 0.55, -99.4], target: [13.6, 2.5, -110.6], fov: 'fit' },
      // a high static at the traffic light, down on the junction and the memorial bench (the fog thins for it)
      { id: 'c1_relay:junction', vol: [-0.3, -176, 14.4, -152], type: 'static', pos: [7.4, 11.5, -140.5], target: [6.6, 0, -166.5], fov: 'fit' },
      // the foot of Hilltop Road: the road climbs away into the fog (nothing past the first bend until he commits)
      { id: 'c1_relay:hilltop', vol: [14.4, -176, 24.7, -166], type: 'static', pos: [8.2, 1.35, -171.2], target: [24, 1.3, -171], fov: 'fit' },
      // the north end: Exchange Road's lower branch, the barrier and the drop
      { id: 'c1_relay:north', vol: [-12, -190, 11.2, -176], type: 'pan', pos: [9.8, 3.4, -171.2], target: [-4, 0.8, -183], fov: 46, pan: { lag: 0.3, yaw: 55, pitch: 25 } },
    ],
    spawns: [
      // mid-street at 90 m, facing up the street, away from him
      { id: 'c1_relay:teth', type: 'tethered', pos: [5.0, -90], rot: 180, anchor: [5.0, -90], cardigan: '#6b4a4a' },
    ],
    build(K) {
      // ---- ground: the carriageway with the west footpath; the east footpath by hand (it breaks for the car park) -----
      K.road(3, -176, 11, -2, { axis: 'z', markings: 'center', footpath: [3, 0], sides: 'left' });
      K.floor(3, -2, 11, 6.5, 'bitumen');
      K.floor(11, -56, RL.eastEdge, 6.5, 'footpath', { y: 0.15 });
      K.floor(11, -166, RL.eastEdge, -64, 'footpath', { y: 0.15 });
      K.box(RL.kerbE + 0.08, 0, -24.75, 0.16, 0.15, 62.5, 'kerb');
      K.box(RL.kerbE + 0.08, 0, -115, 0.16, 0.15, 102, 'kerb');
      K.floor(11, -64, 16.2, -56, { tex: 'concrete', color: '#8b8a82' });                       // the car park driveway
      K.floor(11, -176, 24.6, -166, 'bitumen', { ramp: { axis: 'x', y0: 0, y1: 1.1 } });     // Hilltop Road, climbing east
      K.floor(-12, -190, 11.2, -176, 'bitumen');                                             // the north end + Exchange Rd branch
      K.plane(7, 0.006, -170.5, 8, 0.35, { color: '#d9d6cc', roughness: 0.8 }, { rot: [-90, 0, 0] });   // stop line
      K.plane(-3.5, 0.006, -183, 14, 0.12, { color: '#d9d6cc', roughness: 0.8, transparent: true, opacity: 0.6 }, { rot: [-90, 0, 90] });
      // verges beyond the walkable edges (visual)
      K.box(21, -0.02, -40, 14, 0.02, 90, { tex: 'gravel', color: '#7d7a70' }, { shadow: false });
      K.box(-8, 0.08, -168, 15.5, 0.02, 16, { tex: 'grass', color: '#6f7862' }, { shadow: false });
      K.dress('leaves', [3.1, -170, 4.2, 4], 70, { seed: 11 });
      K.dress('leaves', [9.8, -165, 10.9, 4], 60, { seed: 12 });
      K.dress('papers', [0.2, -160, 2.6, -8], 16, { seed: 13 });
      K.dress('papers', [4, -150, 10, -20], 10, { seed: 14 });

      // ---- the south end: back toward the bus shelter; the west side falls away into fog --------------------------------
      K.drop(-8, -2, 2.95, 6.8, { side: 'n', msg: 'The road ends here.' });
      K.light('street', 13.6, 6.4, 13.5, { real: false, haloSize: 5.2, haloOpacity: 0.5 });      // the bus shelter's light, down the hill
      K.exit({ id: 'c1_relay:south', box: [2.9, 5.3, 14.4, 6.6], to: 'p4_busshelter', entry: 'relay' });
      K.examine(9.8, 1.2, 5.3, ['Back down to the bus stop. [beat] The only light that works on the whole street.', 'Her place isn\'t down there.'], { id: 'c1r:southend', r: 1.8 });

      // ---- WEST: the shops (facades face east; each shopfront adds its own collider) ------------------------------------
      K.collider(-4, -176, RL.west, 6.5, { h: 5 });
      const shop = (p, w, variant, o = {}) => K.prop('shopfront', RL.west, -p, 90, { w, variant, ...o });
      shop(12, 6, 'vacant');
      shop(20, 6, 'repair');
      shop(30, 7, 'shop', { name: 'SUDS LAUNDROMAT', bg: '#2a4a6a', fg: '#e8eef0' });
      shop(45, 8, 'bank');
      shop(56, 7, 'shop', { name: 'HILLTOP HARDWARE', bg: '#5a3a1a', fg: '#f0d890', shutter: 0.65 });
      shop(65, 6, 'vacant');
      shop(75, 7, 'newsagent', { newspaper: ['EXCHANGE AUTOMATED:\n40 JOBS GONE', 'Saturday, 3 October 1987'] });
      shop(87, 6.5, 'shop', { name: 'SIGNAL HILL VIDEO', bg: '#3a1a4a', fg: '#f4d23a' });
      shop(100, 7, 'pharmacy');
      shop(111, 7, 'shop', { name: 'RELAY ST CAFE', bg: '#2e4a2e', fg: '#efe6c8' });
      shop(122, 6, 'vacant');
      shop(133, 8, 'shop', { name: 'HOSPITAL AUXILIARY OP SHOP', bg: '#6a2a3a', fg: '#f4ece0' });
      shop(145, 7, 'shop', { name: 'HAIR BY DEBBIE', bg: '#8a4a6a', fg: '#fff4f8', shutter: 1 });
      shop(153.5, 4, 'vacant', { door: 'right' });
      // writing on the shutters (faded marker in the fog; thick marker in the Outage)
      K.writing('ASK THEM', 0.05, 1.35, -19.2, 1.3, { rotY: 90, world: 'fog' });
      K.writing('IT\'LL BE FINE', 0.05, 1.1, -145.6, 1.4, { rotY: 90, world: 'fog' });
      // the scrap of park: grass, a gum tree, a low log barrier, the operators' memorial bench on the footpath
      for (let z = -175.5; z < -155; z += 2.1) K.box(-0.35, 0, z + 1, 0.2, 0.35, 2.0, { tex: 'wood', color: '#6a5a44' });
      K.prop('gum_tree', -6, -170, 40, {});
      K.prop('shrub', -2.6, -160.5, 0, { w: 1.6, h: 1.1, collide: false }); K.prop('shrub', -2.2, -174.5, 0, { w: 1.3, h: 1.0, dead: true, collide: false });
      K.prop('bench_plaque', 1.35, -165, 90, {});
      K.dress('leaves', [-5.5, -175, -0.6, -157], 60, { seed: 15, y: 0.12 });
      // street furniture: payphone outside the newsagent (a save point), letterbox, bins, a trolley, parked cars
      K.payphone(1.35, -80.6, 90, { id: 'c1_relay:payphone' });
      K.prop('letterbox', 2.45, -71.8, 90, { variant: 'post' });
      K.prop('bin', 2.5, -47.5, 90, { variant: 'street' });
      K.prop('bin', 2.5, -126, 90, { variant: 'street' });
      K.prop('trolley', 1.6, -58.5, 64, {});
      K.prop('car', 4.25, -33, 90, { color: '#6a6f5a' });
      K.prop('car', 4.25, -139, 90, { color: '#8a8478', variant: 'wagon' });
      for (const p of [28, 70, 118, 158]) K.prop('power_pole', 2.75, -p, 90, { span: 45 });
      // sodium lights: a few still burn; one dead, one flickering
      K.prop('streetlight', 2.55, -16, 90, { bank: 1 });
      K.prop('streetlight', 2.55, -40, 90, { bank: 1 });
      K.prop('streetlight', 2.55, -62, 90, { lit: false });
      K.prop('streetlight', 2.55, -104, 90, { bank: 2, flicker: true });
      K.prop('streetlight', 2.55, -150, 90, { bank: 3 });
      // on the Plaza side the lamps are bolted to the wall (sodium, one dead)
      for (const [z, on] of [[-70, true], [-96, true], [-124, false], [-146, true]]) {
        K.box(RL.eastEdge + 0.02, 4.1, z, 0.9, 0.08, 0.1, { tex: 'metal', color: '#4c5250' }, { rot: 90 });
        K.box(RL.eastEdge - 0.55, 3.95, z, 0.35, 0.16, 0.22, { tex: 'metal', color: '#3a3f3d' });
        if (on) K.light('street', RL.eastEdge - 0.55, 3.85, z, { bank: 2, haloSize: 1.8, intensity: 22, distance: 13 });
      }
      K.prop('sign_post', 2.55, -9, 45, { text: 'RELAY ST', text2: 'HILL RD', y: 0.15 });

      // ---- EAST: fence and a vacant lot, the car park entrance, the Plaza ---------------------------------------------
      K.collider(RL.eastEdge, -56, 18, 6.5, { h: 3 });
      for (let z = 3; z > -55; z -= 6) K.prop('fence', RL.eastEdge + 0.06, z - 3, -90, { variant: 'colorbond', len: 6 });
      K.prop('sign_post', 16.4, -30, -90, { style: 'council', text: 'FOR SALE\nPRICE ON\nAPPLICATION', w: 0.9, h: 0.7, y: 0 });
      K.prop('shrub', 17.5, -22, 0, { w: 2, h: 1.3, dead: true, collide: false }); K.prop('shrub', 19, -44, 0, { w: 1.6, h: 1.1, collide: false });
      // the car park entrance (60 m): a driveway, the boom gate stuck up, a sign
      K.collider(15.9, -52, 16.4, -48, { h: 2 });
      K.prop('boom_gate', 15.4, -64.4, 0, { open: 1 });
      K.prop('sign_post', 12.9, -53.8, -60, { style: 'council', text: 'PLAZA PARKING\n→ LOADING DOCK', bg: '#1d3d4a', fg: '#e6dfc9', w: 0.9, h: 0.5, y: 0.15 });
      K.exit({ id: 'c1_relay:carpark', box: [15.6, -64, 16.3, -56], to: 'c1_carpark', entry: 'street' });
      K.collider(16.2, -70, 20, -64, { h: 3 }); K.collider(16.2, -56, 20, -50, { h: 3 });
      // the Plaza's facade: tilt-up concrete, a band of dark high windows, the sign, the entrance canopy, chained doors
      const FAC = { tex: 'concrete', color: '#8e877a' };
      K.wall(RL.eastEdge + 0.15, -64, RL.eastEdge + 0.15, -152, 7.5, FAC, { thick: 0.3, openings: [{ at: 18, w: 6.1, h: 4.4 }, { at: 46, w: 3.6, h: 2.8 }, { at: 76, w: 6.1, h: 4.4 }], grime: true });
      // two street-facing tenancies in the facade (dark, papered over)
      K.prop('shopfront', RL.eastEdge + 0.15, -82, -90, { w: 6, variant: 'vacant', awning: false, name: '' });
      K.prop('shopfront', RL.eastEdge + 0.15, -140, -90, { w: 6, variant: 'shop', name: 'PLAZA SHOE REPAIR & KEYS', bg: '#3a2a1a', fg: '#f0d890', awning: false, shutter: 1 });
      K.wall(RL.eastEdge + 0.15, -152, RL.eastEdge + 0.15, -166, 4.2, 'brick', { thick: 0.3, grime: true });
      for (let z = -68; z > -150; z -= 5.5) K.box(RL.eastEdge + 0.02, 4.6, z, 0.04, 1.3, 3.8, { color: '#1b2224', roughness: 0.15, metalness: 0.4 });
      for (let z = -66; z > -152; z -= 11) K.box(RL.eastEdge + 0.05, 0, z, 0.1, 7.5, 0.25, { tex: 'concrete', color: '#a39a88' });
      K.sign('SIGNAL HILL PLAZA', RL.eastEdge + 0.03, 6.1, -110, 7.2, 1.0, { rotY: -90, style: 'shop', bg: '#1d3d4a', fg: '#e6dfc9' });
      K.sign('OVER 30 SPECIALTY STORES', RL.eastEdge + 0.03, 5.25, -110, 4.2, 0.4, { rotY: -90, style: 'shop', bg: '#1d3d4a', fg: '#b8d4d0' });
      // the canopy over the entrance on two columns
      K.box(12.5, 3.05, -110, 3.8, 0.28, 6.4, { tex: 'concrete', color: '#9f988a' });
      K.box(10.9, 3.33, -110, 0.6, 0.3, 6.4, { color: '#1d3d4a', roughness: 0.5 });
      for (const cz of [-107.2, -112.8]) K.cyl(11.2, 0.15, cz, 0.13, 2.9, { tex: 'concrete', color: '#b8b0a0' }, { collide: true });
      K.door({ id: 'c1_relay:frontdoors', x: RL.eastEdge + 0.15, z: RL.doorsZ, rot: 90, w: 1.8, h: 2.3, style: 'glass_double', chain: true, locked: true, lockMsg: 'It\'s chained.', frame: true });
      for (const s of [-1, 1]) K.box(RL.eastEdge + 0.15, 0, RL.doorsZ + s * 1.35, 0.05, 2.75, 0.85, 'glass', { collide: true });
      // behind the glass: a dark vestibule, the second doors, a directory board, a poster
      K.box(16.4, 0, RL.doorsZ, 4.2, 0.02, 4.4, { tex: 'tile', color: '#4c5552' });
      K.box(18.5, 0, RL.doorsZ, 0.1, 3, 4.4, { color: '#0c0e0e', roughness: 1 });
      K.box(16.4, 2.95, RL.doorsZ, 4.2, 0.1, 4.4, { color: '#0e1010', roughness: 1 });
      for (const s of [-1, 1]) K.box(16.4, 0, RL.doorsZ + s * 2.2, 4.2, 3, 0.1, { color: '#141717', roughness: 1 });
      K.plane(18.44, 1.5, RL.doorsZ + 1.1, 1.3, 1.0, directoryTex(), { rotY: -90 });
      K.plane(18.44, 1.4, RL.doorsZ - 1.2, 0.6, 0.85, plazaPosterTex(0), { rotY: -90 });
      // posters on the facade in display cases (faded), a bin, a bench under the canopy
      for (const [z, i] of [[-92, 1], [-100, 2], [-120, 3], [-128, 4]]) {
        K.box(RL.eastEdge + 0.05, 0.8, z, 0.08, 1.35, 1.0, { color: '#262c2b', roughness: 0.5 });
        K.plane(RL.eastEdge - 0.0, 1.47, z, 0.8, 1.12, plazaPosterTex(i), { rotY: -90 });
        K.box(RL.eastEdge - 0.02, 0.85, z, 0.02, 1.25, 0.9, 'glass', { shadow: false });
      }
      K.writing('DID YOU CHECK', RL.eastEdge + 0.0, 1.6, -76, 1.6, { rotY: -90, world: 'fog' });
      K.prop('bench', 13.4, -118.5, -90, { len: 1.6 });
      K.prop('bin', 13.6, -101.8, -90, { variant: 'street' });
      K.prop('planter', 13.2, -86, 90, { variant: 'box', dead: true });
      K.prop('planter', 13.2, -134, 90, { variant: 'box', dead: true });
      K.dress('leaves', [11.3, -120, 14.2, -100], 36, { seed: 16, y: 0.16 });
      // north of the Plaza: a brick wall, then the corner of the junction and Hilltop Road
      K.collider(RL.eastEdge, -166, 18, -152, { h: 4 });

      // ---- the junction (170 m): the dead traffic light, Hilltop Road east, the north end, Exchange Road's branch ------
      K.prop('traffic_light', 12.7, -165.3, 0, { mode: 'amber', bank: 4 });
      K.prop('sign_post', 12.9, -176.6, -90, { text: 'HILLTOP RD', text2: 'RELAY ST', y: 0 });
      K.prop('sign_post', 16.5, -165.8, 180, { style: 'council', text: 'HILLTOP VILLAGE\nIndependent Living\n1 km', bg: '#2f5a3a', fg: '#eef0e0', w: 0.95, h: 0.62, y: 0.4 });
      // Hilltop Road's edges: guardrail on the north, a fence on the south, scrub, gum trees in the fog
      K.collider(11.2, -190, 26, -176.2, { h: 3 });
      K.collider(RL.eastEdge, -166, 26, -165.2, { h: 3 });
      K.prop('guardrail', 18.3, -176.25, 180, { len: 12.6, collide: false });
      for (let x = 15.5; x < 25; x += 6) K.prop('fence', x + 1.5, -165.6, 0, { variant: 'wire', len: 6 });
      K.prop('gum_tree', 22, -180, 0, { y: 0.8 }); K.prop('gum_tree_small', 26, -162, 0, { y: 0.8 });
      // Hilltop Road: blocked until the terminal gives the address ("walking up turns Aidan back"); the exit itself only
      // arms from Chapter 2 on — Chapter 1 ends on the trigger just below it
      const HT = K.exit({ id: 'c1_relay:hilltop', box: [23.6, -176, 24.7, -166], to: 'c2_hilltoprd', entry: 'bottom', when: (s) => !!(s.flags && s.flags.c1_address) && s.chapter >= 2 && !!ROOMS.c2_hilltoprd, blockedMsg: 'I don\'t even know where she lives yet.' });
      K.animate(() => { HT.blockedMsg = !flag('c1_address') ? 'I don\'t even know where she lives yet.' : ringing() ? 'That phone in there. It\'s still ringing.' : 'Not yet.'; });
      K.trigger([22.6, -176, 23.6, -166], (G) => C1_toHilltop(G), { id: 'c1_relay:toHilltop', once: false, when: (s) => s.chapter === 1 && !!(s.flags && s.flags.c1_bossDone) });
      // the north end: a fence across the top of Relay Street, the branch west to a barrier over a drop
      K.collider(-12, -191.5, 12, -189.6, { h: 3 });
      for (let x = -9; x < 12; x += 5) K.prop('chainlink', x + 2.5, -189.8, 0, { len: 5 });
      K.drop(-16, -190, -11.8, -176, { side: 'e', msg: 'I can\'t go that way.' });
      K.collider(-12, -176.1, -0.2, -175.3, { h: 3 });
      K.prop('streetlight', 10.8, -186.5, -90, { lit: false });
      K.prop('bollard', 11.0, -176.8, 0, {}); K.prop('bollard', 11.0, -188.6, 0, {});

      // ---- examine lines (Aidan) --------------------------------------------------------------------------------------
      const W = 0.55;
      K.examine(W, 1.5, -100.4, async (G) => {
        // the pharmacy's poster: he looks away before he says it
        const A = G.aidan;
        try { A.look([A.pos.x + 3, 1.2, A.pos.z + 4]); A.eyes('down'); } catch (e) { /* no actor */ }
        await G.wait(0.9);
        await G.think('...Closed anyway.');
        try { A.look(null); A.eyes('ahead'); } catch (e) { /* no actor */ }
      }, { id: 'c1r:pharmacy', r: 1.5 });
      K.examine(W, 1.5, -76.4, 'Nineteen eighty-seven. Nobody\'s changed this window in forty years.', { id: 'c1r:news', r: 1.5 });
      K.examine(W, 1.5, -45.2, 'Visit us online. In a town with no signal.', { id: 'c1r:bank', r: 1.6 });
      K.examine(W, 1.4, -20, 'There used to be a phone shop up here. That\'s why she came all the way to the city.', { id: 'c1r:repair', r: 1.6 });
      K.examine(1.3, 0.8, -165, 'The girls on the boards?', { id: 'c1r:bench', r: 1.4 });
      K.examine(W, 1.4, -30, ['A laundromat. There\'s a basket of washing still in the window.', 'Work shirts. Somebody was going to come back for those.'], { id: 'c1r:laundry', r: 1.4 });
      K.examine(W, 1.4, -87, ['Signal Hill Video. "Please be kind, rewind."', 'I don\'t think I\'ve ever held a tape.'], { id: 'c1r:video', r: 1.4 });
      K.examine(W, 1.4, -133, ['Op shop. A wedding dress in the window. A box of cassettes. A cot.', 'Everything in there belonged to somebody.'], { id: 'c1r:opshop', r: 1.5 });
      K.examine(W, 1.4, -56, ['Closing down sale. The sign\'s gone yellow.', 'It closed down. The sale didn\'t.'], { id: 'c1r:hardware', r: 1.4 });
      K.examine(12.7, 1.5, -165.3, ['Amber. Amber. Amber. [beat] Nobody\'s coming either way.', 'It\'s still trying to tell someone to slow down.'], { id: 'c1r:lights', r: 1.3 });
      K.examine(13.1, 1.6, -106.8, ['Signal Hill Plaza. Over thirty specialty stores.', 'The doors are chained from the inside.'], { id: 'c1r:plaza', r: 1.8 });
      K.examine(4.25, 1.0, -33, ['The windscreen\'s gone white with dew. A parking ticket under the wiper.', 'The date\'s washed off.'], { id: 'c1r:car', r: 1.5 });
      K.examine(2.45, 1.0, -71.8, 'Last collection five pm. It doesn\'t say which day.', { id: 'c1r:letterbox', r: 1.2 });
      K.examine(12.9, 1.4, -53.8, ['Plaza parking. Loading dock round the back.', 'Somebody has to have left a door open round the back.'], { id: 'c1r:parksign', r: 1.4 });
      K.examine(16.2, 1.4, -30, 'For sale. Price on application. The sign\'s older than I am.', { id: 'c1r:forsale', r: 2.2 });
      K.examine(-9.8, 1.2, -183, ['Exchange Road. It just stops. [beat] Past the barrier there\'s nothing. Just white.', 'Somebody put a sign up. Like someone might still come to fix it.'], { id: 'c1r:exdrop', r: 2.2 });
      K.examine(16.5, 1.6, -165.8, 'Hilltop Village. "Independent Living." [beat] Up the hill.', { id: 'c1r:hilltop0', r: 1.6, when: () => !flag('c1_address') });
      K.examine(16.5, 1.6, -165.8, ['Unit 9, Hilltop Village. [beat] She\'s up there.', 'Up the hill. That\'s all it is.'], { id: 'c1r:hilltop1', r: 1.6, when: () => flag('c1_address') });
      K.examine(RL.eastEdge - 0.4, 1.5, -128, ['"The Plaza grows with you." [beat] The paper\'s gone the colour of tea.', 'Every poster on this wall is for something that\'s finished.'], { id: 'c1r:posters', r: 1.3 });
      K.examine(1.8, 1.0, -58.5, 'A Plaza trolley. One wheel\'s jammed sideways. It\'s been here a long time.', { id: 'c1r:trolley', r: 1.2 });
      K.pickup('coffee', 13.3, 0.15 + 0.43, -118.5, { id: 'c1_relay:coffee', extraOnEasy: true, rot: 20 });
    },
    onUpdate(dt) {
      // the high shot at the traffic light sees further: the fog thins while it holds (like the Prologue's Hill Road)
      const f = Render.fog; if (!f) return;
      const c = Cam.current, want = c && c.id === 'c1_relay:junction' ? 0.03 : 0.052;
      if (c !== C1.relayCam) { C1.relayCam = c; f.density = want; } else f.density += (want - f.density) * Math.min(1, dt * 1.5);
    },
    onLeave() { C1.relayCam = null; },
    async onEnter(G, from) {
      if (S.chapter !== 1) return;
      if (G.once('c1:relayNote')) note(G, 'Her address. The old store in the Plaza — maybe the system\'s still in there.', 'c1_obj');
    },
  });

  // Chapter 1 → 2: walking up Hilltop Road after the Plaza (the prologue's pattern: the card as he walks on)
  async function C1_toHilltop(G) {
    if (S.chapter !== 1 || !flag('c1_bossDone')) return;
    note(G, 'Unit 9, Hilltop Village. Hilltop Road, off the top of Relay Street.', 'c1_obj', { done: true });
    const ok = await G.startChapter(2);
    if (ok === false) {
      // (no Chapter 2 in this build: show its card and hand the street back)
      await G.card('HILLTOP VILLAGE');
      await G.fade(0, 1.0);
    }
  }

  // =================================================================================================================
  // 1A THE CAR PARK — 40 × 30 m behind the Plaza's south wall (z = 0). Relay Street is west (the driveway, NW corner);
  // the service lane to the loading dock leaves from the south-east corner. Three abandoned cars; the second Tethered.
  // =================================================================================================================
  defineRoom({
    id: 'c1_carpark', name: 'PLAZA CAR PARK', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },
    bounds: [-1.5, -1, 41.5, 31],
    entries: { street: [1.4, 5.0, 90], dock: [38.4, 27.2, -90], start: [1.4, 5.0, 90] },
    cameras: [
      // from out among the bays, back at the driveway: the empty car park first, then him walking in out of the fog
      { id: 'c1_carpark:entry', vol: [-1.5, 0.2, 12, 19], type: 'pan', pos: [13.6, 3.0, 12.8], target: [4, 0.6, 7], fov: 44, pan: { lag: 0.35, yaw: 75, pitch: 35 } },
      // the car park's own CCTV camera on the Plaza wall, panning after him (a security feed nobody watches)
      { id: 'c1_carpark:wallcam', vol: [12, 0.2, 27.6, 13], type: 'pan', pos: [10.8, 5.5, 0.75], target: [19, 0, 8], fov: 46, pan: { lag: 0.5, yaw: 60, pitch: 55 } },
      // through the chain-link on the south fence, across the trolley bay
      { id: 'c1_carpark:trolleys', vol: [12, 13, 27.6, 30], type: 'static', pos: [31.5, 2.6, 33.2], target: [18.5, 0.5, 20.5], fov: 'fit' },
      // the north-east rows under the lamps
      { id: 'c1_carpark:ne', vol: [27.6, 0.2, 41.5, 11], type: 'static', pos: [31.6, 3.4, 17.6], target: [35.5, 0.4, 4], fov: 'fit' },
      // low between the cars, up the east rows toward the wall
      { id: 'c1_carpark:cars', vol: [27.6, 11, 41.5, 21.5], type: 'static', pos: [22.8, 1.15, 26.2], target: [35.5, 1.0, 14.5], fov: 'fit' },
      // the south-east corner: the service lane round to the dock stays hidden until he's in it
      { id: 'c1_carpark:lane', vol: [27.6, 21.5, 42.4, 30], type: 'static', pos: [30.2, 2.7, 11.5], target: [39, 0.5, 27], fov: 'fit' },
    ],
    spawns: [
      // the second Tethered, beside the wagon in the middle row, facing away from the driveway
      { id: 'c1_carpark:teth', type: 'tethered', pos: [24.2, 17.4], rot: 110, anchor: [24.2, 17.4], cardigan: '#5a634c' },
    ],
    build(K) {
      K.floor(-1.5, 0, 41.5, 30, 'bitumen');
      K.floor(41.5, 23.6, 42.4, 30.2, 'bitumen');                                  // the lane's mouth (the exit)
      // bay lines (white), the driveway arrows, a yellow speed hump, the lane's hatching
      const LINE = { color: '#d9d6cc', roughness: 0.8 }, YEL = { color: '#c9a822', roughness: 0.7 };
      const line = (x, z, w, d, m = LINE) => K.plane(x, 0.007, z, w, d, m, { rot: [-90, 0, 0] });
      for (let x = 6; x <= 38; x += 2.6) { line(x, 2.7, 0.1, 5.2); line(x, 13.6, 0.1, 5.0); line(x, 18.6, 0.1, 5.0); line(x, 27.2, 0.1, 5.2); }
      line(22, 16.1, 32.2, 0.1); line(22, 24.6, 32.2, 0.08);
      K.plane(3.2, 0.008, 5, 1.2, 3.4, YEL, { rot: [-90, 0, 0] });
      for (let k = 0; k < 6; k++) K.plane(39.4, 0.008, 24.4 + k, 3.6, 0.22, YEL, { rot: [-90, 0, 35] });
      K.box(1.4, 0, 5.0, 0.35, 0.06, 7.6, YEL);
      K.dress('leaves', [0, 0, 40, 30], 90, { seed: 21 });
      K.dress('papers', [2, 2, 38, 28], 12, { seed: 22 });

      // ---- the Plaza's south wall (north side): blank tilt-up, a fire exit, a goods roller door, lamps, a painted sign --
      const FAC = { tex: 'concrete', color: '#8e877a' };
      K.wall(-1.5, -0.15, 41.5, -0.15, 6.5, FAC, { thick: 0.3, openings: [{ at: 15.5, w: 1.0, h: 2.1 }, { at: 29.5, w: 3.4, h: 3.0 }], grime: true });
      K.door({ id: 'c1_carpark:fireexit', x: 14, z: -0.15, rot: 0, w: 0.95, style: 'fire', locked: true, lockMsg: 'It won\'t open from this side.', window: false });
      K.door({ id: 'c1_carpark:goods', x: 28, z: -0.15, rot: 0, w: 3.2, h: 2.9, style: 'roller', locked: true, lockMsg: 'It\'s locked.' });
      for (let x = 2; x < 41; x += 8.5) K.box(x, 0, 0.02, 0.25, 6.5, 0.12, { tex: 'concrete', color: '#857e70' });
      K.sign('STAFF PARKING ONLY', 6.5, 2.4, 0.03, 2.6, 0.5, { style: 'council', bg: '#e8e2cc', fg: '#8a1f1a' });
      K.sign('FIRE EXIT\nDO NOT OBSTRUCT', 14, 2.55, 0.03, 0.9, 0.36, { style: 'council', bg: '#1f6b3c', fg: '#f2f4ee' });
      K.writing('WHO ARE YOU TRYING TO REACH', 21.5, 1.6, 0.03, 2.8, { world: 'fog' });
      for (const [x, on] of [[9, true], [21, false], [35, true]]) {
        K.box(x, 4.2, 0.15, 0.36, 0.18, 0.3, { tex: 'metal', color: '#3a3f3d' });
        if (on) K.light('street', x, 4.1, 0.45, { haloSize: 1.6, intensity: 20, distance: 12, bank: 1 });
      }
      // ---- the other edges: fence to the vacant lot (west), chain-link and scrub (south), a retaining wall (east) ------
      K.collider(-2, 9.2, -1.4, 31, { h: 3 }); K.collider(-2, -1, -1.4, 0.6, { h: 3 });
      for (let z = 12; z < 30; z += 6) K.prop('fence', -1.45, z, 90, { variant: 'colorbond', len: 6 });
      K.prop('fence', -1.45, 10.2, 90, { variant: 'colorbond', len: 2 });
      K.collider(-1.5, 30, 42, 31, { h: 3 });
      for (let x = 1.5; x < 40; x += 5) K.prop('chainlink', x, 30.1, 0, { len: 5 });
      K.prop('shrub', 8, 31.4, 0, { w: 2, h: 1.4, collide: false }); K.prop('shrub', 26, 31.6, 0, { w: 1.6, h: 1.2, dead: true, collide: false });
      K.prop('gum_tree', 16, 34, 0, {}); K.prop('gum_tree_small', 33, 33, 0, {});
      K.collider(41.5, -1, 43, 23.6, { h: 3 });
      K.box(42.2, 0, 11.3, 1.4, 1.8, 23.2, { tex: 'concrete', color: '#7d776c' });
      K.box(41.55, 1.8, 11.3, 0.1, 0.9, 23.2, { tex: 'metal', color: '#6d726c' });

      // ---- the driveway back out to Relay Street ---------------------------------------------------------------------
      K.exit({ id: 'c1_carpark:street', box: [-1.5, 0.6, -0.8, 9.2], to: 'c1_relay', entry: 'carpark' });
      K.prop('sign_post', 1.2, 9.9, 20, { style: 'council', text: 'PLAZA PARKING\n2P  8AM–6PM', w: 0.8, h: 0.45 });
      K.prop('bollard', 0.6, 0.9, 0, {}); K.prop('bollard', 0.6, 9.4, 0, {});

      // ---- three abandoned cars, a pay station, a trolley bay, two light poles, planter islands -------------------------
      K.prop('car', 8.6, 2.9, 90, { color: '#7a3a2a' });
      K.prop('car', 21.3, 18.6, -90, { color: '#8a8478', variant: 'wagon' });
      K.prop('hatchback', 33.4, 27.4, -90, { color: '#5b6b70', plate: 'ADN·226' });
      K.dress('papers', [20, 16.5, 23, 21], 5, { seed: 23 });
      // the pay station
      K.box(4.6, 0, 11.4, 0.5, 1.45, 0.35, { tex: 'metal', color: '#2f4346' }, { collide: true });
      K.box(4.6, 1.45, 11.4, 0.6, 0.08, 0.45, { tex: 'metal', color: '#1f2a2b' });
      K.plane(4.6, 1.15, 11.23, 0.26, 0.14, { color: '#101412', roughness: 0.2 }, { rot: [0, 180, 0] });
      K.sign('PAY HERE', 4.6, 1.65, 11.2, 0.5, 0.16, { rotY: 180, style: 'shop', bg: '#1d3d4a', fg: '#e6dfc9', back: false });
      // the trolley bay: a shelter with a chain of trolleys
      for (const x of [15.4, 20.6]) K.box(x, 0, 27.2, 0.08, 2.2, 0.08, { tex: 'metal', color: '#6d726c' }, { collide: true });
      K.box(18, 2.2, 27.2, 5.6, 0.08, 1.6, { tex: 'metal', color: '#4e5a55' });
      K.sign('TROLLEY BAY', 18, 2.5, 26.4, 1.4, 0.26, { style: 'shop', bg: '#b3261e', fg: '#f4efe4' });
      for (let k = 0; k < 4; k++) K.prop('trolley', 16.4 + k * 0.62, 27.2, 180, { collide: false });
      K.collider(15.8, 26.6, 18.9, 27.9, { h: 1.1 });
      K.prop('trolley', 12.4, 22.8, 140, {});
      K.prop('floodlight', 12, 16.1, 180, { variant: 'pole', lit: false });
      K.prop('floodlight', 29.3, 16.1, 0, { variant: 'pole', bank: 2 });
      for (const [x, z] of [[4, 16.1], [38.8, 16.1]]) { K.box(x, 0, z, 2.2, 0.18, 1.2, 'kerb', { collide: true }); K.prop('gum_tree_small', x, z, 0, { y: 0.18, h: 3.2 }); }
      // the landscaped bed in the south-west corner (overgrown: shrubs, two gums, a kerb)
      K.collider(-1.5, 19.2, 12, 30, { h: 2.5 });
      K.box(5.25, 0, 19.3, 13.5, 0.2, 0.2, 'kerb'); K.box(12.0, 0, 24.6, 0.2, 0.2, 10.8, 'kerb');
      K.box(5.25, 0.02, 24.6, 13.3, 0.2, 10.6, { tex: 'dirt', color: '#5a5040' });
      for (const [x, z, w, h, dead] of [[1, 21, 2.2, 1.5, false], [4.2, 22.6, 1.8, 1.2, true], [8.4, 21.2, 2.4, 1.6, false], [10.6, 26.5, 1.6, 1.1, false], [2.6, 27.4, 2.0, 1.4, true], [6.6, 28, 2.2, 1.3, false]]) K.prop('shrub', x, z, 0, { w, h, dead, collide: false, y: 0.2 });
      K.prop('gum_tree', 4.5, 25.5, 30, { y: 0.2 }); K.prop('gum_tree_small', 9.5, 23.6, 0, { y: 0.2 });
      K.dress('leaves', [0, 19.5, 11.8, 29.5], 50, { seed: 24, y: 0.23 });
      K.prop('cctv_camera', 10.8, 0.02, 20, { variant: 'bullet', mount: 5.45 });
      K.prop('bin', 30.4, 1.2, 0, { variant: 'wheelie', lid: '#2f5a3a' });
      K.prop('bin', 31.2, 1.2, 0, { variant: 'wheelie', lid: '#8f2a22' });
      // the lane round to the loading dock
      K.prop('sign_post', 37.9, 22.9, -30, { style: 'council', text: 'LOADING DOCK\nDELIVERIES ONLY', bg: '#e8e2cc', fg: '#1d1d1d', w: 0.95, h: 0.5 });
      K.prop('boom_gate', 40.6, 23.5, 90, { open: 1 });
      K.exit({ id: 'c1_carpark:dock', box: [41.8, 23.8, 42.4, 30], to: 'c1_dock', entry: 'carpark' });

      // ---- examine ------------------------------------------------------------------------------------------------------
      K.examine(8.6, 1.1, 2.9, ['A sun shade still up in the windscreen.', 'Nobody\'s needed a sun shade up here in years.'], { id: 'c1c:car1', r: 1.8 });
      K.examine(21.3, 1.1, 18.6, ['A child seat in the back. A juice box in the cup holder.', 'The doors aren\'t even locked.'], { id: 'c1c:car2', r: 1.8 });
      K.examine(33.4, 1.0, 27.4, ['Same model as mine. Same colour.', 'It\'s not mine. [beat] It\'s not mine.'], { id: 'c1c:car3', r: 1.8 });
      K.examine(4.6, 1.2, 11.2, ['Pay and display. Two dollars an hour.', 'The screen\'s dead. So\'s the coin slot.'], { id: 'c1c:pay', r: 1.3 });
      K.examine(18, 1.0, 26.6, 'Four trolleys chained together. A coin frees one. Nobody\'s come back for the coins.', { id: 'c1c:trolleys', r: 1.6 });
      K.examine(29.3, 1.4, 16.1, 'The light\'s still on. There\'s nobody to see by it.', { id: 'c1c:pole', r: 1.3 });
      K.examine(6.5, 1.6, 0.6, ['Staff parking. Every space empty.', 'They all stopped coming at once.'], { id: 'c1c:staffsign', r: 2.0 });
      K.examine(21.5, 1.6, 0.6, 'Somebody wrote it in marker and somebody else tried to scrub it off.', { id: 'c1c:writing', r: 1.8 });
      K.examine(37.9, 1.5, 22.9, ['Loading dock. Deliveries only.', 'There\'s always a door open round the back of a centre. Always.'], { id: 'c1c:docksign', r: 1.5 });
      K.pickup('coffee', 4.6, 1.53, 11.4, { id: 'c1_carpark:coffee', extraOnEasy: true, rot: 30 });
    },
  });

  // =================================================================================================================
  // 1B THE LOADING DOCK — 20 × 12 m. The raised dock platform (y 1.2) along the building (north, z 0…5) with a roller
  // door jammed half up and the goods-in door propped open (→ the service corridor); the apron below (z 5…12) runs out
  // west to the car park lane. Stairs at the east end.
  // =================================================================================================================
  const DK = { py: 1.2 };
  defineRoom({
    id: 'c1_dock', name: 'LOADING DOCK', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: true, surface: 'concrete', ambient: 'wind',
    fog: { density: 0.045 },
    surfaces: [{ box: [0, 0, 20, 5], s: 'concrete' }, { box: [16.4, 5, 18.4, 7.5], s: 'metal' }],
    bounds: [-1.2, -0.5, 20.5, 12.6],
    entries: { carpark: [0.6, 8.6, 90], corridor: [15.5, 1.3, 180], start: [0.6, 8.6, 90] },
    cameras: [
      // from the east end of the apron back toward the lane: the dock seen side-on
      { id: 'c1_dock:entry', vol: [-1.2, 5, 8.6, 12.6], type: 'static', pos: [17.6, 3.1, 11.8], target: [3.6, 0.7, 7.4], fov: 'fit' },
      // high over the roller door, looking down across the apron to the stairs
      { id: 'c1_dock:apron', vol: [8.6, 5, 20.5, 12.6], type: 'static', pos: [5.3, 3.85, 1.05], target: [15.2, 0.3, 9.4], fov: 'fit' },
      { id: 'c1_dock:door', vol: [15.3, -0.5, 20.5, 5], y: [0.8, 2.5], pri: 1, type: 'static', pos: [5.3, 3.85, 1.05], target: [17.2, 1.4, 2.4], fov: 'fit' },
      // low between the pallets on the platform, looking along it toward the open door
      { id: 'c1_dock:platform', vol: [-1.2, -0.5, 15.3, 5], y: [0.8, 2.5], pri: 1, type: 'static', pos: [19.4, 2.25, 4.4], target: [6.5, 1.3, 2.2], fov: 'fit' },
    ],
    build(K) {
      const py = DK.py;
      K.floor(-1.2, 5, 20.5, 12.6, 'concrete');
      K.floor(-1.2, -0.5, 20.5, 5, { tex: 'concrete', color: '#9a978e' }, { y: py });
      K.stairs(16.5, 7.5, 18.3, 5.0, 0, py, { axis: 'z', rail: 'both', mat: 'concrete' });
      // the platform edge: hazard stripes, rubber bumpers, a dock leveller in front of the roller door
      const stripes = C1_tex('hazard', 128, 16, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#141414' : '#d8b928'; x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, h); x.lineTo(i * 16 - 8, h); x.fill(); } }, { wrap: true });
      K.plane(8.1, py + 0.004, 4.93, 16.4, 0.14, stripes, { rot: [-90, 0, 0] });
      for (const x of [3.3, 6.7, 11.5]) K.box(x, py - 0.55, 5.06, 0.28, 0.45, 0.14, { color: '#161616', roughness: 0.9 });
      K.box(5, py, 3.9, 2.8, 0.03, 2.1, { tex: 'metal_grating', color: '#6d726c' });
      // the building: the back wall with the roller door jammed half up and the goods-in door, the canopy, lamps
      const BW = { tex: 'concrete', color: '#857e70' };
      K.wall(-1.2, -0.15, 20.5, -0.15, 5.8, BW, { thick: 0.3, y: 0, openings: [{ at: 6.2, w: 3.2, h: 4.0 }, { at: 16.7, w: 1.0, h: 3.3 }], grime: true });
      K.door({ id: 'c1_dock:roller', x: 5, z: -0.15, y: py, rot: 0, w: 3.0, h: 2.8, style: 'roller', open: 0.48 });
      K.blocker(3.4, -0.2, 6.6, 0.25, 'It\'s jammed halfway. I\'m not crawling under it.');
      K.box(5, py, -1.6, 3.4, 2.8, 0.1, { color: '#070808', roughness: 1 });                    // dark behind the gap
      K.box(5, py, -0.9, 3.4, 0.02, 1.4, { tex: 'concrete', color: '#4a4842' });
      K.door({ id: 'c1_dock:door', x: 15.5, z: -0.15, y: py, rot: 0, w: 0.95, style: 'metal', to: 'c1_corridor', entry: 'dock', open: 0.72, sign: 'GOODS IN' });
      K.box(15.5, py, -0.7, 1.2, 2.1, 0.05, { color: '#0a0b0b', roughness: 1 });
      K.box(15.05, py, 0.42, 0.14, 0.06, 0.1, { tex: 'wood', color: '#7a6040' }, { rot: 20 });            // the wedge
      K.box(8.8, 4.3, 2.4, 20.6, 0.14, 5.4, { tex: 'metal', color: '#6a6f6c' });                  // canopy
      for (const x of [-0.8, 8.8, 18.6]) K.box(x, 0, 5.05, 0.18, 4.3, 0.18, { tex: 'metal', color: '#5d625f' }, { collide: true });
      K.light('fluoro', 15.5, 3.9, 1.0, { len: 1.2, bank: 1, flicker: true, distance: 8, intensity: 6 });
      K.light('fluoro', 5, 4.15, 2.2, { len: 1.2, bank: 1, on: false });
      K.sign('LOADING DOCK 2', 10.6, 3.2, 0.02, 2.2, 0.45, { style: 'council', bg: '#e8e2cc', fg: '#1d1d1d' });
      K.sign('NO STANDING\nTRUCKS ONLY', 1.6, 2.4, 0.02, 0.9, 0.5, { style: 'council', bg: '#e8e2cc', fg: '#8a1f1a' });
      // pallets, the flattened box pile, a cage trolley, crates, the skip
      K.prop('pallet', 2.2, 2.4, 8, { y: py, load: 'wrapped' });
      K.prop('pallet', 2.4, 3.9, -4, { y: py, n: 3 });
      K.prop('pallet', 9.4, 1.4, 90, { y: py, load: 'boxes' });
      K.prop('pallet', 12.4, 3.4, 15, { y: py, n: 2, load: 'boxes' });
      K.prop('box_stack', 11.4, 1.2, 0, { y: py, n: 6 });
      const CB = { tex: 'cardboard', color: '#b9a07a' };
      for (let k = 0; k < 7; k++) K.box(7.3 + (k % 2) * 0.1, py + k * 0.045, 3.4, 1.3 - k * 0.04, 0.045, 0.9, CB, { rot: k * 7 - 20 });
      K.box(7.9, py, 1.9, 0.08, 1.05, 1.2, CB, { rot: 12 });
      K.prop('box', 7.1, 2.3, 30, { y: py, open: true, text: 'RETURNS' });
      K.prop('pallet', 6.4, 9.6, 30, {});
      K.prop('pallet', 7.2, 10.8, 12, { n: 4 });
      K.prop('dumpster', 12.5, 11.3, 180, {});
      K.prop('esky', 2.2, 11.4, 70, {});
      K.dress('boxes', [9.5, 6.5, 15, 10.2], 6, { seed: 31 });
      K.dress('leaves', [-1, 5.3, 20, 12.4], 60, { seed: 32 });
      K.dress('papers', [0, 0, 14, 4.6], 8, { seed: 33, y: py + 0.002 });
      K.writing('FOLLOW UP TOMORROW', 11.2, 1.9, 0.03, 2.2, { world: 'fog' });
      // the edges: the lane to the car park (west, open), a brick wall south, a fence east
      K.collider(-1.2, 12.6, 20.5, 13.4, { h: 3 });
      K.box(9.6, 0, 12.8, 22, 2.6, 0.3, 'brick');
      K.collider(20.5, -0.5, 21.4, 12.6, { h: 3 });
      K.box(20.8, 0, 6, 0.3, 2.2, 13, { tex: 'metal', color: '#6d726c' });
      K.collider(-1.8, -0.5, -1.1, 5, { h: 4 });
      K.exit({ id: 'c1_dock:carpark', box: [-1.2, 5.1, -0.7, 12.5], to: 'c1_carpark', entry: 'dock' });
      K.light('street', -4, 5.6, 9, { real: false, haloSize: 3.2, haloOpacity: 0.4 });
      // examine
      K.examine(5, py + 1.0, 0.4, ['Jammed halfway up. Black underneath.', 'Something in there smells like wet cardboard.'], { id: 'c1d:roller', r: 1.8 });
      K.examine(15.5, py + 1.3, 0.3, 'Somebody wedged it open. On purpose.', { id: 'c1d:door', r: 1.2, when: () => !done('c1:dockin') });
      K.examine(7.4, py + 0.5, 3.0, ['Flattened boxes, stacked for the recycler. Every store has one of these piles.', 'Chargers. Cases. Screen protectors. [beat] I know these boxes.'], { id: 'c1d:boxes', r: 1.5 });
      K.examine(2.3, py + 1.0, 3.1, ['Stock on a pallet, still wrapped.', 'Delivered. Signed for. Never unpacked.'], { id: 'c1d:pallet', r: 1.6 });
      K.examine(12.5, 1.2, 11.3, 'The skip\'s full of packaging. Nobody\'s come to empty it.', { id: 'c1d:skip', r: 1.8 });
      K.examine(10.6, py + 1.8, 0.3, 'Loading Dock 2. I haven\'t seen a Dock 1.', { id: 'c1d:sign', r: 1.8 });
      K.examine(2.2, 0.6, 11.4, 'An esky. Empty except for a bottle of water and an ice brick gone warm.', { id: 'c1d:esky', r: 1.3 });
      K.examine(11.2, py + 1.3, 0.4, 'In marker, at eye level. Somebody meant it for whoever came through here.', { id: 'c1d:writing', r: 1.6 });
    },
    async onEnter(G) { if (S.chapter === 1) S.done['c1:dockin'] = true; },
  });

  // =================================================================================================================
  // 1B THE SERVICE CORRIDOR — 40 × 3 m along the Plaza's south side. x west → east, z 0 (the concourse side) … 3.
  // Doors: the loading dock (east end), security (south, x 31), the staff room (south, x 13, locked: staff_key), the
  // fire door into the concourse (north, x 5). Tubes every 5 m, one flickering, two dead; a mop bucket; the bundy clock.
  // The south wall is drawn from the inside only, so the long rail camera can track him from beyond it.
  // =================================================================================================================
  const CO = { h: 2.7 };
  defineRoom({
    id: 'c1_corridor', name: 'SERVICE CORRIDOR', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'lino', ambient: 'interior',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 40, 3],
    entries: { dock: [38.9, 1.5, -90], security: [31, 2.15, 180], staff: [13, 2.15, 180], concourse: [5, 0.85, 0], start: [38.9, 1.5, -90] },
    cameras: [
      // the long rail down its length, from beyond the (cutaway) south wall — the doors pass in the foreground
      { id: 'c1_corridor:rail', vol: [0, 0, 40, 3], type: 'rail', pos: [20, 2.05, 6.6], fov: 48, rail: { a: [1.6, 2.05, 6.6], b: [38.4, 2.05, 6.6], look: [0, 1.0, -0.2], lag: 0.4 } },
      // a static from each end, straight down the corridor
      { id: 'c1_corridor:east', vol: [24.5, 0, 35.4, 3], pri: 1, type: 'static', pos: [39.75, 2.4, 0.45], target: [22, 0.95, 1.9], fov: 'fit' },
      { id: 'c1_corridor:west', vol: [4.6, 0, 15.6, 3], pri: 1, type: 'static', pos: [0.3, 2.4, 2.6], target: [18, 0.95, 1.1], fov: 'fit' },
    ],
    build(K) {
      const H = CO.h;
      K.floor(0, 0, 40, 3, { tex: 'lino', color: '#8b8f86' });
      K.ceiling(0, 0, 40, 3, H);
      const WM = 'plaster_stained';
      // north wall (the concourse side): the fire door at x 5
      K.wall(-0.075, -0.075, 40.075, -0.075, H, WM, { openings: [{ at: 5.075, w: 1.0, h: 2.15 }], skirting: '#4a4a44' });
      // south wall, drawn from the inside only (cutaway for the rail): security at x 31, the staff room at x 13
      K.wall(40.075, 3.075, -0.075, 3.075, H, WM, { both: false, openings: [{ at: 9.075, w: 0.95, h: 2.15 }, { at: 27.075, w: 0.95, h: 2.15 }], skirting: '#4a4a44' });
      K.wall(0, -0.075, 0, 3.075, H, WM);
      K.wall(40, 3.075, 40, -0.075, H, WM, { openings: [{ at: 1.575, w: 1.0, h: 2.15 }] });
      // the void past the cutaway wall (visual only): a dark slab so the rail never sees nothing
      K.plane(20, -0.01, 5.2, 42, 4.4, { color: '#141615', roughness: 1 }, { rot: [-90, 0, 0] });
      // doors
      K.door({ id: 'c1_corridor:dock', x: 40, z: 1.5, rot: 90, w: 0.95, style: 'metal', to: 'c1_dock', entry: 'corridor', sign: 'LOADING DOCK', signBack: 'GOODS IN' });
      K.door({ id: 'c1_corridor:security', x: 31, z: 3.075, rot: 0, w: 0.9, style: 'wood', to: 'c1_security', entry: 'door', sign: 'SECURITY', color: '#d8d0bc' });
      K.door({ id: 'c1_corridor:staff', x: 13, z: 3.075, rot: 0, w: 0.9, style: 'wood', to: 'c1_staffroom', entry: 'door', locked: true, key: 'staff_key', lockMsg: 'It\'s locked.', sign: 'STAFF ROOM', color: '#d8d0bc' });
      const fire = K.door({ id: 'c1_corridor:fire', x: 5, z: -0.075, rot: 180, w: 0.95, style: 'fire', to: 'c1_concourse', entry: 'fire', when: () => !ringing() });
      void fire;
      // tubes: a real light every other one, one flickering (x 22.5), two dead
      const tubes = [[2.5, 'on'], [7.5, 'glow'], [12.5, 'on'], [17.5, 'dead'], [22.5, 'flick'], [27.5, 'glow'], [32.5, 'on'], [37.5, 'dead']];
      tubes.forEach(([x, st], i) => {
        if (st === 'dead') K.light('fluoro', x, H - 0.02, 1.5, { len: 1.2, rot: 90, on: false });
        else K.light('fluoro', x, H - 0.02, 1.5, { len: 1.2, rot: 90, bank: 1 + (i >> 1), real: st !== 'glow', flicker: st === 'flick', intensity: 6, distance: 8 });
      });
      K.light('led', 39.9, 2.35, 0.5, { color: '#2aff5a', intensity: 2 });
      K.prop('exit_sign', 0.08, 1.5, 90, { mount: 2.35 });
      // along the north wall: the mop bucket and wet-floor sign, a cleaner's trolley, boxes, a fire hose reel
      K.prop('mop_bucket', 20.2, 0.45, 20, { sign: true });
      K.prop('wet_floor_sign', 21.4, 0.9, -30, {});
      K.prop('box_stack', 34.8, 0.4, 0, { n: 4 });
      K.prop('pallet', 36.8, 0.65, 90, { load: 'wrapped' });
      K.box(9.5, 0.9, 0.05, 0.7, 0.8, 0.22, { color: '#8a1f1a', roughness: 0.5 });
      K.sign('FIRE HOSE REEL', 9.5, 1.85, 0.17, 0.6, 0.16, { style: 'shop', bg: '#8a1f1a', fg: '#f4efe4', back: false });
      K.cyl(9.5, 1.05, 0.2, 0.26, 0.12, { color: '#9e2a20', roughness: 0.5 }, { rx: 90 });
      K.prop('fuse_board', 26.4, 0.08, 0, { mount: 1.5, collide: false });
      K.sign('STAFF ONLY\nBEYOND THIS POINT', 38.2, 1.7, 0.02, 0.9, 0.44, { style: 'council', bg: '#e8e2cc', fg: '#8a1f1a' });
      // the bundy clock and card rack, the staff noticeboard (north wall: the south wall is the rail's cutaway)
      K.box(15.3, 1.1, 0.07, 0.34, 0.44, 0.22, { color: '#d8d4c4', roughness: 0.5 });
      K.plane(15.3, 1.37, 0.185, 0.16, 0.16, C1_tex('bundy', 128, 128, (x, w, h) => { x.fillStyle = '#efece0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 4; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4); } x.lineWidth = 5; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.sin(8.98 / 12 * Math.PI * 2) * 30, 64 - Math.cos(8.98 / 12 * Math.PI * 2) * 30); x.stroke(); x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.sin(59 / 60 * Math.PI * 2) * 44, 64 - Math.cos(59 / 60 * Math.PI * 2) * 44); x.stroke(); }), {});
      K.box(16.2, 0.9, 0.05, 0.5, 0.7, 0.1, { tex: 'metal', color: '#9aa09e' });
      for (let k = 0; k < 12; k++) K.box(15.99 + (k % 6) * 0.08, 1.02 + Math.floor(k / 6) * 0.3, 0.1, 0.06, 0.22, 0.005, { color: '#ece6c8', roughness: 0.9 });
      K.prop('corkboard', 29.5, 0.0, 0, { w: 1.6, h: 0.9, mount: 1.55 });
      K.prop('bin', 26.8, 2.7, 180, { variant: 'wheelie', lid: '#2f5a3a' });
      K.writing('IT\'LL BE FINE', 6.8, 1.55, 0.01, 1.3, { world: 'fog' });
      K.dress('papers', [1, 0.3, 39, 2.7], 9, { seed: 41 });
      K.dress('receipts', [18, 0.3, 30, 2.7], 6, { seed: 42 });
      // examine
      K.examine(20.4, 0.7, 0.5, ['A mop bucket. The water\'s gone grey and still.', 'Somebody was halfway through the floor.'], { id: 'c1co:mop', r: 1.4 });
      K.examine(15.6, 1.3, 0.35, ['A bundy clock. Every card on the rack says 8:59, clocked on.', 'Not one of them clocked off.'], { id: 'c1co:bundy', r: 1.3 });
      K.examine(29.5, 1.5, 0.3, ['The roster. Every shift says "until close".', 'A flyer for a staff barbecue. Nobody\'s written their name on it.'], { id: 'c1co:roster', r: 1.4 });
      K.examine(26.4, 1.5, 0.2, 'The breakers are all on. Nothing\'s running.', { id: 'c1co:fuse', r: 1.3 });
      K.examine(34.8, 0.8, 0.5, ['Boxes from the dock. Nobody finished bringing them in.', 'The tape\'s never been cut.'], { id: 'c1co:boxes', r: 1.4 });
      K.examine(22.5, 2.4, 1.5, 'The tube keeps trying. Like it\'s swallowing something.', { id: 'c1co:tube', r: 1.6 });
      K.examine(6.8, 1.5, 0.3, 'Faded marker. Somebody wrote it here, then somebody painted over it. It came through anyway.', { id: 'c1co:writing', r: 1.3 });
      // while the payphone rings, he won't leave for the fire door (the game waits for the call)
      K.interact(5, 1.0, 0.1, async (G) => { await G.think('That phone. [beat] It\'s ringing for me. I know it is.'); }, { id: 'c1co:ringing', r: 1.3, when: () => ringing() });
    },
    async onEnter(G, from) {
      // CALL 1: leaving the staff room the first time
      if (from === 'c1_staffroom' && S.chapter === 1 && G.once('c1:luka1')) {
        await G.wait(1.4);
        await G.call('luka1');
      }
    },
  });

  // ---- the security office's CCTV feeds (six grainy black-and-white views; CAM 03 has the figure outside the store) ----
  const CCTV_VIEWS = ['CARPARK', 'DOCK', 'CONCOURSE E', 'FOOD COURT', 'CORRIDOR', ''];
  function C1_cctvBase(n) {
    return C1_tex('cctv' + n + (n === 3 ? '' : ''), 192, 144, (x, w, h, r) => {
      x.fillStyle = '#1c1e1d'; x.fillRect(0, 0, w, h);
      const shade = (pts, c) => { x.fillStyle = c; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.fill(); };
      if (n === 6) { x.fillStyle = '#1b2a6a'; x.fillRect(0, 0, w, h); tx(x, 'NO SIGNAL', w / 2, h / 2 + 5, 16, '#e8e8f0', { font: FN.mono, align: 'center', weight: 'bold' }); return; }
      if (n === 1) { // car park: bays from above
        x.fillStyle = '#3c3e3d'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#a9aba6'; x.lineWidth = 1.5; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(20 + i * 22, 40); x.lineTo(10 + i * 26, 100); x.stroke(); }
        shade([[70, 60], [100, 58], [104, 88], [66, 90]], '#232524'); shade([[132, 70], [160, 68], [165, 100], [128, 102]], '#2b2d2c');
        x.fillStyle = 'rgba(230,230,220,0.45)'; x.beginPath(); x.arc(150, 30, 8, 0, Math.PI * 2); x.fill();
      } else if (n === 2) { // the dock: roller door half up
        shade([[0, h], [w, h], [w, 90], [0, 90]], '#4a4d4b'); shade([[20, 20], [110, 20], [110, 90], [20, 90]], '#5a5c5a');
        shade([[26, 54], [104, 54], [104, 90], [26, 90]], '#080909');
        for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(26, 22 + i * 4, 78, 1); }
        shade([[130, 60], [170, 60], [170, 92], [130, 92]], '#3a3c3a');
      } else { // corridors / concourse / food court: a perspective sketch
        const vx = w * 0.52, vy = h * 0.42;
        shade([[0, h], [w, h], [vx + w * 0.07, vy + h * 0.06], [vx - w * 0.07, vy + h * 0.06]], '#4a4d4b');
        shade([[0, 0], [vx - w * 0.07, vy - h * 0.07], [vx - w * 0.07, vy + h * 0.06], [0, h]], '#363837');
        shade([[w, 0], [vx + w * 0.07, vy - h * 0.07], [vx + w * 0.07, vy + h * 0.06], [w, h]], '#2e302f');
        shade([[0, 0], [w, 0], [vx + w * 0.07, vy - h * 0.07], [vx - w * 0.07, vy - h * 0.07]], '#3d3f3e');
        x.fillStyle = '#0c0d0d'; x.fillRect(vx - w * 0.07, vy - h * 0.07, w * 0.14, h * 0.13);
        if (n === 3) { // the only lit shopfront, at the end on the left
          shade([[vx - w * 0.25, vy - h * 0.2], [vx - w * 0.09, vy - h * 0.09], [vx - w * 0.09, vy + h * 0.07], [vx - w * 0.25, vy + h * 0.16]], '#d8d8cc');
          shade([[vx - w * 0.23, vy - h * 0.16], [vx - w * 0.11, vy - h * 0.08], [vx - w * 0.11, vy + h * 0.05], [vx - w * 0.23, vy + h * 0.12]], '#f4f4ea');
        }
        if (n === 4) for (let i = 0; i < 5; i++) { x.fillStyle = '#26282a'; x.beginPath(); x.ellipse(40 + i * 28, 110 - (i % 2) * 14, 12, 5, 0, 0, Math.PI * 2); x.fill(); x.fillRect(39 + i * 28, 110 - (i % 2) * 14, 2, 14); }
        for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(210,210,200,0.5)'; const t = 0.2 + i * 0.2; x.fillRect(U.lerp(w * 0.1, vx - w * 0.02, t), U.lerp(h * 0.02, vy - h * 0.065, t), U.lerp(w * 0.3, w * 0.03, t), 2); }
      }
      const id = x.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3 + (r() - 0.5) * 36; d[i] = d[i + 1] = d[i + 2] = clamp(v, 0, 255); }
      x.putImageData(id, 0, 0);
    });
  }
  // paint one feed: its base picture, the figure (CAM 03, until he has looked away), scanlines, noise, the caption
  function C1_cctvPaint(ctx, w, h, n, t, figure) {
    const base = C1_cctvBase(n);
    ctx.drawImage(base.image, 0, 0, w, h);
    if (figure) { // a hunched figure in a cardigan, head bowed, standing outside the lit store
      const fx = w * 0.3, fy = h * 0.66, s = 1;
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath(); ctx.ellipse(fx, fy - 17 * s, 3.2 * s, 3.6 * s, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - 5 * s, fy - 14 * s); ctx.quadraticCurveTo(fx + 1, fy - 17 * s, fx + 6 * s, fy - 12 * s); ctx.lineTo(fx + 5 * s, fy - 2 * s); ctx.lineTo(fx - 5 * s, fy - 2 * s); ctx.fill();
      ctx.fillRect(fx - 3.5 * s, fy - 2 * s, 2.2 * s, 9 * s); ctx.fillRect(fx + 1.3 * s, fy - 2 * s, 2.2 * s, 9 * s);
      ctx.fillRect(fx + 5 * s, fy - 8 * s, 3 * s, 3 * s);
      ctx.fillStyle = 'rgba(10,10,10,0.35)'; ctx.fillRect(fx - 6, fy + 7, 12, 1.5);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = (t * 40) % 3; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    for (let k = 0; k < 90; k++) { const v = (Math.random() * 255) | 0; ctx.fillStyle = `rgba(${v},${v},${v},0.35)`; ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
    if (Math.random() < 0.08) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, Math.random() * h, w, 3 + Math.random() * 6); }
    if (n !== 6) {
      tx(ctx, `CAM 0${n}  ${CCTV_VIEWS[n - 1]}`, 6, 12, 9, '#e8e8e0', { font: FN.mono });
      tx(ctx, '30/09 20:59:0' + (n % 10), w - 6, h - 6, 9, '#e8e8e0', { font: FN.mono, align: 'right' });
    }
  }

  // =================================================================================================================
  // 1C THE SECURITY OFFICE — 8 × 6 m, door north (x 4). The CCTV bank on the east wall (the steel bar leaning on it),
  // the key register desk (staff room key, the Plaza Directory), coffee on the filing cabinet, sticker03 under the desk.
  // =================================================================================================================
  const SO = { h: 2.7, bank: [7.42, 3.0] };
    defineRoom({
    id: 'c1_security', name: 'SECURITY OFFICE', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.032, color: '#394240' },
    bounds: [0, 0, 8, 6],
    entries: { door: [4, 0.85, 0], start: [4, 0.85, 0] },
    cameras: [
      // high corner (south-west), over the room to the monitor bank
      { id: 'c1_security:high', vol: [4, 0, 8, 3.2], type: 'static', pos: [0.35, 2.5, 5.62], target: [5.9, 0.7, 1.5], fov: 'fit' },
      // the office's own ceiling camera (north-east corner): the shot framed as its CCTV feed, grainy black and white
      { id: 'c1_security:cctv', vol: [0, 2.4, 4.6, 6], type: 'static', pos: [7.62, 2.55, 0.4], target: [2.4, 0.45, 4.3], fov: 'fit' },
      // from the south-east corner, past the monitors, back to the door and the key register
      { id: 'c1_security:desk', vol: [0, 0, 4, 2.4], type: 'static', pos: [7.55, 2.2, 5.6], target: [1.8, 0.8, 1.0], fov: 'fit' },
      // from beside the door, down across the desk to the monitor bank (the feeds in frame)
      { id: 'c1_security:bank', vol: [4.6, 3.2, 8, 6], type: 'static', pos: [0.4, 2.1, 0.4], target: [6.6, 0.95, 4.3], fov: 'fit' },
    ],
    build(K) {
      const H = SO.h;
      K.roomBox(0, 0, 8, 6, { h: H, floor: { tex: 'lino', color: '#7d8279' }, wall: 'plaster_stained', ceiling: 'ceiling_tile', doors: [{ side: 'n', at: 4, w: 0.95 }], skirting: '#3a3935' });
      K.door({ id: 'c1_security:door', x: 4, z: -0.075, rot: 180, w: 0.9, style: 'wood', to: 'c1_corridor', entry: 'security', color: '#d8d0bc', sign: 'SECURITY' });
      // light: one tube, and the monitors' glow
      K.light('fluoro', 4, H - 0.02, 2.2, { len: 1.2, intensity: 5, distance: 8, bank: 1, flicker: true });
      K.light('fluoro', 4, H - 0.02, 4.4, { len: 1.2, on: false });
      K.light('screen', 6.7, 1.4, 3.0, { color: '#b8c4c0', intensity: 1.6, distance: 4.5, bank: 2 });
      // the CCTV bank on the east wall, facing west; its six feeds are ours to paint
      const bank = K.prop('cctv_bank', SO.bank[0], SO.bank[1], -90, { name: 'c1s_bank' });
      K.prop('office_chair', 6.2, 3.1, 110, { turn: 30 });
      const scr = (bank && bank.userData.screens) || [];
      let tAcc = 0, which = 0;
      const figureOn = () => !done('c1:cctvGone');
      scr.forEach((s, i) => { if (s) s.draw((c, w, h) => C1_cctvPaint(c, w, h, i + 1, 0, i === 2 && figureOn())); });
      K.animate((dt, t) => {
        tAcc += dt; if (tAcc < 0.07) return; tAcc = 0;
        which = (which + 1) % Math.max(1, scr.length);
        const s = scr[which]; if (s) s.draw((c, w, h) => C1_cctvPaint(c, w, h, which + 1, t, which === 2 && figureOn()));
        // look away and back and it's gone: once he has seen the feed, the next time the monitors leave his view
        // (he has to have looked at it: close to the bank and facing it, or examined it)
        const P = Player.pos; if (!P) return;
        const dx = SO.bank[0] - P.x, dz = SO.bank[1] - P.z, dd = Math.hypot(dx, dz) || 1;
        const facing = (Math.sin(Player.yaw) * dx + Math.cos(Player.yaw) * dz) / dd;
        const sees = dd < 3.6 && facing > 0.55;
        if (!figureOn()) return;
        if (sees) { C1.cctv.seenT += 0.07; C1.cctv.away = false; }
        else if (C1.cctv.seenT > 1.2) { C1.cctv.away = true; S.done['c1:cctvGone'] = true; }
      });
      // the steel bar leaning on the monitor bank (a pickup: the examine line first)
      const barTaken = !!(S.taken && S.taken['c1_security:bar']);
      if (!barTaken) {
        const bar = K.prop('bar_steel', 7.0, 4.25, 0, { name: 'c1s_bar' });
        if (bar) { bar.rotation.set(0, -Math.PI / 2, 0); bar.rotateZ(0.32); bar.position.y = 0.02; }
      }
      K.interact(7.05, 0.8, 4.25, async (G) => {
        if (S.taken['c1_security:bar']) return;
        await G.think('Snapped off a demo table. Heavy.');
        const bar = G.obj('c1s_bar');
        await Script.builtins.pickup(G, { id: 'c1_security:bar', item: 'steel_bar', obj: bar });
        if (!S.equipped || S.equipped === 'box_cutter') G.prompt(isPad() ? 'Hold {ready} and press {attack} to swing it. Slow, but it hits hard.' : 'Tab: items. Equip the bar there. Slow, but it hits hard.', { id: 'c1_bar' });
      }, { id: 'c1_security:barx', r: 1.3, when: () => !(S.taken && S.taken['c1_security:bar']) });
      // the key register desk by the door: the Plaza Directory, the staff room key in the tray, the logbook
      K.prop('desk', 1.3, 1.55, 90, { variant: 'office' });
      K.prop('office_chair', 2.2, 1.7, -100, {});
      K.pickup('map_plaza', 1.25, 0.745, 1.2, { id: 'c1_security:map', rot: 80 });
      K.box(1.3, 0.745, 2.0, 0.24, 0.03, 0.16, { color: '#2a2c2c', roughness: 0.6 });
      K.pickup('staff_key', 1.3, 0.78, 2.0, { id: 'c1_security:key', rot: 20 });
      K.plane(1.05, 0.748, 2.35, 0.3, 0.21, C1_tex('keylog', 256, 180, (x, w, h, r) => {
        x.fillStyle = '#ece8da'; x.fillRect(0, 0, w, h); tx(x, 'KEY REGISTER', 10, 22, 16, '#222', { font: FN.mono, weight: 'bold' });
        x.strokeStyle = 'rgba(40,40,40,0.4)'; for (let y = 34; y < h; y += 18) { x.beginPath(); x.moveTo(6, y); x.lineTo(w - 6, y); x.stroke(); }
        const rows = [['STAFF RM', 'L.', 'OUT'], ['STOCK', 'C.', 'OUT'], ['STAFF RM', 'L.', 'IN'], ['DOCK', '—', 'IN'], ['STAFF RM', '', '']];
        rows.forEach(([a, b, c], i) => { tx(x, a, 10, 48 + i * 18, 12, '#333', { font: FN.mono }); Tex.handwriting(x, b + '  ' + c, 120, 48 + i * 18, { size: 13, color: '#1f2c6e', seed: i + 3 }); });
      }), { rot: [-90, 0, 12] });
      K.prop('desk_lamp', 1.5, 0.95, 60, { y: 0.745, lit: false });
      K.prop('crossword', 1.0, 0.7, 30, { y: 0.745 });
      K.sticker('sticker03', 1.35, 0.715, 1.1, 0, { pitch: -90 });
      // filing cabinet with the coffee on top, a hi-vis vest on a hook, the patrol whiteboard, the clock
      K.prop('filing_cabinet', 0.35, 4.6, 90, {});
      K.pickup('coffee', 0.35, 1.34, 4.55, { id: 'c1_security:coffee', rot: 40 });
      K.prop('filing_cabinet', 0.35, 5.2, 90, {});
      K.prop('whiteboard', 2.8, 5.925, 180, { w: 1.6, h: 1.0, text: 'PATROLS\n6pm  ✓\n8pm  ✓\n10pm\nINCIDENTS: 0', mount: 1.55 });
      K.prop('clock', 7.925, 1.2, -90, { time: [8, 59], mount: 2.25 });
      K.box(7.9, 1.55, 5.3, 0.06, 0.06, 0.06, { tex: 'metal', color: '#6d726c' });
      K.box(7.84, 0.95, 5.3, 0.04, 0.62, 0.46, { color: '#d9b91e', roughness: 0.8 });
      K.box(7.83, 1.12, 5.3, 0.02, 0.06, 0.46, { color: '#d8d8cc', roughness: 0.3 });
      K.prop('first_aid_box', 5.6, 5.92, 180, { mount: 1.6 });
      K.prop('poster', 0.08, 2.9, 90, { style: 'notice', text: 'IF IN DOUBT\nCALL IT IN', mount: 1.55 });
      K.prop('fridge', 5.1, 5.55, 180, { variant: 'office' });
      K.prop('mug', 6.9, 2.35, 20, { y: 0.75, text: 'World\'s Okayest Manager' });
      K.prop('sandwich', 6.95, 3.75, 40, { y: 0.75 });
      K.dress('papers', [0.5, 0.5, 6, 5.5], 5, { seed: 51 });
      // examine
      K.examine(6.9, 1.5, 3.0, async (G) => {
        if (!done('c1:cctvGone')) {
          C1.cctv.seenT = Math.max(C1.cctv.seenT, 2);
          await G.think('Camera three. The concourse. [beat] Someone\'s standing outside the store.');
          await G.think('Just standing there.');
        } else await G.think('It\'s gone. [beat] It was right there.');
      }, { id: 'c1so:monitors', r: 1.7 });
      K.examine(1.3, 0.9, 2.35, ['The key register. "Staff room — out." "Staff room — in." Initials.', 'The last line\'s empty. Nobody signed the last key back.'], { id: 'c1so:register', r: 1.2 });
      K.examine(2.8, 1.6, 5.7, ['Patrols at six and eight, ticked. Ten\'s not ticked.', 'Incidents: none.'], { id: 'c1so:board', r: 1.5 });
      K.examine(7.84, 1.1, 5.3, 'A hi-vis vest on the hook. Still warm, or I think it is.', { id: 'c1so:vest', r: 1.2 });
      K.examine(6.9, 0.9, 2.35, ['"World\'s Okayest Manager." [beat] Somebody got this as a joke.', 'Somebody kept it anyway.'], { id: 'c1so:mug', r: 1.0 });
      K.examine(1.0, 0.85, 0.7, 'Half a crossword in blue biro. Seven across: "Left on hold". Somebody gave up on it.', { id: 'c1so:crossword', r: 1.0 });
      K.examine(7.9, 2.1, 1.2, 'Eight fifty-nine. Every clock in the building.', { id: 'c1so:clock', r: 1.8 });
      K.examine(5.1, 1.0, 5.5, 'The bar fridge. A carton of milk and a note: "PLEASE WASH YOUR MUG".', { id: 'c1so:fridge', r: 1.2 });
    },
    onUpdate() {
      // the ceiling camera's shot is its own grainy black-and-white feed
      const on = !!(Cam.current && Cam.current.id === 'c1_security:cctv') && !Script.cutscene;
      if (on !== C1.cctvShot) {
        C1.cctvShot = on;
        Render.post.desat = on ? 1 : 0; Render.post.noise = on ? 0.05 : 0; Render.post.grain = on ? 0.3 : null; Render.post.vignette = on ? 1.6 : null;
      }
    },
    onLeave() { if (C1.cctvShot) { C1.cctvShot = false; Render.post.desat = 0; Render.post.noise = 0; Render.post.grain = null; Render.post.vignette = null; } },
  });

  // =================================================================================================================
  // 1H THE STAFF ROOM — 8 × 6 m, door north (x 4; locked, staff_key). The 15-minute break table, the kitchenette with
  // the microwave, the lockers on the west wall (Aidan's: Account Note 1 and the first-day badge), the corkboard with
  // his induction certificate (the PIN, 1403), the clock at 8:59.
  // =================================================================================================================
  const SR = { h: 2.7, lockX: 0.25, lockZ: 2.6, aidanLocker: 2 };
  defineRoom({
    id: 'c1_staffroom', name: 'STAFF ROOM', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'lino', ambient: 'office',
    fog: { density: 0.03, color: '#3b4543' },
    bounds: [0, 0, 8, 6],
    entries: { door: [4, 0.85, 0], start: [4, 0.85, 0] },
    cameras: [
      // static from the doorway, high, over the table to the kitchenette
      { id: 'c1_staffroom:doorway', vol: [1.2, 2.8, 8, 6], type: 'static', pos: [4.3, 2.5, 0.3], target: [4.6, 0.6, 4.9], fov: 'fit' },
      // close on the lockers: from beside the corkboard, along the west wall
      { id: 'c1_staffroom:lockers', vol: [0, 0, 1.9, 6], pri: 1, type: 'static', pos: [5.2, 1.75, 1.2], target: [0.4, 1.05, 3.2], fov: 'fit' },
      // from the kitchenette corner back to the door and the couch
      { id: 'c1_staffroom:door', vol: [1.2, 0, 8, 2.8], type: 'static', pos: [7.6, 2.4, 5.65], target: [3.2, 0.7, 1.2], fov: 'fit' },
    ],
    build(K) {
      const H = SR.h;
      K.roomBox(0, 0, 8, 6, { h: H, floor: { tex: 'lino', color: '#8a8266' }, wall: { tex: 'plaster', color: '#cfc6ae' }, ceiling: 'ceiling_tile', doors: [{ side: 'n', at: 4, w: 0.95 }], skirting: '#5a4a3a' });
      K.door({ id: 'c1_staffroom:door', x: 4, z: -0.075, rot: 180, w: 0.9, style: 'wood', to: 'c1_corridor', entry: 'staff', color: '#d8d0bc', sign: 'STAFF ROOM' });
      K.light('fluoro', 3.2, H - 0.02, 3.0, { len: 1.2, intensity: 6, distance: 8, bank: 1 });
      K.light('fluoro', 6.2, H - 0.02, 3.0, { len: 1.2, real: false, bank: 2 });
      // the break table (the chapter's 15 minutes) — its clock goes on the nearest wall at 8:59
      K.breakTable(4.4, 3.7, 0, { id: 'c1_staffroom:break', time: [8, 59] });
      K.prop('mug', 4.15, 3.55, 30, { y: 0.745, text: 'I ♥ SIGNAL HILL' });
      K.prop('sandwich', 4.8, 3.9, 10, { y: 0.745 });
      K.prop('drawing', 3.9, 3.95, -12, { y: 0.745, text: 'MY MUMMY AT WORK' });
      // the kitchenette on the south wall: sink bench, the microwave at 8:59, a kettle, the fridge with its notes
      K.prop('sink_bench', 4.6, 5.62, 180, { len: 2.6, upper: true });
      K.prop('microwave', 5.4, 5.66, 180, { y: 0.92, time: '8:59' });
      K.prop('fridge', 7.4, 5.5, -90, { variant: 'home' });
      K.prop('water_cooler', 1.9, 5.65, 180, {});
      K.prop('tea_towel', 3.8, 5.3, 180, { y: 0.92 });
      // the couch against the north wall, a TV on a bracket, stacked chairs
      K.prop('couch', 6.4, 0.55, 0, {});
      K.prop('tv', 7.92, 2.4, -90, { mount: 1.9, content: 'off' });
      K.prop('stacked_chairs', 2.2, 0.45, 0, { n: 6 });
      // the lockers on the west wall, facing east; Aidan's is the third
      const lockers = K.prop('locker_bank', SR.lockX, SR.lockZ, 90, { n: 6, names: ['PRIYA', 'JOSH', 'AIDAN', 'MEL', 'TOM', 'CHLOE'], name: 'c1s_lockers', live: true });
      const lz = SR.lockZ + (6 * 0.38) / 2 - (SR.aidanLocker + 0.5) * 0.38;          // Aidan's locker's centre z
      if (lockers && done('c1:lockerOpen')) lockers.userData.setDoor(SR.aidanLocker, 1);
      K.interact(SR.lockX + 0.5, 1.2, lz, async (G) => {
        if (done('c1:lockerOpen')) return;
        await G.think('My locker. [beat] This isn\'t even my store.');
        S.done['c1:lockerOpen'] = true;
        G.sfx('handle', { pos: [SR.lockX + 0.3, 1.1, lz], vol: 0.6 });
        const L = G.obj('c1s_lockers');
        if (L && L.userData.setDoor) { let k = 0; await G.loop((dt) => { k = Math.min(1, k + dt / 0.6); L.userData.setDoor(SR.aidanLocker, U.ease.inOut(k)); return k >= 1; }); L.userData.setDoor(SR.aidanLocker, 1); }
        G.sfx('creak', { pos: [SR.lockX + 0.3, 1.1, lz], vol: 0.4 });
      }, { id: 'c1_staffroom:locker', r: 1.2, when: () => !done('c1:lockerOpen') });
      // inside: Account Note 1 on the shelf, the first-day badge on the hook
      K.box(SR.lockX + 0.02, 1.43, lz, 0.4, 0.02, 0.34, { tex: 'metal', color: '#8a9290' });
      K.doc('acct1', SR.lockX + 0.04, 1.455, lz, { id: 'c1_staffroom:acct1', model: 'paper', rot: 90, r: 1.2, when: () => done('c1:lockerOpen') });
      const badgeTaken = !!(S.taken && S.taken['c1_staffroom:badge']);
      K.interact(SR.lockX + 0.3, 1.25, lz, async (G) => {
        if (S.taken['c1_staffroom:badge']) return;
        await G.think('Day one. I thought I\'d be good at this.');
        await Script.builtins.pickup(G, { id: 'c1_staffroom:badge', item: 'first_day_badge', obj: G.obj('c1s_badge'), msg: 'Aidan picked up the first-day badge.' });
      }, { id: 'c1_staffroom:badgex', r: 0.9, when: () => done('c1:lockerOpen') && !(S.taken && S.taken['c1_staffroom:badge']) });
      if (!badgeTaken) {
        const bm = Kit.itemModel('first_day_badge');
        if (bm) { bm.position.set(SR.lockX + 0.3, 1.22, lz + 0.08); bm.rotation.set(0, Math.PI / 2, -Math.PI / 2 + 0.2); K.obj('c1s_badge', bm); K.mesh(bm, { name: 'c1s_badge' }); }
      }
      K.prop('cardigan_chair', 1.25, 1.2, 70, { chair: 'plastic', color: '#8a7a5a' });
      // the corkboard on the east wall with the certificate pinned in the middle (and the roster, the BBQ flyer …)
      K.prop('corkboard', 7.925, 3.4, -90, { w: 1.5, h: 0.95, mount: 1.5, roster: true });
      const certTaken = !!(S.taken && S.taken['c1_staffroom:cert']);
      const certMesh = certTaken ? null : K.plane(7.88, 1.5, 3.75, 0.3, 0.21, C1_tex('cert|' + lvl(), 384, 272, (x, w, h, r) => {
        x.fillStyle = '#f4f0e2'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#b89a3a'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); x.lineWidth = 1.5; x.strokeRect(18, 18, w - 36, h - 36);
        Tex.drawWordmark(x, w / 2 - 44, 58, 30, { color: '#00a8a8' });
        tx(x, 'CERTIFICATE OF COMPLETION', w / 2, 96, 20, '#333', { font: FN.serif, align: 'center', weight: 'bold' });
        tx(x, 'Retail Sales — New Starter Program', w / 2, 118, 13, '#555', { font: FN.serif, align: 'center' });
        Tex.handwriting(x, 'Aidan', w / 2 - 34, 160, { size: 34, color: '#1b2a7a', seed: 5 });
        tx(x, lvl() === 'hard' ? 'completed on the fourteenth of March, 2026' : 'Sales Induction — completed 14/03/2026', w / 2, 198, 13, '#333', { font: FN.serif, align: 'center' });
        Tex.handwriting(x, 'Welcome to the family! — C', w / 2 + 10, 236, { size: 15, color: '#1b2a7a', seed: 9 });
        x.fillStyle = '#c9a23a'; x.beginPath(); x.arc(56, h - 56, 22, 0, Math.PI * 2); x.fill();
        age(x, w, h, r, 0.6);
      }), { rotY: -90, name: 'c1s_cert' });
      void certMesh;
      K.box(7.87, 1.59, 3.75, 0.01, 0.012, 0.012, { color: '#b3261e' }, { name: 'c1s_certpin' });
      K.interact(7.6, 1.5, 3.75, async (G) => {
        if (S.taken['c1_staffroom:cert']) return;
        await G.doc(pickDoc('cert'), { id: 'c1_staffroom:certdoc' });
        await Script.builtins.pickup(G, { id: 'c1_staffroom:cert', item: 'certificate', obj: G.obj('c1s_cert') });
        const pin = G.obj('c1s_certpin'); if (pin) pin.visible = false;
        G.set('c1_pinKnown', true);
        note(G, 'PIN: the day I started. 14 March.', 'c1_pin');
      }, { id: 'c1_staffroom:certx', r: 1.3, when: () => !(S.taken && S.taken['c1_staffroom:cert']) });
      K.dress('papers', [2, 1, 7, 5], 4, { seed: 61 });
      // examine
      K.examine(5.4, 1.1, 5.4, ['The microwave says 8:59. [beat] So does everything.', 'Somebody\'s lunch is still in there. I\'m not opening it.'], { id: 'c1sr:micro', r: 1.2 });
      K.examine(7.4, 1.3, 5.2, ['The fridge. "LABEL YOUR FOOD." Nothing inside has a label.', 'A kid\'s drawing on the door. Someone\'s mum, in a teal shirt.'], { id: 'c1sr:fridge', r: 1.3 });
      K.examine(4.8, 0.9, 3.9, ['Half a sandwich in cling wrap. [beat] They were coming back for it.', '"My mummy at work." She\'s smiling in the drawing. Everyone\'s smiling.'], { id: 'c1sr:table', r: 1.0 });
      K.examine(6.4, 0.8, 0.6, 'The couch has a dent in it the shape of every break anyone ever took here.', { id: 'c1sr:couch', r: 1.4 });
      K.examine(1.25, 1.0, 1.2, 'A cardigan over a chair. Somebody\'s mum knitted that.', { id: 'c1sr:cardigan', r: 1.2 });
      K.examine(7.9, 1.6, 2.9, ['The roster. My name\'s on it. [beat] I\'ve never worked here.', 'Every shift ends at "close".'], { id: 'c1sr:roster', r: 1.2 });
      K.examine(SR.lockX + 0.3, 1.6, SR.lockZ - 0.9, 'Priya. Josh. Aidan. Mel. Tom. Chloe. [beat] Chloe\'s is padlocked twice.', { id: 'c1sr:names', r: 1.2 });
      K.examine(1.9, 1.0, 5.6, 'The water cooler burps once, like it heard me.', { id: 'c1sr:cooler', r: 1.1 });
    },
  });

  // =================================================================================================================
  // 1D THE CONCOURSE — 60 × 12 m, west → east through the middle of the Plaza; double height (the first floor's
  // balconies along both sides at 4.4 m, chained off at the dead escalator). North side: the food court opening (west,
  // x 3…11), shuttered shops, THE STORE at the east end (x 44…58: the only lit shopfront, an open entrance with a door
  // chime). South side: shops, the escalator (x 26.5…38), the fire door from the service corridor (x 43). West: the
  // chained front doors. The dry fountain with the phone in it. Outage: contract walls (the store is walled off — the
  // way on is the food court kitchen), tethers and receipts hanging from the ceiling, three Tethered.
  // =================================================================================================================
  const CN = { h: 8, bal: 4.4, storeX: 51, fireX: 43, fountain: [20.5, 6.2] };
  defineRoom({
    id: 'c1_concourse', name: 'CONCOURSE', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'carpet', ambient: 'interior',
    fog: { density: 0.03, color: '#3a4442' }, outageFog: { density: 0.03, color: '#122423' },
    surfaces: [{ box: [0, -1, 60, 0.4], s: 'tile' }],
    bounds: [0, -1, 60, 12],
    entries: { fire: [CN.fireX, 11.0, 180], food: [7, 1.2, 0], store: [CN.storeX, 1.1, 0], start: [CN.fireX, 11.0, 180] },
    cameras: [
      // a wide from the fountain, west to the chained front doors and the food court's mouth
      { id: 'c1_concourse:fountain', vol: [0, -1, 18.5, 12], type: 'static', pos: [25.2, 1.75, 7.6], target: [5.5, 1.05, 5.4], fov: 'fit' },
      // a low rail along the south side, looking across at him and the shopfronts behind him
      { id: 'c1_concourse:rail', vol: [18.5, -1, 41, 5.8], type: 'rail', pos: [30, 0.8, 9.9], fov: 50, rail: { a: [17, 0.8, 9.9], b: [43, 0.8, 9.9], look: [0, 1.05, 0], lag: 0.4 } },
      // a pan from the top of the escalator, down the concourse
      { id: 'c1_concourse:escalator', vol: [18.5, 5.8, 33.5, 12], type: 'pan', pos: [37.6, 5.9, 9.15], target: [26, 0.9, 6.8], fov: 48, pan: { lag: 0.35, yaw: 70, pitch: 50 } },
      // the fire door from the corridor and the escalator's top, from over by the store (the corridor stays hidden)
      { id: 'c1_concourse:fire', vol: [33.5, 5.8, 42.4, 12], pri: 1, type: 'static', pos: [47.2, 2.7, 3.2], target: [38.8, 0.8, 9.6], fov: 'fit' },
      // the east end: him in silhouette against the only lit shopfront
      { id: 'c1_concourse:store', vol: [41, -1, 60, 12], type: 'static', pos: [36.8, 2.4, 9.6], target: [53.2, 1.3, 2.2], fov: 'fit' },
    ],
    spawns: [
      // the Outage: three Tethered stand in the concourse
      { id: 'c1_concourse:teth1', type: 'tethered', world: 'outage', pos: [13.5, 4.6], rot: 60, anchor: [13.5, 4.6], cardigan: '#7a5a3c' },
      { id: 'c1_concourse:teth2', type: 'tethered', world: 'outage', pos: [31.5, 7.4], rot: 200, anchor: [31.5, 7.4], cardigan: '#4d5560' },
      { id: 'c1_concourse:teth3', type: 'tethered', world: 'outage', pos: [47.5, 4.2], rot: 320, anchor: [47.5, 4.2], cardigan: '#86744f' },
    ],
    build(K) {
      const H = CN.h, B = CN.bal;
      // ---- floor (carpet tiles; the entrances tiled), the upper levels, the ceiling -------------------------------
      K.floor(0, 0.4, 60, 12, { tex: 'carpet', color: '#6a6f68' });
      K.floor(0, -1, 60, 0.4, { tex: 'tile', color: '#8a8a80' });
      K.ceiling(0, 2.6, 60, 9.4, H, 'ceiling_tile');
      // the first floor's balconies along both sides (not walkable: chained off), glass balustrades, dark shops above
      for (const [z0, z1, edge] of [[-3, 2.6, 2.6], [9.4, 14, 9.4]]) {
        K.box(30, B, (z0 + z1) / 2, 60, 0.35, z1 - z0, { tex: 'concrete', color: '#8e8a80' });
        K.box(30, B + 0.35, edge + (edge < 6 ? -0.05 : 0.05), 60, 1.0, 0.03, 'glass', { shadow: false });
        K.box(30, B + 1.33, edge, 60, 0.05, 0.08, { tex: 'metal', color: '#9aa09e' });
        K.box(30, B - 0.35, edge, 60, 0.35, 0.12, { color: '#1d3d4a', roughness: 0.5 });
        K.ceiling(0, z0, 60, z1, B, 'ceiling_tile');
        const zf = edge < 6 ? z0 + 0.4 : z1 - 0.4;
        K.box(30, B + 0.35, zf, 60, H - B - 0.35, 0.3, { tex: 'render_cracked', color: '#8f8a7e' });
        for (let x = 3; x < 60; x += 7) K.box(x, B + 0.8, zf + (edge < 6 ? 0.16 : -0.16), 5.2, 2.4, 0.02, { color: '#101313', roughness: 0.2, metalness: 0.3 });
      }
      K.box(30, H, 6, 60, 0.3, 8, { color: '#141717', roughness: 1 });
      K.box(30, H - 0.05, 6, 40, 0.06, 2.2, { color: '#2c3a3c', roughness: 0.2, metalness: 0.3 });     // the dead skylight
      // the end walls
      K.wall(0, 12, 0, -1, H, 'plaster_stained', { openings: [{ at: 6, w: 3.6, h: 2.6 }], thick: 0.3 });
      K.wall(60, -1, 60, 12, H, 'plaster_stained', { thick: 0.3 });
      // ---- the north side: the food court's mouth, shuttered shops, the store ---------------------------------------
      K.collider(0, -3.2, 60, -1, { h: 5 });
      K.box(1.5, 0, -1.2, 3, 4.4, 0.4, 'plaster_stained', { collide: true });
      K.box(11.25, 0, -1.2, 0.5, 4.4, 0.4, 'plaster_stained', { collide: true });
      K.box(7, 3.4, -1.2, 8.2, 1.0, 0.4, 'plaster_stained');
      K.sign('FOOD COURT', 7, 3.9, -0.98, 3.2, 0.5, { style: 'shop', bg: '#7a2a1a', fg: '#f4e2b0' });
      K.exit({ id: 'c1_concourse:food', box: [3.1, -1, 10.9, -0.55], to: 'c1_foodcourt', entry: 'concourse' });
      K.floor(3, -2.2, 11, -1, { tex: 'tile', color: '#7d7a70' });
      const nshop = (x, w, variant, o = {}) => K.prop('shopfront', x, -0.95, 0, { w, variant, indoor: true, ...o });
      nshop(14.75, 6, 'shop', { name: 'PLAZA NEWSAGENCY', bg: '#6d1d1a', fg: '#f1e9d2', shutter: 1 });
      nshop(21, 6, 'vacant');
      nshop(27.25, 6, 'pharmacy', { name: 'HILLTOP CHEMIST', shutter: 0.85, poster: null });
      nshop(33.5, 6, 'shop', { name: 'SHOE REPAIR & KEYS', bg: '#3a2a1a', fg: '#f0d890', shutter: 1 });
      nshop(39.75, 6, 'vacant');
      // THE STORE: pilasters, the lit bulkhead sign, glazing either side of an open entrance, the lit floor behind
      const SF = { tex: 'tile_white', color: '#dcdcd4' };
      K.box(44.1, 0, -1.1, 0.4, 4.4, 0.5, SF, { collide: true }); K.box(57.9, 0, -1.1, 0.4, 4.4, 0.5, SF, { collide: true });
      K.box(51, 3.2, -1.1, 13.4, 1.2, 0.5, { color: '#10403f', roughness: 0.5 });
      K.plane(51, 3.8, -0.84, 4.2, 0.9, C1_tex('storesign', 512, 110, (x, w, h) => { x.fillStyle = '#0e6f6e'; x.fillRect(0, 0, w, h); Tex.drawWordmark(x, w * 0.3, h * 0.78, h * 0.62, { color: '#ffcc00' }); }), { emissive: true, emissiveIntensity: 1.1 });
      for (const [a, b] of [[44.3, 49.4], [52.6, 57.7]]) {
        K.box((a + b) / 2, 0, -1.0, b - a, 0.45, 0.12, { tex: 'tile', color: '#3d4a48' }, { collide: true });
        K.box((a + b) / 2, 0.45, -1.0, b - a, 2.75, 0.02, 'glass', { collide: true, h: 3.2 });
        K.box((a + b) / 2, 3.18, -1.0, b - a, 0.04, 0.1, { tex: 'metal', color: '#b9bcb6' });
        for (let x = a; x <= b + 0.01; x += (b - a) / 2) K.box(x, 0.45, -1.0, 0.05, 2.75, 0.1, { tex: 'metal', color: '#b9bcb6' });
      }
      K.box(51, 2.95, -1.05, 3.3, 0.28, 0.35, { tex: 'metal', color: '#7a817d' });                 // the shutter, rolled up
      K.box(51, 2.84, -1.05, 3.2, 0.06, 0.06, { tex: 'metal', color: '#3a3f3d' });
      // the lit store beyond the glass (the room itself is c1_store): floor, back wall, demo tables, the counter's glow
      K.box(51, 0, -2.6, 13.4, 0.02, 3.0, { tex: 'vinyl_retail', color: '#d8d6ce' });
      K.plane(51, 1.7, -4.05, 13.4, 3.4, { color: '#dfe8e6', emissive: '#9fbcb8', emissiveIntensity: 0.55, roughness: 0.9 }, { emissive: true });
      K.box(51, 3.35, -2.6, 13.4, 0.05, 3.0, { color: '#e8eceb', roughness: 0.8 });
      for (const x of [46.8, 55.2]) K.prop('demo_table', x, -2.5, 0, { len: 1.6, n: 4 });
      K.box(51, 2.9, -3.9, 6, 0.3, 0.2, { color: '#e8f4ef', emissive: '#dff2ec', emissiveIntensity: 1.2 });
      K.collider(44, -4.2, 58, -1.05, { h: 3.6 });
      K.floor(49.4, -1.6, 52.6, -1, { tex: 'vinyl_retail', color: '#d8d6ce' });
      const toStore = K.exit({ id: 'c1_concourse:store', box: [49.5, -1.6, 52.5, -1.15], to: 'c1_store', entry: 'door', sound: 'none', when: () => !S.outage, blockedMsg: 'Paper. Stacked to the ceiling.' });
      void toStore;
      K.fogOnly(() => {
        K.light('point', 51, 2.4, 0.2, { color: '#e3f2ee', intensity: 9, distance: 13, bank: 5 });
        K.light('point', 51, 2.8, -2.6, { color: '#e3f2ee', intensity: 5, distance: 6, bank: 5, real: false });
      });
      // ---- the south side: shops, the dead escalator, the fire door ---------------------------------------------------
      K.collider(0, 12, 60, 14, { h: 5 });
      const sshop = (x, w, variant, o = {}) => K.prop('shopfront', x, 12.35, 180, { w, variant, indoor: true, ...o });
      sshop(6, 6, 'shop', { name: 'POST OFFICE', bg: '#b3261e', fg: '#f4efe4', shutter: 1 });
      sshop(12.25, 6, 'shop', { name: 'SUNNY\'S BAKERY', bg: '#c9a822', fg: '#2a1a0a', shutter: 0.8 });
      sshop(18.5, 6, 'vacant');
      sshop(47.25, 6, 'shop', { name: 'CARDS & GIFTS', bg: '#6a2a5a', fg: '#fff4f8', shutter: 1 });
      sshop(53.5, 6, 'vacant');
      K.box(24, 0, 12.25, 4.6, 4.4, 0.5, 'plaster_stained');
      K.box(32.5, 0, 12.25, 12.6, 4.4, 0.5, 'plaster_stained');
      K.box(40.8, 0, 12.25, 3.8, 4.4, 0.5, 'plaster_stained');
      K.box(43.6, 2.2, 12.25, 1.8, 2.2, 0.5, 'plaster_stained');
      K.box(57.9, 0, 12.25, 4.2, 4.4, 0.5, 'plaster_stained');
      K.prop('escalator', 26.9, 11.1, -90, { h: B, w: 1.0 });
      K.blocker(25.6, 10.3, 26.5, 11.95, 'It\'s chained.');
      K.door({ id: 'c1_concourse:fire', x: CN.fireX, z: 12.0, rot: 0, w: 0.95, style: 'fire', to: 'c1_corridor', entry: 'concourse', locked: () => !!S.outage, lockMsg: 'It won\'t open from this side.', frame: true });
      K.light('led', CN.fireX, 2.35, 11.85, { color: '#2aff5a', intensity: 2.5 });
      K.prop('exit_sign', CN.fireX, 11.99, 180, { mount: 2.4 });
      // ---- the west end: the chained front doors, the vestibule, the fog beyond --------------------------------------
      K.door({ id: 'c1_concourse:frontdoors', x: 0, z: 6, rot: 90, w: 1.8, h: 2.3, style: 'glass_double', chain: true, locked: true, lockMsg: 'It\'s chained.' });
      K.plane(-3, 1.6, 6, 6, 3.6, { color: '#b7c0bd', emissive: '#8e9996', emissiveIntensity: 0.6, roughness: 1 }, { rotY: 90, emissive: true });
      K.box(-1.5, 0, 6, 3, 0.02, 3.6, { tex: 'tile', color: '#6a6a62' });
      K.sign('SIGNAL HILL PLAZA', 0.18, 3.4, 6, 3.2, 0.4, { rotY: 90, style: 'shop', bg: '#1d3d4a', fg: '#e6dfc9' });
      // ---- the middle: the dry fountain (the phone in the leaves), benches, planters, the kiosk, the directory -------
      const [fx, fz] = CN.fountain;
      K.prop('fountain', fx, fz, 0, { radius: 2.2 });
      K.dress('leaves', [fx - 1.8, fz - 1.8, fx + 1.8, fz + 1.8], 90, { seed: 71, y: 0.105 });
      K.box(fx + 0.9, 0.105, fz + 0.5, 0.075, 0.009, 0.155, { color: '#1e1f22', roughness: 0.35, metalness: 0.25 }, { rot: 32 });
      K.plane(fx + 0.9, 0.1152, fz + 0.5, 0.066, 0.14, dogPhoneTex(), { rot: [-90, 0, 32], emissive: true, emissiveIntensity: 0.9 });
      K.light('screen', fx + 0.9, 0.35, fz + 0.5, { color: '#f2b060', intensity: 0.35, distance: 1.2, real: false });
      for (const [x, z, r] of [[10.5, 6, 90], [30, 4.2, 0], [37.5, 7.4, 180], [46, 8.4, 180]]) K.prop('bench', x, z, r, { len: 1.8 });
      for (const [x, z] of [[14, 8.6], [26.5, 3.4], [34, 8.2], [52, 8.8]]) K.prop('planter', x, z, 0, { variant: 'round', dead: true });
      for (const [x, z] of [[9, 3.4], [41, 4.4]]) K.prop('bin', x, z, 0, { variant: 'street' });
      // the phone-case kiosk island, closed under a sheet
      K.box(33.6, 0, 5.2, 2.4, 1.0, 1.3, { color: '#1d4a4a', roughness: 0.5 }, { collide: true });
      K.prop('drop_sheet', 33.6, 5.2, 12, { variant: 'draped', w: 2.6, d: 1.5, h: 1.05 });
      K.sign('CASES • CHARGERS • SCREEN PROTECTION', 33.6, 1.9, 5.2, 2.2, 0.3, { style: 'shop', bg: '#ffcc00', fg: '#10403f', double: true });
      for (const s of [-1, 1]) K.cyl(33.6 + s * 1.05, 1.0, 5.2, 0.025, 0.75, { tex: 'metal', color: '#9aa09e' });
      // the directory board on a stand near the doors
      K.box(4.2, 0, 9.2, 0.08, 1.9, 1.3, { color: '#1f2a2b', roughness: 0.5 }, { collide: true });
      K.plane(4.25, 1.3, 9.2, 1.2, 0.9, directoryTex(), { rotY: 90 });
      // faded posters on the pilasters
      for (const [x, z, r, i] of [[11.2, -0.6, 0, 0], [24.2, 11.98, 180, 1], [40.4, 11.98, 180, 2], [44.1, -0.83, 0, 5]]) K.plane(x, 1.55, z + (r ? -0.01 : 0.01), 0.6, 0.85, plazaPosterTex(i), { rotY: r });
      K.dress('papers', [1, 1, 58, 11], 14, { seed: 72 });
      K.dress('leaves', [0, 3, 12, 11], 20, { seed: 73 });
      // ---- light: almost none — the store's glow, two emergency tubes under the balconies, exit signs ----------------
      K.fogOnly(() => {
        K.light('fluoro', 16, B - 0.02, 2.2, { len: 1.2, intensity: 5, distance: 9, bank: 2, flicker: true });
        K.light('fluoro', 36, B - 0.02, 9.8, { len: 1.2, intensity: 4, distance: 8, bank: 3 });
        for (const x of [6, 26, 46]) K.light('fluoro', x, B - 0.02, 9.8, { len: 1.2, on: false });
        for (const x of [26, 56]) K.light('fluoro', x, B - 0.02, 2.2, { len: 1.2, on: false });
      });
      K.light('led', 0.2, 2.6, 7.3, { color: '#2aff5a', intensity: 2.5 });
      // ---- the Outage: contract walls, hanging tethers and receipts, the store walled off, red light ------------------
      K.outageOnly(() => {
        // the wall of paper across the store's front
        const CT = { tex: 'contracts', color: '#d8d4c4' };
        K.box(51, 0, 0.15, 15.8, 4.4, 1.1, CT, { collide: true });
        for (let x = 43.6; x < 58.6; x += 0.62) K.prop('contract_stack', x, 0.95 + ((x * 7) % 3) * 0.08, (x * 37) % 20 - 10, { h: 0.6 + ((x * 13) % 7) * 0.12, collide: false });
        K.blocker(43, 0.7, 59, 1.4, 'Paper. Stacked to the ceiling.');
        K.writing('FOLLOW UP TOMORROW', 51, 2.2, 0.72, 4.2, { style: 'marker' });
        K.writing('DID YOU CHECK', 22.5, 2.0, 12.0, 2.0, { rotY: 180, style: 'receipt' });
        K.writing('IT\'LL BE FINE', 5.2, 2.1, -0.98, 2.2, { style: 'marker' });
        for (const [x, z, len] of [[8, 5, 2.4], [12.5, 7.5, 3.2], [17, 4, 2.0], [24, 8.2, 3.6], [29, 5.2, 2.8], [35.5, 7, 3.0], [41, 5.8, 2.2], [48, 6.4, 3.4], [54, 4.8, 2.6]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len: len + 3.2 });
        for (const [x, z] of [[10, 3], [20, 9], [27, 2.8], [44, 8.8]]) K.prop('receipt_strip', x, z, (x * 17) % 90, { ceil: B, len: 1.8 });
        K.prop('receipt_curtain', 31, 9.3, 0, { ceil: B, w: 5, len: 2.2 });
        K.dress('contracts', [2, 2, 58, 10], 26, { seed: 74 });
        K.dress('receipts', [2, 2, 58, 10], 30, { seed: 75 });
        K.light('fluoro', 30, B - 0.02, 2.2, { len: 1.2, intensity: 6, distance: 11, flicker: true, color: '#cfe8dc' });
        K.light('fluoro', 12, B - 0.02, 9.8, { len: 1.2, intensity: 5, distance: 10, flicker: true, color: '#bfe0d4' });
        K.light('fluoro', 44, B - 0.02, 9.8, { len: 1.2, intensity: 4, distance: 9, color: '#bfe0d4' });
        K.light('point', 51, 3.5, 1.4, { color: '#ff2a1c', intensity: 4, distance: 11 });
        K.light('point', 20.5, 2.2, 6.2, { color: '#e8c21a', intensity: 2.2, distance: 8 });
        K.light('led', 13.2, 2.4, 11.9, { color: '#ff2a1c', blink: 1.4 });
        K.light('led', 38.4, 2.2, -0.6, { color: '#ff2a1c', blink: 0.9 });
        K.pickup('energy_drink', 37.5, 0.47, 7.4, { id: 'c1_concourse:energy' });
      });
      // ---- examine ------------------------------------------------------------------------------------------------
      K.examine(fx + 0.9, 0.5, fz + 0.5, 'Someone\'s wallpaper. A dog in a party hat. [beat] Somebody loved this phone.', { id: 'c1cn:phone', r: 2.4 });
      K.examine(26, 1.0, 11.1, ['It\'s chained.', 'The upper level\'s dark all the way along.'], { id: 'c1cn:escalator', r: 1.6 });
      K.examine(0.8, 1.2, 6, ['Chained from in here. [beat] Whoever did it went out another way.', 'The fog\'s pressed right up against the glass.'], { id: 'c1cn:frontdoors', r: 1.6, world: 'fog' });
      K.examine(4.4, 1.4, 9.2, ['The directory. Food court, chemist, post office. [beat] The store.', 'You are here.'], { id: 'c1cn:directory', r: 1.5 });
      K.examine(11.0, 1.5, -0.3, 'Cap plans from twenty-nine dollars. [beat] That\'s older than I am.', { id: 'c1cn:poster', r: 1.3 });
      K.examine(33.6, 1.1, 6.1, ['Cases. Chargers. Screen protectors. Under a sheet.', 'Even out here. Even here.'], { id: 'c1cn:kiosk', r: 1.7 });
      K.examine(27.25, 1.4, 0.3, 'Hilltop Chemist. "BACK IN 5 MINS." The shutter\'s stuck halfway.', { id: 'c1cn:chemist', r: 1.6 });
      K.examine(CN.storeX, 1.6, 0.6, ['The store. The only lights on in the whole centre.', 'Someone\'s in there.'], { id: 'c1cn:store', r: 2.4, world: 'fog', when: () => !done('cs:1-1') });
      K.examine(30, 0.7, 4.6, 'Bolted down. There\'s gum under the seat older than me.', { id: 'c1cn:bench', r: 1.3 });
      K.examine(12.25, 1.4, 11.6, 'Sunny\'s Bakery. A tray of something left in the pie warmer. It\'s grey now.', { id: 'c1cn:bakery', r: 1.6 });
      K.examine(CN.storeX, 1.6, 1.4, ['Contracts. All the way up. [beat] Every page has a signature line.', 'I can\'t get to the store this way.'], { id: 'c1cn:wall', r: 2.6, world: 'outage' });
      // ---- 1-2 (shot 3, cutscene-only): a strip of carpet tiles that lift and curl back over circuit board ------------
      {
        const under = new THREE.Mesh(new THREE.PlaneGeometry(22.4, 2.0), Tex.mat('circuit', { repeat: [22.4, 2.0], outage: false, emissive: '#1f7a3a', emissiveIntensity: 0.28, emissiveMap: true, polygonOffset: true }));
        under.rotation.x = -Math.PI / 2; under.position.set(26.4, 0.004, 5.8); under.visible = false; under.userData.ownedGeo = true;
        K.mesh(under, { name: 'c1cn_circuit' });
        const top = Tex.mat('carpet', { color: '#6a6f68', repeat: [0.6, 0.6], outage: false });
        const edge = new THREE.MeshStandardMaterial({ color: '#242624', roughness: 1 });
        const geo = new THREE.BoxGeometry(0.6, 0.014, 0.6); geo.translate(-0.3, 0.007, 0);        // the pivot on its east edge
        const mats = [edge, edge, top, edge, edge, edge];
        const g = new THREE.Group(); g.visible = false;
        for (let c = 0; c < 36; c++) for (let r = 0; r < 3; r++) {
          const m = new THREE.Mesh(geo, mats);
          const x = 37.1 - c * 0.6, z = 5.2 + r * 0.6;
          m.position.set(x, 0.002, z); m.userData.ord = x - r * 0.21 - ((c * 7 + r * 3) % 5) * 0.05;
          m.castShadow = false; m.receiveShadow = true;
          g.add(m);
        }
        g.children[0].userData.ownedGeo = true;
        K.mesh(g, { name: 'c1cn_tiles' });
      }
    },
    onUpdate() { C1_ringTick('c1_concourse'); C1_ambient(['#74827f', 0.5], ['#2a8a84', 0.3]); },
    onLeave() { C1_ringStop(); C1_ambientOff(); },
  });

  // =================================================================================================================
  // 1E THE FOOD COURT — 30 × 20 m. The concourse is south (the mouth, x 11…19). Shuttered stalls along the north and
  // east walls; the kitchen's staff door (NE, locked in the Fog world; the Outage's way to the store). Tables. The wall
  // payphone on the west wall (a save point; Wai's call rings here). The Outage: carpet peeled back to circuit board,
  // the Unread on the ceiling over the way to the kitchen, the receipt map printing out of the order kiosk.
  // =================================================================================================================
  const FC = { h: 4.6, phone: [0.1, 13.2], kitchen: [27.6, 0.08] };
  C1.ringPos = [0.35, 1.4, FC.phone[1]];
  defineRoom({
    id: 'c1_foodcourt', name: 'FOOD COURT', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'carpet', ambient: 'interior',
    fog: { density: 0.03, color: '#3a4442' }, outageFog: { density: 0.03, color: '#122423' },
    bounds: [0, 0, 30, 21],
    entries: { concourse: [15, 19.3, 180], kitchen: [FC.kitchen[0], 1.0, 0], phone: [0.95, FC.phone[1], 90], start: [15, 19.3, 180] },
    cameras: [
      // high from a stall sign (north wall), panning after him across the tables to the concourse mouth
      { id: 'c1_foodcourt:sign', vol: [0, 8.5, 30, 21], type: 'pan', pos: [15, 3.95, 0.75], target: [15, 0.6, 13.5], fov: 44, pan: { lag: 0.35, yaw: 66, pitch: 32 } },
      // low under the tables, from the concourse side, toward the stalls
      { id: 'c1_foodcourt:low', vol: [0, 0, 30, 8.5], type: 'pan', pos: [15.4, 0.5, 19.6], target: [15, 1.0, 4.5], fov: 40, pan: { lag: 0.35, yaw: 55, pitch: 22 } },
      // close by the payphone (the call; the save point)
      { id: 'c1_foodcourt:phone', vol: [0, 9.5, 4.8, 17.5], pri: 1, type: 'static', pos: [8.6, 2.0, 9.4], target: [0.6, 1.1, 13.6], fov: 'fit' },
      // the kitchen's door in the corner (hidden past the last stall until he's there)
      { id: 'c1_foodcourt:kitchen', vol: [23.5, 0, 30, 5], pri: 1, type: 'static', pos: [17.2, 2.7, 9.6], target: [27.6, 0.9, 1.4], fov: 'fit' },
    ],
    spawns: [
      // the Outage: an Unread swarm on the ceiling over the way to the kitchen
      { id: 'c1_foodcourt:unread', type: 'unread', world: 'outage', pos: [20, 6], count: 44,
        cluster: [[18.6, FC.h - 0.02, 5.2], [19.8, FC.h - 0.02, 6.4], [21.2, FC.h - 0.02, 5.6], [20.4, FC.h - 0.02, 4.4], [22.2, FC.h - 0.02, 6.9], [19.2, FC.h - 0.02, 7.4]] },
    ],
    build(K) {
      const H = FC.h;
      K.floor(0, 0, 30, 20, { tex: 'carpet', color: '#6b5e52' });
      K.floor(11, 20, 19, 21, { tex: 'tile', color: '#8a8a80' });
      K.ceiling(0, 0, 30, 20, H);
      K.wall(-0.075, -0.075, -0.075, 20.075, H, 'plaster_stained', { openings: [{ at: 6.075, w: 1.8, h: 2.1 }] });
      K.wall(30.075, 20.075, 30.075, -0.075, H, 'plaster_stained');
      K.wall(30.15, 20.075, -0.15, 20.075, H, 'plaster_stained', { openings: [{ at: 15.15, w: 8.0, h: 3.6 }] });
      K.wall(-0.15, -0.075, 30.15, -0.075, H, 'plaster_stained', { openings: [{ at: FC.kitchen[0] + 0.15, w: 1.0, h: 2.15 }] });
      K.exit({ id: 'c1_foodcourt:concourse', box: [11.1, 20.5, 18.9, 21], to: 'c1_concourse', entry: 'food' });
      K.sign('CONCOURSE', 15, 3.4, 19.95, 2.6, 0.4, { rotY: 180, style: 'shop', bg: '#1d3d4a', fg: '#e6dfc9' });
      // the stalls (shuttered)
      const stall = (x, z, rot, w, name, bg, fg, sh = 1) => K.prop('shopfront', x, z, rot, { w, variant: 'stall', indoor: true, name, bg, fg, shutter: sh });
      stall(3.6, 0.28, 0, 6.6, 'NOODLE BAR', '#7a2a1a', '#f4e2b0');
      stall(10.4, 0.28, 0, 6.6, 'CHICKEN & CHIPS', '#c9a822', '#3a1a0a');
      stall(17.2, 0.28, 0, 6.6, 'SUSHI TRAIN', '#1f3f5c', '#f4efe4', 0.9);
      stall(23.4, 0.28, 0, 5.4, 'KEBABS', '#2e4a2e', '#efe6c8');
      stall(29.72, 7, -90, 6.4, 'COFFEE HOUSE', '#3a2418', '#e8d8b8');
      stall(29.72, 13.6, -90, 6.4, 'HOT DONUTS', '#b3261e', '#fff4e0');
      K.collider(0, -1, 30, 0.35, { h: 4 }); K.collider(29.65, 0, 31, 20, { h: 4 });
      // the kitchen's staff door (Fog: locked; the Outage: the way on)
      K.door({ id: 'c1_foodcourt:kitchen', x: FC.kitchen[0], z: -0.075, rot: 0, w: 0.95, style: 'metal', sign: 'STAFF ONLY', to: 'c1_kitchen', entry: 'food', locked: () => !S.outage, lockMsg: 'It\'s locked.' });
      // the toilets (west wall): locked
      K.door({ id: 'c1_foodcourt:toilets', x: -0.075, z: 6, rot: 90, w: 1.6, style: 'wood', locked: true, lockMsg: 'It\'s locked.', sign: 'TOILETS', color: '#c8c0ac' });
      // the payphone (a save point, Wai's call) — the handset hangs off the hook when it's a save point
      const pay = K.payphone(FC.phone[0], FC.phone[1], 90, { wall: true, id: 'c1_foodcourt:payphone', when: () => !ringing() });
      const payObj = pay && pay.obj;
      K.animate(() => { if (payObj && payObj.userData.setHanging) { const want = !ringing() && !C1.onPhone; if (payObj.userData.hanging !== want) { payObj.userData.hanging = want; payObj.userData.setHanging(want); } } });
      K.interact(FC.phone[0] + 0.25, 1.3, FC.phone[1], (G) => G.cutscene('1-8'), { id: 'c1_foodcourt:ringing', r: 1.4, when: () => ringing() });
      K.sign('PHONE', FC.phone[0] + 0.03, 2.3, FC.phone[1], 0.5, 0.14, { rotY: 90, style: 'shop', bg: '#1f4b73', fg: '#e8eef0' });
      // tables and chairs, a high chair, trays, the tray-return rack, bins, the condiment bench, the drinks fridge
      const tables = [[5, 5.5], [10, 6.5], [15.5, 5.2], [22, 5.8], [4.5, 10.5], [9.5, 11.5], [14.5, 10.6], [20, 11.8], [25, 11], [6, 16.5], [12, 16.2], [21.5, 16.8], [26, 17]];
      tables.forEach(([x, z], i) => K.prop('cafe_table', x, z, i * 37, { chairs: 2 + (i % 3), radius: 0.42 }));
      K.prop('chair', 17.2, 13.9, 250, { variant: 'plastic', color: '#8a3a2a' });
      K.prop('fallen_chair', 18.4, 8.4, 40, {});
      K.box(1.0, 0, 18.7, 1.5, 1.0, 0.6, { tex: 'metal', color: '#9aa09e' }, { collide: true });
      K.sign('TRAYS', 1.0, 1.35, 18.38, 0.6, 0.18, { rotY: 180, style: 'shop', bg: '#2e4a2e', fg: '#efe6c8' });
      for (let k = 0; k < 5; k++) K.box(1.0, 1.0 + k * 0.025, 18.7, 0.46, 0.02, 0.34, { color: '#8a3a2a', roughness: 0.5 }, { rot: k * 5 });
      for (const [x, z] of [[8, 19], [23, 19], [27, 9.5]]) K.prop('bin', x, z, 0, { variant: 'street' });
      K.prop('fridge', 1.4, 2.0, 90, { variant: 'drinks', lit: true });
      K.box(3.0, 0, 19.55, 3.0, 0.95, 0.6, { tex: 'metal', color: '#b9bcb6' }, { collide: true });
      for (let k = 0; k < 6; k++) K.cyl(1.9 + k * 0.4, 0.95, 19.5, 0.04, 0.14, { color: ['#b3261e', '#c9a822', '#d8d4c4'][k % 3], roughness: 0.4 });
      K.prop('mop_bucket', 25.8, 3.2, 60, { sign: true });
      // the order kiosk by the payphone: a screen, a receipt printer (the Outage prints the Plaza's layout)
      K.box(4.2, 0, 8.3, 0.5, 1.15, 0.45, { color: '#1f2a2b', roughness: 0.5 }, { collide: true });
      K.box(4.2, 1.15, 8.3, 0.56, 0.5, 0.12, { color: '#141717', roughness: 0.4 }, { rot: 0 });
      K.plane(4.2, 1.4, 8.37, 0.44, 0.32, C1_tex('kiosk', 256, 192, (x, w, h) => { x.fillStyle = '#0e6f6e'; x.fillRect(0, 0, w, h); tx(x, 'ORDER HERE', w / 2, 60, 26, '#ffffff', { align: 'center', weight: 'bold' }); tx(x, 'TOUCH TO START', w / 2, 120, 16, '#ffcc00', { align: 'center' }); }), { emissive: true, emissiveIntensity: 0.45, name: 'c1f_kiosk' });
      K.prop('printer', 4.2, 8.55, 0, { y: 1.15, variant: 'receipt' });
      K.writing('ASK THEM', 29.95, 2.2, 17.6, 1.4, { rotY: -90 });
      K.dress('papers', [2, 2, 28, 18], 10, { seed: 81 });
      K.dress('cups', [2, 3, 28, 18], 14, { seed: 82 });
      // ---- light: one working tube, the drinks fridge, the kiosk screen, the exit sign ------------------------------
      K.fogOnly(() => {
        K.light('fluoro', 9, H - 0.02, 10, { len: 1.2, intensity: 5, distance: 10, bank: 1, flicker: true });
        K.light('fluoro', 21, H - 0.02, 10, { len: 1.2, on: false });
        K.light('fluoro', 15, H - 0.02, 16, { len: 1.2, intensity: 4, distance: 9, bank: 2 });
        K.light('screen', 1.9, 1.2, 2.0, { color: '#cfe8e6', intensity: 1.6, distance: 4.5 });
      });
      K.light('led', 15, 3.9, 19.9, { color: '#2aff5a', intensity: 2 });
      // ---- the Outage: circuit board through the carpet, receipts hanging, contracts, the receipt map -----------------
      K.outageOnly(() => {
        for (const [x, z, len] of [[5, 9, 2.4], [11, 14, 3], [16, 12, 2.2], [24, 14.5, 2.8], [8, 4, 2]]) K.prop('receipt_strip', x, z, (x * 13) % 90, { ceil: H, len });
        for (const [x, z, len] of [[13, 7.5, 2.6], [26, 9, 2.2], [7.5, 16, 2.8]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len });
        K.prop('receipt_curtain', 27.6, 2.2, 0, { ceil: H, w: 2.4, len: 2.6 });
        K.dress('contracts', [2, 2, 28, 18], 18, { seed: 83 });
        K.dress('receipts', [2, 2, 28, 18], 26, { seed: 84 });
        K.writing('FOLLOW UP TOMORROW', 0.1, 2.6, 9.5, 2.6, { rotY: 90, style: 'receipt' });
        K.light('fluoro', 15, H - 0.02, 16, { len: 1.2, intensity: 5, distance: 10, flicker: true, color: '#bfe0d4' });
        K.light('point', 27.6, 2.6, 1.2, { color: '#e8c21a', intensity: 2.5, distance: 7 });
        K.light('led', 4.2, 1.2, 8.56, { color: '#ff2a1c', blink: 0.7 });
        K.prop('receipt_strip', 4.2, 8.62, 0, { ceil: 1.25, len: 1.2 });
        K.pickup('rmap_plaza', 4.25, 0.02, 8.85, { id: 'c1_foodcourt:rmap', r: 1.3 });
        K.examine(4.2, 1.3, 8.6, ['The kiosk\'s printing. It won\'t stop.', 'It\'s not an order. It\'s the Plaza. [beat] Printed out like a receipt.'], { id: 'c1fc:kioskout', r: 1.4 });
      });
      // ---- examine ----------------------------------------------------------------------------------------------------
      K.examine(3.6, 1.6, 0.6, ['Noodle Bar. "Special: Combo 4." [beat] The menu board\'s been bleached white by the sun that doesn\'t get in here.', 'The shutter\'s padlocked at the floor.'], { id: 'c1fc:noodle', r: 1.8 });
      K.examine(10.4, 1.6, 0.6, 'Chicken and chips. The smell\'s still in the grout.', { id: 'c1fc:chicken', r: 1.8 });
      K.examine(17.2, 1.6, 0.6, ['The sushi train. The shutter\'s not all the way down.', 'The little plates are still on the belt. Going nowhere.'], { id: 'c1fc:sushi', r: 1.8 });
      K.examine(1.4, 1.3, 2.0, ['The drinks fridge still hums. Everything in it is cold.', 'Nobody\'s taken anything. Nobody\'s been hungry for a long time.'], { id: 'c1fc:fridge', r: 1.5 });
      K.examine(18.4, 0.6, 8.4, 'A chair on its side. Everyone else pushed theirs in.', { id: 'c1fc:chair', r: 1.3 });
      K.examine(9.5, 0.9, 11.5, ['Somebody\'s tray. Half a burger in its paper. A kids\' meal toy, still in the bag.', 'They got up in the middle of it.'], { id: 'c1fc:tray', r: 1.3 });
      K.examine(4.2, 1.3, 8.6, 'Order here. Touch to start. [beat] It\'s not taking orders.', { id: 'c1fc:kiosk', r: 1.3, world: 'fog' });
      K.examine(FC.kitchen[0], 1.5, 0.5, ['Staff only. The kitchen.', 'Every stall shares it. You can get right through to the back of the centre that way.'], { id: 'c1fc:kitchen', r: 1.2, world: 'fog' });
      K.examine(3.0, 1.1, 19.4, 'Sachets. Tomato sauce, sugar, salt. Hundreds of them. For all the people.', { id: 'c1fc:condiments', r: 1.3 });
      K.examine(0.4, 1.5, 6, 'The toilets. Locked. A sign says "Please ask at the Food Court counter for the key."', { id: 'c1fc:toilets', r: 0.9, world: 'fog' });
    },
    onUpdate() { C1_ringTick('c1_foodcourt'); C1_ambient(['#74827f', 0.5], ['#2a8a84', 0.3]); },
    onLeave() { C1_ringStop(); C1_ambientOff(); C1.onPhone = false; },
  });

  // =================================================================================================================
  // 1-9 THE KITCHEN (Outage only) — 10 × 6 m, the food court's shared back-of-house: stainless benches both sides, the
  // fryers and the hood, a coolroom; the food court door (west) and the service passage east to the store's back office.
  // =================================================================================================================
  defineRoom({
    id: 'c1_kitchen', name: 'KITCHEN', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'tile', ambient: 'interior',
    fog: { density: 0.034, color: '#122423' }, outageFog: { density: 0.034, color: '#122423' },
    bounds: [0, 0, 10, 6],
    entries: { food: [0.9, 3, 90], office: [9.1, 3, -90], start: [0.9, 3, 90] },
    cameras: [
      // tight statics at each end
      { id: 'c1_kitchen:west', vol: [4.4, 0, 10, 6], type: 'static', pos: [0.3, 2.3, 1.1], target: [7.5, 0.9, 3.4], fov: 'fit' },
      { id: 'c1_kitchen:east', vol: [0, 0, 4.4, 6], type: 'static', pos: [9.7, 2.3, 4.9], target: [2.2, 0.9, 2.8], fov: 'fit' },
    ],
    build(K) {
      const H = 2.9;
      K.roomBox(0, 0, 10, 6, { h: H, floor: { tex: 'tile', color: '#7e7f78' }, wall: { tex: 'tile_white', color: '#c8c8c0' }, ceiling: 'ceiling_tile', doors: [{ side: 'w', at: 3, w: 0.95 }, { side: 'e', at: 3, w: 0.95 }] });
      K.door({ id: 'c1_kitchen:food', x: -0.075, z: 3, rot: 90, w: 0.9, style: 'metal', to: 'c1_foodcourt', entry: 'kitchen', sign: 'FOOD COURT' });
      K.door({ id: 'c1_kitchen:office', x: 10.075, z: 3, rot: 90, w: 0.9, style: 'metal', to: 'c1_backoffice', entry: 'kitchen', sign: 'SERVICE' });
      // stainless benches down both sides, the fryers, the hood, the coolroom door, shelves of stock
      K.prop('counter', 3.6, 0.55, 0, { len: 5.0, variant: 'servery' });
      K.prop('counter', 6.2, 5.45, 180, { len: 5.0, variant: 'servery' });
      for (let k = 0; k < 3; k++) K.box(1.3 + k * 0.7, 0, 5.4, 0.62, 0.95, 0.7, { tex: 'metal', color: '#9aa09e', metalness: 0.4 }, { collide: true });
      for (let k = 0; k < 3; k++) K.box(1.3 + k * 0.7, 0.95, 5.4, 0.5, 0.08, 0.5, { color: '#2a2412', roughness: 0.15 });
      K.box(2.0, 2.1, 5.3, 2.4, 0.7, 1.1, { tex: 'metal', color: '#b9bcb6', metalness: 0.5 });
      K.prop('shelf', 8.9, 0.45, 0, { len: 1.8, load: 'stock' });
      K.box(9.2, 0, 5.62, 1.2, 2.2, 0.08, { tex: 'metal', color: '#c9ccca', metalness: 0.4 });
      K.sign('COOLROOM', 9.2, 1.9, 5.56, 0.5, 0.14, { rotY: 180, style: 'shop', bg: '#1f4b73', fg: '#f4efe4' });
      K.prop('mop_bucket', 8.6, 4.4, 30, {});
      K.box(5, 1.5, 0.12, 2.6, 0.04, 0.12, { tex: 'metal', color: '#9aa09e' });
      for (let k = 0; k < 7; k++) K.plane(4.0 + k * 0.33, 1.38, 0.19, 0.09, 0.22, 'receipt', { rotY: 0 });
      // the Outage: receipts, contracts, a red tube, the coffee
      K.prop('receipt_curtain', 5, 3, 90, { ceil: H, w: 4, len: 1.6 });
      K.prop('tether_hanging', 7.2, 2.2, 0, { ceil: H, len: 1.5 });
      K.dress('receipts', [0.5, 1.2, 9.5, 4.8], 30, { seed: 91 });
      K.dress('contracts', [0.5, 1.2, 9.5, 4.8], 8, { seed: 92 });
      K.writing('WHO ARE YOU TRYING TO REACH', 5, 2.1, 5.92, 3.2, { rotY: 180, style: 'marker', world: 'outage' });
      K.light('fluoro', 5, H - 0.02, 3, { len: 1.2, intensity: 5, distance: 8, flicker: true, color: '#cfe8dc' });
      K.light('point', 2.0, 1.9, 4.6, { color: '#ff3b2a', intensity: 2.2, distance: 5 });
      K.pickup('coffee', 3.1, 0.94, 0.55, { id: 'c1_kitchen:coffee' });
      // examine
      K.examine(4.6, 1.4, 0.3, ['The docket rail. Every docket says the same thing.', 'Order 22. [beat] Customer callback.'], { id: 'c1k:dockets', r: 1.3 });
      K.examine(2.0, 1.1, 5.2, 'The fryers are full. The oil\'s gone black and set like tar.', { id: 'c1k:fryers', r: 1.4 });
      K.examine(9.2, 1.3, 5.3, 'The coolroom. It\'s warm. It\'s been warm a long time.', { id: 'c1k:coolroom', r: 1.2 });
      K.examine(6.2, 1.1, 5.0, 'A staff meal on a plate, cling-wrapped. A name on it in texta. The name\'s been scribbled out.', { id: 'c1k:meal', r: 1.3 });
      K.examine(8.9, 1.4, 0.8, 'Stock. Paper cups, lids, napkins. Enough for a crowd that isn\'t coming.', { id: 'c1k:shelf', r: 1.3 });
      K.examine(5, 1.6, 3, 'Receipts, hanging off the ceiling like streamers at a party.', { id: 'c1k:receipts', r: 1.6 });
      K.examine(8.6, 0.6, 4.4, 'A mop in a bucket of grey water. Somebody was halfway through the floor.', { id: 'c1k:mop', r: 1.2 });
      K.examine(7.2, 1.6, 2.2, 'A security tether, hanging from the ceiling. Nothing on the end of it.', { id: 'c1k:tether', r: 1.2 });
    },
    onUpdate() { C1_ambient(['#2a8a84', 0.3], ['#2a8a84', 0.3]); },
    onLeave() { C1_ambientOff(); },
  });

  // =================================================================================================================
  // 1F THE STORE — 20 × 16 m (x west → east, z 0 the back wall … 16 the concourse front). Chloe behind the counter at
  // the back under the clock (8:59); the back office door behind the counter (x 17.5) and its window (x 14.2…16.4); six
  // demo tables, every lock screen 8:59; the accessory wall (west); the leaderboard TV (east); the contract printer. The
  // Outage: the front is gone — the sales floor runs back into the dark in rows of demo tables, every phone ringing;
  // the counter holds the stack of contracts (Account Note 2); Chloe is gone.
  // =================================================================================================================
  const ST = { h: 3.3, chloe: [10, 2.25], deep: 56 };
  const C1_ringMat = new THREE.MeshBasicMaterial({ map: null, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  C1_ringMat.userData.shared = true;
  const ringScreenTex = () => C1_tex('ringscr', 128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b3a38'); g.addColorStop(1, '#041414');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    tx(x, 'INCOMING', w / 2, h * 0.22, 17, '#dff2ec', { align: 'center', weight: 'bold' });
    tx(x, 'CALL', w / 2, h * 0.3, 17, '#dff2ec', { align: 'center', weight: 'bold' });
    tx(x, 'ACCT 4471-0932', w / 2, h * 0.42, 11, '#9fc4c0', { align: 'center', font: FN.mono });
    x.fillStyle = '#2fbf5a'; x.beginPath(); x.arc(w * 0.3, h * 0.82, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(w * 0.7, h * 0.82, 16, 0, Math.PI * 2); x.fill();
  });
  C1_ringMat.map = ringScreenTex();
  defineRoom({
    id: 'c1_store', name: 'THE STORE', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'vinyl', ambient: 'store',
    fog: { density: 0.026, color: '#5a6664' }, outageFog: { density: 0.045, color: '#0c1a19' },
    surfaces: [{ box: [0, 0, 20, 2.6], s: 'vinyl' }],
    bounds: [0, 0, 20, ST.deep],
    entries: { door: [10, 15.2, 180], office: [17.5, 1.05, 0], start: [10, 15.2, 180] },
    cameras: [
      // low behind the counter, looking out over it to the front (panning after him)
      { id: 'c1_store:counter', vol: [0, 9.5, 20, 17.6], type: 'pan', pos: [12.8, 1.3, 0.8], target: [10, 1.0, 12.5], fov: 50, pan: { lag: 0.35, yaw: 55, pitch: 25 } },
      // the reverse, from the door: the floor, the demo tables, the counter and whoever is behind it
      { id: 'c1_store:door', vol: [0, 2.6, 20, 9.5], type: 'pan', pos: [10, 2.2, 16.1], target: [10, 1.2, 3.8], fov: 46, pan: { lag: 0.35, yaw: 60, pitch: 30 } },
      // high corner (north-east), along the staff side behind the counter
      { id: 'c1_store:staff', vol: [0, 0, 15.2, 2.6], type: 'static', pos: [19.6, 3.05, 0.4], target: [7.5, 0.8, 1.7], fov: 'fit' },
      // the back office door and its window, from out on the floor
      { id: 'c1_store:office', vol: [15.2, 0, 20, 2.6], type: 'static', pos: [9.2, 2.3, 7.4], target: [17.3, 1.0, 1.0], fov: 'fit' },
      // the Outage: from out on the endless floor, back at the counter and its stack of contracts
      { id: 'c1_store:mid', vol: [0, 9.5, 20, 16.4], world: 'outage', pri: 1, type: 'pan', pos: [16.2, 2.7, 20.6], target: [10.4, 1.0, 8.5], fov: 46, pan: { lag: 0.35, yaw: 55, pitch: 25 } },
      // the Outage: the sales floor running back into the dark
      { id: 'c1_store:deep', vol: [0, 16.4, 20, ST.deep], world: 'outage', pri: 1, type: 'pan', pos: [10, 2.9, 11.5], target: [10, 0.8, 26], fov: 44, pan: { lag: 0.4, yaw: 60, pitch: 30 } },
    ],
    build(K) {
      const H = ST.h;
      K.floor(0, 0, 20, 16.4, { tex: 'vinyl_retail', color: '#d8d6ce' });
      K.ceiling(0, 0, 20, 16.4, H);
      // walls: back (the office door at 17.5, the office window), sides; the front only in the Fog world
      K.wall(-0.15, -0.075, 20.15, -0.075, H, { tex: 'plaster', color: '#e2e0d8' }, { openings: [{ at: 15.45, w: 2.2, h: 1.25, sill: 0.95, glass: true }, { at: 17.65, w: 0.95, h: 2.15 }], skirting: '#10403f' });
      K.door({ id: 'c1_store:office', x: 17.5, z: -0.075, rot: 0, w: 0.9, style: 'wood', to: 'c1_backoffice', entry: 'store', color: '#d8d0bc', sign: 'STAFF ONLY', signBack: 'SALES FLOOR' });
      K.wall(-0.075, 16.4, -0.075, -0.15, H, { tex: 'plaster', color: '#e2e0d8' }, { skirting: '#10403f' });
      K.wall(20.075, -0.15, 20.075, 16.4, H, { tex: 'plaster', color: '#e2e0d8' }, { skirting: '#10403f' });
      K.fogOnly(() => {
        K.wall(20.15, 16.475, -0.15, 16.475, H, 'glass', { openings: [{ at: 10.15, w: 3.0, h: 2.8 }], collideH: H });
        for (let x = 0.2; x < 20; x += 2.45) K.box(x, 0, 16.47, 0.06, H, 0.12, { tex: 'metal', color: '#b9bcb6' });
        K.box(10, 2.8, 16.47, 20.3, H - 2.8, 0.2, { color: '#10403f', roughness: 0.5 });
        for (const x of [8.2, 11.8]) { K.box(x, 0, 15.7, 0.12, 1.5, 0.4, { color: '#c9ccca', roughness: 0.3 }, { collide: true }); K.light('led', x, 1.45, 15.7, { color: '#2aff5a', intensity: 1.5 }); }
        K.box(10, 0, 15.2, 2.4, 0.01, 1.4, { tex: 'fabric_knit', color: '#10403f' });
        K.plane(10, 0.012, 15.2, 1.6, 0.5, C1_tex('mat', 256, 80, (x, w, h) => { x.fillStyle = '#10403f'; x.fillRect(0, 0, w, h); tx(x, 'WELCOME IN', w / 2, 52, 30, '#ffcc00', { align: 'center', weight: 'bold' }); }), { rot: [-90, 0, 180] });
        K.plane(10, 1.6, 17.4, 20, 3.2, { color: '#0e1413', roughness: 1 }, { rotY: 180 });   // the dark concourse outside
        K.exit({ id: 'c1_store:door', box: [8.6, 16.45, 11.4, 16.95], to: 'c1_concourse', entry: 'store', sound: 'none' });
        K.floor(8.5, 16.4, 11.5, 17.0, { tex: 'vinyl_retail', color: '#d8d6ce' });
      });
      // the counter (two bays), the contract printer, the EFTPOS, and the back wall: the lit wordmark, the clock
      K.prop('counter', 8, 3.2, 0, { len: 4, printer: false });
      K.prop('counter', 12, 3.2, 0, { len: 4, printer: true });
      K.plane(10, 2.05, 0.02, 3.6, 0.75, C1_tex('backsign', 512, 110, (x, w, h) => { x.fillStyle = '#0e6f6e'; x.fillRect(0, 0, w, h); Tex.drawWordmark(x, w * 0.32, h * 0.78, h * 0.62, { color: '#ffcc00' }); }), { emissive: true, emissiveIntensity: 0.9 });
      const clk = K.prop('clock', 10, 0.0, 0, { time: [8, 59], mount: 2.85, name: 'c1st_clock' });
      void clk;
      K.sticker('sticker02', 9.2, 0.32, 2.84, 180, {});
      // the staff side: stock shelves, the safe, the back office's window (a lit monitor beyond), a stool
      K.prop('shelf', 2.2, 0.35, 0, { len: 3.2, h: 2.2, load: 'stock' });
      K.prop('shelf', 5.4, 0.35, 0, { len: 2.4, h: 2.2, load: 'boxes' });
      K.box(13.1, 0, 0.45, 0.6, 0.9, 0.6, { tex: 'metal', color: '#3a3f3d', metalness: 0.4 }, { collide: true });
      K.prop('stool', 11.2, 2.1, 20, { variant: 'bar' });
      K.box(15.3, 0.9, -0.6, 2.4, 1.4, 0.02, { color: '#0e1110', roughness: 1 });
      K.box(15.8, 0.95, -0.4, 0.5, 0.32, 0.04, { color: '#3a6a8a', emissive: '#2a5a7a', emissiveIntensity: 0.6 });
      // six demo tables, every lock screen 8:59
      for (const [x, z] of [[5, 7.4], [10, 7.4], [15, 7.4], [5, 11.4], [10, 11.4], [15, 11.4]]) K.prop('demo_table', x, z, 0, { len: 1.8, n: 6, time: '8:59' });
      // the accessory wall (west), the leaderboard (east), plan posters, the waiting chairs, a queue barrier
      for (const z of [4.4, 7.0, 9.6, 12.2]) K.prop('accessory_wall', 0.35, z, 90, { len: 2.5 });
      K.prop('leaderboard', 19.92, 5.6, -90, { mount: 2.1, w: 1.4, text: 'STORE LEADERBOARD — SEPTEMBER' });
      for (const [z, t] of [[9.2, 'SWITCH\n& SAVE'], [12.4, 'UNLIMITED\nDATA'], [2.6, 'ASK US\nABOUT NBN']]) K.prop('poster', 19.93, z, -90, { style: 'plan', text: t, mount: 1.6 });
      for (let k = 0; k < 3; k++) K.prop('chair', 19.3, 13.6 + k * 0.62, -90, { variant: 'waiting' });
      for (const x of [13.5, 16.2]) K.cyl(x, 0, 5.4, 0.04, 0.95, { tex: 'metal', color: '#c9ccca' }, { collide: true });
      K.box(14.85, 0.85, 5.4, 2.7, 0.06, 0.02, { color: '#10403f' });
      K.sign('PLEASE WAIT HERE\nTO BE SERVED', 13.5, 1.2, 5.45, 0.5, 0.3, { style: 'shop', bg: '#ffcc00', fg: '#10403f' });
      K.dress('receipts', [2, 3, 18, 15], 6, { seed: 101, world: 'fog' });
      // the lights: the store is the only lit place in the centre
      K.fogOnly(() => {
        for (const [x, z, real] of [[5, 5.5, true], [15, 5.5, true], [5, 11.5, false], [15, 11.5, true], [10, 9, false], [10, 14.5, true]]) K.light('fluoro', x, H - 0.02, z, { len: 1.2, diffuser: true, intensity: 7, distance: 9, bank: z < 9 ? 1 : 2, real });
        K.light('point', 10, 2.4, 1.6, { color: '#e8f4ef', intensity: 4, distance: 6, bank: 1 });
      });
      // ---- the Outage: the floor runs back into the dark; rows of demo tables ringing; contracts on the counter -------
      K.outageOnly(() => {
        K.floor(0, 16.4, 20, ST.deep, { tex: 'vinyl_retail', color: '#d8d6ce' });
        K.ceiling(0, 16.4, 20, ST.deep, H);
        K.wall(-0.075, ST.deep, -0.075, 16.4, H, { tex: 'plaster', color: '#e2e0d8' });
        K.wall(20.075, 16.4, 20.075, ST.deep, H, { tex: 'plaster', color: '#e2e0d8' });
        K.fogWall(0, ST.deep - 2.4, 20, ST.deep, 'It just keeps going. There\'s nothing at the end of it.');
        const ringGeo = [];
        for (let z = 17.5; z < ST.deep - 3; z += 4.2) for (const x of [5, 10, 15]) {
          K.prop('demo_table', x, z, 0, { len: 1.8, n: 6, time: 'CALL' });
          ringGeo.push([x, z]);
        }
        // a flashing overlay on every table's screens (one mesh, one material, ringing in time)
        const g = new THREE.PlaneGeometry(1.6, 0.36); g.rotateX(-Math.PI / 2 + 0.96);
        const items = [];
        for (const [x, z] of [...ringGeo, [5, 7.4], [10, 7.4], [15, 7.4], [5, 11.4], [10, 11.4], [15, 11.4]]) for (const dz of [0.24, -0.22]) items.push({ geo: g, m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0.99, z + dz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dz < 0 ? Math.PI : 0), new THREE.Vector3(1, 1, 1)) });
        const ov = new THREE.Mesh(Kit.mergeGeometries(items), C1_ringMat); ov.renderOrder = 2; ov.userData.ownedGeo = true;
        K.mesh(ov, { name: 'c1st_ringov' });
        K.animate((dt, t) => { C1_ringMat.opacity = 0.35 + 0.55 * (Math.sin(t * 9) > 0.2 ? 1 : 0) * ((t % 1.6) < 1.1 ? 1 : 0.2); });
        // the counter: a tall stack of contracts, Account Note 2 on top
        K.prop('contract_stack', 10.6, 3.15, 12, { y: 1.0, h: 1.5 });
        K.prop('contract_stack', 9.9, 3.25, -8, { y: 1.0, h: 1.1 });
        K.prop('contract_stack', 11.3, 3.1, 30, { y: 1.0, h: 0.8 });
        K.doc('acct2', 10.62, 2.52, 3.15, { id: 'c1_store:acct2', model: 'paper', rot: 12, r: 1.6 });
        K.dress('contracts', [1, 3, 19, ST.deep - 3], 50, { seed: 102 });
        K.dress('receipts', [1, 3, 19, ST.deep - 3], 40, { seed: 103 });
        for (const [x, z, len] of [[3, 6, 1.4], [8, 13, 1.6], [16, 9, 1.2], [12, 20, 1.8], [4, 27, 1.5], [17, 32, 1.7], [9, 40, 1.4]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len });
        for (const [x, z] of [[6, 18], [14, 24], [10, 31], [5, 38], [15, 45]]) K.prop('receipt_strip', x, z, (x * 11) % 90, { ceil: H, len: 1.6 });
        K.writing('FOLLOW UP TOMORROW', 19.95, 1.9, 22, 3.4, { rotY: -90, style: 'marker' });
        K.writing('IT\'LL BE FINE', 0.05, 1.9, 30, 3.0, { rotY: 90, style: 'receipt' });
        K.writing('ASK THEM', 19.95, 1.8, 36, 2.2, { rotY: -90, style: 'marker' });
        K.light('fluoro', 10, H - 0.02, 4.8, { len: 1.2, intensity: 6, distance: 9, flicker: true, color: '#cfe8dc' });
        K.light('point', 12.5, 2.7, 12.6, { color: '#8fd8cc', intensity: 2.4, distance: 9 });
        K.light('point', 10, 1.4, 19.5, { color: '#5fd6c8', intensity: 2.2, distance: 9 });
        K.light('point', 10, 1.4, 32, { color: '#5fd6c8', intensity: 1.6, distance: 8 });
        K.light('led', 17.65, 2.32, 0.06, { color: '#ff2a1c', blink: 1.1 });
        K.examine(10.6, 1.6, 3.15, 'My signature. [beat] All of them are mine.', { id: 'c1st:contracts', r: 1.7 });
        K.examine(10, 1.3, 21.6, ['Every phone. Every one of them ringing.', 'The same number on every screen.'], { id: 'c1st:ringing', r: 2.2 });
      });
      // ---- Chloe (the Fog world, from 1-1 on) --------------------------------------------------------------------------
      K.npc('chloe', 'chloe', ST.chloe[0], ST.chloe[1], 0, { anim: 'idle', world: 'fog', talk: (G) => C1_chloeTalk(G), whenTalk: () => !S.outage && done('cs:1-1') });
      // ---- examine (the spec's lines) ------------------------------------------------------------------------------
      K.examine(10, 1.1, 7.4, 'Every phone says 8:59.', { id: 'c1st:demo', r: 1.5, world: 'fog' });
      K.examine(0.9, 1.4, 8.3, 'Screen protectors. Cases. Chargers. I put one of each on every sale.', { id: 'c1st:accessories', r: 1.7 });
      K.examine(12.9, 1.15, 3.0, 'The contract printer\'s warm. Like someone just printed one.', { id: 'c1st:printer', r: 1.2, world: 'fog' });
      K.examine(19.7, 2.0, 5.6, 'CHLOE, number one. [beat] Me, twenty-third. Out of twenty-four.', { id: 'c1st:leaderboard', r: 2.0 });
      K.examine(10, 2.85, 0.4, 'Eight fifty-nine.', { id: 'c1st:clock', r: 1.4, world: 'fog', when: () => done('cs:1-1') });
      K.examine(19.3, 0.9, 14.2, 'Three chairs for the queue. Nobody\'s ever waited long enough to sit in them.', { id: 'c1st:chairs', r: 1.4 });
      K.examine(14.9, 1.0, 5.5, '"Please wait here to be served." [beat] There\'s nobody to serve.', { id: 'c1st:queue', r: 1.2 });
      K.examine(3.4, 1.4, 0.8, 'Stock. Boxes and boxes of the same three handsets.', { id: 'c1st:stock', r: 1.6 });
      K.examine(15.4, 1.5, 0.3, 'The back office. The monitor\'s on in there.', { id: 'c1st:window', r: 1.4, world: 'fog' });
    },
    async onEnter(G, from) {
      if (S.outage || S.chapter !== 1) return;
      if (from === 'c1_concourse') G.sfx('chime', { vol: 0.9 });
      if (!done('cs:1-1')) await G.cutscene('1-1');
    },
    onUpdate() {
      C1_ringTick('c1_store');
      C1_ambient(['#8a9896', 0.55], ['#2a8a84', 0.5]);
      // every display phone ringing (the Outage)
      if (S.outage && !C1.storeRings && typeof Snd !== 'undefined') { try { C1.storeRings = [[5, 20], [15, 27], [10, 36], [4, 44]].map(([x, z]) => Snd.play('ring', { loop: true, pos: [x, 1.0, z], vol: 0.55, gap: 0.6 + (x % 3) * 0.2 })); } catch (e) { C1.storeRings = []; } }
      if (!S.outage && C1.storeRings) C1_storeRingsOff();
    },
    onLeave() { C1_ringStop(); C1_ambientOff(); C1_storeRingsOff(); },
  });
  function C1_storeRingsOff() { for (const h of C1.storeRings || []) { try { h.stop(0.2); } catch (e) { /* audio */ } } C1.storeRings = null; }
  // Chloe, talked to again: the terminal line, then "Eleven." — cycling; after 1-4 she's got it
  async function C1_chloeTalk(G) {
    const A = G.actor('chloe');
    if (flag('c1_bossDone')) { A.eyes('down'); await G.say('CHLOE', 'Go on. I\'ve got it.'); return; }
    const n = (S.done['c1:chloeTalk'] | 0); S.done['c1:chloeTalk'] = n + 1;
    if (n % 2 === 0) {
      A.look(G.aidan); A.expr('smile_huge');
      await G.say('CHLOE', 'Terminal\'s in the back! You know the login.');
      A.look(null); A.expr('smile');
    } else {
      A.eyes('down'); A.expr('flat');
      await G.say('CHLOE', 'Eleven.');
      await G.beat();
      A.look(G.aidan); A.eyes('ahead'); A.expr('smile');
      await G.say('CHLOE', 'Sorry. I\'m listening. Eleven.');
      A.look(null);
    }
  }

  // =================================================================================================================
  // 1G THE BACK OFFICE — 6 × 5 m. The terminal on the desk (north wall) with Chloe's sticky note on the bezel; Huddle
  // Whiteboard 1; the window onto the sales floor; the door to the floor (south); the stockroom door (east: "Stock only.
  // It's locked." — in the Outage it opens); the service door to the kitchen (west; the Outage's way in).
  // =================================================================================================================
  const BO = { h: 2.7, term: [2.6, 0.3] };
  defineRoom({
    id: 'c1_backoffice', name: 'BACK OFFICE', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'carpet', ambient: 'office',
    fog: { density: 0.028, color: '#4a5655' }, outageFog: { density: 0.04, color: '#0c1a19' },
    bounds: [0, 0, 6, 5],
    entries: { store: [1.2, 4.2, 180], stock: [5.2, 2.5, -90], kitchen: [0.8, 3.4, 90], start: [1.2, 4.2, 180] },
    cameras: [
      // static over the terminal (from beyond the cutaway north wall), down across the office
      { id: 'c1_backoffice:terminal', vol: [0, 0, 6, 5], type: 'static', pos: [3.0, 2.55, -3.9], target: [3.0, 0.55, 3.2], fov: 'fit' },
      // through the office window from the sales floor (the stockroom door, the desk)
      { id: 'c1_backoffice:window', vol: [3.2, 1.3, 6, 3.9], pri: 1, type: 'static', pos: [4.1, 1.62, 9.6], target: [4.4, 1.05, 2.0], fov: 'fit' },
    ],
    build(K) {
      const H = BO.h;
      K.floor(-0.15, -0.15, 6.15, 5.15, { tex: 'carpet', color: '#5a6266' });
      K.ceiling(0, 0, 6, 5, H);
      K.wall(-0.15, -0.075, 6.15, -0.075, H, { tex: 'plaster', color: '#d8d4c8' }, { both: false });                  // north (cutaway)
      K.wall(-0.15, 5.075, 6.15, 5.075, H, { tex: 'plaster', color: '#d8d4c8' }, { openings: [{ at: 1.35, w: 0.95, h: 2.15 }, { at: 4.4, w: 2.2, h: 1.25, sill: 0.95, glass: true }] });
      K.wall(-0.075, 5.15, -0.075, -0.15, H, { tex: 'plaster', color: '#d8d4c8' }, { openings: [{ at: 1.75, w: 0.95, h: 2.15 }] });
      K.wall(6.075, -0.15, 6.075, 5.15, H, { tex: 'plaster', color: '#d8d4c8' }, { openings: [{ at: 2.65, w: 0.95, h: 2.15 }] });
      K.door({ id: 'c1_backoffice:store', x: 1.2, z: 5.075, rot: 0, w: 0.9, style: 'wood', to: 'c1_store', entry: 'office', color: '#d8d0bc', sign: 'STAFF ONLY', signBack: 'SALES FLOOR' });
      K.door({ id: 'c1_backoffice:stock', x: 6.075, z: 2.5, rot: 90, w: 0.9, style: 'metal', to: 'c1_stockroom', entry: 'door', locked: () => !S.outage, lockMsg: 'Stock only. It\'s locked.', sign: 'STOCK ONLY', mapMark: true });
      K.door({ id: 'c1_backoffice:kitchen', x: -0.075, z: 3.4, rot: 90, w: 0.9, style: 'metal', to: 'c1_kitchen', entry: 'office', locked: () => !S.outage, lockMsg: 'It\'s locked.', sign: 'SERVICE' });
      // beyond the window: the sales floor (lit in the Fog world, dark and ringing in the Outage)
      K.fogOnly(() => { K.plane(4.4, 1.6, 6.3, 3, 2.6, { color: '#dfe8e6', emissive: '#9fbcb8', emissiveIntensity: 0.5 }, { rotY: 180, emissive: true }); K.box(4.4, 0, 5.8, 2.6, 0.9, 0.5, { color: '#0e6f6e' }); });
      K.outageOnly(() => K.plane(4.4, 1.6, 6.3, 3, 2.6, { color: '#06100f', roughness: 1 }, { rotY: 180 }));
      // the terminal desk, Chloe's sticky note on the bezel, the PIN; her chair
      K.prop('desk', BO.term[0], 0.45, 180, { variant: 'office' });
      K.prop('office_chair', BO.term[0] - 0.1, 1.25, 170, {});
      const term = K.prop('terminal', BO.term[0], BO.term[1], 0, { y: 0.745, content: 'login', name: 'c1b_term' });
      void term;
      K.doc(pickDoc('pin_note'), BO.term[0] + 0.3, 1.13, BO.term[1] + 0.06, { id: 'c1_backoffice:pinnote', model: 'sticky', wall: true, rot: 0, r: 1.1 });
      K.interact(BO.term[0], 1.0, BO.term[1] + 0.3, (G) => C1_terminal(G), { id: 'c1_backoffice:terminal', r: 1.3, when: () => !flag('c1_address') });
      K.examine(BO.term[0], 1.0, BO.term[1] + 0.3, ['UNIT 9, HILLTOP VILLAGE, SIGNAL HILL. [beat] It\'s still on the screen.', 'Glitch. It was a glitch.'], { id: 'c1bo:termafter', r: 1.3, when: () => flag('c1_address') });
      K.light('screen', BO.term[0], 1.1, BO.term[1] + 0.5, { color: '#6f9fcf', intensity: 1.4, distance: 3.2 });
      K.prop('mug', BO.term[0] - 0.55, 0.3, 20, { y: 0.745, text: 'CHLOE' });
      for (let k = 0; k < 4; k++) K.prop('energy_can', BO.term[0] + 0.6 + k * 0.09, 0.62 + (k % 2) * 0.1, k * 40, { y: 0.745 });
      K.prop('printer', 4.6, 0.35, 180, { y: 0.745 });
      K.box(4.6, 0, 0.4, 1.0, 0.745, 0.6, { color: '#8a8478' }, { collide: true });
      // Huddle Whiteboard 1 on the west wall (north of the kitchen door); Chloe's pins, framed, above the desk
      K.doc('huddle1', 0.02, 1.45, 1.2, { id: 'c1_backoffice:huddle1', model: 'board', wall: true, rot: 90, r: 1.4 });
      const certTex = (i) => C1_tex('tp' + i, 128, 96, (x, w, h, r) => {
        x.fillStyle = '#f4f0e2'; x.fillRect(0, 0, w, h); x.strokeStyle = '#b89a3a'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8);
        tx(x, 'TOP PERFORMER', w / 2, 30, 12, '#10403f', { align: 'center', weight: 'bold' });
        tx(x, 'CHLOE', w / 2, 56, 16, '#222', { align: 'center', font: FN.serif, weight: 'bold' });
        tx(x, ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST'][i], w / 2, 78, 10, '#555', { align: 'center' });
        x.fillStyle = '#d8b440'; x.beginPath(); x.arc(20, h - 18, 7, 0, Math.PI * 2); x.fill();
      });
      for (let i = 0; i < 8; i++) K.plane(0.9 + (i % 4) * 0.52, 1.7 + Math.floor(i / 4) * 0.42, 0.02, 0.4, 0.3, certTex(i), {});
      K.prop('filing_cabinet', 5.6, 4.5, -90, {});
      K.box(0.5, 0, 4.55, 0.6, 0.75, 0.55, { tex: 'metal', color: '#3a3f3d', metalness: 0.4 }, { collide: true });
      K.prop('shelf', 5.72, 0.7, -90, { len: 1.2, h: 2.0, load: 'boxes' });
      K.prop('corkboard', 4.0, 5.0, 180, { w: 1.0, h: 0.7, mount: 1.6, roster: true });
      K.box(3.1, 1.75, 4.95, 0.07, 0.07, 0.07, { tex: 'metal', color: '#6d726c' });
      K.box(3.1, 1.2, 4.9, 0.44, 0.62, 0.05, { tex: 'fabric_knit', color: '#10403f' });
      K.dress('papers', [0.5, 1.5, 5.5, 4.5], 6, { seed: 111 });
      K.fogOnly(() => { K.light('fluoro', 3, H - 0.02, 2.5, { len: 1.2, intensity: 5, distance: 7, bank: 1 }); });
      K.outageOnly(() => {
        K.light('fluoro', 3, H - 0.02, 2.5, { len: 1.2, intensity: 4, distance: 7, flicker: true, color: '#cfe8dc' });
        K.light('led', 6.0, 2.3, 2.5, { color: '#2aff5a', intensity: 3, halo: 0.4 });
        K.prop('receipt_strip', 1.8, 2.5, 30, { ceil: H, len: 1.3 });
        K.prop('tether_hanging', 4.3, 3.2, 0, { ceil: H, len: 1.2 });
        K.dress('receipts', [0.5, 1.5, 5.5, 4.5], 16, { seed: 112 });
        K.writing('DID YOU CHECK', 5.98, 1.5, 4.2, 1.2, { rotY: -90, style: 'marker' });
      });
      // examine
      K.examine(3.8, 1.5, 0.3, ['Top Performer. Chloe. January, February, March, April …', 'There\'s room on the wall for more. She measured it.'], { id: 'c1bo:certs', r: 1.3 });
      K.examine(BO.term[0] + 0.6, 0.9, 0.62, 'Energy drinks. Four empties, lined up by the keyboard like tally marks.', { id: 'c1bo:cans', r: 1.0 });
      K.examine(6.0, 1.5, 2.5, 'Stock only. It\'s locked.', { id: 'c1bo:stockdoor', r: 1.1, world: 'fog' });
      K.examine(3.1, 1.3, 4.8, ['Her jacket. On the hook since the start of the month, by the look of it.', 'The pockets are full of receipts.'], { id: 'c1bo:jacket', r: 1.1 });
      K.examine(0.5, 1.0, 4.55, 'The safe. Tomorrow\'s float. Yesterday\'s float. The same float.', { id: 'c1bo:safe', r: 1.1 });
      K.examine(4.6, 1.0, 0.35, 'The printer. A contract in the tray, printed and never signed.', { id: 'c1bo:printer', r: 1.1 });
      K.examine(4.0, 1.6, 4.9, 'The roster. Chloe\'s on every shift. Every one.', { id: 'c1bo:roster', r: 1.1 });
    },
    async onEnter(G, from) {
      if (S.outage && S.chapter === 1 && G.once('c1:outageOffice')) {
        await G.wait(0.8);
        await G.think('The stockroom door. [beat] It\'s open.');
        note(G, 'The stockroom. Behind the back office.', 'c1_obj');
      }
    },
    onUpdate() { C1_ringTick('c1_backoffice'); C1_ambient(['#8a9896', 0.5], ['#2a8a84', 0.28]); },
    onLeave() { C1_ringStop(); C1_ambientOff(); },
  });

  // =================================================================================================================
  // 1I THE STOCKROOM — 12 × 10 m, 5 m to the ceiling (the boss arena). The door from the back office (west wall); steel
  // shelving on the north, south and west walls; the chain-link returns cage across the east end.
  // =================================================================================================================
  const SK = { h: 5, door: [0, 7], cage: [10.2, 5] };
  const SK_RET = [[3.2, 2.6], [6.4, 7.8], [2.6, 5.4], [7.2, 3.0], [4.8, 5.8]];            // where returns 5–9 land
  defineRoom({
    id: 'c1_stockroom', name: 'STOCKROOM', area: 'SIGNAL HILL PLAZA', chapter: 1, outdoor: false, surface: 'concrete', ambient: 'interior',
    fog: { density: 0.03, color: '#3b4543' }, outageFog: { density: 0.036, color: '#0c1a19' },
    bounds: [0, 0, 12, 10],
    entries: { door: [0.9, SK.door[1], 90], start: [0.9, SK.door[1], 90] },
    cameras: [
      // wide from the door: the whole floor to the cage
      { id: 'c1_stockroom:door', vol: [4.4, 0, 12, 7.4], type: 'static', pos: [0.35, 3.6, 6.9], target: [8.6, 1.3, 4.2], fov: 'fit' },
      // high over the west shelving, down along the south aisle to the cage
      { id: 'c1_stockroom:shelves', vol: [4.4, 7.4, 12, 10], type: 'static', pos: [0.9, 4.4, 0.7], target: [8.2, 0.9, 8.2], fov: 'fit' },
      // high in the far corner, down over the door end
      { id: 'c1_stockroom:high', vol: [0, 0, 4.4, 10], type: 'static', pos: [11.5, 4.75, 9.6], target: [1.8, 0.6, 5.0], fov: 'fit' },
    ],
    // the Returns Cage: a heap of returns in front of the cage until 1-3 raises it
    spawns: [
      { id: 'c1_stockroom:cage', type: 'c1_cage', world: 'outage', pos: [8.2, 5], rot: -90, when: () => !flag('c1_bossDone') },
    ],
    build(K) {
      const H = SK.h;
      K.floor(0, 0, 12, 10, { tex: 'concrete', color: '#8a877e' });
      K.ceiling(0, 0, 12, 10, H, 'concrete');
      K.wall(-0.15, -0.075, 12.15, -0.075, H, 'concrete');
      K.wall(12.15, 10.075, -0.15, 10.075, H, 'concrete', { both: false });                   // south (the shelves cutaway)
      K.wall(-0.075, 10.15, -0.075, -0.15, H, 'concrete', { openings: [{ at: 3.15, w: 0.95, h: 2.15 }] });
      K.wall(12.075, -0.15, 12.075, 10.15, H, 'concrete');
      K.door({ id: 'c1_stockroom:door', x: -0.075, z: SK.door[1], rot: 90, w: 0.9, style: 'metal', to: 'c1_backoffice', entry: 'stock', locked: () => C1.bossLock, lockMsg: 'It won\'t open.' });
      // steel shelving on three walls (north, south, west), the returns cage across the east end
      for (let x = 1.4; x < 9.5; x += 2.0) K.prop('shelf', x, 0.4, 0, { len: 1.9, h: 2.6, load: x < 5 ? 'returns' : 'mixed' });
      for (let x = 1.4; x < 9.5; x += 2.0) K.prop('shelf', x, 9.6, 180, { len: 1.9, h: 2.6, load: x > 5 ? 'returns' : 'boxes' });
      for (const z of [1.6, 3.8]) K.prop('shelf', 0.4, z, 90, { len: 2.0, h: 2.6, load: 'stock' });
      const cage = K.prop('returns_cage', SK.cage[0], SK.cage[1], -90, { w: 7.6, d: 3.2, h: 2.8, name: 'c1sk_cage', open: false, fill: true });
      void cage;
      K.sign('RETURNS — DO NOT SELL', 8.55, 3.25, 5, 2.2, 0.4, { rotY: -90, style: 'warning' });
      // clutter: a pallet jack, a table with the tape gun, box piles, a ladder, the goods-in trolley
      K.box(5.2, 0, 1.9, 1.6, 0.9, 0.7, { tex: 'metal', color: '#6d726c' }, { collide: true });
      K.prop('box', 4.8, 1.9, 10, { y: 0.9, open: true, text: 'RETURNS' });
      K.box(5.7, 0.9, 1.9, 0.18, 0.12, 0.1, { color: '#b3261e', roughness: 0.5 });
      K.prop('box_stack', 7.4, 8.7, 0, { n: 7 });
      K.prop('pallet', 2.2, 8.4, 20, { load: 'boxes' });
      K.box(3.7, 0, 8.5, 0.5, 0.2, 1.4, { tex: 'metal', color: '#c9a822' }, { collide: true });
      K.prop('satchel', 6.8, 5.6, 40, {}); K.prop('satchel', 3.4, 4.2, -30, {});
      K.dress('boxes', [2, 2.4, 8, 7.6], 5, { seed: 121 });
      K.dress('papers', [1, 1, 8.4, 9], 10, { seed: 122 });
      // light: caged tubes (dead in the Fog world but one); the Outage: flickering, red over the cage
      K.fogOnly(() => { K.light('fluoro', 4, H - 0.3, 5, { len: 1.2, intensity: 6, distance: 10, bank: 1 }); K.light('fluoro', 8.5, H - 0.3, 5, { len: 1.2, on: false }); });
      K.outageOnly(() => {
        K.light('fluoro', 4, H - 0.3, 5, { len: 1.2, intensity: 7, distance: 12, flicker: true, color: '#cfe8dc' });
        K.light('point', 9.2, 3.6, 5, { color: '#ff2a1c', intensity: 5, distance: 11 });
        K.light('point', 2, 2.6, 8.2, { color: '#e8c21a', intensity: 1.6, distance: 6 });
        for (const [x, z, len] of [[3, 3, 2.4], [6, 7, 2.8], [8.5, 2.2, 2.2], [2.2, 6.5, 2.0]]) K.prop('tether_hanging', x, z, 0, { ceil: H, len });
        K.prop('receipt_curtain', 5.5, 0.9, 0, { ceil: H, w: 6, len: 2.4 });
        K.dress('receipts', [1, 1, 8.4, 9], 24, { seed: 123 });
        K.writing('YOU SAID IT WOULD WORK HERE', 11.98, 3.6, 5, 4.2, { rotY: -90, style: 'marker' });
      });
      // the returns that pop loose in the fight (5–9), each lands note-up (hidden until it has landed)
      SK_RET.forEach(([x, z], i) => {
        const n = i + 5, key = 'c1:ret' + n;
        const grp = new THREE.Group(); grp.name = 'c1sk_ret' + n;
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.32), K.mat({ tex: 'plastic_sheet', color: '#7d8280', roughness: 0.55 }));
        bag.position.y = 0.035; bag.userData.ownedGeo = true; grp.add(bag);
        const nt = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: slipTex(DOCUMENTS['returns' + n] ? DOCUMENTS['returns' + n].text : '', {}), roughness: 0.8 }));
        nt.rotation.x = -Math.PI / 2; nt.position.set(0.02, 0.072, 0.0); nt.userData.ownedGeo = true; grp.add(nt);
        grp.position.set(x, 0, z); grp.rotation.y = (i * 71) * D2R;
        K.mesh(grp, { name: grp.name, world: 'outage' });
        K.animate(() => { const v = done(key); if (grp.visible !== v && S.outage) grp.visible = v; });
        K.doc('returns' + n, x, 0.05, z, { id: 'c1_stockroom:ret' + n, model: 'none', r: 1.2, when: () => done(key) && S.outage });
      });
      // 1-4: Returns Notes 1–4 face-up round him (the cutscene places the group where he kneels; hidden until then)
      {
        const g = new THREE.Group(); g.name = 'c1sk_notes'; g.visible = false;
        for (let i = 0; i < 4; i++) {
          const t = DOCUMENTS['returns' + (i + 1)] ? DOCUMENTS['returns' + (i + 1)].text : '';
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: slipTex(t, { size: 34 }), roughness: 0.8 }));
          m.name = 'c1_note' + i; m.userData.ownedGeo = true;
          m.rotation.set(-Math.PI / 2, 0, Math.PI + [-0.12, 0.08, -0.04, 0.14][i]);           // text top away from him
          m.position.set(0.66 - i * 0.44, 0.006 + i * 0.0015, 0.72 + [0.02, -0.04, 0.05, -0.01][i]);
          g.add(m);
        }
        K.mesh(g, { name: 'c1sk_notes' });
      }
      // the tear: while it kneels, E at the glow in its chest (the point follows its chest)
      const tear = K.interact(8.2, 1.4, 5, (G) => C1_tear(G), { id: 'c1_stockroom:tear', r: 2.6, world: 'outage', when: () => !!(C1.boss && C1.boss.data.state === 'kneel') });
      K.animate(() => { const e = C1.boss, cp = e && e.data.chestPos; if (cp && tear.rec) tear.rec.pos.set(cp.x, Math.min(1.5, cp.y), cp.z); });
      // 1-3: walking in toward the cage (the Outage)
      K.trigger([1.2, 3.8, 3.2, 9.4], (G) => G.cutscene('1-3'), { id: 'c1_stockroom:13', world: 'outage', when: () => !flag('c1_bossDone') });
      // examine
      K.examine(9.2, 1.6, 5, ['Returns. Satchels and boxes up to the roof of the cage.', 'Every one of them came back.'], { id: 'c1sk:cage', r: 2.4, when: () => !C1.bossOn });
      K.examine(5.2, 1.1, 1.9, 'The tape gun\'s still loaded. Someone was taping returns shut to send back.', { id: 'c1sk:table', r: 1.4 });
      K.examine(1.4, 1.5, 0.9, 'Returns. Returns. Returns. The labels all say the same thing: NO FAULT FOUND.', { id: 'c1sk:shelf', r: 1.4 });
      K.examine(0.9, 1.5, 3.8, 'Stock nobody\'s going to sell. Still in the plastic.', { id: 'c1sk:westshelf', r: 1.4 });
      K.examine(7.4, 1.0, 8.7, 'Boxes on boxes. "FRAGILE." "THIS WAY UP." "RETURN TO SENDER."', { id: 'c1sk:boxes', r: 1.4 });
      K.examine(8.3, 1.8, 5, ['"Returns. Do not sell."', 'Somebody still has to open every one of them.'], { id: 'c1sk:sign', r: 1.8, when: () => !C1.bossOn && !done('c1:collapsed') });
      K.examine(2.2, 0.6, 8.4, 'A pallet of boxes. Delivered. Never signed for.', { id: 'c1sk:pallet', r: 1.3 });
      K.examine(3.7, 0.4, 8.5, 'The pallet jack. Someone snapped the handle off.', { id: 'c1sk:jack', r: 1.1 });
      K.examine(6.8, 0.3, 5.6, 'A returns satchel, taped shut. There\'s a note under the tape. I can\'t make it out.', { id: 'c1sk:satchel', r: 1.1, when: () => !C1.bossOn });
      K.examine(11.4, 1.8, 5, ['"You said it would work here."', 'I did. I said it to everyone.'], { id: 'c1sk:writing', r: 2.2, world: 'outage', when: () => !C1.bossOn });
      K.examine(3, 1.5, 3, 'Security tethers. Coiled tight, like they\'re still holding something.', { id: 'c1sk:tethers', r: 1.3, world: 'outage' });
      K.examine(8.2, 0.6, 5, ['Cardboard. Tape. Phones with the film still on the screens.', 'That\'s all it was.'], { id: 'c1sk:heap', r: 2.2, world: 'outage', when: () => done('c1:collapsed') });
    },
    onUpdate() { C1_ambient(['#74827f', 0.45], ['#2a8a84', 0.3]); },
    onLeave() { C1_ambientOff(); },
  });

  // =================================================================================================================
  // The mast on the summit (a cutscene-only set for 1-2's impossible exterior): the lattice tower up the hill through
  // thin fog, the compound fence, the huts; its red aircraft light comes on for the first time.
  // =================================================================================================================
  defineRoom({
    id: 'c1_mastshot', name: 'THE SUMMIT (1-2)', area: 'THE MAST', chapter: 1, outdoor: true, surface: 'gravel', ambient: 'wind_heavy',
    fog: { density: 0.014 }, env: { sheets: 6, specks: true },
    bounds: [-6, 8, 6, 14],
    entries: { cam: [0, 12, 180], start: [0, 12, 180] },
    cameras: [{ id: 'c1_mastshot:cam', vol: [-6, 8, 6, 14], type: 'static', pos: [3.5, 3.2, 19.5], target: [0, 1.2, 9], fov: 'fit' }],   // (a gameplay fallback: 1-2 drives its own camera)
    build(K) {
      K.floor(-6, 8, 6, 14, 'gravel');
      K.box(0, -0.05, -10, 120, 0.05, 90, { tex: 'grass', color: '#5f6656' }, { shadow: false });
      // the summit road climbing to the compound, the fence, the huts, the tower
      K.box(0, -0.02, 0, 7, 0.03, 60, 'bitumen', { shadow: false, rot: 8 });
      const mast = K.prop('mast', 0, -40, 0, { h: 60, name: 'c1ms_mast' });
      if (mast && mast.userData.aircraft) mast.userData.aircraft.on(false);
      for (let x = -14; x <= 14; x += 4) K.prop('chainlink', x, -30, 0, { len: 4, h: 2.4, barbed: true });
      K.prop('hut', -7, -34, 20, { w: 3, d: 2.4 });
      K.prop('hut', 8, -36, -15, { w: 2.6, d: 2.2 });
      for (const [x, z] of [[-3, 10], [3.5, -8], [-2.5, -22]]) K.prop('power_pole', x, z, 90, { span: 16 });
      K.prop('gum_tree', -12, 4, 0, {}); K.prop('gum_tree', 11, -6, 0, {}); K.prop('gum_tree_small', 7, 10, 0, {});
    },
  });

  // =================================================================================================================
  // CUTSCENE 1-1 "Welcome In"
  // =================================================================================================================
  function C1_prepChloe(G) {
    const C = G.actor('chloe', 'chloe');
    C.place(ST.chloe[0], ST.chloe[1], 0);
    C.pose('idle'); C.expr('smile');
    if (C.raw) { C.raw.idleLife = false; try { C.raw.armPose('L', 'shield'); } catch (e) { /* pose */ } }
    return C;
  }
  defineCutscene('1-1', async (G) => {
    const A = G.aidan, C = C1_prepChloe(G);
    if (A.raw) A.raw.idleLife = false;
    C.look(null); C.eyes('down');
    // 1. low behind the counter, looking out: he comes in, silhouetted against the dark concourse. The chime.
    A.place(10, 16.1, 180); A.pose('idle');
    G.cam({ pos: [11.35, 1.07, 2.35], target: [10.1, 1.25, 14.5], fov: 44 });
    await G.wait(0.4);
    G.sfx('chime', { vol: 0.9 });
    const walkIn = A.walkTo(10, 11.8, { speed: 1.0 });
    await G.wait(1.2);
    C.eyes('ahead'); C.look(G.aidan);
    await walkIn;
    A.look(C);
    await G.wait(0.5);
    // 2. the reverse on Chloe: perfect posture, tablet to her chest, the smile; the clock above her at 8:59
    G.cam({ pos: [10.05, 1.52, 6.9], target: [10, 1.72, 1.6], fov: 32, to: { pos: [10.05, 1.52, 6.3], fov: 30 }, dur: 9 });
    C.expr('smile_huge');
    await G.say('CHLOE', 'Hi! Welcome in!');
    await G.beat();
    C.expr('wide');
    await G.say('CHLOE', 'Oh— Aidan?');
    A.walkTo(10, 5.1, { speed: 1.05 });
    await G.say('AIDAN', 'Chloe? What are you— what are you doing here?');
    C.expr('smile');
    await G.say('CHLOE', 'Turning this place around.');
    C.gesture('laugh').catch(() => {});
    await G.wait(0.7);
    await G.say('CHLOE', 'They asked for volunteers. Tough store.');
    // 3. a medium two-shot across the counter; he looks round the empty store — every lock screen 8:59
    await G.until(() => G.dist(A, [10, 5.1]) < 0.1, { timeout: 4 });
    A.turn(180, 0.3);
    G.cam({ pos: [15.6, 1.45, 4.3], target: [10, 1.35, 3.7], fov: 38, to: { pos: [15.4, 1.45, 4.1], fov: 36 }, dur: 12 });
    C.look(null); C.eyes('down');
    await G.wait(0.5);
    A.look([5, 1.0, 7.4]);
    await G.wait(1.2);
    G.cam({ pos: [10.35, 1.2, 8.3], target: [10, 0.93, 7.25], fov: 30, to: { pos: [9.75, 1.18, 8.2], fov: 28 }, dur: 3 });   // an insert: 8:59, 8:59, 8:59
    await G.wait(2.0);
    G.cam({ pos: [15.6, 1.45, 4.3], target: [10, 1.35, 3.7], fov: 36 });
    A.look(null);
    await G.say('AIDAN', 'It\'s closed. The whole centre\'s closed. There\'s nobody here.');
    C.eyes('ahead'); C.look([10, 1.6, 12]);
    await G.say('CHLOE', 'It\'s the last day of the month.');
    await G.beat();
    await G.say('CHLOE', 'They always come in the last hour.');
    A.gesture('rub_neck', { hand: 'L' }).catch(() => {});
    await G.say('AIDAN', 'How long have you been here?');
    // (checking the tablet)
    if (C.raw) { try { C.raw.armPose('L', 'tablet_read'); } catch (e) { /* pose */ } }
    C.eyes('down'); C.look(null); C.expr('flat');
    await G.wait(0.6);
    await G.say('CHLOE', 'Since the start of the month.');
    await G.beat();
    C.gesture('tremor', { amount: 0.8 }).catch(() => {});
    await G.say('CHLOE', 'I\'m eleven short. Eleven. I\'ve never finished a month under target, Aidan. Not once.');
    await G.beat();
    await G.say('CHLOE', 'I have to send my numbers up to Level 4 at close.');
    // 4. close on her lanyard: the pins drag it down; they clink as she breathes
    if (C.raw) { try { C.raw.armPose('L', 'shield'); } catch (e) { /* pose */ } }
    G.cam({ pos: [10.28, 1.22, 3.05], target: [10.0, 1.2, 2.3], fov: 26, to: { pos: [10.22, 1.2, 2.95], fov: 24 }, dur: 3.6 });
    G.sfx('pins', { vol: 0.5, pos: [10, 1.2, 2.3] });
    await G.wait(1.3);
    G.sfx('pins', { vol: 0.4, pos: [10, 1.2, 2.3] });
    await G.wait(1.5);
    // 5. over her shoulder onto him
    G.cam({ pos: [9.62, 1.62, 1.35], target: [10.05, 1.45, 5.1], fov: 34 });
    C.look(G.aidan); C.eyes('at', G.aidan);
    A.look(C); A.eyes('down');
    await G.say('AIDAN', 'I need to use the system. I need to look up a customer. Her address.');
    // (brightening, too fast)
    C.expr('smile_huge');
    await G.say('CHLOE', 'Of course! Back office. You know the login.', { dur: 2.0 });
    await G.beat();
    await G.say('CHLOE', 'Is it a sale?');
    A.eyes('away', C);
    await G.wait(0.4);
    await G.say('AIDAN', '...It\'s a follow-up.');
    // (the smile holds a fraction too long) — close on her
    G.cam({ pos: [10.0, 1.56, 3.55], target: [10, 1.56, 2.25], fov: 28, to: { pos: [10.0, 1.56, 3.35], fov: 26 }, dur: 4 });
    C.expr('smile_huge'); C.eyes('at', G.aidan);
    await G.say('CHLOE', 'Amazing.');
    await G.wait(1.6);
    C.expr('smile'); C.eyes('down');
    await G.wait(0.4);
    // state (plain statements: a skip lands here the same way)
    C.look(null);
    if (A.raw) A.raw.idleLife = true;
    if (C.raw) C.raw.idleLife = true;
    A.look(null); A.eyes('ahead');
    note(G, 'Her address. Back office terminal.', 'c1_obj');
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // GAMEPLAY 1-5 / 1-7: the terminal (the PIN, then the case screen)
  // =================================================================================================================
  async function C1_terminal(G) {
    const A = G.aidan;
    await A.turn([BO.term[0], BO.term[1]], 0.4);
    if (G.once('c1:termFirst')) {
      A.gesture('rub_neck', { hand: 'L' }).catch(() => {});
      await G.say('AIDAN', 'My PIN. What\'s my— [beat] I can\'t remember my PIN.');
      if (!flag('c1_pinKnown')) note(G, 'Her address. Back office terminal. What\'s my PIN?', 'c1_obj');
    }
    const hint = lvl() === 'easy' && flag('c1_pinKnown') ? 'DDMM' : null;
    const pin = await G.keypad({ style: 'terminal', digits: 4, code: '1403', user: 'AIDAN', keep: true, hint, store: 'STORE 0288 · SIGNAL HILL PLAZA',
      after: { heading: 'CUSTOMER SEARCH', search: '', searchLabel: 'ACCOUNT NO.', text: 'Signed in as AIDAN.' } });
    if (pin !== '1403') {
      await G.think(flag('c1_pinKnown') ? 'The day I started. [beat] Day first.' : 'The day I became one of us. [beat] I don\'t even remember the date.');
      return;
    }
    await G.cutscene('1-7');
  }
  defineCutscene('1-7', async (G) => {
    const scr = () => (typeof UI !== 'undefined' ? UI : null);
    const spec = (search, extra = {}) => ({ heading: 'CUSTOMER SEARCH', search, searchLabel: 'ACCOUNT NO.', ...extra });
    let h = G.screen(spec(''), { style: 'crm', store: 'STORE 0288 · SIGNAL HILL PLAZA' });
    await G.wait(0.6);
    // he types the account number from memory
    const acct = '4471-0932';
    for (let i = 1; i <= acct.length; i++) {
      h = G.screen(spec(acct.slice(0, i)), { style: 'crm' });
      G.sfx('keypress', { vol: 0.6 });
      await G.wait(0.13 + (i === 4 ? 0.25 : 0));
    }
    await G.wait(0.4);
    G.sfx('keypress', { vol: 0.7 });
    h = G.screen(spec(acct, { text: 'Searching…' }), { style: 'crm' });
    await G.wait(0.9);
    const result = spec(acct, {
      fields: [['ACCOUNT', '4471-0932'], ['CUSTOMER NAME', null], ['SERVICE ADDRESS', 'UNIT 9, HILLTOP VILLAGE, SIGNAL HILL'], ['SERVICES', 'HOME INTERNET 5G · HOME PHONE (ON MODEM) · MOBILE · TABLET'], ['SALES REP', 'AIDAN']],
    });
    h = G.screen(result, { style: 'crm' });
    await G.wait(1.6);
    await G.say('AIDAN', 'Why can\'t I— the name\'s not showing.');
    // for one second the case panel flashes three times, each with a different date
    const panel = (d) => ({ ...result, panel: { title: 'CASE 118-2231', lines: ['CASE 118-2231 · CUSTOMER CALLBACK · ASSIGNED: AIDAN · FOLLOW UP TOMORROW', d] } });
    for (const d of ['MON 14/09/2026 09:14', 'TUE 15/09/2026 12:52', 'WED 16/09/2026 17:30']) {
      h = G.screen(panel(d), { style: 'crm' });
      if (h && h.glitch && !G.skipping) h.glitch(0.2, 0.6);
      await G.wait(0.33);
    }
    // static floods the screen; the Tomorrow motif, clipped
    h = G.screen(result, { style: 'crm' });
    if (h && h.static && !G.skipping) { h.static(1.4, 1); h.setStatic(0.85); }
    G.music('tomorrow', { clipped: true, vol: 0.7 });
    await G.wait(1.6);
    await G.say('AIDAN', 'Glitch.');
    await G.beat();
    await G.say('AIDAN', 'It\'s just a glitch.');
    await G.wait(0.4);
    const s = scr(); if (s && s.screen) s.screen(null);
    // state: the address; the map marks Hilltop Village; a payphone starts ringing somewhere out in the centre
    G.set('c1_address', true);
    note(G, 'Her address. Back office terminal.', 'c1_obj', { done: true });
    note(G, 'PIN: the day I started. 14 March.', 'c1_pin', { done: true });
    note(G, 'Unit 9, Hilltop Village. Hilltop Road — off the top of Relay Street.', 'c1_addr');
    C1_markVillage(G);
    await G.wait(1.2);
    try { G.aidan.look([BO.term[0], 1.5, 6]); } catch (e) { /* actor */ }
    await G.wait(1.4);
    try { G.aidan.look(null); } catch (e) { /* actor */ }
  }, { letterbox: false, skippable: true });
  // the town map: a red circle on Hilltop Village (through Relay Street's map transform when the maps define one)
  function C1_markVillage(G) {
    try {
      const rm = ROOMS.c1_relay && ROOMS.c1_relay.map;
      if (!rm || !rm.xform) return;
      const [ox, oz, sc = 1, rot = 0] = rm.xform, c = Math.cos(rot * D2R), s = Math.sin(rot * D2R), at = [60, -205];
      G.mapMark('c1:village', { map: rm.id, floor: rm.floor, t: 'circle', text: 'Unit 9', x: ox + (at[0] * c - at[1] * s) * sc, y: oz + (at[0] * s + at[1] * c) * sc });
    } catch (e) { /* no map */ }
  }

  // =================================================================================================================
  // IN-ENGINE 1-8: the food court payphone (Wai), straight into CUTSCENE 1-2
  // =================================================================================================================
  function C1_payHandset(G, lifted) {
    const pay = G.world && G.world.build && G.world.build.interactables.find((i) => i.id === 'c1_foodcourt:payphone');
    const o = pay && pay.obj; if (!o) return;
    const hk = o.getObjectByName('handset_hook'), hp = o.getObjectByName('handset_pivot');
    if (lifted) { if (hk) hk.visible = false; if (hp) hp.visible = false; }
    else if (o.userData.setHanging) o.userData.setHanging(false);
  }
  defineCutscene('1-8', async (G) => {
    const A = G.aidan;
    C1.onPhone = true;
    G.set('c1_wai', true);                              // (the ringing stops as he lifts it)
    C1_ringStop();
    await A.walkTo(0.78, FC.phone[1], { speed: 1.2 });
    await A.turn(-90, 0.35);
    G.sfx('click', { vol: 0.7, pos: [0.3, 1.4, FC.phone[1]] });
    C1_payHandset(G, true);
    A.hold('L', 'handset');
    if (A.raw) A.raw.idleLife = false;
    G.sfx('static', { dur: 0.5, vol: 0.4, phone: true });
    await G.wait(0.8);
    await G.say('WAI (phone)', 'You\'re the new one. [beat] Don\'t hang up. Listen.');
    await G.say('AIDAN', 'Who is this?');
    await G.say('WAI (phone)', 'Name\'s Wai. I\'m at the old exchange, top of Exchange Road. [beat] Your phone. When the bars go up, it\'s not the network, mate. Nothing gets signal here. Something\'s found you.');
    A.eyes('down');
    await G.say('AIDAN', 'What do you mean, something—');
    await G.say('WAI (phone)', 'You\'ll hear the tone soon. When you do, keep moving. Find a door that locks if you have to. [beat] Come see me when you\'re done with whatever brought you.');
    // the line clicks dead
    G.sfx('click', { vol: 0.6, phone: true });
    await G.wait(0.5);
    G.sfx('dialtone', { dur: 1.2, vol: 0.25, phone: true });
    await G.wait(1.0);
    note(G, 'Wai. The old exchange, top of Exchange Road.', 'c1_wai');
    await G.cutscene('1-2');
  }, { letterbox: false, skippable: true });

  // =================================================================================================================
  // CUTSCENE 1-2 "The Tone"
  // =================================================================================================================
  function C1_phoneCam(fov, dist = 0.3) {
    const ph = Player.actor && Player.actor.held && Player.actor.held.R;
    if (!ph) return null;
    ph.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    ph.getWorldPosition(p); ph.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = p.clone().addScaledVector(n, dist).addScaledVector(up, 0.03);
    return { pos: [c.x, c.y, c.z], target: [p.x + up.x * 0.015, p.y + up.y * 0.015, p.z + up.z * 0.015], fov };
  }
  defineCutscene('1-2', async (G) => {
    const A = G.aidan;
    const post = Render.post;
    // 1. the food court, wide and high: he hangs up. A faint dial-up handshake rises from everywhere at once.
    G.cam({ pos: [26.8, 4.25, 18.6], target: [2.2, 0.6, 12.6], fov: 34, to: { pos: [26.4, 4.2, 18.2], fov: 32 }, dur: 5 });
    await G.wait(0.6);
    A.hold('L', null);
    C1_payHandset(G, false);
    G.sfx('clunk', { vol: 0.8, pos: [0.3, 1.3, FC.phone[1]] });
    await G.wait(0.5);
    if (!G.skipping && typeof Snd !== 'undefined') { try { C1.dial = Snd.play('dialup', { sustain: true, vol: 0.9 }); } catch (e) { C1.dial = null; } }
    const ramp = (k) => { post.grain = U.lerp(0.08, 0.34, k * k); post.ca = U.lerp(0.55, 2.3, k * k); post.noise = k > 0.75 ? ((k - 0.75) / 0.25) * 0.08 : 0; };
    let t0 = 0;
    const rampTo = (secs, k0, k1) => G.loop((dt) => { t0 = Math.min(secs, t0 + dt); ramp(U.lerp(k0, k1, t0 / secs)); return t0 >= secs; });
    A.turn(90, 0.8); A.look([10, 3.5, 10]);
    await rampTo(2.0, 0, 0.3);
    // 2. an impossible exterior: the mast on the summit through the fog; its red light blinks on for the first time
    await G.goto('c1_mastshot', 'cam', { fade: false, sound: 'none' });
    A.hide();
    G.cam({ pos: [4.5, 1.1, 30], target: [0, 30, -40], fov: 40, to: { pos: [4.3, 1.2, 28.5], target: [0, 31, -40], fov: 36 }, dur: 3.4 });
    t0 = 0; await rampTo(1.2, 0.3, 0.5);
    { const m = G.obj('c1ms_mast'); if (m && m.userData.aircraft) m.userData.aircraft.on(true); }
    t0 = 0; await rampTo(1.9, 0.5, 0.7);
    // 3. low along the concourse floor: the carpet tiles lift and curl back one by one over green circuit board,
    //    receding into the dark; the lights die bank by bank toward the camera
    await G.goto('c1_concourse', { pos: [7, 0.9], yaw: 0 }, { fade: false, sound: 'none' });
    A.hide();
    const tiles = G.obj('c1cn_tiles'), under = G.obj('c1cn_circuit');
    if (tiles) tiles.visible = true; if (under) under.visible = true;
    G.cam({ pos: [38.6, 0.22, 6.2], target: [16, 0.5, 5.8], fov: 42, to: { pos: [38.9, 0.2, 6.2], target: [16, 0.42, 5.8], fov: 40 }, dur: 3.8 });
    try { World.lightsOut({ dur: 2.6 }); } catch (e) { /* world */ }
    const piv = tiles ? tiles.children.slice() : [];
    piv.sort((a, b) => (b.userData.ord ?? b.position.x) - (a.userData.ord ?? a.position.x));   // nearest first, receding west into the dark
    let k = 0;
    await G.loop((dt) => {
      k = Math.min(1, k + dt / 3.4);
      ramp(0.7 + 0.3 * k);
      piv.forEach((p, i) => { const s = clamp((k * 1.25 - (i / piv.length)) / 0.22, 0, 1); p.rotation.z = -U.ease.inOut(s) * 2.6; });
      return k >= 1;
    });
    // the world goes over (in the dark): the concourse's own contracts and tethers from here on
    World.setOutage(true);
    if (tiles) tiles.visible = false; if (under) under.visible = false;
    // 4. close on his phone: one bar, two, three. The siren cuts dead.
    await G.goto('c1_foodcourt', { pos: [0.78, FC.phone[1]], yaw: 90 }, { fade: false, sound: 'none' });
    A.show(); A.pose('idle');
    if (A.raw) { A.raw.armPose('R', 'phone_look'); A.raw.eyes('down'); A.raw.expr('scared'); }
    await G.wait(0.05);
    const pc = C1_phoneCam(26, 0.32);
    if (pc) G.cam(pc); else G.cam({ pos: [1.5, 1.4, FC.phone[1] + 0.4], target: [0.9, 1.25, FC.phone[1]], fov: 28 });
    G.bars({ climb: 3, from: 0, dur: 1.7, tell: 'eftpos' });
    await G.wait(2.0);
    if (C1.dial && C1.dial.stop) { try { C1.dial.stop(0.006); } catch (e) { /* audio */ } }
    C1.dial = null;
    G.sfx('siren_cut', { vol: 1 });
    try { Render.glitch(0.35, 1); } catch (e) { /* render */ }
    post.grain = null; post.ca = null; post.noise = 0;
    await G.wait(1.1);
    // into the Outage (plain statements)
    if (C1.dial && C1.dial.stop) { try { C1.dial.stop(0.05); } catch (e) { /* audio */ } C1.dial = null; }
    post.grain = null; post.ca = null; post.noise = 0;
    if (!S.outage) World.setOutage(true);
    G.bars(null);
    C1.onPhone = false;
    A.show();
    if (A.raw) { A.raw.armPose('R', 'phone'); A.raw.expr('neutral'); A.raw.eyes('ahead'); A.raw.idleLife = true; }
    A.look(null);
    note(G, 'The lights went. The store — there has to be another way round to it.', 'c1_obj');
    G.camRelease();
    try { Cam.snap(); } catch (e) { /* cam */ }
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // BOSS: THE RETURNS CAGE (spec §6) — a 4 m hunched giant of boxes, satchels and phones (screen protectors still on),
  // bound with packing tape and security tethers, in the silhouette of an old woman in a cardigan; a returns satchel
  // for a head with the note pinned to it; a modem box glowing in its chest. HP 200. Hurls devices after a clear arm
  // wind-up (15); a slow two-handed slam with a shockwave (25). Every 40 HP a return pops loose and lands note-up
  // (Returns Notes 5–9). At 0 HP it kneels; E tears the modem from its chest and it collapses into cardboard.
  // Custom enemy type 'c1_cage' (no Rig actor: its own pivots, animated here).
  // =================================================================================================================
  const CG = { hp: 200, throwDmg: 15, slamDmg: 25, speed: 0.42, turn: 0.75, bounds: [2.6, 1.8, 8.8, 8.2] };
  const CGM = {};                                     // the boss's materials (shared across spawns, never disposed)
  function C1_cgMats() {
    if (CGM.card) return CGM;
    const keep = (m) => { m.userData.shared = true; return m; };
    CGM.card = keep(Tex.mat('cardboard', { outage: false, color: '#c2a47a' }));
    CGM.cardDk = keep(Tex.mat('cardboard', { outage: false, color: '#8e7a58' }));
    CGM.tape = keep(new THREE.MeshStandardMaterial({ color: '#b99a5a', roughness: 0.35, metalness: 0.0 }));
    CGM.knit = keep(Tex.mat('fabric_knit', { outage: false, color: '#556a86' }));
    CGM.knitDk = keep(Tex.mat('fabric_knit', { outage: false, color: '#3f4f64' }));
    CGM.satchel = keep(Tex.mat('plastic_sheet', { outage: false, color: '#7d8280', roughness: 0.5 }));
    CGM.phone = keep(new THREE.MeshStandardMaterial({ color: '#15181a', roughness: 0.25, metalness: 0.3 }));
    CGM.screen = keep(new THREE.MeshStandardMaterial({ color: '#9fb0b0', roughness: 0.08, metalness: 0.2, emissive: '#223333', emissiveIntensity: 0.4 }));
    CGM.tether = keep(new THREE.MeshStandardMaterial({ color: '#161718', roughness: 0.45 }));
    CGM.modem = keep(new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.4, emissive: '#9ff2e4', emissiveIntensity: 0.6 }));
    CGM.glow = keep(new THREE.MeshBasicMaterial({ color: '#bff8ee' }));
    CGM.led = keep(new THREE.MeshBasicMaterial({ color: '#ff2a1c' }));
    CGM.note = keep(new THREE.MeshStandardMaterial({ map: slipTex('You said it would work here.', { size: 28 }), roughness: 0.8, side: THREE.DoubleSide }));
    CGM.button = keep(new THREE.MeshStandardMaterial({ color: '#d8c8a8', roughness: 0.3 }));
    return CGM;
  }
  // merge a list of [geometry, matrix, material] into one mesh per material under `parent`
  function C1_merge(parent, list) {
    const by = new Map();
    for (const [g, m, mat] of list) { if (!by.has(mat)) by.set(mat, []); by.get(mat).push({ geo: g, m }); }
    for (const [mat, items] of by) {
      const geo = Kit.mergeGeometries(items);
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.ownedGeo = true;
      parent.add(mesh);
      for (const it of items) it.geo.dispose();
    }
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function helix(len, r, turns, tube = 0.02) {
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, -t * len, Math.sin(a) * r)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, tube, 5, false);
  }
  // one arm: shoulder pivot → upper (boxes + tape + a tether coil) → elbow pivot → forearm → a hand of phones
  function C1_cgArm(side, M) {
    const sh = new THREE.Group(); sh.name = 'shoulder' + side;
    const up = [], fo = [], hd = [];
    for (let i = 0; i < 3; i++) up.push([BX(0.36 - i * 0.03, 0.4, 0.32), M4(0, -0.2 - i * 0.38, 0, 0, i * 0.4, (i % 2 ? 0.08 : -0.06)), i % 2 ? M.cardDk : M.card]);
    for (let i = 0; i < 3; i++) up.push([BX(0.38, 0.05, 0.34), M4(0, -0.22 - i * 0.38, 0, 0, i * 0.4, 0), M.tape]);
    up.push([helix(1.1, 0.2, 5, 0.018), M4(0, -0.05, 0), M.tether]);
    C1_merge(sh, up);
    const el = new THREE.Group(); el.name = 'elbow' + side; el.position.y = -1.18; sh.add(el);
    for (let i = 0; i < 3; i++) fo.push([BX(0.3, 0.38, 0.28), M4(0, -0.2 - i * 0.36, 0, 0, -i * 0.5, (i % 2 ? -0.1 : 0.05)), i === 1 ? M.satchel : M.card]);
    for (let i = 0; i < 2; i++) fo.push([BX(0.32, 0.05, 0.3), M4(0, -0.38 - i * 0.36, 0), M.tape]);
    fo.push([helix(1.0, 0.17, 4, 0.016), M4(0, -0.02, 0), M.tether]);
    C1_merge(el, fo);
    const hand = new THREE.Group(); hand.name = 'hand' + side; hand.position.y = -1.12; el.add(hand);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.35;
      hd.push([BX(0.075, 0.16, 0.012), M4(Math.sin(a) * 0.12, -0.12 - Math.abs(i - 2) * 0.02, Math.cos(a) * 0.04, 0.2, a, 0), M.phone]);
      hd.push([new THREE.PlaneGeometry(0.066, 0.14), M4(Math.sin(a) * 0.12, -0.12 - Math.abs(i - 2) * 0.02, Math.cos(a) * 0.04 + 0.007, 0.2, a, 0), M.screen]);
    }
    hd.push([BX(0.26, 0.12, 0.2), M4(0, -0.02, 0), M.card]);
    C1_merge(hand, hd);
    return { sh, el, hand };
  }
  function C1_cgBuild(e) {
    const M = C1_cgMats(), root = new THREE.Group(); root.name = 'enemy:' + e.id;
    const body = new THREE.Group(); body.name = 'cg_body'; root.add(body);
    // the heap: a long skirt of returns, widening to the floor
    const base = new THREE.Group(); base.name = 'cg_base'; body.add(base);
    const heap = [], rr = U.rng(71);
    for (let ring = 0; ring < 4; ring++) {
      const n = 9 - ring, y = ring * 0.36, rad = 1.12 - ring * 0.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.4, w = 0.4 + rr() * 0.25, h = 0.34 + rr() * 0.12, dd = 0.3 + rr() * 0.2;
        heap.push([BX(w, h, dd), M4(Math.cos(a) * rad, y + h / 2, Math.sin(a) * rad, (rr() - 0.5) * 0.4, -a + rr(), (rr() - 0.5) * 0.4), rr() < 0.25 ? M.satchel : rr() < 0.5 ? M.cardDk : M.card]);
        if (rr() < 0.4) heap.push([BX(w + 0.02, 0.045, dd + 0.02), M4(Math.cos(a) * rad, y + h * 0.55, Math.sin(a) * rad, 0, -a + 0.3, 0), M.tape]);
      }
    }
    for (let i = 0; i < 6; i++) { const a = rr() * Math.PI * 2; heap.push([BX(0.075, 0.012, 0.15), M4(Math.cos(a) * (0.6 + rr() * 0.6), 0.5 + rr() * 0.9, Math.sin(a) * (0.6 + rr() * 0.6), rr() * 3, rr() * 3, rr() * 3), M.phone]); }
    heap.push([new THREE.CylinderGeometry(0.95, 1.25, 1.3, 14, 1, true), M4(0, 0.7, 0), M.knitDk]);              // the cardigan's hem
    C1_merge(base, heap);
    // hips → torso (hunches forward)
    const hips = new THREE.Group(); hips.name = 'cg_hips'; hips.position.y = 1.4; body.add(hips);
    const tor = [];
    for (let i = 0; i < 4; i++) tor.push([BX(0.95 - i * 0.05, 0.42, 0.72), M4((i % 2 ? 0.05 : -0.04), 0.22 + i * 0.4, 0, 0, (i % 2 ? 0.12 : -0.1), 0), i % 3 === 1 ? M.satchel : M.card]);
    for (let i = 0; i < 4; i++) tor.push([BX(1.0 - i * 0.05, 0.06, 0.76), M4(0, 0.4 + i * 0.4, 0, 0, i * 0.2, 0), M.tape]);
    // the cardigan: a knit back and shoulders, open fronts (the modem glowing between them), buttons
    tor.push([BX(1.25, 1.5, 0.08), M4(0, 0.95, -0.4, 0.06, 0, 0), M.knit]);
    for (const s of [-1, 1]) {
      tor.push([BX(0.36, 1.35, 0.08), M4(s * 0.45, 0.9, 0.4, -0.08, s * 0.25, 0), M.knit]);
      tor.push([BX(0.1, 1.5, 0.82), M4(s * 0.62, 0.95, 0, 0, 0, s * 0.05), M.knit]);
      for (let b = 0; b < 4; b++) tor.push([new THREE.SphereGeometry(0.035, 8, 6), M4(s * 0.32, 0.5 + b * 0.3, 0.45, 0, 0, 0), M.button]);
    }
    tor.push([BX(1.4, 0.3, 0.95), M4(0, 1.65, -0.02, 0.1, 0, 0), M.knit]);                                    // shoulders
    tor.push([helix(1.4, 0.55, 3, 0.02), M4(0, 1.6, 0), M.tether]);
    C1_merge(hips, tor);
    // the modem box in its chest (a glow, a blinking LED; a real light while it lives)
    const chest = new THREE.Group(); chest.name = 'cg_chest'; chest.position.set(0, 1.05, 0.3); hips.add(chest);
    const modem = new THREE.Group(); modem.name = 'cg_modem'; chest.add(modem);
    modem.add(new THREE.Mesh(BX(0.34, 0.26, 0.12), M.modem));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), M.glow); gl.position.set(0, 0.04, 0.062); modem.add(gl);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.led); led.position.set(0.12, -0.07, 0.065); modem.add(led);
    // neck → head: a returns satchel, the note pinned to it
    const neck = new THREE.Group(); neck.name = 'cg_neck'; neck.position.set(0, 1.85, 0.12); hips.add(neck);
    const hd = [];
    hd.push([BX(0.22, 0.34, 0.22), M4(0, 0.15, 0, 0.2, 0, 0), M.tape]);
    hd.push([new THREE.SphereGeometry(0.34, 14, 10), M4(0, 0.48, 0.08, 0, 0, 0).multiply(new THREE.Matrix4().makeScale(1.15, 0.8, 0.95)), M.satchel]);
    hd.push([BX(0.5, 0.05, 0.4), M4(0, 0.32, 0.1, 0.1, 0, 0), M.satchel]);
    hd.push([new THREE.PlaneGeometry(0.24, 0.14), M4(0.02, 0.48, 0.405, -0.1, 0, 0), new THREE.MeshStandardMaterial({ map: Tex.label ? Tex.label('RETURNS\nREPLY PAID 4471', { style: 'label' }) : null, roughness: 0.7 })]);
    C1_merge(neck, hd);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), M.note); note.name = 'cg_note';
    note.position.set(-0.05, 0.62, 0.36); note.rotation.set(-0.3, 0.1, 0.12); neck.add(note);
    // arms
    const L = C1_cgArm('L', M), R = C1_cgArm('R', M);
    L.sh.position.set(0.72, 1.62, 0.02); R.sh.position.set(-0.72, 1.62, 0.02);
    hips.add(L.sh); hips.add(R.sh);
    // the device it throws (in the right hand)
    const dev = new THREE.Group(); dev.name = 'cg_dev';
    const dv = new THREE.Mesh(BX(0.22, 0.16, 0.3), M.card); dev.add(dv);
    const dp = new THREE.Mesh(BX(0.08, 0.16, 0.012), M.phone); dp.position.set(0, 0.1, 0.1); dev.add(dp);
    dev.position.set(0, -0.35, 0.1); R.hand.add(dev);
    root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return { root, body, base, hips, chest, modem, neck, note, L, R, dev };
  }
  // the modem box he tears out (in his hand for 1-4)
  function C1_modemProp() {
    const M = C1_cgMats(), g = new THREE.Group(); g.name = 'c1_modemheld';
    g.add(new THREE.Mesh(BX(0.3, 0.22, 0.1), M.modem));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.04), M.glow); gl.position.set(0, 0.03, 0.052); g.add(gl);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(BX(0.32, 0.03, 0.11), M.tape); t.position.set(0, s * 0.06, 0); t.rotation.z = s * 0.2; g.add(t); }
    return g;
  }

  Enemies.defineType('c1_cage', {
    hp: CG.hp, radius: 1.1, height: 3.8, downs: false, stompable: false, lockable: true, body: false, tell: 'eftpos',
    threat: (e) => !!e.data.fight && !e.data.dead,
    create(e, def) {
      const P = C1_cgBuild(e);
      e.obj = P.root; e.pos = P.root.position; e.data.P = P;
      e.hp = e.maxHp = CG.hp;
      Object.assign(e.data, { state: 'dormant', t: 0, rise: 0, riseTo: 0, cd: 2.2, fight: false, drops: 0, flinch: 0, pose: {}, proj: [], wave: null, debris: [] });
      e.threat = false;
      C1.boss = e;
      // its own body collider (the player can't walk through it; smaller than the hit circle so swings still land)
      if (World.build) {
        const c = { x0: 0, z0: 0, x1: 0, z1: 0, y: 0, h: 3, world: 'outage', obb: null, blocker: null, soft: false, name: 'boss:c1_cage', enabled: true, door: null, enemy: e, dynamic: true };
        e.data.col = c; World.build.colliders.push(c);
      }
      e.data.light = Render.allocLight('point', { color: '#aef4e8', intensity: 3.5, distance: 7 });
    },
    hitbox(e) { return [{ x: e.pos.x, z: e.pos.z, r: 1.15, y0: 0, y1: 3.8 }]; },
    stun() { return false; },
    knockdown() { return false; },
    onHit(e, dmg, weapon) {
      const d = e.data;
      if (!d.fight || d.state === 'kneel' || d.state === 'tear' || d.dead) return false;
      e.hp = Math.max(0, e.hp - (+dmg || 0));
      d.flinch = 0.35;
      try { Snd.play('cardboard', { pos: [e.pos.x, 1.6, e.pos.z], vol: 0.9 }); Snd.play(weapon === 'steel_bar' ? 'hit_heavy' : 'hit', { pos: [e.pos.x, 1.4, e.pos.z], vol: 0.7 }); } catch (err) { /* audio */ }
      C1_cgDebris(e, 3);
      // every 40 HP lost, a return pops loose and lands note-up
      const should = Math.min(5, Math.floor((CG.hp - e.hp) / 40));
      while (d.drops < should) { d.drops++; C1_cgDrop(e, d.drops + 4); }
      if (e.hp <= 0 && d.state !== 'kneel') { d.state = 'kneel'; d.t = 0; d.wave = null; e.threat = false; try { Snd.play('thud', { pos: [e.pos.x, 0.5, e.pos.z], vol: 1 }); } catch (err) { /* audio */ } }
      return false;
    },
    update(e, dt, ai) { C1_cgUpdate(e, dt, ai); },
    onDie() { /* its collapse is its own */ },
    remove(e) {
      const d = e.data;
      if (d.light) { try { d.light.free(); } catch (err) { /* pool */ } d.light = null; }
      if (d.col && World.build) { const a = World.build.colliders, i = a.indexOf(d.col); if (i >= 0) a.splice(i, 1); }
      for (const p of d.proj) if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      if (C1.boss === e) C1.boss = null;
    },
  });
  // debris popping off it when struck
  function C1_cgDebris(e, n) {
    const M = C1_cgMats();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(BX(0.12 + Math.random() * 0.12, 0.05, 0.1 + Math.random() * 0.1), Math.random() < 0.5 ? M.card : M.tape);
      m.position.set(e.pos.x + (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.6, e.pos.z + (Math.random() - 0.5) * 0.8);
      m.userData.ownedGeo = true; e.fx.add(m);
      e.data.debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 5 });
    }
  }
  // a return pops loose: a satchel arcs out of its body and lands note-up where Returns Note n is read
  function C1_cgDrop(e, n) {
    const to = SK_RET[n - 5]; if (!to) return;
    const M = C1_cgMats(), g = new THREE.Group();
    const b = new THREE.Mesh(BX(0.42, 0.07, 0.32), M.satchel); g.add(b);
    const nt = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: slipTex(DOCUMENTS['returns' + n] ? DOCUMENTS['returns' + n].text : '', {}), roughness: 0.8 }));
    nt.rotation.x = -Math.PI / 2; nt.position.y = 0.037; g.add(nt);
    g.traverse((c) => { if (c.isMesh) c.userData.ownedGeo = true; });
    const from = new THREE.Vector3(e.pos.x, 2.3, e.pos.z);
    e.fx.add(g);
    e.data.proj.push({ kind: 'drop', n, mesh: g, from, to: new THREE.Vector3(to[0], 0.035, to[1]), t: 0, dur: 0.9, peak: 1.4 });
    try { Snd.play('tape', { pos: [e.pos.x, 2, e.pos.z], vol: 0.8 }); } catch (err) { /* audio */ }
  }
  // the pose targets per state, eased toward each frame
  function C1_cgPose(e, dt) {
    const d = e.data, P = d.P, t = d.t, st = d.state;
    let hunch = 0.5, shL = 0.25, shR = 0.25, elL = -0.35, elR = -0.35, head = 0.3, sway = Math.sin(d.clock * 1.3) * 0.04, lean = 0, baseY = 1, spread = 0;
    if (st === 'windThrow') { const k = Math.min(1, t / 1.1); shR = U.lerp(0.25, -2.5, U.ease.inOut(k)); elR = U.lerp(-0.35, -1.3, k); hunch = 0.35; lean = -0.25 * k; head = 0.1; }
    else if (st === 'throw') { const k = Math.min(1, t / 0.22); shR = U.lerp(-2.5, 0.9, U.ease.out(k)); elR = U.lerp(-1.3, -0.1, k); hunch = 0.6; lean = 0.35; }
    else if (st === 'windSlam') { const k = Math.min(1, t / 1.6); shL = shR = U.lerp(0.25, -2.9, U.ease.inOut(k)); elL = elR = U.lerp(-0.35, -0.6, k); hunch = U.lerp(0.5, 0.05, k); head = -0.1; spread = 0.25 * k; }
    else if (st === 'slam') { const k = Math.min(1, t / 0.28); shL = shR = U.lerp(-2.9, 0.75, U.ease.in(k)); elL = elR = -0.2; hunch = U.lerp(0.05, 1.0, U.ease.in(k)); head = 0.6; }
    else if (st === 'recover') { const k = Math.min(1, t / (d.recDur || 1)); shL = shR = U.lerp(d.recFrom === 'slam' ? 0.75 : 0.5, 0.25, k); hunch = U.lerp(d.recFrom === 'slam' ? 1.0 : 0.6, 0.5, k); }
    else if (st === 'kneel' || st === 'tear') { hunch = 1.05; shL = shR = 0.55; elL = elR = -0.25; head = 0.85; baseY = 0.62; sway *= 0.3; }
    const rise = d.rise;
    // the pile: folded into the heap while dormant; unfolding as it rises
    hunch = U.lerp(1.45, hunch, rise); shL = U.lerp(0.9, shL, rise); shR = U.lerp(0.9, shR, rise); head = U.lerp(1.1, head, rise);
    baseY = U.lerp(0.55, baseY, rise);
    const ease = Math.min(1, dt * 7);
    const p = d.pose;
    const ap = (k, v) => { p[k] = p[k] === undefined ? v : p[k] + (v - p[k]) * ease; return p[k]; };
    const fl = d.flinch > 0 ? Math.sin(d.flinch * 30) * 0.12 * d.flinch / 0.35 : 0;
    P.hips.rotation.x = ap('hunch', hunch) + fl + sway;
    P.hips.rotation.z = ap('lean', lean) * 0.4;
    P.hips.position.y = U.lerp(0.55, 1.4, rise) * ap('baseY', baseY) / Math.max(0.3, baseY) * baseY;
    P.base.scale.set(1 + (1 - rise) * 0.25, ap('bs', baseY), 1 + (1 - rise) * 0.25);
    P.L.sh.rotation.x = ap('shL', shL); P.R.sh.rotation.x = ap('shR', shR);
    P.L.sh.rotation.z = ap('spL', 0.15 + spread); P.R.sh.rotation.z = -ap('spR', 0.15 + spread);
    P.L.el.rotation.x = ap('elL', elL); P.R.el.rotation.x = ap('elR', elR);
    P.neck.rotation.x = ap('head', head);
    P.note.rotation.x = -0.3 + Math.sin(d.clock * 7.3) * 0.18 * (st === 'dormant' ? 0.2 : 1);
    P.note.rotation.z = 0.12 + Math.sin(d.clock * 5.1) * 0.1;
    // the modem's glow (brighter and pulsing on its knees)
    const pulse = st === 'kneel' ? 0.8 + Math.sin(d.clock * 6) * 0.5 : 0.6 + Math.sin(d.clock * 2) * 0.1;
    if (C1_cgMats().modem) C1_cgMats().modem.emissiveIntensity = d.dead ? 0 : pulse * Math.min(1, rise + 0.2);
    P.dev.visible = st !== 'throw' && st !== 'recover' ? true : d.recFrom !== 'throw';
  }
  function C1_cgUpdate(e, dt, ai) {
    const d = e.data, P = d.P;
    d.clock = (d.clock || 0) + dt; d.t += dt;
    if (d.flinch > 0) d.flinch = Math.max(0, d.flinch - dt);
    // rising out of the heap (1-3 drives riseTo)
    if (d.rise !== d.riseTo) d.rise = d.riseTo > d.rise ? Math.min(d.riseTo, d.rise + dt / 2.8) : Math.max(d.riseTo, d.rise - dt / 2.8);
    if (!d.dead) C1_cgPose(e, dt);
    // the light at its chest
    if (d.light) {
      const cp = new THREE.Vector3(); P.chest.getWorldPosition(cp);
      d.light.set({ pos: [cp.x, cp.y, cp.z + 0.2], intensity: d.dead ? 0 : (d.state === 'kneel' ? 5 + Math.sin(d.clock * 6) * 2 : 3.5) * Math.min(1, d.rise + 0.1) });
      d.chestPos = cp;
    }
    // collider follows
    if (d.col) { const r = 0.78; d.col.x0 = e.pos.x - r; d.col.x1 = e.pos.x + r; d.col.z0 = e.pos.z - r; d.col.z1 = e.pos.z + r; d.col.enabled = !d.dead && d.rise > 0.5 && matchWorldC1(); }
    C1_cgProjectiles(e, dt);
    if (d.dead) { C1_cgCollapse(e, dt); return; }
    if (!ai || !d.fight || !Player.pos || Player.mode === 'dead') return;
    if (d.state === 'kneel' || d.state === 'tear' || d.state === 'dormant') return;
    const pp = Player.pos, dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, dist = Math.hypot(dx, dz);
    // turn toward him (slowly; not mid-swing)
    if (d.state === 'idle' || d.state === 'windThrow' || d.state === 'windSlam') {
      const want = Math.atan2(dx, dz), rate = d.state === 'idle' ? CG.turn : CG.turn * 0.45;
      e.yaw += U.clamp(U.angleDiff(e.yaw, want), -rate * dt, rate * dt);
    }
    if (d.state === 'idle') {
      d.cd -= dt;
      if (dist > 3.0) {                                   // it drags itself closer
        const sp = CG.speed * dt, nx = e.pos.x + (dx / dist) * sp, nz = e.pos.z + (dz / dist) * sp;
        const [bx0, bz0, bx1, bz1] = CG.bounds;
        e.pos.x = clamp(nx, bx0, bx1); e.pos.z = clamp(nz, bz0, bz1);
        d.drag = (d.drag || 0) + dt;
        if (d.drag > 1.3) { d.drag = 0; try { Snd.play('cardboard', { pos: [e.pos.x, 0.4, e.pos.z], vol: 0.55 }); } catch (err) { /* audio */ } }
      }
      if (d.cd <= 0) {
        d.state = dist < 3.9 ? 'windSlam' : 'windThrow'; d.t = 0;
        try { Snd.play(d.state === 'windSlam' ? 'cardboard' : 'tape', { pos: [e.pos.x, 2.4, e.pos.z], vol: 1 }); } catch (err) { /* audio */ }
      }
    } else if (d.state === 'windThrow' && d.t >= 1.1) {
      d.state = 'throw'; d.t = 0;
      // release: a device arcs at where he's standing (with a little lead)
      const hp = new THREE.Vector3(); P.R.hand.getWorldPosition(hp);
      const lead = Player.speed > 0.5 ? 0.35 : 0;
      const tgt = new THREE.Vector3(pp.x + Math.sin(Player.yaw) * lead * Player.speed, 0.05, pp.z + Math.cos(Player.yaw) * lead * Player.speed);
      const M = C1_cgMats(), g = new THREE.Group();
      const b = new THREE.Mesh(BX(0.22, 0.16, 0.3), M.card); g.add(b);
      const ph = new THREE.Mesh(BX(0.08, 0.16, 0.012), M.phone); ph.position.set(0, 0.1, 0.1); g.add(ph);
      g.traverse((c) => { if (c.isMesh) c.userData.ownedGeo = true; });
      g.position.copy(hp); e.fx.add(g);
      d.proj.push({ kind: 'throw', mesh: g, from: hp.clone(), to: tgt, t: 0, dur: Math.max(0.55, Math.min(1.0, hp.distanceTo(tgt) / 9)), peak: 1.1 });
      try { Snd.play('whoosh', { pos: [hp.x, hp.y, hp.z], vol: 0.8 }); } catch (err) { /* audio */ }
    } else if (d.state === 'throw' && d.t >= 0.25) { d.state = 'recover'; d.t = 0; d.recDur = 0.7; d.recFrom = 'throw'; }
    else if (d.state === 'windSlam' && d.t >= 1.6) { d.state = 'slam'; d.t = 0; }
    else if (d.state === 'slam' && d.t >= 0.28) {
      // impact: a shockwave rolls out across the floor
      const ip = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * 1.7, 0.05, e.pos.z + Math.cos(e.yaw) * 1.7);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: '#c8b48a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(ip); ring.userData.ownedGeo = true; e.fx.add(ring);
      d.wave = { ip, r: 0.4, mesh: ring, hit: false };
      C1_cgDebris(e, 6);
      try { Snd.play('hit_heavy', { pos: [ip.x, 0.3, ip.z], vol: 1 }); Snd.play('thud', { pos: [ip.x, 0.3, ip.z], vol: 1 }); } catch (err) { /* audio */ }
      try { Cam.shake(0.45, 0.6); } catch (err) { /* cam */ }
      d.state = 'recover'; d.t = 0; d.recDur = 1.3; d.recFrom = 'slam';
    } else if (d.state === 'recover' && d.t >= (d.recDur || 1)) { d.state = 'idle'; d.t = 0; d.cd = 1.4 + Math.random() * 1.2; }
    // the shockwave: 25 if it rolls through where he stands
    if (d.wave) {
      const w = d.wave; w.r += dt * 6.5;
      w.mesh.scale.setScalar(w.r); w.mesh.material.opacity = Math.max(0, 0.8 * (1 - w.r / 5.2));
      const pd = Math.hypot(pp.x - w.ip.x, pp.z - w.ip.z);
      if (!w.hit && Math.abs(pd - w.r) < 0.5 && w.r < 5.0) { w.hit = true; Player.damage(CG.slamDmg, e, { knock: true, from: w.ip, push: 0.8 }); }
      if (w.r >= 5.2) { if (w.mesh.parent) w.mesh.parent.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); d.wave = null; }
    }
  }
  const matchWorldC1 = () => !!S.outage;
  function C1_cgProjectiles(e, dt) {
    const d = e.data;
    for (const p of d.proj.slice()) {
      if (p.done) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k); p.mesh.position.y += Math.sin(k * Math.PI) * p.peak;
      p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 5;
      if (k >= 1) {
        p.done = true;
        if (p.kind === 'throw') {
          p.mesh.rotation.set(0, Math.random() * 6, Math.PI / 2 * (Math.random() < 0.5 ? 1 : 0)); p.mesh.position.y = 0.1;
          try { Snd.play('plastic', { pos: [p.to.x, 0.2, p.to.z], vol: 0.9 }); Snd.play('hit', { pos: [p.to.x, 0.2, p.to.z], vol: 0.6 }); } catch (err) { /* audio */ }
          if (Player.pos && Math.hypot(Player.pos.x - p.to.x, Player.pos.z - p.to.z) < 0.95) Player.damage(CG.throwDmg, e, { from: p.to, push: 0.35 });
          p.life = 7;
        } else {
          // the return lands note-up: the room's own satchel takes over (Returns Note n is readable there)
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
          S.done['c1:ret' + p.n] = true;
          try { Snd.play('paper', { pos: [p.to.x, 0.2, p.to.z], vol: 0.8 }); } catch (err) { /* audio */ }
        }
      }
    }
    for (const p of d.proj) if (p.done && p.life !== undefined) { p.life -= dt; if (p.life <= 0 && p.mesh.parent) { p.mesh.parent.remove(p.mesh); } }
    d.proj = d.proj.filter((p) => !(p.done && (p.life === undefined || p.life <= 0) && !p.mesh.parent));
    for (const b of d.debris.slice()) {
      b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < 0.03) { b.m.position.y = 0.03; b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
      b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt; b.m.rotation.z += b.w.z * dt;
      b.life -= dt; if (b.life <= 0) { if (b.m.parent) b.m.parent.remove(b.m); d.debris.splice(d.debris.indexOf(b), 1); }
    }
  }
  // the collapse into cardboard: every part falls away and settles
  function C1_cgCollapse(e, dt) {
    const d = e.data;
    if (!d.parts) {
      d.parts = [];
      const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
      const meshes = []; d.P.root.traverse((c) => { if (c.isMesh) meshes.push(c); });
      for (const m of meshes) {
        m.getWorldPosition(tmp); m.getWorldQuaternion(q);
        e.fx.attach(m);
        d.parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6), w: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), rest: 0.05 + Math.random() * 0.5 });
      }
      try { Snd.play('cardboard', { pos: [e.pos.x, 1, e.pos.z], vol: 1 }); Snd.play('tape', { pos: [e.pos.x, 2, e.pos.z], vol: 0.8 }); } catch (err) { /* audio */ }
    }
    for (const p of d.parts) {
      if (p.m.position.y <= p.rest) continue;
      p.v.y -= 7 * dt; p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.w.x * dt; p.m.rotation.z += p.w.z * dt;
      if (p.m.position.y < p.rest) { p.m.position.y = p.rest; p.v.set(0, 0, 0); }
    }
  }

  // the stockroom's tear-it-out interaction (active while it kneels; follows its chest)
  async function C1_tear(G) {
    const e = C1.boss; if (!e || e.data.state !== 'kneel') return;
    const d = e.data, A = G.aidan, cp = d.chestPos || e.pos;
    d.state = 'tear';
    const fx = e.pos.x + Math.sin(e.yaw) * 1.25, fz = e.pos.z + Math.cos(e.yaw) * 1.25;
    await A.walkTo(fx, fz, { speed: 1.3 });
    await A.turn([e.pos.x, e.pos.z], 0.3);
    await A.gesture('reach', { hand: 'L', target: [cp.x, cp.y, cp.z] });
    G.sfx('tape', { vol: 1, pos: [cp.x, cp.y, cp.z] });
    G.sfx('static', { dur: 0.6, vol: 0.5 });
    // he tears the modem out; it goes dark in his hand and the thing comes apart
    if (d.P.modem.parent) d.P.modem.parent.remove(d.P.modem);
    A.hold('L', C1_modemProp());
    d.dead = true;
    if (d.light) { try { d.light.free(); } catch (err) { /* pool */ } d.light = null; }
    await G.wait(0.4);
    A.pose('kneel');
    await G.wait(1.8);
    S.spawns[e.id] = 'dead';
    S.done['c1:collapsed'] = true;
  }
  defineBoss('returns_cage', {
    async run(G) {
      const e = C1.boss || G.enemy('c1_stockroom:cage');
      if (!e) return 'none';
      const d = e.data;
      d.fight = true; d.riseTo = 1; d.rise = Math.max(d.rise, 0.99); e.threat = true;
      if (d.state === 'dormant' || d.state === 'rise') { d.state = 'idle'; d.t = 0; d.cd = 1.6; }
      C1.bossLock = true; C1.bossOn = true;
      G.control(true);
      if (G.has('steel_bar') && S.equipped !== 'steel_bar') G.prompt(isPad() ? '{ready}: ready weapon. {attack}: attack.' : 'Right mouse: ready weapon. Left click: attack.', { id: 'c1_bossready' });
      await G.until(() => d.state === 'kneel' || !C1.boss);
      G.prompt('{interact}: tear the modem out.', { id: 'c1_tear' });
      await G.until(() => !!S.done['c1:collapsed'] || !C1.boss);
      C1.bossLock = false; C1.bossOn = false;
      return 'won';
    },
  });

  // =================================================================================================================
  // CUTSCENE 1-3 "Returns"
  // =================================================================================================================
  defineCutscene('1-3', async (G) => {
    const A = G.aidan, e = C1.boss || G.enemy('c1_stockroom:cage');
    // 1. high corner: he walks toward the cage. Boxes shift inside it.
    G.cam({ pos: [0.45, 4.6, 0.5], target: [8.4, 1.1, 5.2], fov: 44, to: { pos: [0.55, 4.55, 0.6], target: [8.2, 1.15, 5.1], fov: 40 }, dur: 6 });
    if (A.raw) A.raw.idleLife = false;
    const walk = A.walkTo(5.4, 5.5, { speed: 0.9 });
    await G.wait(1.6);
    G.sfx('cardboard', { pos: [9.5, 1.2, 5], vol: 0.9 });
    if (e) e.data.riseTo = 0.12;
    await G.wait(1.3);
    G.sfx('cardboard', { pos: [9.8, 1.6, 4.2], vol: 1 });
    await walk;
    A.look([8.2, 1.2, 5]);
    await G.wait(0.6);
    // 2. low, looking up: the pile rises into a hunched giant with a cardigan's silhouette; the satchel head turns
    G.cam({ pos: [5.0, 0.42, 6.7], target: [8.3, 2.9, 4.9], fov: 46, to: { pos: [4.8, 0.4, 6.9], target: [8.3, 3.2, 4.9], fov: 50 }, dur: 5 });
    G.sfx('cardboard', { pos: [8.2, 1, 5], vol: 1 });
    G.sfx('tape', { pos: [8.2, 2.4, 5], vol: 1 });
    if (e) { e.data.riseTo = 1; e.data.state = 'rise'; }
    A.gesture('flinch').catch(() => {});
    await G.wait(1.4);
    G.sfx('tape', { pos: [8.2, 3.2, 5], vol: 0.9 });
    await G.wait(1.5);
    if (A.raw) A.raw.expr('scared');
    await G.say('AIDAN', 'No. No, no—');
    if (e) { e.data.rise = 1; e.data.riseTo = 1; }
    A.look(null);
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); }
    // 3. the boss
    G.camRelease();
    const r = await G.boss('returns_cage');
    if (r === 'won' || done('c1:collapsed')) await G.cutscene('1-4');
  }, { letterbox: true, skippable: true });

  // =================================================================================================================
  // CUTSCENE 1-4 "I'm Going to Fix It"
  // =================================================================================================================
  defineCutscene('1-4', async (G) => {
    const A = G.aidan;
    // the returns he couldn't read: 1–4 go into Memos; the boss is done
    for (const n of [1, 2, 3, 4]) { try { await G.doc('returns' + n, { open: false, id: 'c1:ret' + n + 'doc' }); } catch (e) { /* doc */ } }
    G.set('c1_bossDone', true);
    S.done['c1:collapsed'] = true;
    C1.bossLock = false;
    // 1. on his knees among collapsed boxes, holding the modem; returns notes face-up around him
    const kx = A.pos.x, kz = A.pos.z;
    const notes = G.obj('c1sk_notes');
    const yawR = A.yaw * D2R;
    if (notes) { notes.position.set(kx, 0, kz); notes.rotation.y = yawR; notes.visible = true; notes.updateMatrixWorld(true); }
    const at = (i, y = 0, dz = 0) => { const v = new THREE.Vector3(0.66 - i * 0.44, y, 0.72 + dz); if (notes) notes.localToWorld(v); else v.set(kx + Math.sin(yawR) * 0.7, y, kz + Math.cos(yawR) * 0.7); return v; };
    A.pose('kneel');
    if (A.raw) { A.raw.idleLife = false; A.raw.eyes('down'); A.raw.expr('sad'); }
    const side = (d, h) => [kx + Math.sin(yawR) * d.f + Math.cos(yawR) * d.s, h, kz + Math.cos(yawR) * d.f - Math.sin(yawR) * d.s];
    G.cam({ pos: side({ f: 2.3, s: -1.9 }, 1.35), target: [kx + Math.sin(yawR) * 0.35, 0.5, kz + Math.cos(yawR) * 0.35], fov: 42, to: { pos: side({ f: 2.0, s: -1.7 }, 1.28), fov: 40 }, dur: 6 });
    await G.wait(3.2);
    // 2. a slow insert across the four notes (read left to right from where he kneels)
    {
      const a = at(0, 0.42, -0.16), b = at(3, 0.42, -0.16), ta = at(0, 0, 0.03), tb = at(3, 0, 0.03);
      G.cam({ pos: [a.x, a.y, a.z], target: [ta.x, ta.y, ta.z], fov: 36, to: { pos: [b.x, b.y, b.z], target: [tb.x, tb.y, tb.z], fov: 36 }, dur: 5.6, ease: 'linear' });
      await G.wait(5.8);
    }
    // 3. he stuffs the notes into the box without reading any more
    G.cam({ pos: side({ f: 1.5, s: 1.4 }, 1.05), target: [kx + Math.sin(yawR) * 0.4, 0.55, kz + Math.cos(yawR) * 0.4], fov: 36 });
    for (let i = 0; i < 4; i++) {
      const v = at(i, 0.02);
      await A.gesture('reach', { hand: i < 2 ? 'L' : 'R', target: [v.x, v.y, v.z] });
      const n = notes && notes.getObjectByName('c1_note' + i); if (n) n.visible = false;
      G.sfx('paper', { vol: 0.6 });
    }
    await G.wait(0.6);
    await G.say('AIDAN', 'I\'m going to fix it.');
    await G.wait(0.8);
    // 4. the Outage lifts; in the Fog-world store, Chloe is back at the counter as if nothing happened
    G.cam({ pos: [1.2, 3.8, 1.2], target: [kx, 0.4, kz], fov: 40 });
    await G.outage(false);
    await G.fade(1, 0.8);
    if (notes) notes.visible = false;
    A.hold('L', null);
    await G.goto('c1_store', { pos: [10, 5.2], yaw: 180 }, { fade: false, sound: 'none' });
    A.pose('idle');
    if (A.raw) { A.raw.expr('tired'); A.raw.eyes('ahead'); A.raw.posture = Math.max(A.raw.posture || 0, 0.15); }
    const C = C1_prepChloe(G);
    C.eyes('down'); C.look(null); C.expr('smile');
    if (C.raw) { try { C.raw.armPose('L', 'tablet_read'); } catch (e) { /* pose */ } }
    G.cam({ pos: [15.4, 1.45, 4.4], target: [10, 1.35, 3.7], fov: 38, to: { pos: [15.2, 1.45, 4.2], fov: 36 }, dur: 12 });
    await G.fade(0, 1.2);
    await G.wait(1.0);
    await G.say('CHLOE', 'Did you get what you needed?');
    A.look(C);
    await G.say('AIDAN', 'Chloe, did you see— did you hear—');
    await G.wait(0.3);
    await G.say('CHLOE', 'Still eleven.');
    await G.beat();
    C.expr('smile');
    await G.say('CHLOE', 'Go on. I\'ve got it.');
    C.look(null); C.eyes('down');
    await G.wait(0.8);
    A.look(null);
    if (A.raw) { A.raw.idleLife = true; A.raw.expr('neutral'); }
    note(G, 'The stockroom. Behind the back office.', 'c1_obj', { done: true });
    note(G, 'Unit 9, Hilltop Village. Hilltop Road — off the top of Relay Street.', 'c1_addr');
    G.camRelease();
  }, { letterbox: true, skippable: true });

  // @@CONTINUE@@

  // =================================================================================================================
  // Chapter 1
  // =================================================================================================================
  defineChapter({
    n: 1, id: 'ch1', title: 'THE PLAZA', card: 'SIGNAL HILL PLAZA',
    start: { room: 'c1_relay', entry: 'south' },
    // what a player carries into Chapter 1 (chapter select): everything from the Prologue
    debugState(s) {
      const give = (id, n = 1) => { const e = s.inv.find((i) => i && i.id === id); if (e) e.n += n; else s.inv.push({ id, n }); };
      give('returned_modem'); give('map_town'); give('box_cutter'); give('coffee', 1);
      s.equipped = 'box_cutter';
      s.maps.town = true;
      s.flags.p0_carDead = true;
      s.docs.timetable = { read: true };
      Object.assign(s.taken, { 'p2_lookout:modem': true, 'p2_lookout:map': true, 'p4_busshelter:cutter': true });
      Object.assign(s.done, { 'cs:P-1': true, 'cs:P-4': true, 'p4:reveal': true, 'p4:outcome': 'freed', 'p3:crossed': true, 'trig:p4_busshelter:near': true });
      s.spawns['p4_busshelter:teth'] = 'freed'; s.freedOrder.push('p4_busshelter:teth');
      s.F = 1; s.stats.freed = 1;
      s.notes.push({ id: 'p0_town', text: 'Get to her place. Reset the modem. Check her alarm. Say sorry.', done: false });
    },
    async begin(G, o = {}) {
      G.bars(null);
      if (G.once('c1:begin')) note(G, 'Her address. The old store in the Plaza — maybe the system\'s still in there.', 'c1_obj');
    },
  });
}
