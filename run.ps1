$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$CK = 'runs\varnet\last.pt'
New-Item -ItemType Directory -Force runs\varnet | Out-Null

uv sync
uv run python -c "import torch; print(torch.__version__, 'cuda:', torch.cuda.is_available())"
uv run python train.py
$out = uv run python eval.py $CK
$out | Out-File -Encoding utf8 runs\varnet\eval.json
$out
uv run python demo.py $CK
Write-Host 'listo: runs\varnet\ y demo.png'
