/* Marswalk · idioma de la interfaz (inglés por defecto; español).
 *
 * Fuente = español. El texto original de la app es la clave y EN[] guarda la traducción:
 *   I18N.t('Distancia')                 -> 'Distance' (en) · 'Distancia' (es)
 *   I18N.t('Llegas a las {h}', { h })   -> con variables {h}
 *   I18N.apply(raíz)                    -> traduce el DOM ya escrito en HTML (texto, title, aria-label, placeholder)
 * Idioma: ?lang=en|es en la URL > localStorage > 'en'. Al cambiarlo se guarda y se reaplica.
 * Textos que no están en EN se registran en I18N.missing (útil para completar la traducción).
 */
(function () {
  const KEY = 'marswalk.lang', ATTRS = ['title', 'aria-label', 'placeholder'], SKIP = /^(SCRIPT|STYLE|CANVAS|SVG|INPUT|SELECT|TEXTAREA)$/;
  const EN = window.I18N_EN || {};   // traducciones al inglés: ui/i18n-en.js (clave = texto español)
  const orig = new WeakMap(), origAttr = new WeakMap(), missing = new Set();
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  function detect() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'es' || q === 'en') return q;
    try { const s = localStorage.getItem(KEY); if (s === 'es' || s === 'en') return s; } catch (e) {}
    return 'en';
  }
  let lang = detect();

  function t(src, vars) {
    let s = src;
    if (lang === 'en') { if (EN[src] != null) s = EN[src]; else if (src) missing.add(src); }
    for (const v in (vars || {})) s = s.split('{' + v + '}').join(vars[v]);
    return s;
  }
  // traduce un texto suelto y registra el que falte
  const tr = (src) => (lang === 'en' && EN[src] != null) ? EN[src] : (lang === 'en' && src && missing.add(src), src);

  // contenido de un elemento (sus hijos, sin atributos del propio elemento)
  const inner = (el) => [...el.childNodes].map((n) => (n.nodeType === 3 ? n.nodeValue : n.outerHTML)).join('');
  function translateEl(el) {
    if (!orig.has(el)) orig.set(el, norm(inner(el)));
    const src = orig.get(el);
    const next = tr(src);
    if (next !== norm(inner(el))) el.innerHTML = next;
    if (el.classList && el.classList.contains('px-btn') && window.PxButton) { el.dataset.label = norm(el.textContent); PxButton.render(el); }
  }
  // nodo "simple": texto o etiqueta de estilo sin atributos (b, i, br, strong, em), para traducir el bloque entero
  const plain = (n) => n.nodeType === 3 || (n.nodeType === 1 && /^(B|I|BR|STRONG|EM)$/.test(n.tagName) && n.attributes.length === 0 && [...n.childNodes].every(plain));
  function walk(el) {
    if (!el || el.nodeType !== 1 || SKIP.test(el.tagName)) return;
    for (const a of ATTRS) if (el.hasAttribute(a)) {
      if (!origAttr.has(el)) origAttr.set(el, {});
      const o = origAttr.get(el); if (!(a in o)) o[a] = el.getAttribute(a);
      el.setAttribute(a, tr(o[a]));
    }
    const ctl = el.querySelector('input,select,textarea,canvas,iframe');
    if (!ctl && [...el.childNodes].every(plain)) { translateEl(el); return; }   // bloque de texto (puede llevar <b>, <br>...)
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) {                                    // texto suelto entre etiquetas
        const m = n.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/); if (!m[2]) continue;
        if (!orig.has(n)) orig.set(n, m[2]);
        const src = orig.get(n); n.nodeValue = m[1] + tr(src) + m[3];
      } else if (n.nodeType === 1) walk(n);
    }
  }

  let titleSrc = null;
  function apply(root) {
    root = root || document.body;
    if (titleSrc == null) titleSrc = document.title;
    if (root === document.body) document.title = tr(titleSrc);
    walk(root);
    document.documentElement.lang = lang;
    document.dispatchEvent(new CustomEvent('langapply', { detail: lang }));
  }

  function set(l) {
    if (l !== 'en' && l !== 'es') return;
    lang = l; try { localStorage.setItem(KEY, l); } catch (e) {}
    document.querySelectorAll('[data-setlang]').forEach((b) => b.classList.toggle('on', b.dataset.setlang === l));
    apply(document.body); document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  function wire() {
    document.querySelectorAll('[data-setlang]').forEach((b) => { b.classList.toggle('on', b.dataset.setlang === lang); b.onclick = () => set(b.dataset.setlang); });
  }
  // el enlace a otra página conserva el idioma
  const withLang = (url) => { const i = url.indexOf('#'), base = i < 0 ? url : url.slice(0, i), hash = i < 0 ? '' : url.slice(i); return base + (base.includes('?') ? '&' : '?') + 'lang=' + lang + hash; };

  const API = {
    get lang() { return lang; }, set, t, tr, apply, withLang, missing, dict: EN,
    get isEN() { return lang === 'en'; },
  };
  if (typeof module !== 'undefined') module.exports = API; else window.I18N = API;

  document.addEventListener('DOMContentLoaded', () => { document.documentElement.lang = lang; wire(); if (lang === 'en') apply(document.body); });
})();
