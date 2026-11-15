/* Marswalk · módulo TRACE YOUR ROUTE! (clase; se monta sobre el mapa único de la app).
 *
 *   const mod = new TraceModule({ map, L, layers: AST_LAYERS, dem, gp, t0: () => hora_salida_actual });
 *   mod.activate()   -> crea su DOM, sus capas y sus eventos sobre el mapa compartido
 *   mod.deactivate() -> los retira (el mapa y los otros módulos quedan como estaban)
 *
 * Reglas de la spec: solo LEE los datos compartidos (DEM, GP, capas); su ruta, resultados y progreso
 * viven en su propio estado (localStorage 'marswalk.trace.v1'). Lógica pura en terrain.js, rss.js,
 * missions.js, gamification.js; motor del rover: sim.js (compartido, sin modificarlo).
 * OPTIMIZAR RUTA: A* sobre el DEM (route-opt.js, puro) con base y objetivo de la misión, ida y vuelta.
 */
(function () {
  const STORE = 'marswalk.trace.v1', SPEEDS = [60, 300, 1000], SOL_S = 88775.244;
  const colP = (P) => P >= 75 ? '#4fd27a' : P >= 50 ? '#f2c206' : P >= 25 ? '#f26306' : '#ff3b1f';
  const colRSS = (v) => v >= 90 ? '#4fd27a' : v >= 75 ? '#9be36b' : v >= 50 ? '#f2c206' : v >= 25 ? '#f26306' : '#ff3b1f';
  const fmtKm = (m) => m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
  const fmtMin = (s) => s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')} min`;
  const hhmm = (t) => { const m = Math.round((((t % 1) + 1) % 1) * 1440); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const fmtC = (k) => (k - 273.15 >= 0 ? '+' : '') + (k - 273.15).toFixed(0) + ' °C';
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };

  const HTML = `
  <div class="tbar">
    <div class="brand"><b data-t="titulo">TRACE YOUR ROUTE!</b><i data-t="lema">Plan. Navigate. Discover.</i></div>
    <button class="px-btn" data-size="sm" data-variant="danger" id="tr-edit">LISTO</button>
    <button class="px-btn" data-size="sm" id="tr-undo">DESHACER</button>
    <button class="px-btn" data-size="sm" id="tr-close">VOLVER A BASE</button>
    <button class="px-btn" data-size="sm" id="tr-clear">BORRAR</button>
    <button class="px-btn" data-size="sm" id="tr-fit">CENTRAR</button>
    <button class="px-btn" data-size="sm" id="tr-opt">OPTIMIZAR RUTA</button>
    <span class="hint" id="tr-hint" hidden></span>
  </div>
  <aside>
    <section class="px-panel acc">
      <div class="px-panel__head"><span id="tr-mName" style="font-size:28px;color:#f26306">MISIÓN</span></div>
      <p class="txt" id="tr-mBrief"></p><div class="obj" id="tr-mObj"></div><p class="note" id="tr-mSrc"></p>
    </section>
    <section class="px-panel acc rss-sec">
      <div class="px-panel__head"><span class="px-label" data-size="sm" data-color="#e8f4ff">ROUTE SAFETY SCORE</span></div>
      <div class="rss"><span class="n" id="tr-rssN">--</span><span class="c" id="tr-rssC">--</span></div>
      <div id="tr-msgs"></div>
      <div id="tr-optBox"></div>
      <div class="btns"><button class="px-btn" data-size="md" data-variant="danger" id="tr-launch">LANZAR ROVER</button></div>
      <div class="row"><span class="k">distancia</span><b id="tr-eDist">--</b></div>
      <div class="row"><span class="k">duración estimada</span><b id="tr-eDur">--</b></div>
      <div class="row"><span class="k">batería al volver</span><b id="tr-eSoc">--</b></div>
      <details><summary>VER TRAMOS (S · G · T · A · P)</summary>
      <table class="segs" id="tr-segs"></table>
      <p class="note">Riesgo por tramo (0–100): S pendiente ·35 %, G rugosidad ·30 %, T temperatura ·20 %, A accesibilidad ·15 %. P = 100 − R. Un tramo con P &lt; 25 limita el RSS a 49. El RSS es un índice del simulador, no una probabilidad real.</p></details>
    </section>
    <section class="px-panel acc collapsed">
      <div class="px-panel__head"><span class="px-label" data-size="xs" data-color="#e8f4ff">PROGRESO Y MEDALLAS</span></div>
      <div class="row"><span class="k">mejor RSS (misión cumplida)</span><b id="tr-gBest">--</b></div>
      <div class="row"><span class="k">intentos</span><b id="tr-gN">0</b></div>
      <div class="medals" id="tr-gMed"></div>
    </section>
    <section class="px-panel acc collapsed">
      <div class="px-panel__head"><span class="px-label" data-size="xs" data-color="#e8f4ff">CÓMO JUGAR</span></div>
      <p class="txt"><b style="color:#f26306;font-weight:normal">LISTO/TRAZAR</b>: clic en el mapa añade waypoints desde la base; arrastra para mover; doble clic borra; clic en un tramo inserta; clic en un waypoint vuelve a pasar por él. <b style="color:#f26306;font-weight:normal">VOLVER A BASE</b> cierra la ruta.</p>
      <p class="txt">Tramos coloreados por seguridad (P): verde seguro, naranja precaución, rojo peligroso o intransitable.</p>
    </section>
  </aside>
  <div class="timebar">
    <button class="px-btn" data-size="sm" id="tr-pause" hidden>PAUSA</button>
    <button class="px-btn" data-size="sm" id="tr-speed">x300</button>
    <button class="px-btn" data-size="sm" id="tr-follow">SEGUIR</button>
    <div class="hud" id="tr-hud"><span><em>listo para planificar</em></span></div>
    <div class="bar" title="batería"><i id="tr-socBar"></i></div>
  </div>
  <div class="modal" id="tr-modal" hidden>
    <section class="px-panel">
      <h2 id="tr-rTitle">--</h2>
      <div class="rss"><span class="n" id="tr-rRss">--</span><span class="c" id="tr-rCls">--</span></div>
      <div class="grid2" id="tr-rRows"></div>
      <div class="obj" id="tr-rObj" style="margin-top:8px"></div>
      <div id="tr-rRec" style="margin-top:8px"></div>
      <div id="tr-rGame" style="margin-top:8px"></div>
      <div class="btns"><button class="px-btn" data-size="md" data-variant="danger" id="tr-again">REPLANIFICAR</button>
        <button class="px-btn" data-size="md" id="tr-toMap">SALIR A MAPA TÉRMICO</button></div>
    </section>
  </div>`;

  class TraceModule {
    constructor(o) {
      Object.assign(this, o);                     // map, L, layers, dem, gp, t0(), onExit()
      this.id = 'trace'; this.label = 'TRACE YOUR ROUTE!';
      this.M = TraceMissions.get(null); this.T = TraceI18n.t;
      this.root = null; this.sim = null; this.ev = null; this.chk = null;
      this.editing = true; this.running = null; this.speedI = 1; this.follow = false;
    }
    $(id) { return this.root.querySelector('#tr-' + id); }
    saveRoute() { try { const s = loadState(); s.rutas = s.rutas || {}; s.rutas[this.M.id] = this.route; localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }

    activate() {
      const { L, map, M } = this;
      if (!this.ter && this.dem) this.ter = TraceTerrain.create(this.dem);
      this.t0v = this.t0 ? this.t0() : M.t0;
      this.route = (loadState().rutas || {})[M.id] || [M.inicio.slice()];
      // DOM propio
      this.root = document.createElement('div'); this.root.id = 'mod-trace'; this.root.innerHTML = HTML;
      document.body.appendChild(this.root);
      this.root.querySelectorAll('[data-t]').forEach((e) => { e.textContent = this.T(e.dataset.t); });
      // capas propias
      const icon = this.icon = (cls, html = '') => L.divIcon({ className: 'pw', iconSize: [0, 0], html: `<div class="pin ${cls}">${html}</div>` });
      this.fixed = L.layerGroup([
        L.circle(M.objetivo.pos, { radius: M.objetivo.radio, color: '#4fd27a', weight: 3, dashArray: '8 6', fillColor: '#4fd27a', fillOpacity: 0.12, interactive: false }),
        L.marker(M.objetivo.pos, { icon: icon('tag trgoal', 'OBJETIVO'), interactive: false }),
        L.circle(M.inicio, { radius: M.radioVuelta, color: '#f26306', weight: 2, dashArray: '4 6', fill: false, interactive: false }),
        L.marker(M.inicio, { icon: icon('trbase'), interactive: false }),
        L.marker(M.inicio, { icon: icon('tag', 'BASE'), interactive: false }),
      ]).addTo(map);
      this.segLayer = L.layerGroup().addTo(map); this.wpLayer = L.layerGroup().addTo(map); this.runLayer = L.layerGroup().addTo(map);
      this.optLayer = L.layerGroup().addTo(map); this.opt = null;
      this.rover = L.marker(M.inicio, { icon: icon('trrover'), interactive: false, zIndexOffset: 2000 });
      // eventos
      this.onClick = (e) => { if (!this.editing || this.running) return; this.route.push([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); this.changed(); };
      map.on('click', this.onClick); map.doubleClickZoom.disable();
      const $ = (id) => this.$(id);
      $('edit').onclick = () => { if (this.running) return; this.editing = !this.editing; this.relabel($('edit'), this.editing ? 'LISTO' : 'TRAZAR'); this.drawRoute(); this.panel(); };
      $('undo').onclick = () => { if (this.running || this.route.length < 2) return; this.route.pop(); this.changed(); };
      $('close').onclick = () => { if (this.running || this.route.length < 2) return; if (TraceMissions.dist(this.route[this.route.length - 1], M.inicio) > 1) this.route.push(M.inicio.slice()); this.changed(); };
      $('clear').onclick = () => { if (this.running) return; this.route = [M.inicio.slice()]; this.runLayer.clearLayers(); this.rover.remove(); this.changed(); };
      $('fit').onclick = () => this.fit();
      $('launch').onclick = () => this.launch();
      $('opt').onclick = () => this.optimize();
      $('pause').onclick = () => { if (!this.running) return; this.running.paused = !this.running.paused; this.relabel($('pause'), this.running.paused ? 'SEGUIR SIM' : 'PAUSA'); };
      $('speed').onclick = () => { this.speedI = (this.speedI + 1) % SPEEDS.length; this.relabel($('speed'), 'x' + SPEEDS[this.speedI]); };
      $('follow').onclick = () => { this.follow = !this.follow; this.relabel($('follow'), this.follow ? 'VISTA GENERAL' : 'SEGUIR'); if (this.follow) map.setZoom(16); else this.fit(); };
      $('again').onclick = () => { $('modal').hidden = true; this.runLayer.clearLayers(); this.rover.remove(); this.editing = true; this.relabel($('edit'), 'LISTO'); this.drawRoute(); this.panel(); };
      $('toMap').onclick = () => { $('modal').hidden = true; this.onExit && this.onExit(); };
      if (window.PxButton) PxButton.renderAll(this.root);
      this.root.querySelectorAll('section.acc > .px-panel__head').forEach((h) => { h.onclick = () => h.parentElement.classList.toggle('collapsed'); });
      this.changed(); this.fit();
    }
    deactivate() {
      if (!this.root) return;
      this.running = null; this.map.off('click', this.onClick); this.map.doubleClickZoom.enable();
      [this.fixed, this.segLayer, this.wpLayer, this.runLayer, this.optLayer, this.rover].forEach((l) => l && this.map.removeLayer(l));
      document.getElementById('map').classList.remove('tredit');
      this.root.remove(); this.root = null;
    }
    relabel(b, t) { b.dataset.label = t; b.textContent = t; PxButton.render(b); }
    fit() { const tb = this.root ? this.root.querySelector('.tbar') : null, top = tb ? tb.getBoundingClientRect().bottom + 30 : 170;
      this.map.fitBounds(this.L.latLngBounds(this.route.concat([this.M.objetivo.pos])), { paddingTopLeft: [40, top], paddingBottomRight: [470, 110] }); }

    evaluate() {
      this.sim = this.route.length > 1 ? SIM.simulate({ route: this.route, dem: this.dem, gp: this.gp, t0: this.t0v, vehicle: { soc_min: this.M.soc_min } }) : null;
      this.ev = this.sim && this.ter ? TraceRSS.evaluate({ route: this.route, sim: this.sim, terrain: this.ter }) : null;
      this.chk = TraceMissions.check(this.M, this.route, this.sim, this.ev);
    }
    // Ruta óptima (A* sobre el DEM, costo = tiempo con la física de sim.js + rugosidad): base -> objetivo -> base
    optimize() {
      if (this.running || !window.RouteOpt || !this.dem) return;
      const { M, L } = this, box = this.$('optBox');
      const args = { sim: SIM, dem: this.dem, terrain: this.ter, from: M.inicio, to: M.objetivo.pos, goalRadius: M.objetivo.radio * 0.5, vehicle: { soc_min: M.soc_min } };
      if (this.optRes) args.res = this.optRes;
      const r = RouteOpt.roundTrip(args);
      this.optLayer.clearLayers(); this.opt = null;
      if (!r) { box.innerHTML = '<div class="msg">OPTIMIZAR: no hay ruta transitable entre la base y el objetivo.</div>'; return; }
      if (r.ms > 3000) this.optRes = 20;            // demasiado lento en esta máquina: la próxima vez, rejilla de 20 m
      const sim = SIM.simulate({ route: r.route, dem: this.dem, gp: this.gp, t0: this.t0v, vehicle: { soc_min: M.soc_min } });
      const ev = this.ter ? TraceRSS.evaluate({ route: r.route, sim, terrain: this.ter }) : null;
      this.opt = { route: r.route, sim, ev, ms: r.ms, res: r.res };
      L.polyline(r.route, { color: '#041734', weight: 9, interactive: false }).addTo(this.optLayer);
      L.polyline(r.route, { color: '#51e0ff', weight: 4, dashArray: '10 8', interactive: false }).addTo(this.optLayer);
      L.marker(r.route[Math.floor(r.ida.route.length / 2)], { icon: this.icon('tag', 'ÓPTIMA'), interactive: false }).addTo(this.optLayer);
      this.optPanel();
    }
    optPanel() {                                    // "tu ruta: RSS A · óptima: RSS B, Δ min" (se recalcula si cambias tu ruta)
      const box = this.$('optBox'), o = this.opt; if (!box) return; if (!o) { box.innerHTML = ''; return; }
      const mine = this.ev && this.chk && !this.chk.bloqueos.length ? this.sim.summary : null, S = o.sim.summary;
      const dMin = mine ? (S.dur_s - mine.dur_s) / 60 : null;
      box.innerHTML = `<div class="msg ok">tu ruta: ${this.ev ? 'RSS ' + this.ev.rss + (mine ? '' : ' (no válida)') : 'sin trazar'} · óptima: RSS ${o.ev ? o.ev.rss : '--'}` +
        `${dMin == null ? '' : `, ${dMin <= 0 ? '−' : '+'}${Math.abs(dMin).toFixed(0)} min`}<br>` +
        `Óptima: ${fmtKm(S.dist_m)} · ${fmtMin(S.dur_s)} · batería ${(S.SOC_end * 100).toFixed(0)} % · pend. máx ${S.theta_max_ruta.toFixed(0)}°. ` +
        `A* sobre el DEM USGS (rejilla ${o.res} m, ${o.ms.toFixed(0)} ms): minimiza el tiempo del rover, evita > ${o.sim.vehicle.theta_max}° y penaliza la rugosidad.</div>` +
        `<div class="btns"><button class="px-btn" data-size="sm" id="tr-useOpt">USAR ÓPTIMA</button></div>`;
      const b = this.$('useOpt'); if (window.PxButton) PxButton.render(b);
      b.onclick = () => { if (this.running || !this.opt) return; this.route = this.opt.route.map((p) => p.slice()); this.optLayer.clearLayers(); this.changed(); };
    }
    changed() { this.saveRoute(); this.evaluate(); this.drawRoute(); this.panel(); this.progressPanel(); this.optPanel(); }
    drawRoute() {
      const { L, route, ev } = this; this.segLayer.clearLayers(); this.wpLayer.clearLayers();
      document.getElementById('map').classList.toggle('tredit', this.editing && !this.running);
      if (route.length > 1) {
        L.polyline(route, { color: '#041734', weight: 12, interactive: false }).addTo(this.segLayer);
        for (let k = 0; k < route.length - 1; k++) {
          const s = ev && ev.segs.find((x) => x.i === k + 1), c = s ? colP(s.intransitable ? 0 : s.P) : '#e8f4ff';
          const pl = L.polyline([route[k], route[k + 1]], { color: c, weight: 7, dashArray: s && s.intransitable ? '6 6' : null }).addTo(this.segLayer);
          pl.on('click', (e) => { if (!this.editing || this.running) return; L.DomEvent.stop(e); route.splice(k + 1, 0, [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); this.changed(); });
          if (s) L.marker([(route[k][0] + route[k + 1][0]) / 2, (route[k][1] + route[k + 1][1]) / 2], { icon: this.icon('tag trseg', `${k + 1}`), interactive: false }).addTo(this.segLayer);
        }
      }
      route.forEach((q, i) => {
        if (i === 0) return;
        const m = L.marker(q, { icon: this.icon('trwp', `<span>${i}</span>`), draggable: this.editing && !this.running }).addTo(this.wpLayer);
        m.on('dragend', () => { const p = m.getLatLng(); route[i] = [+p.lat.toFixed(6), +p.lng.toFixed(6)]; this.changed(); });
        m.on('dblclick', (e) => { L.DomEvent.stop(e); clearTimeout(m._t); if (this.running) return; route.splice(i, 1); this.changed(); });
        m.on('click', (e) => { L.DomEvent.stop(e); if (!this.editing || this.running || i === route.length - 1) return; clearTimeout(m._t); m._t = setTimeout(() => { route.push(route[i].slice()); this.changed(); }, 260); });
      });
    }
    medalsHtml(med, nuevas) { return TraceGame.MEDALLAS.map((m) => `<span class="medal ${med[m.id] ? 'on' : ''} ${nuevas && nuevas.includes(m) ? 'new' : ''}" title="${m.desc}">${m.nombre}</span>`).join(''); }
    progressPanel() {
      const g = TraceGame.progress(loadState(), this.M.id);
      this.$('gBest').textContent = g.mejor ? `${g.mejor.rss} · ${g.mejor.clase}` : '--';
      this.$('gN').textContent = g.total || 0; this.$('gMed').innerHTML = this.medalsHtml(g.medallas);
    }
    panel() {
      const { M, T, ev, sim, chk } = this, $ = (id) => this.$(id);
      $('mName').textContent = 'MISIÓN · ' + M.nombre; $('mBrief').textContent = M.briefing;
      $('mObj').innerHTML = chk.objetivos.map((o) => `<div><span class="${o.ok ? 'ok' : 'no'}">${o.ok ? '[✓]' : '[ ]'}</span> ${o.txt}</div>`).join('');
      $('mSrc').textContent = `${M.fuente} Salida: sol ${Math.floor(this.t0v)} · ${hhmm(this.t0v)} LTST (hora actual del mapa térmico).`;
      const msgs = [];
      if (ev) {
        $('rssN').textContent = ev.rss; $('rssC').textContent = ev.clase; $('rssC').style.background = colRSS(ev.rss);
        chk.bloqueos.filter((b) => b.k !== 'vacia' && b.k !== 'inicio').forEach((b) => msgs.push(`<div class="msg">${T(b.k, b)}</div>`));
        chk.fallos.forEach((b) => msgs.push(`<div class="msg">${T(b.k, b)}</div>`));
        ev.criticos.filter((s) => !s.intransitable).forEach((s) => msgs.push(`<div class="msg warn">Tramo ${s.i} CRÍTICO (P ${s.P.toFixed(0)}): domina ${T('f_' + s.dominante)}.</div>`));
        if (ev.unknown) msgs.push(`<div class="msg warn">${ev.unknown} tramo(s) con datos faltantes: cuentan como riesgo alto.</div>`);
        if (!msgs.length) msgs.push(`<div class="msg ok">Ruta lista. ${chk.ok ? 'Cumple todos los objetivos.' : ''}</div>`);
        $('eDist').textContent = fmtKm(sim.summary.dist_m);
        $('eDur').textContent = `${fmtMin(sim.summary.dur_s)} (Ct ${sim.summary.Ct}) · vuelta ${hhmm(sim.summary.t1)}`;
        $('eSoc').textContent = `${(sim.summary.SOC_end * 100).toFixed(0)} %`;
        $('segs').innerHTML = '<tr><th>tramo</th><th>m</th><th>S</th><th>G</th><th>T</th><th>A</th><th>P</th></tr>' +
          ev.segs.map((s) => `<tr class="${s.critico ? 'crit' : ''}"><td><span class="sw" style="background:${colP(s.intransitable ? 0 : s.P)}"></span>${s.i}${s.intransitable ? ' ✕' : ''}</td><td>${s.d.toFixed(0)}</td><td>${s.S.toFixed(0)}</td><td>${s.G.toFixed(0)}</td><td>${s.T.toFixed(0)}</td><td>${s.A.toFixed(0)}</td><td>${s.P.toFixed(0)}</td></tr>`).join('');
      } else {
        $('rssN').textContent = '--'; $('rssC').textContent = 'SIN RUTA'; $('rssC').style.background = '#9fc8ea';
        msgs.push(`<div class="msg warn">Haz clic en el mapa para añadir waypoints desde la BASE.</div>`);
        ['eDist', 'eDur', 'eSoc'].forEach((id) => { $(id).textContent = '--'; }); $('segs').innerHTML = '';
      }
      $('msgs').innerHTML = msgs.join('');
      $('launch').disabled = !ev || chk.bloqueos.length > 0 || !!this.running;
      $('hint').textContent = this.running ? 'SIMULANDO…' : this.editing ? 'TRAZANDO: clic = waypoint · arrastra · doble clic borra' : '';
    }

    sampleAt(t) {
      const s = this.sim.s; let lo = 0, hi = s.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t <= t) lo = m; else hi = m; }
      const v = Math.max(0, Math.min(1, (t - s[lo].t) / (s[hi].t - s[lo].t || 1))), a = s[lo], b = s[hi];
      const I = (k) => a[k] == null || b[k] == null ? (a[k] ?? b[k]) : a[k] + (b[k] - a[k]) * v;
      return { lat: I('lat'), lon: I('lon'), dist: I('dist'), v: I('v'), theta: I('theta'), Tlo: I('Tlo'), SOC: I('SOC'), E: I('E'), t };
    }
    launch() {
      if (this.$('launch').disabled) return;
      const { M, sim, L } = this; this.editing = false; this.relabel(this.$('edit'), 'TRAZAR');
      const S = sim.summary, trail = L.polyline([], { color: '#f26306', weight: 4, interactive: false }).addTo(this.runLayer);
      this.rover.setLatLng(M.inicio).addTo(this.map);
      const goalT = sim.s.find((p) => TraceMissions.dist([p.lat, p.lon], M.objetivo.pos) <= M.objetivo.radio);
      const failAt = sim.s.find((p) => p.SOC < M.soc_min);
      this.running = { t: S.t0, last: performance.now(), paused: false, trail, goalT: goalT && goalT.t, reached: false, failAt, tEnd: failAt ? failAt.t : S.t1 };
      this.$('pause').hidden = false; PxButton.render(this.$('pause'));
      this.drawRoute(); this.panel();
      const step = (now) => {
        const r = this.running; if (!r || !this.root) return;
        const dt = (now - r.last) / 1000; r.last = now;
        if (!r.paused) r.t = Math.min(r.tEnd, r.t + dt * SPEEDS[this.speedI] / SOL_S);
        const q = this.sampleAt(r.t), pos = [q.lat, q.lon];
        this.rover.setLatLng(pos); r.trail.addLatLng(pos);
        if (this.follow) this.map.panTo(pos, { animate: false });
        if (r.goalT && r.t >= r.goalT && !r.reached) { r.reached = true; L.marker(M.objetivo.pos, { icon: this.icon('tag trgoal', 'MUESTRA TOMADA ✓'), interactive: false }).addTo(this.runLayer); }
        let acc = 0, seg = null; for (const s of this.ev.segs) { acc += s.d; if (q.dist <= acc + 1e-6) { seg = s; break; } }
        this.$('hud').innerHTML = `<span><em>tramo</em> ${seg ? seg.i : '-'}</span><span><em>t</em> ${fmtMin((r.t - S.t0) * SOL_S)}</span><span><em>dist</em> ${fmtKm(q.dist)}</span>` +
          `<span><em>v</em> ${(q.v * 3.6).toFixed(1)} km/h</span><span><em>pend.</em> ${(q.theta * 180 / Math.PI).toFixed(0)}°</span>` +
          `<span><em>T peor</em> ${q.Tlo != null ? fmtC(q.Tlo) : '--'}</span><span><em>E</em> ${q.E.toFixed(0)} Wh</span><span><em>bat.</em> ${(q.SOC * 100).toFixed(0)} %</span>`;
        const bar = this.$('socBar'); bar.style.width = `${Math.max(0, q.SOC * 100)}%`;
        bar.style.background = q.SOC < M.soc_min ? '#ff3b1f' : q.SOC < M.soc_min + 0.15 ? '#f26306' : '#4fd27a';
        if (r.t >= r.tEnd) return this.finish();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    finish() {
      const r = this.running; this.running = null; this.$('pause').hidden = true;
      const { M, T, sim, ev, chk } = this, $ = (id) => this.$(id), S = sim.summary, ok = chk.ok && !r.failAt;
      const recs = [];
      if (r.failAt) recs.push(T('rec_bat', { soc: Math.round(S.SOC_end * 100), min: Math.round(M.soc_min * 100) }));
      ev.peores.filter((s) => s.R >= 25).forEach((s) => recs.push(T('rec_' + s.dominante, { i: s.i, th: (s.theta_p90 || 0).toFixed(0), t: s.Tlo_min != null ? fmtC(s.Tlo_min) : '--', o: Math.round(s.obst * 100) })));
      if (!recs.length) recs.push(T('rec_ok'));
      $('rTitle').textContent = ok ? T('exito') : T('fallo'); $('rTitle').style.color = ok ? '#4fd27a' : '#ff3b1f';
      $('rRss').textContent = ev.rss; $('rCls').textContent = ev.clase; $('rCls').style.background = colRSS(ev.rss);
      const dEnd = r.failAt ? r.failAt.dist : S.dist_m, tEnd = (r.tEnd - S.t0) * SOL_S;
      const rows = [['distancia recorrida', fmtKm(dEnd) + (r.failAt ? ` de ${fmtKm(S.dist_m)}` : '')], ['tiempo', fmtMin(tEnd)],
        ['energía (ESTIMADO)', `${(r.failAt ? r.failAt.E : S.E_Wh).toFixed(0)} Wh`], ['batería final', `${((r.failAt ? r.failAt.SOC : S.SOC_end) * 100).toFixed(0)} %`],
        ['velocidad media', `${S.v_media_real_kmh.toFixed(1)} km/h`], ['peor caso térmico', S.Tlo_min != null ? fmtC(S.Tlo_min) : '--'],
        ['pendiente máx.', `${S.theta_max_ruta.toFixed(1)}°`], ['tramos críticos', `${ev.criticos.length}`]];
      $('rRows').innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><b>${v}</b></div>`).join('');
      const objs = chk.objetivos.map((o) => Object.assign({}, o, { ok: o.ok && !(r.failAt && (o.id === 'bat' || o.id === 'vuelta')) }));
      $('rObj').innerHTML = '<div class="k">OBJETIVOS</div>' + objs.map((o) => `<div><span class="${o.ok ? 'ok' : 'no'}">${o.ok ? '[✓]' : '[✕]'}</span> ${o.txt}</div>`).join('');
      $('rRec').innerHTML = '<div class="k">RECOMENDACIONES</div>' + recs.map((x) => `<div class="msg warn">${x}</div>`).join('') +
        (ev.peores.length ? `<p class="note">Tramos de mayor riesgo: ${ev.peores.map((s) => `${s.i} (R ${s.R.toFixed(0)})`).join(' · ')}</p>` : '');
      const g = TraceGame.record(loadState(), M.id, { ok, rss: ev.rss, clase: ev.clase, dist_m: dEnd, dur_s: tEnd,
        soc: r.failAt ? r.failAt.SOC : S.SOC_end, criticos: ev.criticos.length, n_wp: this.route.length });
      try { localStorage.setItem(STORE, JSON.stringify(g.estado)); } catch (e) {}
      const prev = g.intentos.length > 1 ? Math.max(...g.intentos.slice(0, -1).filter((x) => x.ok).map((x) => x.rss), -1) : -1;
      $('rGame').innerHTML = `<div class="k">MEDALLAS ${g.nuevas.length ? `· ¡${g.nuevas.length} NUEVA${g.nuevas.length > 1 ? 'S' : ''}!` : ''}</div><div class="medals">${this.medalsHtml(g.medallas, g.nuevas)}</div>` +
        (g.record ? `<div class="msg ok">¡NUEVO RÉCORD! Superaste tu mejor RSS (${prev}).</div>` : '') +
        `<div class="k" style="margin-top:6px">COMPARACIÓN DE INTENTOS</div><table class="segs"><tr><th>#</th><th>estado</th><th>RSS</th><th>km</th><th>tiempo</th><th>bat.</th><th>críticos</th></tr>` +
        g.intentos.slice().reverse().map((x, j) => `<tr style="${j === 0 ? 'color:#e8f4ff' : ''}"><td>${x.n}${j === 0 ? ' ◀' : ''}</td><td>${x.ok ? 'OK' : 'FALLO'}</td><td style="color:${colRSS(x.rss)}">${x.rss}</td><td>${(x.dist_m / 1000).toFixed(2)}</td><td>${fmtMin(x.dur_s)}</td><td>${Math.round(x.soc * 100)}%</td><td>${x.criticos}</td></tr>`).join('') + '</table>' +
        (g.mejor ? `<p class="note">Mejor marca: RSS ${g.mejor.rss} (${g.mejor.clase}), intento ${g.mejor.n}.</p>` : '');
      this.progressPanel();
      $('modal').hidden = false; this.root.querySelectorAll('#tr-modal .px-btn').forEach((b) => PxButton.render(b));
      this.panel();
    }
  }
  window.TraceModule = TraceModule;
})();
