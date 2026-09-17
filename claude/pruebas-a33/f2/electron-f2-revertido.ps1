# ---------------------------------------------------------------------------
# F2 - REVERSIONES en la app REAL. Se arranca un main.js MUTADO (generado por
# revertir-f2.js), compilado por el arnes como si fuera el del proyecto: el
# producto NO se toca. Lo que se exige es que la bateria VEA cada defecto.
#   rev-sin-csp      A: sin enganche -> sin politica, fetch e imagen remotos salen
#   rev-eval         B: con 'unsafe-eval' -> new Function vuelve a ejecutarse
#   rev-worker-none  F: worker-src 'none' -> el acta se lee, pero sin Worker real
# Red: SOLO un servidor en 127.0.0.1 dentro del arnes. NO toca la BD viva ni G:.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$D    = "$P\claude\pruebas-a33\f2"
$wrap = "$P\claude\pruebas-a33\real-run\f2-csp.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$mainAntes = (Get-FileHash "$P\main.js" -Algorithm SHA256).Hash
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))"

& node "$D\revertir-f2.js" | Out-Null

$casos = @(
  @('rev-sin-csp', "$D\revertidos\A-sin-csp\main.js"),
  @('rev-eval', "$D\revertidos\B-unsafe-eval\main.js"),
  @('rev-worker-none', "$D\revertidos\F-worker-none\main.js")
)
$totOK = 0; $totFALLO = 0
foreach ($c in $casos) {
  $modo = $c[0]; $fuente = $c[1]
  $S = Join-Path $env:TEMP "_a33-f2-$modo"
  if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  [Environment]::SetEnvironmentVariable('F2_MAIN_FUENTE', $fuente, 'Process')
  Write-Output "==================== REVERSION $modo ===================="
  $proc = Start-Process -FilePath $ep -ArgumentList @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo") -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 180) { Start-Sleep -Milliseconds 500 }
  if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; Write-Output "  TIMEOUT" } else { Write-Output "  exit: $($proc.ExitCode)" }
  [Environment]::SetEnvironmentVariable('F2_MAIN_FUENTE', $null, 'Process')
  Start-Sleep -Milliseconds 1200
  $l = "$S\test.log"
  if (Test-Path $l) {
    Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' }
    $t = Get-Content $l
    $totOK    += ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] OK    ' } | Measure-Object).Count
    $totFALLO += ($t | Where-Object { $_ -cmatch '^\[[^\]]+\] FALLO ' } | Measure-Object).Count
    if (-not ($t | Where-Object { $_ -match "__MODO_TERMINADO__ $modo" })) { $totFALLO++; Write-Output "  FALLO: $modo no llego al final" }
  } else { $totFALLO++; Write-Output "  FALLO: sin test.log" }
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output ""
Write-Output "======================================================================"
Write-Output "  F2 REVERSIONES EN ELECTRON: $totOK OK / $totFALLO FALLOS"
Write-Output "======================================================================"
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "main.js productivo intacto: $($mainAntes -eq (Get-FileHash "$P\main.js" -Algorithm SHA256).Hash)"
