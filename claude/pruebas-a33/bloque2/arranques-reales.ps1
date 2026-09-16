# Arranques REALES de Panorama con el wiring del Bloque 2, en sandbox aislado.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
$ErrorActionPreference = 'Stop'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run"
$B2   = "$sb\bloque2"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'

$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = (Get-FileHash $prodDb -Algorithm SHA256).Hash

function Arrancar($SBOX, $segundos) {
  if ($SBOX -notlike '*bloque2\sandbox*') { throw "sandbox inesperado: $SBOX" }
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$SBOX\Local", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$SBOX","--modo=nada" -PassThru -WindowStyle Minimized
  Start-Sleep -Seconds $segundos
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ep } | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Mostrar($SBOX, $titulo) {
  $UD = "$SBOX\Roaming\panorama-app"
  Write-Output ""
  Write-Output "--- $titulo ---"
  Get-ChildItem $UD -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'panorama*' } | Select-Object Name,Length | Format-Table -AutoSize | Out-String | Write-Output
  Write-Output "  app.log (lineas A3.3 / ERROR / Arranque):"
  Get-Content (Join-Path $UD 'app.log') -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ -match 'A3\.3|ERROR|Arranque ' } | ForEach-Object { "    $_" }
  $reg = "$SBOX\Roaming\panorama-app-config\ubicaciones-inicializadas.json"
  if (Test-Path $reg) {
    Write-Output "  registro de ubicaciones:"
    Get-Content $reg -Encoding UTF8 | ForEach-Object { "    $_" }
  } else {
    Write-Output "  registro de ubicaciones: (no existe)"
  }
}

$S1 = "$B2\sandbox-nuevo"
Remove-Item $S1 -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$S1\Roaming" | Out-Null
New-Item -ItemType Directory -Force -Path "$S1\Local" | Out-Null

Arrancar $S1 26
Mostrar $S1 "1) ARRANQUE GENUINAMENTE NUEVO"

Arrancar $S1 20
Mostrar $S1 "2) SEGUNDO ARRANQUE (misma ubicacion, ya registrada)"

$UD1 = "$S1\Roaming\panorama-app"
Get-ChildItem $UD1 -Filter 'panorama.sqlite3*' -ErrorAction SilentlyContinue | Remove-Item -Force
Write-Output ""
Write-Output "--- 3) DESAPARICION: borrados sqlite3 y restos ---"
$quedan = (Get-ChildItem $UD1 -Filter 'panorama*' -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "  quedan archivos panorama.*: $quedan"

Arrancar $S1 20
Mostrar $S1 "3) ARRANQUE TRAS LA DESAPARICION"
$recreada = Test-Path (Join-Path $UD1 'panorama.sqlite3')
Write-Output "  SE RECREO UNA BD VACIA?: $recreada"

$despues = (Get-FileHash $prodDb -Algorithm SHA256).Hash
Write-Output ""
Write-Output "PRODUCCION INTACTA: $($antes -eq $despues)"
Remove-Item $S1 -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $S1))"
