# Signal Hill — Content Plan (cross-chapter IDs and wiring)

Binding for everyone writing `src/data/*`. The spec (`docs/BUILD_PROMPT.md`) defines *what happens*; this file fixes the
*names* so chapters written by different people connect. Engine usage: `docs/ARCHITECTURE.md` + `docs/ENGINE_NOTES.md`.

## 1. Files and owners

| File | Contents |
| --- | --- |
| `data/00_items.js` | every `ITEMS` entry (§3 below), with 3D models and examine details |
| `data/01_documents.js` | every `DOCUMENTS` entry (§4), exact text from spec §13, plus the puzzle-clue docs per riddle level |
| `data/02_calls.js` | Luka's 8 calls (`CALLS`), shared `DIALOGUE` sets (§6) |
| `data/21_maps.js` | every `MAPS` entry, map marks, and each room's `map` field (`ROOMS[id].map = {id, floor, xform, outage, rxform}`) — loads after every chapter so it can attach transforms without editing chapter files |
| `data/10_prologue.js` | Prologue rooms/cutscenes/chapter 0 |
| `data/11_ch1.js` … `data/18_ch8.js` | one chapter each, including its boss (`defineBoss`) and custom enemy types |
| `data/19_endings.js` | ending rooms/cutscenes after the transmitter room, credits text, fate cards, `Game.ending` wiring |
| `data/20_title.js` | title backdrop room `t_title`, the 60 s idle attract sequence |

Helper names at the top level of a data file must be prefixed with the file's tag (`P0_`, `C1_` … `C8_`, `END_`,
`TTL_`, `ITM_`, `DOC_`, `CALL_`, `MAP_`) or wrapped in a block. Chapter files do NOT set `room.map` (21_maps.js does).

## 2. Rooms, entries and connections

Entry names are the keys of `room.entries`. "→" = exit/door target `room:entry`. Streets use `K.exit`; buildings use
`K.door({to})`. Every connection must exist in BOTH rooms (so backtracking works) unless marked one-way.

### Prologue (`data/10_prologue.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `p1_car` (car interior set, cutscene only) | `seat` | — |
| `p2_lookout` | `car` (beside the car), `hill` (east end) | east → `p3_hillroad:top`; west = fog wall "The road's just... gone." |
| `p3_hillroad` | `top`, `bottom` | top → `p2_lookout:hill`; bottom → `p4_busshelter:hill` |
| `p4_busshelter` | `hill`, `relay` | west/hill → `p3_hillroad:bottom`; north → `c1_relay:south` (first time: CHAPTER CARD + `G.startChapter(1)`) |

### Chapter 1 (`data/11_ch1.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c1_relay` | `south`, `carpark`, `north` | south → `p4_busshelter:relay`; carpark (60 m, east) → `c1_carpark:street`; north junction → `c2_hilltoprd:bottom` (blocked until `S.flags.c1_address`: "I don't even know where she lives yet."); Exchange Road lower branch = drop; front doors chained |
| `c1_carpark` | `street`, `dock` | → `c1_relay:carpark`; SE corner → `c1_dock:carpark` |
| `c1_dock` | `carpark`, `corridor` | door → `c1_corridor:dock` |
| `c1_corridor` | `dock`, `security`, `staff`, `concourse` | doors → `c1_security:door`, `c1_staffroom:door` (staff_key), fire door → `c1_concourse:fire` |
| `c1_security`, `c1_staffroom` | `door` | back to corridor |
| `c1_concourse` | `fire`, `food`, `store` | → `c1_foodcourt:concourse`, `c1_store:door` (Fog world only: in the Outage the direct way to the store is walled off) |
| `c1_foodcourt` | `concourse`, `kitchen` | kitchen door (Outage only) → `c1_kitchen:food` |
| `c1_kitchen` (Outage only) | `food`, `office` | → `c1_backoffice:kitchen` |
| `c1_store` | `door`, `office` | → `c1_backoffice:store` |
| `c1_backoffice` | `store`, `stock`, `kitchen` | stockroom door ("Stock only. It's locked." in the Fog world) → `c1_stockroom:door` (Outage) |
| `c1_stockroom` | `door` | boss arena |

