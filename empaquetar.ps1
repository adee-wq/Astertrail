# Crea astertrail-mvp.zip con lo necesario para abrir el MVP sin internet: ui/, LEEME.md y capturas/.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$zip = Join-Path $PSScriptRoot 'astertrail-mvp.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path 'ui', 'capturas', 'LEEME.md' -DestinationPath $zip
Write-Host ("listo: astertrail-mvp.zip ({0:N1} MB). Abre ui/index.html" -f ((Get-Item $zip).Length / 1MB))
