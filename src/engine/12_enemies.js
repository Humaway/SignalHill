// ==== engine/12_enemies.js — Enemies: the five common monsters, the enemy framework, hit tests, threat queries ====
// ARCHITECTURE §9 · spec §6 (common monsters), §4 (combat, Face/Avoid), §2 (torch flicker via nearestThreat), §3 (reveal
// threats in the background: every silhouette reads at 10 m in fog), §7B (the Standard's patrols), §8 P-4 / 1-9,
// §9 3-3, §12 8-1.
//
// Spawns: Enemies.spawn(def) → e. def = { id, type, pos:[x,z], rot (deg; "idle facing away" = aim rot away from the
//   approach), world, when, anchor:[x,z] (tethered), disguise:'wai'|'chloe'|'luka', tell:'hands'|'badge', badge
//   (borrowed), cluster:[[x,y,z]…], count (unread), sit:true|'floor', … } plus the per-type options below. World spawns
//   SPAWNS[room] (filtering world tags, when() and S.spawns); G.spawn(def) calls this directly. Enemies live in
//   Render.scene (not the room group); Enemies.clear() (World.unload calls it) removes them all.
// e = { id, type, def, pos (Vector3 — IS e.obj.position; for the swarm its centroid), yaw (get/set = obj.rotation.y),
//   hp, maxHp, state, obj, actor? (Rig actor; G.actor(e) drives it), resolved:null|'freed'|'dead', damage(n, weapon)
//   → bool, stun(sec), knockdown(), remove(), stomp(), cutFree(), alert(), kill(how), canStomp(), canCutFree(), radius,
//   height, reach (E range, 1.9), threat, tell, ai (set false and scripts own it), hostile, downed, knocked,
//   disguised/noRaise (borrowed), isEnemy:true, data (type-private) }.
// Resolution (§4): cut free → S.spawns[id]='freed', S.freedOrder, stats.freed, F+1, Bus 'enemy:freed'(e); a stomped
//   Tethered → 'dead', stats.stomped, A+1, Bus 'enemy:killed'(e); any other kill → 'dead', stats.killed. A Tethered
//   whose id is in S.spawns is rebuilt passive: 'freed' sitting (on def.seat if given, else on the floor), 'dead' lying.
//   Ids containing '#' (auto ids) or def.persist:false are not written to S.spawns.
// Combat (§4): 0 HP → downed 6 s (E stomps = kills; with the box cutter hold E 2 s on a downed or unaware Tethered cuts
//   it free), then it gets up with 40% HP. stun(sec) (extinguisher spray 3 s) stops attacks; knockdown() (the bar's
//   30%) floors it for 2.5 s — a stomp then deals 30 (kills at 0 HP). Hits flinch, interrupt wind-ups and push back.
//   The first downed enemy shows UI.prompt '{interact}: stomp.' (id enemy_stomp) and, holding the box cutter by a
//   Tethered, 'Hold {interact}: cut it free.' (id enemy_cutfree) — spec §8 P-4 step 4.
//   Enemies never walk through walls: every move is World.move with the enemy's radius; bodies also add a 1.2 m
//   collider to World.build.colliders (c.enemy = e) so Aidan can't walk through them. An enemy is active (visible,
//   hittable, a threat) only in its world (def.world). While a blocking script runs (Script.busy), during room
//   transitions or once Aidan is dead, enemies hold still (they still animate). Walkers get positional footsteps.
//
// The five (stats per spec §6; DIFF.dmg is applied by Player.damage because the source is the enemy):
//   tethered  HP 30, 0.6 m/s, 3 m leash from its floor anchor unless it has hold of Aidan. idle (unaware) → notices
//             Aidan within 5 m (in front of it, running, or with the torch on; creeping up behind it with the torch
//             off it only notices within 1 m after a moment — the "unaware" cut) → turns over 1.2 s → offers a box,
//             shuffling closer → tether lash (3.5 m, 4 s cooldown) → hit = Player.grab (mash E 1.5 s or 15 damage and
//             pulled in). Options: sit:true|'floor' (seated; stands when it notices), seat:{pos:[x,z], rot, h} (where
//             it goes to sit once freed — P-4's bench), watching:true (non-hostile, never moves, can't be reached:
//             Unit 4's window; threat:false to keep the bars quiet), voice:false (no muffled "I only came in to..."),
//             noticeRange, cardigan (colour), hunch. e.alert() starts the turn (P-4: on the box-cutter pickup).
//   reach     HP 60. Still until Aidan is visible within 12 m; rage +20/s × DIFF.rage() while it sees him, +25 per hit,
//             −30/s without line of sight; skin flushes red; walks at him while it sees him. At 100: lunge 5 m/s for
//             1.5 s, 20 damage, arms over anything lower than 1.3 m. Can't pass closed doors (fists on the glass).
//             Shouts: DIALOGUE.reach or the spec's three lines, distorted subtitles at most every 20 s (Enemies.say).
//   standard  invincible, 1.1 m/s, never runs, opens every in-room door, gaze (60° cone, 20 m, LOS) →
//             Player.setGaze(1); follows what it saw; contact "Got a sec?" (hand on the shoulder, Snd.duck 3 s, 40
//             damage, vanishes 45 s, keys fading away). Name card S.flags.standardName || (S.chapter >= 7 ? 'AIDAN' :
//             'LUKA'), re-read every second. Room-local options: route:[[x,z,pauseSec?,faceDeg?]…], mode:'patrol'|
//             'hunt', name. e.clipboard(false|true) lowers / raises the clipboard; e.straighten(k=1, dur=2) lifts the
//             bent head (8-1 "The Mirror": straighten + lower the clipboard, the mirror reflects Aidan).
//   borrowed  a copy of Rig.create(disguise) with a laminated ID photo for a face (peeling, another ID beneath) and
//             wrong hands / a misspelled badge. Within 4 m (or E): Talk / Examine / Step back (G.choice in a blocking
//             script). Options: line (out-of-context line in the ally's voice), lineWhen:'approach'|'talk', examine
//             (Aidan's thought), speaker, hands (rings + extra knuckles), wristband, badge, anim (+animOpts), auto:false.
//             Defaults per disguise: wai (3-3's line on approach, rings), chloe (CHLEO + wristband), luka (LUAK +
//             hands). Revealed: HP 40, 15-damage grabs; Talk first = unfold + 25-damage grab. Tell 'none'.
//   unread    swarm of def.count (30–60) moths (two InstancedMeshes), resting on def.cluster points (on walls/ceiling;
//             a small red pool light — Render gives it a real slot while it is among the nearest); wakes when the torch points at it within 10 m; stings (2 +
//             UI.sting, 6 s blur) and the first sting ever shows 'Light draws them. {torch}: torch off. Stay still.'
//             (id unread_first); torch off and still for 3 s → settles; e.scatter(origin, yaw) (spray). Unkillable.
//
// CONTRACT+ (beyond ARCHITECTURE §9):
//   Enemies.types (registry), Enemies.cutFree(e), Enemies.kill(e, how), Enemies.freedRow(points, {rot, face, world}) →
//   spawns every freed Tethered of S.freedOrder, in order, seated along a polyline (8-1), Enemies.path(ax,az,bx,bz,
//   {opener}) (room nav grid → [[x,z]…]|null), Enemies.say(text, 'distort'|'muffled'|'quiet', dur) (monster voice
//   lines just above the subtitles), Enemies.paused, Enemies.visible(e, on), Enemies.clipboard(e, up), Enemies.nav.
//   defineType(name, {create(e, def), update(e, dt, ai), onHit(e, dmg, weapon) → false = hit consumed (no default HP
//   loss/reaction), threat:true|fn(e), tell, hp, radius, height, reach, downs:false (0 HP → dies instead of downed),
//   lockable, body:false (no collider), stompable, invincible, hitbox(e) → [{x,z,r,y0,y1}…] | hitTest(e,o,yaw,range,arc),
//   threatDist(e, pos), post(e, dt) (after the actor updates), alert(e), onReact, onDown, onUp, onDie(e, o), onFreed,
//   remove(e), stun(e,sec)→false blocks, knockdown(e)→false blocks, steps:{stride, vol, heavy}}). Custom enemies get
//   the same resolution, hit tests, threat, footsteps and world-tag handling. e.pinned (def.pinned / def.static /
//   T.static; default true for body:false types): hits don't push it back and bodies don't shove it.
//   hitTest's line of sight ignores any collider containing the hitbox centre (the target's own stand-in collider).
//   Enemies.standard = { start({graph, node, name, mode:'patrol'|'hunt', route, speed}), stop(), hunt(), patrol(route),
//   chime(vol), setName(name), teleport(nodeId), e, active, state → {room, node, next, mode, physical, away, follow} }.
//   graph = { nodes:{ id:{ room, pos:[x,z], door?, pause? (s), face? (deg) } }, edges:[[a,b]…] }. Off-room it travels
//   edges at 1.1 m/s (a cross-room edge counts 1.5 m) and enters physically at the node it reaches in Aidan's room (or
//   where it is when he walks in); keys chime from the nearest node of his room when it is up to three edges away.
//   Having seen Aidan (within 12 s) it follows him through any door he takes (mode 'follow', 90 s), then patrols
//   again. Level 4 (§7B): give the balcony ring's route clockwise with pause:4 on the meeting-room door nodes. The
//   graph survives room changes; it stops on Bus 'death', 'load' and 'chapter' (the chapter restarts it if needed).
// CONTRACT+ (maintenance): e.alert({voice}), e.scriptAI (AI during blocking scripts), def.detail / def.rig.detail
//   ('low'), Standard def.puppet / e.puppet / e.scripted, e.clipboard / e.straighten on any Standard-bodied enemy,
//   doors opened only on the walker's way through them (e.data.noOpen), moveToward arrival slack (1 mm) + o.ignore,
//   freed Tethered reach their seat, unread vertical / ceiling, borrowed autoRange / interactR.
const Enemies = (() => {
  const D2R = Math.PI / 180, TAU = Math.PI * 2, HALF = Math.PI / 2;
  const clamp = U.clamp, lerp = U.lerp;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _v5 = V(), _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _e1 = new THREE.Euler();
  const UPY = V(0, 1, 0);
  const matchWorld = (w, outage) => !w || w === 'both' || (w === 'outage') === !!outage;
  const hasWorld = () => typeof World !== 'undefined' && !!World && !!World.build;
  const hasPlayer = () => typeof Player !== 'undefined' && !!Player;
  const hasUI = () => typeof UI !== 'undefined' && !!UI;
  const hasScript = () => typeof Script !== 'undefined' && !!Script;
  const menusOpen = () => { try { return typeof Menus !== 'undefined' && !!Menus && !!Menus.isOpen && !!Menus.isOpen(); } catch (e) { return false; } };
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd && Snd.play) return Snd.play(name, o); } catch (e) { /* audio not ready */ } return null; };
  const sndLoop = (name, on, o) => { try { if (typeof Snd !== 'undefined' && Snd && Snd.loop) Snd.loop(name, on, o); } catch (e) { /* audio not ready */ } };
  const ui = (fn, ...a) => { try { if (hasUI() && typeof UI[fn] === 'function') return UI[fn](...a); } catch (e) { console.error('[Enemies] UI.' + fn, e); } return undefined; };
  const P3 = (v, dy = 0) => [v.x, v.y + dy, v.z];
  const isEnemyCol = (c) => !!c.enemy;
  const flatDist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const turnToward = (cur, target, rate, dt) => { const d = U.angleDiff(cur, target), m = rate * dt; return U.wrapAngle(cur + clamp(d, -m, m)); };
  const floorY = (x, z, def = 0) => { if (!hasWorld()) return def; const y = World.heightAt(x, z); return y === null || y === undefined ? def : y; };
  const los = (ax, az, bx, bz, o = {}) => (hasWorld() ? World.los(ax, az, bx, bz, { ignore: isEnemyCol, ...o }) : true);
  const pOK = () => hasPlayer() && !Player.dead && !!Player.pos;
  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const murmur = (kind, o) => { try { if (typeof Snd !== 'undefined' && Snd && Snd.murmur) return Snd.murmur(kind, o); } catch (e) { /* audio not ready */ } return null; };
  let clock = 0;
  // game-time callbacks that outlive a single enemy (door sounds after the Standard leaves a room …)
  const timers = [];
  function globalLater(sec, fn) { timers.push({ t: sec, fn }); }
  function stepGlobalTimers(dt) { for (const t of timers.slice()) { t.t -= dt; if (t.t <= 0) { timers.splice(timers.indexOf(t), 1); try { t.fn(); } catch (err) { console.error('[Enemies] timer', err); } } } }

  // =================================================================================================================
  // Shared canvas textures and geometry (built lazily, cached for the whole game, flagged shared)
  // =================================================================================================================
  const CACHE = {};
  const shared = (key, make) => CACHE[key] || (CACHE[key] = make());
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function canvasTex(c, o = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (o.noMips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.userData.shared = !o.own;
    return t;
  }
  const markShared = (m) => { m.userData.shared = true; return m; };
  const BRAND = (typeof Tex !== 'undefined' && Tex.brand) || { teal: '#00a8a8', yellow: '#ffcc00', ink: '#1b2626', white: '#f4f3ee' };
  const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const SERIF = "Georgia, 'Times New Roman', Times, serif";
  const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  function grime(ctx, w, h, r, n = 14, a = 0.12) {
    for (let k = 0; k < n; k++) {
      const x = r() * w, y = r() * h, rad = 4 + r() * w * 0.25;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(70,58,40,${a * (0.5 + r())})`); g.addColorStop(1, 'rgba(70,58,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let k = 0; k < w * h / 60; k++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '40,34,26' : '235,230,220'},${0.04 + r() * 0.06})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
  }
  function barcode(ctx, x, y, w, h, r) {
    ctx.fillStyle = '#f4f2ea'; ctx.fillRect(x - 2, y - 2, w + 4, h + 8);
    let cx = x;
    ctx.fillStyle = '#161616';
    while (cx < x + w) { const bw = 1 + Math.floor(r() * 3); if (r() < 0.55) ctx.fillRect(cx, y, bw, h); cx += bw + 1; }
    ctx.font = `5px ${SANS}`; ctx.fillText('9 312345 0' + Math.floor(r() * 90000 + 10000), x, y + h + 5);
  }
  // unopened accessory packaging (4 designs): teal / yellow brand bands, product line art, barcode, price sticker, grime
  function boxTexture(k) {
    return shared('box' + k, () => {
      const W = 128, H = 160, c = mkCanvas(W, H), x = c.getContext('2d'), r = U.rng(17 + k * 131);
      const designs = [
        { bg: '#f1efe8', band: BRAND.teal, ink: '#1b2626', title: 'PREMIUM CASE', sub: 'SHOCKPROOF · CLEAR', art: 'phone' },
        { bg: '#2c3034', band: '#8e979c', ink: '#eef0ee', title: 'SCREEN GUARD', sub: '9H TEMPERED', art: 'glass' },
        { bg: '#f4f2ec', band: BRAND.yellow, ink: '#232323', title: 'FAST CHARGER', sub: '20W · USB-C', art: 'plug' },
        { bg: '#141518', band: BRAND.teal, ink: '#f2f2ee', title: 'EARPHONES', sub: 'IN-EAR · MIC', art: 'buds' },
      ];
      const d = designs[k % designs.length];
      x.fillStyle = d.bg; x.fillRect(0, 0, W, H);
      x.fillStyle = d.band; x.fillRect(0, 0, W, 26); x.fillRect(0, H - 12, W, 12);
      x.fillStyle = d.band === BRAND.yellow ? '#222' : '#fff'; x.font = `bold 13px ${SANS}`; x.textAlign = 'center'; x.fillText(d.title, W / 2, 18);
      x.fillStyle = d.ink; x.font = `9px ${SANS}`; x.fillText(d.sub, W / 2, 40);
      x.strokeStyle = d.ink; x.lineWidth = 2; x.globalAlpha = 0.85;
      if (d.art === 'phone') { x.strokeRect(44, 52, 40, 72); x.strokeRect(50, 58, 28, 56); x.beginPath(); x.arc(64, 118, 2, 0, TAU); x.stroke(); }
      else if (d.art === 'glass') { x.strokeRect(40, 54, 48, 74); x.beginPath(); x.moveTo(44, 120); x.lineTo(84, 60); x.moveTo(50, 124); x.lineTo(86, 72); x.stroke(); }
      else if (d.art === 'plug') { x.strokeRect(46, 62, 36, 40); x.beginPath(); x.moveTo(56, 62); x.lineTo(56, 50); x.moveTo(72, 62); x.lineTo(72, 50); x.moveTo(64, 102); x.bezierCurveTo(64, 120, 90, 118, 92, 130); x.stroke(); }
      else { x.beginPath(); x.arc(50, 80, 9, 0, TAU); x.arc(78, 80, 9, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(50, 89); x.bezierCurveTo(52, 118, 76, 118, 78, 89); x.moveTo(64, 112); x.lineTo(64, 128); x.stroke(); }
      x.globalAlpha = 1;
      // starburst / price sticker
      x.save(); x.translate(100, 56); x.rotate(-0.3);
      x.fillStyle = k % 2 ? '#e8732a' : BRAND.yellow; x.beginPath();
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, rr = i % 2 ? 11 : 16; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.fill(); x.fillStyle = '#1a1a1a'; x.font = `bold 8px ${SANS}`; x.fillText(k % 2 ? '$49' : 'NEW', 0, 3); x.restore();
      barcode(x, 12, 130, 44, 12, r);
      x.textAlign = 'right'; x.fillStyle = d.ink; x.font = `7px ${SANS}`; x.fillText('COMPATIBLE?', W - 8, 140);
      grime(x, W, H, r, 10, 0.16);
      // water tide-mark along the bottom
      x.strokeStyle = 'rgba(90,70,40,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, H - 30); for (let i = 0; i <= 8; i++) x.lineTo((i / 8) * W, H - 30 - Math.sin(i * 1.7 + k) * 5); x.stroke();
      return canvasTex(c);
    });
  }
  // clear-plastic glare (additive): streaks and a bright rim
  function glareTexture() {
    return shared('glare', () => {
      const S = 128, c = mkCanvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
      const streak = (x0, y0, x1, y1, w, a) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.strokeStyle = g; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
      streak(18, 110, 70, 12, 9, 0.8); streak(34, 118, 88, 22, 3, 0.7); streak(88, 118, 118, 64, 5, 0.45);
      return canvasTex(c, { linear: true });
    });
  }
  // phone-speaker grille (the Reach's mouth lining)
  function grilleTexture() {
    return shared('grille', () => {
      const S = 128, c = mkCanvas(S, S), x = c.getContext('2d');
      x.fillStyle = '#56585d'; x.fillRect(0, 0, S, S);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const cx = i * 8 + (j % 2 ? 4 : 0) + 2, cy = j * 8 + 4;
        x.fillStyle = '#040405'; x.beginPath(); x.arc(cx, cy, 2.4, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(225,226,230,0.45)'; x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cy, 2.9, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
      }
      grime(x, S, S, U.rng(5), 8, 0.2);
      return canvasTex(c, { wrap: true });
    });
  }
  function simTexture() {
    return shared('sim', () => {
      const W = 64, H = 40, c = mkCanvas(W, H), x = c.getContext('2d');
      x.clearRect(0, 0, W, H);
      x.fillStyle = '#e9e6dc'; x.beginPath(); x.moveTo(8, 1); x.lineTo(W - 3, 1); x.lineTo(W - 1, 3); x.lineTo(W - 1, H - 3); x.lineTo(W - 3, H - 1); x.lineTo(3, H - 1); x.lineTo(1, H - 3); x.lineTo(1, 8); x.closePath(); x.fill();
      x.fillStyle = '#c9a84e'; x.fillRect(12, 11, 20, 17); x.strokeStyle = '#8a7030'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(12, 19.5); x.lineTo(32, 19.5); x.moveTo(22, 11); x.lineTo(22, 28); x.moveTo(12, 15); x.lineTo(18, 15); x.moveTo(26, 24); x.lineTo(32, 24); x.stroke();
      x.fillStyle = BRAND.teal; x.fillRect(38, 10, 20, 4); x.fillStyle = '#555'; x.font = `5px ${SANS}`; x.fillText('4G · 5G', 38, 24); x.fillText('89610 1234', 38, 31);
      return canvasTex(c);
    });
  }
  function badgeTexture() {
    return shared('badge', () => {
      const S = 64, c = mkCanvas(S, S), x = c.getContext('2d');
      x.clearRect(0, 0, S, S);
      const g = x.createRadialGradient(28, 26, 2, 32, 32, 30); g.addColorStop(0, '#ff6a58'); g.addColorStop(0.7, '#e3241b'); g.addColorStop(1, '#a8120c');
      x.fillStyle = g; x.beginPath(); x.arc(32, 32, 29, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,220,210,0.7)'; x.lineWidth = 2.5; x.beginPath(); x.arc(32, 32, 28, 0, TAU); x.stroke();
      x.fillStyle = '#fff5f0'; x.font = `bold 34px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1', 32, 34);
      return canvasTex(c);
    });
  }
  // coiled security tether: a unit helix along +Y (0 → 1); a mesh scaled on Y stretches the coil like the real cord
  function helixGeo(turns, rad, tube, key) {
    return shared('helix' + key, () => {
      const pts = [], n = Math.max(16, Math.round(turns * 9));
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * turns * TAU, e = Math.min(1, t * 14, (1 - t) * 14);
        pts.push(V(Math.cos(a) * rad * e, t, Math.sin(a) * rad * e));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, tube, 4, false);
      g.userData.shared = true;
      return g;
    });
  }
  const tetherMat = () => shared('tetherMat', () => markShared(new THREE.MeshStandardMaterial({ color: '#2d2f31', roughness: 0.42, metalness: 0.15 })));
  const puckMat = () => shared('puckMat', () => markShared(new THREE.MeshStandardMaterial({ color: '#56595c', roughness: 0.4, metalness: 0.55 })));
  const ledMat = () => shared('ledMat', () => markShared(new THREE.MeshBasicMaterial({ color: '#ff2a1c', toneMapped: false })));
  const ledOffMat = () => shared('ledOffMat', () => markShared(new THREE.MeshStandardMaterial({ color: '#3a1512', roughness: 0.4 })));
  function setSeg(mesh, a, b) {
    _v1.subVectors(b, a);
    const len = _v1.length();
    mesh.position.copy(a);
    if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UPY, _v1.multiplyScalar(1 / len));
    mesh.scale.set(1, Math.max(len, 1e-4), 1);
  }
  function tetherMesh(kind = 'short') {
    const g = kind === 'long' ? helixGeo(46, 0.018, 0.0048, 'long') : kind === 'lash' ? helixGeo(34, 0.015, 0.0042, 'lash') : helixGeo(15, 0.017, 0.0045, 'short');
    const m = new THREE.Mesh(g, tetherMat());
    // (a unit helix along +Y scaled to its length by setSeg: its bounding sphere scales with it, so it culls correctly)
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
  function puckGeo() { return shared('puckGeo', () => { const g = new THREE.CylinderGeometry(0.028, 0.03, 0.022, 12); g.userData.shared = true; return g; }); }
  function ledGeo() { return shared('ledGeo', () => { const g = new THREE.SphereGeometry(0.0055, 6, 4); g.userData.shared = true; return g; }); }
  function mergeGeo(items, color = false) { const g = Kit.mergeGeometries(items, color); g.userData.shared = true; return g; }
  const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
  function colorGeo(g, c) {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  // the Standard's ring of dozens of keys (local origin at the top of the ring)
  function keyRingGeo() {
    return shared('keyring', () => {
      const r = U.rng(4411), items = [];
      const R = 0.042;
      items.push({ geo: colorGeo(new THREE.TorusGeometry(R, 0.0035, 6, 28), '#b8b8b2'), m: MX(0, -R, 0) });
      const cols = ['#c9a85a', '#b6b6b0', '#d0b068', '#9ea0a2', '#c2a050', '#303236', '#8c8f92', '#b89448', '#d8d6d0'];
      for (let k = 0; k < 34; k++) {
        const a = -HALF + (k / 34 - 0.5) * 2.9 + (r() - 0.5) * 0.08, cx = Math.cos(a) * R, cy = -R + Math.sin(a) * R;
        const len = 0.045 + r() * 0.035, col = cols[Math.floor(r() * cols.length)];
        const head = new THREE.CylinderGeometry(0.011 + r() * 0.004, 0.011, 0.0025, 8).rotateX(HALF).translate(0, -0.012, 0);
        const blade = new THREE.BoxGeometry(0.0075, len, 0.0022).translate(0, -0.012 - len / 2, 0);
        const bits = new THREE.BoxGeometry(0.004, len * 0.6, 0.0023).translate(0.004, -0.02 - len * 0.35, 0);
        const g = Kit.mergeGeometries([{ geo: head, m: new THREE.Matrix4() }, { geo: blade, m: new THREE.Matrix4() }, { geo: bits, m: new THREE.Matrix4() }]);
        items.push({ geo: colorGeo(g, col), m: MX(cx, cy, (k % 3 - 1) * 0.004, 0, (r() - 0.5) * 0.6, a + HALF + (r() - 0.5) * 0.25) });
      }
      return mergeGeo(items, true);
    });
  }

  // =================================================================================================================
  // Room navigation grid (lazy; the Standard, the Reach and a revealed Borrowed use it to get round furniture)
  // =================================================================================================================
  const Nav = (() => {
    let g = null;
    const RAD = 0.34;
    function bounds() {
      const d = World.def || {};
      if (Array.isArray(d.bounds) && d.bounds.length === 4) return [Math.min(d.bounds[0], d.bounds[2]), Math.min(d.bounds[1], d.bounds[3]), Math.max(d.bounds[0], d.bounds[2]), Math.max(d.bounds[1], d.bounds[3])];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const f of World.build.floors) { x0 = Math.min(x0, f.x0); z0 = Math.min(z0, f.z0); x1 = Math.max(x1, f.x1); z1 = Math.max(z1, f.z1); }
      return isFinite(x0) ? [x0, z0, x1, z1] : [-20, -20, 20, 20];
    }
    function build() {
      const b = bounds();
      const area = (b[2] - b[0] + 1) * (b[3] - b[1] + 1);
      const cs = Math.max(0.4, Math.sqrt(area / 70000));
      const x0 = b[0] - 0.5, z0 = b[1] - 0.5, w = Math.max(1, Math.ceil((b[2] - b[0] + 1) / cs)), h = Math.max(1, Math.ceil((b[3] - b[1] + 1) / cs));
      const n = w * h, cell = new Uint8Array(n), fy = new Float32Array(n), door = new Int16Array(n).fill(-1);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, y = World.heightAt(x0 + (i + 0.5) * cs, z0 + (j + 0.5) * cs);
        if (y === null || y === undefined) { cell[k] = 0; fy[k] = NaN; } else { cell[k] = 1; fy[k] = y; }
      }
      const doors = [], doorRecs = World.build.doors || {};
      for (const c of World.build.colliders) {
        if (c.enemy || !matchWorld(c.world, S.outage)) continue;
        const drec = c.door ? doorRecs[c.door] : null;
        const isDoor = !!drec && !drec.to;
        if (c.enabled === false && !isDoor) continue;
        let di = -1;
        if (isDoor) { di = doors.indexOf(drec); if (di < 0) { doors.push(drec); di = doors.length - 1; } }
        const i0 = Math.max(0, Math.floor((c.x0 - RAD - x0) / cs)), i1 = Math.min(w - 1, Math.floor((c.x1 + RAD - x0) / cs));
        const j0 = Math.max(0, Math.floor((c.z0 - RAD - z0) / cs)), j1 = Math.min(h - 1, Math.floor((c.z1 + RAD - z0) / cs));
        const cy = c.y || 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * w + i;
          if (!cell[k]) continue;
          const y = fy[k];
          if (cy > y + 1.7 || cy + c.h < y + 0.2) continue;
          if (!Kit.collide(c, x0 + (i + 0.5) * cs, z0 + (j + 0.5) * cs, RAD)) continue;
          if (isDoor) { if (cell[k] === 1) { cell[k] = 2; door[k] = di; } } else { cell[k] = 0; door[k] = -1; }
        }
      }
      g = { build: World.build, outage: !!S.outage, x0, z0, cs, w, h, cell, fy, door, doors };
      return g;
    }
    function get() {
      if (!hasWorld()) return null;
      if (!g || g.build !== World.build || g.outage !== !!S.outage) build();
      return g;
    }
    const idx = (G, x, z) => { const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs); return i < 0 || j < 0 || i >= G.w || j >= G.h ? -1 : j * G.w + i; };
    function ok(G, k, opener) { if (k < 0) return false; const v = G.cell[k]; if (v === 1) return true; if (v === 2) { const d = G.doors[G.door[k]]; return !!opener || !!(d && d.open); } return false; }
    const stepOK = (G, a, b) => Math.abs(G.fy[a] - G.fy[b]) <= 0.45;
    function nearestOK(G, k, opener) {
      if (ok(G, k, opener)) return k;
      if (k < 0) return -1;
      const ci = k % G.w, cj = (k / G.w) | 0;
      for (let r = 1; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= G.w || j >= G.h) continue;
        const kk = j * G.w + i;
        if (ok(G, kk, opener)) return kk;
      }
      return -1;
    }
    function lineClear(ax, az, bx, bz, opener) {
      const G = get(); if (!G) return true;
      const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (G.cs * 0.5)));
      let prev = idx(G, ax, az);
      for (let s = 1; s <= n; s++) {
        const k = idx(G, ax + (bx - ax) * s / n, az + (bz - az) * s / n);
        if (k === prev) continue;
        if (!ok(G, k, opener) || (prev >= 0 && ok(G, prev, opener) && !stepOK(G, prev, k))) return false;
        prev = k;
      }
      return true;
    }
    // A* on the grid (8-neighbour, octile heuristic); scratch arrays live on the grid and are reused (generation stamps)
    function path(ax, az, bx, bz, o = {}) {
      const G = get(); if (!G) return [[bx, bz]];
      const opener = !!o.opener;
      const s = nearestOK(G, idx(G, ax, az), opener), t = nearestOK(G, idx(G, bx, bz), opener);
      if (s < 0 || t < 0) return null;
      if (s === t) return [[bx, bz]];
      const N = G.w * G.h;
      if (!G.gs) { G.gs = new Float32Array(N); G.from = new Int32Array(N); G.stamp = new Uint32Array(N); G.closed = new Uint32Array(N); G.heapK = new Int32Array(N * 2 + 16); G.heapF = new Float32Array(N * 2 + 16); G.gen = 0; }
      const gen = ++G.gen, gs = G.gs, from = G.from, stamp = G.stamp, closed = G.closed, HK = G.heapK, HF = G.heapF;
      let hn = 0;
      const push = (k, f) => { let i = hn++; HK[i] = k; HF[i] = f; while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= HF[i]) break; const tk = HK[p], tf = HF[p]; HK[p] = HK[i]; HF[p] = HF[i]; HK[i] = tk; HF[i] = tf; i = p; } };
      const pop = () => { const top = HK[0]; hn--; if (hn > 0) { HK[0] = HK[hn]; HF[0] = HF[hn]; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hn && HF[l] < HF[m]) m = l; if (r < hn && HF[r] < HF[m]) m = r; if (m === i) break; const tk = HK[m], tf = HF[m]; HK[m] = HK[i]; HF[m] = HF[i]; HK[i] = tk; HF[i] = tf; i = m; } } return top; };
      const W = G.w, tx = t % W, tz = (t / W) | 0;
      const hEst = (k) => { const dx = Math.abs((k % W) - tx), dz = Math.abs(((k / W) | 0) - tz); return dx > dz ? dx + 0.4142 * dz : dz + 0.4142 * dx; };
      stamp[s] = gen; gs[s] = 0; from[s] = -1; push(s, hEst(s));
      let found = false, iter = 0;
      const maxIter = o.maxIter || 30000;
      while (hn && iter++ < maxIter) {
        const k = pop();
        if (closed[k] === gen) continue;
        closed[k] = gen;
        if (k === t) { found = true; break; }
        const ci = k % W, cj = (k / W) | 0, gk = gs[k];
        for (let n = 0; n < 8; n++) {
          const di = n < 4 ? (n === 0 ? 1 : n === 1 ? -1 : 0) : (n === 4 || n === 5 ? 1 : -1), dj = n < 4 ? (n === 2 ? 1 : n === 3 ? -1 : 0) : (n === 4 || n === 6 ? 1 : -1);
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= G.h) continue;
          const kk = j * W + i;
          if (closed[kk] === gen || !ok(G, kk, opener) || !stepOK(G, k, kk)) continue;
          if (di && dj && (!ok(G, cj * W + i, opener) || !ok(G, j * W + ci, opener))) continue;
          const ng = gk + (di && dj ? 1.4142 : 1);
          if (stamp[kk] !== gen || ng < gs[kk]) { stamp[kk] = gen; gs[kk] = ng; from[kk] = k; push(kk, ng + hEst(kk)); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let k = t; k !== -1 && cells.length < N; k = from[k]) { cells.push(k); if (k === s) break; }
      cells.reverse();
      const pts = cells.map((k) => [G.x0 + ((k % W) + 0.5) * G.cs, G.z0 + (((k / W) | 0) + 0.5) * G.cs]);
      pts[pts.length - 1] = ok(G, idx(G, bx, bz), opener) ? [bx, bz] : pts[pts.length - 1];
      // string-pull (bounded look-ahead)
      const out = [];
      let cur = [ax, az], i = 0;
      while (i < pts.length) {
        let far = i;
        for (let k = Math.min(pts.length - 1, i + 36); k > i; k--) if (lineClear(cur[0], cur[1], pts[k][0], pts[k][1], opener)) { far = k; break; }
        out.push(pts[far]); cur = pts[far]; i = far + 1;
      }
      return out;
    }
    return { get, path, lineClear, invalidate() { g = null; }, get grid() { return g; } };
  })();

  // =================================================================================================================
  // Monster voices: short subtitle lines under/above the dialogue line (Reach shouts distorted, the Tethered's muffled
  // "I only came in to...", the Standard's quiet "Got a sec?"). §2A look: serif, off-white, soft shadow, fades.
  // =================================================================================================================
  const Voice = (() => {
    let host = null, lines = [];
    const CSS = `
#ui .ev-host{position:absolute;left:0;right:0;bottom:calc(11vh + 2.6vh);z-index:21;pointer-events:none;display:flex;flex-direction:column;align-items:center;font-family:${SERIF};}
#ui .ev-line{position:relative;max-width:min(72vw,1100px);text-align:center;font-size:var(--evfs,clamp(15px,2.35vh,31px));line-height:1.35;color:#f0ede4;opacity:0;margin-top:.25em;white-space:pre-wrap;text-shadow:0 0 .35em rgba(0,0,0,.95),0 .06em .14em rgba(0,0,0,.95),0 0 1.1em rgba(0,0,0,.6);}
#ui .ev-line .ev-lay{position:absolute;left:0;right:0;top:0;text-shadow:none;}
#ui .ev-distort{color:#f4ece6;letter-spacing:.03em;}
#ui .ev-distort .ev-c{display:inline-block;}
#ui .ev-distort .ev-l1{color:rgba(225,52,36,.55);}
#ui .ev-distort .ev-l2{color:rgba(90,205,196,.32);}
#ui .ev-muffled{font-style:italic;color:#b9b5ab;filter:blur(.7px);}
#ui .ev-quiet{font-size:calc(var(--evfs,clamp(15px,2.35vh,31px)) * .88);color:#e4e0d6;letter-spacing:.02em;}`;
    function ensure() {
      if (host && host.isConnected) return true;
      const root = document.getElementById('ui');
      if (!root) return false;
      if (!document.getElementById('ev-style')) { const st = document.createElement('style'); st.id = 'ev-style'; st.textContent = CSS; document.head.appendChild(st); }
      host = document.createElement('div'); host.className = 'ev-host'; root.appendChild(host);
      return true;
    }
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function say(text, style = 'distort', dur) {
      if (!text || !ensure()) return null;
      for (const l of lines) if (l.style === style && !l.out) { l.out = true; l.t = Math.max(l.t, l.life); }
      const el = document.createElement('div');
      el.className = 'ev-line ev-' + style;
      const size = (typeof META !== 'undefined' && META.options && META.options.subs) || 'medium';
      el.style.setProperty('--evfs', size === 'small' ? 'clamp(13px,2vh,26px)' : size === 'large' ? 'clamp(18px,2.95vh,39px)' : 'clamp(15px,2.35vh,31px)');
      if (style === 'distort') {
        const chars = [...String(text)].map((ch) => `<span class="ev-c">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
        el.innerHTML = `<span class="ev-lay ev-l1">${esc(text)}</span><span class="ev-lay ev-l2">${esc(text)}</span><span class="ev-main">${chars}</span>`;
      } else el.textContent = text;
      host.appendChild(el);
      const L = { el, style, t: 0, life: dur ?? Math.max(1.8, U.readTime(text) * (style === 'quiet' ? 1.1 : 0.9)), out: false, jt: 0 };
      lines.push(L);
      return L;
    }
    function update(dt) {
      if (!lines.length) return;
      const hide = menusOpen();
      if (host) host.style.visibility = hide ? 'hidden' : 'visible';
      if (hide) return;
      // just above the subtitles — and above whatever subtitle / message is actually up (a two-line thought, a message
      // stepped up over a line), so a monster's line and Aidan's thought never overlap
      if (host) {
        let top = null;
        try { top = hasUI() && UI.textTop ? UI.textTop() : null; } catch (e) { top = null; }
        const H = window.innerHeight || 1, base = H * 0.136, want = top === null ? base : Math.max(base, H - top + H * 0.012);
        const cur = parseFloat(host.dataset.bot || '0') || base;
        const next = Math.abs(want - cur) < 1 ? want : cur + (want - cur) * Math.min(1, dt * 12);
        host.dataset.bot = String(next);
        host.style.bottom = next.toFixed(1) + 'px';
      }
      for (const L of lines.slice()) {
        L.t += dt;
        const fin = L.t >= L.life;
        const a = fin ? Math.max(0, 1 - (L.t - L.life) / 0.45) : Math.min(1, L.t / (L.style === 'distort' ? 0.12 : 0.35));
        L.el.style.opacity = (L.style === 'muffled' ? 0.82 : 1) * a;
        if (L.style === 'distort') {
          L.jt -= dt;
          if (L.jt <= 0) {
            L.jt = 0.05 + Math.random() * 0.05;
            const lay = L.el.querySelectorAll('.ev-lay');
            lay.forEach((s, i) => { s.style.transform = `translate(${((Math.random() - 0.5) * 7 + (i ? -2 : 2)).toFixed(1)}px,${((Math.random() - 0.5) * 3).toFixed(1)}px) scaleY(${(1 + (Math.random() - 0.5) * 0.25).toFixed(2)})`; });
            const cs = L.el.querySelectorAll('.ev-c');
            cs.forEach((c) => { c.style.transform = Math.random() < 0.18 ? `translateY(${((Math.random() - 0.5) * 5).toFixed(1)}px) scale(${(1 + Math.random() * 0.35).toFixed(2)},${(1 + (Math.random() - 0.5) * 0.5).toFixed(2)})` : ''; });
            L.el.style.filter = Math.random() < 0.15 ? `blur(${(Math.random() * 1.2).toFixed(1)}px)` : '';
          }
        }
        if (fin && L.t - L.life > 0.5) { L.el.remove(); lines.splice(lines.indexOf(L), 1); }
      }
    }
    function clear() { for (const L of lines) L.el.remove(); lines = []; }
    return { say, update, clear };
  })();

  // =================================================================================================================
  // Registry, spawning and the shared enemy object
  // =================================================================================================================
  const TYPES = {};
  const list = [];
  const byId = new Map();
  let UID = 0;
  let lastOutage = null, lastRoom = null;
  function defineType(name, def) { TYPES[name] = { name, ...def }; return TYPES[name]; }

  const scene = () => Render.scene;
  const isPaused = () => {
    try {
      if (hasScript() && Script.busy) return true;
      if (hasWorld() && World.transitioning) return true;
      if (!pOK()) return true;
    } catch (e) { /* partial build */ }
    return false;
  };
  const active = (e) => !e.removed && matchWorld(e.world, S.outage);
  const scriptOnlyPause = () => { try { return !(hasWorld() && World.transitioning) && pOK(); } catch (e) { return false; } };

  function spawn(def) {
    if (!def || !def.type) { console.warn('[Enemies] spawn: missing type', def); return null; }
    const T = TYPES[def.type];
    if (!T) { console.warn('[Enemies] unknown enemy type: ' + def.type); return null; }
    if (def.id && byId.has(def.id)) { const old = byId.get(def.id); if (!old.removed) return old; }
    const res = def.id && S.spawns ? S.spawns[def.id] : null;
    if (res === 'dead' && !T.rebuildDead) return null;
    const e = makeEnemy(def, T);
    e.restored = res || null;
    try { if (T.create) T.create(e, def); } catch (err) { console.error(`[Enemies] create ${e.id}`, err); disposeEnemy(e); return null; }
    if (e.actor && e.actor.trimShadows) e.actor.trimShadows();          // one torch-shadow caster per body segment
    if (!e.obj) { e.obj = new THREE.Group(); e.obj.name = 'enemy:' + e.id; }
    if (!e.pos) e.pos = e.obj.position;
    const p = def.pos || [0, 0];
    if (!e.placed) {
      e.pos.set(p[0], def.y ?? floorY(p[0], p[1], 0), p[1]);
      e.obj.rotation.y = (def.rot || 0) * D2R;
    }
    e.home = e.pos.clone(); e.homeYaw = e.yaw;
    if (e.obj.parent !== scene()) scene().add(e.obj);
    if (e.fx.parent !== scene()) scene().add(e.fx);
    list.push(e); byId.set(e.id, e);
    if (T.body !== false && e.actor) addCollider(e);
    // Game's fog culling hides the fx group (tether, held box, glows) with the body it belongs to
    if (e.actor) { e.actor.cullWith = e.actor.cullWith || []; if (!e.actor.cullWith.includes(e.fx)) e.actor.cullWith.push(e.fx); }
    if (e.actor) { e.actor.update(0); if (T.post) T.post(e, 0); }
    return e;
  }

  function makeEnemy(def, T) {
    const uid = ++UID;
    const e = {
      uid, id: def.id || `${def.type}#${uid}`, type: def.type, def, isEnemy: true,
      obj: null, actor: null, pos: null, fx: new THREE.Group(),
      hp: def.hp ?? T.hp ?? 30, maxHp: def.hp ?? T.hp ?? 30,
      state: 'idle', stateT: 0, t: 0,
      radius: def.radius ?? T.radius ?? 0.35, height: def.height ?? T.height ?? 1.8, reach: def.reach ?? T.reach ?? 1.9,
      world: def.world || 'both', resolved: null, removed: false, ai: true, hostile: true,
      threat: def.threat ?? true, tell: def.tell && def.type !== 'borrowed' ? def.tell : T.tell ?? def.type,
      lockable: T.lockable !== false, invincible: !!T.invincible,
      downed: false, downT: 0, knocked: false, knockT: 0, stunT: 0, flinchT: 0,
      col: null, loops: new Set(), data: {}, T,
      // pinned: hits never push it back and other bodies never shove it (separate()). Default: def.pinned, else
      // def.static / T.static, else true for body:false types — hitbox-only stand-ins for static set pieces (a plinth,
      // a cage) whose e.pos, and so hitbox, must stay on the prop they represent
      pinned: def.pinned ?? def.static ?? T.static ?? (T.body === false),
    };
    e.fx.name = 'enemyfx:' + e.id;
    Object.defineProperty(e, 'yaw', { get() { return e.obj ? e.obj.rotation.y : 0; }, set(v) { if (e.obj) e.obj.rotation.y = v; }, enumerable: true });
    e.damage = (n, weapon) => damage(e, n, weapon);
    e.stun = (sec = 3) => stun(e, sec);
    e.knockdown = () => knockdown(e);
    e.remove = () => removeEnemy(e);
    e.kill = (how = 'dead') => resolve(e, how);
    e.canStomp = () => !e.resolved && !e.removed && !e.untouchable && (e.downed || e.knocked) && e.T.stompable !== false;
    e.canCutFree = () => {
      if (e.type !== 'tethered' || e.resolved || e.removed || e.untouchable || e.data.watching) return false;
      return e.downed || e.knocked || e.aware === false;
    };
    e.stomp = () => stompEnemy(e);
    e.cutFree = () => cutFreeEnemy(e);
    e.alert = (o = {}) => { if (e.T.alert) e.T.alert(e, o); };
    // e.clipboard(up) / e.straighten(k = 1, dur = 2) — the Standard's clipboard and bent head; any enemy built on the
    // Standard's body (a custom type calling Enemies.types.standard.create) has them too (they check the data, not the
    // type). straighten lifts the head (0 = bent 90°, 1 = upright) — 8-1 "it unfolds to its full height".
    e.clipboard = (up = false) => standardClipboard(e, up);
    e.straighten = (k = 1, dur = 2) => { if (e.actor && e.actor.P) e.data.straight = { from: e.data.straightK || 0, to: clamp(k), t: 0, dur: Math.max(0.01, dur) }; };
    if (def.type === 'unread') e.scatter = (origin, yaw) => unreadScatter(e, origin, yaw);
    return e;
  }

  function addCollider(e) {
    if (!hasWorld() || e.col) return;
    const c = { x0: 0, z0: 0, x1: 0, z1: 0, y: 0, h: 1.2, world: 'both', obb: null, blocker: null, soft: false, name: 'enemy:' + e.id, enabled: true, door: null, enemy: e, dynamic: true };
    e.col = c;
    World.build.colliders.push(c);
    syncCollider(e);
  }
  function syncCollider(e) {
    const c = e.col; if (!c) return;
    const r = e.colR ?? Math.max(0.2, e.radius - 0.05);
    c.x0 = e.pos.x - r; c.x1 = e.pos.x + r; c.z0 = e.pos.z - r; c.z1 = e.pos.z + r; c.y = e.pos.y;
    c.enabled = active(e) && e.obj.visible !== false && !e.noBody && !e.downed && !e.knocked && e.resolved !== 'dead';
  }
  function dropCollider(e) {
    if (!e.col) return;
    if (hasWorld()) { const a = World.build.colliders, i = a.indexOf(e.col); if (i >= 0) a.splice(i, 1); }
    e.col = null;
  }
  function loop(e, name, on, o = {}) {
    const id = 'enemy:' + e.uid + ':' + name;
    if (on) { e.loops.add(name); sndLoop(name, true, { id, ...o }); } else if (e.loops.has(name)) { e.loops.delete(name); sndLoop(name, false, { id, fade: o.fade ?? 0.8 }); }
  }
  function stopLoops(e) { for (const n of [...e.loops]) loop(e, n, false); }
  function disposeObj(o) {
    o.traverse((c) => {
      if (c.isMesh || c.isPoints || c.isLine) {
        if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
        for (const m of [].concat(c.material || [])) {
          if (!m || m.userData.shared || m.userData.rig) continue;
          for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && !m[k].userData.shared) m[k].dispose();
          m.dispose();
        }
      }
    });
  }
  function disposeEnemy(e) {
    try { if (e.T.remove) e.T.remove(e); } catch (err) { console.error('[Enemies] remove hook', err); }
    stopLoops(e);
    dropCollider(e);
    if (e.data.light) { try { e.data.light.free(); } catch (err) { /* pool */ } e.data.light = null; }
    if (e.actor) { const a = e.actor; if (a.root.parent) a.root.parent.remove(a.root); disposeObj(a.root); a.dispose(); }
    if (e.obj && e.obj.parent) e.obj.parent.remove(e.obj);
    if (e.obj && e.obj !== (e.actor && e.actor.root)) disposeObj(e.obj);
    if (e.fx.parent) e.fx.parent.remove(e.fx);
    if (e.fxBatch) { e.fxBatch.dispose(); e.fxBatch = null; }
    disposeObj(e.fx);
  }
  function removeEnemy(e) {
    if (e.removed) return;
    e.removed = true;
    const i = list.indexOf(e); if (i >= 0) list.splice(i, 1);
    if (byId.get(e.id) === e) byId.delete(e.id);
    disposeEnemy(e);
  }
  function clear() {
    for (const e of list.slice()) removeEnemy(e);
    list.length = 0; byId.clear();
    Nav.invalidate();
    Voice.clear();
    if (hasUI()) ui('holdPrompt', null);
  }
  function visible(e, on) {
    e.hidden = !on;
    if (e.obj) e.obj.visible = !!on && active(e);
    e.fx.visible = !!on && active(e);
    syncCollider(e);
  }

  // ---- movement helpers ---------------------------------------------------------------------------------------------
  // step toward (tx,tz) at speed (m/s) with World.move; o.nav uses the room grid; o.opener opens in-room doors;
  // o.stopAt: stop that far from the target. Returns {moved, blocked, arrived}.
  function moveToward(e, tx, tz, speed, dt, o = {}) {
    const d = Math.hypot(tx - e.pos.x, tz - e.pos.z);
    const stopAt = o.stopAt ?? 0.15;
    // (a millimetre of slack: the last step lands on stopAt from above, and rounding can leave it a hair outside)
    if (d <= stopAt + 1e-3) return { moved: 0, arrived: true, blocked: false };
    let wx = tx, wz = tz;
    const N = e.data.nav || (e.data.nav = { path: null, t: 99, tx: 0, tz: 0, stuck: 0 });
    if (o.nav) {
      N.t += dt;
      const direct = Nav.lineClear(e.pos.x, e.pos.z, tx, tz, o.opener);
      if (direct) N.path = null;
      else {
        if (!N.path || N.t > 0.7 || Math.hypot(N.tx - tx, N.tz - tz) > 0.8 || N.stuck > 0.4) {
          N.path = Nav.path(e.pos.x, e.pos.z, tx, tz, { opener: o.opener }); N.t = 0; N.tx = tx; N.tz = tz; N.stuck = 0;
        }
        if (N.path && N.path.length) {
          while (N.path.length > 1 && Math.hypot(N.path[0][0] - e.pos.x, N.path[0][1] - e.pos.z) < 0.3) N.path.shift();
          wx = N.path[0][0]; wz = N.path[0][1];
        }
      }
    }
    if (o.opener) openDoorsAhead(e, wx, wz, wx !== tx || wz !== tz ? 0.8 : (o.carry ?? 0.8));
    const wd = Math.hypot(wx - e.pos.x, wz - e.pos.z) || 1;
    const step = Math.min(speed * dt, Math.max(0, d - stopAt));
    const dx = (wx - e.pos.x) / wd * step, dz = (wz - e.pos.z) / wd * step;
    const ign = o.ignore ? (c) => isEnemyCol(c) || o.ignore(c) : isEnemyCol;
    const r = hasWorld() ? World.move(e.pos, dx, dz, e.radius, { ignore: ign, maxStep: 0.5, maxDrop: 1.2 }) : { x: e.pos.x + dx, y: e.pos.y, z: e.pos.z + dz, blocked: false };
    const moved = Math.hypot(r.x - e.pos.x, r.z - e.pos.z);
    e.pos.set(r.x, r.y, r.z);
    if (moved < step * 0.35) N.stuck += dt; else N.stuck = Math.max(0, N.stuck - dt);
    if (o.face !== false && moved > 1e-4) e.yaw = turnToward(e.yaw, Math.atan2(dx, dz), o.turn ?? 3, dt);
    const arrived = Math.hypot(tx - e.pos.x, tz - e.pos.z) <= stopAt + 1e-3;
    return { moved, arrived, blocked: !arrived && (r.blocked || moved < step * 0.35) };
  }
  // A door is opened only when the walker's way to its waypoint crosses the doorway (the leg e.pos → waypoint, carried
  // 0.8 m on — not past a patrol stop that pauses: o.carry 0): a patrol pausing in front of a door leaves it shut.
  // (e.data.noOpen = true: this walker never opens doors.)
  function openDoorsAhead(e, wx, wz, carry = 0.8) {
    if (!hasWorld() || (e.data && e.data.noOpen)) return;
    const doors = World.build.doors || {};
    const lx = wx - e.pos.x, lz = wz - e.pos.z, ll = Math.hypot(lx, lz) || 1;
    const ex = wx + (lx / ll) * carry, ez = wz + (lz / ll) * carry;
    for (const id of Object.keys(doors)) {
      const d = doors[id];
      if (d.to || d.open || !matchWorld(d.world, S.outage)) continue;
      const dd = Math.hypot(d.x - e.pos.x, d.z - e.pos.z);
      if (dd > 1.6) continue;
      // the doorway: a segment across the opening (local X of the door), a little wider than the leaf
      const c = Math.cos((d.rot || 0) * D2R), sn = Math.sin((d.rot || 0) * D2R), hw = (d.w || 0.9) / 2 + 0.25;
      const ax = d.x - c * hw, az = d.z + sn * hw, bx = d.x + c * hw, bz = d.z - sn * hw;
      if (!segCross(e.pos.x, e.pos.z, ex, ez, ax, az, bx, bz)) continue;
      try { World.door(id).open(); } catch (err) { /* door api */ }
      if (e.data.nav) e.data.nav.t = 99;
    }
  }
  function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
    const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
    return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
  }
  // footsteps by distance walked (positional; surface from the room)
  const STEPS = { tethered: { stride: 0.34, vol: 0.22 }, reach: { stride: 0.85, vol: 0.9, heavy: true }, standard: { stride: 1.05, vol: 0.55 }, borrowed: { stride: 0.72, vol: 0.5 } };
  function footsteps(e) {
    const cfg = e.T.steps || STEPS[e.type]; if (!cfg || !e.actor) return;
    const D = e.data, lp = D.lastPos || (D.lastPos = e.pos.clone());
    const d = Math.hypot(e.pos.x - lp.x, e.pos.z - lp.z);
    lp.copy(e.pos);
    if (d > 1.5 || e.downed || e.knocked || e.resolved || e.hidden) { D.stepAcc = 0; return; }
    D.stepAcc = (D.stepAcc || 0) + d;
    if (D.stepAcc < cfg.stride) return;
    D.stepAcc -= cfg.stride;
    if (e.type === 'borrowed' && e.disguised) return;
    try {
      if (typeof Snd === 'undefined' || !Snd.footstep) return;
      const surf = hasWorld() && World.surfaceAt ? World.surfaceAt(e.pos.x, e.pos.z) : 'concrete';
      Snd.footstep(surf, e.state === 'lunge', { pos: [e.pos.x, e.pos.y + 0.05, e.pos.z], vol: cfg.vol, heavy: !!cfg.heavy });
    } catch (err) { /* audio */ }
  }
  // keep bodies apart
  function separate() {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.actor || a.removed || a.noBody || a.downed || !active(a) || a.hidden) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.actor || b.removed || b.noBody || b.downed || !active(b) || b.hidden) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5, ux = dx / d, uz = dz / d;
        const fa = a.pinned ? 0 : b.pinned ? 2 : 1, fb = 2 - fa;
        if (fa) { const r = World.move(a.pos, -ux * push * fa, -uz * push * fa, a.radius, { ignore: isEnemyCol }); a.pos.set(r.x, r.y, r.z); }
        if (fb) { const r = World.move(b.pos, ux * push * fb, uz * push * fb, b.radius, { ignore: isEnemyCol }); b.pos.set(r.x, r.y, r.z); }
      }
    }
  }
  function pushBack(e, from, dist) {
    if (!hasWorld() || e.pinned) return;
    const dx = e.pos.x - from.x, dz = e.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    const r = World.move(e.pos, dx / d * dist, dz / d * dist, e.radius, { ignore: isEnemyCol });
    e.pos.set(r.x, r.y, r.z);
  }
  // can e see Aidan? (range, facing cone in degrees or null, eye height, LOS min height)
  function sees(e, range, cone = null, minH = 1.5) {
    if (!pOK()) return false;
    const p = Player.pos, d = flatDist(e.pos, p);
    if (d > range) return false;
    if (Math.abs(p.y - e.pos.y) > 3) return false;
    if (cone !== null && d > 0.8) { const a = Math.abs(U.angleDiff(e.yaw, yawTo(e.pos, p))); if (a > cone * D2R / 2) return false; }
    return los(e.pos.x, e.pos.z, p.x, p.z, { minH, y: e.pos.y });
  }

  // ---- damage, stun, knockdown, down, resolution -----------------------------------------------------------------
  function damage(e, n, weapon) {
    if (e.resolved || e.removed || !active(e) || e.untouchable) return false;
    if (e.T.onHit) { let r; try { r = e.T.onHit(e, n, weapon); } catch (err) { console.error('[Enemies] onHit', err); } if (r === false) return false; }
    if (e.invincible) return true;
    e.lastHit = clock;
    if (e.downed) { if (e.actor) e.actor.gesture('flinch', { dur: 0.4 }); return true; }
    e.hp -= Math.max(0, +n || 0);
    if (e.hp <= 0) {
      if (e.T.downs !== false) goDown(e);
      else resolve(e, 'dead');
      return true;
    }
    react(e, weapon, n);
    return true;
  }
  function react(e, weapon, n) {
    e.flinchT = n >= 15 ? 0.55 : 0.35;
    if (e.data.windup) { e.data.windup = null; e.data.cancelled = true; }
    if (e.actor && !e.knocked) e.actor.gesture('flinch', { dur: n >= 15 ? 0.8 : 0.6 });
    if (pOK()) pushBack(e, Player.pos, weapon === 'steel_bar' || weapon === 'extinguisher' ? 0.35 : weapon === 'unarmed' ? 0.25 : 0.15);
    if (e.T.onReact) e.T.onReact(e, n, weapon);
  }
  function stun(e, sec) {
    if (e.resolved || e.removed || e.invincible || e.downed) return false;
    if (e.T.stun && e.T.stun(e, sec) === false) return false;
    e.stunT = Math.max(e.stunT, sec);
    if (e.data.windup) { e.data.windup = null; e.data.cancelled = true; }
    return true;
  }
  function knockdown(e) {
    if (e.resolved || e.removed || e.invincible || e.downed || e.knocked) return false;
    if (e.T.knockdown && e.T.knockdown(e) === false) return false;
    e.knocked = true; e.knockT = 2.5; e.data.preState = e.state; e.state = 'knock';
    if (e.data.windup) { e.data.windup = null; e.data.cancelled = true; }
    if (e.actor) { e.actor.finishGestures(); e.actor.setAnim('collapse', { blend: 0.12 }); }
    sfx('thud', { pos: P3(e.pos, 0.3) });
    downPrompts(e);
    return true;
  }
  function goDown(e) {
    if (!e.knocked) e.data.preState = e.state;
    e.downed = true; e.knocked = false; e.hp = 0.01;      // Player treats hp === 0 as "not alive": keep a sliver while downed
    e.downT = 6; e.stunT = 0; e.state = 'down';
    if (e.data.windup) e.data.windup = null;
    if (e.actor) { e.actor.finishGestures(); e.actor.setAnim('collapse', { blend: 0.12 }); }
    sfx('thud', { pos: P3(e.pos, 0.3) });
    if (e.T.onDown) e.T.onDown(e);
    downPrompts(e);
  }
  function downPrompts(e) {
    if (e.T.stompable === false) return;
    ui('prompt', '{interact}: stomp.', { id: 'enemy_stomp' });
    if (e.type === 'tethered' && Array.isArray(S.inv) && S.inv.some((i) => i && i.id === 'box_cutter')) ui('prompt', 'Hold {interact}: cut it free.', { id: 'enemy_cutfree', delay: 0.6 });
  }
  function getUp(e) {
    e.downed = false; e.knocked = false;
    if (e.state === 'down' || e.state === 'knock') e.state = e.data.preState && e.data.preState !== 'down' && e.data.preState !== 'knock' ? e.data.preState : 'idle';
    if (e.hp <= 0.02) e.hp = Math.max(1, Math.round(e.maxHp * 0.4));
    if (e.actor) e.actor.setAnim(e.T.idleAnim || 'idle', { blend: 0.8 });
    if (e.T.onUp) e.T.onUp(e);
  }
  function stompEnemy(e) {
    if (!e.canStomp()) return false;
    if (e.T.stomp) return e.T.stomp(e);
    if (e.knocked && !e.downed) {
      e.hp -= 30;
      if (e.hp > 0) { e.knockT = Math.max(e.knockT, 0.8); if (e.actor) e.actor.gesture('flinch', { dur: 0.5 }); return true; }
    }
    resolve(e, 'dead', { how: 'stomp' });
    return true;
  }
  function cutFreeEnemy(e) {
    if (!e.canCutFree()) return false;
    resolve(e, 'freed', { how: 'cut' });
    return true;
  }
  function resolve(e, how, o = {}) {
    if (e.resolved) return false;
    o.wasDown = e.downed || e.knocked;
    e.resolved = how; e.state = how; e.hostile = false; e.downed = false; e.knocked = false; e.stunT = 0;
    e.data.windup = null;
    if (e.def.persist !== false && e.id && !String(e.id).includes('#')) S.spawns[e.id] = how;
    if (how === 'freed') {
      if (e.id && !S.freedOrder.includes(e.id)) S.freedOrder.push(e.id);
      S.stats.freed = (S.stats.freed || 0) + 1;
      if (e.type === 'tethered') track('F', 1, 'cut free');
      if (e.T.onFreed) e.T.onFreed(e);
      Bus.emit('enemy:freed', e);
    } else {
      if (e.type === 'tethered') { S.stats.stomped = (S.stats.stomped || 0) + 1; track('A', 1, 'stomp'); }
      else S.stats.killed = (S.stats.killed || 0) + 1;
      if (e.T.onDie) e.T.onDie(e, o); else defaultDeath(e);
      Bus.emit('enemy:killed', e);
    }
    stopLoops(e);
    syncCollider(e);
    return true;
  }
  // default death: collapse, then fade into the fog and go
  function defaultDeath(e, o = {}) {
    e.data.fadeOut = { t: 0, delay: 2.2, dur: 2.4 };
    if (e.actor) { e.actor.finishGestures(); e.actor.lookAt(null); if (!o.wasDown) e.actor.setAnim('collapse', { blend: 0.2 }); }
  }
  function stepFade(e, dt) {
    const f = e.data.fadeOut; if (!f) return;
    f.t += dt;
    if (f.t < f.delay) return;
    const k = clamp((f.t - f.delay) / f.dur);
    if (e.actor) e.actor.setOpacity(1 - k);
    e.fx.traverse((c) => { if (c.material && !c.material.userData.shared && !c.material.userData.keep) { c.material.transparent = true; c.material.opacity = (c.material.userData.op0 ??= c.material.opacity) * (1 - k); } });
    if (k >= 1) removeEnemy(e);
  }

  // =================================================================================================================
  // THE TETHERED (fear of mis-selling)
  // =================================================================================================================
  let lastTethVoice = -Infinity;
  const TETH = { speed: 0.6, leash: 3, notice: 5, quiet: 1.0, lashRange: 3.5, lashCd: 4, turn: 1.2 };
  const CARDI = ['#6d6456', '#7a5a3c', '#566474', '#6b4a4a', '#5a634c', '#86744f', '#4d5560', '#7c6a62'];
  const BLOUSE = ['#b8b0a0', '#c9c2b2', '#a9b0b4', '#c4b6a6', '#b2aa9c'];
  function paintSealedFace(ctx, S0, skin, r) {
    const X = (x) => (0.5 + x / 0.72) * S0, Y = (y) => (1 - (y + 0.03) / 1.06) * S0, k = S0 / 256;
    ctx.fillStyle = skin; ctx.fillRect(0, 0, S0, S0);
    const blob = (x, y, rx, ry, col, a) => { ctx.save(); ctx.translate(X(x), Y(y)); ctx.scale(1, ry / rx); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * S0 / 0.72); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * S0 / 0.72, 0, TAU); ctx.fill(); ctx.restore(); };
    // bloodless and bluish round the edges (no air under the plastic); shadowed where the shell rim bites in
    blob(0, 0.45, 0.44, 0.56, '70,86,110', 0.34);
    ctx.strokeStyle = 'rgba(60,50,52,0.55)'; ctx.lineWidth = 7 * k;
    ctx.beginPath(); ctx.ellipse(X(0), Y(0.47), 0.345 / 0.72 * S0, 0.48 / 1.06 * S0, 0, 0, TAU); ctx.stroke();
    // pressed flat: white where the plastic touches — forehead, a nose squashed wide, cheeks, chin
    blob(0, 0.74, 0.24, 0.1, '250,244,236', 0.95);
    blob(0, 0.4, 0.17, 0.08, '252,246,240', 1);
    blob(-0.2, 0.33, 0.1, 0.09, '246,238,230', 0.85); blob(0.2, 0.33, 0.1, 0.09, '246,238,230', 0.85);
    blob(0, 0.05, 0.12, 0.06, '246,238,230', 0.8);
    // eyes squeezed shut, spread by the pressure: dark creases with shadowed sockets
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const ex = X(sx * 0.155), ey = Y(0.52);
      blob(sx * 0.155, 0.52, 0.1, 0.05, '70,48,52', 0.55);
      ctx.strokeStyle = 'rgba(38,24,24,0.95)'; ctx.lineWidth = 5 * k;
      ctx.beginPath(); ctx.moveTo(ex - 22 * k, ey + 2 * k); ctx.quadraticCurveTo(ex, ey + 8 * k, ex + 22 * k, ey - 1 * k); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,40,0.7)'; ctx.lineWidth = 2.2 * k;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(ex + sx * (18 + i * 2) * k, ey - (8 - i * 5) * k); ctx.lineTo(ex + sx * (30 + i * 2) * k, ey - (13 - i * 8) * k); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(96,86,80,0.9)'; ctx.lineWidth = 3.5 * k;
      ctx.beginPath(); ctx.moveTo(ex - 20 * k, Y(0.64)); ctx.quadraticCurveTo(ex, Y(0.67), ex + 20 * k, Y(0.625)); ctx.stroke();
    }
    // nostrils squashed sideways
    ctx.fillStyle = 'rgba(50,28,26,0.9)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(X(sx * 0.06), Y(0.355), 8 * k, 3 * k, 0, 0, TAU); ctx.fill(); }
    // mouth open against the plastic: wide, flattened, dark, the lips pressed white
    const mx = X(0), my = Y(0.19);
    ctx.fillStyle = 'rgba(236,214,206,0.95)'; ctx.beginPath(); ctx.ellipse(mx, my, 50 * k, 30 * k, 0, 0, TAU); ctx.fill();
    const mg = ctx.createRadialGradient(mx, my + 4 * k, 3 * k, mx, my, 42 * k); mg.addColorStop(0, '#050202'); mg.addColorStop(0.7, '#1c0a09'); mg.addColorStop(1, '#4a2624');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(mx, my, 42 * k, 23 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(222,212,196,0.85)'; ctx.beginPath(); ctx.ellipse(mx, my - 17 * k, 26 * k, 5 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#050202'; ctx.beginPath(); ctx.ellipse(mx, my - 12 * k, 30 * k, 5 * k, 0, 0, Math.PI); ctx.fill();
    // breath fog on the inside of the shell
    for (let i = 0; i < 110; i++) {
      const a = r() * TAU, d = Math.pow(r(), 0.7) * 60 * k;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.12})`;
      ctx.beginPath(); ctx.arc(mx + Math.cos(a) * d * 1.3, my - 20 * k + Math.sin(a) * d * 0.7, (1.5 + r() * 3.5) * k, 0, TAU); ctx.fill();
    }
    grimeFace(ctx, S0, r);
  }
  function paintFreedFace(ctx, S0, skin, r) {
    const X = (x) => (0.5 + x / 0.72) * S0, Y = (y) => (1 - (y + 0.03) / 1.06) * S0, k = S0 / 256;
    ctx.fillStyle = skin; ctx.fillRect(0, 0, S0, S0);
    const blob = (x, y, rx, ry, col, a) => { ctx.save(); ctx.translate(X(x), Y(y)); ctx.scale(1, ry / rx); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * S0 / 0.72); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * S0 / 0.72, 0, TAU); ctx.fill(); ctx.restore(); };
    // colour coming back, a tired older face; the plastic has left a red ring
    blob(-0.18, 0.33, 0.1, 0.07, '190,110,100', 0.35); blob(0.18, 0.33, 0.1, 0.07, '190,110,100', 0.35);
    blob(0, 0.36, 0.08, 0.1, '120,80,70', 0.35);
    ctx.strokeStyle = 'rgba(190,110,100,0.5)'; ctx.lineWidth = 5 * k;
    ctx.beginPath(); ctx.ellipse(X(0), Y(0.47), 0.345 / 0.72 * S0, 0.48 / 1.06 * S0, 0, 0, TAU); ctx.stroke();
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const ex = X(sx * 0.135), ey = Y(0.5);
      blob(sx * 0.135, 0.49, 0.085, 0.045, '90,60,60', 0.5);
      ctx.strokeStyle = 'rgba(40,26,22,0.95)'; ctx.lineWidth = 3.6 * k;              // eyes closed, at rest
      ctx.beginPath(); ctx.moveTo(ex - 15 * k, ey - 1 * k); ctx.quadraticCurveTo(ex, ey + 6 * k, ex + 15 * k, ey - 1 * k); ctx.stroke();
      ctx.strokeStyle = 'rgba(70,60,56,0.9)'; ctx.lineWidth = 3.4 * k;               // brows, lifted
      ctx.beginPath(); ctx.moveTo(ex - 16 * k, Y(0.61)); ctx.quadraticCurveTo(ex, Y(0.64), ex + 16 * k, Y(0.615)); ctx.stroke();
      ctx.strokeStyle = 'rgba(110,76,66,0.45)'; ctx.lineWidth = 1.4 * k;             // crow's feet, bags
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(ex + sx * 17 * k, ey + (i * 5 - 4) * k); ctx.lineTo(ex + sx * 27 * k, ey + (i * 8 - 8) * k); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ex - 11 * k, ey + 10 * k); ctx.quadraticCurveTo(ex, ey + 15 * k, ex + 11 * k, ey + 10 * k); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,40,34,0.7)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(X(sx * 0.035), Y(0.35), 4 * k, 2.6 * k, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(96,52,48,0.95)'; ctx.lineWidth = 3.2 * k;                // mouth closed, the long exhale done
    ctx.beginPath(); ctx.moveTo(X(-0.085), Y(0.205)); ctx.quadraticCurveTo(X(0), Y(0.19), X(0.085), Y(0.205)); ctx.stroke();
    ctx.strokeStyle = 'rgba(110,76,66,0.5)'; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); ctx.moveTo(X(-0.13), Y(0.29)); ctx.quadraticCurveTo(X(-0.11), Y(0.21), X(-0.13), Y(0.14)); ctx.moveTo(X(0.13), Y(0.29)); ctx.quadraticCurveTo(X(0.11), Y(0.21), X(0.13), Y(0.14)); ctx.stroke();
    ctx.strokeStyle = 'rgba(110,76,66,0.35)'; ctx.lineWidth = 1.2 * k;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(X(-0.16), Y(0.74 + i * 0.04)); ctx.quadraticCurveTo(X(0), Y(0.755 + i * 0.04), X(0.16), Y(0.74 + i * 0.04)); ctx.stroke(); }
    grimeFace(ctx, S0, r);
  }
  function grimeFace(ctx, S0, r) { for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '60,50,40' : '255,250,240'},${r() * 0.05})`; ctx.fillRect(r() * S0, r() * S0, 1.5, 1.5); } }
  // the clamshell over the face (head units; face toward +Z): dome, flange, hang tab, additive glare
  function shellGeos() {
    return shared('shellGeos', () => {
      const dome = new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, HALF).rotateX(HALF).scale(0.37, 0.5, 0.22).translate(0, 0.47, 0.27);
      const sh = new THREE.Shape();
      const rr = (x0, y0, x1, y1, r) => { sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); };
      rr(-0.55, -0.1, 0.55, 1.06, 0.1);
      const hole = new THREE.Path(); hole.absellipse(0, 0.47, 0.36, 0.49, 0, TAU, true); sh.holes.push(hole);
      const flange = new THREE.ShapeGeometry(sh, 10).translate(0, 0, 0.27);
      const tab = new THREE.Shape();
      tab.moveTo(-0.2, 1.0); tab.lineTo(0.2, 1.0); tab.lineTo(0.2, 1.32); tab.quadraticCurveTo(0.2, 1.38, 0.14, 1.38); tab.lineTo(-0.14, 1.38); tab.quadraticCurveTo(-0.2, 1.38, -0.2, 1.32); tab.lineTo(-0.2, 1.0);
      const slot = new THREE.Path(); slot.moveTo(-0.08, 1.24); slot.lineTo(0.08, 1.24); slot.absarc(0.08, 1.27, 0.03, -HALF, HALF, false); slot.lineTo(-0.08, 1.3); slot.absarc(-0.08, 1.27, 0.03, HALF, HALF * 3, false);
      tab.holes.push(slot);
      const tabG = new THREE.ShapeGeometry(tab, 8).translate(0, 0, 0.26);
      const flangeTab = Kit.mergeGeometries([{ geo: flange, m: new THREE.Matrix4() }, { geo: tabG, m: new THREE.Matrix4() }]);
      for (const g of [dome, flange, tabG, flangeTab]) g.userData.shared = true;
      return { dome, flange, tab: tabG, flangeTab };
    });
  }
  const shellMat = () => shared('shellMat', () => markShared(new THREE.MeshStandardMaterial({ color: '#eef6f6', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false })));
  const flangeMat = () => shared('flangeMat', () => markShared(new THREE.MeshStandardMaterial({ color: '#e6f0ef', transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false })));
  // The glare streaks and the rim highlight are unlit (additive / line) materials, so their brightness is driven by
  // the light that actually reaches the plastic (shellLight, every frame): the torch hitting the face flares them, a
  // lamp close by gives a soft sheen, a lit Fog-world street a faint rim — and in a dark room they are gone.
  const glareMat = () => shared('glareMat', () => markShared(new THREE.MeshBasicMaterial({ map: glareTexture(), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })));
  const edgeMat = () => shared('edgeMat', () => markShared(new THREE.LineBasicMaterial({ color: '#f4fbfa', transparent: true, opacity: 0.4, fog: true })));
  const ownMat = (m) => { const c = m.clone(); c.userData.shared = false; return c; };
  function buildShell(a) {
    const G = shellGeos(), g = new THREE.Group(); g.name = 'clamshell';
    const dome = new THREE.Mesh(G.dome, shellMat()); dome.renderOrder = 2;
    const gm = ownMat(glareMat()), em = ownMat(edgeMat());
    gm.opacity = 0; em.opacity = 0;
    const glare = new THREE.Mesh(G.dome, gm); glare.scale.setScalar(1.004); glare.renderOrder = 3; glare.visible = false;
    const flange = new THREE.Mesh(G.flangeTab, flangeMat()); flange.renderOrder = 2;
    for (const m of [dome, glare, flange]) { m.castShadow = false; g.add(m); }
    const edges = new THREE.LineSegments(shared('shellEdges', () => { const eg = new THREE.EdgesGeometry(Kit.mergeGeometries([{ geo: G.flange, m: new THREE.Matrix4() }, { geo: G.tab, m: new THREE.Matrix4() }]), 20); eg.userData.shared = true; return eg; }), em);
    edges.renderOrder = 3; edges.visible = false; g.add(edges);
    g.userData.glare = glare; g.userData.edges = edges; g.userData.lit = 0;
    a.headSpace.add(g);
    return g;
  }
  const _sl = new THREE.Vector3(), _sn = new THREE.Vector3(), _st = new THREE.Vector3();
  function shellLight(sh, dt) {
    if (!sh || !sh.userData.glare || typeof Render === 'undefined' || !Render.lightAt) return;
    sh.updateWorldMatrix(true, false);
    sh.getWorldPosition(_sl);
    // the torch only glares off the front of the clamshell (the face side, local +Z)
    let facing = 1;
    if (Render.torch && Render.torch.isOn) {
      _sn.set(0, 0, 1).transformDirection(sh.matrixWorld);
      Render.torch.light.getWorldPosition(_st).sub(_sl).normalize();
      facing = 0.25 + 0.75 * Math.max(0, _sn.dot(_st));
    }
    const torch = Render.lightAt(_sl, { pool: false }) * facing, lamps = Render.lightAt(_sl, { torch: false }), amb = Render.lightAt(_sl, { torch: false, pool: false, ambient: true });
    const want = U.clamp(torch * 0.9 + lamps * 0.5 + Math.max(0, amb - 0.08) * 0.35);
    const k = sh.userData.lit = dt > 0 ? U.damp(sh.userData.lit, want, 12, dt) : want;
    const { glare, edges } = sh.userData;
    glare.material.opacity = 0.5 * U.clamp(torch * 0.9 + lamps * 0.25) * (k > 0 ? 1 : 0);
    edges.material.opacity = 0.42 * k;
    glare.visible = glare.material.opacity > 0.01;
    edges.visible = edges.material.opacity > 0.01;
  }
  function buildBackBoxes(a, seed) {
    const r = U.rng(seed * 97 + 3), grp = new THREE.Group(); grp.name = 'backBoxes';
    const back = a.anchors.back ? a.anchors.back.position : V(0, 0.05, -0.12);
    const n = 9 + Math.floor(r() * 4);
    const mats = [0, 1, 2, 3].map((k) => shared('boxMat' + k, () => markShared(new THREE.MeshStandardMaterial({ map: boxTexture(k), color: '#a9a499', roughness: 0.7 }))));
    const boxG = shared('boxG', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.userData.shared = true; return g; });
    const boxes = [], merged = [[], [], [], []];
    for (let i = 0; i < n; i++) {
      const layer = i < 5 ? 0 : i < 9 ? 1 : 2;
      const w = 0.07 + r() * 0.07, h = 0.09 + r() * 0.09, d = 0.03 + r() * 0.04, mi = Math.floor(r() * 4);
      // layered like shingles down the upper back, half sunk into the cardigan
      const pos = V((r() - 0.5) * 0.24 * (1 - layer * 0.3), back.y - 0.2 + r() * 0.2 + layer * 0.03, back.z + d * 0.25 - layer * 0.035 - r() * 0.015);
      const rot = new THREE.Euler(-0.25 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * 0.9);
      if (i >= n - 3) {                                  // the outer layer stays loose: these break off when it dies
        const m = new THREE.Mesh(boxG, mats[mi]);
        m.scale.set(w, h, d); m.position.copy(pos); m.rotation.copy(rot); m.castShadow = true;
        grp.add(m); boxes.push(m);
      } else merged[mi].push({ geo: boxG, m: new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), V(w, h, d)) });
    }
    merged.forEach((items, mi) => { if (!items.length) return; const m = new THREE.Mesh(Kit.mergeGeometries(items), mats[mi]); m.castShadow = true; grp.add(m); });
    a.bones.chest.add(grp);
    return { grp, boxes };
  }
  function tetheredCreate(e, def) {
    const seed = U.hash(e.id);
    const r = U.rng(seed);
    const f = r() < 0.6;
    const skin = ['#cbb5a3', '#c4ab98', '#bfa491', '#d0bcae'][Math.floor(r() * 4)];
    const watching = !!(def.watching || def.variant === 'watching');
    const a = Rig.human({
      height: def.height || 1.5, build: 'frail', gender: f ? 'f' : 'm', age: 60 + Math.floor(r() * 20), seed: (seed % 997) + 1,
      detail: def.detail || (def.rig && def.rig.detail) || undefined,                 // CONTRACT+ 'low' for distant figures
      skin, hunch: def.hunch ?? 0.62, faceMode: 'custom',
      hair: { style: f ? (r() < 0.5 ? 'bun' : 'short') : (r() < 0.5 ? 'receding' : 'short'), color: ['#a8a39a', '#8e8a84', '#c4c0b8', '#6d655c'][Math.floor(r() * 4)] },
      top: { kind: f ? 'blouse' : 'shirt', color: BLOUSE[Math.floor(r() * BLOUSE.length)] },
      layers: [{ kind: 'cardigan', color: def.cardigan || CARDI[Math.floor(r() * CARDI.length)], open: true }],
      pants: { kind: 'slacks', color: ['#4a4640', '#57524a', '#3e4046'][Math.floor(r() * 3)] }, shoes: { kind: f ? 'flat' : 'dress', color: '#3a3430', sole: '#1e1a18' },
      style: { slouch: 0.9, stepLen: 0.6, armSwing: 0.25, narrow: 0.4 }, idleLife: false, walkSpeed: TETH.speed, sound: false,
    });
    a.idleLife = false;
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.3; e.height = 1.35; e.hp = e.maxHp = def.hp ?? 30;
    e.aware = false;
    e.data.watching = watching;
    e.data.face = (mode) => {
      const fc = a.faceCanvas; if (!fc) return;
      const rr = U.rng(seed + 7);
      if (mode === 'freed') paintFreedFace(fc.ctx, fc.S, skin, rr); else paintSealedFace(fc.ctx, fc.S, skin, rr);
      fc.tex.needsUpdate = true;
    };
    a._paintFace = function () { /* the Tethered's face is painted by Enemies */ };
    e.data.face('sealed');
    a.headSpace.scale.z *= 0.84;
    e.data.shell = buildShell(a);
    e.data.boxes = buildBackBoxes(a, seed);
    a.hold('R', 'box', { pose: 'hold' });
    // tethers: wrists → chest, chest → floor → anchor; sensor pucks on the wrists; the floor anchor plate
    const anc = def.anchor || def.pos || [0, 0];
    e.data.anchor = V(anc[0], floorY(anc[0], anc[1], 0), anc[1]);
    e.data.teth = { wl: tetherMesh('short'), wr: tetherMesh('short'), down: tetherMesh('long'), floor: tetherMesh('long'), lash: tetherMesh('lash') };
    for (const m of Object.values(e.data.teth)) e.fx.add(m);
    e.data.teth.lash.visible = false;
    const plate = new THREE.Mesh(shared('plateGeo', () => { const g = new THREE.CylinderGeometry(0.075, 0.085, 0.018, 14); g.userData.shared = true; return g; }), puckMat());
    plate.position.copy(e.data.anchor); plate.position.y += 0.009; e.fx.add(plate);
    const plug = new THREE.Mesh(puckGeo(), puckMat()); plug.position.copy(e.data.anchor); plug.position.y += 0.03; e.fx.add(plug);
    e.data.leds = [];
    for (const s of ['L', 'R']) {
      const pk = new THREE.Mesh(puckGeo(), puckMat());
      pk.position.set(0, -0.012, 0.0); pk.rotation.z = HALF; pk.scale.setScalar(0.8);
      a.bones['hand' + s].add(pk);
      const led = new THREE.Mesh(ledGeo(), ledMat()); led.position.set(0, 0.014, 0.012); pk.add(led);
      e.data.leds.push(led);
    }
    const lashTip = new THREE.Mesh(puckGeo(), puckMat()); lashTip.visible = false; e.fx.add(lashTip); e.data.lashTip = lashTip;
    // the tethers and the pucks: one draw call per material (Rig.batch — each part keeps moving on its own)
    if (Rig.batching !== false) e.fxBatch = Rig.batch(e.fx);
    e.data.shown = true;
    // restored / variants
    if (e.restored === 'freed') { tethFreedPose(e, true); }
    else if (e.restored === 'dead') { e.resolved = 'dead'; e.state = 'dead'; e.hostile = false; e.threat = false; a.setAnim('lie_side', { blend: 0 }); ledsOn(e, false); }
    else if (watching) { e.state = 'watch'; e.hostile = false; e.untouchable = true; e.lockable = false; e.threat = def.threat ?? true; a.setAnim('idle_hunched', { blend: 0 }); }
    else if (def.sit) { e.state = 'sit'; a.setAnim(def.sit === 'floor' ? 'sit_floor' : 'sit', { blend: 0, seat: def.seatH || 0.46 }); }
    else { e.state = 'idle'; a.setAnim('idle_hunched', { blend: 0 }); }
    if (!e.resolved) loop(e, 'tethered_crinkle', true, { pos: [0, 0, 0], vol: 0.55, intensity: 0.25, voice: def.voice !== false });
  }
  function ledsOn(e, on) { for (const l of e.data.leds || []) l.material = on ? ledMat() : ledOffMat(); e.data.ledOn = on; }
  function tethFreedPose(e, instant) {
    const a = e.actor, def = e.def;
    e.resolved = 'freed'; e.state = 'freed'; e.hostile = false; e.threat = false; e.lockable = false; e.untouchable = true; e.aware = true;
    e.data.face('freed');
    e.colR = 0.28;
    ledsOn(e, false);
    if (e.data.shell) {
      const sh = e.data.shell;
      sh.parent && sh.parent.remove(sh);
      e.fx.add(sh);
      e.data.shellLoose = true;
    }
    a.hold('R', null);
    const seat = def.seat;
    if (instant) {
      if (seat && seat.pos) { e.pos.set(seat.pos[0], floorY(seat.pos[0], seat.pos[1], e.pos.y), seat.pos[1]); e.yaw = (seat.rot ?? def.rot ?? 0) * D2R; e.placed = true; }
      a.setAnim(seat ? 'sit' : 'sit_floor', { blend: 0, seat: seat && seat.h ? seat.h : 0.46 });
      e.data.needShell = true;
    }
  }
  // the loosened packaging, lying beside the sitting figure
  function placeLooseShell(e, k) {
    const sh = e.data.shell; if (!sh) return;
    const a = e.actor, u = a.D.head * a.H;
    const side = e.yaw + 0.9, dist = 0.42;
    const tx = e.pos.x + Math.sin(side) * dist, tz = e.pos.z + Math.cos(side) * dist, ty = floorY(tx, tz, e.pos.y) + 0.02;
    const from = e.data.shellFrom;
    const to = V(tx, ty, tz);
    if (from && k < 1) sh.position.lerpVectors(from.pos, to, U.ease.in(k)); else sh.position.copy(to);
    const q = _q1.setFromEuler(_e1.set(-HALF + 0.12, side + 2.2, 0.25));
    if (from && k < 1) sh.quaternion.slerpQuaternions(from.quat, q, k); else sh.quaternion.copy(q);
    sh.scale.setScalar(u);
  }
  function tethNotices(e, dt) {
    const def = e.def;
    if (!pOK()) return false;
    const p = Player.pos, d = flatDist(e.pos, p);
    const range = def.noticeRange ?? TETH.notice;
    if (d > range || Math.abs(p.y - e.pos.y) > 2.5) return false;
    // being cut free: it doesn't notice
    const h = Player.holding;
    if (h && h.kind === 'cut' && d < 2.2) return false;
    if (!los(e.pos.x, e.pos.z, p.x, p.z, { minH: 1.5, y: e.pos.y })) return false;
    const front = Math.abs(U.angleDiff(e.yaw, yawTo(e.pos, p))) < 70 * D2R;
    if (front || Player.running || Player.torchOn || e.def.sit) return true;
    // quiet approach from behind with the torch off: only very close, after a moment
    if (d < TETH.quiet) { e.data.closeT = (e.data.closeT || 0) + dt; return e.data.closeT > 1.4; }
    e.data.closeT = 0;
    return false;
  }
  // o.voice:true (e.alert({voice:true})) — a scripted reveal: the muffled line plays even if another Tethered spoke in
  // the last 25 s (the throttle only thins out ambient voices)
  function tethStartTurn(e, o = {}) {
    if (e.state !== 'idle' && e.state !== 'sit') return;
    e.aware = true;
    const wasSit = e.state === 'sit';
    e.state = 'turn'; e.stateT = 0;
    e.data.turnFrom = e.yaw;
    e.data.standUp = wasSit ? 1.1 : 0;
    if (wasSit) e.actor.gesture('stand_up', { to: 'idle_hunched' });
    sfx('plastic', { pos: P3(e.pos, 1.2), dur: 1.0, dens: 0.8 });
    if (e.def.voice !== false && !e.data.spoke && (o.voice === true || clock - lastTethVoice > 25)) {
      e.data.spoke = true; lastTethVoice = clock;
      const src = DIALOGUE.tethered, l0 = Array.isArray(src) ? src[0] : src;
      const line = (typeof l0 === 'string' && l0) || (l0 && l0.text) || 'I only came in to...';
      later(e, 0.9, () => { if (!e.resolved) { Voice.say(line, 'muffled'); murmur('tethered', { pos: P3(e.pos, 1.3), vol: 0.9 }); } });
    }
  }
  function tetheredUpdate(e, dt, ai) {
    const a = e.actor, D = e.data;
    // LED blink (wrist sensors)
    if (!e.resolved) { D.ledT = (D.ledT || 0) + dt; const per = e.downed ? 0.35 : e.aware ? 0.7 : 1.6; const on = (D.ledT % per) < 0.08; for (const l of D.leds) l.visible = on || e.state === 'hold'; }
    if (e.resolved === 'freed') { tethFreedUpdate(e, dt); return; }
    if (e.resolved) return;
    if (e.state === 'watch') {
      if (pOK() && flatDist(e.pos, Player.pos) < 16) a.lookAt(Player.actor); else a.lookAt(null);
      return;
    }
    // crinkle intensity
    loop(e, 'tethered_crinkle', true, { pos: P3(e.pos, 1.2), intensity: e.aware ? 0.75 : 0.25, vol: 0.55 });
    if (e.downed || e.knocked) {
      if (e.downed) { const h = Player.holding; if (h && h.kind === 'cut') e.downT = Math.max(e.downT, 0.5); }
      return;
    }
    if (e.stunT > 0) { if (a.anim !== 'cower') a.setAnim('cower', { blend: 0.2 }); a.armPose('R', 'hold'); tethLashEnd(e, true); return; }
    if (e.state === 'stun') e.state = 'offer';
    if (!ai) { if (e.state === 'offer' && a.anim !== 'idle_hunched') a.setAnim('idle_hunched', { blend: 0.4 }); return; }
    const p = pOK() ? Player.pos : null;
    const d = p ? flatDist(e.pos, p) : 99;
    switch (e.state) {
      case 'idle': case 'sit':
        if (tethNotices(e, dt)) tethStartTurn(e);
        else if (e.state === 'idle' && D.returning && flatDist(e.pos, e.home) > 0.3) {
          const m = moveToward(e, e.home.x, e.home.z, TETH.speed, dt, { stopAt: 0.2 });
          if (m.arrived) { D.returning = false; }
          a.setAnim(m.moved > 1e-4 ? 'walk' : 'idle_hunched', { blend: 0.4 });
        } else if (e.state === 'idle') { e.yaw = turnToward(e.yaw, e.homeYaw, 0.8, dt); if (a.anim !== 'idle_hunched') a.setAnim('idle_hunched', { blend: 0.5 }); }
        break;
      case 'turn': {
        if (D.standUp > 0) { D.standUp -= dt; if (D.standUp > 0) break; e.stateT = 0; D.turnFrom = e.yaw; }
        const k = clamp(e.stateT / TETH.turn), target = p ? yawTo(e.pos, p) : e.yaw;
        e.yaw = U.wrapAngle(D.turnFrom + U.angleDiff(D.turnFrom, target) * U.ease.inOut(k));
        if (a.anim !== 'idle_hunched') a.setAnim('idle_hunched', { blend: 0.4 });
        if (k >= 0.5 && !D.offered) { D.offered = true; a.armPose('R', 'offer'); a.lookAt(Player.actor); }
        if (k >= 1) { e.state = 'offer'; e.stateT = 0; D.lashCd = Math.max(D.lashCd || 0, 1.2); }
        break;
      }
      case 'offer': {
        a.armPose('R', 'offer'); a.lookAt(Player.actor);
        D.lashCd = Math.max(0, (D.lashCd || 0) - dt);
        if (!p) break;
        if (d > 9 || !los(e.pos.x, e.pos.z, p.x, p.z, { minH: 1.5, y: e.pos.y })) D.lostT = (D.lostT || 0) + dt; else D.lostT = 0;
        if (D.lostT > 6) { e.state = 'idle'; e.aware = false; D.offered = false; D.returning = true; a.armPose('R', 'hold'); a.lookAt(null); break; }
        if (d <= TETH.lashRange && D.lashCd <= 0 && e.flinchT <= 0 && !Player.grabbed && los(e.pos.x, e.pos.z, p.x, p.z, { minH: 1.0, y: e.pos.y })) { tethLashStart(e); break; }
        // shuffle closer, never more than 3 m from the anchor
        let tx = p.x, tz = p.z;
        const ax = D.anchor.x, az = D.anchor.z, ad = Math.hypot(tx - ax, tz - az);
        if (ad > TETH.leash) { tx = ax + (tx - ax) / ad * TETH.leash; tz = az + (tz - az) / ad * TETH.leash; }
        const m = e.flinchT > 0 ? { moved: 0 } : moveToward(e, tx, tz, TETH.speed, dt, { stopAt: d < 1.3 ? 99 : 0.2, turn: 1.8 });
        clampLeash(e);
        e.yaw = turnToward(e.yaw, yawTo(e.pos, p), 1.6, dt);
        a.setAnim(m.moved > 1e-4 ? 'walk' : 'idle_hunched', { blend: 0.35 });
        break;
      }
      case 'lash': tethLashUpdate(e, dt); break;
      case 'hold': tethHoldUpdate(e, dt); break;
      default: e.state = 'offer';
    }
  }
  function clampLeash(e) {
    const D = e.data, ad = flatDist(D.anchor, e.pos);
    if (ad <= TETH.leash || e.state === 'hold') return;
    const k = TETH.leash / ad;
    const tx = D.anchor.x + (e.pos.x - D.anchor.x) * k, tz = D.anchor.z + (e.pos.z - D.anchor.z) * k;
    const r = World.move(e.pos, tx - e.pos.x, tz - e.pos.z, e.radius, { ignore: isEnemyCol });
    e.pos.set(r.x, r.y, r.z);
  }
  function tethLashStart(e) {
    const D = e.data;
    e.state = 'lash'; e.stateT = 0;
    D.windup = { t: 0 }; D.cancelled = false; D.lashHit = false;
    D.lashYaw = yawTo(e.pos, Player.pos);
    e.actor.gesture('swing', { hand: 'L', dur: 0.95 });
    sfx('plastic', { pos: P3(e.pos, 1.2), dur: 0.4, dens: 1.4 });
  }
  function lashFrom(e, out) { e.actor.bones.handL.getWorldPosition(out); return out; }
  function tethLashUpdate(e, dt) {
    const D = e.data, t = e.stateT;
    if (D.cancelled) { tethLashEnd(e); return; }
    e.yaw = turnToward(e.yaw, D.lashYaw, 2.5, dt);
    const L = D.teth.lash, tip = D.lashTip;
    const start = lashFrom(e, _v2);
    if (t < 0.5) { L.visible = false; tip.visible = false; return; }
    if (!D.lashAim) {
      D.lashAim = Player.actor.bones.chest.getWorldPosition(V());
      const dx = D.lashAim.x - e.pos.x, dz = D.lashAim.z - e.pos.z, dd = Math.hypot(dx, dz) || 1, reach = Math.min(TETH.lashRange + 0.2, dd + 0.3);
      D.lashAim.set(e.pos.x + dx / dd * reach, D.lashAim.y, e.pos.z + dz / dd * reach);
      sfx('whip', { pos: P3(e.pos, 1.2) });
    }
    const ext = t < 0.66 ? U.ease.out((t - 0.5) / 0.16) : t < 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) / 0.3);
    const endP = _v3.lerpVectors(start, D.lashAim, ext);
    endP.y += Math.sin(ext * Math.PI) * 0.25;
    L.visible = ext > 0.02; tip.visible = L.visible;
    setSeg(L, start, endP); tip.position.copy(endP);
    if (t >= 0.62 && !D.lashHit && pOK()) {
      D.lashHit = true;
      const p = Player.pos, d = flatDist(e.pos, p), ang = Math.abs(U.angleDiff(D.lashYaw, yawTo(e.pos, p)));
      if (d <= TETH.lashRange + 0.25 && ang < 32 * D2R && !Player.grabbed && Player.mode !== 'ladder' && los(e.pos.x, e.pos.z, p.x, p.z, { minH: 1.0, y: e.pos.y })) { tethGrab(e); return; }
    }
    if (t >= 1.1) tethLashEnd(e);
  }
  function tethLashEnd(e, silent) {
    const D = e.data;
    D.teth.lash.visible = false; D.lashTip.visible = false; D.lashAim = null; D.windup = null;
    if (e.state === 'lash' || e.state === 'hold') { e.state = 'offer'; e.stateT = 0; }
    D.lashCd = TETH.lashCd;
    if (!silent) D.cancelled = false;
  }
  function tethGrab(e) {
    const D = e.data;
    e.state = 'hold'; e.stateT = 0;
    sfx('grab', { pos: P3(Player.pos, 1.2) });
    D.grab = Player.grab({ mash: 1.5, damage: 15, source: e, text: 'Tap {interact} to pull free' });
    D.grab.then((res) => {
      if (e.removed || e.resolved) return;
      if (res === 'escaped') { sfx('whip', { pos: P3(e.pos, 1.1), vol: 0.6 }); e.stunT = Math.max(e.stunT, 1.0); }
      else if (res === 'failed' && pOK()) {
        // pulled in
        const dx = e.pos.x - Player.pos.x, dz = e.pos.z - Player.pos.z, dd = Math.hypot(dx, dz) || 1, pull = Math.max(0, dd - 0.85);
        if (Player.impulse) Player.impulse(dx / dd * pull, dz / dd * pull, 0.35);
        sfx('plastic', { pos: P3(e.pos, 1.2), dur: 0.6, dens: 1.5 });
      }
      tethLashEnd(e, true);
    });
  }
  function tethHoldUpdate(e, dt) {
    const D = e.data, L = D.teth.lash, tip = D.lashTip;
    if (!pOK() || !Player.grabbed) { if (e.stateT > 0.2) tethLashEnd(e, true); return; }
    const start = lashFrom(e, _v2), endP = Player.actor.bones.chest.getWorldPosition(_v3);
    L.visible = true; tip.visible = true;
    setSeg(L, start, endP); tip.position.copy(endP);
    e.yaw = turnToward(e.yaw, yawTo(e.pos, Player.pos), 3, dt);
    // it leans back and hauls on the tether
    if (e.actor.anim !== 'struggle') e.actor.setAnim('struggle', { blend: 0.2 });
    if (e.stateT < 1.2) { const back = yawTo(Player.pos, e.pos); const r = World.move(e.pos, Math.sin(back) * 0.12 * dt, Math.cos(back) * 0.12 * dt, e.radius, { ignore: isEnemyCol }); e.pos.set(r.x, r.y, r.z); }
  }
  function tethFreedUpdate(e, dt) {
    const a = e.actor, D = e.data;
    if (D.freeSeq) {
      const s = D.freeSeq; s.t += dt;
      const sh = D.shell;
      if (s.t < 1.4 && sh && D.shellFrom) {
        // the packaging loosens: lifts off the face, then drops beside it
        const k = s.t / 1.4;
        if (k < 0.45) { const kk = U.ease.out(k / 0.45); sh.position.copy(D.shellFrom.pos).addScaledVector(D.shellFrom.fwd, 0.06 * kk); sh.position.y -= 0.03 * kk; sh.quaternion.copy(D.shellFrom.quat); }
        else placeLooseShell(e, (k - 0.45) / 0.55);
      } else if (!s.placed) { s.placed = true; placeLooseShell(e, 1); }
      if (s.seat && s.t > 2.6) {
        const seat = s.seat;
        if (!s.walking) { s.walking = true; a.setAnim('idle_hunched', { blend: 0.8 }); a.gesture('stand_up', { to: 'idle_hunched' }); s.walkT = 0; }
        s.walkT += dt;
        if (s.walkT > 1.2 && !s.seated) {
          // the last metre ignores low colliders (a bench, the shelter's seat) — it sits ON them; stuck for 3 s (or
          // held short by anything else) it shuffles the rest of the way
          const sd = Math.hypot(seat.pos[0] - e.pos.x, seat.pos[1] - e.pos.z);
          const low = (c) => sd < 1.2 && (c.y || 0) + c.h < e.pos.y + 1.0;
          const m = moveToward(e, seat.pos[0], seat.pos[1], 0.45, dt, { stopAt: 0.12, turn: 2, ignore: low });
          s.stuckT = m.moved < 0.45 * dt * 0.35 && !m.arrived ? (s.stuckT || 0) + dt : 0;
          if (!m.arrived && (s.stuckT > 3 || (sd < 0.6 && s.stuckT > 0.8))) {
            const k = Math.min(1, dt * 1.5 / Math.max(0.05, sd));
            e.pos.x += (seat.pos[0] - e.pos.x) * k; e.pos.z += (seat.pos[1] - e.pos.z) * k;
            if (sd < 0.14) m.arrived = true;
          }
          a.setAnim(m.arrived ? 'idle_hunched' : 'walk', { blend: 0.4 });
          if (m.arrived) {
            s.seated = true; s.sitT = 0;
            e.yaw = (seat.rot ?? e.def.rot ?? 0) * D2R;
            a.seatHeight = seat.h || 0.46;
            a.gesture('sit_down', { to: 'sit' });
            placeLooseShell(e, 1);
          }
        }
      }
      if (s.t > (s.seat ? 12 : 3.2) || s.seated) { if (!s.seat || s.seated) D.freeSeq = null; }
    }
    // quietly watching Aidan pass
    if (pOK() && flatDist(e.pos, Player.pos) < 10) a.lookAt(Player.actor); else a.lookAt(null);
  }
  function tetheredFreed(e) {
    const a = e.actor, D = e.data;
    stopLoops(e);
    tethLashEnd(e, true);
    if (Player.grabbed && e.state === 'hold' && Player.release) Player.release();
    sfx('release', { pos: P3(e.pos, 1.0), dur: 3.2 });
    // capture the shell's current world transform before it leaves the head
    const sh = D.shell;
    if (sh) {
      sh.updateWorldMatrix(true, false);
      const pos = sh.getWorldPosition(V()), quat = sh.getWorldQuaternion(new THREE.Quaternion());
      const fwd = V(0, 0, 1).applyQuaternion(quat);
      D.shellFrom = { pos, quat, fwd };
    }
    const seat = e.def.seat && e.def.seat.pos ? e.def.seat : null;
    tethFreedPose(e, false);
    if (sh) { sh.position.copy(D.shellFrom.pos); sh.quaternion.copy(D.shellFrom.quat); sh.scale.setScalar(a.D.head * a.H); }
    a.finishGestures();
    a.setAnim('sit_floor', { blend: 1.3 });
    D.freeSeq = { t: 0, seat };
  }
  function tetheredDie(e) {
    const a = e.actor, D = e.data;
    stopLoops(e);
    tethLashEnd(e, true);
    ledsOn(e, false);
    a.finishGestures(); a.lookAt(null);
    a.setAnim('lie_side', { blend: 0.6 });
    sfx('plastic', { pos: P3(e.pos, 0.3), dur: 0.5, dens: 1.6 });
    sfx('cardboard', { pos: P3(e.pos, 0.3), vol: 0.7 });
    // a few boxes break loose from its back and tumble to the floor
    const boxes = D.boxes ? D.boxes.boxes : [];
    D.spill = [];
    for (let i = 0; i < Math.min(3, boxes.length); i++) {
      const b = boxes[boxes.length - 1 - i];
      b.updateWorldMatrix(true, false);
      const wp = b.getWorldPosition(V()), wq = b.getWorldQuaternion(new THREE.Quaternion()), ws = b.getWorldScale(V());
      b.parent.remove(b);
      b.position.copy(wp); b.quaternion.copy(wq); b.scale.copy(ws);
      e.fx.add(b);
      const ang = rnd(0, TAU);
      D.spill.push({ b, v: V(Math.sin(ang) * rnd(0.5, 1.1), rnd(0.6, 1.4), Math.cos(ang) * rnd(0.5, 1.1)), w: V(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), rest: false });
    }
  }
  function tethPost(e, dt) {
    shellLight(e.data.shell, dt);
    // tethers follow the bones; the floor tether lies from the belt down to the floor and along to the anchor
    const a = e.actor, D = e.data, T = D.teth;
    if (!T || !a) return;
    const chest = a.anchors.chest.getWorldPosition(_v4);
    chest.y -= 0.03;
    const freed = e.resolved === 'freed';
    for (const s of ['L', 'R']) {
      const w = a.bones['hand' + s].getWorldPosition(_v2);
      const m = s === 'L' ? T.wl : T.wr;
      if (freed) { _v3.copy(w); _v3.y = floorY(w.x, w.z, e.pos.y) + 0.02; _v3.x += (s === 'L' ? 0.1 : -0.1) * Math.cos(e.yaw); _v3.z -= (s === 'L' ? 0.1 : -0.1) * Math.sin(e.yaw); setSeg(m, w, _v3); }
      else setSeg(m, w, chest);
    }
    if (D.needShell) { D.needShell = false; placeLooseShell(e, 1); }
    const belt = a.anchors.belt.getWorldPosition(_v2);
    const fy = floorY(e.pos.x, e.pos.z, e.pos.y) + 0.015;
    const fwd = _v5.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    _v3.set(e.pos.x + fwd.x * 0.22, fy, e.pos.z + fwd.z * 0.22);
    setSeg(T.down, belt, _v3);
    const ap = D.anchorTop || (D.anchorTop = V());
    ap.copy(D.anchor); ap.y = floorY(D.anchor.x, D.anchor.z, fy) + 0.03;
    const fl = _v3.distanceTo(ap);
    T.floor.visible = fl > 0.12;
    if (T.floor.visible) setSeg(T.floor, _v3, ap);
    if (D.spill) {
      for (const s of D.spill) {
        if (s.rest) continue;
        s.v.y -= 9.8 * dt;
        s.b.position.addScaledVector(s.v, dt);
        s.b.rotation.x += s.w.x * dt; s.b.rotation.y += s.w.y * dt; s.b.rotation.z += s.w.z * dt;
        const gy = floorY(s.b.position.x, s.b.position.z, e.pos.y) + s.b.scale.y * 0.3;
        if (s.b.position.y <= gy) { s.b.position.y = gy; if (Math.abs(s.v.y) < 1.2) { s.rest = true; s.b.rotation.x = Math.round(s.b.rotation.x / HALF) * HALF; s.b.rotation.z = Math.round(s.b.rotation.z / HALF) * HALF; s.b.position.y = floorY(s.b.position.x, s.b.position.z, e.pos.y) + s.b.scale.y / 2 * 0.9; } else { s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); } }
      }
    }
  }
  defineType('tethered', {
    hp: 30, radius: 0.3, height: 1.35, tell: 'eftpos', downs: true, rebuildDead: true, idleAnim: 'idle_hunched',
    create: tetheredCreate, update: tetheredUpdate, post: tethPost,
    alert(e, o) { if (!e.resolved && (e.state === 'idle' || e.state === 'sit')) tethStartTurn(e, o); },
    onHit(e) { if (e.data.watching) return false; if (!e.aware && !e.downed && (e.state === 'idle' || e.state === 'sit')) tethStartTurn(e); sfx('plastic', { pos: P3(e.pos, 1.1), dur: 0.35, dens: 1.2 }); return true; },
    onReact(e) { if (e.state === 'lash' || e.state === 'hold') tethLashEnd(e, true); },
    onDown(e) { tethLashEnd(e, true); e.actor.armPose('R', 'hold'); e.actor.lookAt(null); later(e, 0.85, () => { if (e.downed && !e.resolved) e.actor.setAnim('lie_side', { blend: 0.5 }); }); },
    onUp(e) { e.state = 'offer'; e.aware = true; e.actor.setAnim('idle_hunched', { blend: 0.8 }); },
    knockdown(e) { tethLashEnd(e, true); later(e, 0.85, () => { if (e.knocked && !e.resolved) e.actor.setAnim('lie_side', { blend: 0.5 }); }); return true; },
    onFreed: tetheredFreed, onDie: tetheredDie,
    threat: (e) => !e.resolved,
  });

  // per-enemy timers (game time)
  function later(e, sec, fn) { (e.data.timers || (e.data.timers = [])).push({ t: sec, fn }); }
  function stepTimers(e, dt) {
    const T = e.data.timers; if (!T || !T.length) return;
    for (const t of T.slice()) { t.t -= dt; if (t.t <= 0) { T.splice(T.indexOf(t), 1); try { t.fn(); } catch (err) { console.error('[Enemies] timer', err); } } }
  }

  // =================================================================================================================
  // THE REACH (fear of angry and violent customers)
  // =================================================================================================================
  const REACH = { sight: 12, build: 20, hit: 25, decay: 30, lungeSpeed: 5, lungeDur: 1.5, dmg: 20, armReach: 1.7, over: 1.3, walk: 0.85 };
  const REACH_LINES = ['I want your name.', 'Do you know how long I\'ve been waiting?', 'Get me someone who knows what they\'re doing.'];
  const reachLines = () => (Array.isArray(DIALOGUE.reach) && DIALOGUE.reach.length ? DIALOGUE.reach.map((l) => (typeof l === 'string' ? l : l && l.text)).filter(Boolean) : REACH_LINES);
  let reachSaid = new Set(), reachSubT = -99;
  function veinGeo(len, r0, r1, seed, turns = 0.35) {
    return shared(`vein${len.toFixed(3)}|${r0.toFixed(4)}|${seed}`, () => {
      const r = U.rng(seed), pts = [], n = 10;
      const a0 = r() * TAU;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = a0 + Math.sin(t * 5 + seed) * 0.35 + t * turns * TAU, rad = lerp(r0, r1, t) + 0.0012;
        pts.push(V(Math.cos(a) * rad, -t * len, Math.sin(a) * rad));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0036, 4, false);
      g.userData.shared = true;
      return g;
    });
  }
  function reachCreate(e, def) {
    const seed = U.hash(e.id), r = U.rng(seed);
    const tops = [{ kind: 'tee', color: '#5b5a55', sleeves: 'short' }, { kind: 'polo', color: '#3e4a5a', sleeves: 'short' }, { kind: 'tee', color: '#6a5a48', sleeves: 'short' }, { kind: 'tee', color: '#44504a', sleeves: 'short' }];
    const a = Rig.human({
      height: 1.9, build: 'heavy', gender: 'm', age: 38 + Math.floor(r() * 20), seed: (seed % 997) + 3,
      detail: def.detail || (def.rig && def.rig.detail) || undefined,
      skin: ['#c48a6a', '#b98266', '#d09a7c', '#a87458'][Math.floor(r() * 4)],
      hair: { style: r() < 0.5 ? 'receding' : 'buzz', color: ['#3a332d', '#2a241f', '#5a4a3a'][Math.floor(r() * 3)] },
      face: { stubble: 0.8, bags: 0.9, wrinkles: 0.6, redRim: 0.9, brows: '#2a221c', browThick: 1.4 },
      top: tops[Math.floor(r() * tops.length)], pants: { kind: 'jeans', color: ['#3a4556', '#2e3747', '#4a4640'][Math.floor(r() * 3)] },
      shoes: { kind: r() < 0.5 ? 'sneaker' : 'boot', color: '#4a4540', sole: '#1c1a18' },
      armScale: 2, armJoints: 3, jaw: { drop: 0.3 }, headScale: 1.08,
      style: { heavy: 1, armSwing: 0.35, tension: 1, stepLen: 1.05 }, idleLife: false, walkSpeed: REACH.walk, sound: false,
    });
    a.idleLife = false;
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.42; e.height = 1.9; e.hp = e.maxHp = def.hp ?? 60;
    a.eyes('closed'); a.expr('angry');
    a.hold('R', 'phone', { pose: 'phone_up', screen: false });
    // the head is almost all mouth: a lower jaw as wide as the head hangs to the chest, lined with speaker grille
    reachJaw(e, a);
    // veins like cables along both arms and the neck
    const vm = a._mat('veins', () => new THREE.MeshStandardMaterial({ color: '#4d3f5e', roughness: 0.38, metalness: 0.1 }));
    const Dm = a.D, g = Dm.limb, H = a.H;
    for (const s of ['L', 'R']) {
      const ua = a.bones['upperArm' + s], f1 = a.bones['foreArm' + s], f2 = a.bones['foreArm2' + s];
      for (let k = 0; k < 2; k++) {
        const add = (bone, len, r0, r1, sd) => { const m = new THREE.Mesh(veinGeo(len, r0, r1, sd), vm); m.scale.setScalar(H); m.castShadow = false; bone.add(m); };
        add(ua, Dm.ua * 0.92, 0.03 * g, 0.026 * g, 11 + k * 7 + (s === 'L' ? 0 : 3));
        if (f2) { add(f1, Dm.fa / 2 * 0.95, 0.026 * g, 0.023 * g, 23 + k * 5 + (s === 'L' ? 0 : 2)); add(f2, Dm.fa / 2 * 0.9, 0.024 * g, 0.018 * g, 31 + k * 3 + (s === 'L' ? 0 : 4)); }
        else add(f1, Dm.fa * 0.9, 0.026 * g, 0.019 * g, 23 + k * 5);
      }
    }
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(veinGeo(Dm.neckLen * 1.1, 0.034, 0.03, 41 + k, 0.1), vm); m.scale.setScalar(H); m.position.y = Dm.neckLen * H; m.rotation.x = Math.PI; m.castShadow = false; a.bones.neck.add(m); }
    e.data.rage = 0; e.data.tint = -1;
    e.state = 'still';
    a.setAnim('idle', { blend: 0 });
    loop(e, 'reach_breath', true, { pos: [0, 0, 0], vol: 0.5, intensity: 0.2 });
    Nav.get();
  }
  // a hanging trough (head units, inside headSpace): skin outside, speaker grille inside, lips along the rim
  function reachJawGeos() {
    return shared('reachJaw', () => {
      const L = 1.45, R = 0.35, T0 = Math.PI * 0.5, TL = Math.PI;
      const outer = new THREE.CylinderGeometry(R, R * 0.86, L, 18, 6, true, T0, TL).translate(0, -L / 2, 0);
      const inner = new THREE.CylinderGeometry(R * 0.9, R * 0.76, L, 18, 6, true, T0, TL).translate(0, -L / 2, 0);
      const iu = inner.attributes.uv; for (let i = 0; i < iu.count; i++) iu.setXY(i, iu.getX(i) * 3.2, iu.getY(i) * 4.6);
      const chin = new THREE.SphereGeometry(1, 16, 8, Math.PI, Math.PI, Math.PI / 2, Math.PI / 2).scale(R * 0.86, 0.22, R * 0.86).translate(0, -L, 0);
      const chinIn = new THREE.SphereGeometry(1, 16, 8, Math.PI, Math.PI, Math.PI / 2, Math.PI / 2).scale(R * 0.76, 0.18, R * 0.76).translate(0, -L, 0);
      const lipG = [];
      for (const sx of [-1, 1]) lipG.push({ geo: new THREE.CylinderGeometry(0.035, 0.03, L * 0.98, 6).translate(0, -L / 2, 0), m: MX(sx * R * 0.93 - sx * 0.01, 0, 0.02, 0, 0, sx * 0.04) });
      lipG.push({ geo: new THREE.TorusGeometry(1, 0.1, 5, 14, Math.PI).rotateZ(Math.PI), m: MX(0, -L, 0.02, 0, 0, 0, R * 0.86, 0.3, 0.35) });
      const lips = Kit.mergeGeometries(lipG);
      for (const g of [outer, inner, chin, chinIn, lips]) g.userData.shared = true;
      return { outer, inner, chin, chinIn, lips, L };
    });
  }
  function reachJaw(e, a) {
    for (const n of ['jaw', 'mouth']) if (a.parts[n]) for (const m of [].concat(a.parts[n])) m.visible = false;
    const G = reachJawGeos();
    const skin = a.skinMat();
    const gm = a._mat('grille', () => new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.45, metalness: 0.25, color: '#c4c6cc', side: THREE.BackSide }));
    const dark = a._mat('throat', () => new THREE.MeshStandardMaterial({ color: '#2a0e0c', roughness: 0.9, side: THREE.DoubleSide }));
    const lipM = a._mat('lipm', () => new THREE.MeshStandardMaterial({ color: '#7a3a34', roughness: 0.6 }));
    lipM.userData.skin = true;
    const j = new THREE.Group(); j.name = 'reachJaw';
    j.position.set(0, 0.25, 0.5);                       // hangs forward over the chest (torso front ≈ 0.6 head units out)
    j.rotation.x = -0.45;
    const add = (g, m) => { const me = new THREE.Mesh(g, m); me.castShadow = true; j.add(me); return me; };
    add(G.outer, skin); add(G.chin, skin); add(G.inner, gm);
    const ci = add(G.chinIn, dark); ci.material = dark;
    add(G.lips, lipM);
    // a grille panel for the palate
    const pal = new THREE.Mesh(shared('palateG', () => { const g = new THREE.PlaneGeometry(0.5, 0.2).rotateX(-HALF * 0.6); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.2); g.userData.shared = true; return g; }), a._mat('grilleF', () => new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.45, metalness: 0.25, color: '#c4c6cc', side: THREE.DoubleSide })));
    pal.position.set(0, 0.0, 0.14); j.add(pal);
    a.headSpace.add(j);
    e.data.jaw = j;
  }
  function reachTint(e) {
    const k = e.data.rage / 100, t = Math.round(k * 40) / 40;
    if (t === e.data.tint) return;
    e.data.tint = t;
    e.actor.setTint('#d8240e', 0.03 + 0.5 * t * t + 0.12 * t, { skin: true });
  }
  function reachShout(e, force) {
    const lines = reachLines(), i = Math.floor(Math.random() * lines.length);
    murmur('reach', { pos: P3(e.pos, 1.7), line: i, vol: 0.9 + e.data.rage / 200 });
    const text = lines[i];
    if (force || (!reachSaid.has(text) && clock - reachSubT > 20) || clock - reachSubT > 60) { reachSaid.add(text); reachSubT = clock; Voice.say(text, 'distort'); }
    e.data.shoutJaw = 1.6;
  }
  function reachUpdate(e, dt, ai) {
    const a = e.actor, D = e.data;
    if (e.resolved) return;
    // jaw works while it shouts
    if (D.jaw) {
      let k;
      if (D.shoutJaw > 0) { D.shoutJaw -= dt; k = 1.04 + 0.16 * Math.abs(Math.sin(clock * 11)) + D.rage / 600; } else k = 1 + D.rage / 500 + Math.sin(clock * 1.3) * 0.02;
      D.jaw.scale.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.3);
      D.jaw.rotation.x = -0.45 + (k - 1) * 0.5;
    }
    const p = pOK() ? Player.pos : null;
    const seen = ai && p && !e.downed && !e.knocked && sees(e, REACH.sight, null, 1.5);
    if (seen) { D.lastSeen = p.clone(); D.seenT = clock; }
    // rage
    if (!e.downed && !e.knocked) {
      if (seen) D.rage = Math.min(100, D.rage + REACH.build * DIFF.rage() * dt);
      else if (e.state !== 'lunge' && e.state !== 'windup') D.rage = Math.max(0, D.rage - REACH.decay * dt);
    }
    reachTint(e);
    loop(e, 'reach_breath', true, { pos: P3(e.pos, 1.7), intensity: 0.2 + D.rage / 125, vol: 0.45 + D.rage / 300 });
    if (e.downed || e.knocked) return;
    if (e.stunT > 0) { if (a.anim !== 'stagger') a.setAnim('stagger', { blend: 0.2 }); if (e.state === 'lunge' || e.state === 'windup') e.state = 'rage'; return; }
    if (!ai) { if (e.state === 'lunge' || e.state === 'windup') e.state = 'rage'; if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 }); return; }
    const d = p ? flatDist(e.pos, p) : 99;
    switch (e.state) {
      case 'still':
        if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 });
        if (seen) { e.state = 'rage'; e.stateT = 0; sfx('thud', { pos: P3(e.pos, 0.2), vol: 0.6 }); reachShout(e); }
        break;
      case 'rage': {
        if (D.rage >= 100 && seen && e.flinchT <= 0) { reachWindup(e); break; }
        if (D.rage <= 0 && !seen && clock - (D.seenT || 0) > 4) { e.state = 'still'; a.lookAt(null); break; }
        D.shoutT = (D.shoutT ?? 3) - dt;
        if (D.shoutT <= 0 && D.rage > 30) { D.shoutT = rnd(6, 10); reachShout(e); }
        const tgt = seen ? p : D.lastSeen;
        if (tgt) {
          a.lookAt(seen ? Player.actor : null);
          const m = e.flinchT > 0 ? { moved: 0, blocked: false } : moveToward(e, tgt.x, tgt.z, REACH.walk, dt, { nav: true, stopAt: seen ? 1.6 : 0.4, turn: 2 });
          if (seen) e.yaw = turnToward(e.yaw, yawTo(e.pos, p), 2.2, dt);
          a.setAnim(m.moved > 1e-4 ? 'walk' : 'idle', { blend: 0.35 });
        } else if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 });
        // fists on the glass when a closed door is all that stands between them
        if (p && !seen && d < 4.5) reachKnock(e, dt, d);
        break;
      }
      case 'windup':
        if (e.data.cancelled) { e.data.cancelled = false; e.state = 'rage'; break; }
        e.yaw = turnToward(e.yaw, p ? yawTo(e.pos, p) : e.yaw, 4, dt);
        if (e.stateT >= 0.4) reachLunge(e);
        break;
      case 'lunge': reachLungeUpdate(e, dt); break;
      case 'recover':
        if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 });
        if (e.stateT > 1.4) { e.state = 'rage'; e.stateT = 0; }
        break;
      default: e.state = 'rage';
    }
  }
  function reachKnock(e, dt, d) {
    const D = e.data;
    D.knockT = (D.knockT ?? 0.5) - dt;
    if (D.knockT > 0) return;
    D.knockT = rnd(1.4, 2.6);
    // only when a door or glass stands between them
    const p = Player.pos;
    const hit = hasWorld() && World.raycast ? World.raycast(e.pos.x, e.pos.z, p.x - e.pos.x, p.z - e.pos.z, d, { minH: 1.5, ignore: isEnemyCol }) : null;
    if (!hit || !hit.collider || hit.dist > 1.8) return;
    sfx('glass_knock', { pos: [hit.x, e.pos.y + 1.4, hit.z], n: 3 + Math.floor(Math.random() * 3), hard: D.rage > 60 });
    e.actor.gesture('swing', { hand: 'L', dur: 0.7 });
    if (D.rage > 40 && Math.random() < 0.5) reachShout(e);
  }
  function reachWindup(e) {
    e.state = 'windup'; e.stateT = 0; e.data.cancelled = false; e.data.windup = { t: 0 };
    e.actor.gesture('hands_up', { dur: 0.6 });
    reachShout(e, false);
    sfx('whoosh', { pos: P3(e.pos, 1.5), vol: 0.6 });
  }
  function reachLunge(e) {
    const D = e.data;
    e.state = 'lunge'; e.stateT = 0; D.windup = null; D.hitDone = false;
    D.lungeYaw = pOK() ? yawTo(e.pos, Player.pos) : e.yaw;
    e.actor.gesture('reach', { hand: 'L', target: Player.actor, dur: 1.5 });
    e.actor.setAnim('run', { blend: 0.15 });
    sfx('swing', { pos: P3(e.pos, 1.5), heavy: true });
  }
  function reachLungeUpdate(e, dt) {
    const D = e.data;
    const p = pOK() ? Player.pos : null;
    if (p) D.lungeYaw = turnToward(D.lungeYaw, yawTo(e.pos, p), 1.1, dt);
    e.yaw = turnToward(e.yaw, D.lungeYaw, 6, dt);
    const sp = REACH.lungeSpeed * dt;
    const r = World.move(e.pos, Math.sin(D.lungeYaw) * sp, Math.cos(D.lungeYaw) * sp, e.radius, { ignore: isEnemyCol });
    const moved = Math.hypot(r.x - e.pos.x, r.z - e.pos.z);
    e.pos.set(r.x, r.y, r.z);
    if (p && !D.hitDone) {
      const d = flatDist(e.pos, p), ang = Math.abs(U.angleDiff(e.yaw, yawTo(e.pos, p)));
      // the arms reach over anything lower than 1.3 m (counters, desks, cubicle walls)
      if (d <= e.radius + REACH.armReach && ang < 55 * D2R && Math.abs(p.y - e.pos.y) < 1.5 && los(e.pos.x, e.pos.z, p.x, p.z, { minH: REACH.over, y: e.pos.y })) {
        D.hitDone = true;
        Player.damage(REACH.dmg, e, { push: 1.1, from: e.pos, force: true });
        sfx('hit_heavy', { pos: P3(p, 1.2) });
        e.actor.gesture('swing', { hand: 'L', dur: 0.6 });
      }
    }
    if (moved < sp * 0.2 && e.stateT > 0.15) {           // slammed into something
      sfx('thud', { pos: P3(e.pos, 1.0) });
      const hit = hasWorld() ? World.raycast(e.pos.x, e.pos.z, Math.sin(D.lungeYaw), Math.cos(D.lungeYaw), 1.2, { minH: 1.5, ignore: isEnemyCol }) : null;
      if (hit) sfx('glass_knock', { pos: [hit.x, e.pos.y + 1.4, hit.z], n: 2, hard: true });
      reachEndLunge(e);
      return;
    }
    if (e.stateT >= REACH.lungeDur) reachEndLunge(e);
  }
  function reachEndLunge(e) {
    e.state = 'recover'; e.stateT = 0;
    e.data.rage = 35;
    e.actor.setAnim('idle', { blend: 0.4 });
    e.actor.finishGestures();
  }
  defineType('reach', {
    hp: 60, radius: 0.42, height: 1.9, tell: 'pulse', downs: true, idleAnim: 'idle',
    create: reachCreate, update: reachUpdate,
    onHit(e) { e.data.rage = Math.min(100, e.data.rage + REACH.hit * DIFF.rage()); e.data.seenT = clock; if (e.state === 'still') e.state = 'rage'; if (pOK()) e.data.lastSeen = Player.pos.clone(); return true; },
    onReact(e) { e.flinchT = 0.25; },
    onDown(e) { e.state = 'down'; later(e, 0.85, () => { if (e.downed && !e.resolved) e.actor.setAnim('lie', { blend: 0.5 }); }); },
    onUp(e) { e.state = 'rage'; e.data.rage = 60; e.actor.setAnim('idle', { blend: 0.8 }); },
    knockdown(e) { if (e.state === 'lunge' || e.state === 'windup') e.state = 'rage'; later(e, 0.85, () => { if (e.knocked && !e.resolved) e.actor.setAnim('lie', { blend: 0.5 }); }); return true; },
    onDie(e, o) { e.actor.setTint('#7a2a20', 0.1, { skin: true }); defaultDeath(e, o); },
    threat: (e) => !e.resolved,
  });

  // =================================================================================================================
  // THE STANDARD (fear of disappointing your leaders)
  // =================================================================================================================
  const STD = { speed: 1.1, cone: 60, gaze: 20, contactR: 1.05, vanish: 45 };
  const standardName = () => (S.flags && S.flags.standardName) || (S.chapter >= 7 ? 'AIDAN' : 'LUKA');
  const FORM_ROWS = ['Offer the bundle', 'Accessory attach', 'NPS', 'Conversion', 'Handle time', 'Callbacks closed', 'Follow-ups', 'Upsell'];
  function drawForm(ctx, W, H, name, st) {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = BRAND.teal; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#fff'; ctx.font = `bold 15px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('COACHING CONVERSATION', 12, 23);
    ctx.fillStyle = '#2a2a2a'; ctx.font = `11px ${SANS}`;
    ctx.fillText('Rep:', 12, 56); ctx.fillText('Leader:', 140, 56);
    ctx.font = `bold 20px ${HAND}`; ctx.fillStyle = '#1a2a6a'; ctx.fillText('AIDAN', 40, 58);
    ctx.font = `bold 13px ${HAND}`; ctx.fillText(name, 186, 57);
    ctx.strokeStyle = '#9a9a92'; ctx.lineWidth = 1;
    for (let i = 0; i < FORM_ROWS.length; i++) {
      const y = 82 + i * 26;
      ctx.beginPath(); ctx.moveTo(10, y + 8); ctx.lineTo(W - 10, y + 8); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.font = `11px ${SANS}`; ctx.fillText(FORM_ROWS[i], 12, y + 3);
      const v = st.scores[i];
      ctx.font = `bold 16px ${HAND}`; ctx.fillStyle = v < 4 ? '#b3261e' : '#1a2a6a'; ctx.textAlign = 'right'; ctx.fillText(v + ' / 10', W - 14, y + 4); ctx.textAlign = 'left';
      if (st.struck[i]) { ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - 64, y - 2); ctx.lineTo(W - 12, y - 1); ctx.stroke(); ctx.strokeStyle = '#9a9a92'; ctx.lineWidth = 1; }
    }
    ctx.fillStyle = '#333'; ctx.font = `11px ${SANS}`; ctx.fillText('Development area:', 12, H - 58);
    ctx.fillStyle = '#b3261e'; ctx.font = `bold 17px ${HAND}`; ctx.fillText(st.note, 16, H - 34);
    ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(W - 40, 70 + st.circle * 26 + 12, 34, 12, -0.1, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(80,60,30,0.08)'; ctx.fillRect(0, 0, W, H);
  }
  // the clipboard is fixed flat over the bent face (faceMount: +Z out of the face = down, +Y to the crown =
  // forward), tilted so the form faces down-and-forward; the right hand reaches up under its edge
  const CLIP_FACE = { w: [0.44, 0.55, 0.82], pole: [1, -0.5, 0.6], fing: [-1, 0.25, 0], palm: [0, 0, -1], curl: 0.55, thumb: 0.6, space: 'head' };
  function mountClipboard(e) {
    const a = e.actor, obj = a.held.R;
    if (!obj) return;
    const u = a.D.head * a.H;
    obj.parent && obj.parent.remove(obj);
    a.faceMount.add(obj);
    obj.position.set(0, 0.18, 0.42);
    obj.quaternion.setFromEuler(_e1.set(-0.55, 0, 0));
    obj.scale.setScalar(1.35 / u);
    e.data.clip = obj;
  }
  const NOTES = ['SEE ME', 'Not good enough', '3 DAYS??', 'Follow up TOMORROW', 'Why?', 'Disappointed.', 'We need a chat.'];
  function standardCreate(e, def) {
    const name = def.name || standardName();
    const a = Rig.human({
      height: 3.0, build: 'thin', gender: 'm', age: 34, seed: 31, skin: '#d9c9bb',
      hair: { style: 'neat', color: '#1d1a17' }, headTilt: 90, neckLen: 1.25, armScale: 1.25,
      top: { kind: 'polo', color: '#16a19c', logo: true, fresh: true }, pants: { kind: 'work', color: '#121214' }, shoes: { kind: 'dress', color: '#0c0c0d', sole: '#050505' },
      lanyard: { color: '#0f7a77', card: name, role: 'STORE LEADER' }, faceMode: 'custom',
      style: { upright: 1, armSwing: 0.15, stepLen: 1.15, narrow: 0.8 }, idleLife: false, walkSpeed: STD.speed, sound: true,
    });
    a.idleLife = false;
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.35; e.height = 2.9; e.hp = e.maxHp = Infinity; e.invincible = true;
    e.data.name = name;
    // the coaching form: a live canvas on the clipboard held flat over the face
    const W = 256, Hh = 352, c = mkCanvas(W, Hh), ctx = c.getContext('2d');
    const form = { c, ctx, tex: canvasTex(c, { own: true, noMips: true }), st: { scores: FORM_ROWS.map(() => 3 + Math.floor(Math.random() * 6)), struck: FORM_ROWS.map(() => false), note: NOTES[0], circle: 0 }, t: 0 };
    drawForm(ctx, W, Hh, name, form.st); form.tex.needsUpdate = true;
    a.hold('R', 'clipboard', { pose: CLIP_FACE, tex: form.tex });
    a.root.scale.set(0.8, 1, 0.8);                                   // rail thin
    e.data.form = form;
    mountClipboard(e);
    // the mirror face: a polished oval that reflects Aidan (render target, only rendered when seen close)
    const mir = { rt: Render.renderTarget(128, 160), cam: new THREE.PerspectiveCamera(32, 128 / 160, 0.05, 18), t: 0, drawn: false };
    mir.rt.texture.wrapS = THREE.RepeatWrapping; mir.rt.texture.repeat.x = -1; mir.rt.texture.offset.x = 1;
    const mm = a._mat('mirror', () => new THREE.MeshBasicMaterial({ map: mir.rt.texture, color: '#d4dcdc' }));
    const oval = shared('mirrorGeo', () => { const s = new THREE.Shape(); s.absellipse(0, 0, 0.3, 0.4, 0, TAU); const g = new THREE.ShapeGeometry(s, 24); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 0.6, 0.5 + p.getY(i) / 0.8); g.userData.shared = true; return g; });
    const face = new THREE.Mesh(oval, mm);
    face.position.set(0, 0.05, 0.035); face.castShadow = false;
    a.faceMount.add(face);
    const rim = new THREE.Mesh(shared('mirrorRim', () => { const g = new THREE.TorusGeometry(1, 0.035, 5, 32); g.scale(0.3, 0.4, 0.6); g.userData.shared = true; return g; }), a.plain('#c8ccce', { rough: 0.2, metal: 0.9 }));
    rim.position.copy(face.position); rim.castShadow = false; a.faceMount.add(rim);
    mir.face = face;
    e.data.mirror = mir;
    const fc = a.faceCanvas; if (fc) { fc.ctx.fillStyle = '#d9c9bb'; fc.ctx.fillRect(0, 0, fc.S, fc.S); fc.tex.needsUpdate = true; }
    // a ring of dozens of keys on the lanyard
    const card = a.anchors.card || a.bones.chest;
    const kp = a._dangle ? a._dangle(card, [0.0, -0.105, 0.006], { limit: [-0.9, 0.9, -0.9, 0.9], stiff: 7, damp: 1.8 }) : card;
    const keys = new THREE.Mesh(keyRingGeo(), a._mat('keyring', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45 })));
    keys.scale.setScalar(1.25); keys.castShadow = false;
    kp.add(keys);
    e.data.keys = keys;
    e.state = 'patrol';
    e.data.route = (def.route || []).map((p) => ({ x: p[0], z: p[1], pause: p[2] || 0, face: p[3] }));
    e.data.ri = 0;
    e.data.mode = def.mode || 'patrol';
    a.setAnim('idle', { blend: 0 });
    loop(e, 'standard_keys', true, { pos: [0, 0, 0], vol: 0.7 });
    Nav.get();
  }
  function standardForm(e, dt) {
    const F = e.data.form; F.t -= dt;
    if (F.t > 0) return;
    F.t = rnd(0.35, 0.8);
    const st = F.st, i = Math.floor(Math.random() * st.scores.length);
    st.scores[i] = clamp(st.scores[i] + (Math.random() < 0.75 ? -1 : 1), 0, 10);
    if (Math.random() < 0.2) st.struck[Math.floor(Math.random() * st.struck.length)] = !st.struck[i];
    if (Math.random() < 0.15) st.note = NOTES[Math.floor(Math.random() * NOTES.length)];
    if (Math.random() < 0.3) st.circle = Math.floor(Math.random() * FORM_ROWS.length);
    if (st.scores.every((v) => v <= 1)) st.scores = st.scores.map(() => 2 + Math.floor(Math.random() * 5));
    drawForm(F.ctx, F.c.width, F.c.height, e.data.name, st);
    F.tex.needsUpdate = true;
  }
  const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
  // The mirror face re-renders the scene, so only while it can actually be seen: the clipboard lowered (8-1 "The
  // Mirror") or the head straightening, the face turned toward the camera, within 14 m and in view — at 15 Hz. With
  // the clipboard up it is drawn once (so a lowering never shows an empty texture) and then left alone.
  const _mn = new THREE.Vector3();
  function standardMirror(e, dt) {
    const M = e.data.mirror; if (!M || !Render.renderer || !pOK()) return;
    const cam = Render.camera;
    M.t += dt;
    if (M.t < 1 / 15) return;
    const exposed = !!e.data.clipDown || (e.data.straightK || 0) > 0.02;
    if (!exposed && M.drawn) return;
    const fw = M.face.getWorldPosition(_v2);
    if (cam.position.distanceTo(fw) > 14 && M.drawn) return;
    _mn.set(0, 0, 1).transformDirection(M.face.matrixWorld);
    if (_mn.dot(_v4.copy(cam.position).sub(fw)) < 0 && M.drawn) return;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
    _sph.set(fw, 0.4);
    if (!_frustum.intersectsSphere(_sph) && M.drawn) return;
    M.t = 0;
    const head = Player.actor.bones.head.getWorldPosition(_v3);
    M.cam.position.copy(fw);
    M.cam.up.set(0, 1, 0);
    M.cam.lookAt(head.x, head.y - 0.25, head.z);
    M.cam.updateMatrixWorld();
    Render.renderTo(M.rt, M.cam, Render.scene, { hide: [M.face, e.data.clip, e.data.keys] });
    M.drawn = true;
  }
  function standardGaze(e) {
    if (!pOK() || e.hidden || e.data.vanished) return false;
    const seen = sees(e, STD.gaze, STD.cone, 1.5);
    if (seen) { Player.setGaze(1); e.data.seenT = clock; e.data.lastSeen = Player.pos.clone(); if (ctl) ctl.seenT = clock; }
    return seen;
  }
  function stepStraight(e, dt) {
    const D = e.data, s0 = D.straight;
    if (!s0 || !e.actor || !e.actor.P) { D.straight = null; return; }
    s0.t += dt;
    D.straightK = lerp(s0.from, s0.to, U.ease.inOut(clamp(s0.t / s0.dur)));
    e.actor.P.headTilt = 90 * (1 - D.straightK);
    if (s0.t >= s0.dur) D.straight = null;
  }
  // CONTRACT+ puppet: def.puppet / e.puppet = true — the Standard's body, name card, keys, form and mirror keep working
  //   but it never thinks, walks or touches Aidan: a script drives its position and animations (a stair-bound climber).
  //   e.scripted = true — with its AI off (e.ai = false, or during a blocking scene) it keeps whatever animation the
  //   script set instead of dropping to idle.
  function standardUpdate(e, dt, ai) {
    const a = e.actor, D = e.data;
    loop(e, 'standard_keys', !D.vanished, { pos: P3(e.pos, 1.4), vol: 0.7 });
    // name card follows the story (LUKA → AIDAN)
    D.nameT = (D.nameT || 0) - dt;
    if (D.nameT <= 0) { D.nameT = 1; const n = e.def.name && !ctlOwns(e) ? e.def.name : (ctl && ctl.name) || standardName(); if (n !== D.name) { D.name = n; a.setCard(n, 'STORE LEADER'); } }
    standardForm(e, dt);
    standardMirror(e, dt);
    // (the engine's own contact state lives in data._stdContact: a custom type that reuses this update for the look —
    // form, mirror, name card — may keep its own `data.contact` without the engine running it)
    if (D._stdContact) { standardContactUpdate(e, dt); return; }
    if (D.vanished || e.puppet || e.def.puppet) return;
    if (!ai) { if (!e.scripted && a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 }); return; }
    const seen = standardGaze(e);
    const p = pOK() ? Player.pos : null;
    const d = p ? flatDist(e.pos, p) : 99;
    // contact: "Got a sec?"
    if (p && d <= STD.contactR + e.radius && Math.abs(p.y - e.pos.y) < 1.4 && clock - (D.lastContact || -99) > 5 && Player.mode !== 'ladder') { standardContact(e); return; }
    const chasing = seen || (D.seenT && clock - D.seenT < 8 && D.lastSeen);
    let tx = null, tz = null, pause = 0, faceYaw = null, node = null;
    const huntMode = ctlOwns(e) ? ctl.mode === 'hunt' || ctl.mode === 'follow' : D.mode === 'hunt';
    if (chasing) {
      const t = seen ? p : D.lastSeen;
      tx = t.x; tz = t.z;
      if (!seen && flatDist(e.pos, t) < 0.6) { D.lookT = (D.lookT || 0) + dt; if (D.lookT > 3) { D.seenT = 0; D.lookT = 0; sfx('sigh', { pos: P3(e.pos, 2.6), vol: 0.8 }); } }
    } else if (huntMode && p) { tx = p.x; tz = p.z; }
    else if (ctlOwns(e)) {
      node = ctl.nextNodeInRoom();
      if (e.removed) return;
      if (node) { tx = node.pos[0]; tz = node.pos[1]; pause = node.pause || 0; faceYaw = node.face; }
    } else if (D.route.length) {
      const w = D.route[D.ri % D.route.length]; tx = w.x; tz = w.z; pause = w.pause; faceYaw = w.face;
    }
    if (D.pauseT > 0) {
      D.pauseT -= dt;
      if (D.pauseFace !== null && D.pauseFace !== undefined) e.yaw = turnToward(e.yaw, D.pauseFace * D2R, 1.2, dt);
      if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.6 });
      if (D.pauseT <= 0) { D.pauseFace = null; if (!chasing) advanceWaypoint(e, node); }
      if (!chasing) return;
      D.pauseT = 0;
    }
    if (tx === null) { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.6 }); return; }
    const m = moveToward(e, tx, tz, STD.speed, dt, { nav: true, opener: true, stopAt: chasing ? 0.3 : 0.25, turn: 1.6, carry: !chasing && pause > 0 ? 0 : 0.8 });
    a.setAnim(m.moved > 1e-4 ? 'walk' : 'idle', { blend: 0.4 });
    if (m.arrived && !chasing) {
      if (pause > 0) { D.pauseT = pause; D.pauseFace = faceYaw ?? null; if (Math.random() < 0.5) a.gesture('pen_click', { hand: 'L' }); }
      else advanceWaypoint(e, node);
    }
  }
  function advanceWaypoint(e, node) {
    if (ctlOwns(e)) ctl.arrived(node);
    else if (e.data.route.length) e.data.ri = (e.data.ri + 1) % e.data.route.length;
  }
  function standardContact(e) {
    const D = e.data, a = e.actor;
    D._stdContact = { t: 0, hit: false };
    D.lastContact = clock;
    e.yaw = yawTo(e.pos, Player.pos);
    a.setAnim('idle', { blend: 0.3 });
    a.gesture('hand_on_shoulder', { hand: 'L', target: Player.actor, dur: 3.2 });
    if (hasPlayer()) { Player.lock('standard', true); Player.face && Player.face(U.deg(yawTo(Player.pos, e.pos))); }
    try { if (typeof Snd !== 'undefined' && Snd.duck) Snd.duck(1, 3); } catch (err) { /* audio */ }
    sfx('keys', { pos: P3(e.pos, 1.4), vol: 0.5 });
  }
  function standardContactUpdate(e, dt) {
    const C = e.data._stdContact, a = e.actor;
    C.t += dt;
    if (C.t > 0.8 && !C.said) { C.said = true; Voice.say('Got a sec?', 'quiet', 2.2); }
    if (C.t > 1.3 && !C.hit) { C.hit = true; if (pOK()) Player.damage(40, e, { force: true }); }
    if (C.t > 2.4 && !C.sigh) { C.sigh = true; sfx('sigh', { pos: P3(e.pos, 2.6) }); }
    if (C.t > 3.0 && !C.gone) {
      C.gone = true;
      if (hasPlayer()) Player.lock('standard', false);
      a.finishGestures();
      // vanishes for 45 s; the keys fade into the distance
      const dir = e.yaw + Math.PI;
      for (let i = 0; i < 4; i++) { const dd = 3 + i * 4; later(e, 0.2 + i * 0.9, () => sfx('keys_far', { pos: [e.pos.x + Math.sin(dir) * dd, e.pos.y + 1.4, e.pos.z + Math.cos(dir) * dd], vol: 0.8 - i * 0.18 })); }
      e.data.fadeT = 0;
    }
    if (C.gone) {
      e.data.fadeT += dt;
      a.setOpacity(1 - clamp(e.data.fadeT / 1.2));
      if (e.data.fadeT >= 1.2) { e.data._stdContact = null; standardVanish(e); }
    }
  }
  function standardVanish(e) {
    const D = e.data;
    loop(e, 'standard_keys', false, { fade: 2.5 });
    if (ctlOwns(e)) { ctl.vanish(e); return; }
    D.vanished = true; visible(e, false); e.noBody = true; syncCollider(e);
    later(e, STD.vanish, () => standardReturn(e));
  }
  function standardReturn(e) {
    const D = e.data;
    if (e.removed) return;
    if (pOK() && flatDist(e.home, Player.pos) < 10) { later(e, 3, () => standardReturn(e)); return; }
    e.pos.copy(e.home); e.yaw = e.homeYaw; D.ri = 0; D.seenT = 0; D.nav = null;
    D.vanished = false; e.noBody = false; visible(e, true);
    e.actor.setOpacity(1);
    loop(e, 'standard_keys', true, { pos: P3(e.pos, 1.4), vol: 0.7 });
  }
  defineType('standard', {
    hp: Infinity, radius: 0.35, height: 2.9, tell: 'battery', downs: false, invincible: true, stompable: false,
    create: standardCreate, update: standardUpdate,
    onHit(e) { sfx('thud', { pos: P3(e.pos, 1.4), vol: 0.4 }); if (Math.random() < 0.4) e.actor.gesture('pen_click', { hand: 'L' }); return false; },
    stun() { return false; }, knockdown() { return false; },
    threat: (e) => !e.data.vanished && !e.hidden,
    remove(e) { const M = e.data.mirror; if (M && M.rt) { M.rt.dispose(); M.rt = null; } if (e.data.form) e.data.form.tex.dispose(); if (hasPlayer() && e.data._stdContact) Player.lock('standard', false); if (ctl && ctl.e === e) ctl.e = null; },
  });
  // e.clipboard(false): lowers the clipboard from the face (8-1 "The Mirror"); true raises it again
  function standardClipboard(e, up) {
    const a = e.actor; if (!a || !e.data || !e.data.form) return;
    a.hold('R', 'clipboard', { pose: up ? CLIP_FACE : 'hold', tex: e.data.form.tex });
    if (up) mountClipboard(e); else e.data.clip = a.held.R;
    e.data.clipDown = !up;
    if (e.data.mirror) e.data.mirror.t = 1;
  }

  // ---- the Standard across rooms: waypoint graph, abstract travel, physical entry ------------------------------------
  let ctl = null;
  const ctlOwns = (e) => !!ctl && ctl.e === e;
  function makeCtl(o) {
    const graph = o.graph || { nodes: {}, edges: [] };
    const nodes = graph.nodes || {}, adj = {};
    for (const id of Object.keys(nodes)) adj[id] = [];
    for (const [a0, b0] of graph.edges || []) { if (!nodes[a0] || !nodes[b0]) continue; adj[a0].push(b0); adj[b0].push(a0); }
    const edgeLen = (a0, b0) => { const A = nodes[a0], B = nodes[b0]; if (!A || !B) return 1; if (A.room !== B.room) return 1.5; return Math.max(0.2, Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1])); };
    function dijkstra(src, goalFn) {
      const dist = { [src]: 0 }, prev = {}, done = new Set(), q = [src];
      while (q.length) {
        q.sort((x, y) => dist[x] - dist[y]);
        const u = q.shift(); if (done.has(u)) continue; done.add(u);
        if (goalFn(u)) { const path = []; for (let k = u; k !== undefined && k !== src; k = prev[k]) path.unshift(k); return { path, dist: dist[u], goal: u }; }
        for (const v of adj[u] || []) { const nd = dist[u] + edgeLen(u, v); if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; q.push(v); } }
      }
      return null;
    }
    const C = {
      graph, nodes, adj, e: null, name: o.name || null, mode: o.mode || 'patrol', route: (o.route || []).filter((n) => nodes[n]),
      ri: -1, at: o.node && nodes[o.node] ? o.node : Object.keys(nodes)[0], next: null, prog: 0, len: 0, path: [], speed: o.speed || STD.speed,
      pauseT: 0, awayT: 0, seenT: -99, followT: 0, chimeT: 2, active: true,
      nodeRoom(id) { return nodes[id] ? nodes[id].room : null; },
      where() { // current abstract room (the room of the node it's in or heading into within the same room)
        if (!C.next) return C.nodeRoom(C.at);
        const ra = C.nodeRoom(C.at), rb = C.nodeRoom(C.next);
        return ra === rb ? ra : (C.prog / C.len < 0.5 ? ra : rb);
      },
      posNow() { const A = nodes[C.at]; if (!C.next) return A.pos; const B = nodes[C.next]; if (A.room !== B.room) return (C.prog / C.len < 0.5 ? A : B).pos; const k = clamp(C.prog / C.len); return [lerp(A.pos[0], B.pos[0], k), lerp(A.pos[1], B.pos[1], k)]; },
      plan() {
        const room = hasWorld() ? World.room : null;
        if (C.mode === 'hunt' || (C.mode === 'follow' && C.followT > 0)) {
          const r = room ? dijkstra(C.at, (id) => nodes[id].room === room) : null;
          C.path = r ? r.path : [];
          return;
        }
        if (!C.route.length) { C.path = []; return; }
        if (C.ri < 0 || C.ri >= C.route.length) { // head for the nearest route node first
          let best = -1, bd = Infinity;
          C.route.forEach((id, k) => { const r = dijkstra(C.at, (n) => n === id); if (r && r.dist < bd) { bd = r.dist; best = k; } });
          C.ri = Math.max(0, best);
        }
        if (C.route[C.ri] === C.at) C.ri = (C.ri + 1) % C.route.length;
        const r = dijkstra(C.at, (n) => n === C.route[C.ri]);
        C.path = r ? r.path : [];
      },
      // physical: the next node to walk to in this room (null = none)
      nextNodeInRoom() {
        if (!C.next) { if (!C.path.length) C.plan(); C.next = C.path.shift() || null; C.prog = 0; C.len = C.next ? edgeLen(C.at, C.next) : 0; }
        if (!C.next) return null;
        const n = nodes[C.next];
        if (n.room !== (hasWorld() ? World.room : null)) {
          // leaving: walk to the door node we're at, then go
          const here = nodes[C.at];
          if (C.e && here.room === World.room && flatDist(C.e.pos, { x: here.pos[0], z: here.pos[1] }) > 0.5) return here;
          C.exitRoom(); return null;
        }
        return n;
      },
      arrived(node) {
        if (!node) return;
        const id = Object.keys(nodes).find((k) => nodes[k] === node);
        if (!id) return;
        if (id === C.at && C.next) return;
        C.at = id; C.next = null; C.prog = 0;
      },
      exitRoom() {
        const e = C.e; if (!e) return;
        const n = nodes[C.at];
        const dp = [n.pos[0], e.pos.y + 1, n.pos[1]];
        sfx('door_open', { pos: dp, vol: 0.7 }); globalLater(0.9, () => sfx('door_close', { pos: dp, vol: 0.6 }));
        globalLater(1.6, () => sfx('keys_far', { pos: dp, vol: 0.5 }));
        C.e = null;
        C.prog = C.len * 0.5 + 0.01;
        e.remove();
      },
      enter(pos) {
        if (C.e || !hasWorld() || C.awayT > 0) return;
        const e = spawn({ id: 'standard', type: 'standard', pos, rot: 0, name: C.name || undefined, persist: false });
        if (!e) return;
        C.e = e;
        if (C.next) { const B = nodes[C.next]; e.yaw = Math.atan2(B.pos[0] - pos[0], B.pos[1] - pos[1]); }
        e.data.seenT = C.mode === 'follow' ? clock : 0;
        if (C.mode === 'follow' && pOK()) e.data.lastSeen = Player.pos.clone();
      },
      vanish(e) {
        C.awayT = STD.vanish;
        const room = World.room;
        // come back later at the route node furthest from Aidan's room
        let far = C.at, fd = -1;
        for (const id of (C.route.length ? C.route : Object.keys(nodes))) { const r = dijkstra(id, (n) => nodes[n].room === room); const d0 = r ? r.dist : 999; if (d0 > fd && nodes[id].room !== room) { fd = d0; far = id; } }
        C.at = far; C.next = null; C.path = []; C.prog = 0; C.mode = C.mode === 'follow' ? 'patrol' : C.mode;
        C.e = null;
        e.remove();
      },
      update(dt) {
        if (!C.active) return;
        if (C.awayT > 0) { C.awayT -= dt; return; }
        if (C.followT > 0) { C.followT -= dt; if (C.followT <= 0 && C.mode === 'follow') { C.mode = 'patrol'; C.path = []; } }
        const room = hasWorld() ? World.room : null;
        if (C.e) { if (C.e.removed) C.e = null; else { if (C.mode === 'follow' && clock - (C.e.data.seenT || -99) > 20) { C.mode = 'patrol'; C.path = []; } return; } }
        // abstract travel
        if (C.pauseT > 0) { C.pauseT -= dt; }
        else {
          if (!C.next) { if (!C.path.length) C.plan(); C.next = C.path.shift() || null; C.prog = 0; C.len = C.next ? edgeLen(C.at, C.next) : 0; }
          if (C.next) {
            C.prog += C.speed * dt;
            if (C.prog >= C.len) {
              C.at = C.next; C.next = null; C.prog = 0;
              const n = nodes[C.at];
              if (C.mode === 'patrol' && n.pause && C.route.includes(C.at)) C.pauseT = n.pause;
            }
          }
        }
        if (room && C.where() === room && !World.transitioning) {
          const pos = C.posNow();
          const n = nodes[C.at];
          if (n && n.door && !C.next) sfx('door_open', { pos: [pos[0], floorY(pos[0], pos[1]) + 1, pos[1]], vol: 0.8 });
          C.enter(pos);
          return;
        }
        // keys somewhere close: chime from the nearest door of Aidan's room
        if (room) {
          C.chimeT -= dt;
          if (C.chimeT <= 0) {
            C.chimeT = rnd(3.5, 6.5);
            const r = dijkstra(C.at, (id) => nodes[id].room === room);
            if (r && r.path.length <= 3 && r.dist < 30) { const g0 = nodes[r.goal]; sfx('keys_far', { pos: [g0.pos[0], floorY(g0.pos[0], g0.pos[1]) + 1.4, g0.pos[1]], vol: clamp(1 - r.dist / 30) * 0.9 }); }
          }
        }
      },
      onLeave(roomId) {
        const e = C.e;
        if (!e) return;
        // back to abstract at the nearest node in the room it was in
        let best = null, bd = Infinity;
        for (const id of Object.keys(nodes)) { const n = nodes[id]; if (n.room !== roomId) continue; const d0 = Math.hypot(n.pos[0] - e.pos.x, n.pos[1] - e.pos.z); if (d0 < bd) { bd = d0; best = id; } }
        if (best) { C.at = best; C.next = null; C.prog = 0; C.path = []; }
        const seenRecently = clock - (e.data.seenT || -99) < 12;
        if (seenRecently && C.mode !== 'hunt') { C.mode = 'follow'; C.followT = 90; }
        C.e = null;
      },
    };
    return C;
  }
  const standard = {
    start(o = {}) {
      if (ctl && ctl.e) ctl.e.remove();
      ctl = makeCtl(o);
      if (o.name) ctl.name = o.name;
      if (hasWorld() && ctl.where() === World.room) ctl.enter(ctl.posNow());
      return standard;
    },
    stop() { if (!ctl) return; if (ctl.e) ctl.e.remove(); ctl.active = false; ctl = null; },
    hunt() { if (ctl) { ctl.mode = 'hunt'; ctl.path = []; } },
    patrol(route) { if (ctl) { ctl.mode = 'patrol'; if (route) ctl.route = route.filter((n) => ctl.nodes[n]); ctl.path = []; } },
    setName(n) { if (ctl) ctl.name = n; for (const e of byType('standard')) { e.def.name = n; e.data.nameT = 0; } },
    teleport(node) { if (!ctl || !ctl.nodes[node]) return; if (ctl.e) ctl.e.remove(); ctl.e = null; ctl.at = node; ctl.next = null; ctl.prog = 0; ctl.path = []; },
    chime(vol = 0.9) { const e = byType('standard')[0]; const p = e ? e.pos : pOK() ? Player.pos : null; if (p) sfx(e ? 'keys' : 'keys_far', { pos: [p.x + (e ? 0 : 2.5), p.y + 1.4, p.z + (e ? 0 : 1.5)], vol }); },
    get active() { return !!ctl; },
    get state() { return ctl ? { room: ctl.where(), node: ctl.at, next: ctl.next, mode: ctl.mode, physical: !!ctl.e, away: Math.max(0, ctl.awayT), follow: Math.max(0, ctl.followT) } : null; },
    get e() { return ctl ? ctl.e : null; },
  };

  // =================================================================================================================
  // THE BORROWED (fear of being fooled by a fraudster)
  // =================================================================================================================
  const BORROW = {
    wai: { speaker: 'WAI', line: 'Take a seat, mate. I\'m on a call.', lineWhen: 'approach', hands: true, badge: null, examine: 'His hands. Rings on every finger. [beat] Wai doesn\'t wear rings.' },
    chloe: { speaker: 'CHLOE', line: 'Hi! Welcome in!', lineWhen: 'talk', hands: false, wristband: true, badge: 'CHLEO', examine: 'The badge says CHLEO. [beat] And there\'s a hospital band on her wrist.' },
    luka: { speaker: 'LUKA', line: 'I\'m not ringing about the roster.', lineWhen: 'talk', hands: true, badge: 'LUAK', examine: 'LUAK. [beat] And those aren\'t his hands.' },
  };
  function idCardTexture(a, seed) {
    const W = 256, H = 320, c = mkCanvas(W, H), x = c.getContext('2d'), r = U.rng(seed);
    const fc = a.faceCanvas;
    // the other ID underneath (shows under the peel): a stranger's photo, a teal band, part of a name
    x.fillStyle = '#e4e8e6'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#8a6e5c'; x.fillRect(140, 20, 110, 130);
    x.fillStyle = '#5a4436'; x.beginPath(); x.ellipse(195, 70, 34, 42, 0, 0, TAU); x.fill();
    x.fillStyle = BRAND.teal; x.fillRect(0, 0, W, 18);
    x.fillStyle = '#1b2626'; x.font = `bold 13px ${SANS}`; x.fillText('NAME: M', 150, 170);
    // the photo on top (the ally's face, flat), then lamination
    const g = document.createElement('canvas'); g.width = W; g.height = H; const y = g.getContext('2d');
    y.fillStyle = '#f2f1ec'; y.fillRect(0, 0, W, H);
    if (fc) {
      const S0 = fc.S, u0 = (0.5 - 0.3 / 0.72) * S0, u1 = (0.5 + 0.3 / 0.72) * S0, v0 = Math.max(0, (1 - (0.86 + 0.03) / 1.06) * S0), v1 = (1 - (0.08 + 0.03) / 1.06) * S0;
      y.drawImage(fc.canvas, u0, v0, u1 - u0, v1 - v0, 4, 4, W - 8, H - 8);
    }
    // photo flattening: a studio-flash wash and slight colour cast
    y.fillStyle = 'rgba(255,248,236,0.1)'; y.fillRect(4, 4, W - 8, H - 8);
    y.strokeStyle = 'rgba(240,238,230,0.9)'; y.lineWidth = 3; y.strokeRect(1.5, 1.5, W - 3, H - 3);
    if (a.P.glasses) { const gy = H * (1 - (0.5 - 0.08) / 0.78); y.strokeStyle = 'rgba(30,26,24,0.85)'; y.lineWidth = 5; for (const sx of [-1, 1]) { y.beginPath(); y.ellipse(W / 2 + sx * 56, gy + 8, 34, 22, 0, 0, TAU); y.stroke(); } y.beginPath(); y.moveTo(W / 2 - 22, gy + 4); y.lineTo(W / 2 + 22, gy + 4); y.stroke(); }
    // hologram strip + lamination glare
    const hg = y.createLinearGradient(0, H - 60, W, H - 20); hg.addColorStop(0, 'rgba(120,220,210,0.12)'); hg.addColorStop(0.5, 'rgba(240,200,255,0.16)'); hg.addColorStop(1, 'rgba(120,220,210,0.12)');
    y.fillStyle = hg; y.fillRect(10, H - 62, W - 20, 30);
    for (let i = 0; i < 3; i++) { const gg = y.createLinearGradient(0, 0, W, H); const o0 = 0.2 + i * 0.25; gg.addColorStop(Math.max(0, o0 - 0.05), 'rgba(255,255,255,0)'); gg.addColorStop(o0, `rgba(255,255,255,${0.18 - i * 0.04})`); gg.addColorStop(Math.min(1, o0 + 0.05), 'rgba(255,255,255,0)'); y.fillStyle = gg; y.fillRect(0, 0, W, H); }
    for (let i = 0; i < 40; i++) { y.strokeStyle = `rgba(255,255,255,${r() * 0.12})`; y.lineWidth = 1; const x0 = r() * W, y0 = r() * H; y.beginPath(); y.moveTo(x0, y0); y.lineTo(x0 + (r() - 0.5) * 30, y0 + (r() - 0.5) * 30); y.stroke(); }
    // peel: the top-right corner lifts away (clip it out of the top card)
    y.globalCompositeOperation = 'destination-out';
    y.beginPath(); y.moveTo(W - 92, 0); y.lineTo(W, 0); y.lineTo(W, 104); y.closePath(); y.fill();
    y.globalCompositeOperation = 'source-over';
    x.drawImage(g, 0, 0);
    // curled underside of the peel + its shadow
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.moveTo(W - 92, 0); x.lineTo(W - 20, 30); x.lineTo(W, 104); x.closePath(); x.fill();
    x.fillStyle = '#d9d7cf'; x.beginPath(); x.moveTo(W - 92, 0); x.quadraticCurveTo(W - 60, 40, W - 34, 44); x.quadraticCurveTo(W - 14, 70, W, 104); x.lineTo(W - 30, 60); x.closePath(); x.fill();
    // lifted edge along the left bottom corner too
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.beginPath(); x.moveTo(0, H - 40); x.lineTo(28, H); x.lineTo(0, H); x.closePath(); x.fill();
    return canvasTex(c, { own: true });
  }
  function borrowedCreate(e, def) {
    const dz = def.disguise || 'wai';
    const B = { ...(BORROW[dz] || { speaker: dz.toUpperCase(), line: '...', lineWhen: 'talk', hands: true, examine: 'Something about the hands.' }) };
    for (const k of ['line', 'lineWhen', 'examine', 'speaker', 'hands', 'wristband']) if (def[k] !== undefined) B[k] = def[k];
    if (def.badge !== undefined) B.badge = def.badge;
    if (def.tell === 'hands') B.hands = true;
    if (def.tell === 'badge' && !B.badge) B.badge = misspell(dz);
    const pre = Rig.PRESETS[dz] ? Rig.PRESETS[dz] : null;
    const base = pre ? (typeof pre.params === 'function' ? pre.params(1) : pre.params) : {};
    const opts = { hands: { rings: !!B.hands, extraKnuckles: !!B.hands, wristband: !!B.wristband } };
    if (B.badge) { if (base.lanyard) opts.lanyard = { card: B.badge }; else opts.badge = B.badge; }
    const a = Rig.create(pre ? dz : 'customer', opts);
    e.actor = a; e.obj = a.root; e.pos = a.root.position;
    e.radius = 0.3; e.height = a.height; e.hp = e.maxHp = def.hp ?? 40;
    e.data.B = B;
    e.disguised = true; e.noRaise = true; e.hostile = false; e.threat = false;
    // the face: a flat laminated ID photo of the ally's face (another ID underneath the peeling corner)
    const tex = idCardTexture(a, U.hash(e.id));
    e.data.idTex = tex;
    a._paintFace = function () { const fc = this.faceCanvas; if (!fc) return; fc.ctx.fillStyle = this.P.skin; fc.ctx.fillRect(0, 0, fc.S, fc.S); fc.tex.needsUpdate = true; };
    a._paintFace();
    if (a.eyeMesh) for (const s of ['L', 'R']) if (a.eyeMesh[s]) for (const m of Object.values(a.eyeMesh[s])) m.visible = false;
    for (const n of ['nose']) if (a.parts[n]) for (const m of [].concat(a.parts[n])) m.visible = false;
    if (a.glassesObj) a.glassesObj.visible = false;
    const card = new THREE.Mesh(shared('idG', () => { const g = new THREE.PlaneGeometry(0.6, 0.78); g.userData.shared = true; return g; }), a._mat('idcard', () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide })));
    a.disposables.push(tex);
    card.position.set(0, 0.05, 0.05); card.castShadow = false;
    a.faceMount.add(card);
    // the peeled corner stands off the card
    const peel = new THREE.Mesh(shared('peelG', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.216, 0, 0, 0, -0.254, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.userData.shared = true; return g; }), a.plain('#dedcd4', { rough: 0.5, side: 'double' }));
    peel.position.set(0.3, 0.44, 0.055); peel.rotation.set(0.35, -0.55, 0); peel.castShadow = false;
    a.faceMount.add(peel);
    e.data.card = card;
    if (def.anim) a.setAnim(def.anim, { blend: 0, ...(def.animOpts || {}) });
    e.state = 'disguised';
  }
  function misspell(n) { const s = n.toUpperCase(); return s.length > 3 ? s.slice(0, s.length - 2) + s[s.length - 1] + s[s.length - 2] : s[0] + s[2] + s[1]; }
  function borrowedUpdate(e, dt, ai) {
    const a = e.actor, D = e.data, B = D.B;
    if (e.resolved) return;
    if (D.unfold) borrowedUnfoldStep(e, dt);
    if (e.state === 'disguised') {
      borrowedInteractable(e);
      if (D.it) { D.it.pos.set(e.pos.x, e.pos.y + e.height * 0.85, e.pos.z); D.it.enabled = !D.talking; }
      if (!ai || D.talking) return;
      D.cool = Math.max(0, (D.cool || 0) - dt);
      if (!pOK()) return;
      const d = flatDist(e.pos, Player.pos);
      if (d > 5.5) D.left = true;
      if (e.def.auto !== false && d <= (e.def.autoRange ?? 4) && D.cool <= 0 && (D.left !== false) && los(e.pos.x, e.pos.z, Player.pos.x, Player.pos.z, { minH: 1.5, y: e.pos.y }) && Player.canControl) borrowedTalk(e);
      return;
    }
    if (e.state === 'ambush') return;
    if (e.downed || e.knocked) return;
    if (e.stunT > 0) { if (a.anim !== 'stagger') a.setAnim('stagger', { blend: 0.2 }); D.windup = null; return; }
    if (!ai) { if (a.anim !== 'idle') a.setAnim('idle', { blend: 0.5 }); return; }
    const p = pOK() ? Player.pos : null; if (!p) return;
    const d = flatDist(e.pos, p);
    a.lookAt(Player.actor);
    D.creakT = (D.creakT ?? 1) - dt;
    if (D.creakT <= 0) { D.creakT = rnd(0.9, 1.8); sfx('unfold', { pos: P3(e.pos, 1.4), dur: 0.25, vol: 0.45 }); }
    if (D.windup) {
      D.windup.t += dt;
      e.yaw = turnToward(e.yaw, yawTo(e.pos, p), 3, dt);
      if (D.windup.t >= 0.55 && !D.windup.hit) {
        D.windup.hit = true;
        const ang = Math.abs(U.angleDiff(e.yaw, yawTo(e.pos, p)));
        if (d <= 2.2 && ang < 50 * D2R && Math.abs(p.y - e.pos.y) < 1.4) { Player.damage(15, e, { push: 0.6, from: e.pos }); sfx('grab', { pos: P3(p, 1.2) }); }
      }
      if (D.windup.t >= 1.0) { D.windup = null; D.atkCd = 2.2; }
      return;
    }
    D.atkCd = Math.max(0, (D.atkCd || 0) - dt);
    if (d <= 1.9 && D.atkCd <= 0 && e.flinchT <= 0) { D.windup = { t: 0 }; a.gesture('reach', { hand: 'L', target: Player.actor, dur: 0.9 }); sfx('unfold', { pos: P3(e.pos, 1.5), dur: 0.35, vol: 0.7 }); return; }
    const m = e.flinchT > 0 ? { moved: 0 } : moveToward(e, p.x, p.z, 1.35, dt, { nav: true, stopAt: 1.2, turn: 3 });
    e.yaw = turnToward(e.yaw, yawTo(e.pos, p), 2.5, dt);
    a.setAnim(m.moved > 1e-4 ? 'walk' : 'idle', { blend: 0.35 });
  }
  // Talk / Examine / Step back (spec §6, §9 3-3) — runs as a blocking script (auto within 4 m, or E on it)
  async function borrowedConversation(e, G) {
    const D = e.data, B = D.B;
    if (D.talking || e.state !== 'disguised') return;
    D.talking = true;
    try {
      if (B.lineWhen === 'approach' && B.line && !D.greeted) { D.greeted = true; e.actor.talk(U.readTime(B.line)); await G.say(B.speaker, B.line); }
      for (;;) {
        if (e.removed || e.resolved || e.state !== 'disguised') return;
        const i = await G.choice(['Talk', 'Examine', 'Step back'], { cancel: 2 });
        if (i === 0) {
          if (B.lineWhen !== 'approach' && B.line) { e.actor.talk(U.readTime(B.line)); await G.say(B.speaker, B.line); }
          borrowedReveal(e, 'ambush');
          return;
        }
        if (i === 1) {
          const dd = pOK() ? flatDist(e.pos, Player.pos) : 99;
          if (dd > 4.3) { await G.think('I can\'t make it out from here.'); continue; }
          D.examined = true;
          await G.think(B.examine);
          continue;
        }
        // step back: Aidan backs away a couple of paces (the script owns his body meanwhile)
        if (pOK() && hasWorld()) {
          const a = Player.actor, away = yawTo(e.pos, Player.pos);
          a.setAnim('walk', { blend: 0.2 });
          let moved = 0;
          await G.loop((dt) => {
            const st = Math.min(1.1 * dt, 1.6 - moved), p = Player.pos;
            const r = World.move(p, Math.sin(away) * st, Math.cos(away) * st, 0.3, { ignore: isEnemyCol });
            p.set(r.x, r.y, r.z); moved += st;
            return moved >= 1.6 || r.blocked;
          });
          a.setAnim('idle', { blend: 0.3 });
        }
        if (D.examined) borrowedReveal(e, 'range');
        return;
      }
    } finally {
      D.talking = false; D.cool = 6; D.left = false;
    }
  }
  function borrowedTalk(e) {
    if (!hasScript() || !Script.run || e.data.talking) return;
    Script.run((G) => borrowedConversation(e, G), { control: false, id: 'borrowed:' + e.id, name: 'borrowed' });
  }
  // E on the disguised Borrowed (within 3 m) opens the same conversation
  function borrowedInteractable(e) {
    if (!hasWorld() || e.data.it) return;
    const it = { id: 'enemy:' + e.id, kind: 'npc', pos: V(), r: e.def.interactR ?? 2.6, when: null, world: e.world, enabled: true, hold: 0, look: true, fn: (G) => borrowedConversation(e, G), obj: e.obj, name: e.id };
    World.build.interactables.push(it);
    e.data.it = it;
  }
  function borrowedDropInteractable(e) {
    const it = e.data.it; if (!it) return;
    it.removed = true; it.enabled = false;
    if (hasWorld()) { const a = World.build.interactables, i = a.indexOf(it); if (i >= 0) a.splice(i, 1); }
    e.data.it = null;
  }
  function borrowedReveal(e, how) {
    const D = e.data, a = e.actor;
    if (e.state !== 'disguised') return;
    e.disguised = false; e.noRaise = false; e.hostile = true; e.threat = true;
    e.state = 'reveal'; e.stateT = 0;
    borrowedDropInteractable(e);
    a.idleLife = false; a.finishGestures();
    a.setAnim('idle', { blend: 0.3 });
    const turnFrom = e.yaw;
    D.unfold = { t: 0, turnFrom, how, grabbed: false };
    sfx('unfold', { pos: P3(e.pos, 1.4), dur: 1.0 });
    if (how === 'ambush') e.state = 'ambush';
  }
  function borrowedUnfoldStep(e, dt) {
    const U0 = e.data.unfold, a = e.actor, B = a.bones;
    U0.t += dt;
    const k = U.ease.inOut(clamp(U0.t / 1.0));
    if (pOK()) e.yaw = U.wrapAngle(U0.turnFrom + U.angleDiff(U0.turnFrom, yawTo(e.pos, Player.pos)) * clamp(U0.t / 0.6));
    // limbs extend: arms 1.5×, legs 1.15×, spine/neck longer (a subtle wrongness in the stretch)
    for (const s of ['L', 'R']) {
      B['upperArm' + s].scale.set(1, 1 + 0.5 * k, 1); B['foreArm' + s].scale.set(1 - 0.12 * k, 1 + 0.35 * k, 1 - 0.12 * k);
      B['thigh' + s].scale.set(1, 1 + 0.15 * k, 1); B['shin' + s].scale.set(1, 1 + 0.15 * k, 1);
    }
    B.spine.scale.set(1, 1 + 0.25 * k, 1); B.neck.scale.set(1, 1 + 0.6 * k, 1);
    a.body.position.y = (a.D.hipJoint * a.H) * 0.15 * k;
    e.height = a.height * (1 + 0.2 * k);
    if (U0.how === 'ambush' && U0.t >= 0.95 && !U0.grabbed) {
      U0.grabbed = true;
      if (pOK() && flatDist(e.pos, Player.pos) < 4.5) {
        a.gesture('reach', { hand: 'L', target: Player.actor, dur: 0.9 });
        Player.damage(25, e, { push: 0.9, from: e.pos, force: true });
        sfx('grab', { pos: P3(Player.pos, 1.2) });
      }
    }
    if (U0.t >= 1.15) { e.data.unfold = null; e.state = 'hunt'; e.data.atkCd = 1.2; }
  }
  defineType('borrowed', {
    hp: 40, radius: 0.3, height: 1.75, tell: 'none', downs: true, idleAnim: 'idle',
    create: borrowedCreate, update: borrowedUpdate,
    onHit(e) { if (e.disguised) return false; return true; },
    stun(e) { return !e.disguised; }, knockdown(e) { if (e.disguised) return false; later(e, 0.85, () => { if (e.knocked && !e.resolved) e.actor.setAnim('lie', { blend: 0.5 }); }); return true; },
    onDown(e) { later(e, 0.85, () => { if (e.downed && !e.resolved) e.actor.setAnim('lie', { blend: 0.5 }); }); },
    onUp(e) { e.state = 'hunt'; },
    onDie(e, o) {
      // the ID photo slips off and lands face-up; the body fades into the fog
      const card = e.data.card, a = e.actor;
      if (card) {
        card.updateWorldMatrix(true, false);
        const wp = card.getWorldPosition(V()), ws = card.getWorldScale(V());
        card.parent.remove(card);
        // the card outlives the body: its own material, its texture no longer owned by the actor
        card.material = card.material.clone(); card.material.userData = { keep: true };
        if (e.data.idTex) { a.disposables = a.disposables.filter((d) => d !== e.data.idTex); e.data.idTex.userData.shared = false; }
        card.position.copy(wp); card.scale.copy(ws); card.rotation.set(-HALF, rnd(0, TAU), 0, 'YXZ');
        e.fx.add(card);
        e.data.cardFall = { v: 0, y0: floorY(wp.x, wp.z, e.pos.y) + 0.01 };
        e.data.keepCard = card;
      }
      defaultDeath(e, o);
    },
    post(e, dt) {
      const f = e.data.cardFall; if (!f) return;
      const c = e.data.keepCard; f.v += 3 * dt; c.position.y = Math.max(f.y0, c.position.y - f.v * dt); c.position.x += Math.sin(clock * 3) * 0.1 * dt;
      if (c.position.y <= f.y0) e.data.cardFall = null;
    },
    remove(e) {
      borrowedDropInteractable(e);
      // leave the laminated face behind on the floor for the rest of the visit
      const c = e.data.keepCard;
      if (c && c.parent && hasWorld()) { c.parent.remove(c); World.build.group.add(c); e.data.keepCard = null; }
    },
    threat: (e) => !e.disguised && !e.resolved,
  });

  // =================================================================================================================
  // THE UNREAD (fear of never switching off)
  // =================================================================================================================
  const UNREAD = { wake: 10, cone: 30, speed: 3.4, sting: 2, calm: 3 };
  function mothGeos() {
    return shared('moth', () => {
      const body = new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12);
      // top face UVs: disc mapping so the badge texture sits on the cap
      const p = body.attributes.position, uv = body.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 0.042, 0.5 - p.getZ(i) / 0.042);
      const wing = new THREE.PlaneGeometry(0.048, 0.03).rotateX(-HALF).translate(0.024 + 0.012, 0, -0.003);
      body.userData.shared = true; wing.userData.shared = true;
      return { body, wing };
    });
  }
  function unreadCreate(e, def) {
    const n = clamp(def.count ?? 40, 30, 60) | 0;
    const G = mothGeos();
    const bodyMat = shared('mothBody', () => markShared(new THREE.MeshBasicMaterial({ map: badgeTexture(), color: '#ffffff', transparent: true, alphaTest: 0.3, toneMapped: true })));
    const wingMat = shared('mothWing', () => markShared(new THREE.MeshStandardMaterial({ map: simTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1 })));
    const bodies = new THREE.InstancedMesh(G.body, bodyMat, n);
    const wings = new THREE.InstancedMesh(G.wing, wingMat, n * 2);
    bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    for (const m of [bodies, wings]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    const g = new THREE.Group(); g.name = 'unread:' + e.id; g.add(bodies); g.add(wings);
    e.obj = g; e.pos = V();
    e.radius = 0.8; e.height = 2; e.hp = e.maxHp = Infinity; e.invincible = true; e.lockable = false;
    const pts = (def.cluster && def.cluster.length ? def.cluster : [[(def.pos || [0, 0])[0], floorY((def.pos || [0, 0])[0], (def.pos || [0, 0])[1]) + 2.2, (def.pos || [0, 0])[1]]]).map((q) => V(q[0], q[1], q[2]));
    const r = U.rng(U.hash(e.id));
    const M = [];
    for (let i = 0; i < n; i++) {
      const c = pts[i % pts.length], nrm = clusterNormal(c);
      // spread over the wall around the point (tangent plane of the estimated normal)
      const t1 = Math.abs(nrm.y) > 0.9 ? V(1, 0, 0) : V(-nrm.z, 0, nrm.x).normalize(), t2 = V().crossVectors(nrm, t1).normalize();
      const rad = Math.pow(r(), 0.65) * 0.24, ang = r() * TAU;
      const home = c.clone().addScaledVector(t1, Math.cos(ang) * rad).addScaledVector(t2, Math.sin(ang) * rad * 0.8).addScaledVector(nrm, 0.012);
      const q = new THREE.Quaternion().setFromUnitVectors(UPY, nrm);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(UPY, r() * TAU));
      M.push({ p: home.clone(), v: V(), home, hq: q, q: q.clone(), ph: r() * TAU, flap: 0, restK: 1, seed: r() });
    }
    e.data.M = M; e.data.bodies = bodies; e.data.wings = wings; e.data.pts = pts;
    // where the glow sits: a little out from the wall
    const gn = clusterNormal(pts[0]);
    e.data.glow = pts.reduce((acc, q) => acc.add(q), V()).multiplyScalar(1 / pts.length).addScaledVector(gn, 0.45);
    e.data.swarm = 'rest'; e.data.stingT = 1; e.data.calmT = 0; e.data.scatterT = 0;
    e.state = 'rest';
    unreadCentroid(e);
    e.placed = true;
    // a faint red glow on the wall (only if the room left a pool light free)
    try { e.data.light = Render.allocLight('point', { color: '#ff2a18', intensity: 0.5, distance: 3.2, pos: P3(e.data.glow) }); } catch (err) { /* pool */ }
    loop(e, 'unread_buzz', true, { pos: P3(e.pos), vol: 0.5, intensity: 0.2 });
    unreadWrite(e, 0);
  }
  function clusterNormal(c) {
    if (!hasWorld()) return V(0, 0, 1);
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, dx = Math.sin(a), dz = Math.cos(a);
      const h = World.raycast(c.x, c.z, dx, dz, 0.7, { minH: 0.2, y: c.y - 1.2, ignore: isEnemyCol });
      if (h && (!best || h.dist < best.d)) best = { d: h.dist, dx, dz };
    }
    const fy = floorY(c.x, c.z, 0);
    if (best && best.d < 0.6) return V(-best.dx, 0, -best.dz);
    if (c.y - fy > 2.2) return V(0, -1, 0);
    return V(0, 1, 0);
  }
  function unreadCentroid(e) {
    const M = e.data.M; e.pos.set(0, 0, 0);
    for (const m of M) e.pos.add(m.p);
    e.pos.multiplyScalar(1 / M.length);
    return e.pos;
  }
  const _mq = new THREE.Quaternion(), _mm = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _ms = V(1, 1, 1), _col = new THREE.Color();
  function unreadWrite(e, dt) {
    const D = e.data, M = D.M, B = D.bodies, W = D.wings;
    for (let i = 0; i < M.length; i++) {
      const m = M[i];
      _mm.compose(m.p, m.q, _ms);
      B.setMatrixAt(i, _mm);
      const pulse = m.restK > 0.5 ? 0.55 + 0.45 * Math.sin(clock * 2.2 + m.ph) : 0.95 + 0.35 * Math.sin(clock * 9 + m.ph);
      _col.setScalar(pulse * (D.swarm === 'rest' ? 1.0 : 1.35)); B.setColorAt(i, _col);
      const ang = m.restK > 0.5 ? 0.12 + 0.08 * Math.sin(clock * 1.3 + m.ph) : 0.2 + 0.9 * Math.abs(Math.sin(clock * 38 + m.ph * 3));
      for (let s = 0; s < 2; s++) {
        const sg = s ? -1 : 1;
        _wq.setFromAxisAngle(_v1.set(0, 0, 1), sg * ang);
        _wm.compose(_v2.set(0, 0, 0), _wq, _v3.set(sg, 1, 1));
        _wm.premultiply(_mm);
        W.setMatrixAt(i * 2 + s, _wm);
      }
    }
    B.instanceMatrix.needsUpdate = true; W.instanceMatrix.needsUpdate = true;
    if (B.instanceColor) B.instanceColor.needsUpdate = true;
  }
  function unreadTorchSees(e) {
    if (!pOK() || !Player.torchOn) return false;
    const L = Render.torch.light, tp = L.position, td = _v4.subVectors(L.target.position, tp).normalize();
    for (const c of e.data.pts) {
      const d = tp.distanceTo(c);
      if (d > UNREAD.wake) continue;
      // def.vertical (a nest above a platform / in a ladder cage, lit from below): the torch's spill wakes it — within
      // 3 m of the lens, or within 1.2 m of the beam's axis — whatever the cone says
      if (e.def.vertical) {
        const along = _v5.subVectors(c, tp).dot(td);
        const off = along > 0 ? Math.sqrt(Math.max(0, d * d - along * along)) : d;
        if (d < 3 || off < 1.2) return true;
      }
      const dir = _v5.subVectors(c, tp).normalize();
      if (Math.acos(clamp(dir.dot(td), -1, 1)) > UNREAD.cone * D2R) continue;
      if (los(tp.x, tp.z, c.x, c.z, { minH: 1.5 })) return true;
    }
    return false;
  }
  function unreadUpdate(e, dt, ai) {
    const D = e.data, M = D.M;
    const p = pOK() ? Player.pos : null;
    const torch = pOK() && Player.torchOn;
    switch (D.swarm) {
      case 'rest':
        if (ai && unreadTorchSees(e)) unreadWake(e);
        break;
      case 'swarm':
        if (!p) { D.swarm = 'settle'; break; }
        // torch off AND standing still, both for 3 s
        D.calmT = !torch && Player.stillTime > 0.05 ? (D.calmT || 0) + dt : 0;
        if (D.calmT >= UNREAD.calm) { D.swarm = 'settle'; D.calmT = 0; sfx('msgchime', { pos: P3(e.pos), vol: 0.3 }); break; }
        if (flatDist(e.pos, p) > 16) { D.swarm = 'settle'; break; }
        break;
      case 'scatter':
        D.scatterT -= dt;
        if (D.scatterT <= 0) D.swarm = 'settle';
        break;
      case 'settle':
        if (ai && torch && unreadTorchSees(e) && D.calmCool <= 0) { unreadWake(e); break; }
        if (M.every((m) => m.restK >= 1)) D.swarm = 'rest';
        break;
      default: D.swarm = 'rest';
    }
    D.calmCool = Math.max(0, (D.calmCool || 0) - dt);
    e.state = D.swarm;
    unreadSim(e, dt, ai);
    unreadCentroid(e);
    // stings
    if (D.swarm === 'swarm' && ai && p) {
      let near = 0;
      for (const m of M) { const dy = m.p.y - p.y; if (dy > 0.6 && dy < 1.95 && Math.hypot(m.p.x - p.x, m.p.z - p.z) < 0.6) near++; }
      if (near > 0) {
        D.stingT -= dt * (torch ? 1 : 0.5) * clamp(near / 3, 0.6, 1.5);
        if (D.stingT <= 0) {
          D.stingT = rnd(0.8, 1.4);
          Player.damage(UNREAD.sting, e, { force: true, cooldown: 0.1 });
          ui('sting', { life: 6 });
          sfx('sting', { pos: P3(p, 1.5) });
          if (!D.stung) { D.stung = true; ui('prompt', 'Light draws them. {torch}: torch off. Stay still.', { id: 'unread_first' }); }
        }
      }
    }
    const sw = D.swarm === 'swarm' || D.swarm === 'scatter';
    loop(e, 'unread_buzz', true, { pos: P3(e.pos), vol: sw ? 0.85 : 0.45, intensity: sw ? 0.95 : 0.2 });
    if (D.light) {
      const lp = sw ? e.pos : D.glow;
      D.light.set({ pos: [lp.x, lp.y, lp.z], intensity: (sw ? 0.7 : 0.4) * (0.7 + 0.3 * Math.sin(clock * 2.2)) });
    }
    unreadWrite(e, dt);
  }
  function unreadWake(e) {
    const D = e.data;
    D.swarm = 'swarm';
    D.stingT = Math.min(D.stingT, 1.0);
    sfx('vibrate', { pos: P3(e.pos), vol: 0.8 });
    later(e, 0.4, () => sfx('msgchime', { pos: P3(e.pos), vol: 0.5 }));
    for (const m of D.M) { m.v.set(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)); m.restK = 0; }
  }
  function unreadSim(e, dt, ai) {
    const D = e.data, M = D.M, n = M.length;
    const p = pOK() ? Player.pos : null;
    const torchP = Render.torch.light.position;
    const mode = D.swarm;
    for (let i = 0; i < n; i++) {
      const m = M[i];
      if (mode === 'rest' || (mode === 'settle' && m.restK >= 1)) {
        m.restK = 1; m.p.copy(m.home); m.q.copy(m.hq);
        if (Math.random() < 0.002) m.p.addScaledVector(_v1.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), 0.005);
        continue;
      }
      const acc = _v1.set(0, 0, 0);
      if (mode === 'settle') {
        const to = _v2.subVectors(m.home, m.p), d = to.length();
        if (d < 0.05) { m.restK = 1; m.v.set(0, 0, 0); continue; }
        acc.addScaledVector(to.normalize(), 7).addScaledVector(m.v, -2.5);
        if (d < 0.5) m.v.multiplyScalar(Math.max(0, 1 - dt * 4));
      } else if (mode === 'swarm' && p && ai) {
        // orbit the phone (torch) or Aidan's head, each at its own radius and phase
        const tgt = Player.torchOn && i % 2 ? _v2.copy(torchP) : _v2.set(p.x, p.y + 1.55, p.z);
        const a = clock * (1.8 + m.seed) + m.ph, rr = 0.18 + m.seed * 0.38;
        tgt.x += Math.cos(a) * rr; tgt.z += Math.sin(a) * rr; tgt.y += Math.sin(a * 1.7) * 0.22;
        const to = _v3.subVectors(tgt, m.p);
        acc.addScaledVector(to, 11).addScaledVector(m.v, -2.2);
      } else if (mode === 'scatter') {
        acc.addScaledVector(m.v, 0.5);
        acc.y += 1.5;
      }
      // separation / cohesion / alignment with the nearest few
      if (mode !== 'settle') {
        let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0, k = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = M[j];
          const dx = m.p.x - o.p.x, dy = m.p.y - o.p.y, dz = m.p.z - o.p.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 0.36) continue;
          if (d2 < 0.012) { const d = Math.sqrt(d2) + 1e-3; acc.x += dx / d * 5; acc.y += dy / d * 5; acc.z += dz / d * 5; }
          cx += o.p.x; cy += o.p.y; cz += o.p.z; vx += o.v.x; vy += o.v.y; vz += o.v.z; k++;
        }
        if (k) { acc.x += (cx / k - m.p.x) * 1.2 + (vx / k - m.v.x) * 0.6; acc.y += (cy / k - m.p.y) * 1.2 + (vy / k - m.v.y) * 0.6; acc.z += (cz / k - m.p.z) * 1.2 + (vz / k - m.v.z) * 0.6; }
        acc.x += (Math.random() - 0.5) * 5; acc.y += (Math.random() - 0.5) * 3.5; acc.z += (Math.random() - 0.5) * 5;
      }
      m.v.addScaledVector(acc, dt);
      const maxV = mode === 'scatter' ? 6 : UNREAD.speed, sp = m.v.length();
      if (sp > maxV) m.v.multiplyScalar(maxV / sp);
      m.p.addScaledVector(m.v, dt);
      // stay in the room (above the floor, below ~3.5 m over it — or over the nest itself, and for a def.vertical nest
      // over Aidan too, so the swarm follows him up a ladder)
      const fy = floorY(m.p.x, m.p.z, m.home.y - 2);
      let ceil = Math.max(fy + 3.4, m.home.y + 1.0);
      if (e.def.vertical && p) ceil = Math.max(ceil, p.y + 2.4);
      if (e.def.ceiling !== undefined) ceil = e.def.ceiling;
      if (m.p.y < fy + 0.15) { m.p.y = fy + 0.15; m.v.y = Math.abs(m.v.y); }
      if (m.p.y > ceil) { m.p.y = ceil; m.v.y = -Math.abs(m.v.y); }
      if (sp > 0.05) { _v2.copy(m.v).normalize(); _m1.lookAt(_v2, _v3.set(0, 0, 0), UPY); _mq.setFromRotationMatrix(_m1); m.q.slerp(_mq, Math.min(1, dt * 10)); }
      m.restK = 0;
    }
  }
  function unreadScatter(e, origin, yaw) {
    const D = e.data;
    D.swarm = 'scatter'; D.scatterT = 2.2; D.calmCool = 4;
    const o = origin ? U.toV3(origin) : pOK() ? Player.pos.clone().setY(Player.pos.y + 1.1) : e.pos.clone();
    const fx = yaw !== undefined ? Math.sin(yaw) : 0, fz = yaw !== undefined ? Math.cos(yaw) : 0;
    for (const m of D.M) {
      const away = _v1.subVectors(m.p, o); away.y = Math.max(0.2, away.y);
      away.normalize();
      m.v.set(away.x * 4 + fx * 3 + rnd(-1, 1), away.y * 3 + rnd(0.5, 2), away.z * 4 + fz * 3 + rnd(-1, 1));
      m.restK = 0;
    }
    sfx('skitter', { pos: P3(e.pos), vol: 0.5 });
  }
  function unreadNearest(e, pos) {
    let best = Infinity, bm = null;
    for (const m of e.data.M) { const d = (m.p.x - pos.x) ** 2 + (m.p.z - pos.z) ** 2 + ((m.p.y - (pos.y + 1.2)) ** 2) * 0.5; if (d < best) { best = d; bm = m; } }
    return { d: Math.sqrt(best), m: bm };
  }
  defineType('unread', {
    hp: Infinity, radius: 0.8, height: 2, tell: 'vibrate', downs: false, invincible: true, lockable: false, stompable: false, body: false,
    create: unreadCreate, update: unreadUpdate,
    onHit(e) {
      // a swing through them scatters the nearest few; they can't be killed
      if (!pOK()) return false;
      for (const m of e.data.M) if (m.p.distanceTo(Player.pos) < 2.2) { m.v.add(_v1.set(rnd(-3, 3), rnd(0.5, 2.5), rnd(-3, 3))); }
      if (e.data.swarm === 'rest') unreadWake(e);
      return false;
    },
    stun() { return false; }, knockdown() { return false; },
    threat: () => true,
    threatDist(e, pos) { return unreadNearest(e, pos).d; },
    hitbox(e) { return e.data.M.filter((m, i) => i % 3 === 0).map((m) => ({ x: m.p.x, z: m.p.z, r: 0.15, y0: m.p.y - 0.3, y1: m.p.y + 0.3 })); },
  });

  // =================================================================================================================
  // Frame update
  // =================================================================================================================
  function update(dt = Time.dt || 0) {
    clock += dt;
    stepGlobalTimers(dt);
    if (hasWorld() && (World.room !== lastRoom)) { lastRoom = World.room; Nav.invalidate(); }
    if (lastOutage !== !!S.outage) { lastOutage = !!S.outage; Nav.invalidate(); }
    const paused = isPaused();
    for (const e of list.slice()) {
      if (e.removed) continue;
      const on = active(e) && !e.hidden;
      if (e.obj) e.obj.visible = on;
      e.fx.visible = on;
      if (!active(e)) { stopLoops(e); syncCollider(e); continue; }
      e.t += dt; e.stateT += dt;
      stepTimers(e, dt);
      if (e.flinchT > 0) e.flinchT -= dt;
      if (e.stunT > 0) { e.stunT -= dt; if (e.stunT <= 0) { e.stunT = 0; if (e.T.onUnstun) e.T.onUnstun(e); } }
      if (e.knocked && !e.resolved) { e.knockT -= dt; if (e.knockT <= 0) { e.knocked = false; getUp(e); } }
      if (e.downed && !e.resolved) { e.downT -= dt; if (e.downT <= 0) getUp(e); }
      // CONTRACT+ e.scriptAI = true: this enemy keeps thinking while a blocking scene runs (an alert inside an in-engine
      // beat turns it at once) — never during a room transition or once Aidan is dead
      const ai = e.ai !== false && (!paused || (e.scriptAI === true && scriptOnlyPause()));
      if (e.data.straight) stepStraight(e, dt);
      try { if (e.T.update) e.T.update(e, dt, ai); } catch (err) { console.error(`[Enemies] update ${e.id}`, err); }
      if (e.removed) continue;
      stepFade(e, dt);
      if (e.removed) continue;
      if (e.actor && on) { e.actor.update(dt); }
      if (e.T.post && on) { try { e.T.post(e, dt); } catch (err) { console.error('[Enemies] post', err); } }
      if (e.fxBatch && on) e.fxBatch.check(true);                    // (the fx batch's bounds follow the tethers)
      if (on) footsteps(e);
      syncCollider(e);
    }
    if (hasWorld()) separate();
    if (ctl) { try { ctl.update(dt); } catch (err) { console.error('[Enemies] standard graph', err); } }
    Voice.update(dt);
  }

  // =================================================================================================================
  // Queries
  // =================================================================================================================
  function threatOf(e) {
    if (e.removed || e.resolved || !active(e) || e.hidden) return false;
    const t = e.T.threat;
    const base = typeof t === 'function' ? !!t(e) : t !== false;
    return base && e.threat !== false;
  }
  function nearestThreat(pos) {
    if (!pos) return null;
    let best = null, bd = Infinity;
    for (const e of list) {
      if (!threatOf(e)) continue;
      let d;
      if (e.T.threatDist) d = e.T.threatDist(e, pos);
      else d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) + Math.max(0, Math.abs(e.pos.y - pos.y) - 1.5);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { e: best, dist: bd, tell: best.tell || best.T.tell || best.type } : null;
  }
  // origin: Vector3 (Aidan's chest), dirYaw radians (0 = +Z), range m, arcDeg = full arc
  function hitTest(origin, dirYaw, range, arcDeg = 90) {
    const out = [];
    if (!origin) return out;
    const half = (arcDeg * D2R) / 2;
    for (const e of list) {
      if (e.removed || e.resolved || !active(e) || e.hidden || e.untouchable || e.disguised) continue;
      if (e.T.hitTest) { if (e.T.hitTest(e, origin, dirYaw, range, arcDeg)) out.push({ e, d: flatDist(origin, e.pos) }); continue; }
      const boxes = e.T.hitbox ? e.T.hitbox(e) : [{ x: e.pos.x, z: e.pos.z, r: e.radius, y0: e.pos.y, y1: e.pos.y + e.height }];
      let hit = null;
      for (const b of boxes) {
        const dx = b.x - origin.x, dz = b.z - origin.z, dc = Math.hypot(dx, dz), d = dc - b.r;
        if (d > range) continue;
        if (origin.y < b.y0 - 0.9 || origin.y > b.y1 + 0.9) continue;
        if (dc > 0.3) { const ang = Math.abs(U.angleDiff(dirYaw, Math.atan2(dx, dz))); if (ang > half + Math.atan2(b.r, Math.max(dc, 0.1))) continue; }
        // line of sight to the rim point facing the attacker (pulled 5 cm inside the rim); a collider that contains the
        // hitbox centre is the target's own body / stand-in (an enemy standing for a prop with its own K.collider — the
        // plinths) and never blocks the swing aimed at it
        if (dc > 0.6) {
          const rr = Math.max(0, b.r - 0.05), tx = b.x - dx / dc * rr, tz = b.z - dz / dc * rr;
          const own = (c) => isEnemyCol(c) || !!Kit.collide(c, b.x, b.z, 0.01);
          if (!los(origin.x, origin.z, tx, tz, { minH: 1.0, y: floorY(origin.x, origin.z, origin.y - 1.1), ignore: own })) continue;
        }
        if (!hit || d < hit.d) hit = { e, d };
      }
      if (hit) out.push(hit);
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((h) => h.e);
  }
  // soft-lock: the nearest enemy roughly in front (a disguised Borrowed is returned so Player can refuse)
  function lockTarget(pos, yaw) {
    if (!pos) return null;
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e.removed || e.resolved || !active(e) || e.hidden || e.lockable === false || e.untouchable) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 7 || Math.abs(e.pos.y - pos.y) > 1.6) continue;
      const ang = d < 0.4 ? 0 : Math.abs(U.angleDiff(yaw, Math.atan2(dx, dz)));
      if (ang > 70 * D2R) continue;
      if (!los(pos.x, pos.z, e.pos.x, e.pos.z, { minH: 1.0, y: pos.y })) continue;
      const s = d + ang * 2.5 + (e.downed || e.knocked ? 3 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  function byType(type) { return list.filter((e) => e.type === type && !e.removed); }
  // 8-1: every freed Tethered of S.freedOrder sits along the road in the order he freed them
  function freedRow(points, o = {}) {
    const ids = (S.freedOrder || []).filter((id) => S.spawns[id] === 'freed');
    if (!ids.length || !points || points.length < 1) return [];
    const segs = [];
    let total = 0;
    for (let i = 0; i + 1 < points.length; i++) { const L = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]); segs.push({ a: points[i], b: points[i + 1], L }); total += L; }
    const out = [];
    ids.forEach((id, k) => {
      let x = points[0][0], z = points[0][1], dir = 0;
      if (segs.length) {
        let s = ids.length === 1 ? total * 0.5 : (k / (ids.length - 1)) * total;
        for (const sg of segs) { if (s <= sg.L || sg === segs[segs.length - 1]) { const t = sg.L ? clamp(s / sg.L) : 0; x = lerp(sg.a[0], sg.b[0], t); z = lerp(sg.a[1], sg.b[1], t); dir = Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]); break; } s -= sg.L; }
      }
      const rot = o.rot !== undefined ? o.rot : U.deg(dir) + (o.face ?? 90);
      const e = spawn({ id, type: 'tethered', pos: [x, z], rot, sit: 'floor', world: o.world || 'both' });
      if (e) out.push(e);
    });
    return out;
  }

  // ---- bus hooks ------------------------------------------------------------------------------------------------------
  Bus.on('room:leave', (id) => { if (ctl) ctl.onLeave(id); reachSaid = reachSaid.size > 12 ? new Set() : reachSaid; });
  Bus.on('outage', () => Nav.invalidate());
  Bus.on('death', () => { if (hasPlayer()) Player.lock('standard', false); Voice.clear(); standard.stop(); });
  // a loaded save or a new chapter starts clean: the chapter's own scripts restart the Standard where the story needs it
  Bus.on('load', () => standard.stop());
  Bus.on('chapter', () => { standard.stop(); lastTethVoice = -Infinity; });

  const api = {
    spawn, update, clear, get: (id) => byId.get(id) || null, byType, nearestThreat, hitTest, lockTarget, defineType,
    cutFree: (e) => (e && e.canCutFree ? cutFreeEnemy(e) : false), kill: (e, how = 'dead') => (e ? resolve(e, how) : false),
    freedRow, visible, standard,
    path: (ax, az, bx, bz, o) => Nav.path(ax, az, bx, bz, o || {}),
    say: (text, style = 'distort', dur) => Voice.say(text, style, dur),
    clipboard: (e, up) => standardClipboard(e, up),
    get list() { return list; },
    get types() { return TYPES; },
    get paused() { return isPaused(); },
    get nav() { return Nav.grid; },
  };
  return api;
})();
