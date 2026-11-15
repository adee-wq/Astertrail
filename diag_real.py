"""Diagnóstico de por qué VARnet falla en REMS real. Verifica hipótesis con datos.

  uv run python diag_real.py runs/varnet/last.pt
  -> imprime el informe y guarda runs/varnet/diag_real.json

H1  Arquitectura: ¿VARnet reproduce los puntos que SÍ ve? Si su error sobre los
    puntos visibles es parecido al de los ocultos, no interpola: suaviza.
H2  Amplitud: pendiente de la regresión pred~obs en el hueco. < 1 = aplana el ciclo.
H3  Sim-a-real: RMSE en unidades normalizadas (÷ IQR de la ventana), comparable
    con val_rmse del entrenamiento sintético (~0.14) y eval.py (0.23-0.26).
H4  Calibración: factor k para sigma, ajustado en la mitad de las ventanas y
    probado en la otra mitad (sin mirar los datos de prueba).
H5  Velocidad: tiempo por ventana de VARnet vs GP (mismo hueco, mismas consultas).
H6  Corrección afín por serie: ajusta x ~ a*mu + b SOLO con los puntos visibles de
    cada ventana y la aplica al hueco. Si el error es sobre todo amplitud aplanada,
    debería bajar el RMSE sin reentrenar y sin mirar los datos ocultos.
"""
import json, os, sys, time
import numpy as np, torch
import data as D
from eval import gp, hole_mask
from eval_real import CFG, windows, varnet

def rmse(e): return float(np.sqrt(np.mean(e ** 2)))

def main(ck, c=CFG, f=.2):
    from model import Interp
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    m = Interp().to(dev); m.load_state_dict(torch.load(ck, map_location=dev)['model']); m.eval()
    dc = D.CFG(); dc.src = c['src']; ws = windows(D.load(dc), c)
    print(f'{len(ws)} ventanas, hueco {int(f*100)} %\n')

    v0, _, _ = hole_mask(c['N'], f, dev, 0); varnet(m, ws[0], v0, ws[0]['t'], dev)   # calentamiento
    rows = []
    for i, w in enumerate(ws):
        vis, _, _ = hole_mask(c['N'], f, dev, int(c['seed'] + i)); hid = ~vis
        t, x = w['t'], w['x']
        iqr = np.subtract(*np.percentile(x[vis], [75, 25]))

        t0 = time.perf_counter(); mu_all, sd_all = varnet(m, w, vis, t, dev)
        if dev == 'cuda': torch.cuda.synchronize()
        tv = time.perf_counter() - t0
        t0 = time.perf_counter(); g_all, gs_all = gp(t, x, vis, t); tg = time.perf_counter() - t0

        e_v = mu_all - x; e_g = g_all - x
        a, b = np.polyfit(mu_all[vis], x[vis], 1)                 # solo visibles
        mu_c = a * mu_all + b
        slope_v = float(np.polyfit(x[hid], mu_all[hid], 1)[0])
        slope_g = float(np.polyfit(x[hid], g_all[hid], 1)[0])
        rows.append(dict(
            vn_vis=rmse(e_v[vis]), vn_hid=rmse(e_v[hid]), gp_vis=rmse(e_g[vis]), gp_hid=rmse(e_g[hid]),
            vn_hid_norm=rmse(e_v[hid]) / iqr, gp_hid_norm=rmse(e_g[hid]) / iqr, iqr=float(iqr),
            slope_v=slope_v, slope_g=slope_g, bias_v=float(e_v[hid].mean()),
            z=(e_v[hid] / sd_all[hid]).tolist(), t_vn=tv, t_gp=tg,
            vn_hid_afin=rmse(mu_c[hid] - x[hid]), a_afin=float(a),
            slope_afin=float(np.polyfit(x[hid], mu_c[hid], 1)[0])))

    A = lambda k: float(np.mean([r[k] for r in rows]))
    rep = {k: A(k) for k in rows[0] if k != 'z'}

    # H4: calibración con validación cruzada en 2 mitades
    half = len(rows) // 2
    def k_for(rs):
        z = np.abs(np.concatenate([r['z'] for r in rs]))
        return float(np.quantile(z, .6827))          # k tal que |e| <= k*sigma en el 68 %
    def cov(rs, k):
        z = np.abs(np.concatenate([r['z'] for r in rs]))
        return float((z <= k).mean()), float((z <= 2 * k).mean())
    kA, kB = k_for(rows[:half]), k_for(rows[half:])
    rep['calib'] = dict(k_mitadA=kA, k_mitadB=kB,
                        cov_sin_calibrar=cov(rows, 1.0),
                        cov_B_con_kA=cov(rows[half:], kA), cov_A_con_kB=cov(rows[:half], kB))

    print('H1  ¿VARnet reproduce lo que ve?        RMSE visibles   RMSE ocultos')
    print(f'      VARnet                              {rep["vn_vis"]:8.2f} K     {rep["vn_hid"]:8.2f} K')
    print(f'      GP                                  {rep["gp_vis"]:8.2f} K     {rep["gp_hid"]:8.2f} K')
    print(f'H2  Pendiente pred~obs en el hueco (1 = amplitud correcta): VARnet {rep["slope_v"]:.2f}, GP {rep["slope_g"]:.2f}'
          f'; sesgo medio VARnet {rep["bias_v"]:+.2f} K')
    print(f'H3  RMSE normalizado (÷IQR {rep["iqr"]:.1f} K): VARnet {rep["vn_hid_norm"]:.3f}, GP {rep["gp_hid_norm"]:.3f}'
          f'  (sintético: VARnet 0.23-0.26, GP 0.06-0.07)')
    cb = rep['calib']
    print(f'H4  k = {kA:.2f} / {kB:.2f} (mitades). cov1/cov2 sin calibrar {cb["cov_sin_calibrar"][0]:.2f}/{cb["cov_sin_calibrar"][1]:.2f}'
          f' -> B con k de A {cb["cov_B_con_kA"][0]:.2f}/{cb["cov_B_con_kA"][1]:.2f}, A con k de B {cb["cov_A_con_kB"][0]:.2f}/{cb["cov_A_con_kB"][1]:.2f}')
    print(f'H5  Tiempo por ventana: VARnet {rep["t_vn"]*1e3:.1f} ms, GP {rep["t_gp"]*1e3:.0f} ms (x{rep["t_gp"]/rep["t_vn"]:.0f})')

    print(f'H6  Corrección afín (a={rep["a_afin"]:.2f}): RMSE oculto {rep["vn_hid"]:.2f} -> {rep["vn_hid_afin"]:.2f} K,'
          f' pendiente {rep["slope_v"]:.2f} -> {rep["slope_afin"]:.2f}  (GP {rep["gp_hid"]:.2f} K)')

    os.makedirs(c['out'], exist_ok=True)
    with open(os.path.join(c['out'], 'diag_real.json'), 'w') as fh: json.dump(rep, fh, indent=1)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'runs/varnet/last.pt')