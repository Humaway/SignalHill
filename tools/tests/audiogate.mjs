// tools/tests/audiogate.mjs — the title's sound in a browser that blocks audio until a gesture (every browser's default
// for a site it doesn't know): spec §2A step 1 "three seconds of black and static hiss" and step 4 "a distant phone that's
// been ringing the whole time". When loading ends with Web Audio still locked, Game shows one line on black ("PRESS ANY
// KEY TO BEGIN") and starts the title only after that key, with its sound. Run it with Chromium's autoplay policy set to
// what a normal browser does (tools/run.mjs otherwise lets the page play sound straight away, and the gate never shows):
//
//   node tools/build.mjs --out .build/gate.html
//   SH_CHROME_ARGS="--autoplay-policy=document-user-activation-required" \
//     node tools/run.mjs --file .build/gate.html --size 960x540 --ready 3 --script tools/tests/audiogate.mjs
// (--ready 3: SH.ready only comes after the key, so run.mjs's own wait gives up quickly and hands over to this script)
import { report } from './lib.mjs';

export default async function (page, h) {
  const notes = [];
  let ok = true;
  try {
    await page.waitForFunction(() => window.SH && window.SH.gate === true, null, { timeout: 90000 });
    const r0 = await page.evaluate(() => ({ ready: !!window.SH.ready, audio: window.SH.mod.Snd.ctx ? window.SH.mod.Snd.ctx.state : null, text: [...document.querySelectorAll('#app > div')].map((e) => e.textContent).filter((t) => /PRESS/.test(t)).join('') }));
    await h.wait(1.5);
    const r1 = await page.evaluate(() => ({ ready: !!window.SH.ready, gate: !!window.SH.gate }));
    await h.shot('.build/audiogate.png');
    notes.push(`loading done, sound locked: "${r0.text}" on black, audio ${r0.audio}, the title not started (SH.ready ${r0.ready}; 1.5 s later ${r1.ready})`);
    ok = ok && r0.audio === 'suspended' && /PRESS ANY KEY TO BEGIN/.test(r0.text) && !r0.ready && !r1.ready && r1.gate;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: 30000 });
    await h.wait(1);
    const r2 = await page.evaluate(() => { const t = SH.mod.Menus._top; return { gate: !!SH.gate, audio: SH.mod.Snd.ctx.state, stage: t.st.stage, t: +t.st.t.toFixed(2), hiss: !!t.st.hiss, ring: !!(t.st.ring && t.st.ring.playing) }; });
    notes.push(`a key: audio ${r2.audio}; the title starts at its black (stage ${r2.stage}, ${r2.t} s) with the static hiss ${r2.hiss ? 'on' : 'OFF'} and the phone ${r2.ring ? 'ringing' : 'SILENT'}`);
    ok = ok && !r2.gate && r2.audio === 'running' && r2.stage === 'black' && r2.hiss && r2.ring;
  } catch (e) { notes.push('threw: ' + e.message.split('\n')[0]); ok = false; }
  for (const n of notes) console.log('  ' + n);
  report('audio gate: the title keeps its sound where the browser locks audio until a key', ok);
}
