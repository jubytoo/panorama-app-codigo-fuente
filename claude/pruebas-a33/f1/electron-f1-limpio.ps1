# ---------------------------------------------------------------------------
# F1 - VALIDACION LIMPIA: datos ORDINARIOS, sin ningun marcador de seguridad.
#   modo v  proyecto nuevo con datos normales: lanzador, dashboard, Preparacion,
#           Evaluacion, Directorio (+ capturas de pantalla)
#   modo w  proyecto horneado ANTES de F1 con datos normales: hay doble escape?
#   modo x  logo valido / ninguno / invalido
#   modo n  la "ventana negra": que es, y que en uso normal NO aparece
#
# Exige: texto exacto, sin entidades a la vista, sin markup visible, markup
# legitimo intacto. NO toca la BD viva ni G:.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: NO poner $ErrorActionPreference='Stop'.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\f1-limpio.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','db.js','preload.js','dashboard\plantilla_dashboard.html','directorio\plantilla_directorio.html','preparacion-reunion\plantilla_preparacion_reunion.html','evaluacion-candidatos\plantilla_evaluacion_candidatos.html')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output ""

$S = Join-Path $env:TEMP '_a33-f1-limpio'
if ($S -notlike '*_a33-f1-limpio*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

# Las capturas se guardan FUERA del sandbox, para que sobrevivan al borrado.
$CAP = Join-Path $env:TEMP '_a33-f1-capturas'
if (Test-Path $CAP) { Remove-Item -LiteralPath $CAP -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $CAP | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
[Environment]::SetEnvironmentVariable('F1_CAPTURAS', $CAP, 'Process')

foreach ($modo in @('v','w','x','n')) {
  Write-Output "==================== APP REAL (modo $modo) ===================="
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 240) { Start-Sleep -Milliseconds 500 }
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
Write-Output "  F1 VALIDACION LIMPIA (datos ordinarios): $totOK OK / $totFALLO FALLOS"
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
Write-Output "capturas en: $CAP"
Get-ChildItem $CAP -Filter *.png -ErrorAction SilentlyContinue | ForEach-Object { "   " + $_.Name + "  (" + [int]($_.Length/1024) + " KB)" }
