// Pruebas de la ruta óptima:  node ui/route-opt.test.js
const assert = require('assert');
global.window = {};
require('./data/dem.js');
const DEM = require('./dem.js'), SIM = require('./sim.js'), RO = require('./route-opt.js');
const TER = require('./modules/trace/terrain.js'), MIS = require('./modules/trace/missions.js');
let ok = 0; const t = (n, fn) => { fn(); ok++; console.log('ok -', n); };

// DEM sintético: llano con un muro (cresta gaussiana de 40 m de alto) en x = 500 m, abierto solo para y > 300 m
const R = 3389500, RAD = Math.PI / 180, LAT0 = -4.7, LON0 = 137.37, mLat = R * RAD, mLon = R * RAD * Math.cos(LAT0 * RAD);
const P = (x, y) => [LAT0 + y / mLat, LON0 + x / mLon];
const fz = (x, y) => (y > 300 ? 0 : 40 * Math.exp(-(((x - 500) / 30) ** 2)));
const synth = {
  elev: (lat, lon) => fz((lon - LON0) * mLon, (lat - LAT0) * mLat),
  slope: (lat, lon) => { const h = 10, x = (lon - LON0) * mLon, y = (lat - LAT0) * mLat;
    return Math.atan(Math.hypot((fz(x + h, y) - fz(x - h, y)) / (2 * h), (fz(x, y + h) - fz(x, y - h)) / (2 * h))) / RAD; },
  cell: [10, 10], bounds: [[LAT0 - 0.02, LON0 - 0.02], [LAT0 + 0.02, LON0 + 0.02]],
};

t('sintético: la recta cruza el muro (intransitable) y el A* lo rodea', () => {
  const from = P(0, 0), to = P(1000, 0);
  assert(SIM.simulate({ route: [from, to], dem: synth, gp: null, t0: 0 }).summary.blocked_m > 0, 'la recta debe ser intransitable');
  const r = RO.find({ sim: SIM, dem: synth, from, to });
  assert(r, 'debe encontrar ruta');
  assert.strictEqual(r.blocked_m, 0);
  assert(r.route.length <= 30, `${r.route.length} vértices`);
  assert(Math.max(...r.route.map((p) => (p[0] - LAT0) * mLat)) > 290, 'pasa por la abertura (y > 300 m)');
});

t('sintético: sin paso posible -> null', () => {
  const wall = Object.assign({}, synth, { elev: (lat, lon) => 40 * Math.exp(-((((lon - LON0) * mLon - 500) / 30) ** 2)),
    slope: (lat, lon) => { const x = (lon - LON0) * mLon, f = (u) => 40 * Math.exp(-(((u - 500) / 30) ** 2)); return Math.atan(Math.abs(f(x + 10) - f(x - 10)) / 20) / RAD; } });
  assert.strictEqual(RO.find({ sim: SIM, dem: wall, from: P(0, 0), to: P(1000, 0), pad: 300 }), null);
});

// DEM real de Gale + misión de Trace
const dem = DEM.from(window.DEM_DATA), ter = TER.create(dem), M = MIS.get(null);
let rt;
t('DEM real: ida y vuelta base ↔ objetivo, transitable en sim.simulate', () => {
  rt = RO.roundTrip({ sim: SIM, dem, terrain: ter, from: M.inicio, to: M.objetivo.pos, goalRadius: M.objetivo.radio * 0.5 });
  assert(rt, 'debe encontrar ruta');
  assert(rt.route.length <= 30, `${rt.route.length} vértices`);
  const s = SIM.simulate({ route: rt.route, dem, gp: null, t0: M.t0 });
  assert.strictEqual(s.summary.blocked_m, 0, 'sin tramos intransitables');
  assert(s.summary.theta_max_ruta <= SIM.VEHICULO.theta_max);
  assert(s.s.every((p) => !p.blocked && !p.noDem), 'ninguna muestra intransitable ni fuera del DEM');
  assert(MIS.dist(rt.route[0], M.inicio) < 1 && MIS.dist(rt.route[rt.route.length - 1], M.inicio) < 1, 'sale de la base y vuelve');
  assert(Math.min(...s.s.map((p) => MIS.dist([p.lat, p.lon], M.objetivo.pos))) <= M.objetivo.radio, 'llega al objetivo');
  const recta = SIM.simulate({ route: [M.inicio, M.objetivo.pos, M.inicio], dem, gp: null, t0: M.t0 });
  console.log(`     óptima: ${rt.route.length} vértices, ${(s.summary.dist_m / 1000).toFixed(2)} km, ${(s.summary.dur_s / 60).toFixed(1)} min, θmáx ${s.summary.theta_max_ruta.toFixed(1)}°, ${rt.ms.toFixed(0)} ms (rejilla ${rt.res} m)`);
  console.log(`     recta:  ${(recta.summary.dist_m / 1000).toFixed(2)} km, θmáx ${recta.summary.theta_max_ruta.toFixed(1)}°, intransitable ${recta.summary.blocked_m.toFixed(0)} m`);
});

t('DEM real: rápido (< 3 s) y determinista', () => {
  assert(rt.ms < 3000, `${rt.ms.toFixed(0)} ms`);
  const again = RO.roundTrip({ sim: SIM, dem, terrain: ter, from: M.inicio, to: M.objetivo.pos, goalRadius: M.objetivo.radio * 0.5 });
  assert.deepStrictEqual(again.route, rt.route);
});

console.log(`\n${ok} pruebas OK`);
