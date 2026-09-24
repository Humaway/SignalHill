// ==== data/99_testroom.js — test_room + test_room2: a pair of rooms exercising every engine feature (debug only) ====
// Reached from the debug overlay (TEST ROOM), SH.goto('test_room') or SH.testRoom(). Not part of the story.
//
// test_room (a depot: hall, locked store room, office, fenced yard):
//   floors with a ramp, a stage and stairs; walls with door and window openings; ~45 props from both prop lists; fluoro
//   tubes (two real pool lights, the rest glow only), a street light, LEDs; 8+ examine spots; one of each heal item; the
//   three weapons; a memo; a wall payphone; the break table (+ wall clock); an in-room door (office), a locked door with
//   a key (the store room; the key is in the office), a glass door, a roller door; a transition door (west, to
//   test_room2) and a street exit (the lane, to test_room2); a trigger that runs cutscene TR-1 (letterbox, a camera move,
//   lines with [beat], an actor walk, a choice); an NPC (a rep) with talk lines; a ladder to a platform; a blocker (the
//   fence gap) and a drop (the yard's east end); a Tethered (office), a Reach (yard), a Borrowed disguised as Wai
//   (office), an Unread cluster (yard wall) and the Standard's patrol between both rooms (fuse board switch); world-tagged
//   objects (Fog posters and papers; Outage contracts, receipts, tethers, red light, a contract barricade on the ramp);
//   the modem on the hall desk runs G.outage(true) / G.outage(false).
// test_room2 (a street): road with kerbs and footpaths, a fog wall, a payphone booth, street lights, pole, letterbox,
//   bench, the transition door back into the hall and the exit back to the yard.
// Every walkable point of both rooms is inside a camera volume (static, pan and rail): SH.camCheck('test_room') → [].
{
  // ---- minimal items / memo — only where data/00_items.js / 01_documents.js haven't defined the real ones ----------
  const TR_item = (d) => { if (!ITEMS[d.id]) defineItem(d); };
  TR_item({ id: 'coffee', name: 'BREAK-ROOM COFFEE', cat: 'item', stack: true, heal: 25, desc: 'Lukewarm. Somebody wrote a name on the lid and crossed it out.', model: () => Kit.prop('coffee_cup', {}) });
  TR_item({ id: 'energy_drink', name: 'ENERGY DRINK', cat: 'item', stack: true, heal: 50, desc: 'Sugar and something that tastes like a battery.', model: () => Kit.prop('energy_can', {}) });
  TR_item({ id: 'first_aid', name: 'FIRST AID KIT', cat: 'item', stack: true, heal: 100, desc: 'The store kit. Everything still in its wrapper.', model: () => Kit.prop('first_aid_box', {}) });
  TR_item({ id: 'box_cutter', name: 'BOX CUTTER', cat: 'weapon', desc: 'For opening stock. Short, quick, sharp.', weapon: { dmg: 8, speed: 'fast', range: 1.1, arc: 70, knock: 0 }, model: () => Kit.prop('box_cutter', {}) });
  TR_item({ id: 'steel_bar', name: 'STEEL SECURITY BAR', cat: 'weapon', desc: 'The bar that goes across the back door. Heavy.', weapon: { dmg: 20, speed: 'slow', range: 1.5, arc: 90, knock: 0.3 }, model: () => Kit.prop('bar_steel', {}) });
  TR_item({ id: 'extinguisher', name: 'FIRE EXTINGUISHER', cat: 'weapon', ammo: 6, desc: 'Dry powder. Inspected, according to the tag, a long time ago.', weapon: { dmg: 12, speed: 'slow', range: 1.3, arc: 80, knock: 0, spray: true }, model: () => Kit.prop('extinguisher', { variant: 'floor' }) });
  TR_item({ id: 'test_key', name: 'STORE ROOM KEY', cat: 'key', desc: 'A brass key on a paper tag. "STORE".', model: () => Kit.prop('keys_ring', {}) });
  if (!DOCUMENTS.test_memo) {
    defineDoc({
      id: 'test_memo', title: 'Depot Memo', group: 'Story', paper: 'lined', count: false,   // not in "memos found x of y"
      text: 'DEPOT — SHIFT NOTES\n\nRoller door sticks. Lift from the middle.\nStore room key is in the office, top drawer.\nThe modem on the front desk resets the line. Don\'t touch it unless the lights go.\n~~Payphone out of order~~\nPayphone works again.',
      hand: 'Whoever keeps leaving the coffee on the break table — thank you.', track: { F: 1 },
    });
  }

  // ---- the Standard's patrol graph across both rooms (started / stopped from the hall fuse board) ------------------
  const TR_GRAPH = {
    nodes: {
      't2:n': { room: 'test_room2', pos: [5, 3] }, 't2:s': { room: 'test_room2', pos: [5, 17] }, 't2:door': { room: 'test_room2', pos: [8.9, 10], door: true },
      't1:door': { room: 'test_room', pos: [0.9, 5], door: true }, 't1:a': { room: 'test_room', pos: [3.2, 7.6], pause: 3 }, 't1:b': { room: 'test_room', pos: [2.6, 4.1] },
    },
    edges: [['t2:n', 't2:s'], ['t2:s', 't2:door'], ['t2:n', 't2:door'], ['t2:door', 't1:door'], ['t1:door', 't1:a'], ['t1:a', 't1:b'], ['t1:b', 't1:door']],
  };
  const TR_ROUTE = ['t2:n', 't2:s', 't2:door', 't1:door', 't1:a', 't1:b', 't1:door', 't2:door'];

  const REP_LINES = [
    ['REP', 'We\'re closed. [beat] We\'ve been closed for a while, I think.'],
    ['REP', 'The key? Office. Top drawer. [beat] Don\'t wake anyone.'],
    ['REP', 'If the lights go, the modem on the desk brings them back. [long beat] Mostly.'],
    ['REP', 'I\'m just waiting for my shift to end.'],
  ];

  // ---- TR-1: the cutscene the counter trigger plays (letterbox, camera move, [beat]s, an actor walk, a choice) ------
  defineCutscene('TR-1', async (G) => {
    const rep = G.actor('rep');
    G.cam({ pos: [3.1, 1.7, 5.5], target: [5.95, 1.45, 1.6], fov: 40, to: { pos: [3.9, 1.6, 4.3], target: [5.7, 1.45, 1.6], fov: 36 }, dur: 5 });
    await G.aidan.turn([5.95, 1.6], 0.5);
    rep.look(G.aidan);
    await G.say('REP', 'Oh. [beat] Someone came in.');
    await G.say('AIDAN', 'Sorry. The door was open.');
    rep.eyes('down');
    await rep.walkTo(4.6, 1.45);
    await rep.turn(G.aidan, 0.6);
    await G.say('REP', 'You\'re not rostered today. [long beat] Are you?');
    const i = await G.choice(['"I\'m looking for someone."', 'Say nothing.']);
    if (i === 0) {
      await G.say('AIDAN', 'I\'m looking for someone. An old lady. Her alarm stopped working.');
      rep.eyes('away', G.aidan);
      await G.say('REP', 'Everyone\'s looking for someone. [beat] Check the office.');
      G.track('F', 1, 'TR-1 asked');
    } else {
      await G.think('Better not.');
      await G.say('REP', 'Suit yourself.');
      G.track('A', 1, 'TR-1 silent');
    }
    G.set('tr_asked', i === 0);
    await rep.walkTo(5.95, 1.55);
    await rep.turn(0, 0.5);
    rep.look(null);
  }, { letterbox: true, skippable: true });

  defineRoom({
    id: 'test_room', name: 'TEST ROOM', area: 'SIGNAL HILL DEPOT', outdoor: false, surface: 'lino', ambient: 'interior',
    fog: { density: 0.034, color: '#3b4543' },
    bounds: [-2, -4, 22, 18],
    surfaces: [{ box: [14, 0, 22, 10], s: 'carpet' }, { box: [1.5, -4, 6, 0], s: 'concrete' }, { box: [-2, 10, 22, 18], s: 'bitumen' }, { box: [9.4, 0.15, 13.85, 3.4], s: 'wood' }, { box: [7.3, 0.2, 9.4, 1.9], s: 'metal' }, { box: [14.2, 12.6, 18.2, 15.6], s: 'metal' }],
    entries: { start: [2.4, 6.4, 90], west: [0.95, 5, 90], yard: [-0.4, 13.4, 90] },
    cameras: [
      { id: 'test_room:hallW', vol: [0, 0, 7, 10.2], type: 'static', pos: [13.4, 3.15, 9.45], target: [3.0, 0.2, 3.4], fov: 'fit' },
      { id: 'test_room:hallE', vol: [7, 0, 14.2, 10.2], type: 'static', pos: [0.7, 3.15, 0.75], target: [11, 0.3, 6.6], fov: 'fit' },
      { id: 'test_room:closet', vol: [1.5, -4, 6, 0.15], type: 'static', pos: [3.75, 2.8, -7.6], target: [3.75, 0.1, -1.1], fov: 'fit' },
      { id: 'test_room:officeN', vol: [13.8, 0, 22, 5.2], type: 'static', pos: [18, 2.75, 9.7], target: [18, 0.3, 1.8], fov: 'fit' },
      { id: 'test_room:officeS', vol: [13.8, 5.2, 22, 10.15], type: 'static', pos: [18.3, 2.75, 0.3], target: [18, 0.2, 8], fov: 'fit' },
      { id: 'test_room:yard', vol: [-2, 9.85, 22, 18], type: 'rail', pos: [10, 4.4, 22.5], fov: 50, rail: { a: [-1, 4.4, 22.5], b: [21, 4.4, 22.5], look: [0, 1.0, -1.2], lag: 0.35 } },
      { id: 'test_room:lane', vol: [-2, 9.85, 1.5, 18], pri: 1, type: 'pan', pos: [6.5, 3.8, 11.2], target: [-1, 1, 15], fov: 44, pan: { lag: 0.3, yaw: 42, pitch: 18 } },
      { id: 'test_room:platform', vol: [14.2, 12.6, 18.2, 15.6], y: [2, 3], pri: 2, type: 'static', pos: [21.4, 6.6, 20.2], target: [16.2, 2.2, 14.1], fov: 'fit' },
    ],
    spawns: [
      { id: 'test_room:teth', type: 'tethered', pos: [20.4, 8.3], rot: 200, anchor: [20.4, 8.3] },
      { id: 'test_room:reach', type: 'reach', pos: [11.2, 13.4], rot: 200 },
      { id: 'test_room:borrowed', type: 'borrowed', disguise: 'wai', pos: [20.9, 1.3], rot: 180 },
      { id: 'test_room:unread', type: 'unread', pos: [20.6, 10.5], count: 36, cluster: [[19.9, 2.25, 10.1], [20.5, 2.6, 10.1], [21.1, 2.05, 10.1], [20.7, 1.7, 10.1], [21.5, 2.45, 10.1]] },
    ],
    build(K) {
      const H = 3.4, HO = 3.0;
      const wall = (x0, z0, x1, z1, h, mat, openings = [], o = {}) => K.wall(x0, z0, x1, z1, h, mat, { openings, skirting: true, ...o });

      // ---- floors, ceilings, walls ------------------------------------------------------------------------------
      K.floor(0, 0, 14, 10, 'lino');
      K.floor(14, 0, 22, 10, 'carpet');
      K.floor(1.5, -4, 6, 0, 'concrete');
      K.floor(-2, 10, 22, 18, 'bitumen');
      K.ceiling(0, 0, 14, 10, H);
      K.ceiling(14, 0, 22, 10, HO);
      K.ceiling(1.5, -4, 6, 0, 3.0, 'concrete');
      // hall: north (store-room door + window), west (transition door), east (office door + window), south (roller door + window)
      wall(-0.075, 0, 14.075, 0, H, 'plaster_stained', [{ at: 3.825, w: 1.0, h: 2.15 }, { at: 7.075, w: 1.6, h: 1.2, sill: 1.1, glass: true }]);
      wall(0, 10.075, 0, -0.075, H, 'plaster', [{ at: 5.075, w: 1.05, h: 2.15 }]);
      wall(14, -0.075, 14, 10.075, H, 'plaster', [{ at: 5.575, w: 1.0, h: 2.15 }, { at: 7.075, w: 1.2, h: 1.1, sill: 1.05, glass: true }]);
      wall(14.075, 10, -0.075, 10, H, 'plaster_stained', [{ at: 10.075, w: 3.0, h: 2.65 }, { at: 4.075, w: 2.0, h: 1.2, sill: 1.0, glass: true }]);
      // office: north, east, south (glass door to the yard)
      wall(14, 0, 22.075, 0, HO, 'plaster');
      wall(22, -0.075, 22, 10.075, HO, 'plaster', [{ at: 3.6, w: 1.4, h: 1.1, sill: 1.0, glass: true }]);
      wall(22.075, 10, 14, 10, HO, 'render_cracked', [{ at: 3.075, w: 1.0, h: 2.15 }]);
      // store room: the north wall is cut away for its camera (front face only, facing in)
      wall(1.425, -4, 6.075, -4, 3.0, 'concrete', [], { both: false });
      wall(1.5, 0, 1.5, -4, 3.0, 'concrete');
      wall(6, -4, 6, 0, 3.0, 'concrete');
      // the building's outside above the hall's and office's ceilings (a parapet seen from the yard)
      K.box(11, H, 10.08, 22.3, 0.5, 0.2, { tex: 'render_cracked', color: '#8c8e86' });

      // ---- stage (y 0.6) with a ramp on its west side and stairs down its south side --------------------------------
      K.floor(9.4, 0.15, 13.85, 3.4, 'timber_floor', { y: 0.6 });
      K.floor(7.3, 0.2, 9.4, 1.9, 'metal_grating', { ramp: { axis: 'x', y0: 0, y1: 0.6 } });
      K.stairs(10.6, 3.4, 12.4, 4.6, 0.6, 0, { axis: 'z', rail: 'both', mat: 'concrete' });
      K.prop('demo_table', 12.4, 1.4, 0, { y: 0.6 });
      K.prop('plinth', 10.2, 1.1, 0, { y: 0.6 });
      K.prop('tablet_box', 10.2, 1.1, 20, { y: 1.6 });
      K.examine(12.4, 1.7, 1.4, ['A demo table. The display phones are gone. Just the security cables, cut.', 'Somebody cut every one of them.'], { id: 'tr:demo' });

      // ---- the hall ---------------------------------------------------------------------------------------------------
      K.prop('counter', 5.2, 2.5, 0, { len: 2.4 });
      K.prop('mug', 4.4, 2.4, 10, { y: 1.0, text: "World's Okayest Manager" });
      K.examine(5.2, 1.1, 2.9, ['The service counter. A bell with no clapper.', 'Somebody\'s left their name badge under the till. It just says HERE TO HELP.'], { id: 'tr:counter' });
      K.npc('rep', 'rep', 5.95, 1.55, 0, {
        anim: 'idle', rig: { detail: 'low' },
        talk: async (G) => {
          const k = 'tr:repline', n = S.done[k] | 0;
          S.done[k] = n + 1;
          const [who, line] = REP_LINES[n % REP_LINES.length];
          const rep = G.actor('rep');
          rep.look(G.aidan);
          await G.say(who, line);
          rep.look(null);
        },
      });
      K.prop('corkboard', 5.4, 0.075, 0, { roster: true, examine: ['The roster. Every name has the same shift: "until close".'] });
      K.prop('filing_cabinet', 0.45, 0.55, 90);
      K.writing('FOLLOW UP TOMORROW', 2.3, 1.85, 0.08, 1.5, { rotY: 0 });
      K.prop('locker_bank', 0.37, 2.4, 90, { n: 3, examine: ['Lockers. One is open: a hoodie, a phone charger, a birthday card never given.', 'I shouldn\'t go through people\'s things.'] });
      K.prop('fuse_board', 0.08, 3.8, 90, {
        interact: async (G) => {
          if (Enemies.standard.active) { Enemies.standard.stop(); G.sfx('clunk'); await G.msg('The patrol stops.'); }
          else {
            Enemies.standard.start({ graph: TR_GRAPH, node: 't2:n', name: 'LUKA', mode: 'patrol', route: TR_ROUTE });
            G.sfx('clunk'); Enemies.standard.chime(0.8);
            await G.msg('Somewhere, keys.');
          }
        },
      });
      K.prop('exit_sign', 0.08, 5, 90, { mount: 2.45 });
      K.payphone(0.08, 7.5, 90, { wall: true, id: 'test_room:payphone' });
      K.prop('shelf', 1.3, 9.62, 180, { examine: 'Shelves of boxed modems. All returns. All the same fault, according to the stickers.' });
      K.prop('box_stack', 6.5, 9.45, 180, { n: 4 });
      K.prop('whiteboard', 7.2, 9.925, 180, { text: 'TARGET: 40\nACHIEVED: 39\nASK FIRST?', examine: ['The huddle board. Forty. They got thirty-nine.', 'Someone wrote "ASK FIRST?" in the corner and someone else rubbed half of it out.'] });
      K.prop('water_cooler', 8.4, 9.65, 180, { examine: 'The water cooler bubbles once, like it heard me.' });
      K.prop('desk', 7.2, 6.8, 180);
      K.prop('office_chair', 7.2, 7.55, 180);
      K.prop('monitor', 7.2, 6.62, 0, { y: 0.745, content: 'login' });
      K.prop('desk_phone', 6.6, 6.68, 20, { y: 0.745 });
      K.prop('desk_lamp', 6.55, 7.0, 150, { y: 0.745, lit: true, light: false });
      K.prop('modem', 7.85, 6.75, 0, { y: 0.745, state: 'ok' });
      K.interact(7.85, 0.95, 6.75, async (G) => {
        if (World.outageBusy) return;
        G.control(true);                               // the player keeps control through the transition (spec §2)
        await G.outage(!S.outage);
      }, { id: 'test_room:modem', r: 1.3 });
      K.doc('test_memo', 7.45, 0.75, 7.0, { id: 'test_room:memo' });
      K.prop('sandwich', 6.2, 7.0, 40, { y: 0.745 });
      K.breakTable(11.8, 7.4, 0, { id: 'test_room:break', time: [3, 12] });
      K.pickup('coffee', 11.55, 0.745, 7.3, { id: 'test_room:coffee' });
      K.prop('sink_bench', 12.2, 9.62, 180, { examine: 'A mug in the sink with a teabag welded to the bottom.' });
      K.prop('microwave', 12.9, 9.66, 180, { y: 0.92, time: '3:12' });
      K.prop('fridge', 13.55, 8.7, -90, { examine: ['The fridge hums. A note on the door: "LABEL YOUR FOOD".', 'Nothing inside is labelled.'] });
      K.prop('vending_machine', 13.45, 4.4, -90, { light: false, examine: 'Every row is sold out except B4. B4 is a single sandwich from a date I don\'t want to read.' });
      K.pickup('energy_drink', 5.9, 1.0, 2.35, { id: 'test_room:energy' });
      K.pickup('box_cutter', 4.6, 1.0, 2.6, { id: 'test_room:cutter', rot: 30 });
      K.pickup('extinguisher', 6.3, 0, 8.9, { id: 'test_room:extinguisher' });
      K.sticker('sticker_test', 4.1, 0.55, 2.13, 180, { size: 0.07 });

      // lights: two real fluoros, the rest glow only (Render's pool is 8 point lights for everything)
      // (lights default to world 'both' and relight after the Outage cut; the Fog world's tubes are tagged 'fog')
      K.prop('fluoro_tube', 3.5, 3.4, 0, { h: 3.3, bank: 1, world: 'fog' });
      K.prop('fluoro_tube', 3.5, 7.6, 0, { h: 3.3, light: false, world: 'fog' });
      K.prop('fluoro_tube', 10.6, 6.2, 90, { h: 3.3, bank: 2, world: 'fog' });
      K.prop('fluoro_tube', 11.6, 1.8, 0, { h: 3.3, light: false });
      K.prop('fluoro_tube', 3.5, 7.6, 0, { h: 3.3, world: 'outage', flicker: true });
      K.light('led', 0.2, 2.3, 5.75, { color: '#2aff5a', name: 'tr:exitled' });
      K.light('led', 0.2, 1.65, 3.8, { color: '#ff2a1c', blink: true, name: 'tr:fuseled' });

      // world-tagged dressing: Fog posters and papers; Outage contracts, receipts, tethers, a red light, a barricade
      K.fogOnly(() => {
        K.prop('poster', 13.925, 2.2, -90, { style: 'plan', text: 'NEW PLANS\nFROM $39', mount: 1.9 });
        K.prop('poster', 13.925, 9.0, -90, { style: 'faded', text: 'ASK US ABOUT\nCOVERAGE', mount: 1.6 });
        K.prop('plant_pot', 6.7, 0.45, 0);
        K.dress('papers', [1.2, 4.2, 6.2, 9.2], 14, { seed: 3 });
      });
      K.outageOnly(() => {
        for (let i = 0; i < 5; i++) K.prop('contract_stack', 7.1 + (i % 2) * 0.28, 0.45 + i * 0.32, i * 17, { h: 1.1 + (i % 3) * 0.25 });
        K.blocker(6.8, 0.2, 7.5, 1.9, 'Stacks of contracts. Waist high.');
        K.prop('receipt_strip', 4.2, 5.2, 0, { ceil: H, len: 1.6 });
        K.prop('receipt_strip', 9.0, 4.0, 40, { ceil: H, len: 2.2 });
        K.prop('tether_hanging', 2.6, 5.8, 0, { ceil: H, len: 1.8 });
        K.prop('receipt_curtain', 10.6, 8.6, 90, { ceil: H });
        K.dress('receipts', [1.2, 4.2, 6.2, 9.2], 22, { seed: 5 });
        K.light('point', 7.2, 2.6, 5.2, { color: '#ff3b2a', intensity: 3, distance: 7, name: 'tr:outred' });
        K.light('led', 7.85, 0.98, 6.62, { color: '#ff2a1c', blink: true });
      });

      // ---- doors ------------------------------------------------------------------------------------------------------
      K.door({ id: 'test_room:west', x: 0, z: 5, rot: 90, w: 0.95, style: 'metal', to: 'test_room2', entry: 'door', sign: 'STAFF ONLY' });
      K.door({ id: 'test_room:store', x: 3.75, z: 0, rot: 0, w: 0.92, style: 'wood', locked: true, key: 'test_key', lockMsg: "It's locked.", sign: 'STORE' });
      K.door({ id: 'test_room:office', x: 14, z: 5.5, rot: 90, w: 0.9, style: 'wood', sign: 'OFFICE', signBack: 'OFFICE' });
      K.door({ id: 'test_room:roller', x: 4, z: 10, rot: 0, style: 'roller', w: 2.85, h: 2.6 });
      K.door({ id: 'test_room:glass', x: 19, z: 10, rot: 0, w: 0.92, style: 'glass' });

      // ---- store room (locked; the key is in the office) ----------------------------------------------------------------
      K.prop('shelf', 5.68, -2.2, -90, { h: 1.9 });
      K.pickup('first_aid', 5.62, 1.05, -2.5, { id: 'test_room:firstaid' });
      K.prop('mop_bucket', 2.0, -0.7, 200);
      K.prop('paint_tins', 2.0, -3.5, 0);
      K.prop('box', 2.3, -2.6, 12);
      K.examine(5.4, 1.5, -2.2, ['Stock shelves. Mostly empty boxes, flattened and stacked for returns.', 'Every box has the same sticker: RETURNED — NO FAULT FOUND.'], { id: 'tr:storeshelf' });

      // ---- office ---------------------------------------------------------------------------------------------------------
      K.prop('cubicle', 16.0, 1.65, 0, { content: 'desktop' });
      K.prop('cubicle', 18.05, 1.65, 0, { color: '#5e6b6a' });
      K.prop('desk', 20.9, 0.47, 0);
      K.prop('filing_cabinet', 21.6, 4.1, -90);
      K.prop('filing_cabinet', 21.6, 4.62, -90);
      K.prop('desk', 15.2, 8.9, 0);
      K.prop('office_chair', 15.2, 8.15, 0);
      K.prop('drawing', 15.55, 9.0, 10, { y: 0.745 });
      K.prop('desk_lamp', 14.75, 9.1, 30, { y: 0.745, lit: true, light: false });
      K.pickup('test_key', 15.2, 0.75, 8.85, { id: 'test_room:key' });
      K.prop('photocopier', 16.9, 9.55, 180, { examine: 'The photocopier is warm. Page after page of the same form, blank except for a signature line.' });
      K.prop('cardigan_chair', 17.9, 6.1, 45, { examine: ['A cardigan over the back of a chair. Blue. Hand-knitted.', 'It smells like somebody\'s nan\'s house.'] });
      K.prop('fluoro_tube', 18, 3.4, 0, { h: 2.9, bank: 3, flicker: true, world: 'fog' });
      K.prop('fluoro_tube', 18, 7.6, 0, { h: 2.9, light: false });
      K.outageOnly(() => {
        K.prop('headset_hanging', 16.2, 4.6, 0, { ceil: HO });
        K.prop('tether_hanging', 19.4, 5.2, 0, { ceil: HO, len: 1.4 });
        K.light('led', 21.9, 1.1, 0.35, { color: '#ff2a1c', blink: true });
      });

      // ---- yard -------------------------------------------------------------------------------------------------------------
      K.prop('chainlink', 3.0, 18.05, 0, { len: 10 });
      K.prop('chainlink', 16.0, 18.05, 0, { len: 12 });
      K.prop('barrier', 9.0, 18.35, 0);
      K.blocker(8, 17.85, 10, 18.6, "I can't go that way.");
      K.drop(22, 9.9, 26.5, 18.2, { side: 'w' });
      K.prop('streetlight', 9.4, 10.6, 0, { bank: 4 });
      K.prop('hatchback', 4.0, 15.2, 90, { name: 'tr_car', hazards: true, examine: ['A hatchback with its hazards ticking. Nobody inside.', 'The keys are in it. [beat] I\'m not stealing a car.'] });
      K.prop('dumpster', 20.4, 16.9, 180);
      K.prop('bin', 12.6, 10.55, 0);
      K.prop('bench', 12.6, 17.35, 180, { examine: 'A bench facing the fence. Facing the fog.' });
      K.prop('pallet', 19.6, 12.2, 15);
      K.prop('cone', 21.2, 11.4, 0); K.prop('cone', 21.3, 13.8, 30); K.prop('bollard', 2.2, 10.7, 0); K.prop('bollard', 5.8, 10.7, 0);
      K.writing("IT'LL BE FINE", 7.6, 1.7, 10.1, 1.8, { rotY: 0 });
      K.examine(9, 1.2, 17.6, 'The fence is cut here. Past it there\'s just white.', { id: 'tr:gap' });
      // platform (a generator housing) with a ladder on its west face
      K.box(16.2, 0, 14.1, 4, 2.4, 3, { tex: 'concrete', color: '#8f918a' }, { collide: true });
      K.floor(14.2, 12.6, 18.2, 15.6, 'metal_grating', { y: 2.4, skirt: false });
      const rail = '#6d7470';
      K.box(16.2, 2.4, 12.63, 4, 1.05, 0.05, rail, { collide: true });
      K.box(16.2, 2.4, 15.57, 4, 1.05, 0.05, rail, { collide: true });
      K.box(18.17, 2.4, 14.1, 0.05, 1.05, 3, rail, { collide: true });
      K.box(14.23, 2.4, 13.05, 0.05, 1.05, 0.9, rail, { collide: true });
      K.box(14.23, 2.4, 15.15, 0.05, 1.05, 0.9, rail, { collide: true });
      K.ladder(14.15, 14.1, -90, 0, 2.4, { id: 'test_room:ladder', top: [14.75, 14.1], bottom: [13.5, 14.1] });
      K.prop('cable_drum', 16.9, 13.4, 90, { y: 2.4 });
      K.pickup('steel_bar', 15.6, 2.45, 14.9, { id: 'test_room:bar', rot: 70 });
      K.examine(16.2, 3.2, 14.1, ['From up here the yard is a small grey square in a lot of white.'], { id: 'tr:platform' });

      // ---- the cutscene trigger in front of the counter; the lane exit to the street ----------------------------------------
      K.trigger([3.9, 3.0, 6.5, 4.3], (G) => G.cutscene('TR-1'), { id: 'test_room:tr1' });
      K.exit({ id: 'test_room:lane', box: [-2, 10.3, -1.2, 17.7], to: 'test_room2', entry: 'south' });
    },
    async onEnter(G, from) {
      if (G.once('tr:welcome')) G.prompt('TEST ROOM — ` for the debug panel.', { id: 'tr_welcome' });
    },
  });

  defineRoom({
    id: 'test_room2', name: 'TEST STREET', area: 'SIGNAL HILL DEPOT', outdoor: true, surface: 'bitumen', ambient: 'wind',
    fog: { density: 0.05 },           // a lighter fog than the outdoor 0.075 (keep street cameras within ~10 m of Aidan)
    bounds: [0, -2, 10, 22],
    entries: { door: [8.9, 10, -90], south: [5, 19.8, 180], start: [5, 19.8, 180] },
    cameras: [
      { id: 'test_room2:north', vol: [0, -2, 10, 6.5], type: 'static', pos: [8.4, 4.4, 10.6], target: [4.4, 0.2, 2.2], fov: 'fit' },
      { id: 'test_room2:mid', vol: [0, 6.5, 10, 14], type: 'pan', pos: [-1.6, 4.0, 10.2], target: [7.5, 0.8, 10.2], fov: 50, pan: { lag: 0.3, yaw: 62, pitch: 34 } },
      { id: 'test_room2:south', vol: [0, 14, 10, 22], type: 'static', pos: [8.2, 3.9, 9.9], target: [4.2, 0.2, 18.6], fov: 'fit' },
    ],
    build(K) {
      K.road(2, -2, 8, 22, { axis: 'z', markings: 'center', footpath: 1.6 });
      K.wall(9.75, -2, 9.75, 22, 4.6, 'brick', { openings: [{ at: 12, w: 1.1, h: 2.2 }], grime: true });
      K.box(9.75, 4.6, 10, 0.4, 0.25, 24.2, { tex: 'concrete', color: '#7b7d77' });
      K.sign('SIGNAL HILL DEPOT', 9.6, 3.1, 10, 2.4, 0.5, { rotY: -90, style: 'shop' });
      K.door({ id: 'test_room2:door', x: 9.75, z: 10, rot: 90, w: 1.0, style: 'metal', to: 'test_room', entry: 'west' });
      K.prop('chainlink', 0.25, 5, 90, { len: 12 });
      K.prop('chainlink', 0.25, 17, 90, { len: 12 });
      K.fogWall(0, -2, 10, -0.9, "The road's just... gone.");
      K.prop('streetlight', 1.0, 6.2, 90, { bank: 1 });
      K.prop('streetlight', 9.0, 16.4, -90, { light: false });
      K.prop('power_pole', 0.9, 12.6, 0);
      K.prop('letterbox', 9.0, 4.2, -90, { examine: ['A red letterbox. Last collection: 5 pm. There is no date.'] });
      K.prop('bench', 1.05, 15.2, 90, { examine: 'Somebody carved a phone number into the bench. Seven digits. Too few.' });
      K.payphone(1.2, 18.7, 90, { id: 'test_room2:payphone' });
      K.examine(9.0, 1.5, 12.2, ['Brick. Painted over and over. Under the paint somebody wrote ASK THEM.'], { id: 't2:wall' });
      K.examine(5, 1.4, 0.2, 'The road just stops being a road. Fog, then nothing.', { id: 't2:fog' });
      K.exit({ id: 'test_room2:yard', box: [0.3, 20.8, 9.7, 22], to: 'test_room', entry: 'yard' });
    },
  });
}
