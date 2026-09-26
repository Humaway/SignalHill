// ==== data/20_title.js — the title backdrop and the idle attract sequence (spec §2A "Title screen" steps 1–5) — tag TTL_ ====
// t_title: the fogged town seen from the Lookout — the gravel shoulder and its guardrail in the foreground, houses
//   stepping down the hill into the fog, and far off the mast's red light blinking. Slow and static (a 90 s drift of a
//   few centimetres); dead-air specks drift upward (the outdoor Fog world). Game builds it on its own: no player, no
//   spawns, no triggers, no onEnter; its K.animate callbacks run; its first camera (a keys camera) plays as is.
//   cutsceneOnly: skipped by the camera check.
// title:attract (60 idle seconds on the title): slow, silent shots of empty locations — Relay Street, the Crescent, the
//   Operators' Hall, the atrium — no text, then back to the title. Each shot starts from that room's own camera (by id,
//   so the shot follows the room if its author moves it) and drifts slowly forward.
{
  const clamp = U.clamp;
  const TEXC = new Map();
  function ttex(key, w, h, draw) {
    let t = TEXC.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d', { willReadFrequently: true }), w, h, U.rng(U.hash('ttl:' + key)));
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true; t.name = 'ttl:' + key;
    TEXC.set(key, t);
    return t;
  }
  const glowTex = () => ttex('glow', 64, 64, (x, w, h) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // a fog-immune glow (lamps through the murk; the mast's aircraft light)
  function TTL_glow(K, parent, x, y, z, size, color, op) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); s.userData.op = op;
    parent.add(s);
    return s;
  }

  // The title vista: the Lookout's gravel shoulder and guardrail in the foreground, weatherboard houses and cottages
  // stepping down the hill into the fog, gum trees between them, a few lamps glowing through the murk, and far off to
  // the north-east the mast with its red aircraft lights blinking. (This is the composition of the original title.)
  defineRoom({
    id: 't_title', name: 'TITLE — THE LOOKOUT', area: 'SIGNAL HILL', outdoor: true, surface: 'gravel', ambient: 'wind',
    fog: { density: 0.021 }, cutsceneOnly: true,
    bounds: [-9, -7, 9, 9],
    entries: { start: [0, 3, 180] },
    cameras: [
      // the one shot: a few centimetres of drift over a minute and a half (Game plays a keys camera as it is)
      { id: 't_title:vista', type: 'scripted', vol: [-9, -7, 9, 9], keys: [{ t: 0, pos: [0.6, 2.8, -1.6], target: [9, -6.5, -52], fov: 46 }, { t: 90, pos: [-0.3, 2.85, -2.0], target: [7.5, -6.7, -52], fov: 45 }] },
    ],
    build(K) {
      K.floor(-9, -7, 9, 9, 'gravel');
      K.prop('guardrail', 0, -6.2, 0, { len: 16 });
      K.prop('streetlight', -5.5, -3.5, 90);
      K.prop('road_sign', 6.2, -5.2, 200);
      K.prop('gum_tree', -8.2, -5.5, 30); K.prop('gum_tree_small', 8.4, -1.5, 120); K.prop('shrub', -3.6, -6.7, 0); K.prop('shrub', 3.2, -6.8, 70);
      // the hill falls away past the rail, down to the town
      K.floor(-60, -80, 60, -7, { tex: 'grass', color: '#3c4540' }, { ramp: { axis: 'z', y0: -30, y1: -0.3 } });
      for (let i = 0; i < 7; i++) K.prop('shrub', -15 + i * 5 + K.rng() * 2, -9 - K.rng() * 6, K.rng() * 360, { collide: false });
      // the town: houses and cottages stepping down the hill, a few gum trees between them
      const houses = [];
      const hillY = (z) => -0.3 + ((z + 7) / 73) * 29.7;
      for (let i = 0; i < 16; i++) {
        const x = -44 + (i % 8) * 12 + K.rng() * 6, z = -24 - Math.floor(i / 8) * 16 - K.rng() * 10, y = hillY(z);
        const kind = K.rng() < 0.45 ? 'cottage' : 'house';
        K.prop(kind, x, z, 150 + K.rng() * 60, { y, collide: false, lit: false, seed: i + 3 });
        houses.push([x, y, z]);
      }
      for (let i = 0; i < 7; i++) { const z = -30 - K.rng() * 30; K.prop(i % 2 ? 'gum_tree' : 'gum_tree_small', -42 + K.rng() * 50, z, K.rng() * 360, { y: hillY(z), collide: false }); }
      // lights through the fog (fog-immune additive sprites: lamps glowing in the murk)
      const lights = new THREE.Group(); lights.name = 't_title:lights';
      const lamps = [];
      for (let i = 0; i < houses.length; i += 3) { const [x, y, z] = houses[i]; lamps.push(TTL_glow(K, lights, x + 1.5, y + 1.6, z + 4.5, 1.3, '#ffb060', 0.12 + K.rng() * 0.08)); }
      lamps.push(TTL_glow(K, lights, -18, hillY(-32) + 6, -32, 3.2, '#ff9340', 0.2), TTL_glow(K, lights, 14, hillY(-42) + 6, -42, 3, '#ff9340', 0.16), TTL_glow(K, lights, 2, hillY(-52) + 6, -52, 2.6, '#ff9340', 0.12));
      // the mast far off to the north-east with its blinking red aircraft lights
      const mx = 52, mz = -112, my = -30;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        K.cyl(mx + Math.cos(a) * 1.4, my, mz + Math.sin(a) * 1.4, 0.16, 46, '#1b2120', { r2: 0.06, seg: 5, name: 't_title:mastleg' + k });
      }
      for (let yy = 3; yy < 44; yy += 4.5) K.box(mx, my + yy, mz, 3.2 - yy * 0.06, 0.1, 0.1, '#1b2120', { name: 't_title:brace' + yy });
      const red = TTL_glow(K, lights, mx, my + 46.6, mz, 5.5, '#ff2a1c', 0);
      const red2 = TTL_glow(K, lights, mx, my + 30, mz, 3.6, '#ff2a1c', 0);
      K.mesh(lights, { name: 't_title:lights' });
      K.animate((dt, t) => {
        red.material.opacity = (t % 2.1) < 0.6 ? 0.95 : 0.04;
        red2.material.opacity = ((t + 1.05) % 2.1) < 0.6 ? 0.55 : 0;
        for (let i = 0; i < lamps.length; i++) lamps[i].material.opacity = lamps[i].userData.op * (0.85 + 0.15 * Math.sin(t * 0.7 + i * 1.7));
      });
    },
  });

  // =================================================================================================================
  // title:attract — slow, silent shots of empty places, no text (Game fades between them; any input aborts)
  // =================================================================================================================
  // a room camera by id → a slow push along its view; falls back to the given pos/target
  function TTL_shot(roomId, camId, fb, o = {}) {
    const list = (typeof CAMERAS !== 'undefined' && CAMERAS[roomId]) || (ROOMS[roomId] && ROOMS[roomId].cameras) || [];
    const c = list.find((d) => d && d.id === camId);
    const pos = o.pos || (c && c.pos) || fb.pos, target = o.target || (c && c.target) || fb.target;
    const fov = o.fov || (c && typeof c.fov === 'number' ? c.fov : fb.fov || 46);
    const d = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize().multiplyScalar(o.push ?? 1.6);
    const lift = o.lift || 0;
    return { keys: [{ t: 0, pos, target, fov }, { t: o.dur || 12, pos: [pos[0] + d.x, pos[1] + d.y + lift, pos[2] + d.z], target: [target[0] + d.x * 0.5, target[1], target[2] + d.z * 0.5], fov: fov - 2 }] };
  }
  defineScript('title:attract', async (G, o) => {
    const { signal, show } = o;
    const shots = [
      // Relay Street: from high over the junction, the traffic light blinking amber into the fog
      ['c1_relay', TTL_shot('c1_relay', 'c1_relay:junction', { pos: [7.4, 11.5, -140.5], target: [6.6, 0, -166.5] }, { fov: 44, push: 2.2 })],
      // the Crescent: from the community hall's roof, the loop road and the doorsteps with their modem boxes
      ['c2_crescent', TTL_shot('c2_crescent', 'c2_crescent:hall', { pos: [33.8, 3.3, 43.2], target: [29.4, 0.9, 28.2] }, { fov: 46, push: 1.6 })],
      // the Operators' Hall: the long symmetrical shot down the centre aisle to Wai's board
      // (from under the pendant lamps' line, not level with it: the push would carry the lens through a lamp shade)
      ['c3_hall', TTL_shot('c3_hall', 'c3_hall:long', { pos: [39.35, 3.25, 7], target: [4, 1.25, 7] }, { fov: 40, push: 2.2, pos: [39.3, 2.6, 7], target: [4, 1.35, 7] })],
      // the atrium: low (clear of the furniture in front of the lens), looking up the three storeys to the leaderboard wall
      ['c5_atrium', TTL_shot('c5_atrium', 'none', { pos: [20, 1.0, 20.6], target: [20, 7.5, 8.4], fov: 52 }, { push: 0.5, lift: 0.15 })],
    ];
    // rooms build from S, and the title's S is a fresh state: the Operators' Hall would be built with its HALL circuit
    // off (black but for Wai's lamp). For its shot the hall has its lights on — the room as the player first sees it lit
    // (the fresh state is put back straight after; a new game or a load replaces S anyway).
    const TTL_state = { c3_hall: (s) => { s.done = s.done || {}; const had = Object.prototype.hasOwnProperty.call(s.done, 'c3:circ'), v = s.done['c3:circ']; s.done['c3:circ'] = 'HALL|FRAME|BASEMENT'; return () => { if (had) s.done['c3:circ'] = v; else delete s.done['c3:circ']; }; } };
    for (const [room, cam] of shots) {
      if (signal && signal.aborted) return;
      if (!ROOMS[room]) continue;
      const undo = TTL_state[room] ? TTL_state[room](S) : null;
      let ok = false;
      try { ok = await show(room, { cam, dur: 7.5 }); } finally { if (undo) undo(); }
      if (!ok) return;
    }
  });
}
