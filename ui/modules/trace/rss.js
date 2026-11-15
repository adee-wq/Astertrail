/* Marswalk · módulo Trace · Route Evaluator: Route Safety Score (puro, sin DOM).
 *
 *   const ev = TraceRSS.evaluate({ route, sim, terrain, config });
 *     route   [[lat, lon], ...] waypoints
 *     sim     resultado de SIM.simulate (muestras con dist, theta, Tlo, SOC...)
 *     terrain TraceTerrain.create(dem)
 *   ev = { rss, clase, valida, segs[{i, d, S, G, T, A, R, P, critico, intransitable, dominante, avisos[]}],
 *          criticos[], peores[], avisos[], unknown }
 *
 * Por segmento (entre waypoints consecutivos), riesgos 0–100:
 *   S pendiente   p90 de |θ| en el tramo: 0 hasta S0°, 100 en S1° (θ_max del vehículo). Máximo > θ_max -> intransitable.
 *   G rugosidad   p90 de la rugosidad: 0 en el p50 de la región, 100 en el p95.
 *   T temperatura peor caso (μ−1.96σ) a la hora de paso: 0 desde T0 K, 100 en T1 K.
 *   A accesibilidad fracción del tramo con terreno > A_deg° alrededor (obstáculos) o sin dato.
 *   Dato desconocido = 100 (no se interpreta como seguro).
 *   Rᵢ = wS·S + wG·G + wT·T + wA·A      Pᵢ = 100 − Rᵢ
 *   RSS = 100 − Σ(dᵢ·Rᵢ)/Σdᵢ  (1–100). Un tramo crítico (Pᵢ < 25) limita el RSS a ≤ 49. Un tramo intransitable invalida la ruta.
 * Reproducible: mismos datos + misma configuración -> mismo resultado (sin aleatoriedad).
 */
(function () {
  const CONFIG = {
    pesos: { S: 0.35, G: 0.30, T: 0.20, A: 0.15 },
    escalas: { S0: 5, S1: 25, T0: 258, T1: 203, A_deg: 20, A_full: 0.2 },   // A_full: fracción de obstáculos que da riesgo 100
    critico_P: 25, tope_critico: 49,
    habilitados: { S: true, G: true, T: true, A: true },   // un factor deshabilitado cuenta como desconocido (100), no como seguro
  };
  const CLASES = [[90, 'MUY SEGURA'], [75, 'SEGURA'], [50, 'PRECAUCIÓN'], [25, 'PELIGROSA'], [1, 'CRÍTICA']];
  const clase = (v) => (CLASES.find(([m]) => v >= m) || CLASES[CLASES.length - 1])[1];
  const lin = (x, a, b) => Math.max(0, Math.min(100, (x - a) / (b - a) * 100));
  const p90 = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(0.9 * v.length))] : null; };
  const RAD = Math.PI / 180;

  function evaluate({ route, sim, terrain, config }) {
    const C = JSON.parse(JSON.stringify(CONFIG)); if (config) for (const k in config) Object.assign(C[k], config[k]);
    const thMax = sim.vehicle.theta_max, dist = (a, b) => {
      const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
      return 2 * 3389500 * Math.asin(Math.min(1, Math.sqrt(h)));
    };
    const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + dist(route[i - 1], route[i]));
    const rs = terrain.roughScale, segs = [];
    let unknown = 0;
    for (let k = 0; k < route.length - 1; k++) {
      const d = cum[k + 1] - cum[k]; if (d <= 0) continue;
      const ss = sim.s.filter((p) => p.dist >= cum[k] - 1e-6 && p.dist <= cum[k + 1] + 1e-6);
      const th = ss.map((p) => Math.abs(p.theta) / RAD), thMaxSeg = Math.max(...th);
      const rough = ss.map((p) => terrain.rough(p.lat, p.lon)), tslope = ss.map((p) => terrain.slope(p.lat, p.lon));
      const noDem = ss.filter((p) => p.noDem).length / ss.length;
      const f = {};
      f.S = noDem > 0.5 ? 100 : lin(p90(th), C.escalas.S0, C.escalas.S1);
      const rg = p90(rough); f.G = rg == null || rs.p50 == null ? 100 : lin(rg, rs.p50, rs.p95);
      const Tw = ss.map((p) => p.Tlo).filter((x) => x != null);
      f.T = Tw.length < ss.length ? 100 : lin(Math.min(...Tw), C.escalas.T0, C.escalas.T1);
      const bad = tslope.filter((x) => x == null || x > C.escalas.A_deg).length / ss.length;
      f.A = lin(bad, 0, C.escalas.A_full);
      for (const k2 of ['S', 'G', 'T', 'A']) if (!C.habilitados[k2]) f[k2] = 100;
      const R = C.pesos.S * f.S + C.pesos.G * f.G + C.pesos.T * f.T + C.pesos.A * f.A;
      const intransitable = thMaxSeg > thMax, P = 100 - R;
      const contrib = ['S', 'G', 'T', 'A'].map((x) => [x, C.pesos[x] * f[x]]).sort((a, b) => b[1] - a[1]);
      if (noDem > 0 || Tw.length < ss.length) unknown++;
      segs.push({ i: k + 1, desde: k + 1, hasta: k + 2, d, S: f.S, G: f.G, T: f.T, A: f.A, R, P, intransitable,
                  critico: P < C.critico_P || intransitable, dominante: contrib[0][0],
                  theta_p90: p90(th), theta_max: thMaxSeg, rough_p90: rg, Tlo_min: Tw.length ? Math.min(...Tw) : null, obst: bad,
                  sinDato: noDem > 0 || Tw.length < ss.length });
    }
    const Dt = segs.reduce((a, s) => a + s.d, 0);
    let rss = segs.length ? 100 - segs.reduce((a, s) => a + s.d * s.R, 0) / Dt : 1;
    const criticos = segs.filter((s) => s.critico), valida = !segs.some((s) => s.intransitable);
    if (criticos.length) rss = Math.min(rss, C.tope_critico);
    rss = Math.max(1, Math.min(100, Math.round(rss)));
    return { rss, clase: clase(rss), valida, segs, criticos, unknown,
             peores: segs.slice().sort((a, b) => b.R - a.R).slice(0, 3), config: C };
  }

  const API = { CONFIG, CLASES, clase, evaluate };
  if (typeof module !== 'undefined') module.exports = API; else window.TraceRSS = API;
})();
