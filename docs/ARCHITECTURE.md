# Signal Hill — Architecture Contract

This is the binding contract between every engine module and every content file. The game design itself is in
`docs/BUILD_PROMPT.md` (the "spec"); section numbers below (§2A, §6 …) refer to it. When this document and the spec
disagree about *behaviour*, the spec wins; when they disagree about *code shape / names / signatures*, this document wins.

If you need an API that is not listed here, add it to the module that owns that concern, keep the existing
signatures working, and document the addition in a `// CONTRACT+:` comment at the definition so integrators can find it.

---

## 1. Build and files

```
src/shell.html            HTML shell: <style>, import map, and a single <script type="module"> with //__GAME__ marker
src/engine/NN_name.js     engine modules, concatenated in filename order
src/data/NN_name.js       content (data + content scripts), concatenated after the engine, in filename order
src/main.js               last: boots the game (Game.boot())
tools/build.mjs           concatenates everything into ONE file: ./signal-hill.html  (the deliverable)
tools/lint.mjs            parses + lints the built file (acorn syntax check, eslint no-undef/no-redeclare/etc.)
tools/run.mjs             headless Chromium harness (see §14)
```

`node tools/build.mjs [--out path]` → writes the single HTML file (default `./signal-hill.html`).
`node tools/lint.mjs [path]` → exit code 0 when clean. **Always build + lint before you finish.**

All source files are concatenated into **one ES module scope**. Consequences:

* A top-level `const`/`let`/`function`/`class` name must be unique across the whole game. Engine modules therefore
  expose exactly one top-level constant each (the module object, e.g. `const Kit = (() => { … return {…}; })();`).
  Everything else lives inside the IIFE. Data files use the `define*` functions and must not declare top-level
  names except with a file-unique prefix (e.g. `const C3_FUSES = …`). Prefer wrapping a data file in `{ … }`.
* A module may reference a *later* module only inside functions that run after boot (never at IIFE-evaluation time).
  Earlier modules may be referenced at evaluation time.
* Imports (only these, done once in the shell by `00_core.js` header):
  `import * as THREE from 'three';`
  `import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';`
  `import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';`
  `import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';`
  The import map points `three` and `three/addons/` at `https://cdn.jsdelivr.net/npm/three@0.170.0/…`.
  **No other network request, ever.** No image/audio/font/model files. Canvas 2D for textures, Web Audio for sound,
  system fonts only.
* No `eval`, no `new Function`, no workers loaded from URLs.

## 2. Module map and ownership

