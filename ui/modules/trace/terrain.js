/* Marswalk · módulo Trace · Terrain Analyzer (puro, sin DOM; solo LEE el DEM compartido).
 *
 *   const ta = TraceTerrain.create(dem);          // dem = DEM.from(window.DEM_DATA)
 *   ta.rough(lat, lon)  -> m, RMS del terreno respecto a un plano ajustado en 5×5 celdas (escala 10–50 m) o null
 *   ta.slope(lat, lon)  -> °, pendiente máxima del terreno (en cualquier dirección) o null
 *   ta.roughScale       -> {p50, p95} de la región (calibra el riesgo de rugosidad con los datos reales)
 *
 * Limitación: con el DEM de 10 m la rugosidad describe ondulaciones de decenas de metros,
 * no piedras ni arena (eso necesitaría el DEM de 1 m o imágenes).
 */
(function () {
  function create(dem) {
    const [cx, cy] = dem.cell, RAD = Math.PI / 180;
    const dLat = cy / (3396190 * RAD), dLon = cx / (3396190 * RAD * Math.cos(dem.bounds[0][0] * RAD));
    const K = 2;                                  // ventana (2K+1)² = 5×5 celdas

    function rough(lat, lon) {
      // plano z = c + a·x + b·y por mínimos cuadrados en una rejilla simétrica: a = Σzx/Σx², b = Σzy/Σy²
      const zs = []; let sz = 0, sx = 0, sy = 0, xx = 0, yy = 0;
      for (let j = -K; j <= K; j++) for (let i = -K; i <= K; i++) {
        const z = dem.elev(lat + j * dLat, lon + i * dLon); if (z == null) return null;
        zs.push([i, j, z]); sz += z; sx += z * i; sy += z * j; xx += i * i; yy += j * j;
      }
      const c = sz / zs.length, a = sx / xx, b = sy / yy;
      let e2 = 0; for (const [i, j, z] of zs) e2 += (z - (c + a * i + b * j)) ** 2;
      return Math.sqrt(e2 / zs.length);
    }

    // calibración: percentiles de rugosidad en toda la región del DEM (submuestreo)
    const [[s, w], [n, e]] = dem.bounds, vals = [];
    const step = 4;
    for (let la = s + (K + 1) * dLat; la < n - (K + 1) * dLat; la += step * dLat)
      for (let lo = w + (K + 1) * dLon; lo < e - (K + 1) * dLon; lo += step * dLon) { const r = rough(la, lo); if (r != null) vals.push(r); }
    vals.sort((p, q) => p - q);
    const pct = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : null;

    return { rough, slope: dem.slope, elev: dem.elev, roughScale: { p50: pct(0.5), p95: pct(0.95), n: vals.length } };
  }

  const API = { create };
  if (typeof module !== 'undefined') module.exports = API; else window.TraceTerrain = API;
})();
