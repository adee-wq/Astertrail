import torch, math

CFG = dict(
    dark_p=0.3, sol_p=1.0, season_p=668.6,
    n_min=10, n_max=50, burst_gap=(5., 300.),
    sig_lo=1e-3, sig_hi=1e-1, sig_scale=(0.4, 0.6),
    N=500, span=(0., 10.),
)

def _u(n, lo, hi, dev):
    return torch.rand(n, device=dev) * (hi - lo) + lo

def _logu(n, lo, hi, dev):
    return torch.exp(_u(n, math.log(lo), math.log(hi), dev))

def _base(t, B, dev):
    amp = _u(B, .1, 1., dev)[:, None]
    ph = _u(B, 0, 2*math.pi, dev)[:, None]
    f = amp * torch.sin(2*math.pi*t + ph)
    for k in range(2, 4):
        a = _u(B, 0, .3, dev)[:, None] / k
        f = f + a * torch.sin(2*math.pi*k*t + _u(B, 0, 2*math.pi, dev)[:, None])
    sa = _u(B, .05, .5, dev)[:, None]
    sp = _u(B, 0, 2*math.pi, dev)[:, None]
    f = f + sa * torch.sin(2*math.pi*t/CFG['season_p'] + sp)
    return f + _u(B, -.05, .05, dev)[:, None] * t

def _dust(t, B, dev):
    on = (torch.rand(B, device=dev) < CFG['dark_p']).float()[:, None]
    t0 = _u(B, t.min().item(), t.max().item(), dev)[:, None]
    a = _u(B, .2, 1.5, dev)[:, None]
    tau = _u(B, .5, 20., dev)[:, None]
    dt = (t - t0).clamp(min=0)
    rise = (dt / .2).clamp(max=1.)
    return on * a * rise * torch.exp(-dt / tau) * (t >= t0).float()

def _times(B, N, dev):
    span = CFG['span'][1]
    gap = _u(B, *CFG['burst_gap'], dev)
    dens = torch.randint(CFG['n_min'], CFG['n_max'] + 1, (B,), device=dev)
    t = torch.rand(B, N, device=dev) * span
    t = t.sort(1).values
    t = t - t[:, :1]
    return t, dens, gap

def _mask(B, N, dev, hide_lo=.2, hide_hi=.5):
    p = _u(B, hide_lo, hide_hi, dev)[:, None]
    m = torch.rand(B, N, device=dev) > p
    k = int(N * .15)
    st = torch.randint(0, N - k, (B,), device=dev)
    idx = torch.arange(N, device=dev)[None]
    gap = (idx >= st[:, None]) & (idx < st[:, None] + k)
    return m & ~gap

@torch.no_grad()
def batch(B=256, N=None, dev='cuda', seed=None):
    if seed is not None:
        torch.manual_seed(seed)
    N = N or CFG['N']
    t, dens, gap = _times(B, N, dev)
    tn = t / t.max(1, keepdim=True).values.clamp(min=1e-6)
    f = _base(t, B, dev) + _dust(t, B, dev)
    sig_rel = _logu(B, CFG['sig_lo'], CFG['sig_hi'], dev)[:, None]
    amp = f.abs().amax(1, keepdim=True).clamp(min=1e-3)
    sig = sig_rel * amp
    x = f + torch.randn_like(f) * sig
    s_rep = sig * _u(B, *CFG['sig_scale'], dev)[:, None]
    mask = _mask(B, N, dev)
    return dict(x=x, t=tn, sigma=s_rep, mask=mask.float(), y=f, true_sig=sig)
