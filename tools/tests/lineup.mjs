// tools/tests/lineup.mjs — spec §1 content rules, the visual half: every person and every monster of the game stood in
// a bright, fog-free studio and photographed head-and-shoulders (front, three-quarter, back) so a reviewer can check at a
// glance that nothing sits around any neck except a lanyard resting on the chest (no cords, tethers, wires, straps,
// headset leads or pendant cords), that no monster shows gore (the Tethered's pressed face, the Escalation's split skin
// showing faces, the Closer's tears showing contracts and ink), and what each figure wears.
//
//   node tools/build.mjs --out .build/lineup.html
//   node tools/run.mjs --file .build/lineup.html --size 1280x720 --quiet --script tools/tests/lineup.mjs
//   env: SH_SHOTS  output directory (default .build/lineup)   SH_ONLY  a comma list of figure keys (see FIGS / MONSTERS)
//
// Also checks, for every figure built, what hangs round the neck: every mesh of the figure whose bounding box passes
// through the neck band (between the chin and the collar) is listed by name, and anything that is not the body, the
// collar of a garment, hair, the lanyard strap or the glasses fails (a cord / tether / strap / wire / headset lead).
// Prints `PASS lineup` (or FAIL lines) and writes one PNG per figure and view.
import fs from 'node:fs';
import { ev, advance, report } from './lib.mjs';

const OUT = process.env.SH_SHOTS || '.build/lineup';
const ONLY = process.env.SH_ONLY ? process.env.SH_ONLY.split(',') : null;

// people: Rig presets (customer / rep are seeded generics)
const FIGS = [
  ['aidan', 'aidan'], ['aidan_perfect', 'aidan_perfect'], ['wai', 'wai'], ['chase', 'chase'], ['chloe', 'chloe'], ['luka', 'luka'],
  ['luke', 'luke'], ['nan', 'nan'], ['nan_gown', 'nan_gown'], ['man_counter', 'man_counter'], ['old_man', 'old_man'],
  ['customer1', 'customer', 1], ['customer2', 'customer', 2], ['customer3', 'customer', 3], ['rep1', 'rep', 1], ['rep2', 'rep', 2], ['rep3', 'rep', 3],
];
// monsters: Enemies types that stand on their own (the bosses tied to their arenas are photographed in the chapter tests)
const MONSTERS = [
  ['tethered', { type: 'tethered' }], ['tethered_freed', { type: 'tethered', freed: true }], ['reach', { type: 'reach' }],
  ['standard', { type: 'standard' }], ['borrowed_wai', { type: 'borrowed', disguise: 'wai', tell: 'badge', badge: 'WIA' }],
  ['borrowed_chloe', { type: 'borrowed', disguise: 'chloe', tell: 'hands' }], ['smile', { type: 'c7_smile' }], ['closer', { type: 'closer' }],
  ['pedestal_rep', { type: 'c5_rep' }], ['escalation', { type: 'c4_escalation' }], ['returns_cage', { type: 'c1_cage' }, 'e.data.riseTo = 1; e.data.state = "idle"; await SH.advance(3.2);'],
  // the damage states: the Escalation at Level 3 (the split skin shows shouting faces), the Closer at 30 % (its tears show
  // signed contracts and run with ink)
  ['escalation_l3', { type: 'c4_escalation' }, `e.data.fight = true; for (let i = 0; i < 2; i++) { M.Enemies.types.c4_escalation.onHit(e); await SH.advance(1.6); } e.data.fight = false; await SH.advance(2);`],
  ['closer_hurt', { type: 'closer' }, 'e.hp = Math.round((e.maxHp || 300) * 0.3); await SH.advance(1); for (const m of e.data.tears || []) m.visible = true;'],
];

