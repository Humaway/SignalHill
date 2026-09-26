# Signal Hill — Engine Notes for content authors

What the engine really does, beyond `docs/ARCHITECTURE.md` (the contract). Written against the code in `src/engine/`.
Every `CONTRACT+` comment in the code marks an addition; the file headers document each module in full. When this
file and the code disagree, the code wins — tell the integrator.

`src/data/99_testroom.js` (`test_room` + `test_room2`) uses almost every feature below and passes `Cam.check`; copy
from it.

---

## 0. The ten things that bite

1. **−Z is north.** `K.roomBox` sides: `n` = z0, `s` = z1, `w` = x0, `e` = x1; `at` is measured from x0 (n/s walls) or
   z0 (w/e walls). Yaw 0 faces +Z (south), 90 faces +X (east). Entries are `[x, z, yawDeg]`.
2. **`y` means different things.** `K.box / K.cyl / K.stairs`: y = **bottom**. `K.sphere / K.plane / K.sign /
   K.writing`: y = **centre**. `K.wall / K.floor / K.roomBox`: `opts.y` (default 0). Ramp heights are absolute. A
   missing `y` defaults to the floor height at (x, z) *from the floors built so far* — build floors first.
3. **Static geometry is merged** at the end of the build (walls, floors, room-level `K.box/cyl/sphere/plane`, static
   props). Materials that differ only in colour are batched through vertex colours, and static canvas labels (plates,
   signs, posters, notes) are packed into a per-room atlas, so a room's colours and labels cost a handful of draw calls.
   Anything you will change later needs `{name}` (→ `G.obj(name)`) or `{static:false}`; a named prop still merges its
   own static parts inside itself (it stays movable as one piece; `{merge:false}` keeps every part separate). Prop setters (`setOpen`, `setRinging`, `screen`,
   `fuse_board.setSwitch` …) need `name`, `live:true` or the matching opt (`open`, `ringing`, `state`, `on` …),
   otherwise they only warn once.
4. **`K.examine` with an array shows ONE line per press**, in order, then repeats the last. For several lines in one
   press pass `async (G) => { await G.think(a); await G.think(b); }`.
5. **Every `K.door` needs a wall opening** (`K.wall` `openings`, or `K.roomBox` `doors`). Kit doesn't cut walls.
6. **Lights default to `world:'both'` and come back on after the Outage cut.** Tag Fog-world lights `world:'fog'`
   (props take `world` too: `K.prop('fluoro_tube', …, {world:'fog'})`) and add `world:'outage'` ones (flickering
   tubes, red LEDs, screen glow). The real-light pool is **8 point + 2 spot**, but handles are virtual: every frame the
   lit lights nearest Aidan whose range reaches into view hold the real slots (a slot changing hands fades over
   0.3 s; switching a light off / on is instant), so a 200 m street can have a lamp every 10 m. Aidan's phone glow
   takes one slot, and while the torch is on its **bounce fill** takes another (see §4). More than 8 lit point lights
   within ~14 m of each other still means some are dark at once — pass
   `light:false` to props there (glow only; the tube / lamp still switches with `lightsOut` and the Outage banks). The
   build warning counts only lights that take a pool slot (not `real:false` / `light:false` ones). A key light far
   from Aidan: `K.light(…, {prio: metres})` ranks it as if that much closer, `{pin:true}` keeps a slot always.
7. **Interactions are blocking scripts** (Player locked, `control:false`). An interaction that starts gameplay (the
   Outage, a chase) must call `G.control(true)` first — the spec's Outage keeps the player in control.
8. **Fixed cameras can't see what is below them.** A static camera needs its volume ≥ ~4 m away horizontally (or
   higher up), or `Cam.check` flags `offscreen`. Pan and rail cameras aim at Aidan, so they pass easily. See §3.
9. **Indoor Fog-world fog is the grey spec colour `#8e9996`** — dark interiors look milky. Give interiors
   `fog:{density:0.03–0.035, color:'#3b4543'}` (darker teal-grey). Outdoor fog 0.075 ≈ 15 m: keep street cameras
   within ~10 m of Aidan, or lighten the room with `fog:{density:0.05}`.
10. **Rig actors are the draw-call budget.** Aidan ≈ 55–60 calls, each human/monster 39–66 (Tethered ≈ 49, Reach ≈
    66, `detail:'low'` ≈ 39), plus ≈ 12 more each for the torch's shadow pass when the torch is on (one caster per
    body segment — `actor.trimShadows()`; held props and small parts don't cast; the torch shadow reaches 12 m). There
    is no occlusion culling: actors behind walls still draw if they're in the camera frustum. Keep ≤ 3–4 actors in
    any camera's frustum. Room geometry measures ~140–240 calls per view in `test_room` (it is deliberately
    overstuffed: ~45 props, 5 doors, dressing in both worlds); its yard view still totals ~520 because five actors
    (four of them behind walls) are in that frustum. Game skips actors the fog already hides (beyond ≈
    2.45 / density m: 33 m outdoors, 80 m indoors — `Game.culled`), so long foggy streets full of figures are fine.

---

## 1. Rooms (`defineRoom`) and the kit `K`

### Room def fields actually read

`id, name, area, map, chapter, outdoor, fog {density,color}, noFog, surface, surfaces:[{box:[x0,z0,x1,z1], s, world}],
outageSurface, ambient (Snd bed), grade (Render grade), outageFog, env (extra Render.setEnvironment opts), bounds,
entries, cameras, spawns, build(K), onEnter(G, fromRoomId), onUpdate(dt), onLeave()`, and:

