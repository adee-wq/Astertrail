// Pruebas del motor de simulación:  node ui/sim.test.js
const assert = require('assert');
const SIM = require('./sim.js');

const R = 3389500, RAD = Math.PI / 180, LAT0 = -4.7, LON0 = 137.37;
const mPerDegLat = R * RAD, mPerDegLon = R * RAD * Math.cos(LAT0 * RAD);
const P = (xEast, yNorth) => [LAT0 + yNorth / mPerDegLat, LON0 + xEast / mPerDegLon];   // metros -> [lat, lon]
// DEM sintético: plano inclinado hacia el este con pendiente deg (elev = x·tanθ)
const plane = (deg) => ({ elev: (lat, lon) => (lon - LON0) * mPerDegLon * Math.tan(deg * RAD) });
// GP constante: 240 K ± 2 K durante 2 sols
const gp = { pred: { t: [1520, 1522], mu: [240, 240], sigma: [2, 2] } };
const run = (route, dem, veh) => SIM.simulate({ route, dem, gp, t0: 1520.375, vehicle: veh });
const mid = (r) => r.s[Math.floor(r.s.length / 2)];
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('ok -', name); };

const recta = [P(0, 0), P(1000, 0)];

t('llano: solo rodadura, velocidad limitada por potencia', () => {
  const r = run(recta, plane(0)), p = mid(r), V = SIM.VEHICULO;
  const F = V.m * SIM.G_MARS * V.Crr;
  assert(Math.abs(p.theta) < 1e-6, 'theta debe ser 0');
  assert(Math.abs(p.F - F) < 1e-6, 'F = m·g·Crr');
  assert(Math.abs(p.v - Math.min(V.v_crucero, V.eta * V.P_max / F)) < 1e-6, 'v = min(crucero, ηP/F)');
  assert(Math.abs(r.summary.dist_m - 1000) < 1, 'distancia 1 km');
});

t('subida de 10°: más fuerza, menos velocidad, más energía', () => {
  const a = run(recta, plane(0)), b = run(recta, plane(10));
  assert(Math.abs(mid(b).theta / RAD - 10) < 0.01, 'theta ≈ 10°');
  assert(mid(b).v < mid(a).v * 0.5, `v subida ${mid(b).v.toFixed(2)} vs llano ${mid(a).v.toFixed(2)}`);
  assert(b.summary.E_Wh > a.summary.E_Wh * 1.5, 'consumo mayor');
  assert(b.summary.dur_s > a.summary.dur_s * 1.5, 'tarda más');
});

t('curva cerrada: la velocidad baja en el vértice', () => {
  const r = run([P(0, 0), P(500, 0), P(500, 500)], plane(0));
  const vert = r.s.reduce((m, p) => (Math.abs(p.dist - 500) < Math.abs(m.dist - 500) ? p : m));
  const recto = r.s.find((p) => Math.abs(p.dist - 250) < 3);
  assert(vert.v < recto.v * 0.7, `v vértice ${vert.v.toFixed(2)} vs recta ${recto.v.toFixed(2)}`);
  assert.strictEqual(vert.lim, 'curva');
});

t('Ct escala el tiempo real, no el de conducción', () => {
  const a = run(recta, plane(0), { Ct: 1 }), b = run(recta, plane(0), { Ct: 1.3 });
  assert(Math.abs(a.summary.drive_s - b.summary.drive_s) < 1e-6);
  assert(Math.abs(b.summary.dur_s / a.summary.dur_s - 1.3) < 1e-9);
  assert(b.summary.E_Wh > a.summary.E_Wh, 'más tiempo -> más térmica/aux');
});

t('pendiente > θ_max: intransitable y NO-GO', () => {
  const r = run(recta, plane(30));
  assert(r.summary.blocked_m > 900);
  assert.strictEqual(SIM.verdict(r).level, 'NO-GO');
});

t('frío: más potencia térmica', () => {
  const cold = { pred: { t: [1520, 1522], mu: [200, 200], sigma: [2, 2] } };
  const a = run(recta, plane(0)), b = SIM.simulate({ route: recta, dem: plane(0), gp: cold, t0: 1520.375 });
  assert(mid(b).P_term > mid(a).P_term + 100);
});

t('momento correcto: elige la salida más templada', () => {
  const g = { pred: { t: [1520.3, 1520.5, 1520.7], mu: [220, 250, 230], sigma: [2, 2, 2] } };
  const sc = SIM.scanDepartures({ route: recta, dem: plane(0), gp: g }, [1520.32, 1520.48, 1520.6]);
  assert.strictEqual(sc.best.t0, 1520.48);
});

t('paradas científicas: suman tiempo y energía (térmica + aux), no conducción', () => {
  const [lat, lon] = P(500, 40);                                   // a 40 m de la ruta, a mitad de camino
  const stops = [{ id: 'a', nombre: 'A', lat, lon, radio: 150, stop_s: 1800 }];
  const a = run(recta, plane(0)), b = SIM.simulate({ route: recta, dem: plane(0), gp, t0: 1520.375, stops });
  assert.strictEqual(a.summary.stop_s, 0); assert.strictEqual(a.summary.stops.length, 0);
  assert.strictEqual(b.summary.stops.length, 1);
  assert(Math.abs(b.summary.drive_s - a.summary.drive_s) < 1e-9, 'la conducción no cambia');
  assert(Math.abs(b.summary.dur_s - (a.summary.dur_s + 1800)) < 1e-6, 'duración = conducción × Ct + parada');
  assert(Math.abs((b.summary.t1 - b.summary.t0) * 88775.244 - b.summary.dur_s) < 1e-3, 't1 incluye la parada');
  const V = SIM.VEHICULO, Pst = V.P_base + V.k_term * (V.T_ref - (240 - 1.96 * 2)) + V.P_aux;   // W parado
  assert(Math.abs(b.summary.E_Wh - a.summary.E_Wh - Pst * 0.5) < 1e-6, 'energía de la parada = (térmica + aux) × 0.5 h');
  const st = b.summary.stops[0];
  assert(Math.abs(st.dist - 500) <= 5 && Math.abs(st.off_m - 40) < 1, 'parada en la muestra más cercana');
  assert(Math.abs((st.t_dep - st.t_arr) * 88775.244 - 1800) < 1e-3);
  const fin = b.s[b.s.length - 1], finA = a.s[a.s.length - 1];
  assert(Math.abs((fin.t - finA.t) * 88775.244 - 1800) < 1e-3, 'las muestras posteriores llegan 30 min más tarde');
});

t('paradas científicas: un punto lejos de la ruta no cuenta', () => {
  const [lat, lon] = P(500, 400);
  const a = run(recta, plane(0)), b = SIM.simulate({ route: recta, dem: plane(0), gp, t0: 1520.375, stops: [{ id: 'x', lat, lon, radio: 150, stop_s: 1800 }] });
  assert.strictEqual(b.summary.stops.length, 0);
  assert.strictEqual(b.summary.dur_s, a.summary.dur_s); assert.strictEqual(b.summary.E_Wh, a.summary.E_Wh);
});

console.log(`\n${ok} pruebas OK`);
