# ---------------------------------------------------------------------------
# F3 - la REVERSION en Electron real: sin politica, vuelven las ventanas.
#
# No se arranca contra un main.js revertido (sus require relativos no resuelven
# fuera del proyecto): se DESACTIVA la politica en caliente sobre la ventana,
# que es exactamente el estado de antes de F3, y se comprueba que el defecto
# REAPARECE: about:blank y file:// vuelven a crear BrowserWindow, y un
# <a target="_blank"> vuelve a abrir dentro de la app en vez de en el navegador.
#
# NO toca la BD viva ni G:. No modifica produccion.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\f2f3-superficie.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"

$S = Join-Path $env:TEMP '_a33-f2f3-rev'
if ($S -notlike '*_a33-f2f3*') { throw "sandbox inesperado: $S" }
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

Write-Output "==================== APP REAL sin politica (modo rev) ===================="
$argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=rev")
$proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
$t0 = Get-Date
while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 240) { Start-Sleep -Milliseconds 500 }
if (-not $proc.HasExited) { $proc.Kill(); Write-Output "  TIMEOUT" } else { Write-Output "  exit: $($proc.ExitCode)" }

$l = "$S\test.log"
$totOK = 0; $totFALLO = 0
if (Test-Path $l) {
  $t = Get-Content $l
  $t | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' }
  $totOK    = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
  $totFALLO = ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
}
Write-Output ""
Write-Output "======================================================================"
Write-Output "  F3 REVERSION EN ELECTRON (el defecto reaparece): $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
