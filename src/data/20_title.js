// ==== data/20_title.js — the title backdrop and the idle attract sequence (spec §2A "Title screen" steps 1–5) — tag TTL_ ====
// t_title: the fogged town seen from the Lookout — the gravel shoulder and its guardrail in the foreground, the coin
//   binoculars, the scenic-lookout sign, a gum tree at the edge of frame; beyond the rail the hill falls away into the
//   fog, the town's sodium lamps and porch lights glowing through it, the Plaza's sign a faint teal smudge, and far off
//   up the hill the mast's red light blinking. Slow and static (a 90 s drift of a few centimetres); dead-air specks
//   drift upward (the outdoor Fog world). Game builds it on its own: no player, no spawns, no triggers, no onEnter; its
//   K.animate callbacks run; its first camera (a keys camera) plays as is. No walkable floor (Cam.check → []).
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
    draw(c.getContext('2d'), w, h, U.rng(U.hash('ttl:' + key)));
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
  // the hill below the rail: falls from the shoulder (z ≈ −1) to the town (y ≈ −26 at z −45) and on into the fog
  const TTL_hill = (x, z) => (z > -1 ? 0 : -Math.min(17, Math.pow((-1 - z) / 40, 0.85) * 15) + 1.2 * Math.sin(x * 0.07 + z * 0.05));
  // the town rises again on the far side toward the summit (north-east)
  const TTL_town = (x, z) => -15 + clamp((-z - 70) / 80) * 14 + clamp((x - 10) / 80) * 6;

  defineRoom({
    id: 't_title', name: 'TITLE — THE LOOKOUT', area: 'SIGNAL HILL', outdoor: true, surface: 'gravel', ambient: 'wind',
    fog: { density: 0.017 }, grade: 'title',
    bounds: [-2, -2, 2, 2],
    entries: { start: [0, 3, 180] },
    cameras: [
      // the one shot: a few centimetres of drift over a minute and a half (Game plays a keys camera as it is)
      { id: 't_title:vista', type: 'scripted', vol: [-2, -2, 2, 2], keys: [{ t: 0, pos: [0.3, 1.95, 2.0], target: [8, -6.8, -60], fov: 46 }, { t: 90, pos: [-0.4, 2.0, 1.6], target: [6.8, -6.9, -60], fov: 44.5 }] },
    ],
    build(K) {
      // ---- the shoulder: gravel, the kerb, the guardrail over the valley ------------------------------------------
      K.box(0, -0.06, 4, 40, 0.06, 10, 'gravel', { shadow: false });
      // (the rail: weathered timber posts and a galvanised W-beam, beaded with fog)
      for (let x = -15; x <= 15; x += 2) K.box(x, 0, -0.62, 0.14, 0.78, 0.14, { tex: 'wood', color: '#5e564a' });
      K.box(0, 0.42, -0.52, 32, 0.3, 0.06, { tex: 'metal', color: '#8d9591', roughness: 0.45, metalness: 0.5 });
      K.box(0, 0.52, -0.49, 32, 0.06, 0.02, { tex: 'metal', color: '#a4aba6', roughness: 0.4, metalness: 0.5 });
      K.dress('leaves', [-10, 0, 10, 6], 18, { seed: 14 });
      // the coin binoculars on their post, the scenic-lookout sign, a bin
      {
        const bx = -2.6, bz = 0.25;
        K.cyl(bx, 0, bz, 0.07, 1.05, { tex: 'metal', color: '#4d5a5c' });
        K.box(bx, 1.05, bz, 0.34, 0.24, 0.22, { tex: 'metal', color: '#5a6b6e' }, { rot: 20 });
        for (const s of [-1, 1]) K.cyl(bx + s * 0.07, 1.14, bz - 0.14, 0.045, 0.1, { tex: 'metal', color: '#2a3032' }, { rx: 90 });
        K.box(bx + 0.12, 1.08, bz + 0.1, 0.06, 0.08, 0.02, { tex: 'metal', color: '#b89a52' });
      }
      K.sign('SCENIC LOOKOUT', 5.4, 1.9, 0.1, 1.4, 0.36, { style: 'council', rotY: 200 });
      K.box(5.4, 0, 0.1, 0.07, 1.72, 0.07, { tex: 'metal', color: '#8f9791' });
      K.prop('bin', -5.2, 1.0, 0, { variant: 'street' });
      // a gum tree leaning into the frame on the right; shrubs along the edge
      K.prop('gum_tree', 8.6, 0.8, 200, { collide: false });
      K.prop('gum_tree_small', -9.5, -1.8, 40, { collide: false, y: -1.2 });
      for (const [x, z] of [[-6.5, -1.2], [2.2, -1.4], [6.8, -1.6], [-1.2, -1.7]]) K.prop('shrub', x, z, x * 31, { collide: false, y: -0.5 });
      // the one streetlight on the shoulder (left, just out of the frame's corner): sodium on the gravel
      K.prop('streetlight', -7.5, 2.4, 90, { lit: true, light: false });
      K.light('point', -6.2, 5.8, 2.4, { color: '#ffa04a', intensity: 7, distance: 14 });
      // ---- the hill falling away below the rail ------------------------------------------------------------------
      {
        const geo = new THREE.PlaneGeometry(260, 150, 64, 40); geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i) - 76; p.setZ(i, z); const y = z < -60 ? Math.min(TTL_hill(x, z), TTL_town(x, z)) : TTL_hill(x, z); p.setY(i, y - 0.3); uv.setXY(i, x / 4, z / 4); }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: Tex.get('grass'), color: new THREE.Color('#5d6655'), roughness: 0.95 }));
        m.receiveShadow = true; K.mesh(m, { name: 't_title:hill' });
      }
      const R = U.rng(1994);
      for (let i = 0; i < 30; i++) { const x = -60 + R() * 120, z = -6 - R() * 44; if (Math.abs(x - 6) < 16 && z > -26) continue; K.prop(i % 3 ? 'gum_tree' : 'gum_tree_small', x, z, R() * 360, { y: TTL_hill(x, z) - 0.3, collide: false }); }
      // ---- the town in the fog: roofs, a few lit windows, the lamps along its streets ------------------------------
      const lights = new THREE.Group(); lights.name = 't_title:lights';
      const houses = [];
      for (let i = 0; i < 26; i++) {
        const x = -58 + (i % 9) * 14 + R() * 6, z = -72 - Math.floor(i / 9) * 22 - R() * 10, y = TTL_town(x, z);
        K.prop(R() < 0.45 ? 'cottage' : 'house', x, z, 160 + R() * 50, { y, collide: false, lit: R() < 0.35, seed: i + 7 });
        houses.push([x, y, z]);
      }
      // the Plaza: a long low roof, its sign a teal smudge; the exchange's brick block up the slope
      K.box(-18, TTL_town(-18, -72) - 0.5, -72, 34, 7, 18, { tex: 'render_cracked', color: '#6b6e68' });
      K.box(22, TTL_town(22, -98) - 0.5, -98, 26, 12, 14, { tex: 'brick', color: '#6a4a3e' });
      const lamps = [];
      for (const [x, y, z] of houses) if (R() < 0.55) lamps.push(TTL_glow(K, lights, x + (R() - 0.5) * 4, y + 1.6, z + 4.8, 1.4 + R() * 0.6, '#ffb866', 0.3 + R() * 0.15));
      // Relay Street's sodium lamps, a line running up the town; Hilltop Road's switchbacks further up
      for (let k = 0; k < 10; k++) { const x = -34 + k * 1.4, z = -66 - k * 8.5; lamps.push(TTL_glow(K, lights, x, TTL_town(x, z) + 6.4, z, 4.2, '#ff9340', 0.42 - k * 0.02)); }
      for (let k = 0; k < 7; k++) { const x = 2 + k * 7, z = -124 - (k % 2) * 7; lamps.push(TTL_glow(K, lights, x, TTL_town(x, z) + 6, z, 3.6, '#ff9340', 0.3)); }
      const plaza = TTL_glow(K, lights, -12, TTL_town(-12, -63) + 5.2, -63, 4.6, '#3ad4c8', 0.3);
      lamps.push(TTL_glow(K, lights, -9, TTL_town(-9, -63) + 5.2, -63, 2.4, '#ffd23a', 0.26));
      // the amber traffic light at the junction, blinking
      const amber = TTL_glow(K, lights, -22, TTL_town(-22, -120) + 3.6, -120, 2.6, '#ffab2e', 0.0);
      // ---- the mast on the summit, far off: a lattice lost in the fog, its red aircraft lights blinking --------------
      const mx = 58, mz = -150, my = TTL_town(58, -150) + 2;
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.4; K.cyl(mx + Math.cos(a) * 1.5, my, mz + Math.sin(a) * 1.5, 0.18, 34, '#1b2120', { r2: 0.06, seg: 5 }); }
      for (let yy = 3; yy < 32; yy += 4) K.box(mx, my + yy, mz, 3.4 - yy * 0.08, 0.12, 0.12, '#1b2120', { rot: yy * 17 });
      const red = TTL_glow(K, lights, mx, my + 34.8, mz, 6.0, '#ff2a1c', 0);
      const red2 = TTL_glow(K, lights, mx, my + 21, mz, 3.8, '#ff2a1c', 0);
      K.mesh(lights, { name: 't_title:lights' });
      K.animate((dt, t) => {
        red.material.opacity = (t % 2.1) < 0.6 ? 0.95 : 0.04;
        red2.material.opacity = ((t + 1.05) % 2.1) < 0.6 ? 0.55 : 0;
        amber.material.opacity = (t % 1.1) < 0.55 ? 0.5 : 0.02;
        plaza.material.opacity = plaza.userData.op * (0.8 + 0.2 * Math.sin(t * 0.4));
        for (let i = 0; i < lamps.length; i++) lamps[i].material.opacity = lamps[i].userData.op * (0.85 + 0.15 * Math.sin(t * 0.7 + i * 1.7));
      });
      // (a room of its own for the debug build: a line if anyone walks it)
      K.examine(0, 1.0, -0.4, ['The whole town, down there in the fog.', 'The mast. [beat] Its light, blinking. On and off. On and off.'], { id: 't_title:rail', r: 2 });
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
      ['c3_hall', TTL_shot('c3_hall', 'c3_hall:long', { pos: [39.35, 3.25, 7], target: [4, 1.25, 7] }, { fov: 40, push: 3.0 })],
      // the atrium: extreme low, looking up the three storeys to the leaderboard wall
      ['c5_atrium', TTL_shot('c5_atrium', 'none', { pos: [20, 0.55, 20.2], target: [20, 7.5, 8.4], fov: 52 }, { push: 0.6, lift: 0.25 })],
    ];
    for (const [room, cam] of shots) {
      if (signal && signal.aborted) return;
      if (!ROOMS[room]) continue;
      const ok = await show(room, { cam, dur: 7.5 });
      if (!ok) return;
    }
  });
}
