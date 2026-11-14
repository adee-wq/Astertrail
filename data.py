import os, glob, urllib.request
import numpy as np, pandas as pd
from dataclasses import dataclass, field

@dataclass
class CFG:
    urls: list = field(default_factory=list)
    src: list = field(default_factory=lambda: ['data/raw/*.csv'])
    cols: dict = field(default_factory=lambda: dict(sol='sol', ltst='ltst', val='air_temp', sig='air_temp_err', flag='quality', ls='ls'))
    ls0: float = 151.0
    out: str = 'data/processed'
    test_sols: int = 200
    win: float = 1.0
    step: float = 0.5
    min_pts: int = 10

C = CFG()

def fetch(url, dst):
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    if not os.path.exists(dst):
        urllib.request.urlretrieve(url, dst)
    return dst

def ls_of(sol, ls0=C.ls0):
    return (ls0 + 360. * np.asarray(sol, float) / 668.6) % 360.

def load(c=C):
    fs = sorted(f for p in c.src for f in glob.glob(p))
    if not fs:
        raise FileNotFoundError(c.src)
    df = pd.concat([pd.read_csv(f) for f in fs], ignore_index=True)
    df = df.rename(columns={v: k for k, v in c.cols.items() if v in df.columns})
    if 'flag' in df:
        df = df[df['flag'] == 0]
    df = df.dropna(subset=['sol', 'ltst', 'val']).copy()
    if 'sig' not in df:
        df['sig'] = np.nan
    df['sig'] = df['sig'].fillna(df['val'].std() * 1e-2)
    if 'ls' not in df:
        df['ls'] = ls_of(df['sol'], c.ls0)
    df['t'] = df['sol'] + df['ltst'] / 24.
    df = df.sort_values('t').drop_duplicates('t')
    return df[['t', 'sol', 'ls', 'val', 'sig']].reset_index(drop=True)

def split(df, c=C):
    cut = df['t'].max() - c.test_sols
    tr = df[df['t'] < cut].reset_index(drop=True)
    te = df[df['t'] >= cut].reset_index(drop=True)
    return tr, te

def windows(df, c=C):
    t, x, s, l = df.t.values, df.val.values, df.sig.values, df.ls.values
    out, a = [], t.min()
    while a + c.win <= t.max():
        m = (t >= a) & (t < a + c.win)
        if m.sum() >= c.min_pts:
            out.append(dict(t=(t[m] - a) / c.win, x=x[m], sigma=s[m], ls=l[m], t0=a))
        a += c.step
    return out

def save(c=C):
    for u in c.urls:
        fetch(u, os.path.join('data/raw', os.path.basename(u)))
    df = load(c)
    tr, te = split(df, c)
    os.makedirs(c.out, exist_ok=True)
    tr.to_csv(os.path.join(c.out, 'train.csv'), index=False)
    te.to_csv(os.path.join(c.out, 'test.csv'), index=False)
    return tr, te

if __name__ == '__main__':
    tr, te = save()
    print(f"total {len(tr) + len(te)} | train {len(tr)} t[{tr.t.min():.2f},{tr.t.max():.2f}] | test {len(te)} | ventanas test {len(windows(te))}")