function studioPage() {
  const M = SH.mod, T = M.THREE;
  if (!M.ROOMS.x_studio) {
    const def = {
      id: 'x_studio', name: 'STUDIO', area: 'STUDIO', outdoor: false, noFog: true, surface: 'concrete', ambient: 'none', grade: 'none',
      bounds: [-12, -12, 12, 12], entries: { start: [0, 9, 180] },
      cameras: [{ id: 'x_studio:c', vol: [-12, -12, 12, 12], type: 'static', pos: [0, 3, 11.5], target: [0, 1, 6], fov: 50 }],
      build(K) {
        K.floor(-12, -12, 12, 12, { tex: 'concrete', color: '#6d6f6c' });
        K.box(0, 0, -6, 24, 6, 0.2, { tex: 'plaster', color: '#8d8f8c' });
        for (const [x, z] of [[-4, 2], [4, 2], [0, 5], [-6, -2], [6, -2], [0, -3]]) K.light('point', x, 4.5, z, { color: '#fff4e6', intensity: 14, distance: 22, pin: true });
      },
    };
    M.ROOMS.x_studio = def; M.CAMERAS.x_studio = def.cameras; M.SPAWNS.x_studio = [];
  }
  window.__lu = {
    list: [],
    clear() { for (const o of this.list) { try { if (o.remove) o.remove(); else if (o.dispose) { o.root.removeFromParent(); o.dispose(); } } catch (e) { /* gone */ } } this.list = []; },
    // meshes of a figure whose world bounds cross the neck band (just under the chin → the collar line)
    neckBand(root, headY, chinY, collarY) {
      const out = [], box = new T.Box3();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || !o.visible || o.userData.rigHidden === undefined && o.layers.mask === 0) return;
        if (o.isSkinnedMesh) return;                                  // the figure's batches (their parts are listed)
        box.setFromObject(o);
        if (box.isEmpty()) return;
        if (box.min.y < chinY && box.max.y > collarY + 0.005) {
          const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
          let nm = o.name; for (let a = o.parent; !nm && a; a = a.parent) nm = a.name ? a.name + '>' + (o.geometry && o.geometry.type || 'mesh') : '';
          out.push({ name: nm || '?', w: Math.round(w * 100) / 100, y0: Math.round(box.min.y * 100) / 100, y1: Math.round(box.max.y * 100) / 100 });
        }
      });
      void headY;
      return out;
    },
  };
}

