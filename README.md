# Signal Hill

Aidan is 22 and has spent six months as a sales rep at an Optus store in the city. One morning a returned modem
arrives from a customer in Signal Hill, a fog-bound hill town with no mobile coverage, with a note taped to the box:
*"You said it would work here."* He believes he made an honest mistake, so he drives out to put it right. Signal Hill
is a story-driven psychological horror game in the early-2000s survival-horror style. You play it through fixed
cinematic camera angles, with a single torch beam, heavy fog and a phone that picks up more than signal. A first
playthrough takes roughly 60 to 120 minutes.

The whole game is one self-contained HTML file, `signal-hill.html`. It uses no image, audio, font or model files:
Three.js primitives build the geometry, Canvas 2D draws the textures, and Web Audio synthesises every sound.

---

## Playing

### Starting the game

1. Open `signal-hill.html` in a **desktop** browser, such as a current Chrome, Edge, Firefox or Safari. The browser
   needs WebGL 2 and import maps. You can double-click the file, or serve the folder with any static server
   (`python3 -m http.server`, then open `http://localhost:8000/signal-hill.html`).
2. The browser needs **internet access**. The page loads Three.js (r170) from `cdn.jsdelivr.net` through an import map.
   Nothing else goes over the network. If Three.js hasn't arrived after 15 seconds, the loading screen says so.
3. Browsers block sound until you press a key. If sound is still blocked when loading finishes, the game shows
   **PRESS ANY KEY TO BEGIN** on black. Press a key and the title starts with its sound.
4. Headphones and a dark room help. Phones and tablets aren't supported.

### Controls

Movement is camera-relative. When the camera cuts, Aidan keeps walking the way you were pushing until you let go or
change direction. Options → Control Type switches to classic tank controls.

| Action | Keyboard / mouse | Gamepad (standard layout) |
| --- | --- | --- |
| Move | W A S D or the arrow keys | Left stick |
| Run (6 s of stamina, refills in 4 s) | Shift | RT (or L3) |
| Interact / examine / confirm | E (Enter also confirms) | A / Cross |
| Torch on / off | F | Y / Triangle |
| Ready a weapon (soft-locks the nearest enemy in front) | Right mouse or Space (held) | LT (held) |
| Attack | Left click | X / Square |
| Quick 180° turn | Q | B / Circle |
| Inventory (items, weapons, key items) | Tab | RB, R3 or D-pad down |
| Map | M | Select / Back / View |
| Phone menu (calls, voicemail, notes, map) | Tap C | Tap D-pad up or LB |
| Check your phone: raise it and read the signal bars (you walk slowly, the torch points at your feet) | Hold C | Hold D-pad up or LB |
| Answer / decline an incoming call | E / Q | A / B |
| Pause | Esc | Start |
| Back / cancel in menus | Esc, Backspace or right mouse | B / Circle |
| Skip a cutscene | Hold Esc for 1 s | Hold Start for 1 s |
| Debug overlay | ` (backtick) | none |

In menus, W/S/A/D, the arrow keys, the left stick or the D-pad move the selection. On the items screen's examine view,
drag with the mouse (a button held) or push the right stick to turn the model. You can invert that turn in Options.

The game has no floating "press E" prompts. When something within reach can be used, Aidan turns his head towards it.

### Difficulty

**NEW GAME** asks for two levels, and each option has a one-line description under it.

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| **Action level** | Enemies deal 50 % damage; healing pickups are 1.5 × as common | Enemies and supplies as the town intends | Enemies deal 150 % damage, one monster's rage builds 1.5 × faster, 30 % fewer pickups |
| **Riddle level** | The clues all but give you the answer | The clues are written as they were left | The clues are oblique; some take working out |

A first-time player then gets the brightness calibration screen: *"Adjust until the bar is barely visible."* You can
open it again later from Options → Brightness.

### Saving

* **Payphones** are the save points: look for the ones with the handset hanging off the hook. Pick up the receiver,
  then answer *Save your progress?* The game has three slots, and each slot shows the chapter, area, play time and
  number of saves. Overwriting a slot asks you to confirm first.
* An **autosave** is written at the start of every chapter. LOAD GAME lists it as AUTOSAVE.
* When Aidan dies, **CONTINUE** reloads the latest save. LOAD GAME and TITLE are also offered.
* Saves, options, endings seen and results are kept in the browser's `localStorage` for the page's address. Clearing
  the site's data deletes them. In a private window they last only for the session.
* **EXTRA** appears on the title menu after your first ending. It lists the endings you've seen and your past results,
  and offers New Game+.

### Options

Brightness, Noise Effect, Grain Strength, Subtitle Size (small / medium / large), Control Type (camera-relative or
tank), Camera Shake, Master / Effects / Music volume, Invert Examine Rotation, Vibration (gamepad rumble) and Signal.
Choices are saved and applied the next time the game starts.

**Signal** decides how far you can trust Aidan's phone. **Unreliable** (the default): the phone only picks up what has
already found him, the bars are slow to catch up and never sit still, and now and then they show something that isn't
there. The bars stay off the screen: listen for the static, or hold C to check the phone. **Classic**: the phone
reacts to every monster within 20 m, at once, like a radar, and the bars appear on screen by themselves. Either way,
the moments the story scripts (a call coming in, a place with no service) show on screen as they always have, and a
change takes effect at once, even in the middle of a chapter.

### The debug overlay

Press **`** (backtick) at any time to open a small panel. It is left in the shipping build on purpose, and the game
keeps running while it is open. It shows:

* the mode, the room and camera id, Aidan's position and health, the hidden Face / Avoid counters, the fate flags, the
  running script, fps, draw calls, triangles and lights;
* **CHAPTER**, which jumps to the start of any chapter (0–8) with that chapter's usual state, and **TEST ROOM**;
* **TOOLS**: noclip, camera volumes (with the room's framing problems listed), line of sight, an instant switch
  between the two worlds, and heal;
* **ENDING** presets, which set the counters and flags to force a particular ending, and PLAY ENDING.

Using the overlay spoils the story. Leave it closed on a first playthrough.

---

## Developing

You need Node.js 18 or later and `npm install`. The installed packages are three (served to the test harness offline),
eslint, acorn and Playwright. Playwright needs a Chromium (`npx playwright install chromium`); `tools/run.mjs`
uses `/opt/pw-browsers/chromium-1194` when it is there.

```sh
node tools/build.mjs                        # concatenate src/ → ./signal-hill.html (the deliverable)
node tools/build.mjs --out .build/me.html   # … or to a scratch file (.build/ is git-ignored)
node tools/lint.mjs .build/me.html          # syntax check + eslint (no-undef, no-redeclare …), mapped to source lines; 0 errors required
node tools/run.mjs --file .build/me.html --newgame --room c1_relay --shot .build/relay.png   # headless Chromium (SwiftShader)
node tools/run.mjs --file .build/me.html --camcheck --all-rooms                            # every camera volume framed: prints []
```

`tools/run.mjs` loads the built file in headless Chromium, serves Three.js from `node_modules` and blocks every other
request. `window.SH` exposes a test API (`SH.newGame`, `SH.chapter(n)`, `SH.goto(room)`, `SH.advance(sec)`,
`SH.skip()`, `SH.press(action)`, `SH.mod.<Module>` …). The header of `tools/run.mjs` lists its options, and
`docs/ENGINE_NOTES.md` §8 explains the API. SwiftShader is slow, so judge performance by draw calls, triangles and
lights (`tools/tests/perf.mjs`), never by the headless frame rate.

The regression suite plays the whole game headlessly: every chapter, every ending, every cutscene played and skipped,
performance budgets, content checks and the UI. [`tools/tests/README.md`](tools/tests/README.md) explains how to run it
and what each script covers.

### Repository layout

```
signal-hill.html        the built game: open this to play (generated; rebuild with node tools/build.mjs)
src/
  shell.html            the page: CSS, the DOM for the UI layers, the three.js import map
  engine/               the engine, one module per file, concatenated in name order
    00_core.js          utilities, the game state S, the content registries (define* functions)
    01_input.js         keyboard, mouse, gamepad, action mapping, rumble
    02_audio.js         Snd: all sound, synthesised with Web Audio
    03_textures.js      Canvas 2D textures and materials, the two worlds' dissolve
    04_render.js        renderer, low-resolution target, post chain, fog, the light pool, the torch
    05_kit.js           the room builder K and structural kit;  05b_props.js — the prop library
    06_rig.js           the one human-figure builder, character presets, animation, faces
    07_camera.js        fixed cameras: volumes, static / pan / rail / scripted, the volume check
    08_player.js        Aidan: movement, stamina, health, torch, interaction, combat, ladders
    09_world.js         room loading and transitions, collision, triggers, doors, the Outage
    10_ui.js            in-game overlays;  10b_menus.js — every screen outside play
    11_script.js        the async script runner, cutscenes and the G API
    12_enemies.js       the common monsters and the enemy framework
    13_phone.js         signal bars, calls, voicemails, notes, the phone screen
    14_save.js          localStorage slots, the autosave, META (endings, results, options, stickers)
    15_debug.js         the backtick overlay and window.SH
    16_game.js          boot, main loop, modes, chapters, death, endings, results, New Game+
  data/                 all content, registered through define* only: items, documents, calls, one file per chapter
                        (10_prologue.js … 18_ch8.js), the endings, the title, the maps, the developer test rooms
  expose.js             window.SH.mod: every module for tests and the console
  main.js               boot
tools/
  build.mjs             src → one HTML file (+ a line map for lint)
  lint.mjs              syntax + eslint on the built file, errors reported at their source lines
  run.mjs               headless Chromium harness (--newgame, --chapter, --room, --advance, --eval, --script, --camcheck …)
  tests/                the regression suite (see tools/tests/README.md)
docs/
  BUILD_PROMPT.md       the design spec: story, script, dialogue, rooms, monsters, UI (the source of truth; §-numbers)
  ARCHITECTURE.md       the code contract: module names, APIs, data formats
  CONTENT_PLAN.md       ids and wiring for rooms, items, documents, calls, endings, stickers
  ENGINE_NOTES.md       what the engine does beyond the contract, its caveats, and how to test (§8)
CLAUDE.md               working rules for contributors
```

All `src/**/*.js` files share **one** module scope. Each engine module exposes exactly one top-level `const`, built with
an IIFE. Data files register content only through the `define*` functions (`defineRoom`, `defineCutscene`,
`defineDocument` …) and keep their helpers inside a block or behind a file-unique prefix. A new chapter needs only a new
data file; the engine doesn't change.

### Content rules

These rules are absolute. They apply to every room, figure, prop, document and line of dialogue.

* **No gore.** The horror comes from dread, sound, framing and body horror built from retail materials.
* **No self-harm, suicide or hanging imagery.** Nothing is ever around a neck except a lanyard resting on the chest,
  and nothing hangs above an overturned chair. Characters who are "lost" walk into the fog. Nobody dies on screen.
* **Nothing from existing horror games**: no characters, creatures, music or assets. Every monster is original.
* **Optus branding** is the name on signage and in dialogue, a teal-and-yellow palette and a simple **original**
  wordmark drawn in code, never the real logo.
* Every human character is sympathetic, and characters use first names only. The customer at the centre of the story
  is never named on screen.
* **No external assets or requests**: no image, audio, font or model files, and no network requests other than the
  Three.js import map. Textures come from Canvas 2D, sound from Web Audio, geometry from primitives and text from
  system fonts.

`tools/tests/content.mjs` and `tools/tests/lineup.mjs` check the rules a machine can check: the network, the necks of
every figure, and what hangs near an overturned chair.
