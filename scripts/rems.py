"""REMS MODRDR (PDS, mslrem_1001) -> data/raw/rems_air.csv en el formato de data.py.

Columnas de salida: sol, ltst (horas decimales, tiempo solar verdadero del rover),
air_temp (K, media por minuto), air_temp_err (K, desviación dentro del minuto),
quality (0 = válido), n (muestras de 1 Hz en el minuto).

Uso:
  uv run python rems.py --sols 1500 1559            # descarga, convierte, borra los .TAB
  uv run python rems.py --sols 1500 1559 --dry-run  # solo lista lo que bajaría
  uv run python rems.py --local "D:/rems/*.TAB"     # convierte archivos ya descargados
  uv run python rems.py --inspect ruta/al/archivo.TAB   # muestra columnas detectadas
"""
import argparse, glob, os, re, sys, urllib.request, urllib.parse
import numpy as np, pandas as pd

# Usa el almacén de certificados del sistema (Windows) en vez del de Python.
# Necesario si un filtro/antivirus re-firma HTTPS con su propia raíz: el navegador
# confía en ella, Python no. La verificación TLS sigue activa.
try:
    import truststore; truststore.inject_into_ssl()
except ImportError:
    pass

CFG = dict(
    base='https://atmos.nmsu.edu/PDS/data/mslrem_1001/',
    raw='data/raw/rems_tab', out='data/raw/rems_air.csv',
    # nombres de columna (PDS3); si el label trae otros, se buscan por patrón
    col_ltst='LTST', col_temp='AMBIENT_TEMP', col_conf=None,
    conf_ok=None,           # regex de códigos de confianza aceptados; None = no filtrar
    t_range=(100., 350.),   # K, valores fuera se descartan
    bin_s=60, min_n=10,     # agregación por minuto, mínimo de muestras de 1 Hz
)

FILE_RE = re.compile(r'RMD(\d{4})\d*_*\w*\.TAB$', re.I)   # RME_417331939RMD02240000000_______P7.TAB -> sol 224
LTST_RE = re.compile(r'(\d+)\D+?(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)')

