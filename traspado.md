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

- La PC tiene un filtro que re-firma HTTPS: `rems.py` usa `truststore` (`uv add truststore`) para que Python confíe en los certificados de Windows. No desactivar la verificación TLS.

## Estructura

```
data.py       CSV de REMS -> sol/Ls, partición train/test
rems.py       descarga MODRDR del PDS -> data/raw/rems_air.csv (medias por minuto, K)
synth.py      generador sintético en torch (batch(B, N, dev, seed))
model.py      FEFT, encoder MLP, decoder con tiempo de consulta, NLL, predict()
train.py      bucle enmascarado, AMP bf16, AdamW, checkpoint en runs/varnet/last.pt
eval.py       baselines (lineal, spline, GP) vs VARnet, RMSE/MAE/cov1/cov2 (sintético)
eval_real.py  misma comparación sobre REMS real + chequeos de contrato + veredicto MVP
diag_real.py  pruebas de hipótesis H1-H6 sobre por qué VARnet falla en real
demo.py       figura demo.png con 3 paneles (depuración, no es la UI final)
run.ps1       train -> eval -> demo (ver "Problemas conocidos")
ui/           interfaz pixel art (HTML/CSS/JS): px-button.css + px-button.js
```

Configuración en diccionarios `CFG` dentro de cada archivo, no en un YAML. `rems.py`, `eval_real.py` y `diag_real.py` están en el proyecto en `claude/`; van en la raíz junto a los demás.

## Estado actual

- Entrenamiento completo: paso 20 000. `train_nll -1.265`, `val_nll -1.269`, `val_rmse 0.138` (normalizado). Sin sobreajuste; meseta probable por `lr` constante.
- Evaluación sintética a 800 pasos: GP RMSE 0.06-0.07, VARnet 0.23-0.26 (el GP ya era ~4x mejor en sintético).

## Validación con REMS real (hecha, 2026-11-14)

Datos: sols 1500-1559, 31 146 minutos, 194-279 K, ruido dentro del minuto ~0.3 K. 10 ventanas de 10 sols.

`eval_real.py` (criterios provisionales: RMSE <= 6 K, cov1 0.55-0.85, cov2 0.85-0.99, latencia <= 50 ms):

| hueco | VARnet RMSE | GP RMSE | VARnet cov1/cov2 | GP cov1/cov2 |
|---|---|---|---|---|
| 10 % (~0.8 sols) | 8.72 K | 3.21 K | 0.53 / 0.84 | 0.64 / 0.91 |
| 20 % (~2 sols) | 8.37 K | 3.23 K | 0.52 / 0.87 | 0.66 / 0.90 |
| 40 % (~4 sols) | 10.55 K | 3.90 K | 0.51 / 0.82 | 0.59 / 0.87 |

Contrato de VARnet: todo OK, 2.9 ms por consulta. Veredicto VARnet: NO CUMPLE (RMSE y cov1). Lineal 24-26 K; spline 120-330 K (explota en huecos largos con datos en sesiones; no arreglarlo).

`diag_real.py` (hueco 20 %):
- **H1** VARnet falla 7.4 K en los puntos que ve y 8.4 K en los ocultos (GP 2.5 / 3.2). No interpola: suaviza.
- **H2** pendiente pred~obs 0.90 (GP 0.99); sesgo +1.5 K.
- **H3** RMSE normalizado 0.236 en real = sintético 0.23-0.26. **No hay brecha sim-a-real**: ajustar con REMS o mejorar el sintético no cierra la brecha.
- **H4** σ × k con k ≈ 1.4 (1.43 / 1.38 entre mitades) lleva cov1/cov2 de 0.52/0.87 a 0.66-0.70/0.97, con validación cruzada. Calibración resuelta.
- **H5** VARnet 3.9 ms por ventana, GP 1858 ms (~475x).
- **H6** corrección afín por serie (ajustada en visibles): 8.37 -> 8.06 K, pendiente empeora a 0.83. El error no es amplitud escalada sino forma/fase del ciclo diario (asimétrico). Sin arreglo barato.

**Conclusión:** el límite es la arquitectura (vector global FEFT promediado, el decoder no ve puntos vecinos). La incertidumbre se arregla con σ × 1.4; la precisión no, sin cambiar el modelo.

**Decisión propuesta para el MVP:** `EnvModule` con dos backends: GP (preciso, ~2 s) por defecto y VARnet calibrado (σ × 1.4, ~4 ms) para consultas masivas del planificador. Cambio de arquitectura (atención sobre puntos / decoder local) para después del MVP. Pendiente confirmar umbrales con la sección 15.

## Problemas conocidos

1. **Cambios de rendimiento pendientes (no aplicados).** `B=256` a `512`; `allow_tf32`; acumular `run` como tensor; quitar `.item()` en `synth._dust`.
2. **`run.ps1` no se detiene si Python falla.** Verificar que `demo.png` exista y que no haya `Traceback`.
3. **REMS real solo en evaluación.** `train.py` entrena solo con `synth.batch`.
4. **`data.py` con un CSV de prueba de 20 sols falla** (`test_sols=200`).
5. **El `lr` es constante (1e-4).** Candidato: coseno hasta ~1e-6 (no cierra la brecha con el GP, ver H3).
6. **Criterios MVP provisionales** en `eval_real.CFG['mvp']`; ajustar a la sección 15.
7. **`ndarray.ptp()` no existe en NumPy 2.** Usar `np.ptp(...)`.

## Notas sobre el spline

`CubicSpline` oscila fuera de los datos en las ráfagas con ruido y en los huecos largos. Es un baseline válido: no lo "arregles" para que gane.

## Pendiente de la especificación

- `EnvModule` (sección 15.3) con `predict()` y `predict_batch()`, backends `gp` y `varnet`. No existe.
- Salida JSON del contrato (15.4) con `mu`, `sigma`, `lo95`, `hi95` y `conf` en K.
- Exportación a TorchScript u ONNX (15.4).
- Pruebas de contrato (15.5). `eval_real.contract()` cubre forma, finitud, σ>0, determinismo, unidades y latencia.
- Fase 2 (6.2 y 15.6): wavelet, CNN, `predict_grid(lat, lon, tq)`.

## Comandos

```powershell
uv run python train.py
uv run python eval.py runs\varnet\last.pt > runs\varnet\eval.json
uv run python rems.py --sols 1500 1559
uv run python eval_real.py runs\varnet\last.pt
uv run python diag_real.py runs\varnet\last.pt
```

## Prompt de arranque para el siguiente modelo

> Lee este README y la especificación (sección 15). La validación con REMS real ya está hecha: VARnet no cumple en precisión por su arquitectura, el GP sí. Implementa `EnvModule` con backends GP y VARnet calibrado (σ × 1.4) según 15.3-15.4. No cambies la arquitectura de VARnet dentro del MVP. Antes de modificar un archivo, pide el contenido actual.