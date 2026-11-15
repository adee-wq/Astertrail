"""Corre el GP sobre REMS real alrededor de una misión y exporta los datos para la UI.

  uv run python export_gp.py --sol 1520 --ltst 9 --hours 6
  uv run python export_gp.py --sol 1520 --ltst 9 --hours 30 --context 3 --show-mission

Misión: empieza en el sol --sol a la hora LTST --ltst y dura --hours horas.
Contexto: se usan las observaciones de --context sols antes y después de la misión.
Por defecto los datos REMS DENTRO de la misión se ocultan al GP (la misión es un
hueco que hay que interpolar) y se exportan aparte como "reales ocultos" para
poder compararlos en la gráfica. Con --show-mission el GP también los ve.

Salida (en ui/data/):
  gp.json      contrato: meta, mission, obs, hidden, pred[{t, mu, sigma, lo95, hi95}] en K
  gp-data.js   lo mismo como `window.GP_DATA = {...}` para abrir la UI con doble clic
"""
import argparse, json, os, time
import numpy as np
import data as D
from eval import gp

CFG = dict(src=['data/raw/rems_air.csv'], out='ui/data', n_fit=500, n_grid=900, seed=0)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sol', type=int, required=True)
    ap.add_argument('--ltst', type=float, default=9.0, help='hora LTST de inicio (0-24)')
    ap.add_argument('--hours', type=float, default=6.0, help='duración de la misión en horas')
    ap.add_argument('--context', type=float, default=3.0, help='sols de datos a cada lado')
    ap.add_argument('--show-mission', action='store_true')
    ap.add_argument('--out', default=CFG['out'])
    a = ap.parse_args(); c = CFG

    dc = D.CFG(); dc.src = c['src']; df = D.load(dc)
    t0 = a.sol + a.ltst / 24.0
    t1 = t0 + a.hours / 24.0
    lo, hi = t0 - a.context, t1 + a.context
    ctx = df[(df.t >= lo) & (df.t <= hi)]
    if len(ctx) < 50:
        raise SystemExit(f'pocos datos REMS entre {lo:.2f} y {hi:.2f} ({len(ctx)}). '
                         f'Disponibles: sols {df.sol.min():.0f}-{df.sol.max():.0f}')
    inm = (ctx.t >= t0) & (ctx.t <= t1)
    fit = ctx if a.show_mission else ctx[~inm]
    hid = ctx[inm] if not a.show_mission else ctx.iloc[0:0]

    # submuestreo para el GP (O(n^3)); reproducible
    rng = np.random.default_rng(c['seed'])
    idx = np.sort(rng.choice(len(fit), min(c['n_fit'], len(fit)), replace=False))
    tf, xf = fit.t.values[idx], fit.val.values[idx]

    # El kernel de eval.gp arranca con período 0.1 en tiempo normalizado: eso es 1 sol
    # solo si 10 sols = 1 unidad (como en eval_real). Con otra escala el optimizador
    # cae en "todo es ruido" (mu constante, sigma enorme). Escala fija, no la del contexto.
    norm = lambda t: (np.asarray(t) - lo) / 10.0
    tq = np.linspace(t0, t1, c['n_grid'])
    tic = time.perf_counter()
    mu, sd = gp(norm(tf), xf, np.ones(len(tf), bool), norm(tq))
    dt = time.perf_counter() - tic

    r = lambda v, k=3: [round(float(x), k) for x in v]
    view = ctx[(ctx.t >= t0 - .25 * (t1 - t0)) & (ctx.t <= t1 + .25 * (t1 - t0))]   # obs cerca de la misión
    vis_view = view if a.show_mission else view[~((view.t >= t0) & (view.t <= t1))]
    out = dict(
        meta=dict(source='MSL REMS MODRDR (AMBIENT_TEMP, medias por minuto)', model='gp',
                  kernel='C*ExpSineSquared*RBF+White (eval.gp)', units='K', n_fit=int(len(tf)),
                  fit_seconds=round(dt, 3), mission_hidden=not a.show_mission,
                  created=time.strftime('%Y-%m-%dT%H:%M:%S')),
        mission=dict(t0=round(t0, 5), t1=round(t1, 5), sol=a.sol, ltst_start=a.ltst, hours=a.hours),
        obs=dict(t=r(vis_view.t, 5), x=r(vis_view.val, 2)),
        hidden=dict(t=r(hid.t, 5), x=r(hid.val, 2)),
        pred=dict(t=r(tq, 5), mu=r(mu, 2), sigma=r(sd, 3),
                  lo95=r(mu - 1.96 * sd, 2), hi95=r(mu + 1.96 * sd, 2)),
    )
    os.makedirs(a.out, exist_ok=True)
    js = json.dumps(out, ensure_ascii=False)
    open(os.path.join(a.out, 'gp.json'), 'w', encoding='utf-8').write(js)
    open(os.path.join(a.out, 'gp-data.js'), 'w', encoding='utf-8').write('window.GP_DATA = ' + js + ';\n')
    print(f'misión sol {a.sol} {a.ltst:05.2f} h LTST, {a.hours:g} h | GP con {len(tf)} puntos en {dt:.2f} s | '
          f'T {mu.min():.1f}-{mu.max():.1f} K, sigma media {sd.mean():.2f} K | ocultos {len(hid)} -> {a.out}/gp.json')

if __name__ == '__main__':
    main()