### Chapter 2 (`data/12_ch2.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c2_hilltoprd` | `bottom`, `top` | bottom → `c1_relay:north`; top → `c2_crescent:gate` |
| `c2_crescent` | `gate`, `office`, `unit9`, `hall`, `garages`, `backgate` | gate → `c2_hilltoprd:top`; doors → `c2_office:door`, `c2_unit9:door` (lockbox 1947), `c2_hall:door`; lane → `c2_garages:crescent`; back gate (NW, padlocked until `c2_loopBroken`) → `c3_exchangerd:gate`; in the Outage loop the back gate leads back to `c2_crescent:gate` |
| `c2_office` | `door` | |
| `c2_unit9` | `door` | in the Outage (`c2_loop`), the kitchen is the swollen `c2_kitchen_out` (door from the hall → `c2_kitchen_out:hall`) |
| `c2_kitchen_out` (Outage only) | `hall` | |
| `c2_hall` | `door` | community hall |
| `c2_garages` | `crescent`, `bay4` | roller door (half up) → `c2_bay4:door` |
| `c2_bay4` | `door` | Chase's hiding place |

### Chapter 3 (`data/13_ch3.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c3_exchangerd` | `gate`, `top` | gate → `c2_crescent:backgate`; top → `c3_forecourt:road`; lower branch = drop "I can't go that way." |
| `c3_forecourt` | `road`, `doors` | doors → `c3_foyer:doors` |
| `c3_foyer` | `doors`, `hall` | → `c3_hall:foyer` |
| `c3_hall` | `foyer`, `records`, `canteen`, `stairs`, `frame` | → `c3_records:door`, `c3_canteen:door`, `c3_stairs:top`, `c3_frame:hall` (maglock powered by HALL) |
| `c3_stairs` | `top`, `landing` | landing → `c3_fuse:door`, `c3_vault:door` |
| `c3_frame` | `hall`, `yard` | side door (after boss) → `c3_yard:frame` |
| `c3_yard` | `frame`, `lane` | yard gate (open after boss) → `c4_wirelane:yard` |

