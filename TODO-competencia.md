# ASTERTRAIL · TODO de competencia v2 (≈4 h 40 → MVP definitivo)

> Archivo para Claude Code. Reloj: inicio 09:50 · **HITO MVP 13:00** · **congelar código 13:30** · entrega 14:30.
> Regla de oro: **funcionalidad y datos reales primero**. Todo número en pantalla dice de dónde sale (REMS, DEM USGS, Mars Trek) o lleva la etiqueta "ESTIMADO" si es del modelo de energía.

## Protocolo de trabajo
1. Una iteración a la vez: decir cuál, objetivo y archivos.
2. Timebox estricto (10–30 min). A mitad de tiempo, si no sale, parar y proponer recorte.
3. Leer cada archivo entero antes de editarlo. Cambios mínimos.
4. Al cerrar: diff resumido + comando de prueba + pregunta de checkpoint. Esperar OK de Alan.
5. Marcar `[x]` y añadir línea a la Bitácora.
6. No tocar: arquitectura de VARnet, `train.py`, el spline, la verificación TLS (`truststore`).
7. Sin backend en vivo: la UI lee `ui/data/*.js` + teselas Mars Trek. Abre con doble clic.
8. Lógica separada de la vista: energía en `ui/sim.js` (puro, probable con `node`).
9. "RECORTA" → siguiente P0 sin discutir.

## Decisiones ya tomadas (no reabrir)
- Temperatura: color SOBRE LA RUTA + perfil de la ruta. NO mapa de calor de la zona (REMS es una estación).
- Imagen: WMTS Mars Trek `https://trek.nasa.gov/tiles/Mars/EQ/{CAPA}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`.
- Elevación: DEM MSL Gale Merged 1 m (USGS) `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` (solo ventana). Respaldo HRSC 30 m (Zenodo 5808354) o MOLA.
- Leaflet en `ui/vendor/` (no CDN). Distancias geodésicas, R Marte 3389.5 km.
- ~~Menú: GEOTOPOLÓGICO deshabilitado~~ → **Cambio (Alan): TÉRMICO y GEOTOPOLÓGICO son pestañas de una sola `mapa.html`** (`#termico` / `#geo`). GEOTOPOLÓGICO crece por iteraciones (DEM → elevación, pendiente, perfil).

## BLOQUE A · Datos reales listos (09:50 – 10:55)
- [x] A1 · Humo y datos de temperatura — P0 · 10 min
- [x] A2 · Mapa base Mars Trek en Leaflet — P0 · 25 min
- [x] A3 · Elevación real de la zona — P0 · 30 min ⚠️

## BLOQUE B · Herramienta funcional (10:55 – 13:00) — MVP
- [ ] B1 · Menú (`ui/index.html`) — P0 · 15 min
- [x] B2 · Migrar `mapa.html` a Leaflet con coordenadas reales — P0 · 30 min (+ pestañas TÉRMICO/GEOTOPOLÓGICO en una sola interfaz)
- [x] B3 · Motor de energía (`ui/sim.js`) — P0 · 30 min
- [x] B4 · Perfil de la ruta — P0 · 20 min (+ pronóstico 3 sols, plan de salida, mejor salida)
- [ ] B5 · Vista del astronauta + velocidad de simulación — P0 · 20 min
- [ ] B6 · Veredicto de la misión — P0 · 10 min
> 🔒 HITO MVP (13:00): copiar `ui/` a `ui_mvp_backup/`.

## BLOQUE C · Convencer (13:00 – 13:30)
- [ ] C1 · Validación en `datos.html` — P1
- [ ] C2 · Pulido para proyector — P1
- [ ] C3 · Extras — P2

## BLOQUE D · Congelar y entregar (13:30 – 14:30)
- [ ] D1 · Ensayo técnico (Wi-Fi apagado, localStorage limpio)
- [ ] D2 · Respaldo (capturas, video, zip, LEEME.md)
- [ ] D3 · Guion de 3 min
- [ ] D4 · Holgura

## Decisiones de Alan (después de B2)
- TÉRMICO: el color sobre la ruta no aporta → la lectura pasa a una **gráfica** (T vs hora con el paso del astronauta). El mapa queda para la ruta.
- El tiempo de misión sale de la física: v = min(v_crucero, η·P/F), F = m·g·(Crr·cosθ + sinθ); θ > θ_max → intransitable. **T_real = Ct × Σ Δt, Ct = 1.3**.
- Vehículo: LRV 2 personas (REFERENCIA, VERIFICAR). "Momento correcto" = hora de salida que mejor cumple temperatura + batería.

## BLOQUE E · TRACE YOUR ROUTE! (extensión gamificada, spec v2.0 de Alan)
> Página independiente `ui/trace.html`, a la que se entra con un botón **TRACE YOUR ROUTE!** desde `mapa.html`. Solo **lee** datos del mapa (Mars Trek, DEM, GP) y no modifica nada. Sus rutas viven en su propia clave de `localStorage`.
> Reutiliza lo hecho: `layers.js` + `dem.js` + `data/*.js` = Map Data Adapter · `sim.js` = Rover Simulator.

