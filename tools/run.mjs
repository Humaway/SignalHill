#!/usr/bin/env node
// Headless Chromium harness for the built game (SwiftShader WebGL). The three.js CDN URLs are served from
// node_modules so the game runs offline; the built file itself is unchanged.
//
// Usage: node tools/run.mjs [options]
//   --file path          built html (default ./signal-hill.html)
//   --size 960x540       viewport
//   --ready 40           seconds to wait for window.SH.ready
//   --newgame            SH.newGame({ skipIntro:true }) once ready (starts at the Prologue gameplay)
//   --chapter N          SH.chapter(N)            (implies a new game)
//   --room id[:entry]    SH.goto(id, entry)
//   --advance S          SH.advance(S)            (fast fixed-step game ticks without rendering)
//   --real S             let the game run S real seconds (rendering)
//   --keys "w:1.5,e"     key presses in order: key[:holdSeconds] (Playwright key names; w a s d e q Tab Escape …)
//   --eval "code"        evaluated in the page as the body of an async function; result printed as JSON
//   --script file.mjs    module exporting default async (page, h) => {}; h = { eval, shot, wait, key, log }
//   --shot out.png       screenshot at the end
//   --camcheck           print SH.camCheck() for the current (or every, with --all-rooms) room
//   --all-rooms          with --camcheck: check every room
//   --allow-errors       exit 0 even if the page logged errors
//   --quiet              only print errors and results
// env: SH_CHROME_ARGS   extra Chromium switches (space-separated); SH_GPU_CANVAS=1 keeps 2D canvases GPU-accelerated
//      (by default they raster on the CPU: SwiftShader made accelerated-canvas draws and readbacks stall for minutes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const file = path.resolve(root, opt('file', 'signal-hill.html'));
const [vw, vh] = String(opt('size', '960x540')).split('x').map(Number);
const quiet = !!opt('quiet', false);
const log = (...a) => { if (!quiet) console.log(...a); };

const threeDir = path.join(root, 'node_modules/three');
const html = fs.readFileSync(file, 'utf8');
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const browser = await chromium.launch({
  executablePath: exe,
  // 2D canvases raster on the CPU (SH_GPU_CANVAS=1 keeps them on the "GPU"): here the GPU is SwiftShader, and every
  // accelerated-canvas draw and readback queued behind it — a room with an animated screen could stall a run for many
  // minutes. SH_CHROME_ARGS adds switches (space-separated).
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    ...(process.env.SH_GPU_CANVAS === '1' ? [] : ['--disable-accelerated-2d-canvas']), ...String(process.env.SH_CHROME_ARGS || '').split(/\s+/).filter(Boolean)],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const problems = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') { problems.push(m.text()); console.log('[console.error]', m.text()); }
  else if (t === 'warning') { if (!quiet) console.log('[console.warn]', m.text()); }
  else if (!quiet) console.log('[console]', m.text());
});
page.on('pageerror', (e) => { problems.push(String(e.stack || e)); console.log('[pageerror]', e.stack || String(e)); });
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('http://signalhill.local/')) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/);
  if (m) {
    const p = path.join(threeDir, m[1]);
    if (fs.existsSync(p)) return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(p) });
  }
  problems.push('blocked network request: ' + url);
  console.log('[network] BLOCKED', url);
  return route.abort();
});

const t0 = Date.now();
await page.goto('http://signalhill.local/index.html');
const readyTimeout = Number(opt('ready', 40)) * 1000;
try {
  await page.waitForFunction(() => window.SH && window.SH.ready === true, null, { timeout: readyTimeout });
  log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch {
  console.log('NOT READY after', readyTimeout / 1000, 's; SH.errors =', await page.evaluate(() => (window.SH && window.SH.errors) || []));
}

const h = {
  eval: (code) => page.evaluate(`(async () => { ${code} })()`),
  shot: (p) => page.screenshot({ path: path.resolve(root, p) }),
  wait: (s) => page.waitForTimeout(s * 1000),
  key: async (k, hold = 0) => { if (hold > 0) { await page.keyboard.down(k); await page.waitForTimeout(hold * 1000); await page.keyboard.up(k); } else await page.keyboard.press(k); },
  log,
  page,
};

const run = async (label, code) => {
  try { const r = await h.eval(code); if (r !== undefined) console.log(label, JSON.stringify(r, null, 1)); }
  catch (e) { problems.push(`${label} failed: ${e.message}`); console.log(`${label} FAILED:`, e.message); }
};
const chapter = opt('chapter', null);
if (opt('newgame', false) || chapter !== null) await run('newGame', `return await SH.newGame({ skipIntro: true })`);
if (chapter !== null) await run('chapter', `return await SH.chapter(${Number(chapter)})`);
const room = opt('room', null);
if (room) { const [id, entry] = String(room).split(':'); await run('goto', `return await SH.goto(${JSON.stringify(id)}, ${JSON.stringify(entry || null)})`); }
const adv = opt('advance', null);
if (adv) await run('advance', `return await SH.advance(${Number(adv)})`);
const keys = opt('keys', null);
if (keys) for (const k of String(keys).split(',')) { const [key, hold] = k.split(':'); await h.key(key, Number(hold || 0)); await h.wait(0.1); }
const real = opt('real', null);
if (real) await h.wait(Number(real));
const ev = opt('eval', null);
if (ev) await run('eval', String(ev));
const script = opt('script', null);
if (script) {
  const mod = await import(pathToFileURL(path.resolve(root, String(script))).href);
  try { await mod.default(page, h); } catch (e) { problems.push('script failed: ' + (e.stack || e)); console.log('SCRIPT FAILED', e.stack || e); }
}
if (opt('camcheck', false)) {
  await run('camcheck', opt('all-rooms', false) ? `return SH.camCheck('*')` : `return SH.camCheck()`);
}
const shot = opt('shot', null);
if (shot) { await h.shot(String(shot)); log('screenshot', shot); }
const shErrors = await page.evaluate(() => (window.SH && window.SH.errors) || []).catch(() => []);
for (const e of shErrors) if (!problems.includes(e)) { problems.push(e); console.log('[SH.errors]', e); }
const fps = await page.evaluate(() => window.SH && window.SH.fps).catch(() => null);
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s; fps(swiftshader)=${fps}; problems=${problems.length}`);
await browser.close();
process.exit(problems.length && !opt('allow-errors', false) ? 1 : 0);
