# The Signal Hill regression suite

Every script in this folder is a module that `tools/run.mjs` loads with `--script`. Each one drives the built game in
headless Chromium (SwiftShader WebGL) through `window.SH` and real keyboard input, prints its evidence, and ends with
one `PASS <name>` or `FAIL <name>` line. `run.mjs` exits 1 when a script reported a FAIL or the page logged an error.
Set `--allow-errors` only for exploratory runs. The suite passes only when every run ends in PASS with exit code 0.

`docs/ENGINE_NOTES.md` §8 documents the test API (`SH.advance`, `SH.press`, `SH.goto` …) and the harness's quirks. The
helpers shared by the scripts are in `lib.mjs`, and its header explains them.

## Running it

Build to your own file, lint it, then point every run at that file:

```sh
node tools/build.mjs --out .build/t.html
node tools/lint.mjs .build/t.html                                   # must print 0 error(s)
node tools/run.mjs --file .build/t.html --camcheck --all-rooms      # must print []
node tools/run.mjs --file .build/t.html --size 640x360 --script tools/tests/ch3.mjs
```

* Use `--size 640x360` for the long runs: the chapters, the chain, the endings, skipall, perf and stickers. A few
  checks need their own size, given below.
* `--quiet` prints only results and errors. The chapter and chain tests print their notes as they go, which is useful
  when a run fails.
* Runs don't share state, so several can go side by side, each in its own browser. On a 4-core machine, three at a time
  works well. `run.mjs` restarts a browser that hangs while it boots, at most twice.
* Everything a run writes (screenshots, snapshots, chain autosaves, logs) goes under `.build/`, which git ignores.
* SwiftShader draws at a few frames per second, so the tests move game time with `SH.advance` and don't wait for
  frames. `chain.mjs` and the chapter tests switch drawing off unless `SH_RENDER=1` is set. Judge performance only by
  `perf.mjs`'s counts.

### The release pass

Build and lint `./signal-hill.html` last, after everything below passes on the same sources. The times were measured
on a 4-core container running three of these side by side. A run on its own is quicker; `perf.mjs`, for example,
takes ~7 min alone.

| Run (`node tools/run.mjs --file .build/t.html` + …) | Must end with | Time |
| --- | --- | --- |
| `node tools/lint.mjs .build/t.html` (not a run) | `lint: 0 error(s)` | 5 s |
| `--camcheck --all-rooms` | `camcheck []` | 2.5 min |
| `--size 640x360 --script tools/tests/ch0.mjs` | `PASS ch0 (all runs)` | 2 min |
| `--size 640x360 --script tools/tests/ch1.mjs` | `PASS ch1 — connected/normal …` | 1.5 min |
| `--size 640x360 --script tools/tests/ch2.mjs` | `PASS ch2 (all runs)` | 3.5 min |
| `--size 640x360 --script tools/tests/ch3.mjs` | `PASS ch3 (all runs)` | 3 min |
| `--size 640x360 --script tools/tests/ch4.mjs` | a `PASS ch4 …` line per configuration | 4 min |
| `--size 640x360 --script tools/tests/ch5.mjs` | a `PASS ch5 …` line per configuration | 10 min |
| `--size 640x360 --script tools/tests/ch6.mjs` | a `PASS ch6 …` line per configuration | 2.5 min |
| `--size 640x360 --script tools/tests/ch7.mjs` | a `PASS ch7 …` line per configuration | 3 min |
| `--size 640x360 --script tools/tests/ch8.mjs` | a `PASS ch8 …` line per configuration | 6.5 min |
| `--size 640x360 --script tools/tests/endings.mjs` | `PASS endings suite (connected, coverage, tomorrow, yes)` | 3.5 min |
| `--size 640x360 --quiet --script tools/tests/skipall.mjs` | `PASS skipall — 51 scenes, played = skipped` | 4 min (+12 min the first time) |
| `--size 640x360 --quiet --script tools/tests/perf.mjs` | `PASS perf` | 22 min (7 alone) |
| `--size 640x360 --script tools/tests/stickers.mjs` | `PASS stickers — 12/12 collected …` | 4.5 min |
| `SH_PATH=connected … --size 640x360 --script tools/tests/chain.mjs` | `PASS chain connected/normal — ending connected` | 10 min |
| `SH_PATH=tomorrow …` (the same) | `PASS chain tomorrow/normal — ending tomorrow` | 7 min |
| `SH_PATH=coverage …` | `PASS chain coverage/normal — ending coverage` | 7.5 min |
| `SH_PATH=deal …` | `PASS chain deal/normal — ending tomorrow` | 9 min |
| the polish checks (below) | `PASS <name>` | 1–16 min each |

In every one of these runs, `run.mjs` must exit with code 0. It exits 1 on a FAIL line or a console error.
`console.warn` lines are the kit's authoring hints (an examine close to a door, many point lights close together).
They don't fail a run.