| módulo spec | archivo | estado |
|---|---|---|
| A Mission Manager | `ui/modules/trace/missions.js` | **hecho** (1 misión) |
| B Map Data Adapter | `layers.js`, `dem.js`, `data/dem.js`, `data/gp-data.js` (solo lectura) | **existe** |
| C Route Planner | en `trace.html` | **hecho** |
| D Terrain Analyzer | `ui/modules/trace/terrain.js` | **hecho** |
| E Route Evaluator | `ui/modules/trace/rss.js` + `rss.test.js` | **hecho** |
| F Rover Simulator | `sim.js` (+ regla de misión: detenerse en intransitable) | **existe** |
| G Results Manager | informe en `trace.html`: RSS + clase, estado, métricas, peores tramos, objetivos, recomendaciones, comparación de intentos | **hecho** |
| H Gamification Manager | `gamification.js`: 6 medallas, mejor marca, récord, últimos 8 intentos (localStorage propio) | **hecho** |

**Decisiones de Alan (Trace):**
- **Astertrail** = equipo · **Marswalk** = app (nombre provisional): renderizador de mapas **por módulos**, cada mapa con sus propios datos, para sumar mapas a futuro (POO cuando se cierre el MVP). **Trace = otro módulo de Marswalk** → carpeta `ui/modules/trace/`.
- Vehículo: el **LRV** de `sim.js` (consistencia). Hora de salida = la "hora actual" del mapa (el botón la pasa por URL: `?t0=`).
- Misión **ida y vuelta**. **Batería fundamental** (condición de misión). Ruta inválida (intransitable, batería < reserva, sin volver) → no deja lanzar / "MISIÓN FALLIDA" con la razón.
- RSS: S = p90 de la pendiente del tramo; intransitable con el máximo; T = peor caso del tramo; rugosidad del DEM 10 m ("escala 10–30 m"); crítico (Pᵢ<25) limita RSS ≤ 49; dato desconocido = riesgo 100.
- Misión: **Find the Water Signs** (arcillas del monte Sharp). Gamificación local: medallas, mejor marca, comparación de intentos (`localStorage` propio de Trace).
- Textos en español en un archivo de idioma (`ui/modules/trace/i18n/es.js`) → cambiar de idioma después = otro archivo.
- Futuro: módulos separados para batería y curvas (sacar de `sim.js`), clases (POO), catálogo de mapas.

- [x] E1 · `rss.js` + `terrain.js` + pruebas (normalizaciones, penalizaciones) — 25 min
- [x] E2 · `missions.js` + `trace.html` (planificar, advertencias previas, ejecutar, informe) — 40 min
- [x] E3 · botón de acceso en `mapa.html` + gamificación (mejor marca, reintento) — 15 min
- Nota: la spec recibida se corta en "Módulo G … Identificar segmentos problem" (faltan el resto de G y H).

## Lista de recortes (en orden)
1. C3 · 2. `cache_tiles.py` · 3. x300 y alertas de curva · 4. DEM → HRSC 30 m / MOLA · 5. `regen = 0`
Nunca recortar: A1, A2, B1, B2, B3, B6, D1, D2.

