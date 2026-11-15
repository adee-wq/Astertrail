"""Baja teselas de Mars Trek a ui/tiles/ para usar la UI sin internet (?offline=1).

  uv run python scripts/cache_tiles.py                      # caja por defecto (zona de la ruta demo)
  uv run python scripts/cache_tiles.py --bbox 137.34 -4.76 137.41 -4.69

Capas y zooms (mismas que ui/layers.js):
  hirise   curiosity_hirise_mosaic   z11-16 en --bbox
  ctx      Gale_CTX_BlockAdj_dd      z8-12  en --bbox ampliada x4
  relieve  MOLA+HRSC ClrShade        z4-8   en --bbox ampliada x20
Salta las teselas ya descargadas; los 404 (sin cobertura) se ignoran.
"""
import argparse, math, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

try:                                   # PC con filtro HTTPS: confiar en el almacén de Windows
    import truststore; truststore.inject_into_ssl()
except ImportError:
    pass

TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/'
LAYERS = {   # id, ext, zmin, zmax, factor de ampliación de la caja
    'hirise':  ('curiosity_hirise_mosaic', 'png', 11, 16, 1),
    'ctx':     ('Gale_CTX_BlockAdj_dd', 'png', 8, 12, 4),
    'relieve': ('Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', 'jpg', 4, 8, 20),
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'ui', 'tiles')

def tiles(bbox, z):
    lon0, lat0, lon1, lat1 = bbox
    d = 180 / 2 ** z
    c0, c1 = int((lon0 + 180) // d), int((lon1 + 180) // d)
    r0, r1 = int((90 - lat1) // d), int((90 - lat0) // d)
    return [(z, r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]

def grow(bbox, k):
    lon0, lat0, lon1, lat1 = bbox
    cx, cy, hw, hh = (lon0 + lon1) / 2, (lat0 + lat1) / 2, (lon1 - lon0) / 2 * k, (lat1 - lat0) / 2 * k
    return (cx - hw, max(-90, cy - hh), cx + hw, min(90, cy + hh))

def fetch(job):
    lid, ext, (z, r, c) = job
    path = os.path.join(OUT, lid, str(z), str(r), f'{c}.{ext}')
    if os.path.exists(path):
        return 'skip'
    url = f'{TREK}{lid}/1.0.0/default/default028mm/{z}/{r}/{c}.{ext}'
    for i in range(3):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'astertrail-cache'}), timeout=30).read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(data)
            return 'ok'
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return '404'
        except Exception:
            pass
        time.sleep(1 + i)
    return 'err'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bbox', type=float, nargs=4, metavar=('LON0', 'LAT0', 'LON1', 'LAT1'),
                    default=[137.34, -4.76, 137.41, -4.69])
    ap.add_argument('--layers', nargs='+', default=list(LAYERS), choices=list(LAYERS))
    ap.add_argument('--workers', type=int, default=8)
    a = ap.parse_args()
    jobs = []
    for k in a.layers:
        lid, ext, z0, z1, f = LAYERS[k]
        bb = grow(a.bbox, f)
        for z in range(z0, z1 + 1):
            jobs += [(lid, ext, t) for t in tiles(bb, z)]
    print(f'{len(jobs)} teselas -> {os.path.abspath(OUT)}')
    n = {}
    with ThreadPoolExecutor(a.workers) as ex:
        for i, s in enumerate(ex.map(fetch, jobs), 1):
            n[s] = n.get(s, 0) + 1
            if i % 100 == 0:
                print(f'  {i}/{len(jobs)} {n}', flush=True)
    print('listo', n)
    if n.get('err'):
        sys.exit(1)

if __name__ == '__main__':
    main()
