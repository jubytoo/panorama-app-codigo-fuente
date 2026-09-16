# ---------------------------------------------------------------------------
# C1 - que queda de la PARTICION de Electron de un proyecto borrado, en la app
# REAL y dentro de un sandbox artificial:
#   modo a  crear, abrir, guardar, BORRAR por el lanzador real; foto antes/despues
#   modo b  arranque nuevo sin abrir esa particion: sigue la carpeta?
#   C1-A: en cada arranque, la linea del inventario de residuos en app.log;
#   modo c  "Eliminar evaluacion" con clic real (CV solo con aplicado+verificado)
#   modo d  arranque nuevo: el inventario cuenta el CV conservado y no lo toca
#
# Descriptivo: mide, no exige ningun cambio. NO toca la BD viva ni G:.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: NO poner $ErrorActionPreference='Stop'.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\c1-particion.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','db.js','security.js','launcher\renderer.js','security-window\renderer.js','dashboard\plantilla_dashboard.html','directorio\plantilla_directorio.html','preparacion-reunion\plantilla_preparacion_reunion.html','evaluacion-candidatos\plantilla_evaluacion_candidatos.html')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output ""

$S = Join-Path $env:TEMP '_a33-c1-real'
if ($S -notlike '*_a33-c1-real*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

foreach ($modo in @('a','b','c','d')) {
  Write-Output "==================== APP REAL (modo $modo) ===================="
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  # $proc, NO $p: PowerShell no distingue mayusculas y $p pisaria $P.
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 180) { Start-Sleep -Milliseconds 500 }
  if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" }
  else { Write-Output "  exit: $($proc.ExitCode)" }
  Start-Sleep -Milliseconds 1500
}

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
Write-Output "  C1 ELECTRON REAL (particion + inventario + CV de C1-A): $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gDespues  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
Write-Output ""
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "Carpeta de la BD viva SIN archivos nuevos: $($gAntes -eq $gDespues)"
$prodOk = $true
foreach ($f in $prodFiles) {
  $h = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash
  if ($h -ne $prodAntes[$f]) { $prodOk = $false; Write-Output "  CAMBIO EN PRODUCCION: $f" }
}
Write-Output "Archivos productivos intactos durante las pruebas: $prodOk"
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