## Bitácora
| hora | iteración | quedó | recortado / notas |
|---|---|---|---|
| A1 | humo + GP | `export_gp.py --sol 1520 --ltst 9 --hours 6` OK (REMS real, 500 pts, 1.2 s, T 234.9–256.0 K, σ media 2.64 K, 197 ocultos). `datos.html` sin errores. Fuente Jersey 10 local en `ui/fonts/`. | Único error de consola: `mapa.jpg` no existe en `mapa.html` (se elimina en B2). El script vive en `scripts/`: correr con `PYTHONPATH=src/model_marte`. |
| A2 | Leaflet + Mars Trek | Leaflet 1.9.4 en `ui/vendor/leaflet/`. `ui/layers.js`: IMAGEN = CTX Gale (z12, ~10 m) + HiRISE Curiosity encima (z16, ~0.6 m); RELIEVE = MOLA+HRSC sombreado color (z8). Rejilla EQ = `L.CRS.EPSG4326` con R de Marte (escala en m reales). `scripts/cache_tiles.py` bajó 1113 teselas (50 MB) a `ui/tiles/`; `?offline=1` probado sin red. | Hubo que crear el entorno de red `astertrail` (trek.nasa.gov, planetarymaps.usgs.gov, astrogeology.usgs.gov, zenodo.org). HiRISE solo cubre 137.12–137.73 E, 4.25–4.93 S: la ruta demo debe quedar dentro. |
| B2 | mapa unificado | `mapa.html` sobre Leaflet + Mars Trek, ruta en [lat,lon] (clave `astertrail.ruta.geo`), distancias geodésicas, PLAY/barra/MÍN/bandas conservados. Pestañas TÉRMICO (ruta por temperatura) y GEOTOPOLÓGICO (ruta neutra, relieve MOLA semitransparente con opacidad, panel de terreno). `BASE: IMAGEN/RELIEVE`. `_tiles.html` eliminado. | Elevación/pendiente en GEO quedan "PRÓXIMAMENTE" hasta A3. Ruta demo 3.53 km dentro de HiRISE; se reajusta con el DEM. Pendiente: etiquetas del eje X de la gráfica GP se encimen en el panel estrecho (B4). |
| A3 | DEM real | `scripts/export_dem.py` lee por /vsicurl/ el DEM USGS 1 m (overviews) → `ui/data/dem.js` 711×711 a 10 m (137.32–137.44 E, 4.66–4.78 S), Uint16 0.1 m, 1.35 MB. `ui/dem.js` puro: `elev`, `slope`, `covers`. Elev −4481…−3520 m, pendiente mediana 6.3°. Conectado al panel GEOTOPOLÓGICO (elev/pend. del astronauta y del cursor, desnivel +352/−31 m). | Lectura tardó ~4 min por red (solo una vez). En tu PC: `uv run --with rasterio python scripts/export_dem.py`. |
| B3 | motor `sim.js` | Puro, 7 pruebas OK (`node ui/sim.test.js`): llano, subida 10°, curva cerrada, Ct, intransitable, frío, momento correcto. Ruta demo real: 3.52 km, 55 min conducción → **71 min con Ct 1.3**, v media 3.9 km/h (real 3.0), 1028 Wh (292 Wh/km), SOC final 88 %, +345 m, θmax 21.9° → GO. `scanDepartures` prueba salidas cada 30 min. | La ruta demo original cruzaba un escarpe real de 31.5° (20 m) → NO-GO: se movió el FIN 110 m (comentado en `mapa.html`, sirve para la demo). Falta GP de sol completo: hoy el pronóstico solo cubre 09–15 h y limita el escaneo de salidas. |
| B4 | gráficas + plan | GP de **3 sols** (1520–1522, 201–259 K, σ 3.3 K, 1752 min REMS ocultos): `export_gp.py --sol 1520 --ltst 0 --hours 72`. `ui/charts.js` (canvas pixel). TÉRMICO: ruta neutra + pronóstico 3 sols (franja de la travesía, tira GO/PREC/NO-GO por hora de salida cada 15 min, clic = salida) + panel PLAN DE SALIDA (sal/llegas, veredicto, ±15 min, MEJOR SALIDA, energía, batería, peor caso) + EN RUTA AHORA. Perfil (ambas pestañas): elevación, velocidad, batería, tramos >25° en rojo, cursor sincronizado. `sim.js`: elevación suavizada ±10 m. | Mejor salida hoy: sol 1520 14:15 → 15:24, GO, peor caso −21 °C. La ruta original sigue NO-GO (29°). |
| E1 | RSS + terreno | `ui/modules/trace/`: `terrain.js` (rugosidad = RMS sobre plano 5×5 celdas; calibrada con la región: p50 0.31 m, p95 1.23 m), `rss.js` (S/G/T/A, pesos 35/30/20/15, ponderado por distancia, crítico → RSS ≤ 49, intransitable invalida, desconocido = 100, configurable), `i18n/es.js`. 8 pruebas OK. Ruta demo real: RSS 49 PELIGROSA (tramo 5 crítico: 17.5° p90 + terreno áspero al pie del monte Sharp); ruta con escarpe: inválida. | `sim.js` y el mapa no se tocaron. |
| E2 | pantalla Trace | `ui/modules/trace/trace.html` + `missions.js` (misión FIND THE WATER SIGNS: base, objetivo radio 150 m, ida y vuelta, reserva 20 %, salida = `?t0=` o sol 1520 09:00). Trazar/arrastrar/insertar (clic en tramo)/borrar (doble clic)/repetir waypoint (clic), VOLVER A BASE. Tramos coloreados por P, tabla S/G/T/A/P, avisos, LANZAR bloqueado si la ruta es inválida/incompleta. Rover con x60/x300/x1000, SEGUIR, HUD, para si la batería cae bajo la reserva. Informe: MISIÓN CUMPLIDA/FALLIDA, RSS, métricas, objetivos, recomendaciones. Probado: directa inválida (25.9°), rodeo RSS 86 → cumplida. | Bug corregido en `sim.js` (compartido): pendiente falsa de 83° cuando un vértice caía a mm de la rejilla; las 15 pruebas pasan y `mapa.html` sigue igual. `layers.js`: ruta base para teselas offline desde subcarpetas. |
| E3 | acceso + juego | Botón TRACE YOUR ROUTE! en `mapa.html` (pasa `?t0=` = hora de salida actual). `gamification.js`: medallas (EXPLORADOR, RUTA SEGURA, IMPECABLE, AHORRO, SIN SUSTOS, A LA PRIMERA), mejor marca, ¡NUEVO RÉCORD!, tabla de intentos; panel PROGRESO. Probado: mapa → Trace (salida 14:15) → 2 intentos (RSS 94 → 95, récord) → volver; la ruta del mapa queda intacta y Trace solo escribe `marswalk.trace.v1`. | Salir a las 14:15 sube el RSS de 86 a 94 en la misma ruta (menos riesgo térmico): buen punto para la demo. |