### Chapter 4 (`data/14_ch4.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c4_wirelane` | `yard`, `park` | → `c3_yard:lane`, `c4_park:lane` |
| `c4_park` | `lane`, `lobby`, `ring` | → `c4_lobby:entrance`; east boom gate (gate_key; after Ch 4) → `c5_ringroad:park`; west = drop |
| `c4_lobby` | `entrance`, `floor`, `secoffice` | → `c4_floor:lobby` (Fog only), `c4_secoffice:door` |
| `c4_secoffice` | `door` | the safe room (duress maglock) |
| `c4_floor` | `lobby`, `westwall`, `break`, `records` | → `c4_break:door`, `c4_records:door` (rotary 2231); Outage: route to lobby via `westwall` |
| `c4_break`, `c4_records` | `door` | |
| `c4_oldstore` (Outage boss arena: the lobby as Chase's old store) | `side`, `office` | back office door → `c4_secoffice:door` |

### Chapter 5 (`data/15_ch5.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c5_ringroad` | `park`, `office` | → `c4_park:ring`; forecourt → `c5_forecourt:road`; east of the forecourt → `c7_ringroad:office` (a drop until Ch 6 ends; afterwards "That wasn't there before.") |
| `c5_forecourt` | `road`, `doors` | revolving doors → `c5_lobby:doors` |
| `c5_lobby` | `doors`, `stairs` | turnstile (visitor pass) → `c5_stairs:ground` |
| `c5_stairs` (Stairwell A, ground→L4) | `ground`, `l4` | L2/L3 doors locked; → `c5_level4:stairs` |
| `c5_level4` | `stairs`, `print`, `atriumstairs`, `escalations`, `firestairs`, `kitchen` | → `c5_print:door`, `c5_atrium:stairs` (feature stair), `c6_escalations:door` (card lock, keycard), `c6_firestairs:l4` |
| `c5_print` | `door` | |
| `c5_atrium` | `stairs` | Pedestal arena (Level 2 floor under the void) |

### Chapter 6 (`data/16_ch6.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c6_escalations` | `door` | → `c5_level4:escalations` |
| `c6_firestairs` (fire stairs B, L4→L6) | `l4`, `l5`, `l6` | → `c5_level4:firestairs`, `c6_level5:stairs`, `c6_level6:stairs` |
| `c6_level5` | `stairs` | |
| `c6_level6` | `stairs`, `office`, `lifts` | → `c6_lukaoffice:door`; lift lobby → `c6_shaft:top` |
| `c6_lukaoffice` | `door` | (door chime) |
| `c6_shaft` | `top` | set piece |

### Chapter 7 (`data/17_ch7.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c7_ringroad` | `office`, `hospital` | → `c5_ringroad:office`, `c7_carpark:road` |
| `c7_carpark` | `road`, `entrance`, `summit` | → `c7_reception:entrance`; NE chained gate (open after Room 12) → `c8_summit:bottom` |
| `c7_reception` | `entrance`, `waiting`, `tea`, `corridor` | → `c7_waiting:door`, `c7_tearoom:door`, `c7_corridor:reception` |
| `c7_corridor` (U corridor; the Smile store) | `reception`, `nurses` | → `c7_nurses:corridor` |
| `c7_nurses` | `corridor`, `ward` | → `c7_ward3:nurses` |
| `c7_ward3` | `nurses`, `room12` | → `c7_room12:door` |
| `c7_room12` | `door` | |
| `c7_flashback` (city store back office, daylight) | `desk` | cutscene only |

### Chapter 8 (`data/18_ch8.js`)
| Room | Entries | Connections |
| --- | --- | --- |
| `c8_summit` | `bottom`, `top` | → `c7_carpark:summit`, `c8_compound:gate` |
| `c8_compound` | `gate`, `mast` | gate padlock 1961 (riddle variants); → `c8_mast:base` |
| `c8_mast` (base, ladder cage, platforms at 20/40/56 m) | `base`, `top` | top platform → `c8_transmitter:door` |
| `c8_transmitter` | `door` | the Closer's arena |

### Endings / title
`e_dawn` (Signal Hill at dawn, no fog, the hospital with Luka's car), `e_room12_day`, `e_citystore` (city store floor,
bright), `e_highway` (very high shot of a single car), `e_car` (car interior; can reuse `p1_car`), `e_redlight`,
`e_party`, `t_title` (Lookout vista over the fogged town, the mast's red light blinking far off).

### Chapter starts (`defineChapter.start`)
0 `p1_car:seat` (then P-1 → `p2_lookout:car`) · 1 `c1_relay:south` · 2 `c2_hilltoprd:bottom` · 3 `c3_exchangerd:gate` ·
4 `c4_wirelane:yard` · 5 `c5_ringroad:park` · 6 `c5_level4:escalations` · 7 `c7_ringroad:office` · 8 `c8_summit:bottom`.
Each chapter ends with `await G.startChapter(n+1)` at the moment the spec shows its CHAPTER CARD.

## 3. Items (`ITEMS` ids)

| id | name (as shown) | cat | notes |
| --- | --- | --- | --- |
| `coffee` | BREAK-ROOM COFFEE | item | heal 25 |
| `energy_drink` | ENERGY DRINK | item | heal 50 |
| `first_aid` | FIRST AID KIT | item | heal 100 |
| `box_cutter` | BOX CUTTER | weapon | 8 dmg, fast; the only way to cut a Tethered free |
| `steel_bar` | STEEL SECURITY BAR | weapon | 20 dmg, slow, 30% knockdown |
| `extinguisher` | FIRE EXTINGUISHER | weapon | 12 dmg bash, slow; 6 sprays (`S.ammo.extinguisher`) |
| `returned_modem` | RETURNED MODEM | key | detail: label shows account number 4471-0932 |
| `staff_key` | STAFF ROOM KEY | key | tag "Staff Rm — L1" |
| `certificate` | INDUCTION CERTIFICATE | key | detail shows the date (riddle-level wording) |
| `first_day_badge` | FIRST-DAY BADGE | key | "AIDAN — HERE TO HELP!" |
| `unit9_key` | UNIT 9 KEY | key | from the lockbox |
| `alarm_pendant` | ALARM PENDANT | key | detail on the back: "PRESS & HOLD 3 SEC" |
| `jumper_tool` | JUMPER TOOL | key | hooked metal tool, worn wooden handle |
| `visitor_pass` | VISITOR PASS | key | "AIDAN — VISITING: ESCALATIONS" |
| `keycard` | LEVEL 4 KEYCARD | key | Chloe's |
| `gate_key` | GATE KEY | key | business park boom gate |
| `ticket` | QUEUE TICKET | key | "You are number 4,112." |
| `chloe_pin` | TOP PERFORMER PIN | key | + doc `chloe_pin` |
| `map_town`, `map_plaza`, `map_village`, `map_exchange`, `map_care`, `map_office`, `map_office_upper`, `map_hospital`, `map_mast` | map items | map | `map:'<mapId>'` |
| `rmap_plaza`, `rmap_village`, `rmap_exchange`, `rmap_care`, `rmap_office`, `rmap_mast` | RECEIPT MAP | map | Outage maps |
| `new_pendant` | ALARM PENDANT (NEW) | key | ending only |

### Map ids (`MAPS`)
Paper maps: `town`, `plaza`, `village`, `exchange`, `care`, `office`, `office_upper`, `hospital`, `mast`.
Receipt maps: `rmap_plaza`, `rmap_village`, `rmap_exchange`, `rmap_care`, `rmap_office`, `rmap_mast`, each with
`kind:'receipt'` and `of:'<paper map id>'`. `ITEMS.map_<id>.map` / `ITEMS.rmap_<id>.map` resolve to these.

## 4. Documents (`DOCUMENTS` ids) — groups: Story, Account Notes, Operator's Log, Whiteboards, Returns Notes, Personal

Story: `timetable`, `noticeboard`, `fridge_list` (track F+1), `plaque`, `wai_email`, `call_logs`, `case_file`, `luka_notes`.
Account Notes: `acct1` … `acct6` (each track F+1). Whiteboards: `huddle1` … `huddle4`. Operator's Log: `oplog1` … `oplog6`.
Returns Notes: `returns1` … `returns12`. Personal: `chase_notes`, `chloe_pin`.
Puzzle clues (Story group, one per riddle level; chapters place the one matching `S.difficulty.riddle`):
`pin_note_easy|pin_note|pin_note_hard` (Ch 1 sticky note), `cert_easy|cert|cert_hard` (Ch 1 certificate text),
`lockbox_note_easy|lockbox_note|lockbox_note_hard` (Luke's sticky note), `birthday_card|birthday_card_hard`,
`timetable_hard_footer` is part of `timetable` text on Hard (use `timetable_hard`), `fuse_note_easy|fuse_note|fuse_note_hard`
(+ `fuse_spec_hard` spec sheet in watts), `rotary_card`, `gate_card|gate_card_hard`.
The Case File, Call Logs and Wai's Email open automatically in their scenes.

## 5. Flags (`S.flags`)

Fate: `waiSaved`, `chaseSaved`, `chloeSaved`, `lukaSaved`, `lukeSaved`, `acceptedDeal`. Counter: `S.chaseHits`.
Cross-chapter: `standardName` ('LUKA' until Cutscene 6-2, then 'AIDAN'), `c1_address` (terminal done — unlocks Hilltop
Road), `c2_loopBroken` (back gate opens), `c3_bossDone` (yard gate open), `c4_done` (boom gate usable with gate_key),
`c6_done` (Ring Road east continues), `c7_room12` (summit gate chain down), `waiLost` (not waiSaved after Ch 3),
`chaseHurt` (chaseHits ≥ 4 at the end of Ch 4). Everything else is chapter-local: prefix `cN_` (e.g. `c1_pinKnown`).

## 6. Calls and shared dialogue

`luka1` … `luka8` exactly as spec §8's table (triggers are placed by the chapters: 1 leaving the staff room the first
time; 2 the village gate; 3 the exchange forecourt; 4 entering the business park; 5 Level 4 while the Standard roams;
6 after the Pedestal (climbing back to Level 4); 7 Level 5 before the lift; 8 leaving the hospital for the Mast).
`DIALOGUE.wai_payphone` (5 lines, §9), `DIALOGUE.desk_phone` (7 Ch 4 snippets), `DIALOGUE.tethered` ("I only came in to..."),
`DIALOGUE.reach` (3 shouts), `DIALOGUE.smile` (3 lines), `DIALOGUE.closer_pitch` (6 lines), `DIALOGUE.closer_barks` (4),
`DIALOGUE.restructure` (4 lines), `DIALOGUE.luke_chase` (3 shouts), `DIALOGUE.wai_talk` (3 cycling lines),
`DIALOGUE.luka_walls` (3 lines, Ch 6).

## 7. Cutscene ids

Use the spec's numbers: `P-1`, `1-1` … `1-4`, `2-1` … `2-3`, `3-1`, `3-2`, `3-3` / `3-3alt`, `4-1` … `4-3`, `5-1` … `5-4` /
`5-4alt`, `6-1`, `6-2`, `7-1` … `7-4`, `8-1`, `8-2`, `8-2A`, `8-3`, `8-4`. In-engine beats: `P-4`, `1-8`, `3-3b` (the
Borrowed on the stairs), `4-4`. Endings: `E-C1` (the connected call, in the transmitter room — Ch 8 file), `E-C2`
(Morning), `E-C3` (post-credits "Ask First"), `E-OC0` (the call rings out — Ch 8 file), `E-OC` (Out of Coverage shots),
`E-FT0` (A ≥ F: the automated voice + the Closer's hand — Ch 8 file), `E-FT` (the city store), `E-YES`.
Ch 8 decides the ending with `Game.endingFor(S)`, plays its in-room part, then `await G.ending(name)`; `Game.ending`
plays the rest (`19_endings.js` owns that wiring). The Yes ending is checked when Aidan opens the transmitter-room
door (spec §12: the door opens onto confetti) — if `Game.endingFor(S) === 'yes'` there, Ch 8 calls `G.ending('yes')`
instead of the Closer.

## 8. Ollie stickers (12, ids `sticker01` … `sticker12`)

Prologue 1 (under the bus-shelter bench) · Ch 1: 2 (behind the store counter; under the security desk) · Ch 2: 1 ·
Ch 3: 2 (under Wai's board; canteen) · Ch 4: 1 · Ch 5: 1 · Ch 6: 1 · Ch 7: 1 · Ch 8: 2 (one on a mast platform).
Out-of-the-way spots only. The Yes ending requires all 12 on a second playthrough.

## 9. Standards every chapter must meet

* Dialogue and document text exactly as the spec. `[beat]`/`[long beat]` respected.
* Every room: ≥ 5 examine lines (aim for 8–10, in Aidan's voice — short, first person, plain), richly dressed
  ("somewhere people used to be": human leftovers), dark interiors, the torch essential.
* Cameras: 4–8 per room, fixed and composed per spec §3 (low angles for the Standard, high for vulnerable moments,
  at least one shot per chapter through glass/shelves/CCTV corner, reveal threats in the background, hide the next
  corridor until the cut, empty shots before Aidan walks in). `SH.camCheck('<room>')` must report 0 problems for every
  room.
* Every locked door gives a message; every blocked route is physical or spoken.
* Enemy counts, pickups and triggers as the chapter's GAMEPLAY blocks say (Fog world defaults; Outage changes).
* Riddle-level variants per spec §2A. Difficulty: add a few `extraOnEasy` heal pickups per chapter.
* Chapter target time (spec §14). If short, add rooms/examine lines/documents — not enemies.
* The chapter must be completable start to finish without the debug overlay, and `defineChapter.debugState` must give
  a chapter-select start the items/flags a real player would have.
