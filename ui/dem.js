/* Astertrail · DEM (puro, sin DOM): elevación y pendiente desde ui/data/dem.js.
 *   const dem = DEM.from(window.DEM_DATA);
 *   dem.elev(lat, lon)   -> m (bilineal) o null fuera del recorte / sin dato
 *   dem.slope(lat, lon)  -> grados, pendiente máxima del terreno (diferencias centrales)
 *   dem.covers(lat, lon) -> bool
 * Fuente: USGS MSL Gale Merged DEM 1 m v3, remuestreado (ver scripts/export_dem.py).
 */
(function () {
  const R_DEM = 3396190, RAD = Math.PI / 180;

  function decode(b64) {
    let bytes;
    if (typeof Buffer !== 'undefined') bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
    else { const s = atob(b64); bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); }
    return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);   // little-endian (x86/ARM)
  }

  function from(D) {
    const q = decode(D.b64), { nx, ny, lon0, lat0, dlon, dlat, scale, offset, nodata } = D;
    const z = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) z[i] = q[i] === nodata ? NaN : q[i] * scale + offset;
    // tamaño de celda en metros (centro del recorte)
    const latc = lat0 + dlat * ny / 2;
    const cx = R_DEM * Math.abs(dlon) * RAD * Math.cos(latc * RAD), cy = R_DEM * Math.abs(dlat) * RAD;

    // coordenadas de celda continuas: centro de la celda (0,0) en (0,0)
    const ij = (lat, lon) => [(lon - lon0) / dlon - 0.5, (lat - lat0) / dlat - 0.5];
    const at = (i, j) => z[j * nx + i];

    function elev(lat, lon) {
      let [x, y] = ij(lat, lon);
      if (!(x >= -0.5 && y >= -0.5 && x <= nx - 0.5 && y <= ny - 0.5)) return null;
      x = Math.min(Math.max(x, 0), nx - 1.000001); y = Math.min(Math.max(y, 0), ny - 1.000001);
      const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
      const e = at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v;
      return Number.isFinite(e) ? e : null;
    }
    function slope(lat, lon) {
      const hx = Math.abs(dlon), hy = Math.abs(dlat);
      const ex = [elev(lat, lon + hx), elev(lat, lon - hx)], ey = [elev(lat + hy, lon), elev(lat - hy, lon)];
      if (ex.includes(null) || ey.includes(null)) return null;
      const gx = (ex[0] - ex[1]) / (2 * cx), gy = (ey[0] - ey[1]) / (2 * cy);
      return Math.atan(Math.hypot(gx, gy)) / RAD;
    }
    const covers = (lat, lon) => elev(lat, lon) !== null;
    const bounds = [[lat0 + dlat * ny, lon0], [lat0, lon0 + dlon * nx]];   // [[S,W],[N,E]]
    return { elev, slope, covers, bounds, cell: [cx, cy], meta: D.meta, nx, ny };
  }

  const API = { from };
  if (typeof module !== 'undefined') module.exports = API; else window.DEM = API;
})();
