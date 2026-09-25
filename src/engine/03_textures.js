// ==== engine/03_textures.js — Canvas2D textures, kit materials, the Fog/Outage dissolve (ARCHITECTURE §2, spec §2) ====
// Every texture is drawn with Canvas2D on first use and cached. Generators are seeded (stable between runs) and the
// surface textures tile seamlessly: noise is periodic and every drawn feature is wrapped across the edges.
//
//   Tex.get(name, opts)   → cached THREE.CanvasTexture (RepeatWrapping, sRGB). Do not mutate a cached texture's
//                           repeat/offset — use Tex.mat(name, {repeat}) or .clone() it.
//   Tex.mat(name, opts)   → cached MeshStandardMaterial ("kit material", userData.shared = true) carrying the
//                           Fog→Outage noise dissolve (see Tex.setOutage).
//   Tex.sign / wordmark / poster / label / screen / handwriting — signage, branding, paper, dynamic screens.
const Tex = (() => {
  const FONT = {
    serif: "Georgia, 'Times New Roman', Times, serif",
    mono: "'Courier New', Courier, monospace",
    // handwriting: Windows, macOS, then the common Linux / Ghostscript script faces; without any of them handwriting()
    // slants and italicises whatever `cursive` resolves to (see handFontPresent)
    hand: "'Segoe Script', 'Bradley Hand', 'Brush Script MT', 'Apple Chancery', 'Comic Neue', 'URW Chancery L', 'Z003', 'Comic Sans MS', cursive",
    marker: "'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Chalkboard SE', 'Comic Neue', 'Comic Sans MS', 'URW Chancery L', 'Z003', cursive",
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    narrow: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
    heavy: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  };
  // Original telco palette (teal + yellow) and the Outage accents.
  const BRAND = { teal: '#00a8a8', tealDark: '#00787a', tealDeep: '#0b4f52', yellow: '#ffcc00', ink: '#1b2626', white: '#f4f3ee' };
  const OUT = { teal: '#1f6f6a', yellow: '#e8c21a', red: '#d0231c' };
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------------------------------------------
  const mk = (w, h, read = true) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c._ctx = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
    return c;
  };
  const ctxOf = (c) => c._ctx || c.getContext('2d');
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const hex = (h) => {
    if (Array.isArray(h)) return h;
    if (h && h.isColor) return [h.r * 255, h.g * 255, h.b * 255];
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (c, a = 1) => { c = hex(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };
  const mixc = (a, b, t) => { a = hex(a); b = hex(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const shade = (c, k) => hex(c).map((v) => c255(v * k));
  const vary = (c, r, amt) => { const k = 1 + (r() - 0.5) * amt; return hex(c).map((v) => c255(v * k * (1 + (r() - 0.5) * amt * 0.25))); };
  const pickr = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  const stable = (o) => {
    if (o === null || o === undefined) return '';
    if (typeof o !== 'object') return String(o);
    if (o.isColor) return '#' + o.getHexString();
    if (o.isTexture) return 'tex:' + o.uuid;
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    return '{' + Object.keys(o).sort().map((k) => k + ':' + stable(o[k])).join(',') + '}';
  };

  // Periodic value noise (tiles when cx, cy are integers). Returns Float32Array(w*h) in [0,1].
  function vnoise(w, h, cx, cy, r) {
    cx = Math.max(1, Math.round(cx)); cy = Math.max(1, Math.round(cy));
    const lat = new Float32Array(cx * cy);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const out = new Float32Array(w * h);
    const x0 = new Int32Array(w), x1 = new Int32Array(w), xt = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const f = (x * cx) / w, i = Math.floor(f); let t = f - i;
      x0[x] = i % cx; x1[x] = (i + 1) % cx; xt[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < h; y++) {
      const f = (y * cy) / h, j = Math.floor(f); let t = f - j; t = t * t * (3 - 2 * t);
      const r0 = (j % cy) * cx, r1 = ((j + 1) % cy) * cx, row = y * w;
      for (let x = 0; x < w; x++) {
        const a = lat[r0 + x0[x]], b = lat[r0 + x1[x]], c = lat[r1 + x0[x]], d = lat[r1 + x1[x]], s = xt[x];
        const top = a + (b - a) * s, bot = c + (d - c) * s;
        out[row + x] = top + (bot - top) * t;
      }
    }
    return out;
  }
  // Fractal sum of periodic octaves, normalised to [0,1].
  function fbm(w, h, r, { cells = 4, cy = null, oct = 4, gain = 0.5 } = {}) {
    const out = new Float32Array(w * h);
    let amp = 1, cxv = cells, cyv = cy || cells;
    for (let o = 0; o < oct; o++) {
      if (cxv > w || cyv > h) break;
      const n = vnoise(w, h, cxv, cyv, r);
      for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
      amp *= gain; cxv *= 2; cyv *= 2;
    }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < out.length; i++) { const v = out[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const k = 1 / (mx - mn || 1);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * k;
    return out;
  }
  // Per-pixel pass. fn(d, i, x, y, p) edits RGBA bytes in place.
  function pix(ctx, w, h, fn) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) fn(d, p * 4, x, y, p);
    ctx.putImageData(img, 0, 0);
  }
  // Fill from a noise field between two colours.
  function fillNoise(ctx, w, h, n, c0, c1, curve = 1) {
    c0 = hex(c0); c1 = hex(c1);
    pix(ctx, w, h, (d, i, x, y, p) => {
      const t = curve === 1 ? n[p] : Math.pow(n[p], curve);
      d[i] = c0[0] + (c1[0] - c0[0]) * t; d[i + 1] = c0[1] + (c1[1] - c0[1]) * t; d[i + 2] = c0[2] + (c1[2] - c0[2]) * t; d[i + 3] = 255;
    });
  }
  // Multiply brightness by (1 + (n-0.5)*amt).
  function modulate(ctx, w, h, n, amt) {
    pix(ctx, w, h, (d, i, x, y, p) => {
      const k = 1 + (n[p] - 0.5) * amt;
      d[i] = c255(d[i] * k); d[i + 1] = c255(d[i + 1] * k); d[i + 2] = c255(d[i + 2] * k);
    });
  }
  // Per-pixel film of noise so nothing is flat.
  function grainPass(ctx, w, h, r, amt, colour = 0.25) {
    pix(ctx, w, h, (d, i) => {
      const g = (r() - 0.5) * amt * 255;
      d[i] = c255(d[i] + g + (r() - 0.5) * amt * 255 * colour);
      d[i + 1] = c255(d[i + 1] + g);
      d[i + 2] = c255(d[i + 2] + g + (r() - 0.5) * amt * 255 * colour);
    });
  }
  // Draw fn at its 9 wrapped positions (for long paths crossing edges).
  function tiled(ctx, w, h, fn) {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); }
  }
  // Call fn(X, Y) at each wrapped copy of a feature with radius pad that intersects the canvas.
  function wrapAt(w, h, x, y, pad, fn) {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const X = x + dx, Y = y + dy;
      if (X + pad < 0 || X - pad > w || Y + pad < 0 || Y - pad > h) continue;
      fn(X, Y);
    }
  }
  // Horizontal-only wrap (rows of features that already fill the height exactly).
  function wrapX(w, x, pad, fn) { for (const dx of [-w, 0, w]) { const X = x + dx; if (X + pad >= 0 && X - pad <= w) fn(X); } }
  // A per-feature seed: wrapped copies re-create the same sub-sequence so both sides of a seam match.
  const subSeed = (r) => (r() * 4294967296) >>> 0;
  function speck(ctx, w, h, r, n, cols, size = 1, alpha = 0.3) {
    for (let k = 0; k < n; k++) {
      const s = size * (0.5 + r());
      ctx.fillStyle = rgba(pickr(cols, r), alpha * (0.4 + r() * 0.6));
      ctx.fillRect(r() * w, r() * h, s, s);
    }
  }
  function blotch(ctx, w, h, x, y, rad, col, a) {
    wrapAt(w, h, x, y, rad, (X, Y) => {
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, rad);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(0.6, rgba(col, a * 0.5)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
    });
  }
  // Irregular closed outline around (0,0): radii smoothed around the ring.
  function blobRadii(r, n = 26, irr = 0.45) {
    let a = []; for (let i = 0; i < n; i++) a.push(1 - irr / 2 + r() * irr);
    for (let pass = 0; pass < 2; pass++) a = a.map((v, i) => (a[(i + n - 1) % n] + v * 2 + a[(i + 1) % n]) / 4);
    return a;
  }
  function blobPath(ctx, X, Y, rad, radii, sy = 1) {
    const n = radii.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = rad * radii[i % n];
      const px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr * sy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  // Water stain: soft fill, dark tide-mark and fainter inner rings.
  function waterStain(ctx, w, h, r, x, y, rad, a = 1, col = [120, 96, 58]) {
    const radii = blobRadii(r, 30, 0.5);
    wrapAt(w, h, x, y, rad * 1.3, (X, Y) => {
      const g = ctx.createRadialGradient(X, Y, rad * 0.1, X, Y, rad * 1.05);
      g.addColorStop(0, rgba(col, 0.04 * a)); g.addColorStop(0.85, rgba(col, 0.13 * a)); g.addColorStop(1, rgba(col, 0.02 * a));
      blobPath(ctx, X, Y, rad, radii); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(1, rad * 0.025); ctx.strokeStyle = rgba(shade(col, 0.75), 0.32 * a); ctx.stroke();
      blobPath(ctx, X + rad * 0.05, Y - rad * 0.04, rad * 0.72, radii); ctx.lineWidth = 1; ctx.strokeStyle = rgba(col, 0.16 * a); ctx.stroke();
      blobPath(ctx, X - rad * 0.04, Y + rad * 0.03, rad * 0.46, radii); ctx.strokeStyle = rgba(col, 0.09 * a); ctx.stroke();
    });
  }
  function drips(ctx, w, h, r, n, col, a, { minLen = 0.1, maxLen = 0.5, width = 3 } = {}) {
    for (let k = 0; k < n; k++) {
      const x = r() * w, y = r() * h, len = h * (minLen + r() * (maxLen - minLen)), wd = 0.8 + r() * width;
      wrapAt(w, h, x, y + len / 2, len / 2 + wd, (X, Yc) => {
        const Y = Yc - len / 2, g = ctx.createLinearGradient(0, Y, 0, Y + len);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(0.3, rgba(col, a * 0.7)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(X - wd / 2, Y);
        ctx.quadraticCurveTo(X - wd * 0.2, Y + len * 0.5, X - wd * 0.15, Y + len); ctx.lineTo(X + wd * 0.15, Y + len);
        ctx.quadraticCurveTo(X + wd * 0.3, Y + len * 0.5, X + wd / 2, Y); ctx.fill();
      });
    }
  }
  // Branching crack paths (random walk). Returns polylines.
  function crackLines(r, x, y, len, ang, step = 5, branch = 0.08) {
    const lines = [];
    const walk = (px, py, a, left, depth) => {
      const pts = [[px, py]];
      while (left > 0) {
        a += (r() - 0.5) * 0.9;
        px += Math.cos(a) * step; py += Math.sin(a) * step; left -= step;
        pts.push([px, py]);
        if (depth < 2 && r() < branch) walk(px, py, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.8), left * (0.25 + r() * 0.4), depth + 1);
      }
      lines.push({ pts, depth });
    };
    walk(x, y, ang, len, 0);
    return lines;
  }
  function drawCracks(ctx, w, h, lines, col = [38, 34, 28], a = 0.7, width = 1.3, light = 0.14) {
    tiled(ctx, w, h, () => {
      for (const l of lines) {
        const lw = width / (1 + l.depth * 0.6);
        ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] + 1, p[1] + 1) : ctx.moveTo(p[0] + 1, p[1] + 1)));
        ctx.strokeStyle = `rgba(255,255,255,${light})`; ctx.lineWidth = lw; ctx.stroke();
        ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.stroke();
      }
    });
  }
  function scuffs(ctx, w, h, r, n, col, a, len = 30) {
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = r() * w, y = r() * h, L = len * (0.3 + r()), ang = r() * TAU, bend = (r() - 0.5) * L * 0.6, lw = 0.6 + r() * 2.2, al = a * (0.4 + r() * 0.6);
      wrapAt(w, h, x, y, L, (X, Y) => {
        ctx.beginPath(); ctx.moveTo(X, Y);
        ctx.quadraticCurveTo(X + Math.cos(ang) * L / 2 - Math.sin(ang) * bend, Y + Math.sin(ang) * L / 2 + Math.cos(ang) * bend, X + Math.cos(ang) * L, Y + Math.sin(ang) * L);
        ctx.strokeStyle = rgba(col, al); ctx.lineWidth = lw; ctx.stroke();
      });
    }
  }
  // Dark streaky grime accumulation from a noise field (threshold).
  function grime(ctx, w, h, r, amt = 0.35, col = [40, 36, 30], cells = 3) {
    const n = fbm(w, h, r, { cells, oct: 5, gain: 0.55 });
    col = hex(col);
    pix(ctx, w, h, (d, i, x, y, p) => {
      const t = Math.max(0, n[p] - 0.5) * 2 * amt;
      d[i] += (col[0] - d[i]) * t; d[i + 1] += (col[1] - d[i + 1]) * t; d[i + 2] += (col[2] - d[i + 2]) * t;
    });
  }
  function text(ctx, str, x, y, { size = 20, font = FONT.sans, weight = '', color = '#000', align = 'left', base = 'alphabetic', spacing = 0, alpha = 1 } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`.trim();
    ctx.fillStyle = color; ctx.textAlign = spacing ? 'left' : align; ctx.textBaseline = base; ctx.globalAlpha = alpha;
    if (!spacing) ctx.fillText(str, x, y);
    else {
      const chars = [...str], ws = chars.map((c) => ctx.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
      let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += ws[i] + spacing; });
    }
    ctx.restore();
  }
  // Largest font size (≤ max) at which all lines fit the box.
  function fitSize(ctx, lines, maxW, maxH, fontFn, max = 200, lh = 1.15) {
    let s = Math.min(max, maxH / (lines.length * lh));
    for (let k = 0; k < 40 && s > 6; k++) {
      ctx.font = fontFn(s);
      const wmax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (wmax <= maxW) break;
      s *= Math.max(0.6, Math.min(0.97, maxW / wmax));
    }
    return Math.floor(s);
  }
  function wrapText(ctx, str, maxW) {
    const out = [];
    for (const para of String(str).split('\n')) {
      if (!maxW) { out.push(para); continue; }
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Handwriting — cursive system font, uneven baseline, per-glyph wobble. Seeded by the text.
  // ---------------------------------------------------------------------------------------------------------------
  // Is any named face of a CSS font stack installed? (width test against two generic baselines — document.fonts.check
  // can't tell about system fonts). Cached per stack.
  const fontSeen = new Map();
  let probeCtx = null;
  function faceInstalled(name) {
    if (fontSeen.has(name)) return fontSeen.get(name);
    let ok = false;
    try {
      probeCtx = probeCtx || mk(8, 8).getContext('2d');
      const t = 'mmmmmmmmmmlliWWxyz0123';
      for (const base of ['monospace', 'serif', 'sans-serif']) {
        probeCtx.font = `72px ${base}`; const w0 = probeCtx.measureText(t).width;
        probeCtx.font = `72px '${name}', ${base}`; const w1 = probeCtx.measureText(t).width;
        if (Math.abs(w1 - w0) > 0.5) { ok = true; break; }
      }
    } catch (e) { ok = true; }
    fontSeen.set(name, ok);
    return ok;
  }
  function handFontPresent(stack) {
    const key = 'stack:' + stack;
    if (fontSeen.has(key)) return fontSeen.get(key);
    const names = [...String(stack).matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
    const ok = names.some((n) => faceInstalled(n));
    fontSeen.set(key, ok);
    return ok;
  }
  function handwriting(ctx, str, x, y, o = {}) {
    const size = o.size || 22, wob = o.wobble ?? 1, font = o.font || FONT.hand;
    const r = U.rng((U.hash(String(str)) ^ (o.seed || 7)) >>> 0);
    // no handwriting face installed (a bare Linux): an italic, slanted fallback reads as written, not typed
    const synth = o.synth ?? !handFontPresent(font);
    ctx.save();
    ctx.font = `${synth ? 'italic ' : ''}${o.weight || ''} ${size}px ${font}`.replace(/\s+/g, ' ').trim();
    ctx.fillStyle = o.color || '#1f2c6e'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const lh = o.lineHeight || size * 1.35;
    const lines = wrapText(ctx, str, o.maxWidth);
    let maxW = 0;
    lines.forEach((line, li) => {
      const chars = [...line];
      const ws = chars.map((c) => ctx.measureText(c).width * (0.95 + r() * 0.08));
      const tw = ws.reduce((a, b) => a + b, 0);
      let cx = o.align === 'center' ? x - tw / 2 : o.align === 'right' ? x - tw : x;
      const x0 = cx, slope = (r() - 0.5) * 0.05 * wob, phase = r() * 6;
      chars.forEach((c, i) => {
        const dy = Math.sin(phase + (cx - x0) * 0.045) * size * 0.05 * wob + (r() - 0.5) * size * 0.07 * wob + (cx - x0) * slope;
        ctx.save();
        ctx.translate(cx, y + li * lh + dy); ctx.rotate((r() - 0.5) * 0.09 * wob);
        if (synth) ctx.transform(1, 0, -0.2 - r() * 0.06, 1, 0, 0);
        ctx.globalAlpha = (o.alpha ?? 1) * (0.82 + r() * 0.18);
        ctx.fillText(c, 0, 0);
        ctx.restore();
        cx += ws[i];
      });
      maxW = Math.max(maxW, cx - x0);
    });
    ctx.restore();
    return { w: maxW, h: lines.length * lh, lines: lines.length };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The wordmark — an ORIGINAL lowercase "optus" with ascending signal bars. Not the real logo.
  // ---------------------------------------------------------------------------------------------------------------
  function drawWordmark(ctx, x, y, h, o = {}) {
    const col = o.color || BRAND.yellow;
    ctx.save();
    ctx.font = `900 ${h}px 'Arial Rounded MT Bold', 'Helvetica Rounded', ${FONT.heavy}`;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = col;
    const word = o.text || 'optus';
    let cx = x;
    for (const ch of word) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width - h * 0.035; }
    // three ascending bars, tucked after the word
    const bw = h * 0.1, gap = h * 0.055, bx = cx + h * 0.1;
    for (let i = 0; i < 3; i++) {
      const bh = h * (0.28 + i * 0.2);
      ctx.fillRect(bx + i * (bw + gap), y - bh, bw, bh);
    }
    // a thin underline running under the word only
    ctx.fillRect(x + h * 0.02, y + h * 0.13, cx - x - h * 0.05, Math.max(1, h * 0.045));
    ctx.restore();
    return bx + 3 * (bw + gap) - x;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Surface generators. def: { px, size (metres per tile), gen(ctx,w,h,r,o) → {rough?, bump?}, mat:{…}, outage }
  // ---------------------------------------------------------------------------------------------------------------
  const GEN = {};
  const define = (name, d) => { GEN[name] = { px: 512, size: 1, alpha: false, mat: {}, ...d }; return GEN[name]; };

  // --- walls ---
  function plasterBase(ctx, w, h, r, base = '#b1ada3') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 5, gain: 0.55 }), 0.15);
    const roll = vnoise(w, 1, 40, 1, r);
    pix(ctx, w, h, (d, i, x) => { const k = 1 + (roll[x] - 0.5) * 0.05; d[i] = c255(d[i] * k); d[i + 1] = c255(d[i + 1] * k); d[i + 2] = c255(d[i + 2] * k); });
    speck(ctx, w, h, r, 700, [[70, 66, 60]], 1.2, 0.2);
    speck(ctx, w, h, r, 300, [[235, 232, 224]], 1.2, 0.2);
    scuffs(ctx, w, h, r, 10, [70, 66, 60], 0.08, 40);
  }
  define('plaster', {
    size: 2, mat: { roughness: 0.92, bump: 0.6 },
    gen(ctx, w, h, r) { plasterBase(ctx, w, h, r); grainPass(ctx, w, h, r, 0.035); },
  });
  define('plaster_stained', {
    size: 2, mat: { roughness: 0.9, bump: 0.6 },
    gen(ctx, w, h, r) {
      plasterBase(ctx, w, h, r, '#aaa597');
      grime(ctx, w, h, r, 0.28, [92, 86, 70], 2);
      for (let k = 0; k < 4; k++) waterStain(ctx, w, h, r, r() * w, r() * h, 40 + r() * 90, 0.8 + r() * 0.6);
      drips(ctx, w, h, r, 22, [88, 76, 56], 0.14, { minLen: 0.15, maxLen: 0.6, width: 5 });
      drips(ctx, w, h, r, 30, [60, 56, 48], 0.1, { minLen: 0.05, maxLen: 0.25, width: 2 });
      // mould specks in a couple of clusters
      for (let c = 0; c < 3; c++) {
        const cx = r() * w, cy = r() * h;
        for (let k = 0; k < 160; k++) {
          const a = r() * TAU, d = Math.pow(r(), 1.7) * 60;
          const X = (cx + Math.cos(a) * d + w) % w, Y = (cy + Math.sin(a) * d + h) % h;
          ctx.fillStyle = rgba([48, 56, 44], 0.1 + r() * 0.3); ctx.fillRect(X, Y, 1 + r() * 2, 1 + r() * 2);
        }
      }
      scuffs(ctx, w, h, r, 14, [50, 46, 40], 0.12, 50);
      grainPass(ctx, w, h, r, 0.04);
    },
  });
  define('render_cracked', {
    size: 2, mat: { roughness: 0.95, bump: 1.4 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#9e998d'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 2, oct: 4 }), 0.14);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 64, oct: 3, gain: 0.6 }), 0.34);
      // trowel dabs
      for (let k = 0; k < 500; k++) {
        const x = r() * w, y = r() * h, s = 3 + r() * 9, light = r() < 0.5, rot = r() * 3;
        wrapAt(w, h, x, y, s, (X, Y) => { ctx.fillStyle = light ? 'rgba(255,255,250,0.05)' : 'rgba(40,36,30,0.05)'; ctx.beginPath(); ctx.ellipse(X, Y, s, s * 0.6, rot, 0, TAU); ctx.fill(); });
      }
      // repaired patches
      for (let k = 0; k < 2; k++) {
        const x = r() * w, y = r() * h, rad = 30 + r() * 50, radii = blobRadii(r, 12, 0.6), c = r() < 0.5 ? [180, 176, 164] : [138, 134, 122];
        wrapAt(w, h, x, y, rad * 1.4, (X, Y) => { blobPath(ctx, X, Y, rad, radii, 0.7); ctx.fillStyle = rgba(c, 0.3); ctx.fill(); ctx.strokeStyle = 'rgba(60,56,50,0.15)'; ctx.stroke(); });
      }
      grime(ctx, w, h, r, 0.3, [70, 66, 54], 3);
      drips(ctx, w, h, r, 6, [110, 70, 40], 0.12, { minLen: 0.1, maxLen: 0.4, width: 4 });
      const lines = [];
      for (let k = 0; k < 6; k++) lines.push(...crackLines(r, r() * w, r() * h, 90 + r() * 220, r() * TAU, 5, 0.07));
      drawCracks(ctx, w, h, lines, [34, 30, 26], 0.75, 1.6, 0.16);
      speck(ctx, w, h, r, 1600, [[60, 56, 50], [190, 186, 176]], 1.3, 0.35);
      grainPass(ctx, w, h, r, 0.05);
    },
  });
  define('brick', {
    size: 1, mat: { roughness: 0.93 },
    gen(ctx, w, h, r) {
      const rows = 12, cols = 4, bh = h / rows, bw = w / cols, m = 5;
      ctx.fillStyle = '#857f73'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 32, oct: 3 }), 0.35);
      const pal = ['#74483a', '#6a4436', '#7e5243', '#5d3b31', '#855a47', '#694a3f', '#77503d', '#5a4036'];
      const bricks = [];
      for (let row = 0; row < rows; row++) {
        const off = (row % 2) * bw / 2;
        for (let c = -1; c < cols; c++) {
          const x = c * bw + off, y = row * bh;
          const col = vary(pickr(pal, r), r, 0.22);
          bricks.push({ x, y, col });
          wrapAt(w, h, x + bw / 2, y + bh / 2, bw, (X, Y) => {
            const x0 = X - bw / 2 + m / 2, y0 = Y - bh / 2 + m / 2;
            ctx.fillStyle = rgba(col); ctx.fillRect(x0, y0, bw - m, bh - m);
            // soot/weather gradient per brick
            const g = ctx.createLinearGradient(x0, y0, x0, y0 + bh - m);
            g.addColorStop(0, 'rgba(255,240,220,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
            ctx.fillStyle = g; ctx.fillRect(x0, y0, bw - m, bh - m);
          });
        }
      }
      modulate(ctx, w, h, fbm(w, h, r, { cells: 16, oct: 4, gain: 0.6 }), 0.3);
      // chips on brick corners, efflorescence
      for (let k = 0; k < 40; k++) blotch(ctx, w, h, r() * w, r() * h, 3 + r() * 5, [133, 127, 115], 0.6);
      for (let k = 0; k < 8; k++) blotch(ctx, w, h, r() * w, r() * h, 20 + r() * 40, [215, 210, 196], 0.12);
      grime(ctx, w, h, r, 0.4, [38, 32, 28], 2);
      drips(ctx, w, h, r, 8, [30, 28, 24], 0.12, { minLen: 0.2, maxLen: 0.7, width: 6 });
      grainPass(ctx, w, h, r, 0.05);
      // height: bricks raised, mortar recessed
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#202020'; bx.fillRect(0, 0, w, h);
      for (const k of bricks) wrapAt(w, h, k.x + bw / 2, k.y + bh / 2, bw, (X, Y) => {
        bx.fillStyle = '#b8b8b8'; bx.fillRect(X - bw / 2 + m / 2 + 1, Y - bh / 2 + m / 2 + 1, bw - m - 2, bh - m - 2);
        bx.fillStyle = '#d8d8d8'; bx.fillRect(X - bw / 2 + m / 2 + 3, Y - bh / 2 + m / 2 + 3, bw - m - 6, bh - m - 6);
      });
      modulate(bx, w, h, fbm(w, h, r, { cells: 32, oct: 3 }), 0.3);
      return { bump: b, bumpScale: 2.2 };
    },
  });
  define('concrete', {
    size: 2, mat: { roughness: 0.9, bump: 0.8 },
    gen(ctx, w, h, r, o) { concreteBase(ctx, w, h, r, o.color || '#8d8b85'); grainPass(ctx, w, h, r, 0.045); },
  });
  function concreteBase(ctx, w, h, r, base) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 5, gain: 0.55 }), 0.2);
    modulate(ctx, w, h, fbm(w, h, r, { cells: 48, oct: 3, gain: 0.6 }), 0.14);
    speck(ctx, w, h, r, 2600, [[70, 68, 64], [150, 148, 142], [110, 104, 96]], 1.4, 0.4);
    speck(ctx, w, h, r, 500, [[30, 30, 28]], 1.6, 0.4);
    for (let k = 0; k < 3; k++) blotch(ctx, w, h, r() * w, r() * h, 30 + r() * 60, [40, 38, 34], 0.16);
    grime(ctx, w, h, r, 0.25, [52, 50, 44], 2);
    const lines = [];
    for (let k = 0; k < 2; k++) lines.push(...crackLines(r, r() * w, r() * h, 80 + r() * 160, r() * TAU, 6, 0.05));
    drawCracks(ctx, w, h, lines, [36, 34, 30], 0.6, 1.2, 0.1);
  }
  define('concrete_wet', {
    size: 2, mat: { roughness: 1, metalness: 0.02, bump: 0.5 },
    gen(ctx, w, h, r) {
      concreteBase(ctx, w, h, r, '#5c5d59');
      const n = fbm(w, h, r, { cells: 3, oct: 5, gain: 0.55 });
      const wetK = (v) => 1 - 0.3 * U.smooth((v - 0.5) / 0.14);
      pix(ctx, w, h, (d, i, x, y, p) => { const t = wetK(n[p]); d[i] *= t; d[i + 1] *= t * 1.01; d[i + 2] *= t * 1.02; });
      grainPass(ctx, w, h, r, 0.04);
      const rc = mk(w, h), rx = ctxOf(rc);
      rx.fillStyle = '#000'; rx.fillRect(0, 0, w, h);
      pix(rx, w, h, (d, i, x, y, p) => { const v = U.lerp(150, 22, U.smooth((n[p] - 0.48) / 0.14)); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
      return { rough: rc };
    },
  });

  // --- ground ---
  define('bitumen', {
    size: 3, mat: { roughness: 1, bump: 0.8 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = o.dry ? '#3c3d3c' : '#2f3131'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 5, gain: 0.55 }), 0.3);
      speck(ctx, w, h, r, 9000, [[92, 92, 90], [70, 70, 68], [120, 118, 112], [20, 20, 20]], 1.6, 0.5);
      // sealed cracks (tar snakes)
      const lines = [];
      for (let k = 0; k < 5; k++) lines.push(...crackLines(r, r() * w, r() * h, 120 + r() * 260, r() * TAU, 7, 0.05));
      tiled(ctx, w, h, () => {
        for (const l of lines) {
          ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.strokeStyle = 'rgba(8,9,9,0.65)'; ctx.lineWidth = 4 + l.depth; ctx.lineJoin = 'round'; ctx.stroke();
        }
      });
      // patch repairs
      for (let k = 0; k < 2; k++) {
        const pw = 60 + r() * 120, ph = 40 + r() * 90, x = r() * w, y = r() * h;
        wrapAt(w, h, x, y, Math.max(pw, ph), (X, Y) => {
          ctx.fillStyle = 'rgba(20,21,21,0.45)'; ctx.fillRect(X - pw / 2, Y - ph / 2, pw, ph);
          ctx.strokeStyle = 'rgba(80,80,78,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(X - pw / 2, Y - ph / 2, pw, ph);
        });
      }
      for (let k = 0; k < 2; k++) blotch(ctx, w, h, r() * w, r() * h, 25 + r() * 40, [8, 8, 10], 0.35);
      // faded line markings
      const lines2 = o.lines || 'none';
      const paint = o.lineColor === 'yellow' ? [196, 170, 70] : [205, 204, 196];
      const paintMask = mk(w, h), pm = ctxOf(paintMask);
      pm.fillStyle = rgba(paint, 1);
      if (lines2 === 'center') pm.fillRect(w / 2 - 7, h * 0.05, 14, h * 0.5);
      if (lines2 === 'double') { pm.fillRect(w / 2 - 20, 0, 12, h); pm.fillRect(w / 2 + 8, 0, 12, h); }
      if (lines2 === 'edge') pm.fillRect(w * 0.06, 0, 16, h);
      if (lines2 === 'solid') pm.fillRect(w / 2 - 7, 0, 14, h);
      if (lines2 === 'crossing') for (let k = 0; k < 4; k++) pm.fillRect(k * w / 4 + w / 16, 0, w / 8, h);
      if (lines2 === 'stop') pm.fillRect(0, h / 2 - 18, w, 36);
      if (lines2 === 'parking') { pm.fillRect(0, 0, 10, h); pm.fillRect(0, h - 10, w, 10); }
      if (lines2 !== 'none') {
        const wear = fbm(w, h, r, { cells: 8, oct: 4 });
        pix(pm, w, h, (d, i, x, y, p) => { d[i + 3] = d[i + 3] * Math.max(0, Math.min(1, (wear[p] - 0.28) * 2.2)) * (0.55 + r() * 0.3); });
        ctx.drawImage(paintMask, 0, 0);
      }
      // wet sheen: darker, smoother patches
      const wet = fbm(w, h, r, { cells: 3, oct: 4, gain: 0.55 });
      if (!o.dry) pix(ctx, w, h, (d, i, x, y, p) => { const t = 1 - 0.26 * U.smooth((wet[p] - 0.45) / 0.2); d[i] *= t; d[i + 1] *= t; d[i + 2] *= t * 1.02; });
      grainPass(ctx, w, h, r, 0.05);
      const rc = mk(w, h), rx = ctxOf(rc);
      rx.drawImage(paintMask, 0, 0);
      pix(rx, w, h, (d, i, x, y, p) => {
        let v = o.dry ? 230 : U.lerp(185, 26, U.smooth((wet[p] - 0.42) / 0.2));
        if (d[i + 3] > 40) v = Math.max(v, 170);
        d[i] = d[i + 1] = d[i + 2] = c255(v); d[i + 3] = 255;
      });
      return { rough: rc };
    },
  });
  define('gravel', {
    size: 1.5, mat: { roughness: 0.95, bump: 1.6 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#58534a'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 4 }), 0.3);
      const pal = ['#8a857b', '#77736b', '#9a948a', '#6b655b', '#857a6a', '#5f5c56', '#a29d92'];
      for (let k = 0; k < 2600; k++) {
        const x = r() * w, y = r() * h, s = 2.5 + r() * 6, a = r() * Math.PI, c = vary(pickr(pal, r), r, 0.25);
        wrapAt(w, h, x, y, s + 2, (X, Y) => {
          ctx.fillStyle = 'rgba(20,18,16,0.5)'; ctx.beginPath(); ctx.ellipse(X + 1.2, Y + 1.4, s, s * 0.72, a, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.ellipse(X, Y, s, s * 0.72, a, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,245,0.14)'; ctx.beginPath(); ctx.ellipse(X - s * 0.25, Y - s * 0.25, s * 0.45, s * 0.3, a, 0, TAU); ctx.fill();
        });
      }
      grime(ctx, w, h, r, 0.3, [40, 36, 30], 3);
      grainPass(ctx, w, h, r, 0.06);
    },
  });
  define('footpath', {
    size: 1.2, mat: { roughness: 0.9 },
    gen(ctx, w, h, r) {
      concreteBase(ctx, w, h, r, '#9a978f');
      const n = 2, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '30,28,24'},${0.03 + r() * 0.06})`;
        ctx.fillRect(i * s, j * s, s, s);
      }
      // gum spots and faint leaf stains
      speck(ctx, w, h, r, 40, [[40, 40, 38], [70, 68, 64]], 5, 0.5);
      for (let k = 0; k < 18; k++) {
        const x = r() * w, y = r() * h, L = 14 + r() * 26, a = r() * TAU;
        wrapAt(w, h, x, y, L, (X, Y) => { ctx.save(); ctx.translate(X, Y); ctx.rotate(a); ctx.fillStyle = 'rgba(92,70,48,0.13)'; ctx.beginPath(); ctx.ellipse(0, 0, L, L * 0.2, 0, 0, TAU); ctx.fill(); ctx.restore(); });
      }
      grime(ctx, w, h, r, 0.3, [60, 56, 48], 4);
      // expansion joints (dirty)
      ctx.fillStyle = 'rgba(30,28,26,0.85)';
      for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 2, 0, 4, h); ctx.fillRect(0, i * s - 2, w, 4); }
      ctx.fillStyle = 'rgba(60,54,44,0.25)';
      for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 7, 0, 14, h); ctx.fillRect(0, i * s - 7, w, 14); }
      const lines = crackLines(r, r() * w, r() * h, 160, r() * TAU, 6, 0.1);
      drawCracks(ctx, w, h, lines, [30, 28, 24], 0.7, 1.4, 0.12);
      grainPass(ctx, w, h, r, 0.04);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#c0c0c0'; bx.fillRect(0, 0, w, h);
      bx.fillStyle = '#303030';
      for (let i = 0; i <= n; i++) { bx.fillRect(i * s - 3, 0, 6, h); bx.fillRect(0, i * s - 3, w, 6); }
      return { bump: b, bumpScale: 1.5 };
    },
  });
  define('kerb', {
    size: 1, px: 256, mat: { roughness: 0.9, bump: 0.8 },
    gen(ctx, w, h, r) {
      concreteBase(ctx, w, h, r, '#9c9990');
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,250,0.10)'); g.addColorStop(0.34, 'rgba(255,255,250,0.10)');
      g.addColorStop(0.36, 'rgba(0,0,0,0.25)'); g.addColorStop(0.38, 'rgba(0,0,0,0.05)');
      g.addColorStop(0.72, 'rgba(0,0,0,0.18)'); g.addColorStop(0.75, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(10,10,8,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // gutter leaf litter and silt
      for (let k = 0; k < 40; k++) blotch(ctx, w, h, r() * w, h * (0.8 + r() * 0.2), 4 + r() * 10, [70, 56, 38], 0.35);
      ctx.fillStyle = 'rgba(20,20,18,0.8)'; ctx.fillRect(0, 0, 3, h * 0.75);
      drips(ctx, w, h, r, 8, [40, 40, 36], 0.15, { minLen: 0.1, maxLen: 0.3, width: 3 });
      grainPass(ctx, w, h, r, 0.05);
    },
  });

  // --- floors ---
  define('lino', {
    size: 2, mat: { roughness: 1, bump: 0.2 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = o.color || '#8c9186'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.12);
      const fl = [[120, 124, 114], [66, 70, 64], [168, 160, 140], [40, 42, 40], [150, 156, 146]];
      for (let k = 0; k < 5200; k++) {
        const x = r() * w, y = r() * h, s = 1 + r() * 3.2;
        ctx.fillStyle = rgba(pickr(fl, r), 0.35 + r() * 0.4);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + r() * s); ctx.lineTo(x + r() * s, y + s); ctx.fill();
      }
      grime(ctx, w, h, r, 0.3, [52, 50, 42], 3);
      scuffs(ctx, w, h, r, 34, [26, 26, 24], 0.35, 22);
      scuffs(ctx, w, h, r, 20, [210, 210, 200], 0.1, 60);
      grainPass(ctx, w, h, r, 0.035);
      const rc = mk(w, h), rx = ctxOf(rc), n = fbm(w, h, r, { cells: 4, oct: 4 });
      rx.fillStyle = '#000'; rx.fillRect(0, 0, w, h);
      pix(rx, w, h, (d, i, x, y, p) => { d[i] = d[i + 1] = d[i + 2] = 110 + n[p] * 90; d[i + 3] = 255; });
      return { rough: rc };
    },
  });
  define('lino_hospital', {
    size: 2, mat: { roughness: 0.42, bump: 0.15 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#a7b3a6'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.08);
      speck(ctx, w, h, r, 3200, [[140, 150, 140], [196, 204, 194], [120, 128, 118]], 2, 0.35);
      // heat-welded seams
      ctx.fillStyle = 'rgba(70,82,74,0.5)'; ctx.fillRect(0, 0, 3, h);
      ctx.fillStyle = 'rgba(210,220,210,0.4)'; ctx.fillRect(1, 0, 1, h);
      scuffs(ctx, w, h, r, 16, [40, 44, 40], 0.25, 26);
      grime(ctx, w, h, r, 0.18, [90, 96, 84], 2);
      grainPass(ctx, w, h, r, 0.025);
    },
  });
  function tileGrid(ctx, w, h, r, n, { base, grout, gw = 4, varAmt = 0.08 }) {
    ctx.fillStyle = rgba(grout); ctx.fillRect(0, 0, w, h);
    const s = w / n, tiles = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = vary(base, r, varAmt);
      ctx.fillStyle = rgba(c); ctx.fillRect(i * s + gw / 2, j * s + gw / 2, s - gw, s - gw);
      const g = ctx.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = g; ctx.fillRect(i * s + gw / 2, j * s + gw / 2, s - gw, s - gw);
      tiles.push({ x: i * s, y: j * s });
    }
    return { s, tiles };
  }
  define('tile', {
    size: 1.2, mat: { roughness: 1 },
    gen(ctx, w, h, r) {
      const { s, tiles } = tileGrid(ctx, w, h, r, 4, { base: '#a39e91', grout: '#5f5b53', gw: 5 });
      speck(ctx, w, h, r, 2500, [[120, 116, 106], [170, 166, 156], [90, 86, 80]], 1.6, 0.35);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 4 }), 0.14);
      grime(ctx, w, h, r, 0.35, [60, 54, 44], 3);
      // grime in grout lines
      ctx.fillStyle = 'rgba(40,36,30,0.25)';
      for (let i = 0; i <= 4; i++) { ctx.fillRect(i * s - 4, 0, 8, h); ctx.fillRect(0, i * s - 4, w, 8); }
      const t = tiles[Math.floor(r() * tiles.length)];
      drawCracks(ctx, w, h, crackLines(r, t.x + s * 0.2, t.y + s * 0.3, s * 0.9, 0.4, 5, 0.1), [30, 28, 24], 0.7, 1.2, 0.2);
      scuffs(ctx, w, h, r, 20, [30, 30, 26], 0.25, 24);
      grainPass(ctx, w, h, r, 0.035);
      const rc = mk(w, h), rx = ctxOf(rc);
      rx.fillStyle = '#e6e6e6'; rx.fillRect(0, 0, w, h);
      rx.fillStyle = '#5a5a5a'; for (const q of tiles) rx.fillRect(q.x + 3, q.y + 3, s - 6, s - 6);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#303030'; bx.fillRect(0, 0, w, h);
      bx.fillStyle = '#c8c8c8'; for (const q of tiles) bx.fillRect(q.x + 3, q.y + 3, s - 6, s - 6);
      return { rough: rc, bump: b, bumpScale: 1.2 };
    },
  });
  define('tile_white', {
    size: 0.6, mat: { roughness: 1 },
    gen(ctx, w, h, r) {
      const { s, tiles } = tileGrid(ctx, w, h, r, 4, { base: '#d9d8d1', grout: '#a19e94', gw: 4, varAmt: 0.04 });
      for (const q of tiles) {
        const g = ctx.createRadialGradient(q.x + s * 0.3, q.y + s * 0.3, 0, q.x + s * 0.3, q.y + s * 0.3, s * 0.8);
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(q.x + 2, q.y + 2, s - 4, s - 4);
      }
      grime(ctx, w, h, r, 0.25, [150, 140, 110], 2);
      ctx.fillStyle = 'rgba(120,104,70,0.18)';
      for (let i = 0; i <= 4; i++) { ctx.fillRect(i * s - 3, 0, 6, h); ctx.fillRect(0, i * s - 3, w, 6); }
      const t = tiles[Math.floor(r() * tiles.length)];
      drawCracks(ctx, w, h, crackLines(r, t.x + s * 0.1, t.y + s * 0.6, s * 0.8, -0.3, 4, 0.12), [70, 66, 60], 0.6, 1, 0.3);
      grainPass(ctx, w, h, r, 0.025);
      const rc = mk(w, h), rx = ctxOf(rc);
      rx.fillStyle = '#e0e0e0'; rx.fillRect(0, 0, w, h);
      rx.fillStyle = '#2c2c2c'; for (const q of tiles) rx.fillRect(q.x + 3, q.y + 3, s - 6, s - 6);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#404040'; bx.fillRect(0, 0, w, h);
      bx.fillStyle = '#d0d0d0'; for (const q of tiles) bx.fillRect(q.x + 2, q.y + 2, s - 4, s - 4);
      return { rough: rc, bump: b, bumpScale: 0.9 };
    },
  });
  function carpetTiles(ctx, w, h, r, { base = '#4a5058', dark = 0.9, fleck = [[88, 110, 116], [120, 124, 130], [36, 40, 46]] } = {}) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const n = 2, s = w / n;
    // loop pile: high-frequency noise
    const hf = vnoise(w, h, w / 2, h / 2, r);
    pix(ctx, w, h, (d, i, x, y, p) => {
      const tx = Math.floor(x / s), ty = Math.floor(y / s), quarter = (tx + ty) % 2;
      const rib = quarter ? (x % 3 === 0 ? 0.92 : 1.02) : (y % 3 === 0 ? 0.92 : 1.02);
      const k = (0.85 + hf[p] * 0.3) * rib * (quarter ? dark : 1);
      d[i] = c255(d[i] * k); d[i + 1] = c255(d[i + 1] * k); d[i + 2] = c255(d[i + 2] * k);
    });
    speck(ctx, w, h, r, 5000, fleck, 1.4, 0.45);
    return s;
  }
  define('carpet', {
    size: 1, mat: { roughness: 0.98, bump: 0.35 },
    gen(ctx, w, h, r, o) {
      const s = carpetTiles(ctx, w, h, r, { base: o.color || '#4a5058' });
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.22);
      // traffic wear and coffee stains
      grime(ctx, w, h, r, 0.3, [40, 36, 30], 2);
      for (let k = 0; k < 3; k++) {
        const x = r() * w, y = r() * h, rad = 10 + r() * 22;
        blotch(ctx, w, h, x, y, rad, [70, 50, 30], 0.3);
        wrapAt(w, h, x, y, rad, (X, Y) => { ctx.strokeStyle = 'rgba(60,40,24,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, rad * 0.7, 0, TAU); ctx.stroke(); });
      }
      ctx.fillStyle = 'rgba(15,16,18,0.45)';
      for (let i = 0; i <= 2; i++) { ctx.fillRect(i * s - 1, 0, 2, h); ctx.fillRect(0, i * s - 1, w, 2); }
      grainPass(ctx, w, h, r, 0.05);
    },
  });
  define('vinyl_retail', {
    size: 2.4, mat: { roughness: 1, bump: 0.15 },
    gen(ctx, w, h, r, o) {
      const base = o.color || '#bdb8ad', rows = 12, ph = h / rows, pw = w / 2;
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < rows; row++) {
        const off = r() * pw;
        for (let c = -1; c < 2; c++) {
          const x = off + c * pw, col = vary(base, r, 0.08);
          wrapAt(w, h, x + pw / 2, row * ph + ph / 2, pw, (X, Y) => {
            ctx.fillStyle = rgba(col); ctx.fillRect(X - pw / 2, Y - ph / 2, pw, ph);
            ctx.fillStyle = 'rgba(70,64,56,0.35)'; ctx.fillRect(X - pw / 2, Y - ph / 2, 1.5, ph); ctx.fillRect(X - pw / 2, Y - ph / 2, pw, 1.2);
          });
        }
      }
      // faint grain stretched along the planks
      const g = fbm(w, h, r, { cells: 2, cy: 48, oct: 3 });
      modulate(ctx, w, h, g, 0.12);
      scuffs(ctx, w, h, r, 26, [60, 56, 50], 0.22, 20);
      grainPass(ctx, w, h, r, 0.02);
      const rc = mk(w, h), rx = ctxOf(rc), n = fbm(w, h, r, { cells: 3, oct: 3 });
      pix(rx, w, h, (d, i, x, y, p) => { d[i] = d[i + 1] = d[i + 2] = 30 + n[p] * 40; d[i + 3] = 255; });
      scuffs(rx, w, h, r, 30, [160, 160, 160], 0.6, 24);
      return { rough: rc };
    },
  });

  // --- timber ---
  function woodGrain(ctx, w, h, r, c0, c1, { rings = 7, warp = 1.4, streak = 0.25 } = {}) {
    const n = fbm(w, h, r, { cells: 2, cy: 3, oct: 4 });
    const f = fbm(w, h, r, { cells: 2, cy: 64, oct: 3 });
    c0 = hex(c0); c1 = hex(c1);
    pix(ctx, w, h, (d, i, x, y, p) => {
      const t = (y / h) * rings + n[p] * warp;
      let ring = t - Math.floor(t); ring = Math.pow(Math.min(ring, 1 - ring) * 2, 0.6);
      const k = ring * 0.8 + f[p] * streak;
      d[i] = c0[0] + (c1[0] - c0[0]) * k; d[i + 1] = c0[1] + (c1[1] - c0[1]) * k; d[i + 2] = c0[2] + (c1[2] - c0[2]) * k; d[i + 3] = 255;
    });
  }
  define('wood', {
    size: 1, mat: { roughness: 0.75, bump: 0.3 },
    gen(ctx, w, h, r, o) {
      woodGrain(ctx, w, h, r, o.dark || '#46352a', o.light || '#72593f');
      speck(ctx, w, h, r, 300, [[30, 22, 16]], 1.5, 0.3);
      scuffs(ctx, w, h, r, 20, [200, 180, 150], 0.08, 30);
      grime(ctx, w, h, r, 0.18, [30, 24, 18], 2);
      grainPass(ctx, w, h, r, 0.03);
    },
  });
  define('weatherboard', {
    size: 1.2, mat: { roughness: 0.85 },
    gen(ctx, w, h, r, o) {
      const boards = 8, bh = h / boards, paint = hex(o.paint || '#d6d1c3');
      ctx.fillStyle = rgba(paint); ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.12);
      const peel = fbm(w, h, r, { cells: 6, oct: 5, gain: 0.6 });
      const wood = mk(w, h), wx = ctxOf(wood);
      woodGrain(wx, w, h, r, '#5d574c', '#8a8274', { rings: 30, warp: 2 });
      const wd = wx.getImageData(0, 0, w, h).data;
      pix(ctx, w, h, (d, i, x, y, p) => {
        const v = peel[p];
        if (v > 0.66) { d[i] = wd[i]; d[i + 1] = wd[i + 1]; d[i + 2] = wd[i + 2]; } else if (v > 0.63) { d[i] *= 0.6; d[i + 1] *= 0.6; d[i + 2] *= 0.58; }
        const fy = (y % bh) / bh;
        const k = fy < 0.1 ? 0.55 + fy * 3 : 1.04 - fy * 0.16;
        d[i] = c255(d[i] * k); d[i + 1] = c255(d[i + 1] * k); d[i + 2] = c255(d[i + 2] * k);
      });
      for (let b = 0; b < boards; b++) {
        const jx = r() * w;
        ctx.fillStyle = 'rgba(40,36,30,0.5)'; ctx.fillRect(jx, b * bh, 2, bh);
        ctx.fillStyle = 'rgba(60,54,44,0.5)'; ctx.fillRect((jx + 5) % w, b * bh + bh * 0.5, 2, 2); ctx.fillRect((jx - 5 + w) % w, b * bh + bh * 0.5, 2, 2);
      }
      drips(ctx, w, h, r, 16, [70, 64, 50], 0.15, { minLen: 0.1, maxLen: 0.5, width: 3 });
      grime(ctx, w, h, r, 0.3, [60, 56, 44], 2);
      grainPass(ctx, w, h, r, 0.035);
      const b2 = mk(w, h), bx = ctxOf(b2);
      for (let b = 0; b < boards; b++) {
        const g = bx.createLinearGradient(0, b * bh, 0, b * bh + bh);
        g.addColorStop(0, '#202020'); g.addColorStop(0.08, '#707070'); g.addColorStop(1, '#e0e0e0');
        bx.fillStyle = g; bx.fillRect(0, b * bh, w, bh);
      }
      return { bump: b2, bumpScale: 2.5 };
    },
  });
  define('timber_floor', {
    size: 1.2, mat: { roughness: 0.62 },
    gen(ctx, w, h, r) {
      const n = 12, bw = w / n, boards = [];
      const pal = ['#6e5641', '#7a5f45', '#5f4a38', '#836649', '#6a5241'];
      for (let i = 0; i < n; i++) {
        let y = r() * h;
        const segs = 1 + Math.floor(r() * 2);
        for (let s = 0; s < segs; s++) {
          const len = h / segs, c = vary(pickr(pal, r), r, 0.15);
          boards.push({ x: i * bw, y, len, c });
          y += len;
        }
      }
      const grainC = mk(w, h), gx = ctxOf(grainC);
      woodGrain(gx, h, w, r, '#000000', '#ffffff', { rings: 26, warp: 3, streak: 0.4 });
      for (const b of boards) wrapAt(w, h, b.x + bw / 2, b.y + b.len / 2, Math.max(bw, b.len), (X, Y) => {
        ctx.fillStyle = rgba(b.c); ctx.fillRect(X - bw / 2, Y - b.len / 2, bw, b.len);
        ctx.fillStyle = 'rgba(20,14,10,0.7)'; ctx.fillRect(X - bw / 2, Y - b.len / 2, bw, 1.5);
        ctx.fillStyle = 'rgba(20,14,10,0.6)'; ctx.fillRect(X - bw / 2 + 6, Y - b.len / 2 + 7, 2, 2); ctx.fillRect(X + bw / 2 - 8, Y - b.len / 2 + 7, 2, 2);
      });
      ctx.save(); ctx.globalAlpha = 0.18; ctx.globalCompositeOperation = 'overlay';
      ctx.translate(w, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(grainC, 0, 0); ctx.restore();
      ctx.fillStyle = 'rgba(10,8,6,0.75)'; for (let i = 0; i < n; i++) ctx.fillRect(i * bw, 0, 1.6, h);
      grime(ctx, w, h, r, 0.3, [36, 28, 20], 3);
      scuffs(ctx, w, h, r, 30, [180, 160, 130], 0.1, 30);
      grainPass(ctx, w, h, r, 0.03);
      const b2 = mk(w, h), bx = ctxOf(b2);
      bx.fillStyle = '#c0c0c0'; bx.fillRect(0, 0, w, h);
      bx.fillStyle = '#303030'; for (let i = 0; i < n; i++) bx.fillRect(i * bw - 1, 0, 3, h);
      for (const b of boards) wrapAt(w, h, b.x + bw / 2, b.y, bw, (X, Y) => bx.fillRect(X - bw / 2, Y - 1, bw, 2));
      return { bump: b2, bumpScale: 1.2 };
    },
  });

  // --- metal ---
  define('metal', {
    size: 1, px: 256, mat: { roughness: 0.48, metalness: 0.55, bump: 0.2 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = o.color || '#8a8d8e'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 2, cy: 64, oct: 3 }), 0.18);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.18);
      scuffs(ctx, w, h, r, 60, [220, 222, 224], 0.2, 30);
      scuffs(ctx, w, h, r, 20, [30, 30, 30], 0.2, 16);
      grime(ctx, w, h, r, 0.3, [40, 40, 38], 2);
      grainPass(ctx, w, h, r, 0.03);
    },
  });
  define('metal_rust', {
    size: 1, px: 256, mat: { roughness: 0.82, metalness: 0.3, bump: 0.8 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = o.paint || '#66706a'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.16);
      const n = fbm(w, h, r, { cells: 4, oct: 5, gain: 0.6 });
      const rust = [[112, 66, 36], [86, 50, 30], [132, 84, 46], [60, 38, 26]];
      pix(ctx, w, h, (d, i, x, y, p) => {
        const v = n[p];
        if (v > 0.6) { const c = rust[(x * 7 + y * 13) % 4]; const t = Math.min(1, (v - 0.6) * 6); d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t; } else if (v > 0.56) { d[i] *= 0.8; d[i + 1] *= 0.78; d[i + 2] *= 0.76; }
      });
      drips(ctx, w, h, r, 14, [110, 64, 34], 0.22, { minLen: 0.1, maxLen: 0.6, width: 4 });
      speck(ctx, w, h, r, 400, [[60, 34, 20], [140, 90, 50]], 1.5, 0.5);
      grainPass(ctx, w, h, r, 0.04);
    },
  });
  define('metal_grating', {
    size: 0.5, px: 256, alpha: true, mat: { roughness: 0.6, metalness: 0.5, alphaTest: 0.5, side: 'double' },
    gen(ctx, w, h, r) {
      ctx.clearRect(0, 0, w, h);
      const sp = 16, cs = 32;
      for (let x = 0; x < w; x += sp) {
        const g = ctx.createLinearGradient(x, 0, x + 5, 0);
        g.addColorStop(0, '#5a5e5f'); g.addColorStop(0.5, '#9a9ea0'); g.addColorStop(1, '#474a4b');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 5, h);
      }
      for (let y = 0; y < h; y += cs) { ctx.fillStyle = '#6d7173'; ctx.fillRect(0, y, w, 3.5); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + 3.5, w, 1); }
      ctx.globalCompositeOperation = 'source-atop';
      grime(ctx, w, h, r, 0.5, [70, 50, 30], 3);
      speck(ctx, w, h, r, 300, [[110, 70, 40]], 2, 0.5);
      ctx.globalCompositeOperation = 'source-over';
    },
  });
  define('chainlink', {
    size: 0.5, px: 256, alpha: true, mat: { roughness: 0.55, metalness: 0.6, alphaTest: 0.45, side: 'double' },
    gen(ctx, w, h, r) {
      ctx.clearRect(0, 0, w, h);
      const n = 8, s = w / n;
      tiled(ctx, w, h, () => {
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 1.1 : 3;
          ctx.strokeStyle = pass ? 'rgba(222,226,224,0.75)' : '#7a807e';
          const o = pass ? -0.7 : 0;
          for (let i = -n; i <= n * 2; i++) {
            // wires bend at each crossing (slight kink) like woven chain-link
            ctx.beginPath();
            for (let j = 0; j <= n; j++) { const x = i * s + j * s + o, y = j * s + o + (j % 2 ? 1.2 : -1.2); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.beginPath();
            for (let j = 0; j <= n; j++) { const x = i * s - j * s + o, y = j * s + o + (j % 2 ? -1.2 : 1.2); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#8d9391';
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { ctx.beginPath(); ctx.arc(i * s, j * s, 2.2, 0, TAU); ctx.fill(); }
      });
      ctx.globalCompositeOperation = 'source-atop';
      grime(ctx, w, h, r, 0.4, [60, 50, 40], 2);
      ctx.globalCompositeOperation = 'source-over';
    },
  });
  define('grille', {
    size: 0.5, px: 256, mat: { roughness: 0.55, metalness: 0.5, bump: 0.8 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = '#3b3e40'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 3 }), 0.2);
      const n = 16, s = w / n;
      if (o.alpha) ctx.globalCompositeOperation = 'destination-out';
      for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) {
        const x = i * s + (j % 2 ? s / 2 : 0), y = j * s + s / 2;
        ctx.fillStyle = o.alpha ? '#000' : '#050606';
        ctx.beginPath(); ctx.arc(x % (w + s / 2), y, s * 0.3, 0, TAU); ctx.fill();
        if (!o.alpha) { ctx.strokeStyle = 'rgba(200,204,206,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y + 0.8, s * 0.32, 0.2, Math.PI - 0.2); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  });
  define('ceiling_tile', {
    size: 1.2, mat: { roughness: 0.96, bump: 0.5 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#c3bfb3'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 4 }), 0.08);
      // fissures and pinholes
      for (let k = 0; k < 1800; k++) {
        const x = r() * w, y = r() * h, L = 2 + r() * 7, a = r() * TAU;
        ctx.strokeStyle = `rgba(80,76,66,${0.12 + r() * 0.25})`; ctx.lineWidth = 0.8 + r();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 1) * L, y + Math.sin(a + 1) * L, x + Math.cos(a) * L * 1.4, y + Math.sin(a) * L * 1.4); ctx.stroke();
      }
      speck(ctx, w, h, r, 1600, [[70, 66, 58]], 1.2, 0.4);
      const n = 2, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const sag = ctx.createRadialGradient(i * s + s / 2, j * s + s / 2, 0, i * s + s / 2, j * s + s / 2, s * 0.7);
        sag.addColorStop(0, `rgba(40,36,30,${0.03 + r() * 0.08})`); sag.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sag; ctx.fillRect(i * s, j * s, s, s);
      }
      waterStain(ctx, w, h, r, s * (0.3 + r() * 0.4), s * (0.3 + r() * 0.4), 30 + r() * 40, 1.3);
      waterStain(ctx, w, h, r, s + s * (0.2 + r() * 0.6), s + s * (0.2 + r() * 0.6), 20 + r() * 50, 1);
      // T-bar grid
      for (let i = 0; i <= n; i++) {
        ctx.fillStyle = '#d9d7d0'; ctx.fillRect(i * s - 4, 0, 8, h); ctx.fillRect(0, i * s - 4, w, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(i * s + 4, 0, 2, h); ctx.fillRect(0, i * s + 4, w, 2);
      }
      grime(ctx, w, h, r, 0.2, [110, 100, 80], 3);
      grainPass(ctx, w, h, r, 0.03);
    },
  });

  // --- paper and card ---
  define('cardboard', {
    size: 0.6, px: 256, mat: { roughness: 0.92, bump: 0.3 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = '#977b58'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.12);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 128, cy: 16, oct: 2 }), 0.12);
      for (let y = 0; y < h; y += 6) { ctx.fillStyle = 'rgba(60,44,28,0.05)'; ctx.fillRect(0, y, w, 2); }
      speck(ctx, w, h, r, 500, [[70, 54, 36], [170, 150, 118]], 1.4, 0.4);
      if (o.print !== false) {
        // printed arrows and a faded code, low contrast so tiling is not obvious
        ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#2d241a';
        const ax = w * 0.18, ay = h * 0.2;
        for (let k = 0; k < 2; k++) {
          const x = ax + k * 26;
          ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x + 9, ay + 12); ctx.lineTo(x + 3, ay + 12); ctx.lineTo(x + 3, ay + 26); ctx.lineTo(x - 3, ay + 26); ctx.lineTo(x - 3, ay + 12); ctx.lineTo(x - 9, ay + 12); ctx.fill();
        }
        ctx.fillRect(ax - 12, ay + 30, 50, 3);
        text(ctx, 'THIS WAY UP', ax - 12, ay + 46, { size: 10, font: FONT.heavy, color: '#2d241a' });
        text(ctx, 'MDM-5G  QTY 4', w * 0.55, h * 0.78, { size: 11, font: FONT.mono, color: '#2d241a', weight: 'bold' });
        ctx.restore();
      }
      if (o.tape !== false) {
        const ty = h * 0.5 - 18;
        ctx.fillStyle = 'rgba(150,112,60,0.55)'; ctx.fillRect(0, ty, w, 36);
        ctx.fillStyle = 'rgba(255,240,210,0.12)'; ctx.fillRect(0, ty + 4, w, 6);
        ctx.fillStyle = 'rgba(60,40,20,0.25)'; ctx.fillRect(0, ty, w, 1); ctx.fillRect(0, ty + 35, w, 1);
      }
      grime(ctx, w, h, r, 0.2, [60, 44, 28], 2);
      grainPass(ctx, w, h, r, 0.03);
    },
  });
  function wetCard(ctx, w, h, r) {
    ctx.fillStyle = '#5f4630'; ctx.fillRect(0, 0, w, h);
    modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 5, gain: 0.6 }), 0.4);
    for (let y = 0; y < h; y += 7) { ctx.fillStyle = 'rgba(20,12,6,0.12)'; ctx.fillRect(0, y, w, 3); }
    for (let k = 0; k < 6; k++) waterStain(ctx, w, h, r, r() * w, r() * h, 20 + r() * 60, 2, [40, 26, 14]);
    for (let k = 0; k < 10; k++) blotch(ctx, w, h, r() * w, r() * h, 10 + r() * 40, [22, 14, 8], 0.35);
    speck(ctx, w, h, r, 600, [[150, 124, 90], [30, 34, 26]], 1.6, 0.4);
    drips(ctx, w, h, r, 18, [18, 12, 6], 0.2, { minLen: 0.1, maxLen: 0.5, width: 5 });
  }
  define('cardboard_wet', {
    size: 0.6, px: 256, mat: { roughness: 0.6, bump: 0.6 },
    gen(ctx, w, h, r) { wetCard(ctx, w, h, r); grainPass(ctx, w, h, r, 0.04); },
  });
  define('paper', {
    size: 0.3, px: 256, mat: { roughness: 0.9 },
    gen(ctx, w, h, r, o) {
      ctx.fillStyle = o.color || '#e4e0d3'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.06);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 64, oct: 2 }), 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(w / 2, 0, 1, h); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(w / 2 + 1, 0, 1, h);
      grime(ctx, w, h, r, 0.12, [150, 130, 90], 2);
      grainPass(ctx, w, h, r, 0.02);
    },
  });
  const RECEIPT_LINES = [
    'NBN MODEM 5G ........ $0.00', 'CONNECT FEE ......... $0.00', 'PLAN CHANGE ......... $0.00', 'SIM CARD ............ $2.00',
    'CASE CLEAR ......... $29.00', 'SCREEN GUARD ....... $39.00', '24M PLAN 180GB ..... $65.00', 'DEVICE PMT 36M ..... $52.50',
    'EFTPOS APPROVED', 'CUST SIG NOT REQ', 'THANK YOU', '- - - - - - - - - - - - -', 'ACCT 118-2231', 'RETURN WITHIN 30 DAYS',
    'FOLLOW UP ........... TMRW', 'TOTAL ............. $187.50', 'GST INCL ............ $17.05', 'SERVED BY: AIDAN',
  ];
  // Receipt paper strip. The printed lines repeat every `period` px (default h) so the strip tiles vertically.
  function receiptStrip(ctx, x, y, w, h, r, { fade = 1, ink = [60, 60, 58], period = 0 } = {}) {
    const size = Math.max(7, Math.round(w / 17)), P = period || h, items = [];
    let yy = size * 1.2;
    while (yy < P - size * 0.6) {
      const it = { y: yy, line: pickr(RECEIPT_LINES, r), a: (0.35 + r() * 0.45) * fade, bar: r() < 0.06 ? subSeed(r) : 0 };
      items.push(it);
      if (it.bar) yy += size * 2.5;
      yy += size * (1.3 + (r() < 0.15 ? 1 : 0));
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#ebe8df'; ctx.fillRect(x, y, w, h);
    for (let off = -P; off <= h + P; off += P) for (const it of items) {
      const Y = y + it.y + off;
      if (Y < y - size * 3 || Y > y + h + size) continue;
      text(ctx, it.line, x + w * 0.05, Y, { size, font: FONT.mono, color: rgba(ink, it.a), weight: 'bold' });
      if (it.bar) {
        const q = U.rng(it.bar);
        for (let bx = x + w * 0.1; bx < x + w * 0.9; bx += 2 + q() * 3) { ctx.fillStyle = rgba(ink, 0.5 * fade); ctx.fillRect(bx, Y + 3, 1 + q() * 2, size * 2); }
      }
    }
    ctx.restore();
  }
  define('receipt', {
    size: 0.16, px: 256, mat: { roughness: 0.7, side: 'double' },
    gen(ctx, w, h, r) {
      receiptStrip(ctx, 0, 0, w, h, r, { period: h });
      modulate(ctx, w, h, fbm(w, h, r, { cells: 2, oct: 3 }), 0.08);
      grime(ctx, w, h, r, 0.15, [170, 150, 110], 2);
      grainPass(ctx, w, h, r, 0.02);
    },
  });
  define('contracts', {
    size: 1, mat: { roughness: 0.9 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#141412'; ctx.fillRect(0, 0, w, h);
      const tabs = ['#e8c21a', '#1f6f6a', '#c95a6a', '#d8d4c4', '#8fb4c0'];
      const bumps = [];
      let y = 0;
      while (y < h) {
        let bh = 16 + Math.floor(r() * 44);
        if (y + bh > h - 10) bh = h - y;
        // each row: bundles of different widths side by side, slightly offset
        let x = -r() * 40;
        while (x < w) {
          const bw = 70 + r() * 150, off = (r() - 0.5) * 6, inset = 1 + r() * 2;
          const x0 = x + inset, y0 = y + 1 + Math.max(0, off), hh = bh - 2 - Math.abs(off), fs = subSeed(r);
          wrapX(w, x0 + bw / 2, bw, (X) => {
            const bx0 = X - bw / 2, r = U.rng(fs);
            const base = vary(r() < 0.8 ? '#d6d0bf' : '#c9c2ad', r, 0.08);
            ctx.fillStyle = rgba(base); ctx.fillRect(bx0, y0, bw - 3, hh);
            for (let ly = y0; ly < y0 + hh; ly += 1 + r() * 1.6) {
              ctx.fillStyle = `rgba(90,84,70,${0.12 + r() * 0.3})`; ctx.fillRect(bx0, ly, bw - 3, 0.7);
            }
            // shading: top edge light, bottom dark
            const g = ctx.createLinearGradient(0, y0, 0, y0 + hh);
            g.addColorStop(0, 'rgba(255,255,245,0.12)'); g.addColorStop(0.8, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = g; ctx.fillRect(bx0, y0, bw - 3, hh);
            // stray sheets poking out
            if (r() < 0.5) { const sy = y0 + r() * hh; ctx.fillStyle = 'rgba(236,232,220,0.9)'; ctx.fillRect(bx0 - 2 - r() * 6, sy, bw * (0.3 + r() * 0.6), 1.2); }
            // coloured flags and binder clips
            if (r() < 0.35) { ctx.fillStyle = pickr(tabs, r); ctx.fillRect(bx0 + r() * (bw - 20), y0 + r() * (hh - 6), 12 + r() * 8, 4); }
            if (r() < 0.2) {
              const cx = bx0 + 10 + r() * (bw - 30);
              ctx.fillStyle = '#111'; ctx.fillRect(cx, y0 - 1, 14, Math.min(10, hh * 0.6));
              ctx.strokeStyle = 'rgba(200,200,200,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + 3, y0); ctx.lineTo(cx + 5, y0 - 5); ctx.moveTo(cx + 11, y0); ctx.lineTo(cx + 9, y0 - 5); ctx.stroke();
            }
          });
          bumps.push({ x0, y0, bw, hh });
          x += bw;
        }
        y += bh;
      }
      grime(ctx, w, h, r, 0.45, [50, 44, 30], 2);
      drips(ctx, w, h, r, 10, [40, 34, 22], 0.2, { minLen: 0.1, maxLen: 0.5, width: 5 });
      grainPass(ctx, w, h, r, 0.04);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#101010'; bx.fillRect(0, 0, w, h);
      bx.fillStyle = '#c0c0c0';
      for (const q of bumps) wrapX(w, q.x0 + q.bw / 2, q.bw, (X) => bx.fillRect(X - q.bw / 2, q.y0, q.bw - 3, q.hh));
      return { bump: b, bumpScale: 2 };
    },
  });
  function drawCircuit(ctx, w, h, r, { base = '#15463a', trace = '#2a7658', pad = '#a88f4a' } = {}) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 4 }), 0.18);
    const g = 8, dirs = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1]];
    const traces = [];
    for (let k = 0; k < 90; k++) {
      let x = Math.floor(r() * w / g) * g, y = Math.floor(r() * h / g) * g;
      const pts = [[x, y]];
      let d = pickr(dirs, r);
      const segs = 2 + Math.floor(r() * 5);
      for (let s = 0; s < segs; s++) {
        const len = (2 + Math.floor(r() * 8)) * g;
        x += d[0] * len; y += d[1] * len; pts.push([x, y]);
        d = r() < 0.5 ? pickr(dirs.slice(0, 2), r) : pickr(dirs, r);
      }
      traces.push({ pts, wd: r() < 0.2 ? 4 : 2 });
    }
    tiled(ctx, w, h, () => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const t of traces) {
        ctx.beginPath(); t.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = rgba(trace, 0.9); ctx.lineWidth = t.wd; ctx.stroke();
        const e = t.pts[t.pts.length - 1];
        ctx.fillStyle = rgba(pad); ctx.beginPath(); ctx.arc(e[0], e[1], t.wd + 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0b1f19'; ctx.beginPath(); ctx.arc(e[0], e[1], 1.1, 0, TAU); ctx.fill();
      }
      // chips
      for (let k = 0; k < 7; k++) {
        const cw = 24 + Math.floor(r() * 5) * 8, ch = 16 + Math.floor(r() * 3) * 8, x = Math.floor(r() * w / g) * g, y = Math.floor(r() * h / g) * g;
        ctx.fillStyle = 'rgba(120,130,120,0.8)';
        for (let px = x + 3; px < x + cw - 2; px += 4) { ctx.fillRect(px, y - 3, 2, 3); ctx.fillRect(px, y + ch, 2, 3); }
        ctx.fillStyle = '#141616'; ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, cw, 2);
        ctx.fillStyle = 'rgba(200,200,190,0.35)'; ctx.beginPath(); ctx.arc(x + 4, y + 4, 1.5, 0, TAU); ctx.fill();
      }
      // SMD parts and silkscreen
      for (let k = 0; k < 40; k++) {
        const x = r() * w, y = r() * h, v = r() < 0.5;
        ctx.fillStyle = r() < 0.5 ? '#1b1b1a' : '#b7a37a'; ctx.fillRect(x, y, v ? 4 : 8, v ? 8 : 4);
        ctx.fillStyle = rgba(pad); ctx.fillRect(x - (v ? 0 : 2), y - (v ? 2 : 0), v ? 4 : 2, v ? 2 : 4);
      }
      ctx.font = `bold 8px ${FONT.mono}`; ctx.fillStyle = 'rgba(225,230,220,0.55)';
      for (let k = 0; k < 16; k++) ctx.fillText(pickr(['R', 'C', 'U', 'Q', 'TP', 'J', 'L'], r) + (1 + Math.floor(r() * 40)), r() * w, r() * h);
      ctx.strokeStyle = 'rgba(225,230,220,0.3)'; ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) ctx.strokeRect(Math.floor(r() * w / g) * g + 0.5, Math.floor(r() * h / g) * g + 0.5, 24 + r() * 40, 16 + r() * 24);
      // LEDs
      for (let k = 0; k < 5; k++) { const x = r() * w, y = r() * h; ctx.fillStyle = '#5a0c08'; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x - 1.5, y - 1, 3, 2); }
    });
    grainPass(ctx, w, h, r, 0.03);
    return traces;
  }
  define('circuit', {
    size: 1, mat: { roughness: 0.55, metalness: 0.15, bump: 0.6 },
    gen(ctx, w, h, r) { drawCircuit(ctx, w, h, r); grime(ctx, w, h, r, 0.3, [8, 16, 12], 3); },
  });
  define('circuit_carpet', {
    size: 1, mat: { roughness: 0.85, bump: 1.2 },
    gen(ctx, w, h, r) {
      drawCircuit(ctx, w, h, r);
      const carpet = mk(w, h), cx = ctxOf(carpet);
      carpetTiles(cx, w, h, r, { base: '#2c3a3c', dark: 0.85, fleck: [[40, 90, 86], [60, 64, 66], [16, 20, 22]] });
      grime(cx, w, h, r, 0.4, [10, 14, 14], 3);
      const n = 2, s = w / n, b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#202020'; bx.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x0 = i * s, y0 = j * s, state = r(), c = Math.floor(r() * 4);
        if (state < 0.15) continue; // missing tile: circuit shows
        const curl = state < 0.8 ? s * (0.3 + r() * 0.35) : 0;
        const corners = [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
        const k = corners[c], a = corners[(c + 1) % 4], z = corners[(c + 3) % 4];
        const along = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const t = curl / s, pA = along(k, a, t), pZ = along(k, z, t);
        const poly = curl ? [pA, a, corners[(c + 2) % 4], z, pZ] : corners;
        const path = (g) => { g.beginPath(); poly.forEach((p, q) => (q ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
        // shadow of the lifted edge onto the board
        if (curl) {
          ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.beginPath(); ctx.moveTo(pA[0], pA[1]); ctx.lineTo(pZ[0], pZ[1]); ctx.lineTo(k[0] * 0.3 + pA[0] * 0.35 + pZ[0] * 0.35, k[1] * 0.3 + pA[1] * 0.35 + pZ[1] * 0.35); ctx.fill(); ctx.restore();
        }
        ctx.save(); path(ctx); ctx.clip(); ctx.drawImage(carpet, 0, 0); ctx.restore();
        ctx.save(); path(ctx); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        bx.save(); path(bx); bx.fillStyle = '#b0b0b0'; bx.fill(); bx.restore();
        if (curl) {
          // the curled flap: pale jute backing rolled toward the tile, shaded
          const mid = [(pA[0] + pZ[0]) / 2, (pA[1] + pZ[1]) / 2], dir = [mid[0] - k[0], mid[1] - k[1]];
          const tip = [mid[0] + dir[0] * 0.55, mid[1] + dir[1] * 0.55];
          const g = ctx.createLinearGradient(mid[0], mid[1], tip[0], tip[1]);
          g.addColorStop(0, '#6e6552'); g.addColorStop(0.5, '#a39a82'); g.addColorStop(1, '#4a4436');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(pA[0], pA[1]); ctx.quadraticCurveTo(tip[0], tip[1], pZ[0], pZ[1]); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(20,18,14,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
          bx.fillStyle = '#ffffff'; bx.beginPath(); bx.moveTo(pA[0], pA[1]); bx.quadraticCurveTo(tip[0], tip[1], pZ[0], pZ[1]); bx.closePath(); bx.fill();
        }
      }
      grainPass(ctx, w, h, r, 0.03);
      return { bump: b, bumpScale: 2.5 };
    },
  });
  define('cardboard_circuit', {
    size: 1.2, mat: { roughness: 0.62, bump: 1 },
    gen(ctx, w, h, r) {
      drawCircuit(ctx, w, h, r);
      const card = mk(w, h), cx = ctxOf(card);
      wetCard(cx, w, h, r);
      const holes = fbm(w, h, r, { cells: 3, oct: 5, gain: 0.6 });
      const cd = cx.getImageData(0, 0, w, h), d2 = cd.data;
      const b = mk(w, h), bx = ctxOf(b);
      const bimg = bx.createImageData(w, h), bd = bimg.data;
      pix(ctx, w, h, (d, i, x, y, p) => {
        const v = holes[p];
        let t = v < 0.3 ? 0 : v < 0.33 ? (v - 0.3) / 0.03 : 1;
        if (v >= 0.3 && v < 0.345) { d2[i] = Math.min(255, d2[i] * 1.5 + 40); d2[i + 1] = Math.min(255, d2[i + 1] * 1.5 + 30); d2[i + 2] = Math.min(255, d2[i + 2] * 1.4 + 20); t = 1; }
        d[i] += (d2[i] - d[i]) * t; d[i + 1] += (d2[i + 1] - d[i + 1]) * t; d[i + 2] += (d2[i + 2] - d[i + 2]) * t;
        const hv = t * 200 + 30; bd[i] = bd[i + 1] = bd[i + 2] = hv; bd[i + 3] = 255;
      });
      bx.putImageData(bimg, 0, 0);
      grainPass(ctx, w, h, r, 0.03);
      return { bump: b, bumpScale: 1.5 };
    },
  });
  define('wet_black_cable', {
    size: 2, mat: { roughness: 1 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#0d1011'; ctx.fillRect(0, 0, w, h);
      modulate(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 5 }), 0.5);
      speck(ctx, w, h, r, 1500, [[40, 44, 44], [8, 8, 8]], 1.5, 0.5);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#101010'; bx.fillRect(0, 0, w, h);
      const cols = ['#161a1b', '#1d2223', '#0f1213', '#262c2c', '#1f6f6a', '#8a7418', '#5a1a16', '#2a3a3a'];
      const cables = [];
      for (let k = 0; k < 26; k++) {
        const pts = []; let x = r() * w, y = r() * h, a = r() * TAU;
        const n = 6 + Math.floor(r() * 8);
        for (let s = 0; s < n; s++) { pts.push([x, y]); a += (r() - 0.5) * 1.6; const L = 20 + r() * 40; x += Math.cos(a) * L; y += Math.sin(a) * L; }
        cables.push({ pts, wd: 5 + r() * 9, col: k < 20 ? pickr(cols.slice(0, 4), r) : pickr(cols.slice(4), r) });
      }
      // coils
      for (let k = 0; k < 4; k++) {
        const cx = r() * w, cy = r() * h, rad = 16 + r() * 30, pts = [];
        for (let s = 0; s <= 40; s++) { const a = s * 0.55, rr = rad * (0.6 + 0.4 * Math.sin(s * 0.3)); pts.push([cx + Math.cos(a) * rr + s * 0.8, cy + Math.sin(a) * rr * 0.6]); }
        cables.push({ pts, wd: 5 + r() * 3, col: pickr(cols.slice(0, 4), r) });
      }
      const stroke = (g, c, pass) => {
        g.beginPath(); c.pts.forEach((p, i) => { if (i === 0) g.moveTo(p[0], p[1]); else { const q = c.pts[i - 1]; g.quadraticCurveTo(q[0], q[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } });
        if (pass === 0) { g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = c.wd + 4; g.stroke(); }
        if (pass === 1) { g.strokeStyle = c.col; g.lineWidth = c.wd; g.stroke(); }
        if (pass === 2) { g.strokeStyle = 'rgba(220,235,235,0.22)'; g.lineWidth = Math.max(1, c.wd * 0.18); g.stroke(); }
      };
      tiled(ctx, w, h, () => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (const c of cables) for (let pass = 0; pass < 3; pass++) stroke(ctx, c, pass); });
      tiled(bx, w, h, () => { bx.lineCap = 'round'; for (const c of cables) { bx.beginPath(); c.pts.forEach((p, i) => (i ? bx.lineTo(p[0], p[1]) : bx.moveTo(p[0], p[1]))); bx.strokeStyle = '#d0d0d0'; bx.lineWidth = c.wd; bx.stroke(); } });
      grainPass(ctx, w, h, r, 0.03);
      const rc = mk(w, h), rx = ctxOf(rc), n = fbm(w, h, r, { cells: 3, oct: 4 });
      pix(rx, w, h, (d, i, x, y, p) => { d[i] = d[i + 1] = d[i + 2] = n[p] > 0.5 ? 20 : 80; d[i + 3] = 255; });
      return { rough: rc, bump: b, bumpScale: 2.5 };
    },
  });
  define('receipt_ceiling', {
    size: 1.2, mat: { roughness: 0.8, bump: 1.2 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#0d0f0f'; ctx.fillRect(0, 0, w, h);
      const b = mk(w, h), bx = ctxOf(b);
      bx.fillStyle = '#101010'; bx.fillRect(0, 0, w, h);
      const sw = 44, strips = [];
      for (let layer = 0; layer < 2; layer++) {
        for (let x = 0; x < w; x += sw * (0.8 + r() * 0.5)) {
          if (r() < 0.12) continue;
          strips.push({ x: x + (r() - 0.5) * 10 + layer * sw * 0.4, seed: subSeed(r), fade: 0.65 + r() * 0.3 });
        }
      }
      for (const st of strips) wrapX(w, st.x + sw / 2, sw, (X) => {
        const x0 = X - sw / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 + 4, 0, sw, h);
        receiptStrip(ctx, x0, 0, sw, h, U.rng(st.seed), { fade: st.fade, period: h });
        const g = ctx.createLinearGradient(x0, 0, x0 + sw, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = g; ctx.fillRect(x0, 0, sw, h);
        const gb = bx.createLinearGradient(x0, 0, x0 + sw, 0); gb.addColorStop(0, '#606060'); gb.addColorStop(0.5, '#e0e0e0'); gb.addColorStop(1, '#505050');
        bx.fillStyle = gb; bx.fillRect(x0, 0, sw, h);
      });
      modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 4 }), 0.25);
      grime(ctx, w, h, r, 0.3, [120, 110, 80], 2);
      grainPass(ctx, w, h, r, 0.03);
      return { bump: b, bumpScale: 1.4 };
    },
  });

  // --- fabric, nature ---
  define('fabric_knit', {
    size: 0.2, px: 256, mat: { roughness: 0.97, bump: 1.2 },
    gen(ctx, w, h, r, o) {
      const base = hex(o.color || '#d4d0c6');
      ctx.fillStyle = rgba(shade(base, 0.55)); ctx.fillRect(0, 0, w, h);
      const cols = 16, rows = 20, sw = w / cols, sh = h / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = i * sw + sw / 2, y = j * sh + sh / 2, c = vary(base, r, 0.1);
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(x + side * sw * 0.22, y); ctx.rotate(side * 0.55);
          const g = ctx.createLinearGradient(-sw * 0.25, 0, sw * 0.25, 0);
          g.addColorStop(0, rgba(shade(c, 0.75))); g.addColorStop(0.5, rgba(shade(c, 1.08))); g.addColorStop(1, rgba(shade(c, 0.7)));
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, sw * 0.24, sh * 0.62, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      speck(ctx, w, h, r, 400, [shade(base, 1.15), shade(base, 0.6)], 1.8, 0.4);
      grime(ctx, w, h, r, 0.15, shade(base, 0.5), 2);
      grainPass(ctx, w, h, r, 0.03);
    },
  });
  define('grass', {
    size: 2, mat: { roughness: 0.97, bump: 0.8 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#4c4f3f'; ctx.fillRect(0, 0, w, h);
      const dirt = fbm(w, h, r, { cells: 3, oct: 5 });
      pix(ctx, w, h, (d, i, x, y, p) => { if (dirt[p] > 0.6) { const t = Math.min(1, (dirt[p] - 0.6) * 5); d[i] += (92 - d[i]) * t; d[i + 1] += (82 - d[i + 1]) * t; d[i + 2] += (66 - d[i + 2]) * t; } });
      const pal = ['#5f6448', '#6f7053', '#565a42', '#80785a', '#8d8664', '#454a38', '#6a6f55'];
      ctx.lineCap = 'round';
      for (let k = 0; k < 7000; k++) {
        const x = r() * w, y = r() * h, L = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
        ctx.strokeStyle = rgba(hex(pickr(pal, r)), 0.5 + r() * 0.4); ctx.lineWidth = 0.8 + r() * 0.9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
      }
      grime(ctx, w, h, r, 0.25, [40, 38, 30], 2);
      grainPass(ctx, w, h, r, 0.04);
    },
  });
  define('dirt', {
    size: 2, mat: { roughness: 0.96, bump: 1 },
    gen(ctx, w, h, r) {
      fillNoise(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 6, gain: 0.55 }), '#3e372e', '#6f6453');
      modulate(ctx, w, h, fbm(w, h, r, { cells: 64, oct: 2 }), 0.2);
      for (let k = 0; k < 500; k++) {
        const x = r() * w, y = r() * h, s = 1.5 + r() * 3.5, c = vary('#7a7162', r, 0.3);
        ctx.fillStyle = 'rgba(20,16,12,0.5)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 1, s, s * 0.7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * 3, 0, TAU); ctx.fill();
      }
      for (let k = 0; k < 5; k++) blotch(ctx, w, h, r() * w, r() * h, 30 + r() * 60, [24, 20, 16], 0.25);
      grainPass(ctx, w, h, r, 0.05);
    },
  });
  function gumLeaf(ctx, x, y, L, a, col, curve) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = rgba(col);
    ctx.beginPath(); ctx.moveTo(-L / 2, 0);
    ctx.quadraticCurveTo(-L * 0.1, -L * 0.2 + curve, L / 2, curve * 1.5);
    ctx.quadraticCurveTo(-L * 0.05, L * 0.05 + curve, -L / 2, 0); ctx.fill();
    ctx.strokeStyle = rgba(shade(col, 0.7), 0.8); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-L / 2 - L * 0.08, 0); ctx.quadraticCurveTo(0, -L * 0.06 + curve, L / 2, curve * 1.5); ctx.stroke();
    ctx.restore();
  }
  define('leaves', {
    size: 1.5, alpha: true, mat: { roughness: 0.9, alphaTest: 0.4, side: 'double' },
    gen(ctx, w, h, r, o) {
      if (o.opaque) { fillNoise(ctx, w, h, fbm(w, h, r, { cells: 4, oct: 5 }), '#3a342a', '#5d5444'); } else ctx.clearRect(0, 0, w, h);
      const pal = ['#7a7556', '#8b7a55', '#6d5a3e', '#8a6446', '#5d6147', '#9a8a62', '#6f4e38'];
      for (let k = 0; k < (o.opaque ? 260 : 150); k++) {
        const x = r() * w, y = r() * h, L = 26 + r() * 30, a = r() * TAU, c = vary(pickr(pal, r), r, 0.2), curve = (r() - 0.5) * L * 0.25;
        wrapAt(w, h, x, y, L, (X, Y) => gumLeaf(ctx, X, Y, L, a, c, curve));
      }
      // bark strips
      for (let k = 0; k < 8; k++) {
        const x = r() * w, y = r() * h, L = 40 + r() * 50, a = r() * TAU, bc = vary('#8a7f6c', r, 0.2), bw = 6 + r() * 3;
        wrapAt(w, h, x, y, L, (X, Y) => { ctx.save(); ctx.translate(X, Y); ctx.rotate(a); ctx.fillStyle = rgba(bc); ctx.fillRect(-L / 2, -3, L, bw); ctx.fillStyle = 'rgba(40,30,20,0.4)'; ctx.fillRect(-L / 2, 1, L, 1.5); ctx.restore(); });
      }
      if (o.opaque) grainPass(ctx, w, h, r, 0.04);
    },
  });

  // --- glass, plastic, screens, overlays ---
  define('glass', {
    size: 1, px: 256, alpha: true, mat: { roughness: 0.08, metalness: 0.1, transparent: true, depthWrite: false, side: 'double' },
    gen(ctx, w, h, r, o) {
      const tint = hex(o.tint || '#94aaa6');
      const n = fbm(w, h, r, { cells: 3, oct: 4 });
      pix(ctx, w, h, (d, i, x, y, p) => { d[i] = tint[0]; d[i + 1] = tint[1]; d[i + 2] = tint[2]; d[i + 3] = 40 + n[p] * 22; });
      // wipe smears
      for (let k = 0; k < 7; k++) {
        const x = r() * w, y = r() * h, rad = 30 + r() * 60, al = 0.05 + r() * 0.08, lw = 6 + r() * 12, a0 = r() * 3, a1 = a0 + 1.5 + r() * 2;
        wrapAt(w, h, x, y, rad + lw, (X, Y) => { ctx.strokeStyle = `rgba(210,220,215,${al})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(X, Y, rad, a0, a1); ctx.stroke(); });
      }
      // finger smudges and dust specks
      for (let k = 0; k < 10; k++) blotch(ctx, w, h, r() * w, r() * h, 4 + r() * 7, [200, 205, 200], 0.18);
      speck(ctx, w, h, r, 300, [[230, 230, 225], [60, 60, 56]], 1.4, 0.35);
      drips(ctx, w, h, r, 8, [150, 150, 140], 0.12, { minLen: 0.2, maxLen: 0.6, width: 2 });
    },
  });
  define('plastic_sheet', {
    size: 2, alpha: true, mat: { roughness: 0.35, transparent: true, depthWrite: false, side: 'double' },
    gen(ctx, w, h, r) {
      const n = fbm(w, h, r, { cells: 6, oct: 5, gain: 0.6 });
      pix(ctx, w, h, (d, i, x, y, p) => { const v = 214 + n[p] * 30; d[i] = v; d[i + 1] = v + 2; d[i + 2] = v - 4; d[i + 3] = 80 + n[p] * 50; });
      // creases: long near-straight folds, one bright edge + one dark
      tiled(ctx, w, h, () => {
        for (let k = 0; k < 20; k++) {
          const x = r() * w, y = r() * h, a = r() * TAU, L = 80 + r() * 260, b = (r() - 0.5) * 30;
          const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L, mx = (x + x2) / 2 - Math.sin(a) * b, my = (y + y2) / 2 + Math.cos(a) * b;
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.3})`; ctx.lineWidth = 1 + r() * 1.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
          ctx.strokeStyle = `rgba(120,124,118,${0.18 + r() * 0.2})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.quadraticCurveTo(mx + 2, my + 2, x2 + 2, y2 + 2); ctx.stroke();
        }
      });
      speck(ctx, w, h, r, 120, [[230, 226, 214], [150, 146, 136]], 3, 0.5);
    },
  });
  define('screen_off', {
    size: 1, px: 256, mat: { roughness: 0.22, metalness: 0.1 },
    gen(ctx, w, h, r) {
      ctx.fillStyle = '#0a0c0d'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(120,140,140,0.10)'); g.addColorStop(0.45, 'rgba(120,140,140,0.02)'); g.addColorStop(0.55, 'rgba(120,140,140,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, w, 1); }
      for (let k = 0; k < 4; k++) blotch(ctx, w, h, r() * w, r() * h, 10 + r() * 16, [120, 126, 124], 0.06);
      speck(ctx, w, h, r, 150, [[150, 150, 146]], 1.2, 0.3);
    },
  });
  define('fog_noise', {
    size: 4, px: 256, alpha: true, mat: {},
    gen(ctx, w, h, r) {
      const n = fbm(w, h, r, { cells: 3, oct: 5, gain: 0.55 });
      const m = fbm(w, h, r, { cells: 2, oct: 3 });
      pix(ctx, w, h, (d, i, x, y, p) => { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = c255(Math.pow(n[p] * 0.75 + m[p] * 0.25, 1.6) * 330); });
    },
  });
  define('speck', {
    size: 0.05, px: 32, alpha: true, mat: {},
    gen(ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  });
  define('halo', {
    size: 1, px: 128, alpha: true, mat: {},
    gen(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.07, 'rgba(255,255,255,0.85)'); g.addColorStop(0.18, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.1)'); g.addColorStop(0.75, 'rgba(255,255,255,0.025)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  });
  define('grime', {
    size: 2, alpha: true, mat: { roughness: 1, transparent: true, depthWrite: false, polygonOffset: true },
    gen(ctx, w, h, r) {
      const n = fbm(w, h, r, { cells: 3, oct: 6, gain: 0.6 });
      pix(ctx, w, h, (d, i, x, y, p) => { d[i] = 38; d[i + 1] = 34; d[i + 2] = 28; d[i + 3] = c255(Math.max(0, n[p] - 0.42) * 420); });
      drips(ctx, w, h, r, 30, [40, 34, 26], 0.3, { minLen: 0.1, maxLen: 0.6, width: 5 });
      for (let k = 0; k < 12; k++) blotch(ctx, w, h, r() * w, r() * h, 10 + r() * 40, [30, 26, 20], 0.3);
      speck(ctx, w, h, r, 600, [[30, 26, 20]], 2, 0.4);
    },
  });

  // Outage partner texture for each surface. Anything not listed uses 'self' (same texture, darker, keeps its colour).
  const OUTAGE_PARTNER = {
    plaster: 'contracts', plaster_stained: 'contracts', render_cracked: 'contracts', brick: 'contracts', concrete: 'contracts', concrete_wet: 'contracts',
    carpet: 'circuit_carpet',
    lino: 'cardboard_circuit', lino_hospital: 'cardboard_circuit', tile: 'cardboard_circuit', tile_white: 'cardboard_circuit', vinyl_retail: 'cardboard_circuit',
    bitumen: 'wet_black_cable', gravel: 'wet_black_cable', footpath: 'wet_black_cable', kerb: 'wet_black_cable', dirt: 'wet_black_cable', grass: 'wet_black_cable',
    wood: 'cardboard_wet', weatherboard: 'cardboard_wet', timber_floor: 'cardboard_wet', cardboard: 'cardboard_wet',
    ceiling_tile: 'receipt_ceiling', paper: 'receipt', leaves: 'receipt',
  };
  const PARTNER_ROUGH = { contracts: 0.9, circuit_carpet: 0.8, cardboard_circuit: 0.55, wet_black_cable: 0.18, cardboard_wet: 0.6, receipt_ceiling: 0.8, receipt: 0.75 };

  // ---------------------------------------------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------------------------------------------
  const cache = new Map(); // key → { tex, canvas, rough, bump, bumpScale, name }
  const warned = new Set();
  function build(name, opts = {}) {
    const d = GEN[name];
    const key = name + stable(opts);
    if (cache.has(key)) return cache.get(key);
    const px = opts.px || d.px;
    const c = mk(px, px), ctx = ctxOf(c);
    const r = U.rng(U.hash(key) ^ (opts.seed || 0x5eed));
    const res = d.gen(ctx, px, px, r, opts) || {};
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.name = name;
    tex.userData.size = d.size;
    tex.userData.shared = true;
    const entry = { tex, canvas: c, name, size: d.size };
    const dataTex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      return t;
    };
    if (res.rough) entry.rough = dataTex(res.rough);
    if (res.bump) { entry.bump = dataTex(res.bump); entry.bumpScale = res.bumpScale || 1; }
    cache.set(key, entry);
    return entry;
  }
  function resolve(name) {
    if (GEN[name]) return name;
    if (!warned.has(name)) { warned.add(name); console.warn(`[Tex] unknown texture "${name}" — using plaster`); }
    return 'plaster';
  }
  function get(name, opts = {}) { return build(resolve(name), opts).tex; }
  function canvas(name, opts = {}) { return build(resolve(name), opts).canvas; }

  // ---------------------------------------------------------------------------------------------------------------
  // The Fog → Outage dissolve (shared by every kit material)
  // ---------------------------------------------------------------------------------------------------------------
  const U_OUTAGE = { value: 0 };
  const U_FOCUS = { value: new THREE.Vector3() };
  const U_TIME = { value: 0 };
  let placeholder = null;
  const DISSOLVE_VERT = /* glsl */`
    vec4 shWp = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      shWp = batchingMatrix * shWp;
    #endif
    #ifdef USE_INSTANCING
      shWp = instanceMatrix * shWp;
    #endif
    vShWorld = ( modelMatrix * shWp ).xyz;
  `;
  const DISSOLVE_PARS = /* glsl */`
    varying vec3 vShWorld;
    uniform float uOutage;
    uniform vec3 uOutFocus;
    uniform float uShTime;
    uniform sampler2D uOutMap;
    uniform vec3 uOutTint;
    uniform float uOutRough;
    uniform float uOutMetal;
    uniform float uOutKeep;
    uniform vec2 uOutScale;
    float shHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
    float shNoise( vec3 x ) {
      vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( mix( shHash( i ), shHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( shHash( i + vec3( 0.0, 1.0, 0.0 ) ), shHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
                  mix( mix( shHash( i + vec3( 0.0, 0.0, 1.0 ) ), shHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( shHash( i + vec3( 0.0, 1.0, 1.0 ) ), shHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
    }
  `;
  const DISSOLVE_MAP = /* glsl */`
    float shN = shNoise( vShWorld * 0.55 ) * 0.55 + shNoise( vShWorld * 1.9 + 7.3 ) * 0.3 + shNoise( vShWorld * 6.1 + 2.1 ) * 0.15;
    shN = clamp( ( shN - 0.2 ) / 0.6, 0.0, 1.0 );
    shN = mix( shN, clamp( distance( vShWorld, uOutFocus ) / 22.0, 0.0, 1.0 ), 0.3 );
    float shD = uOutage * 1.14 - 0.07 - shN;
    float shMix = smoothstep( -0.004, 0.004, shD );
    float shEdge = ( 1.0 - smoothstep( 0.0, 0.016, abs( shD ) ) ) * step( 0.0005, uOutage ) * step( uOutage, 0.9995 );
    float shScorch = smoothstep( -0.09, 0.0, shD ) * ( 1.0 - shMix ) * step( 0.0005, uOutage );
    #ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      vec4 shB = texture2D( uOutMap, vMapUv * uOutScale );
    #else
      vec4 sampledDiffuseColor = vec4( 1.0 );
      vec4 shB = texture2D( uOutMap, vec2( vShWorld.x + vShWorld.z, vShWorld.y ) * 0.5 );
    #endif
    // vertex colours act like the material colour (Kit's colour batches): kept by a 'self' dissolve, replaced by a
    // partner surface (color_fragment is removed below, so they are applied here)
    #if defined( USE_COLOR_ALPHA )
      vec4 shVC = vColor;
    #elif defined( USE_COLOR )
      vec4 shVC = vec4( vColor, 1.0 );
    #else
      vec4 shVC = vec4( 1.0 );
    #endif
    shB.rgb *= uOutTint * mix( vec3( 1.0 ), diffuse * shVC.rgb, uOutKeep );
    diffuseColor = mix( diffuseColor * shVC * sampledDiffuseColor, vec4( shB.rgb, shB.a * diffuseColor.a * shVC.a ), shMix );
    diffuseColor.rgb *= 1.0 - 0.55 * shScorch;
  `;
  const DISSOLVE_EDGE = /* glsl */`
    float shFl = 0.75 + 0.25 * sin( uShTime * 21.0 + vShWorld.x * 3.1 + vShWorld.z * 2.3 + vShWorld.y * 1.7 );
    totalEmissiveRadiance += mix( vec3( 0.0137, 0.159, 0.144 ), vec3( 0.06, 0.62, 0.52 ), shEdge * shEdge ) * shEdge * 3.0 * shFl;
    diffuseColor.rgb *= 1.0 - 0.8 * shEdge;
  `;
  const NORMAL_MAPS = THREE.ShaderChunk.normal_fragment_maps.replace('dHdxy_fwd()', 'dHdxy_fwd() * ( 1.0 - shMix )');
  const partnerFor = (name) => (OUTAGE_PARTNER[name] || 'self');
  function getPlaceholder() {
    if (!placeholder) {
      const c = mk(4, 4), x = ctxOf(c); x.fillStyle = '#0c1112'; x.fillRect(0, 0, 4, 4);
      placeholder = new THREE.CanvasTexture(c); placeholder.colorSpace = THREE.SRGBColorSpace;
    }
    return placeholder;
  }
  const pending = new Set();
  let pumpTimer = null;
  function resolvePartner(rec) {
    if (!rec.partnerName) return;
    rec.uni.uOutMap.value = get(rec.partnerName);
    pending.delete(rec);
  }
  // Generate outage partner textures in idle time so the first room build stays fast.
  function pump() {
    pumpTimer = null;
    const rec = pending.values().next().value;
    if (!rec) return;
    resolvePartner(rec);
    if (pending.size) pumpTimer = setTimeout(pump, 30);
  }
  // CONTRACT+: Tex.outageify(material, partner = 'self'|name|Texture, {tint, rough, metal, keep, scale}) — give any
  // MeshStandardMaterial the Fog/Outage dissolve. Kit materials get it automatically.
  function outageify(m, partner = 'self', o = {}) {
    const src = m.map && m.map.name;
    let partnerName = null, tex = null;
    if (partner && partner.isTexture) tex = partner;
    else if (partner === 'self') tex = m.map || null;
    else partnerName = resolve(partner);
    const isSelf = partner === 'self';
    const tint = new THREE.Color(o.tint ?? (isSelf ? '#4e5a5a' : '#ffffff'));
    const srcSize = (GEN[src] && GEN[src].size) || 1, dstSize = partnerName ? GEN[partnerName].size : srcSize;
    const sc = o.scale ?? srcSize / dstSize;
    const uni = {
      uOutMap: { value: tex || getPlaceholder() },
      uOutTint: { value: tint },
      uOutRough: { value: o.rough ?? (isSelf ? Math.max(0.2, m.roughness * 0.8) : (PARTNER_ROUGH[partnerName] ?? 0.8)) },
      uOutMetal: { value: o.metal ?? (isSelf ? m.metalness : 0) },
      uOutKeep: { value: o.keep ?? (isSelf ? 1 : 0) },
      uOutScale: { value: new THREE.Vector2(sc, sc) },
    };
    const rec = { uni, partnerName };
    if (partnerName) {
      const cached = [...cache.values()].find((e) => e.name === partnerName);
      if (cached) uni.uOutMap.value = cached.tex;
      else { pending.add(rec); if (!pumpTimer) pumpTimer = setTimeout(pump, 200); }
    }
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOutage = U_OUTAGE; sh.uniforms.uOutFocus = U_FOCUS; sh.uniforms.uShTime = U_TIME;
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + DISSOLVE_VERT);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DISSOLVE_PARS)
        .replace('#include <map_fragment>', DISSOLVE_MAP)
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, uOutRough, shMix );')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, uOutMetal, shMix );')
        .replace('#include <normal_fragment_maps>', NORMAL_MAPS)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + DISSOLVE_EDGE);
    };
    m.customProgramCacheKey = () => 'sh-dissolve-2';
    m.userData.outage = partnerName || (isSelf ? 'self' : 'texture');
    // (Kit's static batching re-creates the dissolve on its batch materials from these)
    m.userData.outageArgs = { partner: isSelf ? 'self' : partnerName || tex, o, key: (isSelf ? 'self' : partnerName || (tex ? tex.uuid : '?')) + '|' + stable(o) };
    // clones (Kit tinting a kit material) keep the dissolve
    m.clone = function () {
      const c = new THREE.MeshStandardMaterial().copy(this);
      outageify(c, tex && !isSelf ? tex : partner, o);
      c.userData.shared = false;
      return c;
    };
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Kit materials
  // ---------------------------------------------------------------------------------------------------------------
  const MAT_KEYS = new Set(['repeat', 'offset', 'rotation', 'color', 'emissive', 'emissiveIntensity', 'emissiveMap', 'roughness', 'metalness',
    'transparent', 'opacity', 'side', 'outage', 'alphaTest', 'depthWrite', 'bump', 'flat', 'fog', 'name', 'polygonOffset', 'outageTint', 'toneMapped', 'vertexColors']);
  const SIDES = { front: THREE.FrontSide, back: THREE.BackSide, double: THREE.DoubleSide };
  const matCache = new Map();
  function mat(name, opts = {}) {
    const isTex = name && name.isTexture;
    const key = (isTex ? 'tex:' + name.uuid : name) + stable(opts);
    if (matCache.has(key)) return matCache.get(key);
    const tname = isTex ? null : resolve(name);
    const d = tname ? GEN[tname] : { mat: {}, alpha: false };
    const texOpts = {};
    for (const k of Object.keys(opts)) if (!MAT_KEYS.has(k)) texOpts[k] = opts[k];
    const entry = isTex ? { tex: name } : build(tname, texOpts);
    const dm = d.mat || {};
    const transform = (t) => {
      if (!t || !(opts.repeat || opts.offset || opts.rotation)) return t;
      const c = t.clone();
      if (opts.repeat) c.repeat.set(opts.repeat[0], opts.repeat[1] ?? opts.repeat[0]);
      if (opts.offset) c.offset.set(opts.offset[0], opts.offset[1] ?? 0);
      if (opts.rotation) { c.rotation = U.rad(opts.rotation); c.center.set(0.5, 0.5); }
      return c;
    };
    const side = opts.side ?? dm.side;
    const m = new THREE.MeshStandardMaterial({
      name: opts.name || (isTex ? name.name || 'texmat' : tname),
      map: transform(entry.tex),
      roughness: opts.roughness ?? dm.roughness ?? 0.85,
      metalness: opts.metalness ?? dm.metalness ?? 0,
      color: opts.color !== undefined ? new THREE.Color(opts.color) : new THREE.Color(0xffffff),
      transparent: opts.transparent ?? dm.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
      side: typeof side === 'string' ? SIDES[side] : (side ?? THREE.FrontSide),
      alphaTest: opts.alphaTest ?? dm.alphaTest ?? 0,
      depthWrite: opts.depthWrite ?? dm.depthWrite ?? true,
      flatShading: !!opts.flat,
      fog: opts.fog ?? true,
      vertexColors: !!opts.vertexColors,
    });
    if (opts.toneMapped === false) m.toneMapped = false;
    if (entry.rough && opts.roughness === undefined) { m.roughnessMap = transform(entry.rough); m.roughness = 1; }
    const bumpScale = opts.bump ?? (entry.bump ? entry.bumpScale : dm.bump);
    if (bumpScale) { m.bumpMap = transform(entry.bump || entry.tex); m.bumpScale = bumpScale; }
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
      if (opts.emissiveMap) m.emissiveMap = opts.emissiveMap === true ? m.map : opts.emissiveMap;
    }
    if (opts.polygonOffset ?? dm.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
    const outage = opts.outage ?? (isTex || tname === 'halo' || tname === 'speck' || tname === 'fog_noise' ? false : partnerFor(tname));
    if (outage !== false) outageify(m, outage, { tint: opts.outageTint });
    m.userData.shared = true;
    m.userData.tex = tname || 'texture';
    matCache.set(key, m);
    return m;
  }
  function setOutage(v, focus) {
    const nv = Math.max(0, Math.min(1, v));
    if (nv > 0 && pending.size) for (const rec of [...pending]) resolvePartner(rec);
    U_OUTAGE.value = nv;
    if (focus) U_FOCUS.value.copy(U.toV3(focus));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Aging for signs/posters
  // ---------------------------------------------------------------------------------------------------------------
  function age(ctx, w, h, r, amt = 1, { rust = false, sun = 0 } = {}) {
    if (amt <= 0) return;
    if (sun > 0) { ctx.fillStyle = `rgba(214,218,212,${sun})`; ctx.fillRect(0, 0, w, h); }
    const n = fbm(w, h, r, { cells: 3, oct: 4 });
    pix(ctx, w, h, (d, i, x, y, p) => {
      const edge = Math.min(x, y, w - x, h - y) / Math.min(w, h);
      const t = (Math.max(0, n[p] - 0.45) * 0.6 + Math.max(0, 0.08 - edge) * 3 + (y / h) * 0.12) * amt;
      d[i] = c255(d[i] * (1 - t) + 60 * t); d[i + 1] = c255(d[i + 1] * (1 - t) + 56 * t); d[i + 2] = c255(d[i + 2] * (1 - t) + 48 * t);
    });
    scuffs(ctx, w, h, r, Math.round(10 * amt), [240, 240, 235], 0.12, Math.min(w, h) * 0.2);
    if (rust) drips(ctx, w, h, r, Math.round(4 * amt), [120, 70, 36], 0.25, { minLen: 0.2, maxLen: 0.7, width: 3 });
    drips(ctx, w, h, r, Math.round(6 * amt), [40, 36, 30], 0.12, { minLen: 0.1, maxLen: 0.5, width: 4 });
    grainPass(ctx, w, h, r, 0.04 * amt);
  }
  function mkTex(c, { wrap = false, mips = true } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  }
  const textCache = new Map();
  const cached = (key, fn) => { if (textCache.has(key)) return textCache.get(key); const t = fn(); t.userData.shared = true; textCache.set(key, t); return t; };
  const pxSize = (v) => Math.max(16, Math.min(1024, Math.round(v)));
  // Sizes under 16 are taken as metres (K.sign passes metres) and drawn at 256 px/m, keeping the aspect.
  const signSize = (o, dw, dh) => {
    let w = o.w || dw, h = o.h || dh;
    if (w < 16 && h < 16) { const k = Math.min(256, 1024 / Math.max(w, h)); w *= k; h *= k; }
    return [pxSize(w), pxSize(h)];
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Signs
  // ---------------------------------------------------------------------------------------------------------------
  function sign(str, o = {}) {
    str = String(str ?? '');
    return cached('sign|' + str + stable(o), () => {
      const style = o.style || 'shop';
      const [w, h] = signSize(o, 512, 128);
      const c = mk(w, h), ctx = ctxOf(c), r = U.rng(U.hash(str + style) ^ (o.seed || 11));
      const lines = str.split('\n');
      const pad = Math.min(w, h) * 0.12;
      let fg = o.fg, font = o.font, weight = 'bold', upper = true, rust = false, agedAmt = o.clean ? 0 : (o.age ?? 1);
      let box = [pad, pad, w - pad * 2, h - pad * 2], align = 'center';
      const border = (col, lw, inset) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
      switch (style) {
        case 'optus': {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, o.bg || '#03a3a3'); g.addColorStop(1, o.bg || '#028586');
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, w, h * 0.12);
          if (/^optus$/i.test(str.trim())) {
            const wh = h * 0.56;
            ctx.font = `900 ${wh}px ${FONT.heavy}`;
            const est = ctx.measureText('optus').width + wh * 0.6;
            const s2 = Math.min(wh, (w * 0.8 / est) * wh);
            const width = drawWordmarkMeasure(s2);
            drawWordmark(ctx, (w - width) / 2, h * 0.5 + s2 * 0.3, s2, { color: o.fg || BRAND.yellow });
            age(ctx, w, h, r, agedAmt * 0.6);
            return finish(c);
          }
          const mh = h * 0.42;
          const mw = drawWordmark(ctx, pad * 0.8, h * 0.5 + mh * 0.3, mh, { color: BRAND.yellow });
          box = [pad + mw + pad * 0.6, pad, w - mw - pad * 2.6, h - pad * 2]; fg = fg || '#ffffff'; font = font || FONT.sans; upper = false; align = 'left';
          break;
        }
        case 'street': {
          ctx.fillStyle = o.bg || '#20415a'; ctx.fillRect(0, 0, w, h);
          border(o.border || '#e8ece8', Math.max(2, h * 0.05), h * 0.07);
          fg = fg || '#eef1ee'; font = font || FONT.narrow; rust = true;
          for (const x of [h * 0.18, w - h * 0.18]) { ctx.fillStyle = '#9aa0a0'; ctx.beginPath(); ctx.arc(x, h / 2, h * 0.05, 0, TAU); ctx.fill(); }
          box = [h * 0.35, h * 0.18, w - h * 0.7, h * 0.64];
          break;
        }
        case 'plaque': {
          const g = ctx.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, '#5f4d31'); g.addColorStop(0.45, '#9a8154'); g.addColorStop(0.55, '#8a7248'); g.addColorStop(1, '#4e3f27');
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
          border('rgba(255,235,190,0.35)', 3, 5); border('rgba(30,22,10,0.5)', 2, 9);
          const n = fbm(w, h, r, { cells: 4, oct: 4 });
          pix(ctx, w, h, (d, i, x, y, p) => { const e = Math.min(x, y, w - x, h - y); const t = Math.max(0, n[p] - 0.6) * 1.5 + (e < 12 ? 0.25 : 0); d[i] += (70 - d[i]) * t; d[i + 1] += (110 - d[i + 1]) * t; d[i + 2] += (96 - d[i + 2]) * t; });
          for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { ctx.fillStyle = '#3a2f1e'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,230,180,0.4)'; ctx.stroke(); }
          fg = fg || '#2b2112'; font = font || FONT.serif; weight = ''; upper = false;
          box = [pad * 1.4, pad * 1.1, w - pad * 2.8, h - pad * 2.2];
          break;
        }
        case 'warning': {
          ctx.fillStyle = o.bg || OUT.yellow; ctx.fillRect(0, 0, w, h);
          const hz = h * 0.16;
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, hz); ctx.rect(0, h - hz, w, hz); ctx.clip();
          ctx.fillStyle = '#141414';
          for (let x = -h; x < w + h; x += hz * 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + hz, 0); ctx.lineTo(x + hz + h, h); ctx.lineTo(x + h, h); ctx.fill(); }
          ctx.restore();
          border('#141414', Math.max(2, h * 0.03), h * 0.015);
          fg = fg || '#121212'; font = font || FONT.heavy; rust = true;
          box = [pad, hz + h * 0.06, w - pad * 2, h - hz * 2 - h * 0.12];
          break;
        }
        case 'council': {
          ctx.fillStyle = o.bg || '#e9e8e1'; ctx.fillRect(0, 0, w, h);
          const bh = h * 0.2;
          ctx.fillStyle = '#1f4a38'; ctx.fillRect(0, 0, w, bh);
          const hdr = o.header || 'SIGNAL HILL SHIRE COUNCIL';
          const hs = Math.min(bh * 0.5, fitSize(ctx, [hdr], w * 0.8, bh * 0.6, (q) => `bold ${q}px ${FONT.sans}`, bh * 0.5));
          text(ctx, hdr, w / 2, bh * 0.5 + hs * 0.36, { size: hs, font: FONT.sans, weight: 'bold', color: '#eef0ea', align: 'center', spacing: hs * 0.08 });
          border('#1f4a38', Math.max(2, h * 0.02), h * 0.01);
          fg = fg || '#1b1d1c'; font = font || FONT.sans; rust = true;
          box = [pad, bh + pad * 0.6, w - pad * 2, h - bh - pad * 1.4];
          break;
        }
        case 'handwritten': {
          const bg = o.bg || 'cardboard';
          if (bg === 'cardboard' || bg === 'paper') ctx.drawImage(canvas(bg, bg === 'cardboard' ? { tape: false, print: false } : {}), 0, 0, w, h);
          else { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
          const size = fitSize(ctx, lines, w * 0.84, h * 0.78, (s) => `${s}px ${o.font || FONT.marker}`, 200, 1.25);
          const lh = size * 1.25, y0 = h / 2 - (lines.length * lh) / 2 + size * 0.85;
          lines.forEach((l, i) => handwriting(ctx, l, w / 2, y0 + i * lh, { size, color: fg || '#141414', font: o.font || FONT.marker, align: 'center', weight: 'bold' }));
          age(ctx, w, h, r, agedAmt * 0.6);
          return finish(c);
        }
        case 'hospital': {
          ctx.fillStyle = o.bg || '#16485a'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(pad * 0.5, h - pad * 0.7, w - pad, Math.max(1, h * 0.012));
          fg = fg || '#f2f5f4'; font = font || FONT.sans; weight = ''; upper = false; align = 'left';
          break;
        }
        case 'office': {
          ctx.fillStyle = o.bg || '#d8d8d2'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = BRAND.teal; ctx.fillRect(0, 0, Math.max(6, w * 0.02), h);
          fg = fg || '#2c2f31'; font = font || FONT.sans; weight = ''; upper = false; align = 'left';
          box = [pad + w * 0.02, pad, w - pad * 2 - w * 0.02, h - pad * 2];
          break;
        }
        case 'shop':
        default: {
          ctx.fillStyle = o.bg || '#2f3b39'; ctx.fillRect(0, 0, w, h);
          modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 3 }), 0.15);
          if (o.border !== false) border(o.border || 'rgba(220,210,180,0.55)', Math.max(1.5, h * 0.02), h * 0.06);
          fg = fg || '#dcd3b8'; font = font || FONT.serif; rust = true;
          break;
        }
      }
      if (o.border && typeof o.border === 'string' && style !== 'street' && style !== 'shop') border(o.border, Math.max(2, h * 0.03), h * 0.03);
      const L = upper ? lines.map((l) => l.toUpperCase()) : lines;
      const fontFn = (s) => `${weight} ${s}px ${font}`.trim();
      const size = fitSize(ctx, L, box[2], box[3], fontFn, o.size || 400, 1.18);
      ctx.font = fontFn(size);
      const lh = size * 1.18, y0 = box[1] + box[3] / 2 - (L.length * lh) / 2 + size * 0.84;
      L.forEach((l, i) => {
        const x = align === 'left' ? box[0] : box[0] + box[2] / 2;
        if (style === 'plaque') text(ctx, l, x, y0 + i * lh + 1.2, { size, font, weight, color: 'rgba(255,236,190,0.35)', align });
        text(ctx, l, x, y0 + i * lh, { size, font, weight, color: fg, align, spacing: style === 'street' ? size * 0.04 : 0 });
      });
      age(ctx, w, h, r, agedAmt, { rust });
      return finish(c);
    });
    function finish(c) { return mkTex(c); }
  }
  function drawWordmarkMeasure(h) {
    const c = mk(8, 8), x = ctxOf(c);
    return drawWordmark(x, 0, 4, h);
  }
  // Tex.wordmark({w,h, bg:'teal'|null, color}) → texture of the original wordmark.
  function wordmark(o = {}) {
    return cached('wordmark' + stable(o), () => {
      const [w, h] = signSize(o, 512, 192);
      const c = mk(w, h), ctx = ctxOf(c);
      if (o.bg !== null && o.bg !== false) { ctx.fillStyle = o.bg || BRAND.teal; ctx.fillRect(0, 0, w, h); } else ctx.clearRect(0, 0, w, h);
      let s = h * 0.55;
      const mw = drawWordmarkMeasure(s);
      if (mw > w * 0.84) s *= (w * 0.84) / mw;
      const width = drawWordmarkMeasure(s);
      drawWordmark(ctx, (w - width) / 2, h / 2 + s * 0.3, s, { color: o.color || BRAND.yellow });
      if (o.age) age(ctx, w, h, U.rng(3), o.age);
      return mkTex(c);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Posters
  // ---------------------------------------------------------------------------------------------------------------
  const PLAN_COPY = ['UNLIMITED DATA', '5G HOME INTERNET', 'SWITCH & SAVE', 'MORE GB. MORE YOU.', 'BRING A FRIEND', 'NEW PHONE. SAME YOU.', 'ASK US ABOUT NBN', 'STAY CONNECTED'];
  const PRICES = ['$45', '$55', '$65', '$69', '$79', '$85', '$99'];
  function poster(str, o = {}) {
    const kind = o.kind || 'plan';
    return cached('poster|' + (str ?? '') + stable(o), () => {
      const [w, h] = signSize(o, 384, 544);
      const c = mk(w, h), ctx = ctxOf(c), r = U.rng(U.hash(String(str) + kind) ^ (o.seed || 5));
      const head = str || (kind === 'alarm' ? 'STAY CONNECTED' : kind === 'notice' ? 'NOTICE' : pickr(PLAN_COPY, r));
      const phone = (x, y, s, rot = 0) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-s * 0.26 + 6, -s * 0.5 + 8, s * 0.52, s);
        ctx.fillStyle = '#1a1d1e'; ctx.fillRect(-s * 0.26, -s * 0.5, s * 0.52, s);
        const g = ctx.createLinearGradient(-s * 0.23, -s * 0.46, s * 0.23, s * 0.46);
        g.addColorStop(0, '#2fc9c4'); g.addColorStop(0.5, '#0b6f76'); g.addColorStop(1, '#f2c84a');
        ctx.fillStyle = g; ctx.fillRect(-s * 0.23, -s * 0.45, s * 0.46, s * 0.88);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(-s * 0.23, -s * 0.45); ctx.lineTo(s * 0.1, -s * 0.45); ctx.lineTo(-s * 0.23, s * 0.1); ctx.fill();
        ctx.restore();
      };
      const fine = (y0, n, col = 'rgba(40,40,40,0.55)') => {
        ctx.font = `${Math.round(w * 0.022)}px ${FONT.sans}`; ctx.fillStyle = col;
        const words = ['Offer', 'ends', 'soon.', 'Min', 'cost', 'applies.', 'Coverage', 'varies', 'by', 'area.', 'Speeds', 'not', 'guaranteed.', 'T&Cs', 'apply.', 'Excl.', 'regional', 'areas.'];
        for (let i = 0; i < n; i++) { let s = ''; while (s.length < 58) s += pickr(words, r) + ' '; ctx.fillText(s, w * 0.06, y0 + i * w * 0.03); }
      };
      if (kind === 'plan' || kind === 'faded') {
        ctx.fillStyle = BRAND.teal; ctx.fillRect(0, 0, w, h);
        const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w);
        g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(0,40,40,0.3)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        phone(w * 0.7, h * 0.41, h * 0.3, 0.12);
        const hl = wrapTextBy(head, 2);
        const hs = fitSize(ctx, hl, w * 0.86, h * 0.17, (s) => `900 ${s}px ${FONT.heavy}`, w * 0.14, 1.05);
        hl.forEach((l, i) => text(ctx, l, w * 0.07, h * 0.05 + hs + i * hs * 1.05, { size: hs, font: FONT.heavy, weight: '900', color: '#ffffff' }));
        text(ctx, pickr(['Now on our best network.', 'Talk, text and data.', 'Ask in store today.'], r), w * 0.07, h * 0.08 + hs * (hl.length + 0.6), { size: w * 0.04, font: FONT.sans, color: 'rgba(255,255,255,0.85)' });
        ctx.fillStyle = BRAND.yellow; ctx.fillRect(0, h * 0.6, w, h * 0.2);
        const price = o.price || PRICES[U.hash(head + (o.seed || '')) % PRICES.length];
        text(ctx, price, w * 0.07, h * 0.76, { size: h * 0.15, font: FONT.heavy, weight: '900', color: BRAND.ink });
        ctx.font = `900 ${h * 0.15}px ${FONT.heavy}`;
        const pw = ctx.measureText(price).width;
        text(ctx, '/mth', w * 0.09 + pw, h * 0.7, { size: h * 0.045, font: FONT.sans, weight: 'bold', color: BRAND.ink });
        text(ctx, o.sub || pickr(['24 month plan', 'On a 12 month plan', 'Month to month', 'Includes 5G access*'], r), w * 0.09 + pw, h * 0.75, { size: h * 0.028, font: FONT.sans, color: BRAND.ink });
        ctx.fillStyle = '#f2f1ec'; ctx.fillRect(0, h * 0.8, w, h * 0.2);
        fine(h * 0.83, 3);
        drawWordmark(ctx, w * 0.06, h * 0.965, h * 0.05, { color: BRAND.tealDark });
      } else if (kind === 'alarm') {
        ctx.fillStyle = '#efe6d6'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = BRAND.teal; ctx.fillRect(0, 0, w, h * 0.1);
        drawWordmark(ctx, w * 0.06, h * 0.075, h * 0.05, { color: BRAND.yellow });
        const hs = fitSize(ctx, wrapTextBy(head || 'STAY CONNECTED', 2), w * 0.86, h * 0.16, (s) => `bold ${s}px ${FONT.serif}`, w * 0.1);
        wrapTextBy(head || 'STAY CONNECTED', 2).forEach((l, i) => text(ctx, l, w / 2, h * 0.14 + hs + i * hs * 1.1, { size: hs, font: FONT.serif, weight: 'bold', color: '#27403f', align: 'center' }));
        // the pendant: a round white device with a red button, on a short loop, product-shot style
        const px = w / 2, py = h * 0.5, pr = w * 0.15;
        ctx.strokeStyle = '#6d6a64'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py - pr * 1.25, pr * 0.35, pr * 0.5, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(px + 6, py + 8, pr, 0, TAU); ctx.fill();
        const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr);
        pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#c9c7c0');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b3261e'; ctx.beginPath(); ctx.arc(px, py, pr * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(px - pr * 0.12, py - pr * 0.14, pr * 0.15, 0, TAU); ctx.fill();
        text(ctx, o.sub || 'Personal Alarm — peace of mind at home.', w / 2, h * 0.72, { size: w * 0.042, font: FONT.serif, color: '#3b3a36', align: 'center' });
        text(ctx, 'Press and hold for help, day or night.*', w / 2, h * 0.765, { size: w * 0.034, font: FONT.serif, color: '#3b3a36', align: 'center' });
        fine(h * 0.84, 4, 'rgba(60,60,56,0.6)');
      } else { // notice
        ctx.fillStyle = '#ece8dc'; ctx.fillRect(0, 0, w, h);
        modulate(ctx, w, h, fbm(w, h, r, { cells: 3, oct: 3 }), 0.06);
        const lines = String(head).split('\n');
        const title = lines[0], body = lines.slice(1).join('\n') || o.sub || '';
        const ts = fitSize(ctx, [title.toUpperCase()], w * 0.84, h * 0.12, (s) => `bold ${s}px ${FONT.sans}`, w * 0.11);
        text(ctx, title.toUpperCase(), w / 2, h * 0.14, { size: ts, font: FONT.sans, weight: 'bold', color: '#191919', align: 'center' });
        ctx.fillStyle = '#191919'; ctx.fillRect(w * 0.08, h * 0.17, w * 0.84, 3);
        const bs = Math.round(w * 0.068);
        ctx.font = `${bs}px ${FONT.serif}`;
        wrapText(ctx, body, w * 0.82).forEach((l, i) => text(ctx, l, w * 0.09, h * 0.27 + i * bs * 1.35, { size: bs, font: FONT.serif, color: '#252525' }));
      }
      // aging: sun fade, creases, torn corner, tape
      const fade = kind === 'faded' ? 0.55 : (o.fade ?? 0.18);
      age(ctx, w, h, r, o.age ?? 1, { sun: fade });
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, h * (0.45 + r() * 0.1)); ctx.lineTo(w, h * (0.45 + r() * 0.1)); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(w * (0.45 + r() * 0.1), 0); ctx.lineTo(w * (0.45 + r() * 0.1), h); ctx.stroke();
      if (r() < 0.7) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); const tc = r() < 0.5; ctx.moveTo(tc ? w : 0, h); ctx.lineTo(tc ? w - w * 0.2 : w * 0.2, h); ctx.lineTo(tc ? w : 0, h - w * (0.12 + r() * 0.12)); ctx.fill(); ctx.restore(); }
      for (const [x, y] of [[w * 0.08, h * 0.02], [w * 0.92, h * 0.02]]) { ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.6); ctx.fillStyle = 'rgba(226,214,180,0.6)'; ctx.fillRect(-w * 0.07, -h * 0.018, w * 0.14, h * 0.036); ctx.restore(); }
      waterStain(ctx, w, h, r, w * r(), h * (0.6 + r() * 0.4), w * 0.2, 1.5);
      return mkTex(c);
    });
  }
  function wrapTextBy(s, maxLines) {
    const words = String(s).split(' ');
    if (words.length <= 1 || maxLines <= 1) return [String(s)];
    const out = [], per = Math.ceil(words.length / maxLines);
    for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(' '));
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Labels: name badges, lanyard cards, visitor stickers, tags
  // ---------------------------------------------------------------------------------------------------------------
  function label(str, o = {}) {
    str = String(str ?? '');
    const style = o.style || (str.includes('—') ? 'card' : 'badge');
    return cached('label|' + str + stable(o) + style, () => {
      const r = U.rng(U.hash(str + style));
      let w = 256, h = 96;
      if (style === 'card') { w = 192; h = 288; }
      if (style === 'visitor') { w = 256; h = 160; }
      if (style === 'sticker') { w = 128; h = 128; }
      if (style === 'tag') { w = 192; h = 96; }
      [w, h] = signSize(o, w, h);
      const c = mk(w, h), ctx = ctxOf(c);
      const [name, sub] = str.split('—').map((s) => s.trim());
      if (style === 'card') {
        ctx.fillStyle = '#f3f2ec'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = o.bg || BRAND.teal; ctx.fillRect(0, 0, w, h * 0.22);
        ctx.fillStyle = '#d8d6ce'; ctx.fillRect(w / 2 - w * 0.12, h * 0.03, w * 0.24, h * 0.03);
        drawWordmark(ctx, w * 0.08, h * 0.18, h * 0.07, { color: BRAND.yellow });
        // photo: grey-blue with a head-and-shoulders silhouette
        const px = w * 0.28, py = h * 0.27, pw = w * 0.44, ph = h * 0.3;
        const g = ctx.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, '#9fb0b4'); g.addColorStop(1, '#7c8c90');
        ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = o.photo || '#4b4744';
        ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph * 0.42, pw * 0.2, ph * 0.24, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph * 1.05, pw * 0.42, ph * 0.38, 0, Math.PI, TAU); ctx.fill();
        const ns = fitSize(ctx, [name.toUpperCase()], w * 0.86, h * 0.12, (s) => `bold ${s}px ${FONT.sans}`, 60);
        text(ctx, name.toUpperCase(), w / 2, h * 0.7, { size: ns, font: FONT.sans, weight: 'bold', color: BRAND.ink, align: 'center' });
        if (sub) {
          ctx.fillStyle = BRAND.yellow; ctx.fillRect(0, h * 0.76, w, h * 0.12);
          const ss = fitSize(ctx, [sub.toUpperCase()], w * 0.9, h * 0.08, (s) => `bold ${s}px ${FONT.sans}`, 40);
          text(ctx, sub.toUpperCase(), w / 2, h * 0.845, { size: ss, font: FONT.sans, weight: 'bold', color: BRAND.ink, align: 'center' });
        }
        text(ctx, o.role || 'RETAIL CONSULTANT', w / 2, h * 0.95, { size: h * 0.035, font: FONT.sans, color: '#555', align: 'center', spacing: 1 });
      } else if (style === 'visitor') {
        ctx.fillStyle = '#f5f4ef'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#c0261d'; ctx.fillRect(0, 0, w, h * 0.3);
        text(ctx, o.header || 'VISITOR', w / 2, h * 0.23, { size: h * 0.2, font: FONT.sans, weight: 'bold', color: '#fff', align: 'center', spacing: 3 });
        text(ctx, 'NAME', w * 0.06, h * 0.45, { size: h * 0.08, font: FONT.sans, color: '#888' });
        ctx.fillStyle = '#bbb'; ctx.fillRect(w * 0.06, h * 0.8, w * 0.88, 1.5);
        handwriting(ctx, name, w * 0.1, h * 0.75, { size: h * 0.26, color: '#1a1a1a', font: FONT.marker });
      } else if (style === 'sticker') {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = o.bg || '#ffcc00'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.46, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.04; ctx.stroke();
        // a simple friendly face
        ctx.fillStyle = BRAND.ink;
        ctx.beginPath(); ctx.arc(w * 0.38, h * 0.4, w * 0.045, 0, TAU); ctx.arc(w * 0.62, h * 0.4, w * 0.045, 0, TAU); ctx.fill();
        ctx.lineWidth = w * 0.035; ctx.strokeStyle = BRAND.ink; ctx.beginPath(); ctx.arc(w / 2, h * 0.5, w * 0.18, 0.25, Math.PI - 0.25); ctx.stroke();
        text(ctx, (name || 'OLLIE').toUpperCase(), w / 2, h * 0.84, { size: h * 0.12, font: FONT.heavy, weight: '900', color: BRAND.ink, align: 'center' });
      } else if (style === 'tag') {
        ctx.fillStyle = o.bg || '#f0ede2'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(w * 0.08, h / 2, h * 0.08, 0, TAU); ctx.fill();
        const ss = fitSize(ctx, [str], w * 0.78, h * 0.6, (s) => `${s}px ${FONT.mono}`, 60);
        text(ctx, str, w * 0.18, h / 2 + ss * 0.35, { size: ss, font: FONT.mono, color: o.fg || '#222' });
      } else { // badge
        ctx.fillStyle = o.bg || '#eeeeea'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = BRAND.teal; ctx.fillRect(0, 0, w * 0.1, h);
        ctx.fillStyle = BRAND.yellow; ctx.fillRect(w * 0.1, 0, w * 0.015, h);
        const lines = sub ? [name, sub] : [name];
        const ns = fitSize(ctx, [name.toUpperCase()], w * 0.78, h * (sub ? 0.45 : 0.6), (s) => `bold ${s}px ${FONT.sans}`, 80);
        text(ctx, name.toUpperCase(), w * 0.56, h * (sub ? 0.5 : 0.5) + ns * (sub ? 0.1 : 0.35), { size: ns, font: FONT.sans, weight: 'bold', color: o.fg || BRAND.ink, align: 'center' });
        if (lines.length > 1) text(ctx, sub.toUpperCase(), w * 0.56, h * 0.82, { size: h * 0.16, font: FONT.sans, color: '#444', align: 'center' });
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      if (o.age) age(ctx, w, h, r, o.age);
      else scuffs(ctx, w, h, r, 4, [255, 255, 255], 0.15, w * 0.2);
      return mkTex(c);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dynamic screens (monitors, phones, TVs): draw into the canvas, then update()
  // ---------------------------------------------------------------------------------------------------------------
  function screen(w = 256, h = 192) {
    const c = mk(Math.round(w), Math.round(h), false), ctx = ctxOf(c);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    const tex = mkTex(c, { mips: false });
    const s = {
      tex, canvas: c, ctx, w: c.width, h: c.height,
      draw(fn) { fn(ctx, c.width, c.height); tex.needsUpdate = true; return s; },
      update() { tex.needsUpdate = true; return s; },
      dispose() { tex.dispose(); },
    };
    return s;
  }

  // CONTRACT+: Tex.define(name, {px, size, gen(ctx,w,h,rng,opts) → {rough?, bump?, bumpScale?}, mat:{roughness,…}, outage})
  // — register a content-specific surface generator (then Tex.get/Tex.mat work with it). outage: another texture id
  // (its Outage partner), 'self' (the same texture, darkened teal) or false (no dissolve).
  function defineTex(name, d) { if (d.outage !== undefined) OUTAGE_PARTNER[name] = d.outage; return define(name, d); }

  // CONTRACT+: Tex.preload(names = all, onProgress(i, n)) → Promise — generate textures in ~12 ms slices (boot/LOADING)
  // so later room builds never pay for generation. Entries are names or [name, opts] variants
  // (e.g. ['bitumen', {lines:'center'}]). Outage partners are included.
  function preload(names, onProgress) {
    const list = (names || Object.keys(GEN)).filter((n) => GEN[Array.isArray(n) ? n[0] : n]);
    // (outage partners that are texture ids; 'self' and false are not textures to generate)
    for (const n of [...list]) { const p = OUTAGE_PARTNER[Array.isArray(n) ? n[0] : n]; if (typeof p === 'string' && GEN[p] && !list.includes(p)) list.push(p); }
    return new Promise((resolveP) => {
      let i = 0;
      const step = () => {
        const t0 = performance.now();
        while (i < list.length && performance.now() - t0 < 12) { const e = list[i]; if (Array.isArray(e)) build(e[0], e[1] || {}); else build(e); i++; if (onProgress) onProgress(i, list.length); }
        if (i < list.length) setTimeout(step, 0); else { for (const rec of [...pending]) resolvePartner(rec); resolveP(list.length); }
      };
      step();
    });
  }
  function stats() { return { textures: cache.size, text: textCache.size, materials: matCache.size, pendingOutage: pending.size }; }

  return {
    get, mat, canvas, sign, wordmark, drawWordmark, poster, label, screen, handwriting, handFontPresent,
    setOutage, outageify, define: defineTex, stats, preload,
    get outage() { return U_OUTAGE.value; },
    // CONTRACT+: Tex.setFocus(v3) — centre of the dissolve spread (Render.update keeps it on the player).
    setFocus(v) { if (v) U_FOCUS.value.copy(v); },
    // CONTRACT+: Tex.tick(dt) — animates the dissolve-edge shimmer (Render.update calls it).
    tick(dt) { U_TIME.value = (U_TIME.value + dt) % 1000; },
    // CONTRACT+: metres covered by one tile of a named texture (Kit can set repeat = length / Tex.size(name)).
    size(name) { return (GEN[name] && GEN[name].size) || 1; },
    list() { return Object.keys(GEN); },
    fonts: FONT, brand: BRAND, outageColors: OUT,
    // Low-level helpers for other modules that draw their own canvases (Menus paper, Phone screen …).
    util: { fbm, vnoise, text, wrapText, fitSize, age, grainPass, modulate, rgba, hex, mk: (w, h) => mk(w, h), mkTex, waterStain, drawCircuit },
  };
})();
