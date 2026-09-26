// tools/tests/ui.mjs — UI legibility at 1280×720 and 1920×1080 (spec §2A: the fonts, sizes and colours table; §7
// subtitles): every overlay and screen of the game is put up with long, real text, photographed at both sizes, and
// audited in the DOM:
//   * text smaller than the floor for its size (12 px at 720p, 15 px at 1080p — the §2A menu size is 18–20 px; small
//     print such as legends, tabs and the save rows' details may not go under the floor),
//   * text outside the window, or cut off by a box with overflow hidden (clipping),
//   * two different text blocks overlapping each other on screen.
// Canvas-drawn text (the paper map, the reading view's paper, the phone and keypad LCDs, the in-world screens) is only
// in the screenshots: look at them.
//
//   node tools/build.mjs --out .build/ui.html
//   node tools/run.mjs --file .build/ui.html --size 1280x720 --quiet --script tools/tests/ui.mjs
//   env: SH_SHOTS  output directory (default .build/ui)   SH_ONLY  a comma list of state names   UI_SIZES  "1280x720,1920x1080"
// Prints one line per state and size and `PASS ui`.
import fs from 'node:fs';
import { ev, report } from './lib.mjs';

const OUT = process.env.SH_SHOTS || '.build/ui';
const ONLY = process.env.SH_ONLY ? process.env.SH_ONLY.split(',') : null;
const SIZES = (process.env.UI_SIZES || '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const MIN_PX = (h) => (h >= 1000 ? 15 : 12);

// the page-side audit: visible text nodes under #ui → problems
function auditPage() {
  // roll: the screen scrolls text through the window (the credits) — text off-screen or cut at its edge is expected
  window.__audit = (minPx, roll) => {
    const vw = innerWidth, vh = innerHeight, root = document.getElementById('ui');
    const out = [], boxes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    const vis = (el) => {
      let e = el, op = 1;
      while (e && e !== document.body) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        op *= +cs.opacity; e = e.parentElement;
      }
      return op;
    };
    while (walker.nextNode()) {
      const tn = walker.currentNode, txt = tn.textContent.replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      const el = tn.parentElement;
      if (seen.has(el)) continue;
      seen.add(el);
      const op = vis(el);
      if (op < 0.35) continue;
      const rg = document.createRange(); rg.selectNodeContents(tn);
      const rects = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      const r = rects.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }), { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
      const tag = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
      const issues = [];
      if (fs < minPx - 0.05) issues.push(`small ${fs.toFixed(1)} px`);
      // (a scrolling list — the memos — keeps what is scrolled away out of sight by design)
      let scroller = false;
      for (let a = el.parentElement; a && a !== root; a = a.parentElement) { const ac = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(ac.overflowY) && a.scrollHeight > a.clientHeight + 2) { scroller = true; break; } }
      if (!roll && !scroller && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) issues.push('off-screen');
      for (let a = el; a && a !== root && !roll && !scroller; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 1.5 || r.right > ar.right + 1.5 || r.top < ar.top - 1.5 || r.bottom > ar.bottom + 1.5) { issues.push(`clipped by ${a.tagName.toLowerCase()}.${String(a.className).trim().split(/\s+/).join('.')}`); break; }
        }
      }
      if (issues.length) out.push({ tag, text: txt.slice(0, 48), issues });
      boxes.push({ el, tag, text: txt.slice(0, 32), rects });
    }
    // overlaps between different text blocks (neither inside the other)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      let hit = 0;
      for (const a of A.rects) for (const b of B.rects) {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) hit = Math.max(hit, (w * h) / Math.min(a.width * a.height, b.width * b.height));
      }
      if (hit > 0.15) out.push({ tag: A.tag + ' × ' + B.tag, text: `"${A.text}" × "${B.text}"`, issues: [`overlap ${(hit * 100).toFixed(0)}%`] });
    }
    return out;
  };
}

