# ---------------------------------------------------------------------------
# B5 - reentrancia de la ventana de Seguridad en la app REAL, dentro de un sandbox artificial:
#   RE1  SETUP con dos Enter: cuantas entradas reales llegan al handler
#   RE2  CHANGE con tres Enter: que devuelve cada una y si se solapan
#   RE3  si el usuario llega a VER el error confuso o la ventana ya se cerro
#   RE4  la contrasena final es determinista, no indeterminada
#
# Espia sobre ipcMain.handle instalado ANTES de cargar main.js: cuenta las
# entradas reales y mide si se solapan. El material (un proyecto con backup)
# lo crea el propio arnes. NO se toca la BD viva ni material productivo.
#
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
#
# OJO: NO poner $ErrorActionPreference='Stop'. El 2>&1 de un .exe convierte
# cada linea de stderr en ErrorRecord y mataria el script.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\b5-reentrancia.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','db.js','security.js','launcher\renderer.js','dashboard\plantilla_dashboard.html','directorio\plantilla_directorio.html','preparacion-reunion\plantilla_preparacion_reunion.html')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output ""

$S = Join-Path $env:TEMP '_a33-b5-real'
if ($S -notlike '*_a33-b5-real*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$argv = @("`"$wrap`"", "`"--sandbox=$S`"")

Write-Output "==================== APP REAL (reentrancia de Seguridad) ===================="
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
Write-Output "  B5 ELECTRON REAL (reentrancia): $totOK OK / $totFALLO FALLOS"
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
