/* Marswalk · módulo DATOS / VALIDACIÓN (clase; se monta sobre la app, encima del mapa).
 *   new DatosModule({ gp }).activate() / .deactivate()
 * Muestra: pronóstico GP de 3 sols contra REMS real oculto (con su error calculado aquí mismo),
 * tabla de validación GP vs VARnet sobre REMS real (eval_real.py, 10 ventanas, sols 1500–1559) y créditos.
 */
(function () {
  // runs/varnet/eval_real.json (huecos del 10/20/40 %) + diag_real H5 (latencia)
  const VALID = [
    { hueco: '10 % (~0.8 sols)', gp: [3.21, 0.64, 0.91], vn: [8.72, 0.53, 0.84] },
    { hueco: '20 % (~2 sols)', gp: [3.23, 0.66, 0.90], vn: [8.37, 0.52, 0.87] },
    { hueco: '40 % (~4 sols)', gp: [3.90, 0.59, 0.87], vn: [10.55, 0.51, 0.82] },
  ];
  const ok = (v, lo, hi) => `<span style="color:${v >= lo && v <= hi ? '#4fd27a' : '#ff7a5c'}">${typeof v === 'number' ? v.toFixed(2) : v}</span>`;

  function liveError(gp) {          // error del pronóstico mostrado contra los REMS que el GP no vio
    const P = gp.pred, H = gp.hidden || { t: [] }; if (!H.t.length) return null;
    let se = 0, n = 0, c1 = 0, c2 = 0, j = 1;
    for (let i = 0; i < H.t.length; i++) {
      const t = H.t[i]; while (j < P.t.length - 1 && P.t[j] < t) j++;
      const u = Math.max(0, Math.min(1, (t - P.t[j - 1]) / (P.t[j] - P.t[j - 1] || 1)));
      const mu = P.mu[j - 1] + (P.mu[j] - P.mu[j - 1]) * u, sd = P.sigma[j - 1] + (P.sigma[j] - P.sigma[j - 1]) * u, e = H.x[i] - mu;
      se += e * e; n++; if (Math.abs(e) <= sd) c1++; if (Math.abs(e) <= 1.96 * sd) c2++;
    }
    return { rmse: Math.sqrt(se / n), cov1: c1 / n, cov2: c2 / n, n };
  }

  class DatosModule {
    constructor(o) { Object.assign(this, o); this.id = 'datos'; this.label = 'DATOS'; this.root = null; }
    activate() {
      const gp = this.gp, le = liveError(gp), m = gp.mission || {};
      this.root = document.createElement('div'); this.root.id = 'mod-datos';
      this.root.innerHTML = `
        <section class="px-panel dmain">
          <div class="px-panel__head"><span class="px-label" data-size="md" data-color="#e8f4ff">TEMPERATURA DEL AIRE · PRONÓSTICO GP</span>
            <div class="px-panel__meta">sol ${m.sol} · ${m.hours} h · GP con ${gp.meta.n_fit} puntos REMS · ajuste ${gp.meta.fit_seconds} s${gp.meta.mission_hidden ? ' · datos de la ventana OCULTOS al modelo' : ''}</div></div>
          <div class="px-chart" id="dm-chart"></div>
          <div class="px-legend">
            <span class="px-legend__item"><span class="px-swatch px-swatch--line" style="background:#51b4f5"></span><span class="px-label" data-size="xs" data-color="#9fc8ea">PREDICCIÓN GP</span></span>
            <span class="px-legend__item"><span class="px-swatch" style="background:rgba(34,118,192,.75)"></span><span class="px-label" data-size="xs" data-color="#9fc8ea">±1σ</span></span>
            <span class="px-legend__item"><span class="px-swatch" style="background:rgba(81,180,245,.28)"></span><span class="px-label" data-size="xs" data-color="#9fc8ea">±2σ (95 %)</span></span>
            <span class="px-legend__item"><span class="px-swatch px-swatch--dot" style="background:#f26306"></span><span class="px-label" data-size="xs" data-color="#9fc8ea">REMS REAL (OCULTO AL GP)</span></span>
          </div>
        </section>
        <aside><section class="px-panel">
          <div class="px-panel__head"><span class="px-label" data-size="sm" data-color="#e8f4ff">VALIDACIÓN CON REMS REAL</span></div>
          ${le ? `<p class="txt">Este pronóstico contra los <b>${le.n}</b> minutos de REMS que el modelo <b>no vio</b>:</p>
          <div class="row"><span class="k">RMSE</span><b>${le.rmse.toFixed(2)} K</b></div>
          <div class="row"><span class="k">dentro de ±1σ / ±2σ</span><b>${(le.cov1 * 100).toFixed(0)} % / ${(le.cov2 * 100).toFixed(0)} %</b></div>` : ''}
          <p class="txt" style="margin-top:12px">Validación sistemática (10 ventanas, sols 1500–1559). Criterios: RMSE ≤ 6 K, cov1 0.55–0.85, cov2 0.85–0.99.</p>
          <table class="segs"><tr><th>hueco</th><th>GP RMSE</th><th>cov1/cov2</th><th>VARnet RMSE</th><th>cov1/cov2</th></tr>
          ${VALID.map((r) => `<tr><td>${r.hueco}</td><td>${ok(r.gp[0], 0, 6)}</td><td>${ok(r.gp[1], .55, .85)}/${ok(r.gp[2], .85, .99)}</td><td>${ok(r.vn[0], 0, 6)}</td><td>${ok(r.vn[1], .55, .85)}/${ok(r.vn[2], .85, .99)}</td></tr>`).join('')}
          </table>
          <div class="row" style="margin-top:8px"><span class="k">latencia por ventana</span><b>GP 1858 ms · VARnet 3.9 ms</b></div>
          <p class="msg ok">Conclusión: el <b>GP cumple</b> (3.2–3.9 K) y es el que usa Marswalk. VARnet no cumple en precisión (8.4–10.6 K) pero es ~475× más rápido; con σ × 1.4 queda calibrado (cov 0.66–0.70 / 0.97) → backend para consultas masivas del planificador.</p>
          <p class="note">Interpolación lineal 24–26 K y spline 120–330 K: líneas base que no sirven en huecos largos.</p>
        </section>
        <section class="px-panel"><div class="px-panel__head"><span class="px-label" data-size="xs" data-color="#e8f4ff">FUENTES DE DATOS</span></div>
          <p class="txt">Temperatura: <b>MSL REMS</b> (Curiosity), NASA/JPL-Caltech, Centro de Astrobiología (CAB), PDS MODRDR.</p>
          <p class="txt">Elevación: <b>MSL Gale Merged DEM 1 m</b>, USGS Astrogeology.</p>
          <p class="txt">Imagen: <b>NASA Mars Trek</b> (MRO HiRISE · UArizona, MRO CTX · MSSS), relieve MGS MOLA + MEX HRSC.</p>
          <p class="note">Vehículo de referencia: Apollo LRV (REFERENCIA, VERIFICAR). Energía: ESTIMADO.</p>
        </section></aside>`;
      document.body.appendChild(this.root);
      if (window.I18N) I18N.apply(this.root);
      const draw = () => { const r = GPChart.draw(this.root.querySelector('#dm-chart'), gp, { height: Math.max(300, Math.min(560, innerHeight - 260)) }); };
      draw(); this.onResize = () => { clearTimeout(this._t); this._t = setTimeout(draw, 120); }; addEventListener('resize', this.onResize);
      if (window.PxButton) PxButton.renderAll(this.root);
    }
    deactivate() { if (!this.root) return; removeEventListener('resize', this.onResize); this.root.remove(); this.root = null; }
  }
  window.DatosModule = DatosModule;
})();
