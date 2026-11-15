/* Astertrail · ruta óptima sobre el DEM (puro, sin DOM; corre en navegador y en node).
 *
 *   const r = RouteOpt.find({ sim: SIM, dem, from: [lat, lon], to: [lat, lon], terrain, ...opciones });
 *   r = { route [[lat, lon], ...] (≤ maxVerts vértices), raw (camino de la rejilla), cost_s, expanded, ms, res, lim, blocked_m } o null
 *   RouteOpt.roundTrip({ ... }) -> { route (ida + vuelta, ≤ maxVerts), ida, vuelta, ms } o null
 *
 * A* de 8 vecinos sobre una rejilla de `res` metros (por defecto la resolución del DEM).
 *   costo de un paso = tiempo con la física de sim.js:
 *       F = m·g·(Crr·cosθ + sinθ)     v = min(v_crucero, η·P_max/F, v_bajada(θ))     Δt = d / v
 *     × (1 + kRough · G)   G = rugosidad 0–1 (terrain.js: 0 en el p50 de la región, 1 en el p95)
 *   celdas con pendiente del terreno > lim (= θ_max − margen) prohibidas; pasos con |θ| > θ_max prohibidos.
 *   heurística = distancia en línea recta / v_crucero (admisible: ningún paso va más rápido).
 * El camino se simplifica con Douglas-Peucker; un tramo recto solo se acepta si no pisa celdas prohibidas.
 * Si se pasa `sim`, la ruta final se comprueba con sim.simulate: si queda algún tramo intransitable se
 * repite con más margen (el simulador mide la pendiente cada 5 m; la rejilla, cada `res` m).
 * Determinista: mismos datos + mismas opciones -> misma ruta.
 */