| File | Global | Owns |
| --- | --- | --- |
| `engine/00_core.js` | `U`, `Bus`, `Time`, `S`, `META`, registries, `define*`, `track`, `newState` | utilities, state, registries |
| `engine/01_input.js` | `Input` | keyboard, mouse, gamepad, action mapping, rumble |
| `engine/02_audio.js` | `Snd` | all Web Audio synthesis |
| `engine/03_textures.js` | `Tex` | Canvas2D textures, kit materials, Fog/Outage dissolve material |
| `engine/04_render.js` | `Render` | renderer, low-res target, post chain, fog, fog sheets, dead-air, light pool, halos |
| `engine/05_kit.js` | `Kit` | room builder `K`, structural pieces, prop registry, collision/interactable registration |
| `engine/05b_props.js` | (none; calls `Kit.defineProp`) | the prop library |
| `engine/06_rig.js` | `Rig` | the one human-figure builder, character presets, procedural animation, faces |
| `engine/07_camera.js` | `Cam` | fixed-camera volumes, static/pan/rail/scripted cameras, shake, volume check |
| `engine/08_player.js` | `Player` | Aidan: movement, stamina, health, torch, interaction look, combat, ladders, struggle |
| `engine/09_world.js` | `World` | room load/unload/transition, collision queries, triggers, exits, doors, interactables, Outage |
| `engine/10_ui.js` | `UI` | in-game overlays: subtitles, messages, prompts, letterbox, fades, cards, choices, keypads, call prompt, bars, stamps |
| `engine/10b_menus.js` | `Menus` | title, new game, calibration, pause, items (3D), map, memos, phone, options, save/load, death, results, credits, fate cards, extra |
| `engine/11_script.js` | `Script` | async script runner, cutscenes, the `G` API |
| `engine/12_enemies.js` | `Enemies` | the five common monsters, enemy framework, hit tests, threat queries, the Standard's cross-room graph |
| `engine/13_phone.js` | `Phone` | signal bars, monster tells, static, calls, voicemails, notes, phone model/screen |
| `engine/14_save.js` | `Save` | localStorage slots, autosave, meta |
| `engine/15_debug.js` | `Debug` | backtick overlay, chapter select, presets, camera-volume check, `window.SH` test API |
| `engine/16_game.js` | `Game` | boot, main loop, mode state machine, chapters, death, endings flow, results, NG+ |
| `data/00_items.js` | — | `ITEMS` |
| `data/01_documents.js` | — | `DOCUMENTS` (spec §13, exact text) |
| `data/02_calls.js` | — | `CALLS`, shared `DIALOGUE` (Wai payphone lines, desk-phone snippets …) |
| `data/03_maps.js` | — | `MAPS` |
| `data/10_prologue.js` … `data/18_ch8.js` | — | rooms/cameras/cutscenes/spawns/chapter def per chapter (+ that chapter's boss) |
| `data/19_endings.js` | — | ending cutscenes, fate cards, credits text, Yes ending |
| `data/20_title.js` | — | title backdrop room + attract sequence shots |
| `data/99_testroom.js` | — | `test_room`: a room exercising every engine feature (debug only) |

## 3. Core (`00_core.js`) — already written, read it

* `U` — math/random helpers: `clamp, lerp, invLerp, smooth(t), damp(a,b,lambda,dt), wrapAngle, angleDiff, deg, rad,
  dist2(ax,az,bx,bz), rng(seed) → () => [0,1), hash(str), pick(arr, r), ease.{linear,in,out,inOut,sine,back}`,
  `fmtTime(sec) → "1:02:03"`, `readTime(text) → max(1.8, 0.06*len)`.
* `Bus` — `on(ev, fn) → off()`, `off(ev, fn)`, `emit(ev, ...a)`, `once(ev, fn)`.
  Standard events: `room:enter(roomId)`, `room:leave(roomId)`, `cam:cut(camDef)`, `outage(on)`, `pickup(itemId)`,
  `doc(docId)`, `damage(n, source)`, `death`, `enemy:freed(e)`, `enemy:killed(e)`, `chapter(n)`, `call:ring(id)`,
  `call:end(id, how)`, `save(slot)`, `track(kind, n, reason)`, `flag(name, v)`, `menu(open, name)`.
* `Time` — `{ now, real, dt, frame, paused }`. `now` = game seconds (does not advance while paused/menu).
* Registries (plain objects keyed by id unless noted):
  `ROOMS, CAMERAS, CUTSCENES, DIALOGUE, DOCUMENTS, CALLS, ITEMS, SPAWNS, CHAPTERS (array by n), MAPS, BOSSES, SCRIPTS, PROPS`.
* Registration functions (use these; never write registries directly):
  `defineRoom(def)`, `defineCutscene(id, fn, opts)`, `defineScript(id, fn)`, `defineDialogue(id, lines)`,
  `defineDoc(def)`, `defineCall(def)`, `defineItem(def)`, `defineChapter(def)`, `defineMap(def)`, `defineBoss(id, def)`.
* State: global `S` (the save-able game state, JSON-serialisable, see §4) and `META` (persistent across playthroughs).
  `resetState(opts)` replaces `S` with `newState(opts)`.
* `track(kind, n, reason)` — `kind` is `'F'` or `'A'`; adds to `S.F`/`S.A`, emits `track`.
* `setFlag(name, v=true)`, `flag(name)` — `S.flags`.
* `once(id)` → `true` the first time it is called for that id in this playthrough (stored in `S.done`).
* `DIFF` — difficulty helpers: `DIFF.dmg(n)` (enemy damage after Action level), `DIFF.rage()` (rage multiplier),
  `DIFF.pickup(kind)` → `true` if a placed heal pickup should exist (Easy spawns extra via `extraOnEasy`, Hard drops 30%
  deterministically by pickup id hash), `DIFF.riddle()` → `'easy'|'normal'|'hard'`.

## 4. Game state `S` (save-able)

```js
S = {
  v: 1, playthrough: 1, ngPlus: false,
  difficulty: { action: 'normal', riddle: 'normal' },
  chapter: 0,                         // 0 = Prologue … 8 = The Mast; 9 = ending
  room: null, pos: [0,0,0], yaw: 0,   // restored on load
  outage: false,                      // which world is showing
  health: 100,
  F: 0, A: 0,
  flags: { waiSaved:false, chaseSaved:false, chloeSaved:false, lukaSaved:false, lukeSaved:false, acceptedDeal:false },
  chaseHits: 0,
  inv: [ { id:'coffee', n:1 } ],      // everything carried; category comes from ITEMS[id].cat
  equipped: null,                     // weapon item id
  ammo: { extinguisher: 6 },
  docs: { acct1: { read:true } },     // memos found (read=false shows the unread dot)
  maps: { town:true },                // map ids owned
  mapMarks: {},                       // manual marks { id: {map, floor, t:'x'|'circle'|'tick'|'note'|'arrow', x, y, text} }
  calls: { luka1: 'answered' },       // or 'declined'
  voicemails: [ { id:'luka2', played:false } ],
  notes: [ { text, done:false } ],    // phone Notes journal, newest last
  taken: {},                          // pickup ids already collected
  done: {},                           // once()-ids, triggers fired, cutscenes seen, counters
  spawns: {},                         // spawnId → 'freed' | 'dead'
  freedOrder: [],                     // spawn ids of freed Tethered in order
  stickers: {},                       // Ollie stickers found this run
  waiLine: 0,                         // next Wai payphone line index
  saves: 0,
  stats: { time:0, walked:0, ran:0, freed:0, stomped:0, killed:0, itemsUsed:0, damage:0,
           voicemails:0, callsAnswered:0, memos:0 },
}
META = { endingsSeen:[], results:[], stickers:{}, calibrated:false, completed:false,
         options:{ brightness:1, noise:true, grain:1, subs:'medium', control:'camera', shake:true,
                   master:0.9, effects:0.9, music:0.8, invertExamine:false, vibration:true } }
```

Everything that must survive a save lives in `S`. Rooms rebuild their state from `S` (e.g. a pickup whose id is in
`S.taken` is not built; a Tethered whose spawn id is in `S.spawns` is built dead/sitting).

**IDs are global.** Convention: `<roomId>:<local>` for pickups, triggers, spawns and interactables
(e.g. `c1_security:bar`). Cutscene ids use the spec's numbering: `P-1`, `1-1`, `2-3`, `3-3`, `3-3alt`, `E-C1` …

## 5. Coordinates, rooms and the kit

* 1 unit = 1 m, Y up. Each room has its own local coordinate space; only one room is loaded at a time.
* A room is built fresh on entry by its `build(K)` function and disposed on exit.
* The player is a circle of radius 0.3 on the XZ plane; collision is 2D (XZ) with per-collider heights.
  Floors can slope (ramps) — `World.heightAt(x,z)` gives the floor height.

### 5.1 `defineRoom(def)`

```js
defineRoom({
  id: 'c1_security',
  name: 'SECURITY OFFICE',            // not shown; for debug
  area: 'SIGNAL HILL PLAZA',          // shown top-right in pause ("HILLTOP VILLAGE — ???" added automatically in Outage)
  map: { id:'plaza', floor:'G', xform:[ox, oz, scale, rotDeg] },  // room coords → map canvas coords (see §10.6)
  chapter: 1,                         // owning chapter (for "It won't open. Not anymore." locking)
  outdoor: false,                     // outdoor: fog density 0.075 + dead-air specks + fog sheets; indoor 0.03
  fog: null,                          // optional override { density, color }
  surface: 'lino',                    // default footstep surface: tile|carpet|lino|bitumen|gravel|metal|ladder|concrete|wood|grass|vinyl
  ambient: 'interior',                // Snd ambient bed name (see §7); outage bed is automatic when S.outage
  bounds: [x0, z0, x1, z1],           // for debug/noclip/camera check
  entries: { door: [x, z, yawDeg], start: [x, z, yawDeg] },   // named spawn points
  cameras: [ /* §8 */ ],              // stored in CAMERAS[id]
  spawns:  [ /* §9 */ ],              // stored in SPAWNS[id]
  build(K) { /* geometry, props, lights, interactables, exits, triggers */ },
  async onEnter(G, fromRoomId) { },   // optional: runs after the fade-in starts
  onUpdate(dt) { },                   // optional per-frame hook while loaded
  onLeave() { },                      // optional
});
```

### 5.2 The room builder `K` (passed to `build`)

Units are metres, angles are **degrees** (yaw 0 = facing +Z, 90 = facing +X). `y` defaults to the floor height.
Every creator accepts `opts.world: 'fog' | 'outage' | 'both'` (default `'both'`) — objects/colliders tagged with a
world exist only while that world is showing (World toggles them during the Outage transition). `K.fogOnly(fn)` /
`K.outageOnly(fn)` tag everything created inside `fn`.

Geometry:
* `K.floor(x0,z0,x1,z1, mat='lino', {y=0, ramp:{axis:'x'|'z', y0, y1}, uv:1})` — floor mesh **and** walkable height region.
* `K.ceiling(x0,z0,x1,z1, y=3, mat='ceiling_tile')`
* `K.wall(x0,z0,x1,z1, h=3, mat='plaster', {thick=0.15, y=0, openings:[{at, w, h=2.1, sill=0}], collide=true, both=true})`
  — a wall along a segment; `at` = distance along the segment to the opening's centre. Collides by default.
* `K.roomBox(x0,z0,x1,z1, {h=3, floor, wall, ceiling, doors:[{side:'n'|'s'|'e'|'w', at, w=1}], windows:[{side, at, w, h, sill}]})`
  — convenience: floor + ceiling + four walls with openings.
* `K.box(x,y,z, sx,sy,sz, mat, {rot=0, collide=false, world, name, shadow=true})` — y is the **bottom**; x,z the centre.
* `K.cyl(x,y,z, r, h, mat, {r2, seg=12, collide, …})`, `K.sphere(x,y,z,r,mat,{…})`
* `K.plane(x,y,z, w,h, matOrTex, {rot:[rx,ry,rz] (deg), double, emissive, transparent})` — decals, posters, screens.
* `K.sign(text, x,y,z, w,h, {rotY, style:'optus'|'street'|'shop'|'plaque'|'warning'|'council'|'handwritten'|'hospital'|'office', emissive, bg, fg})`
* `K.stairs(x0,z0,x1,z1, y0,y1, {axis:'x'|'z', steps, mat})` — visual steps + ramp height region.
* `K.mesh(object3D, {collide:[x0,z0,x1,z1]|'auto', h, world, name})` — add any custom Object3D.
* `K.collider(x0,z0,x1,z1, {h=2.5, world, name})` — invisible AABB collider.
* `K.colliderRot(cx,cz, w,d, rotDeg, {h, world})` — oriented box collider.
* `K.blocker(x0,z0,x1,z1, msg, {world})` — invisible collider that shows `msg` ("The road ends here.") when walked into (once per contact).
* `K.drop(x0,z0,x1,z1, {sign:true, barrier:true, msg:"The road ends here."})` — road end: sheer drop into white fog,
  barrier, "ROAD CLOSED — WORKS IN PROGRESS" sign, blocker. In the Outage it renders as a trench of tangled cable.
* `K.fogWall(x0,z0,x1,z1, msg)` — thick fog visual + soft blocker (turns the player around).
* `K.prop(kind, x, z, rotDeg=0, opts={})` → Object3D — from the prop library (§5.3). Common opts:
  `{y, scale, world, collide (default per prop), examine (string|string[]|async fn), name, text, color, variant, lit}`.
* `K.light(kind, x,y,z, opts)` → handle `{ on(bool), intensity, flicker(bool), obj }`. Kinds:
  `'street'` sodium orange point + halo sprite; `'fluoro'` cool tube (opts.flicker); `'lamp'` warm desk lamp;
  `'screen'` weak coloured glow; `'led'` tiny emissive dot (no real light; opts.blink, color); `'point'` generic
  (`color, intensity, distance`); `'spot'` (`target:[x,y,z], angle`). Lights take `world` and `bank` (number; banks die
  in order toward the camera during the Outage). Real lights come from a fixed pool (max 8 point + 2 spot per room).
* `K.ambient(color, intensity)` — room ambient/hemisphere level (keep very low; defaults are fine).

Interaction (all return a handle with `.remove()`, `.enable(bool)`):
* `K.examine(x,y,z, lines, {r=1.2, id, when, once, name})` — `lines`: a string (one thought), an array (shown in order,
  then the last repeats), or `async (G) => {}`. Examine thoughts are Aidan's italic subtitles; `[beat]` allowed.
* `K.interact(x,y,z, fn, {r=1.2, id, when, name, hold:0, holdText, look:true})` — `fn(G)`; `hold>0` means hold E for
  that many seconds (progress shown by `UI.holdPrompt`).
* `K.pickup(itemId, x,y,z, {id, n=1, msg, model=true, when, heal:true})` — skipped if `S.taken[id]`. Heal pickups obey
  `DIFF.pickup`. Picking up shows "Aidan picked up the <name>." (or `msg`).
* `K.doc(docId, x,y,z, {id, model:'paper'|'sticky'|'binder'|'board'|'none', open:true})` — memo; reading it opens the
  reading view and adds it to Memos; applies the document's `track`.
* `K.payphone(x,z,rotDeg, {id, wall:false})` — save point (booth or wall phone prop + the §2A save flow).
* `K.breakTable(x,z,rotDeg, {id})` — the chapter's 15-minute-break table (+ wall clock prop); once per chapter.
* `K.npc(id, preset, x,z,rotDeg, {anim, talk:async G=>{}, examine, when, world})` → Rig actor placed in the room and
  registered for `G.actor(id)`; `talk` runs on E.
* `K.door({id, x,z, rot, w=0.9, h=2.1, style:'wood'|'glass'|'metal'|'fire'|'roller'|'glass_double'|'wired',
  to, entry, locked, lockMsg, key, openMsg, world, when, chapterLock:true})` — a door.
  With `to`: E performs a room transition (1.5 s black + door sounds) to `to`/`entry`.
  Without `to`: an in-room door that swings open/closed (its collider toggles; enemies respect it; the Standard opens it).
  `locked`: `true | false | fn(S)→bool`; `key`: item id that unlocks it ("The key fits." / "Used the <key>.");
  `lockMsg` defaults to "It's locked.". When the room's chapter is over and `chapterLock` is true, the message is
  "It won't open. Not anymore."
* `K.exit({id, box:[x0,z0,x1,z1], to, entry, when, blockedMsg, fade=true, sound:'none'|'door'|'steps'})` — walking into
  the box transitions rooms (streets). `when(S)` false → acts as blocker with `blockedMsg`.
* `K.trigger(box, fn, {id, once=true, when, world, enter=true})` — runs `fn(G)` when the player enters the box.
* `K.ladder(x,z,rotDeg, y0,y1, {id, top:[x,z], bottom:[x,z]})` — climbable (Player enters climb mode).
* `K.mark(name, x,y,z, rotDeg)` — named point for scripts/cutscenes (`G.pos(name)`, actor `.place(name)`).
* `K.region(name, [x0,z0,x1,z1])` — named box for scripts (`G.region(name)`).
* `K.obj(name, object3D)` — register an object for scripts (`G.obj(name)`).
* `K.sticker(id, x,y,z, rotDeg)` — hidden Ollie sticker (12 total across the game).
* `K.dress(kind, [x0,z0,x1,z1], count, {seed})` — scatter clutter (`'papers','leaves','boxes','receipts','cables','contracts','cups'`).
* `K.rng` — seeded random for the room (stable dressing).
* `K.group` — the room's root `THREE.Group`; `K.room` — the def; `K.S` — state (read-only use).

### 5.3 Props (`Kit.defineProp(kind, builder)`)

`builder(K, opts) → THREE.Object3D` built from primitives and `Tex` materials, origin at floor centre, facing +Z.
The builder may call `K.collider…` itself; otherwise `collide:true` uses the prop's bounding box. Required kinds
(the prop library must provide all of them; content may define more):

Street: `streetlight, power_pole, letterbox, bench, bench_plaque, bus_shelter, payphone_booth, payphone_wall,
barrier, road_sign, sign_post, guardrail (opts.len), fence (len), chainlink (len,h), gum_tree, shrub, car (color),
hatchback, bin, traffic_light, shopfront (w, name, shutter), house (w,d), cottage, bollard, boom_gate, cable_drum,
substation, fountain, escalator, planter, gnome, pansies, dumpster, pallet, roller_door (open 0..1), cone,
mast (h), floodlight, hut (w,d)`.
Interior: `counter (len), demo_table, accessory_wall (len), shelf (len,h), desk, office_chair, chair, stool, table,
cafe_table, locker_bank (n), microwave, fridge, sink_bench (len), corkboard, whiteboard, clock (time), tv, monitor,
crt, cctv_bank, terminal, printer, photocopier, filing_cabinet, binders_shelf (len), couch, bed, hospital_bed,
dresser, bedside_table, phone_table, answering_machine, desk_phone, rotary_phone, switchboard (len), frame_rack (len),
fuse_board, cubicle (w,d), pod_desk, turnstile, ticket_machine, vending_machine, plinth (h), plastic_sheet (w,h),
drop_sheet, paint_tins, mop_bucket, box, box_stack (n), satchel, modem_box, modem, esky, stacked_chairs, bingo_machine,
stage, water_cooler, plant_pot, mug (text), sandwich, drawing, cardigan_chair, returns_cage, lift_doors, desk_lamp,
fluoro_tube, cable_tray (len), headset_hanging, receipt_strip (len), tether_hanging (len), contract_stack (h),
notice_board, framed_photo, poster (text), base_station, pendant, phone_socket, tablet_box, crossword, tea_towel,
fallen_chair, glasses, card_reader, rotary_dial, pa_mic, iv_stand, wheelchair, keys_ring, extinguisher, first_aid_box,
coffee_cup, energy_can, bar_steel, box_cutter, jumper_tool, handset`.

### 5.4 `RoomBuild` — the Kit → World handoff

`Kit.build(roomDef) → RoomBuild` runs `def.build(K)` and returns plain data that `World` consumes at runtime. Kit only
*constructs*; World owns runtime behaviour (collision queries, triggers, doors opening, interaction, Outage toggling).

```js
RoomBuild = {
  def, group,                                   // THREE.Group added to Render.scene by World
  colliders: [ { x0,z0,x1,z1, h, world, obb:{cx,cz,hw,hd,rot}|null, blocker:msg|null, soft:false, name,
                 enabled:true, door:doorId|null } ],
  floors:    [ { x0,z0,x1,z1, y, ramp:{axis,y0,y1}|null, world } ],     // later entries win where they overlap
  interactables: [ { id, kind:'examine'|'interact'|'pickup'|'doc'|'payphone'|'break'|'npc'|'door'|'ladder'|'sticker',
                     pos:Vector3, r, when, world, enabled:true, hold:0, holdText, look:true, fn:async (G)=>{}, obj } ],
  triggers:  [ { id, box:[x0,z0,x1,z1], fn, once, when, world, enter:true } ],
  exits:     [ { id, box, to, entry, when, blockedMsg, fade, sound } ],
  doors:     { [id]: { id, obj, pivot, open:false, locked, lockMsg, key, to, entry, style, x,z,rot,w,h, world,
                        chapterLock, collider /* ref into colliders */ } },
  ladders:   [ { id, x,z,rot, y0,y1, top:[x,z], bottom:[x,z] } ],
  lights:    [ { kind, handle, bank, world, pos:Vector3 } ],
  npcs:      { [id]: RigActor },
  marks:     { [name]: { pos:Vector3, rot } },
  regions:   { [name]: [x0,z0,x1,z1] },
  objs:      { [name]: Object3D },
  tagged:    [ { obj, world } ],                // world-tagged objects (World shows/hides them for Fog/Outage)
  animated:  [ (dt, t) => {} ],                 // per-frame callbacks registered by props (blinking LEDs, flicker …)
  dispose(),                                    // frees room-specific GPU resources
}
```
Interactable `fn`s created by Kit call the built-in flows in `Script.builtins` (§11.1) at runtime.

## 6. Characters (`Rig`)

* `Rig.human(params) → Actor` — **the one builder** for every human and humanoid monster. Params (all optional):
  `{ height, build:'slim'|'stocky'|'broad'|'slight'|'thin', skin, hair:{style,color}, beard, top:{kind:'polo'|'hoodie'|
  'jacket'|'cardigan'|'hivis'|'shirt'|'gown'|'suit', color, open}, layers:[…], pants:{color, kind}, shoes:{color},
  lanyard:{color, card:text, keys:false, pins:0}, glasses, face:{…canvas params}, hunch:0..1, armScale:1,
  armJoints:2, headScale:1, headTilt:0, gender, age }`.
* `Rig.create(presetId, opts) → Actor` — presets (`PROPS`-like registry `Rig.PRESETS`): `aidan, wai, chase, chloe,
  luka, luke, nan, nan_gown, man_counter, old_man, customer, rep, aidan_perfect` (monsters are built by Enemies/bosses
  from `Rig.human` with modifications).
* Actor:
  ```
  actor.root (Object3D), actor.id, actor.preset, actor.height, actor.bones.{hips,spine,chest,neck,head,
    shoulderL/R, upperArmL/R, foreArmL/R, handL/R, thighL/R, shinL/R, footL/R}
  actor.setAnim(name, {speed=1, blend=0.25})  // loops: idle, idle_hunched, walk, run, run_bad, sit, sit_floor,
                                             //  sit_knees, kneel, crouch, lie, climb, crawl, type, work, brace,
                                             //  struggle, stagger, collapse, pace, stand_still, cower
  actor.gesture(name) → Promise              // one-shots: rub_neck, pen_click, shift_weight, rub_eyes, tap_bar,
                                             //  bounce, check_shoulder, fidget, tremor, offer, point, raise_phone,
                                             //  hands_up, cover_lanyard, head_in_hands, nod, shake_head, wipe_eyes,
                                             //  reach, swing, hand_on_shoulder, sit_down, stand_up, shrug, laugh
  actor.lookAt(target|null)                  // head look; target: Vector3 | Actor | [x,y,z]; clamped ±70° yaw
  actor.eyes(mode, target)                   // 'ahead' | 'down' | 'at' | 'away' | 'closed'
  actor.expr(name)                           // neutral, smile, grin, sad, cry, wide, tired, smile_huge, flat
  actor.hold('L'|'R', kind|Object3D|null)    // attach a prop to a hand (phone, tablet, bar, coffee, clipboard …)
  actor.setTint(color, amount), actor.setOpacity(a), actor.visible(bool)
  actor.walkSpeed (m/s), actor.update(dt), actor.dispose()
  ```
* Aidan's phone is held in the right hand at all times; `Player` attaches the torch spotlight to it.

## 7. Audio (`Snd`)

`Snd.init()` (idempotent; call on first user gesture), `Snd.update(dt)`, `Snd.setVolumes({master,effects,music})`.
`Snd.play(name, {vol=1, pos:[x,y,z]?, rate=1, loop=false}) → {stop(fade)}` for every named effect:

`chime` (two-tone shop door), `eftpos` (approved beep), `printer` (receipt), `dialup` (handshake → siren, 6 s; the
Outage cue), `exhale_static` (leaving the Outage), `hold` (hold-music loop, opts.speed), `keys`, `keys_far`,
`penclick`, `vibrate`, `msgchime`, `ring` (old double-burst ring, loop), `static` (burst), `disconnected` (flat tone),
`door_open`, `door_close`, `door_locked` (rattle), `handle`, `creak`, `clunk` (handset hung up), `ui_move`,
`ui_confirm`, `ui_cancel`, `paper`, `whoosh`, `swing`, `hit`, `hit_heavy`, `stomp`, `cut` (tether cut), `spray`,
`plastic` (crinkle), `hurt`, `heartbeat`, `breath` (slow breathing on a line), `modem_boot`, `beep`, `alarm_tone`
(pendant long tone), `clock_tick`, `thud`, `glass_knock`, `cardboard`, `tape`, `bar_concrete`, `scribble`, `wind_gust`,
`tube_flicker`, `lift_groan`, `siren_cut`, `stamp`, `pa_ding`, `dialtone`, `rotary_click`, `copier`, `confetti`.

Footsteps: `Snd.footstep(surface, running)`.
Ambient beds: `Snd.ambient(name, fade=2)` — `wind`, `wind_heavy`, `interior`, `hum` (exchange), `office`, `hospital`,
`garage`, `none`; plus automatically `outage` while `S.outage` (industrial receipt-printer pulse, no music). Beds include
the two-tone chime from nowhere every 40–90 s (Fog world only).
Music (rare): `Snd.music('tomorrow'|'nan'|'line', {full=false, clipped=false, loop=false, vol}) → handle`,
`Snd.stopMusic(fade)`. Felt-piano synthesis per §2.
Threat audio: `Snd.staticLevel(v 0..1)`, `Snd.loop(name, on, {vol,pos})` for monster idle sounds
(`tethered_crinkle`, `reach_breath`, `standard_keys`, `unread_buzz`, `smile_hum`), `Snd.murmur(kind, {pos, dur})`
for wordless muffled/distorted voices (`tethered`, `reach`, `closer`, `crowd`).
`Snd.duck(amount 0..1, dur)` — "all sound drains away". `Snd.muted(bool)`.

## 8. Cameras (`Cam`)

Camera def (in `defineRoom({cameras:[…]})`):
```js
{ id:'c1_security:high', vol:[x0,z0,x1,z1], y:[y0,y1]?, pri:0, type:'static'|'pan'|'rail',
  pos:[x,y,z], target:[x,y,z], fov:45 | 'fit', roll:0 (deg, Dutch),
  pan:{ lag:0.25, yaw:35, pitch:15 },               // limits in degrees either side of pos→target
  rail:{ a:[x,y,z], b:[x,y,z], look:[dx,dy,dz] },   // pos slides a→b by the player's projection; looks at player+look
  world:'fog'|'outage'|'both', when:(S)=>bool }
```
* Volumes are XZ boxes (optionally limited by `y`). Entering a volume hard-cuts; the current camera keeps priority until
  the player is > 0.5 m outside its volume (hysteresis); higher `pri` wins among containing volumes.
* **Every walkable point of a room must be inside some camera volume**, and every camera must see its entire volume
  (player at heights 0.1–1.8 m). `Cam.check(roomId)` samples a 0.5 m grid and returns problems
  `[{cam, x, z, why:'offscreen'|'behind'|'uncovered'}]`. `fov:'fit'` computes the smallest fov (≤ 60) that frames the
  volume from `pos` looking at `target`.
* `Cam.basis()` → `{fx, fz, rx, rz}` camera forward/right on the ground plane (for camera-relative controls).
* `Cam.scripted(spec)` (cutscenes): `{pos, target, fov, roll, to:{pos,target,fov,roll}, dur, ease:'inOut', follow:Actor}`;
  `Cam.release()` returns to room cameras; `Cam.shake(amount, dur)`; `Cam.current` (def); `Cam.onCut(fn)`.
* Budget 4–8 cameras per room, 150–250 total. Composition rules: spec §3.

## 9. Enemies (`Enemies`)

Spawn def (in `defineRoom({spawns:[…]})` or `G.spawn(def)`):
```js
{ id:'c1_relay:teth1', type:'tethered'|'reach'|'borrowed'|'unread'|'standard'|<custom>,
  pos:[x,z], rot:deg, world:'fog'|'outage'|'both', when:(S)=>bool,
  anchor:[x,z],                   // tethered (defaults to pos)
  disguise:'wai'|'chloe'|'luka', tell:'hands'|'badge', badge:'WIA',   // borrowed
  cluster:[[x,y,z],…], count:40,  // unread rest positions on walls/ceiling
  sit:true, idle:'facing_away' }
```
* `Enemies.spawn(def) → e`; `e = { id, type, pos (Vector3), yaw, hp, state, obj, actor?, resolved:null|'freed'|'dead',
  damage(n, weapon), stun(sec), knockdown(), remove() }`. Resolution is written to `S.spawns[id]`; freed Tethered
  appended to `S.freedOrder`. Stats per spec §6 (use `DIFF.dmg`, `DIFF.rage`).
* `Enemies.defineType(name, { create(e, def), update(e, dt), onHit(e, dmg, weapon) → bool, threat:true, tell })` —
  used by bosses/chapters for custom enemies (Smiles, Pedestal reps, boss hit-boxes).
* `Enemies.update(dt)`, `Enemies.clear()`, `Enemies.list`, `Enemies.get(id)`, `Enemies.byType(type)`.
* `Enemies.nearestThreat(pos) → {e, dist, tell} | null` (Phone uses it).
* `Enemies.hitTest(origin:Vector3, dirYaw, range, arcDeg) → [e…]` (Player's attacks), `Enemies.lockTarget(pos, yaw)`.
* The Standard: `Enemies.standard.start({ graph, node, name:'LUKA'|'AIDAN', mode:'patrol'|'hunt', route:[nodes] })`,
  `.stop()`. `graph = { nodes:{ id:{room, pos:[x,z], door?:true} }, edges:[[a,b], …] }`; while not in the player's
  room it moves abstractly along edges at 1.1 m/s and physically enters through the door node when it arrives.

## 10. UI (`UI` overlays, `Menus` screens)

### 10.1 `UI` (in-game overlays, all fade 0.3–0.5 s, style per §2A)
`UI.init()`, `UI.update(dt)`,
`UI.subtitle(text, {italic, phone, speaker}) / UI.clearSubtitle()`,
`UI.message(text, dur=2)` (bottom one-liner; E dismisses), `UI.prompt(text, {id})` (lower-left tutorial prompt, once per id),
`UI.letterbox(on, dur=0.6)`, `UI.fade(to 0..1, dur=0.5, color='#000') → Promise`,
`UI.card(title, {sub, dur=4}) → Promise` (chapter/area card on black), `UI.titleText(text, {dur, sub})`,
`UI.textOnBlack(text, dur) → Promise`, `UI.choice(options:string[], {timer, def}) → Promise<index>`,
`UI.callPrompt(callerText|null)` (incoming call: "E ANSWER · Q DECLINE"),
`UI.bars(n, {mode:'normal'|'pulse'|'none'|'noservice', battery})`, `UI.badges(n)` (Unread stings: blurred red badges),
`UI.stamp(text, {count})` (Closer signatures / Smile "SIGNED"), `UI.holdPrompt(text|null, progress)`,
`UI.keypad({title, digits=4, style:'terminal'|'lockbox'|'padlock'|'rotary', hint}) → Promise<string|null>`,
`UI.screen(html|null, {style:'crm'|'phone'|'terminal'|'case'})` (full-screen in-world screens such as the CRM),
`UI.noSignal()` (death text), `UI.showHud(bool)`.

### 10.2 `Menus` (screens; open ones pause the game)
`Menus.open(name, opts) → Promise` / `Menus.close()` / `Menus.isOpen()` / `Menus.update(dt)`.
Names: `title`, `newgame`, `calibrate`, `pause`, `items`, `map`, `memos`, `phone`, `options`, `save` (slot picker for
saving), `load`, `death`, `results`, `credits`, `fates`, `extra`, `doc` (reading view for one doc, opts.id).
Every screen follows §2A exactly (black, serif, fades, 60% grain, UI sounds, no rounded corners/icons).
The items screen renders `ITEMS[id].model()` objects with a key light in its own `THREE.Scene` via `Render.overlay`.

### 10.6 Maps
`defineMap({ id:'plaza', title:'SIGNAL HILL PLAZA — DIRECTORY', kind:'paper'|'receipt', floors:{ G:{ w, h,
shapes:[…] } }, marks:[{ id, floor, t:'x'|'circle'|'tick'|'note', x, y, text, when:(S)=>bool }] })`
Shapes: `{t:'rect', x,y,w,h, label}`, `{t:'poly', pts:[[x,y]…], label}`, `{t:'road', pts, w, label}`,
`{t:'text', x,y, text, size}`, `{t:'door', x,y}`. Map canvas units are arbitrary (≈ px on a 1000-wide sheet).
Rooms map to it via `room.map.xform = [ox, oz, scale, rotDeg]`: `mapX = ox + (x*cos - z*sin)*scale`, `mapY = oz + (x*sin + z*cos)*scale`.
Marks whose `when` passes are drawn automatically in red marker (teal on receipt maps).

## 11. Scripts, cutscenes and the `G` API (`Script`)

All content logic is written as `async (G) => { … }`. The same API serves cutscenes, in-engine beats, room hooks,
examine/interact handlers, triggers, calls and bosses.

```js
defineCutscene('1-1', async (G) => { … }, { letterbox:true, skippable:true, control:false });
await G.cutscene('1-1');                   // from any script
Script.run(fn, opts) → Promise              // engine entry; one blocking (control:false) script at a time
```
Skipping: holding Esc 1 s (or `Script.skip()`) sets `G.skipping`: waits/lines/camera moves resolve instantly, fades
jump, **choices still wait for the player**, state changes still happen. Cancellation (death, room change, abort): the
pending await throws `Script.ABORT` which the runner swallows.

**Flow**: `await G.wait(s)`, `await G.beat()` (0.8 s), `await G.longBeat()` (2 s), `await G.until(pred, {timeout})`,
`await G.frame()`, `await G.loop(fn(dt) → true to stop)`, `await G.all([...promises])`, `G.skipping`, `G.bg(fn)` (run a
background sub-script).

**Presentation**: `G.letterbox(on)`, `await G.fade(to=1, dur=0.5, color)`, `await G.fadeIn(dur)` (to clear),
`await G.fadeOut(dur)` (to black), `G.cam(spec)` (§8 scripted; returns immediately; `await G.camDone()`),
`G.camRelease()`, `G.shake(a, dur)`, `await G.card(text, {sub})` (chapter card), `await G.title(text, {dur})`,
`await G.textOnBlack(text, dur)`, `G.post({grain, ca, desat, noise, grade:'fog'|'outage'|'flashback'|'dawn'|'party'|'hospital', white, blur})`,
`G.hud(bool)`.

**Dialogue** (subtitles only; no speaker names on screen):
`await G.say(speaker, text, {phone, italic})` — `text` may contain `[beat]` and `[long beat]` which split it into
separate subtitles with 0.8 s / 2 s silent pauses. Each subtitle stays `U.readTime` or until E.
Speaker `'NAN (phone)'` / `{phone:true}` → italic with static wobble. `await G.think(text)` — Aidan's italic thought.
`await G.choice(['Read on','Tear it up'], {timer:10, def:2}) → index`. `G.msg(text)`, `G.prompt(text, {id})`.

**Actors**: `G.actor(id, preset=id) → A` (finds the room's NPC or creates one), `G.aidan` (the player's actor, same API),
`A.place(x,z,rotDeg) | A.place(markName)`, `await A.walkTo(x,z,{run, speed})` / `A.walkTo(markName)`,
`await A.turn(rotDeg|target, dur=0.6)`, `A.look(target|null)`, `A.eyes(mode, target)`, `A.pose(anim)` (= setAnim),
`await A.gesture(name)`, `A.expr(name)`, `A.hold(hand, prop)`, `A.show()/hide()`, `await A.fade(a, dur)`, `A.remove()`,
`A.pos` (Vector3), `A.raw` (Rig actor). `G.control(on)` enables/disables player control.

**Audio**: `G.sfx(name, opts)`, `G.music(motif, opts)`, `G.stopMusic(fade)`, `G.ambient(name)`, `G.duck(a, dur)`.

**State**: `G.S`, `G.flag(n)`, `G.set(n, v=true)`, `G.track('F'|'A', n)`, `G.give(itemId, n=1, {silent})`,
`G.take(itemId, n=1)`, `G.has(itemId)`, `G.note(text)`, `await G.doc(docId, {open=true})`, `G.once(id)`,
`G.mapMark(id, spec)`, `G.stat(name, n)`.

**World**: `await G.goto(roomId, entry|{pos:[x,z],yaw}, {fade=true, sound})`, `await G.outage(true|false)` (the §2
transition; player keeps control), `G.setOutage(on)` (instant), `G.spawn(def) → e`, `G.enemy(id)`, `G.pos(mark) → Vector3`,
`G.region(name)`, `G.obj(name)`, `G.door(id) → {open(), close(), lock(msg), unlock()}`, `G.light(name)`,
`await G.lightsOut({dur})` (banks die toward the camera), `await G.call(callId) → 'answered'|'declined'`,
`await G.keypad(opts) → string|null`, `await G.hold(text, seconds) → bool`, `G.bars(nOrNull)` (override phone bars;
null = automatic), `await G.boss(id, opts) → result`, `await G.startChapter(n)`, `await G.ending(name)`,
`G.autosave()`, `G.inRoom(id)`, `G.player` (Player), `G.dist(a,b)`.

### 11.1 Built-in flows (`Script.builtins`, each `async (G, opts)`)

* `examine(G, lines)` — italic thoughts in order.
* `pickup(G, {id, item, n, msg})` — give item, `S.taken[id]=true`, remove the world model, message
  "Aidan picked up the <name>." Map items play the 1 s marker scribble and set `S.maps[mapId]`.
* `doc(G, {id, docId})` — add to `S.docs`, open the reading view (awaits close), apply `track` once, stats.memos++.
* `payphone(G, {id})` — §2A Saving: "Pick up the receiver?" YES/NO → breathing on the line (or, if `waiSaved` and
  chapter > 3, Wai's next line from `DIALOGUE.wai_payphone`) → "Save your progress?" → `Menus.open('save')` →
  "Progress saved." → clunk. First use ever shows the prompt "Payphones save your progress."
* `breakTable(G, {id})` — once per chapter: fade, wall clock jumps forward 15 minutes, full heal, Aidan: "Fifteen-minute break."
* `door(G, door)` — locked/key/chapter-lock messages or the 1.5 s transition.
* `useItem(G, itemId)` — heal items (difficulty-independent amounts: coffee 25, energy 50, first aid 100), weapons equip.

## 12. Chapters, calls, docs, items

```js
defineChapter({ n:1, id:'ch1', title:'SIGNAL HILL PLAZA', card:'SIGNAL HILL PLAZA',
  start:{ room:'c1_relay', entry:'south' },
  debugState(S) { /* inventory/flags a player would have when starting this chapter (used by chapter select) */ },
  async begin(G) { /* runs after the chapter card + autosave */ } });
```
`Game.startChapter(n)`: sets `S.chapter`, shows the card (if the previous chapter's script didn't already), autosaves,
goes to `start`, runs `begin`. The flow *within* a chapter is driven by room hooks, triggers and cutscenes; a chapter
ends when its script calls `await G.startChapter(n+1)`.

```js
defineCall({ id:'luka1', n:1, caller:'LUKA', answer: async G => { … }, voicemail:'Hey, it\'s Luka. …' });
defineDoc({ id:'acct1', title:'Account Note 1', group:'Account Notes', paper:'lined'|'dotmatrix'|'sticky'|'email'|
  'whiteboard'|'laminated'|'receipt'|'plaque'|'card'|'phone'|'notebook', text:'…', hand:'…' /* handwritten part */,
  track:{F:1} });
defineItem({ id:'box_cutter', name:'BOX CUTTER', cat:'weapon'|'item'|'key', desc:'…', model:() => Object3D,
  details:[{ text, face:[x,y,z] }], heal:25, weapon:{ dmg:8, speed:'fast', range:1.2, arc:70, knock:0 }, stack:true,
  async use(G) {} });
defineBoss('returns_cage', { async run(G, opts) { … return result; } });
```
Luka's calls: answering → `track('F',2)`, declining → `track('A',2)` and a voicemail; playing a voicemail the first
time → `track('F',1)`. Handled generically by `Phone`/`Script`.

## 13. Game modes (`Game`)

Modes: `boot → title → newgame → calibrate → play ⇄ (menu | cutscene) → death → … → credits → fates → results → title`.
`Game.boot()`, `Game.tick(dt, render=true)`, `Game.mode`, `Game.newGame(opts)`, `Game.continueFrom(slot|'auto')`,
`Game.startChapter(n)`, `Game.death()`, `Game.ending(name)` (`'connected'|'coverage'|'tomorrow'|'yes'`),
`Game.endingFor(S)` (spec §4 logic). Pause: Esc → `Menus.open('pause')`.

Main loop order each frame: `Input.update → (Menus.update if open) → Script.update → Player.update → Enemies.update →
World.update → Phone.update → actors update → Cam.update → Snd.update → UI.update → Render.render → Debug.update`.
`Time.dt` is clamped to 0.05.

## 14. Test harness and `window.SH`

`node tools/run.mjs --chapter 1 --seconds 20 --shots out/` etc. (see the file's header). It loads the built file in
headless Chromium (SwiftShader WebGL), serves the three.js CDN URLs from `node_modules`, and prints console errors.
`window.SH` (defined by Debug) is the test API:
`SH.S` (state), `SH.ready` (bool), `SH.newGame(opts)`, `SH.chapter(n)`, `SH.goto(room, entry)`, `SH.advance(sec)`
(runs game ticks without rendering), `SH.skip()` (skip current cutscene), `SH.choose(i)`, `SH.press(action)`,
`SH.teleport(x,z)`, `SH.camCheck(roomId?)`, `SH.rooms()`, `SH.run(async G => …)`, `SH.errors` (captured errors),
`SH.fps`, `SH.mode`, `SH.screenshot()`.

## 15. Coding rules

* Plain modern JavaScript, no TypeScript. Keep code compact but readable; short comments on non-obvious logic.
* Never block the main thread with long synchronous work after boot (> 50 ms); build rooms quickly (target < 150 ms).
* Dispose geometries/materials/textures that are room-specific on unload (shared/cached ones are not disposed).
* Performance: ≤ 8 real point lights + torch per room; only the torch casts shadows; merge or instance repeated props;
  keep draw calls per room < 400.
* Content rules (§1 of the spec) are absolute: no gore, no self-harm/hanging imagery (no cords around necks — lanyards
  hang on the chest, tethers run wrist→chest→floor), nothing copied from existing games, original Optus-style
  wordmark only (teal `#00a8a8`-ish and yellow `#ffcc00`-ish), no real logo.
* Text shown to the player must match the spec exactly where the spec gives it.
