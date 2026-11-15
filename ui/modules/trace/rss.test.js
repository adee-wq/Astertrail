// Pruebas del Route Safety Score y del Terrain Analyzer:  node ui/modules/trace/rss.test.js
const assert = require('assert');
const SIM = require('../../sim.js'), RSS = require('./rss.js'), TER = require('./terrain.js');

const R = 3389500, RAD = Math.PI / 180, LAT0 = -4.7, LON0 = 137.37;
const mLat = R * RAD, mLon = R * RAD * Math.cos(LAT0 * RAD);
const P = (x, y) => [LAT0 + y / mLat, LON0 + x / mLon];
// DEM sintético compatible con dem.js: elev(lat, lon), slope, cell, bounds
function demOf(fz) {
  const RD = 3396190 * RAD;
  const elev = (lat, lon) => fz((lon - LON0) * mLon, (lat - LAT0) * mLat);
  const slope = (lat, lon) => { const h = 10, x = (lon - LON0) * mLon, y = (lat - LAT0) * mLat;
    const gx = (fz(x + h, y) - fz(x - h, y)) / (2 * h), gy = (fz(x, y + h) - fz(x, y - h)) / (2 * h); return Math.atan(Math.hypot(gx, gy)) / RAD; };
  return { elev, slope, cell: [10, 10], bounds: [[LAT0 - 0.02, LON0 - 0.02], [LAT0 + 0.02, LON0 + 0.02]], meta: {} };
}
const gpWarm = { pred: { t: [1520, 1522], mu: [262, 262], sigma: [1, 1] } };   // peor caso 260 K: T = 0
const gpCold = { pred: { t: [1520, 1522], mu: [205, 205], sigma: [1, 1] } };   // peor caso 203 K: T = 100
// rugosidad de fondo (ondulación de 30 m) para que la calibración p50/p95 no sea degenerada
const bump = (x, y) => 0.6 * Math.sin(x / 9) * Math.cos(y / 7) + 0.2 * Math.sin(x / 3.1 + y / 4.3);
function evalRoute(route, fz, gp) {
  const dem = demOf(fz), sim = SIM.simulate({ route, dem, gp, t0: 1520.4 });
  return { ev: RSS.evaluate({ route, sim, terrain: TER.create(dem) }), sim };
}
let ok = 0; const t = (n, fn) => { fn(); ok++; console.log('ok -', n); };

t('pesos iniciales 35/30/20/15 y clases', () => {
  const w = RSS.CONFIG.pesos; assert(Math.abs(w.S + w.G + w.T + w.A - 1) < 1e-9);
  assert.strictEqual(RSS.clase(95), 'MUY SEGURA'); assert.strictEqual(RSS.clase(80), 'SEGURA');
  assert.strictEqual(RSS.clase(60), 'PRECAUCIÓN'); assert.strictEqual(RSS.clase(30), 'PELIGROSA'); assert.strictEqual(RSS.clase(5), 'CRÍTICA');
});

t('llano y templado: RSS alto, ruta válida', () => {
  const { ev } = evalRoute([P(0, 0), P(800, 0)], (x, y) => bump(x, y), gpWarm);
  assert(ev.valida); assert(ev.rss >= 70, 'rss ' + ev.rss);   // G no se controla con la onda sintética (peso máx. 30) assert.strictEqual(ev.segs[0].S, 0); assert.strictEqual(ev.segs[0].T, 0);
});

t('subida de 15°: riesgo S intermedio (≈50) y baja el RSS', () => {
  const a = evalRoute([P(0, 0), P(800, 0)], (x, y) => bump(x, y), gpWarm).ev;
  const b = evalRoute([P(0, 0), P(800, 0)], (x, y) => x * Math.tan(15 * RAD) + bump(x, y), gpWarm).ev;
  assert(b.segs[0].S > 35 && b.segs[0].S < 75, 'S ' + b.segs[0].S.toFixed(1));   // 15° ≈ 50 (+ ondulación en el p90) assert(b.rss < a.rss);
});

t('frío extremo: T = 100', () => {
  const { ev } = evalRoute([P(0, 0), P(800, 0)], (x, y) => bump(x, y), gpCold);
  assert(ev.segs[0].T > 95, 'T ' + ev.segs[0].T);
});

t('tramo > θ_max: intransitable invalida la ruta y limita el RSS', () => {
  const { ev } = evalRoute([P(0, 0), P(300, 0), P(600, 0)], (x, y) => (x > 300 ? (x - 300) * Math.tan(30 * RAD) : 0) + bump(x, y), gpWarm);
  assert(!ev.valida); assert(ev.segs[1].intransitable); assert(ev.rss <= 49);
});

t('ponderado por distancia: el tramo largo pesa más', () => {
  const f = (x, y) => (x > 900 ? (x - 900) * Math.tan(15 * RAD) : 0) + bump(x, y);
  const corto = evalRoute([P(0, 0), P(900, 0), P(1000, 0)], f, gpWarm).ev;     // 100 m en cuesta
  const largo = evalRoute([P(800, 0), P(900, 0), P(1700, 0)], f, gpWarm).ev;   // 800 m en cuesta
  assert(largo.rss < corto.rss, `${largo.rss} < ${corto.rss}`);
});

t('dato desconocido no es seguro: factor deshabilitado = 100', () => {
  const route = [P(0, 0), P(800, 0)], dem = demOf((x, y) => bump(x, y)), sim = SIM.simulate({ route, dem, gp: gpWarm, t0: 1520.4 });
  const a = RSS.evaluate({ route, sim, terrain: TER.create(dem) }), b = RSS.evaluate({ route, sim, terrain: TER.create(dem), config: { habilitados: { T: false } } });
  assert.strictEqual(b.segs[0].T, 100); assert(b.rss < a.rss);
});

t('reproducible: misma entrada -> mismo RSS', () => {
  const f = (x, y) => x * 0.1 + bump(x, y);
  assert.strictEqual(evalRoute([P(0, 0), P(500, 300)], f, gpWarm).ev.rss, evalRoute([P(0, 0), P(500, 300)], f, gpWarm).ev.rss);
});

console.log(`\n${ok} pruebas OK`);
