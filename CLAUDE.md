# Signal Hill — working rules

Signal Hill is a story-driven psychological horror game delivered as **one self-contained HTML file**
(`signal-hill.html`), built from sources in `src/`.

* Design spec (the source of truth for story, dialogue, rooms, monsters, UI): `docs/BUILD_PROMPT.md`.
  Section numbers like §2A, §6, §8 refer to it. Dialogue and document text must match it exactly.
* Code contract (module names, APIs, data formats): `docs/ARCHITECTURE.md`. Read it before writing code.
* Engine notes written by the module authors (what exists beyond the contract, caveats): `docs/ENGINE_NOTES.md`
  (once it exists).

## Commands

```
node tools/build.mjs --out .build/<yourname>.html     # concatenate src → one HTML file (use your own --out when others work in parallel)
node tools/lint.mjs .build/<yourname>.html            # syntax + eslint (no-undef, no-redeclare …) mapped to source lines
node tools/run.mjs --file .build/<yourname>.html …    # headless Chromium (SwiftShader); see the header of tools/run.mjs
```
`node tools/build.mjs` with no `--out` writes the deliverable `./signal-hill.html`.
The harness serves three.js from `node_modules` (the CDN is not reachable from this sandbox); the built file still
imports it from cdn.jsdelivr.net. `window.SH.mod.<Module>` exposes every engine module for `--eval` testing, even in a
partial build. SwiftShader is slow: judge performance by draw calls/triangles/lights, not by the headless fps.

## Rules

* All `src/**/*.js` files share ONE module scope. Engine modules expose exactly one top-level const (their module
  object, built with an IIFE). Data files register content only through the `define*` functions and wrap any helpers
  in a block `{ … }` or give them a file-unique prefix. Never redeclare another file's top-level name.
* No network requests other than the three.js import map; no image/audio/font/model files; Canvas2D textures,
  Web Audio synthesis, primitives-only geometry, system fonts.
* Content rules are absolute: no gore; no self-harm, suicide or hanging imagery (nothing around necks except lanyards
  resting on the chest); nothing from existing horror games; an original Optus-style wordmark only.
* When working inside a multi-agent workflow, edit only the files you were assigned unless the task says otherwise,
  and do not commit — the orchestrator commits.
* Before finishing: build to your own `--out`, lint it to 0 errors, and run it headless if your change is runtime code.
