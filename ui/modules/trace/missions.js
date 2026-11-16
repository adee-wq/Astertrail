/* Marswalk · módulo Trace · Mission Manager (puro, sin DOM).
 * Cada misión define: inicio del rover, objetivo (posición + radio), ida y vuelta, reserva de batería,
 * hora de salida por defecto (la UI usa la "hora actual" del mapa si llega por ?t0=) y condiciones de fin.
 *
 *   TraceMissions.list, TraceMissions.get(id)
 *   TraceMissions.check(mission, route, sim, ev) -> { ok, objetivos[{id, ok, txt}], bloqueos[], fallos[] }
 *      bloqueos = impiden LANZAR (ruta inválida o incompleta) · fallos = la misión falla al ejecutarse (batería)
 */
(function () {
  const RAD = Math.PI / 180;
  const TX = (src, v) => (typeof I18N !== 'undefined' ? I18N.t(src, v) : src);   // texto visible en el idioma elegido
  const dist = (a, b) => {
    const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * 3389500 * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  const MISSIONS = [{
    id: 'water-signs',
    nombre: 'FIND THE WATER SIGNS',
    briefing: 'Los orbitadores detectaron minerales que solo se forman con agua en las capas bajas del monte Sharp. ' +
              'Lleva el rover hasta la zona objetivo, toma la muestra y vuelve a la base antes de quedarte sin batería.',
    inicio: [-4.7050, 137.3550],
    objetivo: { pos: [-4.7200, 137.3850], radio: 150, nombre: 'ZONA OBJETIVO · minerales hidratados (ubicación ilustrativa)' },
    idaYVuelta: true, radioVuelta: 150,
    t0: 1520.375,                    // sol 1520 · 09:00 LTST
    soc_min: 0.20,
    pista: 'La línea recta cruza un escarpe de más de 25°. Mira el perfil y busca el rodeo.',
    fuente: 'Escenario educativo. El objetivo es ilustrativo, sobre terreno real (HiRISE + DEM USGS de Gale).',
  }];

  function check(m, route, sim, ev) {
    const objetivos = [], bloqueos = [], fallos = [];
    const has = route.length >= 2 && sim;
    const dObj = has ? Math.min(...sim.s.map((p) => dist([p.lat, p.lon], m.objetivo.pos))) : Infinity;
    const okObj = dObj <= m.objetivo.radio;
    objetivos.push({ id: 'obj', ok: okObj, txt: TX('Llegar a la zona objetivo (≤ {r} m)', { r: m.objetivo.radio }) });
    const start = route.length ? dist(route[0], m.inicio) <= m.radioVuelta : false;
    const back = has ? dist(route[route.length - 1], m.inicio) <= m.radioVuelta : false;
    if (m.idaYVuelta) objetivos.push({ id: 'vuelta', ok: start && back, txt: TX('Salir de la base y volver a ella') });
    const okInt = has && ev && ev.valida;
    objetivos.push({ id: 'trans', ok: !!okInt, txt: TX('Sin tramos intransitables (> 25°)') });
    const soc = has ? sim.summary.SOC_end : null, okBat = soc != null && soc >= m.soc_min;
    objetivos.push({ id: 'bat', ok: okBat, txt: TX('Volver con batería ≥ {b} %', { b: Math.round(m.soc_min * 100) }) });

    if (!has) bloqueos.push({ k: 'vacia' });
    else {
      if (!start) bloqueos.push({ k: 'inicio' });
      if (!okObj) bloqueos.push({ k: 'invalida_obj', r: m.objetivo.radio });
      if (m.idaYVuelta && !back) bloqueos.push({ k: 'invalida_vuelta', r: m.radioVuelta });
      if (ev && !ev.valida) { const s = ev.segs.find((x) => x.intransitable); bloqueos.push({ k: 'invalida_intrans', i: s.i, th: s.theta_max.toFixed(1), max: sim.vehicle.theta_max }); }
      if (!okBat) fallos.push({ k: 'invalida_bat', soc: Math.round(soc * 100), min: Math.round(m.soc_min * 100) });
    }
    return { ok: objetivos.every((o) => o.ok), objetivos, bloqueos, fallos, dObj };
  }

  const API = { list: MISSIONS, get: (id) => MISSIONS.find((m) => m.id === id) || MISSIONS[0], check, dist };
  if (typeof module !== 'undefined') module.exports = API; else window.TraceMissions = API;
})();
