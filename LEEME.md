# Marswalk · Astertrail — MVP

Planificador de salidas (EVA) en el cráter Gale, Marte, hacia el sol 1520 de Curiosity: cuándo salir, por dónde ir,
cuánto dura, cuánta batería queda, qué frío hará en el peor caso y dónde parar a hacer ciencia.

## Abrirlo (sin instalar nada, sin internet)

1. Descomprime la carpeta.
2. Abre `ui/index.html` en Edge o Chrome (doble clic). Intro → **ENTRAR A MARSWALK**.
   - Directo al mapa, forzando teselas locales: `ui/mapa.html?offline=1`
   - Con internet usa las teselas de NASA Mars Trek y, si fallan, cae a las locales (`ui/tiles/`).

Si algo falla en JavaScript aparece un recuadro rojo con la línea (`ui/errbox.js`).

## Qué hay en cada pestaña

| Pestaña | Qué hace |
|---|---|
| **TÉRMICO** | Ruta coloreada por la temperatura del aire (peor caso 95 %) a la hora de paso. Veredicto GO / PRECAUCIÓN / NO-GO, mejor hora de salida, batería, radiación. |
| **GEOTOPOLÓGICO** | Relieve, pendiente con signo, tramos intransitables (> 25°), perfil de elevación. |
| **TRACE YOUR ROUTE!** | Misión jugable: traza la ruta ida y vuelta, Route Safety Score, **OPTIMIZAR RUTA** (A* sobre el DEM), lanza el rover. |
| **DATOS** | De dónde sale la temperatura: REMS + proceso gaussiano, validación. |

En TÉRMICO, GEOTOPOLÓGICO y TRACE hay **paradas científicas** (rombos amarillos). Clic → ficha con objetivo científico,
qué medir, tiempo de parada, fuente y una foto real de Curiosity del sitio. Si la ruta pasa a ≤ 150 m, el tiempo de
parada se suma a la duración (y gasta calefacción y auxiliares). **PASAR POR AQUÍ** mete la parada en la ruta.

## Qué es dato real y qué es estimado

| Real | Fuente |
|---|---|
| Elevación y pendiente | USGS Astrogeology, DEM MSL Gale 1 m (HiRISE estéreo), remuestreado a 10 m |
| Imagen y relieve del mapa | MRO HiRISE / CTX, MOLA + HRSC, vía NASA Mars Trek |
| Temperatura del aire | MSL REMS (NASA/JPL-Caltech, CAB) + proceso gaussiano, sols 1520–1522 |
| Posición de las paradas | Waypoints oficiales de Curiosity (mars.nasa.gov, MSL_waypoints.json) |
| Fotos de las paradas | Imágenes crudas de MSL: Navcam (NASA/JPL-Caltech), Mastcam (NASA/JPL-Caltech/MSSS). IDs en `ui/poi/README.md` |
| Dosis de radiación | 0.67 mSv/día, MSL RAD (Hassler et al. 2014, Science 343) |

| Estimado / ilustrativo | Nota |
|---|---|
| Vehículo | Referencia: rover lunar Apollo (LRV) con 2 astronautas; eficiencia, rodadura y térmica son estimaciones |
| Ct = 1.3 | Factor de tiempo real sobre el de conducción |
| Tiempos de parada (30–45 min) | Escenario de EVA tripulada, no dato de misión |
| Bandas térmicas | Ilustrativas |
| Objetivo de la misión de TRACE | Ubicación ilustrativa sobre terreno real |

## Pruebas

```
node ui/sim.test.js
node ui/route-opt.test.js
node ui/modules/trace/rss.test.js
```

## Regenerar los datos (opcional, necesita Python + uv e internet)

```
$env:PYTHONPATH="src/model_marte"; uv run python scripts/export_gp.py --sol 1520 --ltst 0 --hours 72
uv run --with rasterio python scripts/export_dem.py
uv run python scripts/cache_tiles.py
```

## Empaquetar

En PowerShell, desde la raíz del repo: `.\empaquetar.ps1` → crea `astertrail-mvp.zip` (carpeta `ui/`, este LEEME y `capturas/`).

Capturas de cada vista: carpeta `capturas/`.
