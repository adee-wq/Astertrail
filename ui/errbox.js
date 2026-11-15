/* Marswalk · muestra en pantalla cualquier error de JavaScript (para diagnosticar sin abrir F12). */
(function () {
  const list = [];
  function show(msg) {
    list.push(msg); let b = document.getElementById('errbox');
    if (!b) { b = document.createElement('div'); b.id = 'errbox';
      b.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99999;max-width:60vw;padding:10px 14px;background:#3a0606;color:#ffd2c2;' +
        'font:14px/1.35 monospace;border:3px solid #ff3b1f;white-space:pre-wrap;cursor:pointer';
      b.title = 'clic para ocultar'; b.onclick = () => b.remove(); (document.body || document.documentElement).appendChild(b); }
    b.textContent = 'ERROR (envíale esto a Claude):\n' + list.slice(-6).join('\n');
  }
  window.addEventListener('error', (e) => { if (e.message) show(`${e.message}  @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}:${e.colno}`); });
  window.addEventListener('unhandledrejection', (e) => show('promesa: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  window.MW_REPORT = (where, err) => { console.error(where, err); show(`${where}: ${err && err.message}  ${(err && err.stack || '').split('\n')[1] || ''}`); };
})();
