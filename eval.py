
import torch, json, warnings, numpy as np
from sklearn.exceptions import ConvergenceWarning
warnings.filterwarnings('ignore', category=ConvergenceWarning)

from scipy.interpolate import CubicSpline
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import (
    ExpSineSquared, RBF, ConstantKernel as C, WhiteKernel
)
from synth import batch


def hole_mask(n, frac, dev, seed):
    g = torch.Generator().manual_seed(seed)
    k = int(n * frac)
    st = torch.randint(0, n - k, (1,), generator=g).item()
    m = np.ones(n, dtype=bool)
    m[st:st + k] = False
    return m, st, k


def lin(t, x, m, tq):
    return np.interp(tq, t[m], x[m])

def spl(t, x, m, tq):
    tt, ii = np.unique(t[m], return_index=True)
    xx = x[m][ii]
    p = CubicSpline(tt, xx, extrapolate=False)(tq)
    return np.where(np.isnan(p), np.interp(tq, tt, xx), p)

def gp(t, x, m, tq):
    k = (
        C(1., (1e-3, 1e3))
        * ExpSineSquared(
            .5, .1,
            periodicity_bounds=(1e-2, 1.)
        )
        * RBF(.3, (1e-2, 10.))
        + WhiteKernel(1e-2, (1e-6, 1.))
    )

    g = GaussianProcessRegressor(
        k,
        normalize_y=True,
        n_restarts_optimizer=0
    )

    g.fit(t[m][:, None], x[m])
    mu, sd = g.predict(tq[:, None], return_std=True)
    return mu, sd


@torch.no_grad()
def varnet_at(m, d, i, mask, tq, dev):
    x = d['x'][i:i+1]
    t = d['t'][i:i+1]

    mk = torch.as_tensor(
        mask, dtype=torch.float32, device=dev
    )[None]

    q = torch.as_tensor(
        tq, dtype=torch.float32, device=dev
    )[None]

    mu, ls, med, iqr = m(x, t, mk, q)

    p = torch.sinh(mu) * iqr + med
    s = torch.cosh(mu) * ls.exp() * iqr

    return p[0].cpu().numpy(), s[0].cpu().numpy()


def metrics(p, s, y):
    e = p - y

    return dict(
        rmse=float(np.sqrt((e**2).mean())),
        mae=float(np.abs(e).mean()),
        cov1=float((np.abs(e) <= s).mean()),
        cov2=float((np.abs(e) <= 2*s).mean())
    )


@torch.no_grad()
def run(m, dev='cuda', n=32, N=500, fracs=(.1, .2, .4), seed=0):
    d = batch(n, N=N, dev=dev, seed=seed)

    tn = d['t'].cpu().numpy()
    X = d['x'].cpu().numpy()
    Y = d['y'].cpu().numpy()
    M = d['mask'].cpu().numpy().astype(bool)

    out = {}

    for f in fracs:
        rows = {
            k: [] for k in ['lin', 'spl', 'gp', 'varnet']
        }

        for i in range(n):
            hm, st, k = hole_mask(N, f, dev, seed + i)

            vis = M[i] & hm
            hid = ~hm

            tq = tn[i][hid]
            yt = Y[i][hid]
            z = np.full_like(tq, 1e-6)

            rows['lin'].append(
                metrics(lin(tn[i], X[i], vis, tq), z, yt)
            )

            rows['spl'].append(
                metrics(spl(tn[i], X[i], vis, tq), z, yt)
            )

            if i < 32:
                gm, gs = gp(tn[i], X[i], vis, tq)
                rows['gp'].append(metrics(gm, gs, yt))

            mp, sp = varnet_at(m, d, i, vis, tq, dev)
            rows['varnet'].append(metrics(mp, sp, yt))

        out[f] = {
            k: {
                q: float(np.mean([r[q] for r in v]))
                for q in v[0]
            }
            for k, v in rows.items() if v
        }

    return out


if __name__ == '__main__':
    import sys
    from model import Interp

    dev = 'cuda' if torch.cuda.is_available() else 'cpu'

    m = Interp().to(dev)

    ck = sys.argv[1] if len(sys.argv) > 1 else 'runs/varnet/last.pt'

    m.load_state_dict(
        torch.load(ck, map_location=dev)['model']
    )

    m.eval()

    print(json.dumps(run(m, dev), indent=1))
