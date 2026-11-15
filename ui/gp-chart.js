/* =========================================================
   Astertrail · GPChart: curva de temperatura del GP con bandas ±1σ / ±2σ.
   Datos: el JSON de export_gp.py (window.GP_DATA o fetch('data/gp.json')).
   Eje x = duración de la misión (mission.t0 -> mission.t1), en hora LTST.
   Requiere px-button.js (fuente pixel para los rótulos de los ejes).

   GPChart.draw(contenedor, datos, { height: 420 })
   ========================================================= */
(() => {
  const C = {
    grid: '#17365e', axis: '#2c5a8e', text: '#9fc8ea',
    band2: 'rgba(81,180,245,0.16)', band1: 'rgba(34,118,192,0.55)',
    line: '#51b4f5', hidden: '#f26306', obs: '#e8f4ff', mission: 'rgba(242,99,6,0.08)',
  };
  const LABEL_SCALE = 2;          // la fuente 5x7 a x2: legible y en cuadrícula

  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
    return 10 * p;
  }
  // texto pixel en el canvas, alineado a la cuadrícula del dispositivo
  function pxText(g, txt, x, y, color, align = 'left', s = LABEL_SCALE) {
    const m = window.PxButton.textMask(String(txt).toUpperCase());
    const w = m.w * s;
    let x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    const y0 = Math.round(y - (m.h * s) / 2);
    g.fillStyle = color;
    for (const [px, py] of m.px) g.fillRect(x0 + px * s, y0 + py * s, s, s);
  }
  const hhmm = (t) => {
    const h = ((t % 1) + 1) % 1 * 24;
    const H = Math.floor(h + 1e-6), M = Math.round((h - H) * 60);
    return String(H + (M === 60 ? 1 : 0)).padStart(2, '0') + ':' + String(M % 60).padStart(2, '0');
  };

  function draw(box, d, opt = {}) {
    box.innerHTML = '';
    if (!d || !d.pred || !d.pred.t || !d.pred.t.length) {
      box.innerHTML = '<div class="px-empty">SIN DATOS DEL GP — corre export_gp.py</div>'; return;
    }
    const cv = document.createElement('canvas'); box.appendChild(cv);
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const W = box.clientWidth, H = opt.height || 420;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const S = LABEL_SCALE;

    const P = d.pred, M = d.mission;
    const pad = { l: 70, r: 26, t: 34, b: 62 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const x0 = M.t0, x1 = M.t1;

    // dominio y: bandas de 95 %, ±2σ y puntos reales dentro de la misión
    const inside = (arr) => arr.t.map((t, i) => [t, arr.x[i]]).filter(([t]) => t >= x0 && t <= x1);
    const hid = d.hidden ? inside(d.hidden) : [], obs = d.obs ? inside(d.obs) : [];
    const ys = [];
    P.t.forEach((_, i) => { ys.push(P.mu[i] - 2 * P.sigma[i], P.mu[i] + 2 * P.sigma[i]); });
    hid.forEach(([, x]) => ys.push(x)); obs.forEach(([, x]) => ys.push(x));
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const yp = (y1 - y0) * 0.08 || 5; y0 -= yp; y1 += yp;
    const ystep = niceStep(y1 - y0, 6);
    y0 = Math.floor(y0 / ystep) * ystep; y1 = Math.ceil(y1 / ystep) * ystep;

    const X = (t) => pad.l + (t - x0) / (x1 - x0) * iw;
    const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * ih;

    // rejilla y eje y
    g.lineWidth = 1;
    for (let v = y0; v <= y1 + 1e-9; v += ystep) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = C.grid; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + iw, y); g.stroke();
      pxText(g, (Math.round(v * 10) / 10) + '', pad.l - 10, y, C.text, 'right');
    }
    pxText(g, 'T AIRE (K)', pad.l - 60, pad.t - 18, C.text, 'left', S);

    // eje x: horas LTST según la duración
    const hours = (x1 - x0) * 24;
    const stepH = hours <= 8 ? 1 : hours <= 24 ? 3 : hours <= 72 ? 6 : 12;
    const firstH = Math.ceil((x0 * 24) / stepH - 1e-9) * stepH;
    for (let hh = firstH; hh <= x1 * 24 + 1e-9; hh += stepH) {
      const t = hh / 24, x = Math.round(X(t)) + 0.5;
      g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + ih); g.stroke();
      // los rótulos de los extremos se alinean hacia dentro para no salirse del canvas
      const al = x - pad.l < 30 ? 'left' : pad.l + iw - x < 30 ? 'right' : 'center';
      const lx = al === 'left' ? pad.l : al === 'right' ? pad.l + iw : x;
      pxText(g, hhmm(t), lx, pad.t + ih + 18, C.text, al);
      if (Math.abs(t - Math.round(t)) < 1e-6 || hh === firstH)
        pxText(g, 'SOL ' + Math.floor(t + 1e-6), lx, pad.t + ih + 40, C.line, al);
    }
    // marco del área de datos
    g.strokeStyle = C.axis; g.lineWidth = 2;
    g.strokeRect(pad.l, pad.t, iw, ih);

    g.save(); g.beginPath(); g.rect(pad.l, pad.t, iw, ih); g.clip();
    // bandas: ±2σ debajo, ±1σ encima
    const band = (k, color) => {
      g.beginPath();
      P.t.forEach((t, i) => { const x = X(t), y = Y(P.mu[i] + k * P.sigma[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (let i = P.t.length - 1; i >= 0; i--) g.lineTo(X(P.t[i]), Y(P.mu[i] - k * P.sigma[i]));
      g.closePath(); g.fillStyle = color; g.fill();
    };
    band(2, C.band2); band(1, C.band1);
    // media
    g.beginPath(); g.lineWidth = 2; g.strokeStyle = C.line; g.lineJoin = 'round';
    P.t.forEach((t, i) => { const x = X(t), y = Y(P.mu[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    // puntos: observados (si el GP los vio) y reales ocultos (validación)
    const dots = (pts, color) => pts.forEach(([t, v]) => {
      g.fillStyle = '#041734'; g.fillRect(Math.round(X(t)) - 3, Math.round(Y(v)) - 3, 6, 6);
      g.fillStyle = color;     g.fillRect(Math.round(X(t)) - 2, Math.round(Y(v)) - 2, 4, 4);
    });
    dots(obs, C.obs); dots(hid, C.hidden);
    g.restore();

    return { hidden: hid.length, obs: obs.length };
  }

  window.GPChart = { draw, COLORS: C };
})();
