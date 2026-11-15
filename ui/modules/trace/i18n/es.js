/* Marswalk · módulo Trace · textos en español.
 * Para otro idioma: copiar este archivo (p. ej. en.js), traducir los valores y cargarlo en lugar de este.
 * Las claves no se traducen. {x} se sustituye con TraceI18n.t('clave', { x: valor }).
 */
(function () {
  const ES = {
    titulo: 'TRACE YOUR ROUTE!',
    lema: 'Plan. Navigate. Discover.',
    volver: 'VOLVER AL MAPA',
    // factores del RSS
    f_S: 'pendiente', f_G: 'rugosidad', f_T: 'temperatura', f_A: 'accesibilidad',
    // recomendaciones por factor dominante
    rec_S: 'Tramo {i}: la cuesta domina el riesgo ({th}° en el 10 % más empinado). Añade un waypoint para rodearla o cruzarla en diagonal.',
    rec_G: 'Tramo {i}: terreno irregular. Busca una zona más lisa en la imagen (tonos uniformes, sin crestas).',
    rec_T: 'Tramo {i}: pasas con mucho frío (peor caso {t}). Acorta la ruta para pasar por ahí antes o en horas más templadas.',
    rec_A: 'Tramo {i}: {o} % del entorno tiene pendientes de más de 20°. Aléjate de los escarpes cercanos.',
    rec_bat: 'La batería llega al {soc} %: por debajo de la reserva del {min} %. Acorta la ruta o evita subidas.',
    rec_ok: 'Ruta equilibrada. Para mejorar el RSS, reduce los tramos con más pendiente.',
    // estados
    invalida_intrans: 'RUTA INVÁLIDA: el tramo {i} tiene {th}° (máximo del rover {max}°).',
    invalida_bat: 'RUTA INVÁLIDA: la batería llegaría al {soc} % (reserva mínima {min} %).',
    invalida_obj: 'RUTA INCOMPLETA: no pasa a menos de {r} m del objetivo.',
    invalida_vuelta: 'RUTA INCOMPLETA: debe terminar a menos de {r} m del punto de partida (ida y vuelta).',
    exito: 'MISIÓN CUMPLIDA',
    fallo: 'MISIÓN FALLIDA',
  };
  const API = {
    dict: ES,
    t(k, vars) { let s = (API.dict[k] ?? k); for (const v in (vars || {})) s = s.split('{' + v + '}').join(vars[v]); return s; },
  };
  if (typeof module !== 'undefined') module.exports = API; else window.TraceI18n = API;
})();