* `outageAmbient: [color, intensity]` / `outageEnv: {…}` — the room's sky light / environment while the Outage shows
  (load, `G.setOutage`, the transition's cross-fade). The built-in outdoor Outage look is near-black beyond the torch
  (ambient 0.06); e.g. `outageAmbient: ['#1f6f6a', 0.6]` reads the road. No `onUpdate` polling needed.
* `stackedFloors: true` — floors may share an XZ footprint (switchback stairs, landings): the floor under a mover is
  the highest one no more than a step (0.5 m) above its feet. Without the flag the last registered floor wins (as
  before). `Cam.check` samples every layer of such a room. Pair it with `yBand`s on exits / triggers / interactables.
* `cutsceneOnly: true` — a set the player never walks (a flashback): `Cam.check` skips it.
* `fogAt(x, y, z, outage) → density` — a room whose `onUpdate` moves the fog with Aidan (the summit road thins as he
  climbs) gives `Cam.check`'s fog test the same rule (share one function between the two, like `c8_summit`).
* `far` — the camera far plane (m, default 200) in this room; also per camera def and `G.cam({far})`.

* `chapter` enables the chapter lock: a door says "It won't open. Not anymore." when this room's chapter **and** the
  target room's chapter are both below `S.chapter`. Rooms without `chapter` never lock.
* `onEnter` runs as a background (room-bound) script after the fade-in starts; it is aborted when the room unloads
  (`G.persist()` opts out). Triggers do the same.
* Footstep surfaces: `tile carpet lino bitumen gravel metal ladder concrete wood grass vinyl`.
* Ambient beds: `wind wind_heavy interior hum office hospital garage store none` (the Outage bed layers on top by itself).
* Grades: `none fog outage flashback dawn hospital party title`.

### Textures / materials

Pass a texture name (or `{tex, color, roughness, metalness, …}`, `'#hex'`, a Material/Texture):
`plaster plaster_stained render_cracked brick concrete concrete_wet bitumen gravel footpath kerb lino lino_hospital tile
tile_white carpet vinyl_retail wood weatherboard timber_floor metal metal_rust metal_grating chainlink grille
ceiling_tile cardboard cardboard_wet paper receipt contracts fabric_knit grass dirt leaves glass plastic_sheet`.
Every kit material dissolves to its Outage partner automatically (contracts, circuit carpet, wet cardboard …).
Variants: `{tex:'bitumen', lines:'center'|'double'|'edge'|'solid'|'crossing'|'stop'|'parking'}`, `{tex:'lino', color}`,
`{tex:'weatherboard', paint}`. Content-specific generators: `Tex.define(name, {px, size, gen(ctx,w,h,rng,opts),
outage})` — `outage` is another texture id, `'self'` (the same texture, darkened teal) or `false`.
`K.plane(…, {double:true})` builds two back-to-back faces: text reads the right way round from both sides.
Handwriting (`Tex.handwriting`, docs, map notes) uses `Tex.fonts.hand/marker` (Segoe Script / Bradley Hand / Brush
Script / Apple Chancery / Comic Neue / URW Chancery / Comic Sans …); with none of them installed (bare Linux) it draws an
italic, slanted fallback so it still reads as written (`Tex.handFontPresent(stack)`).

### K functions (contract §5.2 plus)

* `K.floor(x0,z0,x1,z1, mat, {y, ramp:{axis,y0,y1}, skirt, base, visible})` — floors registered later win where they
  overlap (a platform floor over ground makes the ground under it unwalkable — put a solid `K.box(…,{collide:true})`
  under it; or give the room `stackedFloors:true`). Aidan can step up 0.45 m and drop 1 m; higher edges need
  stairs/ramps and stop him walking off platforms. `{visible:false}` (or `K.walkable(x0,z0,x1,z1,{y, ramp})`)
  registers the walkable height only — no mesh (open grating drawn by bars).
* `K.wall(x0,z0,x1,z1, h, mat, {thick, openings:[{at,w,h,sill,glass,frame}], both, skirting, grime, collideH})` —
  window openings (sill > 0) keep a full-height collider; doorways split it. **`both:false`** draws only the front face
  (the right-hand side walking from (x0,z0) to (x1,z1)) and no top cap — seen from behind (or from above behind it) it
  is invisible: the **cutaway** trick for a camera outside a small room (the test room's store room).
* `K.stairs(x0,z0,x1,z1, y0,y1, {axis, rail:'both'|'left'|'right'|true, mat})` — from the (x0|z0) edge at y0 to the
  (x1|z1) edge at y1; rails add colliders.
* `K.road(x0,z0,x1,z1, {axis, markings, footpath, kerb, slope:{y0,y1}})` — the box is the carriageway; kerbs and
  footpaths are outside it, with their own raised height regions.
* `K.drop(x0,z0,x1,z1, {side:'n'|'s'|'e'|'w', msg})` — road-end cliff + barrier + sign + blocker; Outage trench of
  cable. Infers `side` from floors built before it — pass it to be safe. It doesn't remove floors under its box.
* `K.fogWall(x0,z0,x1,z1, msg)` — soft blocker: Aidan is turned around with the message.
* `K.blocker(x0,z0,x1,z1, msg)` — invisible wall with a message once per contact (only for the player).
* `K.writing(text, x,y,z, w, {rotY, style:'marker'|'receipt', world})` — x,y,z on the wall surface; with no `world` it
  builds a faded Fog scrawl AND an Outage marker/receipt version.
* `K.door({id,x,z,rot,w,h,style,to,entry,locked,key,lockMsg,openMsg,sign,signBack,reader:'card'|'keypad'|'maglock',
  chain,hinge,swing,open,when,chapterLock,mapMark,yBand,prio})` — styles `wood metal fire wired glass glass_double
  roller`. The door's front faces `rot` (the side a camera at rot's direction sees). `hinge:'left'|'right'` ('L'|'R',
  default left) is the hinge side as seen standing in FRONT of it (on the side `rot` faces); `swing:1|'front'|'out'`
  (default) opens the leaf toward that front side, `-1|'back'|'in'` away from it (`maxAngle`, default 95°).
  Without `to`: swings in-room (collider toggles; the Reach can't pass a closed one; the Standard opens them). With
  `to`: 1.5 s black transition. `key` → "The key fits." and it stays unlocked (`S.done['unlocked:<id>']`). Script
  control: `G.door(id).open({instant}) / close() / toggle() / lock(msg) / unlock() / isOpen / locked`.
* **Automatic map marks** (spec §2A): trying a locked door writes a red X to the room's map
  (`S.mapMarks['auto:door:<id>']`, placed through `room.map.xform`; also on its receipt map when the room has
  `map.outage` + `rxform`); unlocking it turns the X into a tick. The first bump into a blocked road — `K.drop`,
  `K.fogWall`, an exit whose `when()` is false, or `K.blocker(…, {mapMark:true})` — marks an X there. Opt out with
  `{mapMark:false}` on the door / drop / fog wall / exit. Rooms without `map.xform` get no marks.
* `K.exit({id, box, to, entry, when, blockedMsg, sound:'steps'|'door'|'none', mapMark, y:[y0,y1]})` — walking into the box
  transitions (the player must leave the box once before it arms; entries must be placed outside exit boxes). Exits
  are the player's: they never fire while a blocking script / cutscene / transition owns Aidan (a scene that walks
  him into a box doesn't leave the room — call `G.goto` in the scene; if it ends with him inside a box, he has to step
  out and back in). An exit (or door) to a room that doesn't exist is inert (a door says `lockMsg` / "It won't open."),
  never an error. A cutscene that ends near an exit, or the Outage transition run inside a blocking script, never
  queues an exit: the player has to walk in (again) once he has control.
* `K.trigger(box, fn, {id, once=true, when, enter=true, anytime, y:[y0,y1]})` — `fn` runs as a background script; spawning
  inside the box counts as entering, and so does the trigger becoming ACTIVE (its `when()` turning true, its world
  showing — e.g. an Outage-only trigger where Aidan stands when the Outage hits) while he is inside. Triggers are
  evaluated only while the player has control: a scene walking him through a box fires nothing; one that leaves him
  inside a box fires it when control returns. `{anytime:true}` fires even during scripts. Fired ids are kept in
  `S.done['trig:<id>']`.
* **y bands** — `y:[y0,y1]` on `K.exit` / `K.trigger`, `yBand:[y0,y1]` on interactables (`K.interact / examine / pickup
  / doc / door / npc`): only while Aidan's feet are in that band (stacked landings).
* **Which interactable E uses** — score = distance + 0.9 × angle off his facing (rad) + the kind's priority (m):
  doors, pickups, payphones, ladders 0 · docs, stickers 0.1 · interacts 0.15 · people (`npc`, the Borrowed) 0.35 ·
  examines 0.6 — an examine beside a door or a pickup no longer takes its E press. Override per interactable with
  `{prio}`. `{crawl:true}` makes an interactable usable in crawl mode (only those are). Two traps remain, and the
  build warns about both (below): an examine **on** a door (a note taped to it) never wins, and one ~0.5 m **in front
  of** a door out-scores it when he faces both — keep examines ≥ 0.6 m off a door's line, or give one `{prio}`.
* **Height reach:** `World.nearestInteractable` ignores anything more than 1 m below his feet or 2.6 m above them
  ("another level": a balcony, a ladder top) — except an **examine** of something high up (a wall clock, power lines
  overhead), usable up to 5.5 m above his feet as long as no floor layer lies between his feet and it, under it or
  under him (`Kit.lookUpOK`).
* **Build-time warnings** (`[Kit] room …`, once per session): an interactable no floor lets him use (more than 2.6 m
  above every floor layer within its radius — 5.5 m for a look-up examine, as above — or more than 1 m below); an
  examine within 0.6 m of a door / payphone / ladder (both live at build time); an unwalkable seam (0.02–0.5 m)
  between two floors of about the same height with nothing walkable or solid in it (`K.floor` beside `K.road` that
  don't quite meet); more than 8 real point lights within 14 m.
* `K.interact(x,y,z, fn, {id, r, hold, holdText, when})`, `K.examine(…)`, `K.pickup(item, x,y,z, {id, n, msg,
  extraOnEasy, rot, glint})` (heal pickups obey `DIFF.pickup`; Hard removes ~30% deterministically by id), `K.doc(docId,
  x,y,z, {id, model:'paper'|'sticky'|'binder'|'board'|'none', wall, glint})` — no markers: `glint` is opt-in
  (`true`|size) and only sparkles where the torch or a lamp actually lights the item (never in the dark), `K.payphone(x,z,rot, {wall})` (wall phones:
  place at the wall surface facing into the room), `K.breakTable(x,z,rot, {time:[h,m], clock:[x,y,z,rot]|false})`
  (the clock goes on the nearest wall), `K.sticker(id, x,y,z, rot, {pitch})` (ids `sticker01`…`sticker12` count for
  Yes), `K.npc(id, preset, x,z,rot, {anim, rig:{…Rig params, detail:'low'}, talk:async G=>{}, examine, when, whenTalk})`
  (`when` = build-time presence; `whenTalk` = runtime condition).
* `K.ladder(x,z,rot, y0,y1, {id, top:[x,z], bottom:[x,z], cage})` — faces `rot` toward the climber; `top` must be on
  the upper floor region. Two interactables (`id:bottom`, `id:top`); Player climbs with W/S.
* `K.light(kind, x,y,z, {color,intensity,distance,world,bank,name,flicker,blink,on,real,prio,pin,halo,haloColor,
  haloFog})` — kinds `street fluoro lamp screen point spot led`. `angle` (spot) is in **degrees** (a value under 1.6 is
  taken as radians, with a warning). `haloFog` 0..1 (default 1): how much the fog swallows the halo sprite. `real:false` = glow / halo / tube only, no pool light (what props' `light:false` does); it
  still switches with `lightsOut` and the Outage banks. `bank` orders the Outage blackout (banks die toward the
  camera). `G.light(name)` → handle `{on(bool), isOn, set(o), setWorld}`. Fluoro tubes and LEDs switch properly even
  inside static props (their emissive parts never merge).
* Room-level `K.collider` / `K.colliderRot` records are marked `bare` (no geometry of their own: `Cam.check`'s lens test
  ignores them); one a prop builds for itself (a car's body box) stands for the prop's solid and isn't.
* `K.fogOnly(fn) / K.outageOnly(fn) / K.world(w, fn)` — tag everything inside (meshes, colliders, lights, floors,
  interactables, triggers). `K.animate(fn(dt,t))` for per-frame behaviour; `K.mark / K.region / K.obj`; `K.dress(kind,
  box, n, {seed, world})` kinds `papers leaves boxes receipts cables contracts cups`.

### Prop kinds (`K.prop(kind, x, z, rotDeg, opts)`) — 169

`opts.pitch` / `opts.tilt` (degrees about the prop's own X / Z, after its yaw) sit props on slopes (colliders stay
yaw-only boxes). Recent opts: `counter {monitor:false | x}` (no staff monitor — cameras behind the counter),
`fluoro_tube {intensity, distance, decay, color, prio}` (the default 7 cd / 9 m barely reaches a 4 m floor),
`lift_doors {back:false, call:false}` (no dark box behind the leaves — seen / forced from the shaft), `bedside_phone
{display:'large'}` (a raised, lit, readable LCD), `mast {halo (14), haloColor, haloFog (0.3)}` (the aircraft light
reads through fog), `traffic_light {glow}` (every lit lens has a halo; 0 = none).

`plant_pot` collides as the pot only (r 0.22 m, 0.42 m high): its fronds never block a corner, an examine or a camera.
Notice-board flyers shrink their titles to fit.

Origin on the floor at the prop's centre, facing +Z. **Wall props** stand at the wall surface with the wall behind them
(−Z local): rotate so they face into the room; `mount` sets the centre height. **Ceiling props** hang from `ceil`
(default 3.0; `fluoro_tube` uses `h`). **Tabletop props** need `y` = the surface height (desk 0.745, counter 1.0,
table 0.74). Common opts: `variant, lit, light:false, bank, seed, live, name, examine, interact, world, collide`.
Radius-like opts are `radius` (never `r` — `r` is the examine radius).

Street: `streetlight power_pole letterbox bench bench_plaque bus_shelter payphone_booth payphone_wall barrier road_sign
sign_post guardrail fence chainlink gum_tree gum_tree_small shrub car hatchback bin traffic_light bollard boom_gate
cable_drum shutter roller_door awning window_display shopfront house cottage hut substation fountain escalator planter
gnome pansies dumpster pallet cone floodlight mast rf_sign trolley rubbish leaf_pile`.

Interior: `counter demo_table accessory_wall shelf desk office_chair chair stool table cafe_table meeting_table
locker_bank microwave fridge sink_bench corkboard whiteboard huddle_board clock notice_board framed_photo poster tv
monitor crt cctv_bank cctv_camera terminal printer photocopier desk_phone rotary_phone bedside_phone wall_phone
answering_machine modem modem_box base_station pendant phone_socket tablet_box card_reader rotary_dial pa_mic
leaderboard rankings_screen projector_screen emergency_phone duress_button alarm_lamp headset switchboard lamp_panel
frame_rack jumper_wire fuse_board cable_tray fluoro_tube headset_hanging tether_hanging receipt_strip receipt_curtain
spotlight turnstile ticket_machine vending_machine plinth plastic_sheet drop_sheet paint_tins mop_bucket wet_floor_sign
box box_stack satchel esky stacked_chairs bingo_machine stage water_cooler plant_pot mug sandwich drawing cardigan_chair
returns_cage lift_doors desk_lamp contract_stack crossword tea_towel fallen_chair glasses iv_stand wheelchair keys_ring
extinguisher first_aid_box coffee_cup energy_can bar_steel box_cutter jumper_tool handset filing_cabinet binders_shelf
couch bed hospital_bed dresser bedside_table phone_table cubicle pod_desk sticky_note roster visitor_book key_lockbox
exit_sign water_stain feedback_board photo_wall`.

Useful hooks (`obj.userData.*`, need the prop live): `screen` (a `Tex.screen` to draw on; `custom = true` stops the
built-in loop) on tv/monitor/crt/terminal/leaderboard/rankings_screen/projector_screen; `modem.setState('off'|'boot'|
'red'|'ok')` / `boot(sec)`; `setOpen(0..1)` + `collider` on roller_door/shutter/boom_gate/lift_doors/turnstile;
`returns_cage.setDoor` + `doorCollider`; `fuse_board.setSwitch/setMain/setAmps` (pass `on`/`main`/`amps`, `live` or a
name); `switchboard/lamp_panel.setLamp`;
`clock.setTime/addMinutes`; `payphone_*.setHanging`; `rotary_dial.spin(d)`; `desk_phone.setRinging`;
`car/hatchback.setHazards/setHeadlights`; `traffic_light.setMode`; `mast.platforms/ladder`. Full opts: the header of
`src/engine/05b_props.js` and the comment above each `def(…)`. `poster` takes `style` (plan|faded|alarm|notice), not
`kind`. `bench_plaque` is a memorial bench with a brass plaque. Power-pole wires run toward +X only.

---

## 2. Scripts, cutscenes and G

* `Script.run(fn, {control, letterbox, skippable, name, id, parent, persist})` — **blocking** (`control:false`) scripts
  lock the player and run one at a time (others queue); **background** ones run side by side. A script started inside
  a running blocking script (`G.cutscene`, `G.call`, `G.boss`, `G.run`) nests instead of queueing.
  Background scripts started by World (triggers, onEnter, interactions of kind ladder) and `G.bg` children are
  room-bound: aborted on room change unless inside `G.goto`/`G.startChapter`/`G.ending` or `G.persist()`ed.
* `defineCutscene(id, fn, {letterbox:true, skippable:true, control:false})` → `await G.cutscene(id)` or
  `Script.playCutscene(id)`. `S.done['cs:<id>']` is set when it starts; `Script.seen(id)`.
* **Skipping** (hold Esc/Start 1 s, `SH.skip()`): waits, lines, camera moves, walks, turns, gestures, fades resolve
  at once; cards jump to black; `G.outage` swaps instantly; `G.goto` has no black hold; one-shot sounds are dropped —
  but **choices, keypads, `G.hold` and calls still wait**, and every state change still happens. Write scenes so that
  all state changes are plain statements (never inside `if (!G.skipping)`). A skip covers the chain of skippable
  scenes running at that moment (and their `G.bg` children); **a `G.boss` ends it when the fight starts** (so
  `Script.skipping` is false during the fight) — whatever the scene does after the fight (`await G.cutscene('4-3')`)
  plays normally and can be skipped on its own. **`G.ending` ends it too**, and every ending scene runs with
  `inheritSkip:false`: a scene started with `inheritSkip:false` is its own skip chain (skipping it never climbs to the
  scene that started it, and a skip of that scene never swallows it). A skipping script that keeps waiting in a loop
  (a `G.bg` cheer loop) yields a frame every 24 instant waits, so it can never freeze the page.
  Two traps `tools/tests/skipall.mjs` caught (spec §14 — a skipped scene must leave S, the room and the screen as the
  played one does): **a walk that can stop short** (the player's walks collide: 6-terminal's walk into the office
  chair stopped 0.8 m short, while a skip snaps him to the target, into the chair) — walk to a free spot, and where
  he ends up matters, end with a plain `A.place(x, z)`; **a reading view left out when skipping**
  (`G.doc(id, {open: !G.skipping})`, 3-2's email) adds the document unread and applies none of its `track` — follow it
  with `if (G.skipping) Script.readDoc(id)`. A music cue a scene starts is dropped by a skip (so is its tail after the
  scene): fine for the finite motifs; a cue that must play on into gameplay needs `Snd.music` outside the skip rule.
  And a third, about loads: a chapter file's own transient state (never saved) outlives a load, while a load replaces S
  and restarts `Time.now` at 0 — 7-page's "the doors stay clear until Time.now passes C7.pageUntil" kept the three away
  for as long as the game had run before a CONTINUE. Tie such state to the live state object (`C7.pageS === S`).
* **Aidan's body in scenes:** while a letterboxed scene owns him (`Script.cutscene` and no control) the equipped weapon
  is put away — it comes back when the scene ends, hands control back (`G.control(true)`) or suspends for a `G.boss`;
  `A.hold('L', 'bar')` shows it on purpose. Each letterboxed scene snapshots his arm carry poses when it starts and
  restores them when it ends (a `phone_ear` left by one scene never carries into the next; a hand whose prop the scene
  changed keeps the new prop's pose; `{keepPose:true}` on the run keeps what the scene left). A `G.boss` starts the
  fight from the scene's snapshot.
* **Cleanup:** `G.finally(fn(how))` runs when the script ends however it ends (`'done'|'skipped'|'aborted'`);
  `G.addLight(kind, {pos, color, intensity, distance, target, angle, prio})` → a pinned pool light freed when the
  script ends. Un-awaited actor walks / turns / gestures / fades that die with an aborted scene are not errors
  (`Script.ABORT` is never reported as an unhandled rejection).
* `G.say(speaker, text, o)` — `o.dur` is the reading time of the whole line, shared by its `[beat]` parts by length
  (pauses extra; each part at least 0.6 s). `[beat]` 0.8 s, `[long beat]` 2 s, `[static]`, `[pen click]`, `[click]`, `[keys]`,
  `[clunk]`, `[beep]`; other `[stage directions]` are dropped. `'NAME (phone)'` → italic + static wobble;
  `G.think(text)` = Aidan's italic thought. The speaking actor's mouth moves if the room has an actor of that name.
  Arrays = consecutive lines. `G.choice(opts, {timer, def, cancel, title})` → index (def is 0-based).
* Actors: `G.actor(id, preset, {at, pose})` finds a room NPC or creates one — or pass an **enemy** (the object, or its
  spawn id) to script its Rig body (set `e.ai = false` while the scene moves it; `A.remove()` removes the enemy);
  `A.place(x,z,rot|mark)`,
  `await A.walkTo(x,z | mark | [[x,z],…], {run, speed, collide, face})`, `await A.turn(deg|target)`, `A.look(t)`,
  `A.eyes(mode,t)`, `A.pose(anim, {seat})`, `await A.gesture(name, o)`, `A.expr(name, {k})` (k 0..1 strength;
  `A.raw.eyeFront.{L,R}` are points on the eye surface for glints — `eyeAnchors` are the eyeballs' pivots inside),
  `A.hold(hand, prop, {pose, offset:[x,y,z], rot:[x,y,z]°})` (offset/rot place a custom Object3D in the grip; on
  Aidan a prop in the left hand wins over the equipped weapon until `A.hold('L', null)` or the scene ends),
  `await A.fade(a, dur)`, `A.say(text)`, `A.remove()`, `A.raw` (Rig actor). `G.aidan` drives the player while a
  blocking script holds control (Player never writes Aidan's transform then).
  Presets: `aidan aidan_perfect wai chase chloe luka luke nan nan_gown man_counter old_man customer rep` (Wai wears
  his candy-bar phone in a belt pouch — `A.hold('R', 'candybar')` takes it into his hand, `A.hold('R', null)` puts it
  back).
  Loops: `idle stand_still idle_hunched walk run run_bad stagger pace sit sit_lean sit_floor sit_knees sit_bed kneel
  kneel_one crouch cower lie lie_side collapse climb crawl type work brace struggle hurt`.
  Gestures: `rub_neck pen_click shift_weight rub_eyes tap_bar bounce check_shoulder fidget tremor offer point raise_phone
  hands_up cover_lanyard head_in_hands nod shake_head wipe_eyes reach swing hand_on_shoulder sit_down stand_up shrug
  laugh peer sigh clench flinch look_around smooth_uniform touch_pendant grip earbud_out earbud_in glasses_off
  glasses_on`. Expressions: `neutral smile grin sad cry wide tired smile_huge flat angry scared pain shout`.
  Hand props: `phone tablet bar coffee clipboard candybar flip headset keys box_cutter extinguisher pen box jumper_tool
  pendant handset card`. `offer` takes `target` (an actor — the hand goes a hand's width short of his chest, at his
  hand height — or a point), clamped to the arm's reach; without it the hand goes out at chest height. `phone_ear`
  raises the elbow out to his side and a little back (seen from the far side the arm stays behind his head and never
  crosses his face; from the front his mouth is clear; the rig's forearm is too short for a dropped elbow with the phone
  at the ear, so frame phone-side close-ups from the front quarter); `phone_look` keeps the fingers on the phone's back.
  Wai's reading glasses have no cord; `glassesState('hang')` hooks them into the shirt placket. Chase's earbud cords
  run down each side of the neck and chest to a splitter at the waist. Idle "habit" gestures fire on their own — set
  `A.raw.idleLife = false` for long still beats.
* Camera: `G.cam({pos, target, fov, roll, far, to:{…}, dur, ease, follow, keys:[{t,pos,target,fov,roll}]})` — pos/target
  may be `[x,y,z]`, a mark name, an Object3D or an actor (its head). Returns at once; `await G.camDone()`; the camera
  holds its last frame until `G.camRelease()` (automatic when the scene ends).
* Declarative: `G.shot({cam, fade, actors:{id:{preset, place, pose, look, walk, gesture, …}}, sfx, music, lines:[…],
  dur:'input'|sec, out})` and `G.shots([…])`.
* Presentation: `G.letterbox(on)`, `G.fade(to, dur, color)`, `G.card(text)` (leaves the screen black),
  `G.title(text)`, `G.textOnBlack(text, dur)`, `G.post({grade, desat, noise, white, blur, …, dur})` (restored when a
  letterboxed scene ends), `G.hud(on)`, `G.screen(content, {style:'crm'|'case'|'terminal'|'phone'})`,
  `G.keypad({style:'terminal'|'lockbox'|'padlock'|'rotary', code|check, …})`, `G.stamp(text, o)`.
* World: `await G.goto(room, entry, {sound, fade})`, `await G.outage(on)` (resolves at the siren cut, 6.25 s),
  `G.setOutage(on)` (instant), `G.spawn(def)`, `G.enemy(id)`, `G.pos(mark)`, `G.region`, `G.obj`, `G.door`, `G.light`,
  `await G.lightsOut({dur})`, `await G.call(id, {until, cancelOnLeave})` (→ 'answered' | 'declined' | 'cancelled';
  a pending call is withdrawn — no S.calls entry, no F/A, no voicemail — when `until()` turns true, when Aidan leaves
  the room it rang in, or on `Phone.cancel(id)`; otherwise it waits for scenes to hand control back),
  `await G.hold(text, sec)`, `G.bars(n|'noservice'|'flicker'|{n, battery, letterbox:true}|null, {room:true})`
  (`letterbox:true` keeps the HUD indicator up under a letterbox), `await G.boss(id, o)` (the calling scene steps
  aside: no letterbox, control back, not skippable),
  `await G.startChapter(n, {card:false})`, `await G.ending(name)`, `G.autosave()`, `G.dist(a, b)`.
* State: `G.flag / G.set / G.track('F'|'A', n) / G.give(id, n, {silent}) / G.take / G.has / G.count / G.equip /
  G.note(text, {id, done}) / G.doc(docId, {page, highlight:[strings|RegExps]}) (opens at that page with those lines
  highlighted; a highlight alone opens on its first page) / G.once(id) / G.mapMark(id, {at:[x,z], t, text}) / G.stat / G.heal /
  G.damage(n, source, o)`.
* Builtins (`Script.builtins`): pickup ("Aidan picked up the <name>." — `ITEMS[id].pickupName` overrides; map items
  scribble and set `S.maps`), doc (Menus reading view; the doc's `track` once; `DOCUMENTS[id].after(G, first)`),
  payphone (§2A exactly; Wai's `DIALOGUE.wai_payphone` lines when `waiSaved` and chapter > 3), breakTable (once per
  chapter), door (World.useDoor), useItem, sticker (also written to `META.stickers` for NG+).

---

## 3. Cameras

* Types: `static`, `pan` (`pan:{lag, yaw, pitch}` limits in degrees around pos→target), `rail` (`rail:{a, b, look,
  lag}` — pos slides by Aidan's projection onto a→b, looking at Aidan + look), `scripted` (room camera with `keys`,
  `loop` — plays when cut to). `fov:'fit'` computes the smallest fov (30–60) that frames the volume; `y:[y0,y1]` limits
  a volume by Aidan's foot height (platforms, ladders); higher `pri` wins where volumes overlap; `world`, `when(S)`.
* Selection: 0.5 m exit hysteresis, then `pri`, then keep the current camera. The hysteresis only holds the current
  camera while it can still see Aidan where he stands (feet and head in frame, no wall / closed door / tall prop
  between the lens and his chest; one-sided `both:false` walls seen from behind don't block) — otherwise the best
  containing camera cuts in, so walking past the edge of a volume through a doorway never leaves him off-frame.
  Outside every volume the current (or the nearest) camera stays. `Cam.lock(id)` forces one; `Cam.snap()` after
  teleports.
* **Making `Cam.check` pass:** it samples every walkable 0.5 m grid point (on a floor, not inside an enabled collider)
  at 0.1 m and 1.8 m and requires it to be on screen for the camera that owns it.
  - A static camera cannot see steeply below itself: keep it ≥ 4 m (horizontally) from the near edge of its volume,
    e.g. put the west half's camera in the east half and vice versa (test room hall).
  - Tiny rooms: put the camera outside a `both:false` wall (cutaway) — see the test room's store room.
  - Pan and rail cameras aim at Aidan, so they only fail on pitch/yaw limits (points almost under a pan camera).
  - Each point is checked against the highest-`pri` unconditional camera containing it (and any `when` camera);
    volumes may overlap freely. Doorways of closed in-room doors aren't sampled — overlap volumes by ~0.3 m there.
  - Rooms with Outage-tagged content are checked in both worlds.
  - `SH.camCheck('room'|'*', o)` → `[{cam, x, z, y, h, why, world, …}]`; the debug panel's CAMERA VOLUMES draws volumes
    (current = yellow) and the problem points (red). `why`:
    `'uncovered' | 'offscreen' | 'behind'` as above;
    `'fogged'` (`dist`, `max`) — the lens is more than 1.6 / density from his chest (FogExp2 ≈ 92 %: a faint ghost;
    21 m in 0.075 street fog, 32 m at 0.05). The density is the room's (fog / outageFog / env, else Render's preset),
    the room's `fogAt(x, y, z, outage)`, or the camera def's `fog: density | false | (x, y, z, outage) => density`;
    `'lens-inside'` (`hit`, `frame`, `inside`) — the lens sits inside a closed shell (most rays from it first meet back
    faces) and the shot shows the shell's insides (≥ 2 of 25 rays through the frame meet a drawn surface inside it: a
    camera at the edge of a parked car); or the lens is ≥ 5 cm inside a prop's own collider (in its height band) and
    ≥ 2 of the 25 frame rays first meet a drawn surface ≥ 3 cm inside that collider (`inside: 'prop collider'` — a
    camera in the middle of a car sees its underbody, wheels and the undersides of its glass; room-level `bare`
    colliders, blockers, exits, doors and enemy bodies don't count); or clutter covers 65 % of the frame within 1.2 m of
    the lens (opaque surfaces, foliage and sheeting by their opacity: a camera buried in a shrub, behind a curtain). A
    lens inside a plain single-sided box looking out through its culled side passes (the stair-core / cutaway tricks —
    the floor, ceiling and walls on the box's boundary don't count as its insides), and so does foreground dressing;
    ladder samples (`ladder: id`) — Aidan on every `K.ladder` (where `Player.climb` holds him, every 0.5 m) against the
    camera whose volume and `y` band hold his feet there (a height no camera contains keeps the camera he climbed in
    with, so it isn't checked).
    `o.fog:false`, `o.lens:false`, `o.ladders:false` turn those parts off.
  - **Line of sight** (optional, slow): `{occlusion:true}` also casts rays from each camera to Aidan's hips, chest and
    head at every sample (1 m grid) against the room's visible opaque meshes: `why:'occluded', hit:'<object name>'`
    when two of the three are blocked (a rail across his chest alone doesn't hide him) — door leaves, walls seen from
    the wrong side, sign backs, ducts, counters; `why:'veiled'` (`t` = transmittance) when transparent layers (plastic
    sheeting, curtains, glass, cut-out foliage — material opacity × the texture's average alpha) let less than 45 %
    through. Cutaway (`both:false`) faces seen from behind don't block.
    `{occlusion:'summary'}` reports one problem per camera whose occluded + veiled share of its samples is over
    `o.occlusionMax` (default 0.05): `{cam, why:'occluded', frac, n, of, hit}` — the acceptance pass for line of sight:
    `node tools/run.mjs --file … --eval "return SH.camCheck('*', {occlusion:'summary'})"`. Not part of the default
    check (it takes ~2 min for every room). The debug panel's LINE OF SIGHT button runs it for the current room and
    draws the occluded / veiled samples.
  - Rooms with `cutsceneOnly:true` are skipped; `stackedFloors` rooms are sampled on every layer.
* Composition helpers: `Cam.shake(a, dur)` (respects Options), `Cam.basis()` for camera-relative input.

---

## 4. World, Player, the Outage

* `World.goto(room, entry, {sound:'door'|'steps'|'none', fade, style})` — doors: 1.5 s black with handle/creak/close.
  Entry = name | `[x,z,yaw]` | `{pos:[x,z]|[x,y,z], yaw}` | null (→ `entries[fromRoom]` → `start` → the first).
* `World.outageTransition(on)` = spec §2: dial-up + siren (6 s), grain/CA ramp, light banks die toward the camera
  (1.2–4.0 s, all dark before the swap hides the Fog world's fixtures), environment/grade cross-fade from 1.4 s, surfaces dissolve 2.4–5.6 s, tagged objects/colliders/spawns
  swap at 4.0 s, siren cut + the world's lights at 6.0 s, phone bars climb 0→3 then automatic at 8.7 s. Leaving: 4.6 s,
  exhale of static, the swap at 2.0 s. `World.outageBusy` while it runs. `Bus 'outage:begin'(on)`, `'outage'(on)`.
* `World.move` resolves dynamic colliders (enemy bodies, `c.dynamic`) first and caps their push-out at 0.4 × the
  radius per pass, statics right after: a body that walked into Aidan eases him away but can never shove him through a
  thin wall.
* `World.move/heightAt(x, z, refY?)/los/raycast/pointFree/surfaceAt`, `World.lightsOut/lightsOn({dur, filter})`,
  `World.mark(name)`, `World.mapXform(xform, x, z)`. `room.map.xform` / `rxform` may be the array, a function
  `(x, z) → array`, or a list `[{box:[x0,z0,x1,z1], xform}, …]` (set pieces whose parts sit apart; an entry without a
  box is the default) — map marks, the map's arrow and automatic marks all resolve it where the point is.
* **Automatic map marks tick themselves**: on room load and on every `flag` / `pickup` / `chapter` / `outage` event the
  current room's X marks are re-checked — a door that is no longer locked (a `locked()` function turned false), an
  exit whose `when()` passes, a blocker that is no longer built all turn into ticks.
* `World.cancelTransition()` (Game's teardown calls it): a room change in flight from a flow being replaced never
  finishes later (a new game / chapter select / load always lands where it asked).
* `Render.lightAt(point, {torch, pool, ambient})` → a rough light level at a world point (≈ 1 two metres in front of
  the torch) for effects that must only show where light really falls (glints, the Tethered's clamshell glare).
* Player: `Player.pos / yaw / yawDeg / actor / mode ('normal'|'crawl'|'ladder'|'grabbed'|'pinned'|'down'|'dead') /
  control / lock(reason, on) / teleport(x,z,yaw) / face(deg) / damage(n, source, {minHealth, knock, push, from, dot}) /
  heal / kill / status() / setGaze / crawl(on) / pin(on) / grab({mash, damage, source}) / setTorch / noclip`.
  Damage from an enemy (the enemy object, `'enemy:…'`, `'boss:…'` or a type name) gets `DIFF.dmg`; anything else is
  taken as given. Walk 1.6, run 3.5 m/s (6 s stamina). An E pressed in the last 0.5 s of a swing is buffered.
  **"Hold E" while the player has control** (Ch 4's "Hold him back"): read `Input.held('interact')`, not
  `Input.down('interact')` — the E press that starts the hold also goes to any interactable in reach (or dismisses a
  message) and is *consumed*, so `down()` stays false for the rest of that hold; `held()` sees the key physically down.
  Disable examines near such a mechanic while it runs (`when: () => !fightOn`).
  E with a message up: it goes to the interactable he faces (a door during a boss objective); it only dismisses the
  message when E has nothing else to do, or when the target is the thing he just used (dismissing "It's locked."
  never re-tries the door). In crawl mode only `{crawl:true}` interactables work. `Player.restoreBody()` puts his
  actor back as a new game expects it (posture, habits, expression, the phone in his right hand, nothing in the left,
  head scale, opacity); `Player.reset()` and every new game / ending call it.
  Direction hold (spec §3) keeps the previous camera's axes after a cut; across a room change or teleport a direction
  held through the transition keeps him walking along his entry facing instead (the old axes mean nothing in the new
  room) until it is released or changed. The phone lights his face (a weak pool light at the screen, off when dead).
  **Torch bounce:** while the torch is on, one pool light (prio 20, range 3.4 m) hangs 0.55 m ahead of him and 0.6 m
  toward the lens, 1.3 m up — 0.8 in the Fog world, 2.3 in the Outage, scaled down where room lights already reach
  him — so a fixed camera 6–15 m away keeps him readable in a dark interior. (Ch 1's own `C1_bounce` is gone.)
  `Player.poseSnapshot()` / `poseRestore(snap)` (Script uses them per letterboxed scene).
* Weapons: `ITEMS[id].weapon = {dmg, speed:'fast'|'slow', range, arc, knock, spray}`; defaults exist for
  box_cutter / steel_bar / extinguisher. Extinguisher: ready + attack sprays (`S.ammo.extinguisher`), attack alone bashes.
  Every extinguisher picked up adds its `ITEMS.extinguisher.ammo` (6) sprays (the first one sets the count); the
  Items screen shows "sprays / charge carried" ("4/6", "10/12").

---

## 5. Enemies

Spawn defs (room `spawns` or `G.spawn`) use persistent ids `'room:local'`; resolution goes to `S.spawns[id]`
(`'freed'`/`'dead'`), freed Tethered to `S.freedOrder`. Resolved Tethered are rebuilt passive (freed sit, dead lie);
other dead enemies aren't spawned again.

* `tethered` — `anchor:[x,z]`, `sit:true|'floor'`, `seat:{pos,rot,h}` (where it sits once freed: it walks past the
  seat's own low collider — a bench — and shuffles the rest of the way if held short), `watching:true`, `voice:false`,
  `noticeRange`, `threat:false`, `detail:'low'` (or `rig:{detail:'low'}`, ≈ 39 calls instead of 49 — figures seen at a
  distance; the Reach takes it too). `e.alert()` starts its turn; `e.alert({voice:true})` also plays the muffled
  "I only came in to..." whatever the 25 s voice throttle says (reset each chapter). Cut free = hold E 2 s with the
  box cutter on a downed or unaware one (F+1); stomp = A+1.
* `e.pinned` — hits never push it back and other bodies never shove it; default `def.pinned ?? def.static ??
  T.static ?? (T.body === false)`: hitbox-only stand-ins for set pieces stay on their prop. `hitTest`'s line of sight
  aims 5 cm inside the rim and ignores any collider containing the hitbox centre (a stand-in's own `K.collider`), so a
  diagonal swing at a boxed plinth lands. Enemy fx groups (`enemyfx:<id>`: tethers, held boxes) are fog-culled with
  their body (`actor.cullWith`). Monster voice lines (`Enemies.say`) sit above whatever subtitle or message is up
  (`UI.textTop()`), never over one of Aidan's thoughts.
* `reach` — rage 20/s × DIFF.rage in sight, lunge at 100 (20 dmg), can't pass closed doors (pounds on them).
* `borrowed` — `disguise:'wai'|'chloe'|'luka'`, `line`, `lineWhen`, `examine`, `badge`, `hands`, `wristband`, `anim`,
  `autoRange` (4), `interactR` (2.6), `auto:false`. Within autoRange (or E): Talk / Examine / Step back; Examine then
  Step back reveals it at range. Its E target has the people priority (0.35 m), so a closer, faced padlock wins.
* `unread` — `cluster:[[x,y,z]…]` 1–3 cm off a wall/ceiling, `count` 30–60. Torch light wakes it; torch off + still 3 s
  settles it; the spray scatters it. Unkillable. Needs a free pool light for its red glow. The swarm stays below
  max(floor + 3.4 m, nest + 1 m) (`ceiling` overrides); `vertical:true` (a nest above a platform / in a ladder cage) also
  wakes on the torch's spill (lens within 3 m or beam axis within 1.2 m) and follows Aidan up (ceiling ≥ his feet + 2.4).
* `standard` — room-local `route:[[x,z,pause?,faceDeg?]…]`, `mode:'patrol'|'hunt'`; across rooms:
  `Enemies.standard.start({graph:{nodes:{id:{room, pos:[x,z], door?, pause?}}, edges:[[a,b]…]}, node, name, mode,
  route})`. It stops on death, load and `chapter` — restart it from the chapter/room script. Its graph position is
  not saved. It opens only doors its way actually passes through (a patrol pausing in front of a meeting-room door
  leaves it shut; `e.data.noOpen = true` opens none). `def.puppet` / `e.puppet = true`: the body, name card, keys,
  form and mirror keep working but it never thinks or moves (a script drives it); `e.scripted = true`: with its AI off
  it keeps the animation the script set. The engine's own contact ("Got a sec?") state lives in `e.data._stdContact`, so
  a custom type that reuses `Enemies.types.standard.update` for the look can keep its own `data.contact`. `e.clipboard(up)` / `e.straighten(k, dur)` work on any Standard-bodied enemy
  (a custom type built with `Enemies.types.standard.create`).
* Bosses / custom: `Enemies.defineType(name, {create(e, def), update(e, dt), onHit(e, dmg, weapon) → false to consume,
  hp, radius, hitbox(e), downs:false, invincible, threat, tell})`; `defineBoss(id, {async run(G, o)})` →
  `await G.boss(id)`.
* Events: `Bus 'enemy:freed'(e)`, `'enemy:killed'(e)`. `Enemies.freedRow(points, {face})` for 8-1.
* **Hiding / AI:** `Enemies.visible(e, on)` (or `e.hidden = true`) hides an enemy — it is also no threat, not hittable
  and has no body collider; `Enemies.update` sets `e.obj.visible` from `e.hidden` every frame, so `actor.visible()`
  alone is undone. While a blocking script runs, during transitions and once Aidan is dead enemies get `ai=false`
  (they still animate); `e.scriptAI = true` keeps one thinking during blocking scripts (an alert inside an in-engine
  beat turns it at once — it will also attack). `e.ai = false` hands it to a script for good.

---

## 6. UI, Menus, Phone, Save — the data they read

* `ITEMS[id]`: `name, cat:'item'|'weapon'|'key'|'map', desc, model() (static — world pickups are merged), heal, stack,
  weapon, ammo, map:'<mapId>', details:[{text, face:[x,y,z], zoom, min}], combine:{otherId:{result,n,msg,keep}} | fn,
  use(G), pickupName`. `desc`, `details` and a detail's `text` may be functions of `S` (riddle-level wording).
* `DOCUMENTS[id]`: `title, group ('Story'|'Account Notes'|"Operator's Log"|'Whiteboards'|'Returns Notes'|'Personal'),
  paper ('lined'|'notebook'|'dotmatrix'|'email'|'sticky'|'whiteboard'|'laminated'|'receipt'|'plaque'|'card'|'phone'|
  'paper'), text ('\n' breaks, '~~struck~~' lines), hand (cursive after the text), track:{F|A}, after(G, first)`.
  The reading view shrinks long texts before paginating and grows short ones (up to 1.6× the paper's design size) so
  a few lines don't sit at the top of a big page.
* `MAPS[id]` per contract §10.6 plus `sub, printed, publisher, floorOrder, floorNames:{G:'Ground', …}`, receipt maps
  `kind:'receipt', of:'<map>'`; rooms `map:{id, floor, xform:[ox,oz,scale,rot], outage:'<receipt id>', rxform}`. Ids are
  fixed by CONTENT_PLAN §3. Floor tabs print as names (`B` → Basement, `G` → Ground, `L4` → Level 4, `P1` → Parking 1;
  `floorNames` overrides). Three zoom steps (sheet → building → close). A mark's note that would run off the sheet is
  drawn to the left of the mark. `Bus 'menu:before'(name, opts)` fires before any screen is built (refresh marks).
* `CALLS[id]`: `caller, n, answer(G), voicemail (string with tags | async G), voicemailText (the transcript of a
  scripted voicemail), track (true | false | {answer, decline})`.
  Luka's calls (caller 'LUKA' or id 'luka…') track F+2 / A+2 automatically; first voicemail play F+1.
* `DIALOGUE.credits` (credits lines: strings, '' gaps, `{title}`, `{head}`, `{role,name}`, `{text,italic}`),
  `DIALOGUE.wai_payphone`, `DIALOGUE.reach` (Reach shouts).
* UI for scripts: `UI.say`, `UI.subtitle`, `UI.message`, `UI.prompt(text, {id})` (once per id; `{interact}` style
  tokens become key labels), `UI.card`, `UI.titleText`, `UI.textOnBlack`, `UI.keypad`, `UI.screen` (+ `UI.crmHtml`),
  `UI.bars`, `UI.sting`, `UI.stamp`, `UI.letterbox`, `UI.fade`, `UI.noSignal`. Keypads keep digits typed while they
  are locked (opening, the wrong-code shake) and replay them; the press that opened one never counts; `check()`
  messages may use `[beat]` / `[long beat]`. UI acts on each press / typed character once per `Input.update`
  (`Input.frame`): when the game loop stalls for > 0.25 s (a slow SwiftShader frame) UI ticks itself, and a keypad used
  to read the same typed digits twice — a doubled digit made a correct code fail (the Ch 4 rotary flake).
* Sound: `Snd.define(name, build(ctx, dest, o, t, own) → seconds|Infinity, {vol, bus, loops})` registers a content
  voice played like any other (`G.sfx`, `Snd.loop`, positional, ducked with the rest); wrap every node in `own(node)`.
* Phone: `Phone.ring(id, {until, cancelOnLeave})`, `Phone.cancel(id?)`, `Phone.bars(override)`, `Phone.note(text, {id, done})`, `Phone.display({title, big, lines,
  button})` for inserts (e.g. "CASE 118-2231 … CALL").
* Save: slots 0–2 + `'auto'`. `Game.startChapter(n)` takes `Save.autosave({room, entry, chapterStart:n})` with the
  chapter's start — always, even when Aidan already stands in that room — and continuing from it resumes at that entry
  and **re-runs the chapter's `begin(G, {resumed:true})`** (the envelope's `chapterStart` flag decides). A plain
  `G.autosave()` / `Save.autosave()` saves where Aidan stands (no begin re-run). Everything in `S` is saved; keep all
  state that must survive in `S` (flags, `S.done`), never in closures.

---

## 7. Chapters, endings, title (Game)

```js
defineChapter({ n: 1, id: 'ch1', title: 'THE PLAZA', card: 'SIGNAL HILL PLAZA', cardSub: null,
  start: { room: 'c1_relay', entry: 'south' },
  debugState(S) { /* the inventory/flags a player has at this chapter's start (chapter select) */ },
  async begin(G, o) { /* o.skipIntro (SH.newGame({skipIntro:true})), o.resumed (from the autosave) */ } });
```

* `Game.startChapter(n, {card, skipIntro})`: `S.chapter = n`, Bus `'chapter'(n)`, the card on black (only if
  `card` is set — chapter 0 has none), autosave, `World.goto(start)` without a fade, fade in, then `begin(G)` runs as
  a persistent background script (not awaited). A chapter ends with `await G.startChapter(n + 1)` from any script,
  including a blocking cutscene (the next chapter's first cutscene waits for it to finish). Pass `{card:false}` if the
  scene showed its own card.
* `skipIntro` skips the first skippable scene `begin` plays (its state changes still apply).
* **Endings.** Ch 8 decides with `Game.endingFor(S)` (`'yes'` when `S.playthrough ≥ 2` and all of `sticker01`–`12`
  are in `META.stickers ∪ S.stickers`; then deal / A ≥ F → `'tomorrow'`; F ≥ 35 and ≥ 3 of Wai/Chase/Chloe/Luke →
  `'connected'`; else `'coverage'`), plays its in-room part, then `await G.ending(name)`. `Game.ending` plays the
  registered cutscenes nested in the caller (each with `inheritSkip:false`: a skip of the Ch 8 scene never swallows
  them): connected `E-C1`* → `E-C2` → credits → `E-C3` (the post-credits scene, right after the roll) → fate cards →
  results;
  coverage `E-OC0`* → `E-OC` → credits → fates → results; tomorrow `E-FT0`* (not after the accepted deal) → `E-FT` →
  credits → results; yes `E-YES` → credits (hold music) → results. (*skipped if `S.done['cs:<id>']` — Ch 8 already
  played it.) Missing cutscenes are skipped (a name card shows if none exist). Results are recorded
  (`META.endingsSeen/results/completed` → EXTRA and New Game+), then the title. Ending cutscenes may `G.goto` any room.
  Never call `G.ending` from inside one of the ending cutscenes (it would wait for itself); call it once, from Ch 8.
  The first room of each chapter pays for first-use texture generation (up to ~0.6 s in headless SwiftShader) — it
  happens behind the chapter card / black, so keep chapter starts on black.
* **Title backdrop:** `ROOMS.t_title` is built on its own — no player, spawns, triggers or `onEnter`; its `animated`
  callbacks run; its first camera is used with a slow push (a `keys` camera plays as is). Without it a built-in fog
  vista shows. **Attract (60 s idle):** `defineScript('title:attract', async (G, {signal, show}) => { await show(
  'c1_relay', {index: 0, dur: 7}); … })` — `show(roomId, {cam, index, dur})` fades to that room's camera; stop when
  `signal.aborted`. Default: silent shots of c1_relay, c2_crescent, c3_hall, c5_atrium (whichever exist).
* Playthroughs: every NEW GAME after a finished game counts (`S.playthrough = META.results.length + 1`), so the Yes
  ending works on any second run with all 12 stickers (collected stickers persist in `META.stickers`). New Game+ (from
  EXTRA) adds `S.ngPlus`, the steel bar in the inventory and `S.stickers` = `META.stickers`.
* Death: Player collapses → Bus 'death' (scripts abort) → camera holds → colour drains, static fills (2.8 s) →
  disconnected tone + NO SIGNAL → CONTINUE (latest save) / LOAD GAME / TITLE. Only in play mode.

---

## 8. Testing a room or a chapter

```
node tools/build.mjs --out .build/me.html && node tools/lint.mjs .build/me.html
node tools/run.mjs --file .build/me.html --newgame --room c1_relay:south --shot .build/relay.png
node tools/run.mjs --file .build/me.html --newgame --chapter 1 --advance 20 --shot .build/ch1.png
node tools/run.mjs --file .build/me.html --newgame --room c1_relay --camcheck        # [] = every point covered
node tools/run.mjs --file .build/me.html --camcheck --all-rooms
node tools/run.mjs --file .build/me.html --script my_test.mjs --shot .build/end.png
```

`window.SH` (from `--eval "…"` or a `--script` module's `h.eval`): `SH.ready, SH.S, SH.mode ('title'|'newgame'|
'calibrate'|'play'|'menu'|'cutscene'|'death'|'ending'|'credits'|'fates'|'results'|'loading'), SH.state()` (room, cam,
pos, F, A, script, menu …), `SH.newGame({skipIntro, action, riddle, ngPlus})`, `SH.chapter(n)` (fresh state +
`debugState`, no card), `SH.goto(room, entry)`, `SH.testRoom()`, `SH.advance(sec)` (30 Hz game ticks, no rendering),
`SH.skip()`, `SH.choose(i)`, `SH.press(action, sec)`, `SH.teleport(x, z, yawDeg)`, `SH.camCheck(room|'*')`,
`SH.rooms()`, `SH.run(async G => …)` (a background script with a G), `SH.preset('connected'|'coverage'|'tomorrow'|
'yes')`, `SH.ending(name)`, `SH.menu(name)`, `SH.nav('confirm'|…)`, `SH.debug(on)`, `SH.screenshot()`, `SH.errors`,
`SH.fps`, `SH.mod.<Module>`.

Tips:
* SwiftShader runs at 5–15 fps and real dt is clamped to 0.05, so game time crawls in real time. Drive tests with
  `SH.advance(sec)`; to move Aidan, hold a real key around it:
  `await page.keyboard.down('d'); await h.eval('return SH.advance(1.5)'); await page.keyboard.up('d');`
  (`SH.press` injects actions such as `interact`, `attack`, `ready`, `pause`, and `up/down/left/right` walk too; a
  press injected while the previous one is still held gets a fresh press edge).
* **Hold times follow game time under `SH.advance`.** Input keeps its own clock: real time in the live loop, the fixed
  1/30 s tick while `Game.manual` is on. `SH.press('ready', 1)` then holds for one GAME second whatever the machine's
  speed, and a real key held across `SH.advance(1.2)` counts as held 1.2 s (the 1 s Esc skip, E holds, menu repeat).
* `SH.goto` closes an open menu screen first (a document's reading view an interaction opened) — it used to hang.
* Fog culling runs on `SH.advance`'s manual ticks too, so `Render.render(0)` afterwards counts what a real frame draws.
* `--newgame --chapter N` (and `SH.newGame()` then `SH.chapter(n)`) lands in chapter N's start: the Prologue's room
  changes in flight are cancelled by the chapter select. `SH.goto(room, entry)` in play cancels a transition in
  flight and aborts running blocking scripts (a cutscene still moving Aidan between sets) before it jumps.
* `SH.nav(a)` only queues while a menu screen is open (sent during a cutscene it is dropped), and leftovers are
  cleared when the menus close — a stale `confirm` can't pick the next menu's first item.
* Wait for a menu to be *ready* before pressing keys: `SH.mod.Menus.current === 'save' && SH.mod.Menus._top.ready`;
  wait for `SH.mod.Script.choosing` before `SH.choose(i)`.
* Teleporting into a trigger box fires it; mark it done first to avoid that: `SH.S.done['trig:<id>'] = true`.
* `Render.stats()` reports the last *rendered* frame — call `SH.mod.Render.render(0)` after `SH.advance` before reading
  draw calls.

**The full regression pass** (a `--script` module; run it without `--allow-errors` — it must end with 0 problems):
boot (`SH.mode === 'title'`) → `SH.nav('any')`, `SH.nav('confirm')` through NEW GAME / setup / calibration until
`SH.mode === 'play'` → `SH.goto('test_room','start')`, walk (real keys), pick up the coffee (`SH.press('interact')`),
TR-1 via its trigger (`SH.skip()`, `SH.choose(0)`) → `SH.menu(name)` for pause, items, map, memos, phone, options
(wait for `Menus._top.ready`, `SH.nav('down'|'right')`, `Menus.close()`) → `Save.save(0)`, change state,
`Game.continueFrom(0)` → `World.outageTransition(true)` + `SH.advance(9.5)`, then `(false)` + 5.5 s → in
`test_room2` spawn one of each monster type, equip the bar and `SH.press('ready', 0.6)` + `SH.press('attack')` a few
times → `Player.kill()`, wait for the `death` menu, `SH.nav('confirm')` (CONTINUE) → for each of connected, coverage,
tomorrow, yes: `SH.preset(name)`, `SH.ending(name)`, then `SH.skip()` + `SH.nav('confirm')` + `SH.advance(1)` until
`SH.mode === 'title'` (`META.endingsSeen` lists all four). `SH.errors` must stay empty.
* The debug panel (backtick) shows room/camera ids, F/A, flags, fps and draw calls, chapter select, noclip, camera
  volumes with the check, Outage toggles and the ending presets.

**The whole game in one session** — `tools/tests/chain.mjs` (the chapter tests `tools/tests/ch0.mjs … ch8.mjs` export
`play(h, {path, riddle, saveLoad})`; the chain runs them back to back from a real NEW GAME on the title, checks every
hand-off, the ending (the path's, chosen through its spec §4 branch — the deal / A ≥ F / F > A — with its scenes in
order), credits → fates → results → title, then LOAD GAME on the payphone saves and CONTINUE from every
chapter-start autosave, and prints a per-chapter timeline):
```
node tools/build.mjs --out .build/chain.html
SH_PATH=connected SH_RIDDLE=normal node tools/run.mjs --file .build/chain.html --size 640x360 --script tools/tests/chain.mjs
```
`SH_PATH` connected | coverage | tomorrow | deal; `SH_RIDDLE` / `SH_ACTION` easy | normal | hard (picked on the NEW GAME
setup screen); `SH_DEATH=1` kills Aidan once in every boss fight (Chapters 1 3 4 5 6 8) and checks that the death
screen's CONTINUE restores the latest save exactly before the chapter's test plays on (the notes the test wrote before
the death still count); `SH_RESUME=1` continues every
chapter from its autosave before playing it; `SH_FROM_AUTO=.build/chainlogs/<path>_<riddle>_chN.auto.json` replays from
a chapter-start autosave a run wrote. The release matrix: connected (normal, `SH_RIDDLE=hard`, `SH_RIDDLE=easy
SH_ACTION=easy`, `SH_DEATH=1`), coverage, tomorrow (normal, `SH_ACTION=hard`), deal — each must end `PASS chain …` —
plus `tools/tests/stickers.mjs` (each Ollie sticker placed once in `src/data` and taken in its room; the first
playthrough is not Yes; after its ending, EXTRA → NEW GAME+ starts playthrough 2 with the stickers and the bar, and
Chapter 8's hut door opens onto E-YES → credits over the hold music → results → title), `tools/tests/endings.mjs`
and `tools/tests/skipall.mjs` (spec §14 "every cutscene is skippable and still applies its state changes", below).

**Every cutscene, played and skipped** — `tools/tests/skipall.mjs`:
```
node tools/build.mjs --out .build/skip.html
node tools/run.mjs --file .build/skip.html --size 640x360 --quiet --script tools/tests/skipall.mjs
```
For every id in `CUTSCENES` (read in the page) the scene runs twice from the same state — PLAYED through
(`SH.advance`, every choice option 0, an in-world screen's first button, E held for a `G.hold`, a reading view closed)
and SKIPPED (`SH.skip()` the moment its Bus `'cutscene' start` fires; a scene it starts in a skip chain of its own —
8-1 → 8-2 — is skipped as it comes) — and the two must agree: S when the scene ends (play time, walked/ran and
`S.pos` left out; `cs:` markers listed only) and its story part again 10 s later, Aidan's position (0.35 m), the room's
NPCs (place, shown; loop, face, hand props once settled), monsters and doors, the scenes it started, its autosaves, its
choices, and 10 s after it the letterbox, HUD, fade, post chain and grade, music, ambient bed, cameras, control and
locks, Aidan's body. The skip
must work (`Script.skip()` → true) and end the scene at once (only choices, screen buttons and holds still wait); once
nothing holds the player, neither run may leave the letterbox, a scripted camera, a skip, the HUD down or the screen
black (the ending hand-overs — E-*, 8-2A — end on black by design). A scene that starts a boss fight (1-3, 4-2, 5-3) is
compared as the fight starts. A music cue the scene started that still plays out after the played scene is listed, not
failed (a skip drops the scene's cues). The start states are **snapshots of real playthroughs**: the first time a scene's
function is called in a chain run, its S (minus its own `cs:` marker — the state right before the scene was asked for),
Aidan's live position, the room and the caller's options are written to `.build/skipall/<path>/<id>.json`
(`SH_SKIPALL=capture`); the replay loads a snapshot as a save is loaded (slot 3 → `Game.continueFrom(2)`), lets the room
start the scene if it does so on entering (an onEnter, a trigger under his feet), else aborts what the room started that
would hold the player (a fight resumed from its autosave) and plays it with `Script.playCutscene`; `Math.random` is seeded
alike before the load and as the scene starts. Missing snapshots are taken first: the four chains side by side
(connected, coverage, tomorrow, deal, ~12 min); E-YES (a second playthrough) and TR-1 (the test room) start from
`SH.chapter(n)` (+ `SH.preset('yes')` / `SH.goto('test_room')`). A replay of all 51 scenes takes ~3 min.
`SH_ONLY=3-2,6-terminal` a subset · `SH_CAPTURE=1` new snapshots (0: never) · `SH_ALLPATHS=1` every path's snapshot of
each scene (163 runs) · `SH_CHOICE=1` the other option of every choice · `SH_RELOAD=cs|run` a fresh page per scene / run
(by default a mismatch is retried once with a reload before each run: only one that survives counts) · `SH_VERBOSE=1`
each run's timeline and the room it left. Prints a row per scene (game seconds played / skipped, the S changes the scene
made, the differences) and `PASS skipall`.
The Action level changes what is in the rooms: Easy adds the `extraOnEasy` heal pickups (one can be the nearest thing
to an E press meant for an examine, a door or a sticker next to it: `press(h, 'interact')` in `tools/tests/lib.mjs` then
takes the pickup first and presses again, as a player would), Hard leaves out a fixed ~30 % of the
heal pickups (`DIFF.pickup`, by id): a test checks a heal pickup through `takeHealPickup` / `pickupPlan` in
`tools/tests/lib.mjs`, never by id alone.
The chain turns `renderer.render` into a no-op (`SH_RENDER=1` keeps drawing): headless SwiftShader rendering between the
test's steps is what made long runs crawl. Tests drive time with `SH.advance`; nothing in the game depends on frames
being drawn. `tools/run.mjs` starts Chromium with `--disable-accelerated-2d-canvas` (`SH_GPU_CANVAS=1` turns it off):
with SwiftShader as the "GPU", accelerated-canvas draws (the Level 4 rankings screen's blurred list at 10 Hz) and
readbacks queued behind each other and could stall a run for many minutes (Chapter 5 went from 700–2700 s to ~40 s).
A page that is not `SH.ready` within `--ready` seconds gets a fresh browser (twice at most: now and then a SwiftShader
Chromium hangs while it boots, with several browsers running). `run.mjs` exits 1 when a `--script` reported a FAIL
(`report()` in `tools/tests/lib.mjs`), as well as on console errors.
* **Game randomness and the tests.** The game keeps `Math.random` (enemy barks, the Escalation's roars, the mast's
  flickering bars…) and the chapter tests play it as it comes, so a check on something random samples until it has seen
  enough (the mast's bars: until three different readings), and a walk has to survive a monster standing in the way
  (`walkTo` leans the sideways key in when the held keys got him nowhere — after 1 s any sideways part of the
  direction, after 2 s a sidestep now and then: the camera-relative 8-way keys can drift him up to 22° into a cubicle
  mouth, and a target a few degrees off the pressed axis then never frees him). To replay a flaky run, seed it: `let s = N;
  Math.random = () => …` (a small PRNG) in the test before the chapter starts.
* **Canvas textures that are read back** (`Tex.util.age`, `pix`, any `getImageData`) must be created with
  `getContext('2d', { willReadFrequently: true })` (every chapter's `ctex` helper does now; Tex / Kit / props always did).
  A GPU-backed canvas makes each readback wait for the GPU process: entering Stairwell A stalled for 10 s to minutes in
  headless runs on one aged 128 × 160 level-number texture.
