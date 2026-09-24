// ==== data/01_documents.js — every DOCUMENTS entry (spec §13, exact text; CONTENT_PLAN §4) + the puzzle clues ====
// Groups: Story, Account Notes, Operator's Log, Whiteboards, Returns Notes, Personal. Paper types (spec §2A Memos):
// lined notebook (Account Notes), notebook (the operators' log book, Luka's pad), dot-matrix with tractor feed (Call
// Logs), sticky notes, email printout (Wai's Email), a photo of a whiteboard (Huddle Whiteboards), laminated card,
// thermal receipt, plaque, card, phone (Chase's notes), plain paper. `text` is printed/typed (on hand-written paper
// types — lined, notebook, sticky, card, whiteboard — it is all handwriting); `hand` is handwriting added after it;
// a line written ~~like this~~ is struck through. Reading an Account Note or Nan's fridge list tracks F+1 (once).
//
// Puzzle clues come in riddle-level variants (spec §2A): `<id>_easy`, `<id>`, `<id>_hard`. Chapters place the one for
// DOC_level() (S.difficulty.riddle), e.g. K.doc(DOC_pick('pin_note'), …) — DOC_pick returns the level's id when it
// exists, else the base id. The memos count (Menus.memoCount) counts each variant group once.
const DOC_level = () => (S.difficulty && S.difficulty.riddle) || 'normal';
const DOC_pick = (base, lvl = DOC_level()) => (DOCUMENTS[`${base}_${lvl}`] ? `${base}_${lvl}` : base);
{
  const doc = (id, title, group, paper, text, o = {}) => defineDoc({ id, title, group, paper, text, ...o });

  // =================================================================================================================
  // Story documents — in the order they turn up in play (the memos list keeps this order); the puzzle clues sit where
  // they are found, one per riddle level (spec §2A riddle table)
  // =================================================================================================================

  // Prologue, the bus shelter wall. Hard: the depot footer is the lockbox clue (see timetable_hard).
  doc('timetable', 'Route 44 Timetable', 'Story', 'paper',
    'ROUTE 44 — SIGNAL HILL ⇄ CITY\n\nSaturday: departs Relay St 9:10 am.\nReturns from City Interchange 3:40 pm.',
    { hand: 'Phone shop in the city — local one shut. Ask about alarm!' });

  // Hard: the Route 44 timetable at the bus shelter carries the depot's founding year in its footer
  doc('timetable_hard', 'Route 44 Timetable', 'Story', 'paper',
    'ROUTE 44 — SIGNAL HILL ⇄ CITY\n\nSaturday: departs Relay St 9:10 am.\nReturns from City Interchange 3:40 pm.\n\nRoute 44 depot est. 1947',
    { hand: 'Phone shop in the city — local one shut. Ask about alarm!' });

  // ---- Ch 1 terminal PIN: Chloe's sticky note on the back-office monitor --------------------------------------------
  doc('pin_note_easy', "Chloe's Sticky Note", 'Story', 'sticky', 'PIN = your induction date, DDMM\n— C');
  doc('pin_note', "Chloe's Sticky Note", 'Story', 'sticky', 'New starter PINs = the day you became one of us! — C');
  doc('pin_note_hard', "Chloe's Sticky Note", 'Story', 'sticky', 'The day you became one of us. Day first.\n— C');

  // ---- Ch 1 the induction certificate on the staff-room corkboard (the PIN is 1403) ---------------------------------
  const CERT_HEAD = 'CERTIFICATE OF COMPLETION\nRetail Sales — New Starter Program\n\n';
  const CERT_SIGN = 'Welcome to the family! — C';
  doc('cert_easy', 'Induction Certificate', 'Story', 'laminated', CERT_HEAD + 'Aidan — Sales Induction — completed 14/03/2026.', { hand: CERT_SIGN });
  doc('cert', 'Induction Certificate', 'Story', 'laminated', CERT_HEAD + 'Aidan — Sales Induction — completed 14/03/2026.', { hand: CERT_SIGN });
  doc('cert_hard', 'Induction Certificate', 'Story', 'laminated', CERT_HEAD + 'Aidan — Sales Induction — completed on the fourteenth of March, 2026.', { hand: CERT_SIGN });

  // Ch 2, village office
  doc('noticeboard', 'Village Noticeboard', 'Story', 'paper', [
    'HILLTOP VILLAGE NOTICES',
    '',
    'Thursday Bingo, 1 pm, community hall.',
    '',
    'Reminder to all residents: test your alarm pendant monthly. Press and hold for 3 seconds.',
    '— Management',
    '',
    'IS YOUR MEDICAL ALARM READY FOR THE NETWORK SWITCH-OFF?',
    'Some older alarms stop working when your phone service changes. Ask your provider to check before you switch.',
    '',
    'LOST: reading glasses, tortoiseshell. Unit 9.',
    '',
    'Lawn mowing Tuesday. Please move cars.',
  ].join('\n'));

  // ---- Ch 2 lockbox (code 1947): Luke's sticky note tucked in the visitor book ---------------------------------------
  doc('lockbox_note_easy', "Luke's Note", 'Story', 'sticky', 'Nan — lockbox code is 1947. Your birth year. So you don\'t forget :)');
  doc('lockbox_note', "Luke's Note", 'Story', 'sticky', 'Nan — lockbox code is your birth year. So you don\'t forget :)');
  doc('lockbox_note_hard', "Luke's Note", 'Story', 'sticky', 'Nan — lockbox code is your birth year. So you don\'t forget :)');
  // the card pinned to the noticeboard (Easy and Normal use the same card; 2026 − 79 = 1947)
  doc('birthday_card', 'Birthday Card', 'Story', 'card',
    'Happy 79th Birthday to our Unit 9 Bingo Champion!\n\nFrom all at Thursday Bingo — June 2026.');
  doc('birthday_card_hard', 'Birthday Card', 'Story', 'card',
    'Happy Birthday to our Unit 9 champion, born the year the Route 44 depot opened!\n\nFrom all at Thursday Bingo');

  // Ch 2, Unit 9 — her handwriting on the fridge (TRACK F+1)
  doc('fridge_list', "Nan's Fridge List", 'Story', 'lined', [
    'THINGS TO ASK THE YOUNG MAN',
    '',
    '1. Will my alarm still work? (IMPORTANT)',
    '2. How much a month, all up',
    '3. Can Luke see my photos on the tablet',
    "4. Bus home is 3:40 — don't miss it",
  ].join('\n'), { track: { F: 1 } });

  // Ch 3, forecourt (the opening date matters in Ch 8)
  doc('plaque', 'Exchange Plaque', 'Story', 'plaque', [
    'SIGNAL HILL TRUNK EXCHANGE',
    'Opened 14 August 1961',
    '',
    '"Connecting the district to the world"',
    '',
    'Dedicated to the operators who keep us talking.',
  ].join('\n'));

  // ---- Ch 3 fuse board (HALL + FRAME = exactly 10 A): Wai's note taped to the board ---------------------------------
  doc('fuse_note_easy', "Wai's Note", 'Story', 'lined', '',
    { hand: "Old girl only takes 10. The frame needs the hall's doors. Don't be greedy.\nTicked the two you want in chalk.\n— W" });
  doc('fuse_note', "Wai's Note", 'Story', 'lined', '',
    { hand: "Old girl only takes 10. The frame needs the hall's doors. Don't be greedy. — W" });
  doc('fuse_note_hard', "Wai's Note", 'Story', 'lined', '',
    { hand: "Old girl takes 2,400 watts. The frame needs the hall's doors. Don't be greedy. — W" });
  // Hard: the loads only in watts (240 V: HALL 4 A, FRAME 6 A, RECORDS 2 A, BASEMENT 3 A, CANTEEN 1 A, MAST FEED 8 A)
  doc('fuse_spec_hard', 'Circuit Spec Sheet', 'Story', 'paper', [
    'SIGNAL HILL TRUNK EXCHANGE',
    'BASEMENT DISTRIBUTION — CIRCUIT LOADS',
    '',
    'HALL ............ 960 W',
    'FRAME ......... 1,440 W',
    'RECORDS ......... 480 W',
    'BASEMENT ........ 720 W',
    'CANTEEN ......... 240 W',
    'MAST FEED ..... 1,920 W',
    '',
    'MAST FEED: DO NOT ENERGISE — MAST DECOMMISSIONED',
  ].join('\n'), { hand: 'Old girl takes 2,400 watts' });

  // Ch 3, on Wai's candy-bar phone in Cutscene 3-2
  doc('wai_email', "Wai's Email", 'Story', 'email', [
    'From: People & Culture',
    'Subject: Update on your role',
    '',
    'Hi Wai,',
    '',
    'As part of changes to how we deliver device support, your role has been identified as impacted. A member of the team will be in touch regarding next steps.',
    '',
    'We thank you for your contribution.',
    '',
    'This mailbox is not monitored.',
  ].join('\n'));

  // ---- Ch 4 records door (dial 2231) ---------------------------------------------------------------------------------
  doc('rotary_card', 'Records Door Card', 'Story', 'laminated', 'RECORDS — pulse dial.\nDial the number you hear.');

  // Ch 4, records room (opens automatically in 4-4)
  doc('call_logs', 'Call Logs', 'Story', 'dotmatrix', [
    'INBOUND CALL LOG — STORE 0412 (CITY)',
    '',
    'MON 09:14 · Caller: Luke (grandson of account holder 4471-0932) · 6 min',
    'Medical alarm not working since service change on Saturday. Requesting callback. Customer upset.',
    'CALLBACK ASSIGNED: AIDAN.',
    '',
    'TUE 12:52 · Caller: Luke · 4 min',
    '2nd call. No callback received. Account holder is 79, lives alone, alarm not connecting. URGENT.',
    '',
    'WED 17:30 · Caller: Luke · 2 min',
    '3rd call. Very distressed. Advised callback is scheduled.',
    '',
    'CASE 118-2231 STATUS HISTORY:',
    'Follow up tomorrow (Mon) ·',
    'Follow up tomorrow (Tue) ·',
    'Follow up tomorrow (Wed)',
  ].join('\n'));

  // Ch 6, escalations office (opens automatically)
  doc('case_file', 'Case File', 'Story', 'paper', [
    'CASE 118-2231 — ESCALATION',
    '',
    'Account: 4471-0932 (Signal Hill).',
    'Rep: AIDAN.',
    'Store leader: LUKA.',
    '',
    'Summary: On Saturday night the account holder (79) fell at home. Her medical alarm could not connect after her landline was moved to a home internet service that has no coverage at her address. She was found the next morning by a neighbour and taken to Signal Hill District Hospital with a fractured hip.',
    '',
    'Prior contact: three inbound calls from grandson.',
    'Callback outstanding six days.',
    '',
    'Actions: account remediation; arrange an alarm-compatible service; leader to discuss with rep.',
    '',
    'Status: OPEN',
  ].join('\n'));

  // Ch 6, Luka's back office (his notepad)
  doc('luka_notes', "Luka's Meeting Notes", 'Story', 'notebook', [
    "Team meeting — Monday (didn't run it)",
    '',
    '1. Tell them they matter more than the number.',
    '2. Ask Aidan how he\'s actually going. Not "good?" Actually.',
    '3. Stop writing the number first.',
    '4. Ring him again.',
  ].join('\n'));

  // ---- Ch 8 compound gate padlock: 1961 (Easy / Normal), 1408 (Hard: day and month) ----------------------------------
  doc('gate_card_easy', 'Gate Card', 'Story', 'laminated', 'GATE: 1961 — year the exchange opened.');
  doc('gate_card', 'Gate Card', 'Story', 'laminated', 'GATE: year the exchange opened (see plaque).');
  doc('gate_card_hard', 'Gate Card', 'Story', 'laminated', 'GATE: day and month the exchange opened (see plaque).');

  // =================================================================================================================
  // Account Notes — Aidan's own notes, lined notebook, each TRACK F+1
  // =================================================================================================================
  const acct = (n, text, o = {}) => doc('acct' + n, 'Account Note ' + n, 'Account Notes', 'lined', text, { track: { F: 1 }, ...o });
  // Ch 1, Aidan's locker
  acct(1, 'Walk-in, uni student. Wanted the cheapest SIM-only. Left with the flagship, 256GB, on a 36-month device plan plus unlimited. Said he could handle the repayments with his part-time job. Skipped the full cost summary, he was in a rush. Nice guy.\n— A');
  // Ch 1, the Outage counter
  acct(2, 'Tradie, landscaper. Needs coverage at job sites up in the ranges. New handset and plan. Didn\'t run the coverage map for his work postcodes. He said "she\'ll be right." Me too.\n— A');
  // Ch 2, a doorstep modem box
  acct(3, 'Mum and two teens. Came in to fix one cracked screen. Left with three new lines, two watches and the family bundle. Store target hit by 4 pm!! Always offer the bundle. Chloe would be proud.\n— A');
  // Ch 3, the records drawer labelled AIDAN — the margin note is pressed hard enough to dent the paper
  acct(4, 'Acct 4471-0932. Elderly lady, lovely. Came by bus from Signal Hill (local store shut). Old phone won\'t work after the network switch-off. Set up: new handset, 5G home internet bundle, tablet, landline moved to the home phone service on the modem. Asked about her medical alarm. Told her it\'ll all be fine.\n— A',
    { hand: 'check alarm compat??' });
  // Ch 4, a team leader pod drawer
  acct(5, 'Older man with hearing aids. Needed a phone that streams to them. Sold him the one on promo instead. Didn\'t know if it streamed. He came back two days later. Luka sorted it and never said a word to me about it. Somehow that was worse.\n— A');
  // Ch 6, Luka's corkboard
  acct(6, 'Note to self (the week the modem came back):\n\nStop saying "it\'ll be fine" when you don\'t know. Say "let me check."\n\nLet me check.\nLet me check.\nLet me check.');

  // =================================================================================================================
  // Huddle Whiteboards — photos of whiteboards
  // =================================================================================================================
  const board = (n, text) => doc('huddle' + n, 'Huddle Whiteboard ' + n, 'Whiteboards', 'whiteboard', text);
  // Ch 1, Plaza store back office, Chloe's writing
  board(1, 'LAST DAY!!\n11 TO GO\n\nBundle every sale!\nAccessories on EVERY handset\n\nYou\'ve got this!! — C');
  // Ch 4, Team 3 pod
  board(2, 'TEAM 3 — Avg handle time target 6:00 · Current 11:42\n\nKEEP CALLS SHORT\n\nOffer callbacks to clear the queue!');
  // Ch 5, regional huddle board
  board(3, 'REGION — MONTH TO DATE\n\n91%\n\nNeed 104% to hold our ranking.\n\nEvery store. Every rep. Every sale.');
  // Ch 6, Luka's back office — the old line crossed out; underneath, in the same hand
  board(4, 'TODAY: 14\n\n~~Nobody leaves till we hit it~~\n\nProud of you all. — L');

  // =================================================================================================================
  // Operator's Log (Signal Hill Trunk Exchange) — pages from the operators' log book
  // 1–3 records room filing drawer · 4 canteen noticeboard · 5 cable vault · 6 taped under Wai's switchboard
  // =================================================================================================================
  const oplog = (n, date, body, who) => doc('oplog' + n, "Operator's Log " + n, "Operator's Log", 'notebook', `${date}\n\n${body}\n\n— ${who}`);
  oplog(1, '14 Aug 1961.', 'First night on the new boards. The supervisor says we\'ll connect the whole district to the world. Forty-two calls before the tea trolley. My hands ache.', 'M.');
  oplog(2, '3 Mar 1964.', 'Lamp 27 lit at 2 am. There\'s no line on 27, it\'s a spare. I answered anyway. A woman asking for her son. I asked for the number and she only said his name. I told her I\'d keep trying.', 'M.');
  oplog(3, '19 Jun 1971.', 'Dead-line calls again, four tonight. Supervisor says log them and don\'t talk about it. All four were asking for someone who never rang them back.', 'J.');
  oplog(4, '8 Nov 1979.', 'The girls have a rule now. If a dead line lights, you answer it. You listen. And you don\'t hang up first. It settles them.', 'M.');
  oplog(5, '30 Sep 1987.', 'Automation Monday. They want us out by Friday. Forty-odd years of us, and not one of them came up the hill to say it. A letter each: "Your position is no longer required."', 'J.');
  oplog(6, '2 Oct 1987.', 'Last shift. I\'ve left the board on. Somebody should keep the line open.', 'M.');

  // =================================================================================================================
  // Returns Notes — short handwritten slips. 1–4 appear in Cutscene 1-4; 5–9 drop during the Returns Cage fight (one
  // every 40 HP); 10–12 sit inside doorstep modem boxes in Chapter 2.
  // =================================================================================================================
  [
    "Didn't need this.",
    'Nobody told me about the cost.',
    "Doesn't work at my house.",
    'You said it would work here.',
    'I only came in for a charger.',
    "My son says I've been ripped off. Have I?",
    "Can't afford the repayments. Sorry.",
    'Too complicated. I just want my old one back.',
    'He was very nice. It still doesn\'t work.',
    'Never opened.',
    "I didn't know I was signing for 36 months.",
    'Please call me back.',
  ].forEach((t, i) => doc('returns' + (i + 1), 'Returns Note ' + (i + 1), 'Returns Notes', 'sticky', t));

  // =================================================================================================================
  // Personal items
  // =================================================================================================================
  // Ch 4, his phone, left on the cubicle desk after Cutscene 4-1
  doc('chase_notes', "Chase's Notes", 'Personal', 'phone', [
    'things to say if anyone asks about the eyebrow',
    '',
    '- footy',
    '- hit it on a shelf',
    '- u should see the other guy lol',
    '',
    'dont look at the counter.',
    'dont look at the counter.',
  ].join('\n'));
  // Ch 5, the print room floor after Cutscene 5-2
  doc('chloe_pin', "Chloe's Pin", 'Personal', 'plaque',
    'A gold Top Performer pin, engraved with a month.\n\nOn the back, scratched in with a key:',
    { hand: 'enough?' });
}
