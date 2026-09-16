# F1 - modos sueltos de diagnostico de la validacion limpia (w y q).
# Mismo sandbox aislado, mismas garantias. NO toca la BD viva.
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\f1-limpio.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"

$S = Join-Path $env:TEMP '_a33-f1-limpio'
if ($S -notlike '*_a33-f1-limpio*') { throw "sandbox inesperado: $S" }
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null

[Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
[Environment]::SetEnvironmentVariable('F1_CAPTURAS', (Join-Path $env:TEMP '_a33-f1-capturas'), 'Process')

foreach ($modo in @('w','q')) {
  Write-Output "==================== modo $modo ===================="
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 180) { Start-Sleep -Milliseconds 500 }
  if (-not $proc.HasExited) { $proc.Kill(); Write-Output "  TIMEOUT" } else { Write-Output "  exit: $($proc.ExitCode)" }
  Start-Sleep -Milliseconds 1200
}

$l = "$S\test.log"
if (Test-Path $l) { Get-Content $l | ForEach-Object { $_ -replace '^\[[^\]]+\] ', '  ' } }
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
