import torch, torch.nn as nn

LS_LO, LS_HI = -7., 3.

def stats(x, mask):
    xm = x.masked_fill(mask == 0, float('nan'))
    med = torch.nanmedian(xm, 1, keepdim=True).values
    iqr = (torch.nanquantile(xm, .75, 1, keepdim=True) - torch.nanquantile(xm, .25, 1, keepdim=True)).clamp(min=1e-6)
    return med, iqr

def norm(v, med, iqr):
    return torch.asinh((v - med) / iqr)

class FEFT(nn.Module):
    def __init__(s, m=256):
        super().__init__()
        s.u = nn.Parameter(torch.rand(m) * 50)
    def forward(s, x, t, mask):
        ph = t[..., None] * s.u
        w = (x * mask)[..., None]
        f = torch.cat([(w * torch.cos(ph)).sum(1), (w * torch.sin(ph)).sum(1)], -1)
        return f / mask.sum(1, keepdim=True).clamp(min=1)

class Interp(nn.Module):
    def __init__(s, m=256, h=256, k=16):
        super().__init__()
        s.f = FEFT(m)
        s.enc = nn.Sequential(nn.Linear(2*m, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU())
        s.fq = nn.Parameter(torch.rand(k) * 50)
        s.q = nn.Sequential(nn.Linear(h + 2*k, h), nn.ReLU(), nn.Linear(h, 2))
    def forward(s, x, t, mask, tq):
        med, iqr = stats(x, mask)
        z = s.enc(s.f(norm(x, med, iqr), t, mask))
        ph = tq[..., None] * s.fq
        e = torch.cat([ph.sin(), ph.cos()], -1)
        z = z[:, None].expand(-1, tq.size(1), -1)
        o = s.q(torch.cat([z, e], -1)).float()
        return o[..., 0], o[..., 1].clamp(LS_LO, LS_HI), med, iqr
    def loss(s, x, t, mask, tq, y):
        mu, ls, med, iqr = s(x, t, mask, tq)
        yn = norm(y, med, iqr)
        return (0.5 * ((yn - mu) * (-ls).exp())**2 + ls).mean()
    @torch.no_grad()
    def predict(s, x, t, mask, tq):
        mu, ls, med, iqr = s(x, t, mask, tq)
        return torch.sinh(mu) * iqr + med, torch.cosh(mu) * ls.exp() * iqr

if __name__ == '__main__':
    from synth import batch
    d = batch(8, dev='cpu')
    m = Interp()
    l = m.loss(d['x'], d['t'], d['mask'], d['t'], d['y']); l.backward()
    print(l.item())