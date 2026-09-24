// ==== main.js — boot ====
try {
  if (typeof Game === 'undefined') {
    // Partial build (engine incomplete): expose modules for testing and stop here.
    const b = document.getElementById('boot'); if (b) b.textContent = 'ENGINE INCOMPLETE';
    window.SH.partial = true;
  } else {
    Game.boot();
  }
} catch (e) {
  console.error(e);
  const f = document.getElementById('fatal');
  if (f) { f.style.display = 'block'; f.textContent = 'Boot failed: ' + (e && e.stack || e); }
}
