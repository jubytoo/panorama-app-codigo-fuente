# Arranque REAL de Panorama con el db.js integrado, en sandbox aislado.
# No toca G:\ ni %APPDATA%\panorama-app.
$ErrorActionPreference = 'Stop'

$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run"
$SBOX = "$sb\bloque1\sandbox-arranque"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'

# --- guardián de rutas ---
if ($SBOX -notlike '*bloque1\sandbox-arranque*') { throw "sandbox inesperado: $SBOX" }
if ($SBOX -like '*BD-PanoramaServicio*' -or $SBOX -like '*Mi unidad*') { throw "sandbox peligroso: $SBOX" }

# huella de produccion antes
$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = if (Test-Path $prodDb) { (Get-FileHash $prodDb -Algorithm SHA256).Hash } else { 'NO-EXISTE' }
$antesLen = if (Test-Path $prodDb) { (Get-Item $prodDb).Length } else { 0 }

Remove-Item $SBOX -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$SBOX\Roaming" | Out-Null
New-Item -ItemType Directory -Force -Path "$SBOX\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$SBOX\Local", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

Write-Output "lanzando Panorama en sandbox: $SBOX"
$p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$SBOX","--modo=nada" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 28
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ep } | Stop-Process -Force -ErrorAction SilentlyContinue

$UD = "$SBOX\Roaming\panorama-app"
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