// states: [name, setup (page code, may await), teardown]
const LONG = "They've got a chatbot doing the screen bookings now. 'Hi! I'm here to help!' I trained the kid who built the booking page.";
const STATES = [
  ['subtitle_medium', `M.META.options.subs = 'medium'; M.UI.subtitle(${JSON.stringify(LONG)}, { speaker: 'WAI' }); await SH.advance(0.6);`, 'M.UI.clearSubtitle(0); await SH.advance(0.4);'],
  ['subtitle_small', `M.META.options.subs = 'small'; M.UI.subtitle(${JSON.stringify(LONG)}, { speaker: 'WAI' }); await SH.advance(0.6);`, "M.UI.clearSubtitle(0); M.META.options.subs = 'medium'; await SH.advance(0.4);"],
  ['subtitle_large', `M.META.options.subs = 'large'; M.UI.subtitle(${JSON.stringify(LONG)}, { speaker: 'WAI' }); await SH.advance(0.6);`, "M.UI.clearSubtitle(0); M.META.options.subs = 'medium'; await SH.advance(0.4);"],
  ['thought', "M.UI.subtitle('The alarm base station. \"NO LINE.\" It\\'s been saying that the whole time. The red button, for help. It just beeps.', { italic: true }); await SH.advance(0.6);", 'M.UI.clearSubtitle(0); await SH.advance(0.4);'],
  ['phone_voice', "M.UI.subtitle('Hi, it\\'s Luka. Just checking you got there okay. Give us a ring when you can, yeah? No stress.', { phone: true, speaker: 'LUKA (phone)' }); await SH.advance(0.6);", 'M.UI.clearSubtitle(0); await SH.advance(0.4);'],
  ['subtitle_and_message', `M.UI.subtitle(${JSON.stringify(LONG)}, { speaker: 'WAI' }); M.UI.message('Aidan picked up the Signal Hill Plaza Directory.', 8); await SH.advance(0.6);`, 'M.UI.clearSubtitle(0); M.UI.message(null); await SH.advance(0.5);'],
  ['message', "M.UI.message('Aidan picked up the Signal Hill Regional Office floor plan (Levels 5 and 6).', 8); await SH.advance(0.6);", 'M.UI.message(null); await SH.advance(0.5);'],
  ['prompt', "M.UI.prompt('Hold {interact}: cut it free.', { id: 'ui_t1', force: true, dur: 30 }); M.UI.prompt('{inventory}: items. USE the pendant.', { id: 'ui_t2', force: true, dur: 30 }); await SH.advance(0.8);", "M.UI.prompt(null, { id: 'ui_t1' }); M.UI.prompt(null, { id: 'ui_t2' }); await SH.advance(1.2);"],
  ['hold_prompt', "M.UI.holdPrompt('Re-patch the line', 0.45); await SH.advance(0.5);", 'M.UI.holdPrompt(null); await SH.advance(0.5);'],
  ['choice', "window.__ch = M.UI.choice(['\"I\\'m looking for someone. An old lady. Her alarm stopped working.\"', 'Say nothing.', 'Walk away.']); await SH.advance(0.8);", "SH.choose(1); await SH.advance(0.6);"],
  ['call_prompt', "M.UI.callPrompt('LUKA — MOBILE'); await SH.advance(0.8);", 'M.UI.callPrompt(null); await SH.advance(0.6);'],
  ['card', "window.__c = M.UI.card('THE PLAZA', { sub: 'SIGNAL HILL PLAZA', dur: 20 }); await SH.advance(3);", 'M.UI.clear({}); await M.UI.fade(0, 0); await SH.advance(0.5);'],
  ['text_on_black', "M.UI.textOnBlack('He never found out if she was okay. He never rang the number. The store changed its name twice before he left.', 30); await SH.advance(3.5);", 'M.UI.clear({}); await M.UI.fade(0, 0); await SH.advance(0.5);'],
  ['keypad_terminal', "window.__k = M.UI.keypad({ style: 'terminal', digits: 4, hint: 'PIN = the day you became one of us.' }); await SH.advance(1);", 'M.Input.inject("cancel"); await SH.advance(0.8);'],
  ['keypad_lockbox', "window.__k = M.UI.keypad({ style: 'lockbox', digits: 4, tag: 'UNIT 9 — SPARE' }); await SH.advance(1);", 'M.Input.inject("cancel"); await SH.advance(0.8);'],
  ['keypad_padlock', "window.__k = M.UI.keypad({ style: 'padlock', digits: 4, start: '0000', hint: 'The year the exchange opened.' }); await SH.advance(1);", 'M.Input.inject("cancel"); await SH.advance(0.8);'],
  ['keypad_rotary', "window.__k = M.UI.keypad({ style: 'rotary', digits: 4, label: 'RECORDS' }); await SH.advance(1);", 'M.Input.inject("cancel"); await SH.advance(0.8);'],
  ['screen_crm', "window.__s = M.UI.screen({ heading: 'CUSTOMER RECORD', fields: [['ACCOUNT NO.', '4471 0092 3318'], ['NAME', '(withheld)'], ['ADDRESS', 'Unit 9, Hilltop Village, Signal Hill'], ['SERVICES', 'Home phone · Medical alarm (3G)']], history: [['12/07', 'Callback requested', 'AIDAN'], ['13/07', 'Follow up tomorrow', 'AIDAN'], ['14/07', 'Follow up tomorrow', 'AIDAN'], ['15/07', 'Follow up tomorrow', 'AIDAN']], buttons: ['Close case', 'Leave open'] }, { style: 'crm', store: 'STORE 0288 · SIGNAL HILL PLAZA' }); await SH.advance(1);", 'M.UI.screen(null, { fade: 0 }); await SH.advance(0.6);'],
  ['screen_phone', "window.__s = M.UI.screen({ title: 'VOICEMAIL', big: 'CASE 118-2231', lines: ['From: Luke', 'Wed 9:41am', 'Nan\\'s alarm still isn\\'t working.'], buttons: ['CALL', 'DELETE'] }, { style: 'phone', bars: 2 }); await SH.advance(1);", 'M.UI.screen(null, { fade: 0 }); await SH.advance(0.6);'],
  ['menu_pause', "M.Menus.open('pause', {});", null],
  ['menu_items', "M.Menus.open('items', {});", null],
  ['menu_items_cmd', "M.Menus.open('items', {}); await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); SH.nav('confirm'); await SH.advance(0.6);", null],
  ['menu_items_examine', "M.Menus.open('items', { tab: 2, id: 'alarm_pendant' }); await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); SH.nav('confirm'); await SH.advance(0.5); const C = M.Menus._top.st.cmd; C.list.select(C.list.items.findIndex((x) => /EXAMINE/.test(x.label))); await SH.advance(0.1); SH.nav('confirm'); await SH.advance(1.2);", null],
  ['menu_map_area', "M.Menus.open('map', { id: 'office', floor: 'L4' });", null],
  ['menu_map_zoom', "M.Menus.open('map', { id: 'office', floor: 'L4' }); await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); SH.nav('confirm'); await SH.advance(0.8);", null],
  // (zoomed in, the floor tabs and the legend fade off the paper after 2.5 s)
  ['menu_map_zoom_settled', "M.Menus.open('map', { id: 'office', floor: 'L4' }); await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); SH.nav('confirm'); await SH.advance(0.5); SH.nav('confirm'); await SH.advance(3.6);", null],
  ['menu_map_town', "M.Menus.open('map', { id: 'town' });", null],
  ['menu_map_receipt', "M.Menus.open('map', { id: 'rmap_office', force: true });", null],
  ['menu_nomap', "M.Menus.open('map', { id: 'hospital' });", null],
  ['menu_memos', "M.Menus.open('memos', {});", null],
  ['doc_notebook', "M.Menus.open('doc', { id: 'oplog1' });", null],
  ['doc_dotmatrix', "M.Menus.open('doc', { id: 'call_logs' });", null],
  ['doc_email', "M.Menus.open('doc', { id: 'wai_email' });", null],
  ['doc_whiteboard', "M.Menus.open('doc', { id: 'huddle1' });", null],
  ['doc_sticky', "M.Menus.open('doc', { id: 'pin_note' });", null],
  ['doc_laminated', "M.Menus.open('doc', { id: 'cert' });", null],
  ['doc_card', "M.Menus.open('doc', { id: 'birthday_card' });", null],
  ['doc_lined', "M.Menus.open('doc', { id: 'fridge_list' });", null],
  ['doc_paper', "M.Menus.open('doc', { id: 'noticeboard' });", null],
  ['doc_plaque', "M.Menus.open('doc', { id: 'plaque' });", null],
  ['doc_phone', "M.Menus.open('doc', { id: 'chase_notes' });", null],
  ['menu_phone_calls', "M.Menus.open('phone', { tab: 0 });", null],
  ['menu_phone_voicemail', "M.Menus.open('phone', { tab: 1 });", null],
  ['menu_phone_notes', "M.Menus.open('phone', { tab: 2 });", null],
  ['menu_options', "M.Menus.open('options', {});", null],
  ['menu_calibrate', "M.Menus.open('calibrate', {});", null],
  ['menu_save', "M.Menus.open('save', {});", null],
  ['menu_load', "M.Menus.open('load', {});", null],
  ['menu_newgame', "M.Menus.open('newgame', {});", null],
  ['menu_extra', "M.Menus.open('extra', {});", null],
  ['menu_death', "M.UI.noSignal({ keep: true, dur: 0.1 }); await SH.advance(1); M.Menus.open('death', { noSignal: true });", null],
  ['menu_results', "M.Menus.open('results', { ending: 'connected', name: 'CONNECTED', stats: { ...M.S.stats, time: 5520, walked: 4210, ran: 1380, freed: 21, stomped: 2, killed: 14, itemsUsed: 11, damage: 640, voicemails: 7, callsAnswered: 8 }, memos: 40, memosTotal: 45 }); await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); await SH.advance(12);", null],
  ['menu_fates', "M.Menus.open('fates', { cards: ['Wai trains the new starters now. He still picks up on the first ring.', 'Chase told his leader what really happened that night. His store doesn\\'t roster anyone alone on late shifts anymore.'] });", null],
  ['menu_credits', "M.Menus.open('credits', { ending: 'connected', music: null }); await SH.advance(14);", null, { roll: true }],
];

