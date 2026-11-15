/* Marswalk · módulo Trace · Gamification Manager (puro: recibe y devuelve el estado; la página lo guarda).
 *   const out = TraceGame.record(estado, misionId, intento)  -> { estado, nuevas[], mejor, intentos[] }
 *   intento = { ok, rss, clase, dist_m, dur_s, soc, criticos, n_wp }
 * Estado propio del módulo (nunca toca el mapa): { juego: { [misionId]: { intentos[], mejor, medallas{} } } }
 */
(function () {
  const MEDALLAS = [
    { id: 'explorador', nombre: 'EXPLORADOR', desc: 'Cumplir la misión', ok: (a) => a.ok },
    { id: 'segura', nombre: 'RUTA SEGURA', desc: 'Cumplir con RSS ≥ 75', ok: (a) => a.ok && a.rss >= 75 },
    { id: 'impecable', nombre: 'RUTA IMPECABLE', desc: 'Cumplir con RSS ≥ 90', ok: (a) => a.ok && a.rss >= 90 },
    { id: 'ahorro', nombre: 'AHORRO DE ENERGÍA', desc: 'Volver con batería ≥ 85 %', ok: (a) => a.ok && a.soc >= 0.85 },
    { id: 'sin_criticos', nombre: 'SIN SUSTOS', desc: 'Cumplir sin tramos críticos', ok: (a) => a.ok && a.criticos === 0 },
    { id: 'primera', nombre: 'A LA PRIMERA', desc: 'Cumplir en el primer intento', ok: (a, st) => a.ok && st.intentos.length === 1 },
  ];
  const MAX_INTENTOS = 8;

  function record(estado, id, a) {
    const E = JSON.parse(JSON.stringify(estado || {})); E.juego = E.juego || {};
    const st = E.juego[id] = E.juego[id] || { intentos: [], mejor: null, medallas: {} };
    const n = (st.total || 0) + 1; st.total = n;
    st.intentos.push(Object.assign({ n, fecha: new Date().toISOString() }, a));
    if (st.intentos.length > MAX_INTENTOS) st.intentos.shift();
    const prev = st.mejor;
    if (a.ok && (!prev || a.rss > prev.rss)) st.mejor = { rss: a.rss, clase: a.clase, n };
    const nuevas = [];
    for (const m of MEDALLAS) if (!st.medallas[m.id] && m.ok(a, { intentos: st.total === 1 ? [a] : [0, 0] })) { st.medallas[m.id] = n; nuevas.push(m); }
    return { estado: E, nuevas, mejor: st.mejor, record: !!(a.ok && st.mejor && st.mejor.n === n && prev), intentos: st.intentos, medallas: st.medallas };
  }
  const progress = (estado, id) => ((estado || {}).juego || {})[id] || { intentos: [], mejor: null, medallas: {} };

  const API = { MEDALLAS, record, progress };
  if (typeof module !== 'undefined') module.exports = API; else window.TraceGame = API;
})();
