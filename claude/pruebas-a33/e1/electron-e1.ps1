# ---------------------------------------------------------------------------
# E1 - arranque ELECTRON REAL del lanzador tras retirar los controles de
# Lista / Resumen de Cartera, en sandbox artificial.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
#
# OJO: NO poner $ErrorActionPreference='Stop'. El 2>&1 de un .exe convierte
# cada linea de stderr en ErrorRecord y mataria el script.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\e1.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'

# --- guardianes ------------------------------------------------------------
# launcher\index.html entra en la lista: es el archivo que E1 toca, y hay que
# poder demostrar que el ARRANQUE no lo modifica.
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$gAntes  = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force | Measure-Object).Count
$prodFiles = @('main.js','preload.js','preload-launcher.js','preload-backup-picker.js','launcher\renderer.js','launcher\index.html','backup-picker\renderer.js','db.js','security.js')
$prodAntes = @{}
foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))    archivos en la carpeta: $gAntes"
Write-Output "index.html antes: $($prodAntes['launcher\index.html'].Substring(0,16))"
Write-Output ""

# El sandbox NO puede vivir bajo "C:\Codigo Fuente PS\...": Start-Process parte
# -ArgumentList por espacios. Se usa %TEMP% (ruta 8.3, sin espacios).
$S = Join-Path $env:TEMP '_a33-e1-real'
if ($S -notlike '*_a33-e1-real*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*') { throw "sandbox dentro de la BD viva: $S" }

if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

$mainAlt = $null
$mainTmp = Join-Path $P '__main-revertido-PRUEBAS.js'
if (Test-Path $mainTmp) { Remove-Item -LiteralPath $mainTmp -Force }
if ($env:E1_MAIN) {
  if (-not (Test-Path $env:E1_MAIN)) { throw "E1_MAIN no existe: $($env:E1_MAIN)" }
  Copy-Item -LiteralPath $env:E1_MAIN -Destination $mainTmp -Force
  $mainAlt = $mainTmp
  Write-Output "MAIN ALTERNATIVO: $($env:E1_MAIN)"
}

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$argv = @("`"$wrap`"", "`"--sandbox=$S`"")
if ($mainAlt) { $argv += "`"--main=$mainAlt`"" }

Write-Output "==================== LANZADOR REAL ===================="
# $proc, NO $p: PowerShell NO distingue mayusculas en los nombres de variable,
# asi que un `$p = Start-Process ...` en el ambito raiz PISA `$P`, la ruta del
# proyecto. El guardian de salida se quedaba sin ruta y declaraba "CAMBIO EN
# PRODUCCION" en los nueve archivos -- un falso positivo de los que asustan.
# En a2/electron-real.ps1 no pasa porque alli el Start-Process vive dentro de
# una funcion y su $p es local.
$proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
$t0 = Get-Date
while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 240) { Start-Sleep -Milliseconds 500 }
if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" }
else { Write-Output "  exit: $($proc.ExitCode)" }

$l = "$S\test.log"
if (Test-Path $l) { Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' } }
else { Write-Output "  (sin test.log)" }

# Anclado al formato EXACTO de ok(): un ' FALLO ' suelto contaria tambien los
# titulos de seccion.
$totOK = 0; $totFALLO = 0
if (Test-Path $l) {
  $t = Get-Content $l
  $totOK    = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
  $totFALLO = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
}
Write-Output ""
Write-Output "======================================================================"
Write-Output "  E1 ELECTRON REAL: $totOK OK / $totFALLO FALLOS"
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
