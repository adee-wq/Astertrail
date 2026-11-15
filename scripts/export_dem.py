"""Recorta una ventana del DEM de Gale (USGS, 1 m) y la exporta para la UI.

  uv run --with rasterio python scripts/export_dem.py
  uv run --with rasterio python scripts/export_dem.py --bbox 137.32 -4.78 137.44 -4.66 --res 10

Fuente: MSL Gale Merged DEM 1 m v3, USGS Astrogeology (Parker & Calef).
  https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif   (3.6 GB)
Se lee por rangos HTTP con GDAL /vsicurl/: solo baja la ventana pedida, y al pedir
~10 m GDAL usa las overviews internas del GeoTIFF (4/8/16 m), así que son pocos MB.

El DEM está en equirectangular con meridiano 0 y paralelo estándar 0 sobre una esfera
R = 3396190 m: x = R·lon, y = R·lat (radianes). Por eso la rejilla de salida es regular
en lat/lon y coincide con las teselas EQ de Mars Trek.

Salida: ui/data/dem.js -> window.DEM_DATA = {meta, lon0, lat0, dlon, dlat, nx, ny, scale, offset, nodata, b64}
  Valores Uint16 little-endian (base64), fila 0 = norte. elev_m = v * scale + offset; v == nodata -> sin dato.

Si /vsicurl/ falla por certificados (PC con filtro HTTPS), apunta CURL_CA_BUNDLE a un .pem
exportado del almacén de Windows. No desactivar la verificación TLS.
"""
import argparse, base64, json, math, os, time
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

URL = 'https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif'
R_DEM = 3396190.0
SCALE, OFFSET, NODATA = 0.1, -5000.0, 65535      # 0.1 m, rango -5000 .. +1553 m

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bbox', type=float, nargs=4, metavar=('LON0', 'LAT0', 'LON1', 'LAT1'),
                    default=[137.32, -4.78, 137.44, -4.66])
    ap.add_argument('--res', type=float, default=10.0, help='resolución de salida en m')
    ap.add_argument('--src', default=URL, help='URL o ruta local del GeoTIFF')
    ap.add_argument('--out', default='ui/data/dem.js')
    a = ap.parse_args()
    lon0, lat0, lon1, lat1 = a.bbox
    path = a.src if os.path.exists(a.src) else '/vsicurl/' + a.src
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
               GDAL_HTTP_MULTIRANGE='YES', GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', VSI_CACHE='TRUE')
    rad = math.pi / 180
    tic = time.perf_counter()
    with rasterio.Env(**env), rasterio.open(path) as ds:
        x0, x1 = R_DEM * lon0 * rad, R_DEM * lon1 * rad
        y0, y1 = R_DEM * lat0 * rad, R_DEM * lat1 * rad
        win = from_bounds(x0, y0, x1, y1, ds.transform)
        nx, ny = max(2, round((x1 - x0) / a.res)), max(2, round((y1 - y0) / a.res))
        z = ds.read(1, window=win, out_shape=(ny, nx), resampling=Resampling.average,
                    boundless=False, masked=True).astype('float64')
    dt = time.perf_counter() - tic
    valid = ~np.ma.getmaskarray(z)
    zf = np.where(valid, z.filled(np.nan), np.nan)
    q = np.full(zf.shape, NODATA, np.uint16)
    q[valid] = np.clip(np.round((zf[valid] - OFFSET) / SCALE), 0, NODATA - 1).astype(np.uint16)

    # pendiente media (diagnóstico) con el tamaño real de celda
    dx = R_DEM * ((lon1 - lon0) / nx) * rad * math.cos((lat0 + lat1) / 2 * rad)
    dy = R_DEM * ((lat1 - lat0) / ny) * rad
    gy, gx = np.gradient(zf, dy, dx)
    sl = np.degrees(np.arctan(np.hypot(gx, gy)))

    out = dict(
        meta=dict(source='USGS Astrogeology · MSL Gale Merged DEM 1 m v3 (HiRISE stereo)', url=a.src,
                  res_m=a.res, resampling='average', datum='Mars 2000 esfera R=3396190 m (elev. respecto al areoide)',
                  bbox=[lon0, lat0, lon1, lat1], created=time.strftime('%Y-%m-%dT%H:%M:%S'),
                  read_seconds=round(dt, 1)),
        lon0=lon0, lat0=lat1, dlon=(lon1 - lon0) / nx, dlat=-(lat1 - lat0) / ny,   # origen = esquina NO, fila 0 = norte
        nx=int(nx), ny=int(ny), scale=SCALE, offset=OFFSET, nodata=NODATA,
        b64=base64.b64encode(q.astype('<u2').tobytes()).decode('ascii'),
    )
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    open(a.out, 'w', encoding='utf-8').write('window.DEM_DATA = ' + json.dumps(out) + ';\n')
    print(f'{nx}x{ny} celdas de {a.res:g} m en {dt:.1f} s | válidas {valid.mean()*100:.1f} % | '
          f'elev {np.nanmin(zf):.1f} .. {np.nanmax(zf):.1f} m | pendiente mediana {np.nanmedian(sl):.1f}°, '
          f'p95 {np.nanpercentile(sl, 95):.1f}° | {os.path.getsize(a.out)/1e6:.2f} MB -> {a.out}')

if __name__ == '__main__':
    main()
