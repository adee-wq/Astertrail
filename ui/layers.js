/* Astertrail · capas de Mars Trek (WMTS, NASA/JPL) para Leaflet.
 *
 * Verificado leyendo .../{CAPA}/1.0.0/WMTSCapabilities.xml (2026-11-15):
 *   - Proyección EQ (IAU2000:104905, simple cilíndrica). TileMatrixSet 'default028mm', estilo 'default'.
 *   - z0 = 2×1 teselas de 256 px, origen (-180, 90)  ->  coincide con L.CRS.EPSG4326.
 *   - Plantilla: https://trek.nasa.gov/tiles/Mars/EQ/{CAPA}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}
 *
 * Offline: con ?offline=1 en la URL las teselas se leen de ui/tiles/{CAPA}/{z}/{y}/{x}.{ext}
 * (las baja cache_tiles.py, que usa estas mismas capas).
 */
(function () {
  const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/';
  const R_MARS = 3389500;   // m, radio medio de Marte

  const LAYERS = {
    // Imagen: HiRISE (MRO) zona de Curiosity, ~0.6 m/px en z16. Cobertura pequeña.
    hirise: { id: 'curiosity_hirise_mosaic', ext: 'png', maxNative: 16,
              bounds: [[-4.9254743, 137.1224669], [-4.2489588, 137.7298129]],
              label: 'MRO HiRISE · Curiosity (Mars Trek)' },
    // Imagen de respaldo bajo HiRISE: CTX (MRO) cráter Gale, ~10 m/px en z12.
    ctx:    { id: 'Gale_CTX_BlockAdj_dd', ext: 'png', maxNative: 12,
              bounds: [[-6.5732988, 135.1842593], [-2.8077809, 139.2413012]],
              label: 'MRO CTX · Gale (Mars Trek)' },
    // Relieve: sombreado en color MOLA + HRSC, ~200 m/px en z8. Global.
    relieve:{ id: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', ext: 'jpg', maxNative: 8,
              bounds: [[-4.8779, 137.1973], [-4.5703, 137.5488]],   // recortado a la misma zona que IMAGEN
              label: 'MGS MOLA + MEX HRSC, sombreado color (Mars Trek)' },
  };

  const OFFLINE = /[?&]offline=1\b/.test(location.search);
  // carpeta de este script: permite usar las capas desde páginas en subcarpetas (p. ej. modules/trace/)
  const BASE = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src.replace(/layers\.js(\?.*)?$/, '') : '';
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function url(key) {
    const c = LAYERS[key];
    return OFFLINE ? `${BASE}tiles/${c.id}/{z}/{y}/{x}.${c.ext}`
                   : `${TREK}${c.id}/1.0.0/default/default028mm/{z}/{y}/{x}.${c.ext}`;
  }

  function tile(L, key, extra) {
    const c = LAYERS[key];
    const lyr = L.tileLayer(url(key), Object.assign({
      maxNativeZoom: c.maxNative, maxZoom: 19, minZoom: 3,
      bounds: L.latLngBounds(c.bounds), noWrap: true,
      errorTileUrl: BLANK, attribution: c.label,
    }, extra || {}));
    // Si Mars Trek no responde (sin internet o red que lo bloquea), cada tesela cae a la copia local de ui/tiles.
    if (!OFFLINE) lyr.on('tileerror', (e) => {
      const t = e.tile, q = e.coords; if (!t || t.dataset.fb) return; t.dataset.fb = '1';
      t.src = `${BASE}tiles/${c.id}/${q.z}/${q.y}/${q.x}.${c.ext}`;
    });
    return lyr;
  }

  // CRS de Marte: misma rejilla que EPSG:4326 pero con el radio de Marte,
  // así map.distance() y la barra de escala dan metros marcianos.
  function crs(L) { return L.extend({}, L.CRS.EPSG4326, { R: R_MARS }); }

  // Bases listas para L.control.layers: imagen (CTX + HiRISE encima) y relieve.
  function bases(L) {
    return {
      'IMAGEN · HiRISE/CTX': L.layerGroup([tile(L, 'ctx'), tile(L, 'hirise')]),
      'RELIEVE · MOLA/HRSC': tile(L, 'relieve'),
    };
  }

  // Distancia geodésica (haversine) en m sobre Marte. Sin Leaflet, usable en node.
  function dist(a, b) {
    const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R_MARS * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  const API = {
    LAYERS, OFFLINE, R_MARS, TREK, url, tile, crs, bases, dist,
    // Zona de Curiosity hacia el sol 1520 (Murray Buttes, nov 2016), aprox.
    CENTER: [-4.72, 137.37], ZOOM: 14,
    // límites de navegación = zona de las teselas offline (no se puede alejar ni arrastrar fuera de la imagen)
    BOUNDS: [[-4.8779, 137.1973], [-4.5703, 137.5488]], MIN_ZOOM: 12,   // = zona cacheada en ui/tiles (z12)
    CREDITS: 'Imagen: NASA/JPL/UArizona (HiRISE), NASA/JPL/MSSS (CTX), vía NASA Mars Trek · Relieve: MOLA/HRSC',
  };
  if (typeof module !== 'undefined') module.exports = API; else window.AST_LAYERS = API;
})();