## What each script covers

### The whole game

* **`chain.mjs`**: the whole game in one session, which is the closest thing to a real player. It starts a NEW GAME
  from the title (setup, calibration, the Prologue's first scene), plays Chapters 0–8 back to back with each chapter
  test's `play()` on the state the previous chapter left, and checks every hand-off. At each hand-off it checks the
  chapter start room and `begin()`, the autosave, the key items, the Face/Avoid counters (which never go down), Luka's
  calls, the freed Tethered and fate flags as the path decides them, no Outage leaking into a Fog-world start, the
  player in control and zero errors. It then checks that the ending came through the path's branch of spec §4, with its
  scenes in order, followed by credits, fate cards, results and the title with EXTRA. It also loads every payphone save
  from the title's LOAD GAME and continues from every chapter-start autosave. Last it prints a per-chapter timeline and
  an estimate of a first playthrough's length.
  * `SH_PATH`: `connected` | `coverage` | `tomorrow` | `deal`, the story decisions. The four paths reach all three
    ordinary endings, and `deal` goes through the Closer's deal.
  * `SH_RIDDLE` / `SH_ACTION`: `easy` | `normal` | `hard`, picked on the setup screen as a player would.
  * `SH_DEATH=1`: Aidan dies once in every boss fight, and CONTINUE must restore the save exactly.
  * `SH_RESUME=1` plays every chapter from its autosave. `SH_FROM_AUTO=<file>` replays from an autosave a run wrote to
    `.build/chainlogs/`. `SH_SHOTS=<dir>` takes screenshots at the hand-offs.
  * The wider release matrix adds connected with `SH_RIDDLE=hard`, with `SH_RIDDLE=easy SH_ACTION=easy` and with
    `SH_DEATH=1`, plus tomorrow with `SH_ACTION=hard`.
* **`ch0.mjs` … `ch8.mjs`**: one chapter each, played start to finish with the real mechanics. Aidan walks with real
  keys and uses doors, props and pickups with E. Keypads are typed on the keyboard, calls are answered with E or
  declined with Q, and payphone saves go through the §2A flow. Bosses are fought with real swings. Each test checks the
  chapter's spec beats, its dialogue and documents against the spec text, its Face/Avoid changes, and the hand-off to
  the next chapter. Each exports `play(h, {path, riddle, saveLoad})` for the chain.
  * On its own, a chapter test starts from `SH.chapter(n)` (chapter select's state). With no `CHn_PATH`, it runs a
    matrix in one browser: connected/normal with a save and reload, tomorrow/hard and coverage/easy. Chapter 8 adds
    deal/normal and follows two of the runs through to the title. Chapter 1 runs connected/normal only unless
    `CH1_PATH` is set.
  * Env: `CHn_PATH`, `CHn_RIDDLE`, `CHn_SAVELOAD=1`, `CHn_SHOTS=<dir>`. Chapter 7 also takes `CH7_STAND=step|talk|run`
    and `CH7_HITS=<n>` for the stand-off's branches, and Chapter 8 takes `CH8_TITLE=1`.

  | Test | Chapter | Covers |
  | --- | --- | --- |
  | ch0 | Prologue "No Service" | P-1 … P-4, Hill Road, the bus shelter, the first Tethered, the first payphone |
  | ch1 | "The Plaza" | Relay Street, the Plaza, the terminal PIN (riddle row 1), the Returns Cage, Luka's first call |
  | ch2 | "Hilltop Village" | the lockbox (riddle row 2), Unit 9's loops, the chase, the pendant, the Reach |
  | ch3 | "The Exchange" | the fuse board (riddle row 3), the Borrowed on the stairs, the Restructure and Wai's jacks |
  | ch4 | "Customer Care" | the pulse dial (riddle row 4), the call-log choice, the Outage maze, the Escalation and Chase |
  | ch5 | "Level 4" | Stairwell A, the Standard, the Borrowed, the Pedestal, Luka's calls 5 and 6 |
  | ch6 | "The Middle" | the case file, the terminal, the fire stairs, the lift shaft, Luka's call 7 |
  | ch7 | "District Hospital" | the Smile store, the PA page, Luke's voicemails, the stand-off, Luka's call 8 |
  | ch8 | "The Mast" | Summit Road, the gate (riddle row 5), the climb, the Closer, the in-room endings |

* **`endings.mjs`**: the title (§2A steps 1–5) and all four endings. Each ending is played through with
  `SH.advance` and then again with every scene skipped. The check covers the ending's lines against the spec, credits
  and their music, fate cards (exact §12 text), results with the star rank, EXTRA, and New Game+ starting with the
  bar and the stickers. Env: `END_ONLY=connected,yes`, `END_SKIP=0`, `END_TITLE=0`, `END_SHOTS=<dir>`.
* **`stickers.mjs`**: the twelve Ollie stickers. It checks that each is placed once in `src/data` and can be picked up
  in its room as a player would, and that the first playthrough still ends as F/A say. EXTRA → NEW GAME+ must start
  playthrough 2 with the stickers, and Chapter 8's hut door must open onto the Yes ending, through credits and results
  to the title.
* **`skipall.mjs`**: spec §14, "every cutscene is skippable and still applies its state changes". Every id in
  `CUTSCENES` runs twice from the same real-playthrough snapshot, once PLAYED and once SKIPPED, and the two must end
  in the same S, positions, NPCs, monsters, doors, autosaves, camera, HUD, music, control and so on.
  * The snapshots live in `.build/skipall/<path>/`. On a fresh checkout the script takes them first by running the four
    chains side by side, which adds ~12 min. `SH_CAPTURE=1` retakes them after a change to a scene's lead-up.
  * `SH_ONLY=3-2,6-terminal` runs a subset, `SH_CHOICE=1` takes the other option of every choice, `SH_ALLPATHS=1` uses
    every path's snapshot of each scene, `SH_RELOAD=cs|run` gives each scene a fresh page, and `SH_VERBOSE=1` prints
    timelines.

### Budgets and content

* **`perf.mjs`**: spec §2 and §14 performance. Every room in both of its worlds is loaded as a save is, with its
  chapter's state, every spawn and the torch on. The Chapter 8 summit road also gets every Tethered the game can free.
  Each camera is rendered from several points of its volume and must stay within ≤ 400 draw calls, ≤ 250k triangles
  and ≤ 11 real lights. The test also checks that no shader program is compiled twice and that memory returns to its
  baseline over 30 door transitions. `SH_ONLY=c8_summit`, `SH_WORLDS=fog|outage`, `SH_MEM=0`, `SH_EXPLAIN=1` (what a
  view draws, by owner), `SH_SHOTS=<dir>`.
* **`content.mjs`**: the machine-checkable content rules. The network check scans every URL and network API in the
  built file, then lists every request from a fresh load through a room load. Only the import map's three.js modules
  may appear. It also checks that every walkable room has at least five examine lines in each world, and that nothing
  hangs within 1.5 m of an overturned chair.
* **`lineup.mjs`**: every person and monster photographed head-and-shoulders (front, side and back) into
  `.build/lineup/`. Every mesh crossing a neck is listed, and only lanyards pass.

### Presentation (the polish checks)

| Script | Size | Time | Covers |
| --- | --- | --- | --- |
| `title.mjs` | 1280x720 | ~4 min | §2A title steps 1–5 at normal speed on the game's own clock: black and hiss, the vista, SIGNAL HILL, PRESS ANY KEY, the ring stopping mid-burst, the menu, the 60 s attract sequence |
| `ui.mjs` | 1280x720 | ~16 min | ~55 overlays and screens at 1280×720 and 1920×1080, with every DOM text audited for size (12 px / 15 px floor), clipping, off-screen and overlap |
| `options.mjs` | 960x540 | ~2 min | every Options entry changed with real keys and measured live in the game, then saved to localStorage and restored after a reload; the calibration screen |
| `gamepad.mjs` | 960x540 | ~1 min | a synthesised standard pad plays the title, the menus and a room with no keyboard; prompts name the pad's buttons; rumble |
| `audiogate.mjs` | 960x540 | ~1 min | with the browser's autoplay lock, PRESS ANY KEY TO BEGIN shows and the title starts with its sound |
| `content.mjs` | 640x360 | ~1 min | see above |
| `lineup.mjs` | 1280x720 | ~3 min | see above |

Run `audiogate.mjs` with the browser's real autoplay policy and a short `--ready`, because `SH.ready` comes only after
the key:

```sh
SH_CHROME_ARGS="--autoplay-policy=document-user-activation-required" \
  node tools/run.mjs --file .build/t.html --size 960x540 --ready 3 --quiet --script tools/tests/audiogate.mjs
```

## Writing a test

* Export `default async function (page, h)`. `h.eval(code)` runs `code` as the body of an async function in the page,
  and `page` is the Playwright page for real keys (`page.keyboard.down('d')`).
* Use the helpers in `lib.mjs`: `advanceUntil`, `mustReach`, `skipScenes`, `choose`, `walkTo`, `interactAt`, `press`,
  `takeHealPickup`, `payphoneSave`, `titleNewGame`, `report` and others. Call `report()` for the final PASS/FAIL line so `run.mjs` sets the exit code.
* The game keeps `Math.random`. A check on something random must sample until it has seen enough, and a walk must
  survive a monster in the way. To replay a flaky run, seed `Math.random` in the page before the chapter starts.
* Never weaken a check to make it pass. When a test's expectation is wrong about the spec, fix the test and say so in
  the commit.