(function () {
  const R_MARS = 3389500, RAD = Math.PI / 180;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function search(o, lim) {
    const V = o.V, [[S, W], [N, E]] = o.dem.bounds, res = o.res;
    const mLat = R_MARS * RAD, mLon = R_MARS * RAD * Math.cos((o.from[0] + o.to[0]) / 2 * RAD);
    const dLat = res / mLat, dLon = res / mLon, pad = o.pad;
    const lat0 = Math.max(S, Math.min(o.from[0], o.to[0]) - pad / mLat), lat1 = Math.min(N, Math.max(o.from[0], o.to[0]) + pad / mLat);
    const lon0 = Math.max(W, Math.min(o.from[1], o.to[1]) - pad / mLon), lon1 = Math.min(E, Math.max(o.from[1], o.to[1]) + pad / mLon);
    const nx = Math.floor((lon1 - lon0) / dLon) + 1, ny = Math.floor((lat1 - lat0) / dLat) + 1, n = nx * ny;
    if (!(nx > 1 && ny > 1)) return null;
    const LAT = (j) => lat0 + j * dLat, LON = (i) => lon0 + i * dLon;
    const idx = (p) => { const i = Math.round((p[1] - lon0) / dLon), j = Math.round((p[0] - lat0) / dLat); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };

    // datos por celda, calculados solo cuando el A* llega a ella
    const z = new Float32Array(n), st = new Uint8Array(n), pen = new Float32Array(n);   // st: 0 sin calcular · 1 libre · 2 prohibida
    const rs = o.terrain && o.terrain.roughScale, kR = rs && rs.p50 != null && rs.p95 > rs.p50 ? o.kRough : 0;
    function cell(k) {
      if (st[k]) return st[k];
      const la = LAT((k / nx) | 0), lo = LON(k % nx), e = o.dem.elev(la, lo), sl = e == null ? null : o.dem.slope(la, lo);
      if (e == null || sl == null || sl > lim) return (st[k] = 2);
      z[k] = e; pen[k] = 1;
      if (kR) { const r = o.terrain.rough(la, lo); pen[k] = 1 + kR * (r == null ? 1 : Math.max(0, Math.min(1, (r - rs.p50) / (rs.p95 - rs.p50)))); }
      return (st[k] = 1);
    }
    const free = (la, lo) => { const sl = o.dem.slope(la, lo); return sl != null && sl <= lim; };

    const mg = V.m * o.g, thMax = V.theta_max * RAD, vPmax = V.eta * V.P_max;
    function stepTime(d, dz) {                       // s para avanzar d metros subiendo dz (Infinity = prohibido)
      const th = Math.atan(dz / d); if (Math.abs(th) > thMax) return Infinity;
      const F = mg * (V.Crr * Math.cos(th) + Math.sin(th));
      let v = V.v_crucero;
      if (F > 0) v = Math.min(v, vPmax / F);
      if (th < 0) v = Math.min(v, V.v_crucero * Math.max(0.3, 1 - 0.5 * -th / thMax));
      return d / Math.max(V.v_min, v);
    }

    // inicio y meta: la celda libre más cercana (por si el punto exacto cae en una celda prohibida)
    const snap = (p) => { const k0 = idx(p); if (k0 < 0) return -1; if (cell(k0) === 1) return k0;
      const i0 = k0 % nx, j0 = (k0 / nx) | 0; let best = -1, bd = Infinity;
      for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const d = di * di + dj * dj; if (d < bd && cell(j * nx + i) === 1) { bd = d; best = j * nx + i; } }
      return best; };
    const a = snap(o.from), b = snap(o.to); if (a < 0 || b < 0) return null;
    const bi = b % nx, bj = (b / nx) | 0, dx = dLon * mLon, dy = dLat * mLat, rGoal = o.goalRadius || 0;
    const toGoal = (k) => Math.hypot((k % nx - bi) * dx, (((k / nx) | 0) - bj) * dy);
    const h = (k) => Math.max(0, toGoal(k) - rGoal) / V.v_crucero;

    const g = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const hf = [], hk = [];                          // montículo binario (f, celda)
    const push = (f, k) => { let i = hf.length; hf.push(f); hk.push(k);
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hk[i] = hk[p]; i = p; } hf[i] = f; hk[i] = k; };
    const pop = () => { const k = hk[0], f = hf.pop(), kk = hk.pop(), m = hf.length; if (m) { let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= m) break; if (c + 1 < m && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; hf[i] = hf[c]; hk[i] = hk[c]; i = c; } hf[i] = f; hk[i] = kk; } return k; };
    const NB = [[1, 0, dx], [-1, 0, dx], [0, 1, dy], [0, -1, dy], [1, 1, Math.hypot(dx, dy)], [1, -1, Math.hypot(dx, dy)], [-1, 1, Math.hypot(dx, dy)], [-1, -1, Math.hypot(dx, dy)]];
    g[a] = 0; push(h(a), a);
    let expanded = 0, end = -1;
    while (hf.length) {
      const k = pop(); if (done[k]) continue; done[k] = 1; expanded++;
      if (k === b || (rGoal && toGoal(k) <= rGoal)) { end = k; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, d] of NB) {
        const i2 = i + di, j2 = j + dj; if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        const q = j2 * nx + i2; if (done[q] || cell(q) !== 1) continue;
        if (di && dj && (cell(k + di) !== 1 || cell(k + dj * nx) !== 1)) continue;       // sin cortar esquinas de celdas prohibidas
        const dt = stepTime(d, z[q] - z[k]); if (dt === Infinity) continue;
        const c = g[k] + dt * (pen[k] + pen[q]) / 2;
        if (c < g[q]) { g[q] = c; prev[q] = k; push(c + h(q), q); }
      }
    }
    if (end < 0) return null;
    const raw = []; for (let k = end; k >= 0; k = prev[k]) raw.push([LAT((k / nx) | 0), LON(k % nx)]);
    raw.reverse();
    if (cell(idx(o.from)) === 1) raw[0] = o.from.slice();                                // extremos exactos si son transitables
    if (end === b && cell(idx(o.to)) === 1) raw[raw.length - 1] = o.to.slice();
    return { raw, cost_s: g[end], expanded, free, mLat, mLon, nodes: n };
  }

  // Douglas-Peucker con restricción: un tramo recto solo vale si se desvía ≤ tol y no pisa terreno prohibido
  function simplify(pts, tol, free, mLat, mLon) {
    const X = pts.map((p) => [p[1] * mLon, p[0] * mLat]), keep = new Uint8Array(pts.length);
    const clear = (i, j) => { const L = Math.hypot(X[j][0] - X[i][0], X[j][1] - X[i][1]), m = Math.max(1, Math.ceil(L / 5));
      for (let s = 1; s < m; s++) { const u = s / m; if (!free(pts[i][0] + (pts[j][0] - pts[i][0]) * u, pts[i][1] + (pts[j][1] - pts[i][1]) * u)) return false; } return true; };
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop(); if (j <= i + 1) continue;
      const ax = X[i][0], ay = X[i][1], bx = X[j][0] - ax, by = X[j][1] - ay, L2 = bx * bx + by * by || 1;
      let far = -1, fd = -1;
      for (let k = i + 1; k < j; k++) { const u = Math.max(0, Math.min(1, ((X[k][0] - ax) * bx + (X[k][1] - ay) * by) / L2));
        const d = Math.hypot(X[k][0] - ax - u * bx, X[k][1] - ay - u * by); if (d > fd) { fd = d; far = k; } }
      if (fd <= tol && clear(i, j)) continue;
      keep[far] = 1; stack.push([i, far], [far, j]);
    }
    return pts.filter((_, k) => keep[k]);
  }

  function find(opts) {
    const t0 = now(), SIM = opts.sim, V = Object.assign({}, SIM ? SIM.VEHICULO : {}, opts.vehicle || {});
    const o = Object.assign({ res: Math.max(10, opts.dem.cell ? Math.round(Math.max(opts.dem.cell[0], opts.dem.cell[1])) : 10),
      pad: 800, kRough: 0.5, maxVerts: 30, margin: 2, goalRadius: 0, g: SIM ? SIM.G_MARS : 3.71 }, opts, { V });
    let best = null;
    for (let extra = 0; extra <= 8; extra += 2) {            // más margen si el simulador aún ve un tramo intransitable
      const lim = V.theta_max - o.margin - extra, r = search(o, lim);
      if (!r) break;
      for (const tol of [o.res, 2 * o.res, 4 * o.res, 8 * o.res, 16 * o.res]) {
        const route = simplify(r.raw, tol, r.free, r.mLat, r.mLon).map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
        if (route.length > o.maxVerts && tol < 16 * o.res) continue;
        const chk = SIM ? SIM.simulate({ route, dem: o.dem, gp: null, t0: 0, vehicle: opts.vehicle }) : null;
        const cand = { route, raw: r.raw, cost_s: r.cost_s, expanded: r.expanded, nodes: r.nodes, res: o.res, lim, tol,
                       blocked_m: chk ? chk.summary.blocked_m : null, drive_s: chk ? chk.summary.drive_s : null };
        if (!best || (cand.blocked_m || 0) < (best.blocked_m || 0)) best = cand;
        if (!cand.blocked_m && route.length <= o.maxVerts) { cand.ms = now() - t0; return cand; }
      }
    }
    if (best) best.ms = now() - t0;
    return best;
  }

  // ida y vuelta: from -> to -> from. El costo depende del sentido (subir ≠ bajar), así que son dos búsquedas.
  function roundTrip(opts) {
    const t0 = now(), half = Math.floor(((opts.maxVerts || 30) + 1) / 2);
    const ida = find(Object.assign({}, opts, { maxVerts: half }));
    if (!ida) return null;
    const turn = ida.route[ida.route.length - 1];
    const vuelta = find(Object.assign({}, opts, { from: turn, to: opts.from, goalRadius: 0, maxVerts: half }));
    if (!vuelta) return null;
    return { route: ida.route.concat(vuelta.route.slice(1)), ida, vuelta, res: ida.res, ms: now() - t0 };
  }

  const API = { find, roundTrip, simplify };
  if (typeof module !== 'undefined') module.exports = API; else window.RouteOpt = API;
})();
