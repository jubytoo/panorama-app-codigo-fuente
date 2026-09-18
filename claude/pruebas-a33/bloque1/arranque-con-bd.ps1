# Arranque REAL con una BD ya existente en el sandbox — el caso del usuario.
#
# ARN-2 (bloque1) — REPARADO. Mismo saneamiento que arranque-real.ps1 (ver su
# cabecera para el porque): sandbox corto en %TEMP% sin espacios.
# semilla-legada.js y ver-conbd.js NO se han tocado, siguen en bloque1\ (nunca
# vivieron en el scratchpad borrado).
#
# ARN-7 — wrapper propio (arranque-con-bd-wrapper.js) en vez de
# real-run\main.js: desde P22, adoptar una BD local sin location.json exige
# la confirmacion PS-1021, que real-run\main.js (--modo=nada) no contesta.
# El wrapper hace el mismo aislamiento y ademas responde ese dialogo,
# reutilizando la tecnica ya oficial de real-run\p22-reserva.js. Ver su
# cabecera para el detalle.
$ErrorActionPreference = 'Stop'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\bloque1\arranque-con-bd-wrapper.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"

$S = Join-Path $env:TEMP '_a33-bloque1-conbd'
if ($S -notlike '*_a33-bloque1-conbd*') { throw "sandbox inesperado: $S" }
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
if ($S -like '*BD-PanoramaServicio*' -or $S -like '*Mi unidad*') { throw "sandbox peligroso: $S" }

$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = (Get-FileHash $prodDb -Algorithm SHA256).Hash

Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
$UD = "$S\Roaming\panorama-app"
New-Item -ItemType Directory -Force -Path $UD | Out-Null
New-Item -ItemType Directory -Force -Path "$S\Local" | Out-Null

# Semilla: una BD LEGADA (anterior a A3.3), que es lo que tiene el usuario hoy.
$semilla = "$B\bloque1\semilla-legada.js"
& node $semilla $UD
Write-Output "semilla creada:"
Get-ChildItem $UD | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 26
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ep } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Output "--- tras arrancar ---"
Get-ChildItem $UD | Where-Object { $_.Name -like 'panorama*' } | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output
Write-Output "--- app.log ---"
Get-Content (Join-Path $UD 'app.log') -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { "  $_" }
& node "$B\bloque1\ver-conbd.js" $UD
$despues = (Get-FileHash $prodDb -Algorithm SHA256).Hash
Write-Output ""
Write-Output "PRODUCCION INTACTA: $($antes -eq $despues)"
Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
