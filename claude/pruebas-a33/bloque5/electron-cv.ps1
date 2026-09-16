# ---------------------------------------------------------------------------
# BLOQUE 5 - los DOS casos de CV que faltaban, en Electron real.
#   CV-ELECTRON-REPLACE-NOAPLICADO  y  CV-ELECTRON-RM-FORMA3
# Clic real sobre el renderer productivo. Solo sandbox artificial.
# ASCII puro: PowerShell 5.1 lee este archivo como ANSI.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run\b5.js"
$B5   = "$sb\bloque5"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'
$P = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodAntes = @{}
foreach ($f in @('main.js','preload.js','preload-launcher.js','launcher\renderer.js','preparacion-reunion\plantilla_preparacion_reunion.html','evaluacion-candidatos\plantilla_evaluacion_candidatos.html','db.js','security.js')) {
  $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash
}
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))"

$S = "$B5\sandbox-cv"
if ($S -notlike '*bloque5\sandbox-cv*') { throw "sandbox inesperado: $S" }
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

function Arrancar([string]$modo, [int]$segundos) {
  if ($S -notlike '*bloque5\sandbox-cv*') { throw "sandbox inesperado: $S" }
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S","--modo=$modo" -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $segundos) { Start-Sleep -Milliseconds 500 }
  if (-not $p.HasExited) { Write-Output "  (modo $modo no termino solo; se cierra)"; & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null }
  Start-Sleep -Seconds 2
  try { if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) { & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null } } catch {}
}
$script:lineas = 0
function Marcar() { $tl = "$S\test.log"; $script:lineas = if (Test-Path $tl) { @(Get-Content $tl).Count } else { 0 } }
$script:ok = 0; $script:fallo = 0
function Mostrar([string]$titulo) {
  Write-Output ""
  Write-Output "=== $titulo ==="
  $tl = "$S\test.log"
  $t = if (Test-Path $tl) { @(Get-Content $tl -Encoding UTF8) } else { @() }
  if ($t.Count -le $script:lineas) { Write-Output "   (SIN SALIDA)"; $script:fallo++; return }
  foreach ($l in $t[$script:lineas..($t.Count - 1)]) {
    $txt = $l -replace '^\[[^\]]+\]\s*',''
    if ($txt -like 'OK    *') { $script:ok++ }
    if ($txt -like 'FALLO *') { $script:fallo++ }
    Write-Output "   $txt"
  }
}

Marcar; Arrancar 'e6d' 300; Mostrar 'CV-RM-F3-RETURN (que devuelve el saveState original)'

Write-Output ""
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
Write-Output "archivos de produccion modificados: $($tocados.Count) $($tocados -join ', ')"
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
Write-Output "sandbox eliminado: $(-not (Test-Path $S))"
Write-Output ""
Write-Output "TOTAL: $($script:ok) OK / $($script:fallo) FALLOS"
