// ==== engine/05_kit.js — the room builder K, structural kit, prop registry, RoomBuild (ARCHITECTURE §5) ====
// Kit.build(roomDef) runs def.build(K) with a fresh K bound to that build and returns a RoomBuild (plain data +
// one THREE.Group). Kit only CONSTRUCTS; World owns runtime behaviour (collision, triggers, doors, Outage toggling).
//
// Conventions (binding for content):
//   * metres, Y up, angles in DEGREES; yaw 0 faces +Z, yaw 90 faces +X (object.rotation.y = rad(yaw)).
//   * compass: −Z is north, +Z south, −X west, +X east (matches the map xform with rot 0: map y grows downward).
//   * `y` arguments default to the floor height at (x,z) (from the floor regions built so far). K.box / K.cyl / K.stairs
//     take y as the BOTTOM; K.sphere / K.plane / K.sign / K.writing take y as the CENTRE. K.wall/K.floor/K.roomBox
//     take opts.y (default 0). Ramp heights (floors, stairs, roads) are absolute.
//   * Every creator takes opts.world 'fog'|'outage'|'both'; K.fogOnly(fn) / K.outageOnly(fn) tag everything inside fn
//     (meshes, colliders, lights, interactables, triggers, exits, floors).
//   * Static geometry is merged per material at the end of the build (walls, floors, stairs, roads, frames, and
//     K.box/cyl/sphere/plane calls made at room level). Give a creator {name} (→ RoomBuild.objs[name]) or
//     {static:false} if you keep a reference to change it later; K.obj(name, o) also keeps an object out of merging.
//   * Prop builders (Kit.defineProp) work in prop-local space: origin at the floor centre, facing +Z. Inside a builder
//     K.box/K.collider/K.light/K.examine … are transformed to the prop's placement automatically; K.group is the
//     prop's own group (K.root is always the room group). A builder that adds no collider gets the default rule.
//   * K.examine with a string[] shows ONE line per press, in order, then repeats the last (progress in S.done).
//   * K.wall's "front" (the face kept with both:false) is the right-hand side walking from (x0,z0) to (x1,z1).
//     K.roomBox sides: n = z0 edge, s = z1, w = x0, e = x1; `at` is measured from x0 (n/s) or z0 (w/e).
// Collider records: {x0,z0,x1,z1 (enclosing AABB), y (bottom, CONTRACT+), h (height above y), world,
//   obb:null|{cx,cz,hw,hd,rot (deg), cos, sin}, blocker, soft, name, enabled, door}. For an OBB, a room point (x,z)
//   in local box coords is lx = (x-cx)*cos - (z-cz)*sin, lz = (x-cx)*sin + (z-cz)*cos; inside if |lx|≤hw && |lz|≤hd.
// Floor records: {x0<x1, z0<z1, y, ramp:null|{axis, y0 (at the min coordinate), y1 (at the max)}, world}.
//
// CONTRACT+ (beyond ARCHITECTURE §5; all documented again at their definitions):
//   K.road(x0,z0,x1,z1,{axis,markings,kerb,kerbH,footpath,sides,slope,y,mat,pathMat,caps}) — bitumen + gutters + kerbs +
//     footpaths with ramp height regions.  K.writing(text,x,y,z,w,{rotY,style:'marker'|'receipt',world,faded,tilt}) —
//     wall writing (Fog: faded marker scrawl; Outage: thick black marker / printed receipt strips).
//   K.world(w, fn), K.animate(fn(dt,t)), K.heightAt(x,z), K.mat(spec), K.id(local) → '<room>:<local>', K.root, K.build.
//   K.drop(…,{side}) (edge the road meets; inferred), K.door({hinge:'left'|'right', swing:±1, open:0..1|bool, chain,
//     reader:'card'|'keypad'|'maglock', sign, signBack, color, window:false, depth, maxAngle}),
//   K.pickup(…,{rot, scale, glint, extraOnEasy}), K.doc(…,{wall, rot, glint, color}) (glint: opt-in, true|size — a
//     sparkle only where the torch / a lamp lights the item), K.sticker(…,{pitch, size}),
//   K.payphone(…,{own:true}), K.breakTable(…,{time:[h,m], clock:[x,y,z,rot]|false, own}), K.npc(…,{rig, y, whenTalk}),
//   K.light(…,{name, on:false, rot, len, fixture, diffuser, halo, size, duty, phase, target, angle}),
//   K.prop(…,{static, interact, examineId}); K.stairs(…,{rail, nosing, solid:false, bottom}); K.wall openings
//   {glass, frame, frameMat} + opts {grime, skirting, collideH}; K.floor {skirt, base}.
//   Kit.defineProp(kind, builder, {collide, h, static}); Kit.preload(onProgress) → Promise (boot); Kit.clock([h,m]);
//   Kit.itemModel(item); Kit.floorAt(floors,x,z,outage,refY?) (refY: stacked floors); Kit.floorLayers(floors,x,z,outage);
//   Kit.collide(collider,x,z,r) → push-out {x,z}|null;
//   (maintenance CONTRACT+: K.walkable / K.floor {visible:false}, K.prop pitch/tilt, K.light prio/pin/haloColor/haloFog,
//   y bands on K.exit/K.trigger/interactables, interactable prio / crawl, K.plane double = two faces, K.door hinge
//   'L'|'R' / swing 'front'|'back', both:false walls have no top cap, the light-cluster warning counts real lights.)
//   Kit.inBox(box,x,z); Kit.matchWorld(w,outage); Kit.mergeGeometries(items); Kit.mat(spec); Kit.last; Kit.tex.*.
//   RoomBuild: applyWorld(outage) (tagged visibility + light world state), heightAt(x,z,outage), ambient
//     ({color,intensity}|null from K.ambient — apply with Render.setAmbient), stats, disposed.
//   Door records: setOpen(0..1) (visual only; World toggles collider.enabled), amount, pivots[], passAt, hinge, swing.
//   Light handles: setWorld(bool), set(opts), light (the physical THREE light while this light holds one of Render's
//     slots — nearest-first, see Render), free(), name. A real light keeps one virtual pool handle for its life.
//   Clock: userData.setTime(h,m,s), addMinutes(n, dur), time, running, tick(dt).
const Kit = (() => {
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const rad = (d) => (d || 0) * D2R;
  const UP = new THREE.Vector3(0, 1, 0);
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const matchWorld = (w, outage) => !w || w === 'both' || (w === 'outage') === !!outage;
  const normBox = (b) => [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
  const builtins = () => (typeof Script !== 'undefined' && Script && Script.builtins) || null;
  const sfx = (name, o) => { try { if (typeof Snd !== 'undefined' && Snd && Snd.play) Snd.play(name, o); } catch (e) { /* audio not ready */ } };
  const warnOnce = (() => { const seen = new Set(); return (k, msg) => { if (!seen.has(k)) { seen.add(k); console.warn(msg); } }; })();

  // ---------------------------------------------------------------------------------------------------------------
  // Geometry: a tiny indexed builder with world-scaled UVs (u,v in texture tiles = metres / Tex.size(name))
  // ---------------------------------------------------------------------------------------------------------------
  class GB {
    constructor() { this.p = []; this.n = []; this.t = []; this.c = null; this.i = []; this.vc = 0; }
    v(x, y, z, nx, ny, nz, u, w) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.t.push(u, w); return this.vc++; }
    // a, b, c, d counter-clockwise seen from the front; uv = [u0,v0, u1,v1, u2,v2, u3,v3]
    quad(a, b, c, d, n, uv) {
      const i0 = this.v(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1]);
      this.v(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[3]);
      this.v(c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5]);
      this.v(d[0], d[1], d[2], n[0], n[1], n[2], uv[6], uv[7]);
      this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
    // quad with the normal computed from the corners (for ramps and slanted pieces)
    quadN(a, b, c, d, uv) {
      _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _v2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _v.cross(_v2).normalize();
      this.quad(a, b, c, d, [_v.x, _v.y, _v.z], uv);
    }
    // axis-aligned box; s = uv scale (0 → 0..1 per face); o.skip = {px,nx,py,ny,pz,nz}; o.u0/o.v0 offset world UVs
    box(x0, y0, z0, x1, y1, z1, s = 0, o = {}) {
      const sk = o.skip || {}, u0 = o.u0 || 0, v0 = o.v0 || 0;
      const U2 = (a0, a1, b0, b1) => (s ? [a0 * s + u0, b0 * s + v0, a1 * s + u0, b0 * s + v0, a1 * s + u0, b1 * s + v0, a0 * s + u0, b1 * s + v0] : [0, 0, 1, 0, 1, 1, 0, 1]);
      if (!sk.pz) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U2(x0, x1, y0, y1));
      if (!sk.nz) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U2(-x1, -x0, y0, y1));
      if (!sk.px) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], U2(-z1, -z0, y0, y1));
      if (!sk.nx) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], U2(z0, z1, y0, y1));
      if (!sk.py) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], U2(x0, x1, -z1, -z0));
      if (!sk.ny) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], U2(x0, x1, z0, z1));
    }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
      if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4));
      g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      g.computeBoundingSphere();
      return g;
    }
  }
  // quad whose winding is fixed up so its normal faces `want` ([x,y,z])
  function quadFacing(gb, a, b, c, d, uv, want) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _v2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _v.cross(_v2);
    if (_v.x * want[0] + _v.y * want[1] + _v.z * want[2] < 0) gb.quadN(d, c, b, a, [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
    else gb.quadN(a, b, c, d, uv);
  }
  const kitMats = new Map();
  const cachedMat = (key, fn) => { let m = kitMats.get(key); if (!m) { m = fn(); m.userData.shared = true; kitMats.set(key, m); } return m; };
  const geoCache = new Map();
  const cachedGeo = (key, fn) => { let g = geoCache.get(key); if (!g) { g = fn(); g.userData.shared = true; geoCache.set(key, g); } return g; };
  const q3 = (v) => Math.round(v * 1000) / 1000;
  // box centred on x/z, bottom at y=0
  function boxGeo(sx, sy, sz, s = 0) {
    return cachedGeo(`box|${q3(sx)}|${q3(sy)}|${q3(sz)}|${q3(s)}`, () => { const b = new GB(); b.box(-sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, s); return b.geo(); });
  }
  // cylinder (rb bottom radius, rt top radius), bottom at y=0; world UVs when s > 0
  function cylGeo(rb, rt, h, seg = 12, s = 0, open = false) {
    return cachedGeo(`cyl|${q3(rb)}|${q3(rt)}|${q3(h)}|${seg}|${q3(s)}|${open ? 1 : 0}`, () => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
      g.translate(0, h / 2, 0);
      if (s) {
        const uv = g.attributes.uv, side = (seg + 1) * 2, circ = Math.PI * (rb + rt);
        for (let i = 0; i < uv.count; i++) {
          if (i < side) uv.setXY(i, uv.getX(i) * circ * s, uv.getY(i) * h * s);
          else uv.setXY(i, uv.getX(i) * 2 * Math.max(rb, rt) * s, uv.getY(i) * 2 * Math.max(rb, rt) * s);
        }
      }
      g.clearGroups();
      return g;
    });
  }
  function sphereGeo(r, seg = 12, s = 0) {
    return cachedGeo(`sph|${q3(r)}|${seg}|${q3(s)}`, () => {
      const g = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.66)));
      if (s) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r * s, uv.getY(i) * Math.PI * r * s); }
      return g;
    });
  }
  function planeGeo(w, h, su = 0, sv = 0) {
    return cachedGeo(`pl|${q3(w)}|${q3(h)}|${q3(su)}|${q3(sv)}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      if (su) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * su, uv.getY(i) * h * (sv || su)); }
      return g;
    });
  }
  // a double-sided plane as two back-to-back faces with the same UVs: a texture (text) reads the right way round from
  // both sides and each face is lit with its own normal (a DoubleSide material would mirror it from behind)
  function planeGeo2(w, h, su = 0, sv = 0) {
    return cachedGeo(`pl2|${q3(w)}|${q3(h)}|${q3(su)}|${q3(sv)}`, () => {
      const a = planeGeo(w, h, su, sv), I = new THREE.Matrix4();
      return mergeGeometries([{ geo: a, m: I }, { geo: a, m: new THREE.Matrix4().makeRotationY(Math.PI) }]);
    });
  }
  // tube along a list of points (CatmullRom)
  function tubeGeo(pts, r, seg = 24, radial = 5, closed = false) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), closed, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, seg, r, radial, closed);
  }

  // Merge geometries (indexed or not) into one indexed geometry, baking each item's matrix. items: [{geo, m}]
  function mergeGeometries(items, withColor = false) {
    let nv = 0, ni = 0;
    for (const it of items) { const pc = it.geo.attributes.position.count; nv += pc; ni += it.geo.index ? it.geo.index.count : pc; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), T = new Float32Array(nv * 2), C = withColor ? new Float32Array(nv * 4) : null;
    const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3(), v = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const { geo, m, tint, uvRect } of items) {
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index;
      const col = tint ? null : geo.attributes.color;   // tint: the item's material colour baked into vertex colours
      const [ru0, rv0, ru1, rv1] = uvRect || [0, 0, 1, 1];     // uvRect: the item's rectangle in a label atlas
      nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const k = (vo + i) * 3; P[k] = v.x; P[k + 1] = v.y; P[k + 2] = v.z;
        if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        N[k] = v.x; N[k + 1] = v.y; N[k + 2] = v.z;
        if (uv) {
          if (uvRect) { T[(vo + i) * 2] = ru0 + U.clamp(uv.getX(i)) * (ru1 - ru0); T[(vo + i) * 2 + 1] = rv0 + U.clamp(uv.getY(i)) * (rv1 - rv0); }
          else { T[(vo + i) * 2] = uv.getX(i); T[(vo + i) * 2 + 1] = uv.getY(i); }
        }
        if (C) {
          const c4 = (vo + i) * 4;
          if (tint) { C[c4] = tint.r; C[c4 + 1] = tint.g; C[c4 + 2] = tint.b; C[c4 + 3] = 1; }
          else if (col) { C[c4] = col.getX(i); C[c4 + 1] = col.getY(i); C[c4 + 2] = col.getZ(i); C[c4 + 3] = col.itemSize > 3 ? col.getW(i) : 1; } else { C[c4] = C[c4 + 1] = C[c4 + 2] = C[c4 + 3] = 1; }
        }
      }
      const n = idx ? idx.count : pos.count;
      for (let k = 0; k + 2 < n; k += 3) {
        const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2;
        I[io++] = vo + a;
        if (flip) { I[io++] = vo + c; I[io++] = vo + b; } else { I[io++] = vo + b; I[io++] = vo + c; }
      }
      vo += pos.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(T, 2));
    if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 4));
    g.setIndex(new THREE.BufferAttribute(io < I.length ? I.slice(0, io) : I, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Materials. A spec is: 'texname' (Tex kit material, world UVs) | '#rrggbb' | 0xrrggbb | THREE.Material |
  // THREE.Texture | { tex:'metal', color, roughness, metalness, uv (scale), …Tex.mat opts } | { color, … } (plain).
  // ---------------------------------------------------------------------------------------------------------------
  const colorMats = new Map();
  function colorMat(c, o = {}) {
    const col = new THREE.Color(c);
    const key = col.getHexString() + '|' + (o.roughness ?? 0.8) + '|' + (o.metalness ?? 0) + '|' + (o.emissive ?? '') + '|' + (o.emissiveIntensity ?? '') + '|' + (o.transparent ? o.opacity ?? 1 : '') + '|' + (o.side ?? '') + '|' + (o.outage ?? '');
    let m = colorMats.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: col, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0 });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; m.depthWrite = false; }
    if (o.side === 'double') m.side = THREE.DoubleSide;
    if (o.outage !== false) Tex.outageify(m, 'self');
    m.name = 'col#' + col.getHexString();
    m.userData.shared = true;
    colorMats.set(key, m);
    return m;
  }
  // material for a texture (signs, posters, screens, canvas decals); cached per texture + options
  const texMats = new WeakMap();
  function texMat(tex, o = {}) {
    let per = texMats.get(tex);
    if (!per) { per = new Map(); texMats.set(tex, per); }
    const key = `${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.transparent ?? ''}|${o.opacity ?? ''}|${o.double ?? ''}|${o.alphaTest ?? ''}|${o.roughness ?? ''}|${o.metalness ?? ''}|${o.outage ?? ''}|${o.color ?? ''}|${o.depthWrite ?? ''}|${o.offset ?? ''}`;
    let m = per.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.roughness ?? 0.82, metalness: o.metalness ?? 0, color: new THREE.Color(o.color ?? 0xffffff) });
    if (o.transparent) { m.transparent = true; m.depthWrite = o.depthWrite ?? false; }
    if (o.opacity !== undefined) { m.opacity = o.opacity; m.transparent = true; }
    if (o.alphaTest) m.alphaTest = o.alphaTest;
    if (o.double) m.side = THREE.DoubleSide;
    if (o.emissive) {
      // emissive: true | intensity (number ≤ 10) | colour ('#rrggbb' or 0xrrggbb)
      const asIntensity = typeof o.emissive === 'number' && o.emissive <= 10;
      m.emissive = new THREE.Color(o.emissive === true || asIntensity ? 0xffffff : o.emissive);
      m.emissiveMap = tex;
      m.emissiveIntensity = o.emissiveIntensity ?? (asIntensity ? o.emissive : 1);
    }
    if (o.offset !== false) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
    if (o.outage !== false && !o.emissive) Tex.outageify(m, 'self');
    m.name = 'tex:' + (tex.name || 'canvas');
    m.userData.shared = !!(tex.userData && tex.userData.shared);
    per.set(key, m);
    return m;
  }
  // → { mat, s } where s is the UV scale for world-mapped geometry (0 = per-face 0..1)
  function resolveMat(spec, fallback = 'plaster') {
    if (spec === undefined || spec === null || spec === true) spec = fallback;
    if (spec.isMaterial) { const sz = spec.map && spec.map.userData && spec.map.userData.size; return { mat: spec, s: sz ? 1 / sz : 0 }; }
    if (spec.isTexture) return { mat: texMat(spec), s: 0 };
    if (typeof spec === 'number') return { mat: colorMat(spec), s: 0 };
    if (typeof spec === 'string') {
      if (spec[0] === '#') return { mat: colorMat(spec), s: 0 };
      return { mat: Tex.mat(spec), s: 1 / Tex.size(spec) };
    }
    if (typeof spec === 'object') {
      const { tex, uv, ...rest } = spec;
      if (!tex) return { mat: colorMat(rest.color ?? '#808080', rest), s: 0 };
      if (tex.isTexture) return { mat: texMat(tex, rest), s: 0 };
      return { mat: Tex.mat(tex, rest), s: (uv ?? 1) / Tex.size(tex) };
    }
    return resolveMat(fallback);
  }
  // shared palette used by the structural pieces
  const PAL = {
    alu: { tex: 'metal', color: '#c3c8c6', roughness: 0.38, metalness: 0.65 },
    steel: { tex: 'metal', color: '#8d9594' },
    steelDark: { tex: 'metal', color: '#4c5553' },
    galv: { tex: 'metal', color: '#a4aba6', roughness: 0.55 },
    rust: 'metal_rust',
    chrome: { tex: 'metal', color: '#d9dcdc', roughness: 0.22, metalness: 0.9 },
    black: '#161819', rubber: '#1b1c1c', white: '#dedbd2',
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Kit-owned Canvas2D textures (shared, generated on first use, never disposed)
  // ---------------------------------------------------------------------------------------------------------------
  const kitTex = new Map();
  function canvasTex(key, w, h, draw, o = {}) {
    let t = kitTex.get(key);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); // CPU-backed: pixel passes without GPU readback
    draw(ctx, w, h, U.rng(U.hash(key)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.name = 'kit:' + key;
    t.userData.shared = true;
    if (o.size) t.userData.size = o.size;
    kitTex.set(key, t);
    return t;
  }
  const F = Tex.fonts, tu = Tex.util;
  const fnoise = (ctx, w, h, r, amt, col = '0,0,0', n = 400, sz = 3) => { for (let k = 0; k < n; k++) { ctx.fillStyle = `rgba(${col},${(r() * amt).toFixed(3)})`; const s = 1 + r() * sz; ctx.fillRect(r() * w, r() * h, s, s); } };
  // wired safety glass: faint green tint, 13 mm wire mesh, smudges. One tile = 0.5 m.
  const wiredGlassTex = () => canvasTex('wiredglass', 256, 256, (ctx, w, h, r) => {
    ctx.fillStyle = 'rgba(150,172,164,0.34)'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) { const g = ctx.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 20 + r() * 50); g.addColorStop(0, 'rgba(210,214,206,0.16)'); g.addColorStop(1, 'rgba(210,214,206,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    const p = w / 38;
    ctx.strokeStyle = 'rgba(58,60,56,0.85)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 38; i++) { ctx.beginPath(); ctx.moveTo(i * p + 0.5, 0); ctx.lineTo(i * p + 0.5, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * p + 0.5); ctx.lineTo(w, i * p + 0.5); ctx.stroke(); }
    fnoise(ctx, w, h, r, 0.35, '220,220,210', 300, 2);
  }, { wrap: true, size: 0.5 });
  // diagonal barrier stripes (red/white or yellow/black), weathered. One tile = 1 m along the board.
  const stripeTex = (a = '#b8261c', b = '#e7e2d6') => canvasTex('stripes' + a + b, 256, 32, (ctx, w, h, r) => {
    ctx.fillStyle = b; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a;
    for (let x = -h; x < w + h; x += 64) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
    ctx.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 60; k++) { ctx.fillStyle = `rgba(90,80,64,${0.1 + r() * 0.25})`; ctx.fillRect(r() * w, r() * h, 3 + r() * 18, 1 + r() * 3); }
    ctx.globalCompositeOperation = 'source-over';
    fnoise(ctx, w, h, r, 0.3, '255,255,250', 120, 2);
    ctx.fillStyle = 'rgba(30,26,20,0.35)'; ctx.fillRect(0, h - 3, w, 3);
  }, { wrap: true, size: 1 });
  // grime band for wall bases: dirt rising from the floor, splash marks, a tide line, the odd drip. 2 m × 1 m tile.
  const wallBaseTex = () => canvasTex('wallbase', 512, 256, (ctx, w, h, r) => {
    ctx.clearRect(0, 0, w, h);
    const n = tu.fbm(w, 8, r, { cells: 8, cy: 1, oct: 3 }); // row 0 = a periodic 1D profile
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    const fb = tu.fbm(w, h, r, { cells: 6, oct: 4 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const up = (h - y) / h; // 0 at the floor
      const reach = 0.16 + n[x] * 0.3;
      let a = Math.max(0, 1 - up / reach) * (0.55 + fb[y * w + x] * 0.45);
      const tide = Math.abs(up - reach) < 0.012 ? 0.3 : 0;
      a = Math.min(0.9, Math.pow(a, 1.4) + tide);
      const i = (y * w + x) * 4; d[i] = 44; d[i + 1] = 38; d[i + 2] = 30; d[i + 3] = a * 255;
    }
    ctx.putImageData(id, 0, 0);
    for (let k = 0; k < 90; k++) { ctx.fillStyle = `rgba(36,30,24,${0.08 + r() * 0.2})`; const x = r() * w, y = h - r() * h * 0.35; ctx.beginPath(); ctx.ellipse(x, y, 1 + r() * 4, 1 + r() * 3, 0, 0, TAU); ctx.fill(); }
    for (let k = 0; k < 10; k++) { const x = r() * w, y0 = h * (0.1 + r() * 0.5), L = h * (0.1 + r() * 0.35); const g = ctx.createLinearGradient(0, y0, 0, y0 + L); g.addColorStop(0, 'rgba(60,50,36,0)'); g.addColorStop(0.3, `rgba(60,50,36,${0.15 + r() * 0.2})`); g.addColorStop(1, 'rgba(60,50,36,0)'); ctx.fillStyle = g; ctx.fillRect(x, y0, 1.5 + r() * 2.5, L); }
    for (let k = 0; k < 16; k++) { ctx.strokeStyle = `rgba(30,28,26,${0.1 + r() * 0.2})`; ctx.lineWidth = 1 + r() * 2; const x = r() * w, y = h - 8 - r() * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + r() * 40, y + (r() - 0.5) * 6); ctx.stroke(); }
    // wrap the left/right edges so the band tiles
    const edge = ctx.getImageData(0, 0, 24, h); ctx.globalAlpha = 0.5; ctx.putImageData(edge, w - 24, 0); ctx.globalAlpha = 1;
  }, { wrap: true, size: 2 });
  // road marking: faded worn dashes (tile = 6 m along the road: 3 m dash, 3 m gap) or a solid line
  const markTex = (kind) => canvasTex('mark_' + kind, 32, 512, (ctx, w, h, r) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(222,220,208,0.92)';
    if (kind === 'dash') ctx.fillRect(0, 0, w, h / 2); else ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    const n = tu.fbm(w, h, r, { cells: 4, cy: 32, oct: 4 });
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    for (let p = 0; p < w * h; p++) d[p * 4 + 3] *= clamp((n[p] - 0.3) * 2.2, 0, 1) * (0.6 + r() * 0.4);
    ctx.putImageData(id, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }, { wrap: true, size: 6 });
  // roller shutter slats: galvanised corrugation, grime and rust runs. 1 m tile.
  const shutterTex = () => canvasTex('shutter', 256, 256, (ctx, w, h, r) => {
    const n = 13, sh = h / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(0, i * sh, 0, (i + 1) * sh);
      g.addColorStop(0, '#9aa09c'); g.addColorStop(0.25, '#c3c7c2'); g.addColorStop(0.6, '#8b918d'); g.addColorStop(0.92, '#5d625f'); g.addColorStop(1, '#3a3e3c');
      ctx.fillStyle = g; ctx.fillRect(0, i * sh, w, sh);
    }
    tu.modulate(ctx, w, h, tu.fbm(w, h, r, { cells: 3, oct: 4 }), 0.25);
    for (let k = 0; k < 9; k++) { const x = r() * w, L = h * (0.2 + r() * 0.6), y = r() * h * 0.4; const g = ctx.createLinearGradient(0, y, 0, y + L); g.addColorStop(0, 'rgba(120,70,36,0.35)'); g.addColorStop(1, 'rgba(120,70,36,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, 2 + r() * 4, L); }
    const g2 = ctx.createLinearGradient(0, h * 0.6, 0, h); g2.addColorStop(0, 'rgba(40,34,26,0)'); g2.addColorStop(1, 'rgba(40,34,26,0.35)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
    fnoise(ctx, w, h, r, 0.3, '30,28,24', 500, 2);
  }, { wrap: true, size: 1 });
  // fog curtain: opaque luminous fog at the bottom fading to nothing at the top, with vertical wisps
  const curtainTex = () => canvasTex('fogcurtain', 128, 256, (ctx, w, h, r) => {
    const n = tu.fbm(w, h, r, { cells: 4, cy: 3, oct: 4 });
    const id = ctx.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = y / h; // 0 top → 1 bottom
      const a = clamp(Math.pow(t, 1.6) * 1.25 + (n[y * w + x] - 0.5) * 0.5 * (1 - Math.abs(t - 0.5) * 1.4), 0, 1);
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
    }
    ctx.putImageData(id, 0, 0);
  }, { wrap: true });
  // a single gum leaf (alpha), tinted per instance
  const leafTex = () => canvasTex('gumleaf', 128, 32, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#d8d2bc';
    ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.quadraticCurveTo(w * 0.35, 1, w - 4, h * 0.55); ctx.quadraticCurveTo(w * 0.4, h - 2, 4, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,80,60,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.quadraticCurveTo(w * 0.4, h * 0.42, w - 4, h * 0.55); ctx.stroke();
  });
  // halo-ish glint (star) for pickups
  const glintTex = () => canvasTex('glint', 64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.7)'); g.addColorStop(0.35, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(w / 2 - 0.75, 4, 1.5, h - 8); ctx.fillRect(4, h / 2 - 0.75, w - 8, 1.5);
  });
  // payphone faceplate: brushed steel, LCD, instruction card, keypad, coin + card slots, coin return
  const phoneFaceTex = () => canvasTex('phoneface', 256, 512, (ctx, w, h, r) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#8e9594'); g.addColorStop(0.5, '#b4bab8'); g.addColorStop(1, '#858c8b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { ctx.fillStyle = `rgba(255,255,255,${(r() * 0.05).toFixed(3)})`; ctx.fillRect(0, y, w, 1); }
    const bevel = (x, y, ww, hh, fill, dark = true) => { ctx.fillStyle = fill; ctx.fillRect(x, y, ww, hh); ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)'; ctx.fillRect(x, y, ww, 2); ctx.fillRect(x, y, 2, hh); ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y + hh - 2, ww, 2); ctx.fillRect(x + ww - 2, y, 2, hh); };
    bevel(28, 34, 150, 52, '#28321f');
    tu.text(ctx, 'LIFT HANDSET', 40, 66, { size: 15, font: F.mono, weight: 'bold', color: 'rgba(120,150,96,0.55)' });
    bevel(196, 30, 34, 64, '#6f7674');
    ctx.fillStyle = '#111'; ctx.fillRect(209, 38, 8, 48);
    tu.text(ctx, '10c 20c 50c $1', 128, 114, { size: 12, font: F.sans, weight: 'bold', color: '#2b2f2f', align: 'center' });
    ctx.fillStyle = '#ecebe4'; ctx.fillRect(22, 126, 212, 82);
    ctx.fillStyle = '#23486b'; ctx.fillRect(22, 126, 212, 20);
    tu.text(ctx, 'PAYPHONE', 128, 142, { size: 15, font: F.sans, weight: 'bold', color: '#f2f2ea', align: 'center', spacing: 3 });
    [['LOCAL CALLS', '50c'], ['EMERGENCY 000', 'FREE'], ['OPERATOR', '1234'], ['FAULTS', '13 22 00']].forEach(([a, b], i) => {
      tu.text(ctx, a, 30, 164 + i * 12, { size: 10, font: F.mono, color: '#2a2a28' }); tu.text(ctx, b, 226, 164 + i * 12, { size: 10, font: F.mono, color: '#2a2a28', align: 'right' });
    });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    keys.forEach((k, i) => {
      const x = 52 + (i % 3) * 56, y = 226 + Math.floor(i / 3) * 50;
      bevel(x, y, 42, 38, '#c9cdcb', false);
      tu.text(ctx, k, x + 21, y + 27, { size: 20, font: F.sans, weight: 'bold', color: '#222', align: 'center' });
    });
    bevel(40, 432, 176, 16, '#5c6361');
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(56, 437, 144, 5);
    tu.text(ctx, 'CARD', 128, 462, { size: 9, font: F.sans, color: '#333', align: 'center' });
    bevel(92, 470, 72, 30, '#2a2d2c');
    tu.text(ctx, 'COIN RETURN', 128, 509, { size: 8, font: F.sans, color: '#333', align: 'center' });
    for (let k = 0; k < 6; k++) { const x = r() * w, y = r() * h * 0.5, L = 30 + r() * 120, gg = ctx.createLinearGradient(0, y, 0, y + L); gg.addColorStop(0, 'rgba(60,50,40,0)'); gg.addColorStop(0.3, 'rgba(60,50,40,0.18)'); gg.addColorStop(1, 'rgba(60,50,40,0)'); ctx.fillStyle = gg; ctx.fillRect(x, y, 2 + r() * 3, L); }
    tu.age(ctx, w, h, r, 0.8);
  });
  // wall clock face (transparent outside the dial)
  const clockFaceTex = () => canvasTex('clockface', 256, 256, (ctx, w, h, r) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = w / 2 - 2;
    const g = ctx.createRadialGradient(cx - 30, cy - 40, 10, cx, cy, R);
    g.addColorStop(0, '#f4f1e6'); g.addColorStop(1, '#d9d4c3');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU, big = i % 5 === 0, r0 = R * (big ? 0.8 : 0.87), r1 = R * 0.93;
      ctx.strokeStyle = '#1d1d1b'; ctx.lineWidth = big ? 5 : 1.6;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); ctx.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); ctx.stroke();
    }
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * TAU; tu.text(ctx, String(i), cx + Math.sin(a) * R * 0.64, cy - Math.cos(a) * R * 0.64 + 9, { size: 25, font: F.sans, weight: 'bold', color: '#1d1d1b', align: 'center' }); }
    tu.text(ctx, 'QUARTZ', cx, cy + R * 0.36, { size: 10, font: F.sans, color: '#6a665c', align: 'center', spacing: 2 });
    const st = ctx.createRadialGradient(cx + 40, cy + 50, 5, cx + 40, cy + 50, R * 0.6); st.addColorStop(0, 'rgba(150,120,70,0.25)'); st.addColorStop(1, 'rgba(150,120,70,0)');
    ctx.fillStyle = st; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    fnoise(ctx, w, h, r, 0.15, '40,36,30', 200, 2);
  });
  // cheap aging for per-object canvases (no per-pixel passes): edge shading, a water ring, a crease, specks
  function quickAge(ctx, w, h, r, amt = 1) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(70,60,40,${0.3 * amt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sx = r() * w, sy = r() * h, sr = Math.min(w, h) * (0.12 + r() * 0.15);
    ctx.strokeStyle = `rgba(120,96,58,${0.18 * amt})`; ctx.lineWidth = 2 + r() * 3; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(150,120,70,${0.07 * amt})`; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * amt})`; ctx.lineWidth = 1; const cy = h * (0.35 + r() * 0.3);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy + (r() - 0.5) * 8); ctx.stroke();
    fnoise(ctx, w, h, r, 0.25 * amt, '60,50,40', 80, 2);
  }
  // documents: a small, legible-looking sheet per doc (the reading view is Menus' job)
  const DOC_STYLE = {
    lined: { bg: '#efece2', ink: '#1f2c6e', font: 'hand', rule: 'rgba(90,120,180,0.35)' },
    notebook: { bg: '#ece6d4', ink: '#1f2c6e', font: 'hand', rule: 'rgba(90,120,180,0.3)' },
    dotmatrix: { bg: '#eef0e6', ink: '#3a3a36', font: 'mono', bars: true, holes: true },
    email: { bg: '#f1f0ec', ink: '#2a2a2a', font: 'sans', header: '#dcdcd6' },
    laminated: { bg: '#f4f4ef', ink: '#1d1d1d', font: 'sans', header: '#00a8a8' },
    receipt: { bg: '#ebe8df', ink: '#4a4a46', font: 'mono' },
    card: { bg: '#efe7d6', ink: '#2a2340', font: 'hand' },
    sticky: { bg: '#e9d86a', ink: '#1f2c6e', font: 'hand' },
    whiteboard: { bg: '#eef0ee', ink: '#1a3f8a', font: 'marker' },
    plaque: { bg: '#8a7248', ink: '#2b2112', font: 'serif' },
    phone: { bg: '#0b1414', ink: '#39c4b4', font: 'sans' },
    paper: { bg: '#eeebe2', ink: '#2a2a2a', font: 'mono' },
  };
  function docTex(docId, kind) {
    const d = (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[docId]) || null;
    const paper = kind === 'sticky' ? 'sticky' : kind === 'board' ? 'whiteboard' : (d && d.paper) || 'paper';
    const st = DOC_STYLE[paper] || DOC_STYLE.paper;
    const [w, h] = kind === 'sticky' ? [128, 128] : kind === 'board' ? [384, 288] : [192, 272];
    return canvasTex(`doc|${docId}|${kind}|${paper}`, w, h, (ctx, W, H, r) => {
      ctx.fillStyle = st.bg; ctx.fillRect(0, 0, W, H);
      if (st.bars) for (let y = 0; y < H; y += 24) { ctx.fillStyle = 'rgba(120,170,120,0.18)'; ctx.fillRect(0, y, W, 12); }
      if (st.holes) for (let y = 8; y < H; y += 16) { ctx.fillStyle = '#9a9a92'; ctx.beginPath(); ctx.arc(8, y, 3, 0, TAU); ctx.arc(W - 8, y, 3, 0, TAU); ctx.fill(); }
      if (st.header) { ctx.fillStyle = st.header; ctx.fillRect(0, 0, W, H * 0.09); }
      const pad = kind === 'sticky' ? 10 : W * 0.1;
      const txt = d ? [d.title || '', d.text || '', d.hand || ''].filter(Boolean).join('\n') : 'NOTICE\n\n' + 'The quick grey fog rolls over the hill.\n'.repeat(8);
      const hand = st.font === 'hand' || st.font === 'marker';
      const size = kind === 'sticky' ? 13 : kind === 'board' ? 17 : 7;
      const lh = size * (hand ? 1.4 : 1.35);
      if (st.rule) for (let y = pad + lh; y < H - pad; y += lh) { ctx.fillStyle = st.rule; ctx.fillRect(pad * 0.5, y + 3, W - pad, 1); }
      const font = st.font === 'mono' ? F.mono : st.font === 'sans' ? F.sans : st.font === 'serif' ? F.serif : st.font === 'marker' ? F.marker : F.hand;
      ctx.font = `${size}px ${font}`;
      const lines = tu.wrapText(ctx, txt, W - pad * 2).slice(0, Math.floor((H - pad * 2) / lh));
      let y = pad + size + (st.header ? H * 0.06 : 0);
      for (const l of lines) {
        if (hand) Tex.handwriting(ctx, l, pad, y, { size, color: st.ink, font, wobble: 0.8 });
        else tu.text(ctx, l, pad, y, { size, font, color: st.ink, alpha: 0.85 });
        y += lh;
      }
      if (kind === 'board') { ctx.strokeStyle = 'rgba(40,60,120,0.15)'; for (let k = 0; k < 6; k++) { ctx.lineWidth = 8 + r() * 10; ctx.beginPath(); const x = r() * W, yy = r() * H; ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + 60, yy + 20 * (r() - 0.5), x + 140, yy + 10); ctx.stroke(); } }
      quickAge(ctx, W, H, r, kind === 'sticky' ? 0.5 : 1);
    });
  }
  // wall writing: 'fog' = faded marker scrawl; 'marker' = thick black marker; 'receipt' = printed receipt strips
  function writingTex(text, variant) {
    const lines = String(text).split('\n');
    const key = `writing|${variant}|${text}`;
    const cached = kitTex.get(key);
    if (cached) return cached;
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const size = variant === 'receipt' ? 56 : 84;
    const font = variant === 'receipt' ? `bold ${size}px ${F.mono}` : `bold ${size}px ${F.marker}`;
    probe.font = font;
    const tw = Math.max(...lines.map((l) => probe.measureText(l.toUpperCase()).width));
    const W = Math.min(2048, Math.ceil(tw + size * 1.2)), lh = size * (variant === 'receipt' ? 1.9 : 1.25), H = Math.ceil(lines.length * lh + size * 0.9);
    const t = canvasTex(key, W, H, (ctx, w, h, r) => {
      ctx.clearRect(0, 0, w, h);
      lines.forEach((raw, li) => {
        const l = raw.toUpperCase(), y = size * 0.45 + (li + 0.8) * lh;
        if (variant === 'receipt') {
          // one strip per word, pasted edge to edge, slightly askew
          ctx.font = font;
          let x = size * 0.5;
          for (const word of l.split(' ')) {
            const ww = ctx.measureText(word).width + size * 0.7;
            ctx.save(); ctx.translate(x + ww / 2, y - size * 0.35); ctx.rotate((r() - 0.5) * 0.06);
            ctx.fillStyle = '#e9e6dc'; ctx.fillRect(-ww / 2, -lh * 0.48, ww, lh * 0.96);
            ctx.fillStyle = 'rgba(120,110,90,0.2)'; for (let k = 0; k < 6; k++) ctx.fillRect(-ww / 2, -lh * 0.48 + r() * lh, ww, 1);
            ctx.fillStyle = 'rgba(40,40,38,0.35)'; ctx.font = `${Math.round(size * 0.16)}px ${F.mono}`; ctx.fillText('ACCT 4471-0932  TMRW', -ww / 2 + 6, -lh * 0.36);
            ctx.font = font; ctx.fillStyle = 'rgba(28,28,26,0.9)'; ctx.textAlign = 'center'; ctx.fillText(word, 0, size * 0.34);
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(150,140,110,0.25)'; ctx.fillRect(-ww / 2, lh * 0.4, ww, lh * 0.08);
            ctx.restore();
            x += ww + size * 0.08;
          }
        } else {
          const fog = variant === 'fog';
          Tex.handwriting(ctx, l, size * 0.5, y, { size, font: F.marker, weight: 'bold', color: fog ? '#1b1f22' : '#0b0b0b', alpha: fog ? 0.85 : 0.95, wobble: 1.3 });
          if (!fog) Tex.handwriting(ctx, l, size * 0.5 + 3, y + 2, { size, font: F.marker, weight: 'bold', color: '#0b0b0b', alpha: 0.6, wobble: 1.3 });
          // drips under thick marker; the faded scrawl gets scrubbed
          if (!fog) for (let k = 0; k < 5; k++) { ctx.fillStyle = 'rgba(10,10,10,0.7)'; const x = size * 0.5 + r() * tw, L = size * (0.2 + r() * 0.5); ctx.fillRect(x, y + size * 0.1, 3, L); }
        }
      });
      if (variant === 'fog') {
        // someone tried to scrub it off: wide soft erasing strokes and a speckled fade
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        for (let k = 0; k < 26; k++) {
          ctx.strokeStyle = `rgba(0,0,0,${(0.12 + r() * 0.3).toFixed(3)})`; ctx.lineWidth = size * (0.25 + r() * 0.6);
          const x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.3) * size * 4, y + (r() - 0.5) * size * 0.8); ctx.stroke();
        }
        fnoise(ctx, w, h, r, 0.6, '0,0,0', Math.round((w * h) / 90), 3);
        ctx.globalCompositeOperation = 'source-over';
      }
    });
    t.userData.aspect = W / H;
    return t;
  }
  // small printed labels for the generic item models
  const labelTex = (kind) => canvasTex('itemlabel_' + kind, 256, 128, (ctx, w, h, r) => {
    if (kind === 'can') {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1b2f3a'); g.addColorStop(1, '#0f1a20');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e8c21a'; ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.8); ctx.lineTo(w * 0.45, h * 0.2); ctx.lineTo(w * 0.42, h * 0.5); ctx.lineTo(w * 0.62, h * 0.45); ctx.lineTo(w * 0.3, h * 0.95); ctx.lineTo(w * 0.34, h * 0.62); ctx.fill();
      tu.text(ctx, 'SURGE', w * 0.72, h * 0.62, { size: 30, font: F.heavy, weight: '900', color: '#f2f2ea', align: 'center' });
      tu.text(ctx, 'ENERGY', w * 0.72, h * 0.8, { size: 13, font: F.sans, weight: 'bold', color: '#e8c21a', align: 'center', spacing: 3 });
    } else if (kind === 'cup') {
      ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0b6f76'; ctx.fillRect(0, h * 0.36, w, h * 0.3);
      tu.text(ctx, 'BREAK ROOM', w * 0.25, h * 0.57, { size: 18, font: F.sans, weight: 'bold', color: '#f2f2ea', align: 'center' });
      tu.text(ctx, 'BREAK ROOM', w * 0.75, h * 0.57, { size: 18, font: F.sans, weight: 'bold', color: '#f2f2ea', align: 'center' });
    } else if (kind === 'aid') {
      ctx.fillStyle = '#1f6b3c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f1f1ea'; ctx.fillRect(w * 0.5 - 14, h * 0.5 - 40, 28, 80); ctx.fillRect(w * 0.5 - 40, h * 0.5 - 14, 80, 28);
      tu.text(ctx, 'FIRST AID', w * 0.5, h * 0.95, { size: 12, font: F.sans, weight: 'bold', color: '#f1f1ea', align: 'center', spacing: 2 });
    } else if (kind === 'map') {
      ctx.fillStyle = '#e6e0cc'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(60,70,80,0.6)'; ctx.lineWidth = 1;
      for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.moveTo(r() * w, r() * h); ctx.lineTo(r() * w, r() * h); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(180,40,30,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.4, 12, 0, TAU); ctx.stroke();
      for (let x = w / 4; x < w; x += w / 4) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, 0, 2, h); }
      tu.text(ctx, 'SIGNAL HILL', 12, 22, { size: 16, font: F.serif, weight: 'bold', color: '#3a3a36' });
    } else {
      ctx.fillStyle = '#f1efe8'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#00a8a8'; ctx.fillRect(0, 0, w, h * 0.25);
      for (let k = 0; k < 5; k++) { ctx.fillStyle = 'rgba(40,40,40,0.4)'; ctx.fillRect(16, h * 0.38 + k * 14, 60 + r() * 150, 5); }
    }
    tu.age(ctx, w, h, r, 0.5);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Internal part helpers (build meshes under a parent in its local space). Meshes flagged userData.kitMerge are
  // merged per material at the end of the build (only when their whole ancestry is static).
  // ---------------------------------------------------------------------------------------------------------------
  function part(parent, geo, spec, x, y, z, o = {}) {
    const mat = spec && spec.isMaterial ? spec : resolveMat(spec).mat;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.ry || o.rx || o.rz) m.rotation.set(rad(o.rx), rad(o.ry), rad(o.rz), o.order || 'YXZ');
    m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
    if (o.merge) m.userData.kitMerge = true;
    if (o.name) m.name = o.name;
    if (parent) parent.add(m);
    return m;
  }
  function pbox(parent, x, y, z, sx, sy, sz, spec, o = {}) { const r = resolveMat(spec); return part(parent, boxGeo(sx, sy, sz, o.uv === false ? 0 : r.s), r.mat, x, y, z, o); }
  function pcyl(parent, x, y, z, r, h, spec, o = {}) { const rm = resolveMat(spec); return part(parent, cylGeo(r, o.r2 ?? r, h, o.seg ?? 12, o.uv === false ? 0 : rm.s, !!o.open), rm.mat, x, y, z, o); }
  function pplane(parent, x, y, z, w, h, spec, o = {}) { const rm = resolveMat(spec); return part(parent, planeGeo(w, h, o.world ? rm.s : 0), rm.mat, x, y, z, { cast: false, ...o }); }
  const ownClone = (m) => { const c = m.clone(); c.userData = { ...c.userData, shared: false }; return c; };
  const flagMerge = (obj, v = true) => obj.traverse((c) => { if (c.isMesh) c.userData.kitMerge = v; });
  // A named (so movable / scriptable) prop can't join the room's static batches, but its static parts can still be
  // merged per material INSIDE the prop (transforms baked relative to the prop group, which stays movable as one
  // piece). Live parts (kitMerge:false — what the prop's setters move or switch), world-tagged sub-groups, nested
  // non-static props and anything special (transparent, sorted, callbacks) stay as they are. A named hatchback goes
  // from ~47 draw calls to ~15.
  function propMerge(g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), buckets = new Map();
    g.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.userData.kitMerge === false) return;
      if (m.children.length || !m.visible || m.renderOrder || Array.isArray(m.material) || !m.material || !m.geometry) return;
      if (m.material.transparent && m.material.depthWrite !== false) return;
      if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || m.userData.noBounds) return;
      for (let p = m.parent; p && p !== g; p = p.parent) if (!p.visible || p.userData.kitWorld || p.userData.kitNoMerge || p.userData.kitMerge === false) return;
      const geo = m.geometry;
      if (!geo.attributes.position || !geo.attributes.normal || (!geo.index && geo.attributes.position.count % 3)) return;
      const col = !!geo.attributes.color && !!m.material.vertexColors;
      const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${col ? 'c' : ''}`;
      let b = buckets.get(key);
      if (!b) { b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, col, list: [] }; buckets.set(key, b); }
      b.list.push({ mesh: m, geo, m: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
    });
    let n = 0;
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue;
      const mesh = new THREE.Mesh(mergeGeometries(b.list, b.col), b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.userData.ownedGeo = true; mesh.userData.kitMerge = false;
      mesh.name = 'pm:' + (b.mat.name || '');
      g.add(mesh);
      for (const it of b.list) { it.mesh.removeFromParent(); if (!it.geo.userData.shared) it.geo.dispose(); }
      n += b.list.length - 1;
    }
    return n;
  }
  // Merge every mesh under `group` (which moves as one piece: a door leaf, a handset, an item) per material, baking
  // transforms relative to the group. Cuts a door leaf from ~30 draw calls to ~5.
  function localMerge(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), buckets = new Map();
    group.traverse((c) => {
      if (c === group || !c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || Array.isArray(c.material) || c.children.length || c.userData.keep) return;
      if (c.material.transparent && c.material.depthWrite !== false) return;
      const g = c.geometry;
      if (!g || !g.attributes.normal || (!g.index && g.attributes.position.count % 3)) return;
      const key = c.material.uuid + '|' + (c.castShadow ? 1 : 0);
      let b = buckets.get(key);
      if (!b) { b = { mat: c.material, cast: c.castShadow, list: [], merge: c.userData.kitMerge }; buckets.set(key, b); }
      b.list.push({ mesh: c, geo: g, m: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld) });
    });
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue;
      const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.userData.ownedGeo = true; mesh.name = 'lm:' + (b.mat.name || '');
      if (b.merge) mesh.userData.kitMerge = true;
      group.add(mesh);
      for (const it of b.list) { it.mesh.removeFromParent(); if (!it.geo.userData.shared) it.geo.dispose(); }
    }
    return group;
  }
  // A glint (opt-in: K.pickup / K.doc {glint:true|size}): a specular sparkle that only exists where light really falls
  // on the item — the torch sweeping over it, or a lamp close by (Render.lightAt, no ambient, no floor) — so it is
  // invisible in the dark and never works as a floating marker (spec §2A: no floating icons; the head-turn is the hint).
  const _gp = new THREE.Vector3();
  function makeGlint(parent, y, size = 0.22, strength = 0.9) {
    const m = new THREE.SpriteMaterial({ map: glintTex(), color: 0xfff6e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    const s = new THREE.Sprite(m);
    s.position.set(0, y, 0); s.scale.set(size, size, 1); s.renderOrder = 11; s.name = 'glint';
    s.visible = false;
    const phase = Math.random() * 10, period = 2.2 + Math.random() * 1.4;
    let lit = 0;
    s.userData.tick = (t, dt = 0) => {
      s.getWorldPosition(_gp);
      const L = typeof Render !== 'undefined' && Render.lightAt ? Render.lightAt(_gp) : 0;
      const want = U.clamp((L - 0.12) / 0.8);
      lit = dt > 0 ? U.damp(lit, want, 10, dt) : want;
      const k = ((t + phase) % period) / period;
      const flash = Math.pow(Math.max(0, Math.sin(k * Math.PI)), 10);
      m.opacity = strength * lit * (0.3 + 0.7 * flash);
      s.visible = m.opacity > 0.01;
      const sc = size * (0.6 + 0.6 * flash) * (0.6 + 0.4 * lit); s.scale.set(sc, sc, 1);
      s.material.rotation = t * 0.3;
    };
    parent.add(s);
    return s;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Prop registry (PROPS lives in core). Kit.defineProp(kind, builder(K, opts) → Object3D, meta)
  //   meta: { collide: true|false|'auto'|number (pole radius)|[x0,z0,x1,z1] (local), h, static:true (never changes
  //   after build → merged into the room's static batches) }. CONTRACT+ (third argument).
  // ---------------------------------------------------------------------------------------------------------------
  function defineProp(kind, builder, meta = {}) {
    if (PROPS[kind]) console.warn(`[Kit] prop "${kind}" redefined`);
    PROPS[kind] = { kind, build: builder, collide: meta.collide, h: meta.h, static: !!meta.static };
    return PROPS[kind];
  }
  // Default collide rules for kinds where the bounding-box heuristic is wrong. false = never; number = a pole of
  // that radius at the origin (arms/canopies overhead don't block).
  const COLLIDE_RULES = {
    streetlight: 0.16, power_pole: 0.18, traffic_light: 0.14, floodlight: 0.18, sign_post: 0.08, road_sign: 0.1,
    gum_tree: 0.32, bollard: 0.14, mast: 'auto', iv_stand: 0.2, fluoro_tube: false, cable_tray: false,
    poster: false, drawing: false, mug: false, sandwich: false, keys_ring: false, glasses: false, headset_hanging: false,
    receipt_strip: false, tether_hanging: false, plastic_sheet: false, drop_sheet: false, pendant: false,
    phone_socket: false, tea_towel: false, crossword: false, framed_photo: false, notice_board: false, corkboard: false,
    whiteboard: false, clock: false, box_cutter: false, bar_steel: false, energy_can: false, coffee_cup: false,
    jumper_tool: false, handset: false, card_reader: false, rotary_dial: false, pa_mic: false, desk_phone: false,
    rotary_phone: false, answering_machine: false, modem: false, base_station: false, tablet_box: false, satchel: false,
    desk_lamp: false, monitor: false, crt: false, microwave: false, printer: false, extinguisher: false,
    first_aid_box: false, bench_plaque: false, pansies: false, gnome: false, keys: false, pendant_light: false,
  };
  function autoCollide(bb) {
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, sy = bb.max.y - bb.min.y;
    if (!isFinite(sx) || bb.isEmpty()) return false;
    if (bb.min.y > 1.0) return false;                 // overhead: signs, trays, lights
    if (bb.max.y < 0.22) return false;                // flat on the floor
    if (sy > 1.8 && Math.min(sx, sz) >= 0.08) return true; // poles, posts
    if (Math.min(sx, sz) < 0.12) return false;        // thin: posters, boards on walls
    if (sx * sz < 0.05) return false;                 // small things on the floor
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Fallback crate for unknown prop kinds (neutral taped carton, never magenta)
  // ---------------------------------------------------------------------------------------------------------------
  function crate(parent) {
    const g = new THREE.Group(); g.name = 'crate';
    pbox(g, 0, 0, 0, 0.6, 0.46, 0.44, 'cardboard', { merge: true });
    pbox(g, 0, 0.46, 0, 0.604, 0.004, 0.08, '#a88c5c', { merge: true, cast: false });
    pbox(g, 0.02, 0.462, 0.01, 0.5, 0.01, 0.36, 'cardboard', { merge: true, ry: 3, cast: false });
    if (parent) parent.add(g);
    return g;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Generic pickup models (used when ITEMS[id].model is not defined). Origin at the base, ~real size.
  // ---------------------------------------------------------------------------------------------------------------
  function genericItem(item) {
    const g = new THREE.Group(); g.name = 'item:' + item;
    const id = String(item);
    const def = (typeof ITEMS !== 'undefined' && ITEMS[id]) || {};
    if (/coffee/.test(id)) {
      pcyl(g, 0, 0, 0, 0.034, 0.1, texMat(labelTex('cup'), { offset: false }), { r2: 0.045, seg: 14, uv: false });
      pcyl(g, 0, 0.1, 0, 0.047, 0.012, '#e9e6dc', { seg: 14 });
      pcyl(g, 0, 0.112, 0, 0.038, 0.008, '#d8d4c8', { seg: 14 });
    } else if (/energy/.test(id)) {
      pcyl(g, 0, 0, 0, 0.033, 0.14, texMat(labelTex('can'), { offset: false, roughness: 0.35, metalness: 0.4 }), { seg: 14, uv: false });
      pcyl(g, 0, 0.14, 0, 0.03, 0.008, PAL.chrome, { r2: 0.027, seg: 14 });
    } else if (/first_aid|aid/.test(id)) {
      const lab = texMat(labelTex('aid'), { offset: false });
      pbox(g, 0, 0, 0, 0.3, 0.1, 0.2, '#1f6b3c', { uv: false });
      pplane(g, 0, 0.101, 0, 0.26, 0.17, lab, { rx: -90 });
      pbox(g, 0, 0.1, -0.06, 0.1, 0.02, 0.02, '#d9d6cc');
    } else if (/^r?map_/.test(id) || def.cat === 'map' || def.map) {
      if (/^rmap_/.test(id)) {
        pcyl(g, 0, 0, 0, 0.035, 0.08, { tex: 'receipt' }, { seg: 14 });
        const strip = pbox(g, 0.12, 0, 0.0, 0.2, 0.002, 0.08, { tex: 'receipt' }, { uv: false });
        strip.rotation.z = rad(4);
      } else {
        pbox(g, 0, 0, 0, 0.2, 0.012, 0.28, texMat(labelTex('map'), { offset: false }), { uv: false });
      }
    } else if (/key/.test(id)) {
      pcyl(g, 0, 0.004, 0, 0.018, 0.004, PAL.chrome, { seg: 12, uv: false });
      pbox(g, 0.045, 0.002, 0, 0.06, 0.004, 0.012, { tex: 'metal', color: '#c9b36a', metalness: 0.8, roughness: 0.3 });
      pbox(g, -0.05, 0.001, 0.01, 0.06, 0.002, 0.03, texMat(Tex.label(def.tag || (def.name || 'KEY'), { style: 'tag' }), { offset: false }), { uv: false });
    } else if (/cutter/.test(id)) {
      pbox(g, 0, 0, 0, 0.14, 0.018, 0.026, '#d8b01e', { uv: false });
      pbox(g, 0.08, 0.004, 0.004, 0.03, 0.006, 0.012, PAL.chrome, { uv: false });
    } else if (/bar/.test(id)) {
      pcyl(g, 0.45, 0.012, 0, 0.012, 0.9, { tex: 'metal', color: '#6f7676' }, { rz: 90, seg: 8 });
    } else if (/extinguisher/.test(id)) {
      pcyl(g, 0, 0, 0, 0.075, 0.46, '#a3231b', { seg: 14 });
      pcyl(g, 0, 0.46, 0, 0.03, 0.06, PAL.black, { seg: 8 });
      pbox(g, 0.03, 0.5, 0, 0.1, 0.012, 0.02, PAL.black);
    } else if (/modem/.test(id)) {
      pbox(g, 0, 0, 0, 0.2, 0.05, 0.16, '#e7e6e0');
      for (let i = 0; i < 4; i++) pbox(g, -0.06 + i * 0.03, 0.05, 0.078, 0.006, 0.004, 0.004, { color: '#3a8a3a', emissive: '#1d6b1d', emissiveIntensity: 0.4, outage: false }, { cast: false });
    } else if (/pendant/.test(id)) {
      pcyl(g, 0, 0, 0, 0.022, 0.012, '#eeeeea', { seg: 16 });
      pcyl(g, 0, 0.012, 0, 0.01, 0.003, '#b3261e', { seg: 12 });
    } else if (/card|pass|badge|certificate|ticket|pin/.test(id)) {
      pbox(g, 0, 0, 0, id === 'certificate' ? 0.21 : 0.086, 0.002, id === 'certificate' ? 0.297 : 0.054, texMat(labelTex('card'), { offset: false }), { uv: false });
    } else {
      pbox(g, 0, 0, 0, 0.16, 0.08, 0.12, 'cardboard', { uv: false });
    }
    return g;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The payphone unit (wall-mounted; also inside the booth). Local: back plate on z=0, facing +Z, origin at the floor.
  // The handset hangs off the hook on its armoured cord and sways a little.
  // ---------------------------------------------------------------------------------------------------------------
  function phoneUnit(parent, x, y, z) {
    const g = new THREE.Group(); g.name = 'payphone_unit'; g.position.set(x, y, z);
    const body = { tex: 'metal', color: '#9ea6a4', roughness: 0.42, metalness: 0.6 };
    pbox(g, 0, 0.82, 0.01, 0.38, 0.98, 0.02, { tex: 'metal', color: '#2f4346' }, { merge: true });
    pbox(g, 0, 1.0, 0.09, 0.31, 0.64, 0.14, body, { merge: true });
    pbox(g, 0, 1.64, 0.1, 0.35, 0.05, 0.19, { tex: 'metal', color: '#2f4346' }, { merge: true });
    pplane(g, 0, 1.32, 0.1605, 0.28, 0.56, texMat(phoneFaceTex(), { offset: false }), { merge: true });
    // the LCD glows faintly
    pplane(g, -0.045, 1.528, 0.1612, 0.16, 0.055, { color: '#32462b', emissive: '#40633a', emissiveIntensity: 0.55, outage: false }, {});
    // empty cradle hook on the left
    pbox(g, -0.178, 1.28, 0.1, 0.045, 0.16, 0.07, body, { merge: true });
    pbox(g, -0.178, 1.44, 0.14, 0.05, 0.02, 0.02, PAL.black, { merge: true });
    // the handset, dangling (pivot at the cord's exit under the unit)
    const piv = new THREE.Group(); piv.name = 'handset_pivot'; piv.position.set(-0.12, 0.99, 0.13);
    g.add(piv);
    const hs = new THREE.Group(); hs.position.set(0.02, -0.36, 0.03); hs.rotation.set(0.12, 0.35, 0.18);
    piv.add(hs);
    const blk = { tex: 'metal', color: '#1b1d1e', roughness: 0.55, metalness: 0.2 };
    pbox(hs, 0, -0.1, 0, 0.042, 0.2, 0.034, blk);
    pbox(hs, 0, -0.13, 0.012, 0.066, 0.07, 0.056, blk);      // earpiece cup (bottom — earpiece down)
    pbox(hs, 0, 0.06, 0.012, 0.062, 0.06, 0.052, blk);       // mouthpiece cup (top — the cord end)
    pcyl(hs, 0, -0.1301, 0.041, 0.022, 0.004, '#0c0c0c', { rx: 90, seg: 10 });
    // armoured cord from the unit to the mouthpiece end
    const cord = tubeGeo([[0, 0, 0], [0.01, -0.08, 0.03], [0.03, -0.18, 0.04], [0.025, -0.25, 0.05], [0.02, -0.28, 0.045]], 0.0075, 20, 5);
    const cm = part(piv, cord, { tex: 'metal', color: '#8d9493', roughness: 0.35, metalness: 0.8 }, 0, 0, 0, { name: 'cord' });
    cm.userData.ownedGeo = true;
    localMerge(piv);
    const ph = Math.random() * 6;
    const sway = (dt, t) => { piv.rotation.z = Math.sin(t * 0.55 + ph) * 0.045; piv.rotation.x = Math.sin(t * 0.37 + ph * 2) * 0.03; };
    if (parent) parent.add(g);
    return { group: g, pivot: piv, sway };
  }
  function phoneBooth(parent) {
    const g = new THREE.Group(); g.name = 'payphone_booth';
    const alu = PAL.alu, panel = { tex: 'metal', color: '#3c5153' };
    for (const [px, pz] of [[-0.56, -0.44], [0.56, -0.44], [-0.56, 0.44], [0.56, 0.44]]) pbox(g, px, 0, pz, 0.05, 2.32, 0.05, alu, { merge: true });
    pbox(g, 0, 0.12, -0.44, 1.1, 2.1, 0.04, panel, { merge: true });
    for (const sx of [-1, 1]) {
      pbox(g, sx * 0.56, 0.42, 0, 0.018, 1.66, 0.84, 'glass', { merge: true, cast: false });
      pbox(g, sx * 0.56, 0.36, 0, 0.04, 0.06, 0.86, alu, { merge: true });
      pbox(g, sx * 0.56, 2.08, 0, 0.04, 0.06, 0.86, alu, { merge: true });
      pbox(g, sx * 0.56, 0.0, 0, 0.05, 0.36, 0.86, panel, { merge: true });
    }
    pbox(g, 0, 2.3, 0.02, 1.26, 0.1, 1.02, { tex: 'metal', color: '#2e3f41' }, { merge: true });
    pplane(g, 0, 2.299, 0.02, 1.0, 0.8, { color: '#6f7a78', roughness: 0.6 }, { rx: 90, merge: true });
    pbox(g, 0, 2.4, 0.02, 1.12, 0.26, 0.14, { tex: 'metal', color: '#1f3a55' }, { merge: true });
    const sign = texMat(Tex.sign('PHONE', { style: 'shop', w: 1.0, h: 0.2, bg: '#1f4b73', fg: '#e8eef0', border: false }), {});
    pplane(g, 0, 2.53, 0.0905, 1.0, 0.2, sign, { merge: true });
    pplane(g, 0, 2.53, -0.0505, 1.0, 0.2, sign, { ry: 180, merge: true });
    pbox(g, 0, 0.92, -0.33, 0.6, 0.03, 0.2, { tex: 'metal', color: '#2f4346' }, { merge: true });
    pbox(g, 0.18, 0.95, -0.34, 0.2, 0.04, 0.14, '#a33b2b', { ry: 6 });           // a directory nobody has opened in years
    const unit = phoneUnit(g, 0, 0, -0.42);
    if (parent) parent.add(g);
    return { group: g, unit };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Wall clock with settable hands. userData.setTime(h, m, s) / addMinutes(n, dur=0) / time → [h, m]. Local: centre
  // at the origin, face toward +Z (hang it on a wall). CONTRACT+ (RoomBuild.objs.clock from K.breakTable).
  // ---------------------------------------------------------------------------------------------------------------
  function makeClock(time = [8, 59]) {
    const g = new THREE.Group(); g.name = 'clock';
    const R = 0.16;
    const rim = part(g, cylGeo(R + 0.012, R + 0.012, 0.045, 28, 0, false), { tex: 'metal', color: '#2a2b2b', roughness: 0.5 }, 0, 0, 0, { rx: 90 });
    rim.position.z = -0.005;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R, 32), texMat(clockFaceTex(), { offset: false, roughness: 0.6 }));
    face.position.z = 0.0405; face.userData.ownedGeo = true; g.add(face);
    const handMat = resolveMat('#151515').mat;
    const mkHand = (len, w, z, mat) => { const p = new THREE.Group(); p.position.z = z; const m = new THREE.Mesh(boxGeo(w, len + 0.02, 0.003), mat); m.position.y = -0.02; p.add(m); g.add(p); return p; };
    const hh = mkHand(R * 0.55, 0.012, 0.043, handMat), mh = mkHand(R * 0.82, 0.008, 0.046, handMat), sh = mkHand(R * 0.86, 0.003, 0.049, resolveMat('#a3231b').mat);
    part(g, cylGeo(0.008, 0.008, 0.006, 10), '#151515', 0, 0, 0.047, { rx: 90, cast: false });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 24), Tex.mat('glass', { opacity: 0.25 }));
    glass.position.z = 0.052; glass.userData.ownedGeo = true; g.add(glass);
    let cur = [time[0] % 12, time[1], time[2] || 0], anim = null;
    const apply = () => {
      const [h, m, s] = cur;
      hh.rotation.z = -((h % 12) + m / 60) / 12 * TAU;
      mh.rotation.z = -(m + s / 60) / 60 * TAU;
      sh.rotation.z = -(s / 60) * TAU;
    };
    const norm = (tm) => { let total = Math.round(tm[0] * 3600 + tm[1] * 60 + (tm[2] || 0)); total = ((total % 43200) + 43200) % 43200; return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]; };
    g.userData.setTime = (h, m = 0, s = 0) => { anim = null; cur = norm([h, m, s]); apply(); };
    g.userData.addMinutes = (n, dur = 0) => {
      const from = cur[0] * 3600 + cur[1] * 60 + cur[2], to = from + n * 60;
      if (!(dur > 0)) { cur = norm([0, 0, to]); apply(); return; }
      anim = { from, to, t: 0, dur };
    };
    Object.defineProperty(g.userData, 'time', { get: () => [cur[0] === 0 ? 12 : cur[0], cur[1]], enumerable: false });
    g.userData.running = false;
    g.userData.tick = (dt) => {
      if (anim) { anim.t = Math.min(1, anim.t + dt / anim.dur); cur = norm([0, 0, U.lerp(anim.from, anim.to, U.ease.inOut(anim.t))]); apply(); if (anim.t >= 1) anim = null; }
      else if (g.userData.running) { cur = norm([cur[0], cur[1], cur[2] + dt]); apply(); }
    };
    apply();
    return g;
  }
  // break table pieces (used when the prop library does not provide table/chair)
  function breakTableSet(parent, r) {
    const g = new THREE.Group(); g.name = 'break_table';
    const lam = { tex: 'metal', color: '#d6d2c6', roughness: 0.55, metalness: 0.05 }, chrome = PAL.chrome;
    pbox(g, 0, 0.72, 0, 1.2, 0.03, 0.8, lam, { merge: true });
    pbox(g, 0, 0.705, 0, 1.18, 0.018, 0.78, '#7b776c', { merge: true, cast: false });
    for (const [sx, sz] of [[-0.54, -0.34], [0.54, -0.34], [-0.54, 0.34], [0.54, 0.34]]) pcyl(g, sx, 0, sz, 0.018, 0.705, chrome, { seg: 8, merge: true });
    const chair = (x, z, ry, tilt = 0) => {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rad(ry);
      const shell = { tex: 'metal', color: '#4d6d6e', roughness: 0.6, metalness: 0.05 };
      pbox(c, 0, 0.44, 0, 0.44, 0.03, 0.42, shell, { merge: true });
      pbox(c, 0, 0.47, -0.2, 0.42, 0.4, 0.03, shell, { merge: true, rx: -8 });
      for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) pcyl(c, lx, 0, lz, 0.011, 0.44, chrome, { seg: 6, merge: true });
      if (tilt) c.rotation.z = rad(tilt);
      g.add(c); return c;
    };
    chair(-0.3, -0.62, 0); chair(0.32, -0.66, 12);
    chair(0.3, 0.64, 180); chair(-0.52, 0.86, 205);
    // leftovers: two mugs, a sugar canister, a folded paper
    const mug = (x, z, col) => { pcyl(g, x, 0.735, z, 0.04, 0.095, col, { seg: 12, merge: true }); pbox(g, x + 0.05, 0.76, z, 0.014, 0.05, 0.01, col, { merge: true }); };
    mug(0.28, 0.1, '#e4e1d6'); mug(-0.36, -0.18, '#2f5d73');
    pcyl(g, -0.05, 0.735, 0.22, 0.05, 0.12, { tex: 'metal', color: '#c8ccca' }, { seg: 12, merge: true });
    pbox(g, 0.05, 0.735, -0.12, 0.3, 0.012, 0.22, { tex: 'paper' }, { merge: true, ry: 18 + r() * 20, cast: false });
    if (parent) parent.add(g);
    return g;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pure helpers for World (CONTRACT+): floor height, circle-vs-collider push-out
  // ---------------------------------------------------------------------------------------------------------------
  function rampY(f, x, z) {
    if (!f.ramp) return f.y;
    const r = f.ramp;
    const t = r.axis === 'x' ? (f.x1 > f.x0 ? (x - f.x0) / (f.x1 - f.x0) : 0) : (f.z1 > f.z0 ? (z - f.z0) / (f.z1 - f.z0) : 0);
    return U.lerp(r.y0, r.y1, clamp(t, 0, 1));
  }
  // floorAt(floors, x, z, outage?, refY?) → y | null. Later entries win; outage undefined = ignore world tags.
  // CONTRACT+ refY (stacked floors — World passes it only for rooms with stackedFloors:true): of the floors at (x,z)
  // the highest one no more than a step (0.5 m) above refY wins; with none that low, the lowest one above.
  const STACK_STEP = 0.5, EPS = 1e-4;
  function floorAt(floors, x, z, outage, refY) {
    const ref = typeof refY === 'number' && isFinite(refY) ? refY : null;
    let best = null, above = null;
    for (let i = floors.length - 1; i >= 0; i--) {
      const f = floors[i];
      if (outage !== undefined && !matchWorld(f.world, outage)) continue;
      if (x < f.x0 - EPS || x > f.x1 + EPS || z < f.z0 - EPS || z > f.z1 + EPS) continue;
      const y = rampY(f, x, z);
      if (ref === null) return y;
      if (y <= ref + STACK_STEP) { if (best === null || y > best + 1e-3) best = y; }
      else if (above === null || y < above) above = y;
    }
    return best !== null ? best : above;
  }
  // CONTRACT+ floorLayers(floors, x, z, outage?) → every distinct floor height at (x, z), low to high (camera checks
  // of stacked rooms)
  function floorLayers(floors, x, z, outage) {
    const ys = [];
    for (const f of floors) {
      if (outage !== undefined && !matchWorld(f.world, outage)) continue;
      if (x < f.x0 - EPS || x > f.x1 + EPS || z < f.z0 - EPS || z > f.z1 + EPS) continue;
      const y = rampY(f, x, z);
      if (!ys.some((v) => Math.abs(v - y) < 0.6)) ys.push(y);
    }
    return ys.sort((a, b) => a - b);
  }
  // lookUpOK(floors, itemPos, x, z, feetY, outage) — an examine up to 5.5 m above the feet at (x, z) is usable ("look up
  // at the clock") when no floor layer lies between the feet and it, under the item or under him (that would make it
  // another level: a balcony, a landing). World.nearestInteractable and the build-time reach check share it.
  function lookUpOK(floors, p, x, z, feet, outage) {
    for (const [fx, fz] of [[p.x, p.z], [x, z]]) {
      for (const y of floorLayers(floors, fx, fz, outage)) if (y > feet + 0.6 && y < p.y + 0.3) return false;
    }
    return true;
  }
  function boxPush(x, z, x0, z0, x1, z1, r) {
    const qx = clamp(x, x0, x1), qz = clamp(z, z0, z1);
    const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 1e-12) { const d = Math.sqrt(d2), k = (r - d) / d; return { x: dx * k, z: dz * k }; }
    const l = x - x0, rr = x1 - x, t = z - z0, b = z1 - z, m = Math.min(l, rr, t, b);
    if (m === l) return { x: -(l + r), z: 0 };
    if (m === rr) return { x: rr + r, z: 0 };
    if (m === t) return { x: 0, z: -(t + r) };
    return { x: 0, z: b + r };
  }
  // collide(c, x, z, r) → {x, z} displacement that pushes a circle out of collider c, or null.
  function collide(c, x, z, r = 0.3) {
    if (!c.obb) return boxPush(x, z, c.x0, c.z0, c.x1, c.z1, r);
    const { cx, cz, hw, hd, cos, sin } = c.obb;
    const dx = x - cx, dz = z - cz;
    const q = boxPush(dx * cos - dz * sin, dx * sin + dz * cos, -hw, -hd, hw, hd, r);
    return q && { x: q.x * cos + q.z * sin, z: -q.x * sin + q.z * cos };
  }
  const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

  // ---------------------------------------------------------------------------------------------------------------
  // Build context
  // ---------------------------------------------------------------------------------------------------------------
  function newCtx(def, detached = false) {
    const group = new THREE.Group();
    group.name = 'room:' + (def.id || 'detached');
    const rb = {
      def, group, colliders: [], floors: [], interactables: [], triggers: [], exits: [], doors: {}, ladders: [], lights: [],
      npcs: {}, marks: {}, regions: {}, objs: {}, tagged: [], animated: [], ambient: null, outage: !!S.outage,
    };
    const seed = U.hash(String(def.id || 'room'));
    return {
      def, rb, group, detached, parent: group, xf: null, xfYaw: 0, xfScale: 1, world: 'both', tagWorld: 'both',
      inProp: 0, propStatic: false, removed: [], walls: [], ids: new Map(), seed, dressN: 0,
      rng: U.rng(seed), irng: U.rng((seed ^ 0x9e3779b9) >>> 0), // K.rng is the content's; Kit's own variety uses irng
    };
  }
  // Minimal fallbacks for partial builds; the real flows are Script.builtins (ARCHITECTURE §11.1).
  async function runBuiltin(name, G, arg) {
    const b = builtins();
    if (b && typeof b[name] === 'function') return b[name](G, arg);
    warnOnce('nobuiltin:' + name, `[Kit] Script.builtins.${name} is missing — using a minimal fallback`);
    const say = (t) => (G && G.msg ? G.msg(t) : console.log('[Kit]', t));
    switch (name) {
      case 'examine': for (const l of arg) { if (G && G.think) await G.think(l); else say(l); } return undefined;
      case 'pickup': {
        S.taken[arg.id] = true;
        if (G && G.give) G.give(arg.item, arg.n || 1, { silent: true });
        const nm = (ITEMS[arg.item] && ITEMS[arg.item].name) || arg.item;
        say(arg.msg || `Aidan picked up the ${String(nm).toLowerCase()}.`);
        return undefined;
      }
      case 'doc': if (!S.docs[arg.docId]) S.docs[arg.docId] = { read: true }; if (G && G.doc) await G.doc(arg.docId, { open: arg.open }); return undefined;
      case 'door': say(arg && arg.locked ? (arg.lockMsg || "It's locked.") : 'Nothing happens.'); return undefined;
      default: say('Nothing happens.'); return undefined;
    }
  }
  const safeWhen = (fn) => { try { return !fn || !!fn(S); } catch (e) { console.error('[Kit] when() failed', e); return false; } };

  function makeK(ctx) {
    const rb = ctx.rb, roomId = String(ctx.def.id || 'room');
    const K = {};
    // ---- context helpers ------------------------------------------------------------------------------------
    const W = (o) => { const w = (o && o.world) || ctx.world; return w === 'fog' || w === 'outage' ? w : 'both'; };
    const tag = (obj, w) => { if (w !== 'both' && w !== ctx.tagWorld) { rb.tagged.push({ obj, world: w }); obj.userData.kitWorld = w; } };
    const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z); if (ctx.xf) v.applyMatrix4(ctx.xf); return v; };
    const boxR = (b) => {
      b = normBox(b);
      if (!ctx.xf) return b;
      const cs = [P(b[0], 0, b[1]), P(b[2], 0, b[1]), P(b[0], 0, b[3]), P(b[2], 0, b[3])];
      return [Math.min(...cs.map((c) => c.x)), Math.min(...cs.map((c) => c.z)), Math.max(...cs.map((c) => c.x)), Math.max(...cs.map((c) => c.z))];
    };
    const H = (x, z) => {
      if (ctx.inProp) return 0;
      for (let i = rb.floors.length - 1; i >= 0; i--) {
        const f = rb.floors[i];
        if (f.world !== 'both' && ctx.world !== 'both' && f.world !== ctx.world) continue;
        if (x >= f.x0 - 1e-4 && x <= f.x1 + 1e-4 && z >= f.z0 - 1e-4 && z <= f.z1 + 1e-4) return rampY(f, x, z);
      }
      return 0;
    };
    const uid = (base) => { const n = ctx.ids.get(base) || 0; ctx.ids.set(base, n + 1); return n ? `${base}#${n + 1}` : base; };
    const autoId = (kind) => uid(`${roomId}:${kind}`);
    const named = (obj, name) => { if (!name) return; obj.name = name; if (!rb.objs[name]) rb.objs[name] = obj; flagMerge(obj, false); };
    const addObj = (obj, o = {}) => { ctx.parent.add(obj); tag(obj, W(o)); named(obj, o.name); return obj; };
    const mergeOK = (o = {}) => (ctx.inProp ? ctx.propStatic && o.static !== false : o.static !== false && !o.name);
    const uvS = (rm, o = {}) => (o.uv === false ? 0 : rm.s * (typeof o.uv === 'number' ? o.uv : 1));
    const yDef = (y, x, z, add = 0) => (y === undefined || y === null ? H(x, z) + add : y);
    // ---- records --------------------------------------------------------------------------------------------
    // collider from a (local) oriented box; o.y = local bottom
    function collRec(cx, cz, hw, hd, rotDeg, o = {}) {
      const p = P(cx, o.y || 0, cz);
      let r = (rotDeg || 0) + ctx.xfYaw;
      hw *= ctx.xfScale; hd *= ctx.xfScale;
      r = ((r % 360) + 360) % 360;
      const q = Math.round(r / 90), axis = Math.abs(r - q * 90) < 0.01;
      let x0, z0, x1, z1, obb = null;
      if (axis) {
        const sw = q % 2 === 1, ex = sw ? hd : hw, ez = sw ? hw : hd;
        x0 = p.x - ex; x1 = p.x + ex; z0 = p.z - ez; z1 = p.z + ez;
      } else {
        const co = Math.cos(rad(r)), si = Math.sin(rad(r));
        const ex = Math.abs(co) * hw + Math.abs(si) * hd, ez = Math.abs(si) * hw + Math.abs(co) * hd;
        x0 = p.x - ex; x1 = p.x + ex; z0 = p.z - ez; z1 = p.z + ez;
        obb = { cx: p.x, cz: p.z, hw, hd, rot: r, cos: co, sin: si };
      }
      const rec = {
        x0, z0, x1, z1, y: p.y, h: (o.h ?? 2.5) * ctx.xfScale, world: o.world || W(o), obb, blocker: o.blocker ?? null, soft: !!o.soft,
        name: o.name || null, enabled: o.enabled ?? true, door: o.door ?? null,
      };
      if (o.mapMark) rec.mapMark = true;                               // blockers: an automatic map X on first contact
      rb.colliders.push(rec);
      return rec;
    }
    function addFloor(x0, z0, x1, z1, y, ramp, world) {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      if (ctx.xf) {
        const b = boxR([x0, z0, x1, z1]), base = P(0, 0, 0).y;
        if (ramp) {
          const dir = P(ramp.axis === 'x' ? 1 : 0, 0, ramp.axis === 'z' ? 1 : 0).sub(P(0, 0, 0));
          const ax = Math.abs(dir.x) > Math.abs(dir.z) ? 'x' : 'z', neg = (ax === 'x' ? dir.x : dir.z) < 0;
          const straight = Math.abs(Math.abs(dir.x) - Math.abs(dir.z)) > 0.5 * dir.length();
          ramp = straight ? { axis: ax, y0: base + (neg ? ramp.y1 : ramp.y0), y1: base + (neg ? ramp.y0 : ramp.y1) } : null;
          if (!ramp) y = base + (y || 0);
        } else y = base + (y || 0);
        [x0, z0, x1, z1] = b;
      }
      const rec = { x0, z0, x1, z1, y: ramp ? Math.min(ramp.y0, ramp.y1) : y, ramp: ramp || null, world };
      rb.floors.push(rec);
      return rec;
    }
    function addInteractable(kind, x, y, z, fn, o = {}, obj = null) {
      const rec = {
        id: o.id || autoId(kind), kind, pos: P(x, y, z), r: o.r ?? 1.2, when: o.when || null, world: W(o), enabled: o.enabled ?? true,
        hold: o.hold || 0, holdText: o.holdText ?? null, look: o.look ?? true, fn, obj, name: o.name || null,
      };
      // CONTRACT+: prio (m added to the pick score; defaults by kind — World.nearestInteractable), yBand [y0,y1] (feet
      // height band: stacked landings), crawl:true (usable while crawling)
      if (o.prio !== undefined) rec.prio = +o.prio || 0;
      const band = bandOf(o);
      if (band) rec.yBand = band;
      if (o.crawl) rec.crawl = true;
      rb.interactables.push(rec);
      return mkHandle(rec, rb.interactables, !!o.ownsObj);
    }
    // remove() takes the record out of its list (and hides/detaches the model only when the interaction owns it:
    // pickups, docs, stickers — never a prop that merely carries an examine)
    function mkHandle(rec, list, ownsObj = false) {
      return {
        id: rec.id, rec, obj: rec.obj || null,
        remove() {
          rec.enabled = false; rec.removed = true;
          const i = list.indexOf(rec); if (i >= 0) list.splice(i, 1);
          if (ownsObj && rec.obj && rec.obj.parent) { rec.obj.visible = false; rec.obj.removeFromParent(); ctx.removed.push(rec.obj); }
        },
        enable(v = true) { rec.enabled = !!v; return this; },
      };
    }
    const dummyHandle = (id) => ({ id, rec: null, obj: null, remove() {}, enable() { return this; } });
    const bandOf = (o) => { const b = o.yBand || (Array.isArray(o.y) ? o.y : null); return b && b.length === 2 ? [Math.min(b[0], b[1]), Math.max(b[0], b[1])] : null; };

    // ---- context / world ------------------------------------------------------------------------------------
    const withWorld = (w, fn) => { const pw = ctx.world; ctx.world = w; try { return fn(K); } finally { ctx.world = pw; } };
    K.fogOnly = (fn) => withWorld('fog', fn);
    K.outageOnly = (fn) => withWorld('outage', fn);
    K.world = (w, fn) => withWorld(w === 'fog' || w === 'outage' ? w : 'both', fn);            // CONTRACT+
    K.animate = (fn) => { rb.animated.push(fn); return fn; };                                   // CONTRACT+
    K.heightAt = (x, z) => H(x, z);                                                             // CONTRACT+
    K.mat = (spec) => resolveMat(spec).mat;                                                     // CONTRACT+
    K.id = (local) => `${roomId}:${local}`;                                                     // CONTRACT+
    Object.defineProperty(K, 'group', { get: () => ctx.parent, enumerable: true });
    Object.defineProperty(K, 'root', { get: () => ctx.group, enumerable: true });               // CONTRACT+
    Object.defineProperty(K, 'S', { get: () => S, enumerable: true });
    K.room = ctx.def;
    K.rng = ctx.rng;
    K.build = rb;                                                                                // CONTRACT+ (read-only use)

    // ---- primitives -----------------------------------------------------------------------------------------
    K.box = (x, y, z, sx, sy, sz, mat, o = {}) => {
      y = yDef(y, x, z);
      const rm = resolveMat(mat, 'plaster');
      const m = part(null, boxGeo(sx, sy, sz, uvS(rm, o)), rm.mat, x, y, z, { ry: o.rot, cast: o.shadow !== false, merge: mergeOK(o) });
      addObj(m, o);
      if (o.collide) collRec(x, z, sx / 2, sz / 2, o.rot || 0, { h: o.h ?? sy, y, world: W(o), name: o.name });
      return m;
    };
    K.cyl = (x, y, z, r, h, mat, o = {}) => {
      y = yDef(y, x, z);
      const rm = resolveMat(mat, 'metal');
      const m = part(null, cylGeo(r, o.r2 ?? r, h, o.seg ?? 12, uvS(rm, o), !!o.open), rm.mat, x, y, z, { ry: o.rot, rx: o.rx, rz: o.rz, cast: o.shadow !== false, merge: mergeOK(o) });
      addObj(m, o);
      if (o.collide) collRec(x, z, Math.max(r, o.r2 ?? r), Math.max(r, o.r2 ?? r), 0, { h: o.h ?? h, y, world: W(o), name: o.name });
      return m;
    };
    K.sphere = (x, y, z, r, mat, o = {}) => {
      y = yDef(y, x, z, r);
      const rm = resolveMat(mat, 'plaster');
      const m = part(null, sphereGeo(r, o.seg ?? 12, uvS(rm, o)), rm.mat, x, y, z, { ry: o.rot, cast: o.shadow !== false, merge: mergeOK(o) });
      if (o.scale) m.scale.set(...(Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]));
      addObj(m, o);
      if (o.collide) collRec(x, z, r, r, 0, { h: o.h ?? r * 2, y: y - r, world: W(o), name: o.name });
      return m;
    };
    // plane: centre at (x,y,z); faces +Z rotated by rot:[rx,ry,rz] (deg) or rotY
    K.plane = (x, y, z, w, h, matOrTex, o = {}) => {
      y = yDef(y, x, z);
      let mat, s = 0;
      // double:true builds two back-to-back faces (planeGeo2) with a one-sided material, so text is never mirrored
      if (matOrTex && matOrTex.isTexture) mat = texMat(matOrTex, { emissive: o.emissive, emissiveIntensity: o.emissiveIntensity, transparent: o.transparent, opacity: o.opacity, alphaTest: o.alphaTest, outage: o.outage, roughness: o.roughness });
      else if (typeof matOrTex === 'string' && matOrTex[0] !== '#' && (o.transparent || o.emissive || o.opacity !== undefined)) {
        mat = Tex.mat(matOrTex, { transparent: o.transparent, opacity: o.opacity, emissive: o.emissive === true ? '#ffffff' : o.emissive, emissiveMap: o.emissive ? true : undefined, emissiveIntensity: o.emissiveIntensity, polygonOffset: true });
        s = 1 / Tex.size(matOrTex);
      } else { const rm = resolveMat(matOrTex, 'paper'); mat = rm.mat; s = rm.s; if (o.double && mat.side === THREE.DoubleSide) { mat = ownClone(mat); mat.side = THREE.FrontSide; } }
      const rot = o.rot || [0, o.rotY || 0, 0];
      const uvs = o.uv === false ? 0 : s * (typeof o.uv === 'number' ? o.uv : 1);
      const m = part(null, o.double ? planeGeo2(w, h, uvs) : planeGeo(w, h, uvs), mat, x, y, z, { rx: rot[0], ry: rot[1], rz: rot[2], cast: !!o.shadow, merge: mergeOK(o) && !o.emissive });
      if (o.renderOrder) m.renderOrder = o.renderOrder;
      addObj(m, o);
      return m;
    };
    // signs: a backing panel + the printed face (Tex.sign); x,y,z = centre of the sign on the wall, facing rotY
    K.sign = (text, x, y, z, w, h, o = {}) => {
      y = yDef(y, x, z, h / 2);
      const style = o.style || 'shop';
      const tex = Tex.sign(text, { style, w, h, bg: o.bg, fg: o.fg, font: o.font, size: o.size, border: o.border, header: o.header, age: o.age, clean: o.clean, seed: o.seed });
      const g = new THREE.Group(); g.name = o.name || 'sign';
      g.position.set(x, y, z); g.rotation.y = rad(o.rotY ?? o.rot ?? 0);
      const depth = o.depth ?? (style === 'street' || style === 'warning' || style === 'council' ? 0.02 : 0.03);
      const back = o.backMat || (style === 'plaque' ? { tex: 'metal', color: '#5a4a30' } : style === 'shop' || style === 'optus' ? { tex: 'metal', color: '#262c2b' } : PAL.galv);
      const mm = mergeOK(o);
      if (o.back !== false) pbox(g, 0, -h / 2 - 0.01, depth / 2, w + 0.02, h + 0.02, depth, back, { merge: mm });
      const fm = texMat(tex, { emissive: o.emissive, emissiveIntensity: o.emissiveIntensity });
      part(g, planeGeo(w, h), fm, 0, 0, depth + 0.0015, { cast: false, merge: mm && !o.emissive });
      if (o.double) part(g, planeGeo(w, h), fm, 0, 0, -0.0015, { ry: 180, cast: false, merge: mm && !o.emissive });
      addObj(g, o);
      return g;
    };
    K.mesh = (obj, o = {}) => {
      ctx.parent.add(obj); tag(obj, W(o)); named(obj, o.name);
      if (o.static && mergeOK({})) flagMerge(obj, true);
      if (o.collide) {
        if (Array.isArray(o.collide)) { const b = normBox(o.collide); collRec((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[2] - b[0]) / 2, (b[3] - b[1]) / 2, 0, { h: o.h ?? 2.5, world: W(o), name: o.name }); }
        else {
          obj.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(obj);
          if (!bb.isEmpty()) collRec((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2, (bb.max.x - bb.min.x) / 2, (bb.max.z - bb.min.z) / 2, 0, { h: o.h ?? bb.max.y - bb.min.y, y: bb.min.y, world: W(o), name: o.name });
        }
      }
      return obj;
    };
    // (bare: an invisible room-level collider with no geometry of its own — Cam.check's lens test ignores it; one a prop
    // builds for itself (a car's body box) stands for that prop's solid and isn't bare)
    K.collider = (x0, z0, x1, z1, o = {}) => { const b = normBox([x0, z0, x1, z1]); const r = collRec((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[2] - b[0]) / 2, (b[3] - b[1]) / 2, 0, { ...o, world: W(o) }); r.bare = !ctx.inProp; return r; };
    K.colliderRot = (cx, cz, w, d, rotDeg = 0, o = {}) => { const r = collRec(cx, cz, w / 2, d / 2, rotDeg, { ...o, world: W(o) }); r.bare = !ctx.inProp; return r; };
    K.blocker = (x0, z0, x1, z1, msg, o = {}) => K.collider(x0, z0, x1, z1, { h: 3, ...o, blocker: msg ?? "I can't go that way." });
    K.ambient = (color, intensity) => { rb.ambient = { color, intensity }; return rb.ambient; };

    // ---- structure ------------------------------------------------------------------------------------------
    K.floor = (x0, z0, x1, z1, mat = 'lino', o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const y = o.y ?? 0, rp = o.ramp || null;
      // CONTRACT+ {visible:false}: a walkable height region with no mesh (under open grating, a floor drawn by props)
      if (o.visible === false) {
        const g = new THREE.Group(); g.name = o.name || 'walkable';
        addObj(g, o);
        addFloor(x0, z0, x1, z1, y, rp ? { axis: rp.axis, y0: rp.y0, y1: rp.y1 } : null, W(o));
        return g;
      }
      const rm = resolveMat(mat, 'lino'), s = uvS(rm, o) || 0.5;
      const yAt = (x, z) => (rp ? (rp.axis === 'x' ? U.lerp(rp.y0, rp.y1, (x - x0) / (x1 - x0 || 1)) : U.lerp(rp.y0, rp.y1, (z - z0) / (z1 - z0 || 1))) : y);
      const gb = new GB();
      const c = [[x0, yAt(x0, z1), z1], [x1, yAt(x1, z1), z1], [x1, yAt(x1, z0), z0], [x0, yAt(x0, z0), z0]];
      gb.quadN(c[0], c[1], c[2], c[3], [x0 * s, -z1 * s, x1 * s, -z1 * s, x1 * s, -z0 * s, x0 * s, -z0 * s]);
      const base = o.base ?? 0;
      if (o.skirt !== false && (rp || y > base + 0.02)) {
        const sides = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
        for (const [a, b] of sides) {
          if (a[1] <= base + 0.001 && b[1] <= base + 0.001) continue;
          const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
          gb.quadN([b[0], base, b[2]], [a[0], base, a[2]], [a[0], a[1], a[2]], [b[0], b[1], b[2]], [0, base * s, L * s, base * s, L * s, a[1] * s, 0, b[1] * s]);
        }
      }
      const m = part(null, gb.geo(), rm.mat, 0, 0, 0, { cast: false, merge: !o.name && o.static !== false });
      m.userData.ownedGeo = true;
      addObj(m, o);
      addFloor(x0, z0, x1, z1, y, rp ? { axis: rp.axis, y0: rp.y0, y1: rp.y1 } : null, W(o));
      return m;
    };
    K.walkable = (x0, z0, x1, z1, o = {}) => K.floor(x0, z0, x1, z1, null, { ...o, visible: false });   // CONTRACT+
    K.ceiling = (x0, z0, x1, z1, y = 3, mat = 'ceiling_tile', o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const rm = resolveMat(mat, 'ceiling_tile'), s = uvS(rm, o) || 0.5;
      const gb = new GB();
      gb.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s]);
      const m = part(null, gb.geo(), rm.mat, 0, 0, 0, { cast: false, merge: !o.name && o.static !== false });
      m.userData.ownedGeo = true;
      return addObj(m, o);
    };
    const baseMat = () => texMat(wallBaseTex(), { transparent: true, roughness: 1, offset: true });
    // wall along (x0,z0)→(x1,z1); the "front" (kept when both:false) is the right-hand side walking from start to end
    K.wall = (x0, z0, x1, z1, h = 3, mat = 'plaster', o = {}) => {
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
      if (L < 1e-4) return null;
      const t = o.thick ?? 0.15, y = o.y ?? 0, yaw = Math.atan2(-dz, dx);
      const rm = resolveMat(mat, 'plaster'), s = uvS(rm, o) || 0.5;
      const ops = (o.openings || []).map((op) => ({ ...op, w: op.w ?? 1, h: op.h ?? 2.1, sill: op.sill ?? 0 }))
        .map((op) => ({ ...op, u0: clamp(op.at - op.w / 2, 0, L), u1: clamp(op.at + op.w / 2, 0, L) }))
        .filter((op) => op.u1 - op.u0 > 0.01).sort((a, b) => a.u0 - b.u0);
      // both:false (a cutaway): only the front face — no back and no top cap (a camera above the wall behind it would
      // otherwise see the cap as a dark bar)
      const gb = new GB(), skip = { ny: true, nz: o.both === false, py: o.both === false };
      const piece = (a, b, y0, y1) => { if (b - a > 1e-4 && y1 - y0 > 1e-4) gb.box(a, y0, -t / 2, b, y1, t / 2, s, { skip }); };
      let u = 0;
      for (const op of ops) {
        piece(u, op.u0, 0, h);
        if (op.sill > 0) piece(op.u0, op.u1, 0, Math.min(h, op.sill));
        if (op.sill + op.h < h) piece(op.u0, op.u1, op.sill + op.h, h);
        u = Math.max(u, op.u1);
      }
      piece(u, L, 0, h);
      const g = new THREE.Group(); g.name = o.name || 'wall';
      g.position.set(x0, y, z0); g.rotation.y = yaw;
      const mm = !o.name && o.static !== false;
      const wm = part(g, gb.geo(), rm.mat, 0, 0, 0, { cast: o.shadow !== false, merge: mm });
      wm.userData.ownedGeo = true;
      // floor-level spans (between doorways) for grime, skirting and colliders
      const spans = [];
      let a = 0;
      for (const op of ops) { if (op.sill <= 0.01) { if (op.u0 - a > 0.01) spans.push([a, op.u0]); a = Math.max(a, op.u1); } }
      if (L - a > 0.01) spans.push([a, L]);
      if (o.grime !== false && rm.s) {
        const gg = new GB();
        for (const [s0, s1] of spans) {
          let top = Math.min(0.9, h);
          for (const op of ops) if (op.sill > 0.01 && op.u1 > s0 && op.u0 < s1) top = Math.min(top, op.sill);
          if (top < 0.05) continue;
          const zf = t / 2 + 0.004;
          gg.quad([s0, 0, zf], [s1, 0, zf], [s1, top, zf], [s0, top, zf], [0, 0, 1], [s0 / 2, 0, s1 / 2, 0, s1 / 2, top, s0 / 2, top]);
          if (o.both !== false) gg.quad([s1, 0, -zf], [s0, 0, -zf], [s0, top, -zf], [s1, top, -zf], [0, 0, -1], [-s1 / 2 + 0.37, 0, -s0 / 2 + 0.37, 0, -s0 / 2 + 0.37, top, -s1 / 2 + 0.37, top]);
        }
        if (gg.vc) { const gm = part(g, gg.geo(), baseMat(), 0, 0, 0, { cast: false, merge: mm }); gm.userData.ownedGeo = true; }
      }
      if (o.skirting) {
        const sm = o.skirting === true ? '#3a3935' : o.skirting;
        for (const [s0, s1] of spans) {
          pbox(g, (s0 + s1) / 2, 0, t / 2 + 0.006, s1 - s0, 0.09, 0.012, sm, { merge: mm, cast: false });
          if (o.both !== false) pbox(g, (s0 + s1) / 2, 0, -t / 2 - 0.006, s1 - s0, 0.09, 0.012, sm, { merge: mm, cast: false });
        }
      }
      // glazing and frames for openings with glass (windows by default in roomBox)
      for (const op of ops) {
        if (!op.glass && !op.frame) continue;
        const mid = (op.u0 + op.u1) / 2, ow = op.u1 - op.u0, oh = Math.min(op.h, h - op.sill), fw = 0.05, fd = t + 0.03;
        const fmat = op.frameMat || PAL.alu;
        pbox(g, mid, op.sill, 0, ow, fw, fd, fmat, { merge: mm });
        pbox(g, mid, op.sill + oh - fw, 0, ow, fw, fd, fmat, { merge: mm });
        pbox(g, op.u0 + fw / 2, op.sill, 0, fw, oh, fd, fmat, { merge: mm });
        pbox(g, op.u1 - fw / 2, op.sill, 0, fw, oh, fd, fmat, { merge: mm });
        if (ow > 1.8) pbox(g, mid, op.sill, 0, fw, oh, fd, fmat, { merge: mm });
        if (op.glass) part(g, boxGeo(ow - fw * 2, oh - fw * 2, 0.012, 0), resolveMat(op.glass === true ? 'glass' : op.glass).mat, mid, op.sill + fw, 0, { cast: false, merge: mm });
      }
      addObj(g, o);
      if (!mm) flagMerge(g, false);
      const colls = [];
      if (o.collide !== false) {
        const ux = dx / L, uz = dz / L;
        for (const [s0, s1] of spans) {
          const m0 = (s0 + s1) / 2;
          colls.push(collRec(x0 + ux * m0, z0 + uz * m0, (s1 - s0) / 2, Math.max(t, 0.1) / 2, yaw / D2R, { h: o.collideH ?? h, y, world: W(o), name: o.name }));
        }
      }
      const pa = P(x0, y, z0), pb = P(x1, y, z1);
      if (o.both === false) {            // CONTRACT+: collider.oneSided = [nx, nz] — the drawn face's normal (cameras behind see through)
        const l = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
        for (const c of colls) c.oneSided = [-(pb.z - pa.z) / l, (pb.x - pa.x) / l];
      }
      ctx.walls.push({ ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, thick: t, h, y: pa.y, world: W(o) });
      return { group: g, mesh: wm, colliders: colls, length: L };
    };
    // floor + ceiling + four walls; sides n (z0, north) s (z1) w (x0) e (x1); `at` from x0 (n/s) or z0 (w/e)
    K.roomBox = (x0, z0, x1, z1, o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const h = o.h ?? 3, t = o.thick ?? 0.15, y = o.y ?? 0, wmat = o.wall ?? 'plaster';
      const W_ = x1 - x0, D_ = z1 - z0;
      const side = (sd) => ({ z0: 'n', z1: 's', x0: 'w', x1: 'e', north: 'n', south: 's', west: 'w', east: 'e' }[sd] || sd);
      const openings = { n: [], s: [], e: [], w: [] };
      for (const d of o.doors || []) { const sd = side(d.side); if (openings[sd]) openings[sd].push({ at: d.at, w: d.w ?? 1, h: d.h ?? 2.1, sill: 0 }); }
      for (const wd of o.windows || []) { const sd = side(wd.side); if (openings[sd]) openings[sd].push({ at: wd.at, w: wd.w ?? 1.2, h: wd.h ?? 1.1, sill: wd.sill ?? 0.9, glass: wd.glass ?? true, frameMat: wd.frameMat }); }
      const conv = (sd, at) => (sd === 'n' ? at + t : sd === 's' ? W_ - at + t : sd === 'e' ? at : D_ - at);
      const mk = (sd) => openings[sd].map((op) => ({ ...op, at: conv(sd, op.at) }));
      const wo = { thick: t, y, grime: o.grime, skirting: o.skirting, world: o.world, both: o.both };
      const out = { walls: {} };
      if (o.floor !== false) out.floor = K.floor(x0 - t, z0 - t, x1 + t, z1 + t, o.floor ?? 'lino', { y, world: o.world, uv: o.floorUv });
      if (o.ceiling !== false) out.ceiling = K.ceiling(x0, z0, x1, z1, y + h, o.ceiling ?? 'ceiling_tile', { world: o.world });
      const skip = new Set(o.skipWalls || []);
      if (!skip.has('n')) out.walls.n = K.wall(x0 - t, z0 - t / 2, x1 + t, z0 - t / 2, h, wmat, { ...wo, openings: mk('n') });
      if (!skip.has('e')) out.walls.e = K.wall(x1 + t / 2, z0, x1 + t / 2, z1, h, wmat, { ...wo, openings: mk('e') });
      if (!skip.has('s')) out.walls.s = K.wall(x1 + t, z1 + t / 2, x0 - t, z1 + t / 2, h, wmat, { ...wo, openings: mk('s') });
      if (!skip.has('w')) out.walls.w = K.wall(x0 - t / 2, z1, x0 - t / 2, z0, h, wmat, { ...wo, openings: mk('w') });
      return out;
    };
    // stairs from the (x0|z0) edge at y0 to the (x1|z1) edge at y1 (order respected: z0 > z1 climbs toward −Z)
    K.stairs = (x0, z0, x1, z1, y0, y1, o = {}) => {
      const axis = o.axis || (Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 'x' : 'z');
      const A0 = axis === 'x' ? x0 : z0, A1 = axis === 'x' ? x1 : z1;
      const B0 = Math.min(axis === 'x' ? z0 : x0, axis === 'x' ? z1 : x1), B1 = Math.max(axis === 'x' ? z0 : x0, axis === 'x' ? z1 : x1);
      const rise = y1 - y0, n = o.steps || Math.max(1, Math.round(Math.abs(rise) / 0.175));
      const rm = resolveMat(o.mat ?? 'concrete', 'concrete'), s = rm.s || 0.5;
      const bottom = o.bottom ?? Math.min(y0, y1);
      const gb = new GB(), nb = new GB();
      const toXZ = (a0, a1, b0, b1) => (axis === 'x' ? [Math.min(a0, a1), b0, Math.max(a0, a1), b1] : [b0, Math.min(a0, a1), b1, Math.max(a0, a1)]);
      for (let i = 0; i < n; i++) {
        const a0 = A0 + ((A1 - A0) * i) / n, a1 = A0 + ((A1 - A0) * (i + 1)) / n;
        const top = rise >= 0 ? y0 + (rise * (i + 1)) / n : y0 + (rise * i) / n;
        const yb = o.solid === false ? top - 0.18 : bottom;
        const [bx0, bz0, bx1, bz1] = toXZ(a0, a1, B0, B1);
        gb.box(bx0, yb, bz0, bx1, top, bz1, s, { skip: { ny: true } });
        // nosing on the edge you step onto
        const edge = rise >= 0 ? a0 : a1, inward = Math.sign(A1 - A0) * (rise >= 0 ? 1 : -1) * 0.045;
        const [nx0, nz0, nx1, nz1] = toXZ(edge, edge + inward, B0 + 0.02, B1 - 0.02);
        nb.box(nx0, top, nz0, nx1, top + 0.008, nz1, 0);
      }
      const mm = !o.name && o.static !== false;
      const sm = part(null, gb.geo(), rm.mat, 0, 0, 0, { cast: true, merge: mm }); sm.userData.ownedGeo = true; addObj(sm, o);
      const nm = part(null, nb.geo(), resolveMat(o.nosing ?? { tex: 'metal', color: '#b3ae98', roughness: 0.5 }).mat, 0, 0, 0, { cast: false, merge: mm }); nm.userData.ownedGeo = true; addObj(nm, o);
      // walkable ramp
      const [rx0, rz0, rx1, rz1] = toXZ(A0, A1, B0, B1);
      const up = A1 >= A0;
      addFloor(rx0, rz0, rx1, rz1, Math.min(y0, y1), { axis, y0: up ? y0 : y1, y1: up ? y1 : y0 }, W(o));
      // handrails
      const rails = o.rail === true ? ['left', 'right'] : o.rail === 'both' ? ['left', 'right'] : o.rail ? [o.rail] : [];
      for (const r of rails) {
        const b = r === 'left' ? B0 + 0.06 : B1 - 0.06;
        const p = (a, yy) => (axis === 'x' ? [a, yy, b] : [b, yy, a]);
        const pts = [p(A0, y0 + 0.9), p(A1, y1 + 0.9)];
        const rg = part(null, tubeGeo(pts, 0.022, 1, 8), PAL.steel, 0, 0, 0, { merge: mm }); rg.userData.ownedGeo = true; addObj(rg, o);
        const posts = Math.max(2, Math.ceil(Math.abs(A1 - A0) / 1.2) + 1);
        for (let k = 0; k < posts; k++) {
          const f = k / (posts - 1), a = U.lerp(A0, A1, f), yy = U.lerp(y0, y1, f);
          const [px, , pz] = p(a, 0);
          addObj(part(null, cylGeo(0.018, 0.018, 0.9, 8, 0), resolveMat(PAL.steel).mat, px, yy, pz, { merge: mm }), o);
        }
        const c0 = p(A0, 0), c1 = p(A1, 0);
        const cx = (c0[0] + c1[0]) / 2, cz = (c0[2] + c1[2]) / 2;
        collRec(cx, cz, axis === 'x' ? Math.abs(A1 - A0) / 2 : 0.05, axis === 'x' ? 0.05 : Math.abs(A1 - A0) / 2, 0, { h: 1, y: Math.min(y0, y1), world: W(o) });
      }
      return sm;
    };

    // ---- interaction ----------------------------------------------------------------------------------------
    // examine: a string (one thought) | string[] (one per press, in order; then the last repeats — progress is kept
    // in S.done['ex:'+id]) | async (G) => {} (used directly).
    K.examine = (x, y, z, lines, o = {}) => {
      y = yDef(y, x, z, 1.0);
      const id = o.id || autoId('ex');
      let fn;
      if (typeof lines === 'function') fn = lines;
      else {
        const arr = (Array.isArray(lines) ? lines : [lines]).map(String);
        fn = async (G) => {
          const key = 'ex:' + id, n = S.done[key] | 0;
          S.done[key] = n + 1;
          await runBuiltin('examine', G, [arr[Math.min(n, arr.length - 1)]]);
        };
      }
      let h = null;
      const run = o.once ? async (G) => { try { await fn(G); } finally { if (h) h.remove(); } } : fn;
      h = addInteractable('examine', x, y, z, run, { ...o, id }, o.obj || null);
      return h;
    };
    K.interact = (x, y, z, fn, o = {}) => addInteractable('interact', x, yDef(y, x, z, 1.0), z, fn, o, o.obj || null);
    const isHeal = (item) => { const d = ITEMS[item]; return d ? !!d.heal : /^(coffee|energy_drink|first_aid)$/.test(item); };
    // `when` on a pickup/doc also hides its model while false (respecting its world tag)
    const whenVis = (obj, when, w) => { if (obj && when) { const f = () => { obj.visible = safeWhen(when) && matchWorld(w, S.outage); }; f(); rb.animated.push(f); } };
    const glintTick = (s) => rb.animated.push((dt, t) => { if (s.parent && s.parent.visible) s.userData.tick(t, dt); });
    const glintSize = (g, def) => (typeof g === 'number' ? g : def);
    K.pickup = (item, x, y, z, o = {}) => {
      const id = o.id || uid(`${roomId}:${item}`);
      if (S.taken && S.taken[id]) return dummyHandle(id);
      if (o.heal !== false && isHeal(item) && !DIFF.pickup(id, o)) return dummyHandle(id);
      y = yDef(y, x, z);
      let model = null;
      if (o.model !== false) {
        const def = ITEMS[item];
        try { model = def && typeof def.model === 'function' ? def.model() : null; } catch (e) { console.error(`[Kit] ITEMS.${item}.model() failed`, e); }
        const root = new THREE.Group(); root.name = 'pickup:' + id;
        root.add(localMerge(model || genericItem(item)));   // (integration) world pickups are static: merge ITEMS models too
        root.position.set(x, y, z); root.rotation.y = rad(o.rot ?? ctx.irng() * 360);
        if (o.scale) root.scale.setScalar(o.scale);
        root.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(root);
        const top = bb.isEmpty() ? 0.15 : bb.max.y - y;
        if (o.glint) glintTick(makeGlint(root, top + 0.05, glintSize(o.glint, 0.24)));
        flagMerge(root, false);
        addObj(root, o);
        whenVis(root, o.when, W(o));
        model = root;
      }
      const fn = async (G) => {
        await runBuiltin('pickup', G, { id, item, n: o.n ?? 1, msg: o.msg, obj: model });
        if (S.taken && S.taken[id]) h.remove();
      };
      const h = addInteractable('pickup', x, y + 0.2, z, fn, { ...o, id, r: o.r ?? 1.1, ownsObj: true }, model);
      h.item = item;
      return h;
    };
    const defaultDocModel = (d) => { const p = d && d.paper; return p === 'sticky' ? 'sticky' : p === 'whiteboard' ? 'board' : p === 'notebook' ? 'binder' : 'paper'; };
    K.doc = (docId, x, y, z, o = {}) => {
      const id = o.id || uid(`${roomId}:doc:${docId}`);
      const d = (typeof DOCUMENTS !== 'undefined' && DOCUMENTS[docId]) || null;
      const kind = o.model ?? defaultDocModel(d);
      const wall = o.wall ?? kind === 'board';
      y = yDef(y, x, z, wall ? 1.45 : 0);
      let root = null;
      if (kind !== 'none') {
        root = new THREE.Group(); root.name = 'doc:' + docId;
        root.position.set(x, y, z); root.rotation.y = rad(o.rot ?? (wall ? 0 : ctx.irng() * 40 - 20));
        const tm = texMat(docTex(docId, kind), { offset: true, roughness: 0.9 });
        if (kind === 'board') {
          pbox(root, 0, -0.47, 0.012, 1.24, 0.94, 0.024, PAL.alu, {});
          part(root, planeGeo(1.2, 0.9), tm, 0, 0.0, 0.0255, { cast: false });
          pbox(root, 0, -0.5, 0.05, 1.0, 0.03, 0.06, PAL.alu, {});
        } else if (kind === 'binder') {
          const col = o.color || '#1f4a6b';
          const b = new THREE.Group(); root.add(b);
          if (wall) b.rotation.x = rad(90);
          pbox(b, 0, 0, 0, 0.29, 0.06, 0.32, col, {});
          part(b, planeGeo(0.24, 0.3), tm, 0.0, 0.0605, 0, { rx: -90, cast: false });
          pbox(b, -0.147, 0.008, 0, 0.004, 0.044, 0.3, '#e7e4da', { cast: false });
        } else {
          const [pw, ph] = kind === 'sticky' ? [0.076, 0.076] : [0.21, 0.297];
          part(root, planeGeo(pw, ph), tm, 0, wall ? 0 : 0.002, wall ? 0.004 : 0, { rx: wall ? 0 : -90, cast: false });
          if (!wall && kind === 'paper') part(root, planeGeo(pw, ph), tm, 0.012, 0.0012, 0.01, { rx: -90, rz: 8, cast: false });
        }
        const bb = new THREE.Box3().setFromObject(root);
        if (o.glint) glintTick(makeGlint(root, wall ? 0.05 : (bb.isEmpty() ? 0.05 : bb.max.y - y + 0.04), glintSize(o.glint, 0.18), 0.55));
        flagMerge(root, false);
        addObj(root, o);
        whenVis(root, o.when, W(o));
      }
      const fn = (G) => runBuiltin('doc', G, { id, docId, open: o.open ?? true });
      return addInteractable('doc', x, y + (wall ? 0 : 0.1), z, fn, { ...o, id, r: o.r ?? 1.2, ownsObj: true }, root);
    };
    K.payphone = (x, z, rotDeg = 0, o = {}) => {
      const id = o.id || uid(`${roomId}:payphone`);
      const y = yDef(o.y, x, z);
      const kind = o.wall ? 'payphone_wall' : 'payphone_booth';
      let root;
      if (PROPS[kind] && o.own !== true) root = K.prop(kind, x, z, rotDeg, { y, world: o.world, collide: o.collide });
      else {
        root = new THREE.Group(); root.name = kind;
        let sway;
        if (o.wall) { const u = phoneUnit(root, 0, 0, 0); sway = u.sway; } else { const b = phoneBooth(root); sway = b.unit.sway; }
        root.position.set(x, y, z); root.rotation.y = rad(rotDeg);
        addObj(root, o);
        rb.animated.push(sway);
        if (!o.wall && o.collide !== false) {
          const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
          const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
          const [bx, bz] = at(0, -0.44); collRec(bx, bz, 0.6, 0.05, rotDeg, { h: 2.4, y, world: W(o) });
          for (const sx of [-1, 1]) { const [px, pz] = at(sx * 0.56, 0); collRec(px, pz, 0.04, 0.46, rotDeg, { h: 2.4, y, world: W(o) }); }
        }
      }
      const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
      const lz = o.wall ? 0.2 : -0.2;
      const fn = (G) => runBuiltin('payphone', G, { id });
      return addInteractable('payphone', x + lz * s, y + 1.3, z + lz * c, fn, { ...o, id, r: o.r ?? 1.3 }, root);
    };
    K.breakTable = (x, z, rotDeg = 0, o = {}) => {
      const id = o.id || uid(`${roomId}:break`);
      const y = yDef(o.y, x, z);
      let tbl;
      if (PROPS.table && PROPS.chair && o.own !== true) {
        tbl = K.prop('table', x, z, rotDeg, { y, world: o.world });
        const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
        for (const [lx, lz, r] of [[-0.3, -0.65, 0], [0.32, -0.7, 14], [0.3, 0.66, 180], [-0.55, 0.9, 205]]) K.prop('chair', x + lx * c + lz * s, z - lx * s + lz * c, rotDeg + r, { y, world: o.world });
      } else {
        tbl = breakTableSet(null, ctx.irng);
        tbl.position.set(x, y, z); tbl.rotation.y = rad(rotDeg);
        addObj(tbl, o);
        collRec(x, z, 0.62, 0.42, rotDeg, { h: 0.75, y, world: W(o) });
      }
      // the wall clock: o.clock = [x, y, z, rotDeg] or the nearest wall, facing the table
      let clock = null;
      if (o.clock !== false) {
        let cx, cy, cz, cr, roomSpace = false;
        if (Array.isArray(o.clock)) [cx, cy, cz, cr] = o.clock;
        else {
          let best = null;
          const p = P(x, y, z);
          for (const wl of ctx.walls) {
            if (!matchWorld(wl.world, false) && W(o) !== wl.world) continue;
            const vx = wl.bx - wl.ax, vz = wl.bz - wl.az, L2 = vx * vx + vz * vz || 1;
            const t = clamp(((p.x - wl.ax) * vx + (p.z - wl.az) * vz) / L2, 0.1, 0.9);
            const qx = wl.ax + vx * t, qz = wl.az + vz * t, d = Math.hypot(p.x - qx, p.z - qz);
            if (d > 0.3 && d < 8 && (!best || d < best.d)) best = { d, qx, qz, wl };
          }
          if (best) {
            const nx = (p.x - best.qx) / best.d, nz = (p.z - best.qz) / best.d;
            const off = best.wl.thick / 2 + 0.01;
            cx = best.qx + nx * off; cz = best.qz + nz * off; cy = best.wl.y + Math.min(2.25, best.wl.h - 0.35); cr = Math.atan2(nx, nz) / D2R;
            roomSpace = true; // walls are stored in room space
          } else { cx = x; cz = z; cy = y + 2.2; cr = rotDeg; }
        }
        clock = makeClock(o.time || [3, 0]);
        clock.position.set(cx, cy, cz); clock.rotation.y = rad(cr);
        (roomSpace && ctx.xf ? ctx.group : ctx.parent).add(clock);
        tag(clock, W(o));
        flagMerge(clock, false);
        if (!rb.objs.clock) rb.objs.clock = clock;
        rb.animated.push((dt) => clock.userData.tick(dt));
      }
      const fn = (G) => runBuiltin('breakTable', G, { id, clock });
      const h = addInteractable('break', x, y + 0.85, z, fn, { ...o, id, r: o.r ?? 1.5 }, tbl);
      h.clock = clock;
      return h;
    };
    K.npc = (id, preset, x, z, rotDeg = 0, o = {}) => {
      if (o.when && !safeWhen(o.when)) return null;
      let actor = null;
      if (typeof Rig !== 'undefined' && Rig && typeof Rig.create === 'function') {
        try { actor = Rig.create(preset || id, o.rig || {}); } catch (e) { console.error(`[Kit] Rig.create("${preset}") failed`, e); }
      } else warnOnce('norig', '[Kit] Rig is not available yet — K.npc registers interactions only');
      const y = yDef(o.y, x, z);
      if (actor && actor.root) {
        actor.root.position.set(x, y, z); actor.root.rotation.y = rad(rotDeg);
        ctx.parent.add(actor.root); tag(actor.root, W(o)); flagMerge(actor.root, false); actor.root.userData.kitNoMerge = true;
        if (o.anim && typeof actor.setAnim === 'function') actor.setAnim(o.anim, { blend: 0 });
        if (actor.id === undefined) actor.id = id;
        actor.npcId = id; // CONTRACT+: the K.npc id (RoomBuild.npcs key)
      }
      rb.npcs[id] = actor;
      const hy = (actor && actor.height) || 1.7;
      if (o.talk) addInteractable('npc', x, y + hy * 0.85, z, o.talk, { r: o.r ?? 1.6, id: o.interactId || `${roomId}:npc:${id}`, when: o.whenTalk || null, world: W(o), look: o.look, prio: o.prio, yBand: o.yBand }, actor ? actor.root : null);
      else if (o.examine) K.examine(x, y + hy * 0.85, z, o.examine, { r: o.r ?? 1.6, id: o.interactId || `${roomId}:npc:${id}`, world: W(o), obj: actor ? actor.root : null });
      return actor;
    };
    K.sticker = (id, x, y, z, rotDeg = 0, o = {}) => {
      if (S.stickers && S.stickers[id]) return dummyHandle(id);
      y = yDef(y, x, z, 0.5);
      const g = new THREE.Group(); g.name = 'sticker:' + id;
      g.position.set(x, y, z); g.rotation.set(rad(-(o.pitch || 0)), rad(rotDeg), 0, 'YXZ');
      part(g, planeGeo(o.size ?? 0.065, o.size ?? 0.065), texMat(Tex.label('OLLIE', { style: 'sticker' }), { alphaTest: 0.5, offset: true, roughness: 0.5 }), 0, 0, 0.003, { cast: false });
      flagMerge(g, false);
      addObj(g, o);
      const fn = async (G) => {
        const b = builtins();
        if (b && typeof b.sticker === 'function') await b.sticker(G, { id, obj: g });
        else {
          S.stickers[id] = true;
          if (typeof META !== 'undefined') { META.stickers = META.stickers || {}; META.stickers[id] = true; if (typeof saveMeta === 'function') saveMeta(); }
          if (G && G.sfx) G.sfx('paper');
          if (G && G.msg) G.msg('Aidan picked up the Ollie sticker.');
        }
        if (S.stickers[id]) h.remove();
      };
      const h = addInteractable('sticker', x, y, z, fn, { ...o, id, r: o.r ?? 0.9, ownsObj: true }, g);
      return h;
    };
    K.exit = (o = {}) => {
      const rec = { id: o.id || autoId('exit'), box: boxR(o.box || [0, 0, 0, 0]), to: o.to, entry: o.entry ?? null, when: o.when || null, blockedMsg: o.blockedMsg ?? null, fade: o.fade ?? true, sound: o.sound ?? 'steps', world: W(o), enabled: true, mapMark: o.mapMark ?? true };
      const band = bandOf(o);                                   // CONTRACT+ y:[y0,y1] / yBand: only at those feet heights
      if (band) rec.yBand = band;
      rb.exits.push(rec);
      return rec;
    };
    K.trigger = (box, fn, o = {}) => {
      const rec = { id: o.id || autoId('trig'), box: boxR(box), fn, once: o.once ?? true, when: o.when || null, world: W(o), enter: o.enter ?? true, enabled: true, anytime: !!o.anytime };
      const band = bandOf(o);                                   // CONTRACT+ y:[y0,y1] / yBand: only at those feet heights
      if (band) rec.yBand = band;
      rb.triggers.push(rec);
      return mkHandle(rec, rb.triggers);
    };
    K.mark = (name, x, y, z, rotDeg = 0) => { rb.marks[name] = { pos: P(x, yDef(y, x, z), z), rot: (rotDeg || 0) + ctx.xfYaw }; return rb.marks[name]; };
    K.region = (name, box) => { rb.regions[name] = boxR(box); return rb.regions[name]; };
    K.obj = (name, obj) => { if (obj) { rb.objs[name] = obj; if (!obj.name) obj.name = name; flagMerge(obj, false); } return obj; };

    // ---- lights ---------------------------------------------------------------------------------------------
    // Real lights are virtual handles on Render's fixed pool: the lit lights nearest Aidan hold the real slots (off,
    // world-tagged and far-away lights never starve the others); switching one off or on is instant.
    const LIGHTS = {
      street: { real: 'point', color: '#ff9340', intensity: 34, distance: 18 },
      fluoro: { real: 'point', color: '#d7ece6', intensity: 7, distance: 9 },
      lamp: { real: 'point', color: '#ffbf73', intensity: 3.5, distance: 5 },
      screen: { real: 'point', color: '#6fcfc6', intensity: 1.4, distance: 3.5 },
      point: { real: 'point', color: '#ffffff', intensity: 5, distance: 10 },
      spot: { real: 'spot', color: '#fff1dc', intensity: 30, distance: 14, angle: 35, penumbra: 0.45 },
      led: { real: null, color: '#ff2a1c' },
    };
    const tubeOn = () => colorMat('#e8f4ef', { emissive: '#dff2ec', emissiveIntensity: 1.6, roughness: 0.4, outage: false });
    const tubeOff = () => colorMat('#8d9591', { roughness: 0.5 });
    K.light = (kind = 'point', x = 0, y = 2.5, z = 0, o = {}) => {
      const D = LIGHTS[kind] || LIGHTS.point;
      if (!LIGHTS[kind]) warnOnce('light:' + kind, `[Kit] unknown light kind "${kind}" — using 'point'`);
      const real = o.real === false ? null : D.real;           // CONTRACT+: real:false — glow/halo only, no pool light
      const world = W(o), bank = o.bank ?? 0, pos = P(x, y, z);
      const cfg = {
        color: o.color ?? D.color, intensity: o.intensity ?? D.intensity, distance: o.distance ?? D.distance, decay: o.decay ?? 2,
        angle: o.angle ?? D.angle, penumbra: o.penumbra ?? D.penumbra, pos: pos.clone(), target: o.target ? P(...o.target) : pos.clone().add(new THREE.Vector3(0, -1, 0)),
      };
      // CONTRACT+: prio (m of pool ranking bonus: the light holds a real slot as if that much closer to Aidan) and pin
      // (always holds a slot — a key light far from him) go straight to Render.allocLight
      if (o.prio !== undefined) cfg.prio = o.prio;
      if (o.pin) cfg.pin = true;
      // angle is in degrees; a value under ~1.6 is almost certainly radians (a 0.7° cone lights nothing)
      if (cfg.angle > 0 && cfg.angle < 1.6) { warnOnce('lightangle:' + ctx.def.id + ':' + cfg.angle, `[Kit] room ${ctx.def.id}: K.light angle ${cfg.angle} looks like radians — K.light takes degrees; using ${Math.round(cfg.angle / D2R)}°`); cfg.angle = cfg.angle / D2R; }
      if (kind === 'fluoro') cfg.pos.y -= 0.12; // the light sits just under the tube
      const vis = new THREE.Group(); vis.name = o.name || 'light:' + kind; vis.position.set(x, y, z);
      if (o.rot) vis.rotation.y = rad(o.rot);
      const st = { lit: o.on !== false, worldOn: matchWorld(world, S.outage), slot: null, k: 1, flick: !!o.flicker, blink: null, halo: null, emis: [], mat: null, dead: false };
      // visuals
      if (kind === 'street' && o.halo !== false) {
        st.halo = Render.halo([0, 0, 0], { color: o.haloColor || '#ffad5c', size: o.haloSize ?? 2.6, opacity: o.haloOpacity ?? 0.55, parent: vis, fog: o.haloFog });
      }
      if (kind === 'fluoro' && o.fixture !== false) {
        const len = o.len ?? 1.2;
        pbox(vis, 0, -0.07, 0, len + 0.06, 0.07, 0.16, { tex: 'metal', color: '#b9bcb6', roughness: 0.6 }, {});
        st.mat = st.flick ? ownClone(tubeOn()) : null;
        const tube = part(vis, cylGeo(0.016, 0.016, len, 8, 0), st.mat || tubeOn(), -len / 2, -0.09, 0, { rz: -90, cast: false });
        st.emis.push(tube);
        if (o.diffuser) part(vis, planeGeo(len + 0.04, 0.14), colorMat('#dfe6e2', { transparent: true, opacity: 0.55, outage: false }), 0, -0.112, 0, { rx: 90, cast: false });
      }
      if (kind === 'led') {
        const size = o.size ?? 0.012;
        const lm = colorMat(cfg.color, { emissive: cfg.color, emissiveIntensity: o.intensity ?? 3, roughness: 0.3, outage: false });
        st.mat = o.blink ? ownClone(lm) : null;
        const dot = part(vis, sphereGeo(size, 8, 0), st.mat || lm, 0, 0, 0, { cast: false });
        st.emis.push(dot);
        if (o.halo) st.halo = Render.halo([0, 0, 0], { color: o.haloColor || cfg.color, size: o.halo === true ? 0.35 : o.halo, opacity: o.haloOpacity ?? 0.5, parent: vis, fog: o.haloFog });
        if (o.blink) st.blink = { period: o.blink === true ? 1 : o.blink, duty: o.duty ?? 0.5, phase: o.phase ?? ctx.irng() };
      }
      // the parts sync() switches (tube material, LED visibility) must stay out of the room's static batches — the
      // housing may merge. (Flagged after they exist: K.prop's static pass would otherwise bake a lit tube in.)
      for (const m of st.emis) m.userData.kitMerge = false;
      ctx.parent.add(vis); tag(vis, world);
      const sync = () => {
        const want = st.lit && st.worldOn && !st.dead;
        if (real && !ctx.detached && !st.dead) {
          // one virtual pool handle for the light's life: switching it is instant; Render decides which lights hold
          // one of the real slots (the nearest) — see Render's light pool
          if (!st.slot || st.slot.freed) st.slot = Render.allocLight(real, { ...cfg, on: want });
          st.slot.set({ ...cfg, intensity: cfg.intensity * st.k, on: want });
        }
        const on = want && st.k > 0.05;
        if (kind === 'fluoro') for (const m of st.emis) { if (st.mat) { m.material = st.mat; st.mat.emissiveIntensity = on ? 1.6 * st.k : 0; } else m.material = on ? tubeOn() : tubeOff(); }
        if (kind === 'led') { if (st.mat) st.mat.emissiveIntensity = on ? (o.intensity ?? 3) : 0; else for (const m of st.emis) m.visible = on; }
        if (st.halo) st.halo.visible = on;
      };
      const handle = {
        kind, bank, world, pos, obj: vis, name: o.name || null,
        on(v = true) { st.lit = !!v; sync(); return handle; },
        get isOn() { return st.lit && st.worldOn; },
        get intensity() { return cfg.intensity; },
        set intensity(v) { cfg.intensity = v; sync(); },
        flicker(v = true) { st.flick = !!v; if (kind === 'fluoro' && v && !st.mat && st.emis.length) { st.mat = ownClone(tubeOn()); for (const m of st.emis) m.material = st.mat; } if (!v) { st.k = 1; sync(); } return handle; },
        setWorld(active) { st.worldOn = !!active; sync(); return handle; },                   // CONTRACT+ (World's Outage toggle)
        set(opts) { Object.assign(cfg, opts); if (opts.pos) cfg.pos = U.toV3(opts.pos); if (opts.target) cfg.target = U.toV3(opts.target); sync(); return handle; }, // CONTRACT+
        get light() { return st.slot ? st.slot.light : null; },                                // CONTRACT+ (the pooled THREE light while lit)
        free() { st.dead = true; if (st.slot) { st.slot.free(); st.slot = null; } if (st.halo && st.halo.userData.free) st.halo.userData.free(); st.halo = null; },
      };
      // flicker / blink animation
      const fl = { t: 2 + ctx.irng() * 5, burst: 0, next: 0, snd: 0 };
      rb.animated.push((dt, t) => {
        if (st.dead) return;
        if (st.blink) {
          const on = ((t / st.blink.period + st.blink.phase) % 1) < st.blink.duty;
          if ((st.k > 0.5) !== on) { st.k = on ? 1 : 0; sync(); }
          return;
        }
        if (!st.flick || !(st.lit && st.worldOn)) return;
        fl.t -= dt;
        if (fl.burst > 0) {
          fl.burst -= dt; fl.next -= dt;
          if (fl.next <= 0) { const r = Math.random(); st.k = r < 0.45 ? 0 : r < 0.7 ? 0.25 : 1; fl.next = 0.03 + Math.random() * 0.08; sync(); }
          if (fl.burst <= 0) { st.k = Math.random() < 0.15 ? 0 : 1; sync(); fl.t = 1.5 + Math.random() * 6; }
        } else if (fl.t <= 0) {
          fl.burst = 0.2 + Math.random() * 1.1; fl.next = 0;
          if (t - fl.snd > 3) { fl.snd = t; sfx('tube_flicker', { pos: [pos.x, pos.y, pos.z], vol: 0.35, dur: fl.burst }); }
        } else if (st.k === 0 && Math.random() < dt * 0.8) { st.k = 1; sync(); }
      });
      sync();
      rb.lights.push({ kind, handle, bank, world, pos, name: o.name || null, real: !!real });
      if (o.name && !rb.objs[o.name]) rb.objs[o.name] = vis;
      return handle;
    };

    // ---- props ----------------------------------------------------------------------------------------------
    const meshBox = (root) => {
      const bb = new THREE.Box3(), tb = new THREE.Box3();
      root.updateMatrixWorld(true);
      root.traverse((c) => {
        if (!c.isMesh || !c.geometry || c.userData.noBounds) return;
        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
        tb.copy(c.geometry.boundingBox);
        if (c.isInstancedMesh) { c.computeBoundingBox(); if (c.boundingBox) tb.copy(c.boundingBox); }
        tb.applyMatrix4(c.matrixWorld); bb.union(tb);
      });
      return bb;
    };
    K.prop = (kind, x, z, rotDeg = 0, o = {}) => {
      const def = PROPS[kind];
      const builder = def ? (typeof def === 'function' ? def : def.build) : null;
      const y = yDef(o.y, x, z), sc = o.scale ?? 1, w = W(o);
      const g = new THREE.Group(); g.name = o.name || kind; g.userData.prop = kind;
      const isStatic = (o.static ?? (def && def.static)) === true && !o.name && (!ctx.inProp || ctx.propStatic);
      const saved = { parent: ctx.parent, xf: ctx.xf, xfYaw: ctx.xfYaw, xfScale: ctx.xfScale, world: ctx.world, tagWorld: ctx.tagWorld, inProp: ctx.inProp, propStatic: ctx.propStatic };
      // CONTRACT+ o.pitch / o.tilt (degrees about the prop's own X / Z after its yaw): props on slopes (guardrails along a
      // 10% road). Colliders stay yaw-only boxes.
      const pitch = rad(o.pitch || 0), tilt = rad(o.tilt || 0);
      const eul = new THREE.Euler(pitch, rad(rotDeg), tilt, 'YXZ');
      const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(eul), new THREE.Vector3(sc, sc, sc));
      ctx.xf = saved.xf ? saved.xf.clone().multiply(local) : local;
      ctx.xfYaw = saved.xfYaw + rotDeg; ctx.xfScale = saved.xfScale * sc;
      ctx.parent = g; ctx.world = w; ctx.tagWorld = w; ctx.inProp = saved.inProp + 1; ctx.propStatic = isStatic;
      const nColl = rb.colliders.length;
      let obj = null;
      try {
        if (builder) obj = builder(K, { ...o, kind });
        else { warnOnce('prop:' + kind, `[Kit] unknown prop "${kind}" — placing a crate`); obj = crate(null); }
      } catch (e) { console.error(`[Kit] prop "${kind}" builder failed`, e); obj = crate(null); }
      finally { Object.assign(ctx, saved); }
      if (obj && obj !== g) {
        if (obj.parent !== g) g.add(obj);
        for (const k of Object.keys(obj.userData)) if (!(k in g.userData)) g.userData[k] = obj.userData[k];
      }
      if (!isStatic) g.userData.kitNoMerge = true; // a live prop: nothing inside may be baked into the room batches
      if (isStatic) g.traverse((c) => { if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && c.material && !Array.isArray(c.material) && c.userData.kitMerge !== false) c.userData.kitMerge = true; });
      else if (o.name && !saved.inProp && (o.static ?? (def && def.static)) === true && o.merge !== false) propMerge(g);   // named: merge inside
      const bb = meshBox(g);
      g.position.set(x, y, z); g.rotation.copy(eul); g.scale.setScalar(sc);
      ctx.parent.add(g); tag(g, w); named(g, o.name);
      const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
      const toRoom = (lx, lz) => [x + (lx * c + lz * s) * sc, z + (-lx * s + lz * c) * sc];
      if (rb.colliders.length === nColl && !bb.isEmpty()) {
        const rule = o.collide ?? (def ? def.collide : undefined) ?? COLLIDE_RULES[kind] ?? 'auto';
        const hh = (def && def.h) ?? bb.max.y;
        if (rule === true || (rule === 'auto' && autoCollide(bb))) {
          const [cx, cz] = toRoom((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2);
          collRec(cx, cz, ((bb.max.x - bb.min.x) / 2) * sc, ((bb.max.z - bb.min.z) / 2) * sc, rotDeg, { h: (hh - Math.max(0, bb.min.y)) * sc, y: y + Math.max(0, bb.min.y) * sc, world: w, name: o.name });
        } else if (typeof rule === 'number') collRec(x, z, rule * sc, rule * sc, rotDeg, { h: hh * sc, y, world: w, name: o.name });
        else if (Array.isArray(rule)) {
          const r0 = normBox(rule), [cx, cz] = toRoom((r0[0] + r0[2]) / 2, (r0[1] + r0[3]) / 2);
          collRec(cx, cz, ((r0[2] - r0[0]) / 2) * sc, ((r0[3] - r0[1]) / 2) * sc, rotDeg, { h: hh * sc, y, world: w, name: o.name });
        }
      }
      if (o.examine || o.interact) {
        const [cx, cz] = bb.isEmpty() ? [x, z] : toRoom((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2);
        const cy = y + (bb.isEmpty() ? 1 : clamp(bb.min.y + (bb.max.y - bb.min.y) * 0.6, 0.3, 1.7) * sc);
        const rr = bb.isEmpty() ? 1.2 : Math.max(1.2, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 * sc + 0.6);
        if (o.examine) K.examine(cx, cy, cz, o.examine, { id: o.examineId, r: o.r ?? rr, world: w, obj: g, when: o.when, once: o.once });
        if (o.interact) K.interact(cx, cy, cz, o.interact, { id: o.interactId, r: o.r ?? rr, world: w, obj: g, when: o.when, hold: o.hold, holdText: o.holdText });
      }
      return g;
    };

    // ---- doors ----------------------------------------------------------------------------------------------
    const boardGeo = (len, hgt, th) => cachedGeo(`board|${q3(len)}|${q3(hgt)}|${q3(th)}`, () => {
      const b = new GB(), x0 = -len / 2, x1 = len / 2;
      b.quad([x0, 0, th / 2], [x1, 0, th / 2], [x1, hgt, th / 2], [x0, hgt, th / 2], [0, 0, 1], [0, 0, len, 0, len, 1, 0, 1]);
      b.quad([x1, 0, -th / 2], [x0, 0, -th / 2], [x0, hgt, -th / 2], [x1, hgt, -th / 2], [0, 0, -1], [0, 0, len, 0, len, 1, 0, 1]);
      b.box(x0, 0, -th / 2, x1, hgt, th / 2, 0, { skip: { pz: true, nz: true } });
      return b.geo();
    });
    const LEAF = {
      wood: { mat: (c) => ({ tex: 'wood', color: c || '#efe0c4', roughness: 0.7, rotation: 90 }), frame: { tex: 'wood', color: '#f2e8d2', rotation: 90 } },
      metal: { mat: (c) => ({ tex: 'metal', color: c || '#5f6c66', roughness: 0.62, metalness: 0.35 }), frame: PAL.steelDark, hole: [0.28, 0.66, 1.25, 1.85] },
      fire: { mat: (c) => ({ tex: 'metal', color: c || '#7b3327', roughness: 0.66, metalness: 0.25 }), frame: PAL.steelDark, hole: [0.62, 0.82, 1.05, 1.85] },
      wired: { mat: (c) => ({ tex: 'metal', color: c || '#6d726c', roughness: 0.6, metalness: 0.3 }), frame: PAL.steelDark, hole: [0.14, 0.86, 1.0, 1.9], big: true },
      glass: { mat: () => PAL.alu, frame: PAL.alu, glass: true },
    };
    function doorLeaf(style, lw, lh, xs, o) {
      const L = new THREE.Group(); L.name = 'leaf';
      const t = 0.045, spec = LEAF[style] || LEAF.wood, mat = spec.mat(o.color);
      const X = (u) => xs * u; // u measured from the hinge edge
      const seg = (u0, u1, y0, y1, m = mat, zz = 0, th = t) => { if (u1 - u0 > 1e-3 && y1 - y0 > 1e-3) pbox(L, X((u0 + u1) / 2), y0, zz, u1 - u0, y1 - y0, th, m); };
      const ky = lh / 2.1;
      if (spec.glass) {
        const st = 0.07, top = 0.1, bot = 0.2;
        seg(0, st, 0, lh); seg(lw - st, lw, 0, lh); seg(st, lw - st, 0, bot); seg(st, lw - st, lh - top, lh);
        pbox(L, X(lw / 2), bot, 0, lw - st * 2, lh - top - bot, 0.01, 'glass', { cast: false });
        for (const sz of [1, -1]) { // pull bar on stand-offs
          const zb = sz * 0.07;
          pcyl(L, X(lw - 0.1), 0.72, zb, 0.013, 0.55, PAL.chrome, { seg: 8 });
          pbox(L, X(lw - 0.1), 0.78, sz * 0.045, 0.02, 0.02, 0.05, PAL.chrome); pbox(L, X(lw - 0.1), 1.2, sz * 0.045, 0.02, 0.02, 0.05, PAL.chrome);
        }
        return localMerge(L);
      }
      const hole = spec.hole && o.window !== false ? [spec.hole[0] * lw, spec.hole[1] * lw, spec.hole[2] * ky, spec.hole[3] * ky] : null;
      if (hole) {
        const [u0, u1, y0, y1] = hole;
        seg(0, lw, 0, y0); seg(0, lw, y1, lh); seg(0, u0, y0, y1); seg(u1, lw, y0, y1);
        pbox(L, X((u0 + u1) / 2), y0, 0, u1 - u0, y1 - y0, 0.007, texMat(wiredGlassTex(), { transparent: true, double: true, roughness: 0.12, offset: false }), { cast: false });
        for (const sz of [1, -1]) { // glazing beads
          const zb = sz * (t / 2 + 0.006);
          pbox(L, X((u0 + u1) / 2), y0 - 0.02, zb, u1 - u0 + 0.04, 0.02, 0.012, mat); pbox(L, X((u0 + u1) / 2), y1, zb, u1 - u0 + 0.04, 0.02, 0.012, mat);
          pbox(L, X(u0 - 0.01), y0, zb, 0.02, y1 - y0, 0.012, mat); pbox(L, X(u1 + 0.01), y0, zb, 0.02, y1 - y0, 0.012, mat);
        }
      } else seg(0, lw, 0, lh);
      if (style === 'wood') { // raised panels on both faces
        const P4 = [[0.12, 0.47, 1.08, 1.95], [0.53, 0.88, 1.08, 1.95], [0.12, 0.47, 0.18, 0.98], [0.53, 0.88, 0.18, 0.98]];
        for (const [a, b, c, d] of P4) for (const sz of [1, -1]) pbox(L, X(((a + b) / 2) * lw), c * ky, sz * (t / 2 + 0.004), (b - a) * lw, (d - c) * ky, 0.008, mat);
      }
      // kick plates, hinges, lever handles + escutcheons on both faces
      if (style !== 'wood' || o.kick) for (const sz of [1, -1]) pbox(L, X(lw / 2), 0.02, sz * (t / 2 + 0.002), lw - 0.08, 0.24, 0.003, PAL.steel, { cast: false });
      for (const hy of [0.25, 1.05, 1.85]) pcyl(L, 0, hy * ky, 0, 0.011, 0.1, PAL.steel, { seg: 6 });
      const hx = lw - 0.07;
      for (const sz of [1, -1]) {
        const zf = sz * (t / 2);
        pbox(L, X(hx), 0.93, zf + sz * 0.004, 0.045, 0.2, 0.008, PAL.chrome);
        pcyl(L, X(hx), 1.0, zf, 0.014, 0.05, PAL.chrome, { rx: sz * 90, seg: 8 });
        pbox(L, X(hx - 0.055), 0.99, zf + sz * 0.05, 0.12, 0.02, 0.02, PAL.chrome);
        pbox(L, X(hx), 0.9, zf + sz * 0.0085, 0.008, 0.022, 0.002, PAL.black, { cast: false });
      }
      if (style === 'fire') {
        // closer arm on the push face, and the sign
        pbox(L, X(0.24), lh - 0.14, t / 2 + 0.03, 0.3, 0.06, 0.06, PAL.steelDark);
        pbox(L, X(0.3), lh - 0.08, t / 2 + 0.05, 0.3, 0.02, 0.02, PAL.steelDark, { ry: 8 });
        const sgn = texMat(Tex.sign('FIRE DOOR\nKEEP CLOSED', { style: 'shop', w: 0.3, h: 0.14, bg: '#9e2a20', fg: '#f3efe6', border: false }));
        part(L, planeGeo(0.3, 0.14), sgn, X(lw / 2), 1.62 * ky, t / 2 + 0.002, { cast: false });
      }
      if (o.sign) part(L, planeGeo(0.32, 0.1), texMat(Tex.sign(o.sign, { style: 'office', w: 0.32, h: 0.1 })), X(lw / 2), 1.5 * ky, t / 2 + 0.003, { cast: false });
      if (o.signBack) part(L, planeGeo(0.32, 0.1), texMat(Tex.sign(o.signBack, { style: 'office', w: 0.32, h: 0.1 })), X(lw / 2), 1.5 * ky, -t / 2 - 0.003, { ry: 180, cast: false });
      return localMerge(L);
    }
    K.door = (o = {}) => {
      const id = o.id || autoId('door');
      const style = o.style || 'wood';
      const w = o.w ?? (style === 'glass_double' ? 1.8 : style === 'roller' ? 2.8 : 0.9);
      const h = o.h ?? (style === 'roller' ? 2.6 : 2.1);
      const x = o.x ?? 0, z = o.z ?? 0, rot = o.rot ?? 0, y = yDef(o.y, x, z), world = W(o);
      const depth = o.depth ?? 0.2;
      const root = new THREE.Group(); root.name = 'door:' + id;
      root.position.set(x, y, z); root.rotation.y = rad(rot);
      // hinge 'left'|'right' ('L'|'R') as seen standing in front of the door (on the side `rot` faces); swing 1 ('front',
      // 'out') opens the leaf toward that side, -1 ('back', 'in') away from it
      const hingeLeft = !/^r/i.test(String(o.hinge ?? 'left'));
      const swing = typeof o.swing === 'string' ? (/^(back|in|away)/i.test(o.swing) ? -1 : 1) : (o.swing ?? 1);
      const pivots = [];
      let setOpen;
      if (style === 'roller') {
        const galv = PAL.galv;
        for (const sx of [-1, 1]) pbox(root, sx * (w / 2 + 0.04), 0, 0, 0.08, h + 0.3, 0.12, galv, { merge: true });
        pbox(root, 0, h, 0.04, w + 0.26, 0.44, 0.52, { tex: 'metal', color: '#7a817d', roughness: 0.6 }, { merge: true });
        const sm = texMat(shutterTex(), { offset: false, roughness: 0.55, metalness: 0.35 });
        const curtain = new THREE.Mesh(new THREE.BufferGeometry(), sm); curtain.castShadow = true; curtain.receiveShadow = true; curtain.userData.ownedGeo = true; curtain.name = 'curtain';
        root.add(curtain);
        const rail = pbox(root, 0, 0, 0, w + 0.02, 0.05, 0.06, PAL.steelDark);
        const handle = pbox(root, 0, 0.05, 0.035, 0.18, 0.025, 0.03, PAL.steel);
        const lockG = new THREE.Group(); root.add(lockG);
        if (o.locked) { pbox(lockG, w * 0.35, -0.08, 0.05, 0.05, 0.06, 0.02, { tex: 'metal', color: '#b69a4a', metalness: 0.7, roughness: 0.35 }); part(lockG, cachedGeo('shackle', () => new THREE.TorusGeometry(0.018, 0.004, 5, 12, Math.PI)), PAL.chrome, w * 0.35, -0.02, 0.05, {}); }
        setOpen = (a) => {
          a = clamp(a, 0, 1); rec.amount = a;
          const hv = Math.max(0.05, h * (1 - a * 0.95)), yb = h - hv;
          const gb = new GB(); gb.box(-w / 2 - 0.01, yb, -0.0125, w / 2 + 0.01, h, 0.0125, 1, { skip: { ny: true }, v0: -yb });
          curtain.geometry.dispose(); curtain.geometry = gb.geo();
          rail.position.y = yb - 0.02; handle.position.y = yb + 0.03; lockG.position.y = yb;
        };
      } else {
        if (o.frame !== false) {
          const fm = (LEAF[style] || (style === 'glass_double' ? LEAF.glass : LEAF.wood)).frame;
          pbox(root, -w / 2 - 0.03, 0, 0, 0.06, h + 0.06, depth, fm, { merge: true });
          pbox(root, w / 2 + 0.03, 0, 0, 0.06, h + 0.06, depth, fm, { merge: true });
          pbox(root, 0, h, 0, w + 0.12, 0.06, depth, fm, { merge: true });
          for (const sz of [1, -1]) {
            const zf = sz * (depth / 2 + 0.006);
            pbox(root, -w / 2 - 0.065, 0, zf, 0.07, h + 0.075, 0.012, fm, { merge: true });
            pbox(root, w / 2 + 0.065, 0, zf, 0.07, h + 0.075, 0.012, fm, { merge: true });
            pbox(root, 0, h + 0.005, zf, w + 0.2, 0.07, 0.012, fm, { merge: true });
          }
          pbox(root, 0, 0, 0, w, 0.012, depth, PAL.steel, { merge: true, cast: false });
        }
        const mkLeaf = (hx, xs, lw, lstyle) => {
          const piv = new THREE.Group(); piv.name = 'pivot'; piv.position.set(hx, 0.006, 0);
          piv.add(doorLeaf(lstyle, lw, h - 0.012, xs, o));
          root.add(piv);
          pivots.push({ piv, sign: (xs > 0 ? -1 : 1) * swing });
        };
        if (style === 'glass_double') { const lw = w / 2 - 0.004; mkLeaf(-w / 2, 1, lw, 'glass'); mkLeaf(w / 2, -1, lw, 'glass'); }
        else if (hingeLeft) mkLeaf(-w / 2, 1, w - 0.008, style);
        else mkLeaf(w / 2, -1, w - 0.008, style);
        const maxA = o.maxAngle ?? (style === 'glass_double' ? 88 : 95);
        setOpen = (a) => { a = clamp(a, 0, 1); rec.amount = a; for (const p of pivots) p.piv.rotation.y = rad(maxA * a * p.sign); };
        // a chain through the handles (the Plaza's front doors), with a padlock
        if (o.chain) {
          const links = [];
          const za = 0.1, ya = 1.0, xa = style === 'glass_double' ? -0.1 : w / 2 - 0.1, xb = style === 'glass_double' ? 0.1 : w / 2 + 0.12;
          const n = 12;
          for (let i = 0; i <= n; i++) { const f = i / n; links.push([U.lerp(xa - 0.05, xb + 0.05, f), ya - Math.sin(f * Math.PI) * 0.09, za]); }
          const lg = cachedGeo('chainlink', () => new THREE.TorusGeometry(0.016, 0.0045, 4, 8));
          const items = links.map((p, i) => ({ geo: lg, m: new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(i % 2 ? Math.PI / 2 : 0, 0, 0)), new THREE.Vector3(1.3, 1, 1)) }));
          const cm = part(root, mergeGeometries(items), PAL.steel, 0, 0, 0, { merge: true }); cm.userData.ownedGeo = true;
          pbox(root, (xa + xb) / 2, ya - 0.2, za + 0.01, 0.05, 0.06, 0.022, { tex: 'metal', color: '#b69a4a', metalness: 0.7, roughness: 0.35 }, { merge: true });
          part(root, cachedGeo('shackle', () => new THREE.TorusGeometry(0.018, 0.004, 5, 12, Math.PI)), PAL.chrome, (xa + xb) / 2, ya - 0.14, za + 0.01, { merge: true });
        }
      }
      // wall-mounted card reader / keypad beside the latch side, or a maglock on the head
      if (o.reader) {
        const rx = (hingeLeft ? 1 : -1) * (w / 2 + 0.2), zf = depth / 2 + 0.018;
        if (o.reader === 'maglock') pbox(root, 0, h - 0.06, zf, 0.26, 0.05, 0.05, PAL.steel, { merge: true });
        else {
          pbox(root, rx, 1.1, zf, 0.085, 0.13, 0.026, { tex: 'metal', color: '#2b2e2e', roughness: 0.5 }, { merge: true });
          if (o.reader === 'keypad') for (let i = 0; i < 12; i++) pbox(root, rx - 0.022 + (i % 3) * 0.022, 1.12 + Math.floor(i / 3) * 0.022, zf + 0.014, 0.016, 0.016, 0.004, '#9aa09e', { cast: false, merge: true });
        }
      }
      addObj(root, o); // frames/guides/housings are flagged for merging; leaves, curtain and chain stay live
      const pr = P(x, y, z);
      const collider = collRec(x, z, w / 2 + 0.02, 0.12, rot, { h, y, world, door: id, name: id });
      const rec = {
        id, obj: root, pivot: pivots[0] ? pivots[0].piv : null, pivots: pivots.map((p) => p.piv), open: false, amount: 0,
        locked: o.locked ?? false, lockMsg: o.lockMsg ?? "It's locked.", key: o.key ?? null, to: o.to ?? null, entry: o.entry ?? null,
        style, x: pr.x, z: pr.z, rot: rot + ctx.xfYaw, w, h, world, chapterLock: o.chapterLock ?? true, collider, when: o.when || null,
        openMsg: o.openMsg ?? null, swing, hinge: hingeLeft ? 'left' : 'right', sound: o.sound ?? null, setOpen,
        mapMark: o.mapMark ?? true,                                     // CONTRACT+: false = no automatic map X / tick
      };
      const init = typeof o.open === 'number' ? o.open : o.open ? 1 : 0;
      setOpen(init);
      rec.passAt = style === 'roller' ? 0.8 : 0.5; // CONTRACT+: amount at which the doorway counts as open
      rec.open = init >= rec.passAt;
      if (rec.open && !rec.to) collider.enabled = false;
      if (o.reader && o.reader !== 'maglock') {
        const rx = (hingeLeft ? 1 : -1) * (w / 2 + 0.2), c = Math.cos(rad(rot)), s = Math.sin(rad(rot)), zf = depth / 2 + 0.032;
        K.light('led', x + rx * c + zf * s, y + 1.155, z - rx * s + zf * c, { color: o.locked ? '#ff2a1c' : '#2aff5a', world, name: id + ':led', intensity: 2.5 });
      }
      if (o.reader === 'maglock') {
        const c = Math.cos(rad(rot)), s = Math.sin(rad(rot)), zf = depth / 2 + 0.045;
        K.light('led', x + 0.1 * c + zf * s, y + h - 0.035, z - 0.1 * s + zf * c, { color: o.locked ? '#ff2a1c' : '#2aff5a', world, name: id + ':led', intensity: 2.5 });
      }
      rb.doors[id] = rec;
      addInteractable('door', x, y + 1.0, z, (G) => runBuiltin('door', G, rec), { id: o.interactId || id, r: o.r ?? Math.max(1.2, w * 0.5 + 0.7), when: o.when, world, yBand: o.yBand, prio: o.prio }, root);
      return rec;
    };

    // ---- ladders --------------------------------------------------------------------------------------------
    // the ladder faces rotDeg (toward the climber); bottom = in front of it, top = behind it (onto the platform)
    K.ladder = (x, z, rotDeg = 0, y0 = 0, y1 = 3, o = {}) => {
      const id = o.id || autoId('ladder');
      const wd = o.width ?? 0.46, mat = o.mat ?? (o.rust ? 'metal_rust' : PAL.galv), Hh = y1 - y0, ext = o.extend ?? 1.05;
      const g = new THREE.Group(); g.name = 'ladder:' + id;
      g.position.set(x, y0, z); g.rotation.y = rad(rotDeg);
      const mm = !o.name;
      for (const sx of [-1, 1]) pbox(g, sx * wd / 2, 0, 0, 0.05, Hh + ext, 0.065, mat, { merge: mm });
      const n = Math.floor((Hh + ext * 0.5) / 0.3);
      const rm = resolveMat(mat);
      const rungs = [];
      for (let i = 1; i <= n; i++) rungs.push({ geo: cylGeo(0.016, 0.016, wd, 6, 0), m: new THREE.Matrix4().compose(new THREE.Vector3(-wd / 2, i * 0.3, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2), new THREE.Vector3(1, 1, 1)) });
      for (let yy = 1.5; yy < Hh; yy += 2) for (const sx of [-1, 1]) rungs.push({ geo: boxGeo(0.04, 0.04, 0.2, 0), m: new THREE.Matrix4().makeTranslation(sx * wd / 2, yy, -0.12) });
      if (o.cage) {
        const R = wd / 2 + 0.16, from = o.cageFrom ?? 2.3;
        const hoop = cachedGeo(`hoop|${q3(R)}`, () => new THREE.TorusGeometry(R, 0.012, 4, 18, Math.PI));
        for (let yy = from; yy <= Hh + ext; yy += 0.9) {
          rungs.push({ geo: hoop, m: new THREE.Matrix4().compose(new THREE.Vector3(0, yy, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)) });
          for (const sx of [-1, 1]) rungs.push({ geo: boxGeo(R - wd / 2, 0.025, 0.025, 0), m: new THREE.Matrix4().makeTranslation(sx * (wd / 2 + (R - wd / 2) / 2), yy - 0.0125, 0) });
        }
        const len = Hh + ext - from;
        for (let k = 1; k <= 5; k++) { const a = (k / 6) * Math.PI; rungs.push({ geo: boxGeo(0.04, len, 0.008, 0), m: new THREE.Matrix4().compose(new THREE.Vector3(R * Math.cos(a), from, R * Math.sin(a)), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2 - a), new THREE.Vector3(1, 1, 1)) }); }
      }
      const rg = part(g, mergeGeometries(rungs), rm.mat, 0, 0, 0, { merge: mm }); rg.userData.ownedGeo = true;
      addObj(g, o);
      const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
      collRec(x, z, wd / 2 + 0.04, 0.06, rotDeg, { h: Math.min(2.5, Hh), y: y0, world: W(o) });
      const pb = o.bottom ? P(o.bottom[0], 0, o.bottom[1]) : P(x + s * 0.45, 0, z + c * 0.45);
      const pt = o.top ? P(o.top[0], 0, o.top[1]) : P(x - s * 0.5, 0, z - c * 0.5);
      const pr = P(x, y0, z);
      const rec = { id, x: pr.x, z: pr.z, rot: rotDeg + ctx.xfYaw, y0: pr.y, y1: pr.y + Hh, top: [pt.x, pt.z], bottom: [pb.x, pb.z], cage: !!o.cage, world: W(o) };
      rb.ladders.push(rec);
      const climb = (from) => async (G) => {
        const b = builtins();
        if (b && typeof b.ladder === 'function') return b.ladder(G, rec, from);
        if (typeof Player !== 'undefined' && Player && typeof Player.climb === 'function') return Player.climb(rec, from);
        warnOnce('noladder', '[Kit] neither Script.builtins.ladder nor Player.climb exists');
        return undefined;
      };
      const bl = o.bottom || [x + s * 0.45, z + c * 0.45], tl = o.top || [x - s * 0.5, z - c * 0.5];
      addInteractable('ladder', bl[0], y0 + 1.0, bl[1], climb('bottom'), { id: id + ':bottom', r: o.r ?? 1.0, world: W(o), when: o.when }, g);
      addInteractable('ladder', tl[0], y1 + 1.0, tl[1], climb('top'), { id: id + ':top', r: o.r ?? 1.0, world: W(o), when: o.when }, g);
      return rec;
    };

    // ---- street kit (CONTRACT+) -----------------------------------------------------------------------------
    // K.road(x0,z0,x1,z1, {axis, markings:'center'|'double'|'solid'|'edge'|'center+edge'|'none', kerb:true, kerbH:0.15,
    //   footpath: w | [wNearSide, wFarSide], sides:'both'|'left'|'right', slope:{y0,y1}, y, mat, pathMat, world})
    // The box is the carriageway (gutters included); kerbs (0.16 m top) and footpaths sit outside it. Registers ramp
    // height regions for the road and for each kerb+footpath (raised by kerbH). "left" = the x0/z0 side.
    K.road = (x0, z0, x1, z1, o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const axis = o.axis || (x1 - x0 >= z1 - z0 ? 'x' : 'z');
      const base = o.y ?? 0, sl = o.slope || null, Y0 = sl ? sl.y0 : base, Y1 = sl ? sl.y1 : base;
      const A0 = axis === 'x' ? x0 : z0, A1 = axis === 'x' ? x1 : z1, B0 = axis === 'x' ? z0 : x0, B1 = axis === 'x' ? z1 : x1;
      const yA = (a) => U.lerp(Y0, Y1, (a - A0) / (A1 - A0 || 1));
      const pt = (a, b, dy = 0) => (axis === 'x' ? [a, yA(a) + dy, b] : [b, yA(a) + dy, a]);
      const world = W(o), mm = !o.name && o.static !== false, up = [0, 1, 0];
      const ramp = sl ? { axis, y0: Y0, y1: Y1 } : null;
      const out = { axis };
      out.road = K.floor(x0, z0, x1, z1, o.mat ?? 'bitumen', { y: base, ramp, world, skirt: false, uv: o.uv });
      const kerb = o.kerb !== false, kh = kerb ? o.kerbH ?? 0.15 : 0, kt = kerb ? 0.16 : 0, gut = 0.3;
      const fp = o.footpath ?? 0, fw = Array.isArray(fp) ? fp : [fp, fp];
      const sides = o.sides === 'left' ? [0] : o.sides === 'right' ? [1] : [0, 1];
      const kgb = new GB(), fgb = new GB(), sK = 1 / Tex.size('kerb');
      const pr = resolveMat(o.pathMat ?? 'footpath'), sP = pr.s || 0.8;
      const uvP = (p) => [p[0] * sP, -p[2] * sP];
      for (const si of sides) {
        const sgn = si === 0 ? -1 : 1, bE = si === 0 ? B0 : B1;
        const away = axis === 'x' ? [0, 0, sgn] : [sgn, 0, 0], inward = [-away[0], 0, -away[2]];
        if (kerb) {
          const bg = bE - sgn * gut, bt = bE + sgn * kt;
          quadFacing(kgb, pt(A0, bE, 0.004), pt(A1, bE, 0.004), pt(A1, bg, 0.004), pt(A0, bg, 0.004), [A0 * sK, 0.25, A1 * sK, 0.25, A1 * sK, 0.0, A0 * sK, 0.0], up);
          quadFacing(kgb, pt(A0, bE, 0), pt(A1, bE, 0), pt(A1, bE, kh), pt(A0, bE, kh), [A0 * sK, 0.28, A1 * sK, 0.28, A1 * sK, 0.64, A0 * sK, 0.64], inward);
          quadFacing(kgb, pt(A0, bE, kh), pt(A1, bE, kh), pt(A1, bt, kh), pt(A0, bt, kh), [A0 * sK, 0.66, A1 * sK, 0.66, A1 * sK, 1, A0 * sK, 1], up);
        }
        const w = fw[si] || 0, bs = bE + sgn * kt, bo = bs + sgn * w;
        if (w > 0) {
          const q = [pt(A0, bs, kh), pt(A1, bs, kh), pt(A1, bo, kh), pt(A0, bo, kh)];
          quadFacing(fgb, q[0], q[1], q[2], q[3], [...uvP(q[0]), ...uvP(q[1]), ...uvP(q[2]), ...uvP(q[3])], up);
          const dn = o.pathBase ?? -0.25, L = A1 - A0;
          quadFacing(fgb, pt(A0, bo, dn), pt(A1, bo, dn), pt(A1, bo, kh), pt(A0, bo, kh), [0, 0, L * sP, 0, L * sP, (kh - dn) * sP, 0, (kh - dn) * sP], away);
        }
        // end caps where the kerb + footpath stop (a drop, a junction, a wall)
        if (o.caps !== false && (kerb || w > 0)) {
          const dn = o.pathBase ?? -0.25, bIn = kerb ? bE : bs;
          for (const [a, dir] of [[A0, -1], [A1, 1]]) {
            const f = axis === 'x' ? [dir, 0, 0] : [0, 0, dir];
            quadFacing(fgb, pt(a, bIn, dn), pt(a, bo, dn), pt(a, bo, kh), pt(a, bIn, kh), [0, 0, Math.abs(bo - bIn) * sP, 0, Math.abs(bo - bIn) * sP, (kh - dn) * sP, 0, (kh - dn) * sP], f);
          }
        }
        if (kerb || w > 0) {
          const bmin = Math.min(bE, bo), bmax = Math.max(bE, bo);
          const box = axis === 'x' ? [A0, bmin, A1, bmax] : [bmin, A0, bmax, A1];
          addFloor(box[0], box[1], box[2], box[3], base + kh, sl ? { axis, y0: Y0 + kh, y1: Y1 + kh } : null, world);
        }
      }
      if (kgb.vc) { const m = part(null, kgb.geo(), Tex.mat('kerb'), 0, 0, 0, { cast: false, merge: mm }); m.userData.ownedGeo = true; addObj(m, o); }
      if (fgb.vc) { const m = part(null, fgb.geo(), pr.mat, 0, 0, 0, { cast: false, merge: mm }); m.userData.ownedGeo = true; addObj(m, o); }
      // road markings (Fog world only: in the Outage the bitumen becomes wet cable)
      const mk = String(o.markings ?? 'center');
      if (mk !== 'none' && world !== 'outage') {
        const mid = (B0 + B1) / 2, lines = [];
        if (/cent/.test(mk)) lines.push([mid, 0.12, 'dash']);
        if (/double/.test(mk)) lines.push([mid - 0.09, 0.1, 'solid'], [mid + 0.09, 0.1, 'solid']);
        if (/solid/.test(mk)) lines.push([mid, 0.12, 'solid']);
        if (/edge/.test(mk)) lines.push([B0 + gut + 0.25, 0.1, 'solid'], [B1 - gut - 0.25, 0.1, 'solid']);
        for (const [b, lw, kind] of lines) {
          const gb = new GB();
          quadFacing(gb, pt(A0, b - lw / 2, 0.006), pt(A1, b - lw / 2, 0.006), pt(A1, b + lw / 2, 0.006), pt(A0, b + lw / 2, 0.006), [0, A0 / 6, 0, A1 / 6, 1, A1 / 6, 1, A0 / 6], up);
          const m = part(null, gb.geo(), texMat(markTex(kind), { transparent: true, roughness: 0.7, outage: false }), 0, 0, 0, { cast: false, merge: mm });
          m.userData.ownedGeo = true;
          addObj(m, { ...o, world: 'fog' });
        }
      }
      return out;
    };

    // K.drop(x0,z0,x1,z1, {sign:true, barrier:true, msg, side:'n'|'s'|'e'|'w' (edge the road meets; inferred from the
    // floors built so far), y, mat, lamp:true}) — the road stops at a broken edge over a sheer drop into white fog,
    // with a barrier and the council sign; in the Outage the same end is a trench of tangled cable. Both variants
    // are world-tagged; the blocker (msg) works in both.
    K.drop = (x0, z0, x1, z1, o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const msg = o.msg ?? 'The road ends here.';
      let side = { north: 'n', south: 's', west: 'w', east: 'e', z0: 'n', z1: 's', x0: 'w', x1: 'e' }[o.side] || o.side;
      if (!side) {
        const score = (sd) => {
          let n = 0;
          for (let k = 0; k < 7; k++) {
            const f = (k + 0.5) / 7;
            const px = sd === 'n' || sd === 's' ? U.lerp(x0, x1, f) : sd === 'w' ? x0 - 0.6 : x1 + 0.6;
            const pz = sd === 'n' ? z0 - 0.6 : sd === 's' ? z1 + 0.6 : U.lerp(z0, z1, f);
            if (floorAt(rb.floors, px, pz) !== null) n++;
          }
          return n;
        };
        const cand = ['n', 's', 'w', 'e'].map((sd) => [sd, score(sd)]).sort((a, b) => b[1] - a[1]);
        if (cand[0][1] > 0) side = cand[0][0];
        else {
          const bd = ctx.def.bounds, cx = bd ? (bd[0] + bd[2]) / 2 : 0, cz = bd ? (bd[1] + bd[3]) / 2 : 0;
          const dx = cx - (x0 + x1) / 2, dz = cz - (z0 + z1) / 2;
          side = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'w' : 'e') : dz < 0 ? 'n' : 's';
        }
      }
      const [ex, ez, yaw, Wd, D] = {
        n: [(x0 + x1) / 2, z0, 0, x1 - x0, z1 - z0], s: [(x0 + x1) / 2, z1, 180, x1 - x0, z1 - z0],
        w: [x0, (z0 + z1) / 2, 90, z1 - z0, x1 - x0], e: [x1, (z0 + z1) / 2, 270, z1 - z0, x1 - x0],
      }[side];
      const co = Math.cos(rad(yaw)), sn = Math.sin(rad(yaw));
      const L2R = (lx, lz) => [ex + lx * co + lz * sn, ez - lx * sn + lz * co];
      const ey = o.y ?? H(...L2R(0, -0.4));
      const r = U.rng(ctx.seed ^ U.hash(`drop${x0},${z0}`));
      const root = new THREE.Group(); root.name = o.name || 'drop';
      root.position.set(ex, ey, ez); root.rotation.y = rad(yaw);
      ctx.parent.add(root); named(root, o.name);
      const ow = W(o), makeFog = ow !== 'outage', makeOut = ow !== 'fog';
      const hw = Wd / 2;
      if (makeFog) {
        const fg = new THREE.Group(); fg.name = 'drop:fog'; root.add(fg); tag(fg, 'fog');
        // the broken lip, its slab edge and the cliff face falling away into the fog
        const n = Math.max(4, Math.ceil((Wd + 1) / 0.32)), pts = [];
        for (let i = 0; i <= n; i++) { const lx = -hw - 0.5 + ((Wd + 1) * i) / n; pts.push([lx, r() < 0.18 ? -0.12 - r() * 0.1 : 0.06 + r() * 0.4]); }
        const top = new GB(), slab = new GB(), cliff = new GB();
        const rmT = resolveMat(o.mat ?? 'bitumen'), sT = rmT.s || 0.33, sC = 1 / Tex.size('concrete'), sD = 1 / Tex.size('dirt');
        for (let i = 0; i < n; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          quadFacing(top, [ax, 0.004, -0.02], [bx, 0.004, -0.02], [bx, 0.004, bz], [ax, 0.004, az], [ax * sT, 0.02 * sT, bx * sT, 0.02 * sT, bx * sT, -bz * sT, ax * sT, -az * sT], [0, 1, 0]);
          const L = Math.hypot(bx - ax, bz - az), u0 = ax * sC;
          quadFacing(slab, [ax, -0.32, az], [bx, -0.32, bz], [bx, 0.004, bz], [ax, 0.004, az], [u0, -0.32 * sC, u0 + L * sC, -0.32 * sC, u0 + L * sC, 0, u0, 0], [0, 0, 1]);
          const dz0 = 0.25 + r() * 0.4, dz1 = 0.25 + r() * 0.4, d0 = -16;
          quadFacing(cliff, [ax, d0, az + dz0 + 1.5], [bx, d0, bz + dz1 + 1.5], [bx, -0.32, bz], [ax, -0.32, az], [ax * sD, d0 * sD, bx * sD, d0 * sD, bx * sD, -0.32 * sD, ax * sD, -0.32 * sD], [0, 0, 1]);
        }
        for (const [gb, m] of [[top, rmT.mat], [slab, Tex.mat('concrete')], [cliff, Tex.mat('dirt')]]) { const mesh = part(fg, gb.geo(), m, 0, 0, 0, { cast: false, merge: true }); mesh.userData.ownedGeo = true; }
        for (let k = 0; k < 7; k++) { // rubble
          const sz = 0.07 + r() * 0.22;
          pbox(fg, (r() - 0.5) * Wd * 0.9, -0.02, -0.2 - r() * 1.2, sz * (1 + r()), sz * 0.6, sz, r() < 0.5 ? rmT.mat : 'concrete', { merge: true, ry: r() * 90, rx: (r() - 0.5) * 20 });
        }
        // the luminous fog sea below and the fog curtain beyond
        // (no scene fog on these: the void below the edge glows a flat luminous white-grey, whatever the distance)
        const fogM = cachedMat('dropfog', () => new THREE.MeshBasicMaterial({ map: Tex.get('fog_noise'), vertexColors: true, transparent: true, depthWrite: false, fog: false, name: 'dropfog' }));
        const baseM = cachedMat('dropbase', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, name: 'dropbase' }));
        const curM = cachedMat('dropcurtain', () => new THREE.MeshBasicMaterial({ map: curtainTex(), transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, name: 'dropcurtain' }));
        const tint = (mesh, m, k) => { mesh.onBeforeRender = (rr, sc) => { if (sc && sc.fog) m.color.copy(sc.fog.color).multiplyScalar(k); }; };
        // a grid on the plane y, alpha 1 at the edge side (z = 0.3) fading out toward the far and side edges
        const fadeGrid = (y, SX, SZ, uvS, aMax) => {
          const gb = new GB(), cols = [], nx = 8, nz = 6;
          for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
            const u = i / nx, v = j / nz, px = -SX + u * SX * 2, pz = 0.3 + v * SZ;
            gb.v(px, y, pz, 0, 1, 0, px * uvS, pz * uvS);
            cols.push(1, 1, 1, aMax * clamp(Math.min(u, 1 - u) / 0.25, 0, 1) * (1 - U.smooth(clamp((v - 0.45) / 0.55, 0, 1))));
          }
          for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; gb.i.push(a, d, e, a, e, b); }
          gb.c = cols;
          return gb.geo();
        };
        const SX = hw + 18, SZ = D + 22;
        const bsM = part(fg, fadeGrid(-5, SX, SZ, 0, 1), baseM, 0, 0, 0, { cast: false, receive: false }); bsM.userData.ownedGeo = true; bsM.renderOrder = 1; tint(bsM, baseM, 1.3);
        const seaM = part(fg, fadeGrid(-2.3, SX, SZ, 1 / 7, 0.95), fogM, 0, 0, 0, { cast: false, receive: false }); seaM.userData.ownedGeo = true; seaM.renderOrder = 2; tint(seaM, fogM, 1.6);
        for (const [cz, ch, k] of [[Math.max(1.5, D), 12, 1.55], [Math.max(1.5, D) + 7, 18, 1.35]]) {
          const cg = new GB(), CX = hw + 12;
          cg.quad([-CX, -7, cz], [CX, -7, cz], [CX, ch - 7, cz], [-CX, ch - 7, cz], [0, 0, -1], [-CX / 9, 0, CX / 9, 0, CX / 9, 1, -CX / 9, 1]);
          const cm = part(fg, cg.geo(), curM, 0, 0, 0, { cast: false, receive: false }); cm.userData.ownedGeo = true; cm.renderOrder = 3; tint(cm, curM, k);
        }
        seaM.userData.noBounds = bsM.userData.noBounds = true;
        // low barrier: trestles with striped boards, one flashing amber lamp
        if (o.barrier !== false) {
          const bm = texMat(stripeTex(), { offset: false, roughness: 0.6 }), legM = { tex: 'metal', color: '#d9d6cc', roughness: 0.7 };
          const cnt = Math.max(1, Math.floor((Wd - 0.4) / 2.25)), span = cnt * 2.25, bz = -0.75;
          for (let i = 0; i < cnt; i++) {
            const bx = -span / 2 + 1.125 + i * 2.25;
            for (const lx of [-0.85, 0.85]) {
              for (const [dz, tilt] of [[-0.2, 11], [0.2, -11]]) pbox(fg, bx + lx, 0, bz + dz, 0.035, 1.06, 0.035, legM, { rx: tilt, merge: true });
              pbox(fg, bx + lx, 0.3, bz, 0.03, 0.03, 0.34, legM, { merge: true });
            }
            for (const by of [0.5, 0.88]) part(fg, boardGeo(2.05, 0.16, 0.025), bm, bx, by, bz, { merge: true });
            if (o.lamp !== false && i === Math.floor(cnt / 2)) {
              pcyl(fg, bx + 0.6, 1.04, bz, 0.075, 0.13, { color: '#c07a1d', roughness: 0.4 }, { seg: 12 });
              pbox(fg, bx + 0.6, 1.0, bz, 0.08, 0.05, 0.05, PAL.black);
              const [lx, lz] = L2R(bx + 0.6, bz);
              K.light('led', lx, ey + 1.12, lz, { color: '#ffa630', blink: 1.3, duty: 0.28, halo: 0.9, intensity: 5, size: 0.05, world: 'fog' });
            }
          }
          // cones at the ends
          for (const cxl of [-hw + 0.3, hw - 0.3]) {
            const cx = cxl + (r() - 0.5) * 0.2, cz = -1.15 - r() * 0.3;
            pbox(fg, cx, 0, cz, 0.36, 0.03, 0.36, PAL.black, { merge: true, ry: r() * 40 });
            pcyl(fg, cx, 0.03, cz, 0.15, 0.66, { color: '#c9531c', roughness: 0.6 }, { r2: 0.025, seg: 14, merge: true });
            pcyl(fg, cx, 0.33, cz, 0.094, 0.12, { color: '#dcdad2', roughness: 0.4 }, { r2: 0.073, seg: 14, merge: true });
          }
        }
        if (o.sign !== false) {
          const sx = Wd > 4 ? -Wd * 0.18 : 0, sz = -1.55;
          for (const px of [-0.55, 0.55]) {
            pcyl(fg, sx + px, 0, sz, 0.03, 1.95, PAL.galv, { seg: 8, merge: true });
            pbox(fg, sx + px, 0, sz, 0.42, 0.14, 0.26, { color: '#3b3a31', roughness: 0.95 }, { merge: true, ry: r() * 30 - 15 });
          }
          const tex = Tex.sign('ROAD CLOSED —\nWORKS IN PROGRESS', { style: 'warning', w: 1.3, h: 0.9 });
          pbox(fg, sx, 1.0, sz + 0.035, 1.34, 0.94, 0.02, PAL.galv, { merge: true });
          part(fg, planeGeo(1.3, 0.9), texMat(tex), sx, 1.47, sz + 0.024, { ry: 180, cast: false, merge: true });
        }
      }
      if (makeOut) {
        const og = new THREE.Group(); og.name = 'drop:outage'; root.add(og); tag(og, 'outage');
        const Dt = Math.max(1.6, Math.min(D, 3.4)), dd = 1.7, X = hw + 0.4;
        const pit = new GB(), sD = 1 / Tex.size('dirt');
        quadFacing(pit, [-X, -dd, 0], [X, -dd, 0], [X, 0, 0], [-X, 0, 0], [-X * sD, -dd * sD, X * sD, -dd * sD, X * sD, 0, -X * sD, 0], [0, 0, 1]);
        quadFacing(pit, [-X, -dd, Dt], [X, -dd, Dt], [X, 0, Dt], [-X, 0, Dt], [-X * sD, -dd * sD, X * sD, -dd * sD, X * sD, 0, -X * sD, 0], [0, 0, -1]);
        for (const sx of [-1, 1]) quadFacing(pit, [sx * X, -dd, 0], [sx * X, -dd, Dt], [sx * X, 0, Dt], [sx * X, 0, 0], [0, -dd * sD, Dt * sD, -dd * sD, Dt * sD, 0, 0, 0], [-sx, 0, 0]);
        quadFacing(pit, [-X, -dd, 0], [X, -dd, 0], [X, -dd, Dt], [-X, -dd, Dt], [-X * sD, 0, X * sD, 0, X * sD, Dt * sD, -X * sD, Dt * sD], [0, 1, 0]);
        const far = new GB(), sB = 1 / Tex.size('bitumen');
        quadFacing(far, [-X - 3, 0, Dt], [X + 3, 0, Dt], [X + 3, 0, Dt + 6], [-X - 3, 0, Dt + 6], [(-X - 3) * sB, -Dt * sB, (X + 3) * sB, -Dt * sB, (X + 3) * sB, -(Dt + 6) * sB, (-X - 3) * sB, -(Dt + 6) * sB], [0, 1, 0]);
        for (const [gb, m] of [[pit, Tex.mat('dirt')], [far, Tex.mat('bitumen')]]) { const mesh = part(og, gb.geo(), m, 0, 0, 0, { cast: false, merge: true }); mesh.userData.ownedGeo = true; }
        // tangled cable: black rubber mostly, with teal and yellow security tethers coiled through it
        const groups = { black: [], grey: [], teal: [], yellow: [] };
        const nC = Math.round(22 + Wd * 2.2);
        for (let i = 0; i < nC; i++) {
          const ps = [], sx0 = (r() - 0.5) * Wd;
          ps.push([sx0, 0.02, -0.3 - r() * 0.9]);
          ps.push([sx0 + (r() - 0.5) * 0.6, 0.05, 0.05]);
          for (let k = 0; k < 4; k++) ps.push([clamp(sx0 + (r() - 0.5) * 2.4, -X + 0.1, X - 0.1), -0.25 - r() * (dd - 0.35), 0.2 + r() * (Dt - 0.4)]);
          ps.push(r() < 0.4 ? [clamp(sx0 + (r() - 0.5) * 2, -X, X), 0.03, Dt + 0.2 + r() * 0.8] : [clamp(sx0 + (r() - 0.5) * 2, -X, X), -dd + 0.05, 0.2 + r() * (Dt - 0.4)]);
          const kind = i % 9 === 0 ? 'teal' : i % 11 === 0 ? 'yellow' : r() < 0.2 ? 'grey' : 'black';
          groups[kind].push({ geo: tubeGeo(ps, 0.012 + r() * 0.024, 26, 5), m: new THREE.Matrix4() });
        }
        for (let k = 0; k < Math.max(2, Math.round(Wd / 3)); k++) { // coiled tethers
          const cx = (r() - 0.5) * (Wd - 1), cz = 0.4 + r() * (Dt - 0.8), ps = [];
          for (let j = 0; j < 40; j++) { const a = j * 0.9, t = j / 39; ps.push([cx + Math.cos(a) * 0.12 + (t - 0.5) * 1.6, -dd + 0.25 + t * 1.3 + Math.sin(a) * 0.12, cz + Math.sin(a * 0.5) * 0.3]); }
          groups[k % 2 ? 'yellow' : 'teal'].push({ geo: tubeGeo(ps, 0.011, 110, 4), m: new THREE.Matrix4() });
        }
        const CM = { black: { color: '#0d1010', roughness: 0.62, outage: false }, grey: { color: '#34393a', roughness: 0.6, outage: false }, teal: { color: '#1f6f6a', roughness: 0.5, outage: false }, yellow: { color: '#c9a716', roughness: 0.55, outage: false } };
        for (const [kname, items] of Object.entries(groups)) {
          if (!items.length) continue;
          const mesh = part(og, mergeGeometries(items), CM[kname], 0, 0, 0, { cast: false, merge: true });
          mesh.userData.ownedGeo = true;
          for (const it of items) it.geo.dispose();
        }
        // pickets, hazard tape and a printed notice; a red LED blinking on the middle post
        const tm = texMat(stripeTex('#141414', '#e8c21a'), { offset: false, roughness: 0.5, double: true, outage: false });
        const px = [-hw + 0.2, 0, hw - 0.2];
        for (const x of px) pbox(og, x, 0, -0.45, 0.03, 1.1, 0.03, { color: '#1e2222', roughness: 0.5 }, { merge: true });
        for (let i = 0; i < 2; i++) { const a = px[i], b = px[i + 1]; part(og, boardGeo(b - a, 0.07, 0.003), tm, (a + b) / 2, 0.86, -0.45, { cast: false, merge: true, rz: (r() - 0.5) * 3 }); }
        const nt = writingTex('ROAD CLOSED', 'receipt');
        part(og, planeGeo(0.7, 0.7 / nt.userData.aspect), texMat(nt, { transparent: true, outage: false }), 0, 0.62, -0.47, { ry: 180, cast: false });
        const [lx, lz] = L2R(0, -0.45);
        K.light('led', lx, ey + 1.13, lz, { color: '#ff2a1c', blink: 0.9, duty: 0.5, halo: 0.45, intensity: 4, world: 'outage' });
      }
      const pad = 0.55;
      const bb = { n: [x0, z0 - pad, x1, z1], s: [x0, z0, x1, z1 + pad], w: [x0 - pad, z0, x1, z1], e: [x0, z0, x1 + pad, z1] }[side];
      const blocker = K.blocker(bb[0], bb[1], bb[2], bb[3], msg, { world: ow, name: o.name ? o.name + ':blocker' : undefined, mapMark: o.mapMark ?? true });
      return { side, group: root, blocker };
    };

    // K.fogWall(x0,z0,x1,z1, msg, {world, h, layers, bright}) — thick layered fog that swallows the way on (one draw
    // call; the fog texture drifts) + a soft blocker that turns the player around.
    const fogWallTex = () => {
      let t = kitTex.get('fogwall_tex');
      if (!t) { t = Tex.get('fog_noise').clone(); t.userData = { shared: true }; t.name = 'kit:fogwall'; kitTex.set('fogwall_tex', t); }
      return t;
    };
    K.fogWall = (x0, z0, x1, z1, msg, o = {}) => {
      [x0, z0, x1, z1] = normBox([x0, z0, x1, z1]);
      const alongX = x1 - x0 >= z1 - z0, len = (alongX ? x1 - x0 : z1 - z0) + 10, T = alongX ? z1 - z0 : x1 - x0;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y0 = (o.y ?? H(cx, cz)) - 0.6, hh = o.h ?? 8;
      const tex = fogWallTex();
      const m = cachedMat('fogwall', () => new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, name: 'fogwall' }));
      const layers = o.layers ?? 8, r = U.rng(ctx.seed ^ U.hash(`fw${x0},${z0}`));
      const gb = new GB(), cols = [], sx = 12, sy = 5;
      const alpha = (u, v) => clamp(Math.min(u, 1 - u) / 0.14, 0, 1) * (1 - U.smooth(clamp((v - 0.42) / 0.58, 0, 1)));
      for (let l = 0; l < layers; l++) {
        const f = layers > 1 ? l / (layers - 1) : 0.5, off = -2 + f * (T + 4), uo = r() * 5, vo = r() * 5, base = gb.vc;
        const core = 1 - Math.abs(f - 0.5) * 0.6;
        for (let j = 0; j <= sy; j++) for (let i = 0; i <= sx; i++) {
          const u = i / sx, v = j / sy, a = -len / 2 + u * len, yy = y0 + v * hh + Math.sin(u * 7 + l) * 0.2;
          const px = alongX ? cx + a : x0 + off, pz = alongX ? z0 + off : cz + a;
          gb.v(px, yy, pz, 0, 0, 1, (u * len) / 7 + uo, (v * hh) / 7 + vo);
          cols.push(1, 1, 1, alpha(u, v) * core);
        }
        for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const a = base + j * (sx + 1) + i, b = a + 1, d = a + sx + 1, e = d + 1; gb.i.push(a, b, e, a, e, d); }
      }
      gb.c = cols;
      const mesh = new THREE.Mesh(gb.geo(), m);
      mesh.name = o.name || 'fogwall'; mesh.renderOrder = 4; mesh.userData.ownedGeo = true; mesh.userData.noBounds = true;
      mesh.onBeforeRender = (rr, sc) => { if (sc && sc.fog) m.color.copy(sc.fog.color).multiplyScalar(o.bright ?? 1.12); };
      rb.animated.push((dt, t) => { tex.offset.set(t * 0.006, Math.sin(t * 0.04) * 0.03); });
      addObj(mesh, o);
      const coll = K.collider(x0, z0, x1, z1, { h: 3, world: W(o), blocker: msg ?? "I can't go that way.", soft: true, name: o.name, mapMark: o.mapMark ?? true });
      return { mesh, collider: coll };
    };

    // K.writing(text, x,y,z, w, {rotY, style:'marker'|'receipt', world, tilt}) — writing on a wall (x,y,z on the
    // surface, facing rotY). Fog world: a faded marker scrawl; Outage: thick black marker or printed receipt strips.
    // With no world given, both variants are built and world-tagged. Never blood.
    K.writing = (text, x, y, z, w = 1.4, o = {}) => {
      y = yDef(y, x, z, 1.6);
      const style = o.style === 'receipt' ? 'receipt' : 'marker', ow = o.world || (ctx.world !== 'both' ? ctx.world : null);
      const vars = ow === 'fog' ? [[o.faded === false ? 'marker' : 'fog', 'fog']] : ow === 'outage' ? [[style, 'outage']] : [['fog', 'fog'], [style, 'outage']];
      const g = new THREE.Group(); g.name = o.name || 'writing';
      g.position.set(x, y, z); g.rotation.y = rad(o.rotY ?? o.rot ?? 0);
      for (const [variant, world] of vars) {
        const tex = writingTex(text, variant), hgt = w / tex.userData.aspect;
        const m = part(g, planeGeo(w, hgt), texMat(tex, { transparent: true, roughness: 0.9, outage: false }), 0, 0, variant === 'receipt' ? 0.008 : 0.006, { cast: false, rz: o.tilt || 0 });
        if (!ow) tag(m, world);
      }
      flagMerge(g, false);
      ctx.parent.add(g); named(g, o.name);
      if (ow) tag(g, ow);
      return g;
    };

    // ---- dressing -------------------------------------------------------------------------------------------
    // K.dress(kind, [x0,z0,x1,z1], count, {seed, world, y}) — scattered clutter as instanced meshes (one draw call
    // per kind): papers, leaves, boxes, receipts, cables, contracts, cups. Positions avoid colliders built so far.
    const flatGeo = (w, d) => cachedGeo(`flat|${q3(w)}|${q3(d)}`, () => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; });
    const curlGeo = (w, L, curl) => cachedGeo(`curl|${q3(w)}|${q3(L)}|${q3(curl)}`, () => {
      const gb = new GB(), n = 10;
      for (let i = 0; i <= n; i++) { const f = i / n, zz = -L / 2 + f * L, yy = curl * Math.pow(Math.abs(f - 0.5) * 2, 2.2) + 0.002; gb.v(-w / 2, yy, zz, 0, 1, 0, 0, f * (L / 0.16)); gb.v(w / 2, yy, zz, 0, 1, 0, 1, f * (L / 0.16)); }
      for (let i = 0; i < n; i++) { const a = i * 2; gb.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = gb.geo(); g.computeVertexNormals(); return g;
    });
    const DRESS_COLORS = { leaves: ['#8a8466', '#7a6a4c', '#6a5638', '#8d6a4a', '#9a9070', '#5f6348', '#a08a5c'] };
    K.dress = (kind, box, count = 12, o = {}) => {
      const b = normBox(box);
      const seed = o.seed ?? ((ctx.seed ^ U.hash(kind) ^ Math.imul(++ctx.dressN, 7919)) >>> 0);
      const r = U.rng(seed), world = W(o);
      const blocked = (px, pz) => {
        if (ctx.inProp) return false;
        for (const c of rb.colliders) { if (c.blocker || c.soft || c.door) continue; if (px > c.x0 - 0.1 && px < c.x1 + 0.1 && pz > c.z0 - 0.1 && pz < c.z1 + 0.1 && (!c.obb || collide(c, px, pz, 0.1))) return true; }
        return false;
      };
      const pts = [];
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < 6; k++) { const px = U.lerp(b[0], b[2], r()), pz = U.lerp(b[1], b[3], r()); if (!blocked(px, pz) || k === 5 && kind === 'leaves') { pts.push([px, o.y ?? H(px, pz), pz]); break; } }
      }
      const g = new THREE.Group(); g.name = 'dress:' + kind;
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
      const inst = (geo, mat, list, cast = false) => {
        if (!list.length) return null;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((it, i) => {
          e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); q.setFromEuler(e);
          mtx.compose(pv.set(it.x, it.y, it.z), q, sc.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
          im.setMatrixAt(i, mtx);
          if (it.color) im.setColorAt(i, new THREE.Color(it.color));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere();
        g.add(im); return im;
      };
      const tilt = () => (r() - 0.5) * 0.08;
      if (kind === 'papers' || kind === 'contracts') {
        const sheets = [], balls = [], stacks = [];
        pts.forEach(([x, y, z], i) => {
          if (kind === 'contracts' && r() < 0.45) stacks.push({ x, y, z, ry: r() * TAU, sy: 0.3 + r() * 2.2 });
          else if (kind === 'papers' && r() < 0.18) balls.push({ x, y: y + 0.035, z, ry: r() * TAU, rx: r() * 3, sx: 0.8 + r() * 0.5, sy: 0.8 + r() * 0.4, sz: 0.8 + r() * 0.5 });
          else sheets.push({ x, y: y + 0.003 + (i % 7) * 0.0006, z, ry: r() * TAU, rx: tilt(), rz: tilt() });
        });
        inst(flatGeo(0.21, 0.297), Tex.mat('paper', { side: 'double' }), sheets);
        inst(cachedGeo('paperball', () => new THREE.IcosahedronGeometry(0.04, 0)), Tex.mat('paper', { flat: true }), balls);
        inst(cachedGeo('stack', () => { const gb = new GB(); gb.box(-0.105, 0, -0.1485, 0.105, 0.1, 0.1485, 0, { skip: { ny: true } }); return gb.geo(); }), Tex.mat('contracts'), stacks, true);
      } else if (kind === 'leaves') {
        const ls = pts.map(([x, y, z]) => ({ x, y: y + 0.004 + r() * 0.01, z, ry: r() * TAU, rx: tilt() * 3, rz: tilt() * 3, sx: 0.7 + r() * 0.6, sz: 0.7 + r() * 0.6, color: U.pick(DRESS_COLORS.leaves, r) }));
        inst(flatGeo(0.13, 0.034), texMat(leafTex(), { alphaTest: 0.5, double: true, roughness: 0.9, offset: false }), ls);
      } else if (kind === 'boxes') {
        const bx = [];
        for (const [x, y, z] of pts) {
          const flat = r() < 0.3, ry = r() * TAU;
          if (flat) bx.push({ x, y: y + 0.001, z, ry, sx: 0.6 + r() * 0.5, sy: 0.012, sz: 0.4 + r() * 0.4 });
          else {
            const w = 0.3 + r() * 0.4, h = 0.2 + r() * 0.3, d = 0.25 + r() * 0.3;
            bx.push({ x, y, z, ry, sx: w, sy: h, sz: d });
            if (w * d > 0.09 && h > 0.18) collRec(x, z, w / 2, d / 2, (ry / D2R), { h: h, y, world });
            if (r() < 0.3) bx.push({ x: x + (r() - 0.5) * 0.08, y: y + h, z: z + (r() - 0.5) * 0.08, ry: ry + (r() - 0.5) * 0.5, sx: w * 0.8, sy: h * 0.8, sz: d * 0.8 });
          }
        }
        inst(boxGeo(1, 1, 1, 0), Tex.mat('cardboard'), bx, true);
      } else if (kind === 'receipts') {
        const rs = pts.map(([x, y, z]) => ({ x, y: y + 0.002, z, ry: r() * TAU, sz: 0.5 + r() * 1.2, rx: tilt() }));
        inst(curlGeo(0.08, 0.45, 0.05), Tex.mat('receipt', { side: 'double' }), rs);
      } else if (kind === 'cups') {
        const cs = pts.map(([x, y, z]) => (r() < 0.45 ? { x, y: y + 0.045, z, ry: r() * TAU, rx: Math.PI / 2, rz: 0 } : { x, y, z, ry: r() * TAU }));
        inst(cylGeo(0.03, 0.045, 0.11, 10, 0), texMat(labelTex('cup'), { offset: false }), cs);
      } else if (kind === 'cables') {
        const cols = { black: [], grey: [] };
        for (const [x, y, z] of pts) {
          const ps = [], a0 = r() * TAU, L = 0.8 + r() * 2.2;
          let px = x, pz = z, a = a0;
          for (let k = 0; k < 6; k++) { ps.push([px, y + 0.012, pz]); a += (r() - 0.5) * 1.6; px += Math.cos(a) * L / 5; pz += Math.sin(a) * L / 5; }
          (r() < 0.25 ? cols.grey : cols.black).push({ geo: tubeGeo(ps, 0.007 + r() * 0.007, 30, 5), m: new THREE.Matrix4() });
        }
        for (const [k, items] of Object.entries(cols)) {
          if (!items.length) continue;
          const mesh = part(g, mergeGeometries(items), k === 'black' ? { color: '#121414', roughness: 0.35 } : { color: '#6c706e', roughness: 0.45 }, 0, 0, 0, { cast: false });
          mesh.userData.ownedGeo = true;
          for (const it of items) it.geo.dispose();
        }
      } else warnOnce('dress:' + kind, `[Kit] unknown dress kind "${kind}"`);
      flagMerge(g, false);
      addObj(g, o);
      return g;
    };

    return K;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Finalize: merge static meshes per material (and world), apply the current world, attach dispose()
  // ---------------------------------------------------------------------------------------------------------------
  function effWorld(obj, root) {
    for (let p = obj; p && p !== root; p = p.parent) if (p.userData.kitWorld) return p.userData.kitWorld;
    return 'both';
  }
  function mergeable(m, root) {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.userData.kitMerge !== true) return false;
    if (m.children.length || !m.visible || m.renderOrder || Array.isArray(m.material) || !m.material || !m.geometry) return false;
    if (m.material.transparent && m.material.depthWrite !== false) return false;
    if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
    for (let p = m.parent; p; p = p.parent) { if (p === root) return true; if (p.userData.kitNoMerge || !p.visible) return false; }
    return false;
  }
  // ---- batching: static meshes whose materials differ only in COLOUR share one vertex-coloured material, and
  // static canvas labels (plates, signs, posters, notes — shared, clamped canvas textures) whose materials differ only
  // in their MAP share one per-room atlas texture. Both then merge like any other static mesh, so a room's many
  // colours and labels cost a handful of draw calls instead of one each. The Outage 'self' dissolve is re-created on
  // the batch material; materials with partner textures, extra maps, transparency or custom shaders keep their own.
  function batchSig(m, withMap, withColor) {
    if (!m || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.vertexColors || m.transparent || m.alphaTest > 0 || m.wireframe) return null;
    if (m.alphaMap || m.lightMap || m.envMap || m.displacementMap) return null;
    const extra = ['normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap'].filter((k) => m[k]);
    if (extra.length && !withMap) return null;                                 // an atlas carries the colour map only
    if (m.emissiveMap && m.emissiveMap !== m.map) return null;
    const out = m.userData.outage, args = m.userData.outageArgs;
    if (out !== undefined && !args) return null;
    if (!withMap && out !== undefined && out !== 'self') return null;        // (a partner surface can't follow an atlas)
    if (out === undefined && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return null;
    return [withMap ? (m.map ? m.map.uuid : '-') : (m.map ? 'map:' + m.map.colorSpace : '-'), withColor ? m.color.getHexString() : '', m.roughness.toFixed(3), m.metalness.toFixed(3),
      m.emissive.getHexString(), (+m.emissiveIntensity).toFixed(3), m.emissiveMap ? 'em' : '', m.side, m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : '',
      m.flatShading ? 1 : 0, m.fog ? 1 : 0, m.toneMapped ? 1 : 0, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, args ? 'out:' + args.key : '',
      extra.map((k) => k + ':' + m[k].uuid).join(','), m.bumpMap ? m.bumpScale : '', m.normalMap ? m.normalScale.x + ',' + m.normalScale.y : ''].join('|');
  }
  function materialLike(src, o) {
    const m = new THREE.MeshStandardMaterial({ map: o.map !== undefined ? o.map : src.map, color: o.color ?? src.color, roughness: src.roughness, metalness: src.metalness, emissive: src.emissive, emissiveIntensity: src.emissiveIntensity, side: src.side, flatShading: src.flatShading, fog: src.fog, vertexColors: !!o.vertexColors });
    if (src.emissiveMap) m.emissiveMap = m.map;
    for (const k of ['normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (src[k]) m[k] = src[k];
    m.bumpScale = src.bumpScale; m.normalScale.copy(src.normalScale); m.aoMapIntensity = src.aoMapIntensity;
    m.polygonOffset = src.polygonOffset; m.polygonOffsetFactor = src.polygonOffsetFactor; m.polygonOffsetUnits = src.polygonOffsetUnits;
    m.toneMapped = src.toneMapped; m.depthWrite = src.depthWrite; m.depthTest = src.depthTest;
    if (src.userData.outageArgs) Tex.outageify(m, src.userData.outageArgs.partner, src.userData.outageArgs.o);
    m.name = o.name; m.userData.shared = !!o.shared;
    return m;
  }
  const vcMats = new Map();                                             // shared across rooms (like colorMats)
  const uvIn01 = new WeakMap();
  function uvsIn01(g) {
    let r = uvIn01.get(g);
    if (r !== undefined) return r;
    const uv = g.attributes.uv;
    r = !!uv;
    if (uv) for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < -0.002 || u > 1.002 || v < -0.002 || v > 1.002) { r = false; break; } }
    uvIn01.set(g, r);
    return r;
  }
  const atlasable = (t) => !!(t && t.isTexture && t.image && typeof HTMLCanvasElement !== 'undefined' && t.image instanceof HTMLCanvasElement && t.userData && t.userData.shared
    && t.wrapS === THREE.ClampToEdgeWrapping && t.wrapT === THREE.ClampToEdgeWrapping && t.repeat.x === 1 && t.repeat.y === 1 && t.offset.x === 0 && t.offset.y === 0 && !t.rotation && t.flipY !== false && t.image.width > 0 && t.image.height > 0);
  // pack canvases into atlas pages (1024 wide, ≤ 2048 tall; each label ≤ 512 px on its long side, 8 px of edge bleed)
  function packAtlas(texes, name) {
    const W = 1024, HMAX = 2048, PAD = 8, pages = [];
    const items = texes.map((t) => { const k = Math.min(1, 512 / Math.max(t.image.width, t.image.height)); return { t, w: Math.max(2, Math.round(t.image.width * k)), h: Math.max(2, Math.round(t.image.height * k)) }; }).sort((a, b) => b.h - a.h || b.w - a.w);
    let page = null;
    const newPage = () => { page = { items: [], x: PAD, y: PAD, rowH: 0 }; pages.push(page); };
    newPage();
    for (const it of items) {
      if (page.x + it.w + PAD > W) { page.x = PAD; page.y += page.rowH + PAD * 2; page.rowH = 0; }
      if (page.y + it.h + PAD > HMAX) { newPage(); }
      it.x = page.x; it.y = page.y; page.items.push(it);
      page.x += it.w + PAD * 2; page.rowH = Math.max(page.rowH, it.h);
    }
    const rects = new Map(), out = [];
    pages.forEach((pg, pi) => {
      if (!pg.items.length) return;
      let H = 64; while (H < pg.y + pg.rowH + PAD) H *= 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.fillStyle = '#6b6f6b'; x.fillRect(0, 0, W, H);
      for (const it of pg.items) {
        const img = it.t.image, iw = img.width, ih = img.height;
        // edge bleed: stretch the outermost rows/columns into the padding so mip levels don't pull in neighbours
        x.drawImage(img, 0, 0, iw, 1, it.x, it.y - PAD, it.w, PAD); x.drawImage(img, 0, ih - 1, iw, 1, it.x, it.y + it.h, it.w, PAD);
        x.drawImage(img, 0, 0, 1, ih, it.x - PAD, it.y, PAD, it.h); x.drawImage(img, iw - 1, 0, 1, ih, it.x + it.w, it.y, PAD, it.h);
        x.drawImage(img, it.x, it.y, it.w, it.h);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = pg.items[0].t.colorSpace; tex.anisotropy = 4; tex.name = `atlas:${name}:${pi}`; tex.userData.shared = false;
      out.push(tex);
      for (const it of pg.items) rects.set(it.t, { tex, r: [it.x / W, 1 - (it.y + it.h) / H, (it.x + it.w) / W, 1 - it.y / H] });
    });
    return rects;
  }
  function batchPlan(all, roomName) {
    const plan = new Map();
    // labels → atlas (same material but for the map)
    const groups = new Map();
    for (const m of all) {
      const mat = m.material;
      if (!mat.map || !atlasable(mat.map) || !uvsIn01(m.geometry)) continue;
      const sig = batchSig(mat, false, true);
      if (!sig) continue;
      let g = groups.get(sig); if (!g) { g = { meshes: [], texes: new Set(), src: mat }; groups.set(sig, g); }
      g.meshes.push(m); g.texes.add(mat.map);
    }
    let gi = 0;
    for (const g of groups.values()) {
      if (g.texes.size < 2) continue;
      const rects = packAtlas([...g.texes], roomName + ':' + gi++);
      const mats = new Map();
      for (const m of g.meshes) {
        const r = rects.get(m.material.map);
        if (!r) continue;
        let am = mats.get(r.tex);
        if (!am) { am = materialLike(g.src, { map: r.tex, name: 'atlas:' + (g.src.name || '') }); mats.set(r.tex, am); }
        plan.set(m, { mat: am, uvRect: r.r, col: false });
      }
    }
    // colours → vertex colours (same material but for the colour)
    const cg = new Map();
    for (const m of all) {
      if (plan.has(m)) continue;
      const mat = m.material, sig = batchSig(mat, true, false);
      if (!sig) continue;
      let g = cg.get(sig); if (!g) { g = { meshes: [], mats: new Set(), src: mat, sig }; cg.set(sig, g); }
      g.meshes.push(m); g.mats.add(mat);
    }
    for (const g of cg.values()) {
      if (g.mats.size < 2) continue;
      let vm = vcMats.get(g.sig);
      if (!vm) { vm = materialLike(g.src, { color: 0xffffff, vertexColors: true, name: 'vc:' + (g.src.map ? g.src.map.name || 'tex' : 'col'), shared: true }); vcMats.set(g.sig, vm); }
      for (const m of g.meshes) plan.set(m, { mat: vm, tint: m.material.color, col: true });
    }
    return plan;
  }
  function finalize(ctx) {
    const { rb, group: root } = ctx;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map(), all = [];
    root.traverse((c) => { if (mergeable(c, root)) all.push(c); });
    const plan = batchPlan(all.filter((m) => { const g = m.geometry; return g.attributes.position && g.attributes.normal && !(!g.index && g.attributes.position.count % 3); }), (ctx.def && ctx.def.id) || 'room');
    for (const m of all) {
      const g = m.geometry;
      if (!g.attributes.position || !g.attributes.normal || (!g.index && g.attributes.position.count % 3)) continue;
      const p = plan.get(m), mat = p ? p.mat : m.material;
      const world = effWorld(m, root), col = p ? p.col : !!g.attributes.color && m.material.vertexColors;
      const key = `${mat.uuid}|${world}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${col ? 'c' : ''}`;
      let b = buckets.get(key);
      if (!b) { b = { mat, world, cast: m.castShadow, recv: m.receiveShadow, col, list: [] }; buckets.set(key, b); }
      b.list.push({ mesh: m, geo: g, m: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), tint: p && p.tint, uvRect: p && p.uvRect });
    }
    let merged = 0, removed = 0;
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue;
      // keep batches spatially bounded so frustum culling still helps on long streets (≈ 40 m cells)
      const cells = new Map();
      for (const it of b.list) {
        _v.setFromMatrixPosition(it.m);
        const k = Math.floor(_v.x / 40) + ',' + Math.floor(_v.z / 40);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(it);
      }
      for (const list of cells.values()) {
        if (list.length < 2) continue;
        const mesh = new THREE.Mesh(mergeGeometries(list, b.col), b.mat);
        mesh.name = 'kit:' + (b.mat.name || 'mat'); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
        mesh.userData.ownedGeo = true; mesh.userData.merged = list.length;
        root.add(mesh);
        if (b.world !== 'both') { rb.tagged.push({ obj: mesh, world: b.world }); mesh.userData.kitWorld = b.world; }
        for (const it of list) { it.mesh.removeFromParent(); if (!it.geo.userData.shared) it.geo.dispose(); removed++; }
        merged++;
      }
    }
    // atlas materials whose labels all stayed single (nothing merged) are not used by anything: free them now
    if (plan.size) {
      const used = new Set(), usedMaps = new Set();
      root.traverse((c) => { if (c.isMesh && c.material && !Array.isArray(c.material)) { used.add(c.material); if (c.material.map) usedMaps.add(c.material.map); } });
      for (const bm of new Set([...plan.values()].map((p) => p.mat))) {
        if (bm.userData.shared || used.has(bm)) continue;
        if (bm.map && !usedMaps.has(bm.map)) bm.map.dispose();
        bm.dispose();
      }
    }
    // drop tag entries for objects that were merged away
    const attached = (o) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
    rb.tagged = rb.tagged.filter((t) => attached(t.obj));
    // world application (World may call rb.applyWorld(on) during the Outage transition)
    rb.applyWorld = (outage) => {
      rb.outage = !!outage;
      for (const t of rb.tagged) t.obj.visible = matchWorld(t.world, outage);
      for (const l of rb.lights) if (l.handle.setWorld) l.handle.setWorld(matchWorld(l.world, outage));
      return rb;
    };
    rb.heightAt = (x, z, outage = rb.outage) => floorAt(rb.floors, x, z, outage);
    rb.applyWorld(S.outage);
    rb.dispose = () => {
      if (rb.disposed) return;
      rb.disposed = true;
      for (const l of rb.lights) try { l.handle.free(); } catch (e) { /* already freed */ }
      for (const a of Object.values(rb.npcs)) try { if (a && typeof a.dispose === 'function') a.dispose(); } catch (e) { console.error('[Kit] actor dispose', e); }
      const seen = new Set();
      const kill = (o) => o.traverse((c) => {
        if (c.isInstancedMesh && !seen.has(c)) { seen.add(c); c.dispose(); }
        if (c.userData && c.userData.halo && c.userData.free) { /* sprite material handled below */ }
        if (c.geometry && !c.geometry.userData.shared && !seen.has(c.geometry)) { seen.add(c.geometry); c.geometry.dispose(); }
        const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
        for (const m of mats) {
          if (!m || seen.has(m) || (m.userData && m.userData.shared)) continue;
          seen.add(m);
          for (const k of ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'roughnessMap']) { const t = m[k]; if (t && !(t.userData && t.userData.shared) && !seen.has(t)) { seen.add(t); t.dispose(); } }
          m.dispose();
        }
      });
      kill(root);
      for (const o of ctx.removed) kill(o);
      root.removeFromParent();
    };
    rb.stats = {
      ms: Math.round((performance.now() - ctx.t0) * 10) / 10, merged, mergedFrom: removed,
      meshes: (() => { let n = 0; root.traverse((c) => { if (c.isMesh || c.isSprite || c.isPoints) n++; }); return n; })(),
      colliders: rb.colliders.length, floors: rb.floors.length, interactables: rb.interactables.length, lights: rb.lights.length,
    };
    // Render's pool gives its 8 point slots to the lit lights nearest Aidan (in view), so any number of lights along
    // a street is fine; only a cluster of more than 8 within ~14 m of each other means some stay dark at once
    // (only lights that take a pool slot: glow-only fittings — real:false, props with light:false — don't count)
    const pts = rb.lights.filter((l) => l.kind !== 'led' && l.kind !== 'spot' && l.real !== false);
    for (const w of ['fog', 'outage']) {
      const ws = pts.filter((l) => matchWorld(l.world, w === 'outage'));
      let most = 0;
      for (const a of ws) { let n = 0; for (const b of ws) if (a.pos.distanceTo(b.pos) < 14) n++; most = Math.max(most, n); }
      if (most > 8) console.warn(`[Kit] room ${ctx.def.id}: ${most} point lights within ~14 m of each other in the ${w} world (pool: the 8 nearest Aidan are real) — pass light:false (or real:false) to some`);
    }
    if (!ctx.detached) { try { lintRoom(ctx, rb); } catch (e) { console.error('[Kit] lint', e); } }
    return rb;
  }
  // Build-time authoring checks (warnings, once per room and thing):
  //  * an interactable Aidan can't reach — no floor (any layer) within its use radius from which it is no more than
  //    2.6 m above his feet (World.nearestInteractable drops anything higher as "another level"; an examine may be up
  //    to 5.5 m above a floor with no other floor between — lookUpOK) and no more than 1 m below (a yBand limits the
  //    layers);
  //  * an examine within 0.6 m (XZ) of a door, payphone or ladder: the two compete for the same E press — the
  //    nearer / better-faced one always wins, so one of them can't be used head-on (move it, or give one {prio});
  //  * a seam: two walkable floors of about the same height whose edges run side by side less than 0.5 m apart, with
  //    nothing walkable between them — an invisible strip Aidan can't cross.
  function lintRoom(ctx, rb) {
    const rid = String(ctx.def.id || 'room');
    const outOf = (w) => w === 'outage';
    const overlapW = (a, b) => !a || !b || a === 'both' || b === 'both' || a === b;
    // (every floor layer counts, stacked or not: rooms that sort their floors at run time — a stairwell — stay quiet)
    const layersAt = (x, z, outage) => floorLayers(rb.floors, x, z, outage);
    const r2 = (v) => Math.round(v * 100) / 100;
    // unreachable interactables
    for (const it of rb.interactables) {
      if (it.kind === 'ladder' || !it.pos) continue;
      const outage = outOf(it.world), lim = (it.r ?? 1.2) + 0.1;
      let best = Infinity, any = false, lookUp = false;
      for (const rr of [0, 0.3, 0.6, 0.9, 1.2, 1.6, 2.0]) {
        if (rr > lim) break;
        const n = rr === 0 ? 1 : 12;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, x = it.pos.x + Math.cos(a) * rr, z = it.pos.z + Math.sin(a) * rr;
          for (const y of layersAt(x, z, outage)) {
            if (it.yBand && (y < it.yBand[0] - 0.01 || y > it.yBand[1] + 0.01)) continue;
            any = true;
            const dy = it.pos.y - y;
            if (dy >= -1.0) best = Math.min(best, dy);
            // (an examine of something high up — a wall clock — works from a floor with nothing between: World.reachUp)
            if (!lookUp && it.kind === 'examine' && dy > 2.6 && dy <= 5.5 && lookUpOK(rb.floors, it.pos, x, z, y, outage)) lookUp = true;
          }
        }
      }
      if (!any) continue;                                        // no floor around it at all (a set piece the player never walks)
      if (best > 2.6 && !lookUp) warnOnce(`reach:${rid}:${it.id}`, `[Kit] room ${rid}: ${it.kind} "${it.id}" at (${r2(it.pos.x)}, ${r2(it.pos.y)}, ${r2(it.pos.z)}) is ${best === Infinity ? 'below every floor around it' : r2(best) + ' m above the floor beneath it'} — Aidan can't use it from there (World.nearestInteractable ignores anything over 2.6 m above his feet — 5.5 m for an examine with no floor between — or 1 m below); lower it or give it a yBand on the level it belongs to`);
    }
    // examines competing with a door (or a payphone / ladder — things that stay) for the same E press; interactables
    // whose when() is false at build time (decorative doors, conditional lines) are left out, and so are pickups (the
    // pickup takes the first press, then it's gone and the examine is free)
    const liveNow = (it) => { try { return !it.when || !!it.when(S); } catch (e) { return true; } };
    const hard = rb.interactables.filter((it) => ['door', 'payphone', 'ladder'].includes(it.kind) && it.prio === undefined && liveNow(it));
    for (const ex of rb.interactables) {
      if (ex.kind !== 'examine' || ex.prio !== undefined || !ex.pos || !liveNow(ex)) continue;
      for (const d of hard) {
        if (!overlapW(ex.world, d.world)) continue;
        const dxz = Math.hypot(ex.pos.x - d.pos.x, ex.pos.z - d.pos.z);
        if (dxz >= 0.6 || Math.abs(ex.pos.y - d.pos.y) > 1.6) continue;
        warnOnce(`clash:${rid}:${ex.id}:${d.id}`, `[Kit] room ${rid}: examine "${ex.id}" sits ${r2(dxz)} m from ${d.kind} "${d.id}" — they compete for the same E press (the nearer, better-faced one wins; the ${d.kind} at priority 0, the examine at +0.6 m), so one of them can't be used head-on. Move the examine off the ${d.kind}'s line, or give one of them {prio}`);
      }
    }
    // seams between floors
    const F = rb.floors;
    if (F.length > 1 && F.length < 700) {
      for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
        const a = F[i], b = F[j];
        if (!overlapW(a.world, b.world)) continue;
        const outage = a.world === 'outage' || b.world === 'outage';
        for (const ax of ['x', 'z']) {
          const o = ax === 'x' ? 'z' : 'x';
          const lo = Math.max(a[o + '0'], b[o + '0']), hi = Math.min(a[o + '1'], b[o + '1']);
          if (hi - lo < 0.5) continue;                            // edges must run side by side for at least 0.5 m
          const g1 = b[ax + '0'] - a[ax + '1'], g2 = a[ax + '0'] - b[ax + '1'];
          const gap = g1 > 0 ? g1 : g2 > 0 ? g2 : 0;
          if (!(gap > 0.02 && gap < 0.5)) continue;
          const e0 = g1 > 0 ? a[ax + '1'] : b[ax + '1'], mid = e0 + gap / 2, m2 = (lo + hi) / 2;
          const px = ax === 'x' ? mid : m2, pz = ax === 'x' ? m2 : mid;
          if (floorAt(F, px, pz, outage) !== null) continue;     // something walkable spans the gap
          const ya = rampY(a, ax === 'x' ? a.x1 * (g1 > 0) + a.x0 * (g1 <= 0) : m2, ax === 'z' ? a.z1 * (g1 > 0) + a.z0 * (g1 <= 0) : m2);
          const yb = rampY(b, ax === 'x' ? b.x0 * (g1 > 0) + b.x1 * (g1 <= 0) : m2, ax === 'z' ? b.z0 * (g1 > 0) + b.z1 * (g1 <= 0) : m2);
          if (Math.abs(ya - yb) > 0.45) continue;                 // a step Aidan couldn't take anyway
          const yy = Math.min(ya, yb);                            // a wall standing in the seam: nothing to cross anyway
          if (rb.colliders.some((c) => overlapW(c.world, a.world) && !c.blocker && (c.y || 0) <= yy + 1.2 && (c.y || 0) + c.h >= yy + 0.4 && collide(c, px, pz, 0.02))) continue;
          warnOnce(`seam:${rid}:${i}:${j}:${ax}`, `[Kit] room ${rid}: a ${r2(gap)} m unwalkable seam between two floors at ${ax} ≈ ${r2(mid)} (${o} ${r2(lo)}–${r2(hi)}) — Aidan can't cross it; make the floors meet or overlap`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------------------------
  let last = null;
  function build(def) {
    if (!def) throw new Error('Kit.build: no room def');
    const ctx = newCtx(def);
    ctx.t0 = performance.now();
    const K = makeK(ctx);
    if (typeof def.build === 'function') {
      try { def.build(K); } catch (e) { console.error(`[Kit] room "${def.id}" build failed`, e); }
    }
    finalize(ctx);
    last = ctx.rb;
    return ctx.rb;
  }
  // Kit.prop(kind, opts) → Object3D built outside any room (items screen, Rig.hold, previews). Colliders/interactions
  // are discarded; point lights are not allocated. Per-frame callbacks (blinking LEDs …) are returned in
  // obj.userData.animated (CONTRACT+: call each (dt, t) yourself if you need them).
  function propDetached(kind, opts = {}) {
    const ctx = newCtx({ id: 'prop:' + kind }, true);
    ctx.t0 = performance.now();
    const K = makeK(ctx);
    const g = K.prop(kind, 0, 0, opts.rot || 0, { ...opts, y: 0, collide: false });
    g.removeFromParent();
    if (ctx.rb.animated.length) g.userData.animated = ctx.rb.animated;
    return g;
  }

  // CONTRACT+: Kit.preload(onProgress) → Promise — generate Kit's own Canvas2D textures and the fixed signs in
  // ~12 ms slices (call after Tex.preload during LOADING) so the first room build stays fast.
  function preload(onProgress) {
    const jobs = [
      wiredGlassTex, () => stripeTex(), () => stripeTex('#141414', '#e8c21a'), wallBaseTex, () => markTex('dash'), () => markTex('solid'), shutterTex,
      curtainTex, leafTex, glintTex, phoneFaceTex, clockFaceTex, ...['can', 'cup', 'aid', 'map', 'card'].map((k) => () => labelTex(k)),
      () => writingTex('ROAD CLOSED', 'receipt'), () => Tex.sign('ROAD CLOSED —\nWORKS IN PROGRESS', { style: 'warning', w: 1.3, h: 0.9 }),
      () => Tex.sign('FIRE DOOR\nKEEP CLOSED', { style: 'shop', w: 0.3, h: 0.14, bg: '#9e2a20', fg: '#f3efe6', border: false }),
      () => Tex.sign('PHONE', { style: 'shop', w: 1.0, h: 0.2, bg: '#1f4b73', fg: '#e8eef0', border: false }), () => Tex.label('OLLIE', { style: 'sticker' }),
      ...['FOLLOW UP TOMORROW', 'DID YOU CHECK', "IT'LL BE FINE", 'ASK THEM', 'WHO ARE YOU TRYING TO REACH'].flatMap((t) => [() => writingTex(t, 'fog'), () => writingTex(t, 'marker'), () => writingTex(t, 'receipt')]),
    ];
    return new Promise((resolveP) => {
      let i = 0;
      const step = () => {
        const t0 = performance.now();
        while (i < jobs.length && performance.now() - t0 < 12) { try { jobs[i](); } catch (e) { console.error('[Kit] preload', e); } i++; if (onProgress) onProgress(i, jobs.length); }
        if (i < jobs.length) setTimeout(step, 0); else resolveP(jobs.length);
      };
      step();
    });
  }

  return {
    build, defineProp, PROPS, preload,
    prop: propDetached,
    // CONTRACT+ helpers
    get last() { return last; },                      // the most recent RoomBuild (debugging)
    floorAt, floorLayers, lookUpOK, collide, inBox, matchWorld,  // pure helpers for World
    mat: (spec) => resolveMat(spec).mat,              // resolve a material spec (see header)
    itemModel: (item) => { const d = ITEMS[item]; try { if (d && typeof d.model === 'function') return d.model(); } catch (e) { console.error(e); } return genericItem(item); },
    clock: makeClock,                                 // Kit.clock([h, m]) → wall clock Object3D with userData.setTime/addMinutes
    mergeGeometries: (items) => mergeGeometries(items.map((it) => (it.isBufferGeometry ? { geo: it, m: new THREE.Matrix4() } : it))),
    COLLIDE_RULES,
    tex: { wiredGlass: wiredGlassTex, stripes: stripeTex, shutter: shutterTex, writing: writingTex, doc: docTex },
  };
})();
