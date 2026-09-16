# Arranques ELECTRON REALES del Bloque 4, en sandbox aislado.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
$ErrorActionPreference = 'Stop'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run\b4.js"
$B4   = "$sb\bloque4"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'

$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$prodAntes = (Get-FileHash $prodDb -Algorithm SHA256).Hash
$gAntes = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force -ErrorAction SilentlyContinue | Measure-Object).Count

$S = "$B4\sandbox"
Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
$UD  = "$S\Roaming\panorama-app"
$ACC = "$UD\.panorama-acciones"

$script:lineasTest = 0
$script:lineasApp  = 0
function Arrancar($modo, $segundos) {
  if ($S -notlike '*bloque4\sandbox*') { throw "sandbox inesperado: $S" }
  $tl = "$S\test.log"; $al = "$UD\app.log"
  $script:lineasTest = if (Test-Path $tl) { @(Get-Content $tl).Count } else { 0 }
  $script:lineasApp  = if (Test-Path $al) { @(Get-Content $al).Count } else { 0 }
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S","--modo=$modo" -PassThru -WindowStyle Minimized
  $mio = $p.Id
  $t0 = Get-Date
  while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $segundos) { Start-Sleep -Milliseconds 500 }
  if (-not $p.HasExited) { & taskkill.exe /PID $mio /T /F 2>&1 | Out-Null }
  Start-Sleep -Seconds 2
  try { if (Get-Process -Id $mio -ErrorAction SilentlyContinue) { & taskkill.exe /PID $mio /T /F 2>&1 | Out-Null } } catch {}
}
function TramoTest() {
  $tl = "$S\test.log"; if (-not (Test-Path $tl)) { return @() }
  $t = @(Get-Content $tl -Encoding UTF8); if ($t.Count -le $script:lineasTest) { return @() }
  return $t[$script:lineasTest..($t.Count - 1)]
}
function TramoApp() {
  $al = "$UD\app.log"; if (-not (Test-Path $al)) { return @() }
  $t = @(Get-Content $al -Encoding UTF8); if ($t.Count -le $script:lineasApp) { return @() }
  return $t[$script:lineasApp..($t.Count - 1)]
}
function Mostrar($titulo) {
  Write-Output ""
  Write-Output "--- $titulo ---"
  $tramo = TramoTest
  if ($tramo.Count -eq 0) { Write-Output "    (sin lineas de prueba)" } else { $tramo | ForEach-Object { "  $_" } }
}
function FotoAcc() {
  if (-not (Test-Path $ACC)) { return "(no existe)" }
  (Get-ChildItem $ACC -Force | Sort-Object Name | ForEach-Object { "$($_.Name)=$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.Substring(0,12))" }) -join ' | '
}

# ==========================================================================
Write-Output "=== 1) GUARDADOS REALES (launcher + dashboard + reunion + candidatos) ==="
Arrancar 'guardados' 70
Mostrar "resultados"

# ==========================================================================
Write-Output ""
Write-Output "=== 2) CIERRE Y REAPERTURA: los datos siguen ahi ==="
Arrancar 'reabrir' 45
Mostrar "resultados"

# ==========================================================================
Write-Output ""
Write-Output "=== 3) RECUPERACION REAL DE UN JOURNAL DE ACCION AL ARRANCAR ==="
# Se planta a mano el estado "publicado pero sin confirmar" sobre estado.json.
$pid1 = [int](Get-Content "$S\pid.txt")
$h = Get-Content "$S\huellas.json" -Raw | ConvertFrom-Json
$destino = "$UD\backups\$($h.backupDir)\evaluacion-candidatos\estado.json"
$original = [System.IO.File]::ReadAllText($destino, (New-Object System.Text.UTF8Encoding $false))
# SIN BOM: con BOM la comparacion byte a byte del test fallaria por el propio
# arnes, no por la recuperacion.
[System.IO.File]::WriteAllText("$S\esperado.txt", $original, (New-Object System.Text.UTF8Encoding $false))
$nuevo = '{"puestos":[],"evaluaciones":[],"marca":"PUBLICADO-SIN-CONFIRMAR"}'

