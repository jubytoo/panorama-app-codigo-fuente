# ---------------------------------------------------------------------------
# F2 - la CSP en la app REAL, dentro de sandboxes.
#   completo   las 10 ventanas: politica efectiva, recursos, funciones reales
#              (exportaciones, actas docx/pdf con Worker, recarga, F3) y, al
#              final, red/frames/objects/formularios cortados
#   viejo-a    proyectos creados con el main.js ANTERIOR a F2 (instantanea)
#   viejo-b    la version con F2 abre esos proyectos (uno sin poder rehornear)
# Red: SOLO un servidor en 127.0.0.1 dentro del arnes. NO toca la BD viva ni G:.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: NO poner $ErrorActionPreference='Stop'.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\f2-csp.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$PRE  = "$P\claude\main.js.ANTES-F2-2026-09-17"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','db.js','preload.js','security.js','dashboard\plantilla_dashboard.html','directorio\plantilla_directorio.html','preparacion-reunion\plantilla_preparacion_reunion.html','evaluacion-candidatos\plantilla_evaluacion_candidatos.html','launcher\index.html','security-window\index.html','backup-picker\index.html')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output ""

function Lanzar($S, $modo, $fuente) {
  Write-Output "==================== APP REAL (modo $modo) ===================="
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  [Environment]::SetEnvironmentVariable('F2_MAIN_FUENTE', $fuente, 'Process')
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 420) { Start-Sleep -Milliseconds 500 }
  if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" }
  else { Write-Output "  exit: $($proc.ExitCode)" }
  [Environment]::SetEnvironmentVariable('F2_MAIN_FUENTE', $null, 'Process')
  Start-Sleep -Milliseconds 1500
}

function Preparar($nombre) {
  $S = Join-Path $env:TEMP $nombre
  if ($S -notlike '*_a33-f2*') { throw "sandbox inesperado: $S" }
  if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
  if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
  return $S
}

$S1 = Preparar '_a33-f2-real'
Lanzar $S1 'completo' $null
$S2 = Preparar '_a33-f2-viejo'
Lanzar $S2 'viejo-a' $PRE
Lanzar $S2 'viejo-b' $null
# Diagnostico de la exportacion a PowerPoint (ventana oculta/visible), con F2
# y con el main.js anterior a F2: mismo comportamiento en los dos.
$S3 = Preparar '_a33-f2-pptx'
Lanzar $S3 'pptx' $null
$S4 = Preparar '_a33-f2-pptxpre'
Lanzar $S4 'pptx' $PRE
$todos = @($S1, $S2, $S3, $S4)

$totOK = 0; $totFALLO = 0
foreach ($S in $todos) {
  $l = "$S\test.log"
  if (Test-Path $l) {
    Write-Output "---------------- $(Split-Path $S -Leaf) ----------------"
    Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' }
    $t = Get-Content $l
    $totOK    += ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
    $totFALLO += ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
    $esperados = if ($S -eq $S1) { @('completo') } elseif ($S -eq $S2) { @('viejo-a','viejo-b') } else { @('pptx') }
    foreach ($m in $esperados) {
      if (-not ($t | Where-Object { $_ -match "__MODO_TERMINADO__ $m" })) { $totFALLO++; Write-Output "  FALLO: el modo $m no llego al final" }
    }
  } else { $totFALLO++; Write-Output "  FALLO: sin test.log en $S" }
}
Write-Output ""
Write-Output "======================================================================"
Write-Output "  F2 ELECTRON REAL (10 ventanas + proyecto viejo): $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"

foreach ($S in $todos) {
  Get-ChildItem -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer -and $_.IsReadOnly } | ForEach-Object { $_.IsReadOnly = $false }
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
}
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
Write-Output "sandboxes borrados: $(-not ($todos | Where-Object { Test-Path $_ }))"
