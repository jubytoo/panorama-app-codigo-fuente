# Arranque REAL de Panorama con el db.js integrado, en sandbox aislado.
# No toca G:\ ni %APPDATA%\panorama-app.
#
# ARN-2 (bloque1) — REPARADO. La version original llevaba escrita a fuego la
# ruta del scratchpad de una sesion ya borrada (ahi vivia tambien el
# envoltorio "real-run", que no existe en ningun sitio persistente), asi que
# no se podia ejecutar. Usa ahora el mismo patron que los arneses oficiales
# (a2/electron-real.ps1): wrapper persistente real-run\main.js y sandbox
# corto en %TEMP% sin espacios.
#
# ARN-3: el aislamiento real lo da real-run\main.js, que hace app.setPath()
# ANTES de requerir main.js/db.js del proyecto (demostrado aparte con
# bloque1\sonda-aislamiento.js: appData/userData caen dentro del sandbox
# antes de tocar nada de producto). Las variables de entorno de abajo son
# una segunda capa de defensa, igual que en a2, no el mecanismo principal.
$ErrorActionPreference = 'Stop'

$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\main.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"

$S = Join-Path $env:TEMP '_a33-bloque1-arranque'
if ($S -notlike '*_a33-bloque1-arranque*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*' -or $S -like '*Mi unidad*') { throw "sandbox peligroso: $S" }

# huella de produccion antes
$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = if (Test-Path $prodDb) { (Get-FileHash $prodDb -Algorithm SHA256).Hash } else { 'NO-EXISTE' }
$antesLen = if (Test-Path $prodDb) { (Get-Item $prodDb).Length } else { 0 }

Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$S\Roaming" | Out-Null
New-Item -ItemType Directory -Force -Path "$S\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

Write-Output "lanzando Panorama en sandbox: $S"
$p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S","--modo=nada" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 28
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ep } | Stop-Process -Force -ErrorAction SilentlyContinue

$UD = "$S\Roaming\panorama-app"
Write-Output ""
Write-Output "--- CONTENIDO DE LA CARPETA DE DATOS DEL SANDBOX ---"
Get-ChildItem $UD -ErrorAction SilentlyContinue | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output

Write-Output "--- app.log del sandbox ---"
$log = Join-Path $UD 'app.log'
if (Test-Path $log) {
  Get-Content $log -Encoding UTF8 | Select-Object -Last 40 | ForEach-Object { "  $_" }
} else { Write-Output "  (no hay app.log)" }

Write-Output ""
Write-Output "--- PRODUCCION ---"
$despues = if (Test-Path $prodDb) { (Get-FileHash $prodDb -Algorithm SHA256).Hash } else { 'NO-EXISTE' }
$despuesLen = if (Test-Path $prodDb) { (Get-Item $prodDb).Length } else { 0 }
Write-Output "  antes:   $antes  ($antesLen B)"
Write-Output "  despues: $despues  ($despuesLen B)"
Write-Output "  INTACTA: $($antes -eq $despues -and $antesLen -eq $despuesLen)"
Write-Output "  G: BD-PanoramaServicio tocada en esta prueba: NO (el sandbox no la referencia)"

Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
