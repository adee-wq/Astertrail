import torch, numpy as np, matplotlib.pyplot as plt
from model import Interp
from synth import batch
from eval import hole_mask, spl, gp, varnet_at

def load(ck, dev):
    m = Interp().to(dev)
    m.load_state_dict(torch.load(ck, map_location=dev)['model'])
    return m.eval()

def show(ck='runs/varnet/last.pt', frac=.3, seed=0, out='demo.png'):
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    m = load(ck, dev)
    d = batch(1, dev=dev, seed=seed)
    t = d['t'][0].cpu().numpy(); x = d['x'][0].cpu().numpy(); y = d['y'][0].cpu().numpy()
    M = d['mask'][0].cpu().numpy().astype(bool)
    hm, st, k = hole_mask(len(t), frac, dev, seed)
    vis, hid = M & hm, ~hm
    tg = np.linspace(0, 1, 400)
    vm, vs = varnet_at(m, d, 0, vis, tg, dev)
    sm = spl(t, x, vis, tg)
    gm, gs = gp(t, x, vis, tg)
    fig, ax = plt.subplots(3, 1, figsize=(10, 9), sharex=True)
    for a, (p, sd, nm) in zip(ax, [(vm, vs, 'VARnet'), (sm, None, 'Spline'), (gm, gs, 'GP')]):
        a.scatter(t[vis], x[vis], s=8, c='k', label='observado')
        a.scatter(t[hid], y[hid], s=8, c='r', label='oculto (real)')
        a.plot(tg, p, lw=1.2, label=nm)
        if sd is not None:
            a.fill_between(tg, p - sd, p + sd, alpha=.25, label='±1σ')
            a.fill_between(tg, p - 2*sd, p + 2*sd, alpha=.1, label='±2σ')
        a.axvspan(t[st], t[min(st + k - 1, len(t) - 1)], color='gray', alpha=.15)
        a.legend(loc='upper right', fontsize=8); a.set_title(nm)
    ax[-1].set_xlabel('t normalizado')
    fig.tight_layout(); fig.savefig(out, dpi=120); plt.close(fig)

if __name__ == '__main__':
    import sys
    show(sys.argv[1] if len(sys.argv) > 1 else 'runs/varnet/last.pt')