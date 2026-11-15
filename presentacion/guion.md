# Guion del pitch · 4 minutos · 3 personas

Guion de 3:40 + **20 s de margen** = 4:00. Ritmo calmado (~2,2 palabras por segundo).
Abre `presentacion/index.html`: **N** muestra este guion en pantalla, **T** inicia el cronómetro (se pone ámbar si vas tarde en una diapositiva y rojo pasado 4:00).

| Quién | Diapositivas | Tiempo | Palabras |
|---|---|---|---|
| **Diseñadora 1** | 1, 2 | 0:55 | 124 |
| **Programador** | 3, 4, 5 | 2:00 | 228 |
| **Diseñadora 2** | 6, 7 | 0:45 | 97 |
| *Margen* | — | 0:20 | — |

---

## Diseñadora 1

### Diapositiva 1 · 0:00–0:20 (20 s · 47 palabras)

> «En la Tierra, si sales a caminar y hace frío, vuelves a casa. En Marte, si calculas mal el frío, la batería o la pendiente, no vuelves. Somos Astertrail y esto es Marswalk: le dice a un astronauta cuándo salir, por dónde ir y si podrá regresar.»

*→ Avanza sin pausa.*

### Diapositiva 2 · 0:20–0:55 (35 s · 77 palabras)

> «Una salida en Marte depende de cuatro riesgos a la vez. El frío: de madrugada, el cráter Gale baja a unos menos setenta y tres grados. El terreno: hay cuestas de más de veinticinco grados que el vehículo no puede subir. La batería: hay que volver con al menos un veinte por ciento. Y la Tierra está a entre cuatro y veinticuatro minutos por radio: la decisión se toma allí. Nuestro programador les cuenta cómo lo resolvimos.»

*→ RELEVO al programador (mirarlo al decir la última frase).*

---

## Programador

### Diapositiva 3 · 0:55–1:35 (40 s · 75 palabras)

> «Marswalk cruza siete fuentes de datos abiertos en un solo mapa. La imagen del terreno es HiRISE, a sesenta centímetros por píxel; el relieve, el modelo del USGS; la temperatura, la estación REMS de Curiosity. Y también usamos los waypoints oficiales del rover, sus fotos reales y su medidor de radiación. Datos de la NASA, la ESA y el CAB español. Y todo corre en el navegador, sin internet, porque en Marte no hay nube.»

*→ Señalar la tira de fotos al decir «fotos reales».*

### Diapositiva 4 · 1:35–2:15 (40 s · 85 palabras)

> «La clave es cómo decide. Pronosticamos la temperatura de 72 horas con un proceso gaussiano, un modelo que además dice cuánto se fía de sí mismo. Y decidimos con el peor caso, no con el promedio. ¿Funciona? Lo probamos contra datos reales que el modelo nunca vio: error medio de tres coma dos kelvin, y el noventa y cinco por ciento de los datos cae dentro de su margen. Una red neuronal era 475 veces más rápida, pero casi tres veces menos precisa: elegimos precisión.»

*→ Si vas tarde, salta la frase de la red neuronal.*

### Diapositiva 5 · 2:15–2:55 (40 s · 68 palabras)

> «Así se ve en la misión. La ruta recta cruza una cuesta de más de veinticinco grados: NO-GO. Pulsamos optimizar y el algoritmo A estrella encuentra, en 137 milisegundos, una ruta de cuatro kilómetros de ida y vuelta con noventa por ciento de batería: misión cumplida. Y el sistema elige la mejor hora para salir. No solo encontramos rutas: evaluamos cuál conviene seguir. Les dejo con nuestra diseñadora.»

*→ RELEVO a la diseñadora 2. La demo en vivo (ui/index.html) se reserva para las preguntas.*

---

## Diseñadora 2

### Diapositiva 6 · 2:55–3:25 (30 s · 67 palabras)

> «Esto es un prototipo, y lo decimos claro: los datos de Marte son reales; el vehículo es una referencia, el rover lunar del Apolo, y se cambia en un archivo. Lo siguiente es cargar vehículos reales, añadir tormentas de polvo y alertas solares, y llevar el mismo motor a la Luna con Artemis. Y ya sirve hoy para misiones de entrenamiento en la Tierra y para educación.»

*→ Avanza al cierre.*

### Diapositiva 7 · 3:25–3:40 (15 s · 30 palabras)

> «Cuando lleguemos a Marte, cada salida contará. Marswalk convierte datos abiertos de la NASA en una decisión simple: sal ahora, por aquí, y vuelve a salvo. Explorar, descubrir, regresar. Gracias.»

*→ Quedan ~20 s de margen hasta 4:00. Los tres al frente para preguntas.*

---

## Si les preguntan

La demo en vivo (`ui/index.html`) se reserva para las preguntas: TÉRMICO → MEJOR SALIDA → clic en una parada → RADIACIÓN + PLAY → TRACE: OPTIMIZAR RUTA → LANZAR ROVER.
