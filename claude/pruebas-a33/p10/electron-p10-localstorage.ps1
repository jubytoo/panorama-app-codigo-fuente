# ---------------------------------------------------------------------------
# P10 - que guarda el localStorage de cada particion (residuo y G:).
# DIAGNOSTICO. Todo sobre COPIAS en %TEMP%\_a33-p10-ls; los originales solo se
# LEEN (Copy-Item) y se comparan por huella antes y despues.
# Se copia SOLO la carpeta "Local Storage" (sin LOCK ni desktop.ini).
# Requiere que Panorama NO este abierto (si lo esta, se aborta sin copiar).
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: ninguna variable que difiera de otra solo en mayusculas.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\p10-localstorage.js"
$cmp  = "$P\claude\pruebas-a33\p10\comparar-localstorage-p10.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$P10  = Join-Path $env:APPDATA 'panorama-app'
$GUD  = 'G:\Mi unidad\BD-PanoramaServicio'
$BDVIVA = "$GUD\panorama.sqlite3"

$abiertos = @(Get-Process | Where-Object { $_.ProcessName -match 'panorama|electron' })
if ($abiertos.Count) { Write-Output "ABORTADO: hay procesos de Panorama/Electron abiertos ($($abiertos.ProcessName -join ','))"; exit 1 }

function Huella($d) {
  if (-not (Test-Path -LiteralPath $d)) { return '(no existe)' }
  $l = Get-ChildItem -LiteralPath $d -Force -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName + '|' + $_.Length + '|' + $_.LastWriteTimeUtc.Ticks } | Sort-Object
  $sha = [Security.Cryptography.SHA256]::Create()
  [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($l -join "`n")))).Replace('-', '').Substring(0, 16)
}
$hP10 = Huella $P10
$hGPart = Huella "$GUD\Partitions"
$hBd = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "ANTES: arbol P10 $hP10 | Partitions de G: $hGPart | BD viva $($hBd.Substring(0,16))"

$R = Join-Path $env:TEMP '_a33-p10-ls'
if ($R -notlike '*_a33-p10*' -or $R -match ' ') { throw "sandbox inesperado: $R" }
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$R\res\Partitions", "$R\viva\Partitions" | Out-Null

function CopiarLS($origen, $destino) {
  if (-not (Test-Path -LiteralPath $origen)) { return 0 }
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
  $n = 0
  Get-ChildItem -LiteralPath $origen -Force -Recurse -File | Where-Object { $_.Name -notin @('LOCK', 'desktop.ini') } | ForEach-Object {
    $rel = $_.FullName.Substring($origen.Length).TrimStart('\')
    $dst = Join-Path $destino $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $dst
    $n++
  }
  return $n
}
$nRaiz = CopiarLS "$P10\Local Storage" "$R\res\Local Storage"
$nRes = 0; foreach ($d in Get-ChildItem -LiteralPath "$P10\Partitions" -Directory -Force) { $nRes += CopiarLS "$($d.FullName)\Local Storage" "$R\res\Partitions\$($d.Name)\Local Storage" }
$nViva = 0; foreach ($d in Get-ChildItem -LiteralPath "$GUD\Partitions" -Directory -Force) { $nViva += CopiarLS "$($d.FullName)\Local Storage" "$R\viva\Partitions\$($d.Name)\Local Storage" }
Write-Output "copiados: raiz del residuo $nRaiz archivos, particiones del residuo $nRes, particiones de G: $nViva"

[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
foreach ($copia in @('res', 'viva')) {
  $proc = Start-Process -FilePath $ep -ArgumentList @("`"$wrap`"", "`"--sandbox=$R`"", "--copia=$copia") -PassThru -WindowStyle Hidden
  if (-not $proc.WaitForExit(90000)) { $proc.Kill(); Write-Output "TIMEOUT leyendo la copia $copia" }
  Write-Output "lectura $copia -> exit $($proc.ExitCode), resultado: $(Test-Path "$R\resultado-$copia.json")"
}
Write-Output ""
& node $cmp $R

Write-Output ""
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force }
$h2P10 = Huella $P10
$h2GPart = Huella "$GUD\Partitions"
$h2Bd = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "DESPUES: arbol P10 $(if ($h2P10 -eq $hP10) { 'IDENTICO' } else { '*** CAMBIO ***' }) | Partitions de G: $(if ($h2GPart -eq $hGPart) { 'IDENTICAS' } else { '*** CAMBIO ***' }) | BD viva $(if ($h2Bd -eq $hBd) { 'IDENTICA' } else { '*** CAMBIO ***' }) | sandbox borrado: $(-not (Test-Path $R))"
