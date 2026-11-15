"""Evaluación de VARnet sobre REMS real + veredicto MVP.

  uv run python eval_real.py runs/varnet/last.pt
  -> runs/varnet/eval_real.json, runs/varnet/real_demo.png

Cada ventana imita a synth.batch: ~10 sols, N=500 puntos (submuestreados de los
minutos REMS, que conservan la cadencia real: sesiones de 5 min por hora + bloques
largos), t normalizado a [0, 1]. Se oculta un hueco contiguo (10/20/40 % de los
puntos) y se compara con lineal, spline y GP de eval.py (sin cambios).

No hay verdad limpia: el objetivo es la temperatura REMS observada (media por minuto),
que incluye turbulencia. Por eso se reporta también:
  - piso de ruido: desviación típica dentro del minuto (air_temp_err)
  - cov*_tot: cobertura con sigma_tot = sqrt(sigma_modelo^2 + err_obs^2), porque
    el modelo se entrenó para predecir la señal limpia (y), no la observación ruidosa (x).
"""
import json, os, sys, time
import numpy as np, torch
import data as D
from eval import lin, spl, gp, metrics, hole_mask

CFG = dict(
    src=['data/raw/rems_air.csv'], out='runs/varnet',
    win=10.0, step=5.0, N=500, min_pts=600, min_sols=7,
    fracs=(.1, .2, .4), n_gp=32, seed=0,
    # criterios MVP (ajustar a la Especificación, secciones 15.4-15.5)
    mvp=dict(cov1=(0.55, 0.85), cov2=(0.85, 0.99),   # cobertura con sigma_tot
         rmse_K_max=6.0,                          # propuesta: < ~10 % de la amplitud diurna
         latency_ms=50.0),
)

def windows(df, c=CFG):
    t, x, s = df.t.values, df.val.values, df.sig.values
    rng = np.random.default_rng(c['seed'])
    out, a = [], np.floor(t.min())
    while a + c['win'] <= t.max() + 1e-9:
        m = np.flatnonzero((t >= a) & (t < a + c['win']))
        if len(m) >= c['min_pts'] and len(np.unique(np.floor(t[m]))) >= c['min_sols']:
            i = np.sort(rng.choice(m, c['N'], replace=False))
            tt = t[i]
            out.append(dict(t0=a, traw=tt, t=(tt - tt[0]) / (tt[-1] - tt[0]), x=x[i], sig=s[i]))
        a += c['step']
    return out

@torch.no_grad()
def varnet(m, w, vis, tq, dev):
    f = lambda v: torch.as_tensor(np.asarray(v, np.float32), device=dev)[None]
    mu, sd = m.predict(f(w['x']), f(w['t']), f(vis), f(tq))
    return mu[0].cpu().numpy().astype(np.float64), sd[0].cpu().numpy().astype(np.float64)

def contract(m, ws, dev, c=CFG):
    w = ws[0]; n = c['N']
    vis, _, _ = hole_mask(n, .2, dev, 123)
    a = varnet(m, w, vis, w['t'], dev); b = varnet(m, w, vis, w['t'], dev)
    tq = np.linspace(0, 1, 1000)
    mu, sd = varnet(m, w, vis, tq, dev)
    if dev == 'cuda': torch.cuda.synchronize()
    t0 = time.perf_counter()
    for _ in range(20): varnet(m, w, vis, tq, dev)
    if dev == 'cuda': torch.cuda.synchronize()
    lat = (time.perf_counter() - t0) / 20 * 1e3
    lo, hi = w['x'].min(), w['x'].max(); span = hi - lo
    return dict(
        shape_ok=bool(mu.shape == sd.shape == tq.shape),
        finite=bool(np.isfinite(mu).all() and np.isfinite(sd).all()),
        sigma_pos=bool((sd > 0).all()),
        deterministic=bool(np.array_equal(a[0], b[0]) and np.array_equal(a[1], b[1])),
        units_K_plausible=bool((mu > lo - span).all() and (mu < hi + span).all()),
        latency_ms=float(lat),
    )

def evaluate(m, ws, dev, c=CFG):
    out = {}
    for f in c['fracs']:
        rows = {k: [] for k in ['lin', 'spl', 'gp', 'varnet']}
        tot1, tot2, floor, hole_sols = [], [], [], []
        for i, w in enumerate(ws):
            vis, st, k = hole_mask(c['N'], f, dev, c['seed'] + i)
            hid = ~vis
            tq, yt, eo = w['t'][hid], w['x'][hid], w['sig'][hid]
            z = np.full_like(tq, 1e-6)
            rows['lin'].append(metrics(lin(w['t'], w['x'], vis, tq), z, yt))
            rows['spl'].append(metrics(spl(w['t'], w['x'], vis, tq), z, yt))
            if i < c['n_gp']:
                gm, gs = gp(w['t'], w['x'], vis, tq)
                rows['gp'].append(metrics(gm, gs, yt))
            mp, sp = varnet(m, w, vis, tq, dev)
            rows['varnet'].append(metrics(mp, sp, yt))
            stot = np.sqrt(sp**2 + eo**2); e = np.abs(mp - yt)
            tot1.append((e <= stot).mean()); tot2.append((e <= 2 * stot).mean())
            floor.append(np.median(eo)); hole_sols.append(np.ptp(w['traw'][hid]))
        r = {k: {q: float(np.mean([x[q] for x in v])) for q in v[0]} for k, v in rows.items() if v}
        r['varnet'].update(cov1_tot=float(np.mean(tot1)), cov2_tot=float(np.mean(tot2)))
        r['noise_floor_K'] = float(np.median(floor))
        r['hole_sols_median'] = float(np.median(hole_sols))
        out[str(f)] = r
    return out

