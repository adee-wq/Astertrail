# model-marte: VARnet-Marte

Interpola series de temperatura marciana con huecos y muestreo irregular. Dada una serie `(t, x, sigma)`, predice `mu` y `log sigma` en tiempos de consulta arbitrarios. Es un módulo del motor de planificación de caminatas EVA: entrega la capa ambiental con incertidumbre.

Fuente de verdad: `Especificación VARnet-Marte.md`, fuera de esta carpeta. Las secciones 6 a 9 describen el modelo, y la 15 el contrato de integración.

## Entorno

- Windows, PowerShell, GPU: RTX 4050 Laptop, 6 GB VRAM.
- Python 3.12 (fijado en `.python-version`). No usar 3.15: no hay ruedas de torch.
- `torch==2.6.0+cu124`, desde el índice `pytorch` de `pyproject.toml`.
- Gestor: `uv`. Instalar con `uv sync`. Verificar CUDA:

```powershell
uv run python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

Debe imprimir `2.6.0+cu124 True`.

## Estructura

```
data.py    CSV de REMS -> sol/Ls, partición train/test (NO integrado en train/eval)
synth.py   generador sintético en torch (batch(B, N, dev, seed))
model.py   FEFT, encoder MLP, decoder con tiempo de consulta, NLL, predict()
train.py   bucle enmascarado, AMP bf16, AdamW, checkpoint en runs/varnet/last.pt
eval.py    baselines (lineal, spline, GP) vs VARnet, RMSE/MAE/cov1/cov2
demo.py    figura demo.png con 3 paneles (depuración, no es la UI final)
run.ps1    train -> eval -> demo (ver "Problemas conocidos")
```

Configuración en diccionarios `CFG` dentro de cada archivo, no en un YAML.

## Estado actual

- Checkpoint: `runs/varnet/last.pt`, paso 4300 de 20 000 objetivo. El entrenamiento retoma desde el checkpoint si existe.
- Entrenamiento (sintético, paso 4200): NLL de validación -1.159, RMSE de validación 0.156 en unidades normalizadas (`asinh` de la escala IQR). No hay sobreajuste visible.
- Evaluación a 800 pasos (`eval.py`, n=32, huecos 10/20/40%):
  - GP: RMSE 0.06 a 0.07. cov1 ~0.87, cov2 ~0.90. Más preciso, pero demasiado conservador en σ.
  - VARnet: RMSE 0.23 a 0.26. cov1 0.61 a 0.69, cov2 0.92 a 0.93. Calibración razonable.
  - Lineal y spline: RMSE de 0.6 a 4. Ver "Notas" sobre el spline. `cov1` y `cov2` son N/A para estos métodos (no producen σ).
- Demo: VARnet sigue la periodicidad y su banda ±1σ cubre los puntos ocultos. El GP solo lo hace si los hiperparámetros iniciales son razonables (`periodicity_bounds=(1e-2, 1.)`).

Lo que aún NO se ha probado: ningún dato real (REMS) pasa por el pipeline. Todas las métricas son sintéticas.

## Problemas conocidos

1. **Cambios de rendimiento pendientes (no aplicados).** Objetivo: subir el uso de la GPU, que estaba muy baja.
   - `train.py`: `B=256` a `B=512` (o `768` si `nvidia-smi` muestra `GPU-Util` < 50%; `384` si hay OOM).
   - `train.py`: añadir `torch.backends.cuda.matmul.allow_tf32 = True`.
   - `train.py`: acumular `run` como tensor (`l.detach()`) y llamar `.item()` solo al loguear. Evita una sincronización por paso.
   - `synth.py`: en `_dust`, quitar `.item()` de `t.min()` y `t.max()`.
2. **`run.ps1` no se detiene si Python falla.** `$ErrorActionPreference` no afecta a los comandos nativos, así que imprime "listo" aunque `eval.py` o `demo.py` fallen. Verificar siempre que `demo.png` exista y que la salida no tenga `Traceback`.
3. **`data.py` no está conectado.** Escribe `data/processed/train.csv` y `test.csv`, pero `train.py` y `eval.py` solo usan `synth.batch`. Falta un cargador de REMS que produzca el mismo formato que `batch` (`x, t, mask, y, sigma`) y un modo de evaluación sobre el test real.
4. **`data.py` con un CSV de prueba de 20 sols falla.** `test_sols=200` deja el test vacío. Con REMS real no ocurre.
5. **Formato de CSV esperado:** `sol, ltst, air_temp, air_temp_err, quality`. Se ajusta en `CFG.cols`. Aún no se ha comprobado contra los archivos reales.
6. **El `lr` es constante (1e-4).** Tras el warm-up no hay decaimiento. Pendiente decidir si hace falta.
7. **σ del GP demasiado grande**, σ de VARnet correcto. Afecta a la comparación de calibración.

## Notas sobre el spline

`CubicSpline` oscila fuera de los datos en las ráfagas con ruido y en los huecos largos. `spl()` usa `np.unique` para tiempos repetidos y cae a interpolación lineal donde el spline no está definido. Es un baseline válido: no lo "arregles" para que gane.

## Pendiente de la especificación

- `EnvModule` (sección 15.3) con `predict()` y `predict_batch()`. No existe.
- Salida JSON del contrato (15.4) con `mu`, `sigma`, `lo95`, `hi95` y `conf` en unidades físicas (K). La desnormalización usa `med` e `iqr` de cada serie.
- Exportación a TorchScript u ONNX (15.4).
- Pruebas de contrato (15.5): forma de salida, unidades, cobertura de intervalos, determinismo.
- Fase 2 (6.2 y 15.6): wavelet, CNN, `predict_grid(lat, lon, tq)`.

## Comandos

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
uv run python train.py
uv run python eval.py runs\varnet\last.pt > runs\varnet\eval.json
uv run python demo.py runs\varnet\last.pt
nvidia-smi -l 1
```

Para entrenar desde cero, borrar `runs\varnet\`. Para continuar, dejar el checkpoint.

## Prompt de arranque para el siguiente modelo

> Lee este README y la especificación. Aplica primero los cambios de rendimiento de "Problemas conocidos" 1 y verifica la formas con `synth.batch`. Después, conecta `data.py` a `train.py` y `eval.py` para que el test sea REMS real, sin cambiar el formato de `batch`. Corrige `run.ps1` para que se detenga ante errores. No cambies la arquitectura (`m=256`, `h=256`) ni la semilla. Antes de modificar un archivo, pide el contenido actual.