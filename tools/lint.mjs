#!/usr/bin/env node
// Syntax-check and lint the built game script, reporting locations in the ORIGINAL source files.
// Usage: node tools/lint.mjs [built.html]   (default ./signal-hill.html; run tools/build.mjs first)
// Exit code 1 on any error. Warnings are printed but do not fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { Linter } from 'eslint';
import globals from 'globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.argv[2] || 'signal-hill.html');
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script type="module">\n([\s\S]*?)<\/script>/);
if (!m) { console.error('no module script found'); process.exit(1); }
const code = m[1];
const scriptStart = html.slice(0, m.index).split('\n').length + 1; // line of first code line in html
let linemap = null;
try { linemap = JSON.parse(fs.readFileSync(path.join(root, '.build', path.basename(file) + '.linemap.json'), 'utf8')); } catch { /* none */ }

function where(codeLine) {
  const htmlLine = codeLine + scriptStart - 1;
  if (linemap) {
    for (const f of linemap.files) {
      if (htmlLine >= f.start && htmlLine < f.start + f.lines) return `${f.file}:${htmlLine - f.start + 1}`;
    }
  }
  return `signal-hill.html:${htmlLine}`;
}

let errors = 0, warnings = 0;
try {
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
} catch (e) {
  console.error(`SYNTAX ${where(e.loc?.line || 0)}: ${e.message}`);
  process.exit(1);
}

// Partial builds: engine modules not written yet are treated as known globals (with a warning), so
// agents working on one module still get useful no-undef errors for everything else.
const MODULES = ['Input', 'Snd', 'Tex', 'Render', 'Kit', 'Rig', 'Cam', 'Player', 'World', 'UI', 'Menus', 'Script', 'Enemies', 'Phone', 'Save', 'Debug', 'Game'];
const missing = MODULES.filter((n) => !new RegExp(`^const ${n}\\s*=`, 'm').test(code));
for (const n of missing) console.log(`warn [partial] engine module ${n} is not defined yet`);
const linter = new Linter({ configType: 'flat' });
const messages = linter.verify(code, [{
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'module',
    globals: { ...globals.browser, SH: 'writable', ...Object.fromEntries(missing.map((n) => [n, 'readonly'])) },
  },
  rules: {
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-const-assign': 'error',
    'no-func-assign': 'error',
    'no-import-assign': 'error',
    'no-obj-calls': 'error',
    'no-self-assign': 'warn',
    'no-unreachable': 'warn',
    'valid-typeof': 'error',
    'use-isnan': 'error',
    'no-dupe-else-if': 'warn',
    'no-duplicate-case': 'error',
    'getter-return': 'error',
    'no-unsafe-negation': 'error',
    'no-cond-assign': ['warn', 'except-parens'],
    'no-loss-of-precision': 'warn',
    'no-shadow-restricted-names': 'error',
    'no-unused-vars': 'off',
  },
}]);
for (const msg of messages) {
  const tag = msg.severity === 2 ? 'ERROR' : 'warn';
  if (msg.severity === 2) errors++; else warnings++;
  console.log(`${tag} ${where(msg.line)} [${msg.ruleId}] ${msg.message}`);
}
// Forbidden network usage: only the three.js import map is allowed.
const netPatterns = [/\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /\bimportScripts\s*\(/, /navigator\.sendBeacon/, /new\s+EventSource/];
code.split('\n').forEach((l, i) => {
  for (const p of netPatterns) if (p.test(l)) { errors++; console.log(`ERROR ${where(i + 1)} [network] forbidden network API: ${l.trim().slice(0, 100)}`); }
  if (/https?:\/\//.test(l) && !/\/\/.*https?:\/\//.test(l.replace(/(['"`]).*?\1/g, '')) && /(['"`])https?:\/\//.test(l)) {
    // string URL literal in code (comments are fine)
    warnings++; console.log(`warn ${where(i + 1)} [url] URL literal in code: ${l.trim().slice(0, 100)}`);
  }
});
console.log(`lint: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
