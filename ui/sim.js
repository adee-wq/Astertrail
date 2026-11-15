/* Astertrail · motor de simulación de la travesía (puro, sin DOM; corre en navegador y en node).
 *
 *   const r = SIM.simulate({ route, dem, gp, t0, vehicle });
 *   r.s[]      muestras cada ~ds m: t, dist, lat, lon, elev, theta, kappa, v, T, Tlo, sd, P_trac, P_term, P_tot, E, SOC, flags
 *   r.summary  distancia, duración (con Ct), velocidad media, energía, SOC final, T mínima peor caso, tramos intransitables...
 *   SIM.scanDepartures({...}, [t0, t0', ...])  -> evalúa varias horas de salida y elige la mejor (el "momento correcto")
 *
 * Física (por muestra):
 *   θ  pendiente a lo largo de la ruta, desde el DEM (diferencia central, ±ds)
 *   F  = m·g·(Crr·cosθ + sinθ)            g = 3.71 m/s²
 *   v  = min(v_crucero, η·P_max/F, √(a_lat/κ), v_bajada(θ)), luego límites de aceleración/frenado (a_lon)
 *        θ > θ_max  -> INTRANSITABLE (se marca; el vehículo "pasa" a v_min solo para que el reloj avance)
 *   P_trac = max(F·v, 0)/η  (bajando: regenera regen·|F|·v·η)
 *   P_term = P_base + k·max(0, T_ref − T_peor)   con T_peor = μ − 1.96σ del GP a la HORA DE PASO
 *   Ct: el tiempo real es Ct × tiempo de conducción (paradas, maniobras, navegación, terreno que el DEM no ve).
 *       Durante ese tiempo extra no hay tracción, pero sí térmica y auxiliares.
 *   Paradas científicas (stops, opcional): si la ruta pasa a ≤ radio m de un punto, el reloj suma stop_s en la muestra
 *       más cercana (una vez por punto; no se multiplica por Ct). Parado no hay tracción, pero sí térmica y auxiliares.
 *   SOC = 1 − E/E_bat
 *   Radiación: dose_mSv = 0.67 mSv/día × duración real (RAD de Curiosity, Hassler et al. 2014)
 */
