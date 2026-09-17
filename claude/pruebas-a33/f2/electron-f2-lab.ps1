# ---------------------------------------------------------------------------
# F2 - LABORATORIO DE CSP en el Chromium real de la app (Electron 30.5.1).
# No carga main.js ni plantillas: mide el motor con paginas minimas y los
# vendor/asset reales (solo lectura). Red: SOLO un servidor en 127.0.0.1.
# NO toca la BD viva ni G:.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: NO poner $ErrorActionPreference='Stop'.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\f2-laboratorio.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))"

$S = Join-Path $env:TEMP '_a33-f2-lab'
if ($S -notlike '*_a33-f2*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

$argv = @("`"$wrap`"", "`"--sandbox=$S`"")
$proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
$t0 = Get-Date
while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 240) { Start-Sleep -Milliseconds 500 }
if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" }
else { Write-Output "  exit: $($proc.ExitCode)" }

$l = "$S\test.log"
if (Test-Path $l) { Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' } }
else { Write-Output "  (sin test.log)" }
$totOK = 0; $totFALLO = 0; $fin = $false
if (Test-Path $l) {
  $t = Get-Content $l
  $totOK    = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
  $totFALLO = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
  $fin = [bool]($t | Where-Object { $_ -match '__LAB_TERMINADO__' })
}
if (-not $fin) { $totFALLO++; Write-Output "  FALLO: el laboratorio no llego al final" }
Write-Output ""
Write-Output "======================================================================"
Write-Output "  F2 LABORATORIO (Chromium real): $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
