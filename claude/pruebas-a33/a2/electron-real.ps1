# ---------------------------------------------------------------------------
# A2 - arranques ELECTRON REALES de restauracion, en sandbox artificial.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
#
# OJO: NO poner $ErrorActionPreference='Stop'. El 2>&1 de un .exe convierte
# cada linea de stderr en ErrorRecord y mataria el script.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\a2.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

# --- guardianes ------------------------------------------------------------
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','preload.js','preload-launcher.js','preload-backup-picker.js','launcher\renderer.js','backup-picker\renderer.js','db.js','security.js')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output "main.js antes: $($prodAntes['main.js'].Substring(0,16))"
Write-Output ""

# OJO: el sandbox NO puede vivir bajo "C:\Codigo Fuente PS\...". Start-Process
# parte los elementos de -ArgumentList por espacios, asi que una ruta con
# espacios llegaba troceada y el arnes escribia su log en "C:\Codigo\test.log",
# que no existe - y como tlog() traga el error, la prueba parecia no arrancar.
# Se usa %TEMP% (ruta corta 8.3, sin espacios) y ademas se citan los argumentos.
$S = Join-Path $env:TEMP '_a33-a2-real'
if ($S -notlike '*_a33-a2-real*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

function LimpiarSandbox() {
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
}
function Arrancar([string]$modo, [int]$segundos, [string]$mainAlt) {
  if ($S -notlike '*_a33-a2-real*') { throw "sandbox inesperado: $S" }
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "`"--modo=$modo`"")
  if ($mainAlt) { $argv += "`"--main=$mainAlt`"" }
  $p = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $segundos) { Start-Sleep -Milliseconds 500 }
  if (-not $p.HasExited) { $p.Kill(); Start-Sleep -Milliseconds 800; return 'TIMEOUT' }
  return $p.ExitCode
}
function MostrarLog() {
  $l = "$S\test.log"
  if (Test-Path $l) { Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' } }
  else { Write-Output "  (sin test.log)" }
}
function ContarLog() {
  $l = "$S\test.log"
  if (-not (Test-Path $l)) { return @(0,0) }
  # Anclado al formato EXACTO que escribe ok(): "[timestamp] OK    ..." /
  # "[timestamp] FALLO ...". Un simple ' FALLO ' contaba tambien los titulos de
  # seccion (p.ej. "--- RA-3: FALLO PRE-COMMIT ---") y daba un fallo fantasma.
  $t = Get-Content $l
  $o = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
  $f = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
  return @($o,$f)
}

# Planta material de restauracion NO DEMOSTRABLE: un journal que se puede abrir
# pero no interpretar. La validacion cerrada lo marca como no valido, y eso es
# lo que debe disparar PS-2006 al arrancar.
function PlantarNoDemostrable() {
  $ud  = "$S\Roaming\panorama-app"
  $dir = "$ud\.panorama-restauraciones\aaaaaaaabbbbbbbbccccccccdddddddd"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # JSON truncado a proposito: parseable-a-medias NO es evidencia.
  Set-Content -LiteralPath "$dir\journal.json" -Encoding ascii -Value '{ "v": 1, "action_id": "aaaaaaaabbbbbbbbccccccccdddddddd", "fase": "aplic'
  Set-Content -LiteralPath "$dir\previo.enc"   -Encoding ascii -Value 'copia del estado anterior que NO se puede tirar'
  Write-Output "  material no demostrable plantado en: $dir"
}

$totOK = 0; $totFALLO = 0
$modos = if ($env:A2_MODOS) { $env:A2_MODOS -split ',' } else { @('ra1','ra2','ra3','ra4','ra5','ra6','ra7','ra8','ra9') }

# A2_MAIN permite arrancar el modo contra una COPIA de main.js con una
# correccion revertida (a2/revertidos-main/*.js). Sin esto los modos pasaban
# siempre $null y ninguna reversion se podia comprobar en Electron real: una
# prueba que no se ha visto fallar nunca no demuestra nada.
$mainAlt = $null
$mainTmp = Join-Path $P '__main-revertido-PRUEBAS.js'
if (Test-Path $mainTmp) { Remove-Item -LiteralPath $mainTmp -Force }
if ($env:A2_MAIN) {
  if (-not (Test-Path $env:A2_MAIN)) { throw "A2_MAIN no existe: $($env:A2_MAIN)" }
  # La copia revertida vive en a2\revertidos-main\, y ahi main.js no puede
  # resolver sus `require('./db')` ni su `__dirname` (preloads, plantillas).
  # Se copia a la RAIZ con un nombre marcado, se usa, y se borra al terminar.
  # No modifica ningun archivo productivo: solo anade uno nuevo y temporal.
  Copy-Item -LiteralPath $env:A2_MAIN -Destination $mainTmp -Force
  $mainAlt = $mainTmp
  Write-Output "MAIN ALTERNATIVO (reversion): $($env:A2_MAIN)"
  Write-Output "  copiado a: $mainTmp"
}

foreach ($m in $modos) {
  Write-Output "==================== MODO $m ===================="
  LimpiarSandbox
  if ($m -eq 'ra5') {
    $c1 = Arrancar 'ra5' 180 $mainAlt
    Write-Output "  arranque 1 (corte esperado): $c1"
    $c2 = Arrancar 'ra5b' 180 $mainAlt
    Write-Output "  arranque 2 (recuperacion): $c2"
  } elseif ($m -eq 'ra7') {
    $c1 = Arrancar 'ra7' 180 $mainAlt
    Write-Output "  arranque 1 (corte tras el cleanup de la reposicion): $c1"
    $c2 = Arrancar 'ra7b' 180 $mainAlt
    Write-Output "  arranque 2 (comprobacion del PRE): $c2"
  } elseif ($m -eq 'ra9') {
    $c0 = Arrancar 'ra9prep' 300 $mainAlt
    Write-Output "  arranque 0 (preparacion): $c0"
    PlantarNoDemostrable
    $c1 = Arrancar 'ra9' 180 $mainAlt
    Write-Output "  arranque 1 (fail-closed esperado): $c1"
  } else {
    $c = Arrancar $m 300 $mainAlt
    Write-Output "  exit: $c"
  }
  MostrarLog
  $n = ContarLog
  $totOK += $n[0]; $totFALLO += $n[1]
  Write-Output "  -> $($n[0]) OK / $($n[1]) FALLOS"
  Write-Output ""
}

Write-Output "======================================================================"
Write-Output "  A2 ELECTRON REAL: $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"

# --- guardianes de salida --------------------------------------------------
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $mainTmp) { Remove-Item -LiteralPath $mainTmp -Force -ErrorAction SilentlyContinue }
Write-Output "copia revertida temporal borrada: $(-not (Test-Path $mainTmp))"
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
