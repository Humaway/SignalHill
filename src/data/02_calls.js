// ==== data/02_calls.js — Luka's eight calls (CALLS) and the shared DIALOGUE sets (spec §8, §6, §9–§12) ====
// Calls ring from the chapters (`await G.call('lukaN')`, triggers per CONTENT_PLAN §6). Phone owns the ring, the 8 s
// window and the tracking: answering → F+2, declining → A+2 and a voicemail; the first play of a voicemail → F+1.
// `answer(G)` runs as a blocking, non-skippable script (Aidan's arm is already at his ear); `voicemail(G)` runs when the
// player plays it from the phone (Phone adds the beeps either side). Dialogue is the spec's text, exactly.
// The "(static swallows it)" endings are a swell of line static that eats the last words, then the line goes dead.
{
  // a low line-hiss bed under a call or a voicemail (stopped with the script)
  const CALL_hiss = (G, vol = 0.12) => G.sfx('static', { loop: true, vol, phone: true });
  // small body language while he listens (the right hand holds the phone; these use the free hand / the eyes)
  const CALL_body = (G, fn) => { try { const a = G.aidan; const r = a ? fn(a) : null; if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* no actor (menus, tests) */ } };
  // the last line is swallowed by static: it swells over the final second of the line, roars, then the line is gone.
  // `text` may start with lines and [beat]s; only its last segment (after the last tag) is swallowed.
  async function CALL_swallow(G, speaker, text) {
    const cut = text.lastIndexOf(']');
    if (cut >= 0) { await G.say(speaker, text.slice(0, cut + 1)); text = text.slice(cut + 1).trim(); }
    const dur = U.readTime(text);
    const hiss = G.sfx('static', { loop: true, vol: 0.001, phone: true });
    G.bg(async (G2) => { await G2.wait(Math.max(0.6, dur - 1.3)); if (hiss) hiss.setVol(0.55, 0.35); });
    await G.say(speaker, text, { dur });
    if (hiss) hiss.setVol(0.8, 0.05);
    await G.wait(1.1);
    if (hiss) hiss.stop(0.04);
    G.sfx('click', { vol: 0.5 });
    await G.wait(0.9);
  }
  // Aidan, a few metres behind himself (call 5's keys "somewhere close")
  const CALL_behind = (G, d = 3.2) => {
    try { const p = G.player.pos, yaw = G.player.yaw || 0; return [p.x - Math.sin(yaw) * d + 0.8, 1.6, p.z - Math.cos(yaw) * d]; } catch (e) { return null; }
  };
  // a recorded voicemail: a faint line hiss, the message, a moment of dead air
  const CALL_vm = (text, extra) => async (G) => {
    CALL_hiss(G, 0.1);
    if (extra) extra(G);
    await G.wait(0.35);
    await G.say('LUKA (phone)', text);
    await G.wait(0.5);
  };

  // ---- 1 · Ch 1, leaving the staff room the first time -------------------------------------------------------------
  defineCall({
    id: 'luka1', n: 1, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G);
      await G.wait(0.5);
      await G.say('LUKA (phone)', "Aidan? Mate, it's Luka. [beat] You weren't on today. Or yesterday.");
      CALL_body(G, (a) => { a.eyes('down'); return a.gesture('rub_neck'); });
      await G.say('AIDAN', "Sorry. I'm sorry, I'm sick, I'm just—");
      await CALL_swallow(G, 'LUKA (phone)', "I'm not ringing about the roster. Just let me know you're alright, yeah? We need to have a chat about—");
      CALL_body(G, (a) => a.eyes('ahead'));
    },
    voicemail: CALL_vm("Hey, it's Luka. You weren't on. Just let me know you're alright, yeah? Call me."),
  });

  // ---- 2 · Ch 2, the village gate --------------------------------------------------------------------------------------
  defineCall({
    id: 'luka2', n: 2, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G);
      await G.wait(0.5);
      await G.say('LUKA (phone)', "The complaint came through to me. [beat] I've read the case.");
      CALL_body(G, (a) => a.gesture('shift_weight'));
      await G.say('AIDAN', "I'm fixing it. I'm here now. I'm fixing it.");
      await CALL_swallow(G, 'LUKA (phone)', "Here where? [beat] Aidan, I'm not angry. I promise you. Just—");
    },
    voicemail: CALL_vm("It's Luka. The complaint came to me. I'm not angry, mate. I promise. Call me back."),
  });

  // ---- 3 · Ch 3, the exchange forecourt --------------------------------------------------------------------------------
  defineCall({
    id: 'luka3', n: 3, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G, 0.14);
      await G.wait(0.5);
      await G.say('LUKA (phone)', 'Your housemate said you drove out to Signal Hill. [beat] I\'m coming out.');
      CALL_body(G, (a) => a.eyes('down'));
      await G.say('AIDAN', "Don't. Please. I've got it.");
      await G.say('LUKA (phone)', "I'm already on the highway, mate.");
      await G.wait(0.6);
      CALL_body(G, (a) => a.eyes('ahead'));
    },
    voicemail: CALL_vm('Your housemate says you went to Signal Hill. I\'m coming out. Stay where you are.'),
  });

  // ---- 4 · Ch 4, entering the business park ----------------------------------------------------------------------------
  defineCall({
    id: 'luka4', n: 4, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G, 0.16);
      G.sfx('wind_gust', { phone: true, vol: 0.25 });
      await G.wait(0.6);
      await G.say('LUKA (phone)', "I'm here. I think I'm here. [beat] There's so much fog. I can't find the road.");
      await G.say('AIDAN', 'Go home, Luka.');
      await G.wait(0.4);
      await G.say('LUKA (phone)', 'Not without you.');
      await G.wait(0.6);
    },
    // phones ringing somewhere behind him on the recording
    voicemail: CALL_vm("I'm in the fog somewhere. I can hear phones ringing. Where are you?", (G) => G.sfx('ring', { phone: true, vol: 0.07, n: 2, far: true })),
  });

  // ---- 5 · Ch 5, Level 4 open plan, while the Standard roams -----------------------------------------------------------
  defineCall({
    id: 'luka5', n: 5, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G, 0.08);
      await G.wait(0.7);
      await G.say('LUKA (phone)', 'I can hear keys. [beat] Is that you?');
      // Aidan says nothing. The keys chime somewhere close — in the room, and faintly down the line.
      CALL_body(G, (a) => { a.eyes('away'); if (a.raw) a.raw.idleLife = false; });
      await G.wait(2.2);
      const at = CALL_behind(G);
      G.sfx('keys', at ? { pos: at, vol: 0.9, n: 3 } : { vol: 0.7, n: 3 });
      G.sfx('keys', { phone: true, vol: 0.25, n: 2, delay: 0.15 });
      await G.wait(2.4);
      CALL_body(G, (a) => { a.eyes('ahead'); if (a.raw) a.raw.idleLife = true; });
      G.sfx('click', { vol: 0.4 });
      await G.wait(0.5);
    },
    // Static, and keys chiming.
    async voicemail(G) {
      const hiss = G.sfx('static', { loop: true, vol: 0.32, phone: true });
      await G.wait(1.5);
      G.sfx('keys', { phone: true, vol: 0.55, n: 2 });
      await G.wait(1.8);
      G.sfx('keys', { phone: true, vol: 0.4, n: 3 });
      await G.wait(2.2);
      if (hiss) hiss.stop(0.3);
      await G.wait(0.3);
    },
  });

  // ---- 6 · Ch 5, after the Pedestal (climbing back to Level 4) ---------------------------------------------------------
  defineCall({
    id: 'luka6', n: 6, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G);
      await G.wait(0.6);
      await G.say('LUKA (phone)', "Is Chloe with you? [beat] Tell her she can stop now. Tell her it's okay.");
      CALL_body(G, (a) => a.eyes('down'));
      await G.wait(1.2);
    },
    voicemail: CALL_vm("If Chloe's with you, tell her she can stop. Tell her it's okay."),
  });

  // ---- 7 · Ch 6, the upper floors, before the lift ---------------------------------------------------------------------
  defineCall({
    id: 'luka7', n: 7, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G, 0.1);
      await G.wait(0.8);
      CALL_body(G, (a) => { if (a.raw) a.raw.idleLife = false; });
      await G.say('LUKA (phone)', "Mate. [beat] I know you're scared of me. [long beat] I'm scared too.");
      await G.wait(1.4);
      CALL_body(G, (a) => { if (a.raw) a.raw.idleLife = true; });
    },
    voicemail: CALL_vm("I know you're scared of me. [beat] I'm scared too."),
  });

  // ---- 8 · Ch 7, leaving the hospital for the Mast ---------------------------------------------------------------------
  defineCall({
    id: 'luka8', n: 8, caller: 'LUKA',
    async answer(G) {
      CALL_hiss(G, 0.1);
      await G.wait(0.6);
      await G.say('LUKA (phone)', "They reckon she's awake. [beat] Whatever you're carrying, mate, put it down. Come back.");
      await G.wait(0.4);
      await G.say('AIDAN', 'I have to do one more thing.');
      await G.say('LUKA (phone)', "Then do it. I'll be here.");
      await G.wait(0.8);
    },
    voicemail: CALL_vm("She's awake. Whatever you're carrying, put it down. I'll be here."),
  });

  // =================================================================================================================
  // Shared dialogue (CONTENT_PLAN §6). Plain strings; [beat] / [long beat] work wherever they are spoken with G.say.
  // =================================================================================================================

  // Wai on the payphones, one line per save, in order (spec §9; Script.builtins.payphone reads it)
  defineDialogue('wai_payphone', [
    "Line's open, mate.",
    "Take your time. I'm not going anywhere.",
    "You sound tired. That's alright.",
    "The girls used to say: you don't hang up first.",
    'Still here.',
  ]);

  // Ch 4 Floor 1: picking up a ringing desk phone plays one of these, distorted, in random order (spec §10)
  defineDialogue('desk_phone', [
    "I've been on hold for two hours.",
    "Nobody told me there'd be a fee.",
    'I just want to talk to a person.',
    "I'm not angry. I'm just— I'm tired.",
    "My mum can't use it. She's eighty-four.",
    'Can you please just fix it?',
    'Is anyone there?',
  ]);

  // the Tethered's muffled voice that never finishes (spec §6; Enemies reads [0])
  defineDialogue('tethered', ['I only came in to...']);

  // the Reach's layered, distorted shouts (spec §6; Enemies reads them)
  defineDialogue('reach', [
    'I want your name.',
    "Do you know how long I've been waiting?",
    "Get me someone who knows what they're doing.",
  ]);

  // the Smile (spec §6, Ch 7)
  defineDialogue('smile', [
    'Hi there! What brings you in today?',
    "That'll all be fine.",
    'Can I interest you in anything else?',
  ]);

  // the Closer, Phase 1 "The Pitch": one line every 8 seconds, in order (spec §12)
  defineDialogue('closer_pitch', [
    "You don't have to make that call.",
    "She's in hospital. They look after them in there. She's fine.",
    "Luka doesn't need to know the rest. And Luke will calm down. They always calm down.",
    "Stay up here and you'll be the best in the store. Every month. Better than Chloe.",
    "You said it'd be fine, and you believed it. That's what makes you so good at this.",
    'All you have to do is follow up. [beat] Tomorrow.',
  ]);

  // the Closer, Phase 2 "The Close" barks (spec §12)
  defineDialogue('closer_barks', [
    'Sign here.',
    'Initial there.',
    "It'll be fine.",
    'Any other questions?',
  ]);

  // the Restructure's calm, cheerful voice (spec §6, Ch 3 boss)
  defineDialogue('restructure', [
    "Hi! I'm here to help.",
    "We're simplifying the way we work.",
    'Your role has been identified as impacted.',
    'Thank you for your contribution.',
  ]);

  // Luke's shouts during the Ch 2 chase, layered and distorted like a Reach (spec §9)
  defineDialogue('luke_chase', [
    'Three times! I rang three times!',
    'She\'s in the hospital! Did you know that?',
    'Come back here!',
  ]);

  // talking to Wai again in the Operators' Hall, cycling (spec §9, 3-2)
  defineDialogue('wai_talk', [
    "Got an email Tuesday. 'Your role has been identified as impacted.' [beat] Impacted. Like a tooth.",
    "Eighteen years. You'd think they'd at least call.",
    'Go on. Basement.',
  ]);

  // Luka's voice through the walls on Levels 5 and 6, never from where the player expects (spec §11, 6-2)
  defineDialogue('luka_walls', [
    'Aidan?',
    'Mate, is that you?',
    "I can hear you. It's alright.",
  ]);
}
