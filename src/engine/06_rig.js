// ==== engine/06_rig.js — the one human-figure builder, character presets, procedural animation, faces ====
// ARCHITECTURE §6 · spec §2 "Characters on screen", §5 cast bible, §6 monsters (built by Enemies FROM Rig.human), §7.
//
//   Rig.human(params) → Actor          every human and humanoid monster
//   Rig.create(presetId, opts) → Actor presets in Rig.PRESETS; opts override the preset (deep-merged one level)
//   Rig.PRESETS                        aidan wai chase chloe luka luke nan nan_gown man_counter old_man customer rep aidan_perfect
//   CONTRACT+: Rig.update(dt)          updates every live actor that has not been updated this frame (Time.frame)
//   CONTRACT+: Rig.actors              Set of live actors;  Rig.prop(kind, opts) → a standalone hand prop Object3D
//   CONTRACT+: Rig.definePreset(id, params, extra), Rig.defineGesture(name, def), Rig.defineAnim(name, def)
//   CONTRACT+: Rig.ANIMS / Rig.GESTURES / Rig.EXPRS / Rig.PROP_KINDS / Rig.ARM_POSES (name lists)
//
// Loops (setAnim): the contract list + CONTRACT+ sit_lean (Luka: elbows on knees), sit_bed (propped up in bed), kneel_one,
//   lie_side (curled), hurt (holding ribs). setAnim opts: {speed, blend, seat (m, sit family), seated (type/work),
//   desk (m, type), range/speed (pace)}. Walk/run/pace/stagger share one gait phase driven by the body's MEASURED motion
//   (scripts move actor.root; feet stay planted via leg IK), nominal walkSpeed/runSpeed when standing still. Standing
//   loops step automatically if the root is carried or turned. climb follows the root's vertical speed, crawl its speed.
// Gestures (gesture(name, opts) → Promise, resolves when done or replaced): the contract list + CONTRACT+ peer, sigh,
//   clench, flinch, look_around, smooth_uniform, touch_pendant, grip, earbud_out, earbud_in, glasses_off, glasses_on.
//   opts: {hand:'L'|'R', hold (stay until replaced / finishGestures; resolves at mid-way), dur, speed, target (reach /
//   hand_on_shoulder / offer: Vector3|Actor|[x,y,z]), to (sit_down / stand_up end loop), onStrike (swing), instant, amount
//   (tremor)}. pen_click plays Snd 'penclick' at each click (Bus 'sfx' if Snd is absent); Chloe's pins play 'pins'.
// Expressions: the contract list + CONTRACT+ angry, scared, pain, shout. eyes(): 'ahead' (follows lookAt) | 'down' |
//   'at' (target) | 'away' (averted from target) | 'closed'. Blinks every 3–7 s, saccades, lids follow the gaze.
// hold(hand, kind, opts): kinds = Rig.PROP_KINDS (phone tablet bar coffee clipboard candybar flip headset keys box_cutter
//   extinguisher pen box jumper_tool pendant handset card); opts {pose (arm pose name|false), screen (phone: own canvas →
//   actor.phoneScreen), case, tex (screen/paper texture), open (flip), text/role (card)}. A held phone exposes
//   obj.userData.torch (Object3D at the back camera, +Z out of the back) and obj.userData.screen (mesh).
//   Each prop sets a default carry pose (Rig.ARM_POSES: phone phone_look phone_up phone_ear cup bar bar_ready clipboard
//   clipboard_face offer pocket hold fist extinguisher ribs tuck card shield arms_crossed clasp tablet_read); pose
//   objects {w:[x,y,z], pole, fing, palm, curl, thumb, space:'chest'|'head'} use chest (H units) or head space.
//   setTint(color, amount, {skin:true}) flushes skin only (the Reach).
//
// Figure: an Object3D bone hierarchy (root → body → hips → spine → chest → neck → head; chest → shoulder → upperArm →
// foreArm [→ foreArm2] → hand (palm, index, fingers, thumb); hips → thigh → shin → foot) carrying segmented geometry
// (tapered superellipse tubes). 1 unit = 1 m, the actor faces +Z, its left is +X. Geometry is cached and shared
// between actors; materials, the 256 px face canvas and the phone screen are per actor (dispose() frees them).
//
// Params (all optional) — Rig.human({ … }):
//   height (m, standing, default 1.75)   build 'average'|'slim'|'stocky'|'broad'|'slight'|'thin'|'heavy'|'frail'
//   gender 'm'|'f', age (years)          skin '#hex'   seed (number; varies small details)
//   hair {style:'short_messy'|'short'|'crew'|'buzz'|'ponytail'|'bun'|'neat'|'bob'|'long'|'receding'|'bald', color}
//   hat 'flatcap'|null   beard 'neat'|'scruffy'|'full'|null   (stubble is painted: face.stubble 0..1)
//   top {kind:'polo'|'hoodie'|'jacket'|'cardigan'|'hivis'|'shirt'|'gown'|'suit'|'blouse'|'tee'|'jumper', color,
//        color2 (second tone: hi-vis navy, suit shirt), open (hoodie/cardigan/jacket), sleeves:'short'|'long'|'pushed',
//        logo:true (store wordmark), patch:'TEXT' (embroidered chest patch), fresh (no creases/wear)}
//   layers [ top… ]  worn over `top` (outermost last) — e.g. aidan: top polo, layers [hoodie open]
//   pants {kind:'work'|'jeans'|'track'|'slacks'|'suit'|'skirt'|'none', color, belt}   shoes {kind:'sneaker'|'boot'|
//        'dress'|'flat'|'sock'|'slipper', color, sole}
//   lanyard {color, card:'TEXT' (Tex.label card), role, keys:false, pins:0, badge:'TEXT'} — rests on the chest in a V
//   badge 'TEXT' (pinned name badge)   visitor 'TEXT' (hospital visitor sticker)   pendant {color, cord} (on the chest)
//   glasses {style:'reading'|'round'|'square', color, low:false (on the nose tip), cord:false (don't: spec §1),
//            state:'on'|'hang' ('hang' = hooked into the shirt placket)}
//   earbuds 'in'|'out'|null   toolroll true   beltPhone true (candy-bar phone in a belt pouch)   hands {scraped, rings, wristband, extraKnuckles}   face {…canvas params}
//   face: {eyes (iris), brows, browThick, lips, bags 0..1, redRim 0..1, stubble 0..1, wrinkles 0..1, blush, scar
//          'left_brow', makeup, freckles}
//   detail 'high'|'low' (low: mitten hands, painted eyes, no small dangles — crowds)
//   Monster knobs:
//   hunch 0..1 (spine/neck curl, shoulders forward, knees bent)   armScale (1 = human; 2 = the Reach)
//   armJoints 2|3 (3 adds bones.foreArm2L/R, a second elbow)      legScale 1   headScale 1   neckLen 1 (multiplier)
//   headTilt degrees (90 = the Standard's head bent forward)      faceMode 'painted'|'none'|'custom'
//   eyes false (hide eye meshes; actor.eyeAnchors still exist)    jaw {drop} (head heights the lower jaw hangs; the Reach)
//   extraArms n (extra arm pairs on the lower chest: bones.extra[i].{shoulderL…handR}; actor.extraArmMode
//   'mirror'|'writhe'|'manual')   tint {color, amount} (emissive flush)   opacity 0..1
//   Access for monster builders: actor.bones.*, actor.parts.* (named meshes), actor.faceMount (Object3D at the face,
//   +Z out of the face), actor.eyeAnchors.{L,R}, actor.anchors.{gripL,gripR,chest,back,belt,card,head},
//   actor.faceCanvas {canvas, ctx, tex, repaint()}, actor.setCard(text), actor.setJaw(drop), actor.mats (all materials).
//
// Actor (ARCHITECTURE §6): root, id, preset, height, bones, setAnim(name,{speed,blend}), gesture(name,opts) → Promise,
//   lookAt(target|null), eyes(mode,target), expr(name), hold(hand, kind|Object3D|null), setTint(color, amount),
//   setOpacity(a), visible(bool), walkSpeed, update(dt), dispose().
//   CONTRACT+: runSpeed, posture 0..1 (Aidan straightens chapter by chapter), idleLife (random habit gestures, default
//   true), armPose(hand, name|null|{…}) (persistent carry pose), talk(on|seconds), wear(kind, on), glassesState(s),
//   setEarbuds(bool), finishGestures(), setPhoneLight(intensity), phoneScreen {tex,ctx,canvas,draw,update} (actor
//   holding a 'phone' with {screen:true}; Aidan by default), held.{L,R}, anim, speed (measured m/s), seatHeight (m, sit
//   poses), sound (true: pin clinks / pen click), bodyOffset (Vector3 — pace moves the body inside root).
const Rig = (() => {
  const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
  const clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  const G2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  const TU = Tex.util;
  const H_NOM = 1.75;               // nominal height for UV density of H-unit geometry
  const TILE = 0.25;                // every rig fabric texture covers 0.25 m per tile
  const hexOf = (c) => '#' + new THREE.Color(c).getHexString();
  const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  const shadeHex = (a, k) => '#' + new THREE.Color(a).multiplyScalar(k).getHexString();

  // ---------------------------------------------------------------------------------------------------------------
  // Canvas2D textures (registered with Tex so they preload/cache with everything else). All are near-white and are
  // tinted by the material colour, so one texture serves every garment colour.
  // ---------------------------------------------------------------------------------------------------------------
  function pixels(ctx, w, h, fn) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) fn(d, p * 4, x, y, p);
    ctx.putImageData(img, 0, 0);
  }
  // soft stroke drawn on all 9 tile offsets so the texture keeps tiling
  function wrapStroke(ctx, w, h, draw) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); draw(ctx); ctx.restore(); } }
  function creases(ctx, w, h, r, n, a = 0.07) {
    for (let k = 0; k < n; k++) {
      const x = r() * w, y = r() * h, len = w * (0.15 + r() * 0.35), ang = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : HALF), wd = 2 + r() * 5;
      wrapStroke(ctx, w, h, (c) => {
        c.save(); c.translate(x, y); c.rotate(ang);
        const g = c.createLinearGradient(0, -wd, 0, wd);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.6})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, len / 2, wd, 0, 0, TAU); c.fill(); c.restore();
      });
    }
  }
  function stains(ctx, w, h, r, n, col = [90, 80, 60], a = 0.08) {
    for (let k = 0; k < n; k++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * w * 0.12;
      wrapStroke(ctx, w, h, (c) => {
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`); g.addColorStop(0.7, `rgba(${col[0]},${col[1]},${col[2]},${a * 0.5})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
  }
  const defTex = (name, px, gen, mat = {}) => Tex.define(name, { px, size: TILE, gen, mat });
  defTex('rig_pique', 256, (ctx, w, h, r, o = {}) => {  // polo piqué knit (o.fresh: pressed, no creases)
    const n = TU.fbm(w, h, r, { cells: 4, oct: 4 }), n2 = TU.fbm(w, h, r, { cells: 32, oct: 2 });
    pixels(ctx, w, h, (d, i, x, y, p) => {
      const cx = x % 4, cy = (y + ((x >> 2) & 1) * 2) % 4;
      const v = 236 * ((cx === 0 || cy === 0) ? 0.88 : 1) * (0.93 + n[p] * 0.1) * (0.975 + n2[p] * 0.05);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    });
    if (!o.fresh) { creases(ctx, w, h, r, 6, 0.06); stains(ctx, w, h, r, 3, [70, 70, 60], 0.05); }
  });
  defTex('rig_jersey', 256, (ctx, w, h, r) => {         // hoodie fleece / jersey
    const n = TU.fbm(w, h, r, { cells: 6, oct: 5 }), n2 = TU.fbm(w, h, r, { cells: 64, oct: 1 });
    pixels(ctx, w, h, (d, i, x, y, p) => {
      const rib = (x % 3 === 0) ? 0.95 : 1;
      const v = 232 * rib * (0.92 + n[p] * 0.12) * (0.96 + n2[p] * 0.08);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    });
    for (let k = 0; k < 500; k++) { ctx.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; ctx.fillRect(r() * w, r() * h, 1.5, 1.5); }
    creases(ctx, w, h, r, 8, 0.09);
    stains(ctx, w, h, r, 4, [60, 55, 45], 0.06);
  });
  defTex('rig_twill', 256, (ctx, w, h, r) => {          // work pants / jacket drill
    const n = TU.fbm(w, h, r, { cells: 4, oct: 5 });
    pixels(ctx, w, h, (d, i, x, y, p) => {
      const t = ((x + y) % 4) < 2 ? 0.9 : 1;
      const v = 230 * t * (0.9 + n[p] * 0.16);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    });
    creases(ctx, w, h, r, 7, 0.08);
    stains(ctx, w, h, r, 5, [150, 140, 120], 0.07);
  });
  defTex('rig_denim', 256, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 3, oct: 5 });
    const slub = new Float32Array(w); for (let x = 0; x < w; x++) slub[x] = r() < 0.15 ? 1.08 + r() * 0.1 : 1;
    pixels(ctx, w, h, (d, i, x, y, p) => {
      const t = ((x + y * 3) % 6) < 3 ? 0.88 : 1;
      const v = 200 * t * slub[x] * (0.85 + n[p] * 0.3);
      d[i] = v * 0.97; d[i + 1] = v * 0.99; d[i + 2] = v; d[i + 3] = 255;
    });
    creases(ctx, w, h, r, 9, 0.1);
  });
  defTex('rig_suit', 256, (ctx, w, h, r, o = {}) => {
    const n = TU.fbm(w, h, r, { cells: 8, oct: 4 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const v = 226 * (0.95 + n[p] * 0.08) * (((x + y) % 2) ? 0.985 : 1); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
    if (!o.fresh) creases(ctx, w, h, r, 4, 0.05);
  });
  defTex('rig_canvas', 256, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 3, oct: 5 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const v = 222 * ((((x >> 1) + (y >> 1)) & 1) ? 0.9 : 1) * (0.84 + n[p] * 0.28); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
    stains(ctx, w, h, r, 8, [80, 60, 30], 0.1);
  });
  defTex('rig_tweed', 256, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 8, oct: 4 });
    pixels(ctx, w, h, (d, i, x, y, p) => {
      const check = ((x % 32) < 2 || (y % 32) < 2) ? 0.85 : 1;
      const f = r(); const fl = f < 0.08 ? 1.35 : f < 0.16 ? 0.7 : 1;
      const v = 200 * check * fl * (0.88 + n[p] * 0.22);
      d[i] = v; d[i + 1] = v * 0.97; d[i + 2] = v * 0.92; d[i + 3] = 255;
    });
  });
  defTex('rig_skin', 128, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 4, oct: 5 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const v = 246 * (0.955 + n[p] * 0.07); d[i] = v; d[i + 1] = v * 0.985; d[i + 2] = v * 0.975; d[i + 3] = 255; });
    for (let k = 0; k < 300; k++) { ctx.fillStyle = `rgba(120,70,60,${0.03 + r() * 0.05})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
  });
  defTex('rig_hair', 256, (ctx, w, h, r) => {           // strands run along v
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) {
      const x = r() * w, v = 110 + r() * 145, len = h * (0.2 + r() * 0.6), y = r() * h, sw = (r() - 0.5) * 10;
      ctx.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`; ctx.lineWidth = 0.6 + r() * 1.4;
      for (const dy of [-h, 0, h]) for (const dx of [-w, 0, w]) {
        ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.quadraticCurveTo(x + dx + sw, y + dy + len / 2, x + dx + sw * 0.4, y + dy + len); ctx.stroke();
      }
    }
  }, { roughness: 0.6 });
  defTex('rig_leather', 128, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 8, oct: 4 }), n2 = TU.fbm(w, h, r, { cells: 3, oct: 3 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const c = Math.abs(n[p] - 0.5) < 0.03 ? 0.8 : 1; const v = 225 * c * (0.85 + n2[p] * 0.25); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
    creases(ctx, w, h, r, 5, 0.12);
  });
  defTex('rig_sneaker', 128, (ctx, w, h, r) => {
    const n = TU.fbm(w, h, r, { cells: 4, oct: 4 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const m = ((x % 3) === 0 && (y % 3) === 0) ? 0.9 : 1; const v = 238 * m * (0.94 + n[p] * 0.08); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
    for (const y of [h * 0.3, h * 0.72]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([]);
    stains(ctx, w, h, r, 10, [95, 85, 70], 0.16);   // scuffs
  });
  defTex('rig_gown', 256, (ctx, w, h, r) => {            // hospital gown print (coloured, not tinted)
    const n = TU.fbm(w, h, r, { cells: 4, oct: 4 });
    pixels(ctx, w, h, (d, i, x, y, p) => { const k = 0.93 + n[p] * 0.1; d[i] = 176 * k; d[i + 1] = 204 * k; d[i + 2] = 206 * k; d[i + 3] = 255; });
    ctx.fillStyle = 'rgba(70,112,138,0.55)';
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const x = i * 32 + (j & 1) * 16 + 16, y = j * 32 + 16;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
    }
    creases(ctx, w, h, r, 8, 0.07);
  });
  defTex('rig_tape', 64, (ctx, w, h, r) => {             // reflective tape (micro-beads + segments)
    ctx.fillStyle = '#c9ccce'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) { const v = 170 + r() * 85; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
    ctx.fillStyle = 'rgba(90,95,100,0.35)'; for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Geometry helpers (all cached geometry is shared: userData.shared = true, never disposed by actors)
  // ---------------------------------------------------------------------------------------------------------------
  const GEO = new Map();
  const geo = (key, fn) => {
    let g = GEO.get(key);
    if (!g) { g = fn(); g.userData.shared = true; g.computeBoundingSphere(); g.computeBoundingBox(); GEO.set(key, g); }
    return g;
  };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // Superellipse tube along +Y. rings: [y, rx, rz, cx=0, cz=0, ex=2] ordered by ascending y. A ring with rx=rz=0 closes
  // the end. o: {seg, gap (half-angle removed around the front θ=0, number or fn(i,y)), uvs (uv units per geometry
  // unit), side-seam normal fix}. θ=0 is +Z (front), θ=π/2 is +X (the actor's left).
  function tube(rings, o = {}) {
    const seg = o.seg || 12, n = rings.length, cols = seg + 1, uvs = o.uvs || 1;
    const pos = new Float32Array(n * cols * 3), uv = new Float32Array(n * cols * 2), idx = [];
    let vAcc = 0;
    for (let i = 0; i < n; i++) {
      const [y, rx, rz, cx = 0, cz = 0, ex = 2] = rings[i];
      if (i > 0) { const p = rings[i - 1]; vAcc += Math.hypot(y - p[0], (rx + rz - p[1] - p[2]) / 2, cz - (p[4] || 0)); }
      const g = typeof o.gap === 'function' ? o.gap(i, y) : (o.gap || 0);
      const circ = PI * (rx + rz);
      for (let j = 0; j <= seg; j++) {
        const th = g + (j / seg) * (TAU - 2 * g);
        const s = Math.sin(th), c = Math.cos(th);
        const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / ex), sz = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex);
        const k = (i * cols + j) * 3;
        pos[k] = cx + rx * sx; pos[k + 1] = y; pos[k + 2] = cz + rz * sz;
        const q = (i * cols + j) * 2;
        uv[q] = (j / seg) * Math.max(circ, 0.02) * uvs; uv[q + 1] = vAcc * uvs;
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (!o.gap) {           // weld the seam normals
      const nr = g.attributes.normal;
      for (let i = 0; i < n; i++) {
        const a = i * cols, b = a + seg;
        const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
        nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
      }
    }
    return g;
  }
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _v4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
  // transformed clone: p [x,y,z], r [x,y,z] radians (XYZ), s number|[x,y,z]
  function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
    const c = g.clone();
    _e4.set(r[0], r[1], r[2]); _q4.setFromEuler(_e4);
    if (typeof s === 'number') _s4.set(s, s, s); else _s4.set(s[0], s[1], s[2]);
    _m4.compose(_v4.set(p[0], p[1], p[2]), _q4, _s4);
    c.applyMatrix4(_m4);
    return c;
  }
  // merge (non-indexed output) keeping position/normal/uv and optional vertex colours
  function merge(list) {
    list = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
    const anyCol = list.some((g) => g.attributes.color);
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), colA = anyCol ? new Float32Array(n * 3) : null;
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
      if (colA) { if (g.attributes.color) colA.set(g.attributes.color.array.subarray(0, c * 3), o * 3); else colA.fill(1, o * 3, (o + c) * 3); }
      o += c;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (colA) m.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    return m;
  }
  // vertex colours from fn(x,y,z) → [r,g,b] (0..1)
  function vcol(g, fn) {
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  const rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  // flat ribbon through points (array of Vector3) with per-point normals (Vector3), width w
  function ribbon(pts, normals, w, uvs = 1) {
    const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = (i < n - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
      const side = new THREE.Vector3().crossVectors(t, normals[i]).normalize().multiplyScalar(w / 2);
      if (i > 0) acc += p.distanceTo(pts[i - 1]);
      pos.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
      uv.set([0, acc * uvs, 1, acc * uvs], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // ---------------------------------------------------------------------------------------------------------------
  // The head, in "head units" (1 ≈ chin→crown; chin y≈0, crown y≈0.98, eye line y=0.5, face toward +Z, width ±0.335).
  // The face canvas is front-projected: u = 0.5 + X/0.72, v = (Y+0.03)/1.06, so painted features line up exactly with
  // the carved sockets, the nose mesh (which samples the same canvas) and the eye meshes.
  // ---------------------------------------------------------------------------------------------------------------
  const EYE = { x: 0.135, y: 0.5, r: 0.052 };
  const HEAD_PIVOT = [0, 0.29, -0.08];        // the atlas (head bone) in head units
  const MOUTH_Y = 0.2;
  const FU = (X) => 0.5 + X / 0.72, FV = (Y) => (Y + 0.03) / 1.06;
  function headShape(x, y, z, carve = true) {
    let X = x * 0.335, Y = 0.585 + y * (y > 0 ? 0.45 : 0.6), Z = z * 0.43;
    if (y < 0) {
      const t = -y;
      X = Math.sign(x) * Math.pow(Math.abs(x), 1 - 0.34 * t) * 0.335 * (1 - 0.2 * t * t);   // square jaw, narrower chin
      Z *= z < 0 ? 1 - 0.5 * t : 1 - 0.08 * t * t;      // the back of the jaw recedes into the neck
      if (t > 0.8) Y += (t - 0.8) * 0.12;                // flatter chin
    }
    if (y > 0.35) Y -= (y - 0.35) * 0.08;                // flatter crown
    if (z < 0) Z -= 0.03 * Math.exp(-((Y - 0.62) ** 2) / 0.03) * -z;   // occiput
    if (z > 0) {
      Z = Z * 0.9 + 0.04 * z;                            // flatter face plane
      const w = clamp((z - 0.25) / 0.35), ax = Math.abs(X);
      let dz = 0.018 * G2(X, Y, 0, 0.635, 0.2, 0.045)   // brow ridge
        + 0.012 * G2(ax, Y, 0.2, 0.41, 0.07, 0.06)      // cheekbones
        + 0.02 * G2(X, Y, 0, MOUTH_Y, 0.13, 0.085)      // muzzle
        + 0.014 * G2(X, Y, 0, 0.045, 0.07, 0.04);       // chin
      if (carve) dz -= 0.034 * G2(ax, Y, EYE.x, EYE.y, 0.075, 0.048);   // eye sockets
      Z += w * dz;
    }
    return [X, Y, Z];
  }
  const HP_CACHE = new Map();
  // front surface point at (X, Y): Newton solve on the unit-sphere parameters
  function headPoint(X, Y, carve = true) {
    const key = r3(X) + ',' + r3(Y) + (carve ? 'c' : '');
    if (HP_CACHE.has(key)) return HP_CACHE.get(key);
    const f = (xx, yy) => headShape(xx, yy, Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy)), carve);
    let x = clamp(X / 0.335, -0.97, 0.97), y = clamp((Y - 0.585) / 0.5, -0.97, 0.97);
    for (let it = 0; it < 18; it++) {
      const p = f(x, y), ex = p[0] - X, ey = p[1] - Y;
      if (Math.abs(ex) + Math.abs(ey) < 1e-6) break;
      const h = 1e-4, px = f(x + h, y), py = f(x, y + h);
      const a = (px[0] - p[0]) / h, b = (py[0] - p[0]) / h, c = (px[1] - p[1]) / h, d = (py[1] - p[1]) / h;
      const det = a * d - b * c || 1e-9;
      x -= (d * ex - b * ey) / det; y -= (-c * ex + a * ey) / det;
      const l = Math.hypot(x, y); if (l > 0.995) { x *= 0.995 / l; y *= 0.995 / l; }
    }
    const out = f(x, y);
    HP_CACHE.set(key, out);
    return out;
  }
  const headZ = (X, Y, carve = true) => headPoint(X, Y, carve)[2];
  const frontUV = (g) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = FU(p.getX(i)); uv[i * 2 + 1] = FV(p.getY(i)); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  // head split in two: the painted front (face canvas) and the back (skin texture + ears)
  function headGeos() {
    const build = () => {
      const ws = 34, hs = 26, sph = new THREE.SphereGeometry(1, ws, hs);
      const p = sph.attributes.position, orig = p.array.slice();
      for (let i = 0; i < p.count; i++) { const s = headShape(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, s[0], s[1], s[2]); }
      sph.computeVertexNormals();
      const nr = sph.attributes.normal;
      for (let j = 0; j <= hs; j++) {       // weld the sphere's side seam
        const a = j * (ws + 1), b = a + ws;
        const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
        nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
      }
      const idx = sph.index.array, suv = sph.attributes.uv;
      const F = { p: [], n: [], u: [] }, B = { p: [], n: [], u: [] };
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const cz = (orig[a * 3 + 2] + orig[b * 3 + 2] + orig[c * 3 + 2]) / 3;
        const T = cz > -0.08 ? F : B;
        for (const v of [a, b, c]) {
          T.p.push(p.getX(v), p.getY(v), p.getZ(v)); T.n.push(nr.getX(v), nr.getY(v), nr.getZ(v));
          if (T === F) T.u.push(FU(p.getX(v)), FV(p.getY(v))); else T.u.push(suv.getX(v) * 3, suv.getY(v) * 2);
        }
      }
      const mk = (T) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(T.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(T.u, 2));
        return g;
      };
      const ear = (s) => {
        const e = new THREE.SphereGeometry(1, 10, 8);
        const ep = e.attributes.position;
        for (let i = 0; i < ep.count; i++) { const y = ep.getY(i); if (ep.getX(i) * s < 0) ep.setX(i, ep.getX(i) * 0.35); ep.setZ(i, ep.getZ(i) * (1 - 0.25 * y)); }
        e.computeVertexNormals();
        return xf(e, [s * 0.318, 0.45, -0.04], [0.12, s * -0.25, s * -0.1], [0.036, 0.11, 0.07]);
      };
      return { front: mk(F), back: merge([mk(B), ear(1), ear(-1)]) };
    };
    let hg = GEO.get('head_front');
    if (!hg) { const b = build(); geo('head_front', () => b.front); geo('head_back', () => b.back); }
    return { front: GEO.get('head_front'), back: GEO.get('head_back') };
  }
  function noseGeo() {
    return geo('nose', () => {
      const zf = (y) => headZ(0, y, false);
      const g = tube([
        [0.282, 0, 0, 0, zf(0.29) + 0.018],
        [0.29, 0.066, 0.02, 0, zf(0.29) + 0.016, 2.4],
        [0.31, 0.068, 0.028, 0, zf(0.31) + 0.026, 2.3],
        [0.34, 0.046, 0.032, 0, zf(0.34) + 0.03],
        [0.4, 0.033, 0.026, 0, zf(0.4) + 0.02],
        [0.47, 0.026, 0.016, 0, zf(0.47) + 0.004],
        [0.53, 0.022, 0.01, 0, zf(0.53) - 0.008],
        [0.56, 0, 0, 0, zf(0.56) - 0.016],
      ], { seg: 10 });
      return frontUV(g);
    });
  }
  // lowest Y of the hair at azimuth φ (0 = forehead)
  function hairline(ph, front = 0.815, nape = 0.27, burns = 0) {
    const a = Math.abs(ph);
    const K = [[0, front], [0.55, front - 0.07], [1.12, 0.66], [1.3, 0.62 - burns], [1.42, 0.6 - burns * 0.6], [1.62, 0.6], [1.95, 0.46], [PI, nape]];
    for (let i = 1; i < K.length; i++) if (a <= K[i][0]) { const t = (a - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return lerp(K[i - 1][1], K[i][1], smooth(t)); }
    return nape;
  }
  const headDir = (th, ph) => headShape(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph), false);
  // polar angle on meridian φ where the head surface comes down to height Y
  function thetaAtY(ph, Y) {
    let lo = 0.01, hi = PI - 0.01;
    for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (headDir(m, ph)[1] > Y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // a shell band over the head between polar angles ta(φ)..tb(φ), φ ∈ [p0, p1]; thick(θ, φ, s 0..1 across, P).
  // Edges follow the functions exactly (no staircase) and get a rim down to the scalp.
  function bandGeo(o) {
    const p0 = o.p0 ?? -PI, p1 = o.p1 ?? PI, np = o.np || 44, nt = o.nt || 10, full = Math.abs(p1 - p0 - TAU) < 1e-6;
    const C = [0, 0.56, 0], cols = np + 1;
    const outer = [], inner = [], uvs = [];
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= np; i++) {
      const ph = lerp(p0, p1, i / np), th = lerp(o.ta(ph), o.tb(ph), j / nt), P = headDir(th, ph);
      const dx = P[0] - C[0], dy = P[1] - C[1], dz = P[2] - C[2], l = Math.hypot(dx, dy, dz) || 1, t = o.thick(th, ph, j / nt, P);
      outer.push(P[0] + dx / l * t, P[1] + dy / l * t, P[2] + dz / l * t);
      inner.push(P[0] + dx / l * 0.002, P[1] + dy / l * 0.002, P[2] + dz / l * 0.002);
      uvs.push((ph / TAU + 0.5) * 3, (th / PI) * 2.2);
    }
    const pos = outer.slice(), uv = uvs.slice(), idx = [];
    for (let j = 0; j < nt; j++) for (let i = 0; i < np; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, b, b, c, d); }
    const rim = (va, vb) => {
      const s0 = pos.length / 3;
      pos.push(outer[va * 3], outer[va * 3 + 1], outer[va * 3 + 2], outer[vb * 3], outer[vb * 3 + 1], outer[vb * 3 + 2], inner[va * 3], inner[va * 3 + 1], inner[va * 3 + 2], inner[vb * 3], inner[vb * 3 + 1], inner[vb * 3 + 2]);
      uv.push(uvs[va * 2], uvs[va * 2 + 1], uvs[vb * 2], uvs[vb * 2 + 1], uvs[va * 2], uvs[va * 2 + 1] + 0.04, uvs[vb * 2], uvs[vb * 2 + 1] + 0.04);
      idx.push(s0, s0 + 2, s0 + 1, s0 + 1, s0 + 2, s0 + 3);
    };
    for (let i = 0; i < np; i++) { rim(nt * cols + i, nt * cols + i + 1); if (o.rimTop) rim(i, i + 1); }
    if (!full) for (let j = 0; j < nt; j++) { rim(j * cols, (j + 1) * cols); rim(j * cols + np, (j + 1) * cols + np); }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (o.tufts && o.tufts.length) g = merge([g, ...o.tufts]);
    return g;
  }
  function tuft(P, len, r, lean) {        // small hair wedge rooted at P, pointing out and along lean
    const C = [0, 0.56, 0], n = new THREE.Vector3(P[0] - C[0], P[1] - C[1], P[2] - C[2]).normalize();
    const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 0, 1)); if (t1.lengthSq() < 1e-3) t1.set(1, 0, 0); t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const base = [0, 1, 2].map((k) => { const a = (k / 3) * TAU; return new THREE.Vector3(P[0], P[1], P[2]).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r * 0.6).addScaledVector(n, -0.012); });
    const tip = new THREE.Vector3(P[0], P[1], P[2]).addScaledVector(n, len * 0.12).add(lean.clone().multiplyScalar(len));
    const pos = [], uv = [];
    for (let k = 0; k < 3; k++) { const a = base[k], b = base[(k + 1) % 3]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z); uv.push(0, 0, 0.3, 0, 0.15, 0.9); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  // hair cap: crown down to the hairline; thickness tapers at the edge so it never reads as a helmet rim
  function capGeo(front, nape, burns, base, top, extra = {}) {
    return bandGeo({ ta: () => 0.001, tb: (ph) => thetaAtY(ph, hairline(ph, front, nape, burns)), np: 48, nt: 11,
      thick: (th, ph, s) => (base + top * Math.max(0, Math.cos(th)) * (extra.side ? (ph > extra.side ? 1 : 0.8) : 1) + (extra.fwd || 0) * Math.max(0, Math.cos(ph)) * Math.max(0, Math.cos(th * 1.4))) * (1 - 0.72 * smooth((s - 0.7) / 0.3)),
      tufts: extra.tufts });
  }
  // hair geometry per style (head units) → [{geo, kind:'hair'|'tie'|'tail'|'curtain', at, rot}]
  function hairParts(style, seed = 1) {
    const r = U.rng(seed * 7919 + 13);
    const parts = [];
    const add = (key, fn, kind = 'hair', extra = {}) => parts.push({ geo: geo('hair_' + style + '_' + key, fn), kind, ...extra });
    switch (style) {
      case 'bald': break;
      case 'receding':
        add('s', () => bandGeo({ p0: -PI, p1: PI, ta: (ph) => thetaAtY(ph, Math.abs(ph) > 1.0 ? 0.78 : 0.9), tb: (ph) => thetaAtY(ph, hairline(ph, 0.92, 0.25)), np: 44, nt: 5,
          thick: (th, ph, s) => (Math.abs(ph) < 1.05 ? 0 : 0.014) * (1 - 0.6 * smooth((s - 0.6) / 0.4)) * (1 - 0.8 * smooth(1 - s / 0.25)) }));
        break;
      case 'buzz': add('s', () => capGeo(0.8, 0.3, 0.05, 0.006, 0.004)); break;
      case 'crew': add('s', () => capGeo(0.815, 0.3, 0.06, 0.01, 0.016)); break;
      case 'short': add('s', () => capGeo(0.8, 0.28, 0.06, 0.018, 0.03, { fwd: 0.012 })); break;
      case 'neat': add('s', () => capGeo(0.8, 0.28, 0.05, 0.024, 0.042, { side: 0.25, fwd: 0.02 })); break;
      case 'short_messy': {
        const tufts = [];
        const put = (th, ph, len, rad, lean) => {
          const P = headDir(th, ph), C = [0, 0.56, 0], d = Math.hypot(P[0] - C[0], P[1] - C[1], P[2] - C[2]), out = 0.02 + 0.032 * Math.max(0, Math.cos(th));
          tufts.push(tuft([P[0] + (P[0] - C[0]) / d * out, P[1] + (P[1] - C[1]) / d * out, P[2] + (P[2] - C[2]) / d * out], len, rad, lean));
        };
        for (let k = 0; k < 60; k++) {              // crown and top: short clumps lying along the scalp, some lifting
          const th = 0.1 + r() * 0.95, ph = (r() - 0.5) * (th < 0.5 ? TAU : 3.6);
          const tan = new THREE.Vector3(Math.sin(ph + (r() - 0.5) * 1.6), -0.35 + r() * 0.3, Math.cos(ph + (r() - 0.5) * 1.6) * 0.8 + 0.3);
          put(th, ph, 0.035 + r() * 0.04, 0.03 + r() * 0.02, tan.normalize());
        }
        for (let k = 0; k < 16; k++) {              // fringe falling over the forehead
          const ph = (r() - 0.5) * 1.5, th = thetaAtY(ph, hairline(ph, 0.79, 0.27)) - 0.1 - r() * 0.1;
          put(th, ph, 0.045 + r() * 0.04, 0.03 + r() * 0.015, new THREE.Vector3(Math.sin(ph) * 0.3 + (r() - 0.5) * 0.4, -0.75, 0.5).normalize());
        }
        add('s', () => capGeo(0.79, 0.27, 0.06, 0.022, 0.03, { fwd: 0.012, tufts }));
        break;
      }
      case 'ponytail':
        add('s', () => capGeo(0.83, 0.3, 0, 0.012, 0.008));
        add('tie', () => xf(new THREE.TorusGeometry(0.052, 0.017, 6, 12), [0, 0.86, -0.37], [-0.55, 0, 0]), 'tie');
        add('tail', () => {
          const R = [[0.04, 0, 0]];
          for (let i = 0; i <= 12; i++) { const t = i / 12, rr = 0.07 * Math.sin(Math.min(1, t * 1.6 + 0.35) * PI * 0.9) + 0.012; R.push([-t * 1.0, rr * 1.05, rr, 0, -0.07 * Math.sin(t * PI * 0.8)]); }
          R.push([-1.04, 0, 0, 0, -0.02]);
          R.sort((p, q) => p[0] - q[0]);
          return tube(R, { seg: 10, uvs: 2 });
        }, 'tail', { at: [0, 0.86, -0.39], rot: [0.5, 0, 0] });
        break;
      case 'bun':
        add('s', () => capGeo(0.8, 0.3, 0, 0.016, 0.012));
        add('bun', () => xf(new THREE.SphereGeometry(0.12, 12, 10), [0, 0.74, -0.41], [0, 0, 0], [1, 0.85, 0.9]));
        break;
      case 'bob': case 'long': {
        add('s', () => capGeo(0.8, 0.27, 0, 0.028, 0.03));
        const end = style === 'bob' ? 0.2 : -0.35;
        add('curtain', () => {
          const R = [];
          for (let i = 0; i <= 6; i++) { const t = i / 6, y = lerp(end, 0.78, t), flare = 1 + 0.08 * (1 - t); R.push([y, 0.37 * flare, 0.455 * flare, 0, -0.03]); }
          return tube(R, { seg: 20, gap: (i) => 1.15 - 0.1 * (i / 6), uvs: 2 });
        }, 'curtain');
        break;
      }
      default: add('s', () => capGeo(0.8, 0.28, 0.05, 0.02, 0.02));
    }
    return parts;
  }
  // beard top edge (Y) by azimuth: under the lower lip at the centre, up past the mouth corners to the sideburns
  const beardTop = (ph, kind) => { const a = Math.abs(ph); return a < 0.26 ? 0.14 : a < 0.5 ? lerp(0.14, 0.24, smooth((a - 0.26) / 0.24)) : lerp(0.24, kind === 'full' ? 0.44 : 0.38, smooth((a - 0.5) / 0.75)); };
  function flatCapGeo() {
    return geo('flatcap', () => {
      const crown = tube([[0.7, 0.36, 0.45, 0, 0.02], [0.8, 0.385, 0.49, 0, 0.03], [0.93, 0.37, 0.47, 0, 0.05], [1.01, 0.3, 0.42, 0, 0.06], [1.04, 0.16, 0.24, 0, 0.06], [1.05, 0, 0, 0, 0.06]], { seg: 18, uvs: 2 });
      const brim = xf(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16, 1, false, -HALF, PI), [0, 0.72, 0.36], [-0.28, 0, 0], [1.05, 1, 0.75]);
      return merge([xf(crown, [0, 0, 0], [0.12, 0, 0]), brim]);
    });
  }
  function beardGeo(kind, seed = 1) {
    return geo('beard_' + kind + '_' + (kind === 'scruffy' ? seed % 5 : 0), () => {
      const r = U.rng(seed * 31 + 7);
      const base = kind === 'full' ? 0.03 : kind === 'scruffy' ? 0.014 : 0.01;
      const jit = [];
      for (let k = 0; k < 64; k++) jit.push((r() - 0.3) * (kind === 'scruffy' ? 0.008 : 0.002));
      const main = bandGeo({ p0: -1.42, p1: 1.42, np: 30, nt: 8, rimTop: true, ta: (ph) => thetaAtY(ph, beardTop(ph, kind)), tb: (ph) => lerp(2.42, 2.1, smooth(Math.abs(ph) / 1.42)),
        thick: (th, ph, s) => (base + jit[Math.floor((ph + 1.42) * 12 + s * 7) % 64]) * (1 - 0.6 * smooth((Math.abs(ph) - 1.1) / 0.32)) * (1 - 0.5 * smooth((s - 0.8) / 0.2)) });
      const mous = bandGeo({ p0: -0.36, p1: 0.36, np: 10, nt: 3, rimTop: true, ta: (ph) => thetaAtY(ph, 0.282 - Math.abs(ph) * 0.05), tb: (ph) => thetaAtY(ph, 0.232 - Math.abs(ph) * 0.03),
        thick: () => base * 0.85 });
      return merge([main, mous]);
    });
  }
  function eyeGeo() { return geo('eyeball', () => new THREE.SphereGeometry(EYE.r, 16, 12)); }
  function lidGeo(upper) {
    return geo(upper ? 'lid_up' : 'lid_low', () => {
      const R = EYE.r * (upper ? 1.1 : 1.08);
      const g = new THREE.SphereGeometry(R, 16, 6, 0, PI, upper ? 0 : HALF, HALF);
      return vcol(g, (x, y) => {
        const e = Math.abs(y) / R;           // 0 at the lid edge
        const k = upper ? smooth(e / 0.28) : smooth(e / 0.2);
        const edge = upper ? 0.16 : 0.62;
        const v = lerp(edge, 1, k);
        return [v, v * (upper ? 0.97 : 0.93), v * (upper ? 0.97 : 0.92)];
      });
    });
  }
  // eye texture (sphere UV: the iris is centred at u=0.25, v=0.5 → +Z)
  const EYE_TEX = new Map();
  function eyeTex(iris, red = 0) {
    const key = hexOf(iris) + (red > 0.3 ? 'r' : '');
    if (EYE_TEX.has(key)) return EYE_TEX.get(key);
    const c = TU.mk(128, 64), ctx = c.getContext('2d');
    ctx.fillStyle = red > 0.3 ? '#efddd2' : '#eeeae2'; ctx.fillRect(0, 0, 128, 64);
    const g0 = ctx.createRadialGradient(32, 32, 12, 32, 32, 34);
    g0.addColorStop(0, 'rgba(0,0,0,0)'); g0.addColorStop(1, red > 0.3 ? 'rgba(170,70,70,0.55)' : 'rgba(150,120,110,0.35)');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, 128, 64);
    if (red > 0.3) { ctx.strokeStyle = 'rgba(170,40,40,0.5)'; ctx.lineWidth = 0.6; for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); ctx.lineTo(32 + Math.cos(a + 0.2) * 15, 32 + Math.sin(a + 0.2) * 15); ctx.stroke(); } }
    const ic = new THREE.Color(iris);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 10.5);
    g.addColorStop(0, '#' + ic.clone().multiplyScalar(0.55).getHexString()); g.addColorStop(0.55, '#' + ic.getHexString()); g.addColorStop(0.85, '#' + ic.clone().multiplyScalar(0.8).getHexString()); g.addColorStop(1, '#1a1512');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 10.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.7;
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 4.5, 32 + Math.sin(a) * 4.5); ctx.lineTo(32 + Math.cos(a) * 9.5, 32 + Math.sin(a) * 9.5); ctx.stroke(); }
    ctx.fillStyle = '#060505'; ctx.beginPath(); ctx.arc(32, 32, 4.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(29.5, 29, 1.6, 0, TAU); ctx.fill();
    const t = TU.mkTex(c); t.userData.shared = true;
    EYE_TEX.set(key, t);
    return t;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Faces: one 256 px canvas per actor, repainted when the expression / talk state changes.
  // ---------------------------------------------------------------------------------------------------------------
  // brow: [innerY, outerY, knit] offsets (head units); mouth: curve (-1 down … 1 up), open 0..1, width, teeth
  // ('upper'|'both'|null), round, thin; lid: upper-lid lowering (−wide … +closed); lower: lower-lid raise; cheek raise.
  const EXPRS = {
    neutral: { brow: [0, 0, 0], curve: -0.05, open: 0, width: 1, lid: 0, lower: 0, cheek: 0 },
    smile: { brow: [0.012, 0.01, 0], curve: 0.6, open: 0.08, width: 1.08, teeth: 'upper', lid: 0.04, lower: 0.28, cheek: 0.45 },
    grin: { brow: [0.018, 0.014, 0], curve: 0.8, open: 0.45, width: 1.2, teeth: 'upper', lid: 0.08, lower: 0.5, cheek: 0.8 },
    sad: { brow: [0.03, -0.012, 0.25], curve: -0.55, open: 0, width: 0.95, lid: 0.14, lower: 0.05, cheek: 0 },
    cry: { brow: [0.045, -0.015, 0.5], curve: -0.75, open: 0.32, width: 1.02, teeth: null, lid: 0.3, lower: 0.35, cheek: 0.2, tears: 1 },
    wide: { brow: [0.045, 0.04, 0], curve: -0.1, open: 0.32, round: true, width: 0.82, lid: -0.28, lower: -0.1, cheek: 0 },
    tired: { brow: [-0.004, -0.012, 0], curve: -0.18, open: 0.06, width: 0.98, lid: 0.36, lower: 0.05, cheek: 0, bags: 0.35 },
    smile_huge: { brow: [0.03, 0.04, 0], curve: 1, open: 0.62, width: 2.9, teeth: 'both', many: true, lid: 0.02, lower: 0.6, cheek: 1 },
    flat: { brow: [-0.008, -0.004, 0.3], curve: -0.08, open: 0, width: 0.94, thin: true, lid: 0.22, lower: 0.08, cheek: 0 },
    angry: { brow: [-0.03, 0.012, 1], curve: -0.35, open: 0.18, width: 1.05, teeth: 'upper', lid: 0.05, lower: 0.25, cheek: 0.2 },
    scared: { brow: [0.05, 0.025, 0.45], curve: -0.3, open: 0.3, width: 0.95, lid: -0.2, lower: -0.05, cheek: 0 },
    pain: { brow: [0.03, -0.01, 0.9], curve: -0.45, open: 0.3, width: 1.15, teeth: 'both', lid: 0.45, lower: 0.5, cheek: 0.5 },
    shout: { brow: [-0.03, 0.01, 1], curve: -0.2, open: 1, round: true, width: 1.1, teeth: 'both', lid: -0.05, lower: 0.15, cheek: 0.3 },
  };
  // a partial expression ('smile@0.5'): numbers and arrays lerp from neutral, flags switch at half strength
  function blendExpr(name, k) {
    const id = name + '@' + k;
    if (EXPRS[id]) return id;
    const A = EXPRS.neutral, B = EXPRS[name], out = {};
    for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const a = A[key], b = B[key];
      if (Array.isArray(b)) out[key] = b.map((v, i) => U.lerp((a && a[i]) || 0, v, k));
      else if (typeof b === 'number') out[key] = U.lerp(typeof a === 'number' ? a : 0, b, k);
      else out[key] = k >= 0.5 ? b : a;
    }
    EXPRS[id] = out;
    return id;
  }
  function paintFace(ctx, S, F, st) {
    const E = EXPRS[st.expr] || EXPRS.neutral;
    const X = (x) => FU(x) * S, Y = (y) => (1 - FV(y)) * S, LX = (d) => (d / 0.72) * S, LY = (d) => (d / 1.06) * S;
    const skin = TU.hex(hexOf(F.skin)), sk = (k, a = 1) => `rgba(${Math.min(255, skin[0] * k) | 0},${Math.min(255, skin[1] * k) | 0},${Math.min(255, skin[2] * k) | 0},${a})`;
    const rgbaH = (h, a) => { const c = TU.hex(hexOf(h)); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };
    const r = U.rng(F.seed || 1);
    const blob = (x, y, rx, ry, colr, a, soft = 1) => {
      ctx.save(); ctx.translate(X(x), Y(y)); ctx.scale(LX(rx), LY(ry));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, colr(a)); g.addColorStop(soft, colr(a * 0.4)); g.addColorStop(1, colr(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
    };
    const dark = (k) => (a) => sk(k, a), tint = (h) => (a) => rgbaH(h, a);
    // base + broad modelling (kept soft at the canvas edge so it meets the back-of-head skin cleanly)
    ctx.fillStyle = sk(1); ctx.fillRect(0, 0, S, S);
    blob(0, 0.56, 0.3, 0.42, (a) => `rgba(255,248,238,${a})`, 0.1);
    blob(0, 0.06, 0.22, 0.12, dark(0.7), 0.35);                                   // under the chin
    blob(0, -0.04, 0.34, 0.1, dark(0.65), 0.5);
    for (const s of [-1, 1]) {
      blob(s * 0.25, 0.26, 0.09, 0.2, dark(0.85), 0.28);                          // jaw side
      blob(s * 0.27, 0.62, 0.06, 0.14, dark(0.9), 0.22);                          // temple
      blob(s * 0.18, 0.37, 0.08, 0.06, tint(mixHex(F.skin, '#c0504a', 0.5)), 0.16 * (F.blush ?? 1) + E.cheek * 0.12);   // cheek
      if (E.cheek > 0) blob(s * 0.17, 0.4, 0.07, 0.035, (a) => `rgba(255,250,240,${a})`, 0.1 * E.cheek);
    }
    // hairline paint: hair colour behind the shell edge (so no skin gap shows between face and hair)
    if (F.hairPaint) {
      ctx.save();
      ctx.fillStyle = rgbaH(F.hairColor, 0.92);
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let i = 0; i <= 24; i++) { const x = -0.36 + (i / 24) * 0.72, ph = Math.asin(clamp(x / 0.34, -1, 1)); ctx.lineTo(X(x), Y(hairline(ph, F.hairFront, 0.27) + 0.012)); }
      ctx.lineTo(S, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // eye sockets, bags, red rims
    for (const s of [-1, 1]) {
      const ex = s * EYE.x;
      blob(ex, 0.53, 0.085, 0.055, dark(0.72), 0.45);
      blob(ex + s * 0.01, 0.575, 0.08, 0.025, dark(0.78), 0.3);
      const bags = clamp((F.bags || 0) + (E.bags || 0));
      if (bags > 0) { blob(ex, 0.435, 0.07, 0.03, tint('#5a3c48'), 0.45 * bags); blob(ex + s * 0.01, 0.415, 0.06, 0.018, dark(0.75), 0.3 * bags); }
      if (F.redRim) { blob(ex, 0.47, 0.075, 0.03, tint('#c0443c'), 0.55 * F.redRim); blob(ex, 0.535, 0.07, 0.02, tint('#b04040'), 0.3 * F.redRim); }
      if (F.makeup) blob(ex, 0.545, 0.07, 0.025, tint('#6a5060'), 0.3 * F.makeup);
      // lash line: an almond outline around the opening (the eye mesh sits inside it)
      ctx.save(); ctx.translate(X(ex), Y(EYE.y));
      const w = LX(0.07), hU = LY(0.042 - E.lid * 0.02), hL = LY(0.034 - E.lower * 0.012);
      ctx.strokeStyle = `rgba(28,20,18,${0.75 + (F.makeup || 0) * 0.2})`; ctx.lineWidth = 1.6 + (F.makeup || 0) * 1.2;
      ctx.beginPath(); ctx.moveTo(-w, s * 0 + 2); ctx.bezierCurveTo(-w * 0.5, -hU * 1.25, w * 0.5, -hU * 1.25, w, 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,28,26,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w, 2); ctx.bezierCurveTo(-w * 0.4, hL * 1.3, w * 0.4, hL * 1.3, w, 1); ctx.stroke();
      if (st.paintEyes) {           // low detail / no eye meshes: paint the eye
        ctx.fillStyle = '#ddd6ca'; ctx.beginPath(); ctx.moveTo(-w, 2); ctx.bezierCurveTo(-w * 0.5, -hU * 1.2, w * 0.5, -hU * 1.2, w, 1); ctx.bezierCurveTo(w * 0.4, hL * 1.25, -w * 0.4, hL * 1.25, -w, 2); ctx.fill();
        if (!st.closed) { ctx.fillStyle = F.eyes || '#4a3526'; ctx.beginPath(); ctx.arc(0, 0, LX(0.026), 0, TAU); ctx.fill(); ctx.fillStyle = '#080606'; ctx.beginPath(); ctx.arc(0, 0, LX(0.011), 0, TAU); ctx.fill(); }
        else { ctx.fillStyle = sk(0.92); ctx.beginPath(); ctx.moveTo(-w, 2); ctx.bezierCurveTo(-w * 0.5, -hU * 1.3, w * 0.5, -hU * 1.3, w, 1); ctx.bezierCurveTo(w * 0.4, hL * 1.3, -w * 0.4, hL * 1.3, -w, 2); ctx.fill(); }
      }
      ctx.restore();
    }
    // wrinkles / age lines
    const wr = F.wrinkles || 0;
    if (wr > 0) {
      ctx.strokeStyle = sk(0.62, 0.45 * wr); ctx.lineWidth = 1.1;
      for (const y of [0.7, 0.735, 0.77]) { ctx.beginPath(); ctx.moveTo(X(-0.16), Y(y + 0.004)); ctx.quadraticCurveTo(X(0), Y(y - 0.008), X(0.16), Y(y + 0.004)); ctx.stroke(); }
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(X(s * 0.215), Y(0.5 + (k - 1) * 0.018)); ctx.lineTo(X(s * 0.26), Y(0.5 + (k - 1) * 0.03)); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(X(s * 0.1), Y(0.435)); ctx.quadraticCurveTo(X(s * 0.14), Y(0.42), X(s * 0.185), Y(0.44)); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(X(-0.02), Y(0.6)); ctx.lineTo(X(-0.015), Y(0.66)); ctx.moveTo(X(0.02), Y(0.6)); ctx.lineTo(X(0.015), Y(0.66)); ctx.stroke();
    }
    const fold = Math.max(wr * 0.8, E.cheek * 0.6, 0.15 + (E.curve < 0 ? -E.curve * 0.3 : 0));
    ctx.strokeStyle = sk(0.7, 0.4 * fold); ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(s * 0.065), Y(0.33)); ctx.quadraticCurveTo(X(s * 0.12), Y(0.27), X(s * (0.1 + E.width * 0.012)), Y(0.19)); ctx.stroke(); }
    // brows
    const bc = F.brows || '#2a211b', bt = F.browThick ?? 1, [bi, bo, knit] = E.brow;
    for (const s of [-1, 1]) {
      const ix = s * (0.045 - knit * 0.008), iy = 0.6 + bi - knit * 0.012, ox = s * 0.205, oy = 0.598 + bo, px = s * 0.15, py = 0.625 + (bi + bo) * 0.5;
      ctx.fillStyle = rgbaH(bc, 0.88);
      ctx.beginPath();
      ctx.moveTo(X(ix), Y(iy + 0.012 * bt));
      ctx.quadraticCurveTo(X(px), Y(py + 0.012 * bt), X(ox), Y(oy + 0.004));
      ctx.quadraticCurveTo(X(px), Y(py - 0.006 * bt), X(ix), Y(iy - 0.01 * bt));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgbaH(bc, 0.5); ctx.lineWidth = 0.8;
      for (let k = 0; k < 14; k++) { const t = k / 13, x = lerp(ix, ox, t), y = lerp(iy, oy, t) + Math.sin(t * PI) * (py - (iy + oy) / 2); ctx.beginPath(); ctx.moveTo(X(x), Y(y - 0.008 * bt)); ctx.lineTo(X(x + s * 0.012), Y(y + 0.01 * bt)); ctx.stroke(); }
    }
    // nose
    for (const s of [-1, 1]) {
      ctx.save();
      const g = ctx.createLinearGradient(X(s * 0.02), 0, X(s * 0.07), 0);
      g.addColorStop(0, sk(0.9, 0)); g.addColorStop(0.5, sk(0.8, 0.32)); g.addColorStop(1, sk(0.85, 0));
      ctx.fillStyle = g; ctx.fillRect(Math.min(X(s * 0.02), X(s * 0.07)), Y(0.52), Math.abs(X(0.05) - X(0)), Y(0.33) - Y(0.52));
      ctx.restore();
      blob(s * 0.032, 0.3, 0.016, 0.009, (a) => `rgba(40,22,18,${a})`, 0.85, 0.6);   // nostril
      ctx.strokeStyle = sk(0.66, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(X(s * 0.046), Y(0.315), LX(0.02), s > 0 ? -1.3 : PI - 1.3, s > 0 ? 1.3 : PI + 1.3); ctx.stroke();
    }
    blob(0, 0.35, 0.025, 0.02, (a) => `rgba(255,246,236,${a})`, 0.3);
    blob(0, 0.52, 0.018, 0.06, (a) => `rgba(255,246,236,${a})`, 0.14);
    // stubble / beard paint (the beard mesh sits over the same region)
    const stub = F.stubble || 0, bcol = F.beardColor || F.hairColor || '#2a211b';
    if (stub > 0 || F.beardPaint) {
      const inRegion = (x, y) => {
        const ax = Math.abs(x);
        if (y < -0.03 || ax > 0.3) return 0;
        if (ax < 0.095 && y > 0.23 && y < 0.285) return 1;                     // moustache
        if (((x / 0.098) ** 2 + ((y - MOUTH_Y) / 0.038) ** 2) < 1) return 0;   // lips
        const top = beardTop(Math.asin(clamp(x / 0.33, -1, 1)), F.beardKind);
        return y < top ? 1 - smooth((ax - 0.22) / 0.08) : 0;
      };
      const n = Math.round(3200 * Math.max(stub, F.beardPaint ? 1 : 0));
      for (let k = 0; k < n; k++) {
        const x = (r() - 0.5) * 0.62, y = -0.03 + r() * 0.46, w = inRegion(x, y);
        if (w <= 0 || r() > w) continue;
        ctx.fillStyle = rgbaH(bcol, (F.beardPaint ? 0.75 : 0.22 + stub * 0.32) * (0.5 + r() * 0.5));
        ctx.fillRect(X(x), Y(y), 1.2, 1.2);
      }
    }
    // mouth
    const mw = 0.096 * E.width, cy = MOUTH_Y, curve = E.curve * 0.032, open = E.open * (E.many ? 0.1 : 0.072) + (st.talk || 0) * 0.02;
    const lipC = F.lips || mixHex(F.skin, '#8a3a38', 0.5);
    const thin = E.thin ? 0.5 : 1;
    const cornerY = cy + curve;
    const upperTop = cy + 0.019 * thin + Math.max(0, curve) * 0.3, lowerBot = cy - 0.028 * thin - open + Math.min(0, curve) * 0.2;
    // mouth interior
    if (open > 0.004) {
      ctx.fillStyle = '#2a1012';
      ctx.beginPath(); ctx.moveTo(X(-mw * 0.92), Y(cornerY));
      ctx.quadraticCurveTo(X(0), Y(cy + (E.round ? open * 0.4 : 0.004) + Math.max(0, curve) * 0.4), X(mw * 0.92), Y(cornerY));
      ctx.quadraticCurveTo(X(0), Y(cy - open * (E.round ? 1.1 : 1) - 0.004 + Math.min(0, curve)), X(-mw * 0.92), Y(cornerY));
      ctx.fill();
      if (E.teeth) {
        const rows = E.teeth === 'both' ? 2 : 1, nT = E.many ? 30 : 8;
        for (let row = 0; row < rows; row++) {
          const ty = row === 0 ? cy + 0.002 + Math.max(0, curve) * 0.35 : cy - open * 0.8 + Math.min(0, curve) * 0.5;
          const th = Math.min(E.many ? 0.034 : 0.02, open * (E.many ? 0.46 : 0.5));
          for (let k = 0; k < nT; k++) {
            const t = (k + 0.5) / nT, x = lerp(-mw * 0.86, mw * 0.86, t);
            const yy = ty + (row === 0 ? -1 : 1) * 0 + Math.abs(x / mw) ** 2 * curve * 0.8;
            ctx.fillStyle = E.many ? '#f4f1e6' : '#e6e0d0';
            const tw = LX((mw * 1.72) / nT) - (E.many ? 0.4 : 0.8);
            ctx.fillRect(X(x) - tw / 2, row === 0 ? Y(yy) : Y(yy) - LY(th), tw, LY(th));
          }
        }
      }
    }
    // lips
    ctx.fillStyle = lipC;
    ctx.beginPath(); ctx.moveTo(X(-mw), Y(cornerY));
    ctx.bezierCurveTo(X(-mw * 0.5), Y(upperTop - 0.004), X(-mw * 0.18), Y(upperTop + 0.004), X(0), Y(upperTop - 0.004));
    ctx.bezierCurveTo(X(mw * 0.18), Y(upperTop + 0.004), X(mw * 0.5), Y(upperTop - 0.004), X(mw), Y(cornerY));
    ctx.quadraticCurveTo(X(0), Y(cy + (open > 0.004 ? 0.004 + Math.max(0, curve) * 0.4 : Math.max(0, curve) * 0.1 - Math.max(0, -curve) * 0.3)), X(-mw), Y(cornerY));
    ctx.fill();
    ctx.fillStyle = mixHex(lipC, '#ffffff', 0.08);
    ctx.beginPath(); ctx.moveTo(X(-mw * 0.95), Y(cornerY));
    ctx.quadraticCurveTo(X(0), Y(cy - (open > 0.004 ? open : 0) + Math.min(0, curve) * 0.3 - 0.002), X(mw * 0.95), Y(cornerY));
    ctx.quadraticCurveTo(X(0), Y(lowerBot), X(-mw * 0.95), Y(cornerY));
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,15,15,0.9)'; ctx.lineWidth = open > 0.004 ? 1.2 : 2.2;
    if (open <= 0.004) { ctx.beginPath(); ctx.moveTo(X(-mw), Y(cornerY)); ctx.quadraticCurveTo(X(0), Y(cy + Math.max(0, curve) * 0.1 - Math.max(0, -curve) * 0.3), X(mw), Y(cornerY)); ctx.stroke(); }
    blob(0, lowerBot + 0.006, mw * 0.4, 0.006, (a) => `rgba(255,240,235,${a})`, 0.25);
    blob(0, lowerBot - 0.02, mw * 0.6, 0.02, dark(0.8), 0.3);
    // scar through the left eyebrow (actor's left = +X)
    if (F.scar === 'left_brow') {
      ctx.strokeStyle = sk(1.22, 0.95); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(X(0.128), Y(0.668)); ctx.lineTo(X(0.152), Y(0.568)); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,70,70,0.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(X(0.13), Y(0.665)); ctx.lineTo(X(0.153), Y(0.571)); ctx.stroke();
    }
    if (F.freckles) for (let k = 0; k < 60 * F.freckles; k++) { const x = (r() - 0.5) * 0.4, y = 0.33 + r() * 0.16; ctx.fillStyle = sk(0.7, 0.35); ctx.beginPath(); ctx.arc(X(x), Y(y), 0.9, 0, TAU); ctx.fill(); }
    if (E.tears || st.tears) {
      for (const s of [-1, 1]) {
        const g = ctx.createLinearGradient(0, Y(0.46), 0, Y(0.26));
        g.addColorStop(0, 'rgba(235,245,255,0.55)'); g.addColorStop(1, 'rgba(235,245,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(s * 0.115), Y(0.46)); ctx.quadraticCurveTo(X(s * 0.13), Y(0.38), X(s * 0.125), Y(0.26)); ctx.stroke();
      }
    }
    // pores / grain
    for (let k = 0; k < 900; k++) { ctx.fillStyle = r() < 0.5 ? sk(0.9, 0.18) : sk(1.08, 0.12); ctx.fillRect(r() * S, r() * S, 1, 1); }
  }
  // ---------------------------------------------------------------------------------------------------------------
  // Proportions. Body geometry is built in "H units" (fractions of standing height) and meshes are scaled by the
  // height, so actors of the same build share every geometry. Head parts are in head units (0.128 H).
  // ---------------------------------------------------------------------------------------------------------------
  const BUILDS = {
    average: { w: 1, d: 1, sh: 1, waist: 1, hip: 1, limb: 1, neck: 1, belly: 0, bust: 0, hand: 1 },
    slim: { w: 0.93, d: 0.92, sh: 0.97, waist: 0.9, hip: 0.94, limb: 0.9, neck: 0.93, belly: 0, bust: 0, hand: 0.97 },
    stocky: { w: 1.07, d: 1.12, sh: 1.02, waist: 1.17, hip: 1.05, limb: 1.1, neck: 1.12, belly: 0.7, bust: 0, hand: 1.05 },
    broad: { w: 1.08, d: 1.06, sh: 1.07, waist: 0.98, hip: 0.98, limb: 1.14, neck: 1.1, belly: 0, bust: 0, hand: 1.06 },
    slight: { w: 0.87, d: 0.9, sh: 0.89, waist: 0.83, hip: 1.0, limb: 0.84, neck: 0.84, belly: 0, bust: 0.7, hand: 0.88 },
    thin: { w: 0.78, d: 0.78, sh: 0.9, waist: 0.76, hip: 0.84, limb: 0.7, neck: 0.8, belly: 0, bust: 0, hand: 1.0 },
    heavy: { w: 1.16, d: 1.25, sh: 1.07, waist: 1.35, hip: 1.14, limb: 1.25, neck: 1.25, belly: 1, bust: 0, hand: 1.1 },
    frail: { w: 0.88, d: 0.9, sh: 0.88, waist: 0.93, hip: 0.96, limb: 0.82, neck: 0.85, belly: 0.3, bust: 0.35, hand: 0.9 },
  };
  const torsoDims = (B) => ({
    chestW: 0.098 * B.w, chestD: 0.064 * B.d, shX: 0.1 * B.sh, waistW: 0.082 * B.waist, waistD: 0.058 * B.waist * (0.9 + 0.1 * B.d),
    hipW: 0.093 * B.hip, hipD: 0.064 * B.hip, neckR: 0.035 * B.neck, belly: B.belly, bust: B.bust,
  });
  // ring profiles (H units, local to the owning bone). o = layer offset.
  const pelvisRings = (T, o = 0) => [
    [-0.09, 0, 0, 0, -0.004], [-0.085, 0.05 + o, 0.036 + o, 0, -0.004], [-0.068, T.hipW * 0.87 + o, T.hipD * 0.86 + o, 0, -0.006],
    [-0.042, T.hipW * 0.98 + o, T.hipD * 0.98 + o, 0, -0.008], [-0.015, T.hipW + o, T.hipD + o, 0, -0.007],
    [0.015, T.hipW * 0.95 + o, T.hipD * 0.94 + o, 0, -0.003 + T.belly * 0.006], [0.045, T.waistW * 0.97 + o, T.waistD * 0.95 + o, 0, T.belly * 0.008],
    [0.056, T.waistW * 0.86 + o, T.waistD * 0.84 + o, 0, T.belly * 0.008], [0.062, 0, 0, 0, 0.004],
  ];
  const abdRings = (T, o = 0, hem = -0.058, flare = 1) => [
    [hem, T.hipW * 1.02 * flare + o, T.hipD * 1.0 * flare + o, 0, -0.005], [hem + 0.02, T.hipW * 0.99 + o, T.hipD * 0.97 + o, 0, -0.004],
    [-0.02, T.waistW * 1.08 + o, T.waistD * 1.1 + o, 0, T.belly * 0.012], [0.01, T.waistW * 1.04 + o, T.waistD * 1.04 + o, 0, T.belly * 0.02],
    [0.05, lerp(T.waistW, T.chestW, 0.5) * 1.02 + o, lerp(T.waistD, T.chestD, 0.5) * 1.01 + o, 0, T.belly * 0.014],
    [0.085, T.chestW * 0.965 + o, T.chestD * 0.96 + o, 0, T.belly * 0.004], [0.12, T.chestW * 0.95 + o, T.chestD * 0.95 + o], [0.125, 0, 0],
  ];
  const chestRings = (T, o = 0) => [
    [-0.035, 0, 0], [-0.03, T.chestW * 0.99 + o, T.chestD * 0.98 + o], [0.0, T.chestW + o, T.chestD + o, 0, T.bust * 0.006],
    [0.028, T.chestW * 1.02 + o, T.chestD * (1 + T.bust * 0.15) + o, 0, 0.002 + T.bust * 0.014],
    [0.05, T.chestW * 1.03 + o, T.chestD * 0.97 + o, 0, 0.001 + T.bust * 0.008], [0.064, T.shX * 1.0 + o, T.chestD * 0.86 + o, 0, -0.003],
    [0.074, T.shX * 0.93 + o, T.chestD * 0.76 + o, 0, -0.006], [0.083, T.shX * 0.72 + o, T.chestD * 0.64 + o, 0, -0.008], [0.092, T.neckR * 2.0 + o, T.chestD * 0.56 + o, 0, -0.01],
    [0.102, T.neckR * 1.5 + o, T.neckR * 1.4 + o, 0, -0.012], [0.108, T.neckR * 1.2 + o, T.neckR * 1.15 + o, 0, -0.012], [0.11, 0, 0, 0, -0.012],
  ];
  // surface point of a ring profile at height y and angle θ (0 = front, +π/2 = the actor's left)
  function surfAt(rings, y, th, off = 0) {
    let i = 0; while (i < rings.length - 2 && rings[i + 1][0] < y) i++;
    const a = rings[i], b = rings[i + 1], t = clamp((y - a[0]) / ((b[0] - a[0]) || 1));
    const rx = lerp(a[1], b[1], t) + off, rz = lerp(a[2], b[2], t) + off, cx = lerp(a[3] || 0, b[3] || 0, t), cz = lerp(a[4] || 0, b[4] || 0, t);
    const s = Math.sin(th), c = Math.cos(th);
    const p = new THREE.Vector3(cx + rx * s, y, cz + rz * c);
    const n = new THREE.Vector3(s / Math.max(rx, 1e-4), 0, c / Math.max(rz, 1e-4)).normalize();
    return { p, n };
  }
  // a patch following a ring profile (pockets, tape, belts, bands): θ0..θ1, y0..y1 (grid nu×nv)
  function patchGeo(rings, y0, y1, th0, th1, off, nu = 8, nv = 3, uvs = 7) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = surfAt(rings, lerp(y0, y1, j / nv), lerp(th0, th1, i / nu), off);
      pos.push(s.p.x, s.p.y, s.p.z); uv.push((i / nu) * (th1 - th0) * 0.1 * uvs, (j / nv) * (y1 - y0) * uvs);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // limb profiles (H units, the joint at y=0, the limb along -Y)
  const upperArmRings = (L, g) => [[-L - 0.014, 0, 0], [-L - 0.008, 0.019 * g, 0.018 * g], [-L, 0.023 * g, 0.022 * g], [-L * 0.62, 0.027 * g, 0.026 * g, 0, 0.002],
    [-L * 0.3, 0.03 * g, 0.029 * g], [-0.004, 0.031 * g, 0.031 * g], [0.01, 0.027 * g, 0.027 * g], [0.018, 0, 0]];
  const foreArmRings = (L, g) => [[-L - 0.008, 0, 0], [-L, 0.0125 * g, 0.018 * g], [-L * 0.6, 0.016 * g, 0.021 * g], [-L * 0.25, 0.0205 * g, 0.024 * g],
    [-0.01, 0.022 * g, 0.022 * g, 0, -0.002], [0.012, 0.019 * g, 0.019 * g, 0, -0.002], [0.02, 0, 0]];
  const thighRings = (L, g, o = 0) => [[-L - 0.03, 0, 0], [-L - 0.022, 0.032 * g + o, 0.033 * g + o], [-L, 0.036 * g + o, 0.037 * g + o], [-L * 0.6, 0.043 * g + o, 0.045 * g + o, 0, 0.004],
    [-L * 0.25, 0.051 * g + o, 0.054 * g + o, 0, 0.004], [0, 0.056 * g + o, 0.058 * g + o, 0, -0.002], [0.03, 0.052 * g + o, 0.054 * g + o, 0, -0.004], [0.05, 0, 0]];
  const shinPantsRings = (L, g, cuff) => [[-L - 0.008, (cuff ? 0.024 : 0.032) * g, (cuff ? 0.027 : 0.036) * g, 0, 0.004], [-L + 0.01, (cuff ? 0.026 : 0.032) * g, (cuff ? 0.028 : 0.036) * g, 0, 0.003],
    [-L * 0.7, 0.034 * g, 0.037 * g], [-L * 0.3, 0.038 * g, 0.04 * g, 0, -0.002], [-0.01, 0.04 * g, 0.041 * g], [0.012, 0.039 * g, 0.04 * g], [0.03, 0, 0]];
  const shinBareRings = (L, g) => [[-L - 0.01, 0, 0], [-L, 0.016 * g, 0.018 * g], [-L * 0.75, 0.02 * g, 0.022 * g], [-L * 0.35, 0.029 * g, 0.033 * g, 0, -0.006],
    [-0.03, 0.028 * g, 0.03 * g], [0.015, 0.025 * g, 0.026 * g], [0.025, 0, 0]];
  const neckRings = (T, len) => [[-0.035, T.neckR * 1.05, T.neckR * 1.08], [0, T.neckR, T.neckR * 1.05, 0, 0.002], [len * 0.6, T.neckR * 0.93, T.neckR * 0.98, 0, 0.003], [len + 0.02, T.neckR * 0.9, T.neckR * 0.95, 0, 0.004], [len + 0.03, 0, 0]];
  const UVH = H_NOM / TILE;   // uv units per H unit

  // shoes: stations along +Z (heel → toe) [z, halfWidth, topY]; the sole is flattened at y = -ankle
  const SHOES = {
    sneaker: { st: [[-0.042, 0, 0.0], [-0.038, 0.021, -0.004], [-0.026, 0.026, 0.006], [0.0, 0.027, 0.004], [0.03, 0.029, -0.005], [0.06, 0.031, -0.017], [0.09, 0.03, -0.027], [0.11, 0.025, -0.032], [0.121, 0.016, -0.036], [0.127, 0, -0.04]], sole: 0.013, tex: 'sneaker', rough: 0.85 },
    boot: { st: [[-0.042, 0, 0.03], [-0.038, 0.022, 0.03], [-0.026, 0.027, 0.034], [0.0, 0.029, 0.034], [0.03, 0.03, 0.0], [0.06, 0.032, -0.014], [0.09, 0.031, -0.024], [0.11, 0.027, -0.028], [0.121, 0.019, -0.032], [0.128, 0, -0.036]], sole: 0.015, tex: 'leather', rough: 0.75 },
    dress: { st: [[-0.04, 0, -0.008], [-0.036, 0.02, -0.01], [-0.024, 0.024, -0.004], [0.0, 0.025, -0.006], [0.03, 0.027, -0.013], [0.06, 0.029, -0.022], [0.09, 0.027, -0.03], [0.11, 0.02, -0.034], [0.124, 0.011, -0.038], [0.13, 0, -0.04]], sole: 0.008, tex: 'leather', rough: 0.35 },
    flat: { st: [[-0.038, 0, -0.018], [-0.034, 0.019, -0.02], [-0.022, 0.022, -0.018], [0.0, 0.023, -0.022], [0.03, 0.025, -0.022], [0.06, 0.026, -0.026], [0.09, 0.024, -0.031], [0.108, 0.018, -0.035], [0.117, 0.01, -0.038], [0.121, 0, -0.04]], sole: 0.005, tex: 'leather', rough: 0.5 },
    sock: { st: [[-0.036, 0, -0.01], [-0.032, 0.02, 0.0], [-0.02, 0.023, 0.012], [0.0, 0.024, 0.018], [0.03, 0.025, -0.008], [0.06, 0.026, -0.02], [0.09, 0.024, -0.029], [0.106, 0.018, -0.034], [0.114, 0.01, -0.038], [0.118, 0, -0.04]], sole: 0.0, tex: 'jersey', rough: 0.95 },
    slipper: { st: [[-0.04, 0, -0.012], [-0.036, 0.022, -0.014], [-0.022, 0.026, -0.012], [0.0, 0.027, -0.016], [0.03, 0.029, -0.012], [0.06, 0.031, -0.016], [0.09, 0.03, -0.022], [0.11, 0.024, -0.028], [0.121, 0.014, -0.034], [0.126, 0, -0.038]], sole: 0.012, tex: 'jersey', rough: 0.95 },
  };
  function shoeGeo(kind, soleCol, upperCol) {
    return geo('shoe_' + kind + soleCol + upperCol, () => {
      const S = SHOES[kind] || SHOES.sneaker, bottom = -0.047;
      const rings = S.st.map(([z, w, top]) => { w *= 0.9; z = z * 0.93 + 0.002; const hh = Math.max(0.001, (top - bottom) / 2); return [z, w, w > 0 ? hh : 0, 0, -((top + bottom) / 2), 2.6]; });
      const g = tube(rings, { seg: 14, uvs: UVH });
      g.rotateX(HALF);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < bottom + 0.002) p.setY(i, bottom);
      g.computeVertexNormals();
      const sc = rgb(soleCol), uc = rgb(upperCol);
      return vcol(g, (x, y, z) => {
        if (S.sole > 0 && y < bottom + S.sole) return sc;
        if (kind === 'sneaker' && Math.abs(x) < 0.011 && z > 0.0 && z < 0.08 && y > -0.03) return uc.map((v) => v * 0.8);
        if (kind === 'boot' && z > 0.1) return uc.map((v) => v * 0.85);
        return uc;
      });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Garments
  // ---------------------------------------------------------------------------------------------------------------
  const TOPS = {
    polo: { fab: 'pique', hem: -0.058, sleeves: 'short', collar: 'polo', rough: 0.9 },
    hoodie: { fab: 'jersey', hem: -0.07, sleeves: 'long', collar: 'hood', rough: 0.95, gap: [0.32, 0.55] },
    jacket: { fab: 'twill', hem: -0.078, sleeves: 'long', collar: 'jacket', rough: 0.88 },
    cardigan: { fab: 'knit', hem: -0.09, sleeves: 'long', collar: 'cardigan', rough: 0.97, gap: [0.2, 0.72] },
    hivis: { fab: 'twill', hem: -0.062, sleeves: 'long', collar: 'shirt', rough: 0.85 },
    shirt: { fab: 'suit', hem: -0.058, sleeves: 'long', collar: 'shirt', rough: 0.85 },
    blouse: { fab: 'suit', hem: -0.05, sleeves: 'long', collar: 'round', rough: 0.85 },
    gown: { fab: 'gown', hem: -0.06, sleeves: 'short', collar: 'gown', rough: 0.9, skirt: true },
    suit: { fab: 'suit', hem: -0.1, sleeves: 'long', collar: 'lapel', rough: 0.8, gap: [0.0, 0.62] },
    tee: { fab: 'jersey', hem: -0.058, sleeves: 'short', collar: 'crew', rough: 0.95 },
    jumper: { fab: 'knit', hem: -0.066, sleeves: 'long', collar: 'crew', rough: 0.97 },
  };
  const PANTS = { work: { fab: 'twill', belt: true }, jeans: { fab: 'denim', belt: true }, track: { fab: 'jersey', belt: false, cuff: true }, slacks: { fab: 'suit', belt: true }, suit: { fab: 'suit', belt: true }, skirt: { fab: 'suit', skirt: true }, none: { none: true } };

  // small canvases (cached): chest patch, knuckle scrapes, phone/tablet/clipboard faces
  const CANVAS_TEX = new Map();
  function canvasTex(key, w, h, draw) {
    if (CANVAS_TEX.has(key)) return CANVAS_TEX.get(key);
    const c = TU.mk(w, h), ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = TU.mkTex(c); t.userData.shared = true;
    CANVAS_TEX.set(key, t);
    return t;
  }
  const patchTex = (text) => canvasTex('patch:' + text, 256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#23304a'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9d0b4'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 12, h / 2 - 12, 0, 0, TAU); ctx.fill();
    const lines = String(text).split('\n');
    lines.forEach((ln, i) => {
      const size = TU.fitSize(ctx, [ln], w * 0.72, h * 0.28, (s) => `bold ${s}px ${Tex.fonts.narrow}`, 40);
      TU.text(ctx, ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15 + size * 0.35, { size, font: Tex.fonts.narrow, weight: 'bold', color: '#7a1f1c', align: 'center', spacing: 1 });
    });
    TU.age(ctx, w, h, U.rng(9), 0.7);
  });
  const scrapeTex = () => canvasTex('scrapes', 64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const r = U.rng(44);
    for (let k = 0; k < 4; k++) {
      const y = 10 + k * 13 + r() * 4;
      const g = ctx.createRadialGradient(w / 2, y, 1, w / 2, y, 12); g.addColorStop(0, 'rgba(150,40,35,0.8)'); g.addColorStop(1, 'rgba(160,70,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w / 2, y, 16, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(110,25,25,0.7)'; ctx.lineWidth = 1;
      for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.moveTo(w / 2 - 10 + r() * 6, y - 3 + r() * 6); ctx.lineTo(w / 2 + 4 + r() * 8, y - 3 + r() * 6); ctx.stroke(); }
    }
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CONTRACT+ draw-call batching — Rig.batch(root, {filter}) → batch {meshes, parts, check(), dispose()}.
  // A figure is ~50 meshes (one per segment, eye, lid, button …), so every figure on screen cost 40–66 draw calls. The
  // batch draws all of a figure's parts that share a material with ONE SkinnedMesh per (material, casts, receives): its
  // "bones" are the part meshes themselves (each part's geometry is baked in its own local transform; the bone matrix
  // is the part's live matrixWorld times the inverse of that transform), so every animation — bones, eyes, lids,
  // dangles, a part's own scale — carries on exactly as before, and a part hidden (its own or an ancestor's
  // `visible`) or taken out of the figure collapses to a point. The originals stay in the hierarchy (everything that
  // moves, hides, reads or re-parents them works as before) but draw nothing (layers mask 0; Game's fog culling leaves
  // them alone: userData.rigHidden). check() (every Actor.update) keeps it honest: a part whose material, geometry,
  // shadow flags, render order or vertices change, or that leaves the figure, drops out of the batch and draws itself
  // again; it also refreshes the batch's bounds (frustum culling). Held props, transparent parts and parts that
  // are alone with their material are left as they are. A figure costs ~16–25 calls instead of 40–66 (+ ~3 instead
  // of ~12 in the torch's shadow pass). Rig.batching = false (before figures are built) turns it off.
  // ---------------------------------------------------------------------------------------------------------------
  const B_COLLAPSE = new THREE.Matrix4().makeScale(0, 0, 0);
  const _bm = new THREE.Matrix4(), _bInv = new THREE.Matrix4(), _bS = new THREE.Sphere();
  const OBR0 = THREE.Object3D.prototype.onBeforeRender;
  const bInside = (p, root) => { for (let q = p.parent; q; q = q.parent) if (q === root) return true; return false; };
  function bShown(p, root) { for (let q = p; q; q = q.parent) { if (!q.visible) return false; if (q === root) return true; } return false; }
  function batchable(m, root, filter) {
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || m.userData.rigBatch || m.userData.noBatch) return false;
    const g = m.geometry, mat = m.material;
    if (!g || !mat || Array.isArray(mat) || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position) return false;
    if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity || (!g.index && g.attributes.position.count % 3)) return false;
    if (mat.transparent || m.renderOrder || m.onBeforeRender !== OBR0 || m.customDepthMaterial || m.customDistanceMaterial) return false;
    for (let q = m.parent; q && q !== root; q = q.parent) if (/^prop:/.test(q.name) || (q.userData && q.userData.noBatch)) return false;
    return !filter || !!filter(m);
  }
  function batch(root, o = {}) {
    root.updateMatrixWorld(true);
    const groups = new Map();
    root.traverse((m) => {
      // (a part hidden when the batch is built — a lash, a spare prop — is left out: it draws itself when shown)
      if (!batchable(m, root, o.filter) || !bShown(m, root)) return;
      m.updateMatrix();
      if (Math.abs(m.matrix.determinant()) < 1e-12) return;
      const key = m.material.uuid + '|' + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0);
      let gr = groups.get(key);
      if (!gr) { gr = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, parts: [] }; groups.set(key, gr); }
      gr.parts.push(m);
    });
    const recs = [], meshes = [], plan = [];
    for (const gr of groups.values()) if (gr.parts.length >= 2) plan.push(gr);
    if (!plan.length) return null;
    for (const gr of plan) for (const p of gr.parts) {
      const g = p.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      recs.push({ part: p, gr, mat: p.material, geo: g, ver: g.attributes.position.version, cast: p.castShadow, recv: p.receiveShadow, L0: p.matrix.clone(), off: false, mesh: null });
    }
    const bones = recs.map((r) => r.part), inverses = recs.map((r) => r.L0.clone().invert());
    const skel = new THREE.Skeleton(bones, inverses);
    const bound = new THREE.Sphere(new THREE.Vector3(), 2);
    // (the renderer calls this once per frame per skeleton, just before drawing: every part's live world matrix, or a
    // point for a hidden one)
    skel.update = function () {
      const arr = this.boneMatrices;
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (r.off || !bShown(r.part, root)) B_COLLAPSE.toArray(arr, i * 16);
        else _bm.multiplyMatrices(r.part.matrixWorld, this.boneInverses[i]).toArray(arr, i * 16);
      }
      if (this.boneTexture) this.boneTexture.needsUpdate = true;
    };
    let bi = 0;
    for (const gr of plan) {
      const items = [], idx = [];
      for (const p of gr.parts) { const r = recs[bi]; items.push({ geo: r.geo, m: r.L0 }); idx.push(bi); bi++; }
      const geo = Kit.mergeGeometries(items, !!gr.mat.vertexColors);
      const n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      let v = 0;
      items.forEach((it, k) => { const c = it.geo.attributes.position.count; for (let i = 0; i < c; i++, v++) { si[v * 4] = idx[k]; sw[v * 4] = 1; } });
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const sm = new THREE.SkinnedMesh(geo, gr.mat);
      sm.name = 'rigbatch:' + (gr.mat.name || gr.mat.type);
      sm.castShadow = gr.cast; sm.receiveShadow = gr.recv;
      sm.bindMode = 'attached';
      sm.bind(skel, new THREE.Matrix4());
      sm.boundingSphere = bound; sm.boundingBox = new THREE.Box3();
      sm.layers.mask = root.layers.mask;
      sm.userData.rigBatch = true; sm.userData.live = gr.parts.length;
      root.add(sm);
      meshes.push(sm);
      for (const k of idx) recs[k].mesh = sm;
    }
    for (const r of recs) { r.part.layers.mask = 0; r.part.userData.rigHidden = true; }
    const drop = (r) => {
      if (r.off) return;
      r.off = true;
      r.part.layers.mask = root.layers.mask; delete r.part.userData.rigHidden;
      r.mesh.userData.live--;
      if (r.mesh.userData.live <= 0) r.mesh.visible = false;
    };
    const B = {
      root, meshes, recs, skeleton: skel, bound,
      get parts() { return recs.filter((r) => !r.off).length; },
      // every frame, after the figure's matrices are updated: parts that changed drop out; the bounds follow the pose
      check(updateMatrices = false) {
        if (updateMatrices) root.updateMatrixWorld(true);        // (a group moved by code after its last matrix update)
        for (const r of recs) {
          if (r.off) continue;
          const p = r.part;
          if (p.material !== r.mat || p.geometry !== r.geo || p.castShadow !== r.cast || p.receiveShadow !== r.recv || p.renderOrder || r.geo.attributes.position.version !== r.ver || !bInside(p, root)) drop(r);
        }
        _bInv.copy(root.matrixWorld).invert();
        let first = true;
        for (const r of recs) {
          if (r.off) continue;
          _bS.copy(r.geo.boundingSphere).applyMatrix4(_bm.multiplyMatrices(_bInv, r.part.matrixWorld));
          if (first) { bound.copy(_bS); first = false; } else bound.union(_bS);
        }
        bound.radius += 0.12;                                    // (a frame of motion: eyes / dangles move after this)
        for (const sm of meshes) sm.boundingBox.makeEmpty().expandByPoint(bound.center).expandByScalar(bound.radius);
      },
      dispose() {
        for (const r of recs) if (!r.off) { r.part.layers.mask = root.layers.mask; delete r.part.userData.rigHidden; r.off = true; }
        for (const sm of meshes) { sm.removeFromParent(); sm.geometry.dispose(); }
        skel.dispose();
        meshes.length = 0;
      },
    };
    B.check();
    return B;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Actor
  // ---------------------------------------------------------------------------------------------------------------
  let ACTOR_N = 0;
  const LIVE = new Set();
  const STYLE0 = { slouch: 0, upright: 0, armSwing: 1, stepLen: 1, narrow: 0, bounce: 1, heavy: 0, cadence: 1, runBad: 0, tension: 0 };
  function normParams(p) {
    const P = { ...p };
    P.height = p.height || 1.75;
    P.build = BUILDS[p.build] ? p.build : 'average';
    P.gender = p.gender || (p.build === 'slight' ? 'f' : 'm');
    P.age = p.age ?? 30;
    P.skin = p.skin || '#d4a98c';
    P.seed = p.seed ?? 1;
    P.hair = { style: 'short', color: '#2e2620', ...(p.hair || {}) };
    P.top = p.top === null ? null : { kind: 'polo', color: '#1a8f8c', ...(p.top || {}) };
    P.layers = (p.layers || []).map((l) => ({ ...l }));
    P.pants = { kind: 'work', color: '#202124', ...(p.pants || {}) };
    P.shoes = { kind: 'sneaker', color: '#d8d4ca', ...(p.shoes || {}) };
    P.face = { eyes: '#4a3526', ...(p.face || {}) };
    P.hunch = p.hunch || 0; P.armScale = p.armScale || 1; P.armJoints = p.armJoints === 3 ? 3 : 2; P.legScale = p.legScale || 1;
    P.headScale = p.headScale || 1; P.headTilt = p.headTilt || 0; P.neckLen = p.neckLen || 1;
    P.faceMode = p.faceMode || 'painted';
    P.detail = p.detail === 'low' ? 'low' : 'high';
    P.extraArms = p.extraArms | 0;
    return P;
  }

  class Actor {
    constructor(P) {
      this.P = P;
      this.n = ++ACTOR_N;
      this.preset = P.preset || null;
      this.id = P.id || (this.preset || 'human') + '_' + this.n;
      this.height = P.height; this.H = P.height;
      this.mats = []; this._mc = new Map(); this.parts = {}; this.bones = {}; this.rest = {}; this.anchors = {};
      this.held = { L: null, R: null }; this.dangles = []; this.lines = []; this.disposables = [];
      this.walkSpeed = P.walkSpeed || 1.3; this.runSpeed = P.runSpeed || 3.3;
      this.posture = P.posture ?? 0; this.idleLife = P.idleLife ?? true; this.sound = P.sound ?? true;
      this.seatHeight = P.seatHeight || 0.46;
      this.style = { ...STYLE0, ...(P.style || {}) };
      this.habits = P.habits || [];
      this.habitEvery = P.habitEvery || [7, 15];
      this.extraArmMode = P.extraArmMode || 'writhe';
      this.rng = U.rng((P.seed || 1) * 977 + this.n * 31);
      this.D = this._dims();
      this._skeleton();
      this._build();
      this.trimShadows();
      this._initState();
      LIVE.add(this);
      if (P.tint) this.setTint(P.tint.color, P.tint.amount);
      if (P.opacity !== undefined && P.opacity < 1) this.setOpacity(P.opacity);
      this.setAnim(P.anim || 'idle', { blend: 0 });
      if (P.expr) this.expr(P.expr);
      this.update(0);
      this._batchOn = P.batch !== false && api.batching !== false;
      this.rebatch();
    }
    // CONTRACT+: rebatch() — (re)build the figure's draw-call batch (Rig.batch) from the parts it has now; runs at the
    // end of the build, after trimShadows() (Enemies calls it once a monster's parts are on) and when wear() adds a part
    rebatch() {
      if (this._batch) { this._batch.dispose(); this._batch = null; }
      this._batchDirty = false;
      if (!this._batchOn || this.disposed) return this;
      try { this._batch = batch(this.root); } catch (e) { console.error('[Rig] batch', e); this._batch = null; }
      return this;
    }
    // CONTRACT+: trimShadows() — shadows (the torch is the only caster): one caster per major segment — its largest
    // piece — is plenty for the soft 1024 map and keeps an actor's torch-shadow pass at ~12 draws instead of ~25.
    // Everything else (layers under the outer garment, hands, feet, face details, accessories, held props) receives
    // but doesn't cast. Run at build; Enemies runs it again after adding a monster's parts.
    trimShadows() {
      if (this._batch) { this._batch.dispose(); this._batch = null; this._batchDirty = true; }
      const major = new Set(['hips', 'spine', 'chest', 'head', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'thighL', 'thighR', 'shinL', 'shinR'].map((n) => this.bones[n]).filter(Boolean));
      const all = new Set(Object.values(this.bones));
      const best = new Map();
      this.root.traverse((m) => {
        if (!m.isMesh || !m.castShadow) return;
        let b = m.parent;
        while (b && !all.has(b) && b !== this.root) b = b.parent;
        if (!major.has(b)) { m.castShadow = false; return; }
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const r = m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
        const cur = best.get(b);
        if (!cur || r > cur.r) { if (cur) cur.m.castShadow = false; best.set(b, { m, r }); } else m.castShadow = false;
      });
      if (this._batchDirty && this._batchOn) this.rebatch();
    }
    _dims() {
      const P = this.P, B = BUILDS[P.build], T = torsoDims(B);
      const D = { B, T, H: P.height };
      D.ankle = 0.045; D.shin = 0.236 * P.legScale; D.thigh = 0.244 * P.legScale;
      D.hipJoint = D.ankle + D.shin + D.thigh; D.pelvisY = D.hipJoint + 0.035; D.hipX = T.hipW * 0.54;
      D.spine = 0.06; D.chest = 0.105; D.neckY = 0.1; D.neckZ = -0.012; D.neckLen = 0.07 * P.neckLen;
      D.shY = 0.056; D.shX = T.shX; D.clavX = 0.02; D.clavY = 0.085; D.clavZ = -0.006;
      D.ua = 0.172 * P.armScale; D.fa = 0.152 * P.armScale; D.handS = B.hand;
      D.head = 0.13 * P.headScale;
      D.limb = B.limb * 1.08;
      return D;
    }
    // ---- materials ----------------------------------------------------------------------------------------------
    _mat(key, make) {
      let m = this._mc.get(key);
      if (!m) { m = make(); m.userData.rig = true; m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent; this._mc.set(key, m); this.mats.push(m); }
      return m;
    }
    cloth(fab, color, o = {}) {
      const fresh = !!o.fresh && (fab === 'pique' || fab === 'suit');
      return this._mat('cloth:' + fab + ':' + hexOf(color) + (o.rough ?? '') + (o.single ? 's' : '') + (fresh ? 'f' : ''), () => {
        const map = fab === 'knit' ? Tex.get('fabric_knit', { color: '#e6e3dc' }) : fresh ? Tex.get('rig_' + fab, { fresh: 1 }) : Tex.get('rig_' + fab);
        return new THREE.MeshStandardMaterial({ map, color: fab === 'gown' ? '#ffffff' : color, roughness: (o.rough ?? 0.92) * (fresh ? 0.88 : 1), metalness: 0, side: o.single ? THREE.FrontSide : THREE.DoubleSide });
      });
    }
    skinMat() { return this._mat('skin', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_skin'), color: this.P.skin, roughness: 0.68, metalness: 0 })); }
    plain(color, o = {}) {
      return this._mat('plain:' + hexOf(color) + ':' + (o.rough ?? 0.6) + ':' + (o.metal ?? 0) + (o.vc ? 'v' : '') + (o.side || ''), () => new THREE.MeshStandardMaterial({
        color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, vertexColors: !!o.vc, side: o.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
        map: o.map || null, transparent: !!o.transparent, opacity: o.opacity ?? 1, alphaTest: o.alphaTest || 0, depthWrite: o.depthWrite ?? true,
      }));
    }
    decal(tex, key, o = {}) {
      return this._mat('decal:' + key, () => new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, transparent: !!o.alpha, alphaTest: o.alpha ? 0.35 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    }
    // ---- meshes -------------------------------------------------------------------------------------------------
    _mesh(parent, g, m, o = {}) {
      const me = new THREE.Mesh(g, m);
      if (o.p) me.position.set(o.p[0], o.p[1], o.p[2]);
      if (o.r) me.rotation.set(o.r[0], o.r[1], o.r[2]);
      const s = o.s ?? this.H;
      if (Array.isArray(s)) me.scale.set(s[0], s[1], s[2]); else me.scale.setScalar(s);
      me.castShadow = o.shadow ?? true; me.receiveShadow = true;
      if (o.name) { me.name = o.name; if (this.parts[o.name]) { if (!Array.isArray(this.parts[o.name])) this.parts[o.name] = [this.parts[o.name]]; this.parts[o.name].push(me); } else this.parts[o.name] = me; }
      parent.add(me);
      return me;
    }
    _skeleton() {
      const D = this.D, H = this.H, P = this.P;
      const root = this.root = new THREE.Group(); root.name = 'actor:' + this.id; root.userData.actor = this;
      const body = this.body = new THREE.Group(); body.name = 'body'; root.add(body);
      this.bodyOffset = body.position;
      const B = this.bones;
      const bone = (name, parent, x, y, z, order = 'XZY') => {
        const b = new THREE.Bone(); b.name = name; b.position.set(x * H, y * H, z * H); b.rotation.order = order;
        parent.add(b); B[name] = b; this.rest[name] = b.position.clone(); return b;
      };
      bone('hips', body, 0, D.pelvisY, 0, 'YXZ');
      bone('spine', B.hips, 0, D.spine, 0, 'YXZ');
      bone('chest', B.spine, 0, D.chest, 0, 'YXZ');
      bone('neck', B.chest, 0, D.neckY, D.neckZ, 'YXZ');
      bone('head', B.neck, 0, D.neckLen, 0, 'YXZ');
      const armChain = (pre, s, parent, ox, oy, oz) => {
        const sx = s === 'L' ? 1 : -1;
        bone(pre + 'shoulder' + s, parent, sx * ox, oy, oz, 'XYZ');
        bone(pre + 'upperArm' + s, B[pre + 'shoulder' + s], sx * (D.shX - D.clavX), D.shY - D.clavY, -D.clavZ);
        bone(pre + 'foreArm' + s, B[pre + 'upperArm' + s], 0, -D.ua, 0);
        let fa = B[pre + 'foreArm' + s];
        if (P.armJoints === 3) fa = bone(pre + 'foreArm2' + s, fa, 0, -D.fa / 2, 0);
        bone(pre + 'hand' + s, fa, 0, -(P.armJoints === 3 ? D.fa / 2 : D.fa), 0);
      };
      for (const s of ['L', 'R']) {
        armChain('', s, B.chest, D.clavX, D.clavY, D.clavZ);
        const sx = s === 'L' ? 1 : -1;
        bone('thigh' + s, B.hips, sx * D.hipX, -0.035, 0);
        bone('shin' + s, B['thigh' + s], 0, -D.thigh, 0);
        bone('foot' + s, B['shin' + s], 0, -D.shin, 0);
      }
      // extra arm pairs (monsters): lower on the chest, slightly behind
      B.extra = [];
      for (let k = 0; k < P.extraArms; k++) {
        const pre = 'x' + k + '_';
        for (const s of ['L', 'R']) armChain(pre, s, B.chest, D.clavX, -0.01 - k * 0.045, -0.02 - k * 0.01);
        const e = {};
        for (const n of ['shoulder', 'upperArm', 'foreArm', 'foreArm2', 'hand']) for (const s of ['L', 'R']) if (B[pre + n + s]) e[n + s] = B[pre + n + s];
        B.extra.push(e);
      }
    }
    // ---- clothing and body ----------------------------------------------------------------------------------------
    _build() {
      const P = this.P, D = this.D, T = D.T, B = this.bones, H = this.H;
      const layers = [P.top, ...P.layers].filter(Boolean);
      this.layers = layers;
      this._pants();
      layers.forEach((L, i) => this._top(L, i, i === layers.length - 1));
      this._arms(layers, '', B);
      for (let k = 0; k < P.extraArms; k++) this._arms(layers, 'x' + k + '_', B);
      this._mesh(B.neck, geo('neck_' + P.build + P.neckLen, () => tube(neckRings(T, D.neckLen), { seg: 12, uvs: UVH })), this.skinMat(), { name: 'neck' });
      this._head();
      this._accessories();
      // anchors for other modules
      const anchor = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = 'anchor:' + name; o.position.set(x * H, y * H, z * H); parent.add(o); this.anchors[name] = o; return o; };
      anchor('chest', B.chest, 0, 0.03, T.chestD + 0.012);
      anchor('back', B.chest, 0, 0.03, -T.chestD - 0.012);
      anchor('belt', B.hips, 0, 0.04, T.waistD + 0.01);
      anchor('head', B.head, 0, 0.1, 0.02);
    }
    _pants() {
      const P = this.P, D = this.D, T = D.T, B = this.bones, pk = PANTS[P.pants.kind] || PANTS.work;
      const g = D.limb, key = P.build + P.legScale;
      const skin = this.skinMat();
      const sk = SHOES[P.shoes.kind] ? P.shoes.kind : 'sneaker', sh = SHOES[sk];
      const shoeMat = this._mat('shoe', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_' + sh.tex), color: '#ffffff', vertexColors: true, roughness: sh.rough, metalness: 0 }));
      for (const s of ['L', 'R']) this._mesh(B['foot' + s], shoeGeo(sk, hexOf(P.shoes.sole || shadeHex(P.shoes.color, 0.6)), hexOf(P.shoes.color)), shoeMat, { name: 'shoe' + s });
      if (pk.none) {
        this._mesh(B.hips, geo('pelvis_bare_' + key, () => tube(pelvisRings(T, 0), { seg: 16, uvs: UVH })), this.cloth('jersey', '#d8d2c8'), { name: 'pants' });
        for (const s of ['L', 'R']) {
          this._mesh(B['thigh' + s], geo('thigh_bare_' + key, () => tube(thighRings(D.thigh, g * 0.92), { seg: 12, uvs: UVH })), skin, { name: 'thigh' + s });
          this._mesh(B['shin' + s], geo('shin_bare_' + key, () => tube(shinBareRings(D.shin, g), { seg: 12, uvs: UVH })), skin, { name: 'shin' + s });
        }
        return;
      }
      const m = this.cloth(pk.fab, P.pants.color, { rough: pk.fab === 'suit' ? 0.8 : 0.94 });
      this._mesh(B.hips, geo('pelvis_' + key, () => tube(pelvisRings(T, 0.003), { seg: 16, uvs: UVH })), m, { name: 'pants' });
      if ((P.pants.belt ?? pk.belt) && !pk.skirt && P.detail !== 'low') {
        const showWaist = !P.top || P.top.tucked || P.top.kind === 'suit';
        const belt = geo('belt_' + key + (showWaist ? 'b' : ''), () => {
          const R = pelvisRings(T, 0.003);
          const band = patchGeo(R, 0.034, 0.047, 0, TAU, 0.0018, 24, 1);
          return showWaist ? merge([band, xf(new THREE.BoxGeometry(0.02, 0.014, 0.004), [0, 0.0405, surfAt(R, 0.04, 0, 0.003).p.z])]) : band;
        });
        this._mesh(B.hips, belt, this.plain('#1c1a18', { rough: 0.55, metal: 0.1 }), { name: 'belt' });
      }
      for (const s of ['L', 'R']) {
        if (pk.skirt) {
          this._mesh(B['thigh' + s], geo('thigh_bare_' + key, () => tube(thighRings(D.thigh, g * 0.92), { seg: 12, uvs: UVH })), this.plain(P.pants.legs || P.skin, { rough: 0.6 }), { name: 'thigh' + s });
          this._mesh(B['shin' + s], geo('shin_bare_' + key, () => tube(shinBareRings(D.shin, g), { seg: 12, uvs: UVH })), P.pants.legs ? this.plain(P.pants.legs, { rough: 0.5 }) : skin, { name: 'shin' + s });
          this._mesh(B['thigh' + s], geo('skirt_' + key + s, () => this._skirtGeo(s, 0.012, 0.32)), m, { name: 'skirt' });
          continue;
        }
        this._mesh(B['thigh' + s], geo('thigh_pants_' + key, () => tube(thighRings(D.thigh, g, 0.004), { seg: 12, uvs: UVH })), m, { name: 'thigh' + s });
        this._mesh(B['shin' + s], geo('shin_pants_' + key + (pk.cuff ? 'c' : ''), () => tube(shinPantsRings(D.shin, g, pk.cuff), { seg: 12, uvs: UVH })), m, { name: 'shin' + s });
      }
    }
    // flared panel hanging from a thigh (skirts, gowns, long cardigans): down to `len` of the shin
    _skirtGeo(s, off, len) {
      const D = this.D, T = D.T, L = D.thigh, sx = s === 'L' ? 1 : -1;
      const R = [];
      const w0 = T.hipW * 0.62 + off, d0 = T.hipD + off;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, y = lerp(0.05, -L - D.shin * len, t);
        R.push([y, w0 * (1 + 0.12 * t), d0 * (1 + 0.08 * t), -sx * T.hipW * 0.14 * (1 - t * 0.5), -0.004]);
      }
      R.reverse();
      return tube(R, { seg: 14, uvs: UVH });
    }
    _top(L, i, isOuter) {
      const P = this.P, D = this.D, T = D.T, B = this.bones, H = this.H;
      const K = TOPS[L.kind] || TOPS.polo;
      const o = 0.004 + i * 0.0055;
      const open = L.open ?? !!K.gap;
      const gapR = open && K.gap ? K.gap : null;
      const hem = L.tucked ? -0.03 : (L.hem ?? K.hem);
      const bk = P.build + '_' + L.kind + '_' + i + (open ? 'o' : '') + hem;
      const m = this.cloth(K.fab, L.color || '#777777', { rough: K.rough, fresh: L.fresh });
      const m2 = L.color2 ? this.cloth(K.fab, L.color2, { rough: K.rough, fresh: L.fresh }) : m;
      const aR = abdRings(T, o, hem, L.kind === 'suit' ? 1.04 : 1), cR = chestRings(T, o);
      const nA = aR.length, nC = cR.length;
      const gapA = gapR && L.kind !== 'suit' ? (k) => lerp(gapR[0], lerp(gapR[0], gapR[1], 0.45), k / (nA - 1)) : null;
      const gapC = gapR ? (L.kind === 'suit' ? (k) => lerp(0, gapR[1], clamp((k - 1) / (nC - 3))) : (k) => lerp(lerp(gapR[0], gapR[1], 0.45), gapR[1], k / (nC - 1))) : null;
      // open garments drop their closure rings so the panels end cleanly
      const aRings = gapR && L.kind !== 'suit' ? aR.slice(0, -1) : aR, cRings = gapR ? cR.slice(1, -1) : cR;
      this._mesh(B.spine, geo('abd_' + bk, () => tube(aRings, { seg: 18, uvs: UVH, gap: gapA })), L.kind === 'hivis' ? m2 : m, { name: 'top' });
      this._mesh(B.chest, geo('chest_' + bk, () => tube(cRings, { seg: 18, uvs: UVH, gap: gapC ? (k) => gapC(k + 1) : null })), m, { name: 'top' });
      if (isOuter) { this.outerChest = cR; this.outerAbd = aR; this.outerOff = o; this.outerGap = gapC; this.outerKind = L.kind; }
      const detail = this.P.detail !== 'low';
      const dark = (k = 0.7) => this.plain(shadeHex(L.color || '#777', k), { rough: 0.8, side: 'double' });
      switch (K.collar) {
        case 'polo': {
          const g = geo('polo_collar_' + P.build + i, () => {
            const band = tube([[0.097, T.neckR * 1.6 + o, T.neckR * 1.52 + o, 0, -0.011], [0.108, T.neckR * 1.32 + o, T.neckR * 1.27 + o, 0, -0.012], [0.113, T.neckR * 1.3 + o, T.neckR * 1.26 + o, 0, -0.013]], { seg: 16, uvs: UVH });
            const fl = (s) => {
              const p0 = surfAt(cR, 0.1, s * 0.24, o + 0.002).p, p1 = surfAt(cR, 0.08, s * 0.5, o + 0.002).p;
              const q = new THREE.Vector3().subVectors(p1, p0), len = q.length();
              const f = new THREE.BoxGeometry(0.03, len * 1.1, 0.0018);
              const ang = Math.atan2(q.x, -q.y);
              return xf(f, [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 + 0.002], [-0.45, 0, ang]);
            };
            return merge([band, fl(1), fl(-1)]);
          });
          this._mesh(B.chest, g, m, { name: 'collar' });
          if (detail) {
            const pl = geo('placket_' + P.build + i, () => {
              const s0 = surfAt(cR, 0.07, 0, o + 0.001).p;
              const strip = xf(new THREE.BoxGeometry(0.012, 0.042, 0.0015), [0, 0.072, s0.z + 0.001], [-0.2, 0, 0]);
              const b1 = xf(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0015, 6), [0, 0.082, s0.z - 0.001], [HALF - 0.2, 0, 0]);
              const b2 = xf(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0015, 6), [0, 0.064, s0.z + 0.003], [HALF - 0.2, 0, 0]);
              return merge([strip, b1, b2]);
            });
            this._mesh(B.chest, pl, dark(0.82), { name: 'placket', shadow: false });
          }
          break;
        }
        case 'shirt': case 'jacket': case 'round': case 'gown': case 'crew': {
          const kind = K.collar;
          const g = geo('collar_' + kind + P.build + i, () => {
            const band = tube([[0.098, T.neckR * 1.58 + o, T.neckR * 1.5 + o, 0, -0.011], [0.11, T.neckR * 1.32 + o, T.neckR * 1.28 + o, 0, -0.012],
              [kind === 'jacket' ? 0.126 : kind === 'crew' || kind === 'gown' ? 0.113 : 0.119, T.neckR * 1.24 + o, T.neckR * 1.22 + o, 0, -0.011]], { seg: 16, uvs: UVH });
            if (kind === 'crew' || kind === 'gown') return band;
            const pts = kind === 'round' ? 0.02 : kind === 'jacket' ? 0.034 : 0.028;
            const fl = (s) => {
              const p0 = surfAt(cR, 0.1, s * 0.18, o + 0.003).p, p1 = surfAt(cR, 0.078, s * 0.45, o + 0.003).p;
              const q = new THREE.Vector3().subVectors(p1, p0), len = q.length();
              const f = new THREE.BoxGeometry(pts, len * 1.15, 0.002);
              return xf(f, [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 + 0.003], [-0.5, 0, Math.atan2(q.x, -q.y) + s * 0.12]);
            };
            return merge([band, fl(1), fl(-1)]);
          });
          this._mesh(B.chest, g, L.kind === 'hivis' ? m2 : m, { name: 'collar' });
          if (detail && (kind === 'shirt' || kind === 'jacket')) {
            // zipper / button placket: thin strips on both torso pieces
            const zm = kind === 'jacket' ? this.plain('#3a3c40', { rough: 0.4, metal: 0.5 }) : dark(0.85);
            this._mesh(B.chest, geo('placketC_' + bk, () => patchGeo(cR, -0.03, 0.085, -0.035, 0.035, 0.0012, 2, 4)), zm, { shadow: false, name: 'placket' });
            this._mesh(B.spine, geo('placketA_' + bk, () => patchGeo(aR, hem + 0.01, 0.12, -0.035, 0.035, 0.0012, 2, 4)), zm, { shadow: false, name: 'placket' });
          }
          break;
        }
        case 'hood': {
          const hood = geo('hood_' + P.build + i, () => {
            const back = xf(new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, HALF * 1.1), [0, 0.078, -T.chestD * 0.62 - o], [-0.95, 0, 0], [0.078, 0.05, 0.05]);
            const arc = 4.3, rim = new THREE.TorusGeometry(T.neckR * 1.75 + o, 0.012, 6, 18, arc);
            rim.rotateX(-HALF); rim.rotateY(HALF - arc / 2);
            return merge([back, xf(rim, [0, 0.097, -0.006], [0.2, 0, 0])]);
          });
          this._mesh(B.chest, hood, m, { name: 'hood' });
          if (detail) {
            // zip edges along the opening, drawstrings hanging from the hood rim
            const zm = this.plain('#2c2d30', { rough: 0.45, metal: 0.4, side: 'double' });
            if (gapA) {
              const edge = (R, gapF, sg) => { const pts = [], ns = []; for (let k = 0; k < R.length; k++) { if (R[k][1] === 0) continue; const s = surfAt(R, R[k][0], sg * gapF(k), 0.0012); pts.push(s.p); ns.push(s.n); } return ribbon(pts, ns, 0.006); };
              this._mesh(B.spine, geo('zipA_' + bk, () => merge([edge(aRings, gapA, 1), edge(aRings, gapA, -1)])), zm, { shadow: false, name: 'zip' });
              this._mesh(B.chest, geo('zipC_' + bk, () => merge([edge(cRings, (k) => gapC(k + 1), 1), edge(cRings, (k) => gapC(k + 1), -1)])), zm, { shadow: false, name: 'zip' });
              const pk = geo('kpocket_' + bk, () => merge([patchGeo(aRings, hem + 0.012, hem + 0.072, gapA(0) + 0.02, gapA(0) + 0.95, 0.0018, 6, 2), patchGeo(aRings, hem + 0.012, hem + 0.072, -gapA(0) - 0.95, -gapA(0) - 0.02, 0.0018, 6, 2)]));
              this._mesh(B.spine, pk, m, { shadow: false, name: 'pocket' });
            } else {
              this._mesh(B.chest, geo('zipCc_' + bk, () => patchGeo(cR, -0.03, 0.09, -0.018, 0.018, 0.0012, 2, 4)), zm, { shadow: false, name: 'zip' });
              this._mesh(B.spine, geo('zipAc_' + bk, () => patchGeo(aR, hem + 0.004, 0.12, -0.018, 0.018, 0.0012, 2, 4)), zm, { shadow: false, name: 'zip' });
              this._mesh(B.spine, geo('kpocketc_' + bk, () => patchGeo(aR, hem + 0.012, hem + 0.075, -0.9, 0.9, 0.0018, 10, 2)), m, { shadow: false, name: 'pocket' });
            }
            for (const s of [1, -1]) {
              const top = surfAt(cR, 0.09, s * 0.62, o + 0.006).p;
              const d = this._dangle(B.chest, [top.x * H, top.y * H, top.z * H], { limit: [-0.9, 0.05, -0.5, 0.5], stiff: 18, damp: 3.2, restX: -0.12 });
              const str = geo('drawstring', () => merge([xf(new THREE.CylinderGeometry(0.0028, 0.0028, 0.1, 5), [0, -0.05, 0]), xf(new THREE.CylinderGeometry(0.0034, 0.0034, 0.012, 5), [0, -0.104, 0])]));
              this._mesh(d, str, this.plain('#cfccc4', { rough: 0.9 }), { name: 'drawstring', shadow: false });
            }
          }
          break;
        }
        case 'cardigan': {
          if (!detail) break;
          if (!gapA) {
            this._mesh(B.chest, geo('cardplC_' + bk, () => patchGeo(cR, -0.03, 0.095, -0.03, 0.03, 0.0014, 2, 4)), m, { shadow: false, name: 'band' });
            this._mesh(B.spine, geo('cardplA_' + bk, () => patchGeo(aR, hem + 0.004, 0.12, -0.03, 0.03, 0.0014, 2, 4)), m, { shadow: false, name: 'band' });
            break;
          }
          const edge = (R, gapF, sg) => { const pts = [], ns = []; for (let k = 0; k < R.length; k++) { if (R[k][1] === 0) continue; const s = surfAt(R, R[k][0], sg * (gapF(k) + 0.06), 0.0015); pts.push(s.p); ns.push(s.n); } return ribbon(pts, ns, 0.014, UVH); };
          this._mesh(B.spine, geo('cbandA_' + bk, () => merge([edge(aRings, gapA, 1), edge(aRings, gapA, -1)])), m, { shadow: false, name: 'band' });
          this._mesh(B.chest, geo('cbandC_' + bk, () => merge([edge(cRings, (k) => gapC(k + 1), 1), edge(cRings, (k) => gapC(k + 1), -1)])), m, { shadow: false, name: 'band' });
          const btn = geo('cardbtn_' + bk, () => {
            const list = [];
            for (let k = 0; k < 4; k++) {
              const y = lerp(hem + 0.02, 0.1, k / 3), s = surfAt(aRings, y, -(gapA(clamp(Math.round((y - aRings[0][0]) / (0.125 - aRings[0][0]) * (aRings.length - 1)), 0, aRings.length - 1)) + 0.06), 0.004);
              list.push(xf(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 8), [s.p.x, s.p.y, s.p.z], [HALF, 0, 0]));
            }
            return merge(list);
          });
          this._mesh(B.spine, btn, this.plain('#e2dccd', { rough: 0.4 }), { shadow: false, name: 'buttons' });
          break;
        }
        case 'lapel': {
          const g = geo('lapel_' + bk, () => {
            const fl = (s) => {
              const p0 = surfAt(cR, 0.1, s * 0.3, o + 0.004).p, p1 = surfAt(cR, -0.01, s * 0.12, o + 0.004).p;
              const q = new THREE.Vector3().subVectors(p1, p0), len = q.length();
              return xf(new THREE.BoxGeometry(0.035, len, 0.003), [(p0.x + p1.x) / 2 + s * 0.012, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 + 0.004], [-0.25, 0, Math.atan2(q.x, -q.y)]);
            };
            const band = tube([[0.098, T.neckR * 1.58 + o, T.neckR * 1.5 + o, 0, -0.013], [0.116, T.neckR * 1.3 + o, T.neckR * 1.26 + o, 0, -0.016]], { seg: 16, gap: 0.5 });
            return merge([fl(1), fl(-1), band]);
          });
          this._mesh(B.chest, g, m, { name: 'lapel' });
          // shirt front in the V
          const sf = geo('shirtfront_' + P.build + i, () => patchGeo(chestRings(T, o - 0.003), -0.03, 0.098, -0.62, 0.62, 0.0, 6, 5));
          this._mesh(B.chest, sf, this.cloth('suit', L.color2 || '#e8e6e0', { rough: 0.8 }), { name: 'shirtfront', shadow: false });
          const btn = geo('suitbtn_' + bk, () => merge([0.03, 0.065].map((y) => { const q = surfAt(aR, y, 0, o + 0.0015).p; return xf(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 8), [0, q.y, q.z], [HALF, 0, 0]); })));
          this._mesh(B.spine, btn, this.plain('#151515', { rough: 0.3 }), { shadow: false, name: 'buttons' });
          break;
        }
        default: break;
      }
      // hi-vis: orange yoke over a navy body, reflective tape bands
      if (L.kind === 'hivis') {
        const tm = this._mat('tape', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_tape'), color: '#d8dadc', roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide }));
        this._mesh(B.chest, geo('hvtapeC_' + bk, () => patchGeo(cR, -0.026, -0.012, -PI, PI, 0.0016, 28, 1)), tm, { shadow: false, name: 'tape' });
        this._mesh(B.spine, geo('hvtapeA_' + bk, () => patchGeo(aR, 0.03, 0.044, -PI, PI, 0.0016, 28, 1)), tm, { shadow: false, name: 'tape' });
      }
      if (L.logo && detail) {   // store uniform: the original wordmark on the left chest
        const s = surfAt(cR, 0.036, 0.5, o + 0.0015);
        const me = this._mesh(B.chest, geo('logo_plane', () => new THREE.PlaneGeometry(0.068, 0.025)), this.decal(Tex.wordmark({ bg: null, color: '#ffcc00', w: 256, h: 96 }), 'logo', { alpha: true, rough: 0.8 }), { s: 1, shadow: false, name: 'logo' });
        this._orientDecal(me, B.chest, s.p.clone().multiplyScalar(H), s.n);
      }
      if (L.patch && detail) {
        const s = surfAt(cR, 0.03, 0.52, o + 0.0015);
        const me = this._mesh(B.chest, geo('patch_plane', () => new THREE.PlaneGeometry(0.082, 0.041)), this.decal(patchTex(L.patch), 'patch' + L.patch, { alpha: true, rough: 0.9 }), { s: 1, shadow: false, name: 'patch' });
        this._orientDecal(me, B.chest, s.p.clone().multiplyScalar(H), s.n);
      }
      if (L.kind === 'jacket' && detail) {
        const pk = geo('jpock_' + bk, () => merge([patchGeo(aR, hem + 0.015, hem + 0.07, 0.45, 1.05, 0.0016, 5, 2), patchGeo(aR, hem + 0.015, hem + 0.07, -1.05, -0.45, 0.0016, 5, 2), patchGeo(cR, -0.012, 0.03, -1.0, -0.45, 0.0016, 5, 2)]));
        this._mesh(B.spine, pk, dark(0.9), { shadow: false, name: 'pocket' });
      }
      if (K.skirt) for (const s of ['L', 'R']) this._mesh(B['thigh' + s], geo('gownskirt_' + P.build + s, () => this._skirtGeo(s, 0.016, 0.12)), m, { name: 'skirt' });
      if (L.kind === 'cardigan' && (L.long || P.pants.kind === 'none')) for (const s of ['L', 'R']) this._mesh(B['thigh' + s], geo('cardskirt_' + P.build + s, () => this._skirtGeo(s, 0.022, -0.55)), m, { name: 'skirt' });
    }
    _orientDecal(me, bone, pos, n) {
      me.position.copy(pos).addScaledVector(n, 0.0015);
      const up = new THREE.Vector3(0, 1, 0), x = new THREE.Vector3().crossVectors(up, n).normalize(), y = new THREE.Vector3().crossVectors(n, x).normalize();
      me.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    }
    _arms(layers, pre, B) {
      const P = this.P, D = this.D, g = D.limb, key = P.build + P.armScale;
      const skin = this.skinMat();
      let longL = null, shortL = null;
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i], K = TOPS[L.kind] || TOPS.polo; const sl = L.sleeves || K.sleeves; if (sl === 'long' && !longL) { longL = { L, K, i }; break; } if ((sl === 'short' || sl === 'pushed') && !shortL) shortL = { L, K, i, sl }; }
      for (const s of ['L', 'R']) {
        const ua = B[pre + 'upperArm' + s], fa = B[pre + 'foreArm' + s], fa2 = B[pre + 'foreArm2' + s];
        const faLen = P.armJoints === 3 ? D.fa / 2 : D.fa;
        const faGeo = (tag, fn) => geo(tag + key + (fa2 ? '3' : '') + (longL ? longL.i : ''), fn);
        if (longL) {
          const L = longL.L, K = longL.K, o = 0.0045 + longL.i * 0.003;
          const m = this.cloth(K.fab, L.kind === 'hivis' ? L.color : L.color, { rough: K.rough });
          const mF = L.kind === 'hivis' && L.color2 ? this.cloth(K.fab, L.color2, { rough: K.rough }) : m;
          const pushed = L.sleeves === 'rolled';
          this._mesh(ua, geo('sleeveU_' + key + longL.i, () => tube(upperArmRings(D.ua, g).map((r, k, a) => (k === 0 || k === a.length - 1) ? r : [r[0], r[1] + o, r[2] + o, r[3], r[4]]).slice(1), { seg: 12, uvs: UVH })), m, { name: 'sleeve' + s });
          const cuffR = (len) => [[-len - 0.006, 0.017 * g + o * 0.6, 0.02 * g + o * 0.6], [-len + 0.004, 0.018 * g + o * 0.6, 0.021 * g + o * 0.6], [-len + 0.012, 0.02 * g + o, 0.023 * g + o], [-len * 0.6, 0.021 * g + o, 0.024 * g + o], [-len * 0.25, 0.024 * g + o, 0.027 * g + o], [0.0, 0.026 * g + o, 0.026 * g + o], [0.02, 0.026 * g + o, 0.026 * g + o]];
          if (fa2) {
            this._mesh(fa, faGeo('sleeveF1_', () => tube(cuffR(faLen).slice(3), { seg: 12, uvs: UVH })), mF, { name: 'sleeve' + s });
            this._mesh(fa2, faGeo('sleeveF2_', () => tube(cuffR(faLen), { seg: 12, uvs: UVH })), mF, { name: 'sleeve' + s });
          } else if (pushed) {
            this._mesh(fa, geo('forearm_' + key, () => tube(foreArmRings(D.fa, g), { seg: 12, uvs: UVH })), skin, { name: 'forearm' + s });
            this._mesh(fa, geo('rollF_' + key, () => tube([[-0.05, 0.027 * g + o, 0.029 * g + o], [-0.035, 0.03 * g + o, 0.031 * g + o], [-0.012, 0.03 * g + o, 0.03 * g + o], [0.02, 0.027 * g + o, 0.027 * g + o]], { seg: 12, uvs: UVH })), mF, { name: 'sleeve' + s });
          } else this._mesh(fa, faGeo('sleeveF_', () => tube(cuffR(faLen), { seg: 12, uvs: UVH })), mF, { name: 'sleeve' + s });
          if (L.kind === 'hivis') this._mesh(ua, geo('hvArmTape_' + key, () => tube([[-D.ua * 0.55, 0.028 * g + o + 0.0015, 0.027 * g + o + 0.0015], [-D.ua * 0.47, 0.0292 * g + o + 0.0015, 0.0282 * g + o + 0.0015]], { seg: 12 })), this._mat('tape', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_tape'), color: '#d8dadc', roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide })), { shadow: false, name: 'tape' });
        } else {
          this._mesh(ua, geo('upperarm_' + key, () => tube(upperArmRings(D.ua, g), { seg: 12, uvs: UVH })), skin, { name: 'upperArm' + s });
          if (fa2) {
            this._mesh(fa, faGeo('forearm1_', () => tube(foreArmRings(faLen, g).slice(2), { seg: 12, uvs: UVH })), skin, { name: 'forearm' + s });
            this._mesh(fa2, faGeo('forearm2_', () => tube(foreArmRings(faLen, g), { seg: 12, uvs: UVH })), skin, { name: 'forearm' + s });
          } else this._mesh(fa, geo('forearm_' + key, () => tube(foreArmRings(D.fa, g), { seg: 12, uvs: UVH })), skin, { name: 'forearm' + s });
          if (shortL) {
            const L = shortL.L, K = shortL.K, o = 0.0035 + shortL.i * 0.003;
            const len = shortL.sl === 'pushed' ? 0.26 : 0.46;
            const sR = [[-D.ua * len, 0.0315 * g + o, 0.0305 * g + o], [-D.ua * len + 0.006, 0.0315 * g + o, 0.0305 * g + o], [-D.ua * 0.2, 0.0315 * g + o, 0.031 * g + o], [-0.004, 0.0315 * g + o, 0.031 * g + o], [0.008, 0.028 * g + o, 0.028 * g + o], [0.014, 0.018, 0.018], [0.016, 0, 0]];
            if (shortL.sl === 'pushed') sR.unshift([-D.ua * len - 0.014, 0.031 * g + o, 0.03 * g + o], [-D.ua * len - 0.007, 0.036 * g + o, 0.035 * g + o]);
            this._mesh(ua, geo('sleeveS_' + key + shortL.sl + shortL.i, () => tube(sR, { seg: 12, uvs: UVH })), this.cloth(K.fab, L.color, { rough: K.rough, fresh: L.fresh }), { name: 'sleeve' + s });
          }
        }
        this._hand(s, B[pre + 'hand' + s], pre);
      }
    }
    _hand(s, hb, pre) {
      const P = this.P, D = this.D, hs = D.handS, sx = s === 'L' ? 1 : -1, H = this.H;
      const skin = this.skinMat();
      const low = P.detail === 'low';
      const palm = geo('palm' + hs, () => tube([[-0.056 * hs, 0, 0], [-0.052 * hs, 0.0075 * hs, 0.022 * hs, 0, 0, 3], [-0.042 * hs, 0.0088 * hs, 0.024 * hs, 0, 0, 3], [-0.02 * hs, 0.0095 * hs, 0.023 * hs, 0, 0.001, 3], [0.0, 0.0085 * hs, 0.019 * hs, 0, 0.001, 3], [0.006 * hs, 0, 0]], { seg: 10, uvs: UVH }));
      this._mesh(hb, palm, skin, { name: 'palm' + s });
      const fingerSeg = (len, w) => tube([[-len, 0, 0], [-len + 0.003 * hs, w * 0.85, w * 0.8], [-0.002 * hs, w, w * 0.95], [0.003 * hs, 0, 0]], { seg: 6 });
      const F = [[0.0155, 0.95, 1.0], [0.005, 1.0, 1.02], [-0.0055, 0.96, 0.98], [-0.0155, 0.8, 0.86]];   // z, length, width
      const pL = 0.025 * hs, dL = 0.022 * hs, w0 = 0.0052 * hs;
      const hand = { bone: hb, rows: [] };
      const knuckleY = -0.052 * hs * H;
      const mkRow = (parent, list, len, name, y) => {
        const piv = new THREE.Object3D(); piv.position.set(0, y, 0); parent.add(piv);
        const g = geo('fing_' + name + hs + list.map((f) => f[0]).join(','), () => merge(list.map(([z, l, w]) => xf(fingerSeg(len * l, w0 * w), [0, 0, z * hs]))));
        this._mesh(piv, g, skin, { name: 'fingers' + s, shadow: false });
        return piv;
      };
      if (low) {
        const p = mkRow(hb, F, pL + dL, 'mitt', knuckleY);
        hand.rows.push({ piv: p, k: 1.2 }); hand.index = null;
      } else {
        const ip = mkRow(hb, [F[0]], pL, 'ip', knuckleY);
        const id = mkRow(ip, [F[0]], dL, 'id', -pL * 0.95 * H);
        const op = mkRow(hb, F.slice(1), pL, 'op', knuckleY);
        let od = mkRow(op, F.slice(1), dL, 'od', -pL * H);
        hand.index = [{ piv: ip, k: 1.45 }, { piv: id, k: 1.35 }];
        hand.rows = [{ piv: op, k: 1.5 }, { piv: od, k: 1.35 }];
        if (P.hands && P.hands.extraKnuckles) {      // the Borrowed: one knuckle too many
          const xm = mkRow(od, F.slice(1), dL, 'ox', -dL * H * 0.95);
          hand.rows.push({ piv: xm, k: 0.9 });
          const xi = mkRow(id, [F[0]], dL, 'ix', -dL * H * 0.95);
          hand.index.push({ piv: xi, k: 0.9 });
        }
        if (P.hands && P.hands.rings) {
          const ringG = geo('ringsOnFingers' + hs, () => merge(F.map(([z]) => xf(new THREE.TorusGeometry(0.0062 * hs, 0.0014 * hs, 5, 10), [0, -0.012 * hs, z * hs], [HALF, 0, 0]))));
          const rm = this.plain('#c8a24a', { rough: 0.3, metal: 0.9 });
          this._mesh(op, ringG, rm, { shadow: false, name: 'rings' });
        }
      }
      // thumb: pivot on the palm side near the wrist, pointing down and forward
      const tp = new THREE.Object3D(); tp.position.set(-sx * 0.006 * hs * H, -0.016 * hs * H, 0.017 * hs * H); hb.add(tp);
      tp.userData.rest = new THREE.Euler(-0.55, 0, -sx * 0.35);
      tp.rotation.copy(tp.userData.rest);
      this._mesh(tp, geo('thumb' + hs, () => merge([xf(fingerSeg(0.022 * hs, 0.0062 * hs), [0, 0, 0]), xf(fingerSeg(0.02 * hs, 0.0056 * hs), [0, -0.02 * hs, 0.0015 * hs], [-0.2, 0, 0])])), skin, { name: 'thumb' + s, shadow: false });
      hand.thumb = tp;
      if (P.hands && P.hands.scraped) {
        const dm = this.decal(scrapeTex(), 'scrape', { alpha: true, rough: 0.7 });
        const me = this._mesh(hb, geo('scrape_plane', () => new THREE.PlaneGeometry(1, 1)), dm, { s: [0.045 * hs * H, 0.022 * hs * H, 1], shadow: false, name: 'scrape' });
        me.position.set(sx * 0.0098 * hs * H, -0.044 * hs * H, 0); me.rotation.set(0, sx * HALF, HALF);
      }
      if (P.hands && P.hands.wristband && s === 'L') {
        const fb = this.bones[pre + 'foreArm' + s];
        this._mesh(fb, geo('wristband', () => tube([[-0.006, 0.0145, 0.0205], [0.006, 0.0145, 0.0205]], { seg: 12 })), this.plain('#f2f0ea', { rough: 0.5, side: 'double' }), { p: [0, (-D.fa + 0.014) * H, 0], name: 'wristband', shadow: false });
      }
      // grip anchor (props attach here): inside the curled fingers
      const grip = new THREE.Object3D(); grip.name = 'grip' + s;
      grip.position.set(-sx * 0.013 * hs * H, -0.06 * hs * H, 0.002 * H);
      hb.add(grip);
      if (!pre) { this.anchors['grip' + s] = grip; this['hand' + s] = hand; }
      else { (this.extraHands = this.extraHands || []).push({ side: s, pre, hand }); }
    }
    // ---- head ------------------------------------------------------------------------------------------------------
    _head() {
      const P = this.P, D = this.D, B = this.bones, H = this.H, u = D.head * H;
      const hs = this.headSpace = new THREE.Group(); hs.name = 'headSpace';
      hs.position.set(0, -HEAD_PIVOT[1] * u, -HEAD_PIVOT[2] * u); hs.scale.setScalar(u);
      B.head.add(hs);
      const skin = this.skinMat(), low = P.detail === 'low';
      const S = low ? 128 : 256, c = TU.mk(S, S), ctx = c.getContext('2d');
      const tex = TU.mkTex(c);
      this.faceCanvas = { canvas: c, ctx, tex, S, repaint: () => this._paintFace(true) };
      this.disposables.push(tex);
      const faceMat = this._mat('face', () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0 }));
      const hg = headGeos();
      this._mesh(hs, hg.front, faceMat, { s: 1, name: 'face' });
      this._mesh(hs, hg.back, skin, { s: 1, name: 'headBack' });
      if (P.faceMode === 'painted') this._mesh(hs, noseGeo(), faceMat, { s: 1, name: 'nose' });
      this.eyeAnchors = {}; this.eyeMesh = {};
      const eyeMeshes = P.faceMode === 'painted' && P.eyes !== false && !low;
      const eyeMat = eyeMeshes ? this._mat('eye', () => new THREE.MeshStandardMaterial({ map: eyeTex(P.face.eyes, P.face.redRim || 0), roughness: 0.22, metalness: 0 })) : null;
      const lidMat = eyeMeshes ? this._mat('lid', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_skin'), color: P.skin, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide })) : null;
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        const g = new THREE.Group(); g.name = 'eye' + s;
        g.position.set(sx * EYE.x, EYE.y, headZ(EYE.x, EYE.y, false) - 0.041);
        hs.add(g); this.eyeAnchors[s] = g;
        // CONTRACT+ actor.eyeFront.{L,R}: points on the eye surface, just in front of the face (eyeAnchors are the
        // eyeballs' pivots inside the head — a sprite parented there is hidden): eye glints, flares
        const f = new THREE.Object3D(); f.name = 'eyeFront' + s; f.position.z = 0.056; g.add(f);
        (this.eyeFront = this.eyeFront || {})[s] = f;
        if (eyeMeshes) {
          const ball = this._mesh(g, eyeGeo(), eyeMat, { s: 1, shadow: false, name: 'eyeball' });
          ball.rotation.order = 'YXZ';
          const up = this._mesh(g, lidGeo(true), lidMat, { s: 1, shadow: false, name: 'lid' });
          const lo = this._mesh(g, lidGeo(false), lidMat, { s: 1, shadow: false, name: 'lid' });
          this.eyeMesh[s] = { ball, up, lo };
        }
      }
      this.paintEyes = P.faceMode === 'painted' && P.eyes !== false && low;
      const fm = new THREE.Object3D(); fm.name = 'faceMount';
      fm.position.set(0, 0.42, headZ(0, 0.42, false) + 0.01); hs.add(fm); this.faceMount = fm;
      // hair / beard / hat
      const hm = this._mat('hair', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_hair'), color: P.hair.color, roughness: P.hair.style === 'ponytail' || P.hair.style === 'neat' ? 0.42 : 0.62, metalness: 0, side: THREE.DoubleSide }));
      this.hairFront = { short_messy: 0.79, crew: 0.815, ponytail: 0.83, receding: 0.92, buzz: 0.8 }[P.hair.style] || 0.8;
      for (const part of hairParts(P.hair.style, P.seed)) {
        if (part.kind === 'tie') { this._mesh(hs, part.geo, this.plain('#151313', { rough: 0.5 }), { s: 1, shadow: false, name: 'hairTie' }); continue; }
        if (part.kind === 'tail') {
          const d = this._dangle(hs, part.at, { limit: [-0.25, 0.7, -0.6, 0.6], stiff: 14, damp: 3, restX: part.rot[0], scale: 1 });
          this._mesh(d, part.geo, hm, { s: 1, name: 'ponytail' });
          continue;
        }
        this._mesh(hs, part.geo, hm, { s: 1, name: 'hair' });
      }
      if (P.beard) {
        const bm = this._mat('beard', () => new THREE.MeshStandardMaterial({ map: Tex.get('rig_hair'), color: mixHex(P.face.beardColor || P.hair.color, P.skin, 0.18), roughness: 0.85, side: THREE.DoubleSide }));
        this._mesh(hs, beardGeo(P.beard, P.seed), bm, { s: 1, name: 'beard', shadow: false });
      }
      if (P.hat === 'flatcap') this._mesh(hs, flatCapGeo(), this.cloth('tweed', P.hatColor || '#5b5146', { rough: 0.95 }), { s: 1, name: 'hat' });
      if (P.jaw) this._jaw(P.jaw);
      this._paintFace(true);
    }
    _jaw(j) {
      const hs = this.headSpace;
      const piv = new THREE.Object3D(); piv.name = 'jaw'; piv.position.set(0, 0.3, 0.02); hs.add(piv);
      this.bones.jaw = piv;
      const g = geo('jaw', () => {
        const R = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; R.push([-t, lerp(0.27, 0.19, t), lerp(0.2, 0.15, t), 0, lerp(0.14, 0.2, t)]); }
        R.reverse(); R.unshift([-1.04, 0, 0, 0, 0.2]); R.push([0.03, 0, 0, 0, 0.14]);
        return tube(R, { seg: 14, uvs: 2 });
      });
      const scaler = new THREE.Object3D(); piv.add(scaler); this._jawScaler = scaler;
      this._mesh(scaler, g, this.skinMat(), { s: 1, name: 'jaw' });
      this._mesh(scaler, geo('jaw_mouth', () => xf(new THREE.BoxGeometry(0.34, 1, 0.08), [0, -0.5, 0.3])), this.plain('#2a0c0c', { rough: 0.8, side: 'double' }), { s: 1, name: 'mouth', shadow: false });
      this.setJaw(j.drop ?? 0.6);
    }
    // CONTRACT+: actor.setJaw(drop) — how far (head heights) the lower jaw hangs (the Reach)
    setJaw(drop) { if (this._jawScaler) { this._jawScaler.scale.set(1, Math.max(0.05, drop), 1); this.jawDrop = drop; } }
    _paintFace(force) {
      const fc = this.faceCanvas; if (!fc) return;
      const P = this.P, F = { ...P.face, skin: P.skin, seed: P.seed, hairColor: P.hair.color, beardColor: P.face.beardColor || P.hair.color };
      const st = this.faceState || { expr: 'neutral', talk: 0 };
      const key = st.expr + '|' + (st.talk > 0.5 ? 1 : 0) + '|' + (st.closed ? 1 : 0) + '|' + (st.tears ? 1 : 0);
      if (!force && key === this._faceKey) return;
      this._faceKey = key;
      F.hairPaint = !['bald', 'receding'].includes(P.hair.style) && !P.hat;
      F.hairFront = this.hairFront;
      F.beardPaint = !!P.beard; F.beardKind = P.beard;
      if (P.faceMode === 'none' || P.faceMode === 'custom') {
        fc.ctx.fillStyle = P.skin; fc.ctx.fillRect(0, 0, fc.S, fc.S);
        const g = fc.ctx.createLinearGradient(0, 0, 0, fc.S); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
        fc.ctx.fillStyle = g; fc.ctx.fillRect(0, 0, fc.S, fc.S);
      } else {
        paintFace(fc.ctx, fc.S, F, { expr: st.expr, talk: st.talk > 0.5 ? 1 : 0, paintEyes: this.paintEyes, closed: st.closed, tears: st.tears });
        if (P.jaw) {   // the jaw hangs below the upper lip: blank the painted mouth/chin
          fc.ctx.fillStyle = shadeHex(P.skin, 0.6);
          fc.ctx.fillRect(FU(-0.16) * fc.S, (1 - FV(0.215)) * fc.S, (FU(0.16) - FU(-0.16)) * fc.S, fc.S);
        }
      }
      fc.tex.needsUpdate = true;
    }
    // ---- accessories ------------------------------------------------------------------------------------------------
    _accessories() {
      const P = this.P, T = this.D.T;
      const R = this.outerChest || chestRings(T, 0.004);
      this._acc = { R, off: 0.0025 };
      if (P.lanyard) this._lanyard(P.lanyard);
      if (P.pendant) this._pendant(P.pendant);
      if (P.badge) this._badge(P.badge, 'badge');
      if (P.visitor) this._badge(P.visitor, 'visitor');
      if (P.toolroll) this._toolroll();
      if (P.beltPhone) this._beltPhone();
      if (P.glasses) this._glasses(P.glasses);
      if (P.earbuds) this._earbuds(P.earbuds);
    }
    // point on the outer chest surface where x = X (H units) at height y; returns metres + normal
    _chestPt(X, y, extra = 0) {
      const { R, off } = this._acc;
      const rx = Math.max(1e-4, surfAt(R, y, HALF, off + extra).p.x);
      const th = Math.asin(clamp(X / rx, -1, 1));
      const s = surfAt(R, y, th, off + extra);
      return { p: s.p.multiplyScalar(this.H), n: s.n };
    }
    // strap from the back of the neck, over the collar, down the chest to (x1, y1): metres, relative to `origin`
    _strapPath(sx, y1, x1, origin, extra = 0) {
      const T = this.D.T, H = this.H, pts = [], ns = [];
      const back = [];
      for (let k = 0; k <= 5; k++) {       // lying loosely on the collar behind the neck
        const a = lerp(PI * 0.98, HALF * 1.05, k / 5), rr = T.neckR * 1.55 + this._acc.off + extra;
        back.push({ p: new THREE.Vector3(sx * Math.sin(a) * rr * H, (0.097 - 0.004 * Math.cos(a)) * H, (Math.cos(a) * rr * 1.05 - 0.012) * H), n: new THREE.Vector3(sx * Math.sin(a), 0.6, Math.cos(a)).normalize() });
      }
      for (const b of back) { pts.push(b.p); ns.push(b.n); }
      const N = 9;
      for (let k = 1; k <= N; k++) {
        const t = k / N, y = lerp(0.09, y1, t), x = lerp(sx * T.neckR * 1.7, x1, smooth(t) * 0.8 + t * 0.2);
        const c = this._chestPt(x, y, extra);
        pts.push(c.p); ns.push(c.n);
      }
      for (const p of pts) p.sub(origin);
      return { pts, ns };
    }
    _lanyard(Ly) {
      const T = this.D.T, H = this.H, B = this.bones;
      const pins = Ly.pins || 0;
      const cardY = Ly.cardY ?? (pins > 10 ? -0.018 : 0.004);
      const origin = new THREE.Vector3(0, 0.098 * H, 0);
      const piv = this._dangle(B.chest, [0, 0.098 * H, 0], { limit: [-1.3, 0.0, -0.55, 0.55], stiff: 16, damp: 3.4, hang: this._chestPt(0, cardY - 0.03).p.sub(origin) });
      this.lanyard = piv;
      const sm = this.plain(Ly.color || '#0f7f7c', { rough: 0.8, side: 'double' });
      const clipY = cardY;
      const strapG = [];
      const paths = [];
      for (const sx of [1, -1]) { const pth = this._strapPath(sx, clipY + 0.004, sx * 0.004, origin); paths.push(pth); strapG.push(ribbon(pth.pts, pth.ns, 0.018)); }
      const straps = merge(strapG); this.disposables.push(straps);
      this._mesh(piv, straps, sm, { s: 1, shadow: false, name: 'lanyard' });
      const cp = this._chestPt(0, clipY, 0.002);
      const clip = new THREE.Group(); clip.position.copy(cp.p).sub(origin); piv.add(clip);
      const up = new THREE.Vector3(0, 1, 0), n = cp.n, xa = new THREE.Vector3().crossVectors(up, n).normalize(), ya = new THREE.Vector3().crossVectors(n, xa).normalize();
      clip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, n));
      this._mesh(clip, geo('lan_clip', () => merge([xf(new THREE.BoxGeometry(0.012, 0.02, 0.004), [0, -0.004, 0.001]), xf(new THREE.TorusGeometry(0.005, 0.0012, 4, 8), [0, 0.006, 0.001])])), this.plain('#8e9092', { rough: 0.35, metal: 0.85 }), { s: 1, shadow: false, name: 'clip' });
      this.anchors.card = clip;
      if (Ly.card !== false) {
        const cardTex = Tex.label(Ly.card || 'STAFF', { style: 'card', role: Ly.role, photo: Ly.photo || shadeHex(this.P.hair.color, 1.2) });
        const white = this.plain('#ecebe6', { rough: 0.35 });
        const front = this._mat('card:' + (Ly.card || ''), () => new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.3, metalness: 0 }));
        this.cardMat = front;
        const cm = new THREE.Mesh(geo('lan_card', () => new THREE.BoxGeometry(0.054, 0.086, 0.0012)), [white, white, white, white, front, white]);
        cm.position.set(0, -0.056, 0.0014); cm.castShadow = false; cm.name = 'card'; clip.add(cm); this.parts.card = cm;
        const sleeve = this._mesh(clip, geo('lan_sleeve', () => new THREE.BoxGeometry(0.06, 0.094, 0.0006)), this.plain('#dfe6e8', { rough: 0.1, transparent: true, opacity: 0.25, depthWrite: false }), { s: 1, shadow: false, name: 'cardSleeve' });
        sleeve.position.set(0, -0.058, 0.0026);
      }
      if (pins > 0) {
        const list = [];
        const r = U.rng(this.P.seed * 13 + 5);
        for (let k = 0; k < pins; k++) {
          const pth = paths[k % 2], i = 7 + Math.floor((k / 2) % (pth.pts.length - 8)) + (r() < 0.5 ? 0 : 1);
          const a = pth.pts[Math.min(i, pth.pts.length - 1)], nn = pth.ns[Math.min(i, pth.ns.length - 1)];
          const jitter = new THREE.Vector3((r() - 0.5) * 0.012, (r() - 0.5) * 0.02, 0);
          const pos = a.clone().add(jitter).addScaledVector(nn, 0.0022);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nn);
          const d = new THREE.CylinderGeometry(0.0052 + r() * 0.0015, 0.0052, 0.0016, 8);
          d.applyQuaternion(q); d.translate(pos.x, pos.y, pos.z);
          list.push(d);
        }
        const pg = merge(list); this.disposables.push(pg);
        this._mesh(piv, pg, this.plain('#c9a13b', { rough: 0.32, metal: 0.85 }), { s: 1, shadow: false, name: 'pins' });
        this.jingle = this.jingle || 'pins';
      }
      if (Ly.keys) {
        const kd = this._dangle(clip, [0.012, -0.004, 0.003], { limit: [-0.9, 0.9, -0.9, 0.9], stiff: 10, damp: 2.2 });
        this._mesh(kd, keysGeo(), this.plain('#a89a74', { rough: 0.35, metal: 0.85, vc: true }), { s: 1, shadow: false, name: 'keys' });
      }
      if (Ly.badge) this._badge(Ly.badge, 'badge');
    }
    _badge(text, style) {
      const B = this.bones;
      const isV = style === 'visitor';
      const c = this._chestPt(isV ? 0.058 : 0.062, isV ? 0.032 : 0.048, 0.0015);
      const w = isV ? 0.085 : 0.074, h = isV ? 0.053 : 0.025;
      const me = this._mesh(B.chest, geo('badge_' + style, () => new THREE.PlaneGeometry(w, h)), this.decal(Tex.label(text, { style }), style + text, { rough: isV ? 0.8 : 0.35, metal: isV ? 0 : 0.15 }), { s: 1, shadow: false, name: style });
      this._orientDecal(me, B.chest, c.p, c.n);
      if (isV) me.rotateZ(-0.09);
    }
    _pendant(pd) {
      const H = this.H, B = this.bones;
      const origin = new THREE.Vector3(0, 0.098 * H, 0);
      const y1 = pd.y ?? 0.02;
      const piv = this._dangle(B.chest, [0, 0.098 * H, 0], { limit: [-1.3, 0, -0.6, 0.6], stiff: 18, damp: 3.5, hang: this._chestPt(0, y1).p.sub(origin) });
      const g = [];
      for (const sx of [1, -1]) { const pth = this._strapPath(sx, y1 + 0.006, sx * 0.002, origin, -0.001); g.push(ribbon(pth.pts, pth.ns, 0.003)); }
      const cord = merge(g); this.disposables.push(cord);
      this._mesh(piv, cord, this.plain(pd.cord || '#1b1b1d', { rough: 0.7, side: 'double' }), { s: 1, shadow: false, name: 'cord' });
      const cp = this._chestPt(0, y1, 0.009);
      const pg = new THREE.Group(); pg.position.copy(cp.p).sub(origin); piv.add(pg);
      pg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cp.n);
      this._mesh(pg, geo('pendant_body', () => tube([[-0.024, 0, 0], [-0.022, 0.014, 0.005, 0, 0, 3], [0.0, 0.017, 0.006, 0, 0, 3], [0.018, 0.014, 0.005, 0, 0, 3], [0.021, 0, 0]], { seg: 12 })), this.plain(pd.color || '#e4e2dc', { rough: 0.4 }), { s: 1, p: [0, -0.012, 0], shadow: false, name: 'pendant' });
      this._mesh(pg, geo('pendant_btn', () => new THREE.CylinderGeometry(0.0085, 0.009, 0.004, 12)), this.plain('#b3261e', { rough: 0.35 }), { s: 1, p: [0, -0.012, 0.0055], r: [HALF, 0, 0], shadow: false, name: 'pendantButton' });
      this.anchors.pendant = pg;
    }
    _toolroll() {
      const T = this.D.T, H = this.H;
      const g = new THREE.Group(); g.position.set(-(T.hipW + 0.012) * H, 0.02 * H, 0.012 * H); g.rotation.set(0.08, 0, 0.06); this.bones.hips.add(g);
      this._mesh(g, geo('toolroll', () => merge([tube([[-0.1, 0, 0], [-0.095, 0.03, 0.034], [0.07, 0.032, 0.036], [0.075, 0, 0]], { seg: 10, uvs: 4 }), xf(new THREE.BoxGeometry(0.066, 0.012, 0.074), [0, 0.02, 0])])), this.cloth('canvas', '#857655', { rough: 0.95 }), { s: 1, name: 'toolroll' });
      this._mesh(g, geo('toolroll_handles', () => {
        const list = [];
        [[-0.014, 0.016, '#6a4a2a'], [0.01, 0.012, '#b3302a'], [0.0, -0.014, '#e0c030'], [-0.018, -0.01, '#303236']].forEach(([x, z, cc]) => list.push(vcol(xf(new THREE.CylinderGeometry(0.006, 0.0065, 0.06, 6), [x, 0.095, z]), () => rgb(cc))));
        return merge(list);
      }), this.plain('#ffffff', { rough: 0.6, vc: true }), { s: 1, shadow: false, name: 'tools' });
    }
    // CONTRACT+ param beltPhone:true — an old candy-bar phone in a worn leather clip pouch on the left hip (Wai, spec
    // §5). A.hold(hand, 'candybar') takes it into the hand (the pouch is left empty) and dropping it puts it back.
    _beltPhone() {
      const T = this.D.T, H = this.H;
      const g = new THREE.Group(); g.name = 'beltPhone';
      // front of the left hip, clipped to the belt and hanging just below a jacket's hem (the arms hide the sides)
      g.position.set(T.hipW * 0.62 * H, -0.03 * H, (T.waistD + 0.018) * H); g.rotation.set(-0.08, 0.35, -0.06); this.bones.hips.add(g);
      this._mesh(g, geo('beltpouch2', () => merge([new THREE.BoxGeometry(0.058, 0.078, 0.028), xf(new THREE.BoxGeometry(0.03, 0.05, 0.004), [0, 0.02, -0.016])])), this.plain('#2e251d', { rough: 0.85 }), { s: 1, p: [0, -0.012, 0], name: 'pouch' });
      const ph = new THREE.Group(); ph.name = 'beltPhoneSet'; ph.position.set(0, 0.026, 0.002); g.add(ph);
      this._mesh(ph, geo('p_candy', () => roundBox(0.047, 0.112, 0.018, 5)), this.plain('#3a3f45', { rough: 0.45, metal: 0.2 }), { s: 1, name: 'beltPhone' });
      this._mesh(ph, geo('p_candy_aerial', () => new THREE.CylinderGeometry(0.004, 0.005, 0.022, 6)), this.plain('#222528', { rough: 0.5 }), { s: 1, p: [0.015, 0.066, 0], shadow: false });
      this._beltPhoneSet = ph;
    }
    _glasses(gl) {
      const hs = this.headSpace, low = gl.low ? 0.045 : 0;
      const grp = new THREE.Group(); grp.name = 'glasses';
      const col = gl.color || '#3a2a20';
      const fm = this.plain(col, { rough: 0.35, metal: gl.metal ? 0.8 : 0.1 });
      const y = EYE.y - low, z = headZ(EYE.x, EYE.y, false) + (gl.low ? 0.085 : 0.07);
      const rx = gl.style === 'round' ? 0.07 : 0.078, ry = gl.style === 'round' ? 0.07 : gl.style === 'reading' ? 0.048 : 0.056;
      const frame = geo('glasses_' + (gl.style || 'square') + (gl.low ? 'l' : ''), () => {
        const ring = (cx) => {
          const pts = [];
          for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU, s = Math.sin(a), c = Math.cos(a); pts.push(new THREE.Vector3(cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 0.7), y + ry * Math.sign(s) * Math.pow(Math.abs(s), 0.7), z)); }
          return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 24, 0.008, 4, true);
        };
        const bridge = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-EYE.x + rx, y + 0.012, z), new THREE.Vector3(0, y + 0.03, z + 0.01), new THREE.Vector3(EYE.x - rx, y + 0.012, z)), 6, 0.007, 4);
        const temple = (sx) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sx * (EYE.x + rx), y + 0.01, z), new THREE.Vector3(sx * 0.3, y + 0.03, z - 0.12), new THREE.Vector3(sx * 0.345, 0.5, -0.06), new THREE.Vector3(sx * 0.335, 0.44, -0.12)]), 10, 0.007, 4);
        return merge([ring(EYE.x), ring(-EYE.x), bridge, temple(1), temple(-1)]);
      });
      this._mesh(grp, frame, fm, { s: 1, shadow: false, name: 'glassesFrame' });
      const lm = this._mat('lens', () => new THREE.MeshStandardMaterial({ color: '#d6e0e2', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.16, depthWrite: false }));
      for (const sx of [1, -1]) this._mesh(grp, geo('lens_' + (gl.style || 'square'), () => new THREE.CircleGeometry(1, 20)), lm, { s: [rx * 0.98, ry * 0.98, 1], p: [sx * EYE.x, y, z + 0.002], shadow: false, name: 'lens' });
      this.glassesObj = grp;
      // (a retainer cord round the back of the neck: opt-in only, never on a preset — spec §1, nothing around necks)
      if (gl.cord) {
        const pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12, a = lerp(-1, 1, t); pts.push(new THREE.Vector3(0.335 * Math.sign(a) * Math.pow(Math.abs(a), 0.35) * 0.98, 0.44 - 0.42 * (1 - a * a) - 0.05, -0.12 - 0.22 * (1 - a * a))); }
        const cg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.006, 4);
        this.disposables.push(cg);
        this._mesh(grp, cg, this.plain('#2a2522', { rough: 0.8 }), { s: 1, shadow: false, name: 'glassesCord' });
      }
      hs.add(grp);
      this._glassesState = 'on';
      if (gl.state === 'hang') this.glassesState('hang');
    }
    // CONTRACT+: glassesState('on'|'hang'|'off') — on the face, hooked into the shirt's placket below the collar (one
    // temple tucked in; nothing round the neck — spec §1), or pocketed
    glassesState(s) {
      const g = this.glassesObj; if (!g) return;
      if (!this._glassHang) {
        const H = this.H;
        this._glassHang = new THREE.Group(); this._glassHang.name = 'glassesClip';
        this._glassHang.position.set(0, 0.098 * H, 0);
        this.bones.chest.add(this._glassHang);
      }
      this._glassesState = s;
      if (s === 'on') { this.headSpace.add(g); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1); g.visible = true; }
      else if (s === 'hang') {
        const u = this.D.head * this.H, cp = this._chestPt(0, 0.02, 0.006).p.sub(new THREE.Vector3(0, 0.098 * this.H, 0));
        const zg = headZ(EYE.x, EYE.y, false) + (this.P.glasses && this.P.glasses.low ? 0.085 : 0.07) - 0.32;
        this._glassHang.add(g); g.scale.setScalar(u); g.rotation.set(0.35, 0, 0);
        g.position.set(cp.x, cp.y - EYE.y * u * Math.cos(0.35) + zg * u * Math.sin(0.35), cp.z - zg * u * Math.cos(0.35) - EYE.y * u * Math.sin(0.35) - 0.055);
        g.visible = true;
      } else g.visible = false;
    }
    _earbuds(state) {
      const hs = this.headSpace;
      const bm = this.plain('#f1f0ec', { rough: 0.3 });
      this.buds = {};
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        const b = new THREE.Group(); b.position.set(sx * 0.33, 0.45, -0.005);
        this._mesh(b, geo('bud', () => merge([new THREE.SphereGeometry(0.032, 8, 6), xf(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), [0, -0.05, 0.01])])), bm, { s: 1, shadow: false, name: 'earbud' });
        hs.add(b); this.buds[s] = b;
      }
      const lm = new THREE.LineBasicMaterial({ color: '#e8e6e0', transparent: true });
      lm.userData.rig = true; this.mats.push(lm);
      this.budLines = [];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
        const ln = new THREE.Line(g, lm); ln.frustumCulled = false; this.body.add(ln); this.budLines.push(ln); this.disposables.push(g);
      }
      this.setEarbuds(state !== 'out');
    }
    // CONTRACT+: setEarbuds(inEars) — Chase's earbuds in the ears, or hanging on the chest
    setEarbuds(on) {
      if (!this.buds) return;
      this.budsIn = !!on;
      const H = this.H, hs = this.headSpace;
      for (const s of ['L', 'R']) {
        const b = this.buds[s], sx = s === 'L' ? 1 : -1;
        if (on) { hs.add(b); b.position.set(sx * 0.33, 0.45, -0.005); b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
        else {
          const cp = this._chestPt(sx * 0.03, 0.03 + (s === 'L' ? 0 : 0.012), 0.004);
          this.bones.chest.add(b); b.position.copy(cp.p); b.scale.setScalar(this.D.head * H); b.rotation.set(0, 0, 0);
        }
      }
    }
    _updateBudLines() {
      if (!this.budLines) return;
      const w = new THREE.Vector3(), inv = this._invBody || (this._invBody = new THREE.Matrix4());
      inv.copy(this.body.matrixWorld).invert();
      const P = (obj, x, y, z) => w.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(inv).clone();
      const H = this.H, T = this.D.T, ch = this.bones.chest, hp = this.bones.hips;
      const junction = P(ch, 0.012 * H, 0.0 * H, (T.chestD + 0.02 + (this.outerOff || 0)) * H);
      const pocket = P(hp, 0.07 * H, 0.0, (T.hipD + 0.012) * H);
      const ends = ['L', 'R'].map((s) => { const b = this.buds[s]; b.updateMatrixWorld(); return P(b, 0, -0.08, 0.01); });
      const curve = (line, pts) => {
        const c = new THREE.CatmullRomCurve3(pts), a = line.geometry.attributes.position;
        for (let i = 0; i < 14; i++) { const p = c.getPoint(i / 13); a.setXYZ(i, p.x, p.y, p.z); }
        a.needsUpdate = true; line.geometry.computeBoundingSphere();
      };
      // In the ears, each cord runs down the side of the neck, over the front of its shoulder and down its own side of
      // the chest; the two meet at the waist (the splitter) — never across the front of the neck (spec §1: nothing
      // around necks; two cords converging under the chin read as a loop there). Out of the ears the buds hang on the
      // chest from the splitter.
      const o2 = this.outerOff || 0, waist = P(hp, 0.05 * H, 0.09 * H, (T.waistD + 0.02) * H);
      for (let k = 0; k < 2; k++) {
        const sx = k === 0 ? 1 : -1;
        if (this.budsIn) {
          const neck = P(ch, sx * (T.neckR + 0.012) * H, 0.15 * H, -0.006 * H);
          const shoulder = P(ch, sx * (T.chestW * 0.62) * H, 0.108 * H, (T.chestD * 0.8 + o2 + 0.008) * H);
          const side = P(ch, sx * (T.chestW * 0.6) * H, 0.0, (T.chestD + o2 + 0.012) * H);
          curve(this.budLines[k], [ends[k], neck, shoulder, side, waist]);
        } else curve(this.budLines[k], [ends[k], junction]);
      }
      curve(this.budLines[2], this.budsIn ? [waist, pocket] : [junction, waist, pocket]);
    }
    // ---- dangles: hanging things that swing with the body and follow gravity ---------------------------------------
    // opts: limit [xMin, xMax, zMin, zMax] (radians relative to rest; −x swings the bottom forward/out), stiff, damp,
    // hang (Vector3: rest hang direction in the parent's space; default straight down), restX/restZ (rest rotation)
    _dangle(parent, pos, o = {}) {
      const g = new THREE.Group(); g.name = 'dangle';
      g.position.set(pos[0], pos[1], pos[2]);
      g.rotation.order = 'XZY';
      parent.add(g);
      const h = (o.hang ? o.hang.clone() : new THREE.Vector3(0, -1, 0)).normalize();
      const d = { obj: g, lim: o.limit || [-0.8, 0.8, -0.8, 0.8], stiff: o.stiff || 14, damp: o.damp || 3, restX: o.restX || 0, restZ: o.restZ || 0,
        h0x: Math.atan2(-h.z, -h.y), h0z: Math.atan2(h.x, -h.y), ax: 0, az: 0, vx: 0, vz: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), init: false, gain: o.gain ?? 0.55 };
      g.rotation.set(d.restX, 0, d.restZ);
      this.dangles.push(d);
      return g;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pose channels: 19 bones × Euler xyz, hip position (H units), finger curls, thumbs, index extension, jaw.
  // Authoring conventions (anatomical, the actor facing +Z, left = +X): torso/head x = bend forward/look down,
  // y = turn to the actor's left, z = lean to the actor's right. arm()/leg() take anatomical values and mirror R.
  // ---------------------------------------------------------------------------------------------------------------
  const BN = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'foreArmL', 'handL', 'shoulderR', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
  const BI = {}; BN.forEach((n, i) => { BI[n] = i * 3; });
  const HPX = BN.length * 3, CUR = HPX + 3;
  const CH = { curlL: CUR, curlR: CUR + 1, thumbL: CUR + 2, thumbR: CUR + 3, indexL: CUR + 4, indexR: CUR + 5, jaw: CUR + 6 };
  const NCH = CUR + 7;
  const newPose = () => new Float32Array(NCH);
  const SIDES = ['L', 'R'];
  const sgn = (s) => (s === 'L' ? 1 : -1);
  function rot(o, b, x, y, z) { const i = BI[b]; o[i] = x; o[i + 1] = y; o[i + 2] = z; }
  function add(o, b, x = 0, y = 0, z = 0) { const i = BI[b]; o[i] += x; o[i + 1] += y; o[i + 2] += z; }
  // pitch: raise forward, abduct: out to the side, elbow: flex, twist: upper-arm external rotation, pron: palm turns
  // back, flex: wrist toward the palm, dev: wrist toward the thumb, shrug, fwd: shoulder rounds forward
  function arm(o, s, { pitch = 0.02, abduct = 0.1, elbow = 0.15, twist = 0, pron = 0, flex = 0, dev = 0, shrug = 0, fwd = 0 } = {}) {
    const k = sgn(s);
    rot(o, 'shoulder' + s, 0, -fwd * k, shrug * k);
    rot(o, 'upperArm' + s, -pitch, twist * k, abduct * k);
    rot(o, 'foreArm' + s, -elbow, -pron * k, 0);
    rot(o, 'hand' + s, -dev, 0, -flex * k);
  }
  // flex: hip flexion (thigh forward), knee: flex, toe: toes down (+) / up (−), out: toes turned out
  function leg(o, s, { flex = 0, abduct = 0, knee = 0, twist = 0, toe = 0, out = 0.1 } = {}) {
    const k = sgn(s);
    rot(o, 'thigh' + s, -flex, twist * k, abduct * k);
    rot(o, 'shin' + s, knee, 0, 0);
    rot(o, 'foot' + s, toe, out * k, 0);
  }
  function fingers(o, s, curl, thumb = curl * 0.7, index = 0) { o[CH['curl' + s]] = curl; o[CH['thumb' + s]] = thumb; o[CH['index' + s]] = index; }
  function basePose(o) {
    o.fill(0);
    rot(o, 'neck', 0.16, 0, 0); rot(o, 'head', -0.16, 0, 0);
    for (const s of SIDES) { arm(o, s, { abduct: 0.1, elbow: 0.14, pitch: 0.02 }); leg(o, s, {}); fingers(o, s, 0.3, 0.25); }
  }
  const lerpPose = (out, b, t) => { for (let i = 0; i < NCH; i++) out[i] += (b[i] - out[i]) * t; };

  // ---- forward kinematics from a pose (body space) -----------------------------------------------------------------
  const ONE = new THREE.Vector3(1, 1, 1);
  const _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion();
  const _M = { a: new THREE.Matrix4(), b: new THREE.Matrix4(), inv: new THREE.Matrix4(), m: new THREE.Matrix4() };
  const _V = Array.from({ length: 16 }, () => new THREE.Vector3());
  function localM(a, o, name, out) {
    const i = BI[name], b = a.bones[name];
    _E.set(o[i], o[i + 1], o[i + 2], b.rotation.order); _Q.setFromEuler(_E);
    const p = _V[0].copy(a.rest[name]);
    if (name === 'hips') { p.x += o[HPX] * a.H; p.y += o[HPX + 1] * a.H; p.z += o[HPX + 2] * a.H; }
    return out.compose(p, _Q, ONE);
  }
  function fkTo(a, o, chain) {
    const F = a.fk; let prev = null;
    for (const n of chain) { localM(a, o, n, F[n]); if (prev) F[n].premultiply(F[prev]); prev = n; }
    return F[prev];
  }
  const CH_TORSO = ['hips', 'spine', 'chest'], CH_HEAD = ['hips', 'spine', 'chest', 'neck', 'head'];
  const CH_ARM = { L: ['hips', 'spine', 'chest', 'shoulderL'], R: ['hips', 'spine', 'chest', 'shoulderR'] };
  // chest-local point (H units) → body space (metres) for pose o
  function chestPt(a, o, x, y, z, out) { const M = fkTo(a, o, CH_TORSO); return out.set(x * a.H, y * a.H, z * a.H).applyMatrix4(M); }
  // head-space point (head units) → body space
  function headPt(a, o, x, y, z, out) {
    const M = fkTo(a, o, CH_HEAD), u = a.D.head * a.H;
    return out.set(x * u, (y - HEAD_PIVOT[1]) * u, (z - HEAD_PIVOT[2]) * u).applyMatrix4(M);
  }
  const chestDir = (a, o, x, y, z, out) => { const M = fkTo(a, o, CH_TORSO); return out.set(x, y, z).transformDirection(M); };

  // ---- two-bone IK (analytic, pole vector) ------------------------------------------------------------------------
  const _ik = { S: new THREE.Vector3(), T: new THREE.Vector3(), P: new THREE.Vector3(), d: new THREE.Vector3(), pn: new THREE.Vector3(), u: new THREE.Vector3(), E: new THREE.Vector3(), f: new THREE.Vector3(), w: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), q: new THREE.Quaternion() };
  // returns the bend angle; _ik.q = first bone's local rotation. knee: bends toward local −Z (legs) instead of +Z (arms)
  function twoBone(parentM, restPos, L1, L2, target, pole, knee) {
    const k = _ik;
    _M.inv.copy(parentM).invert();
    k.T.copy(target).applyMatrix4(_M.inv);
    k.P.copy(pole).transformDirection(_M.inv);
    k.S.copy(restPos);
    k.d.subVectors(k.T, k.S);
    let D = k.d.length();
    if (D < 1e-6) { k.d.set(0, -1, 0); D = 1e-6; } else k.d.divideScalar(D);
    D = clamp(D, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
    const bend = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const A = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    k.pn.copy(k.P).addScaledVector(k.d, -k.P.dot(k.d));
    if (k.pn.lengthSq() < 1e-8) { k.pn.set(0, 0, 1).addScaledVector(k.d, -k.d.z); if (k.pn.lengthSq() < 1e-8) k.pn.set(1, 0, 0); }
    k.pn.normalize();
    k.u.copy(k.d).multiplyScalar(Math.cos(A)).addScaledVector(k.pn, Math.sin(A)).normalize();
    k.E.copy(k.S).addScaledVector(k.u, L1);
    k.f.copy(k.S).addScaledVector(k.d, D).sub(k.E).normalize();
    k.w.copy(k.f).addScaledVector(k.u, -k.f.dot(k.u));
    if (k.w.lengthSq() < 1e-8) k.w.copy(k.pn).negate();
    k.w.normalize();
    k.Y.copy(k.u).negate();
    k.Z.copy(k.w); if (knee) k.Z.negate();
    k.X.crossVectors(k.Y, k.Z).normalize();
    k.Z.crossVectors(k.X, k.Y).normalize();
    _M.m.makeBasis(k.X, k.Y, k.Z);
    k.q.setFromRotationMatrix(_M.m);
    return bend;
  }
  function setRotQ(o, a, name, q) { _E.setFromQuaternion(q, a.bones[name].rotation.order); const i = BI[name]; o[i] = _E.x; o[i + 1] = _E.y; o[i + 2] = _E.z; }
  // arm IK: wrist target / elbow pole in body space (metres / direction). hand: {fing, palm} body-space directions
  function armIK(a, o, s, target, pole, hand) {
    const parentM = fkTo(a, o, CH_ARM[s]);
    const bend = twoBone(parentM, a.rest['upperArm' + s], a.D.ua * a.H, a.D.fa * a.H, target, pole, false);
    setRotQ(o, a, 'upperArm' + s, _ik.q);
    const j = BI['foreArm' + s]; o[j] = -bend; o[j + 2] = 0;
    if (hand) handOrient(a, o, s, hand.fing, hand.palm);
  }
  function handOrient(a, o, s, fing, palm) {
    const F = a.fk;
    localM(a, o, 'upperArm' + s, _M.a); _M.a.premultiply(F['shoulder' + s]);
    localM(a, o, 'foreArm' + s, _M.b); _M.b.premultiply(_M.a);
    _Q2.setFromRotationMatrix(_M.b).invert();
    const Y = _V[12].copy(fing).normalize().negate();
    const X = _V[13].copy(palm).normalize().multiplyScalar(s === 'L' ? -1 : 1);
    X.addScaledVector(Y, -X.dot(Y));
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize();
    const Z = _V[14].crossVectors(X, Y).normalize();
    _M.m.makeBasis(X, Y, Z);
    _Q.setFromRotationMatrix(_M.m).premultiply(_Q2);
    _E.setFromQuaternion(_Q, 'XZY');
    const i = BI['hand' + s];
    o[i] = clamp(_E.x, -1.3, 1.3); o[i + 1] = clamp(_E.y, -1.7, 1.7); o[i + 2] = clamp(_E.z, -1.4, 1.4);
  }
  // leg IK: ankle target (body space, metres), toe pitch (+ = toes down) and yaw in body space; knees follow the toes
  function legIK(a, o, s, ankle, toeDown = 0, yaw = 0, pole) {
    const hipsM = fkTo(a, o, ['hips']);
    const sx = sgn(s);
    const pv = pole || _V[6].set(Math.sin(yaw) * 0.6 + sx * 0.05, 0, 1);
    const bend = twoBone(hipsM, a.rest['thigh' + s], a.D.thigh * a.H, a.D.shin * a.H, ankle, pv, true);
    setRotQ(o, a, 'thigh' + s, _ik.q);
    rot(o, 'shin' + s, bend, 0, 0);
    localM(a, o, 'thigh' + s, _M.a); _M.a.premultiply(hipsM);
    localM(a, o, 'shin' + s, _M.b); _M.b.premultiply(_M.a);
    _Q2.setFromRotationMatrix(_M.b).invert();
    _E.set(toeDown, yaw, 0, 'YXZ'); _Q.setFromEuler(_E).premultiply(_Q2);
    setRotQ(o, a, 'foot' + s, _Q);
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const P3 = (a, x, y, z, out) => out.set(x * a.H, y * a.H, z * a.H);       // H units → body metres

  // ---- gait -----------------------------------------------------------------------------------------------------
  function footTraj(q, beta, sweep, runK) {
    const hb = 0.034, bf = 0.075, ah = 0.045;
    const rock = runK < 0.5 ? 0.15 : 0.001, off = lerp(0.62, 0.45, runK);
    const stance = (qq) => {
      const s = qq / beta, heelZ = sweep / 2 - sweep * s;
      if (s < rock) { const th = 0.28 * (1 - s / rock); return [heelZ + hb * Math.cos(th) - ah * Math.sin(th), hb * Math.sin(th) + ah * Math.cos(th), -th]; }
      if (s < off) return [heelZ + hb, ah, 0];
      const ph = lerp(0.6, 1.0, runK) * (s - off) / (1 - off), ballZ = heelZ + hb + bf;
      return [ballZ - bf * Math.cos(ph) + ah * Math.sin(ph), bf * Math.sin(ph) + ah * Math.cos(ph), ph];
    };
    if (q < beta) return stance(q);
    const u = (q - beta) / (1 - beta), A = stance(beta - 1e-5), B = stance(0);
    const e = 0.5 - 0.5 * Math.cos(PI * u);
    const lift = lerp(0.045, 0.17, runK) * Math.sin(PI * Math.pow(u, lerp(1, 0.55, runK)));
    return [lerp(A[0], B[0], e), lerp(A[1], B[1], u) + lift, lerp(A[2], B[2], u) - 0.15 * Math.sin(PI * u)];
  }
  const stepLenFor = (a, v, runK) => lerp(0.41 * a.style.stepLen * Math.pow(Math.max(0.2, v) / 1.35, 0.35), 0.56 * Math.pow(Math.max(0.5, v) / 3.2, 0.45), runK);
  function gait(o, a, st, runK, bad = 0, wobble = 0) {
    const D = a.D, H = a.H, sty = a.style, p = st.phase, v = st.gSpeed;
    basePose(o);
    const beta = lerp(0.62, 0.36, runK), mid = beta / 2;
    const stride = stepLenFor(a, v, runK), sweep = stride * 2 * beta;
    const heavy = sty.heavy, hunch = a.P.hunch;
    const bobA = lerp(0.012, 0.022, runK) * sty.bounce * (0.5 + 0.5 * Math.min(1, v / 1.2));
    const c4 = Math.cos(4 * PI * (p - mid));
    let hipY = lerp(-0.012, -0.03, runK) - heavy * 0.008 - hunch * 0.03 - bad * 0.012;
    hipY -= runK < 0.5 ? bobA * (0.5 - 0.5 * c4) : bobA * (0.5 + 0.5 * c4);
    o[HPX + 1] = hipY;
    o[HPX] = lerp(0.012, 0.006, runK) * (1 + heavy) * Math.cos(TAU * (p - mid)) + wobble * 0.02 * Math.sin(st.t * 1.7);
    o[HPX + 2] = runK * 0.02;
    const cp = Math.cos(TAU * p), yawA = lerp(0.07, 0.12, runK) * (1 - bad * 0.6);
    rot(o, 'hips', lerp(0.02, 0.1, runK), -yawA * cp, 0.05 * Math.cos(TAU * (p - mid)) * (1 + heavy));
    rot(o, 'spine', lerp(0.03, 0.08, runK) + bad * 0.06, yawA * 0.6 * cp, -0.02 * Math.cos(TAU * (p - mid)) + wobble * 0.08 * Math.sin(st.t * 1.3));
    rot(o, 'chest', lerp(0.01, 0.06, runK) + bad * 0.05, yawA * 0.8 * cp * (1 - bad * 0.5), wobble * 0.05 * Math.sin(st.t * 2.1));
    rot(o, 'neck', 0.16 + runK * 0.05 + bad * 0.1, -yawA * 0.7 * cp, 0);
    rot(o, 'head', -0.16 - lerp(0.04, 0.22, runK) - bad * 0.05, -yawA * 0.5 * cp, 0);
    const nar = (1 - sty.narrow * 0.55) * (1 - runK * 0.3) * (1 + heavy * 0.15);
    for (const s of SIDES) {
      const sx = sgn(s), q = s === 'L' ? p : (p + 0.5) % 1;
      const f = footTraj(q, beta, sweep * (s === 'R' ? 1 - bad * 0.12 : 1), runK);
      legIK(a, o, s, P3(a, sx * D.hipX * nar, f[1], f[0] + o[HPX + 2], _V[5]), f[2], sx * (0.1 + bad * 0.12));
    }
    const sw = lerp(0.3, 0.55, runK) * sty.armSwing * (0.35 + 0.65 * Math.min(1, v / 1.3));
    for (const s of SIDES) {
      const ph = s === 'L' ? -cp : cp;
      arm(o, s, {
        pitch: ph * sw * (1 - bad * 0.75) + runK * 0.12 + bad * 0.1,
        abduct: lerp(0.11, 0.16, runK) - bad * 0.08,
        elbow: lerp(0.22 + 0.3 * Math.max(0, ph), 1.4 + 0.25 * ph, runK) + bad * 0.55,
        twist: runK * 0.2 - bad * 0.2, shrug: bad * 0.14 + sty.tension * 0.04, fwd: bad * 0.12,
      });
      fingers(o, s, lerp(0.3, 0.7, runK) + bad * 0.25, 0.35);
    }
  }
  // quiet standing: weight on one leg (st.stanceW: +1 = left), feet planted by IK
  function stand(o, a, st, k = {}) {
    basePose(o);
    const D = a.D, w = st.stanceW * (k.still ? 0.25 : 1), hunch = a.P.hunch + (k.hunch || 0);
    o[HPX] = w * 0.013; o[HPX + 1] = -0.003 - Math.abs(w) * 0.004 - hunch * 0.03 - (a.style.heavy * 0.004);
    rot(o, 'hips', 0, w * 0.05, -w * 0.035);
    rot(o, 'spine', 0.01, -w * 0.025, w * 0.035);
    rot(o, 'chest', 0, -w * 0.02, w * 0.01);
    const free = w >= 0 ? 'R' : 'L', wide = k.wide || 0;
    for (const s of SIDES) {
      const sx = sgn(s), f = s === free ? Math.abs(w) : 0;
      legIK(a, o, s, P3(a, sx * (D.hipX + f * 0.012 + wide), 0.045 + f * 0.007, f * 0.034 + (k.footZ || 0) * sx, _V[5]), f * 0.12, sx * (0.08 + f * 0.08));
    }
  }
  // seated on a chair/bench (st.seat in metres): feet on the floor, hands on the thighs
  function seated(o, a, L, k = {}) {
    basePose(o);
    const D = a.D, H = a.H, seat = (L.opts.seat ?? a.seatHeight) / H, hipJ = seat + 0.058;
    o[HPX + 1] = hipJ - D.hipJoint;
    rot(o, 'hips', -0.12 + (k.hips || 0), 0, 0);
    rot(o, 'spine', 0.1 + (k.spine || 0), 0, 0);
    rot(o, 'chest', 0.08 + (k.chest || 0), 0, 0);
    const kneeZ = D.thigh * 0.9;
    for (const s of SIDES) {
      const sx = sgn(s);
      legIK(a, o, s, P3(a, sx * (D.hipX + 0.012 + (k.wide || 0)), 0.045, Math.max(0.12, kneeZ + (k.footZ || 0)), _V[5]), -0.05, sx * 0.14, _V[7].set(sx * 0.1, 0.3, 1));
    }
    return hipJ;
  }
  function handsOnThighs(a, o, hipJ, z = 0.55) {
    const D = a.D;
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * (D.hipX + 0.004), hipJ + 0.052, D.thigh * z, _V[8]), _V[9].set(sx * 0.7, -0.2, -1), { fing: _V[10].set(-sx * 0.15, -0.35, 1), palm: _V[11].set(0, -1, 0.1) });
      fingers(o, s, 0.25, 0.2);
    }
  }

  // ---- loops ------------------------------------------------------------------------------------------------------
  // def: { fn(o, a, st, L), gait: runK (drives the shared gait phase), arms:'free'|'own' (own → carry poses off),
  //        life: breathing/sway 0..1, lean: posture/slouch factor 0..1, still: no habits/weight shifts }
  const LOOPS = {};
  function defAnim(name, def) { LOOPS[name] = { arms: 'free', life: 1, lean: 1, gait: null, ...def, name }; }
  // walking auto-blend for standing loops: when the body is carried along (scripts moving root) the feet step
  function standLoop(o, a, st, L, k) {
    stand(o, a, st, k);
    const mv = clamp((Math.max(st.speed, Math.abs(st.yawRate) * 0.3) - 0.25) / 0.6) * (k.still ? 0 : 1);
    if (mv > 0.01) { const t = a.tmp2; gait(t, a, st, 0); lerpPose(o, t, mv); }
  }
  defAnim('idle', { fn(o, a, st, L) { standLoop(o, a, st, L, {}); } });
  defAnim('stand_still', { life: 0.25, still: true, fn(o, a, st, L) { standLoop(o, a, st, L, { still: true }); } });
  defAnim('idle_hunched', {
    fn(o, a, st, L) {
      standLoop(o, a, st, L, { hunch: 0.25 });
      add(o, 'spine', 0.14, 0, 0); add(o, 'chest', 0.18, 0, 0); add(o, 'neck', 0.12, 0, 0); add(o, 'head', -0.12, 0, 0);
      for (const s of SIDES) { const k = sgn(s); add(o, 'shoulder' + s, 0, -0.18 * k, 0.07 * k); }
      if (!a._carryBoth()) for (const s of SIDES) {
        const sx = sgn(s);
        armIK(a, o, s, chestPt(a, o, sx * 0.03, -0.2, a.D.T.chestD + 0.06, _V[8]), chestDir(a, o, sx, -0.6, -0.4, _V[9]), { fing: chestDir(a, o, -sx * 0.6, -0.5, 0.5, _V[10]), palm: chestDir(a, o, -sx, 0.1, -0.3, _V[11]) });
        fingers(o, s, 0.55, 0.4);
      }
    },
  });
  defAnim('walk', { gait: 0, fn(o, a, st, L) { gait(o, a, st, 0); } });
  defAnim('run', { gait: 1, fn(o, a, st, L) { gait(o, a, st, 1, a.style.runBad * clamp(1 - a.posture * 0.85)); } });
  defAnim('run_bad', { gait: 1, fn(o, a, st, L) { gait(o, a, st, 1, 1); } });
  defAnim('stagger', { gait: 0.1, life: 1.4, fn(o, a, st, L) {
    gait(o, a, st, 0.1, 0.3, 1);
    const n = Math.sin(st.t * 2.3) * 0.5 + Math.sin(st.t * 3.7 + 1) * 0.5;
    o[HPX + 1] -= 0.012 + 0.012 * Math.max(0, n);
    arm(o, 'L', { pitch: 0.25, abduct: 0.55 + 0.2 * n, elbow: 0.5 });
    add(o, 'spine', 0.12, 0.1 * n, 0.08 * n); add(o, 'head', 0.1, 0, -0.1 * n);
  } });
  defAnim('pace', { gait: 0, fn(o, a, st, L) {
    const t = a.style.tension;
    if (st.pace.turning > 0) standLoop(o, a, st, L, {}); else gait(o, a, st, 0);
    add(o, 'chest', 0.06, 0, 0); add(o, 'neck', 0.08, 0, 0); add(o, 'head', 0.05, 0, 0);
    for (const s of SIDES) { const k = sgn(s); add(o, 'shoulder' + s, 0, -0.1 * k, (0.06 + t * 0.05) * k); }
  } });
  defAnim('sit', { fn(o, a, st, L) { const h = seated(o, a, L); if (!a._carryBoth()) handsOnThighs(a, o, h); } });
  defAnim('sit_lean', { fn(o, a, st, L) {         // Luka: forward, elbows on knees
    const h = seated(o, a, L, { hips: 0.05, spine: 0.28, chest: 0.28, footZ: -0.02, wide: 0.012 });
    rot(o, 'neck', 0.05, 0, 0); rot(o, 'head', -0.5, 0, 0);
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * 0.018, h + 0.02, a.D.thigh * 0.86, _V[8]), _V[9].set(sx * 0.4, -1, 0.2), { fing: _V[10].set(-sx, -0.4, 0.3), palm: _V[11].set(-sx, 0, 0) });
      fingers(o, s, 0.5, 0.4);
    }
  } });
  defAnim('sit_floor', { lean: 0.4, fn(o, a, st, L) {
    basePose(o);
    const D = a.D;
    o[HPX + 1] = 0.072 - D.hipJoint; o[HPX + 2] = 0;
    rot(o, 'hips', -0.32, 0, 0); rot(o, 'spine', -0.02, 0, 0); rot(o, 'chest', 0.06, 0, 0); rot(o, 'neck', 0.22, 0.08, 0); rot(o, 'head', -0.02, 0.05, 0.05);
    legIK(a, o, 'L', P3(a, D.hipX * 1.25, 0.04, D.thigh + D.shin * 0.92, _V[5]), -0.8, 0.25);
    legIK(a, o, 'R', P3(a, -D.hipX * 1.15, 0.045, 0.24, _V[5]), 0.15, -0.2);
    if (!a._carryBoth()) {
      armIK(a, o, 'R', P3(a, -D.hipX * 1.1, 0.33, 0.2, _V[8]), _V[9].set(-1, -0.3, -0.2), { fing: _V[10].set(0.3, -0.8, 0.5), palm: _V[11].set(-0.3, 0, 1) });
      armIK(a, o, 'L', P3(a, D.hipX * 2.4, 0.05, 0.06, _V[8]), _V[9].set(1, 0, -1), { fing: _V[10].set(0.3, -0.2, 1), palm: _V[11].set(0, -1, 0) });
      fingers(o, 'R', 0.45); fingers(o, 'L', 0.25);
    }
  } });
  defAnim('sit_knees', { lean: 0.3, fn(o, a, st, L) {          // hugging the knees
    basePose(o);
    const D = a.D;
    o[HPX + 1] = 0.07 - D.hipJoint;
    rot(o, 'hips', -0.18, 0, 0); rot(o, 'spine', 0.3, 0, 0); rot(o, 'chest', 0.32, 0, 0); rot(o, 'neck', 0.3, 0, 0); rot(o, 'head', 0.12, 0, 0);
    for (const s of SIDES) legIK(a, o, s, P3(a, sgn(s) * D.hipX * 0.85, 0.045, 0.2, _V[5]), 0.2, sgn(s) * 0.12);
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, -sx * 0.02, 0.2, 0.29, _V[8]), _V[9].set(sx, -0.2, -0.2), { fing: _V[10].set(-sx, -0.3, -0.2), palm: _V[11].set(0, 0, -1) });
      fingers(o, s, 0.55, 0.5);
    }
  } });
  defAnim('sit_bed', { lean: 0.3, fn(o, a, st, L) {            // propped up in bed, legs out straight
    basePose(o);
    const D = a.D;
    o[HPX + 1] = 0.075 - D.hipJoint;
    rot(o, 'hips', -0.42, 0, 0); rot(o, 'spine', 0.04, 0, 0); rot(o, 'chest', 0.06, 0, 0); rot(o, 'neck', 0.24, 0, 0); rot(o, 'head', 0.02, 0, 0);
    for (const s of SIDES) { const sx = sgn(s); legIK(a, o, s, P3(a, sx * D.hipX * 0.9, 0.06, D.thigh + D.shin * 0.96, _V[5]), -1.2, sx * 0.3); }
    if (!a._carryBoth()) for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * 0.05, 0.17, 0.2, _V[8]), _V[9].set(sx, 0, -0.6), { fing: _V[10].set(-sx * 0.4, -0.2, 1), palm: _V[11].set(0, -1, 0) });
      fingers(o, s, 0.35);
    }
  } });
  defAnim('kneel', { fn(o, a, st, L) {
    basePose(o);
    const D = a.D;
    o[HPX + 1] = 0.028 + D.thigh * 0.98 - D.hipJoint; o[HPX + 2] = -0.02;
    rot(o, 'hips', 0.06, 0, 0); rot(o, 'spine', 0.06, 0, 0); rot(o, 'chest', 0.05, 0, 0);
    for (const s of SIDES) leg(o, s, { flex: 0.12, knee: 1.62, toe: 1.25, abduct: 0.04, out: 0.05 });
    if (!a._carryBoth()) handsOnThighs(a, o, 0.028 + D.thigh * 0.98 - 0.03, 0.35);
  } });
  defAnim('kneel_one', { fn(o, a, st, L) {
    basePose(o);
    const D = a.D, hj = 0.03 + D.thigh * 0.97;
    o[HPX + 1] = hj - D.hipJoint; o[HPX + 2] = -0.03;
    rot(o, 'hips', 0.05, 0.08, 0); rot(o, 'spine', 0.12, -0.05, 0); rot(o, 'chest', 0.06, 0, 0);
    leg(o, 'L', { flex: 0.1, knee: 1.6, toe: 0.6, out: 0.1 });
    legIK(a, o, 'R', P3(a, -D.hipX * 1.2, 0.045, 0.3, _V[5]), 0, -0.1);
    if (!a._carryBoth()) {
      armIK(a, o, 'R', P3(a, -D.hipX * 1.15, hj + 0.03, 0.27, _V[8]), _V[9].set(-1, -0.2, -0.5), { fing: _V[10].set(0.2, -0.5, 1), palm: _V[11].set(0, -1, 0) });
      armIK(a, o, 'L', P3(a, D.hipX * 1.6, hj - 0.02, 0.12, _V[8]), _V[9].set(1, 0, -1), { fing: _V[10].set(0, -1, 0.3), palm: _V[11].set(-1, 0, 0) });
    }
  } });
  defAnim('crouch', { fn(o, a, st, L) {
    basePose(o);
    const D = a.D;
    o[HPX + 1] = -0.21; o[HPX + 2] = -0.05;
    rot(o, 'hips', 0.35, 0, 0); rot(o, 'spine', 0.22, 0, 0); rot(o, 'chest', 0.12, 0, 0); rot(o, 'neck', 0.0, 0, 0); rot(o, 'head', -0.45, 0, 0);
    for (const s of SIDES) legIK(a, o, s, P3(a, sgn(s) * D.hipX * 1.35, 0.07, 0.05, _V[5]), 0.35, sgn(s) * 0.3);
    if (!a._carryBoth()) for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * D.hipX * 1.1, 0.33, 0.25, _V[8]), _V[9].set(sx, -0.3, -0.4), { fing: _V[10].set(-sx * 0.3, -0.6, 1), palm: _V[11].set(-sx * 0.3, -1, 0) });
      fingers(o, s, 0.45);
    }
  } });
  defAnim('cower', { life: 1.6, arms: 'own', fn(o, a, st, L) {
    basePose(o);
    const D = a.D, tr = Math.sin(st.t * 23) * 0.012;
    o[HPX + 1] = -0.2; o[HPX + 2] = -0.04;
    rot(o, 'hips', 0.3, 0.2, 0); rot(o, 'spine', 0.3, 0.2, 0); rot(o, 'chest', 0.2, 0.15, 0); rot(o, 'neck', 0.3, 0, 0); rot(o, 'head', 0.2, 0.2, 0);
    for (const s of SIDES) legIK(a, o, s, P3(a, sgn(s) * D.hipX * 1.3, 0.07, 0.06, _V[5]), 0.3, sgn(s) * 0.3);
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, headPt(a, o, sx * 0.25, 0.85 + tr * 5, 0.25, _V[8]), chestDir(a, o, sx, 0.2, 0.3, _V[9]), { fing: chestDir(a, o, -sx * 0.3, 0.6, -0.4, _V[10]), palm: chestDir(a, o, -sx * 0.5, -0.3, -0.6, _V[11]) });
      fingers(o, s, 0.5);
    }
  } });
  defAnim('lie', { lean: 0, life: 0.7, arms: 'own', fn(o, a, st, L) {         // on the back, head toward −Z
    basePose(o);
    const D = a.D;
    o[HPX + 1] = D.T.hipD + 0.004 - D.pelvisY; o[HPX + 2] = 0;
    rot(o, 'hips', -HALF + 0.02, 0, 0); rot(o, 'spine', -0.03, 0, 0); rot(o, 'chest', -0.02, 0, 0); rot(o, 'neck', 0.05, 0, 0); rot(o, 'head', -0.12, 0.15, 0);
    for (const s of SIDES) { leg(o, s, { flex: -0.04, knee: 0.08, toe: -0.25, out: 0.45, abduct: 0.06 }); arm(o, s, { pitch: -0.06, abduct: 0.18, elbow: 0.25, pron: -0.6 }); fingers(o, s, 0.35); }
  } });
  defAnim('lie_side', { lean: 0, life: 0.7, arms: 'own', fn(o, a, st, L) {   // curled on the right side
    basePose(o);
    const D = a.D;
    o[HPX] = -0.0; o[HPX + 1] = D.T.hipW - D.pelvisY + 0.004; o[HPX + 2] = 0;
    rot(o, 'hips', 0.25, 0, HALF); rot(o, 'spine', 0.18, 0, -0.06); rot(o, 'chest', 0.15, 0, -0.08); rot(o, 'neck', 0.15, 0, -0.25); rot(o, 'head', 0.05, 0, -0.1);
    leg(o, 'R', { flex: 0.9, knee: 1.3, toe: 0.4, abduct: 0 });
    leg(o, 'L', { flex: 1.15, knee: 1.5, toe: 0.4, abduct: 0.05 });
    arm(o, 'R', { pitch: 1.3, abduct: 0.1, elbow: 1.7, pron: 0.5 });
    arm(o, 'L', { pitch: 0.6, abduct: 0.05, elbow: 1.2, pron: 0.8 });
    fingers(o, 'L', 0.5); fingers(o, 'R', 0.6);
  } });
  defAnim('collapse', { lean: 0, life: 0.8, arms: 'own', fn(o, a, st, L) {
    const t = L.t, k = [0, 0.38, 0.85, 1.45];
    const Bp = a.tmp3;
    const pose = (i, out) => {
      if (i === 0) stand(out, a, st, {});
      else if (i === 1) { LOOPS.crouch.fn(out, a, st, L); add(out, 'spine', 0.2, 0, 0.1); arm(out, 'L', { pitch: 0.4, abduct: 0.5, elbow: 0.4 }); arm(out, 'R', { pitch: 0.3, abduct: 0.4, elbow: 0.3 }); }
      else if (i === 2) { LOOPS.kneel.fn(out, a, st, L); add(out, 'spine', 0.4, 0, 0.2); add(out, 'chest', 0.2, 0, 0.1); add(out, 'hips', 0, 0, 0.3); arm(out, 'R', { pitch: 0.6, abduct: 0.4, elbow: 0.3 }); arm(out, 'L', { pitch: 0.2, abduct: 0.3, elbow: 0.2 }); }
      else LOOPS.lie_side.fn(out, a, st, L);
    };
    let i = 0; while (i < k.length - 1 && t > k[i + 1]) i++;
    if (i >= k.length - 1) { pose(3, o); return; }
    pose(i, o); pose(i + 1, Bp);
    lerpPose(o, Bp, U.ease.inOut(clamp((t - k[i]) / (k[i + 1] - k[i]))));
  } });
  defAnim('climb', { gait: null, arms: 'own', lean: 0.2, fn(o, a, st, L) {   // ladder in front (+Z); st.climb phase
    basePose(o);
    const D = a.D, p = st.climbPhase, rung = 0.3 / a.H;
    o[HPX + 2] = -0.02;
    rot(o, 'hips', 0.08, 0, 0); rot(o, 'spine', 0.02, 0, 0); rot(o, 'chest', -0.04, 0, 0); rot(o, 'neck', 0.0, 0, 0); rot(o, 'head', -0.22, 0, 0);
    const lz = 0.19;
    for (const s of SIDES) {
      const sx = sgn(s), q = (p + (s === 'L' ? 0 : 0.5)) % 1;
      // hands: grab high, pull down (stance 0..0.6), reach up (0.6..1)
      const hq = q < 0.6 ? q / 0.6 : 0, hy = q < 0.6 ? lerp(0.98, 0.98 - rung * 2 * 0.6 / 0.6, hq) : lerp(0.98 - rung * 2, 0.98, (q - 0.6) / 0.4);
      const hz = q < 0.6 ? lz : lz - 0.05 * Math.sin(PI * (q - 0.6) / 0.4);
      armIK(a, o, s, P3(a, sx * 0.12, hy, hz, _V[8]), _V[9].set(sx, -0.5, -0.3), { fing: _V[10].set(0, 0.2, 1), palm: _V[11].set(0, -0.2, 1) });
      fingers(o, s, q < 0.6 ? 0.85 : 0.2, 0.6);
      const fq = (q + 0.5) % 1, fy = fq < 0.6 ? lerp(0.24, 0.24 - rung * 2 * 0.6 / 0.6, fq / 0.6) : lerp(0.24 - rung * 2, 0.24, (fq - 0.6) / 0.4) + 0.03 * Math.sin(PI * (fq - 0.6) / 0.4);
      legIK(a, o, s, P3(a, sx * D.hipX * 0.9, Math.max(0.045, fy + 0.045 - 0.1), lz - 0.06, _V[5]), 0.05, sx * 0.1);
    }
  } });
  defAnim('crawl', { gait: null, arms: 'own', lean: 0, fn(o, a, st, L) {   // hands and knees, toward +Z
    basePose(o);
    const D = a.D, p = st.crawlPhase, hj = D.thigh * 0.94 + 0.03;
    o[HPX + 1] = hj - D.hipJoint; o[HPX + 2] = -0.12;
    const sway = Math.sin(TAU * p);
    rot(o, 'hips', 1.38, 0.06 * sway, 0); rot(o, 'spine', 0.05, -0.05 * sway, 0); rot(o, 'chest', 0.08, -0.04 * sway, 0); rot(o, 'neck', -0.55, 0, 0); rot(o, 'head', -0.75, 0, 0);
    const amp = 0.075;
    for (const s of SIDES) {
      const sx = sgn(s), q = (p + (s === 'L' ? 0 : 0.5)) % 1;
      const stz = q < 0.65 ? lerp(amp, -amp, q / 0.65) : lerp(-amp, amp, (q - 0.65) / 0.35), lift = q < 0.65 ? 0 : Math.sin(PI * (q - 0.65) / 0.35) * 0.03;
      // knee on the ground (ankle behind it), hands under the shoulders
      const kq = (q + 0.5) % 1, kz = kq < 0.65 ? lerp(amp, -amp, kq / 0.65) : lerp(-amp, amp, (kq - 0.65) / 0.35), kl = kq < 0.65 ? 0 : Math.sin(PI * (kq - 0.65) / 0.35) * 0.025;
      legIK(a, o, s, P3(a, sx * D.hipX * 1.1, 0.05 + kl, -0.12 - D.shin * 0.92 + kz, _V[5]), 1.35, 0, _V[7].set(0, -1, 0.2));
      const sh = chestPt(a, o, sx * a.D.shX, 0.06, 0.02, _V[4]);
      armIK(a, o, s, _V[8].set(sh.x, (0.03 + lift) * a.H, sh.z + stz * a.H), _V[9].set(sx * 0.3, 0, -1), { fing: _V[10].set(-sx * 0.2, 0, 1), palm: _V[11].set(0, -1, 0) });
      fingers(o, s, 0.12, 0.1);
    }
  } });
  defAnim('type', { arms: 'own', fn(o, a, st, L) {
    const D = a.D, H = a.H;
    let deskY = (L.opts.desk ?? 0.73) / H;
    if (L.opts.seated === false) { stand(o, a, st, {}); add(o, 'spine', 0.12, 0, 0); add(o, 'chest', 0.06, 0, 0); deskY = (L.opts.desk ?? 0.98) / H; }
    else seated(o, a, L, { spine: 0.06, chest: 0.05 });
    add(o, 'neck', 0.06, 0, 0); add(o, 'head', 0.1, 0, 0);
    const pause = Math.sin(st.t * 0.7 + a.n) > 0.55;
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * 0.075, deskY + 0.03, 0.2 + (L.opts.seated === false ? 0.04 : 0), _V[8]), _V[9].set(sx, -0.4, -0.6), { fing: _V[10].set(-sx * 0.2, -0.25, 1), palm: _V[11].set(0, -1, 0) });
      const tap = pause ? 0.25 : 0.25 + 0.25 * Math.max(0, Math.sin(st.t * (13 + sx * 2.3) + a.n * 3));
      fingers(o, s, tap, 0.25);
    }
  } });
  defAnim('work', { arms: 'own', fn(o, a, st, L) {                 // working with the hands at chest height
    const t = st.t, seatedW = L.opts.seated;
    if (seatedW) seated(o, a, L, { spine: 0.06, chest: 0.04 }); else { stand(o, a, st, {}); add(o, 'spine', 0.08, 0, 0); }
    add(o, 'neck', 0.12, 0, 0); add(o, 'head', 0.16, 0, 0);
    const reachP = (t * 0.33 + a.n * 0.17) % 1, reach = reachP > 0.7 ? Math.sin(PI * (reachP - 0.7) / 0.3) : 0;
    for (const s of SIDES) {
      const sx = sgn(s), ph = t * (1.6 + sx * 0.3) + (s === 'L' ? 0 : 2);
      let x = sx * 0.035 + Math.sin(ph) * 0.012, y = -0.1 + Math.cos(ph * 1.3) * 0.012, z = a.D.T.chestD + 0.13 + Math.sin(ph * 0.7) * 0.015;
      if (s === 'R') { x += -0.1 * reach; y += 0.12 * reach; z += 0.1 * reach; }
      armIK(a, o, s, chestPt(a, o, x, y, z, _V[8]), chestDir(a, o, sx, -0.8, -0.3, _V[9]), { fing: chestDir(a, o, -sx * 0.5, 0.1, 1, _V[10]), palm: chestDir(a, o, -sx * 0.6, -0.5, 0.2, _V[11]) });
      fingers(o, s, 0.45 + 0.25 * Math.sin(ph * 2.1), 0.5);
    }
    if (reach > 0.1) add(o, 'head', -0.12 * reach, -0.2 * reach, 0);
  } });
  defAnim('brace', { arms: 'own', life: 1.8, fn(o, a, st, L) {      // arms up, holding something off (the lift)
    const tr = (Math.sin(st.t * 21) + Math.sin(st.t * 17.3)) * 0.5;
    stand(o, a, st, { wide: 0.06 });
    o[HPX + 1] -= 0.035;
    for (const s of SIDES) legIK(a, o, s, P3(a, sgn(s) * (a.D.hipX + 0.06), 0.045, sgn(s) * 0.03, _V[5]), 0, sgn(s) * 0.25);
    add(o, 'spine', -0.04, 0, 0); add(o, 'neck', 0.2, 0, 0); add(o, 'head', 0.1, 0, 0);
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * 0.16, 1.02 + tr * 0.004, 0.04, _V[8]), _V[9].set(sx, -0.2, -0.3), { fing: _V[10].set(-sx * 0.3, 0.1, -1), palm: _V[11].set(0, 1, 0) });
      fingers(o, s, 0.15 + Math.abs(tr) * 0.08, 0.2);
    }
  } });
  defAnim('struggle', { arms: 'own', life: 1.8, fn(o, a, st, L) {   // pulling back against a tether
    const j = Math.sin(st.t * 5.3) * 0.6 + Math.sin(st.t * 8.1) * 0.4;
    basePose(o);
    o[HPX + 1] = -0.035; o[HPX + 2] = -0.03;
    rot(o, 'hips', -0.1, 0.1 * j, 0); rot(o, 'spine', -0.18 + 0.05 * j, 0.1 * j, 0); rot(o, 'chest', -0.05, 0.08 * j, 0); rot(o, 'neck', 0.3, 0, 0); rot(o, 'head', 0.1, -0.1 * j, 0);
    legIK(a, o, 'L', P3(a, a.D.hipX * 1.2, 0.045, 0.2, _V[5]), -0.15, 0.1);
    legIK(a, o, 'R', P3(a, -a.D.hipX * 1.3, 0.045, -0.14, _V[5]), 0.2, -0.3);
    for (const s of SIDES) {
      const sx = sgn(s);
      armIK(a, o, s, P3(a, sx * 0.03, 0.6 + 0.02 * j, 0.24 + 0.03 * j, _V[8]), _V[9].set(sx, -0.6, -0.4), { fing: _V[10].set(-sx, 0, 0.3), palm: _V[11].set(0, -0.2, -1) });
      fingers(o, s, 0.95, 0.7);
    }
  } });
  defAnim('hurt', { life: 1.8, fn(o, a, st, L) {                   // Chase holding his ribs
    standLoop(o, a, st, L, { hunch: 0.25 });
    add(o, 'spine', 0.14, 0.1, 0.06); add(o, 'chest', 0.12, 0, 0); add(o, 'neck', 0.05, 0, 0);
    armIK(a, o, 'R', chestPt(a, o, -0.075, -0.05, a.D.T.chestD * 0.55, _V[8]), chestDir(a, o, -1, -0.5, -0.2, _V[9]), { fing: chestDir(a, o, 0.6, 0.3, 0.6, _V[10]), palm: chestDir(a, o, 0.6, 0, -0.8, _V[11]) });
    fingers(o, 'R', 0.35);
  } });

  // ---- persistent arm poses (carry): wrist target / pole / finger dir / palm normal in chest space (L side; R mirrored)
  const AP = (w, pole, fing, palm, curl = 0.55, thumb = 0.4, extra) => ({ w, pole, fing, palm, curl, thumb, ...extra });
  const ARM_POSES = {
    phone: (T) => AP([0.07, -0.19, T.chestD + 0.1], [1, -0.7, -0.5], [-0.35, 0.3, 1], [-0.15, 1, -0.45], 0.4, 0.45),
    // (fingers nearly straight: they lie along the phone's back and sides; only the thumb reaches the screen's edge —
    // curl 0.42 laid four blocky fingers across the screen in every insert)
    phone_look: (T) => AP([0.04, -0.07, T.chestD + 0.16], [1, -1, -0.2], [-0.35, 0.6, 0.75], [-0.15, 0.5, -0.9], 0.12, 0.3),
    phone_up: (T) => AP([0.075, 0.17, T.chestD + 0.22], [1, -1, 0], [0, 1, 0.1], [0.05, 0.05, 1], 0.6, 0.45),
    // (the forearm up beside the jaw, the phone's screen to the ear, the elbow raised out to his side and a little back,
    // about 0.14 m above the shoulder joint: seen from the far side the whole arm stays behind his head, seen from the
    // front the elbow is out to his side and his mouth is clear. With the phone at the ear the rig's forearm is too short
    // for a dropped elbow: every elbow-down pole ends at shoulder height and forward, the forearm across his jaw from the
    // far side — as the old pole [0.8,-1,0.3] did, the upper arm crossing his face in every close side shot)
    phone_ear: (T) => AP([0.08, 0.12, -0.01], [0.6, -1.5, 0.2], [-0.2, 1, 0.1], [-1, 0, 0.15], 0.6, 0.45),
    cup: (T) => AP([0.08, -0.15, T.chestD + 0.09], [1, -0.8, -0.3], [-0.6, 0, 0.8], [-1, 0.1, -0.2], 0.75, 0.5),
    bar: (T) => AP([0.125, -0.35, 0.035], [0.3, 0, -1], [0, -1, 0.12], [-1, 0, 0], 0.95, 0.7),
    bar_ready: (T) => AP([0.1, 0.02, T.chestD + 0.07], [1, -0.8, -0.2], [0, 0.1, 1], [-1, 0, 0], 0.95, 0.7),
    clipboard: (T) => AP([0.06, -0.11, T.chestD + 0.13], [1, -0.8, -0.3], [-0.5, 0.35, 0.8], [-0.3, 1, 0], 0.35, 0.4),
    // head space (head units, +Z out of the face): follows a bent head (the Standard's clipboard over its face)
    clipboard_face: (T) => AP([0.2, -0.05, 1.0], [1, -0.8, 0], [-0.25, 1, 0.2], [0, 0, 1], 0.4, 0.4, { space: 'head' }),
    offer: (T) => AP([0.035, -0.06, T.chestD + 0.25], [1, -1, -0.2], [0, 0.15, 1], [0, 1, 0], 0.3, 0.3),
    pocket: (T) => AP([0.1, -0.31, 0.045], [0.4, 0, -1], [0, -1, 0.25], [-1, 0, 0], 0.3, 0.3),
    hold: (T) => AP([0.115, -0.34, 0.04], [0.4, 0, -1], [0, -1, 0.15], [-1, 0, 0], 0.7, 0.55),
    fist: (T) => AP([0.115, -0.33, 0.04], [0.4, 0, -1], [0, -1, 0.15], [-1, 0, 0], 1.05, 0.9),
    extinguisher: (T) => AP([0.13, -0.36, 0.02], [0.3, 0, -1], [0, -1, 0.05], [-1, 0, 0], 0.95, 0.8, { shrug: -0.04 }),
    ribs: (T) => AP([0.075, -0.05, T.chestD * 0.55], [1, -0.5, -0.2], [-0.6, 0.3, 0.6], [-0.6, 0, -0.8], 0.35, 0.3),
    tuck: (T) => AP([0.105, -0.17, T.chestD + 0.05], [1, -0.4, -0.8], [0, -0.35, 1], [-1, 0, 0], 0.5, 0.4, { attach: 'upperArm' }),
    card: (T) => AP([0.05, -0.02, T.chestD + 0.16], [1, -1, -0.3], [-0.2, 0.5, 1], [-0.2, 0.3, -1], 0.4, 0.4),
    // both hands
    shield: (T) => ({ both: true, attach: 'chest',
      L: AP([0.055, 0.035, T.chestD + 0.035], [1, -0.6, -0.1], [-0.9, 0.4, 0], [0, 0, -1], 0.35, 0.3),
      R: AP([-0.05, -0.03, T.chestD + 0.038], [-1, -0.7, -0.1], [0.9, 0.35, 0.05], [0, 0, -1], 0.35, 0.3) }),
    arms_crossed: (T) => ({ both: true,
      L: AP([-0.065, -0.035, T.chestD + 0.07], [1, -0.4, 0], [-0.5, -0.1, -0.3], [0, 0.2, -1], 0.5, 0.4),
      R: AP([0.07, -0.055, T.chestD + 0.09], [-1, -0.4, 0], [0.5, -0.1, -0.3], [0, 0.2, -1], 0.5, 0.4) }),
    clasp: (T) => ({ both: true,
      L: AP([0.018, -0.2, T.chestD + 0.08], [1, -0.4, -0.4], [-0.3, -0.7, 0.5], [-1, 0, 0], 0.5, 0.4),
      R: AP([-0.018, -0.205, T.chestD + 0.085], [-1, -0.4, -0.4], [0.3, -0.7, 0.5], [1, 0, 0], 0.5, 0.4) }),
    tablet_read: (T) => ({ both: true, attach: 'handL',
      L: AP([0.07, -0.08, T.chestD + 0.17], [1, -1, -0.3], [-0.4, 0.3, 0.9], [-0.3, 0.8, -0.3], 0.35, 0.4),
      R: AP([-0.08, -0.09, T.chestD + 0.17], [-1, -1, -0.3], [0.4, 0.3, 0.9], [0.3, 0.8, -0.3], 0.3, 0.4) }),
  };
  function poseDef(a, name, side) {
    if (!name) return null;
    if (typeof name === 'object') return name.w ? name : (name[side] || null);
    const f = ARM_POSES[name]; if (!f) return null;
    const d = f(a.D.T);
    if (d.both) return d[side];
    return d;
  }
  // ---- gestures ----------------------------------------------------------------------------------------------------
  // def: { dur, in, out, slot:'body'|'head'|'fx', hand:'free'|'held'|'R'|'L'|'both'|null, stand (not while seated),
  //        fn(o, a, g) edits a copy of the current pose, start(a,g), end(a,g), events:[[t, fn(a,g)]], eyes:'down'|'closed' }
  // Slots run concurrently (a nod during a pen click); a new gesture in a busy slot replaces the old one.
  const GEST = {};
  function defGesture(name, def) { GEST[name] = { dur: 1.6, in: 0.3, out: 0.35, slot: 'body', hand: null, ...def, name }; }
  const ramp = (t, a, b) => smooth(clamp((t - a) / Math.max(1e-3, b - a)));
  const pulse = (t, at, w) => Math.max(0, 1 - Math.abs(t - at) / w);
  // put the palm centre at `pt` (body space): offsets the wrist back along the fingers
  function reachPalm(a, o, s, pt, pole, fing, palm, curl = 0.3, thumb = 0.3) {
    const H = a.H, hs = a.D.handS;
    const f = _V[12].copy(fing).normalize(), n = _V[13].copy(palm).normalize();
    const w = _V[3].copy(pt).addScaledVector(f, -0.05 * hs * H).addScaledVector(n, -0.012 * hs * H);
    const fc = _V[1].copy(fing), pc = _V[2].copy(palm);
    armIK(a, o, s, w, pole, { fing: fc, palm: pc });
    fingers(o, s, curl, thumb);
  }
  const cd = (a, o, x, y, z, i) => chestDir(a, o, x, y, z, _V[i]);
  defGesture('rub_neck', { dur: 2.2, hand: 'free', eyes: 'down', fn(o, a, g) {
    const s = g.side, sx = sgn(s);
    const rub = Math.sin(g.t * 8.5) * ramp(g.t, 0.45, 0.6) * (1 - ramp(g.t, 1.6, 1.8));
    add(o, 'neck', 0.14, 0, -sx * 0.06); add(o, 'head', 0.16, sx * 0.08, 0);
    reachPalm(a, o, s, headPt(a, o, sx * (0.09 + rub * 0.04), 0.1 + rub * 0.02, -0.3, _V[8]), cd(a, o, sx * 0.7, -0.15, 1, 9), cd(a, o, -sx * 0.75, 0.5, -0.2, 10), cd(a, o, -sx * 0.3, 0.1, 1, 11), 0.35, 0.35);
  } });
  defGesture('pen_click', { dur: 2.1, hand: 'free', eyes: 'down',
    start(a, g) { g.data.pen = a._tempProp(g.side, 'pen'); },
    end(a, g) { a._removeTemp(g.data.pen); },
    events: [[0.8, (a, g) => a._sfx('penclick', g.side)], [1.12, (a, g) => a._sfx('penclick', g.side)], [1.5, (a, g) => a._sfx('penclick', g.side)]],
    fn(o, a, g) {
      const s = g.side, sx = sgn(s), T = a.D.T;
      add(o, 'neck', 0.06, 0, 0); add(o, 'head', 0.12, -sx * 0.05, 0);
      reachPalm(a, o, s, chestPt(a, o, sx * 0.035, -0.075, T.chestD + 0.1, _V[8]), cd(a, o, sx, -0.8, -0.3, 9), cd(a, o, -sx * 0.55, 0.25, 1, 10), cd(a, o, -sx * 0.3, 1, -0.1, 11), 0.72, 0.3);
      const cl = Math.max(pulse(g.t, 0.8, 0.09), pulse(g.t, 1.12, 0.09), pulse(g.t, 1.5, 0.09));
      o[CH['thumb' + s]] = 0.3 + 0.55 * cl;
    } });
  defGesture('shift_weight', { dur: 1.3, slot: 'fx', stand: true, in: 0.2, out: 0.3,
    start(a) { const st = a.state; st.stanceTarget = -(st.stanceTarget || 1) * (0.75 + a.rng() * 0.25); st.stanceTimer = 9 + a.rng() * 10; },
    fn(o, a, g) { const k = Math.sin(PI * g.u); o[HPX + 1] -= 0.005 * k; for (const s of SIDES) add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.02 * k); add(o, 'head', 0.02 * k, 0, 0); } });
  defGesture('rub_eyes', { dur: 2.5, hand: 'free', eyes: 'closed', fn(o, a, g) {
    const s = g.side, sx = sgn(s);
    const rub = Math.sin(g.t * 7) * ramp(g.t, 0.55, 0.7) * (1 - ramp(g.t, 1.8, 2.0));
    add(o, 'spine', 0.04, 0, 0); add(o, 'neck', 0.14, 0, 0); add(o, 'head', 0.2, -sx * 0.06, 0);
    reachPalm(a, o, s, headPt(a, o, rub * 0.05 + sx * 0.01, 0.46, 0.62, _V[8]), cd(a, o, sx, -1, 0.2, 9), cd(a, o, -sx * 0.3, 1, 0.25, 10), cd(a, o, 0, 0.1, -1, 11), 0.35, 0.55);
  } });
  defGesture('tap_bar', { dur: 1.5, hand: 'held', fn(o, a, g) {
    const s = g.side, taps = pulse(g.t, 0.42, 0.14) + pulse(g.t, 0.78, 0.14) + pulse(g.t, 1.12, 0.14);
    add(o, 'upperArm' + s, -0.12 - 0.12 * taps, 0, 0); add(o, 'foreArm' + s, 0.1 + 0.15 * taps, 0, 0);
    add(o, 'hand' + s, -0.25 * taps, 0, 0);
    add(o, 'head', 0.1, 0, 0);
  } });
  defGesture('bounce', { dur: 1.7, slot: 'fx', stand: true, in: 0.2, out: 0.3, fn(o, a, g) {
    const b = Math.abs(Math.sin(g.t * PI * 2.4));
    o[HPX + 1] += 0.012 * b;
    for (const s of SIDES) { add(o, 'foot' + s, 0.3 * b, 0, 0); add(o, 'shin' + s, -0.04 * b, 0, 0); }
    add(o, 'chest', -0.01 * b, 0, 0);
  } });
  defGesture('check_shoulder', { dur: 1.5, slot: 'head', in: 0.25, out: 0.4,
    start(a, g) { g.data.side = a.rng() < 0.5 ? 1 : -1; },
    fn(o, a, g) { const d = g.data.side; add(o, 'chest', 0, d * 0.32, 0); add(o, 'neck', 0.02, d * 0.42, 0); add(o, 'head', -0.04, d * 0.55, 0); add(o, 'spine', 0, d * 0.1, 0); } });
  defGesture('fidget', { dur: 1.7, hand: 'free',
    start(a, g) { g.data.v = Math.floor(a.rng() * 4); },
    fn(o, a, g) {
      const s = g.side, sx = sgn(s), T = a.D.T, v = g.data.v;
      if (v === 0) {        // tug the other sleeve
        const tug = Math.sin(g.t * 6) * 0.01;
        reachPalm(a, o, s, chestPt(a, o, -sx * 0.1, -0.3 + tug, 0.04, _V[8]), cd(a, o, sx, -0.5, -0.4, 9), cd(a, o, -sx, -0.5, 0.2, 10), cd(a, o, 0, -0.2, -1, 11), 0.7, 0.6);
      } else if (v === 1) { // rub hands together
        const r = Math.sin(g.t * 9) * 0.012;
        for (const q of SIDES) { const qx = sgn(q); reachPalm(a, o, q, chestPt(a, o, qx * 0.012 + r * qx, -0.12 + r * (q === 'L' ? 1 : -1), T.chestD + 0.1, _V[8]), cd(a, o, qx, -0.8, -0.2, 9), cd(a, o, -qx * 0.2, 0.6, 1, 10), cd(a, o, -qx, 0, 0, 11), 0.2, 0.3); }
      } else if (v === 2) { // touch the chin
        add(o, 'head', 0.05, 0, sx * 0.05);
        reachPalm(a, o, s, headPt(a, o, sx * 0.05, 0.08, 0.42, _V[8]), cd(a, o, sx, -1, 0, 9), cd(a, o, -sx * 0.3, 1, 0.3, 10), cd(a, o, 0, 0.4, -1, 11), 0.55, 0.3);
      } else {               // straighten the lanyard / collar
        reachPalm(a, o, s, chestPt(a, o, sx * 0.02, 0.02, T.chestD + 0.03, _V[8]), cd(a, o, sx, -0.6, -0.2, 9), cd(a, o, -sx * 0.4, 1, 0.1, 10), cd(a, o, 0, 0, -1, 11), 0.6, 0.6);
      }
    } });
  defGesture('tremor', { dur: 2.6, slot: 'fx', in: 0.3, out: 0.5, fn(o, a, g) {
    const k = g.opts.amount ?? 1;
    for (const s of SIDES) {
      const n = Math.sin(g.t * 71 + (s === 'L' ? 0 : 1.3)) * 0.6 + Math.sin(g.t * 53.7 + 2) * 0.4;
      add(o, 'hand' + s, 0.035 * n * k, 0, 0.03 * n * k); add(o, 'foreArm' + s, 0.015 * n * k, 0, 0);
      o[CH['curl' + s]] += (0.18 + 0.06 * n) * k;
    }
  } });
  // offer: the held thing out, palm up. opts.target (an Actor, a point [x,y,z] / Vector3 or [x,z]) aims the hand at it —
  // at another actor: a hand's width short of his chest, at his hand height (a seated Chloe handing something up to a
  // standing Aidan reaches up toward his hand, not out at her own shoulder height) — clamped to the arm's reach
  defGesture('offer', { dur: 2.3, hand: 'held', fn(o, a, g) {
    const s = g.side, sx = sgn(s), T = a.D.T;
    add(o, 'spine', 0.05, 0, 0); add(o, 'chest', 0.04, 0, 0); add(o, 'head', 0.04, 0, 0);
    let wp = null;
    const t = g.opts.target;
    if (t) {
      const act = t instanceof Actor ? t : t.raw instanceof Actor ? t.raw : null;
      if (act && act !== a) {
        act.bones.chest.getWorldPosition(_V[15]); a.bones.chest.getWorldPosition(_V[3]);
        const dx = _V[3].x - _V[15].x, dz = _V[3].z - _V[15].z, d = Math.hypot(dx, dz) || 1;
        wp = _V[15].set(_V[15].x + (dx / d) * 0.3, _V[15].y - 0.2 * (act.H || 1.75) / 1.75, _V[15].z + (dz / d) * 0.3);
      } else if (!act) wp = a._targetPos(t, _V[15]);
    }
    if (wp) {
      a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert();
      const tg = _V[8].copy(wp).applyMatrix4(_M.inv);
      const sh = _V[4].copy(a.rest['upperArm' + s]).applyMatrix4(fkTo(a, o, CH_ARM[s]));
      const dv = _V[7].copy(tg).sub(sh), L = dv.length() || 1, reach = (a.D.ua + a.D.fa) * a.H * 0.93;
      if (L > reach) tg.copy(sh).addScaledVector(dv, reach / L);
      dv.normalize(); dv.y += 0.12;
      armIK(a, o, s, tg, cd(a, o, sx, -1, -0.2, 9), { fing: _V[10].copy(dv), palm: cd(a, o, 0, 1, 0, 11) });
    } else armIK(a, o, s, chestPt(a, o, sx * 0.035, -0.06, T.chestD + 0.25, _V[8]), cd(a, o, sx, -1, -0.2, 9), { fing: cd(a, o, 0, 0.15, 1, 10), palm: cd(a, o, 0, 1, 0, 11) });
    fingers(o, s, a.held[s] ? 0.45 : 0.2, 0.3);
  } });
  defGesture('point', { dur: 1.9, hand: 'free', fn(o, a, g) {
    const s = g.side, sx = sgn(s);
    const F = fkTo(a, o, CH_ARM[s]);
    const sh = _V[4].copy(a.rest['upperArm' + s]).applyMatrix4(F);
    let dir = _V[7].set(0, -0.12, 1);
    const tp = a.state.look.target && a._targetPos(a.state.look.target, _V[15]);
    if (tp) { a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert(); dir = tp.applyMatrix4(_M.inv).sub(sh); }
    dir.normalize();
    const reach = (a.D.ua + a.D.fa) * a.H * 0.97;
    armIK(a, o, s, _V[8].copy(sh).addScaledVector(dir, reach), _V[9].set(sx, -1, 0), { fing: dir, palm: _V[11].set(-sx, -0.3, 0) });
    fingers(o, s, 0.95, 0.5, 1);
  } });
  defGesture('raise_phone', { dur: 2.7, hand: 'held', eyes: 'down', fn(o, a, g) {
    const s = g.side, sx = sgn(s), T = a.D.T;
    add(o, 'neck', 0.12, 0, 0); add(o, 'head', 0.16, -sx * 0.05, 0);
    armIK(a, o, s, chestPt(a, o, sx * 0.03, 0.035, T.chestD + 0.19, _V[8]), cd(a, o, sx, -1, -0.2, 9), { fing: cd(a, o, -sx * 0.2, 1, 0.3, 10), palm: cd(a, o, -sx * 0.1, 0.35, -1, 11) });
    fingers(o, s, 0.6, 0.45);
  } });
  defGesture('hands_up', { dur: 1.9, hand: 'both', fn(o, a, g) {
    const T = a.D.T;
    add(o, 'chest', -0.05, 0, 0); add(o, 'head', -0.06, 0, 0);
    for (const s of SIDES) { const sx = sgn(s); armIK(a, o, s, chestPt(a, o, sx * 0.15, 0.17, T.chestD + 0.12, _V[8]), cd(a, o, sx, -1, -0.1, 9), { fing: cd(a, o, sx * 0.15, 1, 0.1, 10), palm: cd(a, o, 0, 0, 1, 11) }); fingers(o, s, 0.1, 0.1); }
  } });
  defGesture('cover_lanyard', { dur: 2.2, hand: 'free', eyes: 'down', fn(o, a, g) {
    const s = g.side, sx = sgn(s), T = a.D.T;
    add(o, 'neck', 0.1, 0, 0); add(o, 'head', 0.12, 0, 0); add(o, 'chest', 0.04, 0, 0);
    let pt;
    if (a.anchors.card) { a.anchors.card.updateWorldMatrix(true, false); a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert(); pt = a.anchors.card.getWorldPosition(_V[8]).applyMatrix4(_M.inv); pt.y -= 0.04; }
    else pt = chestPt(a, o, 0, 0.0, T.chestD + 0.02, _V[8]);
    pt.add(cd(a, o, 0, 0, 1, 7).multiplyScalar(0.02));
    reachPalm(a, o, s, pt, cd(a, o, sx, -0.8, 0.1, 9), cd(a, o, -sx * 0.55, 0.8, 0.1, 10), cd(a, o, 0, 0, -1, 11), 0.15, 0.2);
  } });
  defGesture('head_in_hands', { dur: 2.9, hand: 'both', in: 0.5, out: 0.6, eyes: 'closed', fn(o, a, g) {
    add(o, 'spine', 0.18, 0, 0); add(o, 'chest', 0.14, 0, 0); add(o, 'neck', 0.24, 0, 0); add(o, 'head', 0.3, 0, 0);
    for (const s of SIDES) { const sx = sgn(s); reachPalm(a, o, s, headPt(a, o, sx * 0.16, 0.42, 0.5, _V[8]), cd(a, o, sx * 0.4, -1, 0.3, 9), cd(a, o, -sx * 0.25, 1, 0.1, 10), cd(a, o, -sx * 0.3, 0.1, -1, 11), 0.25, 0.3); }
  } });
  defGesture('nod', { dur: 1.0, slot: 'head', in: 0.1, out: 0.2, fn(o, a, g) { const k = Math.sin(g.u * TAU * (g.opts.times || 2)) * Math.sin(PI * g.u); add(o, 'head', 0.17 * Math.max(0, k) + 0.03 * Math.min(0, k), 0, 0); add(o, 'neck', 0.05 * Math.max(0, k), 0, 0); } });
  defGesture('shake_head', { dur: 1.3, slot: 'head', in: 0.1, out: 0.2, fn(o, a, g) { add(o, 'head', 0.03, 0.24 * Math.sin(g.u * TAU * 2.5) * Math.sin(PI * g.u), 0); add(o, 'neck', 0, 0.06 * Math.sin(g.u * TAU * 2.5 - 0.4) * Math.sin(PI * g.u), 0); } });
  defGesture('wipe_eyes', { dur: 1.7, hand: 'free', eyes: 'closed', fn(o, a, g) {
    const s = g.side, sx = sgn(s), m = ramp(g.t, 0.45, 1.1);
    add(o, 'head', 0.14, -sx * 0.1, sx * 0.06); add(o, 'neck', 0.06, 0, 0);
    reachPalm(a, o, s, headPt(a, o, sx * (0.06 + 0.14 * m), 0.44, 0.52 - m * 0.06, _V[8]), cd(a, o, sx, -1, 0.1, 9), cd(a, o, -sx * 0.9, 0.4, 0.2, 10), cd(a, o, sx * 0.1, 0.2, -1, 11), 0.45, 0.3);
  } });
  defGesture('reach', { dur: 1.8, hand: 'free', fn(o, a, g) {
    const s = g.side, sx = sgn(s), T = a.D.T;
    add(o, 'spine', 0.12, 0, 0); add(o, 'chest', 0.06, 0, 0); add(o, 'head', 0.12, 0, 0);
    let tg;
    const tp = g.opts.target && a._targetPos(g.opts.target, _V[15]);
    if (tp) { a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert(); tg = tp.applyMatrix4(_M.inv); _V[8].copy(tg); }
    else chestPt(a, o, sx * 0.05, -0.22, T.chestD + 0.3, _V[8]);
    armIK(a, o, s, _V[8], cd(a, o, sx, -1, -0.2, 9), { fing: cd(a, o, 0, -0.3, 1, 10), palm: cd(a, o, -sx * 0.6, -0.8, 0, 11) });
    fingers(o, s, lerp(0.05, 0.6, ramp(g.u, 0.55, 0.75)), 0.3);
  } });
  defGesture('swing', { dur: 1.1, hand: 'held', in: 0.08, out: 0.25, fn(o, a, g) {
    const s = g.side, sx = sgn(s), u = g.t / g.dur;
    const k = [[0, 0], [0.32, 1], [0.46, 2], [0.72, 3], [1, 4]];
    const P = [[sx * 0.11, -0.3, 0.05], [sx * 0.16, 0.2, -0.04], [-sx * 0.02, 0.0, 0.3], [-sx * 0.16, -0.24, 0.18], [sx * 0.11, -0.3, 0.05]];
    const tw = [0, -sx * 0.45, sx * 0.25, sx * 0.4, 0];
    let i = 0; while (i < k.length - 2 && u > k[i + 1][0]) i++;
    const e = U.ease.inOut(clamp((u - k[i][0]) / (k[i + 1][0] - k[i][0])));
    const p0 = P[i], p1 = P[i + 1];
    add(o, 'chest', 0.05 * e, lerp(tw[i], tw[i + 1], e), 0); add(o, 'spine', 0.04, lerp(tw[i], tw[i + 1], e) * 0.4, 0);
    armIK(a, o, s, chestPt(a, o, lerp(p0[0], p1[0], e), lerp(p0[1], p1[1], e), lerp(p0[2], p1[2], e), _V[8]), cd(a, o, sx, -0.3, -0.5, 9), { fing: cd(a, o, 0, i < 1 ? 1 : -0.3, i < 1 ? -0.3 : 1, 10), palm: cd(a, o, -sx, 0, 0, 11) });
    fingers(o, s, 1, 0.8);
  }, events: [[0.42, (a, g) => { if (g.opts.onStrike) g.opts.onStrike(); }]] });
  defGesture('hand_on_shoulder', { dur: 3.0, hand: 'free', in: 0.6, out: 0.6, fn(o, a, g) {
    const s = g.side, sx = sgn(s);
    let tg = null;
    const t = g.opts.target || a.state.look.target;
    if (t) {
      const act = t instanceof Actor ? t : t && t.raw instanceof Actor ? t.raw : null;
      if (act) { const b = act.bones[s === 'L' ? 'upperArmR' : 'upperArmL']; tg = b.getWorldPosition(_V[15]); tg.y += 0.05 * act.H; }
      else tg = a._targetPos(t, _V[15]);
      if (tg) { a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert(); tg.applyMatrix4(_M.inv); }
    }
    if (!tg) tg = P3(a, -sx * 0.06, 0.8, 0.3, _V[15]);
    add(o, 'spine', 0.04, 0, 0);
    reachPalm(a, o, s, tg, _V[9].set(sx, -0.6, -0.3), _V[10].set(-sx * 0.1, -0.2, 1), _V[11].set(0, -1, 0), 0.4, 0.3);
  } });
  // full-body transitions
  function transition(toName, lean) {
    return { dur: 1.35, in: 0, out: 0, hand: null,
      start(a, g) { g.data.from = new Float32Array(a.pose); g.data.to = toName(a, g); if (a.style.heavy > 0.5 || a.style.sitHeavy || g.opts.heavy) g.dur = 1.0; },
      end(a, g) { a.setAnim(g.data.to, { ...g.opts, blend: 0 }); },
      fn(o, a, g) {
        const L = { t: g.t, opts: g.opts, speed: 1, def: LOOPS[g.data.to], w: 1 };
        const tmp = a.tmp3; LOOPS[g.data.to].fn(tmp, a, a.state, L);
        const saved = a.state.layers; a.state.layers = [L]; a._posture(tmp); a.state.layers = saved;
        o.set(g.data.from);
        const heavy = a.style.heavy > 0.5 || a.style.sitHeavy || g.opts.heavy;
        const e = heavy && lean > 0 ? (g.u < 0.7 ? 0.55 * smooth(g.u / 0.7) : 0.55 + 0.45 * U.ease.in((g.u - 0.7) / 0.3)) : U.ease.inOut(g.u);
        lerpPose(o, tmp, e);
        const hump = Math.sin(PI * clamp(g.u * 1.15));
        add(o, 'spine', 0.3 * hump, 0, 0); add(o, 'chest', 0.12 * hump, 0, 0); add(o, 'head', -0.25 * hump, 0, 0);
        o[HPX + 2] += 0.04 * hump * lean;
      } };
  }
  defGesture('sit_down', transition((a, g) => g.opts.to || (a.P.sitAnim || 'sit'), 1));
  defGesture('stand_up', transition((a, g) => g.opts.to || 'idle', -1));
  defGesture('shrug', { dur: 1.4, hand: 'both', fn(o, a, g) {
    const k = Math.sin(PI * g.u);
    for (const s of SIDES) { const sx = sgn(s); add(o, 'shoulder' + s, 0, 0, sx * 0.22 * k); arm(o, s, { pitch: 0.25, abduct: 0.3, elbow: 1.35, pron: -1.4, flex: -0.2 }); fingers(o, s, 0.15, 0.1); }
    add(o, 'head', 0.03, 0, 0.1 * k);
  } });
  defGesture('laugh', { dur: 1.7, slot: 'fx', in: 0.1, out: 0.5,
    start(a, g) { g.data.prev = a.faceState.expr; a.expr(g.opts.small ? 'smile' : 'grin'); },
    end(a, g) { if (a.faceState.expr === (g.opts.small ? 'smile' : 'grin')) a.expr(g.data.prev); },
    fn(o, a, g) {
      const k = (g.opts.small ? 0.4 : 1) * Math.abs(Math.sin(g.t * 16)) * (1 - g.u);
      add(o, 'chest', -0.03 * k, 0, 0); add(o, 'head', -0.08 * (1 - g.u) - 0.03 * k, 0, 0);
      for (const s of SIDES) add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.04 * k);
    } });
  // CONTRACT+ gestures
  defGesture('peer', { dur: 2.2, slot: 'head', in: 0.4, out: 0.5, fn(o, a, g) { add(o, 'head', 0.16, 0, 0); add(o, 'neck', 0.06, 0, 0); } });
  defGesture('sigh', { dur: 2.0, slot: 'fx', in: 0.3, out: 0.6, fn(o, a, g) {
    const k = g.u < 0.35 ? smooth(g.u / 0.35) : 1 - smooth((g.u - 0.35) / 0.65) * 1.3;
    add(o, 'chest', -0.03 * k, 0, 0); for (const s of SIDES) add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.06 * k); add(o, 'head', 0.06 * Math.max(0, -k), 0, 0);
  } });
  defGesture('clench', { dur: 1.6, slot: 'fx', in: 0.2, out: 0.4, fn(o, a, g) { for (const s of SIDES) { o[CH['curl' + s]] = Math.max(o[CH['curl' + s]], 1.05); o[CH['thumb' + s]] = 0.95; add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.05); add(o, 'hand' + s, 0.06 * Math.sin(g.t * 40), 0, 0); } } });
  defGesture('flinch', { dur: 0.75, in: 0.05, out: 0.4, hand: 'both', fn(o, a, g) {
    const k = Math.sin(PI * Math.min(1, g.u * 1.6));
    add(o, 'spine', -0.08 * k, 0, 0); add(o, 'chest', -0.06 * k, 0.1 * k, 0); add(o, 'head', -0.1 * k, 0.15 * k, 0);
    for (const s of SIDES) { add(o, 'upperArm' + s, -0.4 * k, 0, sgn(s) * 0.1 * k); add(o, 'foreArm' + s, -0.6 * k, 0, 0); add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.1 * k); }
  } });
  defGesture('look_around', { dur: 2.6, slot: 'head', in: 0.3, out: 0.4, fn(o, a, g) { const y = Math.sin(g.u * TAU) * 0.55; add(o, 'neck', 0, y * 0.4, 0); add(o, 'head', 0.02, y * 0.6, 0); add(o, 'chest', 0, y * 0.12, 0); } });
  defGesture('smooth_uniform', { dur: 1.7, hand: 'both', fn(o, a, g) {
    const T = a.D.T, m = ramp(g.t, 0.35, 1.2);
    add(o, 'neck', 0.1, 0, 0); add(o, 'head', 0.08, 0, 0); add(o, 'spine', 0.03, 0, 0);
    for (const s of SIDES) { const sx = sgn(s); reachPalm(a, o, s, chestPt(a, o, sx * 0.06, lerp(0.02, -0.14, m), T.chestD + 0.022, _V[8]), cd(a, o, sx, -0.8, -0.1, 9), cd(a, o, -sx * 0.3, -0.9, 0.1, 10), cd(a, o, 0, 0, -1, 11), 0.1, 0.15); }
  } });
  defGesture('touch_pendant', { dur: 2.2, hand: 'free', eyes: 'down', fn(o, a, g) {
    const s = g.side, sx = sgn(s);
    add(o, 'neck', 0.1, 0, 0); add(o, 'head', 0.14, 0, 0);
    let pt;
    if (a.anchors.pendant) { a.anchors.pendant.updateWorldMatrix(true, false); a.body.updateWorldMatrix(true, false); _M.inv.copy(a.body.matrixWorld).invert(); pt = a.anchors.pendant.getWorldPosition(_V[8]).applyMatrix4(_M.inv); }
    else pt = chestPt(a, o, 0, 0.02, a.D.T.chestD + 0.02, _V[8]);
    pt.add(cd(a, o, 0, -0.2, 1, 7).multiplyScalar(0.03));
    reachPalm(a, o, s, pt, cd(a, o, sx, -0.8, -0.2, 9), cd(a, o, -sx * 0.5, 0.9, 0.2, 10), cd(a, o, 0, 0.1, -1, 11), 0.55, 0.5);
  } });
  defGesture('grip', { dur: 1.5, slot: 'fx', in: 0.2, out: 0.5, fn(o, a, g) { for (const s of SIDES) if (a.held[s] || a.state.carry[s]) { o[CH['curl' + s]] += 0.3; add(o, 'hand' + s, 0, 0, 0.04 * sgn(s)); } } });
  defGesture('earbud_out', { dur: 1.3, hand: 'free', events: [[0.6, (a) => a.setEarbuds(false), true]], fn(o, a, g) {
    const s = g.side, sx = sgn(s), m = ramp(g.t, 0.55, 0.9);
    add(o, 'head', 0, sx * 0.12, -sx * 0.06);
    reachPalm(a, o, s, headPt(a, o, sx * 0.42, 0.42 - m * 0.3, 0.05 + m * 0.25, _V[8]), cd(a, o, sx, -0.5, 0.2, 9), cd(a, o, 0, 1, 0.2, 10), cd(a, o, -sx, 0, 0, 11), 0.65, 0.7);
  } });
  defGesture('earbud_in', { dur: 1.3, hand: 'free', events: [[0.7, (a) => a.setEarbuds(true), true]], fn(o, a, g) {
    const s = g.side, sx = sgn(s), m = 1 - ramp(g.t, 0.35, 0.7);
    add(o, 'head', 0, sx * 0.12, -sx * 0.06);
    reachPalm(a, o, s, headPt(a, o, sx * 0.42, 0.42 - m * 0.3, 0.05 + m * 0.25, _V[8]), cd(a, o, sx, -0.5, 0.2, 9), cd(a, o, 0, 1, 0.2, 10), cd(a, o, -sx, 0, 0, 11), 0.65, 0.7);
  } });
  const glassesG = (off) => ({ dur: 1.5, hand: 'free', events: [[0.7, (a) => a.glassesState(off ? 'hang' : 'on'), true]], fn(o, a, g) {
    const s = g.side, sx = sgn(s), up = off ? ramp(g.t, 0.2, 0.7) * (1 - ramp(g.t, 0.75, 1.2)) : ramp(g.t, 0.3, 0.7) * (1 - ramp(g.t, 0.8, 1.2));
    reachPalm(a, o, s, headPt(a, o, sx * 0.3, 0.5 - (1 - up) * 0.4, 0.4 - (1 - up) * 0.1, _V[8]), cd(a, o, sx, -1, 0.1, 9), cd(a, o, -sx * 0.3, 1, 0.2, 10), cd(a, o, -sx, 0, -0.2, 11), 0.6, 0.6);
  } });
  defGesture('glasses_off', glassesG(true));
  defGesture('glasses_on', glassesG(false));

  // ---------------------------------------------------------------------------------------------------------------
  // Actor API + per-frame internals
  // ---------------------------------------------------------------------------------------------------------------
  const DUMMY_P = Promise.resolve();
  Object.assign(Actor.prototype, {
    isActor: true,
    _initState() {
      const r = this.rng;
      this.state = {
        layers: [], clock: r() * 100, t: 0, phase: r(), gSpeed: 0, speed: 0, fwd: 1, vy: 0, yawRate: 0, prev: new THREE.Vector3(), prevYaw: 0, hasPrev: false,
        climbPhase: 0, crawlPhase: 0,
        stanceW: r() < 0.5 ? 0.8 : -0.8, stanceTarget: 1, stanceTimer: 5 + r() * 8,
        breath: r() * TAU, exert: 0,
        look: { target: null, yaw: 0, pitch: 0 },
        eyes: { mode: 'ahead', target: null, yaw: 0, pitch: 0, sacT: 1, sacX: 0, sacY: 0, awaySide: r() < 0.5 ? 1 : -1 },
        blinkT: 1 + r() * 4, blinkP: 0,
        habitT: lerp(this.habitEvery[0], this.habitEvery[1], r()),
        gest: { body: null, head: null, fx: null },
        carry: { L: null, R: null }, carryW: { L: 0, R: 0 },
        pace: { z: 0, yaw: 0, turning: 0, yaw0: 0 },
        talkT: 0, talkFlip: 0,
      };
      this.state.stanceTarget = this.state.stanceW > 0 ? 1 : -1;
      this.faceState = { expr: 'neutral', talk: 0, closed: false, tears: false };
      this.pose = newPose(); this.tmp = newPose(); this.tmp2 = newPose(); this.tmp3 = newPose();
      this.fk = {}; for (const n of BN) this.fk[n] = new THREE.Matrix4();
      this.anim = null;
      this._faceCache = new Map();
    },
    // ---- public API ------------------------------------------------------------------------------------------------
    setAnim(name, o = {}) {
      const def = LOOPS[name];
      if (!def) { console.warn('[Rig] unknown anim: ' + name); return this; }
      const st = this.state, top = st.layers[st.layers.length - 1];
      if (top && top.name === name) { if (o.speed !== undefined) top.speed = o.speed; top.opts = { ...top.opts, ...o }; return this; }
      const blend = o.blend ?? 0.25;
      const L = { name, def, t: 0, w: blend > 0 && st.layers.length ? 0 : 1, blend, speed: o.speed ?? 1, opts: { ...o } };
      if (L.w >= 1) st.layers = [L]; else { st.layers.push(L); if (st.layers.length > 4) st.layers.splice(0, st.layers.length - 4); }
      if (o.seat !== undefined) this.seatHeight = o.seat;
      this.anim = name;
      return this;
    },
    gesture(name, o = {}) {
      if (name === null) { this.finishGestures(); return DUMMY_P; }
      const def = GEST[name];
      if (!def) { console.warn('[Rig] unknown gesture: ' + name); return DUMMY_P; }
      const st = this.state, top = st.layers[st.layers.length - 1];
      if (o.habit && def.stand && top && /^sit|^kneel|^lie|crouch|climb|crawl/.test(top.name)) return DUMMY_P;
      if (def.hand === 'held' && o.habit && !this.held.R && !this.held.L) return DUMMY_P;
      const slot = def.slot;
      if (st.gest[slot]) this._endGesture(slot, true);
      let side = o.hand || null;
      // a hand is free if it holds nothing, or its prop is tucked under the arm / held against the chest
      const free = (h) => !this.held[h] || (this.held[h].userData.attach && this.held[h].userData.attach !== 'hand');
      if (!side) {
        if (def.hand === 'free') side = free('R') ? 'R' : free('L') ? 'L' : 'R';
        else if (def.hand === 'held') side = this.held.R ? 'R' : this.held.L ? 'L' : 'R';
        else side = 'R';
      }
      let resolve;
      const p = new Promise((r) => { resolve = r; });
      const g = { name, def, t: 0, u: 0, dur: (o.dur || def.dur) / (o.speed || 1), speed: 1, side, sx: sgn(side), data: {}, opts: o, resolve, fired: new Set(), hold: !!o.hold, w: 0 };
      st.gest[slot] = g;
      if (def.start) def.start(this, g);
      if (o.instant) this._endGesture(slot);
      return p;
    },
    // CONTRACT+: end every running gesture now (applies end effects: sit_down → sit, stand_up → idle)
    finishGestures() { for (const slot of ['body', 'head', 'fx']) if (this.state.gest[slot]) this._endGesture(slot); },
    _endGesture(slot, replaced) {
      const g = this.state.gest[slot]; if (!g) return;
      this.state.gest[slot] = null;
      if (g.def.events && !replaced) for (const [at, fn, must] of g.def.events) if (must && !g.fired.has(at)) { g.fired.add(at); fn(this, g); }
      if (g.def.end) g.def.end(this, g);
      g.resolve();
    },
    lookAt(target) { this.state.look.target = target || null; return this; },
    eyes(mode = 'ahead', target = null) {
      const E = this.state.eyes;
      E.mode = mode; E.target = target;
      if (mode === 'away') E.awaySide = this.rng() < 0.5 ? 1 : -1;
      const closed = mode === 'closed';
      if (this.paintEyes && closed !== this.faceState.closed) { this.faceState.closed = closed; this._paintFace(); }
      return this;
    },
    // expr(name, {k}) — CONTRACT+ k 0..1: how strongly (blended from neutral, in quarter steps)
    expr(name, o = {}) {
      if (!EXPRS[name]) { console.warn('[Rig] unknown expression: ' + name); return this; }
      const k = o && o.k !== undefined ? Math.round(clamp(+o.k) * 4) / 4 : 1;
      this.faceState.expr = k < 1 && name !== 'neutral' ? blendExpr(name, k) : name;
      this.faceState.tears = name === 'cry' ? true : this.faceState.tears && name === 'sad';
      this._paintFace();
      return this;
    },
    // CONTRACT+: talk(true|false|seconds) — the mouth moves while a line is up
    talk(on = true) { this.state.talkT = on === true ? 1e9 : on === false ? 0 : Math.max(0, +on); if (!this.state.talkT && this.faceState.talk) { this.faceState.talk = 0; this._paintFace(); } return this; },
    setTint(color, amount = 1, o = {}) {
      const c = new THREE.Color(color ?? 0x000000);
      for (const m of this.mats) {
        if (!m.emissive) continue;
        if (o.skin && !m.userData.skin && m !== this._mc.get('skin') && m !== this._mc.get('face') && m !== this._mc.get('lid')) continue;
        m.emissive.copy(c); m.emissiveIntensity = amount;
      }
      this.tint = { color: c, amount };
      return this;
    },
    setOpacity(alpha) {
      const a = clamp(alpha);
      for (const m of this.mats) {
        const bt = m.userData.baseTransparent, bo = m.userData.baseOpacity ?? 1;
        const tr = a < 0.999 || !!bt;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = bo * a;
        if (!bt) m.depthWrite = a > 0.55;
      }
      for (const s of SIDES) if (this.held[s]) this.held[s].traverse((o) => { if (o.material) for (const m of [].concat(o.material)) { m.transparent = a < 0.999 || !!m.userData.baseTransparent; m.opacity = (m.userData.baseOpacity ?? 1) * a; m.needsUpdate = true; } });
      this.opacity = a;
      this.root.visible = this._visible !== false && a > 0.002;
      return this;
    },
    visible(v) { this._visible = !!v; this.root.visible = !!v && (this.opacity ?? 1) > 0.002; return this; },
    // CONTRACT+: armPose(hand, name|null|{w,pole,fing,palm,curl,thumb}) — persistent carry pose (see Rig.ARM_POSES)
    armPose(hand, name) {
      const both = typeof name === 'string' && ARM_POSES[name] && ARM_POSES[name](this.D.T).both;
      if (both) { this.state.carry.L = name; this.state.carry.R = name; }
      else this.state.carry[hand] = name || null;
      return this;
    },
    _carryBoth() { return !!(this.state.carry.L && this.state.carry.R) && this.state.carryW.L > 0.99 && this.state.carryW.R > 0.99; },
    hold(hand, kind, o = {}) {
      hand = hand === 'L' ? 'L' : 'R';
      const prev = this.held[hand];
      if (prev) {
        if (prev.userData.kind === 'candybar' && this._beltPhoneSet) this._beltPhoneSet.visible = true;   // back on the belt
        prev.parent && prev.parent.remove(prev);
        if (prev.userData.rigOwned) this._disposeObj(prev);
        if (prev.userData.kind === 'phone' && this.phoneScreen && prev.userData.ownScreen) { this.phoneScreen = null; }
        this.held[hand] = null;
        if (this.state.carry[hand] && (!o.keepPose)) { const cur = this.state.carry[hand]; if (typeof cur === 'string' && ARM_POSES[cur] && ARM_POSES[cur](this.D.T).both) { this.state.carry.L = this.state.carry.R = null; } else this.state.carry[hand] = null; }
      }
      if (!kind) return null;
      let obj, pose = o.pose;
      if (typeof kind === 'string') {
        const def = PROP_DEFS[kind];
        if (!def) { console.warn('[Rig] unknown prop: ' + kind); return null; }
        obj = def.build(this, o, hand);
        obj.userData.kind = kind; obj.userData.rigOwned = true;
        if (kind === 'candybar' && this._beltPhoneSet) this._beltPhoneSet.visible = false;            // out of the pouch
        if (pose === undefined) pose = (typeof def.pose === 'function' ? def.pose(this, hand, o) : def.pose) || 'hold';
        this._attachProp(hand, obj, def, pose, o);
      } else {
        obj = kind;
        obj.userData.kind = obj.userData.kind || 'object';
        this.anchors['grip' + hand].add(obj);
        // CONTRACT+ o.offset [x,y,z] (m, grip space: palm centre; +Y along the fingers) and o.rot [x,y,z] (degrees):
        // where a custom object sits in the hand (default: its own origin at the grip)
        if (o.offset) obj.position.set(o.offset[0] || 0, o.offset[1] || 0, o.offset[2] || 0);
        if (o.rot) obj.rotation.set((o.rot[0] || 0) * Math.PI / 180, (o.rot[1] || 0) * Math.PI / 180, (o.rot[2] || 0) * Math.PI / 180);
        if (pose === undefined) pose = 'hold';
      }
      this.held[hand] = obj;
      obj.traverse((m) => { if (m.isMesh) m.castShadow = false; });                    // (see trimShadows)
      if (pose) this.armPose(hand, pose);
      if (this.tint) this.setTint(this.tint.color, this.tint.amount);
      if (this.opacity !== undefined && this.opacity < 1) this.setOpacity(this.opacity);
      return obj;
    },
    _attachProp(hand, obj, def, pose, o, force) {
      const T = this.D.T, H = this.H;
      const pd = typeof pose === 'string' && ARM_POSES[pose] ? ARM_POSES[pose](T) : null;
      const attach = force || (pd && pd.attach);
      obj.userData.def = def; obj.userData.pose = pose; obj.userData.opts = o;
      if (attach === 'chest' && def.chest) {          // flat against the chest (Chloe's tablet)
        this.bones.chest.add(obj); obj.userData.attach = 'chest';
        def.chest(this, obj);
        return;
      }
      if (attach === 'upperArm' && def.tuck) { this.bones['upperArm' + hand].add(obj); obj.userData.attach = 'upperArm'; def.tuck(this, obj, hand); return; }
      if (attach === 'chestSide' && def.tuckChest) { this.bones.chest.add(obj); obj.userData.attach = 'chestSide'; def.tuckChest(this, obj, hand); return; }
      obj.userData.attach = 'hand';
      const g = this.anchors['grip' + hand];
      g.add(obj);
      const gx = def.grip(this, o);
      const sx = sgn(hand);
      // grip transforms are authored for the left hand (palm −X); mirror across the hand's YZ plane for the right
      obj.position.set(gx.p[0] * sx, gx.p[1], gx.p[2]).sub(g.position);
      const m = new THREE.Matrix4().makeBasis(V3(...gx.b[0]), V3(...gx.b[1]), V3(...gx.b[2]));
      if (sx < 0) { const S = new THREE.Matrix4().makeScale(-1, 1, 1); m.premultiply(S).multiply(S); }
      obj.quaternion.setFromRotationMatrix(m);
    },
    // chest/upper-arm props move into the hand while a loop or gesture owns that arm, and back afterwards
    _syncProps() {
      const st = this.state;
      for (const s of SIDES) {
        const obj = this.held[s]; if (!obj || !obj.userData.def) continue;
        const pd = typeof obj.userData.pose === 'string' && ARM_POSES[obj.userData.pose] ? ARM_POSES[obj.userData.pose](this.D.T) : null;
        if (!pd || !pd.attach || pd.attach === 'handL') continue;
        const g = st.gest.body, busyOf = (h) => !!(g && g.w > 0.5 && g.def.hand && (g.def.hand === 'both' || g.side === h));
        const own = st.carryW[s] <= 0.5, busy = busyOf(s);
        let want = pd.attach;
        if (pd.attach === 'upperArm' && (own || busy)) want = obj.userData.def.tuckChest ? 'chestSide' : 'hand';
        else if (pd.attach === 'chest' && (own || (busy && busyOf(s === 'L' ? 'R' : 'L')))) want = 'hand';
        if (want !== obj.userData.attach) { obj.parent && obj.parent.remove(obj); obj.position.set(0, 0, 0); obj.quaternion.identity(); this._attachProp(s, obj, obj.userData.def, obj.userData.pose, obj.userData.opts, want); }
      }
    },
    _tempProp(hand, kind) {
      if (this.held[hand]) return null;
      const def = PROP_DEFS[kind], obj = def.build(this, {}, hand);
      obj.userData.rigOwned = true;
      this._attachProp(hand, obj, def, null, {});
      return obj;
    },
    _removeTemp(obj) { if (obj) { obj.parent && obj.parent.remove(obj); this._disposeObj(obj); } },
    _disposeObj(obj) {
      obj.traverse((c) => {
        if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
        if (c.material) for (const m of [].concat(c.material)) if (!m.userData.shared && m.userData.propOwned) { if (m.map && m.map.userData && !m.map.userData.shared) m.map.dispose(); m.dispose(); }
      });
    },
    // CONTRACT+: wear(kind, on) — 'headset' (operator headset on the head), 'glasses', 'earbuds', 'cap'
    wear(kind, on = true) {
      const had = [this.glassesObj, this.buds, this._headset];
      this._wear(kind, on);
      if (had[0] !== this.glassesObj || had[1] !== this.buds || had[2] !== this._headset) this._batchDirty = true;   // a new part: batch it too
      return this;
    },
    _wear(kind, on) {
      if (kind === 'glasses') { if (!this.glassesObj && on) this._glasses({ style: 'reading' }); else if (this.glassesObj) this.glassesState(on ? 'on' : 'off'); }
      else if (kind === 'earbuds') { if (!this.buds && on) this._earbuds('in'); else this.setEarbuds(on); }
      else if (kind === 'headset') {
        if (!this._headset) {
          const g = PROP_DEFS.headset.build(this, { worn: true });
          const u = this.D.head * this.H; g.scale.setScalar(1 / u);
          g.position.set(0, 0.62, -0.02); this.headSpace.add(g); this._headset = g;
        }
        this._headset.visible = !!on;
      } else if (kind === 'cap' && this.parts.hat) for (const h of [].concat(this.parts.hat)) h.visible = !!on;
      return this;
    },
    // CONTRACT+: setCard(text, role) — reprint the lanyard card (the Standard: LUKA → AIDAN)
    setCard(text, role) {
      if (!this.parts.card) return this;
      const tex = Tex.label(text, { style: 'card', role, photo: shadeHex(this.P.hair.color, 1.2) });
      this.cardMat.map = tex; this.cardMat.needsUpdate = true;
      return this;
    },
    // CONTRACT+: setPhoneLight(intensity) — a weak blue point light at the held phone's screen (face lit from below)
    setPhoneLight(intensity = 0.6) {
      if (!intensity) { if (this._plight) { this._plight.free(); this._plight = null; } return this; }
      if (this._plight && !this._plight.isOn) this._plight = null;               // freed with the pool (freeAllLights)
      if (!this._plight && typeof Render !== 'undefined' && Render.allocLight) this._plight = Render.allocLight('point', { color: '#a8c8ff', intensity, distance: 1.2, decay: 1, prio: 6 });
      if (this._plight) this._plight.intensity = intensity;
      return this;
    },
    _sfx(name, side) {
      if (!this.sound) return;
      const hb = side ? this.bones['hand' + side] : this.bones.chest;
      const p = hb.getWorldPosition(new THREE.Vector3());
      if (typeof Snd !== 'undefined' && Snd.play) Snd.play(name, { pos: [p.x, p.y, p.z], vol: name === 'pins' ? 0.3 : 0.8 });
      else Bus.emit('sfx', name, { pos: [p.x, p.y, p.z] });
    },
    _targetPos(t, out) {
      if (!t) return null;
      if (t.isVector3) return out.copy(t);
      if (Array.isArray(t)) return t.length === 2 ? out.set(t[0], this.root.position.y + this.H * 0.93, t[1]) : out.set(t[0], t[1], t[2]);
      const act = t instanceof Actor ? t : t.raw instanceof Actor ? t.raw : null;
      if (act) {
        if (act.eyeAnchors && act.eyeAnchors.L) { act.eyeAnchors.L.getWorldPosition(out); act.eyeAnchors.R.getWorldPosition(_V[14]); return out.add(_V[14]).multiplyScalar(0.5); }
        return act.bones.head.getWorldPosition(out);
      }
      if (t.isObject3D) return t.getWorldPosition(out);
      if (t.pos && t.pos.isVector3) return out.copy(t.pos).setY(t.pos.y + 1.6);
      return null;
    },
    // ---- per frame -------------------------------------------------------------------------------------------------
    update(dt = 0) {
      this._frame = Time.frame;
      dt = Math.min(Math.max(dt, 0), 0.1);
      if (!this.state.layers.length) return;
      this._measure(dt);
      this._advance(dt);
      const o = this.pose;
      this._sample(o);
      this._posture(o);
      this._carry(o, dt);
      this._gestures(o, dt);
      this._syncProps();
      this._life(o, dt);
      this._look(o, dt);
      this._apply(o);
      this.root.updateMatrixWorld(true);
      if (this._batchDirty) this.rebatch();
      if (this._batch) this._batch.check();
      this._eyesUpdate(dt);
      this._dangleUpdate(dt);
      if (this.budLines) this._updateBudLines();
      this._faceUpdate(dt);
      this._jingle(dt);
      if (this._plight && this.held.R && this.held.R.userData.screen) {
        const sc = this.held.R.userData.screen; sc.getWorldPosition(_V[15]); sc.getWorldDirection(_V[14]);
        this._plight.set({ pos: [_V[15].x + _V[14].x * 0.06, _V[15].y + _V[14].y * 0.06, _V[15].z + _V[14].z * 0.06] });
      }
    },
    _measure(dt) {
      const st = this.state;
      this.root.updateWorldMatrix(true, false);
      const p = _V[15].copy(this.body.position).applyMatrix4(this.root.matrixWorld);
      this.root.getWorldQuaternion(_Q);
      const fw = _V[14].set(0, 0, 1).applyQuaternion(_Q);
      const yaw = Math.atan2(fw.x, fw.z) + this.body.rotation.y;
      if (!st.hasPrev || dt <= 0) { st.prev.copy(p); st.prevYaw = yaw; st.hasPrev = true; return; }
      const dx = p.x - st.prev.x, dz = p.z - st.prev.z, dy = p.y - st.prev.y;
      let sp = Math.hypot(dx, dz) / dt;
      if (sp > 15) sp = 0;
      if (sp > 0.05) st.fwd = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) >= -0.02 * dt ? 1 : -1;
      st.speed = U.damp(st.speed, sp, 10, dt);
      st.vy = U.damp(st.vy, Math.abs(dy / dt) < 20 ? dy / dt : 0, 10, dt);
      st.yawRate = U.damp(st.yawRate, U.wrapAngle(yaw - st.prevYaw) / dt, 10, dt);
      st.prev.copy(p); st.prevYaw = yaw;
    },
    _advance(dt) {
      const st = this.state, layers = st.layers, r = this.rng;
      st.clock += dt; st.t = st.clock;
      const top = layers[layers.length - 1];
      if (top.w < 1) top.w = top.blend > 0 ? Math.min(1, top.w + dt / top.blend) : 1;
      if (top.w >= 1 && layers.length > 1) layers.splice(0, layers.length - 1);
      for (const L of layers) L.t += dt * L.speed;
      // gait phase shared by walk/run/pace/stagger (and the auto-walk of standing loops)
      let runK = 0, gw = 0;
      for (const L of layers) if (L.def.gait !== null) { runK += L.def.gait * L.w; gw += L.w; }
      runK = gw > 0 ? runK / gw : 0;
      let v = Math.max(st.speed, gw > 0.01 ? 0 : Math.abs(st.yawRate) * 0.3);
      if (gw > 0.01 && v < 0.12) v = top.name === 'pace' ? (st.pace.turning > 0 ? 0 : (top.opts.speed ?? 0.9) * top.speed) : (runK > 0.5 ? this.runSpeed : this.walkSpeed) * top.speed * (top.name === 'stagger' ? 0.45 : 1);
      st.gSpeed = U.damp(st.gSpeed, v, 8, dt);
      if (gw > 0.01 || v > 0.2) {
        const stride = stepLenFor(this, st.gSpeed, runK) * this.H;
        st.phase = (st.phase + (st.gSpeed / (2 * stride)) * dt * st.fwd + 1) % 1;
      }
      if (top.name === 'climb') st.climbPhase = (st.climbPhase + (st.vy / 0.6) * dt + 1) % 1;
      if (top.name === 'crawl') st.crawlPhase = (st.crawlPhase + (st.speed > 0.05 ? st.speed / (0.3 * this.H) : 0) * dt * st.fwd + 1) % 1;
      this._pace(dt, top);
      // weight shifts and habits (idle life)
      st.stanceW = U.damp(st.stanceW, st.stanceTarget, 2.4, dt);
      const standing = /^idle|^stand_still/.test(top.name) || top.name.startsWith('sit');
      if (this.idleLife && !top.def.still && st.speed < 0.2) {
        st.stanceTimer -= dt;
        if (st.stanceTimer <= 0 && !st.gest.fx) { st.stanceTarget = -Math.sign(st.stanceTarget || 1) * (0.7 + r() * 0.3); st.stanceTimer = 8 + r() * 12; }
        if (this.habits.length && standing && !st.gest.body) {
          st.habitT -= dt;
          if (st.habitT <= 0) { st.habitT = lerp(this.habitEvery[0], this.habitEvery[1], r()); this.gesture(this.habits[Math.floor(r() * this.habits.length)], { habit: true }); }
        }
      }
      const exertTarget = top.name === 'run' || top.name === 'run_bad' || top.name === 'struggle' || top.name === 'brace' ? 1 : top.name === 'hurt' || top.name === 'stagger' || top.name === 'cower' ? 0.6 : 0;
      st.exert = U.damp(st.exert, exertTarget, exertTarget > st.exert ? 0.8 : 0.12, dt);
      st.breath += dt * TAU / (4.3 / (1 + st.exert * 1.8));
    },
    _pace(dt, top) {
      const pc = this.state.pace, b = this.body;
      if (top.name === 'pace' && top.w > 0.5) {
        const range = top.opts.range ?? 1.1, spd = (top.opts.speed ?? 0.9) * top.speed;
        if (pc.turning > 0) {
          pc.turning -= dt;
          pc.yaw = pc.yaw0 + PI * smooth(1 - clamp(pc.turning / 0.9));
          if (pc.turning <= 0) { pc.turning = 0; pc.yaw = pc.yaw0 + PI; }
        } else {
          const dir = Math.cos(pc.yaw) >= 0 ? 1 : -1;
          pc.z += dir * spd * dt;
          if (pc.z * dir >= range) { pc.z = dir * range; pc.turning = 0.9; pc.yaw0 = pc.yaw; }
        }
      } else if (pc.z !== 0 || pc.yaw !== 0) {
        pc.turning = 0;
        pc.z = Math.abs(pc.z) < 1e-3 ? 0 : U.damp(pc.z, 0, 2.5, dt);
        const tgt = Math.round(pc.yaw / TAU) * TAU;
        pc.yaw = Math.abs(pc.yaw - tgt) < 1e-3 ? 0 : U.damp(pc.yaw, tgt, 3, dt);
        if (pc.yaw === 0) pc.yaw0 = 0;
      }
      b.position.set(0, 0, pc.z); b.rotation.y = pc.yaw;
    },
    _sample(o) {
      const st = this.state;
      let first = true;
      for (const L of st.layers) {
        if (first) { L.def.fn(o, this, st, L); first = false; continue; }
        if (L.w <= 0.001) continue;
        const t = this.tmp; L.def.fn(t, this, st, L); lerpPose(o, t, smooth(L.w));
      }
    },
    _carry(o, dt) {
      const st = this.state, top = st.layers[st.layers.length - 1];
      const own = top.def.arms === 'own';
      for (const s of SIDES) {
        const def = poseDef(this, st.carry[s], s);
        st.carryW[s] = U.damp(st.carryW[s], def && !own ? 1 : 0, 7, dt);
        if (dt === 0) st.carryW[s] = def && !own ? 1 : 0;
        if (!def || st.carryW[s] < 0.002) continue;
        const t = this.tmp; t.set(o);
        const both = typeof st.carry[s] === 'string' && ARM_POSES[st.carry[s]] && ARM_POSES[st.carry[s]](this.D.T).both;
        const mx = both || (typeof st.carry[s] === 'object' && !st.carry[s].w) ? 1 : sgn(s);
        const sway = top.def.gait !== null ? 0.012 * Math.cos(TAU * st.phase + (s === 'L' ? PI : 0)) * Math.min(1, st.gSpeed) : 0;
        const w = def.w;
        if (def.space === 'head') {
          const hd = (x, y, z, i) => { const M = fkTo(this, t, CH_HEAD); return _V[i].set(x, y, z).transformDirection(M); };
          headPt(this, t, w[0] * mx, w[1], w[2], _V[8]);
          armIK(this, t, s, _V[8], hd(def.pole[0] * mx, def.pole[1], def.pole[2], 9), { fing: hd(def.fing[0] * mx, def.fing[1], def.fing[2], 10), palm: hd(def.palm[0] * mx, def.palm[1], def.palm[2], 11) });
        } else armIK(this, t, s, chestPt(this, t, w[0] * mx, w[1], w[2] + sway, _V[8]), cd(this, t, def.pole[0] * mx, def.pole[1], def.pole[2], 9),
          { fing: cd(this, t, def.fing[0] * mx, def.fing[1], def.fing[2], 10), palm: cd(this, t, def.palm[0] * mx, def.palm[1], def.palm[2], 11) });
        fingers(t, s, def.curl, def.thumb);
        if (def.shrug) add(t, 'shoulder' + s, 0, 0, sgn(s) * def.shrug);
        const k = st.carryW[s];
        for (const b of ['shoulder', 'upperArm', 'foreArm', 'hand']) { const i = BI[b + s]; for (let j = 0; j < 3; j++) o[i + j] += (t[i + j] - o[i + j]) * k; }
        for (const c of ['curl', 'thumb', 'index']) { const i = CH[c + s]; o[i] += (t[i] - o[i]) * k; }
      }
    },
    _gestures(o, dt) {
      const st = this.state;
      for (const slot of ['body', 'head', 'fx']) {
        const g = st.gest[slot]; if (!g) continue;
        g.t += dt * g.speed;
        if (g.def.events) for (const [at, fn] of g.def.events) if (g.t >= at && !g.fired.has(at)) { g.fired.add(at); fn(this, g); }
        if (st.gest[slot] !== g) continue;
        if (g.t >= g.dur && !g.hold) { this._endGesture(slot); continue; }
        if (g.hold && g.t >= g.dur * 0.5 && !g.resolvedHold) { g.resolvedHold = true; g.resolve(); }
        const din = g.def.in, dout = g.def.out;
        g.u = clamp(g.t / g.dur);
        g.w = Math.min(din > 0 ? smooth(g.t / din) : 1, g.hold ? 1 : (dout > 0 ? smooth((g.dur - g.t) / dout) : 1));
        const t = this.tmp; t.set(o);
        g.def.fn(t, this, g, dt);
        lerpPose(o, t, g.w);
      }
    },
    _life(o, dt) {
      const st = this.state, P = this.P, sty = this.style;
      let life = 0, lean = 0, wsum = 0;
      for (const L of st.layers) { life += L.def.life * L.w; lean += L.def.lean * L.w; wsum += L.w; }
      life /= wsum || 1; lean /= wsum || 1;
      const top = st.layers[st.layers.length - 1];
      const still = top.def.still ? 0.2 : 1;
      const br = Math.sin(st.breath), amp = (0.6 + st.exert * 1.5) * Math.min(1.5, life);
      add(o, 'chest', -0.014 * br * amp, 0, 0); add(o, 'spine', -0.004 * br * amp, 0, 0);
      for (const s of SIDES) add(o, 'shoulder' + s, 0, 0, sgn(s) * 0.012 * br * amp);
      add(o, 'neck', 0.005 * br * amp, 0, 0); add(o, 'head', -0.004 * br * amp, 0, 0);
      const moving = clamp(st.speed / 0.5);
      const k = Math.min(1, life) * still * (1 - moving) * (top.def.gait !== null ? 0.3 : 1);
      const c = st.clock, n = (f, ph) => Math.sin(c * f + ph + this.n);
      o[HPX] += 0.003 * k * n(0.31, 1);
      add(o, 'spine', 0.006 * k * n(0.23, 2), 0.01 * k * n(0.17, 3), 0.008 * k * n(0.29, 4));
      add(o, 'chest', 0, 0.008 * k * n(0.21, 5), 0);
      if (!st.look.target) add(o, 'head', 0.02 * k * n(0.13, 6), 0.035 * k * n(0.11, 7), 0.012 * k * n(0.19, 8));
      for (const s of SIDES) o[CH['curl' + s]] += 0.05 * k * n(0.4 + sgn(s) * 0.1, 9);
    },
    // posture: Aidan's slouch fades with actor.posture; hunch is the monster knob; tension lifts the shoulders
    _posture(o) {
      const st = this.state, P = this.P, sty = this.style;
      let lean = 0, wsum = 0;
      for (const L of st.layers) { lean += L.def.lean * L.w; wsum += L.w; }
      lean /= wsum || 1;
      const sl = sty.slouch * clamp(1 - this.posture) * lean;
      const up = (sty.upright + (sty.slouch > 0 ? this.posture * 0.5 : 0)) * lean;
      const h = P.hunch * lean;
      add(o, 'spine', 0.05 * sl + 0.26 * h, 0, 0);
      add(o, 'chest', 0.1 * sl - 0.05 * up + 0.36 * h, 0, 0);
      add(o, 'neck', 0.13 * sl - 0.04 * up + 0.3 * h, 0, 0);
      add(o, 'head', -0.2 * sl + 0.04 * up - 0.48 * h, 0, 0);
      for (const s of SIDES) { const sx = sgn(s); add(o, 'shoulder' + s, 0, (-0.14 * sl + 0.06 * up - 0.22 * h) * sx, (0.025 * sl + 0.045 * sty.tension) * sx); }
      if (P.headTilt) { const tr = U.rad(P.headTilt); add(o, 'neck', tr * 0.55, 0, 0); add(o, 'head', tr * 0.45, 0, 0); }
    },
    _look(o, dt) {
      const st = this.state, L = st.look;
      let ty = 0, tp = 0;
      if (L.target) {
        const wp = this._targetPos(L.target, _V[15]);
        if (wp) {
          _M.inv.copy(this.bones.chest.matrixWorld).invert();
          const lp = wp.applyMatrix4(_M.inv);
          lp.y -= (this.D.neckY + this.D.neckLen + 0.06) * this.H; lp.z -= 0.02 * this.H;
          ty = clamp(Math.atan2(lp.x, lp.z), -1.22, 1.22);
          tp = clamp(Math.atan2(-lp.y, Math.hypot(lp.x, lp.z)), -0.55, 0.75);
        }
      }
      const rate = L.target ? 4.5 : 3;
      if (dt === 0) { L.yaw = ty; L.pitch = tp; } else { L.yaw = U.damp(L.yaw, ty, rate, dt); L.pitch = U.damp(L.pitch, tp, rate, dt); }
      add(o, 'neck', L.pitch * 0.35, L.yaw * 0.4, 0); add(o, 'head', L.pitch * 0.65, L.yaw * 0.6, 0);
      const ex = Math.max(0, Math.abs(L.yaw) - 0.8) * Math.sign(L.yaw);
      add(o, 'chest', 0, ex * 0.5, 0);
    },
    _apply(o) {
      const B = this.bones, H = this.H, P = this.P, st = this.state;
      for (let k = 0; k < BN.length; k++) { const b = B[BN[k]], i = k * 3; b.rotation.x = o[i]; b.rotation.y = o[i + 1]; b.rotation.z = o[i + 2]; }
      const rh = this.rest.hips;
      B.hips.position.set(rh.x + o[HPX] * H, rh.y + o[HPX + 1] * H, rh.z + o[HPX + 2] * H);
      const fingersOf = (hand, s, curl, thumb, idx) => {
        const sx = sgn(s);
        for (const r of hand.rows) r.piv.rotation.set(0, 0, -sx * curl * r.k);
        if (hand.index) { const ic = lerp(curl, -0.05, idx); for (const r of hand.index) r.piv.rotation.set(0, 0, -sx * ic * r.k); }
        const tr = hand.thumb.userData.rest;
        hand.thumb.rotation.set(tr.x + thumb * 0.35, sx * thumb * 0.25, tr.z - sx * thumb * 0.75);
      };
      for (const s of SIDES) fingersOf(this['hand' + s], s, clamp(o[CH['curl' + s]], -0.15, 1.15), clamp(o[CH['thumb' + s]], 0, 1.1), clamp(o[CH['index' + s]]));
      if (P.armJoints === 3) for (const s of SIDES) {
        const f = B['foreArm' + s], f2 = B['foreArm2' + s], bend = f.rotation.x;
        f.rotation.x = bend * 0.5 - 0.18; f2.rotation.set(bend * 0.5 + 0.1 + 0.08 * Math.sin(st.clock * 1.7 + sgn(s)), 0, sgn(s) * 0.12);
      }
      if (B.extra && B.extra.length && this.extraArmMode !== 'manual') {
        B.extra.forEach((e, k) => {
          for (const s of SIDES) {
            for (const n of ['shoulder', 'upperArm', 'foreArm', 'foreArm2', 'hand']) if (e[n + s] && B[n + s]) e[n + s].rotation.copy(B[n + s].rotation);
            if (this.extraArmMode === 'writhe') {
              const t = st.clock * (1.3 + k * 0.4) + (s === 'L' ? 0 : 1.7) + k;
              e['upperArm' + s].rotation.x += -0.3 + 0.45 * Math.sin(t); e['upperArm' + s].rotation.z += sgn(s) * (0.35 + 0.25 * Math.sin(t * 0.7));
              e['foreArm' + s].rotation.x += -0.4 - 0.45 * Math.sin(t * 1.3);
            }
          }
        });
        if (this.extraHands) for (const eh of this.extraHands) fingersOf(eh.hand, eh.side, clamp(o[CH['curl' + eh.side]] + 0.2), 0.5, 0);
      }
      if (B.jaw) B.jaw.rotation.x = clamp(o[CH.jaw]) * 0.5 + (this.P.jaw ? 0.04 * Math.sin(st.breath) : 0);
    },
    _eyesUpdate(dt) {
      const st = this.state, E = st.eyes, em = this.eyeMesh;
      if (!em || !em.L) return;
      const r = this.rng;
      st.blinkT -= dt;
      if (st.blinkT <= 0) { st.blinkP = 1e-4; st.blinkT = r() < 0.12 ? 0.3 : 3 + r() * 4; }
      let closure = 0;
      if (st.blinkP > 0) { st.blinkP += dt; closure = Math.sin(PI * Math.min(1, st.blinkP / 0.16)); if (st.blinkP >= 0.16) st.blinkP = 0; }
      const gb = st.gest.body, gEyes = gb && gb.def.eyes && gb.w > 0.5 ? gb.def.eyes : null;
      const mode = gEyes || E.mode;
      if (mode === 'closed') closure = 1;
      let yaw = 0, pitch = 0;
      const tgt = mode === 'at' ? E.target : (mode === 'ahead' && st.look.target) ? st.look.target : null;
      if (tgt || mode === 'away') {
        const wp = tgt ? this._targetPos(tgt, _V[15]) : null;
        if (wp) {
          _M.inv.copy(this.headSpace.matrixWorld).invert();
          const lp = wp.applyMatrix4(_M.inv);
          const ez = this.eyeAnchors.L.position.z;
          yaw = Math.atan2(lp.x, lp.z - ez); pitch = Math.atan2(-(lp.y - EYE.y), Math.hypot(lp.x, lp.z - ez));
        }
        if (mode === 'away') { const side = wp ? -Math.sign(yaw || E.awaySide) : E.awaySide; yaw = side * 0.5; pitch = 0.18; }
      }
      if (mode === 'down') { pitch = 0.5; yaw *= 0.3; }
      E.sacT -= dt;
      if (E.sacT <= 0) { E.sacX = (r() - 0.5) * 0.1; E.sacY = (r() - 0.5) * 0.06; E.sacT = 0.4 + r() * 2.2; if (st.gest.body || st.look.target) E.sacT *= 0.7; }
      const still = st.layers[st.layers.length - 1].def.still ? 0.2 : 1;
      yaw = clamp(yaw + E.sacX * still, -0.62, 0.62); pitch = clamp(pitch + E.sacY * still, -0.4, 0.55);
      if (dt === 0) { E.yaw = yaw; E.pitch = pitch; } else { E.yaw = U.damp(E.yaw, yaw, 22, dt); E.pitch = U.damp(E.pitch, pitch, 22, dt); }
      const ex = EXPRS[this.faceState.expr] || EXPRS.neutral;
      let up = -0.28 + ex.lid * 0.6 + Math.max(0, E.pitch) * 0.6 - Math.max(0, -E.pitch) * 0.25;
      let lo = 0.4 - ex.lower * 0.32 - Math.max(0, E.pitch) * 0.1;
      up = lerp(up, 0.3, closure); lo = lerp(lo, 0.36, closure * 0.4);
      for (const s of SIDES) {
        const m = em[s];
        m.ball.rotation.set(E.pitch, E.yaw + (tgt ? -sgn(s) * 0.02 : 0), 0);
        m.up.rotation.x = up; m.lo.rotation.x = lo;
      }
    },
    _dangleUpdate(dt) {
      if (dt <= 0) return;
      const g = _V[13], q = _Q, p = _V[12];
      for (const d of this.dangles) {
        const piv = d.obj, par = piv.parent; if (!par) continue;
        piv.getWorldPosition(p);
        if (!d.init) { d.prev.copy(p); d.vel.set(0, 0, 0); d.init = true; continue; }
        const vx = (p.x - d.prev.x) / dt, vy = (p.y - d.prev.y) / dt, vz = (p.z - d.prev.z) / dt;
        let ax = (vx - d.vel.x) / dt, ay = (vy - d.vel.y) / dt, az = (vz - d.vel.z) / dt;
        const al = Math.hypot(ax, ay, az); if (al > 60) { const k = 60 / al; ax *= k; ay *= k; az *= k; }
        d.vel.set(vx, vy, vz); d.prev.copy(p);
        g.set(-ax * d.gain * 0.1, -9.8 - ay * d.gain * 0.1, -az * d.gain * 0.1);
        par.getWorldQuaternion(q); q.invert(); g.applyQuaternion(q).normalize();
        let tx = Math.atan2(-g.z, -g.y) - d.h0x, tz = Math.atan2(g.x, -g.y) - d.h0z;
        tx = clamp(U.wrapAngle(tx), d.lim[0], d.lim[1]); tz = clamp(U.wrapAngle(tz), d.lim[2], d.lim[3]);
        d.vx += ((tx - d.ax) * d.stiff - d.vx * d.damp) * dt; d.vz += ((tz - d.az) * d.stiff - d.vz * d.damp) * dt;
        d.ax += d.vx * dt; d.az += d.vz * dt;
        d.ax = clamp(d.ax, d.lim[0] - 0.05, d.lim[1] + 0.05); d.az = clamp(d.az, d.lim[2] - 0.05, d.lim[3] + 0.05);
        piv.rotation.set(d.restX + d.ax, 0, d.restZ + d.az);
        d.swing = Math.abs(d.vx) + Math.abs(d.vz);
      }
    },
    _faceUpdate(dt) {
      const st = this.state, fs = this.faceState;
      if (st.talkT > 0) {
        st.talkT -= dt; st.talkFlip -= dt;
        if (st.talkFlip <= 0) { fs.talk = fs.talk ? 0 : 1; st.talkFlip = fs.talk ? 0.07 + this.rng() * 0.1 : 0.05 + this.rng() * 0.16; if (this.rng() < 0.12) st.talkFlip += 0.25; }
        if (st.talkT <= 0) fs.talk = 0;
      }
      this._paintFace();
    },
    _jingle(dt) {
      if (!this.jingle || !this.sound || !this.lanyard) return;
      this._jT = (this._jT || 0) - dt;
      const d = this.dangles.find((x) => x.obj === this.lanyard);
      if (d && d.swing > 1.2 && this._jT <= 0) { this._jT = 0.45 + this.rng() * 0.5; this._sfx(this.jingle); }
    },
    dispose() {
      LIVE.delete(this);
      if (this._batch) { this._batch.dispose(); this._batch = null; }
      for (const slot of ['body', 'head', 'fx']) if (this.state.gest[slot]) { const g = this.state.gest[slot]; this.state.gest[slot] = null; g.resolve(); }
      if (this._plight) { this._plight.free(); this._plight = null; }
      if (this.root.parent) this.root.parent.remove(this.root);
      for (const s of SIDES) if (this.held[s] && this.held[s].userData.rigOwned) this._disposeObj(this.held[s]);
      for (const m of this.mats) m.dispose();
      for (const d of this.disposables) d.dispose && d.dispose();
      for (const c of this._faceCache.values()) { c.width = 0; }
      if (this.phoneScreen && this.phoneScreen.dispose) this.phoneScreen.dispose();
      this.disposed = true;
    },
  });
  // cached face repaints (expression × mouth state) so talking never repaints the whole canvas
  const _paintFaceRaw = Actor.prototype._paintFace;
  Actor.prototype._paintFace = function (force) {
    const fc = this.faceCanvas; if (!fc) return;
    const st = this.faceState || { expr: 'neutral', talk: 0 };
    const key = st.expr + '|' + (st.talk > 0.5 ? 1 : 0) + '|' + (st.closed ? 1 : 0) + '|' + (st.tears ? 1 : 0) + '|' + (this.P.faceMode);
    if (!force && key === this._faceKey) return;
    const cache = this._faceCache;
    if (!force && cache && cache.has(key)) {
      fc.ctx.drawImage(cache.get(key), 0, 0); fc.tex.needsUpdate = true; this._faceKey = key; return;
    }
    _paintFaceRaw.call(this, true);
    this._faceKey = key;
    if (cache) {
      if (cache.size >= 8) { const k0 = cache.keys().next().value; cache.delete(k0); }
      const c = document.createElement('canvas'); c.width = fc.S; c.height = fc.S; c.getContext('2d').drawImage(fc.canvas, 0, 0);
      cache.set(key, c);
    }
  };
  // ---------------------------------------------------------------------------------------------------------------
  // Hand props (metres). grip(): transform in the LEFT hand's frame (fingers −Y, palm −X, thumb +Z); mirrored for R.
  // ---------------------------------------------------------------------------------------------------------------
  const B_FLAT = [[0, 0, -1], [0, -1, 0], [-1, 0, 0]];      // flat object lying in the palm, face away from the palm
  const B_FIST = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];        // object's +Y along the fist (thumb side up)
  const palmX = (a) => 0.0095 * a.D.handS * a.H;
  const handMid = (a) => 0.06 * a.D.handS * a.H;
  const roundBox = (w, h, d, ex = 8) => tube([[-h / 2, 0, 0, 0, 0, ex], [-h / 2 + 0.0008, w / 2, d / 2, 0, 0, ex], [h / 2 - 0.0008, w / 2, d / 2, 0, 0, ex], [h / 2, 0, 0, 0, 0, ex]], { seg: 16 });
  function drawPhoneScreen(ctx, w, h, dim = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgb(${30 * dim | 0},${52 * dim | 0},${70 * dim | 0})`); g.addColorStop(1, `rgb(${10 * dim | 0},${18 * dim | 0},${28 * dim | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(230,236,240,${0.85 * dim})`; ctx.font = `bold ${h * 0.035}px ${Tex.fonts.sans}`; ctx.textAlign = 'left'; ctx.fillText('NO SERVICE', w * 0.06, h * 0.05);
    ctx.textAlign = 'right'; ctx.fillRect(w * 0.8, h * 0.028, w * 0.12, h * 0.022);
    ctx.textAlign = 'center'; ctx.font = `300 ${h * 0.14}px ${Tex.fonts.sans}`; ctx.fillText('8:59', w / 2, h * 0.3);
    ctx.font = `${h * 0.032}px ${Tex.fonts.sans}`; ctx.fillText('Friday', w / 2, h * 0.36);
    ctx.fillStyle = `rgba(255,255,255,${0.25 * dim})`; ctx.fillRect(w * 0.35, h * 0.95, w * 0.3, h * 0.008);
  }
  const phoneLockTex = () => canvasTex('phonelock', 64, 128, (ctx, w, h) => drawPhoneScreen(ctx, w, h, 0.7));
  const tabletTex = () => canvasTex('tabletdash', 128, 176, (ctx, w, h) => {
    ctx.fillStyle = '#e9eeee'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#00a8a8'; ctx.fillRect(0, 0, w, h * 0.1);
    Tex.drawWordmark(ctx, w * 0.06, h * 0.075, h * 0.05, { color: '#ffcc00' });
    ctx.fillStyle = '#1b2626'; ctx.font = `bold ${h * 0.05}px ${Tex.fonts.sans}`; ctx.fillText('MONTH TO DATE', w * 0.07, h * 0.18);
    ctx.font = `bold ${h * 0.16}px ${Tex.fonts.sans}`; ctx.fillStyle = '#c0261d'; ctx.fillText('-11', w * 0.07, h * 0.36);
    for (let i = 0; i < 6; i++) { const v = [0.8, 0.95, 0.7, 0.9, 1, 0.55][i]; ctx.fillStyle = i === 5 ? '#c0261d' : '#00a8a8'; ctx.fillRect(w * (0.1 + i * 0.14), h * (0.85 - 0.35 * v), w * 0.09, h * 0.35 * v); }
    ctx.fillStyle = '#9aa'; ctx.fillRect(w * 0.07, h * 0.86, w * 0.86, 1);
  });
  const formTex = () => canvasTex('clipform', 128, 176, (ctx, w, h) => {
    ctx.fillStyle = '#efece2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222'; ctx.font = `bold ${h * 0.06}px ${Tex.fonts.sans}`; ctx.fillText('COACHING FORM', w * 0.08, h * 0.09);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.strokeRect(w * 0.08, h * (0.15 + i * 0.085), w * 0.84, h * 0.07); }
    TU.age(ctx, w, h, U.rng(5), 0.5);
  });
  const lcdTex = () => canvasTex('lcd', 64, 48, (ctx, w, h) => { ctx.fillStyle = '#9db594'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#28331f'; ctx.font = `bold ${h * 0.28}px ${Tex.fonts.mono}`; ctx.fillText('WAI', w * 0.1, h * 0.45); ctx.fillRect(w * 0.1, h * 0.62, w * 0.5, 2); ctx.fillRect(w * 0.75, h * 0.1, w * 0.06, h * 0.3); });
  const keypadTex = () => canvasTex('keypad', 64, 80, (ctx, w, h) => { ctx.fillStyle = '#2b2f33'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6d747a'; for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.1 + i * 0.3), h * (0.1 + j * 0.22), w * 0.22, h * 0.15); });
  const boxTex = () => canvasTex('accbox', 128, 128, (ctx, w, h) => { ctx.fillStyle = '#f2f1ec'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#00a8a8'; ctx.fillRect(0, h * 0.68, w, h * 0.32); Tex.drawWordmark(ctx, w * 0.1, h * 0.9, h * 0.13, { color: '#ffcc00' }); ctx.fillStyle = '#555'; ctx.font = `bold ${h * 0.09}px ${Tex.fonts.sans}`; ctx.fillText('SCREEN GUARD', w * 0.1, h * 0.3); });
  function keysGeo() {
    return geo('keys_ring', () => {
      const list = [vcol(xf(new THREE.TorusGeometry(0.017, 0.0016, 5, 16), [0, -0.017, 0]), () => [0.75, 0.75, 0.74])];
      const cols = [[0.78, 0.66, 0.36], [0.72, 0.72, 0.7], [0.75, 0.62, 0.3], [0.2, 0.2, 0.22], [0.7, 0.7, 0.68], [0.8, 0.68, 0.38], [0.62, 0.62, 0.6]];
      for (let k = 0; k < 7; k++) {
        const a = -HALF + (k - 3) * 0.28, cx = Math.cos(a) * 0.017, cy = -0.017 + Math.sin(a) * 0.017;
        const head = xf(new THREE.CylinderGeometry(0.011, 0.011, 0.0022, 10), [0, -0.012, 0], [HALF, 0, 0]);
        const blade = xf(new THREE.BoxGeometry(0.008, 0.042, 0.0018), [0, -0.04, 0]);
        list.push(vcol(xf(merge([head, blade]), [cx, cy, (k - 3) * 0.0012], [0, 0, a + HALF]), () => cols[k]));
      }
      return merge(list);
    });
  }
  const PROP_DEFS = {
    phone: {
      pose: 'phone',
      build(a, o, hand) {
        const g = new THREE.Group(); g.name = 'prop:phone';
        a._mesh(g, geo('p_phone', () => roundBox(0.071, 0.148, 0.0084)), a.plain(o.case || '#232427', { rough: 0.35, metal: 0.25 }), { s: 1, shadow: false, name: 'phoneBody' });
        let tex;
        if (o.screen || (o.screen !== false && a.P.phoneScreen && !a.phoneScreen)) {
          const sc = Tex.screen(128, 256); sc.draw((ctx, w, h) => drawPhoneScreen(ctx, w, h));
          a.phoneScreen = sc; tex = sc.tex; g.userData.ownScreen = true;
        } else tex = o.tex || phoneLockTex();
        const sm = a._mat('screen:' + tex.uuid, () => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: o.screenDim ? '#777' : '#ffffff' }));
        g.userData.screen = a._mesh(g, geo('p_phone_scr', () => new THREE.PlaneGeometry(0.064, 0.138)), sm, { s: 1, p: [0, 0, 0.0045], shadow: false, name: 'phoneScreen' });
        a._mesh(g, geo('p_phone_cam', () => new THREE.BoxGeometry(0.022, 0.024, 0.0018)), a.plain('#0e0f10', { rough: 0.25 }), { s: 1, p: [-0.019, 0.055, -0.0049], shadow: false });
        const torch = new THREE.Object3D(); torch.name = 'torch'; torch.position.set(-0.014, 0.062, -0.0065); torch.rotation.y = PI; g.add(torch); g.userData.torch = torch;
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.0048), -handMid(a), 0.003], b: B_FLAT }),
    },
    tablet: {
      pose: 'tablet_read',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:tablet';
        a._mesh(g, geo('p_tablet', () => roundBox(0.172, 0.245, 0.0095, 6)), a.plain(o.case || '#1b3536', { rough: 0.7 }), { s: 1, name: 'tabletBody' });
        const tex = o.tex || tabletTex();
        g.userData.screen = a._mesh(g, geo('p_tablet_scr', () => new THREE.PlaneGeometry(0.152, 0.222)), a._mat('screen:' + tex.uuid, () => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: '#b8c0c0' })), { s: 1, p: [0, 0, 0.0049], shadow: false, name: 'tabletScreen' });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.005), -handMid(a) - 0.03, 0.04], b: B_FLAT }),
      chest(a, obj) { const T = a.D.T, H = a.H, off = a.outerOff || 0.004; obj.position.set(0, 0.012 * H, (T.chestD + off + 0.012) * H + 0.005); obj.rotation.set(-0.1, PI, 0); },
      tuck(a, obj, hand) { const sx = sgn(hand), H = a.H; obj.position.set(-sx * (0.03 * a.D.limb * H + 0.007), -0.085 * H, 0.012 * H); obj.rotation.set(0, -sx * HALF, 0.08 * sx); },
      // pressed against the side of the chest while the tucking arm is busy
      tuckChest(a, obj, hand) { const sx = sgn(hand), T = a.D.T, H = a.H; obj.position.set(sx * (T.chestW * 1.02 + (a.outerOff || 0.004) + 0.004) * H + sx * 0.005, -0.03 * H, 0.01 * H); obj.rotation.set(0, sx * HALF, 0); },
    },
    bar: {
      pose: 'bar',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:bar';
        a._mesh(g, geo('p_bar', () => merge([
          new THREE.BoxGeometry(0.027, 0.6, 0.027),
          xf(new THREE.BoxGeometry(0.018, 0.02, 0.03), [0, -0.3, 0.002], [0.5, 0, 0.2]), xf(new THREE.BoxGeometry(0.012, 0.03, 0.02), [0.006, -0.305, -0.006], [-0.4, 0, -0.3]),
        ])), a.plain('#8b8f92', { rough: 0.42, metal: 0.8 }), { s: 1, name: 'bar' });
        a._mesh(g, geo('p_bar_lock', () => merge([new THREE.BoxGeometry(0.046, 0.07, 0.04), xf(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), [0, 0.01, 0.024], [HALF, 0, 0])])), a.plain('#1c1d1f', { rough: 0.5, metal: 0.3 }), { s: 1, p: [0, 0.255, 0], name: 'barLock' });
        return g;
      },
      grip: (a) => { const k = Math.SQRT1_2; return { p: [-0.013 * a.D.handS * a.H, -0.062 * a.D.handS * a.H - 0.2 * k, 0.2 * k], b: [[1, 0, 0], [0, k, -k], [0, k, k]] }; },
    },
    coffee: {
      pose: 'cup',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:coffee';
        a._mesh(g, geo('p_cup', () => merge([
          vcol(tube([[-0.058, 0, 0], [-0.057, 0.029, 0.029], [0.05, 0.04, 0.04], [0.054, 0.041, 0.041]], { seg: 16 }), () => [0.92, 0.9, 0.86]),
          vcol(tube([[-0.02, 0.0345, 0.0345], [0.028, 0.0392, 0.0392]], { seg: 16 }), () => [0.54, 0.4, 0.26]),
          vcol(tube([[0.05, 0.043, 0.043], [0.058, 0.043, 0.043], [0.062, 0.036, 0.036], [0.066, 0.03, 0.03, 0.0, 0.012], [0.067, 0, 0, 0, 0.01]], { seg: 16 }), () => [0.95, 0.94, 0.92]),
        ])), a.plain('#ffffff', { rough: 0.7, vc: true, side: 'double' }), { s: 1, name: 'cup' });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.034), -handMid(a) + 0.004, 0.004], b: B_FIST }),
    },
    clipboard: {
      pose: 'clipboard',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:clipboard';
        a._mesh(g, geo('p_clip_board', () => new THREE.BoxGeometry(0.23, 0.32, 0.005)), a.plain('#7d6041', { rough: 0.8 }), { s: 1, name: 'board' });
        const tex = o.tex || formTex();
        g.userData.paper = a._mesh(g, geo('p_clip_paper', () => new THREE.PlaneGeometry(0.21, 0.28)), a._mat('paper:' + tex.uuid, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })), { s: 1, p: [0, -0.012, 0.0028], shadow: false, name: 'paper' });
        a._mesh(g, geo('p_clip_clip', () => merge([new THREE.BoxGeometry(0.08, 0.035, 0.012), xf(new THREE.TorusGeometry(0.012, 0.003, 4, 10, PI), [0, 0.02, 0.004])])), a.plain('#9a9ea2', { rough: 0.35, metal: 0.85 }), { s: 1, p: [0, 0.145, 0.006], shadow: false, name: 'clip' });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.003), -handMid(a) - 0.05, 0.06], b: B_FLAT }),
    },
    candybar: {
      pose: 'phone',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:candybar';
        a._mesh(g, geo('p_candy', () => roundBox(0.047, 0.112, 0.018, 5)), a.plain('#3a3f45', { rough: 0.45, metal: 0.2 }), { s: 1, name: 'candybar' });
        a._mesh(g, geo('p_candy_lcd', () => new THREE.PlaneGeometry(0.032, 0.024)), a._mat('lcd', () => new THREE.MeshBasicMaterial({ map: lcdTex(), toneMapped: false, color: '#c8d4c0' })), { s: 1, p: [0, 0.026, 0.0092], shadow: false });
        a._mesh(g, geo('p_candy_keys', () => new THREE.PlaneGeometry(0.036, 0.046)), a.decal(keypadTex(), 'keypad', {}), { s: 1, p: [0, -0.022, 0.0092], shadow: false });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.009), -handMid(a), 0.003], b: B_FLAT }),
    },
    flip: {
      pose: 'phone',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:flip';
        const sm = a.plain('#a3a7ac', { rough: 0.35, metal: 0.7 });
        if (o.open) {
          a._mesh(g, geo('p_flip_lo', () => roundBox(0.05, 0.09, 0.011, 5)), sm, { s: 1, p: [0, -0.045, 0] });
          a._mesh(g, geo('p_flip_keys', () => new THREE.PlaneGeometry(0.038, 0.06)), a.decal(keypadTex(), 'keypad', {}), { s: 1, p: [0, -0.05, 0.0058], shadow: false });
          const top = new THREE.Group(); top.rotation.x = 0.28; g.add(top);
          a._mesh(top, geo('p_flip_hi', () => roundBox(0.05, 0.088, 0.009, 5)), sm, { s: 1, p: [0, 0.044, 0] });
          a._mesh(top, geo('p_flip_scr', () => new THREE.PlaneGeometry(0.038, 0.05)), a._mat('lcd', () => new THREE.MeshBasicMaterial({ map: lcdTex(), toneMapped: false, color: '#c8d4c0' })), { s: 1, p: [0, 0.048, 0.0047], shadow: false });
        } else {
          a._mesh(g, geo('p_flip_c', () => roundBox(0.05, 0.094, 0.02, 5)), sm, { s: 1 });
          a._mesh(g, geo('p_flip_ext', () => new THREE.PlaneGeometry(0.026, 0.018)), a.plain('#101418', { rough: 0.2 }), { s: 1, p: [0, 0.022, 0.0101], shadow: false });
        }
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.01), -handMid(a), 0.003], b: B_FLAT }),
    },
    headset: {
      pose: 'hold',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:headset';
        const pm = a.plain('#1d1e20', { rough: 0.5 });
        a._mesh(g, geo('p_hs_band', () => new THREE.TorusGeometry(0.086, 0.0055, 5, 18, PI)), pm, { s: 1, shadow: false });
        a._mesh(g, geo('p_hs_ear', () => merge([xf(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 12), [0.09, -0.005, 0], [0, 0, HALF]), xf(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), [-0.088, -0.002, 0], [0, 0, HALF])])), pm, { s: 1, shadow: false });
        const mic = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.095, -0.012, 0.012), V3(0.085, -0.075, 0.06), V3(0.04, -0.105, 0.1)]), 8, 0.0025, 4);
        a._mesh(g, geo('p_hs_mic', () => merge([mic, xf(new THREE.SphereGeometry(0.008, 8, 6), [0.038, -0.106, 0.102])])), pm, { s: 1, shadow: false });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.004), -handMid(a) - 0.07, 0.0], b: [[0, 0, -1], [0, 1, 0], [1, 0, 0]] }),
    },
    keys: {
      pose: 'hold',
      build(a) { const g = new THREE.Group(); g.name = 'prop:keys'; a._mesh(g, keysGeo(), a.plain('#a89a74', { rough: 0.35, metal: 0.85, vc: true }), { s: 1, shadow: false, name: 'keys' }); return g; },
      grip: (a) => ({ p: [-palmX(a) * 0.6, -handMid(a) + 0.01, 0.018], b: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }),
    },
    box_cutter: {
      pose: 'hold',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:box_cutter';
        a._mesh(g, geo('p_bc', () => merge([vcol(new THREE.BoxGeometry(0.022, 0.13, 0.016), () => [0.88, 0.68, 0.12]), vcol(xf(new THREE.BoxGeometry(0.023, 0.05, 0.012), [0, -0.02, 0]), () => [0.12, 0.12, 0.12])])), a.plain('#ffffff', { rough: 0.5, vc: true }), { s: 1, name: 'cutterHandle' });
        a._mesh(g, geo('p_bc_blade', () => { const s = new THREE.Shape(); s.moveTo(-0.008, 0); s.lineTo(0.008, 0); s.lineTo(0.008, 0.02); s.lineTo(-0.008, 0.032); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: false }).translate(0, 0.064, -0.0004); }), a.plain('#c9ccd0', { rough: 0.2, metal: 0.95 }), { s: 1, shadow: false, name: 'blade' });
        return g;
      },
      grip: (a) => ({ p: [-0.013 * a.D.handS * a.H, -0.062 * a.D.handS * a.H, 0.02], b: B_FIST }),
    },
    extinguisher: {
      pose: 'extinguisher',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:extinguisher';
        a._mesh(g, geo('p_ext', () => tube([[-0.25, 0, 0], [-0.248, 0.066, 0.066], [0.13, 0.07, 0.07], [0.17, 0.056, 0.056], [0.19, 0.03, 0.03], [0.2, 0, 0]], { seg: 16 })), a.plain('#a8261d', { rough: 0.35, metal: 0.3 }), { s: 1, name: 'extinguisher' });
        a._mesh(g, geo('p_ext_valve', () => merge([xf(new THREE.CylinderGeometry(0.018, 0.02, 0.05, 10), [0, 0.22, 0]), xf(new THREE.BoxGeometry(0.02, 0.012, 0.13), [0, 0.25, -0.03], [0.15, 0, 0]), xf(new THREE.BoxGeometry(0.02, 0.01, 0.11), [0, 0.272, -0.02], [0.35, 0, 0]),
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.23, 0.02), V3(0, 0.2, 0.09), V3(0, 0.0, 0.09), V3(0, -0.12, 0.075)]), 10, 0.008, 5)])), a.plain('#191a1c', { rough: 0.5, metal: 0.2 }), { s: 1, name: 'valve' });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.004), -handMid(a) - 0.25, 0.0], b: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }),
    },
    pen: {
      pose: 'hold',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:pen';
        a._mesh(g, geo('p_pen', () => merge([vcol(tube([[-0.07, 0, 0], [-0.066, 0.0035, 0.0035], [-0.05, 0.0048, 0.0048], [0.062, 0.0048, 0.0048], [0.064, 0, 0]], { seg: 8 }), () => [0.16, 0.22, 0.5]),
          vcol(xf(new THREE.CylinderGeometry(0.0025, 0.0025, 0.012, 6), [0, 0.068, 0]), () => [0.85, 0.85, 0.85]), vcol(xf(new THREE.BoxGeometry(0.003, 0.04, 0.002), [0, 0.04, 0.0055]), () => [0.8, 0.8, 0.82])])), a.plain('#ffffff', { rough: 0.35, vc: true }), { s: 1, shadow: false, name: 'pen' });
        return g;
      },
      grip: (a) => ({ p: [-0.012 * a.D.handS * a.H, -0.062 * a.D.handS * a.H, 0.03], b: B_FIST }),
    },
    box: {
      pose: 'offer',
      build(a) { const g = new THREE.Group(); g.name = 'prop:box'; const bm = a._mat('accbox', () => new THREE.MeshStandardMaterial({ map: boxTex(), roughness: 0.6 })); a._mesh(g, geo('p_box', () => new THREE.BoxGeometry(0.11, 0.15, 0.045)), bm, { s: 1, name: 'box' }); return g; },
      grip: (a) => ({ p: [-(palmX(a) + 0.024), -handMid(a) + 0.01, 0.0], b: B_FLAT }),
    },
    jumper_tool: {
      pose: 'hold',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:jumper_tool';
        a._mesh(g, geo('p_jt_h', () => tube([[-0.05, 0, 0], [-0.048, 0.009, 0.009], [0.045, 0.011, 0.011], [0.05, 0.007, 0.007]], { seg: 8 })), a.plain('#7a5232', { rough: 0.7 }), { s: 1, name: 'handle' });
        a._mesh(g, geo('p_jt_hook', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.05, 0), V3(0, 0.12, 0), V3(0, 0.145, 0.005), V3(0.0, 0.15, 0.018), V3(0, 0.14, 0.024)]), 12, 0.0022, 5)), a.plain('#9ea3a8', { rough: 0.3, metal: 0.9 }), { s: 1, name: 'hook' });
        return g;
      },
      grip: (a) => ({ p: [-0.013 * a.D.handS * a.H, -0.062 * a.D.handS * a.H, 0.01], b: B_FIST }),
    },
    pendant: {
      pose: 'hold',
      build(a) {
        const g = new THREE.Group(); g.name = 'prop:pendant';
        a._mesh(g, geo('pendant_body', () => tube([[-0.024, 0, 0], [-0.022, 0.014, 0.005, 0, 0, 3], [0.0, 0.017, 0.006, 0, 0, 3], [0.018, 0.014, 0.005, 0, 0, 3], [0.021, 0, 0]], { seg: 12 })), a.plain('#e4e2dc', { rough: 0.4 }), { s: 1, name: 'pendant' });
        a._mesh(g, geo('pendant_btn', () => new THREE.CylinderGeometry(0.0085, 0.009, 0.004, 12)), a.plain('#b3261e', { rough: 0.35 }), { s: 1, p: [0, 0, 0.0055], r: [HALF, 0, 0], shadow: false });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.006), -handMid(a), 0.004], b: B_FLAT }),
    },
    handset: {
      pose: 'phone_ear',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:handset';
        a._mesh(g, geo('p_handset', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, -0.1, 0.012), V3(0, -0.04, -0.004), V3(0, 0.04, -0.004), V3(0, 0.1, 0.012)]), 10, 0.016, 8)), a.plain(o.color || '#d6d0c2', { rough: 0.45 }), { s: 1, name: 'handset' });
        a._mesh(g, geo('p_handset_ends', () => merge([xf(new THREE.CylinderGeometry(0.026, 0.024, 0.02, 12), [0, 0.1, 0.024], [HALF, 0, 0]), xf(new THREE.CylinderGeometry(0.024, 0.022, 0.02, 12), [0, -0.1, 0.024], [HALF, 0, 0])])), a.plain(o.color || '#d6d0c2', { rough: 0.45 }), { s: 1 });
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.014), -handMid(a), 0.004], b: [[0, 0, -1], [0, 1, 0], [1, 0, 0]] }),
    },
    card: {
      pose: 'card',
      build(a, o) {
        const g = new THREE.Group(); g.name = 'prop:card';
        const tex = Tex.label(o.text || 'LEVEL 4', { style: 'card', role: o.role || 'ACCESS' });
        const w = a.plain('#ecebe6', { rough: 0.35 });
        const cm = new THREE.Mesh(geo('lan_card', () => new THREE.BoxGeometry(0.054, 0.086, 0.0012)), [w, w, w, w, a._mat('card:' + (o.text || 'LEVEL 4'), () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 })), w]);
        g.add(cm);
        return g;
      },
      grip: (a) => ({ p: [-(palmX(a) + 0.002), -handMid(a) - 0.035, 0.012], b: B_FLAT }),
    },
  };
  const PROP_KINDS = Object.keys(PROP_DEFS);
  // a standalone prop (items, dressing): shared-material factory with the actor helper methods
  const PROP_FACTORY = (() => {
    const f = Object.create(Actor.prototype);
    Object.assign(f, { mats: [], _mc: new Map(), H: 1.75, D: { handS: 1, T: torsoDims(BUILDS.average), limb: 1, head: 0.128 }, parts: {}, P: { hair: { color: '#333' } }, disposables: [] });
    return f;
  })();
  function standaloneProp(kind, o = {}) {
    const def = PROP_DEFS[kind];
    if (!def) { console.warn('[Rig] unknown prop ' + kind); return new THREE.Group(); }
    const obj = def.build(PROP_FACTORY, { ...o, screen: false }, 'R');
    obj.traverse((c) => { if (c.material) for (const m of [].concat(c.material)) m.userData.shared = true; });
    obj.userData.kind = kind;
    return obj;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Presets — spec §5 cast bible
  // ---------------------------------------------------------------------------------------------------------------
  const TEAL = '#15817e', TEAL_FRESH = '#199d99';
  const PRESETS = {
    aidan: { params: {
      height: 1.78, build: 'slim', gender: 'm', age: 22, skin: '#d8ab8f', seed: 22,
      hair: { style: 'short_messy', color: '#2a211a' },
      face: { eyes: '#4b3a2a', brows: '#2a2019', browThick: 1, bags: 0.3, stubble: 0.14 },
      top: { kind: 'polo', color: TEAL, logo: true }, layers: [{ kind: 'hoodie', color: '#393a3d', open: true }],
      pants: { kind: 'work', color: '#1d1e20' }, shoes: { kind: 'sneaker', color: '#d4cfc3', sole: '#b9b3a6' },
      lanyard: { color: '#0f7a77', card: 'AIDAN' },
      style: { slouch: 1, armSwing: 0.7, runBad: 1, tension: 0.35 }, habits: ['shift_weight', 'rub_neck', 'pen_click'], habitEvery: [8, 16],
      posture: 0, phoneScreen: true, walkSpeed: 1.3, runSpeed: 3.4,
    }, hold: { R: 'phone' } },
    aidan_perfect: { params: {
      height: 1.78, build: 'slim', gender: 'm', age: 22, skin: '#dcb095', seed: 22,
      hair: { style: 'neat', color: '#2a211a' },
      face: { eyes: '#4b3a2a', brows: '#2a2019', browThick: 1, bags: 0, stubble: 0, blush: 1.2 },
      top: { kind: 'polo', color: TEAL_FRESH, logo: true, fresh: true },
      pants: { kind: 'work', color: '#151517' }, shoes: { kind: 'dress', color: '#0e0e0f', sole: '#0a0a0a' },
      lanyard: { color: '#0f7a77', card: 'AIDAN', role: 'TOP PERFORMER' }, badge: 'AIDAN — #1',
      style: { upright: 1, armSwing: 0.85 }, habits: [], posture: 1, idleLife: true,
    }, expr: 'smile' },
    wai: { params: {
      height: 1.7, build: 'stocky', gender: 'm', age: 56, skin: '#b8885f', seed: 56,
      hair: { style: 'crew', color: '#8e8c87' },
      face: { eyes: '#34261b', brows: '#5e5a54', browThick: 1.2, wrinkles: 0.75, stubble: 0.3, bags: 0.35, beardColor: '#8a8781' },
      top: { kind: 'tee', color: '#5d6264' }, layers: [{ kind: 'jacket', color: '#3b4960', patch: 'SIGNAL HILL EXCH.\nLINES', open: false }],
      pants: { kind: 'work', color: '#3a3d42' }, shoes: { kind: 'boot', color: '#29241f', sole: '#151412' },
      glasses: { style: 'reading', color: '#2b2320', low: true, cord: false }, toolroll: true, beltPhone: true,
      style: { armSwing: 0.75, heavy: 0.35, stepLen: 0.92 }, habits: ['peer', 'fidget', 'nod'], habitEvery: [7, 14],
      walkSpeed: 1.0, runSpeed: 1.8,
    } },
    chase: { params: {
      height: 1.83, build: 'broad', gender: 'm', age: 23, skin: '#dbac88', seed: 23,
      hair: { style: 'short', color: '#5a4430' },
      face: { eyes: '#5b6d78', brows: '#46352a', browThick: 1.15, scar: 'left_brow', stubble: 0.22, bags: 0.15 },
      top: { kind: 'polo', color: '#16847e', logo: true, sleeves: 'pushed' },
      pants: { kind: 'work', color: '#1f2023' }, shoes: { kind: 'boot', color: '#232221', sole: '#111' },
      badge: 'CHASE', earbuds: 'in',
      style: { bounce: 1.5, armSwing: 1.15, tension: 0.3 }, habits: ['bounce', 'check_shoulder', 'tap_bar', 'check_shoulder'], habitEvery: [2.5, 6],
      walkSpeed: 1.45, runSpeed: 4.0,
    }, hold: { R: 'bar' } },
    chloe: { params: {
      height: 1.68, build: 'slight', gender: 'f', age: 26, skin: '#e3bb9f', seed: 26,
      hair: { style: 'ponytail', color: '#221812' },
      face: { eyes: '#4a3322', brows: '#291c15', browThick: 0.75, redRim: 0.85, makeup: 0.6, lips: '#a3524d', blush: 0.8 },
      top: { kind: 'polo', color: TEAL_FRESH, logo: true, fresh: true },
      pants: { kind: 'slacks', color: '#161618' }, shoes: { kind: 'flat', color: '#121212', sole: '#0c0c0c' },
      lanyard: { color: '#0f7a77', card: 'CHLOE', role: 'TOP PERFORMER', pins: 30 },
      style: { upright: 1, narrow: 0.9, armSwing: 0.45, bounce: 0.6, stepLen: 0.95 }, habits: ['tremor', 'grip', 'smooth_uniform', 'tremor'], habitEvery: [6, 12],
      walkSpeed: 1.25,
    }, hold: { L: ['tablet', { pose: 'shield' }] }, expr: 'smile' },
    luka: { params: {
      height: 1.8, build: 'average', gender: 'm', age: 32, skin: '#c99e7c', seed: 32,
      hair: { style: 'short', color: '#2b221b' }, beard: 'scruffy',
      face: { eyes: '#3c2a1e', brows: '#2a2019', browThick: 1.1, bags: 0.9, wrinkles: 0.15, beardColor: '#2e241c' },
      top: { kind: 'polo', color: TEAL, logo: true },
      pants: { kind: 'work', color: '#26272a' }, shoes: { kind: 'dress', color: '#1b1a19', sole: '#0f0f0f' },
      lanyard: { color: '#161618', card: 'LUKA', role: 'STORE LEADER', keys: true },
      style: { slouch: 0.3, armSwing: 0.7, heavy: 0.2, sitHeavy: true }, habits: ['rub_eyes', 'sigh', 'nod'], habitEvery: [8, 15],
      sitAnim: 'sit_lean', walkSpeed: 1.25,
    }, hold: { L: ['tablet', { pose: 'tuck' }], R: 'coffee' } },
    luke: { params: {
      height: 1.85, build: 'broad', gender: 'm', age: 25, skin: '#d0a07c', seed: 25,
      hair: { style: 'buzz', color: '#4a3a2b' },
      face: { eyes: '#56462f', brows: '#3d3024', browThick: 1.2, stubble: 0.55, bags: 0.45 },
      top: { kind: 'hivis', color: '#d9701f', color2: '#1f2a45' },
      pants: { kind: 'track', color: '#34363a' }, shoes: { kind: 'boot', color: '#7a5b3a', sole: '#2a211a' },
      visitor: 'LUKE', hands: { scraped: true },
      style: { heavy: 1, armSwing: 0.9, stepLen: 1.04, tension: 0.7 }, habits: ['shift_weight', 'clench', 'raise_phone', 'rub_neck'], habitEvery: [5, 10],
      walkSpeed: 1.35,
    }, hold: { L: ['phone', { case: '#8a6f94', screen: false }] } },
    nan: { params: {
      height: 1.55, build: 'frail', gender: 'f', age: 79, skin: '#e8c6b1', seed: 79,
      hair: { style: 'bun', color: '#cfcbc4' },
      face: { eyes: '#5b6f86', brows: '#9c958c', browThick: 0.7, wrinkles: 1, blush: 1, lips: '#b37772', bags: 0.3 },
      top: { kind: 'blouse', color: '#e6dfcf' }, layers: [{ kind: 'cardigan', color: '#5a7aa3', open: true }],
      pants: { kind: 'slacks', color: '#6c6862' }, shoes: { kind: 'flat', color: '#b7a186', sole: '#6a5e50' },
      glasses: { style: 'reading', color: '#8a6a4a', metal: true }, pendant: { color: '#e8e6e0', cord: '#2a2a2c' },
      style: { slouch: 0.5, stepLen: 0.72, narrow: 0.5, armSwing: 0.5 }, habits: ['touch_pendant', 'nod'], habitEvery: [9, 16],
      walkSpeed: 0.7, runSpeed: 1.0,
    }, expr: 'smile' },
    nan_gown: { params: {
      height: 1.55, build: 'frail', gender: 'f', age: 79, skin: '#e6c3ae', seed: 79,
      hair: { style: 'bun', color: '#cfcbc4' },
      face: { eyes: '#5b6f86', brows: '#9c958c', browThick: 0.7, wrinkles: 1, blush: 0.7, lips: '#b37772', bags: 0.45 },
      top: { kind: 'gown' }, layers: [{ kind: 'cardigan', color: '#5a7aa3', open: true, long: true }],
      pants: { kind: 'none' }, shoes: { kind: 'sock', color: '#e6e2da', sole: '#e6e2da' },
      glasses: { style: 'reading', color: '#8a6a4a', metal: true },
      style: { slouch: 0.4, stepLen: 0.65, narrow: 0.5, armSwing: 0.4 }, habits: ['nod'], habitEvery: [10, 18],
      walkSpeed: 0.5, anim: 'sit_bed',
    }, anim: 'sit_bed' },
    man_counter: { params: {
      height: 1.8, build: 'average', gender: 'm', age: 44, skin: '#c69070', seed: 44,
      hair: { style: 'receding', color: '#3a332d' },
      face: { eyes: '#3b2d22', brows: '#2e2620', stubble: 0.6, bags: 0.65, wrinkles: 0.35 },
      top: { kind: 'polo', color: '#39475a' },
      pants: { kind: 'jeans', color: '#3b4659' }, shoes: { kind: 'boot', color: '#4a3a2b', sole: '#1c1712' },
      style: { heavy: 0.4, slouch: 0.3 }, habits: ['shift_weight', 'sigh'], habitEvery: [6, 12],
    }, hold: { R: ['phone', { pose: 'phone_up', screen: false }] }, expr: 'tired' },
    old_man: { params: {
      height: 1.7, build: 'frail', gender: 'm', age: 84, skin: '#dcb49c', seed: 84,
      hair: { style: 'receding', color: '#c4c0b9' }, hat: 'flatcap', hatColor: '#5a5046',
      face: { eyes: '#5d5a52', brows: '#b0aaa0', browThick: 1.1, wrinkles: 1, bags: 0.45, stubble: 0.2, beardColor: '#bbb7b0' },
      top: { kind: 'shirt', color: '#b9b3a3' }, layers: [{ kind: 'jacket', color: '#5c4c3c', open: true }],
      pants: { kind: 'slacks', color: '#55524c' }, shoes: { kind: 'dress', color: '#3b2a1e', sole: '#1c140e' },
      hunch: 0.15, style: { slouch: 0.8, stepLen: 0.62, armSwing: 0.4, narrow: 0.3 }, habits: ['shift_weight', 'nod'], habitEvery: [8, 14],
      walkSpeed: 0.65, runSpeed: 0.9,
    }, hold: { R: ['flip', { pose: 'phone_look' }] } },
    customer: { params: (seed) => genericPerson(seed, false), hold: (seed) => (U.rng(seed * 11 + 3)() < 0.4 ? { R: ['phone', { screen: false }] } : null) },
    rep: { params: (seed) => genericPerson(seed, true), expr: 'smile' },
  };
  const SKINS = ['#e8c4ae', '#dcb095', '#d0a07c', '#c08d68', '#a8744f', '#8a5a3b', '#6e4630', '#e2bba2'];
  const HAIRC = ['#1e1a17', '#2b221b', '#3d2e22', '#5a4430', '#7a5a3c', '#a07c50', '#b89a6a', '#8e8c87', '#c9c6c0'];
  const MUTED = ['#4f5a63', '#6b5d52', '#3e4a3f', '#7a6f60', '#5e3f3f', '#384454', '#8a857a', '#2f3336', '#6f7a7f', '#7d5f45', '#4d4a5c', '#8c7a5a'];
  const REP_NAMES = ['JESS', 'TOM', 'PRIYA', 'MARCUS', 'BEC', 'SAM', 'LIAM', 'ZOE', 'DANIEL', 'MEI', 'OLIVIA', 'JOSH', 'AMIR', 'KATE', 'NGOC', 'RHYS'];
  function genericPerson(seed, rep) {
    const r = U.rng((seed || 1) * 7907 + (rep ? 101 : 7));
    const pk = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
    const f = r() < 0.5, age = rep ? 19 + Math.floor(r() * 18) : 18 + Math.floor(r() * 64);
    const old = age > 60;
    const hairStyle = f ? pk(old ? ['bun', 'bob', 'short'] : ['ponytail', 'bob', 'long', 'bun']) : pk(old ? ['receding', 'crew', 'bald'] : ['short', 'short_messy', 'crew', 'buzz']);
    const hc = old ? pk(HAIRC.slice(6)) : pk(HAIRC.slice(0, 7));
    const P = {
      height: f ? 1.56 + r() * 0.16 : 1.68 + r() * 0.2, gender: f ? 'f' : 'm', age, seed,
      build: f ? pk(['slight', 'slight', 'average', old ? 'frail' : 'slight']) : pk(['average', 'slim', 'stocky', 'broad', old ? 'frail' : 'heavy']),
      skin: pk(SKINS), hair: { style: hairStyle, color: hc },
      face: { eyes: pk(['#3b2a1e', '#4a3526', '#5b6f86', '#56462f', '#2e2620', '#5d6e78']), brows: shadeHex(hc, 0.85), wrinkles: clamp((age - 35) / 40), bags: r() * 0.5, stubble: f ? 0 : r() * 0.6, lips: f && r() < 0.5 ? '#a8605a' : undefined, makeup: f && r() < 0.5 ? 0.4 : 0 },
      beard: !f && !rep && r() < 0.2 ? pk(['neat', 'scruffy', 'full']) : null,
      glasses: old && r() < 0.6 ? { style: pk(['reading', 'square', 'round']), color: pk(['#2b2320', '#8a6a4a', '#555']) } : (!old && r() < 0.15 ? { style: 'square', color: '#1d1d1f' } : null),
      style: { slouch: old ? 0.6 : r() * 0.4, armSwing: 0.7 + r() * 0.4, heavy: r() * 0.4 }, habits: ['shift_weight', 'fidget', 'sigh'], habitEvery: [7, 16],
    };
    if (rep) {
      P.top = { kind: 'polo', color: TEAL_FRESH, logo: true };
      P.pants = { kind: f ? pk(['slacks', 'work']) : 'work', color: '#18181a' };
      P.shoes = { kind: f ? 'flat' : 'dress', color: '#131313', sole: '#0c0c0c' };
      P.lanyard = { color: '#0f7a77', card: pk(REP_NAMES) };
    } else {
      const kinds = old ? ['cardigan', 'shirt', 'jumper', 'jacket'] : ['tee', 'hoodie', 'shirt', 'jumper', 'jacket', 'polo'];
      const k = pk(kinds), c = pk(MUTED);
      if (k === 'hoodie' || k === 'jacket' || k === 'cardigan') { P.top = { kind: 'tee', color: pk(MUTED) }; P.layers = [{ kind: k, color: c, open: r() < 0.6 }]; }
      else P.top = { kind: k, color: c };
      const pkind = f && r() < 0.3 ? 'skirt' : pk(['jeans', 'jeans', 'slacks', 'track', 'work']);
      P.pants = { kind: pkind, color: pkind === 'jeans' ? pk(['#3b4659', '#2e3747', '#4a5468']) : pk(['#2e2f33', '#4a463f', '#5a574f', '#34363a']), legs: pkind === 'skirt' ? '#6a5a50' : undefined };
      P.shoes = { kind: pk(['sneaker', 'boot', 'dress', f ? 'flat' : 'sneaker']), color: pk(['#d4cfc3', '#2a2826', '#5a4630', '#6c6a66']), sole: pk(['#b9b3a6', '#151412', '#3a2e22']) };
    }
    return P;
  }
  function mergeParams(base, opts) {
    const out = { ...base };
    for (const k of Object.keys(opts)) {
      const v = opts[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && !v.isColor && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = { ...base[k], ...v };
      else out[k] = v;
    }
    return out;
  }
  function human(params = {}) { return new Actor(normParams(params)); }
  function create(id, opts = {}) {
    const pr = PRESETS[id];
    if (!pr) { console.warn('[Rig] unknown preset ' + id + ' — using customer'); return create('customer', opts); }
    const seed = opts.seed ?? 1;
    const base = typeof pr.params === 'function' ? pr.params(seed) : pr.params;
    const { hold: holdOpt, props: propsOpt, anim: animOpt, expr: exprOpt, ...rest } = opts;
    const P = mergeParams(base, rest);
    P.preset = id;
    if (animOpt || pr.anim) P.anim = animOpt || pr.anim;
    const a = human(P);
    const holds = holdOpt !== undefined ? holdOpt : (typeof pr.hold === 'function' ? pr.hold(seed) : pr.hold);
    if (holds && propsOpt !== false) for (const s of SIDES) if (holds[s]) { const h = holds[s]; if (Array.isArray(h)) a.hold(s, h[0], h[1] || {}); else a.hold(s, h); }
    if (exprOpt || pr.expr) a.expr(exprOpt || pr.expr);
    a.update(0);
    return a;
  }
  // CONTRACT+: Rig.definePreset(id, params|fn(seed), {hold, anim, expr})
  function definePreset(id, params, extra = {}) { PRESETS[id] = { params, ...extra }; return PRESETS[id]; }
  let lastTF = null;
  function update(dt) {
    const counted = Time.frame !== lastTF; lastTF = Time.frame;     // if nobody counts frames, never skip
    for (const a of LIVE) if ((!counted || a._frame !== Time.frame) && a.root.parent && a.root.visible) a.update(dt);
  }

  const api = {
    human, create, PRESETS, update, definePreset, prop: standaloneProp,
    defineGesture: defGesture, defineAnim: defAnim,
    batch, batching: true,                          // CONTRACT+ (see Rig.batch above)
    get actors() { return LIVE; },
    get ANIMS() { return Object.keys(LOOPS); },
    get GESTURES() { return Object.keys(GEST); },
    EXPRS: Object.keys(EXPRS), PROP_KINDS, ARM_POSES: Object.keys(ARM_POSES), BUILDS: Object.keys(BUILDS),
    Actor,
    // internals exposed for monster builders (read-only use): head-space helpers
    headZ, EYE,
  };
  return api;
})();
