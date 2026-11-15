/* Astertrail · paradas científicas (puntos de interés) cerca de Curiosity hacia el sol 1520 (nov 2016, cráter Gale).
 *
 * lat/lon: planetocéntricas, longitud este. APROXIMADAS (±100–200 m): tomadas de la literatura de MSL, NO
 * verificadas contra el archivo oficial de waypoints (mars.nasa.gov no era accesible al crear este archivo). VERIFICAR.
 * stop_min: tiempo de parada estimado (ESTIMADO, escenario de EVA tripulada; no es un dato de misión).
 * foto: ruta relativa a ui/ (p. ej. 'poi/murray-buttes.jpg') o null si aún no se descargó. Ver ui/poi/README.md.
 * El simulador (sim.js) suma stop_min a la duración cuando la ruta pasa a ≤ radio m del punto.
 */
(function () {
  const POI = [
    {
      id: 'murray-buttes', corto: 'MURRAY BUTTES', nombre: 'Murray Buttes · perforación Quela',
      lat: -4.6970, lon: 137.3590, radio: 150, precision: 'aprox. ±200 m',
      objetivo: 'Lutitas lacustres de la formación Murray (base del monte Sharp): un lago antiguo, de larga duración y habitable.',
      medir: 'Muestra de lutita finamente laminada (mineralogía de arcillas y hematita, como hizo CheMin en Quela, sol 1464). Fotografiar la laminación a escala milimétrica; química de vetas de sulfato de calcio.',
      stop_min: 45,
      fuente: 'Rampe et al. 2020, Geochemistry 80, 125605 (revisión de 6 años de Curiosity) · Bristow et al. 2018, Science Advances 4, eaar3330',
      foto: null, fotoCredito: 'NASA/JPL-Caltech/MSSS', fotoSugerida: 'Mastcam, sols 1454–1466 (mesas de Murray Buttes y sitio Quela)',
    },
    {
      id: 'contacto-murray-stimson', corto: 'CONTACTO MURRAY/STIMSON', nombre: 'Contacto Murray / Stimson (discordancia)',
      lat: -4.7005, lon: 137.3612, radio: 150, precision: 'aprox. ±200 m',
      objetivo: 'Discordancia erosiva entre las lutitas de lago (Murray) y la arenisca eólica que las cubre (Stimson): el paso de un Marte con lagos a un Marte seco con dunas.',
      medir: 'Rumbo y buzamiento de la superficie de contacto; espesor y dirección de la estratificación cruzada en la arenisca; una muestra a cada lado del contacto; halos de alteración (sílice) en fracturas.',
      stop_min: 30,
      fuente: 'Banham et al. 2018, Sedimentology 65, 993–1042 · Watkins et al. 2022, JGR Planets 127, e2022JE007293',
      foto: null, fotoCredito: 'NASA/JPL-Caltech/MSSS', fotoSugerida: 'Mastcam, sols 1419–1455 (mesas con capa de arenisca Stimson sobre Murray)',
    },
    {
      id: 'arcillas-sharp', corto: 'ARCILLAS · GLEN TORRIDON', nombre: 'Unidad de arcillas del monte Sharp (Glen Torridon)',
      lat: -4.7300, lon: 137.3840, radio: 150, precision: 'aprox. ±200 m',
      objetivo: 'Unidad rica en esmectitas vista desde órbita (CRISM), razón principal para elegir Gale: las arcillas se forman con agua y conservan bien la materia orgánica.',
      medir: 'Muestra de la roca más arcillosa disponible (difracción de rayos X para el tipo de esmectita); búsqueda de orgánicos; registro de la transición hacia las capas de sulfatos ladera arriba.',
      stop_min: 45,
      fuente: 'Milliken et al. 2010, GRL 37, L04201 · Bennett et al. 2023, JGR Planets 128, e2022JE007185 (campaña Glen Torridon, sols 2300–3072)',
      foto: null, fotoCredito: 'NASA/JPL-Caltech/MSSS', fotoSugerida: 'Mastcam, sols 2300–2500 (Glen Torridon; Curiosity llegó aquí en 2019, después del sol 1520)',
    },
    {
      id: 'objetivo-mision', corto: 'OBJETIVO DE LA MISIÓN', nombre: 'Objetivo de la misión · minerales hidratados',
      lat: -4.7200, lon: 137.3850, radio: 150, precision: 'ubicación ILUSTRATIVA (misión FIND THE WATER SIGNS)',
      objetivo: 'Zona objetivo de la misión de Trace: minerales que solo se forman con agua en las capas bajas del monte Sharp (zona de la cresta Vera Rubin, rica en hematita).',
      medir: 'Tomar la muestra de la misión; identificar hematita frente a arcillas (color, textura, dureza); documentar el afloramiento antes y después del muestreo.',
      stop_min: 30,
      fuente: 'Escenario educativo de Marswalk (ui/modules/trace/missions.js) · contexto: Fraeman et al. 2020, JGR Planets 125, e2020JE006527',
      foto: null, fotoCredito: 'NASA/JPL-Caltech/MSSS', fotoSugerida: 'Mastcam, sols 1800–2300 (cresta Vera Rubin)',
    },
  ];
  // Formato que espera SIM.simulate({ stops })
  const stops = () => POI.map((p) => ({ id: p.id, nombre: p.corto, lat: p.lat, lon: p.lon, radio: p.radio, stop_s: p.stop_min * 60 }));
  const API = { list: POI, stops, get: (id) => POI.find((p) => p.id === id) };
  if (typeof module !== 'undefined') module.exports = API; else window.POI_DATA = API;
})();