def verdict(res, con, c=CFG):
    v = c['mvp']; chk = {}
    for f, r in res.items():
        vn = r['varnet']
        chk[f'{f}: VARnet < lineal y spline (RMSE)'] = vn['rmse'] < min(r['lin']['rmse'], r['spl']['rmse'])
        chk[f'{f}: RMSE <= {v["rmse_K_max"]} K'] = vn['rmse'] <= v['rmse_K_max']
        chk[f'{f}: cov1_tot en {v["cov1"]}'] = v['cov1'][0] <= vn['cov1_tot'] <= v['cov1'][1]
        chk[f'{f}: cov2_tot en {v["cov2"]}'] = v['cov2'][0] <= vn['cov2_tot'] <= v['cov2'][1]
    for k in ['shape_ok', 'finite', 'sigma_pos', 'deterministic', 'units_K_plausible']:
        chk[f'contrato: {k}'] = con[k]
    chk[f'contrato: latencia <= {v["latency_ms"]} ms'] = con['latency_ms'] <= v['latency_ms']
    return {k: bool(x) for k, x in chk.items()}

def figure(m, ws, dev, path, c=CFG, f=.2):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    idx = np.linspace(0, len(ws) - 1, min(3, len(ws))).astype(int)
    fig, ax = plt.subplots(len(idx), 1, figsize=(11, 3.2 * len(idx)), squeeze=False)
    for a, i in zip(ax[:, 0], idx):
        w = ws[i]; vis, _, _ = hole_mask(c['N'], f, dev, int(c['seed'] + i)); hid = ~vis
        tq = np.linspace(0, 1, 1500); tr = w['traw'][0] + tq * (w['traw'][-1] - w['traw'][0])
        mu, sd = varnet(m, w, vis, tq, dev)
        gm, _ = gp(w['t'], w['x'], vis, tq)
        a.fill_between(tr, mu - 2 * sd, mu + 2 * sd, color='C1', alpha=.15, lw=0, label='±2σ')
        a.fill_between(tr, mu - sd, mu + sd, color='C0', alpha=.25, lw=0, label='±1σ')
        a.plot(tr, mu, 'C0', lw=1.2, label='VARnet')
        a.plot(tr, gm, 'C2', lw=.9, ls='--', label='GP')
        a.scatter(w['traw'][vis], w['x'][vis], s=4, c='k', label='observado')
        a.scatter(w['traw'][hid], w['x'][hid], s=5, c='r', label='oculto (REMS)')
        a.axvspan(w['traw'][hid].min(), w['traw'][hid].max(), color='0.9', zorder=0)
        a.set_ylabel('T aire (K)'); a.set_title(f'sols {w["t0"]:.0f}-{w["t0"] + c["win"]:.0f}, hueco {int(f*100)} %')
    ax[0, 0].legend(fontsize=7, loc='upper right', ncol=3); ax[-1, 0].set_xlabel('sol + LTST/24')
    fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)

def main(ck, c=CFG):
    from model import Interp
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    m = Interp().to(dev)
    m.load_state_dict(torch.load(ck, map_location=dev)['model']); m.eval()
    dc = D.CFG(); dc.src = c['src']
    df = D.load(dc)
    ws = windows(df, c)
    if not ws:
        sys.exit(f'0 ventanas válidas: hacen falta >= {c["min_sols"]} sols con datos en {c["win"]} sols seguidos')
    print(f'{len(df)} minutos REMS, sols {df.sol.min():.0f}-{df.sol.max():.0f}, {len(ws)} ventanas de {c["win"]:.0f} sols')
    res = evaluate(m, ws, dev, c)
    con = contract(m, ws, dev, c)
    chk = verdict(res, con, c)
    os.makedirs(c['out'], exist_ok=True)
    rep = dict(checkpoint=ck, n_windows=len(ws), sols=[float(df.sol.min()), float(df.sol.max())],
               results=res, contract=con, mvp_checks=chk, mvp_pass=all(chk.values()))
    with open(os.path.join(c['out'], 'eval_real.json'), 'w') as fh: json.dump(rep, fh, indent=1)
    figure(m, ws, dev, os.path.join(c['out'], 'real_demo.png'), c)

    print(f'\n{"hueco":>6} {"modelo":>7} {"RMSE K":>8} {"MAE K":>7} {"cov1":>5} {"cov2":>5} {"cov1t":>6} {"cov2t":>6}')
    for f, r in res.items():
        for k in ['lin', 'spl', 'gp', 'varnet']:
            q = r[k]; t1 = q.get('cov1_tot'); t2 = q.get('cov2_tot')
            cv = (f'{q["cov1"]:5.2f} {q["cov2"]:5.2f}' if k in ('gp', 'varnet') else '  N/A   N/A')
            ct = f'{t1:6.2f} {t2:6.2f}' if t1 is not None else ''
            print(f'{f:>6} {k:>7} {q["rmse"]:8.2f} {q["mae"]:7.2f} {cv} {ct}')
        print(f'{"":>6} piso de ruido {r["noise_floor_K"]:.2f} K, hueco ~{r["hole_sols_median"]:.1f} sols')
    print('\ncontrato:', json.dumps(con))
    print('\nMVP:')
    for k, v in chk.items(): print(f'  [{"OK" if v else "NO"}] {k}')
    print('\nVEREDICTO:', 'MVP CUMPLE' if rep['mvp_pass'] else 'MVP NO CUMPLE (ver [NO])')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'runs/varnet/last.pt')