export default async function (page, h) {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  let ok = true;
  const lines = [];
  // a Chapter 5 game in the Regional Office lobby: a full inventory, maps, memos, calls, notes and saves to show
  await ev(h, 'await SH.newGame({ skipIntro: true }); await SH.advance(1); await SH.chapter(5); await SH.advance(2); return 1');
  await ev(h, "await SH.goto('c5_level4', null); await SH.advance(2); SH.mod.Script.abortAll('ui'); await SH.advance(0.5); return 1");
  await ev(h, `const M = SH.mod;
    for (const id of Object.keys(M.DOCUMENTS)) if (!/_easy$|_hard$/.test(id) && id !== 'test_memo') M.S.docs[id] = M.S.docs[id] || { read: Math.random() < 0.5 };
    for (const id of ['map_town', 'map_plaza', 'map_village', 'map_exchange', 'map_care', 'map_office', 'rmap_office']) { if (M.ITEMS[id] && !M.S.inv.some((i) => i.id === id)) M.S.inv.push({ id, n: 1 }); if (M.ITEMS[id]) M.S.maps[M.ITEMS[id].map] = true; }
    for (const id of ['coffee', 'energy_drink', 'first_aid']) if (M.ITEMS[id]) { const it = M.S.inv.find((i) => i.id === id); if (it) it.n = 3; else M.S.inv.push({ id, n: 3 }); }
    M.S.equipped = M.S.equipped || 'steel_bar';
    try { M.Save.save(0); M.Save.save(1); } catch (e) { /* no save */ }
    return 1`);
  await ev(h, `(${auditPage})(); return 1`);
  for (const [w, hh] of SIZES) {
    await page.setViewportSize({ width: w, height: hh });
    await ev(h, 'await SH.advance(0.5); SH.mod.Render.render(0); return 1');
    const dir = `${OUT}/${w}x${hh}`;
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, setup, teardown, flags = {}] of STATES) {
      if (ONLY && !ONLY.includes(name)) continue;
      let res;
      try {
        await ev(h, `const M = SH.mod; ${setup}
          if (M.Menus.isOpen()) { await SH.until(() => M.Menus._top && M.Menus._top.ready, 10); await SH.advance(0.6); }
          M.Render.render(0); return 1`);
        await h.shot(`${dir}/${name}.png`);
        res = await ev(h, `return window.__audit(${MIN_PX(hh)}, ${!!flags.roll})`);
      } catch (e) { res = [{ tag: '-', text: '-', issues: ['setup failed: ' + e.message.split('\n')[0]] }]; }
      try {
        await ev(h, `const M = SH.mod; ${teardown || 'await M.Menus.close(null); await SH.advance(0.6);'} M.UI.clear && M.UI.clear({ letterbox: true }); await M.UI.fade(0, 0); await SH.advance(0.2); return 1`);
      } catch (e) { res.push({ tag: '-', text: '-', issues: ['teardown failed: ' + e.message.split('\n')[0]] }); }
      const probs = res.filter((p) => p.issues.length);
      lines.push(`${w}x${hh} ${name.padEnd(22)} ${probs.length ? probs.map((p) => `${p.issues.join('+')}: ${p.tag} "${p.text}"`).join(' | ') : 'ok'}`);
      if (probs.length) ok = false;
    }
  }
  for (const l of lines) console.log('  ' + l);
  const errs = await ev(h, 'return SH.errors');
  if (errs.length) { console.log('  SH.errors:', errs.slice(0, 6).join(' | ')); ok = false; }
  report('ui legibility (1280×720, 1920×1080)', ok, `${OUT}, ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
}
