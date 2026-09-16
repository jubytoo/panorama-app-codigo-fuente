# ---------------------------------------------------------------------------
# BLOQUE 5 - arranques ELECTRON REALES y DESTRUCTIVOS, en sandbox artificial.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
#
# OJO: NO poner $ErrorActionPreference='Stop'. El 2>&1 de un .exe convierte
# cada linea de stderr en ErrorRecord y mataria el script.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run\b5.js"
$B5   = "$sb\bloque5"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

# --- guardianes ------------------------------------------------------------
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodAntes = @{}
$P = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
foreach ($f in @('main.js','preload.js','preload-launcher.js','launcher\renderer.js','preparacion-reunion\plantilla_preparacion_reunion.html','evaluacion-candidatos\plantilla_evaluacion_candidatos.html','db.js','security.js')) {
  $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash
}
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))"
Write-Output ""

$S = "$B5\sandbox-real"
if ($S -notlike '*bloque5\sandbox-real*') { throw "sandbox inesperado: $S" }

function LimpiarSandbox() {
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
}
function Arrancar([string]$modo, [int]$segundos) {
  if ($S -notlike '*bloque5\sandbox-real*') { throw "sandbox inesperado: $S" }
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S","--modo=$modo" -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $segundos) { Start-Sleep -Milliseconds 500 }
  if (-not $p.HasExited) {
    Write-Output "  (modo $modo no termino solo en $segundos s; se cierra)"
    & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null
  }
  Start-Sleep -Seconds 2
  try { if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) { & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null } } catch {}
}
$script:lineas = 0
function Marcar() { $tl = "$S\test.log"; $script:lineas = if (Test-Path $tl) { @(Get-Content $tl).Count } else { 0 } }
function Tramo() {
  $tl = "$S\test.log"; if (-not (Test-Path $tl)) { return @() }
  $t = @(Get-Content $tl -Encoding UTF8); if ($t.Count -le $script:lineas) { return @() }
  return $t[$script:lineas..($t.Count - 1)]
}
$script:totalOK = 0; $script:totalFallo = 0
function Mostrar([string]$titulo) {
  Write-Output ""
  Write-Output "=== $titulo ==="
  $tramo = Tramo
  if ($tramo.Count -eq 0) { Write-Output "   (SIN SALIDA - el arnes no llego a escribir)"; $script:totalFallo++; return }
  foreach ($l in $tramo) {
    $txt = $l -replace '^\[[^\]]+\]\s*',''
    if ($txt -like 'OK    *')    { $script:totalOK++ }
    if ($txt -like 'FALLO *')    { $script:totalFallo++ }
    Write-Output "   $txt"
  }
}

# ===========================================================================
Write-Output "########## E1 - ELIMINAR PROYECTO REAL ##########"
LimpiarSandbox
Marcar; Arrancar 'e1' 240; Mostrar 'E1 (crear, poblar, abrir ventanas, eliminar desde el launcher)'
Marcar; Arrancar 'e1b' 90; Mostrar 'E1 (cerrar y reabrir: no reaparece)'

Write-Output ""
Write-Output "########## E2 - D1 CON FALLO PRE-COMMIT ##########"
LimpiarSandbox
Marcar; Arrancar 'e2' 240; Mostrar 'E2 (base-cambiada antes del commit)'
Marcar; Arrancar 'e2b' 120; Mostrar 'E2 (tras reiniciar todo sigue accesible)'

Write-Output ""
Write-Output "########## E3 - D1 APLICADO / NO VERIFICADO ##########"
LimpiarSandbox
Marcar; Arrancar 'e3' 240; Mostrar 'E3 (forma 3 forzada dentro de Electron real)'
Marcar; Arrancar 'e3b' 90; Mostrar 'E3 (tras reiniciar no reaparece)'

Write-Output ""
Write-Output "########## E4 - MEETING DELETE REAL ##########"
LimpiarSandbox
Marcar; Arrancar 'e4' 240; Mostrar 'E4 (feliz + fallo PRE + forma 3)'
Marcar; Arrancar 'e4b' 90; Mostrar 'E4 (tras reiniciar)'

Write-Output ""
Write-Output "########## E5 - PURGA REAL ##########"
LimpiarSandbox
Marcar; Arrancar 'e5' 300; Mostrar 'E5 (purga feliz + purga rota)'

Write-Output ""
Write-Output "########## E6 - CV REAL ##########"
LimpiarSandbox
Marcar; Arrancar 'e6' 240; Mostrar 'E6 (quitar y cambiar, renderer productivo)'

# ===========================================================================
Write-Output ""
Write-Output "########## E7 - RECOVERY AL ARRANCAR ##########"
LimpiarSandbox
# Primero un arranque normal, para tener BD con identidad y un proyecto real.
Marcar; Arrancar 'nada' 60
$UD = "$S\Roaming\panorama-app"
if (-not (Test-Path "$UD\panorama.sqlite3")) { Write-Output "   (no se creo la BD; E7 no se puede plantar)"; $script:totalFallo++ }
else {
  # Se plantan los tres estados a mano, como los habria dejado un corte.
  $plantar = "$B5\plantar-e7.js"
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE','1','Process')
  & $ep $plantar "--sandbox=$S" 2>&1 | ForEach-Object { Write-Output "   $_" }
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE',$null,'Process')
  Marcar; Arrancar 'e7' 120; Mostrar 'E7 (A restaurar | B purgar | C NO-CLOBBER)'
}

# ===========================================================================
Write-Output ""
Write-Output "########## CIERRE ##########"
# cero procesos Electron vivos
Start-Sleep -Seconds 2
$vivos = @(Get-Process -Name 'electron' -ErrorAction SilentlyContinue)
Write-Output "procesos electron vivos: $($vivos.Count)"
if ($vivos.Count -gt 0) { $vivos | ForEach-Object { & taskkill.exe /PID $_.Id /T /F 2>&1 | Out-Null }; Start-Sleep -Seconds 2; Write-Output "  tras limpiar: $(@(Get-Process -Name 'electron' -ErrorAction SilentlyContinue).Count)" }

$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gDespues  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
Write-Output "BD VIVA despues: $($bdDespues.Substring(0,16))"
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "carpeta compartida: $gAntes -> $gDespues entradas"
$tocados = @()
foreach ($f in $prodAntes.Keys) { if ((Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash -ne $prodAntes[$f]) { $tocados += $f } }
Write-Output "archivos de produccion modificados durante las pruebas: $($tocados.Count) $($tocados -join ', ')"

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
Write-Output "sandbox eliminado: $(-not (Test-Path $S))"
Write-Output ""
Write-Output "TOTAL ELECTRON REAL: $($script:totalOK) OK / $($script:totalFallo) FALLOS"