(function () {
  const G_MARS = 3.71, R_MARS = 3389500, RAD = Math.PI / 180;
  // Radiación en superficie: 0.67 mSv por día terrestre (MSL/RAD en Gale; Hassler et al. 2014, Science 343, 1244797).
  const DOSIS_mSv_DIA = 0.67, LIMITE_CARRERA_mSv = 600;   // límite de carrera NASA-STD-3001

  // Parámetros de referencia: Apollo Lunar Roving Vehicle (LRV), 2 astronautas. REFERENCIA, VERIFICAR.
  const VEHICULO = {
    nombre: 'LRV (ref. Apollo) · 2 astronautas',
    m: 700,              // kg   LRV 210 kg + 2 astronautas con traje + carga (≈ masa máx. cargada del LRV)
    P_max: 746,          // W    4 motores de tracción de 0.25 hp
    eta: 0.80,           // eficiencia motor+transmisión (ESTIMADO)
    Crr: 0.12,           // resistencia a la rodadura en regolito suelto (ESTIMADO)
    v_crucero: 8 / 3.6,  // m/s  velocidad de crucero objetivo (LRV: máx. ~13 km/h, media real ~8 km/h)
    v_min: 0.3,          // m/s  avance mínimo (solo para que el reloj avance en tramos intransitables)
    theta_max: 25,       // °    pendiente máxima superable (LRV: ~25°)
    a_lat: 0.4,          // m/s² aceleración lateral máxima en curva (≈0.11 g marciana)
    a_lon: 0.3,          // m/s² aceleración/frenado longitudinal
    regen: 0,            // fracción regenerada en bajada (el LRV no regeneraba)
    E_bat: 8712,         // Wh   2 baterías de 121 Ah a 36 V
    P_aux: 100,          // W    navegación, comunicaciones, instrumentos (ESTIMADO)
    P_base: 50,          // W    térmica mínima (ESTIMADO)
    k_term: 4,           // W/K  calefacción por K bajo T_ref (ESTIMADO)
    T_ref: 273,          // K    referencia térmica
    Ct: 1.3,             // factor de tiempo real (Alan)
    ds: 5,               // m    paso de remuestreo de la ruta
    soc_min: 0.20,       // reserva mínima para GO
  };

  /* ---------- geometría ---------- */
  function dist(a, b) {
    const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * R_MARS * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {           // rumbo local en rad (aprox. plana, válida a escala de EVA)
    return Math.atan2((b[1] - a[1]) * Math.cos(a[0] * RAD), b[0] - a[0]);
  }
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

  function resample(route, ds) {     // puntos cada ~ds m a lo largo de la ruta
    const out = [{ lat: route[0][0], lon: route[0][1], dist: 0 }];
    let acc = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], L = dist(a, b);
      if (L === 0) continue;
      for (let D = ds * (Math.floor(acc / ds + 1e-9) + 1); D < acc + L - 0.25 * ds; D += ds) {   // múltiplos globales de ds (sin puntos pegados al vértice)
        const u = (D - acc) / L; out.push({ lat: a[0] + (b[0] - a[0]) * u, lon: a[1] + (b[1] - a[1]) * u, dist: D });
      }
      acc += L; out.push({ lat: b[0], lon: b[1], dist: acc });
    }
    // quitar duplicados muy cercanos (vértice justo en múltiplo de ds)
    return out.filter((p, i) => i === 0 || p.dist - out[i - 1].dist > 1e-6);
  }

  /* ---------- temperatura del GP a una hora (t en sols) ---------- */
  function gpAt(gp, t) {
    const P = gp && gp.pred; if (!P || !P.t.length) return null;
    if (t < P.t[0] - 1e-9 || t > P.t[P.t.length - 1] + 1e-9) return null;
    let lo = 0, hi = P.t.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.t[m] <= t) lo = m; else hi = m; }
    const u = Math.min(1, Math.max(0, (t - P.t[lo]) / (P.t[hi] - P.t[lo] || 1)));
    const mu = P.mu[lo] + (P.mu[hi] - P.mu[lo]) * u, sd = P.sigma[lo] + (P.sigma[hi] - P.sigma[lo]) * u;
    return { mu, sd, lo: mu - 1.96 * sd };
  }

  /* ---------- simulación ---------- */
  function simulate({ route, dem, gp, t0, vehicle, stops }) {
    const V = Object.assign({}, VEHICULO, vehicle || {});
    if (!route || route.length < 2) return null;
    const s = resample(route, V.ds), n = s.length;
    const thMax = V.theta_max * RAD;

    // elevación (si falta DEM en un punto, se usa la última conocida y se marca)
    let last = null, noDem = 0;
    for (const p of s) {
      const e = dem ? dem.elev(p.lat, p.lon) : null;
      if (e == null) { noDem++; p.noDem = true; p.elev = last ?? 0; } else { p.elev = e; last = e; }
    }
    if (last == null) s.forEach((p) => { p.elev = 0; });
    else { let first = s.find((p) => !p.noDem).elev; for (const p of s) { if (!p.noDem) break; p.elev = first; } }

    // perfil suavizado (media móvil ±10 m): quita el ruido de celda del DEM sin borrar escarpes reales
    const ws = Math.max(1, Math.round(10 / V.ds)), ez = s.map((p) => p.elev);
    s.forEach((p, i) => { let a = 0, c = 0; for (let k = Math.max(0, i - ws); k <= Math.min(n - 1, i + ws); k++) { a += ez[k]; c++; } p.elevS = a / c; });

    // pendiente con signo (a lo largo de la marcha) y curvatura κ = Δrumbo / Δs (ventana de ±w muestras)
    const w = Math.max(1, Math.round(5 / V.ds));   // ventana ±5 m: giro de radio pequeño (LRV ≈ 3 m)
    for (let i = 0; i < n; i++) {
      let ja = Math.max(0, i - 1), jb = Math.min(n - 1, i + 1);          // base de al menos ds metros
      while (s[jb].dist - s[ja].dist < V.ds && (ja > 0 || jb < n - 1)) { if (ja > 0) ja--; if (jb < n - 1) jb++; }
      const a = s[ja], b = s[jb];
      const dd = b.dist - a.dist;
      s[i].theta = dd > 0 ? Math.atan((b.elevS - a.elevS) / dd) : 0;
      const i0 = Math.max(0, i - w), i1 = Math.min(n - 1, i + w);
      if (i1 - i0 >= 2) {
        const h0 = bearing([s[i0].lat, s[i0].lon], [s[i].lat, s[i].lon]);
        const h1 = bearing([s[i].lat, s[i].lon], [s[i1].lat, s[i1].lon]);
        const L = s[i1].dist - s[i0].dist;
        s[i].kappa = (i > i0 && i1 > i && L > 0) ? Math.abs(wrap(h1 - h0)) / (L / 2) : 0;
      } else s[i].kappa = 0;
    }

    // velocidad objetivo por muestra
    const mg = V.m * G_MARS;
    for (const p of s) {
      const F = mg * (V.Crr * Math.cos(p.theta) + Math.sin(p.theta));
      p.F = F;
      p.blocked = Math.abs(p.theta) > thMax;
      let v = V.v_crucero, why = 'crucero';
      if (F > 0) { const vp = V.eta * V.P_max / F; if (vp < v) { v = vp; why = 'potencia'; } }
      if (p.theta < 0) { const vd = V.v_crucero * Math.max(0.3, 1 - 0.5 * Math.abs(p.theta) / thMax); if (vd < v) { v = vd; why = 'bajada'; } }
      if (p.kappa > 1e-6) { const vc = Math.sqrt(V.a_lat / p.kappa); if (vc < v) { v = vc; why = 'curva'; } }
      if (p.blocked) { v = V.v_min; why = 'intransitable'; }
      p.v = Math.max(V.v_min, v); p.lim = why;
    }
    // límites de aceleración (arranque y frenado): pasadas hacia delante y hacia atrás
    s[0].v = Math.min(s[0].v, V.v_min);
    for (let i = 1; i < n; i++) { const d = s[i].dist - s[i - 1].dist; s[i].v = Math.min(s[i].v, Math.sqrt(s[i - 1].v ** 2 + 2 * V.a_lon * d)); }
    s[n - 1].v = Math.min(s[n - 1].v, V.v_min);
    for (let i = n - 2; i >= 0; i--) { const d = s[i + 1].dist - s[i].dist; s[i].v = Math.min(s[i].v, Math.sqrt(s[i + 1].v ** 2 + 2 * V.a_lon * d)); }

    // reloj, temperatura a la hora de paso, potencia y energía
    // paradas científicas: cada punto se asigna a la muestra más cercana de la ruta, si está dentro de su radio
    const stopAt = {}, stopList = [];
    (stops || []).forEach((st) => {
      if (!(st.stop_s > 0)) return;
      let bi = -1, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = dist([s[i].lat, s[i].lon], [st.lat, st.lon]); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0 && bd <= (st.radio ?? 150)) (stopAt[bi] || (stopAt[bi] = [])).push({ st, d: bd });
    });
    let tDrive = 0, tStop = 0, E = 0, noGp = 0, Tmin = null, tTmin = null;
    for (let i = 0; i < n; i++) {
      const p = s[i];
      if (i > 0) {
        const d = p.dist - s[i - 1].dist, vm = Math.max(V.v_min, (p.v + s[i - 1].v) / 2);
        p.dtDrive = d / vm; tDrive += p.dtDrive;
      } else p.dtDrive = 0;
      p.tDrive = tDrive;                                   // s de conducción pura
      p.t = t0 + (V.Ct * tDrive + tStop) / 88775.244;      // sols (1 sol = 88 775.244 s); hora real con Ct + paradas previas
      const T = gpAt(gp, p.t);
      if (!T) { noGp++; p.T = p.Tlo = p.sd = null; } else { p.T = T.mu; p.Tlo = T.lo; p.sd = T.sd; if (Tmin == null || T.lo < Tmin) { Tmin = T.lo; tTmin = p.t; } }
      const Tw = p.Tlo ?? V.T_ref;
      p.P_trac = p.F > 0 ? p.F * p.v / V.eta : -V.regen * Math.abs(p.F) * p.v * V.eta;
      p.P_term = V.P_base + V.k_term * Math.max(0, V.T_ref - Tw);
      p.P_tot = p.P_trac + p.P_term + V.P_aux;
      if (i > 0) {                                         // tracción solo al conducir; térmica+aux todo el tiempo real
        const Pt = (p.P_trac + s[i - 1].P_trac) / 2;
        E += (Pt * p.dtDrive + (p.P_term + V.P_aux) * V.Ct * p.dtDrive) / 3600;
      }
      p.E = E; p.SOC = 1 - E / V.E_bat;                    // estado AL LLEGAR a la muestra (antes de parar)
      for (const { st, d } of (stopAt[i] || [])) {         // parada: sin tracción; térmica + aux en pasos de ≤ 5 min
        let rem = st.stop_s, tt = p.t + (tStop - (p.stopBefore ?? (p.stopBefore = tStop))) / 88775.244, lo = null, sinGp = false;
        const t_arr = tt;
        while (rem > 1e-9) {
          const h = Math.min(300, rem), tm = tt + h / 2 / 88775.244, Tm = gpAt(gp, tm);
          if (Tm) { if (lo == null || Tm.lo < lo) lo = Tm.lo; if (Tmin == null || Tm.lo < Tmin) { Tmin = Tm.lo; tTmin = tm; } } else sinGp = true;
          E += (V.P_base + V.k_term * Math.max(0, V.T_ref - (Tm ? Tm.lo : V.T_ref)) + V.P_aux) * h / 3600;
          rem -= h; tt += h / 88775.244;
        }
        if (sinGp) noGp++;
        tStop += st.stop_s; p.stop_s = (p.stop_s || 0) + st.stop_s;
        stopList.push({ id: st.id, nombre: st.nombre, lat: st.lat, lon: st.lon, i, dist: p.dist, off_m: d, stop_s: st.stop_s, t_arr, t_dep: tt, Tlo_min: lo, SOC_dep: 1 - E / V.E_bat });
      }
    }

    const L = s[n - 1].dist, dur = V.Ct * tDrive + tStop;
    let blockedM = 0, up = 0, dn = 0;
    for (let i = 1; i < n; i++) {
      const d = s[i].dist - s[i - 1].dist, de = s[i].elev - s[i - 1].elev;
      if (s[i].blocked) blockedM += d; if (de > 0) up += de; else dn -= de;
    }
    const summary = {
      dist_m: L, drive_s: tDrive, dur_s: dur, stop_s: tStop, stops: stopList, Ct: V.Ct, t0, t1: t0 + dur / 88775.244,
      v_media_kmh: L / tDrive * 3.6, v_media_real_kmh: L / dur * 3.6,
      E_Wh: E, Wh_km: E / (L / 1000), SOC_end: 1 - E / V.E_bat,
      Tlo_min: Tmin, t_Tlo_min: tTmin, desnivel_up: up, desnivel_dn: dn,
      blocked_m: blockedM, theta_max_ruta: Math.max(...s.map((p) => Math.abs(p.theta))) / RAD,
      sin_dem: noDem, sin_gp: noGp, n,
      dose_mSv: DOSIS_mSv_DIA * dur / 86400,             // dosis equivalente de la salida (duración real: Ct + paradas)
    };
    return { s, summary, vehicle: V };
  }

  /* ---------- veredicto y "momento correcto" ---------- */
  const BANDAS = [203, 233, 258];                    // K, como CONFIG.bandas de mapa.html
  function verdict(r, opts = {}) {
    const S = r.summary, V = r.vehicle, why = [];
    let level = 'GO';
    if (S.blocked_m > 0) { level = 'NO-GO'; why.push(`${S.blocked_m.toFixed(0)} m con pendiente > ${V.theta_max}°`); }
    if (S.SOC_end < V.soc_min) { level = 'NO-GO'; why.push(`reserva ${(S.SOC_end * 100).toFixed(0)} % < ${V.soc_min * 100} %`); }
    if (S.sin_gp > 0) { level = 'NO-GO'; why.push('la misión sale del pronóstico de temperatura'); }
    let extremo = 0;
    for (let i = 1; i < r.s.length; i++) if (r.s[i].Tlo != null && r.s[i].Tlo < BANDAS[0]) extremo += r.s[i].dtDrive * V.Ct;
    for (const st of (S.stops || [])) if (st.Tlo_min != null && st.Tlo_min < BANDAS[0]) extremo += st.stop_s;   // paradas en frío extremo
    if (level === 'GO' && extremo > (opts.max_extremo_s ?? 1800)) { level = 'GO CON PRECAUCIÓN'; why.push(`${(extremo / 60).toFixed(0)} min en FRÍO EXTREMO`); }
    if (level === 'GO' && S.SOC_end < V.soc_min + 0.15) { level = 'GO CON PRECAUCIÓN'; why.push(`reserva justa (${(S.SOC_end * 100).toFixed(0)} %)`); }
    return { level, why, extremo_s: extremo };
  }

  // Prueba varias horas de salida. Mejor = viable (no NO-GO) con el peor caso más templado; empate -> menos energía.
  function scanDepartures(args, t0s) {
    const rank = { 'GO': 0, 'GO CON PRECAUCIÓN': 1, 'NO-GO': 2 };
    const res = t0s.map((t0) => { const r = simulate(Object.assign({}, args, { t0 })); return { t0, r, v: verdict(r) }; });
    const best = res.slice().sort((a, b) => (rank[a.v.level] - rank[b.v.level])
      || ((a.r.summary.sin_gp > 0) - (b.r.summary.sin_gp > 0))
      || ((b.r.summary.Tlo_min ?? -1e9) - (a.r.summary.Tlo_min ?? -1e9))
      || (a.r.summary.E_Wh - b.r.summary.E_Wh))[0];
    return { all: res, best };
  }

  const API = { VEHICULO, G_MARS, DOSIS_mSv_DIA, LIMITE_CARRERA_mSv, simulate, verdict, scanDepartures, resample, gpAt, dist };
  if (typeof module !== 'undefined') module.exports = API; else window.SIM = API;
})();
