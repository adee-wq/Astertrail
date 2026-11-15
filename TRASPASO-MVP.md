# Traspaso · Marswalk MVP (competencia, entrega 14:00)

## Estado (rama `claude/nifty-cori-53nlyk`, último commit d9f98f0)
- `ui/index.html`: intro del equipo (Three.js, viaje Tierra → Marte) → menú MARSWALK.
- `ui/mapa.html` = **app única**, un mapa Leaflet, pestañas TÉRMICO · GEOTOPOLÓGICO · TRACE YOUR ROUTE! · DATOS.
  - Mapa limpio: tira de estado arriba + dock abajo (tiempo + apartados, uno a la vez; ✕/Esc cierra).
  - Módulos (clases `activate()`/`deactivate()`): `modules/trace/trace-module.js`, `modules/datos/datos-module.js`.
  - Lógica pura: `sim.js` (física LRV, Ct 1.3, energía), `dem.js`, `modules/trace/{rss,terrain,missions,gamification}.js`.
  - Datos: `data/gp-data.js` (GP 3 sols, sol 1520–1522), `data/dem.js` (DEM USGS 10 m), `tiles/` (offline).
- Pruebas: `node ui/sim.test.js` (7) · `node ui/modules/trace/rss.test.js` (8).
- Si Mars Trek falla, las teselas caen a `ui/tiles`. Errores JS salen en un recuadro rojo (`errbox.js`).

## Actualización (MVP definitivo)
- Fusionada `claude/marswalk-optimizar`: radiación (chip + PLAN) y OPTIMIZAR RUTA (A*, `ui/route-opt.js`) en Trace.
- Paradas científicas: `ui/data/poi.js` + fotos `ui/poi/`; marcadores y ficha en TÉRMICO/GEO/TRACE; `sim.js` suma el tiempo de parada (también en Trace y en la dosis).
- D2 hecho: `LEEME.md`, `capturas/`, `empaquetar.ps1` (crea `astertrail-mvp.zip`).
- Pruebas: sim 10 · route-opt 4 · rss 8. Navegador (http y file://, offline): sin errores JS; faltan algunas teselas HiRISE en los bordes de la caché (cae a CTX).

## Pendiente
1. **Confirmar en la PC de Alan** (Edge, Windows) que `ui/mapa.html` se ve: antes salía mapa negro y paneles vacíos (no reproducido aquí). Si hay recuadro rojo → corregir esa línea.
2. **D2**: `LEEME.md` (abrir `ui/index.html` o `ui/mapa.html?offline=1`; regenerar GP/DEM/teselas), capturas, `astertrail-mvp.zip`.
3. **D3**: guion de 3 min + 5 preguntas del jurado (por qué no mapa de calor; de dónde salen los parámetros del vehículo; GP vs VARnet; qué es el RSS; offline).
4. Opcional: B5 (seguir al astronauta / x60 en Térmico).

## Comandos
- GP: `$env:PYTHONPATH="src/model_marte"; uv run python scripts/export_gp.py --sol 1520 --ltst 0 --hours 72`
- DEM: `uv run --with rasterio python scripts/export_dem.py`
- Teselas: `uv run python scripts/cache_tiles.py`

Detalle histórico y decisiones: `TODO-competencia.md` (bitácora).
