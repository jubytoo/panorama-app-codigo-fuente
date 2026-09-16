# ---------------------------------------------------------------------------
# B1 / P13 - arranque ELECTRON REAL: ciclo de frescura entre lanzador y
# dashboard, en sandbox artificial. NO arregla nada: reproduce y mide.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
#
# OJO: NO poner $ErrorActionPreference='Stop'. El 2>&1 de un .exe convierte
# cada linea de stderr en ErrorRecord y mataria el script.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\b1.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

# --- guardianes ------------------------------------------------------------
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','preload.js','preload-launcher.js','launcher\index.html','launcher\renderer.js','dashboard\plantilla_dashboard.html','vendor\service-status.js','db.js','security.js')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output ""

$S = Join-Path $env:TEMP '_a33-b1-real'
if ($S -notlike '*_a33-b1-real*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

$mainAlt = $null
$mainTmp = Join-Path $P '__main-revertido-PRUEBAS.js'
if (Test-Path $mainTmp) { Remove-Item -LiteralPath $mainTmp -Force }
if ($env:B1_MAIN) {
  if (-not (Test-Path $env:B1_MAIN)) { throw "B1_MAIN no existe: $($env:B1_MAIN)" }
  Copy-Item -LiteralPath $env:B1_MAIN -Destination $mainTmp -Force
  $mainAlt = $mainTmp
  Write-Output "MAIN ALTERNATIVO: $($env:B1_MAIN)"
}

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$argv = @("`"$wrap`"", "`"--sandbox=$S`"")
if ($mainAlt) { $argv += "`"--main=$mainAlt`"" }

Write-Output "==================== LANZADOR + DASHBOARD (frescura) ===================="
# $proc, NO $p: PowerShell no distingue mayusculas y $p pisaria $P.
$proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
$t0 = Get-Date
while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 300) { Start-Sleep -Milliseconds 500 }
if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" }
else { Write-Output "  exit: $($proc.ExitCode)" }

$l = "$S\test.log"
if (Test-Path $l) { Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' } }
else { Write-Output "  (sin test.log)" }

$totOK = 0; $totFALLO = 0
if (Test-Path $l) {
  $t = Get-Content $l
  $totOK    = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
  $totFALLO = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
}
Write-Output ""
Write-Output "======================================================================"
Write-Output "  B1/P13 ELECTRON REAL: $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"

# --- guardianes de salida --------------------------------------------------
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $mainTmp) { Remove-Item -LiteralPath $mainTmp -Force -ErrorAction SilentlyContinue }
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gDespues  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
Write-Output ""
Write-Output "BD VIVA despues: $($bdDespues.Substring(0,16))   archivos: $gDespues"
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "Carpeta de la BD viva SIN archivos nuevos: $($gAntes -eq $gDespues)"
$prodOk = $true
foreach ($f in $prodFiles) {
  $h = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash
  if ($h -ne $prodAntes[$f]) { $prodOk = $false; Write-Output "  CAMBIO EN PRODUCCION: $f" }
}
Write-Output "Archivos productivos intactos durante las pruebas: $prodOk"
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
