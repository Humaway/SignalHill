#!/usr/bin/env node
// Concatenate src/engine/*.js, src/data/*.js and src/main.js into ONE self-contained HTML file.
// Usage: node tools/build.mjs [--out path]   (default ./signal-hill.html)
// Also writes .build/linemap.json so tools can map output lines back to source files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = path.resolve(root, outArg >= 0 ? args[outArg + 1] : 'signal-hill.html');

const list = (dir) => fs.existsSync(path.join(root, dir))
  ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f))
  : [];
const files = [...list('src/engine'), ...list('src/data'), 'src/expose.js', 'src/main.js'];

const shell = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
const marker = '//__GAME__';
const markerIdx = shell.indexOf(marker);
if (markerIdx < 0) throw new Error('shell.html has no //__GAME__ marker');
const before = shell.slice(0, markerIdx);
let line = before.split('\n').length; // 1-based line where the marker sits
const map = [];
let js = '';
for (const f of files) {
  let src = fs.readFileSync(path.join(root, f), 'utf8');
  if (!src.endsWith('\n')) src += '\n';
  if (src.includes('</script')) throw new Error(`${f} contains "</script" which would break the inline module`);
  const header = `// ======== ${f} ========\n`;
  js += header;
  line += 1;
  map.push({ file: f, start: line, lines: src.split('\n').length - 1 });
  js += src;
  line += src.split('\n').length - 1;
}
const html = before + js + shell.slice(markerIdx + marker.length);
fs.writeFileSync(out, html);
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
fs.writeFileSync(path.join(root, '.build', path.basename(out) + '.linemap.json'), JSON.stringify({ out, scriptStartLine: before.split('\n').length, files: map }, null, 1));
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`built ${path.relative(root, out)} — ${files.length} files, ${html.split('\n').length} lines, ${kb} KB`);
