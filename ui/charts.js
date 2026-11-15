/* Astertrail · AstChart: gráficas pixel en canvas (paneles apilados con eje x compartido).
 *
 *   const c = AstChart.draw(canvas, { x0, x1, xTicks: [{v, label}], panes: [pane, ...], cursor, spans });
 *   pane = { h: 0.6, left: {min, max, label, ticks?, fmt?}, right: {...},
 *            areas: [{axis, xs, lo, hi | base, color}], lines: [{axis, xs, ys, color, width, dash}],
 *            dots: [{axis, xs, ys, color, size}], hlines: [{axis, y, color, label}],
 *            strips: [{a, b, color}] (franja inferior), spans: [{a, b, color}] (sombra vertical) }
 *   c.xAt(clientX) -> valor x bajo el ratón (o null)
 * Rótulos con la fuente 5x7 de px-button.js (PxButton.textMask).
 */
(() => {
  const C = { grid: '#17365e', axis: '#2c5a8e', text: '#9fc8ea', cursor: '#f26306', bg: 'rgba(4,23,52,.0)' };
  const PAD = { l: 58, r: 52, t: 10, b: 26, gap: 14 };

  function niceTicks(min, max, n = 4) {
    const raw = (max - min) / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    let st = p; for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) { st = m * p; break; }
    const out = []; for (let v = Math.ceil(min / st) * st; v <= max + 1e-9; v += st) out.push(+v.toFixed(6));
    return out;
  }
  function pxText(g, txt, x, y, color, align = 'left', s = 2) {
    const m = window.PxButton.textMask(String(txt).toUpperCase()), w = m.w * s;
    const x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x), y0 = Math.round(y - (m.h * s) / 2);
    g.fillStyle = color; for (const [px, py] of m.px) g.fillRect(x0 + px * s, y0 + py * s, s, s);
  }

  function draw(cv, spec) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    const L = PAD.l, R = W - PAD.r, pw = R - L, { x0, x1 } = spec;
    const X = (v) => L + (v - x0) / (x1 - x0 || 1) * pw;
    const panes = spec.panes, hs = panes.reduce((a, p) => a + (p.h || 1), 0);
    let top = PAD.t; const usable = H - PAD.t - PAD.b - PAD.gap * (panes.length - 1);
    const rects = [];
    for (const p of panes) {
      const ph = usable * (p.h || 1) / hs, r = { top, bot: top + ph }; rects.push(r); top += ph + PAD.gap;
      const Y = {};
      for (const side of ['left', 'right']) {
        const a = p[side]; if (!a) continue;
        Y[side] = (v) => r.bot - (v - a.min) / (a.max - a.min || 1) * (r.bot - r.top);
      }
      const ys = (axis) => Y[axis || 'left'];
      // fondo + rejilla
      g.fillStyle = 'rgba(4,23,52,.55)'; g.fillRect(L, r.top, pw, r.bot - r.top);
      (p.spans || []).concat(spec.spans || []).forEach((s) => { g.fillStyle = s.color; g.fillRect(X(s.a), r.top, X(s.b) - X(s.a), r.bot - r.top); });
      g.strokeStyle = C.grid; g.lineWidth = 1;
      const lt = p.left ? (p.left.ticks || niceTicks(p.left.min, p.left.max, p.left.n || 3)) : [];
      lt.forEach((v) => { const y = Math.round(Y.left(v)) + .5; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
        pxText(g, p.left.fmt ? p.left.fmt(v) : v, L - 6, y, p.left.color || C.text, 'right'); });
      if (p.right) (p.right.ticks || niceTicks(p.right.min, p.right.max, p.right.n || 3)).forEach((v) =>
        pxText(g, p.right.fmt ? p.right.fmt(v) : v, R + 6, Y.right(v), p.right.color || C.text, 'left'));
      (spec.xTicks || []).forEach((t) => { const x = Math.round(X(t.v)) + .5; g.beginPath(); g.moveTo(x, r.top); g.lineTo(x, r.bot); g.stroke(); });
      // áreas, líneas horizontales, líneas, puntos
      (p.areas || []).forEach((a) => {
        const Yf = ys(a.axis); g.fillStyle = a.color; g.beginPath();
        a.xs.forEach((x, i) => { const y = Yf(a.hi ? a.hi[i] : a.ys[i]); i ? g.lineTo(X(x), y) : g.moveTo(X(x), y); });
        for (let i = a.xs.length - 1; i >= 0; i--) g.lineTo(X(a.xs[i]), a.lo ? Yf(a.lo[i]) : r.bot);
        g.closePath(); g.fill();
      });
      (p.hlines || []).forEach((h) => { const y = Math.round(ys(h.axis)(h.y)) + .5; if (y < r.top || y > r.bot) return;
        g.strokeStyle = h.color; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.setLineDash([]);
        if (h.label) pxText(g, h.label, L + 4, y - 7, h.color, 'left'); });
      (p.lines || []).forEach((l) => {
        const Yf = ys(l.axis); g.strokeStyle = l.color; g.lineWidth = l.width || 2; g.setLineDash(l.dash || []);
        g.beginPath(); let pen = false;
        l.xs.forEach((x, i) => { const v = l.ys[i]; if (v == null) { pen = false; return; } const px = X(x), py = Yf(v); pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true; });
        g.stroke(); g.setLineDash([]);
      });
      (p.dots || []).forEach((d) => { const Yf = ys(d.axis), s = d.size || 3; g.fillStyle = d.color;
        d.xs.forEach((x, i) => { if (x < x0 || x > x1) return; g.fillRect(Math.round(X(x) - s / 2), Math.round(Yf(d.ys[i]) - s / 2), s, s); }); });
      (p.strips || []).forEach((s) => { g.fillStyle = s.color; g.fillRect(X(s.a), r.bot - 6, Math.max(1, X(s.b) - X(s.a)), 6); });
      g.strokeStyle = C.axis; g.lineWidth = 2; g.strokeRect(L, r.top, pw, r.bot - r.top);
      if (p.left && p.left.label) pxText(g, p.left.label, L + 6, r.top + 9, p.left.color || C.text);
      if (p.right && p.right.label) pxText(g, p.right.label, R - 6, r.top + 9, p.right.color || C.text, 'right');
    }
    const yb = rects[rects.length - 1].bot;
    (spec.xTicks || []).forEach((t) => pxText(g, t.label, X(t.v), yb + 13, C.text, 'center'));
    if (spec.cursor != null && spec.cursor >= x0 && spec.cursor <= x1) {
      g.fillStyle = C.cursor; g.fillRect(Math.round(X(spec.cursor)) - 1, PAD.t, 2, yb - PAD.t);
    }
    return {
      xAt: (clientX) => { const b = cv.getBoundingClientRect(), px = clientX - b.left; if (px < L || px > R) return null; return x0 + (px - L) / pw * (x1 - x0); },
    };
  }
  window.AstChart = { draw, niceTicks };
})();