# writer y base_commit_id REALES, escritos por la propia app en huellas.json
$writer = $h.writer
$commit = $h.commit
if (-not $writer -or -not $commit) { throw "no se pudieron leer writer/commit de huellas.json" }
Write-Output "  writer del sandbox:   $writer"
Write-Output "  base_commit_id real:  $commit"

$actionId = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
$shaOrig = & { $sha=[System.Security.Cryptography.SHA256]::Create(); ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($original)) | ForEach-Object { $_.ToString('x2') }) -join '' }
$shaNuevo = & { $sha=[System.Security.Cryptography.SHA256]::Create(); ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($nuevo)) | ForEach-Object { $_.ToString('x2') }) -join '' }

# se aparta el original y se publica el nuevo, como habria quedado un corte
[System.IO.File]::Move($destino, "$destino.old-$actionId")
[System.IO.File]::WriteAllText($destino, $nuevo, (New-Object System.Text.UTF8Encoding $false))
New-Item -ItemType Directory -Force -Path $ACC | Out-Null
$j = @{
  v = 1; action_id = $actionId; writer = $writer; tipo = 'candidate-eval'
  base_commit_id = $commit; cifrado = 0; destino = $destino; modo = 'overwrite'
  original_sha256 = $shaOrig; original_size = [System.Text.Encoding]::UTF8.GetByteCount($original)
  new_sha256 = $shaNuevo; new_size = [System.Text.Encoding]::UTF8.GetByteCount($nuevo)
  fase = 'publicando'; startedAt = '2026-09-14T00:00:00Z'
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText("$ACC\$actionId.json", $j, (New-Object System.Text.UTF8Encoding $false))
Write-Output "  estado plantado: destino publicado + .old + journal"

Arrancar 'recovery-ok' 50
Mostrar "resultados"
Write-Output "  journals tras el arranque: $(FotoAcc)"

# ==========================================================================
Write-Output ""
Write-Output "=== 4) PS-2006: un journal NO demostrable corta el arranque ==="
$aid2 = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
New-Item -ItemType Directory -Force -Path $ACC | Out-Null
$j2 = @{
  v = 1; action_id = $aid2; writer = $writer; tipo = 'candidate-eval'
  base_commit_id = $commit; cifrado = 0; destino = $destino; modo = 'overwrite'
  original_sha256 = ('a' * 64); original_size = 10
  new_sha256 = ('b' * 64); new_size = 10
  fase = 'publicando'; startedAt = '2026-09-14T00:00:00Z'
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText("$ACC\$aid2.json", $j2, (New-Object System.Text.UTF8Encoding $false))
$fotoAntes = FotoAcc
$shaDestAntes = (Get-FileHash $destino -Algorithm SHA256).Hash
$shaDbAntes = (Get-FileHash "$UD\panorama.sqlite3" -Algorithm SHA256).Hash
Write-Output "  journal no demostrable plantado: $fotoAntes"

Arrancar 'guardados' 40
$appTramo = TramoApp
Write-Output "  ESTE arranque registro PS-2006: $([bool](@($appTramo | Where-Object { $_ -match 'PS-2006' }).Count -gt 0))"
Write-Output "  NO llego a abrir el launcher:   $(-not [bool](@(TramoTest | Where-Object { $_ -match 'LAUNCHER real abre' }).Count -gt 0))"
Write-Output "  journals INTACTOS:             $($fotoAntes -eq (FotoAcc))"
Write-Output "  destino INTACTO:               $($shaDestAntes -eq (Get-FileHash $destino -Algorithm SHA256).Hash)"
Write-Output "  base de datos INTACTA:         $($shaDbAntes -eq (Get-FileHash "$UD\panorama.sqlite3" -Algorithm SHA256).Hash)"
$appTramo | Where-Object { $_ -match 'PS-2006|Accion' } | Select-Object -Last 4 | ForEach-Object { "    $_" }

# ==========================================================================
$prodDespues = (Get-FileHash $prodDb -Algorithm SHA256).Hash
$gDespues = (Get-ChildItem 'G:\Mi unidad\BD-PanoramaServicio' -Force -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output ""
Write-Output "PRODUCCION INTACTA: $($prodAntes -eq $prodDespues)   ($prodAntes)"
Write-Output "CARPETA COMPARTIDA: $gAntes -> $gDespues entradas (nunca referenciada por estas pruebas)"
Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
