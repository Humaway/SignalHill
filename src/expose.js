// ==== expose.js — module handles for the test harness and console debugging (window.SH.mod) ====
// typeof guards let a partial build (engine still being written) load without ReferenceErrors.
window.SH.mod = {
  THREE, U, Bus, Time, META, DIFF,
  ROOMS, CAMERAS, CUTSCENES, DIALOGUE, DOCUMENTS, CALLS, ITEMS, SPAWNS, CHAPTERS, MAPS, BOSSES, SCRIPTS, PROPS,
  Input: typeof Input !== 'undefined' ? Input : undefined,
  Snd: typeof Snd !== 'undefined' ? Snd : undefined,
  Tex: typeof Tex !== 'undefined' ? Tex : undefined,
  Render: typeof Render !== 'undefined' ? Render : undefined,
  Kit: typeof Kit !== 'undefined' ? Kit : undefined,
  Rig: typeof Rig !== 'undefined' ? Rig : undefined,
  Cam: typeof Cam !== 'undefined' ? Cam : undefined,
  Player: typeof Player !== 'undefined' ? Player : undefined,
  World: typeof World !== 'undefined' ? World : undefined,
  UI: typeof UI !== 'undefined' ? UI : undefined,
  Menus: typeof Menus !== 'undefined' ? Menus : undefined,
  Script: typeof Script !== 'undefined' ? Script : undefined,
  Enemies: typeof Enemies !== 'undefined' ? Enemies : undefined,
  Phone: typeof Phone !== 'undefined' ? Phone : undefined,
  Save: typeof Save !== 'undefined' ? Save : undefined,
  Debug: typeof Debug !== 'undefined' ? Debug : undefined,
  Game: typeof Game !== 'undefined' ? Game : undefined,
};
Object.defineProperty(window.SH.mod, 'S', { get: () => S, enumerable: true });
