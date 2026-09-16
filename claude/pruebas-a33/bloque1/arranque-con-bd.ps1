# Arranque REAL con una BD ya existente en el sandbox — el caso del usuario.
$ErrorActionPreference = 'Stop'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run"
$SBOX = "$sb\bloque1\sandbox-conbd"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'

if ($SBOX -notlike '*bloque1\sandbox-conbd*') { throw "sandbox inesperado" }
$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = (Get-FileHash $prodDb -Algorithm SHA256).Hash

Remove-Item $SBOX -Recurse -Force -ErrorAction SilentlyContinue
$UD = "$SBOX\Roaming\panorama-app"
New-Item -ItemType Directory -Force -Path $UD | Out-Null
New-Item -ItemType Directory -Force -Path "$SBOX\Local" | Out-Null

# Semilla: una BD LEGADA (anterior a A3.3), que es lo que tiene el usuario hoy.
$semilla = "$sb\bloque1\semilla-legada.js"
& node $semilla $UD
Write-Output "semilla creada:"
Get-ChildItem $UD | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$SBOX\Local", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$SBOX","--modo=nada" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 26
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ep } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Output "--- tras arrancar ---"
Get-ChildItem $UD | Where-Object { $_.Name -like 'panorama*' } | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output
Write-Output "--- app.log ---"
Get-Content (Join-Path $UD 'app.log') -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { "  $_" }
& node "$sb\bloque1\ver-conbd.js" $UD
$despues = (Get-FileHash $prodDb -Algorithm SHA256).Hash
Write-Output ""
Write-Output "PRODUCCION INTACTA: $($antes -eq $despues)"
Remove-Item $SBOX -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $SBOX))"
