// tools/tests/reach.mjs — can a WALKING player reach every exit and door? (The chapter tests teleport into exit boxes,
// which hides exits that a collider in front of them makes unreachable on foot.)
// For every room (Fog world, and the Outage too when the room has Outage-tagged content): load it, flood-fill the
// walkable area on a 0.2 m grid from every entry (the player's circle must be free — World.pointFree — and each step may
// climb at most 0.45 m / drop at most 1 m, like Player), then check that every K.exit box contains a reached point and
// every door (K.door with `to`) has a reached point within 1.4 m of it. Prints the failures and PASS/FAIL.
//   node tools/build.mjs --out .build/reach.html && node tools/run.mjs --file .build/reach.html --script tools/tests/reach.mjs --quiet
//   env: ROOMS=a,b (only these rooms); STATE='{"chapter":5,"flags":{"c5_outage":true}}' (open story gates).
//   Exits whose when() is false in the tested state are closed gates (walls on purpose) and are skipped.
export default async (page, h) => {
  const only = (process.env.ROOMS || '').split(',').filter(Boolean);
  await h.eval(`await SH.newGame({ skipIntro: true }); await SH.advance(1); return 1`);
  // optional state for gated exits: STATE='{"chapter":5,"flags":{"c5_outage":true}}'
  if (process.env.STATE) await h.eval(`const st = ${process.env.STATE}; if (st.chapter != null) SH.S.chapter = st.chapter; Object.assign(SH.S.flags, st.flags || {}); return 1`);
  const rooms = await h.eval(`return Object.keys(SH.mod.ROOMS).filter(id => !/^(test_|t_title|__)/.test(id) && !SH.mod.ROOMS[id].cutsceneOnly)`);
  const bad = [];
  let checked = 0;
  for (const id of rooms) {
    if (only.length && !only.includes(id)) continue;
    for (const world of ['fog', 'outage']) {
      const res = await h.eval(`
        const { World, ROOMS } = SH.mod; const S = SH.S;
        S.outage = ${world === 'outage'};
        try { await SH.goto(${JSON.stringify(id)}, null); } catch (e) { return { err: String(e) }; }
        await SH.advance(0.2);
        const b = World.build; if (!b) return { err: 'no build' };
        if (${world === 'outage'} && !(b.tagged || []).some(t => t.world === 'outage') && !(b.colliders || []).some(c => c.world === 'outage')) return { skip: true };
        const def = ROOMS[${JSON.stringify(id)}];
        const bd = def.bounds || [-50, -50, 50, 50];
        const G = 0.2, x0 = Math.min(bd[0], bd[2]) - 2, z0 = Math.min(bd[1], bd[3]) - 2, nx = Math.ceil((Math.abs(bd[2] - bd[0]) + 4) / G), nz = Math.ceil((Math.abs(bd[3] - bd[1]) + 4) / G);
        if (nx * nz > 3e6) return { err: 'room too large for the grid ' + nx + 'x' + nz };
        const seen = new Uint8Array(nx * nz), q = [];
        const free = (i, j) => World.pointFree(x0 + i * G, z0 + j * G, 0.3);
        const hAt = (i, j) => World.heightAt(x0 + i * G, z0 + j * G);
        for (const [k, e] of Object.entries(def.entries || {})) {
          const i = Math.round((e[0] - x0) / G), j = Math.round((e[1] - z0) / G);
          for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < nx && c < nz && !seen[a + c * nx] && free(a, c)) { seen[a + c * nx] = 1; q.push(a + c * nx); } }
        }
        while (q.length) {
          const p = q.pop(), i = p % nx, j = (p - i) / nx, y = hAt(i, j);
          for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
            const k = a + c * nx; if (seen[k]) continue;
            const y2 = hAt(a, c); if (y2 === null || y === null || y2 - y > 0.45 || y - y2 > 1.0) continue;
            if (!free(a, c)) continue;
            seen[k] = 1; q.push(k);
          }
        }
        const reached = (x, z) => { const i = Math.round((x - x0) / G), j = Math.round((z - z0) / G); return i >= 0 && j >= 0 && i < nx && j < nz && seen[i + j * nx]; };
        const fails = [];
        for (const ex of (b.exits || [])) {
          if (ex.world && ex.world !== 'both' && ex.world !== ${JSON.stringify(world)}) continue;
          let open = true; try { open = !ex.when || !!ex.when(S); } catch (e) { open = true; }
          if (!open) continue;                                   // a closed gate is a wall on purpose (its blockedMsg)
          const bx = ex.box; let ok = false;
          for (let x = Math.min(bx[0], bx[2]); x <= Math.max(bx[0], bx[2]) + 1e-6 && !ok; x += 0.1) for (let z = Math.min(bx[1], bx[3]); z <= Math.max(bx[1], bx[3]) + 1e-6 && !ok; z += 0.1) if (reached(x, z)) ok = true;
          if (!ok) fails.push('exit ' + ex.id + ' → ' + ex.to + ' box ' + JSON.stringify(bx));
        }
        for (const d of Object.values(b.doors || {})) {
          if (!d.to) continue;
          if (d.world && d.world !== 'both' && d.world !== ${JSON.stringify(world)}) continue;
          let ok = false;
          for (let dx = -1.4; dx <= 1.4 && !ok; dx += 0.2) for (let dz = -1.4; dz <= 1.4 && !ok; dz += 0.2) if (Math.hypot(dx, dz) <= 1.4 && reached(d.x + dx, d.z + dz)) ok = true;
          if (!ok) fails.push('door ' + d.id + ' → ' + d.to + ' at ' + d.x + ',' + d.z);
        }
        let n = 0; for (let k = 0; k < seen.length; k++) n += seen[k];
        return { fails, cells: n };`);
      if (res.skip) continue;
      checked++;
      if (res.err) { bad.push(`${id} [${world}]: ${res.err}`); continue; }
      if (!res.cells) bad.push(`${id} [${world}]: no walkable cell reached from its entries`);
      for (const f of res.fails) bad.push(`${id} [${world}]: ${f}`);
    }
  }
  for (const b of bad) console.log('UNREACHABLE', b);
  console.log(`${bad.length ? 'FAIL' : 'PASS'} reach — ${checked} room/world loads, ${bad.length} problem(s)`);
};