# ---------------------------------------------------------------- descarga
def _ls(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        html = r.read().decode('latin-1')
    out = []
    for h in re.findall(r'href="([^"?#]+)"', html, re.I):
        if h.startswith(('/', 'http', '..')) and not h.startswith(url):
            continue
        out.append(urllib.parse.urljoin(url, h))
    return out

def _ints(name):
    return [int(v) for v in re.findall(r'\d+', name)]

def _overlaps(name, a, b):
    v = _ints(name)
    if not v: return True
    lo, hi = (v[0], v[1]) if len(v) >= 2 else (v[0], v[0])
    return not (hi < a or lo > b)

def crawl(a, b, c=CFG, depth=4):
    """Recorre el índice Apache de DATA/ y devuelve URLs de MODRDR .TAB (+ .LBL) en [a, b]."""
    found, stack = [], [(c['base'] + 'DATA/', 0)]
    while stack:
        url, d = stack.pop()
        for u in _ls(url):
            name = u.rstrip('/').split('/')[-1]
            if u.endswith('/'):
                if d < depth and u.startswith(url) and _overlaps(name, a, b):
                    stack.append((u, d + 1))
            else:
                m = FILE_RE.search(name)
                if m and a <= int(m.group(1)) <= b:
                    found.append(u)
                    found.append(u[:-4] + '.LBL')
    return sorted(set(found))

def fmt_files(c=CFG):
    try:
        return [u for u in _ls(c['base'] + 'LABEL/') if u.upper().endswith('.FMT')]
    except Exception as e:
        print('aviso: no pude listar LABEL/:', e); return []

def get(url, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst):
        tmp = dst + '.part'
        urllib.request.urlretrieve(url, tmp); os.replace(tmp, dst)
    return dst

# ---------------------------------------------------------------- etiquetas PDS3
def _cols_from(text):
    blocks = re.findall(r'OBJECT\s*=\s*COLUMN(.*?)END_OBJECT\s*=\s*COLUMN', text, re.S | re.I)
    return [re.search(r'\bNAME\s*=\s*"?([\w\-]+)"?', b).group(1).upper() for b in blocks
            if re.search(r'\bNAME\s*=', b)]

def columns(tab):
    """Nombres de columna en orden, leídos del .LBL o del .FMT al que apunta."""
    lbl = next((p for p in (tab[:-4] + '.LBL', tab[:-4] + '.lbl') if os.path.exists(p)), None)
    if lbl is None: return None
    text = open(lbl, encoding='latin-1').read()
    cols = _cols_from(text)
    if cols: return cols
    m = re.search(r'\^STRUCTURE\s*=\s*"?([\w\.]+)"?', text, re.I)
    if m:
        for d in (os.path.dirname(tab), CFG['raw'], os.path.join(CFG['raw'], 'LABEL')):
            for f in glob.glob(os.path.join(d, '*')):
                if os.path.basename(f).upper() == m.group(1).upper():
                    return _cols_from(open(f, encoding='latin-1').read())
    return None

def _pick(cols, exact, must, bad=('CONF', 'UNC', 'ERR')):
    if exact and exact.upper() in cols: return cols.index(exact.upper())
    for i, n in enumerate(cols):
        if all(k in n for k in must) and not any(k in n for k in bad): return i
    return None

def _pick_conf(cols, c):
    if c['col_conf']: return cols.index(c['col_conf'].upper())
    for i, n in enumerate(cols):
        if 'AMBIENT' in n and 'CONF' in n: return i
    return None

# ---------------------------------------------------------------- conversión
def ltst_hours(s):
    m = LTST_RE.search(str(s))
    if not m: return np.nan, np.nan
    sol, h, mi, se = m.groups()
    return int(sol), int(h) + int(mi) / 60 + float(se) / 3600

def parse(tab, c=CFG, verbose=False):
    cols = columns(tab)
    raw = pd.read_csv(tab, header=None, dtype=str, skipinitialspace=True)
    raw = raw.apply(lambda s: s.str.strip().str.strip('"'))
    if cols is None or len(cols) != raw.shape[1]:
        raise ValueError(f'{os.path.basename(tab)}: label con {None if cols is None else len(cols)} '
                         f'columnas, tabla con {raw.shape[1]}. Usa --inspect.')
    il = _pick(cols, c['col_ltst'], ['LTST'])
    it = _pick(cols, c['col_temp'], ['AMBIENT', 'TEMP'])
    ic = _pick_conf(cols, c)
    if verbose:
        print(f'{len(cols)} columnas; LTST -> {cols[il] if il is not None else None}, '
              f'temp -> {cols[it] if it is not None else None}, conf -> {cols[ic] if ic is not None else None}')
    if il is None or it is None:
        raise ValueError(f'no encontré LTST/AMBIENT_TEMP. Columnas: {cols}')
    st = np.array([ltst_hours(v) for v in raw[il]], float)
    df = pd.DataFrame(dict(sol=st[:, 0], ltst=st[:, 1], val=pd.to_numeric(raw[it], errors='coerce')))
    if ic is not None and c['conf_ok']:
        df = df[raw[ic].str.fullmatch(c['conf_ok']).fillna(False).values]
    lo, hi = c['t_range']
    df = df.dropna()
    df = df[(df.val > lo) & (df.val < hi)]
    if df.empty: return df
    # agregación por minuto (1 Hz -> 1/60 Hz); la desviación interna se guarda como incertidumbre
    tt = df.sol + df.ltst / 24
    key = np.floor(tt * 86400 / c['bin_s']).astype(np.int64)
    g = df.assign(k=key.values, tt=tt.values).groupby('k')
    b = pd.DataFrame(dict(tt=g.tt.mean(), air_temp=g.val.mean(), air_temp_err=g.val.std(ddof=0), n=g.val.size()))
    b = b[b.n >= c['min_n']]
    sol = np.floor(b.tt)
    return pd.DataFrame(dict(sol=sol.astype(int), ltst=(b.tt - sol) * 24, air_temp=b.air_temp,
                             air_temp_err=b.air_temp_err, quality=0, n=b.n)).reset_index(drop=True)

def append(df, out):
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    df.to_csv(out, mode='a', header=not os.path.exists(out), index=False)

def finalize(out):
    if not os.path.exists(out):
        sys.exit('no se escribió ningún dato válido')
    d = pd.read_csv(out)
    d = d.sort_values(['sol', 'ltst']).drop_duplicates(['sol', 'ltst'])
    d.to_csv(out, index=False)
    print(f'{out}: {len(d)} minutos, sols {d.sol.min()}-{d.sol.max()} ({d.sol.nunique()} sols), '
          f'T {d.air_temp.min():.1f}-{d.air_temp.max():.1f} K, err mediana {d.air_temp_err.median():.2f} K')

# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sols', nargs=2, type=int)
    ap.add_argument('--local'); ap.add_argument('--inspect')
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--keep', action='store_true')
    ap.add_argument('--out', default=CFG['out'])
    a = ap.parse_args(); c = CFG

    if a.inspect:
        cols = columns(a.inspect)
        print('columnas del label:', cols)
        print(pd.read_csv(a.inspect, header=None, dtype=str, nrows=3).T.to_string())
        print(parse(a.inspect, c, verbose=True).head()); return

    if os.path.exists(a.out) and not a.dry_run:
        os.remove(a.out)

    if a.local:
        fs = sorted(glob.glob(a.local))
        if not fs: sys.exit(f'sin archivos en {a.local}')
        for i, f in enumerate(fs):
            d = parse(f, c, verbose=(i == 0)); append(d, a.out)
            print(f'[{i+1}/{len(fs)}] {os.path.basename(f)}: {len(d)} min')
        finalize(a.out); return

    if not a.sols: ap.error('usa --sols A B, --local o --inspect')
    print('buscando archivos MODRDR en el PDS...')
    urls = crawl(*a.sols, c)
    tabs = [u for u in urls if u.upper().endswith('.TAB')]
    print(f'{len(tabs)} archivos .TAB en sols {a.sols[0]}-{a.sols[1]}')
    if a.dry_run:
        print('\n'.join(tabs[:20])); return
    if not tabs:
        sys.exit('no encontré archivos MODRDR (RMD...TAB). Revisa CFG["base"] y la estructura de DATA/ en el navegador.')
    for u in fmt_files(c):
        get(u, os.path.join(c['raw'], 'LABEL', u.split('/')[-1]))
    for i, u in enumerate(tabs):
        dst = os.path.join(c['raw'], u.split('/')[-1])
        try:
            get(u[:-4] + '.LBL', dst[:-4] + '.LBL'); get(u, dst)
            d = parse(dst, c, verbose=(i == 0)); append(d, a.out)
            print(f'[{i+1}/{len(tabs)}] {os.path.basename(dst)}: {len(d)} min', flush=True)
        except Exception as e:
            print(f'[{i+1}/{len(tabs)}] ERROR {u}: {e}', flush=True)
            if i == 0: raise
        finally:
            if not a.keep and os.path.exists(dst): os.remove(dst)
    finalize(a.out)

if __name__ == '__main__':
    main()