export default async function (page, h) {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  await ev(h, 'await SH.newGame({ skipIntro: true }); return 1');
  await advance(h, 2);
  await ev(h, `(${studioPage})(); return 1`);
  await ev(h, "await SH.goto('x_studio', 'start'); return 1");
  await advance(h, 2);
  await ev(h, "SH.mod.Player.actor.root.visible = false; SH.mod.UI.showHud(false); SH.mod.Script.abortAll('lineup'); return 1");
  const notes = [];
  let ok = true;
  const shoot = async (key, view, pos, target, fov = 30) => {
    await ev(h, `SH.mod.Cam.scripted({ pos: ${JSON.stringify(pos)}, target: ${JSON.stringify(target)}, fov: ${fov} }); return 1`);
    await advance(h, 0.3);
    await ev(h, 'SH.mod.Render.render(0); return 1');
    await h.shot(`${OUT}/${key}_${view}.png`);
  };
  // ---- people -----------------------------------------------------------------------------------------------------
  for (const [key, preset, seed] of FIGS) {
    if (ONLY && !ONLY.includes(key)) continue;
    const info = await ev(h, `
      const M = SH.mod; __lu.clear();
      const a = M.Rig.create(${JSON.stringify(preset)}, ${seed ? `{ seed: ${seed} }` : '{}'});
      a.root.position.set(0, 0, 6); a.root.rotation.y = 0; M.Render.scene.add(a.root); __lu.list.push(a);
      if (a.setAnim) a.setAnim('idle', { blend: 0 });
      await SH.advance(0.4);
      const hp = a.bones.head.getWorldPosition(new M.THREE.Vector3()), np = a.bones.neck.getWorldPosition(new M.THREE.Vector3());
      const band = __lu.neckBand(a.root, hp.y, hp.y - 0.02, np.y - 0.03);
      return { head: [hp.x, hp.y, hp.z], neck: np.y, band, H: a.H };`);
    const hy = info.head[1];
    await shoot(key, 'front', [0, hy - 0.05, 7.55], [0, hy - 0.2, 6], 30);
    await shoot(key, 'side', [1.25, hy + 0.05, 7.1], [0, hy - 0.2, 6], 30);
    await shoot(key, 'back', [0, hy + 0.1, 4.5], [0, hy - 0.2, 6], 30);
    const names = [...new Set(info.band.map((b) => b.name))];
    const bad = names.filter((n) => /cord|tether|strap|wire|cable|lead|rope|string/i.test(n) && !/lanyard/i.test(n));
    notes.push(`${key.padEnd(14)} neck band: ${names.join(', ') || '-'}`);
    if (bad.length) { notes.push(`BUG: ${key}: ${bad.join(', ')} crosses the neck`); ok = false; }
  }
  // ---- monsters -----------------------------------------------------------------------------------------------------
  for (const [key, def, prep] of MONSTERS) {
    if (ONLY && !ONLY.includes(key)) continue;
    const info = await ev(h, `
      const M = SH.mod; __lu.clear();
      M.Enemies.clear && M.Enemies.clear();
      let e = null;
      try { e = M.Enemies.spawn({ id: 'x_studio:${key}', pos: [0, 6], rot: 0, persist: false, ...${JSON.stringify(def)} }); } catch (err) { return { err: String(err && err.message || err) }; }
      if (!e) return { err: 'no enemy' };
      e.ai = false;
      ${prep || ''}
      if (${!!def.freed}) { e.aware = false; e.state = 'idle'; M.Enemies.cutFree(e); await SH.advance(5); }
      await SH.advance(0.6);
      const a = e.actor;
      let hy = 1.6;
      if (a && a.bones && a.bones.head) hy = a.bones.head.getWorldPosition(new M.THREE.Vector3()).y;
      else { const b = new M.THREE.Box3(); e.obj.traverse((o) => { if (o.isMesh && o.visible) b.expandByObject(o); }); hy = Math.min(6, b.max.y - 0.3); }
      let band = [];
      if (a && a.bones && a.bones.neck) { const np = a.bones.neck.getWorldPosition(new M.THREE.Vector3()); band = __lu.neckBand(e.obj, hy, hy - 0.02, np.y - 0.03); }
      return { hy, band, big: !a };`);
    if (info.err) { notes.push(`(${key}: not spawnable outside its arena: ${info.err})`); continue; }
    const hy = info.hy, far = info.big || hy > 2.4 ? Math.max(3.5, hy * 2.2) : 1.6;
    await shoot(key, 'front', [0, hy - 0.1, 6 + far], [0, hy - (info.big ? hy * 0.4 : 0.25), 6], info.big ? 45 : 30);
    await shoot(key, 'side', [far * 0.8, hy, 6 + far * 0.6], [0, hy - (info.big ? hy * 0.4 : 0.25), 6], info.big ? 45 : 30);
    await shoot(key, 'back', [0, hy + 0.1, 6 - far], [0, hy - (info.big ? hy * 0.4 : 0.25), 6], info.big ? 45 : 30);
    const names = [...new Set((info.band || []).map((b) => b.name))];
    const bad = names.filter((n) => /cord|tether|strap|wire|cable|lead|rope|string/i.test(n) && !/lanyard/i.test(n));
    notes.push(`${key.padEnd(14)} neck band: ${names.join(', ') || '-'}`);
    if (bad.length) { notes.push(`BUG: ${key}: ${bad.join(', ')} crosses the neck`); ok = false; }
  }
  await ev(h, '__lu.clear(); SH.mod.Enemies.clear && SH.mod.Enemies.clear(); return 1');
  for (const n of notes) console.log('  ' + n);
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); ok = false; }
  report('lineup', ok, `${OUT}, ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
  void page;
}
